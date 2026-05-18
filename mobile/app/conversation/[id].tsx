/**
 * Conversation thread — full message history + composer.
 *
 * Architecture mirrors liketu's chat-conversation-screen.tsx (heavily
 * pared down — voice, image, transfers, red packets, atlas cards, and
 * realtime are all deferred for shinsa MVP):
 *
 *  - Server marks the conversation read on /conversations/:id (no `before`),
 *    so just opening the screen clears the unread badge
 *  - Optimistic message insert on send: bubble appears immediately with
 *    a temp id, then the server's authoritative message replaces it
 *  - Background polling (8s) keeps the thread fresh while open
 *  - Inverted FlatList-style layout: newest message at the bottom; we
 *    render via ScrollView for simplicity (counts are typically <100/page)
 *  - Local `draft` state per mount; liketu persists draft to a Zustand
 *    store keyed by conversationId — defer that until users complain
 *
 * Embed types (session_share, challenge_card, link_share, list_share)
 * render as a simple labeled chip rather than crashing or hiding —
 * the renderers can come later.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import {
  getChatThemePalette,
  type ChatThemeKey,
  type ChatThemePalette,
} from '@/components/messages/chat-themes';
import { MessageActionSheet, type MessageActionTarget } from '@/components/messages/message-action-sheet';
import { MessageEmbed } from '@/components/messages/message-embed';
import { ReactionBar } from '@/components/messages/message-reactions';
import { SquadManagementSheet } from '@/components/messages/squad-management-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useTypingIndicator } from '@/hooks/use-typing-indicator';
import { messagesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import {
  getConversationQueryKey,
  getMessagesInboxQueryKey,
  INITIAL_MESSAGE_LIMIT,
  THREAD_REFETCH_INTERVAL_MS,
} from '@/lib/messagesQueries';
import type { ThemeColors } from '@/constants/theme';
import type {
  ConversationDetailResponse,
  ConversationMessage,
  ConversationSummary,
  ConversationsResponse,
} from '@shared/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTimestamp(iso: string | undefined | null): string {
  if (!iso) return '';
  const raw = String(iso).trim();
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZ = /(z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const t = new Date(withZ);
  if (Number.isNaN(t.getTime())) return '';
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const now = new Date();
  if (sameDay(t, now)) return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(t, yesterday)) return `Yesterday · ${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const days = Math.floor((now.getTime() - t.getTime()) / 86_400_000);
  if (days < 7) return t.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Group consecutive messages from the same sender within a small time window
 *  so we can hide repeated avatars/usernames and tighten spacing — same
 *  pattern as liketu's chat-conversation-screen, and most modern chat UIs. */
const GROUP_WINDOW_MS = 5 * 60_000;
interface GroupedMessage extends ConversationMessage {
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  showTimestamp: boolean;
}
function groupMessages(messages: ConversationMessage[]): GroupedMessage[] {
  const out: GroupedMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;
    const samePrev = prev
      && prev.sender.id === m.sender.id
      && (Date.parse(m.created_at) - Date.parse(prev.created_at)) < GROUP_WINDOW_MS;
    const sameNext = next
      && next.sender.id === m.sender.id
      && (Date.parse(next.created_at) - Date.parse(m.created_at)) < GROUP_WINDOW_MS;
    const farFromPrev = !prev
      || (Date.parse(m.created_at) - Date.parse(prev.created_at)) > GROUP_WINDOW_MS;
    out.push({
      ...m,
      isFirstOfGroup: !samePrev,
      isLastOfGroup: !sameNext,
      // Show a timestamp divider when we cross the group window.
      showTimestamp: farFromPrev,
    });
  }
  return out;
}


// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = String(params.id || '');
  return <ConversationView conversationId={conversationId} />;
}

/**
 * Reusable conversation thread body. The route screen above is a thin
 * wrapper around this; messages.tsx renders it inline in the center pane
 * on desktop so the inbox stays visible (Slack/Linear layout).
 *
 * Pass `embedded` when rendering inside messages.tsx so the navigation
 * Stack.Screen header is suppressed (the messages route owns its own
 * header) and `onClose` is wired to clear the parent's selection rather
 * than calling `router.back()`.
 */
export function ConversationView({
  conversationId,
  embedded = false,
  onClose,
}: {
  conversationId: string;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const threadActive = embedded || isFocused;
  const scrollRef = useRef<ScrollView | null>(null);
  const keyboardHeight = useKeyboardHeight();
  const keyboardGap = Platform.OS === 'ios' ? keyboardHeight : 0;
  const composerBottomPadding = keyboardHeight > 0 ? 8 : insets.bottom + 8;

  // Local composer state. liketu persists this to a Zustand store keyed
  // by conversationId so navigating away doesn't lose your typing — we
  // can add that later if users complain.
  const [draft, setDraft] = useState('');
  // Tracks scrollTop so we don't auto-scroll the user back to the bottom
  // while they're reading older messages.
  const isNearBottomRef = useRef(true);
  const didInitialPinRef = useRef(false);
  // Long-press target (drives the bottom action sheet).
  const [actionTarget, setActionTarget] = useState<MessageActionTarget | null>(null);
  // Squad-management sheet (squads only).
  const [squadOpen, setSquadOpen] = useState(false);
  // Typing indicator: poll partner's typing flag + throttle emits when the
  // viewer types into the composer.
  const { typingUsers, emitTyping } = useTypingIndicator(conversationId, user?.id, !!user?.id && threadActive);

  const threadKey = getConversationQueryKey(conversationId);
  const query = useQuery({
    queryKey: threadKey,
    queryFn: () => messagesApi.conversation(conversationId, { limit: INITIAL_MESSAGE_LIMIT }),
    enabled: !!conversationId && !!user?.id,
    staleTime: 10_000,
    refetchInterval: threadActive ? THREAD_REFETCH_INTERVAL_MS : false,
    refetchOnReconnect: true,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
  });

  // Once the thread loads (which marks read server-side), zero the inbox row's
  // unread count so the badge clears immediately when the user navigates back.
  useEffect(() => {
    if (!query.data?.conversation || !user?.id) return;
    const inboxKey = getMessagesInboxQueryKey(user.id);
    queryClient.setQueryData<ConversationsResponse>(inboxKey, (prev) => prev ? {
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c,
      ),
    } : prev);
  }, [query.data?.conversation, conversationId, user?.id, queryClient]);

  const messages = useMemo(
    () => groupMessages(query.data?.messages ?? []),
    [query.data?.messages],
  );

  const sendMutation = useMutation({
    mutationFn: (content: string) => messagesApi.sendMessage(conversationId, { content }),
    // Optimistic insert: render the bubble before the network call resolves.
    onMutate: async (content: string) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const prev = queryClient.getQueryData<ConversationDetailResponse>(threadKey);
      if (prev && user) {
        const tempMessage: ConversationMessage = {
          id: `optimistic-${Date.now()}`,
          conversation_id: conversationId,
          message_type: 'text',
          content,
          created_at: new Date().toISOString(),
          is_unsent: false,
          is_own: true,
          sender: { id: user.id, username: user.username, avatar: user.avatar },
          reactions: [],
          viewer_reaction: '',
        };
        queryClient.setQueryData<ConversationDetailResponse>(threadKey, {
          ...prev,
          messages: [...prev.messages, tempMessage],
        });
      }
      return { prev };
    },
    onError: (_err, _content, ctx) => {
      // Roll back on failure so the optimistic bubble disappears and the
      // user can retry.
      if (ctx?.prev) queryClient.setQueryData(threadKey, ctx.prev);
    },
    onSuccess: () => {
      // Refetch thread to swap in the server's authoritative message id +
      // any back-end-applied normalization (e.g. trimmed whitespace).
      void queryClient.invalidateQueries({ queryKey: threadKey });
      // Also refetch inbox so the row's last-message preview updates.
      void queryClient.invalidateQueries({ queryKey: getMessagesInboxQueryKey(user?.id) });
    },
  });

  // Toggle a reaction. Server is single-reaction-per-user-per-message —
  // sending the viewer's existing reaction clears it; sending a different
  // key replaces it. Patch the cache optimistically so the chip
  // highlights/de-highlights immediately.
  const reactMutation = useMutation({
    mutationFn: (vars: { messageId: string; key: string }) =>
      messagesApi.setReaction(conversationId, vars.messageId, vars.key),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const prev = queryClient.getQueryData<ConversationDetailResponse>(threadKey);
      if (!prev) return { prev };
      queryClient.setQueryData<ConversationDetailResponse>(threadKey, {
        ...prev,
        messages: prev.messages.map((m) => {
          if (m.id !== vars.messageId) return m;
          const wasMine = m.viewer_reaction === vars.key;
          // Decrement the prior reaction; increment the new one.
          const without = m.reactions.filter((r) => r.key !== (m.viewer_reaction || ''))
            .map((r) => r.key === (m.viewer_reaction || '')
              ? { ...r, count: Math.max(0, r.count - 1) }
              : r)
            .filter((r) => r.count > 0);
          const decremented = m.viewer_reaction && m.viewer_reaction !== vars.key
            ? without.map((r) => r) // already removed above
            : without;
          if (wasMine) {
            // toggle off
            return { ...m, viewer_reaction: '', reactions: decremented };
          }
          const idx = decremented.findIndex((r) => r.key === vars.key);
          const nextReactions = idx >= 0
            ? decremented.map((r, i) => i === idx ? { ...r, count: r.count + 1 } : r)
            : [...decremented, { key: vars.key, count: 1 }];
          nextReactions.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
          return { ...m, viewer_reaction: vars.key, reactions: nextReactions };
        }),
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(threadKey, ctx.prev);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
    },
  });

  // Unsend (soft-delete) a message I sent. Server marks deleted_at and
  // strips body/embeds; the row stays in place rendered as "Message unsent".
  const unsendMutation = useMutation({
    mutationFn: (messageId: string) => messagesApi.unsendMessage(conversationId, messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const prev = queryClient.getQueryData<ConversationDetailResponse>(threadKey);
      if (!prev) return { prev };
      queryClient.setQueryData<ConversationDetailResponse>(threadKey, {
        ...prev,
        messages: prev.messages.map((m) => m.id === messageId
          ? { ...m, is_unsent: true, content: '', message_type: 'unsent', share: null, link_share: null, challenge_card: null, list_share: null, note_thread: null, reactions: [], viewer_reaction: '' }
          : m),
      });
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(threadKey, ctx.prev);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
      void queryClient.invalidateQueries({ queryKey: getMessagesInboxQueryKey(user?.id) });
    },
  });

  const conversation: ConversationSummary | null = query.data?.conversation ?? null;
  const headerTitle = conversation?.title || 'Conversation';
  const headerSubtitle = conversation?.kind === 'squad'
    ? `${conversation?.member_count ?? 1} members`
    : conversation?.partner?.skill_title || 'Direct message';
  const headerAvatar = conversation
    ? (conversation.kind === 'squad'
      ? fullImageUrl(conversation.avatar)
      : fullImageUrl(conversation.partner?.avatar))
    : undefined;

  // Resolve the per-conversation chat theme palette. Defaults pick up the
  // app theme (so the "Default" chat theme always blends in light/dark).
  const themeKey = (conversation?.theme as ChatThemeKey) || '';
  const chatTheme: ChatThemePalette = useMemo(
    () => getChatThemePalette(themeKey, theme),
    [themeKey, theme],
  );

  useEffect(() => {
    isNearBottomRef.current = true;
    didInitialPinRef.current = false;
  }, [conversationId]);

  const pinToBottom = useCallback((animated = false) => {
    scrollRef.current?.scrollToEnd({ animated });
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
  }, []);

  // Scroll to bottom when the thread first loads, or when new content lands
  // while the user is already near the bottom. The scheduled re-pin catches
  // late layout changes from embeds, reaction wrapping, composer height, and
  // the soft keyboard.
  useEffect(() => {
    if (!messages.length) return;
    if (!didInitialPinRef.current || isNearBottomRef.current) {
      pinToBottom(false);
      didInitialPinRef.current = true;
    }
  }, [messages.length, pinToBottom]);

  useEffect(() => {
    if (keyboardHeight > 0 && messages.length > 0) {
      isNearBottomRef.current = true;
      pinToBottom(false);
    }
  }, [keyboardHeight, messages.length, pinToBottom]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || sendMutation.isPending) return;
    setDraft('');
    isNearBottomRef.current = true;
    sendMutation.mutate(text);
  };

  return (
    <View style={[s.container, { backgroundColor: chatTheme.viewportBg }]}>
      {!embedded ? (
        <Stack.Screen
          options={{
            headerShown: true,
            // Custom title block in the navigation header so we can show the
            // partner avatar + a subtitle (member count / skill title).
            headerTitle: () => (
              <Pressable
                disabled={!conversation?.partner?.user_id && conversation?.kind !== 'squad'}
                onPress={() => {
                  if (conversation?.kind === 'squad') {
                    setSquadOpen(true);
                    return;
                  }
                  if (conversation?.partner?.user_id) {
                    router.push({ pathname: '/profile/[id]', params: { id: conversation.partner.user_id } });
                  }
                }}
                style={({ pressed }) => [
                  s.headerInner,
                  pressed && (conversation?.partner?.user_id || conversation?.kind === 'squad') && { opacity: 0.7 },
                ]}>
                {headerAvatar ? (
                  <Image source={{ uri: headerAvatar }} style={s.headerAvatar} contentFit="cover" />
                ) : (
                  <DefaultAvatar size={32} />
                )}
                <View style={{ minWidth: 0 }}>
                  <Text style={s.headerTitle} numberOfLines={1}>{headerTitle}</Text>
                  <Text style={s.headerSubtitle} numberOfLines={1}>{headerSubtitle}</Text>
                </View>
              </Pressable>
            ),
            // Right-side info button to open the squad management sheet.
            headerRight: conversation?.kind === 'squad'
              ? () => (
                  <Pressable
                    onPress={() => setSquadOpen(true)}
                    hitSlop={8}
                    style={({ pressed }) => [{ paddingHorizontal: 8 }, pressed && { opacity: 0.7 }]}>
                    <IconSymbol name="info.circle" size={22} color={theme.text} />
                  </Pressable>
                )
              : undefined,
            headerBackTitle: 'Messages',
          }}
        />
      ) : (
        /* Embedded mode renders its own inline header — the parent route
           (messages.tsx desktop) owns the navigation chrome. */
        <View style={s.embeddedHeader}>
          <Pressable
            disabled={!conversation?.partner?.user_id && conversation?.kind !== 'squad'}
            onPress={() => {
              if (conversation?.kind === 'squad') { setSquadOpen(true); return; }
              if (conversation?.partner?.user_id) {
                router.push({ pathname: '/profile/[id]', params: { id: conversation.partner.user_id } });
              }
            }}
            style={({ pressed }) => [s.headerInner, pressed && { opacity: 0.7 }]}>
            {headerAvatar ? (
              <Image source={{ uri: headerAvatar }} style={s.headerAvatar} contentFit="cover" />
            ) : (
              <DefaultAvatar size={32} />
            )}
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={s.headerTitle} numberOfLines={1}>{headerTitle}</Text>
              <Text style={s.headerSubtitle} numberOfLines={1}>{headerSubtitle}</Text>
            </View>
          </Pressable>
          {conversation?.kind === 'squad' ? (
            <Pressable
              onPress={() => setSquadOpen(true)}
              hitSlop={8}
              style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.7 }]}>
              <IconSymbol name="info.circle" size={20} color={theme.text} />
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={{ flex: 1 }}>
        {query.isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        ) : query.isError ? (
          <View style={s.errorCard}>
            <Text style={s.errorText}>
              {query.error instanceof Error ? query.error.message : 'Failed to load conversation'}
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[s.thread, { paddingTop: 8 }]}
            onLayout={() => {
              if (!didInitialPinRef.current || isNearBottomRef.current) {
                pinToBottom(false);
              }
            }}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
              isNearBottomRef.current = distanceFromBottom < 60;
            }}
            // Re-pin to the bottom whenever content height changes — fires
            // when messages first lay out, when reactions wrap to a new
            // line, when images inside bubbles load, etc. Without this,
            // the initial scrollToEnd in the effect above races layout and
            // the latest message ends up partially under the composer.
            onContentSizeChange={() => {
              if (!didInitialPinRef.current || isNearBottomRef.current) {
                pinToBottom(false);
                didInitialPinRef.current = true;
              }
            }}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={120}>
            {messages.length === 0 ? (
              <View style={s.emptyThread}>
                <Text style={s.emptyEmoji}>💬</Text>
                <Text style={s.emptyTitle}>No messages yet</Text>
                <Text style={s.emptyBody}>Send the first one below.</Text>
              </View>
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isSquad={conversation?.kind === 'squad'}
                  chatTheme={chatTheme}
                  onLongPress={() => setActionTarget({
                    messageId: m.id,
                    own: m.is_own,
                    body: m.content || '',
                    viewerReaction: m.viewer_reaction,
                  })}
                  onReactionToggle={(key) => reactMutation.mutate({ messageId: m.id, key })}
                />
              ))
            )}
          </ScrollView>
        )}

        {/* Typing indicator — sits just above the composer */}
        {typingUsers.length > 0 ? (
          <View style={s.typingRow}>
            <View style={s.typingDots}>
              <Text style={s.typingDot}>●</Text>
              <Text style={s.typingDot}>●</Text>
              <Text style={s.typingDot}>●</Text>
            </View>
            <Text style={s.typingText} numberOfLines={1}>
              {typingUsers.length === 1
                ? `${typingUsers[0].username} is typing…`
                : `${typingUsers.length} people are typing…`}
            </Text>
          </View>
        ) : null}

        {/* Composer — single-line. Multi-line auto-grow caused the
            placeholder text + the wrapping textarea to render at 2+ lines
            of height even when empty (RN Web textareas default to multiple
            rows). Fixed-height input keeps the placeholder vertically
            centered with the send button. */}
        {sendMutation.isError ? (
          <View style={s.sendError}>
            <Text style={s.sendErrorText}>
              {sendMutation.error instanceof Error ? sendMutation.error.message : 'Failed to send'}
            </Text>
          </View>
        ) : null}

        <View
          onLayout={() => {
            if (isNearBottomRef.current) pinToBottom(false);
          }}
          style={[s.composer, { paddingBottom: composerBottomPadding, marginBottom: keyboardGap }]}>
          <TextInput
            style={s.input}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              // Throttled inside the hook — safe to call on every keystroke.
              if (value.length > 0) emitTyping();
            }}
            placeholder="Message…"
            placeholderTextColor={theme.textDim}
            maxLength={4000}
            editable={!sendMutation.isPending}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || sendMutation.isPending}
            style={({ pressed }) => [
              s.sendBtn,
              (!draft.trim() || sendMutation.isPending) && { opacity: 0.4 },
              pressed && draft.trim() && { opacity: 0.85 },
            ]}>
            {sendMutation.isPending ? (
              <ActivityIndicator color={theme.bg} size="small" />
            ) : (
              <IconSymbol name="paperplane.fill" size={16} color={theme.bg} />
            )}
          </Pressable>
        </View>
      </View>

      <MessageActionSheet
        target={actionTarget}
        onClose={() => setActionTarget(null)}
        onReact={(messageId, key) => reactMutation.mutate({ messageId, key })}
        onUnsend={(messageId) => unsendMutation.mutate(messageId)}
      />

      {conversation?.kind === 'squad' ? (
        <SquadManagementSheet
          conversationId={conversationId}
          visible={squadOpen}
          onClose={() => setSquadOpen(false)}
          viewerId={user?.id || ''}
          onLeft={() => (embedded && onClose ? onClose() : router.back())}
          messages={query.data?.messages ?? []}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------
function MessageBubble({
  message,
  isSquad,
  chatTheme,
  onLongPress,
  onReactionToggle,
}: {
  message: GroupedMessage;
  isSquad: boolean;
  chatTheme: ChatThemePalette;
  onLongPress: () => void;
  onReactionToggle: (key: string) => void;
}) {
  const s = useThemedStyles(makeBubbleStyles);
  const own = message.is_own;
  const isUnsent = message.is_unsent;
  const hasEmbed = !isUnsent && message.message_type !== 'text' && !!(
    message.share || message.challenge_card || message.link_share || message.list_share || message.note_thread
  );
  const senderAvatar = message.sender.avatar ? fullImageUrl(message.sender.avatar) : undefined;
  const hasContent = !isUnsent && !!message.content;

  // Per-theme bubble colors. Falls back to the StyleSheet defaults when the
  // theme matches Default (own bubble = accent, other = card).
  const bubbleStyle = own
    ? { backgroundColor: chatTheme.ownBubbleBg, borderColor: chatTheme.bubbleBorder || 'transparent' }
    : { backgroundColor: chatTheme.otherBubbleBg, borderColor: chatTheme.bubbleBorder || 'transparent' };
  const bubbleTextColor = own ? chatTheme.ownBubbleText : chatTheme.otherBubbleText;

  return (
    <View>
      {message.showTimestamp ? (
        <Text style={s.timestamp}>{formatTimestamp(message.created_at)}</Text>
      ) : null}

      <View style={[s.row, own && s.rowOwn]}>
        {/* Avatar gutter — only on the last message of the partner's group */}
        {!own ? (
          <View style={s.avatarGutter}>
            {message.isLastOfGroup ? (
              senderAvatar ? (
                <Image source={{ uri: senderAvatar }} style={s.avatar} contentFit="cover" />
              ) : (
                <DefaultAvatar size={28} />
              )
            ) : null}
          </View>
        ) : null}

        <View style={[s.bubbleColumn, own && s.bubbleColumnOwn]}>
          {/* Squad sender label on the partner's first bubble of a group */}
          {!own && isSquad && message.isFirstOfGroup && message.sender.username ? (
            <Text style={s.senderLabel}>{message.sender.username}</Text>
          ) : null}

          <Pressable
            onLongPress={isUnsent ? undefined : onLongPress}
            delayLongPress={280}
            style={[
              s.bubble,
              own ? s.bubbleOwn : s.bubbleOther,
              bubbleStyle,
              isUnsent && s.bubbleUnsent,
              hasEmbed && s.bubbleEmbed,
            ]}>
            {isUnsent ? (
              <Text style={s.unsentText}>Message unsent</Text>
            ) : hasEmbed ? (
              <View style={{ gap: 6 }}>
                <MessageEmbed message={message} own={own} />
                {hasContent ? (
                  <Text style={[s.bubbleText, { color: bubbleTextColor }]}>{message.content}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={[s.bubbleText, { color: bubbleTextColor }, chatTheme.monospace && s.bubbleTextMono]}>
                {message.content}
              </Text>
            )}
          </Pressable>

          {!isUnsent ? (
            <ReactionBar
              reactions={message.reactions}
              viewerReaction={message.viewer_reaction}
              own={own}
              onToggle={onReactionToggle}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  headerInner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, maxWidth: 240 },
  embeddedHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    backgroundColor: t.surface,
  },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceMuted },
  headerTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  headerSubtitle: { fontSize: 10, color: t.textMuted, fontWeight: '700' as const },

  center: { padding: 32, alignItems: 'center' as const, flex: 1, justifyContent: 'center' as const },
  errorCard: { backgroundColor: t.dangerBg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: t.dangerBorder, margin: 12 },
  errorText: { color: t.danger, fontSize: 13 },

  // Generous bottom padding so the most-recent bubble has breathing
  // room from the composer's top edge — the previous 12 px made the
  // latest message look like it was being squeezed by the input row.
  thread: { paddingHorizontal: 8, paddingBottom: 28, gap: 1 },
  emptyThread: { padding: 40, alignItems: 'center' as const, gap: 8 },
  emptyEmoji: { fontSize: 28 },
  emptyTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  emptyBody: { fontSize: 12, color: t.textMuted },

  composer: {
    flexDirection: 'row' as const,
    // 'center' vertically aligns the input text + placeholder with the
    // send button. Was 'flex-end' which only worked when the input was
    // the same height as the button — flaky as soon as paddings changed.
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    backgroundColor: t.surface,
  },
  input: {
    flex: 1,
    // Fixed height matches the send button so the row stays balanced and
    // the placeholder text sits dead-center with the button icon.
    height: 38,
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 19,
    paddingHorizontal: 14,
    // No vertical padding — the height + lineHeight do the centering.
    paddingVertical: 0,
    fontSize: 14,
    lineHeight: 18,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendError: { paddingHorizontal: 12, paddingTop: 4, backgroundColor: t.dangerBg },
  sendErrorText: { color: t.danger, fontSize: 11 },

  // Typing indicator row above the composer
  typingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: t.surface,
  },
  typingDots: { flexDirection: 'row' as const, gap: 2 },
  typingDot: { fontSize: 8, color: t.accent, opacity: 0.7 },
  typingText: { fontSize: 11, color: t.textMuted, fontStyle: 'italic' as const },
});

const makeBubbleStyles = (t: ThemeColors) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 6,
    paddingHorizontal: 4,
    marginVertical: 1,
  },
  rowOwn: { flexDirection: 'row-reverse' as const },
  avatarGutter: { width: 28, alignItems: 'center' as const, justifyContent: 'flex-end' as const },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },

  bubbleColumn: { flex: 1, alignItems: 'flex-start' as const, maxWidth: '78%' as const },
  bubbleColumnOwn: { alignItems: 'flex-end' as const },

  senderLabel: { fontSize: 10, color: t.textMuted, fontWeight: '800' as const, marginBottom: 2, marginLeft: 12, letterSpacing: 0.3 },

  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, maxWidth: '100%' as const },
  bubbleOwn: { backgroundColor: t.accent, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: t.card, borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  bubbleUnsent: { opacity: 0.6 },
  // Tighter padding around embeds so the embed card's own border is the
  // visual edge.
  bubbleEmbed: { paddingHorizontal: 6, paddingVertical: 6 },

  bubbleText: { fontSize: 14, color: t.text, lineHeight: 19 },
  bubbleTextOwn: { color: t.bg, fontWeight: '600' as const },
  // Used when the active chat theme requests monospace (e.g. CLI).
  bubbleTextMono: { fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }) },
  unsentText: { fontSize: 13, color: t.textDim, fontStyle: 'italic' as const },

  timestamp: { fontSize: 10, color: t.textDim, fontWeight: '700' as const, textAlign: 'center' as const, marginTop: 12, marginBottom: 4 },
});

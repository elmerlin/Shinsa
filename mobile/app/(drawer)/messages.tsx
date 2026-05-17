/**
 * Messages inbox — list of conversations the viewer participates in.
 *
 * Architecture mirrors liketu's chat-screen.tsx:
 *  - React Query with centralized key factories (lib/messagesQueries)
 *  - Background polling while screen is focused (15s)
 *  - Optimistic unread clear on row tap; server confirms via mark-read
 *    when the thread loads
 *  - Prefetch the thread on press-in so the navigation animation lands
 *    on a warm cache (snappy)
 *
 * Deferred (not in MVP):
 *  - Stories/highlights strip across the top
 *  - Squad invite cards
 *  - Pin/archive toggle (server already returns `is_pinned`; we read but
 *    don't write yet)
 *  - Realtime via WebSocket (liketu uses one; shinsa polls)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ConversationView } from '@/app/conversation/[id]';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { TopBar } from '@/components/top-bar';
import { StoriesStrip } from '@/components/messages/stories-strip';
import { StoryViewer } from '@/components/messages/story-viewer';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { messagesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import {
  getMessagesInboxQueryKey,
  INBOX_REFETCH_INTERVAL_MS,
  prefetchConversationForIntent,
} from '@/lib/messagesQueries';
import type { ThemeColors } from '@/constants/theme';
import type { ConversationSummary, ConversationsResponse } from '@shared/api';

function relativeTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const raw = String(iso).trim();
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZ = /(z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const t = new Date(withZ).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Build a one-line preview for the row. Falls back to a short embed label
 *  when the last message is a non-text share. */
function previewLine(c: ConversationSummary, viewerId?: string): string {
  const last = c.last_message;
  if (!last) return c.kind === 'squad' ? 'No messages yet — say hi.' : 'Start the conversation.';
  const senderPrefix = last.sender_user_id && viewerId && last.sender_user_id === viewerId
    ? 'You: '
    : '';
  const text = last.preview || last.content || messagePlaceholder(last.message_type);
  return senderPrefix + text;
}

function messagePlaceholder(type: string): string {
  switch (type) {
    case 'session_share': return 'Shared a live session';
    case 'challenge_card': return 'Sent a challenge';
    case 'link_share': return 'Shared a link';
    case 'list_share': return 'Shared a song list';
    case 'unsent': return 'Message unsent';
    default: return 'Shared content';
  }
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();
  // Long-press target → opens the pin/mute action sheet.
  const [actionTarget, setActionTarget] = useState<ConversationSummary | null>(null);
  // Story viewer target — user_id whose story stack to show.
  const [storyUserId, setStoryUserId] = useState<string | null>(null);
  // Desktop: track the selected conversation via URL so back/forward + reload
  // survive. Clicking a row sets ?selected=; the center pane embeds the
  // thread. On mobile we still navigate to /conversation/[id].
  const params = useLocalSearchParams<{ selected?: string }>();
  const selectedId = typeof params.selected === 'string' ? params.selected : '';

  const inboxKey = getMessagesInboxQueryKey(user?.id);
  const query = useQuery({
    queryKey: inboxKey,
    queryFn: () => messagesApi.conversations(),
    enabled: !!user?.id,
    refetchInterval: INBOX_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  // Pin/unpin a conversation. Optimistically flip the flag in the inbox
  // cache so the row reorders instantly; server confirms.
  const pinMutation = useMutation({
    mutationFn: (vars: { id: string; pinned: boolean }) =>
      messagesApi.pinConversation(vars.id, vars.pinned),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: inboxKey });
      const prev = queryClient.getQueryData<ConversationsResponse>(inboxKey);
      if (!prev) return { prev };
      queryClient.setQueryData<ConversationsResponse>(inboxKey, {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === vars.id ? { ...c, is_pinned: vars.pinned } : c,
        ),
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(inboxKey, ctx.prev);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKey });
    },
  });

  const conversations = query.data?.conversations ?? [];
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const openConversation = (id: string) => {
    // Optimistically clear the unread badge so it doesn't blink back to
    // its old value while the thread query is in flight. Server confirms
    // the read state on /conversations/:id (no `before` cursor).
    queryClient.setQueryData<ConversationsResponse>(inboxKey, (prev) => prev ? {
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === id ? { ...c, unread_count: 0 } : c,
      ),
    } : prev);
    if (isDesktop) {
      // Stay on /messages and embed the thread in the center pane.
      router.setParams({ selected: id });
    } else {
      router.push({ pathname: '/conversation/[id]', params: { id } });
    }
  };

  if (!user) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <TopBar />
        </View>
        <View style={s.centered}>
          <Text style={s.emptyTitle}>Sign in to see your messages</Text>
        </View>
      </View>
    );
  }

  // Desktop renders the inbox as a 320 px left rail + an empty placeholder
  // for the conversation thread. Clicking a row navigates to the standalone
  // conversation route (which gets its own desktop layout in a follow-up).
  const inbox = (
    query.isLoading ? (
      <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
    ) : query.isError ? (
      <View style={s.errorCard}>
        <Text style={s.errorText}>
          {query.error instanceof Error ? query.error.message : 'Failed to load conversations'}
        </Text>
      </View>
    ) : conversations.length === 0 ? (
      <View style={s.emptyCard}>
        <Text style={s.emptyEmoji}>💬</Text>
        <Text style={s.emptyTitle}>No conversations yet</Text>
        <Text style={s.emptyBody}>
          Open a player&apos;s profile and tap Message to start a DM, or join a squad chat
          from the web for now.
        </Text>
      </View>
    ) : (
      <View style={{ gap: 4 }}>
        {conversations.map((c) => (
          <ConversationRow
            key={c.id}
            conversation={c}
            viewerId={user.id}
            active={isDesktop && c.id === selectedId}
            onPressIn={() => prefetchConversationForIntent({ queryClient, conversationId: c.id })}
            onPress={() => openConversation(c.id)}
            onLongPress={() => setActionTarget(c)}
          />
        ))}
      </View>
    )
  );

  if (isDesktop) {
    return (
      <View style={s.container}>
        <View style={s.deskRoot}>
          <View style={s.deskInbox}>
            <View style={s.deskInboxHead}>
              <Text style={s.deskInboxTitle}>Inbox</Text>
              {totalUnread > 0 ? (
                <View style={s.totalBadge}>
                  <Text style={s.totalBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
                </View>
              ) : null}
            </View>
            <ScrollView contentContainerStyle={s.deskInboxScroll}>{inbox}</ScrollView>
          </View>
          <View style={s.deskPane}>
            <View style={s.deskTopBar}>
              <TopBar />
            </View>
            {selectedId ? (
              <ConversationView
                conversationId={selectedId}
                embedded
                onClose={() => router.setParams({ selected: '' })}
              />
            ) : (
              <View style={s.deskEmpty}>
                <Text style={s.deskEmptyEmoji}>💬</Text>
                <Text style={s.deskEmptyTitle}>Pick a conversation</Text>
                <Text style={s.deskEmptyHint}>
                  Tap a conversation in the inbox to open the thread inline. The composer pins
                  to the bottom of the center column.
                </Text>
              </View>
            )}
          </View>
        </View>

        <StoryViewer userId={storyUserId} onClose={() => setStoryUserId(null)} />

        <Modal
          visible={!!actionTarget}
          transparent
          animationType="none"
          onRequestClose={() => setActionTarget(null)}>
          <Pressable style={s.actionBackdrop} onPress={() => setActionTarget(null)}>
            <Pressable
              style={[s.actionSheet, { paddingBottom: insets.bottom + 12 }]}
              onPress={(e) => e.stopPropagation()}>
              <View style={s.actionHandle} />
              {actionTarget ? (
                <>
                  <Text style={s.actionHeader} numberOfLines={1}>{actionTarget.title}</Text>
                  <Pressable
                    onPress={() => {
                      if (actionTarget) pinMutation.mutate({ id: actionTarget.id, pinned: !actionTarget.is_pinned });
                      setActionTarget(null);
                    }}
                    style={({ pressed }) => [s.actionItem, pressed && { opacity: 0.7 }]}>
                    <Text style={s.actionItemEmoji}>{actionTarget.is_pinned ? '📍' : '📌'}</Text>
                    <Text style={s.actionItemLabel}>
                      {actionTarget.is_pinned ? 'Unpin conversation' : 'Pin to top'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setActionTarget(null)}
                    style={({ pressed }) => [s.actionItem, pressed && { opacity: 0.7 }]}>
                    <Text style={s.actionItemEmoji}>✕</Text>
                    <Text style={[s.actionItemLabel, { color: theme.textMuted }]}>Cancel</Text>
                  </Pressable>
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar
          rightExtra={totalUnread > 0 ? (
            <View style={s.totalBadge}>
              <Text style={s.totalBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
            </View>
          ) : null}
        />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
            tintColor={theme.spinner}
          />
        }>
        {/* Stories strip — sits above the conversation list. */}
        <StoriesStrip onPickStory={setStoryUserId} />

        {inbox}
      </ScrollView>

      <StoryViewer userId={storyUserId} onClose={() => setStoryUserId(null)} />

      {/* Long-press action sheet — pin/unpin */}
      <Modal
        visible={!!actionTarget}
        transparent
        animationType="none"
        onRequestClose={() => setActionTarget(null)}>
        <Pressable style={s.actionBackdrop} onPress={() => setActionTarget(null)}>
          <Pressable
            style={[s.actionSheet, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={s.actionHandle} />
            {actionTarget ? (
              <>
                <Text style={s.actionHeader} numberOfLines={1}>{actionTarget.title}</Text>
                <Pressable
                  onPress={() => {
                    if (actionTarget) pinMutation.mutate({ id: actionTarget.id, pinned: !actionTarget.is_pinned });
                    setActionTarget(null);
                  }}
                  style={({ pressed }) => [s.actionItem, pressed && { opacity: 0.7 }]}>
                  <Text style={s.actionItemEmoji}>{actionTarget.is_pinned ? '📍' : '📌'}</Text>
                  <Text style={s.actionItemLabel}>
                    {actionTarget.is_pinned ? 'Unpin conversation' : 'Pin to top'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setActionTarget(null)}
                  style={({ pressed }) => [s.actionItem, pressed && { opacity: 0.7 }]}>
                  <Text style={s.actionItemEmoji}>✕</Text>
                  <Text style={[s.actionItemLabel, { color: theme.textMuted }]}>Cancel</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ConversationRow({
  conversation,
  viewerId,
  onPress,
  onPressIn,
  onLongPress,
  active = false,
}: {
  conversation: ConversationSummary;
  viewerId: string;
  onPress: () => void;
  onPressIn: () => void;
  onLongPress: () => void;
  /** Highlight the row as the currently-embedded thread (desktop). */
  active?: boolean;
}) {
  const s = useThemedStyles(makeRowStyles);
  const { theme } = useTheme();

  const avatarUrl = conversation.kind === 'squad'
    ? fullImageUrl(conversation.avatar)
    : conversation.partner?.avatar
      ? fullImageUrl(conversation.partner.avatar)
      : undefined;
  const isUnread = conversation.unread_count > 0;
  const time = relativeTime(conversation.last_message_at || conversation.created_at);
  const isSquad = conversation.kind === 'squad';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={({ pressed }) => [s.row, isUnread && s.rowUnread, active && s.rowActive, pressed && { opacity: 0.85 }]}>
      <View style={s.avatarWrap}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" />
        ) : (
          <DefaultAvatar size={48} />
        )}
        {isSquad ? (
          <View style={s.squadBadge}>
            <IconSymbol name="person.2.fill" size={9} color={theme.bg} />
          </View>
        ) : null}
      </View>

      <View style={s.body}>
        <View style={s.titleRow}>
          <Text
            style={[s.title, isUnread && s.titleUnread]}
            numberOfLines={1}>
            {conversation.title}
          </Text>
          {conversation.is_pinned ? (
            <Text style={s.pinIcon}>📌</Text>
          ) : null}
        </View>
        <Text
          style={[s.preview, isUnread && s.previewUnread]}
          numberOfLines={1}>
          {previewLine(conversation, viewerId)}
        </Text>
      </View>

      <View style={s.meta}>
        <Text style={[s.time, isUnread && s.timeUnread]}>{time}</Text>
        {isUnread ? (
          <View style={s.unreadDot}>
            <Text style={s.unreadDotText}>{conversation.unread_count > 9 ? '9+' : conversation.unread_count}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  heading: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 1 },
  totalBadge: {
    backgroundColor: t.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center' as const,
  },
  totalBadgeText: { color: t.bg, fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.2 },

  centered: { padding: 32, alignItems: 'center' as const, justifyContent: 'center' as const, flex: 1 },
  scroll: { paddingHorizontal: 8, gap: 4 },
  center: { padding: 32, alignItems: 'center' as const },

  errorCard: { backgroundColor: t.dangerBg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: t.dangerBorder, marginHorizontal: 4 },
  errorText: { color: t.danger, fontSize: 13 },

  emptyCard: {
    backgroundColor: t.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center' as const,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    marginTop: 32,
    marginHorizontal: 4,
  },
  emptyEmoji: { fontSize: 32, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '900' as const, color: t.text, textAlign: 'center' as const },
  emptyBody: { fontSize: 13, color: t.textMuted, textAlign: 'center' as const, lineHeight: 19 },

  // Long-press action sheet
  actionBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  actionSheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  actionHandle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 8 },
  actionHeader: { fontSize: 13, fontWeight: '900' as const, color: t.textMuted, paddingHorizontal: 14, paddingBottom: 8, textAlign: 'center' as const },
  actionItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionItemEmoji: { fontSize: 18, width: 24 },
  actionItemLabel: { fontSize: 15, fontWeight: '700' as const, color: t.text },

  // Desktop ("deskX") layout — inbox left rail + center pane.
  deskRoot: { flex: 1, flexDirection: 'row' as const },
  deskInbox: {
    width: 320,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border,
    backgroundColor: t.surface,
  },
  deskInboxHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  deskInboxTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text, letterSpacing: 0.4 },
  deskInboxScroll: { padding: 8, gap: 4 },
  deskPane: { flex: 1, backgroundColor: t.bg },
  deskTopBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  deskEmpty: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 40,
    gap: 8,
  },
  deskEmptyEmoji: { fontSize: 40, marginBottom: 4 },
  deskEmptyTitle: { fontSize: 18, fontWeight: '800' as const, color: t.text },
  deskEmptyHint: { fontSize: 13, color: t.textMuted, textAlign: 'center' as const, maxWidth: 360 },
});

const makeRowStyles = (t: ThemeColors) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  rowUnread: { backgroundColor: t.accentTint },
  // Embedded mode: highlight the row whose thread is open in the center pane.
  rowActive: { backgroundColor: t.surfaceMuted, borderWidth: 1, borderColor: t.accent },
  avatarWrap: { width: 48, height: 48, position: 'relative' as const },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: t.surfaceMuted },
  squadBadge: {
    position: 'absolute' as const,
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: t.bg,
  },

  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  title: { fontSize: 14, fontWeight: '700' as const, color: t.text },
  titleUnread: { fontWeight: '900' as const },
  pinIcon: { fontSize: 11 },
  preview: { fontSize: 12, color: t.textMuted },
  previewUnread: { color: t.text, fontWeight: '600' as const },

  meta: { alignItems: 'flex-end' as const, gap: 4, minWidth: 36 },
  time: { fontSize: 10, color: t.textDim, fontWeight: '700' as const, letterSpacing: 0.3 },
  timeUnread: { color: t.accent, fontWeight: '900' as const },
  unreadDot: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  unreadDotText: { color: t.bg, fontSize: 10, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
});

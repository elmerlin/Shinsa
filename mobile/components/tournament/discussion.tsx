import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { tournamentsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { DiscussionMessage } from '@shared/api';

function formatRelative(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Threaded tournament discussion. Top-level posts have inline replies and
 * pump counts. Mirrors TournamentDiscussion on desktop. Uses the existing
 * REST endpoints — SSE streaming is a desktop-only enhancement.
 */
export function TournamentDiscussion({ tournamentId }: { tournamentId: string }) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);

  const discussionQuery = useQuery({
    queryKey: ['tournament', tournamentId, 'discussion'],
    queryFn: () => tournamentsApi.discussion(tournamentId),
    refetchInterval: 30_000, // poll for fresh messages every 30s
  });

  const postMutation = useMutation({
    mutationFn: () => tournamentsApi.postDiscussion(tournamentId, draft.trim(), replyTo?.id ?? null),
    onSuccess: () => {
      setDraft('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'discussion'] });
    },
    onError: (err) => {
      Alert.alert('Post failed', err instanceof Error ? err.message : 'Try again.');
    },
  });

  const pumpMutation = useMutation({
    mutationFn: (messageId: string) => tournamentsApi.pumpDiscussion(tournamentId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'discussion'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => tournamentsApi.deleteDiscussion(tournamentId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'discussion'] });
    },
  });

  const threads = discussionQuery.data?.threads ?? [];

  return (
    <View style={s.section}>
      {/* Compose box up top — same pattern as the SOW detail screen so the
          interaction is consistent across the app. */}
      {user ? (
        <View style={s.composeCard}>
          {replyTo ? (
            <View style={s.replyingBanner}>
              <Text style={s.replyingText}>Replying to @{replyTo.username}</Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={6}>
                <Text style={s.replyingCancel}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={500}
            placeholder={replyTo ? 'Write a reply…' : 'Add to the discussion…'}
            placeholderTextColor={'#8a8a8a'}
            editable={!postMutation.isPending}
            style={s.composeInput}
          />
          <View style={s.composeActions}>
            <Text style={s.composeCounter}>{draft.length}/500</Text>
            <Pressable
              onPress={() => postMutation.mutate()}
              disabled={postMutation.isPending || draft.trim().length === 0}
              style={({ pressed }) => [
                s.composeBtn,
                (postMutation.isPending || draft.trim().length === 0) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}>
              {postMutation.isPending
                ? <ActivityIndicator size="small" color={theme.textOnAccent} />
                : <Text style={s.composeBtnText}>Post</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={s.signInHint}>Sign in to join the discussion.</Text>
      )}

      {discussionQuery.isLoading ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color={theme.spinner} />
        </View>
      ) : threads.length === 0 ? (
        <Text style={s.empty}>No messages yet. Be the first.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {threads.map((thread) => (
            <DiscussionThread
              key={thread.id}
              s={s}
              thread={thread}
              currentUserId={user?.id || null}
              onReply={(target) => setReplyTo(target)}
              onPump={(messageId) => pumpMutation.mutate(messageId)}
              onDelete={(messageId) => {
                Alert.alert(
                  'Delete this message?',
                  'This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(messageId) },
                  ],
                );
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function DiscussionThread({
  s,
  thread,
  currentUserId,
  onReply,
  onPump,
  onDelete,
}: {
  s: Styles;
  thread: DiscussionMessage;
  currentUserId: string | null;
  onReply: (target: { id: string; username: string }) => void;
  onPump: (messageId: string) => void;
  onDelete: (messageId: string) => void;
}) {
  return (
    <View style={s.threadBlock}>
      <DiscussionRow
        s={s}
        message={thread}
        currentUserId={currentUserId}
        onReply={() => onReply({ id: String(thread.id), username: thread.username || 'user' })}
        onPump={() => onPump(String(thread.id))}
        onDelete={() => onDelete(String(thread.id))}
      />
      {thread.replies && thread.replies.length > 0 ? (
        <View style={s.replyList}>
          {thread.replies.map((r) => (
            <DiscussionRow
              key={r.id}
              s={s}
              message={r}
              indent
              currentUserId={currentUserId}
              onReply={() => onReply({ id: String(thread.id), username: r.username || 'user' })}
              onPump={() => onPump(String(r.id))}
              onDelete={() => onDelete(String(r.id))}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DiscussionRow({
  s,
  message,
  indent,
  currentUserId,
  onReply,
  onPump,
  onDelete,
}: {
  s: Styles;
  message: DiscussionMessage;
  indent?: boolean;
  currentUserId: string | null;
  onReply: () => void;
  onPump: () => void;
  onDelete: () => void;
}) {
  const avatar = typeof message.avatar === 'string' && message.avatar ? fullImageUrl(message.avatar) : undefined;
  const isAuthor = currentUserId && String(message.user_id) === currentUserId;
  const initial = String(message.username || '?').charAt(0).toUpperCase();
  return (
    <View style={[s.messageRow, indent && s.messageRowIndent]}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.messageAvatar} contentFit="cover" />
      ) : (
        <View style={[s.messageAvatar, s.messageAvatarFallback]}>
          <Text style={s.messageAvatarLetter}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.messageMetaRow}>
          <Text style={s.messageUsername} numberOfLines={1}>
            @{message.username || 'anonymous'}
          </Text>
          {message.is_participant ? (
            <View style={s.participantPill}>
              <Text style={s.participantPillText}>Player</Text>
            </View>
          ) : null}
          <Text style={s.messageTime}>{formatRelative(message.created_at)}</Text>
        </View>
        <Text style={s.messageBody}>{message.message || ''}</Text>
        <View style={s.messageActionsRow}>
          <Pressable onPress={onPump} hitSlop={6} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.6 }]}>
            <Text style={[s.actionText, message.user_pumped && s.actionTextActive]}>
              ⚡ {message.pump_count || 0}
            </Text>
          </Pressable>
          {!indent ? (
            <Pressable onPress={onReply} hitSlop={6} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.6 }]}>
              <Text style={s.actionText}>
                Reply{message.reply_count ? ` (${message.reply_count})` : ''}
              </Text>
            </Pressable>
          ) : null}
          {isAuthor ? (
            <Pressable onPress={onDelete} hitSlop={6} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.6 }]}>
              <Text style={[s.actionText, s.actionTextDanger]}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  section: { gap: 12 },

  composeCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 8,
  },
  replyingBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  replyingText: { fontSize: 11, fontWeight: '700' as const, color: t.accent },
  replyingCancel: { fontSize: 11, fontWeight: '700' as const, color: t.textDim },
  composeInput: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    color: t.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    maxHeight: 140,
    textAlignVertical: 'top' as const,
  },
  composeActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  composeCounter: { fontSize: 10, color: t.textDim, fontVariant: ['tabular-nums' as const] },
  composeBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 64,
    alignItems: 'center' as const,
  },
  composeBtnText: { color: t.textOnAccent, fontSize: 12, fontWeight: '900' as const, letterSpacing: 0.5 },
  signInHint: { fontSize: 12, color: t.textDim, textAlign: 'center' as const, paddingVertical: 12 },
  empty: { fontSize: 12, color: t.textDim, textAlign: 'center' as const, paddingVertical: 24 },

  threadBlock: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  messageRow: { flexDirection: 'row' as const, gap: 10 },
  messageRowIndent: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: t.border,
    marginLeft: 18,
  },
  messageAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceMuted },
  messageAvatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.accentTint },
  messageAvatarLetter: { fontSize: 13, fontWeight: '900' as const, color: t.accent },
  messageMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  messageUsername: { fontSize: 12, fontWeight: '900' as const, color: t.text, flexShrink: 1 },
  participantPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: t.accentTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.accent,
  },
  participantPillText: { fontSize: 8, fontWeight: '900' as const, color: t.accent, letterSpacing: 0.4 },
  messageTime: { fontSize: 10, color: t.textDim },
  messageBody: { fontSize: 13, color: t.text, lineHeight: 18 },
  messageActionsRow: { flexDirection: 'row' as const, gap: 14, marginTop: 2 },
  actionBtn: {},
  actionText: { fontSize: 11, color: t.textDim, fontWeight: '700' as const },
  actionTextActive: { color: t.accent },
  actionTextDanger: { color: t.danger },
  replyList: {
    gap: 10,
    paddingTop: 4,
  },
});

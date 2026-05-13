/**
 * Score comments bottom sheet — opened from the score card sheet's
 * "Comments" action chip. Loads + posts comments scoped to a single play.
 *
 * Server backs this with /api/social/plays/:id/comments — same endpoints
 * that drive the web ScoreSnapshotModal's <ItemCommentSection/>.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Comment } from '@shared/api';

interface Props {
  /** play_id (number or string). Sheet stays closed when null. */
  playId: number | string | null;
  visible: boolean;
  onClose: () => void;
  /** Optional context line shown above the thread (e.g. song · grade · score). */
  contextLine?: string;
}

const PLAY_COMMENTS_QUERY_KEY = (playId: string) => ['play-comments', playId] as const;

function relTime(iso?: string): string {
  if (!iso) return '';
  const t = new Date(String(iso).includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  if (!Number.isFinite(t)) return '';
  const minutes = Math.floor((Date.now() - t) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ScoreCommentsSheet({ playId, visible, onClose, contextLine }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const playIdStr = playId != null ? String(playId) : '';
  const [draft, setDraft] = useState('');

  const query = useQuery({
    queryKey: PLAY_COMMENTS_QUERY_KEY(playIdStr),
    queryFn: () => socialApi.playComments(playIdStr),
    enabled: visible && !!playIdStr,
    staleTime: 10_000,
  });

  const addMutation = useMutation({
    mutationFn: (content: string) => socialApi.addPlayComment(playIdStr, content),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: PLAY_COMMENTS_QUERY_KEY(playIdStr) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => socialApi.deletePlayComment(playIdStr, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLAY_COMMENTS_QUERY_KEY(playIdStr) });
    },
  });

  const comments: Comment[] = Array.isArray(query.data) ? query.data : [];

  const handleSend = () => {
    const text = draft.trim();
    if (!text || addMutation.isPending) return;
    addMutation.mutate(text);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.sheetWrap}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={s.handle} />
            <View style={s.header}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.title}>Comments</Text>
                {contextLine ? <Text style={s.context} numberOfLines={1}>{contextLine}</Text> : null}
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
                <IconSymbol name="xmark" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 480 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              keyboardShouldPersistTaps="handled">
              {query.isLoading ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.spinner} />
                </View>
              ) : query.isError ? (
                <Text style={s.errorText}>
                  {query.error instanceof Error ? query.error.message : 'Failed to load comments'}
                </Text>
              ) : comments.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyTitle}>No comments yet</Text>
                  <Text style={s.emptyBody}>Be the first to react to this play.</Text>
                </View>
              ) : (
                comments.map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    canDelete={c.user_id === user?.id}
                    onDelete={() => deleteMutation.mutate(c.id)}
                    deletePending={deleteMutation.isPending && deleteMutation.variables === c.id}
                  />
                ))
              )}
              {addMutation.isError ? (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>
                    {addMutation.error instanceof Error ? addMutation.error.message : 'Failed to post.'}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {/* Composer — single-line; lifts above keyboard via KeyboardAvoidingView. */}
            {user ? (
              <View style={s.composer}>
                <TextInput
                  style={s.input}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Add a comment…"
                  placeholderTextColor={theme.textDim}
                  maxLength={1000}
                  editable={!addMutation.isPending}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                />
                <Pressable
                  onPress={handleSend}
                  disabled={!draft.trim() || addMutation.isPending}
                  style={({ pressed }) => [
                    s.sendBtn,
                    (!draft.trim() || addMutation.isPending) && { opacity: 0.4 },
                    pressed && draft.trim() && { opacity: 0.85 },
                  ]}>
                  {addMutation.isPending ? (
                    <ActivityIndicator color={theme.bg} size="small" />
                  ) : (
                    <IconSymbol name="paperplane.fill" size={14} color={theme.bg} />
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function CommentRow({
  comment,
  canDelete,
  onDelete,
  deletePending,
}: {
  comment: Comment;
  canDelete: boolean;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const avatar = comment.avatar ? fullImageUrl(String(comment.avatar)) : undefined;
  return (
    <View style={s.commentRow}>
      <View style={s.commentAvatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.commentAvatarImg} contentFit="cover" />
        ) : (
          <DefaultAvatar size={32} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={s.commentHeader}>
          <Text style={s.commentUser} numberOfLines={1}>@{comment.username || 'unknown'}</Text>
          <Text style={s.commentTime}>{relTime(comment.created_at)}</Text>
          {canDelete ? (
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              disabled={deletePending}
              style={({ pressed }) => [{ marginLeft: 'auto', padding: 4 }, pressed && { opacity: 0.7 }, deletePending && { opacity: 0.4 }]}>
              <IconSymbol name="trash" size={12} color={theme.danger} />
            </Pressable>
          ) : null}
        </View>
        <Text style={s.commentBody}>{comment.content || ''}</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' as const },
  sheetWrap: { width: '100%' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingTop: 8,
    maxHeight: '88%' as const,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 6 },

  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  context: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  closeBtn: { padding: 6 },

  emptyBox: { padding: 24, alignItems: 'center' as const, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  emptyBody: { fontSize: 12, color: t.textMuted },

  errorText: { color: t.danger, fontSize: 12, padding: 12, textAlign: 'center' as const },
  errorBox: { padding: 10, borderRadius: 8, backgroundColor: t.dangerBg, borderWidth: 1, borderColor: t.dangerBorder, marginTop: 6 },

  // Comment row
  commentRow: {
    flexDirection: 'row' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  commentAvatar: { width: 32, height: 32 },
  commentAvatarImg: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceMuted },
  commentHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  commentUser: { fontSize: 12, fontWeight: '900' as const, color: t.text, maxWidth: 160 },
  commentTime: { fontSize: 10, color: t.textDim, fontWeight: '700' as const },
  commentBody: { fontSize: 13, color: t.text, lineHeight: 18 },

  // Composer (mirrors conversation thread composer pattern)
  composer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  input: {
    flex: 1,
    height: 38,
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 19,
    paddingHorizontal: 14,
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
});

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartJacket } from '@/components/chart-jacket';
import { GradeChip } from '@/components/grade-chip';
import { SongOfWeekComposer } from '@/components/song-of-week-composer';
import { TopBar } from '@/components/top-bar';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Comment } from '@shared/api';

function formatRelative(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNumber(n?: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

interface CommentNode extends Comment {
  replies?: CommentNode[];
}

export default function SongOfWeekDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pickId = String(id || '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const [composerOpen, setComposerOpen] = useState(false);
  // Reply target lives at this level so the post-box can show "Replying to
  // @username · cancel" while the user types. Top-level comment when null.
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [draft, setDraft] = useState('');

  const detailQuery = useQuery({
    queryKey: ['song-of-week', 'detail', pickId],
    queryFn: () => socialApi.songOfWeekDetail(pickId),
    enabled: !!pickId,
  });

  const commentsQuery = useQuery({
    queryKey: ['song-of-week', 'comments', pickId],
    queryFn: () => socialApi.songOfWeekComments(pickId),
    enabled: !!pickId,
  });

  const postMutation = useMutation({
    mutationFn: () =>
      socialApi.addSongOfWeekComment(pickId, draft.trim(), replyTo?.id ?? null),
    onSuccess: () => {
      setDraft('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['song-of-week', 'comments', pickId] });
      queryClient.invalidateQueries({ queryKey: ['song-of-week', 'detail', pickId] });
      // Strip surfaces comment_count, refresh the global feed too.
      queryClient.invalidateQueries({ queryKey: ['song-of-week', 'global'] });
    },
    onError: (err) => {
      Alert.alert('Comment failed', err instanceof Error ? err.message : 'Try again.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => socialApi.deleteSongOfWeekComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['song-of-week', 'comments', pickId] });
      queryClient.invalidateQueries({ queryKey: ['song-of-week', 'detail', pickId] });
      queryClient.invalidateQueries({ queryKey: ['song-of-week', 'global'] });
    },
    onError: (err) => {
      Alert.alert('Delete failed', err instanceof Error ? err.message : 'Try again.');
    },
  });

  const detail = detailQuery.data;
  const comments = (commentsQuery.data ?? []) as CommentNode[];
  const isOwner = !!detail?.is_owner;

  // Server already returns top-level + replies as a tree (replies nested).
  // Fall back gracefully if a future change starts returning a flat list.
  const topLevel = useMemo(() => {
    if (!Array.isArray(comments)) return [] as CommentNode[];
    if (comments.some((c) => c.parent_id)) {
      const map: Record<string, CommentNode> = {};
      const roots: CommentNode[] = [];
      for (const c of comments) {
        map[String(c.id)] = { ...c, replies: [] };
      }
      for (const c of comments) {
        const node = map[String(c.id)];
        if (c.parent_id && map[String(c.parent_id)]) {
          map[String(c.parent_id)].replies!.push(node);
        } else {
          roots.push(node);
        }
      }
      return roots;
    }
    return comments;
  }, [comments]);

  if (!pickId) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.bodyText}>Missing pick id.</Text>
      </View>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
        <View style={s.center}>
          <Text style={s.bodyText}>
            {detailQuery.error instanceof Error ? detailQuery.error.message : 'Pick not found.'}
          </Text>
        </View>
      </View>
    );
  }

  const jacket = detail.jacket_url_snapshot ? fullImageUrl(detail.jacket_url_snapshot) : undefined;
  const ownerAvatar = detail.avatar ? fullImageUrl(String(detail.avatar)) : undefined;
  const linked = detail.linked_play;

  const canPost = !!user && draft.trim().length > 0 && !postMutation.isPending;

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: detail.song_title_snapshot || 'Song of the Week' }} />
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={insets.top + 16}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}>
          {/* ─── Pick header ─────────────────────────────────────────── */}
          <View style={s.pickCard}>
            <View style={s.pickRow}>
              <ChartJacket jacketUrl={jacket} mode={detail.mode} level={detail.level} size="wide" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.eyebrow}>SONG OF THE WEEK</Text>
                <Text style={s.songTitle} numberOfLines={2}>{detail.song_title_snapshot || 'Unknown song'}</Text>
                {detail.artist_snapshot ? (
                  <Text style={s.songArtist} numberOfLines={1}>{detail.artist_snapshot}</Text>
                ) : null}
                <View style={s.metaRow}>
                  {detail.mode ? <Text style={s.metaPill}>{detail.mode}</Text> : null}
                  {detail.level ? <Text style={s.metaPill}>Lv {detail.level}</Text> : null}
                </View>
              </View>
            </View>

            {detail.caption ? (
              <Text style={s.caption}>&ldquo;{detail.caption}&rdquo;</Text>
            ) : null}

            <Pressable
              onPress={() => {
                if (detail.user_id) {
                  router.push({ pathname: '/profile/[id]', params: { id: String(detail.user_id) } });
                }
              }}
              style={({ pressed }) => [s.ownerRow, pressed && { opacity: 0.7 }]}>
              {ownerAvatar ? (
                <Image source={{ uri: ownerAvatar }} style={s.ownerAvatar} contentFit="cover" />
              ) : (
                <View style={[s.ownerAvatar, s.ownerAvatarFallback]}>
                  <Text style={s.ownerAvatarLetter}>{(detail.username || '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.ownerName}>@{detail.username || 'anonymous'}</Text>
                {detail.created_at ? (
                  <Text style={s.ownerMeta}>Posted {formatRelative(detail.created_at)}</Text>
                ) : null}
              </View>
              {isOwner ? (
                <Pressable
                  onPress={() => setComposerOpen(true)}
                  style={({ pressed }) => [s.editBtn, pressed && { opacity: 0.7 }]}>
                  <Text style={s.editBtnText}>Edit pick</Text>
                </Pressable>
              ) : null}
            </Pressable>
          </View>

          {/* ─── Linked play card ─────────────────────────────────────── */}
          {linked ? (
            <View style={s.linkedCard}>
              <Text style={s.linkedEyebrow}>OWNER&rsquo;S RECENT PLAY</Text>
              <View style={s.linkedRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.linkedScore}>{formatNumber(linked.score)}</Text>
                  <Text style={s.linkedMeta}>
                    {linked.played_at_utc || linked.date_played
                      ? formatRelative(linked.played_at_utc || linked.date_played)
                      : ''}
                    {linked.plate ? ` · ${linked.plate}` : ''}
                  </Text>
                </View>
                {linked.grade ? (
                  <GradeChip grade={String(linked.grade)} score={Number(linked.score) || 0} size="sm" />
                ) : null}
              </View>
            </View>
          ) : null}

          {/* ─── Comments ─────────────────────────────────────────────── */}
          <View style={s.commentsHeader}>
            <Text style={s.sectionTitle}>
              COMMENTS{typeof detail.comment_count === 'number' ? ` (${detail.comment_count})` : ''}
            </Text>
          </View>

          {commentsQuery.isLoading ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <ActivityIndicator color={theme.spinner} />
            </View>
          ) : topLevel.length === 0 ? (
            <Text style={s.emptyComments}>
              No comments yet. {user ? 'Be the first to chime in.' : 'Sign in to leave one.'}
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {topLevel.map((c) => (
                <CommentThread
                  key={String(c.id)}
                  s={s}
                  comment={c}
                  pickOwnerId={String(detail.user_id || '')}
                  currentUserId={user?.id || null}
                  onReply={(target) => setReplyTo(target)}
                  onDelete={(commentId) => {
                    Alert.alert(
                      'Delete this comment?',
                      'This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(commentId) },
                      ],
                    );
                  }}
                />
              ))}
            </View>
          )}
        </ScrollView>

        {/* ─── Post box ─────────────────────────────────────────────── */}
        {user ? (
          <View style={[s.postBox, { paddingBottom: insets.bottom + 8 }]}>
            {replyTo ? (
              <View style={s.replyingBanner}>
                <Text style={s.replyingText}>Replying to @{replyTo.username}</Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={6}>
                  <Text style={s.replyingCancel}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={s.postRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
                placeholderTextColor={'#8a8a8a'}
                style={s.postInput}
                editable={!postMutation.isPending}
              />
              <Pressable
                onPress={() => postMutation.mutate()}
                disabled={!canPost}
                style={({ pressed }) => [
                  s.postBtn,
                  !canPost && { opacity: 0.4 },
                  pressed && { opacity: 0.85 },
                ]}>
                {postMutation.isPending
                  ? <ActivityIndicator size="small" color={theme.textOnAccent} />
                  : <Text style={s.postBtnText}>Post</Text>}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[s.postBox, { paddingBottom: insets.bottom + 8 }]}>
            <Text style={s.signInHint}>Sign in to comment on this pick.</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <SongOfWeekComposer
        visible={composerOpen}
        existingPick={isOwner ? detail : null}
        onClose={() => setComposerOpen(false)}
        onSaved={() => {
          setComposerOpen(false);
          queryClient.invalidateQueries({ queryKey: ['song-of-week', 'detail', pickId] });
          queryClient.invalidateQueries({ queryKey: ['song-of-week'] });
        }}
      />
    </View>
  );
}

interface CommentThreadProps {
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
  comment: CommentNode;
  pickOwnerId: string;
  currentUserId: string | null;
  onReply: (target: { id: string; username: string }) => void;
  onDelete: (commentId: string) => void;
}

function CommentThread({ s, comment, pickOwnerId, currentUserId, onReply, onDelete }: CommentThreadProps) {
  const avatar = comment.avatar ? fullImageUrl(String(comment.avatar)) : undefined;
  const isAuthor = currentUserId && String(comment.user_id) === currentUserId;
  // Pick owner can also moderate any reply on their own SOW (matches server).
  const isPickOwner = currentUserId && currentUserId === pickOwnerId;
  const canDelete = !!(isAuthor || isPickOwner);

  return (
    <View style={s.commentBlock}>
      <CommentRow
        s={s}
        comment={comment}
        avatar={avatar}
        canDelete={canDelete}
        onReply={() => onReply({ id: String(comment.id), username: comment.username || 'user' })}
        onDelete={() => onDelete(String(comment.id))}
      />
      {comment.replies && comment.replies.length > 0 ? (
        <View style={s.replyList}>
          {comment.replies.map((r) => {
            const rAvatar = r.avatar ? fullImageUrl(String(r.avatar)) : undefined;
            const rIsAuthor = currentUserId && String(r.user_id) === currentUserId;
            const rCanDelete = !!(rIsAuthor || isPickOwner);
            return (
              <CommentRow
                key={String(r.id)}
                s={s}
                comment={r}
                avatar={rAvatar}
                canDelete={rCanDelete}
                // Replies fold under the parent thread; tapping reply on a
                // nested comment still threads under the same root, so the
                // server doesn't have to model multi-level trees.
                onReply={() => onReply({ id: String(comment.id), username: r.username || 'user' })}
                onDelete={() => onDelete(String(r.id))}
                indent
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

interface CommentRowProps {
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
  comment: CommentNode;
  avatar?: string;
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
  indent?: boolean;
}

function CommentRow({ s, comment, avatar, canDelete, onReply, onDelete, indent }: CommentRowProps) {
  return (
    <View style={[s.commentRow, indent && s.commentRowIndent]}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.commentAvatar} contentFit="cover" />
      ) : (
        <View style={[s.commentAvatar, s.ownerAvatarFallback]}>
          <Text style={s.ownerAvatarLetter}>{(comment.username || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.commentMetaRow}>
          <Text style={s.commentUsername}>@{comment.username || 'anonymous'}</Text>
          <Text style={s.commentTime}>{formatRelative(comment.created_at)}</Text>
        </View>
        <Text style={s.commentBody}>{comment.content || ''}</Text>
        <View style={s.commentActionsRow}>
          <Pressable onPress={onReply} hitSlop={6}>
            <Text style={s.commentAction}>Reply</Text>
          </Pressable>
          {canDelete ? (
            <Pressable onPress={onDelete} hitSlop={6}>
              <Text style={[s.commentAction, s.commentActionDanger]}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  scroll: { padding: 14, gap: 14 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  bodyText: { color: t.textMuted, fontSize: 13 },

  pickCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 12,
  },
  pickRow: { flexDirection: 'row' as const, gap: 12 },
  eyebrow: { fontSize: 9, letterSpacing: 1.6, color: t.accent, fontWeight: '900' as const },
  songTitle: { fontSize: 18, fontWeight: '900' as const, color: t.text },
  songArtist: { fontSize: 12, color: t.textMuted },
  metaRow: { flexDirection: 'row' as const, gap: 6, marginTop: 4 },
  metaPill: {
    fontSize: 10,
    fontWeight: '900' as const,
    color: t.textMuted,
    letterSpacing: 0.4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.surfaceMuted,
  },
  caption: { fontSize: 13, color: t.text, fontStyle: 'italic' as const, lineHeight: 18 },

  ownerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  ownerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.surfaceMuted,
  },
  ownerAvatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  ownerAvatarLetter: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  ownerName: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  ownerMeta: { fontSize: 10, color: t.textDim },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.accent,
    backgroundColor: t.surfaceMuted,
  },
  editBtnText: { fontSize: 11, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.4 },

  // Owner's most recent matching play, surfaced inline so commenters can
  // see whether the pick has been backed up with a clear yet.
  linkedCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 6,
  },
  linkedEyebrow: { fontSize: 9, letterSpacing: 1.4, color: t.textDim, fontWeight: '900' as const },
  linkedRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  linkedScore: { fontSize: 22, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  linkedMeta: { fontSize: 11, color: t.textMuted },

  commentsHeader: { paddingTop: 4 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.4, color: t.textDim, fontWeight: '900' as const },
  emptyComments: { fontSize: 12, color: t.textDim, paddingVertical: 14, textAlign: 'center' as const },

  commentBlock: { gap: 8 },
  commentRow: { flexDirection: 'row' as const, gap: 10 },
  commentRowIndent: { paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: t.border, marginLeft: 18 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  commentMetaRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 6 },
  commentUsername: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  commentTime: { fontSize: 10, color: t.textDim },
  commentBody: { fontSize: 13, color: t.text, lineHeight: 18 },
  commentActionsRow: { flexDirection: 'row' as const, gap: 14, marginTop: 2 },
  commentAction: { fontSize: 11, fontWeight: '700' as const, color: t.textDim },
  commentActionDanger: { color: t.danger },
  replyList: { gap: 8, marginTop: 4 },

  postBox: {
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    backgroundColor: t.bg,
    gap: 8,
  },
  replyingBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
  },
  replyingText: { fontSize: 11, color: t.accent, fontWeight: '700' as const },
  replyingCancel: { fontSize: 11, color: t.textDim, fontWeight: '700' as const },

  postRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 8 },
  postInput: {
    flex: 1,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    color: t.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
    maxHeight: 120,
  },
  postBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 64,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  postBtnText: { color: t.textOnAccent, fontSize: 13, fontWeight: '900' as const },
  signInHint: { fontSize: 12, color: t.textDim, textAlign: 'center' as const, paddingVertical: 8 },
});

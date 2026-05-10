import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LiveSessionCard } from '@/components/live-session-card';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import type { ThemeColors } from '@/constants/theme';
import type { Comment, Post } from '@shared/api';

function timeAgo(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const ms = Date.now() - d.getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function parseImages(raw: Post['images']): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function CommentRow({ c, s }: { c: Comment; s: Styles }) {
  const avatar = typeof c.avatar === 'string' ? fullImageUrl(c.avatar) : undefined;
  return (
    <View style={[s.commentRow, c.parent_id ? s.commentReply : null]}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.commentAvatar} contentFit="cover" />
      ) : (
        <View style={[s.commentAvatar, s.avatarFallback]}>
          <Text style={s.avatarLetter}>{(c.username || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={s.commentMain}>
        <View style={s.commentHeader}>
          <Text style={s.commentUser}>{c.username || 'anonymous'}</Text>
          <Text style={s.commentTime}>{timeAgo(c.created_at)}</Text>
        </View>
        {c.content ? <Text style={s.commentBody}>{c.content}</Text> : null}
      </View>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? '';
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const postQuery = useQuery({
    queryKey: ['post', postId],
    queryFn: () => socialApi.post(postId),
    enabled: !!postId,
  });

  const commentsQuery = useQuery({
    queryKey: ['post-comments', postId],
    queryFn: () => socialApi.comments(postId),
    enabled: !!postId,
  });

  const post = postQuery.data;
  const comments = commentsQuery.data ?? [];
  const avatar = post && typeof (post.user_avatar || post.avatar) === 'string'
    ? fullImageUrl((post.user_avatar || post.avatar) as string)
    : undefined;
  const images = parseImages(post?.images);
  const { content: postContent, summary: liveSummary } = parseLiveSessionMarker(post?.content);

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: post?.username ? `@${post.username}` : 'Post' }} />
      <ScrollView contentContainerStyle={s.scroll}>
        {postQuery.isLoading && (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        )}

        {postQuery.isError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              {postQuery.error instanceof Error ? postQuery.error.message : 'Failed to load post'}
            </Text>
          </View>
        )}

        {post && (
          <>
            <View style={s.postHeader}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={s.postAvatar} contentFit="cover" />
              ) : (
                <View style={[s.postAvatar, s.avatarFallback]}>
                  <Text style={s.postAvatarLetter}>{(post.username || '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={s.postHeaderInfo}>
                <Text style={s.postUsername}>@{post.username || 'anonymous'}</Text>
                <Text style={s.postTime}>{timeAgo(post.created_at)}</Text>
              </View>
            </View>

            {liveSummary ? <LiveSessionCard summary={liveSummary} /> : null}
            {postContent ? <Text style={s.postContent}>{postContent}</Text> : null}

            {images.length > 0 && (
              <View style={s.imagesList}>
                {images.map((img, i) => {
                  const url = fullImageUrl(img);
                  return url ? (
                    <Image key={i} source={{ uri: url }} style={s.postImage} contentFit="cover" transition={150} />
                  ) : null;
                })}
              </View>
            )}

            <View style={s.postFooter}>
              {typeof post.pump_count === 'number' ? (
                <Text style={s.metric}>↑ {post.pump_count}</Text>
              ) : null}
              {typeof post.comment_count === 'number' ? (
                <Text style={s.metric}>💬 {post.comment_count}</Text>
              ) : null}
            </View>

            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Comments</Text>
                <Text style={s.sectionCount}>{comments.length}</Text>
              </View>
              {commentsQuery.isLoading ? (
                <ActivityIndicator color={theme.spinner} style={{ padding: 24 }} />
              ) : comments.length === 0 ? (
                <Text style={s.empty}>No comments yet</Text>
              ) : (
                <View style={s.commentsList}>
                  {comments.map((c) => <CommentRow key={c.id} c={c} s={s} />)}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 20, gap: 16, paddingBottom: 60 },
  center: { padding: 32, alignItems: 'center' as const },

  postHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  postAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.surfaceMuted },
  postAvatarLetter: { fontSize: 20, fontWeight: '800' as const, color: t.textMuted },
  postHeaderInfo: { flex: 1, gap: 2 },
  postUsername: { fontSize: 15, fontWeight: '800' as const, color: t.text },
  postTime: { fontSize: 12, color: t.textDim },
  postContent: { fontSize: 15, lineHeight: 22, color: t.text },
  imagesList: { gap: 8 },
  postImage: { width: '100%' as const, aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: t.surfaceMuted },
  postFooter: { flexDirection: 'row' as const, gap: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  metric: { fontSize: 13, fontWeight: '700' as const, color: t.textMuted },

  section: { gap: 8, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700' as const, color: t.text },
  sectionHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  sectionCount: { fontSize: 12, color: t.textDim },
  commentsList: { backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.border, padding: 4 },
  commentRow: { flexDirection: 'row' as const, gap: 10, padding: 10 },
  commentReply: { paddingLeft: 36, opacity: 0.85 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarLetter: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  commentMain: { flex: 1, gap: 2 },
  commentHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  commentUser: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  commentTime: { fontSize: 11, color: t.textDim },
  commentBody: { fontSize: 14, lineHeight: 20, color: t.text },

  empty: { padding: 16, textAlign: 'center' as const, color: t.textDim },
  errorBox: { backgroundColor: t.dangerBg, borderColor: t.dangerBorder, borderWidth: 1, padding: 12, borderRadius: 8 },
  errorText: { color: t.danger, fontSize: 14 },
});

import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LiveSessionCard } from '@/components/live-session-card';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import type { Comment, Post } from '@shared/api';

function timeAgo(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
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

function CommentRow({ c }: { c: Comment }) {
  const avatar = typeof c.avatar === 'string' ? fullImageUrl(c.avatar) : undefined;
  return (
    <View style={[styles.commentRow, c.parent_id ? styles.commentReply : null]}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.commentAvatar} contentFit="cover" />
      ) : (
        <View style={[styles.commentAvatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>{(c.username || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.commentMain}>
        <View style={styles.commentHeader}>
          <ThemedText style={styles.commentUser}>{c.username || 'anonymous'}</ThemedText>
          <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
        </View>
        {c.content ? <Text style={styles.commentBody}>{c.content}</Text> : null}
      </View>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? '';

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
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: post?.username ? `@${post.username}` : 'Post' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {postQuery.isLoading && (
          <View style={styles.center}><ActivityIndicator color="#ff3366" /></View>
        )}

        {postQuery.isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {postQuery.error instanceof Error ? postQuery.error.message : 'Failed to load post'}
            </Text>
          </View>
        )}

        {post && (
          <>
            <View style={styles.postHeader}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.postAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.postAvatar, styles.avatarFallback]}>
                  <Text style={styles.postAvatarLetter}>{(post.username || '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.postHeaderInfo}>
                <ThemedText style={styles.postUsername}>@{post.username || 'anonymous'}</ThemedText>
                <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
              </View>
            </View>

            {liveSummary ? <LiveSessionCard summary={liveSummary} /> : null}
            {postContent ? (
              <ThemedText style={styles.postContent}>{postContent}</ThemedText>
            ) : null}

            {images.length > 0 && (
              <View style={styles.imagesList}>
                {images.map((img, i) => {
                  const url = fullImageUrl(img);
                  return url ? (
                    <Image key={i} source={{ uri: url }} style={styles.postImage} contentFit="cover" transition={150} />
                  ) : null;
                })}
              </View>
            )}

            <View style={styles.postFooter}>
              {typeof post.pump_count === 'number' ? (
                <Text style={styles.metric}>↑ {post.pump_count}</Text>
              ) : null}
              {typeof post.comment_count === 'number' ? (
                <Text style={styles.metric}>💬 {post.comment_count}</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText type="subtitle">Comments</ThemedText>
                <Text style={styles.sectionCount}>{comments.length}</Text>
              </View>
              {commentsQuery.isLoading ? (
                <ActivityIndicator color="#ff3366" style={{ padding: 24 }} />
              ) : comments.length === 0 ? (
                <Text style={styles.empty}>No comments yet</Text>
              ) : (
                <View style={styles.commentsList}>
                  {comments.map((c) => <CommentRow key={c.id} c={c} />)}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 16, paddingBottom: 60 },
  center: { padding: 32, alignItems: 'center' },

  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e293b' },
  postAvatarLetter: { fontSize: 20, fontWeight: '700', color: '#94a3b8' },
  postHeaderInfo: { flex: 1, gap: 2 },
  postUsername: { fontSize: 15, fontWeight: '700' },
  postTime: { fontSize: 12, opacity: 0.5 },
  postContent: { fontSize: 15, lineHeight: 22 },
  imagesList: { gap: 8 },
  postImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: '#1e293b' },
  postFooter: { flexDirection: 'row', gap: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(148,163,184,0.15)' },
  metric: { fontSize: 13, fontWeight: '600' },

  section: { gap: 8, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionCount: { fontSize: 12, opacity: 0.5 },
  commentsList: { backgroundColor: '#141428', borderRadius: 12, padding: 4 },
  commentRow: { flexDirection: 'row', gap: 10, padding: 10 },
  commentReply: { paddingLeft: 36, opacity: 0.85 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1e293b' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  commentMain: { flex: 1, gap: 2 },
  commentHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  commentUser: { fontSize: 13, fontWeight: '600' },
  commentTime: { fontSize: 11, opacity: 0.5 },
  commentBody: { fontSize: 14, lineHeight: 20 },

  empty: { padding: 16, textAlign: 'center', opacity: 0.5 },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: '#fca5a5', fontSize: 14 },
});

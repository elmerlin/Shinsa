import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AchievementBadgePost } from '@/components/achievement-badge-post';
import { flattenComments } from '@/components/comments-sheet';
import { DefaultAvatar } from '@/components/default-avatar';
import { SystemAvatar } from '@/components/system-avatar';
import { LiveSessionCard } from '@/components/live-session-card';
import { PostLiveRecap } from '@/components/live-recap';
import { ReplayModal } from '@/components/replay-modal';
import { SessionPlanCard } from '@/components/session-plan-card';
import { SessionShareCard } from '@/components/session-share-card';
import { SessionSummaryCard } from '@/components/session-summary-card';
import { WcSummaryCard } from '@/components/wc-summary-card';
import { WcPersonalCard } from '@/components/wc-personal-card';
import { YouTubeEmbed } from '@/components/youtube-embed';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { parseAchievementBadgePost } from '@/lib/achievementBadgePost';
import { fullImageUrl } from '@/lib/images';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import { splitSessionPlanContent } from '@/lib/sessionPlanMarker';
import { splitSessionShareContent } from '@/lib/sessionShareMarker';
import { splitSessionSummaryContent } from '@/lib/sessionSummaryMarker';
import { splitWcSummaryContent, type WcSummary } from '@/lib/weeklyChallengeSummaryMarker';
import { splitWcPersonalContent, type WcPersonalSummary } from '@/lib/weeklyChallengePersonalMarker';
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

function CommentRow({ c, s, onProfile }: { c: Comment; s: Styles; onProfile: (username: string) => void }) {
  const avatar = typeof c.avatar === 'string' ? fullImageUrl(c.avatar) : undefined;
  const goProfile = () => c.username && onProfile(c.username);
  return (
    <View style={[s.commentRow, c.parent_id ? s.commentReply : null]}>
      <Pressable onPress={goProfile} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.commentAvatar} contentFit="cover" />
        ) : (
          <DefaultAvatar size={28} />
        )}
      </Pressable>
      <View style={s.commentMain}>
        <View style={s.commentHeader}>
          <Pressable onPress={goProfile} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <Text style={s.commentUser}>{c.username || 'anonymous'}</Text>
          </Pressable>
          <Text style={s.commentTime}>{timeAgo(c.created_at)}</Text>
        </View>
        {c.content ? <Text style={s.commentBody}>{c.content}</Text> : null}
      </View>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const postId = id ?? '';
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { isDesktop } = useBreakpoint();
  // Per-row replay button in the SessionShareCard funnels into this — keeps
  // the YouTube player inside the post screen instead of bouncing to a new
  // window via Linking.openURL.
  const [replayTarget, setReplayTarget] = useState<{ url: string; title: string } | null>(null);
  const onReplay = (url: string, title: string) => setReplayTarget({ url, title });
  const goProfile = (username: string) =>
    router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });

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
  // Flatten the threaded shape (top-level + nested replies) so replies render
  // and the count matches the server's (which includes replies).
  const comments = flattenComments(commentsQuery.data ?? []);
  const avatar = post && typeof (post.user_avatar || post.avatar) === 'string'
    ? fullImageUrl((post.user_avatar || post.avatar) as string)
    : undefined;
  const images = parseImages(post?.images);
  const { content: afterLive, summary: liveSummary } = parseLiveSessionMarker(post?.content);
  const { text: afterWcSummary, summary: wcMarkerSummary } = splitWcSummaryContent(afterLive);
  const wcAttached = post ? ((post as Record<string, unknown>).wc_summary_payload as WcSummary | null | undefined) : undefined;
  const wcSummary = wcAttached ?? wcMarkerSummary;

  const { text: afterPersonal, personal: wcPersonalMarker } = splitWcPersonalContent(afterWcSummary);
  const wcPersonalAttached = post ? ((post as Record<string, unknown>).wc_personal_payload as WcPersonalSummary | null | undefined) : undefined;
  const wcPersonal = wcPersonalAttached ?? wcPersonalMarker;

  // Decode the rest of the structured share markers so we can render the
  // proper card instead of falling back to "🔗 Shared link".
  const { text: afterShare, share: sessionShare } = splitSessionShareContent(afterPersonal);
  const { text: afterSummary, summary: sessionSummary } = splitSessionSummaryContent(afterShare);
  const { text: afterPlan, plan: sessionPlan } = splitSessionPlanContent(afterSummary);
  const postContent = String(afterPlan || '').replace(/\[\[SHINSA_[A-Z_]+_V\d+:[^\]]+\]\]/g, '').trim();

  // Render badge-unlock posts as a compact card with a small thumbnail
  // instead of the default full-width image gallery.
  const badgePost = parseAchievementBadgePost(postContent, images);

  const bodyEl = post ? (
    <>
      <Pressable
        onPress={() => post.username && goProfile(post.username)}
        style={({ pressed }) => [s.postHeader, pressed && { opacity: 0.7 }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.postAvatar} contentFit="cover" />
        ) : post.username === '__shinsa__' ? (
          <SystemAvatar size={44} />
        ) : (
          <DefaultAvatar size={44} />
        )}
        <View style={s.postHeaderInfo}>
          <Text style={s.postUsername}>@{post.username || 'anonymous'}</Text>
          <Text style={s.postTime}>{timeAgo(post.created_at)}</Text>
        </View>
      </Pressable>

      {liveSummary ? <LiveSessionCard summary={liveSummary} /> : null}
      {liveSummary ? <PostLiveRecap summary={liveSummary} /> : null}
      {wcSummary ? <WcSummaryCard summary={wcSummary} /> : null}
      {wcPersonal ? <WcPersonalCard summary={wcPersonal} /> : null}
      {sessionShare ? <SessionShareCard share={sessionShare} onReplay={onReplay} /> : null}
      {sessionSummary ? <SessionSummaryCard summary={sessionSummary} /> : null}
      {sessionPlan ? <SessionPlanCard plan={sessionPlan} /> : null}

      {badgePost ? (
        <AchievementBadgePost
          badgeName={badgePost.badgeName}
          supportingCopy={badgePost.supportingCopy}
          image={badgePost.image}
        />
      ) : (
        <>
          {postContent ? <Text style={s.postContent}>{postContent}</Text> : null}
          {post.youtube_url ? <YouTubeEmbed url={post.youtube_url} /> : null}
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
        </>
      )}

      <View style={s.postFooter}>
        {typeof post.pump_count === 'number' ? (
          <Text style={s.metric}>↑ {post.pump_count}</Text>
        ) : null}
        {typeof post.comment_count === 'number' ? (
          <Text style={s.metric}>💬 {post.comment_count}</Text>
        ) : null}
      </View>
    </>
  ) : null;

  const commentsEl = (
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
          {comments.map((c) => <CommentRow key={c.id} c={c} s={s} onProfile={goProfile} />)}
        </View>
      )}
    </View>
  );

  if (isDesktop && post) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: post.username ? `@${post.username}` : 'Post' }} />
        <View style={s.deskRow}>
          <ScrollView style={s.deskBody} contentContainerStyle={s.scroll}>
            {bodyEl}
          </ScrollView>
          <View style={s.deskRail}>
            <ScrollView contentContainerStyle={s.deskRailContent}>{commentsEl}</ScrollView>
          </View>
        </View>
        <ReplayModal
          visible={!!replayTarget}
          url={replayTarget?.url}
          title={replayTarget?.title}
          onClose={() => setReplayTarget(null)}
        />
      </View>
    );
  }

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
            {bodyEl}
            {commentsEl}
          </>
        )}
      </ScrollView>
      <ReplayModal
        visible={!!replayTarget}
        url={replayTarget?.url}
        title={replayTarget?.title}
        onClose={() => setReplayTarget(null)}
      />
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

  // Desktop: 8-col post body + 4-col comments rail.
  deskRow: { flex: 1, flexDirection: 'row' as const },
  deskBody: { flex: 1 },
  deskRail: {
    width: 380,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
  },
  deskRailContent: { padding: 16, paddingBottom: 60 },
});

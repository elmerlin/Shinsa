import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AddShoeSheet } from '@/components/add-shoe-sheet';
import { ChartJacket } from '@/components/chart-jacket';
import { ClearsByLevelChart } from '@/components/clears-by-level-chart';
import { DefaultAvatar } from '@/components/default-avatar';
import { GradeChip } from '@/components/grade-chip';
import { GradeGoalsTracker } from '@/components/grade-goals-tracker';
import { HeatmapDayDetail } from '@/components/heatmap-day-detail';
import { PlateBadge } from '@/components/plate-badge';
import { PlayHeatmap } from '@/components/play-heatmap';
import { CompetitiveLevelInfoModal } from '@/components/competitive-level-info-modal';
import { GradeDistributionChart } from '@/components/grade-distribution-chart';
import { LevelLeaderboardSheet } from '@/components/level-leaderboard-sheet';
import { ReplayModal } from '@/components/replay-modal';
import { MiniScoutCard, ScoutCardSheet, type ScoutPlayerInfo } from '@/components/scout-card';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { authApi, liveApi, messagesApi, piugameApi, socialApi, songsApi, weeklyChallengesApi } from '@/lib/api';
import { getMessagesInboxQueryKey } from '@/lib/messagesQueries';
import { getGradeDisplayLabel, getGradeTier, TIER_COLORS } from '@/lib/grades';
import { fullImageUrl } from '@/lib/images';
import { resolveChartJacketUrl } from '@/lib/jacketMap';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import { formatMemberSince, getAge, getCountryFlag, getGenderSymbol } from '@/lib/profileMeta';
import { toCanonicalSongTitle } from '@/lib/songAliases';
import type { ThemeColors } from '@/constants/theme';
import type {
  FollowEntry,
  LiveProfileResponse,
  LiveSessionSummary,
  LiveSessionSummaryPayload,
  PiugameBestScore,
  PiugamePumbility,
  PiugamePumbilityScore,
  PiugameRecentPlay,
  PiugameShoe,
  PiugameTitle,
  PiugameTitlesResponse,
  Post,
  SkillBreakdownEntry,
  SkillBreakdownResponse,
  SongAnalyticsLevelBucket,
  SongAnalyticsResponse,
  TournamentParticipation,
  User,
  UserAchievement,
  UserActivityItem,
  UserWeeklyChallengeHistoryEntry,
} from '@shared/api';

type Tab =
  | 'overview'
  | 'best'
  | 'recent'
  | 'posts'
  | 'activity'
  | 'pumbility'
  | 'competitions'
  | 'followers'
  | 'live'
  | 'titles'
  | 'shoes';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'pumbility', label: 'Pumbility' },
  { key: 'best', label: 'Best Scores' },
  { key: 'recent', label: 'Recently Played' },
  { key: 'titles', label: 'Titles' },
  { key: 'live', label: 'Live' },
  { key: 'competitions', label: 'Competitions' },
  { key: 'shoes', label: 'Shoes' },
  // Followers/Following moved to the header pumbility cell taps —
  // the standalone tab was redundant.
  { key: 'posts', label: 'Posts' },
  { key: 'activity', label: 'Activity' },
];

/** Activity feed filter — mirrors the web's `activitySubTab` buckets. */
type ActivitySubTab = 'all' | 'posts' | 'comments' | 'scores' | 'competitions';
const ACTIVITY_SUB_TABS: { key: ActivitySubTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'posts', label: 'Posts' },
  { key: 'comments', label: 'Comments' },
  { key: 'scores', label: 'Scores' },
  { key: 'competitions', label: 'Competitions' },
];

/** Best-scores mode. Required — Best Scores no longer supports "all" because
 *  the full list of every chart at every level is too long to load at once.
 *  Users pick one mode + one level. */
type BestMode = 'Single' | 'Double' | 'CoOp';
const BEST_MODE_FILTERS: { key: BestMode; label: string }[] = [
  { key: 'Single', label: 'Singles' },
  { key: 'Double', label: 'Doubles' },
  { key: 'CoOp', label: 'Co-Op' },
];

/** Per-mode accent color for headers, level pills, and the active mode tab. */
const BEST_MODE_ACCENT: Record<BestMode, string> = {
  Single: '#ff7a7a',
  Double: '#4cf4aa',
  CoOp: '#7dd3fc',
};

function isUserId(token: string): boolean {
  // Server user ids are UUIDs (e.g. c1eff856-0297-4c22-b454-3b1fedd0301c).
  // Anything else is treated as a username.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
}

const PET_EMOJI: Record<string, string> = {
  dojocat: '🐱',
  buu: '🟪',
  devit: '😈',
  pixiu: '🐲',
};

function petCharacterEmoji(character: string): string {
  return PET_EMOJI[String(character || '').toLowerCase()] || '🐾';
}

function formatNumber(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function timeAgo(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const ms = Date.now() - d.getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString();
}

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function ScoreRow({ score, s, onPress, onReplay, jacketMap }: {
  score: PiugameBestScore | PiugameRecentPlay;
  s: Styles;
  onPress: () => void;
  /** Optional handler — when set and the score has a replay_embed_url, a
   *  small red play badge appears that opens the replay directly without
   *  having to go through the score-detail sheet. */
  onReplay?: (url: string, title: string) => void;
  jacketMap: Record<string, string> | undefined;
}) {
  const resolved = resolveChartJacketUrl({
    title: score.song_title,
    mode: score.mode,
    level: score.level,
    jacketLookup: jacketMap,
    backgroundUrl: score.background_url,
    jacketUrl: score.jacket_url,
  });
  const jacketUrl = resolved ? fullImageUrl(resolved) : undefined;
  const title = toCanonicalSongTitle(score.song_title || '') || score.song_title || 'Unknown';
  const scoreNum = Number(score.score) || 0;
  const isBreak = !!score.is_stage_break;
  const replayUrl = typeof score.replay_embed_url === 'string' ? score.replay_embed_url.trim() : '';
  const hasReplay = !!replayUrl && !!onReplay;
  const replayLabel = `${title}${score.mode ? ` · ${score.mode}${score.level ? ` ${score.level}` : ''}` : ''}`;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.scoreRow, pressed && { opacity: 0.7 }]}>
      <ChartJacket jacketUrl={jacketUrl} mode={score.mode} level={score.level} size="sm" />
      <View style={s.scoreMain}>
        <Text style={s.scoreTitle} numberOfLines={1}>{title}</Text>
        <View style={s.scoreMetaRow}>
          {score.plate ? <PlateBadge plate={score.plate} size="xs" /> : null}
          {score.date_played || score.played_at_utc ? (
            <Text style={s.scoreDate}>{formatDate(score.date_played || score.played_at_utc)}</Text>
          ) : null}
        </View>
      </View>
      {hasReplay ? (
        <Pressable
          onPress={() => onReplay?.(replayUrl, replayLabel)}
          hitSlop={6}
          style={({ pressed }) => [s.replayBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel={`Watch replay of ${title}`}>
          <IconSymbol name="play.rectangle.fill" size={14} color="#f87171" />
        </Pressable>
      ) : null}
      <View style={s.scoreCol}>
        <Text style={[s.scoreNum, isBreak && s.scoreBreak]}>
          {isBreak ? 'BREAK' : formatNumber(scoreNum)}
        </Text>
        <GradeChip grade={score.grade} score={scoreNum} size="xs" />
      </View>
    </Pressable>
  );
}

/** Loose subset of the post fields we lean on here — the server may
 *  attach extras (images JSON, youtube_url, structured share payloads)
 *  that aren't in the strict `Post` shared type. */
type ProfilePost = Post & {
  images?: unknown;
  youtube_url?: string;
};

function parsePostImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Compact inline preview of a selected score. Rendered as the right rail
 * of the Best/Recent tabs on desktop so the user always sees what they
 * tapped without needing to read the full sheet. Tap-through still opens
 * ScoreCardSheet for the full set of actions (share, replay, comments).
 */
function ScoreSummaryPanel({
  data,
  s,
  onReplay,
}: {
  data: ScoreCardData | null;
  s: Styles;
  onReplay: (url: string, title: string) => void;
}) {
  if (!data) {
    return (
      <View style={s.scorePanelEmpty}>
        <Text style={s.emptyText}>Tap a score to see its details.</Text>
      </View>
    );
  }
  const jacket = data.jacket_url || data.background_url;
  const jacketUrl = typeof jacket === 'string' ? fullImageUrl(jacket) : undefined;
  const mode = String(data.mode || '');
  const level = parseInt(String(data.level ?? ''), 10) || 0;
  const score = parseInt(String(data.new_score ?? data.score ?? 0), 10) || 0;
  const grade = getGradeDisplayLabel(data.new_grade ?? data.grade, score);
  const gradeColor = TIER_COLORS[getGradeTier(data.new_grade ?? data.grade, score)];
  const replayUrl = typeof data.replay_embed_url === 'string' ? data.replay_embed_url : '';
  return (
    <View style={s.scorePanel}>
      {jacketUrl ? (
        <Image source={{ uri: jacketUrl }} style={s.scorePanelJacket} contentFit="cover" />
      ) : (
        <View style={[s.scorePanelJacket, s.scorePanelJacketFallback]} />
      )}
      <Text style={s.scorePanelTitle} numberOfLines={2}>
        {String(data.song_title || 'Score')}
      </Text>
      <Text style={s.scorePanelMeta}>
        {mode}{level ? ` · Lv ${level}` : ''}
      </Text>
      <View style={s.scorePanelScoreRow}>
        <Text style={s.scorePanelScoreNum}>{score.toLocaleString()}</Text>
        {grade ? <Text style={[s.scorePanelGrade, { color: gradeColor }]}>{grade}</Text> : null}
      </View>
      {replayUrl ? (
        <Pressable
          onPress={() => onReplay(replayUrl, String(data.song_title || ''))}
          style={({ pressed }) => [s.scorePanelReplay, pressed && { opacity: 0.85 }]}>
          <Text style={s.scorePanelReplayText}>Play replay →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PostRow({ post, s, onPress }: { post: ProfilePost; s: Styles; onPress: () => void }) {
  const { content, summary } = parseLiveSessionMarker(post.content);
  // Strip any other structured share markers ([[SHINSA_*_V1:...]]) so we
  // don't dump raw base64 into the body — the marker decoders live on
  // the feed PostCard; profile listing just shows the human text + media.
  const stripped = String(content || '').replace(/\[\[SHINSA_[A-Z_]+_V\d+:[^\]]+\]\]/g, '').trim();
  const placeholder = summary ? 'Live session recap' : '';
  const display = stripped || placeholder;
  const images = parsePostImages(post.images);
  const firstImage = images[0] ? fullImageUrl(images[0]) : undefined;
  const youtubeUrl = typeof post.youtube_url === 'string' ? post.youtube_url.trim() : '';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.postRow, pressed && { opacity: 0.85 }]}>
      <View style={s.postHeader}>
        <Text style={s.postTime}>{timeAgo(post.created_at)}</Text>
        <View style={s.postMetrics}>
          <Text style={s.postMetric}>↑ {post.pump_count ?? 0}</Text>
          <Text style={s.postMetric}>💬 {post.comment_count ?? 0}</Text>
        </View>
      </View>
      {display ? <Text style={s.postBody} numberOfLines={6}>{display}</Text> : null}
      {firstImage ? (
        <Image
          source={{ uri: firstImage }}
          style={s.postImage}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      {youtubeUrl ? (
        <View style={s.postYoutubeBadge}>
          <IconSymbol name="play.rectangle.fill" size={12} color="#7dd3fc" />
          <Text style={s.postYoutubeText}>YouTube attached</Text>
        </View>
      ) : null}
      {/* Empty-state safety: if the post has no body/image/video, surface
          something rather than rendering an invisible card so the user can
          still see "this post exists" and tap through. */}
      {!display && !firstImage && !youtubeUrl ? (
        <Text style={s.postBodyMuted}>Tap to view post</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Activity icon table. Keys match the `type` values emitted by
 * `GET /api/auth/user/:id/activity` (see server/routes/auth.js#L2299+).
 * The fallback resolver below covers the *_reply / *_comment family
 * with a single comment glyph so we don't have to enumerate every
 * surface (post/upscore/clear/community × comment/reply).
 */
const ACTIVITY_ICONS: Record<string, string> = {
  new_user: '👤',
  upscore: '📈',
  new_clear: '🎯',
  new_post: '📝',
  post_created: '📝',
  new_tournament: '🏆',
  tournament_join: '🏟️',
  tournament_win: '🥇',
  new_duel: '⚔️',
  duel_win: '🏅',
  duel_participation: '⚔️',
  new_online_duel: '🌐',
  online_duel_win: '🏅',
  online_duel_participation: '🌐',
  community_created: '🌱',
  community_joined: '🤝',
  community_moderator: '🛡️',
};

function activityIcon(type: string, category: string): string {
  if (ACTIVITY_ICONS[type]) return ACTIVITY_ICONS[type];
  // Comment-family fallback: post_comment, post_reply, upscore_comment,
  // clear_reply, community_comment, …
  if (/comment|reply/i.test(type)) return '💬';
  if (/duel/i.test(type)) return '⚔️';
  if (/tournament/i.test(type)) return '🏆';
  // Category-level fallback if the server hands us an unrecognized type.
  if (category === 'comments') return '💬';
  if (category === 'posts') return '📝';
  if (category === 'scores') return '📈';
  if (category === 'competitions') return '🏆';
  return '•';
}

function ActivityRow({ item, s }: { item: UserActivityItem; s: Styles }) {
  const icon = activityIcon(String(item.type || ''), String(item.category || ''));
  return (
    <View style={s.activityRow}>
      <Text style={s.activityIcon}>{icon}</Text>
      <Text style={s.activityMessage} numberOfLines={2}>{item.message}</Text>
      <Text style={s.activityTime}>{timeAgo(item.created_at)}</Text>
    </View>
  );
}

/**
 * Shared profile UI used by both `/profile/[id]` (route) and the Profile tab.
 * Pass `lookup` as `@username` or a raw `user_id`.
 */
export function ProfileBody({ lookup }: { lookup: string }) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();

  // Lookup can be a user_id or `@username`. Strip leading @ and treat as
  // username when it looks like one, else as id.
  const param = String(lookup || '').trim();
  const isUsername = param.startsWith('@') || !isUserId(param);
  const usernameToken = param.replace(/^@+/, '');

  const profileQuery = useQuery({
    queryKey: ['profile', isUsername ? `@${usernameToken}` : param],
    queryFn: () => (isUsername ? authApi.getUserByUsername(usernameToken) : authApi.getUser(param)),
    enabled: !!param,
  });

  const profile = profileQuery.data as User | undefined;
  const profileId = profile?.id ?? '';
  const isSelf = !!currentUser?.id && currentUser.id === profileId;

  const countsQuery = useQuery({
    queryKey: ['social-counts', profileId],
    queryFn: () => socialApi.counts(profileId),
    enabled: !!profileId,
  });

  const followStatusQuery = useQuery({
    queryKey: ['follow-status', profileId, currentUser?.id ?? null],
    queryFn: () => socialApi.followStatus(profileId),
    enabled: !!profileId && !!currentUser?.id && !isSelf,
  });

  const [tab, setTab] = useState<Tab>('overview');
  const [activitySubTab, setActivitySubTab] = useState<ActivitySubTab>('all');
  // Best-scores picker is "mode → level → list". Both are nullable until the
  // first data load completes, then we auto-pick highest-level Singles by
  // default (or whatever data the user actually has).
  const [bestMode, setBestMode] = useState<BestMode | null>(null);
  const [bestLevel, setBestLevel] = useState<number | null>(null);
  // Tap-target state for the Pumbility tab's competitive-level explainer
  // and the Rankings tab's level-leaderboard drill-down.
  const [competitiveInfo, setCompetitiveInfo] = useState<{
    mode: 'Single' | 'Double';
    level?: number;
    clearPercentage?: number;
    averageGrade?: string;
  } | null>(null);
  const [leaderboardTarget, setLeaderboardTarget] = useState<{ mode: string; level: number } | null>(null);
  const [scoreTarget, setScoreTarget] = useState<ScoreCardData | null>(null);
  const [replayTarget, setReplayTarget] = useState<{ url: string; title: string } | null>(null);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<UserAchievement | null>(null);
  const [petModalOpen, setPetModalOpen] = useState(false);
  const [addShoeOpen, setAddShoeOpen] = useState(false);
  // Top-right pumbility cell — tap toggles between overall + singles. Long
  // press / Pumbility tab gives the full breakdown.
  const [pumbilityView, setPumbilityView] = useState<'overall' | 'singles'>('overall');

  const bestScoresQuery = useQuery({
    queryKey: ['piugame-best', profileId],
    queryFn: () => piugameApi.bestScores(profileId),
    enabled: !!profileId,
    staleTime: 60_000,
  });

  const recentQuery = useQuery({
    queryKey: ['piugame-recent', profileId],
    queryFn: () => piugameApi.recentlyPlayed(profileId, { sort: 'desc', limit: 100 }),
    enabled: !!profileId && (tab === 'recent' || tab === 'overview'),
    staleTime: 60_000,
  });

  // Year-of-plays for the activity heatmap. Separate from `recentQuery` because
  // that's intentionally capped at 100 most-recent rows, which doesn't fill the
  // calendar — the heatmap needs every play in the year, no limit.
  const heatmapQuery = useQuery({
    queryKey: ['piugame-recent-heatmap', profileId, new Date().getUTCFullYear()],
    queryFn: () => piugameApi.recentlyPlayed(profileId, { sort: 'desc', year: new Date().getUTCFullYear() }),
    enabled: !!profileId && tab === 'overview',
    staleTime: 5 * 60_000,
  });

  const postsQuery = useQuery({
    queryKey: ['user-posts', profileId],
    queryFn: () => socialApi.userPosts(profileId, 1),
    enabled: !!profileId && tab === 'posts',
    staleTime: 30_000,
  });

  const activityQuery = useQuery({
    queryKey: ['user-activity', profileId],
    queryFn: () => authApi.getUserActivity(profileId),
    enabled: !!profileId && tab === 'activity',
    staleTime: 30_000,
  });

  // Long-cached lookup that resolves song titles to local jacket URLs. The
  // best-scores endpoint only stores generic background_url placeholders, so we
  // need this to render real jacket art per song.
  const jacketMapQuery = useQuery({
    queryKey: ['songs-jacket-map'],
    queryFn: () => songsApi.jacketMap(),
    staleTime: 60 * 60_000,
  });
  const jacketMap = jacketMapQuery.data;

  // Header surfaces singles/doubles pumbility, best clears (S/D), and a few
  // other derived facts. Eagerly fetched since the header is always visible.
  const analyticsQuery = useQuery({
    queryKey: ['song-analytics', profileId],
    queryFn: () => songsApi.songAnalytics(profileId),
    enabled: !!profileId,
    staleTime: 5 * 60_000,
  });

  const achievementsQuery = useQuery({
    queryKey: ['user-achievements', profileId],
    queryFn: () => authApi.getUserAchievements(profileId),
    enabled: !!profileId,
    staleTime: 5 * 60_000,
  });

  // "Live now" indicator in the header — checked eagerly, cheap and small.
  const liveActiveQuery = useQuery({
    queryKey: ['live-profile-header', profileId],
    queryFn: () => liveApi.profile(profileId),
    enabled: !!profileId,
    staleTime: 30_000,
  });

  // Desktop only: training-load summary for the right-rail "Optimise" card.
  // Cheap to fetch (server caches the EWMA roll-up) and only enabled when
  // the desktop layout will actually consume it.
  const trainingLoadQuery = useQuery({
    queryKey: ['training-load', profileId],
    queryFn: () => piugameApi.trainingLoad(profileId),
    enabled: !!profileId && isDesktop,
    staleTime: 5 * 60_000,
  });

  // Optional pet — shows as a small overlay on the avatar; tap opens PetModal.
  const petQuery = useQuery({
    queryKey: ['public-pet', profileId],
    queryFn: () => authApi.getPublicPet(profileId),
    enabled: !!profileId,
    staleTime: 60_000,
    retry: false,
  });

  // Activity-notification preferences — only relevant when viewing someone else.
  const notifPrefsQuery = useQuery({
    queryKey: ['activity-notif-prefs', profileId],
    queryFn: () => socialApi.activityNotifications(profileId),
    enabled: !!profileId && !!currentUser?.id && !isSelf,
    staleTime: 60_000,
  });

  const notifPrefsMutation = useMutation({
    mutationFn: (next: { notify_posts?: boolean; notify_upscores?: boolean; notify_new_clears?: boolean }) =>
      socialApi.setActivityNotifications(profileId, next),
    onSuccess: (data) => {
      queryClient.setQueryData(['activity-notif-prefs', profileId], data);
    },
  });

  // Owner-only sync mutation for recent plays. Best-scores sync lives on the
  // Account screen since it's a heavier one-time operation.
  const syncRecentMutation = useMutation({
    mutationFn: () => piugameApi.syncRecentlyPlayed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['piugame-recent', profileId] });
    },
  });

  const pumbilityQuery = useQuery({
    queryKey: ['piugame-pumbility', profileId],
    queryFn: () => piugameApi.pumbility(profileId),
    enabled: !!profileId && tab === 'pumbility',
    staleTime: 60_000,
  });

  const statsQuery = useQuery({
    queryKey: ['user-stats', profileId],
    queryFn: () => authApi.getUserStats(profileId),
    enabled: !!profileId && tab === 'competitions',
    staleTime: 60_000,
  });

  // Weekly Challenge participation history. Only loaded when the
  // Competitions tab is open since the user might never visit it.
  const wcHistoryQuery = useQuery({
    queryKey: ['wc-user-history', profileId],
    queryFn: () => weeklyChallengesApi.userHistory(profileId),
    enabled: !!profileId && tab === 'competitions',
    staleTime: 60_000,
  });

  const followersQuery = useQuery({
    queryKey: ['followers', profileId],
    queryFn: () => socialApi.followers(profileId),
    enabled: !!profileId && tab === 'followers',
    staleTime: 60_000,
  });

  const followingQuery = useQuery({
    queryKey: ['following', profileId],
    queryFn: () => socialApi.following(profileId),
    enabled: !!profileId && tab === 'followers',
    staleTime: 60_000,
  });

  // Current viewer's following list — drives the per-row Follow/Following
  // button on the target profile's Followers/Following lists.
  const myFollowingQuery = useQuery({
    queryKey: ['following', currentUser?.id ?? null],
    queryFn: () => socialApi.following(currentUser?.id ?? ''),
    enabled: !!currentUser?.id && tab === 'followers',
    staleTime: 60_000,
  });

  const followToggleMutation = useMutation({
    mutationFn: async ({ userId, next }: { userId: string; next: boolean }) =>
      next ? socialApi.follow(userId) : socialApi.unfollow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['following', currentUser?.id ?? null] });
      queryClient.invalidateQueries({ queryKey: ['social-counts', profileId] });
    },
  });

  const liveProfileQuery = useQuery({
    queryKey: ['live-profile', profileId],
    queryFn: () => liveApi.profile(profileId),
    enabled: !!profileId && tab === 'live',
    staleTime: 30_000,
  });

  const titlesQuery = useQuery({
    queryKey: ['piugame-titles', profileId],
    queryFn: () => piugameApi.titles(profileId),
    enabled: !!profileId && tab === 'titles',
    staleTime: 5 * 60_000,
  });

  const shoesQuery = useQuery({
    queryKey: ['piugame-shoes', profileId],
    queryFn: () => piugameApi.shoes(profileId),
    enabled: !!profileId && tab === 'shoes',
    staleTime: 60_000,
  });

  const wearShoeMutation = useMutation({
    mutationFn: (shoeId: number) => piugameApi.wearShoe(shoeId),
    onMutate: async (shoeId) => {
      // Optimistic update — flip is_current locally so the UI snaps before
      // the round-trip finishes. Server response will replace it on success.
      await queryClient.cancelQueries({ queryKey: ['piugame-shoes', profileId] });
      const prev = queryClient.getQueryData<typeof shoesQuery.data>(['piugame-shoes', profileId]);
      if (prev) {
        queryClient.setQueryData(['piugame-shoes', profileId], {
          ...prev,
          active_shoe_id: shoeId,
          shoes: (prev.shoes || []).map((sh) => ({
            ...sh,
            is_current: sh.id === shoeId,
            status: sh.id === shoeId ? 'current' : (sh.retired_at ? 'retired' : 'available'),
          })),
        });
      }
      return { prev };
    },
    onError: (_err, _shoeId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['piugame-shoes', profileId], ctx.prev);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['piugame-shoes', profileId], data);
    },
  });

  const retireShoeMutation = useMutation({
    mutationFn: (shoeId: number) => piugameApi.retireShoe(shoeId),
    onSuccess: (data) => {
      queryClient.setQueryData(['piugame-shoes', profileId], data.cabinet);
    },
  });

  const deleteShoeMutation = useMutation({
    mutationFn: (shoeId: number) => piugameApi.deleteShoe(shoeId),
    onSuccess: (data) => {
      queryClient.setQueryData(['piugame-shoes', profileId], data.cabinet);
    },
  });

  const handleRetireShoe = (shoeId: number, name: string) => {
    Alert.alert(
      'Retire shoe?',
      `“${name}” will be marked as retired. You can still see it in the cabinet for history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retire', style: 'destructive', onPress: () => retireShoeMutation.mutate(shoeId) },
      ],
    );
  };

  const handleDeleteShoe = (shoeId: number, name: string) => {
    Alert.alert(
      'Delete shoe?',
      `“${name}” will be removed from your cabinet permanently. Past plays linked to it will lose the connection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteShoeMutation.mutate(shoeId) },
      ],
    );
  };

  const handleShoeActions = (shoe: PiugameShoe) => {
    const name = `${shoe.make || ''} ${shoe.model || ''}`.trim() || 'this shoe';
    const options: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (!shoe.retired_at && !shoe.is_current) {
      options.push({ text: 'Wear', onPress: () => wearShoeMutation.mutate(shoe.id) });
    }
    if (!shoe.retired_at) {
      options.push({ text: 'Retire', style: 'destructive', onPress: () => handleRetireShoe(shoe.id, name) });
    }
    options.push({ text: 'Delete', style: 'destructive', onPress: () => handleDeleteShoe(shoe.id, name) });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(name, undefined, options);
  };

  const skillBreakdownQuery = useQuery({
    queryKey: ['skill-breakdown', profileId],
    queryFn: () => songsApi.skillBreakdown(profileId),
    enabled: !!profileId && tab === 'overview',
    staleTime: 5 * 60_000,
  });

  const rankingsQuery = useQuery({
    queryKey: ['rankings', profileId],
    queryFn: () => songsApi.rankings(profileId),
    enabled: !!profileId && tab === 'overview',
    staleTime: 5 * 60_000,
  });

  // Best clears = highest level passed in each mode. Computed from best scores
  // once they're loaded (best-scores endpoint already filters to passing scores).
  const allBestForClears = bestScoresQuery.data?.scores ?? [];
  const bestClearSingle = allBestForClears
    .filter((row) => row.mode === 'Single')
    .reduce((max, row) => Math.max(max, Number(row.level) || 0), 0);
  const bestClearDouble = allBestForClears
    .filter((row) => row.mode === 'Double')
    .reduce((max, row) => Math.max(max, Number(row.level) || 0), 0);

  const followMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) return socialApi.follow(profileId);
      return socialApi.unfollow(profileId);
    },
    onMutate: async (next) => {
      const prev = followStatusQuery.data;
      queryClient.setQueryData(['follow-status', profileId, currentUser?.id ?? null], { following: next });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['follow-status', profileId, currentUser?.id ?? null], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['social-counts', profileId] });
    },
  });

  // Open (or create) a 1:1 DM with this profile and route into the thread.
  // Mirrors liketu's `getOrCreateChatDirectConversation` flow — server is
  // idempotent so tapping Message twice on the same profile reuses the
  // existing conversation.
  const openDirectMessageMutation = useMutation({
    mutationFn: () => messagesApi.getOrCreateDirect(profileId),
    onSuccess: (result) => {
      // Warm the inbox so the new (or surfaced) row shows up if the user
      // backs out of the thread before sending anything.
      queryClient.invalidateQueries({ queryKey: getMessagesInboxQueryKey(currentUser?.id) });
      router.push({ pathname: '/conversation/[id]', params: { id: result.conversation.id } });
    },
  });

  const buildScoreData = (entry: PiugameBestScore | PiugameRecentPlay): ScoreCardData => ({
    song_title: entry.song_title,
    artist: entry.artist,
    mode: entry.mode,
    level: entry.level,
    chart_id: entry.chart_id,
    play_id: entry.play_id ?? entry.id,
    jacket_url: entry.jacket_url || entry.background_url,
    score: Number(entry.score) || 0,
    grade: entry.grade,
    plate: entry.plate,
    is_stage_break: !!entry.is_stage_break,
    perfect: Number(entry.perfect) || 0,
    great: Number(entry.great) || 0,
    good: Number(entry.good) || 0,
    bad: Number(entry.bad) || 0,
    miss: Number(entry.miss) || 0,
    max_combo: Number(entry.max_combo) || 0,
    played_at_utc: entry.played_at_utc || entry.date_played,
    machine_name: typeof (entry as Record<string, unknown>).machine_name === 'string'
      ? (entry as { machine_name?: string }).machine_name
      : undefined,
    replay_embed_url: entry.replay_embed_url,
    username: profile?.username,
    avatar: typeof profile?.avatar === 'string' ? profile.avatar : undefined,
  });

  const onReplay = (url: string, title: string) => setReplayTarget({ url, title });

  // Best-scores derivations live above the early-returns below — moving
  // them down was a Rules-of-Hooks violation: the first render bailed at
  // the loading branch with N hooks, then once profileQuery resolved we
  // suddenly had N+3 hooks, which production React turns into a silent
  // white-screen via its "Rendered more hooks" invariant.
  const allBest = bestScoresQuery.data?.scores ?? [];
  // Flat score-desc list — still used for the Top Scores section on Overview.
  const sortedBest = useMemo(
    () => [...allBest].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)),
    [allBest],
  );

  // Which modes the user actually has scores in — drives which pills are
  // tappable. CoOp is intentionally only shown when the user has any CoOp
  // scores (matches the rest of the app's "don't surface empty modes" rule).
  const availableBestModes = useMemo<BestMode[]>(() => {
    const seen = new Set<string>();
    for (const s of allBest) {
      const m = String(s.mode || '');
      if (m === 'Single' || m === 'Double' || m === 'CoOp') seen.add(m);
    }
    return BEST_MODE_FILTERS.map((opt) => opt.key).filter((m) => seen.has(m));
  }, [allBest]);

  // Levels at the currently-selected mode, descending so the chevron
  // picker walks hardest-first by default.
  const availableBestLevels = useMemo<number[]>(() => {
    if (!bestMode) return [];
    const set = new Set<number>();
    for (const s of allBest) {
      if (String(s.mode || '') !== bestMode) continue;
      const lvl = Number(s.level) || 0;
      if (lvl > 0) set.add(lvl);
    }
    return [...set].sort((a, b) => b - a);
  }, [allBest, bestMode]);

  // Auto-pick a sensible default on first data load (or when the picked
  // mode/level becomes invalid because the data shifted).
  useEffect(() => {
    if (availableBestModes.length === 0) {
      if (bestMode !== null) setBestMode(null);
      if (bestLevel !== null) setBestLevel(null);
      return;
    }
    if (!bestMode || !availableBestModes.includes(bestMode)) {
      // Prefer Doubles → Singles → CoOp when the user has multiple modes,
      // matching the rest of the app's default-mode bias.
      const preferred = availableBestModes.find((m) => m === 'Double')
        ?? availableBestModes.find((m) => m === 'Single')
        ?? availableBestModes[0];
      setBestMode(preferred);
      return;
    }
    if (availableBestLevels.length === 0) {
      if (bestLevel !== null) setBestLevel(null);
      return;
    }
    if (bestLevel == null || !availableBestLevels.includes(bestLevel)) {
      // Highest available level — sorts users to their hardest clears first.
      setBestLevel(availableBestLevels[0]);
    }
  }, [availableBestModes, availableBestLevels, bestMode, bestLevel]);

  // Charts visible on the Best Scores tab: only the selected (mode, level)
  // bucket, sorted by score descending so personal-bests are at the top.
  const bestVisible = useMemo(() => {
    if (!bestMode || bestLevel == null) return [];
    return allBest
      .filter((s) => String(s.mode || '') === bestMode && Number(s.level) === bestLevel)
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  }, [allBest, bestMode, bestLevel]);

  if (profileQuery.isLoading) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Profile' }} />
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Profile' }} />
        <View style={s.center}>
          <Text style={s.errorText}>
            {profileQuery.error instanceof Error ? profileQuery.error.message : 'Profile not found'}
          </Text>
        </View>
      </View>
    );
  }

  const avatarUrl = typeof profile.avatar === 'string' ? fullImageUrl(profile.avatar) : undefined;
  const counts = countsQuery.data;
  const isFollowing = !!followStatusQuery.data?.following;
  const analytics = analyticsQuery.data;
  const nationality = getCountryFlag(typeof profile.nationality === 'string' ? profile.nationality : '');
  const genderSymbol = getGenderSymbol(typeof profile.gender === 'string' ? profile.gender : '');
  const age = profile.show_age && typeof profile.date_of_birth === 'string'
    ? getAge(profile.date_of_birth)
    : null;
  const groupBadges = Array.isArray(profile.group_badges) ? (profile.group_badges as Record<string, unknown>[]) : [];
  const pet = petQuery.data?.pet ?? null;
  // Group achievements by series, keeping only the highest tier per series.
  // Mirrors `client/src/pages/ProfilePage.jsx#achievementSeriesDisplay`.
  const achievements = (() => {
    const all = achievementsQuery.data?.achievements ?? [];
    if (all.length === 0) return [];
    const bySeries: Record<string, UserAchievement> = {};
    for (const badge of all) {
      const sid = String(badge.series_id ?? badge.series_key ?? badge.name ?? '');
      if (!sid) continue;
      const current = bySeries[sid];
      const currentThreshold = Number(current?.threshold) || 0;
      const badgeThreshold = Number(badge.threshold) || 0;
      if (!current || badgeThreshold > currentThreshold) {
        bySeries[sid] = badge;
      }
    }
    return Object.values(bySeries);
  })();

  // Best-scores chevron-picker derivations — non-hook, can stay below the
  // early-return; the hooks themselves are hoisted above it (see top of
  // this function for the rationale).
  const bestLevelIdx = bestLevel != null ? availableBestLevels.indexOf(bestLevel) : -1;
  const canBestPrev = bestLevelIdx >= 0 && bestLevelIdx < availableBestLevels.length - 1;
  const canBestNext = bestLevelIdx > 0;
  const goBestPrev = () => {
    if (canBestPrev) setBestLevel(availableBestLevels[bestLevelIdx + 1]);
  };
  const goBestNext = () => {
    if (canBestNext) setBestLevel(availableBestLevels[bestLevelIdx - 1]);
  };

  const allRecent = recentQuery.data?.plays ?? [];

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: profile.username ? `@${profile.username}` : 'Profile' }} />
      <View style={isDesktop ? s.deskRow : { flex: 1 }}>
      {isDesktop ? (
        <View style={s.deskIdentityRail}>
          <View style={s.deskIdentityHead}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.deskIdentityAvatar} contentFit="cover" />
            ) : (
              <View style={[s.deskIdentityAvatar, s.avatarFallback]}>
                <Text style={s.avatarLetter}>{(profile.username || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={s.deskIdentityUser} numberOfLines={1}>@{profile.username || 'anonymous'}</Text>
            {profile.skill_title ? (
              <Text style={s.deskIdentitySkill} numberOfLines={1}>{profile.skill_title}</Text>
            ) : null}
            {liveActiveQuery.data?.active_session ? (
              <Pressable
                onPress={() => router.push({
                  pathname: '/live/[id]',
                  params: { id: String(liveActiveQuery.data?.active_session?.id || '') },
                })}
                style={({ pressed }) => [s.deskLivePill, pressed && { opacity: 0.8 }]}>
                <View style={s.livePillDot} />
                <Text style={s.livePillText}>LIVE NOW</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Pumbility tile */}
          {(() => {
            const pumb = typeof analytics?.pumbility === 'number'
              ? analytics.pumbility
              : typeof profile.pumbility === 'number'
                ? profile.pumbility
                : null;
            return (
              <View style={s.deskPumTile}>
                <Text style={s.deskPumLabel}>PUMBILITY</Text>
                <Text style={s.deskPumValue}>{pumb != null ? formatNumber(pumb) : '—'}</Text>
                {(bestClearSingle > 0 || bestClearDouble > 0) ? (
                  <View style={s.deskPumChips}>
                    {bestClearSingle > 0 ? <Text style={s.deskPumChip}>S{bestClearSingle}</Text> : null}
                    {bestClearDouble > 0 ? <Text style={s.deskPumChip}>D{bestClearDouble}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })()}

          {/* Action row */}
          {!isSelf && currentUser ? (
            <View style={s.deskActionStack}>
              <Pressable
                onPress={() => followMutation.mutate(!isFollowing)}
                disabled={followMutation.isPending}
                style={({ pressed }) => [
                  s.deskFollowBtn,
                  isFollowing && s.deskFollowBtnActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={[s.deskFollowText, isFollowing && s.deskFollowTextActive]}>
                  {followMutation.isPending ? '…' : isFollowing ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => openDirectMessageMutation.mutate()}
                disabled={openDirectMessageMutation.isPending}
                style={({ pressed }) => [s.deskMessageBtn, pressed && { opacity: 0.7 }]}>
                <IconSymbol name="bubble.left.and.bubble.right.fill" size={12} color={theme.text} />
                <Text style={s.deskMessageText}>Message</Text>
              </Pressable>
            </View>
          ) : isSelf ? (
            <View style={s.deskActionStack}>
              <Pressable
                onPress={() => router.push('/profile/edit')}
                style={({ pressed }) => [s.deskMessageBtn, pressed && { opacity: 0.7 }]}>
                <Text style={s.deskMessageText}>Edit profile</Text>
              </Pressable>
              {/* Mirror the mobile-width "Sync recent" button so the desktop
                  layout doesn't lose the ability to pull fresh PIUGame plays
                  without leaving the profile. */}
              <Pressable
                onPress={() => {
                  Alert.alert(
                    'Sync recent plays?',
                    'Pulls your most recent plays from PIUGame. This usually takes a few seconds.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Sync', onPress: () => syncRecentMutation.mutate() },
                    ],
                  );
                }}
                disabled={syncRecentMutation.isPending}
                style={({ pressed }) => [s.deskMessageBtn, pressed && { opacity: 0.7 }]}>
                {syncRecentMutation.isPending
                  ? <ActivityIndicator size="small" color={theme.text} />
                  : <Text style={s.deskMessageText}>Sync recent</Text>}
              </Pressable>
            </View>
          ) : null}

          {/* Quick stats */}
          <View style={s.deskStatsGrid}>
            <Pressable hitSlop={4} onPress={() => setTab('posts')} style={s.deskStatCell}>
              <Text style={s.deskStatNum}>{formatNumber(counts?.posts_count)}</Text>
              <Text style={s.deskStatLabel}>posts</Text>
            </Pressable>
            <Pressable hitSlop={4} onPress={() => setTab('followers')} style={s.deskStatCell}>
              <Text style={s.deskStatNum}>{formatNumber(counts?.followers_count)}</Text>
              <Text style={s.deskStatLabel}>followers</Text>
            </Pressable>
            <Pressable hitSlop={4} onPress={() => setTab('followers')} style={s.deskStatCell}>
              <Text style={s.deskStatNum}>{formatNumber(counts?.following_count)}</Text>
              <Text style={s.deskStatLabel}>following</Text>
            </Pressable>
            {counts?.total_pumps !== undefined ? (
              <View style={s.deskStatCell}>
                <Text style={s.deskStatNum}>{formatNumber(counts.total_pumps)}</Text>
                <Text style={s.deskStatLabel}>pumps</Text>
              </View>
            ) : null}
          </View>

          {/* Badge rail */}
          {(achievements.length > 0 || groupBadges.length > 0) ? (
            <View>
              <Text style={s.deskRailLabel}>BADGES</Text>
              <View style={s.deskBadgeWrap}>
                {achievements.slice(0, 12).map((ach) => {
                  const img = typeof ach.image === 'string' && ach.image ? fullImageUrl(ach.image) : '';
                  return (
                    <Pressable
                      key={`ach-${String(ach.tier_id ?? ach.series_key ?? ach.name)}`}
                      onPress={() => setSelectedAchievement(ach)}
                      style={({ pressed }) => [s.deskBadgeBox, pressed && { opacity: 0.7 }]}>
                      {img ? (
                        <Image source={{ uri: img }} style={s.deskBadgeImg} contentFit="contain" />
                      ) : (
                        <Text style={s.deskBadgeFallback}>🏅</Text>
                      )}
                    </Pressable>
                  );
                })}
                {/* Group-assigned badges (e.g. Pump Dojo). The mobile-width
                    layout already renders these alongside achievements; the
                    desktop rail was only iterating achievements, so dojo
                    members lost their group badge on wide screens. */}
                {groupBadges.map((b, i) => {
                  const img = typeof b.image === 'string' ? fullImageUrl(b.image as string) : '';
                  return (
                    <View key={`grp-${String(b.id ?? i)}`} style={s.deskBadgeBox}>
                      {img ? (
                        <Image source={{ uri: img }} style={s.deskBadgeImg} contentFit="contain" />
                      ) : (
                        <Text style={s.deskBadgeFallback}>{String((b.name as string) || '·').slice(0, 2)}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Mobile: full header with identity, action, stats, badges in the
            scroll. Desktop: those live in the left identity rail (see the
            top of this return), so the center column only renders the tabs
            + tab body. */}
        {!isDesktop && (
        <View style={s.header}>
          {/* ─── Identity row: avatar + name + meta + pumbility cell ─── */}
          <View style={s.identityRow}>
            <View style={s.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" />
              ) : (typeof profile.pumbility === 'number' && profile.pumbility > 0) ? (
                // Synced player without a custom avatar — animated Alien Pig fallback
                // so they don't get a generic letter chip.
                <DefaultAvatar size={88} />
              ) : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <Text style={s.avatarLetter}>{(profile.username || '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              {pet ? (
                <Pressable
                  onPress={() => setPetModalOpen(true)}
                  hitSlop={4}
                  style={({ pressed }) => [s.petOverlay, pressed && { opacity: 0.7 }]}>
                  <Text style={s.petOverlayEmoji}>{petCharacterEmoji(String(pet.character || 'dojocat'))}</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={s.identityCol}>
              <View style={s.nameLine}>
                {nationality ? <Text style={s.flagText}>{nationality}</Text> : null}
                <Text style={s.username} numberOfLines={1}>@{profile.username || 'anonymous'}</Text>
                {genderSymbol ? <Text style={s.gender}>{genderSymbol}</Text> : null}
                {liveActiveQuery.data?.active_session ? (
                  <View style={s.livePill}>
                    <View style={s.livePillDot} />
                    <Text style={s.livePillText}>LIVE</Text>
                  </View>
                ) : null}
              </View>
              {(typeof profile.skill_title === 'string' && profile.skill_title) || age != null ? (
                <Text style={s.skill} numberOfLines={1}>
                  {[profile.skill_title, age != null ? `${age} yo` : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {(profile.location_city || profile.location_country || profile.created_at) ? (
                <Text style={s.metaLine} numberOfLines={1}>
                  {[
                    [profile.location_city, profile.location_country].filter(Boolean).join(', '),
                    profile.created_at ? formatMemberSince(String(profile.created_at)) : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            {/* Top-right pumbility cell. Tap toggles overall ↔ singles; long
                press jumps to the full Pumbility tab. */}
            {(() => {
              const showSingles = pumbilityView === 'singles' && typeof analytics?.singles_pumbility === 'number';
              const value = showSingles
                ? analytics?.singles_pumbility
                : (typeof analytics?.pumbility === 'number'
                    ? analytics.pumbility
                    : (typeof profile.pumbility === 'number' ? profile.pumbility : null));
              const label = showSingles ? 'SINGLES PB' : 'PUMBILITY';
              // Show the user's HIGHEST cleared level in each mode (the
              // chunky `S25` / `D25` flex), not the competitive-level value
              // — competitive level requires 50% coverage + avg S grade, so
              // it lags well behind the player's real ceiling and isn't
              // what visitors care about at a glance. The competitive level
              // still has its own dedicated cards on the Overview tab.
              const bestS = bestClearSingle;
              const bestD = bestClearDouble;
              return (
                <Pressable
                  onPress={() => setPumbilityView((v) => (v === 'overall' ? 'singles' : 'overall'))}
                  onLongPress={() => setTab('pumbility')}
                  hitSlop={6}
                  style={({ pressed }) => [s.pumbilityCell, pressed && { opacity: 0.7 }]}>
                  <Text style={s.pumbilityCellLabel}>{label}</Text>
                  <Text style={s.pumbilityCellValue}>
                    {value != null ? formatNumber(value) : '—'}
                  </Text>
                  {bestS > 0 || bestD > 0 ? (
                    <View style={s.pumbilityCellChipsRow}>
                      {bestS > 0 ? <Text style={s.pumbilityCellChip}>S{bestS}</Text> : null}
                      {bestD > 0 ? <Text style={s.pumbilityCellChip}>D{bestD}</Text> : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            })()}
          </View>

          {typeof profile.description === 'string' && profile.description ? (
            <Text style={s.description}>{profile.description}</Text>
          ) : null}

          {/* ─── Action row ────────────────────────────────────────────── */}
          {!isSelf && currentUser ? (
            <View style={s.actionRow}>
              <Pressable
                onPress={() => followMutation.mutate(!isFollowing)}
                disabled={followMutation.isPending}
                style={({ pressed }) => [
                  s.followBtn,
                  isFollowing && s.followBtnActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={[s.followText, isFollowing && s.followTextActive]}>
                  {followMutation.isPending ? '…' : isFollowing ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => openDirectMessageMutation.mutate()}
                disabled={openDirectMessageMutation.isPending}
                style={({ pressed }) => [s.messageBtn, pressed && { opacity: 0.7 }]}>
                {openDirectMessageMutation.isPending ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <IconSymbol name="bubble.left.and.bubble.right.fill" size={14} color={theme.text} />
                )}
                <Text style={s.messageText}>Message</Text>
              </Pressable>
              <Pressable
                onPress={() => setNotifMenuOpen((v) => !v)}
                style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}>
                <IconSymbol name="bell.fill" size={16} color={notifPrefsQuery.data?.subscribed ? theme.accent : theme.textMuted} />
              </Pressable>
            </View>
          ) : null}

          {isSelf ? (
            <View style={s.actionRow}>
              <Pressable
                onPress={() => router.push('/profile/edit')}
                style={({ pressed }) => [s.messageBtn, pressed && { opacity: 0.7 }]}>
                <Text style={s.messageText}>Edit profile</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Alert.alert(
                    'Sync recent plays?',
                    'Pulls your most recent plays from PIUGame. This usually takes a few seconds.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Sync', onPress: () => syncRecentMutation.mutate() },
                    ],
                  );
                }}
                disabled={syncRecentMutation.isPending}
                style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}>
                {syncRecentMutation.isPending ? <ActivityIndicator size="small" color={theme.text} /> : <Text style={s.syncBtnText}>Sync recent</Text>}
              </Pressable>
            </View>
          ) : null}

          {!isSelf && notifMenuOpen && notifPrefsQuery.data ? (
            <View style={s.notifMenuCard}>
              <Text style={s.notifMenuTitle}>Notify me about</Text>
              <NotifToggle
                label="New posts"
                value={!!notifPrefsQuery.data.notify_posts}
                onChange={(v) => notifPrefsMutation.mutate({ notify_posts: v })}
                s={s}
              />
              <NotifToggle
                label="Upscores"
                value={!!notifPrefsQuery.data.notify_upscores}
                onChange={(v) => notifPrefsMutation.mutate({ notify_upscores: v })}
                s={s}
              />
              <NotifToggle
                label="New clears"
                value={!!notifPrefsQuery.data.notify_new_clears}
                onChange={(v) => notifPrefsMutation.mutate({ notify_new_clears: v })}
                s={s}
              />
            </View>
          ) : null}

          {/* ─── Stats line: posts · followers · following · pumps ────── */}
          <View style={s.statsLine}>
            <Pressable hitSlop={4} onPress={() => setTab('posts')}>
              <Text style={s.statsLineText}>
                <Text style={s.statsLineNumber}>{formatNumber(counts?.posts_count)}</Text> posts
              </Text>
            </Pressable>
            <Text style={s.statsLineDot}>·</Text>
            <Pressable hitSlop={4} onPress={() => setTab('followers')}>
              <Text style={s.statsLineText}>
                <Text style={s.statsLineNumber}>{formatNumber(counts?.followers_count)}</Text> followers
              </Text>
            </Pressable>
            <Text style={s.statsLineDot}>·</Text>
            <Pressable hitSlop={4} onPress={() => setTab('followers')}>
              <Text style={s.statsLineText}>
                <Text style={s.statsLineNumber}>{formatNumber(counts?.following_count)}</Text> following
              </Text>
            </Pressable>
            {counts?.total_pumps !== undefined ? (
              <>
                <Text style={s.statsLineDot}>·</Text>
                <Text style={s.statsLineText}>
                  <Text style={s.statsLineNumber}>{formatNumber(counts.total_pumps)}</Text> pumps
                </Text>
              </>
            ) : null}
          </View>

          {/* ─── Combined badges strip: achievements + group ─────────── */}
          {(achievements.length > 0 || groupBadges.length > 0) ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgeStrip}>
              {achievements.map((ach) => {
                const img = typeof ach.image === 'string' && ach.image ? fullImageUrl(ach.image) : '';
                return (
                  <Pressable
                    key={`ach-${String(ach.tier_id ?? ach.series_key ?? ach.name)}`}
                    onPress={() => setSelectedAchievement(ach)}
                    style={({ pressed }) => [s.badgeWrap, pressed && { opacity: 0.7 }]}>
                    {img ? (
                      <Image source={{ uri: img }} style={s.badgeImg} contentFit="contain" />
                    ) : (
                      <View style={[s.badgeImg, s.badgeImgFallback]}><Text style={s.badgeFallbackText}>🏅</Text></View>
                    )}
                  </Pressable>
                );
              })}
              {groupBadges.map((b, i) => {
                const img = typeof b.image === 'string' ? fullImageUrl(b.image as string) : '';
                return (
                  <View key={`grp-${String(b.id ?? i)}`} style={s.badgeWrap}>
                    {img ? (
                      <Image source={{ uri: img }} style={s.badgeImg} contentFit="contain" />
                    ) : (
                      <Text style={s.groupBadgeFallback}>{String((b.name as string) || '·').slice(0, 2)}</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={({ pressed }) => [s.tabBtn, tab === t.key && s.tabBtnActive, pressed && { opacity: 0.7 }]}>
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'overview' && (
          <OverviewTab
            recent={allRecent.slice(0, 6)}
            topScores={sortedBest.slice(0, 5)}
            counts={counts}
            analytics={analytics}
            skillBreakdown={skillBreakdownQuery.data}
            rankings={rankingsQuery.data}
            jacketMap={jacketMap}
            heatmapPlays={heatmapQuery.data?.plays ?? allRecent}
            isSelf={isSelf}
            ownerUserId={profileId}
            s={s}
            onScorePress={(entry) => setScoreTarget(buildScoreData(entry))}
            onChartPress={(chartId) => router.push({ pathname: '/song/[id]', params: { id: String(chartId) } })}
            onCompetitiveLevelPress={setCompetitiveInfo}
            onRankingPress={setLeaderboardTarget}
          />
        )}

        {tab === 'best' && (
          <View style={s.section}>
            {bestScoresQuery.isLoading ? (
              <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
            ) : bestScoresQuery.isError ? (
              <Text style={s.errorText}>{bestScoresQuery.error instanceof Error ? bestScoresQuery.error.message : 'Failed to load'}</Text>
            ) : allBest.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No best scores yet</Text>
              </View>
            ) : (
              <>
                {/* Mode pill row — only modes the user has scores in are
                    shown, so the picker can't land on an empty state. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.activitySubTabRow}>
                  {availableBestModes.map((opt) => {
                    const active = bestMode === opt;
                    const label = BEST_MODE_FILTERS.find((f) => f.key === opt)?.label || opt;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setBestMode(opt)}
                        style={({ pressed }) => [
                          s.activitySubTab,
                          active && [s.activitySubTabActive, { backgroundColor: BEST_MODE_ACCENT[opt], borderColor: BEST_MODE_ACCENT[opt] }],
                          pressed && { opacity: 0.7 },
                        ]}>
                        <Text style={[s.activitySubTabText, active && s.activitySubTabTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Level chevron picker. Compact, sits between the mode
                    pills and the chart so the level number is always the
                    visual anchor. */}
                {bestMode && availableBestLevels.length > 0 && bestLevel != null ? (
                  <View style={s.bestLevelPicker}>
                    <Pressable
                      onPress={goBestPrev}
                      disabled={!canBestPrev}
                      hitSlop={6}
                      style={({ pressed }) => [s.iconBtnSmall, pressed && { opacity: 0.6 }, !canBestPrev && { opacity: 0.25 }]}
                      accessibilityLabel="Easier level">
                      <IconSymbol name="chevron.left" size={20} color={theme.textMuted} />
                    </Pressable>
                    <View style={[s.bestLevelPill, { backgroundColor: `${BEST_MODE_ACCENT[bestMode]}1f` }]}>
                      <View style={[s.bestLevelStripe, { backgroundColor: BEST_MODE_ACCENT[bestMode] }]} />
                      <Text style={[s.bestLevelModeLabel, { color: BEST_MODE_ACCENT[bestMode] }]}>
                        {bestMode === 'Single' ? 'S' : bestMode === 'Double' ? 'D' : 'C'}
                      </Text>
                      <Text style={s.bestLevelNumber}>{bestLevel}</Text>
                      <Text style={s.bestLevelCount}>· {bestVisible.length} chart{bestVisible.length === 1 ? '' : 's'}</Text>
                    </View>
                    <Pressable
                      onPress={goBestNext}
                      disabled={!canBestNext}
                      hitSlop={6}
                      style={({ pressed }) => [s.iconBtnSmall, pressed && { opacity: 0.6 }, !canBestNext && { opacity: 0.25 }]}
                      accessibilityLabel="Harder level">
                      <IconSymbol name="chevron.right" size={20} color={theme.textMuted} />
                    </Pressable>
                  </View>
                ) : null}

                {/* Grade distribution chart — same set of scores that's
                    rendered in the list below. Auto-hides when there's no
                    selection yet. */}
                {bestVisible.length > 0 ? (
                  <GradeDistributionChart
                    scores={bestVisible}
                    caption={bestMode && bestLevel != null
                      ? `${bestMode === 'Single' ? 'S' : bestMode === 'Double' ? 'D' : 'C'}${bestLevel}`
                      : undefined}
                  />
                ) : null}

                {bestVisible.length === 0 ? (
                  <View style={s.emptyCard}>
                    <Text style={s.emptyText}>
                      {bestMode
                        ? `No ${bestMode === 'Single' ? 'Singles' : bestMode === 'Double' ? 'Doubles' : 'Co-Op'} scores yet`
                        : 'Pick a mode to see your scores'}
                    </Text>
                  </View>
                ) : isDesktop ? (
                  <View style={s.desk2col}>
                    <View style={[s.listCard, s.desk2colMain]}>
                      {bestVisible.map((entry) => (
                        <ScoreRow
                          key={String(entry.id)}
                          score={entry}
                          s={s}
                          jacketMap={jacketMap}
                          onReplay={onReplay}
                          onPress={() => setScoreTarget(buildScoreData(entry))}
                        />
                      ))}
                    </View>
                    <View style={s.desk2colRail}>
                      <ScoreSummaryPanel data={scoreTarget} s={s} onReplay={onReplay} />
                    </View>
                  </View>
                ) : (
                  <View style={s.listCard}>
                    {bestVisible.map((entry) => (
                      <ScoreRow
                        key={String(entry.id)}
                        score={entry}
                        s={s}
                        jacketMap={jacketMap}
                        onReplay={onReplay}
                        onPress={() => setScoreTarget(buildScoreData(entry))}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {tab === 'recent' && (
          <View style={s.section}>
            {recentQuery.isLoading ? (
              <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
            ) : recentQuery.isError ? (
              <Text style={s.errorText}>{recentQuery.error instanceof Error ? recentQuery.error.message : 'Failed to load'}</Text>
            ) : allRecent.length === 0 ? (
              <View style={s.emptyCard}><Text style={s.emptyText}>No recent plays</Text></View>
            ) : isDesktop ? (
              <View style={s.desk2col}>
                <View style={[s.listCard, s.desk2colMain]}>
                  {allRecent.slice(0, 50).map((play) => (
                    <ScoreRow key={String(play.id)} score={play} s={s} jacketMap={jacketMap} onReplay={onReplay} onPress={() => setScoreTarget(buildScoreData(play))} />
                  ))}
                </View>
                <View style={s.desk2colRail}>
                  <ScoreSummaryPanel data={scoreTarget} s={s} onReplay={onReplay} />
                </View>
              </View>
            ) : (
              <View style={s.listCard}>
                {allRecent.slice(0, 50).map((play) => (
                  <ScoreRow key={String(play.id)} score={play} s={s} jacketMap={jacketMap} onReplay={onReplay} onPress={() => setScoreTarget(buildScoreData(play))} />
                ))}
              </View>
            )}
          </View>
        )}

        {tab === 'posts' && (
          <View style={s.section}>
            {postsQuery.isLoading ? (
              <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
            ) : postsQuery.isError ? (
              <Text style={s.errorText}>{postsQuery.error instanceof Error ? postsQuery.error.message : 'Failed to load'}</Text>
            ) : (postsQuery.data?.length ?? 0) === 0 ? (
              <View style={s.emptyCard}><Text style={s.emptyText}>No posts yet</Text></View>
            ) : (
              <View style={[s.postsList, isDesktop && s.postsListDesktop]}>
                {(postsQuery.data ?? []).map((post) => (
                  <View key={String(post.id)} style={isDesktop ? s.postsCellDesktop : undefined}>
                    <PostRow
                      post={post}
                      s={s}
                      onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(post.id) } })}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {tab === 'activity' && (
          <View style={s.section}>
            {/* Subtab pill row — purely client-side filter on the activity
                array. Mirrors the web's 5-bucket categorization. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.activitySubTabRow}>
              {ACTIVITY_SUB_TABS.map((opt) => {
                const active = activitySubTab === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setActivitySubTab(opt.key)}
                    style={({ pressed }) => [
                      s.activitySubTab,
                      active && s.activitySubTabActive,
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text style={[s.activitySubTabText, active && s.activitySubTabTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {activityQuery.isLoading ? (
              <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
            ) : activityQuery.isError ? (
              <Text style={s.errorText}>{activityQuery.error instanceof Error ? activityQuery.error.message : 'Failed to load'}</Text>
            ) : (() => {
              const all = activityQuery.data ?? [];
              const filtered = activitySubTab === 'all'
                ? all
                : all.filter((it) => String(it.category || '') === activitySubTab);
              if (filtered.length === 0) {
                const emptyLabel = activitySubTab === 'all'
                  ? 'No activity yet'
                  : `No ${activitySubTab} yet`;
                return (
                  <View style={s.emptyCard}><Text style={s.emptyText}>{emptyLabel}</Text></View>
                );
              }
              return (
                <View style={s.listCard}>
                  {filtered.map((it, i) => <ActivityRow key={i} item={it} s={s} />)}
                </View>
              );
            })()}
          </View>
        )}

        {tab === 'pumbility' && (
          <PumbilityTab
            data={pumbilityQuery.data}
            isLoading={pumbilityQuery.isLoading}
            error={pumbilityQuery.error}
            jacketMap={jacketMap}
            s={s}
            onScorePress={(entry) => setScoreTarget(buildScoreData(entry))}
          />
        )}

        {tab === 'competitions' && (
          <CompetitionsTab
            isLoading={statsQuery.isLoading}
            error={statsQuery.error}
            tournaments={statsQuery.data?.tournamentPlayers ?? []}
            duelStats={statsQuery.data?.duelStats ?? []}
            onlineDuelStats={statsQuery.data?.onlineDuelStats ?? []}
            wcHistory={wcHistoryQuery.data ?? []}
            wcHistoryLoading={wcHistoryQuery.isLoading}
            s={s}
            onTournamentPress={(id) => router.push({ pathname: '/tournament/[id]', params: { id: String(id) } })}
            onWeekPress={(weekKey) => router.push({ pathname: '/weekly-challenges', params: { week: weekKey } })}
          />
        )}

        {tab === 'followers' && (
          <FollowersTab
            followers={followersQuery.data ?? []}
            following={followingQuery.data ?? []}
            myFollowingIds={new Set((myFollowingQuery.data ?? []).map((f) => f.id))}
            currentUserId={currentUser?.id ?? ''}
            isLoading={followersQuery.isLoading || followingQuery.isLoading}
            isToggling={followToggleMutation.isPending}
            s={s}
            onProfilePress={(username) => router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } })}
            onToggleFollow={(userId, next) => followToggleMutation.mutate({ userId, next })}
          />
        )}

        {tab === 'live' && (
          <LiveTab
            data={liveProfileQuery.data}
            isLoading={liveProfileQuery.isLoading}
            error={liveProfileQuery.error}
            jacketMap={jacketMap}
            onSessionPress={(sessionId) => router.push({ pathname: '/live/[id]', params: { id: sessionId } })}
            s={s}
          />
        )}

        {tab === 'titles' && (
          <TitlesTab
            data={titlesQuery.data}
            isLoading={titlesQuery.isLoading}
            error={titlesQuery.error}
            s={s}
          />
        )}

        {tab === 'shoes' && (
          <ShoesTab
            data={shoesQuery.data}
            isLoading={shoesQuery.isLoading}
            error={shoesQuery.error}
            isSelf={isSelf}
            onWear={(shoeId) => wearShoeMutation.mutate(shoeId)}
            wearingShoeId={wearShoeMutation.isPending ? wearShoeMutation.variables ?? null : null}
            onActions={handleShoeActions}
            onAddPress={() => setAddShoeOpen(true)}
            s={s}
          />
        )}
      </ScrollView>

      {isDesktop ? (
        <ScrollView style={s.deskOptimiseRail} contentContainerStyle={s.deskOptimiseScroll}>
          {/* Training load */}
          {trainingLoadQuery.data ? (
            <View style={s.deskOptCard}>
              <Text style={s.deskRailLabel}>TRAINING LOAD</Text>
              <Text style={s.deskOptHeadline}>
                {trainingLoadQuery.data.single?.training_status
                  || trainingLoadQuery.data.double?.training_status
                  || 'Calibrating'}
              </Text>
              {typeof trainingLoadQuery.data.single?.training_ratio === 'number' ? (
                <Text style={s.deskOptMeta}>
                  Singles form / base · {Math.round(trainingLoadQuery.data.single.training_ratio)}%
                </Text>
              ) : null}
              {typeof trainingLoadQuery.data.double?.training_ratio === 'number' ? (
                <Text style={s.deskOptMeta}>
                  Doubles form / base · {Math.round(trainingLoadQuery.data.double.training_ratio)}%
                </Text>
              ) : null}
              <Pressable
                onPress={() => router.push('/training')}
                style={({ pressed }) => [s.deskOptLink, pressed && { opacity: 0.7 }]}>
                <Text style={s.deskOptLinkText}>Open training →</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Top picks teaser */}
          {isSelf ? (
            <View style={s.deskOptCard}>
              <Text style={s.deskRailLabel}>TOP PICKS</Text>
              <Text style={s.deskOptMeta}>
                Charts your training load says you can pass right now.
              </Text>
              <Pressable
                onPress={() => router.push('/what-to-play')}
                style={({ pressed }) => [s.deskOptPrimary, pressed && { opacity: 0.85 }]}>
                <Text style={s.deskOptPrimaryText}>What to Play →</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Recent achievements */}
          {achievements.length > 0 ? (
            <View style={s.deskOptCard}>
              <Text style={s.deskRailLabel}>RECENT ACHIEVEMENTS</Text>
              <View style={s.deskOptAchieveList}>
                {achievements.slice(0, 4).map((ach) => {
                  const img = typeof ach.image === 'string' && ach.image ? fullImageUrl(ach.image) : '';
                  return (
                    <Pressable
                      key={`opt-ach-${String(ach.tier_id ?? ach.series_key ?? ach.name)}`}
                      onPress={() => setSelectedAchievement(ach)}
                      style={({ pressed }) => [s.deskOptAchieveRow, pressed && { opacity: 0.7 }]}>
                      {img ? (
                        <Image source={{ uri: img }} style={s.deskOptAchieveImg} contentFit="contain" />
                      ) : (
                        <Text style={{ fontSize: 18 }}>🏅</Text>
                      )}
                      <Text style={s.deskOptAchieveName} numberOfLines={1}>
                        {String(ach.name || 'Achievement')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      </View>

      <ScoreCardSheet
        visible={!!scoreTarget}
        data={scoreTarget}
        onClose={() => setScoreTarget(null)}
        onReplay={onReplay}
      />
      <ReplayModal
        visible={!!replayTarget}
        url={replayTarget?.url}
        title={replayTarget?.title}
        onClose={() => setReplayTarget(null)}
      />
      <CompetitiveLevelInfoModal
        visible={!!competitiveInfo}
        mode={competitiveInfo?.mode ?? null}
        level={competitiveInfo?.level}
        clearPercentage={competitiveInfo?.clearPercentage}
        averageGrade={competitiveInfo?.averageGrade}
        onClose={() => setCompetitiveInfo(null)}
      />
      <LevelLeaderboardSheet
        visible={!!leaderboardTarget}
        mode={leaderboardTarget?.mode ?? null}
        level={leaderboardTarget?.level ?? null}
        profileUserId={profileId}
        viewerUserId={currentUser?.id}
        onClose={() => setLeaderboardTarget(null)}
      />
      <AchievementModal
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievement(null)}
        s={s}
      />
      <PetModal
        visible={petModalOpen}
        pet={pet}
        username={profile.username}
        onClose={() => setPetModalOpen(false)}
        s={s}
      />
      <AddShoeSheet
        visible={addShoeOpen}
        hasCurrentShoe={!!shoesQuery.data?.active_shoe_id}
        onClose={() => setAddShoeOpen(false)}
        onAdded={() => setAddShoeOpen(false)}
      />
    </View>
  );
}

/** Default export — the `/profile/[id]` route reads the URL param. */
export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProfileBody lookup={String(id || '')} />;
}

function StatCell({ label, value, s, onPress }: { label: string; value: string; s: Styles; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.statCell, pressed && { opacity: 0.7 }]}>
        <Text style={s.statValue}>{value}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={s.statCell}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function NotifToggle({ label, value, onChange, s }: { label: string; value: boolean; onChange: (v: boolean) => void; s: Styles }) {
  return (
    <View style={s.notifToggleRow}>
      <Text style={s.notifToggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function AllSkillsSection({ skills, s, onSkillPress }: {
  skills: SkillBreakdownEntry[];
  s: Styles;
  onSkillPress: (sk: SkillBreakdownEntry) => void;
}) {
  // Long lists are noisy. Default to top 5 (already sorted by best score) and
  // let the user expand to the full ladder; a search box trims it further.
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? skills.filter((sk) => String(sk.name || '').toLowerCase().includes(trimmed))
    : skills;
  const visible = expanded ? filtered : filtered.slice(0, 5);
  const remaining = Math.max(0, filtered.length - visible.length);

  return (
    <View style={s.section}>
      <View style={s.sectionHeaderRow}>
        <Text style={s.eyebrow}>ALL SKILLS</Text>
        <Text style={s.sectionCount}>{skills.length}</Text>
      </View>
      {expanded ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search skills…"
          placeholderTextColor={'#737373'}
          style={s.skillSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}
      <View style={s.listCard}>
        {visible.map((sk) => {
          const passed = Number(sk.passed_charts) || 0;
          const total = Number(sk.total_charts) || 0;
          const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
          return (
            <Pressable key={String(sk.slug ?? sk.name)} onPress={() => onSkillPress(sk)} style={({ pressed }) => [s.skillRow, pressed && { opacity: 0.7 }]}>
              <View style={s.skillRowMain}>
                <Text style={s.skillRowName}>{sk.name}</Text>
                <Text style={s.skillRowSub}>{passed}/{total} cleared</Text>
                <View style={s.titleProgressBar}>
                  <View style={[s.titleProgressFill, { width: `${pct}%` }]} />
                </View>
              </View>
              <Text style={s.skillRowPct}>{pct}%</Text>
            </Pressable>
          );
        })}
        {!expanded && remaining > 0 ? (
          <Pressable onPress={() => setExpanded(true)} style={({ pressed }) => [s.expandRow, pressed && { opacity: 0.7 }]}>
            <Text style={s.expandText}>Show all {skills.length}</Text>
          </Pressable>
        ) : expanded ? (
          <Pressable onPress={() => { setExpanded(false); setQuery(''); }} style={({ pressed }) => [s.expandRow, pressed && { opacity: 0.7 }]}>
            <Text style={s.expandText}>Show less</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function LevelMiniChart({ label, buckets, color, s }: {
  label: string;
  buckets: SongAnalyticsLevelBucket[];
  color: string;
  s: Styles;
}) {
  const sorted = [...buckets].sort((a, b) => a.level - b.level);
  const max = sorted.reduce((m, b) => Math.max(m, b.total_charts || 0), 0);
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.eyebrow}>{label}</Text>
      <View style={s.levelChartRow}>
        {sorted.map((b) => {
          const total = Number(b.total_charts) || 0;
          const cleared = Number(b.cleared_charts) || 0;
          const totalPct = max > 0 ? total / max : 0;
          const clearedPct = total > 0 ? cleared / total : 0;
          return (
            <View key={b.level} style={s.levelChartCol}>
              <View style={s.levelChartTrack}>
                <View style={[s.levelChartTotal, { height: `${Math.round(totalPct * 100)}%`, backgroundColor: `${color}33` }]}>
                  <View style={[s.levelChartCleared, { height: `${Math.round(clearedPct * 100)}%`, backgroundColor: color }]} />
                </View>
              </View>
              <Text style={s.levelChartLabel}>{b.level}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SkillStrengthCard({ skill, kind, s, onPress }: {
  skill: SkillBreakdownEntry;
  kind: 'strength' | 'weakness';
  s: Styles;
  onPress: () => void;
}) {
  const passed = Number(skill.passed_charts) || 0;
  const total = Number(skill.total_charts) || 0;
  const passRatePct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const avg = Number(skill.average_score) || 0;
  const grade = String(skill.average_grade || '').trim();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.skillStrengthCard,
        kind === 'strength' ? s.skillStrengthBorder : s.skillWeaknessBorder,
        pressed && { opacity: 0.7 },
      ]}>
      <Text style={s.skillStrengthName} numberOfLines={1}>{skill.name}</Text>
      <Text style={s.skillStrengthScore}>{grade || '—'}</Text>
      <Text style={s.skillStrengthSub}>
        {avg > 0 ? `${avg.toLocaleString()} avg` : 'no data'} · {passed}/{total} · {passRatePct}%
      </Text>
    </Pressable>
  );
}

function SkillDetailModal({ skill, onClose, s }: { skill: SkillBreakdownEntry | null; onClose: () => void; s: Styles }) {
  if (!skill) return null;
  const total = Number(skill.total_charts) || 0;
  const played = Number(skill.played_charts) || 0;
  const passed = Number(skill.passed_charts) || 0;
  const playRate = total > 0 ? Math.round((played / total) * 100) : 0;
  const passRate = played > 0 ? Math.round((passed / played) * 100) : 0;
  const best = skill.best_chart;
  const worst = skill.worst_chart;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalCard}>
          <Text style={s.modalEyebrow}>SKILL</Text>
          <Text style={s.achievementName}>{skill.name}</Text>

          <View style={s.skillStatsGrid}>
            <View style={s.skillStatCell}>
              <Text style={s.skillStatLabel}>PLAYED</Text>
              <Text style={s.skillStatValue}>{played}/{total}</Text>
              <Text style={s.skillStatSub}>{playRate}% play rate</Text>
            </View>
            <View style={s.skillStatCell}>
              <Text style={s.skillStatLabel}>PASSED</Text>
              <Text style={s.skillStatValue}>{passed}/{played}</Text>
              <Text style={s.skillStatSub}>{passRate}% pass rate</Text>
            </View>
            <View style={s.skillStatCell}>
              <Text style={s.skillStatLabel}>AVG SCORE</Text>
              <Text style={s.skillStatValue}>{(Number(skill.average_score) || 0).toLocaleString()}</Text>
              <Text style={s.skillStatSub}>{skill.average_grade || '—'} avg</Text>
            </View>
          </View>

          {best ? (
            <View style={s.skillExampleRow}>
              <Text style={s.modalEyebrow}>BEST CHART</Text>
              <Text style={s.skillExampleTitle}>{best.song_title || '—'}</Text>
              <Text style={s.skillExampleSub}>
                {best.mode} {best.level} · {(Number(best.score) || 0).toLocaleString()} {best.grade ?? ''}
              </Text>
            </View>
          ) : null}

          {worst ? (
            <View style={s.skillExampleRow}>
              <Text style={s.modalEyebrow}>WORST CHART</Text>
              <Text style={s.skillExampleTitle}>{worst.song_title || '—'}</Text>
              <Text style={s.skillExampleSub}>
                {worst.mode} {worst.level} · {(Number(worst.score) || 0).toLocaleString()} {worst.grade ?? ''}
              </Text>
            </View>
          ) : null}

          <Pressable onPress={onClose} hitSlop={6} style={({ pressed }) => [s.modalCloseBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PetModal({ visible, pet, username, onClose, s }: {
  visible: boolean;
  pet: Record<string, unknown> | null;
  username?: string;
  onClose: () => void;
  s: Styles;
}) {
  if (!pet) return null;
  const character = String(pet.character || 'dojocat');
  const emoji = petCharacterEmoji(character);
  const rawName = String(pet.identity_title || pet.character_name || character);
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const level = Number(pet.level) || 0;
  const bond = Number(pet.bond) || 0;
  const fullness = Number(pet.fullness) || 0;
  const happiness = Number(pet.happiness) || 0;
  const energy = Number(pet.energy) || 0;
  const totalSongsFed = Number(pet.total_songs_fed) || 0;
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalCard}>
          <Text style={s.modalEyebrow}>{username ? `@${username}'s pet` : 'Pet'}</Text>
          <View style={s.achievementHero}>
            <View style={s.petBigEmojiWrap}>
              <Text style={s.petBigEmoji}>{emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.achievementName}>{name}</Text>
              <Text style={s.achievementDesc}>Level {level} · Bond {bond}</Text>
              <Text style={s.achievementSub}>{totalSongsFed} songs fed</Text>
            </View>
          </View>
          <View style={s.petStatsGrid}>
            <PetStatBar label="FULLNESS" value={fullness} s={s} />
            <PetStatBar label="HAPPINESS" value={happiness} s={s} />
            <PetStatBar label="ENERGY" value={energy} s={s} />
          </View>
          <Pressable onPress={onClose} hitSlop={6} style={({ pressed }) => [s.modalCloseBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PetStatBar({ label, value, s }: { label: string; value: number; s: Styles }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.petStatLabel}>{label}</Text>
        <Text style={s.petStatLabel}>{Math.round(pct)}</Text>
      </View>
      <View style={s.titleProgressBar}>
        <View style={[s.titleProgressFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function AchievementModal({ achievement, onClose, s }: { achievement: UserAchievement | null; onClose: () => void; s: Styles }) {
  if (!achievement) return null;
  const img = typeof achievement.image === 'string' ? fullImageUrl(achievement.image) : '';
  const next = achievement.next_tier || null;
  const nextImg = typeof next?.image === 'string' ? fullImageUrl(next.image) : '';
  const current = Number(achievement.current_value) || 0;
  const threshold = Number(next?.threshold) || 0;
  const progress = threshold > 0 ? Math.min(1, current / threshold) : 1;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalCard}>
          <Text style={s.modalEyebrow}>{achievement.series_name || 'Achievement'}</Text>
          <View style={s.achievementHero}>
            {img ? <Image source={{ uri: img }} style={s.achievementHeroImg} contentFit="contain" /> : <Text style={{ fontSize: 48 }}>🏅</Text>}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.achievementName}>{achievement.name || '—'}</Text>
              {achievement.description ? <Text style={s.achievementDesc}>{achievement.description}</Text> : null}
              {typeof achievement.threshold === 'number' && achievement.threshold > 0 ? (
                <Text style={s.achievementSub}>Earned at {achievement.threshold.toLocaleString()}</Text>
              ) : null}
            </View>
          </View>

          {next ? (
            <View style={s.achievementNextCard}>
              <Text style={s.modalEyebrow}>NEXT TIER</Text>
              <View style={s.achievementHero}>
                {nextImg ? <Image source={{ uri: nextImg }} style={s.achievementHeroImgSm} contentFit="contain" /> : null}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.achievementName}>{next.name || '—'}</Text>
                  {next.description ? <Text style={s.achievementDesc}>{next.description}</Text> : null}
                  <View style={s.titleProgressBar}>
                    <View style={[s.titleProgressFill, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                  <Text style={s.achievementSub}>
                    {current.toLocaleString()} / {threshold.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <Pressable onPress={onClose} hitSlop={6} style={({ pressed }) => [s.modalCloseBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Self-contained scout-card section for the profile overview. Fetches the
 * scout payload, renders a MiniScoutCard preview, and opens the
 * ScoutCardSheet for the full report. Hidden entirely when the user has
 * no PIUGame data yet — no point teasing an empty report.
 */
function ProfileScoutCardSection({ userId, s }: { userId: string; s: Styles }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const scoutQuery = useQuery({
    queryKey: ['scouting-card', userId],
    queryFn: () => songsApi.scoutingCard(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const scout = scoutQuery.data;
  if (!scout || !scout.coverage?.hasPiuData) return null;
  const playerInfo: ScoutPlayerInfo = {
    id: scout.user.id,
    user_id: scout.user.id,
    name: scout.user.username,
    avatar: scout.user.avatar,
    nationality: scout.user.nationality,
    skill_title: scout.user.skillTitle,
  };
  return (
    <View style={s.scoutSection}>
      <View style={s.scoutHeaderRow}>
        <Text style={s.scoutEyebrow}>SCOUTING REPORT</Text>
        <Pressable onPress={() => setSheetOpen(true)} hitSlop={6}>
          <Text style={s.scoutFullLink}>View full report →</Text>
        </Pressable>
      </View>
      <MiniScoutCard player={playerInfo} scout={scout} onPress={() => setSheetOpen(true)} />
      <ScoutCardSheet
        visible={sheetOpen}
        player={playerInfo}
        scout={scout}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

function OverviewTab({
  recent,
  topScores,
  counts,
  analytics,
  skillBreakdown,
  rankings,
  jacketMap,
  heatmapPlays,
  isSelf,
  ownerUserId,
  s,
  onScorePress,
  onChartPress,
  onCompetitiveLevelPress,
  onRankingPress,
}: {
  recent: PiugameRecentPlay[];
  topScores: PiugameBestScore[];
  counts: { total_pumps?: number; last_post_at?: string | null } | undefined;
  analytics: SongAnalyticsResponse | undefined;
  skillBreakdown: SkillBreakdownResponse | undefined;
  rankings: { pumbility_percentile?: number | null; level_percentiles?: { mode: string; level: number; percentile?: number; rank?: number; total_users?: number }[] } | undefined;
  jacketMap: Record<string, string> | undefined;
  heatmapPlays: PiugameRecentPlay[];
  isSelf: boolean;
  ownerUserId: string;
  s: Styles;
  onScorePress: (entry: PiugameBestScore | PiugameRecentPlay) => void;
  onChartPress: (chartId: number) => void;
  onCompetitiveLevelPress: (info: { mode: 'Single' | 'Double'; level?: number; clearPercentage?: number; averageGrade?: string }) => void;
  onRankingPress: (target: { mode: string; level: number }) => void;
}) {
  // Index plays by UTC day key for instant lookup when a heatmap cell is tapped.
  const playsByDay = useMemo(() => {
    const map = new Map<string, PiugameRecentPlay[]>();
    for (const p of heatmapPlays) {
      const raw = String(p.played_at_utc || p.date_played || '');
      if (!raw) continue;
      const d = new Date(/T|\s/.test(raw) ? raw : `${raw}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [heatmapPlays]);
  const heatmapDates = useMemo(
    () => heatmapPlays.map((p) => String(p.played_at_utc || p.date_played || '')),
    [heatmapPlays],
  );
  // Most-recent active day — the default selection so the panel always has
  // content to show on first paint.
  const mostRecentDay = useMemo(() => {
    if (playsByDay.size === 0) return null;
    return [...playsByDay.keys()].sort().reverse()[0] ?? null;
  }, [playsByDay]);
  const [selectedDay, setSelectedDay] = useState<string | null>(mostRecentDay);
  // Re-sync the selection if the data finishes loading after first render
  // (initial state is captured before the year-of-plays query resolves).
  useEffect(() => {
    if (!selectedDay && mostRecentDay) setSelectedDay(mostRecentDay);
  }, [mostRecentDay, selectedDay]);
  const selectedPlays = selectedDay ? (playsByDay.get(selectedDay) ?? []) : [];
  const single = analytics?.totals?.single;
  const double = analytics?.totals?.double;

  // Strengths/weaknesses use the slugs the server already pre-computed (top
  // and bottom 3 by composite `performance_score`). The full `skills` array
  // is sorted strongest→weakest for the All Skills list and the detail modal.
  const sortedByPerf = (skillBreakdown?.skills ?? []).filter((sk) => (Number(sk.played_charts) || 0) > 0);
  const skillBySlug = new Map(sortedByPerf.map((sk) => [String(sk.slug ?? ''), sk]));
  const strengths = (skillBreakdown?.strengths ?? [])
    .map((slug) => skillBySlug.get(String(slug)))
    .filter((sk): sk is SkillBreakdownEntry => !!sk);
  const weaknesses = (skillBreakdown?.weaknesses ?? [])
    .map((slug) => skillBySlug.get(String(slug)))
    .filter((sk): sk is SkillBreakdownEntry => !!sk);
  const [selectedSkill, setSelectedSkill] = useState<SkillBreakdownEntry | null>(null);
  const pumbilityPct = Number(rankings?.pumbility_percentile) || 0;
  const levelPercentiles = rankings?.level_percentiles ?? [];
  const topLevelRankings = [...levelPercentiles]
    .filter((r) => Number(r.percentile) > 0)
    .sort((a, b) => Number(b.percentile) - Number(a.percentile))
    .slice(0, 4);

  return (
    <View style={s.overviewWrap}>
      {heatmapDates.length > 0 ? (
        <View style={s.section}>
          <Text style={s.eyebrow}>PLAY ACTIVITY</Text>
          <View style={s.heatmapCard}>
            <PlayHeatmap
              dates={heatmapDates}
              selectedDayKey={selectedDay}
              onDayPress={(key, count) => {
                // Only switch when there are plays on the tapped day. Tapping
                // the same active cell is a no-op (don't toggle off — the
                // detail panel always stays anchored to a real day).
                if (count > 0) setSelectedDay(key);
              }}
            />
          </View>
          {selectedDay && selectedPlays.length > 0 ? (
            <HeatmapDayDetail
              dayKey={selectedDay}
              plays={selectedPlays}
              jacketMap={jacketMap}
              onPlayPress={(play) => onScorePress(play)}
            />
          ) : null}
        </View>
      ) : null}

      {/* Scout card — attribute bars + specialties + tap-through to the
          full report. Sits between recent activity and the competitive
          level cards so the page reads as: what they're doing now →
          how they play → how they compare. Hidden if the player hasn't
          synced PIU data. */}
      <ProfileScoutCardSection userId={ownerUserId} s={s} />

      {/* Competitive level cards (S25, D24). Shown above the line chart so the
          headline number leads. The line chart's own footer carries the
          singles/doubles cleared totals so we don't duplicate them in a card
          underneath. */}
      {(analytics?.competitive_levels?.single?.level || analytics?.competitive_levels?.double?.level) ? (
        <View style={s.compLevelRow}>
          {analytics?.competitive_levels?.single?.level ? (
            <Pressable
              onPress={() => onCompetitiveLevelPress({
                mode: 'Single',
                level: analytics.competitive_levels?.single?.level,
                clearPercentage: analytics.competitive_levels?.single?.clear_percentage,
                averageGrade: analytics.competitive_levels?.single?.average_grade,
              })}
              style={({ pressed }) => [
                s.compLevelCard,
                { borderColor: '#ff7a7a55', backgroundColor: '#ff7a7a14' },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={s.compLevelLabel}>SINGLES</Text>
              <Text style={[s.compLevelValue, { color: '#ff8b8b' }]}>S{analytics.competitive_levels.single.level}</Text>
              <Text style={s.compLevelSub}>
                {analytics.competitive_levels.single.average_grade ?? ''} avg ·{' '}
                {Math.round((analytics.competitive_levels.single.clear_percentage ?? 0))}% cleared
              </Text>
              <View style={s.compLevelHint}>
                <IconSymbol name="info.circle" size={11} color="#ff8b8b" />
                <Text style={[s.compLevelHintText, { color: '#ff8b8b' }]}>Tap to see how this is calculated</Text>
              </View>
            </Pressable>
          ) : null}
          {analytics?.competitive_levels?.double?.level ? (
            <Pressable
              onPress={() => onCompetitiveLevelPress({
                mode: 'Double',
                level: analytics.competitive_levels?.double?.level,
                clearPercentage: analytics.competitive_levels?.double?.clear_percentage,
                averageGrade: analytics.competitive_levels?.double?.average_grade,
              })}
              style={({ pressed }) => [
                s.compLevelCard,
                { borderColor: '#16b77f55', backgroundColor: '#16b77f14' },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={s.compLevelLabel}>DOUBLES</Text>
              <Text style={[s.compLevelValue, { color: '#4cf4aa' }]}>D{analytics.competitive_levels.double.level}</Text>
              <Text style={s.compLevelSub}>
                {analytics.competitive_levels.double.average_grade ?? ''} avg ·{' '}
                {Math.round((analytics.competitive_levels.double.clear_percentage ?? 0))}% cleared
              </Text>
              <View style={s.compLevelHint}>
                <IconSymbol name="info.circle" size={11} color="#4cf4aa" />
                <Text style={[s.compLevelHintText, { color: '#4cf4aa' }]}>Tap to see how this is calculated</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {(analytics?.levels?.single?.length || analytics?.levels?.double?.length) ? (
        <View style={s.section}>
          <Text style={s.eyebrow}>CLEAR RATE BY LEVEL</Text>
          <View style={s.heatmapCard}>
            <ClearsByLevelChart
              single={analytics?.levels?.single}
              double={analytics?.levels?.double}
            />
          </View>
        </View>
      ) : null}

      {pumbilityPct || topLevelRankings.length > 0 ? (
        <View style={s.section}>
          <View style={s.rankingsHeader}>
            <Text style={s.eyebrow}>RANKINGS</Text>
            {topLevelRankings.length > 0 ? (
              <Text style={s.rankingsHint}>Tap a level for the full leaderboard</Text>
            ) : null}
          </View>
          <View style={s.analyticsCard}>
            {pumbilityPct ? (
              <View style={s.analyticsCol}>
                <Text style={s.analyticsLabel}>PUMBILITY</Text>
                <Text style={s.analyticsValue}>Top {Math.round(100 - pumbilityPct)}%</Text>
              </View>
            ) : null}
            {topLevelRankings.map((r) => {
              const tag = `${r.mode === 'Single' ? 'S' : 'D'}${r.level}`;
              const pct = Number(r.percentile) || 0;
              const level = Number(r.level) || 0;
              const mode = String(r.mode || '');
              return (
                <Pressable
                  key={`${mode}-${level}`}
                  onPress={() => mode && level > 0 ? onRankingPress({ mode, level }) : undefined}
                  style={({ pressed }) => [s.analyticsCol, pressed && { opacity: 0.7 }]}>
                  <Text style={s.analyticsLabel}>{tag}</Text>
                  <Text style={s.analyticsValue}>Top {Math.max(1, Math.round(100 - pct))}%</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {isSelf ? (
        <View style={s.section}>
          <Text style={s.eyebrow}>GRADE GOALS</Text>
          <GradeGoalsTracker
            userId={ownerUserId}
            analytics={analytics}
            jacketMap={jacketMap}
            onChartPress={onChartPress}
          />
        </View>
      ) : null}

      {strengths.length > 0 ? (
        <View style={s.section}>
          <Text style={s.eyebrow}>STRENGTHS</Text>
          <View style={s.skillCardsRow}>
            {strengths.map((sk) => (
              <SkillStrengthCard key={String(sk.slug ?? sk.name)} skill={sk} kind="strength" s={s} onPress={() => setSelectedSkill(sk)} />
            ))}
          </View>
        </View>
      ) : null}

      {weaknesses.length > 0 ? (
        <View style={s.section}>
          <Text style={s.eyebrow}>WEAKNESSES</Text>
          <View style={s.skillCardsRow}>
            {weaknesses.map((sk) => (
              <SkillStrengthCard key={`w-${sk.slug ?? sk.name}`} skill={sk} kind="weakness" s={s} onPress={() => setSelectedSkill(sk)} />
            ))}
          </View>
        </View>
      ) : null}

      {sortedByPerf.length > 0 ? (
        <AllSkillsSection
          skills={sortedByPerf}
          s={s}
          onSkillPress={setSelectedSkill}
        />
      ) : null}

      {/* Top Scores + Recently Played live on their own dedicated tabs;
          showing them again on Overview is redundant. */}

      {counts?.total_pumps !== undefined && (
        <Text style={s.footnote}>
          Total pumps received: {formatNumber(counts.total_pumps)}
          {counts.last_post_at ? ` · Last post ${timeAgo(counts.last_post_at)} ago` : ''}
        </Text>
      )}

      <SkillDetailModal skill={selectedSkill} onClose={() => setSelectedSkill(null)} s={s} />
    </View>
  );
}

// ─── Tab components ────────────────────────────────────────────────────────

function PumbilityTab({ data, isLoading, error, jacketMap, s, onScorePress }: {
  data: PiugamePumbility | undefined;
  isLoading: boolean;
  error: Error | null;
  jacketMap: Record<string, string> | undefined;
  s: Styles;
  onScorePress: (entry: PiugamePumbilityScore) => void;
}) {
  if (isLoading) return <View style={s.center}><ActivityIndicator /></View>;
  if (error) return <Text style={s.errorText}>{error.message}</Text>;
  if (!data) return <View style={s.emptyCard}><Text style={s.emptyText}>No pumbility data</Text></View>;

  const scores = data.scores ?? [];
  return (
    <View style={s.section}>
      <View style={s.pumbilityHeaderCard}>
        <View style={s.pumbilityHeaderRow}>
          <View style={s.pumbilityHeaderCol}>
            <Text style={s.pumbilityHeaderLabel}>PUMBILITY</Text>
            <Text style={s.pumbilityHeaderValue}>{formatNumber(data.pumbility_value)}</Text>
            {data.official_pumbility ? (
              <Text style={s.pumbilityHeaderSub}>Official: {formatNumber(data.official_pumbility)}</Text>
            ) : null}
          </View>
          {data.ranking ? (
            <View style={s.pumbilityHeaderCol}>
              <Text style={s.pumbilityHeaderLabel}>RANK</Text>
              <Text style={s.pumbilityHeaderValue}>#{formatNumber(data.ranking)}</Text>
              {data.threshold ? (
                <Text style={s.pumbilityHeaderSub}>Top 1k cutoff {formatNumber(data.threshold)}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={s.pumbilityHeaderRow}>
          {data.singles_competitive_level ? (
            <View style={s.pumbilityChip}><Text style={s.pumbilityChipText}>S{data.singles_competitive_level}</Text></View>
          ) : null}
          {data.doubles_competitive_level ? (
            <View style={s.pumbilityChip}><Text style={s.pumbilityChipText}>D{data.doubles_competitive_level}</Text></View>
          ) : null}
          {data.average_rating ? (
            <Text style={s.pumbilityHeaderSub}>Avg rating {formatNumber(data.average_rating)}</Text>
          ) : null}
        </View>
      </View>

      <Text style={s.eyebrow}>TOP 50 SCORES</Text>
      {scores.length === 0 ? (
        <View style={s.emptyCard}><Text style={s.emptyText}>No top scores yet</Text></View>
      ) : (
        <View style={s.listCard}>
          {scores.map((entry, i) => (
            <PumbilityRow key={`${entry.song_title}|${entry.mode}|${entry.level}|${i}`} entry={entry} rank={entry.rank_order ?? i + 1} jacketMap={jacketMap} s={s} onPress={() => onScorePress(entry)} />
          ))}
        </View>
      )}
    </View>
  );
}

function PumbilityRow({ entry, rank, jacketMap, s, onPress }: {
  entry: PiugamePumbilityScore;
  rank: number;
  jacketMap: Record<string, string> | undefined;
  s: Styles;
  onPress: () => void;
}) {
  const resolved = resolveChartJacketUrl({
    title: entry.song_title,
    mode: entry.mode,
    level: entry.level,
    jacketLookup: jacketMap,
    backgroundUrl: entry.background_url,
    jacketUrl: entry.jacket_url,
  });
  const jacketUrl = resolved ? fullImageUrl(resolved) : undefined;
  const title = toCanonicalSongTitle(entry.song_title || '') || entry.song_title || 'Unknown';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.scoreRow, pressed && { opacity: 0.7 }]}>
      <Text style={s.pumbilityRank}>{rank}</Text>
      <ChartJacket jacketUrl={jacketUrl} mode={entry.mode} level={entry.level} size="sm" />
      <View style={s.scoreMain}>
        <Text style={s.scoreTitle} numberOfLines={1}>{title}</Text>
        <Text style={s.scoreDate}>{entry.mode} {entry.level} · Rating {formatNumber(entry.rating)}</Text>
      </View>
      <View style={s.scoreCol}>
        <Text style={s.scoreNum}>{formatNumber(entry.score)}</Text>
        <GradeChip grade={entry.grade} score={Number(entry.score) || 0} size="xs" />
      </View>
    </Pressable>
  );
}

function CompetitionsTab({ isLoading, error, tournaments, duelStats, onlineDuelStats, wcHistory, wcHistoryLoading, s, onTournamentPress, onWeekPress }: {
  isLoading: boolean;
  error: Error | null;
  tournaments: TournamentParticipation[];
  duelStats: { duel: Record<string, unknown>; songs: Record<string, unknown>[] }[];
  onlineDuelStats: { duel: Record<string, unknown>; songs: Record<string, unknown>[] }[];
  wcHistory: UserWeeklyChallengeHistoryEntry[];
  wcHistoryLoading: boolean;
  s: Styles;
  onTournamentPress: (id: string) => void;
  onWeekPress: (weekKey: string) => void;
}) {
  if (isLoading) return <View style={s.center}><ActivityIndicator /></View>;
  if (error) return <Text style={s.errorText}>{error.message}</Text>;
  const allDuels = [...duelStats, ...onlineDuelStats];
  if (tournaments.length === 0 && allDuels.length === 0 && !wcHistoryLoading && wcHistory.length === 0) {
    return <View style={s.emptyCard}><Text style={s.emptyText}>No competitions yet</Text></View>;
  }
  return (
    <View style={s.section}>
      {/* Weekly Challenges section — finalized weeks the user actually
          competed in. Tap a week to deep-link into Weekly Challenges. */}
      {wcHistoryLoading ? (
        <View style={s.section}>
          <Text style={s.eyebrow}>WEEKLY CHALLENGES</Text>
          <View style={s.center}><ActivityIndicator /></View>
        </View>
      ) : wcHistory.length > 0 ? (
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.eyebrow}>WEEKLY CHALLENGES</Text>
            <Text style={s.sectionCount}>{wcHistory.length}</Text>
          </View>
          <View style={s.listCard}>
            {wcHistory.slice(0, 30).map((wc) => {
              const overall = wc.overall;
              const subParts: string[] = [];
              if (overall) subParts.push(`#${overall.rank} overall · ${formatNumber(overall.points)} pts`);
              if (wc.singles) subParts.push(`Singles #${wc.singles.rank}`);
              if (wc.doubles) subParts.push(`Doubles #${wc.doubles.rank}`);
              return (
                <Pressable
                  key={wc.week_key}
                  onPress={() => onWeekPress(wc.week_key)}
                  style={({ pressed }) => [s.competitionRow, pressed && { opacity: 0.7 }]}>
                  <View style={s.competitionMain}>
                    <Text style={s.competitionTitle} numberOfLines={1}>{wc.week_key}</Text>
                    <Text style={s.competitionMeta} numberOfLines={1}>
                      {subParts.length > 0 ? subParts.join(' · ') : 'Participated'}
                    </Text>
                    {wc.awards.length > 0 ? (
                      <View style={s.wcAwardRow}>
                        {wc.awards.slice(0, 4).map((a) => (
                          <View key={a.award_key} style={s.wcAwardChip}>
                            <Text style={s.wcAwardText}>{a.award_key.replace(/_/g, ' ')} #{a.rank}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.competitionRight}>{overall ? `${overall.clears}` : '—'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {tournaments.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.eyebrow}>TOURNAMENTS</Text>
            <Text style={s.sectionCount}>{tournaments.length}</Text>
          </View>
          <View style={s.listCard}>
            {tournaments.slice(0, 20).map((tp) => (
              <Pressable
                key={String(tp.tournament.id)}
                onPress={() => {
                  const tid = String(tp.tournament.tournament_id ?? '');
                  if (tid) onTournamentPress(tid);
                }}
                style={({ pressed }) => [s.competitionRow, pressed && { opacity: 0.7 }]}>
                <View style={s.competitionMain}>
                  <Text style={s.competitionTitle} numberOfLines={1}>{String(tp.tournament.tournament_name || tp.tournament.name || 'Tournament')}</Text>
                  <Text style={s.competitionMeta}>
                    {[tp.tournament.tournament_phase, formatDate(String(tp.tournament.tournament_date || ''))].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={s.competitionRight}>{tp.matches.length} match{tp.matches.length === 1 ? '' : 'es'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {allDuels.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.eyebrow}>DUELS</Text>
            <Text style={s.sectionCount}>{allDuels.length}</Text>
          </View>
          <View style={s.listCard}>
            {allDuels.slice(0, 30).map((d, i) => {
              const created = String(d.duel.created_at || '');
              const cu = String(d.duel.creator_username || d.duel.player1_name || '?');
              const ou = String(d.duel.opponent_username || d.duel.player2_name || '?');
              return (
                <View key={String(d.duel.id ?? i)} style={s.competitionRow}>
                  <View style={s.competitionMain}>
                    <Text style={s.competitionTitle} numberOfLines={1}>{cu} vs {ou}</Text>
                    <Text style={s.competitionMeta}>{formatDate(created)} · {d.songs.length} song{d.songs.length === 1 ? '' : 's'}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function FollowersTab({ followers, following, myFollowingIds, currentUserId, isLoading, isToggling, s, onProfilePress, onToggleFollow }: {
  followers: FollowEntry[];
  following: FollowEntry[];
  myFollowingIds: Set<string>;
  currentUserId: string;
  isLoading: boolean;
  isToggling: boolean;
  s: Styles;
  onProfilePress: (username: string) => void;
  onToggleFollow: (userId: string, next: boolean) => void;
}) {
  const [view, setView] = useState<'followers' | 'following'>('followers');
  if (isLoading) return <View style={s.center}><ActivityIndicator /></View>;
  const list = view === 'followers' ? followers : following;
  return (
    <View style={s.section}>
      <View style={s.subTabsRow}>
        <Pressable onPress={() => setView('followers')} style={({ pressed }) => [s.subTab, view === 'followers' && s.subTabActive, pressed && { opacity: 0.7 }]}>
          <Text style={[s.subTabText, view === 'followers' && s.subTabTextActive]}>Followers ({followers.length})</Text>
        </Pressable>
        <Pressable onPress={() => setView('following')} style={({ pressed }) => [s.subTab, view === 'following' && s.subTabActive, pressed && { opacity: 0.7 }]}>
          <Text style={[s.subTabText, view === 'following' && s.subTabTextActive]}>Following ({following.length})</Text>
        </Pressable>
      </View>
      {list.length === 0 ? (
        <View style={s.emptyCard}><Text style={s.emptyText}>No {view} yet</Text></View>
      ) : (
        <View style={s.listCard}>
          {list.map((entry) => {
            const av = typeof entry.avatar === 'string' ? fullImageUrl(entry.avatar) : undefined;
            const isMe = entry.id === currentUserId;
            const iFollow = myFollowingIds.has(entry.id);
            return (
              <Pressable key={entry.id} onPress={() => onProfilePress(entry.username)} style={({ pressed }) => [s.followerRow, pressed && { opacity: 0.7 }]}>
                {av ? (
                  <Image source={{ uri: av }} style={s.followerAvatar} contentFit="cover" />
                ) : (
                  <View style={[s.followerAvatar, s.followerAvatarFallback]}>
                    <Text style={s.followerLetter}>{entry.username.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={s.followerMain}>
                  <Text style={s.followerName}>@{entry.username}</Text>
                  {entry.skill_title ? <Text style={s.followerSub}>{entry.skill_title}</Text> : null}
                </View>
                {!isMe && currentUserId ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); onToggleFollow(entry.id, !iFollow); }}
                    disabled={isToggling}
                    style={({ pressed }) => [
                      iFollow ? s.followerFollowingPill : s.followerFollowPill,
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text style={iFollow ? s.followerFollowingPillText : s.followerFollowPillText}>
                      {iFollow ? 'Following' : 'Follow'}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function formatDuration(minutes: number | undefined): string {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m <= 0) return '—';
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

/** Mode-letter prefix the web uses on the live-tile badges
 *  (Single → "S", Double → "D", CoOp → "C"). */
function liveModeShort(mode: string | undefined): string {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw.startsWith('s')) return 'S';
  if (raw.startsWith('d')) return 'D';
  if (raw.startsWith('c')) return 'C';
  return raw.slice(0, 1).toUpperCase() || '?';
}

/**
 * Top-6 best plays grid for the profile Live tab. Mirrors web's
 * `ProfileLiveTopSongTile` — jacket art with rating chip top-left,
 * mode+level chip top-right, grade chip bottom-left, score bottom-right.
 * Picks the same `topSongsByRating` source the web uses (falls back to
 * topSongsByScore if the server hasn't filled the rating slot).
 */
function ProfileLiveTopSongs({
  summary,
  jacketMap,
  s,
}: {
  summary: LiveSessionSummaryPayload;
  jacketMap: Record<string, string> | undefined;
  s: Styles;
}) {
  const rows = (summary.topSongsByRating?.length ? summary.topSongsByRating : summary.topSongsByScore) ?? [];
  const top = rows.slice(0, 6);
  if (top.length === 0) return null;
  return (
    <View style={s.liveTopSongsGrid}>
      {top.map((row, idx) => {
        const score = Number(row?.score) || 0;
        const rating = Number(row?.rating) || 0;
        const grade = String(row?.grade || '').trim();
        const gradeLabel = getGradeDisplayLabel(grade, score);
        const gradeColor = TIER_COLORS[getGradeTier(grade, score)];
        const jacketRel = resolveChartJacketUrl({
          title: row?.song_title,
          mode: row?.mode,
          level: row?.level,
          jacketLookup: jacketMap,
          // background_url + jacket_url come back as `unknown` via the
          // LiveSessionPlay index signature — coerce to string here.
          backgroundUrl: typeof row?.background_url === 'string' ? row.background_url : '',
          jacketUrl: typeof row?.jacket_url === 'string' ? row.jacket_url : '',
        });
        const jacketUrl = jacketRel ? fullImageUrl(jacketRel) : undefined;
        const modeLabel = `${liveModeShort(row?.mode)}${Number(row?.level) || '?'}`;
        return (
          <View
            key={`${row?.song_title || 'song'}-${row?.mode || 'mode'}-${row?.level || idx}-${idx}`}
            style={s.liveTopSongTile}>
            {jacketUrl ? (
              <Image source={{ uri: jacketUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, s.liveTopSongFallback]}>
                <Text style={s.liveTopSongFallbackText}>
                  {String(row?.song_title || '?').trim().charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View style={[StyleSheet.absoluteFill, s.liveTopSongScrim]} />
            {rating > 0 ? (
              <View style={s.liveTopRatingChip}>
                <Text style={s.liveTopRatingText}>R{formatNumber(rating)}</Text>
              </View>
            ) : null}
            <View style={s.liveTopModeChip}>
              <Text style={s.liveTopModeText}>{modeLabel}</Text>
            </View>
            <View style={s.liveTopBottomRow}>
              <View style={s.liveTopGradeChip}>
                <Text style={[s.liveTopGradeText, { color: gradeColor }]}>{gradeLabel || '-'}</Text>
              </View>
              <View style={s.liveTopScoreChip}>
                <Text style={s.liveTopScoreText} numberOfLines={1}>
                  {score > 0 ? formatNumber(score) : '-'}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function LiveTab({ data, isLoading, error, jacketMap, onSessionPress, s }: {
  data: LiveProfileResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  jacketMap: Record<string, string> | undefined;
  onSessionPress: (sessionId: string) => void;
  s: Styles;
}) {
  if (isLoading) return <View style={s.center}><ActivityIndicator /></View>;
  if (error) return <Text style={s.errorText}>{error.message}</Text>;
  // active_session is a LiveDirectoryItem wrapper ({ session, host, ... }).
  // ended_sessions is a list of ProfileEndedLiveSession wrappers.
  const activeWrapper = data?.active_session ?? null;
  const activeSession = activeWrapper?.session ?? null;
  const ended = data?.ended_sessions ?? [];
  if (!activeSession && ended.length === 0) {
    return <View style={s.emptyCard}><Text style={s.emptyText}>No live sessions yet</Text></View>;
  }
  return (
    <View style={s.section}>
      {activeSession ? (
        <View style={s.section}>
          <Text style={s.eyebrow}>LIVE NOW</Text>
          <Pressable
            onPress={() => onSessionPress(activeSession.id)}
            style={({ pressed }) => [s.liveActiveCard, pressed && { opacity: 0.85 }]}>
            <View style={s.liveActiveHeader}>
              <View style={s.liveLivePill}>
                <View style={s.liveLivePillDot} />
                <Text style={s.liveLivePillText}>LIVE</Text>
              </View>
              <Text style={s.liveActiveViewers}>
                {activeSession.viewer_count ?? 0} watching
              </Text>
            </View>
            <Text style={s.liveActiveTitle} numberOfLines={2}>
              {activeSession.title || 'Live session'}
            </Text>
            <Text style={s.liveActiveMeta}>
              Started {formatDate(activeSession.started_at)}
              {activeWrapper?.last_play?.song_title ? ` · Last: ${activeWrapper.last_play.song_title}` : ''}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {ended.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.eyebrow}>PAST SESSIONS</Text>
            <Text style={s.sectionCount}>{ended.length}</Text>
          </View>
          <View style={s.endedList}>
            {ended.map((wrapper) => {
              const sess = wrapper.session;
              const summary = wrapper.summary;
              const startedLabel = formatDate(sess.started_at);
              const duration = summary?.sessionDurationLabel || formatDuration(summary?.sessionDurationMinutes);
              // Server returns clearRate already as a 0–100 percentage
              // (see lib/liveSessionSummary.js — `Math.round((clears /
              // songs) * 100)`). Multiplying again was producing the
              // 6800% bug; just clamp + round here.
              const clearRatePct = Math.max(0, Math.min(100, Math.round(Number(summary?.clearRate ?? 0))));
              const machine = String(summary?.sessionMachineName || '').trim();
              return (
                <Pressable
                  key={String(sess.id)}
                  onPress={() => onSessionPress(sess.id)}
                  style={({ pressed }) => [s.endedCard, pressed && { opacity: 0.85 }]}>
                  <View style={s.endedHeader}>
                    <Text style={s.endedTitle} numberOfLines={1}>{sess.title || 'Live session'}</Text>
                    <Text style={s.endedDate}>{startedLabel}</Text>
                  </View>
                  {summary ? (
                    <View style={s.endedStatsRow}>
                      <View style={s.endedStatCell}>
                        <Text style={s.endedStatValue}>{formatNumber(wrapper.play_count)}</Text>
                        <Text style={s.endedStatLabel}>SONGS</Text>
                      </View>
                      <View style={s.endedStatCell}>
                        <Text style={s.endedStatValue}>{clearRatePct}%</Text>
                        <Text style={s.endedStatLabel}>CLEAR RATE</Text>
                      </View>
                      <View style={s.endedStatCell}>
                        <Text style={s.endedStatValue}>{duration}</Text>
                        <Text style={s.endedStatLabel}>DURATION</Text>
                      </View>
                      <View style={s.endedStatCell}>
                        <Text style={s.endedStatValue}>{formatNumber(wrapper.message_count)}</Text>
                        <Text style={s.endedStatLabel}>MESSAGES</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={s.endedMeta}>{wrapper.play_count} songs · {wrapper.message_count} messages</Text>
                  )}
                  {/* Top 6 best plays — same shape the web profile uses
                      (`topSongsByRating`, falling back to topSongsByScore).
                      Server already trimmed the lists so we just render. */}
                  {summary ? <ProfileLiveTopSongs summary={summary} jacketMap={jacketMap} s={s} /> : null}
                  {/* Machine / location footer — surfaces where the
                      session was hosted (e.g. "London Pump Dojo 1"). */}
                  {machine ? (
                    <View style={s.endedLastPlay}>
                      <Text style={s.endedLastPlayLabel}>AT</Text>
                      <Text style={s.endedLastPlayText} numberOfLines={1}>{machine}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function TitlesTab({ data, isLoading, error, s }: {
  data: PiugameTitlesResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  s: Styles;
}) {
  if (isLoading) return <View style={s.center}><ActivityIndicator /></View>;
  if (error) return <Text style={s.errorText}>{error.message}</Text>;
  if (!data) return <View style={s.emptyCard}><Text style={s.emptyText}>No titles data</Text></View>;
  const summary = data.summary;
  const titles = data.titles ?? [];
  return (
    <View style={s.section}>
      {summary ? (
        <View style={s.titleSummaryCard}>
          <Text style={s.titleSummaryLabel}>CURRENT TITLE</Text>
          <Text style={s.titleSummaryName}>{summary.current_title?.name || '—'}</Text>
          {summary.next_title ? (
            <>
              <View style={s.titleProgressBar}>
                <View style={[s.titleProgressFill, { width: `${Math.max(0, Math.min(100, summary.segment_progress_percent ?? 0))}%` }]} />
              </View>
              <Text style={s.titleSummarySub}>
                Next: {summary.next_title.name} · {formatNumber(summary.remaining_points_to_next_title)} pts to go
              </Text>
            </>
          ) : null}
          <Text style={s.titleSummarySub}>
            Unlocked {summary.unlocked_count}/{summary.total_titles}
          </Text>
        </View>
      ) : null}

      <Text style={s.eyebrow}>ALL TITLES</Text>
      <View style={s.listCard}>
        {/* Sort highest-tier first so the player's hardest unlocks are
            at the top — matches the order the web pages titles in. */}
        {[...titles]
          .sort((a, b) => {
            const ar = Number(a.required_points) || 0;
            const br = Number(b.required_points) || 0;
            if (br !== ar) return br - ar;
            // Tiebreak by current points so partially-progressed titles
            // sit above untouched ones at the same threshold.
            return (Number(b.current_points) || 0) - (Number(a.current_points) || 0);
          })
          .slice(0, 60)
          .map((t) => (
            <View key={String(t.id ?? t.name)} style={s.titleRow}>
              <View style={[s.titleDot, !!t.unlocked && s.titleDotOn]} />
              <View style={s.competitionMain}>
                <Text style={[s.competitionTitle, !t.unlocked ? { opacity: 0.5 } : null]}>{t.name}</Text>
                {t.skill_title ? <Text style={s.competitionMeta}>{t.skill_title}</Text> : null}
              </View>
              <Text style={s.titleRight}>
                {t.unlocked ? '✓' : `${formatNumber(t.current_points)}/${formatNumber(t.required_points)}`}
              </Text>
            </View>
          ))}
      </View>
    </View>
  );
}

function ShoesTab({ data, isLoading, error, isSelf, onWear, wearingShoeId, onActions, onAddPress, s }: {
  data: { active_shoe_id?: number | null; lifetime_songs?: number; lifetime_steps?: number; shoes?: PiugameShoe[] } | undefined;
  isLoading: boolean;
  error: Error | null;
  isSelf: boolean;
  onWear: (shoeId: number) => void;
  /** Set while a wear mutation is in flight — disables and shows a spinner. */
  wearingShoeId: number | null;
  /** Opens the wear / retire / delete action sheet for the given shoe. */
  onActions: (shoe: PiugameShoe) => void;
  onAddPress: () => void;
  s: Styles;
}) {
  if (isLoading) return <View style={s.center}><ActivityIndicator /></View>;
  if (error) return <Text style={s.errorText}>{error.message}</Text>;
  const shoes = data?.shoes ?? [];
  if (shoes.length === 0) {
    return (
      <View style={s.emptyCard}>
        <Text style={s.emptyText}>No shoes added yet</Text>
        {isSelf ? (
          <Pressable
            onPress={onAddPress}
            style={({ pressed }) => [s.shoeAddBtnLarge, pressed && { opacity: 0.85 }]}>
            <Text style={s.shoeAddBtnLargeText}>＋ Add your first pair</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  // Sort: current first, then active, then retired (matches the web cabinet).
  const sortedShoes = [...shoes].sort((a, b) => {
    const aw = a.is_current ? 0 : a.retired_at ? 2 : 1;
    const bw = b.is_current ? 0 : b.retired_at ? 2 : 1;
    return aw - bw;
  });
  return (
    <View style={s.section}>
      <View style={s.shoeStatsRow}>
        <View style={s.shoeStatCell}>
          <Text style={s.statValue}>{formatNumber(data?.lifetime_songs)}</Text>
          <Text style={s.statLabel}>SONGS</Text>
        </View>
        <View style={s.shoeStatCell}>
          <Text style={s.statValue}>{formatNumber(data?.lifetime_steps)}</Text>
          <Text style={s.statLabel}>STEPS</Text>
        </View>
      </View>
      <View style={s.shoeCabinetHeader}>
        <Text style={s.eyebrow}>CABINET</Text>
        {isSelf ? (
          <Pressable
            onPress={onAddPress}
            hitSlop={6}
            style={({ pressed }) => [s.shoeAddBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.shoeAddBtnText}>＋ ADD</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={s.listCard}>
        {sortedShoes.map((shoe) => {
          const wearing = wearingShoeId === shoe.id;
          const canWear = isSelf && !shoe.is_current && !shoe.retired_at;
          return (
            <View key={shoe.id} style={s.shoeRow}>
              {shoe.image_data ? (
                <Image source={{ uri: shoe.image_data }} style={s.shoeImg} contentFit="cover" />
              ) : (
                <View style={[s.shoeImg, s.shoeImgFallback]}><Text>👟</Text></View>
              )}
              <View style={s.competitionMain}>
                <Text style={s.competitionTitle} numberOfLines={1}>{shoe.make} {shoe.model}</Text>
                <Text style={s.competitionMeta}>
                  {shoe.colorway ? `${shoe.colorway} · ` : ''}{formatNumber(shoe.songs_logged)} songs
                </Text>
              </View>
              {shoe.is_current ? (
                <View style={s.shoeWearingPill}>
                  <View style={s.shoeWearingDot} />
                  <Text style={s.shoeWearingText}>WEARING</Text>
                </View>
              ) : shoe.retired_at ? (
                <Text style={s.shoeBadgeRetired}>Retired</Text>
              ) : canWear ? (
                <Pressable
                  onPress={() => onWear(shoe.id)}
                  disabled={wearing}
                  hitSlop={6}
                  style={({ pressed }) => [s.shoeWearBtn, pressed && { opacity: 0.7 }, wearing && { opacity: 0.5 }]}>
                  {wearing ? (
                    <ActivityIndicator size="small" color="#0a0f1c" />
                  ) : (
                    <Text style={s.shoeWearBtnText}>WEAR</Text>
                  )}
                </Pressable>
              ) : null}
              {isSelf ? (
                <Pressable
                  onPress={() => onActions(shoe)}
                  hitSlop={8}
                  style={({ pressed }) => [s.shoeMoreBtn, pressed && { opacity: 0.6 }]}
                  accessibilityLabel="More actions">
                  <Text style={s.shoeMoreGlyph}>⋯</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 14, paddingBottom: 80, gap: 12 },
  center: { flex: 1, padding: 32, alignItems: 'center' as const, justifyContent: 'center' as const },
  errorText: { color: t.danger, fontSize: 14 },

  header: { gap: 10, paddingTop: 4 },
  identityRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  identityCol: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  metaLine: { fontSize: 11, color: t.textDim },
  avatarWrap: { position: 'relative' as const },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: t.surfaceMuted },
  petOverlay: {
    position: 'absolute' as const,
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.card,
    borderWidth: 2,
    borderColor: t.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  petOverlayEmoji: { fontSize: 14 },
  petBigEmojiWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.surfaceMuted,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  petBigEmoji: { fontSize: 32 },
  petStatsGrid: { gap: 8 },
  petStatLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarLetter: { fontSize: 28, fontWeight: '800' as const, color: t.textMuted },
  username: { fontSize: 18, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  skill: { fontSize: 11, color: t.textMuted, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 1 },

  // Top-right pumbility corner cell. Tap toggles overall ↔ singles.
  pumbilityCell: {
    alignItems: 'flex-end' as const,
    gap: 1,
    minWidth: 90,
  },
  pumbilityCellLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.accent },
  pumbilityCellValue: { fontSize: 22, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const], lineHeight: 24 },
  pumbilityCellChipsRow: { flexDirection: 'row' as const, gap: 4, paddingTop: 2 },
  pumbilityCellChip: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: t.textMuted,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: t.surfaceMuted,
    overflow: 'hidden' as const,
  },

  // Compact stats line (replaces the prior 4-cell rows).
  statsLine: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 2,
  },
  statsLineText: { fontSize: 12, color: t.textMuted },
  statsLineNumber: { fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statsLineDot: { fontSize: 12, color: t.textDim },

  statsRow: {
    flexDirection: 'row' as const,
    gap: 6,
    paddingTop: 6,
    paddingHorizontal: 4,
    width: '100%' as const,
  },
  badgeStrip: { gap: 6, paddingVertical: 4 },
  // Sized to match the web (`w-8 h-8` + `p-0.5` on the image): 32px square
  // wrap with a 28px image. Smaller than the previous 36/30 so pixel-art
  // badges rasterize closer to their source resolution and stay crisp.
  badgeWrap: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  badgeImg: { width: 28, height: 28 },
  badgeImgFallback: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface },
  badgeFallbackText: { fontSize: 16 },
  statCell: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: 2,
  },
  statValue: { fontSize: 16, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statLabel: { fontSize: 9, fontWeight: '800' as const, color: t.textDim, letterSpacing: 1 },

  actionRow: { flexDirection: 'row' as const, gap: 8, paddingTop: 6 },
  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: t.accent,
  },
  followBtnActive: { backgroundColor: t.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  followText: { fontSize: 13, fontWeight: '800' as const, color: t.textOnAccent },
  followTextActive: { color: t.textMuted },
  messageBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  messageText: { fontSize: 13, fontWeight: '800' as const, color: t.text },

  tabsRow: { flexDirection: 'row' as const, gap: 4, paddingHorizontal: 2, paddingVertical: 4 },
  tabBtn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  tabBtnActive: { backgroundColor: t.accentTint },
  tabText: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 0.3 },
  tabTextActive: { color: t.accent, fontWeight: '900' as const },

  section: { gap: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  emptyCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 24,
    alignItems: 'center' as const,
  },
  emptyText: { fontSize: 12, color: t.textDim },

  // Activity subtab pills.
  activitySubTabRow: { flexDirection: 'row' as const, gap: 6, paddingVertical: 2 },
  activitySubTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  activitySubTabActive: {
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  activitySubTabText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.4 },
  activitySubTabTextActive: { color: t.textOnAccent },

  // Best Scores: level chevron picker (`< S25 · 12 charts >`) below the
  // mode pills. The mode prefix + level number is the visual anchor, with
  // the chart count inline so users can see how big the upcoming list is.
  bestLevelPicker: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    paddingHorizontal: 2,
  },
  iconBtnSmall: {
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 8,
  },
  bestLevelPill: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  bestLevelStripe: { width: 3, height: 22, borderRadius: 1.5 },
  bestLevelModeLabel: { fontSize: 12, fontWeight: '900' as const, letterSpacing: 1.4 },
  bestLevelNumber: { fontSize: 22, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const], letterSpacing: 0.4 },
  bestLevelCount: { fontSize: 11, fontWeight: '700' as const, color: t.textDim },

  listCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  scoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  scoreMain: { flex: 1, gap: 4, minWidth: 0 },
  scoreTitle: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  scoreMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  scoreDate: { fontSize: 10, color: t.textDim },
  scoreCol: { alignItems: 'flex-end' as const, gap: 4, minWidth: 90 },
  scoreNum: { fontSize: 14, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  scoreBreak: { color: t.danger, fontSize: 11 },
  // Small inline play button on score rows when a YouTube replay clip is
  // attached. Subtle until pressed — the cyan/red play icon does the talking.
  replayBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },

  showMoreBtn: { paddingVertical: 12, alignItems: 'center' as const },
  showMoreText: { fontSize: 12, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.5 },

  postsList: { gap: 8 },
  // Desktop: 2-col masonry-style grid for the Posts tab.
  postsListDesktop: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  postsCellDesktop: {
    width: '48.5%' as const,
    minWidth: 280,
  },

  // Desktop: 2-col list + selected-score panel for Best/Recent tabs.
  desk2col: { flexDirection: 'row' as const, gap: 16, alignItems: 'flex-start' as const },
  desk2colMain: { flex: 1, minWidth: 0 },
  desk2colRail: { width: 320 },
  scorePanel: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 8,
  },
  scorePanelEmpty: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderStyle: 'dashed' as const,
    padding: 24,
    alignItems: 'center' as const,
  },
  scorePanelJacket: { width: '100%' as const, aspectRatio: 1, borderRadius: 8 },
  scorePanelJacketFallback: { backgroundColor: t.surfaceMuted },
  scorePanelTitle: { fontSize: 15, fontWeight: '800' as const, color: t.text, marginTop: 4 },
  scorePanelMeta: { fontSize: 11, color: t.textDim, letterSpacing: 0.4 },
  scorePanelScoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 10,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  scorePanelScoreNum: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: t.text,
    fontVariant: ['tabular-nums' as const],
  },
  scorePanelGrade: { fontSize: 14, fontWeight: '900' as const, letterSpacing: 0.5 },
  scorePanelReplay: {
    marginTop: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
  },
  scorePanelReplayText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: t.accent,
    letterSpacing: 0.4,
  },
  postRow: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 6,
  },
  postHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  postTime: { fontSize: 11, color: t.textDim },
  postMetrics: { flexDirection: 'row' as const, gap: 12 },
  postMetric: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted },
  postBody: { fontSize: 13, color: t.text, lineHeight: 18 },
  postBodyMuted: { fontSize: 12, fontStyle: 'italic' as const, color: t.textMuted },
  postImage: {
    width: '100%' as const,
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: t.surfaceMuted,
  },
  postYoutubeBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(125,211,252,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125,211,252,0.4)',
  },
  postYoutubeText: { fontSize: 10, fontWeight: '900' as const, color: '#7dd3fc', letterSpacing: 0.5 },

  activityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  activityIcon: { fontSize: 14, width: 20, textAlign: 'center' as const },
  activityMessage: { flex: 1, fontSize: 12, color: t.textMuted },
  activityTime: { fontSize: 10, color: t.textDim },

  overviewWrap: { gap: 14 },
  footnote: { fontSize: 11, color: t.textDim, textAlign: 'center' as const, paddingTop: 4 },

  // Pumbility tab
  pumbilityHeaderCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 10,
  },
  pumbilityHeaderRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, flexWrap: 'wrap' as const },
  pumbilityHeaderCol: { flex: 1, gap: 2, minWidth: 100 },
  pumbilityHeaderLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  pumbilityHeaderValue: { fontSize: 22, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  pumbilityHeaderSub: { fontSize: 10, color: t.textMuted },
  pumbilityChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: t.accentTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.accent,
  },
  pumbilityChipText: { fontSize: 11, fontWeight: '900' as const, color: t.accent, letterSpacing: 0.5 },
  pumbilityRank: { fontSize: 11, fontWeight: '900' as const, color: t.textDim, fontVariant: ['tabular-nums' as const], width: 24, textAlign: 'right' as const },

  // Competitions
  sectionHeaderRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  sectionCount: { fontSize: 11, color: t.textDim },
  competitionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  competitionMain: { flex: 1, gap: 3, minWidth: 0 },
  competitionTitle: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  competitionMeta: { fontSize: 11, color: t.textMuted },
  competitionRight: { fontSize: 11, color: t.textDim },
  // WC award chips on the Competitions tab — small amber pills for each
  // award the user earned that week (e.g. "highest_singles_score #2").
  wcAwardRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: 4 },
  wcAwardChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.4)',
  },
  wcAwardText: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#fbbf24',
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },

  // Followers
  subTabsRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center' as const, borderRadius: 8 },
  subTabActive: { backgroundColor: t.accent },
  subTabText: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  subTabTextActive: { color: t.textOnAccent },
  followerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  followerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  followerAvatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  followerLetter: { fontSize: 14, fontWeight: '800' as const, color: t.textMuted },
  followerMain: { flex: 1, gap: 2, minWidth: 0 },
  followerName: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  followerSub: { fontSize: 10, color: t.textMuted },
  followerMutual: { fontSize: 10, fontWeight: '800' as const, color: t.accent },

  // Live
  liveCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34d399',
    shadowColor: '#34d399',
    shadowOpacity: 0.7,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  // Profile Live tab — richer cards (active hero + ended session
  // summaries with the same stats the web shows).
  liveActiveCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.45)',
    padding: 14,
    gap: 8,
  },
  liveActiveHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  liveLivePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(244,63,94,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(244,63,94,0.5)',
  },
  liveLivePillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f43f5e' },
  liveLivePillText: { fontSize: 10, fontWeight: '900' as const, color: '#fda4af', letterSpacing: 0.8 },
  liveActiveViewers: { fontSize: 11, color: t.textMuted, fontWeight: '700' as const },
  liveActiveTitle: { fontSize: 15, fontWeight: '900' as const, color: t.text, lineHeight: 19 },
  liveActiveMeta: { fontSize: 11, color: t.textMuted },

  endedList: { gap: 10 },
  endedCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  endedHeader: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  endedTitle: { flex: 1, fontSize: 14, fontWeight: '800' as const, color: t.text, minWidth: 0 },
  endedDate: { fontSize: 10, color: t.textDim, fontWeight: '700' as const },
  endedMeta: { fontSize: 11, color: t.textMuted },
  endedStatsRow: {
    flexDirection: 'row' as const,
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 10,
    padding: 8,
  },
  endedStatCell: { flex: 1, alignItems: 'center' as const, gap: 2, minWidth: 0 },
  endedStatValue: {
    fontSize: 14,
    fontWeight: '900' as const,
    color: t.text,
    fontVariant: ['tabular-nums' as const],
  },
  endedStatLabel: { fontSize: 9, fontWeight: '900' as const, color: t.textDim, letterSpacing: 0.6 },
  endedLastPlay: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  endedLastPlayLabel: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: t.textDim,
    letterSpacing: 0.6,
  },
  endedLastPlayText: {
    flex: 1,
    fontSize: 11,
    color: t.textMuted,
    minWidth: 0,
  },
  // Top-6 best-plays grid in the Live tab — three across, two rows.
  // Tiles are 4:3 jacket art with rating/mode/grade/score chips on top,
  // matching the web's ProfileLiveTopSongTile.
  liveTopSongsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: 10,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  liveTopSongTile: {
    // (100% - 6px gutter * 2) / 3 = ~32%; flexBasis trick avoids brittle %s.
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '32%' as const,
    aspectRatio: 4 / 3,
    borderRadius: 8,
    overflow: 'hidden' as const,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  liveTopSongFallback: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surfaceMuted },
  liveTopSongFallbackText: { fontSize: 18, fontWeight: '900' as const, color: t.textMuted },
  liveTopSongScrim: { backgroundColor: 'rgba(5,8,22,0.55)' },
  liveTopRatingChip: {
    position: 'absolute' as const,
    top: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,196,0,0.45)',
  },
  liveTopRatingText: { fontSize: 8, fontWeight: '900' as const, color: '#FFC400', letterSpacing: 0.3 },
  liveTopModeChip: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  liveTopModeText: { fontSize: 9, fontWeight: '900' as const, color: '#fff', letterSpacing: 0.3 },
  liveTopBottomRow: {
    position: 'absolute' as const,
    left: 4,
    right: 4,
    bottom: 4,
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-between' as const,
    gap: 4,
  },
  liveTopGradeChip: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  liveTopGradeText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.3 },
  liveTopScoreChip: {
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  liveTopScoreText: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#fff',
    fontVariant: ['tabular-nums' as const],
  },

  // Titles
  titleSummaryCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 6,
  },
  titleSummaryLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  titleSummaryName: { fontSize: 18, fontWeight: '900' as const, color: t.text },
  titleSummarySub: { fontSize: 11, color: t.textMuted },
  titleProgressBar: { height: 6, backgroundColor: t.surfaceMuted, borderRadius: 999, overflow: 'hidden' as const, marginTop: 4 },
  titleProgressFill: { height: '100%' as const, backgroundColor: t.accent },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  titleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.surfaceMuted },
  titleDotOn: { backgroundColor: t.accent },
  titleRight: { fontSize: 11, color: t.textDim, fontVariant: ['tabular-nums' as const] },

  // Shoes
  shoeStatsRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  shoeStatCell: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: 2,
  },
  shoeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  shoeImg: { width: 44, height: 44, borderRadius: 6, backgroundColor: t.surfaceMuted },
  shoeImgFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  shoeBadge: { fontSize: 10, fontWeight: '800' as const, color: t.accent, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: t.accentTint, borderRadius: 4, overflow: 'hidden' as const },
  shoeBadgeRetired: { fontSize: 10, fontWeight: '800' as const, color: t.textDim },
  shoeWearingPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
  },
  shoeWearingDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#34d399' },
  shoeWearingText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: '#34d399' },
  shoeWearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: t.accent,
    minWidth: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  shoeWearBtnText: { fontSize: 10, fontWeight: '900' as const, color: '#0a0f1c', letterSpacing: 1.2 },
  shoeCabinetHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 4 },
  shoeAddBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: t.accentTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.accent,
  },
  shoeAddBtnText: { fontSize: 10, fontWeight: '900' as const, color: t.accent, letterSpacing: 1.2 },
  shoeAddBtnLarge: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: t.accent,
  },
  shoeAddBtnLargeText: { fontSize: 13, fontWeight: '900' as const, color: '#0a0f1c', letterSpacing: 0.5 },
  shoeMoreBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  shoeMoreGlyph: { fontSize: 18, fontWeight: '900' as const, color: t.textMuted, lineHeight: 18 },

  // Header — rich identity
  flagText: { fontSize: 16 },
  gender: { fontSize: 13, color: t.textMuted },
  description: { fontSize: 13, color: t.text, lineHeight: 18, paddingHorizontal: 2 },
  locationRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, flexWrap: 'wrap' as const, justifyContent: 'center' as const },
  locationText: { fontSize: 11, color: t.textDim },
  livePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52,211,153,0.5)',
  },
  livePillDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#34d399' },
  livePillText: { fontSize: 8, fontWeight: '900' as const, letterSpacing: 1, color: '#34d399' },

  // Owner sync + others' notif menu
  iconBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  syncBtnText: { fontSize: 11, fontWeight: '700' as const, color: t.text },
  notifMenuCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 4,
    width: '100%' as const,
  },
  notifMenuTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim, marginBottom: 4 },
  notifToggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 4,
  },
  notifToggleLabel: { fontSize: 13, color: t.text },

  // Group badges
  groupBadgesRow: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const, justifyContent: 'center' as const, paddingTop: 4 },
  groupBadgeWrap: {
    width: 32,
    height: 32,
    borderRadius: 6,
    overflow: 'hidden' as const,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  groupBadgeImg: { width: '100%' as const, height: '100%' as const },
  groupBadgeFallback: { fontSize: 10, fontWeight: '800' as const, color: t.textMuted },

  // Followers follow-back
  followerFollowPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.accent,
  },
  followerFollowPillText: { fontSize: 11, fontWeight: '800' as const, color: t.textOnAccent },
  followerFollowingPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  followerFollowingPillText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted },

  // Achievement modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 16,
  },
  modalCard: {
    width: '100%' as const,
    maxWidth: 380,
    backgroundColor: t.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 16,
    gap: 14,
  },
  modalEyebrow: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1, color: t.accent },
  achievementHero: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  // Modal hero: web uses 96×96 wrap with 4px padding (88×88 image). Keep mobile
  // tighter at 56 to avoid upscaling small source PNGs into blur.
  achievementHeroImg: { width: 56, height: 56 },
  // Next-tier badge: matches web's `w-10 h-10` + `p-0.5` (40×40 wrap, 36×36 image).
  achievementHeroImgSm: { width: 36, height: 36 },
  achievementName: { fontSize: 16, fontWeight: '900' as const, color: t.text },
  achievementDesc: { fontSize: 12, color: t.textMuted, lineHeight: 16 },
  achievementSub: { fontSize: 11, color: t.textDim, fontVariant: ['tabular-nums' as const] },
  achievementNextCard: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  modalCloseBtn: {
    alignSelf: 'flex-end' as const,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  modalCloseText: { fontSize: 12, fontWeight: '700' as const, color: t.text },

  heatmapCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
    width: '100%' as const,
  },

  // Overview analytics + skills
  analyticsCard: {
    flexDirection: 'row' as const,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  analyticsCol: { flex: 1, minWidth: 80, gap: 2 },
  analyticsLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  analyticsValue: { fontSize: 15, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  analyticsSub: { fontSize: 10, color: t.textMuted },
  skillRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  skillRowMain: { flex: 1, gap: 4, minWidth: 0 },
  skillRowName: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  skillRowSub: { fontSize: 10, color: t.textMuted },
  skillRowPct: { fontSize: 13, fontWeight: '900' as const, color: t.accent, fontVariant: ['tabular-nums' as const] },
  skillSearch: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: t.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    marginBottom: 4,
  },
  expandRow: {
    paddingVertical: 12,
    alignItems: 'center' as const,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  expandText: { fontSize: 12, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.5 },

  // Strength/weakness cards
  skillCardsRow: { flexDirection: 'row' as const, gap: 8 },
  skillStrengthCard: {
    flex: 1,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 4,
    borderLeftWidth: 3,
  },
  skillStrengthBorder: { borderColor: t.border, borderLeftColor: '#34d399' },
  skillWeaknessBorder: { borderColor: t.border, borderLeftColor: '#f87171' },
  skillStrengthName: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  skillStrengthScore: { fontSize: 16, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  skillStrengthSub: { fontSize: 10, color: t.textDim, fontVariant: ['tabular-nums' as const] },

  // Skill detail modal
  skillStatsGrid: { flexDirection: 'row' as const, gap: 8 },
  skillStatCell: {
    flex: 1,
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    padding: 10,
    gap: 2,
    alignItems: 'center' as const,
  },
  skillStatLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  skillStatValue: { fontSize: 14, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  skillStatSub: { fontSize: 9, color: t.textMuted },
  skillExampleRow: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  skillExampleTitle: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  skillExampleSub: { fontSize: 11, color: t.textMuted },

  // Competitive level cards
  // Scout-card section (rendered above the competitive level cards).
  // Eyebrow + "View full report →" link, with the MiniScoutCard preview
  // below. Hidden when the user has no PIU data.
  scoutSection: { gap: 6 },
  scoutHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
  },
  scoutEyebrow: { fontSize: 10, letterSpacing: 1.6, color: t.textDim, fontWeight: '900' as const },
  scoutFullLink: { fontSize: 11, color: t.accent, fontWeight: '900' as const, letterSpacing: 0.4 },

  compLevelRow: { flexDirection: 'row' as const, gap: 8 },
  compLevelCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 2,
    alignItems: 'center' as const,
  },
  compLevelLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.5, color: t.textDim },
  compLevelValue: { fontSize: 28, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const], lineHeight: 32 },
  compLevelSub: { fontSize: 10, color: t.textMuted },
  // "Tap to see how this is calculated" hint at the bottom of each card.
  compLevelHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    marginTop: 6,
  },
  compLevelHintText: { fontSize: 9, fontWeight: '700' as const, letterSpacing: 0.3 },
  // Rankings section header with a "tap a level..." subtitle.
  rankingsHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, gap: 8 },
  rankingsHint: { fontSize: 10, color: t.textDim, fontStyle: 'italic' as const },

  // Per-mode level distribution mini chart
  levelChartRow: { flexDirection: 'row' as const, alignItems: 'stretch' as const, gap: 3, height: 64 },
  levelChartCol: { flex: 1, alignItems: 'center' as const, gap: 3, height: '100%' as const },
  levelChartTrack: { flex: 1, width: '100%' as const, justifyContent: 'flex-end' as const, backgroundColor: t.bg, borderRadius: 2, overflow: 'hidden' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  levelChartTotal: { width: '100%' as const, justifyContent: 'flex-end' as const, minHeight: 2 },
  levelChartCleared: { width: '100%' as const },
  levelChartLabel: { fontSize: 8, color: t.textMuted, fontVariant: ['tabular-nums' as const], fontWeight: '700' as const },

  // Desktop 3-col Profile shell — identity rail + center scroll + optimise rail.
  deskRow: { flex: 1, flexDirection: 'row' as const, alignItems: 'stretch' as const },

  // Left identity rail (280 px).
  deskIdentityRail: {
    width: 280,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border,
    backgroundColor: t.surface,
    padding: 16,
    gap: 14,
  },
  deskIdentityHead: { alignItems: 'center' as const, gap: 6 },
  deskIdentityAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: t.surfaceMuted },
  deskIdentityUser: { fontSize: 17, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  deskIdentitySkill: { fontSize: 12, color: t.textMuted, textAlign: 'center' as const },
  deskLivePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    marginTop: 4,
  },

  deskPumTile: {
    backgroundColor: t.bg,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 4,
    alignItems: 'center' as const,
  },
  deskPumLabel: {
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1.4,
    color: t.textDim,
    textTransform: 'uppercase' as const,
  },
  deskPumValue: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: t.text,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums' as const],
  },
  deskPumChips: { flexDirection: 'row' as const, gap: 6, marginTop: 2 },
  deskPumChip: {
    fontSize: 10,
    fontWeight: '900' as const,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.accentTint,
    color: t.accent,
    letterSpacing: 0.4,
  },

  deskActionStack: { gap: 6 },
  deskFollowBtn: {
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
  },
  deskFollowBtnActive: { backgroundColor: t.surfaceMuted },
  deskFollowText: { fontSize: 12, fontWeight: '900' as const, color: t.textOnAccent, letterSpacing: 0.4 },
  deskFollowTextActive: { color: t.text },
  deskMessageBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  deskMessageText: { fontSize: 11, fontWeight: '700' as const, color: t.text, letterSpacing: 0.4 },

  deskStatsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  deskStatCell: {
    flexBasis: '47%' as const,
    flexGrow: 1,
    backgroundColor: t.bg,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'flex-start' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  deskStatNum: {
    fontSize: 16,
    fontWeight: '900' as const,
    color: t.text,
    fontVariant: ['tabular-nums' as const],
  },
  deskStatLabel: { fontSize: 10, color: t.textDim, letterSpacing: 0.4 },

  deskRailLabel: {
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1.6,
    color: t.textDim,
    textTransform: 'uppercase' as const,
    paddingBottom: 6,
  },
  deskBadgeWrap: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  deskBadgeBox: {
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.bg,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  deskBadgeImg: { width: 30, height: 30 },
  deskBadgeFallback: { fontSize: 18 },

  // Right optimise rail (320 px).
  deskOptimiseRail: {
    width: 320,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
  },
  deskOptimiseScroll: { padding: 16, gap: 14, paddingBottom: 60 },
  deskOptCard: {
    backgroundColor: t.bg,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 4,
  },
  deskOptHeadline: { fontSize: 16, fontWeight: '900' as const, color: t.accent, letterSpacing: 0.4 },
  deskOptMeta: { fontSize: 12, color: t.textMuted, lineHeight: 16 },
  deskOptLink: { marginTop: 6 },
  deskOptLinkText: { fontSize: 12, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.4 },
  deskOptPrimary: {
    marginTop: 6,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
  },
  deskOptPrimaryText: { fontSize: 12, fontWeight: '900' as const, color: t.textOnAccent, letterSpacing: 0.4 },
  deskOptAchieveList: { gap: 6, paddingTop: 4 },
  deskOptAchieveRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  deskOptAchieveImg: { width: 28, height: 28 },
  deskOptAchieveName: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: t.text },
});

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AchievementBadgePost } from '@/components/achievement-badge-post';
import { ChartJacket } from '@/components/chart-jacket';
import { CommentsSheet } from '@/components/comments-sheet';
import { DefaultAvatar } from '@/components/default-avatar';
import { SystemAvatar } from '@/components/system-avatar';
import { GradeChip } from '@/components/grade-chip';
import { HamburgerButton } from '@/components/hamburger-button';
import { LiveSessionCard } from '@/components/live-session-card';
import { PlateBadge } from '@/components/plate-badge';
import { ReplayModal } from '@/components/replay-modal';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { SessionPlanCard } from '@/components/session-plan-card';
import { SendToMessageSheet } from '@/components/messages/send-to-message-sheet';
import { SessionShareCard } from '@/components/session-share-card';
import { SessionSummaryCard } from '@/components/session-summary-card';
import { WcSummaryCard } from '@/components/wc-summary-card';
import { WcPersonalCard } from '@/components/wc-personal-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { YouTubeEmbed } from '@/components/youtube-embed';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi, songsApi } from '@/lib/api';
import { parseAchievementBadgePost } from '@/lib/achievementBadgePost';
import { findChartIdInLibrary } from '@/lib/chartLookup';
import { fullImageUrl } from '@/lib/images';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import { splitSessionPlanContent } from '@/lib/sessionPlanMarker';
import { splitSessionShareContent } from '@/lib/sessionShareMarker';
import { splitSessionSummaryContent } from '@/lib/sessionSummaryMarker';
import { splitWcSummaryContent, type WcSummary } from '@/lib/weeklyChallengeSummaryMarker';
import { splitWcPersonalContent, type WcPersonalSummary } from '@/lib/weeklyChallengePersonalMarker';
import { toCanonicalSongTitle } from '@/lib/songAliases';
import type { ThemeColors } from '@/constants/theme';
import type { EmbedSendPayload, FeedItem, LinkShareEmbed, PumpResponse } from '@shared/api';

const FEED_QUERY_KEY = ['social-feed'] as const;

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

function fmtNum(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function parseImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

interface UpscoreEntry {
  song_title?: string;
  mode?: string;
  level?: number;
  old_score?: number;
  new_score?: number;
  old_grade?: string;
  new_grade?: string;
  jacket_url?: string;
  background_url?: string;
  plate?: string;
  pumbility_gain?: number;
  over_top100_rank?: number;
  replay_embed_url?: string;
  chart_id?: number;
  play_id?: number;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  is_stage_break?: number | boolean;
  played_at_utc?: string;
  date_played?: string;
  machine_name?: string;
}

interface WeeklyChallengePlay {
  song_title?: string;
  mode?: string;
  level?: number;
  chart_id?: number;
  score?: number;
  grade?: string;
  plate?: string;
  jacket_url?: string;
  background_url?: string;
  /** Per-play rating-points the chart contributed to the user's WC total. */
  rating_points?: number;
  /** User's rank on the chart's weekly leaderboard (1-based). */
  weekly_challenge_rank?: number;
  weekly_challenge_week_key?: string;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  replay_embed_url?: string;
  date_played?: string;
  played_at_utc?: string;
  play_id?: number;
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

/**
 * Toggles pump on a feed item with optimistic update against the
 * useInfiniteQuery cache. Server is source of truth on success.
 */
function usePumpFeedItem() {
  const queryClient = useQueryClient();

  const optimisticToggle = (item: FeedItem) => {
    queryClient.setQueryData<InfiniteData<FeedItem[]>>(FEED_QUERY_KEY, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) =>
          page.map((it) =>
            it.type === item.type && it.id === item.id
              ? {
                  ...it,
                  user_pumped: it.user_pumped ? 0 : 1,
                  pump_count: (it.pump_count ?? 0) + (it.user_pumped ? -1 : 1),
                }
              : it
          )
        ),
      };
    });
  };

  const applyServerResult = (item: FeedItem, result: PumpResponse) => {
    queryClient.setQueryData<InfiniteData<FeedItem[]>>(FEED_QUERY_KEY, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) =>
          page.map((it) =>
            it.type === item.type && it.id === item.id
              ? { ...it, user_pumped: result.pumped ? 1 : 0, pump_count: result.pump_count }
              : it
          )
        ),
      };
    });
  };

  const mutation = useMutation({
    mutationFn: async (item: FeedItem) => {
      const id = String(item.id);
      if (item.type === 'upscore') return socialApi.pumpUpscore(id);
      if (item.type === 'clear') return socialApi.pumpClear(id);
      if (item.type === 'post') return socialApi.pumpPost(id);
      if (item.type === 'weekly_challenge') return socialApi.pumpWeeklyChallengePlay(id);
      throw new Error(`Cannot pump item of type ${item.type}`);
    },
    onMutate: async (item) => {
      const prev = queryClient.getQueryData<InfiniteData<FeedItem[]>>(FEED_QUERY_KEY);
      optimisticToggle(item);
      return { prev };
    },
    onError: (_err, _item, ctx) => {
      // Roll back if the request failed.
      if (ctx?.prev) queryClient.setQueryData(FEED_QUERY_KEY, ctx.prev);
    },
    onSuccess: (result, item) => {
      applyServerResult(item, result);
    },
  });

  return (item: FeedItem) => mutation.mutate(item);
}

function CardHeader({
  username,
  avatar,
  time,
  rightChildren,
  s,
}: {
  username: string;
  avatar?: string;
  time: string;
  rightChildren?: React.ReactNode;
  s: Styles;
}) {
  const router = useRouter();
  const goToProfile = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    if (!username || username === 'anonymous') return;
    router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });
  };
  return (
    <View style={s.cardHeader}>
      <Pressable onPress={goToProfile} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
        ) : username === '__shinsa__' ? (
          // System bot (weekly challenge recaps, announcements) gets its own
          // sprite so it reads as a system message, not a missing avatar.
          <SystemAvatar size={36} />
        ) : (
          // Anyone showing up in the feed is, by definition, an active player
          // (they posted/upscored/cleared) — fall back to the animated Pixellab
          // sprite rather than a generic letter chip.
          <DefaultAvatar size={36} />
        )}
      </Pressable>
      <View style={s.headerInfo}>
        <View style={s.headerLine}>
          <Pressable onPress={goToProfile} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <Text style={s.username}>{username}</Text>
          </Pressable>
          {rightChildren}
        </View>
        <Text style={s.time}>{time}</Text>
      </View>
    </View>
  );
}

function ActionFooter({
  item,
  s,
  onPump,
  onComments,
  onShare,
}: {
  item: FeedItem;
  s: Styles;
  onPump: (item: FeedItem) => void;
  onComments: (item: FeedItem) => void;
  /** Opens the SendToMessageSheet picker for this feed item. */
  onShare: (item: FeedItem) => void;
}) {
  const { theme } = useTheme();
  const pumped = !!item.user_pumped;
  const pumpColor = pumped ? theme.accent : theme.textMuted;

  return (
    <View style={s.actionFooter}>
      <Pressable
        onPress={() => onPump(item)}
        hitSlop={6}
        style={({ pressed }) => [s.actionItem, pressed && { opacity: 0.6 }]}>
        <IconSymbol name="arrow.up" size={14} color={pumpColor} />
        <Text style={[s.actionCount, { color: pumpColor }]}>{item.pump_count ?? 0}</Text>
      </Pressable>
      <Pressable
        onPress={() => onComments(item)}
        hitSlop={6}
        style={({ pressed }) => [s.actionItem, pressed && { opacity: 0.6 }]}>
        <IconSymbol name="bubble.left.and.bubble.right.fill" size={14} color={theme.textMuted} />
        <Text style={s.actionCount}>{item.comment_count ?? 0}</Text>
      </Pressable>
      <Pressable
        onPress={() => onShare(item)}
        hitSlop={6}
        style={({ pressed }) => [s.actionItem, pressed && { opacity: 0.6 }]}>
        <IconSymbol name="paperplane.fill" size={14} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

function PostCard({ item, onPress, onPump, onComments, onShare, s }: { item: FeedItem; onPress: () => void; onPump: (i: FeedItem) => void; onComments: (i: FeedItem) => void; onShare: (i: FeedItem) => void; s: Styles }) {
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const images = parseImages(item.images);
  const firstImage = images[0] ? fullImageUrl(images[0]) : undefined;
  const { content, summary } = parseLiveSessionMarker(item.content);

  // System-generated weekly_challenge_summary posts attach a structured
  // payload server-side (wc_summary_payload). For older rows the marker may
  // still live inside content — try both.
  const { text: afterWc, summary: wcMarkerSummary } = splitWcSummaryContent(content);
  const wcAttached = (item as Record<string, unknown>).wc_summary_payload as WcSummary | null | undefined;
  const wcSummary = wcAttached ?? wcMarkerSummary;

  // Per-player weekly_challenge_personal posts use the same pattern: server
  // attaches `wc_personal_payload`, with the marker available as a fallback
  // for older rows that haven't been backfilled.
  const { text: afterPersonal, personal: wcPersonalMarker } = splitWcPersonalContent(afterWc);
  const wcPersonalAttached = (item as Record<string, unknown>).wc_personal_payload as WcPersonalSummary | null | undefined;
  const wcPersonal = wcPersonalAttached ?? wcPersonalMarker;

  // Decode the remaining structured share markers (session share, session
  // summary, session plan). Each parser strips its own marker from the text
  // and returns the decoded payload — so by the end `afterPlan` is the human
  // body with all markers removed.
  const { text: afterShare, share: sessionShare } = splitSessionShareContent(afterPersonal);
  const { text: afterSummary, summary: sessionSummary } = splitSessionSummaryContent(afterShare);
  const { text: afterPlan, plan: sessionPlan } = splitSessionPlanContent(afterSummary);

  // Anything still wrapped in [[SHINSA_*_V1:…]] is a share type we don't
  // render yet — strip it so the body doesn't show raw base64.
  const displayBody = String(afterPlan || '').replace(/\[\[SHINSA_[A-Z_]+_V\d+:[^\]]+\]\]/g, '').trim();
  const youtubeUrl = typeof item.youtube_url === 'string' ? item.youtube_url : '';

  // "New badge unlocked: …" posts have a single attached image and a
  // recognisable heading; render the badge as a compact thumb instead of a
  // full-width hero so the pixel-art badge stays crisp.
  const badgePost = parseAchievementBadgePost(displayBody, images);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && s.cardPressed]}>
      <CardHeader
        username={item.username || 'anonymous'}
        avatar={avatar}
        time={timeAgo(item.created_at)}
        s={s}
      />
      {summary ? <LiveSessionCard summary={summary} /> : null}
      {wcSummary ? <WcSummaryCard summary={wcSummary} /> : null}
      {wcPersonal ? <WcPersonalCard summary={wcPersonal} /> : null}
      {sessionShare ? <SessionShareCard share={sessionShare} /> : null}
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
          {displayBody ? <Text style={s.content} numberOfLines={6}>{displayBody}</Text> : null}
          {youtubeUrl ? <YouTubeEmbed url={youtubeUrl} /> : null}
          {firstImage ? (
            <Image source={{ uri: firstImage }} style={s.cardImage} contentFit="cover" transition={150} />
          ) : null}
        </>
      )}
      <ActionFooter item={item} s={s} onPump={onPump} onComments={onComments} onShare={onShare} />
    </Pressable>
  );
}

function UpscoreCard({ item, onPump, onComments, onShare, onJacket, onScore, onReplay, s }: {
  item: FeedItem;
  onPump: (i: FeedItem) => void;
  onComments: (i: FeedItem) => void;
  onShare: (i: FeedItem) => void;
  onJacket: (chartId: number, songTitle: string, mode: string, level: number) => void;
  onScore: (data: ScoreCardData) => void;
  onReplay: (url: string, title: string) => void;
  s: Styles;
}) {
  const { theme } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const username = String(item.username || 'anonymous');
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const entries = parseList<UpscoreEntry>((item as Record<string, unknown>).upscores_json);
  const pumbGain = Number((item as Record<string, unknown>).pumbility_gain);
  const visible = showAll ? entries : entries.slice(0, 5);
  const hasMore = entries.length > 5;

  if (entries.length === 0) {
    return (
      <View style={s.card}>
        <CardHeader username={username} avatar={avatar} time={timeAgo(item.created_at)} s={s} />
      </View>
    );
  }

  return (
    <View style={s.card}>
      <CardHeader
        username={username}
        avatar={avatar}
        time={timeAgo(item.created_at)}
        s={s}
        rightChildren={
          <>
            <Text style={s.upscoresVerb}>upscores!</Text>
            {Number.isFinite(pumbGain) && pumbGain > 0 ? (
              <Text style={s.pbBadge}>+{pumbGain.toLocaleString()} PB</Text>
            ) : null}
          </>
        }
      />

      <View style={s.entriesList}>
        {visible.map((u, i) => {
          const jacket = u.jacket_url || u.background_url;
          const jacketUrl = typeof jacket === 'string' ? fullImageUrl(jacket) : undefined;
          const delta = (u.new_score ?? 0) - (u.old_score ?? 0);
          const chartId = Number(u.chart_id) || 0;
          return (
            <View key={i} style={s.upscoreRow}>
              <Pressable
                onPress={() => onJacket(chartId, u.song_title || '', u.mode || '', Number(u.level) || 0)}
                hitSlop={4}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <ChartJacket jacketUrl={jacketUrl} mode={u.mode} level={u.level} size="sm" />
              </Pressable>
              <View style={s.entryMain}>
                <Text style={s.songTitle} numberOfLines={1}>{u.song_title || 'Unknown song'}</Text>
                <View style={s.metaChipsRow}>
                  <PlateBadge plate={u.plate} size="xs" />
                  {typeof u.over_top100_rank === 'number' && u.over_top100_rank > 0 ? (
                    <Text style={s.topRankChip}>TOP #{u.over_top100_rank}</Text>
                  ) : null}
                </View>
              </View>
              {u.replay_embed_url ? (
                <Pressable
                  onPress={() => onReplay(u.replay_embed_url as string, `${u.song_title || 'Song'} · ${u.mode || ''}${u.level ? ` ${u.level}` : ''}`)}
                  hitSlop={6}
                  style={({ pressed }) => [s.replayBtn, pressed && { opacity: 0.7 }]}>
                  <IconSymbol name="play.rectangle.fill" size={14} color="#7dd3fc" />
                </Pressable>
              ) : null}
              {/* Score column — stacked vertically so the long numbers
                  (1,000,000 SSS+) don't overflow the card on a phone-
                  sized layout. New score on top (most prominent), prev
                  score muted below, delta as a green chip at the
                  bottom. */}
              <Pressable
                onPress={() => onScore({ ...u, username: item.username, avatar: item.avatar as string | undefined })}
                hitSlop={4}
                style={({ pressed }) => [s.scoresCol, pressed && { opacity: 0.7 }]}>
                <View style={s.scoreLineNew}>
                  <Text style={s.scoreNum} numberOfLines={1}>{fmtNum(u.new_score)}</Text>
                  <GradeChip grade={u.new_grade} score={u.new_score ?? 0} size="xs" />
                </View>
                <View style={s.scoreLineOld}>
                  <Text style={s.scoreNumOld} numberOfLines={1}>prev {fmtNum(u.old_score)}</Text>
                  <GradeChip grade={u.old_grade} score={u.old_score ?? 0} size="xs" />
                </View>
                {delta > 0 ? <Text style={s.delta}>+{fmtNum(delta)}</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      {hasMore ? (
        <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={8}>
          <Text style={[s.showMoreBtn, { color: theme.accent }]}>
            {showAll ? 'Show less' : `Show ${entries.length - 5} more`}
          </Text>
        </Pressable>
      ) : null}

      <ActionFooter item={item} s={s} onPump={onPump} onComments={onComments} onShare={onShare} />
    </View>
  );
}

function ClearCard({ item, onPump, onComments, onShare, onJacket, onScore, s }: {
  item: FeedItem;
  onPump: (i: FeedItem) => void;
  onComments: (i: FeedItem) => void;
  onShare: (i: FeedItem) => void;
  onJacket: (chartId: number, songTitle: string, mode: string, level: number) => void;
  onScore: (data: ScoreCardData) => void;
  s: Styles;
}) {
  const username = String(item.username || 'anonymous');
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const itemRec = item as Record<string, unknown>;
  const songTitle = String(itemRec.song_title ?? '').trim() || 'Unknown song';
  const mode = String(itemRec.mode ?? '');
  const level = Number(itemRec.level);
  const score = Number(itemRec.score);
  const grade = String(itemRec.grade ?? '');
  const plate = itemRec.plate;
  const jacketRaw = (itemRec.jacket_url as string | undefined) || (itemRec.background_url as string | undefined);
  const jacket = jacketRaw ? fullImageUrl(jacketRaw) : undefined;
  const chartId = Number(itemRec.chart_id) || 0;

  const buildScore = (): ScoreCardData => ({
    song_title: songTitle,
    mode,
    level: Number.isFinite(level) ? level : undefined,
    score,
    grade,
    plate: typeof plate === 'string' ? plate : undefined,
    jacket_url: jacketRaw,
    chart_id: chartId,
    play_id: Number(itemRec.play_id) || undefined,
    perfect: Number(itemRec.perfect) || 0,
    great: Number(itemRec.great) || 0,
    good: Number(itemRec.good) || 0,
    bad: Number(itemRec.bad) || 0,
    miss: Number(itemRec.miss) || 0,
    max_combo: Number(itemRec.max_combo) || 0,
    is_stage_break: Boolean(itemRec.is_stage_break),
    over_top100_rank: Number(itemRec.over_top100_rank) || 0,
    played_at_utc: typeof itemRec.played_at_utc === 'string' ? itemRec.played_at_utc : undefined,
    machine_name: typeof itemRec.machine_name === 'string' ? itemRec.machine_name : undefined,
    replay_embed_url: typeof itemRec.replay_embed_url === 'string' ? itemRec.replay_embed_url : undefined,
    username: item.username,
    avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
  });

  return (
    <View style={s.card}>
      <CardHeader
        username={username}
        avatar={avatar}
        time={timeAgo(item.created_at)}
        s={s}
        rightChildren={<Text style={s.clearedVerb}>cleared a chart</Text>}
      />

      <View style={s.upscoreRow}>
        <Pressable
          onPress={() => onJacket(chartId, songTitle, mode, Number.isFinite(level) ? level : 0)}
          hitSlop={4}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
          <ChartJacket jacketUrl={jacket} mode={mode} level={Number.isFinite(level) ? level : undefined} size="sm" />
        </Pressable>
        <View style={s.entryMain}>
          <Text style={s.songTitle} numberOfLines={1}>{songTitle}</Text>
          <View style={s.metaChipsRow}>
            <PlateBadge plate={plate} size="xs" />
          </View>
        </View>
        <Pressable
          onPress={() => onScore(buildScore())}
          hitSlop={4}
          style={({ pressed }) => [s.scoresCol, pressed && { opacity: 0.7 }]}>
          <Text style={s.scoreNum}>{fmtNum(score)}</Text>
          <GradeChip grade={grade} score={score} size="sm" />
        </Pressable>
      </View>

      <ActionFooter item={item} s={s} onPump={onPump} onComments={onComments} onShare={onShare} />
    </View>
  );
}

function WeeklyChallengeCard({ item, onPump, onComments, onShare, onJacket, onScore, onReplay, s }: {
  item: FeedItem;
  onPump: (i: FeedItem) => void;
  onComments: (i: FeedItem) => void;
  onShare: (i: FeedItem) => void;
  onJacket: (chartId: number, songTitle: string, mode: string, level: number) => void;
  onScore: (data: ScoreCardData) => void;
  onReplay: (url: string, title: string) => void;
  s: Styles;
}) {
  const { theme } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const username = String(item.username || 'anonymous');
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const itemRec = item as Record<string, unknown>;
  const totalPts = Number(itemRec.total_rating_points);
  const weekKey = String(itemRec.week_key || '');
  const plays = parseList<WeeklyChallengePlay>(itemRec.plays_json);
  const visible = showAll ? plays : plays.slice(0, 5);
  const hasMore = plays.length > 5;

  if (plays.length === 0) {
    return (
      <View style={s.card}>
        <CardHeader
          username={username}
          avatar={avatar}
          time={timeAgo(item.created_at)}
          s={s}
          rightChildren={<Text style={s.clearedVerb}>played a weekly challenge</Text>}
        />
        <Text style={s.wcSummary}>Logged a weekly challenge attempt</Text>
        <ActionFooter item={item} s={s} onPump={onPump} onComments={onComments} onShare={onShare} />
      </View>
    );
  }

  return (
    <View style={s.card}>
      <CardHeader
        username={username}
        avatar={avatar}
        time={timeAgo(item.created_at)}
        s={s}
        rightChildren={
          <>
            <Text style={s.wcVerb}>weekly challenge!</Text>
            {weekKey ? <Text style={s.wcWeekPill}>{weekKey}</Text> : null}
            {Number.isFinite(totalPts) && totalPts > 0 ? (
              <Text style={s.wcTotalPill}>{fmtNum(totalPts)} pts</Text>
            ) : null}
          </>
        }
      />

      <View style={s.entriesList}>
        {visible.map((play, i) => {
          const jacket = play.jacket_url || play.background_url;
          const jacketUrl = typeof jacket === 'string' ? fullImageUrl(jacket) : undefined;
          const chartId = Number(play.chart_id) || 0;
          const rank = Number(play.weekly_challenge_rank) || 0;
          const pts = Number(play.rating_points) || 0;
          return (
            <View key={i} style={s.upscoreRow}>
              <Pressable
                onPress={() => onJacket(chartId, play.song_title || '', play.mode || '', Number(play.level) || 0)}
                hitSlop={4}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <ChartJacket jacketUrl={jacketUrl} mode={play.mode} level={play.level} size="sm" />
              </Pressable>
              <View style={s.entryMain}>
                <Text style={s.songTitle} numberOfLines={1}>{play.song_title || 'Unknown song'}</Text>
                <View style={s.metaChipsRow}>
                  {rank > 0 ? (
                    <Text style={s.wcRankChip}>WC #{rank}</Text>
                  ) : null}
                  {pts > 0 ? (
                    <Text style={s.wcPtsChip}>{pts} pts</Text>
                  ) : null}
                  <PlateBadge plate={play.plate} size="xs" />
                </View>
              </View>
              {play.replay_embed_url ? (
                <Pressable
                  onPress={() => onReplay(
                    play.replay_embed_url as string,
                    `${play.song_title || 'Song'} · ${play.mode || ''}${play.level ? ` ${play.level}` : ''}`,
                  )}
                  hitSlop={6}
                  style={({ pressed }) => [s.replayBtn, pressed && { opacity: 0.7 }]}>
                  <IconSymbol name="play.rectangle.fill" size={14} color="#7dd3fc" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => onScore({
                  song_title: play.song_title,
                  mode: play.mode,
                  level: play.level,
                  chart_id: play.chart_id,
                  score: play.score,
                  grade: play.grade,
                  plate: play.plate,
                  jacket_url: play.jacket_url || play.background_url,
                  background_url: play.background_url,
                  perfect: play.perfect,
                  great: play.great,
                  good: play.good,
                  bad: play.bad,
                  miss: play.miss,
                  max_combo: play.max_combo,
                  replay_embed_url: play.replay_embed_url,
                  played_at_utc: play.played_at_utc,
                  date_played: play.date_played,
                  play_id: play.play_id,
                  username: item.username,
                  avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
                })}
                hitSlop={4}
                style={({ pressed }) => [s.scoresCol, pressed && { opacity: 0.7 }]}>
                <Text style={s.scoreNum}>{fmtNum(play.score)}</Text>
                <GradeChip grade={play.grade} score={play.score ?? 0} size="xs" />
              </Pressable>
            </View>
          );
        })}
      </View>

      {hasMore ? (
        <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={8}>
          <Text style={[s.showMoreBtn, { color: theme.accent }]}>
            {showAll ? 'Show less' : `Show ${plays.length - 5} more`}
          </Text>
        </Pressable>
      ) : null}

      <ActionFooter item={item} s={s} onPump={onPump} onComments={onComments} onShare={onShare} />
    </View>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();
  const s = useThemedStyles(makeStyles);
  const onPump = usePumpFeedItem();
  const [commentTarget, setCommentTarget] = useState<{ type: FeedItem['type']; id: string | number } | null>(null);
  const onComments = (item: FeedItem) => setCommentTarget({ type: item.type, id: item.id });
  const [scoreTarget, setScoreTarget] = useState<ScoreCardData | null>(null);
  const [replayTarget, setReplayTarget] = useState<{ url: string; title: string } | null>(null);
  // Send-to-DM target — captures the feed item the user tapped the
  // paperplane on so the DM picker sheet can build a link_share payload
  // that points back at the original post / upscore / clear.
  const [shareTarget, setShareTarget] = useState<FeedItem | null>(null);
  const onShare = (item: FeedItem) => setShareTarget(item);

  // Fetch the songs library lazily (cached) so jacket-clicks for entries
  // missing `chart_id` can still resolve to a chart via title+mode+level.
  const libraryQuery = useQuery({
    queryKey: ['songs-library', user?.id ?? null],
    queryFn: () => songsApi.library(user?.id ? { user_id: user.id } : {}),
    staleTime: 5 * 60_000,
  });

  const onJacket = (chartId: number, songTitle: string, mode: string, level: number) => {
    if (chartId) {
      router.push({ pathname: '/song/[id]', params: { id: String(chartId) } });
      return;
    }
    const resolved = findChartIdInLibrary(libraryQuery.data, songTitle, mode, level);
    if (resolved) {
      router.push({ pathname: '/song/[id]', params: { id: String(resolved) } });
      return;
    }
    // Last resort: pre-fill the songs library search with the canonical title.
    const q = toCanonicalSongTitle(songTitle) || songTitle;
    router.push({ pathname: '/songs', params: { q } });
  };
  const onScore = (data: ScoreCardData) => setScoreTarget(data);
  const onReplay = (url: string, title: string) => setReplayTarget({ url, title });

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: ({ pageParam = 1 }) => socialApi.feed({ page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => (lastPage.length === 0 ? undefined : pages.length + 1),
  });

  const items = data?.pages.flat() ?? [];

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <HamburgerButton />
        <Text style={s.heading}>Feed</Text>
        <Pressable
          onPress={() => router.push('/posts')}
          hitSlop={12}
          style={({ pressed }) => [s.composeBtn, pressed && { opacity: 0.6 }]}>
          <IconSymbol name="plus" size={22} color={theme.accent} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error instanceof Error ? error.message : 'Failed to load feed'}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => `${item.type}:${item.id}:${i}`}
          renderItem={({ item }) => {
            if (item.type === 'post') {
              return (
                <PostCard
                  item={item}
                  s={s}
                  onPump={onPump}
                  onComments={onComments}
                  onShare={onShare}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(item.id) } })}
                />
              );
            }
            if (item.type === 'upscore') return <UpscoreCard item={item} s={s} onPump={onPump} onComments={onComments} onShare={onShare} onJacket={onJacket} onScore={onScore} onReplay={onReplay} />;
            if (item.type === 'clear') return <ClearCard item={item} s={s} onPump={onPump} onComments={onComments} onShare={onShare} onJacket={onJacket} onScore={onScore} />;
            if (item.type === 'weekly_challenge') return <WeeklyChallengeCard item={item} s={s} onPump={onPump} onComments={onComments} onShare={onShare} onJacket={onJacket} onScore={onScore} onReplay={onReplay} />;
            return null;
          }}
          contentContainerStyle={s.listContent}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={() => <Text style={s.empty}>Your feed is empty. Follow people to see their activity here.</Text>}
          ListFooterComponent={() => {
            if (items.length === 0) return null;
            if (isFetchingNextPage) {
              return <View style={s.loadMore}><ActivityIndicator color={theme.spinner} /></View>;
            }
            if (hasNextPage) {
              return (
                <Pressable
                  onPress={() => fetchNextPage()}
                  style={({ pressed }) => [s.loadMore, pressed && { opacity: 0.6 }]}>
                  <Text style={s.loadMoreText}>Load more</Text>
                </Pressable>
              );
            }
            return <Text style={s.endText}>You're all caught up.</Text>;
          }}
          refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={refetch} tintColor={theme.spinner} />}
        />
      )}

      <CommentsSheet
        visible={!!commentTarget}
        itemType={commentTarget?.type}
        itemId={commentTarget?.id}
        onClose={() => setCommentTarget(null)}
      />

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

      {/* Send-to-DM picker — built from the active feed item. Builds a
          link_share that points back at the post / upscore / clear so the
          recipient gets a tappable card matching the web link_share embed. */}
      <SendToMessageSheet
        visible={!!shareTarget}
        onClose={() => setShareTarget(null)}
        title={buildFeedShareTitle(shareTarget)}
        description={buildFeedShareSubtitle(shareTarget)}
        payload={buildFeedSharePayload(shareTarget)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Feed-item → DM payload helpers
// ---------------------------------------------------------------------------

function buildFeedShareTitle(item: FeedItem | null): string {
  if (!item) return 'Share to chat';
  if (item.type === 'post') return `Share post by @${String(item.username || 'unknown')}`;
  if (item.type === 'upscore') return `Share upscore on ${String(item.song_title || '')}`.trim();
  if (item.type === 'clear') return `Share clear on ${String(item.song_title || '')}`.trim();
  if (item.type === 'weekly_challenge') return `Share weekly play: ${String(item.song_title || '')}`.trim();
  return 'Share to chat';
}

function buildFeedShareSubtitle(item: FeedItem | null): string {
  if (!item) return '';
  const score = parseInt(String((item as Record<string, unknown>).score ?? (item as Record<string, unknown>).new_score ?? 0), 10) || 0;
  const grade = String((item as Record<string, unknown>).grade ?? (item as Record<string, unknown>).new_grade ?? '').trim();
  if (score > 0 && grade) return `${grade} · ${score.toLocaleString()}`;
  if (score > 0) return score.toLocaleString();
  return '';
}

function buildFeedSharePayload(item: FeedItem | null): EmbedSendPayload {
  if (!item) return {};
  // Map feed item type → server route path the recipient can deep-link into.
  const path = (() => {
    if (item.type === 'post') return `/post/${String(item.id)}`;
    if (item.type === 'upscore') return `/upscore/${String(item.id)}`;
    if (item.type === 'clear') return `/clear/${String(item.id)}`;
    if (item.type === 'weekly_challenge') return `/weekly-play/${String(item.id)}`;
    return '';
  })();
  if (!path) return {};
  const data = item as Record<string, unknown>;
  const songTitle = String(data.song_title ?? '');
  const mode = String(data.mode ?? '');
  const level = parseInt(String(data.level ?? 0), 10) || 0;
  const score = parseInt(String(data.score ?? data.new_score ?? 0), 10) || 0;
  const grade = String(data.grade ?? data.new_grade ?? '').trim();
  const link_share: LinkShareEmbed = {
    version: 1,
    kind: item.type === 'post' ? 'link' : 'score_share',
    path,
    title: songTitle || (item.type === 'post' ? `Post by @${String(data.username ?? '')}` : ''),
    songTitle,
    mode,
    level,
    score,
    grade,
    playerName: String(data.username ?? ''),
    playerAvatar: typeof data.avatar === 'string' ? data.avatar : undefined,
    jacketUrl: (typeof data.jacket_url === 'string' && data.jacket_url)
      || (typeof data.background_url === 'string' && data.background_url)
      || undefined,
  };
  return { link_share };
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  heading: { flex: 1, fontSize: 28, fontWeight: '800' as const, color: t.text, letterSpacing: 2 },
  composeBtn: { padding: 4 },
  listContent: { padding: 16, paddingBottom: 80 },
  separator: { height: 12 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  empty: { textAlign: 'center' as const, padding: 32, color: t.textDim },
  errorText: { color: t.danger, textAlign: 'center' as const },

  card: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  cardPressed: { backgroundColor: t.accentTint },
  cardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarLetter: { fontSize: 14, fontWeight: '800' as const, color: t.textMuted },
  headerInfo: { flex: 1, minWidth: 0, gap: 1 },
  headerLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  username: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  upscoresVerb: { fontSize: 12, fontWeight: '800' as const, color: t.success },
  clearedVerb: { fontSize: 12, color: t.textMuted },
  pbBadge: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#7dd3fc',
    backgroundColor: 'rgba(125,211,252,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  time: { fontSize: 11, color: t.textDim },
  content: { fontSize: 14, lineHeight: 20, color: t.text },
  cardImage: { width: '100%' as const, aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: t.surfaceMuted },

  entriesList: { gap: 8 },
  upscoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  entryJacket: { width: 40, height: 40, borderRadius: 6, backgroundColor: t.surfaceMuted },
  jacketFallback: {},
  // `flexShrink: 1` so the title column gives way to the score column
  // when the score side hits its content width; `minWidth: 0` is the
  // RN/web flex-overflow escape hatch.
  entryMain: { flex: 1, minWidth: 0, flexShrink: 1, gap: 4 },
  songTitle: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  metaChipsRow: { flexDirection: 'row' as const, gap: 4, alignItems: 'center' as const, flexWrap: 'wrap' as const },
  modeChip: {
    fontSize: 9,
    fontWeight: '800' as const,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: t.surfaceMuted,
    color: t.textMuted,
    overflow: 'hidden' as const,
  },
  levelChip: {
    fontSize: 9,
    fontWeight: '800' as const,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: t.accentTint,
    color: t.accent,
    overflow: 'hidden' as const,
  },
  topRankChip: {
    fontSize: 9,
    fontWeight: '800' as const,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,196,0,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,196,0,0.5)',
    color: '#FFE06B',
    overflow: 'hidden' as const,
  },
  replayBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(125,211,252,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125,211,252,0.4)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // The score column is fixed-width on the right; the song title column
  // shrinks to fit. maxWidth caps how much horizontal real estate the
  // score block can claim so it never blows past the card's right edge.
  scoresCol: {
    alignItems: 'flex-end' as const,
    gap: 2,
    width: 130,
    maxWidth: 130,
    flexShrink: 0,
  },
  scoreLineNew: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  scoreLineOld: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, opacity: 0.7 },
  scoreNum: { fontSize: 13, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  scoreNumOld: { fontSize: 10, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  arrow: { fontSize: 10, color: t.textDim },
  delta: { fontSize: 11, fontWeight: '800' as const, color: t.success, fontVariant: ['tabular-nums' as const] },

  showMoreBtn: { fontSize: 12, fontWeight: '800' as const, paddingTop: 4 },

  actionFooter: {
    flexDirection: 'row' as const,
    gap: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    marginTop: 2,
  },
  actionItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  actionCount: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted },

  wcSummary: { fontSize: 13, color: t.textMuted },
  // Header chips for the WC play card. "weekly challenge!" verb plus a
  // pill for the week key (purple) and another for total RP (emerald).
  wcVerb: { fontSize: 12, fontWeight: '800' as const, color: '#c4b5fd', letterSpacing: 0.2 },
  wcWeekPill: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#c4b5fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    overflow: 'hidden' as const,
    letterSpacing: 0.4,
  },
  wcTotalPill: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#6ee7b7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    overflow: 'hidden' as const,
    letterSpacing: 0.4,
  },
  // Per-play chips inside each row: leaderboard rank + RP awarded.
  wcRankChip: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#c4b5fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    overflow: 'hidden' as const,
    letterSpacing: 0.4,
  },
  wcPtsChip: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#6ee7b7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    overflow: 'hidden' as const,
    letterSpacing: 0.4,
  },

  loadMore: {
    paddingVertical: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  loadMoreText: { fontSize: 13, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.5 },
  endText: { textAlign: 'center' as const, padding: 24, fontSize: 12, color: t.textDim },
});

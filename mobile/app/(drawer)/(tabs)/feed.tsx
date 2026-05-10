import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradeChip } from '@/components/grade-chip';
import { HamburgerButton } from '@/components/hamburger-button';
import { LiveSessionCard } from '@/components/live-session-card';
import { PlateBadge } from '@/components/plate-badge';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import type { ThemeColors } from '@/constants/theme';
import type { FeedItem, PumpResponse } from '@shared/api';

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
}

interface WeeklyChallengePlay {
  song_title?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
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
  return (
    <View style={s.cardHeader}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
      ) : (
        <View style={[s.avatar, s.avatarFallback]}>
          <Text style={s.avatarLetter}>{username.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={s.headerInfo}>
        <View style={s.headerLine}>
          <Text style={s.username}>{username}</Text>
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
}: {
  item: FeedItem;
  s: Styles;
  onPump: (item: FeedItem) => void;
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
      <View style={s.actionItem}>
        <IconSymbol name="bubble.left.and.bubble.right.fill" size={14} color={theme.textMuted} />
        <Text style={s.actionCount}>{item.comment_count ?? 0}</Text>
      </View>
      <View style={s.actionItem}>
        <IconSymbol name="paperplane.fill" size={14} color={theme.textMuted} />
      </View>
    </View>
  );
}

function PostCard({ item, onPress, onPump, s }: { item: FeedItem; onPress: () => void; onPump: (i: FeedItem) => void; s: Styles }) {
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const images = parseImages(item.images);
  const firstImage = images[0] ? fullImageUrl(images[0]) : undefined;
  const { content, summary } = parseLiveSessionMarker(item.content);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && s.cardPressed]}>
      <CardHeader
        username={item.username || 'anonymous'}
        avatar={avatar}
        time={timeAgo(item.created_at)}
        s={s}
      />
      {summary ? <LiveSessionCard summary={summary} /> : null}
      {content ? <Text style={s.content} numberOfLines={6}>{content}</Text> : null}
      {firstImage ? (
        <Image source={{ uri: firstImage }} style={s.cardImage} contentFit="cover" transition={150} />
      ) : null}
      <ActionFooter item={item} s={s} onPump={onPump} />
    </Pressable>
  );
}

function UpscoreCard({ item, onPump, s }: { item: FeedItem; onPump: (i: FeedItem) => void; s: Styles }) {
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
          return (
            <View key={i} style={s.upscoreRow}>
              {jacketUrl ? (
                <Image source={{ uri: jacketUrl }} style={s.entryJacket} contentFit="cover" transition={150} />
              ) : (
                <View style={[s.entryJacket, s.jacketFallback]} />
              )}
              <View style={s.entryMain}>
                <Text style={s.songTitle} numberOfLines={1}>{u.song_title || 'Unknown song'}</Text>
                <View style={s.metaChipsRow}>
                  {u.mode ? <Text style={s.modeChip}>{u.mode}</Text> : null}
                  {typeof u.level === 'number' && u.level > 0 ? (
                    <Text style={s.levelChip}>Lv {u.level}</Text>
                  ) : null}
                  <PlateBadge plate={u.plate} size="xs" />
                  {typeof u.over_top100_rank === 'number' && u.over_top100_rank > 0 ? (
                    <Text style={s.topRankChip}>TOP #{u.over_top100_rank}</Text>
                  ) : null}
                </View>
              </View>
              {u.replay_embed_url ? (
                <View style={s.replayBtn}>
                  <IconSymbol name="play.rectangle.fill" size={14} color="#7dd3fc" />
                </View>
              ) : null}
              <View style={s.scoresCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={s.scoreNumOld}>{fmtNum(u.old_score)}</Text>
                  <GradeChip grade={u.old_grade} score={u.old_score ?? 0} size="xs" />
                  <Text style={s.arrow}>→</Text>
                  <Text style={s.scoreNum}>{fmtNum(u.new_score)}</Text>
                  <GradeChip grade={u.new_grade} score={u.new_score ?? 0} size="xs" />
                </View>
                <Text style={s.delta}>+{fmtNum(delta)}</Text>
              </View>
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

      <ActionFooter item={item} s={s} onPump={onPump} />
    </View>
  );
}

function ClearCard({ item, onPump, s }: { item: FeedItem; onPump: (i: FeedItem) => void; s: Styles }) {
  const username = String(item.username || 'anonymous');
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const itemRec = item as Record<string, unknown>;
  const songTitle = String(itemRec.song_title ?? '').trim() || 'Unknown song';
  const mode = String(itemRec.mode ?? '');
  const level = Number(itemRec.level);
  const score = Number(itemRec.score);
  const grade = String(itemRec.grade ?? '');
  const plate = itemRec.plate;
  const jacket = typeof itemRec.background_url === 'string' ? fullImageUrl(itemRec.background_url) : undefined;

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
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.entryJacket} contentFit="cover" transition={150} />
        ) : (
          <View style={[s.entryJacket, s.jacketFallback]} />
        )}
        <View style={s.entryMain}>
          <Text style={s.songTitle} numberOfLines={1}>{songTitle}</Text>
          <View style={s.metaChipsRow}>
            {mode ? <Text style={s.modeChip}>{mode}</Text> : null}
            {Number.isFinite(level) && level > 0 ? <Text style={s.levelChip}>Lv {level}</Text> : null}
            <PlateBadge plate={plate} size="xs" />
          </View>
        </View>
        <View style={s.scoresCol}>
          <Text style={s.scoreNum}>{fmtNum(score)}</Text>
          <GradeChip grade={grade} score={score} size="sm" />
        </View>
      </View>

      <ActionFooter item={item} s={s} onPump={onPump} />
    </View>
  );
}

function WeeklyChallengeCard({ item, onPump, s }: { item: FeedItem; onPump: (i: FeedItem) => void; s: Styles }) {
  const username = String(item.username || 'anonymous');
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const itemRec = item as Record<string, unknown>;
  const totalCharts = Number(itemRec.total_charts_played);
  const totalPts = Number(itemRec.total_rating_points);
  const plays = parseList<WeeklyChallengePlay>(itemRec.plays_json);
  const charts = Number.isFinite(totalCharts) && totalCharts > 0 ? totalCharts : plays.length;
  const ptsLabel = Number.isFinite(totalPts) && totalPts > 0 ? ` · ${fmtNum(totalPts)} pts` : '';

  return (
    <View style={s.card}>
      <CardHeader
        username={username}
        avatar={avatar}
        time={timeAgo(item.created_at)}
        s={s}
        rightChildren={<Text style={s.clearedVerb}>played a weekly challenge</Text>}
      />
      {charts > 0 ? (
        <Text style={s.wcSummary}>{charts} chart{charts === 1 ? '' : 's'}{ptsLabel}</Text>
      ) : null}
      <ActionFooter item={item} s={s} onPump={onPump} />
    </View>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const onPump = usePumpFeedItem();

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
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(item.id) } })}
                />
              );
            }
            if (item.type === 'upscore') return <UpscoreCard item={item} s={s} onPump={onPump} />;
            if (item.type === 'clear') return <ClearCard item={item} s={s} onPump={onPump} />;
            if (item.type === 'weekly_challenge') return <WeeklyChallengeCard item={item} s={s} onPump={onPump} />;
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
    </View>
  );
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
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  entryJacket: { width: 40, height: 40, borderRadius: 6, backgroundColor: t.surfaceMuted },
  jacketFallback: {},
  entryMain: { flex: 1, minWidth: 0, gap: 4 },
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
  scoresCol: { alignItems: 'flex-end' as const, gap: 2, minWidth: 110 },
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

  loadMore: {
    paddingVertical: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  loadMoreText: { fontSize: 13, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.5 },
  endText: { textAlign: 'center' as const, padding: 24, fontSize: 12, color: t.textDim },
});

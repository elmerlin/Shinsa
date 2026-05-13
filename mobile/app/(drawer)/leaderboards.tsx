import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { liveApi, piugameApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { getGradeDisplayLabel, getGradeTier, TIER_COLORS } from '@/lib/grades';
import type { ThemeColors } from '@/constants/theme';
import type {
  HopLeaderboardRow,
  MyTop100ScoreRow,
  Over20Chart,
  Over20ChartScore,
  PumbilityLeaderboardRow,
} from '@shared/api';

type TabKey = 'pumbility' | 'over20' | 'hop' | 'mytop100';
type PumbilityMetric = 'overall' | 'singles';
type OverModeFilter = 'all' | 'single' | 'double';

interface QueryHints {
  tab?: string;
  level?: string;
  chart_key?: string;
  song?: string;
  mode?: string;
}

const TABS: { value: TabKey; label: string; short: string }[] = [
  { value: 'pumbility', label: 'Pumbility', short: 'Pump' },
  { value: 'over20', label: 'Over 20', short: 'Over' },
  { value: 'hop', label: 'Hour of Power', short: 'HoP' },
  { value: 'mytop100', label: 'My Top 100', short: 'Mine' },
];

function formatNumber(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString();
}
function formatDecimal(value: number | null | undefined, digits = 1): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : (0).toFixed(digits);
}
function gradeColor(grade: string | undefined, score = 0): string {
  if (!grade && !score) return '#9ca3af';
  const tier = getGradeTier(grade, score);
  return TIER_COLORS[tier] || '#9ca3af';
}
function rankColor(rank: number, theme: ThemeColors): string {
  if (rank === 1) return theme.gold;
  if (rank === 2) return theme.silver;
  if (rank === 3) return theme.bronze;
  return theme.textMuted;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function LeaderboardsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  // Query-string hints from deep-link surfaces (e.g. song page → Over 20 chart)
  const hints = useLocalSearchParams() as unknown as QueryHints;
  const initialTab = useMemo<TabKey>(() => {
    const t = String(hints.tab || '').toLowerCase();
    if (t === 'over20' || t === 'hop' || t === 'mytop100' || t === 'pumbility') return t as TabKey;
    return 'pumbility';
  }, [hints.tab]);
  const [tab, setTab] = useState<TabKey>(initialTab);

  // Re-sync if a new deep-link arrives mid-session
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  if (!user) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <TopBar />
        </View>
        <View style={s.centered}>
          <Text style={s.emptyTitle}>Sign in to see leaderboards</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar />
      </View>

      {/* Tab strip — wrapped in a fixed-height View because RN Web's flex
          column will otherwise stretch the horizontal ScrollView to fill the
          remaining viewport (we want it to hug content). */}
      <View style={s.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabsRow}>
          {TABS.map((t) => {
            const active = tab === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => setTab(t.value)}
                style={({ pressed }) => [
                  s.tabChip,
                  active && s.tabChipActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text style={[s.tabChipText, active && s.tabChipTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {tab === 'pumbility' ? (
        <PumbilityTab />
      ) : tab === 'over20' ? (
        <Over20Tab
          initialLevel={hints.level}
          initialChartKey={hints.chart_key}
          initialSong={hints.song}
          initialMode={hints.mode}
        />
      ) : tab === 'hop' ? (
        <HopTab />
      ) : (
        <MyTop100Tab />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — Global Pumbility
// ---------------------------------------------------------------------------
function PumbilityTab() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [metric, setMetric] = useState<PumbilityMetric>('overall');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['leaderboards-pumbility', metric, page],
    queryFn: () => piugameApi.pumbilityLeaderboard({ metric, page, limit: 100, sort_by: 'pumbility', sort_order: 'desc' }),
  });

  const rows = query.data?.rows ?? [];
  const totalPages = Math.max(1, query.data?.total_pages || 1);
  const currentUser = query.data?.current_user;

  return (
    <ScrollView
      contentContainerStyle={[s.tabBody, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          tintColor={theme.spinner}
        />
      }>
      <View style={s.metricRow}>
        <Pressable
          onPress={() => { setMetric('overall'); setPage(1); }}
          style={({ pressed }) => [
            s.metricChip,
            metric === 'overall' && s.metricChipActive,
            pressed && metric !== 'overall' && { opacity: 0.7 },
          ]}>
          <Text style={[s.metricChipText, metric === 'overall' && s.metricChipTextActive]}>Overall</Text>
        </Pressable>
        <Pressable
          onPress={() => { setMetric('singles'); setPage(1); }}
          style={({ pressed }) => [
            s.metricChip,
            metric === 'singles' && s.metricChipActive,
            pressed && metric !== 'singles' && { opacity: 0.7 },
          ]}>
          <Text style={[s.metricChipText, metric === 'singles' && s.metricChipTextActive]}>Singles</Text>
        </Pressable>
      </View>

      {/* My-rank pinned card */}
      {currentUser ? (
        <View style={s.myRankCard}>
          <Text style={s.myRankLabel}>YOUR RANK</Text>
          <View style={s.myRankRow}>
            <Text style={s.myRankNum}>#{currentUser.sort_rank}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.myRankName} numberOfLines={1}>{currentUser.username || user?.username}</Text>
              <Text style={s.myRankMeta}>
                {metric === 'singles' ? 'S. Pumbility' : 'Pumbility'} {formatNumber(metric === 'singles' ? currentUser.singles_pumbility : currentUser.overall_pumbility)}
              </Text>
            </View>
            {currentUser.global_rank_delta ? (
              <RankDelta delta={currentUser.global_rank_delta} />
            ) : null}
          </View>
        </View>
      ) : null}

      {query.isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : query.isError ? (
        <ErrorBox message={query.error instanceof Error ? query.error.message : 'Failed to load leaderboard'} />
      ) : rows.length === 0 ? (
        <Text style={s.emptyText}>No players ranked yet.</Text>
      ) : (
        <View style={{ gap: 5 }}>
          {rows.map((row) => (
            <PumbilityRow key={`${row.rank}-${row.user_id || row.username}`} row={row} metric={metric} viewerUserId={user?.id} />
          ))}
        </View>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <View style={s.paginationRow}>
          <Pressable
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || query.isFetching}
            style={({ pressed }) => [s.pageBtn, (page <= 1 || query.isFetching) && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
            <IconSymbol name="chevron.left" size={14} color={theme.text} />
            <Text style={s.pageBtnText}>Prev</Text>
          </Pressable>
          <Text style={s.pageLabel}>Page {page} / {totalPages}</Text>
          <Pressable
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || query.isFetching}
            style={({ pressed }) => [s.pageBtn, (page >= totalPages || query.isFetching) && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
            <Text style={s.pageBtnText}>Next</Text>
            <IconSymbol name="chevron.right" size={14} color={theme.text} />
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function PumbilityRow({ row, metric, viewerUserId }: { row: PumbilityLeaderboardRow; metric: PumbilityMetric; viewerUserId?: string }) {
  const router = useRouter();
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const isYou = !!viewerUserId && row.user_id === viewerUserId;
  const pump = metric === 'singles' ? row.singles_pumbility : row.overall_pumbility;
  const avg = metric === 'singles' ? row.singles_average_grade : row.overall_average_grade;
  const avgLevel = metric === 'singles' ? row.singles_average_level : row.overall_average_level;
  const avatar = row.avatar ? fullImageUrl(row.avatar) : undefined;

  const onPress = () => {
    if (row.user_id) router.push({ pathname: '/profile/[id]', params: { id: row.user_id } });
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!row.user_id}
      style={({ pressed }) => [s.lbRow, isYou && s.lbRowYou, pressed && row.user_id ? { opacity: 0.85 } : null]}>
      <Text style={[s.lbRank, { color: rankColor(row.rank, theme) }]}>{row.rank}</Text>
      <View style={s.lbAvatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.lbAvatarImg} contentFit="cover" />
        ) : (
          <DefaultAvatar size={32} />
        )}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[s.lbName, isYou && { color: theme.accent }]} numberOfLines={1}>
          {row.username}{isYou ? ' (you)' : ''}
        </Text>
        <Text style={s.lbMeta} numberOfLines={1}>
          {avg ? <Text style={{ color: gradeColor(avg) }}>{avg}</Text> : null}
          {avg ? '  ·  ' : ''}
          {avgLevel ? `Lv ${formatDecimal(avgLevel, 1)}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.lbScore}>{formatNumber(pump)}</Text>
        {row.global_rank_delta ? <RankDelta delta={row.global_rank_delta} small /> : null}
      </View>
    </Pressable>
  );
}

function RankDelta({ delta, small }: { delta: number; small?: boolean }) {
  if (!delta) return null;
  const up = delta > 0;
  return (
    <View style={[
      {
        flexDirection: 'row', alignItems: 'center', gap: 2,
        paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
        backgroundColor: up ? 'rgba(16,185,129,0.16)' : 'rgba(248,113,113,0.16)',
        borderWidth: 1, borderColor: up ? 'rgba(16,185,129,0.45)' : 'rgba(248,113,113,0.45)',
      },
    ]}>
      <Text style={{ fontSize: small ? 8 : 9, color: up ? '#34d399' : '#fb7185', fontWeight: '900' }}>
        {up ? '▲' : '▼'} {Math.abs(delta)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Over 20 chart leaderboards (level → chart → top-100 modal)
// ---------------------------------------------------------------------------
function Over20Tab({
  initialLevel,
  initialChartKey,
  initialSong,
  initialMode,
}: {
  initialLevel?: string;
  initialChartKey?: string;
  initialSong?: string;
  initialMode?: string;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const [selectedLevel, setSelectedLevel] = useState<number | null>(
    initialLevel ? parseInt(initialLevel, 10) || null : null,
  );
  const [modeFilter, setModeFilter] = useState<OverModeFilter>('all');
  const [search, setSearch] = useState('');
  const [activeChart, setActiveChart] = useState<Over20Chart | null>(null);
  const initialSelectionApplied = useState({ done: false })[0];

  const levelsQuery = useQuery({
    queryKey: ['leaderboards-over20-levels'],
    queryFn: () => piugameApi.over20Levels(),
    staleTime: 5 * 60 * 1000,
  });

  // Pick first level once data lands (or apply initialLevel if it's valid)
  useEffect(() => {
    if (selectedLevel !== null || !levelsQuery.data?.levels?.length) return;
    const wantedLevel = initialLevel ? parseInt(initialLevel, 10) || 0 : 0;
    const match = wantedLevel > 0
      ? levelsQuery.data.levels.find((l) => l.level === wantedLevel)
      : null;
    setSelectedLevel(match?.level ?? levelsQuery.data.levels[0].level);
  }, [levelsQuery.data, initialLevel, selectedLevel]);

  const chartsQuery = useQuery({
    queryKey: ['leaderboards-over20-charts', selectedLevel],
    queryFn: () => piugameApi.over20Charts({ level: selectedLevel! }),
    enabled: selectedLevel != null,
  });

  // Auto-open chart from deep-link hints (chart_key, or song+mode)
  useEffect(() => {
    if (initialSelectionApplied.done) return;
    if (!chartsQuery.data?.charts?.length) return;

    const charts = chartsQuery.data.charts;
    let match: Over20Chart | undefined;
    if (initialChartKey) {
      match = charts.find((c) => c.chart_key === initialChartKey);
    }
    if (!match && initialSong) {
      const wantedSong = initialSong.trim().toLowerCase();
      const wantedMode = (initialMode || '').trim().toLowerCase();
      match = charts.find((c) => {
        const songMatch = c.song_title.toLowerCase() === wantedSong;
        if (!songMatch) return false;
        if (wantedMode && c.mode.toLowerCase() !== wantedMode) return false;
        return true;
      });
    }
    if (match) {
      setActiveChart(match);
    }
    initialSelectionApplied.done = true;
  }, [chartsQuery.data, initialChartKey, initialSong, initialMode, initialSelectionApplied]);

  const filteredCharts = useMemo(() => {
    const all = chartsQuery.data?.charts ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (modeFilter === 'single' && c.mode !== 'Single') return false;
      if (modeFilter === 'double' && c.mode !== 'Double') return false;
      if (q && !c.song_title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [chartsQuery.data, search, modeFilter]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[s.tabBody, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={chartsQuery.isRefetching}
            onRefresh={() => chartsQuery.refetch()}
            tintColor={theme.spinner}
          />
        }>
        {/* Level chips — wrapped to prevent flex stretch (same reason as the
            top tab strip). */}
        <View style={s.levelChipWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.levelChipRow}>
          {(levelsQuery.data?.levels ?? []).map((lvl) => {
            const active = selectedLevel === lvl.level;
            return (
              <Pressable
                key={lvl.level}
                onPress={() => setSelectedLevel(lvl.level)}
                style={({ pressed }) => [
                  s.levelChip,
                  active && s.levelChipActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text style={[s.levelChipText, active && s.levelChipTextActive]}>Lv {lvl.level}</Text>
                <Text style={[s.levelChipCount, active && s.levelChipCountActive]}>{lvl.chart_count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        </View>

        {/* Mode + search */}
        <View style={s.searchRow}>
          <IconSymbol name="magnifyingglass" size={14} color={theme.textDim} />
          <TextInput
            placeholder="Search song in this level"
            placeholderTextColor={theme.textDim}
            value={search}
            onChangeText={setSearch}
            style={s.searchInput}
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')}><IconSymbol name="xmark" size={12} color={theme.textDim} /></Pressable>
          ) : null}
        </View>
        <View style={s.modePillRow}>
          {(['all', 'single', 'double'] as OverModeFilter[]).map((m) => {
            const active = modeFilter === m;
            return (
              <Pressable
                key={m}
                onPress={() => setModeFilter(m)}
                style={({ pressed }) => [
                  s.modePill,
                  active && (m === 'single' ? s.modePillSingleActive : m === 'double' ? s.modePillDoubleActive : s.modePillActive),
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text style={[
                  s.modePillText,
                  active && s.modePillTextActive,
                ]}>
                  {m === 'all' ? 'All' : m === 'single' ? 'Singles' : 'Doubles'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Charts grid (3-col) */}
        {chartsQuery.isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        ) : filteredCharts.length === 0 ? (
          <Text style={s.emptyText}>No songs match this filter.</Text>
        ) : (
          <View style={s.chartGrid}>
            {filteredCharts.map((chart) => (
              <Over20ChartTile key={chart.chart_key} chart={chart} onPress={() => setActiveChart(chart)} />
            ))}
          </View>
        )}
      </ScrollView>

      <Over20Top100Modal chart={activeChart} onClose={() => setActiveChart(null)} />
    </View>
  );
}

function Over20ChartTile({ chart, onPress }: { chart: Over20Chart; onPress: () => void }) {
  const s = useThemedStyles(makeStyles);
  const jacket = fullImageUrl(chart.jacket_url);
  const isSingle = chart.mode === 'Single';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.chartTile, pressed && { opacity: 0.85 }]}>
      <View style={s.chartTileJacketWrap}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.chartTileJacket} contentFit="cover" />
        ) : (
          <View style={[s.chartTileJacket, s.chartTileJacketFallback]}>
            <Text style={s.chartTileFallbackText}>{(chart.song_title || '?').charAt(0)}</Text>
          </View>
        )}
        <View style={[s.chartTileBadge, isSingle ? s.chartTileBadgeSingle : s.chartTileBadgeDouble]}>
          <Text style={s.chartTileBadgeText}>{isSingle ? 'S' : 'D'}{chart.level}</Text>
        </View>
      </View>
      <Text style={s.chartTileTitle} numberOfLines={2}>{chart.song_title}</Text>
    </Pressable>
  );
}

function Over20Top100Modal({ chart, onClose }: { chart: Over20Chart | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const s = useThemedStyles(makeModalStyles);

  const detailQuery = useQuery({
    queryKey: ['leaderboards-over20-top100', chart?.chart_key],
    queryFn: () => piugameApi.over20ChartTop100(chart!.chart_key),
    enabled: !!chart?.chart_key,
  });

  if (!chart) return null;
  const scores: Over20ChartScore[] = detailQuery.data?.scores ?? [];
  const isSingle = chart.mode === 'Single';
  const jacket = fullImageUrl(chart.jacket_url);

  return (
    <Modal visible={!!chart} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
          {/* Hero */}
          <View style={s.hero}>
            {jacket ? (
              <Image source={{ uri: jacket }} style={s.heroImage} contentFit="cover" />
            ) : (
              <View style={[s.heroImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface }]}>
                <Text style={{ color: theme.textDim, fontSize: 48, fontWeight: '900' }}>{(chart.song_title || '?').charAt(0)}</Text>
              </View>
            )}
            <View style={s.heroDim} pointerEvents="none" />
            <View style={[s.heroBadge, isSingle ? s.heroBadgeSingle : s.heroBadgeDouble]}>
              <Text style={s.heroBadgeText}>{isSingle ? 'S' : 'D'}{chart.level}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.heroClose, pressed && { opacity: 0.7 }]}>
              <IconSymbol name="xmark" size={16} color={theme.text} />
            </Pressable>
            <View style={s.heroFooter}>
              <Text style={s.heroTitle} numberOfLines={2}>{chart.song_title}</Text>
              <Text style={s.heroMeta}>OVER Top 100 · {chart.top100_count || scores.length} entries</Text>
            </View>
          </View>

          {/* Scores */}
          <ScrollView contentContainerStyle={{ padding: 12, gap: 4 }}>
            {detailQuery.isLoading ? (
              <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={theme.spinner} /></View>
            ) : detailQuery.isError ? (
              <Text style={{ color: theme.danger, padding: 12, textAlign: 'center' }}>
                {detailQuery.error instanceof Error ? detailQuery.error.message : 'Failed to load top 100'}
              </Text>
            ) : scores.length === 0 ? (
              <Text style={s.emptyText}>No scores cached for this chart yet.</Text>
            ) : scores.map((score) => {
              const isYou = !!user && score.player_name.toLowerCase() === (user.username || '').toLowerCase();
              const avatar = score.player_avatar ? fullImageUrl(score.player_avatar) : undefined;
              return (
                <View key={`${score.rank}-${score.player_name}`} style={[s.scoreRow, isYou && s.scoreRowYou]}>
                  <Text style={[s.scoreRank, { color: rankColor(score.rank, theme) }]}>{score.rank}</Text>
                  <View style={s.scoreAvatar}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={s.scoreAvatarImg} contentFit="cover" />
                    ) : (
                      <DefaultAvatar size={28} />
                    )}
                  </View>
                  <Text style={[s.scoreName, isYou && { color: theme.accent }]} numberOfLines={1}>
                    {score.player_name}{isYou ? ' (you)' : ''}
                  </Text>
                  <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    <Text style={[s.scoreValue, { color: gradeColor(score.grade, score.score) }]}>
                      {formatNumber(score.score)}
                    </Text>
                    {score.grade ? (
                      <Text style={[s.scoreGrade, { color: gradeColor(score.grade, score.score) }]}>{score.grade}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Hour of Power
// ---------------------------------------------------------------------------
function HopTab() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const query = useQuery({
    queryKey: ['leaderboards-hop'],
    queryFn: () => liveApi.hopLeaderboard({ limit: 100 }),
  });

  const rows = query.data?.rows ?? [];

  return (
    <ScrollView
      contentContainerStyle={[s.tabBody, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          tintColor={theme.spinner}
        />
      }>
      <Text style={s.subtitleText}>
        Best Hour of Power attempts — total rating earned in a 60-minute window.
      </Text>

      {query.isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : query.isError ? (
        <ErrorBox message={query.error instanceof Error ? query.error.message : 'Failed to load HoP leaderboard'} />
      ) : rows.length === 0 ? (
        <Text style={s.emptyText}>No completed Hour of Power attempts yet.</Text>
      ) : (
        <View style={{ gap: 5 }}>
          {rows.map((row, i) => (
            <HopRow key={`${row.user_id}-${row.best_session_id || i}`} row={{ ...row, rank: row.rank ?? i + 1 }} viewerUserId={user?.id} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function HopRow({ row, viewerUserId }: { row: HopLeaderboardRow; viewerUserId?: string }) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const router = useRouter();
  const isYou = !!viewerUserId && row.user_id === viewerUserId;
  const avatar = row.avatar ? fullImageUrl(row.avatar) : undefined;
  const onPress = () => {
    if (row.user_id) router.push({ pathname: '/profile/[id]', params: { id: row.user_id } });
  };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.lbRow, isYou && s.lbRowYou, pressed && { opacity: 0.85 }]}>
      <Text style={[s.lbRank, { color: rankColor(row.rank ?? 99, theme) }]}>{row.rank}</Text>
      <View style={s.lbAvatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.lbAvatarImg} contentFit="cover" />
        ) : (
          <DefaultAvatar size={32} />
        )}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[s.lbName, isYou && { color: theme.accent }]} numberOfLines={1}>
          {row.username}{isYou ? ' (you)' : ''}
        </Text>
        <Text style={s.lbMeta} numberOfLines={1}>
          {row.completed_attempts ? `${row.completed_attempts} run${row.completed_attempts === 1 ? '' : 's'}` : ''}
          {row.best_average_level ? `  ·  Lv ${formatDecimal(row.best_average_level, 1)} avg` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.lbScore}>{formatNumber(row.best_total_rating_points)}</Text>
        <Text style={s.lbScoreCaption}>RP</Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Tab 4 — My Top 100 Scores
// ---------------------------------------------------------------------------
function MyTop100Tab() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['leaderboards-mytop100', page],
    queryFn: () => piugameApi.myTop100Scores({ page, limit: 50 }),
  });

  const rows = query.data?.rows ?? [];
  const totalPages = Math.max(1, query.data?.total_pages || 1);

  return (
    <ScrollView
      contentContainerStyle={[s.tabBody, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          tintColor={theme.spinner}
        />
      }>
      <Text style={s.subtitleText}>
        Every chart where you land in the global OVER Top 100 — ranked by your placement.
      </Text>

      {query.isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : query.isError ? (
        <ErrorBox message={query.error instanceof Error ? query.error.message : 'Failed to load your top scores'} />
      ) : rows.length === 0 ? (
        <Text style={s.emptyText}>You don&apos;t have any tracked Top-100 placements yet.</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {rows.map((row) => (
            <MyTop100Row key={row.id} row={row} />
          ))}
        </View>
      )}

      {totalPages > 1 ? (
        <View style={s.paginationRow}>
          <Pressable
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || query.isFetching}
            style={({ pressed }) => [s.pageBtn, (page <= 1 || query.isFetching) && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
            <IconSymbol name="chevron.left" size={14} color={theme.text} />
            <Text style={s.pageBtnText}>Prev</Text>
          </Pressable>
          <Text style={s.pageLabel}>Page {page} / {totalPages}</Text>
          <Pressable
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || query.isFetching}
            style={({ pressed }) => [s.pageBtn, (page >= totalPages || query.isFetching) && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
            <Text style={s.pageBtnText}>Next</Text>
            <IconSymbol name="chevron.right" size={14} color={theme.text} />
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function MyTop100Row({ row }: { row: MyTop100ScoreRow }) {
  const s = useThemedStyles(makeStyles);
  const isSingle = row.mode === 'Single';
  const jacket = fullImageUrl(row.jacket_url);
  return (
    <View style={s.mtRow}>
      <View style={s.mtJacketWrap}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.mtJacket} contentFit="cover" />
        ) : (
          <View style={[s.mtJacket, s.chartTileJacketFallback]}>
            <Text style={s.chartTileFallbackText}>{(row.song_title || '?').charAt(0)}</Text>
          </View>
        )}
        <View style={[s.chartTileBadge, isSingle ? s.chartTileBadgeSingle : s.chartTileBadgeDouble]}>
          <Text style={s.chartTileBadgeText}>{isSingle ? 'S' : 'D'}{row.level}</Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.mtTitle} numberOfLines={1}>{row.song_title}</Text>
        <Text style={s.mtMeta}>
          <Text style={{ color: gradeColor(row.grade, row.score) }}>{row.grade || ''}</Text>
          {row.grade ? '  ·  ' : ''}
          {formatNumber(row.score)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={s.mtRank}>#{row.over_top100_rank}</Text>
        <Text style={s.mtRankCap}>/ {row.top100_count || 100}</Text>
        {row.over_top100_rank_delta ? <RankDelta delta={row.over_top100_rank_delta} small /> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
function ErrorBox({ message }: { message: string }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.errorCard}>
      <Text style={s.errorText}>{message}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 1 },
  centered: { padding: 32, alignItems: 'center' as const, justifyContent: 'center' as const, flex: 1 },
  emptyTitle: { fontSize: 16, fontWeight: '800' as const, color: t.textMuted, textAlign: 'center' as const },
  emptyText: { color: t.textDim, fontSize: 13, textAlign: 'center' as const, padding: 32 },
  subtitleText: { fontSize: 12, color: t.textDim, paddingHorizontal: 2, paddingBottom: 4 },
  center: { padding: 32, alignItems: 'center' as const },

  // The wrap stops RN Web's flex column from stretching the horizontal
  // ScrollView vertically. Inner content keeps padding for breathing room.
  tabsWrap: { height: 44, marginBottom: 6 },
  tabsRow: { gap: 6, paddingHorizontal: 12, alignItems: 'center' as const },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  tabChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  tabChipText: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  tabChipTextActive: { color: t.accent },

  tabBody: { paddingHorizontal: 12, gap: 10 },

  metricRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.card,
    borderRadius: 999,
    padding: 3,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  metricChip: { flex: 1, paddingVertical: 7, alignItems: 'center' as const, borderRadius: 999 },
  metricChipActive: { backgroundColor: t.accent },
  metricChipText: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  metricChipTextActive: { color: t.bg },

  myRankCard: {
    backgroundColor: t.accentTint,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.accent,
    padding: 10,
    gap: 6,
  },
  myRankLabel: { fontSize: 9, fontWeight: '900' as const, color: t.accent, letterSpacing: 1.6 },
  myRankRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  myRankNum: { fontSize: 20, fontWeight: '900' as const, color: t.accent, minWidth: 60 },
  myRankName: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  myRankMeta: { fontSize: 11, color: t.textMuted, fontWeight: '700' as const },

  errorCard: { backgroundColor: t.dangerBg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: t.dangerBorder },
  errorText: { color: t.danger, fontSize: 13 },

  lbRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  lbRowYou: { backgroundColor: t.accentTint, borderColor: t.accent },
  lbRank: { width: 28, textAlign: 'center' as const, fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  lbAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' as const, backgroundColor: t.surfaceMuted },
  lbAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  lbName: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  lbMeta: { fontSize: 10, color: t.textDim, fontWeight: '700' as const },
  lbScore: { fontSize: 13, fontWeight: '900' as const, color: t.accent, fontVariant: ['tabular-nums' as const] },
  lbScoreCaption: { fontSize: 8, color: t.textDim, fontWeight: '800' as const, letterSpacing: 0.6 },

  paginationRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 8,
  },
  pageBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
  },
  pageBtnText: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  pageLabel: { fontSize: 11, color: t.textMuted, fontWeight: '700' as const },

  levelChipWrap: { height: 38 },
  levelChipRow: { gap: 5, alignItems: 'center' as const },
  levelChip: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  levelChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  levelChipText: { fontSize: 12, fontWeight: '900' as const, color: t.text },
  levelChipTextActive: { color: t.accent },
  levelChipCount: { fontSize: 9, color: t.textDim, fontWeight: '700' as const },
  levelChipCountActive: { color: t.accent, opacity: 0.7 },

  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, color: t.text, fontSize: 13, padding: 0 },
  modePillRow: { flexDirection: 'row' as const, gap: 5 },
  modePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
  },
  modePillActive: { backgroundColor: t.accent },
  modePillSingleActive: { backgroundColor: 'rgba(217,61,98,0.85)' },
  modePillDoubleActive: { backgroundColor: 'rgba(22,183,127,0.85)' },
  modePillText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted },
  modePillTextActive: { color: '#fff' },

  chartGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  chartTile: { width: '32%' as const, gap: 4 },
  chartTileJacketWrap: { aspectRatio: 1, borderRadius: 8, overflow: 'hidden' as const, position: 'relative' as const, backgroundColor: t.surfaceMuted },
  chartTileJacket: { width: '100%' as const, height: '100%' as const },
  chartTileJacketFallback: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface },
  chartTileFallbackText: { color: t.textDim, fontSize: 20, fontWeight: '900' as const },
  chartTileBadge: {
    position: 'absolute' as const,
    bottom: 3,
    left: 3,
    minWidth: 24,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
    alignItems: 'center' as const,
  },
  chartTileBadgeSingle: { backgroundColor: 'rgba(217,61,98,0.92)' },
  chartTileBadgeDouble: { backgroundColor: 'rgba(22,183,127,0.92)' },
  chartTileBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' as const },
  chartTileTitle: { fontSize: 10, fontWeight: '700' as const, color: t.text, paddingHorizontal: 2 },

  mtRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 8,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  mtJacketWrap: { width: 46, height: 46, borderRadius: 8, overflow: 'hidden' as const, position: 'relative' as const, backgroundColor: t.surfaceMuted },
  mtJacket: { width: '100%' as const, height: '100%' as const },
  mtTitle: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  mtMeta: { fontSize: 11, color: t.textMuted, fontWeight: '700' as const },
  mtRank: { fontSize: 14, fontWeight: '900' as const, color: t.accent, fontVariant: ['tabular-nums' as const] },
  mtRankCap: { fontSize: 9, color: t.textDim },
});

const makeModalStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%' as const,
    overflow: 'hidden' as const,
  },
  hero: { aspectRatio: 16 / 9, width: '100%' as const, position: 'relative' as const },
  heroImage: { width: '100%' as const, height: '100%' as const },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  heroBadge: {
    position: 'absolute' as const,
    top: 12,
    left: 12,
    minWidth: 38,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  heroBadgeSingle: { backgroundColor: 'rgba(217,61,98,0.9)' },
  heroBadgeDouble: { backgroundColor: 'rgba(22,183,127,0.9)' },
  heroBadgeText: { color: '#fff', fontSize: 13, fontWeight: '900' as const },
  heroClose: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroFooter: { position: 'absolute' as const, bottom: 12, left: 14, right: 14 },
  heroTitle: { fontSize: 17, fontWeight: '900' as const, color: '#fff' },
  heroMeta: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '700' as const },
  emptyText: { color: t.textDim, fontSize: 13, textAlign: 'center' as const, padding: 24 },

  scoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: t.card,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  scoreRowYou: { backgroundColor: t.accentTint, borderColor: t.accent },
  scoreRank: { width: 26, textAlign: 'center' as const, fontSize: 12, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  scoreAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' as const, backgroundColor: t.surfaceMuted },
  scoreAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  scoreName: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: t.text },
  scoreValue: { fontSize: 12, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  scoreGrade: { fontSize: 10, fontWeight: '800' as const },
});

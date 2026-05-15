import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DefaultAvatar } from '@/components/default-avatar';
import { GradeChip } from '@/components/grade-chip';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ChartScoresSheet } from '@/components/wc-chart-scores-sheet';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { weeklyChallengesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type {
  WeeklyChallengeAward,
  WeeklyChallengeChart,
  WeeklyChallengeChartMode,
  WeeklyChallengeDivision,
  WeeklyChallengeLeaderboardRow,
  WeeklyChallengeSkillFamily,
  WeeklyChallengeViewerBest,
  WeeklyChallengeViewerSummary,
  WeeklyChallengeWeekIndexEntry,
} from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

const AWARD_LABEL: Record<string, string> = {
  overall: 'Overall',
  singles: 'Singles',
  doubles: 'Doubles',
  advanced: 'Advanced',
  intermediate: 'Intermediate',
  coop: 'Co-Op',
};

const MEDAL = ['', '🥇', '🥈', '🥉'];

const MODE_OPTIONS: { value: WeeklyChallengeChartMode; label: string }[] = [
  { value: 'both', label: 'All' },
  { value: 'single', label: 'Singles' },
  { value: 'double', label: 'Doubles' },
];

// Division tabs sit above the mode/skill filters. 'main' is the regular
// S/D weekly challenge; 'coop' is the parallel Co-op WC division (2P only
// for now). Server gates each independently so leaderboards stay separate.
const DIVISION_OPTIONS: { value: WeeklyChallengeDivision; label: string }[] = [
  { value: 'main', label: 'Singles + Doubles' },
  { value: 'coop', label: 'Co-Op' },
];

const SKILL_OPTIONS: { value: WeeklyChallengeSkillFamily; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function fmtDateRange(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return '';
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

function fmtCountdown(endIso?: string): string | null {
  if (!endIso) return null;
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return `ends in ${h}h`;
  const d = Math.floor(h / 24);
  return `ends in ${d}d`;
}

export default function WeeklyChallengesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  // Optional `division=coop` query param sent by the dashboard tile so a
  // tap on the Co-op summary lands directly on that division. Validated to
  // the two known values before being applied to local state.
  const params = useLocalSearchParams<{ division?: string }>();
  const initialDivision: WeeklyChallengeDivision =
    String(params.division || '').trim().toLowerCase() === 'coop' ? 'coop' : 'main';

  const [weekKey, setWeekKey] = useState<string>('current');
  const [pickerOpen, setPickerOpen] = useState(false);
  const { isDesktop } = useBreakpoint();
  const [division, setDivision] = useState<WeeklyChallengeDivision>(initialDivision);
  const [chartMode, setChartMode] = useState<WeeklyChallengeChartMode>('both');
  const [skillFamily, setSkillFamily] = useState<WeeklyChallengeSkillFamily>('all');
  const [chartScoresId, setChartScoresId] = useState<number | null>(null);

  const weeksQuery = useQuery({
    queryKey: ['wc-weeks'],
    queryFn: () => weeklyChallengesApi.weeks(),
  });

  const weekQuery = useQuery({
    queryKey: ['wc-week', weekKey, division, chartMode, skillFamily, user?.id ?? 'anon'],
    queryFn: () => weeklyChallengesApi.week(weekKey, {
      // chart_mode is meaningless for the Co-op division (every chart is
      // CoOp) — server ignores it there, but we still pass through cleanly.
      chart_mode: chartMode,
      leaderboard_mode: chartMode,
      skill_family: skillFamily,
      division,
    }),
  });

  const data = weekQuery.data;
  const week = data?.week;
  const isLive = week?.status === 'active';
  const countdown = isLive ? fmtCountdown(week?.ends_at_utc) : null;

  // Group awards by category for the podium strip.
  const awardsByCategory = useMemo(() => {
    const isCoopActive = division === 'coop';
    const buckets: Record<string, WeeklyChallengeAward[]> = {};
    for (const a of data?.awards ?? []) {
      const key = String(a.award_key);
      // Defensive filter: on the Co-Op tab, only render the 'coop' award
      // bucket (server should only send that, but if a stale build leaks
      // 'overall'/'singles'/etc. we don't want them rendering on Co-Op).
      // Same the other way: main tab strips any 'coop' bucket out.
      if (isCoopActive && key !== 'coop') continue;
      if (!isCoopActive && key === 'coop') continue;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(a);
    }
    // Stable category order; only show categories that have at least one award.
    const order = isCoopActive
      ? ['coop']
      : ['overall', 'singles', 'doubles', 'advanced', 'intermediate'];
    return order
      .filter((k) => buckets[k]?.length)
      .map((k) => ({ key: k, label: AWARD_LABEL[k] || k, entries: buckets[k].sort((x, y) => x.rank - y.rank).slice(0, 3) }));
  }, [data, division]);

  const isCoop = division === 'coop';

  const groupedLevels = useMemo(() => {
    const grouped = data?.groupedByLevel ?? {};
    return Object.keys(grouped)
      .sort((a, b) => Number(a) - Number(b))
      .map((lvl) => {
        // Defensive filter: when the user is on the Co-Op tab, drop any
        // chart whose mode isn't CoOp. Mirrors a server bug we've seen
        // where a stale build returns main-division charts in the Co-op
        // response — without this, the mobile would render S10/D10 cards
        // under Co-Op headers ("Co-Op (10P)") which looks completely wrong.
        const charts = isCoop
          ? (grouped[lvl] ?? []).filter((c) => String(c.mode || '') === 'CoOp')
          : (grouped[lvl] ?? []);
        return { level: lvl, charts };
      })
      .filter((g) => g.charts.length > 0);
  }, [data, isCoop]);

  // Co-op runs as a parallel division with its own pool count; the
  // week.chart_count column tracks main-division charts only. Sum from
  // groupedByLevel for accurate display in the header.
  const divisionChartCount = useMemo(() => {
    if (!isCoop) return week?.chart_count ?? 0;
    return groupedLevels.reduce((sum, g) => sum + g.charts.length, 0);
  }, [isCoop, week?.chart_count, groupedLevels]);

  const onRefresh = () => {
    weekQuery.refetch();
    weeksQuery.refetch();
  };
  const goProfile = (username?: string) => {
    if (!username) return;
    router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });
  };

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar
          rightExtra={
            !isDesktop ? (
              <Pressable
                onPress={() => setPickerOpen(true)}
                hitSlop={6}
                style={({ pressed }) => [s.weekPickerBtn, pressed && { opacity: 0.7 }]}>
                <Text style={s.weekPickerText}>{week?.week_key ?? 'Loading…'}</Text>
                <IconSymbol name="chevron.right" size={14} color={theme.textMuted} />
              </Pressable>
            ) : null
          }
        />
      </View>

      <View style={isDesktop ? s.deskBody : { flex: 1 }}>
      {isDesktop ? (
        <View style={s.deskWeeksRail}>
          <Text style={s.deskWeeksRailTitle}>Weeks</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.deskWeeksRailContent}>
            {(weeksQuery.data ?? []).map((w) => {
              const active = (week?.week_key && w.week_key === week.week_key)
                || (!week && weekKey === w.week_key);
              return (
                <Pressable
                  key={w.week_key}
                  onPress={() => setWeekKey(w.week_key)}
                  onHoverIn={() => undefined}
                  onHoverOut={() => undefined}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    s.deskWeekRow,
                    hovered && !active && { backgroundColor: theme.surfaceMuted },
                    active && s.deskWeekRowActive,
                    pressed && { opacity: 0.8 },
                  ]}>
                  <Text style={[s.deskWeekRowLabel, active && s.deskWeekRowLabelActive]} numberOfLines={1}>
                    {w.week_key}
                  </Text>
                  <Text style={s.deskWeekRowMeta} numberOfLines={1}>
                    {w.status === 'active' ? 'Live' : w.status}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView
        style={isDesktop ? { flex: 1 } : undefined}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
        refreshControl={<RefreshControl refreshing={weekQuery.isRefetching} onRefresh={onRefresh} tintColor={theme.spinner} />}>
        {weekQuery.isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        ) : weekQuery.isError ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              {weekQuery.error instanceof Error ? weekQuery.error.message : 'Failed to load week'}
            </Text>
          </View>
        ) : week ? (
          <>
            <WeekHeader
              status={week.status}
              minLevel={week.challenge_min_level}
              maxLevel={week.challenge_max_level}
              chartCount={divisionChartCount}
              participantCount={data?.participantCount ?? 0}
              dateRange={fmtDateRange(week.starts_at_utc, week.ends_at_utc)}
              countdown={countdown}
              isLive={isLive}
              isCoop={isCoop}
              s={s}
            />

            {/* Division tabs — Singles+Doubles vs Co-Op. Two parallel
                weekly challenges; each has its own pool + leaderboard. */}
            <View style={s.divisionRow}>
              {DIVISION_OPTIONS.map((opt) => {
                const active = division === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setDivision(opt.value)}
                    style={({ pressed }) => [
                      s.divisionTab,
                      active && s.divisionTabActive,
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text style={[s.divisionTabText, active && s.divisionTabTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {data?.viewerSummary && data.viewerSummary.totalClears > 0 ? (
              <ViewerSummaryCard summary={data.viewerSummary} s={s} />
            ) : null}

            {awardsByCategory.length > 0 ? (
              <AwardsStrip categories={awardsByCategory} onProfile={goProfile} s={s} isDesktop={isDesktop} />
            ) : null}

            {/* Leaderboard renders inline on mobile and in a right rail on
                desktop (see the deskLeaderboardRail below the scroll). */}
            {!isDesktop && data && data.leaderboard.length > 0 ? (
              <LeaderboardSection
                leaderboard={data.leaderboard}
                viewerUserId={user?.id}
                onProfile={goProfile}
                chartMode={chartMode}
                onChartMode={setChartMode}
                skillFamily={skillFamily}
                onSkillFamily={setSkillFamily}
                // Co-op: every chart is CoOp so the Singles/Doubles/Both pill
                // group is meaningless — hide it.
                showModeFilter={!isCoop}
                s={s}
              />
            ) : null}

            <View style={s.chartsHeader}>
              <Text style={s.sectionTitle}>CHALLENGE POOL</Text>
              <Text style={s.sectionCount}>{divisionChartCount}</Text>
            </View>
            {groupedLevels.length === 0 ? (
              <View style={s.emptyBlock}>
                <Text style={s.emptyTitle}>
                  {isCoop ? 'No Co-Op picks for this week yet' : 'No charts in this week'}
                </Text>
                <Text style={s.emptyBody}>
                  {isCoop
                    ? 'Co-Op WC is a new division — the picker generates 5 charts per week.'
                    : 'Pull to refresh once the picker has run.'}
                </Text>
              </View>
            ) : null}
            {groupedLevels.map((g) => (
              <View key={g.level} style={s.levelBlock}>
                <LevelDivider
                  level={g.level}
                  count={g.charts.length}
                  viewerPlayed={data?.viewerSummary?.bests
                    ? g.charts.filter((c) => data.viewerSummary!.bests[String(c.id)] != null).length
                    : undefined}
                  isCoop={isCoop}
                  s={s}
                />
                <View style={s.chartGrid}>
                  {g.charts.map((chart) => (
                    // The chart-scores endpoint keys off the weekly_challenge_charts
                    // row id (`chart.id`), NOT the underlying song chart_id.
                    <ChartCard
                      key={chart.id}
                      chart={chart}
                      viewerBest={data?.viewerSummary?.bests?.[String(chart.id)]}
                      onPress={() => setChartScoresId(chart.id)}
                      s={s}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {isDesktop && data && data.leaderboard.length > 0 ? (
        <View style={s.deskLeaderboardRail}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.deskLeaderboardScroll}
            showsVerticalScrollIndicator={false}>
            <LeaderboardSection
              leaderboard={data.leaderboard}
              viewerUserId={user?.id}
              onProfile={goProfile}
              chartMode={chartMode}
              onChartMode={setChartMode}
              skillFamily={skillFamily}
              onSkillFamily={setSkillFamily}
              showModeFilter={!isCoop}
              s={s}
            />
          </ScrollView>
        </View>
      ) : null}
      </View>

      <WeekPickerSheet
        visible={pickerOpen}
        weeks={weeksQuery.data ?? []}
        currentKey={weekKey}
        onPick={(k) => { setWeekKey(k); setPickerOpen(false); }}
        onClose={() => setPickerOpen(false)}
      />

      <ChartScoresSheet
        chartId={chartScoresId}
        onClose={() => setChartScoresId(null)}
      />
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function WeekHeader({
  status,
  minLevel,
  maxLevel,
  chartCount,
  participantCount,
  dateRange,
  countdown,
  isLive,
  isCoop = false,
  s,
}: {
  status?: string;
  minLevel?: number;
  maxLevel?: number;
  chartCount?: number;
  participantCount: number;
  dateRange: string;
  countdown: string | null;
  isLive: boolean;
  isCoop?: boolean;
  s: Styles;
}) {
  const statusLabel = isLive ? 'LIVE' : status === 'finalized' ? 'FINALIZED' : (status || '').toUpperCase();
  const statusColor = isLive ? '#34d399' : '#94a3b8';
  return (
    <View style={s.weekHeader}>
      <View style={s.weekStatusRow}>
        <View style={[s.statusPill, { borderColor: statusColor, backgroundColor: `${statusColor}1f` }]}>
          {isLive ? <View style={[s.livePulse, { backgroundColor: statusColor }]} /> : null}
          <Text style={[s.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {countdown ? <Text style={s.countdown}>{countdown}</Text> : null}
        {dateRange ? <Text style={s.dateRange}>{dateRange}</Text> : null}
      </View>
      <View style={s.weekStatsRow}>
        <Text style={s.weekStat}>
          <Text style={s.weekStatNum}>{chartCount ?? 0}</Text> chart{(chartCount ?? 0) === 1 ? '' : 's'}
        </Text>
        {isCoop ? (
          // Co-op runs on player count rather than difficulty level — show
          // the player-count band instead of the misleading "L2–2".
          <Text style={s.weekStat}>2-Player</Text>
        ) : minLevel != null && maxLevel != null ? (
          <Text style={s.weekStat}>
            L<Text style={s.weekStatNum}>{minLevel}</Text>–<Text style={s.weekStatNum}>{maxLevel}</Text>
          </Text>
        ) : null}
        <Text style={s.weekStat}>
          <Text style={s.weekStatNum}>{participantCount}</Text> player{participantCount === 1 ? '' : 's'}
        </Text>
      </View>
    </View>
  );
}

function ViewerSummaryCard({ summary, s }: { summary: WeeklyChallengeViewerSummary; s: Styles }) {
  return (
    <View style={s.viewerCard}>
      <View style={s.viewerHeader}>
        <Text style={s.viewerEyebrow}>YOUR WEEK</Text>
        {summary.rank != null ? (
          <Text style={s.viewerRank}>#<Text style={s.viewerRankNum}>{summary.rank}</Text></Text>
        ) : null}
      </View>
      <View style={s.viewerStats}>
        <View style={s.viewerStat}>
          <Text style={s.viewerStatNum}>{fmtNum(summary.totalPoints)}</Text>
          <Text style={s.viewerStatLabel}>POINTS</Text>
        </View>
        <View style={s.viewerStat}>
          <Text style={s.viewerStatNum}>{fmtNum(summary.totalClears)}</Text>
          <Text style={s.viewerStatLabel}>CLEARS</Text>
        </View>
        <View style={s.viewerStat}>
          <Text style={s.viewerStatNum}>{fmtNum(summary.pgBonusCount)}</Text>
          <Text style={s.viewerStatLabel}>PG</Text>
        </View>
        <View style={s.viewerStat}>
          <Text style={s.viewerStatNum}>+{fmtNum(summary.pgBonusPoints)}</Text>
          <Text style={s.viewerStatLabel}>BONUS PTS</Text>
        </View>
      </View>
    </View>
  );
}

function AwardsStrip({
  categories,
  onProfile,
  s,
  isDesktop,
}: {
  categories: { key: string; label: string; entries: WeeklyChallengeAward[] }[];
  onProfile: (username?: string) => void;
  s: Styles;
  isDesktop?: boolean;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  // Track scroll offset + content width so the chevrons can disappear when
  // there's nothing left to scroll in that direction. Web only — native
  // already shows the iOS/Android scroll bounce.
  const [scrollX, setScrollX] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [viewportW, setViewportW] = useState(0);
  const canScrollLeft = scrollX > 4;
  const canScrollRight = scrollX + viewportW < contentW - 4;
  const scrollBy = (delta: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ x: Math.max(0, scrollX + delta), animated: true });
  };
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>AWARDS</Text>
      <View
        style={s.awardsTrack}
        onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.awardsRow}
          onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
          onContentSizeChange={(w) => setContentW(w)}
          scrollEventThrottle={64}
          // Scroll-snap so the next card lines up cleanly with the
          // viewport edge after a chevron tap. Web only — RN Web passes
          // this through to the underlying div; native ignores it.
          {...(isDesktop ? { snapToInterval: 280, decelerationRate: 'fast' as const } : {})}>
          {categories.map((c) => (
            <PodiumCard key={c.key} label={c.label} entries={c.entries} onProfile={onProfile} s={s} />
          ))}
        </ScrollView>
        {/* Edge fades + chevrons — only on desktop, since touch surfaces
            already advertise scrollability natively. */}
        {isDesktop && canScrollLeft ? (
          <>
            <View style={[s.awardsFade, s.awardsFadeLeft]} pointerEvents="none" />
            <Pressable
              onPress={() => scrollBy(-300)}
              hitSlop={6}
              style={({ pressed }) => [s.awardsArrow, s.awardsArrowLeft, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Scroll awards left">
              <IconSymbol name="chevron.left" size={16} color="#fff" />
            </Pressable>
          </>
        ) : null}
        {isDesktop && canScrollRight ? (
          <>
            <View style={[s.awardsFade, s.awardsFadeRight]} pointerEvents="none" />
            <Pressable
              onPress={() => scrollBy(300)}
              hitSlop={6}
              style={({ pressed }) => [s.awardsArrow, s.awardsArrowRight, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Scroll awards right">
              <IconSymbol name="chevron.right" size={16} color="#fff" />
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Single award category podium — first place gets a hero treatment (bigger
 * avatar, gold accent, points front and center), 2nd/3rd are compact
 * follow-on rows. Way more visually grabby than three identical lines.
 */
function PodiumCard({
  label,
  entries,
  onProfile,
  s,
}: {
  label: string;
  entries: WeeklyChallengeAward[];
  onProfile: (username?: string) => void;
  s: Styles;
}) {
  const winner = entries.find((e) => e.rank === 1);
  const others = entries.filter((e) => e.rank > 1).sort((a, b) => a.rank - b.rank);
  const winnerAvatar = winner && typeof winner.avatar_snapshot === 'string'
    ? fullImageUrl(winner.avatar_snapshot)
    : undefined;
  return (
    <View style={s.podiumCard}>
      <Text style={s.podiumCategory}>{label.toUpperCase()}</Text>
      {winner ? (
        <Pressable
          onPress={() => onProfile(winner.username_snapshot)}
          style={({ pressed }) => [s.podiumWinner, pressed && { opacity: 0.85 }]}>
          <View style={s.podiumWinnerAvatarWrap}>
            {winnerAvatar ? (
              <Image source={{ uri: winnerAvatar }} style={s.podiumWinnerAvatar} contentFit="cover" />
            ) : (
              <DefaultAvatar size={48} />
            )}
            <Text style={s.podiumWinnerCrown}>👑</Text>
          </View>
          <View style={s.podiumWinnerText}>
            <Text style={s.podiumWinnerName} numberOfLines={1}>@{winner.username_snapshot || 'anonymous'}</Text>
            <Text style={s.podiumWinnerPoints}>{fmtNum(winner.points)} <Text style={s.podiumWinnerPointsUnit}>pts</Text></Text>
          </View>
        </Pressable>
      ) : null}
      {others.length > 0 ? (
        <View style={s.podiumOthers}>
          {others.map((entry) => (
            <PodiumRow key={`${entry.award_key}-${entry.rank}`} entry={entry} onProfile={onProfile} s={s} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PodiumRow({
  entry,
  onProfile,
  s,
}: {
  entry: WeeklyChallengeAward;
  onProfile: (username?: string) => void;
  s: Styles;
}) {
  const avatar = typeof entry.avatar_snapshot === 'string' ? fullImageUrl(entry.avatar_snapshot) : undefined;
  return (
    <Pressable
      onPress={() => onProfile(entry.username_snapshot)}
      style={({ pressed }) => [s.awardRow, pressed && { opacity: 0.7 }]}>
      <Text style={s.awardMedal}>{MEDAL[entry.rank] || `#${entry.rank}`}</Text>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.awardAvatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={20} />
      )}
      <Text style={s.awardName} numberOfLines={1}>{entry.username_snapshot || 'anonymous'}</Text>
      <Text style={s.awardPoints}>{fmtNum(entry.points)}</Text>
    </Pressable>
  );
}

function LeaderboardSection({
  leaderboard,
  viewerUserId,
  onProfile,
  chartMode,
  onChartMode,
  skillFamily,
  onSkillFamily,
  showModeFilter = true,
  s,
}: {
  leaderboard: WeeklyChallengeLeaderboardRow[];
  viewerUserId?: string;
  onProfile: (username?: string) => void;
  chartMode: WeeklyChallengeChartMode;
  onChartMode: (m: WeeklyChallengeChartMode) => void;
  skillFamily: WeeklyChallengeSkillFamily;
  onSkillFamily: (f: WeeklyChallengeSkillFamily) => void;
  /** When false the Singles/Doubles/Both pill row is hidden. Used by the
   *  Co-op division where every chart is CoOp so the filter is meaningless. */
  showModeFilter?: boolean;
  s: Styles;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>LEADERBOARD</Text>
      <View style={s.filtersStack}>
        {showModeFilter ? (
          <SegmentedRow value={chartMode} options={MODE_OPTIONS} onSelect={onChartMode} s={s} />
        ) : null}
        <SegmentedRow value={skillFamily} options={SKILL_OPTIONS} onSelect={onSkillFamily} s={s} />
      </View>
      <View style={s.leaderboardCard}>
        {leaderboard.slice(0, 25).map((row) => (
          <LeaderRow
            key={`${row.rank}-${row.user_id}`}
            row={row}
            viewerUserId={viewerUserId}
            onProfile={onProfile}
            s={s}
          />
        ))}
      </View>
    </View>
  );
}

function SegmentedRow<T extends string>({
  value,
  options,
  onSelect,
  s,
}: {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
  s: Styles;
}) {
  return (
    <View style={s.segmentRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onSelect(opt.value)}
            style={({ pressed }) => [s.segment, active && s.segmentActive, pressed && { opacity: 0.7 }]}>
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LeaderRow({
  row,
  viewerUserId,
  onProfile,
  s,
}: {
  row: WeeklyChallengeLeaderboardRow;
  viewerUserId?: string;
  onProfile: (username?: string) => void;
  s: Styles;
}) {
  const avatar = typeof row.avatar === 'string' ? fullImageUrl(row.avatar) : undefined;
  const isMe = viewerUserId && row.user_id === viewerUserId;
  return (
    <Pressable
      onPress={() => onProfile(row.username)}
      style={({ pressed }) => [s.leaderRow, isMe && s.leaderRowMe, pressed && { opacity: 0.85 }]}>
      <Text style={[s.leaderRank, row.rank === 1 && { color: '#fbbf24' }, row.rank === 2 && { color: '#e5e7eb' }, row.rank === 3 && { color: '#fb923c' }]}>
        {row.rank <= 3 ? MEDAL[row.rank] : `#${row.rank}`}
      </Text>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.leaderAvatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={28} />
      )}
      <Text style={s.leaderName} numberOfLines={1}>
        {row.username || 'anonymous'}{isMe ? ' (you)' : ''}
      </Text>
      <View style={s.leaderStats}>
        <Text style={s.leaderPoints}>{fmtNum(row.points)}</Text>
        <Text style={s.leaderClears}>
          {row.clears} clear{row.clears === 1 ? '' : 's'}
          {row.pg_bonus_count > 0 ? ` · ${row.pg_bonus_count} PG` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Mode-tinted gradient pair for the chart-card jacket overlay. Mirrors the
 * web's per-mode gradient (red for singles, green for doubles, sky-blue for
 * co-op) so charts in the same mode read as a visual family.
 */
function modeGradient(mode: string): readonly [string, string, string] {
  if (mode === 'Single') return ['rgba(217, 61, 98, 0.0)', 'rgba(217, 61, 98, 0.05)', 'rgba(122, 23, 48, 0.95)'];
  if (mode === 'Double') return ['rgba(22, 183, 127, 0.0)', 'rgba(22, 183, 127, 0.05)', 'rgba(11, 93, 72, 0.95)'];
  return ['rgba(43, 136, 222, 0.0)', 'rgba(43, 136, 222, 0.05)', 'rgba(18, 69, 124, 0.95)'];
}

function modeBadgeColors(mode: string): readonly [string, string] {
  if (mode === 'Single') return ['#ff7a7a', '#7a1730'];
  if (mode === 'Double') return ['#4cf4aa', '#0b5d48'];
  return ['#69c8ff', '#12457c'];
}

function modeShort(mode: string): string {
  return mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : 'C';
}

function gradeColor(grade?: string): string {
  if (!grade) return '#71717a';
  if (grade.includes('SSS')) return '#7dd3fc';
  if (grade.includes('SS')) return '#FFC400';
  if (grade.includes('S')) return '#fbbf24';
  if (grade.includes('AAA')) return '#c0c0c0';
  if (grade.includes('AA')) return '#cd7f32';
  return '#a1a1aa';
}

function LevelDivider({
  level,
  count,
  viewerPlayed,
  isCoop = false,
  s,
}: {
  level: string;
  count: number;
  viewerPlayed: number | undefined;
  /** Co-op: render "Co-Op (2P)" instead of "Lv. 2" since the level field
   *  encodes player count rather than difficulty. */
  isCoop?: boolean;
  s: Styles;
}) {
  return (
    <View style={s.levelDivider}>
      <Text style={s.levelDividerLevel}>
        {isCoop ? `Co-Op (${level}P)` : `Lv. ${level}`}
      </Text>
      <Text style={s.levelDividerCount}>{count} chart{count === 1 ? '' : 's'}</Text>
      <View style={s.levelDividerLine} />
      {viewerPlayed != null ? (
        <Text style={[s.levelDividerProgress, { color: viewerPlayed === count ? '#34d399' : viewerPlayed > 0 ? '#facc15' : 'rgba(255,255,255,0.3)' }]}>
          {viewerPlayed}/{count}
        </Text>
      ) : null}
    </View>
  );
}

function ChartCard({
  chart,
  viewerBest,
  onPress,
  s,
}: {
  chart: WeeklyChallengeChart;
  viewerBest?: WeeklyChallengeViewerBest;
  onPress: () => void;
  s: Styles;
}) {
  const jacket = chart.jacket_url_snapshot ? fullImageUrl(chart.jacket_url_snapshot) : undefined;
  const top3 = (chart.top3 || []).slice(0, 3);
  const [badgeFrom] = modeBadgeColors(chart.mode);
  const badgeColors: readonly [string, string, string] =
    badgeFrom === '#ff7a7a' ? ['#ff7a7a', '#d93d62', '#7a1730']
    : badgeFrom === '#4cf4aa' ? ['#4cf4aa', '#16b77f', '#0b5d48']
    : ['#69c8ff', '#2b88de', '#12457c'];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.chartCard, pressed && { opacity: 0.92 }]}>
      <View style={s.chartHero}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.chartHeroImg} contentFit="cover" cachePolicy="memory-disk" recyclingKey={jacket} transition={0} />
        ) : (
          <View style={[s.chartHeroImg, s.chartHeroFallback]} />
        )}
        {/* Mode-tinted top-to-bottom scrim so the song title (top) and the
            top-3 overlay (bottom) both stay readable over a busy jacket. */}
        <LinearGradient
          colors={modeGradient(chart.mode)}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <LinearGradient
          colors={badgeColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.chartModeBadge}>
          <Text style={s.chartModeBadgeText}>{modeShort(chart.mode)}{chart.level}</Text>
        </LinearGradient>

        {/* Title pinned to the top so the bottom is free for the top-3
            list. The mode badge sits to its right via flex layout. */}
        <View style={s.chartHeroTopText}>
          <Text style={s.chartHeroTitle} numberOfLines={1}>{chart.song_title_snapshot}</Text>
        </View>

        {/* Top-3 overlay: rank emoji + small avatar + username + score on
            each row. Was a separate footer block; pulled onto the jacket
            so the card can show the actual leaderboard at a glance. */}
        {top3.length > 0 ? (
          <View style={s.chartTopList}>
            {top3.map((entry, i) => {
              const av = typeof entry.avatar === 'string' && entry.avatar
                ? fullImageUrl(entry.avatar)
                : undefined;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
              return (
                <View key={`${entry.user_id}-${entry.rank}`} style={s.chartTopRow}>
                  <Text style={s.chartTopMedal}>{medal}</Text>
                  {av ? (
                    <Image source={{ uri: av }} style={s.chartTopAvatar} contentFit="cover" />
                  ) : (
                    <View style={[s.chartTopAvatar, s.chartTopAvatarFallback]}>
                      <Text style={s.chartTopAvatarLetter}>
                        {(entry.username || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={s.chartTopName} numberOfLines={1}>{entry.username}</Text>
                  <Text style={[s.chartTopScore, { color: gradeColor(entry.grade) }]} numberOfLines={1}>
                    {fmtNum(entry.score)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={s.chartTopList}>
            <Text style={s.chartTopEmpty}>No plays yet</Text>
          </View>
        )}
      </View>

      <View style={s.chartFooter}>
        <Text style={s.chartFooterStat} numberOfLines={1}>
          <Text style={s.chartFooterNum}>{chart.clearCount || 0}</Text>/<Text style={s.chartFooterNum}>{chart.participantCount || 0}</Text> cleared
        </Text>
      </View>

      {viewerBest ? (
        <View style={s.viewerBestStrip}>
          <Text style={s.viewerBestLabel}>YOU</Text>
          <View style={s.viewerBestRow}>
            <Text style={[s.viewerBestScoreText, { color: gradeColor(viewerBest.grade) }]} numberOfLines={1}>
              {fmtNum(viewerBest.score)}
            </Text>
            {viewerBest.has_pg_bonus ? <Text style={s.viewerBestBonus}>PG</Text> : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function WeekPickerSheet({
  visible,
  weeks,
  currentKey,
  onPick,
  onClose,
}: {
  visible: boolean;
  weeks: WeeklyChallengeWeekIndexEntry[];
  currentKey: string;
  onPick: (k: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <Pressable style={s.sheetBackdropFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetTitleRow}>
            <Text style={s.sheetTitle}>Pick a week</Text>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.sheetCloseBtn, pressed && { opacity: 0.6 }]}>
              <IconSymbol name="xmark" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={s.sheetList} contentContainerStyle={s.sheetListContent}>
            {weeks.map((w) => {
              const active = w.week_key === currentKey || (currentKey === 'current' && w.status === 'active');
              const isLive = w.status === 'active';
              return (
                <Pressable
                  key={w.week_key}
                  onPress={() => onPick(w.week_key)}
                  style={({ pressed }) => [s.weekRow, active && s.weekRowActive, pressed && { opacity: 0.85 }]}>
                  {active ? <View style={s.weekRowAccent} /> : null}
                  <View style={s.weekRowMain}>
                    <View style={s.weekRowTopLine}>
                      <Text style={s.weekRowKey}>{w.week_key}</Text>
                      <View style={[s.weekStatusChip, isLive && s.weekStatusChipLive]}>
                        {isLive ? <View style={s.weekLivePulse} /> : null}
                        <Text style={[s.weekStatusChipText, isLive && s.weekStatusChipTextLive]}>
                          {w.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.weekRowDates}>{fmtDateRange(w.starts_at_utc, w.ends_at_utc)}</Text>
                    <View style={s.weekRowStatsLine}>
                      <Text style={s.weekRowStat}>
                        <Text style={s.weekRowStatNum}>{w.chart_count}</Text> charts
                      </Text>
                      <Text style={s.weekRowDot}>·</Text>
                      <Text style={s.weekRowStat}>
                        <Text style={s.weekRowStatNum}>{w.participant_count}</Text> player{w.participant_count === 1 ? '' : 's'}
                      </Text>
                      {typeof w.challenge_max_level === 'number' ? (
                        <>
                          <Text style={s.weekRowDot}>·</Text>
                          <Text style={s.weekRowStat}>
                            up to L<Text style={s.weekRowStatNum}>{w.challenge_max_level}</Text>
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  {active ? (
                    <IconSymbol name="checkmark" size={16} color={theme.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 1 },
  topBarSpacer: { flex: 1 },
  weekPickerBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  weekPickerText: { fontSize: 12, fontWeight: '800' as const, color: t.text, letterSpacing: 0.5 },

  scroll: { paddingHorizontal: 12, gap: 14 },
  center: { padding: 32, alignItems: 'center' as const },
  errorBox: { padding: 16, borderRadius: 8, backgroundColor: t.dangerBg, borderWidth: 1, borderColor: t.dangerBorder },
  errorText: { color: t.danger, fontSize: 14 },

  // Week header
  weekHeader: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 10,
  },
  weekStatusRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
  statusPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  livePulse: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4 },
  countdown: { fontSize: 11, fontWeight: '800' as const, color: '#fbbf24' },
  dateRange: { fontSize: 11, color: t.textMuted, marginLeft: 'auto' as const },
  weekStatsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  weekStat: { fontSize: 12, color: t.textMuted },
  weekStatNum: { color: t.text, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },

  // Viewer summary
  viewerCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.accent,
    padding: 14,
    gap: 12,
  },
  viewerHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  viewerEyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.6, color: t.accent },
  viewerRank: { fontSize: 14, color: t.textMuted },
  viewerRankNum: { fontSize: 20, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  viewerStats: { flexDirection: 'row' as const, gap: 8 },
  viewerStat: { flex: 1, alignItems: 'center' as const, gap: 2 },
  viewerStatNum: { fontSize: 18, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  viewerStatLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },

  // Section wrapper
  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim, paddingHorizontal: 4 },
  sectionCount: { fontSize: 11, fontWeight: '700' as const, color: t.textDim },

  // Awards strip
  awardsRow: { gap: 8, paddingHorizontal: 2 },
  awardsTrack: { position: 'relative' as const },
  awardsFade: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 32,
    backgroundColor: t.bg,
    opacity: 0.85,
  },
  awardsFadeLeft: { left: 0 },
  awardsFadeRight: { right: 0 },
  awardsArrow: {
    position: 'absolute' as const,
    top: '50%' as const,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    transform: [{ translateY: -14 }] as const,
  },
  awardsArrowLeft: { left: 4 },
  awardsArrowRight: { right: 4 },
  podiumCard: {
    width: 230,
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(250, 204, 21, 0.18)',
    padding: 12,
    gap: 10,
  },
  podiumCategory: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4, color: '#fbbf24', textTransform: 'uppercase' as const },
  podiumWinner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  podiumWinnerAvatarWrap: { position: 'relative' as const, width: 48, height: 48 },
  podiumWinnerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.surfaceMuted,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  podiumWinnerCrown: { position: 'absolute' as const, top: -8, right: -4, fontSize: 18 },
  podiumWinnerText: { flex: 1, gap: 2 },
  podiumWinnerName: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  podiumWinnerPoints: { fontSize: 18, fontWeight: '900' as const, color: '#fbbf24', fontVariant: ['tabular-nums' as const] },
  podiumWinnerPointsUnit: { fontSize: 10, color: t.textDim, fontWeight: '700' as const },
  podiumOthers: { gap: 4 },
  awardRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  awardMedal: { fontSize: 14, width: 22 },
  awardAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: t.surfaceMuted },
  awardName: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: t.text },
  awardPoints: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },

  // Leaderboard
  filtersStack: { gap: 6 },
  segmentRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, paddingVertical: 7, borderRadius: 7, alignItems: 'center' as const },
  segmentActive: { backgroundColor: t.card },
  segmentText: { fontSize: 12, fontWeight: '600' as const, color: t.textMuted },
  segmentTextActive: { color: t.text, fontWeight: '700' as const },

  leaderboardCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  leaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  leaderRowMe: { backgroundColor: 'rgba(250, 204, 21, 0.08)' },
  leaderRank: { width: 36, fontSize: 14, fontWeight: '900' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  leaderAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  leaderName: { flex: 1, fontSize: 13, fontWeight: '700' as const, color: t.text },
  leaderStats: { alignItems: 'flex-end' as const },
  leaderPoints: { fontSize: 14, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  leaderClears: { fontSize: 10, color: t.textDim },

  // Charts header
  chartsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
    marginTop: 4,
  },

  // Division tabs (Singles+Doubles vs Co-Op)
  divisionRow: {
    flexDirection: 'row' as const,
    gap: 4,
    backgroundColor: t.card,
    borderRadius: 999,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  divisionTab: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' as const },
  divisionTabActive: { backgroundColor: t.accent },
  divisionTabText: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.4 },
  divisionTabTextActive: { color: t.textOnAccent },

  // Empty state shown when a division has no charts (e.g. Co-op before
  // the backfill runs, or a freshly-created week where the picker hasn't
  // fired yet).
  emptyBlock: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 16,
    gap: 6,
    alignItems: 'center' as const,
  },
  emptyTitle: { fontSize: 13, fontWeight: '800' as const, color: t.text, textAlign: 'center' as const },
  emptyBody: { fontSize: 11, color: t.textMuted, textAlign: 'center' as const, lineHeight: 16 },

  // Level block (header divider + cards stacked beneath)
  levelBlock: { gap: 8 },
  levelDivider: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  levelDividerLevel: { fontSize: 14, fontWeight: '900' as const, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.3 },
  levelDividerCount: { fontSize: 11, color: 'rgba(255,255,255,0.25)', fontWeight: '700' as const },
  levelDividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
  levelDividerProgress: { fontSize: 11, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const], letterSpacing: 0.3 },

  // 2-column chart grid (S on left, D on right per level by sort_order)
  chartGrid: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  chartCard: {
    flexBasis: '48.5%' as const,
    flexGrow: 1,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden' as const,
  },
  // Source jacket art is roughly landscape — 16:10 keeps it natural and
  // matches the desktop ChartCard. The top-3 overlay below sits on the
  // bottom half via a translucent scrim so the art still reads through.
  chartHero: { aspectRatio: 16 / 10, backgroundColor: '#000', overflow: 'hidden' as const },
  chartHeroImg: { width: '100%' as const, height: '100%' as const },
  chartHeroFallback: { backgroundColor: '#1f2937' },
  chartModeBadge: {
    position: 'absolute' as const,
    top: 5,
    right: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  chartModeBadgeText: { fontSize: 10, fontWeight: '900' as const, color: '#fff', letterSpacing: -0.3 },
  // Title pinned to the TOP of the jacket (was bottom). Keeps clear of
  // the mode badge with right-padding so they don't fight at narrow widths.
  chartHeroTopText: {
    position: 'absolute' as const,
    left: 0,
    right: 40, // keep clear of the mode badge top-right
    top: 0,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  chartHeroTitle: {
    fontSize: 12,
    fontWeight: '900' as const,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Top-3 overlay block at the bottom of the jacket. With the jacket back
  // at 16:10 there's less vertical room, so each row is tighter — small
  // avatars, single-line names, compact padding — and the scrim is a bit
  // darker so the rows read clearly over busy jacket art.
  chartTopList: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  chartTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  chartTopMedal: { fontSize: 10, width: 12, textAlign: 'center' as const },
  chartTopAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  chartTopAvatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  chartTopAvatarLetter: { fontSize: 8, fontWeight: '900' as const, color: '#fff' },
  chartTopName: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700' as const,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chartTopScore: {
    fontSize: 10,
    fontWeight: '900' as const,
    fontVariant: ['tabular-nums' as const],
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chartTopEmpty: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
    paddingVertical: 2,
  },

  // Footer simplifies down to just the participation/clear stat now that
  // top-1 has moved into the jacket overlay above.
  chartFooter: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6, gap: 2 },
  chartFooterStat: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '700' as const },
  chartFooterNum: { color: 'rgba(255,255,255,0.85)', fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },

  // Viewer best strip — single tight line
  viewerBestStrip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(250, 204, 21, 0.18)',
    backgroundColor: 'rgba(250, 204, 21, 0.06)',
    gap: 6,
  },
  viewerBestLabel: { fontSize: 8, fontWeight: '900' as const, color: 'rgba(250, 204, 21, 0.7)', letterSpacing: 1.2 },
  viewerBestRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  viewerBestScoreText: { fontSize: 11, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  viewerBestBonus: {
    fontSize: 8,
    fontWeight: '900' as const,
    color: '#fbbf24',
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    letterSpacing: 0.6,
  },

  // Week picker sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  sheetBackdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    maxHeight: '85%' as const,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginBottom: 8,
  },
  sheetTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  sheetCloseBtn: { padding: 6 },
  sheetList: { maxHeight: 600 },
  sheetListContent: { gap: 6, paddingBottom: 12 },

  weekRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  weekRowActive: { borderColor: t.accent, backgroundColor: 'rgba(255, 196, 0, 0.05)' },
  weekRowAccent: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: t.accent,
  },
  weekRowMain: { flex: 1, gap: 4 },
  weekRowTopLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  weekRowKey: { fontSize: 14, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  weekRowDates: { fontSize: 11, color: t.textMuted },
  weekRowStatsLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 2 },
  weekRowStat: { fontSize: 11, color: t.textDim },
  weekRowStatNum: { color: t.text, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
  weekRowDot: { fontSize: 11, color: t.textDim },
  weekStatusChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
  },
  weekStatusChipLive: { backgroundColor: 'rgba(52, 211, 153, 0.15)' },
  weekLivePulse: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#34d399' },
  weekStatusChipText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  weekStatusChipTextLive: { color: '#34d399' },

  // Desktop: weeks rail on left replaces the modal week picker.
  deskBody: { flex: 1, flexDirection: 'row' as const },
  deskWeeksRail: {
    width: 280,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border,
    backgroundColor: t.surface,
  },
  deskWeeksRailTitle: {
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 1.6,
    color: t.textDim,
    textTransform: 'uppercase' as const,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  deskWeeksRailContent: { paddingHorizontal: 8, paddingBottom: 16, gap: 2 },
  deskWeekRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 2,
  },
  deskWeekRowActive: { backgroundColor: t.accentTint },
  deskWeekRowLabel: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  deskWeekRowLabelActive: { color: t.accent, fontWeight: '800' as const },
  deskWeekRowMeta: { fontSize: 11, color: t.textDim, letterSpacing: 0.3 },

  // Desktop right rail — persistent leaderboard alongside the charts pool.
  deskLeaderboardRail: {
    width: 360,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
  },
  deskLeaderboardScroll: { padding: 12, paddingBottom: 40 },
});

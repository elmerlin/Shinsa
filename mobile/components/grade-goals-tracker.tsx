import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { GradeChip } from '@/components/grade-chip';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { resolveChartJacketUrl } from '@/lib/jacketMap';
import { toCanonicalSongTitle } from '@/lib/songAliases';
import type { ThemeColors } from '@/constants/theme';
import type { GradeGoalChart, GradeGoalCloseness, SongAnalyticsResponse } from '@shared/api';

interface Props {
  userId: string;
  /** Used to derive the default level (competitive level) and to gate which
   *  modes/levels are even worth showing. */
  analytics: SongAnalyticsResponse | undefined;
  jacketMap: Record<string, string> | undefined;
  onChartPress?: (chartId: number) => void;
}

type Mode = 'Single' | 'Double';

const TARGET_GRADES = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA+', 'AAA', 'AA+', 'AA', 'A+', 'A'];

const CLOSENESS_META: Record<GradeGoalCloseness, { label: string; color: string }> = {
  achieved: { label: 'Achieved', color: '#34d399' },
  within_reach: { label: 'Within reach', color: '#7dd3fc' },
  close: { label: 'Close', color: '#fbbf24' },
  needs_work: { label: 'Needs work', color: '#f87171' },
  unplayed: { label: 'Unplayed', color: '#737373' },
};

const FILTERS: { key: 'all' | GradeGoalCloseness; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'within_reach', label: 'Within reach' },
  { key: 'close', label: 'Close' },
  { key: 'needs_work', label: 'Needs work' },
  { key: 'achieved', label: 'Achieved' },
];

function fmtNum(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

export function GradeGoalsTracker({ userId, analytics, jacketMap, onChartPress }: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  // Pick sensible defaults: prefer the user's competitive level for the chosen
  // mode, fall back to the highest level they've cleared at all.
  const compSingle = analytics?.competitive_levels?.single?.level;
  const compDouble = analytics?.competitive_levels?.double?.level;
  const defaultMode: Mode = (compSingle ?? 0) >= (compDouble ?? 0) ? 'Single' : 'Double';

  const [mode, setMode] = useState<Mode>(defaultMode);
  const [target, setTarget] = useState<string>('S');
  const [filter, setFilter] = useState<'all' | GradeGoalCloseness>('all');

  // Available levels from analytics buckets (only show levels with charts).
  const availableLevels = useMemo(() => {
    const buckets = mode === 'Single' ? analytics?.levels?.single : analytics?.levels?.double;
    return (buckets ?? [])
      .filter((b) => (Number(b.total_charts) || 0) > 0)
      .map((b) => Number(b.level))
      .sort((a, b) => a - b);
  }, [mode, analytics]);

  const compLevel = mode === 'Single' ? compSingle : compDouble;
  const fallbackLevel = availableLevels[Math.floor(availableLevels.length / 2)] ?? 1;
  const [level, setLevel] = useState<number>(compLevel ?? fallbackLevel);

  // Keep the level inside the available range when mode changes.
  useMemo(() => {
    if (availableLevels.length === 0) return;
    if (!availableLevels.includes(level)) {
      setLevel(compLevel ?? availableLevels[Math.floor(availableLevels.length / 2)] ?? 1);
    }
  }, [availableLevels, level, compLevel]);

  const goalsQuery = useQuery({
    queryKey: ['grade-goals', userId, mode, level, target],
    queryFn: () => songsApi.gradeGoals(userId, { mode, level, target_grade: target }),
    enabled: !!userId && !!level && !!target,
    staleTime: 60_000,
  });

  const data = goalsQuery.data;
  const allCharts = data?.charts ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allCharts.length };
    for (const ch of allCharts) c[ch.closeness] = (c[ch.closeness] ?? 0) + 1;
    return c;
  }, [allCharts]);
  const filteredCharts = filter === 'all' ? allCharts : allCharts.filter((ch) => ch.closeness === filter);
  const [expandedList, setExpandedList] = useState(false);
  // Reset to collapsed view when the filter / level / target change so the
  // user always lands on a short list, not whatever they last expanded into.
  useEffect(() => { setExpandedList(false); }, [filter, level, target, mode]);
  const PAGE = 6;
  const visibleCharts = expandedList ? filteredCharts : filteredCharts.slice(0, PAGE);
  const remainingCount = Math.max(0, filteredCharts.length - visibleCharts.length);

  return (
    <View style={s.wrap}>
      {/* Mode + level + target row */}
      <View style={s.controlsRow}>
        <View style={s.modeToggle}>
          <Pressable
            onPress={() => setMode('Single')}
            style={({ pressed }) => [s.modePill, mode === 'Single' && s.modePillActiveSingle, pressed && { opacity: 0.7 }]}>
            <Text style={[s.modePillText, mode === 'Single' && { color: '#ff8b8b' }]}>Singles</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('Double')}
            style={({ pressed }) => [s.modePill, mode === 'Double' && s.modePillActiveDouble, pressed && { opacity: 0.7 }]}>
            <Text style={[s.modePillText, mode === 'Double' && { color: '#4cf4aa' }]}>Doubles</Text>
          </Pressable>
        </View>
      </View>

      {/* Level + target — horizontal scrollers so they stay one line each. */}
      <View style={s.scrubberBlock}>
        <Text style={s.scrubberLabel}>LEVEL</Text>
        <HorizontalChipRow
          items={availableLevels.map((lv) => ({ key: String(lv), label: String(lv) }))}
          selectedKey={String(level)}
          onSelect={(k) => setLevel(parseInt(k, 10) || 1)}
          chipStyle={s.levelChip}
          chipActiveStyle={s.levelChipActive}
          textStyle={s.levelChipText}
          textActiveStyle={s.levelChipTextActive}
        />
      </View>

      <View style={s.scrubberBlock}>
        <Text style={s.scrubberLabel}>TARGET GRADE</Text>
        <HorizontalChipRow
          items={TARGET_GRADES.map((g) => ({ key: g, label: g }))}
          selectedKey={target}
          onSelect={setTarget}
          chipStyle={s.gradeChip}
          chipActiveStyle={s.gradeChipActive}
          textStyle={s.gradeChipText}
          textActiveStyle={s.gradeChipTextActive}
        />
      </View>

      {/* Progress summary */}
      {data ? (
        <View style={s.progressCard}>
          <View style={s.progressTopRow}>
            <Text style={s.progressLabel}>{data.achieved_count} / {data.total_charts} achieved</Text>
            <Text style={s.progressPct}>{data.progress_percent.toFixed(0)}%</Text>
          </View>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${Math.max(0, Math.min(100, data.progress_percent))}%` }]} />
          </View>
        </View>
      ) : null}

      {/* Filter pills */}
      <View style={s.scrubberRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = counts[f.key as string] ?? 0;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={({ pressed }) => [s.filterChip, active && s.filterChipActive, pressed && { opacity: 0.7 }]}>
              <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                {f.label} {count > 0 ? <Text style={s.filterChipCount}>{count}</Text> : null}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Chart list */}
      {goalsQuery.isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : goalsQuery.isError ? (
        <Text style={s.errorText}>
          {goalsQuery.error instanceof Error ? goalsQuery.error.message : 'Failed to load goals'}
        </Text>
      ) : filteredCharts.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyText}>
            {allCharts.length === 0 ? 'No charts at this level' : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} charts`}
          </Text>
        </View>
      ) : (
        <View style={s.listCard}>
          {visibleCharts.map((c) => (
            <GoalRow key={c.chart_id} chart={c} jacketMap={jacketMap} s={s} onPress={() => onChartPress?.(c.chart_id)} />
          ))}
          {remainingCount > 0 ? (
            <Pressable
              onPress={() => setExpandedList(true)}
              style={({ pressed }) => [s.expandRow, pressed && { opacity: 0.7 }]}>
              <Text style={s.expandText}>Show {remainingCount} more</Text>
            </Pressable>
          ) : expandedList && filteredCharts.length > PAGE ? (
            <Pressable
              onPress={() => setExpandedList(false)}
              style={({ pressed }) => [s.expandRow, pressed && { opacity: 0.7 }]}>
              <Text style={s.expandText}>Show less</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * Horizontal scroller of selectable chips. Auto-scrolls the active chip into
 * view so the level/grade selectors stay one line tall regardless of how many
 * options exist.
 */
function HorizontalChipRow({ items, selectedKey, onSelect, chipStyle, chipActiveStyle, textStyle, textActiveStyle }: {
  items: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
  chipStyle: object;
  chipActiveStyle: object;
  textStyle: object;
  textActiveStyle: object;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const positions = useRef<Record<string, { x: number; w: number }>>({});

  // Center the active chip when the selection changes externally.
  useEffect(() => {
    const pos = positions.current[selectedKey];
    if (!pos || !scrollRef.current) return;
    // crude center: scroll so the chip starts ~80px from left
    scrollRef.current.scrollTo({ x: Math.max(0, pos.x - 80), animated: true });
  }, [selectedKey]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'row', gap: 4, paddingRight: 6 }}>
      {items.map((it) => {
        const active = it.key === selectedKey;
        return (
          <Pressable
            key={it.key}
            onPress={() => onSelect(it.key)}
            onLayout={(e) => {
              positions.current[it.key] = {
                x: e.nativeEvent.layout.x,
                w: e.nativeEvent.layout.width,
              };
            }}
            style={({ pressed }) => [chipStyle, active && chipActiveStyle, pressed && { opacity: 0.7 }]}>
            <Text style={[textStyle, active && textActiveStyle]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function GoalRow({ chart, jacketMap, s, onPress }: {
  chart: GradeGoalChart;
  jacketMap: Record<string, string> | undefined;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
  onPress: () => void;
}) {
  const meta = CLOSENESS_META[chart.closeness];
  const resolved = resolveChartJacketUrl({
    title: chart.title,
    mode: chart.mode,
    level: chart.level,
    jacketLookup: jacketMap,
    jacketUrl: chart.jacket_url,
  });
  const jacketUrl = resolved ? fullImageUrl(resolved) : undefined;
  const title = toCanonicalSongTitle(chart.title || '') || chart.title || 'Unknown';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
      <View style={[s.closenessBar, { backgroundColor: meta.color }]} />
      <ChartJacket jacketUrl={jacketUrl} mode={chart.mode} level={chart.level} size="sm" />
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        <View style={s.rowMetaLine}>
          <View style={s.gradeArrow}>
            <GradeChip grade={chart.current_grade || 'F'} score={chart.current_score} size="xs" />
            <Text style={s.arrow}>→</Text>
            <Text style={[s.targetText, { color: meta.color }]}>{chart.target_grade}</Text>
          </View>
          {chart.closeness !== 'achieved' && chart.points_needed > 0 ? (
            <Text style={s.rowSub}>+{fmtNum(chart.points_needed)} pts to go</Text>
          ) : (
            <Text style={[s.rowSub, { color: meta.color }]}>{meta.label}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  wrap: { gap: 10 },

  controlsRow: { gap: 8 },
  modeToggle: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 999,
    padding: 3,
    gap: 3,
    alignSelf: 'flex-start' as const,
  },
  modePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  modePillActiveSingle: { backgroundColor: '#ff7a7a26', borderWidth: StyleSheet.hairlineWidth, borderColor: '#ff7a7a' },
  modePillActiveDouble: { backgroundColor: '#4cf4aa26', borderWidth: StyleSheet.hairlineWidth, borderColor: '#4cf4aa' },
  modePillText: { fontSize: 11, fontWeight: '900' as const, color: t.textMuted, letterSpacing: 0.5 },

  scrubberBlock: { gap: 4 },
  scrubberLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.5, color: t.textDim, marginBottom: 4 },
  scrubberRow: { flexDirection: 'row' as const, gap: 4, flexWrap: 'wrap' as const },
  expandRow: { paddingVertical: 10, alignItems: 'center' as const },
  expandText: { fontSize: 11, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.5 },

  levelChip: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center' as const,
  },
  levelChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  levelChipText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  levelChipTextActive: { color: t.accent },

  gradeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  gradeChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  gradeChipText: { fontSize: 10, fontWeight: '900' as const, color: t.textMuted, letterSpacing: 0.3 },
  gradeChipTextActive: { color: t.accent },

  progressCard: {
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
    gap: 6,
  },
  progressTopRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  progressLabel: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  progressPct: { fontSize: 14, fontWeight: '900' as const, color: t.accent, fontVariant: ['tabular-nums' as const] },
  progressBar: { height: 6, borderRadius: 999, backgroundColor: t.surfaceMuted, overflow: 'hidden' as const },
  progressFill: { height: '100%' as const, backgroundColor: t.accent },

  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  filterChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  filterChipText: { fontSize: 10, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.3 },
  filterChipTextActive: { color: t.accent },
  filterChipCount: { fontSize: 10, fontWeight: '900' as const, color: t.text },

  center: { padding: 24, alignItems: 'center' as const },
  errorText: { color: t.danger, fontSize: 12, textAlign: 'center' as const, padding: 12 },
  emptyCard: { padding: 20, alignItems: 'center' as const, backgroundColor: t.card, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  emptyText: { fontSize: 12, color: t.textDim },

  listCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  closenessBar: { width: 3, height: '70%' as const, borderRadius: 2 },
  rowMain: { flex: 1, gap: 4, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  rowMetaLine: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  gradeArrow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  arrow: { fontSize: 10, color: t.textDim },
  targetText: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.5 },
  rowSub: { fontSize: 10, color: t.textDim, fontVariant: ['tabular-nums' as const] },
});

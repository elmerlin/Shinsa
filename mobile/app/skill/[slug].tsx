import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { getGradeDisplayLabel, getGradeTier, TIER_COLORS } from '@/lib/grades';
import type { ThemeColors } from '@/constants/theme';
import type { SkillChart, SkillChartsResponse, SkillChartsSort, SkillDescriptionSegment } from '@shared/api';

const SKILL_QUERY_KEY = (slug: string, params: SkillQueryParams) =>
  ['skill-charts', slug, params.mode, params.minLevel, params.maxLevel, params.sort, params.userId] as const;

interface SkillQueryParams {
  mode: 'single' | 'double' | 'both';
  minLevel: string;
  maxLevel: string;
  sort: SkillChartsSort;
  userId?: string;
}

const MODE_OPTIONS: { value: 'both' | 'single' | 'double'; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'single', label: 'Singles' },
  { value: 'double', label: 'Doubles' },
];

const SORT_OPTIONS: { value: SkillChartsSort; label: string }[] = [
  { value: 'level_asc', label: 'Level ↑' },
  { value: 'level_desc', label: 'Level ↓' },
  { value: 'score_desc', label: 'Score ↓' },
  { value: 'score_asc', label: 'Score ↑' },
];

function modeOrderValue(mode: string): number {
  if (mode === 'Single') return 0;
  if (mode === 'Double') return 1;
  return 99;
}

function compareByScore(a: SkillChart, b: SkillChart, dir: 'asc' | 'desc'): number {
  const aHas = Number.isFinite(a.best_score);
  const bHas = Number.isFinite(b.best_score);
  if (!aHas && bHas) return 1;
  if (aHas && !bHas) return -1;
  if (aHas && bHas && (a.best_score ?? 0) !== (b.best_score ?? 0)) {
    return dir === 'asc' ? (a.best_score ?? 0) - (b.best_score ?? 0) : (b.best_score ?? 0) - (a.best_score ?? 0);
  }
  return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
}

function formatNumber(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString();
}

function formatChartResult(chart: SkillChart): { text: string; color: string } {
  if (!Number.isFinite(chart.best_score)) {
    return { text: 'No score', color: '#6b7280' };
  }
  if (chart.is_stage_break) {
    return { text: 'Stage break', color: '#ef4444' };
  }
  const grade = (chart.best_grade || '').trim();
  const display = grade || getGradeDisplayLabel(grade, chart.best_score ?? 0);
  const tier = getGradeTier(grade, chart.best_score ?? 0);
  return {
    text: `${display} · ${formatNumber(chart.best_score)}`,
    color: TIER_COLORS[tier] || '#cbd5e1',
  };
}

interface ChartGroup {
  key: string;
  mode: string;
  level: number;
  charts: SkillChart[];
}

export default function SkillDetailScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || '');

  const [mode, setMode] = useState<'both' | 'single' | 'double'>('both');
  const [minLevel, setMinLevel] = useState('');
  const [maxLevel, setMaxLevel] = useState('');
  const [sort, setSort] = useState<SkillChartsSort>('level_asc');
  const [showAbout, setShowAbout] = useState(true);

  const minNum = parseInt(minLevel, 10) || 0;
  const maxNum = parseInt(maxLevel, 10) || 0;
  const rangeInvalid = !!(minLevel && maxLevel && minNum > maxNum);

  const queryParams: SkillQueryParams = {
    mode,
    minLevel,
    maxLevel,
    sort,
    userId: user?.id,
  };

  const skillQuery = useQuery({
    queryKey: SKILL_QUERY_KEY(slug, queryParams),
    queryFn: () => songsApi.skillCharts(slug, {
      mode,
      min_level: minLevel || undefined,
      max_level: maxLevel || undefined,
      sort,
      user_id: user?.id,
    }),
    enabled: !!slug && !rangeInvalid,
    staleTime: 60 * 1000,
  });

  const data: SkillChartsResponse | undefined = skillQuery.data;
  const charts = data?.charts ?? [];
  const skill = data?.skill;

  const grouped = useMemo<ChartGroup[]>(() => {
    const map = new Map<string, ChartGroup>();
    for (const c of charts) {
      const level = parseInt(String(c.level), 10) || 0;
      const m = String(c.mode || '');
      if (!m || level <= 0) continue;
      const key = `${m}|${level}`;
      const grp = map.get(key) ?? { key, mode: m, level, charts: [] };
      grp.charts.push(c);
      map.set(key, grp);
    }
    const groups = Array.from(map.values());
    for (const g of groups) {
      if (sort === 'score_asc') g.charts.sort((a, b) => compareByScore(a, b, 'asc'));
      else if (sort === 'score_desc') g.charts.sort((a, b) => compareByScore(a, b, 'desc'));
      else g.charts.sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }));
    }
    groups.sort((a, b) => {
      const md = modeOrderValue(a.mode) - modeOrderValue(b.mode);
      if (md !== 0) return md;
      return sort === 'level_desc' ? b.level - a.level : a.level - b.level;
    });
    return groups;
  }, [charts, sort]);

  const resetFilters = () => {
    setMode('both');
    setMinLevel('');
    setMaxLevel('');
    setSort('level_asc');
  };

  return (
    <View style={s.container}>
      <Stack.Screen
        options={{
          title: skill?.name || slug,
          headerBackTitle: 'Skills',
        }}
      />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: 8, paddingBottom: (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + 24 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        refreshControl={
          <RefreshControl
            refreshing={skillQuery.isRefetching}
            onRefresh={() => skillQuery.refetch()}
            tintColor={theme.spinner}
          />
        }>
        {/* Skill description */}
        {skill ? (
          <View style={s.aboutCard}>
            <Pressable
              onPress={() => setShowAbout((v) => !v)}
              style={({ pressed }) => [s.aboutHeader, pressed && { opacity: 0.7 }]}>
              <Text style={s.aboutTitle}>About this skill</Text>
              <View style={s.aboutHeaderRight}>
                <Text style={s.aboutCount}>
                  {formatNumber(data?.total_charts ?? 0)} chart{(data?.total_charts ?? 0) === 1 ? '' : 's'}
                </Text>
                <IconSymbol
                  name={showAbout ? 'chevron.left' : 'chevron.right'}
                  size={14}
                  color={theme.textDim}
                />
              </View>
            </Pressable>

            {showAbout ? (
              <View style={s.aboutBody}>
                {Array.isArray(skill.description_segments) && skill.description_segments.length > 0 ? (
                  <SkillDescriptionParagraph segments={skill.description_segments} />
                ) : skill.description_text ? (
                  <Text style={s.aboutText}>{skill.description_text}</Text>
                ) : (
                  <Text style={[s.aboutText, { color: theme.textDim }]}>
                    No PIU Center description available for this skill yet.
                  </Text>
                )}

                {Array.isArray(skill.pattern_images) && skill.pattern_images.length > 0 ? (
                  <View style={s.patternRow}>
                    {skill.pattern_images.map((url) => (
                      <View key={url} style={s.patternBox}>
                        <Image source={{ uri: url }} style={s.patternImg} contentFit="contain" />
                      </View>
                    ))}
                  </View>
                ) : null}

                {skill.source_url ? (
                  <Pressable
                    onPress={() => Linking.openURL(skill.source_url!).catch(() => {})}
                    style={({ pressed }) => [s.sourceLink, pressed && { opacity: 0.7 }]}>
                    <IconSymbol name="link" size={12} color={theme.accent} />
                    <Text style={s.sourceLinkText}>PIU Center reference</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Filter bar */}
        <View style={s.filterCard}>
          <Text style={s.filterLabel}>Mode</Text>
          <View style={s.segmented}>
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setMode(opt.value)}
                  style={({ pressed }) => [
                    s.segment,
                    active && s.segmentActive,
                    pressed && !active && { opacity: 0.7 },
                  ]}>
                  <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.levelRow}>
            <View style={s.levelBox}>
              <Text style={s.filterLabel}>Min level</Text>
              <TextInput
                value={minLevel}
                onChangeText={(v) => setMinLevel(v.replace(/[^0-9]/g, ''))}
                placeholder="—"
                placeholderTextColor={theme.textDim}
                keyboardType="number-pad"
                style={s.levelInput}
                maxLength={2}
              />
            </View>
            <View style={s.levelBox}>
              <Text style={s.filterLabel}>Max level</Text>
              <TextInput
                value={maxLevel}
                onChangeText={(v) => setMaxLevel(v.replace(/[^0-9]/g, ''))}
                placeholder="—"
                placeholderTextColor={theme.textDim}
                keyboardType="number-pad"
                style={s.levelInput}
                maxLength={2}
              />
            </View>
            <Pressable
              onPress={resetFilters}
              style={({ pressed }) => [s.resetBtn, pressed && { opacity: 0.7 }]}>
              <Text style={s.resetText}>Reset</Text>
            </Pressable>
          </View>

          {rangeInvalid ? (
            <Text style={s.warning}>Min level must be ≤ max level</Text>
          ) : null}

          <Text style={s.filterLabel}>Sort</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sortRow}>
            {SORT_OPTIONS.map((opt) => {
              const active = sort === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setSort(opt.value)}
                  style={({ pressed }) => [
                    s.sortChip,
                    active && s.sortChipActive,
                    pressed && !active && { opacity: 0.7 },
                  ]}>
                  <Text style={[s.sortChipText, active && s.sortChipTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Charts */}
        {skillQuery.isLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={theme.spinner} />
          </View>
        ) : skillQuery.isError ? (
          <View style={s.errorCard}>
            <Text style={s.errorText}>
              {skillQuery.error instanceof Error ? skillQuery.error.message : 'Failed to load charts'}
            </Text>
          </View>
        ) : grouped.length === 0 ? (
          <View style={s.center}>
            <Text style={s.emptyText}>No charts match these filters.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {!user ? (
              <Text style={s.muteHint}>
                Sign in to see your best score on each chart.
              </Text>
            ) : null}
            {grouped.map((g) => (
              <ChartGroupCard
                key={g.key}
                group={g}
                onPressChart={(chart) =>
                  router.push({ pathname: '/song/[id]', params: { id: String(chart.chart_id) } })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Description paragraph: inline text + arrow images
// ---------------------------------------------------------------------------
function SkillDescriptionParagraph({ segments }: { segments: SkillDescriptionSegment[] }) {
  const s = useThemedStyles(makeStyles);
  return (
    <Text style={s.aboutText}>
      {segments.map((seg, i) => {
        if (seg.type === 'image' && seg.url) {
          return (
            <Image
              key={`img-${i}`}
              source={{ uri: seg.url }}
              style={s.inlineArrow}
              contentFit="contain"
            />
          );
        }
        return (
          <Text key={`txt-${i}`}>{seg.text || ''}</Text>
        );
      })}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Group card per (mode, level)
// ---------------------------------------------------------------------------
function ChartGroupCard({
  group,
  onPressChart,
}: {
  group: ChartGroup;
  onPressChart: (chart: SkillChart) => void;
}) {
  const s = useThemedStyles(makeGroupStyles);
  const { theme } = useTheme();

  const passCount = group.charts.filter((c) => c.is_pass).length;
  const totalScored = group.charts.filter((c) => Number.isFinite(c.best_score) && !c.is_stage_break).length;

  const isSingle = group.mode === 'Single';
  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={[s.modePill, isSingle ? s.modePillSingle : s.modePillDouble]}>
          <Text style={s.modePillLetter}>{isSingle ? 'S' : 'D'}</Text>
          <Text style={s.modePillLevel}>{group.level}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>
            {isSingle ? 'Singles' : 'Doubles'} · Lv. {group.level}
          </Text>
          <Text style={s.headerMeta}>
            {group.charts.length} chart{group.charts.length === 1 ? '' : 's'}
            {totalScored > 0 ? ` · ${passCount}/${group.charts.length} passed` : ''}
          </Text>
        </View>
      </View>

      <View style={s.grid}>
        {group.charts.map((chart) => {
          const result = formatChartResult(chart);
          const jacket = fullImageUrl(chart.jacket_url);
          return (
            <Pressable
              key={chart.chart_id}
              onPress={() => onPressChart(chart)}
              style={({ pressed }) => [s.chartTile, pressed && { opacity: 0.85 }]}>
              <View style={s.chartJacketWrap}>
                {jacket ? (
                  <Image source={{ uri: jacket }} style={s.chartJacket} contentFit="cover" transition={120} />
                ) : (
                  <View style={[s.chartJacket, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface }]}>
                    <Text style={{ color: theme.textDim, fontSize: 16, fontWeight: '900' }}>
                      {(chart.title || '?').charAt(0)}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.chartTitle} numberOfLines={1}>{chart.title}</Text>
                <Text style={[s.chartResult, { color: result.color }]} numberOfLines={1}>
                  {result.text}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { paddingHorizontal: 12, gap: 12 },

  aboutCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  aboutHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aboutTitle: { fontSize: 11, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  aboutHeaderRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  aboutCount: { fontSize: 11, color: t.textMuted, fontWeight: '700' as const },
  aboutBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  aboutText: { fontSize: 13, color: t.text, lineHeight: 22 },
  inlineArrow: { width: 24, height: 24, marginHorizontal: 1 },
  patternRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  patternBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: t.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  patternImg: { width: 36, height: 36 },
  sourceLink: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: t.accentTint,
  },
  sourceLinkText: { fontSize: 11, fontWeight: '800' as const, color: t.accent },

  filterCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 8,
  },
  filterLabel: { fontSize: 10, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.4, textTransform: 'uppercase' as const, marginTop: 2 },

  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center' as const, borderRadius: 999 },
  segmentActive: { backgroundColor: t.bg },
  segmentText: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
  segmentTextActive: { color: t.accent },

  levelRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 8 },
  levelBox: { flex: 1, gap: 4 },
  levelInput: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: t.text,
    fontSize: 14,
    fontWeight: '800' as const,
    fontVariant: ['tabular-nums' as const],
  },
  resetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  resetText: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  warning: { fontSize: 11, color: '#fbbf24', marginTop: 2 },

  sortRow: { gap: 6, paddingRight: 6 },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  sortChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  sortChipText: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted },
  sortChipTextActive: { color: t.accent },

  center: { padding: 32, alignItems: 'center' as const },
  errorCard: { backgroundColor: t.dangerBg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: t.dangerBorder },
  errorText: { color: t.danger, fontSize: 13 },
  emptyText: { color: t.textDim, fontSize: 13 },
  muteHint: { fontSize: 11, color: t.textDim, paddingHorizontal: 4 },
});

const makeGroupStyles = (t: ThemeColors) => ({
  card: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
    gap: 8,
  },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  headerTitle: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  headerMeta: { fontSize: 10, color: t.textDim, marginTop: 2 },
  modePill: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 2,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 38,
    justifyContent: 'center' as const,
  },
  modePillSingle: { backgroundColor: 'rgba(217,61,98,0.85)' },
  modePillDouble: { backgroundColor: 'rgba(22,183,127,0.85)' },
  modePillLetter: { color: '#fff', fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.4 },
  modePillLevel: { color: '#fff', fontSize: 13, fontWeight: '900' as const, letterSpacing: 0.4, fontVariant: ['tabular-nums' as const] },

  grid: { gap: 6 },
  chartTile: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    padding: 8,
  },
  chartJacketWrap: { width: 52, height: 30, borderRadius: 6, overflow: 'hidden' as const, backgroundColor: t.surface },
  chartJacket: { width: '100%' as const, height: '100%' as const },
  chartTitle: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  chartResult: { fontSize: 11, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
});

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';
import type { SkillCatalogEntry } from '@shared/api';

const SKILLS_META_QUERY_KEY = ['skills-meta'] as const;

type SortKey = 'alpha' | 'most' | 'fewest';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'alpha', label: 'A → Z' },
  { value: 'most', label: 'Most charts' },
  { value: 'fewest', label: 'Fewest' },
];

function applySort(skills: SkillCatalogEntry[], sort: SortKey): SkillCatalogEntry[] {
  const copy = [...skills];
  switch (sort) {
    case 'most':
      return copy.sort((a, b) => b.chart_count - a.chart_count || a.name.localeCompare(b.name));
    case 'fewest':
      return copy.sort((a, b) => a.chart_count - b.chart_count || a.name.localeCompare(b.name));
    case 'alpha':
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
}

function formatNumber(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString();
}

function coverageRatio(meta: { total_charts: number; charts_with_skills: number } | undefined): number {
  if (!meta?.total_charts) return 0;
  return Math.max(0, Math.min(1, meta.charts_with_skills / meta.total_charts));
}

export default function SkillsIndexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('most');

  const skillsQuery = useQuery({
    queryKey: SKILLS_META_QUERY_KEY,
    queryFn: () => songsApi.skillsMeta(),
    staleTime: 10 * 60 * 1000,
  });

  const skills = skillsQuery.data?.skills ?? [];
  const totals = skillsQuery.data?.totals;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? skills.filter((sk) => sk.name.toLowerCase().includes(q) || sk.slug.toLowerCase().includes(q))
      : skills;
    return applySort(list, sort);
  }, [skills, query, sort]);

  const coverPct = coverageRatio(totals);

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={skillsQuery.isRefetching}
            onRefresh={() => skillsQuery.refetch()}
            tintColor={theme.spinner}
          />
        }>
        <Text style={s.subtitle}>
          PIU Center skill tags. Tap one to see every chart that uses it.
        </Text>

        {/* Coverage card */}
        {totals ? (
          <View style={s.coverageCard}>
            <View style={s.coverageRow}>
              <View style={s.coverageBig}>
                <Text style={s.coverageNum}>{formatNumber(totals.charts_with_skills)}</Text>
                <Text style={s.coverageCaption}>tagged · {Math.round(coverPct * 100)}%</Text>
              </View>
              <View style={s.coverageStack}>
                <View style={s.coverageMini}>
                  <Text style={s.coverageMiniLabel}>Eligible</Text>
                  <Text style={s.coverageMiniValue}>{formatNumber(totals.total_charts)}</Text>
                </View>
                <View style={s.coverageMini}>
                  <Text style={s.coverageMiniLabel}>Missing</Text>
                  <Text style={[s.coverageMiniValue, { color: '#fbbf24' }]}>{formatNumber(totals.charts_missing_skills)}</Text>
                </View>
              </View>
            </View>
            <View style={s.coverageBar}>
              <View style={[s.coverageBarFill, { width: `${Math.round(coverPct * 100)}%` }]} />
            </View>
            <Text style={s.coverageHint}>
              Counts cover Singles ≥ 7 and Doubles ≥ 10, where PIU Center actively tags skills.
            </Text>
          </View>
        ) : null}

        {/* Search */}
        <View style={s.searchRow}>
          <IconSymbol name="magnifyingglass" size={16} color={theme.textDim} />
          <TextInput
            placeholder="Search skills (e.g. bracket, twist, run)"
            placeholderTextColor={theme.textDim}
            value={query}
            onChangeText={setQuery}
            style={s.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <IconSymbol name="xmark" size={14} color={theme.textDim} />
            </Pressable>
          ) : null}
        </View>

        {/* Sort row */}
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

        {/* Loading */}
        {skillsQuery.isLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={theme.spinner} />
          </View>
        ) : skillsQuery.isError ? (
          <View style={s.errorCard}>
            <Text style={s.errorText}>
              {skillsQuery.error instanceof Error ? skillsQuery.error.message : 'Failed to load skills'}
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.center}>
            <Text style={s.emptyText}>No skills match “{query.trim()}”.</Text>
          </View>
        ) : (
          <View style={s.list}>
            {filtered.map((sk) => (
              <SkillRow
                key={sk.slug}
                skill={sk}
                maxCount={Math.max(1, ...filtered.map((x) => x.chart_count))}
                onPress={() => router.push({ pathname: '/skill/[slug]', params: { slug: sk.slug } })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Single skill row — name, chart-count chip, animated bar showing relative size
// ---------------------------------------------------------------------------
function SkillRow({
  skill,
  maxCount,
  onPress,
}: {
  skill: SkillCatalogEntry;
  maxCount: number;
  onPress: () => void;
}) {
  const s = useThemedStyles(makeRowStyles);
  const { theme } = useTheme();
  const ratio = maxCount > 0 ? skill.chart_count / maxCount : 0;
  const isEmpty = skill.chart_count === 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }, isEmpty && { opacity: 0.55 }]}>
      <View style={s.bar}>
        <View
          style={[
            s.barFill,
            { width: `${Math.max(2, ratio * 100)}%`, backgroundColor: isEmpty ? 'transparent' : theme.accentTint },
          ]}
        />
      </View>
      <View style={s.content}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.name}>{skill.name}</Text>
          <Text style={s.slug}>{skill.slug}</Text>
        </View>
        <View style={[s.countChip, isEmpty ? s.countChipEmpty : s.countChipActive]}>
          <Text style={[s.countText, isEmpty ? s.countTextEmpty : s.countTextActive]}>
            {skill.chart_count}
          </Text>
          <Text style={[s.countCaption, isEmpty && s.countTextEmpty]}>
            chart{skill.chart_count === 1 ? '' : 's'}
          </Text>
        </View>
        <IconSymbol name="chevron.right" size={16} color={theme.textDim} />
      </View>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 1 },
  scroll: { paddingHorizontal: 12, gap: 12 },
  subtitle: { fontSize: 12, color: t.textDim, marginBottom: 2 },

  coverageCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 10,
  },
  coverageRow: { flexDirection: 'row' as const, gap: 14, alignItems: 'center' as const },
  coverageBig: { flex: 1, gap: 2 },
  coverageNum: { fontSize: 26, fontWeight: '900' as const, color: t.text, letterSpacing: 0.5 },
  coverageCaption: { fontSize: 11, color: t.textMuted, fontWeight: '700' as const },
  coverageStack: { gap: 4 },
  coverageMini: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 6,
    minWidth: 110,
    justifyContent: 'space-between' as const,
  },
  coverageMiniLabel: { fontSize: 10, color: t.textDim, letterSpacing: 0.5, textTransform: 'uppercase' as const, fontWeight: '800' as const },
  coverageMiniValue: { fontSize: 13, color: t.text, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  coverageBar: { height: 5, borderRadius: 3, backgroundColor: t.surfaceMuted, overflow: 'hidden' as const },
  coverageBarFill: { height: '100%' as const, borderRadius: 3, backgroundColor: t.accent },
  coverageHint: { fontSize: 10, color: t.textDim },

  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: t.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: t.text, fontSize: 14, padding: 0 },

  sortRow: { gap: 6, paddingRight: 6, paddingBottom: 2 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  sortChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  sortChipText: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
  sortChipTextActive: { color: t.accent },

  list: { gap: 6 },
  center: { padding: 32, alignItems: 'center' as const },
  errorCard: { backgroundColor: t.dangerBg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: t.dangerBorder },
  errorText: { color: t.danger, fontSize: 13 },
  emptyText: { color: t.textDim, fontSize: 13 },
});

const makeRowStyles = (t: ThemeColors) => ({
  row: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  bar: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  barFill: { height: '100%' as const },
  content: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 1,
  },
  name: { fontSize: 14, fontWeight: '800' as const, color: t.text, textTransform: 'capitalize' as const },
  slug: { fontSize: 10, color: t.textDim, fontWeight: '600' as const },
  countChip: {
    minWidth: 56,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  countChipActive: { backgroundColor: t.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: t.accent },
  countChipEmpty: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  countText: { fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  countTextActive: { color: t.accent },
  countTextEmpty: { color: t.textDim },
  countCaption: { fontSize: 9, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 0.4 },
});

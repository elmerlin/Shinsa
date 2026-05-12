import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartBadge } from '@/components/chart-badge';
import { ChartJacket } from '@/components/chart-jacket';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { AddListItemPayload, Chart, SongLibraryItem, UserList } from '@shared/api';

const LISTS_QUERY_KEY = ['user-lists'] as const;

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Multi-select chart picker. Uses the same songs library endpoint as the
 * Songs tab but lets the user toggle individual charts on/off and submits
 * them in one transaction via `bulkAddListItems`.
 */
export default function BulkAddScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = Number(id || 0);
  const { theme } = useTheme();
  const { user } = useAuth();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 250);
  const [selected, setSelected] = useState<Map<number, AddListItemPayload>>(new Map());

  // Library: every song with all its charts (mode/level combos).
  const libraryQuery = useQuery({
    queryKey: ['songs-library', user?.id ?? null],
    queryFn: () => songsApi.library(user?.id ? { user_id: user.id } : {}),
  });

  // Existing list contents — used to disable already-added charts so the
  // user can't pick them again (the server would 409, but it reads better
  // when the rows are clearly marked).
  const listsQuery = useQuery({
    queryKey: LISTS_QUERY_KEY,
    queryFn: () => songsApi.lists(),
  });
  const existingChartIds = useMemo(() => {
    const list = listsQuery.data?.lists.find((l: UserList) => Number(l.id) === listId);
    if (!list) return new Set<number>();
    return new Set(list.items.map((it) => it.chartId));
  }, [listsQuery.data, listId]);

  const submitMutation = useMutation({
    mutationFn: (items: AddListItemPayload[]) => songsApi.bulkAddListItems(listId, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
      router.back();
    },
  });

  const filteredSongs = useMemo(() => {
    const all = libraryQuery.data?.songs ?? [];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((song) => {
      return (song.title || '').toLowerCase().includes(q)
        || (song.artist || '').toLowerCase().includes(q);
    });
  }, [libraryQuery.data, debouncedSearch]);

  const toggleChart = (song: SongLibraryItem, chart: Chart) => {
    if (existingChartIds.has(chart.chart_id)) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(chart.chart_id)) {
        next.delete(chart.chart_id);
      } else {
        next.set(chart.chart_id, {
          chartId: chart.chart_id,
          songTitle: chart.title || song.title || '',
          artist: chart.artist || song.artist || '',
          mode: chart.mode || '',
          level: chart.level || 0,
          jacketUrl: chart.jacket_url || song.jacket_url || '',
          target: 'PASS',
          addedAt: Date.now(),
        });
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size === 0 || submitMutation.isPending) return;
    submitMutation.mutate(Array.from(selected.values()));
  };

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: 'Add charts' }} />

      <View style={s.searchRow}>
        <TextInput
          style={s.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search title or artist…"
          placeholderTextColor={theme.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {libraryQuery.isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : libraryQuery.isError ? (
        <View style={s.center}>
          <Text style={s.errorText}>
            {libraryQuery.error instanceof Error ? libraryQuery.error.message : 'Failed to load songs'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSongs}
          keyExtractor={(song) => song.song_group_key}
          renderItem={({ item }) => (
            <SongRow
              song={item}
              s={s}
              theme={theme}
              selectedChartIds={selected}
              existingChartIds={existingChartIds}
              onToggle={toggleChart}
            />
          )}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={() => (
            <Text style={s.empty}>{debouncedSearch ? 'No songs match your search.' : 'No songs available.'}</Text>
          )}
        />
      )}

      {selected.size > 0 ? (
        <View style={[s.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={() => setSelected(new Map())}
            disabled={submitMutation.isPending}
            style={({ pressed }) => [s.clearBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.clearBtnText}>Clear</Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            disabled={submitMutation.isPending}
            style={({ pressed }) => [
              s.submitBtn,
              submitMutation.isPending && { opacity: 0.6 },
              pressed && { opacity: 0.85 },
            ]}>
            {submitMutation.isPending ? (
              <ActivityIndicator color={theme.bg} size="small" />
            ) : (
              <>
                <IconSymbol name="checkmark" size={16} color={theme.bg} />
                <Text style={s.submitBtnText}>Add {selected.size} chart{selected.size === 1 ? '' : 's'}</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {submitMutation.isError ? (
        <View style={[s.errorBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={s.errorText}>
            {submitMutation.error instanceof Error ? submitMutation.error.message : 'Failed to add'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function SongRow({
  song,
  s,
  theme,
  selectedChartIds,
  existingChartIds,
  onToggle,
}: {
  song: SongLibraryItem;
  s: Styles;
  theme: ThemeColors;
  selectedChartIds: Map<number, AddListItemPayload>;
  existingChartIds: Set<number>;
  onToggle: (song: SongLibraryItem, chart: Chart) => void;
}) {
  const jacket = fullImageUrl(song.jacket_url);
  const sortedCharts = [...(song.charts || [])].sort((a, b) => {
    const modeOrder: Record<string, number> = { Single: 0, Double: 1, CoOp: 2, UCS: 3 };
    const am = modeOrder[a.mode || ''] ?? 9;
    const bm = modeOrder[b.mode || ''] ?? 9;
    if (am !== bm) return am - bm;
    return (a.level ?? 0) - (b.level ?? 0);
  });

  return (
    <View style={s.song}>
      <View style={s.songHeader}>
        {jacket ? <ChartJacket jacketUrl={jacket} mode="" level="" size="md" withBadge={false} /> : null}
        <View style={s.songMain}>
          <Text style={s.songTitle} numberOfLines={1}>{song.title}</Text>
          {song.artist ? <Text style={s.songArtist} numberOfLines={1}>{song.artist}</Text> : null}
        </View>
      </View>
      <View style={s.chartsRow}>
        {sortedCharts.map((chart) => {
          const inList = existingChartIds.has(chart.chart_id);
          const isSelected = selectedChartIds.has(chart.chart_id);
          return (
            <Pressable
              key={chart.chart_id}
              onPress={() => onToggle(song, chart)}
              disabled={inList}
              hitSlop={6}
              style={({ pressed }) => [
                s.chartChip,
                isSelected && s.chartChipSelected,
                inList && s.chartChipDisabled,
                pressed && !inList && { opacity: 0.7 },
              ]}>
              <ChartBadge mode={chart.mode} level={chart.level} size="md" />
              {inList ? (
                <View style={s.chartChipBadge}>
                  <IconSymbol name="checkmark" size={10} color={theme.textDim} />
                </View>
              ) : isSelected ? (
                <View style={[s.chartChipBadge, s.chartChipBadgeSelected]}>
                  <IconSymbol name="checkmark" size={10} color={theme.bg} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  searchRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  search: {
    backgroundColor: t.card,
    color: t.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  center: { padding: 32, alignItems: 'center' as const },
  empty: { padding: 32, color: t.textMuted, textAlign: 'center' as const, fontSize: 14 },
  errorText: { color: t.danger, fontSize: 14, textAlign: 'center' as const },

  separator: { height: 8 },

  song: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  songHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  songMain: { flex: 1, gap: 2 },
  songTitle: { fontSize: 14, fontWeight: '700' as const, color: t.text },
  songArtist: { fontSize: 11, color: t.textMuted },
  chartsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, paddingLeft: 60 },

  chartChip: {
    position: 'relative' as const,
    padding: 2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chartChipSelected: { borderColor: t.accent, backgroundColor: 'rgba(255, 255, 255, 0.04)' },
  chartChipDisabled: { opacity: 0.4 },
  chartChipBadge: {
    position: 'absolute' as const,
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.surfaceMuted,
    borderWidth: 2,
    borderColor: t.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chartChipBadgeSelected: { backgroundColor: t.accent },

  actionBar: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: t.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: t.surfaceMuted,
  },
  clearBtnText: { fontSize: 14, fontWeight: '700' as const, color: t.text },
  submitBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: t.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  submitBtnText: { color: t.bg, fontSize: 15, fontWeight: '800' as const },

  errorBar: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: t.dangerBg,
  },
});

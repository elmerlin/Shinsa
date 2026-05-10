import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartBadge } from '@/components/chart-badge';
import { ChartJacket } from '@/components/chart-jacket';
import { HamburgerButton } from '@/components/hamburger-button';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Chart, SongLibraryItem } from '@shared/api';

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function SongRow({ song, onChartPress, s }: {
  song: SongLibraryItem;
  onChartPress: (chart: Chart) => void;
  s: Styles;
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
        {sortedCharts.map((chart) => (
          <Pressable
            key={chart.chart_id}
            onPress={() => onChartPress(chart)}
            hitSlop={6}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <ChartBadge mode={chart.mode} level={chart.level} size="md" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function SongsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();
  const s = useThemedStyles(makeStyles);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 250);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['songs-library', user?.id ?? null],
    queryFn: () => songsApi.library(user?.id ? { user_id: user.id } : {}),
  });

  const filtered = useMemo(() => {
    const all = data?.songs ?? [];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((song) => {
      const titleMatch = (song.title || '').toLowerCase().includes(q);
      const artistMatch = (song.artist || '').toLowerCase().includes(q);
      return titleMatch || artistMatch;
    });
  }, [data, debouncedSearch]);

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <HamburgerButton />
        <Text style={s.heading}>Songs</Text>
      </View>
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

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={theme.spinner} />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error instanceof Error ? error.message : 'Failed to load songs'}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(song) => song.song_group_key}
          renderItem={({ item }) => (
            <SongRow
              song={item}
              s={s}
              onChartPress={(chart) =>
                router.push({ pathname: '/song/[id]', params: { id: String(chart.chart_id) } })
              }
            />
          )}
          contentContainerStyle={{ paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={() => (
            <Text style={s.empty}>{debouncedSearch ? 'No songs match your search.' : 'No songs found.'}</Text>
          )}
          ListHeaderComponent={() =>
            data ? (
              <Text style={s.totalLine}>
                {data.total_songs} songs · {data.total_charts} charts
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  heading: { flex: 1, fontSize: 28, fontWeight: '800' as const, color: t.text, letterSpacing: 2 },
  searchRow: { paddingHorizontal: 16, paddingBottom: 8 },
  search: {
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  totalLine: { fontSize: 11, color: t.textDim, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  song: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  songHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  songMain: { flex: 1, gap: 2, minWidth: 0 },
  songTitle: { fontSize: 15, fontWeight: '700' as const, color: t.text },
  songArtist: { fontSize: 12, color: t.textMuted },
  chartsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, paddingLeft: 0 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginHorizontal: 14 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  empty: { textAlign: 'center' as const, padding: 32, color: t.textDim },
  errorText: { color: t.danger, textAlign: 'center' as const },
});

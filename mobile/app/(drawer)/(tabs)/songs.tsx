import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartBadge } from '@/components/chart-badge';
import { ChartJacket } from '@/components/chart-jacket';
import { TopBar } from '@/components/top-bar';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
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

/** Compact list row used by the desktop master pane — denser than SongRow. */
function SongListRow({
  song,
  active,
  onPress,
  s,
}: {
  song: SongLibraryItem;
  active: boolean;
  onPress: () => void;
  s: Styles;
}) {
  const jacket = fullImageUrl(song.jacket_url);
  const chartCount = song.charts?.length ?? 0;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => undefined}
      onHoverOut={() => undefined}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.deskListRow,
        hovered && !active && s.deskListRowHover,
        active && s.deskListRowActive,
        pressed && { opacity: 0.85 },
      ]}>
      {jacket ? (
        <Image source={{ uri: jacket }} style={s.deskListThumb} contentFit="cover" />
      ) : (
        <View style={[s.deskListThumb, s.deskListThumbFallback]} />
      )}
      <View style={s.deskListMain}>
        <Text style={[s.deskListTitle, active && s.deskListTitleActive]} numberOfLines={1}>
          {song.title}
        </Text>
        {song.artist ? (
          <Text style={s.deskListArtist} numberOfLines={1}>
            {song.artist}
          </Text>
        ) : null}
      </View>
      <Text style={s.deskListChartCount}>{chartCount}</Text>
    </Pressable>
  );
}

/** Right pane — selected song's jacket + chart-difficulty grid + open link. */
function SongDetailPane({
  song,
  onChartPress,
  s,
}: {
  song: SongLibraryItem | null;
  onChartPress: (chart: Chart) => void;
  s: Styles;
}) {
  const { theme } = useTheme();
  if (!song) {
    return (
      <View style={s.deskEmpty}>
        <Text style={s.deskEmptyTitle}>Select a song</Text>
        <Text style={s.deskEmptyHint}>
          Pick a song from the list to see its charts, your scores, and the leaderboard.
        </Text>
      </View>
    );
  }
  const jacket = fullImageUrl(song.jacket_url);
  const sortedCharts = [...(song.charts || [])].sort((a, b) => {
    const modeOrder: Record<string, number> = { Single: 0, Double: 1, CoOp: 2, UCS: 3 };
    const am = modeOrder[a.mode || ''] ?? 9;
    const bm = modeOrder[b.mode || ''] ?? 9;
    if (am !== bm) return am - bm;
    return (a.level ?? 0) - (b.level ?? 0);
  });

  return (
    <ScrollView style={s.deskDetailScroll} contentContainerStyle={s.deskDetailContent}>
      <View style={s.deskHeroRow}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.deskHeroJacket} contentFit="cover" />
        ) : (
          <View style={[s.deskHeroJacket, { backgroundColor: theme.surfaceMuted }]} />
        )}
        <View style={s.deskHeroText}>
          <Text style={s.deskHeroTitle} numberOfLines={2}>
            {song.title}
          </Text>
          {song.artist ? (
            <Text style={s.deskHeroArtist} numberOfLines={2}>
              {song.artist}
            </Text>
          ) : null}
          <Text style={s.deskHeroMeta}>
            {sortedCharts.length} chart{sortedCharts.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <View style={s.deskSection}>
        <Text style={s.deskSectionLabel}>Charts</Text>
        <Text style={s.deskSectionHint}>Click a chart to see your scores, leaderboard, and replay.</Text>
        <View style={s.deskChartGrid}>
          {sortedCharts.map((chart) => (
            <Pressable
              key={chart.chart_id}
              onPress={() => onChartPress(chart)}
              onHoverIn={() => undefined}
              onHoverOut={() => undefined}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                s.deskChartCell,
                hovered && { backgroundColor: theme.surfaceMuted },
                pressed && { opacity: 0.7 },
              ]}>
              <ChartBadge mode={chart.mode} level={chart.level} size="md" />
              <Text style={s.deskChartCellLabel} numberOfLines={1}>
                {chart.mode} {chart.level}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

/** Desktop variant — master–detail with keyboard nav. */
function SongsDesktop({
  songs,
  isLoading,
  isError,
  error,
  totalSongs,
  totalCharts,
  s,
}: {
  songs: SongLibraryItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  totalSongs: number;
  totalCharts: number;
  s: Styles;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ q?: string; selected?: string }>();
  const initialQ = typeof params.q === 'string' ? params.q : '';
  const initialSelected = typeof params.selected === 'string' ? params.selected : '';

  const [search, setSearch] = useState(initialQ);
  const debouncedSearch = useDebounced(search, 250);
  const searchRef = useRef<TextInput>(null);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((song) => {
      const titleMatch = (song.title || '').toLowerCase().includes(q);
      const artistMatch = (song.artist || '').toLowerCase().includes(q);
      return titleMatch || artistMatch;
    });
  }, [songs, debouncedSearch]);

  // Keep `selected` valid against the filtered list — if the user types and
  // the currently selected song falls out, point at the new first row.
  const [selectedKey, setSelectedKey] = useState(initialSelected);
  useEffect(() => {
    if (filtered.length === 0) return;
    const hit = filtered.find((song) => song.song_group_key === selectedKey);
    if (!hit) setSelectedKey(filtered[0]?.song_group_key ?? '');
  }, [filtered, selectedKey]);

  // Mirror selection into the URL so reload + back/forward survive.
  useEffect(() => {
    if (!selectedKey) return;
    router.setParams({ selected: selectedKey });
  }, [selectedKey, router]);

  const selectedSong = useMemo(
    () => filtered.find((song) => song.song_group_key === selectedKey) ?? null,
    [filtered, selectedKey],
  );

  // Keyboard nav: /, J/K, Enter. Web only — these don't fire on native.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || el.isContentEditable) return true;
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      // `/` focuses the search field regardless of where focus is currently —
      // unless the user is already typing in another text field.
      if (e.key === '/' && !isEditable(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isEditable(e.target)) return;
      const idx = filtered.findIndex((song) => song.song_group_key === selectedKey);
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = filtered[Math.min(filtered.length - 1, Math.max(0, idx) + 1)];
        if (next) setSelectedKey(next.song_group_key);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = filtered[Math.max(0, idx - 1)];
        if (next) setSelectedKey(next.song_group_key);
      } else if (e.key === 'Enter') {
        const song = filtered.find((s) => s.song_group_key === selectedKey);
        const firstChart = song?.charts?.[0];
        if (firstChart) {
          e.preventDefault();
          router.push({ pathname: '/song/[id]', params: { id: String(firstChart.chart_id) } });
        }
      } else if (e.key === 'Escape') {
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, selectedKey, router]);

  return (
    <View style={s.deskRoot}>
      <View style={s.deskTopBar}>
        <Text style={s.deskHeading}>Songs</Text>
        <TopBar />
      </View>
      <View style={s.deskBody}>
        <View style={s.deskMaster}>
          <View style={s.deskSearchWrap}>
            <TextInput
              ref={searchRef}
              style={s.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search title or artist  ·  /"
              placeholderTextColor={theme.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            <Text style={s.deskMasterMeta}>
              {filtered.length} of {totalSongs} songs · {totalCharts} charts
            </Text>
          </View>

          {isLoading ? (
            <View style={s.center}>
              <ActivityIndicator color={theme.spinner} />
            </View>
          ) : isError ? (
            <View style={s.center}>
              <Text style={s.errorText}>
                {error instanceof Error ? error.message : 'Failed to load songs'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(song) => song.song_group_key}
              renderItem={({ item }) => (
                <SongListRow
                  song={item}
                  s={s}
                  active={item.song_group_key === selectedKey}
                  onPress={() => setSelectedKey(item.song_group_key)}
                />
              )}
              contentContainerStyle={s.deskListContent}
              ListEmptyComponent={() => (
                <Text style={s.empty}>
                  {debouncedSearch ? 'No songs match your search.' : 'No songs found.'}
                </Text>
              )}
            />
          )}
        </View>

        <View style={s.deskDetail}>
          <SongDetailPane
            song={selectedSong}
            s={s}
            onChartPress={(chart) =>
              router.push({ pathname: '/song/[id]', params: { id: String(chart.chart_id) } })
            }
          />
        </View>
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
  const { isDesktop } = useBreakpoint();
  const params = useLocalSearchParams<{ q?: string }>();
  const initialQ = typeof params.q === 'string' ? params.q : '';
  const [search, setSearch] = useState(initialQ);
  useEffect(() => {
    if (initialQ) setSearch(initialQ);
  }, [initialQ]);
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

  if (isDesktop) {
    return (
      <SongsDesktop
        songs={data?.songs ?? []}
        isLoading={isLoading}
        isError={isError}
        error={error}
        totalSongs={data?.total_songs ?? 0}
        totalCharts={data?.total_charts ?? 0}
        s={s}
      />
    );
  }

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TopBar />
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

  // Desktop ("deskX") master–detail layout.
  deskRoot: { flex: 1, backgroundColor: t.bg },
  deskTopBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  deskHeading: { fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 0.5 },
  deskBody: { flex: 1, flexDirection: 'row' as const },

  // Master pane (~40%).
  deskMaster: {
    width: '40%' as const,
    minWidth: 280,
    maxWidth: 480,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border,
  },
  deskSearchWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  deskMasterMeta: { fontSize: 11, color: t.textDim, letterSpacing: 0.4 },
  deskListContent: { paddingVertical: 4, paddingHorizontal: 8, gap: 0 },
  deskListRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
  },
  deskListRowHover: { backgroundColor: t.surfaceMuted },
  deskListRowActive: { backgroundColor: t.accentTint },
  deskListThumb: { width: 36, height: 36, borderRadius: 6 },
  deskListThumbFallback: { backgroundColor: t.surfaceMuted },
  deskListMain: { flex: 1, minWidth: 0, gap: 1 },
  deskListTitle: { fontSize: 13.5, fontWeight: '700' as const, color: t.text },
  deskListTitleActive: { color: t.accent, fontWeight: '800' as const },
  deskListArtist: { fontSize: 11, color: t.textMuted },
  deskListChartCount: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: t.textDim,
    fontVariant: ['tabular-nums' as const],
    minWidth: 18,
    textAlign: 'right' as const,
  },

  // Detail pane (~60%).
  deskDetail: { flex: 1 },
  deskDetailScroll: { flex: 1 },
  deskDetailContent: { padding: 24, gap: 20, paddingBottom: 48 },
  deskHeroRow: { flexDirection: 'row' as const, gap: 18, alignItems: 'flex-start' as const },
  deskHeroJacket: { width: 160, height: 160, borderRadius: 10 },
  deskHeroText: { flex: 1, gap: 6 },
  deskHeroTitle: { fontSize: 24, fontWeight: '800' as const, color: t.text, letterSpacing: 0.5 },
  deskHeroArtist: { fontSize: 14, color: t.textMuted },
  deskHeroMeta: { fontSize: 12, color: t.textDim, marginTop: 4, letterSpacing: 0.4 },
  deskSection: { gap: 10 },
  deskSectionLabel: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.6,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  deskSectionHint: { fontSize: 12, color: t.textMuted },
  deskChartGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 4,
  },
  deskChartCell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  deskChartCellLabel: { fontSize: 12, fontWeight: '700' as const, color: t.text },

  deskEmpty: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 32,
    gap: 6,
  },
  deskEmptyTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  deskEmptyHint: { fontSize: 13, color: t.textMuted, textAlign: 'center' as const, maxWidth: 320 },
});

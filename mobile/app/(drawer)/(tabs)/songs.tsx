import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getGradeDisplayLabel } from '@/lib/grades';
import { fullImageUrl } from '@/lib/images';
import { IconSymbol } from '@/components/ui/icon-symbol';
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

const MODE_ORDER_MAP: Record<string, number> = { Single: 0, Double: 1, CoOp: 2, UCS: 3 };

/**
 * Per-row renderer for the Songs FlatList.
 *
 * Memoized — the list can hold 1000+ rows on a synced account, and without
 * memo every scroll-triggered re-render walked the whole tree (including
 * the per-row chart sort). With React.memo + a stable `onChartPress` from
 * the parent (useCallback) only rows whose `song` prop actually changes
 * re-render — typically zero on a scroll tick.
 */
const SongRow = memo(function SongRow({ song, onChartPress, s }: {
  song: SongLibraryItem;
  onChartPress: (chart: Chart) => void;
  s: Styles;
}) {
  const jacket = fullImageUrl(song.jacket_url);
  // Sort once per song (cheap), memoized so re-renders skip the spread+sort.
  const sortedCharts = useMemo(() => {
    return [...(song.charts || [])].sort((a, b) => {
      const am = MODE_ORDER_MAP[a.mode || ''] ?? 9;
      const bm = MODE_ORDER_MAP[b.mode || ''] ?? 9;
      if (am !== bm) return am - bm;
      return (a.level ?? 0) - (b.level ?? 0);
    });
  }, [song.charts]);

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
          <ChartBadgeButton
            key={chart.chart_id}
            chart={chart}
            onChartPress={onChartPress}
          />
        ))}
      </View>
    </View>
  );
});

/** Memoized chart badge button — stable `chart` identity means no
 *  re-render when sibling rows change. */
const ChartBadgeButton = memo(function ChartBadgeButton({
  chart,
  onChartPress,
}: {
  chart: Chart;
  onChartPress: (chart: Chart) => void;
}) {
  const handlePress = useCallback(() => onChartPress(chart), [onChartPress, chart]);
  return (
    <Pressable
      onPress={handlePress}
      hitSlop={6}
      style={pressableOpacityStyle}>
      <ChartBadge mode={chart.mode} level={chart.level} size="md" />
    </Pressable>
  );
});

const pressableOpacityStyle = ({ pressed }: { pressed: boolean }) =>
  pressed ? { opacity: 0.7 } : null;

/** Compact list row used by the desktop master pane — denser than SongRow.
 *  Memoized so the dense desktop list doesn't re-render every row on
 *  selection change — only the previously-active and newly-active rows
 *  flip styles. */
const SongListRow = memo(function SongListRow({
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
});

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

/**
 * Right-pane chart sheet for the desktop master-detail layout. Tapping a
 * chart in `SongDetailPane` selects it via `?chart=…`; this component
 * replaces the chart grid with the chart's detail (jacket, your best,
 * friend leaderboard, replay link). Back arrow returns to the song's
 * chart grid; "Open full chart" still routes to /song/[id] for the
 * deeper-zoom experience (history, progression, save-to-list, etc.).
 */
function SongChartDetailPane({
  chartId,
  song,
  s,
  onBack,
  onOpenFull,
}: {
  chartId: number;
  song: SongLibraryItem | null;
  s: Styles;
  onBack: () => void;
  onOpenFull: () => void;
}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const detail = useQuery({
    queryKey: ['chart', chartId, user?.id ?? null],
    queryFn: () => songsApi.chartDetail(chartId, user?.id
      ? { user_id: user.id, follow_from_user_id: user.id }
      : {}),
    enabled: Number.isFinite(chartId) && chartId > 0,
    staleTime: 30_000,
  });

  const chart = detail.data?.chart;
  const userBest = detail.data?.user_summary?.best;
  const friendRecords = detail.data?.friend_records ?? [];
  const replayUrl = detail.data?.user_youtube_url
    || detail.data?.user_summary?.highest_replay?.url
    || '';

  const jacket = chart?.jacket_url
    ? fullImageUrl(chart.jacket_url)
    : song
      ? fullImageUrl(song.jacket_url)
      : undefined;

  const title = chart?.title || song?.title || 'Chart';
  const mode = chart?.mode || '';
  const level = chart?.level ?? 0;
  const grade = userBest ? getGradeDisplayLabel(userBest.grade, userBest.score) : '';

  return (
    <ScrollView style={s.deskDetailScroll} contentContainerStyle={s.deskDetailContent}>
      <View style={s.chartHead}>
        <Pressable
          onPress={onBack}
          hitSlop={6}
          style={({ pressed }) => [s.chartBackBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Back to song">
          <IconSymbol name="chevron.left" size={16} color={theme.text} />
          <Text style={s.chartBackText}>Back</Text>
        </Pressable>
        <Text style={s.deskEyebrow}>CHART</Text>
      </View>

      <View style={s.deskHeroRow}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.deskHeroJacket} contentFit="cover" />
        ) : (
          <View style={[s.deskHeroJacket, { backgroundColor: theme.surfaceMuted }]} />
        )}
        <View style={s.deskHeroText}>
          <Text style={s.deskHeroTitle} numberOfLines={2}>{title}</Text>
          {chart?.artist ? (
            <Text style={s.deskHeroArtist} numberOfLines={1}>{chart.artist}</Text>
          ) : null}
          <View style={s.chartBadgeRow}>
            <ChartBadge mode={mode} level={level} size="md" />
            {chart?.bpm ? <Text style={s.deskHeroMeta}>{chart.bpm} BPM</Text> : null}
          </View>
        </View>
      </View>

      <View style={s.deskSection}>
        <Text style={s.deskSectionLabel}>Your best</Text>
        {detail.isLoading ? (
          <ActivityIndicator color={theme.spinner} />
        ) : userBest ? (
          <View style={s.scoreBlock}>
            <Text style={s.scoreNum}>{Number(userBest.score || 0).toLocaleString()}</Text>
            {grade ? <Text style={s.scoreGrade}>{grade}</Text> : null}
            {userBest.is_stage_break ? (
              <Text style={[s.scoreGrade, { color: theme.danger }]}>STAGE BREAK</Text>
            ) : null}
          </View>
        ) : (
          <Text style={s.deskSectionHint}>No clear yet — keep grinding.</Text>
        )}
      </View>

      <View style={s.deskSection}>
        <Text style={s.deskSectionLabel}>Friends on this chart</Text>
        {detail.isLoading ? (
          <ActivityIndicator color={theme.spinner} size="small" />
        ) : friendRecords.length === 0 ? (
          <Text style={s.deskSectionHint}>None yet — follow some players.</Text>
        ) : (
          <View style={s.friendList}>
            {friendRecords.slice(0, 8).map((fr, i) => {
              const avatarUrl = fr.user.avatar ? fullImageUrl(fr.user.avatar) : undefined;
              return (
                <Pressable
                  key={fr.user.id}
                  onPress={() => router.push({ pathname: '/profile/[id]', params: { id: fr.user.id } })}
                  style={({ pressed }) => [s.friendRow, pressed && { opacity: 0.7 }]}>
                  <Text style={s.friendRank}>{i + 1}</Text>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={s.friendAvatar} contentFit="cover" />
                  ) : (
                    <View style={[s.friendAvatar, { backgroundColor: theme.surfaceMuted }]} />
                  )}
                  <Text style={s.friendName} numberOfLines={1}>{fr.user.username}</Text>
                  <Text style={s.friendScore}>{Number(fr.best?.score || 0).toLocaleString()}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <Pressable
        onPress={onOpenFull}
        style={({ pressed }) => [s.chartPrimary, pressed && { opacity: 0.85 }]}>
        <Text style={s.chartPrimaryText}>
          {replayUrl ? 'Watch replay · full chart →' : 'Open full chart →'}
        </Text>
      </Pressable>
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
  const params = useLocalSearchParams<{ q?: string; selected?: string; chart?: string }>();
  const initialQ = typeof params.q === 'string' ? params.q : '';
  const initialSelected = typeof params.selected === 'string' ? params.selected : '';
  const initialChart = typeof params.chart === 'string' ? params.chart : '';

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

  // Selected chart for the right rail. Synced to `?chart=…` so reload +
  // back/forward survive. Cleared when the user picks a different song.
  const [selectedChartId, setSelectedChartId] = useState<number>(
    initialChart ? Number(initialChart) || 0 : 0,
  );
  useEffect(() => {
    // Clear the chart selection if the currently-selected chart doesn't
    // belong to the currently-selected song — happens when the user clicks
    // a different song in the master list.
    if (!selectedChartId || !selectedSong) return;
    const stillBelongs = (selectedSong.charts || []).some((c) => c.chart_id === selectedChartId);
    if (!stillBelongs) setSelectedChartId(0);
  }, [selectedChartId, selectedSong]);
  useEffect(() => {
    router.setParams({ chart: selectedChartId ? String(selectedChartId) : '' });
  }, [selectedChartId, router]);

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
          // Stay on /songs?chart=… — the right rail handles it.
          setSelectedChartId(firstChart.chart_id);
        }
      } else if (e.key === 'Escape') {
        if (selectedChartId) {
          setSelectedChartId(0);
        } else {
          searchRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, selectedKey, selectedChartId, router]);

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
            <SongsDesktopList
              filtered={filtered}
              selectedKey={selectedKey}
              setSelectedKey={setSelectedKey}
              s={s}
              debouncedSearch={debouncedSearch}
            />
          )}
        </View>

        <View style={s.deskDetail}>
          {selectedChartId ? (
            <SongChartDetailPane
              chartId={selectedChartId}
              song={selectedSong}
              s={s}
              onBack={() => setSelectedChartId(0)}
              onOpenFull={() =>
                router.push({ pathname: '/song/[id]', params: { id: String(selectedChartId) } })
              }
            />
          ) : (
            <SongDetailPane
              song={selectedSong}
              s={s}
              onChartPress={(chart) => setSelectedChartId(chart.chart_id)}
            />
          )}
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
        <SongsList
          filtered={filtered}
          s={s}
          router={router}
          data={data}
          debouncedSearch={debouncedSearch}
        />
      )}
    </View>
  );
}

/** Extracted into its own component so renderItem/keyExtractor and the
 *  per-chart navigation handler can be useCallback-stabilized (the parent
 *  re-renders on every keystroke via the search box; we don't want that
 *  to invalidate the FlatList's window or the memoized SongRow). */
function SongsList({
  filtered,
  s,
  router,
  data,
  debouncedSearch,
}: {
  filtered: SongLibraryItem[];
  s: Styles;
  router: ReturnType<typeof useRouter>;
  data: { total_songs?: number; total_charts?: number } | undefined;
  debouncedSearch: string;
}) {
  const onChartPress = useCallback(
    (chart: Chart) => {
      router.push({ pathname: '/song/[id]', params: { id: String(chart.chart_id) } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: SongLibraryItem }) => (
      <SongRow song={item} s={s} onChartPress={onChartPress} />
    ),
    [s, onChartPress],
  );

  const keyExtractor = useCallback((song: SongLibraryItem) => song.song_group_key, []);

  const Separator = useCallback(() => <View style={s.separator} />, [s]);

  const Empty = useCallback(
    () => (
      <Text style={s.empty}>
        {debouncedSearch ? 'No songs match your search.' : 'No songs found.'}
      </Text>
    ),
    [s, debouncedSearch],
  );

  const Header = useCallback(
    () =>
      data ? (
        <Text style={s.totalLine}>
          {data.total_songs} songs · {data.total_charts} charts
        </Text>
      ) : null,
    [s, data],
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={songsListContentStyle}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={Empty}
      ListHeaderComponent={Header}
      // Virtualization tuning. The list can hold 1000+ rows on a synced
      // account, and rows are ~80 px tall — without these defaults RN
      // would mount ~21 screens worth and stutter on fast flicks.
      windowSize={5}
      maxToRenderPerBatch={8}
      initialNumToRender={12}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
    />
  );
}

const songsListContentStyle = { paddingBottom: 80 };

/** Desktop master-list virtualized version. Renderer + key extractor are
 *  useCallback-stable so SongListRow's memo() only re-renders the
 *  previously-active and newly-active rows on selection change. */
function SongsDesktopList({
  filtered,
  selectedKey,
  setSelectedKey,
  s,
  debouncedSearch,
}: {
  filtered: SongLibraryItem[];
  selectedKey: string;
  setSelectedKey: (key: string) => void;
  s: Styles;
  debouncedSearch: string;
}) {
  // Wrap setter so each row gets a stable handler keyed by its own song.
  // We hand the song key to the closure via a per-row Memo'd shim
  // (SongListRowMemo) so SongListRow itself stays unconditionally memoized.
  const renderItem = useCallback(
    ({ item }: { item: SongLibraryItem }) => (
      <SongListRowMemoPress
        song={item}
        active={item.song_group_key === selectedKey}
        onSelect={setSelectedKey}
        s={s}
      />
    ),
    [selectedKey, setSelectedKey, s],
  );
  const keyExtractor = useCallback((song: SongLibraryItem) => song.song_group_key, []);
  const Empty = useCallback(
    () => (
      <Text style={s.empty}>
        {debouncedSearch ? 'No songs match your search.' : 'No songs found.'}
      </Text>
    ),
    [s, debouncedSearch],
  );
  return (
    <FlatList
      data={filtered}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={s.deskListContent}
      ListEmptyComponent={Empty}
      windowSize={5}
      maxToRenderPerBatch={10}
      initialNumToRender={20}
      removeClippedSubviews
    />
  );
}

/** Per-row wrapper that fixes the onPress identity per song. SongListRow
 *  is already memoized; this just ensures the press handler doesn't get
 *  a new arrow every parent render. */
const SongListRowMemoPress = memo(function SongListRowMemoPress({
  song,
  active,
  onSelect,
  s,
}: {
  song: SongLibraryItem;
  active: boolean;
  onSelect: (key: string) => void;
  s: Styles;
}) {
  const handlePress = useCallback(() => onSelect(song.song_group_key), [onSelect, song.song_group_key]);
  return <SongListRow song={song} active={active} onPress={handlePress} s={s} />;
});

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

  // Chart detail pane (replaces the chart grid in the right column when a
  // chart is selected via ?chart=…).
  chartHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingBottom: 4,
  },
  chartBackBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  chartBackText: { fontSize: 12, fontWeight: '700' as const, color: t.text },
  deskEyebrow: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.8,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  chartBadgeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginTop: 6 },
  scoreBlock: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 10,
    paddingTop: 6,
  },
  scoreNum: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: t.text,
    fontVariant: ['tabular-nums' as const],
  },
  scoreGrade: { fontSize: 16, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.5 },
  friendList: { gap: 4, paddingTop: 4 },
  friendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  friendRank: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: t.textDim,
    minWidth: 16,
    fontVariant: ['tabular-nums' as const],
  },
  friendAvatar: { width: 26, height: 26, borderRadius: 13 },
  friendName: { flex: 1, fontSize: 13, fontWeight: '700' as const, color: t.text },
  friendScore: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: t.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
  chartPrimary: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
  },
  chartPrimaryText: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: t.textOnAccent,
    letterSpacing: 0.5,
  },
});

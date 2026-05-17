import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { DefaultAvatar } from '@/components/default-avatar';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { authApi, socialApi, songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type {
  HeadToHeadCompetitiveLevel,
  HeadToHeadLevelSeriesRow,
  HeadToHeadResponse,
  HeadToHeadSongDiff,
} from '@shared/api';

type ModeOption = 'Both' | 'Single' | 'Double';
type SeriesKey = 'a_average' | 'b_average' | 'a_rating' | 'b_rating';

const MODE_OPTIONS: ModeOption[] = ['Both', 'Single', 'Double'];

function formatNumber(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString();
}

function getModeKey(mode: ModeOption): 'single' | 'double' | 'both' {
  if (mode === 'Single') return 'single';
  if (mode === 'Double') return 'double';
  return 'both';
}

interface PlayerLite {
  id: string;
  username?: string;
  avatar?: string;
}

// ---------------------------------------------------------------------------
// Avatar helper — wraps DefaultAvatar fallback for follow / search rows.
// ---------------------------------------------------------------------------
function PlayerAvatar({ player, size }: { player: PlayerLite | null | undefined; size: number }) {
  const url = player?.avatar ? fullImageUrl(player.avatar) : undefined;
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }
  return <DefaultAvatar size={size} />;
}

// ---------------------------------------------------------------------------
// Trend chart — dual-line, dual-axis (avg score vs total rating)
// ---------------------------------------------------------------------------
const COLORS_A = { avg: '#fb7185', rating: '#fda4af' };
const COLORS_B = { avg: '#22d3ee', rating: '#67e8f9' };

interface ChartPoint {
  level: number;
  a_avg: number;
  b_avg: number;
  a_rating: number;
  b_rating: number;
}

function buildChartData(
  rowsA: HeadToHeadLevelSeriesRow[] | undefined,
  rowsB: HeadToHeadLevelSeriesRow[] | undefined,
): ChartPoint[] {
  const byLevel = new Map<number, ChartPoint>();
  for (const r of rowsA ?? []) {
    byLevel.set(r.level, {
      level: r.level,
      a_avg: Number(r.average_score) || 0,
      b_avg: 0,
      a_rating: Number(r.rating_total) || 0,
      b_rating: 0,
    });
  }
  for (const r of rowsB ?? []) {
    const existing = byLevel.get(r.level) ?? {
      level: r.level,
      a_avg: 0,
      b_avg: 0,
      a_rating: 0,
      b_rating: 0,
    };
    existing.b_avg = Number(r.average_score) || 0;
    existing.b_rating = Number(r.rating_total) || 0;
    byLevel.set(r.level, existing);
  }
  return Array.from(byLevel.values()).sort((p, q) => p.level - q.level);
}

interface TrendChartProps {
  data: ChartPoint[];
  visibility: Record<SeriesKey, boolean>;
}

function TrendChart({ data, visibility }: TrendChartProps) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(320);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(200, e.nativeEvent.layout.width);
    if (Math.abs(w - width) > 1) setWidth(w);
  };

  const HEIGHT = 200;
  const PAD = { top: 12, right: 8, bottom: 22, left: 36 };
  const innerW = Math.max(20, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const ratingMax = useMemo(() => {
    const m = Math.max(
      0,
      ...data.map((d) => Math.max(d.a_rating || 0, d.b_rating || 0)),
    );
    return m > 0 ? Math.ceil(m / 100) * 100 : 100;
  }, [data]);

  const minLevel = data.length ? data[0].level : 0;
  const maxLevel = data.length ? data[data.length - 1].level : 0;
  const xFor = (lv: number) => {
    if (maxLevel === minLevel) return PAD.left + innerW / 2;
    return PAD.left + ((lv - minLevel) / (maxLevel - minLevel)) * innerW;
  };
  const yAvg = (s: number) => PAD.top + (1 - s / 1000000) * innerH;
  const yRating = (r: number) => PAD.top + (1 - r / Math.max(1, ratingMax)) * innerH;

  const buildPath = (yFn: (v: number) => number, key: keyof ChartPoint): string => {
    if (!data.length) return '';
    return data
      .map((p, i) => {
        const x = xFor(p.level);
        const y = yFn(Number(p[key]) || 0);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  if (!data.length) {
    return (
      <View onLayout={onLayout} style={{ height: HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.textDim, fontSize: 12 }}>No level data for this mode.</Text>
      </View>
    );
  }

  // X-axis labels — show ~6 ticks
  const tickCount = Math.min(6, data.length);
  const tickIndices = data.length <= 6
    ? data.map((_, i) => i)
    : Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (data.length - 1)));

  return (
    <View onLayout={onLayout} style={{ height: HEIGHT, width: '100%' }}>
      <Svg width={width} height={HEIGHT}>
        <Defs>
          <SvgGradient id="grid" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.border} stopOpacity="0.6" />
            <Stop offset="1" stopColor={theme.border} stopOpacity="0.15" />
          </SvgGradient>
        </Defs>

        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = PAD.top + p * innerH;
          return (
            <Line
              key={`grid-${i}`}
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={y}
              y2={y}
              stroke="url(#grid)"
              strokeWidth={0.6}
            />
          );
        })}

        {/* Y axis labels (avg score on left) */}
        {[0, 500000, 1000000].map((s) => (
          <SvgText
            key={`yl-${s}`}
            x={PAD.left - 6}
            y={yAvg(s) + 3}
            fontSize="9"
            textAnchor="end"
            fill={theme.textDim}>
            {s === 0 ? '0' : s === 1000000 ? '1M' : '500k'}
          </SvgText>
        ))}

        {/* Data lines */}
        {visibility.a_average && (
          <Path d={buildPath(yAvg, 'a_avg')} stroke={COLORS_A.avg} strokeWidth={2.2} fill="none" />
        )}
        {visibility.b_average && (
          <Path d={buildPath(yAvg, 'b_avg')} stroke={COLORS_B.avg} strokeWidth={2.2} fill="none" />
        )}
        {visibility.a_rating && (
          <Path
            d={buildPath(yRating, 'a_rating')}
            stroke={COLORS_A.rating}
            strokeWidth={1.8}
            strokeDasharray="5 4"
            fill="none"
          />
        )}
        {visibility.b_rating && (
          <Path
            d={buildPath(yRating, 'b_rating')}
            stroke={COLORS_B.rating}
            strokeWidth={1.8}
            strokeDasharray="5 4"
            fill="none"
          />
        )}

        {/* Dots for avg */}
        {visibility.a_average &&
          data.map((p) => (
            <Circle key={`ad-${p.level}`} cx={xFor(p.level)} cy={yAvg(p.a_avg)} r={2.4} fill={COLORS_A.avg} />
          ))}
        {visibility.b_average &&
          data.map((p) => (
            <Circle key={`bd-${p.level}`} cx={xFor(p.level)} cy={yAvg(p.b_avg)} r={2.4} fill={COLORS_B.avg} />
          ))}

        {/* X axis labels */}
        {tickIndices.map((i) => {
          const p = data[i];
          return (
            <SvgText
              key={`xl-${p.level}`}
              x={xFor(p.level)}
              y={HEIGHT - 6}
              fontSize="10"
              textAnchor="middle"
              fill={theme.textDim}>
              Lv.{p.level}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Search-and-pick player picker (follow list + typeahead)
// ---------------------------------------------------------------------------
interface PickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (player: PlayerLite) => void;
  meId: string;
}

function PlayerPickerSheet({ visible, onClose, onPick, meId }: PickerProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makePickerStyles);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  // Reset query when re-opened
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const followingQuery = useQuery({
    queryKey: ['picker-following', meId],
    queryFn: () => socialApi.following(meId),
    enabled: visible && !!meId,
    staleTime: 5 * 60 * 1000,
  });

  const searchQuery = useQuery({
    queryKey: ['picker-search', debounced],
    queryFn: () => authApi.searchUsers(debounced),
    enabled: visible && debounced.length >= 2,
  });

  const items: PlayerLite[] = useMemo(() => {
    const seen = new Set<string>();
    const list: PlayerLite[] = [];
    const push = (p: PlayerLite | undefined | null) => {
      if (!p?.id || p.id === meId || seen.has(p.id)) return;
      seen.add(p.id);
      list.push(p);
    };
    if (debounced.length >= 2) {
      for (const u of searchQuery.data ?? []) push(u as PlayerLite);
    } else {
      for (const f of followingQuery.data ?? []) push(f as unknown as PlayerLite);
    }
    return list.slice(0, 60);
  }, [debounced, searchQuery.data, followingQuery.data, meId]);

  const loading = (debounced.length >= 2 ? searchQuery.isFetching : followingQuery.isFetching);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.sheetWrap}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.handle} />
            <View style={s.titleRow}>
              <Text style={s.title}>Pick rival</Text>
              <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
                <IconSymbol name="xmark" size={18} color={theme.textMuted} />
              </Pressable>
            </View>
            <View style={s.searchRow}>
              <IconSymbol name="magnifyingglass" size={16} color={theme.textDim} />
              <TextInput
                placeholder="Search by username"
                placeholderTextColor={theme.textDim}
                value={query}
                onChangeText={setQuery}
                style={s.input}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={s.sectionLabel}>
              {debounced.length >= 2 ? 'Search results' : 'Following'}
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
              {loading ? (
                <View style={s.loading}>
                  <ActivityIndicator color={theme.spinner} />
                </View>
              ) : items.length === 0 ? (
                <Text style={s.emptyText}>
                  {debounced.length >= 2
                    ? `No players matching "${debounced}".`
                    : 'You aren’t following anyone yet — search by username to find a rival.'}
                </Text>
              ) : (
                items.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => onPick(p)}
                    style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
                    <PlayerAvatar player={p} size={36} />
                    <Text style={s.rowName} numberOfLines={1}>{p.username || '—'}</Text>
                    <IconSymbol name="chevron.right" size={16} color={theme.textDim} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Highlighted stat row — symmetrical "A vs B" with center label.
// ---------------------------------------------------------------------------
function StatRow({
  label,
  left,
  right,
  tint,
}: {
  label: string;
  left: string;
  right: string;
  tint: string;
}) {
  const s = useThemedStyles(makeStatRowStyles);
  return (
    <View style={s.row}>
      <View style={[s.cell, { borderColor: tint + '55' }]}>
        <Text style={[s.cellValue, { color: tint }]} numberOfLines={1}>{left}</Text>
      </View>
      <Text style={[s.label, { color: tint }]}>{label}</Text>
      <View style={[s.cell, { borderColor: tint + '55' }]}>
        <Text style={[s.cellValue, { color: tint }]} numberOfLines={1}>{right}</Text>
      </View>
    </View>
  );
}

function CompetitiveStatRow({
  label,
  prefix,
  tint,
  a,
  b,
}: {
  label: string;
  prefix: 'S' | 'D';
  tint: string;
  a: HeadToHeadCompetitiveLevel | null | undefined;
  b: HeadToHeadCompetitiveLevel | null | undefined;
}) {
  const s = useThemedStyles(makeStatRowStyles);
  const renderCell = (entry: HeadToHeadCompetitiveLevel | null | undefined) => {
    if (!entry?.level) {
      return <Text style={[s.cellValue, { color: tint, opacity: 0.45 }]}>—</Text>;
    }
    return (
      <View style={s.compInline}>
        <Text style={[s.cellValue, { color: tint }]}>{prefix}{entry.level}</Text>
        {entry.average_grade ? (
          <Text style={[s.compGrade, { color: tint }]}>{entry.average_grade}</Text>
        ) : null}
      </View>
    );
  };
  return (
    <View style={s.row}>
      <View style={[s.cell, { borderColor: tint + '55' }]}>{renderCell(a)}</View>
      <Text style={[s.label, { color: tint }]} numberOfLines={2}>{label}</Text>
      <View style={[s.cell, { borderColor: tint + '55' }]}>{renderCell(b)}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function HeadToHeadScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();

  const [opponent, setOpponent] = useState<PlayerLite | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<ModeOption>('Both');
  const [trendMode, setTrendMode] = useState<ModeOption>('Both');
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<Record<SeriesKey, boolean>>({
    a_average: true,
    b_average: true,
    a_rating: false,
    b_rating: false,
  });
  const [trendRange, setTrendRange] = useState<{ min: number; max: number } | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const compareMutation = useMutation({
    mutationFn: (params: { opponentId: string; mode: ModeOption; level: number | null }) =>
      songsApi.headToHead({
        user_a_id: user!.id,
        user_b_id: params.opponentId,
        mode: params.mode,
        level: params.level ?? undefined,
      }),
    onSuccess: () => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
  });

  // Re-run on opponent / mode / level change
  useEffect(() => {
    if (!user?.id || !opponent?.id) return;
    fadeAnim.setValue(0);
    compareMutation.mutate({ opponentId: opponent.id, mode, level: selectedLevel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, opponent?.id, mode, selectedLevel]);

  // Reset trend range when result switches
  useEffect(() => {
    setTrendRange(null);
  }, [opponent?.id]);

  const result = compareMutation.data as HeadToHeadResponse | undefined;
  const userA: PlayerLite = useMemo(
    () => ({ id: user?.id ?? '', username: user?.username, avatar: user?.avatar }),
    [user?.id, user?.username, user?.avatar],
  );
  const userB: PlayerLite | null = result?.users?.b
    ? { id: String(result.users.b.id || opponent?.id || ''), username: result.users.b.username, avatar: result.users.b.avatar }
    : opponent;

  // Available levels — derive from level series rows
  const compareLevels = useMemo(() => {
    if (!result?.level_series) return [] as number[];
    const key = getModeKey(mode);
    const set = new Set<number>();
    for (const r of result.level_series[key]?.a ?? []) set.add(r.level);
    for (const r of result.level_series[key]?.b ?? []) set.add(r.level);
    return Array.from(set).sort((a, b) => a - b);
  }, [result, mode]);

  const trendData = useMemo(() => {
    if (!result?.level_series) return [] as ChartPoint[];
    const key = getModeKey(trendMode);
    return buildChartData(result.level_series[key]?.a, result.level_series[key]?.b);
  }, [result, trendMode]);

  // Default trend range to full extent
  useEffect(() => {
    if (!trendData.length) return;
    if (trendRange) return;
    setTrendRange({ min: trendData[0].level, max: trendData[trendData.length - 1].level });
  }, [trendData, trendRange]);

  const rangedTrend = useMemo(() => {
    if (!trendRange) return trendData;
    const lo = Math.min(trendRange.min, trendRange.max);
    const hi = Math.max(trendRange.min, trendRange.max);
    return trendData.filter((p) => p.level >= lo && p.level <= hi);
  }, [trendData, trendRange]);

  const comparison = result?.comparison;
  const winsA = comparison?.wins?.a ?? 0;
  const winsB = comparison?.wins?.b ?? 0;
  const ratingA = comparison?.rating?.a ?? 0;
  const ratingB = comparison?.rating?.b ?? 0;
  const passedA = comparison?.total_passed?.a ?? 0;
  const passedB = comparison?.total_passed?.b ?? 0;
  const ties = comparison?.wins?.ties ?? 0;
  const sharedCount = comparison?.shared_chart_count ?? 0;

  const metricWinsA = [
    winsA > winsB,
    passedA > passedB,
    ratingA > ratingB,
  ].filter(Boolean).length;
  const metricWinsB = [
    winsB > winsA,
    passedB > passedA,
    ratingB > ratingA,
  ].filter(Boolean).length;
  const clearCutWinner: PlayerLite | null =
    metricWinsA >= 2 && metricWinsA > metricWinsB ? userA :
    metricWinsB >= 2 && metricWinsB > metricWinsA ? userB :
    null;

  if (!user) {
    return (
      <View style={[s.container, isDesktop && s.containerDesktop]}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <TopBar />
        </View>
        <View style={s.centered}>
          <Text style={s.emptyTitle}>Sign in to scout your rivals</Text>
        </View>
      </View>
    );
  }

  const meId = user.id;

  return (
    <View style={[s.container, isDesktop && s.containerDesktop]}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar
          rightExtra={opponent ? (
            <Pressable
              onPress={() => setPickerOpen(true)}
              hitSlop={6}
              style={({ pressed }) => [s.swapBtn, pressed && { opacity: 0.7 }]}>
              <IconSymbol name="arrow.up.arrow.down" size={16} color={theme.text} />
              <Text style={s.swapBtnText}>Swap</Text>
            </Pressable>
          ) : null}
        />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}>
        {/* VS hero */}
        <View style={s.vsCard}>
          <View style={s.vsSide}>
            <PlayerAvatar player={userA} size={56} />
            <Text style={s.vsName} numberOfLines={1}>{userA.username || 'You'}</Text>
            <Text style={s.vsRole}>You</Text>
          </View>
          <View style={s.vsCenter}>
            <Text style={s.vsLabel}>VS</Text>
          </View>
          <View style={s.vsSide}>
            {opponent ? (
              <>
                <PlayerAvatar player={userB ?? opponent} size={56} />
                <Text style={s.vsName} numberOfLines={1}>{(userB ?? opponent)?.username || '—'}</Text>
                <Text style={s.vsRole}>Rival</Text>
              </>
            ) : (
              <Pressable
                onPress={() => setPickerOpen(true)}
                style={({ pressed }) => [s.pickButton, pressed && { opacity: 0.85 }]}>
                <View style={s.pickAvatarShell}>
                  <IconSymbol name="plus" size={28} color={theme.accent} />
                </View>
                <Text style={s.pickButtonLabel}>Pick rival</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Filters */}
        <View style={s.filterCard}>
          <Text style={s.filterLabel}>Mode</Text>
          <View style={s.segmented}>
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setMode(opt)}
                  style={({ pressed }) => [
                    s.segment,
                    active && s.segmentActive,
                    pressed && !active && { opacity: 0.7 },
                  ]}>
                  <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>

          {opponent ? (
            <>
              <Text style={[s.filterLabel, { marginTop: 14 }]}>Level</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.levelRow}>
                {([null, ...compareLevels] as (number | null)[]).map((lv) => {
                  const active = lv === selectedLevel;
                  const label = lv === null ? 'All' : String(lv);
                  return (
                    <Pressable
                      key={lv === null ? 'all' : `lv-${lv}`}
                      onPress={() => setSelectedLevel(lv)}
                      style={({ pressed }) => [
                        s.levelChip,
                        active && s.levelChipActive,
                        pressed && !active && { opacity: 0.7 },
                      ]}>
                      <Text style={[s.levelChipText, active && s.levelChipTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}
        </View>

        {/* Loading / error */}
        {compareMutation.isPending && opponent ? (
          <View style={s.loadingCard}>
            <ActivityIndicator color={theme.spinner} />
            <Text style={s.loadingText}>Crunching matchup…</Text>
          </View>
        ) : null}
        {compareMutation.isError ? (
          <View style={s.errorCard}>
            <Text style={s.errorText}>
              {compareMutation.error instanceof Error
                ? compareMutation.error.message
                : 'Failed to load comparison'}
            </Text>
          </View>
        ) : null}

        {/* Results */}
        {result && opponent ? (
          <Animated.View style={{ opacity: fadeAnim, gap: 14 }}>
            {/* Headline scoreboard */}
            <View style={s.headlineCard}>
              <View style={s.headlineRow}>
                <Text style={[s.headlineSide, { color: COLORS_A.avg }]} numberOfLines={1}>
                  {userA.username || 'You'}
                </Text>
                <View style={s.headlineCenter}>
                  <Text style={s.headlineScore}>
                    <Text style={[s.headlineNumA]}>{winsA}</Text>
                    <Text style={s.headlineDash}>  ·  </Text>
                    <Text style={[s.headlineNumB]}>{winsB}</Text>
                  </Text>
                  <Text style={s.headlineMeta}>{sharedCount} shared chart{sharedCount === 1 ? '' : 's'}</Text>
                </View>
                <Text style={[s.headlineSide, { color: COLORS_B.avg, textAlign: 'right' }]} numberOfLines={1}>
                  {userB?.username || opponent.username || '—'}
                </Text>
              </View>
              {clearCutWinner ? (
                <View style={s.crownRow}>
                  <Text style={s.crownIcon}>👑</Text>
                  <Text style={s.crownText}>
                    Clear-cut: <Text style={{ color: theme.accent, fontWeight: '900' }}>{clearCutWinner.username}</Text>
                  </Text>
                </View>
              ) : (
                <View style={s.crownRow}>
                  <Text style={[s.crownIcon, { opacity: 0.5 }]}>⚖️</Text>
                  <Text style={s.crownText}>Too close to call</Text>
                </View>
              )}
            </View>

            {/* Headline stats grid */}
            <View style={s.statsCard}>
              <Text style={s.cardTitle}>Highlighted stats</Text>
              <StatRow
                label="Pumbility"
                tint={theme.accent}
                left={formatNumber(result.highlighted_stats?.pumbility?.a ?? 0)}
                right={formatNumber(result.highlighted_stats?.pumbility?.b ?? 0)}
              />
              <StatRow
                label="Singles Pumbility"
                tint="#fb7185"
                left={formatNumber(result.highlighted_stats?.singles_pumbility?.a ?? 0)}
                right={formatNumber(result.highlighted_stats?.singles_pumbility?.b ?? 0)}
              />
              <CompetitiveStatRow
                label="Singles competitive"
                prefix="S"
                tint="#fb7185"
                a={result.highlighted_stats?.singles_competitive_level?.a ?? null}
                b={result.highlighted_stats?.singles_competitive_level?.b ?? null}
              />
              <CompetitiveStatRow
                label="Doubles competitive"
                prefix="D"
                tint="#4cf4aa"
                a={result.highlighted_stats?.doubles_competitive_level?.a ?? null}
                b={result.highlighted_stats?.doubles_competitive_level?.b ?? null}
              />
            </View>

            {/* Trend chart */}
            <View style={s.statsCard}>
              <View style={s.trendHeader}>
                <View>
                  <Text style={s.cardTitle}>Per-level trend</Text>
                  <Text style={s.cardSub}>Solid: avg score · Dashed: rating total</Text>
                </View>
                <View style={s.miniSegmented}>
                  {MODE_OPTIONS.map((opt) => {
                    const active = trendMode === opt;
                    return (
                      <Pressable
                        key={`tm-${opt}`}
                        onPress={() => { setTrendMode(opt); setTrendRange(null); }}
                        style={({ pressed }) => [
                          s.miniSegment,
                          active && s.miniSegmentActive,
                          pressed && !active && { opacity: 0.7 },
                        ]}>
                        <Text style={[s.miniSegmentText, active && s.miniSegmentTextActive]}>
                          {opt[0]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={s.legendRow}>
                <LegendItem
                  player={userA}
                  avgKey="a_average"
                  ratingKey="a_rating"
                  visibility={visibility}
                  setVisibility={setVisibility}
                  colors={COLORS_A}
                />
                <LegendItem
                  player={userB ?? opponent}
                  avgKey="b_average"
                  ratingKey="b_rating"
                  visibility={visibility}
                  setVisibility={setVisibility}
                  colors={COLORS_B}
                />
              </View>

              <TrendChart data={rangedTrend} visibility={visibility} />

              {/* Range slider via chips */}
              {trendData.length > 1 ? (
                <View style={s.rangeBox}>
                  <Text style={s.rangeLabel}>From</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rangeRow}>
                    {trendData.map((p) => {
                      const active = (trendRange?.min ?? trendData[0].level) === p.level;
                      return (
                        <Pressable
                          key={`from-${p.level}`}
                          onPress={() => setTrendRange((prev) => ({
                            min: p.level,
                            max: Math.max(p.level, prev?.max ?? trendData[trendData.length - 1].level),
                          }))}
                          style={({ pressed }) => [
                            s.rangeChip,
                            active && s.rangeChipActive,
                            pressed && !active && { opacity: 0.7 },
                          ]}>
                          <Text style={[s.rangeChipText, active && s.rangeChipTextActive]}>{p.level}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Text style={s.rangeLabel}>To</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rangeRow}>
                    {trendData.map((p) => {
                      const active = (trendRange?.max ?? trendData[trendData.length - 1].level) === p.level;
                      return (
                        <Pressable
                          key={`to-${p.level}`}
                          onPress={() => setTrendRange((prev) => ({
                            min: Math.min(p.level, prev?.min ?? trendData[0].level),
                            max: p.level,
                          }))}
                          style={({ pressed }) => [
                            s.rangeChip,
                            active && s.rangeChipActive,
                            pressed && !active && { opacity: 0.7 },
                          ]}>
                          <Text style={[s.rangeChipText, active && s.rangeChipTextActive]}>{p.level}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            {/* Comparison table */}
            <View style={s.statsCard}>
              <Text style={s.cardTitle}>Level comparison</Text>
              <ComparisonTable
                userA={userA}
                userB={userB ?? opponent}
                rows={[
                  { label: 'Shared passed', a: sharedCount, b: sharedCount, equal: true },
                  { label: 'Higher score wins', a: winsA, b: winsB },
                  { label: 'Total passed', a: passedA, b: passedB },
                  { label: 'Rating total', a: ratingA, b: ratingB, gold: true },
                  { label: 'Ties', a: ties, b: ties, equal: true },
                ]}
              />
            </View>

            {/* Top diffs — mobile keeps a single list; desktop splits into
                three columns: where you lead, tied within 5K, where they lead. */}
            {isDesktop ? (
              <View style={s.deskDiffGrid}>
                <View style={[s.statsCard, s.deskDiffCol]}>
                  <Text style={[s.cardTitle, { color: theme.success }]}>Where you lead</Text>
                  <Text style={s.cardSub}>Your score wins by 5K+</Text>
                  <SongDiffList
                    rows={(result.top_song_diffs ?? []).filter((r) =>
                      r.winner === 'a' && Math.abs((r.score_a || 0) - (r.score_b || 0)) >= 5000,
                    )}
                    userA={userA}
                    userB={userB ?? opponent}
                  />
                </View>
                <View style={[s.statsCard, s.deskDiffCol]}>
                  <Text style={[s.cardTitle, { color: theme.accent }]}>Tied within 5K</Text>
                  <Text style={s.cardSub}>Either could take it any session</Text>
                  <SongDiffList
                    rows={(result.top_song_diffs ?? []).filter((r) =>
                      Math.abs((r.score_a || 0) - (r.score_b || 0)) < 5000,
                    )}
                    userA={userA}
                    userB={userB ?? opponent}
                  />
                </View>
                <View style={[s.statsCard, s.deskDiffCol]}>
                  <Text style={[s.cardTitle, { color: theme.danger }]}>Where they lead</Text>
                  <Text style={s.cardSub}>Their score wins by 5K+</Text>
                  <SongDiffList
                    rows={(result.top_song_diffs ?? []).filter((r) =>
                      r.winner === 'b' && Math.abs((r.score_a || 0) - (r.score_b || 0)) >= 5000,
                    )}
                    userA={userA}
                    userB={userB ?? opponent}
                  />
                </View>
              </View>
            ) : (
              <View style={s.statsCard}>
                <Text style={s.cardTitle}>Top score gaps</Text>
                <Text style={s.cardSub}>Biggest score differences across charts you both passed</Text>
                <SongDiffList rows={result.top_song_diffs ?? []} userA={userA} userB={userB ?? opponent} />
              </View>
            )}
          </Animated.View>
        ) : null}

        {!opponent && !compareMutation.isPending ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>Find your benchmark</Text>
            <Text style={s.emptyBody}>
              Pick another player to see your shared charts side-by-side, your level trends, and where you can leapfrog them.
            </Text>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [s.emptyCta, pressed && { opacity: 0.85 }]}>
              <IconSymbol name="magnifyingglass" size={16} color={theme.bg} />
              <Text style={s.emptyCtaText}>Pick rival</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <PlayerPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        meId={meId}
        onPick={(p) => {
          setOpponent(p);
          setPickerOpen(false);
          setSelectedLevel(null);
          // Pre-warm the cache by invalidating
          queryClient.invalidateQueries({ queryKey: ['picker-following', meId] });
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inline helpers
// ---------------------------------------------------------------------------
function LegendItem({
  player,
  avgKey,
  ratingKey,
  visibility,
  setVisibility,
  colors,
}: {
  player: PlayerLite | null | undefined;
  avgKey: SeriesKey;
  ratingKey: SeriesKey;
  visibility: Record<SeriesKey, boolean>;
  setVisibility: (v: Record<SeriesKey, boolean>) => void;
  colors: { avg: string; rating: string };
}) {
  const s = useThemedStyles(makeLegendStyles);
  const toggle = (key: SeriesKey) => setVisibility({ ...visibility, [key]: !visibility[key] });
  return (
    <View style={s.box}>
      <View style={s.head}>
        <PlayerAvatar player={player} size={20} />
        <Text style={s.name} numberOfLines={1}>{player?.username || '—'}</Text>
      </View>
      <View style={s.toggles}>
        <Pressable onPress={() => toggle(avgKey)} style={s.toggle}>
          <View style={[s.swatchSolid, { backgroundColor: visibility[avgKey] ? colors.avg : 'transparent', borderColor: colors.avg }]} />
          <Text style={[s.toggleText, !visibility[avgKey] && { opacity: 0.4 }]}>Avg</Text>
        </Pressable>
        <Pressable onPress={() => toggle(ratingKey)} style={s.toggle}>
          <View style={[s.swatchDashed, { borderColor: colors.rating, opacity: visibility[ratingKey] ? 1 : 0.4 }]} />
          <Text style={[s.toggleText, !visibility[ratingKey] && { opacity: 0.4 }]}>Rating</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface ComparisonRow {
  label: string;
  a: number;
  b: number;
  gold?: boolean;
  equal?: boolean;
}
function ComparisonTable({
  userA,
  userB,
  rows,
}: {
  userA: PlayerLite;
  userB: PlayerLite | null | undefined;
  rows: ComparisonRow[];
}) {
  const s = useThemedStyles(makeTableStyles);
  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.headerCell}>Metric</Text>
        <Text style={[s.headerCell, s.headerCellRight]} numberOfLines={1}>{userA.username || 'You'}</Text>
        <Text style={[s.headerCell, s.headerCellRight]} numberOfLines={1}>{userB?.username || 'Rival'}</Text>
      </View>
      {rows.map((r, i) => {
        const aWins = !r.equal && r.a > r.b;
        const bWins = !r.equal && r.b > r.a;
        return (
          <View key={`row-${i}`} style={s.row}>
            <Text style={s.label}>{r.label}</Text>
            <View style={s.cell}>
              {aWins ? <Text style={s.star}>★</Text> : null}
              <Text style={[s.value, r.gold && s.gold]}>{formatNumber(r.a)}</Text>
            </View>
            <View style={s.cell}>
              {bWins ? <Text style={s.star}>★</Text> : null}
              <Text style={[s.value, r.gold && s.gold]}>{formatNumber(r.b)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SongDiffList({
  rows,
  userA,
  userB,
}: {
  rows: HeadToHeadSongDiff[];
  userA: PlayerLite;
  userB: PlayerLite | null | undefined;
}) {
  const s = useThemedStyles(makeDiffStyles);
  if (!rows.length) {
    return <Text style={s.empty}>No shared passed charts yet for this filter.</Text>;
  }
  return (
    <View style={{ gap: 6 }}>
      {rows.slice(0, 10).map((r, i) => {
        const diff = Math.abs((r.score_a || 0) - (r.score_b || 0));
        const aWins = r.winner === 'a';
        const bWins = r.winner === 'b';
        const isSingle = String(r.mode || '').toLowerCase().startsWith('s');
        return (
          <View key={`d-${r.chart_id ?? r.title}-${i}`} style={s.row}>
            <View style={s.titleBox}>
              <View style={[s.modeBadge, isSingle ? s.singleBadge : s.doubleBadge]}>
                <Text style={s.modeBadgeText}>{isSingle ? 'S' : 'D'}{r.level}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.title} numberOfLines={1}>{r.title}</Text>
                <Text style={s.diffMeta}>diff {formatNumber(diff)}</Text>
              </View>
            </View>
            <View style={s.scoreBox}>
              <Text style={[s.scoreSide, aWins && s.scoreWinner]}>
                {aWins ? '★ ' : ''}{formatNumber(r.score_a)}
              </Text>
              <Text style={s.scoreLabel} numberOfLines={1}>{userA.username || 'You'}</Text>
            </View>
            <View style={s.scoreBox}>
              <Text style={[s.scoreSide, bWins && s.scoreWinner]}>
                {bWins ? '★ ' : ''}{formatNumber(r.score_b)}
              </Text>
              <Text style={s.scoreLabel} numberOfLines={1}>{userB?.username || 'Rival'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  // Desktop: cap reading width and center.
  containerDesktop: { maxWidth: 1180, alignSelf: 'center' as const, width: '100%' as const },
  // Desktop: 3-col where-you-lead / tied / they-lead.
  deskDiffGrid: { flexDirection: 'row' as const, gap: 12, alignItems: 'flex-start' as const },
  deskDiffCol: { flex: 1, minWidth: 0 },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 1.5 },
  swapBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
  },
  swapBtnText: { fontSize: 12, fontWeight: '700' as const, color: t.text },

  scroll: { paddingHorizontal: 12, gap: 14 },
  centered: { alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },

  vsCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.card,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
    padding: 16,
    gap: 12,
  },
  vsSide: { flex: 1, alignItems: 'center' as const, gap: 6 },
  vsName: { fontSize: 14, fontWeight: '800' as const, color: t.text, maxWidth: 120, textAlign: 'center' as const },
  vsRole: { fontSize: 10, fontWeight: '800' as const, color: t.textDim, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  vsCenter: { width: 44, alignItems: 'center' as const },
  vsLabel: {
    fontSize: 18,
    fontWeight: '900' as const,
    color: t.accent,
    letterSpacing: 2,
  },
  pickButton: { alignItems: 'center' as const, gap: 6 },
  pickAvatarShell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pickButtonLabel: { fontSize: 12, fontWeight: '800' as const, color: t.accent },

  filterCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 8,
  },
  filterLabel: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.5, color: t.textDim, textTransform: 'uppercase' as const },
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

  levelRow: { gap: 6, paddingRight: 8 },
  levelChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  levelChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  levelChipText: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
  levelChipTextActive: { color: t.accent },

  loadingCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    justifyContent: 'center' as const,
  },
  loadingText: { fontSize: 13, color: t.textMuted },
  errorCard: { backgroundColor: t.dangerBg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: t.dangerBorder },
  errorText: { color: t.danger, fontSize: 13 },

  headlineCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 8,
  },
  headlineRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  headlineSide: { flex: 1, fontSize: 13, fontWeight: '900' as const },
  headlineCenter: { alignItems: 'center' as const, paddingHorizontal: 8 },
  headlineScore: { fontSize: 24, fontWeight: '900' as const, color: t.text },
  headlineNumA: { color: '#fb7185' },
  headlineNumB: { color: '#22d3ee' },
  headlineDash: { color: t.textDim, fontSize: 18, fontWeight: '700' as const },
  headlineMeta: { fontSize: 10, color: t.textDim, marginTop: 2, letterSpacing: 0.5 },
  crownRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, justifyContent: 'center' as const },
  crownIcon: { fontSize: 14 },
  crownText: { fontSize: 12, color: t.textMuted },

  statsCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  cardTitle: { fontSize: 13, fontWeight: '900' as const, color: t.text, letterSpacing: 0.6 },
  cardSub: { fontSize: 11, color: t.textDim, marginTop: -4 },

  trendHeader: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: 12 },
  miniSegmented: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 999,
    padding: 2,
  },
  miniSegment: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  miniSegmentActive: { backgroundColor: t.bg },
  miniSegmentText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted },
  miniSegmentTextActive: { color: t.accent },

  legendRow: { flexDirection: 'row' as const, gap: 8 },

  rangeBox: { gap: 4, marginTop: 6 },
  rangeLabel: { fontSize: 10, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  rangeRow: { gap: 4, paddingRight: 6 },
  rangeChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
  },
  rangeChipActive: { backgroundColor: t.accentTint },
  rangeChipText: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted },
  rangeChipTextActive: { color: t.accent },

  emptyCard: {
    backgroundColor: t.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
    padding: 22,
    alignItems: 'center' as const,
    gap: 10,
    marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '900' as const, color: t.text, textAlign: 'center' as const },
  emptyBody: { fontSize: 13, color: t.textMuted, textAlign: 'center' as const, lineHeight: 19 },
  emptyCta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: t.accent,
    marginTop: 6,
  },
  emptyCtaText: { color: t.bg, fontSize: 14, fontWeight: '800' as const },
});

const makePickerStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' as const },
  sheetWrap: { width: '100%' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: t.border,
    maxHeight: '85%' as const,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 8,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 4 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  title: { fontSize: 17, fontWeight: '900' as const, color: t.text, letterSpacing: 0.5 },
  closeBtn: { padding: 4 },
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: t.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  input: { flex: 1, color: t.text, fontSize: 14, padding: 0 },
  sectionLabel: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim, textTransform: 'uppercase' as const, marginTop: 8 },
  loading: { padding: 24, alignItems: 'center' as const },
  emptyText: { padding: 16, color: t.textMuted, fontSize: 13, textAlign: 'center' as const },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  rowName: { flex: 1, fontSize: 14, fontWeight: '700' as const, color: t.text },
});

const makeStatRowStyles = (t: ThemeColors) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  cell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: t.surfaceMuted,
    alignItems: 'center' as const,
  },
  cellValue: { fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  label: { flex: 1.4, fontSize: 11, fontWeight: '800' as const, textAlign: 'center' as const, letterSpacing: 0.4 },
  compInline: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 4 },
  compGrade: { fontSize: 11, fontWeight: '700' as const },
});

const makeLegendStyles = (t: ThemeColors) => ({
  box: {
    flex: 1,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    padding: 8,
    gap: 8,
  },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  name: { flex: 1, fontSize: 12, fontWeight: '800' as const, color: t.text },
  toggles: { flexDirection: 'row' as const, gap: 6 },
  toggle: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  swatchSolid: { width: 14, height: 4, borderRadius: 2, borderWidth: 1 },
  swatchDashed: { width: 14, height: 0, borderTopWidth: 1, borderStyle: 'dashed' as const },
  toggleText: { fontSize: 10, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.5 },
});

const makeTableStyles = (t: ThemeColors) => ({
  wrap: { gap: 1, backgroundColor: t.border, borderRadius: 10, overflow: 'hidden' as const },
  headerRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  headerCell: { flex: 1, fontSize: 10, fontWeight: '900' as const, color: t.textDim, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  headerCellRight: { textAlign: 'right' as const },
  row: {
    flexDirection: 'row' as const,
    backgroundColor: t.card,
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 8,
    alignItems: 'center' as const,
  },
  label: { flex: 1, fontSize: 12, color: t.textMuted },
  cell: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'flex-end' as const, gap: 4 },
  value: { fontSize: 13, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  gold: { color: t.accent },
  star: { color: '#34d399', fontSize: 12 },
});

const makeDiffStyles = (t: ThemeColors) => ({
  empty: { fontSize: 12, color: t.textDim, textAlign: 'center' as const, padding: 16 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
  },
  titleBox: { flex: 1.4, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  modeBadge: {
    minWidth: 28,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  singleBadge: { backgroundColor: 'rgba(217,61,98,0.45)' },
  doubleBadge: { backgroundColor: 'rgba(22,183,127,0.45)' },
  modeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' as const },
  title: { fontSize: 12, fontWeight: '700' as const, color: t.text },
  diffMeta: { fontSize: 9, color: t.textDim, fontWeight: '700' as const, letterSpacing: 0.4 },
  scoreBox: { flex: 1, alignItems: 'flex-end' as const, gap: 1 },
  scoreSide: { fontSize: 12, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  scoreWinner: { color: '#34d399' },
  scoreLabel: { fontSize: 9, color: t.textDim, maxWidth: 90 },
});


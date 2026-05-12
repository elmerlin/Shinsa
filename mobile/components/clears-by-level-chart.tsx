import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';
import type { SongAnalyticsLevelBucket } from '@shared/api';

type Mode = 'single' | 'double' | 'both';

interface Props {
  single?: SongAnalyticsLevelBucket[];
  double?: SongAnalyticsLevelBucket[];
  /** Default mode shown on mount. */
  initialMode?: Mode;
}

const COLORS = {
  single: '#ff7a7a',
  double: '#4cf4aa',
};

const PADDING = { top: 12, right: 8, bottom: 22, left: 28 };
const HEIGHT = 160;

interface SeriesPoint {
  level: number;
  pct: number;
  cleared: number;
  total: number;
}

function bucketsToSeries(buckets?: SongAnalyticsLevelBucket[]): SeriesPoint[] {
  if (!buckets) return [];
  return buckets
    .filter((b) => (Number(b.total_charts) || 0) > 0)
    .map((b) => {
      const cleared = Number(b.cleared_charts) || 0;
      const total = Number(b.total_charts) || 0;
      return {
        level: Number(b.level) || 0,
        pct: total > 0 ? (cleared / total) * 100 : 0,
        cleared,
        total,
      };
    })
    .sort((a, b) => a.level - b.level);
}

interface BuiltSeries {
  color: string;
  points: SeriesPoint[];
  /** SVG `d` for the line path. */
  linePath: string;
  /** SVG `d` for the filled area below the line. */
  areaPath: string;
}

function buildPaths(series: SeriesPoint[], color: string, w: number, h: number, minLevel: number, maxLevel: number): BuiltSeries {
  if (series.length === 0 || maxLevel === minLevel) {
    return { color, points: series, linePath: '', areaPath: '' };
  }
  const innerW = w - PADDING.left - PADDING.right;
  const innerH = h - PADDING.top - PADDING.bottom;
  const xFor = (level: number) => PADDING.left + ((level - minLevel) / (maxLevel - minLevel)) * innerW;
  const yFor = (pct: number) => PADDING.top + (1 - pct / 100) * innerH;

  const coords = series.map((p) => ({ x: xFor(p.level), y: yFor(p.pct) }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const baselineY = PADDING.top + innerH;
  const areaPath = coords.length === 0
    ? ''
    : `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${baselineY.toFixed(1)} L${coords[0].x.toFixed(1)},${baselineY.toFixed(1)} Z`;
  return { color, points: series, linePath, areaPath };
}

export function ClearsByLevelChart({ single, double, initialMode = 'both' }: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const singleSeries = useMemo(() => bucketsToSeries(single), [single]);
  const doubleSeries = useMemo(() => bucketsToSeries(double), [double]);

  const hasSingle = singleSeries.length > 0;
  const hasDouble = doubleSeries.length > 0;
  const defaultMode: Mode = initialMode === 'both' && (!hasSingle || !hasDouble)
    ? (hasSingle ? 'single' : 'double')
    : initialMode;
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [width, setWidth] = useState(320);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(0, e.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - width) > 1) setWidth(w);
  };

  const allLevels: number[] = [
    ...(mode !== 'double' ? singleSeries.map((p) => p.level) : []),
    ...(mode !== 'single' ? doubleSeries.map((p) => p.level) : []),
  ];
  const minLevel = allLevels.length > 0 ? Math.min(...allLevels) : 1;
  const maxLevel = allLevels.length > 0 ? Math.max(...allLevels) : 28;

  const built = {
    single: mode !== 'double' && hasSingle
      ? buildPaths(singleSeries, COLORS.single, width, HEIGHT, minLevel, maxLevel)
      : null,
    double: mode !== 'single' && hasDouble
      ? buildPaths(doubleSeries, COLORS.double, width, HEIGHT, minLevel, maxLevel)
      : null,
  };

  // Y-axis ticks (0/50/100%) and X-axis labels (every ~4 levels)
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;
  const yTickPct = [0, 25, 50, 75, 100];
  const yPos = (pct: number) => PADDING.top + (1 - pct / 100) * innerH;

  const xLabels: number[] = [];
  if (allLevels.length > 0) {
    const step = Math.max(1, Math.ceil((maxLevel - minLevel) / 6));
    for (let l = minLevel; l <= maxLevel; l += step) xLabels.push(l);
    if (xLabels[xLabels.length - 1] !== maxLevel) xLabels.push(maxLevel);
  }
  const innerW = width - PADDING.left - PADDING.right;
  const xPos = (level: number) =>
    PADDING.left + ((level - minLevel) / Math.max(1, maxLevel - minLevel)) * innerW;

  return (
    <View style={s.wrap} onLayout={onLayout}>
      <View style={s.toggleRow}>
        {hasSingle ? (
          <ToggleChip label="Singles" active={mode === 'single'} color={COLORS.single} onPress={() => setMode('single')} s={s} />
        ) : null}
        {hasDouble ? (
          <ToggleChip label="Doubles" active={mode === 'double'} color={COLORS.double} onPress={() => setMode('double')} s={s} />
        ) : null}
        {hasSingle && hasDouble ? (
          <ToggleChip label="Both" active={mode === 'both'} color={theme.accent} onPress={() => setMode('both')} s={s} />
        ) : null}
      </View>

      <Svg width={width} height={HEIGHT}>
        <Defs>
          <LinearGradient id="single-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.single} stopOpacity="0.35" />
            <Stop offset="1" stopColor={COLORS.single} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="double-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.double} stopOpacity="0.35" />
            <Stop offset="1" stopColor={COLORS.double} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Y gridlines */}
        {yTickPct.map((pct) => (
          <G key={`y-${pct}`}>
            <Line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={yPos(pct)}
              y2={yPos(pct)}
              stroke={theme.border}
              strokeWidth={pct === 0 ? 1 : 0.5}
              strokeDasharray={pct === 0 || pct === 100 ? undefined : '2 4'}
            />
            <SvgText
              x={PADDING.left - 4}
              y={yPos(pct) + 3}
              fontSize="9"
              fill={theme.textDim}
              textAnchor="end">
              {pct}%
            </SvgText>
          </G>
        ))}

        {/* X labels */}
        {xLabels.map((l) => (
          <SvgText
            key={`x-${l}`}
            x={xPos(l)}
            y={HEIGHT - PADDING.bottom + 12}
            fontSize="9"
            fill={theme.textDim}
            textAnchor="middle">
            {l}
          </SvgText>
        ))}

        {/* Area fills then lines (singles first so doubles draws on top in `both` mode) */}
        {built.single?.areaPath ? <Path d={built.single.areaPath} fill="url(#single-fill)" /> : null}
        {built.double?.areaPath ? <Path d={built.double.areaPath} fill="url(#double-fill)" /> : null}
        {built.single?.linePath ? (
          <Path d={built.single.linePath} stroke={COLORS.single} strokeWidth={2} fill="none" strokeLinejoin="round" />
        ) : null}
        {built.double?.linePath ? (
          <Path d={built.double.linePath} stroke={COLORS.double} strokeWidth={2} fill="none" strokeLinejoin="round" />
        ) : null}
      </Svg>

      {/* Footnote — totals for the visible series. Keeps the chart compact. */}
      <View style={s.footRow}>
        {built.single ? (
          <View style={s.footItem}>
            <View style={[s.footDot, { backgroundColor: COLORS.single }]} />
            <Text style={s.footText}>
              S · {built.single.points.reduce((sum, p) => sum + p.cleared, 0)}/
              {built.single.points.reduce((sum, p) => sum + p.total, 0)} cleared
            </Text>
          </View>
        ) : null}
        {built.double ? (
          <View style={s.footItem}>
            <View style={[s.footDot, { backgroundColor: COLORS.double }]} />
            <Text style={s.footText}>
              D · {built.double.points.reduce((sum, p) => sum + p.cleared, 0)}/
              {built.double.points.reduce((sum, p) => sum + p.total, 0)} cleared
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ToggleChip({ label, active, color, onPress, s }: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.toggleChip,
        active && { backgroundColor: `${color}26`, borderColor: color },
        pressed && { opacity: 0.7 },
      ]}>
      <Text style={[s.toggleText, active && { color }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  wrap: { gap: 8, width: '100%' as const },
  toggleRow: { flexDirection: 'row' as const, gap: 6 },
  toggleChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  toggleText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.5 },
  footRow: { flexDirection: 'row' as const, gap: 12, flexWrap: 'wrap' as const },
  footItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  footDot: { width: 8, height: 8, borderRadius: 2 },
  footText: { fontSize: 10, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
});

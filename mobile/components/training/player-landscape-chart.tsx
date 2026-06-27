import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { TrainingScatterPoint } from '@shared/api';

/**
 * Player Landscape — a native port of the web `PopulationScatterChart`
 * (client/src/pages/TrainingPage.jsx).
 *
 * X = avg load per clear, Y = comfortable level. Each player is a dot (avatar
 * when available); the current user is highlighted with a brand-gold ring. A
 * least-squares regression line + R² summarises the population trend, and faint
 * amber "whiskers" connect each player's comfort level up to their ceiling.
 * Tapping a dot toggles a callout with that player's username + values.
 *
 * Pure presentational: props in, no fetching, no navigation.
 */

const MODE_ACCENTS: Record<NonNullable<Props['mode']>, string> = {
  single: '#ff3366',
  double: '#22C55E',
  overall: '#A855F7',
};

const CEILING_COLOR = '#F59E0B';

const HEIGHT = 240;
// Extra left/bottom room for axis tick labels; right/top room so edge dots and
// their avatars aren't clipped by the plot frame.
const PADDING = { top: 16, right: 16, bottom: 26, left: 30 };

const DOT_R = 4;
const ME_DOT_R = 6;
const AVATAR_SIZE = 14;
const ME_AVATAR_SIZE = 20;

interface Props {
  /** Population scatter for one mode (already fetched by the screen). */
  scatter: TrainingScatterPoint[];
  /**
   * Which projection this scatter belongs to. Only used to tint the trend line
   * to match the web (pink / green / violet). The current-user highlight always
   * uses the brand-gold theme accent regardless of mode. Defaults to the theme
   * accent when omitted.
   */
  mode?: 'single' | 'double' | 'overall';
  /** Fixed width override. When omitted the chart measures its container. */
  width?: number;
}

interface Plotted extends TrainingScatterPoint {
  /** Pixel coords inside the SVG. */
  x: number;
  comfortY: number;
  ceilingY: number;
}

interface Regression {
  slope: number;
  intercept: number;
  r2: number;
}

function computeRegression(scatter: TrainingScatterPoint[]): Regression {
  const n = scatter.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
  const sumX = scatter.reduce((acc, p) => acc + p.avg_load_per_clear, 0);
  const sumY = scatter.reduce((acc, p) => acc + p.comfortable_level, 0);
  const sumXY = scatter.reduce((acc, p) => acc + p.avg_load_per_clear * p.comfortable_level, 0);
  const sumX2 = scatter.reduce((acc, p) => acc + p.avg_load_per_clear * p.avg_load_per_clear, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = scatter.reduce((acc, p) => acc + (p.comfortable_level - meanY) ** 2, 0);
  const ssRes = scatter.reduce(
    (acc, p) => acc + (p.comfortable_level - (slope * p.avg_load_per_clear + intercept)) ** 2,
    0,
  );
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

/** "Nice" axis step (1/2/5 × 10ⁿ) for roughly `targetTicks` divisions. */
function niceStep(range: number, targetTicks: number): number {
  if (range <= 0) return 1;
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  const factor = residual <= 1.5 ? 1 : residual <= 3 ? 2 : residual <= 7 ? 5 : 10;
  return factor * mag;
}

function formatLoad(load: number): string {
  return load >= 1000 ? `${(load / 1000).toFixed(1)}k` : String(Math.round(load));
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

export function PlayerLandscapeChart({ scatter, mode, width: widthProp }: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [measured, setMeasured] = useState(320);
  const [selected, setSelected] = useState<string | null>(null);

  const width = widthProp ?? measured;
  const modePrefix = mode === 'single' ? 'S' : mode === 'double' ? 'D' : '';
  const trendColor = mode ? MODE_ACCENTS[mode] : theme.accent;
  const meColor = theme.accent;

  const onLayout = (e: LayoutChangeEvent) => {
    if (widthProp != null) return;
    const w = Math.max(0, e.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - measured) > 1) setMeasured(w);
  };

  const innerW = Math.max(1, width - PADDING.left - PADDING.right);
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;

  // Auto-scale to the data with sensible padding (mirrors the web math).
  const model = useMemo(() => {
    if (scatter.length === 0) return null;
    const loads = scatter.map((p) => p.avg_load_per_clear);
    const levels = scatter.flatMap((p) => [p.comfortable_level, p.ceiling_level]);
    const dataMinLoad = Math.min(...loads);
    const dataMaxLoad = Math.max(...loads);
    const dataMinLevel = Math.min(...levels);
    const dataMaxLevel = Math.max(...levels);
    const loadPad = Math.max(50, (dataMaxLoad - dataMinLoad) * 0.12);
    const minLoad = dataMinLoad - loadPad;
    const maxLoad = dataMaxLoad + loadPad;
    const minLevel = dataMinLevel - 1;
    const maxLevel = dataMaxLevel + 1;
    const loadRange = maxLoad - minLoad || 1;
    const levelRange = maxLevel - minLevel || 1;

    const xPx = (load: number) => PADDING.left + ((load - minLoad) / loadRange) * innerW;
    const yPx = (level: number) =>
      PADDING.top + (1 - (level - minLevel) / levelRange) * innerH;

    const points: Plotted[] = scatter.map((p) => ({
      ...p,
      x: xPx(p.avg_load_per_clear),
      comfortY: yPx(p.comfortable_level),
      ceilingY: yPx(p.ceiling_level),
    }));

    // X ticks (load) on a nice step; Y ticks at each integer level in range.
    const xStep = niceStep(loadRange, 5);
    const xTicks: number[] = [];
    for (let v = Math.ceil(minLoad / xStep) * xStep; v <= maxLoad; v += xStep) {
      xTicks.push(Math.round(v));
    }
    const yTicks: number[] = [];
    for (let v = Math.ceil(minLevel); v <= Math.floor(maxLevel); v += 1) yTicks.push(v);

    const reg = computeRegression(scatter);
    const trend = {
      x1: xPx(dataMinLoad),
      y1: yPx(reg.slope * dataMinLoad + reg.intercept),
      x2: xPx(dataMaxLoad),
      y2: yPx(reg.slope * dataMaxLoad + reg.intercept),
    };

    return { points, xTicks, yTicks, xPx, yPx, reg, trend };
  }, [scatter, innerW, innerH]);

  // Web hides the chart with fewer than 3 points (regression is meaningless).
  if (!model || scatter.length < 3) return null;

  const { points, xTicks, yTicks, reg, trend } = model;
  const selectedPoint = selected ? points.find((p) => p.username === selected) ?? null : null;

  return (
    <View style={s.card} onLayout={onLayout}>
      <View style={s.header}>
        <Text style={s.title}>Player Landscape</Text>
        <Text style={s.subtitle}>R² = {reg.r2.toFixed(2)} correlation</Text>
      </View>

      <View style={s.plot}>
        <Svg width={width} height={HEIGHT}>
          {/* Y gridlines + level labels */}
          {yTicks.map((level) => {
            const y = model.yPx(level);
            if (y < PADDING.top - 1 || y > HEIGHT - PADDING.bottom + 1) return null;
            return (
              <G key={`y-${level}`}>
                <Line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke={theme.border}
                  strokeWidth={0.5}
                />
                <SvgText x={PADDING.left - 5} y={y + 3} fontSize="9" fill={theme.textDim} textAnchor="end">
                  {modePrefix}
                  {level}
                </SvgText>
              </G>
            );
          })}

          {/* X gridlines + load labels */}
          {xTicks.map((load) => {
            const x = model.xPx(load);
            if (x < PADDING.left - 1 || x > width - PADDING.right + 1) return null;
            return (
              <G key={`x-${load}`}>
                <Line
                  x1={x}
                  x2={x}
                  y1={PADDING.top}
                  y2={HEIGHT - PADDING.bottom}
                  stroke={theme.border}
                  strokeWidth={0.5}
                />
                <SvgText
                  x={x}
                  y={HEIGHT - PADDING.bottom + 13}
                  fontSize="8"
                  fill={theme.textDim}
                  textAnchor="middle">
                  {formatLoad(load)}
                </SvgText>
              </G>
            );
          })}

          {/* Ceiling whiskers: comfort → ceiling, faint amber */}
          {points.map((p) =>
            p.ceiling_level > p.comfortable_level ? (
              <G key={`whisk-${p.username}`}>
                <Line
                  x1={p.x}
                  y1={p.comfortY}
                  x2={p.x}
                  y2={p.ceilingY}
                  stroke={CEILING_COLOR}
                  strokeOpacity={0.4}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <Circle cx={p.x} cy={p.ceilingY} r={2} fill={CEILING_COLOR} fillOpacity={0.55} />
              </G>
            ) : null,
          )}

          {/* Least-squares trend line */}
          <Line
            x1={trend.x1}
            y1={trend.y1}
            x2={trend.x2}
            y2={trend.y2}
            stroke={trendColor}
            strokeOpacity={0.5}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />

          {/* Plain dots — drawn for every point so something always renders even
              while avatar images load. The current user gets a gold ring. */}
          {points.map((p) => {
            const isMe = !!p.is_current_user;
            const isActive = p.username === selected;
            const r = isMe ? ME_DOT_R : DOT_R;
            return (
              <G key={`dot-${p.username}`}>
                {isMe ? (
                  <Circle cx={p.x} cy={p.comfortY} r={r + 2.5} fill="none" stroke={meColor} strokeWidth={1.5} />
                ) : null}
                <Circle
                  cx={p.x}
                  cy={p.comfortY}
                  r={r}
                  fill={isMe ? meColor : isActive ? trendColor : theme.textMuted}
                  fillOpacity={p.avatar_url ? 0 : isMe ? 1 : 0.85}
                />
              </G>
            );
          })}
        </Svg>

        {/* Avatar overlay: expo-image clipped to a circle, layered over the SVG.
            Falls back silently to the SVG dot when there's no avatar / it fails. */}
        {points.map((p) => {
          const uri = fullImageUrl(p.avatar_url);
          if (!uri) return null;
          const isMe = !!p.is_current_user;
          const size = isMe ? ME_AVATAR_SIZE : AVATAR_SIZE;
          return (
            <View
              key={`av-${p.username}`}
              pointerEvents="none"
              style={[
                s.avatarWrap,
                {
                  left: p.x - size / 2,
                  top: p.comfortY - size / 2,
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderColor: isMe ? meColor : theme.border,
                  borderWidth: isMe ? 1.5 : StyleSheet.hairlineWidth,
                },
              ]}>
              <Image source={{ uri }} style={s.avatarImg} contentFit="cover" transition={120} />
            </View>
          );
        })}

        {/* Tap targets: invisible, generously sized for fingers, above avatars. */}
        {points.map((p) => {
          const hit = 22;
          return (
            <Pressable
              key={`hit-${p.username}`}
              onPress={() => setSelected((cur) => (cur === p.username ? null : p.username))}
              style={[s.hit, { left: p.x - hit / 2, top: p.comfortY - hit / 2, width: hit, height: hit }]}
            />
          );
        })}

        {/* Selected-point callout, clamped to the plot horizontally and flipped
            below the dot when it sits near the top edge. */}
        {selectedPoint ? (
          <SelectedCallout
            point={selectedPoint}
            width={width}
            modePrefix={modePrefix}
            s={s}
          />
        ) : null}

        {/* Rotated Y-axis title */}
        <Text style={s.yAxisLabel}>Comfort level</Text>
      </View>

      {/* Caption / legend explaining the two axes + the amber whiskers. */}
      <View style={s.legend}>
        <Text style={s.legendText}>
          X: avg load per clear  ·  Y: comfortable level
        </Text>
        <View style={s.legendRow}>
          <View style={[s.legendDot, { backgroundColor: meColor }]} />
          <Text style={s.legendText}>You</Text>
          <View style={[s.legendLine, { backgroundColor: CEILING_COLOR }]} />
          <Text style={s.legendText}>comfort → ceiling</Text>
        </View>
        <Text style={s.legendHint}>Tap any dot for that player&apos;s numbers.</Text>
      </View>
    </View>
  );
}

function SelectedCallout({
  point,
  width,
  modePrefix,
  s,
}: {
  point: Plotted;
  width: number;
  modePrefix: string;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
}) {
  const CALLOUT_W = 150;
  // Clamp horizontally so the callout never runs off the plot edge.
  const left = Math.min(Math.max(point.x - CALLOUT_W / 2, 4), Math.max(4, width - CALLOUT_W - 4));
  const flipBelow = point.comfortY < PADDING.top + 44;
  const top = flipBelow ? point.comfortY + 10 : point.comfortY - 48;
  return (
    <View pointerEvents="none" style={[s.callout, { left, top, width: CALLOUT_W }]}>
      <Text style={s.calloutName} numberOfLines={1}>
        {point.username}
      </Text>
      <Text style={s.calloutMeta} numberOfLines={1}>
        {formatNumber(point.avg_load_per_clear)} load · {modePrefix}
        {point.comfortable_level} → {modePrefix}
        {point.ceiling_level}
      </Text>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  card: {
    width: '100%' as const,
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingVertical: 12,
    overflow: 'hidden' as const,
  },
  header: { paddingHorizontal: 14, marginBottom: 6 },
  title: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  subtitle: { fontSize: 10, color: t.textDim, marginTop: 2, fontVariant: ['tabular-nums' as const] },
  plot: {
    position: 'relative' as const,
    marginHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
    overflow: 'hidden' as const,
  },
  avatarWrap: {
    position: 'absolute' as const,
    overflow: 'hidden' as const,
    backgroundColor: t.card,
  },
  avatarImg: { width: '100%' as const, height: '100%' as const },
  hit: { position: 'absolute' as const, backgroundColor: 'transparent' },
  callout: {
    position: 'absolute' as const,
    backgroundColor: t.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 10,
  },
  calloutName: { fontSize: 11, fontWeight: '800' as const, color: t.text },
  calloutMeta: {
    fontSize: 9,
    color: t.textMuted,
    marginTop: 1,
    fontVariant: ['tabular-nums' as const],
  },
  yAxisLabel: {
    position: 'absolute' as const,
    left: -22,
    top: '50%' as const,
    width: 64,
    textAlign: 'center' as const,
    transform: [{ rotate: '-90deg' }],
    fontSize: 8,
    color: t.textDim,
  },
  legend: { paddingHorizontal: 14, marginTop: 8, gap: 3 },
  legendRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  legendText: { fontSize: 10, color: t.textMuted },
  legendHint: { fontSize: 9, color: t.textDim },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLine: { width: 12, height: 2, borderRadius: 1, marginLeft: 6 },
});

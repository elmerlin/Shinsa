import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';
import { DEFAULT_MAX_HR, hrZoneColor, hrZonesFor, parseHrSeries } from '@/lib/heartRate';

interface Props {
  avg?: number;
  peak?: number;
  /** Stored hr_series — JSON string or number[]. */
  series?: unknown;
  /** 'workout' (watch session) or 'samples'. */
  source?: string;
  /** Seconds the series spans (captured sample window). */
  durationS?: number;
  /** The chart's catalog length (songs.duration_seconds) — preferred for the x-axis. */
  songDurationS?: number;
  /** The PLAYER's effective max HR — places their personal zone bands. */
  maxHr?: number;
  /** Tighter layout for narrow contexts. */
  compact?: boolean;
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Plays captured before hr_duration_s existed have no stored span. The
// capture window is WINDOW_BEFORE+AFTER ≈ 115s — close to a typical PIU song
// — so use it as the approximate axis until the next sync stores the truth.
const FALLBACK_DURATION_S = 115;

// Heart-rate readout for a play: ♥ avg/peak header, then the HR curve as a
// line chart drawn over horizontal stripes marking the player's personal
// zones (% of their max HR). react-native-svg renders identically on web,
// iOS and Android.
export function HeartRateStrip({ avg, peak, series, source, durationS, songDurationS, maxHr, compact }: Props) {
  const [chartW, setChartW] = useState(0);
  const avgBpm = Math.round(Number(avg) || 0);
  const peakBpm = Math.round(Number(peak) || 0);
  const points = parseHrSeries(series);
  if (avgBpm <= 0 && peakBpm <= 0) return null;

  const effectiveMax = Number(maxHr) >= 120 ? Number(maxHr) : DEFAULT_MAX_HR;
  const chartH = compact ? 44 : 84;
  // Axis priority: catalog song length (same source as replay embeds) →
  // captured sample span → approximate capture window.
  const dur = Number(songDurationS) > 0
    ? Number(songDurationS)
    : Number(durationS) > 0
      ? Number(durationS)
      : (points.length > 1 ? FALLBACK_DURATION_S : 0);

  // Y-range: pad around the series so the curve fills the chart, then snap to
  // zone boundaries when they're close so bands read cleanly.
  let lo = 90;
  let hi = 190;
  if (points.length > 0) {
    lo = Math.min(...points) - 8;
    hi = Math.max(...points) + 8;
    if (hi - lo < 30) { const mid = (hi + lo) / 2; lo = mid - 15; hi = mid + 15; }
  }
  const yFor = (bpm: number) => chartH - ((bpm - lo) / (hi - lo)) * chartH;

  const zones = hrZonesFor(effectiveMax);
  const bands = zones
    .map((z) => {
      const top = Math.min(z.max, hi);
      const bottom = Math.max(z.min, lo);
      if (top <= bottom) return null;
      return { key: z.key, color: z.color, y: yFor(top), h: yFor(bottom) - yFor(top) };
    })
    .filter((b): b is NonNullable<typeof b> => !!b);

  const linePoints = points
    .map((bpm, i) => `${((i / Math.max(1, points.length - 1)) * chartW).toFixed(1)},${yFor(bpm).toFixed(1)}`)
    .join(' ');

  const onLayout = (e: LayoutChangeEvent) => setChartW(Math.round(e.nativeEvent.layout.width));

  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      <View style={s.header}>
        <Text style={[s.heart, compact && s.heartCompact]}>♥</Text>
        <Text style={[s.avg, compact && s.avgCompact]}>{avgBpm > 0 ? avgBpm : '—'}</Text>
        <Text style={s.unit}>BPM avg</Text>
        <View style={s.spacer} />
        {peakBpm > 0 ? (
          <>
            <Text style={s.peakLabel}>PEAK</Text>
            <Text style={[s.peak, { color: hrZoneColor(peakBpm, effectiveMax) }]}>{peakBpm}</Text>
          </>
        ) : null}
      </View>

      {points.length > 1 ? (
        <View style={{ height: chartH }} onLayout={onLayout}>
          {chartW > 0 ? (
            <Svg width={chartW} height={chartH}>
              {bands.map((b) => (
                <Rect key={b.key} x={0} y={b.y} width={chartW} height={b.h} fill={b.color} opacity={0.16} />
              ))}
              {[0.25, 0.5, 0.75].map((f) => (
                <Rect key={f} x={chartW * f} y={0} width={StyleSheet.hairlineWidth || 1} height={chartH} fill="#ffffff" opacity={0.14} />
              ))}
              <Polyline
                points={linePoints}
                fill="none"
                stroke="#ffffff"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </Svg>
          ) : null}
        </View>
      ) : null}

      {points.length > 1 && dur > 0 ? (
        <View style={s.axis}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <Text key={f} style={s.axisLabel}>{fmtClock(dur * f)}</Text>
          ))}
        </View>
      ) : null}

      {source === 'workout' && !compact ? (
        <Text style={s.source}>Watch workout · zones from max {effectiveMax} BPM</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    gap: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248,113,113,0.30)',
  },
  wrapCompact: { padding: 6, gap: 4, borderRadius: 10 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  heart: { fontSize: 16, color: '#f87171', lineHeight: 20 },
  heartCompact: { fontSize: 12 },
  avg: { fontSize: 22, fontWeight: '900', color: '#fff', fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  avgCompact: { fontSize: 14 },
  unit: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, textTransform: 'uppercase' },
  spacer: { flex: 1 },
  peakLabel: { fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  peak: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
  axisLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.4)', fontVariant: ['tabular-nums'] },
  source: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.4 },
});

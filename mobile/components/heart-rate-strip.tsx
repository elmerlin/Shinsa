import { StyleSheet, Text, View } from 'react-native';
import { hrZoneColor, parseHrSeries } from '@/lib/heartRate';

interface Props {
  avg?: number;
  peak?: number;
  /** Stored hr_series — JSON string or number[]. */
  series?: unknown;
  /** 'workout' (Apple Watch session) or 'samples'. */
  source?: string;
  /** Tighter layout for narrow contexts. */
  compact?: boolean;
}

// A self-contained heart-rate readout for the dark score card: a ♥ avg/peak
// header plus a zone-colored bar sparkline of the HR curve during the play.
// No chart dependency — plain Views so it renders identically on web, iOS and
// Android.
export function HeartRateStrip({ avg, peak, series, source, compact }: Props) {
  const avgBpm = Math.round(Number(avg) || 0);
  const peakBpm = Math.round(Number(peak) || 0);
  const points = parseHrSeries(series);
  if (avgBpm <= 0 && peakBpm <= 0) return null;

  // Normalize bar heights over a padded dynamic range so the curve fills the
  // strip nicely regardless of how hard the player was working.
  const barMax = compact ? 18 : 30;
  const barMin = 3;
  let lo = 80;
  let hi = 195;
  if (points.length > 0) {
    lo = Math.max(60, Math.min(...points) - 6);
    hi = Math.max(lo + 10, Math.max(...points) + 4);
  }
  const heightFor = (bpm: number) => {
    const t = Math.max(0, Math.min(1, (bpm - lo) / (hi - lo)));
    return barMin + t * (barMax - barMin);
  };

  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      <View style={s.header}>
        <Text style={[s.heart, compact && s.heartCompact]}>♥</Text>
        <Text style={[s.avg, compact && s.avgCompact]}>{avgBpm > 0 ? avgBpm : '—'}</Text>
        <Text style={s.unit}>BPM avg</Text>
        {peakBpm > 0 ? (
          <>
            <View style={s.spacer} />
            <Text style={s.peakLabel}>PEAK</Text>
            <Text style={[s.peak, { color: hrZoneColor(peakBpm) }]}>{peakBpm}</Text>
          </>
        ) : null}
      </View>

      {points.length > 1 ? (
        <View style={[s.spark, { height: barMax }]}>
          {points.map((bpm, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: heightFor(bpm),
                backgroundColor: hrZoneColor(bpm),
                borderRadius: 1.5,
                marginRight: 1,
                opacity: 0.92,
              }}
            />
          ))}
        </View>
      ) : null}

      {source === 'workout' && !compact ? (
        <Text style={s.source}>Apple Watch workout</Text>
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
  spark: { flexDirection: 'row', alignItems: 'flex-end' },
  source: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.4 },
});

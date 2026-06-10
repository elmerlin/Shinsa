import { StyleSheet, Text, View } from 'react-native';
import { HR_ZONE_META } from '@/lib/heartRate';

interface Props {
  zoneSeconds: Record<string, number>;
  /** Label/value text colors so the bar works on themed and dark cards. */
  labelColor?: string;
  valueColor?: string;
}

// Horizontal stacked time-in-zone bar + per-zone legend. Shared by the cardio
// screen and the live-session recap HR slide.
export function HrZoneBar({ zoneSeconds, labelColor = 'rgba(255,255,255,0.6)', valueColor = '#fff' }: Props) {
  const total = HR_ZONE_META.reduce((sum, z) => sum + (Number(zoneSeconds[z.key]) || 0), 0);
  if (total <= 0) return null;
  return (
    <View style={s.wrap}>
      <View style={s.bar}>
        {HR_ZONE_META.map((z) => {
          const sec = Number(zoneSeconds[z.key]) || 0;
          if (sec <= 0) return null;
          return <View key={z.key} style={{ flex: sec, backgroundColor: z.color }} />;
        })}
      </View>
      <View style={s.legend}>
        {HR_ZONE_META.map((z) => {
          const sec = Number(zoneSeconds[z.key]) || 0;
          if (sec <= 0) return null;
          const pct = Math.round((sec / total) * 100);
          return (
            <View key={z.key} style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: z.color }]} />
              <Text style={[s.legendLabel, { color: labelColor }]}>{z.label}</Text>
              <Text style={[s.legendVal, { color: valueColor }]}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, fontWeight: '700' },
  legendVal: { fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
});

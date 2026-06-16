import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PadCalibration } from '@/lib/movement/types';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  calibration: PadCalibration;
  activeZoneId?: string | null;
  confirmedZoneIds?: string[];
  onConfirmZone?: (zoneId: string) => void;
}

export function PadCalibrationOverlay({
  calibration,
  activeZoneId,
  confirmedZoneIds = [],
  onConfirmZone,
}: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const confirmed = new Set(confirmedZoneIds);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
        {calibration.zones.map((zone) => {
          const active = zone.id === activeZoneId;
          const done = confirmed.has(zone.id);
          return (
            <Polygon
              key={zone.id}
              points={zone.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
              fill={active ? `${theme.accent}55` : done ? 'rgba(74,222,128,0.28)' : 'rgba(255,255,255,0.08)'}
              stroke={active ? theme.accent : done ? '#4ade80' : theme.borderStrong}
              strokeWidth={active ? 0.012 : 0.006}
            />
          );
        })}
      </Svg>
      <View style={s.legend}>
        <Text style={s.legendTitle}>Calibration zones</Text>
        <Text style={s.legendBody}>Tap panels below to confirm the pad geometry.</Text>
      </View>
      <View style={s.zoneRow}>
        {calibration.zones.slice(0, calibration.mode === 'singles' ? 5 : 10).map((zone) => {
          const active = zone.id === activeZoneId;
          return (
            <Pressable
              key={zone.id}
              onPress={() => onConfirmZone?.(zone.id)}
              style={({ pressed }) => [
                s.zoneChip,
                active && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                confirmed.has(zone.id) && s.zoneChipConfirmed,
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={[s.zoneChipText, active && { color: theme.accent }]} numberOfLines={1}>
                {zone.id}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  legend: {
    position: 'absolute' as const,
    left: 12,
    top: 12,
    maxWidth: 210,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 8,
    borderColor: t.border,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  legendTitle: {
    color: t.text,
    fontSize: 12,
    fontWeight: '900' as const,
  },
  legendBody: {
    color: t.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  zoneRow: {
    position: 'absolute' as const,
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  zoneChip: {
    minWidth: 56,
    minHeight: 30,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  zoneChipConfirmed: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74,222,128,0.14)',
  },
  zoneChipText: {
    color: t.text,
    fontSize: 10,
    fontWeight: '800' as const,
  },
});

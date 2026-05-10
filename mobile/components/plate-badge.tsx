import { StyleSheet, Text } from 'react-native';
import { getPlateStyle, normalizePlate } from '@/lib/plates';

interface Props {
  plate: unknown;
  size?: 'xs' | 'sm';
}

export function PlateBadge({ plate, size = 'xs' }: Props) {
  const code = normalizePlate(plate);
  if (!code) return null;
  const style = getPlateStyle(code);
  const fontSize = size === 'xs' ? 9 : 11;
  const padH = size === 'xs' ? 5 : 7;
  const padV = size === 'xs' ? 1 : 2;

  return (
    <Text
      style={[
        styles.badge,
        {
          fontSize,
          paddingHorizontal: padH,
          paddingVertical: padV,
          backgroundColor: style.bg,
          color: style.fg,
          borderColor: style.border,
        },
      ]}>
      {code}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontWeight: '800',
    letterSpacing: 0.5,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});

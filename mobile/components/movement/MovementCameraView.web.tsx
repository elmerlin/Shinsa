import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  isActive?: boolean;
  children?: React.ReactNode;
  onPermissionChange?: (granted: boolean) => void;
}

export function MovementCameraView({ children }: Props) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.fallback}>
      <Text style={s.title}>Native camera required</Text>
      <Text style={s.body}>Open Shinsa on iOS or Android to run Movement Lab.</Text>
      {children}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  fallback: {
    minHeight: 360,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
    gap: 8,
  },
  title: {
    color: t.text,
    fontSize: 20,
    fontWeight: '900' as const,
  },
  body: {
    color: t.textMuted,
    fontSize: 13,
    textAlign: 'center' as const,
    lineHeight: 19,
  },
});

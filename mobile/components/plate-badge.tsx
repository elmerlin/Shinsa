import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { normalizePlate, type PlateCode } from '@/lib/plates';

interface Props {
  plate: unknown;
  size?: 'xs' | 'sm' | 'md';
}

interface PlateTheme {
  panel: readonly [string, string];
  code: string;
  glow: string;
  border: string;
}

// Themed per plate code — mirrors the web's BLUE/GOLD/SILVER/ORANGE plate
// colour groups but adapted for native rendering (single solid colour for the
// code rather than a gradient text fill, which doesn't render reliably in RN).
const THEMES: Record<PlateCode, PlateTheme> = {
  PG: { panel: ['#242e3f', '#121825'], code: '#86e8ff', glow: 'rgba(56,189,248,0.45)', border: 'rgba(118,205,255,0.35)' },
  UG: { panel: ['#242e3f', '#121825'], code: '#86e8ff', glow: 'rgba(56,189,248,0.45)', border: 'rgba(118,205,255,0.35)' },
  EG: { panel: ['#312a19', '#1b160c'], code: '#ffd84b', glow: 'rgba(250,204,21,0.45)', border: 'rgba(250,204,21,0.35)' },
  SG: { panel: ['#312a19', '#1b160c'], code: '#ffd84b', glow: 'rgba(250,204,21,0.45)', border: 'rgba(250,204,21,0.35)' },
  MG: { panel: ['#2c2e34', '#171a21'], code: '#ece8e1', glow: 'rgba(226,232,240,0.4)', border: 'rgba(226,232,240,0.3)' },
  TG: { panel: ['#2c2e34', '#171a21'], code: '#ece8e1', glow: 'rgba(226,232,240,0.4)', border: 'rgba(226,232,240,0.3)' },
  FG: { panel: ['#332618', '#1c120a'], code: '#ffab39', glow: 'rgba(251,146,60,0.45)', border: 'rgba(251,146,60,0.35)' },
  RG: { panel: ['#332618', '#1c120a'], code: '#ffab39', glow: 'rgba(251,146,60,0.45)', border: 'rgba(251,146,60,0.35)' },
};

interface SizeSpec {
  width: number;
  height: number;
  fontSize: number;
  paddingH: number;
  borderRadius: number;
}

const SIZES: Record<NonNullable<Props['size']>, SizeSpec> = {
  xs: { width: 26, height: 16, fontSize: 9, paddingH: 4, borderRadius: 4 },
  sm: { width: 32, height: 20, fontSize: 11, paddingH: 5, borderRadius: 5 },
  md: { width: 42, height: 26, fontSize: 13, paddingH: 7, borderRadius: 6 },
};

export function PlateBadge({ plate, size = 'xs' }: Props) {
  const code = normalizePlate(plate);
  if (!code) return null;
  const theme = THEMES[code];
  const dim = SIZES[size];

  return (
    <View
      style={[
        styles.outer,
        {
          width: dim.width,
          height: dim.height,
          borderRadius: dim.borderRadius,
          shadowColor: theme.glow,
        },
      ]}>
      <LinearGradient
        colors={theme.panel}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          styles.panel,
          {
            borderRadius: dim.borderRadius,
            borderColor: theme.border,
            paddingHorizontal: dim.paddingH,
          },
        ]}>
        <Text
          style={[
            styles.code,
            {
              fontSize: dim.fontSize,
              color: theme.code,
              textShadowColor: theme.glow,
            },
          ]}>
          {code}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
  panel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  code: {
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});

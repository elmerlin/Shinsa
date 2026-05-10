import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

type ChartMode = 'Single' | 'Double' | 'CoOp' | 'UCS' | string;

interface Props {
  mode?: ChartMode;
  level?: number | string;
  size?: 'xs' | 'sm' | 'md';
}

const MODE_GRADIENTS: Record<string, readonly [string, string, string]> = {
  Single: ['#ff7a7a', '#d93d62', '#7a1730'],
  Double: ['#4cf4aa', '#16b77f', '#0b5d48'],
  CoOp: ['#69c8ff', '#2b88de', '#12457c'],
  UCS: ['#cdb4ff', '#7c3aed', '#3b0764'],
};

const SIZES = {
  xs: { dim: 22, font: 9 },
  sm: { dim: 26, font: 10 },
  md: { dim: 32, font: 12 },
} as const;

function getModeShort(mode?: string): string {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  if (mode === 'UCS') return 'UCS';
  const norm = String(mode || '').trim().toUpperCase();
  if (norm === 'USERCUSTOMSTEP' || norm === 'USER CUSTOM STEP') return 'UCS';
  return norm ? norm[0] : 'X';
}

/**
 * Standalone mode + level chip without a jacket frame. Used when the song
 * jacket is rendered elsewhere (e.g. as a card background) and we just need
 * the difficulty marker.
 */
export function ChartBadge({ mode, level, size = 'sm' }: Props) {
  const dim = SIZES[size];
  const colors = MODE_GRADIENTS[mode || ''] ?? MODE_GRADIENTS.CoOp;
  const short = getModeShort(mode);
  // Mode is conveyed by colour (red/green/blue/purple), so we drop the letter
  // prefix and show only the level number. UCS keeps its label.
  const label = short === 'UCS'
    ? 'UCS'
    : String(parseInt(String(level ?? ''), 10) || level || '?');

  return (
    <View style={[styles.outer, { width: dim.dim + 14, height: dim.dim }]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.pill, { borderRadius: dim.dim / 2 }]}>
        <Text style={[styles.label, { fontSize: dim.font }]}>{label}</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 2,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  label: {
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.4,
  },
});

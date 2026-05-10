import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, Text, View } from 'react-native';

type ChartMode = 'Single' | 'Double' | 'CoOp' | 'UCS' | string;
export type ChartJacketSize = 'xs' | 'sm' | 'md' | 'wide';

interface Props {
  /** Jacket image URL (already absolute). */
  jacketUrl?: string;
  mode?: ChartMode;
  level?: number | string;
  size?: ChartJacketSize;
  /** Suppress the level/mode badge (used when only the jacket is needed). */
  withBadge?: boolean;
  /** Optional fallback letter (defaults to first char of an empty title). */
  fallback?: string;
}

interface Dim {
  w: number;
  h: number;
  badgeSize: number;
  fontSize: number;
  radius: number;
}

const SIZES: Record<ChartJacketSize, Dim> = {
  xs: { w: 56, h: 32, badgeSize: 14, fontSize: 8, radius: 6 },
  sm: { w: 72, h: 42, badgeSize: 18, fontSize: 10, radius: 7 },
  md: { w: 96, h: 56, badgeSize: 22, fontSize: 12, radius: 8 },
  wide: { w: 128, h: 74, badgeSize: 26, fontSize: 14, radius: 10 },
};

// Mode → 3-stop gradient (top → middle → bottom)
const MODE_GRADIENTS: Record<string, readonly [string, string, string]> = {
  Single: ['#ff7a7a', '#d93d62', '#7a1730'], // red
  Double: ['#4cf4aa', '#16b77f', '#0b5d48'], // green
  CoOp: ['#69c8ff', '#2b88de', '#12457c'],   // blue
  UCS: ['#cdb4ff', '#7c3aed', '#3b0764'],    // purple
};

function getModeShort(mode?: string): string {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  if (mode === 'UCS') return 'UCS';
  const norm = String(mode || '').trim().toUpperCase();
  if (norm === 'USERCUSTOMSTEP' || norm === 'USER CUSTOM STEP') return 'UCS';
  return norm ? norm[0] : 'X';
}

function getBadgeLabel(mode?: string, level?: number | string): string {
  // Mode is conveyed by badge color (red=Single, green=Double, blue=CoOp,
  // purple=UCS) so we drop the letter prefix and show only the level number.
  // UCS doesn't have a numeric level, so it keeps its label.
  if (getModeShort(mode) === 'UCS') return 'UCS';
  const parsed = parseInt(String(level ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return String(parsed);
  return String(level || '').trim() || '?';
}

export function ChartJacket({
  jacketUrl,
  mode,
  level,
  size = 'sm',
  withBadge = true,
  fallback,
}: Props) {
  const dim = SIZES[size];
  const colors = MODE_GRADIENTS[mode || ''] ?? MODE_GRADIENTS.CoOp;
  const label = getBadgeLabel(mode, level);

  return (
    <View style={{ width: dim.w, height: dim.h }}>
      <View style={[styles.frame, { width: dim.w, height: dim.h, borderRadius: dim.radius }]}>
        {jacketUrl ? (
          <Image source={{ uri: jacketUrl }} style={styles.image} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.fallback, { borderRadius: dim.radius }]}>
            <Text style={[styles.fallbackText, { fontSize: dim.fontSize + 2 }]}>{fallback || '?'}</Text>
          </View>
        )}
        <View style={styles.gradientOverlay} pointerEvents="none" />
      </View>
      {withBadge ? (
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            styles.badge,
            {
              width: dim.badgeSize,
              height: dim.badgeSize,
              borderRadius: dim.badgeSize / 2,
              right: -3,
              bottom: -3,
            },
          ]}>
          <Text style={[styles.badgeText, { fontSize: dim.fontSize }]}>{label}</Text>
        </LinearGradient>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#08101c',
  },
  image: { width: '100%', height: '100%' },
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101a2c',
  },
  fallbackText: { color: '#475569', fontWeight: '900' },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0)',
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  badgeText: {
    fontWeight: '700',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
    fontFamily: Platform.select({
      ios: 'Avenir Next',
      android: 'sans-serif-medium',
      default: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    }),
  },
});

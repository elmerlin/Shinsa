import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';

export interface QuickNavButtonProps {
  label: string;
  href: string;
  /** SF Symbol name (mapped to MaterialIcons on web/Android via icon-symbol). */
  icon: React.ComponentProps<typeof IconSymbol>['name'];
  gradientFrom: string;
  gradientTo: string;
  borderColor: string;
  /** Strong shadow color (matches the gradient family). */
  shadowColor: string;
}

export function QuickNavButton({
  label,
  href,
  icon,
  gradientFrom,
  gradientTo,
  borderColor,
  shadowColor,
}: QuickNavButtonProps) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      style={({ pressed }) => [styles.wrap, pressed && styles.wrapPressed]}>
      <View style={[styles.shadow, { shadowColor }]}>
        <LinearGradient
          colors={[gradientFrom, gradientTo]}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.gradient, { borderColor }]}>
          {/* Top highlight stripe — gives the button visual depth/dimension */}
          <LinearGradient
            colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
            style={styles.highlight}
          />
          <View style={styles.inner}>
            <IconSymbol name={icon} size={16} color="#FFFFFF" />
            {/* `tail` ellipsize so a too-narrow chip degrades to "Train…"
                instead of silently dropping the last character mid-glyph
                — the "Training" chip was losing its `g` descender on
                phones because clip cuts at the container edge, not at
                the glyph boundary. */}
            <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
              {label}
            </Text>
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  wrapPressed: { transform: [{ translateY: 1 }] },
  shadow: {
    borderRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  gradient: {
    borderRadius: 14,
    borderWidth: 1,
    // Shorter chip — was 52 and felt boxy on phones; 44 reads as a quick-action
    // pill while still tappable.
    minHeight: 44,
    // Tight horizontal padding so the icon + "Training" (the longest
    // label) clears the chip edge on ~360 px phones without clipping
    // the descender on the g.
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Let the label shrink before the icon so long words like "Training"
    // don't push past the chip edge.
    flexShrink: 1,
    minWidth: 0,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    // No letter-spacing — the heavy 900 weight is already wide enough,
    // and the 0.4 px tracking was pushing "Training" past the chip edge.
    letterSpacing: 0,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    flexShrink: 1,
    minWidth: 0,
    // Tiny right-side padding so descenders (the g in "Training") never
    // touch the chip edge even when ellipsize math is tight.
    paddingRight: 1,
  },
});

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
            <IconSymbol name={icon} size={20} color="#FFFFFF" />
            <Text style={styles.label}>{label}</Text>
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
    minHeight: 52,
    paddingHorizontal: 8,
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
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.7,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

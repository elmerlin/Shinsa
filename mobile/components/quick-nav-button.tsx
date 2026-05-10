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
}

export function QuickNavButton({ label, href, icon, gradientFrom, gradientTo, borderColor }: QuickNavButtonProps) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.85 }]}>
      <LinearGradient
        colors={[gradientFrom, gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.gradient, { borderColor }]}>
        <View style={styles.inner}>
          <IconSymbol name={icon} size={18} color="#FFFFFF" />
          <Text style={styles.label}>{label}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  gradient: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

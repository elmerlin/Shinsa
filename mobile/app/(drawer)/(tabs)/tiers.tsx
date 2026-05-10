import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HamburgerButton } from '@/components/hamburger-button';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

export default function TiersScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <HamburgerButton />
        <Text style={s.heading}>Tiers</Text>
      </View>

      <View style={s.empty}>
        <Text style={s.emptyTitle}>Tier lists</Text>
        <Text style={s.emptyBody}>Tier list views are coming next.</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 1 },
  empty: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' as const, color: t.text },
  emptyBody: { fontSize: 14, color: t.textMuted, textAlign: 'center' as const },
});

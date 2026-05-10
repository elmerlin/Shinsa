import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HamburgerButton } from '@/components/hamburger-button';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  title: string;
  body?: string;
}

/**
 * Stub screen used for drawer destinations whose mobile UI hasn't been built
 * yet. Visible in the drawer so the unbuilt scope is honest, not hidden.
 */
export function ComingSoon({ title, body = 'Coming soon.' }: Props) {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <HamburgerButton />
        <Text style={s.heading}>{title}</Text>
      </View>
      <View style={s.empty}>
        <Text style={s.emptyTitle}>{title}</Text>
        <Text style={s.emptyBody}>{body}</Text>
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

import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/theme-context';
import type { ThemeColors } from '@/constants/theme';

/**
 * Build a StyleSheet from the current theme. Re-runs when the theme changes.
 *
 * Define the factory at module scope (NOT inline in the component body) so the
 * useMemo dep stays stable.
 *
 *   const makeStyles = (t: ThemeColors) => ({
 *     container: { backgroundColor: t.bg, padding: 16 },
 *   });
 *
 *   export default function Screen() {
 *     const styles = useThemedStyles(makeStyles);
 *     ...
 *   }
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: ThemeColors) => T
): T {
  const { theme } = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory]);
}

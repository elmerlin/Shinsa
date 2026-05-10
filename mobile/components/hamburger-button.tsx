import { useNavigation } from 'expo-router';
import { Pressable } from 'react-native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';

interface Props {
  color?: string;
  size?: number;
}

/** Top-left hamburger that opens the side drawer. */
export function HamburgerButton({ color, size = 24 }: Props) {
  const navigation = useNavigation<DrawerNavigationProp<Record<string, object | undefined>>>();
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => navigation.openDrawer?.()}
      hitSlop={12}
      style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.6 : 1 })}>
      <IconSymbol name="line.horizontal.3" size={size} color={color ?? theme.text} />
    </Pressable>
  );
}

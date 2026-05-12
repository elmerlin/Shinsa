import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { fullImageUrl } from '@/lib/images';

interface Props {
  color: string;
  /** Whether this tab is the focused tab. Used for the active ring. */
  focused?: boolean;
  size?: number;
}

/**
 * Bottom-tab Profile icon — three-tier fallback:
 *   1. User's own avatar if set
 *   2. Animated Alien Pig "scary walk" sprite if they've synced PIUGame
 *      (proxied by `pumbility > 0`)
 *   3. Generic person glyph for brand-new accounts
 *
 * Active state gets a thin tinted ring so the icon still feels "selected" the
 * way a glyph with `tabBarActiveTintColor` would.
 */
export function ProfileTabIcon({ color, focused, size = 28 }: Props) {
  const { user } = useAuth();
  const url = typeof user?.avatar === 'string' ? fullImageUrl(user.avatar) : undefined;
  const hasSynced = typeof user?.pumbility === 'number' && user.pumbility > 0;

  const ringSize = size + 4;
  const frameStyle = {
    width: ringSize,
    height: ringSize,
    borderRadius: ringSize / 2,
    borderColor: focused ? color : 'transparent',
  };

  if (!url && hasSynced) {
    return (
      <View style={[styles.frame, frameStyle]}>
        <DefaultAvatar size={size} style={{ opacity: focused ? 1 : 0.85 }} />
      </View>
    );
  }

  if (!url) {
    return <IconSymbol size={size} name="person.fill" color={color} />;
  }

  return (
    <View style={[styles.frame, frameStyle]}>
      <Image
        source={{ uri: url }}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: focused ? 1 : 0.78,
          },
        ]}
        contentFit="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatar: { backgroundColor: 'rgba(255,255,255,0.06)' },
});

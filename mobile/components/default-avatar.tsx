import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

// 8-frame "scary walk" sprite cycle for the Alien Pig character — sourced from
// Pixellab and bundled at build time. We require() the frames so Metro pulls
// them into the bundle rather than fetching them at runtime.
const FRAMES = [
  require('../assets/avatars/scary-walk/frame_000.png'),
  require('../assets/avatars/scary-walk/frame_001.png'),
  require('../assets/avatars/scary-walk/frame_002.png'),
  require('../assets/avatars/scary-walk/frame_003.png'),
  require('../assets/avatars/scary-walk/frame_004.png'),
  require('../assets/avatars/scary-walk/frame_005.png'),
  require('../assets/avatars/scary-walk/frame_006.png'),
  require('../assets/avatars/scary-walk/frame_007.png'),
];

interface Props {
  /** Diameter of the rendered circle. Sprite is square-cropped via centerCrop. */
  size: number;
  /** Milliseconds between frames. ~125ms = 8 fps which reads as a steady walk. */
  frameDuration?: number;
  /** Background color behind the sprite (so transparent edges look intentional). */
  background?: string;
  /** Optional outer style override (border, shadow, etc.). */
  style?: ViewStyle;
}

/**
 * Default avatar — an 8-frame Alien Pig "scary walk" cycle. Used as the
 * fallback when a user hasn't set their own avatar yet but has synced from
 * PIUGame more than once (so we know they're an active player and not a
 * brand-new account).
 */
export function DefaultAvatar({ size, frameDuration = 125, background = '#1a1f2e', style }: Props) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, frameDuration);
    return () => clearInterval(id);
  }, [frameDuration]);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
        },
        style,
      ]}>
      <Image
        source={FRAMES[frame]}
        style={{ width: size, height: size }}
        contentFit="contain"
        // pixel-art preservation — no smoothing as it scales
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

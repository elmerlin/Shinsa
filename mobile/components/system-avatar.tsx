import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

// 8-frame "sad walk" cycle for the Shinsa system bot. Sourced from Pixellab
// (character dccb9ae3) and bundled at build time so Metro inlines the assets.
const FRAMES = [
  require('../assets/avatars/sad-walk/frame_000.png'),
  require('../assets/avatars/sad-walk/frame_001.png'),
  require('../assets/avatars/sad-walk/frame_002.png'),
  require('../assets/avatars/sad-walk/frame_003.png'),
  require('../assets/avatars/sad-walk/frame_004.png'),
  require('../assets/avatars/sad-walk/frame_005.png'),
  require('../assets/avatars/sad-walk/frame_006.png'),
  require('../assets/avatars/sad-walk/frame_007.png'),
];

interface Props {
  /** Diameter of the rendered circle. */
  size: number;
  /** Milliseconds between frames. ~140ms reads as a slow, sad shuffle. */
  frameDuration?: number;
  /** Background color behind the sprite. Defaults to the WC card purple tint. */
  background?: string;
  /** Optional outer style override (border, shadow, etc.). */
  style?: ViewStyle;
}

/**
 * System avatar — the Shinsa bot's "human-faced being" sad-walk sprite. Used
 * for system-generated posts (weekly challenge recaps, announcements) where the
 * author is `__shinsa__` and there is no real player avatar.
 */
export function SystemAvatar({
  size,
  frameDuration = 140,
  background = 'rgba(168, 85, 247, 0.18)',
  style,
}: Props) {
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

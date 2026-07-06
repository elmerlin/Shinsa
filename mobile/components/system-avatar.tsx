import { Image } from 'expo-image';
import { StyleSheet, View, type ViewStyle } from 'react-native';

// The Shinsa "PS" octagon mark — the same brand icon the app ships in its
// header/app-icon, without the wordmark.
const MARK = require('../assets/brand/icon.png');

interface Props {
  /** Diameter of the rendered circle. */
  size: number;
  /** Background color behind the mark. Defaults to a dark plate. */
  background?: string;
  /** Optional outer style override (border, shadow, etc.). */
  style?: ViewStyle;
}

/**
 * System avatar — the Shinsa brand octagon. Used for system-generated posts
 * (weekly challenge recaps, announcements) where the author is the `__shinsa__`
 * system account and there is no real player avatar.
 */
export function SystemAvatar({ size, background = '#0d1017', style }: Props) {
  const pad = Math.round(size * 0.12);
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        style,
      ]}>
      <Image
        source={MARK}
        style={{ width: size - pad * 2, height: size - pad * 2 }}
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

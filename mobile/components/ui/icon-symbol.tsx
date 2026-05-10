// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols → Material Icons mapping. SF Symbols render natively on iOS via
 * icon-symbol.ios.tsx; on Android/web we fall through to MaterialIcons here.
 */
const MAPPING = {
  'house.fill': 'home',
  'trophy.fill': 'emoji-events',
  'bubble.left.and.bubble.right.fill': 'forum',
  'music.note': 'music-note',
  'person.fill': 'person',
  'paperplane.fill': 'send',
  'line.horizontal.3': 'menu',
  'magnifyingglass': 'search',
  'bell.fill': 'notifications',
  'plus': 'add',
  'video.fill': 'videocam',
  'list.bullet.rectangle': 'list',
  'chart.line.uptrend.xyaxis': 'trending-up',
  'arrow.up': 'arrow-upward',
  'play.rectangle.fill': 'play-arrow',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}

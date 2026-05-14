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
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'slider.horizontal.3': 'tune',
  'xmark': 'close',
  'photo': 'photo-library',
  'trash': 'delete-outline',
  'pencil': 'edit',
  'ellipsis': 'more-horiz',
  'square.and.pencil': 'edit-note',
  'list.bullet': 'list',
  'plus.circle.fill': 'add-circle',
  'checkmark': 'check',
  'checkmark.circle.fill': 'check-circle',
  'minus.circle': 'remove-circle-outline',
  'doc.on.doc': 'content-copy',
  'arrow.up.arrow.down': 'swap-vert',
  'arrow.up.circle.fill': 'arrow-circle-up',
  'arrow.down.circle.fill': 'arrow-circle-down',
  'person.2.fill': 'group',
  'eye.fill': 'visibility',
  'link': 'link',
  'tv.fill': 'live-tv',
  'flame.fill': 'whatshot',
  'info.circle': 'info-outline',
  'questionmark.circle': 'help-outline',
  'square.and.arrow.up': 'ios-share',
  // Used by the new top-right icon row (messages + bell + hamburger).
  'message.fill': 'chat',
  // Pet hub sidebar entry — closest MaterialIcon is "pets" (paw print).
  'pawprint.fill': 'pets',
  // Sidebar nav icons (web desktop only). Names must be valid SF Symbols so
  // the iOS variant of IconSymbol (icon-symbol.ios.tsx) still type-checks —
  // the sidebar itself never renders on iOS, but the union is shared.
  'calendar': 'calendar-today',
  'flag.fill': 'flag',
  'sparkles': 'auto-awesome',
  'lightbulb.fill': 'lightbulb',
  'list.number': 'leaderboard',
  'figure.run': 'directions-run',
  'gearshape.fill': 'settings',
  'arrow.right.circle.fill': 'logout',
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

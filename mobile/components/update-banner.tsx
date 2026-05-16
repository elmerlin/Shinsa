import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { useAutoUpdate } from '@/hooks/use-auto-update';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  updater: ReturnType<typeof useAutoUpdate>;
  onPress: () => void;
  onDismiss?: () => void;
}

/**
 * Slim amber banner — surfaces only when the updater's silent check on
 * launch found a newer versionCode. Tapping opens the update sheet;
 * dismissing hides for this session (consumers track the dismissed
 * state so it doesn't keep showing every render).
 */
export function UpdateBanner({ updater, onPress, onDismiss }: Props) {
  const s = useThemedStyles(makeStyles);
  if (!updater.supported) return null;
  const { stage, availability } = updater.state;
  // Only render when the silent check actually found something. During
  // download / install the sheet itself is open and takes over.
  if (stage !== 'available' || !availability) return null;
  const { latest } = availability;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.banner, pressed && { opacity: 0.85 }]}
      accessibilityLabel={`Update to version ${latest.version} available`}>
      <View style={s.dot} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title} numberOfLines={1}>
          Update available — v{latest.version}
        </Text>
        <Text style={s.subtitle} numberOfLines={1}>
          Tap to download {latest.notes ? `· ${latest.notes}` : 'and install'}
        </Text>
      </View>
      {onDismiss ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onDismiss();
          }}
          hitSlop={8}
          style={({ pressed }) => [s.dismissBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Hide update banner">
          <IconSymbol name="xmark" size={11} color="rgba(255,255,255,0.7)" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.55)',
    backgroundColor: 'rgba(251,191,36,0.12)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fbbf24',
  },
  title: { fontSize: 13, fontWeight: '900' as const, color: '#fbbf24', letterSpacing: 0.2 },
  subtitle: { fontSize: 11, color: t.textMuted, marginTop: 1 },
  dismissBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});

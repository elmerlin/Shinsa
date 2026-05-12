import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  badgeName: string;
  supportingCopy: string;
  image: string;
}

/**
 * Compact "Achievement unlocked" block for badge-unlock posts. Mirrors the
 * web's `AchievementBadgePost` (text on the left, ~80px badge thumbnail on
 * the right) so the pixel-art badge isn't blown up to full card width.
 */
export function AchievementBadgePost({ badgeName, supportingCopy, image }: Props) {
  const s = useThemedStyles(makeStyles);
  const imageUrl = image ? fullImageUrl(image) : '';

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={s.textCol}>
          <View style={s.eyebrow}>
            <Text style={s.eyebrowText}>ACHIEVEMENT UNLOCKED</Text>
          </View>
          <Text style={s.title} numberOfLines={3}>{badgeName}</Text>
          {supportingCopy ? (
            <Text style={s.supporting}>{supportingCopy}</Text>
          ) : null}
        </View>
        <View style={s.thumbWrap}>
          <View style={s.thumbInner}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={s.thumb} contentFit="contain" />
            ) : (
              <Text style={s.fallback}>🏅</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    padding: 14,
  },
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12 },
  textCol: { flex: 1, minWidth: 0, gap: 8 },
  eyebrow: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  eyebrowText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.6, color: t.accent },
  title: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2, lineHeight: 24 },
  supporting: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
  // Wrap with subtle outer card + inner padded square. Matches the web's
  // `p-2` outer + `h-20 w-20` inner — keeps the pixel-art badge close to its
  // native resolution instead of stretching it across the post.
  thumbWrap: {
    padding: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  thumbInner: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#0a0f1c',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  thumb: { width: '100%' as const, height: '100%' as const },
  fallback: { fontSize: 36 },
});

import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

export interface AvatarStackItem {
  name?: string;
  avatar?: string;
}

interface Props {
  items: AvatarStackItem[];
  total?: number;
  size?: 'sm' | 'md';
  emptyLabel?: string;
}

const SIZES = {
  sm: { dim: 24, font: 10, label: 11 },
  md: { dim: 32, font: 12, label: 12 },
};

/** Stacks up to 4 avatars with a "+N" label for the rest. Mirrors
 *  client/src/components/AvatarStack.jsx — the visual cue that a
 *  tournament has a meaningful crowd of participants without listing
 *  them all on the card. */
export function AvatarStack({ items, total, size = 'sm', emptyLabel = 'No players' }: Props) {
  const s = useThemedStyles((t) => makeStyles(t, size));
  const visible = (Array.isArray(items) ? items : []).slice(0, 4);
  const totalCount = Math.max(visible.length, Number(total) || 0);
  const extra = Math.max(0, totalCount - visible.length);

  if (visible.length === 0 && !totalCount) {
    return <Text style={s.empty}>{emptyLabel}</Text>;
  }

  return (
    <View style={s.row}>
      <View style={s.stack}>
        {visible.map((item, i) => {
          const initial = String(item?.name || '?').trim().charAt(0).toUpperCase() || '?';
          const avatar = item?.avatar ? fullImageUrl(String(item.avatar)) : undefined;
          return (
            <View key={`${item?.name || 'p'}-${i}`} style={[s.avatarCircle, i > 0 && s.avatarOverlap]}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={s.avatarImg} contentFit="cover" />
              ) : (
                <View style={[s.avatarImg, s.avatarFallback]}>
                  <Text style={s.avatarLetter}>{initial}</Text>
                </View>
              )}
            </View>
          );
        })}
        {extra > 0 ? (
          <View style={[s.avatarCircle, s.avatarOverlap, s.extraCircle]}>
            <Text style={s.extraText}>+{extra}</Text>
          </View>
        ) : null}
      </View>
      {totalCount > 0 ? (
        <Text style={s.totalLabel}>
          {totalCount} player{totalCount === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors, size: 'sm' | 'md') => {
  const sz = SIZES[size];
  return {
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minWidth: 0 },
    stack: { flexDirection: 'row' as const, alignItems: 'center' as const },
    avatarCircle: {
      width: sz.dim,
      height: sz.dim,
      borderRadius: sz.dim / 2,
      backgroundColor: t.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.18)',
      overflow: 'hidden' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    avatarOverlap: { marginLeft: -Math.round(sz.dim * 0.3) },
    avatarImg: { width: '100%' as const, height: '100%' as const },
    avatarFallback: {
      backgroundColor: t.accentTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    avatarLetter: { fontSize: sz.font, fontWeight: '900' as const, color: t.accent },
    extraCircle: { backgroundColor: t.surface, borderColor: t.border },
    extraText: { fontSize: sz.font - 1, fontWeight: '900' as const, color: t.textMuted },
    totalLabel: { fontSize: sz.label, color: t.textMuted, fontWeight: '600' as const },
    empty: { fontSize: sz.label, color: t.textDim, fontStyle: 'italic' as const },
  };
};

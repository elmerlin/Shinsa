import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Player } from '@shared/api';

/** Tournament roster — names, skill titles, W/L/points. Tap a row to drill
 *  into the player's profile. Mirrors TournamentRoster on desktop. */
export function TournamentRoster({
  players,
  onPlayerPress,
}: {
  players: Player[];
  onPlayerPress?: (player: Player) => void;
}) {
  const s = useThemedStyles(makeStyles);
  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      const ar = (a.seed_rank as number) || 999;
      const br = (b.seed_rank as number) || 999;
      if (ar !== br) return ar - br;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [players]);

  if (sorted.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>No players yet.</Text>
      </View>
    );
  }

  return (
    <View style={s.list}>
      {sorted.map((p) => {
        const avatar = typeof p.avatar === 'string' && p.avatar ? fullImageUrl(p.avatar) : undefined;
        const initial = String(p.name || '?').charAt(0).toUpperCase();
        return (
          <Pressable
            key={p.id}
            disabled={!onPlayerPress}
            onPress={() => onPlayerPress?.(p)}
            style={({ pressed }) => [s.row, pressed && onPlayerPress && { opacity: 0.7 }]}>
            <Text style={s.seed}>{p.seed_rank ?? ''}</Text>
            <View style={s.avatarWrap}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
              ) : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <Text style={s.avatarLetter}>{initial}</Text>
                </View>
              )}
            </View>
            <View style={s.body}>
              <Text style={s.name} numberOfLines={1}>{p.name}</Text>
              {p.skill_title ? (
                <Text style={s.skill} numberOfLines={1}>{p.skill_title}</Text>
              ) : null}
            </View>
            <View style={s.statsCol}>
              <Text style={s.statText}>
                <Text style={s.winsText}>{p.wins ?? 0}W</Text>
                <Text style={s.dot}> · </Text>
                <Text style={s.lossesText}>{p.losses ?? 0}L</Text>
              </Text>
              {typeof p.points === 'number' && p.points > 0 ? (
                <Text style={s.pointsText}>{p.points} pts</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  list: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  seed: {
    fontSize: 11,
    color: t.textDim,
    width: 22,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
    fontWeight: '900' as const,
  },
  avatarWrap: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' as const },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarLetter: { fontSize: 13, fontWeight: '900' as const, color: t.accent },
  body: { flex: 1, gap: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  skill: { fontSize: 10, color: t.textDim },
  statsCol: { alignItems: 'flex-end' as const, gap: 1 },
  statText: { fontSize: 11 },
  winsText: { color: '#34d399', fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  lossesText: { color: t.danger, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  dot: { color: t.textDim },
  pointsText: { fontSize: 10, color: t.textMuted, fontWeight: '700' as const },
  empty: {
    padding: 24,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center' as const,
  },
  emptyText: { fontSize: 12, color: t.textDim },
});

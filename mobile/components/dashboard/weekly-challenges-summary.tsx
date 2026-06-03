import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DefaultAvatar } from '@/components/default-avatar';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { weeklyChallengesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { WeeklyChallengeAward, WeeklyChallengeLeaderboardRow } from '@shared/api';

const RANK_COLORS = ['#FFC400', '#c0c0c0', '#cd7f32']; // gold / silver / bronze

function fmt(n?: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  return n.toLocaleString();
}

function PodiumRow({ award, s }: { award: WeeklyChallengeAward; s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>> }) {
  const avatar = award.avatar_snapshot ? fullImageUrl(award.avatar_snapshot) : undefined;
  const rankColor = RANK_COLORS[award.rank - 1] || s.fallbackRankColor.color;

  return (
    <View style={s.row}>
      <View style={[s.rankBadge, { backgroundColor: rankColor }]}>
        <Text style={s.rankText}>#{award.rank}</Text>
      </View>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={28} />
      )}
      <View style={s.rowMain}>
        <Text style={s.username} numberOfLines={1}>{award.username_snapshot || 'unknown'}</Text>
        <Text style={s.subline}>
          {fmt(award.points)} pts · {award.clears ?? 0} clears
        </Text>
      </View>
    </View>
  );
}

/** Variant of PodiumRow that reads from a leaderboard row (Co-op's top3
 *  comes back as WeeklyChallengeLeaderboardRow, not Award). Keeps the same
 *  visual treatment so the user doesn't see two different row designs. */
function CoopPodiumRow({ row, s }: { row: WeeklyChallengeLeaderboardRow; s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>> }) {
  const avatar = row.avatar ? fullImageUrl(row.avatar) : undefined;
  const rankColor = RANK_COLORS[row.rank - 1] || s.fallbackRankColor.color;
  return (
    <View style={s.row}>
      <View style={[s.rankBadge, { backgroundColor: rankColor }]}>
        <Text style={s.rankText}>#{row.rank}</Text>
      </View>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={28} />
      )}
      <View style={s.rowMain}>
        <Text style={s.username} numberOfLines={1}>{row.username || 'unknown'}</Text>
        <Text style={s.subline}>
          {fmt(row.points)} pts · {row.clears ?? 0} clears
        </Text>
      </View>
    </View>
  );
}

export function WeeklyChallengesSummary() {
  const s = useThemedStyles(makeStyles);
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['weekly-challenges-home'],
    queryFn: () => weeklyChallengesApi.home(),
    retry: false,
  });

  if (!data) return null;
  const week = data.week;
  const overall = (data.awards || []).filter((a) => a.award_key === 'overall').slice(0, 3);
  const coop = data.coopSummary;
  const hasCoop = !!(coop && coop.chartCount > 0);
  // Hide the entire tile only when BOTH divisions are empty (no main podium
  // AND no Co-op activity). Co-op alone is enough to render the card.
  if (overall.length === 0 && !hasCoop) return null;

  return (
    <View style={s.wrap}>
      {/* Main division summary — outer card stays tappable so users can
          drill straight into the WC screen with one tap from the dashboard. */}
      <Pressable
        onPress={() => router.push('/weekly-challenges')}
        style={({ pressed }) => [s.section, pressed && { opacity: 0.85 }]}>
        <View style={s.headerRow}>
          <Text style={s.eyebrow}>WEEKLY CHALLENGES</Text>
          <Text style={s.weekKey}>{week?.week_key}</Text>
        </View>
        {overall.length > 0 ? (
          <>
            <View style={s.statsRow}>
              <View style={s.statCell}>
                <Text style={s.statLabel}>Charts</Text>
                <Text style={s.statValue}>{week?.chart_count ?? 0}</Text>
              </View>
              <View style={s.statCell}>
                <Text style={s.statLabel}>Players</Text>
                <Text style={s.statValue}>{data.participantCount ?? 0}</Text>
              </View>
              <View style={s.statCell}>
                <Text style={s.statLabel}>Max Lv</Text>
                <Text style={s.statValue}>{week?.challenge_max_level ?? 0}</Text>
              </View>
            </View>
            <View style={s.podium}>
              {overall.map((a) => <PodiumRow key={`${a.award_key}-${a.rank}-${a.user_id}`} award={a} s={s} />)}
            </View>
          </>
        ) : null}
      </Pressable>

      {/* Co-op division — its own tap target. Carries `?division=coop` as
          a navigation param so the WC screen auto-selects the Co-op tab
          on arrival (parsed in weekly-challenges.tsx). */}
      {hasCoop ? (
        <Pressable
          onPress={() => router.push({ pathname: '/weekly-challenges', params: { division: 'coop' } })}
          style={({ pressed }) => [s.section, s.coopSection, pressed && { opacity: 0.85 }]}>
          <View style={s.headerRow}>
            <Text style={[s.eyebrow, s.coopEyebrow]}>CO-OP DIVISION</Text>
            <Text style={s.weekKey}>2-Player</Text>
          </View>
          <View style={s.statsRow}>
            <View style={s.statCell}>
              <Text style={s.statLabel}>Charts</Text>
              <Text style={s.statValue}>{coop.chartCount}</Text>
            </View>
            <View style={s.statCell}>
              <Text style={s.statLabel}>Players</Text>
              <Text style={s.statValue}>{coop.participantCount}</Text>
            </View>
          </View>
          {coop.top3 && coop.top3.length > 0 ? (
            <View style={s.podium}>
              {coop.top3.map((row) => (
                <CoopPodiumRow key={`coop-${row.rank}-${row.user_id}`} row={row} s={s} />
              ))}
            </View>
          ) : (
            <Text style={s.emptyHint}>No Co-op plays this week yet — be the first.</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  // Outer container — pure layout, no chrome. Each child section carries
  // its own card style so main + Co-op are visually two separate tiles
  // that stack vertically (each with its own tap target).
  wrap: { gap: 10 },
  section: {
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  // Co-op section: subtle cyan tint to differentiate from main, matching
  // the Co-op accent we use elsewhere (chart-jacket / score-card).
  coopSection: {
    borderColor: 'rgba(125, 211, 252, 0.35)',
    backgroundColor: 'rgba(125, 211, 252, 0.06)',
  },
  coopEyebrow: { color: '#7dd3fc' },
  emptyHint: { fontSize: 11, color: t.textDim, fontStyle: 'italic' as const, paddingHorizontal: 2 },
  headerRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  weekKey: { fontSize: 11, color: t.textDim, fontVariant: ['tabular-nums' as const] },
  statsRow: {
    flexDirection: 'row' as const,
    gap: 6,
  },
  statCell: {
    flex: 1,
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center' as const,
  },
  statLabel: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 1, color: t.textDim },
  statValue: { fontSize: 16, fontWeight: '800' as const, color: t.text, marginTop: 2 },
  podium: { gap: 6 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rankText: { fontSize: 10, fontWeight: '900' as const, color: '#050505' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  rowMain: { flex: 1, minWidth: 0 },
  username: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  subline: { fontSize: 11, color: t.textMuted },
  fallbackRankColor: { color: t.textDim },
});

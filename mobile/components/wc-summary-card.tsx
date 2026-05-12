import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { WcSummary } from '@/lib/weeklyChallengeSummaryMarker';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  summary: WcSummary;
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function fmt(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

/**
 * Compact recap card for `weekly_challenge_summary` posts. Shows the week
 * label, headline stats (participants/clears/charts), and the top 3 podium.
 * The full breakdown lives on the post detail page.
 */
export function WcSummaryCard({ summary }: Props) {
  const s = useThemedStyles(makeStyles);
  const podium = summary.topOverallPodium?.length
    ? summary.topOverallPodium
    : summary.awards?.overall ?? [];

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.eyebrow}>WEEKLY CHALLENGE</Text>
        {summary.weekLabel ? <Text style={s.weekLabel}>{summary.weekLabel}</Text> : null}
      </View>

      <View style={s.statsRow}>
        <Stat label="PLAYERS" value={fmt(summary.participantCount)} s={s} />
        <Stat label="CLEARS" value={fmt(summary.totalClears)} s={s} />
        <Stat label="CHARTS" value={fmt(summary.chartCount)} s={s} />
      </View>

      {podium.length > 0 ? (
        <View style={s.podium}>
          <Text style={s.podiumLabel}>PODIUM</Text>
          {podium.slice(0, 3).map((entry, i) => {
            const avatar = typeof entry.avatar === 'string' && entry.avatar
              ? fullImageUrl(entry.avatar)
              : '';
            return (
              <View key={`${entry.rank}-${entry.user_id || i}`} style={s.podiumRow}>
                <Text style={s.medal}>{RANK_MEDALS[i] || `#${entry.rank}`}</Text>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={s.podiumAvatar} contentFit="cover" />
                ) : (
                  <View style={[s.podiumAvatar, s.podiumAvatarFallback]} />
                )}
                <Text style={s.podiumName} numberOfLines={1}>@{entry.username || 'anonymous'}</Text>
                <Text style={s.podiumPoints}>{fmt(entry.points)} pts</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {summary.nextWeek?.previewCharts && summary.nextWeek.previewCharts.length > 0 ? (
        <Text style={s.nextWeek}>
          Next week: {summary.nextWeek.weekLabel || summary.nextWeek.weekKey || 'preview'} · {summary.nextWeek.previewCharts.length} chart{summary.nextWeek.previewCharts.length === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  );
}

function Stat({ label, value, s }: { label: string; value: string; s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>> }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  card: {
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168, 85, 247, 0.4)',
    padding: 12,
    gap: 10,
  },
  headerRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const },
  eyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.5, color: '#c084fc' },
  weekLabel: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  statsRow: {
    flexDirection: 'row' as const,
    gap: 8,
    paddingVertical: 4,
  },
  statCell: { flex: 1, alignItems: 'center' as const, gap: 2 },
  statValue: { fontSize: 18, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  podium: { gap: 4 },
  podiumLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim, marginBottom: 2 },
  podiumRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 4 },
  medal: { fontSize: 16 },
  podiumAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: t.surfaceMuted },
  podiumAvatarFallback: {},
  podiumName: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: t.text },
  podiumPoints: { fontSize: 11, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  nextWeek: { fontSize: 11, color: t.textMuted, paddingTop: 4, fontStyle: 'italic' as const },
});

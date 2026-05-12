import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { GradeChip } from '@/components/grade-chip';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { WcPersonalSummary } from '@/lib/weeklyChallengePersonalMarker';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  summary: WcPersonalSummary;
}

const MEDAL = ['', '🥇', '🥈', '🥉'];

const AWARD_LABEL: Record<string, string> = {
  overall: 'Overall',
  singles: 'Singles',
  doubles: 'Doubles',
  advanced: 'Advanced',
  intermediate: 'Intermediate',
};

const PODIUM_TONE: Record<number, { border: string; bg: string; text: string }> = {
  1: { border: 'rgba(245, 158, 11, 0.45)', bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },
  2: { border: 'rgba(203, 213, 225, 0.35)', bg: 'rgba(203, 213, 225, 0.10)', text: '#e2e8f0' },
  3: { border: 'rgba(180, 83, 9, 0.4)', bg: 'rgba(180, 83, 9, 0.15)', text: '#fb923c' },
};

function fmtNum(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

/**
 * Per-player Weekly Challenge recap card. Mirrors the web's
 * `WeeklyChallengePersonalCard` — week label, podium award chips, 2x2 stats
 * grid (avg score, SSS+ count, clears, avg rank), highest-rated play, and
 * rankings breakdown. Tinted with the PIU gold accent so it visually
 * distinguishes from the system bot's purple `wc-summary-card`.
 */
export function WcPersonalCard({ summary }: Props) {
  const s = useThemedStyles(makeStyles);
  const podiums = Array.isArray(summary.podiums) ? summary.podiums : [];
  const top = summary.highestRatedPlay;
  const jacket = top && typeof top.jacketUrl === 'string' && top.jacketUrl
    ? fullImageUrl(top.jacketUrl)
    : undefined;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.eyebrow}>WEEKLY CHALLENGE RECAP</Text>
          {summary.weekLabel ? <Text style={s.weekLabel}>{summary.weekLabel}</Text> : null}
        </View>
      </View>

      <View style={s.body}>
      {podiums.length > 0 ? (
        <View style={s.podiumsRow}>
          {podiums.map((p) => {
            const tone = PODIUM_TONE[p.rank] || PODIUM_TONE[3];
            const label = AWARD_LABEL[p.awardKey] || p.awardLabel || p.awardKey;
            return (
              <View
                key={`${p.awardKey}-${p.rank}`}
                style={[s.podiumChip, { borderColor: tone.border, backgroundColor: tone.bg }]}>
                <Text style={s.podiumMedal}>{MEDAL[p.rank] || `#${p.rank}`}</Text>
                <Text style={[s.podiumLabel, { color: tone.text }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={s.statsGrid}>
        <Stat label="AVG SCORE" value={fmtNum(summary.averageScore)} s={s} />
        <Stat
          label="SSS / SSS+"
          value={fmtNum(summary.sssCount)}
          sub={`of ${fmtNum(summary.totalClears)} clears`}
          s={s}
        />
        <Stat
          label="CHARTS CLEARED"
          value={`${fmtNum(summary.totalClears)}/${fmtNum(summary.chartCount)}`}
          s={s}
        />
        <Stat
          label="AVG RANK"
          value={summary.averageRank > 0 ? `#${Math.round(summary.averageRank)}` : '—'}
          sub={summary.rankings?.overall ? `#${summary.rankings.overall.rank} of ${summary.rankings.overall.total}` : undefined}
          s={s}
        />
      </View>

      {top && top.songTitle ? (
        <View style={s.topPlay}>
          <Text style={s.topPlayLabel}>HIGHEST RATED PLAY</Text>
          <View style={s.topPlayRow}>
            {jacket ? (
              <Image source={{ uri: jacket }} style={s.jacket} contentFit="cover" />
            ) : (
              <View style={[s.jacket, s.jacketFallback]} />
            )}
            <View style={s.topPlayText}>
              <Text style={s.songTitle} numberOfLines={1}>{top.songTitle}</Text>
              <View style={s.topPlayMeta}>
                <Text style={s.scoreNum}>{fmtNum(top.score)}</Text>
                {top.grade ? (
                  <GradeChip grade={top.grade} score={top.score} size="sm" />
                ) : null}
                <Text style={s.rpText}>{fmtNum(top.ratingPoints)} RP</Text>
                {top.hasPgBonus && top.pgBonusPoints > 0 ? (
                  <Text style={s.pgBonus}>+{fmtNum(top.pgBonusPoints)} PG</Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {(summary.rankings?.singles || summary.rankings?.doubles) ? (
        <View style={s.rankingsRow}>
          {summary.rankings?.singles ? (
            <View style={[s.rankPill, { borderColor: 'rgba(244, 63, 94, 0.35)', backgroundColor: 'rgba(244, 63, 94, 0.10)' }]}>
              <Text style={[s.rankPillLabel, { color: '#fda4af' }]}>Singles</Text>
              <Text style={s.rankPillValue}>#{summary.rankings.singles.rank}</Text>
              <Text style={s.rankPillSub}>of {summary.rankings.singles.total}</Text>
            </View>
          ) : null}
          {summary.rankings?.doubles ? (
            <View style={[s.rankPill, { borderColor: 'rgba(16, 185, 129, 0.35)', backgroundColor: 'rgba(16, 185, 129, 0.10)' }]}>
              <Text style={[s.rankPillLabel, { color: '#6ee7b7' }]}>Doubles</Text>
              <Text style={s.rankPillValue}>#{summary.rankings.doubles.rank}</Text>
              <Text style={s.rankPillSub}>of {summary.rankings.doubles.total}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {summary.bracketComparison ? (
        <View style={s.bracket}>
          <Text style={s.bracketLabel}>{summary.bracketComparison.bracketName?.toUpperCase()} BRACKET</Text>
          <View style={s.bracketRow}>
            <Text style={s.bracketRank}>
              Rank <Text style={s.bracketRankNum}>#{summary.bracketComparison.bracketRank}</Text> of {summary.bracketComparison.bracketParticipantCount}
            </Text>
            <Text style={s.bracketAvg}>
              avg {fmtNum(summary.bracketComparison.bracketAverageScore)}
            </Text>
          </View>
        </View>
      ) : null}
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  sub,
  s,
}: {
  label: string;
  value: string;
  sub?: string;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
}) {
  return (
    <View style={s.statTile}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  card: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  // Top bar with a thin gold accent stripe — gives the recap a premium
  // "trophy" feel without washing the entire card in yellow.
  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: 8,
  },
  eyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.6, color: t.accent },
  weekLabel: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  body: { paddingHorizontal: 14, paddingVertical: 14, gap: 14 },

  podiumsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  podiumChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  podiumMedal: { fontSize: 13 },
  podiumLabel: { fontSize: 11, fontWeight: '800' as const },

  statsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  statTile: {
    flexBasis: '48%' as const,
    flexGrow: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  statLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  statValue: { fontSize: 16, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statSub: { fontSize: 10, color: t.textDim },

  topPlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  topPlayLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  topPlayRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  jacket: { width: 56, height: 35, borderRadius: 4, backgroundColor: t.surfaceMuted },
  jacketFallback: { backgroundColor: t.surfaceMuted },
  topPlayText: { flex: 1, gap: 4 },
  songTitle: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  topPlayMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
  scoreNum: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  rpText: { fontSize: 11, color: t.textDim, fontVariant: ['tabular-nums' as const] },
  pgBonus: { fontSize: 11, fontWeight: '800' as const, color: '#fcd34d', fontVariant: ['tabular-nums' as const] },

  rankingsRow: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
  rankPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rankPillLabel: { fontSize: 11, fontWeight: '800' as const },
  rankPillValue: { fontSize: 11, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  rankPillSub: { fontSize: 10, color: t.textDim },

  bracket: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    padding: 10,
    gap: 4,
  },
  bracketLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: '#bae6fd' },
  bracketRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8, flexWrap: 'wrap' as const },
  bracketRank: { fontSize: 11, color: t.textMuted },
  bracketRankNum: { fontWeight: '900' as const, color: '#bae6fd' },
  bracketAvg: { fontSize: 11, color: t.textDim },
});

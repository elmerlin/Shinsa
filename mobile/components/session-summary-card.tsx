import { StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { GradeChip } from '@/components/grade-chip';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { SessionSummary, SessionSummaryTopSong } from '@/lib/sessionSummaryMarker';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  summary: SessionSummary;
}

function fmtNum(value: number | undefined | null): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function joinSchedule(parts: Array<string | undefined>): string {
  return parts.filter((p) => p && String(p).trim()).join(' · ');
}

/**
 * Compact card for SHINSA_SUMMARY_V1 posts. Shows the headline session
 * stats (songs / clears / perfect rate / steps + kcal) and the top-ranked
 * song from `topSongsByScore`.
 */
export function SessionSummaryCard({ summary }: Props) {
  const s = useThemedStyles(makeStyles);
  const schedule = joinSchedule([
    summary.sessionDateLabel,
    summary.sessionTimeRange,
    summary.sessionDurationLabel,
  ]);
  const machine = String(summary.sessionMachineName || '').trim();
  const shoe = String(summary.sessionShoeLabel || '').trim();
  const top: SessionSummaryTopSong | undefined = Array.isArray(summary.topSongsByScore)
    ? summary.topSongsByScore[0]
    : undefined;
  const totalSteps = Number(summary.totalSteps) || 0;
  const kcal = Number(summary.estimatedKcal) || 0;

  return (
    <View style={s.card}>
      <View>
        <Text style={s.eyebrow}>SESSION SUMMARY</Text>
        {schedule ? <Text style={s.title} numberOfLines={1}>{schedule}</Text> : null}
        {machine ? <Text style={s.meta} numberOfLines={1}>{machine}</Text> : null}
        {shoe ? <Text style={s.metaDim} numberOfLines={1}>{shoe}</Text> : null}
      </View>

      <View style={s.statsGrid}>
        <Stat label="SONGS" value={fmtNum(summary.songCount)} s={s} />
        <Stat
          label="CLEARS"
          value={`${fmtNum(summary.clearCount)}/${fmtNum(summary.songCount)}`}
          sub={typeof summary.clearRate === 'number' ? `${summary.clearRate}%` : undefined}
          s={s}
        />
        <Stat label="PERFECT %" value={`${summary.perfectRate ?? 0}%`} s={s} />
        <Stat
          label="STEPS"
          value={fmtNum(totalSteps)}
          sub={kcal > 0 ? `${fmtNum(kcal)} kcal` : undefined}
          s={s}
        />
      </View>

      {top && top.song_title ? (
        <View style={s.topRow}>
          <ChartJacket
            jacketUrl={top.jacket_url ? fullImageUrl(top.jacket_url) : undefined}
            mode={top.mode}
            level={top.level}
            size="xs"
          />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={s.topEyebrow}>TOP SCORE</Text>
            <Text style={s.topTitle} numberOfLines={1}>{top.song_title}</Text>
          </View>
          <View style={s.topScoreCol}>
            {top.score && top.score > 0 ? (
              <Text style={s.topScore}>{fmtNum(top.score)}</Text>
            ) : null}
            {top.grade ? <GradeChip grade={top.grade} score={top.score ?? 0} size="sm" /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, sub, s }: { label: string; value: string; sub?: string; s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>> }) {
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
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    padding: 12,
    gap: 10,
  },
  eyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.6, color: t.accent },
  title: { fontSize: 14, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  meta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  metaDim: { fontSize: 11, color: t.textDim, marginTop: 1 },

  statsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  statTile: {
    flexBasis: '47%' as const,
    flexGrow: 1,
    borderRadius: 10,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  statLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  statValue: { fontSize: 16, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statSub: { fontSize: 10, color: t.textDim },

  topRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  topEyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },
  topTitle: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  topScoreCol: { alignItems: 'flex-end' as const, gap: 2 },
  topScore: { fontSize: 13, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
});

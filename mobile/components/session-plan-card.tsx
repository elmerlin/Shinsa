import { StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { SessionPlan, SessionPlanSong } from '@/lib/sessionPlanMarker';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  plan: SessionPlan;
}

const FEELING_LABELS: Record<string, string> = {
  great: 'Feeling great',
  good: 'Feeling good',
  normal: 'Feeling normal',
  tired: 'Feeling tired',
  exhausted: 'Feeling exhausted',
};

const CHART_MODE_LABELS: Record<string, string> = {
  both: 'Singles + Doubles',
  singles: 'Singles only',
  doubles: 'Doubles only',
};

/**
 * Compact card for SHINSA_SESSION_PLAN_V1 posts. Shows the recommended
 * scoring/passing levels and a thumbnail strip from each picked section.
 * Mirrors the web's SessionPlanCard but trimmed for the feed.
 */
export function SessionPlanCard({ plan }: Props) {
  const s = useThemedStyles(makeStyles);
  const feeling = FEELING_LABELS[String(plan.feeling || 'normal')] || 'Feeling normal';
  const chartMode = CHART_MODE_LABELS[String(plan.chartMode || 'both')] || 'Singles + Doubles';
  const scoringLevel = Number(plan.adjustedScoringLevel) || Number(plan.scoringLevel) || 0;
  const passingLevel = Number(plan.adjustedPassingLevel) || Number(plan.passingLevel) || 0;
  const skillsTrain = Array.isArray(plan.skillsTrain) ? plan.skillsTrain : [];

  return (
    <View style={s.card}>
      <View>
        <Text style={s.eyebrow}>SESSION PLAN</Text>
        <Text style={s.title}>{feeling} · {chartMode}</Text>
      </View>

      <View style={s.levelsRow}>
        {scoringLevel > 0 ? (
          <View style={[s.levelTile, { borderColor: 'rgba(125, 211, 252, 0.45)' }]}>
            <Text style={s.levelLabel}>SCORING</Text>
            <Text style={[s.levelValue, { color: '#7dd3fc' }]}>L{scoringLevel}</Text>
          </View>
        ) : null}
        {passingLevel > 0 ? (
          <View style={[s.levelTile, { borderColor: 'rgba(110, 231, 183, 0.45)' }]}>
            <Text style={s.levelLabel}>PASSING</Text>
            <Text style={[s.levelValue, { color: '#6ee7b7' }]}>L{passingLevel}</Text>
          </View>
        ) : null}
      </View>

      {skillsTrain.length > 0 ? (
        <View style={s.skillRow}>
          <Text style={s.skillEyebrow}>TRAIN</Text>
          <View style={s.skillTags}>
            {skillsTrain.slice(0, 6).map((skill) => (
              <View key={skill} style={s.skillTag}>
                <Text style={s.skillTagText}>{skill}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <PlanSection label="ACTIVATION" songs={plan.activation} s={s} />
      <PlanSection label="SCORING" songs={plan.scoring} s={s} />
      <PlanSection label="PASSING" songs={plan.passing} s={s} />
    </View>
  );
}

function PlanSection({
  label,
  songs,
  s,
}: {
  label: string;
  songs: SessionPlanSong[] | undefined;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
}) {
  const list = Array.isArray(songs) ? songs.slice(0, 4) : [];
  if (list.length === 0) return null;
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.sectionJackets}>
        {list.map((song, i) => (
          <ChartJacket
            key={`${label}-${i}`}
            jacketUrl={song.jacket_url ? fullImageUrl(song.jacket_url) : undefined}
            mode={song.mode}
            level={song.level}
            size="xs"
          />
        ))}
      </View>
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

  levelsRow: { flexDirection: 'row' as const, gap: 8 },
  levelTile: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: t.surfaceMuted,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'flex-start' as const,
    gap: 2,
  },
  levelLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  levelValue: { fontSize: 18, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },

  skillRow: { gap: 4 },
  skillEyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  skillTags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 },
  skillTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  skillTagText: { fontSize: 10, fontWeight: '700' as const, color: t.text },

  sectionRow: { gap: 6 },
  sectionLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  sectionJackets: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
});

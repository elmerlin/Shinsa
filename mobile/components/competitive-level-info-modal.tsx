import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  visible: boolean;
  /** Which mode's competitive level is being explained. Drives the title +
   *  accent color. `null` closes the modal. */
  mode: 'Single' | 'Double' | null;
  /** The user's competitive level number, if any. Shown in the title pill. */
  level?: number;
  /** Optional metrics — when present, surfaced inline so the explanation
   *  isn't abstract. */
  clearPercentage?: number;
  averageGrade?: string;
  onClose: () => void;
}

/**
 * Explainer modal that fires when the user taps their competitive-level card
 * on the profile. The competitive-level value is server-computed in
 * `server/routes/piugame.js#getModeCompetitiveLevel` — this modal documents
 * the rule for end users so they understand why the number is what it is.
 */
export function CompetitiveLevelInfoModal({
  visible,
  mode,
  level,
  clearPercentage,
  averageGrade,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  if (!visible || !mode) return null;

  const accent = mode === 'Single' ? '#ff7a7a' : '#4cf4aa';
  const accentTint = mode === 'Single' ? 'rgba(255, 122, 122, 0.12)' : 'rgba(76, 244, 170, 0.12)';
  const accentBorder = mode === 'Single' ? 'rgba(255, 122, 122, 0.4)' : 'rgba(76, 244, 170, 0.4)';
  const prefix = mode === 'Single' ? 'S' : 'D';
  const label = level && level > 0 ? `${prefix}${level}` : `${prefix}—`;
  const modeLabel = mode === 'Single' ? 'Singles' : 'Doubles';
  const showMetrics = typeof clearPercentage === 'number' || averageGrade;

  return (
    <Modal visible animationType="none" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.card}>
          <View style={s.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>COMPETITIVE LEVEL</Text>
              <View style={s.levelRow}>
                <View
                  style={[
                    s.levelPill,
                    { borderColor: accentBorder, backgroundColor: accentTint },
                  ]}>
                  <Text style={[s.levelPillText, { color: accent }]}>{label}</Text>
                </View>
                <Text style={s.modeLabel}>{modeLabel}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
              <IconSymbol name="xmark" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <Text style={s.body}>
            Your competitive level is the highest difficulty where you&apos;ve genuinely settled —
            not your single hardest clear. It updates automatically as your scores improve.
          </Text>

          <View style={s.ruleList}>
            <RuleRow
              icon="checkmark.circle.fill"
              text={`You've cleared at least 50% of the charts at that level.`}
              s={s}
            />
            <RuleRow
              icon="checkmark.circle.fill"
              text={`Your average grade across those clears is S or better.`}
              s={s}
            />
            <RuleRow
              icon="arrow.up"
              text={`We pick the highest level where both conditions hold.`}
              s={s}
            />
          </View>

          {showMetrics ? (
            <View style={s.metricsCard}>
              <Text style={s.metricsLabel}>YOUR {prefix}{level} STATS</Text>
              <View style={s.metricsRow}>
                {typeof clearPercentage === 'number' ? (
                  <View style={s.metricCol}>
                    <Text style={s.metricValue}>{Math.round(clearPercentage)}%</Text>
                    <Text style={s.metricSub}>cleared</Text>
                  </View>
                ) : null}
                {averageGrade ? (
                  <View style={s.metricCol}>
                    <Text style={s.metricValue}>{averageGrade}</Text>
                    <Text style={s.metricSub}>avg grade</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          <Text style={s.hint}>
            Clear more charts at the next level (or raise your grades) to push this number up.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function RuleRow({ icon, text, s }: { icon: string; text: string; s: Styles }) {
  return (
    <View style={s.ruleRow}>
      <IconSymbol name={icon as 'checkmark.circle.fill'} size={14} color="#34d399" />
      <Text style={s.ruleText}>{text}</Text>
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const makeStyles = (t: ThemeColors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 18,
  },
  card: {
    width: '100%' as const,
    maxWidth: 400,
    backgroundColor: t.card,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 18,
    gap: 14,
  },

  titleRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  levelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginTop: 4 },
  levelPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  levelPillText: { fontSize: 18, fontWeight: '900' as const, letterSpacing: 0.4, fontVariant: ['tabular-nums' as const] },
  modeLabel: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  closeBtn: { padding: 6 },

  body: { fontSize: 13, lineHeight: 19, color: t.text },

  ruleList: { gap: 8 },
  ruleRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8 },
  ruleText: { flex: 1, fontSize: 12, lineHeight: 17, color: t.textMuted },

  metricsCard: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 6,
  },
  metricsLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },
  metricsRow: { flexDirection: 'row' as const, gap: 24 },
  metricCol: { gap: 2 },
  metricValue: { fontSize: 18, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  metricSub: { fontSize: 10, color: t.textDim },

  hint: { fontSize: 11, color: t.textDim, fontStyle: 'italic' as const },
});

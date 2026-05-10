import { Text, View } from 'react-native';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';
import type { LiveSummary } from '@/lib/liveSessionMarker';

interface Props {
  summary: LiveSummary;
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function Stat({ label, value, color, s }: { label: string; value: string | number; color?: string; s: Styles }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function LiveSessionCard({ summary }: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const title = String(summary.sessionTitle || 'Shinsa Live').trim();
  const role = String(summary.participantRole || '').toLowerCase();
  const hostLabel = summary.hostUsername
    ? role === 'cohost'
      ? `Co-hosted by ${summary.hostUsername}`
      : `Hosted by ${summary.hostUsername}`
    : 'Live session recap';
  const schedule = [
    summary.sessionDateLabel,
    summary.sessionTimeRange,
    summary.sessionDurationLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  const machine = String(summary.sessionMachineName || '').trim();
  const clears = summary.songCount
    ? `${summary.clearCount ?? 0}/${summary.songCount}`
    : `${summary.clearCount ?? 0}`;

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.eyebrow}>Shinsa Live Recap</Text>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.host} numberOfLines={1}>{hostLabel}</Text>
        </View>
        <View style={s.liveTag}>
          <View style={s.liveDot} />
          <Text style={s.liveTagText}>LIVE</Text>
        </View>
      </View>

      {schedule ? <Text style={s.meta}>{schedule}</Text> : null}
      {machine ? <Text style={s.meta}>Machine: {machine}</Text> : null}

      <View style={s.statsGrid}>
        <Stat label="Songs" value={summary.songCount ?? 0} s={s} />
        <Stat label="Clears" value={clears} color={theme.success} s={s} />
        <Stat label="Perfects" value={`${summary.perfectRate ?? 0}%`} color={theme.skill} s={s} />
        <Stat label="Chat" value={summary.messageCount ?? 0} s={s} />
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  card: {
    borderRadius: 16,
    backgroundColor: t.accentTint,
    borderWidth: 1,
    borderColor: t.borderStrong,
    padding: 14,
    gap: 10,
  },
  headerRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  title: { fontSize: 18, fontWeight: '800' as const, color: t.text, marginTop: 2 },
  host: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  meta: { fontSize: 12, color: t.textMuted, lineHeight: 16 },
  liveTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent },
  liveTagText: { fontSize: 10, fontWeight: '800' as const, color: t.accent, letterSpacing: 1 },
  statsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 4 },
  stat: {
    flexBasis: '47%' as const,
    flexGrow: 1,
    borderRadius: 10,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
    color: t.textDim,
    textTransform: 'uppercase' as const,
  },
  statValue: { fontSize: 16, fontWeight: '800' as const, color: t.text },
});

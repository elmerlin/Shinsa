import { StyleSheet, Text, View } from 'react-native';
import { Piu } from '@/constants/theme';
import type { LiveSummary } from '@/lib/liveSessionMarker';

interface Props {
  summary: LiveSummary;
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function LiveSessionCard({ summary }: Props) {
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
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eyebrow}>Shinsa Live Recap</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.host} numberOfLines={1}>{hostLabel}</Text>
        </View>
        <View style={styles.liveTag}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTagText}>LIVE</Text>
        </View>
      </View>

      {schedule ? <Text style={styles.meta}>{schedule}</Text> : null}
      {machine ? <Text style={styles.meta}>Machine: {machine}</Text> : null}

      <View style={styles.statsGrid}>
        <Stat label="Songs" value={summary.songCount ?? 0} />
        <Stat label="Clears" value={clears} color={Piu.green} />
        <Stat label="Perfects" value={`${summary.perfectRate ?? 0}%`} color={Piu.blue} />
        <Stat label="Chat" value={summary.messageCount ?? 0} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,51,102,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,51,102,0.25)',
    padding: 14,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    color: Piu.accentMuted,
    textTransform: 'uppercase',
  },
  title: { fontSize: 18, fontWeight: '800', color: Piu.text, marginTop: 2 },
  host: { fontSize: 11, color: Piu.textMuted, marginTop: 2 },
  meta: { fontSize: 12, color: Piu.textMuted, lineHeight: 16 },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Piu.accentRgba(0.15),
    borderWidth: 1,
    borderColor: Piu.accentRgba(0.4),
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Piu.accent },
  liveTagText: { fontSize: 10, fontWeight: '800', color: Piu.accentMuted, letterSpacing: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 10,
    backgroundColor: Piu.surfaceRgba(0.06),
    borderWidth: 1,
    borderColor: Piu.surfaceRgba(0.1),
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: Piu.textDim,
    textTransform: 'uppercase',
  },
  statValue: { fontSize: 16, fontWeight: '800', color: Piu.text },
});

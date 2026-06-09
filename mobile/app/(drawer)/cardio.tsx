import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/top-bar';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { healthApi } from '@/lib/api';
import { formatDuration, HR_ZONES, hrZoneColor } from '@/lib/heartRate';
import type { CardioSession } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

function formatSessionDate(raw?: string): string {
  if (!raw) return '';
  const cleaned = raw.trim();
  const normalized = cleaned.includes('T') ? cleaned : cleaned.replace(' ', 'T');
  const hasTz = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const d = new Date(hasTz ? normalized : `${normalized}Z`);
  if (Number.isNaN(d.getTime())) return cleaned.slice(0, 16);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

// Horizontal stacked time-in-zone bar + a per-zone minute breakdown.
function ZoneBar({ zoneSeconds, s }: { zoneSeconds: Record<string, number>; s: Styles }) {
  const total = HR_ZONES.reduce((sum, z) => sum + (Number(zoneSeconds[z.key]) || 0), 0);
  if (total <= 0) return null;
  return (
    <View style={s.zoneWrap}>
      <View style={s.zoneBar}>
        {HR_ZONES.map((z) => {
          const sec = Number(zoneSeconds[z.key]) || 0;
          if (sec <= 0) return null;
          return <View key={z.key} style={{ flex: sec, backgroundColor: z.color }} />;
        })}
      </View>
      <View style={s.zoneLegend}>
        {HR_ZONES.map((z) => {
          const sec = Number(zoneSeconds[z.key]) || 0;
          if (sec <= 0) return null;
          const pct = Math.round((sec / total) * 100);
          return (
            <View key={z.key} style={s.zoneLegendItem}>
              <View style={[s.zoneDot, { backgroundColor: z.color }]} />
              <Text style={s.zoneLegendLabel}>{z.label}</Text>
              <Text style={s.zoneLegendVal}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CardioCard({ session, s }: { session: CardioSession; s: Styles }) {
  const avg = Math.round(Number(session.hr_avg) || 0);
  const peak = Math.round(Number(session.hr_peak) || 0);
  const cals = Math.round(Number(session.calories) || 0);
  const plays = Number(session.play_count) || 0;
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardDate}>{formatSessionDate(session.started_at_utc)}</Text>
        <Text style={s.cardDur}>{formatDuration(session.duration_s)}</Text>
      </View>

      <View style={s.statRow}>
        <View style={s.statCell}>
          <Text style={[s.statValue, { color: '#f87171' }]}>{avg > 0 ? avg : '—'}</Text>
          <Text style={s.statLabel}>AVG BPM</Text>
        </View>
        <View style={s.statCell}>
          <Text style={[s.statValue, { color: peak > 0 ? hrZoneColor(peak) : undefined }]}>{peak > 0 ? peak : '—'}</Text>
          <Text style={s.statLabel}>PEAK BPM</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statValue}>{cals > 0 ? cals : '—'}</Text>
          <Text style={s.statLabel}>KCAL</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statValue}>{plays > 0 ? plays : '—'}</Text>
          <Text style={s.statLabel}>CHARTS</Text>
        </View>
      </View>

      <ZoneBar zoneSeconds={session.zone_seconds || {}} s={s} />
    </View>
  );
}

export default function CardioScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['cardio-sessions'],
    queryFn: () => healthApi.cardioSessions({ limit: 30 }),
  });

  const sessions = data?.sessions ?? [];

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.accent} />}>
        <Text style={s.eyebrow}>CARDIO</Text>
        <Text style={s.heading}>Your heart rate, on the pad</Text>
        <Text style={s.sub}>
          Wear your Apple Watch and start a workout (Fitness Gaming) while you play. Heart rate
          syncs to your scores and rolls up into the sessions below.
        </Text>

        {isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.accent} /></View>
        ) : sessions.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyHeart}>♥</Text>
            <Text style={s.emptyTitle}>No cardio sessions yet</Text>
            <Text style={s.emptyText}>
              Start an Apple Watch workout next time you play. Your average/peak BPM, calories and
              time-in-zone will show up here, and a heart-rate curve appears on each score.
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            {sessions.map((session) => (
              <CardioCard key={session.workout_uuid} session={session} s={s} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  scroll: { padding: 16, gap: 8 },
  eyebrow: { fontSize: 13, fontWeight: '800' as const, letterSpacing: 2, color: t.accent, textTransform: 'uppercase' as const },
  heading: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  sub: { fontSize: 13, color: t.textMuted, lineHeight: 19, marginBottom: 8 },

  list: { gap: 12, marginTop: 4 },
  card: {
    backgroundColor: t.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 12,
  },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  cardDate: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  cardDur: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },

  statRow: { flexDirection: 'row' as const, gap: 8 },
  statCell: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 2,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: t.surfaceMuted,
  },
  statValue: { fontSize: 20, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statLabel: { fontSize: 9, fontWeight: '800' as const, color: t.textDim, letterSpacing: 0.6 },

  zoneWrap: { gap: 8 },
  zoneBar: {
    flexDirection: 'row' as const,
    height: 14,
    borderRadius: 7,
    overflow: 'hidden' as const,
    backgroundColor: t.surfaceMuted,
  },
  zoneLegend: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  zoneLegendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneLegendLabel: { fontSize: 10, fontWeight: '700' as const, color: t.textMuted },
  zoneLegendVal: { fontSize: 10, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },

  center: { paddingVertical: 40, alignItems: 'center' as const },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 36, paddingHorizontal: 12 },
  emptyHeart: { fontSize: 40, color: '#f87171' },
  emptyTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  emptyText: { fontSize: 13, color: t.textMuted, lineHeight: 19, textAlign: 'center' as const },
});

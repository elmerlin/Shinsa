import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HrZoneBar } from '@/components/hr-zone-bar';
import { TopBar } from '@/components/top-bar';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { healthApi } from '@/lib/api';
import { backfillHeartRateHistory, type BackfillProgress } from '@/lib/heartRateSync';
import { formatDuration, hrZoneColor } from '@/lib/heartRate';
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


function CardioCard({ session, maxHr, s }: { session: CardioSession; maxHr?: number; s: Styles }) {
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
          <Text style={[s.statValue, { color: peak > 0 ? hrZoneColor(peak, maxHr) : undefined }]}>{peak > 0 ? peak : '—'}</Text>
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

      <HrZoneBar zoneSeconds={session.zone_seconds || {}} />
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
  // Personal zone boundaries (manual max HR → else highest synced peak).
  const profileQuery = useQuery({
    queryKey: ['hr-profile'],
    queryFn: () => healthApi.hrProfile(),
    staleTime: 5 * 60_000,
  });
  const maxHr = profileQuery.data?.max_hr_effective;

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
          Wear your watch and record a workout while you play (Fitness Gaming on Apple Watch, or
          any Garmin/Fitbit/Samsung activity). Heart rate syncs to your scores and rolls up below.
        </Text>

        {Platform.OS !== 'web' ? <BackfillCard s={s} accent={theme.accent} /> : null}

        {isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.accent} /></View>
        ) : sessions.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyHeart}>♥</Text>
            <Text style={s.emptyTitle}>No cardio sessions yet</Text>
            <Text style={s.emptyText}>
              Record a watch workout next time you play. Your average/peak BPM, calories and
              time-in-zone will show up here, and a heart-rate curve appears on each score.
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            {sessions.map((session) => (
              <CardioCard key={session.workout_uuid} session={session} maxHr={maxHr} s={s} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// One-time history backfill — reads HealthKit/Health Connect for every past
// play that still lacks HR and uploads what's recoverable (workout days come
// back richest; watch-worn days get avg/peak). Native-only.
function BackfillCard({ s, accent }: { s: Styles; accent: string }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setProgress(null);
    const res = await backfillHeartRateHistory(setProgress);
    setRunning(false);
    setProgress(null);
    if (res.state === 'done') {
      setResult(
        res.matched > 0
          ? `Recovered heart rate for ${res.matched} of ${res.totalPlays} past plays across ${res.days} day${res.days === 1 ? '' : 's'}.`
          : 'No recoverable heart rate found for past plays (no watch data in those windows).',
      );
      queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] });
    } else if (res.state === 'denied') {
      setResult('Health access not granted — enable it in Settings to backfill.');
    } else if (res.state === 'unavailable') {
      setResult('No HealthKit / Health Connect on this device.');
    } else {
      setResult(`Couldn’t finish: ${res.message}`);
    }
  };

  const pct = progress && progress.totalDays > 0
    ? Math.round((progress.daysDone / progress.totalDays) * 100)
    : 0;

  return (
    <View style={s.backfillCard}>
      <Text style={s.backfillTitle}>Backfill heart rate history</Text>
      <Text style={s.backfillSub}>
        Scan your watch history and attach heart rate to past plays where it exists. One-time —
        run it once after wearing your watch for a while.
      </Text>
      {running ? (
        <View style={{ gap: 6 }}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` as never, backgroundColor: accent }]} />
          </View>
          <Text style={s.backfillMeta}>
            {progress ? `Day ${progress.daysDone}/${progress.totalDays} · ${progress.playsMatched} plays matched` : 'Reading your history…'}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={run}
          style={({ pressed }) => [s.backfillBtn, pressed && { opacity: 0.7 }]}>
          <Text style={s.backfillBtnText}>♥ Backfill history</Text>
        </Pressable>
      )}
      {result ? <Text style={s.backfillResult}>{result}</Text> : null}
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

  backfillCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 8,
    marginBottom: 4,
  },
  backfillTitle: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  backfillSub: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  backfillBtn: {
    alignSelf: 'flex-start' as const,
    backgroundColor: 'rgba(248,113,113,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248,113,113,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    marginTop: 2,
  },
  backfillBtnText: { fontSize: 13, fontWeight: '900' as const, color: '#fca5a5', letterSpacing: 0.3 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: t.surfaceMuted, overflow: 'hidden' as const },
  progressFill: { height: 8, borderRadius: 4 },
  backfillMeta: { fontSize: 11, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  backfillResult: { fontSize: 12, color: t.textMuted, lineHeight: 17 },

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


  center: { paddingVertical: 40, alignItems: 'center' as const },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 36, paddingHorizontal: 12 },
  emptyHeart: { fontSize: 40, color: '#f87171' },
  emptyTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  emptyText: { fontSize: 13, color: t.textMuted, lineHeight: 19, textAlign: 'center' as const },
});

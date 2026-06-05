import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { liveApi } from '@/lib/api';
import { getGradeDisplayLabel, getGradeTier, TIER_COLORS } from '@/lib/grades';
import { fullImageUrl } from '@/lib/images';
import { getCountryFlag } from '@/lib/profileMeta';
import type { ThemeColors } from '@/constants/theme';
import type { LiveDirectoryItem, LiveSessionHost } from '@shared/api';

function fmt(n: number): string {
  return (n || 0).toLocaleString();
}

function formatSessionAge(startedAt?: string): string {
  if (!startedAt) return 'Just started';
  const value = Date.parse(`${startedAt}Z`);
  if (!Number.isFinite(value)) return 'Live now';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  if (elapsedMinutes < 1) return 'Just started';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m live`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h live`;
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function LiveCard({ item, onPress, s }: { item: LiveDirectoryItem; onPress: () => void; s: Styles }) {
  const session = item.session;
  // The server nests the host inside `session` (normalizeSessionPayload), so
  // read session.host first — reading item.host (top level) is why the card
  // showed "Player"/anon for a clearly-identified streamer. Keep item.host as
  // a defensive fallback.
  const host: LiveSessionHost = (session?.host as LiveSessionHost) || item.host || {};
  const avatar = typeof host.avatar === 'string' ? fullImageUrl(host.avatar) : undefined;
  const username = host.username || 'Player';
  const flag = host.nationality ? getCountryFlag(host.nationality) : '';
  const lastPlay = item.last_play;
  const jacket = lastPlay?.background_url ? fullImageUrl(lastPlay.background_url) : undefined;
  const title = session.title || `${username} live`;
  const viewers = Number(session.viewer_count) || 0;
  const counts = item.request_counts || {};
  const openReq = Number(counts.open) || 0;
  const queuedReq = Number(counts.queued) || 0;

  const score = Number(lastPlay?.score) || 0;
  const gradeLabel = lastPlay ? getGradeDisplayLabel(lastPlay.grade, score) : '';
  const gradeColor = lastPlay ? TIER_COLORS[getGradeTier(lastPlay.grade, score)] : undefined;
  const hopPts = Number(lastPlay?.hop_rating_points_earned) || 0;
  const pbGain = Number(lastPlay?.pumbility_gain) || 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
      <View style={s.cardTop}>
        <View style={s.liveDotRow}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>LIVE</Text>
        </View>
        <Text style={s.viewers}>{viewers} 👁</Text>
      </View>
      <Text style={s.title} numberOfLines={2}>{title}</Text>
      <View style={s.hostRow}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarLetter}>{String(username).charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={s.hostInfo}>
          <Text style={s.username} numberOfLines={1}>{flag ? `${flag} ` : ''}{username}</Text>
          {host.skill_title ? (
            <Text style={s.skillTitle} numberOfLines={1}>{host.skill_title}</Text>
          ) : null}
          <Text style={s.age}>{formatSessionAge(session.started_at)}</Text>
        </View>
      </View>
      {lastPlay ? (
        <View style={s.playRow}>
          <ChartJacket jacketUrl={jacket} mode={lastPlay.mode} level={lastPlay.level} size="xs" />
          <View style={s.playInfo}>
            <Text style={s.songTitle} numberOfLines={1}>{lastPlay.song_title || '—'}</Text>
            <View style={s.scoreRow}>
              {score > 0 ? <Text style={s.score}>{fmt(score)}</Text> : null}
              {gradeLabel ? <Text style={[s.grade, gradeColor ? { color: gradeColor } : null]}>{gradeLabel}</Text> : null}
              {hopPts > 0 ? <Text style={s.gain}>+{hopPts}</Text> : null}
              {pbGain > 0 ? <Text style={s.gain}>+{pbGain}p</Text> : null}
            </View>
          </View>
        </View>
      ) : (
        <Text style={s.waiting}>Waiting for first chart…</Text>
      )}
      {openReq > 0 || queuedReq > 0 ? (
        <Text style={s.requests}>
          <Text style={s.requestsNum}>{openReq}</Text> requests{queuedReq > 0 ? ` • ${queuedReq} queued` : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function LiveNowStrip() {
  const s = useThemedStyles(makeStyles);
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['live-sessions', 'strip'],
    queryFn: () => liveApi.sessions({ limit: 6 }),
    retry: false,
    refetchInterval: 30000,
  });

  const items = data?.sessions ?? [];
  if (items.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.eyebrow}>LIVE NOW</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {items.map((it) => (
          <LiveCard
            key={String(it.session?.id ?? it.session?.host_user_id ?? Math.random())}
            item={it}
            s={s}
            onPress={() => router.push('/live')}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { gap: 8 },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  scroll: { gap: 10, paddingRight: 16 },
  card: {
    width: 220,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  cardTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  liveDotRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34d399',
    shadowColor: '#34d399',
    shadowOpacity: 0.7,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  liveText: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 1.5, color: '#34d399' },
  viewers: { fontSize: 12, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  title: { fontSize: 13, fontWeight: '800' as const, color: t.text, lineHeight: 16 },
  hostRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: t.surfaceMuted },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarLetter: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  hostInfo: { flex: 1, minWidth: 0, gap: 1 },
  username: { fontSize: 12, fontWeight: '700' as const, color: t.text },
  skillTitle: { fontSize: 9, fontWeight: '700' as const, color: t.accent, letterSpacing: 0.3 },
  age: { fontSize: 10, color: t.textDim },
  playRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  playInfo: { flex: 1, minWidth: 0, gap: 2 },
  songTitle: { fontSize: 11, fontWeight: '700' as const, color: t.text },
  scoreRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  score: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  grade: { fontSize: 11, fontWeight: '900' as const },
  gain: { fontSize: 10, fontWeight: '800' as const, color: '#34d399' },
  waiting: {
    fontSize: 11,
    color: t.textDim,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  requests: {
    fontSize: 10,
    color: t.textDim,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  requestsNum: { fontWeight: '800' as const, color: t.text },
});

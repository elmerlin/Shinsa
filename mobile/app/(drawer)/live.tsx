import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreateLiveSessionSheet } from '@/components/create-live-session-sheet';
import { DefaultAvatar } from '@/components/default-avatar';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { liveApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { LiveDirectoryItem } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

function fmtDuration(startedIso?: string): string {
  if (!startedIso) return '';
  // Server returns local-time strings like "2026-05-11 12:57:17" without a
  // timezone — append `Z` only when there's no timezone marker so we get a
  // consistent UTC parse regardless of platform.
  const cleaned = startedIso.trim();
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(cleaned);
  const iso = cleaned.replace(' ', 'T') + (hasTz ? '' : 'Z');
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return '';
  const ms = Date.now() - start;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just started';
  if (m < 60) return `${m}m live`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h}h ${rest}m live` : `${h}h live`;
}

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [createOpen, setCreateOpen] = useState(false);
  const { isDesktop } = useBreakpoint();

  // Polled every 15s — server caches the directory aggregation, and most
  // changes (new session, ended session, viewer count) are stale-tolerant on
  // an index page. Detail screens poll faster.
  const sessionsQuery = useQuery({
    queryKey: ['live-sessions'],
    queryFn: () => liveApi.sessions({ limit: 36 }),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const sessions = sessionsQuery.data?.sessions ?? [];
  const liveSessions = sessions.filter((s) => s.session.status === 'live');
  const endedSessions = sessions.filter((s) => s.session.status !== 'live');
  const totalViewers = liveSessions.reduce((sum, s) => sum + (s.session.viewer_count || 0), 0);
  const followingCount = liveSessions.filter((s) => s.is_following).length;

  return (
    <View style={[s.container, isDesktop && s.containerDesktop]}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar
          rightExtra={user ? (
            <Pressable
              onPress={() => setCreateOpen(true)}
              hitSlop={6}
              style={({ pressed }) => [s.startBtn, pressed && { opacity: 0.85 }]}>
              <View style={s.startBtnPulse} />
              <Text style={s.startBtnText}>GO LIVE</Text>
            </Pressable>
          ) : null}
        />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
        refreshControl={
          <RefreshControl
            refreshing={sessionsQuery.isRefetching}
            onRefresh={() => sessionsQuery.refetch()}
            tintColor={theme.spinner}
          />
        }>
        {sessionsQuery.isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        ) : sessionsQuery.isError ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              {sessionsQuery.error instanceof Error ? sessionsQuery.error.message : 'Failed to load sessions'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.tagline}>
              Watch friends play in real time. Tap a session to see live scores, the song they're crushing, and chat.
            </Text>

            {liveSessions.length > 0 ? (
              <View style={s.summaryCard}>
                <SummaryStat label="LIVE NOW" value={String(liveSessions.length)} accent="#34d399" s={s} />
                <View style={s.summaryDivider} />
                <SummaryStat label="VIEWERS" value={String(totalViewers)} s={s} />
                {followingCount > 0 ? (
                  <>
                    <View style={s.summaryDivider} />
                    <SummaryStat label="FOLLOWING" value={String(followingCount)} accent={theme.accent} s={s} />
                  </>
                ) : null}
              </View>
            ) : null}

            {liveSessions.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <View style={s.sectionHeaderLeft}>
                    <View style={s.livePulse} />
                    <Text style={s.sectionTitle}>LIVE NOW</Text>
                  </View>
                  <Text style={s.sectionCount}>{liveSessions.length}</Text>
                </View>
                <View style={s.sessionList}>
                  {liveSessions.map((entry) => (
                    <SessionCard
                      key={entry.session.id}
                      entry={entry}
                      onPress={() => router.push({ pathname: '/live/[id]', params: { id: entry.session.id } })}
                      s={s}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyHeadline}>No sessions live right now</Text>
                <Text style={s.emptyBody}>When someone starts streaming their arcade plays, their session will show up here.</Text>
              </View>
            )}

            {endedSessions.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>RECENTLY ENDED</Text>
                  <Text style={s.sectionCount}>{endedSessions.length}</Text>
                </View>
                <View style={s.sessionList}>
                  {endedSessions.map((entry) => (
                    <SessionCard
                      key={entry.session.id}
                      entry={entry}
                      onPress={() => router.push({ pathname: '/live/[id]', params: { id: entry.session.id } })}
                      s={s}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <CreateLiveSessionSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(sessionId) => {
          setCreateOpen(false);
          router.push({ pathname: '/live/[id]', params: { id: sessionId } });
        }}
      />
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function SummaryStat({ label, value, accent, s }: { label: string; value: string; accent?: string; s: Styles }) {
  return (
    <View style={s.summaryCell}>
      <Text style={[s.summaryValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

function SessionCard({
  entry,
  onPress,
  s,
}: {
  entry: LiveDirectoryItem;
  onPress: () => void;
  s: Styles;
}) {
  const { session, host, last_play, is_following } = entry;
  const isLive = session.status === 'live';
  const hostAvatar = typeof host?.avatar === 'string' ? fullImageUrl(host.avatar) : undefined;
  const jacket = last_play?.background_url || '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
      <View style={s.cardHero}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.cardJacket} contentFit="cover" cachePolicy="memory-disk" recyclingKey={jacket} />
        ) : (
          <View style={[s.cardJacket, s.cardJacketFallback]}>
            <Text style={s.cardJacketEmoji}>🕹️</Text>
          </View>
        )}
        <View style={s.cardHeroOverlay}>
          <View style={s.cardTopRow}>
            {isLive ? (
              <View style={s.cardLivePill}>
                <View style={s.cardLivePulse} />
                <Text style={s.cardLivePillText}>LIVE</Text>
              </View>
            ) : (
              <View style={s.cardEndedPill}>
                <Text style={s.cardEndedPillText}>ENDED</Text>
              </View>
            )}
            {is_following ? (
              <View style={s.cardFollowingPill}>
                <Text style={s.cardFollowingText}>★ Following</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {isLive && typeof session.viewer_count === 'number' ? (
              <View style={s.cardViewerPill}>
                <IconSymbol name="person.fill" size={11} color="#fff" />
                <Text style={s.cardViewerText}>{session.viewer_count}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={1}>{session.title || 'Live session'}</Text>
        <View style={s.cardHostRow}>
          {hostAvatar ? (
            <Image source={{ uri: hostAvatar }} style={s.cardHostAvatar} contentFit="cover" />
          ) : (
            <DefaultAvatar size={22} />
          )}
          <Text style={s.cardHostName} numberOfLines={1}>@{host?.username || 'anonymous'}</Text>
          {isLive ? (
            <Text style={s.cardDuration}>{fmtDuration(session.started_at)}</Text>
          ) : null}
        </View>
        {last_play ? (
          <View style={s.cardPlayRow}>
            <Text style={s.cardPlayEyebrow}>NOW PLAYING</Text>
            <Text style={s.cardPlayText} numberOfLines={1}>
              {last_play.song_title} <Text style={s.cardPlayMeta}>· {last_play.mode || ''}{last_play.level ? ` ${last_play.level}` : ''}</Text>
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  // Desktop: cap reading width and center. 8-col stream + 4-col chat layout
  // is on the detail screen — this list page just gets sensible width.
  containerDesktop: { maxWidth: 1100, alignSelf: 'center' as const, width: '100%' as const },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 1 },
  topBarSpacer: { flex: 1 },
  startBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  startBtnPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  startBtnText: { fontSize: 11, fontWeight: '900' as const, color: '#fff', letterSpacing: 1.4 },

  scroll: { paddingHorizontal: 12, gap: 14 },
  center: { padding: 32, alignItems: 'center' as const },
  errorBox: { padding: 16, borderRadius: 8, backgroundColor: t.dangerBg, borderWidth: 1, borderColor: t.dangerBorder },
  errorText: { color: t.danger, fontSize: 14 },

  tagline: { fontSize: 12, color: t.textMuted, paddingHorizontal: 6, lineHeight: 17 },

  empty: { padding: 32, alignItems: 'center' as const, gap: 6 },
  emptyHeadline: { fontSize: 15, fontWeight: '800' as const, color: t.text },
  emptyBody: { fontSize: 12, color: t.textMuted, textAlign: 'center' as const, lineHeight: 17 },

  // Summary card
  summaryCard: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  summaryCell: { flex: 1, alignItems: 'center' as const, gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  summaryLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 6 },

  // Section
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 4 },
  sectionHeaderLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  sectionCount: { fontSize: 11, fontWeight: '700' as const, color: t.textDim },
  livePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34d399' },

  // Session card
  sessionList: { gap: 10 },
  card: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden' as const,
  },
  cardHero: { aspectRatio: 16 / 9, position: 'relative' as const, backgroundColor: '#000' },
  cardJacket: { width: '100%' as const, height: '100%' as const },
  cardJacketFallback: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#0f172a' },
  cardJacketEmoji: { fontSize: 40 },
  cardHeroOverlay: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    padding: 10,
    flexDirection: 'column' as const,
    justifyContent: 'space-between' as const,
  },
  cardTopRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  cardLivePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#dc2626',
  },
  cardLivePulse: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  cardLivePillText: { fontSize: 10, fontWeight: '900' as const, color: '#fff', letterSpacing: 1.2 },
  cardEndedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cardEndedPillText: { fontSize: 10, fontWeight: '900' as const, color: '#94a3b8', letterSpacing: 1.2 },
  cardFollowingPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
  },
  cardFollowingText: { fontSize: 10, fontWeight: '900' as const, color: '#fbbf24', letterSpacing: 0.5 },
  cardViewerPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cardViewerText: { fontSize: 11, fontWeight: '800' as const, color: '#fff', fontVariant: ['tabular-nums' as const] },

  cardBody: { padding: 12, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  cardHostRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  cardHostAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: t.surfaceMuted },
  cardHostName: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
  cardDuration: { fontSize: 11, color: '#34d399', fontWeight: '800' as const, marginLeft: 'auto' as const },

  cardPlayRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  cardPlayEyebrow: { fontSize: 9, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.2 },
  cardPlayText: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: t.text },
  cardPlayMeta: { color: t.textMuted, fontWeight: '500' as const },
});

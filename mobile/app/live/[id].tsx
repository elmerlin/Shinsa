import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartJacket } from '@/components/chart-jacket';
import { CohostManagerSheet } from '@/components/cohost-manager-sheet';
import { DefaultAvatar } from '@/components/default-avatar';
import { GradeChip } from '@/components/grade-chip';
import { PlateBadge } from '@/components/plate-badge';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { YouTubeEmbed } from '@/components/youtube-embed';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { parseGrade } from '@/lib/grades';
import { liveApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { parseYouTubeUrl } from '@/lib/youtube';
import type {
  LiveSessionFull,
  LiveSessionMessage,
  LiveSessionPlay,
  LiveSessionSummaryPayload,
} from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

type PlayModeFilter = 'All' | 'Single' | 'Double';

/** Mirrors web's `isPassingVisiblePlay` — score > 0 and grade not 'F' / not broken. */
function isPassingPlay(play: LiveSessionPlay): boolean {
  const score = parseInt(String(play.score ?? 0), 10) || 0;
  if (score <= 0) return false;
  const parsed = parseGrade(play.grade || '');
  if (parsed.isBroken) return false;
  return parsed.normalized !== 'f';
}

/** Message types that carry a song payload (jacket + grade + score). Mirrors
 *  the web's structured-message detection in `client/src/pages/LivePage.jsx`. */
const SONG_MESSAGE_TYPES = new Set([
  'play',
  'request',
  'request_fulfilled',
  'request_queue',
  'vote_result',
]);

/**
 * If the message carries enough metadata to render as a song row, returns the
 * extracted fields; otherwise returns null. The metadata fields are produced
 * by the server when emitting chat messages of type `play`, `request`, etc.
 */
function getStructuredSongPayload(message: LiveSessionMessage): {
  songTitle: string;
  mode: string;
  level: number;
  jacketUrl: string;
  score: number;
  grade: string;
} | null {
  const type = String(message.message_type || '').trim().toLowerCase();
  if (!SONG_MESSAGE_TYPES.has(type)) return null;
  const metadata = (message.metadata && typeof message.metadata === 'object'
    ? (message.metadata as Record<string, unknown>)
    : {});

  const songTitle = String(metadata.song_title || '').trim();
  const mode = String(metadata.mode || '').trim();
  const level = parseInt(String(metadata.level ?? ''), 10) || 0;
  if (!songTitle || !mode || level <= 0) return null;

  const score = parseInt(String(metadata.score ?? ''), 10) || 0;
  const grade = String(metadata.grade || '').trim();
  const jacketUrl = String(metadata.jacket_url || '').trim();

  return { songTitle, mode, level, score, grade, jacketUrl };
}

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function parseSessionTime(s?: string): number | null {
  if (!s) return null;
  const cleaned = s.trim();
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(cleaned);
  const iso = cleaned.replace(' ', 'T') + (hasTz ? '' : 'Z');
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function durationLabel(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just started';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h}h ${rest}m` : `${h}h`;
}

function modeShort(mode?: string): string {
  if (!mode) return '';
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  return mode.charAt(0).toUpperCase();
}

function modeAccent(mode?: string): string {
  if (mode === 'Single') return '#ff7a7a';
  if (mode === 'Double') return '#4cf4aa';
  if (mode === 'CoOp') return '#69c8ff';
  return '#a3a3a3';
}

export default function LiveSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const { isDesktop, isDesktopPortrait, isWideDesktop } = useBreakpoint();
  // Portrait sub-pane (only relevant on a vertical-monitor desktop layout).
  // Chat is the default because viewers on a portrait monitor are usually
  // there to watch + talk; the play log is one tap away.
  const [portraitPane, setPortraitPane] = useState<'chat' | 'plays' | 'stats'>('chat');
  // Theater mode hides the right rail and gives the stream + plays the
  // full width — useful when the host pops out the chat to a 2nd window.
  const [theaterMode, setTheaterMode] = useState(false);
  // Scroll ref for the chat list so new messages always pin to the bottom
  // (web "auto-scroll on new message" behaviour). Skipped when the user
  // has manually scrolled up to read history.
  const chatScrollRef = useRef<ScrollView | null>(null);
  const [chatStickToBottom, setChatStickToBottom] = useState(true);
  // Tick state for the duration counter; only used to force a re-render every
  // 30s so "12m live" stays accurate without a network round-trip.
  const [, setTick] = useState(0);

  const query = useQuery({
    queryKey: ['live-session', id],
    queryFn: () => liveApi.session(String(id)),
    enabled: !!id,
    // Faster polling than the directory because viewers want fresh scores.
    // Server's session snapshot is cheap and cached.
    refetchInterval: (q) => {
      const data = q.state.data;
      // Stop polling once a session has ended.
      if (data && data.session?.status !== 'live') return false;
      return 8_000;
    },
  });

  useEffect(() => {
    const intervalId = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(intervalId);
  }, []);

  // Keyboard shortcuts — desktop web only. C toggles chat/plays in
  // portrait mode, T toggles theater mode, Esc closes the score-card
  // modal (handled inline below). Skipped if the user is typing in the
  // composer (the composer's TextInput stops propagation on its own
  // via React's synthetic event bubbling).
  useEffect(() => {
    if (!isDesktop || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setTheaterMode((v) => !v);
      } else if (e.key === 'c' || e.key === 'C') {
        if (isDesktopPortrait) {
          e.preventDefault();
          setPortraitPane((p) => (p === 'chat' ? 'plays' : 'chat'));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, isDesktopPortrait]);

  const data = query.data;
  const session = data?.session;
  const summary = data?.summary;
  const lastPlay = data?.last_play || data?.plays?.[0];
  const plays = data?.plays ?? [];
  const isLive = session?.status === 'live';
  const isHost = !!user && session?.host_user_id === user.id;
  const messages = data?.messages ?? [];
  // Cohost manager state + filters + selected play modal — all local to the
  // viewer screen since the server's snapshot already carries every field we
  // need to render filtered plays + a score card.
  const [cohostManagerOpen, setCohostManagerOpen] = useState(false);
  const [playModeFilter, setPlayModeFilter] = useState<PlayModeFilter>('All');
  const [playPassOnly, setPlayPassOnly] = useState(true);
  const [selectedPlay, setSelectedPlay] = useState<LiveSessionPlay | null>(null);

  const activeCohosts = useMemo(
    () => (session?.participants ?? []).filter((p) => p.status === 'active' && p.role !== 'owner'),
    [session?.participants],
  );

  const visiblePlays = useMemo(() => {
    let rows = [...plays];
    if (playModeFilter !== 'All') rows = rows.filter((p) => p.mode === playModeFilter);
    if (playPassOnly) rows = rows.filter(isPassingPlay);
    rows.sort((a, b) => (b.id || 0) - (a.id || 0));
    return rows;
  }, [plays, playModeFilter, playPassOnly]);

  // Chat auto-scroll: every time a new message arrives, jump the chat
  // scroller to the bottom — but only when the user is already pinned
  // there. If they've scrolled up to read history we leave them alone.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : undefined;
  useLayoutEffect(() => {
    if (!chatStickToBottom) return;
    chatScrollRef.current?.scrollToEnd?.({ animated: true });
  }, [lastMessageId, chatStickToBottom]);

  const selectedPlayData = useMemo<ScoreCardData | null>(() => {
    if (!selectedPlay) return null;
    return {
      ...selectedPlay,
      // The score-card sheet reads `score / grade` plus optional new_/old_,
      // so plain play fields already line up. Force the player metadata from
      // the play row so the header shows the cohost who played it, not the
      // host.
      username: selectedPlay.username,
      avatar: selectedPlay.avatar,
      score: selectedPlay.score,
      grade: selectedPlay.grade,
      jacket_url: selectedPlay.background_url || selectedPlay.jacket_url as string | undefined,
      is_stage_break: selectedPlay.score === 0,
    };
  }, [selectedPlay]);

  // Heartbeat presence every 25s while the screen is open and the session is
  // live. Server decays inactive viewers after ~30s, so this comfortably
  // keeps us counted without spamming requests.
  useEffect(() => {
    if (!id || !isLive) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try { await liveApi.sessionPresence(String(id)); } catch { /* swallow — best effort */ }
    };
    tick();
    const intervalId = setInterval(tick, 25_000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [id, isLive]);

  const endMutation = useMutation({
    mutationFn: () => liveApi.endSession(String(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-session', id] });
      queryClient.invalidateQueries({ queryKey: ['live-sessions'] });
    },
  });

  const handleEnd = () => {
    Alert.alert(
      'End your live session?',
      'Your session will be marked as ended and a recap post will be created automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End session', style: 'destructive', onPress: () => endMutation.mutate() },
      ],
    );
  };

  const duration = useMemo(() => {
    const start = parseSessionTime(session?.started_at);
    const end = session?.ended_at ? parseSessionTime(session.ended_at) : Date.now();
    if (!start || !end) return null;
    return Math.max(0, end - start);
  }, [session?.started_at, session?.ended_at]);

  const handleStreamOpen = async () => {
    const url = session?.stream_url;
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (supported) Linking.openURL(url);
  };

  // Prefer the server-resolved video id (from broadcast metadata) and fall
  // back to parsing the freeform stream URL — same precedence the web uses.
  const youtubeVideoId = useMemo(() => {
    const direct = String(session?.youtube_video_id || '').trim();
    if (direct) return direct;
    const parsed = parseYouTubeUrl(session?.stream_url || '');
    return parsed.videoId || '';
  }, [session?.youtube_video_id, session?.stream_url]);
  const hasYouTubeEmbed = !!youtubeVideoId;
  const hasNonYouTubeStream = !hasYouTubeEmbed && !!session?.stream_url;

  if (query.isLoading) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Live' }} />
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }
  if (query.isError || !data || !session) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Live' }} />
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Session not found</Text>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backLink, pressed && { opacity: 0.7 }]}>
            <Text style={s.backLinkText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Stack.Screen
        options={{
          title: session.title || 'Live',
          headerRight: isHost && isLive ? () => (
            <Pressable
              onPress={handleEnd}
              disabled={endMutation.isPending}
              hitSlop={6}
              style={({ pressed }) => [s.endBtn, pressed && { opacity: 0.7 }, endMutation.isPending && { opacity: 0.4 }]}
              accessibilityLabel="End session">
              {endMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.endBtnText}>END</Text>
              )}
            </Pressable>
          ) : undefined,
        }}
      />
      {isDesktopPortrait ? (
        /* ──────────────────────────────────────────────────────────
           PORTRAIT DESKTOP — vertical-monitor layout. Stream pinned
           at the top, tabbed body in the middle (Chat / Plays /
           Stats), composer pinned at the bottom. Built for rotated
           1080×1920 streaming monitors where horizontal master-detail
           cramps both panes.
           ────────────────────────────────────────────────────────── */
        <View style={s.portraitBody}>
          <View style={s.portraitStream}>
            {hasYouTubeEmbed ? (
              <>
                <View style={s.streamEmbedWrap}>
                  <YouTubeEmbed url={`https://www.youtube.com/watch?v=${youtubeVideoId}`} />
                </View>
                <VideoSessionMeta session={session} isLive={isLive} duration={duration} s={s} />
                {lastPlay ? <NowPlayingCard lastPlay={lastPlay} isLive={isLive} s={s} /> : null}
              </>
            ) : (
              <>
                <HeroCard session={session} lastPlay={lastPlay} isLive={isLive} duration={duration} s={s} compact />
                {hasNonYouTubeStream ? (
                  <Pressable
                    onPress={handleStreamOpen}
                    style={({ pressed }) => [s.streamCta, pressed && { opacity: 0.85 }]}>
                    <IconSymbol name="tv.fill" size={18} color="#fff" />
                    <Text style={s.streamCtaText} numberOfLines={1}>Watch the stream</Text>
                    <IconSymbol name="link" size={14} color="rgba(255,255,255,0.7)" />
                  </Pressable>
                ) : null}
              </>
            )}
          </View>

          {/* Tab strip — visible label + unread-style count. Sticky
              under the stream so the user always knows which pane
              they're looking at. */}
          <View style={s.portraitTabs}>
            {(
              [
                { id: 'chat',  label: 'Chat',  count: messages.filter((m) => !m.is_system).length },
                { id: 'plays', label: 'Plays', count: plays.length },
                { id: 'stats', label: 'Stats', count: summary?.songCount ?? 0 },
              ] as const
            ).map((tab) => {
              const active = portraitPane === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setPortraitPane(tab.id)}
                  style={({ pressed }) => [
                    s.portraitTabBtn,
                    active && s.portraitTabBtnActive,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityLabel={`Show ${tab.label}`}>
                  <Text style={[s.portraitTabText, active && s.portraitTabTextActive]}>
                    {tab.label}
                  </Text>
                  {tab.count > 0 ? (
                    <Text style={[s.portraitTabCount, active && s.portraitTabCountActive]}>
                      {tab.count}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Active pane */}
          {portraitPane === 'chat' ? (
            <View style={s.portraitChat}>
              <ScrollView
                ref={(r) => { chatScrollRef.current = r; }}
                style={{ flex: 1 }}
                contentContainerStyle={s.deskRailContent}
                showsVerticalScrollIndicator
                onScroll={(e) => {
                  const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                  const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
                  setChatStickToBottom(distance < 40);
                }}
                scrollEventThrottle={120}>
                <CohostsCard
                  host={session.host}
                  hostUserId={session.host_user_id}
                  cohosts={activeCohosts}
                  canManage={isHost && isLive}
                  onManage={() => setCohostManagerOpen(true)}
                  s={s}
                />
                {messages.length > 0 ? (
                  <View style={s.chatList}>
                    {messages.slice(0, 120).map((m) => (
                      <ChatRow key={m.id} message={m} hostUserId={session.host_user_id} s={s} />
                    ))}
                  </View>
                ) : (
                  <Text style={s.playsEmpty}>No chat yet — be the first.</Text>
                )}
              </ScrollView>
              {!chatStickToBottom ? (
                <Pressable
                  onPress={() => {
                    chatScrollRef.current?.scrollToEnd?.({ animated: true });
                    setChatStickToBottom(true);
                  }}
                  style={({ pressed }) => [s.chatJumpBtn, pressed && { opacity: 0.85 }]}>
                  <IconSymbol name="arrow.up" size={12} color="#0a0f1c" />
                  <Text style={s.chatJumpBtnText}>Jump to latest</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {portraitPane === 'plays' ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.deskRailContent}
              refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={theme.spinner} />}>
              {plays.length > 0 ? (
                <View style={s.section}>
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>RECENT PLAYS</Text>
                    <Text style={s.sectionCount}>{visiblePlays.length} / {plays.length}</Text>
                  </View>
                  <PlaysFilterBar
                    mode={playModeFilter}
                    onModeChange={setPlayModeFilter}
                    passOnly={playPassOnly}
                    onTogglePass={() => setPlayPassOnly((v) => !v)}
                    s={s}
                  />
                  <View style={s.playList}>
                    {visiblePlays.slice(0, 48).map((play) => (
                      <PlayRow key={play.id} play={play} onPress={() => setSelectedPlay(play)} s={s} />
                    ))}
                    {visiblePlays.length === 0 ? (
                      <Text style={s.playsEmpty}>No plays match these filters yet.</Text>
                    ) : null}
                  </View>
                </View>
              ) : (
                <Text style={s.playsEmpty}>No plays yet.</Text>
              )}
            </ScrollView>
          ) : null}

          {portraitPane === 'stats' ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.deskRailContent}>
              {summary ? <SummaryStats summary={summary} s={s} /> : (
                <Text style={s.playsEmpty}>Stats appear once the host has logged a play.</Text>
              )}
              {!isLive && summary?.postText ? (
                <View style={s.recapCard}>
                  <Text style={s.recapEyebrow}>RECAP</Text>
                  <Text style={s.recapText}>{summary.postText}</Text>
                </View>
              ) : null}
            </ScrollView>
          ) : null}

          {user && isLive ? (
            <ChatComposer
              sessionId={String(id)}
              onSent={() => query.refetch()}
              s={s}
              bottomInset={insets.bottom}
            />
          ) : null}
        </View>
      ) : isDesktop ? (
        <View style={[s.deskBody, theaterMode && s.deskBodyTheater]}>
          {/* Left 8/12 — stream embed, hero, plays log. Theater mode
              expands this to fill the entire viewport width. */}
          <ScrollView
            style={s.deskMain}
            contentContainerStyle={s.deskMainContent}
            refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={theme.spinner} />}>
            {hasYouTubeEmbed ? (
              <>
                <View style={s.streamEmbedWrap}>
                  <YouTubeEmbed url={`https://www.youtube.com/watch?v=${youtubeVideoId}`} />
                </View>
                <VideoSessionMeta session={session} isLive={isLive} duration={duration} s={s} />
                {lastPlay ? <NowPlayingCard lastPlay={lastPlay} isLive={isLive} s={s} /> : null}
              </>
            ) : (
              <>
                <HeroCard session={session} lastPlay={lastPlay} isLive={isLive} duration={duration} s={s} />
                {hasNonYouTubeStream ? (
                  <Pressable
                    onPress={handleStreamOpen}
                    style={({ pressed }) => [s.streamCta, pressed && { opacity: 0.85 }]}>
                    <IconSymbol name="tv.fill" size={18} color="#fff" />
                    <Text style={s.streamCtaText} numberOfLines={1}>Watch the stream</Text>
                    <IconSymbol name="link" size={14} color="rgba(255,255,255,0.7)" />
                  </Pressable>
                ) : null}
              </>
            )}

            {summary ? <SummaryStats summary={summary} s={s} /> : null}

            {plays.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>RECENT PLAYS</Text>
                  <Text style={s.sectionCount}>{visiblePlays.length} / {plays.length}</Text>
                </View>
                <PlaysFilterBar
                  mode={playModeFilter}
                  onModeChange={setPlayModeFilter}
                  passOnly={playPassOnly}
                  onTogglePass={() => setPlayPassOnly((v) => !v)}
                  s={s}
                />
                {visiblePlays.length > 0 ? (
                  <View style={s.playGrid}>
                    {visiblePlays.slice(0, 24).map((play) => (
                      <View
                        key={play.id}
                        style={isWideDesktop ? s.playGridCell3 : s.playGridCell2}>
                        <PlayRow play={play} onPress={() => setSelectedPlay(play)} s={s} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={s.playsEmpty}>No plays match these filters yet.</Text>
                )}
              </View>
            ) : null}

            {!isLive && summary?.postText ? (
              <View style={s.recapCard}>
                <Text style={s.recapEyebrow}>RECAP</Text>
                <Text style={s.recapText}>{summary.postText}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Right 4/12 — cohosts at top, chat thread scrollable in the
              middle, composer pinned at the bottom. Hidden in theater
              mode (press T to toggle). */}
          {!theaterMode ? (
            <View style={[s.deskRail, !isWideDesktop && s.deskRailNarrow]}>
              <View style={s.deskRailHeader}>
                <Text style={s.sectionTitle}>CHAT</Text>
                <View style={s.deskRailHeaderActions}>
                  <Text style={s.sectionCount}>{messages.filter((m) => !m.is_system).length}</Text>
                  <Pressable
                    onPress={() => setTheaterMode(true)}
                    hitSlop={6}
                    style={({ pressed }) => [s.theaterBtn, pressed && { opacity: 0.7 }]}
                    accessibilityLabel="Theater mode">
                    <Text style={s.theaterBtnText}>⤢</Text>
                  </Pressable>
                </View>
              </View>
              <ScrollView
                ref={(r) => { chatScrollRef.current = r; }}
                style={{ flex: 1 }}
                contentContainerStyle={s.deskRailContent}
                showsVerticalScrollIndicator={false}
                onScroll={(e) => {
                  const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                  const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
                  setChatStickToBottom(distance < 40);
                }}
                scrollEventThrottle={120}>
                <CohostsCard
                  host={session.host}
                  hostUserId={session.host_user_id}
                  cohosts={activeCohosts}
                  canManage={isHost && isLive}
                  onManage={() => setCohostManagerOpen(true)}
                  s={s}
                />
                {messages.length > 0 ? (
                  <View style={s.chatList}>
                    {messages.slice(0, 120).map((m) => (
                      <ChatRow key={m.id} message={m} hostUserId={session.host_user_id} s={s} />
                    ))}
                  </View>
                ) : (
                  <Text style={s.playsEmpty}>No chat yet — be the first.</Text>
                )}
              </ScrollView>
              {!chatStickToBottom ? (
                <Pressable
                  onPress={() => {
                    chatScrollRef.current?.scrollToEnd?.({ animated: true });
                    setChatStickToBottom(true);
                  }}
                  style={({ pressed }) => [s.chatJumpBtn, pressed && { opacity: 0.85 }]}>
                  <IconSymbol name="arrow.up" size={12} color="#0a0f1c" />
                  <Text style={s.chatJumpBtnText}>Jump to latest</Text>
                </Pressable>
              ) : null}
              {user && isLive ? (
                <ChatComposer
                  sessionId={String(id)}
                  onSent={() => query.refetch()}
                  s={s}
                  bottomInset={insets.bottom}
                />
              ) : null}
            </View>
          ) : (
            /* Theater mode: rail hidden, show a floating "show chat"
               affordance so the user can come back without hunting
               for the keyboard shortcut. */
            <Pressable
              onPress={() => setTheaterMode(false)}
              style={({ pressed }) => [s.theaterShowChatBtn, pressed && { opacity: 0.85 }]}
              accessibilityLabel="Show chat">
              <Text style={s.theaterShowChatText}>💬 Show chat · T</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={s.scroll}
            refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={theme.spinner} />}>

            {hasYouTubeEmbed ? (
              <>
                <View style={s.streamEmbedWrap}>
                  <YouTubeEmbed url={`https://www.youtube.com/watch?v=${youtubeVideoId}`} />
                </View>
                <VideoSessionMeta session={session} isLive={isLive} duration={duration} s={s} />
                {lastPlay ? <NowPlayingCard lastPlay={lastPlay} isLive={isLive} s={s} /> : null}
              </>
            ) : (
              <>
                <HeroCard session={session} lastPlay={lastPlay} isLive={isLive} duration={duration} s={s} />
                {hasNonYouTubeStream ? (
                  <Pressable
                    onPress={handleStreamOpen}
                    style={({ pressed }) => [s.streamCta, pressed && { opacity: 0.85 }]}>
                    <IconSymbol name="tv.fill" size={18} color="#fff" />
                    <Text style={s.streamCtaText} numberOfLines={1}>
                      Watch the stream
                    </Text>
                    <IconSymbol name="link" size={14} color="rgba(255,255,255,0.7)" />
                  </Pressable>
                ) : null}
              </>
            )}

            <CohostsCard
              host={session.host}
              hostUserId={session.host_user_id}
              cohosts={activeCohosts}
              canManage={isHost && isLive}
              onManage={() => setCohostManagerOpen(true)}
              s={s}
            />

            {summary ? <SummaryStats summary={summary} s={s} /> : null}

            {/* Chat sits above the plays list — viewers care about the
                live conversation more than the play log, and the composer
                is anchored at the bottom of the screen, so keeping the
                chat thread close to the composer reduces eye-jumping. */}
            {messages.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>CHAT</Text>
                  <Text style={s.sectionCount}>{messages.filter((m) => !m.is_system).length}</Text>
                </View>
                <View style={s.chatList}>
                  {messages.slice(0, 30).map((m) => (
                    <ChatRow key={m.id} message={m} hostUserId={session.host_user_id} s={s} />
                  ))}
                </View>
              </View>
            ) : null}

            {plays.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>RECENT PLAYS</Text>
                  <Text style={s.sectionCount}>{visiblePlays.length} / {plays.length}</Text>
                </View>
                <PlaysFilterBar
                  mode={playModeFilter}
                  onModeChange={setPlayModeFilter}
                  passOnly={playPassOnly}
                  onTogglePass={() => setPlayPassOnly((v) => !v)}
                  s={s}
                />
                <View style={s.playList}>
                  {visiblePlays.slice(0, 24).map((play) => (
                    <PlayRow key={play.id} play={play} onPress={() => setSelectedPlay(play)} s={s} />
                  ))}
                  {visiblePlays.length === 0 ? (
                    <Text style={s.playsEmpty}>No plays match these filters yet.</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Recap shows only after the session ends — during a live session we
                don't surface the auto-generated post text in the viewer feed. */}
            {!isLive && summary?.postText ? (
              <View style={s.recapCard}>
                <Text style={s.recapEyebrow}>RECAP</Text>
                <Text style={s.recapText}>{summary.postText}</Text>
              </View>
            ) : null}
          </ScrollView>

          {user && isLive ? (
            <ChatComposer
              sessionId={String(id)}
              onSent={() => query.refetch()}
              s={s}
              bottomInset={insets.bottom}
            />
          ) : null}
        </>
      )}

      <CohostManagerSheet
        visible={cohostManagerOpen}
        sessionId={String(id)}
        participants={session.participants ?? []}
        hostUserId={session.host_user_id}
        onClose={() => setCohostManagerOpen(false)}
      />

      <ScoreCardSheet
        visible={!!selectedPlay}
        data={selectedPlayData}
        onClose={() => setSelectedPlay(null)}
      />
    </View>
  );
}

function CohostsCard({
  host,
  hostUserId,
  cohosts,
  canManage,
  onManage,
  s,
}: {
  host?: LiveSessionFull['host'];
  hostUserId?: string;
  cohosts: NonNullable<LiveSessionFull['participants']>;
  canManage: boolean;
  onManage: () => void;
  s: Styles;
}) {
  // Only render when there's something to show or the host can take action.
  if (!canManage && cohosts.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>HOSTING</Text>
        {canManage ? (
          <Pressable onPress={onManage} hitSlop={6} style={({ pressed }) => [s.manageBtn, pressed && { opacity: 0.7 }]}>
            <IconSymbol name="plus" size={11} color="#0a0f1c" />
            <Text style={s.manageBtnText}>MANAGE</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={s.cohostList}>
        {host?.id || hostUserId ? (
          <ParticipantChip
            userId={host?.id || hostUserId || ''}
            username={host?.username}
            avatar={host?.avatar}
            role="owner"
            s={s}
          />
        ) : null}
        {cohosts.map((p) => (
          <ParticipantChip
            key={p.user_id}
            userId={p.user_id}
            username={p.username}
            avatar={p.avatar}
            role={p.role}
            s={s}
          />
        ))}
      </View>
    </View>
  );
}

function ParticipantChip({
  userId,
  username,
  avatar,
  role,
  s,
}: {
  userId: string;
  username?: string;
  avatar?: string;
  role: string;
  s: Styles;
}) {
  const avatarUrl = typeof avatar === 'string' ? fullImageUrl(avatar) : undefined;
  const isOwner = role === 'owner';
  return (
    <View style={[s.cohostChip, isOwner && s.cohostChipOwner]} key={userId}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={s.cohostChipAvatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={22} />
      )}
      <Text style={[s.cohostChipName, isOwner && { color: '#fbbf24' }]} numberOfLines={1}>
        @{username || 'anon'}
      </Text>
      <Text style={[s.cohostChipRole, isOwner && { color: '#fbbf24' }]}>
        {isOwner ? 'HOST' : 'CO'}
      </Text>
    </View>
  );
}

function PlaysFilterBar({
  mode,
  onModeChange,
  passOnly,
  onTogglePass,
  s,
}: {
  mode: PlayModeFilter;
  onModeChange: (mode: PlayModeFilter) => void;
  passOnly: boolean;
  onTogglePass: () => void;
  s: Styles;
}) {
  const modes: PlayModeFilter[] = ['All', 'Single', 'Double'];
  return (
    <View style={s.filterRow}>
      <View style={s.modePillRow}>
        {modes.map((m) => {
          const active = m === mode;
          return (
            <Pressable
              key={m}
              onPress={() => onModeChange(m)}
              style={({ pressed }) => [
                s.modePill,
                active && s.modePillActive,
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[s.modePillText, active && s.modePillTextActive]}>{m}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={onTogglePass}
        style={({ pressed }) => [
          s.passToggle,
          passOnly && s.passToggleActive,
          pressed && { opacity: 0.7 },
        ]}>
        <IconSymbol name="checkmark" size={11} color={passOnly ? '#34d399' : '#94a3b8'} />
        <Text style={[s.passToggleText, passOnly && s.passToggleTextActive]}>
          {passOnly ? 'PASSES' : 'ALL RESULTS'}
        </Text>
      </Pressable>
    </View>
  );
}

function ChatComposer({
  sessionId,
  onSent,
  s,
  bottomInset,
}: {
  sessionId: string;
  onSent: () => void;
  s: Styles;
  bottomInset: number;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState('');
  const sendMutation = useMutation({
    mutationFn: (msg: string) => liveApi.sendMessage(sessionId, msg),
    onSuccess: () => {
      setDraft('');
      onSent();
    },
  });

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.composer, { paddingBottom: bottomInset + 8 }]}>
        <TextInput
          style={s.composerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Drop into chat…"
          placeholderTextColor={theme.textDim}
          multiline
          maxLength={500}
          editable={!sendMutation.isPending}
        />
        <Pressable
          onPress={handleSend}
          disabled={!draft.trim() || sendMutation.isPending}
          style={({ pressed }) => [
            s.composerSendBtn,
            (!draft.trim() || sendMutation.isPending) && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}>
          {sendMutation.isPending ? (
            <ActivityIndicator size="small" color="#0a0f1c" />
          ) : (
            <IconSymbol name="paperplane.fill" size={16} color="#0a0f1c" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatRow({
  message,
  hostUserId,
  s,
}: {
  message: LiveSessionMessage;
  hostUserId?: string;
  s: Styles;
}) {
  // Song-payload messages (play, request, request_fulfilled, request_queue,
  // vote_result) render as rich rows with jacket art + grade + score, matching
  // the web's structured-message layout.
  const song = getStructuredSongPayload(message);
  if (song) {
    const jacketUrl = song.jacketUrl ? fullImageUrl(song.jacketUrl) : '';
    const type = String(message.message_type || '').toLowerCase();
    const showResult = type === 'play' && (song.score > 0 || !!song.grade);
    const eyebrow = type === 'play'
      ? null
      : type === 'request' ? 'REQUEST'
      : type === 'request_fulfilled' ? 'REQUEST HIT'
      : type === 'request_queue' ? 'QUEUED'
      : type === 'vote_result' ? 'VOTE'
      : null;
    return (
      <View style={s.songRow}>
        <ChartJacket
          jacketUrl={jacketUrl}
          mode={song.mode}
          level={song.level}
          size="xs"
        />
        <View style={s.songBody}>
          {eyebrow ? <Text style={s.songEyebrow}>{eyebrow}</Text> : null}
          <View style={s.songMetaRow}>
            <Text style={s.songTitle} numberOfLines={1}>{song.songTitle}</Text>
            {showResult ? (
              <>
                <GradeChip grade={song.grade} score={song.score} size="sm" />
                {song.score > 0 ? (
                  <Text style={s.songScore}>{fmtNum(song.score)}</Text>
                ) : null}
              </>
            ) : null}
          </View>
          {message.username ? (
            <Text style={s.songSubtle} numberOfLines={1}>
              @{message.username}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (message.is_system) {
    // Other system messages (session_start, session_end, …) stay as a neutral
    // one-line strip.
    return (
      <View style={s.systemRow}>
        <Text style={s.systemText} numberOfLines={2}>· {message.message}</Text>
      </View>
    );
  }
  const avatar = typeof message.avatar === 'string' ? fullImageUrl(message.avatar) : undefined;
  const isHost = message.is_host || message.user_id === hostUserId;
  return (
    <View style={s.chatRow}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.chatAvatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={28} />
      )}
      <View style={s.chatBody}>
        <View style={s.chatHeader}>
          <Text style={[s.chatUser, isHost && { color: '#fbbf24' }]} numberOfLines={1}>
            @{message.username || 'anonymous'}
          </Text>
          {isHost ? <Text style={s.chatHostBadge}>HOST</Text> : null}
          {message.skill_title ? <Text style={s.chatSkill} numberOfLines={1}>{message.skill_title}</Text> : null}
        </View>
        <Text style={s.chatMessage}>{message.message}</Text>
      </View>
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

/**
 * Slim metadata strip rendered alongside the YouTube embed. When the
 * stream itself dominates the visible area, the session header doesn't
 * need a full-bleed background — just host, LIVE pill, viewer count.
 */
function VideoSessionMeta({
  session,
  isLive,
  duration,
  s,
}: {
  session: LiveSessionFull;
  isLive: boolean;
  duration: number | null;
  s: Styles;
}) {
  const hostAvatar = typeof session.host?.avatar === 'string' ? fullImageUrl(session.host.avatar) : undefined;
  return (
    <View style={s.metaCard}>
      <View style={s.metaHostBlock}>
        {hostAvatar ? (
          <Image source={{ uri: hostAvatar }} style={s.metaHostAvatar} contentFit="cover" />
        ) : (
          <DefaultAvatar size={36} />
        )}
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <Text style={s.metaHostName} numberOfLines={1}>@{session.host?.username || 'anonymous'}</Text>
          {session.host?.skill_title ? (
            <Text style={s.metaHostSkill} numberOfLines={1}>{session.host.skill_title}</Text>
          ) : null}
        </View>
      </View>
      <View style={s.metaPillRow}>
        {isLive ? (
          <View style={s.metaLivePill}>
            <View style={s.metaLivePulse} />
            <Text style={s.metaLivePillText}>LIVE</Text>
          </View>
        ) : (
          <View style={s.metaEndedPill}>
            <Text style={s.metaEndedPillText}>ENDED</Text>
          </View>
        )}
        {isLive && typeof session.viewer_count === 'number' ? (
          <View style={s.metaViewerPill}>
            <IconSymbol name="eye.fill" size={11} color="#fff" />
            <Text style={s.metaViewerText}>{session.viewer_count}</Text>
          </View>
        ) : null}
        {duration != null ? (
          <View style={s.metaDurationPill}>
            <Text style={s.metaDurationText}>{durationLabel(duration)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Compact "now playing" card — small jacket thumbnail on the left,
 * song info on the right. Pairs with VideoSessionMeta so the song
 * stays visible without competing with the dominant video embed.
 */
function NowPlayingCard({
  lastPlay,
  isLive,
  s,
}: {
  lastPlay: LiveSessionPlay;
  isLive: boolean;
  s: Styles;
}) {
  const jacket = lastPlay.background_url || '';
  return (
    <View style={s.npCard}>
      {jacket ? (
        <Image source={{ uri: jacket }} style={s.npThumb} contentFit="cover" />
      ) : (
        <View style={[s.npThumb, s.npThumbFallback]} />
      )}
      <View style={s.npBody}>
        <Text style={s.npLabel}>{isLive ? 'NOW PLAYING' : 'LAST PLAY'}</Text>
        <Text style={s.npTitle} numberOfLines={1}>{lastPlay.song_title}</Text>
        <View style={s.npMetaRow}>
          <View style={[s.npModeBadge, { backgroundColor: modeAccent(lastPlay.mode) }]}>
            <Text style={s.npModeBadgeText}>{modeShort(lastPlay.mode)}{lastPlay.level}</Text>
          </View>
          {lastPlay.score > 0 ? (
            <>
              <Text style={s.npScore}>{fmtNum(lastPlay.score)}</Text>
              <GradeChip grade={lastPlay.grade} score={lastPlay.score} size="sm" />
              {lastPlay.plate ? <PlateBadge plate={lastPlay.plate} size="sm" /> : null}
            </>
          ) : (
            <Text style={s.npBreak}>STAGE BREAK</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function HeroCard({
  session,
  lastPlay,
  isLive,
  duration,
  s,
  compact = false,
}: {
  session: LiveSessionFull;
  lastPlay: LiveSessionPlay | null | undefined;
  isLive: boolean;
  duration: number | null;
  s: Styles;
  /** Portrait layout asks for a flatter hero — drops the last-play
   *  card and shortens the aspect ratio so the YouTube embed below
   *  has more room. */
  compact?: boolean;
}) {
  const hostAvatar = typeof session.host?.avatar === 'string' ? fullImageUrl(session.host.avatar) : undefined;
  const jacket = lastPlay?.background_url || '';
  return (
    <View style={[s.hero, compact && s.heroCompact]}>
      <View style={s.heroBgWrap}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.heroBg} contentFit="cover" />
        ) : (
          <View style={[s.heroBg, s.heroBgFallback]} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(10,15,28,0.96)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={s.heroTop}>
        {isLive ? (
          <View style={s.heroLivePill}>
            <View style={s.heroLivePulse} />
            <Text style={s.heroLivePillText}>LIVE</Text>
          </View>
        ) : (
          <View style={s.heroEndedPill}>
            <Text style={s.heroEndedPillText}>ENDED</Text>
          </View>
        )}
        {isLive && typeof session.viewer_count === 'number' ? (
          <View style={s.heroViewerPill}>
            <IconSymbol name="eye.fill" size={11} color="#fff" />
            <Text style={s.heroViewerText}>{session.viewer_count}</Text>
            {session.viewer_peak && session.viewer_peak > session.viewer_count ? (
              <Text style={s.heroViewerPeak}> · {session.viewer_peak} peak</Text>
            ) : null}
          </View>
        ) : null}
        {duration != null ? (
          <View style={s.heroDurationPill}>
            <Text style={s.heroDurationText}>{durationLabel(duration)}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.heroBottom}>
        <Text style={s.heroTitle} numberOfLines={2}>{session.title || 'Live session'}</Text>
        <View style={s.heroHostRow}>
          {hostAvatar ? (
            <Image source={{ uri: hostAvatar }} style={s.heroHostAvatar} contentFit="cover" />
          ) : (
            <DefaultAvatar size={32} />
          )}
          <View style={s.heroHostText}>
            <Text style={s.heroHostName} numberOfLines={1}>@{session.host?.username || 'anonymous'}</Text>
            {session.host?.skill_title ? (
              <Text style={s.heroHostSkill} numberOfLines={1}>{session.host.skill_title}</Text>
            ) : null}
          </View>
          {session.cohost_count && session.cohost_count > 0 ? (
            <View style={s.cohostPill}>
              <IconSymbol name="person.2.fill" size={11} color="#fbbf24" />
              <Text style={s.cohostText}>+{session.cohost_count}</Text>
            </View>
          ) : null}
        </View>

        {lastPlay && !compact ? (
          <View style={s.heroPlayCard}>
            <Text style={s.heroPlayLabel}>{isLive ? 'NOW PLAYING' : 'LAST PLAY'}</Text>
            <Text style={s.heroPlaySong} numberOfLines={1}>{lastPlay.song_title}</Text>
            <View style={s.heroPlayMetaRow}>
              <View style={[s.heroPlayModeBadge, { backgroundColor: modeAccent(lastPlay.mode) }]}>
                <Text style={s.heroPlayModeBadgeText}>{modeShort(lastPlay.mode)}{lastPlay.level}</Text>
              </View>
              {lastPlay.score > 0 ? (
                <>
                  <Text style={s.heroPlayScore}>{fmtNum(lastPlay.score)}</Text>
                  <GradeChip grade={lastPlay.grade} score={lastPlay.score} size="sm" />
                  {lastPlay.plate ? <PlateBadge plate={lastPlay.plate} size="sm" /> : null}
                </>
              ) : (
                <Text style={s.heroPlayBreak}>STAGE BREAK</Text>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SummaryStats({ summary, s }: { summary: LiveSessionSummaryPayload; s: Styles }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>SESSION STATS</Text>
        {summary.sessionMachineName ? (
          <Text style={s.sectionCount}>{summary.sessionMachineName}</Text>
        ) : null}
      </View>
      <View style={s.statGrid}>
        <Stat label="SONGS" value={fmtNum(summary.songCount)} s={s} />
        <Stat
          label="CLEARS"
          value={`${fmtNum(summary.clearCount)}/${fmtNum(summary.songCount)}`}
          sub={`${summary.clearRate}%`}
          s={s}
        />
        <Stat label="PERFECT %" value={`${summary.perfectRate}%`} sub={`${fmtNum(summary.judgmentTotals.perfect)} pf`} s={s} />
        <Stat label="AVG LEVEL" value={summary.averageLevel.toFixed(1)} s={s} />
        <Stat label="AVG SCORE" value={fmtNum(summary.averageScore)} s={s} />
        <Stat label="STEPS" value={fmtNum(summary.totalSteps)} sub={`${fmtNum(summary.estimatedKcal)} kcal`} s={s} />
      </View>
    </View>
  );
}

function Stat({ label, value, sub, s }: { label: string; value: string; sub?: string; s: Styles }) {
  return (
    <View style={s.statTile}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function PlayRow({ play, onPress, s }: { play: LiveSessionPlay; onPress?: () => void; s: Styles }) {
  const jacket = play.background_url || '';
  const passed = play.score > 0;
  const performerAvatar = typeof play.avatar === 'string' ? fullImageUrl(play.avatar) : undefined;
  const isCohostPlay = play.participant_role === 'cohost' || play.participant_role === 'co-host';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.playRow, pressed && onPress ? { opacity: 0.7 } : null]}>
      {jacket ? (
        <Image source={{ uri: jacket }} style={s.playJacket} contentFit="cover" />
      ) : (
        <View style={[s.playJacket, s.playJacketFallback]} />
      )}
      <View style={s.playMain}>
        <View style={s.playTitleRow}>
          <Text style={s.playTitle} numberOfLines={1}>{play.song_title}</Text>
          {isCohostPlay && performerAvatar ? (
            <Image source={{ uri: performerAvatar }} style={s.playCohostMarker} contentFit="cover" />
          ) : null}
        </View>
        <View style={s.playMetaRow}>
          <View style={[s.playModeBadge, { backgroundColor: modeAccent(play.mode) }]}>
            <Text style={s.playModeBadgeText}>{modeShort(play.mode)}{play.level}</Text>
          </View>
          {passed ? (
            <>
              <Text style={s.playScore}>{fmtNum(play.score)}</Text>
              <GradeChip grade={play.grade} score={play.score} size="sm" />
              {play.plate ? <PlateBadge plate={play.plate} size="sm" /> : null}
            </>
          ) : (
            <Text style={s.playBreak}>STAGE BREAK</Text>
          )}
        </View>
      </View>
      {play.rating && play.rating > 0 ? (
        <View style={s.playRatingCol}>
          <Text style={s.playRatingNum}>{fmtNum(play.rating)}</Text>
          <Text style={s.playRatingUnit}>RP</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { paddingBottom: 60, gap: 14 },
  center: { padding: 32, alignItems: 'center' as const },

  // Desktop: 8/12 stream + plays on the left, 4/12 chat rail on the right
  // with the composer pinned at the bottom (Twitch-style).
  deskBody: { flex: 1, flexDirection: 'row' as const },
  deskBodyTheater: { },
  deskMain: { flex: 2, minWidth: 0 },
  deskMainContent: { paddingHorizontal: 16, paddingBottom: 48, gap: 14 },
  deskRail: {
    width: 360,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
  },
  // Narrower rail on 960–1199 px desktops so the main column doesn't
  // get cramped — gives the stream embed enough room to breathe.
  deskRailNarrow: { width: 300 },
  deskRailHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    backgroundColor: t.surface,
  },
  deskRailHeaderActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  deskRailContent: { padding: 12, gap: 12, paddingBottom: 12 },
  // Theater toggle in the rail header — square button that flips the
  // page into a chat-hidden, stream-wide mode. Press T to do the same.
  theaterBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  theaterBtnText: { fontSize: 13, color: t.textMuted, fontWeight: '900' as const, lineHeight: 14 },
  theaterShowChatBtn: {
    position: 'absolute' as const,
    bottom: 24, right: 24,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: t.accent,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  theaterShowChatText: { fontSize: 12, fontWeight: '900' as const, color: '#050505', letterSpacing: 0.4 },
  chatJumpBtn: {
    position: 'absolute' as const,
    bottom: 76, alignSelf: 'center' as const,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.accent,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  chatJumpBtnText: { fontSize: 11, fontWeight: '900' as const, color: '#050505', letterSpacing: 0.3 },

  // Portrait desktop — rotated monitors. Vertical stack with a sticky
  // stream at the top, tabbed body in the middle, composer pinned to
  // the bottom of the viewport.
  portraitBody: { flex: 1, flexDirection: 'column' as const, backgroundColor: t.bg },
  portraitStream: {
    backgroundColor: '#000',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  portraitTabs: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  portraitTabBtn: {
    flex: 1,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  portraitTabBtnActive: { borderBottomColor: t.accent, backgroundColor: t.surfaceMuted },
  portraitTabText: { fontSize: 13, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.4 },
  portraitTabTextActive: { color: t.text },
  portraitTabCount: {
    fontSize: 10, fontWeight: '900' as const, color: t.textDim,
    backgroundColor: t.surfaceMuted, borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 1,
    fontVariant: ['tabular-nums' as const],
  },
  portraitTabCountActive: { backgroundColor: t.accentTint, color: t.accent },
  portraitChat: { flex: 1, position: 'relative' as const },


  empty: { padding: 32, alignItems: 'center' as const, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  backLink: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: t.surfaceMuted },
  backLinkText: { color: t.text, fontWeight: '700' as const },

  // Hero
  // Flatter ratio in portrait mode so the YouTube embed underneath has
  // proportionally more space.
  heroCompact: { aspectRatio: 16 / 7 },
  hero: {
    aspectRatio: 16 / 11,
    backgroundColor: '#000',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  heroBgWrap: { ...StyleSheet.absoluteFillObject },
  heroBg: { width: '100%' as const, height: '100%' as const },
  heroBgFallback: { backgroundColor: '#0f172a' },
  heroTop: {
    position: 'absolute' as const,
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  heroLivePill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dc2626' },
  heroLivePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  heroLivePillText: { fontSize: 11, fontWeight: '900' as const, color: '#fff', letterSpacing: 1.2 },
  heroEndedPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.65)' },
  heroEndedPillText: { fontSize: 11, fontWeight: '900' as const, color: '#94a3b8', letterSpacing: 1.2 },
  heroViewerPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.65)' },
  heroViewerText: { fontSize: 11, fontWeight: '900' as const, color: '#fff', fontVariant: ['tabular-nums' as const] },
  heroViewerPeak: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  heroDurationPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.65)' },
  heroDurationText: { fontSize: 11, fontWeight: '800' as const, color: '#34d399' },

  heroBottom: { position: 'absolute' as const, left: 14, right: 14, bottom: 14, gap: 10 },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: '#fff',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroHostRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  heroHostAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceMuted },
  heroHostText: { flex: 1, gap: 1 },
  heroHostName: { fontSize: 14, fontWeight: '800' as const, color: '#fff' },
  heroHostSkill: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  cohostPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(250, 204, 21, 0.18)' },
  cohostText: { fontSize: 10, fontWeight: '900' as const, color: '#fbbf24' },

  heroPlayCard: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroPlayLabel: { fontSize: 9, fontWeight: '900' as const, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2 },
  heroPlaySong: { fontSize: 14, fontWeight: '900' as const, color: '#fff' },
  heroPlayMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  heroPlayModeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  heroPlayModeBadgeText: { fontSize: 11, fontWeight: '900' as const, color: '#0a0f1c' },
  heroPlayScore: { fontSize: 13, fontWeight: '900' as const, color: '#fff', fontVariant: ['tabular-nums' as const] },
  heroPlayBreak: { fontSize: 11, fontWeight: '900' as const, color: t.danger, letterSpacing: 1.2 },

  // Video-mode session meta — slim card with host on the left and
  // status pills on the right. Used in place of HeroCard when the
  // YouTube embed is rendered first and already dominates the screen.
  metaCard: {
    marginHorizontal: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  metaHostBlock: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minWidth: 0 },
  metaHostAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  metaHostName: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  metaHostSkill: { fontSize: 11, color: t.textMuted },
  metaPillRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const, justifyContent: 'flex-end' as const },
  metaLivePill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dc2626' },
  metaLivePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  metaLivePillText: { fontSize: 11, fontWeight: '900' as const, color: '#fff', letterSpacing: 1.2 },
  metaEndedPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: t.surfaceMuted },
  metaEndedPillText: { fontSize: 11, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.2 },
  metaViewerPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: t.surfaceMuted },
  metaViewerText: { fontSize: 11, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  metaDurationPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: t.surfaceMuted },
  metaDurationText: { fontSize: 11, fontWeight: '800' as const, color: t.text },

  // Compact "now playing" card paired with the video embed.
  npCard: {
    marginHorizontal: 12,
    flexDirection: 'row' as const,
    borderRadius: 12,
    overflow: 'hidden' as const,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  npThumb: { width: 80, height: 80, backgroundColor: t.surfaceMuted },
  npThumbFallback: { backgroundColor: t.surfaceMuted },
  npBody: { flex: 1, padding: 10, gap: 4, justifyContent: 'center' as const },
  npLabel: { fontSize: 9, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.4 },
  npTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  npMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  npModeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  npModeBadgeText: { fontSize: 11, fontWeight: '900' as const, color: '#0a0f1c' },
  npScore: { fontSize: 13, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  npBreak: { fontSize: 11, fontWeight: '900' as const, color: t.danger, letterSpacing: 1.2 },

  // Stream
  streamEmbedWrap: {
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: '#000',
  },
  streamCta: {
    marginHorizontal: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#dc2626',
  },
  streamCtaText: { flex: 1, fontSize: 14, fontWeight: '900' as const, color: '#fff', letterSpacing: 0.3 },

  // Section
  section: { gap: 8, paddingHorizontal: 12 },
  sectionHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  sectionCount: { fontSize: 11, fontWeight: '700' as const, color: t.textDim },

  // Stats grid
  statGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  statTile: {
    flexBasis: '31%' as const,
    flexGrow: 1,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
    gap: 2,
  },
  statLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  statValue: { fontSize: 17, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statSub: { fontSize: 10, color: t.textDim },

  // Plays
  playList: { gap: 6 },
  // Desktop-only grid for the recent-plays section. flexBasis sets the
  // column count; flexGrow lets the last row fill empty space; minWidth
  // protects readability when the chat rail eats the main column.
  playGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  playGridCell2: { flexBasis: '48%' as const, flexGrow: 1, minWidth: 240 },
  playGridCell3: { flexBasis: '31%' as const, flexGrow: 1, minWidth: 240 },
  playRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: t.card,
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  playJacket: { width: 56, height: 36, borderRadius: 4, backgroundColor: t.surfaceMuted },
  playJacketFallback: {},
  playMain: { flex: 1, gap: 4 },
  playTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  playTitle: { flex: 1, fontSize: 13, fontWeight: '800' as const, color: t.text },
  playCohostMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34, 211, 238, 0.6)',
    backgroundColor: t.surfaceMuted,
  },
  playMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  playModeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  playModeBadgeText: { fontSize: 11, fontWeight: '900' as const, color: '#0a0f1c' },
  playScore: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  playBreak: { fontSize: 10, fontWeight: '900' as const, color: t.danger, letterSpacing: 1.2 },
  playRatingCol: { alignItems: 'flex-end' as const, minWidth: 50 },
  playRatingNum: { fontSize: 14, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  playRatingUnit: { fontSize: 9, fontWeight: '700' as const, color: t.textDim, letterSpacing: 0.5 },
  playsEmpty: { fontSize: 12, color: t.textDim, paddingHorizontal: 6, paddingVertical: 8, textAlign: 'center' as const },

  // Plays filter bar
  filterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 4,
    flexWrap: 'wrap' as const,
  },
  modePillRow: { flexDirection: 'row' as const, gap: 4, backgroundColor: t.card, borderRadius: 999, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  modePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  modePillActive: { backgroundColor: t.accent },
  modePillText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.4 },
  modePillTextActive: { color: '#0a0f1c' },
  passToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
  },
  passToggleActive: { borderColor: 'rgba(52, 211, 153, 0.45)', backgroundColor: 'rgba(52, 211, 153, 0.12)' },
  passToggleText: { fontSize: 10, fontWeight: '900' as const, color: t.textMuted, letterSpacing: 0.8 },
  passToggleTextActive: { color: '#34d399' },

  // Cohosts
  cohostList: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  cohostChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    maxWidth: 200,
  },
  cohostChipOwner: { borderColor: 'rgba(251, 191, 36, 0.45)', backgroundColor: 'rgba(251, 191, 36, 0.08)' },
  cohostChipAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: t.surfaceMuted },
  cohostChipName: { fontSize: 12, fontWeight: '800' as const, color: t.text, maxWidth: 110 },
  cohostChipRole: { fontSize: 9, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1 },
  manageBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: t.accent,
  },
  manageBtnText: { fontSize: 10, fontWeight: '900' as const, color: '#0a0f1c', letterSpacing: 1 },

  // Recap
  recapCard: {
    marginHorizontal: 12,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 8,
  },
  recapEyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  recapText: { fontSize: 13, lineHeight: 19, color: t.text },

  // End-session header button (host only)
  endBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#dc2626',
    marginRight: 8,
  },
  endBtnText: { fontSize: 11, fontWeight: '900' as const, color: '#fff', letterSpacing: 1.4 },

  // Chat
  chatList: { gap: 4 },
  chatRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  chatAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted, marginTop: 2 },
  chatBody: { flex: 1, gap: 2 },
  chatHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  chatUser: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  chatHostBadge: {
    fontSize: 8,
    fontWeight: '900' as const,
    color: '#fbbf24',
    letterSpacing: 1.2,
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  chatSkill: { fontSize: 10, color: t.textDim, marginLeft: 'auto' as const },
  chatMessage: { fontSize: 13, lineHeight: 18, color: t.text },

  // System message row (session_start / session_end / …)
  systemRow: { paddingVertical: 4, paddingHorizontal: 4 },
  systemText: { fontSize: 11, color: t.textDim, fontStyle: 'italic' as const, textAlign: 'center' as const },

  // Song-payload message (play / request / vote_result)
  songRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  songBody: { flex: 1, gap: 3 },
  songEyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4, color: '#fbbf24' },
  songMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
  songTitle: { flexShrink: 1, fontSize: 13, fontWeight: '800' as const, color: t.text },
  songScore: { fontSize: 12, fontWeight: '800' as const, color: '#67e8f9', fontVariant: ['tabular-nums' as const] },
  songSubtle: { fontSize: 11, color: t.textDim },

  // Chat composer
  composer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    backgroundColor: t.bg,
  },
  composerInput: {
    flex: 1,
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    maxHeight: 100,
  },
  composerSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

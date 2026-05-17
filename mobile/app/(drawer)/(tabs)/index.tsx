import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DailyHighlights } from '@/components/dashboard/daily-highlights';
import { DefaultAvatar } from '@/components/default-avatar';
import { SystemAvatar } from '@/components/system-avatar';
import { LiveNowStrip } from '@/components/dashboard/live-now-strip';
import { NoticeBoard } from '@/components/dashboard/notice-board';
import { SongOfWeekStrip } from '@/components/dashboard/song-of-week-strip';
import { WeeklyChallengesSummary } from '@/components/dashboard/weekly-challenges-summary';
import { TopBar } from '@/components/top-bar';
import { QuickNavButton } from '@/components/quick-nav-button';
import { useTheme } from '@/contexts/theme-context';
import { useAutoUpdate } from '@/hooks/use-auto-update';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebPullToRefresh } from '@/hooks/use-web-pull-to-refresh';
import { UpdateBanner } from '@/components/update-banner';
import { UpdateSheet } from '@/components/update-sheet';
import { useState } from 'react';
import { dashboardApi, socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { ActivityItem, Tournament } from '@shared/api';

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const ms = Date.now() - d.getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
}

const ACTIVITY_ICONS: Record<string, string> = {
  new_user: '👤',
  upscore: '📈',
  new_clear: '🎯',
  new_post: '📝',
  new_tournament: '🏆',
  new_duel: '⚔️',
  new_online_duel: '🌐',
  tournament_win: '🥇',
  duel_win: '🏅',
  online_duel_win: '🏅',
};

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

interface PlacementEntry {
  rank?: number;
  player_id?: string;
  name?: string;
}

// Bucket priority — `final` is the authoritative end-of-tournament ranking,
// then `gauntlet` (last phase if multi-phase ends with gauntlet), then
// other final-stage formats, then `round_robin` only as a last resort
// (because it's typically just the seeding phase, not the winner).
const PLACEMENT_BUCKET_PRIORITY = [
  'final',
  'gauntlet',
  'double_elim',
  'single_elim',
  'pools',
  'b15',
  'hour_of_power',
  'round_robin',
];

function parsePlacementSnapshots(raw: unknown): PlacementEntry[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as Record<string, unknown>;
  for (const key of PLACEMENT_BUCKET_PRIORITY) {
    const value = obj[key];
    if (Array.isArray(value) && value.length > 0) return value as PlacementEntry[];
  }
  // Fallback: any non-empty bucket if none of the priority keys matched.
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && value.length > 0) return value as PlacementEntry[];
  }
  return [];
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function TournamentRow({ t, onPress, s }: { t: Tournament; onPress: () => void; s: Styles }) {
  const completed = String(t.phase || '').toUpperCase() === 'COMPLETED';
  const placements = parsePlacementSnapshots((t as Record<string, unknown>).placement_snapshots);
  const top3 = [...placements]
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .slice(0, 3);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      <View style={s.rowMain}>
        <View style={s.rowTitleLine}>
          {completed ? <Text style={s.completedIcon}>🏁</Text> : null}
          <Text style={s.rowTitle} numberOfLines={1}>{t.name}</Text>
        </View>
        <Text style={s.rowMeta} numberOfLines={1}>
          {[t.phase, t.location, formatDate(t.date)].filter(Boolean).join(' · ')}
        </Text>
        {top3.length > 0 ? (
          <View style={s.placementsRow}>
            {top3.map((p, i) => (
              <Text key={String(p.player_id ?? i)} style={s.placementPill} numberOfLines={1}>
                {RANK_MEDALS[i] ?? `#${p.rank ?? i + 1}`} {p.name ?? '—'}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      {!completed && typeof t.current_round === 'number' && typeof t.total_rounds === 'number' && t.total_rounds > 0 ? (
        <Text style={s.rowBadge}>R{t.current_round}/{t.total_rounds}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Map server-issued web URL (`/post/123`, `/upscore/221`, …) to a mobile
 * router target. Returns null for activity types that still don't have a
 * mobile single-item screen (duels), in which case the caller falls back
 * to the user's profile so the row is at least reachable.
 */
function mapActivityLink(link: string | undefined): { pathname: string; params: Record<string, string> } | null {
  if (!link) return null;
  const segments = link.replace(/^\//, '').split('/');
  const [head, id] = segments;
  if (!id) return null;
  switch (head) {
    case 'post':
      return { pathname: '/post/[id]', params: { id } };
    case 'profile':
      return { pathname: '/profile/[id]', params: { id } };
    case 'song':
      return { pathname: '/song/[id]', params: { id } };
    case 'tournament':
      return { pathname: '/tournament/[id]', params: { id } };
    case 'live':
      return { pathname: '/live/[id]', params: { id } };
    case 'upscore':
      return { pathname: '/upscore/[id]', params: { id } };
    case 'clear':
      return { pathname: '/clear/[id]', params: { id } };
    default:
      return null;
  }
}

function ActivityRow({ a, s }: { a: ActivityItem; s: Styles }) {
  const router = useRouter();
  const icon = ACTIVITY_ICONS[a.type] || '•';
  const avatar = typeof a.avatar === 'string' ? fullImageUrl(a.avatar) : undefined;
  const target = mapActivityLink(a.link);
  // Duels still don't have a single-item mobile screen, so the username
  // fallback covers those — drop the user on the owner's profile so the
  // activity is at least reachable.
  const fallbackUsername = a.username && a.username !== '__shinsa__' ? a.username : null;
  const hasNavTarget = !!target || !!fallbackUsername;

  const handlePress = () => {
    if (target) {
      router.push(target as never);
    } else if (fallbackUsername) {
      router.push({ pathname: '/profile/[id]', params: { id: `@${fallbackUsername}` } });
    }
  };

  return (
    <Pressable
      onPress={hasNavTarget ? handlePress : undefined}
      disabled={!hasNavTarget}
      style={({ pressed }) => [s.activityRow, pressed && hasNavTarget && { opacity: 0.7 }]}>
      <Text style={s.activityIcon}>{icon}</Text>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.activityAvatar} contentFit="cover" />
      ) : a.username === '__shinsa__' ? (
        <SystemAvatar size={22} />
      ) : (
        <DefaultAvatar size={22} />
      )}
      <Text style={s.activityMessage} numberOfLines={1}>{a.message}</Text>
      <Text style={s.activityTime}>{timeAgo(a.created_at)}</Text>
    </Pressable>
  );
}

function Section({ title, count, children, s }: {
  title: string;
  count: number;
  children: React.ReactNode;
  s: Styles;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionCount}>{count}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { isDesktop } = useBreakpoint();

  const dashQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
  });

  const activityQuery = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => socialApi.recentActivity(),
    retry: false,
  });

  const refetchAll = () => {
    dashQuery.refetch();
    activityQuery.refetch();
  };

  const isRefetching = dashQuery.isRefetching || activityQuery.isRefetching;

  // Web build needs a JS-driven pull gesture — see hook for why. Native
  // keeps using the standard RefreshControl spinner below. Returns a
  // callback ref so we re-bind listeners whenever the ScrollView remounts.
  const setWebScrollRef = useWebPullToRefresh(refetchAll);

  // Auto-update — silent check on launch; banner appears if newer APK
  // exists. Dismissed flag is session-scoped so the user isn't nagged on
  // every re-render after they tap X.
  const updater = useAutoUpdate({ checkOnMount: true });
  const [updateSheetOpen, setUpdateSheetOpen] = useState(false);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);

  const quickNav = (
    <View style={s.quickNav}>
      <QuickNavButton label="Live" href="/live" icon="video.fill"
        gradientFrom="#22d3ee" gradientTo="#1d4ed8"
        borderColor="rgba(165,243,252,0.45)" shadowColor="#1d4ed8" />
      <QuickNavButton label="Songs" href="/songs" icon="music.note"
        gradientFrom="#34d399" gradientTo="#0f766e"
        borderColor="rgba(167,243,208,0.45)" shadowColor="#0f766e" />
      <QuickNavButton label="Lists" href="/lists" icon="list.bullet.rectangle"
        gradientFrom="#a78bfa" gradientTo="#6d28d9"
        borderColor="rgba(196,181,253,0.45)" shadowColor="#6d28d9" />
      <QuickNavButton label="Training" href="/training" icon="chart.line.uptrend.xyaxis"
        gradientFrom="#fbbf24" gradientTo="#c2410c"
        borderColor="rgba(252,211,77,0.45)" shadowColor="#c2410c" />
    </View>
  );

  const activitySection = activityQuery.data && activityQuery.data.length > 0 ? (
    <View style={s.section}>
      <Text style={s.eyebrowTitle}>RECENT ACTIVITY</Text>
      <View style={s.sectionBody}>
        {activityQuery.data.slice(0, 10).map((a, i) => <ActivityRow key={i} a={a} s={s} />)}
      </View>
    </View>
  ) : null;

  /** Two-column activity for desktop — splits the 10-row list down the middle. */
  const desktopActivity = activityQuery.data && activityQuery.data.length > 0 ? (() => {
    const items = activityQuery.data.slice(0, 10);
    const half = Math.ceil(items.length / 2);
    const left = items.slice(0, half);
    const right = items.slice(half);
    return (
      <View style={s.section}>
        <Text style={s.eyebrowTitle}>RECENT ACTIVITY</Text>
        <View style={s.deskActivityRow}>
          <View style={[s.sectionBody, { flex: 1 }]}>
            {left.map((a, i) => <ActivityRow key={i} a={a} s={s} />)}
          </View>
          <View style={[s.sectionBody, { flex: 1 }]}>
            {right.map((a, i) => <ActivityRow key={`r-${i}`} a={a} s={s} />)}
          </View>
        </View>
      </View>
    );
  })() : null;

  const tournamentsSection = dashQuery.data && dashQuery.data.tournaments.length > 0 ? (
    <Section s={s} title="Tournaments" count={dashQuery.data.tournaments.length}>
      {dashQuery.data.tournaments.slice(0, 10).map((t) => (
        <TournamentRow
          key={t.id}
          t={t}
          s={s}
          onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: t.id } })}
        />
      ))}
    </Section>
  ) : null;

  const loadingAndError = (
    <>
      {dashQuery.isLoading && (
        <View style={s.center}>
          <ActivityIndicator color={theme.spinner} />
        </View>
      )}
      {dashQuery.isError && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>
            {dashQuery.error instanceof Error ? dashQuery.error.message : 'Failed to load dashboard'}
          </Text>
        </View>
      )}
    </>
  );

  if (isDesktop) {
    return (
      <View style={s.container}>
        {isRefetching ? (
          <View style={s.refreshSpinnerBar} pointerEvents="none">
            <ActivityIndicator size="small" color={theme.spinner} />
          </View>
        ) : null}
        <ScrollView
          ref={setWebScrollRef as never}
          contentContainerStyle={s.deskScroll}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={theme.spinner} />
          }>
          <View style={s.deskTopBar}>
            <Text style={s.deskHeading}>Home</Text>
            <TopBar />
          </View>

          {!updateBannerDismissed ? (
            <UpdateBanner
              updater={updater}
              onPress={() => setUpdateSheetOpen(true)}
              onDismiss={() => setUpdateBannerDismissed(true)}
            />
          ) : null}

          <View style={s.deskGrid}>
            <View style={s.deskMain}>
              {quickNav}
              {loadingAndError}
              <NoticeBoard />
              {desktopActivity}
              <DailyHighlights />
              <SongOfWeekStrip />
              {tournamentsSection}
            </View>
            <View style={s.deskRail}>
              <LiveNowStrip />
              <WeeklyChallengesSummary />
            </View>
          </View>
        </ScrollView>
        <UpdateSheet
          visible={updateSheetOpen}
          updater={updater}
          onClose={() => setUpdateSheetOpen(false)}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {isRefetching ? (
        <View style={[s.refreshSpinnerBar, { top: insets.top + 4 }]} pointerEvents="none">
          <ActivityIndicator size="small" color={theme.spinner} />
        </View>
      ) : null}
      <ScrollView
        ref={setWebScrollRef as never}
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={theme.spinner} />}>
        <TopBar />

        {!updateBannerDismissed ? (
          <UpdateBanner
            updater={updater}
            onPress={() => setUpdateSheetOpen(true)}
            onDismiss={() => setUpdateBannerDismissed(true)}
          />
        ) : null}

        {quickNav}

        {loadingAndError}

        <NoticeBoard />
        <LiveNowStrip />

        {activitySection}

        <DailyHighlights />
        <SongOfWeekStrip />
        <WeeklyChallengesSummary />

        {tournamentsSection}
      </ScrollView>
      <UpdateSheet
        visible={updateSheetOpen}
        updater={updater}
        onClose={() => setUpdateSheetOpen(false)}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 80, gap: 24 },
  // Floating top-of-screen spinner shown while React Query is refetching —
  // RN's RefreshControl spinner only renders on native, so this is what
  // web users actually see when their pull-to-refresh gesture lands.
  refreshSpinnerBar: {
    position: 'absolute' as const,
    top: 6,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
    zIndex: 10,
  },
  quickNav: { flexDirection: 'row' as const, gap: 8, paddingTop: 4 },
  center: { padding: 32, alignItems: 'center' as const },
  errorBox: {
    backgroundColor: t.dangerBg,
    borderColor: t.dangerBorder,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: t.danger, fontSize: 14 },
  section: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' as const, color: t.text },
  sectionCount: { fontSize: 12, color: t.textDim },
  eyebrowTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  sectionBody: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  rowPressed: { backgroundColor: t.accentTint },
  rowMain: { flex: 1, gap: 4, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  completedIcon: { fontSize: 14 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: t.text },
  rowMeta: { fontSize: 12, color: t.textMuted },
  placementsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, paddingTop: 4 },
  placementPill: {
    fontSize: 11,
    color: t.text,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  rowBadge: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: t.accentTint,
    color: t.accent,
    fontWeight: '700' as const,
  },
  activityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 8,
  },
  activityIcon: { fontSize: 14, width: 20, textAlign: 'center' as const },
  activityAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: t.surfaceMuted },
  activityAvatarPlaceholder: { width: 22, height: 22 },
  activityMessage: { flex: 1, fontSize: 12, color: t.textMuted },
  activityTime: { fontSize: 10, color: t.textDim },

  // Desktop ("deskX") — 2-col dashboard.
  deskScroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 60 },
  deskTopBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    marginBottom: 18,
  },
  deskHeading: { fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 0.5 },
  deskGrid: { flexDirection: 'row' as const, gap: 18, alignItems: 'flex-start' as const },
  deskMain: { flex: 2, gap: 18, minWidth: 0 },
  deskRail: { flex: 1, maxWidth: 360, gap: 18 },
  deskActivityRow: { flexDirection: 'row' as const, gap: 12 },
});

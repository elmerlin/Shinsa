import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DailyHighlights } from '@/components/dashboard/daily-highlights';
import { NoticeBoard } from '@/components/dashboard/notice-board';
import { SongOfWeekStrip } from '@/components/dashboard/song-of-week-strip';
import { WeeklyChallengesSummary } from '@/components/dashboard/weekly-challenges-summary';
import { HamburgerButton } from '@/components/hamburger-button';
import { PumpShinsaLogo } from '@/components/pump-shinsa-logo';
import { QuickNavButton } from '@/components/quick-nav-button';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { dashboardApi, socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { ActivityItem, Duel, Notice, Tournament } from '@shared/api';

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

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function TournamentRow({ t, onPress, s }: { t: Tournament; onPress: () => void; s: Styles }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={1}>{t.name}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {[t.phase, t.location, formatDate(t.date)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {typeof t.current_round === 'number' && typeof t.total_rounds === 'number' && t.total_rounds > 0 ? (
        <Text style={s.rowBadge}>R{t.current_round}/{t.total_rounds}</Text>
      ) : null}
    </Pressable>
  );
}

function DuelRow({ d, s }: { d: Duel; s: Styles }) {
  return (
    <View style={s.row}>
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={1}>{d.name || 'Untitled duel'}</Text>
        <Text style={s.rowMeta}>{formatDate(d.created_at)}</Text>
      </View>
    </View>
  );
}

function NoticeRow({ n, s }: { n: Notice; s: Styles }) {
  return (
    <View style={s.row}>
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={2}>
          {n.pinned ? '📌 ' : ''}{n.title || 'Untitled notice'}
        </Text>
        {n.body ? <Text style={s.rowMeta} numberOfLines={2}>{n.body}</Text> : null}
      </View>
    </View>
  );
}

function ActivityRow({ a, s }: { a: ActivityItem; s: Styles }) {
  const icon = ACTIVITY_ICONS[a.type] || '•';
  const avatar = typeof a.avatar === 'string' ? fullImageUrl(a.avatar) : undefined;
  // Strip any embedded markup like emojis at start; web does a `renderFormattedText` pass.
  // For mobile we just render the text plainly — server returns a human-friendly message.
  return (
    <View style={s.activityRow}>
      <Text style={s.activityIcon}>{icon}</Text>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.activityAvatar} contentFit="cover" />
      ) : (
        <View style={s.activityAvatarPlaceholder} />
      )}
      <Text style={s.activityMessage} numberOfLines={1}>{a.message}</Text>
      <Text style={s.activityTime}>{timeAgo(a.created_at)}</Text>
    </View>
  );
}

function Section({ title, count, children, empty, isEmpty, s }: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty: string;
  isEmpty: boolean;
  s: Styles;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionCount}>{count}</Text>
      </View>
      {isEmpty ? <Text style={s.empty}>{empty}</Text> : <View style={s.sectionBody}>{children}</View>}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const dashQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
  });

  const activityQuery = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => socialApi.recentActivity(),
    // Recent Activity is auth-protected; if it 401s we just hide the section.
    retry: false,
  });

  const refetchAll = () => {
    dashQuery.refetch();
    activityQuery.refetch();
  };

  const isRefetching = dashQuery.isRefetching || activityQuery.isRefetching;

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={theme.spinner} />}>
        <View style={s.brandRow}>
          <HamburgerButton />
          <View style={s.brandCenter}>
            <PumpShinsaLogo variant="horizontal" size={40} />
          </View>
          <View style={s.brandSpacer} />
        </View>

        <View style={s.quickNav}>
          <QuickNavButton label="Live" href="/live" icon="video.fill"
            gradientFrom="#06b6d4" gradientTo="#1d4ed8" borderColor="rgba(165,243,252,0.3)" />
          <QuickNavButton label="Songs" href="/songs" icon="music.note"
            gradientFrom="#10b981" gradientTo="#0f766e" borderColor="rgba(167,243,208,0.3)" />
          <QuickNavButton label="Lists" href="/lists" icon="list.bullet.rectangle"
            gradientFrom="#8b5cf6" gradientTo="#6d28d9" borderColor="rgba(196,181,253,0.3)" />
          <QuickNavButton label="Training" href="/training" icon="chart.line.uptrend.xyaxis"
            gradientFrom="#f59e0b" gradientTo="#c2410c" borderColor="rgba(252,211,77,0.3)" />
        </View>

        {dashQuery.isLoading && (
          <View style={s.center}>
            <ActivityIndicator color={theme.spinner} />
          </View>
        )}

        {dashQuery.isError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{dashQuery.error instanceof Error ? dashQuery.error.message : 'Failed to load dashboard'}</Text>
          </View>
        )}

        <NoticeBoard />

        {activityQuery.data && activityQuery.data.length > 0 && (
          <View style={s.section}>
            <Text style={s.eyebrowTitle}>RECENT ACTIVITY</Text>
            <View style={s.sectionBody}>
              {activityQuery.data.slice(0, 10).map((a, i) => <ActivityRow key={i} a={a} s={s} />)}
            </View>
          </View>
        )}

        <DailyHighlights />
        <SongOfWeekStrip />
        <WeeklyChallengesSummary />

        {dashQuery.data && (
          <>
            <Section
              s={s}
              title="Tournaments"
              count={dashQuery.data.tournaments.length}
              empty="No active tournaments"
              isEmpty={dashQuery.data.tournaments.length === 0}>
              {dashQuery.data.tournaments.slice(0, 10).map((t) => (
                <TournamentRow
                  key={t.id}
                  t={t}
                  s={s}
                  onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: t.id } })}
                />
              ))}
            </Section>
            <Section
              s={s}
              title="Recent duels"
              count={dashQuery.data.duels.length}
              empty="No recent duels"
              isEmpty={dashQuery.data.duels.length === 0}>
              {dashQuery.data.duels.slice(0, 10).map((d) => <DuelRow key={d.id} d={d} s={s} />)}
            </Section>
            <Section
              s={s}
              title="Notices"
              count={dashQuery.data.notices.length}
              empty="No notices"
              isEmpty={dashQuery.data.notices.length === 0}>
              {dashQuery.data.notices.slice(0, 10).map((n) => <NoticeRow key={String(n.id)} n={n} s={s} />)}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 80, gap: 24 },
  brandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 0, paddingHorizontal: 4 },
  brandCenter: { flex: 1, alignItems: 'center' as const },
  brandSpacer: { width: 32 },
  quickNav: { flexDirection: 'row' as const, gap: 8 },
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
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  rowPressed: { backgroundColor: t.accentTint },
  rowMain: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' as const, color: t.text },
  rowMeta: { fontSize: 12, color: t.textMuted },
  rowBadge: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: t.accentTint,
    color: t.accent,
    fontWeight: '700' as const,
  },
  empty: {
    padding: 16,
    fontSize: 13,
    color: t.textDim,
    textAlign: 'center' as const,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
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
});

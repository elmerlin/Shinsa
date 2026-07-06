import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
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
import { LinearGradient } from 'expo-linear-gradient';
import { DefaultAvatar } from '@/components/default-avatar';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { weeklyChallengesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type {
  WeeklyChallengePlayerStat,
  WeeklyChallengeTopPlay,
} from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

const MEDAL_COLOR = ['#fbbf24', '#e5e7eb', '#fb923c'];

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function modeShort(mode: string): string {
  return mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : 'C';
}
function modeBadge(mode: string): readonly [string, string, string] {
  if (mode === 'Single') return ['#ff7a7a', '#d93d62', '#7a1730'];
  if (mode === 'Double') return ['#4cf4aa', '#16b77f', '#0b5d48'];
  return ['#69c8ff', '#2b88de', '#12457c'];
}
function gradeColor(grade?: string): string {
  if (!grade) return '#71717a';
  if (grade.includes('SSS')) return '#7dd3fc';
  if (grade.includes('SS')) return '#FFC400';
  if (grade.includes('S')) return '#fbbf24';
  if (grade.includes('AAA')) return '#c0c0c0';
  return '#a1a1aa';
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function Avatar({ avatar, username, size, s }: { avatar?: string; username?: string; size: number; s: Styles }) {
  const uri = avatar ? fullImageUrl(avatar) : undefined;
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }
  return <DefaultAvatar size={size} />;
}

export default function WeeklyChallengesSummaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const query = useQuery({
    queryKey: ['wc-summary'],
    queryFn: () => weeklyChallengesApi.summary(),
  });
  const data = query.data;
  const totals = data?.totals;
  const empty = data && (data.totals?.chartsCleared ?? 0) === 0;

  const goProfile = (username?: string) => {
    if (!username) return;
    router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });
  };

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: 'Hall of Fame', headerBackTitle: 'Weekly' }} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={theme.spinner} />}>
        {query.isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        ) : query.isError ? (
          <View style={s.errorBox}><Text style={s.errorText}>Couldn’t load the summary. Pull to retry.</Text></View>
        ) : data ? (
          <>
            <View style={s.intro}>
              <Text style={s.introTitle}>🏆 All-Time Records</Text>
              <Text style={s.introSub}>Across every finalized weekly challenge</Text>
            </View>

            {/* Totals banner */}
            {totals ? (
              <View style={s.totalsGrid}>
                <TotalTile value={totals.weeks} label="Weeks" s={s} />
                <TotalTile value={totals.players} label="Players" s={s} />
                <TotalTile value={totals.chartsCleared} label="Cleared" s={s} />
                <TotalTile value={totals.ratingPoints} label="Points" s={s} />
                <TotalTile value={totals.perfects} label="Perfects" s={s} />
                <TotalTile value={totals.sssPlus} label="SSS+" s={s} />
              </View>
            ) : null}

            {empty ? (
              <View style={s.emptyBlock}>
                <Text style={s.emptyTitle}>No finalized weeks yet</Text>
                <Text style={s.emptyBody}>Records appear once the first weekly challenge closes.</Text>
              </View>
            ) : (
              <>
                {/* Top plays */}
                <SectionHeader title="TOP PLAYS" hint="by rating points" s={s} />
                <View style={s.topPlayList}>
                  {(data.topPlays ?? []).slice(0, 12).map((play, i) => (
                    <TopPlayRow key={`${play.user_id}-${i}`} rank={i + 1} play={play} onProfile={goProfile} s={s} />
                  ))}
                </View>

                {/* Champions */}
                <SectionHeader title="CHAMPIONS" hint="most weekly wins" s={s} />
                <View style={s.champCard}>
                  <WinsColumn label="Overall" color="#fbbf24" rows={data.wins?.overall ?? []} onProfile={goProfile} s={s} />
                  <WinsColumn label="Singles" color="#fb7185" rows={data.wins?.singles ?? []} onProfile={goProfile} s={s} />
                  <WinsColumn label="Doubles" color="#34d399" rows={data.wins?.doubles ?? []} onProfile={goProfile} s={s} />
                </View>

                {/* Leaderboards */}
                <SectionHeader title="LEADERBOARDS" hint="all-time totals" s={s} />
                <StatCard
                  icon="⚡" title="All-Time Points" hint="total rating"
                  rows={data.mostRatingPoints ?? []} onProfile={goProfile} s={s}
                  valueOf={(r) => fmtNum(r.value)} subOf={(r) => `${fmtNum(r.charts)} charts`}
                />
                <StatCard
                  icon="🎖️" title="Most Podiums" hint="top-3 finishes"
                  rows={data.mostPodiums ?? []} onProfile={goProfile} s={s}
                  valueOf={(r) => fmtNum(r.value)}
                />
                <StatCard
                  icon="✅" title="Songs Cleared" hint="charts passed"
                  rows={data.mostSongsCleared ?? []} onProfile={goProfile} s={s}
                  valueOf={(r) => fmtNum(r.value)} subOf={(r) => `${fmtNum(r.sss_plus)} SSS+`}
                />
                <StatCard
                  icon="💎" title="Most SSS+" hint="top-grade clears"
                  rows={data.mostSSS ?? []} onProfile={goProfile} s={s}
                  valueOf={(r) => fmtNum(r.value)} subOf={(r) => `+${fmtNum(r.sss)} SSS`}
                />
                <StatCard
                  icon="🎯" title="Most Perfects" hint="total PG judgments"
                  rows={data.mostPerfects ?? []} onProfile={goProfile} s={s}
                  valueOf={(r) => fmtNum(r.value)} subOf={(r) => `${fmtNum(r.charts)} charts`}
                />
                <StatCard
                  icon="🏵️" title="Perfect Games" hint="flawless PG plates"
                  rows={data.mostPerfectGames ?? []} onProfile={goProfile} s={s}
                  valueOf={(r) => fmtNum(r.value)}
                />
                <StatCard
                  icon="📅" title="Most Weeks Entered" hint="loyalty"
                  rows={data.mostChallenges ?? []} onProfile={goProfile} s={s}
                  valueOf={(r) => `${fmtNum(r.value)} wk`} subOf={(r) => `${fmtNum(r.points)} pts`}
                />
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SectionHeader({ title, hint, s }: { title: string; hint?: string; s: Styles }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {hint ? <Text style={s.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function TotalTile({ value, label, s }: { value: number; label: string; s: Styles }) {
  return (
    <View style={s.totalTile}>
      <Text style={s.totalValue}>{fmtNum(value)}</Text>
      <Text style={s.totalLabel}>{label}</Text>
    </View>
  );
}

function PlayerRow({
  rank, row, value, sub, onProfile, s,
}: {
  rank: number; row: WeeklyChallengePlayerStat; value: string; sub?: string;
  onProfile: (u?: string) => void; s: Styles;
}) {
  return (
    <Pressable onPress={() => onProfile(row.username)} style={({ pressed }) => [s.playerRow, pressed && { opacity: 0.7 }]}>
      <Text style={[s.playerRank, rank <= 3 && { color: MEDAL_COLOR[rank - 1] }]}>{rank}</Text>
      <Avatar avatar={row.avatar} username={row.username} size={26} s={s} />
      <Text style={s.playerName} numberOfLines={1}>{row.username}</Text>
      <View style={s.playerValueWrap}>
        <Text style={s.playerValue}>{value}</Text>
        {sub ? <Text style={s.playerSub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

function StatCard({
  icon, title, hint, rows, valueOf, subOf, onProfile, s,
}: {
  icon: string; title: string; hint?: string; rows: WeeklyChallengePlayerStat[];
  valueOf: (r: WeeklyChallengePlayerStat) => string;
  subOf?: (r: WeeklyChallengePlayerStat) => string;
  onProfile: (u?: string) => void; s: Styles;
}) {
  return (
    <View style={s.statCard}>
      <View style={s.statCardHeader}>
        <Text style={s.statCardTitle}>{icon}  {title}</Text>
        {hint ? <Text style={s.statCardHint}>{hint}</Text> : null}
      </View>
      {rows.length === 0 ? (
        <Text style={s.statEmpty}>No data yet</Text>
      ) : (
        rows.slice(0, 10).map((row, i) => (
          <PlayerRow
            key={`${row.user_id}-${i}`}
            rank={i + 1}
            row={row}
            value={valueOf(row)}
            sub={subOf ? subOf(row) : undefined}
            onProfile={onProfile}
            s={s}
          />
        ))
      )}
    </View>
  );
}

function WinsColumn({
  label, color, rows, onProfile, s,
}: {
  label: string; color: string; rows: WeeklyChallengePlayerStat[];
  onProfile: (u?: string) => void; s: Styles;
}) {
  return (
    <View style={s.winsCol}>
      <Text style={[s.winsLabel, { color }]}>{label}</Text>
      {rows.length === 0 ? (
        <Text style={s.winsEmpty}>—</Text>
      ) : (
        rows.slice(0, 3).map((row, i) => (
          <Pressable key={row.user_id} onPress={() => onProfile(row.username)} style={({ pressed }) => [s.winsRow, pressed && { opacity: 0.7 }]}>
            <Text style={[s.winsRank, i <= 2 && { color: MEDAL_COLOR[i] }]}>{i + 1}</Text>
            <Avatar avatar={row.avatar} username={row.username} size={18} s={s} />
            <Text style={s.winsName} numberOfLines={1}>{row.username}</Text>
            <Text style={s.winsValue}>{row.value}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function TopPlayRow({
  rank, play, onProfile, s,
}: {
  rank: number; play: WeeklyChallengeTopPlay; onProfile: (u?: string) => void; s: Styles;
}) {
  const jacket = play.jacket_url ? fullImageUrl(play.jacket_url) : undefined;
  return (
    <View style={[s.topPlayRow, rank <= 3 && s.topPlayRowHero]}>
      <Text style={[s.topPlayRank, rank <= 3 && { color: MEDAL_COLOR[rank - 1] }]}>{rank}</Text>
      <View style={s.topPlayJacket}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.topPlayJacketImg} contentFit="cover" />
        ) : (
          <View style={[s.topPlayJacketImg, { backgroundColor: '#1c2030' }]} />
        )}
        <LinearGradient colors={modeBadge(play.mode)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.topPlayModeBadge}>
          <Text style={s.topPlayModeText}>{modeShort(play.mode)}{play.level}</Text>
        </LinearGradient>
      </View>
      <View style={s.topPlayMid}>
        <Text style={s.topPlaySong} numberOfLines={1}>{play.song_title}</Text>
        <Pressable onPress={() => onProfile(play.username)} style={s.topPlayUser}>
          <Avatar avatar={play.avatar} username={play.username} size={16} s={s} />
          <Text style={s.topPlayUserName} numberOfLines={1}>{play.username}</Text>
          <Text style={s.topPlayWeek}>· {play.week_key}</Text>
        </Pressable>
      </View>
      <View style={s.topPlayRight}>
        <Text style={[s.topPlayScore, { color: gradeColor(play.grade) }]}>{fmtNum(play.score)}</Text>
        <Text style={s.topPlayPts}>{fmtNum(play.rating_points)} pts</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { paddingHorizontal: 12, paddingTop: 12, gap: 4 },
  center: { padding: 40, alignItems: 'center' as const },
  errorBox: { padding: 16, borderRadius: 8, backgroundColor: t.dangerBg, borderWidth: 1, borderColor: t.dangerBorder, margin: 8 },
  errorText: { color: t.danger, fontSize: 14 },

  intro: { paddingHorizontal: 4, paddingBottom: 8 },
  introTitle: { fontSize: 20, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  introSub: { fontSize: 12, color: t.textMuted, marginTop: 2 },

  totalsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginBottom: 10 },
  totalTile: {
    flexBasis: '31.5%' as const, flexGrow: 1, alignItems: 'center' as const, gap: 3,
    backgroundColor: t.card, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    paddingVertical: 10,
  },
  totalValue: { fontSize: 17, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  totalLabel: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 1, color: t.textDim, textTransform: 'uppercase' as const },

  sectionHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8, paddingHorizontal: 4, marginTop: 14, marginBottom: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  sectionHint: { fontSize: 10, color: t.textDim, opacity: 0.7 },

  // Top plays
  topPlayList: { gap: 6 },
  topPlayRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    backgroundColor: t.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    padding: 8,
  },
  topPlayRowHero: { borderColor: 'rgba(250,204,21,0.22)' },
  topPlayRank: { width: 20, textAlign: 'center' as const, fontSize: 15, fontWeight: '900' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  topPlayJacket: { width: 42, height: 42, borderRadius: 8, overflow: 'hidden' as const, position: 'relative' as const },
  topPlayJacketImg: { width: 42, height: 42 },
  topPlayModeBadge: { position: 'absolute' as const, bottom: 0, right: 0, borderTopLeftRadius: 6, paddingHorizontal: 3, paddingVertical: 1 },
  topPlayModeText: { fontSize: 8, fontWeight: '900' as const, color: '#fff' },
  topPlayMid: { flex: 1, minWidth: 0, gap: 2 },
  topPlaySong: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  topPlayUser: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  topPlayUserName: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted, flexShrink: 1 },
  topPlayWeek: { fontSize: 10, color: t.textDim },
  topPlayRight: { alignItems: 'flex-end' as const },
  topPlayScore: { fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  topPlayPts: { fontSize: 11, fontWeight: '900' as const, color: '#fbbf24', fontVariant: ['tabular-nums' as const] },

  // Champions
  champCard: {
    flexDirection: 'row' as const, gap: 10,
    backgroundColor: t.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: 12,
  },
  winsCol: { flex: 1, gap: 4 },
  winsLabel: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 2 },
  winsEmpty: { fontSize: 12, color: t.textDim },
  winsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  winsRank: { width: 12, textAlign: 'center' as const, fontSize: 10, fontWeight: '900' as const, color: t.textDim, fontVariant: ['tabular-nums' as const] },
  winsName: { flex: 1, fontSize: 11, fontWeight: '700' as const, color: t.text },
  winsValue: { fontSize: 11, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },

  // Stat cards
  statCard: {
    backgroundColor: t.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    padding: 10, marginBottom: 8,
  },
  statCardHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, marginBottom: 4 },
  statCardTitle: { fontSize: 13, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  statCardHint: { fontSize: 10, color: t.textDim },
  statEmpty: { fontSize: 12, color: t.textDim, paddingVertical: 8, textAlign: 'center' as const },

  playerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, paddingVertical: 5, paddingHorizontal: 2 },
  playerRank: { width: 18, textAlign: 'center' as const, fontSize: 12, fontWeight: '900' as const, color: t.textDim, fontVariant: ['tabular-nums' as const] },
  playerName: { flex: 1, fontSize: 13, fontWeight: '700' as const, color: t.text },
  playerValueWrap: { alignItems: 'flex-end' as const },
  playerValue: { fontSize: 13, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  playerSub: { fontSize: 10, color: t.textDim },

  emptyBlock: {
    backgroundColor: t.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    padding: 20, alignItems: 'center' as const, gap: 6, marginTop: 10,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  emptyBody: { fontSize: 12, color: t.textMuted, textAlign: 'center' as const },
});

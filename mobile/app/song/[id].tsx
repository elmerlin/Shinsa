import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GradeChip } from '@/components/grade-chip';
import { PlateBadge } from '@/components/plate-badge';
import { ReplayModal } from '@/components/replay-modal';
import { SaveToListSheet } from '@/components/save-to-list-sheet';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { getGradeDisplayLabel, getGradeTier, TIER_COLORS } from '@/lib/grades';
import { fullImageUrl } from '@/lib/images';
import { getPlateName } from '@/lib/plates';
import type { ThemeColors } from '@/constants/theme';
import type { AddListItemPayload, Chart, ChartBest, ChartFriendRecord, ChartHistoryEntry } from '@shared/api';

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const MODE_GRADIENTS: Record<string, readonly [string, string]> = {
  Single: ['#ff7a7a', '#d93d62'],
  Double: ['#4cf4aa', '#16b77f'],
  CoOp: ['#69c8ff', '#2b88de'],
  UCS: ['#cdb4ff', '#7c3aed'],
};

function formatDate(input?: string): string {
  if (!input) return '';
  const cleaned = input.trim();
  const hasTz = /(?:z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  const normalized = cleaned.includes('T') ? cleaned : cleaned.replace(' ', 'T');
  const candidate = hasTz || /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const d = new Date(candidate);
  if (Number.isNaN(d.getTime())) return cleaned.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(seconds?: number): string | null {
  if (typeof seconds !== 'number' || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function fmtNum(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function HeaderCard({ chart, s }: { chart: Chart; s: Styles }) {
  const jacket = fullImageUrl(chart.jacket_url);
  const mode = String(chart.mode || '');
  const level = chart.level ?? 0;
  const gradient = MODE_GRADIENTS[mode] || MODE_GRADIENTS.CoOp;
  const duration = formatDuration(chart.duration_seconds);

  return (
    <View style={s.headerCard}>
      {jacket ? (
        <Image source={{ uri: jacket }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.headerFallback]} />
      )}
      <LinearGradient
        colors={['rgba(6,10,18,0.18)', 'rgba(6,10,18,0.65)', 'rgba(6,10,18,0.92)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={s.headerInner}>
        <View style={s.headerRow}>
          <View style={s.headerTextCol}>
            <Text style={s.headerTitle} numberOfLines={2}>{chart.title}</Text>
            {chart.artist ? <Text style={s.headerArtist} numberOfLines={1}>{chart.artist}</Text> : null}
            <View style={s.headerMetaRow}>
              {chart.bpm ? <Text style={s.headerMetaChip}>{chart.bpm} BPM</Text> : null}
              {duration ? <Text style={s.headerMetaChip}>{duration}</Text> : null}
            </View>
          </View>
          {level > 0 ? (
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.levelBadge}>
              <Text style={s.levelText}>{level}</Text>
            </LinearGradient>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function PersonalBest({ best, replayUrl, s, onScorePress, onReplayPress }: {
  best: ChartBest;
  replayUrl?: string;
  s: Styles;
  onScorePress: () => void;
  onReplayPress: () => void;
}) {
  const { theme } = useTheme();
  const score = Number(best.score) || 0;
  const grade = getGradeDisplayLabel(best.grade, score);
  const gradeColor = TIER_COLORS[getGradeTier(best.grade, score)];
  const isStageBreak = !!best.is_stage_break;
  const plateName = getPlateName(best.plate);
  const rating = Number(best.rating) || 0;

  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>YOUR BEST</Text>
      <Pressable
        onPress={onScorePress}
        style={({ pressed }) => [s.bestCard, pressed && { opacity: 0.85 }]}>
        <View style={s.bestTop}>
          <View style={s.bestScoreCol}>
            <Text style={[s.bestScore, isStageBreak && { color: theme.danger }]}>
              {isStageBreak ? 'STAGE BREAK' : fmtNum(score)}
            </Text>
            {plateName ? (
              <View style={s.bestPlateRow}>
                <PlateBadge plate={best.plate} size="sm" />
                <Text style={s.bestPlateName}>{plateName}</Text>
              </View>
            ) : null}
          </View>
          {!isStageBreak ? (
            <Text style={[s.bestGrade, { color: gradeColor }]}>{grade}</Text>
          ) : null}
        </View>
        <View style={s.bestMeta}>
          {rating > 0 ? (
            <View style={s.bestMetaItem}>
              <Text style={s.bestMetaLabel}>RATING</Text>
              <Text style={s.bestMetaValue}>{fmtNum(rating)}</Text>
            </View>
          ) : null}
          {best.date_played ? (
            <View style={s.bestMetaItem}>
              <Text style={s.bestMetaLabel}>PLAYED</Text>
              <Text style={s.bestMetaValue}>{formatDate(best.date_played)}</Text>
            </View>
          ) : null}
          {replayUrl ? (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onReplayPress(); }}
              style={({ pressed }) => [s.replayBtn, pressed && { opacity: 0.7 }]}>
              <IconSymbol name="play.rectangle.fill" size={14} color="#7dd3fc" />
              <Text style={s.replayBtnText}>REPLAY</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function HistoryRow({ row, s, onPress }: { row: ChartHistoryEntry; s: Styles; onPress: () => void }) {
  const score = Number(row.score) || 0;
  const grade = getGradeDisplayLabel(row.grade, score);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.historyRow, pressed && { opacity: 0.7 }]}>
      <View style={s.historyMain}>
        <View style={s.historyScoreLine}>
          <Text style={[s.historyScore, row.is_stage_break && s.historyScoreBreak]}>
            {row.is_stage_break ? 'STAGE BREAK' : fmtNum(score)}
          </Text>
          <GradeChip grade={grade} score={score} size="sm" />
          {row.plate ? <PlateBadge plate={row.plate} size="xs" /> : null}
        </View>
        <Text style={s.historyDate}>{formatDate(row.date_played) || '—'}</Text>
      </View>
      {Number(row.rating) > 0 ? (
        <Text style={s.historyRating}>{fmtNum(Number(row.rating))} pts</Text>
      ) : null}
    </Pressable>
  );
}

function FriendRecordRow({ rec, chart, s, onPress, onReplayPress, onProfilePress }: {
  rec: ChartFriendRecord;
  chart: Chart;
  s: Styles;
  onPress: () => void;
  onReplayPress: (url: string, title: string) => void;
  onProfilePress: (username: string) => void;
}) {
  const avatar = typeof rec.user.avatar === 'string' ? fullImageUrl(rec.user.avatar) : undefined;
  const score = Number(rec.best.score) || 0;
  const grade = getGradeDisplayLabel(rec.best.grade, score);
  const replay = rec.highest_replay?.url;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.friendRow, pressed && { opacity: 0.7 }]}>
      <Pressable onPress={(e) => { e.stopPropagation(); onProfilePress(rec.user.username); }} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.friendAvatar} contentFit="cover" />
        ) : (
          <View style={[s.friendAvatar, s.friendAvatarFallback]}>
            <Text style={s.friendAvatarLetter}>{rec.user.username.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </Pressable>
      <View style={s.friendMain}>
        <Pressable onPress={(e) => { e.stopPropagation(); onProfilePress(rec.user.username); }} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
          <Text style={s.friendName} numberOfLines={1}>{rec.user.username}</Text>
        </Pressable>
        <View style={s.friendScoreLine}>
          <Text style={[s.friendScore, rec.best.is_stage_break && s.historyScoreBreak]}>
            {rec.best.is_stage_break ? 'BREAK' : fmtNum(score)}
          </Text>
          <GradeChip grade={grade} score={score} size="xs" />
          {rec.best.plate ? <PlateBadge plate={rec.best.plate} size="xs" /> : null}
        </View>
      </View>
      {replay ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onReplayPress(replay, `${chart.title} · ${chart.mode || ''}${chart.level ? ` ${chart.level}` : ''} · ${rec.user.username}`);
          }}
          hitSlop={6}
          style={({ pressed }) => [s.friendReplayBtn, pressed && { opacity: 0.7 }]}>
          <IconSymbol name="play.rectangle.fill" size={14} color="#7dd3fc" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export default function ChartDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const chartId = Number(id);
  const { theme } = useTheme();
  const { user } = useAuth();
  const { isDesktop } = useBreakpoint();
  const s = useThemedStyles(makeStyles);
  const [scoreTarget, setScoreTarget] = useState<ScoreCardData | null>(null);
  const [replayTarget, setReplayTarget] = useState<{ url: string; title: string } | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [saveListOpen, setSaveListOpen] = useState(false);
  const onReplay = (url: string, title: string) => setReplayTarget({ url, title });
  const onProfile = (username: string) =>
    router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['chart', chartId, user?.id ?? null],
    queryFn: () => songsApi.chartDetail(chartId, user?.id ? { user_id: user.id, follow_from_user_id: user.id } : {}),
    enabled: Number.isFinite(chartId),
  });

  const chart = data?.chart;
  const userSummary = data?.user_summary;
  const best = userSummary?.best;
  const highestReplay = userSummary?.highest_replay;
  const userYoutubeUrl = data?.user_youtube_url || '';
  const replayUrl = userYoutubeUrl || highestReplay?.url || '';
  const history = data?.history ?? [];
  const friendRecords = data?.friend_records ?? [];
  const sortedHistory = [...history].sort((a, b) => {
    const at = Date.parse(a.date_played || '') || 0;
    const bt = Date.parse(b.date_played || '') || 0;
    return bt - at;
  });
  const visibleHistory = showAllHistory ? sortedHistory : sortedHistory.slice(0, 5);
  const hasMoreHistory = sortedHistory.length > 5;

  const buildScoreData = (entry: ChartHistoryEntry | ChartBest): ScoreCardData => ({
    song_title: chart?.title,
    mode: chart?.mode,
    level: chart?.level,
    chart_id: chartId,
    play_id: typeof entry.id === 'string' || typeof entry.id === 'number' ? entry.id : undefined,
    // Lets the score card resolve this play's HR via the safe field+user
    // lookup (best-scores rows carry no HR and a non-recently-played id).
    user_id: user?.id,
    jacket_url: chart?.jacket_url,
    score: Number(entry.score) || 0,
    grade: typeof entry.grade === 'string' ? entry.grade : undefined,
    plate: entry.plate,
    is_stage_break: !!entry.is_stage_break,
    perfect: Number(entry.perfect) || 0,
    great: Number(entry.great) || 0,
    good: Number(entry.good) || 0,
    bad: Number(entry.bad) || 0,
    miss: Number(entry.miss) || 0,
    max_combo: Number(entry.max_combo) || 0,
    played_at_utc: typeof entry.date_played === 'string' ? entry.date_played : undefined,
    username: userSummary?.user?.username,
    avatar: typeof userSummary?.user?.avatar === 'string' ? userSummary.user.avatar : undefined,
    // HR ships on history entries (source='recent'); best-scores rows
    // don't have it and stay undefined.
    hr_avg: Number((entry as Record<string, unknown>).hr_avg) || undefined,
    hr_peak: Number((entry as Record<string, unknown>).hr_peak) || undefined,
    hr_series: typeof (entry as Record<string, unknown>).hr_series === 'string'
      ? (entry as { hr_series?: string }).hr_series
      : undefined,
    hr_source: typeof (entry as Record<string, unknown>).hr_source === 'string'
      ? (entry as { hr_source?: string }).hr_source
      : undefined,
    hr_duration_s: Number((entry as Record<string, unknown>).hr_duration_s) || undefined,
    hr_max: Number((entry as Record<string, unknown>).hr_max) || undefined,
    song_duration_s: Number(chart?.duration_seconds) || undefined,
  });

  const buildFriendScoreData = (rec: ChartFriendRecord): ScoreCardData => ({
    ...buildScoreData(rec.best),
    // Override the owner so HR resolves for the friend, not the viewer.
    user_id: rec.user.id,
    username: rec.user.username,
    avatar: rec.user.avatar,
  });

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: chart?.title || 'Chart' }} />
      <ScrollView contentContainerStyle={[s.scroll, isDesktop && s.scrollDesktop]}>
        {isLoading && (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        )}

        {isError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error instanceof Error ? error.message : 'Failed to load chart'}</Text>
          </View>
        )}

{(() => {
          if (!chart) return null;
          // Desktop reflows the single mobile column into two: a fixed-width
          // left rail (art + actions + your best + skills) and a wider right
          // column (history + friends). Mobile stacks exactly as before.
          const headerEl = <HeaderCard chart={chart} s={s} />;
          const actionsEl = (user || (chart.level ?? 0) >= 20) ? (
            <View style={s.actionRow}>
              {user ? (
                <Pressable
                  onPress={() => setSaveListOpen(true)}
                  style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.85 }]}
                  accessibilityLabel="Save chart to a list">
                  <IconSymbol name="list.bullet" size={15} color={theme.text} />
                  <Text style={s.actionBtnText}>Save to list</Text>
                </Pressable>
              ) : null}
              {(chart.level ?? 0) >= 20 ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/leaderboards', params: { tab: 'over20', level: String(chart.level || ''), song: String(chart.title || ''), mode: String(chart.mode || '') } })}
                  style={({ pressed }) => [s.actionBtnAccent, pressed && { opacity: 0.85 }]}
                  accessibilityLabel="View Over Top 100">
                  <IconSymbol name="trophy.fill" size={15} color={theme.bg} />
                  <Text style={s.actionBtnAccentText}>OVER Top 100</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null;
          const bestEl = best ? (
            <PersonalBest
              best={best}
              replayUrl={replayUrl}
              s={s}
              onScorePress={() => setScoreTarget(buildScoreData(best))}
              onReplayPress={() => onReplay(replayUrl, `${chart.title} · ${chart.mode || ''}${chart.level ? ` ${chart.level}` : ''}`)}
            />
          ) : userSummary ? (
            <View style={s.section}>
              <Text style={s.eyebrow}>YOUR BEST</Text>
              <View style={s.emptyCard}><Text style={s.emptyText}>No clears yet</Text></View>
            </View>
          ) : null;
          const historyEl = sortedHistory.length > 0 ? (
            <View style={s.section}>
              <View style={s.sectionHeaderRow}><Text style={s.eyebrow}>HISTORY</Text><Text style={s.sectionCount}>{sortedHistory.length}</Text></View>
              <View style={s.listCard}>
                {visibleHistory.map((row) => (
                  <HistoryRow key={String(row.id)} row={row} s={s} onPress={() => setScoreTarget(buildScoreData(row))} />
                ))}
                {hasMoreHistory ? (
                  <Pressable onPress={() => setShowAllHistory((v) => !v)} style={({ pressed }) => [s.showMoreBtn, pressed && { opacity: 0.7 }]}>
                    <Text style={s.showMoreText}>{showAllHistory ? 'Show less' : `Show ${sortedHistory.length - 5} more`}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null;
          const friendsEl = friendRecords.length > 0 ? (
            <View style={s.section}>
              <View style={s.sectionHeaderRow}><Text style={s.eyebrow}>FRIENDS</Text><Text style={s.sectionCount}>{friendRecords.length}</Text></View>
              <View style={s.listCard}>
                {friendRecords.map((rec) => (
                  <FriendRecordRow key={rec.user.id} rec={rec} chart={chart} s={s} onPress={() => setScoreTarget(buildFriendScoreData(rec))} onReplayPress={onReplay} onProfilePress={onProfile} />
                ))}
              </View>
            </View>
          ) : null;
          const skillsEl = (chart.skills && chart.skills.length > 0) ? (
            <View style={s.section}>
              <View style={s.sectionHeaderRow}><Text style={s.eyebrow}>SKILLS</Text><Text style={s.sectionCount}>{chart.skills.length}</Text></View>
              <View style={s.skillsRow}>
                {chart.skills.map((sk) => (
                  <Pressable key={sk.slug} onPress={() => router.push({ pathname: '/skill/[slug]', params: { slug: sk.slug } })} style={({ pressed }) => [s.skillChip, pressed && { opacity: 0.7 }]}>
                    <Text style={s.skillChipText}>{sk.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null;
          const hasRightColumn = sortedHistory.length > 0 || friendRecords.length > 0;
          if (isDesktop && hasRightColumn) {
            return (
              <View style={s.deskRow}>
                <View style={s.deskLeft}>{headerEl}{actionsEl}{bestEl}{skillsEl}</View>
                <View style={s.deskRight}>{historyEl}{friendsEl}</View>
              </View>
            );
          }
          if (isDesktop) {
            // No history/friends yet — keep a single readable column instead of
            // a lopsided two-column with an empty right side.
            return <View style={s.deskSingle}>{headerEl}{actionsEl}{bestEl}{skillsEl}</View>;
          }
          return <>{headerEl}{actionsEl}{bestEl}{historyEl}{friendsEl}{skillsEl}</>;
        })()}
      </ScrollView>

      <ScoreCardSheet
        visible={!!scoreTarget}
        data={scoreTarget}
        onClose={() => setScoreTarget(null)}
        onReplay={onReplay}
      />

      <ReplayModal
        visible={!!replayTarget}
        url={replayTarget?.url}
        title={replayTarget?.title}
        onClose={() => setReplayTarget(null)}
      />

      <SaveToListSheet
        visible={saveListOpen}
        onClose={() => setSaveListOpen(false)}
        item={chart ? {
          chartId,
          songTitle: chart.title || '',
          artist: chart.artist || '',
          mode: chart.mode || '',
          level: chart.level || 0,
          jacketUrl: chart.jacket_url || '',
          originalScore: best?.score || 0,
          originalGrade: best?.grade || '',
          hadPass: !!best && Number(best.score || 0) > 0,
          target: 'PASS',
          addedAt: Date.now(),
        } satisfies AddListItemPayload : null}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 16, paddingBottom: 60, gap: 18 },
  // Desktop: center the content and split into a fixed left rail + wider
  // right column instead of a full-bleed stretched mobile column.
  scrollDesktop: { maxWidth: 1080, alignSelf: 'center' as const, width: '100%' as const, paddingHorizontal: 24, paddingTop: 24 },
  deskRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 20, width: '100%' as const },
  deskLeft: { width: 380, gap: 18 },
  deskRight: { flex: 1, minWidth: 0, gap: 18 },
  deskSingle: { maxWidth: 600, width: '100%' as const, alignSelf: 'center' as const, gap: 18 },
  center: { padding: 32, alignItems: 'center' as const },

  // Action button row (Save to list / OVER Top 100). Single button keeps full
  // width; two buttons split evenly.
  actionRow: { flexDirection: 'row' as const, gap: 8, marginTop: -8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' as const, color: t.text, letterSpacing: 0.3 },
  actionBtnAccent: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: t.accent,
  },
  actionBtnAccentText: { fontSize: 13, fontWeight: '900' as const, color: t.bg, letterSpacing: 0.3 },

  headerCard: {
    borderRadius: 16,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    minHeight: 220,
    backgroundColor: '#0a0e18',
  },
  headerFallback: { backgroundColor: '#0f1a2d' },
  headerInner: { padding: 14, justifyContent: 'flex-end' as const, minHeight: 220 },
  headerRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 12 },
  headerTextCol: { flex: 1, gap: 4, minWidth: 0 },
  headerTitle: { fontSize: 22, fontWeight: '900' as const, color: '#fff', lineHeight: 26, letterSpacing: 0.2 },
  headerArtist: { fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  headerMetaRow: { flexDirection: 'row' as const, gap: 6, marginTop: 4, flexWrap: 'wrap' as const },
  headerMetaChip: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden' as const,
  },
  levelBadge: {
    minWidth: 52,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  levelText: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: '#fff',
    fontVariant: ['tabular-nums' as const],
  },

  section: { gap: 8 },
  sectionHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  sectionCount: { fontSize: 11, color: t.textDim },

  bestCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 12,
  },
  bestTop: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, gap: 12 },
  bestScoreCol: { flex: 1, gap: 6, minWidth: 0 },
  bestScore: {
    fontSize: 30,
    fontWeight: '900' as const,
    color: t.text,
    fontVariant: ['tabular-nums' as const],
    letterSpacing: 0.5,
  },
  bestPlateRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  bestPlateName: { fontSize: 10, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 1 },
  bestGrade: { fontSize: 32, fontWeight: '900' as const, letterSpacing: 0.5 },
  bestMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    flexWrap: 'wrap' as const,
  },
  bestMetaItem: { gap: 2 },
  bestMetaLabel: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 1, color: t.textDim },
  bestMetaValue: { fontSize: 12, fontWeight: '700' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  replayBtn: {
    marginLeft: 'auto' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(125,211,252,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125,211,252,0.4)',
  },
  replayBtnText: { fontSize: 10, fontWeight: '900' as const, color: '#7dd3fc', letterSpacing: 0.6 },

  emptyCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 20,
    alignItems: 'center' as const,
  },
  emptyText: { fontSize: 12, color: t.textDim },

  listCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  historyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  historyMain: { flex: 1, gap: 4, minWidth: 0 },
  historyScoreLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  historyScore: { fontSize: 14, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  historyScoreBreak: { color: t.danger, fontSize: 11 },
  historyDate: { fontSize: 11, color: t.textDim },
  historyRating: { fontSize: 11, fontWeight: '700' as const, color: t.accent, fontVariant: ['tabular-nums' as const] },

  showMoreBtn: { paddingVertical: 10, alignItems: 'center' as const },
  showMoreText: { fontSize: 12, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.5 },

  friendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 10,
  },
  friendAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceMuted },
  friendAvatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  friendAvatarLetter: { fontSize: 13, fontWeight: '800' as const, color: t.textMuted },
  friendMain: { flex: 1, gap: 2, minWidth: 0 },
  friendName: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  friendScoreLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  friendScore: { fontSize: 13, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  friendReplayBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(125,211,252,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125,211,252,0.4)',
  },

  skillsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  skillChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  skillChipText: { fontSize: 11, color: t.skill, fontWeight: '700' as const },

  errorBox: {
    backgroundColor: t.dangerBg,
    borderColor: t.dangerBorder,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: t.danger, fontSize: 14 },
});

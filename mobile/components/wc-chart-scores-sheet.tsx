import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { GradeChip } from '@/components/grade-chip';
import { PlateBadge } from '@/components/plate-badge';
import { ReplayModal } from '@/components/replay-modal';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { weeklyChallengesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { WeeklyChallengeChartScore } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

const MEDAL = ['', '🥇', '🥈', '🥉'];

interface Props {
  /** WC chart row id (the `chart.id` field on a `WeeklyChallengeChart`). Pass `null` to close. */
  chartId: number | null;
  onClose: () => void;
}

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function modeShort(mode: string): string {
  return mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : 'C';
}

function modeBadgeColors(mode: string): readonly [string, string, string] {
  if (mode === 'Single') return ['#ff7a7a', '#d93d62', '#7a1730'];
  if (mode === 'Double') return ['#4cf4aa', '#16b77f', '#0b5d48'];
  return ['#69c8ff', '#2b88de', '#12457c'];
}

function modeHeroGradient(mode: string): readonly [string, string, string] {
  if (mode === 'Single') return ['rgba(217, 61, 98, 0)', 'rgba(217, 61, 98, 0.15)', 'rgba(122, 23, 48, 0.95)'];
  if (mode === 'Double') return ['rgba(22, 183, 127, 0)', 'rgba(22, 183, 127, 0.15)', 'rgba(11, 93, 72, 0.95)'];
  return ['rgba(43, 136, 222, 0)', 'rgba(43, 136, 222, 0.15)', 'rgba(18, 69, 124, 0.95)'];
}

function gradeColorHex(grade?: string): string {
  if (!grade) return '#71717a';
  if (grade.includes('SSS')) return '#7dd3fc';
  if (grade.includes('SS')) return '#FFC400';
  if (grade.includes('S')) return '#fbbf24';
  if (grade.includes('AAA')) return '#c0c0c0';
  if (grade.includes('AA')) return '#cd7f32';
  return '#a1a1aa';
}

/**
 * Bottom sheet listing every player's best attempt on a single weekly-challenge
 * chart, sorted by score. Pulls from `/api/weekly-challenges/charts/:id/scores`
 * which already returns one row per user (no duplicates) along with rating
 * points + PG bonus + plate metadata for the chip column.
 */
export function ChartScoresSheet({ chartId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [replayTarget, setReplayTarget] = useState<{ url: string; title: string } | null>(null);
  const [scoreTarget, setScoreTarget] = useState<ScoreCardData | null>(null);
  const visible = chartId != null;
  const { isDesktop } = useBreakpoint();

  const query = useQuery({
    queryKey: ['wc-chart-scores', chartId],
    queryFn: () => weeklyChallengesApi.chartScores(chartId as number),
    enabled: visible,
  });

  const data = query.data;
  const chart = data?.chart;
  const jacket = chart?.jacket_url ? fullImageUrl(chart.jacket_url) : undefined;
  const goProfile = (username?: string) => {
    if (!username) return;
    onClose();
    router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });
  };

  return (
    <>
      <Modal visible={visible} animationType={isDesktop ? 'fade' : 'slide'} transparent onRequestClose={onClose}>
        <View style={[s.backdrop, isDesktop && s.backdropDesktop]}>
          <Pressable style={s.backdropFill} onPress={onClose} />
          <View
            style={[
              s.sheet,
              { paddingBottom: isDesktop ? 0 : insets.bottom + 12 },
              isDesktop && s.sheetDesktop,
            ]}>
            {!isDesktop ? <View style={s.handle} /> : null}

            <View style={isDesktop ? s.deskBody : undefined}>
              <View style={isDesktop ? s.deskHeroCol : undefined}>
                {chart ? (
                  <View style={[s.heroWrap, isDesktop && s.heroWrapDesktop]}>
                    {jacket ? (
                      <Image source={{ uri: jacket }} style={s.hero} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                      <View style={[s.hero, s.heroFallback]} />
                    )}
                    <LinearGradient
                      colors={modeHeroGradient(chart.mode)}
                      locations={[0, 0.4, 1]}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    <Pressable
                      onPress={onClose}
                      hitSlop={10}
                      style={({ pressed }) => [s.heroClose, pressed && { opacity: 0.6 }]}>
                      <IconSymbol name="xmark" size={16} color="#fff" />
                    </Pressable>
                    <LinearGradient
                      colors={modeBadgeColors(chart.mode)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.heroModeBadge}>
                      <Text style={s.heroModeBadgeText}>{modeShort(chart.mode)}{chart.level}</Text>
                    </LinearGradient>
                    <View style={s.heroText}>
                      <Text style={s.heroTitle} numberOfLines={2}>{chart.song_title}</Text>
                      {chart.artist ? <Text style={s.heroArtist} numberOfLines={1}>{chart.artist}</Text> : null}
                    </View>
                  </View>
                ) : (
                  <View style={s.heroPlaceholder}>
                    <Text style={s.heroPlaceholderText}>Chart leaderboard</Text>
                    <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.heroPlaceholderClose, pressed && { opacity: 0.6 }]}>
                      <IconSymbol name="xmark" size={16} color={theme.textMuted} />
                    </Pressable>
                  </View>
                )}
                {isDesktop && data ? (
                  <View style={[s.statsBar, s.statsBarDesktop]}>
                    <Text style={s.statsBarText}>
                      <Text style={s.statsBarNum}>{data.scores.length}</Text> player{data.scores.length === 1 ? '' : 's'}
                    </Text>
                    <Text style={s.statsBarDot}>·</Text>
                    <Text style={s.statsBarText}>
                      <Text style={s.statsBarNum}>{data.total_attempts}</Text> attempt{data.total_attempts === 1 ? '' : 's'}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={isDesktop ? s.deskBodyCol : undefined}>
                {!isDesktop && data ? (
                  <View style={s.statsBar}>
                    <Text style={s.statsBarText}>
                      <Text style={s.statsBarNum}>{data.scores.length}</Text> player{data.scores.length === 1 ? '' : 's'}
                    </Text>
                    <Text style={s.statsBarDot}>·</Text>
                    <Text style={s.statsBarText}>
                      <Text style={s.statsBarNum}>{data.total_attempts}</Text> attempt{data.total_attempts === 1 ? '' : 's'}
                    </Text>
                  </View>
                ) : null}

                {query.isLoading ? (
                  <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
                ) : query.isError ? (
                  <Text style={s.errorText}>
                    {query.error instanceof Error ? query.error.message : 'Failed to load scores'}
                  </Text>
                ) : data ? (
                  <ScrollView style={s.list} contentContainerStyle={s.listContent}>
                    {data.scores.length === 0 ? (
                      <Text style={s.emptyText}>No plays yet — be the first.</Text>
                    ) : (
                      data.scores.map((score) => (
                        <ScoreRow
                          key={`${score.rank}-${score.user_id}`}
                          score={score}
                          isMe={user?.id === score.user_id}
                          onProfile={() => goProfile(score.username)}
                          onReplay={(url, title) => setReplayTarget({ url, title })}
                          onOpenCard={() => setScoreTarget({
                            song_title: chart?.song_title,
                            mode: chart?.mode,
                            level: chart?.level,
                            jacket_url: chart?.jacket_url,
                            play_id: score.play_id,
                            score: score.score,
                            grade: score.grade,
                            plate: score.plate ?? undefined,
                            perfect: score.perfect,
                            great: score.great,
                            good: score.good,
                            bad: score.bad,
                            miss: score.miss,
                            max_combo: score.max_combo,
                            played_at_utc: score.played_at_utc,
                            date_played: score.date_played,
                            replay_embed_url: score.replay_embed_url,
                            username: score.username,
                            avatar: score.avatar,
                            hr_avg: score.hr_avg,
                            hr_peak: score.hr_peak,
                            hr_min: score.hr_min,
                            hr_series: score.hr_series,
                            hr_source: score.hr_source,
                            hr_duration_s: score.hr_duration_s,
                            hr_max: score.hr_max,
                          })}
                          chartTitle={chart?.song_title || ''}
                          s={s}
                        />
                      ))
                    )}
                  </ScrollView>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <ReplayModal
        visible={!!replayTarget}
        url={replayTarget?.url}
        title={replayTarget?.title}
        onClose={() => setReplayTarget(null)}
      />

      <ScoreCardSheet
        visible={!!scoreTarget}
        data={scoreTarget}
        onClose={() => setScoreTarget(null)}
        onReplay={(url, title) => setReplayTarget({ url, title })}
      />
    </>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function ScoreRow({
  score,
  isMe,
  onProfile,
  onReplay,
  onOpenCard,
  chartTitle,
  s,
}: {
  score: WeeklyChallengeChartScore;
  isMe: boolean;
  onProfile: () => void;
  onReplay: (url: string, title: string) => void;
  onOpenCard: () => void;
  chartTitle: string;
  s: Styles;
}) {
  const avatar = typeof score.avatar === 'string' ? fullImageUrl(score.avatar) : undefined;
  const medal = score.rank <= 3 ? MEDAL[score.rank] : `#${score.rank}`;
  const medalColor =
    score.rank === 1 ? '#fbbf24'
    : score.rank === 2 ? '#e5e7eb'
    : score.rank === 3 ? '#fb923c'
    : undefined;
  const scoreColor = gradeColorHex(score.grade);
  const replayUrl = score.replay_embed_url || '';

  return (
    <View style={[s.row, isMe && s.rowMe]}>
      <Text style={[s.rank, medalColor && { color: medalColor }]}>{medal}</Text>
      <Pressable onPress={onProfile} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
        ) : (
          <DefaultAvatar size={32} />
        )}
      </Pressable>
      <View style={s.info}>
        <Pressable onPress={onProfile} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
          <Text style={s.username} numberOfLines={1}>
            {score.username || 'anonymous'}{isMe ? <Text style={s.youTag}>  YOU</Text> : null}
          </Text>
        </Pressable>
        <Pressable onPress={onOpenCard} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        <View style={s.statRow}>
          <Text style={[s.score, { color: scoreColor }]}>{fmtNum(score.score)}</Text>
          <GradeChip grade={score.grade} score={score.score} size="sm" />
          {score.plate ? <PlateBadge plate={score.plate} size="sm" /> : null}
          {score.attempt_count > 1 ? (
            <Text style={s.attempts}>{score.attempt_count}×</Text>
          ) : null}
        </View>
        </Pressable>
      </View>
      <View style={s.right}>
        <Text style={s.rp}>{fmtNum(score.rating_points)}<Text style={s.rpUnit}> RP</Text></Text>
        {score.has_pg_bonus && score.pg_bonus_points > 0 ? (
          <Text style={s.pgBonus}>+{fmtNum(score.pg_bonus_points)} PG</Text>
        ) : null}
        {replayUrl ? (
          <Pressable
            onPress={() => onReplay(replayUrl, `${chartTitle} · ${score.username}`)}
            hitSlop={6}
            style={({ pressed }) => [s.replayBtn, pressed && { opacity: 0.6 }]}>
            <IconSymbol name="play.rectangle.fill" size={14} color="#7dd3fc" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    maxHeight: '90%' as const,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginBottom: 8,
  },

  // Hero
  heroWrap: { aspectRatio: 16 / 7, overflow: 'hidden' as const, position: 'relative' as const },
  hero: { width: '100%' as const, height: '100%' as const, backgroundColor: '#000' },
  heroFallback: { backgroundColor: '#1f2937' },
  heroClose: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroModeBadge: {
    position: 'absolute' as const,
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  heroModeBadgeText: { fontSize: 13, fontWeight: '900' as const, color: '#fff', letterSpacing: -0.3 },
  heroText: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: 14 },
  heroTitle: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    letterSpacing: 0.2,
  },
  heroArtist: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  heroPlaceholder: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  heroPlaceholderText: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  heroPlaceholderClose: { padding: 6 },

  statsBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  statsBarText: { fontSize: 11, color: t.textMuted, fontWeight: '600' as const },
  statsBarNum: { color: t.text, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  statsBarDot: { fontSize: 11, color: t.textDim },

  center: { padding: 32, alignItems: 'center' as const },
  errorText: { color: t.danger, fontSize: 13, padding: 16, textAlign: 'center' as const },
  list: { maxHeight: 600 },
  listContent: { gap: 4, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 16 },
  emptyText: { padding: 24, color: t.textMuted, fontSize: 13, textAlign: 'center' as const },

  row: {
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
  rowMe: {
    borderColor: 'rgba(250, 204, 21, 0.5)',
    backgroundColor: 'rgba(250, 204, 21, 0.06)',
  },
  rank: { width: 32, fontSize: 14, fontWeight: '900' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const], textAlign: 'center' as const },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceMuted },
  info: { flex: 1, gap: 4 },
  username: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  youTag: { fontSize: 9, fontWeight: '900' as const, color: '#fbbf24', letterSpacing: 1 },
  statRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  score: { fontSize: 12, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
  attempts: { fontSize: 10, color: t.textDim, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },

  right: { alignItems: 'flex-end' as const, gap: 2, minWidth: 60 },
  rp: { fontSize: 13, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  rpUnit: { fontSize: 9, fontWeight: '700' as const, color: t.textDim, letterSpacing: 0.5 },
  pgBonus: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#fbbf24',
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums' as const],
  },
  replayBtn: {
    width: 28,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(125, 211, 252, 0.12)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 2,
  },

  // Desktop: centered modal instead of bottom sheet. Jacket left,
  // scrollable leaderboard right (capped at ~720 px wide so the table
  // doesn't span the entire viewport).
  backdropDesktop: { justifyContent: 'center' as const, alignItems: 'center' as const },
  sheetDesktop: {
    width: 720,
    maxWidth: '92%' as const,
    maxHeight: '85%' as const,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden' as const,
  },
  deskBody: { flexDirection: 'row' as const, flex: 1, minHeight: 480 },
  deskHeroCol: {
    width: 280,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border,
  },
  deskBodyCol: { flex: 1, minWidth: 0 },
  heroWrapDesktop: { aspectRatio: 1 },
  statsBarDesktop: { borderTopWidth: 0 },
});

import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DefaultAvatar } from '@/components/default-avatar';
import { GradeChip } from '@/components/grade-chip';
import { ReplayModal } from '@/components/replay-modal';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
type IconName = Parameters<typeof IconSymbol>[0]['name'];
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { resolveJacketSource } from '@/lib/jacket';
import { getCountryFlag } from '@/lib/profileMeta';
import type { ClearHighlight, ReplayHighlight, UpscoreHighlight } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

function fmt(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function formatHighlightDate(dateKey?: string): string {
  if (!dateKey) return '';
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed);
}

function modeShort(mode?: string): string {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  return 'C';
}

const MODE_GRADIENTS: Record<string, readonly [string, string]> = {
  Single: ['#ff7a7a', '#7a1730'],
  Double: ['#4cf4aa', '#0b5d48'],
  CoOp: ['#69c8ff', '#12457c'],
};

/**
 * Top-3 medal palette for the rank pill (#1 gold / #2 silver / #3 bronze)
 * with cyan + violet for #4 / #5 to keep all five visually distinct.
 */
const RANK_GRADIENTS: Record<number, readonly [string, string]> = {
  1: ['#fde047', '#a16207'],
  2: ['#f1f5f9', '#64748b'],
  3: ['#fb923c', '#7c2d12'],
  4: ['#7dd3fc', '#1e3a8a'],
  5: ['#c4b5fd', '#5b21b6'],
};

const REPLAY_TYPE = Symbol('replay');

export function DailyHighlights() {
  const s = useThemedStyles(makeStyles);
  const [replayModal, setReplayModal] = useState<{ url: string; title: string } | null>(null);
  const [scoreSheet, setScoreSheet] = useState<ScoreCardData | null>(null);
  const { data } = useQuery({
    queryKey: ['daily-highlights'],
    queryFn: () => socialApi.dailyHighlights(),
    retry: false,
  });

  const topReplays: ReplayHighlight[] = data?.topReplays ?? [];
  const topUpscores: UpscoreHighlight[] = data?.topUpscores ?? [];
  const topClears: ClearHighlight[] = data?.topClears ?? [];
  const replayDate = useMemo(
    () => (data?.topReplaysIsFallback ? formatHighlightDate(data.topReplaysDateKey) : ''),
    [data?.topReplaysIsFallback, data?.topReplaysDateKey],
  );

  if (topReplays.length === 0 && topUpscores.length === 0 && topClears.length === 0) {
    return null;
  }

  const handleReplay = (play: ReplayHighlight) => {
    const url = String(play.replay_embed_url || '').trim();
    if (!url) return;
    const titleParts = [play.song_title, play.mode && play.level ? `${play.mode} ${play.level}` : ''].filter(Boolean);
    setReplayModal({ url, title: titleParts.join(' · ') || 'Replay' });
  };

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.eyebrow}>TODAY&apos;S HIGHLIGHTS</Text>
        <View style={s.headerLine} />
      </View>

      {topReplays.length > 0 ? (
        <Section
          icon="play.rectangle.fill"
          title={data?.topReplaysIsFallback ? 'Recent Top Replays' : 'Top Replays'}
          accent="#f87171"
          subtitle={replayDate ? `From ${replayDate}` : undefined}
          s={s}>
          <Rail>
            {topReplays.slice(0, 6).map((play, i) => (
              <HighlightCard
                key={`replay-${play.id ?? i}`}
                rank={i + 1}
                jacket={play.jacket_url}
                mode={play.mode}
                level={play.level}
                username={play.username}
                avatar={play.avatar}
                nationality={play.nationality}
                songTitle={play.song_title}
                primary={fmt(play.score)}
                grade={play.grade}
                gradeScore={play.score}
                ribbon={REPLAY_TYPE}
                onPress={() => handleReplay(play)}
                s={s}
              />
            ))}
          </Rail>
        </Section>
      ) : null}

      {topUpscores.length > 0 ? (
        <Section
          icon="arrow.up"
          title={data?.topUpscoresIsFallback ? 'Recent Top Upscores' : 'Best Upscores'}
          accent="#34d399"
          s={s}>
          <Rail>
            {topUpscores.slice(0, 6).map((u, i) => {
              const newScore = Number(u.new_score ?? u.score) || 0;
              const oldScore = Number(u.old_score) || 0;
              const delta = newScore - oldScore;
              return (
                <HighlightCard
                  key={`upscore-${u.upscore_id ?? i}-${i}`}
                  rank={i + 1}
                  jacket={u.jacket_url}
                  mode={u.mode}
                  level={u.level}
                  username={u.username}
                  avatar={u.avatar}
                  nationality={u.nationality}
                  songTitle={u.song_title}
                  primary={fmt(newScore)}
                  grade={u.new_grade || u.grade}
                  gradeScore={newScore}
                  delta={delta}
                  oldScore={oldScore}
                  onPress={() => setScoreSheet(buildUpscoreSheetData(u))}
                  s={s}
                />
              );
            })}
          </Rail>
        </Section>
      ) : null}

      {topClears.length > 0 ? (
        <Section
          icon="checkmark.circle.fill"
          title={data?.topClearsIsFallback ? 'Recent New Clears' : 'Best New Clears'}
          accent="#7dd3fc"
          s={s}>
          <Rail>
            {topClears.slice(0, 6).map((c, i) => (
              <HighlightCard
                key={`clear-${c.clear_id ?? i}-${i}`}
                rank={i + 1}
                jacket={c.jacket_url}
                mode={c.mode}
                level={c.level}
                username={c.username}
                avatar={c.avatar}
                nationality={c.nationality}
                songTitle={c.song_title}
                primary={fmt(c.score)}
                grade={c.grade}
                gradeScore={c.score}
                onPress={() => setScoreSheet(buildClearSheetData(c))}
                s={s}
              />
            ))}
          </Rail>
        </Section>
      ) : null}

      <ReplayModal
        visible={!!replayModal}
        url={replayModal?.url}
        title={replayModal?.title}
        onClose={() => setReplayModal(null)}
      />
      <ScoreCardSheet
        visible={!!scoreSheet}
        data={scoreSheet}
        onClose={() => setScoreSheet(null)}
      />
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  accent,
  children,
  s,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  accent: string;
  children: React.ReactNode;
  s: Styles;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={[s.sectionIconBox, { backgroundColor: `${accent}26`, borderColor: `${accent}55` }]}>
          <IconSymbol name={icon} size={11} color={accent} />
        </View>
        <Text style={s.sectionTitle}>{title}</Text>
        <View style={[s.sectionLine, { backgroundColor: `${accent}40` }]} />
      </View>
      {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
      {children}
    </ScrollView>
  );
}

function HighlightCard({
  rank,
  jacket,
  mode,
  level,
  username,
  avatar,
  nationality,
  songTitle,
  primary,
  grade,
  gradeScore,
  delta,
  oldScore,
  ribbon,
  onPress,
  s,
}: {
  rank: number;
  jacket?: string;
  mode?: string;
  level?: number | string;
  username?: string;
  avatar?: string;
  nationality?: string;
  songTitle?: string;
  primary: string;
  grade?: string;
  gradeScore?: number;
  delta?: number;
  oldScore?: number;
  ribbon?: typeof REPLAY_TYPE;
  onPress?: () => void;
  s: Styles;
}) {
  // Prefer the APK-bundled jacket over a network fetch. resolveJacketSource
  // returns the bundled require() id when we have it, falls back to a URL
  // otherwise. fullImageUrl is only used below for the avatar (no bundled
  // copy of avatars — they're per-user).
  const jacketSource = resolveJacketSource(jacket);
  const avatarUrl = typeof avatar === 'string' && avatar ? fullImageUrl(avatar) : undefined;
  const flag = getCountryFlag(nationality);
  const rankColors = RANK_GRADIENTS[rank] || RANK_GRADIENTS[5];
  const modeColors = MODE_GRADIENTS[mode || ''] || MODE_GRADIENTS.CoOp;
  const isReplay = ribbon === REPLAY_TYPE;
  const showDelta = typeof delta === 'number' && delta !== 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.card, pressed && onPress ? { opacity: 0.85 } : null]}>
      {jacketSource ? (
        <Image source={jacketSource as never} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.bgFallback]} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.96)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Rank badge — top-left */}
      <LinearGradient
        colors={rankColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.rankBadge}>
        <Text style={s.rankBadgeText}>{rank}</Text>
      </LinearGradient>

      {/* Mode/level badge — top-right */}
      {level ? (
        <LinearGradient
          colors={modeColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={s.levelBadge}>
          <Text style={s.levelBadgeText}>{modeShort(mode)}{level}</Text>
        </LinearGradient>
      ) : null}

      {/* Replay ribbon — only on replay cards */}
      {isReplay ? (
        <View style={s.replayRibbon}>
          <IconSymbol name="play.rectangle.fill" size={9} color="#fff" />
          <Text style={s.replayRibbonText}>REPLAY</Text>
        </View>
      ) : null}

      <View style={s.cardBottom}>
        <View style={s.userRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" />
          ) : (
            <DefaultAvatar size={18} />
          )}
          <Text style={s.username} numberOfLines={1}>
            {flag ? `${flag} ` : ''}{username || '—'}
          </Text>
        </View>
        <Text style={s.songTitle} numberOfLines={1}>{songTitle || 'Unknown'}</Text>
        <View style={s.scoreRow}>
          <Text style={s.score}>{primary}</Text>
          {grade ? <GradeChip grade={grade} score={gradeScore ?? 0} size="sm" /> : null}
        </View>
        {showDelta ? (
          <View style={s.deltaRow}>
            <Text style={s.deltaPrev}>{fmt(oldScore)}</Text>
            <Text style={[s.deltaValue, { color: delta > 0 ? '#34d399' : '#fda4af' }]}>
              {delta > 0 ? '+' : ''}{delta.toLocaleString()}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ── Score-sheet builders ───────────────────────────────────────────────────

function buildUpscoreSheetData(u: UpscoreHighlight): ScoreCardData {
  return {
    song_title: u.song_title,
    mode: u.mode,
    level: u.level,
    chart_id: u.chart_id,
    jacket_url: u.jacket_url,
    background_url: u.background_url,
    old_score: u.old_score,
    old_grade: u.old_grade,
    new_score: u.new_score ?? u.score,
    new_grade: u.new_grade ?? u.grade,
    plate: u.plate,
    perfect: u.perfect,
    great: u.great,
    good: u.good,
    bad: u.bad,
    miss: u.miss,
    max_combo: u.max_combo,
    over_top100_rank: typeof u.over_top100_rank === 'number' ? u.over_top100_rank : undefined,
    username: u.username,
    avatar: u.avatar,
    played_at_utc: u.played_at_utc,
    date_played: u.date_played,
    machine_name: u.machine_name,
    replay_embed_url: u.replay_embed_url,
  };
}

function buildClearSheetData(c: ClearHighlight): ScoreCardData {
  return {
    song_title: c.song_title,
    mode: c.mode,
    level: c.level,
    chart_id: c.chart_id,
    jacket_url: c.jacket_url,
    background_url: c.background_url,
    score: c.score,
    grade: c.grade,
    plate: c.plate,
    perfect: c.perfect,
    great: c.great,
    good: c.good,
    bad: c.bad,
    miss: c.miss,
    max_combo: c.max_combo,
    over_top100_rank: typeof c.over_top100_rank === 'number' ? c.over_top100_rank : undefined,
    username: c.username,
    avatar: c.avatar,
    played_at_utc: c.played_at_utc,
    date_played: c.date_played,
    machine_name: c.machine_name,
    replay_embed_url: c.replay_embed_url,
  };
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const CARD_W = 156;
const CARD_H = 116;

const makeStyles = (t: ThemeColors) => ({
  container: { gap: 14 },

  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  eyebrow: {
    fontSize: 13,
    fontWeight: '900' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  headerLine: { flex: 1, height: 1, backgroundColor: t.border },

  // Section header
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  sectionIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.4, color: t.text },
  sectionLine: { flex: 1, height: 1 },
  sectionSubtitle: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 1, color: t.textDim, paddingHorizontal: 2 },

  // Card
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
  },
  bgFallback: { backgroundColor: '#0f1a2d' },

  rankBadge: {
    position: 'absolute' as const,
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    zIndex: 2,
  },
  rankBadgeText: { fontSize: 10, fontWeight: '900' as const, color: '#0a0f1c', letterSpacing: 0.2 },

  levelBadge: {
    position: 'absolute' as const,
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    zIndex: 2,
  },
  levelBadgeText: { fontSize: 10, fontWeight: '900' as const, color: '#fff', letterSpacing: 0.2 },

  replayRibbon: {
    position: 'absolute' as const,
    top: 32,
    right: 6,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(220, 38, 38, 0.92)',
    zIndex: 2,
  },
  replayRibbonText: { fontSize: 8, fontWeight: '900' as const, color: '#fff', letterSpacing: 0.6 },

  cardBottom: {
    position: 'absolute' as const,
    left: 8,
    right: 8,
    bottom: 8,
    gap: 3,
  },
  userRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  avatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  username: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 3,
  },
  songTitle: {
    fontSize: 11,
    fontWeight: '900' as const,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 3,
  },
  scoreRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, gap: 6 },
  score: {
    fontSize: 14,
    fontWeight: '900' as const,
    color: '#fff',
    fontVariant: ['tabular-nums' as const],
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 3,
  },
  deltaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 6 },
  deltaPrev: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    fontVariant: ['tabular-nums' as const],
  },
  deltaValue: {
    fontSize: 10,
    fontWeight: '900' as const,
    fontVariant: ['tabular-nums' as const],
  },
});

import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GradeChip } from '@/components/grade-chip';
import { PlateBadge } from '@/components/plate-badge';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ScoreCardData } from '@/components/score-card-sheet';
import type { ThemeColors } from '@/constants/theme';
import type { ExploreFeedScope, ExplorePlay } from '@shared/api';

const SCOPES: { value: ExploreFeedScope; label: string }[] = [
  { value: 'following', label: 'Following' },
  { value: 'global', label: 'Global' },
  { value: 'me', label: 'Me' },
];

function modeShort(mode?: string): string {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'single') return 'S';
  if (m === 'double') return 'D';
  if (m === 'coop') return 'Co';
  return m.slice(0, 1).toUpperCase();
}

// Mode-tinted backgrounds for the level badge — mirrors the desktop tile so
// "S" reads red (Single), "D" reads green (Double), "Co" reads sky (CoOp).
function modeBadgeColors(mode?: string): { bg: string; border: string } {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'single') return { bg: 'rgba(220, 38, 38, 0.85)', border: 'rgba(248, 113, 113, 0.5)' };
  if (m === 'double') return { bg: 'rgba(5, 150, 105, 0.85)', border: 'rgba(52, 211, 153, 0.5)' };
  if (m === 'coop') return { bg: 'rgba(2, 132, 199, 0.85)', border: 'rgba(56, 189, 248, 0.5)' };
  return { bg: 'rgba(82, 82, 91, 0.85)', border: 'rgba(161, 161, 170, 0.5)' };
}

interface Props {
  // Feed-screen styles share the rail's eyebrow/card design tokens — pass
  // them in so the panel doesn't duplicate them.
  s: { deskRailLabel: object };
  theme: ThemeColors;
  onScore: (data: ScoreCardData) => void;
  onReplay: (url: string, title: string) => void;
}

export function ExploreTilesPanel({ s: parentStyles, theme, onScore, onReplay: _onReplay }: Props) {
  const s = useThemedStyles(makeStyles);
  const [scope, setScope] = useState<ExploreFeedScope>('following');

  const exploreQuery = useQuery({
    queryKey: ['explore-feed', scope],
    queryFn: () => socialApi.exploreFeed({ scope }),
    staleTime: 60_000,
  });

  // Server already tags hero / feature / standard tiers. Sort by tier so
  // the strongest plays bubble up; cap to 30 for the rail (more than that
  // and the rail scroll feels endless without being useful).
  const tiles: ExplorePlay[] = useMemo(() => {
    const items = exploreQuery.data?.items ?? [];
    if (items.length === 0) return [];
    const order = { hero: 0, feature: 1, standard: 2 } as Record<string, number>;
    return [...items]
      .sort((a, b) => (order[a.highlight_tier || 'standard'] ?? 9) - (order[b.highlight_tier || 'standard'] ?? 9))
      .slice(0, 30);
  }, [exploreQuery.data]);

  const handlePress = (play: ExplorePlay) => {
    onScore({
      song_title: play.song_title,
      mode: play.mode,
      level: play.level,
      play_id: play.play_id,
      jacket_url: play.jacket_url,
      background_url: play.background_url,
      score: play.score,
      grade: play.grade,
      plate: play.plate,
      perfect: play.perfect,
      great: play.great,
      good: play.good,
      bad: play.bad,
      miss: play.miss,
      max_combo: play.max_combo,
      over_top100_rank: play.over_top100_rank,
      username: play.username,
      avatar: play.avatar,
      played_at_utc: play.played_at_utc,
    });
  };

  return (
    <View style={s.section}>
      <View style={s.headerRow}>
        <Text style={parentStyles.deskRailLabel as never}>EXPLORE</Text>
        <View style={s.scopeRow}>
          {SCOPES.map((opt) => {
            const active = opt.value === scope;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setScope(opt.value)}
                style={({ pressed }) => [
                  s.scopeBtn,
                  active && s.scopeBtnActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={[s.scopeBtnText, active && s.scopeBtnTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {exploreQuery.isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={theme.spinner} />
        </View>
      ) : exploreQuery.isError ? (
        <Text style={s.empty}>Couldn’t load Explore.</Text>
      ) : tiles.length === 0 ? (
        <Text style={s.empty}>
          {scope === 'following'
            ? 'Follow players to fill this with their plays.'
            : 'No recent plays in this scope.'}
        </Text>
      ) : (
        <View style={s.grid}>
          {tiles.map((play) => (
            <ExploreTile
              key={`tile-${play.play_id}`}
              play={play}
              theme={theme}
              s={s}
              onPress={() => handlePress(play)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ExploreTile({
  play,
  theme,
  s,
  onPress,
}: {
  play: ExplorePlay;
  theme: ThemeColors;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
  onPress: () => void;
}) {
  const jacket = play.jacket_url ? fullImageUrl(play.jacket_url) : undefined;
  const avatar = play.avatar ? fullImageUrl(String(play.avatar)) : undefined;
  const tier = play.highlight_tier || 'standard';
  const isHero = tier === 'hero';
  const modeColors = modeBadgeColors(play.mode);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.tile,
        isHero && s.tileHero,
        pressed && { opacity: 0.85 },
      ]}>
      {jacket ? (
        <Image source={{ uri: jacket }} style={s.tileJacket} contentFit="cover" />
      ) : (
        <View style={[s.tileJacket, { backgroundColor: theme.surfaceMuted }]} />
      )}

      {/* Top-to-bottom darkening gradient — the bottom info block needs
          the contrast. Implemented as a flat alpha overlay since RN's
          inline gradients require an extra dep we don't have here. */}
      <View style={s.scrim} />

      {/* Mode + level badge, top-left. Color is keyed to the chart mode
          so the chip itself communicates Single / Double / CoOp. */}
      <View style={[s.modeBadge, { backgroundColor: modeColors.bg, borderColor: modeColors.border }]}>
        <Text style={s.modeBadgeText}>
          {modeShort(play.mode)}{play.level ?? ''}
        </Text>
      </View>

      {/* Comment count, top-right. Quiet so it doesn't compete with the
          mode chip; appears only when the play has discussion. */}
      {typeof play.comment_count === 'number' && play.comment_count > 0 ? (
        <View style={s.commentBadge}>
          <Text style={s.commentBadgeText}>💬 {play.comment_count}</Text>
        </View>
      ) : null}

      {/* Bottom info block: avatar + username, song title, score + grade.
          Hero tier renders all three lines comfortably; standard/feature
          tiles compress the song title and rely on the score row. */}
      <View style={[s.tileContent, isHero && s.tileContentHero]}>
        <View style={s.userRow}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={[s.avatar, isHero && s.avatarHero]} contentFit="cover" />
          ) : (
            <View style={[s.avatar, isHero && s.avatarHero, s.avatarFallback]}>
              <Text style={s.avatarFallbackText}>
                {(play.username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[s.username, isHero && s.usernameHero]} numberOfLines={1}>
            {play.username || 'anonymous'}
          </Text>
        </View>
        <Text style={[s.songTitle, isHero && s.songTitleHero]} numberOfLines={1}>
          {play.song_title || 'Unknown'}
        </Text>
        <View style={s.scoreRow}>
          <Text style={[s.score, isHero && s.scoreHero]} numberOfLines={1}>
            {Number(play.score || 0).toLocaleString()}
          </Text>
          <View style={s.scoreRight}>
            {play.plate ? <PlateBadge plate={String(play.plate)} size="xs" /> : null}
            {play.grade ? (
              <GradeChip grade={String(play.grade)} score={Number(play.score) || 0} size="sm" />
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  section: { gap: 8 },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
  },
  scopeRow: { flexDirection: 'row' as const, gap: 4 },
  scopeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.bg,
  },
  scopeBtnActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  scopeBtnText: { fontSize: 10, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.4 },
  scopeBtnTextActive: { color: t.accent },

  // 3-up grid via flexBasis 31% — leaves enough slack for the 8px gap so
  // we never overflow into a 4th column. Hero tiles span the full row.
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  tile: {
    flexBasis: '31%' as const,
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden' as const,
    backgroundColor: t.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    minWidth: 130,
  },
  tileHero: {
    flexBasis: '100%' as const,
    aspectRatio: 16 / 9,
  },
  tileJacket: {
    width: '100%' as const,
    height: '100%' as const,
  },
  scrim: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  modeBadge: {
    position: 'absolute' as const,
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: '900' as const,
    color: '#fff',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  commentBadge: {
    position: 'absolute' as const,
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  commentBadgeText: { fontSize: 9, fontWeight: '800' as const, color: 'rgba(255,255,255,0.85)' },

  // Bottom-of-tile content stack: user row → song → score row.
  tileContent: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 3,
  },
  tileContentHero: { paddingHorizontal: 12, paddingVertical: 12, gap: 4 },

  userRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  avatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarHero: { width: 22, height: 22, borderRadius: 11 },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarFallbackText: { fontSize: 9, fontWeight: '900' as const, color: '#fff' },
  username: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800' as const,
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  usernameHero: { fontSize: 12 },

  songTitle: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  songTitleHero: { fontSize: 14 },

  scoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 6,
    marginTop: 1,
  },
  score: {
    fontSize: 12,
    fontWeight: '900' as const,
    color: '#fff',
    fontVariant: ['tabular-nums' as const],
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  scoreHero: { fontSize: 16 },
  scoreRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },

  center: { padding: 18, alignItems: 'center' as const },
  empty: { fontSize: 12, color: t.textDim, paddingVertical: 14, textAlign: 'center' as const },
});

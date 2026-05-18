import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GradeChip } from '@/components/grade-chip';
import { PlateBadge } from '@/components/plate-badge';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { resolveJacketSource } from '@/lib/jacket';
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

export function ExploreTilesPanel({ s: parentStyles, theme, onScore, onReplay }: Props) {
  const s = useThemedStyles(makeStyles);
  const [scope, setScope] = useState<ExploreFeedScope>('following');

  const exploreQuery = useQuery({
    queryKey: ['explore-feed', scope],
    queryFn: () => socialApi.exploreFeed({ scope }),
    staleTime: 60_000,
  });

  // Mirror the desktop's `layoutItems`: keep server order so the densest
  // grid packing is honored (heroes interleaved through the feed), then
  // alternate feature variants between wide (2x1) and tall (1x2) so the
  // grid breaks up rhythmically instead of stacking same-shape tiles.
  const laidOut: { play: ExplorePlay; variant: 'hero' | 'wide' | 'tall' | 'standard' }[] = useMemo(() => {
    const items = exploreQuery.data?.items ?? [];
    if (items.length === 0) return [];
    let featureCounter = 0;
    return items.slice(0, 30).map((play) => {
      const tier = play.highlight_tier || 'standard';
      if (tier === 'hero') return { play, variant: 'hero' as const };
      if (tier === 'feature') {
        const v: 'wide' | 'tall' = featureCounter % 2 === 0 ? 'wide' : 'tall';
        featureCounter++;
        return { play, variant: v };
      }
      return { play, variant: 'standard' as const };
    });
  }, [exploreQuery.data]);

  const buildReplayTitle = (play: ExplorePlay): string => {
    const song = String(play.song_title || 'Song').trim();
    const mode = String(play.mode || '').trim();
    const level = play.level ? ` ${play.level}` : '';
    const modePart = mode ? ` · ${mode}${level}` : '';
    return `${song}${modePart}`;
  };

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
      replay_embed_url: play.replay_embed_url,
    });
  };

  const handleReplay = (play: ExplorePlay) => {
    const url = String(play.replay_embed_url || '').trim();
    if (!url) return;
    onReplay(url, buildReplayTitle(play));
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
      ) : laidOut.length === 0 ? (
        <Text style={s.empty}>
          {scope === 'following'
            ? 'Follow players to fill this with their plays.'
            : 'No recent plays in this scope.'}
        </Text>
      ) : (
        // Web gets a real CSS grid (display:grid) so hero=2×2, feature=2×1
        // or 1×2, and standard=1×1 tessellate with `grid-auto-flow: dense`
        // — same packing as pumpshinsa.com. Native falls back to a plain
        // wrap (no spans) since RN has no grid primitive; that path is
        // only exercised by the iOS/Android shells, not new.pumpshinsa.com.
        <View style={Platform.OS === 'web' ? (s.gridWeb as never) : s.grid}>
          {laidOut.map(({ play, variant }) => (
            <ExploreTile
              key={`tile-${play.play_id}`}
              play={play}
              variant={variant}
              theme={theme}
              s={s}
              onPress={() => handlePress(play)}
              onReplay={() => handleReplay(play)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

type TileVariant = 'hero' | 'wide' | 'tall' | 'standard';

function ExploreTile({
  play,
  variant,
  theme,
  s,
  onPress,
  onReplay,
}: {
  play: ExplorePlay;
  variant: TileVariant;
  theme: ThemeColors;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
  onPress: () => void;
  onReplay: () => void;
}) {
  // Only the Shinsa-hosted jacket — no piugame fallback. If a tile
  // renders empty it's because the songs catalog is missing that chart
  // (run server/scripts/backfill-songs-catalog.js to fix), not a
  // transient network issue. Removed the prior onError swap to bg_url
  // since we never want a piugame CDN URL in the UI.
  const jacketSource = resolveJacketSource(play.jacket_url);
  const avatar = play.avatar ? fullImageUrl(String(play.avatar)) : undefined;
  const isHero = variant === 'hero';
  const modeColors = modeBadgeColors(play.mode);
  const hasReplay = !!(play.replay_embed_url || play.replay_video_id);

  // CSS-grid spans: applied as inline style on web only. Native fallback
  // (no grid) just renders every tile as a square in a flex wrap.
  const gridSpan: Record<string, string> = {};
  if (Platform.OS === 'web') {
    if (variant === 'hero') {
      gridSpan.gridColumn = 'span 2';
      gridSpan.gridRow = 'span 2';
    } else if (variant === 'wide') {
      gridSpan.gridColumn = 'span 2';
    } else if (variant === 'tall') {
      gridSpan.gridRow = 'span 2';
    }
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.tile,
        // On native we still need the square aspect ratio fallback since
        // there's no grid sizing. On web the cell height comes from the
        // grid's auto-rows, so we leave the tile to fill its cell.
        Platform.OS !== 'web' && s.tileSquare,
        gridSpan as never,
        pressed && { opacity: 0.85 },
      ]}>
      {jacketSource ? (
        <Image source={jacketSource as never} style={s.tileJacket} contentFit="cover" />
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

      {/* Top-right stack: replay beacon (when the play has a clip) sits
          above the comment count, matching the desktop tile's hierarchy
          — a replay is a stronger call-to-action than a comment count.
          onPress stopPropagation isn't needed: RN's nested Pressables
          don't bubble like the DOM. */}
      <View style={s.topRightStack}>
        {hasReplay ? (
          <Pressable
            onPress={onReplay}
            hitSlop={6}
            style={({ pressed }) => [s.replayBeacon, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Open replay clip">
            <Text style={s.replayBeaconText}>▶ REPLAY</Text>
          </Pressable>
        ) : null}
        {typeof play.comment_count === 'number' && play.comment_count > 0 ? (
          <View style={s.commentBadge}>
            <Text style={s.commentBadgeText}>💬 {play.comment_count}</Text>
          </View>
        ) : null}
      </View>

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

  // Native fallback: flex-wrap, no spans. Web replaces this with `gridWeb`
  // below for true tessellation.
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  // Web: 3-column CSS grid with `dense` packing so feature/hero spans
  // backfill into earlier rows when there's room — same look as
  // pumpshinsa.com's Explore. `gridAutoRows` sets every cell's height,
  // so spans are predictable. Cast through `never` because RN's style
  // types don't model grid; RN-Web forwards them to the underlying div.
  gridWeb: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridAutoRows: '140px',
    gridAutoFlow: 'dense',
    gap: 8,
  } as never,
  tile: {
    borderRadius: 10,
    overflow: 'hidden' as const,
    backgroundColor: t.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    minWidth: 0,
    width: '100%' as const,
    height: '100%' as const,
    position: 'relative' as const,
  },
  // Native-only sizing: the grid path on web sizes via grid-auto-rows.
  tileSquare: { aspectRatio: 1, flexBasis: '31%' as const, flexGrow: 1, minWidth: 130 },
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
  // Wrapper for the top-right badge stack: replay beacon on top, comment
  // count under it. alignItems flex-end so both chips hug the right edge.
  topRightStack: {
    position: 'absolute' as const,
    top: 6,
    right: 6,
    alignItems: 'flex-end' as const,
    gap: 4,
  },
  commentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  commentBadgeText: { fontSize: 9, fontWeight: '800' as const, color: 'rgba(255,255,255,0.85)' },
  // Sky-tinted pill mirroring the desktop's pulsing "Replay" beacon. No
  // animation on RN to keep the bundle small; the tint + chevron already
  // read as an active control.
  replayBeacon: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125, 211, 252, 0.5)',
    backgroundColor: 'rgba(2, 132, 199, 0.55)',
  },
  replayBeaconText: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#ecfeff',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

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

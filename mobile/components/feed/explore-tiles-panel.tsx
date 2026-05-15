import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GradeChip } from '@/components/grade-chip';
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
    // Stale after a minute — the rail is glanced at, not stared at.
    staleTime: 60_000,
  });

  // We render a small two-column grid of the most-impressive plays. Hero
  // tier first, then feature, then standard — so the rail leads with the
  // strongest material without rebuilding the desktop's tessellation logic.
  const tiles: ExplorePlay[] = useMemo(() => {
    const items = exploreQuery.data?.items ?? [];
    if (items.length === 0) return [];
    const order = { hero: 0, feature: 1, standard: 2 } as Record<string, number>;
    return [...items]
      .sort((a, b) => (order[a.highlight_tier || 'standard'] ?? 9) - (order[b.highlight_tier || 'standard'] ?? 9))
      .slice(0, 24);
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
    // If a replay exists, the score sheet exposes it; we don't auto-open
    // the replay modal from a tile tap to keep the interaction lightweight.
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
  const isHero = play.highlight_tier === 'hero';
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
      {/* Score + grade chip overlay. Sits over the bottom of the jacket so
          the tile communicates "X cleared this with grade Y" at a glance. */}
      <View style={s.tileOverlay}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={s.tileScore} numberOfLines={1}>
            {Number(play.score || 0).toLocaleString()}
          </Text>
          <Text style={s.tileMeta} numberOfLines={1}>
            @{play.username || '—'} · {play.mode === 'Single' ? 'S' : play.mode === 'Double' ? 'D' : play.mode === 'CoOp' ? 'C' : ''}{play.level || ''}
          </Text>
        </View>
        {play.grade ? (
          <GradeChip grade={String(play.grade)} score={Number(play.score) || 0} size="sm" />
        ) : null}
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

  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  // Tiles flex to 2-up (~half rail width minus gap). Hero tiles take the
  // full width of the rail so they still read as "the highlight."
  tile: {
    flexBasis: '47%' as const,
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden' as const,
    backgroundColor: t.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    minWidth: 110,
  },
  tileHero: {
    flexBasis: '100%' as const,
    aspectRatio: 16 / 9,
  },
  tileJacket: { width: '100%' as const, height: '100%' as const },
  tileOverlay: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  tileScore: { fontSize: 13, fontWeight: '900' as const, color: '#fff', fontVariant: ['tabular-nums' as const] },
  tileMeta: { fontSize: 10, color: 'rgba(255,255,255,0.78)' },

  center: { padding: 18, alignItems: 'center' as const },
  empty: { fontSize: 12, color: t.textDim, paddingVertical: 14, textAlign: 'center' as const },
});

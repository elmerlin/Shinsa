import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { GradeChip } from '@/components/grade-chip';
import { PlateBadge } from '@/components/plate-badge';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

function fmt(n?: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

export function DailyHighlights() {
  const s = useThemedStyles(makeStyles);
  const { data } = useQuery({
    queryKey: ['daily-highlights'],
    queryFn: () => socialApi.dailyHighlights(),
    retry: false,
  });

  const replays = (data?.topReplays ?? []).slice(0, 4);
  if (replays.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.eyebrow}>DAILY HIGHLIGHTS</Text>
      <View style={s.grid}>
        {replays.map((r) => {
          const jacket = r.background_url ? fullImageUrl(r.background_url) : undefined;
          return (
            <View key={String(r.id)} style={s.card}>
              {jacket ? (
                <Image source={{ uri: jacket }} style={s.bg} contentFit="cover" />
              ) : (
                <View style={[s.bg, s.bgFallback]} />
              )}
              <View style={s.overlay}>
                <View style={s.topRow}>
                  <View style={s.replayPill}>
                    <IconSymbol name="play.rectangle.fill" size={10} color="#7dd3fc" />
                    <Text style={s.replayText}>REPLAY</Text>
                  </View>
                  <PlateBadge plate={r.plate} size="xs" />
                </View>
                <View style={s.bottom}>
                  <Text style={s.title} numberOfLines={1}>{r.song_title || 'Unknown'}</Text>
                  <View style={s.scoreLine}>
                    <Text style={s.mode}>{r.mode}{typeof r.level === 'number' && r.level > 0 ? ` ${r.level}` : ''}</Text>
                    <Text style={s.score}>{fmt(r.score)}</Text>
                    <GradeChip grade={r.grade} score={r.score ?? 0} size="xs" />
                  </View>
                  <Text style={s.user} numberOfLines={1}>@{r.username}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { gap: 8 },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  card: {
    flexBasis: '48%' as const,
    flexGrow: 1,
    aspectRatio: 1.2,
    borderRadius: 10,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
  },
  bg: { ...StyleSheet.absoluteFillObject },
  bgFallback: { backgroundColor: t.surfaceMuted },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,5,5,0.55)',
    padding: 8,
    justifyContent: 'space-between' as const,
  },
  topRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const },
  replayPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(125,211,252,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125,211,252,0.4)',
  },
  replayText: { fontSize: 8, fontWeight: '800' as const, letterSpacing: 0.5, color: '#7dd3fc' },
  bottom: { gap: 2 },
  title: { fontSize: 12, fontWeight: '800' as const, color: '#fff' },
  scoreLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  mode: { fontSize: 9, fontWeight: '700' as const, color: 'rgba(255,255,255,0.7)' },
  score: { fontSize: 11, fontWeight: '800' as const, color: '#fff', fontVariant: ['tabular-nums' as const] },
  user: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },
});

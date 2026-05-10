import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

export function SongOfWeekStrip() {
  const s = useThemedStyles(makeStyles);
  const { data } = useQuery({
    queryKey: ['song-of-week', 'global'],
    queryFn: () => socialApi.songOfWeekFeed('global'),
    retry: false,
  });

  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.eyebrow}>SONG OF THE WEEK</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {items.map((it) => {
          const jacket = it.jacket_url_snapshot ? fullImageUrl(it.jacket_url_snapshot) : undefined;
          return (
            <View key={String(it.id)} style={s.card}>
              <View style={s.jacketWrap}>
                <ChartJacket jacketUrl={jacket} mode={it.mode} level={it.level} size="wide" />
              </View>
              <Text style={s.title} numberOfLines={1}>{it.song_title_snapshot || 'Unknown'}</Text>
              <Text style={s.user} numberOfLines={1}>@{it.username}</Text>
              {it.caption ? <Text style={s.caption} numberOfLines={2}>"{it.caption}"</Text> : null}
            </View>
          );
        })}
      </ScrollView>
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
    paddingHorizontal: 0,
  },
  scroll: { gap: 10, paddingRight: 16 },
  card: {
    width: 140,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 4,
  },
  jacketWrap: { alignSelf: 'center' as const, marginBottom: 6 },
  title: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  user: { fontSize: 10, color: t.accent, fontWeight: '700' as const },
  caption: { fontSize: 10, color: t.textDim, fontStyle: 'italic' as const },
});

import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
              {jacket ? (
                <Image source={{ uri: jacket }} style={s.jacket} contentFit="cover" />
              ) : (
                <View style={[s.jacket, s.jacketFallback]} />
              )}
              <Text style={s.title} numberOfLines={1}>{it.song_title_snapshot || 'Unknown'}</Text>
              <Text style={s.meta} numberOfLines={1}>
                {it.mode || ''}{typeof it.level === 'number' && it.level > 0 ? ` Lv ${it.level}` : ''}
              </Text>
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
    padding: 8,
    gap: 4,
  },
  jacket: { width: '100%' as const, aspectRatio: 1, borderRadius: 6, backgroundColor: t.surfaceMuted, marginBottom: 4 },
  jacketFallback: {},
  title: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  meta: { fontSize: 10, color: t.textMuted },
  user: { fontSize: 10, color: t.accent, fontWeight: '700' as const },
  caption: { fontSize: 10, color: t.textDim, fontStyle: 'italic' as const },
});

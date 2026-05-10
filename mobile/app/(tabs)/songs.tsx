import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Song } from '@shared/api';

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function SongRow({ song, onPress, s }: { song: Song; onPress: () => void; s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>> }) {
  const jacket = fullImageUrl(song.jacket_url);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      {jacket ? (
        <Image source={{ uri: jacket }} style={s.jacket} contentFit="cover" transition={150} />
      ) : (
        <View style={[s.jacket, s.jacketPlaceholder]} />
      )}
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>{song.artist}</Text>
      </View>
      <View style={s.rowRight}>
        {song.mode ? <Text style={s.modeChip}>{song.mode[0]}</Text> : null}
        {typeof song.level === 'number' && song.level > 0 ? (
          <Text style={s.levelChip}>{song.level}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function SongsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['songs', debouncedQuery],
    queryFn: () => songsApi.list({ q: debouncedQuery || undefined, limit: 100 }),
  });

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={s.heading}>Songs</Text>
        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search title or artist…"
          placeholderTextColor={theme.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={theme.spinner} />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error instanceof Error ? error.message : 'Failed to load songs'}</Text>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <SongRow song={item} s={s} onPress={() => router.push({ pathname: '/song/[id]', params: { id: String(item.id) } })} />
          )}
          contentContainerStyle={{ paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={() => (
            <Text style={s.empty}>{debouncedQuery ? 'No songs match your search.' : 'No songs found.'}</Text>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  heading: { fontSize: 28, fontWeight: '800' as const, color: t.text, letterSpacing: 2 },
  search: {
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowPressed: { backgroundColor: t.accentTint },
  jacket: { width: 48, height: 48, borderRadius: 6, backgroundColor: t.card },
  jacketPlaceholder: { backgroundColor: t.card },
  rowMain: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' as const, color: t.text },
  rowMeta: { fontSize: 12, color: t.textMuted },
  rowRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  modeChip: {
    fontSize: 10,
    fontWeight: '700' as const,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.surfaceMuted,
    color: t.textMuted,
    minWidth: 18,
    textAlign: 'center' as const,
  },
  levelChip: {
    fontSize: 12,
    fontWeight: '700' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: t.accentTint,
    color: t.accent,
    minWidth: 28,
    textAlign: 'center' as const,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 76 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  empty: { textAlign: 'center' as const, padding: 32, color: t.textDim },
  errorText: { color: t.danger, textAlign: 'center' as const },
});

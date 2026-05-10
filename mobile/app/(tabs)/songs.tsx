import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { Song } from '@shared/api';

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function SongRow({ song, onPress }: { song: Song; onPress: () => void }) {
  const jacket = fullImageUrl(song.jacket_url);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {jacket ? (
        <Image source={{ uri: jacket }} style={styles.jacket} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.jacket, styles.jacketPlaceholder]} />
      )}
      <View style={styles.rowMain}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>{song.title}</ThemedText>
        <Text style={styles.rowMeta} numberOfLines={1}>{song.artist}</Text>
      </View>
      <View style={styles.rowRight}>
        {song.mode ? <Text style={styles.modeChip}>{song.mode[0]}</Text> : null}
        {typeof song.level === 'number' && song.level > 0 ? (
          <Text style={styles.levelChip}>{song.level}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function SongsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['songs', debouncedQuery],
    queryFn: () => songsApi.list({ q: debouncedQuery || undefined, limit: 100 }),
  });

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <ThemedText type="title" style={styles.heading}>Songs</ThemedText>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search title or artist…"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error instanceof Error ? error.message : 'Failed to load songs'}</Text>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(s) => String(s.id)}
          renderItem={({ item }) => (
            <SongRow song={item} onPress={() => router.push({ pathname: '/song/[id]', params: { id: String(item.id) } })} />
          )}
          contentContainerStyle={{ paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={() => (
            <Text style={styles.empty}>{debouncedQuery ? 'No songs match your search.' : 'No songs found.'}</Text>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  heading: { fontSize: 28, fontWeight: '700', letterSpacing: 4 },
  search: {
    backgroundColor: 'rgba(148,163,184,0.1)',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowPressed: { backgroundColor: 'rgba(59,130,246,0.08)' },
  jacket: { width: 48, height: 48, borderRadius: 6, backgroundColor: '#1e293b' },
  jacketPlaceholder: { backgroundColor: '#1e293b' },
  rowMain: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12, opacity: 0.55 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeChip: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(148,163,184,0.2)',
    color: '#94a3b8',
    minWidth: 18,
    textAlign: 'center',
  },
  levelChip: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(59,130,246,0.15)',
    color: '#60a5fa',
    minWidth: 28,
    textAlign: 'center',
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148,163,184,0.15)', marginLeft: 76 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { textAlign: 'center', padding: 32, opacity: 0.5 },
  errorText: { color: '#fca5a5', textAlign: 'center' },
});

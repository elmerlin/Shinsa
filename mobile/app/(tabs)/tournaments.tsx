import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { tournamentsApi } from '@/lib/api';
import type { Tournament } from '@shared/api';

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const PHASE_COLORS: Record<string, { bg: string; fg: string }> = {
  COMPLETED: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  DRAW: { bg: 'rgba(255,51,102,0.15)', fg: '#ff6b8a' },
  PLAYING: { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80' },
  PENDING: { bg: 'rgba(234,179,8,0.15)', fg: '#facc15' },
};

function TournamentRow({ t, onPress }: { t: Tournament; onPress: () => void }) {
  const phaseStyle = (t.phase && PHASE_COLORS[t.phase]) || PHASE_COLORS.PENDING;
  const initial = t.name.charAt(0).toUpperCase();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarLetter}>{initial}</Text>
      </View>
      <View style={styles.rowMain}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>{t.name}</ThemedText>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[formatDate(t.date), t.location].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {t.phase ? (
          <Text style={[styles.phaseChip, { backgroundColor: phaseStyle.bg, color: phaseStyle.fg }]}>{t.phase}</Text>
        ) : null}
        {typeof t.current_round === 'number' && typeof t.total_rounds === 'number' && t.total_rounds > 0 ? (
          <Text style={styles.roundChip}>R{t.current_round}/{t.total_rounds}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function TournamentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => tournamentsApi.list(),
  });

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <ThemedText type="title" style={styles.heading}>Tournaments</ThemedText>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#ff3366" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error instanceof Error ? error.message : 'Failed to load tournaments'}</Text>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TournamentRow
              t={item}
              onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: item.id } })}
            />
          )}
          contentContainerStyle={{ paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={() => <Text style={styles.empty}>No active tournaments</Text>}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ff3366" />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  heading: { fontSize: 28, fontWeight: '700', letterSpacing: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  rowPressed: { backgroundColor: 'rgba(255,51,102,0.08)' },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(255,51,102,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 22, fontWeight: '700', color: '#ff6b8a' },
  rowMain: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12, opacity: 0.55 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  phaseChip: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  roundChip: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148,163,184,0.15)', marginLeft: 76 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { textAlign: 'center', padding: 32, opacity: 0.5 },
  errorText: { color: '#fca5a5', textAlign: 'center' },
});

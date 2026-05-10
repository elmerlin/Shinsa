import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { dashboardApi } from '@/lib/api';
import type { Duel, Notice, Tournament } from '@shared/api';

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TournamentRow({ t, onPress }: { t: Tournament; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>{t.name}</ThemedText>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[t.phase, t.location, formatDate(t.date)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {typeof t.current_round === 'number' && typeof t.total_rounds === 'number' && t.total_rounds > 0 ? (
        <Text style={styles.rowBadge}>R{t.current_round}/{t.total_rounds}</Text>
      ) : null}
    </Pressable>
  );
}

function DuelRow({ d }: { d: Duel }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>{d.name || 'Untitled duel'}</ThemedText>
        <Text style={styles.rowMeta}>{formatDate(d.created_at)}</Text>
      </View>
    </View>
  );
}

function NoticeRow({ n }: { n: Notice }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <ThemedText style={styles.rowTitle} numberOfLines={2}>
          {n.pinned ? '📌 ' : ''}{n.title || 'Untitled notice'}
        </ThemedText>
        {n.body ? <Text style={styles.rowMeta} numberOfLines={2}>{n.body}</Text> : null}
      </View>
    </View>
  );
}

function Section<T>({ title, items, render, empty }: {
  title: string;
  items: T[];
  render: (item: T) => React.ReactNode;
  empty: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        <View style={styles.sectionBody}>{items.map((item, i) => (
          <View key={i}>{render(item)}</View>
        ))}</View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
  });

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ff3366" />}>
        <ThemedText type="title" style={styles.heading}>Shinsa</ThemedText>

        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color="#ff3366" />
          </View>
        )}

        {isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error instanceof Error ? error.message : 'Failed to load dashboard'}</Text>
          </View>
        )}

        {data && (
          <>
            <Section
              title="Tournaments"
              items={data.tournaments.slice(0, 10)}
              empty="No active tournaments"
              render={(t) => (
                <TournamentRow
                  t={t}
                  onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: t.id } })}
                />
              )}
            />
            <Section
              title="Recent duels"
              items={data.duels.slice(0, 10)}
              empty="No recent duels"
              render={(d) => <DuelRow d={d} />}
            />
            <Section
              title="Notices"
              items={data.notices.slice(0, 10)}
              empty="No notices"
              render={(n) => <NoticeRow n={n} />}
            />
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 80, gap: 24 },
  heading: { fontSize: 28, fontWeight: '700', letterSpacing: 4, marginBottom: 8 },
  center: { padding: 32, alignItems: 'center' },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: '#fca5a5', fontSize: 14 },
  section: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionCount: { fontSize: 12, opacity: 0.5 },
  sectionBody: {
    backgroundColor: '#141428',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.15)',
    gap: 12,
  },
  rowPressed: { backgroundColor: 'rgba(255,51,102,0.08)' },
  rowMain: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12, opacity: 0.55 },
  rowBadge: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,51,102,0.15)',
    color: '#ff6b8a',
    fontWeight: '600',
  },
  empty: {
    padding: 16,
    fontSize: 13,
    opacity: 0.5,
    textAlign: 'center',
    backgroundColor: '#141428',
    borderRadius: 12,
  },
});

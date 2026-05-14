import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { tournamentsApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';
import type { Tournament } from '@shared/api';

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function TournamentRow({ t, onPress, s }: { t: Tournament; onPress: () => void; s: Styles }) {
  const initial = t.name.charAt(0).toUpperCase();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      <View style={s.avatarPlaceholder}>
        <Text style={s.avatarLetter}>{initial}</Text>
      </View>
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={1}>{t.name}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {[formatDate(t.date), t.location].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <View style={s.rowRight}>
        {t.phase ? <Text style={s.phaseChip}>{t.phase}</Text> : null}
        {typeof t.current_round === 'number' && typeof t.total_rounds === 'number' && t.total_rounds > 0 ? (
          <Text style={s.roundChip}>R{t.current_round}/{t.total_rounds}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type StatusFilter = 'all' | 'upcoming' | 'live' | 'completed';

/** Phase string → coarse bucket so the chip filter doesn't need to enumerate
 *  every server phase. Anything we don't recognize ends up in 'live' so
 *  rounds in progress don't get filtered out by surprise. */
function bucketForPhase(phase: string | undefined | null): StatusFilter {
  const p = String(phase || '').toUpperCase();
  if (p === 'COMPLETED' || p === 'FINALIZED' || p === 'ARCHIVED') return 'completed';
  if (p === 'PENDING' || p === 'SEEDING' || p === 'UPCOMING' || p === 'DRAFT') return 'upcoming';
  return 'live';
}

export default function TournamentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { isDesktop } = useBreakpoint();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => tournamentsApi.list(),
  });

  const filtered = useMemo(() => {
    const arr = data ?? [];
    if (statusFilter === 'all') return arr;
    return arr.filter((t) => bucketForPhase(t.phase) === statusFilter);
  }, [data, statusFilter]);

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={s.heading}>Tournaments</Text>
      </View>

      {isDesktop ? (
        <View style={s.deskFilterRow}>
          {([
            { value: 'all', label: 'All' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'live', label: 'Live' },
            { value: 'completed', label: 'Completed' },
          ] as { value: StatusFilter; label: string }[]).map((f) => {
            const active = statusFilter === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => setStatusFilter(f.value)}
                style={({ pressed }) => [
                  s.deskFilterChip,
                  active && s.deskFilterChipActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text style={[s.deskFilterText, active && s.deskFilterTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error instanceof Error ? error.message : 'Failed to load tournaments'}</Text>
        </View>
      ) : isDesktop ? (
        // Desktop: 3-col card grid filtered by status chip above.
        <ScrollView
          contentContainerStyle={s.deskGrid}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.spinner} />}>
          {filtered.length === 0 ? (
            <Text style={s.empty}>
              {statusFilter === 'all' ? 'No active tournaments' : `No ${statusFilter} tournaments right now.`}
            </Text>
          ) : (
            filtered.map((item) => (
              <View key={item.id} style={s.deskCell}>
                <TournamentRow
                  s={s}
                  t={item}
                  onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: item.id } })}
                />
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TournamentRow s={s} t={item} onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: item.id } })} />
          )}
          contentContainerStyle={{ paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={() => <Text style={s.empty}>No active tournaments</Text>}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.spinner} />}
        />
      )}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  heading: { fontSize: 28, fontWeight: '800' as const, color: t.text, letterSpacing: 2 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  rowPressed: { backgroundColor: t.accentTint },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarLetter: { fontSize: 22, fontWeight: '800' as const, color: t.accent },
  rowMain: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' as const, color: t.text },
  rowMeta: { fontSize: 12, color: t.textMuted },
  rowRight: { alignItems: 'flex-end' as const, gap: 4 },
  phaseChip: {
    fontSize: 10,
    fontWeight: '800' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    color: t.textMuted,
    letterSpacing: 0.5,
  },
  roundChip: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: t.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 76 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  empty: { textAlign: 'center' as const, padding: 32, color: t.textDim },
  errorText: { color: t.danger, textAlign: 'center' as const },

  // Desktop: status filter chip row above the grid.
  deskFilterRow: {
    flexDirection: 'row' as const,
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  deskFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  deskFilterChipActive: {
    backgroundColor: t.accentTint,
    borderColor: t.accent,
  },
  deskFilterText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.5 },
  deskFilterTextActive: { color: t.accent },

  // Desktop: 3-col card grid.
  deskGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    padding: 20,
    paddingBottom: 60,
  },
  deskCell: {
    width: '32%' as const,
    minWidth: 280,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    overflow: 'hidden' as const,
  },
});

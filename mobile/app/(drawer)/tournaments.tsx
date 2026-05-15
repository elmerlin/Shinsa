import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarStack, type AvatarStackItem } from '@/components/avatar-stack';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { tournamentsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import {
  FORMAT_ICONS,
  FORMAT_LABELS,
  formatTournamentDate,
  primaryFormatKey,
  tournamentStatusColor,
  tournamentStatusLabel,
} from '@/lib/tournament-format';
import type { ThemeColors } from '@/constants/theme';
import type { Tournament } from '@shared/api';

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

type StatusFilter = 'all' | 'upcoming' | 'live' | 'completed';

/** Phase string → coarse bucket so the chip filter doesn't need to enumerate
 *  every server phase. Anything we don't recognize ends up in 'live' so
 *  rounds in progress don't get filtered out by surprise. */
function bucketForPhase(phase: string | undefined | null): StatusFilter {
  const p = String(phase || '').toUpperCase();
  if (p === 'COMPLETED' || p === 'FINALIZED' || p === 'ARCHIVED') return 'completed';
  if (p === 'PENDING' || p === 'SEEDING' || p === 'UPCOMING' || p === 'DRAFT' || p === 'SETUP') return 'upcoming';
  return 'live';
}

function TournamentCard({ t, onPress, s }: { t: Tournament; onPress: () => void; s: Styles }) {
  const initial = String(t.name || '?').charAt(0).toUpperCase();
  const avatarUrl = typeof t.avatar === 'string' && t.avatar ? fullImageUrl(t.avatar) : undefined;
  const formatKey = primaryFormatKey(t);
  const formatIcon = FORMAT_ICONS[formatKey] || '🏆';
  const formatLabel = String(t.format_summary || FORMAT_LABELS[formatKey] || 'Round Robin');
  const dateStr = formatTournamentDate(t.date);
  const statusLabel = tournamentStatusLabel(t.phase);
  const statusColors = tournamentStatusColor(t.phase);
  const phaseCount = typeof t.phase_count === 'number' ? t.phase_count : 0;
  const participantCount = typeof t.participant_count === 'number' ? t.participant_count : 0;
  const participants: AvatarStackItem[] = Array.isArray(t.participant_preview)
    ? (t.participant_preview as AvatarStackItem[])
    : [];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && s.cardPressed]}>
      {/* Row 1: avatar + title block + status pill */}
      <View style={s.cardTopRow}>
        <View style={s.cardAvatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.cardAvatar} contentFit="cover" />
          ) : (
            <View style={[s.cardAvatar, s.cardAvatarFallback]}>
              <Text style={s.cardAvatarLetter}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={s.cardTitleBlock}>
          <Text style={s.cardTitle} numberOfLines={1}>{t.name || 'Untitled tournament'}</Text>
          <View style={s.cardMetaRow}>
            <Text style={s.cardMetaIcon}>{formatIcon}</Text>
            <Text style={s.cardMetaText} numberOfLines={1}>{formatLabel}</Text>
            {dateStr ? (
              <>
                <Text style={s.cardMetaDot}>·</Text>
                <Text style={s.cardMetaText}>{dateStr}</Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={[s.statusPill, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
          <Text style={[s.statusPillText, { color: statusColors.text }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Row 2: participant stack + phase count + arrow */}
      <View style={s.cardBottomRow}>
        <AvatarStack items={participants} total={participantCount} size="sm" />
        <View style={s.cardBottomRight}>
          {phaseCount > 1 ? (
            <Text style={s.phaseCountChip}>{phaseCount} stages</Text>
          ) : null}
          <View style={s.arrowCircle}>
            <Text style={s.arrowText}>›</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
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

      <View style={s.filterRow}>
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
                s.filterChip,
                active && s.filterChipActive,
                pressed && !active && { opacity: 0.7 },
              ]}>
              <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error instanceof Error ? error.message : 'Failed to load tournaments'}</Text>
        </View>
      ) : isDesktop ? (
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
                <TournamentCard
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
          data={filtered}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TournamentCard s={s} t={item} onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: item.id } })} />
          )}
          contentContainerStyle={s.mobileList}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={() => <Text style={s.empty}>No tournaments to show</Text>}
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

  // Status filter chips above the list / grid.
  filterRow: {
    flexDirection: 'row' as const,
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexWrap: 'wrap' as const,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  filterChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  filterChipText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.5 },
  filterChipTextActive: { color: t.accent },

  mobileList: { paddingHorizontal: 14, paddingBottom: 80 },

  // Tournament card — mirrors the desktop ShowcaseCard layout: avatar +
  // title/format/date row, then participants + phase count below.
  card: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 10,
  },
  cardPressed: { backgroundColor: t.surfaceMuted },
  cardTopRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  cardAvatarWrap: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' as const },
  cardAvatar: { width: 44, height: 44, borderRadius: 12 },
  cardAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cardAvatarLetter: { fontSize: 20, fontWeight: '900' as const, color: t.accent },
  cardTitleBlock: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  cardMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, minWidth: 0 },
  cardMetaIcon: { fontSize: 11 },
  cardMetaText: { fontSize: 11, color: t.textDim, fontWeight: '600' as const, letterSpacing: 0.4, flexShrink: 1 },
  cardMetaDot: { fontSize: 11, color: t.textDim },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.6 },

  cardBottomRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  cardBottomRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  phaseCountChip: { fontSize: 11, color: t.textMuted, fontWeight: '700' as const },
  arrowCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  arrowText: { fontSize: 14, color: t.textMuted, fontWeight: '900' as const, marginTop: -2 },

  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  empty: { textAlign: 'center' as const, padding: 32, color: t.textDim, width: '100%' as const },
  errorText: { color: t.danger, textAlign: 'center' as const },

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
  },
});

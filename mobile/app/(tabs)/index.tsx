import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PumpShinsaLogo } from '@/components/pump-shinsa-logo';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { dashboardApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';
import type { Duel, Notice, Tournament } from '@shared/api';

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface RowProps {
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
}

function TournamentRow({ t, onPress, s }: { t: Tournament; onPress: () => void } & RowProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={1}>{t.name}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {[t.phase, t.location, formatDate(t.date)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {typeof t.current_round === 'number' && typeof t.total_rounds === 'number' && t.total_rounds > 0 ? (
        <Text style={s.rowBadge}>R{t.current_round}/{t.total_rounds}</Text>
      ) : null}
    </Pressable>
  );
}

function DuelRow({ d, s }: { d: Duel } & RowProps) {
  return (
    <View style={s.row}>
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={1}>{d.name || 'Untitled duel'}</Text>
        <Text style={s.rowMeta}>{formatDate(d.created_at)}</Text>
      </View>
    </View>
  );
}

function NoticeRow({ n, s }: { n: Notice } & RowProps) {
  return (
    <View style={s.row}>
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={2}>
          {n.pinned ? '📌 ' : ''}{n.title || 'Untitled notice'}
        </Text>
        {n.body ? <Text style={s.rowMeta} numberOfLines={2}>{n.body}</Text> : null}
      </View>
    </View>
  );
}

function Section({ title, count, children, empty, isEmpty, s }: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty: string;
  isEmpty: boolean;
} & RowProps) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionCount}>{count}</Text>
      </View>
      {isEmpty ? <Text style={s.empty}>{empty}</Text> : <View style={s.sectionBody}>{children}</View>}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
  });

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.spinner} />}>
        <View style={s.brand}>
          <PumpShinsaLogo variant="horizontal" size={44} />
        </View>

        {isLoading && (
          <View style={s.center}>
            <ActivityIndicator color={theme.spinner} />
          </View>
        )}

        {isError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error instanceof Error ? error.message : 'Failed to load dashboard'}</Text>
          </View>
        )}

        {data && (
          <>
            <Section
              s={s}
              title="Tournaments"
              count={data.tournaments.length}
              empty="No active tournaments"
              isEmpty={data.tournaments.length === 0}>
              {data.tournaments.slice(0, 10).map((t) => (
                <TournamentRow
                  key={t.id}
                  t={t}
                  s={s}
                  onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: t.id } })}
                />
              ))}
            </Section>
            <Section
              s={s}
              title="Recent duels"
              count={data.duels.length}
              empty="No recent duels"
              isEmpty={data.duels.length === 0}>
              {data.duels.slice(0, 10).map((d) => <DuelRow key={d.id} d={d} s={s} />)}
            </Section>
            <Section
              s={s}
              title="Notices"
              count={data.notices.length}
              empty="No notices"
              isEmpty={data.notices.length === 0}>
              {data.notices.slice(0, 10).map((n) => <NoticeRow key={String(n.id)} n={n} s={s} />)}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 80, gap: 24 },
  brand: { alignItems: 'center' as const, marginBottom: 8 },
  center: { padding: 32, alignItems: 'center' as const },
  errorBox: {
    backgroundColor: t.dangerBg,
    borderColor: t.dangerBorder,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: t.danger, fontSize: 14 },
  section: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' as const, color: t.text },
  sectionCount: { fontSize: 12, color: t.textDim },
  sectionBody: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  rowPressed: { backgroundColor: t.accentTint },
  rowMain: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' as const, color: t.text },
  rowMeta: { fontSize: 12, color: t.textMuted },
  rowBadge: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: t.accentTint,
    color: t.accent,
    fontWeight: '700' as const,
  },
  empty: {
    padding: 16,
    fontSize: 13,
    color: t.textDim,
    textAlign: 'center' as const,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
});

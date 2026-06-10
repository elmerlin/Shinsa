import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/top-bar';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fridgeApi } from '@/lib/api';
import type { FridgeItem, FridgeTabEntry } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

function pounds(pence: number): string {
  return `£${(Math.round(pence) / 100).toFixed(2)}`;
}

function formatWhen(raw?: string | null): string {
  if (!raw) return '';
  const norm = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(/(?:z|[+-]\d{2}:?\d{2})$/i.test(norm) ? norm : `${norm}Z`);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

export default function FridgeScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ payment?: string }>();

  const itemsQuery = useQuery({
    queryKey: ['fridge-items'],
    queryFn: () => fridgeApi.items(),
    staleTime: 5 * 60_000,
  });
  const tabQuery = useQuery({
    queryKey: ['fridge-tab'],
    queryFn: () => fridgeApi.tab(),
  });

  const refreshTab = () => queryClient.invalidateQueries({ queryKey: ['fridge-tab'] });

  const addMutation = useMutation({
    mutationFn: (itemId: number) => fridgeApi.addToTab(itemId),
    onSuccess: refreshTab,
  });
  const removeMutation = useMutation({
    mutationFn: (entryId: number) => fridgeApi.removeEntry(entryId),
    onSuccess: refreshTab,
  });
  const settleMutation = useMutation({
    mutationFn: () => fridgeApi.settle(),
    onSuccess: async (data) => {
      refreshTab();
      if (data.checkout_url) {
        if (Platform.OS === 'web') {
          (globalThis as { open?: (u: string, t: string) => void }).open?.(data.checkout_url, '_blank');
        } else {
          await Linking.openURL(data.checkout_url);
        }
      }
    },
  });
  const reconcileMutation = useMutation({
    mutationFn: () => fridgeApi.reconcile(),
    onSuccess: refreshTab,
  });

  // Returning from Square checkout (?payment=success) or any focus on a tab
  // with a pending settle → ask the server to verify against Square.
  const settling = !!tabQuery.data?.settling;
  useEffect(() => {
    if (params.payment === 'success' || settling) reconcileMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.payment, settling]);

  const items = itemsQuery.data?.items ?? [];
  const squareEnabled = !!itemsQuery.data?.square_enabled;
  const tab = tabQuery.data;
  const entries = tab?.entries ?? [];
  const total = tab?.total_pence ?? 0;
  const history = tabQuery.data?.history ?? [];

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar />
      </View>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={tabQuery.isRefetching}
            onRefresh={() => { refreshTab(); reconcileMutation.mutate(); }}
            tintColor={theme.accent}
          />
        }>
        <Text style={s.eyebrow}>DOJO FRIDGE</Text>
        <Text style={s.heading}>Grab it, tap it, settle later</Text>
        <Text style={s.sub}>
          Honor system: tap what you take and it goes on your tab. Settle whenever you like —
          one Square checkout for the whole tab. (Walk-ins: piggy bank on the fridge.)
        </Text>

        {/* Items */}
        {itemsQuery.isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.accent} /></View>
        ) : (
          <View style={s.itemsGrid}>
            {items.map((item: FridgeItem) => (
              <Pressable
                key={item.id}
                onPress={() => addMutation.mutate(item.id)}
                disabled={addMutation.isPending}
                style={({ pressed }) => [s.itemCard, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}>
                <Text style={s.itemEmoji}>{item.emoji || '🧊'}</Text>
                <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={s.itemPrice}>{pounds(item.price_pence)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Tab */}
        <View style={s.tabCard}>
          <View style={s.tabHead}>
            <Text style={s.tabTitle}>Your tab</Text>
            <Text style={s.tabTotal}>{pounds(total)}</Text>
          </View>

          {entries.length === 0 ? (
            <Text style={s.tabEmpty}>Nothing on your tab — tap an item above when you grab one.</Text>
          ) : (
            <View style={s.entryList}>
              {entries.map((e: FridgeTabEntry) => (
                <View key={e.id} style={s.entryRow}>
                  <Text style={s.entryEmoji}>{e.emoji || '🧊'}</Text>
                  <View style={s.entryMain}>
                    <Text style={s.entryName} numberOfLines={1}>
                      {e.item_name}{e.qty > 1 ? ` ×${e.qty}` : ''}
                    </Text>
                    <Text style={s.entryWhen}>{formatWhen(e.created_at)}</Text>
                  </View>
                  <Text style={s.entryPrice}>{pounds(e.price_pence * e.qty)}</Text>
                  {e.settling_payment_id == null ? (
                    <Pressable
                      onPress={() => removeMutation.mutate(e.id)}
                      hitSlop={8}
                      accessibilityLabel="Remove"
                      style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.6 }]}>
                      <Text style={s.removeBtnText}>✕</Text>
                    </Pressable>
                  ) : (
                    <Text style={s.settlingTag}>settling…</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {total > 0 ? (
            settling ? (
              <View style={s.settlingNote}>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={s.settlingNoteText}>
                  Checkout in progress — finish paying in the Square tab, then pull to refresh.
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => settleMutation.mutate()}
                disabled={settleMutation.isPending || !squareEnabled}
                style={({ pressed }) => [s.settleBtn, (pressed || settleMutation.isPending) && { opacity: 0.7 }]}>
                {settleMutation.isPending ? (
                  <ActivityIndicator size="small" color="#0b0d12" />
                ) : (
                  <Text style={s.settleBtnText}>Settle {pounds(total)} with Square</Text>
                )}
              </Pressable>
            )
          ) : null}
          {settleMutation.isError ? (
            <Text style={s.errText}>
              {settleMutation.error instanceof Error ? settleMutation.error.message : 'Could not start checkout'}
            </Text>
          ) : null}
        </View>

        {/* History */}
        {history.length > 0 ? (
          <View style={s.historyWrap}>
            <Text style={s.historyTitle}>SETTLED</Text>
            {history.map((h) => (
              <View key={h.id} style={s.historyRow}>
                <Text style={s.historyWhen}>{formatWhen(h.paid_at || h.created_at)}</Text>
                <Text style={s.historyAmount}>{pounds(h.amount_pence)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  scroll: { padding: 16, gap: 10 },
  eyebrow: { fontSize: 13, fontWeight: '800' as const, letterSpacing: 2, color: t.accent, textTransform: 'uppercase' as const },
  heading: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  sub: { fontSize: 13, color: t.textMuted, lineHeight: 19, marginBottom: 6 },
  center: { paddingVertical: 32, alignItems: 'center' as const },

  itemsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  itemCard: {
    flexGrow: 1,
    flexBasis: '30%' as const,
    minWidth: 100,
    alignItems: 'center' as const,
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  itemEmoji: { fontSize: 28 },
  itemName: { fontSize: 12, fontWeight: '700' as const, color: t.text, textAlign: 'center' as const },
  itemPrice: { fontSize: 13, fontWeight: '900' as const, color: t.accent, fontVariant: ['tabular-nums' as const] },

  tabCard: {
    marginTop: 6,
    backgroundColor: t.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 12,
  },
  tabHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  tabTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  tabTotal: { fontSize: 22, fontWeight: '900' as const, color: t.accent, fontVariant: ['tabular-nums' as const] },
  tabEmpty: { fontSize: 13, color: t.textMuted, lineHeight: 18 },

  entryList: { gap: 8 },
  entryRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  entryEmoji: { fontSize: 18 },
  entryMain: { flex: 1, minWidth: 0 },
  entryName: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  entryWhen: { fontSize: 11, color: t.textDim },
  entryPrice: { fontSize: 13, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.surfaceMuted,
  },
  removeBtnText: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  settlingTag: { fontSize: 10, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.4 },

  settleBtn: {
    backgroundColor: t.accent,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  settleBtnText: { color: t.textOnAccent, fontSize: 15, fontWeight: '900' as const, letterSpacing: 0.3 },
  settlingNote: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  settlingNoteText: { flex: 1, fontSize: 12, color: t.textMuted, lineHeight: 17 },
  errText: { fontSize: 12, color: '#fda4af' },

  historyWrap: { marginTop: 8, gap: 6 },
  historyTitle: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.5, color: t.textDim },
  historyRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  historyWhen: { fontSize: 12, color: t.textMuted },
  historyAmount: { fontSize: 12, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
});

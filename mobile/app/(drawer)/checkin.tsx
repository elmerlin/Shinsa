import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MachineCabinet } from '@/components/checkin/machine-cabinet';
import { useCheckinProximity } from '@/hooks/use-checkin-proximity';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useTheme } from '@/contexts/theme-context';
import { checkinsApi } from '@/lib/api';
import { getCheckinClientSessionId } from '@/lib/checkin-session';
import type { ThemeColors } from '@/constants/theme';
import type {
  ActiveCheckin,
  CheckinHistoryItem,
  CheckinHistoryStats,
  MyCheckin,
  MyVenueAccess,
  Venue,
  VenueMachine,
} from '@shared/api';

type Tab = 'live' | 'access' | 'history';

const TABS: { value: Tab; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'access', label: 'Access' },
  { value: 'history', label: 'My History' },
];

const MEMBERSHIP_PURCHASE_URL = 'https://pumpshinsa.com/membership';

function fmtTimeAgo(input?: string | null): string {
  if (!input) return '';
  const t = new Date(String(input).includes('T') ? input : `${input.replace(' ', 'T')}Z`).getTime();
  if (!Number.isFinite(t)) return '';
  const minutes = Math.floor((Date.now() - t) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return new Date(t).toLocaleDateString();
}

function fmtDuration(start?: string, end?: string | null): string {
  if (!start) return '—';
  const a = new Date(String(start).includes('T') ? start : `${start.replace(' ', 'T')}Z`).getTime();
  const b = end
    ? new Date(String(end).includes('T') ? end : `${end.replace(' ', 'T')}Z`).getTime()
    : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '—';
  const mins = Math.max(0, Math.floor((b - a) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtCheckinDate(input?: string): string {
  if (!input) return '';
  const d = new Date(String(input).includes('T') ? input : `${input.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CheckinScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const router = useRouter();
  // QR / deep-link params: a URL like
  //   shinsa://checkin?venue=london-pump-dojo&machine=1
  //   https://new.pumpshinsa.com/checkin?venue=...&machine=...
  // arrives here. We resolve the machine after the venues query lands,
  // then auto-open the confirm modal. Modal is the same one used for
  // taps — gives the user a chance to back out if the QR was wrong.
  const params = useLocalSearchParams<{ venue?: string; machine?: string }>();
  const qrVenueSlug = String(params.venue || '').trim();
  const qrMachineHint = String(params.machine || '').trim();
  const [tab, setTab] = useState<Tab>('live');
  // Pending machine ID is set when the user taps a machine but hasn't
  // confirmed the swap. We resolve it back to the full machine object in
  // the modal so we can show the name + warn if it's a switch.
  const [pendingMachineId, setPendingMachineId] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['checkin-status'],
    queryFn: () => checkinsApi.myStatus(),
    refetchInterval: 30_000,
  });
  const venuesQuery = useQuery({
    queryKey: ['checkin-venues'],
    queryFn: () => checkinsApi.venues(),
    staleTime: 5 * 60_000,
  });

  // Auto-pick first venue for v1 — multi-venue picker can land later.
  // The desktop client does the same thing for the dojo today.
  const activeVenue: Venue | null = useMemo(() => {
    const list = venuesQuery.data || [];
    const checkedInSlug = statusQuery.data?.checkin?.venue_slug;
    if (checkedInSlug) {
      const match = list.find((v) => v.slug === checkedInSlug);
      if (match) return match;
    }
    return list[0] ?? null;
  }, [venuesQuery.data, statusQuery.data?.checkin?.venue_slug]);
  const venueSlug = activeVenue?.slug || '';

  const activeQuery = useQuery({
    queryKey: ['checkin-active', venueSlug],
    queryFn: () => checkinsApi.activeCheckins(venueSlug),
    enabled: !!venueSlug && tab === 'live',
    refetchInterval: tab === 'live' ? 15_000 : false,
  });

  const checkedIn = !!statusQuery.data?.checked_in;
  const myCheckin = statusQuery.data?.checkin ?? null;

  // Drive the foreground GPS ping loop. Hook is a no-op while !checkedIn,
  // so we can leave it mounted with `enabled` driving the cadence.
  useCheckinProximity({ enabled: checkedIn });

  const checkinMutation = useMutation({
    mutationFn: async ({ machine }: { machine: VenueMachine }) => {
      if (!activeVenue) throw new Error('No venue selected');
      const perm = await Location.requestForegroundPermissionsAsync();
      // Permission is OPTIONAL — server can still register the check-in,
      // it just won't auto-close on departure without proximity pings.
      // Don't block the user.
      void perm;
      const clientSessionId = await getCheckinClientSessionId();
      return checkinsApi.checkin({
        venue_id: activeVenue.id,
        machine_id: machine.id,
        client_session_id: clientSessionId,
      });
    },
    onSuccess: () => {
      setPendingMachineId(null);
      queryClient.invalidateQueries({ queryKey: ['checkin-status'] });
      queryClient.invalidateQueries({ queryKey: ['checkin-active', venueSlug] });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: () => checkinsApi.checkout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkin-status'] });
      queryClient.invalidateQueries({ queryKey: ['checkin-active', venueSlug] });
    },
  });

  const onPickMachine = useCallback((machine: VenueMachine) => {
    // Tapping the machine you're already checked into is a silent no-op,
    // matching the desktop's behavior — no modal, no flicker.
    if (checkedIn && myCheckin?.machine_id === machine.id) return;
    setPendingMachineId(machine.id);
  }, [checkedIn, myCheckin?.machine_id]);

  const pendingMachine = useMemo(
    () => activeVenue?.machines.find((m) => m.id === pendingMachineId) ?? null,
    [activeVenue?.machines, pendingMachineId],
  );

  // ── QR / deep-link auto-checkin ──────────────────────────────────────
  // Run once per param set after venues + status load. Match by
  // position then by name substring (same fallback the desktop uses).
  // If the user is already checked in to that exact machine, do
  // nothing; otherwise pre-fill the confirm modal so the user can
  // approve or cancel.
  const qrHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!qrVenueSlug || !qrMachineHint) return;
    if (!venuesQuery.data || !statusQuery.data) return;
    const key = `${qrVenueSlug}|${qrMachineHint}`;
    if (qrHandledRef.current === key) return;
    const venue = venuesQuery.data.find((v) => v.slug === qrVenueSlug);
    if (!venue) return;
    const hint = qrMachineHint.toLowerCase();
    const machine = venue.machines.find((m) => {
      if (String(m.position ?? '') === qrMachineHint) return true;
      return m.name.toLowerCase().includes(hint);
    });
    if (!machine) return;
    qrHandledRef.current = key;
    // Strip the params so a hot-reload / back-nav doesn't re-trigger.
    router.setParams({ venue: undefined, machine: undefined });
    // Already on that machine → silently surface the Live tab so the
    // user lands on their own session. Otherwise pre-open the modal.
    if (statusQuery.data.checked_in && statusQuery.data.checkin?.machine_id === machine.id) {
      setTab('live');
      return;
    }
    setTab('live');
    setPendingMachineId(machine.id);
  }, [qrVenueSlug, qrMachineHint, venuesQuery.data, statusQuery.data, router]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Check In</Text>
        {checkedIn ? (
          <Pressable
            onPress={() => checkoutMutation.mutate()}
            disabled={checkoutMutation.isPending}
            style={({ pressed }) => [
              s.checkoutBtn,
              checkoutMutation.isPending && { opacity: 0.5 },
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={s.checkoutBtnText}>
              {checkoutMutation.isPending ? 'Checking out…' : 'Check out'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {checkedIn && myCheckin ? <ActiveBanner s={s} checkin={myCheckin} /> : null}

      <View style={s.tabRow}>
        {TABS.map((t) => {
          const active = t.value === tab;
          return (
            <Pressable
              key={t.value}
              onPress={() => setTab(t.value)}
              style={({ pressed }) => [
                s.tabBtn,
                active && s.tabBtnActive,
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[s.tabBtnText, active && s.tabBtnTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'live' ? (
        <LiveTab
          s={s}
          theme={theme}
          venue={activeVenue}
          venuesLoading={venuesQuery.isLoading}
          venuesError={venuesQuery.error}
          machines={activeVenue?.machines ?? []}
          activeCheckins={activeQuery.data?.activeCheckins ?? []}
          activeLoading={activeQuery.isLoading}
          checkedIn={checkedIn}
          myCheckinMachineId={myCheckin?.machine_id ?? null}
          onPickMachine={onPickMachine}
        />
      ) : tab === 'access' ? (
        <AccessTab s={s} theme={theme} venueSlug={venueSlug} />
      ) : (
        <HistoryTab s={s} theme={theme} />
      )}

      <ConfirmCheckinModal
        s={s}
        theme={theme}
        machine={pendingMachine}
        currentMachineId={myCheckin?.machine_id ?? null}
        currentMachineName={myCheckin?.machine_name ?? null}
        loading={checkinMutation.isPending}
        error={checkinMutation.error}
        onCancel={() => setPendingMachineId(null)}
        onConfirm={() => {
          if (pendingMachine) checkinMutation.mutate({ machine: pendingMachine });
        }}
      />
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Active banner — shown while the user is checked in. Compact green pill
// pattern from the desktop landing strip but condensed for mobile width.
// ───────────────────────────────────────────────────────────────────────
function ActiveBanner({ s, checkin }: { s: Styles; checkin: MyCheckin }) {
  return (
    <View style={s.activeBanner}>
      <View style={s.activeDot} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.activeTitle}>At {checkin.machine_name}</Text>
        <Text style={s.activeSub}>
          {checkin.venue_name} · since {fmtTimeAgo(checkin.checked_in_at)}
        </Text>
      </View>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Live tab — venue header, current players, machine grid.
// ───────────────────────────────────────────────────────────────────────
function LiveTab({
  s,
  theme,
  venue,
  venuesLoading,
  venuesError,
  machines,
  activeCheckins,
  activeLoading,
  checkedIn,
  myCheckinMachineId,
  onPickMachine,
}: {
  s: Styles;
  theme: ThemeColors;
  venue: Venue | null;
  venuesLoading: boolean;
  venuesError: unknown;
  machines: VenueMachine[];
  activeCheckins: ActiveCheckin[];
  activeLoading: boolean;
  checkedIn: boolean;
  myCheckinMachineId: string | null;
  onPickMachine: (m: VenueMachine) => void;
}) {
  // Group active checkins by machine so each cell can stack the avatars
  // of everyone currently playing there.
  const byMachine = useMemo(() => {
    const map = new Map<string, ActiveCheckin[]>();
    for (const c of activeCheckins) {
      const arr = map.get(c.machine_id) ?? [];
      arr.push(c);
      map.set(c.machine_id, arr);
    }
    return map;
  }, [activeCheckins]);

  if (venuesLoading) {
    return (
      <View style={s.centerFill}>
        <ActivityIndicator color={theme.spinner} />
      </View>
    );
  }
  if (venuesError || !venue) {
    return (
      <Text style={s.empty}>
        {venuesError instanceof Error ? venuesError.message : 'No venues configured.'}
      </Text>
    );
  }

  // Sort machines by position (then sort_order, then name) so the layout
  // matches the physical room ordering the desktop's RoomLayout uses.
  const sortedMachines = [...machines].sort((a, b) => {
    const pa = a.position ?? a.sort_order ?? 0;
    const pb = b.position ?? b.sort_order ?? 0;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <View style={s.venueCard}>
        <View style={s.venueHeader}>
          <View style={[s.activeDot, { width: 8, height: 8 }]} />
          <Text style={s.venueName}>{venue.name}</Text>
        </View>
        <Text style={s.venueSub}>
          {activeLoading ? 'Loading…' : `${activeCheckins.length} player${activeCheckins.length === 1 ? '' : 's'} here`}
        </Text>
      </View>

      {!checkedIn ? (
        <Text style={s.hint}>Tap a machine to check in.</Text>
      ) : null}

      <View style={s.machineGrid}>
        {sortedMachines.map((m) => {
          const players = byMachine.get(m.id) ?? [];
          const mine = checkedIn && m.id === myCheckinMachineId;
          return (
            <Pressable
              key={m.id}
              onPress={() => onPickMachine(m)}
              style={({ pressed }) => [s.cabSlot, pressed && { opacity: 0.85 }]}>
              <MachineCabinet name={m.name} players={players} mine={mine} />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Access tab — read-only membership status, with a deep link out to the
// web purchase flow. Mobile doesn't carry the Stripe SDK this round.
// ───────────────────────────────────────────────────────────────────────
function AccessTab({
  s,
  theme,
  venueSlug,
}: {
  s: Styles;
  theme: ThemeColors;
  venueSlug: string;
}) {
  const query = useQuery({
    queryKey: ['venue-access', venueSlug],
    queryFn: () => checkinsApi.myVenueAccess(venueSlug),
    enabled: !!venueSlug,
  });

  if (query.isLoading) {
    return (
      <View style={s.centerFill}>
        <ActivityIndicator color={theme.spinner} />
      </View>
    );
  }
  if (query.error || !query.data) {
    return (
      <Text style={s.empty}>
        {query.error instanceof Error ? query.error.message : 'Membership info unavailable.'}
      </Text>
    );
  }

  const access: MyVenueAccess = query.data;
  const openPurchase = () => {
    void Linking.openURL(MEMBERSHIP_PURCHASE_URL);
  };

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <View style={[s.accessCard, access.has_access ? s.accessCardOn : s.accessCardOff]}>
        <Text style={s.accessTitle}>
          {access.has_access ? 'Active access' : 'No active access'}
        </Text>
        {access.subscription ? (
          <Text style={s.accessSub}>
            {access.subscription.plan_name} · {access.subscription.subscription_cadence_label} ·
            {' '}renews {access.subscription.current_period_end}
          </Text>
        ) : null}
        {!access.subscription && access.day_passes.length > 0 ? (
          <Text style={s.accessSub}>
            {access.day_passes.length} day pass{access.day_passes.length === 1 ? '' : 'es'}
          </Text>
        ) : null}
      </View>

      {access.day_passes.length > 0 ? (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Day passes</Text>
          {access.day_passes.map((p) => (
            <View key={p.id} style={s.row}>
              <Text style={s.rowMain}>{p.pass_date}</Text>
              <Text style={[s.rowMeta, p.status === 'active' ? s.statusOn : s.statusOff]}>
                {p.status.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {access.discounts.length > 0 ? (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Discounts</Text>
          {access.discounts.map((d, i) => (
            <View key={i} style={s.row}>
              <Text style={s.rowMain}>{d.discount_percent}% off {d.applies_to}</Text>
              {d.note ? <Text style={s.rowMeta}>{d.note}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={openPurchase}
        style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}>
        <Text style={s.primaryBtnText}>Manage on web</Text>
      </Pressable>
      <Text style={s.hintMuted}>
        Day passes and subscriptions are purchased on pumpshinsa.com for now.
      </Text>
    </ScrollView>
  );
}

// ───────────────────────────────────────────────────────────────────────
// History tab — stats cards + recent session list.
// ───────────────────────────────────────────────────────────────────────
function HistoryTab({ s, theme }: { s: Styles; theme: ThemeColors }) {
  const query = useQuery({
    queryKey: ['checkin-history'],
    queryFn: () => checkinsApi.history(),
  });
  if (query.isLoading) {
    return (
      <View style={s.centerFill}>
        <ActivityIndicator color={theme.spinner} />
      </View>
    );
  }
  if (query.error || !query.data) {
    return (
      <Text style={s.empty}>
        {query.error instanceof Error ? query.error.message : 'History unavailable.'}
      </Text>
    );
  }
  const stats: CheckinHistoryStats = query.data.stats;
  const sessions: CheckinHistoryItem[] = query.data.checkins;
  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <View style={s.statsGrid}>
        <StatCard s={s} label="Total sessions" value={String(stats.total_sessions)} />
        <StatCard s={s} label="Total hours" value={stats.total_hours.toFixed(1)} />
        <StatCard s={s} label="This week" value={`${stats.week_sessions} · ${stats.week_hours.toFixed(1)}h`} />
        <StatCard s={s} label="This month" value={`${stats.month_sessions} · ${stats.month_hours.toFixed(1)}h`} />
      </View>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Recent sessions</Text>
        {sessions.length === 0 ? (
          <Text style={s.empty}>No sessions yet.</Text>
        ) : (
          sessions.map((c) => (
            <View key={c.id} style={s.historyRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowMain} numberOfLines={1}>{c.machine_name}</Text>
                <Text style={s.rowMeta} numberOfLines={1}>
                  {c.venue_name} · {fmtCheckinDate(c.checked_in_at)}
                </Text>
              </View>
              <Text style={s.duration}>{fmtDuration(c.checked_in_at, c.checked_out_at)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ s, label, value }: { s: Styles; label: string; value: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Confirm modal — appears when the user taps a machine. Shows a switch
// warning when there's an existing checkin on a different machine.
// ───────────────────────────────────────────────────────────────────────
function ConfirmCheckinModal({
  s,
  theme,
  machine,
  currentMachineId,
  currentMachineName,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  s: Styles;
  theme: ThemeColors;
  machine: VenueMachine | null;
  currentMachineId: string | null;
  currentMachineName: string | null;
  loading: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const visible = !!machine;
  const switching = !!currentMachineId && currentMachineId !== machine?.id;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Check in</Text>
          {machine ? (
            <Text style={s.modalBody}>You&apos;ll be checked in at {machine.name}.</Text>
          ) : null}
          {switching ? (
            <View style={s.switchWarn}>
              <Text style={s.switchWarnText}>
                Active session found — this will check you out from {currentMachineName} first.
              </Text>
            </View>
          ) : null}
          {error ? (
            <Text style={s.modalError}>
              {error instanceof Error ? error.message : 'Check-in failed.'}
            </Text>
          ) : null}
          <View style={s.modalActions}>
            <Pressable
              onPress={onCancel}
              disabled={loading}
              style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.7 }]}>
              <Text style={s.modalBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={loading}
              style={({ pressed }) => [
                s.modalBtn,
                s.modalBtnPrimary,
                loading && { opacity: 0.6 },
                pressed && { opacity: 0.85 },
              ]}>
              {loading ? (
                <ActivityIndicator color={theme.bg} size="small" />
              ) : (
                <Text style={[s.modalBtnText, s.modalBtnTextPrimary]}>Confirm</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  checkoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: t.danger,
  },
  checkoutBtnText: { fontSize: 13, fontWeight: '900' as const, color: '#000' },

  activeBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6ee7b7' },
  activeTitle: { fontSize: 14, fontWeight: '900' as const, color: '#a7f3d0' },
  activeSub: { fontSize: 11, color: 'rgba(167, 243, 208, 0.85)' },

  tabRow: {
    flexDirection: 'row' as const,
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  tabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.bg,
  },
  tabBtnActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  tabBtnText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.4 },
  tabBtnTextActive: { color: t.accent },

  tabContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  centerFill: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 40 },
  empty: { padding: 24, textAlign: 'center' as const, color: t.textDim, fontSize: 12 },
  hint: { fontSize: 11, color: t.textMuted, marginBottom: -2 },
  hintMuted: { fontSize: 11, color: t.textDim, marginTop: 6, textAlign: 'center' as const },

  venueCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: 4,
  },
  venueHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  venueName: { fontSize: 16, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  venueSub: { fontSize: 12, color: t.textMuted, marginLeft: 16 },

  // On mobile the grid is two columns of cabinets; on the desktop web
  // layout we'd otherwise let them stretch to half the content area
  // (700+ px each), so the row caps its overall width and the cabinets
  // cap their individual width too. They end up around 160 px on phones,
  // 180 px on the desktop layout — close to a real cabinet's silhouette.
  machineGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    maxWidth: 420,
    alignSelf: 'flex-start' as const,
  },
  cabSlot: {
    flexBasis: '48%' as const,
    flexGrow: 0,
    maxWidth: 200,
    minWidth: 130,
  },

  // Access tab
  accessCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  accessCardOn: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(110, 231, 183, 0.4)',
  },
  accessCardOff: {
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    borderColor: 'rgba(234, 179, 8, 0.35)',
  },
  accessTitle: { fontSize: 15, fontWeight: '900' as const, color: t.text },
  accessSub: { marginTop: 4, fontSize: 12, color: t.textMuted },

  section: { gap: 6 },
  sectionLabel: {
    fontSize: 10, fontWeight: '900' as const, color: t.textMuted, letterSpacing: 1.4,
    textTransform: 'uppercase' as const, marginTop: 6,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  rowMain: { fontSize: 13, color: t.text, fontWeight: '700' as const },
  rowMeta: { fontSize: 11, color: t.textMuted },
  statusOn: { color: '#6ee7b7', fontWeight: '900' as const },
  statusOff: { color: t.textDim, fontWeight: '900' as const },

  primaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '900' as const, color: '#000', letterSpacing: 0.3 },

  // History tab
  statsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  statCard: {
    flexBasis: '48%' as const, flexGrow: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  statValue: { fontSize: 18, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statLabel: { marginTop: 2, fontSize: 10, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  historyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  duration: { fontSize: 12, color: t.text, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: 24 },
  modalCard: {
    width: '100%' as const,
    maxWidth: 380,
    padding: 18,
    borderRadius: 14,
    backgroundColor: t.bg,
    borderWidth: 1,
    borderColor: t.border,
    gap: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '900' as const, color: t.text },
  modalBody: { fontSize: 13, color: t.text },
  switchWarn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.35)',
  },
  switchWarnText: { fontSize: 12, color: '#fbbf24' },
  modalError: { fontSize: 12, color: t.danger },
  modalActions: { flexDirection: 'row' as const, gap: 8, marginTop: 6 },
  modalBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center' as const,
    backgroundColor: t.surfaceMuted,
  },
  modalBtnPrimary: { backgroundColor: t.accent },
  modalBtnText: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  modalBtnTextPrimary: { color: '#000' },
});

/**
 * Bell-icon dropdown tray. Mirrors the web `NotificationBell` panel
 * (client/src/App.jsx#L201) — list of recent notifications with a tap-
 * to-mark-read + tap-to-navigate flow, dismiss (×) per row, "Mark all
 * read" header action, an "Enable push" CTA when the PWA is missing
 * its push subscription, and a pending-invitations banner.
 *
 * Renders as a Modal anchored to the top-right (desktop) or as a
 * full-width sheet (mobile). Tap-outside on the backdrop closes.
 */
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebPush } from '@/hooks/use-web-push';
import { authApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';
import type { NotificationItem } from '@shared/api';

const NOTIFS_KEY = ['notifications-badge'] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Used to expand the visible notif badge cache key when a tray
   *  action mutates it. The TopBar sets the same cache key. */
  userId?: string | null;
}

/** Pretty timeAgo — same shape as the feed's. Notifications are stored
 *  as UTC strings without a 'Z' suffix server-side, hence the manual
 *  append. Mirrors the web's `new Date(n.created_at + 'Z')`. */
function timeAgo(input: string | undefined): string {
  if (!input) return '';
  const isoish = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(input) ? input : `${input}Z`;
  const t = new Date(isoish.replace(' ', 'T')).getTime();
  if (!Number.isFinite(t)) return input;
  const ms = Date.now() - t;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(isoish.replace(' ', 'T')).toLocaleDateString();
}

export function NotificationTray({ visible, onClose, userId }: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { isDesktop } = useBreakpoint();
  const queryClient = useQueryClient();
  const push = useWebPush();

  // Pull the same notifications cache the badge uses so they stay in
  // sync (badge count drops as soon as you mark something read).
  const cacheKey = [NOTIFS_KEY[0], userId ?? user?.id ?? null] as const;
  const notifQuery = useQuery({
    queryKey: cacheKey,
    queryFn: () => authApi.getNotifications(),
    enabled: !!user && visible,
    staleTime: 10_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string | number) => authApi.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cacheKey }),
  });
  const markAllRead = useMutation({
    mutationFn: () => authApi.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cacheKey }),
  });
  const dismissOne = useMutation({
    mutationFn: (id: string | number) => authApi.dismissNotification(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cacheKey }),
  });

  const data = notifQuery.data;
  const notifications = data?.notifications ?? [];
  const unread = Number(data?.unread_count) || 0;
  const invitations = Number(data?.invitation_count) || 0;
  const pushNeedsAction = push.status.supported && !push.status.active;

  const handleNotifTap = (n: NotificationItem) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) {
      onClose();
      // Server links are app-relative paths like `/profile/abc`. Push
      // straight onto the router stack.
      router.push(n.link as never);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close notifications">
        {/* Stop the inner card from bubbling up its press to the
            backdrop. The wrapper here intentionally swallows touch. */}
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={[s.tray, isDesktop ? s.trayDesktop : s.trayMobile]}>
          <View style={s.header}>
            <Text style={s.headerTitle}>Notifications</Text>
            <View style={s.headerActions}>
              {pushNeedsAction ? (
                <Pressable
                  onPress={() => push.enable()}
                  hitSlop={6}
                  disabled={push.status.syncing}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                  <Text style={[s.headerLink, push.status.syncing && { opacity: 0.5 }]}>
                    {push.status.syncing ? 'Refreshing…' : 'Enable push'}
                  </Text>
                </Pressable>
              ) : null}
              {unread > 0 ? (
                <Pressable
                  onPress={() => markAllRead.mutate()}
                  hitSlop={6}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                  <Text style={s.headerLink}>Mark all read</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                <IconSymbol name="xmark" size={14} color={theme.textMuted} />
              </Pressable>
            </View>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner}>
            {invitations > 0 ? (
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/account');
                }}
                style={({ pressed }) => [s.inviteRow, pressed && { opacity: 0.85 }]}>
                <Text style={s.inviteIcon}>✉</Text>
                <Text style={s.inviteText}>
                  {invitations} pending invitation{invitations === 1 ? '' : 's'}
                </Text>
              </Pressable>
            ) : null}

            {notifQuery.isLoading ? (
              <View style={s.empty}>
                <ActivityIndicator color={theme.spinner} />
              </View>
            ) : notifications.length === 0 && invitations === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>🔔</Text>
                <Text style={s.emptyTitle}>You're all caught up</Text>
                <Text style={s.emptyBody}>
                  Pumps, comments, and follows from people you interact with land here.
                </Text>
              </View>
            ) : (
              notifications.map((n) => (
                <Pressable
                  key={String(n.id)}
                  onPress={() => handleNotifTap(n)}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    s.row,
                    !n.read && s.rowUnread,
                    hovered && { backgroundColor: theme.surfaceMuted },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <View style={[s.dot, !n.read ? { backgroundColor: theme.accent } : null]} />
                  <View style={s.rowMain}>
                    <Text style={s.rowTitle} numberOfLines={2}>{n.title}</Text>
                    {n.message ? (
                      <Text style={s.rowMessage} numberOfLines={2}>{n.message}</Text>
                    ) : null}
                    <Text style={s.rowTime}>{timeAgo(n.created_at)}</Text>
                  </View>
                  <Pressable
                    onPress={(e) => {
                      // Stop bubbling so the row's onPress doesn't fire too.
                      e.stopPropagation?.();
                      dismissOne.mutate(n.id);
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [s.dismiss, pressed && { opacity: 0.5 }]}
                    accessibilityLabel="Dismiss notification">
                    <IconSymbol name="xmark" size={11} color={theme.textDim} />
                  </Pressable>
                </Pressable>
              ))
            )}
          </ScrollView>

          <View style={s.footer}>
            <Pressable
              onPress={() => {
                onClose();
                router.push('/account');
              }}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
              <Text style={s.footerLink}>Notification settings →</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    // Desktop anchors top-right (next to where the bell sits in the
    // page chrome); mobile anchors top-stretch so the tray spans the
    // viewport like a notification panel.
    alignItems: 'flex-end' as const,
    justifyContent: 'flex-start' as const,
    padding: 12,
  },
  tray: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.5, shadowRadius: 24 },
      android: { elevation: 12 },
      default: { boxShadow: '0 16px 48px -12px rgba(0,0,0,0.55)' as unknown as undefined },
    }),
  },
  trayDesktop: {
    width: 360,
    maxHeight: 520,
    marginTop: 56, // sit just below the page-chrome bar
    marginRight: 24,
  },
  trayMobile: {
    width: '92%' as const,
    maxHeight: '78%' as const,
    marginTop: 60,
    alignSelf: 'center' as const,
  },

  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: t.text,
    letterSpacing: 0.4,
  },
  headerActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  headerLink: { fontSize: 11, fontWeight: '700' as const, color: t.accent },

  scroll: { maxHeight: 400 },
  scrollInner: { paddingVertical: 4 },

  empty: { paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center' as const, gap: 6 },
  emptyEmoji: { fontSize: 26 },
  emptyTitle: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  emptyBody: { fontSize: 11, color: t.textMuted, textAlign: 'center' as const, lineHeight: 15 },

  inviteRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: t.accentTint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  inviteIcon: { fontSize: 14, color: t.accent },
  inviteText: { flex: 1, fontSize: 12, fontWeight: '800' as const, color: t.accent },

  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  rowUnread: {
    // Subtle accent-tint behind unread rows so the eye lands on what's new
    backgroundColor: t.surfaceMuted,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: 'transparent',
  },
  rowMain: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontSize: 12, fontWeight: '800' as const, color: t.text, lineHeight: 16 },
  rowMessage: { fontSize: 11, color: t.textMuted, lineHeight: 14 },
  rowTime: { fontSize: 10, color: t.textDim, marginTop: 2 },
  dismiss: { padding: 4, marginTop: 2 },

  footer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    alignItems: 'flex-end' as const,
  },
  footerLink: { fontSize: 11, fontWeight: '700' as const, color: t.accent },
});


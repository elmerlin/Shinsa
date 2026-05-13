/**
 * Shared top bar for every drawer-hosted screen.
 *
 * Layout (matches the web app's header):
 *   [ Pump Shinsa logo  →  Home ]    [ messages ] [ bell ] [ ☰ drawer ]
 *
 * - Logo is tappable and routes to the Home tab.
 * - Messages and bell each carry an unread badge driven by the same APIs
 *   the web NotificationContext uses (`auth/notifications` for the bell,
 *   `messages/conversations` summed for the chat icon).
 * - The hamburger lives on the *right* now (the drawer's drawerPosition
 *   is also flipped to "right" in `(drawer)/_layout.tsx` so the swipe
 *   gesture origin matches).
 *
 * Use `<TopBar rightExtra={...} />` to inject screen-specific buttons
 * (Feed's "+ new post", Tiers' share button, etc.) — they render to the
 * left of the messages icon so the standard trio stays in the same spot.
 */
import { useNavigation, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import { PumpShinsaLogo } from '@/components/pump-shinsa-logo';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, messagesApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';

interface Props {
  /** Optional element rendered to the left of the messages icon. Use this
   *  for screen-specific actions (e.g. Feed's "+ new post") so the
   *  standard messages/bell/hamburger trio keeps its position. */
  rightExtra?: React.ReactNode;
}

export function TopBar({ rightExtra }: Props) {
  const router = useRouter();
  const navigation = useNavigation<DrawerNavigationProp<Record<string, object | undefined>>>();
  const { user } = useAuth();
  const { theme } = useTheme();

  // Same 15-second refetch cadence the web NotificationContext uses, so
  // badges feel live without spinning up a SSE channel for the PWA.
  const notifQuery = useQuery({
    queryKey: ['notifications-badge', user?.id ?? null],
    queryFn: () => authApi.getNotifications(),
    enabled: !!user,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const inboxQuery = useQuery({
    queryKey: ['messages-inbox-badge', user?.id ?? null],
    queryFn: () => messagesApi.conversations(),
    enabled: !!user,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const notifBadge =
    (Number(notifQuery.data?.unread_count) || 0) +
    (Number(notifQuery.data?.invitation_count) || 0);
  const messageBadge = (inboxQuery.data?.conversations || []).reduce(
    (sum, c) => sum + (Number(c?.unread_count) || 0),
    0,
  );

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push('/')}
        hitSlop={8}
        style={({ pressed }) => [styles.brand, pressed && styles.pressed]}>
        <PumpShinsaLogo variant="horizontal" size={36} />
      </Pressable>

      <View style={styles.rightCluster}>
        {rightExtra}
        <IconBtn
          icon="message.fill"
          onPress={() => router.push('/messages')}
          badge={messageBadge}
          badgeTone="cyan"
          color={theme.text}
          accessibilityLabel="Messages"
        />
        <IconBtn
          icon="bell.fill"
          onPress={() => router.push('/account')}
          badge={notifBadge}
          badgeTone="red"
          color={theme.text}
          accessibilityLabel="Notifications"
        />
        <IconBtn
          icon="line.horizontal.3"
          onPress={() => navigation.openDrawer?.()}
          color={theme.text}
          accessibilityLabel="Open menu"
        />
      </View>
    </View>
  );
}

interface IconBtnProps {
  icon: 'message.fill' | 'bell.fill' | 'line.horizontal.3';
  onPress: () => void;
  badge?: number;
  badgeTone?: 'red' | 'cyan';
  color: string;
  accessibilityLabel: string;
}

function IconBtn({ icon, onPress, badge = 0, badgeTone = 'red', color, accessibilityLabel }: IconBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
      <IconSymbol name={icon} size={22} color={color} />
      {badge > 0 ? (
        <View style={[styles.badge, badgeTone === 'cyan' ? styles.badgeCyan : styles.badgeRed]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    // width: '100%' so the icon cluster hugs the right edge regardless of
    // whether the parent wrapper is a column (the common case) or a row
    // with `flexDirection: 'row'` left over from the old hamburger header
    // — without it, the bar shrinks to its content and `space-between`
    // collapses, leaving a fat gap on the right.
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  brand: { paddingVertical: 2, paddingRight: 8 },
  rightCluster: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    position: 'relative',
    padding: 6,
  },
  pressed: { opacity: 0.6 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRed: { backgroundColor: '#ef4444' },
  badgeCyan: { backgroundColor: '#06b6d4' },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
});

import { Drawer } from 'expo-router/drawer';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import {
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import { PumpShinsaLogo } from '@/components/pump-shinsa-logo';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useBreakpoint, SIDEBAR_EXPANDED_BREAKPOINT } from '@/hooks/use-breakpoint';
import { WebSidebar } from '@/components/web/web-sidebar';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

interface NavItem {
  label: string;
  path: string;
  /** Marked true when the destination is a stub (Coming soon screen). */
  stub?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { label: 'Home', path: '/' },
  { label: 'Feed', path: '/feed' },
  { label: 'Songs', path: '/songs' },
  { label: 'Tiers', path: '/tiers' },
  { label: 'Profile', path: '/profile' },
];

const SECONDARY_NAV: NavItem[] = [
  { label: 'Tournaments', path: '/tournaments' },
  { label: 'Live', path: '/live' },
  { label: 'Weekly Challenges', path: '/weekly-challenges' },
  { label: 'Lists', path: '/lists' },
  { label: 'Training', path: '/training' },
  { label: 'What to play', path: '/what-to-play' },
  { label: 'Rival', path: '/head-to-head' },
  { label: 'Skills', path: '/skill' },
  { label: 'Leaderboards', path: '/leaderboards' },
  { label: 'World Max', path: '/world-max', stub: true },
  { label: 'Shoes', path: '/shoes' },
  { label: 'Messages', path: '/messages' },
  { label: 'Pet', path: '/pet' },
];

const ACCOUNT_NAV: NavItem[] = [
  { label: 'My Account', path: '/account' },
  { label: 'Changelog', path: '/changelog', stub: true },
];

function DrawerContent(props: DrawerContentComponentProps) {
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const s = useThemedStyles(makeContentStyles);
  const avatarUrl = typeof user?.avatar === 'string' ? fullImageUrl(user.avatar) : undefined;

  const navigate = (path: string) => {
    props.navigation.closeDrawer();
    router.push(path as never);
  };

  const renderItem = (item: NavItem) => (
    <DrawerItem
      key={item.path}
      label={({ color }) => (
        <View style={s.itemRow}>
          <Text style={[s.itemLabel, { color }]}>{item.label}</Text>
          {item.stub ? <Text style={s.stubBadge}>SOON</Text> : null}
        </View>
      )}
      onPress={() => navigate(item.path)}
      activeTintColor={theme.accent}
      inactiveTintColor={theme.text}
    />
  );

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={s.scrollContent}>
      <View style={s.brandRow}>
        <PumpShinsaLogo variant="horizontal" size={36} />
      </View>

      {user ? (
        <View style={s.userCard}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarLetter}>{user.username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={s.userMain}>
            <Text style={s.username}>@{user.username}</Text>
            {typeof user.skill_title === 'string' && user.skill_title ? (
              <Text style={s.skillTitle} numberOfLines={1}>{user.skill_title}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={s.divider} />
      <Text style={s.sectionLabel}>App</Text>
      {PRIMARY_NAV.map(renderItem)}

      <View style={s.divider} />
      <Text style={s.sectionLabel}>Discover</Text>
      {SECONDARY_NAV.map(renderItem)}

      <View style={s.divider} />
      <Text style={s.sectionLabel}>Account</Text>
      {ACCOUNT_NAV.map(renderItem)}

      <View style={s.divider} />
      <DrawerItem
        label="Log out"
        onPress={() => {
          props.navigation.closeDrawer();
          signOut();
        }}
        labelStyle={[s.itemLabel, { color: theme.danger }]}
        activeTintColor={theme.danger}
        inactiveTintColor={theme.danger}
      />
    </DrawerContentScrollView>
  );
}

export default function DrawerLayout() {
  const { theme } = useTheme();
  const { isDesktop, width } = useBreakpoint();

  // Desktop swaps the drawer into a permanent left sidebar — the same
  // <Drawer> component, just configured to never hide and rendered with
  // WebSidebar instead of the mobile drawer content. Mobile keeps the
  // right-side off-canvas drawer it had before.
  const desktopWidth = width >= SIDEBAR_EXPANDED_BREAKPOINT ? 240 : 64;

  return (
    <Drawer
      drawerContent={(props) =>
        isDesktop ? <WebSidebar {...props} /> : <DrawerContent {...props} />
      }
      screenOptions={{
        headerShown: false,
        drawerStyle: isDesktop
          ? { backgroundColor: theme.surface, width: desktopWidth, borderRightWidth: 0 }
          : { backgroundColor: theme.surface, width: 220 },
        // Permanent on desktop = always visible, no overlay. Front on mobile
        // keeps the existing slide-over behavior.
        drawerType: isDesktop ? 'permanent' : 'front',
        // Sidebar lives on the left on desktop (Linear/Notion convention).
        // On mobile the hamburger lives top-right (see top-bar.tsx) so the
        // drawer slides in from the same side.
        drawerPosition: isDesktop ? 'left' : 'right',
        // Swipe-to-open was disabled on mobile because users triggered it
        // accidentally when scrolling near the right edge. Doesn't apply
        // to permanent drawers, but harmless to leave as false.
        swipeEnabled: false,
        // Hide the default drawer's overlay on mobile; on desktop the
        // permanent variant doesn't draw one.
        sceneStyle: { backgroundColor: theme.bg },
      }}>
      <Drawer.Screen name="(tabs)" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="tournaments" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="posts" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="live" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="lists" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="training" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="skill" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="leaderboards" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="world-max" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="weekly-challenges" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="what-to-play" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="head-to-head" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="shoes" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="messages" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="pet" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="account" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="changelog" options={{ drawerItemStyle: { display: 'none' } }} />
    </Drawer>
  );
}

const makeContentStyles = (t: ThemeColors) => ({
  scrollContent: { paddingTop: 16, paddingBottom: 24 },
  brandRow: { paddingHorizontal: 18, paddingBottom: 12 },
  userCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.surfaceMuted },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarLetter: { fontSize: 18, fontWeight: '800' as const, color: t.textMuted },
  userMain: { flex: 1, gap: 2, minWidth: 0 },
  username: { fontSize: 15, fontWeight: '800' as const, color: t.text },
  skillTitle: { fontSize: 12, color: t.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 8, marginHorizontal: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
    color: t.textDim,
    textTransform: 'uppercase' as const,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginLeft: -12,
  },
  itemLabel: { fontSize: 15, fontWeight: '600' as const },
  stubBadge: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1,
    color: t.textDim,
    backgroundColor: t.surfaceMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
});

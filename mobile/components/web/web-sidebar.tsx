/**
 * Persistent left sidebar for the desktop web build.
 *
 * Rendered as the drawerContent of (drawer)/_layout.tsx when
 * useBreakpoint().isDesktop is true (≥ 960 px). Below the breakpoint the
 * existing mobile drawer content renders unchanged.
 *
 * Two width modes driven by useBreakpoint().isCompactSidebar:
 *   - Expanded (≥ 1100 px): 240 px wide, icon + label.
 *   - Compact  (960–1099 px): 64 px wide, icon only with tooltip on hover.
 *
 * The active route is detected via expo-router's usePathname() and shown
 * with a gold accent bar on the left and an accentTint background. Hover
 * lifts the row with a translucent backdrop; pressed darkens it. All
 * Pressables are wired through onHoverIn/onHoverOut (RN Web extension) so
 * the desktop affordances feel right without breaking native compilation.
 */
import { useRouter, usePathname } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { PumpShinsaLogo } from '@/components/pump-shinsa-logo';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import type { ThemeColors } from '@/constants/theme';

type IconName = React.ComponentProps<typeof IconSymbol>['name'];

interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  /** Match prefix instead of exact equality (e.g. /profile vs /profile/123). */
  prefix?: boolean;
  /** Stubs render dimmed; the route still works but is flagged "SOON". */
  stub?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: 'App',
    items: [
      { label: 'Home', path: '/', icon: 'house.fill' },
      { label: 'Feed', path: '/feed', icon: 'bubble.left.and.bubble.right.fill' },
      { label: 'Songs', path: '/songs', icon: 'music.note', prefix: true },
      { label: 'Tiers', path: '/tiers', icon: 'trophy.fill' },
      { label: 'Profile', path: '/profile', icon: 'person.fill', prefix: true },
    ],
  },
  {
    title: 'Discover',
    items: [
      { label: 'Tournaments', path: '/tournaments', icon: 'flag.fill', prefix: true },
      { label: 'Live', path: '/live', icon: 'video.fill', prefix: true },
      { label: 'Weekly Challenges', path: '/weekly-challenges', icon: 'calendar' },
      { label: 'Lists', path: '/lists', icon: 'list.bullet', prefix: true },
      { label: 'Training', path: '/training', icon: 'chart.line.uptrend.xyaxis' },
      { label: 'What to Play', path: '/what-to-play', icon: 'lightbulb.fill' },
      { label: 'Rival', path: '/head-to-head', icon: 'person.2.fill' },
      { label: 'Skills', path: '/skill', icon: 'sparkles', prefix: true },
      { label: 'Leaderboards', path: '/leaderboards', icon: 'list.number' },
      { label: 'Shoes', path: '/shoes', icon: 'figure.run' },
      { label: 'Messages', path: '/messages', icon: 'message.fill', prefix: true },
      { label: 'Posts', path: '/posts', icon: 'square.and.pencil', prefix: true },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'My Account', path: '/account', icon: 'gearshape.fill' },
    ],
  },
];

export function WebSidebar(_props: DrawerContentComponentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const { signOut } = useAuth();
  const { isCompactSidebar } = useBreakpoint();
  const s = useThemedStyles(makeStyles);

  const isActive = useMemo(
    () => (item: NavItem): boolean => {
      if (item.path === '/') return pathname === '/' || pathname === '';
      return item.prefix ? pathname.startsWith(item.path) : pathname === item.path;
    },
    [pathname],
  );

  const onNav = (path: string) => {
    router.push(path as never);
  };

  return (
    <View style={[s.root, isCompactSidebar && s.rootCompact]}>
      <View style={[s.brand, isCompactSidebar && s.brandCompact]}>
        <PumpShinsaLogo
          variant={isCompactSidebar ? 'icon' : 'horizontal'}
          size={isCompactSidebar ? 32 : 36}
        />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={s.section}>
            {!isCompactSidebar ? (
              <Text style={s.sectionLabel}>{section.title}</Text>
            ) : (
              <View style={s.sectionRule} />
            )}
            {section.items.map((item) => (
              <SidebarRow
                key={item.path}
                item={item}
                active={isActive(item)}
                compact={isCompactSidebar}
                theme={theme}
                onPress={() => onNav(item.path)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        <SidebarRow
          item={{ label: 'Log out', path: '__signout', icon: 'arrow.right.circle.fill' }}
          active={false}
          compact={isCompactSidebar}
          theme={theme}
          danger
          onPress={() => signOut()}
        />
      </View>
    </View>
  );
}

interface RowProps {
  item: NavItem;
  active: boolean;
  compact: boolean;
  theme: ThemeColors;
  danger?: boolean;
  onPress: () => void;
}

function SidebarRow({ item, active, compact, theme, danger, onPress }: RowProps) {
  const [hovered, setHovered] = useState(false);
  const s = useThemedStyles(makeStyles);

  const tint = danger ? theme.danger : active ? theme.accent : theme.text;
  const labelColor = danger ? theme.danger : active ? theme.accent : theme.text;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      style={({ pressed }) => [
        s.row,
        compact && s.rowCompact,
        hovered && !active && s.rowHover,
        active && s.rowActive,
        pressed && s.rowPressed,
      ]}>
      {active && !compact ? <View style={s.activeBar} /> : null}
      <View style={[s.iconWrap, compact && s.iconWrapCompact]}>
        <IconSymbol name={item.icon} size={compact ? 22 : 18} color={tint} />
      </View>
      {!compact ? (
        <Text
          numberOfLines={1}
          style={[s.label, { color: labelColor }, active && s.labelActive]}>
          {item.label}
        </Text>
      ) : null}
      {!compact && item.stub ? <Text style={s.stub}>SOON</Text> : null}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  ({
    root: {
      flex: 1,
      backgroundColor: t.surface,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: t.border,
    },
    rootCompact: {},
    brand: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 14,
    },
    brandCompact: {
      paddingHorizontal: 0,
      alignItems: 'center',
    },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 12 },
    section: { paddingBottom: 8 },
    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.6,
      color: t.textDim,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
    },
    sectionRule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.border,
      marginVertical: 8,
      marginHorizontal: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 8,
      paddingHorizontal: 8,
      paddingVertical: 7,
      borderRadius: 8,
      position: 'relative',
    },
    rowCompact: {
      justifyContent: 'center',
      marginHorizontal: 6,
      paddingHorizontal: 0,
      paddingVertical: 9,
    },
    rowHover: {
      backgroundColor: t.surfaceMuted,
    },
    rowActive: {
      backgroundColor: t.accentTint,
    },
    rowPressed: {
      opacity: 0.7,
    },
    activeBar: {
      position: 'absolute',
      left: -8,
      top: 6,
      bottom: 6,
      width: 3,
      borderTopRightRadius: 2,
      borderBottomRightRadius: 2,
      backgroundColor: t.accent,
    },
    iconWrap: {
      width: 22,
      alignItems: 'center',
    },
    iconWrapCompact: {
      width: 24,
    },
    label: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: '600',
    },
    labelActive: {
      fontWeight: '800',
    },
    stub: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
      color: t.textDim,
      backgroundColor: t.surfaceMuted,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
      paddingVertical: 8,
    },
  }) as const;

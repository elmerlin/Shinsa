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
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

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

      <DrawerItem
        label="Home"
        onPress={() => navigate('/')}
        labelStyle={s.itemLabel}
        activeTintColor={theme.accent}
        inactiveTintColor={theme.text}
      />
      <DrawerItem
        label="Tournaments"
        onPress={() => navigate('/tournaments')}
        labelStyle={s.itemLabel}
        activeTintColor={theme.accent}
        inactiveTintColor={theme.text}
      />
      <DrawerItem
        label="Songs"
        onPress={() => navigate('/songs')}
        labelStyle={s.itemLabel}
        activeTintColor={theme.accent}
        inactiveTintColor={theme.text}
      />

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

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: { backgroundColor: theme.surface, width: 280 },
        drawerType: 'front',
        sceneStyle: { backgroundColor: theme.bg },
      }}>
      <Drawer.Screen name="(tabs)" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="tournaments" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="songs" options={{ drawerItemStyle: { display: 'none' } }} />
    </Drawer>
  );
}

const makeContentStyles = (t: ThemeColors) => ({
  scrollContent: { paddingTop: 16 },
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
  itemLabel: { fontSize: 15, fontWeight: '600' as const, marginLeft: -12 },
});

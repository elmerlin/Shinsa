import { ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ThemeProvider, useTheme } from '@/contexts/theme-context';
import { queryClient } from '@/lib/query-client';

export const unstable_settings = {
  anchor: '(drawer)',
};

function AuthGate() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = (segments as string[])[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/');
    }
  }, [user, loading, segments, router]);

  // Bridge: when the push-sw.js notificationclick handler can't open a
  // fresh window (i.e. a Shinsa tab is already focused — typical for the
  // installed PWA), it postMessage's us the destination URL and we
  // router.push it here. Without this, tapping a notification just
  // focuses the existing tab and leaves you on whatever page you were
  // already viewing.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'SHINSA_NAVIGATE' || typeof data.url !== 'string') return;
      const target = data.url.trim();
      if (!target) return;
      // The URL the server sends is app-relative ("/post/123"). Strip a
      // leading origin if it slipped in so router.push gets the right
      // shape — Expo Router on web wants a path, not a full URL.
      let path = target;
      try {
        if (/^https?:/i.test(target)) {
          const u = new URL(target);
          path = u.pathname + u.search + u.hash;
        }
      } catch { /* fall through with raw target */ }
      router.push(path as never);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.bg,
        }}>
        <ActivityIndicator size="large" color={theme.spinner} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.text, headerTitleStyle: { color: theme.text } }}>
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="song/[id]" options={{ title: 'Song', headerBackTitle: 'Songs' }} />
      <Stack.Screen name="tournament/[id]" options={{ title: 'Tournament', headerBackTitle: 'Tournaments' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post', headerBackTitle: 'Back' }} />
      <Stack.Screen name="upscore/[id]" options={{ title: 'Upscore', headerBackTitle: 'Back' }} />
      <Stack.Screen name="clear/[id]" options={{ title: 'New clear', headerBackTitle: 'Back' }} />
      <Stack.Screen name="profile/[id]" options={{ title: 'Profile', headerBackTitle: 'Back' }} />
      <Stack.Screen name="skill/[slug]" options={{ title: 'Skill', headerBackTitle: 'Skills' }} />
      <Stack.Screen name="live/[id]" options={{ title: 'Live', headerBackTitle: 'Back' }} />
      <Stack.Screen name="conversation/[id]" options={{ title: 'Conversation', headerBackTitle: 'Messages' }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

function ThemedShell({ children }: { children: React.ReactNode }) {
  const { theme, themeKey } = useTheme();
  const navTheme = useMemo(
    () => ({
      dark: themeKey !== 'light',
      colors: {
        primary: theme.accent,
        background: theme.bg,
        card: theme.surface,
        text: theme.text,
        border: theme.border,
        notification: theme.danger,
      },
      fonts: {
        regular: { fontFamily: 'System', fontWeight: '400' as const },
        medium: { fontFamily: 'System', fontWeight: '500' as const },
        bold: { fontFamily: 'System', fontWeight: '700' as const },
        heavy: { fontFamily: 'System', fontWeight: '900' as const },
      },
    }),
    [theme, themeKey]
  );

  return (
    <NavThemeProvider value={navTheme}>
      {children}
      <StatusBar style={themeKey === 'light' ? 'dark' : 'light'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ThemedShell>
            <AuthGate />
          </ThemedShell>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

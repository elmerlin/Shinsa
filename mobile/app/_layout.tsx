import { ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
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
      <Stack.Screen name="profile/[id]" options={{ title: 'Profile', headerBackTitle: 'Back' }} />
      <Stack.Screen name="skill/[slug]" options={{ title: 'Skill', headerBackTitle: 'Skills' }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

function ThemedShell({ children }: { children: React.ReactNode }) {
  const { theme, themeKey } = useTheme();
  const navTheme = useMemo(
    () => ({
      dark: themeKey === 'dark',
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
      <StatusBar style={themeKey === 'dark' ? 'light' : 'dark'} />
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

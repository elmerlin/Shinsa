import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { DEFAULT_THEME_KEY, themes, type ThemeColors, type ThemeKey } from '@/constants/theme';

const STORAGE_KEY = 'shinsa.theme.preference';

/**
 * Stored preference: 'system' (auto follow OS), or one of the named themes.
 * In-memory `theme` is always concrete (never 'system').
 */
export type ThemePreference = 'system' | ThemeKey;

interface ThemeContextValue {
  /** Resolved theme tokens to use right now. */
  theme: ThemeColors;
  /** Resolved theme key ('dark' or 'light'). */
  themeKey: ThemeKey;
  /** User preference, including 'system'. */
  preference: ThemePreference;
  /** Persist a new preference. */
  setPreference: (pref: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function readStored(): Promise<ThemePreference> {
  try {
    if (Platform.OS === 'web') {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (v === 'system' || v === 'dark' || v === 'light') return v;
      return 'system';
    }
    const v = await SecureStore.getItemAsync(STORAGE_KEY);
    if (v === 'system' || v === 'dark' || v === 'light') return v;
    return 'system';
  } catch {
    return 'system';
  }
}

async function writeStored(pref: ThemePreference): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, pref);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, pref);
  } catch {
    // best-effort persistence; if it fails the user just loses preference on relaunch
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    readStored().then((pref) => {
      if (!cancelled) setPreferenceState(pref);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const themeKey: ThemeKey = useMemo(() => {
    if (preference === 'dark' || preference === 'light') return preference;
    if (systemScheme === 'light') return 'light';
    if (systemScheme === 'dark') return 'dark';
    return DEFAULT_THEME_KEY;
  }, [preference, systemScheme]);

  const theme = themes[themeKey];

  const setPreference = useCallback(async (pref: ThemePreference) => {
    setPreferenceState(pref);
    await writeStored(pref);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, themeKey, preference, setPreference }),
    [theme, themeKey, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

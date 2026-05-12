import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'shinsa.auth.token';

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') return window.localStorage.getItem(key);
    return null;
  }
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const getToken = () => getItem(TOKEN_KEY);
export const setToken = (token: string) => setItem(TOKEN_KEY, token);
export const clearToken = () => removeItem(TOKEN_KEY);

/**
 * Generic preferences API for non-secret user settings (tier filters, default
 * mode, songs-per-row, etc). Same backend as the auth token (SecureStore on
 * native, localStorage on web) — overkill for prefs but keeps the surface
 * area small and avoids pulling in another storage library.
 */
export const prefs = {
  get: getItem,
  set: setItem,
  remove: removeItem,
};

import type { ImageSource } from 'expo-image';
import { apiBaseUrl } from './api';

/**
 * Web variant of resolveJacketSource: never imports the (639-entry,
 * ~45 MB) jacket manifest because the browser handles jacket caching
 * fine on its own. The native counterpart (lib/jacket.ts) bundles the
 * pack into the APK so first paint is instant offline.
 *
 * Same return contract — `{ uri }` for resolvable inputs, `null` for
 * empty / unparseable.
 */
export function resolveJacketSource(rawUrl?: string | null): ImageSource | null {
  if (!rawUrl) return null;
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return null;
  if (/^(https?:|data:)/i.test(trimmed)) return { uri: trimmed };
  return { uri: `${apiBaseUrl}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}` };
}

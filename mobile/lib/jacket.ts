import type { ImageSource } from 'expo-image';
import JACKET_MANIFEST from './jacket-manifest';
import { apiBaseUrl } from './api';

/**
 * Resolve a jacket URL (absolute or relative) to an `<Image source>` that
 * prefers the APK-bundled asset when available. Falls back to a network
 * URL (Shinsa-hosted if it was relative, original if it was external).
 *
 * Returning `number` (the require() module id) lets Metro embed the
 * binary in the bundle and Image render it without a network round
 * trip — instant first paint, works offline.
 *
 * Returns `null` only when the input is empty / unparseable so callers
 * can render their placeholder.
 *
 * Examples:
 *   resolveJacketSource('/jackets/pump/19.jpg')
 *     → 4729 (bundled require id)  [if present in manifest]
 *     → { uri: 'https://pumpshinsa.com/jackets/pump/19.jpg' }  [otherwise]
 *   resolveJacketSource('https://pumpshinsa.com/jackets/pump/19.jpg')
 *     → bundled require id (the absolute URL is rewritten to its path)
 *   resolveJacketSource('https://www.piugame.com/data/song_img/abc.png')
 *     → { uri: 'https://www.piugame.com/data/song_img/abc.png' }
 */
export function resolveJacketSource(rawUrl?: string | null): number | ImageSource | null {
  if (!rawUrl) return null;
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return null;

  // Pull out the URL path for the manifest lookup. If it's an absolute
  // URL pointing at our own host, rewrite to the path; if it's external,
  // we can't look it up locally and just return the original URI.
  let pathOnly = trimmed;
  let isExternal = false;
  if (/^https?:/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.hostname.endsWith('pumpshinsa.com')) {
        pathOnly = u.pathname;
      } else {
        isExternal = true;
      }
    } catch {
      isExternal = true;
    }
  }

  if (!isExternal) {
    const bundled = JACKET_MANIFEST[pathOnly];
    if (bundled !== undefined) return bundled;
  }

  if (/^(https?:|data:)/i.test(trimmed)) return { uri: trimmed };
  // Relative path — prefix the API base so Image can fetch from Shinsa.
  return { uri: `${apiBaseUrl}${pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`}` };
}

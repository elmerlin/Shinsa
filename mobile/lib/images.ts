import { apiBaseUrl } from '@/lib/api';

/**
 * Server-side sentinels that mean "no real image, render a placeholder
 * client-side." Returning undefined for these lets the call site fall
 * through to its DefaultAvatar/SystemAvatar branch.
 */
const SENTINELS = new Set(['system']);

export function fullImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (SENTINELS.has(path)) return undefined;
  if (/^(https?:|data:)/i.test(path)) return path;
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/** True if the avatar value is the system-bot sentinel. */
export function isSystemAvatar(path: string | null | undefined): boolean {
  return path === 'system';
}

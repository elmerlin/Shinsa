/**
 * Mirrors `client/src/components/PiuChartJacket.jsx#resolveChartJacketUrl`.
 * The `user_best_scores` table only stores `background_url` (often a generic
 * piugame placeholder like `c_bg.png`), so we resolve the proper artwork from
 * the `/api/songs/jacket-map` lookup.
 */

import { toCanonicalSongTitle } from './songAliases';

export function normalizeChartTitle(title: string | null | undefined): string {
  return String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface ResolveJacketArgs {
  title?: string;
  mode?: string;
  level?: number | string;
  jacketLookup?: Record<string, string> | undefined;
  backgroundUrl?: string;
  jacketUrl?: string;
}

export function resolveChartJacketUrl({
  title = '',
  mode = '',
  level = '',
  jacketLookup,
  backgroundUrl = '',
  jacketUrl = '',
}: ResolveJacketArgs): string {
  const map = jacketLookup || {};
  const normalizedTitle = normalizeChartTitle(title);
  if (!normalizedTitle) return String(jacketUrl || '').trim();

  // Try the raw normalized title first, then the canonical (English) variant.
  // Mirrors what the server's jacket map does for Korean ↔ English aliases.
  const canonicalTitle = normalizeChartTitle(toCanonicalSongTitle(title || ''));

  const tryKeys = [
    `${normalizedTitle}|${mode}|${level}`,
    `${canonicalTitle}|${mode}|${level}`,
    normalizedTitle,
    canonicalTitle,
  ];
  for (const key of tryKeys) {
    if (key && map[key]) return map[key];
  }

  // Filter out the generic CoOp placeholder background so it doesn't masquerade
  // as a real jacket. Server matches on the `piugame` host substring.
  const safeBackgroundUrl = String(backgroundUrl || '').includes('piugame')
    ? ''
    : String(backgroundUrl || '').trim();
  return safeBackgroundUrl || String(jacketUrl || '').trim();
}

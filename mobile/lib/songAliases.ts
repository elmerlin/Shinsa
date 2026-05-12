/**
 * Song-title canonicalization — Korean ↔ English (and other) aliases.
 *
 * The alias map at `assets/song-aliases.json` is a copy of
 * `server/data/piugame-song-aliases.json`. Metro can't resolve files outside
 * the mobile project root, so mirror the JSON here and re-copy it after the
 * piugame sync regenerates the source (it changes rarely).
 */

import aliasPayload from '../assets/song-aliases.json';

interface AliasPayload {
  aliases?: Record<string, string>;
}

const RAW_ALIASES = ((aliasPayload as AliasPayload)?.aliases || {}) as Record<string, string>;

function normalizeLookup(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Build a normalized lookup so case/whitespace don't matter when matching the
// user-supplied title. The map values keep the original casing of the
// canonical name (e.g. "Scorpion King") so display stays clean.
const NORMALIZED_ALIASES: Record<string, string> = {};
for (const [alias, canonical] of Object.entries(RAW_ALIASES)) {
  const aliasNorm = normalizeLookup(alias);
  const canonicalTrim = String(canonical).trim();
  if (!aliasNorm || !canonicalTrim || aliasNorm === normalizeLookup(canonicalTrim)) continue;
  if (!NORMALIZED_ALIASES[aliasNorm]) NORMALIZED_ALIASES[aliasNorm] = canonicalTrim;
}

/**
 * Returns the canonical display title for a song. Falls back to the original
 * input when no alias is registered. Idempotent: calling on an already-canonical
 * title returns it unchanged.
 */
export function toCanonicalSongTitle(title: string | null | undefined): string {
  const raw = String(title ?? '').trim();
  if (!raw) return '';

  const seen = new Set<string>();
  let current = raw;
  let normalized = normalizeLookup(current);
  while (NORMALIZED_ALIASES[normalized] && !seen.has(normalized)) {
    seen.add(normalized);
    current = NORMALIZED_ALIASES[normalized];
    normalized = normalizeLookup(current);
  }
  return current;
}

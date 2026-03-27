// Shared chart key normalization helpers
// Extracted from server/routes/songs.js to avoid duplication across lib modules.

function normalizeSongName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseSongFlags(flags) {
  if (Array.isArray(flags)) {
    return flags
      .map((flag) => String(flag || '').trim())
      .filter(Boolean);
  }
  return String(flags || '')
    .split(',')
    .map((flag) => flag.trim())
    .filter(Boolean);
}

function resolveKnownSongVariantTitle(rawTitle, songKey = '', flags = '') {
  const title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
  if (!title) return '';
  const normalizedFlags = parseSongFlags(flags).map((flag) => flag.toLowerCase());
  const shortCutSuffixPattern = /\s*-\s*SHORT CUT\s*-\s*$/i;
  if (shortCutSuffixPattern.test(title)) {
    return title.replace(shortCutSuffixPattern, ' - SHORT CUT -');
  }

  const isShortCut = normalizedFlags.includes('cut:1')
    || (
      normalizeSongName(title) === 'yog-sothoth'
      && String(songKey || '').trim() === '313'
    );
  if (isShortCut) {
    return `${title} - SHORT CUT -`;
  }

  return title;
}

function hasShortCutSuffix(title) {
  return /\s*-\s*short cut\s*-\s*$/i.test(String(title || ''));
}

function normalizeShortCutSuffix(title) {
  return String(title || '').replace(/\s*-\s*short cut\s*-\s*$/i, ' - short cut -');
}

function normalizeMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'single' || m === 'singles' || m === 's') return 'Single';
  if (m === 'double' || m === 'doubles' || m === 'd') return 'Double';
  if (m === 'coop' || m === 'co-op' || m === 'co op' || m === 'cooperative' || m === 'c') return 'CoOp';
  return '';
}

function toCanonicalTitle(title, aliases) {
  let normalized = normalizeSongName(title);
  if (!normalized) return '';
  const wantsShortCut = hasShortCutSuffix(normalized);

  const seen = new Set();
  while (aliases[normalized] && !seen.has(normalized)) {
    seen.add(normalized);
    normalized = aliases[normalized];
  }
  normalized = normalizeSongName(normalized);
  if (hasShortCutSuffix(normalized)) {
    normalized = normalizeShortCutSuffix(normalized);
  } else if (wantsShortCut) {
    normalized = `${normalized} - short cut -`;
  }
  return normalized;
}

function makeChartKey(title, mode, level, aliases) {
  const canonicalTitle = toCanonicalTitle(title, aliases);
  const canonicalMode = normalizeMode(mode);
  const lv = parseInt(level, 10) || 0;
  if (!canonicalTitle || !canonicalMode || !lv) return '';
  return `${canonicalTitle}|${canonicalMode}|${lv}`;
}

function makeSongGroupKey(row, aliases) {
  const resolvedTitle = resolveKnownSongVariantTitle(row.title, row.song_key, row.flags);
  const canonicalTitle = toCanonicalTitle(resolvedTitle, aliases);
  const artistNorm = normalizeSongName(row.artist);
  return (row.song_key && String(row.song_key).trim())
    ? `song_key:${String(row.song_key).trim()}`
    : `${canonicalTitle}|${artistNorm}`;
}

module.exports = {
  normalizeSongName,
  parseSongFlags,
  resolveKnownSongVariantTitle,
  hasShortCutSuffix,
  normalizeShortCutSuffix,
  normalizeMode,
  toCanonicalTitle,
  makeChartKey,
  makeSongGroupKey,
};

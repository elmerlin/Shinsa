const path = require('path');
const fs = require('fs');
const { toCanonicalTitle: toCanonicalTitleWithAliases, normalizeSongName } = require('./chartKeys');

const ALIASES_PATH = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');

// Manual alias overrides applied on top of the generated alias file. Keyed and
// valued by *normalized* (lowercased, whitespace-collapsed) titles. These win
// over the file. This is the single source of truth — both the public
// /api/songs/jacket-map endpoint and feed/activity enrichment read it, so an
// override added here fixes jacket resolution everywhere at once.
const SONG_ALIAS_OVERRIDES = {
  'papasito (feat. kutina)': 'papasito feat. kutina',
  '파파시토 (feat. kutina)': 'papasito feat. kutina',
};

let cachedAliases = null;

function loadSongAliases() {
  if (cachedAliases) return cachedAliases;
  const normalized = {};
  try {
    if (fs.existsSync(ALIASES_PATH)) {
      const data = JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf-8'));
      const rawAliases = (data && typeof data.aliases === 'object' && data.aliases) || {};
      for (const [alias, canonical] of Object.entries(rawAliases)) {
        const aliasNorm = normalizeSongName(alias);
        const canonicalNorm = normalizeSongName(canonical);
        if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
        if (!normalized[aliasNorm]) normalized[aliasNorm] = canonicalNorm;
      }
    }
  } catch (err) {
    console.warn('Failed to load piugame-song-aliases.json:', err.message);
  }
  // Overrides win over the generated file.
  for (const [alias, canonical] of Object.entries(SONG_ALIAS_OVERRIDES)) {
    const aliasNorm = normalizeSongName(alias);
    const canonicalNorm = normalizeSongName(canonical);
    if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
    normalized[aliasNorm] = canonicalNorm;
  }
  cachedAliases = normalized;
  return cachedAliases;
}

function toCanonicalTitle(title) {
  return toCanonicalTitleWithAliases(title, loadSongAliases());
}

function invalidateSongAliasCache() {
  cachedAliases = null;
}

module.exports = {
  loadSongAliases,
  toCanonicalTitle,
  invalidateSongAliasCache,
  SONG_ALIAS_OVERRIDES,
};

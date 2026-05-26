const path = require('path');
const fs = require('fs');
const { toCanonicalTitle: toCanonicalTitleWithAliases, normalizeSongName } = require('./chartKeys');

const ALIASES_PATH = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');

let cachedAliases = null;

function loadSongAliases() {
  if (cachedAliases) return cachedAliases;
  if (!fs.existsSync(ALIASES_PATH)) {
    cachedAliases = {};
    return cachedAliases;
  }
  try {
    const data = JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf-8'));
    const rawAliases = (data && typeof data.aliases === 'object' && data.aliases) || {};
    const normalized = {};
    for (const [alias, canonical] of Object.entries(rawAliases)) {
      const aliasNorm = normalizeSongName(alias);
      const canonicalNorm = normalizeSongName(canonical);
      if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
      if (!normalized[aliasNorm]) normalized[aliasNorm] = canonicalNorm;
    }
    cachedAliases = normalized;
    return cachedAliases;
  } catch (err) {
    console.warn('Failed to load piugame-song-aliases.json:', err.message);
    cachedAliases = {};
    return cachedAliases;
  }
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
};

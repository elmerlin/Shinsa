const path = require('path');
const fs = require('fs');
const { resolveKnownSongVariantTitle, normalizeSongName } = require('./chartKeys');
const { loadSongAliases } = require('./songAliases');

// The authoritative jacket resolver, built from pump-phoenix.json (the game
// data — every song/chart/jacket) plus full alias expansion. Keyed by
// normalized title and `title|Mode|Level`, including "- FULL SONG -" variants
// and locale/feat. aliases. ONE resolver shared by:
//   - GET /api/songs/jacket-map (routes/songs.js)
//   - feed/activity enrichment (lib/activityPostEnrichment.js)
// so a jacket the catalog page can show, the feed can show too — no drift.

const PUMP_PHOENIX_PATH = path.join(__dirname, '..', '..', 'pump-phoenix.json');

let cachedJacketMap = null;

function loadJacketMap() {
  if (cachedJacketMap) return cachedJacketMap;
  if (!fs.existsSync(PUMP_PHOENIX_PATH)) return {};
  const data = JSON.parse(fs.readFileSync(PUMP_PHOENIX_PATH, 'utf-8'));
  const map = {};
  const chartKeysBySong = {};

  for (const song of data.songs) {
    if (!song.jacket) continue;
    const jacketUrl = '/jackets/' + song.jacket;
    const name = resolveKnownSongVariantTitle(song.name || '', song.saIndex || '', song.flags || '');
    const norm = normalizeSongName(name);
    const songFlags = Array.isArray(song.flags) ? song.flags : [];
    const isFullSong = songFlags.some(f => String(f).toLowerCase() === 'cut:4');

    // Store by normalized name (first wins for base name)
    if (!map[norm]) map[norm] = jacketUrl;

    // For full-song variants (cut:4), also store under "title - full song -"
    // so plays with the "- FULL SONG -" suffix resolve correctly
    if (isFullSong) {
      const fullSongNorm = normalizeSongName(`${song.name || ''} - FULL SONG -`);
      if (!map[fullSongNorm]) map[fullSongNorm] = jacketUrl;
    }

    // Also store by name with mode|level for each chart
    for (const chart of (song.charts || [])) {
      if (chart.diffClass === 'S' || chart.diffClass === 'D') {
        const mode = chart.diffClass === 'S' ? 'Single' : 'Double';
        const key = `${norm}|${mode}|${chart.lvl}`;
        if (!map[key]) map[key] = jacketUrl;

        if (!chartKeysBySong[norm]) chartKeysBySong[norm] = [];
        chartKeysBySong[norm].push({ mode, level: chart.lvl, jacketUrl });

        // Also store full-song variant chart keys
        if (isFullSong) {
          const fullSongNorm = normalizeSongName(`${song.name || ''} - FULL SONG -`);
          const fullSongKey = `${fullSongNorm}|${mode}|${chart.lvl}`;
          map[fullSongKey] = jacketUrl;

          if (!chartKeysBySong[fullSongNorm]) chartKeysBySong[fullSongNorm] = [];
          chartKeysBySong[fullSongNorm].push({ mode, level: chart.lvl, jacketUrl });
        }
      }
    }
  }

  // Expand map with locale aliases (e.g., Korean PIUGame titles -> canonical English song)
  const aliases = loadSongAliases();
  const VARIANT_SUFFIXES = ['- full song -', '- short cut -'];

  for (const [aliasNorm, canonicalNorm] of Object.entries(aliases)) {
    // Detect if the alias itself has a variant suffix (e.g., "풀 문 - full song -")
    // but the canonical doesn't (e.g., "full moon")
    let resolvedCanonical = canonicalNorm;
    for (const suffix of VARIANT_SUFFIXES) {
      if (aliasNorm.endsWith(suffix) && !canonicalNorm.endsWith(suffix)) {
        // The alias has the suffix but canonical doesn't — resolve to canonical WITH suffix
        const canonicalWithSuffix = normalizeSongName(`${canonicalNorm} ${suffix}`);
        if (map[canonicalWithSuffix]) {
          resolvedCanonical = canonicalWithSuffix;
        }
        break;
      }
    }

    const canonicalJacket = map[resolvedCanonical];
    if (!canonicalJacket) continue;

    if (!map[aliasNorm]) map[aliasNorm] = canonicalJacket;

    const chartKeys = chartKeysBySong[resolvedCanonical] || chartKeysBySong[canonicalNorm] || [];
    for (const chart of chartKeys) {
      const aliasChartKey = `${aliasNorm}|${chart.mode}|${chart.level}`;
      if (!map[aliasChartKey]) map[aliasChartKey] = chart.jacketUrl;
    }
  }

  cachedJacketMap = map;
  return map;
}

/**
 * Resolve a jacket URL for a play by (title, mode, level). Tries the exact
 * chart key first, then the base-song title (all charts of a song share one
 * jacket), so even modes/levels not catalogued as S/D charts (e.g. CoOp) still
 * get the song's artwork. Returns '' when unknown.
 */
function resolveJacketUrl(title, mode, level) {
  const map = loadJacketMap();
  const norm = normalizeSongName(title);
  if (!norm) return '';
  const lvl = parseInt(level, 10) || 0;
  if (mode && lvl > 0) {
    const chartKey = `${norm}|${mode}|${lvl}`;
    if (map[chartKey]) return map[chartKey];
  }
  return map[norm] || '';
}

function invalidateJacketMap() {
  cachedJacketMap = null;
}

module.exports = {
  loadJacketMap,
  resolveJacketUrl,
  invalidateJacketMap,
};

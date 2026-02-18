const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/schema');

// Cache the jacket map in memory (loaded once from pump-phoenix.json)
let cachedJacketMap = null;
let cachedSongAliases = null;

function normalizeSongName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function loadSongAliases() {
  if (cachedSongAliases) return cachedSongAliases;

  const aliasesPath = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');
  if (!fs.existsSync(aliasesPath)) {
    cachedSongAliases = {};
    return cachedSongAliases;
  }

  try {
    const data = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'));
    const rawAliases = (data && typeof data.aliases === 'object' && data.aliases) || {};
    const normalizedAliases = {};

    for (const [alias, canonical] of Object.entries(rawAliases)) {
      const aliasNorm = normalizeSongName(alias);
      const canonicalNorm = normalizeSongName(canonical);
      if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
      if (!normalizedAliases[aliasNorm]) normalizedAliases[aliasNorm] = canonicalNorm;
    }

    cachedSongAliases = normalizedAliases;
    return cachedSongAliases;
  } catch (err) {
    console.warn('Failed to load piugame-song-aliases.json:', err.message);
    cachedSongAliases = {};
    return cachedSongAliases;
  }
}

function loadJacketMap() {
  if (cachedJacketMap) return cachedJacketMap;
  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  if (!fs.existsSync(jsonPath)) return {};
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const map = {};
  const chartKeysBySong = {};

  for (const song of data.songs) {
    if (!song.jacket) continue;
    const jacketUrl = '/jackets/' + song.jacket;
    const name = song.name || '';
    const norm = normalizeSongName(name);
    // Store by normalized name
    if (!map[norm]) map[norm] = jacketUrl;
    // Also store by name with mode|level for each chart
    for (const chart of (song.charts || [])) {
      if (chart.diffClass === 'S' || chart.diffClass === 'D') {
        const mode = chart.diffClass === 'S' ? 'Single' : 'Double';
        const key = `${norm}|${mode}|${chart.lvl}`;
        if (!map[key]) map[key] = jacketUrl;

        if (!chartKeysBySong[norm]) chartKeysBySong[norm] = [];
        chartKeysBySong[norm].push({ mode, level: chart.lvl, jacketUrl });
      }
    }
  }

  // Expand map with locale aliases (e.g., Korean PIUGame titles -> canonical English song)
  const aliases = loadSongAliases();
  for (const [aliasNorm, canonicalNorm] of Object.entries(aliases)) {
    const canonicalJacket = map[canonicalNorm];
    if (!canonicalJacket) continue;

    if (!map[aliasNorm]) map[aliasNorm] = canonicalJacket;

    const chartKeys = chartKeysBySong[canonicalNorm] || [];
    for (const chart of chartKeys) {
      const aliasChartKey = `${aliasNorm}|${chart.mode}|${chart.level}`;
      if (!map[aliasChartKey]) map[aliasChartKey] = chart.jacketUrl;
    }
  }

  cachedJacketMap = map;
  return map;
}

// GET /api/songs/jacket-map — return song name → local jacket URL mapping
router.get('/jacket-map', (req, res) => {
  const map = loadJacketMap();
  res.json(map);
});

// GET all songs (with optional filters)
router.get('/', (req, res) => {
  const db = getDb();
  const { min_level, max_level, mode, search } = req.query;
  let query = 'SELECT * FROM songs WHERE 1=1';
  const params = [];

  if (min_level) { query += ' AND level >= ?'; params.push(parseInt(min_level)); }
  if (max_level) { query += ' AND level <= ?'; params.push(parseInt(max_level)); }
  if (mode) { query += ' AND mode = ?'; params.push(mode); }
  if (search) { query += ' AND (title LIKE ? OR artist LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  query += ' ORDER BY level ASC, title ASC';
  const songs = db.prepare(query).all(...params);
  db.close();
  res.json(songs);
});

// GET song count by level
router.get('/stats', (req, res) => {
  const db = getDb();
  const stats = db.prepare(
    'SELECT level, mode, COUNT(*) as count FROM songs GROUP BY level, mode ORDER BY level ASC'
  ).all();
  const total = db.prepare('SELECT COUNT(*) as count FROM songs').get();
  db.close();
  res.json({ total: total.count, by_level: stats });
});

// POST bulk import songs
router.post('/import', (req, res) => {
  const db = getDb();
  const { songs } = req.body;

  const stmt = db.prepare(`
    INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key, flags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importSongs = db.transaction((songList) => {
    let imported = 0;
    for (const song of songList) {
      const flags = Array.isArray(song.flags) ? song.flags.join(',') : (song.flags || '');
      stmt.run(song.title, song.artist || '', song.jacket_url || '', song.mode, song.level, song.bpm || '', song.song_key || '', flags);
      imported++;
    }
    return imported;
  });

  const count = importSongs(songs);
  db.close();
  res.json({ imported: count });
});

module.exports = router;

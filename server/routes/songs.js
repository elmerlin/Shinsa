const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/schema');

// Cache the jacket map in memory (loaded once from pump-phoenix.json)
let cachedJacketMap = null;

function loadJacketMap() {
  if (cachedJacketMap) return cachedJacketMap;
  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  if (!fs.existsSync(jsonPath)) return {};
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const map = {};
  for (const song of data.songs) {
    if (!song.jacket) continue;
    const jacketUrl = '/jackets/' + song.jacket;
    const name = song.name || '';
    // Normalize: lowercase, collapse whitespace, trim
    const norm = name.toLowerCase().replace(/\s+/g, ' ').trim();
    // Store by normalized name
    if (!map[norm]) map[norm] = jacketUrl;
    // Also store by name with mode|level for each chart
    for (const chart of (song.charts || [])) {
      if (chart.diffClass === 'S' || chart.diffClass === 'D') {
        const mode = chart.diffClass === 'S' ? 'Single' : 'Double';
        const key = `${norm}|${mode}|${chart.lvl}`;
        if (!map[key]) map[key] = jacketUrl;
      }
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

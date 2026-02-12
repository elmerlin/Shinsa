const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

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
    INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const importSongs = db.transaction((songList) => {
    let imported = 0;
    for (const song of songList) {
      stmt.run(song.title, song.artist || '', song.jacket_url || '', song.mode, song.level, song.bpm || '', song.song_key || '');
      imported++;
    }
    return imported;
  });

  const count = importSongs(songs);
  db.close();
  res.json({ imported: count });
});

module.exports = router;

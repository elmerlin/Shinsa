const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

// GET all duels
router.get('/', (req, res) => {
  const db = getDb();
  const duels = db.prepare('SELECT * FROM duels ORDER BY created_at DESC').all();
  db.close();
  res.json(duels);
});

// GET single duel with songs
router.get('/:id', (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) { db.close(); return res.status(404).json({ error: 'Duel not found' }); }

  const songs = db.prepare('SELECT * FROM duel_songs WHERE duel_id = ? ORDER BY played_order ASC').all(duel.id);
  db.close();

  res.json({ ...duel, songs });
});

// POST create a duel
router.post('/', (req, res) => {
  const db = getDb();
  const {
    name, location, date, time, mode,
    player1_name, player2_name, player1_avatar, player2_avatar,
    player1_skill_title, player1_skill_level, player1_gender, player1_nationality, player1_description,
    player2_skill_title, player2_skill_level, player2_gender, player2_nationality, player2_description,
    player1_user_id, player2_user_id,
  } = req.body;

  if (!name || !player1_name || !player2_name) {
    db.close();
    return res.status(400).json({ error: 'Name and both player names are required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO duels (id, name, location, date, time, mode,
      player1_name, player2_name, player1_avatar, player2_avatar,
      player1_skill_title, player1_skill_level, player1_gender, player1_nationality, player1_description,
      player2_skill_title, player2_skill_level, player2_gender, player2_nationality, player2_description,
      player1_user_id, player2_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, location || '', date || '', time || '', mode || 'both',
    player1_name, player2_name, player1_avatar || '', player2_avatar || '',
    player1_skill_title || '', parseInt(player1_skill_level) || 1, player1_gender || '', player1_nationality || '', player1_description || '',
    player2_skill_title || '', parseInt(player2_skill_level) || 1, player2_gender || '', player2_nationality || '', player2_description || '',
    player1_user_id || '', player2_user_id || '');

  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
  db.close();

  res.status(201).json(duel);
});

// POST draw a card for a duel
router.post('/:id/draw', (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) { db.close(); return res.status(404).json({ error: 'Duel not found' }); }
  if (duel.status !== 'ACTIVE') { db.close(); return res.status(400).json({ error: 'Duel is not active' }); }

  const { level, draw_mode } = req.body;
  // draw_mode: 'any', 'Single', 'Double'
  // For singles-only duel mode, force Single. For doubles-only, force Double.

  let effectiveMode = draw_mode || 'any';
  if (duel.mode === 'singles') effectiveMode = 'Single';
  else if (duel.mode === 'doubles') effectiveMode = 'Double';

  if (!level) { db.close(); return res.status(400).json({ error: 'Level is required' }); }

  const lvl = parseInt(level);
  let songs;
  if (effectiveMode === 'any') {
    songs = db.prepare('SELECT * FROM songs WHERE level = ? AND flags LIKE ?').all(lvl, '%cut:2%');
    if (songs.length === 0) songs = db.prepare('SELECT * FROM songs WHERE level = ?').all(lvl);
  } else {
    songs = db.prepare('SELECT * FROM songs WHERE level = ? AND mode = ? AND flags LIKE ?').all(lvl, effectiveMode, '%cut:2%');
    if (songs.length === 0) songs = db.prepare('SELECT * FROM songs WHERE level = ? AND mode = ?').all(lvl, effectiveMode);
  }

  if (songs.length === 0) {
    db.close();
    return res.status(400).json({ error: `No ${effectiveMode === 'any' ? '' : effectiveMode + ' '}charts found at level ${level}` });
  }

  // Pick a random song
  const song = songs[Math.floor(Math.random() * songs.length)];

  // Determine play order
  const lastSong = db.prepare('SELECT MAX(played_order) as max_order FROM duel_songs WHERE duel_id = ?').get(duel.id);
  const order = (lastSong.max_order || 0) + 1;

  const songId = uuidv4();
  db.prepare(`
    INSERT INTO duel_songs (id, duel_id, song_id, song_title, song_artist, song_mode, song_level, song_jacket_url, song_bpm, played_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(songId, duel.id, song.id, song.title, song.artist, song.mode, song.level, song.jacket_url || '', song.bpm || '', order);

  const drawn = db.prepare('SELECT * FROM duel_songs WHERE id = ?').get(songId);
  db.close();

  res.json(drawn);
});

// POST submit score for a duel song
router.post('/:id/score', (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) { db.close(); return res.status(404).json({ error: 'Duel not found' }); }

  const { song_entry_id, player1_score, player2_score } = req.body;

  const entry = db.prepare('SELECT * FROM duel_songs WHERE id = ? AND duel_id = ?').get(song_entry_id, duel.id);
  if (!entry) { db.close(); return res.status(400).json({ error: 'Song entry not found' }); }

  const p1 = parseInt(player1_score) || 0;
  const p2 = parseInt(player2_score) || 0;
  let winner = '';
  if (p1 > p2) winner = 'player1';
  else if (p2 > p1) winner = 'player2';
  else winner = 'draw';

  db.prepare('UPDATE duel_songs SET player1_score = ?, player2_score = ?, winner = ? WHERE id = ?')
    .run(p1, p2, winner, song_entry_id);

  const updated = db.prepare('SELECT * FROM duel_songs WHERE id = ?').get(song_entry_id);
  db.close();

  res.json(updated);
});

// DELETE a duel song entry (remove last drawn card if scores not submitted)
router.delete('/:id/song/:songEntryId', (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM duel_songs WHERE id = ? AND duel_id = ?').get(req.params.songEntryId, req.params.id);
  if (!entry) { db.close(); return res.status(404).json({ error: 'Song entry not found' }); }

  db.prepare('DELETE FROM duel_songs WHERE id = ?').run(req.params.songEntryId);
  db.close();
  res.json({ success: true });
});

// POST end a duel
router.post('/:id/end', (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) { db.close(); return res.status(404).json({ error: 'Duel not found' }); }

  const songs = db.prepare('SELECT * FROM duel_songs WHERE duel_id = ?').all(duel.id);

  let p1Wins = 0, p2Wins = 0;
  songs.forEach(s => {
    if (s.winner === 'player1') p1Wins++;
    else if (s.winner === 'player2') p2Wins++;
  });

  let winner = 'draw';
  if (p1Wins > p2Wins) winner = 'player1';
  else if (p2Wins > p1Wins) winner = 'player2';

  db.prepare('UPDATE duels SET status = ?, winner = ? WHERE id = ?')
    .run('COMPLETED', winner, duel.id);

  const updated = db.prepare('SELECT * FROM duels WHERE id = ?').get(duel.id);
  db.close();

  res.json(updated);
});

// DELETE a duel
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM duel_songs WHERE duel_id = ?').run(req.params.id);
  db.prepare('DELETE FROM duels WHERE id = ?').run(req.params.id);
  db.close();
  res.json({ success: true });
});

module.exports = router;

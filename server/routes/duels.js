const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');

function getDuelCreatorId(duel) {
  // Legacy fallback: older duels do not have creator_user_id and used player1_user_id as owner.
  return duel.creator_user_id || duel.player1_user_id || '';
}

function ensureCreatorCanOperate(req, res, duel) {
  const creatorId = getDuelCreatorId(duel);
  if (!creatorId || creatorId !== req.user.id) {
    res.status(403).json({ error: 'Only the duel creator can operate this duel' });
    return false;
  }
  return true;
}

function normalizeDuelAvatars(duel, size = 64) {
  if (!duel) return duel;
  return {
    ...duel,
    player1_avatar: normalizeUserAvatarForList(duel.player1_avatar, duel.player1_user_id, size),
    player2_avatar: normalizeUserAvatarForList(duel.player2_avatar, duel.player2_user_id, size),
  };
}

// GET all duels
router.get('/', (req, res) => {
  const db = getDb();
  const duels = db.prepare('SELECT * FROM duels ORDER BY created_at DESC').all()
    .map(d => normalizeDuelAvatars(d, 64));
  res.json(duels);
});

// GET single duel with songs
router.get('/:id', (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });

  const songs = db.prepare('SELECT * FROM duel_songs WHERE duel_id = ? ORDER BY played_order ASC').all(duel.id);
  res.json({ ...normalizeDuelAvatars(duel, 96), songs });
});

// POST create a duel
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const {
    name, location, date, time, mode,
    player1_name, player2_name, player1_avatar, player2_avatar,
    player1_skill_title, player1_skill_level, player1_gender, player1_nationality, player1_description,
    player2_skill_title, player2_skill_level, player2_gender, player2_nationality, player2_description,
    player1_user_id, player2_user_id,
  } = req.body;

  if (!name || !player1_name || !player2_name) {
    return res.status(400).json({ error: 'Name and both player names are required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO duels (id, name, location, date, time, mode,
      player1_name, player2_name, player1_avatar, player2_avatar,
      player1_skill_title, player1_skill_level, player1_gender, player1_nationality, player1_description,
      player2_skill_title, player2_skill_level, player2_gender, player2_nationality, player2_description,
      player1_user_id, player2_user_id, creator_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, location || '', date || '', time || '', mode || 'both',
    player1_name, player2_name, player1_avatar || '', player2_avatar || '',
    player1_skill_title || '', parseInt(player1_skill_level) || 1, player1_gender || '', player1_nationality || '', player1_description || '',
    player2_skill_title || '', parseInt(player2_skill_level) || 1, player2_gender || '', player2_nationality || '', player2_description || '',
    player1_user_id || '', player2_user_id || '', req.user.id);

  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
  res.status(201).json(normalizeDuelAvatars(duel, 96));
});

// POST draw a card for a duel
router.post('/:id/draw', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (!ensureCreatorCanOperate(req, res, duel)) return;
  if (duel.status !== 'ACTIVE') return res.status(400).json({ error: 'Duel is not active' });

  const { level, draw_mode } = req.body;
  // draw_mode: 'any', 'Single', 'Double'
  // For singles-only duel mode, force Single. For doubles-only, force Double.

  let effectiveMode = draw_mode || 'any';
  if (duel.mode === 'singles') effectiveMode = 'Single';
  else if (duel.mode === 'doubles') effectiveMode = 'Double';

  if (!level) return res.status(400).json({ error: 'Level is required' });

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
  res.json(drawn);
});

// POST submit score for a duel song
router.post('/:id/score', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (!ensureCreatorCanOperate(req, res, duel)) return;

  const { song_entry_id, player1_score, player2_score } = req.body;

  const entry = db.prepare('SELECT * FROM duel_songs WHERE id = ? AND duel_id = ?').get(song_entry_id, duel.id);
  if (!entry) return res.status(400).json({ error: 'Song entry not found' });

  const p1 = parseInt(player1_score) || 0;
  const p2 = parseInt(player2_score) || 0;
  let winner = '';
  if (p1 > p2) winner = 'player1';
  else if (p2 > p1) winner = 'player2';
  else winner = 'draw';

  db.prepare('UPDATE duel_songs SET player1_score = ?, player2_score = ?, winner = ? WHERE id = ?')
    .run(p1, p2, winner, song_entry_id);

  const updated = db.prepare('SELECT * FROM duel_songs WHERE id = ?').get(song_entry_id);
  res.json(updated);
});

// DELETE a duel song entry (remove last drawn card if scores not submitted)
router.delete('/:id/song/:songEntryId', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (!ensureCreatorCanOperate(req, res, duel)) return;

  const entry = db.prepare('SELECT * FROM duel_songs WHERE id = ? AND duel_id = ?').get(req.params.songEntryId, req.params.id);
  if (!entry) return res.status(404).json({ error: 'Song entry not found' });

  db.prepare('DELETE FROM duel_songs WHERE id = ?').run(req.params.songEntryId);
  res.json({ success: true });
});

// POST end a duel
router.post('/:id/end', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (!ensureCreatorCanOperate(req, res, duel)) return;

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
  res.json(normalizeDuelAvatars(updated, 96));
});

// DELETE a duel
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (!ensureCreatorCanOperate(req, res, duel)) return;

  db.prepare('DELETE FROM duel_songs WHERE duel_id = ?').run(req.params.id);
  db.prepare('DELETE FROM duels WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

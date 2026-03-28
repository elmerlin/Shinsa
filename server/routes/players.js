const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');

const TOURNAMENT_EDITABLE_FIELDS = ['wins', 'losses', 'points', 'buchholz', 'seed_rank', 'is_active'];

function getRegisteredUserSnapshot(db, userId) {
  if (!userId) return null;
  return db.prepare(`
    SELECT
      id,
      username,
      skill_title,
      skill_level,
      pumbility,
      description,
      avatar,
      gender,
      nationality
    FROM users
    WHERE id = ?
  `).get(userId);
}

router.get('/tournament/:tournamentId', (req, res) => {
  const db = getDb();
  const players = db.prepare(
    'SELECT * FROM players WHERE tournament_id = ? ORDER BY pumbility DESC, seed_rank ASC'
  ).all(req.params.tournamentId);
  db.close();
  res.json(players);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  db.close();
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json(player);
});

router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const tournamentId = String(req.body?.tournament_id || '').trim();
  const userId = String(req.body?.user_id || '').trim();

  if (!tournamentId) {
    return res.status(400).json({ error: 'Tournament is required' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'Only registered Shinsa players can be added to tournaments' });
  }

  const tournament = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  const user = getRegisteredUserSnapshot(db, userId);
  if (!user) {
    return res.status(404).json({ error: 'Registered player not found' });
  }

  const existing = db.prepare(
    'SELECT id FROM players WHERE tournament_id = ? AND user_id = ?'
  ).get(tournamentId, userId);
  if (existing) {
    return res.status(409).json({ error: 'That player is already registered for this tournament' });
  }

  const count = db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE tournament_id = ?'
  ).get(tournamentId).count;

  db.prepare(`
    INSERT INTO players (id, tournament_id, name, skill_title, skill_level, pumbility, description, avatar, gender, nationality, seed_rank, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tournamentId,
    user.username || 'Player',
    user.skill_title || '',
    parseInt(user.skill_level, 10) || 1,
    parseInt(user.pumbility, 10) || 0,
    user.description || '',
    user.avatar || '',
    user.gender || '',
    user.nationality || '',
    count + 1,
    user.id
  );

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  res.status(201).json(player);
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Player not found' });

  const updates = {};
  for (const field of TOURNAMENT_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      updates[field] = req.body[field];
    }
  }

  const fields = Object.keys(updates);
  if (fields.length === 0) {
    return res.status(400).json({
      error: 'Player profile details are read-only here. Only tournament state can be updated.',
    });
  }

  const assignments = fields.map((field) => `${field} = ?`).join(', ');
  db.prepare(`UPDATE players SET ${assignments} WHERE id = ?`)
    .run(...fields.map((field) => updates[field]), req.params.id);

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  res.json(player);
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM players WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Player not found' });
  db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

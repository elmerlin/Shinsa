const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

// GET players for a tournament
router.get('/tournament/:tournamentId', (req, res) => {
  const db = getDb();
  const players = db.prepare(
    'SELECT * FROM players WHERE tournament_id = ? ORDER BY seed_rank ASC, pumbility DESC'
  ).all(req.params.tournamentId);
  db.close();
  res.json(players);
});

// GET single player
router.get('/:id', (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  db.close();
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json(player);
});

// POST create player
router.post('/', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const { tournament_id, name, bio, avatar_url, skill_title, pumbility } = req.body;

  // Get current player count for seed rank
  const count = db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE tournament_id = ?'
  ).get(tournament_id).count;

  db.prepare(`
    INSERT INTO players (id, tournament_id, name, bio, avatar_url, skill_title, pumbility, seed_rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tournament_id, name, bio || '', avatar_url || '', skill_title || '', pumbility || 0, count + 1);

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  db.close();
  res.status(201).json(player);
});

// PUT update player
router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, bio, avatar_url, skill_title, pumbility, wins, losses, draws, buchholz, seed_rank, is_active } = req.body;

  db.prepare(`
    UPDATE players SET
      name = COALESCE(?, name),
      bio = COALESCE(?, bio),
      avatar_url = COALESCE(?, avatar_url),
      skill_title = COALESCE(?, skill_title),
      pumbility = COALESCE(?, pumbility),
      wins = COALESCE(?, wins),
      losses = COALESCE(?, losses),
      draws = COALESCE(?, draws),
      buchholz = COALESCE(?, buchholz),
      seed_rank = COALESCE(?, seed_rank),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(name, bio, avatar_url, skill_title, pumbility, wins, losses, draws, buchholz, seed_rank, is_active, req.params.id);

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  db.close();
  res.json(player);
});

// PUT bulk update seed ranks
router.put('/tournament/:tournamentId/reorder', (req, res) => {
  const db = getDb();
  const { order } = req.body; // [{id, seed_rank}]

  const stmt = db.prepare('UPDATE players SET seed_rank = ? WHERE id = ?');
  const update = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item.seed_rank, item.id);
    }
  });
  update(order);

  const players = db.prepare(
    'SELECT * FROM players WHERE tournament_id = ? ORDER BY seed_rank ASC'
  ).all(req.params.tournamentId);
  db.close();
  res.json(players);
});

// DELETE player
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  db.close();
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

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

router.post('/', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const { tournament_id, name, skill_title, skill_level, pumbility } = req.body;

  const count = db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE tournament_id = ?'
  ).get(tournament_id).count;

  db.prepare(`
    INSERT INTO players (id, tournament_id, name, skill_title, skill_level, pumbility, seed_rank)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, tournament_id, name, skill_title || '', skill_level || 1, pumbility || 0, count + 1);

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  db.close();
  res.status(201).json(player);
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, skill_title, skill_level, pumbility, wins, losses, points, buchholz, seed_rank, is_active } = req.body;

  db.prepare(`
    UPDATE players SET
      name = COALESCE(?, name),
      skill_title = COALESCE(?, skill_title),
      skill_level = COALESCE(?, skill_level),
      pumbility = COALESCE(?, pumbility),
      wins = COALESCE(?, wins),
      losses = COALESCE(?, losses),
      points = COALESCE(?, points),
      buchholz = COALESCE(?, buchholz),
      seed_rank = COALESCE(?, seed_rank),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(name, skill_title, skill_level, pumbility, wins, losses, points, buchholz, seed_rank, is_active, req.params.id);

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  db.close();
  res.json(player);
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  db.close();
  res.json({ success: true });
});

module.exports = router;

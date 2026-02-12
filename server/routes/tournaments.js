const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

router.get('/', (req, res) => {
  const db = getDb();
  const tournaments = db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC').all();
  db.close();
  res.json(tournaments);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  tournament.config = JSON.parse(tournament.config || '{}');
  res.json(tournament);
});

router.post('/', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const { name, location, date, total_rounds, config } = req.body;

  const defaultConfig = {
    round_levels: [
      { round: 1, min: 18, max: 19 },
      { round: 2, min: 20, max: 21 },
      { round: 3, min: 22, max: 23 },
    ],
    cards_per_draw: 5,
    vetoes_per_player: 1,
    best_of: 3,
  };

  db.prepare(`
    INSERT INTO tournaments (id, name, location, date, total_rounds, config)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, location || '', date || new Date().toISOString().split('T')[0],
    total_rounds || 3, JSON.stringify(config || defaultConfig));

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  db.close();
  tournament.config = JSON.parse(tournament.config);
  res.status(201).json(tournament);
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, location, date, phase, current_round, total_rounds, config } = req.body;
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!existing) { db.close(); return res.status(404).json({ error: 'Not found' }); }

  db.prepare(`
    UPDATE tournaments SET
      name = COALESCE(?, name),
      location = COALESCE(?, location),
      date = COALESCE(?, date),
      phase = COALESCE(?, phase),
      current_round = COALESCE(?, current_round),
      total_rounds = COALESCE(?, total_rounds),
      config = COALESCE(?, config)
    WHERE id = ?
  `).run(name, location, date, phase, current_round, total_rounds,
    config ? JSON.stringify(config) : null, req.params.id);

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  updated.config = JSON.parse(updated.config);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
  db.close();
  res.json({ success: true });
});

module.exports = router;

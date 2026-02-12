const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

// GET all tournaments
router.get('/', (req, res) => {
  const db = getDb();
  const tournaments = db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC').all();
  db.close();
  res.json(tournaments);
});

// GET single tournament
router.get('/:id', (req, res) => {
  const db = getDb();
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  tournament.config = JSON.parse(tournament.config || '{}');
  res.json(tournament);
});

// POST create tournament
router.post('/', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const { name, location, date, swiss_rounds, koth_top_n, config } = req.body;

  const defaultConfig = {
    swiss_levels: [
      { round: 1, min: 18, max: 19 },
      { round: 2, min: 20, max: 21 },
      { round: 3, min: 22, max: 23 },
    ],
    koth_start_level: 20,
    koth_level_increment: 1,
    koth_max_level: 27,
    cards_per_draw: 5,
    vetoes_per_player: 1,
    best_of: 3,
    finals_best_of: 5,
    modes: ['Single', 'Double'],
  };

  db.prepare(`
    INSERT INTO tournaments (id, name, location, date, swiss_rounds, koth_top_n, config)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, location || '', date || new Date().toISOString().split('T')[0],
    swiss_rounds || 3, koth_top_n || 8, JSON.stringify(config || defaultConfig));

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  db.close();
  tournament.config = JSON.parse(tournament.config);
  res.status(201).json(tournament);
});

// PUT update tournament
router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, location, date, phase, current_round, swiss_rounds, koth_top_n, config } = req.body;
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!existing) { db.close(); return res.status(404).json({ error: 'Not found' }); }

  db.prepare(`
    UPDATE tournaments SET
      name = COALESCE(?, name),
      location = COALESCE(?, location),
      date = COALESCE(?, date),
      phase = COALESCE(?, phase),
      current_round = COALESCE(?, current_round),
      swiss_rounds = COALESCE(?, swiss_rounds),
      koth_top_n = COALESCE(?, koth_top_n),
      config = COALESCE(?, config)
    WHERE id = ?
  `).run(name, location, date, phase, current_round, swiss_rounds, koth_top_n,
    config ? JSON.stringify(config) : null, req.params.id);

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  updated.config = JSON.parse(updated.config);
  res.json(updated);
});

// DELETE tournament
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
  db.close();
  res.json({ success: true });
});

module.exports = router;

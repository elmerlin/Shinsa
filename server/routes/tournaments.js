const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { enrichTournamentSummaries, parseTournamentConfig } = require('../lib/tournamentSummary');

// GET all tournaments (excludes archived by default, ?include_archived=1 to include)
router.get('/', (req, res) => {
  const db = getDb();
  const includeArchived = req.query.include_archived === '1';
  const tournaments = includeArchived
    ? db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM tournaments WHERE archived = 0 ORDER BY created_at DESC').all();
  db.close();
  res.json(tournaments);
});

// GET search tournaments (searches name, location, and player names)
router.get('/search', (req, res) => {
  const db = getDb();
  const q = req.query.q || '';
  if (!q.trim()) {
    db.close();
    return res.json([]);
  }
  const pattern = `%${q}%`;
  const tournaments = db.prepare(`
    SELECT DISTINCT t.* FROM tournaments t
    LEFT JOIN players p ON p.tournament_id = t.id
    WHERE t.archived = 0
      AND (t.name LIKE ? OR t.location LIKE ? OR p.name LIKE ?)
    ORDER BY t.created_at DESC
  `).all(pattern, pattern, pattern);
  const enriched = enrichTournamentSummaries(db, tournaments);
  db.close();
  res.json(enriched);
});

// GET archived tournaments
router.get('/archived', (req, res) => {
  const db = getDb();
  const tournaments = db.prepare('SELECT * FROM tournaments WHERE archived = 1 ORDER BY created_at DESC').all();
  db.close();
  res.json(tournaments);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  tournament.config = parseTournamentConfig(tournament.config);
  res.json(tournament);
});

router.post('/', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const { name, location, date, total_rounds, config, avatar, gif_avatar } = req.body;

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
    INSERT INTO tournaments (id, name, location, date, total_rounds, config, avatar, gif_avatar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, location || '', date || new Date().toISOString().split('T')[0],
    total_rounds || 3, JSON.stringify(config || defaultConfig), avatar || '', gif_avatar || '');

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  db.close();
  tournament.config = parseTournamentConfig(tournament.config);
  res.status(201).json(tournament);
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, location, date, phase, current_round, total_rounds, config, avatar, gif_avatar, poster_bg } = req.body;
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
      config = COALESCE(?, config),
      avatar = COALESCE(?, avatar),
      gif_avatar = COALESCE(?, gif_avatar),
      poster_bg = COALESCE(?, poster_bg)
    WHERE id = ?
  `).run(name, location, date, phase, current_round, total_rounds,
    config ? JSON.stringify(config) : null,
    avatar !== undefined ? avatar : null,
    gif_avatar !== undefined ? gif_avatar : null,
    poster_bg !== undefined ? poster_bg : null,
    req.params.id);

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  updated.config = parseTournamentConfig(updated.config);
  res.json(updated);
});

// PUT archive/unarchive a tournament
router.put('/:id/archive', (req, res) => {
  const db = getDb();
  const { archived } = req.body;
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!existing) { db.close(); return res.status(404).json({ error: 'Not found' }); }

  db.prepare('UPDATE tournaments SET archived = ? WHERE id = ?')
    .run(archived ? 1 : 0, req.params.id);

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
  db.close();
  res.json({ success: true });
});

module.exports = router;

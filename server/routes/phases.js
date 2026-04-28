const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { parsePlacementSnapshots, sortRoundRobinPlayers, syncTournamentPlacementSnapshots } = require('../lib/tournamentPlacings');

function normalizePhaseRow(phase) {
  if (!phase) return phase;
  return {
    ...phase,
    config: JSON.parse(phase.config || '{}'),
    advancement: JSON.parse(phase.advancement || '{}'),
    placement_snapshots: parsePlacementSnapshots(phase.placement_snapshots),
  };
}

// GET all phases for a tournament
router.get('/tournament/:tournamentId', (req, res) => {
  const db = getDb();
  const phases = db.prepare('SELECT * FROM tournament_phases WHERE tournament_id = ? ORDER BY phase_order').all(req.params.tournamentId);
  res.json(phases.map(normalizePhaseRow));
});

// GET single phase
router.get('/:id', (req, res) => {
  const db = getDb();
  const phase = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.id);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });

  const players = db.prepare(
    'SELECT pp.*, p.name, p.pumbility, p.skill_title, p.skill_level FROM tournament_phase_players pp JOIN players p ON pp.player_id = p.id WHERE pp.phase_id = ? ORDER BY pp.seed'
  ).all(phase.id);

  res.json({
    ...normalizePhaseRow(phase),
    players,
  });
});

// POST create a phase
router.post('/', (req, res) => {
  const db = getDb();
  const { tournament_id, phase_order, format, name, config, advancement } = req.body;

  if (!tournament_id || phase_order == null || !format) {
    return res.status(400).json({ error: 'tournament_id, phase_order, and format are required' });
  }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournament_id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO tournament_phases (id, tournament_id, phase_order, format, name, config, advancement, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
  `).run(
    id,
    tournament_id,
    phase_order,
    format,
    name || '',
    JSON.stringify(config || {}),
    JSON.stringify(advancement || {}),
  );

  const phase = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(id);
  res.status(201).json(normalizePhaseRow(phase));
});

// PUT update a phase
router.put('/:id', (req, res) => {
  const db = getDb();
  const phase = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.id);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });
  if (phase.status !== 'PENDING') return res.status(400).json({ error: 'Can only update PENDING phases' });

  const { format, name, config, advancement, phase_order } = req.body;
  const updates = [];
  const params = [];

  if (format !== undefined) { updates.push('format = ?'); params.push(format); }
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }
  if (advancement !== undefined) { updates.push('advancement = ?'); params.push(JSON.stringify(advancement)); }
  if (phase_order !== undefined) { updates.push('phase_order = ?'); params.push(phase_order); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id);
  db.prepare(`UPDATE tournament_phases SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.id);
  res.json(normalizePhaseRow(updated));
});

// DELETE a phase
router.delete('/:id', (req, res) => {
  const db = getDb();
  const phase = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.id);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });
  if (phase.status !== 'PENDING') return res.status(400).json({ error: 'Can only delete PENDING phases' });

  db.prepare('DELETE FROM tournament_phases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST activate a phase
router.post('/:id/activate', (req, res) => {
  const db = getDb();
  const phase = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.id);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });
  if (phase.status !== 'PENDING') return res.status(400).json({ error: 'Phase is not PENDING' });

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(phase.tournament_id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const activate = db.transaction(() => {
    let advancingPlayers = [];

    // Check for previous phase
    const prevPhase = db.prepare(
      'SELECT * FROM tournament_phases WHERE tournament_id = ? AND phase_order = ?'
    ).get(phase.tournament_id, phase.phase_order - 1);

    if (prevPhase) {
      const advancement = JSON.parse(prevPhase.advancement || '{}');
      const prevPlayers = db.prepare(
        'SELECT pp.*, p.name, p.pumbility, p.skill_title, p.skill_level FROM tournament_phase_players pp JOIN players p ON pp.player_id = p.id WHERE pp.phase_id = ? AND pp.status = ? ORDER BY pp.seed ASC'
      ).all(prevPhase.id, 'active');
      const prevMatches = db.prepare(
        'SELECT * FROM matches WHERE phase_id = ? ORDER BY pool_id ASC, schedule_order ASC, created_at ASC, id ASC'
      ).all(prevPhase.id);
      const rankablePrevPhase = prevPhase.format === 'round_robin' || prevPhase.format === 'pools';
      const rankedPrevPlayers = rankablePrevPhase
        ? sortRoundRobinPlayers(prevPlayers, prevMatches)
        : prevPlayers;

      if (advancement.type === 'top_n') {
        advancingPlayers = rankedPrevPlayers.slice(0, advancement.count || rankedPrevPlayers.length);
      } else if (advancement.type === 'per_pool_top_n') {
        const pools = {};
        prevPlayers.forEach(p => {
          if (!pools[p.pool_id]) pools[p.pool_id] = [];
          pools[p.pool_id].push(p);
        });
        for (const poolId of Object.keys(pools).sort()) {
          const poolMatches = prevMatches.filter((match) => String(match.pool_id || 0) === String(poolId));
          const poolPlayers = rankablePrevPhase
            ? sortRoundRobinPlayers(pools[poolId], poolMatches)
            : pools[poolId];
          advancingPlayers.push(...poolPlayers.slice(0, advancement.count || poolPlayers.length));
        }
      } else if (advancement.type === 'threshold') {
        advancingPlayers = rankedPrevPlayers.filter(p => p.points >= (advancement.threshold || 0));
      } else {
        // Default: all active players advance
        advancingPlayers = rankedPrevPlayers;
      }

      // Mark non-advancing players as eliminated in previous phase
      const advancingIds = new Set(advancingPlayers.map(p => p.player_id));
      for (const p of prevPlayers) {
        if (!advancingIds.has(p.player_id)) {
          db.prepare("UPDATE tournament_phase_players SET status = 'eliminated' WHERE id = ?").run(p.id);
          db.prepare("UPDATE players SET eliminated_at_phase = ? WHERE id = ?").run(prevPhase.id, p.player_id);
        }
      }
    } else {
      // First phase: take all active tournament players
      advancingPlayers = db.prepare(
        'SELECT *, id as player_id FROM players WHERE tournament_id = ? AND is_active = 1 ORDER BY pumbility DESC'
      ).all(phase.tournament_id);
    }

    // Create tournament_phase_players entries
    const insertPlayer = db.prepare(`
      INSERT INTO tournament_phase_players (id, phase_id, player_id, pool_id, seed, wins, losses, points, buchholz, status)
      VALUES (?, ?, ?, 0, ?, 0, 0, 0, 0, 'active')
    `);

    for (let i = 0; i < advancingPlayers.length; i++) {
      const playerId = advancingPlayers[i].player_id || advancingPlayers[i].id;
      insertPlayer.run(uuidv4(), phase.id, playerId, i + 1);
    }

    // Update phase status
    db.prepare("UPDATE tournament_phases SET status = 'ACTIVE' WHERE id = ?").run(phase.id);

    // Update tournament
    const formatToPhase = {
      round_robin: 'ROUND_ROBIN',
      pools: 'POOLS',
      single_elim: 'BRACKET',
      double_elim: 'BRACKET',
      gauntlet: 'GAUNTLET',
      hour_of_power: 'HOUR_OF_POWER',
    };
    const tournamentPhase = formatToPhase[phase.format] || phase.format.toUpperCase();
    db.prepare('UPDATE tournaments SET current_phase_id = ?, phase = ? WHERE id = ?')
      .run(phase.id, tournamentPhase, phase.tournament_id);

    return advancingPlayers.length;
  });

  const playerCount = activate();

  const updated = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.id);
  const phasePlayers = db.prepare(
    'SELECT pp.*, p.name, p.pumbility FROM tournament_phase_players pp JOIN players p ON pp.player_id = p.id WHERE pp.phase_id = ? ORDER BY pp.seed'
  ).all(phase.id);

  res.json({
    ...normalizePhaseRow(updated),
    players: phasePlayers,
    advanced_count: playerCount,
  });
});

// POST complete a phase
router.post('/:id/complete', (req, res) => {
  const db = getDb();
  const phase = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.id);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });
  if (phase.status !== 'ACTIVE') return res.status(400).json({ error: 'Phase is not ACTIVE' });

  // Verify all matches are completed
  const pendingMatches = db.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE phase_id = ? AND status NOT IN ('COMPLETED', 'BYE')"
  ).get(phase.id);

  if (pendingMatches.cnt > 0) {
    return res.status(400).json({
      error: `Cannot complete phase: ${pendingMatches.cnt} matches are not yet completed`,
    });
  }

  const complete = db.transaction(() => {
    db.prepare("UPDATE tournament_phases SET status = 'COMPLETED' WHERE id = ?").run(phase.id);

    // Check for next phase
    const nextPhase = db.prepare(
      'SELECT * FROM tournament_phases WHERE tournament_id = ? AND phase_order = ?'
    ).get(phase.tournament_id, phase.phase_order + 1);

    if (!nextPhase) {
      // No next phase - tournament is done
      db.prepare("UPDATE tournaments SET phase = 'COMPLETED' WHERE id = ?").run(phase.tournament_id);
    }
  });

  complete();
  syncTournamentPlacementSnapshots(db, phase.tournament_id);

  const updated = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.id);
  res.json(normalizePhaseRow(updated));
});

module.exports = router;

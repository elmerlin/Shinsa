const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

// GET matches for a tournament (optionally filter by round)
router.get('/tournament/:tournamentId', (req, res) => {
  const db = getDb();
  const { round, phase } = req.query;
  let query = 'SELECT * FROM matches WHERE tournament_id = ?';
  const params = [req.params.tournamentId];

  if (round) { query += ' AND round_number = ?'; params.push(parseInt(round)); }
  if (phase) { query += ' AND stage_phase = ?'; params.push(phase); }
  query += ' ORDER BY round_number ASC, koth_position ASC';

  const matches = db.prepare(query).all(...params);
  db.close();

  // Parse JSON fields
  const parsed = matches.map(m => ({
    ...m,
    drawn_songs: JSON.parse(m.drawn_songs || '[]'),
    vetoed_songs: JSON.parse(m.vetoed_songs || '[]'),
    played_songs: JSON.parse(m.played_songs || '[]'),
    scores: JSON.parse(m.scores || '{}'),
  }));
  res.json(parsed);
});

// GET single match with player details
router.get('/:id', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

  const player1 = match.player1_id ? db.prepare('SELECT * FROM players WHERE id = ?').get(match.player1_id) : null;
  const player2 = match.player2_id ? db.prepare('SELECT * FROM players WHERE id = ?').get(match.player2_id) : null;
  db.close();

  res.json({
    ...match,
    drawn_songs: JSON.parse(match.drawn_songs || '[]'),
    vetoed_songs: JSON.parse(match.vetoed_songs || '[]'),
    played_songs: JSON.parse(match.played_songs || '[]'),
    scores: JSON.parse(match.scores || '{}'),
    player1,
    player2,
  });
});

// POST generate Swiss round pairings
router.post('/tournament/:tournamentId/swiss-round', (req, res) => {
  const db = getDb();
  const tournamentId = req.params.tournamentId;
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) { db.close(); return res.status(404).json({ error: 'Tournament not found' }); }

  const config = JSON.parse(tournament.config || '{}');
  const roundNumber = tournament.current_round + 1;

  // Get level range for this round
  const levelConfig = (config.swiss_levels || []).find(l => l.round === roundNumber)
    || { min: 18 + (roundNumber - 1) * 2, max: 19 + (roundNumber - 1) * 2 };

  // Get all active players
  const players = db.prepare(
    'SELECT * FROM players WHERE tournament_id = ? AND is_active = 1 ORDER BY wins DESC, pumbility DESC'
  ).all(tournamentId);

  // Get match history to avoid repeat pairings
  const history = db.prepare(
    'SELECT player1_id, player2_id FROM matches WHERE tournament_id = ? AND stage_phase = ?'
  ).all(tournamentId, 'SWISS');

  const hasPlayed = (p1Id, p2Id) => {
    return history.some(h =>
      (h.player1_id === p1Id && h.player2_id === p2Id) ||
      (h.player1_id === p2Id && h.player2_id === p1Id)
    );
  };

  // Swiss pairing algorithm
  const pairs = [];
  const pairedIds = new Set();

  for (let i = 0; i < players.length; i++) {
    const p1 = players[i];
    if (pairedIds.has(p1.id)) continue;

    let opponent = null;
    for (let j = i + 1; j < players.length; j++) {
      const p2 = players[j];
      if (!pairedIds.has(p2.id) && !hasPlayed(p1.id, p2.id)) {
        opponent = p2;
        break;
      }
    }

    // Fallback: pick next available
    if (!opponent) {
      opponent = players.find((p, idx) => idx > i && !pairedIds.has(p.id));
    }

    if (opponent) {
      pairs.push({ player1: p1, player2: opponent });
      pairedIds.add(p1.id);
      pairedIds.add(opponent.id);
    } else {
      // BYE
      pairs.push({ player1: p1, player2: null });
      pairedIds.add(p1.id);
    }
  }

  // Create match records
  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, stage_phase, difficulty_min, difficulty_max, is_bye, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createRound = db.transaction(() => {
    for (const pair of pairs) {
      const isBye = pair.player2 === null;
      insertMatch.run(
        uuidv4(), tournamentId, roundNumber,
        pair.player1.id,
        pair.player2 ? pair.player2.id : null,
        'SWISS', levelConfig.min, levelConfig.max,
        isBye ? 1 : 0,
        isBye ? 'COMPLETED' : 'PENDING'
      );

      // Auto-win for bye
      if (isBye) {
        db.prepare('UPDATE players SET wins = wins + 1 WHERE id = ?').run(pair.player1.id);
      }
    }

    db.prepare('UPDATE tournaments SET current_round = ?, phase = ? WHERE id = ?')
      .run(roundNumber, 'SWISS', tournamentId);
  });

  createRound();

  const matches = db.prepare(
    'SELECT * FROM matches WHERE tournament_id = ? AND round_number = ? ORDER BY koth_position ASC'
  ).all(tournamentId, roundNumber);
  db.close();

  res.status(201).json(matches.map(m => ({
    ...m,
    drawn_songs: JSON.parse(m.drawn_songs || '[]'),
    vetoed_songs: JSON.parse(m.vetoed_songs || '[]'),
    played_songs: JSON.parse(m.played_songs || '[]'),
    scores: JSON.parse(m.scores || '{}'),
  })));
});

// POST draw cards for a match
router.post('/:id/draw', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(match.tournament_id);
  const config = JSON.parse(tournament.config || '{}');
  const count = config.cards_per_draw || 5;
  const modes = config.modes || ['Single', 'Double'];

  // Build query for song pool
  const placeholders = modes.map(() => '?').join(',');
  const songs = db.prepare(`
    SELECT * FROM songs WHERE level >= ? AND level <= ? AND mode IN (${placeholders})
  `).all(match.difficulty_min, match.difficulty_max, ...modes);

  if (songs.length < count) {
    db.close();
    return res.status(400).json({
      error: `Not enough songs in pool. Found ${songs.length}, need ${count}`,
      available: songs.length,
    });
  }

  // Fisher-Yates shuffle
  const shuffled = [...songs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const drawn = shuffled.slice(0, count);

  db.prepare('UPDATE matches SET drawn_songs = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(drawn), 'DRAWING', req.params.id);
  db.close();

  res.json({ drawn_songs: drawn });
});

// POST veto a song
router.post('/:id/veto', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

  const { song_id, player_id } = req.body;
  const drawnSongs = JSON.parse(match.drawn_songs || '[]');
  const vetoedSongs = JSON.parse(match.vetoed_songs || '[]');

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(match.tournament_id);
  const config = JSON.parse(tournament.config || '{}');
  const maxVetoes = (config.vetoes_per_player || 1) * 2;

  if (vetoedSongs.length >= maxVetoes) {
    db.close();
    return res.status(400).json({ error: 'All vetoes have been used' });
  }

  const songToVeto = drawnSongs.find(s => s.id === song_id);
  if (!songToVeto) { db.close(); return res.status(400).json({ error: 'Song not in draw' }); }

  if (vetoedSongs.find(v => v.song_id === song_id)) {
    db.close();
    return res.status(400).json({ error: 'Song already vetoed' });
  }

  vetoedSongs.push({ song_id, player_id, song: songToVeto });

  const newStatus = vetoedSongs.length >= maxVetoes ? 'READY' : 'VETOING';

  db.prepare('UPDATE matches SET vetoed_songs = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(vetoedSongs), newStatus, req.params.id);
  db.close();

  const playedSongs = drawnSongs.filter(s => !vetoedSongs.find(v => v.song_id === s.id));

  res.json({ vetoed_songs: vetoedSongs, played_songs: playedSongs, status: newStatus });
});

// POST submit match result
router.post('/:id/result', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

  const { winner_id, played_songs, scores } = req.body;
  // played_songs: [{song_id, song, p1_score, p2_score, song_winner_id}]
  // scores: {player1_wins: 2, player2_wins: 1}

  const submitResult = db.transaction(() => {
    db.prepare(`
      UPDATE matches SET winner_id = ?, played_songs = ?, scores = ?, status = ? WHERE id = ?
    `).run(winner_id, JSON.stringify(played_songs), JSON.stringify(scores), 'COMPLETED', req.params.id);

    // Update player records
    if (match.player1_id && match.player2_id) {
      if (winner_id === match.player1_id) {
        db.prepare('UPDATE players SET wins = wins + 1 WHERE id = ?').run(match.player1_id);
        db.prepare('UPDATE players SET losses = losses + 1 WHERE id = ?').run(match.player2_id);
      } else if (winner_id === match.player2_id) {
        db.prepare('UPDATE players SET wins = wins + 1 WHERE id = ?').run(match.player2_id);
        db.prepare('UPDATE players SET losses = losses + 1 WHERE id = ?').run(match.player1_id);
      }
    }
  });

  submitResult();

  // Calculate Buchholz scores for all players in tournament
  updateBuchholz(db, match.tournament_id);

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  db.close();
  res.json({
    ...updated,
    played_songs: JSON.parse(updated.played_songs || '[]'),
    scores: JSON.parse(updated.scores || '{}'),
  });
});

function updateBuchholz(db, tournamentId) {
  const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(tournamentId);
  const matches = db.prepare(
    'SELECT * FROM matches WHERE tournament_id = ? AND stage_phase = ? AND status = ?'
  ).all(tournamentId, 'SWISS', 'COMPLETED');

  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  for (const player of players) {
    let buchholz = 0;
    for (const m of matches) {
      if (m.player1_id === player.id && m.player2_id && playerMap[m.player2_id]) {
        buchholz += playerMap[m.player2_id].wins;
      } else if (m.player2_id === player.id && m.player1_id && playerMap[m.player1_id]) {
        buchholz += playerMap[m.player1_id].wins;
      }
    }
    db.prepare('UPDATE players SET buchholz = ? WHERE id = ?').run(buchholz, player.id);
  }
}

// POST generate King of the Hill matches
router.post('/tournament/:tournamentId/koth', (req, res) => {
  const db = getDb();
  const tournamentId = req.params.tournamentId;
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) { db.close(); return res.status(404).json({ error: 'Tournament not found' }); }

  const config = JSON.parse(tournament.config || '{}');
  const topN = tournament.koth_top_n || 8;

  // Get ranked players
  const players = db.prepare(`
    SELECT * FROM players WHERE tournament_id = ? AND is_active = 1
    ORDER BY wins DESC, buchholz DESC, pumbility DESC
    LIMIT ?
  `).all(tournamentId, topN);

  if (players.length < 2) {
    db.close();
    return res.status(400).json({ error: 'Need at least 2 players for KotH' });
  }

  // Assign final ranks
  players.forEach((p, i) => {
    db.prepare('UPDATE players SET seed_rank = ? WHERE id = ?').run(i + 1, p.id);
  });

  const startLevel = config.koth_start_level || 20;
  const levelIncrement = config.koth_level_increment || 1;
  const maxLevel = config.koth_max_level || 27;

  // Generate KotH ladder matches
  // Match 1: Rank N vs Rank N-1 at start level
  // Match 2: Winner vs Rank N-2 at start level + 1
  // ...until Finals vs Rank 1
  const kothMatches = [];
  const totalMatches = players.length - 1;

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, stage_phase, difficulty_min, difficulty_max, koth_position, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createKoth = db.transaction(() => {
    for (let i = 0; i < totalMatches; i++) {
      const matchLevel = Math.min(startLevel + i, maxLevel);
      const isFinals = i === totalMatches - 1;
      const position = i + 1;

      // First match: last place vs second to last
      // Subsequent: winner of previous vs next rank up
      let p1Id, p2Id;
      if (i === 0) {
        p1Id = players[players.length - 1].id; // Lowest rank
        p2Id = players[players.length - 2].id; // Second lowest
      } else {
        p1Id = null; // Winner of previous match (TBD)
        p2Id = players[players.length - 2 - i].id; // Next rank up
      }

      const matchId = uuidv4();
      insertMatch.run(
        matchId, tournamentId, 999, p1Id, p2Id,
        'KOTH', matchLevel, matchLevel,
        position, i === 0 ? 'PENDING' : 'WAITING'
      );
      kothMatches.push(matchId);
    }

    db.prepare('UPDATE tournaments SET phase = ? WHERE id = ?').run('KOTH', tournamentId);
  });

  createKoth();

  const matches = db.prepare(
    'SELECT * FROM matches WHERE tournament_id = ? AND stage_phase = ? ORDER BY koth_position ASC'
  ).all(tournamentId, 'KOTH');
  db.close();

  res.status(201).json(matches.map(m => ({
    ...m,
    drawn_songs: JSON.parse(m.drawn_songs || '[]'),
    vetoed_songs: JSON.parse(m.vetoed_songs || '[]'),
    played_songs: JSON.parse(m.played_songs || '[]'),
    scores: JSON.parse(m.scores || '{}'),
  })));
});

// POST advance KotH (after a match completes, set winner as p1 of next match)
router.post('/:id/koth-advance', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match || !match.winner_id) {
    db.close();
    return res.status(400).json({ error: 'Match not completed or no winner' });
  }

  // Find next KotH match
  const nextMatch = db.prepare(`
    SELECT * FROM matches WHERE tournament_id = ? AND stage_phase = 'KOTH' AND koth_position = ?
  `).get(match.tournament_id, match.koth_position + 1);

  if (nextMatch) {
    db.prepare('UPDATE matches SET player1_id = ?, status = ? WHERE id = ?')
      .run(match.winner_id, 'PENDING', nextMatch.id);
  }

  db.close();

  if (nextMatch) {
    res.json({ next_match_id: nextMatch.id, advanced_player: match.winner_id });
  } else {
    res.json({ tournament_complete: true, champion: match.winner_id });
  }
});

module.exports = router;

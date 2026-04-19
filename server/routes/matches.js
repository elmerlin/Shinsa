const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const {
  generateSingleElimBracket,
  generateDoubleElimBracket,
  generatePoolAssignments,
  advanceWinner,
  processByes,
} = require('../lib/bracketGenerator');

function parseMatchJSON(m) {
  return {
    ...m,
    drawn_songs: JSON.parse(m.drawn_songs || '[]'),
    vetoed_songs: JSON.parse(m.vetoed_songs || '[]'),
    played_songs: JSON.parse(m.played_songs || '[]'),
    scores: JSON.parse(m.scores || '{}'),
  };
}

function parseConfig(rawConfig) {
  if (rawConfig && typeof rawConfig === 'object') return rawConfig;
  try {
    return JSON.parse(rawConfig || '{}');
  } catch {
    return {};
  }
}

function getGauntletLevelBounds(config = {}) {
  const startLevel = parseInt(
    config.start_level
      ?? config.start_single_level
      ?? config.gauntlet_start_level
      ?? config.gauntlet_start_single_level,
    10
  ) || 19;
  const finalLevel = parseInt(
    config.final_level
      ?? config.final_single_level
      ?? config.gauntlet_final_level
      ?? config.gauntlet_final_single_level,
    10
  ) || 24;
  return { startLevel, finalLevel };
}

function getGauntletMatchRules(config = {}) {
  const bestOf = parseInt(config.best_of ?? config.gauntlet_best_of, 10) === 1 ? 1 : 3;
  return {
    best_of: bestOf,
    cards_per_draw: bestOf === 1 ? 1 : 5,
    vetoes_per_player: bestOf === 1 ? 0 : 1,
    level_mode: 'mixed',
  };
}

function getMatchRules(db, match) {
  let config = {};
  let format = match.match_type || '';

  if (match.phase_id) {
    const phase = db.prepare('SELECT format, config FROM tournament_phases WHERE id = ?').get(match.phase_id);
    if (phase) {
      format = phase.format || format;
      config = parseConfig(phase.config);
    }
  } else if (match.tournament_id) {
    const tournament = db.prepare('SELECT config FROM tournaments WHERE id = ?').get(match.tournament_id);
    if (tournament) config = parseConfig(tournament.config);
  }

  if (match.match_type === 'gauntlet' || format === 'gauntlet') {
    return getGauntletMatchRules(config);
  }

  return {
    best_of: parseInt(config.best_of, 10) || 3,
    cards_per_draw: parseInt(config.cards_per_draw, 10) || 5,
    vetoes_per_player: Number.isFinite(parseInt(config.vetoes_per_player, 10))
      ? parseInt(config.vetoes_per_player, 10)
      : 1,
    level_mode: 'range',
  };
}

function isSharedWinSeriesResult({ match, matchRules, winnerId, playedSongs, scores }) {
  if (!match || match.match_type === 'gauntlet' || match.bracket) return false;
  if (scores?.shared_win === true) return true;
  if (winnerId) return false;

  const bestOf = parseInt(matchRules?.best_of, 10) === 1 ? 1 : 3;
  if (bestOf <= 1) return false;

  const rows = Array.isArray(playedSongs) ? playedSongs : [];
  if (rows.length < bestOf) return false;

  const p1Wins = parseInt(scores?.player1_wins, 10) || 0;
  const p2Wins = parseInt(scores?.player2_wins, 10) || 0;
  return p1Wins > 0 && p1Wins === p2Wins;
}

function getPreferredSongsForLevel(db, level) {
  let songs = db.prepare('SELECT * FROM songs WHERE level = ? AND flags LIKE ?').all(level, '%cut:2%');
  if (songs.length === 0) songs = db.prepare('SELECT * FROM songs WHERE level = ?').all(level);
  return songs;
}

function mapSelectedSongs(selectedSongs = []) {
  return selectedSongs.map((song) => ({
    song_id: song.id,
    song,
    title: song.title,
    mode: song.mode,
    level: song.level,
  }));
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// GET matches for a tournament (optionally filter by round)
router.get('/tournament/:tournamentId', (req, res) => {
  const db = getDb();
  const { round } = req.query;
  let query = 'SELECT * FROM matches WHERE tournament_id = ?';
  const params = [req.params.tournamentId];

  if (round) { query += ' AND round_number = ?'; params.push(parseInt(round)); }
  query += ' ORDER BY round_number ASC, created_at ASC';

  const matches = db.prepare(query).all(...params);
  db.close();
  res.json(matches.map(parseMatchJSON));
});

// GET single match with player details
router.get('/:id', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

  const player1 = match.player1_id ? db.prepare('SELECT * FROM players WHERE id = ?').get(match.player1_id) : null;
  const player2 = match.player2_id ? db.prepare('SELECT * FROM players WHERE id = ?').get(match.player2_id) : null;
  const matchRules = getMatchRules(db, match);
  db.close();

  res.json({ ...parseMatchJSON(match), player1, player2, match_rules: matchRules });
});

// POST generate round robin matches for next round
router.post('/tournament/:tournamentId/round-robin', (req, res) => {
  const db = getDb();
  const tournamentId = req.params.tournamentId;
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) { db.close(); return res.status(404).json({ error: 'Tournament not found' }); }

  const config = JSON.parse(tournament.config || '{}');
  const roundNumber = tournament.current_round + 1;

  const roundLevels = (config.round_levels || []).find(l => l.round === roundNumber)
    || { min: 18, max: 19 };

  const players = db.prepare(
    'SELECT * FROM players WHERE tournament_id = ? AND is_active = 1 ORDER BY pumbility DESC'
  ).all(tournamentId);

  if (players.length < 2) {
    db.close();
    return res.status(400).json({ error: 'Need at least 2 players' });
  }

  const updateSeed = db.prepare('UPDATE players SET seed_rank = ? WHERE id = ?');
  players.forEach((p, i) => {
    updateSeed.run(i + 1, p.id);
    p.seed_rank = i + 1;
  });

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, difficulty_min, difficulty_max, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createRound = db.transaction(() => {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        insertMatch.run(
          uuidv4(), tournamentId, roundNumber,
          players[i].id, players[j].id,
          roundLevels.min, roundLevels.max,
          'PENDING'
        );
      }
    }
    db.prepare('UPDATE tournaments SET current_round = ?, phase = ? WHERE id = ?')
      .run(roundNumber, 'ROUND_ROBIN', tournamentId);
  });

  createRound();

  const matches = db.prepare(
    'SELECT * FROM matches WHERE tournament_id = ? AND round_number = ? ORDER BY created_at ASC'
  ).all(tournamentId, roundNumber);
  db.close();

  res.status(201).json(matches.map(parseMatchJSON));
});

// POST generate gauntlet matches from round robin standings
router.post('/tournament/:tournamentId/gauntlet', (req, res) => {
  const db = getDb();
  const tournamentId = req.params.tournamentId;
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) { db.close(); return res.status(404).json({ error: 'Tournament not found' }); }

  const config = JSON.parse(tournament.config || '{}');
  if (!config.gauntlet_enabled) {
    db.close();
    return res.status(400).json({ error: 'Gauntlet is not enabled for this tournament' });
  }

  // Check if gauntlet matches already exist
  const existing = db.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE tournament_id = ? AND match_type = 'gauntlet'"
  ).get(tournamentId);
  if (existing.cnt > 0) {
    db.close();
    return res.status(400).json({ error: 'Gauntlet has already been generated' });
  }

  // Get round robin standings: sort by wins desc, then buchholz desc, then pumbility desc
  const players = db.prepare(
    'SELECT * FROM players WHERE tournament_id = ? AND is_active = 1 ORDER BY wins DESC, buchholz DESC, pumbility DESC'
  ).all(tournamentId);

  if (players.length < 2) {
    db.close();
    return res.status(400).json({ error: 'Need at least 2 players for gauntlet' });
  }

  const { startLevel, finalLevel } = getGauntletLevelBounds(config);
  const totalMatches = players.length - 1;

  // Rankings: index 0 = 1st place, index N-1 = last place
  // Gauntlet starts from the bottom: last vs second-to-last
  // Match 1: players[N-1] vs players[N-2]
  // Match 2: winner vs players[N-3]
  // ...
  // Final: winner vs players[0]

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, difficulty_min, difficulty_max, status, match_type, gauntlet_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'gauntlet', ?)
  `);

  const createGauntlet = db.transaction(() => {
    for (let i = 0; i < totalMatches; i++) {
      const matchOrder = i + 1;
      let matchLevel;

      if (matchOrder === totalMatches) {
        matchLevel = finalLevel;
      } else {
        matchLevel = Math.min(startLevel + i, finalLevel);
      }

      // Challenger from standings (going from bottom up)
      // Match 1: challenger = second-to-last (index N-2), opponent = last (index N-1)
      // Match 2: challenger = third-from-last (index N-3), opponent = TBD (winner of match 1)
      // ...
      // Final: challenger = 1st place (index 0)
      const challengerIdx = players.length - 1 - i - 1; // ranked player for this match
      const challengerId = players[challengerIdx]?.id || null;

      let opponentId = null;
      if (i === 0) {
        // First match: opponent is the last-place player
        opponentId = players[players.length - 1].id;
      }
      // For subsequent matches, player2 (opponent) will be filled in when the previous match completes

      insertMatch.run(
        uuidv4(), tournamentId, 0,
        challengerId, opponentId,
        matchLevel, matchLevel,
        i === 0 ? 'PENDING' : 'WAITING',
        matchOrder
      );
    }

    db.prepare('UPDATE tournaments SET phase = ? WHERE id = ?')
      .run('GAUNTLET', tournamentId);
  });

  createGauntlet();

  const matches = db.prepare(
    "SELECT * FROM matches WHERE tournament_id = ? AND match_type = 'gauntlet' ORDER BY gauntlet_order ASC"
  ).all(tournamentId);
  db.close();

  res.status(201).json(matches.map(parseMatchJSON));
});

// POST draw cards for a match (5 cards: at least 2 Single + 2 Double)
router.post('/:id/draw', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const isGauntlet = match.match_type === 'gauntlet';

  if (isGauntlet) {
    const matchRules = getMatchRules(db, match);
    const matchLevel = parseInt(match.difficulty_min, 10) || parseInt(match.difficulty_max, 10) || 19;
    const songPool = getPreferredSongsForLevel(db, matchLevel);
    const minimumSongs = matchRules.best_of === 1 ? 1 : 3;

    if (songPool.length < minimumSongs) {
      db.close();
      return res.status(400).json({ error: `Not enough charts at level ${matchLevel} for this gauntlet draw` });
    }

    const drawCount = Math.min(songPool.length, matchRules.cards_per_draw || minimumSongs);
    const finalDraw = shuffle(songPool).slice(0, drawCount);

    if (matchRules.best_of === 1) {
      const selectedSongs = finalDraw.slice(0, 1);
      db.prepare('UPDATE matches SET drawn_songs = ?, played_songs = ?, status = ? WHERE id = ?')
        .run(JSON.stringify(finalDraw), JSON.stringify(mapSelectedSongs(selectedSongs)), 'READY', req.params.id);
      db.close();
      return res.json({ drawn_songs: finalDraw, played_songs: selectedSongs, status: 'READY' });
    }

    db.prepare('UPDATE matches SET drawn_songs = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(finalDraw), 'DRAWING', req.params.id);
    db.close();

    return res.json({ drawn_songs: finalDraw, status: 'DRAWING' });
  }

  // Standard round robin draw - prefer songs with cut:2 flag, fall back to all
  let allSongs = db.prepare(
    'SELECT * FROM songs WHERE level >= ? AND level <= ? AND flags LIKE ?'
  ).all(match.difficulty_min, match.difficulty_max, '%cut:2%');
  if (allSongs.length === 0) {
    allSongs = db.prepare(
      'SELECT * FROM songs WHERE level >= ? AND level <= ?'
    ).all(match.difficulty_min, match.difficulty_max);
  }

  const singles = allSongs.filter(s => s.mode === 'Single');
  const doubles = allSongs.filter(s => s.mode === 'Double');

  if (singles.length < 2) {
    db.close();
    return res.status(400).json({ error: `Not enough Single charts (found ${singles.length}, need 2)` });
  }
  if (doubles.length < 2) {
    db.close();
    return res.status(400).json({ error: `Not enough Double charts (found ${doubles.length}, need 2)` });
  }

  const shuffledSingles = shuffle(singles);
  const shuffledDoubles = shuffle(doubles);

  const drawn = [];
  const usedIds = new Set();

  for (let i = 0; i < 2; i++) {
    drawn.push(shuffledSingles[i]);
    usedIds.add(shuffledSingles[i].id);
  }
  for (let i = 0; i < 2; i++) {
    drawn.push(shuffledDoubles[i]);
    usedIds.add(shuffledDoubles[i].id);
  }

  const remaining = shuffle(allSongs.filter(s => !usedIds.has(s.id)));
  if (remaining.length > 0) {
    drawn.push(remaining[0]);
  }

  const finalDraw = shuffle(drawn);

  db.prepare('UPDATE matches SET drawn_songs = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(finalDraw), 'DRAWING', req.params.id);
  db.close();

  res.json({ drawn_songs: finalDraw });
});

// POST veto a song (higher seed vetos first)
router.post('/:id/veto', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

  const { song_id, player_id } = req.body;
  const drawnSongs = JSON.parse(match.drawn_songs || '[]');
  const vetoedSongs = JSON.parse(match.vetoed_songs || '[]');
  const isGauntlet = match.match_type === 'gauntlet';
  const matchRules = isGauntlet ? getMatchRules(db, match) : null;
  const totalVetoesAllowed = isGauntlet ? Math.max(0, drawnSongs.length - (matchRules?.best_of || 3)) : 2;
  const selectedSongCount = isGauntlet ? Math.max(1, matchRules?.best_of || 1) : 3;

  if (vetoedSongs.length >= totalVetoesAllowed) {
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
  const newStatus = vetoedSongs.length >= totalVetoesAllowed ? 'READY' : 'VETOING';

  let selectedSongs = null;
  if (newStatus === 'READY') {
    // Vetoes done - shuffle the remaining songs into the final set list
    const remaining = drawnSongs.filter(s => !vetoedSongs.find(v => v.song_id === s.id));
    selectedSongs = shuffle(remaining).slice(0, selectedSongCount);
  }

  const updateFields = selectedSongs
    ? { vetoed_songs: JSON.stringify(vetoedSongs), status: newStatus, played_songs: JSON.stringify(selectedSongs.map(s => ({ song_id: s.id, song: s, title: s.title, mode: s.mode, level: s.level }))) }
    : { vetoed_songs: JSON.stringify(vetoedSongs), status: newStatus };

  if (selectedSongs) {
    db.prepare('UPDATE matches SET vetoed_songs = ?, status = ?, played_songs = ? WHERE id = ?')
      .run(updateFields.vetoed_songs, updateFields.status, updateFields.played_songs, req.params.id);
  } else {
    db.prepare('UPDATE matches SET vetoed_songs = ?, status = ? WHERE id = ?')
      .run(updateFields.vetoed_songs, updateFields.status, req.params.id);
  }
  db.close();

  const playedSongs = drawnSongs.filter(s => !vetoedSongs.find(v => v.song_id === s.id));
  res.json({ vetoed_songs: vetoedSongs, played_songs: playedSongs, status: newStatus, selected_songs: selectedSongs });
});

// POST submit match result
router.post('/:id/result', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

  const { winner_id, played_songs, scores } = req.body;
  const matchRules = getMatchRules(db, match);
  const isGauntlet = match.match_type === 'gauntlet';
  const sharedWin = isSharedWinSeriesResult({
    match,
    matchRules,
    winnerId: winner_id,
    playedSongs: played_songs,
    scores,
  });
  const serializedScores = JSON.stringify({
    ...(scores && typeof scores === 'object' ? scores : {}),
    shared_win: sharedWin,
  });

  const submitResult = db.transaction(() => {
    db.prepare(
      'UPDATE matches SET winner_id = ?, played_songs = ?, scores = ?, status = ? WHERE id = ?'
    ).run(winner_id || null, JSON.stringify(played_songs), serializedScores, 'COMPLETED', req.params.id);

    if (!isGauntlet && match.player1_id && match.player2_id) {
      if (sharedWin) {
        db.prepare('UPDATE players SET wins = wins + 1, points = points + 1 WHERE id = ?').run(match.player1_id);
        db.prepare('UPDATE players SET wins = wins + 1, points = points + 1 WHERE id = ?').run(match.player2_id);
      } else if (winner_id === match.player1_id) {
        db.prepare('UPDATE players SET wins = wins + 1, points = points + 1 WHERE id = ?').run(match.player1_id);
        db.prepare('UPDATE players SET losses = losses + 1 WHERE id = ?').run(match.player2_id);
      } else if (winner_id === match.player2_id) {
        db.prepare('UPDATE players SET wins = wins + 1, points = points + 1 WHERE id = ?').run(match.player2_id);
        db.prepare('UPDATE players SET losses = losses + 1 WHERE id = ?').run(match.player1_id);
      }
    }

    // Gauntlet: advance winner to next match
    if (isGauntlet && winner_id) {
      const nextMatch = db.prepare(
        "SELECT * FROM matches WHERE tournament_id = ? AND match_type = 'gauntlet' AND gauntlet_order = ?"
      ).get(match.tournament_id, match.gauntlet_order + 1);

      if (nextMatch) {
        // Winner becomes player2 (the defender coming from previous match)
        db.prepare('UPDATE matches SET player2_id = ?, status = ? WHERE id = ?')
          .run(winner_id, 'PENDING', nextMatch.id);
      } else {
        // No next match - gauntlet is complete, tournament is done
        db.prepare("UPDATE tournaments SET phase = 'COMPLETED' WHERE id = ?")
          .run(match.tournament_id);
      }
    }

    // Bracket advancement (single_elim / double_elim)
    if (match.bracket && match.phase_id && winner_id) {
      const loserId = winner_id === match.player1_id ? match.player2_id : match.player1_id;
      advanceWinner(db, match, winner_id, loserId);
    }

    // Update phase player stats for phase-aware matches
    if (match.phase_id && match.player1_id && match.player2_id && !isGauntlet) {
      if (sharedWin) {
        db.prepare('UPDATE tournament_phase_players SET wins = wins + 1, points = points + 1 WHERE phase_id = ? AND player_id = ?').run(match.phase_id, match.player1_id);
        db.prepare('UPDATE tournament_phase_players SET wins = wins + 1, points = points + 1 WHERE phase_id = ? AND player_id = ?').run(match.phase_id, match.player2_id);
      } else if (winner_id === match.player1_id) {
        db.prepare('UPDATE tournament_phase_players SET wins = wins + 1, points = points + 1 WHERE phase_id = ? AND player_id = ?').run(match.phase_id, match.player1_id);
        db.prepare('UPDATE tournament_phase_players SET losses = losses + 1 WHERE phase_id = ? AND player_id = ?').run(match.phase_id, match.player2_id);
      } else if (winner_id === match.player2_id) {
        db.prepare('UPDATE tournament_phase_players SET wins = wins + 1, points = points + 1 WHERE phase_id = ? AND player_id = ?').run(match.phase_id, match.player2_id);
        db.prepare('UPDATE tournament_phase_players SET losses = losses + 1 WHERE phase_id = ? AND player_id = ?').run(match.phase_id, match.player1_id);
      }
    }
  });

  submitResult();
  if (!isGauntlet) {
    updateBuchholz(db, match.tournament_id);
  }

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  db.close();
  res.json(parseMatchJSON(updated));
});

function updateBuchholz(db, tournamentId) {
  const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(tournamentId);
  const matches = db.prepare(
    "SELECT * FROM matches WHERE tournament_id = ? AND status = 'COMPLETED'"
  ).all(tournamentId);

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

// ─── Phase-aware match generation ───────────────────────────────────

router.post('/phase/:phaseId/generate', (req, res) => {
  const db = getDb();
  const phase = db.prepare('SELECT * FROM tournament_phases WHERE id = ?').get(req.params.phaseId);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });

  const config = JSON.parse(phase.config || '{}');
  const phasePlayers = db.prepare(
    'SELECT pp.*, p.name, p.pumbility, p.skill_title, p.skill_level FROM tournament_phase_players pp JOIN players p ON pp.player_id = p.id WHERE pp.phase_id = ? AND pp.status = ? ORDER BY pp.seed'
  ).all(phase.id, 'active');

  if (phasePlayers.length < 2 && phase.format !== 'hour_of_power') {
    return res.status(400).json({ error: 'Need at least 2 active players' });
  }

  switch (phase.format) {
    case 'round_robin': return generatePhaseRoundRobin(db, phase, phasePlayers, config, res);
    case 'pools': return generatePhasePools(db, phase, phasePlayers, config, res);
    case 'single_elim': return generatePhaseSingleElim(db, phase, phasePlayers, config, res);
    case 'double_elim': return generatePhaseDoubleElim(db, phase, phasePlayers, config, res);
    case 'gauntlet': return generatePhaseGauntlet(db, phase, phasePlayers, config, res);
    case 'hour_of_power': return generatePhaseHourOfPower(db, phase, phasePlayers, config, res);
    default: return res.status(400).json({ error: `Unknown format: ${phase.format}` });
  }
});

function generatePhaseRoundRobin(db, phase, players, config, res) {
  const diffMin = config.difficulty_min || 18;
  const diffMax = config.difficulty_max || 19;

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, difficulty_min, difficulty_max, status, phase_id, pool_id)
    VALUES (?, ?, 1, ?, ?, ?, ?, 'PENDING', ?, 0)
  `);

  const createRR = db.transaction(() => {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        insertMatch.run(
          uuidv4(), phase.tournament_id,
          players[i].player_id, players[j].player_id,
          diffMin, diffMax, phase.id
        );
      }
    }
  });

  createRR();

  const matches = db.prepare(
    'SELECT * FROM matches WHERE phase_id = ? ORDER BY created_at ASC'
  ).all(phase.id);

  res.status(201).json(matches.map(parseMatchJSON));
}

function generatePhasePools(db, phase, players, config, res) {
  const poolCount = config.pool_count || 2;
  const diffMin = config.difficulty_min || 18;
  const diffMax = config.difficulty_max || 19;

  const pools = generatePoolAssignments(players, poolCount);

  // Update pool assignments in tournament_phase_players
  const updatePool = db.prepare('UPDATE tournament_phase_players SET pool_id = ? WHERE phase_id = ? AND player_id = ?');

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, difficulty_min, difficulty_max, status, phase_id, pool_id)
    VALUES (?, ?, 1, ?, ?, ?, ?, 'PENDING', ?, ?)
  `);

  const createPools = db.transaction(() => {
    for (const pool of pools) {
      // Update each player's pool assignment
      for (const player of pool.players) {
        const pid = player.player_id || player.id;
        updatePool.run(pool.pool_id, phase.id, pid);
      }

      // Generate round robin within pool
      for (let i = 0; i < pool.players.length; i++) {
        for (let j = i + 1; j < pool.players.length; j++) {
          const p1id = pool.players[i].player_id || pool.players[i].id;
          const p2id = pool.players[j].player_id || pool.players[j].id;
          insertMatch.run(
            uuidv4(), phase.tournament_id,
            p1id, p2id,
            diffMin, diffMax, phase.id, pool.pool_id
          );
        }
      }
    }
  });

  createPools();

  const matches = db.prepare(
    'SELECT * FROM matches WHERE phase_id = ? ORDER BY pool_id ASC, created_at ASC'
  ).all(phase.id);

  res.status(201).json(matches.map(parseMatchJSON));
}

function generatePhaseSingleElim(db, phase, players, config, res) {
  const diffMin = config.difficulty_min || 18;
  const diffMax = config.difficulty_max || 19;

  const bracketMatches = generateSingleElimBracket(players, { difficulty_min: diffMin, difficulty_max: diffMax });

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, difficulty_min, difficulty_max, status, phase_id, bracket, bracket_round, bracket_position)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, 'winners', ?, ?)
  `);

  const create = db.transaction(() => {
    for (const m of bracketMatches) {
      insertMatch.run(
        uuidv4(), phase.tournament_id,
        m.player1_id, m.player2_id,
        m.difficulty_min, m.difficulty_max,
        m.status, phase.id,
        m.bracket_round, m.bracket_position
      );
    }
    // Process byes
    processByes(db, phase.id);
  });

  create();

  const matches = db.prepare(
    'SELECT * FROM matches WHERE phase_id = ? ORDER BY bracket_round ASC, bracket_position ASC'
  ).all(phase.id);

  res.status(201).json(matches.map(parseMatchJSON));
}

function generatePhaseDoubleElim(db, phase, players, config, res) {
  const diffMin = config.difficulty_min || 18;
  const diffMax = config.difficulty_max || 19;

  const bracket = generateDoubleElimBracket(players, {
    difficulty_min: diffMin,
    difficulty_max: diffMax,
    grand_final_reset: config.grand_final_reset || false,
  });

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, difficulty_min, difficulty_max, status, phase_id, bracket, bracket_round, bracket_position)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const create = db.transaction(() => {
    for (const m of bracket.winners) {
      insertMatch.run(
        uuidv4(), phase.tournament_id,
        m.player1_id, m.player2_id,
        m.difficulty_min, m.difficulty_max,
        m.status, phase.id,
        m.bracket, m.bracket_round, m.bracket_position
      );
    }
    for (const m of bracket.losers) {
      insertMatch.run(
        uuidv4(), phase.tournament_id,
        m.player1_id, m.player2_id,
        m.difficulty_min, m.difficulty_max,
        m.status, phase.id,
        m.bracket, m.bracket_round, m.bracket_position
      );
    }
    if (bracket.grandFinal) {
      const gf = bracket.grandFinal;
      insertMatch.run(
        uuidv4(), phase.tournament_id,
        gf.player1_id, gf.player2_id,
        gf.difficulty_min, gf.difficulty_max,
        gf.status, phase.id,
        gf.bracket, gf.bracket_round, gf.bracket_position
      );
    }
    if (bracket.resetMatch) {
      const rm = bracket.resetMatch;
      insertMatch.run(
        uuidv4(), phase.tournament_id,
        rm.player1_id, rm.player2_id,
        rm.difficulty_min, rm.difficulty_max,
        rm.status, phase.id,
        rm.bracket, rm.bracket_round, rm.bracket_position
      );
    }
    // Process byes
    processByes(db, phase.id);
  });

  create();

  const matches = db.prepare(
    'SELECT * FROM matches WHERE phase_id = ? ORDER BY bracket ASC, bracket_round ASC, bracket_position ASC'
  ).all(phase.id);

  res.status(201).json(matches.map(parseMatchJSON));
}

function generatePhaseGauntlet(db, phase, players, config, res) {
  const { startLevel, finalLevel } = getGauntletLevelBounds(config);
  const totalMatches = players.length - 1;

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, difficulty_min, difficulty_max, status, match_type, gauntlet_order, phase_id)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, 'gauntlet', ?, ?)
  `);

  const createGauntlet = db.transaction(() => {
    for (let i = 0; i < totalMatches; i++) {
      const matchOrder = i + 1;
      let matchLevel;

      if (matchOrder === totalMatches) {
        matchLevel = finalLevel;
      } else {
        matchLevel = Math.min(startLevel + i, finalLevel);
      }

      const challengerIdx = players.length - 1 - i - 1;
      const challengerId = players[challengerIdx]?.player_id || players[challengerIdx]?.id || null;

      let opponentId = null;
      if (i === 0) {
        opponentId = players[players.length - 1].player_id || players[players.length - 1].id;
      }

      insertMatch.run(
        uuidv4(), phase.tournament_id,
        challengerId, opponentId,
        matchLevel, matchLevel,
        i === 0 ? 'PENDING' : 'WAITING',
        matchOrder, phase.id
      );
    }
  });

  createGauntlet();

  const matches = db.prepare(
    "SELECT * FROM matches WHERE phase_id = ? AND match_type = 'gauntlet' ORDER BY gauntlet_order ASC"
  ).all(phase.id);

  res.status(201).json(matches.map(parseMatchJSON));
}

function generatePhaseHourOfPower(db, phase, players, config, res) {
  const durationMinutes = config.duration_minutes || 60;

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, difficulty_min, difficulty_max, status, match_type, phase_id)
    VALUES (?, ?, 0, ?, NULL, 0, 0, 'PENDING', 'hour_of_power', ?)
  `);

  const create = db.transaction(() => {
    for (const player of players) {
      const pid = player.player_id || player.id;
      insertMatch.run(uuidv4(), phase.tournament_id, pid, phase.id);
    }
  });

  create();

  const matches = db.prepare(
    "SELECT * FROM matches WHERE phase_id = ? AND match_type = 'hour_of_power' ORDER BY created_at ASC"
  ).all(phase.id);

  res.status(201).json({
    matches: matches.map(parseMatchJSON),
    duration_minutes: durationMinutes,
  });
}

// ─── End phase-aware match generation ──────────────────────────────

module.exports = router;

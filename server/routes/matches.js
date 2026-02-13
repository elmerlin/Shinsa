const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

function parseMatchJSON(m) {
  return {
    ...m,
    drawn_songs: JSON.parse(m.drawn_songs || '[]'),
    vetoed_songs: JSON.parse(m.vetoed_songs || '[]'),
    played_songs: JSON.parse(m.played_songs || '[]'),
    scores: JSON.parse(m.scores || '{}'),
  };
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
  db.close();

  res.json({ ...parseMatchJSON(match), player1, player2 });
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

  const startSingle = config.gauntlet_start_single_level || 19;
  const finalSingle = config.gauntlet_final_single_level || 24;
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
      let singleLevel, doubleLevel;

      if (matchOrder === totalMatches) {
        // Final match uses specified final levels
        singleLevel = finalSingle;
        doubleLevel = finalSingle + 1;
      } else {
        // Increment from start, cap at S23/D24
        singleLevel = Math.min(startSingle + i, 23);
        doubleLevel = singleLevel + 1;
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
        singleLevel, doubleLevel,
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
    // Gauntlet: draw exactly 1 Single at difficulty_min, 1 Double at difficulty_max
    const singleLevel = match.difficulty_min;
    const doubleLevel = match.difficulty_max;

    const singles = db.prepare('SELECT * FROM songs WHERE mode = ? AND level = ?').all('Single', singleLevel);
    const doubles = db.prepare('SELECT * FROM songs WHERE mode = ? AND level = ?').all('Double', doubleLevel);

    if (singles.length < 1) {
      db.close();
      return res.status(400).json({ error: `No Single charts at level ${singleLevel}` });
    }
    if (doubles.length < 1) {
      db.close();
      return res.status(400).json({ error: `No Double charts at level ${doubleLevel}` });
    }

    const singlePick = shuffle(singles)[0];
    const doublePick = shuffle(doubles)[0];
    const finalDraw = [singlePick, doublePick];

    // Gauntlet skips veto phase, go straight to READY
    db.prepare('UPDATE matches SET drawn_songs = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(finalDraw), 'READY', req.params.id);
    db.close();

    return res.json({ drawn_songs: finalDraw });
  }

  // Standard round robin draw
  const allSongs = db.prepare(
    'SELECT * FROM songs WHERE level >= ? AND level <= ?'
  ).all(match.difficulty_min, match.difficulty_max);

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

  if (vetoedSongs.length >= 2) {
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
  const newStatus = vetoedSongs.length >= 2 ? 'READY' : 'VETOING';

  let selectedSongs = null;
  if (newStatus === 'READY') {
    // Both vetoes done - randomly select 2 of the remaining 3 songs, ensuring 1 Single + 1 Double
    const remaining = drawnSongs.filter(s => !vetoedSongs.find(v => v.song_id === s.id));
    const singles = remaining.filter(s => s.mode === 'Single');
    const doubles = remaining.filter(s => s.mode === 'Double');

    // Shuffle helper
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    if (singles.length >= 1 && doubles.length >= 1) {
      // Pick 1 random Single and 1 random Double
      const chosenSingle = pick(singles);
      const chosenDouble = pick(doubles);
      // Randomize order
      selectedSongs = Math.random() < 0.5
        ? [chosenSingle, chosenDouble]
        : [chosenDouble, chosenSingle];
    } else {
      // Fallback: shuffle remaining and pick first 2
      const shuffled = [...remaining].sort(() => Math.random() - 0.5);
      selectedSongs = shuffled.slice(0, 2);
    }
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

  const isGauntlet = match.match_type === 'gauntlet';

  const submitResult = db.transaction(() => {
    db.prepare(
      'UPDATE matches SET winner_id = ?, played_songs = ?, scores = ?, status = ? WHERE id = ?'
    ).run(winner_id, JSON.stringify(played_songs), JSON.stringify(scores), 'COMPLETED', req.params.id);

    if (!isGauntlet && match.player1_id && match.player2_id) {
      if (winner_id === match.player1_id) {
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

module.exports = router;

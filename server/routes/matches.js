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

// POST draw cards for a match (5 cards: at least 2 Single + 2 Double)
router.post('/:id/draw', (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) { db.close(); return res.status(404).json({ error: 'Match not found' }); }

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

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

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

  const submitResult = db.transaction(() => {
    db.prepare(
      'UPDATE matches SET winner_id = ?, played_songs = ?, scores = ?, status = ? WHERE id = ?'
    ).run(winner_id, JSON.stringify(played_songs), JSON.stringify(scores), 'COMPLETED', req.params.id);

    if (match.player1_id && match.player2_id) {
      if (winner_id === match.player1_id) {
        db.prepare('UPDATE players SET wins = wins + 1, points = points + 1 WHERE id = ?').run(match.player1_id);
        db.prepare('UPDATE players SET losses = losses + 1 WHERE id = ?').run(match.player2_id);
      } else if (winner_id === match.player2_id) {
        db.prepare('UPDATE players SET wins = wins + 1, points = points + 1 WHERE id = ?').run(match.player2_id);
        db.prepare('UPDATE players SET losses = losses + 1 WHERE id = ?').run(match.player1_id);
      }
    }
  });

  submitResult();
  updateBuchholz(db, match.tournament_id);

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

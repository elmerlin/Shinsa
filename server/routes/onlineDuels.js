const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth, optionalAuth } = require('./auth');

// GET /api/online-duels - list all online duels
router.get('/', (req, res) => {
  const db = getDb();
  const duels = db.prepare(`
    SELECT od.*, u1.username as player1_name, u1.avatar as player1_avatar,
           u1.skill_title as player1_skill_title, u1.nationality as player1_nationality,
           u2.username as player2_name, u2.avatar as player2_avatar,
           u2.skill_title as player2_skill_title, u2.nationality as player2_nationality
    FROM online_duels od
    LEFT JOIN users u1 ON od.creator_user_id = u1.id
    LEFT JOIN users u2 ON od.opponent_user_id = u2.id
    ORDER BY od.created_at DESC
  `).all();
  res.json(duels);
});

// GET /api/online-duels/:id - get full duel state (for polling)
router.get('/:id', (req, res) => {
  const db = getDb();
  const duel = db.prepare(`
    SELECT od.*, u1.username as player1_name, u1.avatar as player1_avatar,
           u1.skill_title as player1_skill_title, u1.nationality as player1_nationality,
           u1.gender as player1_gender, u1.description as player1_description,
           u2.username as player2_name, u2.avatar as player2_avatar,
           u2.skill_title as player2_skill_title, u2.nationality as player2_nationality,
           u2.gender as player2_gender, u2.description as player2_description
    FROM online_duels od
    LEFT JOIN users u1 ON od.creator_user_id = u1.id
    LEFT JOIN users u2 ON od.opponent_user_id = u2.id
    WHERE od.id = ?
  `).get(req.params.id);

  if (!duel) return res.status(404).json({ error: 'Online duel not found' });

  const songs = db.prepare('SELECT * FROM online_duel_songs WHERE duel_id = ? ORDER BY played_order ASC').all(duel.id);
  const p1Pumps = db.prepare("SELECT COUNT(*) as count FROM duel_pumps WHERE duel_id = ? AND player = 'player1'").get(duel.id).count;
  const p2Pumps = db.prepare("SELECT COUNT(*) as count FROM duel_pumps WHERE duel_id = ? AND player = 'player2'").get(duel.id).count;
  res.json({ ...duel, songs, p1Pumps, p2Pumps });
});

// GET /api/online-duels/:id/chat - get chat messages (for polling)
router.get('/:id/chat', (req, res) => {
  const db = getDb();
  const after = req.query.after || '';
  let messages;
  if (after) {
    messages = db.prepare(
      'SELECT * FROM duel_chat WHERE duel_id = ? AND created_at > ? ORDER BY created_at ASC'
    ).all(req.params.id, after);
  } else {
    messages = db.prepare(
      'SELECT * FROM duel_chat WHERE duel_id = ? ORDER BY created_at ASC'
    ).all(req.params.id);
  }
  res.json(messages);
});

// POST /api/online-duels - create online duel (requires auth)
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { name, location, date, time, mode, opponent_user_id } = req.body;

  if (!name) return res.status(400).json({ error: 'Duel name is required' });
  if (!opponent_user_id) return res.status(400).json({ error: 'Opponent is required' });

  const opponent = db.prepare('SELECT id FROM users WHERE id = ?').get(opponent_user_id);
  if (!opponent) return res.status(404).json({ error: 'Opponent not found' });
  if (opponent_user_id === req.user.id) return res.status(400).json({ error: 'Cannot duel yourself' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO online_duels (id, name, location, date, time, mode, creator_user_id, opponent_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, location || '', date || '', time || '', mode || 'both', req.user.id, opponent_user_id);

  // Create invitation for opponent
  const invId = uuidv4();
  db.prepare(`
    INSERT INTO invitations (id, user_id, type, duel_id, player_slot, status)
    VALUES (?, ?, 'online_duel', ?, 'player2', 'pending')
  `).run(invId, opponent_user_id, id);

  // System chat message
  const creator = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  const oppUser = db.prepare('SELECT username FROM users WHERE id = ?').get(opponent_user_id);
  addSystemMessage(db, id, `${creator.username} created the duel and invited ${oppUser.username}`);

  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(id);
  res.status(201).json(duel);
});

// POST /api/online-duels/:id/join - opponent joins the duel
router.post('/:id/join', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (duel.opponent_user_id !== req.user.id) return res.status(403).json({ error: 'Not invited to this duel' });
  if (duel.status !== 'WAITING') return res.status(400).json({ error: 'Duel already started or completed' });

  db.prepare('UPDATE online_duels SET status = ? WHERE id = ?').run('ACTIVE', duel.id);

  // Mark invitation as accepted
  db.prepare(`UPDATE invitations SET status = 'accepted' WHERE duel_id = ? AND user_id = ? AND type = 'online_duel'`).run(duel.id, req.user.id);

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  addSystemMessage(db, duel.id, `${user.username} joined the duel! Let the battle begin!`);

  res.json({ success: true });
});

// POST /api/online-duels/:id/chat - send chat message
router.post('/:id/chat', optionalAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (duel.status === 'COMPLETED') return res.status(400).json({ error: 'Chat is closed for completed duels' });

  const { message, guest_name } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const isParticipant = req.user && (req.user.id === duel.creator_user_id || req.user.id === duel.opponent_user_id);
  let username, userId;
  if (req.user) {
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    username = user.username;
    userId = req.user.id;
  } else {
    username = (guest_name || 'Guest').slice(0, 20);
    userId = '';
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO duel_chat (id, duel_id, user_id, username, message, is_system, is_participant)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, duel.id, userId, username, message.trim().slice(0, 500), isParticipant ? 1 : 0);

  res.status(201).json({ success: true });
});

// POST /api/online-duels/:id/draw - draw a song (turn-based)
router.post('/:id/draw', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (duel.status !== 'ACTIVE') return res.status(400).json({ error: 'Duel is not active' });

  // Determine which player this user is
  const playerSlot = getPlayerSlot(duel, req.user.id);
  if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

  // Check turn
  if (duel.current_turn !== playerSlot) {
    return res.status(400).json({ error: 'Not your turn to draw' });
  }

  // Check no pending song
  const pending = db.prepare(
    "SELECT id FROM online_duel_songs WHERE duel_id = ? AND status != 'completed'"
  ).get(duel.id);
  if (pending) return res.status(400).json({ error: 'Complete the current song first' });

  const { level, draw_mode } = req.body;
  if (!level) return res.status(400).json({ error: 'Level is required' });

  let effectiveMode = draw_mode || 'any';
  if (duel.mode === 'singles') effectiveMode = 'Single';
  else if (duel.mode === 'doubles') effectiveMode = 'Double';

  const lvl = parseInt(level);
  let songs;
  if (effectiveMode === 'any') {
    songs = db.prepare('SELECT * FROM songs WHERE level = ? AND flags LIKE ?').all(lvl, '%cut:2%');
    if (songs.length === 0) songs = db.prepare('SELECT * FROM songs WHERE level = ?').all(lvl);
  } else {
    songs = db.prepare('SELECT * FROM songs WHERE level = ? AND mode = ? AND flags LIKE ?').all(lvl, effectiveMode, '%cut:2%');
    if (songs.length === 0) songs = db.prepare('SELECT * FROM songs WHERE level = ? AND mode = ?').all(lvl, effectiveMode);
  }

  if (songs.length === 0) {
    return res.status(400).json({ error: `No charts found at level ${level}` });
  }

  const song = songs[Math.floor(Math.random() * songs.length)];
  const lastSong = db.prepare('SELECT MAX(played_order) as max_order FROM online_duel_songs WHERE duel_id = ?').get(duel.id);
  const order = (lastSong.max_order || 0) + 1;

  const songId = uuidv4();
  db.prepare(`
    INSERT INTO online_duel_songs (id, duel_id, song_id, song_title, song_artist, song_mode, song_level, song_jacket_url, song_bpm, chosen_by, played_order, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'drawn')
  `).run(songId, duel.id, song.id, song.title, song.artist, song.mode, song.level, song.jacket_url || '', song.bpm || '', playerSlot, order);

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  addSystemMessage(db, duel.id, `${user.username} drew ${song.title} (${song.mode} Lv.${song.level})`);

  const drawn = db.prepare('SELECT * FROM online_duel_songs WHERE id = ?').get(songId);
  res.json(drawn);
});

// POST /api/online-duels/:id/accept - accept drawn song
router.post('/:id/accept', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });

  const playerSlot = getPlayerSlot(duel, req.user.id);
  if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

  const { song_id } = req.body;
  const song = db.prepare("SELECT * FROM online_duel_songs WHERE id = ? AND duel_id = ? AND status = 'drawn'").get(song_id, duel.id);
  if (!song) return res.status(400).json({ error: 'No pending song to accept' });

  const acceptCol = playerSlot === 'player1' ? 'player1_accepted' : 'player2_accepted';
  const declineCol = playerSlot === 'player1' ? 'player1_declined' : 'player2_declined';
  // Clear any previous decline when accepting
  db.prepare(`UPDATE online_duel_songs SET ${acceptCol} = 1, ${declineCol} = 0 WHERE id = ?`).run(song.id);

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  addSystemMessage(db, duel.id, `${user.username} accepted the song`);

  // Check if both accepted
  const updated = db.prepare('SELECT * FROM online_duel_songs WHERE id = ?').get(song.id);
  if (updated.player1_accepted && updated.player2_accepted) {
    db.prepare("UPDATE online_duel_songs SET status = 'playing' WHERE id = ?").run(song.id);
    addSystemMessage(db, duel.id, `Both players accepted! Players are Pumping it Up right now..`);
  }

  // Check if other player declined while this player accepted → other player forfeits
  const otherDeclineCol = playerSlot === 'player1' ? 'player2_declined' : 'player1_declined';
  if (updated[otherDeclineCol]) {
    // The other player declined while this one accepted → forfeiter loses
    const winner = playerSlot; // the accepter wins
    db.prepare("UPDATE online_duel_songs SET status = 'completed', winner = ? WHERE id = ?").run(winner, song.id);

    const nextTurn = duel.current_turn === 'player1' ? 'player2' : 'player1';
    db.prepare('UPDATE online_duels SET current_turn = ? WHERE id = ?').run(nextTurn, duel.id);

    const otherName = playerSlot === 'player1' ? duel.opponent_user_id : duel.creator_user_id;
    const otherUser = db.prepare('SELECT username FROM users WHERE id = ?').get(otherName);
    addSystemMessage(db, duel.id, `${otherUser.username} declined the song and forfeits this round! ${user.username} wins!`);
  }

  res.json({ success: true });
});

// POST /api/online-duels/:id/decline - decline drawn song
router.post('/:id/decline', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });

  const playerSlot = getPlayerSlot(duel, req.user.id);
  if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

  const { song_id } = req.body;
  const song = db.prepare("SELECT * FROM online_duel_songs WHERE id = ? AND duel_id = ? AND status = 'drawn'").get(song_id, duel.id);
  if (!song) return res.status(400).json({ error: 'No pending song to decline' });

  const declineCol = playerSlot === 'player1' ? 'player1_declined' : 'player2_declined';
  db.prepare(`UPDATE online_duel_songs SET ${declineCol} = 1 WHERE id = ?`).run(song.id);

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);

  const updated = db.prepare('SELECT * FROM online_duel_songs WHERE id = ?').get(song.id);
  const otherAcceptCol = playerSlot === 'player1' ? 'player2_accepted' : 'player1_accepted';
  const otherDeclineCol = playerSlot === 'player1' ? 'player2_declined' : 'player1_declined';

  if (updated[otherDeclineCol]) {
    // Both declined → redraw (delete the song, keep same turn)
    db.prepare('DELETE FROM online_duel_songs WHERE id = ?').run(song.id);
    addSystemMessage(db, duel.id, `Both players declined ${song.song_title}. Redraw!`);
  } else if (updated[otherAcceptCol]) {
    // Other accepted, this player declined → this player forfeits
    const winner = playerSlot === 'player1' ? 'player2' : 'player1';
    db.prepare("UPDATE online_duel_songs SET status = 'completed', winner = ? WHERE id = ?").run(winner, song.id);

    const nextTurn = duel.current_turn === 'player1' ? 'player2' : 'player1';
    db.prepare('UPDATE online_duels SET current_turn = ? WHERE id = ?').run(nextTurn, duel.id);

    const winnerUserId = winner === 'player1' ? duel.creator_user_id : duel.opponent_user_id;
    const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerUserId);
    addSystemMessage(db, duel.id, `${user.username} declined the song and forfeits this round! ${winnerUser.username} wins!`);
  } else {
    // Other hasn't responded yet
    addSystemMessage(db, duel.id, `${user.username} declined the song. Waiting for other player...`);
  }

  res.json({ success: true });
});

// POST /api/online-duels/:id/submit-score - submit parsed score
router.post('/:id/submit-score', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });

  const playerSlot = getPlayerSlot(duel, req.user.id);
  if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

  const song = db.prepare("SELECT * FROM online_duel_songs WHERE duel_id = ? AND status = 'playing'").get(duel.id);
  if (!song) return res.status(400).json({ error: 'No song in playing state' });

  const { score, perfect, great, good, bad, miss, max_combo, kcal } = req.body;
  const prefix = playerSlot;

  db.prepare(`
    UPDATE online_duel_songs SET
      ${prefix}_score = ?, ${prefix}_perfect = ?, ${prefix}_great = ?,
      ${prefix}_good = ?, ${prefix}_bad = ?, ${prefix}_miss = ?,
      ${prefix}_max_combo = ?, ${prefix}_kcal = ?, ${prefix}_submitted = 1
    WHERE id = ?
  `).run(
    parseInt(score) || 0, parseInt(perfect) || 0, parseInt(great) || 0,
    parseInt(good) || 0, parseInt(bad) || 0, parseInt(miss) || 0,
    parseInt(max_combo) || 0, parseFloat(kcal) || 0, song.id
  );

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  addSystemMessage(db, duel.id, `Received score submission from ${user.username}. Processing...`);

  // Check if both submitted
  const updated = db.prepare('SELECT * FROM online_duel_songs WHERE id = ?').get(song.id);
  if (updated.player1_submitted && updated.player2_submitted) {
    // Determine winner
    let winner = 'draw';
    if (updated.player1_score > updated.player2_score) winner = 'player1';
    else if (updated.player2_score > updated.player1_score) winner = 'player2';

    db.prepare("UPDATE online_duel_songs SET status = 'completed', winner = ? WHERE id = ?").run(winner, song.id);

    // Switch turn
    const nextTurn = duel.current_turn === 'player1' ? 'player2' : 'player1';
    db.prepare('UPDATE online_duels SET current_turn = ? WHERE id = ?').run(nextTurn, duel.id);

    // Resolve names
    const p1 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.creator_user_id);
    const p2 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.opponent_user_id);
    const p1Name = p1.username;
    const p2Name = p2.username;

    if (winner === 'draw') {
      addSystemMessage(db, duel.id, `It's a draw! ${p1Name}: ${updated.player1_score.toLocaleString()} vs ${p2Name}: ${updated.player2_score.toLocaleString()}`);
    } else {
      const winnerName = winner === 'player1' ? p1Name : p2Name;
      addSystemMessage(db, duel.id, `${winnerName} wins! ${p1Name}: ${updated.player1_score.toLocaleString()} vs ${p2Name}: ${updated.player2_score.toLocaleString()}`);
    }
  }

  res.json({ success: true });
});

// POST /api/online-duels/:id/end-request - request to end duel
router.post('/:id/end-request', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (duel.status !== 'ACTIVE') return res.status(400).json({ error: 'Duel is not active' });

  const playerSlot = getPlayerSlot(duel, req.user.id);
  if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

  const col = playerSlot === 'player1' ? 'player1_end_requested' : 'player2_end_requested';
  db.prepare(`UPDATE online_duels SET ${col} = 1 WHERE id = ?`).run(duel.id);

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  addSystemMessage(db, duel.id, `${user.username} wants to end the duel`);

  // Check if both requested
  const updated = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(duel.id);
  if (updated.player1_end_requested && updated.player2_end_requested) {
    // Tally wins
    const songs = db.prepare("SELECT * FROM online_duel_songs WHERE duel_id = ? AND status = 'completed'").all(duel.id);
    let p1Wins = 0, p2Wins = 0;
    songs.forEach(s => {
      if (s.winner === 'player1') p1Wins++;
      else if (s.winner === 'player2') p2Wins++;
    });

    let winner = 'draw';
    if (p1Wins > p2Wins) winner = 'player1';
    else if (p2Wins > p1Wins) winner = 'player2';

    db.prepare('UPDATE online_duels SET status = ?, winner = ? WHERE id = ?').run('COMPLETED', winner, duel.id);

    const p1 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.creator_user_id);
    const p2 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.opponent_user_id);
    if (winner === 'draw') {
      addSystemMessage(db, duel.id, `Duel ended in a draw! ${p1Wins}-${p2Wins}`);
    } else {
      const winnerName = winner === 'player1' ? p1.username : p2.username;
      addSystemMessage(db, duel.id, `Duel over! ${winnerName} wins ${p1Wins}-${p2Wins}!`);
    }
  }

  res.json({ success: true });
});

// POST /api/online-duels/:id/cancel-end - cancel end request
router.post('/:id/cancel-end', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });

  const playerSlot = getPlayerSlot(duel, req.user.id);
  if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

  const col = playerSlot === 'player1' ? 'player1_end_requested' : 'player2_end_requested';
  db.prepare(`UPDATE online_duels SET ${col} = 0 WHERE id = ?`).run(duel.id);
  res.json({ success: true });
});

// DELETE /api/online-duels/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (duel.creator_user_id !== req.user.id) return res.status(403).json({ error: 'Only the creator can delete' });

  db.prepare('DELETE FROM duel_pumps WHERE duel_id = ?').run(req.params.id);
  db.prepare('DELETE FROM duel_chat WHERE duel_id = ?').run(req.params.id);
  db.prepare('DELETE FROM online_duel_songs WHERE duel_id = ?').run(req.params.id);
  db.prepare('DELETE FROM online_duels WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/online-duels/:id/pump - pump (vouch for) a player
router.post('/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });

  const { player } = req.body;
  if (player !== 'player1' && player !== 'player2') return res.status(400).json({ error: 'Invalid player' });

  // Check if user already pumped
  const existing = db.prepare('SELECT player FROM duel_pumps WHERE duel_id = ? AND user_id = ?').get(duel.id, req.user.id);
  if (existing) {
    if (existing.player === player) {
      // Un-pump (toggle off)
      db.prepare('DELETE FROM duel_pumps WHERE duel_id = ? AND user_id = ?').run(duel.id, req.user.id);
      return res.json({ success: true, action: 'unpumped' });
    }
    // Already pumped the other player
    return res.status(400).json({ error: 'You already pumped the other player' });
  }

  db.prepare('INSERT INTO duel_pumps (duel_id, user_id, player) VALUES (?, ?, ?)').run(duel.id, req.user.id, player);
  res.status(201).json({ success: true, action: 'pumped' });
});

// GET /api/online-duels/:id/my-pump - get current user's pump choice
router.get('/:id/my-pump', optionalAuth, (req, res) => {
  if (!req.user) return res.json({ player: null });
  const db = getDb();
  const pump = db.prepare('SELECT player FROM duel_pumps WHERE duel_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  res.json({ player: pump ? pump.player : null });
});

// Helpers
function getPlayerSlot(duel, userId) {
  if (duel.creator_user_id === userId) return 'player1';
  if (duel.opponent_user_id === userId) return 'player2';
  return null;
}

function addSystemMessage(db, duelId, message) {
  db.prepare(`
    INSERT INTO duel_chat (id, duel_id, user_id, username, message, is_system, is_participant)
    VALUES (?, ?, '', 'System', ?, 1, 0)
  `).run(uuidv4(), duelId, message);
}

module.exports = router;

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth, optionalAuth } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');
const { login, scrapeRecentlyPlayed } = require('../lib/piugameScraper');

const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.PIU_ENCRYPT_KEY || 'shinsa-piugame-credential-key').digest();

function decrypt(encrypted, ivHex, authTagHex) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function getCredentials(userId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_piugame_credentials WHERE user_id = ?').get(userId);
  if (!row) return null;
  const [userIv, passIv] = row.iv.split(':');
  const [userTag, passTag] = row.auth_tag.split(':');
  const username = decrypt(row.encrypted_username, userIv, userTag);
  const password = decrypt(row.encrypted_password, passIv, passTag);
  return { username, password };
}

async function loginWithStoredCredentials(userId) {
  const creds = getCredentials(userId);
  if (!creds) throw new Error('No PIUGame credentials linked');
  return login(creds.username, creds.password);
}

function normalizeOnlineDuelAvatars(duel, size = 64) {
  if (!duel) return duel;
  return {
    ...duel,
    player1_avatar: normalizeUserAvatarForList(duel.player1_avatar, duel.creator_user_id, size),
    player2_avatar: normalizeUserAvatarForList(duel.player2_avatar, duel.opponent_user_id, size),
  };
}

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
  res.json(duels.map(d => normalizeOnlineDuelAvatars(d, 64)));
});

// GET /api/online-duels/user/:userId/history - get duel history for a user
router.get('/user/:userId/history', (req, res) => {
  const db = getDb();
  const userId = req.params.userId;

  const duels = db.prepare(`
    SELECT od.*, u1.username as player1_name, u1.avatar as player1_avatar,
           u2.username as player2_name, u2.avatar as player2_avatar
    FROM online_duels od
    LEFT JOIN users u1 ON od.creator_user_id = u1.id
    LEFT JOIN users u2 ON od.opponent_user_id = u2.id
    WHERE (od.creator_user_id = ? OR od.opponent_user_id = ?) AND od.status = 'COMPLETED'
    ORDER BY od.created_at DESC
    LIMIT 50
  `).all(userId, userId);

  // Compute stats
  let wins = 0, losses = 0, draws = 0;
  const enriched = duels.map(d => {
    const isPlayer1 = d.creator_user_id === userId;
    const playerSlot = isPlayer1 ? 'player1' : 'player2';
    if (d.winner === 'draw') draws++;
    else if (d.winner === playerSlot) wins++;
    else losses++;

    // Get song scores for this duel
    const songs = db.prepare("SELECT winner FROM online_duel_songs WHERE duel_id = ? AND status = 'completed'").all(d.id);
    const songWins = songs.filter(s => s.winner === playerSlot).length;
    const songLosses = songs.filter(s => s.winner === (isPlayer1 ? 'player2' : 'player1')).length;

    return {
      ...normalizeOnlineDuelAvatars(d, 40),
      user_slot: playerSlot,
      song_wins: songWins,
      song_losses: songLosses,
      total_songs: songs.length,
    };
  });

  res.json({ duels: enriched, stats: { wins, losses, draws, total: duels.length } });
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

  // Decline counts
  const p1Declines = db.prepare("SELECT COUNT(*) as c FROM online_duel_songs WHERE duel_id = ? AND player1_declined = 1").get(duel.id).c;
  const p2Declines = db.prepare("SELECT COUNT(*) as c FROM online_duel_songs WHERE duel_id = ? AND player2_declined = 1").get(duel.id).c;

  // Spectator count (clean up stale first)
  let spectatorCount = 0;
  try {
    db.prepare("DELETE FROM duel_spectators WHERE duel_id = ? AND last_seen < datetime('now', '-15 seconds')").run(duel.id);
    spectatorCount = db.prepare('SELECT COUNT(DISTINCT session_id) as count FROM duel_spectators WHERE duel_id = ?').get(duel.id).count;
  } catch { /* table may not exist yet */ }

  // Prediction counts
  let predictions = { player1: 0, player2: 0 };
  try {
    predictions.player1 = db.prepare("SELECT COUNT(*) as c FROM duel_predictions WHERE duel_id = ? AND predicted_winner = 'player1'").get(duel.id).c;
    predictions.player2 = db.prepare("SELECT COUNT(*) as c FROM duel_predictions WHERE duel_id = ? AND predicted_winner = 'player2'").get(duel.id).c;
  } catch { /* table may not exist yet */ }

  res.json({ ...normalizeOnlineDuelAvatars(duel, 96), songs, p1Pumps, p2Pumps, p1Declines, p2Declines, spectatorCount, predictions });
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
  const { name, location, date, time, mode, opponent_user_id, best_of } = req.body;

  if (!name) return res.status(400).json({ error: 'Duel name is required' });
  if (!opponent_user_id) return res.status(400).json({ error: 'Opponent is required' });

  const opponent = db.prepare('SELECT id FROM users WHERE id = ?').get(opponent_user_id);
  if (!opponent) return res.status(404).json({ error: 'Opponent not found' });
  if (opponent_user_id === req.user.id) return res.status(400).json({ error: 'Cannot duel yourself' });

  const validBestOf = [0, 3, 5, 7, 9];
  const bestOfVal = validBestOf.includes(parseInt(best_of)) ? parseInt(best_of) : 0;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO online_duels (id, name, location, date, time, mode, creator_user_id, opponent_user_id, best_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, location || '', date || '', time || '', mode || 'both', req.user.id, opponent_user_id, bestOfVal);

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

    // Check Best-of-N auto-complete
    const freshDuel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(duel.id);
    checkBestOfComplete(db, freshDuel);
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

  // Decline limit: max 3 declines per player per duel
  const MAX_DECLINES = 3;
  const declineCountCol = playerSlot === 'player1' ? 'player1_declined' : 'player2_declined';
  const declineCount = db.prepare(
    `SELECT COUNT(*) as c FROM online_duel_songs WHERE duel_id = ? AND ${declineCountCol} = 1`
  ).get(duel.id).c;
  if (declineCount >= MAX_DECLINES) {
    return res.status(400).json({ error: `You've reached the maximum of ${MAX_DECLINES} declines. You must accept this song.` });
  }

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

    // Check Best-of-N auto-complete
    const freshDuel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(duel.id);
    checkBestOfComplete(db, freshDuel);
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

    // Check Best-of-N auto-complete
    const freshDuel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(duel.id);
    checkBestOfComplete(db, freshDuel);
  }

  res.json({ success: true });
});

// POST /api/online-duels/:id/fetch-score - fetch score from PIUGame recent plays and auto-submit
router.post('/:id/fetch-score', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel not found' });

    const playerSlot = getPlayerSlot(duel, req.user.id);
    if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

    const song = db.prepare("SELECT * FROM online_duel_songs WHERE duel_id = ? AND status = 'playing'").get(duel.id);
    if (!song) return res.status(400).json({ error: 'No song in playing state' });

    // Check if already submitted
    const submittedCol = playerSlot === 'player1' ? 'player1_submitted' : 'player2_submitted';
    if (song[submittedCol]) return res.status(400).json({ error: 'Score already submitted' });

    // Login to PIUGame and scrape recent plays
    const client = await loginWithStoredCredentials(req.user.id);
    const plays = await scrapeRecentlyPlayed(client);

    // Normalize song title for matching: lowercase, trim, collapse whitespace
    const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

    const targetTitle = normalize(song.song_title);
    const targetMode = normalize(song.song_mode);
    const targetLevel = parseInt(song.song_level, 10) || 0;

    // Find matching play - match on title, mode, and level
    const match = plays.find(p => {
      return normalize(p.song_title) === targetTitle
        && normalize(p.mode) === targetMode
        && (parseInt(p.level, 10) || 0) === targetLevel;
    });

    if (!match) {
      return res.status(404).json({
        error: `Could not find a recent play for "${song.song_title}" (${song.song_mode} Lv.${song.song_level}). Make sure you've played the song and the score screen has appeared on the machine.`
      });
    }

    // Submit the score
    const prefix = playerSlot;
    const score = parseInt(match.score, 10) || 0;
    const perfect = parseInt(match.perfect, 10) || 0;
    const great = parseInt(match.great, 10) || 0;
    const good = parseInt(match.good, 10) || 0;
    const bad = parseInt(match.bad, 10) || 0;
    const miss = parseInt(match.miss, 10) || 0;
    const maxCombo = parseInt(match.max_combo, 10) || 0;
    const kcal = parseFloat(match.kcal) || 0;

    db.prepare(`
      UPDATE online_duel_songs SET
        ${prefix}_score = ?, ${prefix}_perfect = ?, ${prefix}_great = ?,
        ${prefix}_good = ?, ${prefix}_bad = ?, ${prefix}_miss = ?,
        ${prefix}_max_combo = ?, ${prefix}_kcal = ?, ${prefix}_submitted = 1
      WHERE id = ?
    `).run(score, perfect, great, good, bad, miss, maxCombo, kcal, song.id);

    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    addSystemMessage(db, duel.id, `${user.username} fetched their score from PIUGame: ${score.toLocaleString()}`);

    // Check if both submitted
    const updated = db.prepare('SELECT * FROM online_duel_songs WHERE id = ?').get(song.id);
    if (updated.player1_submitted && updated.player2_submitted) {
      let winner = 'draw';
      if (updated.player1_score > updated.player2_score) winner = 'player1';
      else if (updated.player2_score > updated.player1_score) winner = 'player2';

      db.prepare("UPDATE online_duel_songs SET status = 'completed', winner = ? WHERE id = ?").run(winner, song.id);

      const nextTurn = duel.current_turn === 'player1' ? 'player2' : 'player1';
      db.prepare('UPDATE online_duels SET current_turn = ? WHERE id = ?').run(nextTurn, duel.id);

      const p1 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.creator_user_id);
      const p2 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.opponent_user_id);

      if (winner === 'draw') {
        addSystemMessage(db, duel.id, `It's a draw! ${p1.username}: ${updated.player1_score.toLocaleString()} vs ${p2.username}: ${updated.player2_score.toLocaleString()}`);
      } else {
        const winnerName = winner === 'player1' ? p1.username : p2.username;
        addSystemMessage(db, duel.id, `${winnerName} wins! ${p1.username}: ${updated.player1_score.toLocaleString()} vs ${p2.username}: ${updated.player2_score.toLocaleString()}`);
      }

      const freshDuel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(duel.id);
      checkBestOfComplete(db, freshDuel);
    }

    res.json({
      success: true,
      score,
      judgments: { perfect, great, good, bad, miss },
      max_combo: maxCombo,
      kcal,
    });
  } catch (err) {
    if (err.message.includes('No PIUGame credentials')) {
      return res.status(400).json({ error: 'No PIUGame credentials linked. Link your account in Settings first.' });
    }
    console.error('Fetch score error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch score from PIUGame' });
  }
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

// POST /api/online-duels/:id/rematch - create a rematch from a completed duel
router.post('/:id/rematch', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (duel.status !== 'COMPLETED') return res.status(400).json({ error: 'Duel is not completed' });

  const playerSlot = getPlayerSlot(duel, req.user.id);
  if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

  // Swap who goes first: loser (or player2 on draw) starts
  const firstTurn = duel.winner === 'player1' ? 'player2' : 'player1';

  const newId = uuidv4();
  const rematchName = duel.name.replace(/ \(Rematch(?: \d+)?\)$/, '');
  const existingRematches = db.prepare(
    "SELECT COUNT(*) as c FROM online_duels WHERE name LIKE ? AND creator_user_id IN (?, ?) AND opponent_user_id IN (?, ?)"
  ).get(`${rematchName}%`, duel.creator_user_id, duel.opponent_user_id, duel.creator_user_id, duel.opponent_user_id);
  const rematchNum = existingRematches.c;
  const finalName = rematchNum > 0 ? `${rematchName} (Rematch ${rematchNum})` : `${rematchName} (Rematch)`;

  db.prepare(`
    INSERT INTO online_duels (id, name, location, date, time, mode, creator_user_id, opponent_user_id, status, current_turn, best_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(newId, finalName, duel.location, '', '', duel.mode, duel.creator_user_id, duel.opponent_user_id, firstTurn, duel.best_of || 0);

  const p1 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.creator_user_id);
  const p2 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.opponent_user_id);
  addSystemMessage(db, newId, `Rematch! ${p1.username} vs ${p2.username}. ${firstTurn === 'player1' ? p1.username : p2.username} draws first. Let's go!`);

  res.status(201).json({ id: newId });
});

// POST /api/online-duels/:id/forfeit - forfeit/surrender the duel
router.post('/:id/forfeit', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  if (duel.status !== 'ACTIVE') return res.status(400).json({ error: 'Duel is not active' });

  const playerSlot = getPlayerSlot(duel, req.user.id);
  if (!playerSlot) return res.status(403).json({ error: 'Not a participant' });

  // Cancel any pending song
  db.prepare("DELETE FROM online_duel_songs WHERE duel_id = ? AND status != 'completed'").run(duel.id);

  // The other player wins
  const winner = playerSlot === 'player1' ? 'player2' : 'player1';
  db.prepare('UPDATE online_duels SET status = ?, winner = ? WHERE id = ?').run('COMPLETED', winner, duel.id);

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  const winnerId = winner === 'player1' ? duel.creator_user_id : duel.opponent_user_id;
  const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerId);

  const songs = db.prepare("SELECT * FROM online_duel_songs WHERE duel_id = ? AND status = 'completed'").all(duel.id);
  let p1Wins = 0, p2Wins = 0;
  songs.forEach(s => {
    if (s.winner === 'player1') p1Wins++;
    else if (s.winner === 'player2') p2Wins++;
  });

  addSystemMessage(db, duel.id, `${user.username} forfeited! ${winnerUser.username} wins the duel ${p1Wins}-${p2Wins}!`);

  res.json({ success: true });
});

// POST /api/online-duels/:id/spectate - register spectator heartbeat
router.post('/:id/spectate', optionalAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT id FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });

  const sessionId = req.body.session_id;
  if (!sessionId) return res.status(400).json({ error: 'session_id is required' });

  db.prepare(`
    INSERT INTO duel_spectators (duel_id, session_id, user_id, last_seen)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(duel_id, session_id) DO UPDATE SET last_seen = datetime('now')
  `).run(duel.id, sessionId, req.user?.id || '');

  // Clean up stale spectators (not seen in 15 seconds)
  db.prepare("DELETE FROM duel_spectators WHERE duel_id = ? AND last_seen < datetime('now', '-15 seconds')").run(duel.id);

  const count = db.prepare('SELECT COUNT(DISTINCT session_id) as count FROM duel_spectators WHERE duel_id = ?').get(duel.id).count;
  res.json({ spectators: count });
});

// GET /api/online-duels/:id/spectators - get spectator count
router.get('/:id/spectators', (req, res) => {
  const db = getDb();
  // Clean up stale spectators
  db.prepare("DELETE FROM duel_spectators WHERE duel_id = ? AND last_seen < datetime('now', '-15 seconds')").run(req.params.id);
  const count = db.prepare('SELECT COUNT(DISTINCT session_id) as count FROM duel_spectators WHERE duel_id = ?').get(req.params.id).count;
  res.json({ spectators: count });
});

// POST /api/online-duels/:id/predict - predict winner (spectator/user)
router.post('/:id/predict', requireAuth, (req, res) => {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM online_duels WHERE id = ?').get(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });

  const { predicted_winner } = req.body;
  if (predicted_winner !== 'player1' && predicted_winner !== 'player2') {
    return res.status(400).json({ error: 'predicted_winner must be player1 or player2' });
  }

  db.prepare(`
    INSERT INTO duel_predictions (duel_id, user_id, predicted_winner)
    VALUES (?, ?, ?)
    ON CONFLICT(duel_id, user_id) DO UPDATE SET predicted_winner = ?
  `).run(duel.id, req.user.id, predicted_winner, predicted_winner);

  res.json({ success: true });
});

// GET /api/online-duels/:id/predictions - get prediction counts + user's pick
router.get('/:id/predictions', optionalAuth, (req, res) => {
  const db = getDb();
  const p1 = db.prepare("SELECT COUNT(*) as c FROM duel_predictions WHERE duel_id = ? AND predicted_winner = 'player1'").get(req.params.id).c;
  const p2 = db.prepare("SELECT COUNT(*) as c FROM duel_predictions WHERE duel_id = ? AND predicted_winner = 'player2'").get(req.params.id).c;
  let myPick = null;
  if (req.user) {
    const row = db.prepare('SELECT predicted_winner FROM duel_predictions WHERE duel_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (row) myPick = row.predicted_winner;
  }
  res.json({ player1: p1, player2: p2, myPick });
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

// Check if Best-of-N threshold reached and auto-complete the duel
function checkBestOfComplete(db, duel) {
  if (!duel.best_of || duel.best_of <= 0) return false;
  const majority = Math.ceil(duel.best_of / 2);
  const songs = db.prepare("SELECT winner FROM online_duel_songs WHERE duel_id = ? AND status = 'completed'").all(duel.id);
  let p1Wins = 0, p2Wins = 0;
  songs.forEach(s => {
    if (s.winner === 'player1') p1Wins++;
    else if (s.winner === 'player2') p2Wins++;
  });

  if (p1Wins >= majority || p2Wins >= majority) {
    let winner = 'draw';
    if (p1Wins > p2Wins) winner = 'player1';
    else if (p2Wins > p1Wins) winner = 'player2';
    db.prepare('UPDATE online_duels SET status = ?, winner = ? WHERE id = ?').run('COMPLETED', winner, duel.id);

    const p1 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.creator_user_id);
    const p2 = db.prepare('SELECT username FROM users WHERE id = ?').get(duel.opponent_user_id);
    const winnerName = winner === 'player1' ? p1.username : p2.username;
    addSystemMessage(db, duel.id, `Best of ${duel.best_of} complete! ${winnerName} wins the series ${p1Wins}-${p2Wins}!`);
    return true;
  }
  return false;
}

module.exports = router;

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const TOKEN_EXPIRY = '30d';

// Middleware to extract user from token (optional auth)
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (e) { /* ignore invalid tokens */ }
  }
  next();
}

// Middleware to require auth
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const db = getDb();
  const { username, password, email, avatar, pumbility, skill_title, skill_level, gender, nationality, date_of_birth, show_age, description } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be 2-30 characters' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, email, avatar, pumbility, skill_title, skill_level, gender, nationality, date_of_birth, show_age, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username.trim(), password_hash, email || '', avatar || '', pumbility || 0,
    skill_title || '', skill_level || 1, gender || '', nationality || '', date_of_birth || '', show_age ? 1 : 0, description || '');

  const user = db.prepare('SELECT id, username, email, avatar, pumbility, skill_title, skill_level, gender, nationality, date_of_birth, show_age, description, created_at FROM users WHERE id = ?').get(id);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

  res.status(201).json({ user, token });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const db = getDb();
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser, token });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, email, avatar, pumbility, skill_title, skill_level, gender, nationality, date_of_birth, show_age, description, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// PUT /api/auth/me
router.put('/me', requireAuth, (req, res) => {
  const db = getDb();
  const { email, avatar, pumbility, skill_title, skill_level, gender, nationality, date_of_birth, show_age, description } = req.body;

  db.prepare(`
    UPDATE users SET
      email = COALESCE(?, email),
      avatar = COALESCE(?, avatar),
      pumbility = COALESCE(?, pumbility),
      skill_title = COALESCE(?, skill_title),
      skill_level = COALESCE(?, skill_level),
      gender = COALESCE(?, gender),
      nationality = COALESCE(?, nationality),
      date_of_birth = COALESCE(?, date_of_birth),
      show_age = COALESCE(?, show_age),
      description = COALESCE(?, description)
    WHERE id = ?
  `).run(email, avatar, pumbility, skill_title, skill_level, gender, nationality, date_of_birth, show_age !== undefined ? (show_age ? 1 : 0) : null, description, req.user.id);

  const user = db.prepare('SELECT id, username, email, avatar, pumbility, skill_title, skill_level, gender, nationality, date_of_birth, show_age, description, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// PUT /api/auth/password
router.put('/password', requireAuth, (req, res) => {
  const db = getDb();
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ success: true });
});

// GET /api/auth/search?q=... - search registered users
router.get('/search', (req, res) => {
  const db = getDb();
  const q = req.query.q || '';
  if (q.length < 1) return res.json([]);

  const users = db.prepare(`
    SELECT id, username, avatar, pumbility, skill_title, skill_level, gender, nationality, description
    FROM users WHERE username LIKE ? LIMIT 10
  `).all(`%${q}%`);

  res.json(users);
});

// GET /api/auth/user/:id - get public user profile
router.get('/user/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, username, avatar, pumbility, skill_title, skill_level, gender, nationality,
           date_of_birth, show_age, description, created_at
    FROM users WHERE id = ?
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  // Hide date_of_birth if show_age is off — only return age
  if (!user.show_age) {
    user.date_of_birth = '';
  }

  res.json(user);
});

// GET /api/auth/user/:id/stats - get user's competition history
router.get('/user/:id/stats', (req, res) => {
  const db = getDb();
  const userId = req.params.id;

  // Tournament participation — find all players linked to this user
  const tournamentPlayers = db.prepare(`
    SELECT p.*, t.name as tournament_name, t.phase as tournament_phase, t.date as tournament_date, t.avatar as tournament_avatar
    FROM players p
    JOIN tournaments t ON p.tournament_id = t.id
    WHERE p.user_id = ?
    ORDER BY t.created_at DESC
  `).all(userId);

  // Get match results for each tournament player
  const matchResults = [];
  for (const tp of tournamentPlayers) {
    const matches = db.prepare(`
      SELECT m.*, p1.name as player1_name, p2.name as player2_name
      FROM matches m
      LEFT JOIN players p1 ON m.player1_id = p1.id
      LEFT JOIN players p2 ON m.player2_id = p2.id
      WHERE m.tournament_id = ? AND (m.player1_id = ? OR m.player2_id = ?)
      ORDER BY m.round_number ASC
    `).all(tp.tournament_id, tp.id, tp.id);
    matchResults.push({ tournament: tp, matches });
  }

  // Duel participation
  const duels = db.prepare(`
    SELECT * FROM duels
    WHERE player1_user_id = ? OR player2_user_id = ?
    ORDER BY created_at DESC
  `).all(userId, userId);

  // Get duel songs for scoring data
  const duelStats = [];
  for (const d of duels) {
    const songs = db.prepare('SELECT * FROM duel_songs WHERE duel_id = ? ORDER BY played_order ASC').all(d.id);
    duelStats.push({ duel: d, songs });
  }

  res.json({ tournamentPlayers: matchResults, duelStats });
});

// GET /api/auth/invitations - get user's pending invitations
router.get('/invitations', requireAuth, (req, res) => {
  const db = getDb();
  const invitations = db.prepare(`
    SELECT i.*,
      t.name as tournament_name, t.avatar as tournament_avatar, t.date as tournament_date,
      d.name as duel_name, d.date as duel_date
    FROM invitations i
    LEFT JOIN tournaments t ON i.tournament_id = t.id
    LEFT JOIN duels d ON i.duel_id = d.id
    WHERE i.user_id = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC
  `).all(req.user.id);

  res.json(invitations);
});

// PUT /api/auth/invitations/:id - accept or decline
router.put('/invitations/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { status } = req.body; // 'accepted' or 'declined'
  if (!['accepted', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'Status must be accepted or declined' });
  }

  const invitation = db.prepare('SELECT * FROM invitations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

  if (status === 'accepted') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (invitation.type === 'tournament' && invitation.tournament_id) {
      // Create player entry from user profile
      const count = db.prepare('SELECT COUNT(*) as count FROM players WHERE tournament_id = ?').get(invitation.tournament_id).count;
      const playerId = uuidv4();
      db.prepare(`
        INSERT INTO players (id, tournament_id, name, skill_title, skill_level, pumbility, description, avatar, gender, nationality, seed_rank, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(playerId, invitation.tournament_id, user.username, user.skill_title, user.skill_level, user.pumbility,
        user.description, user.avatar, user.gender, user.nationality, count + 1, user.id);
    } else if (invitation.type === 'duel' && invitation.duel_id) {
      // Link user to duel slot
      const slot = invitation.player_slot || 'player1';
      const prefix = slot === 'player2' ? 'player2' : 'player1';
      db.prepare(`
        UPDATE duels SET
          ${prefix}_name = ?, ${prefix}_avatar = ?,
          ${prefix}_skill_title = ?, ${prefix}_skill_level = ?,
          ${prefix}_gender = ?, ${prefix}_nationality = ?,
          ${prefix}_description = ?, ${prefix}_user_id = ?
        WHERE id = ?
      `).run(user.username, user.avatar, user.skill_title, user.skill_level,
        user.gender, user.nationality, user.description, user.id, invitation.duel_id);
    }
  }

  db.prepare('UPDATE invitations SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// POST /api/auth/invite - create an invitation
router.post('/invite', (req, res) => {
  const db = getDb();
  const { user_id, type, tournament_id, duel_id, player_slot } = req.body;

  if (!user_id || !type) {
    return res.status(400).json({ error: 'user_id and type are required' });
  }

  // Check user exists
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Check for duplicate invitation
  const existing = db.prepare(`
    SELECT id FROM invitations
    WHERE user_id = ? AND type = ? AND COALESCE(tournament_id, '') = ? AND COALESCE(duel_id, '') = ? AND status = 'pending'
  `).get(user_id, type, tournament_id || '', duel_id || '');
  if (existing) return res.status(400).json({ error: 'Invitation already sent' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO invitations (id, user_id, type, tournament_id, duel_id, player_slot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, user_id, type, tournament_id || null, duel_id || null, player_slot || '');

  res.status(201).json({ id, success: true });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.optionalAuth = optionalAuth;

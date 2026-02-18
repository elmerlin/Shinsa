const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const { addNotificationClient } = require('../lib/notificationHub');
const { getPublicVapidKey, isWebPushConfigured } = require('../lib/webPush');
const { isInlineDataAvatar } = require('../lib/avatarProxy');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const TOKEN_EXPIRY = '30d';
const MAX_ACTIVITY_ITEMS = 200;

function textSnippet(text, max = 90) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

function makePublicUser(user) {
  if (!user) return null;
  if (!user.show_age) {
    return { ...user, date_of_birth: '' };
  }
  return user;
}

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

// GET /api/auth/avatar/:id - serve user avatar bytes (resized) for inline base64 avatars
router.get('/avatar/:id', async (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.params.id);
  const avatar = user?.avatar || '';
  if (!avatar) return res.status(404).end();

  // If this user already stores a URL/path avatar, forward to that path.
  if (!isInlineDataAvatar(avatar)) {
    if (avatar.startsWith('/api/auth/avatar/')) return res.status(404).end();
    if (avatar.startsWith('/')) return res.redirect(302, avatar);
    if (avatar.startsWith('http://') || avatar.startsWith('https://')) return res.redirect(302, avatar);
    return res.redirect(302, `/${avatar}`);
  }

  const match = avatar.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!match) return res.status(415).end();

  let source;
  try {
    source = Buffer.from(match[2], 'base64');
  } catch {
    return res.status(415).end();
  }
  if (!source || source.length === 0) return res.status(415).end();

  const size = Math.max(24, Math.min(512, parseInt(req.query.s, 10) || 64));

  try {
    const thumb = await sharp(source)
      .rotate()
      .resize(size, size, { fit: 'cover' })
      .webp({ quality: 78 })
      .toBuffer();
    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.send(thumb);
  } catch {
    res.set('Content-Type', match[1].toLowerCase());
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(source);
  }
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
  const q = String(req.query.q || '').trim();
  if (q.length < 1) return res.json([]);

  const users = db.prepare(`
    SELECT id, username, avatar, pumbility, skill_title, skill_level, gender, nationality, description
    FROM users
    WHERE username LIKE ?
    ORDER BY
      CASE
        WHEN LOWER(username) = LOWER(?) THEN 0
        WHEN LOWER(username) LIKE LOWER(?) THEN 1
        ELSE 2
      END,
      username COLLATE NOCASE ASC
    LIMIT 10
  `).all(`%${q}%`, q, `${q}%`);

  res.json(users);
});

// GET /api/auth/user/username/:username - get public user profile by username
router.get('/user/username/:username', (req, res) => {
  const db = getDb();
  const username = decodeURIComponent(String(req.params.username || '')).trim().replace(/^@+/, '');
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const user = db.prepare(`
    SELECT id, username, avatar, pumbility, skill_title, skill_level, gender, nationality,
           date_of_birth, show_age, description, created_at
    FROM users WHERE LOWER(username) = LOWER(?)
  `).get(username);

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(makePublicUser(user));
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
  res.json(makePublicUser(user));
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

  // Online duel participation
  const onlineDuels = db.prepare(`
    SELECT od.*, u1.username as creator_username, u2.username as opponent_username
    FROM online_duels od
    LEFT JOIN users u1 ON od.creator_user_id = u1.id
    LEFT JOIN users u2 ON od.opponent_user_id = u2.id
    WHERE od.creator_user_id = ? OR od.opponent_user_id = ?
    ORDER BY od.created_at DESC
  `).all(userId, userId);

  const onlineDuelStats = [];
  for (const od of onlineDuels) {
    const songs = db.prepare('SELECT * FROM online_duel_songs WHERE duel_id = ? ORDER BY created_at ASC').all(od.id);
    onlineDuelStats.push({ duel: od, songs });
  }

  res.json({ tournamentPlayers: matchResults, duelStats, onlineDuelStats });
});

// GET /api/auth/user/:id/activity - user activity timeline
router.get('/user/:id/activity', (req, res) => {
  const db = getDb();
  const userId = req.params.id;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const activities = [];
  const toMillis = (ts) => {
    if (!ts) return 0;
    const value = String(ts);
    const date = new Date(value.endsWith('Z') ? value : `${value}Z`);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  // Posts
  const posts = db.prepare(`
    SELECT id, content, created_at
    FROM user_posts
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 80
  `).all(userId);
  for (const post of posts) {
    activities.push({
      id: `post-${post.id}`,
      category: 'posts',
      type: 'post_created',
      created_at: post.created_at,
      message: 'Published a post',
      detail: textSnippet(post.content, 120),
      link: `/post/${post.id}`,
    });
  }

  // Comments on social posts
  const postComments = db.prepare(`
    SELECT c.id, c.post_id, c.parent_id, c.content, c.created_at
    FROM post_comments c
    JOIN user_posts p ON c.post_id = p.id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
    LIMIT 120
  `).all(userId);
  for (const comment of postComments) {
    activities.push({
      id: `post-comment-${comment.id}`,
      category: 'comments',
      type: comment.parent_id ? 'post_reply' : 'post_comment',
      created_at: comment.created_at,
      message: comment.parent_id ? 'Replied on a post' : 'Commented on a post',
      detail: textSnippet(comment.content, 120),
      link: `/post/${comment.post_id}`,
    });
  }

  // Comments on upscores
  const upscoreComments = db.prepare(`
    SELECT c.id, c.upscore_id, c.parent_id, c.content, c.created_at
    FROM upscore_comments c
    JOIN user_upscores u ON c.upscore_id = u.id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
    LIMIT 120
  `).all(userId);
  for (const comment of upscoreComments) {
    activities.push({
      id: `upscore-comment-${comment.id}`,
      category: 'comments',
      type: comment.parent_id ? 'upscore_reply' : 'upscore_comment',
      created_at: comment.created_at,
      message: comment.parent_id ? 'Replied on an upscore' : 'Commented on an upscore',
      detail: textSnippet(comment.content, 120),
      link: `/upscore/${comment.upscore_id}`,
    });
  }

  // Comments on clears
  const clearComments = db.prepare(`
    SELECT c.id, c.clear_id, c.parent_id, c.content, c.created_at
    FROM new_clear_comments c
    JOIN user_new_clears nc ON c.clear_id = nc.id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
    LIMIT 120
  `).all(userId);
  for (const comment of clearComments) {
    activities.push({
      id: `clear-comment-${comment.id}`,
      category: 'comments',
      type: comment.parent_id ? 'clear_reply' : 'clear_comment',
      created_at: comment.created_at,
      message: comment.parent_id ? 'Replied on a clear' : 'Commented on a clear',
      detail: textSnippet(comment.content, 120),
      link: `/clear/${comment.clear_id}`,
    });
  }

  // Comments in communities
  const communityComments = db.prepare(`
    SELECT c.id, c.post_id, c.parent_id, c.content, c.created_at,
           co.id as community_id, co.name as community_name, co.display_name as community_display_name
    FROM community_post_comments c
    JOIN community_posts cp ON c.post_id = cp.id
    JOIN communities co ON cp.community_id = co.id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
    LIMIT 120
  `).all(userId);
  for (const comment of communityComments) {
    const communityLabel = comment.community_display_name || 'a community';
    activities.push({
      id: `community-comment-${comment.id}`,
      category: 'comments',
      type: comment.parent_id ? 'community_reply' : 'community_comment',
      created_at: comment.created_at,
      message: comment.parent_id
        ? `Replied in ${communityLabel}`
        : `Commented in ${communityLabel}`,
      detail: textSnippet(comment.content, 120),
      link: `/c/${comment.community_name}?post=${encodeURIComponent(comment.post_id)}&comment=${encodeURIComponent(comment.id)}`,
    });
  }

  // Score updates (upscores + clears)
  const upscores = db.prepare(`
    SELECT id, upscores_json, created_at
    FROM user_upscores
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 80
  `).all(userId);
  for (const upscore of upscores) {
    let count = 0;
    try {
      const parsed = JSON.parse(upscore.upscores_json || '[]');
      if (Array.isArray(parsed)) count = parsed.length;
    } catch {}

    activities.push({
      id: `upscore-${upscore.id}`,
      category: 'scores',
      type: 'upscore',
      created_at: upscore.created_at,
      message: count > 0
        ? `Shared ${count} upscore${count === 1 ? '' : 's'}`
        : 'Shared score improvements',
      detail: '',
      link: `/upscore/${upscore.id}`,
    });
  }

  const clears = db.prepare(`
    SELECT id, song_title, mode, level, clears_json, created_at
    FROM user_new_clears
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 80
  `).all(userId);
  for (const clear of clears) {
    let clearCount = 0;
    try {
      const parsed = JSON.parse(clear.clears_json || '[]');
      if (Array.isArray(parsed)) clearCount = parsed.length;
    } catch {}

    const mode = clear.mode === 'Single' ? 'S' : clear.mode === 'Double' ? 'D' : 'C';
    activities.push({
      id: `clear-${clear.id}`,
      category: 'scores',
      type: 'new_clear',
      created_at: clear.created_at,
      message: clearCount > 1
        ? `Shared ${clearCount} new clears`
        : `Shared a new clear${clear.song_title ? `: ${clear.song_title} (${mode}${clear.level || ''})` : ''}`,
      detail: '',
      link: `/clear/${clear.id}`,
    });
  }

  // Competition activity
  const tournamentEntries = db.prepare(`
    SELECT p.id, p.tournament_id, p.created_at, t.name as tournament_name
    FROM players p
    JOIN tournaments t ON p.tournament_id = t.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT 80
  `).all(userId);
  for (const entry of tournamentEntries) {
    activities.push({
      id: `tournament-entry-${entry.id}`,
      category: 'competitions',
      type: 'tournament_join',
      created_at: entry.created_at,
      message: `Joined tournament "${entry.tournament_name}"`,
      detail: '',
      link: `/tournament/${entry.tournament_id}`,
    });
  }

  const duels = db.prepare(`
    SELECT id, name, status, winner, player1_user_id, player2_user_id, created_at
    FROM duels
    WHERE player1_user_id = ? OR player2_user_id = ?
    ORDER BY created_at DESC
    LIMIT 80
  `).all(userId, userId);
  for (const duel of duels) {
    const isPlayer1 = duel.player1_user_id === userId;
    const didWin = duel.status === 'COMPLETED'
      && ((isPlayer1 && duel.winner === 'player1') || (!isPlayer1 && duel.winner === 'player2'));
    activities.push({
      id: `duel-${duel.id}`,
      category: 'competitions',
      type: didWin ? 'duel_win' : 'duel_participation',
      created_at: duel.created_at,
      message: didWin
        ? `Won duel "${duel.name}"`
        : `${duel.status === 'COMPLETED' ? 'Competed in' : 'Joined'} duel "${duel.name}"`,
      detail: '',
      link: `/duel/${duel.id}`,
    });
  }

  const onlineDuels = db.prepare(`
    SELECT id, name, status, winner, creator_user_id, opponent_user_id, created_at
    FROM online_duels
    WHERE creator_user_id = ? OR opponent_user_id = ?
    ORDER BY created_at DESC
    LIMIT 80
  `).all(userId, userId);
  for (const duel of onlineDuels) {
    const isPlayer1 = duel.creator_user_id === userId;
    const didWin = duel.status === 'COMPLETED'
      && ((isPlayer1 && duel.winner === 'player1') || (!isPlayer1 && duel.winner === 'player2'));
    activities.push({
      id: `online-duel-${duel.id}`,
      category: 'competitions',
      type: didWin ? 'online_duel_win' : 'online_duel_participation',
      created_at: duel.created_at,
      message: didWin
        ? `Won online duel "${duel.name}"`
        : `${duel.status === 'COMPLETED' ? 'Competed in' : 'Joined'} online duel "${duel.name}"`,
      detail: '',
      link: `/online-duel/${duel.id}`,
    });
  }

  // Community milestones
  const createdCommunities = db.prepare(`
    SELECT id, name, display_name, created_at
    FROM communities
    WHERE owner_id = ?
    ORDER BY created_at DESC
    LIMIT 60
  `).all(userId);
  for (const community of createdCommunities) {
    activities.push({
      id: `community-created-${community.id}`,
      category: 'community',
      type: 'community_created',
      created_at: community.created_at,
      message: `Created community "${community.display_name}"`,
      detail: '',
      link: `/c/${community.name}`,
    });
  }

  const joinedCommunities = db.prepare(`
    SELECT c.id, c.name, c.display_name, cm.joined_at, cm.role
    FROM community_members cm
    JOIN communities c ON cm.community_id = c.id
    WHERE cm.user_id = ? AND cm.role != 'owner'
    ORDER BY cm.joined_at DESC
    LIMIT 80
  `).all(userId);
  for (const community of joinedCommunities) {
    activities.push({
      id: `community-joined-${community.id}-${community.joined_at}`,
      category: 'community',
      type: 'community_joined',
      created_at: community.joined_at,
      message: `Joined community "${community.display_name}"`,
      detail: '',
      link: `/c/${community.name}`,
    });
  }

  const moderatorEvents = db.prepare(`
    SELECT cre.id, cre.created_at, c.id as community_id, c.name as community_name, c.display_name as community_display_name
    FROM community_role_events cre
    JOIN communities c ON cre.community_id = c.id
    WHERE cre.user_id = ? AND cre.role = 'moderator'
    ORDER BY cre.created_at DESC
    LIMIT 60
  `).all(userId);
  for (const event of moderatorEvents) {
    activities.push({
      id: `community-mod-${event.id}`,
      category: 'community',
      type: 'community_moderator',
      created_at: event.created_at,
      message: `Became a moderator in "${event.community_display_name}"`,
      detail: '',
      link: `/c/${event.community_name}`,
    });
  }

  activities.sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at));
  res.json(activities.slice(0, MAX_ACTIVITY_ITEMS));
});

// GET /api/auth/invitations - get user's pending invitations
router.get('/invitations', requireAuth, (req, res) => {
  const db = getDb();
  const invitations = db.prepare(`
    SELECT i.*,
      t.name as tournament_name, t.avatar as tournament_avatar, t.date as tournament_date,
      d.name as duel_name, d.date as duel_date,
      od.name as online_duel_name
    FROM invitations i
    LEFT JOIN tournaments t ON i.tournament_id = t.id
    LEFT JOIN duels d ON i.duel_id = d.id
    LEFT JOIN online_duels od ON i.type = 'online_duel' AND i.duel_id = od.id
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

// ─── Notifications ──────────────────────────────────────

// GET /api/auth/push/public-key — expose public VAPID key for browser subscription
router.get('/push/public-key', (req, res) => {
  res.json({
    enabled: isWebPushConfigured(),
    public_key: getPublicVapidKey() || '',
  });
});

// POST /api/auth/push/subscribe — register/update a browser push subscription for current user
router.post('/push/subscribe', requireAuth, (req, res) => {
  const db = getDb();
  const rawSub = req.body?.subscription || req.body || {};
  const endpoint = String(rawSub.endpoint || '').trim();
  const p256dh = String(rawSub.keys?.p256dh || '').trim();
  const auth = String(rawSub.keys?.auth || '').trim();
  const expirationTime = rawSub.expirationTime == null ? '' : String(rawSub.expirationTime);

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Invalid push subscription payload' });
  }

  db.prepare(`
    INSERT INTO user_push_subscriptions (user_id, endpoint, p256dh, auth, expiration_time, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      user_agent = excluded.user_agent,
      updated_at = datetime('now')
  `).run(req.user.id, endpoint, p256dh, auth, expirationTime, req.headers['user-agent'] || '');

  res.json({ success: true });
});

// DELETE /api/auth/push/subscribe — unregister current user's browser subscription
router.delete('/push/subscribe', requireAuth, (req, res) => {
  const db = getDb();
  const endpoint = String(req.body?.endpoint || '').trim();
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });

  db.prepare('DELETE FROM user_push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(req.user.id, endpoint);

  res.json({ success: true });
});

// GET /api/auth/notifications/stream — real-time notification stream (SSE)
router.get('/notifications/stream', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  const detach = addNotificationClient(decoded.id, res);
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {}
  }, 25000);

  res.write('event: ready\ndata: {"ok":true}\n\n');

  req.on('close', () => {
    clearInterval(heartbeat);
    detach();
  });
});

// GET /api/auth/notifications — get all notifications + pending invitations count
router.get('/notifications', requireAuth, (req, res) => {
  const db = getDb();
  const notifications = db.prepare(`
    SELECT * FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);

  const invitationCount = db.prepare(`
    SELECT COUNT(*) as count FROM invitations WHERE user_id = ? AND status = 'pending'
  `).get(req.user.id).count;

  const unreadCount = db.prepare(`
    SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND read = 0
  `).get(req.user.id).count;

  res.json({ notifications, invitation_count: invitationCount, unread_count: unreadCount });
});

// PUT /api/auth/notifications/:id/read — mark as read
router.put('/notifications/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE user_notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// PUT /api/auth/notifications/read-all — mark all as read
router.put('/notifications/read-all', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE user_notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// DELETE /api/auth/notifications/:id — delete a notification
router.delete('/notifications/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM user_notifications WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.optionalAuth = optionalAuth;

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const { addNotificationClient } = require('../lib/notificationHub');
const { getPublicVapidKey, isWebPushConfigured } = require('../lib/webPush');
const { isInlineDataAvatar, normalizeUserAvatarForList } = require('../lib/avatarProxy');
const { evaluateAchievementSeries } = require('../lib/achievements');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const TOKEN_EXPIRY = '30d';
const QR_LOGIN_CHALLENGE_TTL_MS = 2 * 60 * 1000;
const QR_LOGIN_POLL_AFTER_MS = 2500;
const MAX_ACTIVITY_ITEMS = 200;
const ADMIN_USERNAMES = new Set(
  String(process.env.ADMIN_USERNAMES || 'elmer')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const ADMIN_USER_IDS = new Set(
  String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const FEATURE_KEYS = ['optimise', 'checkin', 'dojo_admin'];
const FEATURE_KEY_SET = new Set(FEATURE_KEYS);
const GROUP_BADGE_UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/heic', 'image/heif', 'image/avif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const AUTH_USER_SELECT = `
  SELECT id, username, is_admin, email, avatar, avatar_v, pumbility, skill_title, skill_level, gender, nationality,
         date_of_birth, show_age, age, height_cm, weight_kg, description,
         location_country, location_country_code, location_city, location_lat, location_lng,
         playing_status, created_at
  FROM users
  WHERE id = ?
`;

function textSnippet(text, max = 90) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

function normalizeClientUser(user, avatarSize = 96) {
  if (!user) return null;
  return {
    ...user,
    avatar: normalizeUserAvatarForList(user.avatar, user.id, avatarSize, user.avatar_v),
  };
}

function normalizeGroupName(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeGroupText(value, max = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizePopupSlides(rawSlides) {
  const rows = Array.isArray(rawSlides) ? rawSlides : [];
  const slides = [];
  for (const raw of rows) {
    const title = String(raw?.title || '').trim().slice(0, 120);
    const content = String(raw?.content || '').trim().slice(0, 4000);
    if (!title && !content) continue;
    slides.push({ title, content });
    if (slides.length >= 20) break;
  }
  return slides;
}

async function compressGroupBadgeImage(buffer) {
  let result = await sharp(buffer)
    .rotate()
    .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 64 })
    .toBuffer();
  if (result.length > 120 * 1024) {
    result = await sharp(buffer)
      .rotate()
      .resize(220, 220, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 50 })
      .toBuffer();
  }
  return `data:image/webp;base64,${result.toString('base64')}`;
}

function getUserGroupBadges(db, userId) {
  if (!db || !userId) return [];
  const rows = db.prepare(`
    SELECT DISTINCT
      b.id,
      b.group_id,
      g.name AS group_name,
      b.name,
      b.description,
      b.image_data
    FROM admin_user_group_badges b
    JOIN admin_user_groups g ON g.id = b.group_id
    LEFT JOIN admin_user_group_badge_assignments ua
      ON ua.badge_id = b.id
      AND ua.user_id = ?
    LEFT JOIN admin_user_group_badge_group_assignments ga
      ON ga.badge_id = b.id
    LEFT JOIN admin_user_group_members gm
      ON gm.group_id = ga.group_id
      AND gm.user_id = ?
    WHERE ua.badge_id IS NOT NULL OR gm.group_id IS NOT NULL
    ORDER BY b.created_at ASC, b.name COLLATE NOCASE ASC
  `).all(userId, userId);

  return rows.map((row) => ({
    id: row.id,
    group_id: row.group_id,
    group_name: row.group_name || '',
    name: row.name || '',
    description: row.description || '',
    image: row.image_data || '',
  }));
}

function getUserAchievementBadges(db, userId) {
  if (!db || !userId) return [];
  const rows = db.prepare(`
    SELECT
      t.id AS tier_id,
      s.id AS series_id,
      s.key AS series_key,
      s.name AS series_name,
      t.name,
      t.description,
      t.image_data,
      t.threshold,
      a.awarded_at
    FROM achievement_awards a
    JOIN achievement_tiers t ON t.id = a.tier_id
    JOIN achievement_series s ON s.id = t.series_id
    WHERE a.user_id = ?
    ORDER BY s.name COLLATE NOCASE ASC, t.sort_order ASC
  `).all(userId);

  return rows.map((row) => ({
    tier_id: row.tier_id,
    series_id: row.series_id,
    series_key: row.series_key,
    series_name: row.series_name,
    name: row.name || '',
    description: row.description || '',
    image: row.image_data || '',
    threshold: row.threshold,
    awarded_at: row.awarded_at || '',
  }));
}

function getUserGroups(db, userId) {
  if (!db || !userId) return [];
  const rows = db.prepare(`
    SELECT g.id, g.name
    FROM admin_user_group_members gm
    JOIN admin_user_groups g ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY g.name COLLATE NOCASE ASC
  `).all(userId);

  return rows.map((row) => ({
    id: row.id,
    name: row.name || '',
  }));
}

function makePublicUser(db, user) {
  if (!user) return null;
  const normalized = normalizeClientUser(user, 128);
  const groupBadges = getUserGroupBadges(db, normalized.id);
  const achievementBadges = getUserAchievementBadges(db, normalized.id);
  const withBadges = {
    ...normalized,
    group_badges: groupBadges,
    achievement_badges: achievementBadges,
  };
  if (!normalized.show_age) {
    return { ...withBadges, date_of_birth: '' };
  }
  return withBadges;
}

function normalizeFeatureKey(value) {
  return String(value || '').trim().toLowerCase();
}

function parseBooleanInput(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function parseOptionalHealthNumber(value, { min = null, max = null, integer = false } = {}) {
  if (value === undefined) return { provided: false, valid: true, value: null };
  if (value === null) return { provided: true, valid: true, value: null };

  const raw = String(value).trim();
  if (!raw) return { provided: true, valid: true, value: null };

  const numeric = integer ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(numeric)) return { provided: true, valid: false, value: null };

  const normalized = integer ? Math.trunc(numeric) : Math.round(numeric * 10) / 10;
  if (min !== null && normalized < min) return { provided: true, valid: false, value: null };
  if (max !== null && normalized > max) return { provided: true, valid: false, value: null };
  return { provided: true, valid: true, value: normalized };
}

function featureLabelFromKey(key) {
  if (key === 'optimise') return 'Optimise';
  if (key === 'checkin') return 'Check In';
  if (key === 'dojo_admin') return 'Dojo Admin';
  return key;
}

function defaultFeatureAccess() {
  return {
    optimise: false,
    checkin: false,
    dojo_admin: false,
  };
}

function isAdminUser(db, user) {
  if (!user) return false;
  if (user.is_admin === true || parseInt(user.is_admin, 10) === 1) return true;
  if (user.id && ADMIN_USER_IDS.has(String(user.id).trim())) return true;
  const username = String(user.username || '').trim().toLowerCase();
  if (username && ADMIN_USERNAMES.has(username)) return true;
  if (user.id) {
    const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
    if (parseInt(row?.is_admin, 10) === 1) return true;
  }
  return false;
}

function getFeatureAccessByUserId(db, userId, isAdmin) {
  const access = defaultFeatureAccess();
  if (!userId) return access;
  if (isAdmin) {
    for (const featureKey of FEATURE_KEYS) {
      access[featureKey] = true;
    }
    return access;
  }
  const rows = db.prepare(`
    SELECT feature_key
    FROM user_feature_permissions
    WHERE user_id = ?
    UNION ALL
    SELECT gfp.feature_key
    FROM admin_user_group_feature_permissions gfp
    JOIN admin_user_group_members gm ON gm.group_id = gfp.group_id
    WHERE gm.user_id = ?
  `).all(userId, userId);
  for (const row of rows) {
    const featureKey = normalizeFeatureKey(row?.feature_key);
    if (!FEATURE_KEY_SET.has(featureKey)) continue;
    access[featureKey] = true;
  }
  return access;
}

function hasFeatureAccess(db, user, featureKey) {
  if (!db || !user) return false;
  const normalized = normalizeFeatureKey(featureKey);
  if (!FEATURE_KEY_SET.has(normalized)) return false;
  if (isAdminUser(db, user)) return true;
  const userId = String(user.id || '').trim();
  if (!userId) return false;
  const access = getFeatureAccessByUserId(db, userId, false);
  return !!access[normalized];
}

function toClientAuthUser(db, user, avatarSize = 96) {
  if (!user) return null;
  const admin = isAdminUser(db, user);
  const { password_hash, ...safeUser } = user;
  const normalized = normalizeClientUser(safeUser, avatarSize);
  return {
    ...normalized,
    is_admin: !!admin,
    feature_access: getFeatureAccessByUserId(db, user.id, admin),
    groups: getUserGroups(db, user.id),
    group_badges: getUserGroupBadges(db, user.id),
    achievement_badges: getUserAchievementBadges(db, user.id),
  };
}

function signAuthToken(user, clientUser, expiresIn = TOKEN_EXPIRY) {
  return jwt.sign(
    { id: user.id, username: user.username, is_admin: !!clientUser?.is_admin },
    JWT_SECRET,
    { expiresIn }
  );
}

function getAuthUserById(db, userId) {
  if (!db || !userId) return null;
  return db.prepare(AUTH_USER_SELECT).get(userId);
}

function toSqliteDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getRequestOrigin(req) {
  const host = String(req.get('host') || '').trim();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const proto = forwardedProto || (!isLocalHost ? 'https' : (req.protocol || 'http'));
  return `${proto}://${host}`;
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || '';
}

function getBrowserLabel(userAgent) {
  const ua = String(userAgent || '');
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua) && !/Chrome\//.test(ua)
          ? 'Safari'
          : /SamsungBrowser\//.test(ua)
            ? 'Samsung Internet'
            : 'Browser';
  const os = /Windows NT/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iPhone'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

function cleanupExpiredQrLoginChallenges(db) {
  if (!db) return;
  db.prepare(`
    UPDATE auth_qr_login_challenges
    SET status = 'expired',
        updated_at = datetime('now')
    WHERE status IN ('pending', 'approved')
      AND datetime(expires_at) <= datetime('now')
  `).run();
}

function getQrLoginChallengeById(db, challengeId) {
  if (!db || !challengeId) return null;
  cleanupExpiredQrLoginChallenges(db);
  return db.prepare(`
    SELECT
      c.*,
      u.username AS approved_username
    FROM auth_qr_login_challenges c
    LEFT JOIN users u ON u.id = c.approved_user_id
    WHERE c.id = ?
  `).get(challengeId);
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

function requireAdmin(req, res, next) {
  const db = getDb();
  if (!isAdminUser(db, req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const db = getDb();
  const {
    username, password, email, avatar, pumbility, skill_title, skill_level,
    gender, nationality, date_of_birth, show_age, description,
    age, height_cm, weight_kg,
    location_country, location_country_code, location_city, location_lat, location_lng,
  } = req.body;

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
  const parsedAge = parseOptionalHealthNumber(age, { min: 1, max: 120, integer: true });
  const parsedHeightCm = parseOptionalHealthNumber(height_cm, { min: 50, max: 280 });
  const parsedWeightKg = parseOptionalHealthNumber(weight_kg, { min: 20, max: 350 });
  if (!parsedAge.valid) return res.status(400).json({ error: 'Age must be between 1 and 120' });
  if (!parsedHeightCm.valid) return res.status(400).json({ error: 'Height must be between 50 and 280 cm' });
  if (!parsedWeightKg.valid) return res.status(400).json({ error: 'Weight must be between 20 and 350 kg' });

  db.prepare(`
    INSERT INTO users (
      id, username, password_hash, email, avatar, pumbility, skill_title, skill_level,
      gender, nationality, date_of_birth, show_age, age, height_cm, weight_kg, description,
      location_country, location_country_code, location_city, location_lat, location_lng
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username.trim(), password_hash, email || '', avatar || '', pumbility || 0,
    skill_title || '', skill_level || 1, gender || '', nationality || '', date_of_birth || '',
    show_age ? 1 : 0, parsedAge.value, parsedHeightCm.value, parsedWeightKg.value, description || '',
    location_country || '', location_country_code || '', location_city || '',
    Number.isFinite(Number(location_lat)) ? Number(location_lat) : null,
    Number.isFinite(Number(location_lng)) ? Number(location_lng) : null);

  const user = db.prepare(`
    SELECT id, username, is_admin, email, avatar, avatar_v, pumbility, skill_title, skill_level, gender, nationality,
           date_of_birth, show_age, age, height_cm, weight_kg, description,
           location_country, location_country_code, location_city, location_lat, location_lng,
           playing_status, created_at
    FROM users WHERE id = ?
  `).get(id);
  const clientUser = toClientAuthUser(db, user, 96);
  const token = signAuthToken(user, clientUser);

  res.status(201).json({ user: clientUser, token });
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

  const clientUser = toClientAuthUser(db, user, 96);
  const token = signAuthToken(user, clientUser);
  res.json({ user: clientUser, token });
});

// POST /api/auth/qr-login/challenges
router.post('/qr-login/challenges', (req, res) => {
  const db = getDb();
  cleanupExpiredQrLoginChallenges(db);

  const challengeId = uuidv4();
  const claimToken = uuidv4();
  const expiresAt = new Date(Date.now() + QR_LOGIN_CHALLENGE_TTL_MS);
  const browserUserAgent = String(req.headers['user-agent'] || '').slice(0, 300);
  const browserLabel = getBrowserLabel(browserUserAgent);
  const browserIp = String(getRequestIp(req) || '').slice(0, 120);

  db.prepare(`
    INSERT INTO auth_qr_login_challenges (
      id,
      claim_token,
      status,
      browser_label,
      browser_user_agent,
      browser_ip,
      expires_at
    )
    VALUES (?, ?, 'pending', ?, ?, ?, ?)
  `).run(
    challengeId,
    claimToken,
    browserLabel,
    browserUserAgent,
    browserIp,
    toSqliteDateTime(expiresAt)
  );

  const approvePath = `/login/approve?challenge=${encodeURIComponent(challengeId)}`;
  res.status(201).json({
    challengeId,
    claimToken,
    expiresAt: expiresAt.toISOString(),
    pollAfterMs: QR_LOGIN_POLL_AFTER_MS,
    approveUrl: `${getRequestOrigin(req)}${approvePath}`,
    qrImageUrl: `/api/auth/qr-login/challenges/${encodeURIComponent(challengeId)}/qr`,
  });
});

// GET /api/auth/qr-login/challenges/:id
router.get('/qr-login/challenges/:id', (req, res) => {
  const db = getDb();
  const challenge = getQrLoginChallengeById(db, req.params.id);
  if (!challenge) return res.status(404).json({ error: 'QR login request not found' });

  res.json({
    challengeId: challenge.id,
    status: challenge.status,
    expiresAt: challenge.expires_at ? `${String(challenge.expires_at).replace(' ', 'T')}Z` : '',
    browserLabel: challenge.browser_label || 'Shared browser',
    approvedUsername: challenge.approved_username || '',
  });
});

// GET /api/auth/qr-login/challenges/:id/qr
router.get('/qr-login/challenges/:id/qr', async (req, res) => {
  const db = getDb();
  const challenge = getQrLoginChallengeById(db, req.params.id);
  if (!challenge || challenge.status === 'consumed') {
    return res.status(404).json({ error: 'QR login request not found' });
  }

  try {
    const approveUrl = `${getRequestOrigin(req)}/login/approve?challenge=${encodeURIComponent(challenge.id)}`;
    const svg = await QRCode.toString(approveUrl, {
      type: 'svg',
      margin: 1,
      width: 320,
      color: {
        dark: '#06142b',
        light: '#ffffff',
      },
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    console.error('Failed to render QR login SVG:', err.message);
    res.status(500).json({ error: 'Failed to render QR code' });
  }
});

// POST /api/auth/qr-login/challenges/:id/approve
router.post('/qr-login/challenges/:id/approve', requireAuth, (req, res) => {
  const db = getDb();
  const challenge = getQrLoginChallengeById(db, req.params.id);
  if (!challenge) return res.status(404).json({ error: 'QR login request not found' });
  if (challenge.status === 'expired') return res.status(410).json({ error: 'QR login request has expired' });
  if (challenge.status === 'consumed') return res.status(409).json({ error: 'QR login request has already been used' });
  if (challenge.status === 'approved') {
    return res.json({
      success: true,
      status: 'approved',
      approvedUsername: challenge.approved_username || req.user.username || '',
    });
  }

  db.prepare(`
    UPDATE auth_qr_login_challenges
    SET status = 'approved',
        approved_user_id = ?,
        approved_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id, challenge.id);

  res.json({
    success: true,
    status: 'approved',
    approvedUsername: req.user.username || '',
  });
});

// GET /api/auth/qr-login/challenges/:id/poll
router.get('/qr-login/challenges/:id/poll', (req, res) => {
  const db = getDb();
  const claimToken = String(req.headers['x-qr-claim-token'] || '').trim();
  if (!claimToken) return res.status(400).json({ error: 'Missing QR login claim token' });

  const challenge = getQrLoginChallengeById(db, req.params.id);
  if (!challenge) return res.status(404).json({ error: 'QR login request not found' });
  if (challenge.claim_token !== claimToken) return res.status(403).json({ error: 'Invalid QR login claim token' });

  if (challenge.status === 'expired') {
    return res.status(410).json({
      status: 'expired',
      error: 'QR login request has expired',
    });
  }

  if (challenge.status === 'pending') {
    return res.json({
      status: 'pending',
      pollAfterMs: QR_LOGIN_POLL_AFTER_MS,
      expiresAt: challenge.expires_at ? `${String(challenge.expires_at).replace(' ', 'T')}Z` : '',
    });
  }

  if (challenge.status === 'consumed') {
    return res.json({ status: 'consumed' });
  }

  if (challenge.status !== 'approved' || !challenge.approved_user_id) {
    return res.json({ status: challenge.status || 'pending' });
  }

  const issueApprovedLogin = db.transaction((challengeId, approvedUserId) => {
    const freshChallenge = getQrLoginChallengeById(db, challengeId);
    if (!freshChallenge || freshChallenge.status !== 'approved' || !freshChallenge.approved_user_id) {
      return { state: freshChallenge?.status || 'pending' };
    }

    db.prepare(`
      UPDATE auth_qr_login_challenges
      SET status = 'consumed',
          consumed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(challengeId);

    const approvedUser = getAuthUserById(db, approvedUserId);
    if (!approvedUser) {
      return { state: 'missing-user' };
    }
    const clientUser = toClientAuthUser(db, approvedUser, 96);
    return {
      state: 'approved',
      user: clientUser,
      token: signAuthToken(approvedUser, clientUser),
    };
  });

  const payload = issueApprovedLogin(challenge.id, challenge.approved_user_id);
  if (payload.state === 'missing-user') {
    return res.status(404).json({ error: 'Approved user no longer exists' });
  }
  if (payload.state !== 'approved') {
    return res.json({ status: payload.state || 'pending' });
  }

  return res.json({
    status: 'approved',
    user: payload.user,
    token: payload.token,
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = getAuthUserById(db, req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(toClientAuthUser(db, user, 96));
});

// GET /api/auth/admin/features
router.get('/admin/features', requireAuth, requireAdmin, (req, res) => {
  const features = FEATURE_KEYS.map((key) => ({
    key,
    label: featureLabelFromKey(key),
  }));
  res.json({ features });
});

// GET /api/auth/admin/features/:featureKey/users
router.get('/admin/features/:featureKey/users', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const featureKey = normalizeFeatureKey(req.params.featureKey);
  if (!FEATURE_KEY_SET.has(featureKey)) {
    return res.status(400).json({ error: 'Unknown feature key' });
  }

  const rows = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.avatar,
      u.avatar_v,
      u.pumbility,
      u.skill_title,
      u.is_admin,
      p.created_at AS granted_at,
      p.granted_by,
      g.username AS granted_by_username
    FROM user_feature_permissions p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN users g ON g.id = p.granted_by
    WHERE p.feature_key = ?
    ORDER BY u.username COLLATE NOCASE ASC
  `).all(featureKey);

  res.json({
    feature_key: featureKey,
    users: rows.map((row) => {
      const normalized = normalizeClientUser({
        id: row.id,
        username: row.username,
        avatar: row.avatar,
        avatar_v: row.avatar_v,
        pumbility: row.pumbility,
        skill_title: row.skill_title,
      }, 48);
      return {
        ...normalized,
        is_admin: isAdminUser(db, row),
        granted_at: row.granted_at || null,
        granted_by: row.granted_by || '',
        granted_by_username: row.granted_by_username || '',
      };
    }),
  });
});

// POST /api/auth/admin/features/:featureKey/users
router.post('/admin/features/:featureKey/users', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const featureKey = normalizeFeatureKey(req.params.featureKey);
  const userId = String(req.body?.user_id || '').trim();
  if (!FEATURE_KEY_SET.has(featureKey)) {
    return res.status(400).json({ error: 'Unknown feature key' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'user_id is required' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  const result = db.prepare(`
    INSERT OR IGNORE INTO user_feature_permissions (user_id, feature_key, granted_by, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userId, featureKey, String(req.user?.id || '').trim());

  res.json({
    success: true,
    feature_key: featureKey,
    user_id: userId,
    added: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

// DELETE /api/auth/admin/features/:featureKey/users/:userId
router.delete('/admin/features/:featureKey/users/:userId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const featureKey = normalizeFeatureKey(req.params.featureKey);
  const userId = String(req.params.userId || '').trim();
  if (!FEATURE_KEY_SET.has(featureKey)) {
    return res.status(400).json({ error: 'Unknown feature key' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  const result = db.prepare(`
    DELETE FROM user_feature_permissions
    WHERE user_id = ? AND feature_key = ?
  `).run(userId, featureKey);

  res.json({
    success: true,
    feature_key: featureKey,
    user_id: userId,
    removed: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

function getAdminGroupById(db, groupId) {
  if (!db || !groupId) return null;
  return db.prepare(`
    SELECT
      g.id,
      g.name,
      g.description,
      g.created_by,
      g.created_at,
      g.updated_at,
      (SELECT COUNT(*) FROM admin_user_group_members gm WHERE gm.group_id = g.id) AS member_count,
      (SELECT COUNT(*) FROM admin_user_group_badges b WHERE b.group_id = g.id) AS badge_count
    FROM admin_user_groups g
    WHERE g.id = ?
  `).get(groupId);
}

function getAdminGroupPermissionKeys(db, groupId) {
  if (!db || !groupId) return [];
  return db.prepare(`
    SELECT feature_key
    FROM admin_user_group_feature_permissions
    WHERE group_id = ?
    ORDER BY feature_key ASC
  `).all(groupId)
    .map((row) => normalizeFeatureKey(row?.feature_key))
    .filter((key) => FEATURE_KEY_SET.has(key));
}

function getAdminGroupBadges(db, groupId) {
  if (!db || !groupId) return [];
  const badges = db.prepare(`
    SELECT id, group_id, name, description, image_data, created_at, updated_at
    FROM admin_user_group_badges
    WHERE group_id = ?
    ORDER BY datetime(created_at) ASC, name COLLATE NOCASE ASC
  `).all(groupId);
  if (!badges.length) return [];

  const badgeIds = badges.map((badge) => badge.id);
  const badgePlaceholders = badgeIds.map(() => '?').join(',');
  const groupAssignments = db.prepare(`
    SELECT badge_id
    FROM admin_user_group_badge_group_assignments
    WHERE group_id = ? AND badge_id IN (${badgePlaceholders})
  `).all(groupId, ...badgeIds);
  const groupAssignedSet = new Set(groupAssignments.map((row) => row.badge_id));

  const individualAssignments = db.prepare(`
    SELECT badge_id, user_id
    FROM admin_user_group_badge_assignments
    WHERE badge_id IN (${badgePlaceholders})
  `).all(...badgeIds);
  const userMap = new Map();
  for (const row of individualAssignments) {
    if (!userMap.has(row.badge_id)) userMap.set(row.badge_id, []);
    userMap.get(row.badge_id).push(row.user_id);
  }

  return badges.map((badge) => ({
    id: badge.id,
    group_id: badge.group_id,
    name: badge.name || '',
    description: badge.description || '',
    image: badge.image_data || '',
    created_at: badge.created_at || '',
    updated_at: badge.updated_at || '',
    group_assigned: groupAssignedSet.has(badge.id),
    assigned_user_ids: userMap.get(badge.id) || [],
  }));
}

// GET /api/auth/admin/groups
router.get('/admin/groups', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groups = db.prepare(`
    SELECT
      g.id,
      g.name,
      g.description,
      g.created_by,
      g.created_at,
      g.updated_at,
      (SELECT COUNT(*) FROM admin_user_group_members gm WHERE gm.group_id = g.id) AS member_count,
      (SELECT COUNT(*) FROM admin_user_group_badges b WHERE b.group_id = g.id) AS badge_count
    FROM admin_user_groups g
    ORDER BY g.name COLLATE NOCASE ASC
  `).all();

  const permissions = db.prepare(`
    SELECT group_id, feature_key
    FROM admin_user_group_feature_permissions
    ORDER BY feature_key ASC
  `).all();
  const permissionMap = new Map();
  for (const row of permissions) {
    const featureKey = normalizeFeatureKey(row?.feature_key);
    if (!FEATURE_KEY_SET.has(featureKey)) continue;
    if (!permissionMap.has(row.group_id)) permissionMap.set(row.group_id, []);
    permissionMap.get(row.group_id).push(featureKey);
  }

  res.json({
    groups: groups.map((group) => ({
      ...group,
      permission_keys: permissionMap.get(group.id) || [],
    })),
  });
});

// POST /api/auth/admin/groups
router.post('/admin/groups', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const name = normalizeGroupName(req.body?.name, 80);
  const description = normalizeGroupText(req.body?.description, 300);
  if (name.length < 2) {
    return res.status(400).json({ error: 'Group name must be at least 2 characters' });
  }

  const exists = db.prepare('SELECT id FROM admin_user_groups WHERE LOWER(name) = LOWER(?)').get(name);
  if (exists) {
    return res.status(400).json({ error: 'A group with this name already exists' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO admin_user_groups (id, name, description, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, name, description, String(req.user?.id || '').trim());

  const group = getAdminGroupById(db, id);
  res.status(201).json({
    ...group,
    permission_keys: [],
  });
});

// PUT /api/auth/admin/groups/:groupId
router.put('/admin/groups/:groupId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const existing = getAdminGroupById(db, groupId);
  if (!existing) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const nextName = req.body?.name !== undefined
    ? normalizeGroupName(req.body?.name, 80)
    : String(existing.name || '');
  const nextDescription = req.body?.description !== undefined
    ? normalizeGroupText(req.body?.description, 300)
    : String(existing.description || '');

  if (nextName.length < 2) {
    return res.status(400).json({ error: 'Group name must be at least 2 characters' });
  }
  const duplicate = db.prepare(
    'SELECT id FROM admin_user_groups WHERE LOWER(name) = LOWER(?) AND id != ?'
  ).get(nextName, groupId);
  if (duplicate) {
    return res.status(400).json({ error: 'A group with this name already exists' });
  }

  db.prepare(`
    UPDATE admin_user_groups
    SET name = ?, description = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(nextName, nextDescription, groupId);

  const group = getAdminGroupById(db, groupId);
  res.json({
    ...group,
    permission_keys: getAdminGroupPermissionKeys(db, groupId),
  });
});

// DELETE /api/auth/admin/groups/:groupId
router.delete('/admin/groups/:groupId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const existing = getAdminGroupById(db, groupId);
  if (!existing) {
    return res.status(404).json({ error: 'Group not found' });
  }
  db.prepare('DELETE FROM admin_user_groups WHERE id = ?').run(groupId);
  res.json({ success: true });
});

// GET /api/auth/admin/groups/:groupId/members
router.get('/admin/groups/:groupId/members', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const rows = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.avatar,
      u.avatar_v,
      u.pumbility,
      u.skill_title,
      u.is_admin,
      gm.created_at AS joined_at
    FROM admin_user_group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY u.username COLLATE NOCASE ASC
  `).all(groupId);

  const badgeAssignments = db.prepare(`
    SELECT a.user_id, a.badge_id
    FROM admin_user_group_badge_assignments a
    JOIN admin_user_group_badges b ON b.id = a.badge_id
    WHERE b.group_id = ?
  `).all(groupId);
  const userBadgeMap = new Map();
  for (const row of badgeAssignments) {
    if (!userBadgeMap.has(row.user_id)) userBadgeMap.set(row.user_id, []);
    userBadgeMap.get(row.user_id).push(row.badge_id);
  }

  res.json({
    group,
    members: rows.map((row) => {
      const normalized = normalizeClientUser({
        id: row.id,
        username: row.username,
        avatar: row.avatar,
        avatar_v: row.avatar_v,
        pumbility: row.pumbility,
        skill_title: row.skill_title,
      }, 48);
      return {
        ...normalized,
        is_admin: isAdminUser(db, row),
        joined_at: row.joined_at || null,
        badge_ids: userBadgeMap.get(row.id) || [],
      };
    }),
  });
});

// POST /api/auth/admin/groups/:groupId/members
router.post('/admin/groups/:groupId/members', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const userId = String(req.body?.user_id || '').trim();
  if (!groupId || !userId) {
    return res.status(400).json({ error: 'group_id and user_id are required' });
  }

  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const result = db.prepare(`
    INSERT OR IGNORE INTO admin_user_group_members (group_id, user_id, added_by, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(groupId, userId, String(req.user?.id || '').trim());

  res.json({
    success: true,
    group_id: groupId,
    user_id: userId,
    added: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

// DELETE /api/auth/admin/groups/:groupId/members/:userId
router.delete('/admin/groups/:groupId/members/:userId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const userId = String(req.params.userId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const removeMembership = db.prepare(`
    DELETE FROM admin_user_group_members
    WHERE group_id = ? AND user_id = ?
  `);
  const removeIndividualBadges = db.prepare(`
    DELETE FROM admin_user_group_badge_assignments
    WHERE user_id = ?
      AND badge_id IN (
        SELECT id
        FROM admin_user_group_badges
        WHERE group_id = ?
      )
  `);
  const apply = db.transaction(() => {
    const membership = removeMembership.run(groupId, userId);
    removeIndividualBadges.run(userId, groupId);
    return membership;
  });
  const result = apply();

  res.json({
    success: true,
    group_id: groupId,
    user_id: userId,
    removed: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

// POST /api/auth/admin/groups/:groupId/members/:userId/move
router.post('/admin/groups/:groupId/members/:userId/move', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const sourceGroupId = String(req.params.groupId || '').trim();
  const userId = String(req.params.userId || '').trim();
  const targetGroupId = String(req.body?.target_group_id || '').trim();
  if (!targetGroupId) return res.status(400).json({ error: 'target_group_id is required' });
  if (targetGroupId === sourceGroupId) {
    return res.status(400).json({ error: 'target_group_id must be different from the source group' });
  }

  const sourceGroup = getAdminGroupById(db, sourceGroupId);
  if (!sourceGroup) return res.status(404).json({ error: 'Source group not found' });
  const targetGroup = getAdminGroupById(db, targetGroupId);
  if (!targetGroup) return res.status(404).json({ error: 'Target group not found' });

  const membership = db.prepare(`
    SELECT 1
    FROM admin_user_group_members
    WHERE group_id = ? AND user_id = ?
  `).get(sourceGroupId, userId);
  if (!membership) return res.status(404).json({ error: 'User is not a member of the source group' });

  const moveTx = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO admin_user_group_members (group_id, user_id, added_by, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(targetGroupId, userId, String(req.user?.id || '').trim());

    db.prepare(`
      DELETE FROM admin_user_group_members
      WHERE group_id = ? AND user_id = ?
    `).run(sourceGroupId, userId);

    db.prepare(`
      DELETE FROM admin_user_group_badge_assignments
      WHERE user_id = ?
        AND badge_id IN (
          SELECT id
          FROM admin_user_group_badges
          WHERE group_id = ?
        )
    `).run(userId, sourceGroupId);
  });
  moveTx();

  res.json({
    success: true,
    user_id: userId,
    source_group_id: sourceGroupId,
    target_group_id: targetGroupId,
  });
});

// GET /api/auth/admin/groups/:groupId/permissions
router.get('/admin/groups/:groupId/permissions', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const granted = new Set(getAdminGroupPermissionKeys(db, groupId));
  const features = FEATURE_KEYS.map((key) => ({
    key,
    label: featureLabelFromKey(key),
    enabled: granted.has(key),
  }));
  res.json({ group_id: groupId, features });
});

// PUT /api/auth/admin/groups/:groupId/permissions/:featureKey
router.put('/admin/groups/:groupId/permissions/:featureKey', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const featureKey = normalizeFeatureKey(req.params.featureKey);
  const enabled = parseBooleanInput(req.body?.enabled);
  if (!FEATURE_KEY_SET.has(featureKey)) {
    return res.status(400).json({ error: 'Unknown feature key' });
  }
  if (enabled === null) {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  if (enabled) {
    db.prepare(`
      INSERT OR IGNORE INTO admin_user_group_feature_permissions (group_id, feature_key, granted_by, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(groupId, featureKey, String(req.user?.id || '').trim());
  } else {
    db.prepare(`
      DELETE FROM admin_user_group_feature_permissions
      WHERE group_id = ? AND feature_key = ?
    `).run(groupId, featureKey);
  }

  res.json({
    success: true,
    group_id: groupId,
    feature_key: featureKey,
    enabled,
  });
});

// POST /api/auth/admin/groups/:groupId/notify
router.post('/admin/groups/:groupId/notify', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const title = normalizeGroupName(req.body?.title || '', 90);
  const message = normalizeGroupText(req.body?.message || '', 260);
  const link = String(req.body?.link || '').trim().slice(0, 260);
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!message) return res.status(400).json({ error: 'message is required' });

  const members = db.prepare(`
    SELECT user_id
    FROM admin_user_group_members
    WHERE group_id = ?
  `).all(groupId);

  let notified = 0;
  for (const member of members) {
    if (!member?.user_id) continue;
    createUserNotification(db, member.user_id, 'admin_group_notice', title, message, link);
    notified += 1;
  }

  res.json({
    success: true,
    group_id: groupId,
    notified_count: notified,
  });
});

// POST /api/auth/admin/groups/:groupId/popup
router.post('/admin/groups/:groupId/popup', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const title = normalizeGroupName(req.body?.title || '', 120);
  const slides = normalizePopupSlides(req.body?.slides);
  if (!slides.length) {
    return res.status(400).json({ error: 'At least one slide is required' });
  }

  const popupId = uuidv4();
  const actorId = String(req.user?.id || '').trim();

  const createPopup = db.transaction(() => {
    db.prepare(`
      INSERT INTO admin_user_group_popups (id, title, slides_json, created_by, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(popupId, title, JSON.stringify(slides), actorId);

    db.prepare(`
      INSERT INTO admin_user_group_popup_targets (popup_id, group_id)
      VALUES (?, ?)
    `).run(popupId, groupId);

    const members = db.prepare(`
      SELECT user_id
      FROM admin_user_group_members
      WHERE group_id = ?
    `).all(groupId);
    const insertRecipient = db.prepare(`
      INSERT OR IGNORE INTO admin_user_group_popup_recipients (popup_id, user_id, created_at)
      VALUES (?, ?, datetime('now'))
    `);
    for (const member of members) {
      if (!member?.user_id) continue;
      insertRecipient.run(popupId, member.user_id);
    }
    return members.length;
  });
  const recipientCount = createPopup();

  res.status(201).json({
    success: true,
    popup_id: popupId,
    group_id: groupId,
    slide_count: slides.length,
    recipient_count: recipientCount,
  });
});

// GET /api/auth/admin/groups/:groupId/badges
router.get('/admin/groups/:groupId/badges', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  res.json({
    group_id: groupId,
    badges: getAdminGroupBadges(db, groupId),
  });
});

// POST /api/auth/admin/groups/:groupId/badges
router.post('/admin/groups/:groupId/badges', requireAuth, requireAdmin, GROUP_BADGE_UPLOAD.single('image'), async (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const name = normalizeGroupName(req.body?.name || '', 64);
  const description = normalizeGroupText(req.body?.description || '', 200);
  if (!name) return res.status(400).json({ error: 'Badge name is required' });
  if (!req.file) return res.status(400).json({ error: 'Badge image is required' });

  let imageData = '';
  try {
    imageData = await compressGroupBadgeImage(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'Failed to process badge image' });
  }

  const badgeId = uuidv4();
  db.prepare(`
    INSERT INTO admin_user_group_badges (id, group_id, name, description, image_data, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(badgeId, groupId, name, description, imageData, String(req.user?.id || '').trim());

  const badge = db.prepare(`
    SELECT id, group_id, name, description, image_data, created_at, updated_at
    FROM admin_user_group_badges
    WHERE id = ?
  `).get(badgeId);

  res.status(201).json({
    id: badge.id,
    group_id: badge.group_id,
    name: badge.name || '',
    description: badge.description || '',
    image: badge.image_data || '',
    created_at: badge.created_at || '',
    updated_at: badge.updated_at || '',
    group_assigned: false,
    assigned_user_ids: [],
  });
});

// PUT /api/auth/admin/groups/:groupId/badges/:badgeId
router.put('/admin/groups/:groupId/badges/:badgeId', requireAuth, requireAdmin, GROUP_BADGE_UPLOAD.single('image'), async (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const badgeId = String(req.params.badgeId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const badge = db.prepare(`
    SELECT id, group_id, name, description, image_data
    FROM admin_user_group_badges
    WHERE id = ? AND group_id = ?
  `).get(badgeId, groupId);
  if (!badge) return res.status(404).json({ error: 'Badge not found' });

  const nextName = req.body?.name !== undefined
    ? normalizeGroupName(req.body?.name, 64)
    : String(badge.name || '');
  const nextDescription = req.body?.description !== undefined
    ? normalizeGroupText(req.body?.description, 200)
    : String(badge.description || '');
  if (!nextName) return res.status(400).json({ error: 'Badge name is required' });

  let nextImageData = badge.image_data || '';
  if (req.file) {
    try {
      nextImageData = await compressGroupBadgeImage(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err?.message || 'Failed to process badge image' });
    }
  }

  db.prepare(`
    UPDATE admin_user_group_badges
    SET name = ?, description = ?, image_data = ?, updated_at = datetime('now')
    WHERE id = ? AND group_id = ?
  `).run(nextName, nextDescription, nextImageData, badgeId, groupId);

  const updated = getAdminGroupBadges(db, groupId).find((row) => row.id === badgeId);
  res.json(updated || null);
});

// DELETE /api/auth/admin/groups/:groupId/badges/:badgeId
router.delete('/admin/groups/:groupId/badges/:badgeId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const badgeId = String(req.params.badgeId || '').trim();
  const group = getAdminGroupById(db, groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const result = db.prepare(`
    DELETE FROM admin_user_group_badges
    WHERE id = ? AND group_id = ?
  `).run(badgeId, groupId);
  res.json({
    success: true,
    removed: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

// POST /api/auth/admin/groups/:groupId/badges/:badgeId/assign-all
router.post('/admin/groups/:groupId/badges/:badgeId/assign-all', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const badgeId = String(req.params.badgeId || '').trim();
  const badge = db.prepare(`
    SELECT id
    FROM admin_user_group_badges
    WHERE id = ? AND group_id = ?
  `).get(badgeId, groupId);
  if (!badge) return res.status(404).json({ error: 'Badge not found' });

  const result = db.prepare(`
    INSERT OR IGNORE INTO admin_user_group_badge_group_assignments (badge_id, group_id, assigned_by, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(badgeId, groupId, String(req.user?.id || '').trim());

  res.json({
    success: true,
    group_id: groupId,
    badge_id: badgeId,
    assigned: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

// DELETE /api/auth/admin/groups/:groupId/badges/:badgeId/assign-all
router.delete('/admin/groups/:groupId/badges/:badgeId/assign-all', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const badgeId = String(req.params.badgeId || '').trim();
  const result = db.prepare(`
    DELETE FROM admin_user_group_badge_group_assignments
    WHERE badge_id = ? AND group_id = ?
  `).run(badgeId, groupId);

  res.json({
    success: true,
    group_id: groupId,
    badge_id: badgeId,
    removed: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

// POST /api/auth/admin/groups/:groupId/badges/:badgeId/assign/:userId
router.post('/admin/groups/:groupId/badges/:badgeId/assign/:userId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const groupId = String(req.params.groupId || '').trim();
  const badgeId = String(req.params.badgeId || '').trim();
  const userId = String(req.params.userId || '').trim();

  const badge = db.prepare(`
    SELECT id
    FROM admin_user_group_badges
    WHERE id = ? AND group_id = ?
  `).get(badgeId, groupId);
  if (!badge) return res.status(404).json({ error: 'Badge not found' });

  const member = db.prepare(`
    SELECT 1
    FROM admin_user_group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId);
  if (!member) return res.status(404).json({ error: 'User is not in this group' });

  const result = db.prepare(`
    INSERT OR IGNORE INTO admin_user_group_badge_assignments (badge_id, user_id, assigned_by, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(badgeId, userId, String(req.user?.id || '').trim());

  res.json({
    success: true,
    group_id: groupId,
    badge_id: badgeId,
    user_id: userId,
    assigned: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

// DELETE /api/auth/admin/groups/:groupId/badges/:badgeId/assign/:userId
router.delete('/admin/groups/:groupId/badges/:badgeId/assign/:userId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const badgeId = String(req.params.badgeId || '').trim();
  const userId = String(req.params.userId || '').trim();
  const result = db.prepare(`
    DELETE FROM admin_user_group_badge_assignments
    WHERE badge_id = ? AND user_id = ?
  `).run(badgeId, userId);

  res.json({
    success: true,
    badge_id: badgeId,
    user_id: userId,
    removed: (parseInt(result?.changes, 10) || 0) > 0,
  });
});

// ─── Achievement System ─────────────────────────────────────────────────────

const ACHIEVEMENT_BADGE_UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/heic', 'image/heif', 'image/avif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

async function compressAchievementBadgeImage(buffer) {
  let result = await sharp(buffer)
    .rotate()
    .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 64 })
    .toBuffer();
  if (result.length > 120 * 1024) {
    result = await sharp(buffer)
      .rotate()
      .resize(220, 220, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 50 })
      .toBuffer();
  }
  return `data:image/webp;base64,${result.toString('base64')}`;
}

// GET /api/auth/admin/achievements — list all achievement series with tiers
router.get('/admin/achievements', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const series = db.prepare(`
    SELECT id, key, name, description, created_at, updated_at
    FROM achievement_series
    ORDER BY name COLLATE NOCASE ASC
  `).all();

  const tiers = db.prepare(`
    SELECT id, series_id, threshold, name, description, image_data, sort_order, created_at, updated_at
    FROM achievement_tiers
    ORDER BY sort_order ASC, threshold ASC
  `).all();

  const awardCounts = db.prepare(`
    SELECT tier_id, COUNT(*) AS cnt
    FROM achievement_awards
    GROUP BY tier_id
  `).all();
  const awardCountMap = {};
  for (const row of awardCounts) awardCountMap[row.tier_id] = row.cnt;

  const tiersBySeries = {};
  for (const tier of tiers) {
    if (!tiersBySeries[tier.series_id]) tiersBySeries[tier.series_id] = [];
    tiersBySeries[tier.series_id].push({
      id: tier.id,
      series_id: tier.series_id,
      threshold: tier.threshold,
      name: tier.name || '',
      description: tier.description || '',
      image: tier.image_data || '',
      sort_order: tier.sort_order,
      award_count: awardCountMap[tier.id] || 0,
      created_at: tier.created_at || '',
      updated_at: tier.updated_at || '',
    });
  }

  res.json({
    series: series.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name || '',
      description: s.description || '',
      tiers: tiersBySeries[s.id] || [],
      created_at: s.created_at || '',
      updated_at: s.updated_at || '',
    })),
  });
});

// POST /api/auth/admin/achievements — create achievement series
router.post('/admin/achievements', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const key = String(req.body?.key || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64);
  const name = normalizeGroupName(req.body?.name || '', 80);
  const description = normalizeGroupText(req.body?.description || '', 300);
  if (!key) return res.status(400).json({ error: 'Series key is required' });
  if (!name) return res.status(400).json({ error: 'Series name is required' });

  const existing = db.prepare('SELECT id FROM achievement_series WHERE key = ?').get(key);
  if (existing) return res.status(409).json({ error: 'A series with this key already exists' });

  const seriesId = uuidv4();
  db.prepare(`
    INSERT INTO achievement_series (id, key, name, description, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(seriesId, key, name, description, String(req.user?.id || '').trim());

  res.status(201).json({
    id: seriesId,
    key,
    name,
    description,
    tiers: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
});

// PUT /api/auth/admin/achievements/:seriesId — update achievement series
router.put('/admin/achievements/:seriesId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const seriesId = String(req.params.seriesId || '').trim();
  const series = db.prepare('SELECT * FROM achievement_series WHERE id = ?').get(seriesId);
  if (!series) return res.status(404).json({ error: 'Series not found' });

  const name = req.body?.name !== undefined ? normalizeGroupName(req.body.name, 80) : series.name;
  const description = req.body?.description !== undefined ? normalizeGroupText(req.body.description, 300) : series.description;
  if (!name) return res.status(400).json({ error: 'Series name is required' });

  db.prepare(`
    UPDATE achievement_series SET name = ?, description = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name, description, seriesId);

  res.json({ id: seriesId, key: series.key, name, description });
});

// DELETE /api/auth/admin/achievements/:seriesId — delete achievement series
router.delete('/admin/achievements/:seriesId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const seriesId = String(req.params.seriesId || '').trim();
  const result = db.prepare('DELETE FROM achievement_series WHERE id = ?').run(seriesId);
  res.json({ success: true, removed: (parseInt(result?.changes, 10) || 0) > 0 });
});

// POST /api/auth/admin/achievements/:seriesId/tiers — create tier
router.post('/admin/achievements/:seriesId/tiers', requireAuth, requireAdmin, ACHIEVEMENT_BADGE_UPLOAD.single('image'), async (req, res) => {
  const db = getDb();
  const seriesId = String(req.params.seriesId || '').trim();
  const series = db.prepare('SELECT id FROM achievement_series WHERE id = ?').get(seriesId);
  if (!series) return res.status(404).json({ error: 'Series not found' });

  const name = normalizeGroupName(req.body?.name || '', 64);
  const description = normalizeGroupText(req.body?.description || '', 200);
  const threshold = parseInt(req.body?.threshold, 10);
  if (!name) return res.status(400).json({ error: 'Tier name is required' });
  if (isNaN(threshold) || threshold < 1) return res.status(400).json({ error: 'Threshold must be a positive number' });
  if (!req.file) return res.status(400).json({ error: 'Badge image is required' });

  let imageData = '';
  try {
    imageData = await compressAchievementBadgeImage(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'Failed to process badge image' });
  }

  // Auto-assign sort_order based on threshold
  const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM achievement_tiers WHERE series_id = ?').get(seriesId);
  const sortOrder = (maxOrder?.m ?? -1) + 1;

  const tierId = uuidv4();
  db.prepare(`
    INSERT INTO achievement_tiers (id, series_id, threshold, name, description, image_data, sort_order, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(tierId, seriesId, threshold, name, description, imageData, sortOrder, String(req.user?.id || '').trim());

  const tier = db.prepare('SELECT * FROM achievement_tiers WHERE id = ?').get(tierId);
  const awardCount = db.prepare('SELECT COUNT(*) AS cnt FROM achievement_awards WHERE tier_id = ?').get(tierId)?.cnt || 0;

  res.status(201).json({
    id: tier.id,
    series_id: tier.series_id,
    threshold: tier.threshold,
    name: tier.name || '',
    description: tier.description || '',
    image: tier.image_data || '',
    sort_order: tier.sort_order,
    award_count: awardCount,
    created_at: tier.created_at || '',
    updated_at: tier.updated_at || '',
  });
});

// PUT /api/auth/admin/achievements/:seriesId/tiers/:tierId — update tier
router.put('/admin/achievements/:seriesId/tiers/:tierId', requireAuth, requireAdmin, ACHIEVEMENT_BADGE_UPLOAD.single('image'), async (req, res) => {
  const db = getDb();
  const seriesId = String(req.params.seriesId || '').trim();
  const tierId = String(req.params.tierId || '').trim();
  const tier = db.prepare('SELECT * FROM achievement_tiers WHERE id = ? AND series_id = ?').get(tierId, seriesId);
  if (!tier) return res.status(404).json({ error: 'Tier not found' });

  const nextName = req.body?.name !== undefined ? normalizeGroupName(req.body.name, 64) : tier.name;
  const nextDescription = req.body?.description !== undefined ? normalizeGroupText(req.body.description, 200) : tier.description;
  const nextThreshold = req.body?.threshold !== undefined ? parseInt(req.body.threshold, 10) : tier.threshold;
  if (!nextName) return res.status(400).json({ error: 'Tier name is required' });
  if (isNaN(nextThreshold) || nextThreshold < 1) return res.status(400).json({ error: 'Threshold must be a positive number' });

  let nextImageData = tier.image_data || '';
  if (req.file) {
    try {
      nextImageData = await compressAchievementBadgeImage(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err?.message || 'Failed to process badge image' });
    }
  }

  db.prepare(`
    UPDATE achievement_tiers
    SET name = ?, description = ?, threshold = ?, image_data = ?, updated_at = datetime('now')
    WHERE id = ? AND series_id = ?
  `).run(nextName, nextDescription, nextThreshold, nextImageData, tierId, seriesId);

  const updated = db.prepare('SELECT * FROM achievement_tiers WHERE id = ?').get(tierId);
  const awardCount = db.prepare('SELECT COUNT(*) AS cnt FROM achievement_awards WHERE tier_id = ?').get(tierId)?.cnt || 0;

  res.json({
    id: updated.id,
    series_id: updated.series_id,
    threshold: updated.threshold,
    name: updated.name || '',
    description: updated.description || '',
    image: updated.image_data || '',
    sort_order: updated.sort_order,
    award_count: awardCount,
    created_at: updated.created_at || '',
    updated_at: updated.updated_at || '',
  });
});

// DELETE /api/auth/admin/achievements/:seriesId/tiers/:tierId — delete tier
router.delete('/admin/achievements/:seriesId/tiers/:tierId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const seriesId = String(req.params.seriesId || '').trim();
  const tierId = String(req.params.tierId || '').trim();
  const result = db.prepare('DELETE FROM achievement_tiers WHERE id = ? AND series_id = ?').run(tierId, seriesId);
  res.json({ success: true, removed: (parseInt(result?.changes, 10) || 0) > 0 });
});

// POST /api/auth/admin/achievements/evaluate/:seriesKey — evaluate and award achievements for a series
router.post('/admin/achievements/evaluate/:seriesKey', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const seriesKey = String(req.params.seriesKey || '').trim().toLowerCase();
  const series = db.prepare('SELECT * FROM achievement_series WHERE key = ?').get(seriesKey);
  if (!series) return res.status(404).json({ error: 'Series not found' });
  const tierCount = db.prepare('SELECT COUNT(*) AS cnt FROM achievement_tiers WHERE series_id = ?').get(series.id)?.cnt || 0;
  if (!tierCount) return res.json({ evaluated: seriesKey, awarded: 0 });

  const awarded = evaluateAchievementSeries(db, seriesKey);
  res.json({ evaluated: seriesKey, awarded });
});

// GET /api/auth/user/:id/achievements — get a user's achievement badges
router.get('/user/:id/achievements', (req, res) => {
  const db = getDb();
  const userId = String(req.params.id || '').trim();
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ achievements: getUserAchievementBadges(db, userId) });
});

// POST /api/auth/group-popups/consume - fetch one pending popup and mark it seen
router.post('/group-popups/consume', requireAuth, (req, res) => {
  const db = getDb();
  const userId = String(req.user?.id || '').trim();
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const popup = db.prepare(`
    SELECT p.id, p.title, p.slides_json, p.created_at
    FROM admin_user_group_popups p
    JOIN admin_user_group_popup_recipients r ON r.popup_id = p.id
    LEFT JOIN admin_user_group_popup_seen s
      ON s.popup_id = p.id
      AND s.user_id = ?
    WHERE r.user_id = ?
      AND s.popup_id IS NULL
    ORDER BY datetime(p.created_at) DESC
    LIMIT 1
  `).get(userId, userId);

  if (!popup) {
    return res.json({ popup: null });
  }

  db.prepare(`
    INSERT OR IGNORE INTO admin_user_group_popup_seen (popup_id, user_id, seen_at)
    VALUES (?, ?, datetime('now'))
  `).run(popup.id, userId);

  let slides = [];
  try {
    const parsed = JSON.parse(popup.slides_json || '[]');
    slides = normalizePopupSlides(parsed);
  } catch {
    slides = [];
  }

  res.json({
    popup: {
      id: popup.id,
      title: popup.title || '',
      slides,
      created_at: popup.created_at || '',
    },
  });
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
  const {
    email, avatar, pumbility, skill_title, skill_level, gender, nationality,
    date_of_birth, show_age, description,
    age, height_cm, weight_kg,
    location_country, location_country_code, location_city, location_lat, location_lng,
  } = req.body;
  const parsedAge = parseOptionalHealthNumber(age, { min: 1, max: 120, integer: true });
  const parsedHeightCm = parseOptionalHealthNumber(height_cm, { min: 50, max: 280 });
  const parsedWeightKg = parseOptionalHealthNumber(weight_kg, { min: 20, max: 350 });
  if (!parsedAge.valid) return res.status(400).json({ error: 'Age must be between 1 and 120' });
  if (!parsedHeightCm.valid) return res.status(400).json({ error: 'Height must be between 50 and 280 cm' });
  if (!parsedWeightKg.valid) return res.status(400).json({ error: 'Weight must be between 20 and 350 kg' });

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
      age = CASE WHEN ? THEN ? ELSE age END,
      height_cm = CASE WHEN ? THEN ? ELSE height_cm END,
      weight_kg = CASE WHEN ? THEN ? ELSE weight_kg END,
      description = COALESCE(?, description),
      location_country = COALESCE(?, location_country),
      location_country_code = COALESCE(?, location_country_code),
      location_city = COALESCE(?, location_city),
      location_lat = COALESCE(?, location_lat),
      location_lng = COALESCE(?, location_lng)
    WHERE id = ?
  `).run(
    email,
    avatar,
    pumbility,
    skill_title,
    skill_level,
    gender,
    nationality,
    date_of_birth,
    show_age !== undefined ? (show_age ? 1 : 0) : null,
    parsedAge.provided ? 1 : 0,
    parsedAge.value,
    parsedHeightCm.provided ? 1 : 0,
    parsedHeightCm.value,
    parsedWeightKg.provided ? 1 : 0,
    parsedWeightKg.value,
    description,
    location_country,
    location_country_code,
    location_city,
    Number.isFinite(Number(location_lat)) ? Number(location_lat) : null,
    Number.isFinite(Number(location_lng)) ? Number(location_lng) : null,
    req.user.id
  );

  if (avatar != null) {
    db.prepare('UPDATE users SET avatar_v = COALESCE(avatar_v, 0) + 1 WHERE id = ?').run(req.user.id);
  }

  const user = db.prepare(`
    SELECT id, username, is_admin, email, avatar, avatar_v, pumbility, skill_title, skill_level, gender, nationality,
           date_of_birth, show_age, age, height_cm, weight_kg, description,
           location_country, location_country_code, location_city, location_lat, location_lng,
           created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  res.json(toClientAuthUser(db, user, 96));
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
    SELECT id, username, avatar, avatar_v, pumbility, skill_title, skill_level, gender, nationality, description
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

  res.json(users.map(u => normalizeClientUser(u, 48)));
});

// GET /api/auth/user/username/:username - get public user profile by username
router.get('/user/username/:username', (req, res) => {
  const db = getDb();
  const username = decodeURIComponent(String(req.params.username || '')).trim().replace(/^@+/, '');
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const user = db.prepare(`
    SELECT id, username, avatar, avatar_v, pumbility, skill_title, skill_level, gender, nationality,
           date_of_birth, show_age, description,
           location_country, location_country_code, location_city, location_lat, location_lng,
           playing_status, created_at
    FROM users WHERE LOWER(username) = LOWER(?)
  `).get(username);

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(makePublicUser(db, user));
});

// GET /api/auth/user/:id - get public user profile
router.get('/user/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, username, avatar, avatar_v, pumbility, skill_title, skill_level, gender, nationality,
           date_of_birth, show_age, description,
           location_country, location_country_code, location_city, location_lat, location_lng,
           playing_status, created_at
    FROM users WHERE id = ?
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(makePublicUser(db, user));
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

  // Get match results for all tournament players in one query
  const matchResults = [];
  if (tournamentPlayers.length > 0) {
    const playerIds = tournamentPlayers.map(tp => tp.id);
    const tournamentIds = [...new Set(tournamentPlayers.map(tp => tp.tournament_id))];
    const tPlaceholders = tournamentIds.map(() => '?').join(',');
    const pPlaceholders = playerIds.map(() => '?').join(',');
    const allMatches = db.prepare(`
      SELECT m.*, p1.name as player1_name, p2.name as player2_name
      FROM matches m
      LEFT JOIN players p1 ON m.player1_id = p1.id
      LEFT JOIN players p2 ON m.player2_id = p2.id
      WHERE m.tournament_id IN (${tPlaceholders})
        AND (m.player1_id IN (${pPlaceholders}) OR m.player2_id IN (${pPlaceholders}))
      ORDER BY m.round_number ASC
    `).all(...tournamentIds, ...playerIds, ...playerIds);
    const matchesByTournamentPlayer = {};
    for (const m of allMatches) {
      for (const tp of tournamentPlayers) {
        if (m.tournament_id === tp.tournament_id && (m.player1_id === tp.id || m.player2_id === tp.id)) {
          const key = `${tp.tournament_id}-${tp.id}`;
          if (!matchesByTournamentPlayer[key]) matchesByTournamentPlayer[key] = [];
          matchesByTournamentPlayer[key].push(m);
        }
      }
    }
    for (const tp of tournamentPlayers) {
      matchResults.push({ tournament: tp, matches: matchesByTournamentPlayer[`${tp.tournament_id}-${tp.id}`] || [] });
    }
  }

  // Duel participation
  const duels = db.prepare(`
    SELECT * FROM duels
    WHERE player1_user_id = ? OR player2_user_id = ?
    ORDER BY created_at DESC
  `).all(userId, userId);

  // Get duel songs for scoring data (batch instead of N+1)
  const duelStats = [];
  if (duels.length > 0) {
    const duelIds = duels.map(d => d.id);
    const dPlaceholders = duelIds.map(() => '?').join(',');
    const allDuelSongs = db.prepare(
      `SELECT * FROM duel_songs WHERE duel_id IN (${dPlaceholders}) ORDER BY played_order ASC`
    ).all(...duelIds);
    const songsByDuel = {};
    for (const s of allDuelSongs) {
      if (!songsByDuel[s.duel_id]) songsByDuel[s.duel_id] = [];
      songsByDuel[s.duel_id].push(s);
    }
    for (const d of duels) {
      duelStats.push({ duel: d, songs: songsByDuel[d.id] || [] });
    }
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

  // Batch online duel songs
  const onlineDuelStats = [];
  if (onlineDuels.length > 0) {
    const odIds = onlineDuels.map(od => od.id);
    const odPlaceholders = odIds.map(() => '?').join(',');
    const allOnlineSongs = db.prepare(
      `SELECT * FROM online_duel_songs WHERE duel_id IN (${odPlaceholders}) ORDER BY created_at ASC`
    ).all(...odIds);
    const onlineSongsByDuel = {};
    for (const s of allOnlineSongs) {
      if (!onlineSongsByDuel[s.duel_id]) onlineSongsByDuel[s.duel_id] = [];
      onlineSongsByDuel[s.duel_id].push(s);
    }
    for (const od of onlineDuels) {
      onlineDuelStats.push({ duel: od, songs: onlineSongsByDuel[od.id] || [] });
    }
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
  // Prevent 304 responses; client expects a JSON body on every call.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
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
    SELECT *
    FROM user_notifications
    WHERE user_id = ?
      AND type != 'direct_message'
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.id);

  const invitationCount = db.prepare(`
    SELECT COUNT(*) as count FROM invitations WHERE user_id = ? AND status = 'pending'
  `).get(req.user.id).count;

  const unreadCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_notifications
    WHERE user_id = ?
      AND read = 0
      AND type != 'direct_message'
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
module.exports.isAdminUser = isAdminUser;
module.exports.hasFeatureAccess = hasFeatureAccess;

const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');

const router = express.Router();
const DEVIT_START_PLATFORM_LAG_DEFAULT = 3;
const DEVIT_START_PLATFORM_LAG_MIN = 1;
const DEVIT_START_PLATFORM_LAG_MAX = 12;

function toPositiveInt(value, fallback, max = 50) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeDevitStartPlatformLag(value, fallback = DEVIT_START_PLATFORM_LAG_DEFAULT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(DEVIT_START_PLATFORM_LAG_MIN, Math.min(DEVIT_START_PLATFORM_LAG_MAX, parsed));
}

function ensureFunSettingsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fun_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      devit_start_platform_lag INTEGER NOT NULL DEFAULT ${DEVIT_START_PLATFORM_LAG_DEFAULT},
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const hasRow = db.prepare('SELECT id FROM fun_settings WHERE id = 1').get();
  if (!hasRow) {
    db.prepare(`
      INSERT INTO fun_settings (id, devit_start_platform_lag)
      VALUES (1, ?)
    `).run(DEVIT_START_PLATFORM_LAG_DEFAULT);
  }
}

function getFunSettingsPayload(db) {
  ensureFunSettingsTable(db);
  const row = db.prepare(`
    SELECT devit_start_platform_lag, updated_at
    FROM fun_settings
    WHERE id = 1
  `).get();
  return {
    devit_start_platform_lag: normalizeDevitStartPlatformLag(row?.devit_start_platform_lag),
    updated_at: row?.updated_at || '',
  };
}

function getUserRank(db, bestScore) {
  if (!Number.isFinite(bestScore) || bestScore <= 0) return null;
  const row = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM (
      SELECT user_id
      FROM fun_scores
      GROUP BY user_id
      HAVING MAX(score) > ?
    ) ranked
  `).get(bestScore);
  return Number.parseInt(row?.rank, 10) || 1;
}

function getMySummary(db, userId) {
  const row = db.prepare(`
    SELECT MAX(score) AS best_score, COUNT(*) AS run_count
    FROM fun_scores
    WHERE user_id = ?
  `).get(userId);
  const bestScore = Number.parseInt(row?.best_score, 10) || 0;
  const runCount = Number.parseInt(row?.run_count, 10) || 0;
  return {
    best_score: bestScore,
    run_count: runCount,
    rank: bestScore > 0 ? getUserRank(db, bestScore) : null,
  };
}

function buildShinsaInMotionPayload(db) {
  const activeUsers = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.avatar,
      u.avatar_v,
      u.created_at AS joined_at,
      COUNT(r.id) AS play_count,
      MIN(CASE WHEN TRIM(COALESCE(r.date_played, '')) <> '' THEN r.date_played END) AS first_played_at,
      MAX(CASE WHEN TRIM(COALESCE(r.date_played, '')) <> '' THEN r.date_played END) AS last_played_at
    FROM users u
    JOIN user_recently_played r ON r.user_id = u.id
    GROUP BY u.id
    HAVING COUNT(r.id) > 0
    ORDER BY play_count DESC, COALESCE(last_played_at, joined_at) ASC, u.username COLLATE NOCASE ASC
  `).all();

  const totals = {
    active_users: activeUsers.length,
    total_plays: activeUsers.reduce((sum, row) => sum + (Number.parseInt(row.play_count, 10) || 0), 0),
  };

  if (activeUsers.length === 0) {
    return {
      title: 'Shinsa in Motion',
      duration_ms: 30000,
      totals,
      span: {
        earliest_joined_at: '',
        earliest_played_at: '',
        latest_played_at: '',
      },
      users: [],
    };
  }

  const userIds = activeUsers.map((row) => row.id);
  const placeholders = userIds.map(() => '?').join(', ');
  const playRows = db.prepare(`
    SELECT
      id,
      user_id,
      song_title,
      mode,
      level,
      score,
      grade,
      date_played
    FROM user_recently_played
    WHERE user_id IN (${placeholders})
    ORDER BY
      user_id ASC,
      CASE WHEN TRIM(COALESCE(date_played, '')) = '' THEN 1 ELSE 0 END ASC,
      date_played ASC,
      id ASC
  `).all(...userIds);

  const playsByUserId = new Map();
  for (const row of playRows) {
    if (!playsByUserId.has(row.user_id)) playsByUserId.set(row.user_id, []);
    playsByUserId.get(row.user_id).push({
      id: row.id,
      song_title: String(row.song_title || '').trim(),
      mode: String(row.mode || '').trim(),
      level: Number.parseInt(row.level, 10) || 0,
      score: Number.parseInt(row.score, 10) || 0,
      grade: String(row.grade || '').trim(),
      date_played: String(row.date_played || '').trim(),
    });
  }

  const joinedDates = activeUsers
    .map((row) => String(row.joined_at || '').trim())
    .filter(Boolean)
    .sort();
  const playedDates = playRows
    .map((row) => String(row.date_played || '').trim())
    .filter(Boolean)
    .sort();

  return {
    title: 'Shinsa in Motion',
    duration_ms: 30000,
    totals,
    span: {
      earliest_joined_at: joinedDates[0] || '',
      earliest_played_at: playedDates[0] || '',
      latest_played_at: playedDates[playedDates.length - 1] || '',
    },
    users: activeUsers.map((row, index) => ({
      rank: index + 1,
      id: row.id,
      username: row.username,
      avatar: normalizeUserAvatarForList(row.avatar, row.id, 72, row.avatar_v),
      joined_at: String(row.joined_at || '').trim(),
      first_played_at: String(row.first_played_at || '').trim(),
      last_played_at: String(row.last_played_at || '').trim(),
      play_count: Number.parseInt(row.play_count, 10) || 0,
      plays: playsByUserId.get(row.id) || [],
    })),
  };
}

// GET /api/fun/settings
router.get('/settings', (req, res) => {
  const db = getDb();
  res.json(getFunSettingsPayload(db));
});

// PUT /api/fun/settings
router.put('/settings', requireAuth, (req, res) => {
  const db = getDb();
  const requested = req.body?.devit_start_platform_lag;
  if (requested === undefined || requested === null || requested === '') {
    return res.status(400).json({ error: 'devit_start_platform_lag is required' });
  }
  const parsed = Number.parseInt(requested, 10);
  if (!Number.isFinite(parsed)) {
    return res.status(400).json({ error: 'devit_start_platform_lag must be an integer' });
  }
  const value = normalizeDevitStartPlatformLag(parsed);
  ensureFunSettingsTable(db);
  db.prepare(`
    UPDATE fun_settings
    SET devit_start_platform_lag = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(value);
  res.json(getFunSettingsPayload(db));
});

// GET /api/fun/shinsa-in-motion
router.get('/shinsa-in-motion', (req, res) => {
  const db = getDb();
  res.json(buildShinsaInMotionPayload(db));
});

// GET /api/fun/leaderboard
router.get('/leaderboard', requireAuth, (req, res) => {
  const db = getDb();
  const limit = toPositiveInt(req.query.limit, 10);
  const rows = db.prepare(`
    WITH best AS (
      SELECT
        fs.user_id,
        MAX(fs.score) AS best_score,
        COUNT(*) AS run_count,
        MAX(fs.created_at) AS last_played_at
      FROM fun_scores fs
      GROUP BY fs.user_id
    )
    SELECT
      b.user_id,
      u.username,
      u.avatar,
      b.best_score,
      b.run_count,
      b.last_played_at
    FROM best b
    JOIN users u ON u.id = b.user_id
    ORDER BY b.best_score DESC, b.last_played_at ASC, u.username COLLATE NOCASE ASC
    LIMIT ?
  `).all(limit);

  const leaderboard = rows.map((row, index) => ({
    rank: index + 1,
    user_id: row.user_id,
    username: row.username,
    avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 64),
    score: Number.parseInt(row.best_score, 10) || 0,
    run_count: Number.parseInt(row.run_count, 10) || 0,
    last_played_at: row.last_played_at || '',
  }));

  res.json({
    leaderboard,
    me: getMySummary(db, req.user.id),
  });
});

// POST /api/fun/score
router.post('/score', requireAuth, (req, res) => {
  const db = getDb();
  const score = Number.parseInt(req.body?.score, 10);
  if (!Number.isFinite(score) || score < 0) {
    return res.status(400).json({ error: 'Score must be a non-negative integer' });
  }
  const boundedScore = Math.min(score, 2000000);

  db.prepare(`
    INSERT INTO fun_scores (user_id, score)
    VALUES (?, ?)
  `).run(req.user.id, boundedScore);

  res.status(201).json({
    saved: true,
    ...getMySummary(db, req.user.id),
  });
});

module.exports = router;

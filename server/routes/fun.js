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

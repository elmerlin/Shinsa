const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');

// ---- Token helpers ----------------------------------------------------------
// Tokens are presented to the API caller as `pump_pat_<32 hex>`. We never
// store the plaintext — only sha256 of it. The user sees the plaintext
// exactly once at generation time.

const TOKEN_PREFIX = 'pump_pat_';
const TOKEN_RANDOM_BYTES = 24;
const ALLOWED_SCOPES = new Set(['steps:read']);

function generateToken() {
  return TOKEN_PREFIX + crypto.randomBytes(TOKEN_RANDOM_BYTES).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeScopes(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim();
    if (ALLOWED_SCOPES.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function tokenHasScope(tokenRow, scope) {
  try {
    const scopes = JSON.parse(tokenRow.scopes || '[]');
    return Array.isArray(scopes) && scopes.includes(scope);
  } catch {
    return false;
  }
}

// ---- PAT middleware ---------------------------------------------------------
// Validates `Authorization: Bearer pump_pat_...` against user_api_tokens.
// Sets req.user = { id } and req.apiToken = { id, scopes } on success.
function requireApiToken(req, res, next) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) {
    return res.status(401).json({ error: 'Missing or malformed API token' });
  }
  const db = getDb();
  const row = db.prepare(`
    SELECT id, user_id, scopes, revoked_at
      FROM user_api_tokens
     WHERE token_hash = ?
     LIMIT 1
  `).get(hashToken(raw));
  if (!row || row.revoked_at) {
    return res.status(401).json({ error: 'Invalid or revoked token' });
  }
  // Best-effort touch. Don't fail the request if the write trips a busy lock.
  try {
    db.prepare(`UPDATE user_api_tokens SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
  } catch { /* ignore */ }
  req.user = { id: row.user_id };
  req.apiToken = { id: row.id, scopes: row.scopes };
  next();
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiToken || !tokenHasScope(req.apiToken, scope)) {
      return res.status(403).json({ error: `Token missing scope: ${scope}` });
    }
    next();
  };
}

// ---- Data endpoints (PAT-authenticated) -------------------------------------

// GET /api/external/steps?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns daily step totals where one "step" = perfect+great+good+bad
// (everything but misses). Date is the local `date_played` PIUGame surfaces,
// so totals line up with what the user sees on the recently-played list.
//
// Each day also includes a sparse `hours` array bucketing plays by the UTC
// hour they were logged at (`played_at_utc`). Hours with no plays are
// omitted; sum of `hours[].steps` may be < `days[].steps` because some
// older plays predate the `played_at_utc` column and have no timestamp.
router.get('/steps', requireApiToken, requireScope('steps:read'), (req, res) => {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be <= to' });
  }
  const db = getDb();
  const dayRows = db.prepare(`
    SELECT date_played AS date,
           COALESCE(SUM(COALESCE(perfect,0) + COALESCE(great,0) + COALESCE(good,0) + COALESCE(bad,0)), 0) AS steps,
           COUNT(*) AS plays
      FROM user_recently_played
     WHERE user_id = ?
       AND date_played BETWEEN ? AND ?
     GROUP BY date_played
     ORDER BY date_played ASC
  `).all(req.user.id, from, to);
  const hourRows = db.prepare(`
    SELECT date_played AS date,
           CAST(strftime('%H', played_at_utc) AS INTEGER) AS hour,
           COALESCE(SUM(COALESCE(perfect,0) + COALESCE(great,0) + COALESCE(good,0) + COALESCE(bad,0)), 0) AS steps,
           COUNT(*) AS plays
      FROM user_recently_played
     WHERE user_id = ?
       AND date_played BETWEEN ? AND ?
       AND played_at_utc != ''
     GROUP BY date_played, hour
     ORDER BY date_played ASC, hour ASC
  `).all(req.user.id, from, to);
  const hoursByDate = new Map();
  for (const r of hourRows) {
    if (!hoursByDate.has(r.date)) hoursByDate.set(r.date, []);
    hoursByDate.get(r.date).push({
      hour: Number(r.hour) || 0,
      steps: Number(r.steps) || 0,
      plays: Number(r.plays) || 0,
    });
  }
  res.json({
    user_id: req.user.id,
    from,
    to,
    hour_basis: 'utc',
    days: dayRows.map((r) => ({
      date: r.date,
      steps: Number(r.steps) || 0,
      plays: Number(r.plays) || 0,
      hours: hoursByDate.get(r.date) || [],
    })),
  });
});

// ---- Per-play (kcal per song) -----------------------------------------------
// MET formula mirrors server/lib/liveSessionSummary.js. PIU sessions are
// roughly 11.8 MET (vigorous dance); a song is ~2 minutes.
const PIU_SESSION_MET = 11.8;
const PIU_SONG_LENGTH_MINUTES = 2;
const DEFAULT_WEIGHT_KG = 70;

// GET /api/external/plays?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100
// Returns per-play rows in the date range, newest first. Each row carries
// the song, score, judgments, and kcal — preferring the OCR-captured value
// from PIUGame when present and falling back to a MET-based estimate
// scaled by the user's profile weight (or 70 kg default) when the row's
// kcal column is empty.
//
// Date semantics match /steps: `date_played` is a free-form string PIUGame
// surfaces (often "YYYY-MM-DD HH:MM:SS (GMT±N)"), so the BETWEEN check uses
// lexicographic prefix matching on the YYYY-MM-DD inputs.
router.get('/plays', requireApiToken, requireScope('steps:read'), (req, res) => {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be <= to' });
  }
  const limitRaw = parseInt(String(req.query.limit || '100'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;

  const db = getDb();
  const userRow = db.prepare('SELECT weight_kg FROM users WHERE id = ?').get(req.user.id);
  const profileWeight = Number(userRow?.weight_kg);
  const weightKgUsed = Number.isFinite(profileWeight) && profileWeight > 0 ? profileWeight : DEFAULT_WEIGHT_KG;
  const kcalPerSongEstimate = (PIU_SESSION_MET * 3.5 * weightKgUsed / 200) * PIU_SONG_LENGTH_MINUTES;
  const weightSource = Number.isFinite(profileWeight) && profileWeight > 0 ? 'profile' : 'default';

  const rows = db.prepare(`
    SELECT id AS play_id,
           date_played,
           played_at_utc,
           song_title,
           mode,
           level,
           score,
           grade,
           plate,
           COALESCE(perfect,0) + COALESCE(great,0) + COALESCE(good,0) + COALESCE(bad,0) AS steps,
           COALESCE(kcal, 0) AS kcal_logged,
           COALESCE(perfect, 0) AS perfect,
           COALESCE(great, 0) AS great,
           COALESCE(good, 0) AS good,
           COALESCE(bad, 0) AS bad,
           COALESCE(miss, 0) AS miss,
           COALESCE(max_combo, 0) AS max_combo,
           COALESCE(replay_embed_url, '') AS replay_embed_url,
           COALESCE(replay_video_id, '') AS replay_video_id
      FROM user_recently_played
     WHERE user_id = ?
       AND date_played BETWEEN ? AND ?
     ORDER BY COALESCE(played_at_utc, date_played) DESC, id DESC
     LIMIT ?
  `).all(req.user.id, from, to, limit);

  res.json({
    user_id: req.user.id,
    from,
    to,
    limit,
    count: rows.length,
    kcal_weight_kg: weightKgUsed,
    kcal_weight_source: weightSource,
    kcal_per_song_estimate: Math.round(kcalPerSongEstimate * 100) / 100,
    plays: rows.map((r) => {
      const logged = Number(r.kcal_logged) || 0;
      const kcal = logged > 0 ? logged : kcalPerSongEstimate;
      return {
        play_id: Number(r.play_id) || 0,
        played_at_utc: r.played_at_utc || '',
        date_played: r.date_played || '',
        song_title: r.song_title || '',
        mode: r.mode || '',
        level: Number(r.level) || 0,
        score: Number(r.score) || 0,
        grade: r.grade || '',
        plate: r.plate || '',
        steps: Number(r.steps) || 0,
        kcal: Math.round(kcal * 100) / 100,
        kcal_source: logged > 0 ? 'logged' : 'estimated',
        judgments: {
          perfect: Number(r.perfect) || 0,
          great: Number(r.great) || 0,
          good: Number(r.good) || 0,
          bad: Number(r.bad) || 0,
          miss: Number(r.miss) || 0,
        },
        max_combo: Number(r.max_combo) || 0,
        replay_embed_url: r.replay_embed_url || '',
        replay_video_id: r.replay_video_id || '',
      };
    }),
  });
});

// ---- Token management (JWT-authenticated) -----------------------------------
// These are called from the account-settings UI on pumpshinsa, not from
// external apps. They use the normal session JWT.

function serializeTokenRow(row) {
  let scopes = [];
  try { scopes = JSON.parse(row.scopes || '[]'); } catch { /* leave empty */ }
  return {
    id: row.id,
    name: row.name || '',
    scopes,
    created_at: row.created_at || '',
    last_used_at: row.last_used_at || null,
    revoked_at: row.revoked_at || null,
  };
}

// GET /api/external/tokens — list this user's tokens (metadata only)
router.get('/tokens', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, name, scopes, created_at, last_used_at, revoked_at
      FROM user_api_tokens
     WHERE user_id = ?
     ORDER BY (revoked_at IS NULL) DESC, created_at DESC
  `).all(req.user.id);
  res.json({ tokens: rows.map(serializeTokenRow) });
});

// POST /api/external/tokens { name?, scopes? } — create a token. Returns the
// plaintext token in the response. This is the only time the user sees it.
router.post('/tokens', requireAuth, (req, res) => {
  const name = String((req.body && req.body.name) || '').trim().slice(0, 80);
  const scopes = normalizeScopes((req.body && req.body.scopes) || ['steps:read']);
  if (scopes.length === 0) {
    return res.status(400).json({ error: 'At least one valid scope is required' });
  }
  const db = getDb();
  const token = generateToken();
  const result = db.prepare(`
    INSERT INTO user_api_tokens (user_id, name, token_hash, scopes)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, name, hashToken(token), JSON.stringify(scopes));
  const row = db.prepare(`
    SELECT id, name, scopes, created_at, last_used_at, revoked_at
      FROM user_api_tokens WHERE id = ?
  `).get(result.lastInsertRowid);
  res.json({ token, ...serializeTokenRow(row) });
});

// POST /api/external/tokens/:id/revoke — revoke a token (soft-delete).
router.post('/tokens/:id/revoke', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid token id' });
  const db = getDb();
  const result = db.prepare(`
    UPDATE user_api_tokens
       SET revoked_at = datetime('now')
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).run(id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Token not found or already revoked' });
  }
  res.json({ ok: true });
});

module.exports = router;

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validate an IANA tz name by asking Intl whether it accepts it. Returns
// the canonical name on success, null on failure. Caches results so we
// don't pay the validation cost on every request.
const tzCache = new Map();
function validateTimezone(tz) {
  if (!tz) return null;
  if (tzCache.has(tz)) return tzCache.get(tz);
  try {
    const canonical = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).resolvedOptions().timeZone;
    tzCache.set(tz, canonical);
    return canonical;
  } catch {
    tzCache.set(tz, null);
    return null;
  }
}

// Given a UTC timestamp string like "2026-05-17 21:23:54" (no Z) and an
// IANA timezone, return { date, hour } as observed in that zone. Returns
// null if the timestamp is unparseable.
function utcToZoned(utcString, tz) {
  if (!utcString) return null;
  const iso = utcString.includes('T') ? utcString : utcString.replace(' ', 'T');
  const ts = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (!Number.isFinite(ts)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ts));
  const v = (type) => parts.find((p) => p.type === type)?.value || '';
  return {
    date: `${v('year')}-${v('month')}-${v('day')}`,
    hour: parseInt(v('hour'), 10) || 0,
  };
}

// GET /api/external/steps?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/London
// Returns daily step totals where one "step" = perfect+great+good+bad
// (everything but misses).
//
// `tz` (optional, IANA name): when provided, dates are computed from
// `played_at_utc` in that timezone — so a request from London for
// `from=today&to=today&tz=Europe/London` returns plays the user actually
// did today in London. Without `tz`, dates are the raw `date_played`
// timestamp PIUGame supplies (Asia/Seoul) — kept for backwards compat
// with the original /steps consumers.
//
// `hours[]` per day buckets plays by the local hour (in the same tz);
// without `tz` the hours are still UTC for compat. Hours with no plays
// are omitted; sum may be < `days[].steps` because some older plays
// predate the `played_at_utc` column.
router.get('/steps', requireApiToken, requireScope('steps:read'), (req, res) => {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be <= to' });
  }
  const rawTz = String(req.query.tz || '').trim();
  let tz = null;
  if (rawTz) {
    tz = validateTimezone(rawTz);
    if (!tz) return res.status(400).json({ error: `Unknown tz: ${rawTz}` });
  }
  const db = getDb();

  if (tz) {
    // tz-aware path: pull a UTC-padded slice (±14h to cover any zone),
    // then bucket each play's played_at_utc into the requested tz.
    const fromUtc = new Date(`${from}T00:00:00Z`).getTime() - 14 * 3600 * 1000;
    const toUtc = new Date(`${to}T23:59:59Z`).getTime() + 14 * 3600 * 1000;
    const rows = db.prepare(`
      SELECT played_at_utc,
             COALESCE(perfect,0) + COALESCE(great,0) + COALESCE(good,0) + COALESCE(bad,0) AS steps
        FROM user_recently_played
       WHERE user_id = ?
         AND played_at_utc != ''
         AND played_at_utc >= ?
         AND played_at_utc <= ?
    `).all(
      req.user.id,
      new Date(fromUtc).toISOString().replace('T', ' ').slice(0, 19),
      new Date(toUtc).toISOString().replace('T', ' ').slice(0, 19),
    );
    // dayMap: localDate -> { steps, plays, hours: Map<hour, {steps, plays}> }
    const dayMap = new Map();
    for (const r of rows) {
      const z = utcToZoned(r.played_at_utc, tz);
      if (!z) continue;
      if (z.date < from || z.date > to) continue;
      let day = dayMap.get(z.date);
      if (!day) {
        day = { steps: 0, plays: 0, hours: new Map() };
        dayMap.set(z.date, day);
      }
      const steps = Number(r.steps) || 0;
      day.steps += steps;
      day.plays += 1;
      let hb = day.hours.get(z.hour);
      if (!hb) {
        hb = { steps: 0, plays: 0 };
        day.hours.set(z.hour, hb);
      }
      hb.steps += steps;
      hb.plays += 1;
    }
    const days = Array.from(dayMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, d]) => ({
        date,
        steps: d.steps,
        plays: d.plays,
        hours: Array.from(d.hours.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([hour, hb]) => ({ hour, steps: hb.steps, plays: hb.plays })),
      }));
    return res.json({
      user_id: req.user.id,
      from,
      to,
      tz,
      hour_basis: tz,
      days,
    });
  }

  // Legacy KST path (no tz): kept for backwards compat. Fixes the BETWEEN
  // bug — date_played is stored as a full "YYYY-MM-DD HH:MM:SS (GMT+9)"
  // string, so a date-only BETWEEN never matched anything. Compare on
  // the first 10 chars and group on the same prefix.
  const dayRows = db.prepare(`
    SELECT substr(date_played, 1, 10) AS date,
           COALESCE(SUM(COALESCE(perfect,0) + COALESCE(great,0) + COALESCE(good,0) + COALESCE(bad,0)), 0) AS steps,
           COUNT(*) AS plays
      FROM user_recently_played
     WHERE user_id = ?
       AND substr(date_played, 1, 10) BETWEEN ? AND ?
     GROUP BY date
     ORDER BY date ASC
  `).all(req.user.id, from, to);
  const hourRows = db.prepare(`
    SELECT substr(date_played, 1, 10) AS date,
           CAST(strftime('%H', played_at_utc) AS INTEGER) AS hour,
           COALESCE(SUM(COALESCE(perfect,0) + COALESCE(great,0) + COALESCE(good,0) + COALESCE(bad,0)), 0) AS steps,
           COUNT(*) AS plays
      FROM user_recently_played
     WHERE user_id = ?
       AND substr(date_played, 1, 10) BETWEEN ? AND ?
       AND played_at_utc != ''
     GROUP BY date, hour
     ORDER BY date ASC, hour ASC
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

// GET /api/external/plays?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100&tz=Europe/London
// Returns per-play rows in the date range, newest first. Each row carries
// the song, score, judgments, and kcal — preferring the OCR-captured value
// from PIUGame when present and falling back to a MET-based estimate
// scaled by the user's profile weight (or 70 kg default) when the row's
// kcal column is empty.
//
// Date semantics match /steps:
//   - With `tz` (IANA): the date range is interpreted in that timezone
//     and `played_at_utc` is bucketed into it.
//   - Without `tz`: the legacy KST behavior — compares the first 10 chars
//     of `date_played` (PIUGame's Asia/Seoul timestamp).
router.get('/plays', requireApiToken, requireScope('steps:read'), (req, res) => {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be <= to' });
  }
  const rawTz = String(req.query.tz || '').trim();
  let tz = null;
  if (rawTz) {
    tz = validateTimezone(rawTz);
    if (!tz) return res.status(400).json({ error: `Unknown tz: ${rawTz}` });
  }
  const limitRaw = parseInt(String(req.query.limit || '100'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;

  const db = getDb();
  const userRow = db.prepare('SELECT weight_kg FROM users WHERE id = ?').get(req.user.id);
  const profileWeight = Number(userRow?.weight_kg);
  const weightKgUsed = Number.isFinite(profileWeight) && profileWeight > 0 ? profileWeight : DEFAULT_WEIGHT_KG;
  const kcalPerSongEstimate = (PIU_SESSION_MET * 3.5 * weightKgUsed / 200) * PIU_SONG_LENGTH_MINUTES;
  const weightSource = Number.isFinite(profileWeight) && profileWeight > 0 ? 'profile' : 'default';

  let rows;
  if (tz) {
    // tz-aware path: ±14h UTC padding, then post-filter by zoned date.
    // Pull `limit + 200` from SQL so the post-filter doesn't starve the
    // requested page when a lot of UTC-adjacent rows fall outside [from,to].
    const fromUtc = new Date(`${from}T00:00:00Z`).getTime() - 14 * 3600 * 1000;
    const toUtc = new Date(`${to}T23:59:59Z`).getTime() + 14 * 3600 * 1000;
    const raw = db.prepare(`
      SELECT id AS play_id, date_played, played_at_utc, song_title, mode, level, score,
             grade, plate,
             COALESCE(perfect,0) + COALESCE(great,0) + COALESCE(good,0) + COALESCE(bad,0) AS steps,
             COALESCE(kcal, 0) AS kcal_logged,
             COALESCE(perfect, 0) AS perfect, COALESCE(great, 0) AS great,
             COALESCE(good, 0) AS good, COALESCE(bad, 0) AS bad,
             COALESCE(miss, 0) AS miss, COALESCE(max_combo, 0) AS max_combo,
             COALESCE(replay_embed_url, '') AS replay_embed_url,
             COALESCE(replay_video_id, '') AS replay_video_id
        FROM user_recently_played
       WHERE user_id = ?
         AND played_at_utc != ''
         AND played_at_utc >= ?
         AND played_at_utc <= ?
       ORDER BY played_at_utc DESC, id DESC
       LIMIT ?
    `).all(
      req.user.id,
      new Date(fromUtc).toISOString().replace('T', ' ').slice(0, 19),
      new Date(toUtc).toISOString().replace('T', ' ').slice(0, 19),
      limit + 200,
    );
    rows = [];
    for (const r of raw) {
      const z = utcToZoned(r.played_at_utc, tz);
      if (!z || z.date < from || z.date > to) continue;
      rows.push(r);
      if (rows.length >= limit) break;
    }
  } else {
    rows = db.prepare(`
      SELECT id AS play_id, date_played, played_at_utc, song_title, mode, level, score,
             grade, plate,
             COALESCE(perfect,0) + COALESCE(great,0) + COALESCE(good,0) + COALESCE(bad,0) AS steps,
             COALESCE(kcal, 0) AS kcal_logged,
             COALESCE(perfect, 0) AS perfect, COALESCE(great, 0) AS great,
             COALESCE(good, 0) AS good, COALESCE(bad, 0) AS bad,
             COALESCE(miss, 0) AS miss, COALESCE(max_combo, 0) AS max_combo,
             COALESCE(replay_embed_url, '') AS replay_embed_url,
             COALESCE(replay_video_id, '') AS replay_video_id
        FROM user_recently_played
       WHERE user_id = ?
         AND substr(date_played, 1, 10) BETWEEN ? AND ?
       ORDER BY COALESCE(played_at_utc, date_played) DESC, id DESC
       LIMIT ?
    `).all(req.user.id, from, to, limit);
  }

  res.json({
    user_id: req.user.id,
    from,
    to,
    tz: tz || null,
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

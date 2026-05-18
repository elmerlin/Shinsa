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

// MET-based per-song kcal estimate. PIU is roughly 11.8 MET (vigorous
// dance). Songs vary from ~45 s (SHORT CUT) to ~4.5 min (FULL SONG);
// the songs table has duration_seconds for ~98% of charts (sourced
// from piucenter), so we use that when available and fall back to a
// 2-min baseline when the chart isn't catalogued.
const PIU_SESSION_MET = 11.8;
const DEFAULT_SONG_LENGTH_SECONDS = 120;
const DEFAULT_WEIGHT_KG = 70;

function resolveKcalContext(db, userId) {
  const userRow = db.prepare('SELECT weight_kg FROM users WHERE id = ?').get(userId);
  const profileWeight = Number(userRow?.weight_kg);
  const weightKgUsed = Number.isFinite(profileWeight) && profileWeight > 0
    ? profileWeight
    : DEFAULT_WEIGHT_KG;
  // Per-minute kcal rate at this weight — used everywhere a duration is
  // multiplied in. `kcalPerSongBaseline` is what a 120-second song
  // estimates to, surfaced in the response as a sanity-check number.
  const kcalPerMinute = PIU_SESSION_MET * 3.5 * weightKgUsed / 200;
  const kcalPerSongBaseline = kcalPerMinute * (DEFAULT_SONG_LENGTH_SECONDS / 60);
  const weightSource = Number.isFinite(profileWeight) && profileWeight > 0 ? 'profile' : 'default';
  return { weightKgUsed, kcalPerMinute, kcalPerSongBaseline, weightSource };
}

// Convert a song's duration (seconds) to a MET-based kcal estimate for
// one play of that song. Uses the 120-second fallback when duration
// isn't known — same behavior as before the duration JOIN landed.
function estimateKcalForDuration(kcalPerMinute, durationSeconds) {
  const minutes = (Number.isFinite(durationSeconds) && durationSeconds > 0)
    ? durationSeconds / 60
    : DEFAULT_SONG_LENGTH_SECONDS / 60;
  return kcalPerMinute * minutes;
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

  const { weightKgUsed, kcalPerMinute, kcalPerSongBaseline, weightSource } = resolveKcalContext(db, req.user.id);
  const roundKcal = (v) => Math.round(v * 100) / 100;

  if (tz) {
    // tz-aware path: pull a UTC-padded slice (±14h to cover any zone),
    // then bucket each play's played_at_utc into the requested tz.
    // LEFT JOIN to songs catalog so we know each chart's duration_seconds;
    // the JOIN normalizes mode (Co-op / coop / CoOp) the same way the
    // explore feed does so durations resolve even for non-canonical modes.
    const fromUtc = new Date(`${from}T00:00:00Z`).getTime() - 14 * 3600 * 1000;
    const toUtc = new Date(`${to}T23:59:59Z`).getTime() + 14 * 3600 * 1000;
    const rows = db.prepare(`
      SELECT rp.played_at_utc,
             COALESCE(rp.perfect,0) + COALESCE(rp.great,0) + COALESCE(rp.good,0) + COALESCE(rp.bad,0) AS steps,
             rp.mode AS rp_mode,
             s.duration_seconds AS duration_seconds
        FROM user_recently_played rp
        LEFT JOIN songs s
          ON TRIM(s.title) = TRIM(rp.song_title)
          AND s.mode = (CASE
            WHEN LOWER(REPLACE(REPLACE(rp.mode,'-',''),' ','')) IN ('coop','cooperative') THEN 'CoOp'
            WHEN LOWER(rp.mode) IN ('single','singles','s') THEN 'Single'
            WHEN LOWER(rp.mode) IN ('double','doubles','d') THEN 'Double'
            ELSE rp.mode
          END)
          AND s.level = rp.level
       WHERE rp.user_id = ?
         AND rp.played_at_utc != ''
         AND rp.played_at_utc >= ?
         AND rp.played_at_utc <= ?
    `).all(
      req.user.id,
      new Date(fromUtc).toISOString().replace('T', ' ').slice(0, 19),
      new Date(toUtc).toISOString().replace('T', ' ').slice(0, 19),
    );
    // dayMap: localDate -> { steps, plays, kcal, hours: Map<hour, {steps, plays, kcal}> }
    const dayMap = new Map();
    for (const r of rows) {
      const z = utcToZoned(r.played_at_utc, tz);
      if (!z) continue;
      if (z.date < from || z.date > to) continue;
      let day = dayMap.get(z.date);
      if (!day) {
        day = { steps: 0, plays: 0, kcal: 0, hours: new Map() };
        dayMap.set(z.date, day);
      }
      const steps = Number(r.steps) || 0;
      const kcal = estimateKcalForDuration(kcalPerMinute, Number(r.duration_seconds));
      day.steps += steps;
      day.plays += 1;
      day.kcal += kcal;
      let hb = day.hours.get(z.hour);
      if (!hb) {
        hb = { steps: 0, plays: 0, kcal: 0 };
        day.hours.set(z.hour, hb);
      }
      hb.steps += steps;
      hb.plays += 1;
      hb.kcal += kcal;
    }
    const days = Array.from(dayMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, d]) => ({
        date,
        steps: d.steps,
        plays: d.plays,
        kcal: roundKcal(d.kcal),
        hours: Array.from(d.hours.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([hour, hb]) => ({ hour, steps: hb.steps, plays: hb.plays, kcal: roundKcal(hb.kcal) })),
      }));
    return res.json({
      user_id: req.user.id,
      from,
      to,
      tz,
      hour_basis: tz,
      kcal_weight_kg: weightKgUsed,
      kcal_weight_source: weightSource,
      kcal_estimate_basis: 'song_duration',
      kcal_per_song_baseline_120s: roundKcal(kcalPerSongBaseline),
      days,
    });
  }

  // Legacy KST path (no tz): kept for backwards compat. Fixes the BETWEEN
  // bug — date_played is stored as a full "YYYY-MM-DD HH:MM:SS (GMT+9)"
  // string, so a date-only BETWEEN never matched anything. Compare on
  // the first 10 chars and group on the same prefix.
  //
  // kcal: always MET-derived — (kcal_per_minute × song_duration_minutes)
  // when the chart is in the catalog, else the 120-second baseline. The
  // OCR'd-from-PIUGame "logged" source was removed (unreliable). Folded
  // into a single SQL SUM via CASE.
  const dayRows = db.prepare(`
    SELECT substr(rp.date_played, 1, 10) AS date,
           COALESCE(SUM(COALESCE(rp.perfect,0) + COALESCE(rp.great,0) + COALESCE(rp.good,0) + COALESCE(rp.bad,0)), 0) AS steps,
           COUNT(*) AS plays,
           COALESCE(SUM(
             CASE
               WHEN s.duration_seconds IS NOT NULL AND s.duration_seconds > 0
                 THEN ? * (s.duration_seconds / 60.0)
               ELSE ?
             END
           ), 0) AS kcal
      FROM user_recently_played rp
      LEFT JOIN songs s
        ON TRIM(s.title) = TRIM(rp.song_title)
        AND s.mode = (CASE
          WHEN LOWER(REPLACE(REPLACE(rp.mode,'-',''),' ','')) IN ('coop','cooperative') THEN 'CoOp'
          WHEN LOWER(rp.mode) IN ('single','singles','s') THEN 'Single'
          WHEN LOWER(rp.mode) IN ('double','doubles','d') THEN 'Double'
          ELSE rp.mode
        END)
        AND s.level = rp.level
     WHERE rp.user_id = ?
       AND substr(rp.date_played, 1, 10) BETWEEN ? AND ?
     GROUP BY date
     ORDER BY date ASC
  `).all(kcalPerMinute, kcalPerSongBaseline, req.user.id, from, to);
  const hourRows = db.prepare(`
    SELECT substr(rp.date_played, 1, 10) AS date,
           CAST(strftime('%H', rp.played_at_utc) AS INTEGER) AS hour,
           COALESCE(SUM(COALESCE(rp.perfect,0) + COALESCE(rp.great,0) + COALESCE(rp.good,0) + COALESCE(rp.bad,0)), 0) AS steps,
           COUNT(*) AS plays,
           COALESCE(SUM(
             CASE
               WHEN s.duration_seconds IS NOT NULL AND s.duration_seconds > 0
                 THEN ? * (s.duration_seconds / 60.0)
               ELSE ?
             END
           ), 0) AS kcal
      FROM user_recently_played rp
      LEFT JOIN songs s
        ON TRIM(s.title) = TRIM(rp.song_title)
        AND s.mode = (CASE
          WHEN LOWER(REPLACE(REPLACE(rp.mode,'-',''),' ','')) IN ('coop','cooperative') THEN 'CoOp'
          WHEN LOWER(rp.mode) IN ('single','singles','s') THEN 'Single'
          WHEN LOWER(rp.mode) IN ('double','doubles','d') THEN 'Double'
          ELSE rp.mode
        END)
        AND s.level = rp.level
     WHERE rp.user_id = ?
       AND substr(rp.date_played, 1, 10) BETWEEN ? AND ?
       AND rp.played_at_utc != ''
     GROUP BY date, hour
     ORDER BY date ASC, hour ASC
  `).all(kcalPerMinute, kcalPerSongBaseline, req.user.id, from, to);
  const hoursByDate = new Map();
  for (const r of hourRows) {
    if (!hoursByDate.has(r.date)) hoursByDate.set(r.date, []);
    hoursByDate.get(r.date).push({
      hour: Number(r.hour) || 0,
      steps: Number(r.steps) || 0,
      plays: Number(r.plays) || 0,
      kcal: roundKcal(Number(r.kcal) || 0),
    });
  }
  res.json({
    user_id: req.user.id,
    from,
    to,
    hour_basis: 'utc',
    kcal_weight_kg: weightKgUsed,
    kcal_weight_source: weightSource,
    kcal_estimate_basis: 'song_duration',
    kcal_per_song_baseline_120s: roundKcal(kcalPerSongBaseline),
    days: dayRows.map((r) => ({
      date: r.date,
      steps: Number(r.steps) || 0,
      plays: Number(r.plays) || 0,
      kcal: roundKcal(Number(r.kcal) || 0),
      hours: hoursByDate.get(r.date) || [],
    })),
  });
});

// ---- Per-play (kcal per song) -----------------------------------------------
// Per-song MET kcal constants live at the top of this file so /steps can
// share them. PIU is ~11.8 MET (vigorous dance) for ~2 minutes per song.
// kcalPerSongEstimate is resolved per request via resolveKcalContext().

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
  const { weightKgUsed, kcalPerMinute, kcalPerSongBaseline, weightSource } = resolveKcalContext(db, req.user.id);

  // Shared SELECT projection for both tz/non-tz branches. The songs
  // JOIN brings in duration_seconds (powers the per-play kcal estimate),
  // the chart_id (links out to /song/:id), and the catalog jacket_url
  // (used as the cover image in workout-detail views).
  const playSelect = `
    SELECT rp.id AS play_id, rp.date_played, rp.played_at_utc,
           rp.song_title, rp.mode, rp.level, rp.score, rp.grade, rp.plate,
           COALESCE(rp.perfect,0) + COALESCE(rp.great,0) + COALESCE(rp.good,0) + COALESCE(rp.bad,0) AS steps,
           COALESCE(rp.perfect, 0) AS perfect, COALESCE(rp.great, 0) AS great,
           COALESCE(rp.good, 0) AS good, COALESCE(rp.bad, 0) AS bad,
           COALESCE(rp.miss, 0) AS miss, COALESCE(rp.max_combo, 0) AS max_combo,
           COALESCE(rp.replay_embed_url, '') AS replay_embed_url,
           COALESCE(rp.replay_video_id, '') AS replay_video_id,
           s.id AS chart_id,
           s.duration_seconds AS duration_seconds,
           s.jacket_url AS jacket_url
      FROM user_recently_played rp
      LEFT JOIN songs s
        ON TRIM(s.title) = TRIM(rp.song_title)
        AND s.mode = (CASE
          WHEN LOWER(REPLACE(REPLACE(rp.mode,'-',''),' ','')) IN ('coop','cooperative') THEN 'CoOp'
          WHEN LOWER(rp.mode) IN ('single','singles','s') THEN 'Single'
          WHEN LOWER(rp.mode) IN ('double','doubles','d') THEN 'Double'
          ELSE rp.mode
        END)
        AND s.level = rp.level
  `;

  let rows;
  if (tz) {
    // tz-aware path: ±14h UTC padding, then post-filter by zoned date.
    // Pull `limit + 200` from SQL so the post-filter doesn't starve the
    // requested page when a lot of UTC-adjacent rows fall outside [from,to].
    const fromUtc = new Date(`${from}T00:00:00Z`).getTime() - 14 * 3600 * 1000;
    const toUtc = new Date(`${to}T23:59:59Z`).getTime() + 14 * 3600 * 1000;
    const raw = db.prepare(`
      ${playSelect}
     WHERE rp.user_id = ?
       AND rp.played_at_utc != ''
       AND rp.played_at_utc >= ?
       AND rp.played_at_utc <= ?
     ORDER BY rp.played_at_utc DESC, rp.id DESC
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
      ${playSelect}
     WHERE rp.user_id = ?
       AND substr(rp.date_played, 1, 10) BETWEEN ? AND ?
     ORDER BY COALESCE(rp.played_at_utc, rp.date_played) DESC, rp.id DESC
     LIMIT ?
    `).all(req.user.id, from, to, limit);
  }

  // Build the per-play array first so we can roll a `total_*` summary
  // into the top-level response — saves callers from re-summing the
  // array client-side just to show a header total. Also resolve a few
  // deep-link URLs per play so a workout-detail view has everything it
  // needs to render (jacket image, link out to the chart, link out to
  // the play page, social card image for thumbnails) without a second
  // round-trip to anything else on pumpshinsa.
  const ORIGIN = 'https://pumpshinsa.com';
  const NEW_ORIGIN = 'https://new.pumpshinsa.com';
  const absolutize = (path) => {
    if (!path) return '';
    const s = String(path).trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return `${ORIGIN}${s.startsWith('/') ? s : `/${s}`}`;
  };

  const plays = rows.map((r) => {
    const duration = Number(r.duration_seconds);
    let kcal;
    let kcalSource;
    if (Number.isFinite(duration) && duration > 0) {
      kcal = kcalPerMinute * (duration / 60);
      kcalSource = 'estimated_duration';
    } else {
      kcal = kcalPerSongBaseline;
      kcalSource = 'estimated_baseline';
    }
    const chartId = Number(r.chart_id) || null;
    const playId = Number(r.play_id) || 0;
    return {
      play_id: playId,
      played_at_utc: r.played_at_utc || '',
      date_played: r.date_played || '',
      song_title: r.song_title || '',
      mode: r.mode || '',
      level: Number(r.level) || 0,
      score: Number(r.score) || 0,
      grade: r.grade || '',
      plate: r.plate || '',
      steps: Number(r.steps) || 0,
      duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      kcal: Math.round(kcal * 100) / 100,
      kcal_source: kcalSource,
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
      // Chart catalogue link-out — null when this play's chart isn't in
      // the songs table (UCS, brand-new chart not yet ingested, etc.).
      chart_id: chartId,
      chart_url: chartId ? `${NEW_ORIGIN}/song/${chartId}` : null,
      // Direct link to the play's detail page; lands on the
      // share-preview-decorated route so unfurls work too.
      play_url: playId ? `${NEW_ORIGIN}/play/${playId}` : null,
      // Cover-art for the chart, ready to drop into an <img>.
      jacket_url: absolutize(r.jacket_url) || null,
      // Pre-rendered 1200×630 score card image — useful as a workout
      // thumbnail or for sharing onto another social surface.
      og_image_url: playId ? `${ORIGIN}/og/play/${playId}.jpg` : null,
    };
  });

  const totalKcal = plays.reduce((acc, p) => acc + (Number(p.kcal) || 0), 0);
  const totalSteps = plays.reduce((acc, p) => acc + (Number(p.steps) || 0), 0);
  const totalDurationSeconds = plays.reduce(
    (acc, p) => acc + (Number(p.duration_seconds) || 0),
    0,
  );

  res.json({
    user_id: req.user.id,
    from,
    to,
    tz: tz || null,
    limit,
    count: plays.length,
    total_kcal: Math.round(totalKcal * 100) / 100,
    total_steps: totalSteps,
    total_duration_seconds: totalDurationSeconds,
    kcal_weight_kg: weightKgUsed,
    kcal_weight_source: weightSource,
    kcal_estimate_basis: 'song_duration',
    kcal_per_song_baseline_120s: Math.round(kcalPerSongBaseline * 100) / 100,
    plays,
  });
});

// ---- Visual / scoring schemes ----------------------------------------------
// Self-contained constants so external apps can render Pump Shinsa data
// with consistent grade colours, mode chips, plate badges, and score
// thresholds without scraping the codebase. Mirrors:
//   mobile/lib/grades.ts     → grades + tier colours
//   mobile/lib/plates.ts     → plate codes + colours
//   client/src/utils/grades.js (legacy desktop source of truth)
//
// `schemes_v` bumps when any structural shape here changes so consumers
// can cache the response and re-fetch when the version moves.

const SCHEMES_VERSION = 2;

const SCHEME_MODES = {
  Single:  { short: 'S',  color: '#d93d62', gradient: ['#ff7a7a', '#d93d62', '#7a1730'], label: 'Single' },
  Double:  { short: 'D',  color: '#16b77f', gradient: ['#4cf4aa', '#16b77f', '#0b5d48'], label: 'Double' },
  CoOp:    { short: 'C',  color: '#2b88de', gradient: ['#69c8ff', '#2b88de', '#12457c'], label: 'Co-op' },
  UCS:     { short: 'U',  color: '#7c3aed', gradient: ['#cdb4ff', '#7c3aed', '#3b0764'], label: 'User custom step' },
};

// Score thresholds + tier groupings. Identical math to
// mobile/lib/grades.ts:getScoreRank — descending so consumers can
// linear-scan and short-circuit on the first min_score match.
const SCHEME_GRADES = [
  { key: 'SSS+', min_score: 995000, tier: 'sss', color: '#7dd3fc', label: 'SSS+' },
  { key: 'SSS',  min_score: 990000, tier: 'sss', color: '#7dd3fc', label: 'SSS'  },
  { key: 'SS+',  min_score: 985000, tier: 'ss',  color: '#FFC400', label: 'SS+'  },
  { key: 'SS',   min_score: 980000, tier: 'ss',  color: '#FFC400', label: 'SS'   },
  { key: 'S+',   min_score: 975000, tier: 's',   color: '#fbbf24', label: 'S+'   },
  { key: 'S',    min_score: 970000, tier: 's',   color: '#fbbf24', label: 'S'    },
  { key: 'AAA+', min_score: 960000, tier: 'aaa', color: '#c0c0c0', label: 'AAA+' },
  { key: 'AAA',  min_score: 950000, tier: 'aaa', color: '#c0c0c0', label: 'AAA'  },
  { key: 'AA+',  min_score: 925000, tier: 'aa',  color: '#cd7f32', label: 'AA+'  },
  { key: 'AA',   min_score: 900000, tier: 'aa',  color: '#cd7f32', label: 'AA'   },
  { key: 'A+',   min_score: 825000, tier: 'a',   color: '#b45309', label: 'A+'   },
  { key: 'A',    min_score: 750000, tier: 'a',   color: '#b45309', label: 'A'    },
  { key: 'B',    min_score: 650000, tier: 'b',   color: '#737373', label: 'B'    },
  { key: 'C',    min_score: 550000, tier: 'c',   color: '#737373', label: 'C'    },
  { key: 'D',    min_score: 450000, tier: 'd',   color: '#525252', label: 'D'    },
  { key: 'F',    min_score: 0,      tier: 'f',   color: '#525252', label: 'F'    },
];

const SCHEME_PLATES = [
  { key: 'PG', label: 'PERFECT GAME',   color: '#7dd3fc', description: 'No bad / no miss (100% perfect run)' },
  { key: 'UG', label: 'ULTIMATE GAME',  color: '#c084fc', description: 'No good / no bad / no miss'           },
  { key: 'EG', label: 'EXTREME GAME',   color: '#f472b6', description: 'No bad / no miss'                     },
  { key: 'SG', label: 'SUPERB GAME',    color: '#FFE06B', description: '≤10 great / no miss'                  },
  { key: 'MG', label: 'MARVELOUS GAME', color: '#FFC400', description: '≤40 great / ≤2 miss'                  },
  { key: 'TG', label: 'TALENTED GAME',  color: '#cd7f32', description: '≤90 great / ≤5 miss'                  },
  { key: 'FG', label: 'FAIR GAME',      color: '#a8a8ae', description: 'Cleared with mistakes'                },
  { key: 'RG', label: 'ROUGH GAME',     color: '#737373', description: 'Cleared with many mistakes'           },
];

// kcal formula reference so consumers can independently re-compute or
// explain the number to their users. Matches resolveKcalContext(). All
// values are MET-derived; we no longer surface PIUGame's OCR'd kcal
// because the upstream OCR is unreliable enough that mixing the two
// sources produced obviously-wrong jumps in the per-day totals.
const SCHEME_KCAL_FORMULA = {
  met: 11.8,
  formula: '(MET × 3.5 × weight_kg / 200) × song_duration_minutes',
  fallback_duration_seconds: 120,
  sources: {
    estimated_duration:  'MET × profile_weight_kg × chart_duration_seconds from songs catalog (~98% of plays).',
    estimated_baseline:  'MET × profile_weight_kg × 120 s fallback (chart not in catalog).',
  },
};

// GET /api/external/schemes
// Static catalog of visual + scoring conventions used across Pump Shinsa.
// Lets a consuming app render plays consistently (grade colours / mode
// chips / plate badges / kcal explanation) without reading source code.
// Cacheable — bumps SCHEMES_VERSION on any structural change.
router.get('/schemes', requireApiToken, requireScope('steps:read'), (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    schemes_v: SCHEMES_VERSION,
    modes: SCHEME_MODES,
    grades: SCHEME_GRADES,
    plates: SCHEME_PLATES,
    kcal: SCHEME_KCAL_FORMULA,
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

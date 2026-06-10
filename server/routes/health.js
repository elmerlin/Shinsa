const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');

// Heart-rate / cardio ingest + read. HR is captured on iOS from HealthKit
// (Apple Watch) and correlated to plays client-side, then uploaded here so it
// renders on every platform. See mobile/lib/healthkit.ts + the sync hook.

const MAX_BPM = 260;
const MAX_SERIES = 120; // downsampled points per play; plenty for a sparkline

function clampBpm(value) {
  const n = Math.round(Number(value) || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_BPM, n);
}

function sanitizeSeries(raw) {
  if (!Array.isArray(raw)) return '';
  const pts = raw.map(clampBpm).filter((n) => n > 0).slice(0, MAX_SERIES);
  return pts.length ? JSON.stringify(pts) : '';
}

function sanitizeZones(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const s = Math.max(0, Math.round(Number(v) || 0));
    if (s > 0 && /^[a-z0-9_]{1,16}$/i.test(k)) out[k] = s;
  }
  return Object.keys(out).length ? JSON.stringify(out) : '';
}

const SOURCES = new Set(['workout', 'samples']);
const normSource = (s) => (SOURCES.has(String(s || '')) ? String(s) : '');

// Personalized HR zones are % of max HR. Effective max = manual setting
// (users.max_hr) when set, else the highest peak the system has ever seen
// synced for this user, else a safe default. Mirrored in mobile/lib/heartRate.ts.
const DEFAULT_MAX_HR = 190;
const MIN_MANUAL_MAX_HR = 120;
const MAX_MANUAL_MAX_HR = 230;

function getHrProfile(db, userId) {
  const manual = clampBpm(db.prepare('SELECT max_hr FROM users WHERE id = ?').get(userId)?.max_hr);
  const observed = clampBpm(
    db.prepare('SELECT MAX(hr_peak) AS peak FROM user_recently_played WHERE user_id = ? AND hr_peak > 0').get(userId)?.peak,
  );
  const effective = manual > 0 ? manual : (observed > 0 ? observed : DEFAULT_MAX_HR);
  return { max_hr_manual: manual, max_hr_observed: observed, max_hr_effective: effective };
}

// GET /api/health/hr-profile — max-HR sources for the current user (or
// ?user_id= to view another player's, e.g. to render their zones).
router.get('/hr-profile', requireAuth, (req, res) => {
  const db = getDb();
  const targetUserId = String(req.query.user_id || req.user.id).trim();
  res.json(getHrProfile(db, targetUserId));
});

// POST /api/health/max-hr — set (or clear with 0) the manual max HR.
router.post('/max-hr', requireAuth, (req, res) => {
  const db = getDb();
  const raw = Math.round(Number(req.body?.max_hr) || 0);
  if (raw !== 0 && (raw < MIN_MANUAL_MAX_HR || raw > MAX_MANUAL_MAX_HR)) {
    return res.status(400).json({ error: `max_hr must be 0 (auto) or ${MIN_MANUAL_MAX_HR}–${MAX_MANUAL_MAX_HR}` });
  }
  db.prepare('UPDATE users SET max_hr = ? WHERE id = ?').run(raw, req.user.id);
  res.json({ ok: true, ...getHrProfile(db, req.user.id) });
});

// POST /api/health/heart-rate — upload per-play HR + an optional cardio session.
// Body: { plays: [{ play_id, hr_avg, hr_peak, hr_min?, hr_series?, source? }],
//         session?: { workout_uuid, started_at_utc, ended_at_utc, duration_s,
//                     hr_avg, hr_peak, hr_min?, calories?, zone_seconds?,
//                     play_count?, source? } }
router.post('/heart-rate', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const plays = Array.isArray(req.body?.plays) ? req.body.plays : [];
  const session = req.body?.session && typeof req.body.session === 'object' ? req.body.session : null;

  // Ownership-checked update: only the caller's own plays can be annotated.
  const updateStmt = db.prepare(`
    UPDATE user_recently_played
    SET hr_avg = ?, hr_peak = ?, hr_min = ?, hr_series = ?, hr_source = ?, hr_duration_s = ?
    WHERE id = ? AND user_id = ?
  `);

  let updated = 0;
  const applyPlays = db.transaction(() => {
    for (const p of plays) {
      const playId = parseInt(p?.play_id, 10);
      const avg = clampBpm(p?.hr_avg);
      const peak = clampBpm(p?.hr_peak);
      if (!Number.isFinite(playId) || playId <= 0 || (avg <= 0 && peak <= 0)) continue;
      const info = updateStmt.run(
        avg,
        peak,
        clampBpm(p?.hr_min),
        sanitizeSeries(p?.hr_series),
        normSource(p?.source),
        Math.max(0, Math.min(3600, Math.round(Number(p?.hr_duration_s) || 0))),
        playId,
        userId,
      );
      updated += info.changes;
    }
  });
  applyPlays();

  let sessionSaved = false;
  const workoutUuid = String(session?.workout_uuid || '').trim().slice(0, 80);
  if (session && workoutUuid) {
    db.prepare(`
      INSERT INTO user_cardio_sessions
        (user_id, workout_uuid, started_at_utc, ended_at_utc, duration_s,
         hr_avg, hr_peak, hr_min, calories, zone_seconds, play_count, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, workout_uuid) DO UPDATE SET
        started_at_utc = excluded.started_at_utc,
        ended_at_utc   = excluded.ended_at_utc,
        duration_s     = excluded.duration_s,
        hr_avg         = excluded.hr_avg,
        hr_peak        = excluded.hr_peak,
        hr_min         = excluded.hr_min,
        calories       = excluded.calories,
        zone_seconds   = excluded.zone_seconds,
        play_count     = excluded.play_count,
        source         = excluded.source
    `).run(
      userId,
      workoutUuid,
      String(session.started_at_utc || '').slice(0, 40),
      String(session.ended_at_utc || '').slice(0, 40),
      Math.max(0, Math.round(Number(session.duration_s) || 0)),
      clampBpm(session.hr_avg),
      clampBpm(session.hr_peak),
      clampBpm(session.hr_min),
      Math.max(0, Number(session.calories) || 0),
      sanitizeZones(session.zone_seconds),
      Math.max(0, parseInt(session.play_count, 10) || 0),
      normSource(session.source),
    );
    sessionSaved = true;
  }

  res.json({ ok: true, plays_updated: updated, session_saved: sessionSaved });
});

// GET /api/health/cardio-sessions — recent cardio sessions for the current user
// (or ?user_id= for viewing another player's), newest first. Powers the
// cardio/zones view.
router.get('/cardio-sessions', requireAuth, (req, res) => {
  const db = getDb();
  const targetUserId = String(req.query.user_id || req.user.id).trim();
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
  const rows = db.prepare(`
    SELECT workout_uuid, started_at_utc, ended_at_utc, duration_s,
           hr_avg, hr_peak, hr_min, calories, zone_seconds, play_count, source
    FROM user_cardio_sessions
    WHERE user_id = ?
    ORDER BY started_at_utc DESC, id DESC
    LIMIT ?
  `).all(targetUserId, limit);

  const sessions = rows.map((r) => {
    let zones = {};
    try { zones = r.zone_seconds ? JSON.parse(r.zone_seconds) : {}; } catch { zones = {}; }
    return { ...r, zone_seconds: zones };
  });
  res.json({ sessions });
});

module.exports = router;

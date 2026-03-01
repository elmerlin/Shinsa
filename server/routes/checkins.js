const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth, hasFeatureAccess } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');

function normalizeCheckinUser(row, size = 48) {
  if (!row) return null;
  return {
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, row.id || row.user_id || '', size, row.avatar_v),
  };
}

function requireCheckinFeature(req, res, next) {
  const db = getDb();
  if (!hasFeatureAccess(db, req.user, 'checkin')) {
    return res.status(403).json({ error: 'Check In access not granted' });
  }
  return next();
}

// GET /api/checkins/venues — list all venues with their machines
router.get('/venues', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const venues = db.prepare('SELECT * FROM venues ORDER BY name').all();
  const machines = db.prepare('SELECT * FROM venue_machines ORDER BY sort_order, name').all();
  const machinesByVenue = {};
  for (const m of machines) {
    if (!machinesByVenue[m.venue_id]) machinesByVenue[m.venue_id] = [];
    machinesByVenue[m.venue_id].push(m);
  }
  res.json(venues.map(v => ({ ...v, machines: machinesByVenue[v.id] || [] })));
});

// GET /api/checkins/venue/:slug — single venue with machines and active checkins
router.get('/venue/:slug', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT * FROM venues WHERE slug = ?').get(req.params.slug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const machines = db.prepare('SELECT * FROM venue_machines WHERE venue_id = ? ORDER BY sort_order, name').all(venue.id);

  const activeCheckins = db.prepare(`
    SELECT c.id, c.user_id, c.machine_id, c.checked_in_at,
           u.username, u.avatar, u.avatar_v, u.gender, u.skill_title, u.pumbility
    FROM checkins c
    JOIN users u ON u.id = c.user_id
    WHERE c.venue_id = ? AND c.checked_out_at IS NULL
    ORDER BY c.checked_in_at ASC
  `).all(venue.id);

  const normalizedCheckins = activeCheckins.map(c => ({
    ...c,
    avatar: normalizeUserAvatarForList(c.avatar, c.user_id, 64, c.avatar_v),
  }));

  res.json({ venue, machines, activeCheckins: normalizedCheckins });
});

// POST /api/checkins/checkin — check in to a machine
router.post('/checkin', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const { venue_id, machine_id } = req.body;
  const userId = req.user.id;

  if (!venue_id || !machine_id) {
    return res.status(400).json({ error: 'venue_id and machine_id are required' });
  }

  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venue_id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const machine = db.prepare('SELECT * FROM venue_machines WHERE id = ? AND venue_id = ?').get(machine_id, venue_id);
  if (!machine) return res.status(404).json({ error: 'Machine not found at this venue' });

  // Check if already checked in somewhere
  const existing = db.prepare('SELECT id FROM checkins WHERE user_id = ? AND checked_out_at IS NULL').get(userId);
  if (existing) {
    // Auto-checkout from previous
    db.prepare("UPDATE checkins SET checked_out_at = datetime('now') WHERE id = ?").run(existing.id);
  }

  const id = uuidv4();
  db.prepare('INSERT INTO checkins (id, user_id, venue_id, machine_id) VALUES (?, ?, ?, ?)').run(id, userId, venue_id, machine_id);

  // Set playing status
  const status = `Playing at ${machine.name}`;
  db.prepare("UPDATE users SET playing_status = ? WHERE id = ?").run(status, userId);

  res.json({ id, status, machine_name: machine.name });
});

// POST /api/checkins/checkout — check out (clear status)
router.post('/checkout', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const active = db.prepare('SELECT id FROM checkins WHERE user_id = ? AND checked_out_at IS NULL').get(userId);
  if (!active) return res.status(400).json({ error: 'Not currently checked in' });

  db.prepare("UPDATE checkins SET checked_out_at = datetime('now') WHERE id = ?").run(active.id);
  db.prepare("UPDATE users SET playing_status = '' WHERE id = ?").run(userId);

  res.json({ success: true });
});

// GET /api/checkins/my-status — get current user's checkin status
router.get('/my-status', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const active = db.prepare(`
    SELECT c.id, c.venue_id, c.machine_id, c.checked_in_at,
           v.name AS venue_name, v.slug AS venue_slug,
           m.name AS machine_name, m.position AS machine_position
    FROM checkins c
    JOIN venues v ON v.id = c.venue_id
    JOIN venue_machines m ON m.id = c.machine_id
    WHERE c.user_id = ? AND c.checked_out_at IS NULL
  `).get(req.user.id);

  const user = db.prepare('SELECT playing_status FROM users WHERE id = ?').get(req.user.id);

  res.json({
    checked_in: !!active,
    checkin: active || null,
    playing_status: user?.playing_status || '',
  });
});

// GET /api/checkins/active/:venueSlug — get active checkins for a venue (live status)
router.get('/active/:venueSlug', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT * FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const machines = db.prepare('SELECT * FROM venue_machines WHERE venue_id = ? ORDER BY sort_order').all(venue.id);

  const activeCheckins = db.prepare(`
    SELECT c.id, c.user_id, c.machine_id, c.checked_in_at,
           u.username, u.avatar, u.avatar_v, u.gender, u.skill_title, u.pumbility
    FROM checkins c
    JOIN users u ON u.id = c.user_id
    WHERE c.venue_id = ? AND c.checked_out_at IS NULL
    ORDER BY c.checked_in_at ASC
  `).all(venue.id);

  const normalizedCheckins = activeCheckins.map(c => ({
    ...c,
    avatar: normalizeUserAvatarForList(c.avatar, c.user_id, 64, c.avatar_v),
  }));

  res.json({ venue, machines, activeCheckins: normalizedCheckins });
});

// GET /api/checkins/history — current user's checkin history with stats
router.get('/history', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const checkins = db.prepare(`
    SELECT c.id, c.checked_in_at, c.checked_out_at,
           v.name AS venue_name, v.slug AS venue_slug,
           m.name AS machine_name
    FROM checkins c
    JOIN venues v ON v.id = c.venue_id
    JOIN venue_machines m ON m.id = c.machine_id
    WHERE c.user_id = ?
    ORDER BY c.checked_in_at DESC
    LIMIT 200
  `).all(userId);

  // Compute stats
  const allCheckins = db.prepare(`
    SELECT checked_in_at, checked_out_at
    FROM checkins
    WHERE user_id = ? AND checked_out_at IS NOT NULL
    ORDER BY checked_in_at DESC
  `).all(userId);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalSessions = allCheckins.length;
  let totalMinutes = 0;
  let weekMinutes = 0;
  let weekSessions = 0;
  let monthMinutes = 0;
  let monthSessions = 0;

  for (const c of allCheckins) {
    const start = new Date(c.checked_in_at + 'Z');
    const end = new Date(c.checked_out_at + 'Z');
    const minutes = Math.max(0, (end - start) / 60000);
    totalMinutes += minutes;

    if (start >= weekStart) {
      weekMinutes += minutes;
      weekSessions++;
    }
    if (start >= monthStart) {
      monthMinutes += minutes;
      monthSessions++;
    }
  }

  const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

  res.json({
    checkins,
    stats: {
      total_sessions: totalSessions,
      total_hours: Math.round(totalMinutes / 60 * 10) / 10,
      avg_session_minutes: avgSessionMinutes,
      week_sessions: weekSessions,
      week_hours: Math.round(weekMinutes / 60 * 10) / 10,
      month_sessions: monthSessions,
      month_hours: Math.round(monthMinutes / 60 * 10) / 10,
    },
  });
});

// GET /api/checkins/user/:userId/history — view another user's checkin history
router.get('/user/:userId/history', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const userId = req.params.userId;

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const allCheckins = db.prepare(`
    SELECT checked_in_at, checked_out_at
    FROM checkins
    WHERE user_id = ? AND checked_out_at IS NOT NULL
    ORDER BY checked_in_at DESC
  `).all(userId);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalSessions = allCheckins.length;
  let totalMinutes = 0;
  let weekMinutes = 0;
  let weekSessions = 0;
  let monthMinutes = 0;
  let monthSessions = 0;

  for (const c of allCheckins) {
    const start = new Date(c.checked_in_at + 'Z');
    const end = new Date(c.checked_out_at + 'Z');
    const minutes = Math.max(0, (end - start) / 60000);
    totalMinutes += minutes;

    if (start >= weekStart) {
      weekMinutes += minutes;
      weekSessions++;
    }
    if (start >= monthStart) {
      monthMinutes += minutes;
      monthSessions++;
    }
  }

  const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

  const checkins = db.prepare(`
    SELECT c.id, c.checked_in_at, c.checked_out_at,
           v.name AS venue_name, m.name AS machine_name
    FROM checkins c
    JOIN venues v ON v.id = c.venue_id
    JOIN venue_machines m ON m.id = c.machine_id
    WHERE c.user_id = ?
    ORDER BY c.checked_in_at DESC
    LIMIT 50
  `).all(userId);

  res.json({
    checkins,
    stats: {
      total_sessions: totalSessions,
      total_hours: Math.round(totalMinutes / 60 * 10) / 10,
      avg_session_minutes: avgSessionMinutes,
      week_sessions: weekSessions,
      week_hours: Math.round(weekMinutes / 60 * 10) / 10,
      month_sessions: monthSessions,
      month_hours: Math.round(monthMinutes / 60 * 10) / 10,
    },
  });
});

// PUT /api/checkins/playing-status — manually set playing status
router.put('/playing-status', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const status = String(req.body.status || '').trim().slice(0, 100);
  db.prepare("UPDATE users SET playing_status = ? WHERE id = ?").run(status, req.user.id);
  res.json({ playing_status: status });
});

// DELETE /api/checkins/playing-status — clear playing status
router.delete('/playing-status', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE users SET playing_status = '' WHERE id = ?").run(req.user.id);
  res.json({ playing_status: '' });
});

module.exports = router;

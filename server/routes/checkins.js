const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth, hasFeatureAccess } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');
const { createUserNotification } = require('../lib/notifications');

function normalizeCheckinUser(row, size = 48) {
  if (!row) return null;
  const ownerUserId = row.user_id || row.id || '';
  return {
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, ownerUserId, size, row.avatar_v),
  };
}

function parseUtcDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const withZone = raw.endsWith('Z') ? raw : `${raw}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDayKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sessionMinutes(startDate, endDate, now = new Date()) {
  if (!startDate) return 0;
  const end = endDate || now;
  return Math.max(0, (end.getTime() - startDate.getTime()) / 60000);
}

function requireCheckinFeature(req, res, next) {
  const db = getDb();
  const canUseCheckin = hasFeatureAccess(db, req.user, 'checkin')
    || hasFeatureAccess(db, req.user, 'dojo_admin');
  if (!canUseCheckin) {
    return res.status(403).json({ error: 'Check In access not granted' });
  }
  return next();
}

function requireDojoAdminFeature(req, res, next) {
  const db = getDb();
  if (!hasFeatureAccess(db, req.user, 'dojo_admin')) {
    return res.status(403).json({ error: 'Dojo admin access not granted' });
  }
  return next();
}

function notifyUsersAboutCheckinEvent(db, {
  actorUserId,
  actorUsername,
  eventType,
  venueId,
  venueName,
  machineName,
}) {
  if (!db || !actorUserId || !eventType) return 0;

  const normalizedType = String(eventType).toLowerCase() === 'checkout' ? 'checkout' : 'checkin';
  const safeUsername = String(actorUsername || '').trim() || 'Someone';
  const safeVenueName = String(venueName || '').trim() || 'Unknown venue';
  const safeMachineName = String(machineName || '').trim() || 'Unknown machine';

  const notificationType = normalizedType === 'checkout' ? 'dojo_checkout' : 'dojo_checkin';
  const title = normalizedType === 'checkout' ? 'Dojo Check Out' : 'Dojo Check In';
  const message = normalizedType === 'checkout'
    ? `${safeUsername} checked out from ${safeMachineName} at ${safeVenueName}`
    : `${safeUsername} checked in at ${safeMachineName} (${safeVenueName})`;
  const link = '/checkin';

  const dojoAdmins = db.prepare(`
    SELECT DISTINCT user_id
    FROM (
      SELECT id AS user_id
      FROM users
      WHERE is_admin = 1
      UNION
      SELECT user_id
      FROM user_feature_permissions
      WHERE feature_key = 'dojo_admin'
      UNION
      SELECT gm.user_id
      FROM admin_user_group_feature_permissions gfp
      JOIN admin_user_group_members gm ON gm.group_id = gfp.group_id
      WHERE gfp.feature_key = 'dojo_admin'
    )
  `).all();

  const subscriberRows = venueId
    ? db.prepare(`
      SELECT subscriber_user_id AS user_id, notify_checkins, notify_checkouts
      FROM venue_checkin_notification_subscriptions
      WHERE venue_id = ?
    `).all(venueId)
    : [];

  const recipientIds = new Set();
  for (const admin of dojoAdmins) {
    const adminId = String(admin?.user_id || '').trim();
    if (adminId) recipientIds.add(adminId);
  }
  for (const row of subscriberRows) {
    const subscriberId = String(row?.user_id || '').trim();
    if (!subscriberId) continue;
    const allowCheckin = !!row?.notify_checkins;
    const allowCheckout = !!row?.notify_checkouts;
    if (normalizedType === 'checkout' ? allowCheckout : allowCheckin) {
      recipientIds.add(subscriberId);
    }
  }

  let notified = 0;
  const actorId = String(actorUserId || '').trim();
  for (const recipientId of recipientIds) {
    if (!recipientId || recipientId === actorId) continue;
    createUserNotification(db, recipientId, notificationType, title, message, link);
    notified += 1;
  }
  return notified;
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

// GET /api/checkins/notifications/:venueSlug — get current user's check-in/check-out notification preference for a venue
router.get('/notifications/:venueSlug', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const row = db.prepare(`
    SELECT notify_checkins, notify_checkouts
    FROM venue_checkin_notification_subscriptions
    WHERE subscriber_user_id = ? AND venue_id = ?
  `).get(req.user.id, venue.id);

  const notifyCheckins = !!row?.notify_checkins;
  const notifyCheckouts = !!row?.notify_checkouts;
  res.json({
    venue_id: venue.id,
    venue_slug: venue.slug,
    subscribed: notifyCheckins || notifyCheckouts,
    notify_checkins: notifyCheckins,
    notify_checkouts: notifyCheckouts,
  });
});

// PUT /api/checkins/notifications/:venueSlug — set current user's check-in/check-out notification preference for a venue
router.put('/notifications/:venueSlug', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const payload = req.body || {};
  const hasSubscribed = Object.prototype.hasOwnProperty.call(payload, 'subscribed');
  const hasNotifyCheckins = Object.prototype.hasOwnProperty.call(payload, 'notify_checkins');
  const hasNotifyCheckouts = Object.prototype.hasOwnProperty.call(payload, 'notify_checkouts');
  if (!hasSubscribed && !hasNotifyCheckins && !hasNotifyCheckouts) {
    return res.status(400).json({ error: 'At least one notification field must be provided' });
  }

  const existing = db.prepare(`
    SELECT notify_checkins, notify_checkouts
    FROM venue_checkin_notification_subscriptions
    WHERE subscriber_user_id = ? AND venue_id = ?
  `).get(req.user.id, venue.id);

  if (hasSubscribed && !payload.subscribed) {
    db.prepare(`
      DELETE FROM venue_checkin_notification_subscriptions
      WHERE subscriber_user_id = ? AND venue_id = ?
    `).run(req.user.id, venue.id);
    return res.json({
      venue_id: venue.id,
      venue_slug: venue.slug,
      subscribed: false,
      notify_checkins: false,
      notify_checkouts: false,
    });
  }

  let notifyCheckins = hasNotifyCheckins ? !!payload.notify_checkins : !!existing?.notify_checkins;
  let notifyCheckouts = hasNotifyCheckouts ? !!payload.notify_checkouts : !!existing?.notify_checkouts;

  if (hasSubscribed && !!payload.subscribed && !hasNotifyCheckins && !hasNotifyCheckouts && !existing) {
    notifyCheckins = true;
    notifyCheckouts = true;
  }

  if (!notifyCheckins && !notifyCheckouts) {
    db.prepare(`
      DELETE FROM venue_checkin_notification_subscriptions
      WHERE subscriber_user_id = ? AND venue_id = ?
    `).run(req.user.id, venue.id);
    return res.json({
      venue_id: venue.id,
      venue_slug: venue.slug,
      subscribed: false,
      notify_checkins: false,
      notify_checkouts: false,
    });
  }

  db.prepare(`
    INSERT INTO venue_checkin_notification_subscriptions
      (subscriber_user_id, venue_id, notify_checkins, notify_checkouts, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(subscriber_user_id, venue_id) DO UPDATE SET
      notify_checkins = excluded.notify_checkins,
      notify_checkouts = excluded.notify_checkouts,
      updated_at = datetime('now')
  `).run(req.user.id, venue.id, notifyCheckins ? 1 : 0, notifyCheckouts ? 1 : 0);

  return res.json({
    venue_id: venue.id,
    venue_slug: venue.slug,
    subscribed: notifyCheckins || notifyCheckouts,
    notify_checkins: notifyCheckins,
    notify_checkouts: notifyCheckouts,
  });
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

  const actor = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  notifyUsersAboutCheckinEvent(db, {
    actorUserId: userId,
    actorUsername: actor?.username || req.user?.username || 'Someone',
    eventType: 'checkin',
    venueId: venue.id,
    venueName: venue.name,
    machineName: machine.name,
  });

  res.json({ id, status, machine_name: machine.name });
});

// POST /api/checkins/checkout — check out (clear status)
router.post('/checkout', requireAuth, requireCheckinFeature, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const active = db.prepare(`
    SELECT c.id,
           c.venue_id,
           v.name AS venue_name,
           m.name AS machine_name
    FROM checkins c
    JOIN venues v ON v.id = c.venue_id
    JOIN venue_machines m ON m.id = c.machine_id
    WHERE c.user_id = ? AND c.checked_out_at IS NULL
  `).get(userId);
  if (!active) return res.status(400).json({ error: 'Not currently checked in' });

  db.prepare("UPDATE checkins SET checked_out_at = datetime('now') WHERE id = ?").run(active.id);
  db.prepare("UPDATE users SET playing_status = '' WHERE id = ?").run(userId);

  const actor = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  notifyUsersAboutCheckinEvent(db, {
    actorUserId: userId,
    actorUsername: actor?.username || req.user?.username || 'Someone',
    eventType: 'checkout',
    venueId: active.venue_id,
    venueName: active.venue_name,
    machineName: active.machine_name,
  });

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

// GET /api/checkins/dojo/:slug/overview — dojo machine status + weekly activity summary
router.get('/dojo/:slug/overview', requireAuth, requireDojoAdminFeature, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT * FROM venues WHERE slug = ?').get(req.params.slug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const machines = db.prepare(
    'SELECT * FROM venue_machines WHERE venue_id = ? ORDER BY sort_order, name'
  ).all(venue.id);

  const activeCheckins = db.prepare(`
    SELECT c.id, c.user_id, c.machine_id, c.checked_in_at,
           m.name AS machine_name, m.position AS machine_position,
           u.username, u.avatar, u.avatar_v, u.gender, u.skill_title, u.pumbility
    FROM checkins c
    JOIN venue_machines m ON m.id = c.machine_id
    JOIN users u ON u.id = c.user_id
    WHERE c.venue_id = ? AND c.checked_out_at IS NULL
    ORDER BY c.checked_in_at ASC
  `).all(venue.id);

  const normalizedActiveCheckins = activeCheckins.map((row) => normalizeCheckinUser(row, 64));
  const activeByMachine = {};
  for (const row of normalizedActiveCheckins) {
    if (!activeByMachine[row.machine_id]) activeByMachine[row.machine_id] = [];
    activeByMachine[row.machine_id].push(row);
  }

  const machineStatus = machines.map((machine) => {
    const users = activeByMachine[machine.id] || [];
    return {
      ...machine,
      active_count: users.length,
      active_users: users,
    };
  });

  const now = new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDays(weekStart, 7);
  const weekStartStr = weekStart.toISOString().replace('T', ' ').slice(0, 19);

  // Query 1: Only this week's checkins for weekly stats (much smaller than LIMIT 1200)
  const weekRows = db.prepare(`
    SELECT c.id, c.user_id, c.machine_id, c.checked_in_at, c.checked_out_at,
           m.name AS machine_name,
           u.username, u.avatar, u.avatar_v
    FROM checkins c
    JOIN venue_machines m ON m.id = c.machine_id
    JOIN users u ON u.id = c.user_id
    WHERE c.venue_id = ? AND c.checked_in_at >= ?
    ORDER BY c.checked_in_at DESC
  `).all(venue.id, weekStartStr);

  // Query 2: Recent checkins for activity log only (need 100 rows to produce ~200 events)
  const logRows = db.prepare(`
    SELECT c.id, c.user_id, c.machine_id, c.checked_in_at, c.checked_out_at,
           m.name AS machine_name,
           u.username, u.avatar, u.avatar_v
    FROM checkins c
    JOIN venue_machines m ON m.id = c.machine_id
    JOIN users u ON u.id = c.user_id
    WHERE c.venue_id = ?
    ORDER BY c.checked_in_at DESC
    LIMIT 120
  `).all(venue.id);

  const dayBuckets = [];
  const dayLookup = {};
  for (let i = 0; i < 7; i += 1) {
    const dayDate = addDays(weekStart, i);
    const dayKey = toDayKey(dayDate);
    const bucket = {
      day_key: dayKey,
      day_label: dayDate.toLocaleDateString(undefined, { weekday: 'short' }),
      visitors: 0,
      sessions: 0,
      total_minutes: 0,
      entries: [],
      _visitor_ids: new Set(),
    };
    dayBuckets.push(bucket);
    dayLookup[dayKey] = bucket;
  }

  const weeklyUsers = new Map();

  // Process week rows for stats
  for (const row of weekRows) {
    const start = parseUtcDate(row.checked_in_at);
    const end = parseUtcDate(row.checked_out_at);
    if (!start || start < weekStart || start >= weekEnd) continue;

    const normalizedUser = normalizeCheckinUser(row, 48);
    const duration = Math.round(sessionMinutes(start, end, now));
    const isActive = !row.checked_out_at;
    const dayKey = toDayKey(start);
    const dayBucket = dayLookup[dayKey];
    if (!dayBucket) continue;

    dayBucket.sessions += 1;
    dayBucket.total_minutes += duration;
    dayBucket._visitor_ids.add(row.user_id);
    dayBucket.entries.push({
      checkin_id: row.id,
      user_id: row.user_id,
      username: normalizedUser.username,
      avatar: normalizedUser.avatar,
      machine_name: row.machine_name,
      checked_in_at: row.checked_in_at,
      checked_out_at: row.checked_out_at || null,
      session_minutes: duration,
      active: isActive,
    });

    let userWeek = weeklyUsers.get(row.user_id);
    if (!userWeek) {
      userWeek = {
        user_id: row.user_id,
        username: normalizedUser.username,
        avatar: normalizedUser.avatar,
        week_sessions: 0,
        week_minutes: 0,
        active: false,
      };
      weeklyUsers.set(row.user_id, userWeek);
    }
    userWeek.week_sessions += 1;
    userWeek.week_minutes += duration;
    if (isActive) userWeek.active = true;
  }

  // Build activity log from the smaller recent-only query
  const activityLog = [];
  for (const row of logRows) {
    const start = parseUtcDate(row.checked_in_at);
    const end = parseUtcDate(row.checked_out_at);
    if (!start) continue;

    const normalizedUser = normalizeCheckinUser(row, 48);
    const duration = Math.round(sessionMinutes(start, end, now));
    const isActive = !row.checked_out_at;

    activityLog.push({
      event_type: 'checkin',
      occurred_at: row.checked_in_at,
      user_id: row.user_id,
      username: normalizedUser.username,
      avatar: normalizedUser.avatar,
      machine_name: row.machine_name,
      machine_id: row.machine_id,
      checked_in_at: row.checked_in_at,
      checked_out_at: row.checked_out_at || null,
      session_minutes: duration,
      active: isActive,
    });

    if (row.checked_out_at) {
      activityLog.push({
        event_type: 'checkout',
        occurred_at: row.checked_out_at,
        user_id: row.user_id,
        username: normalizedUser.username,
        avatar: normalizedUser.avatar,
        machine_name: row.machine_name,
        machine_id: row.machine_id,
        checked_in_at: row.checked_in_at,
        checked_out_at: row.checked_out_at,
        session_minutes: duration,
        active: false,
      });
    }
  }

  for (const day of dayBuckets) {
    day.visitors = day._visitor_ids.size;
    day.total_minutes = Math.round(day.total_minutes);
    day.entries.sort((a, b) => (b.checked_in_at > a.checked_in_at ? 1 : -1));
    delete day._visitor_ids;
  }

  activityLog.sort((a, b) => (b.occurred_at > a.occurred_at ? 1 : -1));
  const weekUsers = Array.from(weeklyUsers.values())
    .map((u) => ({
      ...u,
      week_hours: Math.round((u.week_minutes / 60) * 10) / 10,
    }))
    .sort((a, b) => {
      if (b.week_minutes !== a.week_minutes) return b.week_minutes - a.week_minutes;
      return b.week_sessions - a.week_sessions;
    });

  const weekVisitorIds = new Set();
  for (const day of dayBuckets) {
    for (const entry of day.entries) weekVisitorIds.add(entry.user_id);
  }

  res.json({
    venue,
    machines: machineStatus,
    active_checkins: normalizedActiveCheckins,
    activity_log: activityLog.slice(0, 200),
    week: {
      start_day: toDayKey(weekStart),
      end_day: toDayKey(addDays(weekStart, 6)),
      total_sessions: dayBuckets.reduce((sum, day) => sum + day.sessions, 0),
      total_minutes: dayBuckets.reduce((sum, day) => sum + day.total_minutes, 0),
      total_visitors: weekVisitorIds.size,
      days: dayBuckets,
      users: weekUsers,
    },
  });
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

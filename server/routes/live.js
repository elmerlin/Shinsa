const express = require('express');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');
const { notifyActivitySubscribers, buildProfilePath } = require('../lib/activitySubscriptions');
const { addLiveSessionClient, emitLiveSessionEvent } = require('../lib/liveSessionHub');
const { buildLiveSessionSummary } = require('../lib/liveSessionSummary');
const { serializeLiveSessionMarker } = require('../lib/liveSessionMarker');
const { createUserNotification } = require('../lib/notifications');
const piugameRoutes = require('./piugame');
const socialRoutes = require('./social');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const LIVE_OVERLAY_TOKEN_EXPIRY = '30d';

const PRESENCE_TTL_SECONDS = 30;
const CHAT_LIMIT = 200;
const REQUEST_LIMIT = 100;
const PLAY_LIMIT = 250;
const VOTE_DURATION_SECONDS = 30;
const STREAM_HEARTBEAT_MS = 25000;
const LIVE_SYNC_INTERVAL_MS = 60000;
const FAIL_MESSAGES = [
  'Better luck next time!',
  'Shake it off and go again.',
  'That chart bites back. Run it again.',
  'Reset, breathe, and send the next one.',
];
const PASS_MESSAGES = [
  'Clear secured.',
  'Nice work. Keep the run going.',
  'Solid pass. Stay locked in.',
  'That one is on the board.',
];
const STRONG_MESSAGES = [
  'Great score. The session is heating up.',
  'Sharp run. Chat should be paying attention.',
  'That looked strong.',
  'Momentum is building.',
];
const ELITE_MESSAGES = [
  'That is a huge result.',
  'Elite run. Keep cooking.',
  'Monster score.',
  'That chart just got handled.',
];

const syncRecentlyPlayedForUser = piugameRoutes.syncRecentlyPlayedForUser;
const insertGroupedNewClearPost = piugameRoutes.insertGroupedNewClearPost;
const invalidateRecentActivityCache = socialRoutes.invalidateRecentActivityCache;
const voteCloseTimers = new Map();
const liveSyncTimers = new Map();
const liveSyncInFlight = new Set();

function getOptionalAuthUserId(req) {
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return '';
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return String(decoded?.id || '').trim();
  } catch {
    return '';
  }
}

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function normalizeText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeUrl(value, max = 500) {
  const trimmed = String(value || '').trim().slice(0, max);
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.)/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function buildPlayOutcomeKey(songTitle, mode, level, score) {
  return [
    normalizeText(songTitle, 160).toLowerCase(),
    normalizeText(mode, 40).toLowerCase(),
    toInt(level),
    toInt(score),
  ].join('|');
}

function buildRequestKey(songTitle, mode, level) {
  return [
    normalizeText(songTitle, 160).toLowerCase(),
    normalizeText(mode, 40).toLowerCase(),
    toInt(level),
  ].join('|');
}

function pickDeterministicMessage(options, seed = '') {
  const list = Array.isArray(options) && options.length > 0 ? options : ['Session updated.'];
  const key = String(seed || '');
  let hash = 0;
  for (let idx = 0; idx < key.length; idx += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(idx);
    hash |= 0;
  }
  return list[Math.abs(hash) % list.length];
}

function isFailLike(play) {
  const score = toInt(play?.score);
  const grade = String(play?.grade || '').trim().toUpperCase().replace(/\s+/g, '');
  if (score <= 0) return true;
  if (!grade) return false;
  if (grade === 'F' || grade === 'STAGEBREAK' || grade === 'STAGE_BREAK') return true;
  return /^X(?:[_-]|$)/.test(grade);
}

function getGradeBucket(play) {
  const grade = String(play?.grade || '').trim().toUpperCase();
  if (isFailLike(play)) return 'fail';
  if (/SSS|SS\+|SS\b|S\+|S\b/.test(grade)) return 'elite';
  if (/AAA|AA/.test(grade)) return 'strong';
  return 'pass';
}

function formatPlayLabel(play) {
  const mode = String(play?.mode || '');
  const modeShort = mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : mode ? mode[0].toUpperCase() : 'X';
  return `${normalizeText(play?.song_title || 'Unknown chart', 160)} (${modeShort}${toInt(play?.level) || '?'})`;
}

function buildRequestFulfillmentMessage(play, requesters = []) {
  const names = Array.from(new Set(
    (Array.isArray(requesters) ? requesters : [])
      .map((name) => normalizeText(name, 60))
      .filter(Boolean)
  ));
  const label = formatPlayLabel(play);
  if (names.length === 0) return `Request hit: ${label}.`;
  if (names.length === 1) return `Request hit: ${label} for ${names[0]}.`;
  const lead = names.slice(0, 2).join(', ');
  return `Request hit: ${label} for ${lead}${names.length > 2 ? ` +${names.length - 2} more` : ''}.`;
}

function addSystemMessage(db, liveSessionId, message, messageType = 'system', metadata = {}) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO live_session_messages (id, live_session_id, user_id, username, avatar, message, message_type, metadata_json)
    VALUES (?, ?, '', 'System', '', ?, ?, ?)
  `).run(id, liveSessionId, normalizeText(message, 800), normalizeText(messageType, 40) || 'system', JSON.stringify(metadata || {}));
  return id;
}

function cleanupPresence(db, liveSessionId) {
  db.prepare(`
    DELETE FROM live_session_presence
    WHERE live_session_id = ?
      AND last_seen < datetime('now', ?)
  `).run(liveSessionId, `-${PRESENCE_TTL_SECONDS} seconds`);
}

function getViewerCount(db, session) {
  cleanupPresence(db, session.id);
  const row = db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS count
    FROM live_session_presence
    WHERE live_session_id = ?
      AND user_id != ?
  `).get(session.id, session.host_user_id);
  return Math.max(0, toInt(row?.count));
}

function updateViewerPeak(db, sessionId, viewerCount) {
  const count = Math.max(0, toInt(viewerCount));
  db.prepare(`
    UPDATE live_sessions
    SET viewer_peak = CASE WHEN viewer_peak < ? THEN ? ELSE viewer_peak END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(count, count, sessionId);
  const row = db.prepare('SELECT viewer_peak FROM live_sessions WHERE id = ?').get(sessionId);
  return Math.max(0, toInt(row?.viewer_peak));
}

function getHostProfile(db, userId) {
  const row = db.prepare(`
    SELECT id, username, avatar, avatar_v, nationality, skill_title, pumbility, weight_kg
    FROM users
    WHERE id = ?
  `).get(userId);
  if (!row) return null;
  return {
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, row.id, 96, row.avatar_v),
  };
}

function getLiveSession(db, sessionId) {
  return db.prepare(`
    SELECT *
    FROM live_sessions
    WHERE id = ?
  `).get(sessionId);
}

function getActiveSessionForHost(db, hostUserId) {
  return db.prepare(`
    SELECT *
    FROM live_sessions
    WHERE host_user_id = ?
      AND status = 'live'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(hostUserId);
}

function getLiveSyncActor(db, session) {
  if (!session?.host_user_id) return null;
  const user = db.prepare(`
    SELECT id, username
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(session.host_user_id);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username || '',
  };
}

function markLiveSessionSyncError(db, liveSessionId) {
  db.prepare(`
    UPDATE live_sessions
    SET last_sync_status = 'error',
        updated_at = datetime('now')
    WHERE id = ?
  `).run(liveSessionId);
}

async function performLiveSessionSync(db, sessionOrId, options = {}) {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  if (!session || session.status !== 'live') return null;
  if (typeof syncRecentlyPlayedForUser !== 'function') {
    throw new Error('Live sync dependency unavailable');
  }

  const actor = getLiveSyncActor(db, session);
  if (!actor?.id) {
    throw new Error('Live session host not found');
  }

  const syncResult = await syncRecentlyPlayedForUser(actor, {
    db,
    userId: actor.id,
    username: actor.username,
    persistActivityPosts: false,
  });
  const delta = applyLiveSyncResult(db, session, syncResult);
  const nextSession = getLiveSession(db, session.id);
  if (options.broadcast !== false && nextSession) {
    broadcastLiveSessionSnapshot(db, nextSession.id, options.reason || 'sync');
  }
  return {
    delta,
    session: nextSession || session,
  };
}

function clearLiveSyncTimer(liveSessionId) {
  const key = String(liveSessionId || '').trim();
  if (!key) return;
  const timer = liveSyncTimers.get(key);
  if (timer) {
    clearInterval(timer);
    liveSyncTimers.delete(key);
  }
  liveSyncInFlight.delete(key);
}

function ensureLiveSyncTimer(db, sessionOrId) {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  if (!session) return;

  const key = String(session.id || '').trim();
  if (!key) return;
  if (session.status !== 'live') {
    clearLiveSyncTimer(key);
    return;
  }
  if (liveSyncTimers.has(key)) return;

  const timer = setInterval(async () => {
    if (liveSyncInFlight.has(key)) return;
    liveSyncInFlight.add(key);
    try {
      const currentDb = getDb();
      const currentSession = getLiveSession(currentDb, key);
      if (!currentSession || currentSession.status !== 'live') {
        clearLiveSyncTimer(key);
        return;
      }
      await performLiveSessionSync(currentDb, currentSession, { reason: 'sync' });
    } catch (err) {
      try {
        const currentDb = getDb();
        markLiveSessionSyncError(currentDb, key);
        broadcastLiveSessionSnapshot(currentDb, key, 'sync_error');
      } catch {
        // Ignore secondary errors while surfacing the original sync failure in logs.
      }
      console.error('Live session background sync error:', err.message);
    } finally {
      liveSyncInFlight.delete(key);
    }
  }, LIVE_SYNC_INTERVAL_MS);

  liveSyncTimers.set(key, timer);
}

function normalizeRequestStatus(status, fulfilled = false) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'queued' || normalized === 'played' || normalized === 'skipped' || normalized === 'open') {
    return normalized;
  }
  return fulfilled ? 'played' : 'open';
}

function normalizeModerationRow(row, liveSessionId = '', userId = '') {
  return {
    live_session_id: row?.live_session_id || String(liveSessionId || ''),
    user_id: row?.user_id || String(userId || ''),
    chat_muted: toInt(row?.chat_muted) === 1,
    requests_blocked: toInt(row?.requests_blocked) === 1,
    moderated_by_user_id: row?.moderated_by_user_id || '',
    created_at: row?.created_at || '',
    updated_at: row?.updated_at || '',
  };
}

function getLiveModerationState(db, liveSessionId, userId = '') {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return normalizeModerationRow(null, liveSessionId, normalizedUserId);

  const row = db.prepare(`
    SELECT live_session_id, user_id, chat_muted, requests_blocked, moderated_by_user_id, created_at, updated_at
    FROM live_session_moderation
    WHERE live_session_id = ?
      AND user_id = ?
    LIMIT 1
  `).get(liveSessionId, normalizedUserId);
  return normalizeModerationRow(row, liveSessionId, normalizedUserId);
}

function getSessionViewerState(db, session, currentUserId = '') {
  const normalizedUserId = String(currentUserId || '').trim();
  if (!normalizedUserId || normalizedUserId === String(session?.host_user_id || '')) {
    return normalizeModerationRow(null, session?.id || '', normalizedUserId);
  }
  return getLiveModerationState(db, session.id, normalizedUserId);
}

function buildRequestStatusAnnouncement(requestRow, nextStatus, previousStatus = '') {
  const requester = normalizeText(requestRow?.username || 'Viewer', 60) || 'Viewer';
  const label = formatPlayLabel(requestRow);

  if (nextStatus === 'played') {
    return {
      message: buildRequestFulfillmentMessage(requestRow, [requester]),
      message_type: 'request_fulfilled',
      metadata: {
        request_ids: [requestRow.id],
        song_title: requestRow.song_title || '',
        mode: requestRow.mode || '',
        level: toInt(requestRow.level),
        manual: true,
        request_status: nextStatus,
      },
    };
  }

  if (nextStatus === 'queued') {
    return {
      message: `Queued request: ${label} from ${requester}.`,
      message_type: 'request_queue',
      metadata: {
        request_id: requestRow.id,
        song_title: requestRow.song_title || '',
        mode: requestRow.mode || '',
        level: toInt(requestRow.level),
        request_status: nextStatus,
      },
    };
  }

  if (nextStatus === 'skipped') {
    return {
      message: `Skipped request: ${label} from ${requester}.`,
      message_type: 'request_queue',
      metadata: {
        request_id: requestRow.id,
        song_title: requestRow.song_title || '',
        mode: requestRow.mode || '',
        level: toInt(requestRow.level),
        request_status: nextStatus,
      },
    };
  }

  if (nextStatus === 'open') {
    return {
      message: `${previousStatus === 'queued' ? 'Returned to open queue' : 'Reopened request'}: ${label} from ${requester}.`,
      message_type: 'request_queue',
      metadata: {
        request_id: requestRow.id,
        song_title: requestRow.song_title || '',
        mode: requestRow.mode || '',
        level: toInt(requestRow.level),
        request_status: nextStatus,
      },
    };
  }

  return null;
}

function updateLiveRequestStatus(db, requestRow, nextStatus, options = {}) {
  if (!requestRow?.id) return null;

  const normalizedStatus = normalizeRequestStatus(nextStatus, nextStatus === 'played');
  const previousStatus = normalizeRequestStatus(requestRow.status, toInt(requestRow.fulfilled) === 1);
  const actorUserId = String(options.actorUserId || '').trim();
  const handledByUserId = normalizedStatus === 'played' || normalizedStatus === 'skipped' ? actorUserId : '';
  const handledAt = normalizedStatus === 'played' || normalizedStatus === 'skipped'
    ? new Date().toISOString().slice(0, 19).replace('T', ' ')
    : '';

  if (previousStatus !== normalizedStatus || toInt(requestRow.fulfilled) !== (normalizedStatus === 'played' ? 1 : 0)) {
    db.prepare(`
      UPDATE live_session_requests
      SET status = ?,
          fulfilled = ?,
          handled_at = ?,
          handled_by_user_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      normalizedStatus,
      normalizedStatus === 'played' ? 1 : 0,
      handledAt,
      handledByUserId,
      requestRow.id
    );
  }

  const updatedRow = db.prepare(`
    SELECT *
    FROM live_session_requests
    WHERE id = ?
    LIMIT 1
  `).get(requestRow.id);

  if (options.emitMessage !== false && previousStatus !== normalizedStatus) {
    const announcement = buildRequestStatusAnnouncement({ ...requestRow, ...updatedRow }, normalizedStatus, previousStatus);
    if (announcement?.message) {
      addSystemMessage(
        db,
        requestRow.live_session_id,
        announcement.message,
        announcement.message_type,
        announcement.metadata
      );
    }
  }

  return updatedRow;
}

function buildModerationAnnouncement(targetUser, previousState, nextState) {
  const changes = [];
  if (!!previousState?.chat_muted !== !!nextState?.chat_muted) {
    changes.push(nextState.chat_muted ? 'chat muted' : 'chat unmuted');
  }
  if (!!previousState?.requests_blocked !== !!nextState?.requests_blocked) {
    changes.push(nextState.requests_blocked ? 'requests blocked' : 'requests restored');
  }
  if (changes.length === 0) return '';

  const name = normalizeText(targetUser?.username || 'Viewer', 60) || 'Viewer';
  return `${name}: ${changes.join(' • ')}.`;
}

function getLiveMessageRow(db, messageId) {
  return db.prepare(`
    SELECT
      m.*,
      s.host_user_id,
      COALESCE(u.avatar, '') AS user_avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.pumbility, 0) AS pumbility,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(mod.chat_muted, 0) AS chat_muted,
      COALESCE(mod.requests_blocked, 0) AS requests_blocked
    FROM live_session_messages m
    JOIN live_sessions s ON s.id = m.live_session_id
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN live_session_moderation mod
      ON mod.live_session_id = m.live_session_id
     AND mod.user_id = m.user_id
    WHERE m.id = ?
    LIMIT 1
  `).get(messageId);
}

function getPlayOutcomeMap(db, liveSessionId) {
  const map = new Map();

  const upscoreRows = db.prepare(`
    SELECT payload_json
    FROM live_session_buffered_upscores
    WHERE live_session_id = ?
    ORDER BY id ASC
  `).all(liveSessionId);
  for (const row of upscoreRows) {
    const payload = safeParseJson(row?.payload_json || '{}', {});
    const key = buildPlayOutcomeKey(payload.song_title, payload.mode, payload.level, payload.new_score);
    if (!key) continue;
    map.set(key, {
      type: 'upscore',
      pumbility_gain: toInt(payload.pumbility_gain),
      singles_pumbility_gain: toInt(payload.singles_pumbility_gain),
      over_top100_rank: toInt(payload.over_top100_rank),
    });
  }

  const clearRows = db.prepare(`
    SELECT payload_json
    FROM live_session_buffered_clears
    WHERE live_session_id = ?
    ORDER BY id ASC
  `).all(liveSessionId);
  for (const row of clearRows) {
    const payload = safeParseJson(row?.payload_json || '{}', {});
    if (String(payload?.entry_type || 'song_clear') === 'title_unlock') continue;
    const key = buildPlayOutcomeKey(payload.song_title, payload.mode, payload.level, payload.score);
    if (!key || map.has(key)) continue;
    map.set(key, {
      type: 'clear',
      pumbility_gain: toInt(payload.pumbility_gain),
      singles_pumbility_gain: toInt(payload.singles_pumbility_gain),
      over_top100_rank: toInt(payload.over_top100_rank),
    });
  }

  return map;
}

function getSessionPlays(db, liveSessionId) {
  const outcomeMap = getPlayOutcomeMap(db, liveSessionId);
  const rows = db.prepare(`
    SELECT
      p.*,
      COALESCE(s.make, '') AS shoe_make,
      COALESCE(s.model, '') AS shoe_model,
      COALESCE(s.colorway, '') AS shoe_colorway
    FROM live_session_plays p
    LEFT JOIN user_shoes s ON s.id = p.shoe_id
    WHERE p.live_session_id = ?
    ORDER BY p.id DESC
    LIMIT ?
  `).all(liveSessionId, PLAY_LIMIT);

  return rows.map((row) => {
    const key = buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.score);
    const outcome = outcomeMap.get(key) || null;
    return {
      ...row,
      pumbility_gain: outcome ? outcome.pumbility_gain : 0,
      singles_pumbility_gain: outcome ? outcome.singles_pumbility_gain : 0,
      session_result_type: outcome ? outcome.type : '',
      over_top100_rank: Math.max(toInt(row.over_top100_rank), toInt(outcome?.over_top100_rank)),
    };
  });
}

function getLatestSessionPlay(db, liveSessionId) {
  const outcomeMap = getPlayOutcomeMap(db, liveSessionId);
  const row = db.prepare(`
    SELECT
      p.*,
      COALESCE(s.make, '') AS shoe_make,
      COALESCE(s.model, '') AS shoe_model,
      COALESCE(s.colorway, '') AS shoe_colorway
    FROM live_session_plays p
    LEFT JOIN user_shoes s ON s.id = p.shoe_id
    WHERE p.live_session_id = ?
    ORDER BY p.id DESC
    LIMIT 1
  `).get(liveSessionId);

  if (!row) return null;

  const key = buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.score);
  const outcome = outcomeMap.get(key) || null;
  return {
    ...row,
    pumbility_gain: outcome ? outcome.pumbility_gain : 0,
    singles_pumbility_gain: outcome ? outcome.singles_pumbility_gain : 0,
    session_result_type: outcome ? outcome.type : '',
    over_top100_rank: Math.max(toInt(row.over_top100_rank), toInt(outcome?.over_top100_rank)),
  };
}

function normalizeMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    live_session_id: row.live_session_id,
    user_id: row.user_id || '',
    username: row.username || '',
    avatar: row.user_id
      ? normalizeUserAvatarForList(row.user_avatar || row.avatar, row.user_id, 40, row.avatar_v)
      : row.avatar || '',
    message: row.message || '',
    message_type: row.message_type || 'chat',
    metadata: safeParseJson(row.metadata_json || '{}', {}),
    created_at: row.created_at || '',
    is_system: (row.message_type || '') === 'system' || !row.user_id,
    skill_title: row.skill_title || '',
    pumbility: toInt(row.pumbility),
    nationality: row.nationality || '',
    is_host: !!row.user_id && String(row.host_user_id || '') === String(row.user_id || ''),
    chat_muted: toInt(row.chat_muted) === 1,
    requests_blocked: toInt(row.requests_blocked) === 1,
  };
}

function getSessionMessages(db, liveSessionId) {
  const rows = db.prepare(`
    SELECT
      m.*,
      s.host_user_id,
      COALESCE(u.avatar, '') AS user_avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.pumbility, 0) AS pumbility,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(mod.chat_muted, 0) AS chat_muted,
      COALESCE(mod.requests_blocked, 0) AS requests_blocked
    FROM live_session_messages m
    JOIN live_sessions s ON s.id = m.live_session_id
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN live_session_moderation mod
      ON mod.live_session_id = m.live_session_id
     AND mod.user_id = m.user_id
    WHERE m.live_session_id = ?
    ORDER BY datetime(m.created_at) DESC, m.id DESC
    LIMIT ?
  `).all(liveSessionId, CHAT_LIMIT);

  return rows.reverse().map(normalizeMessageRow);
}

function getSessionRequests(db, liveSessionId) {
  const rows = db.prepare(`
    SELECT
      r.*,
      s.host_user_id,
      u.avatar,
      u.avatar_v,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.pumbility, 0) AS pumbility,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(mod.chat_muted, 0) AS chat_muted,
      COALESCE(mod.requests_blocked, 0) AS requests_blocked
    FROM live_session_requests r
    JOIN live_sessions s ON s.id = r.live_session_id
    JOIN users u ON u.id = r.user_id
    LEFT JOIN live_session_moderation mod
      ON mod.live_session_id = r.live_session_id
     AND mod.user_id = r.user_id
    WHERE r.live_session_id = ?
    ORDER BY CASE COALESCE(NULLIF(r.status, ''), CASE WHEN r.fulfilled = 1 THEN 'played' ELSE 'open' END)
      WHEN 'queued' THEN 0
      WHEN 'open' THEN 1
      WHEN 'played' THEN 2
      WHEN 'skipped' THEN 3
      ELSE 4
    END ASC,
    datetime(COALESCE(NULLIF(r.updated_at, ''), r.created_at)) DESC,
    datetime(r.created_at) DESC,
    r.id DESC
    LIMIT ?
  `).all(liveSessionId, REQUEST_LIMIT);

  let queuePosition = 0;
  return rows.map((row) => {
    const status = normalizeRequestStatus(row.status, toInt(row.fulfilled) === 1);
    if (status === 'queued') queuePosition += 1;
    return {
      id: row.id,
      live_session_id: row.live_session_id,
      user_id: row.user_id,
      username: row.username || '',
      avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 40, row.avatar_v),
      chart_id: row.chart_id ? toInt(row.chart_id) : null,
      chart_key: row.chart_key || '',
      song_title: row.song_title || '',
      mode: row.mode || '',
      level: toInt(row.level),
      status,
      fulfilled: status === 'played',
      handled_at: row.handled_at || '',
      handled_by_user_id: row.handled_by_user_id || '',
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
      skill_title: row.skill_title || '',
      pumbility: toInt(row.pumbility),
      nationality: row.nationality || '',
      is_host: String(row.host_user_id || '') === String(row.user_id || ''),
      chat_muted: toInt(row.chat_muted) === 1,
      requests_blocked: toInt(row.requests_blocked) === 1,
      queue_position: status === 'queued' ? queuePosition : 0,
    };
  });
}

function getVoteSnapshot(db, voteId, currentUserId = '') {
  const vote = db.prepare(`
    SELECT *
    FROM live_session_votes
    WHERE id = ?
  `).get(voteId);
  if (!vote) return null;

  const options = db.prepare(`
    SELECT
      o.*,
      COUNT(b.user_id) AS vote_count,
      MAX(CASE WHEN b.user_id = ? THEN 1 ELSE 0 END) AS user_voted
    FROM live_session_vote_options o
    LEFT JOIN live_session_vote_ballots b ON b.option_id = o.id
    WHERE o.vote_id = ?
    GROUP BY o.id
    ORDER BY o.position ASC, o.id ASC
  `).all(currentUserId || '', voteId);

  return {
    id: vote.id,
    live_session_id: vote.live_session_id,
    host_user_id: vote.host_user_id,
    mode_filter: vote.mode_filter || 'All',
    min_level: toInt(vote.min_level),
    max_level: toInt(vote.max_level),
    status: vote.status || 'closed',
    pinned_message_id: vote.pinned_message_id || '',
    ends_at: vote.ends_at || '',
    winning_option_id: vote.winning_option_id || '',
    created_at: vote.created_at || '',
    updated_at: vote.updated_at || '',
    options: options.map((row) => ({
      id: row.id,
      vote_id: row.vote_id,
      chart_id: row.chart_id ? toInt(row.chart_id) : null,
      chart_key: row.chart_key || '',
      song_title: row.song_title || '',
      mode: row.mode || '',
      level: toInt(row.level),
      jacket_url: row.jacket_url || '',
      position: toInt(row.position),
      vote_count: toInt(row.vote_count),
      user_voted: toInt(row.user_voted) === 1,
      is_winner: (vote.winning_option_id || '') === row.id,
    })),
  };
}

function closeVote(db, voteId, options = {}) {
  const snapshot = getVoteSnapshot(db, voteId, options.currentUserId || '');
  if (!snapshot || snapshot.status !== 'active') return snapshot;
  clearVoteCloseTimer(voteId);

  const rankedOptions = snapshot.options.slice().sort((a, b) => {
    if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
    return a.position - b.position;
  });
  const winner = rankedOptions.find((option) => option.vote_count > 0) || null;

  db.prepare(`
    UPDATE live_session_votes
    SET status = 'closed',
        winning_option_id = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(winner?.id || '', voteId);

  if (options.emitMessage !== false) {
    if (winner) {
      addSystemMessage(
        db,
        snapshot.live_session_id,
        `Vote locked: ${formatPlayLabel(winner)} wins with ${winner.vote_count} vote${winner.vote_count === 1 ? '' : 's'}.`,
        'vote_result',
        { vote_id: voteId, winning_option_id: winner.id }
      );
    } else {
      addSystemMessage(db, snapshot.live_session_id, 'Vote locked. No ballots were cast.', 'vote_result', { vote_id: voteId });
    }
  }

  const closedSnapshot = getVoteSnapshot(db, voteId, options.currentUserId || '');
  if (options.broadcast !== false) {
    broadcastLiveSessionSnapshot(db, snapshot.live_session_id, options.reason || 'vote_closed');
  }
  return closedSnapshot;
}

function getLatestVoteSnapshot(db, liveSessionId, currentUserId = '') {
  const vote = db.prepare(`
    SELECT id, status, ends_at
    FROM live_session_votes
    WHERE live_session_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `).get(liveSessionId);
  if (!vote) return null;

  const endsAtMs = vote.ends_at ? Date.parse(`${vote.ends_at}Z`) : NaN;
  if (vote.status === 'active' && Number.isFinite(endsAtMs) && Date.now() >= endsAtMs) {
    return closeVote(db, vote.id, { currentUserId, broadcast: false });
  }

  return getVoteSnapshot(db, vote.id, currentUserId);
}

function normalizeSessionPayload(session, host, viewerCount, currentUserId) {
  return {
    id: session.id,
    title: session.title || '',
    stream_url: session.stream_url || '',
    requests_enabled: toInt(session.requests_enabled) !== 0,
    is_hidden_from_profile: toInt(session.is_hidden_from_profile) !== 0,
    status: session.status || 'live',
    host_user_id: session.host_user_id,
    recent_anchor_id: toInt(session.recent_anchor_id),
    last_recent_row_id: toInt(session.last_recent_row_id),
    last_sync_at: session.last_sync_at || '',
    last_sync_status: session.last_sync_status || '',
    viewer_count: Math.max(0, toInt(viewerCount)),
    viewer_peak: Math.max(0, toInt(session.viewer_peak)),
    created_at: session.created_at || '',
    started_at: session.started_at || '',
    ended_at: session.ended_at || '',
    updated_at: session.updated_at || '',
    is_host: String(currentUserId || '') === String(session.host_user_id || ''),
    live_url: `/live/${session.id}`,
    host: host ? {
      id: host.id,
      username: host.username || '',
      avatar: host.avatar || '',
      nationality: host.nationality || '',
      skill_title: host.skill_title || '',
      pumbility: toInt(host.pumbility),
    } : null,
  };
}

function buildSessionSnapshot(db, session, currentUserId = '') {
  const freshSession = typeof session === 'string' ? getLiveSession(db, session) : getLiveSession(db, session.id);
  if (!freshSession) return null;

  const viewerCount = getViewerCount(db, freshSession);
  const viewerPeak = updateViewerPeak(db, freshSession.id, viewerCount);
  const host = getHostProfile(db, freshSession.host_user_id);
  const plays = getSessionPlays(db, freshSession.id);
  const messages = getSessionMessages(db, freshSession.id);
  const requests = getSessionRequests(db, freshSession.id);
  const activeVote = getLatestVoteSnapshot(db, freshSession.id, currentUserId);
  const summary = buildLiveSessionSummary(plays, host || {}, {
    viewerCount,
    viewerPeak,
    streamUrl: freshSession.stream_url,
    hostUsername: host?.username || '',
  });

  return {
    session: normalizeSessionPayload({ ...freshSession, viewer_peak: viewerPeak }, host, viewerCount, currentUserId),
    viewer_state: getSessionViewerState(db, freshSession, currentUserId),
    summary,
    plays,
    messages,
    requests,
    active_vote: activeVote,
    last_play: plays[0] || null,
  };
}

function getSessionRequestCounts(db, liveSessionId) {
  const rows = db.prepare(`
    SELECT
      CASE
        WHEN COALESCE(NULLIF(status, ''), '') IN ('open', 'queued', 'played', 'skipped') THEN status
        WHEN fulfilled = 1 THEN 'played'
        ELSE 'open'
      END AS status_key,
      COUNT(*) AS count
    FROM live_session_requests
    WHERE live_session_id = ?
    GROUP BY 1
  `).all(liveSessionId);

  const counts = {
    open: 0,
    queued: 0,
    played: 0,
    skipped: 0,
  };

  for (const row of rows) {
    const key = normalizeRequestStatus(row?.status_key, false);
    counts[key] = toInt(row?.count);
  }

  return counts;
}

function summarizeVoteForDirectory(vote) {
  if (!vote) return null;
  const winningOption = Array.isArray(vote.options) ? vote.options.find((option) => option.is_winner) || null : null;
  const totalVotes = Array.isArray(vote.options)
    ? vote.options.reduce((sum, option) => sum + toInt(option?.vote_count), 0)
    : 0;

  return {
    id: vote.id,
    status: vote.status || 'closed',
    mode_filter: vote.mode_filter || 'All',
    min_level: toInt(vote.min_level),
    max_level: toInt(vote.max_level),
    ends_at: vote.ends_at || '',
    total_votes: totalVotes,
    winning_option: winningOption ? {
      id: winningOption.id,
      song_title: winningOption.song_title || '',
      mode: winningOption.mode || '',
      level: toInt(winningOption.level),
      jacket_url: winningOption.jacket_url || '',
    } : null,
  };
}

function buildDirectorySessionPayload(db, session, currentUserId = '') {
  const host = {
    id: session.host_user_id,
    username: session.username || '',
    avatar: normalizeUserAvatarForList(session.avatar, session.host_user_id, 96, session.avatar_v),
    nationality: session.nationality || '',
    skill_title: session.skill_title || '',
    pumbility: toInt(session.pumbility),
  };
  const viewerCount = getViewerCount(db, session);
  const viewerPeak = updateViewerPeak(db, session.id, viewerCount);
  const lastPlay = getLatestSessionPlay(db, session.id);
  const activeVote = getLatestVoteSnapshot(db, session.id, currentUserId);

  return {
    session: normalizeSessionPayload({ ...session, viewer_peak: viewerPeak }, host, viewerCount, currentUserId),
    last_play: lastPlay,
    request_counts: getSessionRequestCounts(db, session.id),
    active_vote: summarizeVoteForDirectory(activeVote),
    is_following: toInt(session.is_following) === 1,
    has_stream: !!normalizeUrl(session.stream_url, 400),
  };
}

function buildProfileActiveSessionPayload(db, session, currentUserId = '') {
  if (!session) return null;
  const host = getHostProfile(db, session.host_user_id);
  const viewerCount = getViewerCount(db, session);
  const viewerPeak = updateViewerPeak(db, session.id, viewerCount);
  const plays = getSessionPlays(db, session.id);
  const messageCount = getSessionMessageCount(db, session.id);
  const summary = plays.length > 0
    ? buildLiveSessionSummary(plays, host || {}, {
        viewerCount,
        viewerPeak,
        messageCount,
        streamUrl: session.stream_url,
        hostUsername: host?.username || '',
      })
    : null;

  return {
    session: normalizeSessionPayload({ ...session, viewer_peak: viewerPeak }, host, viewerCount, currentUserId),
    summary,
    last_play: plays[0] || null,
    message_count: messageCount,
    request_counts: getSessionRequestCounts(db, session.id),
    active_vote: summarizeVoteForDirectory(getLatestVoteSnapshot(db, session.id, currentUserId)),
  };
}

function buildProfileEndedSessionPayload(db, session, currentUserId = '') {
  if (!session) return null;
  const host = getHostProfile(db, session.host_user_id);
  const plays = getSessionPlays(db, session.id);
  const messageCount = getSessionMessageCount(db, session.id);
  const summary = plays.length > 0
    ? buildLiveSessionSummary(plays, host || {}, {
        viewerCount: 0,
        viewerPeak: Math.max(0, toInt(session.viewer_peak)),
        messageCount,
        streamUrl: session.stream_url,
        hostUsername: host?.username || '',
      })
    : null;

  return {
    session: normalizeSessionPayload(session, host, 0, currentUserId),
    summary,
    last_play: plays[0] || null,
    message_count: messageCount,
    play_count: plays.length,
  };
}

function getProfileEndedSessions(db, hostUserId, currentUserId = '', limit = 12) {
  const rows = db.prepare(`
    SELECT *
    FROM live_sessions
    WHERE host_user_id = ?
      AND status = 'ended'
      AND (? = host_user_id OR COALESCE(is_hidden_from_profile, 0) = 0)
    ORDER BY datetime(COALESCE(NULLIF(ended_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT ?
  `).all(hostUserId, String(currentUserId || ''), Math.max(1, Math.min(24, toInt(limit) || 12)));

  return rows.map((row) => buildProfileEndedSessionPayload(db, row, currentUserId)).filter(Boolean);
}

function getDirectorySessions(db, currentUserId = '', limit = 18) {
  const rows = db.prepare(`
    SELECT
      s.*,
      u.username,
      u.avatar,
      u.avatar_v,
      u.nationality,
      u.skill_title,
      u.pumbility,
      EXISTS(
        SELECT 1
        FROM user_follows uf
        WHERE uf.follower_id = ?
          AND uf.following_id = s.host_user_id
      ) AS is_following
    FROM live_sessions s
    JOIN users u ON u.id = s.host_user_id
    WHERE s.status = 'live'
    ORDER BY datetime(s.started_at) DESC, s.id DESC
    LIMIT ?
  `).all(currentUserId || '', Math.max(1, Math.min(36, toInt(limit) || 18)));

  const sessions = rows.map((row) => buildDirectorySessionPayload(db, row, currentUserId));
  sessions.sort((a, b) => {
    if (Number(b.is_following) !== Number(a.is_following)) {
      return Number(b.is_following) - Number(a.is_following);
    }
    if (toInt(b?.session?.viewer_count) !== toInt(a?.session?.viewer_count)) {
      return toInt(b.session.viewer_count) - toInt(a.session.viewer_count);
    }
    return Date.parse(`${b?.session?.started_at || ''}Z`) - Date.parse(`${a?.session?.started_at || ''}Z`);
  });
  return sessions;
}

function notifyFollowersLive(db, sessionId, host, title = '') {
  const hostUserId = String(host?.id || '').trim();
  if (!db || !hostUserId) return 0;

  const rows = db.prepare(`
    SELECT follower_id
    FROM user_follows
    WHERE following_id = ?
      AND follower_id != ?
  `).all(hostUserId, hostUserId);

  const actorUsername = normalizeText(host?.username || 'Someone', 80) || 'Someone';
  const trimmedTitle = normalizeText(title, 120);
  let created = 0;

  for (const row of rows) {
    const followerId = String(row?.follower_id || '').trim();
    if (!followerId) continue;
    createUserNotification(
      db,
      followerId,
      'followed_user_live',
      'Shinsa Live',
      trimmedTitle
        ? `${actorUsername} just went live: ${trimmedTitle}`
        : `${actorUsername} just went live on Shinsa Live`,
      `/live/${sessionId}`
    );
    created += 1;
  }

  return created;
}

function requireLiveSession(db, sessionId) {
  const session = getLiveSession(db, sessionId);
  if (!session) {
    const err = new Error('Live session not found');
    err.statusCode = 404;
    throw err;
  }
  return session;
}

function requireSessionHost(session, userId) {
  if (String(session?.host_user_id || '') !== String(userId || '')) {
    const err = new Error('Only the host can do that');
    err.statusCode = 403;
    throw err;
  }
}

function fulfillMatchingRequests(db, liveSessionId, plays = [], actorUserId = '') {
  const playByKey = new Map();
  for (const play of Array.isArray(plays) ? plays : []) {
    const key = buildRequestKey(play?.song_title, play?.mode, play?.level);
    if (!key || playByKey.has(key)) continue;
    playByKey.set(key, play);
  }
  if (playByKey.size === 0) return [];

  const requests = db.prepare(`
    SELECT id, live_session_id, username, song_title, mode, level, status, fulfilled
    FROM live_session_requests
    WHERE live_session_id = ?
      AND COALESCE(NULLIF(status, ''), CASE WHEN fulfilled = 1 THEN 'played' ELSE 'open' END) IN ('open', 'queued')
    ORDER BY datetime(created_at) ASC, id ASC
  `).all(liveSessionId);
  if (!requests.length) return [];

  const matched = [];
  for (const request of requests) {
    const key = buildRequestKey(request.song_title, request.mode, request.level);
    const play = playByKey.get(key);
    if (!play) continue;
    updateLiveRequestStatus(db, request, 'played', {
      actorUserId,
      emitMessage: false,
    });
    matched.push({
      request,
      play,
      key,
    });
  }

  return matched;
}

function getChartsForVote(db, modeFilter, minLevel, maxLevel) {
  const normalizedMode = String(modeFilter || 'All').trim().toLowerCase();
  let modes = ['Single', 'Double'];
  if (normalizedMode === 'single') modes = ['Single'];
  if (normalizedMode === 'double') modes = ['Double'];
  const placeholders = modes.map(() => '?').join(',');

  return db.prepare(`
    SELECT id, title, mode, level, jacket_url
    FROM songs
    WHERE mode IN (${placeholders})
      AND level BETWEEN ? AND ?
    ORDER BY RANDOM()
    LIMIT 3
  `).all(...modes, minLevel, maxLevel).map((row, index) => ({
    id: uuidv4(),
    chart_id: toInt(row.id),
    chart_key: `${normalizeText(row.title, 160)}|${normalizeText(row.mode, 40)}|${toInt(row.level)}`,
    song_title: row.title || '',
    mode: row.mode || '',
    level: toInt(row.level),
    jacket_url: row.jacket_url || '',
    position: index + 1,
  }));
}

function buildPlayAnnouncement(play, outcome) {
  const label = formatPlayLabel(play);
  const score = toInt(play?.score);
  const grade = String(play?.grade || '').trim() || (score > 0 ? score.toLocaleString() : 'FAIL');
  const bucket = getGradeBucket(play);
  const base = bucket === 'fail'
    ? pickDeterministicMessage(FAIL_MESSAGES, `${label}|${score}|fail`)
    : bucket === 'elite'
      ? pickDeterministicMessage(ELITE_MESSAGES, `${label}|${score}|elite`)
      : bucket === 'strong'
        ? pickDeterministicMessage(STRONG_MESSAGES, `${label}|${score}|strong`)
        : pickDeterministicMessage(PASS_MESSAGES, `${label}|${score}|pass`);

  const extras = [];
  if (outcome?.type === 'upscore') extras.push('New upscore.');
  if (outcome?.type === 'clear') extras.push('First clear on this chart.');
  if (toInt(outcome?.pumbility_gain) > 0) extras.push(`+${toInt(outcome.pumbility_gain)} pumbility.`);
  const overRank = Math.max(toInt(play?.over_top100_rank), toInt(outcome?.over_top100_rank));
  if (overRank > 0) extras.push(`OVER Top 100 #${overRank}.`);

  return `Last played: ${label} • ${grade} ${score > 0 ? score.toLocaleString() : ''}`.trim() + `. ${base}${extras.length ? ` ${extras.join(' ')}` : ''}`;
}

function bufferSyncResults(db, liveSessionId, syncResult) {
  const insertBufferedUpscore = db.prepare(`
    INSERT INTO live_session_buffered_upscores (live_session_id, payload_json, pumbility_gain, singles_pumbility_gain)
    VALUES (?, ?, ?, ?)
  `);
  const insertBufferedClear = db.prepare(`
    INSERT INTO live_session_buffered_clears (live_session_id, payload_json, pumbility_gain, singles_pumbility_gain)
    VALUES (?, ?, ?, ?)
  `);

  for (const row of Array.isArray(syncResult?.upscores) ? syncResult.upscores : []) {
    insertBufferedUpscore.run(
      liveSessionId,
      JSON.stringify(row),
      toInt(row?.pumbility_gain),
      toInt(row?.singles_pumbility_gain)
    );
  }

  const clearRows = [
    ...(Array.isArray(syncResult?.new_clears) ? syncResult.new_clears : []),
    ...(Array.isArray(syncResult?.title_unlock_rows) ? syncResult.title_unlock_rows : []),
  ];
  for (const row of clearRows) {
    insertBufferedClear.run(
      liveSessionId,
      JSON.stringify(row),
      toInt(row?.pumbility_gain),
      toInt(row?.singles_pumbility_gain)
    );
  }
}

function appendRecentRowsToSession(db, session, recentRows) {
  const insertPlay = db.prepare(`
    INSERT OR IGNORE INTO live_session_plays (
      live_session_id, user_id, recently_played_id, song_title, mode, level, score, grade,
      machine_name, background_url, date_played, perfect, great, good, bad, miss, max_combo,
      kcal, plate, over_top100_rank, shoe_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inserted = [];
  for (const row of recentRows) {
    const result = insertPlay.run(
      session.id,
      session.host_user_id,
      row.id,
      row.song_title,
      row.mode,
      toInt(row.level),
      toInt(row.score),
      row.grade || '',
      row.machine_name || '',
      row.background_url || '',
      row.date_played || '',
      toInt(row.perfect),
      toInt(row.great),
      toInt(row.good),
      toInt(row.bad),
      toInt(row.miss),
      toInt(row.max_combo),
      Number.isFinite(Number(row.kcal)) ? Number(row.kcal) : 0,
      row.plate || '',
      toInt(row.over_top100_rank),
      row.shoe_id ? toInt(row.shoe_id) : null
    );
    if (result.changes > 0) inserted.push(row);
  }
  return inserted;
}

function applyLiveSyncResult(db, session, syncResult) {
  const recentRows = db.prepare(`
    SELECT
      p.*,
      COALESCE(s.make, '') AS shoe_make,
      COALESCE(s.model, '') AS shoe_model,
      COALESCE(s.colorway, '') AS shoe_colorway
    FROM user_recently_played p
    LEFT JOIN user_shoes s ON s.id = p.shoe_id
    WHERE p.user_id = ?
      AND p.id > ?
    ORDER BY p.id ASC
  `).all(session.host_user_id, toInt(session.last_recent_row_id));

  const insertedRows = appendRecentRowsToSession(db, session, recentRows);
  bufferSyncResults(db, session.id, syncResult);

  const outcomeMap = new Map();
  for (const row of Array.isArray(syncResult?.upscores) ? syncResult.upscores : []) {
    outcomeMap.set(buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.new_score), { ...row, type: 'upscore' });
  }
  for (const row of Array.isArray(syncResult?.new_clears) ? syncResult.new_clears : []) {
    const key = buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.score);
    if (!outcomeMap.has(key)) outcomeMap.set(key, { ...row, type: 'clear' });
  }

  for (const row of insertedRows) {
    const outcome = outcomeMap.get(buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.score)) || null;
    addSystemMessage(
      db,
      session.id,
      buildPlayAnnouncement(row, outcome),
      'play',
      {
        recently_played_id: toInt(row.id),
        song_title: row.song_title || '',
        mode: row.mode || '',
        level: toInt(row.level),
        score: toInt(row.score),
        grade: row.grade || '',
        pumbility_gain: toInt(outcome?.pumbility_gain),
        session_result_type: outcome?.type || '',
        over_top100_rank: Math.max(toInt(row.over_top100_rank), toInt(outcome?.over_top100_rank)),
      }
    );
  }

  const fulfilledRequests = fulfillMatchingRequests(db, session.id, insertedRows, session.host_user_id);
  if (fulfilledRequests.length > 0) {
    const groups = new Map();
    for (const match of fulfilledRequests) {
      if (!groups.has(match.key)) {
        groups.set(match.key, {
          play: match.play,
          requestIds: [],
          requesters: [],
        });
      }
      const group = groups.get(match.key);
      group.requestIds.push(match.request.id);
      group.requesters.push(match.request.username || 'Viewer');
    }

    for (const group of groups.values()) {
      addSystemMessage(
        db,
        session.id,
        buildRequestFulfillmentMessage(group.play, group.requesters),
        'request_fulfilled',
        {
          request_ids: group.requestIds,
          song_title: group.play?.song_title || '',
          mode: group.play?.mode || '',
          level: toInt(group.play?.level),
          recently_played_id: toInt(group.play?.id),
        }
      );
    }
  }

  const unlockedTitles = Array.isArray(syncResult?.newly_unlocked_titles) ? syncResult.newly_unlocked_titles : [];
  if (unlockedTitles.length > 0) {
    const titleNames = unlockedTitles.map((title) => title?.name || title?.skill_title).filter(Boolean).slice(0, 3);
    const suffix = unlockedTitles.length > 3 ? ` (+${unlockedTitles.length - 3} more)` : '';
    addSystemMessage(
      db,
      session.id,
      `Title earned: ${titleNames.join(', ')}${suffix}.`,
      'title_unlock',
      { titles: titleNames, count: unlockedTitles.length }
    );
  }

  const lastRecentRowId = recentRows.length > 0
    ? Math.max(...recentRows.map((row) => toInt(row.id)))
    : toInt(session.last_recent_row_id);
  db.prepare(`
    UPDATE live_sessions
    SET last_recent_row_id = ?,
        last_sync_at = datetime('now'),
        last_sync_status = 'ok',
        updated_at = datetime('now')
    WHERE id = ?
  `).run(lastRecentRowId, session.id);

  return {
    recent_rows_seen: recentRows.length,
    new_plays_added: insertedRows.length,
    requests_fulfilled: fulfilledRequests.length,
    buffered_upscores: Array.isArray(syncResult?.upscores) ? syncResult.upscores.length : 0,
    buffered_clears: (Array.isArray(syncResult?.new_clears) ? syncResult.new_clears.length : 0)
      + (Array.isArray(syncResult?.title_unlock_rows) ? syncResult.title_unlock_rows.length : 0),
    title_unlocks: unlockedTitles.length,
  };
}

function parseBufferedRows(db, liveSessionId, tableName) {
  return db.prepare(`
    SELECT payload_json, pumbility_gain, singles_pumbility_gain
    FROM ${tableName}
    WHERE live_session_id = ?
    ORDER BY id ASC
  `).all(liveSessionId).map((row) => {
    const payload = safeParseJson(row.payload_json || '{}', {});
    payload.pumbility_gain = toInt(row.pumbility_gain || payload.pumbility_gain);
    payload.singles_pumbility_gain = toInt(row.singles_pumbility_gain || payload.singles_pumbility_gain);
    return payload;
  });
}

function buildSummaryPostContent(summary) {
  if (!summary) return '';
  const marker = serializeLiveSessionMarker(summary);
  return marker;
}

function getSessionMessageCount(db, liveSessionId) {
  if (!liveSessionId) return 0;
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM live_session_messages
    WHERE live_session_id = ?
  `).get(liveSessionId);
  return toInt(row?.count);
}

function createLiveOverlayAccessToken(sessionId) {
  const normalizedSessionId = String(sessionId || '').trim();
  const token = jwt.sign(
    {
      id: `live_overlay:${normalizedSessionId}`,
      scope: 'live_overlay',
      session_id: normalizedSessionId,
      username: 'Shinsa Live Overlay',
    },
    JWT_SECRET,
    { expiresIn: LIVE_OVERLAY_TOKEN_EXPIRY }
  );
  const decoded = jwt.decode(token);
  return {
    token,
    expires_at: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : '',
  };
}

function isLiveOverlayToken(decoded) {
  return String(decoded?.scope || '').trim().toLowerCase() === 'live_overlay';
}

function verifyLiveStreamToken(req) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    const err = new Error('Invalid or expired token');
    err.statusCode = 401;
    throw err;
  }
}

function broadcastLiveSessionSnapshot(db, liveSessionId, reason = 'session_updated') {
  return emitLiveSessionEvent(liveSessionId, 'snapshot', ({ userId }) => {
    const snapshot = buildSessionSnapshot(db, liveSessionId, userId);
    if (!snapshot) return undefined;
    return {
      reason,
      snapshot,
      emitted_at: new Date().toISOString(),
    };
  });
}

function broadcastLivePresence(liveSessionId, payload = {}) {
  return emitLiveSessionEvent(liveSessionId, 'presence', {
    live_session_id: liveSessionId,
    viewer_count: Math.max(0, toInt(payload.viewer_count)),
    viewer_peak: Math.max(0, toInt(payload.viewer_peak)),
    emitted_at: new Date().toISOString(),
  });
}

function clearVoteCloseTimer(voteId) {
  const key = String(voteId || '').trim();
  const timer = voteCloseTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    voteCloseTimers.delete(key);
  }
}

function scheduleVoteClose(db, voteId) {
  const key = String(voteId || '').trim();
  if (!key) return;

  clearVoteCloseTimer(key);

  const vote = db.prepare(`
    SELECT id, status, ends_at
    FROM live_session_votes
    WHERE id = ?
    LIMIT 1
  `).get(key);
  if (!vote || vote.status !== 'active') return;

  const endsAtMs = vote.ends_at ? Date.parse(`${vote.ends_at}Z`) : NaN;
  if (!Number.isFinite(endsAtMs)) return;

  const delayMs = endsAtMs - Date.now();
  if (delayMs <= 0) {
    closeVote(db, key, { emitMessage: true, broadcast: true, reason: 'vote_closed' });
    return;
  }

  const timer = setTimeout(() => {
    voteCloseTimers.delete(key);
    try {
      closeVote(db, key, { emitMessage: true, broadcast: true, reason: 'vote_closed' });
    } catch {
      // Ignore close errors; the next snapshot request can recover state.
    }
  }, delayMs);
  voteCloseTimers.set(key, timer);
}

router.get('/sessions/mine/active', requireAuth, (req, res) => {
  const db = getDb();
  const session = getActiveSessionForHost(db, req.user.id);
  if (!session) return res.json({ session: null });
  ensureLiveSyncTimer(db, session);
  return res.json(buildSessionSnapshot(db, session, req.user.id));
});

router.get('/sessions', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(36, toInt(req.query?.limit) || 18));
    const sessions = getDirectorySessions(db, req.user.id, limit);
    res.json({ sessions });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/profile/:userId', (req, res) => {
  try {
    const db = getDb();
    const userId = String(req.params.userId || '').trim();
    const currentUserId = getOptionalAuthUserId(req);
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const hostExists = db.prepare('SELECT id FROM users WHERE id = ? LIMIT 1').get(userId);
    if (!hostExists) return res.status(404).json({ error: 'User not found' });

    const activeSession = getActiveSessionForHost(db, userId);
    res.json({
      active_session: buildProfileActiveSessionPayload(db, activeSession, currentUserId),
      ended_sessions: getProfileEndedSessions(db, userId, currentUserId, 12),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const existing = getActiveSessionForHost(db, req.user.id);
    if (existing) {
      return res.status(409).json({ error: 'You already have an active live session', existing_session_id: existing.id });
    }
    if (typeof syncRecentlyPlayedForUser !== 'function') {
      throw new Error('Live sync dependency unavailable');
    }

    const title = normalizeText(req.body?.title, 120) || `${req.user.username || 'Player'} live session`;
    const streamUrl = normalizeUrl(req.body?.stream_url, 400);

    await syncRecentlyPlayedForUser(req.user, { db, persistActivityPosts: true });

    const anchor = db.prepare(`
      SELECT COALESCE(MAX(id), 0) AS max_id
      FROM user_recently_played
      WHERE user_id = ?
    `).get(req.user.id);
    const id = uuidv4();

    db.prepare(`
      INSERT INTO live_sessions (
        id, host_user_id, title, stream_url, status, recent_anchor_id, last_recent_row_id,
        last_sync_at, last_sync_status, viewer_peak, created_at, started_at, ended_at, updated_at
      ) VALUES (?, ?, ?, ?, 'live', ?, ?, datetime('now'), 'ready', 0, datetime('now'), datetime('now'), '', datetime('now'))
    `).run(id, req.user.id, title, streamUrl, toInt(anchor?.max_id), toInt(anchor?.max_id));

    addSystemMessage(db, id, `${req.user.username || 'Player'} started a Shinsa Live session.`, 'session_start', {
      stream_url: streamUrl,
    });
    const host = getHostProfile(db, req.user.id) || { id: req.user.id, username: req.user.username || 'Player' };
    const notifiedFollowers = notifyFollowersLive(db, id, host, title);
    ensureLiveSyncTimer(db, id);

    res.status(201).json({
      ...buildSessionSnapshot(db, id, req.user.id),
      notified_followers: notifiedFollowers,
    });
  } catch (err) {
    console.error('Create live session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    ensureLiveSyncTimer(db, session);
    res.json(buildSessionSnapshot(db, session, req.user.id));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.patch('/sessions/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    if (String(session.host_user_id || '') !== String(req.user.id || '')) {
      return res.status(403).json({ error: 'Only the host can update this live session' });
    }

    const nextStreamUrl = normalizeUrl(req.body?.stream_url, 400);
    const nextRequestsEnabled = req.body?.requests_enabled === undefined
      ? (toInt(session.requests_enabled) !== 0)
      : !!req.body.requests_enabled;
    db.prepare(`
      UPDATE live_sessions
      SET stream_url = ?, requests_enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStreamUrl, nextRequestsEnabled ? 1 : 0, session.id);

    broadcastLiveSessionSnapshot(db, session.id, 'stream_updated');
    return res.json(buildSessionSnapshot(db, session.id, req.user.id));
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.patch('/sessions/:id/profile-visibility', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    if (String(session.host_user_id || '') !== String(req.user.id || '')) {
      return res.status(403).json({ error: 'Only the host can update this live session' });
    }

    const hidden = !!req.body?.hidden;
    db.prepare(`
      UPDATE live_sessions
      SET is_hidden_from_profile = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(hidden ? 1 : 0, session.id);

    const updated = requireLiveSession(db, session.id);
    return res.json({
      success: true,
      session: normalizeSessionPayload(updated, getHostProfile(db, updated.host_user_id), 0, req.user.id),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/overlay-token', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    if (String(session.host_user_id || '') !== String(req.user.id || '')) {
      return res.status(403).json({ error: 'Only the host can mint overlay access' });
    }

    const overlayAccess = createLiveOverlayAccessToken(session.id);
    return res.json({
      session_id: session.id,
      ...overlayAccess,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/sessions/:id/stream', (req, res) => {
  let detach = null;
  let heartbeat = null;

  try {
    const decoded = verifyLiveStreamToken(req);
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    ensureLiveSyncTimer(db, session);
    const streamUserId = String(decoded?.id || '').trim();
    if (!streamUserId) {
      const err = new Error('Authentication required');
      err.statusCode = 401;
      throw err;
    }
    if (isLiveOverlayToken(decoded) && String(decoded?.session_id || '') !== String(session.id || '')) {
      const err = new Error('Overlay token does not match this live session');
      err.statusCode = 403;
      throw err;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    detach = addLiveSessionClient(session.id, streamUserId, res);
    heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        // Ignore broken sockets; request close handler cleans up.
      }
    }, STREAM_HEARTBEAT_MS);

    res.write('event: ready\ndata: {"ok":true}\n\n');
    const snapshot = buildSessionSnapshot(db, session, streamUserId);
    res.write(`event: snapshot\ndata: ${JSON.stringify({
      reason: 'initial',
      snapshot,
      emitted_at: new Date().toISOString(),
    })}\n\n`);
  } catch (err) {
    if (!res.headersSent) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
    return res.end();
  }

  req.on('close', () => {
    if (heartbeat) clearInterval(heartbeat);
    if (detach) detach();
  });
});

router.post('/sessions/:id/presence', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    const sessionId = normalizeText(req.body?.session_id, 80);
    if (!sessionId) return res.status(400).json({ error: 'session_id is required' });

    db.prepare(`
      INSERT INTO live_session_presence (live_session_id, session_id, user_id, last_seen)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(live_session_id, session_id) DO UPDATE SET
        user_id = excluded.user_id,
        last_seen = datetime('now')
    `).run(session.id, sessionId, req.user.id);

    const viewerCount = getViewerCount(db, session);
    const viewerPeak = updateViewerPeak(db, session.id, viewerCount);
    broadcastLivePresence(session.id, { viewer_count: viewerCount, viewer_peak: viewerPeak });
    res.json({ viewer_count: viewerCount, viewer_peak: viewerPeak });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/sessions/:id/messages', requireAuth, (req, res) => {
  try {
    const db = getDb();
    requireLiveSession(db, req.params.id);
    res.json({ messages: getSessionMessages(db, req.params.id) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/messages', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });
    if (String(req.user.id || '') !== String(session.host_user_id || '')) {
      const moderation = getLiveModerationState(db, session.id, req.user.id);
      if (moderation.chat_muted) {
        return res.status(403).json({ error: 'The host has muted your chat for this session' });
      }
    }

    const message = String(req.body?.message || '').trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const user = db.prepare(`
      SELECT id, username, avatar, avatar_v
      FROM users
      WHERE id = ?
    `).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const id = uuidv4();
    const avatar = normalizeUserAvatarForList(user.avatar, user.id, 40, user.avatar_v);
    db.prepare(`
      INSERT INTO live_session_messages (id, live_session_id, user_id, username, avatar, message, message_type, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, 'chat', '{}')
    `).run(id, session.id, user.id, user.username || req.user.username || 'User', avatar, message);

    const row = getLiveMessageRow(db, id);
    broadcastLiveSessionSnapshot(db, session.id, 'message');
    res.status(201).json({ message: normalizeMessageRow(row) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/sync', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });
    ensureLiveSyncTimer(db, session);
    const result = await performLiveSessionSync(db, session, { reason: 'sync' });
    const nextSession = result?.session || getLiveSession(db, session.id) || session;

    res.json({
      success: true,
      sync_result: result?.delta || null,
      snapshot: buildSessionSnapshot(db, nextSession, req.user.id),
    });
  } catch (err) {
    console.error('Live session sync error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/requests', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });
    const isHost = String(req.user.id || '') === String(session.host_user_id || '');
    if (!isHost && toInt(session.requests_enabled) === 0) {
      return res.status(403).json({ error: 'Song requests are currently disabled for this session' });
    }
    if (!isHost) {
      const moderation = getLiveModerationState(db, session.id, req.user.id);
      if (moderation.requests_blocked) {
        return res.status(403).json({ error: 'The host has blocked your requests for this session' });
      }
    }

    const chartId = req.body?.chart_id ? toInt(req.body.chart_id) : 0;
    let chart = null;
    if (chartId > 0) {
      chart = db.prepare(`
        SELECT id, title, mode, level
        FROM songs
        WHERE id = ?
      `).get(chartId);
    } else {
      const songTitle = normalizeText(req.body?.song_title, 160);
      const mode = normalizeText(req.body?.mode, 20);
      const level = toInt(req.body?.level);
      chart = db.prepare(`
        SELECT id, title, mode, level
        FROM songs
        WHERE title = ?
          AND mode = ?
          AND level = ?
        LIMIT 1
      `).get(songTitle, mode, level);
    }
    if (!chart) return res.status(404).json({ error: 'Chart not found' });

    const user = db.prepare(`
      SELECT id, username, avatar, avatar_v
      FROM users
      WHERE id = ?
    `).get(req.user.id);
    const chartKey = `${normalizeText(chart.title, 160)}|${normalizeText(chart.mode, 40)}|${toInt(chart.level)}`;
    const requestId = uuidv4();
    const avatar = normalizeUserAvatarForList(user?.avatar, req.user.id, 40, user?.avatar_v);

    db.prepare(`
      INSERT INTO live_session_requests (
        id, live_session_id, user_id, username, chart_id, chart_key, song_title, mode, level,
        status, fulfilled, handled_at, handled_by_user_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, '', '', datetime('now'), datetime('now'))
    `).run(requestId, session.id, req.user.id, user?.username || req.user.username || 'User', toInt(chart.id), chartKey, chart.title, chart.mode, toInt(chart.level));

    const messageId = uuidv4();
    db.prepare(`
      INSERT INTO live_session_messages (id, live_session_id, user_id, username, avatar, message, message_type, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, 'request', ?)
    `).run(
      messageId,
      session.id,
      req.user.id,
      user?.username || req.user.username || 'User',
      avatar,
      `/request ${chart.title} (${chart.mode === 'Single' ? 'S' : chart.mode === 'Double' ? 'D' : chart.mode}${toInt(chart.level)})`,
      JSON.stringify({
        request_id: requestId,
        chart_id: toInt(chart.id),
        song_title: chart.title,
        mode: chart.mode,
        level: toInt(chart.level),
      })
    );

    res.status(201).json({
      request: getSessionRequests(db, session.id).find((row) => row.id === requestId) || null,
      message: normalizeMessageRow(getLiveMessageRow(db, messageId)),
    });
    broadcastLiveSessionSnapshot(db, session.id, 'request_created');
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/requests/:requestId/fulfill', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });

    const requestRow = db.prepare(`
      SELECT *
      FROM live_session_requests
      WHERE id = ?
        AND live_session_id = ?
      LIMIT 1
    `).get(req.params.requestId, session.id);
    if (!requestRow) return res.status(404).json({ error: 'Request not found' });

    updateLiveRequestStatus(db, requestRow, 'played', {
      actorUserId: req.user.id,
      emitMessage: normalizeRequestStatus(requestRow.status, toInt(requestRow.fulfilled) === 1) !== 'played',
    });

    const request = getSessionRequests(db, session.id).find((row) => row.id === requestRow.id) || null;
    broadcastLiveSessionSnapshot(db, session.id, 'request_fulfilled');
    res.json({
      request,
      snapshot: buildSessionSnapshot(db, session, req.user.id),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/requests/:requestId/status', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });

    const requestRow = db.prepare(`
      SELECT *
      FROM live_session_requests
      WHERE id = ?
        AND live_session_id = ?
      LIMIT 1
    `).get(req.params.requestId, session.id);
    if (!requestRow) return res.status(404).json({ error: 'Request not found' });

    const requestedStatus = String(req.body?.status || '').trim().toLowerCase();
    if (!['open', 'queued', 'played', 'skipped'].includes(requestedStatus)) {
      return res.status(400).json({ error: 'Invalid request status' });
    }
    const nextStatus = normalizeRequestStatus(requestedStatus, requestedStatus === 'played');

    updateLiveRequestStatus(db, requestRow, nextStatus, {
      actorUserId: req.user.id,
      emitMessage: normalizeRequestStatus(requestRow.status, toInt(requestRow.fulfilled) === 1) !== nextStatus,
    });

    const request = getSessionRequests(db, session.id).find((row) => row.id === requestRow.id) || null;
    broadcastLiveSessionSnapshot(db, session.id, `request_${nextStatus}`);
    res.json({
      request,
      snapshot: buildSessionSnapshot(db, session, req.user.id),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/moderation', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });

    const targetUserId = normalizeText(req.body?.target_user_id, 80);
    if (!targetUserId) return res.status(400).json({ error: 'target_user_id is required' });
    if (String(targetUserId) === String(session.host_user_id || '')) {
      return res.status(400).json({ error: 'The host cannot moderate themself' });
    }

    const targetUser = db.prepare(`
      SELECT id, username
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(targetUserId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const previousState = getLiveModerationState(db, session.id, targetUserId);
    const nextState = {
      chat_muted: req.body?.chat_muted === undefined ? previousState.chat_muted : !!req.body.chat_muted,
      requests_blocked: req.body?.requests_blocked === undefined ? previousState.requests_blocked : !!req.body.requests_blocked,
    };

    if (nextState.chat_muted || nextState.requests_blocked) {
      db.prepare(`
        INSERT INTO live_session_moderation (
          live_session_id, user_id, chat_muted, requests_blocked, moderated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(live_session_id, user_id) DO UPDATE SET
          chat_muted = excluded.chat_muted,
          requests_blocked = excluded.requests_blocked,
          moderated_by_user_id = excluded.moderated_by_user_id,
          updated_at = datetime('now')
      `).run(
        session.id,
        targetUserId,
        nextState.chat_muted ? 1 : 0,
        nextState.requests_blocked ? 1 : 0,
        req.user.id
      );
    } else {
      db.prepare(`
        DELETE FROM live_session_moderation
        WHERE live_session_id = ?
          AND user_id = ?
      `).run(session.id, targetUserId);
    }

    const moderation = getLiveModerationState(db, session.id, targetUserId);
    const announcement = buildModerationAnnouncement(targetUser, previousState, moderation);
    if (announcement) {
      addSystemMessage(
        db,
        session.id,
        announcement,
        'moderation',
        {
          target_user_id: targetUserId,
          chat_muted: moderation.chat_muted,
          requests_blocked: moderation.requests_blocked,
        }
      );
    }

    broadcastLiveSessionSnapshot(db, session.id, 'moderation');
    res.json({
      moderation,
      snapshot: buildSessionSnapshot(db, session, req.user.id),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/messages/:messageId/delete', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);

    const message = db.prepare(`
      SELECT *
      FROM live_session_messages
      WHERE id = ?
        AND live_session_id = ?
      LIMIT 1
    `).get(req.params.messageId, session.id);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (!message.user_id || (message.message_type || '') !== 'chat') {
      return res.status(400).json({ error: 'Only viewer chat messages can be removed' });
    }

    db.prepare(`
      DELETE FROM live_session_messages
      WHERE id = ?
    `).run(message.id);

    broadcastLiveSessionSnapshot(db, session.id, 'message_deleted');
    res.json({
      success: true,
      snapshot: buildSessionSnapshot(db, session, req.user.id),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/votes', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });

    const latestVote = getLatestVoteSnapshot(db, session.id, req.user.id);
    if (latestVote && latestVote.status === 'active') {
      return res.status(400).json({ error: 'There is already an active vote' });
    }

    const modeFilter = normalizeText(req.body?.mode_filter || 'All', 12) || 'All';
    const singleLevel = toInt(req.body?.level);
    const minLevel = singleLevel > 0 ? singleLevel : Math.max(1, toInt(req.body?.min_level) || 1);
    const maxLevel = singleLevel > 0 ? singleLevel : Math.max(minLevel, toInt(req.body?.max_level) || minLevel);
    const options = getChartsForVote(db, modeFilter, minLevel, maxLevel);
    if (options.length < 3) {
      return res.status(400).json({ error: 'Not enough charts available for that vote filter' });
    }

    const voteId = uuidv4();
    db.prepare(`
      INSERT INTO live_session_votes (
        id, live_session_id, host_user_id, mode_filter, min_level, max_level, status, pinned_message_id,
        ends_at, winning_option_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', '', datetime('now', ?), '', datetime('now'), datetime('now'))
    `).run(voteId, session.id, req.user.id, modeFilter, minLevel, maxLevel, `+${VOTE_DURATION_SECONDS} seconds`);

    const insertOption = db.prepare(`
      INSERT INTO live_session_vote_options (id, vote_id, chart_id, chart_key, song_title, mode, level, jacket_url, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const option of options) {
      insertOption.run(
        option.id,
        voteId,
        option.chart_id,
        option.chart_key,
        option.song_title,
        option.mode,
        option.level,
        option.jacket_url,
        option.position
      );
    }

    const pinnedMessageId = addSystemMessage(
      db,
      session.id,
      `Vote open: choose the next chart. ${modeFilter} Lv.${minLevel}${maxLevel !== minLevel ? `-${maxLevel}` : ''}. Poll closes in ${VOTE_DURATION_SECONDS} seconds.`,
      'vote',
      { vote_id: voteId }
    );
    db.prepare(`
      UPDATE live_session_votes
      SET pinned_message_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(pinnedMessageId, voteId);
    scheduleVoteClose(db, voteId);
    broadcastLiveSessionSnapshot(db, session.id, 'vote_created');

    res.status(201).json({ vote: getVoteSnapshot(db, voteId, req.user.id) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/votes/:voteId/cast', requireAuth, (req, res) => {
  try {
    const db = getDb();
    let vote = getVoteSnapshot(db, req.params.voteId, req.user.id);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.status !== 'active') return res.status(400).json({ error: 'Vote is closed' });
    if (String(vote.host_user_id || '') === String(req.user.id || '')) {
      return res.status(403).json({ error: 'Host cannot cast a vote' });
    }

    const session = requireLiveSession(db, vote.live_session_id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });

    const endsAtMs = vote.ends_at ? Date.parse(`${vote.ends_at}Z`) : NaN;
    if (Number.isFinite(endsAtMs) && Date.now() >= endsAtMs) {
      vote = closeVote(db, vote.id, { currentUserId: req.user.id });
      return res.status(400).json({ error: 'Vote is closed', vote });
    }

    const optionId = normalizeText(req.body?.option_id, 80);
    const validOption = vote.options.find((option) => option.id === optionId);
    if (!validOption) return res.status(400).json({ error: 'Invalid vote option' });

    db.prepare(`
      INSERT INTO live_session_vote_ballots (vote_id, option_id, user_id, created_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(vote_id, user_id) DO UPDATE SET
        option_id = excluded.option_id,
        created_at = datetime('now')
    `).run(vote.id, optionId, req.user.id);
    broadcastLiveSessionSnapshot(db, vote.live_session_id, 'vote_updated');

    res.json({ vote: getVoteSnapshot(db, vote.id, req.user.id) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/end', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    let session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has already ended' });
    if (typeof syncRecentlyPlayedForUser !== 'function' || typeof insertGroupedNewClearPost !== 'function') {
      throw new Error('Live session dependencies unavailable');
    }

    const syncResult = await syncRecentlyPlayedForUser(req.user, { db, persistActivityPosts: false });
    applyLiveSyncResult(db, session, syncResult);

    const latestVote = getLatestVoteSnapshot(db, session.id, req.user.id);
    if (latestVote && latestVote.status === 'active') {
      closeVote(db, latestVote.id, { currentUserId: req.user.id, emitMessage: false, broadcast: false });
    }

    const host = getHostProfile(db, session.host_user_id);
    const plays = getSessionPlays(db, session.id);
    const viewerCount = getViewerCount(db, session);
    const viewerPeak = updateViewerPeak(db, session.id, viewerCount);
    const messageCount = getSessionMessageCount(db, session.id);
    const summary = buildLiveSessionSummary(plays, host || {}, {
      viewerCount,
      viewerPeak,
      messageCount,
      streamUrl: session.stream_url,
      hostUsername: host?.username || '',
    });

    const bufferedUpscores = parseBufferedRows(db, session.id, 'live_session_buffered_upscores');
    const bufferedClears = parseBufferedRows(db, session.id, 'live_session_buffered_clears');
    const upscoreGain = bufferedUpscores.reduce((sum, row) => sum + toInt(row?.pumbility_gain), 0);
    const singlesUpscoreGain = bufferedUpscores.reduce((sum, row) => sum + toInt(row?.singles_pumbility_gain), 0);
    const clearGain = bufferedClears.reduce((sum, row) => sum + toInt(row?.pumbility_gain), 0);
    const singlesClearGain = bufferedClears.reduce((sum, row) => sum + toInt(row?.singles_pumbility_gain), 0);
    const clearCount = bufferedClears.filter((row) => String(row?.entry_type || 'song_clear') !== 'title_unlock').length;
    const titleCount = bufferedClears.length - clearCount;

    let upscorePostId = null;
    let clearPostId = null;
    let summaryPostId = null;

    const txn = db.transaction(() => {
      if (bufferedUpscores.length > 0) {
        const result = db.prepare(`
          INSERT INTO user_upscores (user_id, upscores_json, pumbility_gain, singles_pumbility_gain, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(session.host_user_id, JSON.stringify(bufferedUpscores), upscoreGain, singlesUpscoreGain);
        upscorePostId = result.lastInsertRowid;
      }

      if (bufferedClears.length > 0) {
        clearPostId = insertGroupedNewClearPost(db, session.host_user_id, bufferedClears, {
          pumbilityGain: clearGain,
          singlesPumbilityGain: singlesClearGain,
        });
      }

      if (summary) {
        const result = db.prepare(`
          INSERT INTO user_posts (user_id, content, images, youtube_url, comments_disabled, created_at)
          VALUES (?, ?, '[]', ?, 0, datetime('now'))
        `).run(session.host_user_id, buildSummaryPostContent(summary), session.stream_url || '');
        summaryPostId = result.lastInsertRowid;
      }

      db.prepare(`
        UPDATE live_sessions
        SET status = 'ended',
            ended_at = datetime('now'),
            viewer_peak = CASE WHEN viewer_peak < ? THEN ? ELSE viewer_peak END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(viewerPeak, viewerPeak, session.id);

      db.prepare('DELETE FROM live_session_presence WHERE live_session_id = ?').run(session.id);
    });
    txn();
    clearLiveSyncTimer(session.id);

    if (typeof invalidateRecentActivityCache === 'function' && (upscorePostId || clearPostId || summaryPostId)) {
      invalidateRecentActivityCache();
    }

    const actorUsername = host?.username || req.user.username || 'Someone';
    const profileLink = buildProfilePath(actorUsername) || `/profile/${session.host_user_id}`;

    if (bufferedUpscores.length > 0) {
      notifyActivitySubscribers(db, {
        actorUserId: session.host_user_id,
        actorUsername,
        activityType: 'upscores',
        notificationType: 'followed_user_upscore',
        title: 'New Upscores',
        message: `${actorUsername} posted ${bufferedUpscores.length} new upscore${bufferedUpscores.length === 1 ? '' : 's'}`,
        link: upscorePostId ? `/upscore/${upscorePostId}` : profileLink,
      });
    }

    if (clearCount > 0) {
      notifyActivitySubscribers(db, {
        actorUserId: session.host_user_id,
        actorUsername,
        activityType: 'new_clears',
        notificationType: 'followed_user_new_clear',
        title: 'New Clears',
        message: `${actorUsername} posted ${clearCount} new clear${clearCount === 1 ? '' : 's'}`,
        link: clearPostId ? `/clear/${clearPostId}` : profileLink,
      });
    }

    if (titleCount > 0) {
      notifyActivitySubscribers(db, {
        actorUserId: session.host_user_id,
        actorUsername,
        activityType: 'new_clears',
        notificationType: 'followed_user_new_title',
        title: 'Title Earned',
        message: `${actorUsername} earned ${titleCount} new title${titleCount === 1 ? '' : 's'}`,
        link: clearPostId ? `/clear/${clearPostId}` : profileLink,
      });
    }

    if (summaryPostId) {
      notifyActivitySubscribers(db, {
        actorUserId: session.host_user_id,
        actorUsername,
        activityType: 'posts',
        notificationType: 'followed_user_post',
        title: 'Shinsa Live Recap',
        message: `${actorUsername} wrapped up a live session`,
        link: `/post/${summaryPostId}`,
      });
    }

    session = requireLiveSession(db, req.params.id);
    broadcastLiveSessionSnapshot(db, session.id, 'session_ended');
    res.json({
      success: true,
      upscore_post_id: upscorePostId,
      clear_post_id: clearPostId,
      summary_post_id: summaryPostId,
      summary,
      session: normalizeSessionPayload(session, host, 0, req.user.id),
    });
  } catch (err) {
    console.error('End live session error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

function scheduleActiveVoteClosures() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id
    FROM live_session_votes
    WHERE status = 'active'
  `).all();
  for (const row of rows) {
    scheduleVoteClose(db, row.id);
  }
}

function scheduleActiveLiveSessionSyncs() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id
    FROM live_sessions
    WHERE status = 'live'
  `).all();
  for (const row of rows) {
    ensureLiveSyncTimer(db, row.id);
  }
}

try {
  scheduleActiveVoteClosures();
} catch (err) {
  console.error('Live vote timer initialization error:', err.message);
}

try {
  scheduleActiveLiveSessionSyncs();
} catch (err) {
  console.error('Live sync timer initialization error:', err.message);
}

module.exports = router;

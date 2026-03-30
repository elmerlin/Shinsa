const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { getDb, SYSTEM_USER_ID } = require('../db/schema');
const { requireAuth, optionalAuth } = require('./auth');
const { findMentionedUsers, notifyMentionedUsers } = require('../lib/mentions');
const { createUserNotification } = require('../lib/notifications');
const {
  getActivitySubscription,
  setActivitySubscription,
  notifyActivitySubscribers,
  buildProfilePath,
} = require('../lib/activitySubscriptions');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');
const { checkPumpAchievements } = require('../lib/achievements');
const { parseLiveSessionMarker } = require('../lib/liveSessionMarker');
const {
  getSessionInteractionCounts,
  getSessionMessageCount,
  parseSqliteDateTime,
} = require('../lib/liveSessionMetrics');
const {
  enrichClearRecord,
  enrichUpscoreRecord,
} = require('../lib/activityPostEnrichment');

const SHARE_MARKER_PREFIX = '[[SHINSA_SHARE_V1:';
const SHARE_MARKER_SUFFIX = ']]';
const SHARE_MARKER_REGEX = /\[\[SHINSA_SHARE_V1:([A-Za-z0-9+/=_-]+)\]\]/;

// Helper: create notification (don't notify yourself)
function createNotification(db, userId, type, title, message, link) {
  if (!userId) return null;
  return createUserNotification(db, userId, type, title, message || '', link || '');
}

function parseBooleanInput(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function stripSessionSummaryMarkers(text) {
  return String(text || '')
    .replace(/\[\[SHINSA_WC_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_WC_PERSONAL_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_SHARE_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_LIVE_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_SESSION_PLAN_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .trim();
}

function textSnippet(text, max = 80) {
  const compact = stripSessionSummaryMarkers(text).replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

const RECENT_ACTIVITY_TTL_MS = 30 * 1000;
let recentActivityCache = { data: null, expiresAt: 0 };

function readRecentActivityCache() {
  if (!recentActivityCache.data) return null;
  if (Date.now() >= recentActivityCache.expiresAt) {
    recentActivityCache = { data: null, expiresAt: 0 };
    return null;
  }
  return recentActivityCache.data;
}

function writeRecentActivityCache(data) {
  recentActivityCache = {
    data,
    expiresAt: Date.now() + RECENT_ACTIVITY_TTL_MS,
  };
}

function invalidateRecentActivityCache() {
  recentActivityCache = { data: null, expiresAt: 0 };
}

function normalizePumpUserRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, row.id, 40),
  }));
}

function normalizeCommentUserRows(rows = [], size = 40) {
  return rows.map((row) => ({
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, row.user_id, size, row.avatar_v),
  }));
}

function normalizeComparableUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return raw.replace(/\/$/, '').toLowerCase();
  }
}

function parseSessionShareMarker(content) {
  const raw = String(content || '');
  const match = raw.match(SHARE_MARKER_REGEX);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function serializeSessionShareMarker(share) {
  const encoded = Buffer.from(JSON.stringify(share || {}), 'utf8').toString('base64');
  return `${SHARE_MARKER_PREFIX}${encoded}${SHARE_MARKER_SUFFIX}`;
}

function extractYoutubeVideoId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  );
  if (match?.[1]) return match[1];
  return /^[a-zA-Z0-9_-]{11}$/.test(raw) ? raw : '';
}

function buildShoeLabel(row) {
  const make = String(row?.shoe_make || '').trim();
  const model = String(row?.shoe_model || '').trim();
  const colorway = String(row?.shoe_colorway || '').trim();
  const normalizedLabel = `${make} ${model}`.replace(/\s+/g, ' ').trim();
  const fallbackLabel = row?.shoe_id ? `Shoe #${toInt(row.shoe_id) || row.shoe_id}` : '';
  if (!normalizedLabel) return fallbackLabel;
  return colorway ? `${normalizedLabel} (${colorway})` : normalizedLabel;
}

function getSessionShoeLabel(db, sessionId) {
  if (!sessionId) return '';
  const rows = db.prepare(`
    SELECT
      p.shoe_id,
      COALESCE(NULLIF(p.shoe_make, ''), COALESCE(s.make, '')) AS shoe_make,
      COALESCE(NULLIF(p.shoe_model, ''), COALESCE(s.model, '')) AS shoe_model,
      COALESCE(NULLIF(p.shoe_colorway, ''), COALESCE(s.colorway, '')) AS shoe_colorway
    FROM live_session_plays p
    LEFT JOIN user_shoes s ON s.id = p.shoe_id
    WHERE live_session_id = ?
  `).all(sessionId);
  if (rows.length === 0) return '';

  const shoeCounts = new Map();
  for (const row of rows) {
    const shoeLabel = buildShoeLabel(row);
    if (!shoeLabel) continue;
    shoeCounts.set(shoeLabel, (shoeCounts.get(shoeLabel) || 0) + 1);
  }
  if (shoeCounts.size === 0) return '';

  const topShoe = Array.from(shoeCounts.entries())
    .sort((a, b) => b[1] - a[1])[0];
  if (!topShoe) return '';
  return shoeCounts.size > 1 ? `${topShoe[0]} (+${shoeCounts.size - 1} more)` : topShoe[0];
}

function findMatchingEndedLiveSession(db, post, liveSummary) {
  const directSessionId = String(liveSummary?.sessionId || '').trim();
  if (directSessionId) {
    const session = db.prepare(`
      SELECT ls.id, ls.host_user_id, ls.title, ls.stream_url, ls.ended_at, ls.updated_at, ls.created_at
      FROM live_sessions ls
      WHERE ls.id = ?
        AND (
          ls.host_user_id = ?
          OR EXISTS (
            SELECT 1
            FROM live_session_participants part
            WHERE part.live_session_id = ls.id
              AND part.user_id = ?
              AND part.role = 'cohost'
          )
        )
      LIMIT 1
    `).get(directSessionId, post.user_id, post.user_id);
    if (session) return session;
  }

  const candidates = db.prepare(`
    SELECT ls.id, ls.host_user_id, ls.title, ls.stream_url, ls.ended_at, ls.updated_at, ls.created_at
    FROM live_sessions ls
    WHERE ls.status = 'ended'
      AND (
        ls.host_user_id = ?
        OR EXISTS (
          SELECT 1
          FROM live_session_participants part
          WHERE part.live_session_id = ls.id
            AND part.user_id = ?
            AND part.role = 'cohost'
        )
      )
    ORDER BY datetime(COALESCE(NULLIF(ls.ended_at, ''), ls.updated_at, ls.created_at)) DESC, ls.id DESC
    LIMIT 24
  `).all(post.user_id, post.user_id);
  if (candidates.length === 0) return null;

  const targetUrl = normalizeComparableUrl(liveSummary?.streamUrl || post.youtube_url || '');
  const postCreatedAt = parseSqliteDateTime(post.created_at);
  const postCreatedAtMs = postCreatedAt ? postCreatedAt.getTime() : NaN;

  let best = null;
  for (const session of candidates) {
    const streamMatch = targetUrl && normalizeComparableUrl(session.stream_url) === targetUrl;
    const endedAt = parseSqliteDateTime(session.ended_at || session.updated_at || session.created_at);
    const diff = endedAt && Number.isFinite(postCreatedAtMs)
      ? Math.abs(endedAt.getTime() - postCreatedAtMs)
      : Number.MAX_SAFE_INTEGER;

    if (!best) {
      best = { session, streamMatch, diff };
      continue;
    }

    if (streamMatch && !best.streamMatch) {
      best = { session, streamMatch, diff };
      continue;
    }
    if (streamMatch === best.streamMatch && diff < best.diff) {
      best = { session, streamMatch, diff };
    }
  }

  if (!best) return null;
  if (best.streamMatch) return best.session;
  return best.diff <= 12 * 60 * 60 * 1000 ? best.session : null;
}

function getLiveSummaryPostMeta(db, session, post) {
  const fallbackUsername = String(post?.username || '').trim();
  const postUserId = String(post?.user_id || '').trim();
  if (!session?.id || !postUserId) {
    return {
      hostUsername: fallbackUsername,
      participantRole: '',
    };
  }

  if (String(session.host_user_id || '') === postUserId) {
    return {
      hostUsername: fallbackUsername,
      participantRole: 'owner',
    };
  }

  const participant = db.prepare(`
    SELECT COALESCE(role, '') AS role
    FROM live_session_participants
    WHERE live_session_id = ?
      AND user_id = ?
    LIMIT 1
  `).get(session.id, postUserId);

  return {
    hostUsername: fallbackUsername,
    participantRole: String(participant?.role || '').trim(),
  };
}

function enrichPostWithSessionShareData(db, post) {
  if (!post?.content) return post;
  const share = parseSessionShareMarker(post.content);
  if (!share || !Array.isArray(share.rows) || share.rows.length === 0) return post;

  let changed = false;
  const rows = share.rows.map((row) => {
    const enriched = enrichSessionShareRow(db, post.user_id, post.created_at, row);
    if (!changed && JSON.stringify(enriched) !== JSON.stringify(row)) {
      changed = true;
    }
    return enriched;
  });

  if (changed) {
    post.content = String(post.content).replace(
      SHARE_MARKER_REGEX,
      serializeSessionShareMarker({ ...share, rows })
    );
  }
  return post;
}

function enrichPostWithLiveSummaryMetrics(db, post) {
  enrichPostWithSessionShareData(db, post);
  if (!post?.content) return post;
  const liveSummary = parseLiveSessionMarker(post.content);
  if (!liveSummary) return post;

  const session = findMatchingEndedLiveSession(db, post, liveSummary);
  if (!session) return post;

  const interactionCounts = getSessionInteractionCounts(db, session.id);
  const postMeta = getLiveSummaryPostMeta(db, session, post);
  post.live_summary_metrics = {
    sessionId: session.id,
    sessionTitle: String(session.title || '').trim(),
    sessionShoeLabel: getSessionShoeLabel(db, session.id),
    messageCount: getSessionMessageCount(db, session.id),
    requestPlayCount: interactionCounts.requestPlayCount,
    votedSongPlayCount: interactionCounts.votedSongPlayCount,
    interactions: interactionCounts.interactions,
    hostUsername: postMeta.hostUsername || String(liveSummary.hostUsername || '').trim(),
    participantRole: postMeta.participantRole || String(liveSummary.participantRole || '').trim(),
  };
  return post;
}

function enrichPostsWithLiveSummaryMetrics(db, posts = []) {
  for (const post of posts) enrichPostWithLiveSummaryMetrics(db, post);
  return posts;
}

function toInt(value) {
  const numeric = parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeParseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasJudgmentData(entry) {
  return (
    toInt(entry?.perfect) > 0 ||
    toInt(entry?.great) > 0 ||
    toInt(entry?.good) > 0 ||
    toInt(entry?.bad) > 0 ||
    toInt(entry?.miss) > 0
  );
}

let recentPlayJudgmentsBeforeStmt = null;
let recentPlayJudgmentsAnyStmt = null;
let recentPlayMetadataBeforeStmt = null;
let recentPlayMetadataAnyStmt = null;
let sessionReplayLinkStmt = null;

function getRecentPlayJudgmentsBeforeStmt(db) {
  if (!recentPlayJudgmentsBeforeStmt) {
    recentPlayJudgmentsBeforeStmt = db.prepare(`
      SELECT id AS play_id, perfect, great, good, bad, miss, max_combo, plate, background_url, date_played, played_at_utc, over_top100_rank, machine_name
      FROM user_recently_played
      WHERE user_id = ?
        AND song_title = ?
        AND mode = ?
        AND level = ?
        AND score = ?
        AND (
          COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
        ) > 0
        AND datetime(COALESCE(date_played, '')) <= datetime(?)
      ORDER BY
        datetime(COALESCE(date_played, '1970-01-01')) DESC,
        (
          COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
        ) DESC,
        id DESC
      LIMIT 1
    `);
  }
  return recentPlayJudgmentsBeforeStmt;
}

function getRecentPlayJudgmentsAnyStmt(db) {
  if (!recentPlayJudgmentsAnyStmt) {
    recentPlayJudgmentsAnyStmt = db.prepare(`
      SELECT id AS play_id, perfect, great, good, bad, miss, max_combo, plate, background_url, date_played, played_at_utc, over_top100_rank, machine_name
      FROM user_recently_played
      WHERE user_id = ?
        AND song_title = ?
        AND mode = ?
        AND level = ?
        AND score = ?
        AND (
          COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
        ) > 0
      ORDER BY
        datetime(COALESCE(date_played, '1970-01-01')) DESC,
        (
          COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
        ) DESC,
        id DESC
      LIMIT 1
    `);
  }
  return recentPlayJudgmentsAnyStmt;
}

function getRecentPlayMetadataBeforeStmt(db) {
  if (!recentPlayMetadataBeforeStmt) {
    recentPlayMetadataBeforeStmt = db.prepare(`
      SELECT
        id AS play_id, perfect, great, good, bad, miss, max_combo, background_url, date_played, played_at_utc, over_top100_rank,
        replay_embed_url, replay_video_id, replay_start_seconds, replay_end_seconds, machine_name
      FROM user_recently_played
      WHERE user_id = ?
        AND song_title = ?
        AND mode = ?
        AND level = ?
        AND score = ?
        AND datetime(COALESCE(date_played, '')) <= datetime(?)
      ORDER BY
        datetime(COALESCE(date_played, '1970-01-01')) DESC,
        id DESC
      LIMIT 1
    `);
  }
  return recentPlayMetadataBeforeStmt;
}

function getRecentPlayMetadataAnyStmt(db) {
  if (!recentPlayMetadataAnyStmt) {
    recentPlayMetadataAnyStmt = db.prepare(`
      SELECT
        id AS play_id, perfect, great, good, bad, miss, max_combo, background_url, date_played, played_at_utc, over_top100_rank,
        replay_embed_url, replay_video_id, replay_start_seconds, replay_end_seconds, machine_name
      FROM user_recently_played
      WHERE user_id = ?
        AND song_title = ?
        AND mode = ?
        AND level = ?
        AND score = ?
      ORDER BY
        datetime(COALESCE(date_played, '1970-01-01')) DESC,
        id DESC
      LIMIT 1
    `);
  }
  return recentPlayMetadataAnyStmt;
}

function getSessionReplayLinkStmt(db) {
  if (!sessionReplayLinkStmt) {
    sessionReplayLinkStmt = db.prepare(`
      SELECT COALESCE(NULLIF(yt.session_youtube_url, ''), '') AS replay_embed_url
      FROM songs chart
      LEFT JOIN user_chart_youtube_links yt
        ON yt.user_id = ?
       AND yt.chart_id = chart.id
      WHERE chart.title = ?
        AND chart.mode = ?
        AND chart.level = ?
      ORDER BY chart.id ASC
      LIMIT 1
    `);
  }
  return sessionReplayLinkStmt;
}

function findRecentPlayJudgments(db, { userId, createdAt, songTitle, mode, level, score }) {
  if (!userId || !songTitle || !mode) return null;
  const numericLevel = toInt(level);
  const numericScore = toInt(score);
  if (numericLevel <= 0 || numericScore <= 0) return null;

  if (createdAt) {
    const datedMatch = getRecentPlayJudgmentsBeforeStmt(db).get(
      userId,
      songTitle,
      mode,
      numericLevel,
      numericScore,
      createdAt
    );
    if (datedMatch) return datedMatch;
  }

  return getRecentPlayJudgmentsAnyStmt(db).get(userId, songTitle, mode, numericLevel, numericScore) || null;
}

function findRecentPlayMetadata(db, { userId, createdAt, songTitle, mode, level, score }) {
  if (!userId || !songTitle || !mode) return null;
  const numericLevel = toInt(level);
  const numericScore = toInt(score);
  if (numericLevel <= 0 || numericScore <= 0) return null;

  if (createdAt) {
    const datedMatch = getRecentPlayMetadataBeforeStmt(db).get(
      userId,
      songTitle,
      mode,
      numericLevel,
      numericScore,
      createdAt
    );
    if (datedMatch) return datedMatch;
  }

  return getRecentPlayMetadataAnyStmt(db).get(userId, songTitle, mode, numericLevel, numericScore) || null;
}

function findSessionReplayLink(db, { userId, songTitle, mode, level }) {
  if (!userId || !songTitle || !mode) return null;
  const numericLevel = toInt(level);
  if (numericLevel <= 0) return null;
  const row = getSessionReplayLinkStmt(db).get(userId, songTitle, mode, numericLevel) || null;
  const replayEmbedUrl = String(row?.replay_embed_url || '').trim();
  if (!replayEmbedUrl) return null;
  return {
    replay_embed_url: replayEmbedUrl,
    replay_video_id: extractYoutubeVideoId(replayEmbedUrl),
  };
}

function enrichEntryWithJudgments(db, userId, createdAt, entry, scoreKey = 'score') {
  if (!entry) return entry;

  const needsJudgments = !hasJudgmentData(entry);
  const needsMachine = !String(entry.machine_name || '').trim();
  const needsPlayId = !entry.play_id;

  if (!needsJudgments && !needsMachine && !needsPlayId) return entry;

  const lookup = findRecentPlayJudgments(db, {
    userId,
    createdAt,
    songTitle: entry.song_title,
    mode: entry.mode,
    level: entry.level,
    score: entry[scoreKey],
  });
  if (!lookup) return entry;

  if (needsJudgments) {
    return {
      ...entry,
      perfect: toInt(lookup.perfect),
      great: toInt(lookup.great),
      good: toInt(lookup.good),
      bad: toInt(lookup.bad),
      miss: toInt(lookup.miss),
      max_combo: Math.max(toInt(entry.max_combo), toInt(lookup.max_combo)),
      plate: entry.plate || lookup.plate || '',
      background_url: entry.background_url || lookup.background_url || '',
      over_top100_rank: toInt(entry.over_top100_rank) || toInt(lookup.over_top100_rank),
      machine_name: entry.machine_name || lookup.machine_name || '',
      played_at_utc: entry.played_at_utc || lookup.played_at_utc || '',
      play_id: entry.play_id || lookup.play_id || null,
    };
  }

  // Already has judgments, just enrich machine_name + played_at_utc + play_id
  return {
    ...entry,
    machine_name: lookup.machine_name || '',
    played_at_utc: entry.played_at_utc || lookup.played_at_utc || '',
    play_id: entry.play_id || lookup.play_id || null,
  };
}

function enrichSessionShareRow(db, userId, createdAt, row) {
  if (!row) return row;
  const needsLookup = (
    !hasJudgmentData(row) ||
    toInt(row.over_top100_rank) <= 0 ||
    !String(row.jacket_url || '').trim() ||
    !String(row.date_played || '').trim() ||
    !String(row.replay_embed_url || '').trim() ||
    !row.play_id
  );
  if (!needsLookup) return row;

  const lookup = findRecentPlayMetadata(db, {
    userId,
    createdAt,
    songTitle: row.song_title,
    mode: row.mode,
    level: row.level,
    score: row.score,
  });

  const replay = String(row.replay_embed_url || '').trim()
    ? {
        replay_embed_url: String(row.replay_embed_url || '').trim(),
        replay_video_id: String(row.replay_video_id || '').trim() || extractYoutubeVideoId(row.replay_embed_url),
      }
    : findSessionReplayLink(db, {
        userId,
        songTitle: row.song_title,
        mode: row.mode,
        level: row.level,
      });

  if (!lookup && !replay) return row;

  return {
    ...row,
    perfect: toInt(row.perfect) || toInt(lookup?.perfect),
    great: toInt(row.great) || toInt(lookup?.great),
    good: toInt(row.good) || toInt(lookup?.good),
    bad: toInt(row.bad) || toInt(lookup?.bad),
    miss: toInt(row.miss) || toInt(lookup?.miss),
    max_combo: Math.max(toInt(row.max_combo), toInt(lookup?.max_combo)),
    over_top100_rank: toInt(row.over_top100_rank) || toInt(lookup?.over_top100_rank),
    jacket_url: row.jacket_url || lookup?.background_url || '',
    date_played: row.date_played || lookup?.date_played || '',
    replay_embed_url: String(row.replay_embed_url || '').trim()
      || String(lookup?.replay_embed_url || '').trim()
      || replay?.replay_embed_url
      || '',
    replay_video_id: String(row.replay_video_id || '').trim()
      || String(lookup?.replay_video_id || '').trim()
      || replay?.replay_video_id
      || '',
    replay_start_seconds: toInt(row.replay_start_seconds) || toInt(lookup?.replay_start_seconds),
    replay_end_seconds: toInt(row.replay_end_seconds) || toInt(lookup?.replay_end_seconds),
    machine_name: row.machine_name || lookup?.machine_name || '',
    play_id: row.play_id || lookup?.play_id || null,
  };
}

function enrichUpscoreRow(db, upscore) {
  return enrichUpscoreRecord(db, upscore);
}

function buildClearFallbackItem(clear) {
  if (!clear?.song_title || !clear?.mode || !toInt(clear?.level)) return null;
  return {
    entry_type: 'song_clear',
    song_title: clear.song_title,
    mode: clear.mode,
    level: toInt(clear.level),
    score: toInt(clear.score),
    grade: clear.grade || '',
    plate: clear.plate || '',
    background_url: clear.background_url || '',
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
    pumbility_gain: toInt(clear.pumbility_gain),
    singles_pumbility_gain: toInt(clear.singles_pumbility_gain),
    over_top100_rank: toInt(clear.over_top100_rank),
  };
}

function enrichClearRow(db, clear) {
  return enrichClearRecord(db, clear);
}

function enrichWeeklyChallengePlayItem(db, userId, createdAt, play) {
  if (!play) return play;

  const needsLookup = (
    !hasJudgmentData(play) ||
    !String(play.background_url || '').trim() ||
    !String(play.date_played || '').trim() ||
    !String(play.replay_embed_url || '').trim() ||
    !String(play.played_at_utc || '').trim() ||
    !String(play.machine_name || '').trim() ||
    !play.play_id
  );

  const lookup = needsLookup
    ? findRecentPlayMetadata(db, {
        userId,
        createdAt,
        songTitle: play.song_title,
        mode: play.mode,
        level: play.level,
        score: play.score,
      })
    : null;

  const replay = String(play.replay_embed_url || '').trim()
    ? {
        replay_embed_url: String(play.replay_embed_url || '').trim(),
        replay_video_id: String(play.replay_video_id || '').trim() || extractYoutubeVideoId(play.replay_embed_url),
      }
    : (
        String(lookup?.replay_embed_url || '').trim()
          ? {
              replay_embed_url: String(lookup.replay_embed_url || '').trim(),
              replay_video_id: String(lookup.replay_video_id || '').trim() || extractYoutubeVideoId(lookup.replay_embed_url),
            }
          : findSessionReplayLink(db, {
              userId,
              songTitle: play.song_title,
              mode: play.mode,
              level: play.level,
            })
      );

  if (!lookup && !replay) return play;

  return {
    ...play,
    perfect: toInt(play.perfect) || toInt(lookup?.perfect),
    great: toInt(play.great) || toInt(lookup?.great),
    good: toInt(play.good) || toInt(lookup?.good),
    bad: toInt(play.bad) || toInt(lookup?.bad),
    miss: toInt(play.miss) || toInt(lookup?.miss),
    max_combo: Math.max(toInt(play.max_combo), toInt(lookup?.max_combo)),
    plate: play.plate || lookup?.plate || '',
    background_url: play.background_url || lookup?.background_url || '',
    over_top100_rank: toInt(play.over_top100_rank) || toInt(lookup?.over_top100_rank),
    date_played: play.date_played || lookup?.date_played || '',
    replay_embed_url: String(play.replay_embed_url || '').trim()
      || replay?.replay_embed_url
      || '',
    replay_video_id: String(play.replay_video_id || '').trim()
      || replay?.replay_video_id
      || '',
    replay_start_seconds: toInt(play.replay_start_seconds) || toInt(lookup?.replay_start_seconds),
    replay_end_seconds: toInt(play.replay_end_seconds) || toInt(lookup?.replay_end_seconds),
    machine_name: play.machine_name || lookup?.machine_name || '',
    played_at_utc: play.played_at_utc || lookup?.played_at_utc || '',
    play_id: play.play_id || lookup?.play_id || null,
  };
}

function buildWeeklyChallengeTotalsMap(db, wcPlays = []) {
  const pairs = [];
  const seenPairs = new Set();
  for (const play of wcPlays) {
    const userId = String(play?.user_id || '').trim();
    const weekId = toInt(play?.week_id);
    if (!userId || weekId <= 0) continue;
    const pairKey = `${userId}:${weekId}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    pairs.push({ userId, weekId, pairKey });
  }

  if (pairs.length === 0) return new Map();

  const whereClause = pairs.map(() => '(user_id = ? AND week_id = ?)').join(' OR ');
  const rows = db.prepare(`
    SELECT user_id, week_id, plays_json
    FROM user_weekly_challenge_plays
    WHERE ${whereClause}
  `).all(...pairs.flatMap((pair) => [pair.userId, pair.weekId]));

  const bestByPair = new Map();
  for (const row of rows) {
    const pairKey = `${row.user_id}:${toInt(row.week_id)}`;
    let bestByChart = bestByPair.get(pairKey);
    if (!bestByChart) {
      bestByChart = new Map();
      bestByPair.set(pairKey, bestByChart);
    }

    for (const play of safeParseJsonArray(row.plays_json)) {
      const chartKey = `${play.song_title}|${play.mode}|${toInt(play.level)}`;
      const previous = bestByChart.get(chartKey);
      if (!previous || toInt(play.rating_points) > toInt(previous.rating_points)) {
        bestByChart.set(chartKey, play);
      }
    }
  }

  const totals = new Map();
  for (const pair of pairs) {
    const bestByChart = bestByPair.get(pair.pairKey) || new Map();
    totals.set(pair.pairKey, {
      total_rating_points: Array.from(bestByChart.values()).reduce((sum, play) => sum + toInt(play.rating_points), 0),
      total_charts_played: bestByChart.size,
    });
  }
  return totals;
}

// Multer config for image uploads (memory-only, images stored as base64 in DB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB upload limit (will be compressed)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif', 'image/avif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── Follows ──────────────────────────────────────────

// POST /api/social/follow/:userId — follow a user
router.post('/follow/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const followingId = req.params.userId;

  if (followingId === req.user.id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(followingId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  try {
    const result = db.prepare('INSERT OR IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, followingId);
    // Send notification only if this is a new follow (not a duplicate)
    if (result.changes > 0) {
      const follower = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
      createNotification(
        db,
        followingId,
        'new_follower',
        'New Follower',
        `${follower?.username || 'Someone'} started following you`,
        buildProfilePath(follower?.username) || `/profile/${req.user.id}`
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/social/follow/:userId — unfollow a user
router.delete('/follow/:userId', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, req.params.userId);
  res.json({ success: true });
});

// GET /api/social/following/:userId — list who a user follows
router.get('/following/:userId', (req, res) => {
  const db = getDb();
  const following = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.avatar_v, u.pumbility, u.skill_title, u.nationality
    FROM user_follows f
    JOIN users u ON f.following_id = u.id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.userId);
  for (const u of following) {
    u.avatar = normalizeUserAvatarForList(u.avatar, u.id, 48, u.avatar_v);
  }
  res.json(following);
});

// GET /api/social/followers/:userId — list a user's followers
router.get('/followers/:userId', (req, res) => {
  const db = getDb();
  const followers = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.avatar_v, u.pumbility, u.skill_title, u.nationality
    FROM user_follows f
    JOIN users u ON f.follower_id = u.id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.userId);
  for (const u of followers) {
    u.avatar = normalizeUserAvatarForList(u.avatar, u.id, 48, u.avatar_v);
  }
  res.json(followers);
});

// GET /api/social/follow-status/:userId — check if current user follows target
router.get('/follow-status/:userId', optionalAuth, (req, res) => {
  const db = getDb();
  if (!req.user) return res.json({ following: false, followers_count: 0, following_count: 0 });

  const result = db.prepare(`
    SELECT
      (SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?) as is_following,
      (SELECT COUNT(*) FROM user_follows WHERE following_id = ?) as followers_count,
      (SELECT COUNT(*) FROM user_follows WHERE follower_id = ?) as following_count
  `).get(req.user.id, req.params.userId, req.params.userId, req.params.userId);

  res.json({
    following: !!result.is_following,
    followers_count: result.followers_count,
    following_count: result.following_count,
  });
});

// GET /api/social/activity-notifications/:userId — get current user's activity notif prefs for target user
router.get('/activity-notifications/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const targetUserId = req.params.userId;

  if (!targetUserId) return res.status(400).json({ error: 'User ID is required' });
  if (targetUserId === req.user.id) {
    return res.json({
      subscribed: false,
      notify_posts: false,
      notify_upscores: false,
      notify_new_clears: false,
    });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  res.json(getActivitySubscription(db, req.user.id, targetUserId));
});

// PUT /api/social/activity-notifications/:userId — set current user's activity notif prefs for target user
router.put('/activity-notifications/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const targetUserId = req.params.userId;

  if (!targetUserId) return res.status(400).json({ error: 'User ID is required' });
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: 'You cannot subscribe to your own activity notifications' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const current = getActivitySubscription(db, req.user.id, targetUserId);
  const next = {
    notify_posts: current.notify_posts,
    notify_upscores: current.notify_upscores,
    notify_new_clears: current.notify_new_clears,
  };

  let changedFields = 0;
  const fields = ['notify_posts', 'notify_upscores', 'notify_new_clears'];
  for (const field of fields) {
    if (!(field in (req.body || {}))) continue;
    const parsed = parseBooleanInput(req.body[field]);
    if (parsed === null) {
      return res.status(400).json({ error: `${field} must be a boolean` });
    }
    next[field] = parsed;
    changedFields += 1;
  }

  if (changedFields === 0) {
    return res.status(400).json({ error: 'At least one notification field must be provided' });
  }

  const saved = setActivitySubscription(db, req.user.id, targetUserId, next);
  res.json(saved);
});

// GET /api/social/counts/:userId — follower/following/post counts + pumps + trend (public)
router.get('/counts/:userId', (req, res) => {
  const db = getDb();
  const userId = req.params.userId;
  const followersCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?').get(userId).count;
  const followingCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?').get(userId).count;
  const postsCount = db.prepare('SELECT COUNT(*) as count FROM user_posts WHERE user_id = ?').get(userId).count;

  // Total pumps received across all content types.
  // Keep this in sync with achievement pumps_received calculation.
  let totalPumps = 0;
  try {
    const pumpResult = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM post_pumps pp JOIN user_posts up ON pp.post_id = up.id WHERE up.user_id = ?) +
        (SELECT COUNT(*) FROM upscore_pumps usp JOIN user_upscores us ON usp.upscore_id = us.id WHERE us.user_id = ?) +
        (SELECT COUNT(*) FROM new_clear_pumps ncp JOIN user_new_clears nc ON ncp.clear_id = nc.id WHERE nc.user_id = ?) +
        (SELECT COUNT(*) FROM comment_pumps cp JOIN post_comments pc ON cp.comment_type = 'post' AND cp.comment_id = pc.id WHERE pc.user_id = ?) +
        (SELECT COUNT(*) FROM comment_pumps cp JOIN upscore_comments uc ON cp.comment_type = 'upscore' AND cp.comment_id = uc.id WHERE uc.user_id = ?) +
        (SELECT COUNT(*) FROM comment_pumps cp JOIN new_clear_comments ncc ON cp.comment_type = 'clear' AND cp.comment_id = ncc.id WHERE ncc.user_id = ?) +
        (SELECT COUNT(*) FROM comment_pumps cp JOIN play_comments pc2 ON cp.comment_type = 'play' AND cp.comment_id = pc2.id WHERE pc2.user_id = ?) +
        (SELECT COUNT(*) FROM community_post_pumps cpp JOIN community_posts cpo ON cpp.post_id = cpo.id WHERE cpo.user_id = ?) +
        (SELECT COUNT(*) FROM community_comment_pumps ccp JOIN community_post_comments cpc ON ccp.comment_id = cpc.id WHERE cpc.user_id = ?) +
        (
          SELECT COUNT(*)
          FROM live_message_pumps lmp
          JOIN live_session_messages lsm ON lmp.message_id = lsm.id
          LEFT JOIN live_sessions ls ON ls.id = lsm.live_session_id
          WHERE CASE
            WHEN COALESCE(lsm.user_id, '') != '' THEN lsm.user_id
            WHEN lsm.message_type IN ('play', 'request_fulfilled') THEN COALESCE(ls.host_user_id, '')
            ELSE ''
          END = ?
        ) +
        (SELECT COUNT(*) FROM user_story_pumps usp WHERE usp.owner_user_id = ?)
        as total
    `).get(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId);
    totalPumps = pumpResult.total || 0;
  } catch {}

  // Follower trend: snapshot today, compare to yesterday
  const today = new Date().toISOString().split('T')[0];
  try {
    db.prepare('INSERT OR REPLACE INTO follower_daily_snapshots (user_id, snapshot_date, follower_count) VALUES (?, ?, ?)').run(userId, today, followersCount);
  } catch {}
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const yesterdaySnap = db.prepare('SELECT follower_count FROM follower_daily_snapshots WHERE user_id = ? AND snapshot_date = ?').get(userId, yesterday);
  const yesterdayFollowers = yesterdaySnap ? yesterdaySnap.follower_count : followersCount;

  // Last post time
  const lastPost = db.prepare('SELECT created_at FROM user_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);

  res.json({
    followers_count: followersCount,
    following_count: followingCount,
    posts_count: postsCount,
    total_pumps: totalPumps,
    yesterday_followers: yesterdayFollowers,
    last_post_at: lastPost ? lastPost.created_at : null,
  });
});

// ─── Posts ────────────────────────────────────────────

// POST /api/social/posts — create a post (up to 9 images)
router.post('/posts', requireAuth, upload.array('images', 9), async (req, res) => {
  const db = getDb();
  const { content, youtube_url, comments_disabled } = req.body;

  if (!content && (!req.files || req.files.length === 0) && !youtube_url) {
    return res.status(400).json({ error: 'Post must have content, images, or a video' });
  }

  // Process, compress, and encode images as base64 data URLs (stored in DB, no disk files)
  const imageDataUrls = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        // Auto-rotate based on EXIF orientation, then compress to WebP
        let buffer = await sharp(file.buffer)
          .rotate() // auto-rotate from EXIF, prevents sideways photos
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 60 })
          .toBuffer();

        // Reduce further if still over 100KB
        if (buffer.length > 100 * 1024) {
          buffer = await sharp(file.buffer)
            .rotate()
            .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 40 })
            .toBuffer();
        }

        imageDataUrls.push(`data:image/webp;base64,${buffer.toString('base64')}`);
      } catch (err) {
        console.error('Image processing error:', err.message);
        // Fallback: store original as base64 with its original MIME type
        try {
          const mime = file.mimetype || 'image/png';
          imageDataUrls.push(`data:${mime};base64,${file.buffer.toString('base64')}`);
        } catch (fallbackErr) {
          console.error('Fallback encode error:', fallbackErr.message);
        }
      }
    }
  }

  const result = db.prepare(
    'INSERT INTO user_posts (user_id, content, images, youtube_url, comments_disabled) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, content || '', JSON.stringify(imageDataUrls), youtube_url || '', comments_disabled === 'true' || comments_disabled === '1' ? 1 : 0);

  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);

  const actor = post?.username || req.user.username || 'Someone';
  const contentSnippet = textSnippet(post?.content || '');
  const postMessage = contentSnippet
    ? `${actor} posted: ${contentSnippet}`
    : `${actor} made a new post`;
  notifyActivitySubscribers(db, {
    actorUserId: req.user.id,
    actorUsername: actor,
    activityType: 'posts',
    notificationType: 'followed_user_post',
    title: 'New Post',
    message: postMessage,
    link: `/post/${post.id}`,
  });
  invalidateRecentActivityCache();

  res.status(201).json(enrichPostWithLiveSummaryMetrics(db, { ...post, pump_count: 0, comment_count: 0 }));
});

// GET /api/social/posts/user/:userId — get a user's posts with pump/comment counts
router.get('/posts/user/:userId', optionalAuth, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT p.*, u.username, u.avatar,
           (SELECT COUNT(*) FROM post_pumps WHERE post_id = p.id) as pump_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.params.userId, limit, offset);

  // Attach user's pump status if authenticated (batch query instead of N+1)
  if (req.user && posts.length > 0) {
    const postIds = posts.map(p => p.id);
    const placeholders = postIds.map(() => '?').join(',');
    const pumped = db.prepare(
      `SELECT post_id FROM post_pumps WHERE user_id = ? AND post_id IN (${placeholders})`
    ).all(req.user.id, ...postIds);
    const pumpedSet = new Set(pumped.map(r => r.post_id));
    for (const post of posts) {
      post.user_pumped = pumpedSet.has(post.id);
    }
  }

  res.json(enrichPostsWithLiveSummaryMetrics(db, posts));
});

// PUT /api/social/posts/:id — edit own post (text/youtube only, images unchanged)
router.put('/posts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM user_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.post_kind === 'weekly_challenge_personal') return res.status(403).json({ error: 'Cannot modify system-generated posts' });

  const { content, youtube_url } = req.body;
  db.prepare(
    'UPDATE user_posts SET content = ?, youtube_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(content || '', youtube_url || post.youtube_url || '', req.params.id);

  const updated = db.prepare(`
    SELECT p.*, u.username, u.avatar,
           (SELECT COUNT(*) FROM post_pumps WHERE post_id = p.id) as pump_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  res.json(enrichPostWithLiveSummaryMetrics(db, updated));
});

// DELETE /api/social/posts/:id — delete own post
router.delete('/posts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM user_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.post_kind === 'weekly_challenge_personal') return res.status(403).json({ error: 'Cannot modify system-generated posts' });

  db.prepare('DELETE FROM user_posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Post Drafts ────────────────────────────────────

// POST /api/social/drafts — save a new draft
router.post('/drafts', requireAuth, (req, res) => {
  const db = getDb();
  const { content, youtube_url } = req.body;
  if (!content && !youtube_url) {
    return res.status(400).json({ error: 'Draft must have content or a video' });
  }
  const result = db.prepare(
    'INSERT INTO post_drafts (user_id, content, youtube_url) VALUES (?, ?, ?)'
  ).run(req.user.id, content || '', youtube_url || '');
  const draft = db.prepare('SELECT * FROM post_drafts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(draft);
});

// GET /api/social/drafts — list user's drafts
router.get('/drafts', requireAuth, (req, res) => {
  const db = getDb();
  const drafts = db.prepare(
    'SELECT * FROM post_drafts WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);
  res.json(drafts);
});

// GET /api/social/drafts/:id — get a single draft
router.get('/drafts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const draft = db.prepare('SELECT * FROM post_drafts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

// PUT /api/social/drafts/:id — update a draft
router.put('/drafts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const draft = db.prepare('SELECT * FROM post_drafts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  const { content, youtube_url } = req.body;
  db.prepare(
    "UPDATE post_drafts SET content = ?, youtube_url = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content ?? draft.content, youtube_url ?? draft.youtube_url, draft.id);
  const updated = db.prepare('SELECT * FROM post_drafts WHERE id = ?').get(draft.id);
  res.json(updated);
});

// DELETE /api/social/drafts/:id — delete a draft
router.delete('/drafts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const draft = db.prepare('SELECT * FROM post_drafts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  db.prepare('DELETE FROM post_drafts WHERE id = ?').run(draft.id);
  res.json({ success: true });
});

// ─── Post Pumps (Likes) ─────────────────────────────

// POST /api/social/posts/:id/pump — toggle pump on a post
router.post('/posts/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const post = db.prepare('SELECT id, user_id FROM user_posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = db.prepare(
    'SELECT 1 FROM post_pumps WHERE post_id = ? AND user_id = ?'
  ).get(postId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM post_pumps WHERE post_id = ? AND user_id = ?').run(postId, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM post_pumps WHERE post_id = ?').get(postId).count;
    return res.json({ pumped: false, pump_count: count });
  }

  db.prepare('INSERT INTO post_pumps (post_id, user_id) VALUES (?, ?)').run(postId, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM post_pumps WHERE post_id = ?').get(postId).count;

  // Notify post owner (skip for system-user posts — no one to notify, no achievement churn)
  const isSystemPost = post.user_id === SYSTEM_USER_ID;
  if (!isSystemPost && post.user_id !== req.user.id) {
    const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    createNotification(db, post.user_id, 'post_pump', 'New Pump', `${me.username} pumped your post`, `/post/${postId}`);
  }

  if (!isSystemPost) {
    checkPumpAchievements(db, post.user_id);
  }
  res.json({ pumped: true, pump_count: count });
});

// GET /api/social/posts/:id/pumps — list users who pumped a post
router.get('/posts/:id/pumps', (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id, 10);
  if (Number.isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });

  const post = db.prepare('SELECT id FROM user_posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar, pp.created_at
    FROM post_pumps pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.post_id = ?
    ORDER BY datetime(pp.created_at) DESC, u.username COLLATE NOCASE ASC
  `).all(postId);

  res.json(normalizePumpUserRows(rows));
});

// GET /api/social/posts/:id/pump-status — check if user pumped
router.get('/posts/:id/pump-status', optionalAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  if (!req.user) return res.json({ pumped: false, pump_count: 0 });

  const pumped = !!db.prepare(
    'SELECT 1 FROM post_pumps WHERE post_id = ? AND user_id = ?'
  ).get(postId, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM post_pumps WHERE post_id = ?').get(postId).count;
  res.json({ pumped, pump_count: count });
});

// ─── Post Comments ──────────────────────────────────

// GET /api/social/posts/:id/comments — get comments for a post
router.get('/posts/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);

  // Fetch all comments (parents + replies) in a single query
  const allComments = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.avatar_v
    FROM post_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(postId);

  if (allComments.length === 0) return res.json([]);

  const commentIds = allComments.map(c => c.id);
  const placeholders = commentIds.map(() => '?').join(',');

  // Batch pump counts
  const pumpCounts = db.prepare(`
    SELECT comment_id, COUNT(*) as cnt
    FROM comment_pumps
    WHERE comment_type = 'post' AND comment_id IN (${placeholders})
    GROUP BY comment_id
  `).all(...commentIds);
  const pumpMap = {};
  for (const row of pumpCounts) pumpMap[row.comment_id] = row.cnt;

  // Batch user pump status
  let userPumpSet;
  if (req.user) {
    const userPumps = db.prepare(`
      SELECT comment_id
      FROM comment_pumps
      WHERE comment_type = 'post' AND user_id = ? AND comment_id IN (${placeholders})
    `).all(req.user.id, ...commentIds);
    userPumpSet = new Set(userPumps.map(r => r.comment_id));
  }

  // Assemble: attach pump data and group into parent/replies
  for (const c of allComments) {
    c.pump_count = pumpMap[c.id] || 0;
    c.user_pumped = userPumpSet ? userPumpSet.has(c.id) : false;
  }
  const normalizedComments = normalizeCommentUserRows(allComments, 40);

  const topLevel = [];
  const replyMap = {};
  for (const c of normalizedComments) {
    if (!c.parent_id) {
      c.replies = [];
      topLevel.push(c);
      replyMap[c.id] = c.replies;
    }
  }
  for (const c of normalizedComments) {
    if (c.parent_id && replyMap[c.parent_id]) {
      replyMap[c.parent_id].push(c);
    }
  }

  res.json(topLevel);
});

// POST /api/social/posts/:id/comments — add a comment
router.post('/posts/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  const trimmedContent = String(content || '').trim();

  if (!trimmedContent) {
    return res.status(400).json({ error: 'Comment cannot be empty' });
  }

  const post = db.prepare('SELECT id, comments_disabled, user_id FROM user_posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.comments_disabled) return res.status(403).json({ error: 'Comments are disabled on this post' });

  // If replying, ensure parent exists and belongs to the same post
  if (parent_id) {
    const parent = db.prepare('SELECT id FROM post_comments WHERE id = ? AND post_id = ?').get(parent_id, postId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO post_comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(postId, req.user.id, parent_id || null, trimmedContent);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.avatar_v
    FROM post_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  const normalizedComment = normalizeCommentUserRows([comment], 40)[0];
  normalizedComment.replies = [];
  const commentLink = `/post/${postId}?comment=${encodeURIComponent(String(comment.id))}`;

  // Notifications
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    // Reply: notify parent comment author
    const parentComment = db.prepare('SELECT user_id FROM post_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'post_reply', 'New Reply', `${me.username} replied to your comment`, commentLink);
    }
  }
  if (post.user_id !== req.user.id && post.user_id !== SYSTEM_USER_ID) {
    createNotification(db, post.user_id, 'post_comment', 'New Comment', `${me.username} commented on your post`, commentLink);
  }

  const mentionedUsers = findMentionedUsers(db, trimmedContent);
  notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId: req.user.id,
    actorUsername: me?.username || 'Someone',
    type: 'post_mention',
    title: 'Mentioned in Comment',
    message: `${me?.username || 'Someone'} mentioned you in a post comment`,
    link: commentLink,
  });

  res.status(201).json(normalizedComment);
});

// DELETE /api/social/posts/comments/:id — delete a comment (author or post author)
router.delete('/posts/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const commentId = parseInt(req.params.id);

  const comment = db.prepare('SELECT c.*, p.user_id as post_author_id FROM post_comments c JOIN user_posts p ON c.post_id = p.id WHERE c.id = ?').get(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  // Only comment author or post author can delete
  if (comment.user_id !== req.user.id && comment.post_author_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized to delete this comment' });
  }

  db.prepare('DELETE FROM post_comments WHERE id = ? OR parent_id = ?').run(commentId, commentId);
  res.json({ success: true });
});

// PATCH /api/social/posts/:id/comments-toggle — toggle comments on/off (post author only)
router.patch('/posts/:id/comments-toggle', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);

  const post = db.prepare('SELECT id, user_id, comments_disabled FROM user_posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  const newVal = post.comments_disabled ? 0 : 1;
  db.prepare('UPDATE user_posts SET comments_disabled = ? WHERE id = ?').run(newVal, postId);
  res.json({ comments_disabled: !!newVal });
});

// ─── Individual Item Views ────────────────────────────

// GET /api/social/posts/:id — get a single post by ID (public)
router.get('/posts/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });

  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM post_pumps WHERE post_id = p.id) as pump_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (req.user) {
    post.user_pumped = !!db.prepare(
      'SELECT 1 FROM post_pumps WHERE post_id = ? AND user_id = ?'
    ).get(post.id, req.user.id);
  }
  post.type = 'post';
  res.json(enrichPostWithLiveSummaryMetrics(db, post));
});

// GET /api/social/upscores/:id — get a single upscore by ID (public)
router.get('/upscores/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);
  if (isNaN(upscoreId)) return res.status(400).json({ error: 'Invalid upscore ID' });

  let upscore = db.prepare(`
    SELECT us.*, u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM upscore_pumps WHERE upscore_id = us.id) as pump_count,
           (SELECT COUNT(*) FROM upscore_comments WHERE upscore_id = us.id) as comment_count
    FROM user_upscores us JOIN users u ON us.user_id = u.id
    WHERE us.id = ?
  `).get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });
  upscore = enrichUpscoreRow(db, upscore);

  if (req.user) {
    upscore.user_pumped = !!db.prepare(
      'SELECT 1 FROM upscore_pumps WHERE upscore_id = ? AND user_id = ?'
    ).get(upscore.id, req.user.id);
  }
  upscore.type = 'upscore';
  res.json(upscore);
});

// GET /api/social/clears/:id — get a single new clear by ID (public)
router.get('/clears/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);
  if (isNaN(clearId)) return res.status(400).json({ error: 'Invalid clear ID' });

  let clear = db.prepare(`
    SELECT nc.*, u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM new_clear_pumps WHERE clear_id = nc.id) as pump_count,
           (SELECT COUNT(*) FROM new_clear_comments WHERE clear_id = nc.id) as comment_count
    FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
    WHERE nc.id = ?
  `).get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });
  clear = enrichClearRow(db, clear);

  if (req.user) {
    clear.user_pumped = !!db.prepare(
      'SELECT 1 FROM new_clear_pumps WHERE clear_id = ? AND user_id = ?'
    ).get(clear.id, req.user.id);
  }
  clear.type = 'clear';
  res.json(clear);
});

// ─── Feed ─────────────────────────────────────────────

// GET /api/social/feed — get feed from followed users (posts + upscores)
router.get('/feed', requireAuth, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const feedRefs = db.prepare(`
    SELECT type, id, created_at
    FROM (
      SELECT 'post' as type, p.id, p.created_at
      FROM user_posts p
      WHERE (p.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
         OR p.user_id = ?)
        AND (p.post_kind IS NULL OR p.post_kind != 'weekly_challenge_summary')

      UNION ALL

      SELECT 'post' as type, p.id, p.created_at
      FROM user_posts p
      WHERE p.post_kind = 'weekly_challenge_summary'

      UNION ALL

      SELECT 'upscore' as type, us.id, us.created_at
      FROM user_upscores us
      WHERE us.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
         OR us.user_id = ?

      UNION ALL

      SELECT 'clear' as type, nc.id, nc.created_at
      FROM user_new_clears nc
      WHERE nc.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
         OR nc.user_id = ?

      UNION ALL

      SELECT 'weekly_challenge' as type, wcp.id, wcp.created_at
      FROM user_weekly_challenge_plays wcp
      WHERE wcp.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
         OR wcp.user_id = ?
    ) feed_items
    ORDER BY
      datetime(COALESCE(created_at, '1970-01-01 00:00:00')) DESC,
      created_at DESC,
      id DESC,
      type ASC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, limit, offset);

  if (feedRefs.length === 0) {
    return res.json([]);
  }

  const postIds = feedRefs.filter((item) => item.type === 'post').map((item) => item.id);
  const upscoreIds = feedRefs.filter((item) => item.type === 'upscore').map((item) => item.id);
  const clearIds = feedRefs.filter((item) => item.type === 'clear').map((item) => item.id);
  const wcPlayIds = feedRefs.filter((item) => item.type === 'weekly_challenge').map((item) => item.id);

  const itemMap = new Map();

  if (postIds.length > 0) {
    const placeholders = postIds.map(() => '?').join(',');
    const posts = db.prepare(`
      SELECT p.id, p.user_id, p.content, p.images, p.youtube_url, p.comments_disabled, p.created_at,
             u.username, u.avatar, u.nationality,
             (SELECT COUNT(*) FROM post_pumps WHERE post_id = p.id) as pump_count,
             (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count,
             CASE WHEN pp_me.user_id IS NULL THEN 0 ELSE 1 END as user_pumped,
             'post' as type
      FROM user_posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_pumps pp_me ON pp_me.post_id = p.id AND pp_me.user_id = ?
      WHERE p.id IN (${placeholders})
    `).all(req.user.id, ...postIds);

    enrichPostsWithLiveSummaryMetrics(db, posts);
    for (const post of posts) {
      post.avatar = normalizeUserAvatarForList(post.avatar, post.user_id, 64);
      itemMap.set(`post:${post.id}`, post);
    }
  }

  if (upscoreIds.length > 0) {
    const placeholders = upscoreIds.map(() => '?').join(',');
    const upscores = db.prepare(`
      SELECT us.id, us.user_id, us.upscores_json, us.pumbility_gain, us.singles_pumbility_gain, us.created_at,
             u.username, u.avatar, u.nationality,
             (SELECT COUNT(*) FROM upscore_pumps WHERE upscore_id = us.id) as pump_count,
             (SELECT COUNT(*) FROM upscore_comments WHERE upscore_id = us.id) as comment_count,
             CASE WHEN usp_me.user_id IS NULL THEN 0 ELSE 1 END as user_pumped,
             'upscore' as type
      FROM user_upscores us
      JOIN users u ON us.user_id = u.id
      LEFT JOIN upscore_pumps usp_me ON usp_me.upscore_id = us.id AND usp_me.user_id = ?
      WHERE us.id IN (${placeholders})
    `).all(req.user.id, ...upscoreIds);

    for (const upscore of upscores) {
      upscore.avatar = normalizeUserAvatarForList(upscore.avatar, upscore.user_id, 64);
      itemMap.set(`upscore:${upscore.id}`, enrichUpscoreRow(db, upscore));
    }
  }

  if (clearIds.length > 0) {
    const placeholders = clearIds.map(() => '?').join(',');
    const clears = db.prepare(`
      SELECT nc.id, nc.user_id, nc.song_title, nc.mode, nc.level, nc.score, nc.grade, nc.plate, nc.background_url, nc.clears_json, nc.pumbility_gain, nc.singles_pumbility_gain, nc.created_at,
             u.username, u.avatar, u.nationality,
             (SELECT COUNT(*) FROM new_clear_pumps WHERE clear_id = nc.id) as pump_count,
             (SELECT COUNT(*) FROM new_clear_comments WHERE clear_id = nc.id) as comment_count,
             CASE WHEN ncp_me.user_id IS NULL THEN 0 ELSE 1 END as user_pumped,
             'clear' as type
      FROM user_new_clears nc
      JOIN users u ON nc.user_id = u.id
      LEFT JOIN new_clear_pumps ncp_me ON ncp_me.clear_id = nc.id AND ncp_me.user_id = ?
      WHERE nc.id IN (${placeholders})
    `).all(req.user.id, ...clearIds);

    for (const clear of clears) {
      clear.avatar = normalizeUserAvatarForList(clear.avatar, clear.user_id, 64);
      itemMap.set(`clear:${clear.id}`, enrichClearRow(db, clear));
    }
  }

  if (wcPlayIds.length > 0) {
    const placeholders = wcPlayIds.map(() => '?').join(',');
    const wcPlays = db.prepare(`
      SELECT wcp.id, wcp.user_id, wcp.week_id, wcp.plays_json, wcp.created_at,
             u.username, u.avatar, u.nationality,
             w.week_key,
             (SELECT COUNT(*) FROM weekly_challenge_play_pumps WHERE play_post_id = wcp.id) as pump_count,
             (SELECT COUNT(*) FROM weekly_challenge_play_comments WHERE play_post_id = wcp.id) as comment_count,
             CASE WHEN wpp_me.user_id IS NULL THEN 0 ELSE 1 END as user_pumped,
             'weekly_challenge' as type
      FROM user_weekly_challenge_plays wcp
      JOIN users u ON wcp.user_id = u.id
      JOIN weekly_challenge_weeks w ON w.id = wcp.week_id
      LEFT JOIN weekly_challenge_play_pumps wpp_me ON wpp_me.play_post_id = wcp.id AND wpp_me.user_id = ?
      WHERE wcp.id IN (${placeholders})
    `).all(req.user.id, ...wcPlayIds);
    const wcTotalsByPair = buildWeeklyChallengeTotalsMap(db, wcPlays);

    for (const wcp of wcPlays) {
      wcp.avatar = normalizeUserAvatarForList(wcp.avatar, wcp.user_id, 64);
      const parsedPlays = safeParseJsonArray(wcp.plays_json);
      const enrichedPlays = parsedPlays.map((play) =>
        enrichWeeklyChallengePlayItem(db, wcp.user_id, wcp.created_at, play)
      );
      wcp.plays_json = JSON.stringify(enrichedPlays);

      const totals = wcTotalsByPair.get(`${wcp.user_id}:${toInt(wcp.week_id)}`);
      wcp.total_rating_points = toInt(totals?.total_rating_points);
      wcp.total_charts_played = toInt(totals?.total_charts_played);

      itemMap.set(`weekly_challenge:${wcp.id}`, wcp);
    }
  }

  const feed = feedRefs
    .map((item) => itemMap.get(`${item.type}:${item.id}`))
    .filter(Boolean);

  res.json(feed);
});

// ─── Upscore Pumps ──────────────────────────────────────

// POST /api/social/upscores/:id/pump — toggle pump on an upscore
router.post('/upscores/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);
  const upscore = db.prepare('SELECT id, user_id FROM user_upscores WHERE id = ?').get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });

  const existing = db.prepare(
    'SELECT 1 FROM upscore_pumps WHERE upscore_id = ? AND user_id = ?'
  ).get(upscoreId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM upscore_pumps WHERE upscore_id = ? AND user_id = ?').run(upscoreId, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM upscore_pumps WHERE upscore_id = ?').get(upscoreId).count;
    return res.json({ pumped: false, pump_count: count });
  }

  db.prepare('INSERT INTO upscore_pumps (upscore_id, user_id) VALUES (?, ?)').run(upscoreId, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM upscore_pumps WHERE upscore_id = ?').get(upscoreId).count;

  // Notify upscore owner
  if (upscore.user_id !== req.user.id) {
    const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    createNotification(db, upscore.user_id, 'upscore_pump', 'New Pump', `${me.username} pumped your upscore!`, `/upscore/${upscoreId}`);
  }

  checkPumpAchievements(db, upscore.user_id);
  res.json({ pumped: true, pump_count: count });
});

// GET /api/social/upscores/:id/pumps — list users who pumped an upscore
router.get('/upscores/:id/pumps', (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id, 10);
  if (Number.isNaN(upscoreId)) return res.status(400).json({ error: 'Invalid upscore ID' });

  const upscore = db.prepare('SELECT id FROM user_upscores WHERE id = ?').get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });

  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar, p.created_at
    FROM upscore_pumps p
    JOIN users u ON u.id = p.user_id
    WHERE p.upscore_id = ?
    ORDER BY datetime(p.created_at) DESC, u.username COLLATE NOCASE ASC
  `).all(upscoreId);

  res.json(normalizePumpUserRows(rows));
});

// ─── Upscore Comments ──────────────────────────────────

// GET /api/social/upscores/:id/comments
router.get('/upscores/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);

  const allComments = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.avatar_v
    FROM upscore_comments c JOIN users u ON c.user_id = u.id
    WHERE c.upscore_id = ?
    ORDER BY c.created_at ASC
  `).all(upscoreId);

  if (allComments.length === 0) return res.json([]);

  const commentIds = allComments.map(c => c.id);
  const placeholders = commentIds.map(() => '?').join(',');

  const pumpCounts = db.prepare(`
    SELECT comment_id, COUNT(*) as cnt FROM comment_pumps
    WHERE comment_type = 'upscore' AND comment_id IN (${placeholders})
    GROUP BY comment_id
  `).all(...commentIds);
  const pumpMap = {};
  for (const row of pumpCounts) pumpMap[row.comment_id] = row.cnt;

  let userPumpSet;
  if (req.user) {
    const userPumps = db.prepare(`
      SELECT comment_id FROM comment_pumps
      WHERE comment_type = 'upscore' AND user_id = ? AND comment_id IN (${placeholders})
    `).all(req.user.id, ...commentIds);
    userPumpSet = new Set(userPumps.map(r => r.comment_id));
  }

  for (const c of allComments) {
    c.pump_count = pumpMap[c.id] || 0;
    c.user_pumped = userPumpSet ? userPumpSet.has(c.id) : false;
  }
  const normalizedComments = normalizeCommentUserRows(allComments, 40);

  const topLevel = [];
  const replyMap = {};
  for (const c of normalizedComments) {
    if (!c.parent_id) { c.replies = []; topLevel.push(c); replyMap[c.id] = c.replies; }
  }
  for (const c of normalizedComments) {
    if (c.parent_id && replyMap[c.parent_id]) replyMap[c.parent_id].push(c);
  }

  res.json(topLevel);
});

// POST /api/social/upscores/:id/comments
router.post('/upscores/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) return res.status(400).json({ error: 'Comment cannot be empty' });

  const upscore = db.prepare('SELECT id, user_id FROM user_upscores WHERE id = ?').get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });

  if (parent_id) {
    const parent = db.prepare('SELECT id FROM upscore_comments WHERE id = ? AND upscore_id = ?').get(parent_id, upscoreId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO upscore_comments (upscore_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(upscoreId, req.user.id, parent_id || null, trimmedContent);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.avatar_v
    FROM upscore_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  const normalizedComment = normalizeCommentUserRows([comment], 40)[0];
  normalizedComment.replies = [];
  const commentLink = `/upscore/${upscoreId}?comment=${encodeURIComponent(String(comment.id))}`;

  // Notify upscore owner
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    // Reply notification to parent comment author
    const parentComment = db.prepare('SELECT user_id FROM upscore_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'upscore_reply', 'New Reply', `${me.username} replied to your comment`, commentLink);
    }
  }
  if (upscore.user_id !== req.user.id) {
    createNotification(db, upscore.user_id, 'upscore_comment', 'New Comment', `${me.username} commented on your upscore`, commentLink);
  }

  const mentionedUsers = findMentionedUsers(db, trimmedContent);
  notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId: req.user.id,
    actorUsername: me?.username || 'Someone',
    type: 'upscore_mention',
    title: 'Mentioned in Comment',
    message: `${me?.username || 'Someone'} mentioned you in an upscore comment`,
    link: commentLink,
  });

  res.status(201).json(normalizedComment);
});

// DELETE /api/social/upscores/comments/:id
router.delete('/upscores/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const commentId = parseInt(req.params.id);
  const comment = db.prepare(`
    SELECT c.*, us.user_id as upscore_author_id
    FROM upscore_comments c
    JOIN user_upscores us ON c.upscore_id = us.id
    WHERE c.id = ?
  `).get(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id && comment.upscore_author_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.prepare('DELETE FROM upscore_comments WHERE id = ? OR parent_id = ?').run(commentId, commentId);
  res.json({ success: true });
});

// ─── New Clear Pumps ──────────────────────────────────────

// POST /api/social/clears/:id/pump — toggle pump on a new clear
router.post('/clears/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);
  const clear = db.prepare('SELECT id, user_id FROM user_new_clears WHERE id = ?').get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });

  const existing = db.prepare(
    'SELECT 1 FROM new_clear_pumps WHERE clear_id = ? AND user_id = ?'
  ).get(clearId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM new_clear_pumps WHERE clear_id = ? AND user_id = ?').run(clearId, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM new_clear_pumps WHERE clear_id = ?').get(clearId).count;
    return res.json({ pumped: false, pump_count: count });
  }

  db.prepare('INSERT INTO new_clear_pumps (clear_id, user_id) VALUES (?, ?)').run(clearId, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM new_clear_pumps WHERE clear_id = ?').get(clearId).count;

  if (clear.user_id !== req.user.id) {
    const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    createNotification(db, clear.user_id, 'clear_pump', 'New Pump', `${me.username} pumped your new clear!`, `/clear/${clearId}`);
  }

  checkPumpAchievements(db, clear.user_id);
  res.json({ pumped: true, pump_count: count });
});

// GET /api/social/clears/:id/pumps — list users who pumped a clear
router.get('/clears/:id/pumps', (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id, 10);
  if (Number.isNaN(clearId)) return res.status(400).json({ error: 'Invalid clear ID' });

  const clear = db.prepare('SELECT id FROM user_new_clears WHERE id = ?').get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });

  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar, p.created_at
    FROM new_clear_pumps p
    JOIN users u ON u.id = p.user_id
    WHERE p.clear_id = ?
    ORDER BY datetime(p.created_at) DESC, u.username COLLATE NOCASE ASC
  `).all(clearId);

  res.json(normalizePumpUserRows(rows));
});

// ─── New Clear Comments ──────────────────────────────────

// GET /api/social/clears/:id/comments
router.get('/clears/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);

  const allComments = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.avatar_v
    FROM new_clear_comments c JOIN users u ON c.user_id = u.id
    WHERE c.clear_id = ?
    ORDER BY c.created_at ASC
  `).all(clearId);

  if (allComments.length === 0) return res.json([]);

  const commentIds = allComments.map(c => c.id);
  const placeholders = commentIds.map(() => '?').join(',');

  const pumpCounts = db.prepare(`
    SELECT comment_id, COUNT(*) as cnt FROM comment_pumps
    WHERE comment_type = 'clear' AND comment_id IN (${placeholders})
    GROUP BY comment_id
  `).all(...commentIds);
  const pumpMap = {};
  for (const row of pumpCounts) pumpMap[row.comment_id] = row.cnt;

  let userPumpSet;
  if (req.user) {
    const userPumps = db.prepare(`
      SELECT comment_id FROM comment_pumps
      WHERE comment_type = 'clear' AND user_id = ? AND comment_id IN (${placeholders})
    `).all(req.user.id, ...commentIds);
    userPumpSet = new Set(userPumps.map(r => r.comment_id));
  }

  for (const c of allComments) {
    c.pump_count = pumpMap[c.id] || 0;
    c.user_pumped = userPumpSet ? userPumpSet.has(c.id) : false;
  }
  const normalizedComments = normalizeCommentUserRows(allComments, 40);

  const topLevel = [];
  const replyMap = {};
  for (const c of normalizedComments) {
    if (!c.parent_id) { c.replies = []; topLevel.push(c); replyMap[c.id] = c.replies; }
  }
  for (const c of normalizedComments) {
    if (c.parent_id && replyMap[c.parent_id]) replyMap[c.parent_id].push(c);
  }

  res.json(topLevel);
});

// POST /api/social/clears/:id/comments
router.post('/clears/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) return res.status(400).json({ error: 'Comment cannot be empty' });

  const clear = db.prepare('SELECT id, user_id FROM user_new_clears WHERE id = ?').get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });

  if (parent_id) {
    const parent = db.prepare('SELECT id FROM new_clear_comments WHERE id = ? AND clear_id = ?').get(parent_id, clearId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO new_clear_comments (clear_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(clearId, req.user.id, parent_id || null, trimmedContent);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.avatar_v
    FROM new_clear_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  const normalizedComment = normalizeCommentUserRows([comment], 40)[0];
  normalizedComment.replies = [];
  const commentLink = `/clear/${clearId}?comment=${encodeURIComponent(String(comment.id))}`;

  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    const parentComment = db.prepare('SELECT user_id FROM new_clear_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'clear_reply', 'New Reply', `${me.username} replied to your comment`, commentLink);
    }
  }
  if (clear.user_id !== req.user.id) {
    createNotification(db, clear.user_id, 'clear_comment', 'New Comment', `${me.username} commented on your new clear`, commentLink);
  }

  const mentionedUsers = findMentionedUsers(db, trimmedContent);
  notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId: req.user.id,
    actorUsername: me?.username || 'Someone',
    type: 'clear_mention',
    title: 'Mentioned in Comment',
    message: `${me?.username || 'Someone'} mentioned you in a clear comment`,
    link: commentLink,
  });

  res.status(201).json(normalizedComment);
});

// DELETE /api/social/clears/comments/:id
router.delete('/clears/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const commentId = parseInt(req.params.id);
  const comment = db.prepare(`
    SELECT c.*, nc.user_id as clear_author_id
    FROM new_clear_comments c
    JOIN user_new_clears nc ON c.clear_id = nc.id
    WHERE c.id = ?
  `).get(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id && comment.clear_author_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.prepare('DELETE FROM new_clear_comments WHERE id = ? OR parent_id = ?').run(commentId, commentId);
  res.json({ success: true });
});

// ─── Play Comments ──────────────────────────────────────

// GET /api/social/plays/lookup — find a play by song/mode/level/score/user
// NOTE: Must be registered BEFORE /plays/:id to avoid :id capturing "lookup"
router.get('/plays/lookup', optionalAuth, (req, res) => {
  const db = getDb();
  const { song_title, mode, level, score, user_id } = req.query;
  if (!song_title || !mode || !level || !score || !user_id) {
    return res.status(400).json({ error: 'Missing required query parameters' });
  }
  const play = db.prepare(`
    SELECT rp.*, u.username, u.avatar, u.avatar_v, u.skill_title, u.nationality,
           COALESCE(NULLIF(yt.session_youtube_url, ''), rp.replay_embed_url, '') AS resolved_replay_url,
           (SELECT COUNT(*) FROM play_comments WHERE play_id = rp.id) as comment_count
    FROM user_recently_played rp
    JOIN users u ON rp.user_id = u.id
    LEFT JOIN songs chart ON chart.title = rp.song_title AND chart.mode = rp.mode AND chart.level = rp.level
    LEFT JOIN user_chart_youtube_links yt ON yt.user_id = rp.user_id AND yt.chart_id = chart.id
    WHERE rp.user_id = ? AND rp.song_title = ? AND rp.mode = ? AND rp.level = ? AND rp.score = ?
    ORDER BY rp.id DESC LIMIT 1
  `).get(user_id, song_title, mode, parseInt(level), parseInt(score));
  if (!play) return res.status(404).json({ error: 'Play not found' });
  play.avatar = normalizeUserAvatarForList(play.avatar, play.user_id, 40, play.avatar_v);
  if (play.resolved_replay_url) play.replay_embed_url = play.resolved_replay_url;
  delete play.resolved_replay_url;
  res.json(play);
});

// GET /api/social/plays/:id — fetch single play with user info + comment count
router.get('/plays/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const playId = parseInt(req.params.id);

  const play = db.prepare(`
    SELECT rp.*, u.username, u.avatar, u.avatar_v, u.skill_title, u.nationality,
           (SELECT COUNT(*) FROM play_comments WHERE play_id = rp.id) as comment_count
    FROM user_recently_played rp
    JOIN users u ON rp.user_id = u.id
    WHERE rp.id = ?
  `).get(playId);
  if (!play) return res.status(404).json({ error: 'Play not found' });

  play.avatar = normalizeUserAvatarForList(play.avatar, play.user_id, 40, play.avatar_v);

  res.json(play);
});

// GET /api/social/plays/:id/comments — threaded comments with pump counts
router.get('/plays/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const playId = parseInt(req.params.id);

  const allComments = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.avatar_v
    FROM play_comments c JOIN users u ON c.user_id = u.id
    WHERE c.play_id = ?
    ORDER BY c.created_at ASC
  `).all(playId);

  if (allComments.length === 0) return res.json([]);

  const commentIds = allComments.map(c => c.id);
  const placeholders = commentIds.map(() => '?').join(',');

  const pumpCounts = db.prepare(`
    SELECT comment_id, COUNT(*) as cnt FROM comment_pumps
    WHERE comment_type = 'play' AND comment_id IN (${placeholders})
    GROUP BY comment_id
  `).all(...commentIds);
  const pumpMap = {};
  for (const row of pumpCounts) pumpMap[row.comment_id] = row.cnt;

  let userPumpSet;
  if (req.user) {
    const userPumps = db.prepare(`
      SELECT comment_id FROM comment_pumps
      WHERE comment_type = 'play' AND user_id = ? AND comment_id IN (${placeholders})
    `).all(req.user.id, ...commentIds);
    userPumpSet = new Set(userPumps.map(r => r.comment_id));
  }

  for (const c of allComments) {
    c.pump_count = pumpMap[c.id] || 0;
    c.user_pumped = userPumpSet ? userPumpSet.has(c.id) : false;
  }
  const normalizedComments = normalizeCommentUserRows(allComments, 40);

  const topLevel = [];
  const replyMap = {};
  for (const c of normalizedComments) {
    if (!c.parent_id) { c.replies = []; topLevel.push(c); replyMap[c.id] = c.replies; }
  }
  for (const c of normalizedComments) {
    if (c.parent_id && replyMap[c.parent_id]) replyMap[c.parent_id].push(c);
  }

  res.json(topLevel);
});

// POST /api/social/plays/:id/comments — add comment/reply
router.post('/plays/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const playId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) return res.status(400).json({ error: 'Comment cannot be empty' });

  const play = db.prepare('SELECT id, user_id FROM user_recently_played WHERE id = ?').get(playId);
  if (!play) return res.status(404).json({ error: 'Play not found' });

  if (parent_id) {
    const parent = db.prepare('SELECT id FROM play_comments WHERE id = ? AND play_id = ?').get(parent_id, playId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO play_comments (play_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(playId, req.user.id, parent_id || null, trimmedContent);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.avatar_v
    FROM play_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  const normalizedComment = normalizeCommentUserRows([comment], 40)[0];
  normalizedComment.replies = [];
  const commentLink = `/play/${playId}?comment=${encodeURIComponent(String(comment.id))}`;

  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    const parentComment = db.prepare('SELECT user_id FROM play_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'play_reply', 'New Reply', `${me.username} replied to your comment`, commentLink);
    }
  }
  if (play.user_id !== req.user.id) {
    createNotification(db, play.user_id, 'play_comment', 'New Comment', `${me.username} commented on your play`, commentLink);
  }

  const mentionedUsers = findMentionedUsers(db, trimmedContent);
  notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId: req.user.id,
    actorUsername: me?.username || 'Someone',
    type: 'play_mention',
    title: 'Mentioned in Comment',
    message: `${me?.username || 'Someone'} mentioned you in a play comment`,
    link: commentLink,
  });

  res.status(201).json(normalizedComment);
});

// DELETE /api/social/plays/comments/:id — delete if commenter OR play owner
router.delete('/plays/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const commentId = parseInt(req.params.id);
  const comment = db.prepare(`
    SELECT c.*, rp.user_id as play_author_id
    FROM play_comments c
    JOIN user_recently_played rp ON c.play_id = rp.id
    WHERE c.id = ?
  `).get(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id && comment.play_author_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.prepare('DELETE FROM play_comments WHERE id = ? OR parent_id = ?').run(commentId, commentId);
  res.json({ success: true });
});

// ─── Comment Pumps ──────────────────────────────────────

// POST /api/social/comments/:type/:commentId/pump — toggle pump on a comment
router.post('/comments/:type/:commentId/pump', requireAuth, (req, res) => {
  const db = getDb();
  const { type, commentId } = req.params;
  const cid = parseInt(commentId);
  if (!['post', 'upscore', 'clear', 'play'].includes(type)) return res.status(400).json({ error: 'Invalid comment type' });

  // Verify comment exists and get author
  let comment;
  if (type === 'post') {
    comment = db.prepare('SELECT id, user_id, post_id as parent_item_id FROM post_comments WHERE id = ?').get(cid);
  } else if (type === 'upscore') {
    comment = db.prepare('SELECT id, user_id, upscore_id as parent_item_id FROM upscore_comments WHERE id = ?').get(cid);
  } else if (type === 'clear') {
    comment = db.prepare('SELECT id, user_id, clear_id as parent_item_id FROM new_clear_comments WHERE id = ?').get(cid);
  } else {
    comment = db.prepare('SELECT id, user_id, play_id as parent_item_id FROM play_comments WHERE id = ?').get(cid);
  }
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const existing = db.prepare(
    'SELECT 1 FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?'
  ).get(type, cid, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?').run(type, cid, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM comment_pumps WHERE comment_type = ? AND comment_id = ?').get(type, cid).count;
    return res.json({ pumped: false, pump_count: count });
  }

  db.prepare('INSERT INTO comment_pumps (comment_type, comment_id, user_id) VALUES (?, ?, ?)').run(type, cid, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM comment_pumps WHERE comment_type = ? AND comment_id = ?').get(type, cid).count;

  // Notify comment author
  if (comment.user_id !== req.user.id) {
    const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    const parentItemId = encodeURIComponent(String(comment.parent_item_id));
    const commentParam = encodeURIComponent(String(cid));
    const link = type === 'post'
      ? `/post/${parentItemId}?comment=${commentParam}`
      : type === 'upscore'
        ? `/upscore/${parentItemId}?comment=${commentParam}`
        : type === 'weekly_challenge'
          ? `/weekly-challenge/${parentItemId}?comment=${commentParam}`
          : `/clear/${parentItemId}?comment=${commentParam}`;
    createNotification(db, comment.user_id, 'comment_pump', 'Comment Pumped', `${me.username} pumped your comment`, link);
  }

  checkPumpAchievements(db, comment.user_id);
  res.json({ pumped: true, pump_count: count });
});

// ─── Recent Activity (public) ──────────────────────────

// GET /api/social/recent-activity — aggregated activity feed for dashboard
router.get('/recent-activity', (req, res) => {
  res.set('Cache-Control', `public, max-age=${Math.floor(RECENT_ACTIVITY_TTL_MS / 1000)}`);
  const cached = readRecentActivityCache();
  if (cached) return res.json(cached);

  const db = getDb();
  const activities = [];

  // New user signups (last 10, excluding system user)
  const newUsers = db.prepare(`
    SELECT id, username, avatar, nationality, created_at FROM users WHERE id != ? ORDER BY created_at DESC LIMIT 10
  `).all(SYSTEM_USER_ID);
  for (const u of newUsers) {
    activities.push({
      type: 'new_user', created_at: u.created_at,
      message: `${u.username} joined Pump **Shinsa**`,
      link: buildProfilePath(u.username) || `/profile/${u.id}`,
      avatar: normalizeUserAvatarForList(u.avatar, u.id, 40), username: u.username, nationality: u.nationality,
    });
  }

  // Upscore posts
  const upscores = db.prepare(`
    SELECT us.id, us.created_at, us.upscores_json, u.id as user_id, u.username, u.avatar, u.nationality
    FROM user_upscores us JOIN users u ON us.user_id = u.id
    ORDER BY us.created_at DESC LIMIT 10
  `).all();
  for (const us of upscores) {
    const upscoreData = JSON.parse(us.upscores_json || '[]');
    const songCount = upscoreData.length;
    activities.push({
      type: 'upscore', created_at: us.created_at,
      message: `${us.username} improved ${songCount} score${songCount !== 1 ? 's' : ''}`,
      link: `/upscore/${us.id}`,
      avatar: normalizeUserAvatarForList(us.avatar, us.user_id, 40), username: us.username, nationality: us.nationality,
    });
  }

  // New clear posts
  const clears = db.prepare(`
    SELECT nc.id, nc.song_title, nc.mode, nc.level, nc.clears_json, nc.created_at, u.id as user_id, u.username, u.avatar, u.nationality
    FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
    ORDER BY nc.created_at DESC LIMIT 10
  `).all();
  for (const c of clears) {
    let clearItems = [];
    try {
      const parsed = JSON.parse(c.clears_json || '[]');
      if (Array.isArray(parsed)) clearItems = parsed;
    } catch {}
    const clearCount = clearItems.length > 0 ? clearItems.length : 1;
    const firstClear = clearItems[0] || c;
    const mode = firstClear.mode === 'Single' ? 'S' : firstClear.mode === 'Double' ? 'D' : 'C';
    const message = clearCount > 1
      ? `${c.username} cleared ${clearCount} new songs`
      : `${c.username} cleared ${firstClear.song_title} (${mode}${firstClear.level})`;
    activities.push({
      type: 'new_clear', created_at: c.created_at,
      message,
      link: `/clear/${c.id}`,
      avatar: normalizeUserAvatarForList(c.avatar, c.user_id, 40), username: c.username, nationality: c.nationality,
    });
  }

  // New posts (exclude weekly challenge summary posts from recent activity)
  const posts = db.prepare(`
    SELECT p.id, p.created_at, p.content, u.id as user_id, u.username, u.avatar, u.nationality
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE (p.post_kind IS NULL OR p.post_kind NOT IN ('weekly_challenge_summary', 'weekly_challenge_personal'))
    ORDER BY p.created_at DESC LIMIT 10
  `).all();
  for (const p of posts) {
    const snippet = textSnippet(p.content || '', 60);
    activities.push({
      type: 'new_post', created_at: p.created_at,
      message: `${p.username} posted${snippet ? `: "${snippet}"` : ''}`,
      link: `/post/${p.id}`,
      avatar: normalizeUserAvatarForList(p.avatar, p.user_id, 40), username: p.username, nationality: p.nationality,
    });
  }

  // New tournaments
  const tournaments = db.prepare(`
    SELECT id, name, created_at FROM tournaments ORDER BY created_at DESC LIMIT 10
  `).all();
  for (const t of tournaments) {
    activities.push({
      type: 'new_tournament', created_at: t.created_at,
      message: `Tournament "${t.name}" was created`,
      link: `/tournament/${t.id}`,
    });
  }

  // New offline duels
  const duels = db.prepare(`
    SELECT id, name, player1_name, player2_name, status, winner, created_at FROM duels ORDER BY created_at DESC LIMIT 10
  `).all();
  for (const d of duels) {
    activities.push({
      type: 'new_duel', created_at: d.created_at,
      message: `Duel "${d.name}": ${d.player1_name} vs ${d.player2_name}`,
      link: `/duel/${d.id}`,
    });
    if (d.status === 'COMPLETED' && d.winner) {
      const winnerName = d.winner === 'player1' ? d.player1_name : d.player2_name;
      activities.push({
        type: 'duel_win', created_at: d.created_at,
        message: `${winnerName} won duel "${d.name}"`,
        link: `/duel/${d.id}`,
      });
    }
  }

  // New online duels
  const onlineDuels = db.prepare(`
    SELECT od.id, od.name, od.status, od.winner, od.created_at,
           u1.username as p1_name, u1.avatar as p1_avatar,
           u2.username as p2_name, u2.avatar as p2_avatar
    FROM online_duels od
    JOIN users u1 ON od.creator_user_id = u1.id
    LEFT JOIN users u2 ON od.opponent_user_id = u2.id
    ORDER BY od.created_at DESC LIMIT 10
  `).all();
  for (const od of onlineDuels) {
    activities.push({
      type: 'new_online_duel', created_at: od.created_at,
      message: `Online duel "${od.name}": ${od.p1_name} vs ${od.p2_name || 'Waiting...'}`,
      link: `/online-duel/${od.id}`,
    });
    if (od.status === 'COMPLETED' && od.winner) {
      const winnerName = od.winner === 'player1' ? od.p1_name : od.p2_name;
      activities.push({
        type: 'online_duel_win', created_at: od.created_at,
        message: `${winnerName} won online duel "${od.name}"`,
        link: `/online-duel/${od.id}`,
      });
    }
  }

  // Tournament wins
  const completedTournaments = db.prepare(`
    SELECT t.id, t.name, t.created_at,
           p.name as winner_name, p.avatar as winner_avatar
    FROM tournaments t
    JOIN players p ON p.tournament_id = t.id
    WHERE t.phase = 'COMPLETED'
    ORDER BY p.wins DESC, p.points DESC
    LIMIT 10
  `).all();
  // Group by tournament, take top player
  const tWinMap = {};
  for (const tw of completedTournaments) {
    if (!tWinMap[tw.id]) {
      tWinMap[tw.id] = tw;
      activities.push({
        type: 'tournament_win', created_at: tw.created_at,
        message: `${tw.winner_name} won tournament "${tw.name}"`,
        link: `/tournament/${tw.id}`,
      });
    }
  }

  // Sort all by created_at and return latest 30
  activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const latestActivities = activities.slice(0, 30);
  writeRecentActivityCache(latestActivities);
  res.json(latestActivities);
});

// ---------------------------------------------------------------------------
// GET /api/social/daily-highlights — top plays, upscores, and clears for today
// ---------------------------------------------------------------------------
const DAILY_HIGHLIGHTS_TTL_MS = 60 * 1000;
let dailyHighlightsCache = { data: null, expiresAt: 0 };

function readDailyHighlightsCache() {
  if (!dailyHighlightsCache.data) return null;
  if (Date.now() >= dailyHighlightsCache.expiresAt) {
    dailyHighlightsCache = { data: null, expiresAt: 0 };
    return null;
  }
  return dailyHighlightsCache.data;
}

function writeDailyHighlightsCache(data) {
  dailyHighlightsCache = { data, expiresAt: Date.now() + DAILY_HIGHLIGHTS_TTL_MS };
}

function dedupeByUserChart(items) {
  const seen = new Set();
  return items.filter(item => {
    const title = item.song_title || item.new_song_title || '';
    const key = `${item.user_id}|${title}|${item.mode}|${item.level || item.new_level || 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickTopNDiverse(items, n, getUserId) {
  if (items.length <= n) return items.slice(0, n);
  const uniqueUsers = new Set(items.map(getUserId));
  if (uniqueUsers.size >= n) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
      const uid = getUserId(item);
      if (!seen.has(uid)) {
        seen.add(uid);
        result.push(item);
        if (result.length >= n) break;
      }
    }
    return result;
  }
  return items.slice(0, n);
}

router.get('/daily-highlights', (req, res) => {
  res.set('Cache-Control', `public, max-age=${Math.floor(DAILY_HIGHLIGHTS_TTL_MS / 1000)}`);
  const cached = readDailyHighlightsCache();
  if (cached) return res.json(cached);

  const db = getDb();

  // --- Top 5 replay plays today (highest rating = level * score) ---
  // Use played_at_utc >= date('now') for accurate "today" filter,
  // with date_played >= date('now') as fallback for rows missing played_at_utc.
  const todayFilter = `(
    (rp.played_at_utc IS NOT NULL AND rp.played_at_utc != '' AND rp.played_at_utc >= date('now'))
    OR rp.date_played >= date('now')
  )`;

  // Source 1: plays with replay_embed_url set directly on user_recently_played
  const directReplays = db.prepare(`
    SELECT rp.id, rp.user_id, rp.song_title, rp.mode, rp.level, rp.score, rp.grade, rp.plate,
           rp.perfect, rp.great, rp.good, rp.bad, rp.miss, rp.max_combo,
           rp.replay_embed_url, rp.replay_video_id, rp.replay_start_seconds, rp.replay_end_seconds,
           rp.background_url, rp.date_played, rp.played_at_utc, rp.machine_name,
           u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM play_comments WHERE play_id = rp.id) as comment_count
    FROM user_recently_played rp
    JOIN users u ON rp.user_id = u.id
    WHERE rp.replay_embed_url IS NOT NULL AND rp.replay_embed_url != ''
      AND ${todayFilter}
    ORDER BY (CAST(rp.level AS INTEGER) * CAST(rp.score AS INTEGER)) DESC
    LIMIT 20
  `).all();

  // Source 2: today's plays matched via songs → chart youtube links
  const chartLinkedReplays = db.prepare(`
    SELECT rp.id, rp.user_id, rp.song_title, rp.mode, rp.level, rp.score, rp.grade, rp.plate,
           rp.perfect, rp.great, rp.good, rp.bad, rp.miss, rp.max_combo,
           yt.session_youtube_url AS replay_embed_url, '' AS replay_video_id,
           0 AS replay_start_seconds, 0 AS replay_end_seconds,
           rp.background_url, rp.date_played, rp.played_at_utc, rp.machine_name,
           u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM play_comments WHERE play_id = rp.id) as comment_count
    FROM user_recently_played rp
    JOIN users u ON rp.user_id = u.id
    JOIN songs s ON s.title = rp.song_title AND s.mode = rp.mode AND s.level = rp.level
    JOIN user_chart_youtube_links yt ON yt.user_id = rp.user_id AND yt.chart_id = s.id
    WHERE yt.session_youtube_url IS NOT NULL AND yt.session_youtube_url != ''
      AND (rp.replay_embed_url IS NULL OR rp.replay_embed_url = '')
      AND ${todayFilter}
    ORDER BY (CAST(rp.level AS INTEGER) * CAST(rp.score AS INTEGER)) DESC
    LIMIT 20
  `).all();

  // Merge both sources, de-dupe by rp.id, sort by rating (level × score)
  const replayIdSet = new Set(directReplays.map((r) => r.id));
  const mergedReplays = [...directReplays];
  for (const r of chartLinkedReplays) {
    if (!replayIdSet.has(r.id)) {
      replayIdSet.add(r.id);
      mergedReplays.push(r);
    }
  }
  mergedReplays.sort((a, b) => (toInt(b.level) * toInt(b.score)) - (toInt(a.level) * toInt(a.score)));

  const topReplays = pickTopNDiverse(mergedReplays, 5, (r) => r.user_id).map((r) => ({
    ...r,
    avatar: normalizeUserAvatarForList(r.avatar, r.user_id, 40),
  }));

  // --- Top 5 upscores today (by pumbility_gain, player-diverse) ---
  const upscoreRows = db.prepare(`
    SELECT us.id as upscore_id, us.user_id, us.upscores_json, us.pumbility_gain as post_pumbility_gain,
           us.created_at, u.username, u.avatar, u.nationality
    FROM user_upscores us
    JOIN users u ON us.user_id = u.id
    WHERE us.created_at >= date('now')
    ORDER BY us.created_at DESC
    LIMIT 50
  `).all();

  const flatUpscores = [];
  for (const row of upscoreRows) {
    const enriched = enrichUpscoreRow(db, row);
    const items = safeParseJsonArray(enriched.upscores_json);
    for (const item of items) {
      const delta = (toInt(item.new_score) || toInt(item.score)) - toInt(item.old_score);
      flatUpscores.push({
        ...item,
        upscore_id: row.upscore_id,
        user_id: row.user_id,
        username: row.username,
        avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 40),
        nationality: row.nationality,
        pumbility_gain: toInt(item.pumbility_gain) || toInt(item.singles_pumbility_gain),
        score_delta: delta,
      });
    }
  }
  const dedupedUpscores = dedupeByUserChart(flatUpscores);
  dedupedUpscores.sort((a, b) => (b.pumbility_gain || b.score_delta) - (a.pumbility_gain || a.score_delta));
  let topUpscores = pickTopNDiverse(dedupedUpscores, 5, (u) => u.user_id);
  let topUpscoresIsFallback = false;

  if (topUpscores.length === 0) {
    // Fallback: recent historical upscores (last 7 days)
    const fallbackUpscoreRows = db.prepare(`
      SELECT us.id as upscore_id, us.user_id, us.upscores_json, us.pumbility_gain as post_pumbility_gain,
             us.created_at, u.username, u.avatar, u.nationality
      FROM user_upscores us
      JOIN users u ON us.user_id = u.id
      WHERE us.created_at >= date('now', '-7 days') AND us.created_at < date('now')
      ORDER BY us.created_at DESC
      LIMIT 50
    `).all();

    const fallbackFlatUpscores = [];
    for (const row of fallbackUpscoreRows) {
      const enriched = enrichUpscoreRow(db, row);
      const items = safeParseJsonArray(enriched.upscores_json);
      for (const item of items) {
        const delta = (toInt(item.new_score) || toInt(item.score)) - toInt(item.old_score);
        fallbackFlatUpscores.push({
          ...item,
          upscore_id: row.upscore_id,
          user_id: row.user_id,
          username: row.username,
          avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 40),
          nationality: row.nationality,
          pumbility_gain: toInt(item.pumbility_gain) || toInt(item.singles_pumbility_gain),
          score_delta: delta,
        });
      }
    }
    const dedupedFallbackUpscores = dedupeByUserChart(fallbackFlatUpscores);
    dedupedFallbackUpscores.sort((a, b) => (b.pumbility_gain || b.score_delta) - (a.pumbility_gain || a.score_delta));
    topUpscores = pickTopNDiverse(dedupedFallbackUpscores, 5, (u) => u.user_id);
    if (topUpscores.length > 0) topUpscoresIsFallback = true;
  }

  // --- Top 5 new clears today (hardest first, player-diverse) ---
  const clearRows = db.prepare(`
    SELECT nc.id as clear_id, nc.user_id, nc.song_title, nc.mode, nc.level, nc.score, nc.grade, nc.plate,
           nc.background_url, nc.clears_json, nc.pumbility_gain as post_pumbility_gain,
           nc.created_at, u.username, u.avatar, u.nationality
    FROM user_new_clears nc
    JOIN users u ON nc.user_id = u.id
    WHERE nc.created_at >= date('now')
    ORDER BY nc.created_at DESC
    LIMIT 50
  `).all();

  const flatClears = [];
  for (const row of clearRows) {
    const enriched = enrichClearRow(db, row);
    const items = safeParseJsonArray(enriched.clears_json);
    if (items.length > 0) {
      for (const item of items) {
        if (String(item?.entry_type || '') === 'title_unlock') continue;
        flatClears.push({
          ...item,
          clear_id: row.clear_id,
          user_id: row.user_id,
          username: row.username,
          avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 40),
          nationality: row.nationality,
          pumbility_gain: toInt(item.pumbility_gain) || toInt(item.singles_pumbility_gain),
        });
      }
    } else {
      flatClears.push({
        song_title: row.song_title,
        mode: row.mode,
        level: toInt(row.level),
        score: toInt(row.score),
        grade: row.grade || '',
        plate: row.plate || '',
        background_url: row.background_url || '',
        clear_id: row.clear_id,
        user_id: row.user_id,
        username: row.username,
        avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 40),
        nationality: row.nationality,
        pumbility_gain: toInt(row.post_pumbility_gain),
      });
    }
  }
  const dedupedClears = dedupeByUserChart(flatClears);
  dedupedClears.sort((a, b) => {
    const lvlDiff = toInt(b.level) - toInt(a.level);
    if (lvlDiff !== 0) return lvlDiff;
    return toInt(b.score) - toInt(a.score);
  });
  let topClears = pickTopNDiverse(dedupedClears, 5, (c) => c.user_id);
  let topClearsIsFallback = false;

  if (topClears.length === 0) {
    // Fallback: recent historical clears (last 7 days)
    const fallbackClearRows = db.prepare(`
      SELECT nc.id as clear_id, nc.user_id, nc.song_title, nc.mode, nc.level, nc.score, nc.grade, nc.plate,
             nc.background_url, nc.clears_json, nc.pumbility_gain as post_pumbility_gain,
             nc.created_at, u.username, u.avatar, u.nationality
      FROM user_new_clears nc
      JOIN users u ON nc.user_id = u.id
      WHERE nc.created_at >= date('now', '-7 days') AND nc.created_at < date('now')
      ORDER BY nc.created_at DESC
      LIMIT 50
    `).all();

    const fallbackFlatClears = [];
    for (const row of fallbackClearRows) {
      const enriched = enrichClearRow(db, row);
      const items = safeParseJsonArray(enriched.clears_json);
      if (items.length > 0) {
        for (const item of items) {
          if (String(item?.entry_type || '') === 'title_unlock') continue;
          fallbackFlatClears.push({
            ...item,
            clear_id: row.clear_id,
            user_id: row.user_id,
            username: row.username,
            avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 40),
            nationality: row.nationality,
            pumbility_gain: toInt(item.pumbility_gain) || toInt(item.singles_pumbility_gain),
          });
        }
      } else {
        fallbackFlatClears.push({
          song_title: row.song_title,
          mode: row.mode,
          level: toInt(row.level),
          score: toInt(row.score),
          grade: row.grade || '',
          plate: row.plate || '',
          background_url: row.background_url || '',
          clear_id: row.clear_id,
          user_id: row.user_id,
          username: row.username,
          avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 40),
          nationality: row.nationality,
          pumbility_gain: toInt(row.post_pumbility_gain),
        });
      }
    }
    const dedupedFallbackClears = dedupeByUserChart(fallbackFlatClears);
    dedupedFallbackClears.sort((a, b) => {
      const lvlDiff = toInt(b.level) - toInt(a.level);
      if (lvlDiff !== 0) return lvlDiff;
      return toInt(b.score) - toInt(a.score);
    });
    topClears = pickTopNDiverse(dedupedFallbackClears, 5, (c) => c.user_id);
    if (topClears.length > 0) topClearsIsFallback = true;
  }

  const result = {
    topReplays,
    topUpscores,
    topUpscoresIsFallback,
    topClears,
    topClearsIsFallback,
  };

  writeDailyHighlightsCache(result);
  res.json(result);
});

// ─── Weekly Challenge Play Posts ───────────────────────────

// GET /api/social/weekly-challenge-plays/lookup?weekId=123&userId=abc
router.get('/weekly-challenge-plays/lookup', optionalAuth, (req, res) => {
  const db = getDb();
  const weekId = parseInt(req.query.weekId, 10);
  const userId = String(req.query.userId || '').trim();

  if (!Number.isFinite(weekId) || weekId <= 0 || !userId) {
    return res.status(400).json({ error: 'weekId and userId are required' });
  }

  const row = db.prepare(`
    SELECT wcp.id,
           (
             SELECT COUNT(*)
             FROM weekly_challenge_play_comments wcc
             WHERE wcc.play_post_id = wcp.id
           ) AS comment_count
    FROM user_weekly_challenge_plays wcp
    WHERE wcp.week_id = ? AND wcp.user_id = ?
    LIMIT 1
  `).get(weekId, userId);

  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({
    play_post_id: row.id,
    comment_count: parseInt(row.comment_count, 10) || 0,
  });
});

// GET /api/social/weekly-challenge-plays/:id
router.get('/weekly-challenge-plays/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const row = db.prepare(`
    SELECT wcp.*, u.username, u.avatar, u.nationality, w.week_key,
           (SELECT COUNT(*) FROM weekly_challenge_play_pumps WHERE play_post_id = wcp.id) as pump_count,
           (SELECT COUNT(*) FROM weekly_challenge_play_comments WHERE play_post_id = wcp.id) as comment_count,
           CASE WHEN wpp_me.user_id IS NULL THEN 0 ELSE 1 END as user_pumped,
           'weekly_challenge' as type
    FROM user_weekly_challenge_plays wcp
    JOIN users u ON wcp.user_id = u.id
    JOIN weekly_challenge_weeks w ON w.id = wcp.week_id
    LEFT JOIN weekly_challenge_play_pumps wpp_me ON wpp_me.play_post_id = wcp.id AND wpp_me.user_id = ?
    WHERE wcp.id = ?
  `).get(req.user?.id || '', id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  row.avatar = normalizeUserAvatarForList(row.avatar, row.user_id, 64);
  res.json(row);
});

// POST /api/social/weekly-challenge-plays/:id/pump
router.post('/weekly-challenge-plays/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const post = db.prepare('SELECT id, user_id FROM user_weekly_challenge_plays WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Not found' });

  const existing = db.prepare(
    'SELECT 1 FROM weekly_challenge_play_pumps WHERE play_post_id = ? AND user_id = ?'
  ).get(postId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM weekly_challenge_play_pumps WHERE play_post_id = ? AND user_id = ?').run(postId, req.user.id);
  } else {
    db.prepare('INSERT INTO weekly_challenge_play_pumps (play_post_id, user_id) VALUES (?, ?)').run(postId, req.user.id);
  }

  const count = db.prepare('SELECT COUNT(*) as cnt FROM weekly_challenge_play_pumps WHERE play_post_id = ?').get(postId);
  res.json({ pumped: !existing, pump_count: count?.cnt || 0 });
});

// GET /api/social/weekly-challenge-plays/:id/pumps
router.get('/weekly-challenge-plays/:id/pumps', (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const pumpers = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.nationality, wpp.created_at
    FROM weekly_challenge_play_pumps wpp
    JOIN users u ON wpp.user_id = u.id
    WHERE wpp.play_post_id = ?
    ORDER BY wpp.created_at DESC
  `).all(postId);
  for (const p of pumpers) p.avatar = normalizeUserAvatarForList(p.avatar, p.id, 40);
  res.json(pumpers);
});

// GET /api/social/weekly-challenge-plays/:id/comments
router.get('/weekly-challenge-plays/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const comments = db.prepare(`
    SELECT c.id, c.play_post_id, c.user_id, c.content, c.parent_id, c.created_at,
           u.username, u.avatar, u.nationality
    FROM weekly_challenge_play_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.play_post_id = ?
    ORDER BY c.created_at ASC
  `).all(postId);

  // Count pumps per comment (reuse comment_pumps if it supports this type, otherwise skip)
  for (const c of comments) {
    c.avatar = normalizeUserAvatarForList(c.avatar, c.user_id, 40);
    c.pump_count = 0;
    c.user_pumped = 0;
  }
  res.json(comments);
});

// POST /api/social/weekly-challenge-plays/:id/comments
router.post('/weekly-challenge-plays/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const post = db.prepare('SELECT id FROM user_weekly_challenge_plays WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Not found' });

  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Content is required' });

  const parentId = req.body?.parent_id ? parseInt(req.body.parent_id) : null;

  const result = db.prepare(
    'INSERT INTO weekly_challenge_play_comments (play_post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)'
  ).run(postId, req.user.id, content, parentId);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.nationality
    FROM weekly_challenge_play_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  if (comment) comment.avatar = normalizeUserAvatarForList(comment.avatar, comment.user_id, 40);
  res.status(201).json(comment);
});

// DELETE /api/social/weekly-challenge-plays/comments/:id
router.delete('/weekly-challenge-plays/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const comment = db.prepare('SELECT id, user_id FROM weekly_challenge_play_comments WHERE id = ?').get(parseInt(req.params.id));
  if (!comment) return res.status(404).json({ error: 'Not found' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM weekly_challenge_play_comments WHERE id = ?').run(comment.id);
  res.json({ success: true });
});

module.exports = router;
module.exports.invalidateRecentActivityCache = invalidateRecentActivityCache;

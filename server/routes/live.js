const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');
const { notifyActivitySubscribers, buildProfilePath } = require('../lib/activitySubscriptions');
const { addLiveSessionClient, emitLiveSessionEvent } = require('../lib/liveSessionHub');
const { buildLiveSessionSummary } = require('../lib/liveSessionSummary');
const {
  DEFAULT_HOP_WARMUP_SECONDS,
  DEFAULT_HOP_WINDOW_SECONDS,
  HOP_SESSION_TYPE,
  LIVE_SESSION_TYPE,
  buildHourOfPowerShare,
  formatSqliteDateTime,
  isHourOfPowerSession,
  normalizeSessionType,
  resolveHourOfPowerConfig,
  summarizeHourOfPower,
} = require('../lib/hourOfPower');
const { calculateRatingPoints, gradeFromScore, normalizeGrade } = require('../lib/titleProgress');
const {
  getSessionInteractionCounts,
  getSessionMessageCount,
  getSessionRequestCounts,
} = require('../lib/liveSessionMetrics');
const { serializeLiveSessionMarker } = require('../lib/liveSessionMarker');
const { createUserNotification } = require('../lib/notifications');
const { normalizePiugamePlayedAtUtc } = require('../lib/piugameDate');
const {
  extractYoutubeVideoId,
  getYoutubeBroadcastById,
  getYoutubeVideoById,
  updateYoutubeVideoDescription,
} = require('../lib/youtube');
const {
  buildYoutubeTimestampPayload,
  upsertManagedYoutubeChaptersBlock,
} = require('../lib/youtubeTimestamps');
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
const LIVE_SYNC_ACTIVE_INTERVAL_MS = 30000;
const LIVE_SYNC_IDLE_INTERVAL_MS = 45000;
const LIVE_SYNC_IDLE_AFTER_MS = 3 * 60 * 1000;
const DEFAULT_REQUEST_MAX_LEVEL = 30;
const SONG_ALIAS_PATH = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');
const REPLAY_POST_SONG_BUFFER_SECONDS = 20;
const LIVE_PARTICIPANT_ROLE_OWNER = 'owner';
const LIVE_PARTICIPANT_ROLE_COHOST = 'cohost';
const LIVE_PARTICIPANT_STATUS_ACTIVE = 'active';
const LIVE_PARTICIPANT_STATUS_LEFT = 'left';
const FAILURE_MESSAGES = [
  'Stage break. Run it back.',
  'Close miss. Reset and clear it.',
  'Missed this one. Next run.',
  'Tough chart. Go again.',
  'Not this pass. Reload.',
];
const PERFORMANCE_MESSAGE_TIERS = [
  {
    id: 'tier_1_a_rank',
    grades: ['A', 'A+'],
    messages: [
      'Clutch clear.',
      'Messy but clear.',
      'Pass secured.',
      'Barely, but boarded.',
      'Survived the chart.',
    ],
  },
  {
    id: 'tier_2_aa_rank',
    grades: ['AA', 'AA+'],
    messages: [
      'Solid run.',
      'Getting cleaner.',
      'Close to S.',
      'Rhythm locked in.',
      'Tighten the timing.',
    ],
  },
  {
    id: 'tier_3_aaa_rank',
    grades: ['AAA', 'AAA+'],
    messages: [
      'Sharp run.',
      'Very clean.',
      'AAA heat.',
      'Strong control.',
      'Smooth work.',
    ],
  },
  {
    id: 'tier_4_s_ss_rank',
    grades: ['S', 'S+', 'SS', 'SS+'],
    messages: [
      'Absolute heat.',
      'Elite pace.',
      'Top-tier run.',
      'Machine-melting form.',
      'Ridiculous control.',
    ],
  },
  {
    id: 'tier_5_sss_rank',
    grades: ['SSS', 'SSS+'],
    messages: [
      'Unreal run.',
      'Legend pace.',
      'Peak form.',
      'Clip that.',
      'Total shutdown.',
    ],
  },
];
let cachedHopOptimizeSongAliases = null;
const FALLBACK_PASS_MESSAGES = [
  'Clear secured.',
  'Nice work. Keep the run going.',
  'Solid pass. Stay locked in.',
  'That one is on the board.',
];
const UPSCORE_CONTEXT_MESSAGES = [
  'New upscore.',
  'Fresh personal best.',
  'Score line pushed higher.',
  'That PB just moved.',
];
const CLEAR_CONTEXT_MESSAGES = [
  'First clear on this chart.',
  'New clear secured.',
  'Clear banner unlocked.',
  'That chart is officially conquered.',
];

const syncRecentlyPlayedForUser = piugameRoutes.syncRecentlyPlayedForUser;
const insertGroupedNewClearPost = piugameRoutes.insertGroupedNewClearPost;
const invalidateRecentActivityCache = socialRoutes.invalidateRecentActivityCache;
const voteCloseTimers = new Map();
const liveSyncTimers = new Map();
const liveSyncInFlight = new Set();
const livePresenceBroadcastState = new Map();
const livePlayOutcomeCache = new Map();
let cachedSongAliases = null;
let cachedSongDurations = null;

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

function parseSongFlags(flags) {
  if (Array.isArray(flags)) {
    return flags
      .map((flag) => String(flag || '').trim())
      .filter(Boolean);
  }
  return String(flags || '')
    .split(',')
    .map((flag) => flag.trim())
    .filter(Boolean);
}

function normalizeSongName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeHopSongTitle(songTitle) {
  const normalized = String(songTitle || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const shortCutSuffixPattern = /\s*-\s*SHORT CUT\s*-\s*$/i;
  if (shortCutSuffixPattern.test(normalized)) {
    return normalized.replace(shortCutSuffixPattern, ' - SHORT CUT -');
  }
  return normalized;
}

function resolveKnownSongVariantTitle(rawTitle, songKey = '', flags = '') {
  const title = normalizeHopSongTitle(rawTitle);
  if (!title) return '';
  const normalizedFlags = parseSongFlags(flags).map((flag) => flag.toLowerCase());
  const isShortCut = normalizedFlags.includes('cut:1')
    || (normalizeSongName(title) === 'yog-sothoth' && String(songKey || '').trim() === '313');
  if (isShortCut) {
    return `${title} - SHORT CUT -`;
  }
  return title;
}

function normalizePiugameSongName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizePiugameMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'single' || normalized === 'singles' || normalized === 's') return 'Single';
  if (normalized === 'double' || normalized === 'doubles' || normalized === 'd') return 'Double';
  if (normalized === 'coop' || normalized === 'co-op' || normalized === 'co op' || normalized === 'cooperative' || normalized === 'c') return 'CoOp';
  return String(mode || '').trim();
}

function loadHopOptimizeSongAliases() {
  if (cachedHopOptimizeSongAliases) return cachedHopOptimizeSongAliases;

  const aliases = {};
  if (!fs.existsSync(SONG_ALIAS_PATH)) {
    cachedHopOptimizeSongAliases = aliases;
    return aliases;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(SONG_ALIAS_PATH, 'utf-8'));
    const rawAliases = payload?.aliases && typeof payload.aliases === 'object' ? payload.aliases : {};
    for (const [alias, canonical] of Object.entries(rawAliases)) {
      const aliasKey = normalizePiugameSongName(alias);
      const canonicalKey = normalizePiugameSongName(canonical);
      if (!aliasKey || !canonicalKey) continue;
      aliases[aliasKey] = canonicalKey;
    }
  } catch (err) {
    console.warn('Failed to load HoP optimizer song aliases:', err.message);
  }

  cachedHopOptimizeSongAliases = aliases;
  return aliases;
}

function toCanonicalHopSongTitle(songTitle, aliases = null) {
  const normalized = normalizePiugameSongName(normalizeHopSongTitle(songTitle));
  if (!normalized) return '';
  const aliasLookup = aliases || loadHopOptimizeSongAliases();
  const seen = new Set();
  let current = normalized;
  while (aliasLookup[current] && !seen.has(current)) {
    seen.add(current);
    current = aliasLookup[current];
  }
  return current;
}

function buildHopOptimizeChartKey(songTitle, mode, level, aliases = null) {
  const title = toCanonicalHopSongTitle(songTitle, aliases);
  const chartMode = normalizePiugameMode(mode);
  const chartLevel = toInt(level);
  if (!title || !chartMode || chartLevel <= 0) return '';
  return `${title}|${chartMode}|${chartLevel}`;
}

function compareHopOptimizeByEfficiency(a, b) {
  if (b.rating_points_per_second !== a.rating_points_per_second) {
    return b.rating_points_per_second - a.rating_points_per_second;
  }
  if (b.rating_points !== a.rating_points) {
    return b.rating_points - a.rating_points;
  }
  if (a.duration_seconds !== b.duration_seconds) {
    return a.duration_seconds - b.duration_seconds;
  }
  if (a.level !== b.level) {
    return a.level - b.level;
  }
  return String(a.song_title || '').localeCompare(String(b.song_title || ''));
}

function compareHopOptimizeByLevel(a, b) {
  if (a.level !== b.level) {
    return a.level - b.level;
  }
  if (a.mode !== b.mode) {
    return String(a.mode || '').localeCompare(String(b.mode || ''));
  }
  return compareHopOptimizeByEfficiency(a, b);
}

function getHourOfPowerOptimizePayload(db, userId, limit = 20) {
  const normalizedUserId = String(userId || '').trim();
  const aliases = loadHopOptimizeSongAliases();
  const syncRow = db.prepare(`
    SELECT last_best_scores_sync, best_scores_imported
    FROM user_piugame_sync
    WHERE user_id = ?
  `).get(normalizedUserId);
  const scoreRows = db.prepare(`
    SELECT song_title, mode, level, score, grade, background_url, over_top100_rank
    FROM user_best_scores
    WHERE user_id = ?
      AND score > 0
      AND mode IN ('Single', 'Double')
  `).all(normalizedUserId);
  const chartRows = db.prepare(`
    SELECT title, mode, level, jacket_url, duration_seconds, song_key, flags
    FROM songs
    WHERE duration_seconds > 0
      AND mode IN ('Single', 'Double')
  `).all();

  const chartByKey = new Map();
  for (const row of chartRows) {
    const resolvedTitle = resolveKnownSongVariantTitle(row?.title, row?.song_key, row?.flags);
    const key = buildHopOptimizeChartKey(resolvedTitle, row?.mode, row?.level, aliases);
    if (!key) continue;

    const candidate = {
      jacket_url: String(row?.jacket_url || '').trim(),
      duration_seconds: toInt(row?.duration_seconds),
    };
    const existing = chartByKey.get(key);
    if (!existing) {
      chartByKey.set(key, candidate);
      continue;
    }
    if ((existing.duration_seconds <= 0 && candidate.duration_seconds > 0)
      || (!existing.jacket_url && candidate.jacket_url)) {
      chartByKey.set(key, candidate);
    }
  }

  const recommendations = scoreRows.map((row) => {
    const resolvedGrade = normalizeGrade(row?.grade || '') || gradeFromScore(row?.score);
    const ratingPoints = calculateRatingPoints(row?.level, resolvedGrade, row?.score);
    if (ratingPoints <= 0) return null;

    const chartKey = buildHopOptimizeChartKey(row?.song_title, row?.mode, row?.level, aliases);
    if (!chartKey) return null;
    const chart = chartByKey.get(chartKey) || null;
    const durationSeconds = toInt(chart?.duration_seconds);
    if (durationSeconds <= 0) return null;

    return {
      chart_key: chartKey,
      song_title: String(row?.song_title || '').trim(),
      mode: normalizePiugameMode(row?.mode),
      level: toInt(row?.level),
      score: toInt(row?.score),
      grade: resolvedGrade,
      rating_points: ratingPoints,
      duration_seconds: durationSeconds,
      rating_points_per_second: Number((ratingPoints / durationSeconds).toFixed(4)),
      over_top100_rank: toInt(row?.over_top100_rank),
      jacket_url: String(chart?.jacket_url || row?.background_url || '').trim(),
    };
  }).filter(Boolean);

  const rankedRecommendations = recommendations.slice().sort(compareHopOptimizeByEfficiency);
  const levelOrderedRecommendations = recommendations.slice().sort(compareHopOptimizeByLevel);
  const singleCount = recommendations.filter((row) => row.mode === 'Single').length;
  const doubleCount = recommendations.filter((row) => row.mode === 'Double').length;
  const bestRecommendation = rankedRecommendations[0] || null;

  return {
    user_id: normalizedUserId,
    imported: !!syncRow?.best_scores_imported,
    last_sync: syncRow?.last_best_scores_sync || null,
    eligible_chart_count: recommendations.length,
    single_chart_count: singleCount,
    double_chart_count: doubleCount,
    best_rating_points_per_second: Number(bestRecommendation?.rating_points_per_second || 0),
    best_recommendation: bestRecommendation,
    top_recommendations: rankedRecommendations.slice(0, Math.max(1, Math.min(50, toInt(limit) || 20))),
    level_order_recommendations: levelOrderedRecommendations,
  };
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

function normalizeSongName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function loadSongAliases() {
  if (cachedSongAliases) return cachedSongAliases;
  if (!fs.existsSync(SONG_ALIAS_PATH)) {
    cachedSongAliases = {};
    return cachedSongAliases;
  }

  try {
    const data = JSON.parse(fs.readFileSync(SONG_ALIAS_PATH, 'utf-8'));
    const rawAliases = (data && typeof data.aliases === 'object' && data.aliases) || {};
    const normalizedAliases = {};

    for (const [alias, canonical] of Object.entries(rawAliases)) {
      const aliasNorm = normalizeSongName(alias);
      const canonicalNorm = normalizeSongName(canonical);
      if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
      if (!normalizedAliases[aliasNorm]) normalizedAliases[aliasNorm] = canonicalNorm;
    }

    cachedSongAliases = normalizedAliases;
  } catch {
    cachedSongAliases = {};
  }

  return cachedSongAliases;
}

function loadSongDurationLookup(db) {
  if (cachedSongDurations) return cachedSongDurations;

  const aliases = loadSongAliases();
  const rows = db.prepare(`
    SELECT title, mode, level, duration_seconds, duration_source
    FROM songs
    WHERE COALESCE(duration_seconds, 0) > 0
  `).all();
  const lookup = new Map();

  for (const row of rows) {
    const titleKey = toCanonicalSongTitle(row.title, aliases);
    const modeKey = normalizeSongName(row.mode);
    const level = toInt(row.level);
    const durationSeconds = toInt(row.duration_seconds);
    if (!titleKey || !modeKey || level <= 0 || durationSeconds <= 0) continue;

    const lookupKey = `${titleKey}|${modeKey}|${level}`;
    const existing = lookup.get(lookupKey);
    if (!existing || durationSeconds > toInt(existing.duration_seconds)) {
      lookup.set(lookupKey, {
        duration_seconds: durationSeconds,
        duration_source: String(row.duration_source || '').trim(),
      });
    }
  }

  cachedSongDurations = lookup;
  return cachedSongDurations;
}

function toCanonicalSongTitle(title, aliases) {
  let normalized = normalizeSongName(title);
  if (!normalized) return '';

  const seen = new Set();
  while (aliases[normalized] && !seen.has(normalized)) {
    seen.add(normalized);
    normalized = aliases[normalized];
  }
  return normalized;
}

function getSongDurationForChart(db, title, mode, level) {
  const aliases = loadSongAliases();
  const durationLookup = loadSongDurationLookup(db);
  const lookupKey = `${toCanonicalSongTitle(title, aliases)}|${normalizeSongName(mode)}|${toInt(level)}`;
  return durationLookup.get(lookupKey) || null;
}

function getEmptyYoutubeSessionFields() {
  return {
    youtube_broadcast_id: '',
    youtube_video_id: '',
    youtube_channel_id: '',
    youtube_stream_title: '',
    youtube_lifecycle_status: '',
    youtube_scheduled_start_time: '',
    youtube_actual_start_time: '',
  };
}

function getCurrentYoutubeSessionFields(session) {
  return {
    youtube_broadcast_id: String(session?.youtube_broadcast_id || '').trim(),
    youtube_video_id: String(session?.youtube_video_id || '').trim(),
    youtube_channel_id: String(session?.youtube_channel_id || '').trim(),
    youtube_stream_title: String(session?.youtube_stream_title || '').trim(),
    youtube_lifecycle_status: String(session?.youtube_lifecycle_status || '').trim(),
    youtube_scheduled_start_time: String(session?.youtube_scheduled_start_time || '').trim(),
    youtube_actual_start_time: String(session?.youtube_actual_start_time || '').trim(),
  };
}

function buildYoutubeSessionFields(broadcast) {
  if (!broadcast?.id) return getEmptyYoutubeSessionFields();
  return {
    youtube_broadcast_id: String(broadcast.id || '').trim(),
    youtube_video_id: String(broadcast.video_id || broadcast.id || '').trim(),
    youtube_channel_id: String(broadcast.channel_id || '').trim(),
    youtube_stream_title: normalizeText(broadcast.title || '', 160),
    youtube_lifecycle_status: normalizeText(broadcast.life_cycle_status || '', 40),
    youtube_scheduled_start_time: normalizeText(broadcast.scheduled_start_time || '', 40),
    youtube_actual_start_time: normalizeText(broadcast.actual_start_time || '', 40),
  };
}

async function resolveLiveStreamSelection(db, hostUserId, payload, currentSession = null) {
  const hasStreamUrl = !!payload && Object.prototype.hasOwnProperty.call(payload, 'stream_url');
  const hasYoutubeBroadcastId = !!payload && Object.prototype.hasOwnProperty.call(payload, 'youtube_broadcast_id');
  const nextStreamUrl = hasStreamUrl
    ? normalizeUrl(payload?.stream_url, 400)
    : normalizeUrl(currentSession?.stream_url, 400);

  if (hasYoutubeBroadcastId) {
    const requestedBroadcastId = String(payload?.youtube_broadcast_id || '').trim();
    if (!requestedBroadcastId) {
      return {
        streamUrl: nextStreamUrl,
        youtubeFields: getEmptyYoutubeSessionFields(),
      };
    }
    const broadcast = await getYoutubeBroadcastById(db, hostUserId, requestedBroadcastId);
    if (!broadcast) {
      const err = new Error('Unable to find that YouTube live stream on the linked channel');
      err.statusCode = 404;
      throw err;
    }
    return {
      streamUrl: normalizeUrl(broadcast.stream_url, 400),
      youtubeFields: buildYoutubeSessionFields(broadcast),
    };
  }

  if (!hasStreamUrl) {
    return {
      streamUrl: nextStreamUrl,
      youtubeFields: currentSession ? getCurrentYoutubeSessionFields(currentSession) : getEmptyYoutubeSessionFields(),
    };
  }

  const currentYoutubeVideoId = String(currentSession?.youtube_video_id || '').trim();
  const nextVideoId = extractYoutubeVideoId(nextStreamUrl);
  const keepCurrentYoutubeSelection = currentSession && currentYoutubeVideoId && nextVideoId && currentYoutubeVideoId === nextVideoId;
  return {
    streamUrl: nextStreamUrl,
    youtubeFields: keepCurrentYoutubeSelection ? getCurrentYoutubeSessionFields(currentSession) : getEmptyYoutubeSessionFields(),
  };
}

function normalizeRequestModeFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'single' || normalized === 'singles') return 'Single';
  if (normalized === 'double' || normalized === 'doubles') return 'Double';
  return 'All';
}

function normalizeRequestMaxLevel(value) {
  const level = toInt(value);
  return level > 0 ? Math.min(level, 30) : DEFAULT_REQUEST_MAX_LEVEL;
}

function isPassingBestScore(score, grade) {
  const numericScore = toInt(score);
  if (numericScore <= 0) return false;
  const normalizedGrade = String(grade || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!normalizedGrade) return true;
  if (normalizedGrade === 'F' || normalizedGrade === 'STAGEBREAK' || normalizedGrade === 'STAGE_BREAK') return false;
  return !/^X(?:[_-]|$)/.test(normalizedGrade);
}

function getDefaultRequestMaxLevelForUser(db, userId) {
  const rows = db.prepare(`
    SELECT level, score, grade
    FROM user_best_scores
    WHERE user_id = ?
      AND score > 0
  `).all(userId);

  let highestPassedLevel = 0;
  for (const row of rows) {
    if (!isPassingBestScore(row?.score, row?.grade)) continue;
    highestPassedLevel = Math.max(highestPassedLevel, toInt(row?.level));
  }

  return highestPassedLevel > 0
    ? Math.min(highestPassedLevel, DEFAULT_REQUEST_MAX_LEVEL)
    : DEFAULT_REQUEST_MAX_LEVEL;
}

function requestPolicyAllowsChart(session, chart) {
  const modeFilter = normalizeRequestModeFilter(session?.request_mode_filter);
  const maxLevel = normalizeRequestMaxLevel(session?.request_max_level);
  if (modeFilter !== 'All' && String(chart?.mode || '') !== modeFilter) return false;
  return toInt(chart?.level) <= maxLevel;
}

function buildRequestPolicyDescription(session) {
  const modeFilter = normalizeRequestModeFilter(session?.request_mode_filter);
  const maxLevel = normalizeRequestMaxLevel(session?.request_max_level);
  const modeLabel = modeFilter === 'Single' ? 'Singles' : modeFilter === 'Double' ? 'Doubles' : 'All charts';
  return `${modeLabel} up to Lv.${maxLevel}`;
}

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function buildPlayOutcomeKey(songTitle, mode, level, score, userId = '') {
  return [
    normalizeText(songTitle, 160).toLowerCase(),
    normalizeText(mode, 40).toLowerCase(),
    toInt(level),
    toInt(score),
    normalizeText(userId, 80).toLowerCase(),
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

function normalizeGradeKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function getPerformanceMessageSelection(play) {
  if (isFailLike(play)) {
    return {
      key: 'fail',
      messages: FAILURE_MESSAGES,
    };
  }

  const grade = normalizeGradeKey(play?.grade);
  const tier = PERFORMANCE_MESSAGE_TIERS.find((entry) => entry.grades.includes(grade));
  if (tier) {
    return {
      key: tier.id,
      messages: tier.messages,
    };
  }

  return {
    key: 'fallback_pass',
    messages: FALLBACK_PASS_MESSAGES,
  };
}

function formatPlayLabel(play) {
  const mode = String(play?.mode || '');
  const modeShort = mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : mode ? mode[0].toUpperCase() : 'X';
  return `${normalizeText(play?.song_title || 'Unknown chart', 160)} (${modeShort}${toInt(play?.level) || '?'})`;
}

function getPlayPerformerLabel(play, fallback = '') {
  return normalizeText(
    play?.username
      || play?.performer_username
      || fallback
      || '',
    60
  );
}

function getSongJacketUrl(db, chartId) {
  const normalizedChartId = toInt(chartId);
  if (normalizedChartId <= 0) return '';
  const row = db.prepare(`
    SELECT jacket_url
    FROM songs
    WHERE id = ?
    LIMIT 1
  `).get(normalizedChartId);
  return row?.jacket_url || '';
}

function buildRequestFulfillmentMessage(play, requesters = []) {
  const names = Array.from(new Set(
    (Array.isArray(requesters) ? requesters : [])
      .map((name) => normalizeText(name, 60))
      .filter(Boolean)
  ));
  const label = formatPlayLabel(play);
  const performer = getPlayPerformerLabel(play);
  const baseLabel = performer ? `${performer} hit ${label}` : label;
  if (names.length === 0) return `Request hit: ${baseLabel}.`;
  if (names.length === 1) return `Request hit: ${baseLabel} for ${names[0]}.`;
  const lead = names.slice(0, 2).join(', ');
  return `Request hit: ${baseLabel} for ${lead}${names.length > 2 ? ` +${names.length - 2} more` : ''}.`;
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

function getViewerCount(db, session, options = {}) {
  if (options.cleanup === true) {
    cleanupPresence(db, session.id);
  }
  const row = db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS count
    FROM live_session_presence
    WHERE live_session_id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM live_session_participants p
        WHERE p.live_session_id = live_session_presence.live_session_id
          AND p.user_id = live_session_presence.user_id
          AND p.status = ?
      )
  `).get(session.id, LIVE_PARTICIPANT_STATUS_ACTIVE);
  return Math.max(0, toInt(row?.count));
}

function updateViewerPeak(db, sessionId, viewerCount) {
  const count = Math.max(0, toInt(viewerCount));
  const row = db.prepare('SELECT viewer_peak FROM live_sessions WHERE id = ?').get(sessionId);
  const currentPeak = Math.max(0, toInt(row?.viewer_peak));
  if (count > currentPeak) {
    db.prepare(`
      UPDATE live_sessions
      SET viewer_peak = ?
      WHERE id = ?
    `).run(count, sessionId);
    return count;
  }
  return currentPeak;
}

function getViewerPeak(session, viewerCount = 0) {
  return Math.max(Math.max(0, toInt(session?.viewer_peak)), Math.max(0, toInt(viewerCount)));
}

function shouldBroadcastPresence(liveSessionId, viewerCount, viewerPeak) {
  const key = String(liveSessionId || '').trim();
  if (!key) return false;

  const nextState = {
    viewer_count: Math.max(0, toInt(viewerCount)),
    viewer_peak: Math.max(0, toInt(viewerPeak)),
  };
  const previousState = livePresenceBroadcastState.get(key);
  if (
    previousState
    && previousState.viewer_count === nextState.viewer_count
    && previousState.viewer_peak === nextState.viewer_peak
  ) {
    return false;
  }
  livePresenceBroadcastState.set(key, nextState);
  return true;
}

function clearPresenceBroadcastState(liveSessionId) {
  const key = String(liveSessionId || '').trim();
  if (!key) return;
  livePresenceBroadcastState.delete(key);
}

function clearPlayOutcomeCache(liveSessionId) {
  const key = String(liveSessionId || '').trim();
  if (!key) return;
  livePlayOutcomeCache.delete(key);
}

function clearLiveSessionVoteTimers(db, liveSessionId) {
  const key = String(liveSessionId || '').trim();
  if (!db || !key) return;
  const rows = db.prepare(`
    SELECT id
    FROM live_session_votes
    WHERE live_session_id = ?
  `).all(key);

  for (const row of rows) {
    clearVoteCloseTimer(row.id);
  }
}

function clearLiveSessionRuntimeState(db, liveSessionId) {
  const key = String(liveSessionId || '').trim();
  if (!key) return;
  clearLiveSyncTimer(key);
  clearPresenceBroadcastState(key);
  clearPlayOutcomeCache(key);
  clearLiveSessionVoteTimers(db, key);
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
      AND COALESCE(deleted_at, '') = ''
  `).get(sessionId);
}

function normalizeLiveParticipantRole(role) {
  return String(role || '').trim().toLowerCase() === LIVE_PARTICIPANT_ROLE_OWNER
    ? LIVE_PARTICIPANT_ROLE_OWNER
    : LIVE_PARTICIPANT_ROLE_COHOST;
}

function normalizeLiveParticipantStatus(status) {
  return String(status || '').trim().toLowerCase() === LIVE_PARTICIPANT_STATUS_LEFT
    ? LIVE_PARTICIPANT_STATUS_LEFT
    : LIVE_PARTICIPANT_STATUS_ACTIVE;
}

function ensureSessionOwnerParticipant(db, sessionOrId) {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  if (!session?.id || !session?.host_user_id) return;

  db.prepare(`
    INSERT INTO live_session_participants (
      live_session_id, user_id, role, status, added_by_user_id, joined_at, left_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now')), '', COALESCE(NULLIF(?, ''), datetime('now')), datetime('now'))
    ON CONFLICT(live_session_id, user_id) DO UPDATE SET
      role = excluded.role,
      status = excluded.status,
      added_by_user_id = excluded.added_by_user_id,
      joined_at = COALESCE(NULLIF(live_session_participants.joined_at, ''), excluded.joined_at),
      left_at = CASE
        WHEN live_session_participants.status = ? THEN ''
        ELSE live_session_participants.left_at
      END,
      updated_at = datetime('now')
  `).run(
    session.id,
    session.host_user_id,
    LIVE_PARTICIPANT_ROLE_OWNER,
    LIVE_PARTICIPANT_STATUS_ACTIVE,
    session.host_user_id,
    session.started_at || session.created_at || '',
    session.created_at || session.started_at || '',
    LIVE_PARTICIPANT_STATUS_LEFT
  );

  db.prepare(`
    INSERT INTO live_session_participant_sync (
      live_session_id, user_id, recent_anchor_id, last_recent_row_id, last_sync_at, last_sync_status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now')), datetime('now'))
    ON CONFLICT(live_session_id, user_id) DO NOTHING
  `).run(
    session.id,
    session.host_user_id,
    toInt(session.recent_anchor_id),
    toInt(session.last_recent_row_id),
    session.last_sync_at || '',
    session.last_sync_status || '',
    session.created_at || session.started_at || ''
  );
}

function normalizeLiveParticipantRow(row, hostUserId, currentUserId = '') {
  if (!row) return null;
  const role = normalizeLiveParticipantRole(row.role);
  const status = normalizeLiveParticipantStatus(row.status);
  return {
    live_session_id: row.live_session_id || '',
    user_id: row.user_id || '',
    username: row.username || '',
    avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 56, row.avatar_v),
    nationality: row.nationality || '',
    skill_title: row.skill_title || '',
    pumbility: toInt(row.pumbility),
    weight_kg: Number.isFinite(Number(row.weight_kg)) ? Number(row.weight_kg) : 0,
    role,
    status,
    added_by_user_id: row.added_by_user_id || '',
    joined_at: row.joined_at || '',
    left_at: row.left_at || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    is_host: String(hostUserId || '') === String(row.user_id || ''),
    is_current_user: String(currentUserId || '') === String(row.user_id || ''),
  };
}

function getSessionParticipants(db, sessionOrId, options = {}) {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  if (!session?.id) return [];
  ensureSessionOwnerParticipant(db, session);

  const includeLeft = !!options.includeLeft;
  const rows = db.prepare(`
    SELECT
      p.*,
      u.username,
      COALESCE(u.avatar, '') AS avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.pumbility, 0) AS pumbility,
      COALESCE(u.weight_kg, 0) AS weight_kg
    FROM live_session_participants p
    JOIN users u ON u.id = p.user_id
    WHERE p.live_session_id = ?
      AND (? = 1 OR p.status = ?)
    ORDER BY
      CASE p.role
        WHEN ? THEN 0
        ELSE 1
      END ASC,
      CASE p.status
        WHEN ? THEN 0
        ELSE 1
      END ASC,
      datetime(COALESCE(NULLIF(p.joined_at, ''), p.created_at)) ASC,
      LOWER(u.username) ASC
  `).all(
    session.id,
    includeLeft ? 1 : 0,
    LIVE_PARTICIPANT_STATUS_ACTIVE,
    LIVE_PARTICIPANT_ROLE_OWNER,
    LIVE_PARTICIPANT_STATUS_ACTIVE
  );

  return rows
    .map((row) => normalizeLiveParticipantRow(row, session.host_user_id, options.currentUserId || ''))
    .filter(Boolean);
}

function getSessionParticipantRecord(db, sessionOrId, userId, options = {}) {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  const normalizedUserId = String(userId || '').trim();
  if (!session?.id || !normalizedUserId) return null;
  ensureSessionOwnerParticipant(db, session);

  const row = db.prepare(`
    SELECT
      p.*,
      u.username,
      COALESCE(u.avatar, '') AS avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.pumbility, 0) AS pumbility,
      COALESCE(u.weight_kg, 0) AS weight_kg
    FROM live_session_participants p
    JOIN users u ON u.id = p.user_id
    WHERE p.live_session_id = ?
      AND p.user_id = ?
      AND (? = 1 OR p.status = ?)
    LIMIT 1
  `).get(
    session.id,
    normalizedUserId,
    options.includeLeft ? 1 : 0,
    LIVE_PARTICIPANT_STATUS_ACTIVE
  );

  return normalizeLiveParticipantRow(row, session.host_user_id, options.currentUserId || '');
}

function getActiveSessionForHost(db, hostUserId) {
  return db.prepare(`
    SELECT *
    FROM live_sessions
    WHERE host_user_id = ?
      AND COALESCE(deleted_at, '') = ''
      AND status = 'live'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(hostUserId);
}

function getActiveSessionForParticipant(db, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  return db.prepare(`
    SELECT s.*
    FROM live_session_participants p
    JOIN live_sessions s ON s.id = p.live_session_id
    WHERE p.user_id = ?
      AND p.status = ?
      AND s.status = 'live'
      AND COALESCE(s.deleted_at, '') = ''
    ORDER BY
      CASE p.role
        WHEN ? THEN 0
        ELSE 1
      END ASC,
      datetime(COALESCE(NULLIF(s.started_at, ''), s.created_at)) DESC,
      s.id DESC
    LIMIT 1
  `).get(
    normalizedUserId,
    LIVE_PARTICIPANT_STATUS_ACTIVE,
    LIVE_PARTICIPANT_ROLE_OWNER
  );
}

function getSessionSyncActors(db, session) {
  return getSessionParticipants(db, session, { currentUserId: session?.host_user_id || '' })
    .filter((participant) => participant.status === LIVE_PARTICIPANT_STATUS_ACTIVE)
    .map((participant) => ({
      id: participant.user_id,
      username: participant.username || '',
      avatar: participant.avatar || '',
      skill_title: participant.skill_title || '',
      nationality: participant.nationality || '',
      pumbility: toInt(participant.pumbility),
      role: participant.role,
      status: participant.status,
    }));
}

function ensureParticipantSyncCursor(db, sessionOrId, userId, defaults = {}) {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  const normalizedUserId = String(userId || '').trim();
  if (!session?.id || !normalizedUserId) return null;

  db.prepare(`
    INSERT INTO live_session_participant_sync (
      live_session_id, user_id, recent_anchor_id, last_recent_row_id, last_sync_at, last_sync_status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(live_session_id, user_id) DO NOTHING
  `).run(
    session.id,
    normalizedUserId,
    toInt(defaults.recent_anchor_id),
    toInt(defaults.last_recent_row_id),
    defaults.last_sync_at || '',
    defaults.last_sync_status || ''
  );

  return db.prepare(`
    SELECT *
    FROM live_session_participant_sync
    WHERE live_session_id = ?
      AND user_id = ?
    LIMIT 1
  `).get(session.id, normalizedUserId);
}

function markLiveSessionSyncError(db, liveSessionId) {
  db.prepare(`
    UPDATE live_sessions
    SET last_sync_status = 'error',
        updated_at = datetime('now')
    WHERE id = ?
  `).run(liveSessionId);
}

function markLiveSyncPlayActivity(liveSessionId, at = Date.now()) {
  const key = String(liveSessionId || '').trim();
  if (!key) return;
  const state = liveSyncTimers.get(key);
  if (!state) return;
  state.lastPlayAt = Number.isFinite(Number(at)) ? Number(at) : Date.now();
}

function getLiveSyncIntervalMs(liveSessionId) {
  const key = String(liveSessionId || '').trim();
  if (!key) return LIVE_SYNC_IDLE_INTERVAL_MS;
  const state = liveSyncTimers.get(key);
  const lastPlayAt = Number(state?.lastPlayAt) || 0;
  if (!lastPlayAt) return LIVE_SYNC_ACTIVE_INTERVAL_MS;
  return (Date.now() - lastPlayAt) >= LIVE_SYNC_IDLE_AFTER_MS
    ? LIVE_SYNC_IDLE_INTERVAL_MS
    : LIVE_SYNC_ACTIVE_INTERVAL_MS;
}

async function performLiveSessionSync(db, sessionOrId, options = {}) {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  if (!session || session.status !== 'live') return null;
  if (typeof syncRecentlyPlayedForUser !== 'function') {
    throw new Error('Live sync dependency unavailable');
  }

  const actors = getSessionSyncActors(db, session);
  if (!actors.length) {
    throw new Error('Live session has no active performers');
  }

  const aggregate = {
    delta: {
      recent_rows_seen: 0,
      new_plays_added: 0,
      requests_fulfilled: 0,
      buffered_upscores: 0,
      buffered_clears: 0,
      title_unlocks: 0,
    },
    plays_changed: false,
    requests_changed: false,
    message_ids: [],
  };

  for (const actor of actors) {
    const syncUpdate = await performLiveSessionSyncForActor(db, session, actor);
    aggregate.delta.recent_rows_seen += toInt(syncUpdate?.delta?.recent_rows_seen);
    aggregate.delta.new_plays_added += toInt(syncUpdate?.delta?.new_plays_added);
    aggregate.delta.requests_fulfilled += toInt(syncUpdate?.delta?.requests_fulfilled);
    aggregate.delta.buffered_upscores += toInt(syncUpdate?.delta?.buffered_upscores);
    aggregate.delta.buffered_clears += toInt(syncUpdate?.delta?.buffered_clears);
    aggregate.delta.title_unlocks += toInt(syncUpdate?.delta?.title_unlocks);
    aggregate.plays_changed = aggregate.plays_changed || !!syncUpdate?.plays_changed;
    aggregate.requests_changed = aggregate.requests_changed || !!syncUpdate?.requests_changed;
    if (Array.isArray(syncUpdate?.message_ids) && syncUpdate.message_ids.length > 0) {
      aggregate.message_ids.push(...syncUpdate.message_ids);
    }
  }

  if (aggregate.plays_changed) {
    markLiveSyncPlayActivity(session.id);
  }
  const hopEventResult = processHourOfPowerScheduledEvents(db, session);
  if (Array.isArray(hopEventResult?.message_ids) && hopEventResult.message_ids.length > 0) {
    aggregate.message_ids.push(...hopEventResult.message_ids);
  }
  const nextSession = getLiveSession(db, hopEventResult?.session?.id || session.id);
  if (options.broadcast !== false && nextSession) {
    broadcastLiveSyncUpdates(db, nextSession, aggregate, options.reason || 'sync');
  }
  return {
    delta: aggregate.delta,
    session: nextSession || session,
  };
}

async function performLiveSessionSyncForActor(db, session, actor) {
  const syncResult = await syncRecentlyPlayedForUser(actor, {
    db,
    userId: actor.id,
    username: actor.username,
    persistActivityPosts: false,
  });
  return applyLiveSyncResult(db, session, syncResult, actor);
}

function clearLiveSyncTimer(liveSessionId) {
  const key = String(liveSessionId || '').trim();
  if (!key) return;
  const state = liveSyncTimers.get(key);
  if (state?.timeout) {
    clearTimeout(state.timeout);
  }
  liveSyncTimers.delete(key);
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

  const state = { timeout: null, lastPlayAt: Date.now() };
  const scheduleNextSync = () => {
    if (liveSyncTimers.get(key) !== state) return;
    const delay = getLiveSyncIntervalMs(key);
    state.timeout = setTimeout(async () => {
      if (liveSyncTimers.get(key) !== state) return;
      if (liveSyncInFlight.has(key)) {
        scheduleNextSync();
        return;
      }

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
          broadcastLiveSessionUpdated(currentDb, key, 'sync_error');
        } catch {
          // Ignore secondary errors while surfacing the original sync failure in logs.
        }
        console.error('Live session background sync error:', err.message);
      } finally {
        liveSyncInFlight.delete(key);
        if (liveSyncTimers.get(key) === state) {
          scheduleNextSync();
        }
      }
    }, delay);

    if (typeof state.timeout?.unref === 'function') {
      state.timeout.unref();
    }
  };

  liveSyncTimers.set(key, state);
  scheduleNextSync();
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
  if (!normalizedUserId) {
    return normalizeModerationRow(null, session?.id || '', normalizedUserId);
  }
  const participant = getSessionParticipantRecord(db, session, normalizedUserId, { includeLeft: false });
  if (participant?.user_id) {
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
        chart_id: toInt(requestRow.chart_id),
        song_title: requestRow.song_title || '',
        mode: requestRow.mode || '',
        level: toInt(requestRow.level),
        jacket_url: requestRow.jacket_url || '',
        target_user_id: requestRow.target_user_id || '',
        target_username: requestRow.target_username || '',
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
        chart_id: toInt(requestRow.chart_id),
        song_title: requestRow.song_title || '',
        mode: requestRow.mode || '',
        level: toInt(requestRow.level),
        jacket_url: requestRow.jacket_url || '',
        target_user_id: requestRow.target_user_id || '',
        target_username: requestRow.target_username || '',
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
        chart_id: toInt(requestRow.chart_id),
        song_title: requestRow.song_title || '',
        mode: requestRow.mode || '',
        level: toInt(requestRow.level),
        jacket_url: requestRow.jacket_url || '',
        target_user_id: requestRow.target_user_id || '',
        target_username: requestRow.target_username || '',
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
        chart_id: toInt(requestRow.chart_id),
        song_title: requestRow.song_title || '',
        mode: requestRow.mode || '',
        level: toInt(requestRow.level),
        jacket_url: requestRow.jacket_url || '',
        target_user_id: requestRow.target_user_id || '',
        target_username: requestRow.target_username || '',
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

  let announcementMessageId = '';
  if (options.emitMessage !== false && previousStatus !== normalizedStatus) {
    const announcement = buildRequestStatusAnnouncement(
      {
        ...requestRow,
        ...updatedRow,
        jacket_url: getSongJacketUrl(db, requestRow.chart_id),
      },
      normalizedStatus,
      previousStatus
    );
    if (announcement?.message) {
      announcementMessageId = addSystemMessage(
        db,
        requestRow.live_session_id,
        announcement.message,
        announcement.message_type,
        announcement.metadata
      );
    }
  }

  return {
    request: updatedRow,
    announcement_message_id: announcementMessageId,
  };
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

function isPumpableLiveMessageType(messageType) {
  return String(messageType || '').trim().toLowerCase() !== 'system';
}

function getLiveMessageRow(db, messageId, currentUserId = '') {
  return db.prepare(`
    SELECT
      m.*,
      s.host_user_id,
      COALESCE(u.avatar, '') AS user_avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.pumbility, 0) AS pumbility,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(part.role, '') AS participant_role,
      COALESCE(mod.chat_muted, 0) AS chat_muted,
      COALESCE(mod.requests_blocked, 0) AS requests_blocked,
      (
        SELECT COUNT(*)
        FROM live_message_pumps pump
        WHERE pump.message_id = m.id
      ) AS pump_count,
      CASE
        WHEN ? <> '' AND EXISTS (
          SELECT 1
          FROM live_message_pumps pump
          WHERE pump.message_id = m.id
            AND pump.user_id = ?
        ) THEN 1
        ELSE 0
      END AS user_pumped
    FROM live_session_messages m
    JOIN live_sessions s ON s.id = m.live_session_id
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN live_session_participants part
      ON part.live_session_id = m.live_session_id
     AND part.user_id = m.user_id
    LEFT JOIN live_session_moderation mod
      ON mod.live_session_id = m.live_session_id
     AND mod.user_id = m.user_id
    WHERE m.id = ?
    LIMIT 1
  `).get(currentUserId, currentUserId, messageId);
}

function getPlayOutcomeMap(db, liveSessionId) {
  const cacheKey = String(liveSessionId || '').trim();
  if (!cacheKey) return new Map();

  const cached = livePlayOutcomeCache.get(cacheKey);
  if (cached) return cached;

  const map = new Map();

  const upscoreRows = db.prepare(`
    SELECT payload_json, performer_user_id
    FROM live_session_buffered_upscores
    WHERE live_session_id = ?
    ORDER BY id ASC
  `).all(liveSessionId);
  for (const row of upscoreRows) {
    const payload = safeParseJson(row?.payload_json || '{}', {});
    const performerUserId = String(payload?.performer_user_id || row?.performer_user_id || '').trim();
    const key = buildPlayOutcomeKey(payload.song_title, payload.mode, payload.level, payload.new_score, performerUserId);
    if (!key) continue;
    map.set(key, {
      type: 'upscore',
      pumbility_gain: toInt(payload.pumbility_gain),
      singles_pumbility_gain: toInt(payload.singles_pumbility_gain),
      over_top100_rank: toInt(payload.over_top100_rank),
    });
  }

  const clearRows = db.prepare(`
    SELECT payload_json, performer_user_id
    FROM live_session_buffered_clears
    WHERE live_session_id = ?
    ORDER BY id ASC
  `).all(liveSessionId);
  for (const row of clearRows) {
    const payload = safeParseJson(row?.payload_json || '{}', {});
    if (String(payload?.entry_type || 'song_clear') === 'title_unlock') continue;
    const performerUserId = String(payload?.performer_user_id || row?.performer_user_id || '').trim();
    const key = buildPlayOutcomeKey(payload.song_title, payload.mode, payload.level, payload.score, performerUserId);
    if (!key || map.has(key)) continue;
    map.set(key, {
      type: 'clear',
      pumbility_gain: toInt(payload.pumbility_gain),
      singles_pumbility_gain: toInt(payload.singles_pumbility_gain),
      over_top100_rank: toInt(payload.over_top100_rank),
    });
  }

  livePlayOutcomeCache.set(cacheKey, map);
  return map;
}

function getSessionPlays(db, liveSessionId) {
  const outcomeMap = getPlayOutcomeMap(db, liveSessionId);
  const rows = db.prepare(`
    SELECT
      p.*,
      COALESCE(u.username, '') AS username,
      COALESCE(u.avatar, '') AS avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(part.role, '') AS participant_role,
      COALESCE(part.status, '') AS participant_status,
      COALESCE(s.make, '') AS shoe_make,
      COALESCE(s.model, '') AS shoe_model,
      COALESCE(s.colorway, '') AS shoe_colorway
    FROM live_session_plays p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN live_session_participants part
      ON part.live_session_id = p.live_session_id
     AND part.user_id = p.user_id
    LEFT JOIN user_shoes s ON s.id = p.shoe_id
    WHERE p.live_session_id = ?
    ORDER BY p.id DESC
    LIMIT ?
  `).all(liveSessionId, PLAY_LIMIT);

  return rows.map((row) => {
    const key = buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.score, row.user_id);
    const outcome = outcomeMap.get(key) || null;
    return {
      ...row,
      avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 56, row.avatar_v),
      participant_role: normalizeLiveParticipantRole(row.participant_role),
      participant_status: normalizeLiveParticipantStatus(row.participant_status),
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
      COALESCE(u.username, '') AS username,
      COALESCE(u.avatar, '') AS avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(part.role, '') AS participant_role,
      COALESCE(part.status, '') AS participant_status,
      COALESCE(s.make, '') AS shoe_make,
      COALESCE(s.model, '') AS shoe_model,
      COALESCE(s.colorway, '') AS shoe_colorway
    FROM live_session_plays p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN live_session_participants part
      ON part.live_session_id = p.live_session_id
     AND part.user_id = p.user_id
    LEFT JOIN user_shoes s ON s.id = p.shoe_id
    WHERE p.live_session_id = ?
    ORDER BY p.id DESC
    LIMIT 1
  `).get(liveSessionId);

  if (!row) return null;

  const key = buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.score, row.user_id);
  const outcome = outcomeMap.get(key) || null;
  return {
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 56, row.avatar_v),
    participant_role: normalizeLiveParticipantRole(row.participant_role),
    participant_status: normalizeLiveParticipantStatus(row.participant_status),
    pumbility_gain: outcome ? outcome.pumbility_gain : 0,
    singles_pumbility_gain: outcome ? outcome.singles_pumbility_gain : 0,
    session_result_type: outcome ? outcome.type : '',
    over_top100_rank: Math.max(toInt(row.over_top100_rank), toInt(outcome?.over_top100_rank)),
  };
}

function getLiveSessionYoutubeVideoId(session) {
  const linkedVideoId = String(session?.youtube_video_id || '').trim();
  if (linkedVideoId) return linkedVideoId;
  return extractYoutubeVideoId(session?.stream_url || '');
}

function buildReplayOutcomeKey(row) {
  if (!row || String(row?.entry_type || 'song_clear') === 'title_unlock') return '';
  const score = Object.prototype.hasOwnProperty.call(row, 'new_score')
    ? toInt(row?.new_score)
    : toInt(row?.score);
  const performerUserId = String(row?.performer_user_id || row?.user_id || '').trim();
  return buildPlayOutcomeKey(row.song_title, row.mode, row.level, score, performerUserId);
}

function buildYoutubeReplayEmbedUrl(videoId, startSeconds, endSeconds) {
  const normalizedVideoId = String(videoId || '').trim();
  if (!normalizedVideoId) return '';
  const start = Math.max(0, toInt(startSeconds));
  const end = Math.max(start + 1, toInt(endSeconds));
  const params = new URLSearchParams({
    start: String(start),
    end: String(end),
  });
  return `https://www.youtube.com/embed/${encodeURIComponent(normalizedVideoId)}?${params.toString()}`;
}

function isReplayEligibleYoutubeVideo(video) {
  const privacyStatus = String(video?.privacy_status || '').trim().toLowerCase();
  return (privacyStatus === 'public' || privacyStatus === 'unlisted') && video?.embeddable !== false;
}

function buildSessionReplayLookup(session, plays, video, videoId) {
  const timestamps = buildYoutubeTimestampPayload(session, plays, video);
  const replayLookup = new Map();

  for (const chapter of Array.isArray(timestamps?.chapters) ? timestamps.chapters : []) {
    const score = toInt(chapter?.score);
    const durationSeconds = toInt(chapter?.duration_seconds);
    const startSeconds = Math.max(0, toInt(chapter?.offset_seconds));
    const endSeconds = startSeconds + durationSeconds + REPLAY_POST_SONG_BUFFER_SECONDS;
    const key = buildPlayOutcomeKey(chapter?.song_title, chapter?.mode, chapter?.level, score, chapter?.user_id || '');
    if (!key || durationSeconds <= 0 || endSeconds <= startSeconds) continue;
    replayLookup.set(key, {
      replay_embed_url: buildYoutubeReplayEmbedUrl(videoId, startSeconds, endSeconds),
      replay_video_id: String(videoId || '').trim(),
      replay_start_seconds: startSeconds,
      replay_end_seconds: endSeconds,
    });
  }

  return replayLookup;
}

function attachReplayMetadataToRows(rows, replayLookup) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const replay = replayLookup.get(buildReplayOutcomeKey(row)) || null;
    if (!replay) {
      return {
        ...row,
        replay_embed_url: '',
        replay_video_id: '',
        replay_start_seconds: 0,
        replay_end_seconds: 0,
      };
    }
    return {
      ...row,
      ...replay,
    };
  });
}

function resolveReplayChartId(db, aliases, cache, row) {
  const mode = String(row?.mode || '').trim();
  const level = toInt(row?.level);
  const canonicalTitle = toCanonicalSongTitle(row?.song_title, aliases);
  if (!mode || level <= 0 || !canonicalTitle) return 0;

  const cacheKey = `${mode}|${level}`;
  let candidates = cache.get(cacheKey);
  if (!candidates) {
    candidates = db.prepare(`
      SELECT id, title
      FROM songs
      WHERE mode = ? AND level = ?
      ORDER BY id ASC
    `).all(mode, level);
    cache.set(cacheKey, candidates);
  }

  for (const candidate of candidates) {
    if (toCanonicalSongTitle(candidate?.title, aliases) === canonicalTitle) {
      return toInt(candidate?.id);
    }
  }
  return 0;
}

function syncSessionReplayLinks(db, userId, rows, replayLookup) {
  const aliases = loadSongAliases();
  const cache = new Map();
  const upsertReplay = db.prepare(`
    INSERT INTO user_chart_youtube_links (user_id, chart_id, session_youtube_url, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, chart_id)
    DO UPDATE SET session_youtube_url = excluded.session_youtube_url, updated_at = datetime('now')
  `);
  const clearReplay = db.prepare(`
    UPDATE user_chart_youtube_links
    SET session_youtube_url = '', updated_at = datetime('now')
    WHERE user_id = ? AND chart_id = ?
  `);

  for (const row of Array.isArray(rows) ? rows : []) {
    const chartId = resolveReplayChartId(db, aliases, cache, row);
    if (!chartId) continue;
    const replay = replayLookup.get(buildReplayOutcomeKey(row)) || null;
    if (String(replay?.replay_embed_url || '').trim()) {
      upsertReplay.run(userId, chartId, replay.replay_embed_url);
    } else {
      clearReplay.run(userId, chartId);
    }
  }
}

function syncRecentPlayReplayRows(db, liveSessionId, replayLookup) {
  const rows = db.prepare(`
    SELECT id, user_id, recently_played_id, song_title, mode, level, score
    FROM live_session_plays
    WHERE live_session_id = ?
      AND recently_played_id IS NOT NULL
  `).all(liveSessionId);
  if (!rows.length) return 0;

  const updateRecentReplay = db.prepare(`
    UPDATE user_recently_played
    SET
      replay_embed_url = ?,
      replay_video_id = ?,
      replay_start_seconds = ?,
      replay_end_seconds = ?
    WHERE id = ?
  `);

  let updatedCount = 0;
  for (const row of rows) {
    const replay = replayLookup.get(buildPlayOutcomeKey(
      row.song_title,
      row.mode,
      row.level,
      row.score,
      row.user_id
    )) || null;
    if (!replay) continue;
    updateRecentReplay.run(
      String(replay.replay_embed_url || '').trim(),
      String(replay.replay_video_id || '').trim(),
      Math.max(0, toInt(replay.replay_start_seconds)),
      Math.max(0, toInt(replay.replay_end_seconds)),
      toInt(row.recently_played_id)
    );
    updatedCount += 1;
  }
  return updatedCount;
}

function updateBufferedReplayRows(db, liveSessionId, tableName, rows) {
  const updateRow = db.prepare(`
    UPDATE ${tableName}
    SET payload_json = ?
    WHERE id = ?
  `);

  for (const row of Array.isArray(rows) ? rows : []) {
    const rowId = toInt(row?.buffered_row_id);
    if (!rowId) continue;
    updateRow.run(JSON.stringify(stripBufferedRowMetadata(row)), rowId);
  }
}

function scoreArrayMatchScore(rowItem, targetItem) {
  const rowSong = normalizeSongName(rowItem?.song_title);
  const targetSong = normalizeSongName(targetItem?.song_title);
  if (!rowSong || rowSong !== targetSong) return false;
  if (String(rowItem?.mode || '').trim() !== String(targetItem?.mode || '').trim()) return false;
  if (toInt(rowItem?.level) !== toInt(targetItem?.level)) return false;
  const rowScore = Object.prototype.hasOwnProperty.call(rowItem || {}, 'new_score')
    ? toInt(rowItem?.new_score)
    : toInt(rowItem?.score);
  const targetScore = Object.prototype.hasOwnProperty.call(targetItem || {}, 'new_score')
    ? toInt(targetItem?.new_score)
    : toInt(targetItem?.score);
  return rowScore > 0 && rowScore === targetScore;
}

function findGeneratedReplayPostId(db, tableName, jsonColumn, userId, createdAt, targetRows) {
  const normalizedRows = Array.isArray(targetRows) ? targetRows : [];
  if (!userId || !createdAt || normalizedRows.length === 0) return null;
  const candidates = db.prepare(`
    SELECT id, ${jsonColumn} AS payload_json
    FROM ${tableName}
    WHERE user_id = ?
      AND created_at = ?
    ORDER BY id DESC
  `).all(userId, createdAt);

  for (const candidate of candidates) {
    const payload = safeParseJson(candidate?.payload_json || '[]', []);
    if (!Array.isArray(payload) || payload.length !== normalizedRows.length) continue;
    let matches = true;
    for (let index = 0; index < normalizedRows.length; index += 1) {
      if (!scoreArrayMatchScore(payload[index], normalizedRows[index])) {
        matches = false;
        break;
      }
    }
    if (matches) return toInt(candidate?.id);
  }
  return null;
}

function updateGeneratedReplayPosts(db, session, userId, upscoreRows, clearRows) {
  const result = {
    upscore_post_id: null,
    clear_post_id: null,
  };
  const endedAt = String(session?.ended_at || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (normalizedUserId && Array.isArray(upscoreRows) && upscoreRows.length > 0) {
    const upscorePostId = findGeneratedReplayPostId(
      db,
      'user_upscores',
      'upscores_json',
      normalizedUserId,
      endedAt,
      upscoreRows
    );
    if (upscorePostId) {
      db.prepare('UPDATE user_upscores SET upscores_json = ? WHERE id = ?')
        .run(JSON.stringify(upscoreRows.map(stripBufferedRowMetadata)), upscorePostId);
      result.upscore_post_id = upscorePostId;
    }
  }

  const clearEntries = (Array.isArray(clearRows) ? clearRows : [])
    .filter((row) => String(row?.entry_type || 'song_clear') !== 'title_unlock');
  if (normalizedUserId && clearEntries.length > 0) {
    const clearPostId = findGeneratedReplayPostId(
      db,
      'user_new_clears',
      'clears_json',
      normalizedUserId,
      endedAt,
      clearRows
    );
    if (clearPostId) {
      db.prepare('UPDATE user_new_clears SET clears_json = ? WHERE id = ?')
        .run(JSON.stringify(clearRows.map(stripBufferedRowMetadata)), clearPostId);
      result.clear_post_id = clearPostId;
    }
  }

  return result;
}

async function backfillLiveSessionReplayData(db, liveSessionId) {
  const session = db.prepare(`
    SELECT *
    FROM live_sessions
    WHERE id = ?
    LIMIT 1
  `).get(liveSessionId);
  if (!session) {
    const err = new Error(`Live session not found: ${liveSessionId}`);
    err.statusCode = 404;
    throw err;
  }

  const videoId = getLiveSessionYoutubeVideoId(session);
  if (!videoId) {
    return {
      session_id: String(liveSessionId),
      skipped: true,
      reason: 'missing_video_id',
    };
  }

  const plays = getSessionPlaysWithDurations(db, liveSessionId);
  if (!plays.length) {
    return {
      session_id: String(liveSessionId),
      skipped: true,
      reason: 'missing_session_plays',
    };
  }

  const video = await getYoutubeVideoById(db, session.host_user_id, videoId, {
    enforceChannelOwnership: false,
  });
  if (!video) {
    return {
      session_id: String(liveSessionId),
      skipped: true,
      reason: 'video_not_found',
    };
  }
  if (!isReplayEligibleYoutubeVideo(video)) {
    return {
      session_id: String(liveSessionId),
      skipped: true,
      reason: 'video_not_embeddable',
      privacy_status: String(video.privacy_status || '').trim(),
      embeddable: video.embeddable !== false,
    };
  }

  const replayLookup = buildSessionReplayLookup(session, plays, video, videoId);
  const bufferedUpscores = attachReplayMetadataToRows(
    parseBufferedRows(db, liveSessionId, 'live_session_buffered_upscores', { includeFinalized: true }),
    replayLookup
  );
  const bufferedClears = attachReplayMetadataToRows(
    parseBufferedRows(db, liveSessionId, 'live_session_buffered_clears', { includeFinalized: true }),
    replayLookup
  );
  const participantRows = new Map();
  for (const row of bufferedUpscores) {
    const key = String(row?.performer_user_id || '').trim();
    if (!key) continue;
    if (!participantRows.has(key)) participantRows.set(key, { upscores: [], clears: [] });
    participantRows.get(key).upscores.push(row);
  }
  for (const row of bufferedClears) {
    const key = String(row?.performer_user_id || '').trim();
    if (!key) continue;
    if (!participantRows.has(key)) participantRows.set(key, { upscores: [], clears: [] });
    participantRows.get(key).clears.push(row);
  }

  const txn = db.transaction(() => {
    const updatedRecentRows = syncRecentPlayReplayRows(db, liveSessionId, replayLookup);
    updateBufferedReplayRows(db, liveSessionId, 'live_session_buffered_upscores', bufferedUpscores);
    updateBufferedReplayRows(db, liveSessionId, 'live_session_buffered_clears', bufferedClears);
    const updatedPosts = [];
    for (const [performerUserId, groupedRows] of participantRows.entries()) {
      const replayRows = [
        ...groupedRows.upscores,
        ...groupedRows.clears.filter((row) => String(row?.entry_type || 'song_clear') !== 'title_unlock'),
      ];
      if (replayRows.length > 0) {
        syncSessionReplayLinks(db, performerUserId, replayRows, replayLookup);
      }
      updatedPosts.push({
        user_id: performerUserId,
        ...updateGeneratedReplayPosts(db, session, performerUserId, groupedRows.upscores, groupedRows.clears),
      });
    }
    return { updatedPosts, updatedRecentRows };
  });
  const { updatedPosts, updatedRecentRows } = txn();

  return {
    session_id: String(liveSessionId),
    skipped: false,
    replay_count: replayLookup.size,
    buffered_upscores: bufferedUpscores.length,
    buffered_clears: bufferedClears.length,
    updated_recent_rows: updatedRecentRows,
    updated_posts: updatedPosts,
  };
}

function getSessionPlaysWithDurations(db, liveSessionId) {
  const aliases = loadSongAliases();
  const durationRows = db.prepare(`
    SELECT title, mode, level, duration_seconds, duration_source
    FROM songs
    WHERE COALESCE(duration_seconds, 0) > 0
  `).all();

  const durationLookup = new Map();
  for (const row of durationRows) {
    const titleKey = toCanonicalSongTitle(row.title, aliases);
    const modeKey = normalizeSongName(row.mode);
    const level = toInt(row.level);
    const durationSeconds = toInt(row.duration_seconds);
    if (!titleKey || !modeKey || level <= 0 || durationSeconds <= 0) continue;

    const lookupKey = `${titleKey}|${modeKey}|${level}`;
    const existing = durationLookup.get(lookupKey);
    if (!existing || durationSeconds > toInt(existing.duration_seconds)) {
      durationLookup.set(lookupKey, {
        duration_seconds: durationSeconds,
        duration_source: String(row.duration_source || '').trim(),
      });
    }
  }

  const plays = db.prepare(`
    SELECT
      p.*,
      COALESCE(u.username, '') AS username,
      COALESCE(u.avatar, '') AS avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v
    FROM live_session_plays p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.live_session_id = ?
    ORDER BY COALESCE(NULLIF(p.played_at_utc, ''), p.date_played) ASC, p.id ASC
  `).all(liveSessionId);

  return plays.map((play) => {
    const lookupKey = `${toCanonicalSongTitle(play.song_title, aliases)}|${normalizeSongName(play.mode)}|${toInt(play.level)}`;
    const durationMatch = durationLookup.get(lookupKey) || null;
    return {
      ...play,
      avatar: normalizeUserAvatarForList(play.avatar, play.user_id, 56, play.avatar_v),
      duration_seconds: durationMatch ? toInt(durationMatch.duration_seconds) : 0,
      duration_source: durationMatch?.duration_source || '',
    };
  });
}

function stripHourOfPowerInternalFields(row) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row };
  delete next._hop_playedAtMs;
  delete next._hop_startedAtMs;
  return next;
}

function buildSessionDisplayState(db, session, plays) {
  const sourceRows = Array.isArray(plays) ? plays : [];
  if (!isHourOfPowerSession(session)) {
    return {
      plays: sourceRows,
      hop: null,
    };
  }

  const hopSummary = summarizeHourOfPower(session, sourceRows, {
    getDurationSeconds: (row) => toInt(getSongDurationForChart(db, row?.song_title, row?.mode, row?.level)?.duration_seconds),
  });
  if (!hopSummary) {
    return {
      plays: sourceRows,
      hop: null,
    };
  }

  const {
    plays: hopPlays,
    counted_rows: countedRows,
    highest_play: highestPlay,
    lowest_play: lowestPlay,
    ...hopMeta
  } = hopSummary;

  return {
    plays: hopPlays.map(stripHourOfPowerInternalFields),
    hop: {
      ...hopMeta,
      counted_rows: countedRows.map(stripHourOfPowerInternalFields),
      highest_play: highestPlay ? stripHourOfPowerInternalFields(highestPlay) : null,
      lowest_play: lowestPlay ? stripHourOfPowerInternalFields(lowestPlay) : null,
    },
  };
}

function attachReplayMetadataToPlayRows(rows, replayLookup) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const replay = replayLookup.get(buildPlayOutcomeKey(
      row?.song_title,
      row?.mode,
      row?.level,
      row?.score,
      row?.user_id
    )) || null;
    return replay
      ? {
          ...row,
          replay_embed_url: String(replay.replay_embed_url || '').trim(),
          replay_video_id: String(replay.replay_video_id || '').trim(),
          replay_start_seconds: Math.max(0, toInt(replay.replay_start_seconds)),
          replay_end_seconds: Math.max(0, toInt(replay.replay_end_seconds)),
        }
      : {
          ...row,
          replay_embed_url: '',
          replay_video_id: '',
          replay_start_seconds: 0,
          replay_end_seconds: 0,
        };
  });
}

function buildHourOfPowerWarmupFinishedMessage() {
  return 'Warmup over. Hour of Power starts now. New clears will count toward your total.';
}

function buildHourOfPowerFinishedMessage(hopSummary) {
  const total = toInt(hopSummary?.total_rating_points);
  const clears = toInt(hopSummary?.counted_clear_count);
  return `Hour of Power complete. Current total: ${total.toLocaleString()} rating points across ${clears} clear${clears === 1 ? '' : 's'}. Songs started before the buzzer still count once they resolve.`;
}

function processHourOfPowerScheduledEvents(db, session) {
  if (!isHourOfPowerSession(session) || String(session?.status || '').trim() !== 'live') {
    return {
      session,
      changed: false,
      message_ids: [],
    };
  }

  const config = resolveHourOfPowerConfig(session);
  const nowMs = Date.now();
  const messageIds = [];
  let changed = false;

  if (!String(session?.hop_warmup_finished_announced_at || '').trim() && nowMs >= config.startedAtMs) {
    const messageId = addSystemMessage(
      db,
      session.id,
      buildHourOfPowerWarmupFinishedMessage(),
      'hop_warmup_end',
      {
        session_type: HOP_SESSION_TYPE,
        hop_phase: 'power',
      }
    );
    db.prepare(`
      UPDATE live_sessions
      SET hop_warmup_finished_announced_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(formatSqliteDateTime(new Date(nowMs)), session.id);
    messageIds.push(messageId);
    changed = true;
  }

  let latestSession = changed ? getLiveSession(db, session.id) : session;

  if (!String(latestSession?.hop_finished_announced_at || '').trim() && nowMs >= config.endsAtMs) {
    const plays = getSessionPlays(db, latestSession.id);
    const displayState = buildSessionDisplayState(db, latestSession, plays);
    const messageId = addSystemMessage(
      db,
      latestSession.id,
      buildHourOfPowerFinishedMessage(displayState.hop),
      'hop_finished',
      {
        session_type: HOP_SESSION_TYPE,
        hop_phase: 'finished',
        total_rating_points: toInt(displayState?.hop?.total_rating_points),
        counted_clear_count: toInt(displayState?.hop?.counted_clear_count),
      }
    );
    db.prepare(`
      UPDATE live_sessions
      SET hop_finished_announced_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(formatSqliteDateTime(new Date(nowMs)), latestSession.id);
    messageIds.push(messageId);
    changed = true;
    latestSession = getLiveSession(db, latestSession.id);
  }

  return {
    session: latestSession,
    changed,
    message_ids: messageIds,
  };
}

async function buildLiveSessionYoutubeTimestampPreview(db, session, userId) {
  const videoId = getLiveSessionYoutubeVideoId(session);
  if (!videoId) {
    const err = new Error('Attach a YouTube live stream to this session before generating timestamps');
    err.statusCode = 409;
    throw err;
  }

  const plays = getSessionPlaysWithDurations(db, session.id);
  if (!plays.length) {
    const err = new Error('No synced live-session plays are available yet');
    err.statusCode = 409;
    throw err;
  }

  const video = await getYoutubeVideoById(db, userId, videoId);
  if (!video) {
    const err = new Error('Unable to load the linked YouTube video');
    err.statusCode = 404;
    throw err;
  }
  const timestamps = buildYoutubeTimestampPayload(session, plays, video);

  return {
    video_id: videoId,
    video_title: video.title || '',
    video_description: video.description || '',
    next_description: upsertManagedYoutubeChaptersBlock(video.description || '', timestamps.text),
    play_count: plays.length,
    ...timestamps,
  };
}

function normalizeMessageRow(row) {
  if (!row) return null;
  const participantRole = normalizeLiveParticipantRole(row.participant_role);
  const isParticipant = !!row.user_id && !!String(row.participant_role || '').trim();
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
    is_participant: isParticipant,
    participant_role: isParticipant ? participantRole : '',
    chat_muted: toInt(row.chat_muted) === 1,
    requests_blocked: toInt(row.requests_blocked) === 1,
    pump_count: Math.max(0, toInt(row.pump_count)),
    user_pumped: toInt(row.user_pumped) === 1,
  };
}

function getSessionMessages(db, liveSessionId, currentUserId = '') {
  const rows = db.prepare(`
    SELECT
      m.*,
      s.host_user_id,
      COALESCE(u.avatar, '') AS user_avatar,
      COALESCE(u.avatar_v, 0) AS avatar_v,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.pumbility, 0) AS pumbility,
      COALESCE(u.nationality, '') AS nationality,
      COALESCE(part.role, '') AS participant_role,
      COALESCE(mod.chat_muted, 0) AS chat_muted,
      COALESCE(mod.requests_blocked, 0) AS requests_blocked,
      (
        SELECT COUNT(*)
        FROM live_message_pumps pump
        WHERE pump.message_id = m.id
      ) AS pump_count,
      CASE
        WHEN ? <> '' AND EXISTS (
          SELECT 1
          FROM live_message_pumps pump
          WHERE pump.message_id = m.id
            AND pump.user_id = ?
        ) THEN 1
        ELSE 0
      END AS user_pumped
    FROM live_session_messages m
    JOIN live_sessions s ON s.id = m.live_session_id
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN live_session_participants part
      ON part.live_session_id = m.live_session_id
     AND part.user_id = m.user_id
    LEFT JOIN live_session_moderation mod
      ON mod.live_session_id = m.live_session_id
     AND mod.user_id = m.user_id
    WHERE m.live_session_id = ?
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ?
  `).all(currentUserId, currentUserId, liveSessionId, CHAT_LIMIT);

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
      COALESCE(part.role, '') AS participant_role,
      COALESCE(target.username, '') AS resolved_target_username,
      COALESCE(mod.chat_muted, 0) AS chat_muted,
      COALESCE(mod.requests_blocked, 0) AS requests_blocked
    FROM live_session_requests r
    JOIN live_sessions s ON s.id = r.live_session_id
    JOIN users u ON u.id = r.user_id
    LEFT JOIN live_session_participants part
      ON part.live_session_id = r.live_session_id
     AND part.user_id = r.user_id
    LEFT JOIN users target ON target.id = r.target_user_id
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
    r.updated_at DESC,
    r.created_at DESC,
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
      target_user_id: row.target_user_id || '',
      target_username: row.resolved_target_username || row.target_username || '',
      status,
      fulfilled: status === 'played',
      handled_at: row.handled_at || '',
      handled_by_user_id: row.handled_by_user_id || '',
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
      skill_title: row.skill_title || '',
      pumbility: toInt(row.pumbility),
      nationality: row.nationality || '',
      participant_role: row.participant_role || '',
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

  let announcementMessage = null;
  if (options.emitMessage !== false) {
    let announcementMessageId = '';
    if (winner) {
      announcementMessageId = addSystemMessage(
        db,
        snapshot.live_session_id,
        `Vote locked: ${formatPlayLabel(winner)} wins with ${winner.vote_count} vote${winner.vote_count === 1 ? '' : 's'}.`,
        'vote_result',
        {
          vote_id: voteId,
          winning_option_id: winner.id,
          song_title: winner.song_title || '',
          mode: winner.mode || '',
          level: toInt(winner.level),
          jacket_url: winner.jacket_url || '',
          vote_count: toInt(winner.vote_count),
        }
      );
    } else {
      announcementMessageId = addSystemMessage(db, snapshot.live_session_id, 'Vote locked. No ballots were cast.', 'vote_result', { vote_id: voteId });
    }
    announcementMessage = getNormalizedLiveMessage(db, announcementMessageId);
  }

  const closedSnapshot = getVoteSnapshot(db, voteId, options.currentUserId || '');
  if (options.broadcast !== false) {
    broadcastLiveVoteUpdated(db, snapshot.live_session_id, options.reason || 'vote_closed');
    if (announcementMessage) {
      broadcastLiveMessageAdded(snapshot.live_session_id, announcementMessage, options.reason || 'vote_closed');
    }
  }
  return closedSnapshot;
}

function getLatestVoteSnapshot(db, liveSessionId, currentUserId = '') {
  const vote = db.prepare(`
    SELECT id, status, ends_at
    FROM live_session_votes
    WHERE live_session_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(liveSessionId);
  if (!vote) return null;

  const endsAtMs = vote.ends_at ? Date.parse(`${vote.ends_at}Z`) : NaN;
  if (vote.status === 'active' && Number.isFinite(endsAtMs) && Date.now() >= endsAtMs) {
    return closeVote(db, vote.id, { currentUserId, broadcast: false });
  }

  return getVoteSnapshot(db, vote.id, currentUserId);
}

function normalizeSessionPayload(session, host, viewerCount, currentUserId, participants = []) {
  const normalizedParticipants = Array.isArray(participants) ? participants : [];
  const activeParticipants = normalizedParticipants.filter((participant) => participant?.status === LIVE_PARTICIPANT_STATUS_ACTIVE);
  const visibleParticipants = String(session?.status || '').trim() === 'live'
    ? activeParticipants
    : normalizedParticipants;
  const currentParticipant = activeParticipants.find((participant) => String(participant.user_id || '') === String(currentUserId || '')) || null;
  const hopConfig = resolveHourOfPowerConfig(session);
  return {
    id: session.id,
    title: session.title || '',
    stream_url: session.stream_url || '',
    youtube_broadcast_id: session.youtube_broadcast_id || '',
    youtube_video_id: session.youtube_video_id || '',
    youtube_channel_id: session.youtube_channel_id || '',
    youtube_stream_title: session.youtube_stream_title || '',
    youtube_lifecycle_status: session.youtube_lifecycle_status || '',
    youtube_scheduled_start_time: session.youtube_scheduled_start_time || '',
    youtube_actual_start_time: session.youtube_actual_start_time || '',
    status_text: normalizeText(session.status_text || '', 160),
    requests_enabled: toInt(session.requests_enabled) !== 0,
    request_mode_filter: normalizeRequestModeFilter(session.request_mode_filter),
    request_max_level: normalizeRequestMaxLevel(session.request_max_level),
    request_show_scores: toInt(session.request_show_scores) !== 0,
    is_hidden_from_profile: toInt(session.is_hidden_from_profile) !== 0,
    session_type: normalizeSessionType(session.session_type),
    status: session.status || 'live',
    host_user_id: session.host_user_id,
    recent_anchor_id: toInt(session.recent_anchor_id),
    last_recent_row_id: toInt(session.last_recent_row_id),
    last_sync_at: session.last_sync_at || '',
    last_sync_status: session.last_sync_status || '',
    hop_warmup_started_at: session.hop_warmup_started_at || '',
    hop_started_at: session.hop_started_at || '',
    hop_ends_at: session.hop_ends_at || '',
    hop_warmup_seconds: hopConfig.warmupSeconds,
    hop_window_seconds: hopConfig.windowSeconds,
    hop_warmup_finished_announced_at: session.hop_warmup_finished_announced_at || '',
    hop_finished_announced_at: session.hop_finished_announced_at || '',
    hop_total_rating_points: toInt(session.hop_total_rating_points),
    hop_counted_clear_count: toInt(session.hop_counted_clear_count),
    hop_average_level: Number(session.hop_average_level || 0),
    hop_average_rating_points: Number(session.hop_average_rating_points || 0),
    hop_highest_rating_points: toInt(session.hop_highest_rating_points),
    hop_lowest_rating_points: toInt(session.hop_lowest_rating_points),
    hop_completed: toInt(session.hop_completed) === 1,
    viewer_count: Math.max(0, toInt(viewerCount)),
    viewer_peak: Math.max(0, toInt(session.viewer_peak)),
    created_at: session.created_at || '',
    started_at: session.started_at || '',
    ended_at: session.ended_at || '',
    updated_at: session.updated_at || '',
    is_host: String(currentUserId || '') === String(session.host_user_id || ''),
    is_participant: !!currentParticipant,
    participant_role: currentParticipant?.role || '',
    cohost_count: Math.max(0, visibleParticipants.filter((participant) => participant.role === LIVE_PARTICIPANT_ROLE_COHOST).length),
    participants: visibleParticipants,
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
  const viewerPeak = getViewerPeak(freshSession, viewerCount);
  const host = getHostProfile(db, freshSession.host_user_id);
  const participants = getSessionParticipants(db, freshSession, { currentUserId });
  const playRows = getSessionPlays(db, freshSession.id);
  const displayState = buildSessionDisplayState(db, freshSession, playRows);
  const plays = displayState.plays;
  const messages = getSessionMessages(db, freshSession.id, currentUserId);
  const requests = getSessionRequests(db, freshSession.id);
  const activeVote = getLatestVoteSnapshot(db, freshSession.id, currentUserId);
  const summary = buildLiveSessionSummary(playRows, host || {}, {
    sessionId: freshSession.id,
    sessionTitle: freshSession.title,
    participantRole: LIVE_PARTICIPANT_ROLE_OWNER,
    viewerCount,
    viewerPeak,
    streamUrl: freshSession.stream_url,
    hostUsername: host?.username || '',
  });

  return {
    session: normalizeSessionPayload({ ...freshSession, viewer_peak: viewerPeak }, host, viewerCount, currentUserId, participants),
    viewer_state: getSessionViewerState(db, freshSession, currentUserId),
    summary,
    hop: displayState.hop,
    plays,
    messages,
    requests,
    active_vote: activeVote,
    last_play: plays[0] || null,
  };
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
  const viewerPeak = getViewerPeak(session, viewerCount);
  const participants = getSessionParticipants(db, session, { currentUserId });
  const playRows = getSessionPlays(db, session.id);
  const displayState = buildSessionDisplayState(db, session, playRows);
  const lastPlay = displayState.plays[0] || null;
  const activeVote = getLatestVoteSnapshot(db, session.id, currentUserId);

  return {
    session: normalizeSessionPayload({ ...session, viewer_peak: viewerPeak }, host, viewerCount, currentUserId, participants),
    last_play: lastPlay,
    hop: displayState.hop,
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
  const viewerPeak = getViewerPeak(session, viewerCount);
  const participants = getSessionParticipants(db, session, { currentUserId });
  const playRows = getSessionPlays(db, session.id);
  const displayState = buildSessionDisplayState(db, session, playRows);
  const plays = displayState.plays;
  const messageCount = getSessionMessageCount(db, session.id);
  const interactionCounts = getSessionInteractionCounts(db, session.id);
  const summary = playRows.length > 0
      ? buildLiveSessionSummary(playRows, host || {}, {
        sessionId: session.id,
        sessionTitle: session.title,
        participantRole: LIVE_PARTICIPANT_ROLE_OWNER,
        viewerCount,
        viewerPeak,
        messageCount,
        requestPlayCount: interactionCounts.requestPlayCount,
        votedSongPlayCount: interactionCounts.votedSongPlayCount,
        interactions: interactionCounts.interactions,
        streamUrl: session.stream_url,
        hostUsername: host?.username || '',
      })
    : null;

  return {
    session: normalizeSessionPayload({ ...session, viewer_peak: viewerPeak }, host, viewerCount, currentUserId, participants),
    summary,
    hop: displayState.hop,
    last_play: plays[0] || null,
    message_count: messageCount,
    request_counts: getSessionRequestCounts(db, session.id),
    active_vote: summarizeVoteForDirectory(getLatestVoteSnapshot(db, session.id, currentUserId)),
  };
}

function buildProfileEndedSessionPayload(db, session, currentUserId = '') {
  if (!session) return null;
  const host = getHostProfile(db, session.host_user_id);
  const participants = getSessionParticipants(db, session, { currentUserId, includeLeft: true });
  const playRows = getSessionPlays(db, session.id);
  const displayState = buildSessionDisplayState(db, session, playRows);
  const plays = displayState.plays;
  const messageCount = getSessionMessageCount(db, session.id);
  const interactionCounts = getSessionInteractionCounts(db, session.id);
  const summary = playRows.length > 0
      ? buildLiveSessionSummary(playRows, host || {}, {
        sessionId: session.id,
        sessionTitle: session.title,
        participantRole: LIVE_PARTICIPANT_ROLE_OWNER,
        viewerCount: 0,
        viewerPeak: Math.max(0, toInt(session.viewer_peak)),
        messageCount,
        requestPlayCount: interactionCounts.requestPlayCount,
        votedSongPlayCount: interactionCounts.votedSongPlayCount,
        interactions: interactionCounts.interactions,
        streamUrl: session.stream_url,
        hostUsername: host?.username || '',
      })
    : null;

  return {
    session: normalizeSessionPayload(session, host, 0, currentUserId, participants),
    summary,
    hop: displayState.hop,
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
      AND COALESCE(deleted_at, '') = ''
      AND status = 'ended'
      AND (? = host_user_id OR COALESCE(is_hidden_from_profile, 0) = 0)
    ORDER BY datetime(COALESCE(NULLIF(ended_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT ?
  `).all(hostUserId, String(currentUserId || ''), Math.max(1, Math.min(24, toInt(limit) || 12)));

  return rows.map((row) => buildProfileEndedSessionPayload(db, row, currentUserId)).filter(Boolean);
}

function buildHourOfPowerAttemptEntry(row) {
  return {
    session_id: String(row?.id || ''),
    title: String(row?.title || ''),
    user_id: String(row?.host_user_id || ''),
    username: String(row?.username || '').trim() || 'Player',
    avatar: normalizeUserAvatarForList(row?.avatar, row?.host_user_id, 56, row?.avatar_v),
    nationality: String(row?.nationality || '').trim(),
    skill_title: String(row?.skill_title || '').trim(),
    stream_url: String(row?.stream_url || '').trim(),
    started_at: String(row?.started_at || '').trim(),
    ended_at: String(row?.ended_at || '').trim(),
    live_url: `/live/${encodeURIComponent(String(row?.id || '').trim())}`,
    total_rating_points: toInt(row?.hop_total_rating_points),
    counted_clear_count: toInt(row?.hop_counted_clear_count),
    average_level: Number(row?.hop_average_level || 0),
    average_rating_points: Number(row?.hop_average_rating_points || 0),
    highest_rating_points: toInt(row?.hop_highest_rating_points),
    lowest_rating_points: toInt(row?.hop_lowest_rating_points),
    completed: toInt(row?.hop_completed) === 1,
  };
}

function getHourOfPowerAttempts(db, userId = '', limit = 20) {
  const normalizedUserId = String(userId || '').trim();
  const rows = db.prepare(`
    SELECT
      s.*,
      u.username,
      u.avatar,
      u.avatar_v,
      u.nationality,
      u.skill_title
    FROM live_sessions s
    JOIN users u ON u.id = s.host_user_id
    WHERE s.session_type = ?
      AND s.status = 'ended'
      AND COALESCE(s.deleted_at, '') = ''
      AND (? = '' OR s.host_user_id = ?)
    ORDER BY datetime(COALESCE(NULLIF(s.ended_at, ''), s.updated_at, s.created_at)) DESC, s.id DESC
    LIMIT ?
  `).all(
    HOP_SESSION_TYPE,
    normalizedUserId,
    normalizedUserId,
    Math.max(1, Math.min(100, toInt(limit) || 20))
  );

  return rows.map(buildHourOfPowerAttemptEntry);
}

function getHourOfPowerLeaderboard(db, currentUserId = '', limit = 100) {
  const attempts = getHourOfPowerAttempts(db, '', 1000).filter((row) => row.completed);
  const bestByUserId = new Map();

  for (const attempt of attempts) {
    const key = String(attempt?.user_id || '').trim();
    if (!key) continue;
    const existing = bestByUserId.get(key);
    if (!existing) {
      bestByUserId.set(key, attempt);
      continue;
    }

    if (attempt.total_rating_points > existing.total_rating_points) {
      bestByUserId.set(key, attempt);
      continue;
    }
    if (attempt.total_rating_points === existing.total_rating_points) {
      if (attempt.average_rating_points > existing.average_rating_points) {
        bestByUserId.set(key, attempt);
        continue;
      }
      const attemptEndedAt = Date.parse(`${attempt.ended_at || ''}Z`) || 0;
      const existingEndedAt = Date.parse(`${existing.ended_at || ''}Z`) || 0;
      if (attemptEndedAt > existingEndedAt) {
        bestByUserId.set(key, attempt);
      }
    }
  }

  const rankedRows = Array.from(bestByUserId.values())
    .sort((a, b) => {
      if (b.total_rating_points !== a.total_rating_points) {
        return b.total_rating_points - a.total_rating_points;
      }
      if (b.average_rating_points !== a.average_rating_points) {
        return b.average_rating_points - a.average_rating_points;
      }
      if (b.average_level !== a.average_level) {
        return b.average_level - a.average_level;
      }
      return String(a.username || '').localeCompare(String(b.username || ''));
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      is_current_user: String(row?.user_id || '') === String(currentUserId || ''),
    }));

  const rows = rankedRows.slice(0, Math.max(1, Math.min(500, toInt(limit) || 100)));
  const currentUserBest = rankedRows.find((row) => row.is_current_user)
    || null;

  return {
    rows,
    current_user_best: currentUserBest,
  };
}

function ensureUserCanJoinLiveSession(db, userId, currentSessionId = '') {
  const existing = getActiveSessionForParticipant(db, userId);
  if (existing && String(existing.id || '') !== String(currentSessionId || '')) {
    const err = new Error('That user is already in another active live session');
    err.statusCode = 409;
    throw err;
  }
}

function setLiveSessionParticipantState(db, session, user, options = {}) {
  const userId = String(user?.id || user?.user_id || '').trim();
  const role = normalizeLiveParticipantRole(options.role);
  const status = normalizeLiveParticipantStatus(options.status);
  const joinedAt = String(options.joinedAt || '').trim();
  const leftAt = String(options.leftAt || '').trim();
  const addedByUserId = String(options.addedByUserId || session.host_user_id || '').trim() || session.host_user_id;
  const recentAnchorId = toInt(options.recent_anchor_id);
  const lastRecentRowId = toInt(options.last_recent_row_id);
  const lastSyncAt = String(options.last_sync_at || '').trim();
  const lastSyncStatus = String(options.last_sync_status || '').trim();

  if (!session?.id || !userId) return null;

  db.prepare(`
    INSERT INTO live_session_participants (
      live_session_id, user_id, role, status, added_by_user_id, joined_at, left_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now')), ?, datetime('now'), datetime('now'))
    ON CONFLICT(live_session_id, user_id) DO UPDATE SET
      role = excluded.role,
      status = excluded.status,
      added_by_user_id = excluded.added_by_user_id,
      joined_at = CASE
        WHEN excluded.status = ? THEN excluded.joined_at
        ELSE live_session_participants.joined_at
      END,
      left_at = CASE
        WHEN excluded.status = ? THEN excluded.left_at
        ELSE ''
      END,
      updated_at = datetime('now')
  `).run(
    session.id,
    userId,
    role,
    status,
    addedByUserId,
    joinedAt,
    leftAt,
    LIVE_PARTICIPANT_STATUS_ACTIVE,
    LIVE_PARTICIPANT_STATUS_LEFT
  );

  db.prepare(`
    INSERT INTO live_session_participant_sync (
      live_session_id, user_id, recent_anchor_id, last_recent_row_id, last_sync_at, last_sync_status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(live_session_id, user_id) DO UPDATE SET
      recent_anchor_id = excluded.recent_anchor_id,
      last_recent_row_id = excluded.last_recent_row_id,
      last_sync_at = excluded.last_sync_at,
      last_sync_status = excluded.last_sync_status,
      updated_at = datetime('now')
  `).run(
    session.id,
    userId,
    recentAnchorId,
    lastRecentRowId,
    lastSyncAt,
    lastSyncStatus
  );

  return getSessionParticipantRecord(db, session, userId, {
    includeLeft: true,
    currentUserId: options.currentUserId || '',
  });
}

function skipTargetedRequestsForDepartedParticipant(db, session, targetUserId, actorUserId = '') {
  const normalizedTargetUserId = String(targetUserId || '').trim();
  if (!session?.id || !normalizedTargetUserId) {
    return {
      requests: getSessionRequests(db, session?.id || ''),
      message_ids: [],
    };
  }

  const rows = db.prepare(`
    SELECT *
    FROM live_session_requests
    WHERE live_session_id = ?
      AND target_user_id = ?
      AND COALESCE(NULLIF(status, ''), CASE WHEN fulfilled = 1 THEN 'played' ELSE 'open' END) IN ('open', 'queued')
    ORDER BY created_at ASC, id ASC
  `).all(session.id, normalizedTargetUserId);

  const messageIds = [];
  for (const row of rows) {
    const result = updateLiveRequestStatus(db, row, 'skipped', {
      actorUserId,
      emitMessage: true,
    });
    if (result?.announcement_message_id) {
      messageIds.push(result.announcement_message_id);
    }
  }

  return {
    requests: getSessionRequests(db, session.id),
    message_ids: messageIds,
  };
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
      AND COALESCE(s.deleted_at, '') = ''
    ORDER BY s.started_at DESC, s.id DESC
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
    if (!key) continue;
    if (!playByKey.has(key)) playByKey.set(key, []);
    playByKey.get(key).push(play);
  }
  if (playByKey.size === 0) return [];

  const requests = db.prepare(`
    SELECT id, live_session_id, username, song_title, mode, level, status, fulfilled, target_user_id, target_username
    FROM live_session_requests
    WHERE live_session_id = ?
      AND COALESCE(NULLIF(status, ''), CASE WHEN fulfilled = 1 THEN 'played' ELSE 'open' END) IN ('open', 'queued')
    ORDER BY created_at ASC, id ASC
  `).all(liveSessionId);
  if (!requests.length) return [];

  const matched = [];
  for (const request of requests) {
    const key = buildRequestKey(request.song_title, request.mode, request.level);
    const possiblePlays = playByKey.get(key) || [];
    const play = possiblePlays.find((candidate) => {
      if (!candidate) return false;
      const targetUserId = String(request.target_user_id || '').trim();
      if (targetUserId && String(candidate.user_id || '') !== targetUserId) return false;
      return true;
    }) || null;
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

function buildPlayAnnouncement(play, outcome, hopPlay = null) {
  const label = formatPlayLabel(play);
  const performer = getPlayPerformerLabel(play);
  const score = toInt(play?.score);
  const grade = String(play?.grade || '').trim() || (score > 0 ? score.toLocaleString() : 'FAIL');
  const normalizedGrade = normalizeGradeKey(play?.grade);
  const commentary = getPerformanceMessageSelection(play);
  const base = pickDeterministicMessage(
    commentary.messages,
    `${label}|${normalizedGrade}|${score}|${commentary.key}`
  );

  const prefix = performer ? `${performer} played ${label}` : `Last played: ${label}`;
  return `${prefix} • ${grade} ${score > 0 ? score.toLocaleString() : ''}`.trim()
    + `. ${base}${buildHourOfPowerAnnouncementSuffix(hopPlay)}`;
}

function buildHourOfPowerAnnouncementSuffix(hopPlay) {
  if (!hopPlay) return '';
  if (hopPlay.hop_counts_towards_total) {
    return ` +${toInt(hopPlay.hop_rating_points_earned)} HoP • ${toInt(hopPlay.hop_running_total)} total.`;
  }
  if (hopPlay.hop_not_counted_reason === 'warmup') return ' Warmup play. Not counted.';
  if (hopPlay.hop_not_counted_reason === 'after_window') return ' Started after time. Not counted.';
  if (hopPlay.hop_not_counted_reason === 'fail') return ' No clear. Not counted.';
  return '';
}

function annotateLiveSyncOutcomeRow(row, actor) {
  return {
    ...(row || {}),
    performer_user_id: String(actor?.id || '').trim(),
    performer_username: String(actor?.username || '').trim(),
  };
}

function bufferSyncResults(db, liveSessionId, syncResult, actor) {
  const insertBufferedUpscore = db.prepare(`
    INSERT INTO live_session_buffered_upscores (
      live_session_id, performer_user_id, payload_json, pumbility_gain, singles_pumbility_gain, finalized_at, finalized_post_id
    )
    VALUES (?, ?, ?, ?, ?, '', 0)
  `);
  const insertBufferedClear = db.prepare(`
    INSERT INTO live_session_buffered_clears (
      live_session_id, performer_user_id, payload_json, pumbility_gain, singles_pumbility_gain, finalized_at, finalized_post_id
    )
    VALUES (?, ?, ?, ?, ?, '', 0)
  `);
  let bufferedRowsAdded = false;

  for (const row of Array.isArray(syncResult?.upscores) ? syncResult.upscores : []) {
    const payload = annotateLiveSyncOutcomeRow(row, actor);
    insertBufferedUpscore.run(
      liveSessionId,
      payload.performer_user_id,
      JSON.stringify(payload),
      toInt(payload?.pumbility_gain),
      toInt(payload?.singles_pumbility_gain)
    );
    bufferedRowsAdded = true;
  }

  const clearRows = [
    ...(Array.isArray(syncResult?.new_clears) ? syncResult.new_clears : []),
    ...(Array.isArray(syncResult?.title_unlock_rows) ? syncResult.title_unlock_rows : []),
  ];
  for (const row of clearRows) {
    const payload = annotateLiveSyncOutcomeRow(row, actor);
    insertBufferedClear.run(
      liveSessionId,
      payload.performer_user_id,
      JSON.stringify(payload),
      toInt(payload?.pumbility_gain),
      toInt(payload?.singles_pumbility_gain)
    );
    bufferedRowsAdded = true;
  }

  if (bufferedRowsAdded) {
    clearPlayOutcomeCache(liveSessionId);
  }
}

function appendRecentRowsToSession(db, session, recentRows, actor) {
  const insertPlay = db.prepare(`
    INSERT OR IGNORE INTO live_session_plays (
      live_session_id, user_id, recently_played_id, song_title, mode, level, score, grade,
      machine_name, background_url, date_played, played_at_utc, perfect, great, good, bad, miss, max_combo,
      kcal, plate, over_top100_rank, shoe_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inserted = [];
  for (const row of recentRows) {
    const result = insertPlay.run(
      session.id,
      actor.id,
      row.id,
      row.song_title,
      row.mode,
      toInt(row.level),
      toInt(row.score),
      row.grade || '',
      row.machine_name || '',
      row.background_url || '',
      row.date_played || '',
      row.played_at_utc || normalizePiugamePlayedAtUtc(row.date_played || ''),
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
    if (result.changes > 0) inserted.push({
      ...row,
      user_id: actor.id,
      username: actor.username || '',
      avatar: actor.avatar || '',
      skill_title: actor.skill_title || '',
      nationality: actor.nationality || '',
      participant_role: actor.role || LIVE_PARTICIPANT_ROLE_COHOST,
      participant_status: actor.status || LIVE_PARTICIPANT_STATUS_ACTIVE,
    });
  }
  return inserted;
}

function applyLiveSyncResult(db, session, syncResult, actor) {
  const syncActor = actor?.id ? actor : {
    id: session.host_user_id,
    username: session.host_username || '',
    avatar: '',
    skill_title: '',
    nationality: '',
    role: LIVE_PARTICIPANT_ROLE_OWNER,
    status: LIVE_PARTICIPANT_STATUS_ACTIVE,
  };
  const syncState = ensureParticipantSyncCursor(db, session, syncActor.id, {
    recent_anchor_id: toInt(session.recent_anchor_id),
    last_recent_row_id: toInt(session.last_recent_row_id),
    last_sync_at: session.last_sync_at || '',
    last_sync_status: session.last_sync_status || '',
  });
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
  `).all(syncActor.id, toInt(syncState?.last_recent_row_id));

  const insertedRows = appendRecentRowsToSession(db, session, recentRows, syncActor);
  bufferSyncResults(db, session.id, syncResult, syncActor);
  const syncMessageIds = [];
  const hopDisplayState = isHourOfPowerSession(session)
    ? buildSessionDisplayState(db, session, getSessionPlays(db, session.id))
    : null;
  const hopPlayByRecentId = new Map(
    (Array.isArray(hopDisplayState?.plays) ? hopDisplayState.plays : [])
      .map((row) => [String(row?.recently_played_id || ''), row])
  );

  const outcomeMap = new Map();
  for (const row of Array.isArray(syncResult?.upscores) ? syncResult.upscores : []) {
    outcomeMap.set(
      buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.new_score, syncActor.id),
      { ...row, type: 'upscore', performer_user_id: syncActor.id, performer_username: syncActor.username || '' }
    );
  }
  for (const row of Array.isArray(syncResult?.new_clears) ? syncResult.new_clears : []) {
    const key = buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.score, syncActor.id);
    if (!outcomeMap.has(key)) outcomeMap.set(key, { ...row, type: 'clear' });
  }

  for (const row of insertedRows) {
    const outcome = outcomeMap.get(buildPlayOutcomeKey(row.song_title, row.mode, row.level, row.score, syncActor.id)) || null;
    const hopPlay = hopPlayByRecentId.get(String(row.id)) || null;
    syncMessageIds.push(addSystemMessage(
      db,
      session.id,
      buildPlayAnnouncement(row, outcome, hopPlay),
      'play',
      {
        recently_played_id: toInt(row.id),
        song_title: row.song_title || '',
        mode: row.mode || '',
        level: toInt(row.level),
        jacket_url: row.background_url || '',
        score: toInt(row.score),
        grade: row.grade || '',
        performed_by_user_id: syncActor.id,
        performed_by_username: syncActor.username || '',
        pumbility_gain: toInt(outcome?.pumbility_gain),
        session_result_type: outcome?.type || '',
        over_top100_rank: Math.max(toInt(row.over_top100_rank), toInt(outcome?.over_top100_rank)),
        hop_rating_points_earned: toInt(hopPlay?.hop_rating_points_earned),
        hop_running_total: toInt(hopPlay?.hop_running_total),
        hop_counts_towards_total: !!hopPlay?.hop_counts_towards_total,
        hop_status_label: hopPlay?.hop_status_label || '',
        hop_not_counted_reason: hopPlay?.hop_not_counted_reason || '',
        session_type: normalizeSessionType(session?.session_type),
      }
    ));
  }

  const fulfilledRequests = fulfillMatchingRequests(db, session.id, insertedRows, syncActor.id);
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
      syncMessageIds.push(addSystemMessage(
        db,
        session.id,
        buildRequestFulfillmentMessage(group.play, group.requesters),
        'request_fulfilled',
        {
          request_ids: group.requestIds,
          song_title: group.play?.song_title || '',
          mode: group.play?.mode || '',
          level: toInt(group.play?.level),
          jacket_url: group.play?.background_url || '',
          recently_played_id: toInt(group.play?.id),
          score: toInt(group.play?.score),
          grade: group.play?.grade || '',
          performed_by_user_id: group.play?.user_id || syncActor.id,
          performed_by_username: group.play?.username || syncActor.username || '',
        }
      ));
    }
  }

  const unlockedTitles = Array.isArray(syncResult?.newly_unlocked_titles) ? syncResult.newly_unlocked_titles : [];
  if (unlockedTitles.length > 0) {
    const titleNames = unlockedTitles.map((title) => title?.name || title?.skill_title).filter(Boolean).slice(0, 3);
    const suffix = unlockedTitles.length > 3 ? ` (+${unlockedTitles.length - 3} more)` : '';
    syncMessageIds.push(addSystemMessage(
      db,
      session.id,
      `Title earned: ${titleNames.join(', ')}${suffix}.`,
      'title_unlock',
      { titles: titleNames, count: unlockedTitles.length }
    ));
  }

  const lastRecentRowId = recentRows.length > 0
    ? Math.max(...recentRows.map((row) => toInt(row.id)))
    : toInt(syncState?.last_recent_row_id);
  db.prepare(`
    UPDATE live_session_participant_sync
    SET last_recent_row_id = ?,
        last_sync_at = datetime('now'),
        last_sync_status = 'ok',
        updated_at = datetime('now')
    WHERE live_session_id = ?
      AND user_id = ?
  `).run(lastRecentRowId, session.id, syncActor.id);
  db.prepare(`
    UPDATE live_sessions
    SET last_recent_row_id = CASE
          WHEN last_recent_row_id < ? THEN ?
          ELSE last_recent_row_id
        END,
        last_sync_at = datetime('now'),
        last_sync_status = 'ok',
        updated_at = datetime('now')
    WHERE id = ?
  `).run(lastRecentRowId, lastRecentRowId, session.id);

  return {
    delta: {
      recent_rows_seen: recentRows.length,
      new_plays_added: insertedRows.length,
      requests_fulfilled: fulfilledRequests.length,
      buffered_upscores: Array.isArray(syncResult?.upscores) ? syncResult.upscores.length : 0,
      buffered_clears: (Array.isArray(syncResult?.new_clears) ? syncResult.new_clears.length : 0)
        + (Array.isArray(syncResult?.title_unlock_rows) ? syncResult.title_unlock_rows.length : 0),
      title_unlocks: unlockedTitles.length,
    },
    plays_changed: insertedRows.length > 0,
    requests_changed: fulfilledRequests.length > 0,
    message_ids: syncMessageIds,
  };
}

function parseBufferedRows(db, liveSessionId, tableName, options = {}) {
  const normalizedPerformerUserId = String(options.performerUserId || '').trim();
  const includeFinalized = !!options.includeFinalized;
  return db.prepare(`
    SELECT id, performer_user_id, payload_json, pumbility_gain, singles_pumbility_gain, finalized_at, finalized_post_id
    FROM ${tableName}
    WHERE live_session_id = ?
      AND (? = '' OR performer_user_id = ?)
      AND (? = 1 OR COALESCE(finalized_at, '') = '')
    ORDER BY id ASC
  `).all(liveSessionId, normalizedPerformerUserId, normalizedPerformerUserId, includeFinalized ? 1 : 0).map((row) => {
    const payload = safeParseJson(row.payload_json || '{}', {});
    payload.buffered_row_id = toInt(row.id);
    payload.performer_user_id = String(payload.performer_user_id || row.performer_user_id || '').trim();
    payload.pumbility_gain = toInt(row.pumbility_gain || payload.pumbility_gain);
    payload.singles_pumbility_gain = toInt(row.singles_pumbility_gain || payload.singles_pumbility_gain);
    payload.finalized_at = row.finalized_at || '';
    payload.finalized_post_id = toInt(row.finalized_post_id || payload.finalized_post_id);
    return payload;
  });
}

function serializeSessionShareMarker(share) {
  const encoded = Buffer.from(JSON.stringify(share || {}), 'utf8').toString('base64');
  return `[[SHINSA_SHARE_V1:${encoded}]]`;
}

function buildSummaryPostContent(summary, session = null, hopShare = null) {
  if (isHourOfPowerSession(session)) {
    return hopShare ? serializeSessionShareMarker(hopShare) : '';
  }
  if (!summary) return '';
  return serializeLiveSessionMarker(summary);
}

function groupRowsByPerformer(rows) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const performerUserId = String(row?.performer_user_id || row?.user_id || '').trim();
    if (!performerUserId) continue;
    if (!grouped.has(performerUserId)) grouped.set(performerUserId, []);
    grouped.get(performerUserId).push(row);
  }
  return grouped;
}

function buildParticipantLiveSummary(participant, plays, session, sharedContext = {}) {
  const participantRows = Array.isArray(plays) ? plays : [];
  if (participantRows.length === 0) return null;
  return buildLiveSessionSummary(participantRows, participant || {}, {
    sessionId: session.id,
    sessionTitle: session.title,
    participantRole: participant?.role || (String(participant?.user_id || '') === String(session?.host_user_id || '') ? LIVE_PARTICIPANT_ROLE_OWNER : ''),
    viewerCount: sharedContext.viewerCount,
    viewerPeak: sharedContext.viewerPeak,
    messageCount: sharedContext.messageCount,
    requestPlayCount: sharedContext.requestPlayCount,
    votedSongPlayCount: sharedContext.votedSongPlayCount,
    interactions: sharedContext.interactions,
    streamUrl: session.stream_url,
    hostUsername: participant?.username || '',
  });
}

function stripBufferedRowMetadata(row) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row };
  delete next.buffered_row_id;
  delete next.finalized_at;
  delete next.finalized_post_id;
  return next;
}

function createParticipantLiveSessionArtifacts(db, session, participant, participantPlays, upscoreRows, clearRows, replayLookup, sharedContext = {}) {
  const summary = buildParticipantLiveSummary(participant, participantPlays, session, sharedContext);
  const replayEnhancedPlays = attachReplayMetadataToPlayRows(participantPlays, replayLookup);
  const participantDisplayState = buildSessionDisplayState(db, session, replayEnhancedPlays);
  const hopShare = isHourOfPowerSession(session)
    ? buildHourOfPowerShare(session, participantDisplayState.hop)
    : null;
  const filteredUpscores = (Array.isArray(upscoreRows) ? upscoreRows : []).map(stripBufferedRowMetadata);
  const filteredClears = (Array.isArray(clearRows) ? clearRows : []).map(stripBufferedRowMetadata);
  const replayRows = [
    ...filteredUpscores,
    ...filteredClears.filter((row) => String(row?.entry_type || 'song_clear') !== 'title_unlock'),
  ];
  const upscoreGain = filteredUpscores.reduce((sum, row) => sum + toInt(row?.pumbility_gain), 0);
  const singlesUpscoreGain = filteredUpscores.reduce((sum, row) => sum + toInt(row?.singles_pumbility_gain), 0);
  const clearGain = filteredClears.reduce((sum, row) => sum + toInt(row?.pumbility_gain), 0);
  const singlesClearGain = filteredClears.reduce((sum, row) => sum + toInt(row?.singles_pumbility_gain), 0);
  const clearCount = filteredClears.filter((row) => String(row?.entry_type || 'song_clear') !== 'title_unlock').length;
  const titleCount = filteredClears.length - clearCount;

  let upscorePostId = null;
  let clearPostId = null;
  let summaryPostId = null;

  if (filteredUpscores.length > 0) {
    const result = db.prepare(`
      INSERT INTO user_upscores (user_id, upscores_json, pumbility_gain, singles_pumbility_gain, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(participant.user_id, JSON.stringify(filteredUpscores), upscoreGain, singlesUpscoreGain);
    upscorePostId = result.lastInsertRowid;
  }

  if (filteredClears.length > 0) {
    clearPostId = insertGroupedNewClearPost(db, participant.user_id, filteredClears, {
      pumbilityGain: clearGain,
      singlesPumbilityGain: singlesClearGain,
    });
  }

  if (replayRows.length > 0) {
    syncSessionReplayLinks(db, participant.user_id, replayRows, replayLookup);
  }

  if (summary || hopShare) {
    const result = db.prepare(`
      INSERT INTO user_posts (user_id, content, images, youtube_url, comments_disabled, created_at)
      VALUES (?, ?, '[]', ?, 0, datetime('now'))
    `).run(participant.user_id, buildSummaryPostContent(summary, session, hopShare), session.stream_url || '');
    summaryPostId = result.lastInsertRowid;
  }

  return {
    user_id: participant.user_id,
    actorUsername: participant.username || 'Someone',
    summary,
    hop: participantDisplayState.hop,
    hop_share: hopShare,
    upscore_post_id: upscorePostId,
    clear_post_id: clearPostId,
    summary_post_id: summaryPostId,
    upscore_rows: filteredUpscores,
    clear_rows: filteredClears,
    clear_count: clearCount,
    title_count: titleCount,
  };
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

function buildLiveSessionUpdateBase(db, sessionOrId) {
  const freshSession = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : getLiveSession(db, sessionOrId?.id);
  if (!freshSession) return null;

  const viewerCount = getViewerCount(db, freshSession);
  const viewerPeak = getViewerPeak(freshSession, viewerCount);
  const host = getHostProfile(db, freshSession.host_user_id);
  const participants = getSessionParticipants(db, freshSession, { currentUserId: freshSession.host_user_id });
  return {
    freshSession,
    host,
    participants,
    viewerCount,
    viewerPeak,
  };
}

function broadcastLiveSessionUpdated(db, liveSessionId, reason = 'session_updated') {
  const base = buildLiveSessionUpdateBase(db, liveSessionId);
  if (!base) return 0;

  return emitLiveSessionEvent(liveSessionId, 'session_updated', ({ userId }) => ({
    reason,
    session: normalizeSessionPayload(
      { ...base.freshSession, viewer_peak: base.viewerPeak },
      base.host,
      base.viewerCount,
      userId,
      getSessionParticipants(db, base.freshSession, { currentUserId: userId })
    ),
    emitted_at: new Date().toISOString(),
  }));
}

function broadcastLivePlaysUpdated(db, liveSessionId, reason = 'plays_updated') {
  const base = buildLiveSessionUpdateBase(db, liveSessionId);
  if (!base) return 0;

  const playRows = getSessionPlays(db, base.freshSession.id);
  const displayState = buildSessionDisplayState(db, base.freshSession, playRows);
  const plays = displayState.plays;
  const summary = buildLiveSessionSummary(playRows, base.host || {}, {
    sessionId: base.freshSession.id,
    sessionTitle: base.freshSession.title,
    participantRole: LIVE_PARTICIPANT_ROLE_OWNER,
    viewerCount: base.viewerCount,
    viewerPeak: base.viewerPeak,
    streamUrl: base.freshSession.stream_url,
    hostUsername: base.host?.username || '',
  });

  return emitLiveSessionEvent(liveSessionId, 'plays_updated', ({ userId }) => ({
    reason,
    session: normalizeSessionPayload(
      { ...base.freshSession, viewer_peak: base.viewerPeak },
      base.host,
      base.viewerCount,
      userId,
      getSessionParticipants(db, base.freshSession, { currentUserId: userId })
    ),
    plays,
    last_play: plays[0] || null,
    summary,
    hop: displayState.hop,
    emitted_at: new Date().toISOString(),
  }));
}

function getNormalizedLiveMessage(db, messageId, currentUserId = '') {
  return normalizeMessageRow(getLiveMessageRow(db, messageId, currentUserId));
}

function broadcastLiveMessageAdded(liveSessionId, message, reason = 'message_added') {
  if (!message?.id) return 0;
  return emitLiveSessionEvent(liveSessionId, 'message_added', {
    reason,
    message,
    emitted_at: new Date().toISOString(),
  });
}

function broadcastLiveMessageUpdated(db, liveSessionId, messageId, reason = 'message_updated') {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) return 0;

  return emitLiveSessionEvent(liveSessionId, 'message_updated', ({ userId }) => {
    const message = getNormalizedLiveMessage(db, normalizedMessageId, userId);
    if (!message?.id) return undefined;
    return {
      reason,
      message,
      emitted_at: new Date().toISOString(),
    };
  });
}

function broadcastLiveMessageRemoved(liveSessionId, messageId, reason = 'message_removed') {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) return 0;
  return emitLiveSessionEvent(liveSessionId, 'message_removed', {
    reason,
    message_id: normalizedMessageId,
    emitted_at: new Date().toISOString(),
  });
}

function broadcastLiveRequestsUpdated(liveSessionId, requests, reason = 'requests_updated') {
  return emitLiveSessionEvent(liveSessionId, 'requests_updated', {
    reason,
    requests: Array.isArray(requests) ? requests : [],
    emitted_at: new Date().toISOString(),
  });
}

function broadcastLiveModerationUpdated(db, sessionOrId, targetUserId, moderation, reason = 'moderation_updated') {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  if (!session?.id) return 0;

  const normalizedTargetUserId = String(targetUserId || '').trim();
  const nextModeration = moderation || getLiveModerationState(db, session.id, normalizedTargetUserId);
  return emitLiveSessionEvent(session.id, 'moderation_updated', ({ userId }) => ({
    reason,
    target_user_id: normalizedTargetUserId,
    moderation: nextModeration,
    viewer_state: getSessionViewerState(db, session, userId),
    emitted_at: new Date().toISOString(),
  }));
}

function broadcastLiveVoteUpdated(db, liveSessionId, reason = 'vote_updated') {
  return emitLiveSessionEvent(liveSessionId, 'vote_updated', ({ userId }) => ({
    reason,
    vote: getLatestVoteSnapshot(db, liveSessionId, userId),
    emitted_at: new Date().toISOString(),
  }));
}

function broadcastLiveSyncUpdates(db, sessionOrId, syncUpdate = {}, reason = 'sync') {
  const session = typeof sessionOrId === 'string'
    ? getLiveSession(db, sessionOrId)
    : sessionOrId;
  if (!session?.id) return 0;

  let eventsSent = 0;
  if (syncUpdate?.plays_changed) {
    eventsSent += broadcastLivePlaysUpdated(db, session.id, reason);
  } else {
    eventsSent += broadcastLiveSessionUpdated(db, session.id, reason);
  }

  if (syncUpdate?.requests_changed) {
    eventsSent += broadcastLiveRequestsUpdated(session.id, getSessionRequests(db, session.id), reason);
  }

  for (const messageId of Array.isArray(syncUpdate?.message_ids) ? syncUpdate.message_ids : []) {
    const message = getNormalizedLiveMessage(db, messageId);
    if (message) {
      eventsSent += broadcastLiveMessageAdded(session.id, message, reason);
    }
  }

  return eventsSent;
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
  const session = getActiveSessionForParticipant(db, req.user.id);
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

router.get('/hop/leaderboard', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(500, toInt(req.query?.limit) || 100));
    const payload = getHourOfPowerLeaderboard(db, req.user.id, limit);
    res.json(payload);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/hop/attempts', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const targetUserId = normalizeText(req.query?.user_id, 80) || req.user.id;
    const limit = Math.max(1, Math.min(100, toInt(req.query?.limit) || 20));
    res.json({
      user_id: targetUserId,
      attempts: getHourOfPowerAttempts(db, targetUserId, limit),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/hop/optimize', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(50, toInt(req.query?.limit) || 20));
    res.json(getHourOfPowerOptimizePayload(db, req.user.id, limit));
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
    const existing = getActiveSessionForParticipant(db, req.user.id);
    if (existing) {
      return res.status(409).json({ error: 'You are already in an active live session', existing_session_id: existing.id });
    }
    if (typeof syncRecentlyPlayedForUser !== 'function') {
      throw new Error('Live sync dependency unavailable');
    }

    const sessionType = normalizeSessionType(req.body?.session_type);
    const title = normalizeText(req.body?.title, 120)
      || (sessionType === HOP_SESSION_TYPE
        ? `${req.user.username || 'Player'} Hour of Power`
        : `${req.user.username || 'Player'} live session`);
    const statusText = sessionType === HOP_SESSION_TYPE
      ? ''
      : normalizeText(req.body?.status_text, 160);
    const defaultRequestMaxLevel = getDefaultRequestMaxLevelForUser(db, req.user.id);
    const streamSelection = await resolveLiveStreamSelection(db, req.user.id, req.body || {}, null);
    const streamUrl = streamSelection.streamUrl;
    const youtubeFields = streamSelection.youtubeFields;
    const now = new Date();
    const hopWarmupStartedAt = sessionType === HOP_SESSION_TYPE ? formatSqliteDateTime(now) : '';
    const hopStartedAt = sessionType === HOP_SESSION_TYPE
      ? formatSqliteDateTime(new Date(now.getTime() + (DEFAULT_HOP_WARMUP_SECONDS * 1000)))
      : '';
    const hopEndsAt = sessionType === HOP_SESSION_TYPE
      ? formatSqliteDateTime(new Date(now.getTime() + ((DEFAULT_HOP_WARMUP_SECONDS + DEFAULT_HOP_WINDOW_SECONDS) * 1000)))
      : '';
    const requestsEnabled = sessionType === HOP_SESSION_TYPE ? 0 : 1;

    await syncRecentlyPlayedForUser(req.user, { db, persistActivityPosts: true });

    const anchor = db.prepare(`
      SELECT COALESCE(MAX(id), 0) AS max_id
      FROM user_recently_played
      WHERE user_id = ?
    `).get(req.user.id);
    const id = uuidv4();

    db.prepare(`
      INSERT INTO live_sessions (
        id, host_user_id, title, stream_url, youtube_broadcast_id, youtube_video_id, youtube_channel_id,
        youtube_stream_title, youtube_lifecycle_status, youtube_scheduled_start_time, youtube_actual_start_time,
        status_text, requests_enabled, session_type, hop_warmup_started_at, hop_started_at, hop_ends_at,
        hop_warmup_seconds, hop_window_seconds, status, recent_anchor_id, last_recent_row_id,
        request_max_level, last_sync_at, last_sync_status, viewer_peak, created_at, started_at, ended_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?, ?, datetime('now'), 'ready', 0, datetime('now'), datetime('now'), '', datetime('now'))
    `).run(
      id,
      req.user.id,
      title,
      streamUrl,
      youtubeFields.youtube_broadcast_id,
      youtubeFields.youtube_video_id,
      youtubeFields.youtube_channel_id,
      youtubeFields.youtube_stream_title,
      youtubeFields.youtube_lifecycle_status,
      youtubeFields.youtube_scheduled_start_time,
      youtubeFields.youtube_actual_start_time,
      statusText,
      requestsEnabled,
      sessionType,
      hopWarmupStartedAt,
      hopStartedAt,
      hopEndsAt,
      DEFAULT_HOP_WARMUP_SECONDS,
      DEFAULT_HOP_WINDOW_SECONDS,
      toInt(anchor?.max_id),
      toInt(anchor?.max_id),
      defaultRequestMaxLevel
    );

    ensureSessionOwnerParticipant(db, {
      id,
      host_user_id: req.user.id,
      started_at: '',
      created_at: '',
      recent_anchor_id: toInt(anchor?.max_id),
      last_recent_row_id: toInt(anchor?.max_id),
      last_sync_at: '',
      last_sync_status: 'ready',
    });

    addSystemMessage(
      db,
      id,
      sessionType === HOP_SESSION_TYPE
        ? `${req.user.username || 'Player'} started Hour of Power. Warmup is live for 20 minutes.`
        : `${req.user.username || 'Player'} started a Shinsa Live session.`,
      sessionType === HOP_SESSION_TYPE ? 'hop_start' : 'session_start',
      {
        session_type: sessionType,
        hop_phase: sessionType === HOP_SESSION_TYPE ? 'warmup' : '',
        stream_url: streamUrl,
      }
    );
    const host = getHostProfile(db, req.user.id) || { id: req.user.id, username: req.user.username || 'Player' };
    const notifiedFollowers = notifyFollowersLive(db, id, host, title);
    ensureLiveSyncTimer(db, id);

    res.status(201).json({
      ...buildSessionSnapshot(db, id, req.user.id),
      notified_followers: notifiedFollowers,
    });
  } catch (err) {
    console.error('Create live session error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
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

router.get('/sessions/:id/youtube-timestamps', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    const payload = await buildLiveSessionYoutubeTimestampPreview(db, session, req.user.id);
    return res.json(payload);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/youtube-timestamps/publish', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    const preview = await buildLiveSessionYoutubeTimestampPreview(db, session, req.user.id);
    const updatedVideo = await updateYoutubeVideoDescription(
      db,
      req.user.id,
      preview.video_id,
      preview.next_description
    );
    return res.json({
      success: true,
      video_id: preview.video_id,
      video_title: updatedVideo?.title || preview.video_title,
      published_text: preview.text,
      description: updatedVideo?.description || preview.next_description,
      chapters: preview.chapters,
      source_start_at: preview.source_start_at,
      source_start_kind: preview.source_start_kind,
      matched_count: preview.matched_count,
      missing_duration_count: preview.missing_duration_count,
      missing_durations: preview.missing_durations,
      skipped_negative_offset_count: preview.skipped_negative_offset_count,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.patch('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    if (String(session.host_user_id || '') !== String(req.user.id || '')) {
      return res.status(403).json({ error: 'Only the host can update this live session' });
    }

    const streamSelection = await resolveLiveStreamSelection(db, req.user.id, req.body || {}, session);
    const nextStreamUrl = streamSelection.streamUrl;
    const nextYoutubeFields = streamSelection.youtubeFields;
    const nextStatusText = isHourOfPowerSession(session)
      ? normalizeText(session.status_text, 160)
      : req.body?.status_text === undefined
      ? normalizeText(session.status_text, 160)
      : normalizeText(req.body.status_text, 160);
    const nextRequestsEnabled = isHourOfPowerSession(session)
      ? false
      : req.body?.requests_enabled === undefined
      ? (toInt(session.requests_enabled) !== 0)
      : !!req.body.requests_enabled;
    const nextRequestModeFilter = req.body?.request_mode_filter === undefined
      ? normalizeRequestModeFilter(session.request_mode_filter)
      : normalizeRequestModeFilter(req.body.request_mode_filter);
    const nextRequestMaxLevel = req.body?.request_max_level === undefined
      ? normalizeRequestMaxLevel(session.request_max_level)
      : normalizeRequestMaxLevel(req.body.request_max_level);
    const nextRequestShowScores = req.body?.request_show_scores === undefined
      ? (toInt(session.request_show_scores) !== 0)
      : !!req.body.request_show_scores;
    db.prepare(`
      UPDATE live_sessions
      SET stream_url = ?,
          youtube_broadcast_id = ?,
          youtube_video_id = ?,
          youtube_channel_id = ?,
          youtube_stream_title = ?,
          youtube_lifecycle_status = ?,
          youtube_scheduled_start_time = ?,
          youtube_actual_start_time = ?,
          status_text = ?,
          requests_enabled = ?,
          request_mode_filter = ?,
          request_max_level = ?,
          request_show_scores = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nextStreamUrl,
      nextYoutubeFields.youtube_broadcast_id,
      nextYoutubeFields.youtube_video_id,
      nextYoutubeFields.youtube_channel_id,
      nextYoutubeFields.youtube_stream_title,
      nextYoutubeFields.youtube_lifecycle_status,
      nextYoutubeFields.youtube_scheduled_start_time,
      nextYoutubeFields.youtube_actual_start_time,
      nextStatusText,
      nextRequestsEnabled ? 1 : 0,
      nextRequestModeFilter,
      nextRequestMaxLevel,
      nextRequestShowScores ? 1 : 0,
      session.id
    );

    broadcastLiveSessionSnapshot(db, session.id, 'stream_updated');
    return res.json(buildSessionSnapshot(db, session.id, req.user.id));
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/cohosts', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    if (isHourOfPowerSession(session)) {
      return res.status(400).json({ error: 'Hour of Power is strictly solo and does not allow co-hosts' });
    }
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });

    const targetUserId = normalizeText(req.body?.user_id, 80);
    if (!targetUserId) return res.status(400).json({ error: 'user_id is required' });
    if (String(targetUserId) === String(session.host_user_id || '')) {
      return res.status(400).json({ error: 'The room owner is already part of this session' });
    }
    const existingParticipant = getSessionParticipantRecord(db, session, targetUserId, { includeLeft: true });
    if (existingParticipant?.status === LIVE_PARTICIPANT_STATUS_ACTIVE) {
      return res.status(409).json({ error: 'That user is already a co-host in this room' });
    }

    const user = db.prepare(`
      SELECT id, username, avatar, avatar_v, nationality, skill_title, pumbility, weight_kg
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(targetUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    ensureUserCanJoinLiveSession(db, user.id, session.id);
    await syncRecentlyPlayedForUser(user, {
      db,
      userId: user.id,
      username: user.username,
      persistActivityPosts: false,
    });
    const anchor = db.prepare(`
      SELECT COALESCE(MAX(id), 0) AS max_id
      FROM user_recently_played
      WHERE user_id = ?
    `).get(user.id);

    const participant = setLiveSessionParticipantState(db, session, user, {
      role: LIVE_PARTICIPANT_ROLE_COHOST,
      status: LIVE_PARTICIPANT_STATUS_ACTIVE,
      addedByUserId: req.user.id,
      joinedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      recent_anchor_id: toInt(anchor?.max_id),
      last_recent_row_id: toInt(anchor?.max_id),
      last_sync_status: 'ready',
      currentUserId: req.user.id,
    });

    const messageId = addSystemMessage(
      db,
      session.id,
      `${user.username || 'A player'} joined the room as a co-host.`,
      'participant_join',
      {
        participant_user_id: user.id,
        participant_username: user.username || '',
      }
    );
    const message = getNormalizedLiveMessage(db, messageId);
    const snapshot = buildSessionSnapshot(db, session.id, req.user.id);
    broadcastLiveSessionSnapshot(db, session.id, 'participants_updated');
    if (message) {
      broadcastLiveMessageAdded(session.id, message, 'participants_updated');
    }
    return res.status(201).json({
      participant,
      message,
      snapshot,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/sessions/:id/cohosts/:userId', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);
    if (isHourOfPowerSession(session)) {
      return res.status(400).json({ error: 'Hour of Power is strictly solo and does not allow co-hosts' });
    }
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });

    const participant = getSessionParticipantRecord(db, session, req.params.userId, {
      includeLeft: true,
      currentUserId: req.user.id,
    });
    if (!participant || participant.role !== LIVE_PARTICIPANT_ROLE_COHOST) {
      return res.status(404).json({ error: 'Co-host not found' });
    }
    if (participant.status === LIVE_PARTICIPANT_STATUS_LEFT) {
      return res.status(400).json({ error: 'That co-host has already left the session' });
    }

    const syncUpdate = await performLiveSessionSyncForActor(db, session, {
      id: participant.user_id,
      username: participant.username || '',
      avatar: participant.avatar || '',
      skill_title: participant.skill_title || '',
      nationality: participant.nationality || '',
      role: participant.role,
      status: participant.status,
    });
    setLiveSessionParticipantState(db, session, participant, {
      role: LIVE_PARTICIPANT_ROLE_COHOST,
      status: LIVE_PARTICIPANT_STATUS_LEFT,
      addedByUserId: req.user.id,
      joinedAt: participant.joined_at || '',
      leftAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      recent_anchor_id: 0,
      last_recent_row_id: ensureParticipantSyncCursor(db, session, participant.user_id)?.last_recent_row_id || 0,
      last_sync_at: '',
      last_sync_status: 'left',
      currentUserId: req.user.id,
    });
    const requestUpdate = skipTargetedRequestsForDepartedParticipant(db, session, participant.user_id, req.user.id);
    const messageId = addSystemMessage(
      db,
      session.id,
      `${participant.username || 'A co-host'} left the room.`,
      'participant_leave',
      {
        participant_user_id: participant.user_id,
        participant_username: participant.username || '',
      }
    );
    broadcastLiveSyncUpdates(db, session, syncUpdate, 'participant_left');
    broadcastLiveRequestsUpdated(session.id, requestUpdate.requests, 'participant_left');
    for (const messageIdToBroadcast of requestUpdate.message_ids) {
      const requestMessage = getNormalizedLiveMessage(db, messageIdToBroadcast);
      if (requestMessage) broadcastLiveMessageAdded(session.id, requestMessage, 'participant_left');
    }
    const message = getNormalizedLiveMessage(db, messageId);
    if (message) {
      broadcastLiveMessageAdded(session.id, message, 'participant_left');
    }
    return res.json({
      success: true,
      participant: getSessionParticipantRecord(db, session, participant.user_id, {
        includeLeft: true,
        currentUserId: req.user.id,
      }),
      message,
      snapshot: buildSessionSnapshot(db, session.id, req.user.id),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/leave', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    if (isHourOfPowerSession(session)) {
      return res.status(400).json({ error: 'Hour of Power is strictly solo and cannot be left as a co-host' });
    }
    if (session.status !== 'live') return res.status(400).json({ error: 'Live session has ended' });
    if (String(req.user.id || '') === String(session.host_user_id || '')) {
      return res.status(400).json({ error: 'The room owner must end the live session instead of leaving it' });
    }

    const participant = getSessionParticipantRecord(db, session, req.user.id, {
      includeLeft: true,
      currentUserId: req.user.id,
    });
    if (!participant || participant.role !== LIVE_PARTICIPANT_ROLE_COHOST) {
      return res.status(403).json({ error: 'You are not an active co-host in this room' });
    }
    if (participant.status === LIVE_PARTICIPANT_STATUS_LEFT) {
      return res.status(400).json({ error: 'You have already left this session' });
    }

    const syncUpdate = await performLiveSessionSyncForActor(db, session, {
      id: participant.user_id,
      username: participant.username || '',
      avatar: participant.avatar || '',
      skill_title: participant.skill_title || '',
      nationality: participant.nationality || '',
      role: participant.role,
      status: participant.status,
    });
    setLiveSessionParticipantState(db, session, participant, {
      role: LIVE_PARTICIPANT_ROLE_COHOST,
      status: LIVE_PARTICIPANT_STATUS_LEFT,
      addedByUserId: req.user.id,
      joinedAt: participant.joined_at || '',
      leftAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      recent_anchor_id: 0,
      last_recent_row_id: ensureParticipantSyncCursor(db, session, participant.user_id)?.last_recent_row_id || 0,
      last_sync_at: '',
      last_sync_status: 'left',
      currentUserId: req.user.id,
    });
    const requestUpdate = skipTargetedRequestsForDepartedParticipant(db, session, participant.user_id, req.user.id);
    const messageId = addSystemMessage(
      db,
      session.id,
      `${participant.username || 'A co-host'} left the room.`,
      'participant_leave',
      {
        participant_user_id: participant.user_id,
        participant_username: participant.username || '',
      }
    );
    broadcastLiveSyncUpdates(db, session, syncUpdate, 'participant_left');
    broadcastLiveRequestsUpdated(session.id, requestUpdate.requests, 'participant_left');
    for (const messageIdToBroadcast of requestUpdate.message_ids) {
      const requestMessage = getNormalizedLiveMessage(db, messageIdToBroadcast);
      if (requestMessage) broadcastLiveMessageAdded(session.id, requestMessage, 'participant_left');
    }
    const message = getNormalizedLiveMessage(db, messageId);
    if (message) {
      broadcastLiveMessageAdded(session.id, message, 'participant_left');
    }
    return res.json({
      success: true,
      participant: getSessionParticipantRecord(db, session, participant.user_id, {
        includeLeft: true,
        currentUserId: req.user.id,
      }),
      message,
      snapshot: buildSessionSnapshot(db, session.id, req.user.id),
    });
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

router.delete('/sessions/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    requireSessionHost(session, req.user.id);

    if (String(session.status || '').trim() === 'live') {
      return res.status(409).json({ error: 'End the live session before deleting it' });
    }

    db.prepare(`
      UPDATE live_sessions
      SET deleted_at = datetime('now'),
          is_hidden_from_profile = 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(session.id);
    clearLiveSessionRuntimeState(db, session.id);

    return res.json({
      success: true,
      session_id: session.id,
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
    if (session.status !== 'live') {
      clearPresenceBroadcastState(session.id);
      return res.json({
        viewer_count: 0,
        viewer_peak: Math.max(0, toInt(session.viewer_peak)),
        ended: true,
      });
    }
    const sessionId = normalizeText(req.body?.session_id, 80);
    if (!sessionId) return res.status(400).json({ error: 'session_id is required' });

    db.prepare(`
      INSERT INTO live_session_presence (live_session_id, session_id, user_id, last_seen)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(live_session_id, session_id) DO UPDATE SET
        user_id = excluded.user_id,
        last_seen = datetime('now')
    `).run(session.id, sessionId, req.user.id);

    const viewerCount = getViewerCount(db, session, { cleanup: true });
    const viewerPeak = updateViewerPeak(db, session.id, viewerCount);
    if (shouldBroadcastPresence(session.id, viewerCount, viewerPeak)) {
      broadcastLivePresence(session.id, { viewer_count: viewerCount, viewer_peak: viewerPeak });
    }
    res.json({ viewer_count: viewerCount, viewer_peak: viewerPeak });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/sessions/:id/messages', requireAuth, (req, res) => {
  try {
    const db = getDb();
    requireLiveSession(db, req.params.id);
    res.json({ messages: getSessionMessages(db, req.params.id, req.user.id) });
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

    const normalizedMessage = getNormalizedLiveMessage(db, id, req.user.id);
    broadcastLiveMessageAdded(session.id, normalizedMessage, 'message');
    res.status(201).json({ message: normalizedMessage });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/messages/:messageId/pump', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    const messageId = normalizeText(req.params.messageId, 80);
    if (!messageId) return res.status(400).json({ error: 'Message ID is required' });

    const togglePump = db.transaction(() => {
      const messageRow = db.prepare(`
        SELECT id, live_session_id, message_type
        FROM live_session_messages
        WHERE id = ?
          AND live_session_id = ?
        LIMIT 1
      `).get(messageId, session.id);
      if (!messageRow) {
        const err = new Error('Message not found');
        err.statusCode = 404;
        throw err;
      }
      if (!isPumpableLiveMessageType(messageRow.message_type)) {
        const err = new Error('This message cannot be pumped');
        err.statusCode = 400;
        throw err;
      }

      const existing = db.prepare(`
        SELECT 1
        FROM live_message_pumps
        WHERE message_id = ?
          AND user_id = ?
        LIMIT 1
      `).get(messageRow.id, req.user.id);

      let pumped = false;
      if (existing) {
        db.prepare(`
          DELETE FROM live_message_pumps
          WHERE message_id = ?
            AND user_id = ?
        `).run(messageRow.id, req.user.id);
      } else {
        db.prepare(`
          INSERT INTO live_message_pumps (message_id, user_id)
          VALUES (?, ?)
        `).run(messageRow.id, req.user.id);
        pumped = true;
      }

      const pumpCount = toInt(db.prepare(`
        SELECT COUNT(*) AS count
        FROM live_message_pumps
        WHERE message_id = ?
      `).get(messageRow.id)?.count);

      return {
        message_id: messageRow.id,
        pumped,
        pump_count: pumpCount,
      };
    });

    const result = togglePump();
    const message = getNormalizedLiveMessage(db, result.message_id, req.user.id);
    broadcastLiveMessageUpdated(db, session.id, result.message_id, result.pumped ? 'message_pumped' : 'message_unpumped');
    res.json({
      success: true,
      pumped: result.pumped,
      pump_count: result.pump_count,
      message,
    });
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
    if (isHourOfPowerSession(session)) {
      return res.status(400).json({ error: 'Hour of Power does not accept song requests' });
    }
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
        SELECT id, title, mode, level, jacket_url
        FROM songs
        WHERE id = ?
      `).get(chartId);
    } else {
      const songTitle = normalizeText(req.body?.song_title, 160);
      const mode = normalizeText(req.body?.mode, 20);
      const level = toInt(req.body?.level);
      chart = db.prepare(`
        SELECT id, title, mode, level, jacket_url
        FROM songs
        WHERE title = ?
          AND mode = ?
          AND level = ?
        LIMIT 1
      `).get(songTitle, mode, level);
    }
    if (!chart) return res.status(404).json({ error: 'Chart not found' });
    if (!isHost && !requestPolicyAllowsChart(session, chart)) {
      return res.status(403).json({ error: `The host is currently taking ${buildRequestPolicyDescription(session)}.` });
    }

    const targetUserId = normalizeText(req.body?.target_user_id, 80);
    let targetParticipant = null;
    if (targetUserId) {
      targetParticipant = getSessionParticipantRecord(db, session, targetUserId, { includeLeft: false });
      if (!targetParticipant) {
        return res.status(404).json({ error: 'Target co-host not found' });
      }
    }

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
        id, live_session_id, user_id, username, chart_id, chart_key, song_title, mode, level, target_user_id, target_username,
        status, fulfilled, handled_at, handled_by_user_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, '', '', datetime('now'), datetime('now'))
    `).run(
      requestId,
      session.id,
      req.user.id,
      user?.username || req.user.username || 'User',
      toInt(chart.id),
      chartKey,
      chart.title,
      chart.mode,
      toInt(chart.level),
      targetParticipant?.user_id || '',
      targetParticipant?.username || ''
    );

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
      `/request ${chart.title} (${chart.mode === 'Single' ? 'S' : chart.mode === 'Double' ? 'D' : chart.mode}${toInt(chart.level)})${targetParticipant?.username ? ` for ${targetParticipant.username}` : ''}`,
      JSON.stringify({
        request_id: requestId,
        chart_id: toInt(chart.id),
        song_title: chart.title,
        mode: chart.mode,
        level: toInt(chart.level),
        jacket_url: chart.jacket_url || '',
        target_user_id: targetParticipant?.user_id || '',
        target_username: targetParticipant?.username || '',
      })
    );

    const requests = getSessionRequests(db, session.id);
    const request = requests.find((row) => row.id === requestId) || null;
    const messageRow = getNormalizedLiveMessage(db, messageId);

    res.status(201).json({
      request,
      requests,
      message: messageRow,
    });
    broadcastLiveRequestsUpdated(session.id, requests, 'request_created');
    broadcastLiveMessageAdded(session.id, messageRow, 'request_created');
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

    const updateResult = updateLiveRequestStatus(db, requestRow, 'played', {
      actorUserId: req.user.id,
      emitMessage: normalizeRequestStatus(requestRow.status, toInt(requestRow.fulfilled) === 1) !== 'played',
    });

    const requests = getSessionRequests(db, session.id);
    const request = requests.find((row) => row.id === requestRow.id) || null;
    const message = updateResult?.announcement_message_id
      ? getNormalizedLiveMessage(db, updateResult.announcement_message_id)
      : null;
    broadcastLiveRequestsUpdated(session.id, requests, 'request_fulfilled');
    if (message) {
      broadcastLiveMessageAdded(session.id, message, 'request_fulfilled');
    }
    res.json({
      request,
      requests,
      message,
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

    const updateResult = updateLiveRequestStatus(db, requestRow, nextStatus, {
      actorUserId: req.user.id,
      emitMessage: normalizeRequestStatus(requestRow.status, toInt(requestRow.fulfilled) === 1) !== nextStatus,
    });

    const requests = getSessionRequests(db, session.id);
    const request = requests.find((row) => row.id === requestRow.id) || null;
    const message = updateResult?.announcement_message_id
      ? getNormalizedLiveMessage(db, updateResult.announcement_message_id)
      : null;
    broadcastLiveRequestsUpdated(session.id, requests, `request_${nextStatus}`);
    if (message) {
      broadcastLiveMessageAdded(session.id, message, `request_${nextStatus}`);
    }
    res.json({
      request,
      requests,
      message,
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
    let announcementMessage = null;
    if (announcement) {
      const announcementMessageId = addSystemMessage(
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
      announcementMessage = getNormalizedLiveMessage(db, announcementMessageId);
    }

    broadcastLiveModerationUpdated(db, session, targetUserId, moderation, 'moderation');
    if (announcementMessage) {
      broadcastLiveMessageAdded(session.id, announcementMessage, 'moderation');
    }
    res.json({
      target_user_id: targetUserId,
      moderation,
      viewer_state: getSessionViewerState(db, session, req.user.id),
      message: announcementMessage,
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

    broadcastLiveMessageRemoved(session.id, message.id, 'message_deleted');
    res.json({
      success: true,
      message_id: message.id,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/votes', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const session = requireLiveSession(db, req.params.id);
    if (isHourOfPowerSession(session)) {
      return res.status(400).json({ error: 'Hour of Power does not support song votes' });
    }
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
    const vote = getVoteSnapshot(db, voteId, req.user.id);
    const message = getNormalizedLiveMessage(db, pinnedMessageId);
    broadcastLiveVoteUpdated(db, session.id, 'vote_created');
    broadcastLiveMessageAdded(session.id, message, 'vote_created');

    res.status(201).json({ vote, message });
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
    broadcastLiveVoteUpdated(db, vote.live_session_id, 'vote_updated');

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

    await performLiveSessionSync(db, session, { broadcast: false, reason: 'end' });

    const latestVote = getLatestVoteSnapshot(db, session.id, req.user.id);
    if (latestVote && latestVote.status === 'active') {
      closeVote(db, latestVote.id, { currentUserId: req.user.id, emitMessage: false, broadcast: false });
    }

    const host = getHostProfile(db, session.host_user_id);
    const participants = getSessionParticipants(db, session, { currentUserId: req.user.id, includeLeft: true });
    const participantByUserId = new Map(participants.map((participant) => [participant.user_id, participant]));
    const plays = getSessionPlays(db, session.id);
    const displayState = buildSessionDisplayState(db, session, plays);
    const viewerCount = getViewerCount(db, session, { cleanup: true });
    const viewerPeak = updateViewerPeak(db, session.id, viewerCount);
    const messageCount = getSessionMessageCount(db, session.id);
    const interactionCounts = getSessionInteractionCounts(db, session.id);
    const summary = buildLiveSessionSummary(plays, host || {}, {
      sessionId: session.id,
      sessionTitle: session.title,
      participantRole: LIVE_PARTICIPANT_ROLE_OWNER,
      viewerCount,
      viewerPeak,
      messageCount,
      requestPlayCount: interactionCounts.requestPlayCount,
      votedSongPlayCount: interactionCounts.votedSongPlayCount,
      interactions: interactionCounts.interactions,
      streamUrl: session.stream_url,
      hostUsername: host?.username || '',
    });
    const hopSummary = displayState.hop;
    const hopCompleted = isHourOfPowerSession(session)
      ? Date.now() >= resolveHourOfPowerConfig(session).endsAtMs
      : false;
    const endedAtValue = formatSqliteDateTime(new Date());
    const finalizedSession = {
      ...session,
      status: 'ended',
      ended_at: endedAtValue,
      updated_at: endedAtValue,
      viewer_peak: Math.max(viewerPeak, toInt(session.viewer_peak)),
      hop_completed: hopCompleted ? 1 : 0,
      hop_total_rating_points: toInt(hopSummary?.total_rating_points),
      hop_counted_clear_count: toInt(hopSummary?.counted_clear_count),
      hop_average_level: Number(hopSummary?.average_level || 0),
      hop_average_rating_points: Number(hopSummary?.average_rating_points || 0),
      hop_highest_rating_points: toInt(hopSummary?.highest_rating_points),
      hop_lowest_rating_points: toInt(hopSummary?.lowest_rating_points),
    };

    let bufferedUpscores = parseBufferedRows(db, session.id, 'live_session_buffered_upscores');
    let bufferedClears = parseBufferedRows(db, session.id, 'live_session_buffered_clears');
    const replayOutcomeRows = [
      ...bufferedUpscores,
      ...bufferedClears.filter((row) => String(row?.entry_type || 'song_clear') !== 'title_unlock'),
    ];
    let replayLookup = new Map();

    if (replayOutcomeRows.length > 0) {
      try {
        const replayVideoId = getLiveSessionYoutubeVideoId(session);
        if (replayVideoId) {
          const replayVideo = await getYoutubeVideoById(db, req.user.id, replayVideoId, {
            enforceChannelOwnership: false,
          });
          if (replayVideo && isReplayEligibleYoutubeVideo(replayVideo)) {
            const replayPlays = getSessionPlaysWithDurations(db, session.id);
            if (replayPlays.length > 0) {
              replayLookup = buildSessionReplayLookup(session, replayPlays, replayVideo, replayVideoId);
            }
          }
        }
      } catch (err) {
        console.warn(`Live session replay links skipped for ${session.id}: ${err.message}`);
      }

      bufferedUpscores = attachReplayMetadataToRows(bufferedUpscores, replayLookup);
      bufferedClears = attachReplayMetadataToRows(bufferedClears, replayLookup);
    }

    const playGroups = new Map();
    for (const play of plays) {
      const performerUserId = String(play?.user_id || '').trim();
      if (!performerUserId) continue;
      if (!playGroups.has(performerUserId)) playGroups.set(performerUserId, []);
      playGroups.get(performerUserId).push(play);
    }
    const upscoreGroups = groupRowsByPerformer(bufferedUpscores);
    const clearGroups = groupRowsByPerformer(bufferedClears);
    const performerIds = new Set([
      ...playGroups.keys(),
      ...upscoreGroups.keys(),
      ...clearGroups.keys(),
    ]);

    const sharedContext = {
      viewerCount,
      viewerPeak,
      messageCount,
      requestPlayCount: interactionCounts.requestPlayCount,
      votedSongPlayCount: interactionCounts.votedSongPlayCount,
      interactions: interactionCounts.interactions,
    };
    const participantResults = [];

    const txn = db.transaction(() => {
      syncRecentPlayReplayRows(db, session.id, replayLookup);
      for (const performerUserId of performerIds) {
        const participant = participantByUserId.get(performerUserId);
        if (!participant) continue;
        const result = createParticipantLiveSessionArtifacts(
          db,
          finalizedSession,
          participant,
          playGroups.get(performerUserId) || [],
          upscoreGroups.get(performerUserId) || [],
          clearGroups.get(performerUserId) || [],
          replayLookup,
          sharedContext
        );
        participantResults.push(result);
      }

      db.prepare(`
        UPDATE live_sessions
        SET status = 'ended',
            ended_at = ?,
            viewer_peak = CASE WHEN viewer_peak < ? THEN ? ELSE viewer_peak END,
            hop_total_rating_points = ?,
            hop_counted_clear_count = ?,
            hop_average_level = ?,
            hop_average_rating_points = ?,
            hop_highest_rating_points = ?,
            hop_lowest_rating_points = ?,
            hop_completed = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        endedAtValue,
        viewerPeak,
        viewerPeak,
        toInt(hopSummary?.total_rating_points),
        toInt(hopSummary?.counted_clear_count),
        Number(hopSummary?.average_level || 0),
        Number(hopSummary?.average_rating_points || 0),
        toInt(hopSummary?.highest_rating_points),
        toInt(hopSummary?.lowest_rating_points),
        hopCompleted ? 1 : 0,
        session.id
      );

      db.prepare('DELETE FROM live_session_presence WHERE live_session_id = ?').run(session.id);
    });
    txn();
    clearLiveSessionRuntimeState(db, session.id);

    const anyPostCreated = participantResults.some((result) => result.upscore_post_id || result.clear_post_id || result.summary_post_id);
    if (typeof invalidateRecentActivityCache === 'function' && anyPostCreated) {
      invalidateRecentActivityCache();
    }

    for (const result of participantResults) {
      const actorUsername = result.actorUsername || 'Someone';
      const profileLink = buildProfilePath(actorUsername) || `/profile/${result.user_id}`;

      if (result.upscore_rows.length > 0) {
        notifyActivitySubscribers(db, {
          actorUserId: result.user_id,
          actorUsername,
          activityType: 'upscores',
          notificationType: 'followed_user_upscore',
          title: 'New Upscores',
          message: `${actorUsername} posted ${result.upscore_rows.length} new upscore${result.upscore_rows.length === 1 ? '' : 's'}`,
          link: result.upscore_post_id ? `/upscore/${result.upscore_post_id}` : profileLink,
        });
      }

      if (result.clear_count > 0) {
        notifyActivitySubscribers(db, {
          actorUserId: result.user_id,
          actorUsername,
          activityType: 'new_clears',
          notificationType: 'followed_user_new_clear',
          title: 'New Clears',
          message: `${actorUsername} posted ${result.clear_count} new clear${result.clear_count === 1 ? '' : 's'}`,
          link: result.clear_post_id ? `/clear/${result.clear_post_id}` : profileLink,
        });
      }

      if (result.title_count > 0) {
        notifyActivitySubscribers(db, {
          actorUserId: result.user_id,
          actorUsername,
          activityType: 'new_clears',
          notificationType: 'followed_user_new_title',
          title: 'Title Earned',
          message: `${actorUsername} earned ${result.title_count} new title${result.title_count === 1 ? '' : 's'}`,
          link: result.clear_post_id ? `/clear/${result.clear_post_id}` : profileLink,
        });
      }

      if (result.summary_post_id) {
        notifyActivitySubscribers(db, {
          actorUserId: result.user_id,
          actorUsername,
          activityType: 'posts',
          notificationType: 'followed_user_post',
          title: isHourOfPowerSession(session) ? 'Hour of Power Recap' : 'Shinsa Live Recap',
          message: isHourOfPowerSession(session)
            ? `${actorUsername} wrapped up Hour of Power`
            : `${actorUsername} wrapped up a live session`,
          link: `/post/${result.summary_post_id}`,
        });
      }
    }

    session = requireLiveSession(db, req.params.id);
    broadcastLiveSessionSnapshot(db, session.id, 'session_ended');
    const hostResult = participantResults.find((result) => String(result.user_id || '') === String(session.host_user_id || '')) || null;
    res.json({
      success: true,
      upscore_post_id: hostResult?.upscore_post_id || null,
      clear_post_id: hostResult?.clear_post_id || null,
      summary_post_id: hostResult?.summary_post_id || null,
      summary,
      hop: hopSummary,
      participant_posts: participantResults,
      session: normalizeSessionPayload(
        session,
        host,
        0,
        req.user.id,
        getSessionParticipants(db, session, { currentUserId: req.user.id, includeLeft: true })
      ),
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
      AND COALESCE(deleted_at, '') = ''
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

router.backfillLiveSessionReplayData = backfillLiveSessionReplayData;

module.exports = router;

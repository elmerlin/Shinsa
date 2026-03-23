const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const YOUTUBE_CLIENT_ID = String(process.env.YOUTUBE_CLIENT_ID || '').trim();
const YOUTUBE_CLIENT_SECRET = String(process.env.YOUTUBE_CLIENT_SECRET || '').trim();
const APP_URL = String(process.env.APP_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');
const YOUTUBE_REDIRECT_URI = String(process.env.YOUTUBE_REDIRECT_URI || `${APP_URL}/api/youtube/oauth/callback`).trim();
const YOUTUBE_STATE_SECRET = process.env.YOUTUBE_OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'shinsa-youtube-oauth-state-secret';
const YOUTUBE_ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.YOUTUBE_ENCRYPT_KEY || process.env.PIU_ENCRYPT_KEY || 'shinsa-youtube-credential-key')
  .digest();
const YOUTUBE_FORCE_SSL_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
const YOUTUBE_OAUTH_SCOPES = String(process.env.YOUTUBE_OAUTH_SCOPES || YOUTUBE_FORCE_SSL_SCOPE)
  .split(/[,\s]+/)
  .map((value) => value.trim())
  .filter(Boolean);
const YOUTUBE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
const YOUTUBE_BROADCASTS_URL = 'https://www.googleapis.com/youtube/v3/liveBroadcasts';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

function isYoutubeConfigured() {
  return !!(YOUTUBE_CLIENT_ID && YOUTUBE_CLIENT_SECRET && APP_URL && YOUTUBE_REDIRECT_URI);
}

function encryptToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', YOUTUBE_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptToken(encrypted, iv, authTag) {
  if (!encrypted || !iv || !authTag) return '';
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    YOUTUBE_ENCRYPTION_KEY,
    Buffer.from(String(iv), 'base64')
  );
  decipher.setAuthTag(Buffer.from(String(authTag), 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(String(encrypted), 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function normalizeNextPath(value, fallback = '/account?tab=youtube') {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

function buildYoutubeCallbackRedirect(nextPath, status, message = '') {
  const url = new URL(normalizeNextPath(nextPath), `${APP_URL}/`);
  if (status) url.searchParams.set('youtube', status);
  if (message) url.searchParams.set('youtube_message', message);
  return url.toString();
}

function signYoutubeState(userId, nextPath) {
  return jwt.sign(
    {
      user_id: String(userId || '').trim(),
      next_path: normalizeNextPath(nextPath),
    },
    YOUTUBE_STATE_SECRET,
    { expiresIn: '15m' }
  );
}

function verifyYoutubeState(state) {
  const decoded = jwt.verify(String(state || ''), YOUTUBE_STATE_SECRET);
  return {
    userId: String(decoded?.user_id || '').trim(),
    nextPath: normalizeNextPath(decoded?.next_path),
  };
}

function createYoutubeAuthUrl(userId, nextPath) {
  if (!isYoutubeConfigured()) {
    throw new Error('YouTube OAuth is not configured on this server');
  }

  const params = new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID,
    redirect_uri: YOUTUBE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    scope: YOUTUBE_OAUTH_SCOPES.join(' '),
    state: signYoutubeState(userId, nextPath),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function formatTokenExpiry(expiresInSeconds = 0) {
  const seconds = Math.max(0, parseInt(expiresInSeconds, 10) || 0);
  if (seconds <= 0) return '';
  return new Date(Date.now() + (seconds * 1000)).toISOString().slice(0, 19).replace('T', ' ');
}

function getStoredYoutubeConnection(db, userId) {
  return db.prepare(`
    SELECT *
    FROM user_youtube_connections
    WHERE user_id = ?
    LIMIT 1
  `).get(userId);
}

async function exchangeYoutubeCode(code) {
  const payload = new URLSearchParams({
    code: String(code || '').trim(),
    client_id: YOUTUBE_CLIENT_ID,
    client_secret: YOUTUBE_CLIENT_SECRET,
    redirect_uri: YOUTUBE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const response = await axios.post(YOUTUBE_TOKEN_URL, payload.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return response?.data || {};
}

async function refreshYoutubeAccessToken(refreshToken) {
  const payload = new URLSearchParams({
    refresh_token: String(refreshToken || '').trim(),
    client_id: YOUTUBE_CLIENT_ID,
    client_secret: YOUTUBE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const response = await axios.post(YOUTUBE_TOKEN_URL, payload.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return response?.data || {};
}

function getConnectionAccessToken(row) {
  if (!row) return '';
  try {
    return decryptToken(row.encrypted_access_token, row.access_token_iv, row.access_token_auth_tag);
  } catch {
    return '';
  }
}

function getConnectionRefreshToken(row) {
  if (!row) return '';
  try {
    return decryptToken(row.encrypted_refresh_token, row.refresh_token_iv, row.refresh_token_auth_tag);
  } catch {
    return '';
  }
}

function connectionNeedsRefresh(row) {
  const expiresAtRaw = String(row?.token_expires_at || '').trim();
  if (!expiresAtRaw) return true;
  const expiresAtMs = Date.parse(`${expiresAtRaw.replace(' ', 'T')}Z`);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= (Date.now() + 60 * 1000);
}

function storeYoutubeConnection(db, userId, tokens = {}, channel = {}) {
  const existing = getStoredYoutubeConnection(db, userId);
  const accessToken = String(tokens.access_token || '').trim();
  const refreshToken = String(tokens.refresh_token || '').trim() || getConnectionRefreshToken(existing);
  if (!refreshToken) {
    throw new Error('Google did not return a refresh token. Reconnect and approve again.');
  }

  const encryptedAccess = encryptToken(accessToken);
  const encryptedRefresh = encryptToken(refreshToken);
  const tokenScope = String(tokens.scope || existing?.token_scope || YOUTUBE_OAUTH_SCOPES.join(' ')).trim();
  const tokenType = String(tokens.token_type || existing?.token_type || 'Bearer').trim();
  const tokenExpiresAt = formatTokenExpiry(tokens.expires_in) || String(existing?.token_expires_at || '').trim();
  const channelId = String(channel.id || existing?.channel_id || '').trim();
  const channelTitle = String(channel.title || existing?.channel_title || '').trim();
  const channelThumbnailUrl = String(channel.thumbnail_url || existing?.channel_thumbnail_url || '').trim();

  db.prepare(`
    INSERT INTO user_youtube_connections (
      user_id,
      channel_id,
      channel_title,
      channel_thumbnail_url,
      encrypted_access_token,
      access_token_iv,
      access_token_auth_tag,
      encrypted_refresh_token,
      refresh_token_iv,
      refresh_token_auth_tag,
      token_scope,
      token_type,
      token_expires_at,
      connected_at,
      updated_at,
      last_used_at,
      last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'), '')
    ON CONFLICT(user_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      channel_title = excluded.channel_title,
      channel_thumbnail_url = excluded.channel_thumbnail_url,
      encrypted_access_token = excluded.encrypted_access_token,
      access_token_iv = excluded.access_token_iv,
      access_token_auth_tag = excluded.access_token_auth_tag,
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      refresh_token_iv = excluded.refresh_token_iv,
      refresh_token_auth_tag = excluded.refresh_token_auth_tag,
      token_scope = excluded.token_scope,
      token_type = excluded.token_type,
      token_expires_at = excluded.token_expires_at,
      updated_at = datetime('now'),
      last_used_at = datetime('now'),
      last_error = ''
  `).run(
    userId,
    channelId,
    channelTitle,
    channelThumbnailUrl,
    encryptedAccess.encrypted,
    encryptedAccess.iv,
    encryptedAccess.authTag,
    encryptedRefresh.encrypted,
    encryptedRefresh.iv,
    encryptedRefresh.authTag,
    tokenScope,
    tokenType,
    tokenExpiresAt
  );

  return getStoredYoutubeConnection(db, userId);
}

function markYoutubeConnectionError(db, userId, message) {
  db.prepare(`
    UPDATE user_youtube_connections
    SET last_error = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(String(message || '').slice(0, 500), userId);
}

async function youtubeApiGet(accessToken, url, params = {}) {
  const response = await axios.get(url, {
    params,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    timeout: 15000,
  });
  return response?.data || {};
}

async function youtubeApiPut(accessToken, url, data = {}, params = {}) {
  const response = await axios.put(url, data, {
    params,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return response?.data || {};
}

async function fetchYoutubeChannel(accessToken) {
  const payload = await youtubeApiGet(accessToken, YOUTUBE_CHANNELS_URL, {
    part: 'snippet',
    mine: 'true',
    maxResults: 1,
  });
  const row = Array.isArray(payload?.items) ? payload.items[0] : null;
  if (!row) {
    throw new Error('No YouTube channel was found for this Google account');
  }
  return {
    id: String(row?.id || '').trim(),
    title: String(row?.snippet?.title || '').trim(),
    thumbnail_url: String(
      row?.snippet?.thumbnails?.default?.url
      || row?.snippet?.thumbnails?.medium?.url
      || row?.snippet?.thumbnails?.high?.url
      || ''
    ).trim(),
  };
}

async function getAuthorizedYoutubeConnection(db, userId) {
  if (!isYoutubeConfigured()) {
    throw new Error('YouTube OAuth is not configured on this server');
  }

  const row = getStoredYoutubeConnection(db, userId);
  if (!row) {
    const err = new Error('No YouTube account is linked for this user');
    err.statusCode = 404;
    throw err;
  }

  let accessToken = getConnectionAccessToken(row);
  let activeRow = row;

  if (!accessToken || connectionNeedsRefresh(row)) {
    const refreshToken = getConnectionRefreshToken(row);
    if (!refreshToken) {
      throw new Error('The linked YouTube account needs to be reconnected');
    }
    try {
      const refreshed = await refreshYoutubeAccessToken(refreshToken);
      const encryptedAccess = encryptToken(refreshed.access_token || '');
      const nextExpiresAt = formatTokenExpiry(refreshed.expires_in);
      db.prepare(`
        UPDATE user_youtube_connections
        SET encrypted_access_token = ?,
            access_token_iv = ?,
            access_token_auth_tag = ?,
            token_expires_at = ?,
            token_type = ?,
            token_scope = ?,
            updated_at = datetime('now'),
            last_used_at = datetime('now'),
            last_error = ''
        WHERE user_id = ?
      `).run(
        encryptedAccess.encrypted,
        encryptedAccess.iv,
        encryptedAccess.authTag,
        nextExpiresAt,
        String(refreshed.token_type || row.token_type || 'Bearer'),
        String(refreshed.scope || row.token_scope || YOUTUBE_OAUTH_SCOPES.join(' ')),
        userId
      );
      activeRow = getStoredYoutubeConnection(db, userId);
      accessToken = getConnectionAccessToken(activeRow);
    } catch (err) {
      markYoutubeConnectionError(db, userId, getYoutubeErrorMessage(err));
      throw new Error('Failed to refresh YouTube access. Reconnect your account.');
    }
  } else {
    db.prepare(`
      UPDATE user_youtube_connections
      SET last_used_at = datetime('now'), last_error = ''
      WHERE user_id = ?
    `).run(userId);
    activeRow = getStoredYoutubeConnection(db, userId);
  }

  return {
    row: activeRow,
    accessToken,
  };
}

function getYoutubeErrorMessage(err) {
  const apiMessage = err?.response?.data?.error?.message;
  if (apiMessage) return String(apiMessage);
  return String(err?.message || 'YouTube request failed');
}

function buildBroadcastPayload(item) {
  if (!item?.id) return null;
  const lifeCycleStatus = String(item?.status?.lifeCycleStatus || '').trim();
  const actualStartTime = String(item?.snippet?.actualStartTime || '').trim();
  const scheduledStartTime = String(item?.snippet?.scheduledStartTime || '').trim();
  const title = String(item?.snippet?.title || '').trim();
  return {
    id: String(item.id).trim(),
    video_id: String(item.id).trim(),
    channel_id: String(item?.snippet?.channelId || '').trim(),
    title,
    description: String(item?.snippet?.description || '').trim(),
    life_cycle_status: lifeCycleStatus,
    privacy_status: String(item?.status?.privacyStatus || '').trim(),
    actual_start_time: actualStartTime,
    scheduled_start_time: scheduledStartTime,
    actual_end_time: String(item?.snippet?.actualEndTime || '').trim(),
    is_live_now: lifeCycleStatus === 'live' || lifeCycleStatus === 'liveStarting',
    stream_url: `https://www.youtube.com/watch?v=${encodeURIComponent(String(item.id).trim())}`,
  };
}

function sortBroadcasts(a, b) {
  const rank = (row) => {
    if (row.is_live_now) return 0;
    if (row.life_cycle_status === 'ready' || row.life_cycle_status === 'created') return 1;
    return 2;
  };
  const rankDiff = rank(a) - rank(b);
  if (rankDiff !== 0) return rankDiff;
  const aStart = Date.parse(a.actual_start_time || a.scheduled_start_time || '') || Number.MAX_SAFE_INTEGER;
  const bStart = Date.parse(b.actual_start_time || b.scheduled_start_time || '') || Number.MAX_SAFE_INTEGER;
  if (aStart !== bStart) return aStart - bStart;
  return String(a.title || '').localeCompare(String(b.title || ''));
}

async function listYoutubeBroadcasts(db, userId) {
  const { accessToken, row } = await getAuthorizedYoutubeConnection(db, userId);
  const payload = await youtubeApiGet(accessToken, YOUTUBE_BROADCASTS_URL, {
    part: 'id,snippet,status',
    mine: 'true',
    broadcastType: 'all',
    maxResults: 50,
  });
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const broadcasts = items
    .map(buildBroadcastPayload)
    .filter(Boolean)
    .filter((item) => item.life_cycle_status !== 'complete' && item.life_cycle_status !== 'revoked')
    .sort(sortBroadcasts);
  return {
    connection: row,
    broadcasts,
  };
}

async function getYoutubeBroadcastById(db, userId, broadcastId) {
  const normalizedId = String(broadcastId || '').trim();
  if (!normalizedId) return null;
  const { accessToken, row } = await getAuthorizedYoutubeConnection(db, userId);
  const payload = await youtubeApiGet(accessToken, YOUTUBE_BROADCASTS_URL, {
    part: 'id,snippet,status',
    id: normalizedId,
  });
  const item = Array.isArray(payload?.items) ? payload.items[0] : null;
  const broadcast = buildBroadcastPayload(item);
  if (!broadcast) return null;
  if (row?.channel_id && broadcast.channel_id && String(row.channel_id) !== String(broadcast.channel_id)) {
    const err = new Error('That YouTube stream does not belong to the linked channel');
    err.statusCode = 403;
    throw err;
  }
  return broadcast;
}

async function getYoutubeVideoById(db, userId, videoId, options = {}) {
  const normalizedId = String(videoId || '').trim();
  if (!normalizedId) return null;
  const enforceChannelOwnership = options?.enforceChannelOwnership !== false;
  const { accessToken, row } = await getAuthorizedYoutubeConnection(db, userId);
  const payload = await youtubeApiGet(accessToken, YOUTUBE_VIDEOS_URL, {
    part: 'snippet,status,liveStreamingDetails',
    id: normalizedId,
  });
  const item = Array.isArray(payload?.items) ? payload.items[0] : null;
  if (!item?.id) return null;
  const channelId = String(item?.snippet?.channelId || '').trim();
  if (enforceChannelOwnership && row?.channel_id && channelId && String(row.channel_id) !== channelId) {
    const err = new Error('That YouTube video does not belong to the linked channel');
    err.statusCode = 403;
    throw err;
  }
  return {
    id: String(item.id).trim(),
    channel_id: channelId,
    title: String(item?.snippet?.title || '').trim(),
    description: String(item?.snippet?.description || ''),
    category_id: String(item?.snippet?.categoryId || '').trim(),
    tags: Array.isArray(item?.snippet?.tags) ? item.snippet.tags : [],
    default_language: String(item?.snippet?.defaultLanguage || '').trim(),
    default_audio_language: String(item?.snippet?.defaultAudioLanguage || '').trim(),
    privacy_status: String(item?.status?.privacyStatus || '').trim(),
    embeddable: item?.status?.embeddable !== false,
    actual_start_time: String(item?.liveStreamingDetails?.actualStartTime || '').trim(),
    actual_end_time: String(item?.liveStreamingDetails?.actualEndTime || '').trim(),
    scheduled_start_time: String(item?.liveStreamingDetails?.scheduledStartTime || '').trim(),
    scheduled_end_time: String(item?.liveStreamingDetails?.scheduledEndTime || '').trim(),
  };
}

async function updateYoutubeVideoDescription(db, userId, videoId, description) {
  const normalizedId = String(videoId || '').trim();
  if (!normalizedId) {
    const err = new Error('A YouTube video is required');
    err.statusCode = 400;
    throw err;
  }
  const { accessToken } = await getAuthorizedYoutubeConnection(db, userId);
  const currentVideo = await getYoutubeVideoById(db, userId, normalizedId);
  if (!currentVideo) {
    const err = new Error('Unable to load that YouTube video');
    err.statusCode = 404;
    throw err;
  }

  const snippet = {
    title: currentVideo.title,
    description: String(description || ''),
    categoryId: currentVideo.category_id || '20',
  };
  if (Array.isArray(currentVideo.tags) && currentVideo.tags.length > 0) {
    snippet.tags = currentVideo.tags;
  }
  if (currentVideo.default_language) {
    snippet.defaultLanguage = currentVideo.default_language;
  }
  if (currentVideo.default_audio_language) {
    snippet.defaultAudioLanguage = currentVideo.default_audio_language;
  }

  await youtubeApiPut(accessToken, YOUTUBE_VIDEOS_URL, {
    id: normalizedId,
    snippet,
  }, {
    part: 'snippet',
  });

  return getYoutubeVideoById(db, userId, normalizedId);
}

function buildYoutubeConnectionStatus(row) {
  if (!row) {
    return {
      configured: isYoutubeConfigured(),
      linked: false,
      channel_id: '',
      channel_title: '',
      channel_thumbnail_url: '',
      updated_at: null,
      last_error: '',
    };
  }
  return {
    configured: isYoutubeConfigured(),
    linked: true,
    channel_id: String(row.channel_id || '').trim(),
    channel_title: String(row.channel_title || '').trim(),
    channel_thumbnail_url: String(row.channel_thumbnail_url || '').trim(),
    updated_at: row.updated_at || null,
    token_expires_at: row.token_expires_at || null,
    last_error: String(row.last_error || '').trim(),
  };
}

function extractYoutubeVideoId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] || '';
}

module.exports = {
  APP_URL,
  YOUTUBE_FORCE_SSL_SCOPE,
  YOUTUBE_OAUTH_SCOPES,
  YOUTUBE_REDIRECT_URI,
  buildYoutubeCallbackRedirect,
  buildYoutubeConnectionStatus,
  createYoutubeAuthUrl,
  exchangeYoutubeCode,
  extractYoutubeVideoId,
  fetchYoutubeChannel,
  getStoredYoutubeConnection,
  getYoutubeBroadcastById,
  getYoutubeVideoById,
  getYoutubeErrorMessage,
  isYoutubeConfigured,
  listYoutubeBroadcasts,
  storeYoutubeConnection,
  updateYoutubeVideoDescription,
  verifyYoutubeState,
};

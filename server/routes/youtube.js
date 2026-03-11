const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const {
  APP_URL,
  buildYoutubeCallbackRedirect,
  buildYoutubeConnectionStatus,
  createYoutubeAuthUrl,
  exchangeYoutubeCode,
  fetchYoutubeChannel,
  getStoredYoutubeConnection,
  getYoutubeErrorMessage,
  isYoutubeConfigured,
  listYoutubeBroadcasts,
  storeYoutubeConnection,
  verifyYoutubeState,
} = require('../lib/youtube');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  const db = getDb();
  const row = getStoredYoutubeConnection(db, req.user.id);
  res.json(buildYoutubeConnectionStatus(row));
});

router.post('/connect/start', requireAuth, (req, res) => {
  try {
    if (!isYoutubeConfigured()) {
      return res.status(503).json({ error: 'YouTube OAuth is not configured on this server' });
    }
    const nextPath = String(req.body?.next_path || '/account?tab=youtube').trim();
    const authUrl = createYoutubeAuthUrl(req.user.id, nextPath);
    return res.json({ auth_url: authUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to start YouTube connection' });
  }
});

router.get('/oauth/callback', async (req, res) => {
  const code = String(req.query?.code || '').trim();
  const state = String(req.query?.state || '').trim();
  const oauthError = String(req.query?.error || '').trim();
  let nextPath = '/account?tab=youtube';

  try {
    if (!isYoutubeConfigured()) {
      return res.redirect(buildYoutubeCallbackRedirect(nextPath, 'error', 'YouTube OAuth is not configured'));
    }
    if (oauthError) {
      return res.redirect(buildYoutubeCallbackRedirect(nextPath, 'error', oauthError.replace(/_/g, ' ')));
    }
    if (!code || !state) {
      return res.redirect(buildYoutubeCallbackRedirect(nextPath, 'error', 'Missing Google OAuth code or state'));
    }

    const verified = verifyYoutubeState(state);
    nextPath = verified.nextPath || nextPath;
    if (!verified.userId) {
      return res.redirect(buildYoutubeCallbackRedirect(nextPath, 'error', 'Invalid YouTube OAuth state'));
    }

    const db = getDb();
    const tokens = await exchangeYoutubeCode(code);
    if (!tokens?.access_token) {
      return res.redirect(buildYoutubeCallbackRedirect(nextPath, 'error', 'Google did not return an access token'));
    }

    const channel = await fetchYoutubeChannel(tokens.access_token);
    storeYoutubeConnection(db, verified.userId, tokens, channel);
    return res.redirect(buildYoutubeCallbackRedirect(nextPath, 'connected', channel.title || 'YouTube connected'));
  } catch (err) {
    const fallback = buildYoutubeCallbackRedirect(nextPath, 'error', getYoutubeErrorMessage(err));
    return res.redirect(fallback);
  }
});

router.get('/broadcasts', requireAuth, async (req, res) => {
  const db = getDb();
  const connection = getStoredYoutubeConnection(db, req.user.id);
  if (!connection) {
    return res.json({
      ...buildYoutubeConnectionStatus(null),
      broadcasts: [],
    });
  }

  try {
    const payload = await listYoutubeBroadcasts(db, req.user.id);
    return res.json({
      ...buildYoutubeConnectionStatus(payload.connection),
      broadcasts: payload.broadcasts,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: getYoutubeErrorMessage(err) });
  }
});

router.delete('/connection', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM user_youtube_connections WHERE user_id = ?').run(req.user.id);
  res.json({ success: true, app_url: APP_URL });
});

module.exports = router;

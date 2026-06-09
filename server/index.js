const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDb, getDb } = require('./db/schema');
const { registerSharePreviewRoutes } = require('./sharePreviews');
const { enrichTournamentSummaries } = require('./lib/tournamentSummary');

const tournamentRoutes = require('./routes/tournaments');
const playerRoutes = require('./routes/players');
const matchRoutes = require('./routes/matches');
const phaseRoutes = require('./routes/phases');
const songRoutes = require('./routes/songs');
const noticeRoutes = require('./routes/notices');
const duelRoutes = require('./routes/duels');
const authRoutes = require('./routes/auth');
const onlineDuelRoutes = require('./routes/onlineDuels');
const parserRoutes = require('./routes/parser');
const piugameRoutes = require('./routes/piugame');
const liveRoutes = require('./routes/live');
const socialRoutes = require('./routes/social');
const communityRoutes = require('./routes/communities');
const messageRoutes = require('./routes/messages');
const worldMaxRoutes = require('./routes/worldMax');
const chatbotRoutes = require('./routes/chatbot');
const funRoutes = require('./routes/fun');
const changelogRoutes = require('./routes/changelog');
const checkinRoutes = require('./routes/checkins');
const venueAccessRoutes = require('./routes/venueAccess');
const healthRoutes = require('./routes/health');
const youtubeRoutes = require('./routes/youtube');
const i18nRoutes = require('./routes/i18n');
const weeklyChallengeRoutes = require('./routes/weeklyChallenges');
const petRoutes = require('./routes/pets');
const petWorldRoutes = require('./routes/petWorld');
const petBomberRoutes = require('./routes/petBomber');
const piumonRoutes = require('./routes/piumon');
const externalRoutes = require('./routes/external');
const petBomberWs = require('./lib/petBomber/ws');
const petWorldWs = require('./lib/petWorld/ws');

const app = express();
const PORT = process.env.PORT || 3001;
const KOREAN_LOCALE_ENABLED = String(process.env.ENABLE_KR_LOCALE || '').trim().toLowerCase() === 'true';

// Initialize database
initializeDb();

// Respect proxy headers (needed for correct absolute URLs in social previews).
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    if (req.originalUrl === '/api/venue-access/webhook') {
      req.rawBody = buf.toString('utf8');
    }
  },
}));

// Combined dashboard endpoint — single request instead of 3
// The dashboard is a LIST endpoint, but tournament rows can carry multi-MB
// base64 blobs meant only for detail/poster pages: `gif_avatar`, `poster_bg`,
// and base64 avatars embedded inside `placement_snapshots` entries (one
// observed at 5.4 MB — a single tournament's snapshots totalled ~20 MB,
// blowing the response to 24 MB / 17 s and tripping the client's 8 s timeout).
// List cards only need the rank+name placings preview and scalar fields, so
// drop the base64 payloads here. Small URL avatars/posters are left intact.
// Runs AFTER enrichment so it also catches base64 avatars in the
// participant_preview that enrichTournamentSummaries adds.
function isDataUri(v) {
  return typeof v === 'string' && v.startsWith('data:');
}
function slimTournamentForList(t) {
  const out = { ...t };
  // Drop ANY base64 data-URI blob on the row (avatar, gif_avatar, poster_bg,
  // and any future column) — these are detail/editor-only and each can be
  // hundreds of KB to multiple MB. Small URL/path values are untouched.
  for (const k of Object.keys(out)) {
    if (isDataUri(out[k])) out[k] = '';
  }
  if (Array.isArray(out.participant_preview)) {
    out.participant_preview = out.participant_preview.map((p) =>
      p && isDataUri(p.avatar) ? { ...p, avatar: '' } : p
    );
  }
  if (out.placement_snapshots) {
    try {
      const parsed = typeof out.placement_snapshots === 'string'
        ? JSON.parse(out.placement_snapshots)
        : out.placement_snapshots;
      if (parsed && typeof parsed === 'object') {
        for (const bucket of Object.values(parsed)) {
          if (!Array.isArray(bucket)) continue;
          for (const entry of bucket) {
            if (entry && isDataUri(entry.avatar)) entry.avatar = '';
          }
        }
        out.placement_snapshots = JSON.stringify(parsed);
      }
    } catch { /* unparseable — leave as-is */ }
  }
  return out;
}

app.get('/api/dashboard', (req, res) => {
  const db = getDb();
  let tournaments = [], duels = [], notices = [];
  try {
    const rows = db.prepare('SELECT * FROM tournaments WHERE archived = 0 ORDER BY created_at DESC LIMIT 50').all();
    tournaments = enrichTournamentSummaries(db, rows).map(slimTournamentForList);
  } catch (e) {
    console.error('Dashboard tournaments:', e.message);
  }
  try { duels = db.prepare('SELECT * FROM duels ORDER BY created_at DESC LIMIT 50').all(); } catch (e) { console.error('Dashboard duels:', e.message); }
  try { notices = db.prepare('SELECT * FROM notices ORDER BY pinned DESC, created_at DESC LIMIT 50').all(); } catch (e) { console.error('Dashboard notices:', e.message); }
  res.json({ tournaments, duels, notices });
});

// API Routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/phases', phaseRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/duels', duelRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/online-duels', onlineDuelRoutes);
app.use('/api/parser', parserRoutes);
app.use('/api/piugame', piugameRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/world-max', worldMaxRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/fun', funRoutes);
app.use('/api/changelog', changelogRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/venue-access', venueAccessRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/i18n', i18nRoutes);
app.use('/api/weekly-challenges', weeklyChallengeRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/pet-world', petWorldRoutes);
app.use('/api/pet-bomber', petBomberRoutes);
app.use('/api/piumon', piumonRoutes);
app.use('/api/external', externalRoutes);

if (typeof piugameRoutes.startOverRankingNightlyScheduler === 'function') {
  try {
    const status = piugameRoutes.startOverRankingNightlyScheduler();
    if (status?.enabled) {
      console.log(
        `[OverRanking] Nightly scheduler active at ${String(status.hour).padStart(2, '0')}:${String(status.minute).padStart(2, '0')} (server time). Next run: ${status.next_run_at || 'n/a'}`
      );
    } else {
      console.log('[OverRanking] Nightly scheduler disabled by OVER_RANKING_NIGHTLY_ENABLED.');
    }
  } catch (err) {
    console.error('[OverRanking] Failed to start nightly scheduler:', err?.message || err);
  }
}

if (typeof piugameRoutes.startPumbilityRankingNightlyScheduler === 'function') {
  try {
    const status = piugameRoutes.startPumbilityRankingNightlyScheduler();
    if (status?.enabled) {
      console.log(
        `[PumbilityRanking] Nightly scheduler active at ${String(status.hour).padStart(2, '0')}:${String(status.minute).padStart(2, '0')} (server time). Next run: ${status.next_run_at || 'n/a'}`
      );
    } else {
      console.log('[PumbilityRanking] Nightly scheduler disabled by PUMBILITY_RANKING_NIGHTLY_ENABLED.');
    }
  } catch (err) {
    console.error('[PumbilityRanking] Failed to start nightly scheduler:', err?.message || err);
  }
}

if (typeof socialRoutes.startDailyMixTapeNightlyScheduler === 'function') {
  try {
    const status = socialRoutes.startDailyMixTapeNightlyScheduler();
    if (status?.enabled) {
      console.log(
        `[DailyMixTape] Nightly scheduler active at ${String(status.hour).padStart(2, '0')}:${String(status.minute).padStart(2, '0')} UTC. Next run: ${status.next_run_at || 'n/a'}`
      );
    } else {
      console.log('[DailyMixTape] Nightly scheduler disabled by DAILY_MIX_TAPE_NIGHTLY_ENABLED.');
    }
  } catch (err) {
    console.error('[DailyMixTape] Failed to start nightly scheduler:', err?.message || err);
  }
}

// Return 404 for unmatched API routes (prevents hanging requests)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/piumon-assets', express.static(path.join(__dirname, '..', 'data', 'piumon')));

// Serve newly-backfilled jackets directly from client/public/ so they're
// available without re-running the Vite build. client/dist/ also has a
// copy (vite copies public/ at build time), but the songs-catalog
// backfill writes into public/, and without this passthrough every new
// chart's jacket 404s through to the SPA index.html fallback for hours
// (or whenever the next deploy happens) — which Express's static
// middleware silently responds 200 + HTML for, breaking <img> loads.
const publicAssets = path.join(__dirname, '..', 'client', 'public');
app.use('/jackets', express.static(path.join(publicAssets, 'jackets')));
app.use('/avatars', express.static(path.join(publicAssets, 'avatars')));

if (!KOREAN_LOCALE_ENABLED) {
  const redirectHiddenKoreanLocale = (req, res) => {
    const nextPath = req.path === '/kr' ? '/' : req.path.slice(3);
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(302, `${nextPath}${query}`);
  };

  app.get(/^\/kr(?:\/.*)?$/, redirectHiddenKoreanLocale);
  app.head(/^\/kr(?:\/.*)?$/, redirectHiddenKoreanLocale);
}

// Serve chart editor at /charting/
const chartEditorBuild = path.join(__dirname, '..', 'chart-editor', 'dist');
app.use('/charting', express.static(chartEditorBuild));
app.get('/charting/*', (req, res) => {
  res.sendFile(path.join(chartEditorBuild, 'index.html'));
});

// Serve static files in production
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
// Mobile-web (Expo) build path, used by sharePreviews.js to inject OG
// meta into the right SPA shell when a /post/:id-style link is shared
// from new.pumpshinsa.com. Override via NEW_SHINSA_WEB_DIR for staging
// environments; defaults to the nginx-served path on production.
const mobileWebBuild = process.env.NEW_SHINSA_WEB_DIR || '/var/www/new-shinsa-web';
registerSharePreviewRoutes(app, {
  clientBuildDir: clientBuild,
  mobileWebBuildDir: mobileWebBuild,
});
app.use(express.static(clientBuild));
app.use((req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Image too large. Maximum file size is 10MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: 'Too many images. Maximum is 9 images per post.' });
    }
    return res.status(413).json({ error: 'Upload payload is too large.' });
  }
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ error: 'Request payload is too large.' });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Pump Shinsa server running on port ${PORT}`);
});
// Allow long-running sync requests (5 minutes)
server.timeout = 300000;

// Attach Pet Bomber WebSocket server
petBomberWs.attachToServer(server);

// Attach Pet World co-presence WebSocket server
petWorldWs.attachToServer(server);

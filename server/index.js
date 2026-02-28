const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDb, getDb } = require('./db/schema');
const { registerSharePreviewRoutes } = require('./sharePreviews');

const tournamentRoutes = require('./routes/tournaments');
const playerRoutes = require('./routes/players');
const matchRoutes = require('./routes/matches');
const songRoutes = require('./routes/songs');
const noticeRoutes = require('./routes/notices');
const duelRoutes = require('./routes/duels');
const authRoutes = require('./routes/auth');
const onlineDuelRoutes = require('./routes/onlineDuels');
const parserRoutes = require('./routes/parser');
const piugameRoutes = require('./routes/piugame');
const socialRoutes = require('./routes/social');
const communityRoutes = require('./routes/communities');
const worldMaxRoutes = require('./routes/worldMax');
const chatbotRoutes = require('./routes/chatbot');
const funRoutes = require('./routes/fun');
const changelogRoutes = require('./routes/changelog');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDb();

// Respect proxy headers (needed for correct absolute URLs in social previews).
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Combined dashboard endpoint — single request instead of 3
app.get('/api/dashboard', (req, res) => {
  const db = getDb();
  let tournaments = [], duels = [], notices = [];
  try { tournaments = db.prepare('SELECT * FROM tournaments WHERE archived = 0 ORDER BY created_at DESC').all(); } catch (e) { console.error('Dashboard tournaments:', e.message); }
  try { duels = db.prepare('SELECT * FROM duels ORDER BY created_at DESC').all(); } catch (e) { console.error('Dashboard duels:', e.message); }
  try { notices = db.prepare('SELECT * FROM notices ORDER BY pinned DESC, created_at DESC').all(); } catch (e) { console.error('Dashboard notices:', e.message); }
  res.json({ tournaments, duels, notices });
});

// API Routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/duels', duelRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/online-duels', onlineDuelRoutes);
app.use('/api/parser', parserRoutes);
app.use('/api/piugame', piugameRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/world-max', worldMaxRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/fun', funRoutes);
app.use('/api/changelog', changelogRoutes);

// Return 404 for unmatched API routes (prevents hanging requests)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static files in production
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
registerSharePreviewRoutes(app, { clientBuildDir: clientBuild });
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

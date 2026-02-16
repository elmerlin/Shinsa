const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDb, getDb } = require('./db/schema');

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

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDb();

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

// Return 404 for unmatched API routes (prevents hanging requests)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static files in production
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuild));
app.use((req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Pump Dojo Shinsa server running on port ${PORT}`);
});
// Allow long-running sync requests (5 minutes)
server.timeout = 300000;

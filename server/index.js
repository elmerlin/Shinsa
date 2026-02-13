const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDb } = require('./db/schema');

const tournamentRoutes = require('./routes/tournaments');
const playerRoutes = require('./routes/players');
const matchRoutes = require('./routes/matches');
const songRoutes = require('./routes/songs');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDb();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API Routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/songs', songRoutes);

// Serve static files in production
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientBuild, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Pump Dojo Shinsa server running on port ${PORT}`);
});

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'shinsa.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initializeDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      date TEXT,
      phase TEXT DEFAULT 'SETUP',
      current_round INT DEFAULT 0,
      swiss_rounds INT DEFAULT 3,
      koth_top_n INT DEFAULT 8,
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      name TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      skill_title TEXT DEFAULT '',
      pumbility INT DEFAULT 0,
      wins INT DEFAULT 0,
      losses INT DEFAULT 0,
      draws INT DEFAULT 0,
      buchholz REAL DEFAULT 0,
      seed_rank INT DEFAULT 0,
      is_active INT DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      jacket_url TEXT DEFAULT '',
      mode TEXT NOT NULL,
      level INT NOT NULL,
      category TEXT DEFAULT '',
      bpm TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      round_number INT NOT NULL,
      player1_id TEXT,
      player2_id TEXT,
      winner_id TEXT,
      stage_phase TEXT NOT NULL,
      difficulty_min INT,
      difficulty_max INT,
      koth_position INT,
      is_bye INT DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      drawn_songs TEXT DEFAULT '[]',
      vetoed_songs TEXT DEFAULT '[]',
      played_songs TEXT DEFAULT '[]',
      scores TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (player1_id) REFERENCES players(id),
      FOREIGN KEY (player2_id) REFERENCES players(id)
    );

    CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round_number);
    CREATE INDEX IF NOT EXISTS idx_songs_level ON songs(level);
    CREATE INDEX IF NOT EXISTS idx_songs_mode ON songs(mode);
  `);

  db.close();
}

module.exports = { getDb, initializeDb, DB_PATH };

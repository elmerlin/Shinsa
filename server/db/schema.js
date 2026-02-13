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
      total_rounds INT DEFAULT 3,
      config TEXT DEFAULT '{}',
      avatar TEXT DEFAULT '',
      archived INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      name TEXT NOT NULL,
      skill_title TEXT DEFAULT '',
      skill_level INT DEFAULT 1,
      pumbility INT DEFAULT 0,
      description TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      wins INT DEFAULT 0,
      losses INT DEFAULT 0,
      points INT DEFAULT 0,
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
      bpm TEXT DEFAULT '',
      song_key TEXT DEFAULT '',
      flags TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      round_number INT NOT NULL,
      player1_id TEXT,
      player2_id TEXT,
      winner_id TEXT,
      difficulty_min INT,
      difficulty_max INT,
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

    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      pinned INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round_number);
    CREATE INDEX IF NOT EXISTS idx_songs_level ON songs(level);
    CREATE INDEX IF NOT EXISTS idx_songs_mode ON songs(mode);
  `);

  // Migrations for existing databases
  const tournamentColumns = db.prepare("PRAGMA table_info(tournaments)").all().map(c => c.name);
  if (!tournamentColumns.includes('avatar')) {
    db.exec("ALTER TABLE tournaments ADD COLUMN avatar TEXT DEFAULT ''");
  }
  if (!tournamentColumns.includes('archived')) {
    db.exec("ALTER TABLE tournaments ADD COLUMN archived INT DEFAULT 0");
  }

  const columns = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!columns.includes('description')) {
    db.exec("ALTER TABLE players ADD COLUMN description TEXT DEFAULT ''");
  }
  if (!columns.includes('avatar')) {
    db.exec("ALTER TABLE players ADD COLUMN avatar TEXT DEFAULT ''");
  }
  if (!columns.includes('gender')) {
    db.exec("ALTER TABLE players ADD COLUMN gender TEXT DEFAULT ''");
  }
  if (!columns.includes('nationality')) {
    db.exec("ALTER TABLE players ADD COLUMN nationality TEXT DEFAULT ''");
  }

  // Migrations for songs table
  const songColumns = db.prepare("PRAGMA table_info(songs)").all().map(c => c.name);
  if (!songColumns.includes('flags')) {
    db.exec("ALTER TABLE songs ADD COLUMN flags TEXT DEFAULT ''");
  }

  // Migrations for matches table
  const matchColumns = db.prepare("PRAGMA table_info(matches)").all().map(c => c.name);
  if (!matchColumns.includes('match_type')) {
    db.exec("ALTER TABLE matches ADD COLUMN match_type TEXT DEFAULT 'round_robin'");
  }
  if (!matchColumns.includes('gauntlet_order')) {
    db.exec("ALTER TABLE matches ADD COLUMN gauntlet_order INT DEFAULT 0");
  }

  db.close();
}

module.exports = { getDb, initializeDb, DB_PATH };

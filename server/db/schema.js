const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shinsa.db');

// Shared singleton connection — reused across all requests
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function getDb() {
  return db;
}

function initializeDb() {
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

    CREATE TABLE IF NOT EXISTS duels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      date TEXT DEFAULT '',
      time TEXT DEFAULT '',
      mode TEXT DEFAULT 'both',
      player1_name TEXT NOT NULL,
      player2_name TEXT NOT NULL,
      player1_avatar TEXT DEFAULT '',
      player2_avatar TEXT DEFAULT '',
      status TEXT DEFAULT 'ACTIVE',
      winner TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS duel_songs (
      id TEXT PRIMARY KEY,
      duel_id TEXT NOT NULL,
      song_id INTEGER,
      song_title TEXT DEFAULT '',
      song_artist TEXT DEFAULT '',
      song_mode TEXT DEFAULT '',
      song_level INT DEFAULT 0,
      song_jacket_url TEXT DEFAULT '',
      song_bpm TEXT DEFAULT '',
      player1_score INT DEFAULT 0,
      player2_score INT DEFAULT 0,
      winner TEXT DEFAULT '',
      played_order INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (duel_id) REFERENCES duels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      pumbility INT DEFAULT 0,
      skill_title TEXT DEFAULT '',
      skill_level INT DEFAULT 1,
      gender TEXT DEFAULT '',
      nationality TEXT DEFAULT '',
      date_of_birth TEXT DEFAULT '',
      show_age INT DEFAULT 0,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      tournament_id TEXT,
      duel_id TEXT,
      player_slot TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS online_duels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      date TEXT DEFAULT '',
      time TEXT DEFAULT '',
      mode TEXT DEFAULT 'both',
      creator_user_id TEXT NOT NULL,
      opponent_user_id TEXT DEFAULT '',
      status TEXT DEFAULT 'WAITING',
      current_turn TEXT DEFAULT 'player1',
      player1_end_requested INT DEFAULT 0,
      player2_end_requested INT DEFAULT 0,
      winner TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_user_id) REFERENCES users(id),
      FOREIGN KEY (opponent_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS online_duel_songs (
      id TEXT PRIMARY KEY,
      duel_id TEXT NOT NULL,
      song_id INTEGER,
      song_title TEXT DEFAULT '',
      song_artist TEXT DEFAULT '',
      song_mode TEXT DEFAULT '',
      song_level INT DEFAULT 0,
      song_jacket_url TEXT DEFAULT '',
      song_bpm TEXT DEFAULT '',
      chosen_by TEXT DEFAULT '',
      player1_accepted INT DEFAULT 0,
      player2_accepted INT DEFAULT 0,
      player1_score INT DEFAULT 0,
      player2_score INT DEFAULT 0,
      player1_perfect INT DEFAULT 0,
      player1_great INT DEFAULT 0,
      player1_good INT DEFAULT 0,
      player1_bad INT DEFAULT 0,
      player1_miss INT DEFAULT 0,
      player1_max_combo INT DEFAULT 0,
      player1_kcal REAL DEFAULT 0,
      player2_perfect INT DEFAULT 0,
      player2_great INT DEFAULT 0,
      player2_good INT DEFAULT 0,
      player2_bad INT DEFAULT 0,
      player2_miss INT DEFAULT 0,
      player2_max_combo INT DEFAULT 0,
      player2_kcal REAL DEFAULT 0,
      player1_submitted INT DEFAULT 0,
      player2_submitted INT DEFAULT 0,
      winner TEXT DEFAULT '',
      status TEXT DEFAULT 'drawn',
      played_order INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS duel_chat (
      id TEXT PRIMARY KEY,
      duel_id TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      is_system INT DEFAULT 0,
      is_participant INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS duel_pumps (
      duel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      player TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (duel_id, user_id),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round_number);
    CREATE INDEX IF NOT EXISTS idx_songs_level ON songs(level);
    CREATE INDEX IF NOT EXISTS idx_songs_mode ON songs(mode);
    CREATE INDEX IF NOT EXISTS idx_duel_songs_duel ON duel_songs(duel_id);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(user_id);
    CREATE INDEX IF NOT EXISTS idx_online_duel_songs ON online_duel_songs(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_chat ON duel_chat(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_pumps ON duel_pumps(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_pumps_user ON duel_pumps(duel_id, user_id);

    -- PIUGame integration tables
    CREATE TABLE IF NOT EXISTS user_piugame_credentials (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_username TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_pumbility_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      background_url TEXT DEFAULT '',
      date_played TEXT DEFAULT '',
      rank_order INTEGER DEFAULT 0,
      UNIQUE(user_id, song_title, mode, level)
    );

    CREATE TABLE IF NOT EXISTS user_best_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      plate TEXT DEFAULT '',
      UNIQUE(user_id, song_title, mode, level)
    );

    CREATE TABLE IF NOT EXISTS user_recently_played (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      background_url TEXT DEFAULT '',
      date_played TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_piugame_sync (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_best_scores_sync TEXT DEFAULT '',
      last_pumbility_sync TEXT DEFAULT '',
      last_recently_played_sync TEXT DEFAULT '',
      best_scores_imported INTEGER DEFAULT 0,
      pumbility_value INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      read INT DEFAULT 0,
      link TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS user_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      youtube_url TEXT DEFAULT '',
      comments_disabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS post_pumps (
      post_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES user_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES user_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES post_comments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_upscores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      upscores_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
    CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id);
    CREATE INDEX IF NOT EXISTS idx_posts_user ON user_posts(user_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON user_posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_post_pumps ON post_pumps(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_pumps_user ON post_pumps(post_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_post_comments ON post_comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_upscores_user ON user_upscores(user_id);
    CREATE INDEX IF NOT EXISTS idx_upscores_created ON user_upscores(created_at);

    CREATE INDEX IF NOT EXISTS idx_pumbility_scores_user ON user_pumbility_scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_best_scores_user ON user_best_scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_best_scores_user_mode ON user_best_scores(user_id, mode);
    CREATE INDEX IF NOT EXISTS idx_recently_played_user ON user_recently_played(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id);
  `);

  // Migrations for players table - add user_id
  const playerColumns = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!playerColumns.includes('user_id')) {
    db.exec("ALTER TABLE players ADD COLUMN user_id TEXT DEFAULT ''");
  }

  // Migrations for duels table - add user_id columns
  const duelColsCheck = db.prepare("PRAGMA table_info(duels)").all().map(c => c.name);
  if (!duelColsCheck.includes('player1_user_id')) {
    db.exec("ALTER TABLE duels ADD COLUMN player1_user_id TEXT DEFAULT ''");
  }
  if (!duelColsCheck.includes('player2_user_id')) {
    db.exec("ALTER TABLE duels ADD COLUMN player2_user_id TEXT DEFAULT ''");
  }

  // Migrations for duels table - add player detail fields
  const duelColumns = db.prepare("PRAGMA table_info(duels)").all().map(c => c.name);
  const duelMigrations = [
    ['player1_skill_title', "TEXT DEFAULT ''"],
    ['player1_skill_level', "INT DEFAULT 1"],
    ['player1_gender', "TEXT DEFAULT ''"],
    ['player1_nationality', "TEXT DEFAULT ''"],
    ['player1_description', "TEXT DEFAULT ''"],
    ['player2_skill_title', "TEXT DEFAULT ''"],
    ['player2_skill_level', "INT DEFAULT 1"],
    ['player2_gender', "TEXT DEFAULT ''"],
    ['player2_nationality', "TEXT DEFAULT ''"],
    ['player2_description', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of duelMigrations) {
    if (!duelColumns.includes(col)) {
      db.exec(`ALTER TABLE duels ADD COLUMN ${col} ${type}`);
    }
  }

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

  // Migrations for online_duel_songs - add decline columns
  const onlineDuelSongCols = db.prepare("PRAGMA table_info(online_duel_songs)").all().map(c => c.name);
  if (!onlineDuelSongCols.includes('player1_declined')) {
    db.exec("ALTER TABLE online_duel_songs ADD COLUMN player1_declined INT DEFAULT 0");
  }
  if (!onlineDuelSongCols.includes('player2_declined')) {
    db.exec("ALTER TABLE online_duel_songs ADD COLUMN player2_declined INT DEFAULT 0");
  }

  // Migrations for matches table
  const matchColumns = db.prepare("PRAGMA table_info(matches)").all().map(c => c.name);
  if (!matchColumns.includes('match_type')) {
    db.exec("ALTER TABLE matches ADD COLUMN match_type TEXT DEFAULT 'round_robin'");
  }
  if (!matchColumns.includes('gauntlet_order')) {
    db.exec("ALTER TABLE matches ADD COLUMN gauntlet_order INT DEFAULT 0");
  }

  // Migrations for recently played - add breakdown columns
  const recentCols = db.prepare("PRAGMA table_info(user_recently_played)").all().map(c => c.name);
  const recentMigrations = [
    ['perfect', 'INT DEFAULT 0'],
    ['great', 'INT DEFAULT 0'],
    ['good', 'INT DEFAULT 0'],
    ['bad', 'INT DEFAULT 0'],
    ['miss', 'INT DEFAULT 0'],
    ['max_combo', 'INT DEFAULT 0'],
    ['kcal', 'REAL DEFAULT 0'],
    ['plate', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of recentMigrations) {
    if (!recentCols.includes(col)) {
      db.exec(`ALTER TABLE user_recently_played ADD COLUMN ${col} ${type}`);
    }
  }

  // Migrations for best scores - add background_url
  const bestScoreCols = db.prepare("PRAGMA table_info(user_best_scores)").all().map(c => c.name);
  if (!bestScoreCols.includes('background_url')) {
    db.exec("ALTER TABLE user_best_scores ADD COLUMN background_url TEXT DEFAULT ''");
  }

  // Migrations for user_posts - add youtube_url and comments_disabled
  const postCols = db.prepare("PRAGMA table_info(user_posts)").all().map(c => c.name);
  if (!postCols.includes('youtube_url')) {
    db.exec("ALTER TABLE user_posts ADD COLUMN youtube_url TEXT DEFAULT ''");
  }
  if (!postCols.includes('comments_disabled')) {
    db.exec("ALTER TABLE user_posts ADD COLUMN comments_disabled INTEGER DEFAULT 0");
  }
  if (!postCols.includes('updated_at')) {
    db.exec("ALTER TABLE user_posts ADD COLUMN updated_at TEXT DEFAULT NULL");
  }

  // Migrations for piugame sync - add progress tracking
  const syncCols = db.prepare("PRAGMA table_info(user_piugame_sync)").all().map(c => c.name);
  const syncMigrations = [
    ['sync_in_progress', "TEXT DEFAULT ''"],
    ['sync_progress', 'INT DEFAULT 0'],
    ['sync_total', 'INT DEFAULT 0'],
  ];
  for (const [col, type] of syncMigrations) {
    if (!syncCols.includes(col)) {
      db.exec(`ALTER TABLE user_piugame_sync ADD COLUMN ${col} ${type}`);
    }
  }
}

// Prevent route handlers from closing the shared connection
db.close = () => {};

module.exports = { getDb, initializeDb, DB_PATH };

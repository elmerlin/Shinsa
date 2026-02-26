const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shinsa.db');

// Shared singleton connection — reused across all requests
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function getDb() {
  return db;
}

function normalizeShoeText(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLegacyShoeModel(makeValue, modelValue) {
  const make = normalizeShoeText(makeValue, 80);
  const modelTextRaw = normalizeShoeText(modelValue, 80);
  const modelText = make
    ? normalizeShoeText(
      modelTextRaw.replace(new RegExp(`^${escapeRegExp(make)}\\s+`, 'i'), ''),
      80
    )
    : modelTextRaw;
  if (!modelText) return { model: '', colorway: '' };

  const parenMatch = modelText.match(/^(.+?)\s*\(([^()]{2,})\)\s*$/);
  if (parenMatch) {
    return {
      model: normalizeShoeText(parenMatch[1], 80),
      colorway: normalizeShoeText(parenMatch[2], 80),
    };
  }

  for (const separator of [' - ', ' | ', ' / ', ' — ', ' – ']) {
    const idx = modelText.indexOf(separator);
    if (idx <= 0) continue;
    const left = normalizeShoeText(modelText.slice(0, idx), 80);
    const right = normalizeShoeText(modelText.slice(idx + separator.length), 80);
    if (left && right) return { model: left, colorway: right };
  }

  const knownByMake = [
    {
      makeRegex: /^nike$/i,
      models: ['Free RN 2018', 'Free Run 5.0'],
    },
  ];
  const makeNormalized = make.toLowerCase();
  for (const group of knownByMake) {
    if (!group.makeRegex.test(makeNormalized)) continue;
    for (const canonicalModel of group.models) {
      const re = new RegExp(`^${escapeRegExp(canonicalModel)}\\s+(.+)$`, 'i');
      const match = modelText.match(re);
      if (!match) continue;
      const colorway = normalizeShoeText(match[1], 80);
      if (colorway) {
        return { model: canonicalModel, colorway };
      }
    }
  }

  return { model: modelText, colorway: '' };
}

function chartModeLevelFromJson(chart) {
  if (!chart || typeof chart !== 'object') return null;
  const diffClass = String(chart.diffClass || '').trim().toUpperCase();
  const style = String(chart.style || '').trim().toLowerCase();

  if ((diffClass === 'S' || diffClass === 'D') && style === 'solo') {
    return {
      mode: diffClass === 'S' ? 'Single' : 'Double',
      level: parseInt(chart.lvl, 10) || 0,
    };
  }

  if (style === 'coop' && /^C[2-5]$/.test(diffClass)) {
    // PIU co-op charts encode player count in diff class (C2..C5).
    return {
      mode: 'CoOp',
      level: parseInt(diffClass.slice(1), 10) || 0,
    };
  }

  return null;
}

function ensureCoOpChartsFromJson() {
  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  if (!fs.existsSync(jsonPath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const songs = Array.isArray(data?.songs) ? data.songs : [];
    if (songs.length === 0) return;

    const existingRows = db.prepare(`
      SELECT title, artist, level, song_key
      FROM songs
      WHERE mode = 'CoOp'
    `).all();
    const existing = new Set(
      existingRows.map((row) => `${row.title}||${row.artist || ''}||${parseInt(row.level, 10) || 0}||${row.song_key || ''}`)
    );

    const insertSong = db.prepare(`
      INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key, flags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMissing = db.transaction((songList) => {
      let inserted = 0;
      for (const song of songList) {
        const jacketUrl = song.jacket ? `/jackets/${song.jacket}` : '';
        const flags = Array.isArray(song.flags) ? song.flags.join(',') : (song.flags || '');
        const songName = song.name || '';
        const artist = song.artist || '';
        const songKey = song.saIndex || '';

        for (const chart of (song.charts || [])) {
          const mapped = chartModeLevelFromJson(chart);
          if (!mapped || mapped.mode !== 'CoOp' || mapped.level <= 0) continue;

          const key = `${songName}||${artist}||${mapped.level}||${songKey}`;
          if (existing.has(key)) continue;

          insertSong.run(
            songName,
            artist,
            jacketUrl,
            'CoOp',
            mapped.level,
            song.bpm || '',
            songKey,
            flags
          );
          existing.add(key);
          inserted++;
        }
      }
      return inserted;
    });

    const inserted = insertMissing(songs);
    if (inserted > 0) {
      console.log(`Added ${inserted} missing CoOp charts from pump-phoenix.json`);
    }
  } catch (err) {
    console.error('Failed to backfill CoOp charts from pump-phoenix.json:', err.message);
  }
}

function bootstrapChartTiersFromSnapshotIfEmpty() {
  let tierCount = 0;
  try {
    tierCount = db.prepare("SELECT COUNT(*) as c FROM chart_tiers WHERE tier_list_type = 'Pass'").get().c || 0;
  } catch {
    return;
  }
  if (tierCount > 0) return;

  const snapshotPath = path.join(__dirname, '..', 'data', 'piuscores-tier-pass.json');
  if (!fs.existsSync(snapshotPath)) return;

  try {
    const payload = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    const levels = Array.isArray(payload?.levels) ? payload.levels : [];
    if (levels.length === 0) return;

    const rows = [];
    for (const levelRow of levels) {
      for (const row of (levelRow?.rows || [])) {
        rows.push({
          tier_list_type: 'Pass',
          mode: String(row.mode || ''),
          level: parseInt(row.level, 10) || 0,
          tier_name: String(row.tier_name || ''),
          tier_rank: parseInt(row.tier_rank, 10) || 0,
          chart_id: parseInt(row.chart_id, 10) || 0,
          source_slug: String(row.source_slug || ''),
          source_url: String(row.source_url || ''),
        });
      }
    }
    if (rows.length === 0) return;

    const existingCharts = new Map(
      db.prepare('SELECT id, mode, level FROM songs').all().map((row) => [parseInt(row.id, 10), row])
    );

    const clearStmt = db.prepare("DELETE FROM chart_tiers WHERE tier_list_type = 'Pass'");
    const insertStmt = db.prepare(`
      INSERT INTO chart_tiers (
        tier_list_type,
        mode,
        level,
        tier_name,
        tier_rank,
        chart_id,
        source_slug,
        source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tier_list_type, mode, level, chart_id)
      DO UPDATE SET
        tier_name = excluded.tier_name,
        tier_rank = excluded.tier_rank,
        source_slug = excluded.source_slug,
        source_url = excluded.source_url
    `);

    const bootstrap = db.transaction((tierRows) => {
      clearStmt.run();
      let inserted = 0;
      let skipped = 0;
      for (const row of tierRows) {
        const chart = existingCharts.get(row.chart_id);
        if (!chart) {
          skipped++;
          continue;
        }
        const chartMode = String(chart.mode || '');
        const chartLevel = parseInt(chart.level, 10) || 0;
        if (chartMode !== row.mode || chartLevel !== row.level) {
          skipped++;
          continue;
        }

        insertStmt.run(
          row.tier_list_type,
          row.mode,
          row.level,
          row.tier_name,
          row.tier_rank,
          row.chart_id,
          row.source_slug,
          row.source_url
        );
        inserted++;
      }
      return { inserted, skipped };
    });

    const result = bootstrap(rows);
    if (result.inserted > 0) {
      console.log(`Bootstrapped ${result.inserted} chart_tiers rows from snapshot (${result.skipped} skipped)`);
    }
  } catch (err) {
    console.error('Failed to bootstrap chart tiers from snapshot:', err.message);
  }
}

function bootstrapSongsFromJsonIfEmpty() {
  const songCount = db.prepare('SELECT COUNT(*) as c FROM songs').get();
  if (songCount.c > 0) return;

  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  if (!fs.existsSync(jsonPath)) {
    console.warn('Song bootstrap skipped: pump-phoenix.json not found');
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const songs = Array.isArray(data?.songs) ? data.songs : [];
    if (songs.length === 0) return;

    const insertSong = db.prepare(`
      INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key, flags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction((songList) => {
      let inserted = 0;
      for (const song of songList) {
        const jacketUrl = song.jacket ? `/jackets/${song.jacket}` : '';
        const flags = Array.isArray(song.flags) ? song.flags.join(',') : (song.flags || '');

        for (const chart of (song.charts || [])) {
          const mapped = chartModeLevelFromJson(chart);
          if (!mapped || mapped.level <= 0 || mapped.mode === 'CoOp') continue;
          insertSong.run(
            song.name || '',
            song.artist || '',
            jacketUrl,
            mapped.mode,
            mapped.level,
            song.bpm || '',
            song.saIndex || '',
            flags
          );
          inserted++;
        }
      }
      return inserted;
    });

    const inserted = insertAll(songs);
    if (inserted > 0) {
      console.log(`Bootstrapped ${inserted} charts from pump-phoenix.json`);
    }
  } catch (err) {
    console.error('Failed to bootstrap songs from pump-phoenix.json:', err.message);
  }
}

function backfillLegacyGroupedNewClears() {
  let clearCols = [];
  try {
    clearCols = db.prepare("PRAGMA table_info(user_new_clears)").all().map(c => c.name);
  } catch {
    return;
  }
  if (!clearCols.includes('clears_json')) return;

  const legacyRows = db.prepare(`
    SELECT nc.id, nc.user_id, nc.song_title, nc.mode, nc.level, nc.score, nc.grade, nc.plate, nc.background_url, nc.created_at,
           CAST(strftime('%s', datetime(nc.created_at)) AS INTEGER) as created_ts,
           (SELECT COUNT(*) FROM new_clear_pumps p WHERE p.clear_id = nc.id) as pump_count,
           (SELECT COUNT(*) FROM new_clear_comments c WHERE c.clear_id = nc.id) as comment_count
    FROM user_new_clears nc
    WHERE nc.clears_json IS NULL OR TRIM(nc.clears_json) = ''
    ORDER BY nc.user_id ASC, datetime(nc.created_at) ASC, nc.id ASC
  `).all();
  if (legacyRows.length === 0) return;

  const GROUP_WINDOW_SECONDS = 3;
  const groupUpdates = [];
  const deleteIds = [];

  const normalize = (row) => ({
    song_title: row.song_title || '',
    mode: row.mode || 'Single',
    level: parseInt(row.level) || 0,
    score: parseInt(row.score) || 0,
    grade: row.grade || '',
    plate: row.plate || '',
    background_url: row.background_url || '',
  });

  const finalizeGroup = (rows) => {
    if (rows.length < 2) return;
    const payload = rows.map(normalize);
    const first = payload[0];
    const survivor = rows[rows.length - 1];

    groupUpdates.push({
      id: survivor.id,
      song_title: first.song_title,
      mode: first.mode,
      level: first.level,
      score: first.score,
      grade: first.grade,
      plate: first.plate,
      background_url: first.background_url,
      clears_json: JSON.stringify(payload),
    });

    for (let i = 0; i < rows.length - 1; i++) {
      deleteIds.push(rows[i].id);
    }
  };

  let candidate = [];
  let prev = null;
  for (const row of legacyRows) {
    const hasEngagement = (row.pump_count || 0) > 0 || (row.comment_count || 0) > 0;
    if (hasEngagement) {
      finalizeGroup(candidate);
      candidate = [];
      prev = null;
      continue;
    }

    if (candidate.length === 0) {
      candidate = [row];
      prev = row;
      continue;
    }

    const sameUser = row.user_id === prev.user_id;
    const gap = (row.created_ts || 0) - (prev.created_ts || 0);
    const inWindow = sameUser && gap >= 0 && gap <= GROUP_WINDOW_SECONDS;

    if (inWindow) {
      candidate.push(row);
    } else {
      finalizeGroup(candidate);
      candidate = [row];
    }
    prev = row;
  }
  finalizeGroup(candidate);

  const applyBackfill = db.transaction(() => {
    const updateGrouped = db.prepare(`
      UPDATE user_new_clears
      SET song_title = ?, mode = ?, level = ?, score = ?, grade = ?, plate = ?, background_url = ?, clears_json = ?
      WHERE id = ?
    `);
    for (const g of groupUpdates) {
      updateGrouped.run(g.song_title, g.mode, g.level, g.score, g.grade, g.plate, g.background_url, g.clears_json, g.id);
    }

    if (deleteIds.length > 0) {
      const placeholders = deleteIds.map(() => '?').join(', ');
      db.prepare(`DELETE FROM user_new_clears WHERE id IN (${placeholders})`).run(...deleteIds);
    }

    const remainingLegacyRows = db.prepare(`
      SELECT id, song_title, mode, level, score, grade, plate, background_url
      FROM user_new_clears
      WHERE clears_json IS NULL OR TRIM(clears_json) = ''
      ORDER BY id ASC
    `).all();

    const fillSingle = db.prepare('UPDATE user_new_clears SET clears_json = ? WHERE id = ?');
    for (const row of remainingLegacyRows) {
      fillSingle.run(JSON.stringify([normalize(row)]), row.id);
    }

    return {
      grouped_posts: groupUpdates.length,
      merged_rows: deleteIds.length,
      singles_backfilled: remainingLegacyRows.length,
    };
  });

  const result = applyBackfill();
  if (result.grouped_posts > 0 || result.singles_backfilled > 0) {
    console.log(
      `Backfilled legacy clear posts: grouped ${result.grouped_posts} posts (merged ${result.merged_rows} rows), normalized ${result.singles_backfilled} single posts`
    );
  }
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

    CREATE TABLE IF NOT EXISTS chart_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier_list_type TEXT NOT NULL DEFAULT 'Pass',
      mode TEXT NOT NULL,
      level INT NOT NULL,
      tier_name TEXT NOT NULL,
      tier_rank INT NOT NULL DEFAULT 0,
      chart_id INTEGER NOT NULL,
      source_slug TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (chart_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chart_skills (
      chart_id INTEGER NOT NULL,
      skill_slug TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (chart_id, skill_slug),
      FOREIGN KEY (chart_id) REFERENCES songs(id) ON DELETE CASCADE
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
      creator_user_id TEXT DEFAULT '',
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
      is_admin INT DEFAULT 0,
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
      location_country TEXT DEFAULT '',
      location_country_code TEXT DEFAULT '',
      location_city TEXT DEFAULT '',
      location_lat REAL DEFAULT NULL,
      location_lng REAL DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_feature_permissions (
      user_id TEXT NOT NULL,
      feature_key TEXT NOT NULL,
      granted_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, feature_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_feature ON user_feature_permissions(feature_key, user_id);
    CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_user ON user_feature_permissions(user_id, feature_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chart_tiers_unique_chart
      ON chart_tiers(tier_list_type, mode, level, chart_id);
    CREATE INDEX IF NOT EXISTS idx_chart_tiers_mode_level_rank
      ON chart_tiers(tier_list_type, mode, level, tier_rank, chart_id);
    CREATE INDEX IF NOT EXISTS idx_chart_skills_chart
      ON chart_skills(chart_id);
    CREATE INDEX IF NOT EXISTS idx_chart_skills_skill
      ON chart_skills(skill_slug);
    CREATE INDEX IF NOT EXISTS idx_duel_songs_duel ON duel_songs(duel_id);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
    CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(user_id);
    CREATE INDEX IF NOT EXISTS idx_tournaments_created_at ON tournaments(created_at);
    CREATE INDEX IF NOT EXISTS idx_duels_created_at ON duels(created_at);
    CREATE INDEX IF NOT EXISTS idx_online_duels_created_at ON online_duels(created_at);
    CREATE INDEX IF NOT EXISTS idx_online_duel_songs ON online_duel_songs(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_chat ON duel_chat(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_pumps ON duel_pumps(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_pumps_user ON duel_pumps(duel_id, user_id);

    CREATE TABLE IF NOT EXISTS duel_spectators (
      duel_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      last_seen TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (duel_id, session_id),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_duel_spectators ON duel_spectators(duel_id);

    CREATE TABLE IF NOT EXISTS duel_predictions (
      duel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      predicted_winner TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (duel_id, user_id),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_duel_predictions ON duel_predictions(duel_id);

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
      shoe_id INTEGER REFERENCES user_shoes(id) ON DELETE SET NULL,
      UNIQUE(user_id, song_title, mode, level)
    );

    CREATE TABLE IF NOT EXISTS user_shoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      colorway TEXT NOT NULL DEFAULT '',
      image_data TEXT DEFAULT '',
      is_current INTEGER DEFAULT 0,
      retired_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shoe_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      colorway TEXT NOT NULL DEFAULT '',
      image_data TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shoe_model_display (
      make_key TEXT NOT NULL,
      model_key TEXT NOT NULL,
      catalog_id INTEGER NOT NULL REFERENCES shoe_catalog(id) ON DELETE CASCADE,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (make_key, model_key)
    );

    CREATE TABLE IF NOT EXISTS user_recently_played (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shoe_id INTEGER REFERENCES user_shoes(id) ON DELETE SET NULL,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      machine_name TEXT DEFAULT '',
      background_url TEXT DEFAULT '',
      date_played TEXT DEFAULT '',
      perfect INTEGER,
      great INTEGER,
      good INTEGER,
      bad INTEGER,
      miss INTEGER,
      max_combo INTEGER DEFAULT 0,
      kcal REAL DEFAULT 0,
      plate TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_piugame_sync (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_best_scores_sync TEXT DEFAULT '',
      last_pumbility_sync TEXT DEFAULT '',
      last_recently_played_sync TEXT DEFAULT '',
      best_scores_imported INTEGER DEFAULT 0,
      pumbility_value INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pumbility_leaderboard (
      rank INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      pumbility INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (rank)
    );

    CREATE TABLE IF NOT EXISTS pumbility_leaderboard_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      threshold INTEGER NOT NULL DEFAULT 0,
      total_entries INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT DEFAULT ''
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

    CREATE TABLE IF NOT EXISTS user_activity_notification_subscriptions (
      subscriber_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notify_posts INT DEFAULT 0,
      notify_upscores INT DEFAULT 0,
      notify_new_clears INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (subscriber_user_id, target_user_id)
    );

    CREATE TABLE IF NOT EXISTS user_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      expiration_time TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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

    CREATE TABLE IF NOT EXISTS post_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      youtube_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_post_drafts_user ON post_drafts(user_id);

    CREATE TABLE IF NOT EXISTS user_upscores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      upscores_json TEXT NOT NULL DEFAULT '[]',
      pumbility_gain INT DEFAULT 0,
      singles_pumbility_gain INT DEFAULT 0,
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
    CREATE INDEX IF NOT EXISTS idx_user_shoes_user ON user_shoes(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_shoes_make_model ON user_shoes(make, model);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_shoes_single_active ON user_shoes(user_id) WHERE is_current = 1;
    CREATE INDEX IF NOT EXISTS idx_shoe_catalog_make_model ON shoe_catalog(make, model);
    CREATE INDEX IF NOT EXISTS idx_shoe_model_display_catalog ON shoe_model_display(catalog_id);
    CREATE INDEX IF NOT EXISTS idx_recently_played_user ON user_recently_played(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_notif_subscriber ON user_activity_notification_subscriptions(subscriber_user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_notif_target ON user_activity_notification_subscriptions(target_user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON user_push_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON user_push_subscriptions(endpoint);

    CREATE TABLE IF NOT EXISTS user_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
      chart_id INTEGER NOT NULL,
      song_title TEXT NOT NULL,
      artist TEXT DEFAULT '',
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      jacket_url TEXT DEFAULT '',
      original_score INTEGER DEFAULT 0,
      original_grade TEXT DEFAULT '',
      had_pass INTEGER DEFAULT 0,
      target TEXT DEFAULT 'PASS',
      added_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_list_items_list ON user_list_items(list_id);
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
  if (!duelColsCheck.includes('creator_user_id')) {
    db.exec("ALTER TABLE duels ADD COLUMN creator_user_id TEXT DEFAULT ''");
  }
  db.exec(`
    UPDATE duels
    SET creator_user_id = player1_user_id
    WHERE COALESCE(creator_user_id, '') = ''
      AND COALESCE(player1_user_id, '') != ''
  `);

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
    ['shoe_id', 'INTEGER DEFAULT NULL'],
    ['perfect', 'INT DEFAULT 0'],
    ['great', 'INT DEFAULT 0'],
    ['good', 'INT DEFAULT 0'],
    ['bad', 'INT DEFAULT 0'],
    ['miss', 'INT DEFAULT 0'],
    ['max_combo', 'INT DEFAULT 0'],
    ['kcal', 'REAL DEFAULT 0'],
    ['plate', "TEXT DEFAULT ''"],
    ['machine_name', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of recentMigrations) {
    if (!recentCols.includes(col)) {
      db.exec(`ALTER TABLE user_recently_played ADD COLUMN ${col} ${type}`);
    }
  }

  // Keep recently played history across syncs while preventing duplicate rows on re-import.
  const recentIndexes = db.prepare("PRAGMA index_list(user_recently_played)").all().map(i => i.name);
  if (!recentIndexes.includes('idx_recently_played_unique_play')) {
    db.exec(`
      DELETE FROM user_recently_played
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM user_recently_played
        GROUP BY user_id, song_title, mode, level, score, grade, date_played
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recently_played_unique_play
        ON user_recently_played(user_id, song_title, mode, level, score, grade, date_played);
    `);
  }
  if (!recentIndexes.includes('idx_recently_played_shoe')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_recently_played_shoe ON user_recently_played(shoe_id)');
  }

  // Migrations for user_shoes - add colorway and lookup index
  const userShoeCols = db.prepare("PRAGMA table_info(user_shoes)").all().map(c => c.name);
  if (!userShoeCols.includes('colorway')) {
    db.exec("ALTER TABLE user_shoes ADD COLUMN colorway TEXT DEFAULT ''");
  }
  const userShoeIndexes = db.prepare("PRAGMA index_list(user_shoes)").all().map(i => i.name);
  if (!userShoeIndexes.includes('idx_user_shoes_make_model')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_user_shoes_make_model ON user_shoes(make, model)');
  }

  // Migrations for shoe catalog
  db.exec(`
    CREATE TABLE IF NOT EXISTS shoe_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      colorway TEXT NOT NULL DEFAULT '',
      image_data TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const shoeCatalogCols = db.prepare("PRAGMA table_info(shoe_catalog)").all().map(c => c.name);
  const shoeCatalogMigrations = [
    ['colorway', "TEXT DEFAULT ''"],
    ['image_data', "TEXT DEFAULT ''"],
    ['created_by', "TEXT DEFAULT NULL"],
    ['created_at', "TEXT DEFAULT ''"],
    ['updated_at', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of shoeCatalogMigrations) {
    if (!shoeCatalogCols.includes(col)) {
      db.exec(`ALTER TABLE shoe_catalog ADD COLUMN ${col} ${type}`);
    }
  }
  const shoeCatalogIndexes = db.prepare("PRAGMA index_list(shoe_catalog)").all().map(i => i.name);
  if (!shoeCatalogIndexes.includes('idx_shoe_catalog_make_model')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_shoe_catalog_make_model ON shoe_catalog(make, model)');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS shoe_model_display (
      make_key TEXT NOT NULL,
      model_key TEXT NOT NULL,
      catalog_id INTEGER NOT NULL REFERENCES shoe_catalog(id) ON DELETE CASCADE,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (make_key, model_key)
    );
    CREATE INDEX IF NOT EXISTS idx_shoe_model_display_catalog ON shoe_model_display(catalog_id);
  `);

  // Backfill legacy shoes where colorway was previously included inside model text.
  const legacyShoes = db.prepare(`
    SELECT id, make, model, colorway
    FROM user_shoes
    WHERE TRIM(COALESCE(model, '')) != ''
      AND TRIM(COALESCE(colorway, '')) = ''
  `).all();
  if (legacyShoes.length > 0) {
    const updateLegacyShoe = db.prepare(`
      UPDATE user_shoes
      SET model = ?, colorway = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const migrateLegacyShoes = db.transaction((rows) => {
      let updatedCount = 0;
      for (const row of rows) {
        const split = splitLegacyShoeModel(row.make, row.model);
        const nextModel = normalizeShoeText(split.model || row.model, 80);
        const nextColorway = normalizeShoeText(split.colorway || '', 120);
        if (!nextModel) continue;
        const sameModel = normalizeShoeText(row.model, 80) === nextModel;
        const sameColorway = normalizeShoeText(row.colorway, 80) === nextColorway;
        if (sameModel && sameColorway) continue;
        updateLegacyShoe.run(nextModel, nextColorway, row.id);
        updatedCount++;
      }
      return updatedCount;
    });
    const updatedCount = migrateLegacyShoes(legacyShoes);
    if (updatedCount > 0) {
      console.log(`Migrated ${updatedCount} legacy user_shoes rows to model+colorway format`);
    }
  }

  // Backfill legacy catalog rows where colorway was previously included inside model text.
  const legacyCatalogRows = db.prepare(`
    SELECT id, make, model, colorway
    FROM shoe_catalog
    WHERE TRIM(COALESCE(model, '')) != ''
      AND TRIM(COALESCE(colorway, '')) = ''
  `).all();
  if (legacyCatalogRows.length > 0) {
    const updateLegacyCatalogRow = db.prepare(`
      UPDATE shoe_catalog
      SET model = ?, colorway = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const migrateLegacyCatalogRows = db.transaction((rows) => {
      let updatedCount = 0;
      for (const row of rows) {
        const split = splitLegacyShoeModel(row.make, row.model);
        const nextModel = normalizeShoeText(split.model || row.model, 80);
        const nextColorway = normalizeShoeText(split.colorway || '', 120);
        if (!nextModel) continue;
        const sameModel = normalizeShoeText(row.model, 80) === nextModel;
        const sameColorway = normalizeShoeText(row.colorway, 80) === nextColorway;
        if (sameModel && sameColorway) continue;
        updateLegacyCatalogRow.run(nextModel, nextColorway, row.id);
        updatedCount++;
      }
      return updatedCount;
    });
    const updatedCount = migrateLegacyCatalogRows(legacyCatalogRows);
    if (updatedCount > 0) {
      console.log(`Migrated ${updatedCount} legacy shoe_catalog rows to model+colorway format`);
    }
  }

  // Migrations for best scores - add background_url
  const bestScoreCols = db.prepare("PRAGMA table_info(user_best_scores)").all().map(c => c.name);
  if (!bestScoreCols.includes('background_url')) {
    db.exec("ALTER TABLE user_best_scores ADD COLUMN background_url TEXT DEFAULT ''");
  }
  if (!bestScoreCols.includes('shoe_id')) {
    db.exec("ALTER TABLE user_best_scores ADD COLUMN shoe_id INTEGER DEFAULT NULL");
  }
  const bestScoreIndexes = db.prepare("PRAGMA index_list(user_best_scores)").all().map(i => i.name);
  if (!bestScoreIndexes.includes('idx_best_scores_shoe')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_best_scores_shoe ON user_best_scores(shoe_id)');
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

  // Migrations for upscore interactions (pumps + comments)
  db.exec(`
    CREATE TABLE IF NOT EXISTS upscore_pumps (
      upscore_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (upscore_id, user_id),
      FOREIGN KEY (upscore_id) REFERENCES user_upscores(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS upscore_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upscore_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (upscore_id) REFERENCES user_upscores(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES upscore_comments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_upscore_comments_upscore ON upscore_comments(upscore_id);
    CREATE INDEX IF NOT EXISTS idx_upscore_comments_parent ON upscore_comments(parent_id);
  `);

  // New clears tables (first-time song clears)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_new_clears (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      plate TEXT DEFAULT '',
      background_url TEXT DEFAULT '',
      clears_json TEXT DEFAULT '',
      pumbility_gain INT DEFAULT 0,
      singles_pumbility_gain INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS new_clear_pumps (
      clear_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (clear_id, user_id),
      FOREIGN KEY (clear_id) REFERENCES user_new_clears(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS new_clear_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clear_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (clear_id) REFERENCES user_new_clears(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES new_clear_comments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_new_clears_user ON user_new_clears(user_id);
    CREATE INDEX IF NOT EXISTS idx_new_clears_created ON user_new_clears(created_at);
    CREATE INDEX IF NOT EXISTS idx_new_clear_pumps ON new_clear_pumps(clear_id);
    CREATE INDEX IF NOT EXISTS idx_new_clear_comments ON new_clear_comments(clear_id);
  `);

  // Comment pumps table (pumps on any comment or reply)
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_pumps (
      comment_type TEXT NOT NULL,
      comment_id INTEGER NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (comment_type, comment_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_comment_pumps_comment ON comment_pumps(comment_type, comment_id);

    -- Communities
    CREATE TABLE IF NOT EXISTS communities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      index_tags TEXT DEFAULT '[]',
      about TEXT DEFAULT '',
      location_country TEXT DEFAULT '',
      rules TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      banner TEXT DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_invite_only INT DEFAULT 0,
      badge_text TEXT DEFAULT '',
      badge_color TEXT DEFAULT '#ff3366',
      badge_text_color TEXT DEFAULT '#ffffff',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_members (
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (community_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_role_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_tags (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#ff3366',
      text_color TEXT DEFAULT '#ffffff',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_member_tags (
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES community_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (community_id, user_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      youtube_url TEXT DEFAULT '',
      is_pinned INT DEFAULT 0,
      comments_disabled INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS community_post_pumps (
      post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_post_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id TEXT DEFAULT NULL REFERENCES community_post_comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_comment_pumps (
      comment_id TEXT NOT NULL REFERENCES community_post_comments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_join_requests (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_post_notification_subscriptions (
      subscriber_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'all' CHECK (mode IN ('all', 'following')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (subscriber_user_id, community_id)
    );

    CREATE INDEX IF NOT EXISTS idx_communities_name ON communities(name);
    CREATE INDEX IF NOT EXISTS idx_communities_owner ON communities(owner_id);
    CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_community_role_events_user ON community_role_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_community_role_events_community ON community_role_events(community_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_community_tags_community ON community_tags(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_member_tags_community ON community_member_tags(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_posts_community ON community_posts(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_community_post_pumps ON community_post_pumps(post_id);
    CREATE INDEX IF NOT EXISTS idx_community_post_comments ON community_post_comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_community_join_requests ON community_join_requests(community_id, status);
    CREATE INDEX IF NOT EXISTS idx_community_post_notif_subscriber ON community_post_notification_subscriptions(subscriber_user_id);
    CREATE INDEX IF NOT EXISTS idx_community_post_notif_community ON community_post_notification_subscriptions(community_id);

    CREATE TABLE IF NOT EXISTS follower_daily_snapshots (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      follower_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, snapshot_date)
    );

    -- Community custom emojis (from sprite sheet uploads)
    CREATE TABLE IF NOT EXISTS community_emojis (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Community role badges (from sprite sheet uploads)
    CREATE TABLE IF NOT EXISTS community_role_badges (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Badge assignments to members
    CREATE TABLE IF NOT EXISTS community_member_badges (
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id TEXT NOT NULL REFERENCES community_role_badges(id) ON DELETE CASCADE,
      PRIMARY KEY (community_id, user_id, badge_id)
    );

    CREATE INDEX IF NOT EXISTS idx_community_emojis ON community_emojis(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_role_badges ON community_role_badges(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_member_badges ON community_member_badges(community_id);

    -- World Max map data
    CREATE TABLE IF NOT EXISTS world_max_machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      added_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country TEXT NOT NULL DEFAULT '',
      country_code TEXT DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      venue_name TEXT DEFAULT '',
      address TEXT DEFAULT '',
      price_per_credit TEXT DEFAULT '',
      game_code TEXT NOT NULL DEFAULT '',
      game_name TEXT NOT NULL DEFAULT '',
      machine_code TEXT NOT NULL DEFAULT '',
      machine_name TEXT NOT NULL DEFAULT '',
      latitude REAL DEFAULT NULL,
      longitude REAL DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS world_max_machine_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id INTEGER NOT NULL REFERENCES world_max_machines(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER DEFAULT 0,
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS world_max_machine_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id INTEGER NOT NULL REFERENCES world_max_machines(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_data TEXT NOT NULL,
      caption TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_world_max_machine_coords ON world_max_machines(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_world_max_machine_city_country ON world_max_machines(city, country);
    CREATE INDEX IF NOT EXISTS idx_world_max_machine_reviews_machine ON world_max_machine_reviews(machine_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_world_max_machine_photos_machine ON world_max_machine_photos(machine_id, created_at);
  `);

  // Fun mini-game scores (registered users only).
  db.exec(`
    CREATE TABLE IF NOT EXISTS fun_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_fun_scores_user ON fun_scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_fun_scores_score ON fun_scores(score DESC);
    CREATE INDEX IF NOT EXISTS idx_fun_scores_created ON fun_scores(created_at DESC);
  `);

  bootstrapSongsFromJsonIfEmpty();
  ensureCoOpChartsFromJson();
  bootstrapChartTiersFromSnapshotIfEmpty();

  // Migration: backfill empty song flags from pump-phoenix.json
  const emptyFlagCount = db.prepare("SELECT COUNT(*) as c FROM songs WHERE flags = '' OR flags IS NULL").get();
  if (emptyFlagCount.c > 0) {
    const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const updateStmt = db.prepare('UPDATE songs SET flags = ? WHERE title = ? AND mode = ? AND level = ? AND (flags = \'\' OR flags IS NULL)');
        const backfill = db.transaction(() => {
          let updated = 0;
          for (const song of data.songs) {
            const flags = (song.flags || []).join(',');
            if (!flags) continue;
            for (const chart of (song.charts || [])) {
              const mapped = chartModeLevelFromJson(chart);
              if (!mapped || mapped.level <= 0) continue;
              const result = updateStmt.run(flags, song.name, mapped.mode, mapped.level);
              updated += result.changes;
            }
          }
          return updated;
        });
        const count = backfill();
        if (count > 0) console.log(`Backfilled flags for ${count} songs from pump-phoenix.json`);
      } catch (err) {
        console.error('Failed to backfill song flags:', err.message);
      }
    }
  }

  // Migrations for grouped new-clear payloads
  const newClearCols = db.prepare("PRAGMA table_info(user_new_clears)").all().map(c => c.name);
  if (!newClearCols.includes('clears_json')) {
    db.exec("ALTER TABLE user_new_clears ADD COLUMN clears_json TEXT DEFAULT ''");
  }
  if (!newClearCols.includes('pumbility_gain')) {
    db.exec("ALTER TABLE user_new_clears ADD COLUMN pumbility_gain INT DEFAULT 0");
  }
  if (!newClearCols.includes('singles_pumbility_gain')) {
    db.exec("ALTER TABLE user_new_clears ADD COLUMN singles_pumbility_gain INT DEFAULT 0");
  }
  const upscoreCols = db.prepare("PRAGMA table_info(user_upscores)").all().map(c => c.name);
  if (!upscoreCols.includes('pumbility_gain')) {
    db.exec("ALTER TABLE user_upscores ADD COLUMN pumbility_gain INT DEFAULT 0");
  }
  if (!upscoreCols.includes('singles_pumbility_gain')) {
    db.exec("ALTER TABLE user_upscores ADD COLUMN singles_pumbility_gain INT DEFAULT 0");
  }
  backfillLegacyGroupedNewClears();

  // Migrations for users table - add world map location fields
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const userMigrations = [
    ['is_admin', 'INT DEFAULT 0'],
    ['location_country', "TEXT DEFAULT ''"],
    ['location_country_code', "TEXT DEFAULT ''"],
    ['location_city', "TEXT DEFAULT ''"],
    ['location_lat', 'REAL DEFAULT NULL'],
    ['location_lng', 'REAL DEFAULT NULL'],
  ];
  for (const [col, type] of userMigrations) {
    if (!userCols.includes(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
    }
  }

  // Migrations for world_max_machines
  const worldMaxMachineCols = db.prepare("PRAGMA table_info(world_max_machines)").all().map(c => c.name);
  const worldMaxMachineMigrations = [
    ['address', "TEXT DEFAULT ''"],
    ['price_per_credit', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of worldMaxMachineMigrations) {
    if (!worldMaxMachineCols.includes(col)) {
      db.exec(`ALTER TABLE world_max_machines ADD COLUMN ${col} ${type}`);
    }
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

  // Migrations for communities table
  const communityCols = db.prepare("PRAGMA table_info(communities)").all().map(c => c.name);
  const communityMigrations = [
    ['index_tags', "TEXT DEFAULT '[]'"],
    ['about', "TEXT DEFAULT ''"],
    ['location_country', "TEXT DEFAULT ''"],
    ['rules', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of communityMigrations) {
    if (!communityCols.includes(col)) {
      db.exec(`ALTER TABLE communities ADD COLUMN ${col} ${type}`);
    }
  }

  // Migrations for online_duels table - add best_of format
  const onlineDuelCols = db.prepare("PRAGMA table_info(online_duels)").all().map(c => c.name);
  if (!onlineDuelCols.includes('best_of')) {
    db.exec("ALTER TABLE online_duels ADD COLUMN best_of INT DEFAULT 0");
  }

  // Migrations for user_list_items - add sort_order for manual reordering
  const listItemCols = db.prepare("PRAGMA table_info(user_list_items)").all().map(c => c.name);
  if (!listItemCols.includes('sort_order')) {
    db.exec("ALTER TABLE user_list_items ADD COLUMN sort_order INTEGER DEFAULT 0");
    // Backfill sort_order based on existing id order
    db.exec("UPDATE user_list_items SET sort_order = id WHERE sort_order = 0");
  }
}

// Prevent route handlers from closing the shared connection
db.close = () => {};

module.exports = { getDb, initializeDb, DB_PATH };

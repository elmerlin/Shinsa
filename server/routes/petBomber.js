const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const room = require('../lib/petBomber/room');

const router = express.Router();

const MAX_STAT = 100;
const PET_BOMBER_COST = { combo: 10, energy: -7, hunger: -5, happiness: 4, hype: 8 };

// ─── Schema helpers ──────────────────────────────────────────────

function ensureBomberTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_bomber_stats (
      user_id TEXT PRIMARY KEY,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      rounds_won INTEGER NOT NULL DEFAULT 0,
      rounds_played INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT DEFAULT ''
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_bomber_bot_stats (
      user_id TEXT PRIMARY KEY,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      rounds_won INTEGER NOT NULL DEFAULT 0,
      rounds_played INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT DEFAULT ''
    )
  `);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── GET /stats ──────────────────────────────────────────────────

router.get('/stats', requireAuth, (req, res) => {
  const db = getDb();
  ensureBomberTables(db);

  const human = db.prepare('SELECT * FROM pet_bomber_stats WHERE user_id = ?')
    .get(req.user.id);
  const bot = db.prepare('SELECT * FROM pet_bomber_bot_stats WHERE user_id = ?')
    .get(req.user.id);

  res.json({
    human: human ? {
      wins: human.wins,
      losses: human.losses,
      roundsWon: human.rounds_won,
      roundsPlayed: human.rounds_played,
      matchesPlayed: human.matches_played,
      bestStreak: human.best_streak,
      currentStreak: human.current_streak,
      lastPlayedAt: human.last_played_at,
    } : null,
    bot: bot ? {
      wins: bot.wins,
      losses: bot.losses,
      roundsWon: bot.rounds_won,
      roundsPlayed: bot.rounds_played,
      matchesPlayed: bot.matches_played,
      bestStreak: bot.best_streak,
      currentStreak: bot.current_streak,
      lastPlayedAt: bot.last_played_at,
    } : null,
  });
});

// ─── GET /leaderboard/human ──────────────────────────────────────

router.get('/leaderboard/human', (_req, res) => {
  const db = getDb();
  ensureBomberTables(db);

  const rows = db.prepare(`
    SELECT s.*, u.username, u.avatar, u.avatar_v, p.character
    FROM pet_bomber_stats s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_pets p ON p.user_id = s.user_id
    ORDER BY s.wins DESC
    LIMIT 20
  `).all();

  res.json({
    leaderboard: rows.map(r => ({
      userId: r.user_id,
      username: r.username,
      avatar: r.avatar,
      avatarV: r.avatar_v,
      character: r.character,
      wins: r.wins,
      losses: r.losses,
      roundsWon: r.rounds_won,
      roundsPlayed: r.rounds_played,
      matchesPlayed: r.matches_played,
      bestStreak: r.best_streak,
      currentStreak: r.current_streak,
    })),
  });
});

// ─── GET /leaderboard/bot ────────────────────────────────────────

router.get('/leaderboard/bot', (_req, res) => {
  const db = getDb();
  ensureBomberTables(db);

  const rows = db.prepare(`
    SELECT s.*, u.username, u.avatar, u.avatar_v, p.character
    FROM pet_bomber_bot_stats s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_pets p ON p.user_id = s.user_id
    ORDER BY s.wins DESC
    LIMIT 20
  `).all();

  res.json({
    leaderboard: rows.map(r => ({
      userId: r.user_id,
      username: r.username,
      avatar: r.avatar,
      avatarV: r.avatar_v,
      character: r.character,
      wins: r.wins,
      losses: r.losses,
      roundsWon: r.rounds_won,
      roundsPlayed: r.rounds_played,
      matchesPlayed: r.matches_played,
      bestStreak: r.best_streak,
      currentStreak: r.current_streak,
    })),
  });
});

// ─── GET /rooms ──────────────────────────────────────────────────

router.get('/rooms', (_req, res) => {
  const rooms = room.listPublicRooms();
  res.json({ rooms });
});

// ─── POST /rooms ─────────────────────────────────────────────────

router.post('/rooms', requireAuth, (req, res) => {
  const result = room.createRoom(req.user.id, req.body?.character);
  if (!result) return res.status(500).json({ error: 'Failed to create room' });
  res.json({
    id: result.id,
    roomId: result.id,
    room: room.getRoomSnapshot(result),
  });
});

// ─── GET /rooms/:roomId ──────────────────────────────────────────

router.get('/rooms/:roomId', (req, res) => {
  const r = room.getRoom(req.params.roomId);
  if (!r) return res.status(404).json({ error: 'Room not found' });
  res.json(room.getRoomSnapshot(r));
});

// ─── POST /complete ──────────────────────────────────────────────

router.post('/complete', requireAuth, (req, res) => {
  const db = getDb();
  ensureBomberTables(db);

  const { won, isHumanMatch, roundsWon, roundsPlayed } = req.body || {};
  const userId = req.user.id;

  const result = recordMatchResult(
    userId,
    !!won,
    isHumanMatch !== false,
    parseInt(roundsWon, 10) || 0,
    parseInt(roundsPlayed, 10) || 0
  );

  res.json({ success: true, stats: result });
});

// ─── Helper: Record match result ─────────────────────────────────

function recordMatchResult(userId, won, isHumanMatch, roundsWon, roundsPlayed) {
  const db = getDb();
  ensureBomberTables(db);

  const table = isHumanMatch ? 'pet_bomber_stats' : 'pet_bomber_bot_stats';
  const existing = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).get(userId);

  if (!existing) {
    const newStreak = won ? 1 : 0;
    db.prepare(`
      INSERT INTO ${table} (user_id, wins, losses, rounds_won, rounds_played, matches_played, best_streak, current_streak, last_played_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, datetime('now'))
    `).run(userId, won ? 1 : 0, won ? 0 : 1, roundsWon, roundsPlayed, newStreak, newStreak);

    return { wins: won ? 1 : 0, losses: won ? 0 : 1, roundsWon, roundsPlayed, matchesPlayed: 1, bestStreak: newStreak, currentStreak: newStreak };
  }

  const newCurrentStreak = won ? (existing.current_streak + 1) : 0;
  const newBestStreak = Math.max(existing.best_streak, newCurrentStreak);

  db.prepare(`
    UPDATE ${table} SET
      wins = wins + ?,
      losses = losses + ?,
      rounds_won = rounds_won + ?,
      rounds_played = rounds_played + ?,
      matches_played = matches_played + 1,
      best_streak = ?,
      current_streak = ?,
      last_played_at = datetime('now')
    WHERE user_id = ?
  `).run(won ? 1 : 0, won ? 0 : 1, roundsWon, roundsPlayed, newBestStreak, newCurrentStreak, userId);

  return {
    wins: existing.wins + (won ? 1 : 0),
    losses: existing.losses + (won ? 0 : 1),
    roundsWon: existing.rounds_won + roundsWon,
    roundsPlayed: existing.rounds_played + roundsPlayed,
    matchesPlayed: existing.matches_played + 1,
    bestStreak: newBestStreak,
    currentStreak: newCurrentStreak,
  };
}

// ─── Helper: Apply minigame cost to pet ──────────────────────────

function applyMinigameCost(userId) {
  const db = getDb();
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(userId);
  if (!pet) return null;

  const cost = PET_BOMBER_COST;
  const curHunger = pet.fullness || 50;
  const curHappiness = pet.happiness || 50;
  const curEnergy = pet.energy || 65;
  const curHype = pet.hype || 25;

  const newHunger = clamp(curHunger + (cost.hunger || 0), 0, MAX_STAT);
  const newHappiness = clamp(curHappiness + (cost.happiness || 0), 0, MAX_STAT);
  const newEnergy = clamp(curEnergy + (cost.energy || 0), 0, MAX_STAT);
  const newHype = clamp(curHype + (cost.hype || 0), 0, MAX_STAT);
  const comboDeduct = Math.min(cost.combo || 0, pet.combo_balance || 0);

  db.prepare(`
    UPDATE user_pets SET
      fullness = ?, happiness = ?, energy = ?, hype = ?,
      combo_balance = combo_balance - ?,
      last_fed_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newHunger, newHappiness, newEnergy, newHype, comboDeduct, userId);

  return {
    hunger: cost.hunger || 0,
    happiness: cost.happiness || 0,
    energy: cost.energy || 0,
    momentum: cost.hype || 0,
    combo: comboDeduct,
  };
}

module.exports = router;
module.exports.recordMatchResult = recordMatchResult;
module.exports.applyMinigameCost = applyMinigameCost;

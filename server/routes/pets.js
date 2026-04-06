const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');

const router = express.Router();

const VALID_CHARACTERS = ['dojocat', 'buu', 'devit', 'pixiu'];
const MAX_FULLNESS = 100;
const MIN_FULLNESS = 0;
const HUNGER_DECAY_PER_HOUR = 2;
const FEED_AMOUNT_PER_SONG = 5;

function ensurePetTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_pets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      character TEXT NOT NULL DEFAULT 'dojocat',
      fullness INTEGER NOT NULL DEFAULT 50,
      total_songs_fed INTEGER NOT NULL DEFAULT 0,
      last_fed_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeCurrentFullness(pet) {
  if (!pet) return 50;
  let fullness = pet.fullness;
  if (pet.last_fed_at) {
    const lastFed = new Date(pet.last_fed_at + 'Z').getTime();
    const now = Date.now();
    const hoursSinceFed = Math.max(0, (now - lastFed) / (1000 * 60 * 60));
    fullness = Math.round(fullness - hoursSinceFed * HUNGER_DECAY_PER_HOUR);
  }
  return clamp(fullness, MIN_FULLNESS, MAX_FULLNESS);
}

function getWeightState(fullness) {
  if (fullness <= 15) return 'starving';
  if (fullness <= 35) return 'thin';
  if (fullness <= 65) return 'normal';
  if (fullness <= 85) return 'chubby';
  return 'fat';
}

function getMood(fullness) {
  if (fullness <= 15) return 'desperate';
  if (fullness <= 35) return 'hungry';
  if (fullness <= 65) return 'happy';
  if (fullness <= 85) return 'content';
  return 'stuffed';
}

function formatPet(pet) {
  const currentFullness = computeCurrentFullness(pet);
  return {
    character: pet.character,
    fullness: currentFullness,
    weight_state: getWeightState(currentFullness),
    mood: getMood(currentFullness),
    total_songs_fed: pet.total_songs_fed,
    last_fed_at: pet.last_fed_at || '',
    created_at: pet.created_at || '',
  };
}

// GET /api/pets/me — get current user's pet
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) {
    return res.json({ pet: null });
  }
  res.json({ pet: formatPet(pet) });
});

// POST /api/pets/adopt — adopt or change pet character
router.post('/adopt', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const { character } = req.body;
  if (!character || !VALID_CHARACTERS.includes(character)) {
    return res.status(400).json({ error: `Invalid character. Choose from: ${VALID_CHARACTERS.join(', ')}` });
  }
  const existing = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (existing) {
    db.prepare(`
      UPDATE user_pets SET character = ?, fullness = 50, total_songs_fed = 0,
      last_fed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(character, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO user_pets (user_id, character, fullness, total_songs_fed, last_fed_at)
      VALUES (?, ?, 50, 0, datetime('now'))
    `).run(req.user.id, character);
  }
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(pet) });
});

// POST /api/pets/feed — manually feed pet (called when songs are played)
router.post('/feed', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) {
    return res.status(404).json({ error: 'No pet adopted yet' });
  }
  const songsPlayed = Math.max(1, Math.min(10, parseInt(req.body.songs || 1, 10) || 1));
  const currentFullness = computeCurrentFullness(pet);
  const newFullness = clamp(currentFullness + songsPlayed * FEED_AMOUNT_PER_SONG, MIN_FULLNESS, MAX_FULLNESS);
  db.prepare(`
    UPDATE user_pets
    SET fullness = ?, total_songs_fed = total_songs_fed + ?, last_fed_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newFullness, songsPlayed, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated), fed: songsPlayed });
});

// GET /api/pets/characters — list available characters
router.get('/characters', (_req, res) => {
  res.json({
    characters: VALID_CHARACTERS.map((id) => ({
      id,
      name: { dojocat: 'Dojo Cat', buu: 'Buu', devit: 'Devit', pixiu: 'Pixiu' }[id],
    })),
  });
});

module.exports = router;
module.exports.feedPetForUser = function feedPetForUser(userId, songCount = 1) {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(userId);
  if (!pet) return null;
  const currentFullness = computeCurrentFullness(pet);
  const newFullness = clamp(currentFullness + songCount * FEED_AMOUNT_PER_SONG, MIN_FULLNESS, MAX_FULLNESS);
  db.prepare(`
    UPDATE user_pets
    SET fullness = ?, total_songs_fed = total_songs_fed + ?, last_fed_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newFullness, songCount, userId);
  return true;
};

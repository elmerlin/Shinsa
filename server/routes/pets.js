const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { normalizeGrade, gradeFromScore } = require('../lib/titleProgress');

const router = express.Router();

const VALID_CHARACTERS = ['dojocat', 'buu', 'devit', 'pixiu'];
const MAX_FULLNESS = 100;
const MIN_FULLNESS = 0;
const HUNGER_DECAY_PER_HOUR = 2;

// Score-quality feeding: higher grades = more food + XP
const GRADE_FEED_TABLE = {
  'SSS+': { food: 15, xp: 50 },
  'SSS':  { food: 14, xp: 45 },
  'SS+':  { food: 12, xp: 35 },
  'SS':   { food: 11, xp: 30 },
  'S+':   { food: 10, xp: 25 },
  'S':    { food: 9,  xp: 22 },
  'AAA+': { food: 8,  xp: 18 },
  'AAA':  { food: 7,  xp: 15 },
  'AA+':  { food: 6,  xp: 12 },
  'AA':   { food: 6,  xp: 10 },
  'A+':   { food: 5,  xp: 8 },
  'A':    { food: 5,  xp: 6 },
  'B':    { food: 4,  xp: 4 },
  'C':    { food: 3,  xp: 2 },
  'D':    { food: 2,  xp: 1 },
  'F':    { food: 1,  xp: 0 },
};

// Level bonus: higher levels give more XP
function levelXpBonus(level) {
  if (level >= 25) return 20;
  if (level >= 22) return 12;
  if (level >= 19) return 7;
  if (level >= 16) return 4;
  if (level >= 13) return 2;
  return 0;
}

// Tricks per character — unlocked at XP thresholds
const TRICKS = {
  dojocat: [
    { id: 'pose', name: 'Strike a Pose', xp: 0, description: 'A confident smirk and power stance' },
    { id: 'flex', name: 'Show Off', xp: 150, description: 'Thumbs up with maximum swagger' },
    { id: 'science', name: 'Lab Experiment', xp: 600, description: 'Dons a lab coat for some pad science' },
    { id: 'rage', name: 'POWER UP!', xp: 2500, description: 'Unleashes hidden tournament energy' },
  ],
  buu: [
    { id: 'smile', name: 'Big Smile', xp: 0, description: 'A warm, content grin' },
    { id: 'dressup', name: 'Costume Party', xp: 150, description: 'Shows off a fabulous outfit' },
    { id: 'ranger', name: 'Go Ranger!', xp: 600, description: 'Transforms into a Power Ranger' },
    { id: 'wizard', name: 'Cast Spell', xp: 2500, description: 'Channels arcane dance magic' },
  ],
  devit: [
    { id: 'idle', name: 'Stand Still', xp: 0, description: 'Idle and looking cute' },
    { id: 'scamper', name: 'Quick Dash', xp: 150, description: 'Zips across with tiny steps' },
    { id: 'prance', name: 'Happy Dance', xp: 600, description: 'Prances with pure joy' },
    { id: 'cheer', name: 'Victory Cheer', xp: 2500, description: 'Jumps and cheers with all their might' },
  ],
  pixiu: [
    { id: 'greet', name: 'Greeting', xp: 0, description: 'A warm traditional welcome' },
    { id: 'laugh', name: 'Big Laugh', xp: 150, description: 'Laughs so hard eyes close' },
    { id: 'dance', name: 'Lion Dance', xp: 600, description: 'Performs a celebratory lion dance' },
    { id: 'fortune', name: 'Fortune Blessing', xp: 2500, description: 'Bestows a golden blessing' },
  ],
};

// Minimum grade required for trick demands based on trick tier
const TRICK_DEMAND_GRADES = ['A', 'A', 'AA', 'S'];

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
  // Add new columns if missing
  const cols = db.prepare("PRAGMA table_info(user_pets)").all().map(c => c.name);
  if (!cols.includes('experience')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN experience INTEGER NOT NULL DEFAULT 0`);
  }
  if (!cols.includes('tricks_unlocked')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN tricks_unlocked TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!cols.includes('pending_trick')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN pending_trick TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('trick_demand_level')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN trick_demand_level INTEGER NOT NULL DEFAULT 0`);
  }
  if (!cols.includes('trick_demand_grade')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN trick_demand_grade TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('trick_demand_expires')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN trick_demand_expires TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('last_trick_performed')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN last_trick_performed TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('last_trick_at')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN last_trick_at TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('highest_level')) {
    db.exec(`ALTER TABLE user_pets ADD COLUMN highest_level INTEGER NOT NULL DEFAULT 0`);
  }
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

function getUnlockedTricks(character, experience) {
  const charTricks = TRICKS[character] || [];
  return charTricks.filter(t => experience >= t.xp).map(t => t.id);
}

function getNextTrick(character, experience) {
  const charTricks = TRICKS[character] || [];
  return charTricks.find(t => experience < t.xp) || null;
}

function formatPet(pet) {
  const currentFullness = computeCurrentFullness(pet);
  const experience = pet.experience || 0;
  const character = pet.character || 'dojocat';
  const unlockedTricks = getUnlockedTricks(character, experience);
  const nextTrick = getNextTrick(character, experience);
  const charTricks = TRICKS[character] || [];

  // Check if pending demand is expired
  let pendingTrick = pet.pending_trick || '';
  let trickDemandLevel = pet.trick_demand_level || 0;
  let trickDemandGrade = pet.trick_demand_grade || '';
  if (pendingTrick && pet.trick_demand_expires) {
    const expires = new Date(pet.trick_demand_expires + 'Z').getTime();
    if (Date.now() > expires) {
      pendingTrick = '';
      trickDemandLevel = 0;
      trickDemandGrade = '';
    }
  }

  return {
    character,
    fullness: currentFullness,
    weight_state: getWeightState(currentFullness),
    mood: getMood(currentFullness),
    total_songs_fed: pet.total_songs_fed,
    experience,
    highest_level: pet.highest_level || 0,
    tricks_unlocked: unlockedTricks,
    tricks: charTricks.map(t => ({
      ...t,
      unlocked: experience >= t.xp,
      progress: Math.min(1, experience / Math.max(t.xp, 1)),
    })),
    next_trick: nextTrick ? {
      ...nextTrick,
      xp_remaining: nextTrick.xp - experience,
      progress: experience / nextTrick.xp,
    } : null,
    pending_trick: pendingTrick,
    trick_demand_level: trickDemandLevel,
    trick_demand_grade: trickDemandGrade,
    last_trick_performed: pet.last_trick_performed || '',
    last_trick_at: pet.last_trick_at || '',
    last_fed_at: pet.last_fed_at || '',
    created_at: pet.created_at || '',
  };
}

// GET /api/pets/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.json({ pet: null });
  res.json({ pet: formatPet(pet) });
});

// POST /api/pets/adopt
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
      UPDATE user_pets SET character = ?, fullness = 50, total_songs_fed = 0, experience = 0,
      tricks_unlocked = '[]', pending_trick = '', trick_demand_level = 0, trick_demand_grade = '',
      trick_demand_expires = '', last_trick_performed = '', last_trick_at = '',
      last_fed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(character, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO user_pets (user_id, character, fullness, total_songs_fed, experience, last_fed_at)
      VALUES (?, ?, 50, 0, 0, datetime('now'))
    `).run(req.user.id, character);
  }
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(pet) });
});

// POST /api/pets/feed — manual feed (1 generic song)
router.post('/feed', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  const currentFullness = computeCurrentFullness(pet);
  const newFullness = clamp(currentFullness + 5, MIN_FULLNESS, MAX_FULLNESS);
  db.prepare(`
    UPDATE user_pets
    SET fullness = ?, total_songs_fed = total_songs_fed + 1, last_fed_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newFullness, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated), fed: 1 });
});

// POST /api/pets/tricks/:trickId/demand — pet demands a play to perform this trick
router.post('/tricks/:trickId/demand', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const trickId = req.params.trickId;
  const charTricks = TRICKS[pet.character] || [];
  const trickIndex = charTricks.findIndex(t => t.id === trickId);
  const trick = charTricks[trickIndex];
  if (!trick) return res.status(404).json({ error: 'Trick not found' });
  if ((pet.experience || 0) < trick.xp) return res.status(400).json({ error: 'Trick not unlocked yet' });

  // Calculate demand based on user's highest level — reasonable challenge
  const highestLevel = pet.highest_level || 10;
  // Demand a level near their comfort zone: highest - 3 to highest - 1
  const demandLevel = Math.max(10, highestLevel - Math.floor(Math.random() * 3) - 1);
  const demandGrade = TRICK_DEMAND_GRADES[trickIndex] || 'A';
  // Expires in 48 hours
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');

  db.prepare(`
    UPDATE user_pets
    SET pending_trick = ?, trick_demand_level = ?, trick_demand_grade = ?, trick_demand_expires = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(trickId, demandLevel, demandGrade, expires, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated) });
});

// POST /api/pets/tricks/:trickId/perform — manually check if demand was met
router.post('/tricks/:trickId/perform', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  if (pet.pending_trick !== req.params.trickId) {
    return res.status(400).json({ error: 'No active demand for this trick' });
  }
  // Check if user has a recent play matching the demand
  const demandLevel = pet.trick_demand_level || 0;
  const demandGrade = pet.trick_demand_grade || 'A';
  const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
  const minGradeIndex = gradeOrder.indexOf(demandGrade);

  const recentPlays = db.prepare(`
    SELECT level, grade, score FROM user_recently_played
    WHERE user_id = ? AND level >= ? AND played_at_utc >= datetime('now', '-48 hours')
    ORDER BY played_at_utc DESC LIMIT 50
  `).all(req.user.id, demandLevel);

  const matched = recentPlays.some(play => {
    const playGrade = normalizeGrade(play.grade) || gradeFromScore(play.score);
    const playGradeIndex = gradeOrder.indexOf(playGrade);
    return playGradeIndex >= minGradeIndex;
  });

  if (!matched) {
    return res.json({ success: false, message: `Play a level ${demandLevel}+ song and get at least ${demandGrade} grade!` });
  }

  // Trick performed! Bonus XP and clear the demand
  const bonusXp = 25;
  db.prepare(`
    UPDATE user_pets
    SET pending_trick = '', trick_demand_level = 0, trick_demand_grade = '', trick_demand_expires = '',
        last_trick_performed = ?, last_trick_at = datetime('now'),
        experience = experience + ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(req.params.trickId, bonusXp, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ success: true, pet: formatPet(updated), trick: req.params.trickId, bonus_xp: bonusXp });
});

// GET /api/pets/characters
router.get('/characters', (_req, res) => {
  res.json({
    characters: VALID_CHARACTERS.map((id) => ({
      id,
      name: { dojocat: 'Dojo Cat', buu: 'Buu', devit: 'Devit', pixiu: 'Pixiu' }[id],
      tricks: (TRICKS[id] || []).map(t => ({ id: t.id, name: t.name, xp: t.xp })),
    })),
  });
});

module.exports = router;
module.exports.VALID_CHARACTERS = VALID_CHARACTERS;

// Called from piugame sync with actual play data
// plays: Array of { score, grade, level }
module.exports.feedPetForUser = function feedPetForUser(userId, playsOrCount) {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(userId);
  if (!pet) return null;

  let totalFood = 0;
  let totalXp = 0;
  let highestLevel = pet.highest_level || 0;
  let songCount = 0;
  let trickDemandMet = false;

  if (Array.isArray(playsOrCount)) {
    // Score-based feeding from actual play data
    const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];

    for (const play of playsOrCount) {
      const score = parseInt(play.score, 10) || 0;
      const rawGrade = normalizeGrade(play.grade) || (score > 0 ? gradeFromScore(score) : 'F');
      const level = parseInt(play.level, 10) || 0;

      if (level > highestLevel) highestLevel = level;

      const feedRow = GRADE_FEED_TABLE[rawGrade] || GRADE_FEED_TABLE['F'];
      totalFood += feedRow.food;
      totalXp += feedRow.xp + levelXpBonus(level);
      songCount++;

      // Check if this play satisfies the pending trick demand
      if (pet.pending_trick && !trickDemandMet) {
        const demandLevel = pet.trick_demand_level || 0;
        const demandGrade = pet.trick_demand_grade || 'A';
        const minGradeIndex = gradeOrder.indexOf(demandGrade);
        const playGradeIndex = gradeOrder.indexOf(rawGrade);
        if (level >= demandLevel && playGradeIndex >= minGradeIndex) {
          trickDemandMet = true;
        }
      }
    }
  } else {
    // Legacy: flat count-based feeding
    songCount = Math.max(1, Math.min(10, parseInt(playsOrCount, 10) || 1));
    totalFood = songCount * 5;
    totalXp = songCount * 5;
  }

  const currentFullness = computeCurrentFullness(pet);
  const newFullness = clamp(currentFullness + totalFood, MIN_FULLNESS, MAX_FULLNESS);

  if (trickDemandMet) {
    const trickBonusXp = 25;
    db.prepare(`
      UPDATE user_pets
      SET fullness = ?, total_songs_fed = total_songs_fed + ?, experience = experience + ?,
          highest_level = MAX(highest_level, ?),
          last_fed_at = datetime('now'), updated_at = datetime('now'),
          last_trick_performed = pending_trick, last_trick_at = datetime('now'),
          pending_trick = '', trick_demand_level = 0, trick_demand_grade = '', trick_demand_expires = ''
      WHERE user_id = ?
    `).run(newFullness, songCount, totalXp + trickBonusXp, highestLevel, userId);
  } else {
    db.prepare(`
      UPDATE user_pets
      SET fullness = ?, total_songs_fed = total_songs_fed + ?, experience = experience + ?,
          highest_level = MAX(highest_level, ?),
          last_fed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(newFullness, songCount, totalXp, highestLevel, userId);
  }

  return { fed: songCount, food: totalFood, xp: totalXp, trickDemandMet };
};

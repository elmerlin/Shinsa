const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { normalizeGrade, gradeFromScore } = require('../lib/titleProgress');

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────
const VALID_CHARACTERS = ['dojocat', 'buu', 'devit', 'pixiu'];
const MAX_STAT = 100;
const HUNGER_DECAY_PER_HOUR = 2;
const HAPPINESS_DECAY_PER_HOUR = 1.2;

// Combo earned per grade when syncing plays
const GRADE_COMBO = {
  'SSS+': 12, 'SSS': 10, 'SS+': 9, 'SS': 8, 'S+': 7, 'S': 6,
  'AAA+': 5, 'AAA': 4, 'AA+': 3, 'AA': 3, 'A+': 2, 'A': 2,
  'B': 1, 'C': 1, 'D': 0, 'F': 0,
};

// Small hunger/happiness trickle per play (from sync)
const GRADE_FEED_TABLE = {
  'SSS+': { hunger: 3, happiness: 4, xp: 50 },
  'SSS':  { hunger: 3, happiness: 3, xp: 45 },
  'SS+':  { hunger: 2, happiness: 3, xp: 35 },
  'SS':   { hunger: 2, happiness: 3, xp: 30 },
  'S+':   { hunger: 2, happiness: 2, xp: 25 },
  'S':    { hunger: 2, happiness: 2, xp: 22 },
  'AAA+': { hunger: 1, happiness: 2, xp: 18 },
  'AAA':  { hunger: 1, happiness: 2, xp: 15 },
  'AA+':  { hunger: 1, happiness: 1, xp: 12 },
  'AA':   { hunger: 1, happiness: 1, xp: 10 },
  'A+':   { hunger: 1, happiness: 1, xp: 8 },
  'A':    { hunger: 1, happiness: 1, xp: 6 },
  'B':    { hunger: 1, happiness: 0, xp: 4 },
  'C':    { hunger: 0, happiness: 0, xp: 2 },
  'D':    { hunger: 0, happiness: 0, xp: 1 },
  'F':    { hunger: 0, happiness: 0, xp: 0 },
};

function levelXpBonus(level) {
  if (level >= 25) return 20;
  if (level >= 22) return 12;
  if (level >= 19) return 7;
  if (level >= 16) return 4;
  if (level >= 13) return 2;
  return 0;
}

function levelComboBonus(level) {
  if (level >= 25) return 5;
  if (level >= 22) return 3;
  if (level >= 19) return 2;
  if (level >= 15) return 1;
  return 0;
}

// ─── Pet Food ─────────────────────────────────────────────────────
const PET_FOODS = [
  { id: 'pump-chow', name: 'Pump Chow', cost: 5, hunger: 12, happiness: 2, emoji: '🥩', desc: 'Hearty pad fuel' },
  { id: 'beat-bites', name: 'Beat Bites', cost: 8, hunger: 8, happiness: 6, emoji: '🍪', desc: 'Crunchy rhythm snacks' },
  { id: 'slam-grub', name: 'Slam Grub', cost: 12, hunger: 18, happiness: 3, emoji: '🍖', desc: 'Heavy-duty stomp food' },
  { id: 'step-fuel', name: 'Step Fuel', cost: 10, hunger: 14, happiness: 5, emoji: '⚡', desc: 'Energy for endless runs' },
  { id: 'rhythm-rations', name: 'Rhythm Rations', cost: 6, hunger: 7, happiness: 8, emoji: '🎵', desc: 'Musical munchies' },
  { id: 'gargoyle-munch', name: 'Gargoyle Munch', cost: 15, hunger: 22, happiness: 2, emoji: '👹', desc: 'Fills you up fast' },
  { id: 'pad-power', name: 'Pad Power', cost: 20, hunger: 20, happiness: 10, emoji: '💪', desc: 'Premium dance nutrition' },
  { id: 'dance-dust', name: 'Dance Dust', cost: 3, hunger: 3, happiness: 14, emoji: '✨', desc: 'Pure joy in a pinch' },
  { id: 'doof-bites', name: 'Doof Bites', cost: 7, hunger: 10, happiness: 8, emoji: '🔥', desc: 'Spicy electronic flavor' },
  { id: 'adrenaline-chow', name: 'Adrenaline Chow', cost: 25, hunger: 25, happiness: 14, emoji: '🚀', desc: 'For the hardcore stepper' },
  { id: 'banya-biscuits', name: 'Banya Biscuits', cost: 30, hunger: 22, happiness: 18, emoji: '🏆', desc: 'Legendary gourmet treats' },
];
const PET_FOODS_MAP = Object.fromEntries(PET_FOODS.map(f => [f.id, f]));

// ─── Clothing ─────────────────────────────────────────────────────
const CLOTHING = {
  hats: [
    { id: 'chicken-hat', name: 'Chicken Hat', cost: 50, defaultColor: '#FFEB3B' },
    { id: 'headband', name: 'Headband', cost: 20, defaultColor: '#E53935' },
    { id: 'crown', name: 'Crown', cost: 100, defaultColor: '#FFD700' },
    { id: 'beanie', name: 'Beanie', cost: 30, defaultColor: '#607D8B' },
    { id: 'wizard-hat', name: 'Wizard Hat', cost: 75, defaultColor: '#7B1FA2' },
    { id: 'party-hat', name: 'Party Hat', cost: 15, defaultColor: '#FF4081' },
  ],
  belts: [
    { id: 'stomp-belt', name: 'Stomp Belt', cost: 40, defaultColor: '#1A1A2E' },
    { id: 'chain-belt', name: 'Chain Belt', cost: 35, defaultColor: '#B0BEC5' },
    { id: 'ribbon', name: 'Ribbon', cost: 15, defaultColor: '#F06292' },
    { id: 'sash', name: 'Champion Sash', cost: 60, defaultColor: '#FFD700' },
  ],
  shoes: [
    { id: 'sneakers', name: 'Sneakers', cost: 25, defaultColor: '#FFFFFF' },
    { id: 'boots', name: 'Boots', cost: 45, defaultColor: '#5D4037' },
    { id: 'sandals', name: 'Sandals', cost: 10, defaultColor: '#8D6E63' },
    { id: 'dance-shoes', name: 'Dance Shoes', cost: 55, defaultColor: '#E53935' },
  ],
};
const ALL_CLOTHING = [...CLOTHING.hats, ...CLOTHING.belts, ...CLOTHING.shoes];
const CLOTHING_MAP = Object.fromEntries(ALL_CLOTHING.map(c => [c.id, c]));
function getClothingSlot(itemId) {
  if (CLOTHING.hats.find(h => h.id === itemId)) return 'hat';
  if (CLOTHING.belts.find(b => b.id === itemId)) return 'belt';
  if (CLOTHING.shoes.find(s => s.id === itemId)) return 'shoes';
  return null;
}

// ─── Tricks ───────────────────────────────────────────────────────
const TRICKS = {
  dojocat: [
    { id: 'pose', name: 'Strike a Pose', xp: 0, description: 'A confident smirk and power stance', comboReward: 5, happinessReward: 5 },
    { id: 'flex', name: 'Show Off', xp: 150, description: 'Thumbs up with maximum swagger', comboReward: 12, happinessReward: 8 },
    { id: 'science', name: 'Lab Experiment', xp: 600, description: 'Dons a lab coat for pad science', comboReward: 20, happinessReward: 12 },
    { id: 'rage', name: 'POWER UP!', xp: 2500, description: 'Unleashes tournament energy', comboReward: 35, happinessReward: 18 },
  ],
  buu: [
    { id: 'smile', name: 'Big Smile', xp: 0, description: 'A warm, content grin', comboReward: 5, happinessReward: 5 },
    { id: 'dressup', name: 'Costume Party', xp: 150, description: 'Shows off a fabulous outfit', comboReward: 12, happinessReward: 8 },
    { id: 'ranger', name: 'Go Ranger!', xp: 600, description: 'Transforms into a Power Ranger', comboReward: 20, happinessReward: 12 },
    { id: 'wizard', name: 'Cast Spell', xp: 2500, description: 'Channels arcane dance magic', comboReward: 35, happinessReward: 18 },
  ],
  devit: [
    { id: 'idle', name: 'Stand Still', xp: 0, description: 'Idle and looking cute', comboReward: 5, happinessReward: 5 },
    { id: 'scamper', name: 'Quick Dash', xp: 150, description: 'Zips across with tiny steps', comboReward: 12, happinessReward: 8 },
    { id: 'prance', name: 'Happy Dance', xp: 600, description: 'Prances with pure joy', comboReward: 20, happinessReward: 12 },
    { id: 'cheer', name: 'Victory Cheer', xp: 2500, description: 'Jumps and cheers with all might', comboReward: 35, happinessReward: 18 },
  ],
  pixiu: [
    { id: 'greet', name: 'Greeting', xp: 0, description: 'A warm traditional welcome', comboReward: 5, happinessReward: 5 },
    { id: 'laugh', name: 'Big Laugh', xp: 150, description: 'Laughs so hard eyes close', comboReward: 12, happinessReward: 8 },
    { id: 'dance', name: 'Lion Dance', xp: 600, description: 'Celebratory lion dance', comboReward: 20, happinessReward: 12 },
    { id: 'fortune', name: 'Fortune Blessing', xp: 2500, description: 'Bestows a golden blessing', comboReward: 35, happinessReward: 18 },
  ],
};
const TRICK_DEMAND_GRADES = ['A', 'A', 'AA', 'S'];

// ─── Schema ───────────────────────────────────────────────────────
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
  const cols = db.prepare("PRAGMA table_info(user_pets)").all().map(c => c.name);
  const addCol = (name, def) => { if (!cols.includes(name)) db.exec(`ALTER TABLE user_pets ADD COLUMN ${name} ${def}`); };
  addCol('experience', "INTEGER NOT NULL DEFAULT 0");
  addCol('tricks_unlocked', "TEXT NOT NULL DEFAULT '[]'");
  addCol('pending_trick', "TEXT NOT NULL DEFAULT ''");
  addCol('trick_demand_level', "INTEGER NOT NULL DEFAULT 0");
  addCol('trick_demand_grade', "TEXT NOT NULL DEFAULT ''");
  addCol('trick_demand_expires', "TEXT NOT NULL DEFAULT ''");
  addCol('last_trick_performed', "TEXT NOT NULL DEFAULT ''");
  addCol('last_trick_at', "TEXT NOT NULL DEFAULT ''");
  addCol('highest_level', "INTEGER NOT NULL DEFAULT 0");
  // New columns for v2
  addCol('happiness', "INTEGER NOT NULL DEFAULT 50");
  addCol('combo_balance', "INTEGER NOT NULL DEFAULT 0");
  addCol('owned_items', "TEXT NOT NULL DEFAULT '[]'");
  addCol('equipped_hat', "TEXT NOT NULL DEFAULT ''");
  addCol('equipped_belt', "TEXT NOT NULL DEFAULT ''");
  addCol('equipped_shoes', "TEXT NOT NULL DEFAULT ''");
  addCol('hat_color', "TEXT NOT NULL DEFAULT ''");
  addCol('belt_color', "TEXT NOT NULL DEFAULT ''");
  addCol('shoes_color', "TEXT NOT NULL DEFAULT ''");
  addCol('is_pet_avatar', "INTEGER NOT NULL DEFAULT 0");
}

// ─── Helpers ──────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function computeDecayed(storedValue, lastFedAt, decayPerHour) {
  if (!lastFedAt) return storedValue;
  const lastFed = new Date(lastFedAt + 'Z').getTime();
  const hoursSince = Math.max(0, (Date.now() - lastFed) / (1000 * 60 * 60));
  return clamp(Math.round(storedValue - hoursSince * decayPerHour), 0, MAX_STAT);
}

function getWeightState(hunger) {
  if (hunger <= 15) return 'starving';
  if (hunger <= 35) return 'thin';
  if (hunger <= 65) return 'normal';
  if (hunger <= 85) return 'chubby';
  return 'fat';
}

function getMood(hunger, happiness) {
  const avg = (hunger + happiness) / 2;
  if (avg <= 15) return 'desperate';
  if (avg <= 35) return 'hungry';
  if (avg <= 65) return 'happy';
  if (avg <= 85) return 'content';
  return 'stuffed';
}

function getUnlockedTricks(character, xp) {
  return (TRICKS[character] || []).filter(t => xp >= t.xp).map(t => t.id);
}

function getNextTrick(character, xp) {
  return (TRICKS[character] || []).find(t => xp < t.xp) || null;
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str || '[]'); } catch { return fallback || []; }
}

// ─── Format pet for API response ──────────────────────────────────
function formatPet(pet, isPublic = false) {
  const hunger = computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const happiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const xp = pet.experience || 0;
  const character = pet.character || 'dojocat';
  const charTricks = TRICKS[character] || [];
  const nextTrick = getNextTrick(character, xp);

  let pendingTrick = pet.pending_trick || '';
  let trickDemandLevel = pet.trick_demand_level || 0;
  let trickDemandGrade = pet.trick_demand_grade || '';
  if (pendingTrick && pet.trick_demand_expires) {
    if (Date.now() > new Date(pet.trick_demand_expires + 'Z').getTime()) {
      pendingTrick = '';
      trickDemandLevel = 0;
      trickDemandGrade = '';
    }
  }

  const base = {
    character,
    hunger,
    happiness,
    weight_state: getWeightState(hunger),
    mood: getMood(hunger, happiness),
    total_songs_fed: pet.total_songs_fed,
    experience: xp,
    highest_level: pet.highest_level || 0,
    equipped_hat: pet.equipped_hat || '',
    equipped_belt: pet.equipped_belt || '',
    equipped_shoes: pet.equipped_shoes || '',
    hat_color: pet.hat_color || '',
    belt_color: pet.belt_color || '',
    shoes_color: pet.shoes_color || '',
    is_pet_avatar: pet.is_pet_avatar || 0,
    last_trick_performed: pet.last_trick_performed || '',
    last_trick_at: pet.last_trick_at || '',
    created_at: pet.created_at || '',
  };

  if (isPublic) return base; // Visitors see stats but not wallet/inventory

  return {
    ...base,
    combo_balance: pet.combo_balance || 0,
    owned_items: safeJsonParse(pet.owned_items),
    tricks_unlocked: getUnlockedTricks(character, xp),
    tricks: charTricks.map(t => ({
      ...t,
      unlocked: xp >= t.xp,
      progress: Math.min(1, xp / Math.max(t.xp, 1)),
    })),
    next_trick: nextTrick ? {
      ...nextTrick,
      xp_remaining: nextTrick.xp - xp,
      progress: xp / nextTrick.xp,
    } : null,
    pending_trick: pendingTrick,
    trick_demand_level: trickDemandLevel,
    trick_demand_grade: trickDemandGrade,
    last_fed_at: pet.last_fed_at || '',
  };
}

// ─── Routes ───────────────────────────────────────────────────────

// GET /api/pets/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.json({ pet: null });
  res.json({ pet: formatPet(pet) });
});

// GET /api/pets/user/:userId — public pet view (for avatar modals)
router.get('/user/:userId', (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.params.userId);
  if (!pet) return res.json({ pet: null });
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.userId);
  res.json({ pet: formatPet(pet, true), username: user?.username || '' });
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
      UPDATE user_pets SET character = ?, fullness = 50, happiness = 50, total_songs_fed = 0, experience = 0,
      tricks_unlocked = '[]', pending_trick = '', trick_demand_level = 0, trick_demand_grade = '',
      trick_demand_expires = '', last_trick_performed = '', last_trick_at = '',
      equipped_hat = '', equipped_belt = '', equipped_shoes = '',
      hat_color = '', belt_color = '', shoes_color = '',
      last_fed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(character, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO user_pets (user_id, character, fullness, happiness, total_songs_fed, experience, last_fed_at)
      VALUES (?, ?, 50, 50, 0, 0, datetime('now'))
    `).run(req.user.id, character);
  }
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(pet) });
});

// GET /api/pets/shop — food + clothing catalog
router.get('/shop', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT combo_balance, owned_items FROM user_pets WHERE user_id = ?').get(req.user.id);
  const owned = safeJsonParse(pet?.owned_items);
  res.json({
    combo_balance: pet?.combo_balance || 0,
    foods: PET_FOODS,
    clothing: {
      hats: CLOTHING.hats.map(c => ({ ...c, owned: owned.includes(c.id) })),
      belts: CLOTHING.belts.map(c => ({ ...c, owned: owned.includes(c.id) })),
      shoes: CLOTHING.shoes.map(c => ({ ...c, owned: owned.includes(c.id) })),
    },
  });
});

// POST /api/pets/buy-food — buy and feed a food item
router.post('/buy-food', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const food = PET_FOODS_MAP[req.body.foodId];
  if (!food) return res.status(400).json({ error: 'Unknown food item' });

  const balance = pet.combo_balance || 0;
  if (balance < food.cost) return res.status(400).json({ error: 'Not enough Combo', need: food.cost, have: balance });

  const hunger = computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const happiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const newHunger = clamp(hunger + food.hunger, 0, MAX_STAT);
  const newHappiness = clamp(happiness + food.happiness, 0, MAX_STAT);

  db.prepare(`
    UPDATE user_pets
    SET fullness = ?, happiness = ?, combo_balance = combo_balance - ?,
        total_songs_fed = total_songs_fed + 1, last_fed_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newHunger, newHappiness, food.cost, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated), food: food.name });
});

// POST /api/pets/buy-item — buy a clothing item
router.post('/buy-item', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const item = CLOTHING_MAP[req.body.itemId];
  if (!item) return res.status(400).json({ error: 'Unknown item' });

  const owned = safeJsonParse(pet.owned_items);
  if (owned.includes(item.id)) return res.status(400).json({ error: 'Already owned' });

  const balance = pet.combo_balance || 0;
  if (balance < item.cost) return res.status(400).json({ error: 'Not enough Combo', need: item.cost, have: balance });

  owned.push(item.id);
  db.prepare(`
    UPDATE user_pets SET combo_balance = combo_balance - ?, owned_items = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(item.cost, JSON.stringify(owned), req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated), item: item.name });
});

// POST /api/pets/equip — equip or unequip clothing
router.post('/equip', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const { itemId } = req.body; // empty string = unequip
  if (itemId) {
    const owned = safeJsonParse(pet.owned_items);
    if (!owned.includes(itemId)) return res.status(400).json({ error: 'Item not owned' });
    const slot = getClothingSlot(itemId);
    if (!slot) return res.status(400).json({ error: 'Unknown item type' });
    const colMap = { hat: 'equipped_hat', belt: 'equipped_belt', shoes: 'equipped_shoes' };
    const colorColMap = { hat: 'hat_color', belt: 'belt_color', shoes: 'shoes_color' };
    const item = CLOTHING_MAP[itemId];
    db.prepare(`UPDATE user_pets SET ${colMap[slot]} = ?, ${colorColMap[slot]} = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(itemId, item.defaultColor, req.user.id);
  } else {
    // Unequip a slot
    const slot = req.body.slot; // 'hat', 'belt', or 'shoes'
    if (!['hat', 'belt', 'shoes'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
    const colMap = { hat: 'equipped_hat', belt: 'equipped_belt', shoes: 'equipped_shoes' };
    db.prepare(`UPDATE user_pets SET ${colMap[slot]} = '', updated_at = datetime('now') WHERE user_id = ?`).run(req.user.id);
  }

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated) });
});

// POST /api/pets/set-color — change clothing color
router.post('/set-color', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const { slot, color } = req.body;
  if (!['hat', 'belt', 'shoes'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Invalid color (use #RRGGBB)' });
  const colMap = { hat: 'hat_color', belt: 'belt_color', shoes: 'shoes_color' };
  db.prepare(`UPDATE user_pets SET ${colMap[slot]} = ?, updated_at = datetime('now') WHERE user_id = ?`).run(color, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated) });
});

// POST /api/pets/toggle-avatar — toggle pet as profile avatar
router.post('/toggle-avatar', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT is_pet_avatar FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  const newVal = pet.is_pet_avatar ? 0 : 1;
  db.prepare('UPDATE user_pets SET is_pet_avatar = ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(newVal, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated) });
});

// POST /api/pets/feed — legacy manual feed (small amount)
router.post('/feed', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  const hunger = computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const newHunger = clamp(hunger + 5, 0, MAX_STAT);
  db.prepare(`
    UPDATE user_pets SET fullness = ?, total_songs_fed = total_songs_fed + 1,
    last_fed_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?
  `).run(newHunger, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated), fed: 1 });
});

// ─── Trick demand/perform ─────────────────────────────────────────
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

  const highestLevel = pet.highest_level || 10;
  const demandLevel = Math.max(10, highestLevel - Math.floor(Math.random() * 3) - 1);
  const demandGrade = TRICK_DEMAND_GRADES[trickIndex] || 'A';
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');

  db.prepare(`
    UPDATE user_pets SET pending_trick = ?, trick_demand_level = ?, trick_demand_grade = ?,
    trick_demand_expires = ?, updated_at = datetime('now') WHERE user_id = ?
  `).run(trickId, demandLevel, demandGrade, expires, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated) });
});

router.post('/tricks/:trickId/perform', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  if (pet.pending_trick !== req.params.trickId) {
    return res.status(400).json({ error: 'No active demand for this trick' });
  }
  const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
  const minGradeIndex = gradeOrder.indexOf(pet.trick_demand_grade || 'A');
  const demandLevel = pet.trick_demand_level || 0;

  const recentPlays = db.prepare(`
    SELECT level, grade, score FROM user_recently_played
    WHERE user_id = ? AND level >= ? AND played_at_utc >= datetime('now', '-48 hours')
    ORDER BY played_at_utc DESC LIMIT 50
  `).all(req.user.id, demandLevel);

  const matched = recentPlays.some(play => {
    const g = normalizeGrade(play.grade) || gradeFromScore(play.score);
    return gradeOrder.indexOf(g) >= minGradeIndex;
  });

  if (!matched) {
    return res.json({ success: false, message: `Play a level ${demandLevel}+ song and get at least ${pet.trick_demand_grade} grade!` });
  }

  const charTricks = TRICKS[pet.character] || [];
  const trick = charTricks.find(t => t.id === req.params.trickId);
  const comboReward = trick?.comboReward || 10;
  const happinessReward = trick?.happinessReward || 5;
  const bonusXp = 25;

  const currentHappiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const newHappiness = clamp(currentHappiness + happinessReward, 0, MAX_STAT);

  db.prepare(`
    UPDATE user_pets
    SET pending_trick = '', trick_demand_level = 0, trick_demand_grade = '', trick_demand_expires = '',
        last_trick_performed = ?, last_trick_at = datetime('now'),
        experience = experience + ?, combo_balance = combo_balance + ?,
        happiness = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(req.params.trickId, bonusXp, comboReward, newHappiness, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ success: true, pet: formatPet(updated), trick: req.params.trickId, bonus_xp: bonusXp, combo_earned: comboReward });
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

// ─── Called from piugame sync ─────────────────────────────────────
module.exports.feedPetForUser = function feedPetForUser(userId, playsOrCount) {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(userId);
  if (!pet) return null;

  let totalHunger = 0;
  let totalHappiness = 0;
  let totalXp = 0;
  let totalCombo = 0;
  let highestLevel = pet.highest_level || 0;
  let songCount = 0;
  let trickDemandMet = false;

  if (Array.isArray(playsOrCount)) {
    const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
    for (const play of playsOrCount) {
      const score = parseInt(play.score, 10) || 0;
      const rawGrade = normalizeGrade(play.grade) || (score > 0 ? gradeFromScore(score) : 'F');
      const level = parseInt(play.level, 10) || 0;
      if (level > highestLevel) highestLevel = level;
      const feed = GRADE_FEED_TABLE[rawGrade] || GRADE_FEED_TABLE['F'];
      totalHunger += feed.hunger;
      totalHappiness += feed.happiness;
      totalXp += feed.xp + levelXpBonus(level);
      totalCombo += (GRADE_COMBO[rawGrade] || 0) + levelComboBonus(level);
      songCount++;
      if (pet.pending_trick && !trickDemandMet) {
        const minIdx = gradeOrder.indexOf(pet.trick_demand_grade || 'A');
        if (level >= (pet.trick_demand_level || 0) && gradeOrder.indexOf(rawGrade) >= minIdx) {
          trickDemandMet = true;
        }
      }
    }
  } else {
    songCount = Math.max(1, Math.min(10, parseInt(playsOrCount, 10) || 1));
    totalHunger = songCount * 2;
    totalHappiness = songCount * 1;
    totalXp = songCount * 5;
    totalCombo = songCount * 2;
  }

  const curHunger = computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const curHappiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const newHunger = clamp(curHunger + totalHunger, 0, MAX_STAT);
  let newHappiness = clamp(curHappiness + totalHappiness, 0, MAX_STAT);

  if (trickDemandMet) {
    const charTricks = TRICKS[pet.character] || [];
    const trick = charTricks.find(t => t.id === pet.pending_trick);
    const bonusCombo = trick?.comboReward || 10;
    const bonusHappy = trick?.happinessReward || 5;
    newHappiness = clamp(newHappiness + bonusHappy, 0, MAX_STAT);
    db.prepare(`
      UPDATE user_pets
      SET fullness = ?, happiness = ?, total_songs_fed = total_songs_fed + ?,
          experience = experience + ?, combo_balance = combo_balance + ?,
          highest_level = MAX(highest_level, ?),
          last_fed_at = datetime('now'), updated_at = datetime('now'),
          last_trick_performed = pending_trick, last_trick_at = datetime('now'),
          pending_trick = '', trick_demand_level = 0, trick_demand_grade = '', trick_demand_expires = ''
      WHERE user_id = ?
    `).run(newHunger, newHappiness, songCount, totalXp + 25, totalCombo + bonusCombo, highestLevel, userId);
  } else {
    db.prepare(`
      UPDATE user_pets
      SET fullness = ?, happiness = ?, total_songs_fed = total_songs_fed + ?,
          experience = experience + ?, combo_balance = combo_balance + ?,
          highest_level = MAX(highest_level, ?),
          last_fed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(newHunger, newHappiness, songCount, totalXp, totalCombo, highestLevel, userId);
  }

  return { fed: songCount, hunger: totalHunger, happiness: totalHappiness, xp: totalXp, combo: totalCombo, trickDemandMet };
};

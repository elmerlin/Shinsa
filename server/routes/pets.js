const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { normalizeGrade, gradeFromScore } = require('../lib/titleProgress');

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────
const VALID_CHARACTERS = ['dojocat', 'buu', 'devit', 'pixiu'];
const MAX_STAT = 100;
const TARGET_WEEKLY_SONGS = 75;
const TARGET_WEEKLY_HUNGER_UPKEEP = 76;
const TARGET_WEEKLY_HAPPINESS_UPKEEP = 48;
const HUNGER_DECAY_PER_HOUR = TARGET_WEEKLY_HUNGER_UPKEEP / (7 * 24);
const HAPPINESS_DECAY_PER_HOUR = TARGET_WEEKLY_HAPPINESS_UPKEEP / (7 * 24);
const ENERGY_DECAY_PER_HOUR = 22 / (7 * 24);
const HYPE_DECAY_PER_HOUR = 90 / (7 * 24);
const PET_ECONOMY = {
  target_songs_per_week: TARGET_WEEKLY_SONGS,
  weekly_hunger_upkeep: TARGET_WEEKLY_HUNGER_UPKEEP,
  weekly_happiness_upkeep: TARGET_WEEKLY_HAPPINESS_UPKEEP,
};
const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const GRADE_INDEX = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, index]));

// Combo earned per grade when syncing plays
const GRADE_COMBO = {
  'SSS+': 5, 'SSS': 5, 'SS+': 4, 'SS': 4, 'S+': 4, 'S': 3,
  'AAA+': 3, 'AAA': 3, 'AA+': 2, 'AA': 2, 'A+': 2, 'A': 1,
  'B': 1, 'C': 0, 'D': 0, 'F': 0,
};

// Playing keeps your pet engaged, but feeding should still require real upkeep.
const GRADE_FEED_TABLE = {
  'SSS+': { hunger: 1, happiness: 4, xp: 42 },
  'SSS':  { hunger: 1, happiness: 4, xp: 38 },
  'SS+':  { hunger: 1, happiness: 3, xp: 34 },
  'SS':   { hunger: 1, happiness: 3, xp: 30 },
  'S+':   { hunger: 1, happiness: 2, xp: 26 },
  'S':    { hunger: 1, happiness: 2, xp: 23 },
  'AAA+': { hunger: 0, happiness: 2, xp: 19 },
  'AAA':  { hunger: 0, happiness: 2, xp: 16 },
  'AA+':  { hunger: 0, happiness: 1, xp: 13 },
  'AA':   { hunger: 0, happiness: 1, xp: 11 },
  'A+':   { hunger: 0, happiness: 1, xp: 9 },
  'A':    { hunger: 0, happiness: 1, xp: 7 },
  'B':    { hunger: 0, happiness: 0, xp: 4 },
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
  if (level >= 25) return 3;
  if (level >= 22) return 2;
  if (level >= 19) return 1;
  if (level >= 16) return 1;
  return 0;
}

// ─── Pet Food ─────────────────────────────────────────────────────
const PET_FOODS = [
  { id: 'pump-chow', name: 'Pump Chow', cost: 22, hunger: 7, happiness: 1, emoji: '🥩', desc: 'Basic upkeep kibble for hungry stompers' },
  { id: 'beat-bites', name: 'Beat Bites', cost: 28, hunger: 6, happiness: 5, emoji: '🍪', desc: 'Crunchy snacks that cheer them up' },
  { id: 'slam-grub', name: 'Slam Grub', cost: 36, hunger: 11, happiness: 2, emoji: '🍖', desc: 'A proper meal after a hard set' },
  { id: 'step-fuel', name: 'Step Fuel', cost: 42, hunger: 13, happiness: 4, emoji: '⚡', desc: 'Reliable energy with a little spark' },
  { id: 'rhythm-rations', name: 'Rhythm Rations', cost: 26, hunger: 5, happiness: 7, emoji: '🎵', desc: 'Lighter food with a happiness boost' },
  { id: 'gargoyle-munch', name: 'Gargoyle Munch', cost: 52, hunger: 16, happiness: 2, emoji: '👹', desc: 'Dense feed for serious recovery' },
  { id: 'pad-power', name: 'Pad Power', cost: 68, hunger: 21, happiness: 8, emoji: '💪', desc: 'Premium fuel for well-loved pets' },
  { id: 'dance-dust', name: 'Dance Dust', cost: 18, hunger: 3, happiness: 10, emoji: '✨', desc: 'Not filling, but impossible not to love' },
  { id: 'doof-bites', name: 'Doof Bites', cost: 32, hunger: 9, happiness: 6, emoji: '🔥', desc: 'Spicy bites with extra personality' },
  { id: 'adrenaline-chow', name: 'Adrenaline Chow', cost: 82, hunger: 25, happiness: 10, emoji: '🚀', desc: 'Expensive, but it keeps them thriving' },
  { id: 'banya-biscuits', name: 'Banya Biscuits', cost: 94, hunger: 24, happiness: 16, emoji: '🏆', desc: 'Legendary treats for pampered champions' },
];
const PET_FOODS_MAP = Object.fromEntries(PET_FOODS.map(f => [f.id, f]));

const CHARACTER_PROFILES = {
  dojocat: {
    title: 'Proud training companion',
    personality: 'Disciplined, proud, and quietly affectionate once trust is earned.',
    favorite_foods: ['pump-chow', 'step-fuel', 'banya-biscuits'],
    disliked_foods: ['dance-dust'],
    interaction_lines: {
      praise: ['Acceptable form.', 'That was disciplined.', 'You noticed. Good.'],
      cuddle: ['A brief headbutt.', 'Only for a moment.', '*tiny purr*'],
      tease: ['Watch it.', 'Do not test the dojo mascot.', 'Hmph.'],
      mission: ['Train with intent today.', 'Bring me a clean clear.', 'We should sharpen our form.'],
      tap: ['Eyes up, stance strong.', 'Ready when you are.', '*whiskers twitch*'],
    },
  },
  buu: {
    title: 'Indulgent rhythm goblin',
    personality: 'Smug, food-motivated, and happiest when showing off.',
    favorite_foods: ['beat-bites', 'dance-dust', 'doof-bites'],
    disliked_foods: ['pump-chow'],
    interaction_lines: {
      praise: ['Of course I was amazing.', 'Tell me more.', 'Hehe, keep going.'],
      cuddle: ['Mmm, cozy.', 'I will allow this.', 'Soft pats accepted.'],
      tease: ['Rude. Funny, but rude.', 'You wish you looked this good.', 'Hehehe.'],
      mission: ['Let us make today delicious.', 'Bring me something flashy.', 'A replay would look good on us.'],
      tap: ['Hehehe.', 'Admiring me again?', 'I am listening.'],
    },
  },
  devit: {
    title: 'Chaotic step gremlin',
    personality: 'Playful, restless, and always trying to turn training into mischief.',
    favorite_foods: ['doof-bites', 'adrenaline-chow', 'slam-grub'],
    disliked_foods: ['rhythm-rations'],
    interaction_lines: {
      praise: ['Again, again!', 'That ruled.', 'Did you see me hop?'],
      cuddle: ['Only if we wrestle after.', 'Quick hug, then zoomies.', 'Fine, but make it fast.'],
      tease: ['Catch me first.', 'Heh. Try harder.', 'That just made me stronger.'],
      mission: ['Let us cause a little trouble.', 'I want doubles chaos.', 'Bring me something hard.'],
      tap: ['Heh.', 'Ready to dash.', 'Do it again.'],
    },
  },
  pixiu: {
    title: 'Ceremonial luck guardian',
    personality: 'Warm, auspicious, and protective, with a taste for elegant rituals.',
    favorite_foods: ['rhythm-rations', 'banya-biscuits', 'pad-power'],
    disliked_foods: ['doof-bites'],
    interaction_lines: {
      praise: ['Fortune smiles on discipline.', 'A graceful effort.', 'I am pleased.'],
      cuddle: ['A warm blessing for you.', 'Stay a while.', 'Such a gentle moment.'],
      tease: ['I choose mercy.', 'Mischief clouds the spirit.', '*tiny amused snort*'],
      mission: ['Let us seek a worthy clear.', 'A ceremonial challenge awaits.', 'We should honour today with good play.'],
      tap: ['Auspicious timing.', 'I am here.', 'Let us see what today brings.'],
    },
  },
};

const PET_INTERACTIONS = {
  praise: { label: 'Praise', bond: 4, trust: 4, happiness: 4, hype: 3, energy: 0, expression: 'proud', reaction: 'proud' },
  cuddle: { label: 'Cuddle', bond: 5, trust: 3, happiness: 5, hype: 0, energy: 1, expression: 'soft', reaction: 'sway' },
  tease: { label: 'Tease', bond: 1, trust: -2, happiness: -1, hype: 6, energy: 0, expression: 'smirk', reaction: 'mischief' },
  mission: { label: 'Ask Mission', bond: 2, trust: 2, happiness: 1, hype: 2, energy: 0, expression: 'sparkle', reaction: 'nod' },
  tap: { label: 'Tap', bond: 1, trust: 1, happiness: 2, hype: 1, energy: 0, expression: '', reaction: '' },
};

const PET_ACTIVITIES = {
  train: {
    id: 'train', label: 'Train', desc: 'Sharpens discipline and trust.',
    energy: -16, happiness: 3, trust: 5, hype: 5, bond: 5, combo: 6, bond_tokens: 1, expression: 'proud', reaction: 'kata',
  },
  play: {
    id: 'play', label: 'Play', desc: 'Pure bonding and playful chaos.',
    energy: -10, happiness: 7, trust: 2, hype: 8, bond: 4, combo: 4, bond_tokens: 0, expression: 'grin', reaction: 'hop',
  },
  groom: {
    id: 'groom', label: 'Groom', desc: 'Raises trust and keeps them feeling special.',
    energy: -4, happiness: 8, trust: 6, hype: 1, bond: 3, combo: 0, bond_tokens: 1, expression: 'soft', reaction: 'bless',
  },
  rest: {
    id: 'rest', label: 'Rest', desc: 'Recovers energy and settles their mood.',
    energy: 22, happiness: 2, trust: 1, hype: -4, bond: 2, combo: 0, bond_tokens: 0, expression: 'soft', reaction: 'sway',
  },
  spar: {
    id: 'spar', label: 'Spar', desc: 'Higher-risk bonding for confident pairs.',
    energy: -18, happiness: 4, trust: 7, hype: 10, bond: 6, combo: 10, bond_tokens: 1, expression: 'excited', reaction: 'dart',
    minTrust: 35,
  },
  explore: {
    id: 'explore', label: 'Explore', desc: 'Search for stories, keepsakes, and scene energy.',
    energy: -14, happiness: 5, trust: 3, hype: 7, bond: 4, combo: 8, bond_tokens: 2, rare_shards: 1, expression: 'sparkle', reaction: 'swish',
    minEnergy: 18,
  },
};

const PET_TOYS = [
  {
    id: 'mini-pad',
    name: 'Mini Pad',
    cost: 64,
    desc: 'A tiny practice stage for proud little performances.',
    bond: 5,
    trust: 2,
    happiness: 6,
    energy: -8,
    hype: 7,
    bond_tokens: 1,
    expression: 'excited',
    reaction: 'hop',
    favored: ['dojocat', 'devit'],
  },
  {
    id: 'laser-pointer',
    name: 'Laser Pointer',
    cost: 56,
    desc: 'Turns idle paws into full chibi chase mode.',
    bond: 4,
    trust: 1,
    happiness: 8,
    energy: -6,
    hype: 9,
    expression: 'grin',
    reaction: 'dart',
    favored: ['dojocat', 'buu', 'devit'],
  },
  {
    id: 'lucky-lantern',
    name: 'Lucky Lantern',
    cost: 72,
    desc: 'A ceremonial toy that fills the habitat with soft glow.',
    bond: 6,
    trust: 4,
    happiness: 5,
    energy: -4,
    hype: 5,
    bond_tokens: 1,
    expression: 'sparkle',
    reaction: 'bless',
    favored: ['pixiu', 'dojocat'],
  },
  {
    id: 'punch-mitts',
    name: 'Punch Mitts',
    cost: 78,
    desc: 'Training mitts for fierce little sparring drills.',
    bond: 6,
    trust: 5,
    happiness: 4,
    energy: -10,
    hype: 8,
    combo_balance: 8,
    expression: 'proud',
    reaction: 'kata',
    favored: ['dojocat', 'devit'],
  },
];
const PET_TOY_MAP = Object.fromEntries(PET_TOYS.map((toy) => [toy.id, toy]));

const HABITAT_ITEMS = {
  backgrounds: [
    { id: 'dojo-night', name: 'Dojo Night', cost: 90, kind: 'background', desc: 'Blue-lit training hall energy.', default_owned: true },
    { id: 'sunset-arcade', name: 'Sunset Arcade', cost: 120, kind: 'background', desc: 'Warm neon after-hours arcade glow.' },
    { id: 'moon-festival', name: 'Moon Festival', cost: 140, kind: 'background', desc: 'Ceremonial lantern light for calmer moods.' },
    { id: 'inferno-stage', name: 'Inferno Stage', cost: 150, kind: 'background', desc: 'A dramatic red arena for wilder pets.' },
  ],
  props: [
    { id: 'training-dummy', name: 'Training Dummy', cost: 70, kind: 'prop', desc: 'A sparring buddy for focused companions.' },
    { id: 'lucky-banner', name: 'Lucky Banner', cost: 82, kind: 'prop', desc: 'A hanging charm that brings festive energy.' },
    { id: 'boombox', name: 'Boombox', cost: 88, kind: 'prop', desc: 'A chunky little speaker stack for practice sessions.' },
    { id: 'trophy-stand', name: 'Trophy Stand', cost: 110, kind: 'prop', desc: 'A pedestal for pets who know they are stars.' },
  ],
};
const ALL_HABITAT_ITEMS = [...HABITAT_ITEMS.backgrounds, ...HABITAT_ITEMS.props];
const HABITAT_ITEM_MAP = Object.fromEntries(ALL_HABITAT_ITEMS.map((item) => [item.id, item]));

function getHabitatSlot(itemId) {
  if (HABITAT_ITEMS.backgrounds.find((item) => item.id === itemId)) return 'background';
  if (HABITAT_ITEMS.props.find((item) => item.id === itemId)) return 'prop';
  return null;
}

const BOND_RANKS = [
  { threshold: 0, key: 'training-partner', label: 'Training Partner' },
  { threshold: 40, key: 'pad-gremlin', label: 'Pad Gremlin' },
  { threshold: 90, key: 'dojo-mascot', label: 'Dojo Mascot' },
  { threshold: 160, key: 'arena-spirit', label: 'Arena Spirit' },
  { threshold: 260, key: 'blessed-beast', label: 'Blessed Beast' },
];

// ─── Clothing ─────────────────────────────────────────────────────
const CLOTHING = {
  hats: [
    { id: 'chicken-hat', name: 'Chicken Hat', cost: 50, defaultColor: '#FFEB3B' },
    { id: 'headband', name: 'Headband', cost: 20, defaultColor: '#E53935' },
    { id: 'crown', name: 'Crown', cost: 100, defaultColor: '#FFD700' },
    { id: 'beanie', name: 'Beanie', cost: 30, defaultColor: '#607D8B' },
    { id: 'wizard-hat', name: 'Wizard Hat', cost: 75, defaultColor: '#7B1FA2' },
    { id: 'party-hat', name: 'Party Hat', cost: 15, defaultColor: '#FF4081' },
    { id: 'astronaut-helmet', name: 'Astronaut Helmet', cost: 120, defaultColor: '#CFD8DC' },
    { id: 'goggles', name: 'Lab Goggles', cost: 35, defaultColor: '#4FC3F7' },
    { id: 'cat-hoodie', name: 'Cat Hoodie', cost: 60, defaultColor: '#FFEB3B' },
    { id: 'ranger-helmet', name: 'Ranger Helmet', cost: 90, defaultColor: '#E53935' },
    { id: 'santa-hat', name: 'Santa Hat', cost: 40, defaultColor: '#E53935' },
  ],
  tops: [
    { id: 'denim-jacket', name: 'STOMP Jacket', cost: 60, defaultColor: '#42649f' },
    { id: 'leather-jacket', name: 'Leather Jacket', cost: 70, defaultColor: '#1a1a1a' },
    { id: 'lab-coat', name: 'Lab Coat', cost: 55, defaultColor: '#f5f5f5' },
    { id: 'sailor-shirt', name: 'Sailor Shirt', cost: 40, defaultColor: '#f5f5f5' },
    { id: 'dress', name: 'Dress', cost: 45, defaultColor: '#F48FB1' },
    { id: 'hoodie', name: 'Hoodie', cost: 35, defaultColor: '#90CAF9' },
    { id: 'camo-vest', name: 'Camo Vest', cost: 50, defaultColor: '#6b8e4e' },
    { id: 'power-suit', name: 'Power Suit', cost: 100, defaultColor: '#E53935' },
    { id: 'traditional-robe', name: 'Traditional Robe', cost: 80, defaultColor: '#E91E63' },
  ],
  belts: [
    { id: 'stomp-belt', name: 'Stomp Belt', cost: 40, defaultColor: '#1A1A2E' },
    { id: 'chain-belt', name: 'Chain Belt', cost: 35, defaultColor: '#B0BEC5' },
    { id: 'medal-chain', name: 'Medal Chain', cost: 55, defaultColor: '#FFD700' },
    { id: 'ribbon', name: 'Ribbon', cost: 15, defaultColor: '#F06292' },
    { id: 'sash', name: 'Champion Sash', cost: 60, defaultColor: '#FFD700' },
    { id: 'utility-belt', name: 'Utility Belt', cost: 45, defaultColor: '#5D4037' },
  ],
  shoes: [
    { id: 'sneakers', name: 'Sneakers', cost: 25, defaultColor: '#FFFFFF' },
    { id: 'boots', name: 'Boots', cost: 45, defaultColor: '#5D4037' },
    { id: 'sandals', name: 'Sandals', cost: 10, defaultColor: '#8D6E63' },
    { id: 'dance-shoes', name: 'Dance Shoes', cost: 55, defaultColor: '#E53935' },
    { id: 'power-boots', name: 'Power Boots', cost: 65, defaultColor: '#E53935' },
    { id: 'cat-slippers', name: 'Cat Slippers', cost: 30, defaultColor: '#FFEB3B' },
  ],
};
const ALL_CLOTHING = [...CLOTHING.hats, ...(CLOTHING.tops || []), ...CLOTHING.belts, ...CLOTHING.shoes];
const CLOTHING_MAP = Object.fromEntries(ALL_CLOTHING.map(c => [c.id, c]));
function getClothingSlot(itemId) {
  if (CLOTHING.hats.find(h => h.id === itemId)) return 'hat';
  if (CLOTHING.tops && CLOTHING.tops.find(t => t.id === itemId)) return 'top';
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
  addCol('equipped_top', "TEXT NOT NULL DEFAULT ''");
  addCol('hat_color', "TEXT NOT NULL DEFAULT ''");
  addCol('belt_color', "TEXT NOT NULL DEFAULT ''");
  addCol('shoes_color', "TEXT NOT NULL DEFAULT ''");
  addCol('top_color', "TEXT NOT NULL DEFAULT ''");
  addCol('is_pet_avatar', "INTEGER NOT NULL DEFAULT 0");
  addCol('bond', "INTEGER NOT NULL DEFAULT 0");
  addCol('energy', "INTEGER NOT NULL DEFAULT 65");
  addCol('trust', "INTEGER NOT NULL DEFAULT 35");
  addCol('hype', "INTEGER NOT NULL DEFAULT 25");
  addCol('bond_tokens', "INTEGER NOT NULL DEFAULT 0");
  addCol('rare_shards', "INTEGER NOT NULL DEFAULT 0");
  addCol('interaction_count', "INTEGER NOT NULL DEFAULT 0");
  addCol('daily_interaction_count', "INTEGER NOT NULL DEFAULT 0");
  addCol('daily_interaction_key', "TEXT NOT NULL DEFAULT ''");
  addCol('claimed_missions', "TEXT NOT NULL DEFAULT '[]'");
  addCol('last_food_id', "TEXT NOT NULL DEFAULT ''");
  addCol('last_food_at', "TEXT NOT NULL DEFAULT ''");
  addCol('owned_toys', "TEXT NOT NULL DEFAULT '[]'");
  addCol('last_toy_id', "TEXT NOT NULL DEFAULT ''");
  addCol('last_toy_at', "TEXT NOT NULL DEFAULT ''");
  addCol('owned_habitat_items', "TEXT NOT NULL DEFAULT '[\"dojo-night\"]'");
  addCol('active_habitat_bg', "TEXT NOT NULL DEFAULT 'dojo-night'");
  addCol('active_habitat_prop', "TEXT NOT NULL DEFAULT ''");
}

// ─── Helpers ──────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function toSqliteDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getUtcDayKey(date = new Date()) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function getUtcWeekKey(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy.toISOString().slice(0, 10);
}

function computeDecayed(storedValue, lastFedAt, decayPerHour) {
  if (!lastFedAt) return storedValue;
  const lastFed = new Date(lastFedAt + 'Z').getTime();
  const hoursSince = Math.max(0, (Date.now() - lastFed) / (1000 * 60 * 60));
  return clamp(Math.round(storedValue - hoursSince * decayPerHour), 0, MAX_STAT);
}

function getStateValue(storedValue, lastAt, decayPerHour) {
  return computeDecayed(storedValue, lastAt, decayPerHour);
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

function getBondRank(bond = 0) {
  let current = BOND_RANKS[0];
  let next = null;
  for (let i = 0; i < BOND_RANKS.length; i++) {
    const rank = BOND_RANKS[i];
    if (bond >= rank.threshold) {
      current = rank;
      next = BOND_RANKS[i + 1] || null;
    }
  }
  return {
    ...current,
    progress: next
      ? clamp((bond - current.threshold) / Math.max(1, next.threshold - current.threshold), 0, 1)
      : 1,
    next_label: next?.label || '',
    next_threshold: next?.threshold || current.threshold,
  };
}

function getCharacterProfile(character = 'dojocat') {
  return CHARACTER_PROFILES[character] || CHARACTER_PROFILES.dojocat;
}

function getFoodPreference(character, foodId) {
  const profile = getCharacterProfile(character);
  if (profile.favorite_foods.includes(foodId)) return 'favorite';
  if (profile.disliked_foods.includes(foodId)) return 'disliked';
  return 'neutral';
}

function pickRandom(list, fallback = '') {
  if (!Array.isArray(list) || !list.length) return fallback;
  return list[Math.floor(Math.random() * list.length)] || fallback;
}

function getToyPreference(character, toy) {
  if (!toy) return 'neutral';
  return Array.isArray(toy.favored) && toy.favored.includes(character) ? 'favorite' : 'neutral';
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

function queryPlayActivitySummary(db, userId) {
  const base = db.prepare(`
    SELECT
      COUNT(*) AS plays_all,
      MAX(level) AS max_level_all,
      SUM(CASE WHEN mode LIKE 'Double%' THEN 1 ELSE 0 END) AS doubles_all,
      SUM(CASE WHEN (replay_embed_url != '' OR replay_video_id != '') THEN 1 ELSE 0 END) AS replays_all
    FROM user_recently_played
    WHERE user_id = ?
  `).get(userId) || {};

  const recent7d = db.prepare(`
    SELECT
      COUNT(*) AS plays_7d,
      COUNT(DISTINCT song_title || '|' || mode || '|' || level) AS unique_7d,
      SUM(CASE WHEN mode LIKE 'Double%' THEN 1 ELSE 0 END) AS doubles_7d,
      SUM(CASE WHEN level >= 18 THEN 1 ELSE 0 END) AS hard_7d,
      SUM(CASE WHEN (replay_embed_url != '' OR replay_video_id != '') THEN 1 ELSE 0 END) AS replays_7d,
      SUM(CASE WHEN COALESCE(NULLIF(grade, ''), CASE WHEN score >= 995000 THEN 'SSS' WHEN score >= 980000 THEN 'SS' WHEN score >= 960000 THEN 'S' WHEN score >= 930000 THEN 'AAA' WHEN score >= 900000 THEN 'AA' WHEN score >= 850000 THEN 'A' WHEN score > 0 THEN 'B' ELSE 'F' END) IN ('AAA+', 'AAA', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+') THEN 1 ELSE 0 END) AS high_grades_7d
    FROM user_recently_played
    WHERE user_id = ?
      AND COALESCE(NULLIF(played_at_utc, ''), date_played) >= datetime('now', '-7 days')
  `).get(userId) || {};

  const today = db.prepare(`
    SELECT
      COUNT(*) AS plays_today,
      COUNT(DISTINCT song_title || '|' || mode || '|' || level) AS unique_today,
      SUM(CASE WHEN mode LIKE 'Double%' THEN 1 ELSE 0 END) AS doubles_today,
      SUM(CASE WHEN (replay_embed_url != '' OR replay_video_id != '') THEN 1 ELSE 0 END) AS replays_today,
      SUM(CASE WHEN COALESCE(NULLIF(grade, ''), CASE WHEN score >= 995000 THEN 'SSS' WHEN score >= 980000 THEN 'SS' WHEN score >= 960000 THEN 'S' WHEN score >= 930000 THEN 'AAA' WHEN score >= 900000 THEN 'AA' WHEN score >= 850000 THEN 'A' WHEN score > 0 THEN 'B' ELSE 'F' END) IN ('AAA+', 'AAA', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+') THEN 1 ELSE 0 END) AS high_grades_today
    FROM user_recently_played
    WHERE user_id = ?
      AND COALESCE(NULLIF(played_at_utc, ''), date_played) >= datetime('now', 'start of day')
  `).get(userId) || {};

  const newChartsToday = db.prepare(`
    SELECT COUNT(*) AS new_charts_today
    FROM (
      SELECT rp.song_title, rp.mode, rp.level
      FROM user_recently_played rp
      WHERE rp.user_id = ?
        AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) >= datetime('now', 'start of day')
      GROUP BY rp.song_title, rp.mode, rp.level
      HAVING NOT EXISTS (
        SELECT 1
        FROM user_recently_played older
        WHERE older.user_id = rp.user_id
          AND older.song_title = rp.song_title
          AND older.mode = rp.mode
          AND older.level = rp.level
          AND COALESCE(NULLIF(older.played_at_utc, ''), older.date_played) < datetime('now', 'start of day')
      )
    )
  `).get(userId) || {};

  const hop = db.prepare(`
    SELECT COUNT(DISTINCT lsp.live_session_id) AS hop_sessions_7d
    FROM live_session_plays lsp
    JOIN live_sessions ls ON ls.id = lsp.live_session_id
    WHERE lsp.user_id = ?
      AND ls.session_type = 'hop'
      AND COALESCE(NULLIF(lsp.played_at_utc, ''), lsp.date_played, lsp.created_at) >= datetime('now', '-7 days')
  `).get(userId) || {};

  const weeklyChallenge = db.prepare(`
    SELECT COUNT(*) AS weekly_challenge_entries
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    JOIN weekly_challenge_weeks ww ON ww.id = wc.week_id
    WHERE r.user_id = ?
      AND ww.status = 'active'
      AND datetime('now') >= ww.starts_at_utc
      AND datetime('now') <= ww.ends_at_utc
  `).get(userId) || {};

  return {
    plays_all: base.plays_all || 0,
    max_level_all: base.max_level_all || 0,
    doubles_all: base.doubles_all || 0,
    replays_all: base.replays_all || 0,
    plays_7d: recent7d.plays_7d || 0,
    unique_7d: recent7d.unique_7d || 0,
    doubles_7d: recent7d.doubles_7d || 0,
    hard_7d: recent7d.hard_7d || 0,
    replays_7d: recent7d.replays_7d || 0,
    high_grades_7d: recent7d.high_grades_7d || 0,
    plays_today: today.plays_today || 0,
    unique_today: today.unique_today || 0,
    new_charts_today: newChartsToday.new_charts_today || 0,
    doubles_today: today.doubles_today || 0,
    replays_today: today.replays_today || 0,
    high_grades_today: today.high_grades_today || 0,
    hop_sessions_7d: hop.hop_sessions_7d || 0,
    weekly_challenge_entries: weeklyChallenge.weekly_challenge_entries || 0,
  };
}

function derivePetSpecialty(summary = {}) {
  if ((summary.doubles_7d || 0) >= 5 && (summary.doubles_7d || 0) >= ((summary.plays_7d || 0) * 0.4)) {
    return { key: 'double-grinder', label: 'Double grinder', desc: 'Your pet is leaning into doubles stamina and footwork.' };
  }
  if ((summary.high_grades_7d || 0) >= 6) {
    return { key: 'accuracy-fiend', label: 'Accuracy fiend', desc: 'Clean timing and tidy clears are shaping this pet.' };
  }
  if ((summary.hard_7d || 0) >= 5) {
    return { key: 'stamina-hound', label: 'Stamina hound', desc: 'Big clears are making your pet tougher and prouder.' };
  }
  if ((summary.replays_7d || 0) >= 2) {
    return { key: 'scene-showoff', label: 'Scene showoff', desc: 'Replay-ready moments are feeding this pet’s confidence.' };
  }
  if ((summary.hop_sessions_7d || 0) >= 1) {
    return { key: 'hop-regular', label: 'HoP regular', desc: 'Hour of Power energy is making this pet thrive.' };
  }
  return { key: 'all-rounder', label: 'All-rounder', desc: 'A balanced companion still figuring out its calling.' };
}

function buildPetMemories(pet, summary = {}) {
  const memories = [];
  if (pet.created_at) {
    memories.push({
      id: 'adopted',
      title: 'Bond began',
      detail: `Adopted on ${String(pet.created_at).slice(0, 10)}`,
      tone: 'bond',
    });
  }
  if ((summary.max_level_all || 0) > 0) {
    memories.push({
      id: 'max-level',
      title: 'Biggest clear watched',
      detail: `Level ${summary.max_level_all} is the highest chart your pet has seen you conquer.`,
      tone: 'level',
    });
  }
  if ((summary.replays_all || 0) > 0) {
    memories.push({
      id: 'replays',
      title: 'Replay memory',
      detail: `${summary.replays_all} replay-ready ${summary.replays_all === 1 ? 'moment' : 'moments'} recorded together.`,
      tone: 'replay',
    });
  }
  if ((summary.hop_sessions_7d || 0) > 0) {
    memories.push({
      id: 'hop',
      title: 'Hour of Power spark',
      detail: `Shared ${summary.hop_sessions_7d} HoP ${summary.hop_sessions_7d === 1 ? 'session' : 'sessions'} in the last week.`,
      tone: 'hop',
    });
  }
  if ((summary.weekly_challenge_entries || 0) > 0) {
    memories.push({
      id: 'weekly',
      title: 'Weekly challenger',
      detail: `Active in this week’s weekly challenge board.`,
      tone: 'challenge',
    });
  }
  const specialty = derivePetSpecialty(summary);
  memories.push({
    id: 'specialty',
    title: specialty.label,
    detail: specialty.desc,
    tone: 'specialty',
  });
  return memories.slice(0, 5);
}

const PET_MISSIONS = {
  feed_today: {
    cadence: 'daily',
    label: 'Care routine',
    desc: 'Feed your pet at least once today.',
    target: 1,
    progress: ({ fed_today }) => fed_today ? 1 : 0,
    reward: { bond: 6, bond_tokens: 1, happiness: 4 },
  },
  interact_three: {
    cadence: 'daily',
    label: 'Quality time',
    desc: 'Interact with your pet three times today.',
    target: 3,
    progress: ({ interactions_today }) => interactions_today || 0,
    reward: { bond: 8, trust: 4, bond_tokens: 1 },
  },
  aaa_pair: {
    cadence: 'daily',
    label: 'Clean timing',
    desc: 'Hit two AAA-or-better plays today.',
    target: 2,
    progress: ({ high_grades_today }) => high_grades_today || 0,
    reward: { bond: 10, combo_balance: 16, hype: 8 },
  },
  replay_today: {
    cadence: 'daily',
    label: 'Capture the moment',
    desc: 'Record one replay-enabled score today.',
    target: 1,
    progress: ({ replays_today }) => replays_today || 0,
    reward: { bond: 8, combo_balance: 14, hype: 10 },
  },
  new_chart_today: {
    cadence: 'daily',
    label: 'Fresh chart',
    desc: 'Play a new chart today.',
    target: 1,
    progress: ({ new_charts_today }) => new_charts_today || 0,
    reward: { bond: 7, trust: 2, hype: 5 },
  },
  double_today: {
    cadence: 'daily',
    label: 'Double trouble',
    desc: 'Play one doubles chart today.',
    target: 1,
    progress: ({ doubles_today }) => doubles_today || 0,
    reward: { bond: 7, hype: 7, combo_balance: 12 },
  },
  hard_clear_week: {
    cadence: 'weekly',
    label: 'Heavy set',
    desc: 'Clear three level 18+ charts this week.',
    target: 3,
    progress: ({ hard_7d }) => hard_7d || 0,
    reward: { bond: 14, trust: 8, combo_balance: 24, bond_tokens: 2 },
  },
  double_week: {
    cadence: 'weekly',
    label: 'Doubles grind',
    desc: 'Play five doubles charts this week.',
    target: 5,
    progress: ({ doubles_7d }) => doubles_7d || 0,
    reward: { bond: 14, hype: 10, combo_balance: 24, bond_tokens: 2 },
  },
  replay_week: {
    cadence: 'weekly',
    label: 'Scene presence',
    desc: 'Land three replay-enabled plays this week.',
    target: 3,
    progress: ({ replays_7d }) => replays_7d || 0,
    reward: { bond: 16, hype: 12, combo_balance: 28, bond_tokens: 2 },
  },
  hop_run: {
    cadence: 'weekly',
    label: 'Hour of Power',
    desc: 'Join one Hour of Power session this week.',
    target: 1,
    progress: ({ hop_sessions_7d }) => hop_sessions_7d || 0,
    reward: { bond: 16, trust: 6, combo_balance: 24, rare_shards: 1 },
  },
  weekly_challenge_entry: {
    cadence: 'weekly',
    label: 'Weekly challenger',
    desc: 'Log at least one current weekly challenge result.',
    target: 1,
    progress: ({ weekly_challenge_entries }) => weekly_challenge_entries || 0,
    reward: { bond: 12, trust: 5, combo_balance: 20, bond_tokens: 2 },
  },
};

const PET_MISSIONS_BY_CHARACTER = {
  dojocat: ['feed_today', 'aaa_pair', 'hard_clear_week', 'weekly_challenge_entry'],
  buu: ['feed_today', 'replay_today', 'replay_week', 'hop_run'],
  devit: ['interact_three', 'double_today', 'double_week', 'hard_clear_week'],
  pixiu: ['feed_today', 'new_chart_today', 'hop_run', 'weekly_challenge_entry'],
};

function buildPetMissions(pet, summary = {}) {
  const claimed = new Set(safeJsonParse(pet.claimed_missions));
  const missionIds = PET_MISSIONS_BY_CHARACTER[pet.character] || PET_MISSIONS_BY_CHARACTER.dojocat;
  return missionIds.map((id) => {
    const mission = PET_MISSIONS[id];
    const windowKey = mission.cadence === 'daily' ? getUtcDayKey() : getUtcWeekKey();
    const claimKey = `${id}:${windowKey}`;
    const progress = mission.progress(summary, pet);
    const complete = progress >= mission.target;
    return {
      id,
      cadence: mission.cadence,
      label: mission.label,
      desc: mission.desc,
      target: mission.target,
      progress: Math.min(mission.target, progress),
      complete,
      claimed: claimed.has(claimKey),
      claim_key: claimKey,
      reward: mission.reward,
      reward_summary: Object.entries(mission.reward)
        .map(([key, value]) => `${value} ${key.replace('_', ' ')}`)
        .join(' • '),
    };
  });
}

// ─── Format pet for API response ──────────────────────────────────
function formatPet(pet, isPublic = false, db = null) {
  const hunger = computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const happiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const energy = getStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, ENERGY_DECAY_PER_HOUR);
  const hype = getStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at, HYPE_DECAY_PER_HOUR);
  const xp = pet.experience || 0;
  const character = pet.character || 'dojocat';
  const charTricks = TRICKS[character] || [];
  const nextTrick = getNextTrick(character, xp);
  const profile = getCharacterProfile(character);
  const bond = pet.bond || 0;
  const trust = clamp(pet.trust || 35, 0, MAX_STAT);
  const bondRank = getBondRank(bond);
  const interactionsToday = pet.daily_interaction_key === getUtcDayKey() ? (pet.daily_interaction_count || 0) : 0;
  const activitySummary = db ? queryPlayActivitySummary(db, pet.user_id) : {};
  const specialty = derivePetSpecialty(activitySummary);
  const missions = buildPetMissions({ ...pet, character }, {
    ...activitySummary,
    fed_today: !!pet.last_food_at && String(pet.last_food_at).startsWith(getUtcDayKey()),
    interactions_today: interactionsToday,
  });
  const memories = buildPetMemories(pet, activitySummary);

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
    bond,
    bond_rank: bondRank,
    energy,
    trust,
    hype,
    total_songs_fed: pet.total_songs_fed,
    experience: xp,
    highest_level: pet.highest_level || 0,
    equipped_hat: pet.equipped_hat || '',
    equipped_belt: pet.equipped_belt || '',
    equipped_shoes: pet.equipped_shoes || '',
    equipped_top: pet.equipped_top || '',
    hat_color: pet.hat_color || '',
    belt_color: pet.belt_color || '',
    shoes_color: pet.shoes_color || '',
    top_color: pet.top_color || '',
    is_pet_avatar: pet.is_pet_avatar || 0,
    last_trick_performed: pet.last_trick_performed || '',
    last_trick_at: pet.last_trick_at || '',
    created_at: pet.created_at || '',
    specialty,
    personality: {
      title: profile.title,
      desc: profile.personality,
    },
    food_preferences: {
      favorites: profile.favorite_foods,
      dislikes: profile.disliked_foods,
      last_food_id: pet.last_food_id || '',
      last_food_at: pet.last_food_at || '',
    },
    last_toy_id: pet.last_toy_id || '',
    last_toy_at: pet.last_toy_at || '',
    habitat: {
      active_background: pet.active_habitat_bg || 'dojo-night',
      active_prop: pet.active_habitat_prop || '',
    },
  };

  if (isPublic) {
    return {
      ...base,
      memories: memories.slice(0, 2),
    };
  }

  return {
    ...base,
    combo_balance: pet.combo_balance || 0,
    bond_tokens: pet.bond_tokens || 0,
    rare_shards: pet.rare_shards || 0,
    owned_items: safeJsonParse(pet.owned_items),
    owned_toys: safeJsonParse(pet.owned_toys),
    owned_habitat_items: safeJsonParse(pet.owned_habitat_items),
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
    interactions_today: interactionsToday,
    interaction_count: pet.interaction_count || 0,
    activity_summary: activitySummary,
    activities: Object.values(PET_ACTIVITIES),
    toys: PET_TOYS.map((toy) => ({
      ...toy,
      owned: safeJsonParse(pet.owned_toys).includes(toy.id),
      preference: getToyPreference(character, toy),
    })),
    habitat_items: {
      backgrounds: HABITAT_ITEMS.backgrounds.map((item) => ({
        ...item,
        owned: safeJsonParse(pet.owned_habitat_items).includes(item.id),
        active: (pet.active_habitat_bg || 'dojo-night') === item.id,
      })),
      props: HABITAT_ITEMS.props.map((item) => ({
        ...item,
        owned: safeJsonParse(pet.owned_habitat_items).includes(item.id),
        active: (pet.active_habitat_prop || '') === item.id,
      })),
    },
    missions,
    memories,
  };
}

// ─── Routes ───────────────────────────────────────────────────────

// GET /api/pets/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.json({ pet: null, economy: PET_ECONOMY });
  res.json({ pet: formatPet(pet, false, db), economy: PET_ECONOMY });
});

// GET /api/pets/user/:userId — public pet view (for avatar modals)
router.get('/user/:userId', (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.params.userId);
  if (!pet) return res.json({ pet: null });
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.userId);
  res.json({ pet: formatPet(pet, true, db), username: user?.username || '' });
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
      bond = 0, energy = 65, trust = 35, hype = 25, bond_tokens = 0, rare_shards = 0,
      interaction_count = 0, daily_interaction_count = 0, daily_interaction_key = '',
      claimed_missions = '[]', last_food_id = '', last_food_at = '', owned_toys = '[]', last_toy_id = '', last_toy_at = '',
      tricks_unlocked = '[]', pending_trick = '', trick_demand_level = 0, trick_demand_grade = '',
      trick_demand_expires = '', last_trick_performed = '', last_trick_at = '',
      equipped_hat = '', equipped_belt = '', equipped_shoes = '', equipped_top = '',
      hat_color = '', belt_color = '', shoes_color = '', top_color = '',
      last_fed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(character, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO user_pets (
        user_id, character, fullness, happiness, total_songs_fed, experience,
        bond, energy, trust, hype, bond_tokens, rare_shards,
        daily_interaction_count, daily_interaction_key, claimed_missions, last_food_id, last_food_at, owned_toys, last_toy_id, last_toy_at,
        last_fed_at
      )
      VALUES (?, ?, 50, 50, 0, 0, 0, 65, 35, 25, 0, 0, 0, '', '[]', '', '', '[]', '', '', datetime('now'))
    `).run(req.user.id, character);
  }
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(pet, false, db) });
});

// GET /api/pets/shop — food + clothing catalog
router.get('/shop', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT combo_balance, owned_items, owned_toys, owned_habitat_items, active_habitat_bg, active_habitat_prop, character FROM user_pets WHERE user_id = ?').get(req.user.id);
  const owned = safeJsonParse(pet?.owned_items);
  const ownedToys = safeJsonParse(pet?.owned_toys);
  const ownedHabitat = safeJsonParse(pet?.owned_habitat_items, ['dojo-night']);
  res.json({
    combo_balance: pet?.combo_balance || 0,
    economy: PET_ECONOMY,
    foods: PET_FOODS.map((food) => ({
      ...food,
      preference: pet?.character ? getFoodPreference(pet.character, food.id) : 'neutral',
    })),
    clothing: {
      hats: CLOTHING.hats.map(c => ({ ...c, owned: owned.includes(c.id) })),
      tops: (CLOTHING.tops || []).map(c => ({ ...c, owned: owned.includes(c.id) })),
      belts: CLOTHING.belts.map(c => ({ ...c, owned: owned.includes(c.id) })),
      shoes: CLOTHING.shoes.map(c => ({ ...c, owned: owned.includes(c.id) })),
    },
    toys: PET_TOYS.map((toy) => ({
      ...toy,
      owned: ownedToys.includes(toy.id),
      preference: pet?.character ? getToyPreference(pet.character, toy) : 'neutral',
    })),
    habitat: {
      backgrounds: HABITAT_ITEMS.backgrounds.map((item) => ({
        ...item,
        owned: ownedHabitat.includes(item.id),
        active: (pet?.active_habitat_bg || 'dojo-night') === item.id,
      })),
      props: HABITAT_ITEMS.props.map((item) => ({
        ...item,
        owned: ownedHabitat.includes(item.id),
        active: (pet?.active_habitat_prop || '') === item.id,
      })),
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
  const energy = getStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, ENERGY_DECAY_PER_HOUR);
  const hype = getStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at, HYPE_DECAY_PER_HOUR);
  const preference = getFoodPreference(pet.character, food.id);
  const favoriteBonus = preference === 'favorite' ? { happiness: 4, bond: 5, trust: 2, energy: 5, hype: 4 } : null;
  const dislikedPenalty = preference === 'disliked' ? { happiness: -3, trust: -1, hype: -2 } : null;
  const newHunger = clamp(hunger + food.hunger, 0, MAX_STAT);
  const newHappiness = clamp(happiness + food.happiness + (favoriteBonus?.happiness || 0) + (dislikedPenalty?.happiness || 0), 0, MAX_STAT);
  const newEnergy = clamp(energy + Math.max(2, Math.floor(food.hunger / 2)) + (favoriteBonus?.energy || 0), 0, MAX_STAT);
  const newHype = clamp(hype + Math.max(0, Math.floor(food.happiness / 2)) + (favoriteBonus?.hype || 0) + (dislikedPenalty?.hype || 0), 0, MAX_STAT);
  const newBond = Math.max(0, (pet.bond || 0) + (favoriteBonus?.bond || 1));
  const newTrust = clamp((pet.trust || 35) + (favoriteBonus?.trust || 0) + (dislikedPenalty?.trust || 0), 0, MAX_STAT);
  const profile = getCharacterProfile(pet.character);
  const response = preference === 'favorite'
    ? `${food.name}! ${pickRandom(profile.interaction_lines.praise, 'That was perfect.')}`
    : preference === 'disliked'
      ? `${pickRandom(profile.interaction_lines.tease, 'Hmm.')} Maybe a different snack next time.`
      : `${pickRandom(profile.interaction_lines.cuddle, 'Mmm.')} ${food.name} hit the spot.`;

  db.prepare(`
    UPDATE user_pets
    SET fullness = ?, happiness = ?, energy = ?, hype = ?, bond = ?, trust = ?,
        combo_balance = combo_balance - ?, total_songs_fed = total_songs_fed + 1,
        last_food_id = ?, last_food_at = datetime('now'),
        last_fed_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newHunger, newHappiness, newEnergy, newHype, newBond, newTrust, food.cost, food.id, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({
    pet: formatPet(updated, false, db),
    food: food.name,
    food_preference: preference,
    pet_response: response,
  });
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
  res.json({ pet: formatPet(updated, false, db), item: item.name });
});

// POST /api/pets/buy-toy — buy a toy
router.post('/buy-toy', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const toy = PET_TOY_MAP[req.body.toyId];
  if (!toy) return res.status(400).json({ error: 'Unknown toy' });

  const ownedToys = safeJsonParse(pet.owned_toys);
  if (ownedToys.includes(toy.id)) return res.status(400).json({ error: 'Already owned' });

  const balance = pet.combo_balance || 0;
  if (balance < toy.cost) return res.status(400).json({ error: 'Not enough Combo', need: toy.cost, have: balance });

  ownedToys.push(toy.id);
  db.prepare(`
    UPDATE user_pets SET combo_balance = combo_balance - ?, owned_toys = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(toy.cost, JSON.stringify(ownedToys), req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db), toy: toy.name });
});

// POST /api/pets/buy-habitat-item — buy a room background or prop
router.post('/buy-habitat-item', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const item = HABITAT_ITEM_MAP[req.body.itemId];
  if (!item) return res.status(400).json({ error: 'Unknown habitat item' });

  const ownedHabitat = safeJsonParse(pet.owned_habitat_items, ['dojo-night']);
  if (ownedHabitat.includes(item.id)) return res.status(400).json({ error: 'Already owned' });

  const balance = pet.combo_balance || 0;
  if (balance < item.cost) return res.status(400).json({ error: 'Not enough Combo', need: item.cost, have: balance });

  ownedHabitat.push(item.id);
  db.prepare(`
    UPDATE user_pets SET combo_balance = combo_balance - ?, owned_habitat_items = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(item.cost, JSON.stringify(ownedHabitat), req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db), item: item.name });
});

// POST /api/pets/equip-habitat — set active room background or prop
router.post('/equip-habitat', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const { itemId = '', slot = '' } = req.body || {};
  const ownedHabitat = safeJsonParse(pet.owned_habitat_items, ['dojo-night']);

  if (itemId) {
    if (!ownedHabitat.includes(itemId)) return res.status(400).json({ error: 'Habitat item not owned' });
    const habitatSlot = getHabitatSlot(itemId);
    if (!habitatSlot) return res.status(400).json({ error: 'Unknown habitat item type' });
    const column = habitatSlot === 'background' ? 'active_habitat_bg' : 'active_habitat_prop';
    db.prepare(`UPDATE user_pets SET ${column} = ?, updated_at = datetime('now') WHERE user_id = ?`).run(itemId, req.user.id);
  } else {
    if (!['background', 'prop'].includes(slot)) return res.status(400).json({ error: 'Invalid habitat slot' });
    const column = slot === 'background' ? 'active_habitat_bg' : 'active_habitat_prop';
    const fallback = slot === 'background' ? 'dojo-night' : '';
    db.prepare(`UPDATE user_pets SET ${column} = ?, updated_at = datetime('now') WHERE user_id = ?`).run(fallback, req.user.id);
  }

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
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
    const colMap = { hat: 'equipped_hat', belt: 'equipped_belt', shoes: 'equipped_shoes', top: 'equipped_top' };
    const colorColMap = { hat: 'hat_color', belt: 'belt_color', shoes: 'shoes_color', top: 'top_color' };
    const item = CLOTHING_MAP[itemId];
    db.prepare(`UPDATE user_pets SET ${colMap[slot]} = ?, ${colorColMap[slot]} = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(itemId, item.defaultColor, req.user.id);
  } else {
    // Unequip a slot
    const slot = req.body.slot; // 'hat', 'belt', 'shoes', or 'top'
    if (!['hat', 'belt', 'shoes', 'top'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
    const colMap = { hat: 'equipped_hat', belt: 'equipped_belt', shoes: 'equipped_shoes', top: 'equipped_top' };
    db.prepare(`UPDATE user_pets SET ${colMap[slot]} = '', updated_at = datetime('now') WHERE user_id = ?`).run(req.user.id);
  }

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
});

// POST /api/pets/set-color — change clothing color
router.post('/set-color', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const { slot, color } = req.body;
  if (!['hat', 'belt', 'shoes', 'top'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Invalid color (use #RRGGBB)' });
  const colMap = { hat: 'hat_color', belt: 'belt_color', shoes: 'shoes_color', top: 'top_color' };
  db.prepare(`UPDATE user_pets SET ${colMap[slot]} = ?, updated_at = datetime('now') WHERE user_id = ?`).run(color, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
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
  res.json({ pet: formatPet(updated, false, db) });
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
  res.json({ pet: formatPet(updated, false, db), fed: 1 });
});

// POST /api/pets/interact
router.post('/interact', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const actionId = String(req.body?.actionId || 'tap').trim();
  const interaction = PET_INTERACTIONS[actionId] || PET_INTERACTIONS.tap;
  const todayKey = getUtcDayKey();
  const currentDailyInteractions = pet.daily_interaction_key === todayKey ? (pet.daily_interaction_count || 0) : 0;
  const currentEnergy = getStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, ENERGY_DECAY_PER_HOUR);
  const currentHype = getStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at, HYPE_DECAY_PER_HOUR);
  const currentHappiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const profile = getCharacterProfile(pet.character);

  const newEnergy = clamp(currentEnergy + (interaction.energy || 0), 0, MAX_STAT);
  const newHype = clamp(currentHype + (interaction.hype || 0), 0, MAX_STAT);
  const newHappiness = clamp(currentHappiness + (interaction.happiness || 0), 0, MAX_STAT);
  const newTrust = clamp((pet.trust || 35) + (interaction.trust || 0), 0, MAX_STAT);
  const newBond = Math.max(0, (pet.bond || 0) + (interaction.bond || 0));
  const lines = profile.interaction_lines[actionId] || profile.interaction_lines.tap || [];
  const speech = pickRandom(lines, 'A tiny moment passes between you.');

  db.prepare(`
    UPDATE user_pets
    SET happiness = ?, energy = ?, hype = ?, trust = ?, bond = ?,
        interaction_count = interaction_count + 1,
        daily_interaction_count = ?,
        daily_interaction_key = ?,
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newHappiness, newEnergy, newHype, newTrust, newBond, currentDailyInteractions + 1, todayKey, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({
    pet: formatPet(updated, false, db),
    speech,
    reaction: interaction.reaction,
    expression: interaction.expression,
    action: actionId,
  });
});

// POST /api/pets/activities/:activityId
router.post('/activities/:activityId', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const activity = PET_ACTIVITIES[req.params.activityId];
  if (!activity) return res.status(404).json({ error: 'Unknown activity' });

  const currentEnergy = getStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, ENERGY_DECAY_PER_HOUR);
  const currentHype = getStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at, HYPE_DECAY_PER_HOUR);
  const currentHappiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  if (activity.minEnergy && currentEnergy < activity.minEnergy) {
    return res.status(400).json({ error: `Needs at least ${activity.minEnergy} energy for ${activity.label}` });
  }
  if (activity.minTrust && (pet.trust || 35) < activity.minTrust) {
    return res.status(400).json({ error: `${activity.label} unlocks once trust reaches ${activity.minTrust}` });
  }

  const newEnergy = clamp(currentEnergy + activity.energy, 0, MAX_STAT);
  const newHappiness = clamp(currentHappiness + activity.happiness, 0, MAX_STAT);
  const newTrust = clamp((pet.trust || 35) + activity.trust, 0, MAX_STAT);
  const newHype = clamp(currentHype + activity.hype, 0, MAX_STAT);
  const newBond = Math.max(0, (pet.bond || 0) + activity.bond);
  const newCombo = Math.max(0, (pet.combo_balance || 0) + (activity.combo || 0));
  const newBondTokens = Math.max(0, (pet.bond_tokens || 0) + (activity.bond_tokens || 0));
  const newRareShards = Math.max(0, (pet.rare_shards || 0) + (activity.rare_shards || 0));
  const profile = getCharacterProfile(pet.character);
  const speech = pickRandom(profile.interaction_lines.mission, `${activity.label} complete.`);

  db.prepare(`
    UPDATE user_pets
    SET happiness = ?, energy = ?, trust = ?, hype = ?, bond = ?,
        combo_balance = ?, bond_tokens = ?, rare_shards = ?,
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newHappiness, newEnergy, newTrust, newHype, newBond, newCombo, newBondTokens, newRareShards, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({
    pet: formatPet(updated, false, db),
    speech,
    reaction: activity.reaction,
    expression: activity.expression,
    activity: activity.id,
  });
});

// POST /api/pets/toys/:toyId/use
router.post('/toys/:toyId/use', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const toy = PET_TOY_MAP[req.params.toyId];
  if (!toy) return res.status(404).json({ error: 'Unknown toy' });

  const ownedToys = safeJsonParse(pet.owned_toys);
  if (!ownedToys.includes(toy.id)) return res.status(400).json({ error: 'Toy not owned yet' });

  const currentEnergy = getStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, ENERGY_DECAY_PER_HOUR);
  const currentHype = getStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at, HYPE_DECAY_PER_HOUR);
  const currentHappiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const todayKey = getUtcDayKey();
  const currentDailyInteractions = pet.daily_interaction_key === todayKey ? (pet.daily_interaction_count || 0) : 0;
  const preference = getToyPreference(pet.character, toy);
  const favoredBonus = preference === 'favorite'
    ? { bond: 2, trust: 2, happiness: 2, hype: 3 }
    : { bond: 0, trust: 0, happiness: 0, hype: 0 };

  if (currentEnergy < Math.max(8, Math.abs(toy.energy || 0))) {
    return res.status(400).json({ error: `${toy.name} works best once your pet has a little more energy.` });
  }

  const newEnergy = clamp(currentEnergy + (toy.energy || 0), 0, MAX_STAT);
  const newHappiness = clamp(currentHappiness + (toy.happiness || 0) + favoredBonus.happiness, 0, MAX_STAT);
  const newTrust = clamp((pet.trust || 35) + (toy.trust || 0) + favoredBonus.trust, 0, MAX_STAT);
  const newHype = clamp(currentHype + (toy.hype || 0) + favoredBonus.hype, 0, MAX_STAT);
  const newBond = Math.max(0, (pet.bond || 0) + (toy.bond || 0) + favoredBonus.bond);
  const newBondTokens = Math.max(0, (pet.bond_tokens || 0) + (toy.bond_tokens || 0));
  const newCombo = Math.max(0, (pet.combo_balance || 0) + (toy.combo_balance || 0));
  const profile = getCharacterProfile(pet.character);
  const speech = preference === 'favorite'
    ? `${pickRandom(profile.interaction_lines.praise, 'That was delightful.')} ${toy.name} is a favourite.`
    : `${pickRandom(profile.interaction_lines.tap, 'Another little moment together.')} ${toy.name} time.`;

  db.prepare(`
    UPDATE user_pets
    SET happiness = ?, energy = ?, trust = ?, hype = ?, bond = ?,
        bond_tokens = ?, combo_balance = ?,
        interaction_count = interaction_count + 1,
        daily_interaction_count = ?,
        daily_interaction_key = ?,
        last_toy_id = ?, last_toy_at = datetime('now'),
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    newHappiness,
    newEnergy,
    newTrust,
    newHype,
    newBond,
    newBondTokens,
    newCombo,
    currentDailyInteractions + 1,
    todayKey,
    toy.id,
    req.user.id,
  );

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({
    pet: formatPet(updated, false, db),
    toy: toy.id,
    speech,
    reaction: toy.reaction,
    expression: toy.expression,
    preference,
  });
});

// POST /api/pets/missions/:missionId/claim
router.post('/missions/:missionId/claim', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const summary = queryPlayActivitySummary(db, req.user.id);
  const missions = buildPetMissions(pet, {
    ...summary,
    fed_today: !!pet.last_food_at && String(pet.last_food_at).startsWith(getUtcDayKey()),
    interactions_today: pet.daily_interaction_key === getUtcDayKey() ? (pet.daily_interaction_count || 0) : 0,
  });
  const mission = missions.find((entry) => entry.id === req.params.missionId);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  if (mission.claimed) return res.status(400).json({ error: 'Mission already claimed' });
  if (!mission.complete) return res.status(400).json({ error: 'Mission not complete yet' });

  const claimed = safeJsonParse(pet.claimed_missions);
  claimed.push(mission.claim_key);
  const reward = mission.reward || {};
  const currentEnergy = getStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, ENERGY_DECAY_PER_HOUR);
  const currentHype = getStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at, HYPE_DECAY_PER_HOUR);
  const currentHappiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);

  db.prepare(`
    UPDATE user_pets
    SET claimed_missions = ?,
        bond = ?,
        trust = ?,
        energy = ?,
        hype = ?,
        happiness = ?,
        combo_balance = ?,
        bond_tokens = ?,
        rare_shards = ?,
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    JSON.stringify(claimed),
    Math.max(0, (pet.bond || 0) + (reward.bond || 0)),
    clamp((pet.trust || 35) + (reward.trust || 0), 0, MAX_STAT),
    clamp(currentEnergy + (reward.energy || 0), 0, MAX_STAT),
    clamp(currentHype + (reward.hype || 0), 0, MAX_STAT),
    clamp(currentHappiness + (reward.happiness || 0), 0, MAX_STAT),
    Math.max(0, (pet.combo_balance || 0) + (reward.combo_balance || 0)),
    Math.max(0, (pet.bond_tokens || 0) + (reward.bond_tokens || 0)),
    Math.max(0, (pet.rare_shards || 0) + (reward.rare_shards || 0)),
    req.user.id,
  );

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({
    pet: formatPet(updated, false, db),
    mission: mission.id,
    reward: mission.reward,
  });
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
  res.json({ pet: formatPet(updated, false, db) });
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
  res.json({ success: true, pet: formatPet(updated, false, db), trick: req.params.trickId, bonus_xp: bonusXp, combo_earned: comboReward });
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
  let totalBond = 0;
  let totalTrust = 0;
  let totalHype = 0;
  let totalEnergy = 0;
  let highestLevel = pet.highest_level || 0;
  let songCount = 0;
  let trickDemandMet = false;

  if (Array.isArray(playsOrCount)) {
    for (const play of playsOrCount) {
      const score = parseInt(play.score, 10) || 0;
      const rawGrade = normalizeGrade(play.grade) || (score > 0 ? gradeFromScore(score) : 'F');
      const level = parseInt(play.level, 10) || 0;
      const isReplay = String(play.replay_embed_url || '').trim() || String(play.replay_video_id || '').trim();
      const isDouble = String(play.mode || '').startsWith('Double');
      if (level > highestLevel) highestLevel = level;
      const feed = GRADE_FEED_TABLE[rawGrade] || GRADE_FEED_TABLE['F'];
      totalHunger += feed.hunger;
      totalHappiness += feed.happiness;
      totalXp += feed.xp + levelXpBonus(level);
      totalCombo += (GRADE_COMBO[rawGrade] || 0) + levelComboBonus(level);
      totalBond += 1 + (level >= 18 ? 1 : 0) + (GRADE_INDEX[rawGrade] >= GRADE_INDEX.AAA ? 1 : 0);
      totalTrust += (GRADE_INDEX[rawGrade] >= GRADE_INDEX.AAA ? 1 : 0) + (isDouble ? 1 : 0);
      totalHype += 2 + (isReplay ? 2 : 0) + (level >= 20 ? 1 : 0);
      totalEnergy += Math.max(0, Math.floor(level / 8));
      songCount++;
      if (pet.pending_trick && !trickDemandMet) {
        const minIdx = GRADE_ORDER.indexOf(pet.trick_demand_grade || 'A');
        if (level >= (pet.trick_demand_level || 0) && GRADE_ORDER.indexOf(rawGrade) >= minIdx) {
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
    totalBond = songCount;
    totalTrust = Math.max(0, Math.floor(songCount / 2));
    totalHype = songCount * 2;
    totalEnergy = songCount;
  }

  const curHunger = computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const curHappiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const curEnergy = getStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, ENERGY_DECAY_PER_HOUR);
  const curHype = getStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at, HYPE_DECAY_PER_HOUR);
  const newHunger = clamp(curHunger + totalHunger, 0, MAX_STAT);
  let newHappiness = clamp(curHappiness + totalHappiness, 0, MAX_STAT);
  const newEnergy = clamp(curEnergy + totalEnergy, 0, MAX_STAT);
  let newHype = clamp(curHype + totalHype, 0, MAX_STAT);
  let newBond = Math.max(0, (pet.bond || 0) + totalBond);
  let newTrust = clamp((pet.trust || 35) + totalTrust, 0, MAX_STAT);

  if (trickDemandMet) {
    const charTricks = TRICKS[pet.character] || [];
    const trick = charTricks.find(t => t.id === pet.pending_trick);
    const bonusCombo = trick?.comboReward || 10;
    const bonusHappy = trick?.happinessReward || 5;
    newHappiness = clamp(newHappiness + bonusHappy, 0, MAX_STAT);
    newBond += 6;
    newTrust = clamp(newTrust + 4, 0, MAX_STAT);
    newHype = clamp(newHype + 8, 0, MAX_STAT);
    db.prepare(`
      UPDATE user_pets
      SET fullness = ?, happiness = ?, total_songs_fed = total_songs_fed + ?,
          energy = ?, hype = ?, bond = ?, trust = ?,
          experience = experience + ?, combo_balance = combo_balance + ?,
          highest_level = MAX(highest_level, ?),
          last_fed_at = datetime('now'), updated_at = datetime('now'),
          last_trick_performed = pending_trick, last_trick_at = datetime('now'),
          pending_trick = '', trick_demand_level = 0, trick_demand_grade = '', trick_demand_expires = ''
      WHERE user_id = ?
    `).run(newHunger, newHappiness, songCount, newEnergy, newHype, newBond, newTrust, totalXp + 25, totalCombo + bonusCombo, highestLevel, userId);
  } else {
    db.prepare(`
      UPDATE user_pets
      SET fullness = ?, happiness = ?, total_songs_fed = total_songs_fed + ?,
          energy = ?, hype = ?, bond = ?, trust = ?,
          experience = experience + ?, combo_balance = combo_balance + ?,
          highest_level = MAX(highest_level, ?),
          last_fed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(newHunger, newHappiness, songCount, newEnergy, newHype, newBond, newTrust, totalXp, totalCombo, highestLevel, userId);
  }

  return {
    fed: songCount,
    hunger: totalHunger,
    happiness: totalHappiness,
    xp: totalXp,
    combo: totalCombo,
    bond: totalBond,
    trust: totalTrust,
    hype: totalHype,
    trickDemandMet,
  };
};

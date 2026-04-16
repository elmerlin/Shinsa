import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as audio from './petBattleAudio';

export const VIEWPORT_WIDTH = 98;
export const WORLD_WIDTH = 240;
export const PLAYER_BASE_X = 14;
export const ENEMY_BASE_X = WORLD_WIDTH - 14;

export const COMBAT_LAYERS = {
  GROUND: 'ground',
  AIR: 'air',
};

const FIXED_DT = 1000 / 60;
const PLAYER_BASE_HP = 1080;
const AURA_BASE_MAX = 520;
const AURA_BASE_RATE = 14;
const RESERVOIR_BONUS = 170;
const RESERVOIR_CURVE = 22;
const MAX_UPGRADE_LEVEL = 6;
const VET_KILLS_NEEDED = 3;
const VET_BONUS = 0.14;
const STAGE_CLEAR_MS = 4000;
const WAVE_GAP_MS = 780;
const PROJECTILE_SPEED = 48;
const CAMERA_LERP = 0.12;
const BASE_CONTACT_RANGE = 8;
const PET_BURST_COOLDOWN_MS = 16500;
const PET_BURST_RADIUS = 22;
const PET_BURST_DAMAGE = 180;
const PET_BURST_AIR_DAMAGE = 220;

export const UPGRADE_TRACKS = {
  income: {
    key: 'income',
    label: 'Flow',
    shortLabel: 'Aura / s',
    baseCost: 90,
    growth: 1.58,
    maxLevel: MAX_UPGRADE_LEVEL,
  },
  reservoir: {
    key: 'reservoir',
    label: 'Reserve',
    shortLabel: 'Aura cap',
    baseCost: 110,
    growth: 1.62,
    maxLevel: MAX_UPGRADE_LEVEL,
  },
  tempo: {
    key: 'tempo',
    label: 'Rhythm',
    shortLabel: 'Cooldowns',
    baseCost: 135,
    growth: 1.72,
    maxLevel: MAX_UPGRADE_LEVEL,
  },
};

export const PET_ABILITY = {
  key: 'pet_burst',
  label: 'Comet Burst',
  cooldownMs: PET_BURST_COOLDOWN_MS,
  description: 'Blast the current frontline. Extra damage to air.',
};

export const ARCHETYPES = {
  meatshield: {
    key: 'meatshield',
    label: 'Frontliner',
    cost: 50,
    hp: 110,
    damage: 14,
    moveSpeed: 15.8,
    range: 8,
    cooldownMs: 1200,
    attackMs: 620,
    projectile: false,
    size: 8,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
    projectileStyle: 'slash',
  },
  brawler: {
    key: 'brawler',
    label: 'Bruiser',
    cost: 155,
    hp: 310,
    damage: 44,
    moveSpeed: 10.4,
    range: 10,
    cooldownMs: 2900,
    attackMs: 820,
    projectile: false,
    size: 10.8,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
    projectileStyle: 'gauntlet',
  },
  ranged: {
    key: 'ranged',
    label: 'Skyguard',
    cost: 235,
    hp: 170,
    damage: 46,
    moveSpeed: 7.4,
    range: 38,
    cooldownMs: 3900,
    attackMs: 980,
    projectile: true,
    size: 9.5,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.AIR, COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.AIR, COMBAT_LAYERS.GROUND],
    projectileStyle: 'lance',
    bonusVsAir: 0.35,
  },
  flier: {
    key: 'flier',
    label: 'Flier',
    cost: 280,
    hp: 155,
    damage: 56,
    moveSpeed: 12.2,
    range: 17,
    cooldownMs: 5200,
    attackMs: 1180,
    projectile: true,
    size: 9.8,
    layer: COMBAT_LAYERS.AIR,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
    projectileStyle: 'ember',
    damageVsBaseMult: 1.15,
  },
  tank: {
    key: 'tank',
    label: 'Tank',
    cost: 520,
    hp: 840,
    damage: 102,
    moveSpeed: 5.6,
    range: 14,
    cooldownMs: 7800,
    attackMs: 1350,
    projectile: false,
    aoe: 16,
    size: 14.2,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
    projectileStyle: 'slam',
  },
};

export const ARCHETYPE_ORDER = ['meatshield', 'brawler', 'ranged', 'flier', 'tank'];

export const PET_UNIT_NAMES = {
  dojocat: {
    meatshield: 'White Belt',
    brawler: 'Nunchuck Cub',
    ranged: 'Sky Monk',
    flier: 'Copter Cat',
    tank: 'Temple Sensei',
  },
  pixiu: {
    meatshield: 'Mini Coin',
    brawler: 'Jade Claws',
    ranged: 'Jade Lantern',
    flier: 'Dragon Rider',
    tank: 'Celestial Guardian',
  },
  buu: {
    meatshield: 'Tiny Blob',
    brawler: 'Glove Goblin',
    ranged: 'Bubble Beam',
    flier: 'Majin Saucer',
    tank: 'Mega Buu',
  },
  devit: {
    meatshield: 'Imp Guard',
    brawler: 'Pitchfork Punk',
    ranged: 'Hell Pike',
    flier: 'Trident Rider',
    tank: 'Demon Duke',
  },
};

export const PET_UNIT_VARIANTS = {
  dojocat: {
    meatshield: {
      battleNote: 'Wraps, belt knot, round shield',
      accessoryKey: 'wrap_guard',
      spriteScaleAdjust: 0.96,
    },
    brawler: {
      battleNote: 'Gloves, spar pads, nunchuck charm',
      accessoryKey: 'dojo_brawler',
      spriteScaleAdjust: 1.04,
    },
    ranged: {
      battleNote: 'Monk beads and bamboo anti-air darts',
      accessoryKey: 'sky_monk',
      projectileVariant: 'bamboo_dart',
      spriteScaleAdjust: 0.98,
    },
    flier: {
      battleNote: 'Rotor harness Copter Cat',
      accessoryKey: 'copter_cat',
      projectileVariant: 'copter_star',
      mountKey: 'copter_cat',
      pilotScaleAdjust: 0.74,
      spriteScaleAdjust: 1.02,
    },
    tank: {
      battleNote: 'Temple plate armor and great axe',
      accessoryKey: 'temple_tank',
      spriteScaleAdjust: 1.06,
    },
  },
  buu: {
    meatshield: {
      battleNote: 'Candy buckle and pudding cap',
      accessoryKey: 'blob_guard',
      spriteScaleAdjust: 1.04,
    },
    brawler: {
      battleNote: 'Big mitts, gold belt, gym wrap',
      accessoryKey: 'buu_brawler',
      spriteScaleAdjust: 1.08,
    },
    ranged: {
      battleNote: 'Bubble staff and sugar bolts',
      accessoryKey: 'bubble_mage',
      projectileVariant: 'bubble_beam',
      spriteScaleAdjust: 1.02,
    },
    flier: {
      battleNote: 'Round Majin saucer battle pod',
      accessoryKey: 'majin_saucer',
      projectileVariant: 'gum_comet',
      mountKey: 'majin_saucer',
      pilotScaleAdjust: 0.76,
      spriteScaleAdjust: 1.08,
    },
    tank: {
      battleNote: 'Heavy straps and giant shoulder plates',
      accessoryKey: 'mega_buu',
      spriteScaleAdjust: 1.12,
    },
  },
  devit: {
    meatshield: {
      battleNote: 'Spike collar and ember guard',
      accessoryKey: 'imp_guard',
      spriteScaleAdjust: 0.94,
    },
    brawler: {
      battleNote: 'Chain wraps and horn gloves',
      accessoryKey: 'hell_brawler',
      spriteScaleAdjust: 0.98,
    },
    ranged: {
      battleNote: 'Infernal pike and red sigils',
      accessoryKey: 'infernal_pike',
      projectileVariant: 'infernal_pike',
      spriteScaleAdjust: 0.96,
    },
    flier: {
      battleNote: 'Flying trident staff with flame fins',
      accessoryKey: 'trident_rider',
      projectileVariant: 'trident_spark',
      mountKey: 'trident_rider',
      pilotScaleAdjust: 0.72,
      spriteScaleAdjust: 0.94,
    },
    tank: {
      battleNote: 'Horned pauldrons and abyss axe',
      accessoryKey: 'abyss_tank',
      spriteScaleAdjust: 1.03,
    },
  },
  pixiu: {
    meatshield: {
      battleNote: 'Jade tassel and coin ward',
      accessoryKey: 'coin_guard',
      spriteScaleAdjust: 1.02,
    },
    brawler: {
      battleNote: 'Ceremonial ribbons and claw cuffs',
      accessoryKey: 'jade_brawler',
      spriteScaleAdjust: 1.04,
    },
    ranged: {
      battleNote: 'Lantern charms and lucky talismans',
      accessoryKey: 'jade_lantern',
      projectileVariant: 'jade_charm',
      spriteScaleAdjust: 1,
    },
    flier: {
      battleNote: 'Dragon mount with saddle armor',
      accessoryKey: 'dragon_rider',
      projectileVariant: 'jade_pearl',
      mountKey: 'dragon_rider',
      pilotScaleAdjust: 0.74,
      spriteScaleAdjust: 1.04,
    },
    tank: {
      battleNote: 'Celestial coat and plated guardian helm',
      accessoryKey: 'celestial_guardian',
      spriteScaleAdjust: 1.08,
    },
  },
};

export const ENEMY_TYPES = {
  basic: {
    key: 'basic',
    hp: 72,
    damage: 10,
    moveSpeed: 12.2,
    range: 8,
    score: 12,
    bounty: 16,
    attackMs: 700,
    size: 8,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
  },
  bruiser: {
    key: 'bruiser',
    hp: 225,
    damage: 28,
    moveSpeed: 8.6,
    range: 10,
    score: 28,
    bounty: 32,
    attackMs: 930,
    size: 10.8,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
  },
  sniper: {
    key: 'sniper',
    hp: 94,
    damage: 42,
    moveSpeed: 5.7,
    range: 34,
    score: 34,
    bounty: 34,
    attackMs: 1180,
    projectile: true,
    projectileStyle: 'orb',
    size: 9.5,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
  },
  ballista: {
    key: 'ballista',
    hp: 180,
    damage: 48,
    moveSpeed: 5.2,
    range: 42,
    score: 42,
    bounty: 38,
    attackMs: 1250,
    projectile: true,
    projectileStyle: 'bolt',
    size: 11.2,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.AIR, COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.AIR, COMBAT_LAYERS.GROUND],
    bonusVsAir: 0.4,
  },
  tank: {
    key: 'tank',
    hp: 550,
    damage: 62,
    moveSpeed: 4.2,
    range: 13,
    score: 56,
    bounty: 54,
    attackMs: 1440,
    aoe: 14,
    size: 13,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
  },
  harpy: {
    key: 'harpy',
    hp: 135,
    damage: 34,
    moveSpeed: 11.4,
    range: 18,
    score: 40,
    bounty: 36,
    attackMs: 1040,
    projectile: true,
    projectileStyle: 'bomb',
    size: 10,
    layer: COMBAT_LAYERS.AIR,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
    damageVsBaseMult: 1.2,
  },
  boss: {
    key: 'boss',
    hp: 1750,
    damage: 102,
    moveSpeed: 3.1,
    range: 16,
    score: 220,
    bounty: 110,
    attackMs: 1660,
    aoe: 20,
    size: 16.5,
    layer: COMBAT_LAYERS.GROUND,
    targetLayers: [COMBAT_LAYERS.GROUND],
    targetPriority: [COMBAT_LAYERS.GROUND],
    summonType: 'harpy',
    summonMs: 6600,
  },
};

function upgradeCost(trackKey, level) {
  const track = UPGRADE_TRACKS[trackKey];
  if (!track) return 9999;
  return Math.round(track.baseCost * (track.growth ** level));
}

function getWaveCount(stage) {
  return 3 + Math.min(4, Math.floor(stage / 3));
}

function getEnemyBaseHp(stage) {
  return Math.round(780 * (1.17 ** (stage - 1)));
}

function getAuraRate(upgrades) {
  return AURA_BASE_RATE + upgrades.income * 5 + Math.max(0, upgrades.income - 2) * 2;
}

function getAuraMax(upgrades) {
  return AURA_BASE_MAX + upgrades.reservoir * RESERVOIR_BONUS + upgrades.reservoir * upgrades.reservoir * RESERVOIR_CURVE;
}

function getCooldownMultiplier(upgrades) {
  return Math.max(0.56, 1 - upgrades.tempo * 0.08);
}

function enemyScale(stage) {
  return 1 + (stage - 1) * 0.18 + Math.max(0, stage - 10) * 0.035;
}

function stageParTime(stage) {
  return (32 + Math.min(stage, 20) * 5) * 1000;
}

function stageOutcomeScore(stage) {
  return Math.round(stage * 420 + stage * stage * 18);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createCooldownMap() {
  return Object.fromEntries(ARCHETYPE_ORDER.map((key) => [key, 0]));
}

function createInitialState() {
  const upgrades = { income: 0, reservoir: 0, tempo: 0 };
  const auraMax = getAuraMax(upgrades);
  return {
    mode: 'idle',
    countdownValue: 3,
    character: 'dojocat',
    score: 0,
    stage: 1,
    stageReached: 1,
    wave: 1,
    waveCount: getWaveCount(1),
    globalWave: 0,
    aura: 120,
    auraMax,
    auraRate: getAuraRate(upgrades),
    cooldownMultiplier: getCooldownMultiplier(upgrades),
    upgrades,
    playerBaseHp: PLAYER_BASE_HP,
    playerBaseMaxHp: PLAYER_BASE_HP,
    enemyBaseHp: getEnemyBaseHp(1),
    enemyBaseMaxHp: getEnemyBaseHp(1),
    playerUnits: [],
    enemyUnits: [],
    projectiles: [],
    fx: [],
    cooldowns: createCooldownMap(),
    abilityCooldownMs: 0,
    abilityFlashMs: 0,
    unitsSpawned: 0,
    enemiesDefeated: 0,
    bossesDefeated: 0,
    waveQueue: [],
    waveDelayMs: 0,
    cameraX: 0,
    animFrame: 0,
    modeTimer: 0,
    outcome: '',
    victory: false,
    stageElapsedMs: 0,
    lastStageBonus: null,
    survivalUnlocked: false,
    battlefieldGround: 0,
    _nextId: 1,
  };
}

function recalcEconomy(state) {
  state.auraRate = getAuraRate(state.upgrades);
  state.cooldownMultiplier = getCooldownMultiplier(state.upgrades);
  state.auraMax = getAuraMax(state.upgrades);
  state.aura = clamp(state.aura, 0, state.auraMax);
}

function createPlayerUnit(state, typeKey) {
  const template = ARCHETYPES[typeKey];
  const names = PET_UNIT_NAMES[state.character] || PET_UNIT_NAMES.dojocat;
  const variant = PET_UNIT_VARIANTS[state.character]?.[typeKey] || {};
  const airOffset = template.layer === COMBAT_LAYERS.AIR ? (state.unitsSpawned % 2) * 1.4 : 0;
  return {
    id: state._nextId++,
    team: 'player',
    type: typeKey,
    name: names[typeKey] || template.label,
    x: PLAYER_BASE_X + 10 + (state.unitsSpawned % 3) * 1.1,
    hp: template.hp,
    maxHp: template.hp,
    damage: template.damage,
    baseDamage: template.damage,
    moveSpeed: template.moveSpeed,
    baseMoveSpeed: template.moveSpeed,
    range: template.range,
    attackMs: template.attackMs,
    baseAttackMs: template.attackMs,
    attackTimer: template.attackMs * (0.18 + Math.random() * 0.52),
    projectile: template.projectile,
    projectileStyle: template.projectileStyle,
    projectileVariant: variant.projectileVariant || template.projectileStyle,
    projectileSpeed: template.projectileSpeed || PROJECTILE_SPEED,
    aoe: template.aoe || 0,
    size: template.size * (variant.spriteScaleAdjust || 1),
    attackFlash: 0,
    layer: template.layer,
    targetLayers: [...template.targetLayers],
    targetPriority: [...(template.targetPriority || template.targetLayers)],
    bonusVsAir: template.bonusVsAir || 0,
    damageVsBaseMult: template.damageVsBaseMult || 1,
    animOffset: Math.random() * 36,
    kills: 0,
    veterancy: 0,
    flightBobOffset: template.layer === COMBAT_LAYERS.AIR ? airOffset + Math.random() * Math.PI : 0,
    accessoryKey: variant.accessoryKey || '',
    mountKey: variant.mountKey || '',
    battleNote: variant.battleNote || '',
    pilotScaleAdjust: variant.pilotScaleAdjust || 0.72,
  };
}

function applyVeterancy(unit) {
  const template = unit.team === 'player' ? ARCHETYPES[unit.type] : ENEMY_TYPES[unit.type];
  if (!template) return;
  const mult = 1 + unit.veterancy * VET_BONUS;
  unit.maxHp = Math.round(template.hp * mult);
  unit.baseDamage = Math.round(template.damage * mult);
  unit.damage = unit.baseDamage;
  unit.baseMoveSpeed = template.moveSpeed * (1 + unit.veterancy * 0.03);
  unit.moveSpeed = unit.baseMoveSpeed;
  unit.hp = unit.maxHp;
}

function createEnemyUnit(state, typeKey) {
  const template = ENEMY_TYPES[typeKey];
  const scale = enemyScale(state.stage);
  const hp = Math.round(template.hp * scale);
  return {
    id: state._nextId++,
    team: 'enemy',
    type: typeKey,
    x: ENEMY_BASE_X - 12 - ((state._nextId % 3) * 1.6),
    hp,
    maxHp: hp,
    damage: Math.round(template.damage * Math.min(3.1, 1 + (state.stage - 1) * 0.11)),
    baseDamage: Math.round(template.damage * Math.min(3.1, 1 + (state.stage - 1) * 0.11)),
    moveSpeed: template.moveSpeed * Math.min(1.9, 1 + Math.max(0, state.stage - 1) * 0.02),
    baseMoveSpeed: template.moveSpeed * Math.min(1.9, 1 + Math.max(0, state.stage - 1) * 0.02),
    range: template.range,
    attackMs: Math.max(520, template.attackMs - Math.min(250, Math.floor(state.stage * 7))),
    baseAttackMs: Math.max(520, template.attackMs - Math.min(250, Math.floor(state.stage * 7))),
    attackTimer: template.attackMs * (0.16 + Math.random() * 0.48),
    projectile: template.projectile,
    projectileStyle: template.projectileStyle || 'orb',
    projectileSpeed: template.projectileSpeed || PROJECTILE_SPEED,
    aoe: template.aoe || 0,
    size: template.size,
    score: template.score + Math.floor(state.stage * 2.5),
    bounty: template.bounty + Math.floor(state.stage * 1.8),
    attackFlash: 0,
    layer: template.layer,
    targetLayers: [...template.targetLayers],
    targetPriority: [...(template.targetPriority || template.targetLayers)],
    bonusVsAir: template.bonusVsAir || 0,
    damageVsBaseMult: template.damageVsBaseMult || 1,
    animOffset: Math.random() * 36,
    flightBobOffset: template.layer === COMBAT_LAYERS.AIR ? Math.random() * Math.PI : 0,
    summonType: template.summonType || '',
    summonMs: template.summonMs || 0,
    specialTimer: template.summonMs || 0,
  };
}

export function generateWaveEnemies(stage, wave, globalWave) {
  const bossWave = globalWave % 5 === 0;
  if (bossWave) {
    const bossEntries = [{ delayMs: 500, type: 'boss' }];
    if (stage >= 6) bossEntries.push({ delayMs: 2100, type: 'harpy' });
    if (stage >= 9) bossEntries.push({ delayMs: 3100, type: 'ballista' });
    return bossEntries;
  }

  const count = 5 + Math.min(8, stage) + wave + Math.floor(stage / 3);
  const pool = ['basic'];
  if (stage >= 2 || wave >= 2) pool.push('bruiser');
  if (stage >= 3) pool.push('harpy');
  if (stage >= 4) pool.push('sniper');
  if (stage >= 5) pool.push('ballista');
  if (stage >= 6) pool.push('tank');

  const enemies = [];
  if (stage >= 3) enemies.push({ delayMs: 320, type: 'harpy' });
  if (stage >= 5 && wave % 2 === 0) enemies.push({ delayMs: 760, type: 'ballista' });

  for (let i = enemies.length; i < count; i += 1) {
    let type = pool[Math.floor(Math.random() * pool.length)];
    if (i === count - 1 && stage >= 5) type = stage >= 8 && wave === getWaveCount(stage) ? 'ballista' : 'tank';
    enemies.push({
      delayMs: 300 + i * Math.max(135, 410 - stage * 12),
      type,
    });
  }
  return enemies;
}

function getCombatGap(attacker, target) {
  const bodyGap = ((attacker.size || 8) + (target.size || 8)) * 0.42;
  return Math.abs(attacker.x - target.x) - bodyGap;
}

function isValidTarget(attacker, target) {
  return target.hp > 0 && attacker.targetLayers.includes(target.layer);
}

function findClosestTarget(attacker, targets) {
  const priorities = attacker.targetPriority?.length ? attacker.targetPriority : attacker.targetLayers;
  for (const layer of priorities) {
    let best = null;
    let bestDistance = Infinity;
    targets.forEach((target) => {
      if (!isValidTarget(attacker, target)) return;
      if (target.layer !== layer) return;
      const distance = getCombatGap(attacker, target);
      if (distance > attacker.range) return;
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    });
    if (best) return best;
  }
  return null;
}

function resolveOverlaps(units) {
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      const a = units[i];
      const b = units[j];
      if (a.layer !== b.layer) continue;
      const minGap = ((a.size || 8) + (b.size || 8)) * 0.065;
      const dist = Math.abs(a.x - b.x);
      if (dist < minGap) {
        const push = (minGap - dist) * 0.5;
        if (a.x < b.x) {
          a.x -= push;
          b.x += push;
        } else {
          a.x += push;
          b.x -= push;
        }
      }
    }
  }
}

function queueWave(state) {
  state.globalWave += 1;
  state.waveQueue = generateWaveEnemies(state.stage, state.wave, state.globalWave);
  state.waveDelayMs = 0;
  if (state.globalWave % 5 === 0) audio.playBossAppear();
}

function setupStage(state, stage) {
  state.stage = stage;
  state.stageReached = Math.max(state.stageReached, stage);
  state.wave = 1;
  state.waveCount = getWaveCount(stage);
  state.enemyBaseHp = getEnemyBaseHp(stage);
  state.enemyBaseMaxHp = state.enemyBaseHp;
  state.enemyUnits = [];
  state.projectiles = [];
  state.fx = [];
  state.modeTimer = 0;
  state.stageElapsedMs = 0;
  state.lastStageBonus = null;
  state.survivalUnlocked = state.survivalUnlocked || stage > 10;

  let groundIndex = 0;
  let airIndex = 0;
  state.playerUnits.forEach((unit) => {
    const index = unit.layer === COMBAT_LAYERS.AIR ? airIndex++ : groundIndex++;
    unit.x = PLAYER_BASE_X + 10 + (index % 3) * 1.4;
    unit.hp = unit.maxHp;
    unit.attackTimer = unit.baseAttackMs * 0.4;
    unit.attackFlash = 0;
  });
  queueWave(state);
}

function addFx(state, type, x, y, size = 8, extra = {}) {
  state.fx.push({ id: state._nextId++, type, x, y, size, progress: 0, ...extra });
}

function damageBase(state, team, damage) {
  if (team === 'enemy') state.playerBaseHp = Math.max(0, state.playerBaseHp - damage);
  else state.enemyBaseHp = Math.max(0, state.enemyBaseHp - damage);
  audio.playBaseHit();
}

function calcDamage(attacker, target, isBase = false) {
  let damage = attacker.damage;
  if (isBase) damage *= attacker.damageVsBaseMult || 1;
  if (!isBase && target.layer === COMBAT_LAYERS.AIR && attacker.bonusVsAir) damage *= 1 + attacker.bonusVsAir;
  return Math.round(damage);
}

function attackUnit(state, attacker, target, isBase = false) {
  attacker.attackTimer = attacker.baseAttackMs;
  attacker.attackFlash = 180;
  const damage = calcDamage(attacker, target, isBase);

  if (attacker.projectile && !isBase) {
    state.projectiles.push({
      id: state._nextId++,
      team: attacker.team,
      sourceType: attacker.type,
      kind: attacker.projectileStyle || 'orb',
      variant: attacker.projectileVariant || attacker.projectileStyle || 'orb',
      x: attacker.x,
      y: 0,
      dir: attacker.team === 'player' ? 1 : -1,
      damage,
      targetId: target.id,
      targetTeam: target.team,
      targetLayers: [...attacker.targetLayers],
      sourceLayer: attacker.layer,
      speed: attacker.projectileSpeed || PROJECTILE_SPEED,
      veterancy: attacker.veterancy || 0,
      sizeBoost: 1 + (attacker.veterancy || 0) * 0.18,
    });
    audio.playRangedShot();
    return;
  }

  if (attacker.team === 'player') audio.playMeleeHit();
  else audio.playEnemyHit();

  if (isBase) {
    damageBase(state, attacker.team, damage);
    addFx(state, 'slash', attacker.team === 'player' ? ENEMY_BASE_X - 4 : PLAYER_BASE_X + 4, 0, 8);
    return;
  }

  target.hp -= damage;
  addFx(state, attacker.layer === COMBAT_LAYERS.AIR ? 'explosion' : 'slash', target.x, 0, target.size || 8);
  addFx(state, 'impact', target.x, 0, 5, { layer: target.layer });
  if (attacker.aoe) {
    const pool = attacker.team === 'player' ? state.enemyUnits : state.playerUnits;
    pool.forEach((candidate) => {
      if (candidate.id === target.id || candidate.layer !== target.layer) return;
      if (Math.abs(candidate.x - target.x) <= attacker.aoe) candidate.hp -= Math.round(damage * 0.35);
    });
  }
}

function updateCooldowns(state, dt) {
  Object.keys(state.cooldowns).forEach((key) => {
    state.cooldowns[key] = Math.max(0, state.cooldowns[key] - dt);
  });
  state.abilityCooldownMs = Math.max(0, state.abilityCooldownMs - dt);
  state.abilityFlashMs = Math.max(0, state.abilityFlashMs - dt);
}

function updateWaveSpawning(state, dt) {
  if (!state.waveQueue.length) return;
  state.waveDelayMs += dt;
  while (state.waveQueue.length && state.waveDelayMs >= state.waveQueue[0].delayMs) {
    const next = state.waveQueue.shift();
    state.enemyUnits.push(createEnemyUnit(state, next.type));
  }
}

function updateEnemySpecials(state, dt) {
  state.enemyUnits.forEach((unit) => {
    if (!unit.summonType || !unit.summonMs) return;
    unit.specialTimer -= dt;
    if (unit.specialTimer > 0) return;
    unit.specialTimer = unit.summonMs;
    const summon = createEnemyUnit(state, unit.summonType);
    summon.x = clamp(unit.x + 5, PLAYER_BASE_X + 18, ENEMY_BASE_X - 10);
    summon.attackTimer *= 0.4;
    state.enemyUnits.push(summon);
    addFx(state, 'burst', summon.x, 0, 10, { layer: summon.layer });
  });
}

function updateUnits(state, dt, playerUnits, enemyUnits) {
  const dtSec = dt / 1000;

  playerUnits.forEach((unit) => {
    unit.attackTimer = Math.max(0, unit.attackTimer - dt);
    unit.attackFlash = Math.max(0, unit.attackFlash - dt);
    const target = findClosestTarget(unit, enemyUnits);
    const canHitBase = state.enemyBaseHp > 0 && ENEMY_BASE_X - unit.x <= Math.max(BASE_CONTACT_RANGE, unit.range);
    if (target) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, target, false);
    } else if (canHitBase) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, null, true);
    } else {
      // Only advance if no targetable enemy is close ahead
      const blocked = enemyUnits.some((eu) => {
        if (eu.hp <= 0 || !unit.targetLayers.includes(eu.layer)) return false;
        const dx = eu.x - unit.x;
        return dx > -(unit.size || 8) * 0.5 && dx < unit.range + 4;
      });
      if (!blocked) unit.x = Math.min(ENEMY_BASE_X - 4, unit.x + unit.moveSpeed * dtSec);
    }
  });

  enemyUnits.forEach((unit) => {
    unit.attackTimer = Math.max(0, unit.attackTimer - dt);
    unit.attackFlash = Math.max(0, unit.attackFlash - dt);
    const target = findClosestTarget(unit, playerUnits);
    const canHitBase = state.playerBaseHp > 0 && unit.x - PLAYER_BASE_X <= Math.max(BASE_CONTACT_RANGE, unit.range);
    if (target) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, target, false);
    } else if (canHitBase) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, null, true);
    } else {
      // Only advance if no targetable enemy is close ahead
      const blocked = playerUnits.some((pu) => {
        if (pu.hp <= 0 || !unit.targetLayers.includes(pu.layer)) return false;
        const dx = unit.x - pu.x;
        return dx > -(unit.size || 8) * 0.5 && dx < unit.range + 4;
      });
      if (!blocked) unit.x = Math.max(PLAYER_BASE_X + 4, unit.x - unit.moveSpeed * dtSec);
    }
  });

  resolveOverlaps(playerUnits.filter((unit) => unit.layer === COMBAT_LAYERS.GROUND));
  resolveOverlaps(playerUnits.filter((unit) => unit.layer === COMBAT_LAYERS.AIR));
  resolveOverlaps(enemyUnits.filter((unit) => unit.layer === COMBAT_LAYERS.GROUND));
  resolveOverlaps(enemyUnits.filter((unit) => unit.layer === COMBAT_LAYERS.AIR));

  // Cross-team collision: prevent same-layer opposing units from walking through each other
  playerUnits.forEach((pu) => {
    if (pu.hp <= 0) return;
    enemyUnits.forEach((eu) => {
      if (eu.hp <= 0 || pu.layer !== eu.layer) return;
      const minDist = ((pu.size || 8) + (eu.size || 8)) * 0.32;
      const dist = Math.abs(pu.x - eu.x);
      if (dist < minDist) {
        const push = (minDist - dist) * 0.45;
        if (pu.x < eu.x) { pu.x -= push; eu.x += push; }
        else { pu.x += push; eu.x -= push; }
      }
    });
  });
}

function updateProjectiles(state, dt) {
  const dtSec = dt / 1000;
  state.projectiles.forEach((projectile) => {
    projectile.x += projectile.dir * projectile.speed * dtSec;
    const targets = projectile.team === 'player' ? state.enemyUnits : state.playerUnits;
    const hitTarget = targets.find((unit) => (
      projectile.targetLayers.includes(unit.layer)
      && Math.abs(unit.x - projectile.x) <= Math.max(2, unit.size * 0.55)
    ));
    if (hitTarget) {
      hitTarget.hp -= projectile.damage;
      projectile.done = true;
      addFx(state, 'explosion', projectile.x, 0, 6, { layer: hitTarget.layer });
      if (projectile.team === 'player') audio.playEnemyHit();
      else audio.playMeleeHit();
      return;
    }

    if (projectile.team === 'player' && projectile.x >= ENEMY_BASE_X - BASE_CONTACT_RANGE) {
      damageBase(state, 'player', projectile.damage);
      projectile.done = true;
      addFx(state, 'explosion', ENEMY_BASE_X - 3, 0, 8);
    } else if (projectile.team === 'enemy' && projectile.x <= PLAYER_BASE_X + BASE_CONTACT_RANGE) {
      damageBase(state, 'enemy', projectile.damage);
      projectile.done = true;
      addFx(state, 'explosion', PLAYER_BASE_X + 3, 0, 8);
    }
  });
  state.projectiles = state.projectiles.filter((projectile) => !projectile.done && projectile.x >= 0 && projectile.x <= WORLD_WIDTH);
}

function resolveDeaths(state) {
  state.playerUnits = state.playerUnits.filter((unit) => {
    if (unit.hp > 0) return true;
    addFx(state, 'poof', unit.x, 0, unit.size * 1.2, { layer: unit.layer });
    return false;
  });

  const deadEnemies = state.enemyUnits.filter((unit) => unit.hp <= 0);
  state.enemyUnits = state.enemyUnits.filter((unit) => {
    if (unit.hp > 0) return true;
    state.score += unit.score;
    state.aura = clamp(state.aura + unit.bounty, 0, state.auraMax);
    state.enemiesDefeated += 1;
    if (unit.type === 'boss') {
      state.bossesDefeated += 1;
      audio.playBossDefeat();
    } else {
      audio.playEnemyDeath();
    }
    addFx(state, 'poof', unit.x, 0, unit.size * 1.2, { layer: unit.layer });
    return false;
  });

  deadEnemies.forEach((enemy) => {
    let closest = null;
    let closestDist = Infinity;
    state.playerUnits.forEach((unit) => {
      if (!unit.targetLayers.includes(enemy.layer) && unit.layer !== enemy.layer) return;
      const dist = Math.abs(unit.x - enemy.x);
      if (dist < closestDist) {
        closest = unit;
        closestDist = dist;
      }
    });
    if (closest) {
      closest.kills = (closest.kills || 0) + 1;
      if (closest.kills >= VET_KILLS_NEEDED * (closest.veterancy + 1)) {
        closest.veterancy += 1;
        applyVeterancy(closest);
      }
    }
  });
}

function updateFx(state, dt) {
  state.fx.forEach((fx) => {
    fx.progress += dt / (fx.type === 'shockwave' ? 650 : 400);
  });
  state.fx = state.fx.filter((fx) => fx.progress < 1);
}

function updateCamera(state) {
  const playerFront = state.playerUnits.length ? Math.max(...state.playerUnits.map((unit) => unit.x)) : PLAYER_BASE_X + 12;
  const enemyFront = state.enemyUnits.length ? Math.min(...state.enemyUnits.map((unit) => unit.x)) : ENEMY_BASE_X - 12;
  const fightCenter = state.enemyUnits.length
    ? (playerFront + enemyFront) * 0.5
    : Math.min(ENEMY_BASE_X - 8, playerFront + VIEWPORT_WIDTH * 0.2);
  const focus = clamp(fightCenter - VIEWPORT_WIDTH * 0.5, 0, WORLD_WIDTH - VIEWPORT_WIDTH);
  state.cameraX += (focus - state.cameraX) * CAMERA_LERP;
}

function usePetBurst(state) {
  if (state.abilityCooldownMs > 0) return false;
  state.abilityCooldownMs = PET_BURST_COOLDOWN_MS;
  state.abilityFlashMs = 800;

  const playerFront = state.playerUnits.length ? Math.max(...state.playerUnits.map((unit) => unit.x)) : PLAYER_BASE_X + 16;
  const enemyFront = state.enemyUnits.length ? Math.min(...state.enemyUnits.map((unit) => unit.x)) : ENEMY_BASE_X - 20;
  const impactX = clamp(state.enemyUnits.length ? (playerFront + enemyFront) * 0.58 : ENEMY_BASE_X - 20, PLAYER_BASE_X + 20, ENEMY_BASE_X - 14);

  let hitSomething = false;
  state.enemyUnits.forEach((unit) => {
    const radius = unit.layer === COMBAT_LAYERS.AIR ? PET_BURST_RADIUS * 0.9 : PET_BURST_RADIUS;
    if (Math.abs(unit.x - impactX) > radius + unit.size * 0.45) return;
    const damage = unit.layer === COMBAT_LAYERS.AIR ? PET_BURST_AIR_DAMAGE : PET_BURST_DAMAGE;
    unit.hp -= damage;
    unit.x = Math.min(ENEMY_BASE_X - 4, unit.x + (unit.layer === COMBAT_LAYERS.AIR ? 14 : 10));
    unit.attackTimer += 450;
    hitSomething = true;
  });
  if (!hitSomething && ENEMY_BASE_X - impactX <= PET_BURST_RADIUS + BASE_CONTACT_RANGE) {
    damageBase(state, 'player', Math.round(PET_BURST_DAMAGE * 0.55));
  }

  addFx(state, 'shockwave', impactX, 0, PET_BURST_RADIUS, { layer: COMBAT_LAYERS.GROUND });
  addFx(state, 'burst', impactX, 0, 14, { layer: COMBAT_LAYERS.AIR });
  audio.playAuraUpgrade();
  return true;
}

export function tick(state, dt) {
  state.animFrame += dt / 16;
  state.aura = clamp(state.aura + state.auraRate * (dt / 1000), 0, state.auraMax);

  if (state.mode === 'stage_clear') {
    state.modeTimer -= dt;
    updateFx(state, dt);
    updateCamera(state);
    if (state.modeTimer <= 0) {
      setupStage(state, state.stage + 1);
      state.mode = 'playing';
    }
    return state;
  }

  if (state.mode !== 'playing') return state;

  state.stageElapsedMs += dt;
  updateCooldowns(state, dt);
  updateWaveSpawning(state, dt);
  updateEnemySpecials(state, dt);
  updateUnits(state, dt, state.playerUnits, state.enemyUnits);
  updateProjectiles(state, dt);
  resolveDeaths(state);
  updateFx(state, dt);
  updateCamera(state);

  const waveCleared = !state.waveQueue.length && state.enemyUnits.length === 0;
  if (waveCleared && state.enemyBaseHp > 0) {
    if (state.wave < state.waveCount) {
      state.wave += 1;
      queueWave(state);
      state.waveDelayMs = -WAVE_GAP_MS;
    }
  }

  if (state.enemyBaseHp <= 0) {
    const stg = state.stage;
    const baseScore = stageOutcomeScore(stg);
    const par = stageParTime(stg);
    const speedRatio = Math.max(0, 1 - state.stageElapsedMs / par);
    const speedBonus = Math.round(stg * 360 * speedRatio);
    const hpRatio = state.playerBaseHp / Math.max(1, state.playerBaseMaxHp);
    const hpBonus = Math.round(stg * 170 * hpRatio);
    const wavesSkipped = Math.max(0, state.waveCount - state.wave);
    const waveSkipBonus = wavesSkipped * stg * 95;

    const totalBonus = baseScore + speedBonus + hpBonus + waveSkipBonus;
    state.score += totalBonus;
    state.lastStageBonus = {
      base: baseScore,
      speed: speedBonus,
      hp: hpBonus,
      waveSkip: waveSkipBonus,
      survival: stg >= 10,
    };

    state.mode = 'stage_clear';
    state.modeTimer = STAGE_CLEAR_MS;
    state.waveQueue = [];
    state.enemyUnits = [];
    state.projectiles = [];
    audio.playStageClear();
  } else if (state.playerBaseHp <= 0) {
    state.mode = 'game_over';
    state.outcome = 'loss';
    state.victory = false;
    state.stageReached = Math.max(state.stageReached, state.stage);
    audio.playGameOverLoss();
  }

  return state;
}

export default function usePetBattleGame() {
  const stateRef = useRef(createInitialState());
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const countdownRef = useRef(null);
  const onRenderRef = useRef(null);

  const renderNow = useCallback(() => {
    onRenderRef.current?.(stateRef.current);
  }, []);

  const loop = useCallback((time) => {
    if (lastTimeRef.current == null) lastTimeRef.current = time;
    const dt = Math.min(40, time - lastTimeRef.current);
    lastTimeRef.current = time;

    if (stateRef.current.mode === 'playing' || stateRef.current.mode === 'stage_clear') {
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(FIXED_DT, remaining);
        tick(stateRef.current, step);
        remaining -= step;
      }
      renderNow();
      if (stateRef.current.mode === 'game_over') {
        rafRef.current = null;
        return;
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [renderNow]);

  const startLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startGame = useCallback((character) => {
    stopLoop();
    clearCountdown();
    audio.startAudio();
    const nextState = createInitialState();
    nextState.character = character || 'dojocat';
    nextState.mode = 'countdown';
    nextState.countdownValue = 3;
    stateRef.current = nextState;
    renderNow();

    let count = 3;
    audio.playCountdown(count);
    countdownRef.current = setInterval(() => {
      count -= 1;
      stateRef.current.countdownValue = count;
      audio.playCountdown(count);
      renderNow();
      if (count <= 0) {
        clearCountdown();
        setupStage(stateRef.current, 1);
        stateRef.current.mode = 'playing';
        renderNow();
        startLoop();
      }
    }, 800);
  }, [clearCountdown, renderNow, startLoop, stopLoop]);

  const spawnUnit = useCallback((typeKey) => {
    const state = stateRef.current;
    if (state.mode !== 'playing') return false;
    const template = ARCHETYPES[typeKey];
    if (!template) return false;
    if (state.aura < template.cost) return false;
    if ((state.cooldowns[typeKey] || 0) > 0) return false;
    state.aura -= template.cost;
    state.cooldowns[typeKey] = Math.round(template.cooldownMs * state.cooldownMultiplier);
    state.playerUnits.push(createPlayerUnit(state, typeKey));
    state.unitsSpawned += 1;
    audio.playSpawn();
    renderNow();
    return true;
  }, [renderNow]);

  const upgradeTrack = useCallback((trackKey) => {
    const state = stateRef.current;
    if (state.mode !== 'playing') return false;
    const track = UPGRADE_TRACKS[trackKey];
    if (!track) return false;
    const level = state.upgrades[trackKey] || 0;
    if (level >= track.maxLevel) return false;
    const cost = upgradeCost(trackKey, level);
    if (state.aura < cost) return false;
    state.aura -= cost;
    state.upgrades = { ...state.upgrades, [trackKey]: level + 1 };
    const oldMax = state.auraMax;
    recalcEconomy(state);
    if (trackKey === 'reservoir') state.aura = clamp(state.aura + (state.auraMax - oldMax) * 0.45, 0, state.auraMax);
    audio.playAuraUpgrade();
    renderNow();
    return true;
  }, [renderNow]);

  const useAbility = useCallback(() => {
    const state = stateRef.current;
    if (state.mode !== 'playing') return false;
    const used = usePetBurst(state);
    if (used) renderNow();
    return used;
  }, [renderNow]);

  const reset = useCallback(() => {
    stopLoop();
    clearCountdown();
    stateRef.current = createInitialState();
    renderNow();
  }, [clearCountdown, renderNow, stopLoop]);

  const getState = useCallback(() => stateRef.current, []);
  const setOnRender = useCallback((fn) => {
    onRenderRef.current = fn;
  }, []);

  useEffect(() => {
    return () => {
      stopLoop();
      clearCountdown();
    };
  }, [clearCountdown, stopLoop]);

  return useMemo(() => ({
    startGame,
    spawnUnit,
    upgradeTrack,
    useAbility,
    reset,
    getState,
    setOnRender,
    stopLoop,
  }), [startGame, spawnUnit, upgradeTrack, useAbility, reset, getState, setOnRender, stopLoop]);
}

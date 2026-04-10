const RESOURCE_KEYS = ['food', 'wood', 'stone', 'cloth', 'gold'];

const BUILDINGS = {
  farm: {
    id: 'farm',
    name: 'Farm',
    tier: 1,
    comboCost: 25,
    materials: {},
    buildMinutes: 5,
    width: 2,
    height: 2,
    category: 'food',
    production: { food: 2 },
    description: 'Reliable crop rows for your village.',
  },
  house: {
    id: 'house',
    name: 'House',
    tier: 1,
    comboCost: 30,
    materials: {},
    buildMinutes: 10,
    width: 2,
    height: 2,
    category: 'housing',
    housing: 2,
    description: 'A compact home for two pets.',
  },
  well: {
    id: 'well',
    name: 'Well',
    tier: 1,
    comboCost: 15,
    materials: {},
    buildMinutes: 3,
    width: 1,
    height: 1,
    category: 'support',
    farmAura: 0.1,
    description: 'Boosts nearby farm output.',
  },
  fishing_hut: {
    id: 'fishing_hut',
    name: 'Fishing Hut',
    tier: 1,
    comboCost: 35,
    materials: {},
    buildMinutes: 8,
    width: 2,
    height: 1,
    category: 'food',
    production: { food: 1.5 },
    requiresAdjacentWater: true,
    description: 'Pulls fresh food from nearby water.',
  },
  woodcutters_hut: {
    id: 'woodcutters_hut',
    name: "Woodcutter's Hut",
    tier: 1,
    comboCost: 20,
    materials: {},
    buildMinutes: 5,
    width: 1,
    height: 1,
    category: 'wood',
    production: { wood: 1 },
    description: 'Basic timber gathering.',
  },
  stone_pit: {
    id: 'stone_pit',
    name: 'Stone Pit',
    tier: 1,
    comboCost: 25,
    materials: {},
    buildMinutes: 8,
    width: 1,
    height: 1,
    category: 'stone',
    production: { stone: 0.8 },
    description: 'Simple stone extraction.',
  },
  path: {
    id: 'path',
    name: 'Path',
    tier: 1,
    comboCost: 5,
    materials: {},
    buildMinutes: 0,
    width: 1,
    height: 1,
    category: 'cosmetic',
    description: 'Cosmetic village paths.',
    maxLevel: 1,
  },
  lumberyard: {
    id: 'lumberyard',
    name: 'Lumberyard',
    tier: 2,
    comboCost: 30,
    materials: { wood: 15 },
    buildMinutes: 15,
    width: 2,
    height: 2,
    category: 'wood',
    production: { wood: 2 },
    description: 'Scaled-up timber processing.',
  },
  quarry: {
    id: 'quarry',
    name: 'Quarry',
    tier: 2,
    comboCost: 35,
    materials: { stone: 15 },
    buildMinutes: 20,
    width: 2,
    height: 2,
    category: 'stone',
    production: { stone: 1.5 },
    description: 'Heavy-duty stone production.',
  },
  weaving_hut: {
    id: 'weaving_hut',
    name: 'Weaving Hut',
    tier: 2,
    comboCost: 30,
    materials: { wood: 15 },
    buildMinutes: 15,
    width: 2,
    height: 2,
    category: 'cloth',
    production: { cloth: 1 },
    description: 'Turns local materials into cloth.',
  },
  market: {
    id: 'market',
    name: 'Market',
    tier: 2,
    comboCost: 50,
    materials: { wood: 20, stone: 10 },
    buildMinutes: 30,
    width: 2,
    height: 2,
    category: 'trade',
    description: 'Unlocks player trading.',
  },
  large_house: {
    id: 'large_house',
    name: 'Large House',
    tier: 2,
    comboCost: 40,
    materials: { wood: 15 },
    buildMinutes: 15,
    width: 3,
    height: 2,
    category: 'housing',
    housing: 4,
    description: 'Extra room for a growing village.',
  },
  garden: {
    id: 'garden',
    name: 'Garden',
    tier: 2,
    comboCost: 15,
    materials: { wood: 5 },
    buildMinutes: 5,
    width: 1,
    height: 1,
    category: 'support',
    happiness: 5,
    description: 'Raises village happiness.',
  },
  storehouse: {
    id: 'storehouse',
    name: 'Storehouse',
    tier: 2,
    comboCost: 40,
    materials: { wood: 15, stone: 10 },
    buildMinutes: 15,
    width: 2,
    height: 2,
    category: 'storage',
    storageBonus: 50,
    description: 'Increases all storage caps.',
  },
  trading_post: {
    id: 'trading_post',
    name: 'Trading Post',
    tier: 3,
    comboCost: 80,
    materials: { wood: 30, stone: 20 },
    buildMinutes: 45,
    width: 2,
    height: 2,
    category: 'gold',
    comboToGold: 1,
    description: 'Converts combos into gold each cycle.',
  },
  town_hall: {
    id: 'town_hall',
    name: 'Town Hall',
    tier: 3,
    comboCost: 120,
    materials: { wood: 50, stone: 40, cloth: 20 },
    buildMinutes: 60,
    width: 3,
    height: 3,
    category: 'support',
    globalProductionBonus: 0.1,
    description: 'Village-wide production boost.',
  },
  bakery: {
    id: 'bakery',
    name: 'Bakery',
    tier: 3,
    comboCost: 60,
    materials: { wood: 20, stone: 15 },
    buildMinutes: 30,
    width: 2,
    height: 2,
    category: 'food',
    globalFoodBonus: 0.25,
    description: 'Raises all food production.',
  },
  shrine: {
    id: 'shrine',
    name: 'Shrine',
    tier: 3,
    comboCost: 70,
    materials: { stone: 25, cloth: 15 },
    buildMinutes: 30,
    width: 2,
    height: 2,
    category: 'support',
    breedingIntervalHours: 16,
    description: 'Accelerates breeding checks.',
  },
  park: {
    id: 'park',
    name: 'Park',
    tier: 3,
    comboCost: 40,
    materials: { wood: 20, stone: 10 },
    buildMinutes: 15,
    width: 3,
    height: 3,
    category: 'support',
    happiness: 10,
    description: 'A gathering space that boosts happiness.',
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    tier: 3,
    comboCost: 80,
    materials: { wood: 30, stone: 25 },
    buildMinutes: 30,
    width: 3,
    height: 2,
    category: 'storage',
    storageBonus: 100,
    description: 'Major storage expansion.',
  },
  flower_bed: {
    id: 'flower_bed',
    name: 'Flower Bed',
    tier: 1,
    comboCost: 10,
    materials: {},
    buildMinutes: 0,
    width: 1,
    height: 1,
    category: 'cosmetic',
    happiness: 2,
    description: 'A colorful patch that cheers up your village.',
    maxLevel: 1,
  },
  watchtower: {
    id: 'watchtower',
    name: 'Watchtower',
    tier: 3,
    comboCost: 60,
    materials: { wood: 25, stone: 20 },
    buildMinutes: 20,
    width: 1,
    height: 1,
    category: 'support',
    wildlifeDefense: true,
    description: 'Deters wildlife and unlocks hunting encounters.',
  },
  tavern: {
    id: 'tavern',
    name: 'Tavern',
    tier: 2,
    comboCost: 45,
    materials: { wood: 20, stone: 10 },
    buildMinutes: 20,
    width: 2,
    height: 2,
    category: 'support',
    happiness: 8,
    description: 'A cozy gathering spot that boosts village morale.',
  },
};

const TIER_UNLOCKS = {
  1: 0,
  2: 6,
  3: 16,
};

function roundCost(value) {
  return Math.max(0, Math.floor(value));
}

function cloneMaterials(materials = {}) {
  return RESOURCE_KEYS.reduce((acc, key) => {
    if (materials[key]) acc[key] = materials[key];
    return acc;
  }, {});
}

function getBuildingDef(type) {
  return BUILDINGS[type] || null;
}

function getAllBuildingDefs() {
  return Object.values(BUILDINGS).map((def) => ({
    ...def,
    materials: cloneMaterials(def.materials),
    tierUnlockPopulation: TIER_UNLOCKS[def.tier] || 0,
    maxLevel: getMaxLevel(def.id),
    upgradeCost: getUpgradeCost(def.id, 2),
  }));
}

function getTierUnlockPopulation(tier) {
  return TIER_UNLOCKS[tier] || 0;
}

function getMaxLevel(type) {
  const def = getBuildingDef(type);
  if (!def) return 1;
  if (typeof def.maxLevel === 'number') return def.maxLevel;
  return def.category === 'cosmetic' ? 1 : 3;
}

function getWorkerCapacity(type, level = 1) {
  const def = getBuildingDef(type);
  if (!def || (!def.production && !def.comboToGold)) return 0;
  return Math.max(0, Math.min(getMaxLevel(type), Number(level) || 1));
}

function getLevelMultiplier(level = 1) {
  return 1 + (Math.max(1, Number(level) || 1) - 1) * 0.5;
}

function getBuildCost(type) {
  const def = getBuildingDef(type);
  if (!def) return null;
  return {
    combos: def.comboCost || 0,
    materials: cloneMaterials(def.materials),
  };
}

function getUpgradeCost(type, nextLevel) {
  const def = getBuildingDef(type);
  if (!def || nextLevel <= 1 || nextLevel > getMaxLevel(type)) return null;
  const factor = 0.75 * (nextLevel - 1);
  const materials = Object.fromEntries(
    Object.entries(def.materials || {})
      .map(([key, value]) => [key, roundCost(value * factor)])
      .filter(([, value]) => value > 0)
  );
  return {
    combos: roundCost((def.comboCost || 0) * factor),
    materials,
  };
}

function getTotalInvestedCost(building) {
  const def = getBuildingDef(building?.building_type || building?.type);
  if (!def) return { combos: 0, materials: {} };
  const base = getBuildCost(def.id);
  const total = {
    combos: base.combos,
    materials: { ...base.materials },
  };
  const currentLevel = Math.max(1, Number(building?.level) || 1);
  for (let level = 2; level <= currentLevel; level += 1) {
    const cost = getUpgradeCost(def.id, level);
    if (!cost) continue;
    total.combos += cost.combos;
    for (const [key, value] of Object.entries(cost.materials)) {
      total.materials[key] = (total.materials[key] || 0) + value;
    }
  }
  return total;
}

function getBuildingProduction(type, level = 1) {
  const def = getBuildingDef(type);
  if (!def || !def.production) return null;
  const mult = getLevelMultiplier(level);
  return Object.fromEntries(
    Object.entries(def.production).map(([key, value]) => [key, value * mult])
  );
}

module.exports = {
  RESOURCE_KEYS,
  BUILDINGS,
  TIER_UNLOCKS,
  getBuildingDef,
  getAllBuildingDefs,
  getTierUnlockPopulation,
  getWorkerCapacity,
  getLevelMultiplier,
  getBuildCost,
  getUpgradeCost,
  getTotalInvestedCost,
  getBuildingProduction,
  getMaxLevel,
};

const {
  RESOURCE_KEYS,
  getBuildingDef,
  getBuildingProduction,
  getLevelMultiplier,
  getWorkerCapacity,
} = require('./buildings');
const { getBiomeDef } = require('./biomes');

const SIM_STEP_MS = 15 * 60 * 1000;
const MAX_OFFLINE_MS = 72 * 60 * 60 * 1000;
const GLOBAL_POP_CAP = 50;
const BASE_CAPS = {
  food: 100,
  wood: 100,
  stone: 50,
  cloth: 50,
  gold: 50,
};

// Phase caps per spec: phase 1 = 10, phase 2 = 10, phase 3 = 25, phase 4+ = 50
// Phases map to expansion count: 0→p1, 1-2→p2, 3-4→p3, 5+→p4
function getPhase(expansions) {
  const n = Number(expansions) || 0;
  if (n >= 5) return 4;
  if (n >= 3) return 3;
  if (n >= 1) return 2;
  return 1;
}

function getPhaseCap(expansions) {
  const phase = getPhase(expansions);
  if (phase >= 4) return 50;
  if (phase >= 3) return 25;
  return 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundResource(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseSqliteDate(value, fallback = Date.now()) {
  if (!value) return new Date(fallback);
  const normalized = String(value).includes('T')
    ? String(value)
    : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : new Date(fallback);
}

function toSqliteDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getBuildingLevel(building) {
  return Math.max(1, Number(building?.level) || 1);
}

function isBuildingBuiltAt(building, timeMs) {
  return parseSqliteDate(building.build_complete_at).getTime() <= timeMs;
}

function getActiveBuildings(buildings, timeMs) {
  return buildings.filter((building) => isBuildingBuiltAt(building, timeMs));
}

function getBuildingFootprint(building) {
  const def = getBuildingDef(building.building_type || building.type);
  const width = Number(building.width) || def?.width || 1;
  const height = Number(building.height) || def?.height || 1;
  return {
    x: Number(building.grid_x) || 0,
    y: Number(building.grid_y) || 0,
    width,
    height,
  };
}

function getDerivedState(world, buildings, timeMs) {
  const activeBuildings = getActiveBuildings(buildings, timeMs);
  const caps = { ...BASE_CAPS };
  let housing = 0;
  let assignedWorkers = 0;
  let townHallBonus = 0;
  let bakeryBonus = 0;
  let hasShrine = false;
  let happinessBonus = 0;

  for (const building of activeBuildings) {
    const def = getBuildingDef(building.building_type);
    if (!def) continue;
    const levelMult = getLevelMultiplier(getBuildingLevel(building));
    if (def.housing) housing += def.housing * getBuildingLevel(building);
    if (def.storageBonus) {
      const bonus = def.storageBonus * getBuildingLevel(building);
      for (const key of RESOURCE_KEYS) caps[key] += bonus;
    }
    if (def.globalProductionBonus) townHallBonus += def.globalProductionBonus * getBuildingLevel(building);
    if (def.globalFoodBonus) bakeryBonus += def.globalFoodBonus * getBuildingLevel(building);
    if (def.breedingIntervalHours) hasShrine = true;
    if (def.happiness) happinessBonus += def.happiness * getBuildingLevel(building);
    assignedWorkers += clamp(Number(building.workers) || 0, 0, getWorkerCapacity(building.building_type, getBuildingLevel(building)));
    void levelMult;
  }

  return {
    activeBuildings,
    caps,
    housing,
    assignedWorkers,
    availableWorkers: Math.max(0, (Number(world.population) || 0) - 2),
    townHallBonus,
    bakeryBonus,
    hasShrine,
    happinessBonus,
  };
}

function getBiomeMultiplier(world, resourceKey) {
  const specialty = world.biome_specialty || getBiomeDef(world.biome).specialty;
  return specialty === resourceKey ? 1.25 : 1;
}

function overlapsRadius(source, target, radiusTiles = 3) {
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  return Math.abs(sourceCenterX - targetCenterX) <= radiusTiles
    && Math.abs(sourceCenterY - targetCenterY) <= radiusTiles;
}

function getProductionMultiplier(world, building, activeBuildings, stepEndMs) {
  const def = getBuildingDef(building.building_type);
  if (!def || !def.production) return 1;
  let mult = 1;
  const workers = clamp(Number(building.workers) || 0, 0, getWorkerCapacity(building.building_type, getBuildingLevel(building)));
  mult *= 1 + workers * 0.5;
  mult *= getLevelMultiplier(getBuildingLevel(building));
  const derived = getDerivedState(world, activeBuildings, stepEndMs);
  mult *= 1 + derived.townHallBonus;
  if (def.category === 'food') mult *= 1 + derived.bakeryBonus;
  if (def.id === 'farm') {
    const farmFootprint = getBuildingFootprint(building);
    const nearbyWells = derived.activeBuildings.filter((candidate) => {
      const candidateDef = getBuildingDef(candidate.building_type);
      return candidateDef?.farmAura && overlapsRadius(getBuildingFootprint(candidate), farmFootprint, 3);
    });
    nearbyWells.forEach((well) => {
      const wellDef = getBuildingDef(well.building_type);
      mult *= 1 + ((wellDef?.farmAura || 0) * getBuildingLevel(well));
    });
  }
  // Terrain feature proximity bonuses
  const features = world._gridFeatures || [];
  if (features.length > 0) {
    const bFoot = getBuildingFootprint(building);
    const featureBonusMap = {
      pond: ['food'],           // fishing/farming near water
      grove: ['wood', 'cloth'], // harvesting near groves
      quarry: ['stone', 'gold'], // mining near quarries
      reed: ['cloth'],          // weaving near reeds
      flower: ['cosmetic'],     // cosmetic near flowers
    };
    for (const feature of features) {
      const categories = featureBonusMap[feature.type];
      if (!categories || !categories.includes(def.category)) continue;
      const featureCenter = { x: feature.x, y: feature.y, width: feature.w || 1, height: feature.h || 1 };
      if (overlapsRadius(bFoot, featureCenter, 4)) {
        mult *= 1.1; // +10% for nearby matching terrain feature
        break; // only one feature bonus per building
      }
    }
  }
  // Seasonal event bonuses
  const seasonalBonuses = world._seasonalBonuses || {};
  if (seasonalBonuses[def.category]) {
    mult *= 1 + seasonalBonuses[def.category];
  }

  return mult;
}

function crossesBoundary(startMs, endMs, intervalHours, epochMs) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const prev = Math.floor((startMs - epochMs) / intervalMs);
  const next = Math.floor((endMs - epochMs) / intervalMs);
  return next > prev;
}

function findLeastProductiveAssignedBuilding(world, buildings, timeMs) {
  const activeBuildings = getActiveBuildings(buildings, timeMs)
    .filter((building) => (Number(building.workers) || 0) > 0);
  if (activeBuildings.length === 0) return null;
  return activeBuildings
    .map((building) => {
      const production = getBuildingProduction(building.building_type, getBuildingLevel(building)) || {};
      const perHour = Object.values(production).reduce((sum, value) => sum + value, 0);
      return { building, perHour };
    })
    .sort((a, b) => a.perHour - b.perHour)[0]?.building || null;
}

function syncWorkerAssignments(world, buildings, timeMs) {
  const available = Math.max(0, (Number(world.population) || 0) - 2);
  let assigned = 0;
  const activeBuildings = getActiveBuildings(buildings, timeMs);
  for (const building of activeBuildings) {
    const maxWorkers = getWorkerCapacity(building.building_type, getBuildingLevel(building));
    const nextWorkers = clamp(Number(building.workers) || 0, 0, maxWorkers);
    building.workers = nextWorkers;
    assigned += nextWorkers;
  }
  while (assigned > available) {
    const target = findLeastProductiveAssignedBuilding(world, buildings, timeMs);
    if (!target) break;
    target.workers = Math.max(0, (Number(target.workers) || 0) - 1);
    assigned -= 1;
  }
}

function clampResources(world, caps) {
  RESOURCE_KEYS.forEach((key) => {
    world[key] = roundResource(clamp(Number(world[key]) || 0, 0, caps[key]));
  });
}

function applyConstructionVisibility(buildings, nowMs) {
  for (const building of buildings) {
    if (building.state === 'building' && parseSqliteDate(building.build_complete_at).getTime() <= nowMs) {
      building.state = 'built';
    }
  }
}

function simulateWorld(worldRow, buildingRows, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const nowMs = now.getTime();
  const world = { ...worldRow };
  const buildings = buildingRows.map((building) => ({ ...building }));
  const epochMs = parseSqliteDate(world.created_at).getTime();
  const lastTickMs = parseSqliteDate(world.last_tick_at || world.created_at, nowMs).getTime();
  const elapsedMs = clamp(nowMs - lastTickMs, 0, MAX_OFFLINE_MS);
  const stepsToRun = Math.floor(elapsedMs / SIM_STEP_MS);
  const phaseCap = Math.min(GLOBAL_POP_CAP, Number(options.phaseCap) || getPhaseCap(Number(world.expansions) || 0));

  // Attach grid features for terrain proximity bonuses
  if (options.gridFeatures) world._gridFeatures = options.gridFeatures;

  // Attach seasonal bonuses for event-based production boosts
  if (options.seasonalBonuses) world._seasonalBonuses = options.seasonalBonuses;
  const seasonalHappiness = Number(options.seasonalHappinessBonus) || 0;

  applyConstructionVisibility(buildings, nowMs);

  let comboBalance = Number(options.comboBalance) || 0;
  let totalComboConsumed = 0;

  let simTime = lastTickMs;
  if (stepsToRun > 0) {
    for (let step = 0; step < stepsToRun; step += 1) {
      const stepStart = simTime;
      const stepEnd = simTime + SIM_STEP_MS;
      simTime = stepEnd;
      const activeBuildings = getActiveBuildings(buildings, stepEnd);

      // Resource production
      for (const building of activeBuildings) {
        const def = getBuildingDef(building.building_type);
        if (!def?.production) continue;
        const buildCompleteMs = parseSqliteDate(building.build_complete_at).getTime();
        if (buildCompleteMs >= stepEnd) continue;
        const producingStart = Math.max(stepStart, buildCompleteMs);
        const producingMinutes = Math.max(0, (stepEnd - producingStart) / 60000);
        if (producingMinutes <= 0) continue;
        const production = getBuildingProduction(building.building_type, getBuildingLevel(building)) || {};
        const bonusMult = getProductionMultiplier(world, building, buildings, stepEnd);
        for (const [resourceKey, rate] of Object.entries(production)) {
          const biomeBonus = getBiomeMultiplier(world, resourceKey);
          world[resourceKey] = roundResource((Number(world[resourceKey]) || 0) + rate * (producingMinutes / 60) * bonusMult * biomeBonus);
        }
      }

      // Trading post: consume combos → produce gold
      for (const building of activeBuildings) {
        const def = getBuildingDef(building.building_type);
        if (!def?.comboToGold) continue;
        const workers = clamp(Number(building.workers) || 0, 0, getWorkerCapacity(building.building_type, getBuildingLevel(building)));
        const mult = (1 + workers * 0.5) * getLevelMultiplier(getBuildingLevel(building));
        const combosWanted = Math.floor(def.comboToGold * mult);
        const combosUsed = Math.min(combosWanted, Math.max(0, comboBalance));
        if (combosUsed > 0) {
          world.gold = roundResource((Number(world.gold) || 0) + combosUsed);
          comboBalance -= combosUsed;
          totalComboConsumed += combosUsed;
        }
      }

      const derivedBeforeUpkeep = getDerivedState(world, buildings, stepEnd);
      clampResources(world, derivedBeforeUpkeep.caps);

      // Food upkeep
      world.food = roundResource((Number(world.food) || 0) - ((Number(world.population) || 0) * 0.25 * 0.25));
      if (world.food < 0 && (Number(world.population) || 0) > 0) {
        world.population = Math.max(0, (Number(world.population) || 0) - 1);
        world.food = 0;
        world.happiness = clamp((Number(world.happiness) || 0) - 10, 0, 100);
        syncWorkerAssignments(world, buildings, stepEnd);
      }

      const derivedAfterUpkeep = getDerivedState(world, buildings, stepEnd);

      // Breeding check
      const breedingInterval = derivedAfterUpkeep.hasShrine ? 16 : 24;
      if (
        crossesBoundary(stepStart, stepEnd, breedingInterval, epochMs)
        && (Number(world.population) || 0) >= 2
        && (Number(world.food) || 0) >= 10
        && derivedAfterUpkeep.housing > (Number(world.population) || 0)
        && (Number(world.happiness) || 0) > 60
        && (Number(world.population) || 0) < phaseCap
      ) {
        world.population = Math.min(phaseCap, (Number(world.population) || 0) + 1);
      }

      // Happiness decay every 48h (only above 50 base)
      if (crossesBoundary(stepStart, stepEnd, 48, epochMs) && (Number(world.happiness) || 0) > 50) {
        world.happiness = clamp((Number(world.happiness) || 0) - 1, 0, 100);
      }

      // Happiness recovery from buildings (Garden, Park, etc.) + seasonal bonuses
      const happinessTarget = Math.min(100, 50 + derivedAfterUpkeep.happinessBonus + seasonalHappiness);
      if ((Number(world.happiness) || 0) < happinessTarget) {
        world.happiness = clamp((Number(world.happiness) || 0) + 0.5, 0, 100);
      }

      syncWorkerAssignments(world, buildings, stepEnd);
      const derivedAtEnd = getDerivedState(world, buildings, stepEnd);
      clampResources(world, derivedAtEnd.caps);
    }
  }

  world.last_tick_at = toSqliteDate(lastTickMs + (stepsToRun * SIM_STEP_MS));
  const currentDerived = getDerivedState(world, buildings, nowMs);
  clampResources(world, currentDerived.caps);
  world.food_capacity = currentDerived.caps.food;
  world.wood_capacity = currentDerived.caps.wood;
  world.stone_capacity = currentDerived.caps.stone;
  world.cloth_capacity = currentDerived.caps.cloth;
  world.gold_capacity = currentDerived.caps.gold;
  world.population = clamp(Number(world.population) || 0, 0, GLOBAL_POP_CAP);
  world.happiness = clamp(Number(world.happiness) || 0, 0, 100);
  syncWorkerAssignments(world, buildings, nowMs);

  return {
    world,
    buildings,
    derived: {
      ...currentDerived,
      phaseCap,
      happinessTarget: Math.min(100, 50 + currentDerived.happinessBonus + seasonalHappiness),
      unassignedPets: Math.max(0, (Number(world.population) || 0) - currentDerived.assignedWorkers),
    },
    stepsToRun,
    comboConsumed: totalComboConsumed,
  };
}

module.exports = {
  SIM_STEP_MS,
  MAX_OFFLINE_MS,
  BASE_CAPS,
  GLOBAL_POP_CAP,
  getPhase,
  getPhaseCap,
  parseSqliteDate,
  toSqliteDate,
  getDerivedState,
  simulateWorld,
  roundResource,
  clamp,
};

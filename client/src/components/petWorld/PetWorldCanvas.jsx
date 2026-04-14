import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeTerrainGrid,
  drawTerrainRegion,
  drawTile,
  drawBuildingSprite,
  drawConstructionOverlay,
  drawSelectionOutline,
  drawGhostFootprint,
  drawPetWander,
  drawVillageResident,
  drawAmbientCritter,
} from './petWorldSprites';
import { drawCuteFantasyFishingDecor } from './petWorldCuteFantasySprites';
import { getBuildingSize, getBuildingUi } from './petWorldBuildings';
import { getBiomeUi } from './petWorldTiles';

const BASE_TILE_SIZE = 32;
const FIXED_ZOOM = 1.4;
const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 300;
const MINIMAP_W = 120;
const MINIMAP_H = 80;
const MINIMAP_PADDING = 8;
const LERP_SPEED = 0.15;
// Only pro-generated pets: one Dojocat + one Buu per world
const RESIDENT_STYLES = ['teal', 'berry', 'ochre', 'slate', 'moss', 'plum'];
const ENCOUNTER_SPECIES = {
  fox_raid: 'fox',
  wolf_pack: 'wolf',
  bear_sighting: 'bear',
  deer_herd: 'deer',
  rare_bird: 'rare_bird',
};

const WORK_BUILDINGS = new Set([
  'farm',
  'fishing_hut',
  'woodcutters_hut',
  'stone_pit',
  'lumberyard',
  'quarry',
  'weaving_hut',
  'market',
  'storehouse',
  'trading_post',
  'bakery',
  'warehouse',
  'watchtower',
  'tavern',
]);

const HOME_BUILDINGS = new Set(['house', 'large_house']);
const COMMON_BUILDINGS = new Set(['well', 'market', 'town_hall', 'shrine', 'park', 'tavern', 'trading_post']);
const SOCIAL_BUILDINGS = new Set(['market', 'tavern', 'park', 'town_hall', 'trading_post']);
const QUIET_BUILDINGS = new Set(['well', 'shrine']);
const ACTIVE_MARKER_BUILDINGS = new Set([
  'farm',
  'fishing_hut',
  'woodcutters_hut',
  'lumberyard',
  'quarry',
  'stone_pit',
  'market',
  'trading_post',
  'storehouse',
  'warehouse',
  'tavern',
  'watchtower',
  'shrine',
]);

const NO_INTERIOR_TYPES = new Set(['path', 'fence', 'well', 'garden', 'flower_bed', 'park']);
const WALK_BLOCKERS = new Set(['water', 'rock', 'tree', 'bush', 'stump']);
const RESIDENT_WALK_OPTIONS = { maxShoreStrength: 0.32, maxWaterRatio: 0.11 };
const ROAMING_WALK_OPTIONS = { maxShoreStrength: 0.28, maxWaterRatio: 0.095 };
const ENCOUNTER_WALK_OPTIONS = { maxShoreStrength: 0.24, maxWaterRatio: 0.09 };
const LAND_ANIMAL_WALK_OPTIONS = { maxShoreStrength: 0.025, maxWaterRatio: 0.008 };
const ENTITY_DROP_WALK_OPTIONS = { maxShoreStrength: 0.3, maxWaterRatio: 0.12 };
const WATER_ANIMAL_SPECIES = new Set(['duck', 'fish_koi', 'fish_perch']);

const GROUND_ANIMAL_PROFILES = {
  rabbit: {
    scale: 0.56,
    yBias: 0.82,
    idleFacing: 2,
    pauseFacing: 2,
    sideOnlyFacing: true,
    defaultSideFacing: -1,
    walkCyclesPerTile: 1.35,
    idleFrameRate: 0.00004,
    route: {
      stopCount: 3, minDist: 2, maxDist: 5, pauseBase: 15000, pauseVariance: 5200, speed: 0.5,
      sideOnlyMovement: true, stopRadiusX: 0.07, stopRadiusY: 0.04,
    },
  },
  horse: {
    scale: 0.68,
    yBias: 0.82,
    idleFacing: 2,
    pauseFacing: 2,
    walkCyclesPerTile: 1.15,
    idleFrameRate: 0.00002,
    route: { stopCount: 2, minDist: 3, maxDist: 6, pauseBase: 18000, pauseVariance: 6800, speed: 0.48 },
  },
  pig: {
    scale: 0.68,
    yBias: 0.82,
    idleFacing: 2,
    pauseFacing: 2,
    walkCyclesPerTile: 0.9,
    idleFrameRate: 0.00001,
    route: { stopCount: 2, minDist: 1, maxDist: 3, pauseBase: 24000, pauseVariance: 9000, speed: 0.34 },
  },
  sheep: {
    scale: 0.68,
    yBias: 0.82,
    idleFacing: 2,
    pauseFacing: 2,
    walkCyclesPerTile: 0.92,
    idleFrameRate: 0.000012,
    route: { stopCount: 2, minDist: 1, maxDist: 3, pauseBase: 22000, pauseVariance: 8200, speed: 0.34 },
  },
  cow: {
    scale: 0.76,
    yBias: 0.82,
    idleFacing: 2,
    pauseFacing: 2,
    walkCyclesPerTile: 0.86,
    idleFrameRate: 0.00001,
    route: { stopCount: 2, minDist: 1, maxDist: 3, pauseBase: 26000, pauseVariance: 9000, speed: 0.32 },
  },
  chicken: {
    scale: 0.56,
    yBias: 0.82,
    idleFacing: 2,
    pauseFacing: 2,
    sideOnlyFacing: true,
    defaultSideFacing: -1,
    walkCyclesPerTile: 1.25,
    idleFrameRate: 0.0002,
    route: {
      stopCount: 3, minDist: 1, maxDist: 2, pauseBase: 16000, pauseVariance: 5200, speed: 0.42,
      sideOnlyMovement: true, stopRadiusX: 0.06, stopRadiusY: 0.035,
    },
  },
  fox: {
    scale: 0.56,
    yBias: 0.82,
    idleFacing: 2,
    pauseFacing: 2,
    sideOnlyFacing: true,
    defaultSideFacing: -1,
    walkCyclesPerTile: 1.3,
    idleFrameRate: 0.00005,
    route: {
      stopCount: 3, minDist: 2, maxDist: 5, pauseBase: 14000, pauseVariance: 5000, speed: 0.52,
      sideOnlyMovement: true, stopRadiusX: 0.07, stopRadiusY: 0.04,
    },
  },
  goose: {
    scale: 0.78,
    yBias: 0.82,
    idleFacing: 2,
    pauseFacing: 2,
    sideOnlyFacing: true,
    defaultSideFacing: -1,
    walkCyclesPerTile: 0.95,
    idleFrameRate: 0.00004,
    route: {
      stopCount: 2, minDist: 2, maxDist: 4, pauseBase: 18000, pauseVariance: 6000, speed: 0.38,
      sideOnlyMovement: true, stopRadiusX: 0.06, stopRadiusY: 0.035,
    },
  },
};

function getBuildingMap(buildings = []) {
  return new Map(buildings.map((building) => [building.id, building]));
}

function hash01(seed, salt = 0) {
  const value = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function tileKey(x, y) {
  return `${x}:${y}`;
}

/* ── Entity identity keys (stable across useMemo recomputations) ── */

function residentKey(resident) {
  return `resident:${resident.palette}:${resident.seed}`;
}

function animalKey(animal) {
  return `animal:${animal.species}:${animal.seed}`;
}

function petKey(pet) {
  return `pet:${pet.character}:${pet.seed}`;
}

function entityDisplayName(entry) {
  if (entry.type === 'resident') return 'Villager';
  if (entry.type === 'pet') {
    const names = { dojocat: 'Dojocat', buu: 'Buu', devit: 'Devit', pixiu: 'Pixiu' };
    return names[entry.entity?.character] || 'Hero';
  }
  if (entry.type === 'animal') {
    const names = {
      rabbit: 'Rabbit',
      horse: 'Horse',
      deer: 'Horse',
      pig: 'Pig',
      sheep: 'Sheep',
      cow: 'Cow',
      chicken: 'Chicken',
      boar: 'Pig',
      fox: 'Fox',
      duck: 'Duck',
      goose: 'Goose',
    };
    return names[entry.entity?.species] || 'Critter';
  }
  return 'Entity';
}

function residentCanFish(resident) {
  return resident?.workBuildingType === 'fishing_hut';
}

function residentCanChopWood(resident) {
  return ['woodcutters_hut', 'lumberyard'].includes(resident?.workBuildingType || '');
}

function pickResidentPalette(index, workBuildingType = null) {
  if (workBuildingType === 'fishing_hut') return 'teal';
  if (['woodcutters_hut', 'lumberyard'].includes(workBuildingType || '')) return 'moss';
  if (workBuildingType === 'farm') return 'ochre';
  if (['quarry', 'stone_pit'].includes(workBuildingType || '')) return 'slate';
  const civilianPalettes = ['berry', 'plum', 'ochre', 'slate'];
  return civilianPalettes[index % civilianPalettes.length];
}

/* ── Entity hit detection ── */

function findNearestEntity(entityPositions, clientX, clientY, canvasRect) {
  if (!canvasRect) return null;
  const localX = clientX - canvasRect.left;
  const localY = clientY - canvasRect.top;
  let best = null;
  let bestDist = Infinity;
  for (const entry of entityPositions) {
    const dx = entry.screenX - localX;
    const dy = entry.screenY - localY;
    const dist = Math.hypot(dx, dy);
    if (dist < entry.hitRadius && dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

/* ── Entity placement validation ── */

function isEntityPlacementValid(grid, terrainRegions, tx, ty, carryingEntity = null) {
  if (!grid) return false;
  if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return false;
  const tile = grid.tiles[ty]?.[tx];
  if (!tile) return false;
  if (tile.b != null) return false;
  if (carryingEntity?.type === 'animal') {
    const species = carryingEntity.entity?.species;
    if (WATER_ANIMAL_SPECIES.has(species)) {
      return tile.t === 'water';
    }
    if (species === 'goose') {
      return isGridTileWalkable(grid, terrainRegions, tx, ty, ROAMING_WALK_OPTIONS);
    }
    return isStrictInlandTile(grid, terrainRegions, { x: tx, y: ty }, LAND_ANIMAL_WALK_OPTIONS);
  }
  if (carryingEntity?.type === 'resident') {
    return isGridTileWalkable(grid, terrainRegions, tx, ty, ENTITY_DROP_WALK_OPTIONS);
  }
  if (carryingEntity?.type === 'pet') {
    return isGridTileWalkable(grid, terrainRegions, tx, ty, ENTITY_DROP_WALK_OPTIONS);
  }
  return !WALK_BLOCKERS.has(tile.t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function findClearTiles(grid) {
  const result = [];
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      const tile = grid.tiles[y]?.[x];
      if (!tile) continue;
      if (tile.b == null && !WALK_BLOCKERS.has(tile.t)) {
        result.push({ x, y });
      }
    }
  }
  return result;
}

function findTilesByType(grid, type) {
  const result = [];
  if (!grid) return result;
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      const tile = grid.tiles[y]?.[x];
      if (tile?.t === type) result.push({ x, y });
    }
  }
  return result;
}

function buildLandComponents(grid, terrainRegions, walkOptions = {}, buildings = []) {
  if (!grid) return { components: [], componentByKey: new Map(), tiles: [] };

  const tiles = [];
  const tileSet = new Set();
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      if (!isGridTileWalkable(grid, terrainRegions, x, y, walkOptions)) continue;
      const tile = { x, y };
      tiles.push(tile);
      tileSet.add(tileKey(x, y));
    }
  }

  const componentByKey = new Map();
  const components = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  tiles.forEach((tile) => {
    const startKey = tileKey(tile.x, tile.y);
    if (componentByKey.has(startKey)) return;

    const queue = [tile];
    const component = [];
    componentByKey.set(startKey, components.length);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      dirs.forEach(([dx, dy]) => {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = tileKey(nx, ny);
        if (!tileSet.has(key) || componentByKey.has(key)) return;
        componentByKey.set(key, components.length);
        queue.push({ x: nx, y: ny });
      });
    }
    components.push(component);
  });

  const componentScores = components.map((component) => component.length);
  const builtBuildings = buildings.filter((building) => building.state === 'built');
  builtBuildings.forEach((building) => {
    const left = building.grid_x - 1;
    const right = building.grid_x + building.width;
    const top = building.grid_y - 1;
    const bottom = building.grid_y + building.height;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const outsideFootprint = x < building.grid_x || x >= building.grid_x + building.width || y < building.grid_y || y >= building.grid_y + building.height;
        if (!outsideFootprint) continue;
        const componentIndex = componentByKey.get(tileKey(x, y));
        if (componentIndex == null) continue;
        componentScores[componentIndex] += 48;
      }
    }
  });

  const ranked = components
    .map((component, index) => ({ component, index, score: componentScores[index] }))
    .sort((a, b) => b.score - a.score);
  const primary = ranked[0]?.component || [];
  const primaryKeys = new Set(primary.map((tile) => tileKey(tile.x, tile.y)));
  return {
    components,
    componentByKey,
    tiles,
    primary,
    primaryKeys,
  };
}

function pickFromPool(pool, index, fallback = null) {
  if (pool?.length) return pool[((index % pool.length) + pool.length) % pool.length];
  return fallback;
}

function expandWeightedStops(stops, weightFn) {
  const expanded = [];
  stops.forEach((stop) => {
    const weight = Math.max(1, Math.round(weightFn(stop)));
    for (let i = 0; i < weight; i += 1) expanded.push(stop);
  });
  return expanded;
}

function getTileClearanceOffset(tile, clearance) {
  if (!tile || !clearance?.grid) return { x: 0, y: 0 };
  const { grid, terrainRegions, walkOptions, padding = 0.12 } = clearance;
  const isBlocked = (tx, ty) => !isGridTileWalkable(grid, terrainRegions, tx, ty, walkOptions);
  let pushX = 0;
  let pushY = 0;
  if (isBlocked(tile.x - 1, tile.y)) pushX += padding;
  if (isBlocked(tile.x + 1, tile.y)) pushX -= padding;
  if (isBlocked(tile.x, tile.y - 1)) pushY += padding;
  if (isBlocked(tile.x, tile.y + 1)) pushY -= padding;
  if (isBlocked(tile.x - 1, tile.y - 1)) {
    pushX += padding * 0.35;
    pushY += padding * 0.35;
  }
  if (isBlocked(tile.x + 1, tile.y - 1)) {
    pushX -= padding * 0.35;
    pushY += padding * 0.35;
  }
  if (isBlocked(tile.x - 1, tile.y + 1)) {
    pushX += padding * 0.35;
    pushY -= padding * 0.35;
  }
  if (isBlocked(tile.x + 1, tile.y + 1)) {
    pushX -= padding * 0.35;
    pushY -= padding * 0.35;
  }
  return {
    x: clamp(pushX, -padding, padding),
    y: clamp(pushY, -padding, padding),
  };
}

function pointFromTile(tile, seed, radiusX = 0.08, radiusY = 0.06, clearance = null) {
  if (!tile) return null;
  const clearanceOffset = getTileClearanceOffset(tile, clearance);
  const offsetX = (hash01(seed, 1) - 0.5) * radiusX * 2;
  const offsetY = (hash01(seed, 2) - 0.5) * radiusY * 2;
  return {
    x: tile.x + 0.5 + clamp(clearanceOffset.x + offsetX, -0.22, 0.22),
    y: tile.y + 0.5 + clamp(clearanceOffset.y + offsetY, -0.2, 0.2),
    tileX: tile.x,
    tileY: tile.y,
    role: tile.role || 'path',
    pauseFacing: tile.pauseFacing ?? tile.fishingFacing ?? null,
    buildingType: tile.buildingType || null,
    anchorKind: tile.anchorKind || null,
    buildingId: tile.buildingId || null,
    fishingFacing: tile.fishingFacing || null,
    castTargetX: tile.castTargetX ?? null,
    castTargetY: tile.castTargetY ?? null,
    shoreDir: tile.shoreDir || null,
    fishingSpotId: tile.fishingSpotId || null,
  };
}

function pickVillageAnchor(roamTiles, buildings = [], seed = 0) {
  if (!roamTiles?.length) return null;
  const builtBuildings = (buildings || []).filter((building) => building.state === 'built');
  if (!builtBuildings.length) return null;

  let weightedX = 0;
  let weightedY = 0;
  let weightTotal = 0;
  builtBuildings.forEach((building, index) => {
    const width = Math.max(1, Number(building.width) || 1);
    const height = Math.max(1, Number(building.height) || 1);
    const areaWeight = Math.max(1, width * height);
    const centerX = (Number(building.grid_x) || 0) + width / 2;
    const centerY = (Number(building.grid_y) || 0) + height / 2;
    const jitterX = (hash01(seed + index * 17, 21) - 0.5) * 0.35;
    const jitterY = (hash01(seed + index * 19, 22) - 0.5) * 0.35;
    weightedX += (centerX + jitterX) * areaWeight;
    weightedY += (centerY + jitterY) * areaWeight;
    weightTotal += areaWeight;
  });

  const targetX = weightedX / Math.max(1, weightTotal);
  const targetY = weightedY / Math.max(1, weightTotal);
  let best = roamTiles[0];
  let bestScore = Infinity;
  roamTiles.forEach((tile, index) => {
    const dx = (tile.x + 0.5) - targetX;
    const dy = (tile.y + 0.5) - targetY;
    const score = Math.hypot(dx, dy) + hash01(seed + index * 23, 24) * 0.18;
    if (score < bestScore) {
      bestScore = score;
      best = tile;
    }
  });
  return best;
}

function isStrictInlandTile(grid, terrainRegions, tile, walkOptions = LAND_ANIMAL_WALK_OPTIONS) {
  if (!tile) return false;
  const { x, y } = tile;
  if (!isGridTileWalkable(grid, terrainRegions, x, y, walkOptions)) return false;
  const terrain = terrainRegions?.[y]?.[x];
  if ((terrain?.shoreStrength || 0) > (walkOptions.maxShoreStrength ?? 0.025)) return false;
  if ((terrain?.waterRatio || 0) > (walkOptions.maxWaterRatio ?? 0.008)) return false;

  for (let ny = y - 1; ny <= y + 1; ny += 1) {
    for (let nx = x - 1; nx <= x + 1; nx += 1) {
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      const neighborTile = grid.tiles[ny]?.[nx];
      const neighborTerrain = terrainRegions?.[ny]?.[nx];
      if (neighborTile?.t === 'water') return false;
      if ((neighborTerrain?.waterRatio || 0) > 0.04) return false;
      if ((neighborTerrain?.shoreStrength || 0) > 0.12) return false;
    }
  }
  return true;
}

function buildVillageAnimalPool(grid, terrainRegions, roamTiles, buildings = [], seed = 0) {
  if (!grid || !roamTiles?.length) return [];
  const villageAnchor = pickVillageAnchor(roamTiles, buildings, seed) || roamTiles[0];
  const inlandTiles = roamTiles.filter((tile) => isStrictInlandTile(grid, terrainRegions, tile));
  if (!inlandTiles.length) return [];

  const anchorX = villageAnchor?.x ?? inlandTiles[0].x;
  const anchorY = villageAnchor?.y ?? inlandTiles[0].y;
  const nearbyTiles = inlandTiles.filter((tile) => {
    const distance = Math.abs(tile.x - anchorX) + Math.abs(tile.y - anchorY);
    return distance <= 9;
  });
  const meadowNearbyTiles = nearbyTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.meadowStrength || 0) > 0.2);
  const villageCoreTiles = meadowNearbyTiles.length ? meadowNearbyTiles : nearbyTiles;
  return villageCoreTiles.length ? villageCoreTiles : inlandTiles;
}

function getGroundAnimalProfile(species) {
  return GROUND_ANIMAL_PROFILES[species] || GROUND_ANIMAL_PROFILES.rabbit;
}

function buildFaunaPools(world, terrainRegions, buildings = []) {
  const grid = world?.grid;
  if (!grid) {
    return {
      grid: null,
      roamingTiles: [],
      waterTiles: [],
      meadowTiles: [],
      woodedTiles: [],
      shoreLandTiles: [],
      villageAnimalTiles: [],
    };
  }
  const landGraph = buildLandComponents(grid, terrainRegions, ROAMING_WALK_OPTIONS, buildings);
  const roamingTiles = landGraph.primary?.length ? landGraph.primary : landGraph.tiles;
  const allWaterTiles = findTilesByType(grid, 'water');
  const waterTiles = allWaterTiles.filter(({ x, y }) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < grid.h && nx >= 0 && nx < grid.w && grid.tiles[ny]?.[nx]?.t !== 'water') {
          return true;
        }
      }
    }
    return false;
  });
  const meadowTiles = roamingTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.meadowStrength || 0) > 0.28);
  const woodedTiles = roamingTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.foliageShadow || 0) > 0.18);
  const shoreLandTiles = roamingTiles.filter(({ x, y }) => {
    const terrain = terrainRegions?.[y]?.[x];
    return (terrain?.shoreStrength || 0) > 0.06 && (terrain?.waterRatio || 0) < 0.02;
  });
  const villageAnimalTiles = buildVillageAnimalPool(grid, terrainRegions, roamingTiles, buildings, 811);
  return {
    grid,
    roamingTiles,
    waterTiles,
    meadowTiles,
    woodedTiles,
    shoreLandTiles,
    villageAnimalTiles,
  };
}

function buildRelocatedRoamingState(entity, tx, ty, world, terrainRegions, walkOptions, routeOptions = {}, filterFn = null) {
  const grid = world?.grid;
  const requestedAnchor = { x: tx, y: ty };
  if (!grid) return { x: tx, y: ty, route: null };
  const component = buildReachableTilePool(grid, terrainRegions, requestedAnchor, walkOptions);
  // For compact enclosed areas (fences), skip the strict terrain filter — the enclosure itself provides containment
  const compactComponent = component.length > 1 && component.length <= 18;
  const filtered = (filterFn && !compactComponent) ? component.filter((tile) => filterFn(tile, component)) : component;
  const basePool = filtered.length ? filtered : (component.length ? component : [requestedAnchor]);
  const poolKeySet = new Set(basePool.map((tile) => tileKey(tile.x, tile.y)));
  const comfortPool = compactComponent
    ? basePool.filter((tile) => countOpenComponentNeighbors(tile, poolKeySet) >= 2)
    : [];
  const pool = comfortPool.length ? comfortPool : basePool;
  // For compact enclosed areas, prefer the centroid rather than the drop point so animals
  // occupy the middle of the pen instead of clustering at the edge where they were placed
  const anchor = compactComponent
    ? (pickCenteredComponentTile(pool, entity.seed) || pool[0] || requestedAnchor)
    : (pool.find((tile) => tileKey(tile.x, tile.y) === tileKey(requestedAnchor.x, requestedAnchor.y))
      || basePool.find((tile) => tileKey(tile.x, tile.y) === tileKey(requestedAnchor.x, requestedAnchor.y))
      || requestedAnchor);
  const routeConfig = compactComponent
    ? {
        stopCount: Math.min(routeOptions.stopCount ?? 3, Math.max(2, pool.length)),
        minDist: 1,
        maxDist: Math.min(3, routeOptions.maxDist ?? 3),
        pauseBase: 8000 + hash01(entity.seed || 0, 91) * 4000,
        pauseVariance: 3200 + hash01(entity.seed || 0, 92) * 2000,
      }
    : routeOptions;
  // Give the animal a varied idle facing based on its seed instead of always south
  const facingOptions = [-2, -1, 1, 2]; // N, W, E, S
  const idleFacing = facingOptions[Math.abs(entity.seed || 0) % facingOptions.length];
  return {
    x: anchor.x,
    y: anchor.y,
    idleFacing: compactComponent ? idleFacing : undefined,
    pauseFacing: compactComponent ? idleFacing : undefined,
    route: buildRoamingTileRoute(anchor, pool, grid, terrainRegions, entity.seed, {
      ...routeConfig,
      pauseFacing: compactComponent ? idleFacing : (routeConfig.pauseFacing ?? 2),
      walkOptions,
    }),
  };
}

function buildRelocatedAnimalState(entity, tx, ty, world, terrainRegions, buildings = []) {
  if (entity.layer === 'water' || WATER_ANIMAL_SPECIES.has(entity.species)) {
    return { x: tx, y: ty, route: null, layer: 'water' };
  }
  const grid = world?.grid;
  const profile = getGroundAnimalProfile(entity.species);
  return {
    ...buildRelocatedRoamingState(
      entity,
      tx,
      ty,
      world,
      terrainRegions,
      ROAMING_WALK_OPTIONS,
      {
        ...profile.route,
        pauseFacing: profile.pauseFacing ?? 2,
      },
      entity.species === 'goose'
        ? null
        : (tile => isStrictInlandTile(grid, terrainRegions, tile, LAND_ANIMAL_WALK_OPTIONS)),
    ),
    layer: 'ground',
  };
}

function buildRelocatedPetState(entity, tx, ty, world, terrainRegions) {
  return buildRelocatedRoamingState(entity, tx, ty, world, terrainRegions, ROAMING_WALK_OPTIONS, {
    stopCount: 3,
    minDist: 4,
    maxDist: 10,
    pauseBase: 16000,
    pauseVariance: 5600,
    speed: 0.58,
    pauseFacing: 2,
  });
}

function buildRelocatedResidentState(entity, tx, ty, world, terrainRegions) {
  return buildRelocatedRoamingState(entity, tx, ty, world, terrainRegions, RESIDENT_WALK_OPTIONS, {
    stopCount: 3,
    minDist: 4,
    maxDist: 9,
    pauseBase: 17000,
    pauseVariance: 5200,
    speed: 0.76,
    pauseFacing: 2,
  });
}

function pointFromTileCenter(tile, seed, radiusX = 0.03, radiusY = 0.025, clearance = null) {
  if (!tile) return null;
  return pointFromTile(tile, seed, radiusX, radiusY, clearance);
}

function buildVillageCoreTiles(grid, terrainRegions, roamTiles, buildings = [], seed = 0, maxDistance = 8) {
  if (!grid || !roamTiles?.length) return [];
  const villageAnchor = pickVillageAnchor(roamTiles, buildings, seed) || roamTiles[0];
  const anchorX = villageAnchor?.x ?? roamTiles[0].x;
  const anchorY = villageAnchor?.y ?? roamTiles[0].y;
  const coreTiles = roamTiles.filter((tile) => {
    const terrain = terrainRegions?.[tile.y]?.[tile.x];
    const distance = Math.abs(tile.x - anchorX) + Math.abs(tile.y - anchorY);
    if (distance > maxDistance) return false;
    return (terrain?.shoreStrength || 0) < 0.02 && (terrain?.waterRatio || 0) < 0.006;
  });
  return coreTiles.length ? coreTiles : roamTiles;
}

function hasCardinalWater(grid, x, y) {
  return (
    grid?.tiles?.[y - 1]?.[x]?.t === 'water'
    || grid?.tiles?.[y + 1]?.[x]?.t === 'water'
    || grid?.tiles?.[y]?.[x - 1]?.t === 'water'
    || grid?.tiles?.[y]?.[x + 1]?.t === 'water'
  );
}

function facingForWaterDir(dir) {
  if (dir === 'n') return -2;
  if (dir === 's') return 2;
  if (dir === 'e') return 1;
  if (dir === 'w') return -1;
  return 2;
}

function vectorForWaterDir(dir) {
  if (dir === 'n') return { dx: 0, dy: -1 };
  if (dir === 's') return { dx: 0, dy: 1 };
  if (dir === 'e') return { dx: 1, dy: 0 };
  if (dir === 'w') return { dx: -1, dy: 0 };
  return { dx: 0, dy: 1 };
}

function isSameWaterBank(tile, spot) {
  if (!tile || !spot) return false;
  switch (spot.shoreDir) {
    case 'n':
      return tile.y <= spot.y - 1;
    case 's':
      return tile.y >= spot.y + 1;
    case 'e':
      return tile.x >= spot.x + 1;
    case 'w':
      return tile.x <= spot.x - 1;
    default:
      return true;
  }
}

function buildFishingShoreTiles(grid, terrainRegions, landTiles = [], buildings = [], seed = 0) {
  if (!grid || !landTiles.length) return [];
  const villageAnchor = pickVillageAnchor(landTiles, buildings, seed) || landTiles[0];
  return landTiles.map(({ x, y }) => {
    const terrain = terrainRegions?.[y]?.[x];
    const distanceFromVillage = Math.abs(x - (villageAnchor?.x ?? x)) + Math.abs(y - (villageAnchor?.y ?? y));
    if (!hasCardinalWater(grid, x, y)
      || distanceFromVillage < 3
      || (terrain?.waterRatio || 0) >= 0.55
      || (terrain?.shoreStrength || 0) <= 0.01
      || (terrain?.shoreStrength || 0) >= 0.82) {
      return null;
    }
    const waterOptions = getCardinalWaterNeighbors(grid, x, y)
      .map((candidate) => ({
        ...candidate,
        openness: countNearbyWater(grid, candidate.x, candidate.y, 1),
      }))
      .sort((a, b) => b.openness - a.openness || a.dir.localeCompare(b.dir));
    const target = waterOptions[0];
    if (!target) return null;
    const dirVector = vectorForWaterDir(target.dir);
    const nearbyWater = collectNearbyWaterTiles(grid, x, y, 3)
      .filter((tile) => isSameWaterBank(tile, { x, y, shoreDir: target.dir }))
      .sort((a, b) => b.openWater - a.openWater || a.dist - b.dist);
    const castTile = nearbyWater[0] || { x: target.x, y: target.y };
    return {
      x,
      y,
      standX: x + 0.5 + dirVector.dx * 0.22,
      standY: y + 0.58 + dirVector.dy * 0.16,
      fishingSpotId: tileKey(x, y),
      fishingFacing: facingForWaterDir(target.dir),
      pauseFacing: facingForWaterDir(target.dir),
      castTargetX: castTile.x + 0.5 + dirVector.dx * 0.22,
      castTargetY: castTile.y + 0.56 + dirVector.dy * 0.22,
      shoreDir: target.dir,
      shoreWaterX: target.x,
      shoreWaterY: target.y,
    };
  }).filter(Boolean);
}

function facingFromVector(dx, dy, fallback = 2) {
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0) return dx >= 0 ? 1 : -1;
  if (Math.abs(dy) > 0) return dy >= 0 ? 2 : -2;
  return fallback;
}

function buildWoodcuttingTaskTiles(grid, terrainRegions, landTiles = [], buildings = [], seed = 0) {
  if (!grid) return [];
  const villageAnchor = pickVillageAnchor(landTiles, buildings, seed) || landTiles[0];
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
  ];

  const slots = [];
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      const tile = grid.tiles?.[y]?.[x];
      if (!tile || (tile.t !== 'tree' && tile.t !== 'stump')) continue;
      const terrain = terrainRegions?.[y]?.[x];
      const distanceFromVillage = Math.abs(x - (villageAnchor?.x ?? x)) + Math.abs(y - (villageAnchor?.y ?? y));
      if (distanceFromVillage < 4) continue;
      if ((terrain?.shoreStrength || 0) > 0.08 || (terrain?.waterRatio || 0) > 0.04) continue;

      const nearbyTreeCount = dirs.reduce((total, { dx, dy }) => {
        const neighbor = grid.tiles?.[y + dy]?.[x + dx];
        return total + ((neighbor?.t === 'tree' || neighbor?.t === 'stump') ? 1 : 0);
      }, 0);

      dirs.forEach(({ dx, dy }, slotIndex) => {
        const sx = x + dx;
        const sy = y + dy;
        if (!isGridTileWalkable(grid, terrainRegions, sx, sy, RESIDENT_WALK_OPTIONS)) return;
        const standTerrain = terrainRegions?.[sy]?.[sx];
        if ((standTerrain?.shoreStrength || 0) > 0.12 || (standTerrain?.waterRatio || 0) > 0.04) return;
        const focusDx = x - sx;
        const focusDy = y - sy;
        const pauseFacing = facingFromVector(focusDx, focusDy, 2);
        const score = nearbyTreeCount * 1.9
          + (terrain?.foliageShadow || 0) * 2.8
          + hash01(seed + x * 73 + y * 29 + slotIndex * 11, 112);
        slots.push({
          x: sx,
          y: sy,
          role: 'work',
          buildingType: 'woodcutters_hut',
          pauseFacing,
          standX: sx + 0.5 + focusDx * 0.34,
          standY: sy + 0.6 + focusDy * 0.02,
          strikeTargetX: x + 0.5,
          strikeTargetY: y + 0.62,
          taskSlotId: `${tileKey(x, y)}:${tileKey(sx, sy)}`,
          workSpotId: tileKey(x, y),
          score,
        });
      });
    }
  }

  return slots.sort((a, b) => b.score - a.score);
}

function incrementReservation(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function buildResidentTaskReservations(relocations, currentKey = null) {
  const reservations = {
    fishingSlots: new Map(),
    woodSlots: new Map(),
    woodSpots: new Map(),
  };
  if (!relocations) return reservations;
  relocations.forEach((state, key) => {
    if (!state || key === currentKey || !state.assignedTask) return;
    if (state.assignedTask === 'fish') {
      incrementReservation(reservations.fishingSlots, state.taskSlotId || state.fishingSpotId);
      return;
    }
    if (state.assignedTask === 'chop') {
      incrementReservation(reservations.woodSlots, state.taskSlotId);
      incrementReservation(reservations.woodSpots, state.workSpotId);
    }
  });
  return reservations;
}

function getReservationCount(map, key) {
  if (!map || !key) return 0;
  return map.get(key) || 0;
}

function pickResidentTaskTarget(
  pool,
  currentTile,
  seed,
  grid,
  terrainRegions,
  walkOptions = RESIDENT_WALK_OPTIONS,
  scoreAdjuster = null,
) {
  if (!pool?.length || !currentTile || !grid) return null;
  let best = null;
  let bestScore = -Infinity;
  pool.forEach((candidate, index) => {
    const path = findTilePath(grid, terrainRegions, currentTile, candidate, seed + index * 13, walkOptions);
    if (!path?.length) return;
    const distance = path.length - 1;
    const score = (candidate.score || 0)
      - Math.abs(distance - 6) * 0.55
      + Math.min(distance, 12) * 0.08
      + hash01(seed + index * 23, 113) * 0.12
      + (typeof scoreAdjuster === 'function' ? Number(scoreAdjuster(candidate, path, distance, index) || 0) : 0);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}

function buildResidentTaskIntroRoute(startMotion, targetTile, seed, grid, terrainRegions, meta, options = {}) {
  if (!startMotion || !targetTile || !grid) return [];
  const startTile = {
    x: Math.floor(startMotion.tileX ?? startMotion.x),
    y: Math.floor(startMotion.tileY ?? startMotion.y),
  };
  const tilePath = findTilePath(grid, terrainRegions, startTile, targetTile, seed + 211, options.walkOptions || RESIDENT_WALK_OPTIONS);
  if (!tilePath?.length || tilePath.length === 1) return [];

  const clearance = {
    grid,
    terrainRegions,
    walkOptions: options.walkOptions || RESIDENT_WALK_OPTIONS,
    padding: options.clearancePadding ?? 0.12,
  };
  const nodes = [
    makeRouteNode(
      startMotion.x,
      startMotion.y,
      startTile.x,
      startTile.y,
      'path',
      0,
      { pauseFacing: startMotion.facing || 2 },
    ),
  ];

  tilePath.slice(1).forEach((tile, index) => {
    const isGoal = index === tilePath.length - 2;
    const point = isGoal && meta && Number.isFinite(meta.standX) && Number.isFinite(meta.standY)
      ? { x: meta.standX, y: meta.standY }
      : pointFromTileCenter(tile, seed + 223 + index * 17, 0, 0, clearance);
    nodes.push(
      makeRouteNode(
        point?.x ?? tile.x + 0.5,
        point?.y ?? tile.y + 0.5,
        tile.x,
        tile.y,
        isGoal ? 'work' : 'path',
        0,
        isGoal ? meta : null,
      ),
    );
  });

  return finalizeRouteNodes(nodes, seed + 227, {
    speed: options.speed ?? 0.78,
    pauseFacing: meta?.pauseFacing ?? 2,
  }, false);
}

function buildResidentTaskLoop(targetTile, seed, grid, terrainRegions, meta, options = {}) {
  if (!targetTile || !grid) return [];
  const clearance = {
    grid,
    terrainRegions,
    walkOptions: options.walkOptions || RESIDENT_WALK_OPTIONS,
    padding: options.clearancePadding ?? 0.12,
  };
  const point = (meta && Number.isFinite(meta.standX) && Number.isFinite(meta.standY))
    ? { x: meta.standX, y: meta.standY }
    : pointFromTileCenter(targetTile, seed + 241, 0, 0, clearance);
  return finalizeRouteNodes([
    makeRouteNode(
      point?.x ?? targetTile.x + 0.5,
      point?.y ?? targetTile.y + 0.5,
      targetTile.x,
      targetTile.y,
      'work',
      options.pauseMs ?? 28000,
      meta,
    ),
  ], seed + 251, {
    speed: options.speed ?? 0.76,
    pauseFacing: meta?.pauseFacing ?? 2,
  }, true);
}

function buildResidentTaskState(
  entity,
  motion,
  taskKind,
  world,
  terrainRegions,
  buildings = [],
  assignedAt = performance.now(),
  reservations = null,
) {
  const grid = world?.grid;
  if (!grid || !entity || !motion) return null;
  const landGraph = buildLandComponents(grid, terrainRegions, RESIDENT_WALK_OPTIONS, buildings);
  const landTiles = landGraph.primary?.length ? landGraph.primary : landGraph.tiles;
  const startTile = {
    x: Math.floor(motion.tileX ?? motion.x),
    y: Math.floor(motion.tileY ?? motion.y),
  };

  let target = null;
  if (taskKind === 'fish') {
    const fishingTaskTiles = buildFishingTaskTiles(world, terrainRegions, buildings);
    target = pickResidentTaskTarget(
      fishingTaskTiles,
      startTile,
      entity.seed + 617,
      grid,
      terrainRegions,
      RESIDENT_WALK_OPTIONS,
      (candidate) => {
        const slotLoad = getReservationCount(reservations?.fishingSlots, candidate.taskSlotId || candidate.fishingSpotId);
        return (candidate.fishingSpotId ? 4.5 : 0) - slotLoad * 12;
      },
    );
    if (!target) return null;
    const intro = buildResidentTaskIntroRoute(motion, target, entity.seed + 619, grid, terrainRegions, target, {
      speed: 0.78,
      walkOptions: RESIDENT_WALK_OPTIONS,
    });
    return {
      x: motion.x,
      y: motion.y,
      tileX: startTile.x,
      tileY: startTile.y,
      workBuildingType: 'fishing_hut',
      routeIntro: intro,
      routeIntroStartAt: assignedAt,
      routeIntroDurationMs: intro.reduce((total, node, index) => {
        const isLast = index === intro.length - 1;
        return total + (node.pauseMs || 0) + (isLast ? 0 : (node.moveMs || 0));
      }, 0),
      route: buildResidentTaskLoop(target, entity.seed + 631, grid, terrainRegions, {
        ...target,
        buildingType: 'fishing_hut',
      }, {
        pauseMs: 36000,
        walkOptions: RESIDENT_WALK_OPTIONS,
      }),
      assignedTask: 'fish',
      taskSlotId: target.taskSlotId || target.fishingSpotId || null,
      workSpotId: target.workSpotId || target.fishingSpotId || null,
      fishingSpotId: target.fishingSpotId || null,
    };
  }

  if (taskKind === 'chop') {
    const chopTiles = buildWoodcuttingTaskTiles(grid, terrainRegions, landTiles, buildings, entity.seed + 641);
    target = pickResidentTaskTarget(
      chopTiles,
      startTile,
      entity.seed + 647,
      grid,
      terrainRegions,
      RESIDENT_WALK_OPTIONS,
      (candidate) => {
        const slotLoad = getReservationCount(reservations?.woodSlots, candidate.taskSlotId);
        const spotLoad = getReservationCount(reservations?.woodSpots, candidate.workSpotId);
        return -slotLoad * 12 - spotLoad * 2.6;
      },
    );
    if (!target) return null;
    const intro = buildResidentTaskIntroRoute(motion, target, entity.seed + 653, grid, terrainRegions, target, {
      speed: 0.8,
      walkOptions: RESIDENT_WALK_OPTIONS,
    });
    return {
      x: motion.x,
      y: motion.y,
      tileX: startTile.x,
      tileY: startTile.y,
      workBuildingType: 'woodcutters_hut',
      routeIntro: intro,
      routeIntroStartAt: assignedAt,
      routeIntroDurationMs: intro.reduce((total, node, index) => {
        const isLast = index === intro.length - 1;
        return total + (node.pauseMs || 0) + (isLast ? 0 : (node.moveMs || 0));
      }, 0),
      route: buildResidentTaskLoop(target, entity.seed + 659, grid, terrainRegions, {
        ...target,
        buildingType: 'woodcutters_hut',
      }, {
        pauseMs: 34000,
        walkOptions: RESIDENT_WALK_OPTIONS,
      }),
      assignedTask: 'chop',
      taskSlotId: target.taskSlotId || null,
      workSpotId: target.workSpotId || null,
    };
  }

  return null;
}

function getCardinalWaterNeighbors(grid, x, y) {
  const dirs = [
    { dx: 0, dy: -1, dir: 'n' },
    { dx: 1, dy: 0, dir: 'e' },
    { dx: 0, dy: 1, dir: 's' },
    { dx: -1, dy: 0, dir: 'w' },
  ];
  return dirs
    .map(({ dx, dy, dir }) => ({ x: x + dx, y: y + dy, dir, dx, dy, tile: grid?.tiles?.[y + dy]?.[x + dx] || null }))
    .filter(({ tile }) => tile?.t === 'water');
}

function hasCardinalLand(grid, x, y) {
  return (
    !!grid?.tiles?.[y - 1]?.[x] && grid.tiles[y - 1][x].t !== 'water'
    || !!grid?.tiles?.[y + 1]?.[x] && grid.tiles[y + 1][x].t !== 'water'
    || !!grid?.tiles?.[y]?.[x - 1] && grid.tiles[y][x - 1].t !== 'water'
    || !!grid?.tiles?.[y]?.[x + 1] && grid.tiles[y][x + 1].t !== 'water'
  );
}

function countNearbyWater(grid, x, y, radius = 1) {
  let count = 0;
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (grid?.tiles?.[y + oy]?.[x + ox]?.t === 'water') count += 1;
    }
  }
  return count;
}

function countStraightBankSupport(grid, spot) {
  if (!spot?.shoreDir) return 0;
  const deltas = spot.shoreDir === 'n' || spot.shoreDir === 's'
    ? [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }]
    : [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
  return deltas.reduce((count, { dx, dy }) => {
    const tile = grid?.tiles?.[spot.y + dy]?.[spot.x + dx];
    if (!tile || tile.t === 'water') return count;
    const waterNeighbors = getCardinalWaterNeighbors(grid, spot.x + dx, spot.y + dy);
    return waterNeighbors.some((candidate) => candidate.dir === spot.shoreDir) ? count + 1 : count;
  }, 0);
}

function collectNearbyWaterTiles(grid, x, y, radius = 3) {
  const tiles = [];
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      const tx = x + ox;
      const ty = y + oy;
      if (grid?.tiles?.[ty]?.[tx]?.t !== 'water') continue;
      const dist = Math.abs(ox) + Math.abs(oy);
      tiles.push({
        x: tx,
        y: ty,
        dist,
        shoreAdjacent: hasCardinalLand(grid, tx, ty),
        openWater: countNearbyWater(grid, tx, ty, 1),
      });
    }
  }
  return tiles;
}

function selectFishingSceneSpots(grid, terrainRegions, shorePool = [], buildings = []) {
  if (!grid || !shorePool.length) return [];
  const builtFishingHuts = buildings.filter((building) => building.state === 'built' && (building.type || building.building_type) === 'fishing_hut');
  const desiredSpots = clamp((builtFishingHuts.length || 0) + 3, 3, 6);
  const villageAnchor = pickVillageAnchor(shorePool, buildings, 719) || { x: Math.floor(grid.w / 2), y: Math.floor(grid.h / 2) };
  const rankedShoreTiles = [...shorePool]
    .map((tile, index) => {
      const waterNeighbors = getCardinalWaterNeighbors(grid, tile.x, tile.y);
      const scenic = waterNeighbors.reduce((best, candidate) => {
        const openness = countNearbyWater(grid, candidate.x, candidate.y, 1);
        return Math.max(best, openness);
      }, 0);
      const terrain = terrainRegions?.[tile.y]?.[tile.x];
      return {
        ...tile,
        score: scenic * 3 + (terrain?.shoreStrength || 0) * 4 + hash01(tile.x * 31 + tile.y * 17 + index, 81),
      };
    })
    .sort((a, b) => b.score - a.score);

  const spots = [];
  const showcaseCandidates = rankedShoreTiles.filter((tile) => tile.y >= Math.floor(grid.h * 0.68));
  const showcasePool = showcaseCandidates.length ? showcaseCandidates : rankedShoreTiles;
  const showcaseTarget = { x: grid.w * 0.7, y: grid.h * 0.76 };
  const showcaseSpot = showcasePool
    .map((tile) => ({
      ...tile,
      bankSupport: countStraightBankSupport(grid, tile),
      waterSupport: countNearbyWater(grid, tile.shoreWaterX ?? tile.x, tile.shoreWaterY ?? tile.y, 1),
      showcaseScore: Math.abs(tile.x - showcaseTarget.x) * 0.9
        + Math.abs(tile.y - showcaseTarget.y) * 1.1
        - tile.score * 0.12
        - countStraightBankSupport(grid, tile) * 1.25
        - countNearbyWater(grid, tile.shoreWaterX ?? tile.x, tile.shoreWaterY ?? tile.y, 1) * 0.18,
    }))
    .sort((a, b) => a.showcaseScore - b.showcaseScore)[0];
  if (showcaseSpot) spots.push(showcaseSpot);
  if (villageAnchor) {
    const villageBand = rankedShoreTiles.filter((tile) => tile.y >= villageAnchor.y - 1);
    const villageCandidates = villageBand.length ? villageBand : rankedShoreTiles;
    const bestNearVillage = villageCandidates
      .filter((tile) => !spots.some((spot) => Math.abs(spot.x - tile.x) + Math.abs(spot.y - tile.y) < 6))
      .map((tile) => ({
        ...tile,
        villageScore: Math.abs(tile.x - villageAnchor.x) * 0.8
          + Math.abs(tile.y - villageAnchor.y) * 1.15
          - tile.score * 0.14,
      }))
      .sort((a, b) => a.villageScore - b.villageScore)[0];
    if (bestNearVillage) spots.push(bestNearVillage);
  }
  builtFishingHuts.forEach((hut, hutIndex) => {
    const hutCenterX = hut.grid_x + (hut.width || 1) / 2;
    const hutCenterY = hut.grid_y + (hut.height || 1) / 2;
    const bestNearHut = rankedShoreTiles
      .filter((tile) => !spots.some((spot) => Math.abs(spot.x - tile.x) + Math.abs(spot.y - tile.y) < 6))
      .map((tile) => ({
        ...tile,
        hutScore: Math.abs(tile.x + 0.5 - hutCenterX) + Math.abs(tile.y + 0.5 - hutCenterY) - tile.score * 0.15 + hutIndex * 0.01,
      }))
      .sort((a, b) => a.hutScore - b.hutScore)[0];
    if (bestNearHut) spots.push(bestNearHut);
  });
  rankedShoreTiles.forEach((tile) => {
    if (spots.length >= desiredSpots) return;
    if (spots.some((spot) => Math.abs(spot.x - tile.x) + Math.abs(spot.y - tile.y) < 6)) return;
    spots.push(tile);
  });
  if (!spots.length && rankedShoreTiles[0]) spots.push(rankedShoreTiles[0]);
  return spots;
}

function buildFishingDecorations(world, terrainRegions, buildings = []) {
  const grid = world?.grid;
  if (!grid) return [];

  // Collect EVERY land tile on the grid that sits next to cardinal water — no
  // terrain strength filters, no primary-component restriction. This guarantees
  // we find shore tiles even on small ponds or off-the-main-island water bodies.
  const allShoreTiles = [];
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      const tile = grid.tiles?.[y]?.[x];
      if (!tile || tile.t === 'water') continue;
      if (tile.b != null) continue; // skip tiles with buildings on them
      if (!hasCardinalWater(grid, x, y)) continue;
      const waterOptions = getCardinalWaterNeighbors(grid, x, y)
        .map((candidate) => ({
          ...candidate,
          openness: countNearbyWater(grid, candidate.x, candidate.y, 1),
        }))
        .sort((a, b) => b.openness - a.openness || a.dir.localeCompare(b.dir));
      const target = waterOptions[0];
      if (!target) continue;
      const dirVector = vectorForWaterDir(target.dir);
      const nearbyWater = collectNearbyWaterTiles(grid, x, y, 3)
        .filter((t) => isSameWaterBank(t, { x, y, shoreDir: target.dir }))
        .sort((a, b) => b.openWater - a.openWater || a.dist - b.dist);
      const castTile = nearbyWater[0] || { x: target.x, y: target.y };
      allShoreTiles.push({
        x,
        y,
        fishingSpotId: tileKey(x, y),
        fishingFacing: facingForWaterDir(target.dir),
        pauseFacing: facingForWaterDir(target.dir),
        castTargetX: castTile.x + 0.5 + dirVector.dx * 0.22,
        castTargetY: castTile.y + 0.56 + dirVector.dy * 0.22,
        shoreDir: target.dir,
        shoreWaterX: target.x,
        shoreWaterY: target.y,
        opennessScore: target.openness,
      });
    }
  }
  if (!allShoreTiles.length) return [];

  const spots = selectFishingSceneSpots(grid, terrainRegions, allShoreTiles, buildings);
  if (!spots.length) return [];

  const decorations = [];

  spots.forEach((spot, index) => {
    const spotSeed = spot.x * 157 + spot.y * 263 + index * 19;
    const sameBankWater = collectNearbyWaterTiles(grid, spot.x, spot.y, 3)
      .filter((tile) => isSameWaterBank(tile, spot))
      .sort((a, b) => (
        (tileKey(a.x, a.y) === tileKey(spot.shoreWaterX, spot.shoreWaterY) ? -1 : 0)
        - (tileKey(b.x, b.y) === tileKey(spot.shoreWaterX, spot.shoreWaterY) ? -1 : 0)
      ) || (a.dist - b.dist) || (b.openWater - a.openWater));
    const boatTile = { x: spot.shoreWaterX ?? sameBankWater[0]?.x ?? spot.x, y: spot.shoreWaterY ?? sameBankWater[0]?.y ?? spot.y };
    const decorWater = sameBankWater.filter((tile) => Math.abs(tile.x - boatTile.x) + Math.abs(tile.y - boatTile.y) >= 2);
    const shallowWater = sameBankWater.filter((tile) => tile.shoreAdjacent).sort((a, b) => a.dist - b.dist || b.openWater - a.openWater);
    const safeShallowWater = decorWater.filter((tile) => tile.shoreAdjacent).sort((a, b) => a.dist - b.dist || b.openWater - a.openWater);
    const openWater = sameBankWater.filter((tile) => tile.openWater >= 4).sort((a, b) => b.openWater - a.openWater || a.dist - b.dist);
    const safeOpenWater = decorWater.filter((tile) => tile.openWater >= 4).sort((a, b) => b.openWater - a.openWater || a.dist - b.dist);
    const fishTile = openWater[0] || sameBankWater[0] || boatTile;
    const lilyPairTile = safeShallowWater[0] || safeOpenWater[0] || shallowWater[1] || decorWater[0] || fishTile;
    const singleLilyTile = safeShallowWater[1] || safeOpenWater[1] || shallowWater[2] || decorWater[1] || fishTile;
    const rockTile = sameBankWater.find((tile) => tileKey(tile.x, tile.y) !== tileKey(boatTile.x, boatTile.y) && tile.openWater >= 2) || fishTile;
    const cattailTile = safeShallowWater[2] || safeShallowWater[0] || shallowWater[3] || lilyPairTile;
    const dirVector = vectorForWaterDir(spot.shoreDir);
    const boatWidthTiles = 1.76;
    const boatHeightTiles = 0.98;
    const boatLayout = {
      n: {
        x: boatTile.x - 0.34,
        y: boatTile.y + 0.02,
        postX: spot.x + 0.58,
        postY: spot.y + 0.1,
        ropeX: boatTile.x + 0.56,
        ropeY: boatTile.y + 0.7,
      },
      s: {
        x: boatTile.x - 0.32,
        y: boatTile.y - 0.16,
        postX: spot.x + 0.58,
        postY: spot.y + 0.94,
        ropeX: boatTile.x + 0.56,
        ropeY: boatTile.y + 0.16,
      },
      e: {
        x: boatTile.x - 0.64,
        y: boatTile.y - 0.02,
        postX: spot.x + 0.9,
        postY: spot.y + 0.54,
        ropeX: boatTile.x + 0.18,
        ropeY: boatTile.y + 0.56,
      },
      w: {
        x: boatTile.x - 0.12,
        y: boatTile.y - 0.02,
        postX: spot.x + 0.1,
        postY: spot.y + 0.54,
        ropeX: boatTile.x + 0.82,
        ropeY: boatTile.y + 0.56,
      },
    }[spot.shoreDir] || {
      x: boatTile.x - 0.34,
      y: boatTile.y + 0.02,
      postX: spot.x + 0.58,
      postY: spot.y + 0.1,
      ropeX: boatTile.x + 0.56,
      ropeY: boatTile.y + 0.7,
    };
    const fishBaseX = fishTile.x + 0.18 + dirVector.dx * 0.04;
    const fishBaseY = fishTile.y + 0.2 + dirVector.dy * 0.04;
    const tangent = (spot.shoreDir === 'n' || spot.shoreDir === 's')
      ? { dx: 1, dy: 0 }
      : { dx: 0, dy: 1 };
    const standSlots = [-0.16, 0.16].map((offset, slotIndex) => ({
      x: spot.x,
      y: spot.y,
      role: 'work',
      buildingType: 'fishing_hut',
      fishingSpotId: spot.fishingSpotId,
      taskSlotId: `${spot.fishingSpotId}:bank:${slotIndex}`,
      workSpotId: spot.fishingSpotId,
      pauseFacing: spot.pauseFacing,
      fishingFacing: spot.fishingFacing,
      standX: spot.x + 0.5 + dirVector.dx * 0.26 + tangent.dx * offset,
      standY: spot.y + 0.58 + dirVector.dy * 0.16 + tangent.dy * offset,
      castTargetX: fishBaseX + 0.2,
      castTargetY: fishBaseY + 0.18,
      shoreDir: spot.shoreDir,
      score: 6.4 - Math.abs(offset) * 2 + countStraightBankSupport(grid, spot) * 0.4,
    }));

    decorations.push({
      type: 'fishing_bank',
      x: spot.x,
      y: spot.y,
      widthTiles: 1,
      heightTiles: 1,
      shoreDir: spot.shoreDir,
      fishingSpotId: spot.fishingSpotId,
      standSlots,
      fishingFacing: spot.fishingFacing,
      pauseFacing: spot.pauseFacing,
      castTargetX: fishBaseX + 0.2,
      castTargetY: fishBaseY + 0.18,
      featured: index === 0,
      seed: spotSeed + 5,
    });

    if (index === 0) {
      decorations.push({
        type: 'boat',
        x: boatLayout.x,
        y: boatLayout.y,
        widthTiles: boatWidthTiles,
        heightTiles: boatHeightTiles,
        shoreDir: spot.shoreDir,
        postX: boatLayout.postX,
        postY: boatLayout.postY,
        ropeX: boatLayout.ropeX,
        ropeY: boatLayout.ropeY,
        bankTileX: spot.x,
        bankTileY: spot.y,
        fishingSpotId: spot.fishingSpotId,
        standSlots,
        fishingFacing: spot.fishingFacing,
        pauseFacing: spot.pauseFacing,
        castTargetX: fishBaseX + 0.2,
        castTargetY: fishBaseY + 0.18,
        seed: spotSeed + 11,
      });
    }

    decorations.push({
      type: 'swim_fish',
      x: fishBaseX,
      y: fishBaseY,
      widthTiles: 0.72,
      heightTiles: 0.72,
      facing: hash01(spotSeed, 9) > 0.5 ? 1 : -1,
      seed: spotSeed + 23,
    });

    decorations.push({
      type: 'swim_fish',
      x: fishBaseX + 0.34,
      y: fishBaseY + 0.12,
      widthTiles: 0.64,
      heightTiles: 0.64,
      facing: hash01(spotSeed, 91) > 0.5 ? 1 : -1,
      seed: spotSeed + 24,
    });

    decorations.push({
      type: 'water_rock',
      x: rockTile.x + 0.13,
      y: rockTile.y + 0.18,
      widthTiles: 0.68,
      heightTiles: 0.68,
      variant: Math.floor(hash01(spotSeed, 10) * 7),
      seed: spotSeed + 31,
    });

    decorations.push({
      type: 'water_plant',
      x: lilyPairTile.x + 0.18,
      y: lilyPairTile.y + 0.2,
      widthTiles: 0.38,
      heightTiles: 0.38,
      variantGroup: 'default',
      variant: Math.floor(hash01(spotSeed, 11) * 5),
      seed: spotSeed + 41,
    });

    decorations.push({
      type: 'water_plant',
      x: lilyPairTile.x + 0.46,
      y: lilyPairTile.y + 0.12,
      widthTiles: 0.42,
      heightTiles: 0.42,
      variantGroup: 'default',
      variant: Math.floor(hash01(spotSeed, 13) * 5),
      seed: spotSeed + 53,
    });

    decorations.push({
      type: 'water_plant',
      x: singleLilyTile.x + 0.24,
      y: singleLilyTile.y + 0.18,
      widthTiles: 0.4,
      heightTiles: 0.4,
      variantGroup: 'default',
      variant: Math.floor(hash01(spotSeed, 15) * 5),
      seed: spotSeed + 59,
    });

    decorations.push({
      type: 'cattail',
      x: cattailTile.x + 0.12,
      y: cattailTile.y + 0.02,
      widthTiles: 0.42,
      heightTiles: 0.62,
      variant: Math.floor(hash01(spotSeed, 14) * 4),
      seed: spotSeed + 67,
    });

    decorations.push({
      type: 'cattail',
      x: cattailTile.x + 0.34,
      y: cattailTile.y + 0.1,
      widthTiles: 0.42,
      heightTiles: 0.62,
      variant: Math.floor(hash01(spotSeed, 16) * 4),
      seed: spotSeed + 71,
    });

    decorations.push({
      type: 'cattail',
      x: cattailTile.x + 0.56,
      y: cattailTile.y + 0.14,
      widthTiles: 0.42,
      heightTiles: 0.62,
      variant: Math.floor(hash01(spotSeed, 17) * 4),
      seed: spotSeed + 73,
    });
  });

  return decorations;
}

function buildFishingTaskTiles(world, terrainRegions, buildings = []) {
  const decorations = buildFishingDecorations(world, terrainRegions, buildings);
  const bankDecorations = decorations.filter((decor) => decor.type === 'fishing_bank' && Array.isArray(decor.standSlots) && decor.standSlots.length);
  const featuredBanks = bankDecorations.filter((decor) => decor.featured);
  const sourceDecorations = featuredBanks.length ? featuredBanks : bankDecorations;
  return sourceDecorations
    .filter((decor) => decor.type === 'fishing_bank' && Array.isArray(decor.standSlots) && decor.standSlots.length)
    .flatMap((decor) => decor.standSlots.map((slot, index) => ({
      ...slot,
      score: (slot.score || 0) + (decor.featured ? 12 : 2.4) - index * 0.08,
      featured: !!decor.featured,
      boatX: decor.x,
      boatY: decor.y,
      fishingSpotId: decor.fishingSpotId,
      taskSlotId: slot.taskSlotId || `${decor.fishingSpotId}:bank:${index}`,
      workSpotId: slot.workSpotId || decor.fishingSpotId,
    })));
}

function buildDriftingCloudShadows(world) {
  const grid = world?.grid;
  if (!grid) return [];
  const heroClouds = [
    {
      type: 'cloud_shadow',
      seed: 1001,
      variant: 0,
      startX: grid.w * 0.08,
      y: grid.h * 0.2,
      widthTiles: 9.4,
      heightTiles: 4.8,
      speed: 0.00016,
      alpha: 0.42,
    },
    {
      type: 'cloud_shadow',
      seed: 1038,
      variant: 1,
      startX: grid.w * 0.3,
      y: grid.h * 0.42,
      widthTiles: 8.8,
      heightTiles: 4.4,
      speed: 0.00013,
      alpha: 0.4,
    },
    {
      type: 'cloud_shadow',
      seed: 1079,
      variant: 2,
      startX: grid.w * 0.56,
      y: grid.h * 0.64,
      widthTiles: 7.4,
      heightTiles: 3.7,
      speed: 0.00011,
      alpha: 0.32,
    },
  ];
  const count = clamp(Math.round((grid.w + grid.h) / 11), 3, 5);
  const ambientClouds = Array.from({ length: count }, (_, index) => ({
    type: 'cloud_shadow',
    seed: 1001 + index * 37,
    variant: index % 4,
    startX: -8 + (grid.w / Math.max(1, count)) * index + hash01(index * 13, 2) * 3.2,
    y: 2.6 + index * ((grid.h - 6.4) / Math.max(1, count - 1)) + hash01(index * 17, 3) * 1.1,
    widthTiles: 6.2 + hash01(index * 19, 4) * 2.2,
    heightTiles: 3.2 + hash01(index * 23, 5) * 0.9,
    speed: 0.00018 + index * 0.000025,
    alpha: 0.26 + hash01(index * 29, 6) * 0.06,
  }));
  return [...heroClouds, ...ambientClouds];
}

function getTileScore(tile, terrainRegions) {
  const terrain = terrainRegions?.[tile.y]?.[tile.x];
  return (terrain?.laneStrength || 0) * 2.4 + (terrain?.villageWear || 0) * 1.8 + (terrain?.meadowStrength || 0) * 0.5;
}

function getBuildingAnchor(building, clearTileMap, clearTiles, terrainRegions) {
  if (!building) return null;
  const candidates = [];
  const left = building.grid_x - 1;
  const right = building.grid_x + building.width;
  const top = building.grid_y - 1;
  const bottom = building.grid_y + building.height;

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const outsideFootprint = x < building.grid_x || x >= building.grid_x + building.width || y < building.grid_y || y >= building.grid_y + building.height;
      if (!outsideFootprint) continue;
      const tile = clearTileMap.get(tileKey(x, y));
      if (!tile) continue;
      const centerX = building.grid_x + building.width / 2;
      const centerY = building.grid_y + building.height / 2;
      const distance = Math.abs(tile.x + 0.5 - centerX) + Math.abs(tile.y + 0.5 - centerY);
      const terrainScore = getTileScore(tile, terrainRegions);
      candidates.push({
        ...tile,
        score: terrainScore - distance * 0.12,
      });
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  let best = null;
  let bestDistance = Infinity;
  const centerX = building.grid_x + building.width / 2;
  const centerY = building.grid_y + building.height / 2;
  clearTiles.forEach((tile) => {
    const distance = Math.abs(tile.x + 0.5 - centerX) + Math.abs(tile.y + 0.5 - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  });
  return best;
}

function isGridTileWalkable(grid, terrainRegions, tx, ty, options = {}) {
  if (!grid || tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return false;
  const tile = grid.tiles[ty]?.[tx];
  if (!tile) return false;
  if (tile.b != null) return false;
  if (WALK_BLOCKERS.has(tile.t)) return false;
  if (!options.allowShore) {
    const terrain = terrainRegions?.[ty]?.[tx];
    if ((terrain?.shoreStrength || 0) > (options.maxShoreStrength ?? 0.16)) return false;
    if ((terrain?.waterRatio || 0) > (options.maxWaterRatio ?? 0.18)) return false;
  }
  return true;
}

function buildReachableTilePool(grid, terrainRegions, anchorTile, walkOptions = {}) {
  if (!grid || !anchorTile) return [];
  const start = { x: Math.floor(anchorTile.x), y: Math.floor(anchorTile.y) };
  if (!isGridTileWalkable(grid, terrainRegions, start.x, start.y, walkOptions)) return [];
  const visited = new Set([tileKey(start.x, start.y)]);
  const queue = [start];
  const tiles = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    tiles.push(current);
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach(([dx, dy]) => {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = tileKey(nx, ny);
      if (visited.has(key)) return;
      if (!isGridTileWalkable(grid, terrainRegions, nx, ny, walkOptions)) return;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    });
  }
  return tiles;
}

function getComponentCentroid(tiles = []) {
  if (!tiles.length) return { x: 0, y: 0 };
  const sum = tiles.reduce((acc, tile) => {
    acc.x += tile.x;
    acc.y += tile.y;
    return acc;
  }, { x: 0, y: 0 });
  return {
    x: sum.x / tiles.length,
    y: sum.y / tiles.length,
  };
}

function countOpenComponentNeighbors(tile, componentKeySet) {
  return (
    (componentKeySet.has(tileKey(tile.x - 1, tile.y)) ? 1 : 0)
    + (componentKeySet.has(tileKey(tile.x + 1, tile.y)) ? 1 : 0)
    + (componentKeySet.has(tileKey(tile.x, tile.y - 1)) ? 1 : 0)
    + (componentKeySet.has(tileKey(tile.x, tile.y + 1)) ? 1 : 0)
  );
}

function countWalkableNeighbors(grid, terrainRegions, tile, walkOptions = {}) {
  return (
    (isGridTileWalkable(grid, terrainRegions, tile.x - 1, tile.y, walkOptions) ? 1 : 0)
    + (isGridTileWalkable(grid, terrainRegions, tile.x + 1, tile.y, walkOptions) ? 1 : 0)
    + (isGridTileWalkable(grid, terrainRegions, tile.x, tile.y - 1, walkOptions) ? 1 : 0)
    + (isGridTileWalkable(grid, terrainRegions, tile.x, tile.y + 1, walkOptions) ? 1 : 0)
  );
}

function pickCenteredComponentTile(component, seed = 0) {
  if (!component?.length) return null;
  const centroid = getComponentCentroid(component);
  const keySet = new Set(component.map((tile) => tileKey(tile.x, tile.y)));
  let best = component[0];
  let bestScore = -Infinity;
  component.forEach((tile, index) => {
    const openness = countOpenComponentNeighbors(tile, keySet);
    const centroidDistance = Math.abs(tile.x - centroid.x) + Math.abs(tile.y - centroid.y);
    const score = openness * 2.2 - centroidDistance + hash01(seed + index * 13, 81) * 0.08;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  });
  return best;
}

function pickDiverseTile(pool, usedTiles, seed, minSpacing = 0) {
  if (!pool?.length) return null;
  if (!usedTiles?.length) return pool[Math.abs(seed) % pool.length];
  let best = pool[0];
  let bestScore = -Infinity;
  pool.forEach((tile, index) => {
    const nearestUsed = usedTiles.reduce((bestDist, used) => (
      Math.min(bestDist, Math.abs(tile.x - used.x) + Math.abs(tile.y - used.y))
    ), Infinity);
    const score = nearestUsed - Math.max(0, minSpacing - nearestUsed) * 4 + hash01(seed + index * 29, 82) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  });
  return best;
}

function getPathDirections(seed) {
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const offset = Math.abs(seed) % dirs.length;
  return dirs.slice(offset).concat(dirs.slice(0, offset));
}

function estimateTileDistance(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function getPathTilePenalty(grid, terrainRegions, tx, ty, options = {}) {
  let penalty = 0;
  if (typeof options.tilePenalty === 'function') {
    penalty += Number(options.tilePenalty(tx, ty, grid, terrainRegions) || 0);
  }
  if (!options.allowShore) {
    const terrain = terrainRegions?.[ty]?.[tx];
    penalty += (terrain?.shoreStrength || 0) * 0.28;
    penalty += (terrain?.waterRatio || 0) * 0.45;
  }
  return penalty;
}

function hasTileLineOfSight(grid, terrainRegions, start, end, options = {}) {
  if (!grid || !start || !end) return false;
  let x0 = Math.floor(start.x);
  let y0 = Math.floor(start.y);
  const x1 = Math.floor(end.x);
  const y1 = Math.floor(end.y);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    if (!isGridTileWalkable(grid, terrainRegions, x0, y0, options)) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = err * 2;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function smoothTilePath(path, grid, terrainRegions, options = {}) {
  if (!path?.length || path.length <= 2) return path || [];
  const smoothed = [path[0]];
  let anchorIndex = 0;
  while (anchorIndex < path.length - 1) {
    let nextIndex = path.length - 1;
    while (nextIndex > anchorIndex + 1) {
      if (hasTileLineOfSight(grid, terrainRegions, path[anchorIndex], path[nextIndex], options)) break;
      nextIndex -= 1;
    }
    smoothed.push(path[nextIndex]);
    anchorIndex = nextIndex;
  }
  return smoothed;
}

function findTilePath(grid, terrainRegions, start, goal, seed = 0, options = {}) {
  if (!grid || !start || !goal) return null;
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);
  if (sx === gx && sy === gy) return [{ x: sx, y: sy }];
  if (!isGridTileWalkable(grid, terrainRegions, sx, sy, options) || !isGridTileWalkable(grid, terrainRegions, gx, gy, options)) return null;

  const startKey = tileKey(sx, sy);
  const goalKey = tileKey(gx, gy);
  const open = [{ x: sx, y: sy }];
  const openKeys = new Set([startKey]);
  const previous = new Map([[startKey, null]]);
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, estimateTileDistance(sx, sy, gx, gy)]]);

  while (open.length) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      const currentKey = tileKey(open[i].x, open[i].y);
      const bestKey = tileKey(open[bestIndex].x, open[bestIndex].y);
      const currentF = fScore.get(currentKey) ?? Infinity;
      const bestF = fScore.get(bestKey) ?? Infinity;
      if (currentF < bestF) {
        bestIndex = i;
        continue;
      }
      if (currentF === bestF) {
        const currentH = estimateTileDistance(open[i].x, open[i].y, gx, gy);
        const bestH = estimateTileDistance(open[bestIndex].x, open[bestIndex].y, gx, gy);
        if (currentH < bestH) {
          bestIndex = i;
        }
      }
    }

    const current = open.splice(bestIndex, 1)[0];
    const currentKey = tileKey(current.x, current.y);
    openKeys.delete(currentKey);
    if (current.x === gx && current.y === gy) break;

    const currentPrev = previous.get(currentKey);
    const prevDir = currentPrev
      ? { dx: current.x - currentPrev.x, dy: current.y - currentPrev.y }
      : null;
    const dirs = getPathDirections(seed + current.x * 17 + current.y * 31);
    dirs.forEach(([dx, dy]) => {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = tileKey(nx, ny);
      if (!isGridTileWalkable(grid, terrainRegions, nx, ny, options)) return;

      const turnPenalty = prevDir && (prevDir.dx !== dx || prevDir.dy !== dy) ? 0.06 : 0;
      const tentativeScore = (gScore.get(currentKey) ?? Infinity)
        + 1
        + turnPenalty
        + getPathTilePenalty(grid, terrainRegions, nx, ny, options);
      if (tentativeScore >= (gScore.get(key) ?? Infinity)) return;

      previous.set(key, current);
      gScore.set(key, tentativeScore);
      fScore.set(key, tentativeScore + estimateTileDistance(nx, ny, gx, gy));
      if (!openKeys.has(key)) {
        open.push({ x: nx, y: ny });
        openKeys.add(key);
      }
    });
  }

  if (!previous.has(goalKey)) return null;

  const path = [];
  let cursor = { x: gx, y: gy };
  while (cursor) {
    path.push(cursor);
    cursor = previous.get(tileKey(cursor.x, cursor.y));
  }
  return smoothTilePath(path.reverse(), grid, terrainRegions, options);
}

function makeRouteNode(x, y, tileX, tileY, role = 'path', pauseMs = 0, meta = null) {
  return {
    x,
    y,
    tileX,
    tileY,
    role,
    pauseMs,
    pauseFacing: meta?.pauseFacing ?? meta?.fishingFacing ?? null,
    buildingType: meta?.buildingType || null,
    anchorKind: meta?.anchorKind || null,
    buildingId: meta?.buildingId || null,
    fishingFacing: meta?.fishingFacing || null,
    castTargetX: meta?.castTargetX ?? null,
    castTargetY: meta?.castTargetY ?? null,
    strikeTargetX: meta?.strikeTargetX ?? null,
    strikeTargetY: meta?.strikeTargetY ?? null,
    shoreDir: meta?.shoreDir || null,
    fishingSpotId: meta?.fishingSpotId || null,
  };
}

function finalizeRouteNodes(nodes, seed, options = {}, loop = true) {
  if (!nodes?.length) return [];
  const speed = options.speed ?? (0.72 + hash01(seed, 7) * 0.18);
  return nodes.map((node, index) => {
    const next = loop ? nodes[(index + 1) % nodes.length] : (nodes[index + 1] || null);
    const dx = next ? (next.x - node.x) : 0;
    const dy = next ? (next.y - node.y) : 0;
    const distance = Math.hypot(dx, dy);
    return {
      ...node,
      moveMs: next ? Math.max(360, (distance / speed) * 1000) : 0,
      distance,
      pauseFacing: node.pauseFacing ?? options.pauseFacing ?? 2,
      facing: Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.02
        ? (dx >= 0 ? 1 : -1)
        : Math.abs(dy) > 0.02
          ? (dy >= 0 ? 2 : -2)
          : null,
    };
  });
}

function pushRouteNode(nodes, node) {
  const last = nodes[nodes.length - 1];
  if (
    last
    && Math.abs(last.x - node.x) < 0.001
    && Math.abs(last.y - node.y) < 0.001
    && last.tileX === node.tileX
    && last.tileY === node.tileY
  ) {
    nodes[nodes.length - 1] = { ...last, ...node };
    return;
  }
  nodes.push(node);
}

function expandResidentRoute(points, seed, grid, terrainRegions, options = {}) {
  const stops = points
    .filter(Boolean)
    .map((point) => ({
      ...point,
      pauseMs: point.pauseMs ?? (point.role === 'work' ? 2800 : point.role === 'home' ? 2200 : 1400),
      tileX: point.tileX ?? Math.floor(point.x),
      tileY: point.tileY ?? Math.floor(point.y),
    }))
    .filter((point) => isGridTileWalkable(grid, terrainRegions, point.tileX, point.tileY, options.walkOptions));
  if (!stops.length) return [];
  const clearance = {
    grid,
    terrainRegions,
    walkOptions: options.walkOptions,
    padding: options.clearancePadding ?? 0.12,
  };

  const nodes = [stops[0]];
  let current = stops[0];
  for (let step = 1; step <= stops.length; step += 1) {
    const next = stops[step % stops.length];
    const currentCenterPoint = pointFromTileCenter(current, seed + step * 43, 0, 0, clearance);
    const currentCenter = makeRouteNode(
      currentCenterPoint?.x ?? current.tileX + 0.5,
      currentCenterPoint?.y ?? current.tileY + 0.5,
      current.tileX,
      current.tileY,
      'path',
      0,
      current,
    );
    pushRouteNode(nodes, currentCenter);

      const tilePath = findTilePath(
        grid,
        terrainRegions,
        { x: current.tileX, y: current.tileY },
        { x: next.tileX, y: next.tileY },
        seed + step * 13,
        options.walkOptions,
      );
      if (!tilePath?.length) continue;

    tilePath.slice(1).forEach((tile, pathIndex) => {
      const isGoalTile = pathIndex === tilePath.length - 2;
      const role = isGoalTile ? next.role : 'path';
      const pauseMs = 0;
      const point = pointFromTileCenter(tile, seed + step * 59 + pathIndex * 17, 0, 0, clearance);
      pushRouteNode(
        nodes,
        makeRouteNode(point?.x ?? tile.x + 0.5, point?.y ?? tile.y + 0.5, tile.x, tile.y, role, pauseMs, next),
      );
    });

    if (step < stops.length) {
      pushRouteNode(nodes, next);
      current = next;
    }
  }

  return finalizeRouteNodes(nodes, seed, options, true);
}

function buildRoamingTileRoute(anchorTile, pool, grid, terrainRegions, seed, options = {}) {
  if (!anchorTile || !pool?.length) return [];
  const stopCount = options.stopCount ?? 3;
  const minDist = options.minDist ?? 2;
  const maxDist = options.maxDist ?? 6;
  const pauseBase = options.pauseBase ?? 3200;
  const pauseVariance = options.pauseVariance ?? 1800;
  const walkOptions = options.walkOptions;
  const pauseFacing = options.pauseFacing ?? 2;
  const desiredDistance = options.desiredDistance ?? Math.max(minDist, Math.round((minDist + maxDist) / 2));
  const sideOnlyMovement = !!options.sideOnlyMovement;
  const clearance = {
    grid,
    terrainRegions,
    walkOptions,
    padding: options.clearancePadding ?? 0.13,
  };

  const stops = [anchorTile];
  const used = new Set([tileKey(anchorTile.x, anchorTile.y)]);
  let current = anchorTile;
  for (let i = 0; i < stopCount - 1; i += 1) {
    let bestTile = null;
    let bestScore = -Infinity;
    pool.forEach((candidate) => {
      const key = tileKey(candidate.x, candidate.y);
      if (used.has(key)) return;
      const distance = Math.abs(candidate.x - current.x) + Math.abs(candidate.y - current.y);
      if (distance < minDist || distance > maxDist) return;
      const path = findTilePath(grid, terrainRegions, current, candidate, seed + i * 23, walkOptions);
      if (!path?.length) return;
      const openness = countWalkableNeighbors(grid, terrainRegions, candidate, walkOptions);
      const averageSpread = stops.reduce((sum, stop) => (
        sum + Math.abs(candidate.x - stop.x) + Math.abs(candidate.y - stop.y)
      ), 0) / stops.length;
      const verticalPenalty = sideOnlyMovement ? Math.abs(candidate.y - current.y) * 1.5 : Math.abs(candidate.y - current.y) * 0.2;
      const anchorSpread = Math.abs(candidate.x - anchorTile.x) + Math.abs(candidate.y - anchorTile.y);
      const score = (
        averageSpread * 0.55
        + Math.min(anchorSpread, maxDist + 2) * 0.22
        - Math.abs(distance - desiredDistance) * 0.42
        + openness * 0.55
        - Math.max(0, 2 - openness) * 0.85
        - verticalPenalty
        + hash01(seed + candidate.x * 17 + candidate.y * 31, i) * 0.12
      );
      if (score > bestScore) {
        bestScore = score;
        bestTile = candidate;
      }
    });
    if (!bestTile) break;
    used.add(tileKey(bestTile.x, bestTile.y));
    stops.push(bestTile);
    current = bestTile;
  }

  if (stops.length === 1) {
    const anchorPoint = pointFromTileCenter(anchorTile, seed + 17, 0, 0, clearance);
    return [{
      x: anchorPoint?.x ?? anchorTile.x + 0.5,
      y: anchorPoint?.y ?? anchorTile.y + 0.5,
      tileX: anchorTile.x,
      tileY: anchorTile.y,
      pauseMs: pauseBase,
      moveMs: 0,
      distance: 0,
      facing: pauseFacing,
    }];
  }

  const firstPoint = pointFromTileCenter(stops[0], seed + 31, options.stopRadiusX ?? 0, options.stopRadiusY ?? 0, clearance);
  const nodes = [{
    x: firstPoint?.x ?? stops[0].x + 0.5,
    y: firstPoint?.y ?? stops[0].y + 0.5,
    tileX: stops[0].x,
    tileY: stops[0].y,
    pauseMs: pauseBase + hash01(seed, 41) * pauseVariance,
    pauseFacing,
  }];
  for (let step = 1; step <= stops.length; step += 1) {
    const from = stops[step - 1];
    const to = stops[step % stops.length];
    const tilePath = findTilePath(grid, terrainRegions, from, to, seed + step * 29, walkOptions);
    if (!tilePath?.length) continue;
    tilePath.slice(1).forEach((tile, index) => {
      const isStop = index === tilePath.length - 2;
      const point = pointFromTileCenter(
        tile,
        seed + step * 97 + index * 13,
        isStop ? (options.stopRadiusX ?? 0) : (options.pathRadiusX ?? 0),
        isStop ? (options.stopRadiusY ?? 0) : (options.pathRadiusY ?? 0),
        clearance,
      );
      nodes.push({
        x: point?.x ?? tile.x + 0.5,
        y: point?.y ?? tile.y + 0.5,
        tileX: tile.x,
        tileY: tile.y,
        pauseMs: isStop ? pauseBase + hash01(seed + step * 7, index + 1) * pauseVariance : 0,
        pauseFacing,
      });
    });
  }
  const last = nodes[nodes.length - 1];
  if (last && last.x === nodes[0].x && last.y === nodes[0].y) {
    nodes.pop();
  }

  const speed = options.speed ?? (0.78 + hash01(seed, 53) * 0.14);
  return nodes.map((node, index) => {
    const next = nodes[(index + 1) % nodes.length];
    const dx = next.x - node.x;
    const dy = next.y - node.y;
    const distance = Math.hypot(dx, dy);
    return {
      ...node,
      moveMs: Math.max(340, (distance / speed) * 1000),
      distance,
      facing: Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.02
        ? (dx >= 0 ? 1 : -1)
        : Math.abs(dy) > 0.02
          ? (dy >= 0 ? 2 : -2)
          : pauseFacing,
    };
  });
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function resolveFacingFromDelta(dx, dy, fallback = 1, options = {}) {
  const validFallback = [-2, -1, 1, 2].includes(fallback) ? fallback : 1;
  if (options.sideOnly) {
    if (Math.abs(dx) > 0.02) return dx >= 0 ? 1 : -1;
    if (validFallback === -1 || validFallback === 1) return validFallback;
    return options.defaultSideFacing || 1;
  }
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.02) {
    return dx >= 0 ? 1 : -1;
  }
  if (Math.abs(dy) > 0.02) {
    return dy >= 0 ? 2 : -2;
  }
  return validFallback;
}

function getRouteDuration(route, loop = true) {
  if (!route?.length) return 0;
  return route.reduce((total, node, index) => {
    const includeMove = loop || index < route.length - 1;
    return total + (node.pauseMs || 0) + (includeMove ? (node.moveMs || 0) : 0);
  }, 0);
}

function sampleRouteMotion(route, entity, timeCursor, loop = true) {
  if (!route?.length) return null;
  let cursor = timeCursor;
  let lastFacing = route.find((node) => node.facing)?.facing || entity.idleFacing || 1;
  const idleFrameRate = entity.idleFrameRate ?? 0.00008;
  const idleFrame = idleFrameRate > 0 ? (timeCursor * idleFrameRate + entity.seed * 0.1) % 1 : 0;
  const workFrameRate = entity.workFrameRate ?? 0.00035;
  const workFrame = workFrameRate > 0 ? (timeCursor * workFrameRate + entity.seed * 0.1) % 1 : 0;

  for (let index = 0; index < route.length; index += 1) {
    const node = route[index];
    const next = loop ? route[(index + 1) % route.length] : (route[index + 1] || null);
    const pauseMs = node.pauseMs || 0;
    if (cursor < pauseMs) {
      const stableFacing = entity.pauseFacing || entity.idleFacing || node.pauseFacing || node.facing || lastFacing || 2;
      const bt = node.buildingType || '';
      const isWorkBuilding = ['farm', 'fishing_hut', 'woodcutters_hut', 'lumberyard',
        'quarry', 'stone_pit', 'watchtower', 'shrine', 'town_hall', 'weaving_hut'].includes(bt);
      return {
        x: node.x,
        y: node.y,
        frameOffset: isWorkBuilding ? workFrame : idleFrame,
        facing: stableFacing,
        moving: false,
        paused: true,
        role: node.role || 'path',
        buildingType: node.buildingType || null,
        anchorKind: node.anchorKind || null,
        buildingId: node.buildingId || null,
        castTargetX: node.castTargetX ?? null,
        castTargetY: node.castTargetY ?? null,
        strikeTargetX: node.strikeTargetX ?? null,
        strikeTargetY: node.strikeTargetY ?? null,
        fishingFacing: node.fishingFacing || null,
        shoreDir: node.shoreDir || null,
        fishingSpotId: node.fishingSpotId || null,
      };
    }
    cursor -= pauseMs;

    const moveMs = next ? (node.moveMs || 0) : 0;
    if (next && cursor < moveMs) {
      const progress = moveMs > 0 ? cursor / moveMs : 1;
      const eased = entity.linearMotion === false ? smoothStep(progress) : progress;
      const dx = next.x - node.x;
      const dy = next.y - node.y;
      const facing = resolveFacingFromDelta(dx, dy, node.facing || lastFacing || 1, {
        sideOnly: entity.sideOnlyFacing,
        defaultSideFacing: entity.defaultSideFacing || 1,
      });
      return {
        x: node.x + dx * eased,
        y: node.y + dy * eased,
        frameOffset: node.distance > 0.02
          ? (eased * Math.max(node.distance, 0.3) * (entity.walkCyclesPerTile || 2.2) + entity.seed * 0.1) % 1
          : idleFrame,
        facing,
        moving: node.distance > 0.02,
        paused: false,
        role: node.role || 'path',
        buildingType: node.buildingType || next.buildingType || null,
        anchorKind: node.anchorKind || next.anchorKind || null,
        buildingId: node.buildingId || next.buildingId || null,
        castTargetX: node.castTargetX ?? next.castTargetX ?? null,
        castTargetY: node.castTargetY ?? next.castTargetY ?? null,
        strikeTargetX: node.strikeTargetX ?? next.strikeTargetX ?? null,
        strikeTargetY: node.strikeTargetY ?? next.strikeTargetY ?? null,
        fishingFacing: node.fishingFacing || next.fishingFacing || null,
        shoreDir: node.shoreDir || next.shoreDir || null,
        fishingSpotId: node.fishingSpotId || next.fishingSpotId || null,
      };
    }
    if (next) cursor -= moveMs;
    if (node.facing) lastFacing = node.facing;
  }

  const fallback = route[route.length - 1];
  return {
    x: fallback.x,
    y: fallback.y,
    frameOffset: 0,
    facing: fallback.facing || entity.pauseFacing || entity.idleFacing || 1,
    moving: false,
    paused: true,
    role: fallback.role || 'path',
    buildingType: fallback.buildingType || null,
    anchorKind: fallback.anchorKind || null,
    buildingId: fallback.buildingId || null,
    castTargetX: fallback.castTargetX ?? null,
    castTargetY: fallback.castTargetY ?? null,
    strikeTargetX: fallback.strikeTargetX ?? null,
    strikeTargetY: fallback.strikeTargetY ?? null,
    fishingFacing: fallback.fishingFacing || null,
    shoreDir: fallback.shoreDir || null,
    fishingSpotId: fallback.fishingSpotId || null,
  };
}

function getRouteMotion(entity, time) {
  const introRoute = entity.routeIntro;
  const introStartAt = entity.routeIntroStartAt;
  if (introRoute?.length && Number.isFinite(introStartAt)) {
    const introElapsed = Math.max(0, time - introStartAt);
    const introDuration = entity.routeIntroDurationMs ?? getRouteDuration(introRoute, false);
    if (introElapsed < introDuration) {
      const introMotion = sampleRouteMotion(introRoute, entity, introElapsed, false);
      if (introMotion) return introMotion;
    }
  }

  const route = entity.route;
  if (!route?.length) {
    return {
      x: entity.x + 0.5,
      y: entity.y + 0.5,
      frameOffset: 0,
      facing: 1,
      moving: false,
      buildingId: entity.buildingId || null,
    };
  }

  const cycleMs = getRouteDuration(route, true) || 1;
  const cursor = (time + entity.seed * 173) % cycleMs;
  return sampleRouteMotion(route, entity, cursor, true);
}

function getTileRouteMotion(entity, time) {
  const route = entity.route;
  if (!route?.length) {
    return {
      x: entity.x,
      y: entity.y,
      frameOffset: 0,
      facing: entity.idleFacing || 2,
      moving: false,
    };
  }

  const cycleMs = route.reduce((total, node) => total + node.pauseMs + node.moveMs, 0) || 1;
  let cursor = (time + entity.seed * 173) % cycleMs;
  let lastFacing = route.find((node) => node.facing)?.facing || entity.idleFacing || 2;
  const idleFrameRate = entity.idleFrameRate ?? 0.00008;
  const idleFrame = idleFrameRate > 0 ? (time * idleFrameRate + entity.seed * 0.1) % 1 : 0;

  for (let index = 0; index < route.length; index += 1) {
    const node = route[index];
    const next = route[(index + 1) % route.length];
    if (cursor < (node.pauseMs || 0)) {
      return {
        x: node.x,
        y: node.y,
        frameOffset: idleFrame,
        facing: entity.pauseFacing || entity.idleFacing || node.pauseFacing || node.facing || lastFacing || 2,
        moving: false,
      };
    }
    cursor -= node.pauseMs || 0;

    if (cursor < (node.moveMs || 0)) {
      const progress = node.moveMs > 0 ? cursor / node.moveMs : 1;
      const dx = next.x - node.x;
      const dy = next.y - node.y;
      const facing = resolveFacingFromDelta(dx, dy, entity.idleFacing || node.facing || lastFacing || 2, {
        sideOnly: entity.sideOnlyFacing,
        defaultSideFacing: entity.defaultSideFacing || 1,
      });
      return {
        x: node.x + dx * progress,
        y: node.y + dy * progress,
        frameOffset: node.distance > 0.02
          ? (progress * Math.max(node.distance, 0.3) * (entity.walkCyclesPerTile || 2.5) + entity.seed * 0.1) % 1
          : idleFrame,
        facing,
        moving: node.distance > 0.02,
      };
    }
    cursor -= node.moveMs || 0;
    if (node.facing) lastFacing = node.facing;
  }

  return {
    x: route[0].x,
    y: route[0].y,
    frameOffset: idleFrame,
    facing: entity.pauseFacing || entity.idleFacing || route[0].pauseFacing || route[0].facing || 2,
    moving: false,
  };
}

function getResidentDisplayActivity(resident, motion) {
  if (!motion) return resident.activity || 'stroll';
  const buildingType = motion.buildingType || null;
  if (!motion.moving || motion.paused) {
    if (buildingType === 'farm') {
      return (resident.seed % 2 === 0) ? 'farm_till' : 'farm_water';
    }
    if (buildingType === 'fishing_hut') {
      return 'fish';
    }
    if (buildingType && ['woodcutters_hut', 'lumberyard'].includes(buildingType)) {
      return 'chop';
    }
    if (buildingType && ['quarry', 'stone_pit'].includes(buildingType)) {
      return 'mine';
    }
    if (buildingType && ['market', 'trading_post', 'storehouse', 'warehouse', 'bakery'].includes(buildingType)) {
      return 'carry';
    }
    if (buildingType && ['watchtower', 'shrine', 'town_hall', 'weaving_hut'].includes(buildingType)) {
      return 'build';
    }
    if (buildingType && ['tavern', 'park'].includes(buildingType)) {
      return 'play';
    }
    if (motion.anchorKind === 'social') return 'play';
    if (motion.anchorKind === 'quiet') return 'idle';
    return 'idle'; // stopped NPCs with no building → idle animation
  }

  if (resident.archetype === 'merchant') return 'carry';
  if (resident.archetype === 'craft') return 'build';
  if (resident.archetype === 'gatherer') return 'gather';
  return 'stroll';
}

function assignResidentGroups(placements) {
  const socialResidents = placements
    .map((resident, index) => ({ resident, index }))
    .filter(({ resident }) => resident.archetype === 'social' || resident.archetype === 'merchant');

  socialResidents.forEach(({ resident }, order) => {
    resident.socialGroup = Math.floor(order / 3);
    resident.groupSlot = order % 3;
  });

  return placements;
}

function getGroupSlotOffset(slot = 0) {
  if (slot === 1) return { x: -0.11, y: 0.03 };
  if (slot === 2) return { x: 0.12, y: 0.04 };
  return { x: 0, y: -0.02 };
}

function getResidentInteractionPose(resident, motion, time) {
  const swing = Math.sin(time * 0.012 + resident.seed * 0.17);
  const bounce = Math.sin(time * 0.009 + resident.seed * 0.13);
  const pose = {
    offsetX: 0,
    offsetY: 0,
    facing: motion.facing,
    tool: null,
    social: false,
    kneel: false,
    sit: false,
    taskPulse: 0.4 + Math.abs(swing) * 0.6,
    castTargetX: null,
    castTargetY: null,
    strikeTargetX: null,
    strikeTargetY: null,
    shoreDir: null,
  };

  if (!motion.paused) return pose;

  if (motion.anchorKind === 'social') {
    const slot = getGroupSlotOffset(resident.groupSlot || 0);
    pose.offsetX += slot.x;
    pose.offsetY += slot.y;
    pose.social = true;
  }

  switch (motion.buildingType) {
    case 'farm':
      pose.offsetY += 0.04 + bounce * 0.01;
      pose.tool = 'hoe';
      break;
    case 'fishing_hut':
      pose.facing = motion.fishingFacing || motion.pauseFacing || motion.facing;
      pose.offsetX += pose.facing === 1 ? 0.035 : pose.facing === -1 ? -0.035 : 0;
      pose.tool = 'rod';
      pose.castTargetX = motion.castTargetX ?? null;
      pose.castTargetY = motion.castTargetY ?? null;
      pose.shoreDir = motion.shoreDir || null;
      break;
    case 'woodcutters_hut':
    case 'lumberyard':
      pose.tool = 'axe';
      pose.offsetX += swing * 0.02;
      pose.strikeTargetX = motion.strikeTargetX ?? null;
      pose.strikeTargetY = motion.strikeTargetY ?? null;
      break;
    case 'quarry':
    case 'stone_pit':
      pose.tool = 'pick';
      pose.offsetX += swing * 0.015;
      pose.offsetY += 0.02;
      break;
    case 'market':
    case 'trading_post':
      pose.social = true;
      pose.tool = resident.archetype === 'merchant' ? 'crate' : null;
      break;
    case 'storehouse':
    case 'warehouse':
      pose.tool = 'crate';
      break;
    case 'watchtower':
      pose.offsetY -= 0.03;
      break;
    case 'shrine':
      pose.kneel = true;
      pose.offsetY += 0.05;
      break;
    case 'park':
    case 'tavern':
      pose.social = true;
      pose.sit = motion.buildingType === 'park' && (resident.groupSlot || 0) === 1;
      if (pose.sit) {
        pose.offsetY += 0.04;
      }
      break;
    default:
      break;
  }

  return pose;
}

function countBuildingOccupants(buildings, residentStates) {
  const counts = new Map();
  residentStates.forEach(({ motion }) => {
    if (!motion?.paused || !motion.buildingId) return;
    counts.set(motion.buildingId, (counts.get(motion.buildingId) || 0) + 1);
  });
  buildings.forEach((building) => {
    if (building.state !== 'built') return;
    if (!ACTIVE_MARKER_BUILDINGS.has(building.type)) return;
    if (!counts.has(building.id) && building.workers > 0) {
      counts.set(building.id, Math.max(1, Math.min(3, building.workers)));
    }
  });
  return counts;
}

function drawTinyProp(ctx, x, y, color, width, height, shadow = 'rgba(0,0,0,0.16)') {
  ctx.save();
  ctx.fillStyle = shadow;
  ctx.fillRect(Math.round(x), Math.round(y + height * 0.2), Math.max(1, Math.round(width)), Math.max(1, Math.round(height * 0.32)));
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  ctx.restore();
}

function drawOccupancyMarkers(ctx, buildings, occupancyCounts, tileSize, camera, viewport) {
  buildings.forEach((building) => {
    if (building.state !== 'built') return;
    const occupancy = occupancyCounts.get(building.id) || 0;
    if (occupancy <= 0) return;

    const baseX = building.grid_x * tileSize - camera.x;
    const baseY = building.grid_y * tileSize - camera.y;
    const width = building.width * tileSize;
    const height = building.height * tileSize;
    if (baseX + width < -tileSize || baseY + height < -tileSize || baseX > viewport.width + tileSize || baseY > viewport.height + tileSize) return;

    const markerCount = clamp(occupancy, 1, 3);
    for (let i = 0; i < markerCount; i += 1) {
      const px = baseX + width * (0.16 + i * 0.18);
      const py = baseY + height * 0.76 + (i % 2) * tileSize * 0.03;
      switch (building.type) {
        case 'farm':
          drawTinyProp(ctx, px, py, '#d9b85c', tileSize * 0.13, tileSize * 0.09);
          break;
        case 'fishing_hut':
          drawTinyProp(ctx, px, py, '#62a9c6', tileSize * 0.12, tileSize * 0.06);
          drawTinyProp(ctx, px + tileSize * 0.06, py - tileSize * 0.03, '#d2d8b8', tileSize * 0.08, tileSize * 0.04);
          break;
        case 'woodcutters_hut':
        case 'lumberyard':
          drawTinyProp(ctx, px, py, '#94663d', tileSize * 0.15, tileSize * 0.07);
          break;
        case 'quarry':
        case 'stone_pit':
          drawTinyProp(ctx, px, py, '#9aa1ab', tileSize * 0.14, tileSize * 0.08);
          break;
        case 'market':
        case 'trading_post':
          drawTinyProp(ctx, px, py, i % 2 === 0 ? '#d35a52' : '#d9b85c', tileSize * 0.1, tileSize * 0.1);
          break;
        case 'storehouse':
        case 'warehouse':
          drawTinyProp(ctx, px, py, '#a9764b', tileSize * 0.11, tileSize * 0.11);
          break;
        case 'tavern':
          drawTinyProp(ctx, px, py, '#8e6644', tileSize * 0.09, tileSize * 0.12);
          break;
        case 'watchtower':
          drawTinyProp(ctx, baseX + width * 0.55, baseY + height * 0.18, '#d95454', tileSize * 0.06, tileSize * 0.12, 'rgba(0,0,0,0)');
          break;
        case 'shrine':
          drawTinyProp(ctx, px, py, '#e2d7b6', tileSize * 0.08, tileSize * 0.12);
          break;
        default:
          break;
      }
    }
  });
}

function drawResidentInteractionOverlay(ctx, screenX, screenY, tileSize, motion, pose, time) {
  if (!motion?.paused) return;
  const pulse = pose.taskPulse || 0.7;
  const baseX = screenX;
  const baseY = screenY - tileSize * 0.06;

  ctx.save();
  ctx.lineWidth = Math.max(1, tileSize * 0.035);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(58,37,23,0.9)';
  ctx.fillStyle = 'rgba(230,210,166,0.92)';

  if (pose.tool === 'rod') {
    const actorWorldX = motion.x + (pose.offsetX || 0);
    const actorWorldY = motion.y + (pose.offsetY || 0);
    const handX = baseX + (pose.facing === 1 ? tileSize * 0.04 : pose.facing === -1 ? -tileSize * 0.04 : 0);
    const handY = baseY - tileSize * 0.08;
    const defaultBobberX = handX + (pose.facing === 1 ? tileSize * 0.34 : pose.facing === -1 ? -tileSize * 0.34 : 0);
    const defaultBobberY = baseY - tileSize * 0.04 + Math.sin(time * 0.01) * tileSize * 0.01;
    const bobberX = pose.castTargetX != null
      ? screenX + (pose.castTargetX - actorWorldX) * tileSize
      : defaultBobberX;
    const bobberY = pose.castTargetY != null
      ? screenY + (pose.castTargetY - actorWorldY) * tileSize - tileSize * 0.08
      : defaultBobberY;
    const tipX = handX + clamp((bobberX - handX) * 0.38, -tileSize * 0.2, tileSize * 0.2);
    const tipY = handY - tileSize * 0.18;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(244,241,226,0.94)';
    ctx.lineWidth = Math.max(1, tileSize * 0.02);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(bobberX, bobberY);
    ctx.stroke();
    ctx.fillStyle = '#e75d5d';
    ctx.beginPath();
    ctx.arc(bobberX, bobberY, Math.max(1.3, tileSize * 0.045), 0, Math.PI * 2);
    ctx.fill();
  } else if (pose.tool === 'axe' || pose.tool === 'pick' || pose.tool === 'hoe') {
    const actorWorldX = motion.x + (pose.offsetX || 0);
    const actorWorldY = motion.y + (pose.offsetY || 0);
    const handX = baseX + (pose.facing === 1 ? tileSize * 0.03 : pose.facing === -1 ? -tileSize * 0.03 : 0);
    const handY = baseY - tileSize * 0.1;
    const targetX = pose.strikeTargetX != null
      ? screenX + (pose.strikeTargetX - actorWorldX) * tileSize
      : handX + (pose.facing === 1 ? tileSize * 0.24 : pose.facing === -1 ? -tileSize * 0.24 : 0);
    const targetY = pose.strikeTargetY != null
      ? screenY + (pose.strikeTargetY - actorWorldY) * tileSize - tileSize * 0.06
      : baseY - tileSize * 0.14;
    const pulseSwing = Math.sin(time * 0.018) * tileSize * 0.02;
    const tipX = handX + clamp((targetX - handX) * 0.34, -tileSize * 0.18, tileSize * 0.18);
    const tipY = handY + clamp((targetY - handY) * 0.34, -tileSize * 0.16, tileSize * 0.08) + pulseSwing;
    ctx.strokeStyle = 'rgba(124,88,46,0.92)';
    ctx.lineWidth = Math.max(1, tileSize * 0.025);
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = pose.tool === 'hoe' ? '#b9914b' : '#bfc6cf';
    ctx.fillRect(Math.round(tipX - tileSize * 0.01), Math.round(tipY - tileSize * 0.02), Math.max(1, Math.round(tileSize * 0.06)), Math.max(1, Math.round(tileSize * 0.03)));
  } else if (pose.tool === 'crate') {
    drawTinyProp(ctx, baseX - tileSize * 0.06, baseY - tileSize * 0.12, '#af7a4a', tileSize * 0.12, tileSize * 0.1);
  }

  if (pose.social) {
    ctx.fillStyle = `rgba(255,238,188,${(0.22 + pulse * 0.12).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(baseX, baseY - tileSize * 0.2, tileSize * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  if (pose.kneel) {
    ctx.fillStyle = 'rgba(226,215,182,0.85)';
    ctx.fillRect(Math.round(baseX - tileSize * 0.04), Math.round(baseY - tileSize * 0.02), Math.max(1, Math.round(tileSize * 0.08)), Math.max(1, Math.round(tileSize * 0.02)));
  }

  ctx.restore();
}

/** Check if a tile at (tx, ty) is walkable for land animals. */
function isTileWalkable(grid, tx, ty) {
  return isGridTileWalkable(grid, null, tx, ty, { allowShore: true });
}

/**
 * Simple, stable animal wander. Uses smooth sine-based drift from home position.
 * No complex phase transitions = no position jumps or blinking.
 */
function getAnimalWanderPos(entity, time, grid) {
  if (entity.route?.length) {
    const motion = getTileRouteMotion(entity, time);
    // For paused animals, cycle through idle states: normal idle, resting, sleeping
    if (!motion.moving) {
      const seed = entity.seed || 0;
      const idleCycleMs = 45000 + (seed % 7) * 5000; // 45-80s per full idle cycle
      const idlePhase = ((time + seed * 311) % idleCycleMs) / idleCycleMs;
      // 0–0.5: normal idle, 0.5–0.75: resting (slower anim), 0.75–1.0: sleeping
      if (idlePhase > 0.75) {
        motion.idleState = 'sleeping';
        motion.frameOffset = 0; // frozen frame for sleeping
      } else if (idlePhase > 0.5) {
        motion.idleState = 'resting';
        motion.frameOffset = motion.frameOffset * 0.3; // very slow animation
      }
      // Vary facing during idle phases based on time + seed
      const facingCycleMs = 22000 + (seed % 5) * 4000;
      const facingPhase = Math.floor(((time + seed * 197) % facingCycleMs) / (facingCycleMs / 4));
      const facingOptions = [-1, 2, 1, -2]; // W, S, E, N
      motion.facing = entity.pauseFacing ?? facingOptions[(facingPhase + seed) % 4];
    }
    return motion;
  }
  if (entity.layer !== 'water') {
    const idleFrameRate = entity.idleFrameRate ?? 0.00004;
    const seed = entity.seed || 0;
    // Vary facing over time instead of always south
    const facingCycleMs = 28000 + (seed % 5) * 5000;
    const facingPhase = Math.floor(((time + seed * 197) % facingCycleMs) / (facingCycleMs / 4));
    const facingOptions = [-1, 2, 1, -2];
    const facing = entity.idleFacing || facingOptions[(facingPhase + seed) % 4];
    // Cycle idle states for stationary animals too
    const idleCycleMs = 40000 + (seed % 7) * 6000;
    const idlePhase = ((time + seed * 311) % idleCycleMs) / idleCycleMs;
    let idleState = 'idle';
    let frameOffset = idleFrameRate > 0 ? (time * idleFrameRate + seed * 0.1) % 1 : 0;
    if (idlePhase > 0.7) {
      idleState = 'sleeping';
      frameOffset = 0;
    } else if (idlePhase > 0.5) {
      idleState = 'resting';
      frameOffset = frameOffset * 0.3;
    }
    return {
      x: entity.x,
      y: entity.y,
      frameOffset,
      facing,
      moving: false,
      idleState,
    };
  }
  const seed = entity.seed || 0;
  const phaseX = entity.phaseOffset ?? (seed * 2.1);
  const phaseY = entity.phaseOffsetY ?? (seed * 1.7);

  // Slow sinusoidal drift around home position — phase shifted per creature
  const tx = Math.sin(time * 0.0004 + phaseX) * 0.18;
  const ty = Math.cos(time * 0.00035 + phaseY) * 0.15;

  // Determine if the offset tile is walkable; clamp to home if not
  let dx = tx;
  let dy = ty;
  if (grid) {
    const homeX = Math.floor(entity.x);
    const homeY = Math.floor(entity.y);
    const targetTileX = homeX + Math.round(dx);
    const targetTileY = homeY + Math.round(dy);
    if (!isGridTileWalkable(grid, null, targetTileX, targetTileY, { allowShore: true })) {
      dx = 0;
      dy = 0;
    }
  }

  // Very slow movement detection — only flag as moving if drift is significant
  const speed = Math.abs(Math.cos(time * 0.0004 + phaseX) * 0.0004)
              + Math.abs(Math.sin(time * 0.00035 + phaseY) * 0.00035);
  const moving = (Math.abs(dx) + Math.abs(dy)) > 0.035 && speed > 0.0002;

  const facing = entity.sideOnlyFacing
    ? (entity.idleFacing || entity.defaultSideFacing || -1)
    : (moving
      ? resolveFacingFromDelta(dx, dy, entity.idleFacing || 2, {
        sideOnly: entity.sideOnlyFacing,
        defaultSideFacing: entity.defaultSideFacing || 1,
      })
      : (entity.idleFacing || 2));

  // Very slow idle frame — almost static
  const idleFrameRate = entity.idleFrameRate ?? 0.00008;
  const frameOffset = moving
    ? (time * 0.003 + seed * 0.1) % 1
    : (idleFrameRate > 0 ? (time * idleFrameRate + seed * 0.1) % 1 : 0);

  const x = entity.x + dx;
  const y = entity.y + dy;

  if (Number.isNaN(x) || Number.isNaN(y)) {
    return { x: entity.x, y: entity.y, frameOffset: 0, facing: 1, moving: false };
  }
  return { x, y, frameOffset, facing, moving };
}

function buildPetPlacements(world, terrainRegions, buildings = []) {
  const grid = world?.grid;
  if (!grid) return [];
  const heroCharacter = ['dojocat', 'buu', 'devit', 'pixiu'].includes(world?.hero_character)
    ? world.hero_character
    : (['dojocat', 'buu', 'devit', 'pixiu'].includes(world?.pet_character) ? world.pet_character : 'dojocat');
  const landGraph = buildLandComponents(grid, terrainRegions, ROAMING_WALK_OPTIONS, buildings);
  const landTiles = landGraph.primary?.length ? landGraph.primary : landGraph.tiles;
  const anchorTiles = buildVillageCoreTiles(grid, terrainRegions, landTiles, buildings, 401, 15);
  const roamTiles = landTiles.length ? landTiles : anchorTiles;
  const clearTiles = anchorTiles.length ? anchorTiles : (roamTiles.length ? roamTiles : findClearTiles(grid));
  const pickAnchor = (targetXRatio, targetYRatio, seed) => {
    const targetX = (grid.w || 20) * targetXRatio;
    const targetY = (grid.h || 20) * targetYRatio;
    let best = clearTiles[0] || roamTiles[0];
    let bestScore = Infinity;
    clearTiles.forEach((tile) => {
      const score = Math.abs(tile.x - targetX) + Math.abs(tile.y - targetY) + hash01(seed + tile.x * 13 + tile.y * 19, 1) * 0.4;
      if (score < bestScore) {
        bestScore = score;
        best = tile;
      }
    });
    return best;
  };
  const heroSeeds = { dojocat: 7, buu: 20, devit: 33, pixiu: 46 };
  const heroAnchors = {
    dojocat: [0.35, 0.35],
    buu: [0.65, 0.65],
    devit: [0.6, 0.36],
    pixiu: [0.42, 0.62],
  };
  const [rx, ry] = heroAnchors[heroCharacter] || heroAnchors.dojocat;
  const seed = heroSeeds[heroCharacter] || heroSeeds.dojocat;
  const heroAnchor = pickVillageAnchor(clearTiles, buildings, seed) || pickAnchor(rx, ry, seed);
  return [{
    x: heroAnchor?.x ?? Math.floor((grid.w || 20) * rx),
    y: heroAnchor?.y ?? Math.floor((grid.h || 20) * ry),
    character: heroCharacter,
    seed,
    heroScale: 1.0,
    idleFacing: 2,
    pauseFacing: 2,
    walkCyclesPerTile: 2.8,
    idleFrameRate: 0.00026,
    route: buildRoamingTileRoute(heroAnchor, roamTiles, grid, terrainRegions, seed, {
      stopCount: 3,
      minDist: 5,
      maxDist: 12,
      pauseBase: 18000,
      pauseVariance: 6500,
      speed: 0.6,
      pauseFacing: 2,
      walkOptions: ROAMING_WALK_OPTIONS,
    }),
  }];
}

function buildResidentPlacements(world, terrainRegions, buildings = []) {
  const grid = world?.grid;
  if (!grid) return [];
  const landGraph = buildLandComponents(grid, terrainRegions, RESIDENT_WALK_OPTIONS, buildings);
  const landTiles = landGraph.primary?.length ? landGraph.primary : findClearTiles(grid);
  const clearTiles = buildVillageCoreTiles(grid, terrainRegions, landTiles, buildings, 509, 13);
  const clearTileMap = new Map(clearTiles.map((tile) => [tileKey(tile.x, tile.y), tile]));
  const villageAnchor = pickVillageAnchor(clearTiles, buildings, 509) || clearTiles[0] || landTiles[0];
  const livedInTiles = clearTiles.filter(({ x, y }) => {
    const terrain = terrainRegions?.[y]?.[x];
    return (terrain?.laneStrength || 0) > 0.08 || (terrain?.villageWear || 0) > 0.08 || (terrain?.meadowStrength || 0) > 0.24;
  });
  const pool = livedInTiles.length >= 6 ? livedInTiles : clearTiles;
  const laneTiles = clearTiles
    .filter((tile) => getTileScore(tile, terrainRegions) > 0.42)
    .sort((a, b) => getTileScore(b, terrainRegions) - getTileScore(a, terrainRegions));
  const meadowTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.meadowStrength || 0) > 0.2);
  const wanderTiles = landTiles.filter(({ x, y }) => {
    const terrain = terrainRegions?.[y]?.[x];
    const distanceFromVillage = Math.abs(x - (villageAnchor?.x ?? x)) + Math.abs(y - (villageAnchor?.y ?? y));
    return distanceFromVillage >= 5
      && (terrain?.waterRatio || 0) < 0.08;
  });
  const inlandNatureTiles = landTiles.filter(({ x, y }) => {
    const terrain = terrainRegions?.[y]?.[x];
    const distanceFromVillage = Math.abs(x - (villageAnchor?.x ?? x)) + Math.abs(y - (villageAnchor?.y ?? y));
    return distanceFromVillage >= 3
      && ((terrain?.meadowStrength || 0) > 0.12 || (terrain?.foliageShadow || 0) > 0.1)
      && (terrain?.shoreStrength || 0) < 0.08
      && (terrain?.waterRatio || 0) < 0.04;
  });
  const fishingTaskTiles = buildFishingTaskTiles(world, terrainRegions, buildings);

  const builtBuildings = buildings.filter((building) => building.state === 'built');
  const homeAnchors = builtBuildings
    .filter((building) => HOME_BUILDINGS.has(building.type))
    .map((building) => {
      const anchor = getBuildingAnchor(building, clearTileMap, clearTiles, terrainRegions);
      return anchor ? { ...anchor, role: 'home' } : null;
    })
    .filter(Boolean);
  const workAnchors = builtBuildings
    .filter((building) => WORK_BUILDINGS.has(building.type))
    .map((building) => {
      const anchor = getBuildingAnchor(building, clearTileMap, clearTiles, terrainRegions);
      return anchor
        ? { ...anchor, role: 'work', buildingType: building.type, maxWorkers: building.max_workers || 1, buildingId: building.id }
        : null;
    })
    .filter(Boolean);
  const commonAnchors = builtBuildings
    .filter((building) => COMMON_BUILDINGS.has(building.type))
    .map((building) => {
      const anchor = getBuildingAnchor(building, clearTileMap, clearTiles, terrainRegions);
      return anchor
        ? {
            ...anchor,
            role: 'common',
            buildingType: building.type,
            anchorKind: SOCIAL_BUILDINGS.has(building.type) ? 'social' : (QUIET_BUILDINGS.has(building.type) ? 'quiet' : 'common'),
            buildingId: building.id,
          }
        : null;
    })
    .filter(Boolean);

  const weightedWorkAnchors = expandWeightedStops(workAnchors, (anchor) => anchor.maxWorkers || 1);
  const socialAnchors = commonAnchors.filter((anchor) => anchor.anchorKind === 'social');
  const quietAnchors = commonAnchors.filter((anchor) => anchor.anchorKind === 'quiet');
  const weightedSocialAnchors = expandWeightedStops(socialAnchors, (anchor) => (anchor.buildingType === 'town_hall' ? 3 : anchor.buildingType === 'market' ? 4 : 2));
  const weightedQuietAnchors = expandWeightedStops(quietAnchors, () => 2);
  const residentClearance = {
    grid,
    terrainRegions,
    walkOptions: RESIDENT_WALK_OPTIONS,
    padding: 0.12,
  };

  const count = Math.min(Math.max(0, world.population || 0), 18, pool.length);
  const assignedWorkers = Math.max(0, world.assigned_workers || 0);
  const placements = [];
  for (let i = 0; i < count; i += 1) {
    const tile = pickFromPool(pool, i * 13 + Math.floor(i / 3) * 5, pool[0]);
    const working = i < assignedWorkers;
    const seed = i * 29 + 11;
    // Give each resident a unique per-resident seed for diverse destination selection
    // Previously groups of 3 shared the same socialSeedBase → identical destinations
    const personalSeed = i * 47 + seed * 3 + 7;
    const homeTile = pickFromPool(homeAnchors, personalSeed + 1, tile);
    const laneTile = pickFromPool(laneTiles, personalSeed + 17, tile);
    const preferredSocial = (seed % 3) !== 0;
    // Use personal seed + diverse offsets so each resident picks different social/leisure spots
    const leisureTile = preferredSocial
      ? pickFromPool(weightedSocialAnchors, personalSeed + 31, pickFromPool(commonAnchors, personalSeed + 41, pickFromPool(meadowTiles, personalSeed + 51, tile)))
      : pickFromPool(weightedQuietAnchors, personalSeed + 37, pickFromPool(commonAnchors, personalSeed + 43, pickFromPool(meadowTiles, personalSeed + 53, tile)));
    const natureTile = pickFromPool(inlandNatureTiles, personalSeed + 61, pickFromPool(meadowTiles, personalSeed + 71, tile));
    const baseWorkTile = working
      ? pickFromPool(weightedWorkAnchors, personalSeed + 81, pickFromPool(commonAnchors, personalSeed + 91, tile))
      : leisureTile;
    const workTile = working && baseWorkTile?.buildingType === 'fishing_hut'
      ? (() => {
          const fishingTile = pickFromPool(fishingTaskTiles, personalSeed + 101, baseWorkTile);
          return fishingTile
            ? {
                ...fishingTile,
                role: 'work',
                buildingType: 'fishing_hut',
                buildingId: baseWorkTile.buildingId || null,
              }
            : baseWorkTile;
        })()
      : baseWorkTile;
    const plazaTile = pickFromPool(weightedSocialAnchors, personalSeed + 111, laneTile);
    const wanderTile = pickFromPool(wanderTiles, personalSeed + 121, natureTile);
    const residentArchetype = working
      ? (
        workTile?.buildingType && ['market', 'trading_post', 'storehouse', 'warehouse', 'bakery'].includes(workTile.buildingType) ? 'merchant'
          : workTile?.buildingType && ['watchtower', 'shrine', 'town_hall', 'weaving_hut'].includes(workTile.buildingType) ? 'craft'
            : 'gatherer'
      )
      : (preferredSocial ? 'social' : 'quiet');

    const routePoints = working
      ? [
          { ...pointFromTile(homeTile, seed + 1, 0, 0, residentClearance), role: 'home', pauseMs: 9800 + hash01(seed, 3) * 3200 },
          { ...pointFromTile(laneTile, seed + 2, 0, 0, residentClearance), role: 'path', pauseMs: 0 },
          { ...pointFromTile(workTile, seed + 3, 0, 0, residentClearance), role: 'work', pauseMs: 11800 + hash01(seed, 5) * 3600 },
          { ...pointFromTile(plazaTile, seed + 4, 0, 0, residentClearance), role: 'common', pauseMs: 14800 + hash01(seed, 6) * 3200 },
          { ...pointFromTile(leisureTile, seed + 5, 0, 0, residentClearance), role: 'common', pauseMs: 16200 + hash01(seed, 7) * 3600 },
          { ...pointFromTile(wanderTile, seed + 6, 0, 0, residentClearance), role: 'common', pauseMs: 17600 + hash01(seed, 8) * 4200 },
        ]
      : [
          { ...pointFromTile(homeTile, seed + 1, 0, 0, residentClearance), role: 'home', pauseMs: 16000 + hash01(seed, 3) * 4200 },
          { ...pointFromTile(plazaTile, seed + 2, 0, 0, residentClearance), role: 'common', pauseMs: 15000 + hash01(seed, 4) * 3600 },
          { ...pointFromTile(leisureTile, seed + 3, 0, 0, residentClearance), role: 'common', pauseMs: 17800 + hash01(seed, 5) * 4200 },
          { ...pointFromTile(natureTile, seed + 4, 0, 0, residentClearance), role: 'common', pauseMs: 18400 + hash01(seed, 6) * 4200 },
          { ...pointFromTile(wanderTile, seed + 6, 0, 0, residentClearance), role: 'common', pauseMs: 19200 + hash01(seed, 8) * 4600 },
          { ...pointFromTile(laneTile, seed + 5, 0, 0, residentClearance), role: 'path', pauseMs: 0 },
        ];

    placements.push({
      ...homeTile,
      palette: pickResidentPalette(i, workTile?.buildingType || null),
      activity: working ? ['gather', 'carry', 'build'][i % 3] : ['stroll', 'play', 'stroll'][i % 3],
      archetype: residentArchetype,
      workBuildingType: workTile?.buildingType || null,
      seed,
      idleFacing: 2,
      pauseFacing: 2,
      linearMotion: true,
      walkCyclesPerTile: 2.4,
      route: expandResidentRoute(routePoints, seed, grid, terrainRegions, {
        speed: 0.78,
        walkOptions: RESIDENT_WALK_OPTIONS,
        pauseFacing: 2,
      }),
      x: tile.x,
      y: tile.y,
    });
  }
  return assignResidentGroups(placements);
}

function buildAmbientFauna(world, terrainRegions, buildings = []) {
  const { grid, roamingTiles, waterTiles, meadowTiles, woodedTiles, shoreLandTiles, villageAnimalTiles } = buildFaunaPools(world, terrainRegions, buildings);
  if (!grid) return [];

  const placements = [];
  const usedLandAnimalAnchors = [];
  const fishCount = Math.min(7, Math.max(2, Math.floor(waterTiles.length / 18)));
  for (let i = 0; i < fishCount && waterTiles.length; i += 1) {
    const tile = waterTiles[(i * 7 + 3) % waterTiles.length];
    const waterSpecies = i % 3 === 0 ? 'duck' : (i % 2 === 0 ? 'fish_koi' : 'fish_perch');
    placements.push({
      ...tile,
      species: waterSpecies,
      seed: 101 + i * 19,
      rangeX: waterSpecies === 'duck' ? 0.18 : 0.35,
      rangeY: waterSpecies === 'duck' ? 0.1 : 0.2,
      period: 2800 + i * 210,
      layer: 'water',
      yBias: waterSpecies === 'duck' ? 0.58 : 0.62,
      scale: waterSpecies === 'duck' ? 0.72 : 0.62,
      idleFacing: hash01(101 + i * 19, 73) > 0.5 ? 1 : -1,
      sideOnlyFacing: waterSpecies === 'duck',
      defaultSideFacing: -1,
      idleFrameRate: waterSpecies === 'duck' ? 0.00012 : 0.00008,
      phaseOffset: hash01(101 + i * 19, 71) * Math.PI * 2,
      phaseOffsetY: hash01(101 + i * 19, 72) * Math.PI * 2,
    });
  }

  const goosePool = shoreLandTiles.length ? shoreLandTiles : (meadowTiles.length ? meadowTiles : roamingTiles);
  const gooseCount = Math.min(2, goosePool.length ? 1 + (world.population > 6 ? 1 : 0) : 0);
  for (let i = 0; i < gooseCount; i += 1) {
    const tile = pickDiverseTile(goosePool, usedLandAnimalAnchors, 167 + i * 29, 3);
    const profile = getGroundAnimalProfile('goose');
    usedLandAnimalAnchors.push(tile);
    placements.push({
      ...tile,
      species: 'goose',
      seed: 167 + i * 29,
      layer: 'ground',
      ...profile,
      route: buildRoamingTileRoute(tile, goosePool, grid, terrainRegions, 167 + i * 29, {
        ...profile.route,
        pauseFacing: profile.pauseFacing ?? 2,
        walkOptions: ROAMING_WALK_OPTIONS,
      }),
    });
  }

  const farmyardTiles = buildings
    .filter((building) => building.state === 'built' && ['farm', 'house'].includes(building.type || building.building_type))
    .flatMap((building) => villageAnimalTiles.filter((tile) => {
      const centerX = building.grid_x + building.width / 2;
      const centerY = building.grid_y + building.height / 2;
      return Math.abs(tile.x + 0.5 - centerX) + Math.abs(tile.y + 0.5 - centerY) <= 5;
    }));
  const uniqueFarmyardTiles = Array.from(new Map(farmyardTiles.map((tile) => [tileKey(tile.x, tile.y), tile])).values());
  const mammalPool = uniqueFarmyardTiles.length
    ? uniqueFarmyardTiles
    : (villageAnimalTiles.length ? villageAnimalTiles : (meadowTiles.length ? meadowTiles : roamingTiles));
  const farmSpecies = ['pig', 'sheep', 'horse', 'cow', 'chicken', 'rabbit', 'fox'];
  const mammalCount = Math.min(farmSpecies.length, Math.max(3, Math.ceil((world.expansions || 0) + (world.population || 0) / 5)));
  for (let i = 0; i < mammalCount && mammalPool.length; i += 1) {
    const tile = pickDiverseTile(mammalPool, usedLandAnimalAnchors, 203 + i * 23, 4);
    const species = farmSpecies[i % farmSpecies.length];
    const profile = getGroundAnimalProfile(species);
    usedLandAnimalAnchors.push(tile);
    placements.push({
      ...tile,
      species,
      seed: 203 + i * 23,
      period: 3200 + i * 250,
      layer: 'ground',
      ...profile,
      route: buildRoamingTileRoute(tile, mammalPool, grid, terrainRegions, 203 + i * 23, {
        ...profile.route,
        pauseFacing: profile.pauseFacing ?? 2,
        walkOptions: ROAMING_WALK_OPTIONS,
      }),
    });
  }

  const birdPool = woodedTiles.length ? woodedTiles : roamingTiles;
  const birdCount = Math.min(5, Math.max(2, Math.ceil(((world.population || 0) + 2) / 4)));
  for (let i = 0; i < birdCount && birdPool.length; i += 1) {
    const tile = birdPool[(i * 9 + 1) % birdPool.length];
    placements.push({
      ...tile,
      species: 'songbird',
      seed: 307 + i * 31,
      rangeX: 0.28,
      rangeY: 0.22,
      period: 2400 + i * 160,
      layer: 'air',
      yBias: 0.48,
      scale: i % 4 === 0 ? 0.58 : 0.46,
    });
  }

  return placements;
}

function buildEncounterSightings(world, terrainRegions, encounters = [], buildings = []) {
  const { grid, roamingTiles, meadowTiles, woodedTiles, shoreLandTiles } = buildFaunaPools(world, terrainRegions, buildings);
  if (!grid || !encounters.length) return [];
  if (!roamingTiles.length) return [];

  return encounters.map((encounter, index) => {
    const type = encounter.encounter_type;
    const pool =
      type === 'rare_bird' ? (shoreLandTiles.length ? shoreLandTiles : (meadowTiles.length ? meadowTiles : woodedTiles)) :
      type === 'bear_sighting' ? (woodedTiles.length ? woodedTiles : roamingTiles) :
      type === 'wolf_pack' ? (woodedTiles.length ? woodedTiles : meadowTiles) :
      (meadowTiles.length ? meadowTiles : roamingTiles);
    const tile = pool[(index * 17 + 7) % pool.length];
    const species = ENCOUNTER_SPECIES[type] || 'fox';
    const groundProfile = getGroundAnimalProfile(species === 'deer' ? 'horse' : species === 'boar' ? 'pig' : species);
    return {
      ...tile,
      encounter,
      species,
      seed: 409 + index * 37,
      range: type === 'bear_sighting' ? 0.28 : 0.4,
      period: 3000 + index * 180,
      layer: 'ground',
      yBias: type === 'rare_bird' ? 0.82 : 0.8,
      scale: type === 'rare_bird' ? 0.78 : type === 'bear_sighting' ? 0.86 : type === 'wolf_pack' ? 0.76 : 0.72,
      tileKey: `${tile.x}:${tile.y}`,
      idleFacing: type === 'rare_bird' ? -1 : (groundProfile.idleFacing ?? 2),
      pauseFacing: groundProfile.pauseFacing ?? 2,
      sideOnlyFacing: type === 'rare_bird' ? true : groundProfile.sideOnlyFacing,
      defaultSideFacing: type === 'rare_bird' ? -1 : groundProfile.defaultSideFacing,
      idleFrameRate: type === 'rare_bird' ? 0.00004 : groundProfile.idleFrameRate,
      walkCyclesPerTile: type === 'rare_bird' ? 0.95 : 2.2,
      route: buildRoamingTileRoute(tile, pool, grid, terrainRegions, 409 + index * 37, {
        stopCount: 3,
        minDist: 2,
        maxDist: type === 'bear_sighting' ? 4 : 5,
        pauseBase: type === 'rare_bird' ? 18000 : 9600,
        pauseVariance: type === 'rare_bird' ? 4000 : 2800,
        speed: type === 'rare_bird' ? 0.4 : undefined,
        pauseFacing: 2,
        sideOnlyMovement: type === 'rare_bird',
        walkOptions: ENCOUNTER_WALK_OPTIONS,
      }),
    };
  });
}

function getPetWanderPos(pet, time) {
  return getTileRouteMotion(pet, time);
}

/** Check if all tiles in a footprint are valid for building. */
function isPlacementValid(grid, gx, gy, bw, bh, buildingType) {
  if (!grid) return false;
  for (let dy = 0; dy < bh; dy++) {
    for (let dx = 0; dx < bw; dx++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return false;
      const tile = grid.tiles[ty]?.[tx];
      if (!tile) return false;
      if (tile.b != null) return false;
      if (['water', 'rock', 'tree', 'bush', 'stump'].includes(tile.t)) return false;
    }
  }
  // Paths cannot be placed on shore tiles (adjacent to water)
  if (buildingType === 'path') {
    for (let dy = 0; dy < bh; dy++) {
      for (let dx = 0; dx < bw; dx++) {
        const tx = gx + dx;
        const ty = gy + dy;
        for (let ny = -1; ny <= 1; ny++) {
          for (let nx = -1; nx <= 1; nx++) {
            if (nx === 0 && ny === 0) continue;
            const nb = grid.tiles[ty + ny]?.[tx + nx];
            if (nb?.t === 'water') return false;
          }
        }
      }
    }
  }
  // fishing_hut requires adjacent water
  if (buildingType === 'fishing_hut') {
    let hasWater = false;
    for (let dy = -1; dy <= bh; dy++) {
      for (let dx = -1; dx <= bw; dx++) {
        if (dx >= 0 && dx < bw && dy >= 0 && dy < bh) continue;
        const tx = gx + dx;
        const ty = gy + dy;
        if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) continue;
        const tile = grid.tiles[ty]?.[tx];
        if (tile?.t === 'water') { hasWater = true; break; }
      }
      if (hasWater) break;
    }
    if (!hasWater) return false;
  }
  return true;
}

/** Clamp camera so viewport does not show space beyond the grid. */
function clampCamera(cx, cy, zoom, gridW, gridH, viewW, viewH) {
  const ts = BASE_TILE_SIZE * zoom;
  const worldW = gridW * ts;
  const worldH = gridH * ts;
  const maxX = Math.max(0, worldW - viewW);
  const maxY = Math.max(0, worldH - viewH);
  return {
    x: Math.max(0, Math.min(cx, maxX)),
    y: Math.max(0, Math.min(cy, maxY)),
  };
}

export default function PetWorldCanvas({
  world,
  buildings = [],
  encounters = [],
  selectedBuildingId,
  selectedTile,
  pendingBuildType,
  terraformMode = '',
  readonly = false,
  readonlyLabel = 'Visiting',
  placementBurst = null,
  onSelectBuilding,
  onSelectEncounter,
  onSelectTile,
  onPlaceBuilding,
  onEnterBuilding,
  onTerraformTile,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const animationFrameRef = useRef(0);
  const animatingRef = useRef(false);
  const timeRef = useRef(0);
  const cameraTargetRef = useRef(null); // for smooth camera easing
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverTile, setHoverTile] = useState(null);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [selectedBldgMenu, setSelectedBldgMenu] = useState(null);
  const [carryingEntity, setCarryingEntity] = useState(null);
  const relocationsRef = useRef(new Map());
  const entityPositionsRef = useRef([]);
  const buildingMap = useMemo(() => getBuildingMap(buildings), [buildings]);
  const terrainRegions = useMemo(() => analyzeTerrainGrid(world?.grid, buildings), [world?.grid, buildings]);
  const residentPlacements = useMemo(() => buildResidentPlacements(world, terrainRegions, buildings), [world, terrainRegions, buildings]);
  const petPlacements = useMemo(() => buildPetPlacements(world, terrainRegions, buildings), [world, terrainRegions, buildings]);
  const ambientFauna = useMemo(() => buildAmbientFauna(world, terrainRegions, buildings), [world, terrainRegions, buildings]);
  const encounterSightings = useMemo(() => buildEncounterSightings(world, terrainRegions, encounters, buildings), [world, terrainRegions, encounters, buildings]);
  const fishingDecorations = useMemo(() => buildFishingDecorations(world, terrainRegions, buildings), [world, terrainRegions, buildings]);
  const driftingCloudShadows = useMemo(() => buildDriftingCloudShadows(world), [world]);
  const encounterTileMap = useMemo(
    () => new Map(encounterSightings.map((sighting) => [sighting.tileKey, sighting])),
    [encounterSightings],
  );
  const reduceMotion = useMemo(
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false),
    [],
  );
  const handleResidentTaskCommand = useCallback((entry, taskKind) => {
    if (!entry || entry.type !== 'resident') return;
    const reservations = buildResidentTaskReservations(relocationsRef.current, entry.key);
    const taskState = buildResidentTaskState(
      entry.entity,
      entry.motion,
      taskKind,
      world,
      terrainRegions,
      buildings,
      timeRef.current || performance.now(),
      reservations,
    );
    if (!taskState) {
      setSelectedEntity(null);
      return;
    }
    const currentRelocation = relocationsRef.current.get(entry.key) || {};
    relocationsRef.current.set(entry.key, {
      ...currentRelocation,
      ...taskState,
    });
    setSelectedEntity(null);
  }, [world, terrainRegions, buildings]);

  const tileSize = Math.round(BASE_TILE_SIZE * FIXED_ZOOM);

  // --- resize observer ---
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // --- center camera on load with smooth easing target ---
  useEffect(() => {
    if (!world?.grid) return;
    const ts = BASE_TILE_SIZE * FIXED_ZOOM;
    const cx = (world.grid.w * ts) / 2 - size.width / 2;
    const cy = (world.grid.h * ts) / 2 - size.height / 2;
    const clamped = clampCamera(cx, cy, FIXED_ZOOM, world.grid.w, world.grid.h, size.width, size.height);
    cameraTargetRef.current = { x: clamped.x, y: clamped.y };
    setCamera({ x: clamped.x, y: clamped.y });
  }, [world?.grid?.w, world?.grid?.h, size.width, size.height]);

  // --- minimap rendering helper ---
  const drawMinimap = useCallback((ctx, viewW, viewH) => {
    if (!minimapVisible || !world?.grid || pendingBuildType) return;
    const grid = world.grid;
    const biomeUi = getBiomeUi(world.biome);

    // minimap position: bottom-left
    const mx = MINIMAP_PADDING;
    const my = viewH - MINIMAP_H - MINIMAP_PADDING;

    // Premium minimap frame
    ctx.save();
    // Outer shadow
    ctx.beginPath();
    ctx.roundRect(mx - 3, my - 3, MINIMAP_W + 6, MINIMAP_H + 6, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    // Inner frame
    ctx.beginPath();
    ctx.roundRect(mx - 1.5, my - 1.5, MINIMAP_W + 3, MINIMAP_H + 3, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Subtle inner glow at top
    const glowGrad = ctx.createLinearGradient(mx, my, mx, my + MINIMAP_H * 0.3);
    glowGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.roundRect(mx, my, MINIMAP_W, MINIMAP_H * 0.3, [4, 4, 0, 0]);
    ctx.fillStyle = glowGrad;
    ctx.fill();
    ctx.restore();

    // clip to minimap area
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mx, my, MINIMAP_W, MINIMAP_H, 4);
    ctx.clip();

    // draw tile dots
    const dotW = MINIMAP_W / grid.w;
    const dotH = MINIMAP_H / grid.h;
    for (let ty = 0; ty < grid.h; ty++) {
      for (let tx = 0; tx < grid.w; tx++) {
        const tile = grid.tiles[ty]?.[tx];
        if (!tile) continue;
        const dx = mx + tx * dotW;
        const dy = my + ty * dotH;
        const terrain = terrainRegions?.[ty]?.[tx];
        const encounterKey = `${tx}:${ty}`;
        let color;
        if (tile.b != null) {
          const building = buildingMap.get(tile.b);
          const ui = getBuildingUi(building?.type);
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(dx - 0.5, dy - 0.5, Math.max(2, dotW + 1), Math.max(2, dotH + 1));
          color = building?.type === 'path' ? (biomeUi.pathStone || '#b3a389') : (ui.accent || '#ffffff');
        } else if (tile.t === 'water') {
          color = (terrain?.basinDepth || 0) > 0.5 ? biomeUi.waterDeep : biomeUi.water;
        } else if (tile.t === 'tree' || tile.t === 'bush' || tile.t === 'stump') {
          color = biomeUi.tree;
        } else if (tile.t === 'rock') {
          color = biomeUi.rock;
        } else if ((terrain?.shoreStrength || 0) > 0.45) {
          color = biomeUi.waterShore;
        } else if ((terrain?.rockyStrength || 0) > 0.4) {
          color = biomeUi.pathStone || biomeUi.ground[0];
        } else if ((terrain?.meadowStrength || 0) > 0.45) {
          color = biomeUi.ground[2] || biomeUi.ground[1];
        } else {
          color = biomeUi.ground[1] || biomeUi.ground[0];
        }
        ctx.fillStyle = color;
        ctx.fillRect(dx, dy, Math.max(1, dotW), Math.max(1, dotH));
        if (encounterTileMap.has(encounterKey)) {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(dx + Math.max(0, dotW * 0.2), dy + Math.max(0, dotH * 0.2), Math.max(1.5, dotW * 0.65), Math.max(1.5, dotH * 0.65));
        }
      }
    }

    // viewport rectangle
    const ts = BASE_TILE_SIZE * FIXED_ZOOM;
    const vpX = mx + (camera.x / (grid.w * ts)) * MINIMAP_W;
    const vpY = my + (camera.y / (grid.h * ts)) * MINIMAP_H;
    const vpW = (viewW / (grid.w * ts)) * MINIMAP_W;
    const vpH = (viewH / (grid.h * ts)) * MINIMAP_H;
    // Viewport rectangle with glow
    ctx.save();
    ctx.strokeStyle = 'rgba(80,220,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(80,220,255,0.3)';
    ctx.shadowBlur = 4;
    const clampedVpW = Math.min(vpW, MINIMAP_W - (vpX - mx));
    const clampedVpH = Math.min(vpH, MINIMAP_H - (vpY - my));
    ctx.strokeRect(vpX, vpY, clampedVpW, clampedVpH);
    // Corner brackets for extra visibility
    const bracketLen = Math.min(4, clampedVpW * 0.2, clampedVpH * 0.2);
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(80,220,255,0.9)';
    // Top-left
    ctx.beginPath();
    ctx.moveTo(vpX, vpY + bracketLen); ctx.lineTo(vpX, vpY); ctx.lineTo(vpX + bracketLen, vpY);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(vpX + clampedVpW - bracketLen, vpY); ctx.lineTo(vpX + clampedVpW, vpY); ctx.lineTo(vpX + clampedVpW, vpY + bracketLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(vpX, vpY + clampedVpH - bracketLen); ctx.lineTo(vpX, vpY + clampedVpH); ctx.lineTo(vpX + bracketLen, vpY + clampedVpH);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(vpX + clampedVpW - bracketLen, vpY + clampedVpH); ctx.lineTo(vpX + clampedVpW, vpY + clampedVpH); ctx.lineTo(vpX + clampedVpW, vpY + clampedVpH - bracketLen);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }, [world, camera.x, camera.y, minimapVisible, pendingBuildType, terrainRegions, buildingMap, encounterTileMap]);

  // --- main render ---
  const render = useCallback((timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas || !world?.grid || !size.width || !size.height) return;
    const time = timestamp || performance.now();
    timeRef.current = time;

    // Camera easing: lerp toward target
    const target = cameraTargetRef.current;
    if (target) {
      const dx = target.x - camera.x;
      const dy = target.y - camera.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        setCamera((prev) => ({
          x: prev.x + (target.x - prev.x) * LERP_SPEED,
          y: prev.y + (target.y - prev.y) * LERP_SPEED,
        }));
      } else {
        // close enough, snap
        cameraTargetRef.current = null;
        setCamera({ x: target.x, y: target.y });
      }
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.round(size.width * dpr);
    const ch = Math.round(size.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    // Snap camera to integer pixels — prevents subpixel tile seams and
    // ensures tileHash is stable (no asset re-rolling during camera pans)
    const camX = Math.round(camera.x);
    const camY = Math.round(camera.y);

    const startX = Math.max(0, Math.floor(camX / tileSize));
    const startY = Math.max(0, Math.floor(camY / tileSize));
    const endX = Math.min(world.grid.w, Math.ceil((camX + size.width) / tileSize) + 1);
    const endY = Math.min(world.grid.h, Math.ceil((camY + size.height) / tileSize) + 1);

    ctx.fillStyle = '#07121a';
    ctx.fillRect(0, 0, size.width, size.height);

    const visibleTiles = [];
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const tile = world.grid.tiles[y]?.[x];
        if (!tile) continue;
        const screenX = x * tileSize - camX;
        const screenY = y * tileSize - camY;
        const neighbors = {
          n:  world.grid.tiles[y - 1]?.[x]?.t || null,
          s:  world.grid.tiles[y + 1]?.[x]?.t || null,
          e:  world.grid.tiles[y]?.[x + 1]?.t || null,
          w:  world.grid.tiles[y]?.[x - 1]?.t || null,
          ne: world.grid.tiles[y - 1]?.[x + 1]?.t || null,
          nw: world.grid.tiles[y - 1]?.[x - 1]?.t || null,
          se: world.grid.tiles[y + 1]?.[x + 1]?.t || null,
          sw: world.grid.tiles[y + 1]?.[x - 1]?.t || null,
          // Path neighbor flags for Wang grass↔path auto-tiling
          // Only actual path buildings count — ambient laneStrength was bleeding
          // cobblestone texture onto grass tiles near non-path buildings
          n_path:  !!terrainRegions?.[y - 1]?.[x]?.isPathBuilding,
          s_path:  !!terrainRegions?.[y + 1]?.[x]?.isPathBuilding,
          e_path:  !!terrainRegions?.[y]?.[x + 1]?.isPathBuilding,
          w_path:  !!terrainRegions?.[y]?.[x - 1]?.isPathBuilding,
          ne_path: !!terrainRegions?.[y - 1]?.[x + 1]?.isPathBuilding,
          nw_path: !!terrainRegions?.[y - 1]?.[x - 1]?.isPathBuilding,
          se_path: !!terrainRegions?.[y + 1]?.[x + 1]?.isPathBuilding,
          sw_path: !!terrainRegions?.[y + 1]?.[x - 1]?.isPathBuilding,
        };
        visibleTiles.push({
          x,
          y,
          tile,
          screenX,
          screenY,
          neighbors,
          terrain: terrainRegions?.[y]?.[x] || null,
        });
      }
    }

    visibleTiles.forEach(({ tile, x: gx, y: gy, screenX, screenY, neighbors, terrain }) => {
      drawTerrainRegion(ctx, world.biome, tile, screenX, screenY, tileSize, terrain, neighbors);
    });

    visibleTiles.forEach(({ tile, x: gx, y: gy, screenX, screenY, neighbors, terrain }) => {
      drawTile(ctx, world.biome, tile, screenX, screenY, tileSize, time, neighbors, terrain, gx, gy);
    });

    const visibleCloudShadows = driftingCloudShadows
      .map((cloud) => {
        const wrapWidth = world.grid.w + cloud.widthTiles + 6;
        const driftX = (((cloud.startX + time * cloud.speed) % wrapWidth) + wrapWidth) % wrapWidth - cloud.widthTiles;
        return {
          ...cloud,
          x: driftX,
        };
      })
      .filter((cloud) => {
        const widthPx = cloud.widthTiles * tileSize;
        const heightPx = cloud.heightTiles * tileSize;
        const screenX = cloud.x * tileSize - camX;
        const screenY = cloud.y * tileSize - camY;
        return !(screenX + widthPx < -tileSize
          || screenY + heightPx < -tileSize
          || screenX > size.width + tileSize
          || screenY > size.height + tileSize);
      });

    const visibleFishingDecor = fishingDecorations.filter((decor) => {
      const widthPx = (decor.widthTiles || 1) * tileSize;
      const heightPx = (decor.heightTiles || 1) * tileSize;
      const screenX = decor.x * tileSize - camX;
      const screenY = decor.y * tileSize - camY;
      return !(screenX + widthPx < -tileSize
        || screenY + heightPx < -tileSize
        || screenX > size.width + tileSize
        || screenY > size.height + tileSize);
    });

    visibleFishingDecor
      .filter((decor) => decor.type !== 'cloud_shadow')
      .forEach((decor) => {
        drawCuteFantasyFishingDecor(ctx, {
          ...decor,
          screenX: decor.x * tileSize - camX,
          screenY: decor.y * tileSize - camY,
          width: (decor.widthTiles || 1) * tileSize,
          height: (decor.heightTiles || 1) * tileSize,
          postScreenX: decor.postX != null ? decor.postX * tileSize - camX : null,
          postScreenY: decor.postY != null ? decor.postY * tileSize - camY : null,
          ropeScreenX: decor.ropeX != null ? decor.ropeX * tileSize - camX : null,
          ropeScreenY: decor.ropeY != null ? decor.ropeY * tileSize - camY : null,
        }, tileSize, time);
      });

    visibleCloudShadows.forEach((decor) => {
      drawCuteFantasyFishingDecor(ctx, {
        ...decor,
        screenX: decor.x * tileSize - camX,
        screenY: decor.y * tileSize - camY,
        width: decor.widthTiles * tileSize,
        height: decor.heightTiles * tileSize,
        externalDrift: true,
      }, tileSize, time);
    });

    visibleFishingDecor
      .filter((decor) => decor.type === 'cloud_shadow')
      .forEach((decor) => {
        drawCuteFantasyFishingDecor(ctx, {
          ...decor,
          screenX: decor.x * tileSize - camX,
          screenY: decor.y * tileSize - camY,
          width: (decor.widthTiles || 1) * tileSize,
          height: (decor.heightTiles || 1) * tileSize,
        }, tileSize, time);
      });

    ambientFauna
      .filter((creature) => creature.layer === 'water')
      .forEach((creature) => {
        const wander = getAnimalWanderPos(creature, time, null); // water creatures skip land checks
        const screenX = wander.x * tileSize - camX + tileSize / 2;
        const screenY = wander.y * tileSize - camY + tileSize * creature.yBias;
        if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
        const floatingBird = creature.species === 'duck';
        drawAmbientCritter(ctx, screenX, screenY, tileSize, creature.species, wander.frameOffset, {
          scale: creature.scale,
          facing: wander.facing,
          moving: floatingBird ? false : wander.moving,
          waterborne: true,
        });
      });

    // atmospheric depth: distant tiles (top of grid) slightly hazier
    if (endY > startY) {
      const hazeH = Math.min(size.height * 0.3, (endY - startY) * tileSize * 0.2);
      const topScreenY = startY * tileSize - camY;
      if (topScreenY < size.height * 0.4) {
        ctx.save();
        const hazeGrad = ctx.createLinearGradient(0, Math.max(0, topScreenY), 0, Math.max(0, topScreenY) + hazeH);
        hazeGrad.addColorStop(0, 'rgba(255,247,212,0.16)');
        hazeGrad.addColorStop(1, 'rgba(255,247,212,0)');
        ctx.fillStyle = hazeGrad;
        ctx.fillRect(0, Math.max(0, topScreenY), size.width, hazeH);
        ctx.restore();
      }
    }

    const carriedKey = carryingEntity?.key || null;
    const residentStates = residentPlacements.map((resident) => {
      const rKey = residentKey(resident);
      if (rKey === carriedKey) return null;
      const reloc = relocationsRef.current.get(rKey);
      const eff = reloc ? { ...resident, ...reloc } : resident;
      const motion = getRouteMotion(eff, time);
      const pose = getResidentInteractionPose(eff, motion, time);
      return {
        resident: eff,
        motion,
        pose,
        screenX: (motion.x + pose.offsetX) * tileSize - camX + tileSize / 2,
        screenY: (motion.y + pose.offsetY) * tileSize - camY + tileSize * 0.82,
      };
    }).filter(Boolean);
    const occupancyCounts = countBuildingOccupants(buildings, residentStates);

    // Pre-compute fence neighbor connectivity for auto-tiling
    const fenceTiles = new Set();
    buildings.forEach((b) => {
      if ((b.type || b.building_type) === 'fence') fenceTiles.add(`${b.grid_x}:${b.grid_y}`);
    });
    if (fenceTiles.size > 0) {
      buildings.forEach((b) => {
        if ((b.type || b.building_type) !== 'fence') return;
        const gx = b.grid_x;
        const gy = b.grid_y;
        b._fenceNeighbors =
          (fenceTiles.has(`${gx}:${gy - 1}`) ? 8 : 0) |  // N
          (fenceTiles.has(`${gx + 1}:${gy}`) ? 4 : 0) |  // E
          (fenceTiles.has(`${gx}:${gy + 1}`) ? 2 : 0) |  // S
          (fenceTiles.has(`${gx - 1}:${gy}`) ? 1 : 0);   // W
      });
    }

    const fenceBuildings = [];
    const regularBuildings = [];
    buildings.forEach((building) => {
      if ((building.type || building.building_type) === 'fence') {
        fenceBuildings.push(building);
      } else {
        regularBuildings.push(building);
      }
    });

    // buildings behind characters
    regularBuildings.forEach((building) => {
      const screenX = building.grid_x * tileSize - camX;
      const screenY = building.grid_y * tileSize - camY;
      const width = building.width * tileSize;
      const height = building.height * tileSize;
      if (screenX + width < 0 || screenY + height < 0 || screenX > size.width || screenY > size.height) return;
      drawBuildingSprite(ctx, world.biome, building, screenX, screenY, tileSize, selectedBuildingId === building.id);
      if (building.state !== 'built') drawConstructionOverlay(ctx, building, screenX, screenY, tileSize, time);
      if (selectedBuildingId === building.id) drawSelectionOutline(ctx, screenX, screenY, width, height, 'rgba(80,220,255,0.95)', time);
    });

    drawOccupancyMarkers(ctx, buildings, occupancyCounts, tileSize, camera, size);

    ambientFauna
      .filter((creature) => creature.layer !== 'water')
      .forEach((creature) => {
        const aKey = animalKey(creature);
        if (aKey === carriedKey) return;
        const reloc = relocationsRef.current.get(aKey);
        const eff = reloc ? { ...creature, ...reloc } : creature;
        const wander = getAnimalWanderPos(eff, time, world.grid);
        const screenX = wander.x * tileSize - camX + tileSize / 2;
        const screenY = wander.y * tileSize - camY + tileSize * eff.yBias;
        if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
        drawAmbientCritter(ctx, screenX, screenY, tileSize, eff.species, wander.frameOffset, {
          scale: eff.scale,
          facing: wander.facing,
          moving: wander.moving,
          idleState: wander.idleState,
        });
        // Draw sleep "zzz" particles for sleeping animals
        if (wander.idleState === 'sleeping') {
          const zPhase = (time * 0.001 + (eff.seed || 0) * 0.5) % 3;
          const zSize = tileSize * 0.06;
          ctx.save();
          ctx.font = `${Math.round(zSize + 2)}px sans-serif`;
          ctx.textAlign = 'center';
          for (let zi = 0; zi < 3; zi += 1) {
            const zP = (zPhase + zi * 0.9) % 3;
            const zAlpha = zP < 2 ? Math.min(1, zP * 0.8) * (1 - Math.max(0, zP - 1.4) / 0.6) : 0;
            if (zAlpha > 0.02) {
              ctx.globalAlpha = zAlpha * 0.55;
              ctx.fillStyle = '#e8e0f0';
              ctx.fillText('z', screenX + tileSize * (0.12 + zi * 0.06), screenY - tileSize * (0.18 + zP * 0.12));
            }
          }
          ctx.restore();
        }
      });

    residentStates.forEach(({ resident, motion, pose, screenX, screenY }) => {
      if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
      drawVillageResident(
        ctx,
        screenX,
        screenY,
        tileSize,
        resident.palette,
        getResidentDisplayActivity(resident, motion),
        motion.frameOffset,
        pose.facing || motion.facing,
        motion.moving,
      );
      drawResidentInteractionOverlay(ctx, screenX, screenY, tileSize, motion, pose, time);
    });

    // pet wandering
    petPlacements.forEach((pet) => {
      const pKey = petKey(pet);
      if (pKey === carriedKey) return;
      const reloc = relocationsRef.current.get(pKey);
      const eff = reloc ? { ...pet, ...reloc } : pet;
      const wander = getPetWanderPos(eff, time);
      const screenX = wander.x * tileSize - camX + tileSize / 2;
      const screenY = wander.y * tileSize - camY + tileSize * 0.80;
      if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
      drawPetWander(ctx, screenX, screenY, tileSize, eff.character, wander.frameOffset, wander.moving, wander.facing, eff.heroScale || 1);
    });

    encounterSightings.forEach((sighting) => {
      const wander = getAnimalWanderPos(sighting, time, world.grid);
      const screenX = wander.x * tileSize - camX + tileSize / 2;
      const screenY = wander.y * tileSize - camY + tileSize * sighting.yBias;
      if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
      const floatingBird = sighting.layer === 'water' && sighting.species === 'duck';
      drawAmbientCritter(ctx, screenX, screenY, tileSize, sighting.species, wander.frameOffset, {
        scale: sighting.scale,
        facing: wander.facing,
        moving: floatingBird ? false : wander.moving,
        waterborne: sighting.layer === 'water',
        highlight: true,
      });
    });

    // fences in the foreground so penned animals/people sit behind them instead of visually overlapping the rails
    fenceBuildings.forEach((building) => {
      const screenX = building.grid_x * tileSize - camX;
      const screenY = building.grid_y * tileSize - camY;
      const width = building.width * tileSize;
      const height = building.height * tileSize;
      if (screenX + width < 0 || screenY + height < 0 || screenX > size.width || screenY > size.height) return;
      drawBuildingSprite(ctx, world.biome, building, screenX, screenY, tileSize, selectedBuildingId === building.id);
      if (building.state !== 'built') drawConstructionOverlay(ctx, building, screenX, screenY, tileSize, time);
      if (selectedBuildingId === building.id) drawSelectionOutline(ctx, screenX, screenY, width, height, 'rgba(80,220,255,0.95)', time);
    });

    // Build entity screen-position array for tap hit-detection
    const hitEntities = [];
    residentStates.forEach(({ resident, motion, screenX, screenY }) => {
      hitEntities.push({ type: 'resident', key: residentKey(resident), screenX, screenY, hitRadius: tileSize * 0.5, entity: resident, motion });
    });
    petPlacements.forEach((pet) => {
      const pKey = petKey(pet);
      if (pKey === carriedKey) return;
      const reloc = relocationsRef.current.get(pKey);
      const eff = reloc ? { ...pet, ...reloc } : pet;
      const wander = getPetWanderPos(eff, time);
      hitEntities.push({ type: 'pet', key: pKey, screenX: wander.x * tileSize - camX + tileSize / 2, screenY: wander.y * tileSize - camY + tileSize * 0.80, hitRadius: tileSize * 0.55, entity: pet });
    });
    ambientFauna.filter((c) => c.layer === 'ground').forEach((creature) => {
      const aKey = animalKey(creature);
      if (aKey === carriedKey) return;
      const reloc = relocationsRef.current.get(aKey);
      const eff = reloc ? { ...creature, ...reloc } : creature;
      const wander = getAnimalWanderPos(eff, time, world.grid);
      hitEntities.push({ type: 'animal', key: aKey, screenX: wander.x * tileSize - camX + tileSize / 2, screenY: wander.y * tileSize - camY + tileSize * eff.yBias, hitRadius: tileSize * 0.45, entity: creature });
    });
    entityPositionsRef.current = hitEntities;

    // selection outline on selected tile
    if (selectedTile && selectedTile.x >= 0 && selectedTile.y >= 0) {
      const color = pendingBuildType ? 'rgba(110,231,183,0.9)' : 'rgba(80,220,255,0.95)';
      drawSelectionOutline(ctx, selectedTile.x * tileSize - camX, selectedTile.y * tileSize - camY, tileSize, tileSize, color, time);
    }

    // ghost footprint for pending build
    const ghostTile = hoverTile || selectedTile;
    if (pendingBuildType && ghostTile) {
      const bSize = getBuildingSize(pendingBuildType);
      const gx = ghostTile.x;
      const gy = ghostTile.y;
      const valid = isPlacementValid(world.grid, gx, gy, bSize.width, bSize.height, pendingBuildType);
      drawGhostFootprint(ctx, gx * tileSize - camX, gy * tileSize - camY, tileSize, bSize.width, bSize.height, valid, time);
    }

    // ghost preview for terraform mode
    if (terraformMode && ghostTile) {
      const gx = ghostTile.x;
      const gy = ghostTile.y;
      const tile = world.grid?.tiles?.[gy]?.[gx];
      const isValid = terraformMode === 'fill' ? tile?.t === 'water'
        : terraformMode === 'dig' ? tile?.t !== 'water' && tile?.b == null
        : (terraformMode === 'bridge_wood' || terraformMode === 'bridge_stone') ? tile?.t === 'water'
        : false;
      const color = isValid ? 'rgba(110,231,183,0.35)' : 'rgba(239,68,68,0.25)';
      ctx.save();
      ctx.fillStyle = color;
      ctx.fillRect(gx * tileSize - camX, gy * tileSize - camY, tileSize, tileSize);
      ctx.strokeStyle = isValid ? 'rgba(110,231,183,0.7)' : 'rgba(239,68,68,0.5)';
      ctx.lineWidth = Math.max(1, tileSize * 0.04);
      ctx.strokeRect(gx * tileSize - camX + 1, gy * tileSize - camY + 1, tileSize - 2, tileSize - 2);
      ctx.restore();
    }

    // ghost preview for entity carry mode
    if (carryingEntity && ghostTile) {
      const gx = ghostTile.x;
      const gy = ghostTile.y;
      const valid = isEntityPlacementValid(world.grid, terrainRegions, gx, gy, carryingEntity);
      drawGhostFootprint(ctx, gx * tileSize - camX, gy * tileSize - camY, tileSize, 1, 1, valid, time);
      const ghostScreenX = gx * tileSize - camX + tileSize / 2;
      const ghostScreenY = gy * tileSize - camY + tileSize * 0.82;
      ctx.save();
      ctx.globalAlpha = valid ? 0.6 : 0.3;
      if (carryingEntity.type === 'resident') {
        drawVillageResident(ctx, ghostScreenX, ghostScreenY, tileSize, carryingEntity.entity.palette, 'stroll', 0, 2, false);
      } else if (carryingEntity.type === 'pet') {
        drawPetWander(ctx, ghostScreenX, ghostScreenY, tileSize, carryingEntity.entity.character, 0, false, 2, carryingEntity.entity.heroScale || 1);
      } else if (carryingEntity.type === 'animal') {
        const animalScreenY = gy * tileSize - camY + tileSize * (carryingEntity.entity.yBias || 0.82);
        drawAmbientCritter(ctx, ghostScreenX, animalScreenY, tileSize, carryingEntity.entity.species, 0, {
          scale: carryingEntity.entity.scale || 0.6, facing: 2, moving: false,
        });
      }
      ctx.restore();
    }

    if (placementBurst) {
      const elapsed = time - placementBurst.startedAt;
      const burstDuration = reduceMotion ? 120 : 760;
      if (elapsed >= 0 && elapsed < burstDuration) {
        const progress = elapsed / burstDuration;
        const burstX = placementBurst.x * tileSize - camX;
        const burstY = placementBurst.y * tileSize - camY;
        const burstW = (placementBurst.width || 1) * tileSize;
        const burstH = (placementBurst.height || 1) * tileSize;
        const spread = progress * tileSize * 0.8;
        const alpha = Math.max(0, 1 - progress);
        ctx.save();
        ctx.fillStyle = `rgba(110,231,183,${(0.14 * alpha).toFixed(3)})`;
        ctx.fillRect(burstX - spread * 0.2, burstY - spread * 0.2, burstW + spread * 0.4, burstH + spread * 0.4);
        ctx.strokeStyle = `rgba(110,231,183,${(0.8 * alpha).toFixed(3)})`;
        ctx.lineWidth = 2.2;
        ctx.strokeRect(burstX + 2 - spread * 0.18, burstY + 2 - spread * 0.18, burstW - 4 + spread * 0.36, burstH - 4 + spread * 0.36);
        ctx.restore();
      }
    }

    // subtle vignette
    const vignette = ctx.createRadialGradient(
      size.width * 0.5,
      size.height * 0.48,
      Math.min(size.width, size.height) * 0.25,
      size.width * 0.5,
      size.height * 0.5,
      Math.max(size.width, size.height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(3,7,12,0.25)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size.width, size.height);

    // minimap overlay
    drawMinimap(ctx, size.width, size.height);

    // continue animation loop (always running for water/trees/pets)
    if (animatingRef.current) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
  }, [
    world,
    buildings,
    size.width,
    size.height,
    camera.x,
    camera.y,
    tileSize,
    selectedBuildingId,
    selectedTile,
    pendingBuildType,
    residentPlacements,
    petPlacements,
    ambientFauna,
    encounterSightings,
    hoverTile,
    drawMinimap,
    terrainRegions,
    placementBurst,
    reduceMotion,
    carryingEntity,
  ]);

  // --- animation control: always running ---
  const startAnimating = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    animationFrameRef.current = requestAnimationFrame(render);
  }, [render]);

  // start animation on mount -- NO idle timeout, runs continuously
  useEffect(() => {
    startAnimating();
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      animatingRef.current = false;
    };
  }, [startAnimating]);

  // re-render when deps change (single frame if idle)
  useEffect(() => {
    if (!animatingRef.current) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
  }, [render]);

  // --- coordinate helpers ---
  const toTilePosition = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !world?.grid) return null;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const tileX = Math.floor((localX + camera.x) / tileSize);
    const tileY = Math.floor((localY + camera.y) / tileSize);
    if (tileX < 0 || tileY < 0 || tileX >= world.grid.w || tileY >= world.grid.h) return null;
    return { x: tileX, y: tileY, tile: world.grid.tiles[tileY]?.[tileX] || null };
  }, [world, camera.x, camera.y, tileSize]);

  // --- minimap tap handler ---
  const handleMinimapTap = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !world?.grid) return false;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const mx = MINIMAP_PADDING;
    const my = size.height - MINIMAP_H - MINIMAP_PADDING;
    // check if tap is inside minimap bounds
    if (localX >= mx && localX <= mx + MINIMAP_W && localY >= my && localY <= my + MINIMAP_H) {
      // convert minimap position to camera position
      const fracX = (localX - mx) / MINIMAP_W;
      const fracY = (localY - my) / MINIMAP_H;
      const ts = BASE_TILE_SIZE * FIXED_ZOOM;
      const targetX = fracX * world.grid.w * ts - size.width / 2;
      const targetY = fracY * world.grid.h * ts - size.height / 2;
      const clamped = clampCamera(targetX, targetY, FIXED_ZOOM, world.grid.w, world.grid.h, size.width, size.height);
      // set easing target instead of jumping
      cameraTargetRef.current = { x: clamped.x, y: clamped.y };
      return true;
    }
    return false;
  }, [world, size.width, size.height]);

  // --- pointer handlers ---
  const handlePointerDown = (event) => {
    // check minimap tap first
    if (minimapVisible && handleMinimapTap(event.clientX, event.clientY)) {
      return;
    }
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      startTime: performance.now(),
      dragging: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      pointer.dragging = true;
      // direct touch-drag: no easing, moves immediately
      cameraTargetRef.current = null;
      setCamera(() => {
        const grid = world?.grid;
        if (!grid) return { x: Math.max(0, pointer.cameraX - dx), y: Math.max(0, pointer.cameraY - dy) };
        const clamped = clampCamera(pointer.cameraX - dx, pointer.cameraY - dy, FIXED_ZOOM, grid.w, grid.h, size.width, size.height);
        return clamped;
      });
    }
    // update hover tile for ghost preview (building placement OR entity carry)
    if (pendingBuildType || carryingEntity) {
      const hit = toTilePosition(event.clientX, event.clientY);
      setHoverTile(hit ? { x: hit.x, y: hit.y } : null);
    }
  };

  const handlePointerUp = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const elapsed = performance.now() - pointer.startTime;
    if (!pointer.dragging) {
      const hit = toTilePosition(event.clientX, event.clientY);
      if (hit) {
        // If carrying an entity, try to place it
        if (carryingEntity && !readonly) {
          if (isEntityPlacementValid(world?.grid, terrainRegions, hit.x, hit.y, carryingEntity)) {
            const relocation = carryingEntity.type === 'animal'
              ? buildRelocatedAnimalState(carryingEntity.entity, hit.x, hit.y, world, terrainRegions, buildings)
              : carryingEntity.type === 'pet'
                ? buildRelocatedPetState(carryingEntity.entity, hit.x, hit.y, world, terrainRegions)
                : carryingEntity.type === 'resident'
                  ? buildRelocatedResidentState(carryingEntity.entity, hit.x, hit.y, world, terrainRegions)
                  : { x: hit.x, y: hit.y };
            relocationsRef.current.set(carryingEntity.key, relocation);
            setCarryingEntity(null);
            setHoverTile(null);
          }
          pointerRef.current = null;
          return;
        }

        // If building context menu is open, dismiss it on any tap
        if (selectedBldgMenu) {
          setSelectedBldgMenu(null);
          pointerRef.current = null;
          return;
        }

        // If entity context menu is open, dismiss it on any tap
        if (selectedEntity) {
          setSelectedEntity(null);
          pointerRef.current = null;
          return;
        }

        const encounterHit = !readonly && !pendingBuildType ? encounterTileMap.get(`${hit.x}:${hit.y}`) : null;
        if (encounterHit) {
          onSelectEncounter?.(encounterHit.encounter);
        } else if (elapsed >= LONG_PRESS_MS) {
          // long-press: show tile info
          onSelectTile?.({ x: hit.x, y: hit.y, tile: hit.tile });
        } else if (!pendingBuildType && !readonly) {
          // Try entity hit detection before building selection
          const rect = canvasRef.current?.getBoundingClientRect();
          const entityHit = findNearestEntity(entityPositionsRef.current, event.clientX, event.clientY, rect);
          if (entityHit) {
            setSelectedEntity({
              ...entityHit,
              menuScreenX: entityHit.screenX,
              menuScreenY: entityHit.screenY,
            });
          } else if (hit.tile?.b != null) {
            const bldg = buildingMap.get(hit.tile.b) || null;
            const bType = bldg?.type || bldg?.building_type || '';
            if (!bldg || NO_INTERIOR_TYPES.has(bType) || bldg.state !== 'built') {
              // Simple buildings / under construction → direct inspect
              onSelectBuilding?.(bldg);
            } else {
              // Buildings with interiors → show context menu
              const bw = (bldg.width || 1) * tileSize;
              const bScreenX = bldg.grid_x * tileSize - camera.x + bw / 2;
              const bScreenY = bldg.grid_y * tileSize - camera.y;
              setSelectedBldgMenu({ building: bldg, menuScreenX: bScreenX, menuScreenY: bScreenY });
            }
          } else {
            onSelectTile?.({ x: hit.x, y: hit.y, tile: hit.tile });
          }
        } else if (hit.tile?.b != null) {
          onSelectBuilding?.(buildingMap.get(hit.tile.b) || null);
        } else if (terraformMode && !readonly) {
          onTerraformTile?.({ x: hit.x, y: hit.y, tile: hit.tile });
        } else if (pendingBuildType && !readonly) {
          onPlaceBuilding?.(hit.x, hit.y);
        } else {
          onSelectTile?.({ x: hit.x, y: hit.y, tile: hit.tile });
        }
      }
    }
    pointerRef.current = null;
  };

  // --- mouse move for ghost preview ---
  const handleMouseMove = (event) => {
    if ((pendingBuildType || carryingEntity) && !pointerRef.current?.dragging) {
      const hit = toTilePosition(event.clientX, event.clientY);
      setHoverTile(hit ? { x: hit.x, y: hit.y } : null);
    }
  };

  // Cancel carry / dismiss menu on Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setCarryingEntity(null); setSelectedEntity(null); setSelectedBldgMenu(null); setHoverTile(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Carry and building placement are mutually exclusive
  useEffect(() => {
    if (pendingBuildType) { setCarryingEntity(null); setSelectedEntity(null); setSelectedBldgMenu(null); }
  }, [pendingBuildType]);

  if (!world?.grid) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#07121a]">
      <div
        ref={containerRef}
        className="relative h-full min-h-0 w-full select-none touch-none"
        style={{ WebkitTouchCallout: 'none', overscrollBehavior: 'none' }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ willChange: 'transform', imageRendering: 'pixelated' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseMove={handleMouseMove}
        />
        {readonly && readonlyLabel && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/6 bg-black/25 px-2 py-1 text-[8px] uppercase tracking-[0.2em] text-white/30 backdrop-blur-sm">
            {readonlyLabel}
          </div>
        )}
        {/* Entity context panel */}
        {selectedEntity && !carryingEntity && !pendingBuildType && (
          <div
            className="cf-panel-dark absolute left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 px-3 py-2"
            style={{
              bottom: minimapVisible ? 92 : 8,
              width: Math.min(size.width - 16, 520),
              pointerEvents: 'auto',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold" style={{ color: '#3a2010' }}>
                  {entityDisplayName(selectedEntity)}
                </div>
                {selectedEntity.type === 'resident' && (
                  <div className="truncate text-[9px] uppercase tracking-[0.12em]" style={{ color: '#6a4a2a' }}>
                    {(selectedEntity.entity?.workBuildingType || 'villager').replace(/_/g, ' ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="cf-btn"
                style={{ padding: '3px 9px', fontSize: 10, whiteSpace: 'nowrap', background: 'linear-gradient(180deg, rgba(139,94,43,0.15) 0%, rgba(139,94,43,0.08) 100%)', borderColor: 'rgba(139,94,43,0.35)', color: '#6a4a2a' }}
                onClick={(e) => { e.stopPropagation(); setSelectedEntity(null); }}
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedEntity.type === 'resident' && residentCanFish(selectedEntity.entity) && (
                <button
                  type="button"
                  className="cf-btn"
                  style={{ padding: '4px 10px', fontSize: 10, whiteSpace: 'nowrap', background: 'linear-gradient(180deg, #73b7df 0%, #4d8fbb 100%)', borderColor: '#2e658a', color: '#0d2f4a' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResidentTaskCommand(selectedEntity, 'fish');
                  }}
                >
                  Go Fishing
                </button>
              )}
              {selectedEntity.type === 'resident' && residentCanChopWood(selectedEntity.entity) && (
                <button
                  type="button"
                  className="cf-btn"
                  style={{ padding: '4px 10px', fontSize: 10, whiteSpace: 'nowrap', background: 'linear-gradient(180deg, #c49a63 0%, #9e7540 100%)', borderColor: '#6f4e24', color: '#36210b' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResidentTaskCommand(selectedEntity, 'chop');
                  }}
                >
                  Chop Wood
                </button>
              )}
              <button
                type="button"
                className="cf-btn"
                style={{ padding: '4px 10px', fontSize: 10, whiteSpace: 'nowrap', background: 'linear-gradient(180deg, #7abe5a 0%, #5a9e3a 100%)', borderColor: '#3a6e1a', color: '#1a3a08' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setCarryingEntity({ type: selectedEntity.type, key: selectedEntity.key, entity: selectedEntity.entity });
                  setSelectedEntity(null);
                }}
              >
                Pick Up
              </button>
            </div>
          </div>
        )}
        {/* Building context menu (Cute Fantasy styled) */}
        {selectedBldgMenu && !carryingEntity && !pendingBuildType && (
          <div
            className="cf-panel absolute z-50"
            style={{
              left: Math.max(70, Math.min(selectedBldgMenu.menuScreenX, size.width - 70)),
              top: Math.max(8, selectedBldgMenu.menuScreenY - tileSize * 1.8),
              transform: 'translate(-50%, -100%)',
              minWidth: 110,
              padding: '6px 10px',
              pointerEvents: 'auto',
            }}
          >
            <div className="mb-1 text-center text-[11px] font-bold" style={{ color: '#3a2010' }}>
              {selectedBldgMenu.building?.name || 'Building'}
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="cf-btn"
                style={{ padding: '4px 10px', fontSize: 10, background: 'linear-gradient(180deg, #7abe5a 0%, #5a9e3a 100%)', borderColor: '#3a6e1a', color: '#1a3a08' }}
                onClick={(e) => {
                  e.stopPropagation();
                  const bldg = selectedBldgMenu.building;
                  setSelectedBldgMenu(null);
                  onSelectBuilding?.(bldg);
                }}
              >
                Inspect
              </button>
              <button
                type="button"
                className="cf-btn"
                style={{ padding: '4px 10px', fontSize: 10, background: 'linear-gradient(180deg, #5ab8d8 0%, #3a90b8 100%)', borderColor: '#2a6a8a', color: '#0a2838' }}
                onClick={(e) => {
                  e.stopPropagation();
                  const bldg = selectedBldgMenu.building;
                  setSelectedBldgMenu(null);
                  onEnterBuilding?.(bldg);
                }}
              >
                Enter
              </button>
              <button
                type="button"
                className="cf-btn"
                style={{ padding: '3px 10px', fontSize: 10, background: 'linear-gradient(180deg, rgba(139,94,43,0.15) 0%, rgba(139,94,43,0.08) 100%)', borderColor: 'rgba(139,94,43,0.35)', color: '#6a4a2a' }}
                onClick={(e) => { e.stopPropagation(); setSelectedBldgMenu(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {/* Carry mode status bar */}
        {carryingEntity && (
          <div
            className="cf-panel-dark absolute bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 px-4 py-2"
            style={{ pointerEvents: 'auto' }}
          >
            <span className="text-[11px] font-bold" style={{ color: '#3a2010' }}>
              Tap to place {entityDisplayName(carryingEntity)}
            </span>
            <button
              type="button"
              className="cf-btn"
              style={{ padding: '3px 10px', fontSize: 10, background: 'linear-gradient(180deg, rgba(139,94,43,0.15) 0%, rgba(139,94,43,0.08) 100%)', borderColor: 'rgba(139,94,43,0.35)', color: '#6a4a2a' }}
              onClick={() => { setCarryingEntity(null); setHoverTile(null); }}
            >
              Cancel
            </button>
          </div>
        )}
        {/* Minimap toggle button */}
        {!pendingBuildType && !carryingEntity && (
          <button
            type="button"
            onClick={() => setMinimapVisible((v) => !v)}
            className={`absolute left-2 rounded-full border border-white/8 bg-black/30 p-1.5 text-[10px] text-white/50 backdrop-blur-sm transition-colors hover:bg-black/45 hover:text-white/70 ${
              minimapVisible ? 'bottom-[92px]' : 'bottom-2'
            }`}
            aria-label={minimapVisible ? 'Hide minimap' : 'Show minimap'}
          >
            {minimapVisible ? '\u25A3' : '\u25A2'}
          </button>
        )}
      </div>
    </div>
  );
}

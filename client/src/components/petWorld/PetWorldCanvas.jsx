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
const PET_ROSTER = ['dojocat', 'buu', 'devit', 'pixiu', 'tanuki', 'kitsune', 'usagi', 'kappa'];
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function findClearTiles(grid) {
  const result = [];
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      const tile = grid.tiles[y]?.[x];
      if (!tile) continue;
      if (tile.b == null && !['water', 'rock', 'tree', 'bush'].includes(tile.t)) {
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

function pointFromTile(tile, seed, radiusX = 0.2, radiusY = 0.16) {
  if (!tile) return null;
  const offsetX = (hash01(seed, 1) - 0.5) * radiusX * 2;
  const offsetY = (hash01(seed, 2) - 0.5) * radiusY * 2;
  return {
    x: tile.x + 0.5 + offsetX,
    y: tile.y + 0.5 + offsetY,
    tileX: tile.x,
    tileY: tile.y,
    role: tile.role || 'path',
    buildingType: tile.buildingType || null,
    anchorKind: tile.anchorKind || null,
    buildingId: tile.buildingId || null,
  };
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

function expandResidentRoute(points, seed) {
  const filtered = points.filter(Boolean);
  if (!filtered.length) return [];
  const nodes = [];
  filtered.forEach((point, index) => {
    const current = {
      ...point,
      pauseMs: point.pauseMs ?? (point.role === 'work' ? 2800 : point.role === 'home' ? 2200 : 1400),
    };
    nodes.push(current);
    const next = filtered[(index + 1) % filtered.length];
    if (!next) return;
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.18 && Math.abs(dy) > 0.18) {
      // L-shaped path via orthogonal waypoint
      const viaHorizontalFirst = ((seed + index) % 2) === 0;
      const midX = viaHorizontalFirst ? next.x : current.x;
      const midY = viaHorizontalFirst ? current.y : next.y;
      nodes.push({
        x: midX,
        y: midY,
        tileX: Math.floor(midX),
        tileY: Math.floor(midY),
        role: 'path',
        pauseMs: 200 + ((seed + index * 7) % 4) * 120, // brief micro-pause at the turn
      });
    }
    // For longer journeys (>2 tiles), add an extra midpoint with a brief pause
    if (dist > 2.2) {
      const t = 0.45 + (hash01(seed + index, 11) - 0.5) * 0.15;
      const midNode = nodes[nodes.length - 1]; // last pushed (could be waypoint or current)
      const midX2 = midNode.x + (next.x - midNode.x) * t;
      const midY2 = midNode.y + (next.y - midNode.y) * t;
      nodes.push({
        x: midX2,
        y: midY2,
        tileX: Math.floor(midX2),
        tileY: Math.floor(midY2),
        role: 'path',
        pauseMs: 300 + ((seed + index * 13) % 5) * 150, // brief hesitation mid-walk
      });
    }
  });

  const speed = 0.55 + hash01(seed, 7) * 0.25; // slower, calmer movement
  return nodes.map((node, index) => {
    const next = nodes[(index + 1) % nodes.length];
    const dx = next.x - node.x;
    const dy = next.y - node.y;
    const distance = Math.hypot(dx, dy);
    return {
      ...node,
      moveMs: Math.max(360, (distance / speed) * 1000),
      distance,
      facing: Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.02
        ? (dx >= 0 ? 1 : -1)
        : Math.abs(dy) > 0.02
          ? (dy >= 0 ? 2 : -2)
          : null,
    };
  });
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function getRouteMotion(entity, time) {
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

  const cycleMs = route.reduce((total, node) => total + node.pauseMs + node.moveMs, 0) || 1;
  let cursor = (time + entity.seed * 173) % cycleMs;
  let lastFacing = route.find((node) => node.facing)?.facing || 1;
  // Very slow idle frame cycle — almost static to prevent any visible jitter
  const idleFrame = (time * 0.00008 + entity.seed * 0.1) % 1;

  for (let index = 0; index < route.length; index += 1) {
    const node = route[index];
    const next = route[(index + 1) % route.length];
    const pauseMs = node.pauseMs || 0;
    if (cursor < pauseMs) {
      // Idle: hold position and facing completely stable — no loiter, no drift, no facing changes
      const stableFacing = node.facing || lastFacing || 1;
      return {
        x: node.x,
        y: node.y,
        frameOffset: idleFrame,
        facing: stableFacing,
        moving: false,
        paused: true,
        role: node.role || 'path',
        buildingType: node.buildingType || null,
        anchorKind: node.anchorKind || null,
        buildingId: node.buildingId || null,
      };
    }
    cursor -= pauseMs;

    const moveMs = node.moveMs || 0;
    if (cursor < moveMs) {
      const progress = moveMs > 0 ? cursor / moveMs : 1;
      const eased = smoothStep(progress);
      const dx = next.x - node.x;
      const dy = next.y - node.y;
      // 4-direction facing: derive from actual movement vector
      let facing;
      if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.02) {
        facing = dx >= 0 ? 1 : -1;
      } else if (Math.abs(dy) > 0.02) {
        facing = dy >= 0 ? 2 : -2;  // 2 = down, -2 = up
      } else {
        facing = node.facing || lastFacing || 1;
      }
      return {
        x: node.x + dx * eased,
        y: node.y + dy * eased,
        // Walk frame: use smooth continuous time so animation never jumps/pops
        frameOffset: node.distance > 0.02
          ? (time * 0.004 + entity.seed * 0.1) % 1
          : idleFrame,
        facing,
        moving: node.distance > 0.02,
        paused: false,
        role: node.role || 'path',
        buildingType: node.buildingType || next.buildingType || null,
        anchorKind: node.anchorKind || next.anchorKind || null,
        buildingId: node.buildingId || next.buildingId || null,
      };
    }
    cursor -= moveMs;
    if (node.facing) lastFacing = node.facing;
  }

  const fallback = route[route.length - 1];
  return {
    x: fallback.x,
    y: fallback.y,
    frameOffset: 0,
    facing: fallback.facing || 1,
    moving: false,
    paused: true,
    role: fallback.role || 'path',
    buildingType: fallback.buildingType || null,
    anchorKind: fallback.anchorKind || null,
    buildingId: fallback.buildingId || null,
  };
}

function getResidentDisplayActivity(resident, motion) {
  if (!motion) return resident.activity || 'stroll';
  const buildingType = motion.buildingType || resident.workBuildingType || null;
  if (!motion.moving || motion.paused) {
    if (buildingType && ['farm', 'fishing_hut', 'woodcutters_hut', 'lumberyard', 'quarry', 'stone_pit'].includes(buildingType)) {
      return 'gather';
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
    if (motion.anchorKind === 'quiet') return 'stroll';
    return resident.activity || 'stroll';
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
      pose.offsetX += (motion.facing || 1) * 0.03;
      pose.tool = 'rod';
      break;
    case 'woodcutters_hut':
    case 'lumberyard':
      pose.tool = 'axe';
      pose.offsetX += swing * 0.02;
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
    ctx.beginPath();
    ctx.moveTo(baseX + tileSize * 0.04, baseY - tileSize * 0.08);
    ctx.lineTo(baseX + tileSize * 0.14, baseY - tileSize * 0.23);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(baseX + tileSize * 0.14, baseY - tileSize * 0.23);
    ctx.lineTo(baseX + tileSize * 0.2, baseY - tileSize * 0.16 + Math.sin(time * 0.01) * tileSize * 0.01);
    ctx.stroke();
  } else if (pose.tool === 'axe' || pose.tool === 'pick' || pose.tool === 'hoe') {
    const lean = Math.sin(time * 0.018) * tileSize * 0.02;
    ctx.beginPath();
    ctx.moveTo(baseX - tileSize * 0.02, baseY - tileSize * 0.1);
    ctx.lineTo(baseX + tileSize * 0.08, baseY - tileSize * 0.24 + lean);
    ctx.stroke();
    ctx.fillStyle = pose.tool === 'hoe' ? '#b9914b' : '#bfc6cf';
    ctx.fillRect(Math.round(baseX + tileSize * 0.06), Math.round(baseY - tileSize * 0.26 + lean), Math.max(1, Math.round(tileSize * 0.06)), Math.max(1, Math.round(tileSize * 0.03)));
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
  if (!grid || tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return false;
  const tile = grid.tiles[ty]?.[tx];
  if (!tile) return false;
  if (tile.t === 'water' || tile.t === 'tree' || tile.t === 'rock') return false;
  if (tile.b != null) return false;
  return true;
}

/**
 * Simple, stable animal wander. Uses smooth sine-based drift from home position.
 * No complex phase transitions = no position jumps or blinking.
 */
function getAnimalWanderPos(entity, time, grid) {
  const seed = entity.seed || 0;
  const period = entity.period || 8000;

  // Slow sinusoidal drift around home position — completely smooth, no phase boundaries
  const tx = Math.sin(time * 0.0004 + seed * 2.1) * 0.18;
  const ty = Math.cos(time * 0.00035 + seed * 1.7) * 0.15;

  // Determine if the offset tile is walkable; clamp to home if not
  let dx = tx;
  let dy = ty;
  if (grid) {
    const homeX = Math.floor(entity.x);
    const homeY = Math.floor(entity.y);
    const targetTileX = homeX + Math.round(dx);
    const targetTileY = homeY + Math.round(dy);
    if (!isTileWalkable(grid, targetTileX, targetTileY)) {
      dx = 0;
      dy = 0;
    }
  }

  // Very slow movement detection — only flag as moving if drift is significant
  const speed = Math.abs(Math.cos(time * 0.0004 + seed * 2.1) * 0.0004)
              + Math.abs(Math.sin(time * 0.00035 + seed * 1.7) * 0.00035);
  const moving = speed > 0.0002;

  // Stable facing based on current drift direction
  const facing = Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? 1 : -1)
    : (dy >= 0 ? 2 : -2);

  // Very slow idle frame — almost static
  const frameOffset = moving
    ? (time * 0.003 + seed * 0.1) % 1
    : (time * 0.00008 + seed * 0.1) % 1;

  const x = entity.x + dx;
  const y = entity.y + dy;

  if (Number.isNaN(x) || Number.isNaN(y)) {
    return { x: entity.x, y: entity.y, frameOffset: 0, facing: 1, moving: false };
  }
  return { x, y, frameOffset, facing, moving };
}

function buildPetPlacements(world) {
  const grid = world?.grid;
  if (!grid) return [];
  const clearTiles = findClearTiles(grid);
  const population = Math.max(0, world.population || 0);
  const count = Math.min(Math.max(2, population), 12, clearTiles.length);
  const placements = [];
  for (let i = 0; i < count; i += 1) {
    const tile = clearTiles[(i * 11 + Math.floor(i / 2) * 3) % clearTiles.length];
    placements.push({ ...tile, character: PET_ROSTER[i % PET_ROSTER.length], seed: i * 13 + 7 });
  }
  return placements;
}

function buildResidentPlacements(world, terrainRegions, buildings = []) {
  const grid = world?.grid;
  if (!grid) return [];
  const clearTiles = findClearTiles(grid);
  const clearTileMap = new Map(clearTiles.map((tile) => [tileKey(tile.x, tile.y), tile]));
  const livedInTiles = clearTiles.filter(({ x, y }) => {
    const terrain = terrainRegions?.[y]?.[x];
    return (terrain?.laneStrength || 0) > 0.08 || (terrain?.villageWear || 0) > 0.08 || (terrain?.meadowStrength || 0) > 0.24;
  });
  const pool = livedInTiles.length >= 6 ? livedInTiles : clearTiles;
  const laneTiles = clearTiles
    .filter((tile) => getTileScore(tile, terrainRegions) > 0.42)
    .sort((a, b) => getTileScore(b, terrainRegions) - getTileScore(a, terrainRegions));
  const shoreTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.shoreStrength || 0) > 0.22);
  const meadowTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.meadowStrength || 0) > 0.2);

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

  const count = Math.min(Math.max(4, (world.population || 0) + 2), 18, pool.length);
  const assignedWorkers = Math.max(0, world.assigned_workers || 0);
  const placements = [];
  for (let i = 0; i < count; i += 1) {
    const tile = pickFromPool(pool, i * 13 + Math.floor(i / 3) * 5, pool[0]);
    const working = i < assignedWorkers;
    const seed = i * 29 + 11;
    const homeTile = pickFromPool(homeAnchors, i * 5 + 1, tile);
    const laneTile = pickFromPool(laneTiles, i * 7 + 2, tile);
    const preferredSocial = (seed % 3) !== 0;
    const socialGroup = Math.floor(i / 3);
    const socialSeedBase = socialGroup * 19;
    const leisureTile = preferredSocial
      ? pickFromPool(weightedSocialAnchors, socialSeedBase + 3, pickFromPool(commonAnchors, i * 7 + 1, pickFromPool(meadowTiles, i * 11 + 5, tile)))
      : pickFromPool(weightedQuietAnchors, socialSeedBase + 5, pickFromPool(commonAnchors, i * 7 + 1, pickFromPool(meadowTiles, i * 11 + 5, tile)));
    const natureTile = pickFromPool(shoreTiles, i * 13 + 7, pickFromPool(meadowTiles, i * 17 + 4, tile));
    const workTile = working
      ? pickFromPool(weightedWorkAnchors, i * 3 + assignedWorkers, pickFromPool(commonAnchors, i * 6 + 1, tile))
      : leisureTile;
    const plazaTile = pickFromPool(weightedSocialAnchors, socialSeedBase + 2, laneTile);
    const residentArchetype = working
      ? (
        workTile?.buildingType && ['market', 'trading_post', 'storehouse', 'warehouse', 'bakery'].includes(workTile.buildingType) ? 'merchant'
          : workTile?.buildingType && ['watchtower', 'shrine', 'town_hall', 'weaving_hut'].includes(workTile.buildingType) ? 'craft'
            : 'gatherer'
      )
      : (preferredSocial ? 'social' : 'quiet');

    const routePoints = working
      ? [
          { ...pointFromTile(homeTile, seed + 1, 0.16, 0.12), role: 'home', pauseMs: 1200 + hash01(seed, 3) * 900 },
          { ...pointFromTile(laneTile, seed + 2, 0.1, 0.08), role: 'path', pauseMs: 200 + hash01(seed, 4) * 160 },
          { ...pointFromTile(workTile, seed + 3, 0.12, 0.1), role: 'work', pauseMs: 1600 + hash01(seed, 5) * 1200 },
          { ...pointFromTile(plazaTile, seed + 4, 0.14, 0.11), role: 'common', pauseMs: 520 + hash01(seed, 6) * 420 },
          { ...pointFromTile(leisureTile, seed + 5, 0.14, 0.11), role: 'common', pauseMs: 820 + hash01(seed, 7) * 700 },
        ]
      : [
          { ...pointFromTile(homeTile, seed + 1, 0.16, 0.12), role: 'home', pauseMs: 1400 + hash01(seed, 3) * 1000 },
          { ...pointFromTile(plazaTile, seed + 2, 0.13, 0.1), role: 'common', pauseMs: 920 + hash01(seed, 4) * 820 },
          { ...pointFromTile(leisureTile, seed + 3, 0.14, 0.11), role: 'common', pauseMs: 1100 + hash01(seed, 5) * 800 },
          { ...pointFromTile(natureTile, seed + 4, 0.18, 0.12), role: 'common', pauseMs: 700 + hash01(seed, 6) * 600 },
          { ...pointFromTile(laneTile, seed + 5, 0.1, 0.08), role: 'path', pauseMs: 240 + hash01(seed, 7) * 180 },
        ];

    placements.push({
      ...homeTile,
      palette: RESIDENT_STYLES[i % RESIDENT_STYLES.length],
      activity: working ? ['gather', 'carry', 'build'][i % 3] : ['stroll', 'play', 'stroll'][i % 3],
      archetype: residentArchetype,
      workBuildingType: workTile?.buildingType || null,
      seed,
      route: expandResidentRoute(routePoints, seed),
      x: tile.x,
      y: tile.y,
    });
  }
  return assignResidentGroups(placements);
}

function buildAmbientFauna(world, terrainRegions) {
  const grid = world?.grid;
  if (!grid) return [];
  const clearTiles = findClearTiles(grid);
  const waterTiles = findTilesByType(grid, 'water');
  const meadowTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.meadowStrength || 0) > 0.28);
  const woodedTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.foliageShadow || 0) > 0.18);
  const shoreTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.shoreStrength || 0) > 0.24);

  const placements = [];
  const fishCount = Math.min(7, Math.max(2, Math.floor(waterTiles.length / 18)));
  for (let i = 0; i < fishCount && waterTiles.length; i += 1) {
    const tile = waterTiles[(i * 7 + 3) % waterTiles.length];
    placements.push({
      ...tile,
      species: i % 3 === 0 ? 'duck' : (i % 2 === 0 ? 'fish_koi' : 'fish_perch'),
      seed: 101 + i * 19,
      rangeX: i % 3 === 0 ? 0.2 : 0.35,
      rangeY: i % 3 === 0 ? 0.12 : 0.2,
      period: 2800 + i * 210,
      layer: 'water',
      yBias: i % 3 === 0 ? 0.58 : 0.62,
      scale: i % 3 === 0 ? 0.72 : 0.62,
    });
  }

  const mammalPool = meadowTiles.length ? meadowTiles : clearTiles;
  const mammalCount = Math.min(6, Math.max(2, Math.ceil((world.expansions || 0) + (world.population || 0) / 5)));
  for (let i = 0; i < mammalCount && mammalPool.length; i += 1) {
    const tile = mammalPool[(i * 11 + 5) % mammalPool.length];
    placements.push({
      ...tile,
      species: ['rabbit', 'deer', 'boar', 'fox'][i % 4],
      seed: 203 + i * 23,
      range: i % 2 === 0 ? 0.34 : 0.46,
      period: 3200 + i * 250,
      layer: 'ground',
      yBias: 0.82,
      scale: ['rabbit', 'fox'].includes(['rabbit', 'deer', 'boar', 'fox'][i % 4]) ? 0.56 : 0.68,
    });
  }

  const birdPool = shoreTiles.length ? shoreTiles : (woodedTiles.length ? woodedTiles : clearTiles);
  const birdCount = Math.min(5, Math.max(2, Math.ceil(((world.population || 0) + 2) / 4)));
  for (let i = 0; i < birdCount && birdPool.length; i += 1) {
    const tile = birdPool[(i * 9 + 1) % birdPool.length];
    placements.push({
      ...tile,
      species: i % 4 === 0 ? 'rare_bird' : 'songbird',
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

function buildEncounterSightings(world, terrainRegions, encounters = []) {
  const grid = world?.grid;
  if (!grid || !encounters.length) return [];
  const clearTiles = findClearTiles(grid);
  if (!clearTiles.length) return [];
  const meadowTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.meadowStrength || 0) > 0.28);
  const woodedTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.foliageShadow || 0) > 0.2);
  const shoreTiles = clearTiles.filter(({ x, y }) => (terrainRegions?.[y]?.[x]?.shoreStrength || 0) > 0.22);

  return encounters.map((encounter, index) => {
    const type = encounter.encounter_type;
    const pool =
      type === 'rare_bird' ? (shoreTiles.length ? shoreTiles : meadowTiles) :
      type === 'bear_sighting' ? (woodedTiles.length ? woodedTiles : clearTiles) :
      type === 'wolf_pack' ? (woodedTiles.length ? woodedTiles : meadowTiles) :
      (meadowTiles.length ? meadowTiles : clearTiles);
    const tile = pool[(index * 17 + 7) % pool.length];
    return {
      ...tile,
      encounter,
      species: ENCOUNTER_SPECIES[type] || 'fox',
      seed: 409 + index * 37,
      range: type === 'bear_sighting' ? 0.28 : 0.4,
      period: 3000 + index * 180,
      layer: type === 'rare_bird' ? 'air' : 'ground',
      yBias: type === 'rare_bird' ? 0.46 : 0.8,
      scale: type === 'bear_sighting' ? 0.86 : type === 'wolf_pack' ? 0.76 : 0.72,
      tileKey: `${tile.x}:${tile.y}`,
    };
  });
}

/** Deterministic pet position with multi-state wander. Grid-aware. */
function getPetWanderPos(pet, time, grid) {
  const period = 4200; // slower, more pet-like
  const step = Math.floor(time / period);
  const currentHash = (pet.seed * 2654435761 + step * 2246822519) >>> 0;
  const nextHash = (pet.seed * 2654435761 + (step + 1) * 2246822519) >>> 0;
  const from = {
    x: (currentHash % 3) - 1,
    y: ((currentHash >> 4) % 3) - 1,
  };
  const to = {
    x: (nextHash % 3) - 1,
    y: ((nextHash >> 4) % 3) - 1,
  };

  // Validate against grid walkability
  if (grid) {
    const homeX = Math.floor(pet.x);
    const homeY = Math.floor(pet.y);
    if (!isTileWalkable(grid, homeX + from.x, homeY + from.y)) { from.x = 0; from.y = 0; }
    if (!isTileWalkable(grid, homeX + to.x, homeY + to.y)) { to.x = 0; to.y = 0; }
  }

  const phase = (time % period) / period;
  const idleFrame = (time * 0.0003 + pet.seed * 0.1) % 1;
  const midHash = (currentHash ^ (nextHash >>> 8)) >>> 0;
  const scale = 0.44;

  // Multi-phase: idle → walk → pause → settle → idle
  if (phase < 0.2) {
    return { x: pet.x + from.x * scale, y: pet.y + from.y * 0.34, frameOffset: idleFrame, moving: false };
  }
  if (phase < 0.55) {
    const t = smoothStep((phase - 0.2) / 0.35);
    const fx = from.x + (to.x - from.x) * t;
    const fy = from.y + (to.y - from.y) * t;
    const dist = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    const isMoving = dist > 0;
    return {
      x: pet.x + fx * scale,
      y: pet.y + fy * 0.34,
      frameOffset: isMoving ? (t * 2.2 + pet.seed * 0.07) % 1 : idleFrame,
      moving: isMoving,
    };
  }
  if (phase < 0.68) {
    // Brief pause — pet "sniffs" or looks around
    return { x: pet.x + to.x * scale, y: pet.y + to.y * 0.34, frameOffset: idleFrame, moving: false };
  }
  if (phase < 0.82) {
    // Settle: tiny drift
    const drift = Math.sin((phase - 0.68) / 0.14 * Math.PI) * 0.025;
    return {
      x: pet.x + to.x * scale + drift * ((midHash % 2) === 0 ? 1 : -1),
      y: pet.y + to.y * 0.34 + drift * ((midHash >> 2) % 2 === 0 ? 1 : -1),
      frameOffset: idleFrame,
      moving: false,
    };
  }
  return { x: pet.x + to.x * scale, y: pet.y + to.y * 0.34, frameOffset: idleFrame, moving: false };
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
      if (['water', 'rock', 'tree', 'bush'].includes(tile.t)) return false;
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
  readonly = false,
  readonlyLabel = 'Visiting',
  placementBurst = null,
  onSelectBuilding,
  onSelectEncounter,
  onSelectTile,
  onPlaceBuilding,
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
  const buildingMap = useMemo(() => getBuildingMap(buildings), [buildings]);
  const terrainRegions = useMemo(() => analyzeTerrainGrid(world?.grid, buildings), [world?.grid, buildings]);
  const residentPlacements = useMemo(() => buildResidentPlacements(world, terrainRegions, buildings), [world, terrainRegions, buildings]);
  const petPlacements = useMemo(() => buildPetPlacements(world), [world]);
  const ambientFauna = useMemo(() => buildAmbientFauna(world, terrainRegions), [world, terrainRegions]);
  const encounterSightings = useMemo(() => buildEncounterSightings(world, terrainRegions, encounters), [world, terrainRegions, encounters]);
  const encounterTileMap = useMemo(
    () => new Map(encounterSightings.map((sighting) => [sighting.tileKey, sighting])),
    [encounterSightings],
  );
  const reduceMotion = useMemo(
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false),
    [],
  );

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
        } else if (tile.t === 'tree' || tile.t === 'bush') {
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

    ambientFauna
      .filter((creature) => creature.layer === 'water')
      .forEach((creature) => {
        const wander = getAnimalWanderPos(creature, time, null); // water creatures skip land checks
        const screenX = wander.x * tileSize - camX + tileSize / 2;
        const screenY = wander.y * tileSize - camY + tileSize * creature.yBias;
        if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
        drawAmbientCritter(ctx, screenX, screenY, tileSize, creature.species, wander.frameOffset, {
          scale: creature.scale,
          facing: wander.facing,
          moving: wander.moving,
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

    const residentStates = residentPlacements.map((resident) => {
      const motion = getRouteMotion(resident, time);
      const pose = getResidentInteractionPose(resident, motion, time);
      return {
        resident,
        motion,
        pose,
        screenX: (motion.x + pose.offsetX) * tileSize - camX + tileSize / 2,
        screenY: (motion.y + pose.offsetY) * tileSize - camY + tileSize * 0.82,
      };
    });
    const occupancyCounts = countBuildingOccupants(buildings, residentStates);

    // buildings
    buildings.forEach((building) => {
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
        const wander = getAnimalWanderPos(creature, time, world.grid);
        const screenX = wander.x * tileSize - camX + tileSize / 2;
        const screenY = wander.y * tileSize - camY + tileSize * creature.yBias;
        if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
        drawAmbientCritter(ctx, screenX, screenY, tileSize, creature.species, wander.frameOffset, {
          scale: creature.scale,
          facing: wander.facing,
          moving: wander.moving,
        });
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
      );
      drawResidentInteractionOverlay(ctx, screenX, screenY, tileSize, motion, pose, time);
    });

    // pet wandering
    petPlacements.forEach((pet) => {
      const wander = getPetWanderPos(pet, time, world.grid);
      const screenX = wander.x * tileSize - camX + tileSize / 2;
      const screenY = wander.y * tileSize - camY + tileSize * 0.80;
      if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
      drawPetWander(ctx, screenX, screenY, tileSize, pet.character, wander.frameOffset, wander.moving);
    });

    encounterSightings.forEach((sighting) => {
      const wander = getAnimalWanderPos(sighting, time, world.grid);
      const screenX = wander.x * tileSize - camX + tileSize / 2;
      const screenY = wander.y * tileSize - camY + tileSize * sighting.yBias;
      if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
      drawAmbientCritter(ctx, screenX, screenY, tileSize, sighting.species, wander.frameOffset, {
        scale: sighting.scale,
        facing: wander.facing,
        moving: wander.moving,
        highlight: true,
      });
    });

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
    // update hover tile for ghost preview
    if (pendingBuildType) {
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
        const encounterHit = !readonly && !pendingBuildType ? encounterTileMap.get(`${hit.x}:${hit.y}`) : null;
        if (encounterHit) {
          onSelectEncounter?.(encounterHit.encounter);
        } else if (elapsed >= LONG_PRESS_MS) {
          // long-press: show tile info
          onSelectTile?.({ x: hit.x, y: hit.y, tile: hit.tile });
        } else if (hit.tile?.b != null) {
          onSelectBuilding?.(buildingMap.get(hit.tile.b) || null);
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
    if (pendingBuildType && !pointerRef.current?.dragging) {
      const hit = toTilePosition(event.clientX, event.clientY);
      setHoverTile(hit ? { x: hit.x, y: hit.y } : null);
    }
  };

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
        {/* Minimap toggle button */}
        {!pendingBuildType && (
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

import { BUILDING_SIZES, getBuildingUi } from './petWorldBuildings.js';
import { getBiomeUi, getTilePalette } from './petWorldTiles.js';
import {
  drawAmbientCritterAtlas,
  drawPetAtlas,
  drawTerrainAtlasSprite,
  drawVillageResidentAtlas,
} from './petWorldAtlas.js';
import {
  drawKenneyBuilding,
  drawKenneyCritter,
  drawKenneyResident,
  drawKenneyTerrain,
} from './petWorldKenneySprites.js';
import {
  drawCuteFantasyGround,
  drawCuteFantasyTerrain,
  drawCuteFantasyBuilding,
  drawCuteFantasyResident,
  drawCuteFantasyCritter,
  drawCuteFantasyPet,
} from './petWorldCuteFantasySprites.js';

// --- low-level drawing helpers ---

function px(ctx, x, y, w, h, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
}

function outline(ctx, x, y, w, h, color = 'rgba(0,0,0,0.55)', lineWidth = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

function tri(ctx, x1, y1, x2, y2, x3, y3, fill) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function circ(ctx, cx, cy, r, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 0xff) + (((pb >> 16) & 0xff) - ((pa >> 16) & 0xff)) * t;
  const g = ((pa >> 8) & 0xff) + (((pb >> 8) & 0xff) - ((pa >> 8) & 0xff)) * t;
  const bl = (pa & 0xff) + ((pb & 0xff) - (pa & 0xff)) * t;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(bl)})`;
}

function tileHash(x, y) {
  return ((x * 2654435761) ^ (y * 2246822519)) >>> 0;
}

const TERRAIN_SAMPLE_WEIGHTS = [
  [0.08, 0.14, 0.18, 0.14, 0.08],
  [0.14, 0.32, 0.46, 0.32, 0.14],
  [0.18, 0.46, 1.0, 0.46, 0.18],
  [0.14, 0.32, 0.46, 0.32, 0.14],
  [0.08, 0.14, 0.18, 0.14, 0.08],
];

const TERRAIN_TOTAL_WEIGHT = TERRAIN_SAMPLE_WEIGHTS
  .flat()
  .reduce((sum, value) => sum + value, 0);

const RENDER_CONNECTOR_BUILDING_TYPES = new Set([
  'house',
  'large_house',
  'market',
  'tavern',
  'fishing_hut',
  'woodcutters_hut',
  'lumberyard',
  'quarry',
  'weaving_hut',
  'storehouse',
  'trading_post',
  'town_hall',
  'bakery',
  'shrine',
  'warehouse',
  'watchtower',
]);

const RENDER_CONNECTOR_EDGE_PENALTIES = {
  south: 0,
  east: 0.35,
  west: 0.35,
  north: 0.75,
};

const MAX_RENDER_CONNECTOR_DISTANCE = 0;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hash01(x, y, scale = 1) {
  return tileHash(Math.floor(x / scale), Math.floor(y / scale)) / 0xffffffff;
}

function tint(base, target, amount) {
  return lerpColor(base, target, clamp01(amount));
}

function fillEllipse(ctx, cx, cy, rx, ry, fill, alpha = 1, rotation = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function paintEdgeGlow(ctx, x, y, size, edge, color, alpha, depth = 0.2) {
  const span = size * depth;
  let gradient = null;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (edge === 'n') {
    gradient = ctx.createLinearGradient(x, y, x, y + span);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, size, span);
  } else if (edge === 's') {
    gradient = ctx.createLinearGradient(x, y + size, x, y + size - span);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y + size - span, size, span);
  } else if (edge === 'w') {
    gradient = ctx.createLinearGradient(x, y, x + span, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, span, size);
  } else if (edge === 'e') {
    gradient = ctx.createLinearGradient(x + size, y, x + size - span, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(x + size - span, y, span, size);
  }
  ctx.restore();
}

function tryTraceConnectorRoute(start, target, occupancy, axisOrder) {
  const route = [];
  let x = start.x;
  let y = start.y;
  const axes = axisOrder === 'horizontal-first' ? ['x', 'y'] : ['y', 'x'];

  for (const axis of axes) {
    const goal = axis === 'x' ? target.x : target.y;
    while ((axis === 'x' ? x : y) !== goal) {
      if (axis === 'x') x += Math.sign(goal - x);
      else y += Math.sign(goal - y);
      const sample = occupancy[y]?.[x];
      if (!sample) return null;
      const isTarget = x === target.x && y === target.y;
      if (isTarget) {
        if (!sample.isPath) return null;
      } else if (!sample.openGround) {
        return null;
      }
      route.push({ x, y });
    }
  }

  return route;
}

function buildBuildingConnectorCandidates(building, occupancy) {
  if (!building) return [];

  const height = occupancy.length;
  const width = occupancy[0]?.length || 0;
  const centerX = building.grid_x + building.width / 2;
  const centerY = building.grid_y + building.height / 2;
  const seen = new Set();
  const candidates = [];

  const pushCandidate = (x, y, edge) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const sample = occupancy[y]?.[x];
    if (!sample || (!sample.openGround && !sample.isPath)) return;
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    const tileCenterX = x + 0.5;
    const tileCenterY = y + 0.5;
    candidates.push({
      x,
      y,
      edge,
      edgePenalty: RENDER_CONNECTOR_EDGE_PENALTIES[edge] ?? 0.5,
      centerBias: Math.abs(tileCenterX - centerX) + Math.abs(tileCenterY - centerY) * 0.5,
    });
  };

  for (let x = building.grid_x; x < building.grid_x + building.width; x += 1) {
    pushCandidate(x, building.grid_y + building.height, 'south');
    pushCandidate(x, building.grid_y - 1, 'north');
  }
  for (let y = building.grid_y; y < building.grid_y + building.height; y += 1) {
    pushCandidate(building.grid_x - 1, y, 'west');
    pushCandidate(building.grid_x + building.width, y, 'east');
  }

  candidates.sort((a, b) => (a.edgePenalty + a.centerBias) - (b.edgePenalty + b.centerBias));
  return candidates;
}

function buildRenderedConnectorGrid(occupancy, buildings = []) {
  const height = occupancy.length;
  const width = occupancy[0]?.length || 0;
  const connectorVariantGrid = Array.from({ length: height }, () => new Array(width).fill(null));
  const connectorScoreGrid = Array.from({ length: height }, () => new Array(width).fill(Infinity));
  const actualPathTiles = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = occupancy[y]?.[x];
      if (!tile?.isPath || !tile.pathVariant) continue;
      actualPathTiles.push({ x, y, variant: tile.pathVariant });
    }
  }

  let connectorTileCount = 0;

  buildings.forEach((building) => {
    if (!building) return;
    if (!RENDER_CONNECTOR_BUILDING_TYPES.has(building.type || building.building_type || '')) return;
    const startCandidates = buildBuildingConnectorCandidates(building, occupancy);
    let best = null;

    startCandidates.forEach((candidate) => {
      const startSample = occupancy[candidate.y]?.[candidate.x];
      if (!startSample || startSample.isPath) return;

      actualPathTiles.forEach((target) => {
        const manhattan = Math.abs(target.x - candidate.x) + Math.abs(target.y - candidate.y);
        if (manhattan < 1 || manhattan > MAX_RENDER_CONNECTOR_DISTANCE) return;

        ['vertical-first', 'horizontal-first'].forEach((axisOrder, orderIndex) => {
          const traced = tryTraceConnectorRoute(candidate, target, occupancy, axisOrder);
          if (!traced?.length) return;

          const connectorTiles = [{ x: candidate.x, y: candidate.y }, ...traced.slice(0, -1)];
          const score = connectorTiles.length
            + candidate.edgePenalty
            + candidate.centerBias * 0.12
            + orderIndex * 0.08
            + Math.abs(target.x - candidate.x) * 0.03;

          if (!best || score < best.score) {
            best = {
              score,
              variant: target.variant,
              tiles: connectorTiles,
            };
          }
        });
      });
    });

    if (!best) return;
    best.tiles.forEach((tile, index) => {
      const nextScore = best.score + index * 0.02;
      if (nextScore >= connectorScoreGrid[tile.y][tile.x]) return;
      if (!connectorVariantGrid[tile.y][tile.x]) connectorTileCount += 1;
      connectorVariantGrid[tile.y][tile.x] = best.variant;
      connectorScoreGrid[tile.y][tile.x] = nextScore;
    });
  });

  return {
    connectorVariantGrid,
    connectorTileCount,
    actualPathCount: actualPathTiles.length,
  };
}

function fillMicroPathHoles(occupancy, baseVariantGrid) {
  const height = occupancy.length;
  const width = occupancy[0]?.length || 0;
  const microFillGrid = baseVariantGrid.map((row) => row.slice());
  let microFillCount = 0;

  const getVariant = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return occupancy[y]?.[x]?.pathVariant || microFillGrid[y]?.[x] || null;
  };

  const evaluateVariant = (x, y, variant) => {
    const n = getVariant(x, y - 1) === variant;
    const s = getVariant(x, y + 1) === variant;
    const e = getVariant(x + 1, y) === variant;
    const w = getVariant(x - 1, y) === variant;
    const cardinals = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
    return cardinals >= 4;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!occupancy[y]?.[x]?.openGround || microFillGrid[y][x]) continue;
      for (const variant of ['dirt', 'stone']) {
        if (!evaluateVariant(x, y, variant)) continue;
        microFillGrid[y][x] = variant;
        microFillCount += 1;
        break;
      }
    }
  }

  return {
    microFillGrid,
    microFillCount,
  };
}

export function analyzeTerrainGrid(grid, buildings = []) {
  if (!grid?.tiles) return null;

  const width = grid.w || grid.tiles[0]?.length || 0;
  const height = grid.h || grid.tiles.length || 0;
  const buildingMap = new Map(buildings.map((building) => [building.id, building]));

  const occupancy = Array.from({ length: height }, (_, y) => (
    Array.from({ length: width }, (_, x) => {
      const tile = grid.tiles[y]?.[x] || null;
      const building = tile?.b != null ? buildingMap.get(tile.b) || null : null;
      const buildingType = building?.type || null;
      const tileType = tile?.t || 'ground';
      const isObstacle = tileType === 'tree' || tileType === 'rock' || tileType === 'bush' || tileType === 'stump';
      const isPath = buildingType === 'path';
      // Variant: 'dirt' for the rough dust path, otherwise 'stone' (default
      // pavement). Existing path tiles have no variant set, so they default
      // to the production walkway texture and keep their look.
      const pathVariant = isPath
        ? (building?.variant === 'dirt' ? 'dirt' : 'stone')
        : null;
      return {
        tileType,
        buildingType,
        isWater: tileType === 'water',
        isFoliage: tileType === 'tree' || tileType === 'bush' || tileType === 'stump',
        isRock: tileType === 'rock',
        isPath,
        pathVariant,
        openGround: tile?.b == null && !isObstacle && tileType !== 'water',
      };
    })
  ));

  const {
    connectorVariantGrid,
    connectorTileCount,
    actualPathCount,
  } = buildRenderedConnectorGrid(occupancy, buildings);
  const {
    microFillGrid,
    microFillCount,
  } = fillMicroPathHoles(occupancy, connectorVariantGrid);

  // Dev-only diagnostic so we can confirm the detection is firing.
  if (typeof window !== 'undefined') {
    let renderPathCount = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (occupancy[y][x]?.isPath || connectorVariantGrid[y][x]) renderPathCount += 1;
        else if (microFillGrid[y][x]) renderPathCount += 1;
      }
    }
    window.__petWorldPathDebug = {
      pathCount: actualPathCount,
      connectorTileCount,
      microFillCount,
      renderPathCount,
      width,
      height,
    };
  }

  return Array.from({ length: height }, (_, y) => (
    Array.from({ length: width }, (_, x) => {
      const tile = occupancy[y]?.[x];
      if (!tile) return null;

      let water = 0;
      let foliage = 0;
      let rock = 0;
      let path = 0;
      let built = 0;
      let open = 0;

      for (let sy = -2; sy <= 2; sy += 1) {
        for (let sx = -2; sx <= 2; sx += 1) {
          const sample = occupancy[y + sy]?.[x + sx];
          if (!sample) continue;
          const weight = TERRAIN_SAMPLE_WEIGHTS[sy + 2][sx + 2];
          if (sample.isWater) water += weight;
          if (sample.isFoliage) foliage += weight;
          if (sample.isRock) rock += weight;
          if (sample.isPath) path += weight;
          if (sample.buildingType && !sample.isPath) built += weight;
          if (sample.openGround) open += weight;
        }
      }

      const waterRatio = water / TERRAIN_TOTAL_WEIGHT;
      const foliageRatio = foliage / TERRAIN_TOTAL_WEIGHT;
      const rockRatio = rock / TERRAIN_TOTAL_WEIGHT;
      const pathRatio = path / TERRAIN_TOTAL_WEIGHT;
      const builtRatio = built / TERRAIN_TOTAL_WEIGHT;
      const openRatio = open / TERRAIN_TOTAL_WEIGHT;

      const cardinal = {
        n: occupancy[y - 1]?.[x] || null,
        s: occupancy[y + 1]?.[x] || null,
        e: occupancy[y]?.[x + 1] || null,
        w: occupancy[y]?.[x - 1] || null,
      };
      const cardinalWater = [cardinal.n, cardinal.s, cardinal.e, cardinal.w]
        .filter((sample) => sample?.isWater)
        .length / 4;
      const cardinalLand = [cardinal.n, cardinal.s, cardinal.e, cardinal.w]
        .filter((sample) => sample && !sample.isWater)
        .length / 4;
      const horizontalLane = (cardinal.w?.isPath ? 1 : 0) + (cardinal.e?.isPath ? 1 : 0);
      const verticalLane = (cardinal.n?.isPath ? 1 : 0) + (cardinal.s?.isPath ? 1 : 0);

      const macroSeed = hash01(x + 11, y + 7, 4);
      const meadowSeed = hash01(x + 23, y + 3, 5);
      const rockySeed = hash01(x + 31, y + 17, 3);
      const shoulderSeed = hash01(x + 5, y + 29, 2);
      const villageWear = tile.openGround ? clamp01(builtRatio * 0.58 + pathRatio * 0.42) : 0;
      const shoreStrength = tile.isWater
        ? clamp01(1 - waterRatio * 0.8 + cardinalLand * 0.32)
        : clamp01(waterRatio * 1.35 + cardinalWater * 0.28);
      const laneStrength = tile.openGround
        ? clamp01(
            pathRatio * 1.5 +
            builtRatio * 0.4 +
            Math.max(horizontalLane, verticalLane) * 0.18 +
            meadowSeed * 0.05 -
            waterRatio * 0.3
          )
        : 0;
      const meadowStrength = tile.openGround
        ? clamp01(
            openRatio * 1.15 +
            (meadowSeed - 0.45) * 0.24 -
            waterRatio * 0.25 -
            rockRatio * 0.34 -
            laneStrength * 0.18
          )
        : 0;
      const rockyStrength = !tile.isWater && !tile.isFoliage
        ? clamp01(
            rockRatio * 1.2 +
            (rockySeed - 0.5) * 0.18 +
            builtRatio * 0.08 -
            meadowStrength * 0.2
          )
        : 0;
      const foliageShadow = !tile.isWater
        ? clamp01(foliageRatio * 1.08 + (tile.isFoliage ? 0.32 : 0))
        : 0;
      const basinDepth = tile.isWater
        ? clamp01(waterRatio * 1.25 + (macroSeed - 0.45) * 0.16 - cardinalLand * 0.08)
        : 0;
      const contourStrength = clamp01(
        shoreStrength * 0.38 +
        rockyStrength * 0.46 +
        foliageShadow * 0.22 +
        villageWear * 0.18
      );
      const baseTone = clamp01(
        0.34 +
        meadowStrength * 0.28 -
        rockyStrength * 0.24 -
        villageWear * 0.08 +
        (macroSeed - 0.5) * 0.16
      );

      const connectorPathVariant = !tile.isPath ? connectorVariantGrid[y][x] : null;
      const microFillVariant = !tile.isPath && !connectorPathVariant ? microFillGrid[y][x] : null;
      const renderPathVariant = tile.pathVariant ?? connectorPathVariant ?? microFillVariant ?? null;
      return {
        openGround: tile.openGround,
        isWater: tile.isWater,
        isFoliage: tile.isFoliage,
        isPathBuilding: tile.isPath,
        pathVariant: renderPathVariant,
        enclosedByPath: microFillVariant != null,
        isRenderConnector: connectorPathVariant != null,
        renderPathBuilding: !!renderPathVariant,
        renderPathVariant,
        villageWear,
        waterRatio,
        foliageRatio,
        meadowStrength,
        rockyStrength,
        laneStrength,
        laneAxis: horizontalLane >= verticalLane ? 'horizontal' : 'vertical',
        shoreStrength,
        foliageShadow,
        basinDepth,
        contourStrength,
        baseTone,
        macroSeed,
        meadowSeed,
        rockySeed,
        shoulderSeed,
      };
    })
  ));
}

export function drawTerrainRegion(/* ctx, biome, tile, x, y, tileSize, terrain, neighbors */) {
  // CF ground (Wang tileset) handles all terrain rendering with consistent colours.
  // Procedural base layer removed — it caused colour mismatches and dark tiles.
}

// --- faux-3D building helpers ---

/** Cast shadow behind/below building (offset right+down matching top-left light) */
function castShadow(ctx, x, y, w, h, radius) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 4, w, h, radius || 4);
  ctx.fill();
  ctx.restore();
}

/** Contact shadow: thin dark line at building base */
function contactShadow(ctx, x, y, w) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1.5);
  ctx.restore();
}

/** Darken right side of a building for faux-3D side plane */
function sideShade(ctx, x, y, w, h) {
  ctx.save();
  const grad = ctx.createLinearGradient(x + w * 0.6, y, x + w, y);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.restore();
}

/** Highlight lit top-left edge */
function topHighlight(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(Math.max(2, h * 0.12)));
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(Math.max(2, w * 0.08)), Math.round(h));
  ctx.restore();
}

/** Warm window glow with mullions */
function warmWindow(ctx, x, y, w, h, u) {
  // glow halo
  ctx.save();
  ctx.fillStyle = 'rgba(232,180,80,0.15)';
  ctx.fillRect(Math.round(x - 1), Math.round(y - 1), Math.round(w + 2), Math.round(h + 2));
  // window pane
  ctx.fillStyle = '#88c8e8';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  // warm interior tint
  ctx.fillStyle = 'rgba(232,200,100,0.20)';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  // mullion cross
  const mu = Math.max(0.5, u * 0.4);
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(Math.round(x + w * 0.47), Math.round(y), Math.round(mu), Math.round(h));
  ctx.fillRect(Math.round(x), Math.round(y + h * 0.47), Math.round(w), Math.round(mu));
  ctx.restore();
}

/** Recessed door with dark frame */
function recessedDoor(ctx, x, y, w, h) {
  // recess frame
  px(ctx, x - 1, y - 1, w + 2, h + 1, 'rgba(0,0,0,0.25)');
  // door
  px(ctx, x, y, w, h, '#5a3a1a');
  // door panel highlight
  px(ctx, x + 1, y + 1, w * 0.4, h * 0.15, '#7a5a3a');
}

/** Roof with ridge highlight and eave shadow */
function shadedRoof(ctx, x1, y1, peakX, peakY, x2, y2, color) {
  // main roof
  tri(ctx, x1, y1, peakX, peakY, x2, y2, color);
  // lit side (left, brighter)
  tri(ctx, x1, y1, peakX, peakY, peakX, y1, lerpColor(color, '#ffffff', 0.14));
  // dark side (right, darker)
  tri(ctx, peakX, peakY, peakX, y1, x2, y2, lerpColor(color, '#000000', 0.10));
  // ridge highlight
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(peakX - 1, peakY + 1);
  ctx.lineTo(peakX + 1, y1);
  ctx.stroke();
  // eave shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(Math.round(x1), Math.round(y1 - 1), Math.round(x2 - x1), 2);
  ctx.restore();
}

// --- tile drawing ---

export function drawTile(ctx, biome, tile, x, y, tileSize, time = 0, neighbors, terrain, gx, gy) {
  const palette = getTilePalette(biome, tile.t);
  const biomeUi = getBiomeUi(biome);
  const s = tileSize;
  const ix = Math.round(x);
  const iy = Math.round(y);
  // Hash from WORLD GRID coords (stable) — never from screen coords (which shift with camera)
  const h = tileHash(gx ?? ix, gy ?? iy);
  const grounds = biomeUi.ground;
  const groundDark = biomeUi.groundDark;
  const groundMid = biomeUi.groundMid;
  const terrainInfo = terrain || null;

  // Cute Fantasy ground tile overlay (replaces procedural base when loaded)
  const cfGround = drawCuteFantasyGround(ctx, biome, tile, ix, iy, s, neighbors, h, time, terrainInfo);

  if (tile.t === 'tree' || tile.t === 'rock' || tile.t === 'bush' || tile.t === 'stump') {
    if (drawCuteFantasyTerrain(ctx, biome, tile, ix, iy, s, h, terrainInfo, neighbors)) {
      return;
    }
    if (drawKenneyTerrain(ctx, biome, tile, ix, iy, s, h, terrainInfo)) {
      return;
    }
    if (drawTerrainAtlasSprite(ctx, biome, tile, ix, iy, s, time, terrainInfo, neighbors, h)) {
      return;
    }
  }

  if (tile.t !== 'water' && !cfGround) {
    const detailAlpha = 0.04 + ((terrainInfo?.macroSeed || ((h % 1000) / 1000)) * 0.04);
    px(ctx, ix + s * 0.16, iy + s * 0.2, s * 0.07, s * 0.07, biomeUi.highlight || '#ffffff', detailAlpha * 0.75);
    px(ctx, ix + s * 0.62, iy + s * 0.56, s * 0.05, s * 0.05, groundDark || grounds[0], detailAlpha * 0.9);

    if ((terrainInfo?.meadowStrength || 0) > 0.08 && (h >> 1) % 3 === 0) {
      paintEdgeGlow(ctx, ix, iy, s, 'n', groundMid || grounds[1], 0.07 + (terrainInfo?.meadowStrength || 0) * 0.05, 0.18);
    }
    if ((terrainInfo?.rockyStrength || 0) > 0.1 && (h >> 3) % 3 === 0) {
      paintEdgeGlow(ctx, ix, iy, s, 's', groundDark || grounds[0], 0.06 + (terrainInfo?.rockyStrength || 0) * 0.05, 0.16);
    }

    if (neighbors) {
      const shoreAlpha = 0.08 + (terrainInfo?.shoreStrength || 0) * 0.12;
      if (neighbors.n === 'water') paintEdgeGlow(ctx, ix, iy, s, 'n', biomeUi.waterShore || '#5898b8', shoreAlpha, 0.24);
      if (neighbors.s === 'water') paintEdgeGlow(ctx, ix, iy, s, 's', biomeUi.waterShore || '#5898b8', shoreAlpha, 0.24);
      if (neighbors.w === 'water') paintEdgeGlow(ctx, ix, iy, s, 'w', biomeUi.waterShore || '#5898b8', shoreAlpha * 0.9, 0.22);
      if (neighbors.e === 'water') paintEdgeGlow(ctx, ix, iy, s, 'e', biomeUi.waterShore || '#5898b8', shoreAlpha * 0.9, 0.22);

      const shadowAlpha = 0.06 + (terrainInfo?.foliageShadow || 0) * 0.08;
      if (neighbors.n === 'tree' || neighbors.n === 'bush' || neighbors.n === 'stump') paintEdgeGlow(ctx, ix, iy, s, 'n', biomeUi.shadowColor || 'rgba(0,0,0,0.08)', shadowAlpha, 0.2);
      if (neighbors.s === 'tree' || neighbors.s === 'bush' || neighbors.s === 'stump') paintEdgeGlow(ctx, ix, iy, s, 's', biomeUi.shadowColor || 'rgba(0,0,0,0.08)', shadowAlpha * 0.8, 0.18);
      if (neighbors.w === 'tree' || neighbors.w === 'bush' || neighbors.w === 'stump') paintEdgeGlow(ctx, ix, iy, s, 'w', biomeUi.shadowColor || 'rgba(0,0,0,0.06)', shadowAlpha * 0.86, 0.18);
      if (neighbors.e === 'tree' || neighbors.e === 'bush' || neighbors.e === 'stump') paintEdgeGlow(ctx, ix, iy, s, 'e', biomeUi.shadowColor || 'rgba(0,0,0,0.06)', shadowAlpha * 0.8, 0.18);
    }
  }

  if (tile.t === 'water' && !cfGround) {
    // --- WATER: depth treatment ---
    const deep = palette.deep || '#0e3a52';
    const shore = palette.shore || '#3898b8';

    // deep center gradient
    ctx.save();
    const wGrad = ctx.createRadialGradient(ix + s * 0.5, iy + s * 0.5, s * 0.1, ix + s * 0.5, iy + s * 0.5, s * 0.6);
    wGrad.addColorStop(0, tint(deep, '#000000', (terrainInfo?.basinDepth || 0) * 0.1));
    wGrad.addColorStop(1, palette.fill);
    ctx.fillStyle = wGrad;
    ctx.globalAlpha = 0.46 + (terrainInfo?.basinDepth || 0) * 0.22;
    ctx.fillRect(ix, iy, s, s);
    ctx.restore();

    // Connected shoreline: only draw shore where water meets non-water
    const shoreSize = s * (0.22 + (terrainInfo?.shoreStrength || 0) * 0.1);
    const nb = neighbors || {};
    const isWater = (t) => t === 'water';
    ctx.save();
    // North shore (top edge) — only if neighbor above is NOT water
    if (nb.n && !isWater(nb.n)) {
      const sg = ctx.createLinearGradient(ix, iy, ix, iy + shoreSize);
      sg.addColorStop(0, shore);
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(ix, iy, s, shoreSize);
      // sandy/foam edge line
      px(ctx, ix, iy, s, s * 0.04, '#ffffff', 0.12);
    }
    // South shore
    if (nb.s && !isWater(nb.s)) {
      const sg = ctx.createLinearGradient(ix, iy + s, ix, iy + s - shoreSize);
      sg.addColorStop(0, shore);
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.50;
      ctx.fillRect(ix, iy + s - shoreSize, s, shoreSize);
      px(ctx, ix, iy + s - s * 0.04, s, s * 0.04, '#ffffff', 0.10);
    }
    // West shore (left edge)
    if (nb.w && !isWater(nb.w)) {
      const sg = ctx.createLinearGradient(ix, iy, ix + shoreSize, iy);
      sg.addColorStop(0, shore);
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(ix, iy, shoreSize, s);
    }
    // East shore
    if (nb.e && !isWater(nb.e)) {
      const sg = ctx.createLinearGradient(ix + s, iy, ix + s - shoreSize, iy);
      sg.addColorStop(0, shore);
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(ix + s - shoreSize, iy, shoreSize, s);
    }
    // Corner shores — where diagonal neighbor is not water but both cardinal neighbors are water
    // This creates rounded shore corners for natural-looking ponds
    if (nb.nw && !isWater(nb.nw) && isWater(nb.n) && isWater(nb.w)) {
      circ(ctx, ix + s * 0.1, iy + s * 0.1, s * 0.18, shore, 0.3);
    }
    if (nb.ne && !isWater(nb.ne) && isWater(nb.n) && isWater(nb.e)) {
      circ(ctx, ix + s * 0.9, iy + s * 0.1, s * 0.18, shore, 0.3);
    }
    if (nb.sw && !isWater(nb.sw) && isWater(nb.s) && isWater(nb.w)) {
      circ(ctx, ix + s * 0.1, iy + s * 0.9, s * 0.18, shore, 0.3);
    }
    if (nb.se && !isWater(nb.se) && isWater(nb.s) && isWater(nb.e)) {
      circ(ctx, ix + s * 0.9, iy + s * 0.9, s * 0.18, shore, 0.3);
    }
    // If ALL cardinal neighbors are water, this is an interior water tile — darker, calmer
    if (isWater(nb.n) && isWater(nb.s) && isWater(nb.e) && isWater(nb.w)) {
      px(ctx, ix, iy, s, s, deep, 0.15);
    }
    ctx.restore();

    // animated concentric ripple rings
    const phase = (time * 0.0008 + ix * 0.02 + iy * 0.03) % 1;
    const rippleR1 = s * 0.10 + phase * s * 0.25;
    const rippleR2 = s * 0.05 + ((phase + 0.5) % 1) * s * 0.22;
    ctx.save();
    ctx.strokeStyle = palette.detail;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.25 * (1 - phase);
    ctx.beginPath();
    ctx.arc(ix + s * 0.4, iy + s * 0.4, rippleR1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.20 * (1 - ((phase + 0.5) % 1));
    ctx.beginPath();
    ctx.arc(ix + s * 0.6, iy + s * 0.6, rippleR2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // reflective highlight that moves slowly
    const reflectX = ix + s * (0.2 + Math.sin(time * 0.0004 + ix * 0.1) * 0.25);
    const reflectY = iy + s * (0.3 + Math.cos(time * 0.0003 + iy * 0.1) * 0.15);
    px(ctx, reflectX, reflectY, s * 0.15, s * 0.04, '#ffffff', 0.12);
    px(ctx, reflectX + s * 0.3, reflectY + s * 0.25, s * 0.10, s * 0.03, '#ffffff', 0.08);

    // sparkle
    const spark = ((time * 0.002 + ix * 17 + iy * 31) % 3) | 0;
    if (spark === 0) {
      const sparkX = ix + s * (0.3 + ((h >> 3) % 5) / 10);
      const sparkY = iy + s * (0.2 + ((h >> 7) % 5) / 10);
      px(ctx, sparkX, sparkY, 2, 2, '#ffffff', 0.55);
    }
    drawCuteFantasyTerrain(ctx, biome, tile, ix, iy, s, h, terrainInfo, neighbors);
    drawKenneyTerrain(ctx, biome, tile, ix, iy, s, h, terrainInfo);
    drawTerrainAtlasSprite(ctx, biome, tile, ix, iy, s, time, terrainInfo, neighbors, h);
    return;
  }

  if (tile.t === 'tree') {
    // --- TREE: volumetric with bark and cast shadow ---
    const sway = Math.sin(time * 0.0012 + h * 0.01) * (s * 0.03);
    const trunkX = ix + s * 0.42;
    const trunkW = s * 0.16;
    const trunkColor = palette.trunk || biomeUi.treeTrunk;

    // cast shadow on ground (offset down-right)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(ix + s * 0.60 + sway * 0.5, iy + s * 0.82, s * 0.36, s * 0.12, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // trunk with bark texture (dark right side, light left side)
    px(ctx, trunkX, iy + s * 0.52, trunkW, s * 0.32, trunkColor);
    // lit side
    px(ctx, trunkX, iy + s * 0.52, trunkW * 0.4, s * 0.32, 'rgba(255,255,255,0.08)');
    // dark side
    px(ctx, trunkX + trunkW * 0.65, iy + s * 0.52, trunkW * 0.35, s * 0.32, 'rgba(0,0,0,0.12)');
    // bark lines
    px(ctx, trunkX + trunkW * 0.3, iy + s * 0.58, trunkW * 0.15, s * 0.04, 'rgba(0,0,0,0.15)');
    px(ctx, trunkX + trunkW * 0.5, iy + s * 0.66, trunkW * 0.2, s * 0.03, 'rgba(0,0,0,0.12)');

    // canopy: 3-4 overlapping circles with lit top and shadow bottom
    const canopyParts = [
      { cx: 0.38, cy: 0.42, r: 0.20 },
      { cx: 0.62, cy: 0.42, r: 0.20 },
      { cx: 0.50, cy: 0.36, r: 0.22 },
      { cx: 0.45, cy: 0.30, r: 0.17 },
    ];
    // shadow pass on all canopy circles
    canopyParts.forEach((p) => {
      circ(ctx, ix + s * p.cx + sway + 2, iy + s * p.cy + 3, s * p.r, 'rgba(0,0,0,0.12)');
    });
    // main fill
    canopyParts.forEach((p) => {
      circ(ctx, ix + s * p.cx + sway, iy + s * p.cy, s * p.r, palette.fill, 0.95);
    });
    // lit top highlights
    canopyParts.forEach((p) => {
      circ(ctx, ix + s * p.cx + sway - s * 0.03, iy + s * p.cy - s * 0.04, s * p.r * 0.55,
        palette.detail || biomeUi.treeHighlight, 0.60);
    });
    // top-left bright rim on top canopy piece
    circ(ctx, ix + s * 0.42 + sway, iy + s * 0.24, s * 0.08, palette.detail || biomeUi.treeHighlight, 0.50);
    return;
  }

  if (tile.t === 'rock') {
    // --- ROCK: sculpted with facets, lit top, dark side ---
    // small shadow underneath
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.ellipse(ix + s * 0.54, iy + s * 0.80, s * 0.38, s * 0.10, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // irregular polygon body
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ix + s * 0.18, iy + s * 0.55);
    ctx.lineTo(ix + s * 0.12, iy + s * 0.38);
    ctx.lineTo(ix + s * 0.28, iy + s * 0.22);
    ctx.lineTo(ix + s * 0.55, iy + s * 0.18);
    ctx.lineTo(ix + s * 0.78, iy + s * 0.26);
    ctx.lineTo(ix + s * 0.82, iy + s * 0.48);
    ctx.lineTo(ix + s * 0.72, iy + s * 0.68);
    ctx.lineTo(ix + s * 0.38, iy + s * 0.72);
    ctx.closePath();
    ctx.fillStyle = palette.fill;
    ctx.fill();
    ctx.restore();

    // lit top face (lighter)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ix + s * 0.18, iy + s * 0.55);
    ctx.lineTo(ix + s * 0.12, iy + s * 0.38);
    ctx.lineTo(ix + s * 0.28, iy + s * 0.22);
    ctx.lineTo(ix + s * 0.55, iy + s * 0.18);
    ctx.lineTo(ix + s * 0.78, iy + s * 0.26);
    ctx.lineTo(ix + s * 0.50, iy + s * 0.42);
    ctx.closePath();
    ctx.fillStyle = palette.detail;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // dark side face (right, in shadow)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ix + s * 0.78, iy + s * 0.26);
    ctx.lineTo(ix + s * 0.82, iy + s * 0.48);
    ctx.lineTo(ix + s * 0.72, iy + s * 0.68);
    ctx.lineTo(ix + s * 0.50, iy + s * 0.42);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    ctx.restore();

    // facet lines
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(ix + s * 0.50, iy + s * 0.42);
    ctx.lineTo(ix + s * 0.28, iy + s * 0.22);
    ctx.moveTo(ix + s * 0.50, iy + s * 0.42);
    ctx.lineTo(ix + s * 0.78, iy + s * 0.26);
    ctx.moveTo(ix + s * 0.50, iy + s * 0.42);
    ctx.lineTo(ix + s * 0.38, iy + s * 0.72);
    ctx.stroke();
    ctx.restore();

    // tiny highlight glint on top
    circ(ctx, ix + s * 0.38, iy + s * 0.24, s * 0.04, '#ffffff', 0.30);
    circ(ctx, ix + s * 0.48, iy + s * 0.20, s * 0.02, '#ffffff', 0.20);

    // small chip beside main rock
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ix + s * 0.70, iy + s * 0.62);
    ctx.lineTo(ix + s * 0.78, iy + s * 0.58);
    ctx.lineTo(ix + s * 0.82, iy + s * 0.64);
    ctx.lineTo(ix + s * 0.75, iy + s * 0.68);
    ctx.closePath();
    ctx.fillStyle = palette.fill;
    ctx.fill();
    ctx.restore();
    return;
  }

  if (tile.t === 'bush') {
    // --- BUSH: rounder, overlapping circles, lit highlights ---
    // shadow underneath
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(ix + s * 0.52, iy + s * 0.72, s * 0.28, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // overlapping circles of varying size (shadow pass)
    circ(ctx, ix + s * 0.52 + 2, iy + s * 0.52 + 2, s * 0.28, 'rgba(0,0,0,0.10)');
    circ(ctx, ix + s * 0.35 + 2, iy + s * 0.48 + 2, s * 0.20, 'rgba(0,0,0,0.08)');
    circ(ctx, ix + s * 0.67 + 2, iy + s * 0.48 + 2, s * 0.19, 'rgba(0,0,0,0.08)');

    // main circles
    circ(ctx, ix + s * 0.50, iy + s * 0.52, s * 0.28, palette.fill);
    circ(ctx, ix + s * 0.35, iy + s * 0.48, s * 0.20, palette.fill);
    circ(ctx, ix + s * 0.67, iy + s * 0.48, s * 0.19, palette.fill);
    circ(ctx, ix + s * 0.42, iy + s * 0.40, s * 0.15, palette.fill);

    // lit highlights on top-left (matching light direction)
    circ(ctx, ix + s * 0.38, iy + s * 0.38, s * 0.12, 'rgba(255,255,255,0.10)');
    circ(ctx, ix + s * 0.30, iy + s * 0.42, s * 0.08, 'rgba(255,255,255,0.08)');
    // shadow on bottom-right
    circ(ctx, ix + s * 0.62, iy + s * 0.58, s * 0.14, 'rgba(0,0,0,0.10)');

    // berry/flower details scattered on surface
    const bh = tileHash(ix, iy);
    const dx1 = (bh % 7) / 7;
    const dx2 = ((bh >> 4) % 5) / 5;
    circ(ctx, ix + s * (0.28 + dx1 * 0.10), iy + s * 0.42, s * 0.04, palette.detail, 0.85);
    circ(ctx, ix + s * (0.50 + dx2 * 0.12), iy + s * 0.45, s * 0.035, palette.detail, 0.75);
    circ(ctx, ix + s * 0.46, iy + s * 0.54, s * 0.03, palette.detail, 0.65);
    circ(ctx, ix + s * 0.60, iy + s * 0.40, s * 0.025, palette.detail, 0.55);
    circ(ctx, ix + s * 0.38, iy + s * 0.52, s * 0.025, palette.detail, 0.50);
    return;
  }

  // When CF tiles handle ground, skip all procedural ground details
  if (cfGround) return;

  // --- GROUND: NO visible grid ---
  // Vary the fill per tile using hash-based noise (already done with baseFill above)
  // Additional subtle variation overlay
  const noiseAlpha = ((h >> 10) % 10) / 200; // 0-0.05
  if ((h >> 12) % 2 === 0) {
    px(ctx, ix, iy, s, s, 'rgba(255,255,255,0.01)');
  } else {
    px(ctx, ix, iy, s, s, 'rgba(0,0,0,0.01)');
  }

  // grass tufts (small triangles, not rectangles) -- more density
  const detailColor = biomeUi.groundDetail;
  if (h % 3 === 0) {
    const gx = ix + s * ((h >> 2) % 8) / 10 + s * 0.05;
    const gy = iy + s * ((h >> 5) % 6) / 8 + s * 0.2;
    const gw = s * 0.04;
    const gh = s * 0.08;
    tri(ctx, gx, gy + gh, gx + gw * 0.5, gy, gx + gw, gy + gh, lerpColor(grounds[0], '#4a7a3a', 0.3));
  }
  if (h % 4 === 0) {
    const gx = ix + s * ((h >> 8) % 7) / 9 + s * 0.1;
    const gy = iy + s * ((h >> 11) % 5) / 7 + s * 0.35;
    const gw = s * 0.035;
    const gh = s * 0.07;
    tri(ctx, gx, gy + gh, gx + gw * 0.5, gy, gx + gw, gy + gh, lerpColor(grounds[0], '#4a7a3a', 0.25));
  }
  // grass clumps that cross tile boundaries (on every other tile)
  if (h % 6 === 0) {
    const gx = ix + s * 0.85;
    const gy = iy + s * 0.65;
    tri(ctx, gx, gy + s * 0.10, gx + s * 0.04, gy, gx + s * 0.08, gy + s * 0.10, lerpColor(grounds[0], '#4a7a3a', 0.2));
    tri(ctx, gx + s * 0.06, gy + s * 0.12, gx + s * 0.10, gy + s * 0.02, gx + s * 0.14, gy + s * 0.12, lerpColor(grounds[0], '#4a7a3a', 0.15));
  }

  // small pebbles
  if (h % 9 === 0) {
    const px1 = ix + s * ((h >> 3) % 7) / 9 + s * 0.1;
    const py1 = iy + s * ((h >> 6) % 6) / 8 + s * 0.15;
    circ(ctx, px1, py1, s * 0.02, 'rgba(120,120,110,0.20)');
  }
  if (h % 13 === 0) {
    const px1 = ix + s * ((h >> 4) % 6) / 8 + s * 0.2;
    const py1 = iy + s * ((h >> 7) % 5) / 7 + s * 0.3;
    circ(ctx, px1, py1, s * 0.015, 'rgba(100,100,90,0.18)');
  }

  // random wildflower dots
  if (h % 11 === 0) {
    const fx = ix + s * ((h >> 3) % 6) / 8 + s * 0.12;
    const fy = iy + s * ((h >> 6) % 5) / 7 + s * 0.18;
    circ(ctx, fx, fy, s * 0.025, detailColor, 0.40);
  }
  if (h % 17 === 0) {
    const fx = ix + s * 0.6 + s * ((h >> 9) % 4) / 12;
    const fy = iy + s * 0.5 + s * ((h >> 12) % 3) / 10;
    circ(ctx, fx, fy, s * 0.02, detailColor, 0.30);
  }

  // dirt patch
  if (h % 15 === 0) {
    px(ctx, ix + s * 0.35, iy + s * 0.55, s * 0.12, s * 0.06, 'rgba(80,60,30,0.12)');
  }

  // Larger dirt/moss patches that span visually across tiles
  if (h % 7 === 0) {
    const patchX = ix + s * ((h >> 5) % 6) / 8;
    const patchY = iy + s * ((h >> 8) % 5) / 7;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.ellipse(patchX + s * 0.2, patchY + s * 0.2, s * 0.18, s * 0.12, (h % 6) * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = groundDark || grounds[0];
    ctx.fill();
    ctx.restore();
  }

  // Scattered leaf/debris
  if (h % 19 === 0) {
    const lx = ix + s * ((h >> 2) % 8) / 10;
    const ly = iy + s * ((h >> 5) % 6) / 8;
    tri(ctx, lx, ly + s * 0.03, lx + s * 0.02, ly, lx + s * 0.04, ly + s * 0.03, detailColor);
    ctx.globalAlpha = 0.25;
    tri(ctx, lx + s * 0.01, ly + s * 0.01, lx + s * 0.03, ly - s * 0.01, lx + s * 0.045, ly + s * 0.02, detailColor);
    ctx.globalAlpha = 1;
  }

  drawKenneyTerrain(ctx, biome, tile, ix, iy, s, h, terrainInfo);
  drawTerrainAtlasSprite(ctx, biome, tile, ix, iy, s, time, terrainInfo, neighbors, h);
}

// --- building sprites ---

const SPRITE_DRAWERS = {
  farm(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // cast shadow
    castShadow(ctx, x + u, y + h * 0.28, w - u * 2, h * 0.62);
    // base field
    px(ctx, x + u, y + h * 0.30, w - u * 2, h * 0.62, '#6a8a2a');
    sideShade(ctx, x + u, y + h * 0.30, w - u * 2, h * 0.62);
    // crop rows with furrow depth
    for (let row = 0; row < 4; row++) {
      const ry = y + h * 0.35 + row * h * 0.14;
      px(ctx, x + u * 3, ry, w - u * 6, u * 1.5, '#4a6a1a');
      // furrow shadow
      px(ctx, x + u * 3, ry + u * 1.2, w - u * 6, u * 0.5, 'rgba(0,0,0,0.12)');
      // stalks
      for (let col = 0; col < 5; col++) {
        const cx = x + u * 4 + col * (w - u * 8) / 4;
        px(ctx, cx, ry - u * 2, u, u * 3, '#2a5a10');
        // volumetric wheat heads
        circ(ctx, cx + u * 0.5, ry - u * 3.2, u * 1.2, '#d4b030');
        circ(ctx, cx + u * 0.5, ry - u * 3.8, u * 0.8, '#e0c040', 0.7);
      }
    }
    // fence border
    px(ctx, x, y + h * 0.28, w, u, '#7a5a30');
    px(ctx, x, y + h * 0.88, w, u, '#7a5a30');
    px(ctx, x, y + h * 0.28, u, h * 0.62, '#7a5a30');
    px(ctx, x + w - u, y + h * 0.28, u, h * 0.62, '#7a5a30');
    // fence posts with shadows
    for (let i = 0; i < 3; i++) {
      const fpx = x + w * (0.25 + i * 0.25);
      px(ctx, fpx + 1, y + h * 0.24 + 2, u, h * 0.08, 'rgba(0,0,0,0.15)');
      px(ctx, fpx, y + h * 0.24, u, h * 0.08, '#5a3a18');
    }
    // contact shadow
    contactShadow(ctx, x + u, y + h * 0.92, w - u * 2);
  },

  house(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // cast shadow
    castShadow(ctx, x + u * 2, y + h * 0.30, w - u * 4, h * 0.60);
    // walls (front plane)
    px(ctx, x + u * 3, y + h * 0.40, w - u * 6, h * 0.52, ui.wallColor);
    topHighlight(ctx, x + u * 3, y + h * 0.40, w - u * 6, h * 0.52);
    // side plane (right wall darker)
    sideShade(ctx, x + u * 3, y + h * 0.40, w - u * 6, h * 0.52);
    // recessed door
    recessedDoor(ctx, x + w * 0.44, y + h * 0.65, w * 0.12, h * 0.27);
    // door knob
    circ(ctx, x + w * 0.54, y + h * 0.78, u * 0.5, '#c8a040');
    // windows with warm glow and mullions
    warmWindow(ctx, x + w * 0.20, y + h * 0.50, w * 0.14, h * 0.12, u);
    warmWindow(ctx, x + w * 0.67, y + h * 0.50, w * 0.14, h * 0.12, u);
    // roof with ridge highlight and eave shadow
    shadedRoof(ctx, x + u, y + h * 0.42, x + w / 2, y + h * 0.14, x + w - u, y + h * 0.42, ui.roofColor);
    // roof ridge highlight line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 1, y + h * 0.14);
    ctx.lineTo(x + w / 2, y + h * 0.42);
    ctx.stroke();
    ctx.restore();
    // chimney
    px(ctx, x + w * 0.72, y + h * 0.12, w * 0.08, h * 0.22, '#6a4a3a');
    px(ctx, x + w * 0.72, y + h * 0.12, w * 0.08, u, '#8a6a5a');
    // chimney smoke puffs (animated drift)
    circ(ctx, x + w * 0.76, y + h * 0.06, u * 1.6, '#c0c0c0', 0.22);
    circ(ctx, x + w * 0.79, y + h * 0.01, u * 1.3, '#b0b0b0', 0.16);
    circ(ctx, x + w * 0.77, y - h * 0.03, u, '#a0a0a0', 0.10);
    // contact shadow
    contactShadow(ctx, x + u * 3, y + h * 0.92, w - u * 6);
  },

  well(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // cast shadow
    castShadow(ctx, x + w * 0.15, y + h * 0.40, w * 0.70, h * 0.40, 99);
    // cobblestone base with depth
    circ(ctx, x + w / 2, y + h * 0.62, w * 0.38, '#707478');
    circ(ctx, x + w / 2, y + h * 0.58, w * 0.34, '#909498');
    // stone rim with depth variation
    circ(ctx, x + w / 2, y + h * 0.52, w * 0.28, '#7a7a7e');
    // rim highlight (lit side)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.52, w * 0.28, Math.PI * 1.2, Math.PI * 1.8);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    // rim shadow (dark side)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.52, w * 0.28, Math.PI * 0.2, Math.PI * 0.8);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    // water inside
    circ(ctx, x + w / 2, y + h * 0.50, w * 0.22, '#4080b0');
    circ(ctx, x + w / 2, y + h * 0.50, w * 0.18, '#3a7aa0', 0.8);
    // crossbeam
    px(ctx, x + w * 0.22, y + h * 0.18, u * 1.2, h * 0.36, '#6a4a2a');
    px(ctx, x + w - w * 0.22 - u, y + h * 0.18, u * 1.2, h * 0.36, '#6a4a2a');
    px(ctx, x + w * 0.18, y + h * 0.16, w * 0.64, u, '#7a5a3a');
    // beam shadow
    px(ctx, x + w * 0.18 + 1, y + h * 0.16 + u + 1, w * 0.64, u * 0.3, 'rgba(0,0,0,0.10)');
    // bucket
    px(ctx, x + w / 2 - u, y + h * 0.28, u * 2, u * 2.5, '#8a6a40');
    px(ctx, x + w / 2 - u, y + h * 0.28, u * 2, u * 0.5, '#9a7a50'); // bucket rim
    // rope with shadow
    px(ctx, x + w / 2 + 1, y + h * 0.18 + 1, u * 0.5, h * 0.12, 'rgba(0,0,0,0.10)');
    px(ctx, x + w / 2, y + h * 0.18, u * 0.5, h * 0.12, '#a09070');
    // contact shadow
    contactShadow(ctx, x + w * 0.18, y + h * 0.80, w * 0.64);
  },

  fishing_hut(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // cast shadow
    castShadow(ctx, x + u, y + h * 0.15, w * 0.60, h * 0.75);
    // water base
    px(ctx, x, y + h * 0.70, w, h * 0.30, '#3090b0', 0.5);
    // stilts
    for (let i = 0; i < 3; i++) {
      px(ctx, x + w * (0.15 + i * 0.30), y + h * 0.40, u * 1.2, h * 0.52, '#5a4030');
      // stilt shadow in water
      px(ctx, x + w * (0.15 + i * 0.30) + 1, y + h * 0.72, u * 1.2, h * 0.20, 'rgba(0,0,0,0.10)');
    }
    // platform
    px(ctx, x + u * 2, y + h * 0.38, w - u * 4, u * 2, '#7a5a3a');
    topHighlight(ctx, x + u * 2, y + h * 0.38, w - u * 4, u * 2);
    // walls
    px(ctx, x + u * 3, y + h * 0.18, w * 0.55, h * 0.22, ui.wallColor);
    sideShade(ctx, x + u * 3, y + h * 0.18, w * 0.55, h * 0.22);
    // roof
    px(ctx, x + u, y + h * 0.12, w * 0.62, u * 2, ui.roofColor);
    px(ctx, x + u * 2, y + h * 0.10, w * 0.58, u, lerpColor(ui.roofColor, '#ffffff', 0.2));
    // window
    warmWindow(ctx, x + w * 0.20, y + h * 0.24, w * 0.08, h * 0.08, u);
    // fishing rod
    px(ctx, x + w * 0.75, y + h * 0.06, u, h * 0.36, '#6a4a2a');
    px(ctx, x + w * 0.75, y + h * 0.06, w * 0.15, u * 0.5, '#6a4a2a');
    // fishing line
    ctx.strokeStyle = '#a0a0a0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.90, y + h * 0.06);
    ctx.lineTo(x + w * 0.88, y + h * 0.55);
    ctx.stroke();
    // bobber
    circ(ctx, x + w * 0.88, y + h * 0.55, u, '#e04040');
    contactShadow(ctx, x + u * 2, y + h * 0.40, w - u * 4);
  },

  woodcutters_hut(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u, y + h * 0.28, w * 0.62, h * 0.58);
    // log cabin walls
    px(ctx, x + u, y + h * 0.35, w * 0.60, h * 0.52, '#8a6040');
    sideShade(ctx, x + u, y + h * 0.35, w * 0.60, h * 0.52);
    topHighlight(ctx, x + u, y + h * 0.35, w * 0.60, h * 0.52);
    // log texture lines
    for (let i = 0; i < 4; i++) {
      px(ctx, x + u, y + h * 0.38 + i * h * 0.12, w * 0.60, u * 0.5, '#6a4a2a');
    }
    // roof
    shadedRoof(ctx, x, y + h * 0.28, x + w * 0.33, y + h * 0.16, x + w * 0.66, y + h * 0.28, ui.roofColor);
    // door
    recessedDoor(ctx, x + w * 0.22, y + h * 0.60, w * 0.12, h * 0.27);
    // stump
    px(ctx, x + w * 0.72, y + h * 0.65, w * 0.18, h * 0.20, '#7a5a30');
    px(ctx, x + w * 0.72, y + h * 0.63, w * 0.18, u, '#a08050');
    // axe in stump
    px(ctx, x + w * 0.78, y + h * 0.48, u, h * 0.18, '#5a5a60');
    px(ctx, x + w * 0.74, y + h * 0.46, u * 3, u * 1.5, '#8a8a90');
    contactShadow(ctx, x + u, y + h * 0.87, w * 0.60);
  },

  stone_pit(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.28, w - u * 4, h * 0.58);
    // excavation pit
    px(ctx, x + u * 2, y + h * 0.30, w - u * 4, h * 0.55, '#5a5458');
    px(ctx, x + u * 3, y + h * 0.35, w - u * 6, h * 0.45, '#4a4448');
    // depth gradient in pit
    sideShade(ctx, x + u * 3, y + h * 0.35, w - u * 6, h * 0.45);
    // stone piles
    circ(ctx, x + w * 0.28, y + h * 0.55, s * 0.10, '#8a8a8e');
    circ(ctx, x + w * 0.42, y + h * 0.60, s * 0.08, '#9a9aa0');
    circ(ctx, x + w * 0.22, y + h * 0.65, s * 0.06, '#7a7a80');
    // highlight on stones
    px(ctx, x + w * 0.26, y + h * 0.50, u, u * 0.5, '#c0c0c4', 0.6);
    // pickaxe
    px(ctx, x + w * 0.65, y + h * 0.22, u, h * 0.40, '#6a4a2a');
    px(ctx, x + w * 0.58, y + h * 0.20, u * 3.5, u * 2, '#8a8a90');
    contactShadow(ctx, x + u * 2, y + h * 0.85, w - u * 4);
  },

  path(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    const biome = ui._biome || 'grasslands';
    const pal = getBiomeUi(biome);
    const stone = pal.pathStone || '#8a8578';
    // cobblestone pattern - irregular rounded stones
    const stones = [
      [0.10, 0.10, 0.25, 0.22], [0.38, 0.08, 0.28, 0.20],
      [0.70, 0.12, 0.22, 0.18], [0.05, 0.36, 0.28, 0.24],
      [0.36, 0.32, 0.30, 0.26], [0.68, 0.34, 0.26, 0.22],
      [0.12, 0.64, 0.24, 0.22], [0.40, 0.62, 0.26, 0.24],
      [0.70, 0.60, 0.22, 0.26],
    ];
    stones.forEach(([sx, sy, sw, sh], i) => {
      const c = i % 2 === 0 ? stone : lerpColor(stone, '#ffffff', 0.12);
      ctx.beginPath();
      ctx.roundRect(x + w * sx, y + h * sy, w * sw, h * sh, [u * 2]);
      ctx.fillStyle = c;
      ctx.fill();
      // subtle 3D highlight on top edge
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + w * sx, y + h * sy, w * sw, h * sh * 0.2);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });
  },

  lumberyard(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.23, w - u * 4, h * 0.68);
    // base platform
    px(ctx, x + u, y + h * 0.80, w - u * 2, h * 0.12, '#6a5030');
    // stacked logs
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const lx = x + u * 3 + col * (w - u * 6) / 4;
        const ly = y + h * 0.55 + row * h * 0.08;
        circ(ctx, lx + u * 2, ly + u, u * 1.5, '#8a6040');
        circ(ctx, lx + u * 2, ly + u, u * 0.8, '#a07850');
      }
    }
    // saw frame
    px(ctx, x + w * 0.60, y + h * 0.18, u * 1.5, h * 0.58, '#5a4030');
    px(ctx, x + w * 0.72, y + h * 0.18, u * 1.5, h * 0.58, '#5a4030');
    px(ctx, x + w * 0.58, y + h * 0.16, w * 0.20, u, '#7a5a3a');
    // saw blade
    px(ctx, x + w * 0.64, y + h * 0.28, w * 0.08, h * 0.30, '#b0b0b8', 0.7);
    // roof over logs
    px(ctx, x, y + h * 0.45, w * 0.55, u * 2, ui.roofColor);
    px(ctx, x, y + h * 0.45, w * 0.55, u * 0.5, lerpColor(ui.roofColor, '#ffffff', 0.15));
    contactShadow(ctx, x + u, y + h * 0.92, w - u * 2);
  },

  quarry(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.28, w - u * 4, h * 0.62);
    // deep cut into rock
    px(ctx, x + u * 2, y + h * 0.35, w - u * 4, h * 0.58, '#4a4448');
    px(ctx, x + u * 4, y + h * 0.40, w - u * 8, h * 0.48, '#3a3438');
    // step walls
    px(ctx, x + u, y + h * 0.30, w - u * 2, h * 0.08, '#6a6a70');
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.06, '#5a5a60');
    // stone blocks
    px(ctx, x + w * 0.10, y + h * 0.70, w * 0.18, h * 0.12, '#8a8a90');
    px(ctx, x + w * 0.30, y + h * 0.72, w * 0.15, h * 0.10, '#909498');
    topHighlight(ctx, x + w * 0.10, y + h * 0.70, w * 0.18, h * 0.12);
    // crane arm
    px(ctx, x + w * 0.70, y + h * 0.10, u * 1.5, h * 0.55, '#5a4a3a');
    px(ctx, x + w * 0.55, y + h * 0.08, w * 0.30, u, '#6a5a4a');
    // crane rope
    ctx.strokeStyle = '#a09070';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.58, y + h * 0.10);
    ctx.lineTo(x + w * 0.58, y + h * 0.45);
    ctx.stroke();
    // hanging block
    px(ctx, x + w * 0.54, y + h * 0.42, u * 3, u * 2.5, '#7a7a80');
    contactShadow(ctx, x + u * 2, y + h * 0.93, w - u * 4);
  },

  weaving_hut(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.26, w - u * 4, h * 0.62);
    // cottage walls
    px(ctx, x + u * 3, y + h * 0.38, w * 0.55, h * 0.52, ui.wallColor);
    topHighlight(ctx, x + u * 3, y + h * 0.38, w * 0.55, h * 0.52);
    sideShade(ctx, x + u * 3, y + h * 0.38, w * 0.55, h * 0.52);
    // roof
    shadedRoof(ctx, x + u, y + h * 0.40, x + w * 0.30, y + h * 0.16, x + w * 0.60, y + h * 0.40, ui.roofColor);
    // door
    recessedDoor(ctx, x + w * 0.22, y + h * 0.62, w * 0.10, h * 0.28);
    // window
    warmWindow(ctx, x + w * 0.40, y + h * 0.48, w * 0.10, h * 0.10, u);
    // fabric hanging outside (colorful strips)
    const fabrics = ['#e050a0', '#50a0e0', '#e0c040', '#40c070'];
    for (let i = 0; i < 4; i++) {
      px(ctx, x + w * 0.65 + i * u * 2.5, y + h * 0.25, u * 1.8, h * 0.40, fabrics[i], 0.85);
    }
    // loom frame
    px(ctx, x + w * 0.64, y + h * 0.22, w * 0.28, u, '#6a4a2a');
    px(ctx, x + w * 0.64, y + h * 0.65, w * 0.28, u, '#6a4a2a');
    contactShadow(ctx, x + u * 3, y + h * 0.90, w * 0.55);
  },

  market(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u, y + h * 0.18, w - u * 2, h * 0.72);
    // counter
    px(ctx, x + u * 2, y + h * 0.55, w - u * 4, h * 0.14, '#8a6840');
    px(ctx, x + u * 2, y + h * 0.55, w - u * 4, u, '#a08050');
    topHighlight(ctx, x + u * 2, y + h * 0.55, w - u * 4, h * 0.14);
    // counter legs
    px(ctx, x + u * 3, y + h * 0.68, u * 1.2, h * 0.22, '#6a4a2a');
    px(ctx, x + w - u * 4.2, y + h * 0.68, u * 1.2, h * 0.22, '#6a4a2a');
    // awning (colored stripes)
    const stripeW = (w - u * 4) / 4;
    const colors = [ui.roofColor, lerpColor(ui.roofColor, '#ffffff', 0.3), ui.roofColor, lerpColor(ui.roofColor, '#ffffff', 0.3)];
    for (let i = 0; i < 4; i++) {
      px(ctx, x + u * 2 + i * stripeW, y + h * 0.20, stripeW, h * 0.18, colors[i]);
    }
    // awning edge scallop
    px(ctx, x + u * 2, y + h * 0.36, w - u * 4, u, ui.roofColor);
    // awning shadow on counter
    px(ctx, x + u * 2, y + h * 0.38, w - u * 4, u * 2, 'rgba(0,0,0,0.08)');
    // support poles
    px(ctx, x + u * 2, y + h * 0.20, u, h * 0.70, '#6a4a2a');
    px(ctx, x + w - u * 3, y + h * 0.20, u, h * 0.70, '#6a4a2a');
    // goods on counter
    px(ctx, x + w * 0.25, y + h * 0.48, u * 2, u * 2, '#c0a040');
    px(ctx, x + w * 0.42, y + h * 0.47, u * 2.5, u * 2.5, '#e06040');
    px(ctx, x + w * 0.60, y + h * 0.48, u * 2, u * 2, '#40a060');
    contactShadow(ctx, x + u * 2, y + h * 0.90, w - u * 4);
  },

  large_house(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 3, y + h * 0.16, w - u * 6, h * 0.74);
    // walls - two story
    px(ctx, x + u * 3, y + h * 0.28, w - u * 6, h * 0.64, ui.wallColor);
    topHighlight(ctx, x + u * 3, y + h * 0.28, w - u * 6, h * 0.64);
    sideShade(ctx, x + u * 3, y + h * 0.28, w - u * 6, h * 0.64);
    // floor line
    px(ctx, x + u * 3, y + h * 0.55, w - u * 6, u * 0.5, 'rgba(0,0,0,0.15)');
    // ground floor windows
    warmWindow(ctx, x + w * 0.12, y + h * 0.62, w * 0.10, h * 0.10, u);
    warmWindow(ctx, x + w * 0.55, y + h * 0.62, w * 0.10, h * 0.10, u);
    warmWindow(ctx, x + w * 0.75, y + h * 0.62, w * 0.10, h * 0.10, u);
    // upper windows
    warmWindow(ctx, x + w * 0.12, y + h * 0.38, w * 0.10, h * 0.10, u);
    warmWindow(ctx, x + w * 0.55, y + h * 0.38, w * 0.10, h * 0.10, u);
    warmWindow(ctx, x + w * 0.75, y + h * 0.38, w * 0.10, h * 0.10, u);
    // door
    recessedDoor(ctx, x + w * 0.33, y + h * 0.60, w * 0.10, h * 0.32);
    // balcony
    px(ctx, x + w * 0.30, y + h * 0.52, w * 0.40, u, '#7a5a3a');
    px(ctx, x + w * 0.30, y + h * 0.52, u * 0.8, h * -0.06, '#7a5a3a');
    px(ctx, x + w * 0.70 - u, y + h * 0.52, u * 0.8, h * -0.06, '#7a5a3a');
    // railing
    for (let i = 0; i < 5; i++) {
      px(ctx, x + w * 0.32 + i * w * 0.07, y + h * 0.47, u * 0.5, h * 0.05, '#8a6a4a');
    }
    px(ctx, x + w * 0.30, y + h * 0.47, w * 0.40, u * 0.5, '#8a6a4a');
    // roof
    shadedRoof(ctx, x + u, y + h * 0.30, x + w / 2, y + h * 0.08, x + w - u, y + h * 0.30, ui.roofColor);
    contactShadow(ctx, x + u * 3, y + h * 0.92, w - u * 6);
  },

  garden(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u, y + h * 0.16, w - u * 2, h * 0.68);
    // small fence
    px(ctx, x + u, y + h * 0.18, w - u * 2, u * 0.8, '#7a5a30');
    px(ctx, x + u, y + h * 0.82, w - u * 2, u * 0.8, '#7a5a30');
    px(ctx, x + u, y + h * 0.18, u * 0.8, h * 0.66, '#7a5a30');
    px(ctx, x + w - u * 1.8, y + h * 0.18, u * 0.8, h * 0.66, '#7a5a30');
    // soil rows
    px(ctx, x + u * 3, y + h * 0.28, w - u * 6, h * 0.50, '#5a4020');
    for (let row = 0; row < 3; row++) {
      px(ctx, x + u * 3, y + h * 0.30 + row * h * 0.16, w - u * 6, u * 0.5, '#4a3018');
    }
    // flowers
    const flowers = ['#e060a0', '#e0e040', '#e04040', '#a040e0', '#40a0e0'];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const fx = x + u * 4 + col * (w - u * 8) / 2;
        const fy = y + h * 0.32 + row * h * 0.16;
        const ci = (row * 3 + col) % flowers.length;
        px(ctx, fx, fy - u, u * 0.5, u * 2, '#3a8a2a'); // stem
        circ(ctx, fx, fy - u * 1.5, u * 1.2, flowers[ci]);
      }
    }
    contactShadow(ctx, x + u, y + h * 0.84, w - u * 2);
  },

  storehouse(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.18, w - u * 4, h * 0.72);
    // barn walls
    px(ctx, x + u * 2, y + h * 0.32, w - u * 4, h * 0.60, ui.wallColor);
    topHighlight(ctx, x + u * 2, y + h * 0.32, w - u * 4, h * 0.60);
    sideShade(ctx, x + u * 2, y + h * 0.32, w - u * 4, h * 0.60);
    // wide doors
    recessedDoor(ctx, x + w * 0.30, y + h * 0.55, w * 0.40, h * 0.37);
    px(ctx, x + w * 0.49, y + h * 0.55, u * 0.8, h * 0.37, '#4a2a10');
    // door cross braces
    ctx.strokeStyle = '#4a2a10';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.30, y + h * 0.55);
    ctx.lineTo(x + w * 0.49, y + h * 0.92);
    ctx.moveTo(x + w * 0.51, y + h * 0.55);
    ctx.lineTo(x + w * 0.70, y + h * 0.92);
    ctx.stroke();
    // roof (barn-style)
    shadedRoof(ctx, x, y + h * 0.34, x + w / 2, y + h * 0.10, x + w, y + h * 0.34, ui.roofColor);
    // windows
    warmWindow(ctx, x + w * 0.10, y + h * 0.42, w * 0.14, h * 0.10, u);
    warmWindow(ctx, x + w * 0.76, y + h * 0.42, w * 0.14, h * 0.10, u);
    contactShadow(ctx, x + u * 2, y + h * 0.92, w - u * 4);
  },

  trading_post(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.23, w - u * 4, h * 0.68);
    // ornate walls
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54, ui.wallColor);
    topHighlight(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54);
    sideShade(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54);
    // gold trim lines
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, u, '#d4a830');
    px(ctx, x + u * 3, y + h * 0.90, w - u * 6, u, '#d4a830');
    // side pilasters
    px(ctx, x + u * 3, y + h * 0.38, u * 1.5, h * 0.54, lerpColor(ui.wallColor, '#d4a830', 0.2));
    px(ctx, x + w - u * 4.5, y + h * 0.38, u * 1.5, h * 0.54, lerpColor(ui.wallColor, '#d4a830', 0.2));
    // door
    recessedDoor(ctx, x + w * 0.40, y + h * 0.60, w * 0.18, h * 0.32);
    // arch above door
    ctx.beginPath();
    ctx.arc(x + w * 0.49, y + h * 0.60, w * 0.09, Math.PI, 0, false);
    ctx.fillStyle = '#6a4a2a';
    ctx.fill();
    // windows
    warmWindow(ctx, x + w * 0.15, y + h * 0.48, w * 0.12, h * 0.10, u);
    warmWindow(ctx, x + w * 0.72, y + h * 0.48, w * 0.12, h * 0.10, u);
    // roof
    shadedRoof(ctx, x + u, y + h * 0.40, x + w / 2, y + h * 0.14, x + w - u, y + h * 0.40, ui.roofColor);
    // gold trim on roof peak
    px(ctx, x + w * 0.46, y + h * 0.14, w * 0.08, u * 1.5, '#e8c830');
    // scales/balance sign
    px(ctx, x + w * 0.48, y + h * 0.18, u, h * 0.08, '#d4a830');
    px(ctx, x + w * 0.42, y + h * 0.18, w * 0.16, u * 0.5, '#d4a830');
    // balance pans
    circ(ctx, x + w * 0.43, y + h * 0.22, u * 1.5, '#d4a830', 0.6);
    circ(ctx, x + w * 0.57, y + h * 0.22, u * 1.5, '#d4a830', 0.6);
    contactShadow(ctx, x + u * 3, y + h * 0.92, w - u * 6);
  },

  town_hall(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 3, y + h * 0.13, w - u * 6, h * 0.80);
    // grand walls
    px(ctx, x + u * 3, y + h * 0.30, w - u * 6, h * 0.64, ui.wallColor);
    topHighlight(ctx, x + u * 3, y + h * 0.30, w - u * 6, h * 0.64);
    sideShade(ctx, x + u * 3, y + h * 0.30, w - u * 6, h * 0.64);
    // pillared entrance
    for (let i = 0; i < 4; i++) {
      const pillarX = x + w * 0.22 + i * w * 0.18;
      // pillar shadow
      px(ctx, pillarX + 1, y + h * 0.50 + 2, u * 2, h * 0.44, 'rgba(0,0,0,0.08)');
      px(ctx, pillarX, y + h * 0.50, u * 2, h * 0.44, '#d0c8c0');
      // lit side
      px(ctx, pillarX, y + h * 0.50, u * 0.6, h * 0.44, 'rgba(255,255,255,0.08)');
      px(ctx, pillarX, y + h * 0.50, u * 2, u, '#e0d8d0');
      px(ctx, pillarX, y + h * 0.92, u * 2, u, '#e0d8d0');
    }
    // entrance lintel
    px(ctx, x + w * 0.20, y + h * 0.48, w * 0.60, u * 1.5, '#c0b8b0');
    // grand door
    recessedDoor(ctx, x + w * 0.38, y + h * 0.56, w * 0.24, h * 0.38);
    px(ctx, x + w * 0.49, y + h * 0.56, u, h * 0.38, '#3a2018');
    // windows on sides
    warmWindow(ctx, x + w * 0.08, y + h * 0.42, w * 0.08, h * 0.10, u);
    warmWindow(ctx, x + w * 0.84, y + h * 0.42, w * 0.08, h * 0.10, u);
    warmWindow(ctx, x + w * 0.08, y + h * 0.62, w * 0.08, h * 0.10, u);
    warmWindow(ctx, x + w * 0.84, y + h * 0.62, w * 0.08, h * 0.10, u);
    // main roof
    shadedRoof(ctx, x + u, y + h * 0.32, x + w / 2, y + h * 0.12, x + w - u, y + h * 0.32, ui.roofColor);
    // clock tower (center, rising above)
    px(ctx, x + w * 0.38, y + h * 0.02, w * 0.24, h * 0.20, ui.roofColor);
    px(ctx, x + w * 0.40, y + h * 0.05, w * 0.20, h * 0.14, lerpColor(ui.wallColor, '#ffffff', 0.1));
    sideShade(ctx, x + w * 0.40, y + h * 0.05, w * 0.20, h * 0.14);
    // clock face
    circ(ctx, x + w * 0.50, y + h * 0.10, w * 0.05, '#e8e0d0');
    circ(ctx, x + w * 0.50, y + h * 0.10, w * 0.03, '#ffffff');
    // clock hands
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.50, y + h * 0.10);
    ctx.lineTo(x + w * 0.50, y + h * 0.07);
    ctx.moveTo(x + w * 0.50, y + h * 0.10);
    ctx.lineTo(x + w * 0.53, y + h * 0.10);
    ctx.stroke();
    // tower pinnacle
    tri(ctx, x + w * 0.40, y + h * 0.04, x + w * 0.50, y - h * 0.02, x + w * 0.60, y + h * 0.04, lerpColor(ui.roofColor, '#d4a830', 0.3));
    contactShadow(ctx, x + u * 3, y + h * 0.94, w - u * 6);
  },

  bakery(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.26, w - u * 4, h * 0.64);
    // warm walls
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54, ui.wallColor);
    // warm glow on walls
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54, '#e8a040', 0.08);
    topHighlight(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54);
    sideShade(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54);
    // door
    recessedDoor(ctx, x + w * 0.40, y + h * 0.62, w * 0.14, h * 0.30);
    // bread in window
    px(ctx, x + w * 0.15, y + h * 0.50, w * 0.16, h * 0.12, '#e8d080');
    px(ctx, x + w * 0.17, y + h * 0.52, w * 0.04, h * 0.06, '#c8a040');
    px(ctx, x + w * 0.23, y + h * 0.53, w * 0.05, h * 0.05, '#d4a840');
    // second window
    warmWindow(ctx, x + w * 0.68, y + h * 0.50, w * 0.16, h * 0.12, u);
    // roof
    shadedRoof(ctx, x + u, y + h * 0.40, x + w / 2, y + h * 0.16, x + w - u, y + h * 0.40, ui.roofColor);
    // chimney
    px(ctx, x + w * 0.74, y + h * 0.08, w * 0.10, h * 0.24, '#6a4a3a');
    px(ctx, x + w * 0.74, y + h * 0.06, w * 0.12, u * 1.5, '#8a6a5a');
    // smoke wisps
    circ(ctx, x + w * 0.79, y + h * 0.02, u * 1.5, '#c0c0c0', 0.30);
    circ(ctx, x + w * 0.82, y - h * 0.02, u * 1.2, '#b0b0b0', 0.20);
    circ(ctx, x + w * 0.78, y - h * 0.06, u, '#a0a0a0', 0.12);
    contactShadow(ctx, x + u * 3, y + h * 0.92, w - u * 6);
  },

  shrine(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.20, w - u * 4, h * 0.70);
    // mystical base
    px(ctx, x + u * 2, y + h * 0.60, w - u * 4, h * 0.32, ui.wallColor);
    topHighlight(ctx, x + u * 2, y + h * 0.60, w - u * 4, h * 0.32);
    sideShade(ctx, x + u * 2, y + h * 0.60, w - u * 4, h * 0.32);
    // arched entrance
    px(ctx, x + w * 0.32, y + h * 0.55, w * 0.36, h * 0.37, '#3a2a4a');
    ctx.beginPath();
    ctx.arc(x + w * 0.50, y + h * 0.55, w * 0.18, Math.PI, 0, false);
    ctx.fillStyle = '#3a2a4a';
    ctx.fill();
    // glowing center
    circ(ctx, x + w * 0.50, y + h * 0.68, w * 0.08, '#e0c0ff', 0.6);
    circ(ctx, x + w * 0.50, y + h * 0.68, w * 0.12, '#c090e0', 0.25);
    circ(ctx, x + w * 0.50, y + h * 0.68, w * 0.18, '#a060c0', 0.10);
    // pillars
    px(ctx, x + w * 0.18, y + h * 0.30, u * 2, h * 0.50, '#a898c0');
    px(ctx, x + w - w * 0.18 - u * 2, y + h * 0.30, u * 2, h * 0.50, '#a898c0');
    // pillar lit/dark sides
    px(ctx, x + w * 0.18, y + h * 0.30, u * 0.6, h * 0.50, 'rgba(255,255,255,0.06)');
    px(ctx, x + w - w * 0.18 - u * 0.6, y + h * 0.30, u * 0.6, h * 0.50, 'rgba(0,0,0,0.08)');
    // pointed roof
    shadedRoof(ctx, x + u, y + h * 0.32, x + w / 2, y + h * 0.08, x + w - u, y + h * 0.32, ui.roofColor);
    // ornament at peak
    circ(ctx, x + w * 0.50, y + h * 0.08, u * 2, '#c090e0', 0.7);
    contactShadow(ctx, x + u * 2, y + h * 0.92, w - u * 4);
  },

  park(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // grass base
    px(ctx, x + u, y + u, w - u * 2, h - u * 2, '#3a7a3a');
    // stone path through center
    for (let i = 0; i < 6; i++) {
      const py = y + h * 0.20 + i * h * 0.12;
      ctx.beginPath();
      ctx.roundRect(x + w * 0.42, py, w * 0.16, h * 0.08, [u]);
      ctx.fillStyle = i % 2 === 0 ? '#8a8578' : '#9a9488';
      ctx.fill();
    }
    // trees with shadow
    const treePositions = [[0.15, 0.20], [0.80, 0.22], [0.18, 0.72], [0.82, 0.74]];
    treePositions.forEach(([tx, ty]) => {
      // cast shadow
      circ(ctx, x + w * tx + u * 2, y + h * ty + s * 0.12, s * 0.08, 'rgba(0,0,0,0.12)');
      px(ctx, x + w * tx, y + h * ty + s * 0.08, u * 1.2, s * 0.12, '#5a3a20');
      circ(ctx, x + w * tx + u * 0.6, y + h * ty, s * 0.10, '#2a6a2a');
      circ(ctx, x + w * tx + u * 0.6, y + h * ty - s * 0.02, s * 0.07, '#3a8a3a', 0.7);
    });
    // bench
    px(ctx, x + w * 0.25, y + h * 0.48, w * 0.14, u * 1.2, '#7a5a3a');
    px(ctx, x + w * 0.26, y + h * 0.52, u * 0.8, u * 2, '#6a4a2a');
    px(ctx, x + w * 0.37, y + h * 0.52, u * 0.8, u * 2, '#6a4a2a');
    // fountain (center right)
    circ(ctx, x + w * 0.65, y + h * 0.50, s * 0.12, '#8a8a90');
    circ(ctx, x + w * 0.65, y + h * 0.50, s * 0.08, '#4090c0');
    circ(ctx, x + w * 0.65, y + h * 0.48, s * 0.03, '#80d0e8', 0.7);
    // flowers along edges
    const flowerColors = ['#e060a0', '#e0e040', '#e04040'];
    for (let i = 0; i < 5; i++) {
      circ(ctx, x + w * 0.10 + i * w * 0.20, y + h * 0.92, u, flowerColors[i % 3], 0.8);
    }
  },

  flower_bed(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // soil bed
    px(ctx, x + u * 2, y + h * 0.30, w - u * 4, h * 0.55, '#5a3a18');
    px(ctx, x + u * 2.5, y + h * 0.32, w - u * 5, h * 0.50, '#6a4a28');
    // flowers in 3x2 grid
    const h2 = tileHash(Math.round(x), Math.round(y));
    const flowerSets = [
      ['#e060a0', '#f080c0', '#d040a0'],
      ['#e0e040', '#f0f060', '#c8c020'],
      ['#4080e0', '#60a0f0', '#3060c0'],
      ['#e04040', '#f06060', '#c02020'],
    ];
    const set = flowerSets[h2 % flowerSets.length];
    const positions = [[0.22, 0.38], [0.50, 0.35], [0.78, 0.38], [0.30, 0.58], [0.60, 0.56], [0.80, 0.60]];
    positions.forEach(([fx, fy], i) => {
      px(ctx, x + w * fx, y + h * fy + u, u * 0.5, u * 2, '#3a8a2a'); // stem
      circ(ctx, x + w * fx, y + h * fy, u * 1.4, set[i % set.length]);
      circ(ctx, x + w * fx, y + h * fy, u * 0.6, '#f0e080', 0.7); // center
    });
  },

  watchtower(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + w * 0.18, y + h * 0.08, w * 0.64, h * 0.84);
    // stone base
    px(ctx, x + w * 0.20, y + h * 0.70, w * 0.60, h * 0.22, '#7a7a80');
    px(ctx, x + w * 0.22, y + h * 0.72, w * 0.56, h * 0.04, '#9a9aa0');
    // tower shaft
    px(ctx, x + w * 0.28, y + h * 0.18, w * 0.44, h * 0.54, ui.wallColor);
    topHighlight(ctx, x + w * 0.28, y + h * 0.18, w * 0.44, h * 0.54);
    sideShade(ctx, x + w * 0.28, y + h * 0.18, w * 0.44, h * 0.54);
    // stone texture variation lines
    for (let i = 0; i < 5; i++) {
      const lineY = y + h * 0.22 + i * h * 0.10;
      px(ctx, x + w * 0.28, lineY, w * 0.44, u * 0.4, 'rgba(0,0,0,0.12)');
      // alternating stone block offset
      if (i % 2 === 0) {
        px(ctx, x + w * 0.48, lineY, u * 0.3, h * 0.10, 'rgba(0,0,0,0.06)');
      } else {
        px(ctx, x + w * 0.38, lineY, u * 0.3, h * 0.10, 'rgba(0,0,0,0.06)');
      }
    }
    // window slits
    px(ctx, x + w * 0.42, y + h * 0.30, w * 0.06, h * 0.08, '#2a2a30');
    px(ctx, x + w * 0.42, y + h * 0.50, w * 0.06, h * 0.08, '#2a2a30');
    // observation platform
    px(ctx, x + w * 0.16, y + h * 0.14, w * 0.68, u * 1.5, '#6a5a4a');
    // crenellations
    for (let i = 0; i < 4; i++) {
      px(ctx, x + w * 0.18 + i * w * 0.18, y + h * 0.08, w * 0.10, u * 2, ui.wallColor);
      // highlight on top of each crenel
      px(ctx, x + w * 0.18 + i * w * 0.18, y + h * 0.08, w * 0.10, u * 0.4, 'rgba(255,255,255,0.10)');
    }
    // flag with flutter
    px(ctx, x + w * 0.72, y - h * 0.02, u, h * 0.14, '#5a4a3a');
    // flag triangles for flutter effect
    tri(ctx, x + w * 0.72 + u, y - h * 0.02, x + w * 0.72 + u, y + h * 0.04, x + w * 0.90, y + h * 0.01, '#e04040');
    tri(ctx, x + w * 0.72 + u, y - h * 0.02 + 1, x + w * 0.72 + u, y + h * 0.03, x + w * 0.88, y + h * 0.005, lerpColor('#e04040', '#ffffff', 0.20));
    contactShadow(ctx, x + w * 0.20, y + h * 0.92, w * 0.60);
  },

  tavern(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 2, y + h * 0.23, w - u * 4, h * 0.68);
    // warm wooden walls
    px(ctx, x + u * 3, y + h * 0.36, w - u * 6, h * 0.56, ui.wallColor);
    px(ctx, x + u * 3, y + h * 0.36, w - u * 6, h * 0.56, '#e8a040', 0.06); // warm glow
    topHighlight(ctx, x + u * 3, y + h * 0.36, w - u * 6, h * 0.56);
    sideShade(ctx, x + u * 3, y + h * 0.36, w - u * 6, h * 0.56);
    // log siding lines
    for (let i = 0; i < 5; i++) {
      px(ctx, x + u * 3, y + h * 0.38 + i * h * 0.10, w - u * 6, u * 0.4, '#6a4a2a');
    }
    // door (double wide)
    recessedDoor(ctx, x + w * 0.36, y + h * 0.58, w * 0.28, h * 0.34);
    px(ctx, x + w * 0.49, y + h * 0.58, u * 0.6, h * 0.34, '#4a2a10');
    // door handles
    circ(ctx, x + w * 0.44, y + h * 0.74, u * 0.8, '#c8a040');
    circ(ctx, x + w * 0.54, y + h * 0.74, u * 0.8, '#c8a040');
    // windows with warm interior glow
    ctx.save();
    // Left window - warm glow halo
    circ(ctx, x + w * 0.17, y + h * 0.54, w * 0.12, 'rgba(232,180,80,0.08)');
    px(ctx, x + w * 0.10, y + h * 0.48, w * 0.14, h * 0.12, '#e8c860');
    px(ctx, x + w * 0.10, y + h * 0.48, w * 0.14, h * 0.12, '#ffffff', 0.15);
    // mullions
    px(ctx, x + w * 0.10, y + h * 0.535, w * 0.14, u * 0.4, '#5a3a1a');
    px(ctx, x + w * 0.165, y + h * 0.48, u * 0.4, h * 0.12, '#5a3a1a');
    // Right window
    circ(ctx, x + w * 0.83, y + h * 0.54, w * 0.12, 'rgba(232,180,80,0.08)');
    px(ctx, x + w * 0.76, y + h * 0.48, w * 0.14, h * 0.12, '#e8c860');
    px(ctx, x + w * 0.76, y + h * 0.48, w * 0.14, h * 0.12, '#ffffff', 0.15);
    px(ctx, x + w * 0.76, y + h * 0.535, w * 0.14, u * 0.4, '#5a3a1a');
    px(ctx, x + w * 0.825, y + h * 0.48, u * 0.4, h * 0.12, '#5a3a1a');
    ctx.restore();
    // roof
    shadedRoof(ctx, x + u, y + h * 0.38, x + w / 2, y + h * 0.14, x + w - u, y + h * 0.38, ui.roofColor);
    // hanging sign with shadow
    px(ctx, x + w * 0.16 + 1, y + h * 0.24 + 1, u, h * 0.14, 'rgba(0,0,0,0.12)');
    px(ctx, x + w * 0.16, y + h * 0.24, u, h * 0.14, '#5a4a3a');
    px(ctx, x + w * 0.08 + 1, y + h * 0.26 + 1, w * 0.14, h * 0.10, 'rgba(0,0,0,0.12)');
    px(ctx, x + w * 0.08, y + h * 0.26, w * 0.14, h * 0.10, '#d8b860');
    // mug icon on sign
    px(ctx, x + w * 0.12, y + h * 0.28, u * 1.5, u * 2, '#8a6030');
    // chimney with smoke
    px(ctx, x + w * 0.78, y + h * 0.08, w * 0.08, h * 0.22, '#6a4a3a');
    circ(ctx, x + w * 0.82, y + h * 0.04, u * 1.2, '#c0c0c0', 0.25);
    circ(ctx, x + w * 0.84, y + h * 0.01, u, '#b0b0b0', 0.15);
    contactShadow(ctx, x + u * 3, y + h * 0.92, w - u * 6);
  },

  warehouse(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    castShadow(ctx, x + u * 3, y + h * 0.16, w - u * 6, h * 0.76);
    // industrial walls
    px(ctx, x + u * 2, y + h * 0.28, w - u * 4, h * 0.66, ui.wallColor);
    topHighlight(ctx, x + u * 2, y + h * 0.28, w - u * 4, h * 0.66);
    sideShade(ctx, x + u * 2, y + h * 0.28, w - u * 4, h * 0.66);
    // corrugated texture
    for (let i = 0; i < 8; i++) {
      const lx = x + u * 3 + i * (w - u * 6) / 8;
      px(ctx, lx, y + h * 0.30, u * 0.5, h * 0.60, 'rgba(0,0,0,0.06)');
    }
    // loading dock
    px(ctx, x + w * 0.05, y + h * 0.82, w * 0.90, h * 0.10, '#6a6a70');
    // large rolling doors
    px(ctx, x + w * 0.10, y + h * 0.45, w * 0.22, h * 0.38, '#5a5a60');
    px(ctx, x + w * 0.38, y + h * 0.45, w * 0.22, h * 0.38, '#5a5a60');
    px(ctx, x + w * 0.66, y + h * 0.45, w * 0.22, h * 0.38, '#5a5a60');
    // door handles
    px(ctx, x + w * 0.20, y + h * 0.62, u, u * 2, '#a0a0a4');
    px(ctx, x + w * 0.48, y + h * 0.62, u, u * 2, '#a0a0a4');
    px(ctx, x + w * 0.76, y + h * 0.62, u, u * 2, '#a0a0a4');
    // flat industrial roof
    px(ctx, x, y + h * 0.24, w, u * 2, ui.roofColor);
    px(ctx, x + u, y + h * 0.22, w - u * 2, u, lerpColor(ui.roofColor, '#ffffff', 0.15));
    // eave shadow
    px(ctx, x, y + h * 0.26, w, u * 0.5, 'rgba(0,0,0,0.10)');
    // crate on dock
    px(ctx, x + w * 0.80, y + h * 0.74, u * 3, u * 3, '#c8a040');
    px(ctx, x + w * 0.80, y + h * 0.74, u * 3, u * 0.5, '#d8b050');
    contactShadow(ctx, x + u * 2, y + h * 0.92, w - u * 4);
  },
};

export function drawBuildingSprite(ctx, biome, building, x, y, tileSize, isSelected = false) {
  const type = building.type || building.building_type;
  const ui = getBuildingUi(type);
  const width = tileSize * building.width;
  const height = tileSize * building.height;

  ctx.save();

  // attach biome for path drawing
  ui._biome = biome;

  if (drawCuteFantasyBuilding(ctx, building, x, y, width, height)) {
    // No outline — CF sprites have their own pixel-art borders
  } else if (drawKenneyBuilding(ctx, building, x, y, width, height)) {
    // No outline — Kenney sprites have clean edges
  } else {
    const drawer = SPRITE_DRAWERS[type];
    if (drawer) {
      drawer(ctx, x, y, width, height, ui, tileSize);
      // subtle outline on all buildings (except path) -- lighter than before
      if (type !== 'path') {
        outline(ctx, x + 1, y + height * 0.12, width - 2, height * 0.82, 'rgba(0,0,0,0.22)');
      }
    } else {
      // fallback for unknown types
      castShadow(ctx, x + 2, y + height * 0.13, width - 4, height * 0.72);
      px(ctx, x + 2, y + height * 0.15, width - 4, height * 0.70, ui.wallColor);
      topHighlight(ctx, x + 2, y + height * 0.15, width - 4, height * 0.70);
      sideShade(ctx, x + 2, y + height * 0.15, width - 4, height * 0.70);
      outline(ctx, x + 2, y + height * 0.15, width - 4, height * 0.70, 'rgba(0,0,0,0.25)');
      shadedRoof(ctx, x, y + height * 0.18, x + width / 2, y + height * 0.02, x + width, y + height * 0.18, ui.roofColor);
      contactShadow(ctx, x + 2, y + height * 0.85, width - 4);
    }
  }

  // selection glow
  if (isSelected) {
    ctx.shadowColor = 'rgba(80,220,255,0.5)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(80,220,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

export function drawConstructionOverlay(ctx, building, x, y, tileSize, time = 0) {
  const width = tileSize * building.width;
  const height = tileSize * building.height;

  // semi-transparent dark overlay
  ctx.save();
  ctx.fillStyle = 'rgba(12,16,24,0.50)';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, width - 4, height - 4, 6);
  ctx.fill();

  // animated pulsing construction bars
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.004);
  const barH = Math.max(3, tileSize * 0.10);
  const barY = y + height * 0.78;
  const barW = width * 0.70;
  const barX = x + (width - barW) / 2;

  // background bar
  px(ctx, barX, barY, barW, barH, 'rgba(255,255,255,0.10)');
  // animated fill
  const fillAlpha = 0.5 + pulse * 0.4;
  const fillColor = `rgba(230,180,40,${fillAlpha})`;
  px(ctx, barX, barY, barW * (0.3 + pulse * 0.15), barH, fillColor);
  // stripes
  const stripeCount = Math.ceil(barW / (barH * 2));
  const offset = (time * 0.03) % (barH * 2);
  ctx.beginPath();
  ctx.rect(barX, barY, barW, barH);
  ctx.clip();
  for (let i = -1; i < stripeCount + 1; i++) {
    const sx = barX + i * barH * 2 + offset;
    ctx.fillStyle = `rgba(255,160,20,${0.15 + pulse * 0.10})`;
    ctx.beginPath();
    ctx.moveTo(sx, barY);
    ctx.lineTo(sx + barH, barY);
    ctx.lineTo(sx, barY + barH);
    ctx.lineTo(sx - barH, barY + barH);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export function drawSelectionOutline(ctx, x, y, width, height, color = 'rgba(80,220,255,0.95)', time = 0) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(width);
  const ih = Math.round(height);
  ctx.save();

  // animated dashed border
  const dashOffset = (time || performance.now()) * 0.03;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -dashOffset;
  ctx.strokeRect(ix + 1, iy + 1, iw - 2, ih - 2);
  ctx.setLineDash([]);

  // subtle glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(ix + 1, iy + 1, iw - 2, ih - 2);
  ctx.shadowBlur = 0;

  // corner bracket handles
  const bracketLen = Math.min(8, iw * 0.2, ih * 0.2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  // top-left
  ctx.beginPath();
  ctx.moveTo(ix, iy + bracketLen);
  ctx.lineTo(ix, iy);
  ctx.lineTo(ix + bracketLen, iy);
  ctx.stroke();
  // top-right
  ctx.beginPath();
  ctx.moveTo(ix + iw - bracketLen, iy);
  ctx.lineTo(ix + iw, iy);
  ctx.lineTo(ix + iw, iy + bracketLen);
  ctx.stroke();
  // bottom-left
  ctx.beginPath();
  ctx.moveTo(ix, ih + iy - bracketLen);
  ctx.lineTo(ix, ih + iy);
  ctx.lineTo(ix + bracketLen, ih + iy);
  ctx.stroke();
  // bottom-right
  ctx.beginPath();
  ctx.moveTo(ix + iw - bracketLen, ih + iy);
  ctx.lineTo(ix + iw, ih + iy);
  ctx.lineTo(ix + iw, ih + iy - bracketLen);
  ctx.stroke();

  ctx.restore();
}

export function drawGhostFootprint(ctx, x, y, tileSize, bw, bh, valid, time = 0) {
  const width = tileSize * bw;
  const height = tileSize * bh;
  const t = time || performance.now();
  // pulsing opacity
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.005);
  const baseAlpha = 0.16 * pulse;
  const strokeAlpha = 0.55 * pulse;

  ctx.save();
  // softer overlay
  ctx.fillStyle = valid
    ? `rgba(110,231,183,${baseAlpha.toFixed(3)})`
    : `rgba(239,68,68,${baseAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, width - 2, height - 2, 4);
  ctx.fill();

  // border
  ctx.strokeStyle = valid
    ? `rgba(110,231,183,${strokeAlpha.toFixed(3)})`
    : `rgba(239,68,68,${strokeAlpha.toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.setLineDash([]);

  // subtle grid pattern within footprint to show tile boundaries during placement
  ctx.strokeStyle = valid
    ? `rgba(110,231,183,${(strokeAlpha * 0.3).toFixed(3)})`
    : `rgba(239,68,68,${(strokeAlpha * 0.3).toFixed(3)})`;
  ctx.lineWidth = 0.5;
  for (let gx = 1; gx < bw; gx++) {
    const lx = x + gx * tileSize;
    ctx.beginPath();
    ctx.moveTo(lx, y + 2);
    ctx.lineTo(lx, y + height - 2);
    ctx.stroke();
  }
  for (let gy = 1; gy < bh; gy++) {
    const ly = y + gy * tileSize;
    ctx.beginPath();
    ctx.moveTo(x + 2, ly);
    ctx.lineTo(x + width - 2, ly);
    ctx.stroke();
  }

  ctx.restore();
}

const RESIDENT_PALETTES = {
  teal:   { hood: '#4b8f88', coat: '#2f6e69', accent: '#cce9df', skin: '#efd3bc', hair: '#4c3426' },
  berry:  { hood: '#a24f64', coat: '#7f334a', accent: '#f4d8dd', skin: '#f0cfbf', hair: '#513122' },
  ochre:  { hood: '#b98b3d', coat: '#8f6623', accent: '#f5e2b9', skin: '#efd0ba', hair: '#5f4128' },
  slate:  { hood: '#667287', coat: '#475264', accent: '#d8e0ea', skin: '#eccab6', hair: '#3f2f22' },
  moss:   { hood: '#5f8b4a', coat: '#476b38', accent: '#dcebc8', skin: '#e8c3ad', hair: '#4a3423' },
  plum:   { hood: '#8866a2', coat: '#64497d', accent: '#e6dcf3', skin: '#efc8b3', hair: '#4a2c22' },
};

export function drawVillageResident(ctx, x, y, tileSize, paletteKey, activity = 'stroll', frameOffset = 0, facing = 1, moving = false) {
  if (drawCuteFantasyResident(ctx, x, y, tileSize, paletteKey, activity, frameOffset, facing, moving)) {
    return;
  }
  if (drawKenneyResident(ctx, x, y, tileSize, paletteKey, activity, frameOffset, facing)) {
    return;
  }
  if (drawVillageResidentAtlas(ctx, x, y, tileSize, paletteKey, activity, frameOffset, facing)) {
    return;
  }
  const s = tileSize;
  const pal = RESIDENT_PALETTES[paletteKey] || RESIDENT_PALETTES.teal;
  const stride = Math.sin(frameOffset * Math.PI * 4) * s * 0.028;
  const bob = Math.sin(frameOffset * Math.PI * 2) * s * 0.016;
  const blink = ((frameOffset * 8) | 0) % 7 === 0;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(facing, 1);
  ctx.shadowColor = 'rgba(0,0,0,0.24)';
  ctx.shadowBlur = Math.max(2, s * 0.06);
  ctx.shadowOffsetY = Math.max(1, s * 0.015);

  fillEllipse(ctx, 0, s * 0.04, s * 0.15, s * 0.06, 'rgba(0,0,0,0.18)', 1);

  // legs
  px(ctx, -s * 0.055, -s * 0.005 + stride, s * 0.032, s * 0.09, '#3b2a1d');
  px(ctx, s * 0.02, -s * 0.005 - stride, s * 0.032, s * 0.09, '#3b2a1d');
  // coat
  px(ctx, -s * 0.09, -s * 0.12, s * 0.18, s * 0.17, pal.coat);
  px(ctx, -s * 0.03, -s * 0.10, s * 0.06, s * 0.12, pal.accent, 0.45);
  // arms
  px(ctx, -s * 0.12, -s * 0.1, s * 0.04, s * 0.11, pal.hood);
  px(ctx, s * 0.08, -s * 0.08, s * 0.04, s * 0.11, pal.hood);
  // head
  circ(ctx, 0, -s * 0.17, s * 0.072, pal.skin);
  px(ctx, -s * 0.06, -s * 0.24, s * 0.12, s * 0.045, pal.hair);
  // hood
  tri(ctx, -s * 0.10, -s * 0.14, 0, -s * 0.28, s * 0.10, -s * 0.14, pal.hood);

  if (blink) {
    px(ctx, -s * 0.03, -s * 0.18, s * 0.018, s * 0.005, '#2b2019');
    px(ctx, s * 0.015, -s * 0.18, s * 0.018, s * 0.005, '#2b2019');
  } else {
    circ(ctx, -s * 0.022, -s * 0.18, s * 0.010, '#2b2019');
    circ(ctx, s * 0.022, -s * 0.18, s * 0.010, '#2b2019');
  }

  if (activity === 'gather') {
    px(ctx, s * 0.09, -s * 0.02, s * 0.05, s * 0.05, '#d8b76a');
  } else if (activity === 'build') {
    px(ctx, s * 0.085, -s * 0.07, s * 0.02, s * 0.13, '#8d6c4f');
    px(ctx, s * 0.05, -s * 0.1, s * 0.08, s * 0.03, '#c7cbd6');
  } else if (activity === 'carry') {
    px(ctx, -s * 0.13, -s * 0.08, s * 0.06, s * 0.06, '#9a7f58');
    px(ctx, -s * 0.122, -s * 0.072, s * 0.044, s * 0.044, '#d6be82');
  } else if (activity === 'play') {
    circ(ctx, s * 0.12, -s * 0.02, s * 0.03, '#63c7ff');
  }

  ctx.restore();
}

export function drawAmbientCritter(ctx, x, y, tileSize, species, frameOffset = 0, options = {}) {
  if (drawCuteFantasyCritter(ctx, x, y, tileSize, species, frameOffset, options)) {
    return;
  }
  if (drawKenneyCritter(ctx, x, y, tileSize, species, frameOffset, options)) {
    return;
  }
  if (drawAmbientCritterAtlas(ctx, x, y, tileSize, species, frameOffset, options)) {
    return;
  }
  const s = tileSize * (options.scale || 1);
  const hover = Math.sin(frameOffset * Math.PI * 2);
  const facing = options.facing || 1;
  const highlight = options.highlight;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.shadowColor = highlight ? 'rgba(251,191,36,0.34)' : 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = Math.max(2, s * (highlight ? 0.11 : 0.06));
  ctx.shadowOffsetY = Math.max(1, s * 0.02);

  if (highlight) {
    const pulse = 0.35 + Math.abs(hover) * 0.25;
    ctx.save();
    ctx.strokeStyle = `rgba(251,191,36,${pulse.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.arc(0, -s * 0.08, s * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (species === 'fish_koi' || species === 'fish_perch') {
    const body = species === 'fish_koi' ? '#f29f4b' : '#76a7c8';
    const stripe = species === 'fish_koi' ? '#fff4dd' : '#d8edf8';
    fillEllipse(ctx, 0, 0, s * 0.16, s * 0.08, 'rgba(0,0,0,0.16)', 1);
    fillEllipse(ctx, 0, -s * 0.03, s * 0.14, s * 0.08, body, 1);
    tri(ctx, -s * 0.15, -s * 0.03, -s * 0.24, -s * 0.12, -s * 0.24, s * 0.05, body);
    tri(ctx, -s * 0.03, -s * 0.10, s * 0.05, -s * 0.16, s * 0.08, -s * 0.06, stripe);
    px(ctx, -s * 0.04, -s * 0.05, s * 0.08, s * 0.015, stripe);
    circ(ctx, s * 0.08, -s * 0.04, s * 0.01, '#13283a');
  } else if (species === 'duck') {
    fillEllipse(ctx, 0, s * 0.03, s * 0.18, s * 0.08, 'rgba(0,0,0,0.15)', 1);
    fillEllipse(ctx, 0, -s * 0.03, s * 0.14, s * 0.09, '#ddd5b3', 1);
    circ(ctx, s * 0.11, -s * 0.10 + hover * s * 0.01, s * 0.05, '#e6ddbf');
    tri(ctx, s * 0.14, -s * 0.10, s * 0.22, -s * 0.08, s * 0.14, -s * 0.04, '#e39a2f');
    circ(ctx, s * 0.12, -s * 0.11, s * 0.008, '#1d1710');
    px(ctx, -s * 0.08, s * 0.08, s * 0.16, s * 0.008, 'rgba(255,255,255,0.25)');
  } else if (species === 'rabbit') {
    fillEllipse(ctx, 0, s * 0.02, s * 0.18, s * 0.08, 'rgba(0,0,0,0.14)', 1);
    fillEllipse(ctx, -s * 0.02, -s * 0.03, s * 0.12, s * 0.085, '#d9d3ca', 1);
    circ(ctx, s * 0.1, -s * 0.09, s * 0.05, '#e5ddd6');
    px(ctx, s * 0.08, -s * 0.22, s * 0.026, s * 0.11, '#e5ddd6');
    px(ctx, s * 0.12, -s * 0.23, s * 0.022, s * 0.12, '#d3b7bc');
    px(ctx, s * 0.14, -s * 0.22, s * 0.026, s * 0.11, '#e5ddd6');
    px(ctx, s * 0.18, -s * 0.23, s * 0.022, s * 0.12, '#d3b7bc');
    circ(ctx, s * 0.115, -s * 0.095, s * 0.007, '#1d1710');
  } else if (species === 'deer') {
    fillEllipse(ctx, 0, s * 0.04, s * 0.22, s * 0.08, 'rgba(0,0,0,0.15)', 1);
    px(ctx, -s * 0.12, -s * 0.08, s * 0.22, s * 0.10, '#9e7744');
    px(ctx, s * 0.08, -s * 0.16, s * 0.05, s * 0.12, '#9e7744');
    px(ctx, s * 0.1, -s * 0.20, s * 0.08, s * 0.06, '#ae8751');
    px(ctx, s * 0.14, -s * 0.25, s * 0.008, s * 0.06, '#8b6a3d');
    px(ctx, s * 0.11, -s * 0.28, s * 0.008, s * 0.04, '#8b6a3d');
    px(ctx, s * 0.16, -s * 0.28, s * 0.008, s * 0.04, '#8b6a3d');
    px(ctx, -s * 0.08, s * 0.02, s * 0.018, s * 0.12, '#73552c');
    px(ctx, -s * 0.01, s * 0.02 + hover * s * 0.01, s * 0.018, s * 0.12, '#73552c');
    px(ctx, s * 0.05, s * 0.02, s * 0.018, s * 0.12, '#73552c');
    circ(ctx, s * 0.14, -s * 0.19, s * 0.008, '#1d1710');
  } else if (species === 'boar') {
    fillEllipse(ctx, 0, s * 0.05, s * 0.22, s * 0.08, 'rgba(0,0,0,0.15)', 1);
    fillEllipse(ctx, 0, -s * 0.03, s * 0.16, s * 0.10, '#6e5240', 1);
    px(ctx, s * 0.11, -s * 0.11, s * 0.09, s * 0.07, '#7f614e');
    tri(ctx, s * 0.14, -s * 0.05, s * 0.23, -s * 0.02, s * 0.14, 0, '#d8c4aa');
    px(ctx, -s * 0.08, s * 0.02, s * 0.025, s * 0.10, '#473225');
    px(ctx, 0, s * 0.02 + hover * s * 0.01, s * 0.025, s * 0.10, '#473225');
    px(ctx, s * 0.07, s * 0.02, s * 0.025, s * 0.10, '#473225');
  } else if (species === 'fox') {
    fillEllipse(ctx, 0, s * 0.03, s * 0.18, s * 0.08, 'rgba(0,0,0,0.15)', 1);
    px(ctx, -s * 0.12, -s * 0.07, s * 0.18, s * 0.09, '#d87333');
    px(ctx, s * 0.05, -s * 0.12, s * 0.08, s * 0.07, '#e0823b');
    tri(ctx, s * 0.08, -s * 0.12, s * 0.11, -s * 0.19, s * 0.14, -s * 0.12, '#d87333');
    tri(ctx, s * 0.12, -s * 0.12, s * 0.15, -s * 0.19, s * 0.18, -s * 0.12, '#d87333');
    px(ctx, -s * 0.18, -s * 0.10 + hover * s * 0.02, s * 0.09, s * 0.04, '#f5e4cc');
    px(ctx, -s * 0.07, s * 0.02, s * 0.022, s * 0.10, '#8c4a1d');
    px(ctx, s * 0.01, s * 0.02 + hover * s * 0.008, s * 0.022, s * 0.10, '#8c4a1d');
    circ(ctx, s * 0.1, -s * 0.10, s * 0.008, '#1d1710');
  } else if (species === 'wolf') {
    fillEllipse(ctx, 0, s * 0.03, s * 0.21, s * 0.08, 'rgba(0,0,0,0.16)', 1);
    px(ctx, -s * 0.13, -s * 0.08, s * 0.2, s * 0.1, '#7c808b');
    px(ctx, s * 0.05, -s * 0.13, s * 0.09, s * 0.08, '#8d919d');
    tri(ctx, s * 0.07, -s * 0.13, s * 0.10, -s * 0.20, s * 0.13, -s * 0.13, '#7c808b');
    tri(ctx, s * 0.13, -s * 0.13, s * 0.16, -s * 0.20, s * 0.19, -s * 0.13, '#7c808b');
    px(ctx, -s * 0.07, s * 0.02, s * 0.025, s * 0.10, '#50545d');
    px(ctx, s * 0.01, s * 0.02 + hover * s * 0.01, s * 0.025, s * 0.10, '#50545d');
    px(ctx, s * 0.08, s * 0.02, s * 0.025, s * 0.10, '#50545d');
    circ(ctx, s * 0.1, -s * 0.10, s * 0.009, '#e4ba4f');
  } else if (species === 'bear') {
    fillEllipse(ctx, 0, s * 0.05, s * 0.22, s * 0.09, 'rgba(0,0,0,0.18)', 1);
    fillEllipse(ctx, 0, -s * 0.02, s * 0.18, s * 0.12, '#6a4425', 1);
    circ(ctx, s * 0.13, -s * 0.08, s * 0.06, '#775030');
    circ(ctx, s * 0.11, -s * 0.15, s * 0.02, '#6a4425');
    circ(ctx, s * 0.16, -s * 0.15, s * 0.02, '#6a4425');
    px(ctx, -s * 0.08, s * 0.03, s * 0.03, s * 0.12, '#4f3118');
    px(ctx, 0, s * 0.03 + hover * s * 0.008, s * 0.03, s * 0.12, '#4f3118');
    px(ctx, s * 0.08, s * 0.03, s * 0.03, s * 0.12, '#4f3118');
  } else {
    // songbird / rare_bird
    const body = species === 'rare_bird' ? '#48a7c8' : '#d9c356';
    const wing = species === 'rare_bird' ? '#246d93' : '#7f5bb7';
    const crest = species === 'rare_bird' ? '#f2d28e' : '#f08c42';
    fillEllipse(ctx, 0, s * 0.03, s * 0.14, s * 0.06, 'rgba(0,0,0,0.15)', 1);
    circ(ctx, 0, -s * 0.03 + hover * s * 0.02, s * 0.08, body);
    circ(ctx, s * 0.07, -s * 0.08 + hover * s * 0.02, s * 0.04, body);
    tri(ctx, s * 0.11, -s * 0.08, s * 0.18, -s * 0.06, s * 0.11, -s * 0.03, '#e39a2f');
    tri(ctx, -s * 0.03, -s * 0.03, -s * 0.11, -s * 0.12 - hover * s * 0.03, s * 0.03, s * 0.01, wing);
    tri(ctx, -s * 0.08, -s * 0.02, -s * 0.18, -s * 0.08, -s * 0.12, s * 0.02, wing);
    px(ctx, s * 0.01, s * 0.06, s * 0.01, s * 0.06, '#7a5a30');
    px(ctx, s * 0.05, s * 0.06, s * 0.01, s * 0.06, '#7a5a30');
    px(ctx, s * 0.02, -s * 0.15, s * 0.012, s * 0.04, crest);
    px(ctx, s * 0.04, -s * 0.17, s * 0.012, s * 0.04, crest);
  }

  ctx.restore();
}

// Pet animation state: 0 = walking, 1 = idle/sitting, 2 = sleeping
function getPetAnimState(frameOffset) {
  if (frameOffset < 0.6) return 'walk';
  if (frameOffset < 0.85) return 'sit';
  return 'sleep';
}

const PET_PALETTES = {
  dojocat:  { body: '#4a4a52', head: '#5a5a64', eye: '#ffffff', pupil: '#222228', ear: '#4a4a52', belly: '#6a6a72', nose: '#3a3a40' },
  buu:      { body: '#e890b0', head: '#f0a0c0', eye: '#ffffff', pupil: '#3a1828', ear: '#e080a0', belly: '#f0b0d0', nose: '#c870a0' },
  devit:    { body: '#3a6aaa', head: '#4a7aba', eye: '#ffffff', pupil: '#1a2a44', ear: '#3060a0', belly: '#5a8aca', nose: '#2a4a8a' },
  pixiu:    { body: '#c8a040', head: '#d8b050', eye: '#ffffff', pupil: '#3a2a10', ear: '#b89030', belly: '#d8c060', nose: '#a88030' },
  tanuki:   { body: '#8a6a40', head: '#9a7a50', eye: '#ffffff', pupil: '#2a1a08', ear: '#6a4a28', belly: '#c0a878', nose: '#4a3018' },
  kitsune:  { body: '#d88040', head: '#e89050', eye: '#ffffff', pupil: '#2a1a10', ear: '#c06830', belly: '#e8b080', nose: '#a06028' },
  usagi:    { body: '#d0c8c0', head: '#e0d8d0', eye: '#ffffff', pupil: '#2a2028', ear: '#d8c8c0', belly: '#f0e8e0', nose: '#c0a0a0' },
  kappa:    { body: '#40a060', head: '#50b070', eye: '#ffffff', pupil: '#0a2a18', ear: '#308a48', belly: '#60c080', nose: '#2a8a48' },
};

export function drawPetWander(ctx, x, y, tileSize, character, frameOffset, moving, facing, scaleMultiplier = 1) {
  if (drawCuteFantasyPet(ctx, x, y, tileSize * 1.06, character, frameOffset, moving, facing, scaleMultiplier)) {
    return;
  }
  if (drawPetAtlas(ctx, x, y, tileSize * 1.06, character, frameOffset)) {
    return;
  }
  const s = tileSize * 1.12;
  const animState = getPetAnimState(frameOffset);
  const frame = (frameOffset * 4) | 0; // 0-3 sub-frames
  const bobPhase = Math.sin(frameOffset * Math.PI * 2);
  const pal = PET_PALETTES[character] || PET_PALETTES.dojocat;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = Math.max(2, s * 0.08);
  ctx.shadowOffsetY = Math.max(1, s * 0.02);

  const cx = x;

  if (animState === 'walk') {
    const bobY = bobPhase * s * 0.03;
    const cy = y + bobY;
    // shadow
    circ(ctx, cx, cy + s * 0.02, s * 0.16, 'rgba(0,0,0,0.18)');
    // body
    circ(ctx, cx, cy - s * 0.06, s * 0.14, pal.body);
    // belly highlight
    circ(ctx, cx, cy - s * 0.04, s * 0.08, pal.belly, 0.5);
    // limbs walk cycle
    const limbA = Math.sin(frameOffset * Math.PI * 4) * s * 0.03;
    px(ctx, cx - s * 0.08, cy + s * 0.04 + limbA, s * 0.05, s * 0.06, pal.body);
    px(ctx, cx + s * 0.03, cy + s * 0.04 - limbA, s * 0.05, s * 0.06, pal.body);
    // tail
    const tailWag = Math.sin(frameOffset * Math.PI * 6) * s * 0.02;
    px(ctx, cx - s * 0.02, cy - s * 0.14 + tailWag, s * 0.04, s * 0.03, pal.body);
    // head
    circ(ctx, cx, cy - s * 0.18, s * 0.12, pal.head);
    // ears
    px(ctx, cx - s * 0.10, cy - s * 0.28, s * 0.05, s * 0.06, pal.ear);
    px(ctx, cx + s * 0.05, cy - s * 0.28, s * 0.05, s * 0.06, pal.ear);
    // eyes
    const eyeY = cy - s * 0.18;
    circ(ctx, cx - s * 0.04, eyeY, s * 0.03, pal.eye);
    circ(ctx, cx + s * 0.04, eyeY, s * 0.03, pal.eye);
    circ(ctx, cx - s * 0.04, eyeY, s * 0.015, pal.pupil);
    circ(ctx, cx + s * 0.04, eyeY, s * 0.015, pal.pupil);
    // nose
    circ(ctx, cx, cy - s * 0.155, s * 0.012, pal.nose);
  } else if (animState === 'sit') {
    const cy = y;
    // shadow (wider when sitting)
    circ(ctx, cx, cy + s * 0.04, s * 0.18, 'rgba(0,0,0,0.15)');
    // body (rounder when sitting)
    circ(ctx, cx, cy - s * 0.02, s * 0.16, pal.body);
    circ(ctx, cx, cy + s * 0.01, s * 0.10, pal.belly, 0.5);
    // front paws
    px(ctx, cx - s * 0.06, cy + s * 0.08, s * 0.04, s * 0.03, pal.body);
    px(ctx, cx + s * 0.02, cy + s * 0.08, s * 0.04, s * 0.03, pal.body);
    // tail curled to side
    ctx.beginPath();
    ctx.arc(cx + s * 0.12, cy, s * 0.05, 0, Math.PI * 1.4);
    ctx.strokeStyle = pal.body;
    ctx.lineWidth = s * 0.03;
    ctx.stroke();
    // head (slight tilt)
    circ(ctx, cx, cy - s * 0.16, s * 0.12, pal.head);
    // ears (perked)
    tri(ctx, cx - s * 0.10, cy - s * 0.25, cx - s * 0.06, cy - s * 0.32, cx - s * 0.02, cy - s * 0.25, pal.ear);
    tri(ctx, cx + s * 0.02, cy - s * 0.25, cx + s * 0.06, cy - s * 0.32, cx + s * 0.10, cy - s * 0.25, pal.ear);
    // eyes (blink occasionally)
    const blink = frame === 3;
    const eyeY = cy - s * 0.16;
    if (blink) {
      px(ctx, cx - s * 0.05, eyeY, s * 0.04, s * 0.008, pal.pupil);
      px(ctx, cx + s * 0.01, eyeY, s * 0.04, s * 0.008, pal.pupil);
    } else {
      circ(ctx, cx - s * 0.04, eyeY, s * 0.03, pal.eye);
      circ(ctx, cx + s * 0.04, eyeY, s * 0.03, pal.eye);
      circ(ctx, cx - s * 0.04, eyeY, s * 0.015, pal.pupil);
      circ(ctx, cx + s * 0.04, eyeY, s * 0.015, pal.pupil);
    }
    circ(ctx, cx, cy - s * 0.135, s * 0.012, pal.nose);
  } else {
    // sleeping
    const breathe = Math.sin(frameOffset * Math.PI * 2) * s * 0.01;
    const cy = y + s * 0.02;
    // shadow
    circ(ctx, cx, cy + s * 0.04, s * 0.20, 'rgba(0,0,0,0.12)');
    // curled body (oval)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.16 + breathe, s * 0.10, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.body;
    ctx.fill();
    ctx.restore();
    // belly
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.02, cy + s * 0.02, s * 0.10, s * 0.06, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = pal.belly;
    ctx.globalAlpha = 0.4;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    // tail wrapping around
    ctx.beginPath();
    ctx.arc(cx - s * 0.10, cy - s * 0.02, s * 0.06, 0, Math.PI * 1.6);
    ctx.strokeStyle = pal.body;
    ctx.lineWidth = s * 0.025;
    ctx.stroke();
    // head tucked
    circ(ctx, cx + s * 0.10, cy - s * 0.06, s * 0.09, pal.head);
    // closed eyes (zzz)
    px(ctx, cx + s * 0.06, cy - s * 0.07, s * 0.03, s * 0.006, pal.pupil);
    px(ctx, cx + s * 0.12, cy - s * 0.07, s * 0.03, s * 0.006, pal.pupil);
    // ear
    px(ctx, cx + s * 0.08, cy - s * 0.14, s * 0.04, s * 0.04, pal.ear);
    // zzz bubbles
    const zPhase = (frameOffset * 2) % 1;
    ctx.globalAlpha = 0.4 - zPhase * 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(s * 0.08)}px sans-serif`;
    ctx.fillText('z', cx + s * 0.18, cy - s * 0.10 - zPhase * s * 0.06);
    ctx.font = `${Math.round(s * 0.06)}px sans-serif`;
    ctx.fillText('z', cx + s * 0.22, cy - s * 0.16 - zPhase * s * 0.04);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** Render a building sprite to an offscreen canvas for use as a thumbnail in the build UI.
 *  Returns a canvas element or null if no drawer exists. Cached by type+biome. */
const _thumbCache = new Map();
export function drawBuildingThumbnail(type, biome = 'grasslands', size = 48) {
  const key = `${type}_${biome}_${size}`;
  if (_thumbCache.has(key)) return _thumbCache.get(key);

  if (typeof document === 'undefined') return null;

  const ui = getBuildingUi(type);
  ui._biome = biome;

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const sizeDef = BUILDING_SIZES[type] || { width: 1, height: 1 };
  const bw = sizeDef.width;
  const bh = sizeDef.height;
  const maxDim = Math.max(bw, bh);
  const tileSize = (size * 0.85) / maxDim;
  const w = tileSize * bw;
  const h = tileSize * bh;
  const ox = (size - w) / 2;
  const oy = (size - h) / 2 + size * 0.05; // slight down offset for shadow room

  // Try Cute Fantasy sprites first (renders actual building art)
  if (drawCuteFantasyBuilding(ctx, type, ox, oy, w, h)) {
    _thumbCache.set(key, canvas);
    return canvas;
  }

  const drawer = SPRITE_DRAWERS[type];
  if (drawer) {
    drawer(ctx, ox, oy, w, h, ui, tileSize);
  } else {
    // fallback
    castShadow(ctx, ox + 2, oy + h * 0.13, w - 4, h * 0.72);
    px(ctx, ox + 2, oy + h * 0.15, w - 4, h * 0.70, ui.wallColor);
    shadedRoof(ctx, ox, oy + h * 0.18, ox + w / 2, oy + h * 0.02, ox + w, oy + h * 0.18, ui.roofColor);
  }

  _thumbCache.set(key, canvas);
  return canvas;
}

export function renderBuildingThumbnail(canvas, type, biome = 'grasslands', size = 48) {
  if (!canvas) return;
  const source = drawBuildingThumbnail(type, biome, size);
  const ctx = canvas.getContext('2d');
  if (!ctx || !source) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(size * dpr);
  const height = Math.round(size * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
}

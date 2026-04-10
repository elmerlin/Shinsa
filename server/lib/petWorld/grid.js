const { generateExpansionChunk } = require('./biomes');

const OBSTACLE_TILES = new Set(['water', 'rock', 'tree', 'bush']);

function parseGridData(gridData) {
  if (!gridData) return { v: 1, w: 12, h: 12, tiles: [] };
  if (typeof gridData === 'object') return gridData;
  try {
    const parsed = JSON.parse(gridData);
    return parsed && typeof parsed === 'object' ? parsed : { v: 1, w: 12, h: 12, tiles: [] };
  } catch {
    return { v: 1, w: 12, h: 12, tiles: [] };
  }
}

function serializeGridData(grid) {
  return JSON.stringify(grid);
}

function cloneGrid(grid) {
  return {
    v: grid.v,
    w: grid.w,
    h: grid.h,
    tiles: grid.tiles.map((row) => row.map((tile) => ({ ...tile }))),
    features: grid.features ? grid.features.map((f) => ({ ...f })) : [],
  };
}

function isObstacleTile(type) {
  return OBSTACLE_TILES.has(type);
}

function isWaterTile(type) {
  return type === 'water';
}

function canPlace(grid, x, y, width, height, options = {}) {
  const { requiresAdjacentWater = false } = options;
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      const tile = grid.tiles[y + dy]?.[x + dx];
      if (!tile) return false;
      if (tile.b != null) return false;
      if (isObstacleTile(tile.t)) return false;
    }
  }
  if (!requiresAdjacentWater) return true;
  for (let dy = -1; dy <= height; dy += 1) {
    for (let dx = -1; dx <= width; dx += 1) {
      const outsideFootprint = dx < 0 || dy < 0 || dx >= width || dy >= height;
      if (!outsideFootprint) continue;
      const tile = grid.tiles[y + dy]?.[x + dx];
      if (tile && isWaterTile(tile.t)) return true;
    }
  }
  return false;
}

function setBuildingOccupancy(grid, buildingId, x, y, width, height) {
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      if (grid.tiles[y + dy]?.[x + dx]) grid.tiles[y + dy][x + dx].b = buildingId;
    }
  }
}

function clearBuildingOccupancy(grid, buildingId) {
  for (const row of grid.tiles) {
    for (const tile of row) {
      if (tile.b === buildingId) tile.b = null;
    }
  }
}

function getAdjacentEdge(grid, direction) {
  if (direction === 'n') return (grid.tiles[0] || []).map((tile) => tile.t);
  if (direction === 's') return (grid.tiles[grid.h - 1] || []).map((tile) => tile.t);
  if (direction === 'w') return grid.tiles.map((row) => row[0]?.t || 'grass');
  return grid.tiles.map((row) => row[grid.w - 1]?.t || 'grass');
}

function expandGrid(grid, biome, direction, expansionIndex) {
  const next = cloneGrid(grid);
  let width = 0;
  let height = 0;
  if (direction === 'n' || direction === 's') {
    width = next.w;
    height = 6;
  } else {
    width = 6;
    height = next.h;
  }
  const newWidth = direction === 'e' || direction === 'w' ? next.w + 6 : next.w;
  const newHeight = direction === 'n' || direction === 's' ? next.h + 6 : next.h;
  if (newWidth > 30 || newHeight > 30) {
    throw new Error('Expansion would exceed the 30x30 cap');
  }
  const chunk = generateExpansionChunk({
    biome,
    direction,
    expansionIndex,
    width,
    height,
    adjacentEdge: getAdjacentEdge(next, direction),
  });

  let shiftX = 0;
  let shiftY = 0;
  if (direction === 'n') {
    next.tiles = [...chunk, ...next.tiles];
    next.h += 6;
    shiftY = 6;
  } else if (direction === 's') {
    next.tiles = [...next.tiles, ...chunk];
    next.h += 6;
  } else if (direction === 'w') {
    next.tiles = next.tiles.map((row, index) => [...chunk[index], ...row]);
    next.w += 6;
    shiftX = 6;
  } else if (direction === 'e') {
    next.tiles = next.tiles.map((row, index) => [...row, ...chunk[index]]);
    next.w += 6;
  } else {
    throw new Error('Invalid expansion direction');
  }

  return {
    grid: next,
    shiftX,
    shiftY,
  };
}

module.exports = {
  parseGridData,
  serializeGridData,
  cloneGrid,
  isObstacleTile,
  isWaterTile,
  canPlace,
  setBuildingOccupancy,
  clearBuildingOccupancy,
  expandGrid,
};

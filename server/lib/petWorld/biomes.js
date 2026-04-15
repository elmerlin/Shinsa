const DEFAULT_STARTER_HOUSE = { x: 4, y: 4, width: 2, height: 2 };

const BIOMES = {
  grasslands: {
    id: 'grasslands',
    name: 'Grasslands',
    specialty: 'food',
    liquid: 'water',
    grounds: ['grass', 'grass-flower', 'grass-soft'],
    expansionProfile: { water: 0.1, tree: 0.12, rock: 0.07, bush: 0.04 },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    specialty: 'wood',
    liquid: 'water',
    grounds: ['forest-floor', 'forest-moss', 'forest-glade'],
    expansionProfile: { water: 0.08, tree: 0.18, rock: 0.06, bush: 0.05 },
  },
  coastal: {
    id: 'coastal',
    name: 'Coastal',
    specialty: 'food',
    liquid: 'water',
    grounds: ['sand', 'sand-shell', 'coastal-grass'],
    expansionProfile: { water: 0.16, tree: 0.06, rock: 0.05, bush: 0.04 },
  },
  mountain: {
    id: 'mountain',
    name: 'Mountain',
    specialty: 'stone',
    liquid: 'water',
    grounds: ['stone-ground', 'stone-dust', 'highland-grass'],
    expansionProfile: { water: 0.05, tree: 0.06, rock: 0.17, bush: 0.03 },
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    specialty: 'gold',
    liquid: 'water',
    grounds: ['sand', 'sand-ripple', 'desert-ruin'],
    expansionProfile: { water: 0.05, tree: 0.04, rock: 0.08, bush: 0.03 },
  },
  tropical: {
    id: 'tropical',
    name: 'Tropical',
    specialty: 'cloth',
    liquid: 'water',
    grounds: ['tropical-grass', 'tropical-flower', 'lagoon-edge'],
    expansionProfile: { water: 0.12, tree: 0.12, rock: 0.05, bush: 0.07 },
  },
  tundra: {
    id: 'tundra',
    name: 'Tundra',
    specialty: 'stone',
    liquid: 'water',
    grounds: ['snow', 'snow-drift', 'ice-crust'],
    expansionProfile: { water: 0.08, tree: 0.08, rock: 0.11, bush: 0.03 },
  },
  volcanic: {
    id: 'volcanic',
    name: 'Volcanic',
    specialty: 'gold',
    liquid: 'water',
    grounds: ['ash', 'ash-ember', 'obsidian-dust'],
    expansionProfile: { water: 0.05, tree: 0.03, rock: 0.14, bush: 0.02 },
  },
};

const BIOME_STARTER_LAYOUTS = {
  grasslands: {
    water: [[10, 1], [10, 2], [10, 3]],
    trees: [[0, 0], [1, 7], [3, 10], [8, 0], [9, 9], [0, 5]],
    rocks: [[1, 10], [8, 10], [11, 7]],
    bushes: [[3, 1], [7, 9], [9, 5], [2, 6]],
    decor: [[0, 3], [1, 3], [5, 0], [6, 0], [8, 8], [9, 8], [5, 11], [6, 11], [7, 11]],
    features: [{ type: 'pond', x: 9, y: 0, w: 3, h: 4 }, { type: 'grove', x: 0, y: 4, w: 3, h: 4 }],
  },
  forest: {
    water: [[11, 5], [11, 6]],
    trees: [[0, 0], [0, 2], [1, 1], [1, 8], [2, 10], [3, 0], [7, 0], [8, 11], [9, 10], [10, 0], [11, 9]],
    rocks: [[0, 10], [5, 0], [10, 10]],
    bushes: [[2, 3], [3, 7], [6, 9], [8, 2], [10, 6]],
    decor: [[1, 4], [2, 5], [4, 11], [5, 11], [9, 1], [10, 2], [7, 8], [8, 8], [0, 8]],
    features: [{ type: 'grove', x: 0, y: 0, w: 4, h: 3 }, { type: 'grove', x: 8, y: 9, w: 4, h: 3 }],
  },
  coastal: {
    water: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [0, 1], [1, 1], [11, 1]],
    trees: [[3, 3], [7, 8], [10, 4]],
    rocks: [[1, 3], [9, 2], [11, 6]],
    bushes: [[2, 5], [6, 10], [8, 3]],
    decor: [[2, 2], [3, 2], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [4, 11], [5, 11]],
    features: [{ type: 'pond', x: 0, y: 0, w: 12, h: 2 }, { type: 'reed', x: 2, y: 2, w: 3, h: 1 }],
  },
  mountain: {
    water: [[0, 8], [0, 9]],
    trees: [[2, 0], [5, 10], [10, 2]],
    rocks: [[0, 0], [0, 1], [1, 0], [1, 11], [3, 9], [8, 0], [9, 0], [10, 10], [11, 8], [11, 9], [11, 0]],
    bushes: [[4, 2], [7, 7]],
    decor: [[2, 2], [3, 2], [9, 8], [10, 8], [6, 0], [7, 0], [5, 5], [6, 5], [7, 5]],
    features: [{ type: 'quarry', x: 0, y: 0, w: 3, h: 2 }, { type: 'quarry', x: 9, y: 8, w: 3, h: 3 }],
  },
  desert: {
    water: [[5, 9], [5, 10], [6, 9], [6, 10]],
    trees: [[2, 8], [7, 10]],
    rocks: [[0, 0], [1, 5], [3, 11], [9, 1], [11, 4], [11, 11]],
    bushes: [[0, 7], [4, 2], [10, 8]],
    decor: [[4, 9], [7, 9], [4, 11], [7, 11], [2, 2], [3, 2], [8, 5], [9, 5], [0, 3]],
    features: [{ type: 'pond', x: 4, y: 8, w: 4, h: 4 }],
  },
  tropical: {
    water: [[0, 10], [0, 11], [1, 11], [10, 0], [11, 0], [11, 1]],
    trees: [[0, 1], [1, 3], [2, 9], [3, 0], [7, 11], [9, 2], [10, 8], [11, 5]],
    rocks: [[5, 0], [8, 10]],
    bushes: [[1, 6], [3, 3], [4, 8], [6, 2], [8, 6], [10, 4], [2, 11]],
    decor: [[0, 4], [1, 4], [4, 0], [5, 0], [9, 9], [10, 9], [6, 6], [7, 6], [8, 7]],
    features: [{ type: 'pond', x: 0, y: 10, w: 2, h: 2 }, { type: 'flower', x: 5, y: 5, w: 4, h: 4 }],
  },
  tundra: {
    water: [[9, 0], [10, 0], [9, 1]],
    trees: [[1, 2], [4, 9], [8, 3], [11, 7]],
    rocks: [[0, 0], [0, 6], [2, 11], [3, 4], [6, 0], [7, 10], [10, 5], [11, 10], [11, 11]],
    bushes: [[2, 7], [5, 3]],
    decor: [[1, 1], [2, 1], [8, 8], [9, 8], [5, 5], [6, 5], [3, 10], [4, 10], [10, 3]],
    features: [{ type: 'quarry', x: 0, y: 0, w: 3, h: 2 }, { type: 'quarry', x: 10, y: 9, w: 2, h: 3 }],
  },
  volcanic: {
    water: [[0, 5], [0, 6], [1, 5]],
    trees: [[3, 9], [9, 2]],
    rocks: [[0, 0], [0, 11], [1, 1], [2, 8], [4, 0], [6, 11], [8, 0], [10, 7], [11, 3], [11, 10], [11, 11]],
    bushes: [[3, 3], [7, 8]],
    decor: [[1, 6], [2, 6], [5, 1], [6, 1], [9, 9], [10, 9], [4, 5], [5, 5], [8, 4]],
    features: [{ type: 'pond', x: 0, y: 4, w: 2, h: 3 }, { type: 'quarry', x: 10, y: 9, w: 2, h: 3 }],
  },
};

function getStarterLayout(biome) {
  return BIOME_STARTER_LAYOUTS[biome] || BIOME_STARTER_LAYOUTS.grasslands;
}

function hashSeed(input) {
  let h = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getBiomeDef(biome) {
  return BIOMES[biome] || BIOMES.grasslands;
}

function buildGroundTile(def, index, x, y) {
  const grounds = def.grounds || ['grass'];
  return grounds[(index + x + y) % grounds.length] || grounds[0];
}

function createStarterGrid(biome) {
  const def = getBiomeDef(biome);
  const layout = getStarterLayout(biome);
  const tiles = [];
  for (let y = 0; y < 12; y += 1) {
    const row = [];
    for (let x = 0; x < 12; x += 1) {
      row.push({ t: buildGroundTile(def, 0, x, y), b: null });
    }
    tiles.push(row);
  }

  (layout.decor || []).forEach(([x, y], index) => {
    if (tiles[y]?.[x]) tiles[y][x].t = buildGroundTile(def, index + 1, x, y);
  });
  (layout.water || []).forEach(([x, y]) => {
    if (tiles[y]?.[x]) tiles[y][x].t = 'water';
  });
  (layout.trees || []).forEach(([x, y]) => {
    if (tiles[y]?.[x]) tiles[y][x].t = 'tree';
  });
  (layout.rocks || []).forEach(([x, y]) => {
    if (tiles[y]?.[x]) tiles[y][x].t = 'rock';
  });
  (layout.bushes || []).forEach(([x, y]) => {
    if (tiles[y]?.[x]) tiles[y][x].t = 'bush';
  });

  return {
    v: 1,
    w: 12,
    h: 12,
    tiles,
    features: layout.features || [],
  };
}

function isObstacle(tileType) {
  return ['water', 'tree', 'rock', 'bush', 'stump'].includes(tileType);
}

function directionBias(biome, direction = 'e') {
  const biasTable = {
    grasslands: { n: { water: 0.02, tree: 0.04, rock: 0.02, bush: 0.02 }, s: { water: 0.06, tree: 0.02, rock: 0.01, bush: 0.03 }, e: { water: 0.03, tree: 0.03, rock: 0.02, bush: 0.01 }, w: { water: 0.02, tree: 0.03, rock: 0.01, bush: 0.04 } },
    forest: { n: { water: 0.01, tree: 0.06, rock: 0.02, bush: 0.03 }, s: { water: 0.03, tree: 0.05, rock: 0.01, bush: 0.03 }, e: { water: 0.02, tree: 0.04, rock: 0.03, bush: 0.02 }, w: { water: 0.01, tree: 0.06, rock: 0.01, bush: 0.04 } },
    coastal: { n: { water: 0.08, tree: 0.01, rock: 0.02, bush: 0.01 }, s: { water: 0.04, tree: 0.02, rock: 0.02, bush: 0.02 }, e: { water: 0.06, tree: 0.01, rock: 0.03, bush: 0.01 }, w: { water: 0.06, tree: 0.02, rock: 0.01, bush: 0.02 } },
    mountain: { n: { water: 0.01, tree: 0.02, rock: 0.08, bush: 0 }, s: { water: 0.03, tree: 0.03, rock: 0.05, bush: 0.01 }, e: { water: 0.02, tree: 0.01, rock: 0.07, bush: 0.01 }, w: { water: 0.01, tree: 0.02, rock: 0.06, bush: 0.01 } },
    desert: { n: { water: 0.01, tree: 0.01, rock: 0.04, bush: 0.01 }, s: { water: 0.03, tree: 0.02, rock: 0.03, bush: 0.02 }, e: { water: 0.02, tree: 0.01, rock: 0.05, bush: 0.01 }, w: { water: 0.01, tree: 0.02, rock: 0.04, bush: 0.02 } },
    tropical: { n: { water: 0.04, tree: 0.04, rock: 0.01, bush: 0.04 }, s: { water: 0.05, tree: 0.03, rock: 0.01, bush: 0.04 }, e: { water: 0.03, tree: 0.05, rock: 0.02, bush: 0.03 }, w: { water: 0.04, tree: 0.04, rock: 0.01, bush: 0.05 } },
    tundra: { n: { water: 0.03, tree: 0.02, rock: 0.06, bush: 0.01 }, s: { water: 0.04, tree: 0.03, rock: 0.04, bush: 0.01 }, e: { water: 0.02, tree: 0.02, rock: 0.06, bush: 0.01 }, w: { water: 0.03, tree: 0.03, rock: 0.05, bush: 0.01 } },
    volcanic: { n: { water: 0.02, tree: 0.01, rock: 0.07, bush: 0 }, s: { water: 0.03, tree: 0.01, rock: 0.06, bush: 0.01 }, e: { water: 0.01, tree: 0.01, rock: 0.08, bush: 0.01 }, w: { water: 0.02, tree: 0.02, rock: 0.07, bush: 0 } },
  };
  const biomeBias = biasTable[biome] || biasTable.grasslands;
  return biomeBias[direction] || { water: 0, tree: 0, rock: 0, bush: 0 };
}

function blendEdgeTile(def, neighborType, x, y) {
  if (!neighborType) return buildGroundTile(def, 2, x, y);
  if (isObstacle(neighborType)) return neighborType;
  return neighborType;
}

function createMask(width, height, initial = false) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => initial));
}

function seamDistance(direction, x, y, width, height) {
  if (direction === 'n') return height - 1 - y;
  if (direction === 's') return y;
  if (direction === 'w') return width - 1 - x;
  return x;
}

function stampEllipse(mask, cx, cy, rx, ry) {
  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[0].length; x += 1) {
      const nx = rx <= 0 ? 0 : (x - cx) / rx;
      const ny = ry <= 0 ? 0 : (y - cy) / ry;
      if ((nx * nx) + (ny * ny) <= 1) {
        mask[y][x] = true;
      }
    }
  }
}

function countMaskNeighbors(mask, x, y) {
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      if (mask[y + oy]?.[x + ox]) count += 1;
    }
  }
  return count;
}

function smoothMask(mask, passes = 1, survive = 3, birth = 4) {
  let next = mask.map((row) => [...row]);
  for (let pass = 0; pass < passes; pass += 1) {
    const current = next.map((row) => [...row]);
    next = current.map((row, y) => row.map((filled, x) => {
      const neighbors = countMaskNeighbors(current, x, y);
      if (filled) return neighbors >= survive;
      return neighbors >= birth;
    }));
  }
  return next;
}

function collectRuns(adjacentEdge, predicate) {
  const runs = [];
  let start = null;
  for (let i = 0; i <= adjacentEdge.length; i += 1) {
    const match = i < adjacentEdge.length && predicate(adjacentEdge[i]);
    if (match && start == null) start = i;
    if (!match && start != null) {
      runs.push({ start, end: i - 1 });
      start = null;
    }
  }
  return runs;
}

function paintDirectionalCell(mask, direction, major, depth) {
  const height = mask.length;
  const width = mask[0].length;
  let x = 0;
  let y = 0;
  if (direction === 'n') {
    x = major;
    y = height - 1 - depth;
  } else if (direction === 's') {
    x = major;
    y = depth;
  } else if (direction === 'w') {
    x = width - 1 - depth;
    y = major;
  } else {
    x = depth;
    y = major;
  }
  if (mask[y]?.[x] != null) mask[y][x] = true;
}

function applyEdgeWaterContinuations(mask, adjacentEdge, direction, rng) {
  const runs = collectRuns(adjacentEdge, (type) => type === 'water');
  runs.forEach(({ start, end }) => {
    const runLength = end - start + 1;
    const depth = Math.min(direction === 'n' || direction === 's' ? mask.length : mask[0].length, 2 + Math.floor(runLength / 4) + Math.floor(rng() * 2));
    for (let major = Math.max(0, start - 1); major <= Math.min(adjacentEdge.length - 1, end + 1); major += 1) {
      for (let d = 0; d < depth; d += 1) {
        paintDirectionalCell(mask, direction, major, d);
        if (runLength >= 3 && d < depth - 1 && major > 0) paintDirectionalCell(mask, direction, major - 1, d);
        if (runLength >= 3 && d < depth - 1 && major < adjacentEdge.length - 1) paintDirectionalCell(mask, direction, major + 1, d);
      }
    }
  });
}

function addPatchCluster(mask, count, direction, rng, options = {}) {
  const height = mask.length;
  const width = mask[0].length;
  const horizontal = direction === 'n' || direction === 's';
  const majorLength = horizontal ? width : height;
  const minorLength = horizontal ? height : width;
  const {
    majorRadius = 2.6,
    minorRadius = 1.4,
    majorJitter = 2.2,
    depthMin = 1.5,
    depthMax = minorLength - 1.2,
  } = options;
  for (let i = 0; i < count; i += 1) {
    const major = 1 + rng() * Math.max(1, majorLength - 2);
    const depth = depthMin + rng() * Math.max(0.5, depthMax - depthMin);
    const cx = horizontal ? major : (direction === 'w' ? width - 1 - depth : depth);
    const cy = horizontal ? (direction === 'n' ? height - 1 - depth : depth) : major;
    stampEllipse(
      mask,
      cx + (rng() - 0.5) * majorJitter,
      cy + (rng() - 0.5) * 0.8,
      majorRadius + rng() * 1.6,
      minorRadius + rng() * 0.9,
    );
  }
}

function hasNearbyTile(mask, x, y, radius = 1) {
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (mask[y + oy]?.[x + ox]) return true;
    }
  }
  return false;
}

function countMaskNeighbors(mask, x, y, radius = 1) {
  let count = 0;
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      if (mask[y + oy]?.[x + ox]) count += 1;
    }
  }
  return count;
}

function generateExpansionChunk({ biome, direction, expansionIndex, width, height, adjacentEdge = [] }) {
  const def = getBiomeDef(biome);
  const rng = mulberry32(hashSeed(`${biome}:${direction}:${expansionIndex}`));
  const bias = directionBias(biome, direction);
  const profile = def.expansionProfile;
  const tiles = [];
  for (let y = 0; y < height; y += 1) {
    const row = [];
    for (let x = 0; x < width; x += 1) {
      let tileType = buildGroundTile(def, expansionIndex, x, y);
      const edgeNeighbor = direction === 'n' || direction === 's' ? adjacentEdge[x] : adjacentEdge[y];
      if ((direction === 'n' && y === height - 1)
        || (direction === 's' && y === 0)
        || (direction === 'w' && x === width - 1)
        || (direction === 'e' && x === 0)) {
        tileType = blendEdgeTile(def, edgeNeighbor, x, y);
      }
      row.push({ t: tileType, b: null });
    }
    tiles.push(row);
  }

  const waterMask = createMask(width, height);
  applyEdgeWaterContinuations(waterMask, adjacentEdge, direction, rng);
  const extraWaterPatches = Math.max(0, Math.round((profile.water + bias.water) * 10) - 1);
  addPatchCluster(waterMask, extraWaterPatches, direction, rng, {
    majorRadius: 2.4,
    minorRadius: 1.2,
    majorJitter: 2.8,
    depthMin: 2,
    depthMax: Math.max(2.5, (direction === 'n' || direction === 's' ? height : width) - 0.6),
  });
  const smoothedWater = smoothMask(waterMask, 1, 3, 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (smoothedWater[y][x]) {
        tiles[y][x].t = 'water';
      } else if (!isObstacle(tiles[y][x].t)) {
        const seam = seamDistance(direction, x, y, width, height);
        tiles[y][x].t = buildGroundTile(def, expansionIndex + seam + ((x + y) % 3), x, y);
      }
    }
  }

  const area = width * height;
  const treeMask = createMask(width, height);
  const rockMask = createMask(width, height);
  const bushMask = createMask(width, height);
  const treePatches = Math.max(1, Math.round((profile.tree + bias.tree) * area / 14));
  const rockPatches = Math.max(1, Math.round((profile.rock + bias.rock) * area / 18));
  const bushPatches = Math.max(1, Math.round((profile.bush + bias.bush) * area / 16));
  addPatchCluster(treeMask, treePatches, direction, rng, {
    majorRadius: 2.2,
    minorRadius: 1.4,
    majorJitter: 2.4,
    depthMin: 1.8,
    depthMax: Math.max(2.2, (direction === 'n' || direction === 's' ? height : width) - 0.8),
  });
  addPatchCluster(rockMask, rockPatches, direction, rng, {
    majorRadius: 1.6,
    minorRadius: 1.1,
    majorJitter: 2,
    depthMin: 1.5,
    depthMax: Math.max(2, (direction === 'n' || direction === 's' ? height : width) - 0.6),
  });
  addPatchCluster(bushMask, bushPatches, direction, rng, {
    majorRadius: 1.4,
    minorRadius: 0.9,
    majorJitter: 2.8,
    depthMin: 1.5,
    depthMax: Math.max(2, (direction === 'n' || direction === 's' ? height : width) - 0.7),
  });
  const smoothedTrees = smoothMask(treeMask, 1, 3, 4);
  const smoothedRocks = smoothMask(rockMask, 1, 4, 5);
  const smoothedBushes = smoothMask(bushMask, 1, 3, 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (tiles[y][x].t === 'water') continue;
      const seam = seamDistance(direction, x, y, width, height);
      if (seam <= 0) continue;
      if (hasNearbyTile(smoothedWater, x, y, 1)) continue;
      const treeDensity = countMaskNeighbors(smoothedTrees, x, y, 1);
      const rockDensity = countMaskNeighbors(smoothedRocks, x, y, 1);
      if (smoothedRocks[y][x] && seam >= 1) {
        tiles[y][x].t = 'rock';
      } else if (smoothedTrees[y][x] && seam >= 1) {
        const edgeForest = treeDensity >= 2 && treeDensity <= 4;
        if (edgeForest && seam >= 2 && hashSeed(`${biome}:${direction}:${expansionIndex}:stump:${x}:${y}`) % 11 === 0) {
          tiles[y][x].t = 'stump';
        } else {
          tiles[y][x].t = 'tree';
        }
      } else if (smoothedBushes[y][x] && seam >= 1 && !hasNearbyTile(smoothedTrees, x, y, 0) && !hasNearbyTile(smoothedRocks, x, y, 0)) {
        tiles[y][x].t = 'bush';
      } else if (rockDensity >= 4 && seam >= 2 && hashSeed(`${biome}:${direction}:${expansionIndex}:bush:${x}:${y}`) % 9 === 0) {
        tiles[y][x].t = 'bush';
      }
    }
  }

  // Post-generation pass: remove ALL obstacles adjacent to water.
  // Trees, rocks, bushes on shorelines look unnatural and block visual transitions.
  for (let y2 = 0; y2 < height; y2 += 1) {
    for (let x2 = 0; x2 < width; x2 += 1) {
      const tt = tiles[y2][x2].t;
      if (tt !== 'tree' && tt !== 'bush' && tt !== 'rock' && tt !== 'stump') continue;
      let adjacentWater = false;
      for (let dy = -1; dy <= 1 && !adjacentWater; dy += 1) {
        for (let dx = -1; dx <= 1 && !adjacentWater; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const ny = y2 + dy;
          const nx = x2 + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width && tiles[ny][nx].t === 'water') {
            adjacentWater = true;
          }
        }
      }
      if (adjacentWater) {
        tiles[y2][x2].t = 'ground';
      }
    }
  }

  return tiles;
}

module.exports = {
  BIOMES,
  DEFAULT_STARTER_HOUSE,
  getBiomeDef,
  getStarterLayout,
  createStarterGrid,
  generateExpansionChunk,
};

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
  return ['water', 'tree', 'rock', 'bush'].includes(tileType);
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
      const roll = rng();
      const waterChance = profile.water + bias.water;
      const treeChance = waterChance + profile.tree + bias.tree;
      const rockChance = treeChance + profile.rock + bias.rock;
      const bushChance = rockChance + profile.bush + bias.bush;
      if (!isObstacle(tileType)) {
        if (roll < waterChance) tileType = 'water';
        else if (roll < treeChance) tileType = 'tree';
        else if (roll < rockChance) tileType = 'rock';
        else if (roll < bushChance) tileType = 'bush';
      }
      row.push({ t: tileType, b: null });
    }
    tiles.push(row);
  }

  // Post-generation pass: remove ALL obstacles adjacent to water.
  // Trees, rocks, bushes on shorelines look unnatural and block visual transitions.
  for (let y2 = 0; y2 < height; y2 += 1) {
    for (let x2 = 0; x2 < width; x2 += 1) {
      const tt = tiles[y2][x2].t;
      if (tt !== 'tree' && tt !== 'bush' && tt !== 'rock') continue;
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

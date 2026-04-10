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

const STARTER_LAYOUT = {
  water: [[10, 1], [10, 2], [10, 3]],
  trees: [[1, 1], [2, 8], [3, 10], [8, 1], [9, 9], [1, 6], [10, 10]],
  rocks: [[1, 10], [2, 2], [8, 10], [10, 7], [6, 1]],
  bushes: [[3, 2], [7, 9], [9, 5]],
  decor: [[0, 4], [1, 4], [2, 4], [8, 8], [9, 8], [10, 8], [5, 9], [6, 9], [7, 9]],
};

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
  const tiles = [];
  for (let y = 0; y < 12; y += 1) {
    const row = [];
    for (let x = 0; x < 12; x += 1) {
      row.push({ t: buildGroundTile(def, 0, x, y), b: null });
    }
    tiles.push(row);
  }

  STARTER_LAYOUT.decor.forEach(([x, y], index) => {
    if (tiles[y]?.[x]) tiles[y][x].t = buildGroundTile(def, index + 1, x, y);
  });
  STARTER_LAYOUT.water.forEach(([x, y]) => {
    if (tiles[y]?.[x]) tiles[y][x].t = 'water';
  });
  STARTER_LAYOUT.trees.forEach(([x, y]) => {
    if (tiles[y]?.[x]) tiles[y][x].t = 'tree';
  });
  STARTER_LAYOUT.rocks.forEach(([x, y]) => {
    if (tiles[y]?.[x]) tiles[y][x].t = 'rock';
  });
  STARTER_LAYOUT.bushes.forEach(([x, y]) => {
    if (tiles[y]?.[x]) tiles[y][x].t = 'bush';
  });

  return {
    v: 1,
    w: 12,
    h: 12,
    tiles,
  };
}

function isObstacle(tileType) {
  return ['water', 'tree', 'rock', 'bush'].includes(tileType);
}

function directionBias(direction = 'e') {
  switch (direction) {
    case 'n':
      return { water: 0.02, tree: 0.03, rock: 0.05, bush: 0 };
    case 's':
      return { water: 0.06, tree: 0.01, rock: 0.01, bush: 0.01 };
    case 'e':
      return { water: 0.01, tree: 0.02, rock: 0.05, bush: 0.01 };
    case 'w':
      return { water: 0.01, tree: 0.02, rock: 0.01, bush: 0.05 };
    default:
      return { water: 0, tree: 0, rock: 0, bush: 0 };
  }
}

function blendEdgeTile(def, neighborType, x, y) {
  if (!neighborType) return buildGroundTile(def, 2, x, y);
  if (isObstacle(neighborType)) return neighborType;
  return neighborType;
}

function generateExpansionChunk({ biome, direction, expansionIndex, width, height, adjacentEdge = [] }) {
  const def = getBiomeDef(biome);
  const rng = mulberry32(hashSeed(`${biome}:${direction}:${expansionIndex}`));
  const bias = directionBias(direction);
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
  return tiles;
}

module.exports = {
  BIOMES,
  DEFAULT_STARTER_HOUSE,
  getBiomeDef,
  createStarterGrid,
  generateExpansionChunk,
};

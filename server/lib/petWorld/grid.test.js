const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseGridData,
  serializeGridData,
  cloneGrid,
  isObstacleTile,
  canPlace,
  setBuildingOccupancy,
  clearBuildingOccupancy,
  expandGrid,
} = require('./grid');
const { createStarterGrid, BIOMES } = require('./biomes');

function makeGrid(w = 6, h = 6) {
  const tiles = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      row.push({ t: 'grass', b: null });
    }
    tiles.push(row);
  }
  return { v: 1, w, h, tiles };
}

describe('parseGridData', () => {
  it('parses JSON string', () => {
    const grid = makeGrid(3, 3);
    const parsed = parseGridData(JSON.stringify(grid));
    assert.equal(parsed.w, 3);
    assert.equal(parsed.h, 3);
  });
  it('returns object as-is', () => {
    const grid = makeGrid(3, 3);
    const parsed = parseGridData(grid);
    assert.equal(parsed, grid);
  });
  it('returns default for null/empty', () => {
    const parsed = parseGridData(null);
    assert.equal(parsed.w, 12);
  });
});

describe('isObstacleTile', () => {
  it('identifies obstacles', () => {
    assert.ok(isObstacleTile('water'));
    assert.ok(isObstacleTile('tree'));
    assert.ok(isObstacleTile('rock'));
    assert.ok(isObstacleTile('bush'));
  });
  it('non-obstacles return false', () => {
    assert.ok(!isObstacleTile('grass'));
    assert.ok(!isObstacleTile('sand'));
  });
});

describe('canPlace', () => {
  it('allows placement on clear ground', () => {
    const grid = makeGrid();
    assert.ok(canPlace(grid, 0, 0, 2, 2));
  });
  it('rejects out of bounds', () => {
    const grid = makeGrid();
    assert.ok(!canPlace(grid, 5, 5, 2, 2));
  });
  it('rejects obstacle tiles', () => {
    const grid = makeGrid();
    grid.tiles[1][1].t = 'tree';
    assert.ok(!canPlace(grid, 0, 0, 2, 2));
  });
  it('rejects occupied tiles', () => {
    const grid = makeGrid();
    grid.tiles[0][0].b = 1;
    assert.ok(!canPlace(grid, 0, 0, 1, 1));
  });
  it('checks water adjacency when required', () => {
    const grid = makeGrid();
    assert.ok(!canPlace(grid, 2, 2, 2, 1, { requiresAdjacentWater: true }));
    grid.tiles[1][2].t = 'water';
    assert.ok(canPlace(grid, 2, 2, 2, 1, { requiresAdjacentWater: true }));
  });
});

describe('setBuildingOccupancy / clearBuildingOccupancy', () => {
  it('marks and clears building footprint', () => {
    const grid = makeGrid();
    setBuildingOccupancy(grid, 42, 1, 1, 2, 2);
    assert.equal(grid.tiles[1][1].b, 42);
    assert.equal(grid.tiles[2][2].b, 42);
    assert.equal(grid.tiles[0][0].b, null);
    clearBuildingOccupancy(grid, 42);
    assert.equal(grid.tiles[1][1].b, null);
    assert.equal(grid.tiles[2][2].b, null);
  });
});

describe('expandGrid', () => {
  it('expands south', () => {
    const grid = makeGrid(12, 12);
    const { grid: expanded, shiftX, shiftY } = expandGrid(grid, 'grasslands', 's', 1);
    assert.equal(expanded.h, 18);
    assert.equal(expanded.w, 12);
    assert.equal(shiftX, 0);
    assert.equal(shiftY, 0);
  });
  it('expands north with shift', () => {
    const grid = makeGrid(12, 12);
    const { grid: expanded, shiftX, shiftY } = expandGrid(grid, 'grasslands', 'n', 1);
    assert.equal(expanded.h, 18);
    assert.equal(shiftX, 0);
    assert.equal(shiftY, 6);
  });
  it('expands west with shift', () => {
    const grid = makeGrid(12, 12);
    const { grid: expanded, shiftX, shiftY } = expandGrid(grid, 'grasslands', 'w', 1);
    assert.equal(expanded.w, 18);
    assert.equal(shiftX, 6);
    assert.equal(shiftY, 0);
  });
  it('expands east', () => {
    const grid = makeGrid(12, 12);
    const { grid: expanded, shiftX, shiftY } = expandGrid(grid, 'grasslands', 'e', 1);
    assert.equal(expanded.w, 18);
    assert.equal(shiftX, 0);
    assert.equal(shiftY, 0);
  });
  it('rejects expansion beyond 30x30', () => {
    const grid = makeGrid(30, 12);
    assert.throws(() => expandGrid(grid, 'grasslands', 'e', 1), /30x30/);
  });
});

describe('createStarterGrid per biome', () => {
  for (const biome of Object.keys(BIOMES)) {
    it(`creates valid 12x12 grid for ${biome}`, () => {
      const grid = createStarterGrid(biome);
      assert.equal(grid.w, 12);
      assert.equal(grid.h, 12);
      assert.equal(grid.tiles.length, 12);
      assert.equal(grid.tiles[0].length, 12);
      // Starter house location (4,4 2x2) must be clear
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const tile = grid.tiles[4 + dy][4 + dx];
          assert.ok(!isObstacleTile(tile.t), `${biome}: tile (${4+dx},${4+dy}) should be clear, got ${tile.t}`);
        }
      }
    });
  }
});

describe('cloneGrid', () => {
  it('creates deep copy', () => {
    const grid = makeGrid(3, 3);
    grid.tiles[0][0].b = 1;
    const clone = cloneGrid(grid);
    clone.tiles[0][0].b = 2;
    assert.equal(grid.tiles[0][0].b, 1, 'Original should not be modified');
    assert.equal(clone.tiles[0][0].b, 2);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeTerrainGrid } from './petWorldSprites.js';

const G = (b = null) => ({ t: 'ground', b });
const T = (t) => ({ t, b: null });

function countRenderedPathTiles(terrain) {
  let count = 0;
  terrain.forEach((row) => {
    row.forEach((tile) => {
      if (tile?.renderPathBuilding) count += 1;
    });
  });
  return count;
}

const FEEDER_GRID_FIXTURE = {
  w: 7,
  h: 6,
  tiles: [
    [G(), G(), G(), G(), G(), G(), G()],
    [G(), G(), G(1), G(1), G(), G(), G()],
    [G(), G(), G(1), G(1), G(), G(), G()],
    [G(), G(), G(), G(), G(), G(), G()],
    [G(), G(), G(2), G(), G(), G(), G()],
    [G(), G(), G(), G(), G(), G(), G()],
  ],
};

const FEEDER_BUILDINGS_FIXTURE = [
  { id: 1, type: 'house', grid_x: 2, grid_y: 1, width: 2, height: 2 },
  { id: 2, type: 'path', variant: 'dirt' },
];

const COURTYARD_GRID_FIXTURE = {
  w: 15,
  h: 9,
  tiles: [
    [T('tree'), T('stump'), G(81), G(81), G(33), G(33), G(16), G(16), G(15), G(15), G(), G(), G(64), G(6), G()],
    [G(), T('stump'), G(51), G(51), G(30), G(30), G(1), G(1), G(82), G(82), G(82), G(), G(), G(), G()],
    [T('rock'), T('rock'), G(51), G(51), G(30), G(30), G(1), G(1), G(82), G(82), G(82), G(), G(42), G(), T('water')],
    [T('rock'), T('rock'), G(101), G(103), G(102), G(), G(104), G(), G(), G(), G(), G(), G(), G(), T('water')],
    [T('rock'), T('rock'), G(), G(), G(), G(), G(106), G(105), G(108), G(107), G(), G(), G(), G(), T('water')],
    [T('rock'), T('rock'), G(78), G(78), G(29), G(29), G(9), G(9), G(79), G(79), G(), G(), G(), G(), G()],
    [T('rock'), T('rock'), G(78), G(78), G(29), G(29), G(9), G(9), G(79), G(79), G(), G(), G(), G(), G()],
    [G(), G(), G(), G(), G(), G(), G(), G(), G(), G(), G(), G(), G(), G(), G()],
    [T('bush'), T('bush'), G(), G(), G(), G(), G(), G(), G(), G(), G(), G(), T('water'), T('water'), T('water')],
  ],
};

const COURTYARD_BUILDINGS_FIXTURE = [
  { id: 1, type: 'house', grid_x: 6, grid_y: 1, width: 2, height: 2 },
  { id: 6, type: 'woodcutters_hut', grid_x: 13, grid_y: 0, width: 1, height: 1 },
  { id: 9, type: 'house', grid_x: 6, grid_y: 5, width: 2, height: 2 },
  { id: 15, type: 'farm', grid_x: 8, grid_y: 0, width: 2, height: 2 },
  { id: 16, type: 'farm', grid_x: 6, grid_y: 0, width: 2, height: 2 },
  { id: 29, type: 'house', grid_x: 4, grid_y: 5, width: 2, height: 2 },
  { id: 30, type: 'house', grid_x: 4, grid_y: 1, width: 2, height: 2 },
  { id: 33, type: 'farm', grid_x: 4, grid_y: 0, width: 2, height: 2 },
  { id: 42, type: 'stone_pit', grid_x: 12, grid_y: 2, width: 1, height: 1 },
  { id: 51, type: 'house', grid_x: 2, grid_y: 1, width: 2, height: 2 },
  { id: 64, type: 'well', grid_x: 12, grid_y: 0, width: 1, height: 1 },
  { id: 78, type: 'market', grid_x: 2, grid_y: 5, width: 2, height: 2 },
  { id: 79, type: 'weaving_hut', grid_x: 8, grid_y: 5, width: 2, height: 2 },
  { id: 81, type: 'tavern', grid_x: 2, grid_y: 0, width: 2, height: 2 },
  { id: 82, type: 'large_house', grid_x: 8, grid_y: 1, width: 3, height: 2 },
  { id: 101, type: 'path', variant: 'dirt' },
  { id: 102, type: 'path', variant: 'dirt' },
  { id: 103, type: 'path', variant: 'dirt' },
  { id: 104, type: 'path', variant: 'stone' },
  { id: 105, type: 'path', variant: 'stone' },
  { id: 106, type: 'path', variant: 'stone' },
  { id: 107, type: 'path', variant: 'stone' },
  { id: 108, type: 'path', variant: 'stone' },
];

describe('analyzeTerrainGrid render paths', () => {
  it('adds a short feeder from a building edge into a nearby placed path tile', () => {
    const terrain = analyzeTerrainGrid(FEEDER_GRID_FIXTURE, FEEDER_BUILDINGS_FIXTURE);

    assert.equal(terrain[3][2]?.isRenderConnector, true);
    assert.equal(terrain[3][2]?.renderPathVariant, 'dirt');
    assert.equal(terrain[4][2]?.isPathBuilding, true);
    assert.equal(countRenderedPathTiles(terrain), 2);
  });

  it('keeps courtyard grass open instead of inflating a whole plaza from a few path tiles', () => {
    const terrain = analyzeTerrainGrid(COURTYARD_GRID_FIXTURE, COURTYARD_BUILDINGS_FIXTURE);

    assert.equal(terrain[4][3]?.renderPathVariant, 'dirt');
    assert.equal(terrain[4][5]?.renderPathVariant || null, null);
    assert.equal(terrain[5][5]?.renderPathVariant || null, null);
    assert.equal(terrain[7][10]?.renderPathVariant || null, null);
    assert.equal(terrain[3][8]?.renderPathVariant, 'stone');
    assert.equal(countRenderedPathTiles(terrain), 17);
  });

  it('still lets nearby homes and shops get narrow feeders into mixed dirt and stone lanes', () => {
    const terrain = analyzeTerrainGrid(COURTYARD_GRID_FIXTURE, COURTYARD_BUILDINGS_FIXTURE);

    assert.equal(terrain[3][5]?.renderPathVariant, 'dirt');
    assert.equal(terrain[4][2]?.renderPathVariant, 'dirt');
    assert.equal(terrain[3][7]?.renderPathVariant, 'stone');
    assert.equal(terrain[5][10]?.renderPathVariant, 'stone');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeTerrainGrid } from './petWorldSprites.js';

const G = (b = null) => ({ t: 'ground', b });
const T = (t) => ({ t, b: null });

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
  { id: 1, type: 'house' },
  { id: 6, type: 'woodcutters_hut' },
  { id: 9, type: 'house' },
  { id: 15, type: 'farm' },
  { id: 16, type: 'farm' },
  { id: 29, type: 'house' },
  { id: 30, type: 'house' },
  { id: 33, type: 'farm' },
  { id: 42, type: 'stone_pit' },
  { id: 51, type: 'house' },
  { id: 64, type: 'well' },
  { id: 78, type: 'market' },
  { id: 79, type: 'weaving_hut' },
  { id: 81, type: 'tavern' },
  { id: 82, type: 'large_house' },
  { id: 101, type: 'path', variant: 'dirt' },
  { id: 102, type: 'path', variant: 'dirt' },
  { id: 103, type: 'path', variant: 'dirt' },
  { id: 104, type: 'path', variant: 'stone' },
  { id: 105, type: 'path', variant: 'stone' },
  { id: 106, type: 'path', variant: 'stone' },
  { id: 107, type: 'path', variant: 'stone' },
  { id: 108, type: 'path', variant: 'stone' },
];

describe('analyzeTerrainGrid path smoothing', () => {
  it('fills the dirt courtyard gap below the dirt path row', () => {
    const terrain = analyzeTerrainGrid(COURTYARD_GRID_FIXTURE, COURTYARD_BUILDINGS_FIXTURE);
    [2, 3, 4].forEach((x) => {
      assert.equal(
        terrain[4][x]?.renderPathVariant,
        'dirt',
        `expected dirt fill at courtyard cell (${x}, 4)`,
      );
    });
    assert.notEqual(terrain[4][5]?.renderPathVariant || null, null);
  });

  it('keeps the seam between the dirt lane and the stone plaza readable', () => {
    const terrain = analyzeTerrainGrid(COURTYARD_GRID_FIXTURE, COURTYARD_BUILDINGS_FIXTURE);
    assert.equal(terrain[3][5]?.renderPathVariant || null, null);
  });

  it('does not spill the path render into the lower meadow outside the village core', () => {
    const terrain = analyzeTerrainGrid(COURTYARD_GRID_FIXTURE, COURTYARD_BUILDINGS_FIXTURE);
    assert.equal(terrain[7][10]?.renderPathVariant || null, null);
    assert.equal(terrain[7][11]?.renderPathVariant || null, null);
  });
});

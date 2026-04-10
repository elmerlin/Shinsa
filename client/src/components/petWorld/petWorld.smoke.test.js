// Simple smoke tests for Pet World client modules
// Run with: node --test client/src/components/petWorld/petWorld.smoke.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILDING_UI,
  BUILDING_SIZES,
  getBuildingUi,
  getBuildingSize,
  getBuildingLabel,
} from './petWorldBuildings.js';

import {
  BIOME_UI,
  getBiomeUi,
  getTilePalette,
} from './petWorldTiles.js';

import {
  setMuted,
  isMuted,
  startAmbient,
  stopAmbient,
  playBuildSound,
  playClearSound,
  playExpandSound,
  playUpgradeSound,
  playDemolishSound,
  playTradeSound,
  playSelectSound,
  playErrorSound,
  playBreedSound,
} from './petWorldAudio.js';

// ---------------------------------------------------------------------------
// petWorldBuildings.js
// ---------------------------------------------------------------------------
describe('petWorldBuildings smoke', () => {
  it('BUILDING_UI has expected building keys', () => {
    const expectedKeys = [
      'farm', 'house', 'well', 'fishing_hut', 'woodcutters_hut',
      'stone_pit', 'path', 'lumberyard', 'quarry', 'weaving_hut',
      'market', 'large_house', 'garden', 'storehouse', 'trading_post',
      'town_hall', 'bakery', 'shrine', 'park', 'warehouse',
    ];
    for (const key of expectedKeys) {
      assert.ok(BUILDING_UI[key], `BUILDING_UI should have key "${key}"`);
    }
  });

  it('each BUILDING_UI entry has icon, accent, category, roofColor, wallColor', () => {
    for (const [key, ui] of Object.entries(BUILDING_UI)) {
      assert.ok(typeof ui.icon === 'string', `${key}.icon should be a string`);
      assert.ok(typeof ui.accent === 'string', `${key}.accent should be a string`);
      assert.ok(typeof ui.category === 'string', `${key}.category should be a string`);
      assert.ok(typeof ui.roofColor === 'string', `${key}.roofColor should be a string`);
      assert.ok(typeof ui.wallColor === 'string', `${key}.wallColor should be a string`);
    }
  });

  it('BUILDING_SIZES has width/height for every BUILDING_UI key', () => {
    for (const key of Object.keys(BUILDING_UI)) {
      const size = BUILDING_SIZES[key];
      assert.ok(size, `BUILDING_SIZES should have key "${key}"`);
      assert.ok(typeof size.width === 'number' && size.width >= 1, `${key}.width should be >= 1`);
      assert.ok(typeof size.height === 'number' && size.height >= 1, `${key}.height should be >= 1`);
    }
  });

  it('getBuildingUi returns fallback for unknown type', () => {
    const fallback = getBuildingUi('nonexistent_building');
    assert.ok(fallback.icon, 'fallback should have an icon');
    assert.ok(fallback.accent, 'fallback should have an accent');
  });

  it('getBuildingSize returns {1,1} for unknown type', () => {
    const size = getBuildingSize('nonexistent_building');
    assert.deepEqual(size, { width: 1, height: 1 });
  });

  it('getBuildingLabel formats building_type into title case', () => {
    const label = getBuildingLabel({ type: 'fishing_hut' });
    assert.equal(label, 'Fishing Hut');
  });

  it('getBuildingLabel prefers name property', () => {
    const label = getBuildingLabel({ name: 'My Farm', type: 'farm' });
    assert.equal(label, 'My Farm');
  });
});

// ---------------------------------------------------------------------------
// petWorldTiles.js
// ---------------------------------------------------------------------------
describe('petWorldTiles smoke', () => {
  const ALL_BIOMES = [
    'grasslands', 'forest', 'coastal', 'mountain',
    'desert', 'tropical', 'tundra', 'volcanic',
  ];

  const EXPECTED_PALETTE_KEYS = [
    'label', 'badge', 'ground', 'water', 'waterHighlight',
    'tree', 'treeHighlight', 'treeTrunk', 'rock', 'rockHighlight',
    'bush', 'bushDetail', 'pathStone', 'shadow', 'groundDetail',
  ];

  it('BIOME_UI has all 8 biomes', () => {
    for (const biome of ALL_BIOMES) {
      assert.ok(BIOME_UI[biome], `BIOME_UI should have biome "${biome}"`);
    }
    assert.equal(Object.keys(BIOME_UI).length, 8, 'should have exactly 8 biomes');
  });

  it('each biome palette has all expected color keys', () => {
    for (const biome of ALL_BIOMES) {
      const palette = BIOME_UI[biome];
      for (const key of EXPECTED_PALETTE_KEYS) {
        assert.ok(palette[key] !== undefined, `${biome} should have key "${key}"`);
      }
    }
  });

  it('each biome ground is an array of 3 colors', () => {
    for (const biome of ALL_BIOMES) {
      const ground = BIOME_UI[biome].ground;
      assert.ok(Array.isArray(ground), `${biome}.ground should be an array`);
      assert.equal(ground.length, 3, `${biome}.ground should have 3 entries`);
    }
  });

  it('getBiomeUi returns grasslands fallback for unknown biome', () => {
    const fallback = getBiomeUi('nonexistent_biome');
    assert.deepEqual(fallback, BIOME_UI.grasslands);
  });

  it('getTilePalette returns water colors for water tile', () => {
    const p = getTilePalette('grasslands', 'water');
    assert.equal(p.fill, BIOME_UI.grasslands.water);
    assert.equal(p.detail, BIOME_UI.grasslands.waterHighlight);
  });

  it('getTilePalette returns tree colors with trunk for tree tile', () => {
    const p = getTilePalette('forest', 'tree');
    assert.equal(p.fill, BIOME_UI.forest.tree);
    assert.equal(p.detail, BIOME_UI.forest.treeHighlight);
    assert.equal(p.trunk, BIOME_UI.forest.treeTrunk);
  });

  it('getTilePalette returns rock colors for rock tile', () => {
    const p = getTilePalette('mountain', 'rock');
    assert.equal(p.fill, BIOME_UI.mountain.rock);
    assert.equal(p.detail, BIOME_UI.mountain.rockHighlight);
  });

  it('getTilePalette returns bush colors for bush tile', () => {
    const p = getTilePalette('desert', 'bush');
    assert.equal(p.fill, BIOME_UI.desert.bush);
    assert.equal(p.detail, BIOME_UI.desert.bushDetail);
  });
});

// ---------------------------------------------------------------------------
// petWorldAudio.js
// ---------------------------------------------------------------------------
describe('petWorldAudio smoke', () => {
  it('exports all expected functions', () => {
    const exports = {
      setMuted, isMuted,
      startAmbient, stopAmbient,
      playBuildSound, playClearSound, playExpandSound,
      playUpgradeSound, playDemolishSound, playTradeSound,
      playSelectSound, playErrorSound, playBreedSound,
    };
    for (const [name, fn] of Object.entries(exports)) {
      assert.equal(typeof fn, 'function', `should export function "${name}"`);
    }
  });

  it('isMuted returns a boolean', () => {
    const result = isMuted();
    assert.equal(typeof result, 'boolean');
  });

  it('sound functions do not throw without AudioContext (no window)', () => {
    // In Node there is no window/AudioContext, so these should silently no-op
    assert.doesNotThrow(() => playBuildSound());
    assert.doesNotThrow(() => playClearSound());
    assert.doesNotThrow(() => playExpandSound());
    assert.doesNotThrow(() => playUpgradeSound());
    assert.doesNotThrow(() => playDemolishSound());
    assert.doesNotThrow(() => playTradeSound());
    assert.doesNotThrow(() => playSelectSound());
    assert.doesNotThrow(() => playErrorSound());
    assert.doesNotThrow(() => playBreedSound());
  });

  it('startAmbient/stopAmbient do not throw without AudioContext', () => {
    assert.doesNotThrow(() => startAmbient('grasslands'));
    assert.doesNotThrow(() => stopAmbient());
  });
});

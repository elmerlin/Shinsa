import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- petWorldUtils ---
import {
  RESOURCE_ICONS,
  getRingColor,
  getTimingBonus,
  productionRate,
  formatMaterials,
  buildTimeRemaining,
  normalizeUpgradeCost,
} from './petWorldUtils.js';

// --- petWorldBuildings ---
import {
  BUILDING_UI,
  BUILDING_SIZES,
  getBuildingUi,
  getBuildingSize,
  getBuildingLabel,
} from './petWorldBuildings.js';

// --- petWorldTiles ---
import {
  BIOME_UI,
  getBiomeUi,
  getTilePalette,
} from './petWorldTiles.js';

// --- petWorldAudio (import check only -- functions need AudioContext) ---
import * as audio from './petWorldAudio.js';

// ========================================================================
// Timing mechanics
// ========================================================================

describe('getRingColor', () => {
  it('returns red for progress < 0.4', () => {
    assert.equal(getRingColor(0), 'red');
    assert.equal(getRingColor(0.1), 'red');
    assert.equal(getRingColor(0.39), 'red');
  });

  it('returns amber for 0.4 <= progress < 0.65', () => {
    assert.equal(getRingColor(0.4), 'amber');
    assert.equal(getRingColor(0.5), 'amber');
    assert.equal(getRingColor(0.64), 'amber');
  });

  it('returns green for 0.65 <= progress < 0.85', () => {
    assert.equal(getRingColor(0.65), 'green');
    assert.equal(getRingColor(0.75), 'green');
    assert.equal(getRingColor(0.8), 'green');
    assert.equal(getRingColor(0.84), 'green');
  });

  it('returns amber for progress >= 0.85', () => {
    assert.equal(getRingColor(0.85), 'amber');
    assert.equal(getRingColor(0.95), 'amber');
    assert.equal(getRingColor(1), 'amber');
  });

  it('handles boundary values precisely', () => {
    // 0.4 boundary: should flip from red to amber
    assert.equal(getRingColor(0.39999), 'red');
    assert.equal(getRingColor(0.4), 'amber');

    // 0.65 boundary: should flip from amber to green
    assert.equal(getRingColor(0.6499), 'amber');
    assert.equal(getRingColor(0.65), 'green');

    // 0.85 boundary: should flip from green to amber
    assert.equal(getRingColor(0.8499), 'green');
    assert.equal(getRingColor(0.85), 'amber');
  });
});

describe('getTimingBonus', () => {
  it('returns 1.0 for the perfect centre (0.75 - 0.85)', () => {
    assert.equal(getTimingBonus(0.75), 1.0);
    assert.equal(getTimingBonus(0.8), 1.0);
    assert.equal(getTimingBonus(0.85), 1.0);
  });

  it('returns 0.7 for nearby (0.65 - 0.75)', () => {
    assert.equal(getTimingBonus(0.65), 0.7);
    assert.equal(getTimingBonus(0.70), 0.7);
    assert.equal(getTimingBonus(0.7499), 0.7);
  });

  it('returns 0.4 for moderate (0.50 - 0.65)', () => {
    assert.equal(getTimingBonus(0.50), 0.4);
    assert.equal(getTimingBonus(0.60), 0.4);
    assert.equal(getTimingBonus(0.6499), 0.4);
  });

  it('returns 0.1 for a far miss', () => {
    assert.equal(getTimingBonus(0), 0.1);
    assert.equal(getTimingBonus(0.2), 0.1);
    assert.equal(getTimingBonus(0.49), 0.1);
    assert.equal(getTimingBonus(0.86), 0.1);
    assert.equal(getTimingBonus(1), 0.1);
  });

  it('boundary at 0.5 flips from 0.1 to 0.4', () => {
    assert.equal(getTimingBonus(0.499), 0.1);
    assert.equal(getTimingBonus(0.50), 0.4);
  });
});

// ========================================================================
// RESOURCE_ICONS
// ========================================================================

describe('RESOURCE_ICONS', () => {
  it('maps all five resources', () => {
    const expected = ['food', 'wood', 'stone', 'cloth', 'gold'];
    assert.deepEqual(Object.keys(RESOURCE_ICONS).sort(), expected.sort());
  });

  it('each value is a non-empty string', () => {
    for (const [key, val] of Object.entries(RESOURCE_ICONS)) {
      assert.equal(typeof val, 'string', `${key} should be a string`);
      assert.ok(val.length > 0, `${key} should be non-empty`);
    }
  });
});

// ========================================================================
// productionRate
// ========================================================================

describe('productionRate', () => {
  it('returns null when building has no production', () => {
    assert.equal(productionRate({ level: 1, workers: 2 }), null);
  });

  it('computes rate = scaled base * (1 + workers * 0.5) for flat production maps', () => {
    const building = { production: { food: 10 }, level: 2, workers: 3 };
    const result = productionRate(building);
    assert.equal(result.resource, 'food');
    assert.equal(result.rate, 37.5); // 10 * 1.5 * (1 + 1.5)
  });

  it('uses base production even when workers is 0', () => {
    const building = { production: { wood: 8 }, level: 1, workers: 0 };
    const result = productionRate(building);
    assert.equal(result.rate, 8); // 8 * 1.0
  });

  it('defaults level to 1 when missing', () => {
    const building = { production: { stone: 4 }, workers: 2 };
    const result = productionRate(building);
    assert.equal(result.rate, 8); // 4 * (1 + 1.0)
  });

  it('rounds to two decimal places', () => {
    const building = { production: { gold: 3.333 }, level: 1, workers: 1 };
    const result = productionRate(building);
    assert.equal(result.rate, 5); // 3.333 * 1.5 = 4.9995 -> 5
  });

  it('supports nested server preview production objects', () => {
    const building = {
      production: {
        production: { food: 2.25 },
        housing: 0,
        happiness: 0,
      },
      level: 2,
      workers: 1,
    };
    const result = productionRate(building);
    assert.equal(result.resource, 'food');
    assert.equal(result.rate, 3.38); // 2.25 * 1.5
  });
});

// ========================================================================
// formatMaterials
// ========================================================================

describe('formatMaterials', () => {
  it('returns empty string for empty object', () => {
    assert.equal(formatMaterials({}), '');
  });

  it('returns empty string when called without args', () => {
    assert.equal(formatMaterials(), '');
  });

  it('formats known resources with their icons', () => {
    const result = formatMaterials({ food: 10, wood: 5 });
    assert.ok(result.includes('10'));
    assert.ok(result.includes('5'));
    assert.ok(result.includes(RESOURCE_ICONS.food));
    assert.ok(result.includes(RESOURCE_ICONS.wood));
    assert.ok(result.includes(' + '));
  });

  it('skips resources with value 0', () => {
    const result = formatMaterials({ food: 5, wood: 0 });
    assert.ok(!result.includes(RESOURCE_ICONS.wood));
  });

  it('uses the key name as fallback for unknown resources', () => {
    const result = formatMaterials({ mana: 3 });
    assert.ok(result.includes('3 mana'));
  });
});

describe('normalizeUpgradeCost', () => {
  it('supports the client comboCost shape', () => {
    const result = normalizeUpgradeCost({
      comboCost: 15,
      materials: { wood: 3, stone: 0 },
    });
    assert.deepEqual(result, {
      comboCost: 15,
      materials: { wood: 3 },
    });
  });

  it('supports the server combos shape used in pet world payloads', () => {
    const result = normalizeUpgradeCost({
      combos: 22,
      materials: { stone: 5 },
    });
    assert.deepEqual(result, {
      comboCost: 22,
      materials: { stone: 5 },
    });
  });

  it('returns null for missing values', () => {
    assert.equal(normalizeUpgradeCost(null), null);
  });
});

// ========================================================================
// buildTimeRemaining
// ========================================================================

describe('buildTimeRemaining', () => {
  it('returns null when state is not "building"', () => {
    assert.equal(buildTimeRemaining({ state: 'built', build_finish_at: new Date().toISOString() }), null);
  });

  it('returns null when build_finish_at is missing', () => {
    assert.equal(buildTimeRemaining({ state: 'building' }), null);
  });

  it('returns 0 when finish time is in the past', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    assert.equal(buildTimeRemaining({ state: 'building', build_finish_at: past }), 0);
  });

  it('returns positive minutes when finish time is in the future', () => {
    const future = new Date(Date.now() + 10 * 60000).toISOString();
    const mins = buildTimeRemaining({ state: 'building', build_finish_at: future });
    assert.ok(mins > 0 && mins <= 11); // roughly 10, ceil rounds up
  });
});

// ========================================================================
// petWorldBuildings
// ========================================================================

describe('BUILDING_UI', () => {
  const expectedTypes = [
    'farm', 'house', 'well', 'fishing_hut', 'woodcutters_hut', 'stone_pit',
    'path', 'lumberyard', 'quarry', 'weaving_hut', 'market', 'large_house',
    'garden', 'storehouse', 'trading_post', 'town_hall', 'bakery', 'shrine',
    'park', 'warehouse',
  ];

  it('has an entry for every expected building type', () => {
    for (const type of expectedTypes) {
      assert.ok(BUILDING_UI[type], `missing BUILDING_UI entry for ${type}`);
    }
  });

  it('each entry has icon, accent, category, roofColor, wallColor', () => {
    for (const [type, ui] of Object.entries(BUILDING_UI)) {
      for (const key of ['icon', 'accent', 'category', 'roofColor', 'wallColor']) {
        assert.ok(ui[key], `${type} missing ${key}`);
      }
    }
  });
});

describe('BUILDING_SIZES', () => {
  it('every entry has width and height as positive integers', () => {
    for (const [type, size] of Object.entries(BUILDING_SIZES)) {
      assert.ok(Number.isInteger(size.width) && size.width > 0, `${type} width`);
      assert.ok(Number.isInteger(size.height) && size.height > 0, `${type} height`);
    }
  });

  it('keys match BUILDING_UI keys', () => {
    assert.deepEqual(
      Object.keys(BUILDING_SIZES).sort(),
      Object.keys(BUILDING_UI).sort(),
    );
  });
});

describe('getBuildingUi', () => {
  it('returns the correct entry for a known type', () => {
    const ui = getBuildingUi('farm');
    assert.equal(ui.category, 'Food');
  });

  it('returns a fallback for an unknown type', () => {
    const ui = getBuildingUi('nonexistent_xyz');
    assert.ok(ui.icon);
    assert.ok(ui.accent);
  });
});

describe('getBuildingSize', () => {
  it('returns correct dimensions for town_hall (3x3)', () => {
    const s = getBuildingSize('town_hall');
    assert.deepEqual(s, { width: 3, height: 3 });
  });

  it('returns 1x1 fallback for unknown type', () => {
    const s = getBuildingSize('unknown_xyz');
    assert.deepEqual(s, { width: 1, height: 1 });
  });
});

describe('getBuildingLabel', () => {
  it('returns building.name when present', () => {
    assert.equal(getBuildingLabel({ name: 'My Farm', type: 'farm' }), 'My Farm');
  });

  it('title-cases type when name is missing', () => {
    assert.equal(getBuildingLabel({ type: 'woodcutters_hut' }), 'Woodcutters Hut');
  });

  it('falls back to building_type field', () => {
    assert.equal(getBuildingLabel({ building_type: 'stone_pit' }), 'Stone Pit');
  });

  it('returns empty string for null/undefined input', () => {
    assert.equal(getBuildingLabel(null), '');
    assert.equal(getBuildingLabel(undefined), '');
  });
});

// ========================================================================
// petWorldTiles
// ========================================================================

describe('BIOME_UI', () => {
  const expectedBiomes = [
    'grasslands', 'forest', 'coastal', 'mountain',
    'desert', 'tropical', 'tundra', 'volcanic',
  ];

  it('has all 8 biomes', () => {
    assert.equal(Object.keys(BIOME_UI).length, 8);
    for (const biome of expectedBiomes) {
      assert.ok(BIOME_UI[biome], `missing biome: ${biome}`);
    }
  });

  it('each biome has label, badge, ground (array of 3), and core palette keys', () => {
    const paletteKeys = ['water', 'waterHighlight', 'tree', 'treeHighlight', 'treeTrunk',
      'rock', 'rockHighlight', 'bush', 'bushDetail', 'pathStone', 'shadow', 'groundDetail'];
    for (const [name, biome] of Object.entries(BIOME_UI)) {
      assert.ok(biome.label, `${name} missing label`);
      assert.ok(biome.badge, `${name} missing badge`);
      assert.ok(Array.isArray(biome.ground) && biome.ground.length === 3, `${name} ground should be 3-element array`);
      for (const key of paletteKeys) {
        assert.ok(biome[key], `${name} missing palette key: ${key}`);
      }
    }
  });
});

describe('getBiomeUi', () => {
  it('returns correct biome for known key', () => {
    assert.equal(getBiomeUi('desert').label, 'Desert');
  });

  it('defaults to grasslands for unknown key', () => {
    assert.equal(getBiomeUi('mars').label, 'Grasslands');
  });
});

describe('getTilePalette', () => {
  it('returns water palette for water tile', () => {
    const pal = getTilePalette('grasslands', 'water');
    assert.equal(pal.fill, BIOME_UI.grasslands.water);
    assert.equal(pal.detail, BIOME_UI.grasslands.waterHighlight);
  });

  it('returns tree palette with trunk for tree tile', () => {
    const pal = getTilePalette('forest', 'tree');
    assert.equal(pal.fill, BIOME_UI.forest.tree);
    assert.ok(pal.trunk);
  });

  it('returns rock palette for rock tile', () => {
    const pal = getTilePalette('mountain', 'rock');
    assert.equal(pal.fill, BIOME_UI.mountain.rock);
  });

  it('returns bush palette for bush tile', () => {
    const pal = getTilePalette('tropical', 'bush');
    assert.equal(pal.fill, BIOME_UI.tropical.bush);
    assert.equal(pal.detail, BIOME_UI.tropical.bushDetail);
  });

  it('returns a ground colour for generic/unknown tile types', () => {
    const pal = getTilePalette('coastal', 'ground');
    assert.ok(BIOME_UI.coastal.ground.includes(pal.fill), 'fill should be one of the biome ground colors');
  });
});

// ========================================================================
// petWorldAudio (export checks)
// ========================================================================

describe('petWorldAudio exports', () => {
  const expectedExports = [
    'setMuted', 'isMuted',
    'startAmbient', 'stopAmbient',
    'playBuildSound', 'playClearSound', 'playExpandSound',
    'playUpgradeSound', 'playDemolishSound', 'playTradeSound',
    'playSelectSound', 'playErrorSound', 'playBreedSound',
  ];

  it('exports all expected sound functions', () => {
    for (const name of expectedExports) {
      assert.equal(typeof audio[name], 'function', `missing export: ${name}`);
    }
  });

  it('isMuted returns a boolean', () => {
    assert.equal(typeof audio.isMuted(), 'boolean');
  });
});

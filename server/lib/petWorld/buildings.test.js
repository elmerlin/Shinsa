const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  BUILDINGS,
  TIER_UNLOCKS,
  getBuildingDef,
  getAllBuildingDefs,
  getWorkerCapacity,
  getLevelMultiplier,
  getBuildCost,
  getUpgradeCost,
  getTotalInvestedCost,
  getBuildingProduction,
  getMaxLevel,
} = require('./buildings');

describe('getBuildingDef', () => {
  it('returns definition for valid types', () => {
    assert.ok(getBuildingDef('farm'));
    assert.equal(getBuildingDef('farm').name, 'Farm');
  });
  it('returns null for unknown types', () => {
    assert.equal(getBuildingDef('unknown'), null);
  });
});

describe('getWorkerCapacity', () => {
  it('returns worker count scaling with level for production buildings', () => {
    assert.equal(getWorkerCapacity('farm', 1), 1);
    assert.equal(getWorkerCapacity('farm', 2), 2);
    assert.equal(getWorkerCapacity('farm', 3), 3);
  });
  it('returns 0 for non-production buildings without comboToGold', () => {
    assert.equal(getWorkerCapacity('house', 1), 0);
    assert.equal(getWorkerCapacity('path', 1), 0);
    assert.equal(getWorkerCapacity('market', 1), 0);
  });
  it('returns workers for trading post (comboToGold)', () => {
    assert.equal(getWorkerCapacity('trading_post', 1), 1);
    assert.equal(getWorkerCapacity('trading_post', 2), 2);
  });
  it('caps at max level', () => {
    assert.equal(getWorkerCapacity('farm', 10), 3);
  });
});

describe('getLevelMultiplier', () => {
  it('returns 1x at level 1', () => {
    assert.equal(getLevelMultiplier(1), 1);
  });
  it('returns 1.5x at level 2', () => {
    assert.equal(getLevelMultiplier(2), 1.5);
  });
  it('returns 2x at level 3', () => {
    assert.equal(getLevelMultiplier(3), 2);
  });
});

describe('getBuildCost', () => {
  it('returns combo and material costs', () => {
    const cost = getBuildCost('lumberyard');
    assert.equal(cost.combos, 30);
    assert.deepEqual(cost.materials, { wood: 15 });
  });
  it('returns empty materials for tier 1', () => {
    const cost = getBuildCost('farm');
    assert.equal(cost.combos, 25);
    assert.deepEqual(cost.materials, {});
  });
});

describe('getUpgradeCost', () => {
  it('returns null for level 1', () => {
    assert.equal(getUpgradeCost('farm', 1), null);
  });
  it('returns scaled cost for level 2', () => {
    const cost = getUpgradeCost('farm', 2);
    assert.ok(cost);
    assert.equal(cost.combos, Math.floor(25 * 0.75));
  });
  it('returns null beyond max level', () => {
    assert.equal(getUpgradeCost('farm', 4), null);
  });
  it('returns null for cosmetic buildings', () => {
    assert.equal(getUpgradeCost('path', 2), null);
  });
});

describe('getTotalInvestedCost', () => {
  it('returns base cost for level 1 building', () => {
    const total = getTotalInvestedCost({ building_type: 'farm', level: 1 });
    assert.equal(total.combos, 25);
  });
  it('sums base + upgrade costs for level 3', () => {
    const total = getTotalInvestedCost({ building_type: 'farm', level: 3 });
    const base = 25;
    const upg2 = Math.floor(25 * 0.75 * 1);
    const upg3 = Math.floor(25 * 0.75 * 2);
    assert.equal(total.combos, base + upg2 + upg3);
  });
});

describe('getBuildingProduction', () => {
  it('returns scaled production by level', () => {
    const prod = getBuildingProduction('farm', 1);
    assert.deepEqual(prod, { food: 2 });
    const prod2 = getBuildingProduction('farm', 2);
    assert.deepEqual(prod2, { food: 3 });
  });
  it('returns null for non-producing buildings', () => {
    assert.equal(getBuildingProduction('house', 1), null);
  });
  it('trading post has no passive production', () => {
    assert.equal(getBuildingProduction('trading_post', 1), null);
  });
});

describe('trading_post definition', () => {
  it('has comboToGold but no production', () => {
    const def = getBuildingDef('trading_post');
    assert.equal(def.comboToGold, 1);
    assert.equal(def.production, undefined);
  });
});

describe('getAllBuildingDefs', () => {
  it('returns all buildings with metadata', () => {
    const defs = getAllBuildingDefs();
    assert.ok(defs.length >= 20);
    for (const def of defs) {
      assert.ok(def.id);
      assert.ok(def.name);
      assert.ok(typeof def.tierUnlockPopulation === 'number');
      assert.ok(typeof def.maxLevel === 'number');
    }
  });
});

describe('tier unlock thresholds', () => {
  it('tier 1 unlocks at 0 pop', () => {
    assert.equal(TIER_UNLOCKS[1], 0);
  });
  it('tier 2 unlocks at 6 pop', () => {
    assert.equal(TIER_UNLOCKS[2], 6);
  });
  it('tier 3 unlocks at 16 pop', () => {
    assert.equal(TIER_UNLOCKS[3], 16);
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SIM_STEP_MS,
  getPhase,
  getPhaseCap,
  parseSqliteDate,
  toSqliteDate,
  getDerivedState,
  simulateWorld,
  roundResource,
  clamp,
} = require('./economy');
const { getBuildingDef } = require('./buildings');

function makeWorld(overrides = {}) {
  const now = new Date();
  return {
    user_id: 'test-user',
    biome: 'grasslands',
    biome_specialty: 'food',
    expansions: 0,
    population: 4,
    happiness: 65,
    food: 50,
    wood: 20,
    stone: 10,
    cloth: 5,
    gold: 0,
    food_capacity: 100,
    wood_capacity: 100,
    stone_capacity: 50,
    cloth_capacity: 50,
    gold_capacity: 50,
    last_tick_at: toSqliteDate(new Date(now.getTime() - 60 * 60 * 1000)),
    created_at: toSqliteDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
    ...overrides,
  };
}

function makeBuilding(overrides = {}) {
  return {
    id: 1,
    building_type: 'farm',
    grid_x: 6,
    grid_y: 4,
    width: 2,
    height: 2,
    level: 1,
    workers: 0,
    state: 'built',
    is_starter: 0,
    build_complete_at: toSqliteDate(new Date(Date.now() - 48 * 60 * 60 * 1000)),
    ...overrides,
  };
}

describe('getPhase', () => {
  it('maps expansion count to phase number', () => {
    assert.equal(getPhase(0), 1);
    assert.equal(getPhase(1), 2);
    assert.equal(getPhase(2), 2);
    assert.equal(getPhase(3), 3);
    assert.equal(getPhase(4), 3);
    assert.equal(getPhase(5), 4);
    assert.equal(getPhase(6), 4);
  });
});

describe('getPhaseCap', () => {
  it('phase 1 (0 expansions) caps at 10', () => {
    assert.equal(getPhaseCap(0), 10);
  });
  it('phase 2 (1-2 expansions) caps at 10', () => {
    assert.equal(getPhaseCap(1), 10);
    assert.equal(getPhaseCap(2), 10);
  });
  it('phase 3 (3-4 expansions) caps at 25', () => {
    assert.equal(getPhaseCap(3), 25);
    assert.equal(getPhaseCap(4), 25);
  });
  it('phase 4+ (5+ expansions) caps at 50', () => {
    assert.equal(getPhaseCap(5), 50);
    assert.equal(getPhaseCap(6), 50);
  });
});

describe('simulateWorld - production proration', () => {
  it('prorates production for buildings completed mid-step', () => {
    const now = new Date();
    const stepStart = new Date(now.getTime() - SIM_STEP_MS);
    const midStep = new Date(stepStart.getTime() + SIM_STEP_MS / 2);
    const world = makeWorld({
      last_tick_at: toSqliteDate(stepStart),
      food: 0,
    });
    const building = makeBuilding({
      building_type: 'farm',
      state: 'building',
      build_complete_at: toSqliteDate(midStep),
    });
    const result = simulateWorld(world, [building], { now });
    assert.equal(result.stepsToRun, 1);
    // Farm produces 2 food/hr. Half step = 7.5min = 0.125hr → ~0.25 food
    // With biome specialty (food, grasslands) = 1.25x → ~0.31
    assert.ok(result.world.food > 0, 'Should have produced some food');
    assert.ok(result.world.food < 1, 'Should not have produced a full step worth');
  });
});

describe('simulateWorld - construction completion without sim step', () => {
  it('marks building as built when complete time has passed even with 0 steps', () => {
    const now = new Date();
    const world = makeWorld({ last_tick_at: toSqliteDate(now) });
    const building = makeBuilding({
      state: 'building',
      build_complete_at: toSqliteDate(new Date(now.getTime() - 1000)),
    });
    const result = simulateWorld(world, [building], { now });
    assert.equal(result.stepsToRun, 0);
    assert.equal(result.buildings[0].state, 'built');
  });
});

describe('simulateWorld - breeding at epoch boundary', () => {
  it('breeds when crossing 24h boundary with conditions met', () => {
    const epoch = new Date('2026-01-01T00:00:00Z');
    const beforeBoundary = new Date(epoch.getTime() + 23 * 60 * 60 * 1000 + 45 * 60 * 1000);
    const afterBoundary = new Date(beforeBoundary.getTime() + SIM_STEP_MS);
    const world = makeWorld({
      population: 3,
      happiness: 70,
      food: 20,
      created_at: toSqliteDate(epoch),
      last_tick_at: toSqliteDate(beforeBoundary),
    });
    const house = makeBuilding({
      id: 1,
      building_type: 'house',
      level: 1,
      build_complete_at: toSqliteDate(epoch),
    });
    const house2 = makeBuilding({
      id: 2,
      building_type: 'large_house',
      grid_x: 0,
      grid_y: 0,
      width: 3,
      height: 2,
      level: 1,
      build_complete_at: toSqliteDate(epoch),
    });
    const result = simulateWorld(world, [house, house2], { now: afterBoundary });
    assert.equal(result.stepsToRun, 1);
    assert.equal(result.world.population, 4, 'Population should increase by 1');
  });

  it('does not breed when happiness is too low', () => {
    const epoch = new Date('2026-01-01T00:00:00Z');
    const beforeBoundary = new Date(epoch.getTime() + 23 * 60 * 60 * 1000 + 45 * 60 * 1000);
    const afterBoundary = new Date(beforeBoundary.getTime() + SIM_STEP_MS);
    const world = makeWorld({
      population: 3,
      happiness: 50,
      food: 20,
      created_at: toSqliteDate(epoch),
      last_tick_at: toSqliteDate(beforeBoundary),
    });
    const house = makeBuilding({
      id: 1,
      building_type: 'large_house',
      grid_x: 0,
      grid_y: 0,
      width: 3,
      height: 2,
      level: 1,
      build_complete_at: toSqliteDate(epoch),
    });
    const result = simulateWorld(world, [house], { now: afterBoundary });
    assert.equal(result.world.population, 3, 'Population should not change');
  });
});

describe('simulateWorld - happiness decay', () => {
  it('decays happiness by 1 at 48h boundary when above 50', () => {
    const epoch = new Date('2026-01-01T00:00:00Z');
    const before48h = new Date(epoch.getTime() + 47 * 60 * 60 * 1000 + 45 * 60 * 1000);
    const after48h = new Date(before48h.getTime() + SIM_STEP_MS);
    const world = makeWorld({
      happiness: 65,
      food: 100,
      created_at: toSqliteDate(epoch),
      last_tick_at: toSqliteDate(before48h),
    });
    const result = simulateWorld(world, [], { now: after48h });
    assert.ok(result.world.happiness < 65, 'Happiness should have decayed');
  });
});

describe('simulateWorld - happiness recovery from buildings', () => {
  it('recovers happiness when buildings provide happiness bonus', () => {
    const now = new Date();
    const world = makeWorld({
      happiness: 30,
      food: 100,
      last_tick_at: toSqliteDate(new Date(now.getTime() - 2 * SIM_STEP_MS)),
    });
    const garden = makeBuilding({
      id: 2,
      building_type: 'garden',
      grid_x: 0,
      grid_y: 0,
      width: 1,
      height: 1,
      level: 1,
    });
    const result = simulateWorld(world, [garden], { now });
    assert.ok(result.world.happiness > 30, 'Happiness should recover with garden');
    assert.ok(result.derived.happinessTarget > 50, 'Target should be above base 50');
  });
});

describe('simulateWorld - starter house no refund', () => {
  it('starter house flag is preserved', () => {
    const world = makeWorld();
    const starter = makeBuilding({ is_starter: 1, building_type: 'house' });
    const result = simulateWorld(world, [starter], { now: new Date() });
    assert.equal(result.buildings[0].is_starter, 1);
  });
});

describe('simulateWorld - trading post combo conversion', () => {
  it('consumes combos and produces gold', () => {
    const now = new Date();
    const world = makeWorld({
      gold: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - 2 * SIM_STEP_MS)),
    });
    const post = makeBuilding({
      id: 3,
      building_type: 'trading_post',
      grid_x: 0,
      grid_y: 0,
      width: 2,
      height: 2,
      level: 1,
      workers: 1,
    });
    const result = simulateWorld(world, [post], { now, comboBalance: 50 });
    assert.equal(result.stepsToRun, 2);
    assert.ok(result.comboConsumed > 0, 'Should consume combos');
    assert.ok(result.world.gold > 0, 'Should produce gold');
    assert.equal(result.comboConsumed, result.world.gold, 'Gold produced should equal combos consumed');
  });

  it('does not consume more combos than available', () => {
    const now = new Date();
    const world = makeWorld({
      gold: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - 4 * SIM_STEP_MS)),
    });
    const post = makeBuilding({
      id: 3,
      building_type: 'trading_post',
      grid_x: 0,
      grid_y: 0,
      width: 2,
      height: 2,
      level: 1,
      workers: 1,
    });
    const result = simulateWorld(world, [post], { now, comboBalance: 2 });
    assert.equal(result.comboConsumed, 2, 'Should only consume available combos');
  });
});

describe('simulateWorld - phase cap enforcement', () => {
  it('caps population at phase cap (10 for 0 expansions)', () => {
    const now = new Date();
    const world = makeWorld({
      population: 9,
      expansions: 0,
    });
    const result = simulateWorld(world, [], { now });
    assert.ok(result.world.population <= 10, 'Should not exceed phase 1 cap');
    assert.equal(result.derived.phaseCap, 10);
  });
});

describe('simulateWorld - food starvation', () => {
  it('loses population and happiness when food runs out', () => {
    const now = new Date();
    const world = makeWorld({
      food: 0,
      population: 5,
      happiness: 70,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const result = simulateWorld(world, [], { now });
    assert.ok(result.world.population < 5, 'Should lose population');
    assert.ok(result.world.happiness < 70, 'Should lose happiness');
    assert.equal(result.world.food, 0, 'Food should be 0');
  });
});

describe('getDerivedState', () => {
  it('calculates housing from houses', () => {
    const world = makeWorld();
    const house = makeBuilding({ building_type: 'house', level: 2 });
    const derived = getDerivedState({ ...world, biome_specialty: 'food' }, [house], Date.now());
    assert.equal(derived.housing, 4, 'Level 2 house provides 4 housing');
  });

  it('calculates storage bonus from storehouses', () => {
    const world = makeWorld();
    const storehouse = makeBuilding({ building_type: 'storehouse', level: 1 });
    const derived = getDerivedState({ ...world, biome_specialty: 'food' }, [storehouse], Date.now());
    assert.equal(derived.caps.food, 150, 'Storehouse adds 50 to food cap');
  });

  it('tracks happiness bonus from gardens and parks', () => {
    const world = makeWorld();
    const garden = makeBuilding({ id: 1, building_type: 'garden', width: 1, height: 1, level: 2 });
    const park = makeBuilding({ id: 2, building_type: 'park', grid_x: 2, grid_y: 2, width: 3, height: 3, level: 1 });
    const derived = getDerivedState({ ...world, biome_specialty: 'food' }, [garden, park], Date.now());
    assert.equal(derived.happinessBonus, 20, 'Garden lv2 (10) + Park lv1 (10) = 20');
  });
});

describe('simulateWorld - seasonal bonuses', () => {
  it('applies seasonal production bonus to matching category', () => {
    const now = new Date();
    const world = makeWorld({
      food: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const farm = makeBuilding({ building_type: 'farm', level: 1 });
    const withBonus = simulateWorld(world, [farm], {
      now,
      seasonalBonuses: { food: 0.2 },
    });
    const worldNoBonus = makeWorld({
      food: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const withoutBonus = simulateWorld(worldNoBonus, [makeBuilding({ building_type: 'farm', level: 1 })], { now });
    assert.ok(withBonus.world.food > withoutBonus.world.food, 'Seasonal bonus should increase food production');
  });

  it('does not apply seasonal bonus to non-matching categories', () => {
    const now = new Date();
    const world = makeWorld({
      wood: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const woodcutter = makeBuilding({ building_type: 'woodcutters_hut', level: 1 });
    const withBonus = simulateWorld(world, [woodcutter], {
      now,
      seasonalBonuses: { food: 0.2 },
    });
    const worldNoBonus = makeWorld({
      wood: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const withoutBonus = simulateWorld(worldNoBonus, [makeBuilding({ building_type: 'woodcutters_hut', level: 1 })], { now });
    assert.equal(withBonus.world.wood, withoutBonus.world.wood, 'Food bonus should not affect wood production');
  });

  it('seasonal happiness bonus raises happiness target', () => {
    const now = new Date();
    const world = makeWorld({
      happiness: 30,
      food: 100,
      last_tick_at: toSqliteDate(new Date(now.getTime() - 3 * SIM_STEP_MS)),
    });
    const result = simulateWorld(world, [], { now, seasonalHappinessBonus: 15 });
    assert.ok(result.derived.happinessTarget >= 65, 'Target should be at least 50 + 15');
  });
});

describe('simulateWorld - terrain feature bonuses', () => {
  it('boosts food production for farms near ponds', () => {
    const now = new Date();
    const world = makeWorld({
      food: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const farm = makeBuilding({ building_type: 'farm', grid_x: 5, grid_y: 5 });
    const withFeature = simulateWorld(world, [farm], {
      now,
      gridFeatures: [{ type: 'pond', x: 6, y: 6, w: 2, h: 2 }],
    });
    const worldNoFeature = makeWorld({
      food: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const withoutFeature = simulateWorld(worldNoFeature, [makeBuilding({ building_type: 'farm', grid_x: 5, grid_y: 5 })], { now });
    assert.ok(withFeature.world.food > withoutFeature.world.food, 'Nearby pond should boost farm food');
  });

  it('does not boost unrelated category', () => {
    const now = new Date();
    const world = makeWorld({
      wood: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const woodcutter = makeBuilding({ building_type: 'woodcutters_hut', grid_x: 5, grid_y: 5 });
    const withPond = simulateWorld(world, [woodcutter], {
      now,
      gridFeatures: [{ type: 'pond', x: 6, y: 6, w: 2, h: 2 }],
    });
    const worldNoPond = makeWorld({
      wood: 0,
      last_tick_at: toSqliteDate(new Date(now.getTime() - SIM_STEP_MS)),
    });
    const withoutPond = simulateWorld(worldNoPond, [makeBuilding({ building_type: 'woodcutters_hut', grid_x: 5, grid_y: 5 })], { now });
    assert.equal(withPond.world.wood, withoutPond.world.wood, 'Pond should not boost wood category');
  });
});

describe('roundResource', () => {
  it('rounds to 2 decimals', () => {
    assert.equal(roundResource(1.256), 1.26);
    assert.equal(roundResource(3.999), 4);
    assert.equal(roundResource(0), 0);
  });
});

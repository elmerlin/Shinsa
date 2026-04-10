const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SEASONAL_EVENTS,
  ENCOUNTER_TYPES,
  getActiveEvents,
  getSeasonalBonuses,
  getEventCountdown,
  isEventActive,
  pickEncounterType,
  pickSeasonalEncounterType,
} = require('./events');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function dateOf(month, day) {
  // Use a non-leap year (2025) so day-of-year math is stable
  return new Date(2025, month - 1, day, 12, 0, 0);
}

function findEvent(id) {
  return SEASONAL_EVENTS.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// isEventActive
// ---------------------------------------------------------------------------
describe('isEventActive', () => {
  it('spring_bloom active on Mar 25', () => {
    assert.ok(isEventActive(findEvent('spring_bloom'), dateOf(3, 25)));
  });

  it('spring_bloom active on start boundary Mar 20', () => {
    assert.ok(isEventActive(findEvent('spring_bloom'), dateOf(3, 20)));
  });

  it('spring_bloom active on end boundary Apr 20', () => {
    assert.ok(isEventActive(findEvent('spring_bloom'), dateOf(4, 20)));
  });

  it('spring_bloom NOT active on Mar 19', () => {
    assert.equal(isEventActive(findEvent('spring_bloom'), dateOf(3, 19)), false);
  });

  it('spring_bloom NOT active on Apr 21', () => {
    assert.equal(isEventActive(findEvent('spring_bloom'), dateOf(4, 21)), false);
  });

  it('summer_festival active on Jul 1', () => {
    assert.ok(isEventActive(findEvent('summer_festival'), dateOf(7, 1)));
  });

  it('summer_festival NOT active on Aug 1', () => {
    assert.equal(isEventActive(findEvent('summer_festival'), dateOf(8, 1)), false);
  });

  it('harvest_moon active on Oct 1', () => {
    assert.ok(isEventActive(findEvent('harvest_moon'), dateOf(10, 1)));
  });

  it('harvest_moon NOT active on Nov 1', () => {
    assert.equal(isEventActive(findEvent('harvest_moon'), dateOf(11, 1)), false);
  });

  // --- year-boundary wrap ---
  it('winter_solstice active on Dec 25 (before year end)', () => {
    assert.ok(isEventActive(findEvent('winter_solstice'), dateOf(12, 25)));
  });

  it('winter_solstice active on Dec 20 (start boundary)', () => {
    assert.ok(isEventActive(findEvent('winter_solstice'), dateOf(12, 20)));
  });

  it('winter_solstice active on Jan 10 (after year boundary)', () => {
    assert.ok(isEventActive(findEvent('winter_solstice'), dateOf(1, 10)));
  });

  it('winter_solstice active on Jan 20 (end boundary)', () => {
    assert.ok(isEventActive(findEvent('winter_solstice'), dateOf(1, 20)));
  });

  it('winter_solstice NOT active on Dec 19', () => {
    assert.equal(isEventActive(findEvent('winter_solstice'), dateOf(12, 19)), false);
  });

  it('winter_solstice NOT active on Jan 21', () => {
    assert.equal(isEventActive(findEvent('winter_solstice'), dateOf(1, 21)), false);
  });

  it('winter_solstice NOT active on Jun 15 (mid-year)', () => {
    assert.equal(isEventActive(findEvent('winter_solstice'), dateOf(6, 15)), false);
  });
});

// ---------------------------------------------------------------------------
// getActiveEvents
// ---------------------------------------------------------------------------
describe('getActiveEvents', () => {
  it('returns spring_bloom for Apr 1', () => {
    const events = getActiveEvents(dateOf(4, 1));
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'spring_bloom');
  });

  it('returns summer_festival for Jul 4', () => {
    const events = getActiveEvents(dateOf(7, 4));
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'summer_festival');
  });

  it('returns harvest_moon for Oct 10', () => {
    const events = getActiveEvents(dateOf(10, 10));
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'harvest_moon');
  });

  it('returns winter_solstice for Dec 31', () => {
    const events = getActiveEvents(dateOf(12, 31));
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'winter_solstice');
  });

  it('returns winter_solstice for Jan 5', () => {
    const events = getActiveEvents(dateOf(1, 5));
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'winter_solstice');
  });

  it('returns empty array when no event is active (May 15)', () => {
    const events = getActiveEvents(dateOf(5, 15));
    assert.equal(events.length, 0);
  });

  it('returns empty array in mid-August', () => {
    const events = getActiveEvents(dateOf(8, 15));
    assert.equal(events.length, 0);
  });
});

// ---------------------------------------------------------------------------
// getSeasonalBonuses
// ---------------------------------------------------------------------------
describe('getSeasonalBonuses', () => {
  it('returns correct structure with productionBonuses and happinessBonus', () => {
    const bonuses = getSeasonalBonuses(dateOf(5, 15)); // no event
    assert.ok('productionBonuses' in bonuses);
    assert.ok('happinessBonus' in bonuses);
    assert.deepEqual(bonuses.productionBonuses, {});
    assert.equal(bonuses.happinessBonus, 0);
  });

  it('spring_bloom gives food +0.2 and happiness +3', () => {
    const bonuses = getSeasonalBonuses(dateOf(4, 1));
    assert.equal(bonuses.productionBonuses.food, 0.2);
    assert.equal(bonuses.happinessBonus, 3);
  });

  it('summer_festival gives happiness +10 with no production bonuses', () => {
    const bonuses = getSeasonalBonuses(dateOf(7, 1));
    assert.deepEqual(bonuses.productionBonuses, {});
    assert.equal(bonuses.happinessBonus, 10);
  });

  it('harvest_moon gives food +0.15, wood +0.1, happiness 0', () => {
    const bonuses = getSeasonalBonuses(dateOf(10, 1));
    assert.equal(bonuses.productionBonuses.food, 0.15);
    assert.equal(bonuses.productionBonuses.wood, 0.1);
    assert.equal(bonuses.happinessBonus, 0);
  });

  it('winter_solstice gives stone +0.15, gold +0.1, happiness +5', () => {
    const bonuses = getSeasonalBonuses(dateOf(12, 25));
    assert.equal(bonuses.productionBonuses.stone, 0.15);
    assert.equal(bonuses.productionBonuses.gold, 0.1);
    assert.equal(bonuses.happinessBonus, 5);
  });
});

// ---------------------------------------------------------------------------
// pickEncounterType
// ---------------------------------------------------------------------------
describe('pickEncounterType', () => {
  it('seed 0 returns first encounter (fox_raid)', () => {
    const enc = pickEncounterType(0);
    assert.equal(enc.type, 'fox_raid');
  });

  it('seed just below fox_raid threshold returns fox_raid', () => {
    const enc = pickEncounterType(0.29);
    assert.equal(enc.type, 'fox_raid');
  });

  it('seed at fox_raid threshold returns wolf_pack', () => {
    // cumulative at wolf_pack boundary: 0.3 + 0.25 = 0.55
    const enc = pickEncounterType(0.3);
    assert.equal(enc.type, 'wolf_pack');
  });

  it('seed in wolf_pack range returns wolf_pack', () => {
    const enc = pickEncounterType(0.45);
    assert.equal(enc.type, 'wolf_pack');
  });

  it('seed in bear_sighting range returns bear_sighting', () => {
    // cumulative: 0.3 + 0.25 = 0.55; bear ends at 0.75
    const enc = pickEncounterType(0.6);
    assert.equal(enc.type, 'bear_sighting');
  });

  it('seed in deer_herd range returns deer_herd', () => {
    // cumulative: 0.75 + 0.15 = 0.90
    const enc = pickEncounterType(0.8);
    assert.equal(enc.type, 'deer_herd');
  });

  it('seed in rare_bird range returns rare_bird', () => {
    // cumulative: 0.90 + 0.10 = 1.0
    const enc = pickEncounterType(0.95);
    assert.equal(enc.type, 'rare_bird');
  });

  it('seed >= 1.0 falls back to first encounter', () => {
    const enc = pickEncounterType(1.0);
    assert.equal(enc.type, 'fox_raid');
  });

  it('every encounter has type, name, description, reward, rarity', () => {
    for (const enc of ENCOUNTER_TYPES) {
      assert.ok(typeof enc.type === 'string', `${enc.type} has type`);
      assert.ok(typeof enc.name === 'string', `${enc.type} has name`);
      assert.ok(typeof enc.description === 'string', `${enc.type} has description`);
      assert.ok(typeof enc.reward === 'object', `${enc.type} has reward`);
      assert.ok(typeof enc.rarity === 'number', `${enc.type} has rarity`);
    }
  });

  it('rarity values sum to 1.0', () => {
    const total = ENCOUNTER_TYPES.reduce((sum, e) => sum + e.rarity, 0);
    assert.ok(Math.abs(total - 1.0) < 0.001, `rarities sum to ${total}, expected 1.0`);
  });
});

// ---------------------------------------------------------------------------
// SEASONAL_EVENTS data integrity
// ---------------------------------------------------------------------------
describe('SEASONAL_EVENTS data integrity', () => {
  it('has 4 seasonal events', () => {
    assert.equal(SEASONAL_EVENTS.length, 4);
  });

  it('each event has required fields', () => {
    for (const event of SEASONAL_EVENTS) {
      assert.ok(typeof event.id === 'string', `${event.id} has id`);
      assert.ok(typeof event.name === 'string', `${event.id} has name`);
      assert.ok(typeof event.description === 'string', `${event.id} has description`);
      assert.ok(typeof event.start === 'object', `${event.id} has start`);
      assert.ok(typeof event.end === 'object', `${event.id} has end`);
      assert.ok(typeof event.start.month === 'number', `${event.id} start has month`);
      assert.ok(typeof event.start.day === 'number', `${event.id} start has day`);
      assert.ok(typeof event.end.month === 'number', `${event.id} end has month`);
      assert.ok(typeof event.end.day === 'number', `${event.id} end has day`);
      assert.ok(typeof event.productionBonuses === 'object', `${event.id} has productionBonuses`);
      assert.ok(typeof event.happinessBonus === 'number', `${event.id} has happinessBonus`);
    }
  });

  it('each event has icon, encounterBoost, and specialReward', () => {
    for (const event of SEASONAL_EVENTS) {
      assert.ok(typeof event.icon === 'string' && event.icon.length > 0, `${event.id} has icon`);
      assert.ok(Array.isArray(event.encounterBoost), `${event.id} has encounterBoost array`);
      assert.ok(event.encounterBoost.length > 0, `${event.id} encounterBoost is non-empty`);
      // Every boosted type must exist in ENCOUNTER_TYPES
      for (const t of event.encounterBoost) {
        assert.ok(ENCOUNTER_TYPES.some((e) => e.type === t), `${event.id} boost target "${t}" exists`);
      }
      assert.ok(typeof event.specialReward === 'object', `${event.id} has specialReward`);
      assert.ok(typeof event.specialReward.resource === 'string', `${event.id} specialReward has resource`);
      assert.ok(typeof event.specialReward.multiplier === 'number', `${event.id} specialReward has multiplier`);
    }
  });

  it('each event has a flavor description longer than 30 characters', () => {
    for (const event of SEASONAL_EVENTS) {
      assert.ok(event.description.length > 30, `${event.id} description is substantive`);
    }
  });
});

// ---------------------------------------------------------------------------
// getEventCountdown
// ---------------------------------------------------------------------------
describe('getEventCountdown', () => {
  it('returns correct days remaining for spring_bloom on Apr 1', () => {
    // Spring bloom ends Apr 20; Apr 1 to Apr 20 = 19 days
    const days = getEventCountdown(findEvent('spring_bloom'), dateOf(4, 1));
    assert.equal(days, 19);
  });

  it('returns 0 on last day of spring_bloom (Apr 20)', () => {
    const days = getEventCountdown(findEvent('spring_bloom'), dateOf(4, 20));
    assert.equal(days, 0);
  });

  it('returns correct days for summer_festival on Jun 25', () => {
    // Jun 25 to Jul 21 = 26 days
    const days = getEventCountdown(findEvent('summer_festival'), dateOf(6, 25));
    assert.equal(days, 26);
  });

  it('returns correct days for harvest_moon on Oct 1', () => {
    // Oct 1 to Oct 22 = 21 days
    const days = getEventCountdown(findEvent('harvest_moon'), dateOf(10, 1));
    assert.equal(days, 21);
  });

  it('returns correct days for winter_solstice on Dec 25 (cross-year)', () => {
    // Dec 25 to Jan 20 next year = 26 days
    const days = getEventCountdown(findEvent('winter_solstice'), dateOf(12, 25));
    assert.equal(days, 26);
  });

  it('returns 0 on last day of winter_solstice (Jan 20)', () => {
    const days = getEventCountdown(findEvent('winter_solstice'), dateOf(1, 20));
    assert.equal(days, 0);
  });
});

// ---------------------------------------------------------------------------
// pickSeasonalEncounterType
// ---------------------------------------------------------------------------
describe('pickSeasonalEncounterType', () => {
  it('boosts deer_herd during spring_bloom (higher effective weight)', () => {
    // Run many picks during spring and count deer_herd vs off-season
    let springDeer = 0;
    let offDeer = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i += 1) {
      const seed = i / trials;
      if (pickSeasonalEncounterType(dateOf(4, 1), seed).type === 'deer_herd') springDeer += 1;
      if (pickEncounterType(seed).type === 'deer_herd') offDeer += 1;
    }
    // Boosted season should yield at least as many (usually more)
    assert.ok(springDeer >= offDeer, `spring deer ${springDeer} >= off-season deer ${offDeer}`);
  });

  it('returns a valid encounter type during summer_festival', () => {
    const enc = pickSeasonalEncounterType(dateOf(7, 1), 0.5);
    assert.ok(ENCOUNTER_TYPES.some((e) => e.type === enc.type));
  });

  it('falls back to first type for seed >= 1.0', () => {
    const enc = pickSeasonalEncounterType(dateOf(4, 1), 1.0);
    assert.equal(enc.type, ENCOUNTER_TYPES[0].type);
  });

  it('behaves like pickEncounterType when no event is active', () => {
    // May 15 has no event
    const seedsToCheck = [0, 0.2, 0.45, 0.6, 0.8, 0.95];
    for (const seed of seedsToCheck) {
      const seasonal = pickSeasonalEncounterType(dateOf(5, 15), seed);
      const base = pickEncounterType(seed);
      assert.equal(seasonal.type, base.type, `seed ${seed} matches base picker`);
    }
  });
});

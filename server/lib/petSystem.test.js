const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'express') {
    return {
      Router: () => ({
        get() { return this; },
        post() { return this; },
        use() { return this; },
      }),
    };
  }
  if (request === '../db/schema') {
    return {
      getDb: () => {
        throw new Error('DB access is not expected in petSystem.test.js');
      },
    };
  }
  if (request === './auth') {
    return {
      requireAuth: (_req, _res, next) => {
        if (typeof next === 'function') next();
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

const petRouter = require('../routes/pets');
Module._load = originalLoad;

const {
  getEnergyRecoveryRate,
  getEnergyStateValue,
  getTrustStateValue,
  buildPetVitalsSnapshot,
  buildPetNeeds,
  buildPetRequestTemplate,
  getCurrentPetRequest,
  isPetRequestSatisfied,
  formatPetStatLabel,
} = petRouter._test;

function hoursAgo(hours) {
  return new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString().slice(0, 19).replace('T', ' ');
}

describe('pet vitals helpers', () => {
  it('uses hunger bands for passive energy recovery', () => {
    assert.equal(getEnergyRecoveryRate(55), 4);
    assert.equal(getEnergyRecoveryRate(25), 2);
    assert.equal(getEnergyRecoveryRate(10), 0);
  });

  it('recovers energy over time when hunger is healthy', () => {
    assert.equal(getEnergyStateValue(20, hoursAgo(5), 50), 40);
  });

  it('does not decay trust before the neglect window', () => {
    assert.equal(getTrustStateValue(40, hoursAgo(24)), 40);
  });

  it('decays trust after the neglect window passes', () => {
    assert.equal(getTrustStateValue(40, hoursAgo(72)), 38);
  });

  it('builds the new wellbeing snapshot with mood state and reward multiplier', () => {
    const vitals = buildPetVitalsSnapshot({
      fullness: 82,
      happiness: 70,
      energy: 35,
      trust: 64,
      hype: 58,
      bond: 120,
      last_fed_at: hoursAgo(1),
      updated_at: hoursAgo(1),
      last_meaningful_care_at: hoursAgo(12),
    });

    assert.equal(vitals.hunger, 81);
    assert.equal(vitals.energy, 39);
    assert.equal(vitals.trust, 64);
    assert.equal(vitals.momentum, 57);
    assert.equal(vitals.mood_state, 'stable');
    assert.equal(vitals.reward_multiplier, 0.85);
  });
});

describe('pet needs and requests', () => {
  it('surfaces the correct urgent needs from low vitals', () => {
    const needs = buildPetNeeds(
      { hunger: 10, energy: 14, trust: 22, momentum: 8 },
      { bond: 30 },
      { plays_today: 0 }
    );

    assert.deepEqual(
      needs.map((need) => need.id),
      ['feed-now', 'rest', 'bonding', 'pump-session']
    );
  });

  it('formats hype-derived rewards as momentum for the UI', () => {
    assert.equal(formatPetStatLabel('hype'), 'momentum');
  });

  it('tracks progress for a pump session request', () => {
    const request = buildPetRequestTemplate('pump-session', {
      target_plays_today: 2,
      target_momentum: 40,
    });
    const pet = {
      active_request_type: request.type,
      active_request_payload: JSON.stringify(request),
      active_request_status: 'active',
      active_request_created_at: hoursAgo(1),
      active_request_expires_at: hoursAgo(-12),
      active_request_completed_at: '',
      daily_interaction_key: '',
      daily_interaction_count: 0,
    };

    const current = getCurrentPetRequest(pet, { momentum: 18 }, { plays_today: 1 });
    assert.equal(current.progress, 2);
    assert.equal(current.target, 4);
    assert.equal(isPetRequestSatisfied(current, { momentum: 18 }, pet, { plays_today: 1 }), false);
    assert.equal(isPetRequestSatisfied(current, { momentum: 42 }, pet, { plays_today: 0 }), true);
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patchedWeeklyChallengeLoad(request, parent, isMain) {
  if (request === '../db/schema') {
    return { SYSTEM_USER_ID: 'system-user' };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { getWeekBoundary } = require('./weeklyChallenges');
Module._load = originalLoad;

describe('weekly challenge week boundaries', () => {
  it('keeps the pre-rollover week before London midnight on the BST transition', () => {
    const boundary = getWeekBoundary(new Date('2026-03-29T22:59:00Z'));

    assert.deepEqual(boundary, {
      weekKey: '2026-W13',
      startsAtUtc: '2026-03-23T00:00:00.000Z',
      endsAtUtc: '2026-03-29T22:59:59.000Z',
    });
  });

  it('rolls into the new ISO week at Monday 00:00 Europe/London after DST starts', () => {
    const boundary = getWeekBoundary(new Date('2026-03-29T23:01:00Z'));

    assert.deepEqual(boundary, {
      weekKey: '2026-W14',
      startsAtUtc: '2026-03-29T23:00:00.000Z',
      endsAtUtc: '2026-04-05T22:59:59.000Z',
    });
  });
});

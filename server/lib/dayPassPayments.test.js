const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  STALE_DAY_PASS_PENDING_MINUTES,
  getVisibleVenuePaymentPredicate,
  purgeStalePendingDayPassPayments,
} = require('./dayPassPayments');

describe('day pass payment visibility', () => {
  it('only exposes succeeded day-pass payment rows while leaving other payment types alone', () => {
    assert.equal(
      getVisibleVenuePaymentPredicate('vp'),
      "(vp.payment_type != 'day_pass' OR vp.status = 'succeeded')"
    );
    assert.equal(
      getVisibleVenuePaymentPredicate(),
      "(payment_type != 'day_pass' OR status = 'succeeded')"
    );
  });
});

describe('purgeStalePendingDayPassPayments', () => {
  it('deletes only stale pending day-pass rows and supports user and venue scoping', () => {
    const calls = [];
    const db = {
      prepare(sql) {
        calls.push(sql);
        return {
          run(...params) {
            calls.push(params);
            return { changes: 3 };
          },
        };
      },
    };

    const changes = purgeStalePendingDayPassPayments(db, {
      userId: 'user-1',
      venueId: 'venue-1',
    });

    assert.equal(changes, 3);
    assert.match(calls[0], /DELETE FROM venue_payments/);
    assert.match(calls[0], /payment_type = 'day_pass'/);
    assert.match(calls[0], /status = 'pending'/);
    assert.deepEqual(calls[1], [
      `-${STALE_DAY_PASS_PENDING_MINUTES} minutes`,
      'user-1',
      'venue-1',
    ]);
  });
});

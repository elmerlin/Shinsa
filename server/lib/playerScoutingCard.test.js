const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('./playerScoutingCard');

function makeSnapshot({ ratings, families }) {
  return {
    hasPiuData: true,
    ratings,
    families,
  };
}

describe('player scouting card Shinsa baseline', () => {
  it('uses the strongest Shinsa bucket in each attribute instead of a single reference player', () => {
    const afii = makeSnapshot({
      ratings: { overall: 6100, singles: 6500, doubles: 4200 },
      families: {
        overall: { speed: 2680, stamina: 2900, mobility: 2800, tech: 2750 },
        singles: { speed: 2500, stamina: 2760, mobility: 2700, tech: 2600 },
        doubles: { speed: 2100, stamina: 2300, mobility: 2200, tech: 2150 },
      },
    });
    const elmer = makeSnapshot({
      ratings: { overall: 7300, singles: 7600, doubles: 6100 },
      families: {
        overall: { speed: 2550, stamina: 3100, mobility: 3200, tech: 3300 },
        singles: { speed: 2480, stamina: 3000, mobility: 3150, tech: 3250 },
        doubles: { speed: 2250, stamina: 2600, mobility: 2700, tech: 2800 },
      },
    });

    const baseline = __test.buildShinsaBaselineFromSnapshots([afii, elmer]);

    assert.equal(baseline.cohortSize, 2);
    assert.deepEqual(baseline.ratings, { overall: 7300, singles: 7600, doubles: 6100 });
    assert.deepEqual(baseline.families.overall, {
      speed: 2680,
      stamina: 3100,
      mobility: 3200,
      tech: 3300,
    });
  });

  it('scales attributes against Shinsa maxima so non-leaders do not get automatic 100s', () => {
    const baseline = __test.buildShinsaBaselineFromSnapshots([
      makeSnapshot({
        ratings: { overall: 7300, singles: 7600, doubles: 6100 },
        families: {
          overall: { speed: 2680, stamina: 3100, mobility: 3200, tech: 3300 },
          singles: { speed: 2500, stamina: 3000, mobility: 3150, tech: 3250 },
          doubles: { speed: 2250, stamina: 2600, mobility: 2700, tech: 2800 },
        },
      }),
    ]);

    const afiiRelative = __test.buildRelativeBucketScores(
      { speed: 2680, stamina: 2900, mobility: 2800, tech: 2750 },
      baseline.families.overall
    );

    assert.deepEqual(afiiRelative, {
      speed: 100,
      stamina: 94,
      mobility: 88,
      tech: 83,
    });
  });

  it('lets the viewed player define the ceiling when they are the strongest Shinsa profile', () => {
    const baseline = __test.buildShinsaBaselineFromSnapshots([
      makeSnapshot({
        ratings: { overall: 6800, singles: 6900, doubles: 5400 },
        families: {
          overall: { speed: 2500, stamina: 2700, mobility: 2800, tech: 2900 },
          singles: { speed: 2450, stamina: 2650, mobility: 2750, tech: 2850 },
          doubles: { speed: 2050, stamina: 2250, mobility: 2350, tech: 2450 },
        },
      }),
    ]);

    const currentUser = makeSnapshot({
      ratings: { overall: 7350, singles: 7500, doubles: 6100 },
      families: {
        overall: { speed: 2550, stamina: 3050, mobility: 3150, tech: 3350 },
        singles: { speed: 2525, stamina: 3000, mobility: 3100, tech: 3300 },
        doubles: { speed: 2250, stamina: 2550, mobility: 2650, tech: 2750 },
      },
    });

    __test.mergeSnapshotIntoShinsaBaseline(baseline, currentUser, { count: false });

    assert.equal(__test.buildRelativeRating(7350, baseline.ratings.overall).score100, 100);
    assert.deepEqual(
      __test.buildRelativeBucketScores(currentUser.families.overall, baseline.families.overall),
      { speed: 100, stamina: 100, mobility: 100, tech: 100 }
    );
  });
});

describe('player scouting card cadence', () => {
  it('groups nearby plays into the same session and splits long gaps', () => {
    const sessions = __test.countCadenceSessions([
      { played_at_utc: '2026-03-28 10:00:00', date_played: '2026-03-28 19:00:00 (GMT+9)' },
      { played_at_utc: '2026-03-28 10:24:00', date_played: '2026-03-28 19:24:00 (GMT+9)' },
      { played_at_utc: '2026-03-28 12:05:00', date_played: '2026-03-28 21:05:00 (GMT+9)' },
      { played_at_utc: '2026-03-29 09:10:00', date_played: '2026-03-29 18:10:00 (GMT+9)' },
    ], 2);

    assert.equal(sessions, 3);
  });

  it('falls back to active-day session count when timestamps are unavailable', () => {
    const sessions = __test.countCadenceSessions([
      { played_at_utc: '', date_played: '' },
      { played_at_utc: '', date_played: '' },
    ], 4);

    assert.equal(sessions, 4);
  });

  it('blends frequency and volume percentiles into the headline cadence score', () => {
    const cadence = __test.buildCadenceSummary({
      activeDays30: 12,
      plays30: 48,
      sessions30: 15,
      frequencyPercentile: 80,
      volumePercentile: 55,
      cohortSize: 42,
    });

    assert.equal(cadence.score100, 70);
    assert.equal(cadence.label, 'Regular');
    assert.equal(cadence.activeDaysPerWeek, 2.8);
    assert.equal(cadence.sessionsPerWeek, 3.5);
    assert.equal(cadence.playsPerSession, 3.2);
    assert.equal(cadence.cohortSize, 42);
  });
});

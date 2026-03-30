const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { LEVEL_BASE_POINTS } = require('./titleProgress');
const { __test } = require('./playerScoutingCard');

function makeChart(key, { level, mode = 'Single', skills = [] }) {
  return {
    key,
    level,
    mode,
    skills: skills.map((slug) => ({ slug })),
  };
}

function makeRating(level, ratio) {
  return LEVEL_BASE_POINTS[level] * 1.5 * ratio;
}

describe('player scouting card absolute capability model', () => {
  it('treats thin level samples as partial demonstrated mastery', () => {
    const levelScore = __test.buildCapabilityLevelScore({
      chartCount: 5,
      playedRatios: [1],
    });

    assert.equal(levelScore.representativeTarget, 5);
    assert.equal(levelScore.sampleSize, 1);
    assert.equal(levelScore.score100, 45);
  });

  it('lets short endgame chart pools reach full mastery when fully demonstrated', () => {
    const levelScore = __test.buildCapabilityLevelScore({
      chartCount: 2,
      playedRatios: [1, 1],
    });

    assert.equal(levelScore.representativeTarget, 2);
    assert.equal(levelScore.sampleSize, 2);
    assert.equal(levelScore.score100, 100);
  });

  it('weights harder levels more heavily inside each attribute bucket', () => {
    const songCatalog = {
      charts: [
        makeChart('s10-1', { level: 10, skills: ['bursty'] }),
        makeChart('s10-2', { level: 10, skills: ['bursty'] }),
        makeChart('s10-3', { level: 10, skills: ['bursty'] }),
        makeChart('s10-4', { level: 10, skills: ['bursty'] }),
        makeChart('s10-5', { level: 10, skills: ['bursty'] }),
        makeChart('s25-1', { level: 25, skills: ['bursty'] }),
        makeChart('s25-2', { level: 25, skills: ['bursty'] }),
        makeChart('s25-3', { level: 25, skills: ['bursty'] }),
        makeChart('s25-4', { level: 25, skills: ['bursty'] }),
        makeChart('s25-5', { level: 25, skills: ['bursty'] }),
      ],
    };

    const bestByChart = new Map([
      ['s10-1', { rating: makeRating(10, 1) }],
      ['s10-2', { rating: makeRating(10, 1) }],
      ['s10-3', { rating: makeRating(10, 1) }],
      ['s10-4', { rating: makeRating(10, 1) }],
      ['s10-5', { rating: makeRating(10, 1) }],
      ['s25-1', { rating: makeRating(25, 0.5) }],
      ['s25-2', { rating: makeRating(25, 0.5) }],
      ['s25-3', { rating: makeRating(25, 0.5) }],
      ['s25-4', { rating: makeRating(25, 0.5) }],
      ['s25-5', { rating: makeRating(25, 0.5) }],
    ]);

    const bucketScores = __test.buildScopedCapabilityScores(songCatalog, bestByChart, 'Single');

    assert.equal(bucketScores.speed, 57);
    assert.equal(bucketScores.stamina, 0);
  });

  it('keeps overall, singles, and doubles ratings tied to the visible rails', () => {
    const rating = __test.buildCompositeScopeRating({
      speed: 80,
      stamina: 79,
      mobility: 77,
      tech: 75,
    });

    assert.equal(rating.score100, 78);
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

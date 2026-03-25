const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ALPHA_ACUTE,
  ALPHA_CHRONIC,
  EXTENDED_BASE_POINTS,
  MIN_PLAY_DAYS,
  calculatePlayLoad,
  computeEWMA,
  computeAllProfiles,
  getTrainingStatus,
  predictComfortableLevel,
  predictGradeAtLevel,
  toLocalDate,
} = require('./trainingLoad');

// ─── calculatePlayLoad ─────────────────────────────────

describe('calculatePlayLoad', () => {
  it('computes load for a normal AA grade at level 20', () => {
    // LEVEL_BASE_POINTS[20] = 650, GRADE_MULTIPLIER['AA'] = 1.00
    assert.equal(calculatePlayLoad(20, 'AA', 900000), 650);
  });

  it('computes load for SSS+ at level 25', () => {
    // 1300 * 1.50 = 1950
    assert.equal(calculatePlayLoad(25, 'SSS+', 995000), 1950);
  });

  it('computes load for F grade with score > 0', () => {
    // L20: 650 * 0.20 * clamp(400000/500000, 0.1, 1.0) = 650 * 0.20 * 0.8 = 104
    assert.equal(calculatePlayLoad(20, 'F', 400000), 104);
  });

  it('computes load for F grade (stage break) with score = 0', () => {
    // L20: 650 * 0.10 = 65
    assert.equal(calculatePlayLoad(20, 'F', 0), 65);
  });

  it('computes load for STAGE_BREAK alias', () => {
    // normalizeGrade('STAGE_BREAK') => 'F', score=0 => 650 * 0.10 = 65
    assert.equal(calculatePlayLoad(20, 'STAGE_BREAK', 0), 65);
  });

  it('handles sub-level-10 plays', () => {
    // L5 = 50 base points, AA = 1.00
    assert.equal(calculatePlayLoad(5, 'AA', 900000), 50);
  });

  it('handles level 1', () => {
    // L1 = 10 base points, A = 0.80 => 8
    assert.equal(calculatePlayLoad(1, 'A', 750000), 8);
  });

  it('clamps level to 1-28 range', () => {
    // level 0 => clamped to 1 => 10 base points
    assert.equal(calculatePlayLoad(0, 'AA', 900000), 10);
    // level 30 => clamped to 28 => 1810 base points
    assert.equal(calculatePlayLoad(30, 'AA', 900000), 1810);
  });

  it('handles missing/empty grade by falling back to score', () => {
    // No grade, score 900000 => gradeFromScore => 'AA' => 650 * 1.00
    assert.equal(calculatePlayLoad(20, '', 900000), 650);
  });

  it('handles X_ grade aliases (PIUGame stage break)', () => {
    // normalizeGrade('X_SSS') => 'F'
    const load = calculatePlayLoad(20, 'X_SSS', 0);
    assert.equal(load, 65); // 650 * 0.10
  });
});

// ─── toLocalDate ────────────────────────────────────────

describe('toLocalDate', () => {
  it('returns correct date for UTC timezone', () => {
    assert.equal(toLocalDate('2026-03-15T14:00:00Z', 'UTC'), '2026-03-15');
  });

  it('rolls back before rollover hour', () => {
    // 2 AM UTC is before 4 AM rollover => counts as previous day
    assert.equal(toLocalDate('2026-03-15T02:00:00Z', 'UTC'), '2026-03-14');
  });

  it('does not roll back at rollover hour', () => {
    assert.equal(toLocalDate('2026-03-15T04:00:00Z', 'UTC'), '2026-03-15');
  });

  it('handles timezone offset (US Eastern)', () => {
    // 2026-03-15T06:00:00Z = 2026-03-15 02:00 EDT (DST active in March)
    // 2 AM local < 4 AM rollover => rolls back to March 14
    const date = toLocalDate('2026-03-15T06:00:00Z', 'America/New_York');
    assert.equal(date, '2026-03-14');
  });

  it('handles midnight session crossing with timezone', () => {
    // 2026-03-15T08:00:00Z = 2026-03-15 01:00 PDT (3 AM local is < 4 AM rollover)
    // Should count as previous day
    const date = toLocalDate('2026-03-15T08:00:00Z', 'America/Los_Angeles');
    assert.equal(date, '2026-03-14');
  });

  it('handles DST spring-forward transition', () => {
    // US DST springs forward on March 8, 2026
    // 2026-03-08T09:00:00Z = 2026-03-08 05:00 EDT (after spring-forward)
    const date = toLocalDate('2026-03-08T09:00:00Z', 'America/New_York');
    assert.equal(date, '2026-03-08');
  });

  it('handles DST fall-back transition', () => {
    // US DST falls back on Nov 1, 2026
    // 2026-11-01T07:00:00Z = 2026-11-01 02:00 EST (after fall-back)
    const date = toLocalDate('2026-11-01T07:00:00Z', 'America/New_York');
    assert.equal(date, '2026-10-31'); // 2 AM < 4 AM rollover
  });

  it('falls back to UTC for empty timezone', () => {
    assert.equal(toLocalDate('2026-03-15T14:00:00Z', ''), '2026-03-15');
  });

  it('returns null for invalid date', () => {
    assert.equal(toLocalDate('not-a-date', 'UTC'), null);
  });
});

// ─── computeEWMA ────────────────────────────────────────

describe('computeEWMA', () => {
  it('converges to daily load with constant input', () => {
    // 30 days of constant 1000 load
    const dailyLoads = [];
    for (let i = 0; i < 30; i++) {
      const date = `2026-03-${String(i + 1).padStart(2, '0')}`;
      dailyLoads.push({ date, load: 1000, playCount: 5 });
    }
    const result = computeEWMA(dailyLoads, '2026-03-01', '2026-03-30');
    // After 30 days of constant 1000, EWMA should converge near 1000
    // Chronic (28-day): should be close but not quite there
    assert.ok(result.baseSkill > 800, `baseSkill ${result.baseSkill} should be > 800`);
    assert.ok(result.baseSkill < 1000, `baseSkill ${result.baseSkill} should be < 1000`);
    // Acute (7-day): converges faster
    assert.ok(result.currentForm > 950, `currentForm ${result.currentForm} should be > 950`);
  });

  it('decays to zero with no activity', () => {
    const dailyLoads = [{ date: '2026-03-01', load: 1000, playCount: 5 }];
    const result = computeEWMA(dailyLoads, '2026-03-01', '2026-03-31');
    // After 30 days of no activity following one day, should be very low
    assert.ok(result.currentForm < 5, `currentForm ${result.currentForm} should be near 0`);
    assert.ok(result.baseSkill < 50, `baseSkill ${result.baseSkill} should be low`);
  });

  it('tracks play days correctly', () => {
    const dailyLoads = [
      { date: '2026-03-01', load: 500, playCount: 3 },
      { date: '2026-03-05', load: 800, playCount: 4 },
      { date: '2026-03-10', load: 600, playCount: 2 },
    ];
    const result = computeEWMA(dailyLoads, '2026-03-01', '2026-03-15');
    assert.equal(result.playDays, 3);
  });

  it('returns history for each day in range', () => {
    const result = computeEWMA([], '2026-03-01', '2026-03-07');
    assert.equal(result.history.length, 7);
    assert.equal(result.history[0].date, '2026-03-01');
    assert.equal(result.history[6].date, '2026-03-07');
  });
});

// ─── getTrainingStatus ──────────────────────────────────

describe('getTrainingStatus', () => {
  it('returns Idle for zero play days and zero skills', () => {
    const status = getTrainingStatus(0, 0, 0);
    assert.equal(status.label, 'Idle');
    assert.equal(status.ratio, null);
  });

  it('returns Calibrating for 1-6 play days', () => {
    const status = getTrainingStatus(100, 80, 3);
    assert.equal(status.label, 'Calibrating');
    assert.equal(status.ratio, null);
  });

  it('returns Idle for zero baseSkill after calibration period', () => {
    const status = getTrainingStatus(0, 0, 10);
    assert.equal(status.label, 'Idle');
    assert.equal(status.ratio, null);
  });

  it('returns Overclocked at 150%+', () => {
    const status = getTrainingStatus(100, 160, 10);
    assert.equal(status.label, 'Overclocked');
    assert.equal(status.ratio, 160);
  });

  it('returns In The Zone at 100-149%', () => {
    const status = getTrainingStatus(100, 120, 10);
    assert.equal(status.label, 'In The Zone');
    assert.equal(status.ratio, 120);
  });

  it('returns Cruising at 80-99%', () => {
    const status = getTrainingStatus(100, 90, 10);
    assert.equal(status.label, 'Cruising');
    assert.equal(status.ratio, 90);
  });

  it('returns Warming Up at 50-79%', () => {
    const status = getTrainingStatus(100, 60, 10);
    assert.equal(status.label, 'Warming Up');
    assert.equal(status.ratio, 60);
  });

  it('returns Cooling Down at 1-49%', () => {
    const status = getTrainingStatus(100, 30, 10);
    assert.equal(status.label, 'Cooling Down');
    assert.equal(status.ratio, 30);
  });

  it('boundary: exactly 150% is Overclocked', () => {
    const status = getTrainingStatus(100, 150, 10);
    assert.equal(status.label, 'Overclocked');
  });

  it('boundary: exactly 100% is In The Zone', () => {
    const status = getTrainingStatus(100, 100, 10);
    assert.equal(status.label, 'In The Zone');
  });

  it('boundary: exactly 80% is Cruising', () => {
    const status = getTrainingStatus(100, 80, 10);
    assert.equal(status.label, 'Cruising');
  });

  it('boundary: exactly 50% is Warming Up', () => {
    const status = getTrainingStatus(100, 50, 10);
    assert.equal(status.label, 'Warming Up');
  });
});

// ─── predictComfortableLevel ────────────────────────────

describe('predictComfortableLevel', () => {
  it('predicts level 20 for avg play load of 650', () => {
    // baseSkill=650, chronicPlayCount=1 => avgPlayLoad=650
    // LEVEL_BASE_POINTS[20] = 650
    assert.equal(predictComfortableLevel(650, 1), 20);
  });

  it('predicts level 15 for avg play load of 250', () => {
    assert.equal(predictComfortableLevel(250, 1), 15);
  });

  it('predicts level 1 for very low load', () => {
    assert.equal(predictComfortableLevel(5, 1), 1);
  });

  it('accounts for plays per day', () => {
    // baseSkill=3250, chronicPlayCount=5 => avgPlayLoad=650 => level 20
    assert.equal(predictComfortableLevel(3250, 5), 20);
  });
});

// ─── Mode isolation ─────────────────────────────────────

describe('mode isolation', () => {
  it('singles plays do not affect double profile', () => {
    const plays = [];
    // 20 days of singles plays at L20 AA
    for (let i = 0; i < 20; i++) {
      const d = new Date(Date.now() - i * 86400000);
      plays.push({
        level: 20, grade: 'AA', score: 900000, mode: 'Single',
        played_at_utc: d.toISOString(), date_played: '',
      });
    }
    const result = computeAllProfiles(plays, 'UTC', null);
    assert.ok(result.single.base_skill > 0, 'single should have load');
    assert.equal(result.double.base_skill, 0, 'double should have no load');
    assert.equal(result.double.play_days, 0, 'double should have 0 play days');
  });
});

// ─── Overall profile ────────────────────────────────────

describe('overall profile', () => {
  it('does not include comfortable_level or grade_predictions', () => {
    const plays = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(Date.now() - i * 86400000);
      plays.push({
        level: 20, grade: 'AA', score: 900000, mode: 'Single',
        played_at_utc: d.toISOString(), date_played: '',
      });
    }
    const result = computeAllProfiles(plays, 'UTC', null);
    assert.equal(result.overall.comfortable_level, undefined);
    assert.equal(result.overall.grade_predictions, undefined);
  });
});

// ─── Per-profile calibrating ────────────────────────────

describe('per-profile calibrating', () => {
  it('overall can be ready while double is calibrating', () => {
    const plays = [];
    // 10 days of singles + 3 days of doubles
    for (let i = 0; i < 10; i++) {
      const d = new Date(Date.now() - i * 86400000);
      plays.push({
        level: 20, grade: 'AA', score: 900000, mode: 'Single',
        played_at_utc: d.toISOString(), date_played: '',
      });
    }
    for (let i = 0; i < 3; i++) {
      const d = new Date(Date.now() - i * 86400000);
      plays.push({
        level: 18, grade: 'A', score: 750000, mode: 'Double',
        played_at_utc: d.toISOString(), date_played: '',
      });
    }
    const result = computeAllProfiles(plays, 'UTC', null);
    assert.equal(result.overall.calibrating, false);
    assert.equal(result.single.calibrating, false);
    assert.equal(result.double.calibrating, true);
    assert.equal(result.double.comfortable_level, null);
    assert.equal(result.double.grade_predictions, null);
    assert.equal(result.double.training_status, 'Calibrating');
  });
});

// ─── Grade normalization ────────────────────────────────

describe('grade normalization in play load', () => {
  it('handles AP alias for A+', () => {
    // L20 with A+ (0.90) => 650 * 0.90 = 585
    assert.equal(calculatePlayLoad(20, 'AP', 825000), 585);
  });

  it('handles SSP alias for SS+', () => {
    // L20 with SS+ (1.38) => 650 * 1.38 = 897
    assert.equal(calculatePlayLoad(20, 'SSP', 985000), 897);
  });
});

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
  computeModeProfile,
  getReadinessStatus,
  getTrainingStatus,
  predictLikelyPassLevel,
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

// ─── predictGradeAtLevel ───────────────────────────────

describe('predictGradeAtLevel', () => {
  it('prefers exact-level recent clears when enough direct evidence exists', () => {
    const now = Date.now();
    const plays = [
      {
        level: 24, grade: 'S', score: 970000, mode: 'Double',
        played_at_utc: new Date(now - 1 * 86400000).toISOString(), date_played: '',
      },
      {
        level: 24, grade: 'S+', score: 976000, mode: 'Double',
        played_at_utc: new Date(now - 2 * 86400000).toISOString(), date_played: '',
      },
      {
        level: 24, grade: 'SS', score: 982000, mode: 'Double',
        played_at_utc: new Date(now - 3 * 86400000).toISOString(), date_played: '',
      },
      {
        level: 21, grade: 'AA', score: 905000, mode: 'Double',
        played_at_utc: new Date(now - 1 * 86400000).toISOString(), date_played: '',
      },
      {
        level: 22, grade: 'AA+', score: 930000, mode: 'Double',
        played_at_utc: new Date(now - 2 * 86400000).toISOString(), date_played: '',
      },
      {
        level: 25, grade: 'AA', score: 905000, mode: 'Double',
        played_at_utc: new Date(now - 1 * 86400000).toISOString(), date_played: '',
      },
    ];

    assert.equal(predictGradeAtLevel(24, plays, 'UTC', 23), 'S+');
  });

  it('ignores positive-score x_ failed grades when building prediction evidence', () => {
    const now = Date.now();
    const plays = [
      {
        level: 25, grade: 'x_aa_p', score: 934370, mode: 'Double',
        played_at_utc: new Date(now - 1 * 86400000).toISOString(), date_played: '',
      },
      {
        level: 24, grade: 'x_a', score: 799987, mode: 'Double',
        played_at_utc: new Date(now - 2 * 86400000).toISOString(), date_played: '',
      },
      {
        level: 23, grade: 'x_a_p', score: 886004, mode: 'Double',
        played_at_utc: new Date(now - 3 * 86400000).toISOString(), date_played: '',
      },
    ];

    // With no valid recent clears left, the prediction should fall back to comfortable-level extrapolation.
    assert.equal(predictGradeAtLevel(24, plays, 'UTC', 23), 'A+');
  });
});

// ─── predictLikelyPassLevel ────────────────────────────

describe('predictLikelyPassLevel', () => {
  function makePlay({ level, grade, score, daysAgo, mode = 'Double' }) {
    return {
      level,
      grade,
      score,
      mode,
      played_at_utc: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      date_played: '',
    };
  }

  it('recognizes a likely new pass level when direct recent clears back it up', () => {
    const plays = [
      ...Array.from({ length: 5 }, (_, i) => makePlay({ level: 23, grade: 'SS', score: 982000 + i * 50, daysAgo: 10 + i })),
      ...Array.from({ length: 8 }, (_, i) => makePlay({ level: 24, grade: 'S+', score: 976000 + i * 100, daysAgo: 6 + i })),
      ...Array.from({ length: 4 }, (_, i) => makePlay({ level: 25, grade: 'AA+', score: 940000 + i * 1500, daysAgo: 1 + i })),
    ];

    const likelyPass = predictLikelyPassLevel(7983, 7855, 1128, 23, plays, 'UTC');
    assert.equal(likelyPass.level, 25);
    assert.equal(likelyPass.target.clear_count, 4);
  });

  it('does not overreach on load alone when there is no direct target-level evidence and form is cold', () => {
    const plays = [
      ...Array.from({ length: 15 }, (_, i) => makePlay({ level: 23, grade: 'AAA', score: 955000 + i * 120, daysAgo: 10 + i })),
      ...Array.from({ length: 9 }, (_, i) => makePlay({ level: 24, grade: 'AA+', score: 940000 + i * 250, daysAgo: 1 + i })),
    ];

    const likelyPass = predictLikelyPassLevel(1477, 618, 1522, 26, plays, 'UTC');
    assert.equal(likelyPass.level, 24);
  });

  it('treats strong positive-score stage breaks as near-pass evidence for the next level up', () => {
    const plays = [
      ...Array.from({ length: 7 }, (_, i) => makePlay({ level: 24, grade: 'S', score: 971000 + i * 300, daysAgo: 3 + i })),
      makePlay({ level: 25, grade: 'x_aa_p', score: 934370, daysAgo: 1 }),
      makePlay({ level: 25, grade: 'x_aa_p', score: 930950, daysAgo: 2 }),
    ];

    const likelyPass = predictLikelyPassLevel(7800, 8200, 1110, 23, plays, 'UTC');
    assert.equal(likelyPass.level, 25);
    assert.equal(likelyPass.target.strong_near_pass_count, 2);
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

// ─── Readiness ────────────────────────────────────────

describe('readiness', () => {
  it('trusted profile has readiness ≈ 100 - training_ratio', () => {
    // 10 days of constant 800 load → trusted profile
    const dailyLoads = [];
    for (let i = 0; i < 10; i++) {
      dailyLoads.push({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, load: 800, playCount: 4, clearCount: 3 });
    }
    const result = computeModeProfile(dailyLoads, '2026-03-01', '2026-03-10', [], 'UTC', false);
    const { profile } = result;
    assert.ok(profile.readiness != null, 'readiness should not be null for trusted profile');
    assert.ok(profile.taper_distance != null, 'taper_distance should not be null');
    // readiness ≈ 100 - training_ratio (within ±1 due to rounding)
    const expected = Math.round(100 - profile.training_ratio);
    assert.ok(Math.abs(profile.readiness - expected) <= 1,
      `readiness ${profile.readiness} should be within ±1 of ${expected}`);
  });

  it('calibrating profile has readiness and taper_distance null', () => {
    // Only 3 play days → calibrating
    const dailyLoads = [
      { date: '2026-03-01', load: 500, playCount: 3, clearCount: 2 },
      { date: '2026-03-03', load: 600, playCount: 4, clearCount: 3 },
      { date: '2026-03-05', load: 700, playCount: 5, clearCount: 4 },
    ];
    const result = computeModeProfile(dailyLoads, '2026-03-01', '2026-03-07', [], 'UTC', false);
    const { profile } = result;
    assert.equal(profile.calibrating, true);
    assert.equal(profile.readiness, null);
    assert.equal(profile.taper_distance, null);
    assert.equal(profile.readiness_status, 'Calibrating');
  });

  it('ewma history readiness is null until 7th play day', () => {
    const dailyLoads = [];
    for (let i = 0; i < 10; i++) {
      dailyLoads.push({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, load: 500, playCount: 3, clearCount: 2 });
    }
    const result = computeEWMA(dailyLoads, '2026-03-01', '2026-03-10');
    // First 6 entries should have readiness null (< 7 play days)
    for (let i = 0; i < 6; i++) {
      assert.equal(result.history[i].readiness, null,
        `history[${i}] readiness should be null (only ${i + 1} play days)`);
    }
    // 7th entry onward should have numeric readiness
    assert.ok(result.history[6].readiness != null,
      'history[6] readiness should be numeric (7 play days)');
  });

  it('computeAllProfiles propagates readiness into ewma_history', () => {
    // Build plays for 10 days so profile is trusted
    const plays = [];
    for (let i = 0; i < 10; i++) {
      const date = `2026-03-${String(i + 1).padStart(2, '0')}`;
      plays.push({
        mode: 'Single',
        level: 20,
        grade: 'AA',
        score: 900000,
        date_played: date,
        played_at_utc: `${date}T18:00:00Z`,
      });
    }
    const result = computeAllProfiles(plays, 'UTC', null);
    const lastEntry = result.ewma_history[result.ewma_history.length - 1];
    // Single mode should have readiness in history
    assert.ok(lastEntry.single.readiness != null,
      'single readiness should be propagated into ewma_history');
    // Overall should also have readiness
    assert.ok(lastEntry.overall.readiness != null,
      'overall readiness should be propagated into ewma_history');
  });

  it('getReadinessStatus returns correct zones', () => {
    assert.equal(getReadinessStatus(35).label, 'Peaked');
    assert.equal(getReadinessStatus(10).label, 'Fresh');
    assert.equal(getReadinessStatus(0).label, 'Balanced');
    assert.equal(getReadinessStatus(-20).label, 'Building');
    assert.equal(getReadinessStatus(-60).label, 'Overtrained');
    assert.equal(getReadinessStatus(null).label, null);
  });
});

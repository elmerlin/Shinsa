const {
  LEVEL_BASE_POINTS,
  GRADE_MULTIPLIER,
  normalizeGrade,
  gradeFromScore,
} = require('./titleProgress');
const { parsePiugamePlayedAtUtc } = require('./piugameDate');

// Extended base points for levels below 10
const EXTENDED_BASE_POINTS = {
  1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80, 9: 90,
  ...LEVEL_BASE_POINTS,
};

const SORTED_LEVELS = Object.keys(EXTENDED_BASE_POINTS)
  .map(Number)
  .sort((a, b) => a - b);

// EWMA time constants
const CHRONIC_DAYS = 28;
const ACUTE_DAYS = 7;
const ALPHA_CHRONIC = 2 / (CHRONIC_DAYS + 1);
const ALPHA_ACUTE = 2 / (ACUTE_DAYS + 1);

const LOOKBACK_DAYS = 56; // 2x chronic window for EWMA warmup
const QUERY_BUFFER_DAYS = 60; // extra buffer for timezone/DST edge
const MIN_PLAY_DAYS = 7;
const PREDICTION_LOOKBACK_DAYS = 28;
const MAX_PREDICTION_LEVEL_DISTANCE = 3;
const LEVEL_SCORE_ADJUSTMENT = 50000;
const MIN_EXACT_PREDICTION_PLAYS = 3;
const STRONG_NEAR_PASS_SCORE = 900000;
const SOFT_NEAR_PASS_SCORE = 825000;
const LIKELY_PASS_MIN_SUPPORT = 5;
const EPSILON = 0.01;
const DEFAULT_ROLLOVER_HOUR = 4;

const TRAINING_ZONES = [
  { minRatio: 1.50, label: 'Overclocked', color: '#F97316' },
  { minRatio: 1.00, label: 'In The Zone', color: '#22C55E' },
  { minRatio: 0.80, label: 'Cruising', color: '#3B82F6' },
  { minRatio: 0.50, label: 'Warming Up', color: '#EAB308' },
  { minRatio: 0.01, label: 'Cooling Down', color: '#94A3B8' },
];
const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];

function calculatePlayLoad(level, rawGrade, score) {
  const numericLevel = parseInt(level, 10) || 0;
  const numericScore = parseInt(score, 10) || 0;
  const clampedLevel = Math.max(1, Math.min(28, numericLevel));
  const basePoints = EXTENDED_BASE_POINTS[clampedLevel] || 10;

  const grade = normalizeGrade(rawGrade) || (numericScore > 0 ? gradeFromScore(numericScore) : '') || 'F';

  if (grade === 'F') {
    if (numericScore > 0) {
      return Math.round(basePoints * 0.20 * Math.max(0.1, Math.min(1.0, numericScore / 500000)));
    }
    return Math.round(basePoints * 0.10);
  }

  const mult = GRADE_MULTIPLIER[grade];
  if (!mult) return Math.round(basePoints * 0.10);
  return Math.round(basePoints * mult);
}

function resolvePlayResult(play) {
  const score = parseInt(play?.score, 10) || 0;
  const grade = normalizeGrade(play?.grade) || (score > 0 ? gradeFromScore(score) : '') || 'F';
  return {
    score,
    grade,
    cleared: score > 0 && grade !== 'F',
    positiveScoreFail: score > 0 && grade === 'F',
  };
}

function toLocalDate(utcIso, ianaTimezone, rolloverHour) {
  const tz = ianaTimezone || 'UTC';
  const rollover = rolloverHour != null ? rolloverHour : DEFAULT_ROLLOVER_HOUR;
  const dt = new Date(utcIso);
  if (Number.isNaN(dt.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(dt).map((p) => [p.type, p.value])
  );
  const localHour = parseInt(parts.hour, 10);
  if (localHour < rollover) {
    const prev = new Date(dt.getTime() - 86400000);
    const pf = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const pp = Object.fromEntries(
      pf.formatToParts(prev).map((p) => [p.type, p.value])
    );
    return `${pp.year}-${pp.month}-${pp.day}`;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function resolvePlayUtc(play) {
  if (play.played_at_utc) {
    const d = new Date(play.played_at_utc);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (play.date_played) {
    const parsed = parsePiugamePlayedAtUtc(play.date_played);
    if (parsed) return parsed.toISOString();
  }
  return null;
}

function aggregateDailyLoads(plays, ianaTimezone) {
  const dayMap = new Map();

  for (const play of plays) {
    const utc = resolvePlayUtc(play);
    if (!utc) continue;

    const loadDate = toLocalDate(utc, ianaTimezone);
    if (!loadDate) continue;

    const load = calculatePlayLoad(play.level, play.grade, play.score);
    const entry = dayMap.get(loadDate) || { date: loadDate, load: 0, playCount: 0, mode: play.mode };
    entry.load += load;
    entry.playCount += 1;
    dayMap.set(loadDate, entry);
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateDailyLoadsByMode(plays, ianaTimezone) {
  const overall = [];
  const single = [];
  const double = [];

  for (const play of plays) {
    const utc = resolvePlayUtc(play);
    if (!utc) continue;
    const loadDate = toLocalDate(utc, ianaTimezone);
    if (!loadDate) continue;
    const load = calculatePlayLoad(play.level, play.grade, play.score);
    const mode = String(play.mode || '').trim();
    const grade = normalizeGrade(play.grade) || (parseInt(play.score, 10) > 0 ? gradeFromScore(parseInt(play.score, 10)) : '') || 'F';
    const cleared = grade !== 'F';

    overall.push({ date: loadDate, load, mode, cleared });
    if (mode === 'Single') single.push({ date: loadDate, load, cleared });
    else if (mode === 'Double') double.push({ date: loadDate, load, cleared });
  }

  return {
    overall: sumByDate(overall),
    single: sumByDate(single),
    double: sumByDate(double),
  };
}

function sumByDate(entries) {
  const dayMap = new Map();
  for (const e of entries) {
    const existing = dayMap.get(e.date) || { date: e.date, load: 0, playCount: 0, clearCount: 0 };
    existing.load += e.load;
    existing.playCount += 1;
    if (e.cleared) existing.clearCount += 1;
    dayMap.set(e.date, existing);
  }
  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeEWMA(dailyLoads, startDate, endDate) {
  const loadMap = new Map();
  for (const d of dailyLoads) {
    loadMap.set(d.date, d);
  }

  let baseSkill = 0;
  let currentForm = 0;
  let chronicPlayCount = 0;
  let chronicClearCount = 0;
  const history = [];
  const playDates = new Set();
  let current = startDate;

  while (current <= endDate) {
    const day = loadMap.get(current);
    const dailyLoad = day ? day.load : 0;
    const dailyPlayCount = day ? day.playCount : 0;
    const dailyClearCount = day ? (day.clearCount || 0) : 0;

    baseSkill = baseSkill * (1 - ALPHA_CHRONIC) + dailyLoad * ALPHA_CHRONIC;
    currentForm = currentForm * (1 - ALPHA_ACUTE) + dailyLoad * ALPHA_ACUTE;
    chronicPlayCount = chronicPlayCount * (1 - ALPHA_CHRONIC) + dailyPlayCount * ALPHA_CHRONIC;
    chronicClearCount = chronicClearCount * (1 - ALPHA_CHRONIC) + dailyClearCount * ALPHA_CHRONIC;

    if (dailyPlayCount > 0) playDates.add(current);

    history.push({
      date: current,
      base_skill: round2(baseSkill),
      current_form: round2(currentForm),
      chronic_play_count: round2(chronicPlayCount),
      chronic_clear_count: round2(chronicClearCount),
    });

    current = addDays(current, 1);
  }

  return {
    baseSkill: round2(baseSkill),
    currentForm: round2(currentForm),
    chronicPlayCount: round2(chronicPlayCount),
    chronicClearCount: round2(chronicClearCount),
    playDays: playDates.size,
    history,
  };
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getTrainingStatus(baseSkill, currentForm, playDays) {
  if (playDays === 0 && baseSkill <= EPSILON && currentForm <= EPSILON) {
    return { label: 'Idle', color: '#6B7280', ratio: null };
  }
  if (playDays > 0 && playDays < MIN_PLAY_DAYS) {
    return { label: 'Calibrating', color: '#A855F7', ratio: null };
  }
  if (baseSkill <= EPSILON) {
    return { label: 'Idle', color: '#6B7280', ratio: null };
  }
  const ratio = currentForm / baseSkill;
  for (const zone of TRAINING_ZONES) {
    if (ratio >= zone.minRatio) {
      return { label: zone.label, color: zone.color, ratio: round2(ratio * 100) };
    }
  }
  return { label: 'Idle', color: '#6B7280', ratio: 0 };
}

function predictComfortableLevel(baseSkill, chronicClearCount) {
  const avgPlayLoad = baseSkill / Math.max(chronicClearCount, 0.5);
  let comfortableLevel = 1;
  for (const level of SORTED_LEVELS) {
    if (EXTENDED_BASE_POINTS[level] <= avgPlayLoad) {
      comfortableLevel = level;
    }
  }
  return comfortableLevel;
}

function createLevelEvidence(level) {
  return {
    level,
    attempt_count: 0,
    clear_count: 0,
    clear_day_peak: 0,
    near_pass_count: 0,
    strong_near_pass_count: 0,
    best_clear_score: 0,
    best_clear_grade: '',
    best_near_pass_score: 0,
    best_positive_score: 0,
    clear_days: new Map(),
    clears: [],
    near_passes: [],
  };
}

function emptyLevelEvidence(level) {
  return {
    level,
    attempt_count: 0,
    clear_count: 0,
    clear_day_peak: 0,
    near_pass_count: 0,
    strong_near_pass_count: 0,
    best_clear_score: 0,
    best_clear_grade: '',
    best_near_pass_score: 0,
    best_positive_score: 0,
    clears: [],
    near_passes: [],
  };
}

function getLevelEvidence(levelMap, level) {
  if (level <= 0) return emptyLevelEvidence(level);
  return levelMap.get(level) || emptyLevelEvidence(level);
}

function buildRecentLevelEvidence(recentPlays, ianaTimezone) {
  const now = new Date();
  const levelMap = new Map();

  for (const play of recentPlays) {
    const playLevel = parseInt(play?.level, 10) || 0;
    if (playLevel <= 0) continue;

    const utc = resolvePlayUtc(play);
    if (!utc) continue;
    const playDate = new Date(utc);
    const daysAgo = (now.getTime() - playDate.getTime()) / 86400000;
    if (daysAgo > PREDICTION_LOOKBACK_DAYS || daysAgo < 0) continue;

    const localDate = toLocalDate(utc, ianaTimezone) || utc.slice(0, 10);
    const { score, grade, cleared, positiveScoreFail } = resolvePlayResult(play);
    const entry = levelMap.get(playLevel) || createLevelEvidence(playLevel);

    entry.attempt_count += 1;
    entry.best_positive_score = Math.max(entry.best_positive_score, score);

    const playDetail = {
      song_title: play.song_title || '',
      mode: play.mode || '',
      level: playLevel,
      score,
      grade,
      background_url: play.background_url || '',
    };

    if (cleared) {
      entry.clear_count += 1;
      entry.best_clear_score = Math.max(entry.best_clear_score, score);
      if (score >= entry.best_clear_score) {
        entry.best_clear_grade = grade;
      }
      entry.clear_days.set(localDate, (entry.clear_days.get(localDate) || 0) + 1);
      entry.clears.push(playDetail);
    } else if (positiveScoreFail && score >= SOFT_NEAR_PASS_SCORE) {
      entry.near_pass_count += 1;
      entry.best_near_pass_score = Math.max(entry.best_near_pass_score, score);
      if (score >= STRONG_NEAR_PASS_SCORE) {
        entry.strong_near_pass_count += 1;
      }
      entry.near_passes.push(playDetail);
    }

    levelMap.set(playLevel, entry);
  }

  for (const [level, entry] of levelMap.entries()) {
    let clearDayPeak = 0;
    for (const count of entry.clear_days.values()) {
      if (count > clearDayPeak) clearDayPeak = count;
    }
    levelMap.set(level, {
      level: entry.level,
      attempt_count: entry.attempt_count,
      clear_count: entry.clear_count,
      clear_day_peak: clearDayPeak,
      near_pass_count: entry.near_pass_count,
      strong_near_pass_count: entry.strong_near_pass_count,
      best_clear_score: entry.best_clear_score,
      best_clear_grade: entry.best_clear_grade,
      best_near_pass_score: entry.best_near_pass_score,
      best_positive_score: entry.best_positive_score,
      clears: entry.clears.sort((a, b) => b.score - a.score).slice(0, 20),
      near_passes: entry.near_passes.sort((a, b) => b.score - a.score).slice(0, 10),
    });
  }

  return levelMap;
}

function gradeFromWeightedScores(entries, scoreKey) {
  if (!entries.length) return null;

  let weightedSum = 0;
  let weightTotal = 0;
  for (const entry of entries) {
    weightedSum += entry[scoreKey] * entry.weight;
    weightTotal += entry.weight;
  }

  if (weightTotal <= 0) return null;
  return gradeFromScore(Math.round(weightedSum / weightTotal));
}

function gradeAtLeast(grade, minimum) {
  const gradeIndex = GRADE_ORDER.indexOf(String(grade || '').trim());
  const minimumIndex = GRADE_ORDER.indexOf(String(minimum || '').trim());
  if (gradeIndex === -1 || minimumIndex === -1) return false;
  return gradeIndex >= minimumIndex;
}

function predictLoadSupportedPassLevel(avgPlayLoad) {
  if (avgPlayLoad == null) return null;
  let level = 1;
  for (const candidate of SORTED_LEVELS) {
    const requiredLoad = (EXTENDED_BASE_POINTS[candidate] || 0) * (GRADE_MULTIPLIER['A+'] || 0.9);
    if (requiredLoad <= avgPlayLoad) {
      level = candidate;
    }
  }
  return level;
}

function getLikelyPassConfidence(supportScore) {
  if (supportScore >= 10) return 'High';
  if (supportScore >= 7) return 'Medium';
  return 'Low';
}

function scoreLikelyPassCandidate(targetLevel, levelEvidenceMap, context) {
  const target = getLevelEvidence(levelEvidenceMap, targetLevel);
  const previous = getLevelEvidence(levelEvidenceMap, targetLevel - 1);
  const twoBelow = getLevelEvidence(levelEvidenceMap, targetLevel - 2);
  const formRatio = context.baseSkill > EPSILON ? (context.currentForm / context.baseSkill) : null;
  const loadSupportedPassLevel = predictLoadSupportedPassLevel(context.avgPlayLoad);
  const predictedGrade = predictGradeAtLevel(
    targetLevel,
    context.recentPlays,
    context.ianaTimezone,
    context.comfortableLevel
  );

  const hasDirectEvidence = target.clear_count > 0
    || target.strong_near_pass_count > 0
    || target.near_pass_count >= 2;
  const hasHotLadderBridge = targetLevel <= Math.min(28, (context.comfortableLevel || 1) + 1)
    && previous.clear_count >= 5
    && previous.clear_day_peak >= 2
    && twoBelow.clear_count >= 3
    && formRatio != null
    && formRatio >= 1.0;

  let supportScore = 0;
  const reasons = [];

  if (target.clear_count >= 5) {
    supportScore += 6;
    reasons.push(`${target.clear_count} recent clears at Lv.${targetLevel}`);
  } else if (target.clear_count >= 3) {
    supportScore += 5;
    reasons.push(`${target.clear_count} recent clears at Lv.${targetLevel}`);
  } else if (target.clear_count >= 1) {
    supportScore += 3;
    reasons.push(`${target.clear_count} recent clear${target.clear_count === 1 ? '' : 's'} at Lv.${targetLevel}`);
  }

  if (target.strong_near_pass_count >= 2) {
    supportScore += 3;
    reasons.push(`${target.strong_near_pass_count} high-score near-pass attempts at Lv.${targetLevel}`);
  } else if (target.strong_near_pass_count === 1) {
    supportScore += 2;
    reasons.push(`1 high-score near-pass attempt at Lv.${targetLevel}`);
  } else if (target.near_pass_count >= 2) {
    supportScore += 1;
    reasons.push(`${target.near_pass_count} positive-score near-pass attempts at Lv.${targetLevel}`);
  }

  if (previous.clear_count >= 10) {
    supportScore += 3;
    reasons.push(`${previous.clear_count} recent clears at Lv.${targetLevel - 1}`);
  } else if (previous.clear_count >= 5) {
    supportScore += 2;
    reasons.push(`${previous.clear_count} recent clears at Lv.${targetLevel - 1}`);
  } else if (previous.clear_count >= 3) {
    supportScore += 1;
    reasons.push(`${previous.clear_count} recent clears at Lv.${targetLevel - 1}`);
  }

  if (previous.clear_day_peak >= 3) {
    supportScore += 1;
    reasons.push(`Peak session of ${previous.clear_day_peak} clears at Lv.${targetLevel - 1}`);
  }

  if (twoBelow.clear_count >= 10) {
    supportScore += 2;
    reasons.push(`${twoBelow.clear_count} recent clears at Lv.${targetLevel - 2}`);
  } else if (twoBelow.clear_count >= 5) {
    supportScore += 1;
    reasons.push(`${twoBelow.clear_count} recent clears at Lv.${targetLevel - 2}`);
  }

  if (formRatio != null) {
    if (formRatio >= 1.15) {
      supportScore += 2;
      reasons.push(`Current form is ${round2(formRatio * 100)}% of base skill`);
    } else if (formRatio >= 0.95) {
      supportScore += 1;
      reasons.push(`Current form is ${round2(formRatio * 100)}% of base skill`);
    } else if (formRatio < 0.60) {
      supportScore -= 2;
      reasons.push(`Current form is down at ${round2(formRatio * 100)}% of base skill`);
    } else if (formRatio < 0.80) {
      supportScore -= 1;
      reasons.push(`Current form is down at ${round2(formRatio * 100)}% of base skill`);
    }
  }

  if (loadSupportedPassLevel != null && targetLevel <= loadSupportedPassLevel) {
    supportScore += 1;
    reasons.push(`Avg load per clear supports roughly Lv.${loadSupportedPassLevel} pass territory`);
  }

  if (predictedGrade && gradeAtLeast(predictedGrade, 'AA')) {
    supportScore += 1;
  }

  return {
    level: targetLevel,
    eligible: hasDirectEvidence || hasHotLadderBridge,
    support_score: supportScore,
    confidence: getLikelyPassConfidence(supportScore),
    predicted_grade: predictedGrade,
    load_supported_pass_level: loadSupportedPassLevel,
    form_ratio: formRatio != null ? round2(formRatio * 100) : null,
    target,
    feeder_levels: [previous, twoBelow],
    reasons,
  };
}

function predictLikelyPassLevel(baseSkill, currentForm, avgPlayLoad, comfortableLevel, recentPlays, ianaTimezone) {
  if (comfortableLevel == null || avgPlayLoad == null || !Array.isArray(recentPlays) || recentPlays.length === 0) {
    return null;
  }

  const levelEvidenceMap = buildRecentLevelEvidence(recentPlays, ianaTimezone);
  let best = null;

  for (const targetLevel of SORTED_LEVELS) {
    const candidate = scoreLikelyPassCandidate(targetLevel, levelEvidenceMap, {
      baseSkill,
      currentForm,
      avgPlayLoad,
      comfortableLevel,
      recentPlays,
      ianaTimezone,
    });

    if (!candidate.eligible || candidate.support_score < LIKELY_PASS_MIN_SUPPORT) continue;

    if (!best || candidate.level > best.level || (candidate.level === best.level && candidate.support_score > best.support_score)) {
      best = candidate;
    }
  }

  if (!best) return null;

  return {
    level: best.level,
    confidence: best.confidence,
    support_score: best.support_score,
    predicted_grade: best.predicted_grade,
    load_supported_pass_level: best.load_supported_pass_level,
    form_ratio: best.form_ratio,
    target: best.target,
    feeder_levels: best.feeder_levels,
    reasons: best.reasons.slice(0, 5),
  };
}

function predictGradeAtLevel(targetLevel, recentPlays, ianaTimezone, comfortableLevel) {
  const now = new Date();
  const exactLevelPlays = [];
  const nearbyPlays = [];

  for (const play of recentPlays) {
    const playLevel = parseInt(play.level, 10) || 0;
    const levelDist = Math.abs(playLevel - targetLevel);
    if (levelDist > MAX_PREDICTION_LEVEL_DISTANCE) continue;

    const utc = resolvePlayUtc(play);
    if (!utc) continue;
    const playDate = new Date(utc);
    const daysAgo = (now.getTime() - playDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo > PREDICTION_LOOKBACK_DAYS || daysAgo < 0) continue;

    const score = parseInt(play.score, 10) || 0;
    const grade = normalizeGrade(play.grade) || (score > 0 ? gradeFromScore(score) : '') || 'F';
    if (score <= 0 || grade === 'F') continue;

    const timeWeight = Math.pow(ALPHA_ACUTE, daysAgo / 7);
    if (playLevel === targetLevel) {
      exactLevelPlays.push({ score, weight: timeWeight });
    }

    const distWeight = 1 / (1 + levelDist); // ±0: 1.0, ±1: 0.5, ±2: 0.33, ±3: 0.25
    const weight = timeWeight * distWeight;
    const levelAdjust = (playLevel - targetLevel) * LEVEL_SCORE_ADJUSTMENT;
    const adjustedScore = Math.max(0, Math.min(1000000, score + levelAdjust));
    nearbyPlays.push({ adjustedScore, weight });
  }

  if (exactLevelPlays.length >= MIN_EXACT_PREDICTION_PLAYS) {
    const exactGrade = gradeFromWeightedScores(exactLevelPlays, 'score');
    if (exactGrade) return exactGrade;
  }

  const nearbyGrade = gradeFromWeightedScores(nearbyPlays, 'adjustedScore');
  if (nearbyGrade) {
    return nearbyGrade;
  }

  // Fallback: extrapolate from comfortable level
  if (comfortableLevel != null) {
    const delta = targetLevel - comfortableLevel;
    // AA (900000) as baseline, drop ~75000 per level above, gain ~25000 per level below
    const baselineScore = 900000;
    const estimatedScore = Math.max(0, Math.min(1000000,
      baselineScore + (delta < 0 ? delta * -25000 : delta * -75000)));
    return gradeFromScore(estimatedScore);
  }

  return null;
}

function computeModeProfile(dailyLoads, startDate, endDate, recentPlays, ianaTimezone, includePredictions) {
  const ewma = computeEWMA(dailyLoads, startDate, endDate);
  const status = getTrainingStatus(ewma.baseSkill, ewma.currentForm, ewma.playDays);

  const profile = {
    base_skill: ewma.baseSkill,
    current_form: ewma.currentForm,
    training_ratio: status.ratio,
    training_status: status.label,
    training_color: status.color,
    play_days: ewma.playDays,
    chronic_clear_count: ewma.chronicClearCount,
    calibrating: ewma.playDays > 0 && ewma.playDays < MIN_PLAY_DAYS,
  };

  if (includePredictions && !profile.calibrating && ewma.playDays > 0) {
    const comfortableLevel = predictComfortableLevel(ewma.baseSkill, ewma.chronicClearCount);
    profile.comfortable_level = comfortableLevel;
    profile.avg_play_load = round2(ewma.baseSkill / Math.max(ewma.chronicClearCount, 0.5));
    profile.likely_pass = predictLikelyPassLevel(
      ewma.baseSkill,
      ewma.currentForm,
      profile.avg_play_load,
      comfortableLevel,
      recentPlays,
      ianaTimezone
    );

    // Grade predictions for levels around comfortable level
    const predictions = {};
    const minLevel = Math.max(1, comfortableLevel - 4);
    const maxLevel = Math.min(28, comfortableLevel + 4);
    for (let lvl = minLevel; lvl <= maxLevel; lvl++) {
      const grade = predictGradeAtLevel(lvl, recentPlays, ianaTimezone, comfortableLevel);
      if (grade) predictions[lvl] = grade;
    }
    profile.grade_predictions = predictions;
  } else if (includePredictions) {
    profile.comfortable_level = null;
    profile.avg_play_load = null;
    profile.likely_pass = null;
    profile.grade_predictions = null;
  }

  return { profile, ewmaHistory: ewma.history };
}

function computeAllProfiles(plays, ianaTimezone, lastSyncedAt) {
  const today = new Date();
  const endDate = toLocalDate(today.toISOString(), ianaTimezone) || today.toISOString().slice(0, 10);
  const startDateObj = new Date(today.getTime() - LOOKBACK_DAYS * 86400000);
  const startDate = toLocalDate(startDateObj.toISOString(), ianaTimezone) || startDateObj.toISOString().slice(0, 10);

  const byMode = aggregateDailyLoadsByMode(plays, ianaTimezone);

  const singlePlays = plays.filter((p) => String(p.mode || '').trim() === 'Single');
  const doublePlays = plays.filter((p) => String(p.mode || '').trim() === 'Double');

  const overallResult = computeModeProfile(byMode.overall, startDate, endDate, plays, ianaTimezone, false);
  const singleResult = computeModeProfile(byMode.single, startDate, endDate, singlePlays, ianaTimezone, true);
  const doubleResult = computeModeProfile(byMode.double, startDate, endDate, doublePlays, ianaTimezone, true);

  // Build per-mode daily load history
  const allDates = new Set();
  for (const d of byMode.overall) allDates.add(d.date);
  for (const d of byMode.single) allDates.add(d.date);
  for (const d of byMode.double) allDates.add(d.date);

  const overallMap = new Map(byMode.overall.map((d) => [d.date, d]));
  const singleMap = new Map(byMode.single.map((d) => [d.date, d]));
  const doubleMap = new Map(byMode.double.map((d) => [d.date, d]));

  const dailyLoadHistory = Array.from(allDates).sort().map((date) => ({
    date,
    overall: (overallMap.get(date) || {}).load || 0,
    single: (singleMap.get(date) || {}).load || 0,
    double: (doubleMap.get(date) || {}).load || 0,
    play_count: (overallMap.get(date) || {}).playCount || 0,
  }));

  // Build per-mode EWMA history
  const ewmaHistory = overallResult.ewmaHistory.map((oh, i) => {
    const sh = singleResult.ewmaHistory[i] || {};
    const dh = doubleResult.ewmaHistory[i] || {};
    return {
      date: oh.date,
      overall: {
        base_skill: oh.base_skill,
        current_form: oh.current_form,
        chronic_clear_count: oh.chronic_clear_count || 0,
      },
      single: {
        base_skill: sh.base_skill || 0,
        current_form: sh.current_form || 0,
        chronic_clear_count: sh.chronic_clear_count || 0,
      },
      double: {
        base_skill: dh.base_skill || 0,
        current_form: dh.current_form || 0,
        chronic_clear_count: dh.chronic_clear_count || 0,
      },
    };
  });

  // Sync staleness
  let syncStale = false;
  if (lastSyncedAt) {
    const syncDate = new Date(lastSyncedAt);
    if (!Number.isNaN(syncDate.getTime())) {
      syncStale = (today.getTime() - syncDate.getTime()) > (3 * 86400000);
    }
  }

  return {
    overall: overallResult.profile,
    single: singleResult.profile,
    double: doubleResult.profile,
    daily_load_history: dailyLoadHistory,
    ewma_history: ewmaHistory,
    sync_stale: syncStale,
    last_synced_at: lastSyncedAt || null,
  };
}

// --- Population-based statistical predictions ---

const POPULATION_MIN_CLEARS = 10;

function computePopulationPercentile(userAvgPlayLoad, allUsersAvgPlayLoads) {
  if (userAvgPlayLoad == null || !allUsersAvgPlayLoads.length) return null;
  const sorted = [...allUsersAvgPlayLoads].sort((a, b) => a - b);
  const belowOrEqual = sorted.filter((v) => v <= userAvgPlayLoad).length;
  const percentile = round2((belowOrEqual / sorted.length) * 100);
  return {
    percentile,
    rank: belowOrEqual,
    total_users: sorted.length,
    distribution: buildDistributionBuckets(sorted),
  };
}

function buildDistributionBuckets(sortedValues) {
  // Build histogram buckets for the population chart
  if (!sortedValues.length) return [];
  const min = sortedValues[0];
  const max = sortedValues[sortedValues.length - 1];
  const range = max - min;
  const bucketCount = Math.min(8, Math.max(3, sortedValues.length));
  const bucketSize = Math.max(1, Math.ceil(range / bucketCount));
  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = min + i * bucketSize;
    const hi = lo + bucketSize;
    const count = sortedValues.filter((v) => v >= lo && (i === bucketCount - 1 ? v <= hi : v < hi)).length;
    buckets.push({ lo: Math.round(lo), hi: Math.round(hi), count });
  }
  return buckets;
}

function computeMilestoneTarget(currentAvgPlayLoad, comfortableLevel) {
  if (currentAvgPlayLoad == null || comfortableLevel == null) return null;
  const nextLevel = comfortableLevel + 1;
  if (nextLevel > 28) return null;
  const targetAvgLoad = EXTENDED_BASE_POINTS[nextLevel];
  if (!targetAvgLoad) return null;
  const gap = targetAvgLoad - currentAvgPlayLoad;
  return {
    target_level: nextLevel,
    target_avg_load: targetAvgLoad,
    current_avg_load: round2(currentAvgPlayLoad),
    gap_absolute: round2(Math.max(0, gap)),
    gap_percent: round2(Math.max(0, (gap / Math.max(currentAvgPlayLoad, 1)) * 100)),
    already_met: currentAvgPlayLoad >= targetAvgLoad,
  };
}

function computeCeilingPrediction(comfortableLevel) {
  if (comfortableLevel == null) return null;
  const ceilingLevel = Math.min(28, comfortableLevel + 2);
  return {
    ceiling_level: ceilingLevel,
    comfortable_level: comfortableLevel,
    delta: ceilingLevel - comfortableLevel,
  };
}

function computePopulationStats(allPlays, currentUserId) {
  // Group plays by (user_id, mode), compute avg load/clear for each
  const userModeStats = new Map(); // key: `${userId}|${mode}`

  for (const play of allPlays) {
    const score = parseInt(play.score, 10) || 0;
    const grade = normalizeGrade(play.grade) || (score > 0 ? gradeFromScore(score) : '') || 'F';
    if (grade === 'F' || score <= 0) continue;

    const mode = String(play.mode || '').trim();
    if (mode !== 'Single' && mode !== 'Double') continue;

    const key = `${play.user_id}|${mode}`;
    const entry = userModeStats.get(key) || { userId: play.user_id, mode, totalLoad: 0, clearCount: 0 };
    entry.totalLoad += calculatePlayLoad(play.level, play.grade, play.score);
    entry.clearCount += 1;
    userModeStats.set(key, entry);
  }

  const singleLoads = [];
  const doubleLoads = [];
  let currentSingle = null;
  let currentDouble = null;

  for (const entry of userModeStats.values()) {
    if (entry.clearCount < POPULATION_MIN_CLEARS) continue;
    const avgLoad = round2(entry.totalLoad / entry.clearCount);

    if (entry.mode === 'Single') {
      singleLoads.push(avgLoad);
      if (entry.userId === currentUserId) currentSingle = avgLoad;
    } else {
      doubleLoads.push(avgLoad);
      if (entry.userId === currentUserId) currentDouble = avgLoad;
    }
  }

  return { singleLoads, doubleLoads, currentSingle, currentDouble };
}

module.exports = {
  ALPHA_ACUTE,
  ALPHA_CHRONIC,
  EXTENDED_BASE_POINTS,
  LOOKBACK_DAYS,
  MIN_PLAY_DAYS,
  POPULATION_MIN_CLEARS,
  QUERY_BUFFER_DAYS,
  calculatePlayLoad,
  computeAllProfiles,
  computeCeilingPrediction,
  computeEWMA,
  computeMilestoneTarget,
  computeModeProfile,
  computePopulationPercentile,
  computePopulationStats,
  getTrainingStatus,
  predictLikelyPassLevel,
  predictComfortableLevel,
  predictGradeAtLevel,
  resolvePlayUtc,
  toLocalDate,
};

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
const EPSILON = 0.01;
const DEFAULT_ROLLOVER_HOUR = 4;

const TRAINING_ZONES = [
  { minRatio: 1.50, label: 'Overclocked', color: '#F97316' },
  { minRatio: 1.00, label: 'In The Zone', color: '#22C55E' },
  { minRatio: 0.80, label: 'Cruising', color: '#3B82F6' },
  { minRatio: 0.50, label: 'Warming Up', color: '#EAB308' },
  { minRatio: 0.01, label: 'Cooling Down', color: '#94A3B8' },
];

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

    overall.push({ date: loadDate, load, mode });
    if (mode === 'Single') single.push({ date: loadDate, load });
    else if (mode === 'Double') double.push({ date: loadDate, load });
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
    const existing = dayMap.get(e.date) || { date: e.date, load: 0, playCount: 0 };
    existing.load += e.load;
    existing.playCount += 1;
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
  const history = [];
  const playDates = new Set();
  let current = startDate;

  while (current <= endDate) {
    const day = loadMap.get(current);
    const dailyLoad = day ? day.load : 0;
    const dailyPlayCount = day ? day.playCount : 0;

    baseSkill = baseSkill * (1 - ALPHA_CHRONIC) + dailyLoad * ALPHA_CHRONIC;
    currentForm = currentForm * (1 - ALPHA_ACUTE) + dailyLoad * ALPHA_ACUTE;
    chronicPlayCount = chronicPlayCount * (1 - ALPHA_CHRONIC) + dailyPlayCount * ALPHA_CHRONIC;

    if (dailyPlayCount > 0) playDates.add(current);

    history.push({
      date: current,
      base_skill: round2(baseSkill),
      current_form: round2(currentForm),
      chronic_play_count: round2(chronicPlayCount),
    });

    current = addDays(current, 1);
  }

  return {
    baseSkill: round2(baseSkill),
    currentForm: round2(currentForm),
    chronicPlayCount: round2(chronicPlayCount),
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

function predictComfortableLevel(baseSkill, chronicPlayCount) {
  const avgPlayLoad = baseSkill / Math.max(chronicPlayCount, 0.5);
  let comfortableLevel = 1;
  for (const level of SORTED_LEVELS) {
    if (EXTENDED_BASE_POINTS[level] <= avgPlayLoad) {
      comfortableLevel = level;
    }
  }
  return comfortableLevel;
}

function predictGradeAtLevel(targetLevel, recentPlays, ianaTimezone, comfortableLevel) {
  const now = new Date();

  const nearbyPlays = [];
  for (const play of recentPlays) {
    const playLevel = parseInt(play.level, 10) || 0;
    if (Math.abs(playLevel - targetLevel) > 1) continue;
    const utc = resolvePlayUtc(play);
    if (!utc) continue;
    const playDate = new Date(utc);
    const daysAgo = (now.getTime() - playDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo > 28 || daysAgo < 0) continue;

    const score = parseInt(play.score, 10) || 0;
    if (score <= 0) continue;

    const weight = Math.pow(ALPHA_ACUTE, daysAgo / 7);
    const levelAdjust = (playLevel - targetLevel) * 50000;
    const adjustedScore = Math.max(0, Math.min(1000000, score + levelAdjust));
    nearbyPlays.push({ adjustedScore, weight });
  }

  if (nearbyPlays.length > 0) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (const p of nearbyPlays) {
      weightedSum += p.adjustedScore * p.weight;
      weightTotal += p.weight;
    }
    const avgScore = Math.round(weightedSum / weightTotal);
    return gradeFromScore(avgScore);
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
    calibrating: ewma.playDays > 0 && ewma.playDays < MIN_PLAY_DAYS,
  };

  if (includePredictions && !profile.calibrating && ewma.playDays > 0) {
    const comfortableLevel = predictComfortableLevel(ewma.baseSkill, ewma.chronicPlayCount);
    profile.comfortable_level = comfortableLevel;
    profile.avg_play_load = round2(ewma.baseSkill / Math.max(ewma.chronicPlayCount, 0.5));

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
      overall: { base_skill: oh.base_skill, current_form: oh.current_form },
      single: { base_skill: sh.base_skill || 0, current_form: sh.current_form || 0 },
      double: { base_skill: dh.base_skill || 0, current_form: dh.current_form || 0 },
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

module.exports = {
  ALPHA_ACUTE,
  ALPHA_CHRONIC,
  EXTENDED_BASE_POINTS,
  LOOKBACK_DAYS,
  MIN_PLAY_DAYS,
  QUERY_BUFFER_DAYS,
  calculatePlayLoad,
  computeAllProfiles,
  computeEWMA,
  computeModeProfile,
  getTrainingStatus,
  predictComfortableLevel,
  predictGradeAtLevel,
  resolvePlayUtc,
  toLocalDate,
};

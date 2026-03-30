'use strict';

const { normalizeUserAvatarForList } = require('./avatarProxy');
const { parsePiugamePlayedAtUtc } = require('./piugameDate');
const { parseUtcSqliteDateTime } = require('./liveSessionSummary');
const { LEVEL_BASE_POINTS } = require('./titleProgress');

const SCOUTING_SKILL_BUCKETS = {
  speed: ['bursty'],
  stamina: ['sustained', 'run', 'yog_walk', 'anchor_run', 'drill', 'run_without_twists'],
  mobility: ['cross-pad_transition', 'co-op_pad_transition', 'twist_far', 'jump', '10-stair'],
  tech: [
    'bracket', 'bracket_jump', 'bracket_run', 'bracket_twist', 'doublestep',
    'jack', 'staggered_bracket', 'twist_90', 'twist_close', 'twist_over90',
    'hold_footslide', 'hold_footswitch',
  ],
};

const SLUG_TO_BUCKET = {};
for (const [bucket, slugs] of Object.entries(SCOUTING_SKILL_BUCKETS)) {
  for (const slug of slugs) SLUG_TO_BUCKET[slug] = bucket;
}

const BUCKET_KEYS = ['speed', 'stamina', 'mobility', 'tech'];
const ABSOLUTE_TARGET_SAMPLE = 5;
const ABSOLUTE_LEVEL_WEIGHT_EXPONENT = 0.7;
const MAX_CHART_RATING_MULTIPLIER = 1.5;
const CADENCE_SESSION_GAP_MS = 90 * 60 * 1000;

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function weightedMean(values, weights) {
  let sumW = 0;
  let sumV = 0;
  for (let i = 0; i < values.length; i++) {
    sumW += weights[i];
    sumV += values[i] * weights[i];
  }
  return sumW > 0 ? sumV / sumW : 0;
}

function emptyBucketScores() {
  return { speed: 0, stamina: 0, mobility: 0, tech: 0 };
}

function emptyScopedBucketScores() {
  return {
    overall: emptyBucketScores(),
    singles: emptyBucketScores(),
    doubles: emptyBucketScores(),
  };
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function parseCadencePlayedAt(row) {
  const playedAtUtc = parseUtcSqliteDateTime(row?.played_at_utc);
  if (playedAtUtc) return playedAtUtc;
  return parsePiugamePlayedAtUtc(row?.date_played);
}

function countCadenceSessions(playRows = [], fallbackSessionCount = 0) {
  const timestamped = (Array.isArray(playRows) ? playRows : [])
    .map((row, index) => ({
      index,
      playedAt: parseCadencePlayedAt(row),
    }))
    .filter((row) => row.playedAt instanceof Date && !Number.isNaN(row.playedAt.getTime()))
    .sort((a, b) => {
      const diff = a.playedAt.getTime() - b.playedAt.getTime();
      return diff !== 0 ? diff : a.index - b.index;
    });

  if (timestamped.length === 0) {
    return Math.max(0, fallbackSessionCount || 0);
  }

  let sessions = 1;
  for (let i = 1; i < timestamped.length; i++) {
    const gapMs = timestamped[i].playedAt.getTime() - timestamped[i - 1].playedAt.getTime();
    if (gapMs > CADENCE_SESSION_GAP_MS) sessions += 1;
  }
  return sessions;
}

function buildPercentileRank(rows, userId, compareFn) {
  const normalizedRows = Array.isArray(rows) ? rows.slice() : [];
  if (normalizedRows.length <= 1) return normalizedRows.length === 1 ? 100 : 0;

  normalizedRows.sort((a, b) => {
    const compared = compareFn(a, b);
    if (compared !== 0) return compared;
    return String(a?.user_id || '').localeCompare(String(b?.user_id || ''));
  });

  const userIndex = normalizedRows.findIndex((row) => String(row?.user_id || '') === String(userId || ''));
  if (userIndex < 0) return 50;
  return Math.round((userIndex / (normalizedRows.length - 1)) * 100);
}

function buildCadenceLabel(score100) {
  if (score100 >= 90) return 'Locked in';
  if (score100 >= 75) return 'Consistent';
  if (score100 >= 55) return 'Regular';
  if (score100 >= 35) return 'On and off';
  return 'Light';
}

function buildCadenceSummary({ activeDays30, plays30, sessions30, frequencyPercentile, volumePercentile, cohortSize }) {
  const normalizedActiveDays = Math.max(0, parseInt(activeDays30, 10) || 0);
  const normalizedPlays = Math.max(0, parseInt(plays30, 10) || 0);
  const normalizedSessions = Math.max(0, parseInt(sessions30, 10) || 0);
  const normalizedFrequency = clamp(0, 100, Math.round(Number(frequencyPercentile) || 0));
  const normalizedVolume = clamp(0, 100, Math.round(Number(volumePercentile) || 0));
  const score100 = clamp(0, 100, Math.round((normalizedFrequency * 0.6) + (normalizedVolume * 0.4)));

  return {
    score100,
    percentile: score100,
    label: buildCadenceLabel(score100),
    cohortSize: Math.max(0, parseInt(cohortSize, 10) || 0),
    frequencyPercentile: normalizedFrequency,
    volumePercentile: normalizedVolume,
    activeDays30: normalizedActiveDays,
    activeDaysPerWeek: round1((normalizedActiveDays / 30) * 7),
    plays30: normalizedPlays,
    sessions30: normalizedSessions,
    sessionsPerWeek: round1((normalizedSessions / 30) * 7),
    playsPerSession: normalizedSessions > 0
      ? round1(normalizedPlays / normalizedSessions)
      : 0,
  };
}

function getChartBucketKeys(chart) {
  const buckets = new Set();
  for (const skill of (Array.isArray(chart?.skills) ? chart.skills : [])) {
    const slug = skill?.slug || skill?.skill_slug;
    if (slug && SLUG_TO_BUCKET[slug]) buckets.add(SLUG_TO_BUCKET[slug]);
  }
  return Array.from(buckets);
}

function getChartMaxRating(level) {
  const base = LEVEL_BASE_POINTS[parseInt(level, 10)];
  if (!base) return 0;
  return base * MAX_CHART_RATING_MULTIPLIER;
}

function getChartCapabilityRatio(chart, best) {
  const chartMax = getChartMaxRating(chart?.level);
  if (chartMax <= 0) return 0;
  const earned = Math.max(0, Number(best?.rating) || 0);
  return clamp(0, 1, earned / chartMax);
}

function buildCapabilityLevelScore({ chartCount, playedRatios = [] }) {
  const normalizedChartCount = Math.max(0, parseInt(chartCount, 10) || 0);
  const representativeTarget = Math.min(ABSOLUTE_TARGET_SAMPLE, normalizedChartCount);
  if (representativeTarget <= 0) {
    return {
      score100: 0,
      score100Exact: 0,
      mastery: 0,
      coverage: 0,
      representativeTarget: 0,
      sampleSize: 0,
    };
  }

  const normalizedPlayed = (Array.isArray(playedRatios) ? playedRatios : [])
    .map((ratio) => clamp(0, 1, Number(ratio) || 0))
    .filter((ratio) => ratio > 0)
    .sort((a, b) => b - a);

  const sampleSize = Math.min(representativeTarget, normalizedPlayed.length);
  if (sampleSize <= 0) {
    return {
      score100: 0,
      score100Exact: 0,
      mastery: 0,
      coverage: 0,
      representativeTarget,
      sampleSize: 0,
    };
  }

  const mastery = weightedMean(
    normalizedPlayed.slice(0, sampleSize),
    Array.from({ length: sampleSize }, () => 1)
  );
  const coverage = Math.sqrt(sampleSize / representativeTarget);
  const score100Exact = mastery * coverage * 100;

  return {
    score100: clamp(0, 100, Math.round(score100Exact)),
    score100Exact,
    mastery,
    coverage,
    representativeTarget,
    sampleSize,
  };
}

function getLevelDifficultyWeight(level) {
  const base = LEVEL_BASE_POINTS[parseInt(level, 10)] || 0;
  if (base <= 0) return 0;
  return Math.pow(base, ABSOLUTE_LEVEL_WEIGHT_EXPONENT);
}

function buildScopedCapabilityScores(songCatalog, bestByChart, modeFilter) {
  const bucketLevels = {
    speed: new Map(),
    stamina: new Map(),
    mobility: new Map(),
    tech: new Map(),
  };

  for (const chart of (Array.isArray(songCatalog?.charts) ? songCatalog.charts : [])) {
    if (modeFilter && chart?.mode !== modeFilter) continue;

    const level = parseInt(chart?.level, 10);
    if (!LEVEL_BASE_POINTS[level]) continue;

    const chartBuckets = getChartBucketKeys(chart);
    if (chartBuckets.length === 0) continue;

    const ratio = getChartCapabilityRatio(chart, bestByChart?.get(chart?.key) || null);
    for (const bucket of chartBuckets) {
      const byLevel = bucketLevels[bucket];
      let entry = byLevel.get(level);
      if (!entry) {
        entry = { level, chartCount: 0, playedRatios: [] };
        byLevel.set(level, entry);
      }
      entry.chartCount += 1;
      if (ratio > 0) entry.playedRatios.push(ratio);
    }
  }

  const scores = emptyBucketScores();
  for (const bucket of BUCKET_KEYS) {
    const values = [];
    const weights = [];
    for (const entry of bucketLevels[bucket].values()) {
      const levelScore = buildCapabilityLevelScore(entry);
      if (levelScore.score100Exact <= 0) continue;
      values.push(levelScore.score100Exact);
      weights.push(getLevelDifficultyWeight(entry.level));
    }
    scores[bucket] = values.length > 0
      ? clamp(0, 100, Math.round(weightedMean(values, weights)))
      : 0;
  }

  return scores;
}

function buildCompositeScopeRating(bucketScores) {
  const values = BUCKET_KEYS.map((bucket) => clamp(0, 100, Number(bucketScores?.[bucket]) || 0));
  if (values.every((value) => value <= 0)) {
    return { score100: 0, raw: 0, benchmarkRaw: 100 };
  }
  const score100 = clamp(0, 100, Math.round(weightedMean(values, [1, 1, 1, 1])));
  return {
    score100,
    raw: score100,
    benchmarkRaw: 100,
  };
}

function buildUserScoutingSnapshot(db, userId, helpers, existingProfile = null, existingSyncRow = null) {
  const { aliases, songCatalog } = helpers;
  const profile = existingProfile || db.prepare(
    'SELECT id, username, avatar, pumbility, skill_title, nationality FROM users WHERE id = ?'
  ).get(userId);
  if (!profile) return null;

  const syncRow = existingSyncRow || db.prepare(
    'SELECT best_scores_imported, last_best_scores_sync, pumbility_value, play_data_levels_json FROM user_piugame_sync WHERE user_id = ?'
  ).get(userId) || null;

  const result = helpers.buildUserBestByChartMap({
    bestScores: helpers.queryUserBestScores(db, userId),
    recentScores: helpers.queryUserRecentScores(db, userId),
    pumbilityScores: helpers.queryUserPumbilityScores(db, userId),
    aliases,
    validChartKeys: songCatalog.chartsByKey,
  });

  const bestByChart = result.bestByChart;
  const passBestByChart = result.passBest;
  const hasPiuData = bestByChart.size > 0;

  if (!hasPiuData) {
    return {
      profile,
      syncRow,
      bestByChart,
      passBestByChart,
      analytics: null,
      hasPiuData: false,
      families: emptyScopedBucketScores(),
    };
  }

  const analytics = helpers.formatAnalytics(userId, profile, syncRow, songCatalog, bestByChart, passBestByChart);

  return {
    profile,
    syncRow,
    bestByChart,
    passBestByChart,
    analytics,
    hasPiuData: true,
    families: {
      overall: buildScopedCapabilityScores(songCatalog, bestByChart, null),
      singles: buildScopedCapabilityScores(songCatalog, bestByChart, 'Single'),
      doubles: buildScopedCapabilityScores(songCatalog, bestByChart, 'Double'),
    },
  };
}

function buildCadenceStats(db, userId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cutoffDate = thirtyDaysAgo.toISOString().slice(0, 10);

  const recentRows = db.prepare(`
    SELECT id, played_at_utc, date_played
    FROM user_recently_played
    WHERE user_id = ?
      AND SUBSTR(date_played, 1, 10) >= ?
    ORDER BY datetime(COALESCE(NULLIF(played_at_utc, ''), SUBSTR(date_played, 1, 19))) ASC, id ASC
  `).all(userId, cutoffDate);

  const playDates = new Set();
  for (const row of recentRows) {
    const playDate = String(row?.date_played || '').slice(0, 10);
    if (playDate) playDates.add(playDate);
  }

  const activeDays30 = playDates.size;
  const plays30 = recentRows.length;
  const sessions30 = countCadenceSessions(recentRows, activeDays30);

  if (activeDays30 === 0) {
    return {
      score100: 0,
      percentile: 0,
      label: 'No recent activity',
      cohortSize: 0,
      frequencyPercentile: 0,
      volumePercentile: 0,
      activeDays30: 0,
      activeDaysPerWeek: 0,
      plays30: 0,
      sessions30: 0,
      sessionsPerWeek: 0,
      playsPerSession: 0,
    };
  }

  const allUsers = db.prepare(`
    SELECT user_id, COUNT(DISTINCT SUBSTR(date_played, 1, 10)) as active_days, COUNT(*) as total_plays
    FROM user_recently_played
    WHERE SUBSTR(date_played, 1, 10) >= ?
    GROUP BY user_id
    HAVING active_days > 0
  `).all(cutoffDate);

  if (allUsers.length <= 1) {
    return buildCadenceSummary({
      activeDays30,
      plays30,
      sessions30,
      frequencyPercentile: 100,
      volumePercentile: 100,
      cohortSize: allUsers.length,
    });
  }

  const frequencyPercentile = buildPercentileRank(allUsers, userId, (a, b) => {
    if (a.active_days !== b.active_days) return a.active_days - b.active_days;
    return a.total_plays - b.total_plays;
  });
  const volumePercentile = buildPercentileRank(allUsers, userId, (a, b) => {
    if (a.total_plays !== b.total_plays) return a.total_plays - b.total_plays;
    return a.active_days - b.active_days;
  });

  return buildCadenceSummary({
    activeDays30,
    plays30,
    sessions30,
    frequencyPercentile,
    volumePercentile,
    cohortSize: allUsers.length,
  });
}

function buildSpecialtyLabels(modeProfile, activeFamilyScores) {
  const labels = [];

  if (modeProfile.dominant_label) {
    labels.push({ key: 'mode', label: modeProfile.dominant_label });
  }

  const ranked = BUCKET_KEYS
    .map((key) => ({ key, score: activeFamilyScores?.[key] || 0 }))
    .filter((bucket) => bucket.score > 0)
    .sort((a, b) => b.score - a.score);

  const bucketLabels = {
    speed: 'Speed-heavy',
    stamina: 'Stamina-rich',
    mobility: 'Mobility-strong',
    tech: 'Tech-heavy',
  };

  for (let i = 0; i < Math.min(2, ranked.length); i++) {
    labels.push({ key: ranked[i].key, label: bucketLabels[ranked[i].key] });
  }

  return labels.slice(0, 4);
}

function buildPlayerScoutingCard(db, userId, helpers) {
  const { songCatalog } = helpers;

  const profile = db.prepare(
    'SELECT id, username, avatar, pumbility, skill_title, nationality FROM users WHERE id = ?'
  ).get(userId);
  if (!profile) return null;

  const syncRow = db.prepare(
    'SELECT best_scores_imported, last_best_scores_sync, pumbility_value, play_data_levels_json FROM user_piugame_sync WHERE user_id = ?'
  ).get(userId) || null;

  const snapshot = buildUserScoutingSnapshot(db, userId, helpers, profile, syncRow);
  if (!snapshot) return null;

  const { analytics, families: rawFamilies, hasPiuData } = snapshot;

  if (!hasPiuData) {
    return {
      user: {
        id: profile.id,
        username: profile.username,
        avatar: normalizeUserAvatarForList(profile.avatar, profile.id, 64),
        nationality: profile.nationality || '',
        skillTitle: profile.skill_title || '',
      },
      benchmark: null,
      ratings: null,
      attributes: null,
      cadence: buildCadenceStats(db, userId),
      competitive: null,
      specialties: [],
      signature: { homeLabel: '', summaryLabel: '' },
      coverage: { hasPiuData: false, hasBenchmark: false, doublesBenchmarkPartial: false },
    };
  }

  const attributes = {
    overall: rawFamilies?.overall || emptyBucketScores(),
    singles: rawFamilies?.singles || emptyBucketScores(),
    doubles: rawFamilies?.doubles || emptyBucketScores(),
  };

  const ratings = {
    overall: buildCompositeScopeRating(attributes.overall),
    singles: buildCompositeScopeRating(attributes.singles),
    doubles: {
      ...buildCompositeScopeRating(attributes.doubles),
      partial: false,
    },
  };

  const singleLevel = analytics.competitive_levels?.single?.level || null;
  const doubleLevel = analytics.competitive_levels?.double?.level || null;

  const singleRows = helpers.buildIdentityLevelRows(analytics.levels?.single || [], 'Single');
  const doubleRows = helpers.buildIdentityLevelRows(analytics.levels?.double || [], 'Double');
  const singleStrength = singleRows.reduce((sum, row) => sum + row.weight, 0);
  const doubleStrength = doubleRows.reduce((sum, row) => sum + row.weight, 0);
  const modeProfile = helpers.getIdentityModeProfile(singleStrength, doubleStrength);

  const cadence = buildCadenceStats(db, userId);
  const specialties = buildSpecialtyLabels(modeProfile, attributes.overall);

  const homeLabel = analytics.competitive_levels?.single?.level
    ? `S${analytics.competitive_levels.single.level}${analytics.competitive_levels?.double?.level ? ` / D${analytics.competitive_levels.double.level}` : ''}`
    : analytics.competitive_levels?.double?.level
      ? `D${analytics.competitive_levels.double.level}`
      : '';

  const summaryLabel = `${modeProfile.dominant_label}${homeLabel ? ` • ${homeLabel}` : ''}`;

  return {
    user: {
      id: profile.id,
      username: profile.username,
      avatar: normalizeUserAvatarForList(profile.avatar, profile.id, 64),
      nationality: profile.nationality || '',
      skillTitle: profile.skill_title || '',
    },
    benchmark: null,
    ratings,
    attributes,
    cadence,
    competitive: {
      singleLevel,
      doubleLevel,
      dominantMode: modeProfile.dominant_mode,
      dominantLabel: modeProfile.dominant_label,
    },
    specialties,
    signature: {
      homeLabel,
      summaryLabel,
    },
    coverage: {
      hasPiuData: true,
      hasBenchmark: false,
      doublesBenchmarkPartial: false,
      attributeMode: 'absolute_capability',
    },
  };
}

module.exports = {
  buildPlayerScoutingCard,
  __test: {
    buildCadenceSummary,
    buildCapabilityLevelScore,
    buildCompositeScopeRating,
    buildScopedCapabilityScores,
    countCadenceSessions,
    getChartCapabilityRatio,
  },
};

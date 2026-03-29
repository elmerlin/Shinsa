'use strict';

const { normalizeUserAvatarForList } = require('./avatarProxy');
const { parsePiugamePlayedAtUtc } = require('./piugameDate');
const { parseUtcSqliteDateTime } = require('./liveSessionSummary');

// ────────────────────────────────────────────────────────────────────────────
// Scouting-card skill bucket taxonomy
// ────────────────────────────────────────────────────────────────────────────
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
const SHINSA_BASELINE_TTL_MS = 2 * 60 * 1000;
const CADENCE_SESSION_GAP_MS = 90 * 60 * 1000;
let shinsaBaselineCache = { data: null, expiresAt: 0 };

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function clamp(min, max, v) { return Math.max(min, Math.min(max, v)); }
function weightedMean(values, weights) {
  let sumW = 0, sumV = 0;
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

function emptyRatingScores() {
  return { overall: 0, singles: 0, doubles: 0 };
}

function cloneScopedBucketScores(scoped) {
  return {
    overall: { ...emptyBucketScores(), ...(scoped?.overall || {}) },
    singles: { ...emptyBucketScores(), ...(scoped?.singles || {}) },
    doubles: { ...emptyBucketScores(), ...(scoped?.doubles || {}) },
  };
}

function cloneRatingScores(ratings) {
  return { ...emptyRatingScores(), ...(ratings || {}) };
}

function mergeBucketMaximums(target, source) {
  for (const bucket of BUCKET_KEYS) {
    target[bucket] = Math.max(target[bucket] || 0, source?.[bucket] || 0);
  }
}

function mergeScopedBucketMaximums(target, source) {
  for (const scope of ['overall', 'singles', 'doubles']) {
    mergeBucketMaximums(target[scope], source?.[scope]);
  }
}

function mergeRatingMaximums(target, source) {
  for (const scope of ['overall', 'singles', 'doubles']) {
    target[scope] = Math.max(target[scope] || 0, source?.[scope] || 0);
  }
}

function createEmptyShinsaBaseline() {
  return {
    key: 'shinsa',
    label: 'Shinsa',
    source: 'shinsa_cohort',
    cohortSize: 0,
    ratings: emptyRatingScores(),
    families: emptyScopedBucketScores(),
  };
}

function cloneShinsaBaseline(baseline) {
  return {
    key: baseline?.key || 'shinsa',
    label: baseline?.label || 'Shinsa',
    source: baseline?.source || 'shinsa_cohort',
    cohortSize: parseInt(baseline?.cohortSize, 10) || 0,
    ratings: cloneRatingScores(baseline?.ratings),
    families: cloneScopedBucketScores(baseline?.families),
  };
}

function mergeSnapshotIntoShinsaBaseline(baseline, snapshot, options = {}) {
  if (!baseline || !snapshot?.hasPiuData) return baseline;

  const shouldCount = options.count !== false;
  if (shouldCount) baseline.cohortSize += 1;

  mergeRatingMaximums(baseline.ratings, snapshot.ratings);
  mergeScopedBucketMaximums(baseline.families, snapshot.families);
  return baseline;
}

function buildShinsaBaselineFromSnapshots(snapshots = []) {
  const baseline = createEmptyShinsaBaseline();
  for (const snapshot of snapshots) {
    mergeSnapshotIntoShinsaBaseline(baseline, snapshot);
  }
  return baseline;
}

function buildRelativeRating(userVal, baselineVal) {
  const raw = Math.max(0, userVal || 0);
  const benchmarkRaw = Math.max(0, baselineVal || 0);
  if (benchmarkRaw <= 0) {
    return { score100: 0, raw, benchmarkRaw: 0 };
  }
  return {
    score100: clamp(0, 100, Math.round((raw / benchmarkRaw) * 100)),
    raw,
    benchmarkRaw,
  };
}

function buildRelativeBucketScores(userFam, baselineFam) {
  const result = emptyBucketScores();
  for (const bucket of BUCKET_KEYS) {
    const userVal = userFam?.[bucket] || 0;
    const baselineVal = baselineFam?.[bucket] || 0;
    result[bucket] = baselineVal > 0
      ? clamp(0, 100, Math.round((userVal / baselineVal) * 100))
      : 0;
  }
  return result;
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

// ────────────────────────────────────────────────────────────────────────────
// Build scoped skill-family raw scores (difficulty-aware via best.rating)
//
// Uses pumbility rating points from bestByChart entries, which already
// factor in chart level and grade (e.g., SSS on S24 = 2880, SSS on S15 = 1200).
//
// modeFilter: null → all, 'Single' → singles only, 'Double' → doubles only
// ────────────────────────────────────────────────────────────────────────────
function buildScopedSkillFamilyScores(songCatalog, bestByChart, modeFilter) {
  // Step 1: aggregate per-slug rating stats
  const slugStats = new Map();

  for (const chart of songCatalog.charts) {
    if (modeFilter && chart.mode !== modeFilter) continue;
    if (!chart.skills || chart.skills.length === 0) continue;

    const best = bestByChart.get(chart.key) || null;

    for (const skill of chart.skills) {
      const slug = skill.slug || skill.skill_slug;
      if (!slug || !SLUG_TO_BUCKET[slug]) continue;

      if (!slugStats.has(slug)) {
        slugStats.set(slug, {
          slug,
          bucket: SLUG_TO_BUCKET[slug],
          total_charts: 0,
          rating_sum: 0,
          rating_count: 0,
        });
      }
      const entry = slugStats.get(slug);
      entry.total_charts += 1;

      const rating = best ? (best.rating || 0) : 0;
      if (rating > 0) {
        entry.rating_sum += rating;
        entry.rating_count += 1;
      }
    }
  }

  // Step 2: aggregate into bucket families via weighted mean of avg ratings
  const bucketScores = {};
  for (const bucket of BUCKET_KEYS) {
    const slugsInBucket = SCOUTING_SKILL_BUCKETS[bucket];
    const values = [];
    const weights = [];
    for (const slug of slugsInBucket) {
      const entry = slugStats.get(slug);
      if (!entry || entry.rating_count <= 0) continue;
      const avgRating = entry.rating_sum / entry.rating_count;
      const weight = Math.min(entry.rating_count, 8);
      values.push(avgRating);
      weights.push(weight);
    }
    bucketScores[bucket] = values.length > 0
      ? Number(weightedMean(values, weights).toFixed(2))
      : 0;
  }

  return bucketScores;
}

// ────────────────────────────────────────────────────────────────────────────
// Shared Shinsa snapshot + cohort baseline
// ────────────────────────────────────────────────────────────────────────────
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
      ratings: emptyRatingScores(),
      families: emptyScopedBucketScores(),
    };
  }

  const analytics = helpers.formatAnalytics(userId, profile, syncRow, songCatalog, bestByChart, passBestByChart);
  const doublesRaw = (analytics.pumbility_breakdown?.doubles_top50 || [])
    .slice(0, 50)
    .reduce((sum, row) => sum + (row.rating || 0), 0);

  return {
    profile,
    syncRow,
    bestByChart,
    passBestByChart,
    analytics,
    hasPiuData: true,
    ratings: {
      overall: analytics.pumbility || 0,
      singles: analytics.singles_pumbility || 0,
      doubles: doublesRaw,
    },
    families: {
      overall: buildScopedSkillFamilyScores(songCatalog, bestByChart, null),
      singles: buildScopedSkillFamilyScores(songCatalog, bestByChart, 'Single'),
      doubles: buildScopedSkillFamilyScores(songCatalog, bestByChart, 'Double'),
    },
  };
}

function readShinsaBaselineCache() {
  if (!shinsaBaselineCache.data) return null;
  if (Date.now() >= shinsaBaselineCache.expiresAt) {
    shinsaBaselineCache = { data: null, expiresAt: 0 };
    return null;
  }
  return shinsaBaselineCache.data;
}

function writeShinsaBaselineCache(data) {
  shinsaBaselineCache = {
    data: cloneShinsaBaseline(data),
    expiresAt: Date.now() + SHINSA_BASELINE_TTL_MS,
  };
}

function buildShinsaBaseline(db, helpers) {
  const cached = readShinsaBaselineCache();
  if (cached) return cloneShinsaBaseline(cached);

  const cohortRows = db.prepare(`
    SELECT DISTINCT scoped.user_id
    FROM (
      SELECT user_id FROM user_piugame_sync WHERE best_scores_imported = 1
      UNION ALL
      SELECT user_id FROM user_best_scores
    ) scoped
    WHERE scoped.user_id IS NOT NULL AND TRIM(scoped.user_id) != ''
  `).all();

  const snapshots = [];
  for (const row of cohortRows) {
    const scopedUserId = String(row.user_id || '').trim();
    if (!scopedUserId) continue;
    const snapshot = buildUserScoutingSnapshot(db, scopedUserId, helpers);
    if (snapshot?.hasPiuData) snapshots.push(snapshot);
  }

  const baseline = buildShinsaBaselineFromSnapshots(snapshots);
  writeShinsaBaselineCache(baseline);
  return cloneShinsaBaseline(baseline);
}

// ────────────────────────────────────────────────────────────────────────────
// Cadence stats
// ────────────────────────────────────────────────────────────────────────────
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

  // Compare across all synced Shinsa users
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

// ────────────────────────────────────────────────────────────────────────────
// Specialty labels
// ────────────────────────────────────────────────────────────────────────────
function buildSpecialtyLabels(modeProfile, activeFamilyScores, activeScope) {
  const labels = [];

  // Primary identity chip
  if (modeProfile.dominant_label) {
    labels.push({ key: 'mode', label: modeProfile.dominant_label });
  }

  // Top two attribute buckets by score
  const ranked = BUCKET_KEYS
    .map((k) => ({ key: k, score: activeFamilyScores[k] || 0 }))
    .filter((b) => b.score > 0)
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

// ────────────────────────────────────────────────────────────────────────────
// Main builder
// ────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} db - better-sqlite3 database instance
 * @param {string} userId
 * @param {object} helpers - { aliases, songCatalog, queryUserBestScores, queryUserRecentScores,
 *   queryUserPumbilityScores, buildUserBestByChartMap, formatAnalytics, getCompetitiveLevel,
 *   getIdentityModeProfile, buildIdentityLevelRows }
 */
function buildPlayerScoutingCard(db, userId, helpers) {
  const { songCatalog } = helpers;

  // ── User profile ──
  const profile = db.prepare(
    'SELECT id, username, avatar, pumbility, skill_title, nationality FROM users WHERE id = ?'
  ).get(userId);
  if (!profile) return null;

  // ── Check for PIU data ──
  const syncRow = db.prepare(
    'SELECT best_scores_imported, last_best_scores_sync, pumbility_value, play_data_levels_json FROM user_piugame_sync WHERE user_id = ?'
  ).get(userId) || null;

  const snapshot = buildUserScoutingSnapshot(db, userId, helpers, profile, syncRow);
  if (!snapshot) return null;

  const { bestByChart, passBestByChart, analytics, ratings: rawRatings, families: rawFamilies, hasPiuData } = snapshot;

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

  const overallRaw = rawRatings.overall || 0;
  const singlesRaw = rawRatings.singles || 0;
  const doublesRaw = rawRatings.doubles || 0;

  const familyOverall = rawFamilies.overall || emptyBucketScores();
  const familySingle = rawFamilies.singles || emptyBucketScores();
  const familyDouble = rawFamilies.doubles || emptyBucketScores();

  // ── Shinsa-relative baseline ──
  const benchmark = buildShinsaBaseline(db, helpers);
  mergeSnapshotIntoShinsaBaseline(benchmark, snapshot, { count: false });
  const hasBenchmark = benchmark.ratings.overall > 0 || benchmark.ratings.singles > 0 || benchmark.ratings.doubles > 0;

  const ratings = {
    overall: buildRelativeRating(overallRaw, benchmark.ratings.overall),
    singles: buildRelativeRating(singlesRaw, benchmark.ratings.singles),
    doubles: {
      ...buildRelativeRating(doublesRaw, benchmark.ratings.doubles),
      partial: false,
    },
  };

  const attributes = {
    overall: buildRelativeBucketScores(familyOverall, benchmark.families.overall),
    singles: buildRelativeBucketScores(familySingle, benchmark.families.singles),
    doubles: buildRelativeBucketScores(familyDouble, benchmark.families.doubles),
  };

  // ── Competitive levels ──
  const singleLevel = analytics.competitive_levels?.single?.level || null;
  const doubleLevel = analytics.competitive_levels?.double?.level || null;

  // ── Mode identity ──
  const singleRows = helpers.buildIdentityLevelRows(analytics.levels?.single || [], 'Single');
  const doubleRows = helpers.buildIdentityLevelRows(analytics.levels?.double || [], 'Double');
  const singleStrength = singleRows.reduce((sum, row) => sum + row.weight, 0);
  const doubleStrength = doubleRows.reduce((sum, row) => sum + row.weight, 0);
  const modeProfile = helpers.getIdentityModeProfile(singleStrength, doubleStrength);

  // ── Cadence ──
  const cadence = buildCadenceStats(db, userId);

  // ── Specialties ──
  const specialties = buildSpecialtyLabels(modeProfile, familyOverall, 'overall');

  // ── Home label ──
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
    benchmark: {
      key: benchmark.key,
      label: benchmark.label,
      source: benchmark.source,
      doublesPartial: false,
      cohortSize: benchmark.cohortSize,
    },
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
      hasBenchmark,
      doublesBenchmarkPartial: false,
      attributeMode: 'shinsa_relative',
    },
  };
}

module.exports = {
  buildPlayerScoutingCard,
  __test: {
    buildCadenceSummary,
    buildRelativeBucketScores,
    buildRelativeRating,
    buildShinsaBaselineFromSnapshots,
    countCadenceSessions,
    createEmptyShinsaBaseline,
    mergeSnapshotIntoShinsaBaseline,
  },
};

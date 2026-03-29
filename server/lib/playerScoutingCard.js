'use strict';

const { normalizeUserAvatarForList } = require('./avatarProxy');

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

  // Count user's active days and plays in last 30 days
  // date_played may contain timestamps like "2026-03-29 05:17:14 (GMT+9)" so extract the date portion
  const userActivity = db.prepare(`
    SELECT SUBSTR(date_played, 1, 10) as play_date, COUNT(*) as play_count
    FROM user_recently_played
    WHERE user_id = ? AND SUBSTR(date_played, 1, 10) >= ?
    GROUP BY play_date
  `).all(userId, cutoffDate);

  const activeDays30 = userActivity.length;
  const plays30 = userActivity.reduce((sum, row) => sum + (parseInt(row.play_count, 10) || 0), 0);
  const sessionsPerWeekApprox = Number((activeDays30 / 30 * 7).toFixed(1));

  if (activeDays30 === 0) {
    return { score100: 0, percentile: 0, activeDays30: 0, plays30: 0, sessionsPerWeekApprox: 0, label: 'No recent activity' };
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
    return { score100: 100, percentile: 100, activeDays30, plays30, sessionsPerWeekApprox, label: 'Only active Shinsa user' };
  }

  // Rank by activeDays primarily, plays as tie-break
  allUsers.sort((a, b) => {
    if (a.active_days !== b.active_days) return a.active_days - b.active_days;
    return a.total_plays - b.total_plays;
  });

  const userIndex = allUsers.findIndex((u) => u.user_id === userId);
  const percentile = userIndex >= 0
    ? Math.round((userIndex / (allUsers.length - 1)) * 100)
    : 50;

  let label = 'Moderate';
  if (percentile >= 90) label = 'Very active';
  else if (percentile >= 70) label = 'Active';
  else if (percentile >= 40) label = 'Moderate';
  else label = 'Casual';

  return {
    score100: clamp(0, 100, percentile),
    percentile,
    activeDays30,
    plays30,
    sessionsPerWeekApprox,
    label,
  };
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
    buildRelativeBucketScores,
    buildRelativeRating,
    buildShinsaBaselineFromSnapshots,
    createEmptyShinsaBaseline,
    mergeSnapshotIntoShinsaBaseline,
  },
};

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
// Resolve FEFEMZ benchmark player
// ────────────────────────────────────────────────────────────────────────────
function resolveBenchmarkPlayer(db, songCatalog, helpers) {
  const benchmarkName = 'fefemz';
  const localUser = db.prepare(
    'SELECT id, username, avatar FROM users WHERE LOWER(TRIM(username)) = ? LIMIT 1'
  ).get(benchmarkName) || null;

  if (localUser) {
    // Full local analytics path
    const { bestByChart: bmBestByChart } = helpers.buildUserBestByChartMap({
      bestScores: helpers.queryUserBestScores(db, localUser.id),
      recentScores: helpers.queryUserRecentScores(db, localUser.id),
      pumbilityScores: helpers.queryUserPumbilityScores(db, localUser.id),
      aliases: helpers.aliases,
      validChartKeys: songCatalog.chartsByKey,
    });

    const bmAnalytics = helpers.formatAnalytics(
      localUser.id,
      db.prepare('SELECT id, username, avatar, pumbility FROM users WHERE id = ?').get(localUser.id),
      db.prepare('SELECT best_scores_imported, last_best_scores_sync, pumbility_value, play_data_levels_json FROM user_piugame_sync WHERE user_id = ?').get(localUser.id) || null,
      songCatalog,
      bmBestByChart,
      bmBestByChart, // passBest same for benchmark
    );

    const familyOverall = buildScopedSkillFamilyScores(songCatalog, bmBestByChart, null);
    const familySingle = buildScopedSkillFamilyScores(songCatalog, bmBestByChart, 'Single');
    const familyDouble = buildScopedSkillFamilyScores(songCatalog, bmBestByChart, 'Double');

    return {
      key: benchmarkName,
      label: 'FEFEMZ',
      source: 'local',
      doublesPartial: false,
      overallPumbility: bmAnalytics.pumbility || 0,
      singlesPumbility: bmAnalytics.singles_pumbility || 0,
      doublesPumbility: (bmAnalytics.pumbility_breakdown?.doubles_top50 || [])
        .slice(0, 50)
        .reduce((sum, r) => sum + (r.rating || 0), 0),
      families: {
        overall: familyOverall,
        singles: familySingle,
        doubles: familyDouble,
      },
    };
  }

  // Global fallback — use player-sheet style data from OVER rankings
  // This is a simplified fallback; only pumbility ratings are available
  const overallRating = getOverFallbackPumbility(db, benchmarkName, null);
  const singlesRating = getOverFallbackPumbility(db, benchmarkName, 'Single');
  const doublesRating = getOverFallbackPumbility(db, benchmarkName, 'Double');

  return {
    key: benchmarkName,
    label: 'FEFEMZ',
    source: 'global_fallback',
    doublesPartial: doublesRating <= 0,
    overallPumbility: overallRating,
    singlesPumbility: singlesRating,
    doublesPumbility: doublesRating,
    families: null, // no skill-family data without local best scores
  };
}

function getOverFallbackPumbility(db, playerName, modeFilter) {
  const { isPassingScore } = require('./pumbilityCandidates');
  const { normalizeGrade, gradeFromScore, calculateRatingPoints, LEVEL_BASE_POINTS, GRADE_MULTIPLIER } = require('./titleProgress');
  const normalizedName = String(playerName || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const modeSqlFilter = modeFilter === 'Single'
    ? `AND c.mode = 'Single'`
    : modeFilter === 'Double'
      ? `AND c.mode = 'Double'`
      : `AND c.mode IN ('Single', 'Double')`;

  const overRows = db.prepare(`
    SELECT r.chart_key, r.score, r.grade,
           c.song_title, c.mode, c.level
    FROM over_level_ranking_scores r
    JOIN over_level_rankings c ON c.chart_key = r.chart_key
    WHERE c.level >= 20
      ${modeSqlFilter}
      AND r.score > 0
      AND LOWER(TRIM(r.player_name)) = ?
    ORDER BY c.chart_key ASC, r.row_order ASC
  `).all(normalizedName);

  const bestByChart = new Map();
  for (const row of overRows) {
    const chartKey = String(row.chart_key || '').trim();
    if (!chartKey) continue;
    const existing = bestByChart.get(chartKey);
    const score = parseInt(row.score, 10) || 0;
    if (!existing || score > existing.score) {
      bestByChart.set(chartKey, row);
    }
  }

  const rated = [];
  for (const [, row] of bestByChart) {
    const score = parseInt(row.score, 10) || 0;
    const level = parseInt(row.level, 10) || 0;
    if (!isPassingScore(score, row.grade)) continue;
    const grade = normalizeGrade(row.grade || gradeFromScore(score));
    const rating = calculateRatingPoints(level, grade, score);
    if (rating > 0) rated.push(rating);
  }

  rated.sort((a, b) => b - a);
  return rated.slice(0, 50).reduce((sum, r) => sum + r, 0);
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
  const { aliases, songCatalog } = helpers;

  // ── User profile ──
  const profile = db.prepare(
    'SELECT id, username, avatar, pumbility, skill_title, nationality FROM users WHERE id = ?'
  ).get(userId);
  if (!profile) return null;

  // ── Check for PIU data ──
  const syncRow = db.prepare(
    'SELECT best_scores_imported, last_best_scores_sync, pumbility_value, play_data_levels_json FROM user_piugame_sync WHERE user_id = ?'
  ).get(userId) || null;

  const { bestByChart, passBestByChart } = (() => {
    const result = helpers.buildUserBestByChartMap({
      bestScores: helpers.queryUserBestScores(db, userId),
      recentScores: helpers.queryUserRecentScores(db, userId),
      pumbilityScores: helpers.queryUserPumbilityScores(db, userId),
      aliases,
      validChartKeys: songCatalog.chartsByKey,
    });
    return { bestByChart: result.bestByChart, passBestByChart: result.passBest };
  })();

  const hasPiuData = bestByChart.size > 0;

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

  // ── Analytics ──
  const analytics = helpers.formatAnalytics(userId, profile, syncRow, songCatalog, bestByChart, passBestByChart);

  // ── Pumbility scores ──
  const overallRaw = analytics.pumbility || 0;
  const singlesRaw = analytics.singles_pumbility || 0;
  const doublesRaw = (analytics.pumbility_breakdown?.doubles_top50 || [])
    .slice(0, 50)
    .reduce((sum, r) => sum + (r.rating || 0), 0);

  // ── Skill family scores for all scopes ──
  const familyOverall = buildScopedSkillFamilyScores(songCatalog, bestByChart, null);
  const familySingle = buildScopedSkillFamilyScores(songCatalog, bestByChart, 'Single');
  const familyDouble = buildScopedSkillFamilyScores(songCatalog, bestByChart, 'Double');

  // ── Benchmark ──
  const benchmark = resolveBenchmarkPlayer(db, songCatalog, helpers);
  const hasBenchmark = !!(benchmark && (benchmark.overallPumbility > 0 || benchmark.singlesPumbility > 0));

  // ── Benchmark-relative ratings ──
  const benchmarkScore = (userVal, bmVal) => {
    if (!bmVal || bmVal <= 0) return { score100: 0, raw: userVal, benchmarkRaw: 0 };
    return {
      score100: clamp(0, 100, Math.round((userVal / bmVal) * 100)),
      raw: userVal,
      benchmarkRaw: bmVal,
    };
  };

  const ratings = {
    overall: benchmarkScore(overallRaw, benchmark.overallPumbility),
    singles: benchmarkScore(singlesRaw, benchmark.singlesPumbility),
    doubles: {
      ...benchmarkScore(doublesRaw, benchmark.doublesPumbility),
      partial: benchmark.doublesPartial,
    },
  };

  // ── Benchmark-relative family attributes ──
  // When benchmark families exist: scale user vs benchmark (0-100 = % of benchmark)
  // When benchmark families are null (global fallback): self-normalize —
  //   strongest bucket = 100, others show proportion relative to strongest.
  //   This shows internal balance rather than absolute strength.
  const hasBenchmarkFamilies = !!(benchmark.families);

  const benchmarkFamily = (userFam, bmFamilies, scope) => {
    const bmFam = bmFamilies ? bmFamilies[scope] : null;

    if (bmFam) {
      // True benchmark: scale each bucket against the benchmark player
      const result = {};
      for (const bucket of BUCKET_KEYS) {
        const userVal = userFam[bucket] || 0;
        const bmVal = bmFam[bucket] || 0;
        result[bucket] = bmVal > 0
          ? clamp(0, 100, Math.round((userVal / bmVal) * 100))
          : 0;
      }
      return result;
    }

    // Self-normalize: scale each bucket relative to the user's own strongest bucket
    const maxBucket = Math.max(...BUCKET_KEYS.map((k) => userFam[k] || 0));
    if (maxBucket <= 0) return { speed: 0, stamina: 0, mobility: 0, tech: 0 };
    const result = {};
    for (const bucket of BUCKET_KEYS) {
      const userVal = userFam[bucket] || 0;
      result[bucket] = clamp(0, 100, Math.round((userVal / maxBucket) * 100));
    }
    return result;
  };

  const attributes = {
    overall: benchmarkFamily(familyOverall, benchmark.families, 'overall'),
    singles: benchmarkFamily(familySingle, benchmark.families, 'singles'),
    doubles: benchmarkFamily(familyDouble, benchmark.families, 'doubles'),
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
      doublesPartial: benchmark.doublesPartial,
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
      doublesBenchmarkPartial: benchmark.doublesPartial,
      attributeMode: hasBenchmarkFamilies ? 'benchmarked' : 'profile_relative',
    },
  };
}

module.exports = { buildPlayerScoutingCard };

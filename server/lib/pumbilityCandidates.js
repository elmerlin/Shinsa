// Shared pumbility candidate-building math.
// Extracted from server/routes/piugame.js to avoid forking business logic
// between /optimise and /what-to-play.

const {
  LEVEL_BASE_POINTS, GRADE_MULTIPLIER, SCORE_TO_GRADE,
  calculateRatingPoints, gradeFromScore, normalizeGrade,
} = require('./titleProgress');

const SCORE_TO_GRADE_ASC = [...SCORE_TO_GRADE].sort((a, b) => a.min - b.min);

/**
 * Find the next grade threshold above the given score.
 */
function getNextGradeThreshold(score) {
  const currentScore = parseInt(score, 10) || 0;
  for (const row of SCORE_TO_GRADE_ASC) {
    if (row.min > currentScore) return row;
  }
  return null;
}

function isFailGrade(grade) {
  const raw = String(grade || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return false;
  if (/^X(?:[_-]|$)/.test(raw)) return true;
  return normalizeGrade(raw) === 'F';
}

function isPassingScore(score, grade) {
  const numeric = parseInt(score, 10) || 0;
  if (numeric <= 0) return false;
  return !isFailGrade(grade);
}

/**
 * Strict pass check for a play record (e.g. from user_recently_played).
 * Resolves grade via normalizeGrade, falls back to gradeFromScore when
 * grade is blank/messy. Matches the strictness of the route-local
 * isPassRecord in songs.js — extracted here to keep lib modules
 * independent of route code.
 */
function isPassRecord(record) {
  const score = parseInt(record?.score, 10) || 0;
  if (score <= 0) return false;
  const resolved = normalizeGrade(record?.grade) || gradeFromScore(score);
  return resolved !== 'F';
}

/**
 * Build pumbility upgrade candidates from user's best scores.
 * Defensively filters to passing scores only, so callers
 * don't need to pre-filter (matching piugame.js:5518 behavior).
 *
 * @param {Array} bestScores - raw best score rows (may include fails)
 * @param {Object} options
 * @param {string} options.modeFilter - '' for all, 'Single' for singles only
 * @param {string} options.metric - 'overall'|'singles'|'doubles'
 * @returns {{ candidates, baselinePumbility, minPumbilityRating, pumbilityTopCount, metric, modeFilter }}
 */
function buildPumbilityCandidates(bestScores, options = {}) {
  const modeFilter = String(options.modeFilter || '');
  const metric = String(options.metric || '').trim()
    || (modeFilter ? modeFilter.toLowerCase() : 'overall');

  // Defensive: only use passing scores. Co-op is excluded from Pumbility — its
  // score belongs to whichever PIUGame account played, not necessarily the
  // controller-holder, so it would inflate single-player rankings unfairly.
  const passingScores = (bestScores || []).filter(
    (row) => isPassingScore(row.score, row.grade) && String(row.mode || '') !== 'CoOp',
  );

  const sourceScores = modeFilter
    ? passingScores.filter((row) => String(row.mode || '') === modeFilter)
    : passingScores;

  const emptyResult = {
    candidates: [],
    baselinePumbility: 0,
    minPumbilityRating: 0,
    pumbilityTopCount: 0,
    metric,
    modeFilter: modeFilter || null,
  };

  if (!sourceScores.length) return emptyResult;

  const ratedEntries = [];
  for (const s of sourceScores) {
    const level = parseInt(s.level, 10) || 0;
    if (!LEVEL_BASE_POINTS[level]) continue;
    const score = parseInt(s.score, 10) || 0;
    if (score <= 0) continue;

    const currentGrade = s.grade || gradeFromScore(score);
    const currentRating = calculateRatingPoints(level, currentGrade, score);
    if (currentRating <= 0) continue;
    ratedEntries.push({
      song_title: s.song_title,
      mode: s.mode,
      level,
      current_score: score,
      current_grade: currentGrade,
      current_rating: currentRating,
      background_url: s.background_url || '',
    });
  }

  if (!ratedEntries.length) return emptyResult;

  const baselineRatings = ratedEntries.map((entry) => entry.current_rating);
  const baselineSorted = [...baselineRatings].sort((a, b) => b - a);
  const pumbilityTopCount = Math.min(50, baselineSorted.length);
  const baselinePumbility = baselineSorted.slice(0, pumbilityTopCount)
    .reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0);
  const minPumbilityRating = pumbilityTopCount >= 50
    ? (parseInt(baselineSorted[49], 10) || 0)
    : 0;

  const candidates = [];
  for (let idx = 0; idx < ratedEntries.length; idx++) {
    const entry = ratedEntries[idx];
    const nextTier = getNextGradeThreshold(entry.current_score);
    if (!nextTier) continue;

    const nextThreshold = parseInt(nextTier.min, 10) || 0;
    const nextGrade = String(nextTier.grade || '').trim();
    if (!nextThreshold || !nextGrade) continue;

    const scoreNeeded = nextThreshold - entry.current_score;
    if (scoreNeeded <= 0) continue;

    const nextRating = calculateRatingPoints(entry.level, nextGrade, nextThreshold);
    if (nextRating <= entry.current_rating) continue;

    const simulatedRatings = [...baselineRatings];
    simulatedRatings[idx] = nextRating;
    simulatedRatings.sort((a, b) => b - a);
    const simulatedPumbility = simulatedRatings.slice(0, pumbilityTopCount)
      .reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0);
    const pumbilityGain = simulatedPumbility - baselinePumbility;
    if (pumbilityGain <= 0) continue;

    const ratingGain = nextRating - entry.current_rating;
    const impactPerPoint = pumbilityGain / scoreNeeded;
    candidates.push({
      song_title: entry.song_title,
      mode: entry.mode,
      level: entry.level,
      current_score: entry.current_score,
      current_grade: entry.current_grade,
      current_rating: entry.current_rating,
      next_grade: nextGrade,
      next_threshold: nextThreshold,
      next_rating: nextRating,
      score_needed: scoreNeeded,
      rating_gain: ratingGain,
      pumbility_gain: pumbilityGain,
      impact_per_point: Math.round(impactPerPoint * 1000000) / 1000000,
      background_url: entry.background_url || '',
      _key: `${entry.song_title}|${entry.mode}|${entry.level}`,
    });
  }

  return {
    candidates,
    baselinePumbility,
    minPumbilityRating,
    pumbilityTopCount,
    metric,
    modeFilter: modeFilter || null,
  };
}

module.exports = {
  buildPumbilityCandidates,
  getNextGradeThreshold,
  isPassingScore,
  isPassRecord,
  isFailGrade,
  SCORE_TO_GRADE_ASC,
};

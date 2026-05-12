const { calculateRatingPoints, normalizeGrade, gradeFromScore, GRADE_MULTIPLIER } = require('./titleProgress');

const WEEKLY_CHALLENGE_PG_BONUS_MULTIPLIER = 1.10;
const WEEKLY_CHALLENGE_PG_BONUS_PERCENT = 10;

/**
 * Co-op WC base points by player count. Co-op charts don't have a
 * difficulty level in PIU's catalog — only a player count (C2/C3/…/C5),
 * stored in our schema as `level`. The main-division `LEVEL_BASE_POINTS`
 * table only covers difficulty levels 10–28, so without a Co-op-specific
 * fallback every Co-op play earned zero points and the leaderboard fell
 * through to clear-count tie-breakers.
 *
 * 500 for C2 is calibrated so a clean SSS+ Perfect-Game pass (500 × 1.5 × 1.1)
 * = ~825 pts — comparable to a mid-S-rank pass on a level-19 Singles chart,
 * which feels right for Co-op's "fun but not the headline" position. Higher
 * player counts (C3/C4/C5) are placeholders for when we expand beyond 2P.
 */
const COOP_BASE_POINTS = {
  2: 500,
  3: 600,
  4: 700,
  5: 800,
};

function resolveGrade(rawGrade, score) {
  return normalizeGrade(rawGrade) || gradeFromScore(parseInt(score, 10) || 0);
}

function isPerfectGamePlate(plate) {
  return String(plate || '').trim().toUpperCase() === 'PG';
}

/**
 * Base points for a weekly-challenge play. For Singles/Doubles this falls
 * through to `calculateRatingPoints` (uses the level-keyed LEVEL_BASE_POINTS
 * curve); for Co-op we use COOP_BASE_POINTS keyed by player-count and apply
 * the same GRADE_MULTIPLIER map so the grade-quality dynamic stays consistent.
 */
function calculateBaseRatingPoints(level, grade, score, mode) {
  const numericScore = parseInt(score, 10) || 0;
  if (numericScore <= 0) return 0;

  if (String(mode || '').trim() === 'CoOp') {
    const base = COOP_BASE_POINTS[parseInt(level, 10)];
    if (!base) return 0;
    const normalized = normalizeGrade(grade) || gradeFromScore(numericScore);
    if (!normalized || normalized === 'F') return 0;
    const mult = GRADE_MULTIPLIER[normalized];
    if (!mult) return 0;
    return Math.round(base * mult);
  }
  return calculateRatingPoints(level, grade, score);
}

function getWeeklyChallengeRatingBreakdown(level, grade, score, plate, resolvedGrade = null, mode = null) {
  const challengeGrade = resolvedGrade || resolveGrade(grade, score);
  const baseRatingPoints = calculateBaseRatingPoints(level, challengeGrade, score, mode);
  const hasPgBonus = baseRatingPoints > 0 && challengeGrade === 'SSS+' && isPerfectGamePlate(plate);
  const ratingPoints = hasPgBonus
    ? Math.round(baseRatingPoints * WEEKLY_CHALLENGE_PG_BONUS_MULTIPLIER)
    : baseRatingPoints;

  return {
    ratingPoints,
    baseRatingPoints,
    pgBonusPoints: hasPgBonus ? Math.max(0, ratingPoints - baseRatingPoints) : 0,
    pgBonusPercent: hasPgBonus ? WEEKLY_CHALLENGE_PG_BONUS_PERCENT : 0,
    hasPgBonus,
  };
}

function getPersistedWeeklyChallengeRatingBreakdown(level, grade, score, plate, ratingPoints, resolvedGrade = null, mode = null) {
  const challengeGrade = resolvedGrade || resolveGrade(grade, score);
  const baseRatingPoints = calculateBaseRatingPoints(level, challengeGrade, score, mode);
  const storedRatingPoints = parseInt(ratingPoints, 10) || 0;
  const eligibleForPgBonus = baseRatingPoints > 0 && challengeGrade === 'SSS+' && isPerfectGamePlate(plate);
  const pgBonusPoints = eligibleForPgBonus ? Math.max(0, storedRatingPoints - baseRatingPoints) : 0;
  const hasPgBonus = pgBonusPoints > 0;

  return {
    ratingPoints: storedRatingPoints,
    baseRatingPoints,
    pgBonusPoints,
    pgBonusPercent: hasPgBonus ? WEEKLY_CHALLENGE_PG_BONUS_PERCENT : 0,
    hasPgBonus,
  };
}

function calculateWeeklyChallengeRatingPoints(level, grade, score, plate, resolvedGrade = null, mode = null) {
  return getWeeklyChallengeRatingBreakdown(level, grade, score, plate, resolvedGrade, mode).ratingPoints;
}

module.exports = {
  WEEKLY_CHALLENGE_PG_BONUS_MULTIPLIER,
  WEEKLY_CHALLENGE_PG_BONUS_PERCENT,
  COOP_BASE_POINTS,
  calculateWeeklyChallengeRatingPoints,
  getWeeklyChallengeRatingBreakdown,
  getPersistedWeeklyChallengeRatingBreakdown,
};

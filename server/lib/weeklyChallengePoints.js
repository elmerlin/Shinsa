const { calculateRatingPoints, normalizeGrade, gradeFromScore } = require('./titleProgress');

const WEEKLY_CHALLENGE_PG_BONUS_MULTIPLIER = 1.10;
const WEEKLY_CHALLENGE_PG_BONUS_PERCENT = 10;

function resolveGrade(rawGrade, score) {
  return normalizeGrade(rawGrade) || gradeFromScore(parseInt(score, 10) || 0);
}

function isPerfectGamePlate(plate) {
  return String(plate || '').trim().toUpperCase() === 'PG';
}

function getWeeklyChallengeRatingBreakdown(level, grade, score, plate, resolvedGrade = null) {
  const challengeGrade = resolvedGrade || resolveGrade(grade, score);
  const baseRatingPoints = calculateRatingPoints(level, challengeGrade, score);
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

function getPersistedWeeklyChallengeRatingBreakdown(level, grade, score, plate, ratingPoints, resolvedGrade = null) {
  const challengeGrade = resolvedGrade || resolveGrade(grade, score);
  const baseRatingPoints = calculateRatingPoints(level, challengeGrade, score);
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

function calculateWeeklyChallengeRatingPoints(level, grade, score, plate, resolvedGrade = null) {
  return getWeeklyChallengeRatingBreakdown(level, grade, score, plate, resolvedGrade).ratingPoints;
}

module.exports = {
  WEEKLY_CHALLENGE_PG_BONUS_MULTIPLIER,
  WEEKLY_CHALLENGE_PG_BONUS_PERCENT,
  calculateWeeklyChallengeRatingPoints,
  getWeeklyChallengeRatingBreakdown,
  getPersistedWeeklyChallengeRatingBreakdown,
};

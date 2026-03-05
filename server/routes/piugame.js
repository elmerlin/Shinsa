const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const {
  login,
  scrapePumbility,
  scrapeBestScores,
  scrapeRecentlyPlayed,
  scrapePumbilityRanking,
  scrapeOverRankingTop100,
} = require('../lib/piugameScraper');
const { createUserNotification } = require('../lib/notifications');
const { notifyActivitySubscribers, buildProfilePath } = require('../lib/activitySubscriptions');
const { getUserTitleProgress, updateUserSkillTitleFromBestScores, LEVEL_BASE_POINTS, GRADE_MULTIPLIER, SCORE_TO_GRADE, calculateRatingPoints, gradeFromScore, normalizeGrade } = require('../lib/titleProgress');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.PIU_ENCRYPT_KEY || 'shinsa-piugame-credential-key').digest();
const ADMIN_USERNAMES = new Set(
  String(process.env.ADMIN_USERNAMES || 'elmer')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const ADMIN_USER_IDS = new Set(
  String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const SHOE_UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/heic', 'image/heif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function normalizeShoeText(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeShoeColorway(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const SCORE_TO_GRADE_ASC = [...SCORE_TO_GRADE].sort((a, b) => a.min - b.min);
const LEADERBOARD_GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const LEADERBOARD_GRADE_INDEX = Object.fromEntries(LEADERBOARD_GRADE_ORDER.map((grade, idx) => [grade, idx]));

function getNextGradeThreshold(score) {
  const currentScore = parseInt(score, 10) || 0;
  for (const row of SCORE_TO_GRADE_ASC) {
    if (row.min > currentScore) return row;
  }
  return null;
}

function getLeaderboardGradeSortValue(grade) {
  const normalized = normalizeGrade(String(grade || '').trim());
  return LEADERBOARD_GRADE_INDEX[normalized] ?? -1;
}

function normalizeRecommendationMetric(metricRaw, modeRaw) {
  const metric = String(metricRaw || '').trim().toLowerCase();
  const mode = String(modeRaw || '').trim().toLowerCase();

  if (metric === 'singles' || metric === 'single' || mode === 'single' || mode === 'singles') {
    return { metric: 'singles', modeFilter: 'Single' };
  }
  if (metric === 'doubles' || metric === 'double' || mode === 'double' || mode === 'doubles') {
    return { metric: 'doubles', modeFilter: 'Double' };
  }
  return { metric: 'overall', modeFilter: '' };
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

function chartScoreKey(songTitle, mode, level) {
  const title = String(songTitle || '').trim();
  const chartMode = String(mode || '').trim();
  const chartLevel = parseInt(level, 10) || 0;
  if (!title || !chartMode || chartLevel <= 0) return '';
  return `${title}|${chartMode}|${chartLevel}`;
}

function normalizeOverRankingSongTitle(songTitle) {
  const normalized = String(songTitle || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const compact = normalized.toLowerCase();
  if (compact === 'yog-sothoth - short cut -' || compact === 'yog-sothoth- short cut -') {
    return 'Yog-Sothoth - SHORT CUT -';
  }
  return normalized;
}

function overRankingChartKey(songTitle, mode, level) {
  const title = normalizeOverRankingSongTitle(songTitle);
  const chartMode = String(mode || '').trim();
  const chartLevel = parseInt(level, 10) || 0;
  if (!title || !chartMode || chartLevel <= 0) return '';
  return `${title}|${chartMode}|${chartLevel}`;
}

function buildOverRankingLookup(db) {
  const charts = db.prepare(`
    SELECT chart_key, song_title, mode, level, top100_count, min_score
    FROM over_level_rankings
  `).all();
  if (!charts.length) return new Map();

  const scoreRows = db.prepare(`
    SELECT chart_key, rank, score, player_name, played_at
    FROM over_level_ranking_scores
    WHERE score > 0
    ORDER BY chart_key ASC, rank ASC
  `).all();

  const byChartKey = new Map();
  for (const chart of charts) {
    const key = String(chart.chart_key || '').trim();
    if (!key) continue;
    byChartKey.set(key, {
      song_title: String(chart.song_title || '').trim(),
      mode: String(chart.mode || '').trim(),
      level: parseInt(chart.level, 10) || 0,
      top100_count: parseInt(chart.top100_count, 10) || 0,
      min_score: parseInt(chart.min_score, 10) || 0,
      scores: [],
    });
  }

  for (const row of scoreRows) {
    const key = String(row.chart_key || '').trim();
    const entry = byChartKey.get(key);
    if (!entry) continue;
    entry.scores.push({
      rank: parseInt(row.rank, 10) || 0,
      score: parseInt(row.score, 10) || 0,
      player_name: String(row.player_name || '').trim(),
      played_at: String(row.played_at || '').trim(),
    });
  }

  for (const entry of byChartKey.values()) {
    entry.scores = assignSharedScoreRanks(
      entry.scores
        .filter((row) => (parseInt(row?.score, 10) || 0) > 0)
        .sort(compareOverRankingRows)
        .slice(0, 100)
    );

    if ((parseInt(entry.top100_count, 10) || 0) <= 0) {
      entry.top100_count = entry.scores.length;
    }
    const inferredMinScore = entry.scores.length
      ? (parseInt(entry.scores[entry.scores.length - 1]?.score, 10) || 0)
      : 0;
    if ((parseInt(entry.min_score, 10) || 0) <= 0 || inferredMinScore > 0) {
      entry.min_score = inferredMinScore;
    }
  }

  // Alias key map supports known song title variants.
  const aliasLookup = new Map();
  for (const [key, value] of byChartKey.entries()) {
    aliasLookup.set(key, value);
    const parts = key.split('|');
    if (parts.length !== 3) continue;
    const [title, mode, level] = parts;
    if (title === 'Yog-Sothoth - SHORT CUT -') {
      aliasLookup.set(`Yog-Sothoth - SHORT CUT -|${mode}|${level}`, value);
      aliasLookup.set(`Yog-Sothoth- SHORT CUT -|${mode}|${level}`, value);
    }
  }

  return aliasLookup;
}

function parseOverRankingPlayedAt(value) {
  const text = String(value || '').trim();
  if (!text) return Number.NEGATIVE_INFINITY;

  // Common PIUGame formats: YYYY-MM-DD, YYYY.MM.DD, with optional HH:MM[:SS]
  const match = text.match(
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4] || '0', 10);
    const minute = parseInt(match[5] || '0', 10);
    const second = parseInt(match[6] || '0', 10);
    const utc = Date.UTC(year, Math.max(0, month - 1), day, hour, minute, second);
    if (Number.isFinite(utc)) return utc;
  }

  const fallback = Date.parse(text.replace(/\./g, '-'));
  return Number.isFinite(fallback) ? fallback : Number.NEGATIVE_INFINITY;
}

function compareOverRankingRows(a, b) {
  const scoreDiff = (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0);
  if (scoreDiff !== 0) return scoreDiff;

  const playedAtDiff = parseOverRankingPlayedAt(b.played_at) - parseOverRankingPlayedAt(a.played_at);
  if (playedAtDiff !== 0) return playedAtDiff;

  // Fallback to source order when date resolution is too coarse/equal.
  const rankA = parseInt(a.rank, 10) || Number.MAX_SAFE_INTEGER;
  const rankB = parseInt(b.rank, 10) || Number.MAX_SAFE_INTEGER;
  return rankA - rankB;
}

function assignSharedScoreRanks(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  let lastScore = null;
  let currentRank = 0;
  return list.map((row, idx) => {
    const score = parseInt(row?.score, 10) || 0;
    if (lastScore === null || score !== lastScore) {
      currentRank = idx + 1;
      lastScore = score;
    }
    return {
      ...row,
      rank: currentRank,
    };
  });
}

function getOverTop100Rank(overLookup, songTitle, mode, level, score, playedAt = '', playerName = '') {
  if (!(overLookup instanceof Map) || overLookup.size === 0) return 0;
  const numericScore = parseInt(score, 10) || 0;
  if (numericScore <= 0) return 0;

  const key = overRankingChartKey(songTitle, mode, level);
  if (!key) return 0;
  const chart = overLookup.get(key);
  if (!chart) return 0;

  const minScore = parseInt(chart.min_score, 10) || 0;
  const scores = Array.isArray(chart.scores) ? chart.scores : [];
  const top100Count = parseInt(chart.top100_count, 10) || scores.length;
  if (top100Count <= 0 || !scores.length) return 0;
  if (scores.length >= 100 && numericScore < minScore) return 0;

  const normalizedPlayerName = normalizeLeaderboardNameKey(playerName);
  if (normalizedPlayerName) {
    const exact = scores.find((row) => {
      const rowScore = parseInt(row?.score, 10) || 0;
      if (rowScore !== numericScore) return false;
      return normalizeLeaderboardNameKey(row?.player_name) === normalizedPlayerName;
    });
    if (exact) {
      const rank = parseInt(exact?.rank, 10) || 0;
      if (rank > 0 && rank <= 100) return rank;
    }
  }

  // Tie-aware fallback: ranks are shared by score.
  const higherScoreCount = scores.filter((row) => (parseInt(row?.score, 10) || 0) > numericScore).length;
  const inferredRank = higherScoreCount + 1;
  return inferredRank >= 1 && inferredRank <= 100 ? inferredRank : 0;
}

function isOverTop100Rank(value) {
  const rank = parseInt(value, 10) || 0;
  return Number.isInteger(rank) && rank > 0 && rank <= 100;
}

function backfillStoredOverTop100Ranks(db, overLookup) {
  if (!(overLookup instanceof Map) || overLookup.size === 0) {
    return {
      best_scores_checked: 0,
      best_scores_updated: 0,
      pumbility_scores_checked: 0,
      pumbility_scores_updated: 0,
      recent_scores_checked: 0,
      recent_scores_updated: 0,
      total_checked: 0,
      total_updated: 0,
    };
  }

  const stats = {
    best_scores_checked: 0,
    best_scores_updated: 0,
    pumbility_scores_checked: 0,
    pumbility_scores_updated: 0,
    recent_scores_checked: 0,
    recent_scores_updated: 0,
    total_checked: 0,
    total_updated: 0,
  };

  const bestRows = db.prepare(`
    SELECT bs.id, bs.song_title, bs.mode, bs.level, bs.score, bs.grade, bs.over_top100_rank, COALESCE(u.username, '') AS username
    FROM user_best_scores bs
    LEFT JOIN users u ON u.id = bs.user_id
    WHERE bs.score > 0 AND bs.level >= 20
  `).all();
  const pumbilityRows = db.prepare(`
    SELECT ps.id, ps.song_title, ps.mode, ps.level, ps.score, ps.grade, ps.date_played, ps.over_top100_rank, COALESCE(u.username, '') AS username
    FROM user_pumbility_scores ps
    LEFT JOIN users u ON u.id = ps.user_id
    WHERE ps.score > 0 AND ps.level >= 20
  `).all();
  const recentRows = db.prepare(`
    SELECT rp.id, rp.song_title, rp.mode, rp.level, rp.score, rp.grade, rp.date_played, rp.over_top100_rank, COALESCE(u.username, '') AS username
    FROM user_recently_played rp
    LEFT JOIN users u ON u.id = rp.user_id
    WHERE rp.score > 0 AND rp.level >= 20
  `).all();

  const updateBest = db.prepare('UPDATE user_best_scores SET over_top100_rank = ? WHERE id = ?');
  const updatePumbility = db.prepare('UPDATE user_pumbility_scores SET over_top100_rank = ? WHERE id = ?');
  const updateRecent = db.prepare('UPDATE user_recently_played SET over_top100_rank = ? WHERE id = ?');

  const txn = db.transaction(() => {
    for (const row of bestRows) {
      stats.best_scores_checked += 1;
      stats.total_checked += 1;
      const nextRank = isPassingScore(row?.score, row?.grade)
        ? getOverTop100Rank(overLookup, row.song_title, row.mode, row.level, row.score, '', row.username)
        : 0;
      const currentRank = parseInt(row?.over_top100_rank, 10) || 0;
      if (nextRank !== currentRank) {
        updateBest.run(nextRank, row.id);
        stats.best_scores_updated += 1;
        stats.total_updated += 1;
      }
    }

    for (const row of pumbilityRows) {
      stats.pumbility_scores_checked += 1;
      stats.total_checked += 1;
      const nextRank = isPassingScore(row?.score, row?.grade)
        ? getOverTop100Rank(overLookup, row.song_title, row.mode, row.level, row.score, row.date_played, row.username)
        : 0;
      const currentRank = parseInt(row?.over_top100_rank, 10) || 0;
      if (nextRank !== currentRank) {
        updatePumbility.run(nextRank, row.id);
        stats.pumbility_scores_updated += 1;
        stats.total_updated += 1;
      }
    }

    for (const row of recentRows) {
      stats.recent_scores_checked += 1;
      stats.total_checked += 1;
      const nextRank = isPassingScore(row?.score, row?.grade)
        ? getOverTop100Rank(overLookup, row.song_title, row.mode, row.level, row.score, row.date_played, row.username)
        : 0;
      const currentRank = parseInt(row?.over_top100_rank, 10) || 0;
      if (nextRank !== currentRank) {
        updateRecent.run(nextRank, row.id);
        stats.recent_scores_updated += 1;
        stats.total_updated += 1;
      }
    }
  });
  txn();

  return stats;
}

function getChartRatingPoints(score, grade, level) {
  const numericScore = parseInt(score, 10) || 0;
  const numericLevel = parseInt(level, 10) || 0;
  if (!isPassingScore(numericScore, grade)) return 0;
  if (!LEVEL_BASE_POINTS[numericLevel]) return 0;
  const resolvedGrade = grade || gradeFromScore(numericScore);
  return calculateRatingPoints(numericLevel, resolvedGrade, numericScore);
}

function compareRatedPumbilityEntries(a, b) {
  const ratingDiff = (parseInt(b?.rating, 10) || 0) - (parseInt(a?.rating, 10) || 0);
  if (ratingDiff !== 0) return ratingDiff;
  const scoreDiff = (parseInt(b?.score, 10) || 0) - (parseInt(a?.score, 10) || 0);
  if (scoreDiff !== 0) return scoreDiff;
  const levelDiff = (parseInt(b?.level, 10) || 0) - (parseInt(a?.level, 10) || 0);
  if (levelDiff !== 0) return levelDiff;
  const modeA = String(a?.mode || '');
  const modeB = String(b?.mode || '');
  if (modeA !== modeB) return modeA.localeCompare(modeB);
  return String(a?.title || '').localeCompare(String(b?.title || ''), undefined, { sensitivity: 'base' });
}

function modeMatchesFilter(mode, modeFilter = '') {
  if (!modeFilter) return true;
  return String(mode || '').trim() === String(modeFilter || '').trim();
}

function buildPumbilityRatingMap(bestScores = [], modeFilter = '') {
  const map = new Map();
  for (const row of (Array.isArray(bestScores) ? bestScores : [])) {
    if (!modeMatchesFilter(row?.mode, modeFilter)) continue;
    const key = chartScoreKey(row?.song_title, row?.mode, row?.level);
    if (!key) continue;
    const rating = getChartRatingPoints(row?.score, row?.grade, row?.level);
    if (rating <= 0) continue;
    map.set(key, rating);
  }
  return map;
}

function applyChartScoreToPumbilityMap(ratingMap, row, modeFilter = '') {
  if (!ratingMap || !(ratingMap instanceof Map)) return;
  if (!modeMatchesFilter(row?.mode, modeFilter)) return;
  const key = chartScoreKey(row?.song_title, row?.mode, row?.level);
  if (!key) return;

  const score = row?.new_score !== undefined ? row.new_score : row?.score;
  const grade = row?.new_grade !== undefined ? row.new_grade : row?.grade;
  const rating = getChartRatingPoints(score, grade, row?.level);
  if (rating > 0) {
    ratingMap.set(key, rating);
  } else {
    ratingMap.delete(key);
  }
}

function computePumbilityFromRatingMap(ratingMap) {
  if (!ratingMap || !(ratingMap instanceof Map) || ratingMap.size === 0) return 0;
  const ratings = Array.from(ratingMap.values())
    .map((value) => parseInt(value, 10) || 0)
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
  return ratings.slice(0, 50).reduce((sum, value) => sum + value, 0);
}

function computePostPumbilityGains(baseBestScores = [], upscores = [], clears = []) {
  const overallMap = buildPumbilityRatingMap(baseBestScores, '');
  const singlesMap = buildPumbilityRatingMap(baseBestScores, 'Single');

  const overallBefore = computePumbilityFromRatingMap(overallMap);
  const singlesBefore = computePumbilityFromRatingMap(singlesMap);
  let overallCursor = overallBefore;
  let singlesCursor = singlesBefore;

  const annotate = (entry) => {
    applyChartScoreToPumbilityMap(overallMap, entry, '');
    const overallAfter = computePumbilityFromRatingMap(overallMap);
    const overallGain = Math.max(0, overallAfter - overallCursor);
    overallCursor = overallAfter;

    applyChartScoreToPumbilityMap(singlesMap, entry, 'Single');
    const singlesAfter = computePumbilityFromRatingMap(singlesMap);
    const singlesGain = Math.max(0, singlesAfter - singlesCursor);
    singlesCursor = singlesAfter;

    return {
      ...entry,
      pumbility_gain: overallGain,
      singles_pumbility_gain: singlesGain,
    };
  };

  const upscoreEntries = (Array.isArray(upscores) ? upscores : []).map(annotate);
  const overallAfterUpscores = overallCursor;
  const singlesAfterUpscores = singlesCursor;

  const clearEntries = (Array.isArray(clears) ? clears : []).map(annotate);
  const overallAfterClears = overallCursor;
  const singlesAfterClears = singlesCursor;

  return {
    upscores: upscoreEntries,
    clears: clearEntries,
    before: overallBefore,
    after_upscores: overallAfterUpscores,
    after_clears: overallAfterClears,
    upscore_gain: Math.max(0, overallAfterUpscores - overallBefore),
    clear_gain: Math.max(0, overallAfterClears - overallAfterUpscores),
    total_gain: Math.max(0, overallAfterClears - overallBefore),
    singles_before: singlesBefore,
    singles_after_upscores: singlesAfterUpscores,
    singles_after_clears: singlesAfterClears,
    singles_upscore_gain: Math.max(0, singlesAfterUpscores - singlesBefore),
    singles_clear_gain: Math.max(0, singlesAfterClears - singlesAfterUpscores),
    singles_total_gain: Math.max(0, singlesAfterClears - singlesBefore),
  };
}

function buildPumbilityRecommendations(bestScores, options = {}) {
  const modeFilter = String(options.modeFilter || '');
  const metric = String(options.metric || '').trim() || (modeFilter ? modeFilter.toLowerCase() : 'overall');

  const sourceScores = modeFilter
    ? bestScores.filter((row) => String(row.mode || '') === modeFilter)
    : bestScores;

  if (!sourceScores.length) {
    return {
      recommendations: [],
      min_pumbility_rating: 0,
      pumbility_scores_count: 0,
      metric,
      mode_filter: modeFilter || null,
    };
  }

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
  if (!ratedEntries.length) {
    return {
      recommendations: [],
      min_pumbility_rating: 0,
      pumbility_scores_count: 0,
      metric,
      mode_filter: modeFilter || null,
    };
  }

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

  if (!candidates.length) {
    return {
      recommendations: [],
      min_pumbility_rating: minPumbilityRating,
      pumbility_scores_count: pumbilityTopCount,
      metric,
      mode_filter: modeFilter || null,
    };
  }

  const easiest = [...candidates].sort((a, b) => {
    if (a.score_needed !== b.score_needed) return a.score_needed - b.score_needed;
    if (b.pumbility_gain !== a.pumbility_gain) return b.pumbility_gain - a.pumbility_gain;
    return b.impact_per_point - a.impact_per_point;
  })[0];

  const bestEfficiency = [...candidates].sort((a, b) => {
    if (b.impact_per_point !== a.impact_per_point) return b.impact_per_point - a.impact_per_point;
    if (b.pumbility_gain !== a.pumbility_gain) return b.pumbility_gain - a.pumbility_gain;
    return a.score_needed - b.score_needed;
  })[0];

  const byImpact = [...candidates].sort((a, b) => {
    if (b.impact_per_point !== a.impact_per_point) return b.impact_per_point - a.impact_per_point;
    if (b.pumbility_gain !== a.pumbility_gain) return b.pumbility_gain - a.pumbility_gain;
    return a.score_needed - b.score_needed;
  });

  const ordered = [];
  const used = new Set();
  const pushCandidate = (row, label) => {
    if (!row || used.has(row._key)) return;
    used.add(row._key);
    ordered.push({ ...row, recommendation_type: label });
  };

  pushCandidate(easiest, 'easiest');
  if (bestEfficiency?._key === easiest?._key) {
    if (ordered.length > 0) ordered[0].recommendation_type = 'easiest_and_best_impact';
  } else {
    pushCandidate(bestEfficiency, 'best_impact_per_point');
  }
  for (const row of byImpact) pushCandidate(row, 'impact_ranked');

  const recommendations = ordered.slice(0, 10).map(({ _key, ...row }) => row);

  return {
    recommendations,
    min_pumbility_rating: minPumbilityRating,
    pumbility_scores_count: pumbilityTopCount,
    metric,
    mode_filter: modeFilter || null,
  };
}

function buildShoeCatalogKey(make, model, colorway) {
  return [
    normalizeShoeText(make, 80).toLowerCase(),
    normalizeShoeText(model, 80).toLowerCase(),
    normalizeShoeColorway(colorway, 120).toLowerCase(),
  ].join('|');
}

async function encodeShoeImage(file) {
  if (!file) return '';
  try {
    let buffer = await sharp(file.buffer)
      .rotate()
      .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer();

    if (buffer.length > 220 * 1024) {
      buffer = await sharp(file.buffer)
        .rotate()
        .resize(760, 760, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 62 })
        .toBuffer();
    }

    return `data:image/webp;base64,${buffer.toString('base64')}`;
  } catch {
    const mime = file.mimetype || 'image/png';
    return `data:${mime};base64,${file.buffer.toString('base64')}`;
  }
}

function getShoeCabinet(db, userId) {
  const shoes = db.prepare(`
    SELECT id, user_id, make, model, colorway, image_data, is_current, retired_at, created_at, updated_at
    FROM user_shoes
    WHERE user_id = ?
    ORDER BY
      CASE
        WHEN retired_at IS NULL AND is_current = 1 THEN 0
        WHEN retired_at IS NULL THEN 1
        ELSE 2
      END,
      created_at DESC,
      id DESC
  `).all(userId);

  const playTotals = db.prepare(`
    SELECT
      shoe_id,
      COUNT(*) AS songs_logged,
      COALESCE(SUM(
        COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
      ), 0) AS steps_logged
    FROM user_recently_played
    WHERE user_id = ? AND shoe_id IS NOT NULL
    GROUP BY shoe_id
  `).all(userId);

  const totalsByShoe = new Map(
    playTotals.map((row) => [
      parseInt(row.shoe_id, 10),
      {
        songs_logged: parseInt(row.songs_logged, 10) || 0,
        steps_logged: parseInt(row.steps_logged, 10) || 0,
      },
    ])
  );

  const lifetime = db.prepare(`
    SELECT
      COUNT(*) AS songs_logged,
      COALESCE(SUM(
        COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
      ), 0) AS steps_logged
    FROM user_recently_played
    WHERE user_id = ?
  `).get(userId) || { songs_logged: 0, steps_logged: 0 };

  const cabinetShoes = shoes.map((shoe) => {
    const totals = totalsByShoe.get(parseInt(shoe.id, 10)) || { songs_logged: 0, steps_logged: 0 };
    return {
      ...shoe,
      is_current: !!shoe.is_current && !shoe.retired_at,
      songs_logged: totals.songs_logged,
      steps_logged: totals.steps_logged,
      status: shoe.retired_at ? 'retired' : (shoe.is_current ? 'current' : 'available'),
    };
  });

  const activeShoe = cabinetShoes.find((shoe) => shoe.is_current) || null;

  return {
    active_shoe_id: activeShoe ? activeShoe.id : null,
    lifetime_songs: parseInt(lifetime.songs_logged, 10) || 0,
    lifetime_steps: parseInt(lifetime.steps_logged, 10) || 0,
    shoes: cabinetShoes,
  };
}

function syncShoeCatalogFromUserShoes(db) {
  const candidates = db.prepare(`
    SELECT
      LOWER(TRIM(COALESCE(us.make, ''))) AS make_key,
      LOWER(TRIM(COALESCE(us.model, ''))) AS model_key,
      LOWER(TRIM(COALESCE(us.colorway, ''))) AS colorway_key,
      TRIM(COALESCE(us.make, '')) AS make,
      TRIM(COALESCE(us.model, '')) AS model,
      TRIM(COALESCE(us.colorway, '')) AS colorway,
      COALESCE((
        SELECT us2.image_data
        FROM user_shoes us2
        WHERE LOWER(TRIM(COALESCE(us2.make, ''))) = LOWER(TRIM(COALESCE(us.make, '')))
          AND LOWER(TRIM(COALESCE(us2.model, ''))) = LOWER(TRIM(COALESCE(us.model, '')))
          AND LOWER(TRIM(COALESCE(us2.colorway, ''))) = LOWER(TRIM(COALESCE(us.colorway, '')))
          AND TRIM(COALESCE(us2.image_data, '')) != ''
        ORDER BY COALESCE(us2.updated_at, us2.created_at, datetime('now')) DESC, us2.id DESC
        LIMIT 1
      ), '') AS image_data
    FROM user_shoes us
    WHERE TRIM(COALESCE(us.make, '')) != ''
      AND TRIM(COALESCE(us.model, '')) != ''
    GROUP BY make_key, model_key, colorway_key
  `).all();
  if (candidates.length === 0) return 0;

  const findExisting = db.prepare(`
    SELECT id, image_data
    FROM shoe_catalog
    WHERE LOWER(TRIM(COALESCE(make, ''))) = ?
      AND LOWER(TRIM(COALESCE(model, ''))) = ?
      AND LOWER(TRIM(COALESCE(colorway, ''))) = ?
    LIMIT 1
  `);
  const insertCatalog = db.prepare(`
    INSERT INTO shoe_catalog (make, model, colorway, image_data, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
  `);
  const fillMissingImage = db.prepare(`
    UPDATE shoe_catalog
    SET image_data = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const sync = db.transaction((rows) => {
    let insertedCount = 0;
    for (const row of rows) {
      const make = normalizeShoeText(row.make, 80);
      const model = normalizeShoeText(row.model, 80);
      const colorway = normalizeShoeColorway(row.colorway, 120);
      if (!make || !model) continue;
      const imageData = String(row.image_data || '').trim();
      const existing = findExisting.get(make.toLowerCase(), model.toLowerCase(), colorway.toLowerCase());
      if (!existing) {
        insertCatalog.run(make, model, colorway, imageData);
        insertedCount++;
        continue;
      }
      const existingImage = String(existing.image_data || '').trim();
      if (!existingImage && imageData) {
        fillMissingImage.run(imageData, existing.id);
      }
    }
    return insertedCount;
  });

  return sync(candidates);
}

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function isAdminUser(user) {
  if (!user) return false;
  if (user.is_admin === true || parseInt(user.is_admin, 10) === 1) return true;
  if (user.id && ADMIN_USER_IDS.has(String(user.id).trim())) return true;
  const username = String(user.username || '').trim().toLowerCase();
  if (username && ADMIN_USERNAMES.has(username)) return true;
  if (user.id) {
    const db = getDb();
    const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
    if (parseInt(row?.is_admin, 10) === 1) return true;
  }
  return false;
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Encrypt/decrypt helpers using AES-256-GCM
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(encrypted, ivHex, authTagHex) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── Credentials ────────────────────────────────────────

// GET /api/piugame/credentials/status — check if linked
router.get('/credentials/status', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT updated_at FROM user_piugame_credentials WHERE user_id = ?').get(req.user.id);
  res.json({ linked: !!row, updated_at: row?.updated_at || null });
});

// POST /api/piugame/credentials — save/update credentials
router.post('/credentials', requireAuth, (req, res) => {
  const db = getDb();
  const { piugame_username, piugame_password } = req.body;
  if (!piugame_username || !piugame_password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const encUser = encrypt(piugame_username);
  const encPass = encrypt(piugame_password);

  // Store both encrypted values sharing the same IV/tag for simplicity
  // Actually use separate encryption for each, but share IV row for storage
  const iv = encUser.iv;
  const combinedTag = encUser.authTag + ':' + encPass.authTag;

  db.prepare(`
    INSERT INTO user_piugame_credentials (user_id, encrypted_username, encrypted_password, iv, auth_tag, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_username = excluded.encrypted_username,
      encrypted_password = excluded.encrypted_password,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      updated_at = datetime('now')
  `).run(req.user.id, encUser.encrypted, encPass.encrypted, encUser.iv + ':' + encPass.iv, combinedTag);

  // Ensure sync row exists
  db.prepare(`
    INSERT OR IGNORE INTO user_piugame_sync (user_id) VALUES (?)
  `).run(req.user.id);

  res.json({ success: true });
});

// DELETE /api/piugame/credentials — unlink account
router.delete('/credentials', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM user_piugame_credentials WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM user_pumbility_scores WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM user_best_scores WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM user_recently_played WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM user_piugame_sync WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// Helper: get decrypted credentials for a user
function getCredentials(userId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_piugame_credentials WHERE user_id = ?').get(userId);
  if (!row) return null;

  const [userIv, passIv] = row.iv.split(':');
  const [userTag, passTag] = row.auth_tag.split(':');

  const username = decrypt(row.encrypted_username, userIv, userTag);
  const password = decrypt(row.encrypted_password, passIv, passTag);
  return { username, password };
}

// Helper: login with stored credentials
async function loginWithStoredCredentials(userId) {
  const creds = getCredentials(userId);
  if (!creds) throw new Error('No PIUGame credentials linked');
  return login(creds.username, creds.password);
}

function getLinkedPiugameUsername(userId) {
  const creds = getCredentials(userId);
  if (!creds?.username) return '';
  return String(creds.username).replace(/\s+/g, ' ').trim();
}

function isLeaderboardRefreshNeeded(lastSync, maxAgeMinutes = 60) {
  if (!lastSync) return true;
  const lastDate = new Date(`${lastSync}Z`);
  if (Number.isNaN(lastDate.getTime())) return true;
  const minutesSince = (Date.now() - lastDate.getTime()) / (1000 * 60);
  return minutesSince >= maxAgeMinutes;
}

function parseIntInRange(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function getOverRankingScrapeConfig() {
  const lang = String(process.env.OVER_RANKING_SCRAPE_LANG || 'en').trim().toLowerCase() === 'kr' ? 'kr' : 'en';
  return {
    lang,
    listDelayMs: parseIntInRange(process.env.OVER_RANKING_SCRAPE_LIST_DELAY_MS, 0, 5000, 120),
    chartDelayMs: parseIntInRange(process.env.OVER_RANKING_SCRAPE_CHART_DELAY_MS, 0, 5000, 80),
    chartConcurrency: parseIntInRange(process.env.OVER_RANKING_SCRAPE_CONCURRENCY, 1, 8, 2),
    maxPages: parseIntInRange(process.env.OVER_RANKING_SCRAPE_MAX_PAGES, 1, 2000, 250),
    maxCharts: parseIntInRange(process.env.OVER_RANKING_SCRAPE_MAX_CHARTS, 1, 10000, 4000),
  };
}

function normalizeOverRunType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'backfill') return 'backfill';
  if (normalized === 'pumbility') return 'pumbility';
  return 'sync';
}

function normalizeOverRunStatus(value) {
  return String(value || '').trim().toLowerCase() === 'failed' ? 'failed' : 'success';
}

function logOverRankingSyncRun(db, payload = {}) {
  if (!db) return null;
  const backfill = payload?.backfill || {};
  const insert = db.prepare(`
    INSERT INTO over_level_sync_runs (
      run_type, status, trigger_reason, force_flag, started_at, completed_at, duration_ms,
      charts, entries, source_pages,
      backfill_total_checked, backfill_total_updated,
      backfill_best_scores_updated, backfill_pumbility_scores_updated, backfill_recent_scores_updated,
      error_message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = insert.run(
    normalizeOverRunType(payload?.run_type),
    normalizeOverRunStatus(payload?.status),
    String(payload?.trigger_reason || '').slice(0, 120),
    parseBoolean(payload?.force_flag) === true ? 1 : 0,
    String(payload?.started_at || ''),
    String(payload?.completed_at || ''),
    Math.max(0, parseInt(payload?.duration_ms, 10) || 0),
    Math.max(0, parseInt(payload?.charts, 10) || 0),
    Math.max(0, parseInt(payload?.entries, 10) || 0),
    Math.max(0, parseInt(payload?.source_pages, 10) || 0),
    Math.max(0, parseInt(backfill?.total_checked, 10) || 0),
    Math.max(0, parseInt(backfill?.total_updated, 10) || 0),
    Math.max(0, parseInt(backfill?.best_scores_updated, 10) || 0),
    Math.max(0, parseInt(backfill?.pumbility_scores_updated, 10) || 0),
    Math.max(0, parseInt(backfill?.recent_scores_updated, 10) || 0),
    String(payload?.error_message || '').slice(0, 600)
  );
  return parseInt(info?.lastInsertRowid, 10) || null;
}

function getOverRankingNightlyStatus() {
  const config = getOverRankingNightlyConfig();
  return {
    enabled: !!config.enabled,
    hour: config.hour,
    minute: config.minute,
    next_run_at: overRankingNightlyNextRunAt || null,
    running: overRankingNightlyRunning,
  };
}

function getPumbilityRankingNightlyStatus() {
  const config = getPumbilityRankingNightlyConfig();
  return {
    enabled: !!config.enabled,
    hour: config.hour,
    minute: config.minute,
    next_run_at: pumbilityRankingNightlyNextRunAt || null,
    running: pumbilityRankingNightlyRunning,
  };
}

function computeLeaderboardMetricSummary(entries = []) {
  const ranked = [...(Array.isArray(entries) ? entries : [])]
    .sort((a, b) => {
      const ratingDiff = (parseInt(b?.rating, 10) || 0) - (parseInt(a?.rating, 10) || 0);
      if (ratingDiff !== 0) return ratingDiff;
      const scoreDiff = (parseInt(b?.score, 10) || 0) - (parseInt(a?.score, 10) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (parseInt(b?.level, 10) || 0) - (parseInt(a?.level, 10) || 0);
    })
    .slice(0, 50);

  if (!ranked.length) {
    return {
      pumbility: 0,
      average_level: 0,
      average_score: 0,
      average_grade: '--',
      breakdown_count: 0,
    };
  }

  const pumbility = ranked.reduce((sum, row) => sum + (parseInt(row?.rating, 10) || 0), 0);
  const averageScore = Math.round(
    ranked.reduce((sum, row) => sum + (parseInt(row?.score, 10) || 0), 0) / ranked.length
  );
  const averageLevel = Number((
    ranked.reduce((sum, row) => sum + (parseInt(row?.level, 10) || 0), 0) / ranked.length
  ).toFixed(1));

  return {
    pumbility,
    average_level: averageLevel,
    average_score: averageScore,
    average_grade: averageScore > 0 ? normalizeGrade(gradeFromScore(averageScore)) : '--',
    breakdown_count: ranked.length,
  };
}

function getModeCompetitiveLevel(mode, levelStatsByMode = new Map(), chartTotalsByModeLevel = new Map()) {
  let bestLevel = 0;
  for (const [levelRaw, stats] of levelStatsByMode.entries()) {
    const level = parseInt(levelRaw, 10) || 0;
    if (level <= 0) continue;
    const chartTotal = parseInt(chartTotalsByModeLevel.get(`${mode}|${level}`), 10) || 0;
    const clearedCharts = parseInt(stats?.cleared_charts, 10) || 0;
    if (chartTotal <= 0 || clearedCharts <= 0) continue;
    const clearCoverage = clearedCharts / chartTotal;
    if (clearCoverage < 0.5) continue;

    const averageScore = Math.round((parseInt(stats?.score_sum, 10) || 0) / clearedCharts);
    const averageGrade = averageScore > 0 ? normalizeGrade(gradeFromScore(averageScore)) : '';
    if (getLeaderboardGradeSortValue(averageGrade) < getLeaderboardGradeSortValue('S')) continue;

    if (level > bestLevel) bestLevel = level;
  }
  return bestLevel || null;
}

function normalizeLeaderboardNameKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractPiugameAvatarFilename(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const match = text.match(/\/(?:data\/avatar_img|avatars)\/([^/?#]+)/i);
  if (!match) return '';

  const filename = decodeURIComponent(String(match[1] || '').trim());
  if (!filename || filename.includes('..')) return '';
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return '';
  return filename;
}

function mapPiugameAvatarToLocal(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  if (text.startsWith('/avatars/')) return text;

  const filename = extractPiugameAvatarFilename(text);
  if (filename) return `/avatars/${filename}`;

  if (text.startsWith('http://') || text.startsWith('https://')) return text;
  return '';
}

function buildLocalUsersByNormalizedName(db, names = []) {
  const normalizedNames = Array.from(
    new Set(
      (Array.isArray(names) ? names : [])
        .map((name) => normalizeLeaderboardNameKey(name))
        .filter(Boolean)
    )
  );
  if (!normalizedNames.length) return new Map();

  const placeholders = normalizedNames.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT id, username, avatar
    FROM users
    WHERE LOWER(TRIM(username)) IN (${placeholders})
  `).all(...normalizedNames);

  const map = new Map();
  for (const row of rows) {
    const key = normalizeLeaderboardNameKey(row?.username);
    if (!key || map.has(key)) continue;
    map.set(key, {
      user_id: String(row.id || ''),
      username: String(row.username || '').trim(),
      avatar: String(row.avatar || '').trim(),
    });
  }
  return map;
}

function buildGlobalPumbilityLeaderboardRows(db) {
  const users = db.prepare(`
    SELECT id, username, avatar, nationality, pumbility
    FROM users
    WHERE pumbility > 0
       OR id IN (SELECT DISTINCT user_id FROM user_best_scores WHERE score > 0)
    ORDER BY username COLLATE NOCASE ASC
  `).all();
  if (!users.length) return [];

  const rowsByUserId = new Map();
  for (const user of users) {
    rowsByUserId.set(String(user.id), {
      user_id: String(user.id),
      username: String(user.username || '').trim() || 'Unknown',
      avatar: user.avatar || '',
      nationality: user.nationality || '',
      profile_pumbility: parseInt(user.pumbility, 10) || 0,
      overall_entries: [],
      singles_entries: [],
      mode_level_stats: {
        Single: new Map(),
        Double: new Map(),
      },
    });
  }

  const scoreRows = db.prepare(`
    SELECT user_id, mode, level, score, grade
    FROM user_best_scores
    WHERE score > 0 AND mode IN ('Single', 'Double')
  `).all();

  for (const row of scoreRows) {
    const userKey = String(row.user_id || '');
    const entry = rowsByUserId.get(userKey);
    if (!entry) continue;
    const level = parseInt(row.level, 10) || 0;
    const score = parseInt(row.score, 10) || 0;
    if (level <= 0 || score <= 0) continue;
    if (!isPassingScore(score, row.grade)) continue;

    const mode = String(row.mode || '').trim();
    if (mode !== 'Single' && mode !== 'Double') continue;

    const grade = normalizeGrade(row.grade || gradeFromScore(score));
    const rating = getChartRatingPoints(score, grade, level);
    if (rating <= 0) continue;

    const ratedEntry = { level, score, grade, rating };
    entry.overall_entries.push(ratedEntry);
    if (mode === 'Single') entry.singles_entries.push(ratedEntry);

    const modeMap = entry.mode_level_stats[mode];
    const stats = modeMap.get(level) || { cleared_charts: 0, score_sum: 0 };
    stats.cleared_charts += 1;
    stats.score_sum += score;
    modeMap.set(level, stats);
  }

  const chartTotalsByModeLevel = new Map();
  const chartTotals = db.prepare(`
    SELECT mode, level, COUNT(*) AS total_charts
    FROM songs
    WHERE mode IN ('Single', 'Double')
    GROUP BY mode, level
  `).all();
  for (const row of chartTotals) {
    const mode = String(row.mode || '').trim();
    const level = parseInt(row.level, 10) || 0;
    const totalCharts = parseInt(row.total_charts, 10) || 0;
    if ((mode !== 'Single' && mode !== 'Double') || level <= 0 || totalCharts <= 0) continue;
    chartTotalsByModeLevel.set(`${mode}|${level}`, totalCharts);
  }

  const leaderboardRows = [];
  for (const row of rowsByUserId.values()) {
    const overall = computeLeaderboardMetricSummary(row.overall_entries);
    const singles = computeLeaderboardMetricSummary(row.singles_entries);

    const singlesCompetitiveLevel = getModeCompetitiveLevel('Single', row.mode_level_stats.Single, chartTotalsByModeLevel);
    const doublesCompetitiveLevel = getModeCompetitiveLevel('Double', row.mode_level_stats.Double, chartTotalsByModeLevel);

    let competitiveLevel = 0;
    let competitiveMode = '';
    if (doublesCompetitiveLevel && (!singlesCompetitiveLevel || doublesCompetitiveLevel > singlesCompetitiveLevel)) {
      competitiveLevel = doublesCompetitiveLevel;
      competitiveMode = 'Double';
    } else if (singlesCompetitiveLevel) {
      competitiveLevel = singlesCompetitiveLevel;
      competitiveMode = 'Single';
    }

    const overallPumbility = row.profile_pumbility > 0 ? row.profile_pumbility : overall.pumbility;
    if (overallPumbility <= 0 && singles.pumbility <= 0 && competitiveLevel <= 0) continue;

    leaderboardRows.push({
      user_id: row.user_id,
      username: row.username,
      avatar: row.avatar,
      nationality: row.nationality,
      overall_pumbility: overallPumbility,
      singles_pumbility: singles.pumbility,
      overall_average_grade: overall.average_grade,
      overall_average_level: overall.average_level,
      singles_average_grade: singles.average_grade,
      singles_average_level: singles.average_level,
      singles_competitive_level: singlesCompetitiveLevel || 0,
      doubles_competitive_level: doublesCompetitiveLevel || 0,
      competitive_level: competitiveLevel || 0,
      competitive_mode: competitiveMode,
      overall_breakdown_count: overall.breakdown_count,
      singles_breakdown_count: singles.breakdown_count,
    });
  }

  return leaderboardRows;
}

async function refreshPumbilityLeaderboardCache(db, options = {}) {
  const force = !!options.force;
  const maxAgeMinutes = Number.isFinite(parseInt(options.maxAgeMinutes, 10))
    ? Math.max(0, parseInt(options.maxAgeMinutes, 10))
    : 60;

  const currentMeta = db.prepare('SELECT threshold, total_entries, last_sync FROM pumbility_leaderboard_meta WHERE id = 1').get();
  const hasUsableCache = !!(currentMeta && parseInt(currentMeta.total_entries, 10) > 0 && parseInt(currentMeta.threshold, 10) > 0);
  if (!force && hasUsableCache && !isLeaderboardRefreshNeeded(currentMeta.last_sync, maxAgeMinutes)) {
    return {
      threshold: parseInt(currentMeta.threshold, 10) || 0,
      total_entries: parseInt(currentMeta.total_entries, 10) || 0,
      last_sync: currentMeta.last_sync || null,
      cached: true,
    };
  }

  const { rankings, threshold } = await scrapePumbilityRanking();
  const normalizedThreshold = parseInt(threshold, 10) || 0;
  const normalizedRows = [];
  const seenRanks = new Set();
  for (const row of (Array.isArray(rankings) ? rankings : [])) {
    const rank = parseInt(row?.rank, 10);
    if (!Number.isInteger(rank) || rank <= 0) continue;
    if (seenRanks.has(rank)) continue;
    seenRanks.add(rank);
    normalizedRows.push({
      rank,
      player_name: String(row?.player_name || '').trim(),
      pumbility: parseInt(row?.pumbility, 10) || 0,
      avatar_url: String(row?.avatar_url || '').trim(),
    });
  }

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM pumbility_leaderboard').run();
    const insert = db.prepare('INSERT INTO pumbility_leaderboard (rank, player_name, pumbility, avatar_url) VALUES (?, ?, ?, ?)');
    for (const row of normalizedRows) {
      insert.run(
        row.rank,
        row.player_name,
        row.pumbility,
        row.avatar_url
      );
    }
    db.prepare(`
      INSERT INTO pumbility_leaderboard_meta (id, threshold, total_entries, last_sync)
      VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        threshold = excluded.threshold,
        total_entries = excluded.total_entries,
        last_sync = datetime('now')
    `).run(normalizedThreshold, normalizedRows.length);
  });
  txn();

  const refreshedMeta = db.prepare('SELECT threshold, total_entries, last_sync FROM pumbility_leaderboard_meta WHERE id = 1').get();
  return {
    threshold: parseInt(refreshedMeta?.threshold, 10) || normalizedThreshold,
    total_entries: parseInt(refreshedMeta?.total_entries, 10) || normalizedRows.length,
    last_sync: refreshedMeta?.last_sync || null,
    cached: false,
  };
}

async function refreshOverRankingCache(db, options = {}) {
  const force = !!options.force;
  const backfillOnly = parseBoolean(options.backfillOnly) === true;
  const maxAgeMinutes = Number.isFinite(parseInt(options.maxAgeMinutes, 10))
    ? Math.max(0, parseInt(options.maxAgeMinutes, 10))
    : 1440;

  const currentMeta = db.prepare(`
    SELECT total_charts, total_entries, source_pages, last_sync
    FROM over_level_ranking_meta
    WHERE id = 1
  `).get();
  const hasUsableCache = !!(currentMeta && parseInt(currentMeta.total_charts, 10) > 0);
  if (backfillOnly) {
    if (!hasUsableCache) {
      return {
        total_charts: 0,
        total_entries: 0,
        source_pages: 0,
        last_sync: null,
        backfill: {
          best_scores_checked: 0,
          best_scores_updated: 0,
          pumbility_scores_checked: 0,
          pumbility_scores_updated: 0,
          recent_scores_checked: 0,
          recent_scores_updated: 0,
          total_checked: 0,
          total_updated: 0,
        },
        cached: true,
        backfill_only: true,
        backfill_duration_ms: 0,
      };
    }

    const overLookup = buildOverRankingLookup(db);
    const backfillStartedAt = Date.now();
    const backfill = backfillStoredOverTop100Ranks(db, overLookup);
    const backfillDurationMs = Date.now() - backfillStartedAt;
    return {
      total_charts: parseInt(currentMeta.total_charts, 10) || 0,
      total_entries: parseInt(currentMeta.total_entries, 10) || 0,
      source_pages: parseInt(currentMeta.source_pages, 10) || 0,
      last_sync: currentMeta.last_sync || null,
      backfill,
      cached: true,
      backfill_only: true,
      backfill_duration_ms: backfillDurationMs,
    };
  }

  if (!force && hasUsableCache && !isLeaderboardRefreshNeeded(currentMeta.last_sync, maxAgeMinutes)) {
    return {
      total_charts: parseInt(currentMeta.total_charts, 10) || 0,
      total_entries: parseInt(currentMeta.total_entries, 10) || 0,
      source_pages: parseInt(currentMeta.source_pages, 10) || 0,
      last_sync: currentMeta.last_sync || null,
      cached: true,
      backfill_duration_ms: 0,
    };
  }

  const scraped = await scrapeOverRankingTop100(getOverRankingScrapeConfig());

  const normalizedChartMap = new Map();
  for (const chart of (Array.isArray(scraped?.charts) ? scraped.charts : [])) {
    const key = overRankingChartKey(chart.song_title, chart.mode, chart.level);
    if (!key) continue;
    const candidate = {
      chart_key: key,
      source_no: String(chart.source_no || '').trim(),
      song_title: normalizeOverRankingSongTitle(chart.song_title),
      mode: String(chart.mode || '').trim(),
      level: parseInt(chart.level, 10) || 0,
      jacket_url: String(chart.jacket_url || '').trim(),
      top100_count: Math.min(100, Math.max(0, parseInt(chart.top100_count, 10) || 0)),
      min_score: Math.max(0, parseInt(chart.min_score, 10) || 0),
      top_scores: (Array.isArray(chart.top_scores) ? chart.top_scores : [])
        .map((row) => ({
          rank: parseInt(row.rank, 10) || 0,
          score: parseInt(row.score, 10) || 0,
          grade: String(row.grade || '').trim(),
          player_name: String(row.player_name || '').trim(),
          player_avatar_url: String(row.player_avatar_url || '').trim(),
          played_at: String(row.played_at || '').trim(),
        }))
        .filter((row) => row.score > 0)
        .sort(compareOverRankingRows)
        .slice(0, 100)
        .map((row) => ({ ...row })),
    };
    candidate.top_scores = assignSharedScoreRanks(candidate.top_scores);
    if (candidate.top100_count <= 0) candidate.top100_count = candidate.top_scores.length;
    if (candidate.min_score <= 0 && candidate.top_scores.length > 0) {
      candidate.min_score = parseInt(candidate.top_scores[candidate.top_scores.length - 1].score, 10) || 0;
    }

    const existing = normalizedChartMap.get(key);
    if (!existing) {
      normalizedChartMap.set(key, candidate);
      continue;
    }
    // Keep the fuller entry when duplicates appear.
    const existingCount = parseInt(existing.top100_count, 10) || 0;
    const candidateCount = parseInt(candidate.top100_count, 10) || 0;
    if (candidateCount > existingCount) {
      normalizedChartMap.set(key, candidate);
    }
  }

  const normalizedCharts = Array.from(normalizedChartMap.values());
  const txn = db.transaction((charts) => {
    db.prepare('DELETE FROM over_level_ranking_scores').run();
    db.prepare('DELETE FROM over_level_rankings').run();

    const insertChart = db.prepare(`
      INSERT INTO over_level_rankings (
        chart_key, song_title, mode, level, jacket_url, source_no, top100_count, min_score, last_sync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const insertScore = db.prepare(`
      INSERT INTO over_level_ranking_scores (
        chart_key, rank, score, grade, player_name, player_avatar_url, played_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let totalEntries = 0;
    for (const chart of charts) {
      insertChart.run(
        chart.chart_key,
        chart.song_title,
        chart.mode,
        chart.level,
        chart.jacket_url,
        chart.source_no,
        chart.top100_count,
        chart.min_score
      );
      for (const row of chart.top_scores) {
        insertScore.run(
          chart.chart_key,
          row.rank,
          row.score,
          row.grade,
          row.player_name,
          row.player_avatar_url,
          row.played_at
        );
        totalEntries += 1;
      }
    }

    db.prepare(`
      INSERT INTO over_level_ranking_meta (id, total_charts, total_entries, source_pages, last_sync)
      VALUES (1, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        total_charts = excluded.total_charts,
        total_entries = excluded.total_entries,
        source_pages = excluded.source_pages,
        last_sync = datetime('now')
    `).run(charts.length, totalEntries, parseInt(scraped?.total_pages, 10) || 0);
  });
  txn(normalizedCharts);

  const refreshedMeta = db.prepare(`
    SELECT total_charts, total_entries, source_pages, last_sync
    FROM over_level_ranking_meta
    WHERE id = 1
  `).get();
  const overLookup = buildOverRankingLookup(db);
  const backfillStartedAt = Date.now();
  const backfill = backfillStoredOverTop100Ranks(db, overLookup);
  const backfillDurationMs = Date.now() - backfillStartedAt;

  return {
    total_charts: parseInt(refreshedMeta?.total_charts, 10) || normalizedCharts.length,
    total_entries: parseInt(refreshedMeta?.total_entries, 10) || 0,
    source_pages: parseInt(refreshedMeta?.source_pages, 10) || 0,
    last_sync: refreshedMeta?.last_sync || null,
    backfill,
    backfill_duration_ms: backfillDurationMs,
    cached: false,
  };
}

let overRankingNightlyTimer = null;
let overRankingNightlyStarted = false;
let overRankingNightlyRunning = false;
let overRankingNightlyNextRunAt = '';
let pumbilityRankingNightlyTimer = null;
let pumbilityRankingNightlyStarted = false;
let pumbilityRankingNightlyRunning = false;
let pumbilityRankingNightlyNextRunAt = '';

function getOverRankingNightlyConfig() {
  const enabledRaw = parseBoolean(process.env.OVER_RANKING_NIGHTLY_ENABLED);
  const enabled = enabledRaw === null ? true : enabledRaw === true;
  const hour = parseIntInRange(process.env.OVER_RANKING_NIGHTLY_HOUR, 0, 23, 3);
  const minute = parseIntInRange(process.env.OVER_RANKING_NIGHTLY_MINUTE, 0, 59, 0);
  return { enabled, hour, minute };
}

function getPumbilityRankingNightlyConfig() {
  const enabledRaw = parseBoolean(process.env.PUMBILITY_RANKING_NIGHTLY_ENABLED);
  const enabled = enabledRaw === null ? true : enabledRaw === true;
  const hour = parseIntInRange(process.env.PUMBILITY_RANKING_NIGHTLY_HOUR, 0, 23, 3);
  const minute = parseIntInRange(process.env.PUMBILITY_RANKING_NIGHTLY_MINUTE, 0, 59, 0);
  return { enabled, hour, minute };
}

function getNextOverRankingNightlyRun(now, hour, minute) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getNextPumbilityRankingNightlyRun(now, hour, minute) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

async function runOverRankingSyncNow(options = {}) {
  const db = getDb();
  const backfillOnly = parseBoolean(options.backfillOnly) === true;
  const force = backfillOnly ? false : parseBoolean(options.force) !== false;
  const reason = String(options.reason || 'manual').trim() || 'manual';
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();

  try {
    const refreshed = await refreshOverRankingCache(db, {
      force,
      backfillOnly,
      maxAgeMinutes: 1440,
    });
    const completedAtMs = Date.now();
    const completedAtIso = new Date(completedAtMs).toISOString();
    const durationMs = completedAtMs - startedAtMs;
    const runType = backfillOnly ? 'backfill' : 'sync';

    const payload = {
      ...refreshed,
      duration_ms: durationMs,
      reason,
      force,
      backfill_only: backfillOnly,
    };

    try {
      logOverRankingSyncRun(db, {
        run_type: runType,
        status: 'success',
        trigger_reason: reason,
        force_flag: force,
        started_at: startedAtIso,
        completed_at: completedAtIso,
        duration_ms: durationMs,
        charts: payload.total_charts || 0,
        entries: payload.total_entries || 0,
        source_pages: payload.source_pages || 0,
        backfill: payload.backfill || null,
      });

      if (!backfillOnly && payload.backfill) {
        const backfillDurationMs = Math.max(0, parseInt(payload.backfill_duration_ms, 10) || 0);
        const backfillStartedAtIso = new Date(Math.max(startedAtMs, completedAtMs - backfillDurationMs)).toISOString();
        logOverRankingSyncRun(db, {
          run_type: 'backfill',
          status: 'success',
          trigger_reason: `${reason}:within-sync`,
          force_flag: false,
          started_at: backfillStartedAtIso,
          completed_at: completedAtIso,
          duration_ms: backfillDurationMs,
          charts: payload.total_charts || 0,
          entries: payload.total_entries || 0,
          source_pages: payload.source_pages || 0,
          backfill: payload.backfill || null,
        });
      }
    } catch (logErr) {
      console.error('[OverRanking] Failed to persist sync run log:', logErr?.message || logErr);
    }

    return payload;
  } catch (err) {
    const completedAtMs = Date.now();
    const completedAtIso = new Date(completedAtMs).toISOString();
    const durationMs = completedAtMs - startedAtMs;
    try {
      logOverRankingSyncRun(db, {
        run_type: backfillOnly ? 'backfill' : 'sync',
        status: 'failed',
        trigger_reason: reason,
        force_flag: force,
        started_at: startedAtIso,
        completed_at: completedAtIso,
        duration_ms: durationMs,
        error_message: err?.message || String(err),
      });
    } catch (logErr) {
      console.error('[OverRanking] Failed to persist failed run log:', logErr?.message || logErr);
    }
    throw err;
  }
}

async function runPumbilityRankingSyncNow(options = {}) {
  const db = getDb();
  const force = parseBoolean(options.force) === true;
  const reason = String(options.reason || 'manual').trim() || 'manual';
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();

  try {
    const refreshed = await refreshPumbilityLeaderboardCache(db, {
      force,
      maxAgeMinutes: 1440,
    });
    const completedAtMs = Date.now();
    const completedAtIso = new Date(completedAtMs).toISOString();
    const durationMs = completedAtMs - startedAtMs;
    const payload = {
      ...refreshed,
      duration_ms: durationMs,
      reason,
      force,
    };

    try {
      logOverRankingSyncRun(db, {
        run_type: 'pumbility',
        status: 'success',
        trigger_reason: reason,
        force_flag: force,
        started_at: startedAtIso,
        completed_at: completedAtIso,
        duration_ms: durationMs,
        charts: 0,
        entries: payload.total_entries || 0,
        source_pages: 0,
      });
    } catch (logErr) {
      console.error('[PumbilityRanking] Failed to persist sync run log:', logErr?.message || logErr);
    }

    return payload;
  } catch (err) {
    const completedAtMs = Date.now();
    const completedAtIso = new Date(completedAtMs).toISOString();
    const durationMs = completedAtMs - startedAtMs;
    try {
      logOverRankingSyncRun(db, {
        run_type: 'pumbility',
        status: 'failed',
        trigger_reason: reason,
        force_flag: force,
        started_at: startedAtIso,
        completed_at: completedAtIso,
        duration_ms: durationMs,
        charts: 0,
        entries: 0,
        source_pages: 0,
        error_message: err?.message || String(err),
      });
    } catch (logErr) {
      console.error('[PumbilityRanking] Failed to persist failed run log:', logErr?.message || logErr);
    }
    throw err;
  }
}

function scheduleNextOverRankingNightlyRun() {
  const config = getOverRankingNightlyConfig();
  if (!config.enabled) {
    overRankingNightlyNextRunAt = '';
    return {
      enabled: false,
      next_run_at: null,
      running: overRankingNightlyRunning,
    };
  }

  const now = new Date();
  const nextRun = getNextOverRankingNightlyRun(now, config.hour, config.minute);
  overRankingNightlyNextRunAt = nextRun.toISOString();
  const delayMs = Math.max(1000, nextRun.getTime() - now.getTime());

  if (overRankingNightlyTimer) {
    clearTimeout(overRankingNightlyTimer);
  }

  overRankingNightlyTimer = setTimeout(async () => {
    if (overRankingNightlyRunning) {
      console.warn('[OverRanking] Nightly sync skipped because another sync is still running.');
      scheduleNextOverRankingNightlyRun();
      return;
    }

    overRankingNightlyRunning = true;
    const startedAt = Date.now();
    try {
      const result = await runOverRankingSyncNow({ force: true, reason: 'nightly' });
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `[OverRanking] Nightly sync finished in ${seconds}s (${result.total_charts} charts, ${result.total_entries} rows).`
      );
    } catch (err) {
      console.error('[OverRanking] Nightly sync failed:', err?.message || err);
    } finally {
      overRankingNightlyRunning = false;
      scheduleNextOverRankingNightlyRun();
    }
  }, delayMs);

  if (typeof overRankingNightlyTimer.unref === 'function') {
    overRankingNightlyTimer.unref();
  }

  return {
    enabled: true,
    hour: config.hour,
    minute: config.minute,
    next_run_at: overRankingNightlyNextRunAt,
    running: overRankingNightlyRunning,
  };
}

function startOverRankingNightlyScheduler() {
  if (overRankingNightlyStarted) {
    return {
      started: false,
      ...scheduleNextOverRankingNightlyRun(),
    };
  }
  overRankingNightlyStarted = true;
  return {
    started: true,
    ...scheduleNextOverRankingNightlyRun(),
  };
}

function scheduleNextPumbilityRankingNightlyRun() {
  const config = getPumbilityRankingNightlyConfig();
  if (!config.enabled) {
    pumbilityRankingNightlyNextRunAt = '';
    return {
      enabled: false,
      next_run_at: null,
      running: pumbilityRankingNightlyRunning,
    };
  }

  const now = new Date();
  const nextRun = getNextPumbilityRankingNightlyRun(now, config.hour, config.minute);
  pumbilityRankingNightlyNextRunAt = nextRun.toISOString();
  const delayMs = Math.max(1000, nextRun.getTime() - now.getTime());

  if (pumbilityRankingNightlyTimer) {
    clearTimeout(pumbilityRankingNightlyTimer);
  }

  pumbilityRankingNightlyTimer = setTimeout(async () => {
    if (pumbilityRankingNightlyRunning) {
      console.warn('[PumbilityRanking] Nightly sync skipped because another sync is still running.');
      scheduleNextPumbilityRankingNightlyRun();
      return;
    }

    pumbilityRankingNightlyRunning = true;
    const startedAt = Date.now();
    try {
      const result = await runPumbilityRankingSyncNow({ force: true, reason: 'nightly' });
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `[PumbilityRanking] Nightly sync finished in ${seconds}s (${result.total_entries} rows).`
      );
    } catch (err) {
      console.error('[PumbilityRanking] Nightly sync failed:', err?.message || err);
    } finally {
      pumbilityRankingNightlyRunning = false;
      scheduleNextPumbilityRankingNightlyRun();
    }
  }, delayMs);

  if (typeof pumbilityRankingNightlyTimer.unref === 'function') {
    pumbilityRankingNightlyTimer.unref();
  }

  return {
    enabled: true,
    hour: config.hour,
    minute: config.minute,
    next_run_at: pumbilityRankingNightlyNextRunAt,
    running: pumbilityRankingNightlyRunning,
  };
}

function startPumbilityRankingNightlyScheduler() {
  if (pumbilityRankingNightlyStarted) {
    return {
      started: false,
      ...scheduleNextPumbilityRankingNightlyRun(),
    };
  }
  pumbilityRankingNightlyStarted = true;
  return {
    started: true,
    ...scheduleNextPumbilityRankingNightlyRun(),
  };
}

async function ensureOverRankingLookupForScoring(db, options = {}) {
  const allowAutoRefresh = parseBoolean(options.autoRefresh) === true;
  const allowColdStartRefresh = parseBoolean(options.allowColdStartRefresh) === true;
  const maxAgeMinutes = Number.isFinite(parseInt(options.maxAgeMinutes, 10))
    ? Math.max(0, parseInt(options.maxAgeMinutes, 10))
    : 1440;

  const meta = db.prepare(`
    SELECT total_charts, last_sync
    FROM over_level_ranking_meta
    WHERE id = 1
  `).get();
  const hasCache = !!(meta && parseInt(meta.total_charts, 10) > 0);

  if (!hasCache && allowColdStartRefresh) {
    try {
      await refreshOverRankingCache(db, { force: true, maxAgeMinutes });
    } catch (err) {
      console.error('Initial over ranking cache sync error:', err.message);
    }
  }

  if (allowAutoRefresh && hasCache && isLeaderboardRefreshNeeded(meta.last_sync, maxAgeMinutes)) {
    (async () => {
      try {
        const refreshed = await refreshOverRankingCache(db, { maxAgeMinutes });
        if (!refreshed.cached) {
          console.log(`Over ranking cache synced: ${refreshed.total_charts} charts (${refreshed.total_entries} scores)`);
        }
      } catch (err) {
        console.error('Background over ranking cache sync error:', err.message);
      }
    })();
  }

  return buildOverRankingLookup(db);
}

function findLeaderboardRankByName(db, name) {
  const normalized = normalizeLeaderboardNameKey(name);
  if (!normalized) return null;
  const rows = db.prepare('SELECT rank, player_name FROM pumbility_leaderboard ORDER BY rank ASC').all();
  for (const row of rows) {
    if (normalizeLeaderboardNameKey(row?.player_name) !== normalized) continue;
    const rank = parseInt(row.rank, 10);
    if (!Number.isInteger(rank) || rank <= 0 || rank > 1000) return null;
    return { rank, player_name: String(row.player_name || '').trim() };
  }
  return null;
}

function insertGroupedNewClearPost(db, userId, clears, options = {}) {
  if (!Array.isArray(clears) || clears.length === 0) return null;

  const normalized = clears.map(c => ({
    entry_type: c.entry_type || 'song_clear',
    song_title: c.song_title,
    mode: c.mode,
    level: c.level,
    score: c.score || 0,
    grade: c.grade || '',
    plate: c.plate || '',
    background_url: c.background_url || '',
    perfect: c.perfect || 0, great: c.great || 0, good: c.good || 0,
    bad: c.bad || 0, miss: c.miss || 0,
    title_name: c.title_name || '',
    title_family: c.title_family || '',
    title_level: c.title_level || 0,
    title_plate: c.title_plate || '',
    title_tier: c.title_tier || '',
    pumbility_gain: Math.max(0, parseInt(c.pumbility_gain, 10) || 0),
    singles_pumbility_gain: Math.max(0, parseInt(c.singles_pumbility_gain, 10) || 0),
    over_top100_rank: Math.max(0, parseInt(c.over_top100_rank, 10) || 0),
  }));
  const first = normalized[0];
  const explicitGain = options?.pumbilityGain;
  const postPumbilityGain = Number.isFinite(Number(explicitGain))
    ? Math.max(0, parseInt(explicitGain, 10) || 0)
    : normalized.reduce((sum, row) => sum + (parseInt(row.pumbility_gain, 10) || 0), 0);
  const explicitSinglesGain = options?.singlesPumbilityGain;
  const postSinglesPumbilityGain = Number.isFinite(Number(explicitSinglesGain))
    ? Math.max(0, parseInt(explicitSinglesGain, 10) || 0)
    : normalized.reduce((sum, row) => sum + (parseInt(row.singles_pumbility_gain, 10) || 0), 0);

  const result = db.prepare(`
    INSERT INTO user_new_clears (
      user_id, song_title, mode, level, score, grade, plate, background_url, clears_json, pumbility_gain, singles_pumbility_gain, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    userId,
    first.song_title,
    first.mode,
    first.level,
    first.score,
    first.grade,
    first.plate,
    first.background_url,
    JSON.stringify(normalized),
    postPumbilityGain,
    postSinglesPumbilityGain
  );

  return result.lastInsertRowid;
}

function isBeginnerTitleRow(title) {
  const family = String(title?.skill_family || '').trim();
  const name = String(title?.name || title?.skill_title || '').trim();
  return /^beginner$/i.test(family) || /^beginner\b/i.test(name);
}

function getTitlePlateMeta(title) {
  const family = String(title?.skill_family || '').trim().toLowerCase();
  if (family === 'intermediate') {
    return { plate: 'Bronze Plate', tier: 'bronze' };
  }
  if (family === 'advanced') {
    return { plate: 'Silver Plate', tier: 'silver' };
  }
  if (family === 'expert') {
    return { plate: 'Gold Plate', tier: 'gold' };
  }
  if (family === 'master') {
    return { plate: 'Master Plate', tier: 'master' };
  }
  return { plate: 'Title Plate', tier: 'title' };
}

function getNewlyUnlockedTitles(previousProgress, latestProgress) {
  const previouslyUnlocked = new Set(
    (previousProgress?.titles || [])
      .filter((title) => title?.unlocked)
      .map((title) => title.id)
  );

  return (latestProgress?.titles || [])
    .filter((title) => title?.unlocked && !previouslyUnlocked.has(title.id) && !isBeginnerTitleRow(title));
}

function insertTitleUnlockActivityPost(db, userId, unlockedTitles) {
  if (!Array.isArray(unlockedTitles) || unlockedTitles.length === 0) return null;
  const payload = unlockedTitles.map((title) => {
    const plateMeta = getTitlePlateMeta(title);
    return {
      entry_type: 'title_unlock',
      song_title: title.name || title.skill_title || 'Title Unlock',
      mode: 'Title',
      level: parseInt(title.skill_level, 10) || 0,
      score: parseInt(title.required_points, 10) || 0,
      grade: 'TITLE',
      plate: plateMeta.plate,
      title_name: title.name || title.skill_title || 'Title Unlock',
      title_family: title.skill_family || '',
      title_level: parseInt(title.skill_level, 10) || 0,
      title_plate: plateMeta.plate,
      title_tier: plateMeta.tier,
      background_url: '',
    };
  });
  return insertGroupedNewClearPost(db, userId, payload);
}

// ─── Sync: Pumbility ───────────────────────────────────

// POST /api/piugame/sync/pumbility — fetch pumbility from piugame
router.post('/sync/pumbility', requireAuth, async (req, res) => {
  try {
    const client = await loginWithStoredCredentials(req.user.id);
    const { pumbilityValue, scores } = await scrapePumbility(client);
    const db = getDb();
    const overRankingLookup = await ensureOverRankingLookupForScoring(db, { maxAgeMinutes: 1440 });

    // Update pumbility scores in transaction
    const insertOrUpdate = db.prepare(`
      INSERT INTO user_pumbility_scores (user_id, song_title, mode, level, score, grade, background_url, date_played, rank_order, over_top100_rank)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, song_title, mode, level) DO UPDATE SET
        score = excluded.score,
        grade = excluded.grade,
        background_url = excluded.background_url,
        date_played = excluded.date_played,
        rank_order = excluded.rank_order,
        over_top100_rank = excluded.over_top100_rank
    `);

    const txn = db.transaction(() => {
      // Clear old pumbility scores and re-insert
      db.prepare('DELETE FROM user_pumbility_scores WHERE user_id = ?').run(req.user.id);
      for (const s of scores) {
        const overTop100Rank = getOverTop100Rank(
          overRankingLookup,
          s.song_title,
          s.mode,
          s.level,
          s.score,
          s.date_played,
          req.user?.username || ''
        );
        insertOrUpdate.run(
          req.user.id, s.song_title, s.mode, s.level, s.score,
          s.grade, s.background_url, s.date_played, s.rank_order, overTop100Rank
        );
      }

      // Update pumbility value on user profile and sync table
      if (pumbilityValue > 0) {
        db.prepare('UPDATE users SET pumbility = ? WHERE id = ?').run(pumbilityValue, req.user.id);
      }
      db.prepare(`
        UPDATE user_piugame_sync SET last_pumbility_sync = datetime('now'), pumbility_value = ? WHERE user_id = ?
      `).run(pumbilityValue, req.user.id);
    });
    txn();

    res.json({ success: true, pumbility_value: pumbilityValue, scores_count: scores.length });

    // Also sync leaderboard in background (no login required, rate-limited to 1/hour)
    (async () => {
      try {
        const refreshed = await refreshPumbilityLeaderboardCache(db, { maxAgeMinutes: 60 });
        if (!refreshed.cached) {
          console.log(`Pumbility leaderboard synced: ${refreshed.total_entries} entries, threshold=${refreshed.threshold}`);
        }
      } catch (err) {
        console.error('Background pumbility leaderboard sync error:', err.message);
      }
    })();
  } catch (err) {
    console.error('Pumbility sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Sync: Best Scores (background) ─────────────────────

// POST /api/piugame/sync/best-scores — starts background import, returns immediately
router.post('/sync/best-scores', requireAuth, async (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  // Check if already in progress
  const sync = db.prepare('SELECT * FROM user_piugame_sync WHERE user_id = ?').get(userId);
  if (sync && sync.sync_in_progress === 'best-scores') {
    return res.json({ started: true, already_running: true, progress: sync.sync_progress, total: sync.sync_total });
  }

  // Check rate limit (once per day) unless first import
  if (sync && sync.best_scores_imported && sync.last_best_scores_sync) {
    const lastSync = new Date(sync.last_best_scores_sync + 'Z');
    const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) {
      const hoursLeft = Math.ceil(24 - hoursSince);
      return res.status(429).json({
        error: `Full best scores sync is limited to once per day. Try again in ${hoursLeft} hours.`
      });
    }
  }

  // Mark as in progress and respond immediately
  db.prepare(`
    UPDATE user_piugame_sync SET sync_in_progress = 'best-scores', sync_progress = 0, sync_total = 0 WHERE user_id = ?
  `).run(userId);

  res.json({ started: true });

  // Run in background
  (async () => {
    try {
      const progressBeforeSync = getUserTitleProgress(db, userId);
      const client = await loginWithStoredCredentials(userId);
      const scores = await scrapeBestScores(client, (progress, total) => {
        // Update progress in DB so client can poll
        db.prepare('UPDATE user_piugame_sync SET sync_progress = ?, sync_total = ? WHERE user_id = ?')
          .run(progress, total, userId);
      });
      const passScores = scores.filter((row) => isPassingScore(row.score, row.grade));
      const ignoredFailCount = scores.length - passScores.length;
      const overRankingLookup = await ensureOverRankingLookupForScoring(db, { maxAgeMinutes: 1440 });
      const scoredPassScores = passScores.map((row) => ({
        ...row,
        over_top100_rank: getOverTop100Rank(
          overRankingLookup,
          row.song_title,
          row.mode,
          row.level,
          row.score,
          row.date_played,
          req.user?.username || ''
        ),
      }));

      const insertOrUpdate = db.prepare(`
        INSERT INTO user_best_scores (user_id, song_title, mode, level, score, grade, plate, background_url, shoe_id, over_top100_rank)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, song_title, mode, level) DO UPDATE SET
          score = MAX(excluded.score, user_best_scores.score),
          grade = CASE WHEN excluded.score > user_best_scores.score THEN excluded.grade ELSE user_best_scores.grade END,
          plate = CASE WHEN excluded.score > user_best_scores.score THEN excluded.plate ELSE user_best_scores.plate END,
          background_url = CASE WHEN excluded.background_url != '' THEN excluded.background_url ELSE user_best_scores.background_url END,
          shoe_id = CASE WHEN excluded.score > user_best_scores.score THEN excluded.shoe_id ELSE user_best_scores.shoe_id END,
          over_top100_rank = CASE
            WHEN excluded.score > user_best_scores.score THEN excluded.over_top100_rank
            ELSE user_best_scores.over_top100_rank
          END
      `);

      // Capture old scores for upscore tracking before replacing
      const oldScores = {};
      const existingScores = db.prepare('SELECT song_title, mode, level, score, grade, shoe_id FROM user_best_scores WHERE user_id = ?').all(userId);
      const baselineBestScores = existingScores.filter((row) => isPassingScore(row.score, row.grade));
      for (const s of existingScores) {
        if (!isPassingScore(s.score, s.grade)) continue;
        oldScores[`${s.song_title}|${s.mode}|${s.level}`] = { score: s.score, grade: s.grade, shoe_id: s.shoe_id ? parseInt(s.shoe_id, 10) : null };
      }

      let upscores = [];
      let newClears = [];
      let upscorePostId = null;
      let newClearPostId = null;

      const txn = db.transaction(() => {
        db.prepare('DELETE FROM user_best_scores WHERE user_id = ?').run(userId);
        for (const s of scoredPassScores) {
          const key = `${s.song_title}|${s.mode}|${s.level}`;
          const old = oldScores[key];
          const preservedShoeId = old && old.score === s.score ? old.shoe_id : null;
          insertOrUpdate.run(
            userId,
            s.song_title,
            s.mode,
            s.level,
            s.score,
            s.grade,
            s.plate,
            s.background_url || '',
            preservedShoeId,
            s.over_top100_rank
          );
        }

        // Track upscores and new clears
        upscores = [];
        newClears = [];
        for (const s of scoredPassScores) {
          const key = `${s.song_title}|${s.mode}|${s.level}`;
          const old = oldScores[key];
          if (old && s.score > old.score) {
            upscores.push({
              song_title: s.song_title, mode: s.mode, level: s.level,
              old_score: old.score, new_score: s.score,
              old_grade: old.grade, new_grade: s.grade,
              background_url: s.background_url || '',
              over_top100_rank: s.over_top100_rank,
            });
          } else if (!old) {
            newClears.push(s);
          }
        }
        const pumbilityGains = computePostPumbilityGains(baselineBestScores, upscores, newClears);
        upscores = pumbilityGains.upscores;
        newClears = pumbilityGains.clears;

        if (upscores.length > 0) {
          const upscoreInsert = db.prepare(`
            INSERT INTO user_upscores (user_id, upscores_json, pumbility_gain, singles_pumbility_gain, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(userId, JSON.stringify(upscores), pumbilityGains.upscore_gain, pumbilityGains.singles_upscore_gain);
          upscorePostId = upscoreInsert.lastInsertRowid;
        }
        newClearPostId = insertGroupedNewClearPost(db, userId, newClears, {
          pumbilityGain: pumbilityGains.clear_gain,
          singlesPumbilityGain: pumbilityGains.singles_clear_gain,
        });
        db.prepare(`
          UPDATE user_piugame_sync SET last_best_scores_sync = datetime('now'), best_scores_imported = 1,
          sync_in_progress = '', sync_progress = 0, sync_total = 0 WHERE user_id = ?
        `).run(userId);
      });
      txn();
      const progressAfterSync = updateUserSkillTitleFromBestScores(db, userId);
      const newlyUnlockedTitles = getNewlyUnlockedTitles(progressBeforeSync, progressAfterSync);
      const titleUnlockPostId = insertTitleUnlockActivityPost(db, userId, newlyUnlockedTitles);

      // Create notification
      const profile = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
      const actorUsername = profile?.username || 'Someone';
      const profileLink = buildProfilePath(profile?.username) || `/profile/${userId}`;
      const syncMessage = ignoredFailCount > 0
        ? `${scoredPassScores.length} passing scores imported (${ignoredFailCount} failed scores ignored).`
        : `${scoredPassScores.length} scores imported successfully!`;
      createUserNotification(
        db,
        userId,
        'sync_complete',
        'Best Scores Synced',
        syncMessage,
        profileLink
      );

      if (upscores.length > 0) {
        notifyActivitySubscribers(db, {
          actorUserId: userId,
          actorUsername,
          activityType: 'upscores',
          notificationType: 'followed_user_upscore',
          title: 'New Upscores',
          message: `${actorUsername} posted ${upscores.length} new upscore${upscores.length === 1 ? '' : 's'}`,
          link: upscorePostId ? `/upscore/${upscorePostId}` : profileLink,
        });
      }

      if (newClears.length > 0) {
        notifyActivitySubscribers(db, {
          actorUserId: userId,
          actorUsername,
          activityType: 'new_clears',
          notificationType: 'followed_user_new_clear',
          title: 'New Clears',
          message: `${actorUsername} posted ${newClears.length} new clear${newClears.length === 1 ? '' : 's'}`,
          link: newClearPostId ? `/clear/${newClearPostId}` : profileLink,
        });
      }

      if (newlyUnlockedTitles.length > 0) {
        const titleList = newlyUnlockedTitles.map((title) => title.name || title.skill_title).filter(Boolean);
        const titleSummary = titleList.length > 1 ? `${titleList[0]} +${titleList.length - 1}` : (titleList[0] || 'a new title');
        notifyActivitySubscribers(db, {
          actorUserId: userId,
          actorUsername,
          activityType: 'new_clears',
          notificationType: 'followed_user_new_title',
          title: 'Title Earned',
          message: `${actorUsername} earned ${titleSummary}`,
          link: titleUnlockPostId ? `/clear/${titleUnlockPostId}` : profileLink,
        });
      }

      console.log(`Background best scores sync complete for ${userId}: ${scoredPassScores.length} passing scores (${ignoredFailCount} failed ignored)`);
    } catch (err) {
      console.error('Background best scores sync error:', err.message);
      db.prepare(`
        UPDATE user_piugame_sync SET sync_in_progress = '', sync_progress = 0, sync_total = 0 WHERE user_id = ?
      `).run(userId);
      createUserNotification(db, userId, 'sync_error', 'Best Scores Sync Failed', err.message, '');
    }
  })();
});

// GET /api/piugame/sync/progress — poll sync progress
router.get('/sync/progress', requireAuth, (req, res) => {
  const db = getDb();
  const sync = db.prepare('SELECT sync_in_progress, sync_progress, sync_total FROM user_piugame_sync WHERE user_id = ?')
    .get(req.user.id);
  res.json({
    in_progress: sync?.sync_in_progress || '',
    progress: sync?.sync_progress || 0,
    total: sync?.sync_total || 0,
  });
});

// ─── Shoe Cabinet ───────────────────────────────────────

// GET /api/piugame/shoes/catalog/admin?q=...&limit=...&page=...
router.get('/shoes/catalog/admin', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  try {
    syncShoeCatalogFromUserShoes(db);
  } catch (err) {
    console.error('Sync admin shoe catalog error:', err.message);
  }
  const q = normalizeShoeText(req.query?.q, 120).toLowerCase();
  const parsedLimit = parseInt(req.query?.limit, 10);
  const parsedPage = parseInt(req.query?.page, 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : 12;
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const offset = (page - 1) * limit;
  const like = q ? `%${q}%` : '';

  const rows = db.prepare(`
    SELECT
      c.id,
      c.make,
      c.model,
      c.colorway,
      c.image_data,
      c.created_by,
      c.created_at,
      c.updated_at,
      CASE WHEN md.catalog_id = c.id THEN 1 ELSE 0 END AS is_model_display
    FROM shoe_catalog c
    LEFT JOIN shoe_model_display md
      ON md.make_key = LOWER(TRIM(COALESCE(c.make, '')))
      AND md.model_key = LOWER(TRIM(COALESCE(c.model, '')))
    WHERE
      ? = ''
      OR LOWER(TRIM(COALESCE(c.make, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(c.model, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(c.colorway, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(c.make, '') || ' ' || COALESCE(c.model, '') || ' ' || COALESCE(c.colorway, ''))) LIKE ?
    ORDER BY COALESCE(c.updated_at, c.created_at, datetime('now')) DESC, c.id DESC
    LIMIT ? OFFSET ?
  `).all(q, like, like, like, like, limit, offset);

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM shoe_catalog
    WHERE
      ? = ''
      OR LOWER(TRIM(COALESCE(make, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(model, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(colorway, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(make, '') || ' ' || COALESCE(model, '') || ' ' || COALESCE(colorway, ''))) LIKE ?
  `).get(q, like, like, like, like) || { total: 0 };

  const total = parseInt(totalRow.total, 10) || 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  res.json({
    q,
    page,
    limit,
    total,
    total_pages: totalPages,
    results: rows.map((row) => ({
      id: parseInt(row.id, 10),
      make: row.make || '',
      model: row.model || '',
      colorway: row.colorway || '',
      image_data: row.image_data || '',
      created_by: row.created_by || '',
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
      is_model_display: !!row.is_model_display,
    })),
  });
});

// POST /api/piugame/shoes/catalog/admin
router.post('/shoes/catalog/admin', requireAuth, requireAdmin, SHOE_UPLOAD.single('photo'), async (req, res) => {
  try {
    const db = getDb();
    const make = normalizeShoeText(req.body?.make, 80);
    const model = normalizeShoeText(req.body?.model, 80);
    const colorway = normalizeShoeColorway(req.body?.colorway, 120);
    if (!make || !model) {
      return res.status(400).json({ error: 'Shoe make and model are required' });
    }
    const imageData = await encodeShoeImage(req.file);

    const existing = db.prepare(`
      SELECT id
      FROM shoe_catalog
      WHERE LOWER(TRIM(COALESCE(make, ''))) = ?
        AND LOWER(TRIM(COALESCE(model, ''))) = ?
        AND LOWER(TRIM(COALESCE(colorway, ''))) = ?
      LIMIT 1
    `).get(make.toLowerCase(), model.toLowerCase(), colorway.toLowerCase());

    let catalogId = null;
    if (existing) {
      db.prepare(`
        UPDATE shoe_catalog
        SET
          make = ?,
          model = ?,
          colorway = ?,
          image_data = CASE WHEN ? != '' THEN ? ELSE image_data END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(make, model, colorway, imageData, imageData, existing.id);
      catalogId = parseInt(existing.id, 10);
    } else {
      const insert = db.prepare(`
        INSERT INTO shoe_catalog (make, model, colorway, image_data, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(make, model, colorway, imageData, req.user.id);
      catalogId = parseInt(insert.lastInsertRowid, 10);
    }

    const entry = db.prepare(`
      SELECT id, make, model, colorway, image_data, created_by, created_at, updated_at
      FROM shoe_catalog
      WHERE id = ?
    `).get(catalogId);
    res.status(existing ? 200 : 201).json({
      entry: {
        id: parseInt(entry?.id, 10) || catalogId,
        make: entry?.make || '',
        model: entry?.model || '',
        colorway: entry?.colorway || '',
        image_data: entry?.image_data || '',
        created_by: entry?.created_by || '',
        created_at: entry?.created_at || '',
        updated_at: entry?.updated_at || '',
      },
      updated: !!existing,
    });
  } catch (err) {
    console.error('Create admin shoe catalog entry error:', err.message);
    res.status(500).json({ error: 'Failed to save shoe catalog entry' });
  }
});

// PUT /api/piugame/shoes/catalog/admin/:catalogId
router.put('/shoes/catalog/admin/:catalogId', requireAuth, requireAdmin, SHOE_UPLOAD.single('photo'), async (req, res) => {
  try {
    const db = getDb();
    const catalogId = parseInt(req.params.catalogId, 10);
    if (!Number.isInteger(catalogId) || catalogId <= 0) {
      return res.status(400).json({ error: 'Invalid catalog entry ID' });
    }

    const existing = db.prepare(`
      SELECT id, make, model, colorway, image_data, created_by, created_at, updated_at
      FROM shoe_catalog
      WHERE id = ?
      LIMIT 1
    `).get(catalogId);
    if (!existing) return res.status(404).json({ error: 'Catalog entry not found' });

    const make = normalizeShoeText(req.body?.make, 80);
    const model = normalizeShoeText(req.body?.model, 80);
    const colorway = normalizeShoeColorway(req.body?.colorway, 120);
    if (!make || !model) {
      return res.status(400).json({ error: 'Shoe make and model are required' });
    }

    let imageData = String(existing.image_data || '');
    if (req.file) {
      imageData = await encodeShoeImage(req.file);
    }

    const oldMakeKey = normalizeShoeText(existing.make, 80).toLowerCase();
    const oldModelKey = normalizeShoeText(existing.model, 80).toLowerCase();
    const nextMakeKey = make.toLowerCase();
    const nextModelKey = model.toLowerCase();

    const txn = db.transaction(() => {
      db.prepare(`
        UPDATE shoe_catalog
        SET
          make = ?,
          model = ?,
          colorway = ?,
          image_data = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(make, model, colorway, imageData, catalogId);

      if (oldMakeKey && oldModelKey && (oldMakeKey !== nextMakeKey || oldModelKey !== nextModelKey)) {
        const mappedDisplay = db.prepare(`
          SELECT catalog_id
          FROM shoe_model_display
          WHERE make_key = ? AND model_key = ? AND catalog_id = ?
          LIMIT 1
        `).get(oldMakeKey, oldModelKey, catalogId);
        if (mappedDisplay) {
          db.prepare(`
            DELETE FROM shoe_model_display
            WHERE make_key = ? AND model_key = ?
          `).run(oldMakeKey, oldModelKey);
          db.prepare(`
            INSERT INTO shoe_model_display (make_key, model_key, catalog_id, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(make_key, model_key)
            DO UPDATE SET
              catalog_id = excluded.catalog_id,
              updated_at = datetime('now')
          `).run(nextMakeKey, nextModelKey, catalogId);
        }
      }
    });
    txn();

    const entry = db.prepare(`
      SELECT id, make, model, colorway, image_data, created_by, created_at, updated_at
      FROM shoe_catalog
      WHERE id = ?
      LIMIT 1
    `).get(catalogId);

    res.json({
      entry: {
        id: parseInt(entry?.id, 10) || catalogId,
        make: entry?.make || '',
        model: entry?.model || '',
        colorway: entry?.colorway || '',
        image_data: entry?.image_data || '',
        created_by: entry?.created_by || '',
        created_at: entry?.created_at || '',
        updated_at: entry?.updated_at || '',
      },
      updated: true,
    });
  } catch (err) {
    console.error('Update admin shoe catalog entry error:', err.message);
    res.status(500).json({ error: 'Failed to update shoe catalog entry' });
  }
});

// DELETE /api/piugame/shoes/catalog/admin/:catalogId
router.delete('/shoes/catalog/admin/:catalogId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const catalogId = parseInt(req.params.catalogId, 10);
  if (!Number.isInteger(catalogId) || catalogId <= 0) {
    return res.status(400).json({ error: 'Invalid catalog entry ID' });
  }
  const existing = db.prepare('SELECT id FROM shoe_catalog WHERE id = ?').get(catalogId);
  if (!existing) return res.status(404).json({ error: 'Catalog entry not found' });
  db.prepare('DELETE FROM shoe_catalog WHERE id = ?').run(catalogId);
  res.json({ success: true });
});

// POST /api/piugame/shoes/catalog/admin/:catalogId/display
router.post('/shoes/catalog/admin/:catalogId/display', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const catalogId = parseInt(req.params.catalogId, 10);
  if (!Number.isInteger(catalogId) || catalogId <= 0) {
    return res.status(400).json({ error: 'Invalid catalog entry ID' });
  }

  const entry = db.prepare(`
    SELECT id, make, model, colorway
    FROM shoe_catalog
    WHERE id = ?
  `).get(catalogId);
  if (!entry) return res.status(404).json({ error: 'Catalog entry not found' });

  const makeKey = normalizeShoeText(entry.make, 80).toLowerCase();
  const modelKey = normalizeShoeText(entry.model, 80).toLowerCase();
  if (!makeKey || !modelKey) {
    return res.status(400).json({ error: 'Catalog entry must include make and model' });
  }

  db.prepare(`
    INSERT INTO shoe_model_display (make_key, model_key, catalog_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(make_key, model_key)
    DO UPDATE SET
      catalog_id = excluded.catalog_id,
      updated_at = datetime('now')
  `).run(makeKey, modelKey, catalogId);

  res.json({
    success: true,
    model: {
      make: entry.make || '',
      model: entry.model || '',
    },
    display: {
      catalog_id: catalogId,
      colorway: entry.colorway || '',
    },
  });
});

// GET /api/piugame/shoes/catalog?q=...&limit=...&page=...
router.get('/shoes/catalog', requireAuth, (req, res) => {
  const db = getDb();
  const q = normalizeShoeText(req.query?.q, 120).toLowerCase();
  const parsedLimit = parseInt(req.query?.limit, 10);
  const parsedPage = parseInt(req.query?.page, 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 6)
    : 6;
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const offset = (page - 1) * limit;
  if (!q) {
    return res.json({
      q: '',
      page,
      limit,
      total: 0,
      total_pages: 0,
      results: [],
    });
  }
  const like = `%${q}%`;

  const rows = db.prepare(`
    WITH catalog AS (
      SELECT
        printf('catalog:%d', c.id) AS id,
        c.id AS catalog_id,
        TRIM(COALESCE(c.make, '')) AS make,
        TRIM(COALESCE(c.model, '')) AS model,
        TRIM(COALESCE(c.colorway, '')) AS colorway,
        COALESCE(c.image_data, '') AS image_data,
        1 AS curated,
        0 AS usage_count,
        COALESCE(c.updated_at, c.created_at, datetime('now')) AS sort_time
      FROM shoe_catalog c
      WHERE
        (TRIM(COALESCE(c.make, '')) != '' OR TRIM(COALESCE(c.model, '')) != '')
        AND (
          LOWER(TRIM(COALESCE(c.make, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(c.model, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(c.colorway, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(c.make, '') || ' ' || COALESCE(c.model, '') || ' ' || COALESCE(c.colorway, ''))) LIKE ?
        )
    ),
    community_grouped AS (
      SELECT
        LOWER(TRIM(COALESCE(s.make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(s.model, ''))) AS model_key,
        LOWER(TRIM(COALESCE(s.colorway, ''))) AS colorway_key,
        MAX(TRIM(COALESCE(s.make, ''))) AS make,
        MAX(TRIM(COALESCE(s.model, ''))) AS model,
        MAX(TRIM(COALESCE(s.colorway, ''))) AS colorway,
        COUNT(DISTINCT s.user_id) AS usage_count,
        MAX(COALESCE(s.updated_at, s.created_at, datetime('now'))) AS sort_time,
        COALESCE(
          (
            SELECT s2.id
            FROM user_shoes s2
            WHERE LOWER(TRIM(COALESCE(s2.make, ''))) = LOWER(TRIM(COALESCE(s.make, '')))
              AND LOWER(TRIM(COALESCE(s2.model, ''))) = LOWER(TRIM(COALESCE(s.model, '')))
              AND LOWER(TRIM(COALESCE(s2.colorway, ''))) = LOWER(TRIM(COALESCE(s.colorway, '')))
              AND TRIM(COALESCE(s2.image_data, '')) != ''
            ORDER BY COALESCE(s2.updated_at, s2.created_at) DESC, s2.id DESC
            LIMIT 1
          ),
          (
            SELECT s2.id
            FROM user_shoes s2
            WHERE LOWER(TRIM(COALESCE(s2.make, ''))) = LOWER(TRIM(COALESCE(s.make, '')))
              AND LOWER(TRIM(COALESCE(s2.model, ''))) = LOWER(TRIM(COALESCE(s.model, '')))
              AND LOWER(TRIM(COALESCE(s2.colorway, ''))) = LOWER(TRIM(COALESCE(s.colorway, '')))
            ORDER BY COALESCE(s2.updated_at, s2.created_at) DESC, s2.id DESC
            LIMIT 1
          )
        ) AS sample_shoe_id
      FROM user_shoes s
      WHERE
        (TRIM(COALESCE(s.make, '')) != '' OR TRIM(COALESCE(s.model, '')) != '')
        AND (
          LOWER(TRIM(COALESCE(s.make, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(s.model, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(s.colorway, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(s.make, '') || ' ' || COALESCE(s.model, '') || ' ' || COALESCE(s.colorway, ''))) LIKE ?
        )
      GROUP BY make_key, model_key, colorway_key
    ),
    community AS (
      SELECT
        printf('user:%d', cg.sample_shoe_id) AS id,
        NULL AS catalog_id,
        cg.make,
        cg.model,
        cg.colorway,
        COALESCE((SELECT image_data FROM user_shoes WHERE id = cg.sample_shoe_id), '') AS image_data,
        0 AS curated,
        cg.usage_count AS usage_count,
        cg.sort_time AS sort_time
      FROM community_grouped cg
    ),
    combined AS (
      SELECT * FROM catalog
      UNION ALL
      SELECT * FROM community
    ),
    dedup AS (
      SELECT
        LOWER(TRIM(COALESCE(make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(model, ''))) AS model_key,
        LOWER(TRIM(COALESCE(colorway, ''))) AS colorway_key,
        MAX(make) AS make,
        MAX(model) AS model,
        MAX(colorway) AS colorway,
        MAX(catalog_id) AS catalog_id,
        MAX(curated) AS curated,
        MAX(usage_count) AS usage_count,
        MAX(sort_time) AS sort_time,
        MAX(CASE WHEN curated = 1 THEN id ELSE '' END) AS curated_id,
        MAX(CASE WHEN curated = 0 THEN id ELSE '' END) AS community_id,
        MAX(CASE WHEN curated = 1 AND TRIM(COALESCE(image_data, '')) != '' THEN image_data ELSE '' END) AS curated_image_data,
        MAX(CASE WHEN TRIM(COALESCE(image_data, '')) != '' THEN image_data ELSE '' END) AS any_image_data
      FROM combined
      GROUP BY make_key, model_key, colorway_key
    ),
    ranked AS (
      SELECT
        CASE
          WHEN curated_id != '' THEN curated_id
          ELSE community_id
        END AS id,
        catalog_id,
        make,
        model,
        colorway,
        CASE
          WHEN TRIM(COALESCE(curated_image_data, '')) != '' THEN curated_image_data
          ELSE COALESCE(any_image_data, '')
        END AS image_data,
        curated,
        usage_count,
        sort_time
      FROM dedup
    )
    SELECT
      id,
      catalog_id,
      make,
      model,
      colorway,
      image_data,
      curated,
      usage_count,
      COUNT(*) OVER() AS total_count
    FROM ranked
    ORDER BY curated DESC, usage_count DESC, sort_time DESC, model ASC, colorway ASC, make ASC
    LIMIT ? OFFSET ?
  `).all(
    like, like, like, like,
    like, like, like, like,
    limit, offset
  );

  const total = rows.length > 0 ? (parseInt(rows[0].total_count, 10) || 0) : 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  res.json({
    q,
    page,
    limit,
    total,
    total_pages: totalPages,
    results: rows.map((row) => ({
      id: row.id || '',
      catalog_id: Number.isInteger(parseInt(row.catalog_id, 10)) ? parseInt(row.catalog_id, 10) : null,
      make: row.make || '',
      model: row.model || '',
      colorway: row.colorway || '',
      usage_count: parseInt(row.usage_count, 10) || 0,
      curated: !!row.curated,
      image_data: row.image_data || '',
      catalog_key: buildShoeCatalogKey(row.make, row.model, row.colorway),
    })),
  });
});

// GET /api/piugame/shoes/stats/top?limit=...
router.get('/shoes/stats/top', requireAuth, (req, res) => {
  const db = getDb();
  const parsedLimit = parseInt(req.query?.limit, 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 60)
    : 24;

  const rows = db.prepare(`
    WITH grouped AS (
      SELECT
        LOWER(TRIM(COALESCE(make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(model, ''))) AS model_key,
        MAX(TRIM(COALESCE(make, ''))) AS make,
        MAX(TRIM(COALESCE(model, ''))) AS model,
        COUNT(*) AS shoe_entries,
        COUNT(DISTINCT user_id) AS player_count,
        COUNT(DISTINCT NULLIF(LOWER(TRIM(COALESCE(colorway, ''))), '')) AS colorway_count,
        MAX(COALESCE(updated_at, created_at, datetime('now'))) AS last_used_at
      FROM user_shoes
      WHERE TRIM(COALESCE(make, '')) != '' OR TRIM(COALESCE(model, '')) != ''
      GROUP BY make_key, model_key
    ),
    picked AS (
      SELECT
        g.*,
        COALESCE(
          (
            SELECT s.id
            FROM user_shoes s
            WHERE LOWER(TRIM(COALESCE(s.make, ''))) = g.make_key
              AND LOWER(TRIM(COALESCE(s.model, ''))) = g.model_key
              AND TRIM(COALESCE(s.image_data, '')) != ''
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
            LIMIT 1
          ),
          (
            SELECT s.id
            FROM user_shoes s
            WHERE LOWER(TRIM(COALESCE(s.make, ''))) = g.make_key
              AND LOWER(TRIM(COALESCE(s.model, ''))) = g.model_key
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
            LIMIT 1
          )
        ) AS sample_shoe_id
      FROM grouped g
    )
    SELECT
      p.sample_shoe_id AS id,
      p.make,
      p.model,
      p.shoe_entries,
      p.player_count,
      p.colorway_count,
      COALESCE(sc.image_data, (SELECT image_data FROM user_shoes WHERE id = p.sample_shoe_id), '') AS image_data,
      COALESCE(sc.colorway, '') AS display_colorway
    FROM picked p
    LEFT JOIN shoe_model_display md
      ON md.make_key = p.make_key
      AND md.model_key = p.model_key
    LEFT JOIN shoe_catalog sc
      ON sc.id = md.catalog_id
    ORDER BY p.player_count DESC, p.shoe_entries DESC, p.last_used_at DESC, p.model ASC, p.make ASC
    LIMIT ?
  `).all(limit);

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_shoe_entries,
      COUNT(DISTINCT user_id) AS players_with_shoes
    FROM user_shoes
    WHERE TRIM(COALESCE(make, '')) != '' OR TRIM(COALESCE(model, '')) != ''
  `).get() || { total_shoe_entries: 0, players_with_shoes: 0 };

  const totalModels = db.prepare(`
    SELECT COUNT(*) AS total_models
    FROM (
      SELECT
        LOWER(TRIM(COALESCE(make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(model, ''))) AS model_key
      FROM user_shoes
      WHERE TRIM(COALESCE(make, '')) != '' OR TRIM(COALESCE(model, '')) != ''
      GROUP BY make_key, model_key
    ) m
  `).get() || { total_models: 0 };

  res.json({
    summary: {
      total_models: parseInt(totalModels.total_models, 10) || 0,
      players_with_shoes: parseInt(totals.players_with_shoes, 10) || 0,
      total_shoe_entries: parseInt(totals.total_shoe_entries, 10) || 0,
    },
    results: rows.map((row) => ({
      id: parseInt(row.id, 10),
      make: row.make || '',
      model: row.model || '',
      player_count: parseInt(row.player_count, 10) || 0,
      shoe_entries: parseInt(row.shoe_entries, 10) || 0,
      colorway_count: parseInt(row.colorway_count, 10) || 0,
      image_data: row.image_data || '',
      display_colorway: row.display_colorway || '',
    })),
  });
});

// GET /api/piugame/shoes/stats/top/:shoeId/users
router.get('/shoes/stats/top/:shoeId/users', requireAuth, (req, res) => {
  const db = getDb();
  const shoeId = parseInt(req.params.shoeId, 10);
  if (!Number.isInteger(shoeId) || shoeId <= 0) {
    return res.status(400).json({ error: 'Invalid shoe ID' });
  }

  const target = db.prepare(`
    SELECT
      LOWER(TRIM(COALESCE(make, ''))) AS make_key,
      LOWER(TRIM(COALESCE(model, ''))) AS model_key
    FROM user_shoes
    WHERE id = ?
  `).get(shoeId);
  if (!target) return res.status(404).json({ error: 'Shoe model not found' });

  const makeKey = target.make_key || '';
  const modelKey = target.model_key || '';
  if (!makeKey && !modelKey) {
    return res.json({
      shoe: {
        id: shoeId,
        make: '',
        model: '',
        player_count: 0,
        shoe_entries: 0,
        image_data: '',
      },
      users: [],
    });
  }

  const shoe = db.prepare(`
    WITH grouped AS (
      SELECT
        MAX(TRIM(COALESCE(make, ''))) AS make,
        MAX(TRIM(COALESCE(model, ''))) AS model,
        COUNT(*) AS shoe_entries,
        COUNT(DISTINCT user_id) AS player_count,
        COUNT(DISTINCT NULLIF(LOWER(TRIM(COALESCE(colorway, ''))), '')) AS colorway_count,
        MAX(COALESCE(updated_at, created_at, datetime('now'))) AS last_used_at
      FROM user_shoes
      WHERE LOWER(TRIM(COALESCE(make, ''))) = ?
        AND LOWER(TRIM(COALESCE(model, ''))) = ?
    ),
    picked AS (
      SELECT
        g.*,
        COALESCE(
          (
            SELECT s.id
            FROM user_shoes s
            WHERE LOWER(TRIM(COALESCE(s.make, ''))) = ?
              AND LOWER(TRIM(COALESCE(s.model, ''))) = ?
              AND TRIM(COALESCE(s.image_data, '')) != ''
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
            LIMIT 1
          ),
          (
            SELECT s.id
            FROM user_shoes s
            WHERE LOWER(TRIM(COALESCE(s.make, ''))) = ?
              AND LOWER(TRIM(COALESCE(s.model, ''))) = ?
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
            LIMIT 1
          )
        ) AS sample_shoe_id
      FROM grouped g
    )
    SELECT
      p.sample_shoe_id AS id,
      p.make,
      p.model,
      p.player_count,
      p.shoe_entries,
      p.colorway_count,
      COALESCE((SELECT image_data FROM user_shoes WHERE id = p.sample_shoe_id), '') AS image_data
    FROM picked p
  `).get(makeKey, modelKey, makeKey, modelKey, makeKey, modelKey);

  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      COALESCE(u.avatar, '') AS avatar,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.nationality, '') AS nationality,
      COUNT(s.id) AS matching_shoe_count,
      GROUP_CONCAT(DISTINCT NULLIF(TRIM(COALESCE(s.colorway, '')), '')) AS colorways,
      MAX(CASE WHEN s.retired_at IS NULL THEN 1 ELSE 0 END) AS has_active_pair,
      MAX(CASE WHEN s.retired_at IS NULL AND s.is_current = 1 THEN 1 ELSE 0 END) AS is_current_pair
    FROM user_shoes s
    JOIN users u ON u.id = s.user_id
    WHERE LOWER(TRIM(COALESCE(s.make, ''))) = ?
      AND LOWER(TRIM(COALESCE(s.model, ''))) = ?
    GROUP BY u.id, u.username, u.avatar, u.skill_title, u.nationality
    ORDER BY is_current_pair DESC, has_active_pair DESC, u.username COLLATE NOCASE ASC
    LIMIT 300
  `).all(makeKey, modelKey);

  res.json({
    shoe: {
      id: parseInt(shoe?.id, 10) || shoeId,
      make: shoe?.make || '',
      model: shoe?.model || '',
      player_count: parseInt(shoe?.player_count, 10) || 0,
      shoe_entries: parseInt(shoe?.shoe_entries, 10) || 0,
      colorway_count: parseInt(shoe?.colorway_count, 10) || 0,
      image_data: shoe?.image_data || '',
    },
    users: users.map((row) => ({
      id: row.id,
      username: row.username || '',
      avatar: row.avatar || '',
      skill_title: row.skill_title || '',
      nationality: row.nationality || '',
      matching_shoe_count: parseInt(row.matching_shoe_count, 10) || 0,
      colorways: String(row.colorways || '')
        .split(',')
        .map((value) => normalizeShoeColorway(value, 120))
        .filter(Boolean),
      has_active_pair: !!row.has_active_pair,
      is_current_pair: !!row.is_current_pair,
    })),
  });
});

// GET /api/piugame/shoes/:userId
router.get('/shoes/:userId', (req, res) => {
  const db = getDb();
  res.json(getShoeCabinet(db, req.params.userId));
});

// POST /api/piugame/shoes
router.post('/shoes', requireAuth, SHOE_UPLOAD.single('photo'), async (req, res) => {
  try {
    const db = getDb();
    let make = normalizeShoeText(req.body?.make, 80);
    let model = normalizeShoeText(req.body?.model, 80);
    let colorway = normalizeShoeColorway(req.body?.colorway, 120);
    const parsedCatalogId = parseInt(req.body?.catalog_id, 10);
    const catalogId = Number.isInteger(parsedCatalogId) && parsedCatalogId > 0 ? parsedCatalogId : null;
    const catalogEntry = catalogId
      ? db.prepare(`
        SELECT id, make, model, colorway, image_data
        FROM shoe_catalog
        WHERE id = ?
      `).get(catalogId)
      : null;
    if (catalogEntry) {
      if (!make) make = normalizeShoeText(catalogEntry.make, 80);
      if (!model) model = normalizeShoeText(catalogEntry.model, 80);
      if (!colorway) colorway = normalizeShoeColorway(catalogEntry.colorway, 120);
    }
    if (!make || !model) {
      return res.status(400).json({ error: 'Shoe make and model are required' });
    }

    let imageData = await encodeShoeImage(req.file);
    if (!imageData && catalogEntry?.image_data) {
      imageData = catalogEntry.image_data;
    }
    const requestedCurrent = parseBoolean(req.body?.set_current);
    const existingCurrent = db.prepare(
      'SELECT id FROM user_shoes WHERE user_id = ? AND is_current = 1 AND retired_at IS NULL LIMIT 1'
    ).get(req.user.id);
    const shouldSetCurrent = requestedCurrent === true || (!existingCurrent && requestedCurrent !== false);

    const txn = db.transaction(() => {
      if (shouldSetCurrent) {
        db.prepare(`
          UPDATE user_shoes
          SET is_current = 0, updated_at = datetime('now')
          WHERE user_id = ? AND is_current = 1
        `).run(req.user.id);
      }
      return db.prepare(`
        INSERT INTO user_shoes (user_id, make, model, colorway, image_data, is_current, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(req.user.id, make, model, colorway, imageData, shouldSetCurrent ? 1 : 0);
    });

    const insert = txn();
    const shoe = db.prepare(`
      SELECT id, user_id, make, model, colorway, image_data, is_current, retired_at, created_at, updated_at
      FROM user_shoes
      WHERE id = ?
    `).get(insert.lastInsertRowid);

    res.status(201).json({
      shoe: {
        ...shoe,
        is_current: !!shoe?.is_current && !shoe?.retired_at,
        songs_logged: 0,
        steps_logged: 0,
        status: shoe?.retired_at ? 'retired' : (shoe?.is_current ? 'current' : 'available'),
      },
      cabinet: getShoeCabinet(db, req.user.id),
    });
  } catch (err) {
    console.error('Create shoe error:', err.message);
    res.status(500).json({ error: 'Failed to create shoe' });
  }
});

// POST /api/piugame/shoes/:shoeId/wear
router.post('/shoes/:shoeId/wear', requireAuth, (req, res) => {
  const db = getDb();
  const shoeId = parseInt(req.params.shoeId, 10);
  if (!Number.isInteger(shoeId) || shoeId <= 0) {
    return res.status(400).json({ error: 'Invalid shoe ID' });
  }

  const shoe = db.prepare(`
    SELECT id, retired_at
    FROM user_shoes
    WHERE id = ? AND user_id = ?
  `).get(shoeId, req.user.id);
  if (!shoe) return res.status(404).json({ error: 'Shoe not found' });
  if (shoe.retired_at) return res.status(400).json({ error: 'Retired shoes cannot be set as current' });

  const txn = db.transaction(() => {
    db.prepare(`
      UPDATE user_shoes
      SET is_current = 0, updated_at = datetime('now')
      WHERE user_id = ? AND is_current = 1
    `).run(req.user.id);

    db.prepare(`
      UPDATE user_shoes
      SET is_current = 1, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(shoeId, req.user.id);
  });
  txn();

  res.json({ success: true, cabinet: getShoeCabinet(db, req.user.id) });
});

// POST /api/piugame/shoes/:shoeId/photo
router.post('/shoes/:shoeId/photo', requireAuth, SHOE_UPLOAD.single('photo'), async (req, res) => {
  try {
    const db = getDb();
    const shoeId = parseInt(req.params.shoeId, 10);
    if (!Number.isInteger(shoeId) || shoeId <= 0) {
      return res.status(400).json({ error: 'Invalid shoe ID' });
    }
    if (!req.file) return res.status(400).json({ error: 'Photo is required' });

    const shoe = db.prepare(`
      SELECT id
      FROM user_shoes
      WHERE id = ? AND user_id = ?
    `).get(shoeId, req.user.id);
    if (!shoe) return res.status(404).json({ error: 'Shoe not found' });

    const imageData = await encodeShoeImage(req.file);
    db.prepare(`
      UPDATE user_shoes
      SET image_data = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(imageData, shoeId, req.user.id);

    res.json({ success: true, cabinet: getShoeCabinet(db, req.user.id) });
  } catch (err) {
    console.error('Update shoe photo error:', err.message);
    res.status(500).json({ error: 'Failed to update shoe photo' });
  }
});

// POST /api/piugame/shoes/:shoeId/retire
router.post('/shoes/:shoeId/retire', requireAuth, (req, res) => {
  const db = getDb();
  const shoeId = parseInt(req.params.shoeId, 10);
  if (!Number.isInteger(shoeId) || shoeId <= 0) {
    return res.status(400).json({ error: 'Invalid shoe ID' });
  }

  const shoe = db.prepare(`
    SELECT id, retired_at
    FROM user_shoes
    WHERE id = ? AND user_id = ?
  `).get(shoeId, req.user.id);
  if (!shoe) return res.status(404).json({ error: 'Shoe not found' });

  if (!shoe.retired_at) {
    db.prepare(`
      UPDATE user_shoes
      SET is_current = 0, retired_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(shoeId, req.user.id);
  }

  res.json({ success: true, cabinet: getShoeCabinet(db, req.user.id) });
});

// DELETE /api/piugame/shoes/:shoeId
router.delete('/shoes/:shoeId', requireAuth, (req, res) => {
  const db = getDb();
  const shoeId = parseInt(req.params.shoeId, 10);
  if (!Number.isInteger(shoeId) || shoeId <= 0) {
    return res.status(400).json({ error: 'Invalid shoe ID' });
  }

  const shoe = db.prepare(`
    SELECT id
    FROM user_shoes
    WHERE id = ? AND user_id = ?
  `).get(shoeId, req.user.id);
  if (!shoe) return res.status(404).json({ error: 'Shoe not found' });

  const txn = db.transaction(() => {
    // Clear references first to avoid stale historical links if foreign keys are not enforced.
    db.prepare(`
      UPDATE user_recently_played
      SET shoe_id = NULL
      WHERE user_id = ? AND shoe_id = ?
    `).run(req.user.id, shoeId);

    db.prepare(`
      DELETE FROM user_shoes
      WHERE id = ? AND user_id = ?
    `).run(shoeId, req.user.id);
  });
  txn();

  res.json({ success: true, cabinet: getShoeCabinet(db, req.user.id) });
});

// ─── Sync: Recently Played ─────────────────────────────

// POST /api/piugame/sync/recently-played — fetch recent plays & update best scores
router.post('/sync/recently-played', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const progressBeforeSync = getUserTitleProgress(db, req.user.id);
    const client = await loginWithStoredCredentials(req.user.id);
    const plays = await scrapeRecentlyPlayed(client);
    const overRankingLookup = await ensureOverRankingLookupForScoring(db, { maxAgeMinutes: 1440 });

    const activeShoe = db.prepare(`
      SELECT id
      FROM user_shoes
      WHERE user_id = ? AND is_current = 1 AND retired_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).get(req.user.id);
    const activeShoeId = activeShoe ? parseInt(activeShoe.id, 10) : null;

    const findRecentPlay = db.prepare(`
      SELECT id, shoe_id
      FROM user_recently_played
      WHERE user_id = ?
        AND song_title = ?
        AND mode = ?
        AND level = ?
        AND score = ?
        AND grade = ?
        AND date_played = ?
      LIMIT 1
    `);

    const insertRecent = db.prepare(`
      INSERT INTO user_recently_played
      (user_id, shoe_id, song_title, mode, level, score, grade, machine_name, background_url, date_played, perfect, great, good, bad, miss, max_combo, kcal, plate, over_top100_rank)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, song_title, mode, level, score, grade, date_played) DO NOTHING
    `);

    const updateRecent = db.prepare(`
      UPDATE user_recently_played
      SET
        machine_name = CASE WHEN ? != '' THEN ? ELSE machine_name END,
        background_url = CASE WHEN ? != '' THEN ? ELSE background_url END,
        plate = CASE WHEN ? != '' THEN ? ELSE plate END,
        perfect = MAX(COALESCE(perfect, 0), ?),
        great = MAX(COALESCE(great, 0), ?),
        good = MAX(COALESCE(good, 0), ?),
        bad = MAX(COALESCE(bad, 0), ?),
        miss = MAX(COALESCE(miss, 0), ?),
        max_combo = MAX(COALESCE(max_combo, 0), ?),
        kcal = MAX(COALESCE(kcal, 0), ?),
        over_top100_rank = ?,
        shoe_id = CASE
          WHEN shoe_id IS NULL AND ? IS NOT NULL THEN ?
          ELSE shoe_id
        END
      WHERE id = ?
    `);

    // Also update best scores for passing runs only.
    const insertBest = db.prepare(`
      INSERT INTO user_best_scores (user_id, song_title, mode, level, score, grade, plate, shoe_id, over_top100_rank)
      VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
    `);
    const replaceBest = db.prepare(`
      UPDATE user_best_scores
      SET score = ?, grade = ?, plate = '', shoe_id = ?, over_top100_rank = ?
      WHERE user_id = ? AND song_title = ? AND mode = ? AND level = ?
    `);

    let updatedCount = 0;
    const upscoresFromRecent = [];
    const newClearsFromRecent = [];
    let upscorePostId = null;
    let newClearPostId = null;
    const baselineBestScores = db.prepare(
      'SELECT song_title, mode, level, score, grade FROM user_best_scores WHERE user_id = ?'
    ).all(req.user.id).filter((row) => isPassingScore(row.score, row.grade));

    const txn = db.transaction(() => {
      // Keep user_best_scores pass-only.
      db.prepare(`
        DELETE FROM user_best_scores
        WHERE user_id = ?
          AND (
            score <= 0
            OR UPPER(REPLACE(TRIM(COALESCE(grade, '')), ' ', '')) IN ('F', 'STAGEBREAK', 'STAGE_BREAK')
            OR UPPER(REPLACE(TRIM(COALESCE(grade, '')), ' ', '')) LIKE 'X_%'
          )
      `).run(req.user.id);

      for (const p of plays) {
        const songTitle = p.song_title;
        const mode = p.mode;
        const level = parseInt(p.level, 10) || 0;
        const score = parseInt(p.score, 10) || 0;
        const grade = p.grade || '';
        const machineName = p.machine_name || '';
        const backgroundUrl = p.background_url || '';
        const datePlayed = p.date_played || '';
        const perfect = parseInt(p.perfect, 10) || 0;
        const great = parseInt(p.great, 10) || 0;
        const good = parseInt(p.good, 10) || 0;
        const bad = parseInt(p.bad, 10) || 0;
        const miss = parseInt(p.miss, 10) || 0;
        const maxCombo = parseInt(p.max_combo, 10) || 0;
        const kcal = Number.isFinite(Number(p.kcal)) ? Number(p.kcal) : 0;
        const plate = p.plate || '';
        const overTop100Rank = getOverTop100Rank(
          overRankingLookup,
          songTitle,
          mode,
          level,
          score,
          datePlayed,
          req.user?.username || ''
        );

        // When syncing, the current shoe is treated as the shoe worn for fetched plays.
        const existingPlay = findRecentPlay.get(req.user.id, songTitle, mode, level, score, grade, datePlayed);
        if (!existingPlay) {
          insertRecent.run(
            req.user.id,
            activeShoeId,
            songTitle,
            mode,
            level,
            score,
            grade,
            machineName,
            backgroundUrl,
            datePlayed,
            perfect,
            great,
            good,
            bad,
            miss,
            maxCombo,
            kcal,
            plate,
            overTop100Rank
          );
        } else {
          updateRecent.run(
            machineName,
            machineName,
            backgroundUrl,
            backgroundUrl,
            plate,
            plate,
            perfect,
            great,
            good,
            bad,
            miss,
            maxCombo,
            kcal,
            overTop100Rank,
            activeShoeId,
            activeShoeId,
            existingPlay.id
          );
        }

        // Best scores / upscores are pass-only.
        if (isPassingScore(score, grade)) {
          const existing = db.prepare(
            'SELECT score, grade FROM user_best_scores WHERE user_id = ? AND song_title = ? AND mode = ? AND level = ?'
          ).get(req.user.id, songTitle, mode, level);
          const existingPass = existing ? isPassingScore(existing.score, existing.grade) : false;
          if (!existing || !existingPass || score > existing.score) {
            if (existing && existingPass && score > existing.score) {
              upscoresFromRecent.push({
                song_title: songTitle, mode, level,
                old_score: existing.score, new_score: score,
                old_grade: existing.grade || '', new_grade: grade || '',
                background_url: backgroundUrl || '',
                perfect, great, good, bad, miss,
                over_top100_rank: overTop100Rank,
              });
            } else {
              // New clear - first pass on this chart
              newClearsFromRecent.push({
                song_title: songTitle,
                mode,
                level,
                score,
                grade: grade || '',
                plate: plate || '',
                background_url: backgroundUrl || '',
                perfect, great, good, bad, miss,
                over_top100_rank: overTop100Rank,
              });
            }
            if (!existing) {
              insertBest.run(req.user.id, songTitle, mode, level, score, grade, activeShoeId, overTop100Rank);
            } else {
              replaceBest.run(score, grade, activeShoeId, overTop100Rank, req.user.id, songTitle, mode, level);
            }
            updatedCount++;
          }
        }
      }
      db.prepare(`
        UPDATE user_piugame_sync SET last_recently_played_sync = datetime('now') WHERE user_id = ?
      `).run(req.user.id);
      const pumbilityGains = computePostPumbilityGains(baselineBestScores, upscoresFromRecent, newClearsFromRecent);
      const upscoreRowsWithGains = pumbilityGains.upscores;
      const clearRowsWithGains = pumbilityGains.clears;

      // Track upscores from recently played
      if (upscoreRowsWithGains.length > 0) {
        const upscoreInsert = db.prepare(`
          INSERT INTO user_upscores (user_id, upscores_json, pumbility_gain, singles_pumbility_gain, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(req.user.id, JSON.stringify(upscoreRowsWithGains), pumbilityGains.upscore_gain, pumbilityGains.singles_upscore_gain);
        upscorePostId = upscoreInsert.lastInsertRowid;
      }
      newClearPostId = insertGroupedNewClearPost(db, req.user.id, clearRowsWithGains, {
        pumbilityGain: pumbilityGains.clear_gain,
        singlesPumbilityGain: pumbilityGains.singles_clear_gain,
      });
    });
    txn();
    const progressAfterSync = updateUserSkillTitleFromBestScores(db, req.user.id);
    const newlyUnlockedTitles = getNewlyUnlockedTitles(progressBeforeSync, progressAfterSync);
    const titleUnlockPostId = insertTitleUnlockActivityPost(db, req.user.id, newlyUnlockedTitles);

    const profile = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    const actorUsername = profile?.username || 'Someone';
    const profileLink = buildProfilePath(profile?.username) || `/profile/${req.user.id}`;

    if (upscoresFromRecent.length > 0) {
      notifyActivitySubscribers(db, {
        actorUserId: req.user.id,
        actorUsername,
        activityType: 'upscores',
        notificationType: 'followed_user_upscore',
        title: 'New Upscores',
        message: `${actorUsername} posted ${upscoresFromRecent.length} new upscore${upscoresFromRecent.length === 1 ? '' : 's'}`,
        link: upscorePostId ? `/upscore/${upscorePostId}` : profileLink,
      });
    }

    if (newClearsFromRecent.length > 0) {
      notifyActivitySubscribers(db, {
        actorUserId: req.user.id,
        actorUsername,
        activityType: 'new_clears',
        notificationType: 'followed_user_new_clear',
        title: 'New Clears',
        message: `${actorUsername} posted ${newClearsFromRecent.length} new clear${newClearsFromRecent.length === 1 ? '' : 's'}`,
        link: newClearPostId ? `/clear/${newClearPostId}` : profileLink,
      });
    }

    if (newlyUnlockedTitles.length > 0) {
      const titleList = newlyUnlockedTitles.map((title) => title.name || title.skill_title).filter(Boolean);
      const titleSummary = titleList.length > 1 ? `${titleList[0]} +${titleList.length - 1}` : (titleList[0] || 'a new title');
      notifyActivitySubscribers(db, {
        actorUserId: req.user.id,
        actorUsername,
        activityType: 'new_clears',
        notificationType: 'followed_user_new_title',
        title: 'Title Earned',
        message: `${actorUsername} earned ${titleSummary}`,
        link: titleUnlockPostId ? `/clear/${titleUnlockPostId}` : profileLink,
      });
    }

    res.json({ success: true, plays_count: plays.length, scores_updated: updatedCount });
  } catch (err) {
    console.error('Recently played sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Data Retrieval (public) ────────────────────────────

// GET /api/piugame/pumbility/:userId — compute pumbility from local best scores
router.get('/pumbility/:userId', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.params.userId;
    const sync = db.prepare('SELECT pumbility_value, last_pumbility_sync, last_best_scores_sync, best_scores_imported FROM user_piugame_sync WHERE user_id = ?').get(userId);

    const bestScores = db.prepare(
      'SELECT song_title, mode, level, score, grade, background_url, over_top100_rank FROM user_best_scores WHERE user_id = ? AND score > 0'
    ).all(userId).filter((row) => isPassingScore(row.score, row.grade));

    const allRated = [];
    for (const s of bestScores) {
      const level = parseInt(s.level, 10) || 0;
      const base = LEVEL_BASE_POINTS[level];
      if (!base) continue;
      const score = parseInt(s.score, 10) || 0;
      if (score <= 0) continue;
      const grade = s.grade || gradeFromScore(score);
      const rating = calculateRatingPoints(level, grade, score);
      if (rating <= 0) continue;
      allRated.push({ ...s, score, grade, rating });
    }

    allRated.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.level !== a.level) return b.level - a.level;
      return b.score - a.score;
    });
    const top50 = allRated.slice(0, 50).map((s, i) => ({ ...s, rank_order: i + 1 }));
    const pumbilityValue = top50.reduce((sum, s) => sum + (parseInt(s.rating, 10) || 0), 0);

    const averageRating = top50.length > 0 ? Math.round((pumbilityValue / 50) * 10) / 10 : 0;

    let equivalentLevel = null;
    let equivalentGrade = null;
    let closestDiff = Infinity;
    const levels = Object.keys(LEVEL_BASE_POINTS).map(Number).sort((a, b) => a - b);
    const grades = Object.keys(GRADE_MULTIPLIER);
    for (const lvl of levels) {
      const base = LEVEL_BASE_POINTS[lvl];
      for (const g of grades) {
        const r = Math.round(base * GRADE_MULTIPLIER[g]);
        const diff = Math.abs(r - averageRating);
        if (diff < closestDiff) {
          closestDiff = diff;
          equivalentLevel = lvl;
          equivalentGrade = g;
        }
      }
    }

    const minEntryRating = top50.length >= 50 ? (parseInt(top50[top50.length - 1].rating, 10) || 0) : 0;
    let minEntryDetails = null;
    if (minEntryRating > 0 && top50.length >= 50) {
      const me = top50[top50.length - 1];
      minEntryDetails = {
        rating: minEntryRating,
        song_title: me.song_title,
        mode: me.mode,
        level: me.level,
        score: me.score,
        grade: me.grade,
      };
    }

    try {
      await refreshPumbilityLeaderboardCache(db, { maxAgeMinutes: 60 });
    } catch (err) {
      console.error('Pumbility leaderboard refresh error:', err.message);
    }

    const meta = db.prepare('SELECT threshold FROM pumbility_leaderboard_meta WHERE id = 1').get();
    const threshold = parseInt(meta?.threshold, 10) || 0;
    const officialPumbility = parseInt(sync?.pumbility_value, 10) || 0;

    let ranking = null;

    let linkedPiugameUsername = '';
    try {
      linkedPiugameUsername = getLinkedPiugameUsername(userId);
    } catch (err) {
      linkedPiugameUsername = '';
    }
    if (linkedPiugameUsername) {
      const linkedMatch = findLeaderboardRankByName(db, linkedPiugameUsername);
      if (linkedMatch) ranking = linkedMatch.rank;
    }

    if (!ranking) {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
      if (user?.username) {
        const localMatch = findLeaderboardRankByName(db, user.username);
        if (localMatch) ranking = localMatch.rank;
      }
    }

    res.json({
      pumbility_value: pumbilityValue,
      official_pumbility: officialPumbility,
      last_sync: sync?.last_pumbility_sync || null,
      scores: top50,
      average_rating: averageRating,
      equivalent_level: equivalentLevel,
      equivalent_grade: equivalentGrade,
      min_entry_rating: minEntryRating,
      min_entry_details: minEntryDetails,
      ranking,
      threshold,
    });
  } catch (err) {
    console.error('Pumbility data retrieval error:', err.message);
    res.status(500).json({ error: 'Failed to load pumbility data' });
  }
});

// GET /api/piugame/best-scores/:userId?mode=Single|Double
router.get('/best-scores/:userId', (req, res) => {
  const db = getDb();
  const { mode } = req.query;
  let scores;
  if (mode) {
    scores = db.prepare(
      'SELECT * FROM user_best_scores WHERE user_id = ? AND mode = ? ORDER BY level ASC, score DESC'
    ).all(req.params.userId, mode);
  } else {
    scores = db.prepare(
      'SELECT * FROM user_best_scores WHERE user_id = ? ORDER BY mode ASC, level ASC, score DESC'
    ).all(req.params.userId);
  }
  scores = scores.filter((row) => isPassingScore(row.score, row.grade));
  const sync = db.prepare('SELECT last_best_scores_sync, best_scores_imported FROM user_piugame_sync WHERE user_id = ?').get(req.params.userId);
  res.json({
    last_sync: sync?.last_best_scores_sync || null,
    imported: !!sync?.best_scores_imported,
    scores,
  });
});

// GET /api/piugame/recently-played/:userId
router.get('/recently-played/:userId', (req, res) => {
  const db = getDb();
  const plays = db.prepare(
    `SELECT
      p.*,
      COALESCE(s.make, '') AS shoe_make,
      COALESCE(s.model, '') AS shoe_model,
      COALESCE(s.colorway, '') AS shoe_colorway
    FROM user_recently_played p
    LEFT JOIN user_shoes s ON s.id = p.shoe_id
    WHERE p.user_id = ?
    ORDER BY p.id ASC`
  ).all(req.params.userId);
  const sync = db.prepare('SELECT last_recently_played_sync FROM user_piugame_sync WHERE user_id = ?').get(req.params.userId);
  res.json({
    last_sync: sync?.last_recently_played_sync || null,
    plays,
  });
});

// GET /api/piugame/titles/:userId
router.get('/titles/:userId', (req, res) => {
  const db = getDb();
  const progress = getUserTitleProgress(db, req.params.userId);
  res.json(progress);
});

// GET /api/piugame/sync-status/:userId
router.get('/sync-status/:userId', (req, res) => {
  const db = getDb();
  const sync = db.prepare('SELECT * FROM user_piugame_sync WHERE user_id = ?').get(req.params.userId);
  const hasCreds = !!db.prepare('SELECT 1 FROM user_piugame_credentials WHERE user_id = ?').get(req.params.userId);

  // Highest clears for Singles and Doubles (pass-only best scores).
  let highest_single = null;
  let highest_double = null;
  try {
    const passBest = db.prepare(
      'SELECT mode, level, score, grade FROM user_best_scores WHERE user_id = ?'
    ).all(req.params.userId).filter((row) => isPassingScore(row.score, row.grade));

    for (const row of passBest) {
      const level = parseInt(row.level, 10) || 0;
      if (String(row.mode || '') === 'Single') {
        highest_single = highest_single === null ? level : Math.max(highest_single, level);
      } else if (String(row.mode || '') === 'Double') {
        highest_double = highest_double === null ? level : Math.max(highest_double, level);
      }
    }
  } catch {}

  res.json({
    linked: hasCreds,
    highest_single,
    highest_double,
    ...(sync || { best_scores_imported: 0, pumbility_value: 0, last_best_scores_sync: null, last_pumbility_sync: null, last_recently_played_sync: null, sync_in_progress: '', sync_progress: 0, sync_total: 0 }),
  });
});

// ─── Pumbility Leaderboard ──────────────────────────────

// POST /api/piugame/sync/pumbility-ranking — scrape the public leaderboard (no login required)
router.post('/sync/pumbility-ranking', requireAuth, async (req, res) => {
  try {
    const force = parseBoolean(req.query?.force ?? req.body?.force) === true;
    const refreshed = await runPumbilityRankingSyncNow({
      force,
      reason: 'manual-endpoint',
    });
    res.json({
      success: true,
      entries: refreshed.total_entries || 0,
      threshold: refreshed.threshold || 0,
      last_sync: refreshed.last_sync || null,
      cached: !!refreshed.cached,
      duration_ms: Math.max(0, parseInt(refreshed.duration_ms, 10) || 0),
    });
  } catch (err) {
    console.error('Pumbility ranking sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/piugame/pumbility-ranking — get cached leaderboard data
router.get('/pumbility-ranking', (req, res) => {
  const db = getDb();
  const meta = db.prepare('SELECT * FROM pumbility_leaderboard_meta WHERE id = 1').get();
  const rankings = db.prepare('SELECT * FROM pumbility_leaderboard ORDER BY rank ASC').all();
  res.json({
    threshold: meta?.threshold || 0,
    total_entries: meta?.total_entries || 0,
    last_sync: meta?.last_sync || null,
    rankings,
  });
});

// ─── Over Lv.20 Ranking Cache ───────────────────────────

// POST /api/piugame/sync/over-ranking — scrape public OVER Lv.20 top-100 chart rankings
router.post('/sync/over-ranking', requireAuth, async (req, res) => {
  try {
    const force = parseBoolean(req.query?.force ?? req.body?.force) === true;
    const backfillOnly = parseBoolean(req.query?.backfill_only ?? req.body?.backfill_only) === true;
    const refreshed = await runOverRankingSyncNow({
      force: backfillOnly ? false : force,
      backfillOnly,
      reason: 'manual-endpoint',
    });
    res.json({
      success: true,
      charts: refreshed.total_charts || 0,
      entries: refreshed.total_entries || 0,
      source_pages: refreshed.source_pages || 0,
      last_sync: refreshed.last_sync || null,
      backfill: refreshed.backfill || null,
      duration_ms: Math.max(0, parseInt(refreshed.duration_ms, 10) || 0),
      backfill_duration_ms: Math.max(0, parseInt(refreshed.backfill_duration_ms, 10) || 0),
      cached: !!refreshed.cached,
      backfill_only: !!refreshed.backfill_only,
    });
  } catch (err) {
    console.error('Over ranking sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/piugame/over-ranking/meta — inspect OVER Lv.20 ranking cache freshness
router.get('/over-ranking/meta', (req, res) => {
  const db = getDb();
  const meta = db.prepare(`
    SELECT total_charts, total_entries, source_pages, last_sync
    FROM over_level_ranking_meta
    WHERE id = 1
  `).get();
  res.json({
    total_charts: parseInt(meta?.total_charts, 10) || 0,
    total_entries: parseInt(meta?.total_entries, 10) || 0,
    source_pages: parseInt(meta?.source_pages, 10) || 0,
    last_sync: meta?.last_sync || null,
  });
});

// GET /api/piugame/admin/over-ranking/scheduler — inspect nightly scheduler status
router.get('/admin/over-ranking/scheduler', requireAuth, requireAdmin, (req, res) => {
  res.json(getOverRankingNightlyStatus());
});

// GET /api/piugame/admin/pumbility-ranking/scheduler — inspect nightly scheduler status
router.get('/admin/pumbility-ranking/scheduler', requireAuth, requireAdmin, (req, res) => {
  res.json(getPumbilityRankingNightlyStatus());
});

// GET /api/piugame/admin/over-ranking/runs — paginated sync/backfill run history
router.get('/admin/over-ranking/runs', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const runTypeRaw = String(req.query?.type || '').trim().toLowerCase();
  const runType = ['sync', 'backfill', 'pumbility'].includes(runTypeRaw) ? runTypeRaw : '';

  const rawLimit = parseInt(req.query?.limit, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  const rawPage = parseInt(req.query?.page, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const offset = (page - 1) * limit;

  const countSql = runType
    ? 'SELECT COUNT(*) AS total FROM over_level_sync_runs WHERE run_type = ?'
    : 'SELECT COUNT(*) AS total FROM over_level_sync_runs';
  const rowsSql = `
    SELECT
      id, run_type, status, trigger_reason, force_flag, started_at, completed_at, duration_ms,
      charts, entries, source_pages,
      backfill_total_checked, backfill_total_updated,
      backfill_best_scores_updated, backfill_pumbility_scores_updated, backfill_recent_scores_updated,
      error_message
    FROM over_level_sync_runs
    ${runType ? 'WHERE run_type = ?' : ''}
    ORDER BY datetime(started_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `;

  const totalRow = runType
    ? db.prepare(countSql).get(runType)
    : db.prepare(countSql).get();
  const total = parseInt(totalRow?.total, 10) || 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

  const rows = runType
    ? db.prepare(rowsSql).all(runType, limit, offset)
    : db.prepare(rowsSql).all(limit, offset);

  res.json({
    run_type: runType || 'all',
    page,
    limit,
    total,
    total_pages: totalPages,
    rows: rows.map((row) => ({
      id: parseInt(row.id, 10) || 0,
      run_type: normalizeOverRunType(row.run_type),
      status: normalizeOverRunStatus(row.status),
      trigger_reason: String(row.trigger_reason || ''),
      force_flag: parseInt(row.force_flag, 10) === 1,
      started_at: row.started_at || null,
      completed_at: row.completed_at || null,
      duration_ms: Math.max(0, parseInt(row.duration_ms, 10) || 0),
      charts: Math.max(0, parseInt(row.charts, 10) || 0),
      entries: Math.max(0, parseInt(row.entries, 10) || 0),
      source_pages: Math.max(0, parseInt(row.source_pages, 10) || 0),
      backfill_total_checked: Math.max(0, parseInt(row.backfill_total_checked, 10) || 0),
      backfill_total_updated: Math.max(0, parseInt(row.backfill_total_updated, 10) || 0),
      backfill_best_scores_updated: Math.max(0, parseInt(row.backfill_best_scores_updated, 10) || 0),
      backfill_pumbility_scores_updated: Math.max(0, parseInt(row.backfill_pumbility_scores_updated, 10) || 0),
      backfill_recent_scores_updated: Math.max(0, parseInt(row.backfill_recent_scores_updated, 10) || 0),
      error_message: String(row.error_message || ''),
    })),
  });
});

// GET /api/piugame/leaderboards/pumbility — PIUGAME global top 1000 (with local enrichment when available)
router.get('/leaderboards/pumbility', requireAuth, (req, res) => {
  const db = getDb();
  const metricRaw = String(req.query?.metric || 'overall').trim().toLowerCase();
  const metric = metricRaw === 'singles' ? 'singles' : 'overall';
  const sortByRaw = String(req.query?.sort_by || 'pumbility').trim().toLowerCase();
  const sortBy = ['pumbility', 'avg_grade', 'avg_level', 'competitive_level'].includes(sortByRaw)
    ? sortByRaw
    : 'pumbility';
  const sortOrderRaw = String(req.query?.sort_order || 'desc').trim().toLowerCase();
  const sortOrder = sortOrderRaw === 'asc' ? 'asc' : 'desc';

  const rawLimit = parseInt(req.query?.limit, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 100;
  const rawPage = parseInt(req.query?.page, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const offset = (page - 1) * limit;

  const globalRows = db.prepare(`
    SELECT rank, player_name, pumbility, avatar_url
    FROM pumbility_leaderboard
    WHERE rank BETWEEN 1 AND 1000
    ORDER BY rank ASC
  `).all();

  const localRows = buildGlobalPumbilityLeaderboardRows(db);
  const localByName = new Map();
  for (const row of localRows) {
    const nameKey = normalizeLeaderboardNameKey(row?.username);
    if (!nameKey || localByName.has(nameKey)) continue;
    localByName.set(nameKey, row);
  }

  const rows = globalRows.map((row) => {
    const globalRank = parseInt(row.rank, 10) || 0;
    const username = String(row.player_name || '').replace(/\s+/g, ' ').trim() || 'Unknown';
    const nameKey = normalizeLeaderboardNameKey(username);
    const local = localByName.get(nameKey) || null;
    const piugameAvatar = mapPiugameAvatarToLocal(row.avatar_url);
    const localAvatar = String(local?.avatar || '').trim();
    return {
      user_id: local?.user_id || '',
      username,
      avatar: localAvatar || piugameAvatar || '',
      local_avatar: localAvatar,
      piugame_avatar: piugameAvatar,
      piugame_avatar_url: String(row.avatar_url || '').trim(),
      nationality: local?.nationality || '',
      is_local_user: !!(local?.user_id),
      global_rank: globalRank,
      overall_pumbility: parseInt(row.pumbility, 10) || 0,
      singles_pumbility: parseInt(local?.singles_pumbility, 10) || 0,
      overall_average_grade: local?.overall_average_grade || '--',
      overall_average_level: Number(local?.overall_average_level) || 0,
      singles_average_grade: local?.singles_average_grade || '--',
      singles_average_level: Number(local?.singles_average_level) || 0,
      singles_competitive_level: parseInt(local?.singles_competitive_level, 10) || 0,
      doubles_competitive_level: parseInt(local?.doubles_competitive_level, 10) || 0,
      competitive_level: parseInt(local?.competitive_level, 10) || 0,
      competitive_mode: String(local?.competitive_mode || ''),
      overall_breakdown_count: parseInt(local?.overall_breakdown_count, 10) || 0,
      singles_breakdown_count: parseInt(local?.singles_breakdown_count, 10) || 0,
    };
  });

  const sorted = [...rows].sort((a, b) => {
    const metricA = metric === 'singles'
      ? {
        pumbility: parseInt(a?.singles_pumbility, 10) || 0,
        average_grade: a?.singles_average_grade || '--',
        average_level: Number(a?.singles_average_level) || 0,
      }
      : {
        pumbility: parseInt(a?.overall_pumbility, 10) || 0,
        average_grade: a?.overall_average_grade || '--',
        average_level: Number(a?.overall_average_level) || 0,
      };

    const metricB = metric === 'singles'
      ? {
        pumbility: parseInt(b?.singles_pumbility, 10) || 0,
        average_grade: b?.singles_average_grade || '--',
        average_level: Number(b?.singles_average_level) || 0,
      }
      : {
        pumbility: parseInt(b?.overall_pumbility, 10) || 0,
        average_grade: b?.overall_average_grade || '--',
        average_level: Number(b?.overall_average_level) || 0,
      };

    let comparison = 0;
    if (sortBy === 'avg_grade') {
      comparison = getLeaderboardGradeSortValue(metricA.average_grade) - getLeaderboardGradeSortValue(metricB.average_grade);
    } else if (sortBy === 'avg_level') {
      comparison = metricA.average_level - metricB.average_level;
    } else if (sortBy === 'competitive_level') {
      comparison = (parseInt(a?.competitive_level, 10) || 0) - (parseInt(b?.competitive_level, 10) || 0);
    } else {
      comparison = metricA.pumbility - metricB.pumbility;
    }

    if (comparison !== 0) return sortOrder === 'asc' ? comparison : -comparison;

    const globalRankA = parseInt(a?.global_rank, 10) || Number.MAX_SAFE_INTEGER;
    const globalRankB = parseInt(b?.global_rank, 10) || Number.MAX_SAFE_INTEGER;
    if (globalRankA !== globalRankB) return globalRankA - globalRankB;

    return String(a?.username || '').localeCompare(String(b?.username || ''), undefined, { sensitivity: 'base' });
  });

  const capped = sorted.slice(0, 1000);
  const total = capped.length;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
  const pagedRows = capped.slice(offset, offset + limit).map((row, idx) => ({
    rank: offset + idx + 1,
    ...row,
  }));

  res.json({
    metric,
    sort_by: sortBy,
    sort_order: sortOrder,
    page,
    limit,
    total,
    total_pages: totalPages,
    rows: pagedRows,
    source: 'piugame_global',
  });
});

// GET /api/piugame/leaderboards/pumbility/player-sheet?player_name=...&user_id=...
// Returns a player's pumbility top-song sheet. Local users use full best-scores data;
// non-local users get inferred partial data from OVER Lv.20+ cached top 100 rows.
router.get('/leaderboards/pumbility/player-sheet', requireAuth, (req, res) => {
  const db = getDb();
  const requestedName = String(req.query?.player_name || '').replace(/\s+/g, ' ').trim();
  const requestedUserId = String(req.query?.user_id || '').trim();
  if (!requestedName && !requestedUserId) {
    return res.status(400).json({ error: 'player_name or user_id is required' });
  }

  let localUser = null;
  if (requestedUserId) {
    localUser = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(requestedUserId) || null;
  }
  if (!localUser && requestedName) {
    localUser = db.prepare('SELECT id, username, avatar FROM users WHERE LOWER(TRIM(username)) = ? LIMIT 1')
      .get(normalizeLeaderboardNameKey(requestedName)) || null;
  }

  const resolvedUserId = String(localUser?.id || '').trim();
  const resolvedName = String(localUser?.username || requestedName || '').replace(/\s+/g, ' ').trim();
  if (!resolvedName) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const globalRow = db.prepare(`
    SELECT rank, player_name, pumbility, avatar_url
    FROM pumbility_leaderboard
    WHERE LOWER(TRIM(player_name)) = ?
    ORDER BY rank ASC
    LIMIT 1
  `).get(normalizeLeaderboardNameKey(resolvedName));

  const normalizedName = normalizeLeaderboardNameKey(globalRow?.player_name || resolvedName);
  let rows = [];
  let source = '';
  let incomplete = true;
  let totalAvailableScores = 0;
  let scoreSourceCount = 0;

  if (resolvedUserId) {
    const localScoreRows = db.prepare(`
      SELECT bs.song_title, bs.mode, bs.level, bs.score, bs.grade, bs.background_url,
             COALESCE(s.artist, '') AS artist,
             COALESCE(s.jacket_url, '') AS song_jacket_url
      FROM user_best_scores bs
      LEFT JOIN songs s ON s.title = bs.song_title AND s.mode = bs.mode AND s.level = bs.level
      WHERE bs.user_id = ? AND bs.score > 0
    `).all(resolvedUserId);

    const rated = [];
    for (const scoreRow of localScoreRows) {
      const score = parseInt(scoreRow?.score, 10) || 0;
      const level = parseInt(scoreRow?.level, 10) || 0;
      const mode = String(scoreRow?.mode || '').trim();
      if (mode !== 'Single' && mode !== 'Double') continue;
      if (!isPassingScore(score, scoreRow?.grade)) continue;
      const grade = normalizeGrade(scoreRow?.grade || gradeFromScore(score));
      const rating = getChartRatingPoints(score, grade, level);
      if (rating <= 0) continue;
      rated.push({
        chart_id: chartScoreKey(scoreRow?.song_title, mode, level),
        title: String(scoreRow?.song_title || '').trim(),
        artist: String(scoreRow?.artist || '').trim(),
        mode,
        level,
        score,
        grade,
        rating,
        jacket_url: String(scoreRow?.song_jacket_url || scoreRow?.background_url || '').trim(),
      });
    }

    rated.sort(compareRatedPumbilityEntries);
    scoreSourceCount = rated.length;
    totalAvailableScores = rated.length;
    rows = rated.slice(0, 50);
    source = 'user_best_scores';

    const syncRow = db.prepare('SELECT best_scores_imported FROM user_piugame_sync WHERE user_id = ?').get(resolvedUserId);
    incomplete = parseInt(syncRow?.best_scores_imported, 10) !== 1;
  }

  if (!rows.length) {
    let overRows = db.prepare(`
      SELECT r.chart_key, r.rank, r.score, r.grade, r.played_at, r.player_name, r.player_avatar_url,
             c.song_title, c.mode, c.level, c.jacket_url,
             COALESCE(s.artist, '') AS artist
      FROM over_level_ranking_scores r
      JOIN over_level_rankings c ON c.chart_key = r.chart_key
      LEFT JOIN songs s ON s.title = c.song_title AND s.mode = c.mode AND s.level = c.level
      WHERE c.level >= 20
        AND r.score > 0
        AND r.player_name = ? COLLATE NOCASE
      ORDER BY c.chart_key ASC, r.rank ASC
    `).all(globalRow?.player_name || resolvedName);

    if (!overRows.length) {
      overRows = db.prepare(`
        SELECT r.chart_key, r.rank, r.score, r.grade, r.played_at, r.player_name, r.player_avatar_url,
               c.song_title, c.mode, c.level, c.jacket_url,
               COALESCE(s.artist, '') AS artist
        FROM over_level_ranking_scores r
        JOIN over_level_rankings c ON c.chart_key = r.chart_key
        LEFT JOIN songs s ON s.title = c.song_title AND s.mode = c.mode AND s.level = c.level
        WHERE c.level >= 20
          AND r.score > 0
          AND LOWER(TRIM(r.player_name)) = ?
        ORDER BY c.chart_key ASC, r.rank ASC
      `).all(normalizedName);
    }

    const bestByChart = new Map();
    for (const overRow of overRows) {
      const chartKey = String(overRow?.chart_key || '').trim();
      if (!chartKey) continue;
      const candidate = {
        rank: parseInt(overRow?.rank, 10) || 0,
        score: parseInt(overRow?.score, 10) || 0,
        grade: String(overRow?.grade || '').trim(),
        player_name: String(overRow?.player_name || '').trim(),
        played_at: String(overRow?.played_at || '').trim(),
        title: String(overRow?.song_title || '').trim(),
        artist: String(overRow?.artist || '').trim(),
        mode: String(overRow?.mode || '').trim(),
        level: parseInt(overRow?.level, 10) || 0,
        jacket_url: String(overRow?.jacket_url || '').trim(),
      };
      const existing = bestByChart.get(chartKey);
      if (!existing || compareOverRankingRows(candidate, existing) < 0) {
        bestByChart.set(chartKey, candidate);
      }
    }

    const rated = [];
    for (const [chartKey, row] of bestByChart.entries()) {
      const score = parseInt(row?.score, 10) || 0;
      const level = parseInt(row?.level, 10) || 0;
      const mode = String(row?.mode || '').trim();
      if (mode !== 'Single' && mode !== 'Double') continue;
      if (!isPassingScore(score, row?.grade)) continue;
      const grade = normalizeGrade(row?.grade || gradeFromScore(score));
      const rating = getChartRatingPoints(score, grade, level);
      if (rating <= 0) continue;
      rated.push({
        chart_id: chartKey,
        title: String(row?.title || '').trim(),
        artist: String(row?.artist || '').trim(),
        mode,
        level,
        score,
        grade,
        rating,
        jacket_url: String(row?.jacket_url || '').trim(),
      });
    }

    rated.sort(compareRatedPumbilityEntries);
    scoreSourceCount = rated.length;
    totalAvailableScores = rated.length;
    rows = rated.slice(0, 50);
    source = 'over20_top100_cache';
    incomplete = true;
  }

  const localAvatar = String(localUser?.avatar || '').trim();
  const piugameAvatar = mapPiugameAvatarToLocal(globalRow?.avatar_url);

  res.json({
    player_name: String(globalRow?.player_name || resolvedName).trim(),
    user_id: resolvedUserId,
    is_local_user: !!resolvedUserId,
    avatar: localAvatar || piugameAvatar || '',
    global_rank: parseInt(globalRow?.rank, 10) || 0,
    global_pumbility: parseInt(globalRow?.pumbility, 10) || 0,
    source: source || 'over20_top100_cache',
    incomplete: !!incomplete,
    total_available_scores: Math.max(0, parseInt(totalAvailableScores, 10) || 0),
    source_scores_count: Math.max(0, parseInt(scoreSourceCount, 10) || 0),
    rows: (Array.isArray(rows) ? rows : []).map((row) => ({
      chart_id: String(row?.chart_id || ''),
      title: String(row?.title || ''),
      artist: String(row?.artist || ''),
      mode: String(row?.mode || ''),
      level: parseInt(row?.level, 10) || 0,
      score: Math.max(0, parseInt(row?.score, 10) || 0),
      grade: String(row?.grade || ''),
      rating: Math.max(0, parseInt(row?.rating, 10) || 0),
      jacket_url: String(row?.jacket_url || ''),
    })),
  });
});

// GET /api/piugame/leaderboards/over20/levels — available OVER Lv.20+ levels in cache
router.get('/leaderboards/over20/levels', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT level, COUNT(*) AS chart_count
    FROM over_level_rankings
    WHERE level >= 20
    GROUP BY level
    ORDER BY level ASC
  `).all();

  const levels = rows.map((row) => ({
    level: parseInt(row.level, 10) || 0,
    chart_count: parseInt(row.chart_count, 10) || 0,
  })).filter((row) => row.level > 0);

  res.json({
    levels,
    total_levels: levels.length,
    total_charts: levels.reduce((sum, row) => sum + (parseInt(row.chart_count, 10) || 0), 0),
  });
});

// GET /api/piugame/leaderboards/over20/charts?level=20 — chart list for one OVER level
router.get('/leaderboards/over20/charts', requireAuth, (req, res) => {
  const db = getDb();
  const level = parseInt(req.query?.level, 10) || 0;
  if (level < 20) {
    return res.status(400).json({ error: 'level is required and must be 20 or higher' });
  }

  const modeRaw = String(req.query?.mode || '').trim().toLowerCase();
  const mode = modeRaw === 'single' ? 'Single' : modeRaw === 'double' ? 'Double' : '';

  const chartsSql = `
    SELECT chart_key, song_title, mode, level, jacket_url, source_no, top100_count, min_score, last_sync
    FROM over_level_rankings
    WHERE level = ? AND level >= 20
    ${mode ? 'AND mode = ?' : ''}
    ORDER BY song_title COLLATE NOCASE ASC,
      CASE mode WHEN 'Single' THEN 0 WHEN 'Double' THEN 1 ELSE 2 END ASC,
      chart_key ASC
  `;

  const charts = mode
    ? db.prepare(chartsSql).all(level, mode)
    : db.prepare(chartsSql).all(level);

  res.json({
    level,
    mode: mode || 'all',
    total_charts: charts.length,
    charts: charts.map((row) => ({
      chart_key: String(row.chart_key || ''),
      song_title: String(row.song_title || ''),
      mode: String(row.mode || ''),
      level: parseInt(row.level, 10) || 0,
      jacket_url: String(row.jacket_url || ''),
      source_no: String(row.source_no || ''),
      top100_count: Math.max(0, parseInt(row.top100_count, 10) || 0),
      min_score: Math.max(0, parseInt(row.min_score, 10) || 0),
      last_sync: row.last_sync || null,
    })),
  });
});

// GET /api/piugame/leaderboards/over20/chart?chart_key=... — top 100 rows for a specific chart
router.get('/leaderboards/over20/chart', requireAuth, (req, res) => {
  const db = getDb();
  const chartKey = String(req.query?.chart_key || '').trim();
  if (!chartKey) {
    return res.status(400).json({ error: 'chart_key is required' });
  }

  const chart = db.prepare(`
    SELECT chart_key, song_title, mode, level, jacket_url, source_no, top100_count, min_score, last_sync
    FROM over_level_rankings
    WHERE chart_key = ? AND level >= 20
  `).get(chartKey);
  if (!chart) {
    return res.status(404).json({ error: 'Chart not found in OVER ranking cache' });
  }

  const scores = db.prepare(`
    SELECT rank, score, grade, player_name, player_avatar_url, played_at
    FROM over_level_ranking_scores
    WHERE chart_key = ?
    ORDER BY rank ASC
  `).all(chartKey);

  const normalizedScores = assignSharedScoreRanks(
    scores
      .map((row) => ({
        rank: parseInt(row.rank, 10) || 0,
        score: parseInt(row.score, 10) || 0,
        grade: String(row.grade || ''),
        player_name: String(row.player_name || ''),
        player_avatar_url: String(row.player_avatar_url || ''),
        played_at: String(row.played_at || ''),
      }))
      .filter((row) => row.score > 0)
      .sort(compareOverRankingRows)
      .slice(0, 100)
  );

  const localUsersByName = buildLocalUsersByNormalizedName(
    db,
    normalizedScores.map((row) => row.player_name)
  );

  res.json({
    chart: {
      chart_key: String(chart.chart_key || ''),
      song_title: String(chart.song_title || ''),
      mode: String(chart.mode || ''),
      level: parseInt(chart.level, 10) || 0,
      jacket_url: String(chart.jacket_url || ''),
      source_no: String(chart.source_no || ''),
      top100_count: Math.max(0, parseInt(chart.top100_count, 10) || 0),
      min_score: Math.max(0, parseInt(chart.min_score, 10) || 0),
      last_sync: chart.last_sync || null,
    },
    total_scores: normalizedScores.length,
    scores: normalizedScores.map((row) => {
      const playerName = String(row.player_name || '').trim();
      const localUser = localUsersByName.get(normalizeLeaderboardNameKey(playerName)) || null;
      const localAvatar = String(localUser?.avatar || '').trim();
      const piugameAvatar = mapPiugameAvatarToLocal(row.player_avatar_url);
      return {
        rank: Math.max(0, parseInt(row.rank, 10) || 0),
        score: Math.max(0, parseInt(row.score, 10) || 0),
        grade: String(row.grade || ''),
        player_name: playerName,
        player_avatar: localAvatar || piugameAvatar || '',
        player_avatar_url: String(row.player_avatar_url || ''),
        local_avatar: localAvatar,
        piugame_avatar: piugameAvatar,
        is_local_user: !!localUser?.user_id,
        played_at: String(row.played_at || ''),
      };
    }),
  });
});

// GET /api/piugame/leaderboards/my-top100-scores — current user's stored top 100 chart scores
router.get('/leaderboards/my-top100-scores', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const rawLimit = parseInt(req.query?.limit, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
  const rawPage = parseInt(req.query?.page, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const offset = (page - 1) * limit;

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM user_best_scores
    WHERE user_id = ? AND score > 0 AND over_top100_rank BETWEEN 1 AND 100
  `).get(userId);
  const total = parseInt(totalRow?.total, 10) || 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

  const scoreRows = db.prepare(`
    SELECT id, song_title, mode, level, score, grade, background_url, over_top100_rank
    FROM user_best_scores
    WHERE user_id = ? AND score > 0 AND over_top100_rank BETWEEN 1 AND 100
    ORDER BY over_top100_rank ASC, level DESC, score DESC, song_title COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);

  const chartRows = db.prepare(`
    SELECT chart_key, jacket_url, top100_count
    FROM over_level_rankings
  `).all();
  const chartLookup = new Map();
  for (const chart of chartRows) {
    const key = String(chart.chart_key || '').trim();
    if (!key) continue;
    chartLookup.set(key, {
      jacket_url: String(chart.jacket_url || ''),
      top100_count: Math.max(0, parseInt(chart.top100_count, 10) || 0),
    });
  }

  const rows = scoreRows.map((row) => {
    const chartKey = overRankingChartKey(row.song_title, row.mode, row.level);
    const chart = chartLookup.get(chartKey) || null;
    return {
      id: parseInt(row.id, 10) || 0,
      song_title: String(row.song_title || ''),
      mode: String(row.mode || ''),
      level: parseInt(row.level, 10) || 0,
      score: Math.max(0, parseInt(row.score, 10) || 0),
      grade: String(row.grade || ''),
      player_name: String(req.user?.username || ''),
      over_top100_rank: Math.max(0, parseInt(row.over_top100_rank, 10) || 0),
      top100_count: chart?.top100_count || 100,
      jacket_url: chart?.jacket_url || String(row.background_url || ''),
      chart_key: chartKey,
    };
  });

  res.json({
    page,
    limit,
    total,
    total_pages: totalPages,
    rows,
  });
});

// GET /api/piugame/pumbility-recommendations/:userId — smart recommendations
router.get('/pumbility-recommendations/:userId', (req, res) => {
  const db = getDb();
  const userId = req.params.userId;
  const { metric, modeFilter } = normalizeRecommendationMetric(req.query.metric, req.query.mode);

  const bestScores = db.prepare(
    'SELECT song_title, mode, level, score, grade, background_url FROM user_best_scores WHERE user_id = ? AND score > 0 ORDER BY level DESC, score DESC'
  ).all(userId).filter((row) => isPassingScore(row.score, row.grade));
  const payload = buildPumbilityRecommendations(bestScores, { metric, modeFilter });
  res.json(payload);
});

router.startOverRankingNightlyScheduler = startOverRankingNightlyScheduler;
router.startPumbilityRankingNightlyScheduler = startPumbilityRankingNightlyScheduler;
router.runOverRankingSyncNow = runOverRankingSyncNow;
router.runPumbilityRankingSyncNow = runPumbilityRankingSyncNow;

module.exports = router;

const LEVEL_BASE_POINTS = {
  10: 100,
  11: 110,
  12: 130,
  13: 160,
  14: 200,
  15: 250,
  16: 310,
  17: 380,
  18: 460,
  19: 550,
  20: 650,
  21: 760,
  22: 880,
  23: 1010,
  24: 1150,
  25: 1300,
  26: 1460,
  27: 1630,
  28: 1810,
};

const GRADE_MULTIPLIER = {
  F: 0.40,
  D: 0.50,
  C: 0.60,
  B: 0.70,
  A: 0.80,
  'A+': 0.90,
  AA: 1.00,
  'AA+': 1.05,
  AAA: 1.10,
  'AAA+': 1.15,
  S: 1.20,
  'S+': 1.26,
  SS: 1.32,
  'SS+': 1.38,
  SSS: 1.44,
  'SSS+': 1.50,
};

const SCORE_TO_GRADE = [
  { min: 995000, grade: 'SSS+' },
  { min: 990000, grade: 'SSS' },
  { min: 985000, grade: 'SS+' },
  { min: 980000, grade: 'SS' },
  { min: 975000, grade: 'S+' },
  { min: 970000, grade: 'S' },
  { min: 960000, grade: 'AAA+' },
  { min: 950000, grade: 'AAA' },
  { min: 925000, grade: 'AA+' },
  { min: 900000, grade: 'AA' },
  { min: 825000, grade: 'A+' },
  { min: 750000, grade: 'A' },
  { min: 650000, grade: 'B' },
  { min: 550000, grade: 'C' },
  { min: 450000, grade: 'D' },
  { min: 0, grade: 'F' },
];

function makeTitle(id, name, skillTitle, skillFamily, skillLevel, level, requiredPoints, tier) {
  return {
    id,
    name,
    skill_title: skillTitle,
    skill_family: skillFamily,
    skill_level: skillLevel,
    level,
    required_points: requiredPoints,
    tier,
  };
}

const TITLE_REQUIREMENTS = [
  makeTitle('beginner', 'Beginner', 'Beginner lvl. 1', 'Beginner', 1, 0, 0, 'beginner'),

  makeTitle('intermediate-1', 'Intermediate Lv.1', 'Intermediate lvl. 1', 'Intermediate', 1, 10, 2000, 'bronze'),
  makeTitle('intermediate-2', 'Intermediate Lv.2', 'Intermediate lvl. 2', 'Intermediate', 2, 11, 2200, 'bronze'),
  makeTitle('intermediate-3', 'Intermediate Lv.3', 'Intermediate lvl. 3', 'Intermediate', 3, 12, 2600, 'bronze'),
  makeTitle('intermediate-4', 'Intermediate Lv.4', 'Intermediate lvl. 4', 'Intermediate', 4, 13, 3200, 'bronze'),
  makeTitle('intermediate-5', 'Intermediate Lv.5', 'Intermediate lvl. 5', 'Intermediate', 5, 14, 4000, 'bronze'),
  makeTitle('intermediate-6', 'Intermediate Lv.6', 'Intermediate lvl. 6', 'Intermediate', 6, 15, 5000, 'bronze'),
  makeTitle('intermediate-7', 'Intermediate Lv.7', 'Intermediate lvl. 7', 'Intermediate', 7, 16, 6200, 'bronze'),
  makeTitle('intermediate-8', 'Intermediate Lv.8', 'Intermediate lvl. 8', 'Intermediate', 8, 17, 7600, 'bronze'),
  makeTitle('intermediate-9', 'Intermediate Lv.9', 'Intermediate lvl. 9', 'Intermediate', 9, 18, 9200, 'bronze'),
  makeTitle('intermediate-10', 'Intermediate Lv.10', 'Intermediate lvl. 10', 'Intermediate', 10, 19, 11000, 'bronze'),

  makeTitle('advanced-1', 'Advanced Lv.1', 'Advanced lvl. 1', 'Advanced', 1, 20, 13000, 'silver'),
  makeTitle('advanced-2', 'Advanced Lv.2', 'Advanced lvl. 2', 'Advanced', 2, 20, 26000, 'silver'),
  makeTitle('advanced-3', 'Advanced Lv.3', 'Advanced lvl. 3', 'Advanced', 3, 20, 39000, 'silver'),
  makeTitle('advanced-4', 'Advanced Lv.4', 'Advanced lvl. 4', 'Advanced', 4, 21, 15000, 'silver'),
  makeTitle('advanced-5', 'Advanced Lv.5', 'Advanced lvl. 5', 'Advanced', 5, 21, 30000, 'silver'),
  makeTitle('advanced-6', 'Advanced Lv.6', 'Advanced lvl. 6', 'Advanced', 6, 21, 45000, 'silver'),
  makeTitle('advanced-7', 'Advanced Lv.7', 'Advanced lvl. 7', 'Advanced', 7, 22, 17500, 'silver'),
  makeTitle('advanced-8', 'Advanced Lv.8', 'Advanced lvl. 8', 'Advanced', 8, 22, 35000, 'silver'),
  makeTitle('advanced-9', 'Advanced Lv.9', 'Advanced lvl. 9', 'Advanced', 9, 22, 52500, 'silver'),
  makeTitle('advanced-10', 'Advanced Lv.10', 'Advanced lvl. 10', 'Advanced', 10, 22, 70000, 'silver'),

  makeTitle('expert-1', 'Expert Lv.1', 'Expert lvl. 1', 'Expert', 1, 23, 40000, 'gold'),
  makeTitle('expert-2', 'Expert Lv.2', 'Expert lvl. 2', 'Expert', 2, 23, 80000, 'gold'),
  makeTitle('expert-3', 'Expert Lv.3', 'Expert lvl. 3', 'Expert', 3, 24, 30000, 'gold'),
  makeTitle('expert-4', 'Expert Lv.4', 'Expert lvl. 4', 'Expert', 4, 24, 60000, 'gold'),
  makeTitle('expert-5', 'Expert Lv.5', 'Expert lvl. 5', 'Expert', 5, 25, 20000, 'gold'),
  makeTitle('expert-6', 'Expert Lv.6', 'Expert lvl. 6', 'Expert', 6, 25, 40000, 'gold'),
  makeTitle('expert-7', 'Expert Lv.7', 'Expert lvl. 7', 'Expert', 7, 26, 13000, 'gold'),
  makeTitle('expert-8', 'Expert Lv.8', 'Expert lvl. 8', 'Expert', 8, 26, 26000, 'gold'),
  makeTitle('expert-9', 'Expert Lv.9', 'Expert lvl. 9', 'Expert', 9, 27, 3500, 'blue'),
  makeTitle('expert-10', 'Expert Lv.10', 'Expert lvl. 10', 'Expert', 10, 27, 7000, 'blue'),

  makeTitle('master', 'The Master', 'The Master', 'Master', 1, 28, 1900, 'blue'),
];

function normalizeGrade(grade) {
  const raw = String(grade || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  if (GRADE_MULTIPLIER[raw] !== undefined) return raw;

  const aliases = {
    AP: 'A+',
    AAP: 'AA+',
    AAAP: 'AAA+',
    SP: 'S+',
    SSP: 'SS+',
    SSSP: 'SSS+',
    A_P: 'A+',
    AA_P: 'AA+',
    AAA_P: 'AAA+',
    S_P: 'S+',
    SS_P: 'SS+',
    SSS_P: 'SSS+',
    STAGEBREAK: 'F',
    STAGE_BREAK: 'F',
  };
  if (aliases[raw]) return aliases[raw];
  if (raw.startsWith('X_')) return normalizeGrade(raw.slice(2));
  return '';
}

function gradeFromScore(score) {
  const numeric = parseInt(score, 10) || 0;
  for (const row of SCORE_TO_GRADE) {
    if (numeric >= row.min) return row.grade;
  }
  return 'F';
}

function calculateRatingPoints(level, grade, score) {
  const numericScore = parseInt(score, 10) || 0;
  if (numericScore <= 0) return 0;

  const base = LEVEL_BASE_POINTS[parseInt(level, 10)];
  if (!base) return 0;

  const normalized = normalizeGrade(grade) || gradeFromScore(numericScore);
  if (!normalized || normalized === 'F') return 0;

  const mult = GRADE_MULTIPLIER[normalized];
  if (!mult) return 0;
  return Math.round(base * mult);
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getLevelThresholds() {
  const byLevel = {};
  for (const title of TITLE_REQUIREMENTS) {
    if (title.level <= 0 || title.required_points <= 0) continue;
    if (!byLevel[title.level]) byLevel[title.level] = [];
    byLevel[title.level].push({
      title_id: title.id,
      title_name: title.name,
      required_points: title.required_points,
    });
  }

  for (const level of Object.keys(byLevel)) {
    byLevel[level].sort((a, b) => a.required_points - b.required_points);
  }
  return byLevel;
}

const TITLE_THRESHOLDS_BY_LEVEL = getLevelThresholds();

function aggregateLevelPoints(bestScores = []) {
  const pointsByLevel = {};
  for (const level of Object.keys(LEVEL_BASE_POINTS)) {
    pointsByLevel[level] = 0;
  }

  for (const row of (Array.isArray(bestScores) ? bestScores : [])) {
    const level = parseInt(row?.level, 10);
    if (!LEVEL_BASE_POINTS[level]) continue;
    const points = calculateRatingPoints(level, row?.grade, row?.score);
    if (points <= 0) continue;
    pointsByLevel[level] += points;
  }

  return pointsByLevel;
}

function buildTitleRows(pointsByLevel) {
  return TITLE_REQUIREMENTS.map((title, index) => {
    const earned = title.level > 0 ? (parseInt(pointsByLevel[title.level], 10) || 0) : 0;
    const required = title.required_points;
    const unlocked = required <= 0 ? true : earned >= required;
    const progressPercent = required > 0 ? round2(Math.min(100, (earned / required) * 100)) : 100;

    return {
      ...title,
      index,
      earned_points: earned,
      remaining_points: Math.max(0, required - earned),
      progress_percent: progressPercent,
      unlocked,
    };
  });
}

function computeSegmentProgressPercent(currentTitle, nextTitle, pointsByLevel) {
  if (!nextTitle) return 100;
  const nextLevelPoints = parseInt(pointsByLevel[nextTitle.level], 10) || 0;
  if (nextTitle.required_points <= 0) return 100;

  if (currentTitle && currentTitle.level === nextTitle.level) {
    const start = currentTitle.required_points || 0;
    const span = Math.max(1, nextTitle.required_points - start);
    return round2(Math.max(0, Math.min(100, ((nextLevelPoints - start) / span) * 100)));
  }

  return round2(Math.max(0, Math.min(100, (nextLevelPoints / nextTitle.required_points) * 100)));
}

function computeTitleProgressFromBestScores(bestScores = []) {
  const pointsByLevel = aggregateLevelPoints(bestScores);
  const titles = buildTitleRows(pointsByLevel);

  let currentIndex = 0;
  for (let i = 0; i < titles.length; i++) {
    if (titles[i].unlocked) currentIndex = i;
  }

  const currentTitle = titles[currentIndex] || titles[0];
  const nextTitle = titles[currentIndex + 1] || null;
  const segmentProgressPercent = computeSegmentProgressPercent(currentTitle, nextTitle, pointsByLevel);
  const totalPoints = Object.values(pointsByLevel).reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0);
  const unlockedCount = titles.filter((title) => title.unlocked).length;
  const nextLevelPoints = nextTitle ? (parseInt(pointsByLevel[nextTitle.level], 10) || 0) : 0;
  const remaining_points_to_next_title = nextTitle
    ? Math.max(0, (parseInt(nextTitle.required_points, 10) || 0) - nextLevelPoints)
    : 0;
  const aa_points_per_clear_for_next_level = nextTitle
    ? (LEVEL_BASE_POINTS[parseInt(nextTitle.level, 10)] || 0)
    : 0;
  const remaining_aa_clears_to_next_title = nextTitle && aa_points_per_clear_for_next_level > 0
    ? Math.ceil(remaining_points_to_next_title / aa_points_per_clear_for_next_level)
    : 0;

  const levels = Object.keys(LEVEL_BASE_POINTS)
    .map((key) => parseInt(key, 10))
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      points: parseInt(pointsByLevel[level], 10) || 0,
      aa_points_per_clear: LEVEL_BASE_POINTS[level] || 0,
      thresholds: TITLE_THRESHOLDS_BY_LEVEL[level] || [],
    }));

  return {
    titles,
    levels,
    summary: {
      current_index: currentIndex,
      current_title: currentTitle,
      next_title: nextTitle,
      unlocked_count: unlockedCount,
      total_titles: titles.length,
      segment_progress_percent: segmentProgressPercent,
      total_points: totalPoints,
      remaining_points_to_next_title,
      aa_points_per_clear_for_next_level,
      remaining_aa_clears_to_next_title,
    },
  };
}

function getUserBestScores(db, userId) {
  return db.prepare(`
    SELECT level, score, grade, mode
    FROM user_best_scores
    WHERE user_id = ? AND score > 0
  `).all(userId);
}

function getUserTitleProgress(db, userId) {
  const sync = db.prepare(`
    SELECT best_scores_imported, last_best_scores_sync
    FROM user_piugame_sync
    WHERE user_id = ?
  `).get(userId);

  const imported = !!sync?.best_scores_imported;
  const bestScores = imported ? getUserBestScores(db, userId) : [];
  const progress = computeTitleProgressFromBestScores(bestScores);

  return {
    imported,
    best_scores_count: bestScores.length,
    last_best_scores_sync: sync?.last_best_scores_sync || null,
    ...progress,
  };
}

function getPersistedSkillFromProgress(progress) {
  const currentTitle = progress?.summary?.current_title || TITLE_REQUIREMENTS[0];
  return {
    skill_title: currentTitle.skill_title,
    skill_level: currentTitle.skill_level,
  };
}

function updateUserSkillTitleFromBestScores(db, userId) {
  const progress = getUserTitleProgress(db, userId);
  if (!progress.imported) return progress;

  const current = getPersistedSkillFromProgress(progress);
  db.prepare(`
    UPDATE users
    SET skill_title = ?, skill_level = ?
    WHERE id = ?
  `).run(current.skill_title, current.skill_level, userId);

  return progress;
}

module.exports = {
  LEVEL_BASE_POINTS,
  GRADE_MULTIPLIER,
  TITLE_REQUIREMENTS,
  normalizeGrade,
  gradeFromScore,
  calculateRatingPoints,
  computeTitleProgressFromBestScores,
  getUserTitleProgress,
  updateUserSkillTitleFromBestScores,
};

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

const LEVEL_BASE_RATING = {
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

export function normalizeGrade(grade) {
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
  if (/^X(?:[_-]|$)/.test(raw)) return normalizeGrade(raw.replace(/^X[_-]?/, ''));
  return '';
}

export function gradeFromScore(score) {
  const s = parseInt(score, 10) || 0;
  for (const row of SCORE_TO_GRADE) {
    if (s >= row.min) return row.grade;
  }
  return 'F';
}

const EXTENDED_BASE_POINTS = {
  1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80, 9: 90,
  ...LEVEL_BASE_RATING,
};

export function calculatePlayLoad(level, rawGrade, score) {
  const numericLevel = parseInt(level, 10) || 0;
  const numericScore = parseInt(score, 10) || 0;
  const clampedLevel = Math.max(1, Math.min(28, numericLevel));
  const basePoints = EXTENDED_BASE_POINTS[clampedLevel] || 10;
  const grade = normalizeGrade(rawGrade) || (numericScore > 0 ? gradeFromScore(numericScore) : '') || 'F';
  if (grade === 'F') {
    if (numericScore > 0) return Math.round(basePoints * 0.20 * Math.max(0.1, Math.min(1.0, numericScore / 500000)));
    return Math.round(basePoints * 0.10);
  }
  const mult = GRADE_MULTIPLIER[grade];
  if (!mult) return Math.round(basePoints * 0.10);
  return Math.round(basePoints * mult);
}

export function calculateClearRating(level, grade, score) {
  const numericScore = parseInt(score, 10) || 0;
  if (numericScore <= 0) return 0;

  const base = LEVEL_BASE_RATING[parseInt(level, 10)];
  if (!base) return 0;

  const normalized = normalizeGrade(grade) || gradeFromScore(numericScore);
  if (!normalized || normalized === 'F') return 0;

  const mult = GRADE_MULTIPLIER[normalized];
  if (!mult) return 0;
  return Math.round(base * mult);
}

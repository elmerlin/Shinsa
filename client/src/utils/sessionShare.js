const GRADE_ORDER = [
  'F',
  'D',
  'C',
  'B',
  'A',
  'A+',
  'AA',
  'AA+',
  'AAA',
  'AAA+',
  'S',
  'S+',
  'SS',
  'SS+',
  'SSS',
  'SSS+',
];

const GRADE_RANK = GRADE_ORDER.reduce((acc, grade, index) => {
  acc[grade] = index;
  return acc;
}, {});

export const SHARE_MODE_OPTIONS = ['Single', 'Double', 'Both'];

export const SHARE_MIN_GRADE_OPTIONS = [
  { value: 'PASS', label: 'Pass' },
  { value: 'D', label: 'D' },
  { value: 'C', label: 'C' },
  { value: 'B', label: 'B' },
  { value: 'A', label: 'A' },
  { value: 'A+', label: 'A+' },
  { value: 'AA', label: 'AA' },
  { value: 'AA+', label: 'AA+' },
  { value: 'AAA', label: 'AAA' },
  { value: 'AAA+', label: 'AAA+' },
  { value: 'S', label: 'S' },
  { value: 'S+', label: 'S+' },
  { value: 'SS', label: 'SS' },
  { value: 'SS+', label: 'SS+' },
  { value: 'SSS', label: 'SSS' },
  { value: 'SSS+', label: 'SSS+' },
];

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function parsePlayedAt(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/[./]/g, '-');
  const ymd = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    const hh = parseInt(ymd[4] || '0', 10);
    const mm = parseInt(ymd[5] || '0', 10);
    const ss = parseInt(ymd[6] || '0', 10);
    return new Date(y, m, d, hh, mm, ss);
  }

  const ymdLoose = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdLoose) {
    const y = parseInt(ymdLoose[1], 10);
    const m = parseInt(ymdLoose[2], 10) - 1;
    const d = parseInt(ymdLoose[3], 10);
    const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))(?::(\d{2}))?\s*([APap][Mm])?/);
    let hh = parseInt(timeMatch?.[1] || '0', 10);
    const mm = parseInt(timeMatch?.[2] || '0', 10);
    const ss = parseInt(timeMatch?.[3] || '0', 10);
    const meridiem = String(timeMatch?.[4] || '').toUpperCase();
    if (meridiem === 'PM' && hh < 12) hh += 12;
    if (meridiem === 'AM' && hh === 12) hh = 0;
    return new Date(y, m, d, hh, mm, ss);
  }

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return direct;
  return null;
}

function normalizeSongKey(title) {
  return String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getJacketForPlay(play, jacketLookup = {}) {
  const norm = normalizeSongKey(play?.song_title);
  const exactKey = `${norm}|${play?.mode || ''}|${play?.level || ''}`;
  return jacketLookup?.[exactKey] || jacketLookup?.[norm] || '';
}

function formatDurationLabel(totalMinutes) {
  const minutes = Math.max(0, toInt(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

function normalizeGrade(rawGrade) {
  const raw = String(rawGrade || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  if (GRADE_RANK[raw] !== undefined) return raw;

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
  if (raw.startsWith('X_')) return 'F';
  return '';
}

function isFailGrade(rawGrade) {
  const raw = String(rawGrade || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return false;
  if (raw.startsWith('X_')) return true;
  return normalizeGrade(raw) === 'F';
}

export function getRankLabel(score) {
  const s = toInt(score);
  if (s >= 995000) return 'SSS+';
  if (s >= 990000) return 'SSS';
  if (s >= 985000) return 'SS+';
  if (s >= 980000) return 'SS';
  if (s >= 975000) return 'S+';
  if (s >= 970000) return 'S';
  if (s >= 960000) return 'AAA+';
  if (s >= 950000) return 'AAA';
  if (s >= 925000) return 'AA+';
  if (s >= 900000) return 'AA';
  if (s >= 825000) return 'A+';
  if (s >= 750000) return 'A';
  if (s >= 650000) return 'B';
  if (s >= 550000) return 'C';
  if (s >= 450000) return 'D';
  return 'F';
}

function resolvePlayGrade(play) {
  const normalized = normalizeGrade(play?.grade || '');
  if (normalized) return normalized;
  return getRankLabel(play?.score);
}

export function getShareMinGradeLabel(value) {
  const normalized = String(value || '').toUpperCase();
  return SHARE_MIN_GRADE_OPTIONS.find((option) => option.value === normalized)?.label || 'Pass';
}

function passesShareGradeFilter(play, minGrade) {
  const score = toInt(play?.score);
  const normalizedFilter = String(minGrade || 'PASS').toUpperCase();
  if (normalizedFilter === 'PASS') {
    return score > 0 && !isFailGrade(play?.grade || '');
  }

  const playGrade = resolvePlayGrade(play);
  const playRank = GRADE_RANK[playGrade] ?? -1;
  const minRank = GRADE_RANK[normalizedFilter] ?? 0;
  return score > 0 && playRank >= minRank;
}

export function getSessionLevelOptions(sessionRows) {
  const levels = new Set();
  const rows = Array.isArray(sessionRows) ? sessionRows : [];
  for (const play of rows) {
    const level = toInt(play?.level);
    if (level > 0) levels.add(level);
  }
  return Array.from(levels).sort((a, b) => a - b);
}

export function buildSessionShareCard(sessionRows, filters = {}, jacketLookup = {}) {
  const rows = Array.isArray(sessionRows) ? sessionRows : [];
  if (rows.length === 0) return null;

  const modeFilter = SHARE_MODE_OPTIONS.includes(filters.mode) ? filters.mode : 'Both';
  const minGrade = String(filters.minGrade || 'PASS').toUpperCase();
  const parsedMinLevel = toInt(filters.minLevel);
  const parsedMaxLevel = toInt(filters.maxLevel);
  const hasLevelRange = parsedMinLevel > 0 && parsedMaxLevel > 0;
  const minLevel = hasLevelRange ? Math.min(parsedMinLevel, parsedMaxLevel) : 0;
  const maxLevel = hasLevelRange ? Math.max(parsedMinLevel, parsedMaxLevel) : 0;

  const selectedRows = rows
    .filter((play) => {
      const mode = String(play?.mode || '').trim();
      if (modeFilter !== 'Both' && mode !== modeFilter) return false;

      const level = toInt(play?.level);
      if (hasLevelRange && (level < minLevel || level > maxLevel)) return false;

      return passesShareGradeFilter(play, minGrade);
    })
    .map((play) => {
      const playedAt = play?._playedAt || parsePlayedAt(play?.date_played);
      const score = toInt(play?.score);
      const perfect = toInt(play?.perfect);
      const great = toInt(play?.great);
      const good = toInt(play?.good);
      const bad = toInt(play?.bad);
      const miss = toInt(play?.miss);

      return {
        song_title: String(play?.song_title || ''),
        mode: String(play?.mode || ''),
        level: toInt(play?.level),
        score,
        grade: resolvePlayGrade(play),
        jacket_url: String(getJacketForPlay(play, jacketLookup) || ''),
        perfect,
        great,
        good,
        bad,
        miss,
        max_combo: toInt(play?.max_combo),
        date_played: String(play?.date_played || ''),
        _playedAtMs: playedAt ? playedAt.getTime() : null,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.level !== a.level) return b.level - a.level;
      if (b._playedAtMs !== null && a._playedAtMs !== null && b._playedAtMs !== a._playedAtMs) {
        return b._playedAtMs - a._playedAtMs;
      }
      return a.song_title.localeCompare(b.song_title);
    })
    .map((play) => ({
      song_title: play.song_title,
      mode: play.mode,
      level: play.level,
      score: play.score,
      grade: play.grade,
      jacket_url: play.jacket_url,
      perfect: play.perfect,
      great: play.great,
      good: play.good,
      bad: play.bad,
      miss: play.miss,
      max_combo: play.max_combo,
      date_played: play.date_played,
    }));

  if (selectedRows.length === 0) return null;

  let singleCount = 0;
  let doubleCount = 0;
  let otherCount = 0;
  let scoreTotal = 0;
  let scoredCount = 0;
  const judgmentTotals = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };

  for (const row of selectedRows) {
    if (row.mode === 'Single') singleCount += 1;
    else if (row.mode === 'Double') doubleCount += 1;
    else otherCount += 1;

    if (row.score > 0) {
      scoreTotal += row.score;
      scoredCount += 1;
    }

    judgmentTotals.perfect += row.perfect;
    judgmentTotals.great += row.great;
    judgmentTotals.good += row.good;
    judgmentTotals.bad += row.bad;
    judgmentTotals.miss += row.miss;
  }

  const newest = rows[0]?._playedAt || parsePlayedAt(rows[0]?.date_played);
  const oldest = rows[rows.length - 1]?._playedAt || parsePlayedAt(rows[rows.length - 1]?.date_played);
  const sessionDateLabel = newest
    ? newest.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Recent session';
  const sessionTimeRange = newest && oldest
    ? `${oldest.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${newest.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  const sessionDurationMinutes = newest && oldest
    ? Math.max(0, Math.round((newest.getTime() - oldest.getTime()) / 60000))
    : 0;
  const sessionDurationLabel = formatDurationLabel(sessionDurationMinutes);
  const sessionMachineName = rows
    .map((play) => String(play?.machine_name || '').trim())
    .find(Boolean) || '';

  const totalSteps = judgmentTotals.perfect + judgmentTotals.great + judgmentTotals.good + judgmentTotals.bad + judgmentTotals.miss;
  const perfectRate = totalSteps > 0 ? Math.round((judgmentTotals.perfect / totalSteps) * 100) : 0;
  const averageScore = scoredCount > 0 ? Math.round(scoreTotal / scoredCount) : 0;
  const clearCount = selectedRows.filter((row) => row.score > 0 && !isFailGrade(row.grade)).length;
  const clearRate = selectedRows.length > 0 ? Math.round((clearCount / selectedRows.length) * 100) : 0;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sessionDateLabel,
    sessionTimeRange,
    sessionDurationMinutes,
    sessionDurationLabel,
    sessionMachineName,
    filterMode: modeFilter,
    minGrade,
    minGradeLabel: getShareMinGradeLabel(minGrade),
    minLevel: hasLevelRange ? minLevel : 0,
    maxLevel: hasLevelRange ? maxLevel : 0,
    hasLevelRange,
    levelRangeLabel: hasLevelRange ? `Lv.${minLevel} to Lv.${maxLevel}` : 'Any level',
    songCount: selectedRows.length,
    clearCount,
    clearRate,
    averageScore,
    singleCount,
    doubleCount,
    otherCount,
    judgmentTotals,
    perfectRate,
    rows: selectedRows,
  };
}

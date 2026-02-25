const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/schema');
const { optionalAuth } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');

// Cache the jacket map in memory (loaded once from pump-phoenix.json)
let cachedJacketMap = null;
let cachedSongAliases = null;
let cachedSongCatalogByModes = new Map();
let cachedSongCatalogVersion = '';
let cachedSkillMetadataBySlug = null;

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

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const GRADE_INDEX = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, index]));
const TIER_NAME_ORDER = ['Overrated', 'VeryEasy', 'Easy', 'Medium', 'Hard', 'VeryHard', 'Underrated'];
const TIER_NAME_INDEX = Object.fromEntries(TIER_NAME_ORDER.map((name, index) => [name, index]));
const KNOWN_CHART_SKILLS = [
  { slug: 'jump', name: 'jump' },
  { slug: 'drill', name: 'drill' },
  { slug: 'run', name: 'run' },
  { slug: 'anchor_run', name: 'anchor run' },
  { slug: 'run_without_twists', name: 'run without twists' },
  { slug: 'twist_90', name: 'twist 90' },
  { slug: 'twist_over90', name: 'twist over90' },
  { slug: 'twist_close', name: 'twist close' },
  { slug: 'twist_far', name: 'twist far' },
  { slug: 'side3_singles', name: 'side3 singles' },
  { slug: 'mid6_doubles', name: 'mid6 doubles' },
  { slug: 'mid4_doubles', name: 'mid4 doubles' },
  { slug: 'doublestep', name: 'doublestep' },
  { slug: 'jack', name: 'jack' },
  { slug: 'footswitch', name: 'footswitch' },
  { slug: 'bracket', name: 'bracket' },
  { slug: 'staggered_bracket', name: 'staggered bracket' },
  { slug: 'bracket_run', name: 'bracket run' },
  { slug: 'bracket_drill', name: 'bracket drill' },
  { slug: 'bracket_jump', name: 'bracket jump' },
  { slug: 'bracket_twist', name: 'bracket twist' },
  { slug: '5-stair', name: '5-stair' },
  { slug: '10-stair', name: '10-stair' },
  { slug: 'yog_walk', name: 'yog walk' },
  { slug: 'cross-pad_transition', name: 'cross-pad transition' },
  { slug: 'co-op_pad_transition', name: 'co-op pad transition' },
  { slug: 'split', name: 'split' },
  { slug: 'hold_footswitch', name: 'hold footswitch' },
  { slug: 'hold_footslide', name: 'hold footslide' },
  { slug: 'hands', name: 'hands' },
  { slug: 'bursty', name: 'bursty' },
  { slug: 'sustained', name: 'sustained' },
];
const KNOWN_SKILL_NAME_BY_SLUG = new Map(KNOWN_CHART_SKILLS.map((skill) => [skill.slug, skill.name]));
const PIUCENTER_SKILL_BASE_URL = 'https://www.piucenter.com/skill';
const SKILL_METADATA_PATH = path.join(__dirname, '..', 'data', 'piucenter-skill-metadata.json');
const SKILL_ELIGIBLE_WHERE_SQL = "((s.mode = 'Single' AND s.level > 6) OR (s.mode = 'Double' AND s.level > 9))";
const SKILL_SORTS = new Set(['level_asc', 'level_desc', 'score_asc', 'score_desc']);

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

function normalizeSongName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'single' || m === 'singles' || m === 's') return 'Single';
  if (m === 'double' || m === 'doubles' || m === 'd') return 'Double';
  if (m === 'coop' || m === 'co-op' || m === 'co op' || m === 'cooperative' || m === 'c') return 'CoOp';
  return '';
}

function normalizeSkillSlug(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const fromPath = raw.includes('/skill/')
    ? raw.slice(raw.lastIndexOf('/skill/') + '/skill/'.length)
    : raw;

  const normalized = fromPath
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .trim();

  return normalized;
}

function humanizeSkillSlug(slug) {
  return String(slug || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSkillName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function getSkillNameForSlug(slug, fallbackName = '') {
  const normalizedSlug = normalizeSkillSlug(slug);
  if (!normalizedSlug) return '';
  const known = KNOWN_SKILL_NAME_BY_SLUG.get(normalizedSlug);
  if (known) return known;
  const normalizedFallback = normalizeSkillName(fallbackName);
  if (normalizedFallback) return normalizedFallback;
  return humanizeSkillSlug(normalizedSlug);
}

function loadSkillMetadataBySlug() {
  if (cachedSkillMetadataBySlug) return cachedSkillMetadataBySlug;

  const metadata = new Map();
  if (!fs.existsSync(SKILL_METADATA_PATH)) {
    cachedSkillMetadataBySlug = metadata;
    return metadata;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(SKILL_METADATA_PATH, 'utf-8'));
    const skills = Array.isArray(payload?.skills) ? payload.skills : [];

    for (const row of skills) {
      const slug = normalizeSkillSlug(row?.slug);
      if (!slug) continue;

      const descriptionSegments = [];
      if (Array.isArray(row?.description_segments)) {
        for (const segment of row.description_segments) {
          if (!segment || typeof segment !== 'object') continue;

          if (segment.type === 'image') {
            const url = String(segment.url || '').trim();
            if (!url) continue;
            descriptionSegments.push({
              type: 'image',
              url,
              alt: String(segment.alt || '').trim(),
            });
            continue;
          }

          if (segment.type === 'text') {
            const text = String(segment.text || '');
            if (!text) continue;
            descriptionSegments.push({
              type: 'text',
              text,
            });
          }
        }
      }

      const imageSet = new Set();
      const patternImages = [];

      for (const imageUrl of Array.isArray(row?.pattern_images) ? row.pattern_images : []) {
        const url = String(imageUrl || '').trim();
        if (!url || imageSet.has(url)) continue;
        imageSet.add(url);
        patternImages.push(url);
      }

      if (patternImages.length === 0) {
        for (const segment of descriptionSegments) {
          if (segment.type !== 'image') continue;
          if (imageSet.has(segment.url)) continue;
          imageSet.add(segment.url);
          patternImages.push(segment.url);
        }
      }

      metadata.set(slug, {
        slug,
        name: getSkillNameForSlug(slug, row?.name),
        description_text: String(row?.description_text || '').trim(),
        description_segments: descriptionSegments,
        pattern_images: patternImages,
        source_url: String(row?.url || row?.source_url || `${PIUCENTER_SKILL_BASE_URL}/${slug}`),
      });
    }
  } catch (err) {
    console.warn('Failed to load piucenter-skill-metadata.json:', err.message);
  }

  cachedSkillMetadataBySlug = metadata;
  return metadata;
}

function getSkillMetadata(slug) {
  const normalizedSlug = normalizeSkillSlug(slug);
  if (!normalizedSlug) return null;
  return loadSkillMetadataBySlug().get(normalizedSlug) || null;
}

function queryChartSkills(db, chartId) {
  const rows = db.prepare(`
    SELECT skill_slug, skill_name, source
    FROM chart_skills
    WHERE chart_id = ?
    ORDER BY skill_name COLLATE NOCASE ASC, skill_slug ASC
  `).all(chartId);

  const seen = new Set();
  const skills = [];
  for (const row of rows) {
    const slug = normalizeSkillSlug(row.skill_slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    skills.push({
      slug,
      name: getSkillNameForSlug(slug, row.skill_name),
      source: String(row.source || ''),
    });
  }
  return skills;
}

function loadChartSkillsById(db) {
  const rows = db.prepare(`
    SELECT chart_id, skill_slug, skill_name, source
    FROM chart_skills
    ORDER BY chart_id ASC, skill_name COLLATE NOCASE ASC, skill_slug ASC
  `).all();

  const map = new Map();
  for (const row of rows) {
    const chartId = String(parseInt(row.chart_id, 10) || 0);
    if (!chartId || chartId === '0') continue;
    const slug = normalizeSkillSlug(row.skill_slug);
    if (!slug) continue;

    if (!map.has(chartId)) map.set(chartId, []);
    const current = map.get(chartId);
    if (current.some((skill) => skill.slug === slug)) continue;

    current.push({
      slug,
      name: getSkillNameForSlug(slug, row.skill_name),
      source: String(row.source || ''),
    });
  }
  return map;
}

function getSkillCatalogWithCounts(db) {
  const rows = db.prepare(`
    SELECT skill_slug, MAX(skill_name) as skill_name, COUNT(*) as chart_count
    FROM chart_skills
    GROUP BY skill_slug
    ORDER BY skill_name COLLATE NOCASE ASC, skill_slug ASC
  `).all();

  const bySlug = new Map();
  for (const skill of KNOWN_CHART_SKILLS) {
    bySlug.set(skill.slug, {
      slug: skill.slug,
      name: skill.name,
      chart_count: 0,
    });
  }

  for (const row of rows) {
    const slug = normalizeSkillSlug(row.skill_slug);
    if (!slug) continue;
    bySlug.set(slug, {
      slug,
      name: getSkillNameForSlug(slug, row.skill_name),
      chart_count: parseInt(row.chart_count, 10) || 0,
    });
  }

  return Array.from(bySlug.values()).sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;
    return a.slug.localeCompare(b.slug, undefined, { sensitivity: 'base' });
  });
}

function normalizeGrade(grade) {
  const raw = String(grade || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  if (GRADE_INDEX[raw] !== undefined) return raw;

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
  const value = parseInt(score, 10) || 0;
  for (const row of SCORE_TO_GRADE) {
    if (value >= row.min) return row.grade;
  }
  return 'F';
}

function getGrade(record) {
  const grade = normalizeGrade(record?.grade);
  return grade || gradeFromScore(record?.score);
}

function isPassRecord(record) {
  const score = parseInt(record?.score, 10) || 0;
  if (score <= 0) return false;
  return getGrade(record) !== 'F';
}

function scoreValue(value) {
  return parseInt(value, 10) || 0;
}

function parseDateMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const normalized = raw.replace(/\//g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const ms = Date.parse(`${normalized}T00:00:00Z`);
    return Number.isNaN(ms) ? 0 : ms;
  }

  const direct = Date.parse(normalized.includes('T') ? normalized : normalized.replace(' ', 'T') + 'Z');
  if (!Number.isNaN(direct)) return direct;

  const ymd = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const ms = Date.parse(`${ymd[1]}-${String(ymd[2]).padStart(2, '0')}-${String(ymd[3]).padStart(2, '0')}T00:00:00Z`);
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function compareRecords(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;

  const aScore = scoreValue(a.score);
  const bScore = scoreValue(b.score);
  if (aScore !== bScore) return bScore > aScore ? b : a;

  const aDate = parseDateMs(a.date_played || a.created_at || '');
  const bDate = parseDateMs(b.date_played || b.created_at || '');
  if (aDate !== bDate) return bDate > aDate ? b : a;

  const aId = parseInt(a.id, 10) || 0;
  const bId = parseInt(b.id, 10) || 0;
  if (aId !== bId) return bId > aId ? b : a;

  return a;
}

function toCanonicalTitle(title, aliases) {
  let normalized = normalizeSongName(title);
  if (!normalized) return '';

  const seen = new Set();
  while (aliases[normalized] && !seen.has(normalized)) {
    seen.add(normalized);
    normalized = aliases[normalized];
  }
  return normalized;
}

function makeChartKey(title, mode, level, aliases) {
  const canonicalTitle = toCanonicalTitle(title, aliases);
  const canonicalMode = normalizeMode(mode);
  const lv = parseInt(level, 10) || 0;
  if (!canonicalTitle || !canonicalMode || !lv) return '';
  return `${canonicalTitle}|${canonicalMode}|${lv}`;
}

function levelModeSort(a, b) {
  const modeOrder = { Single: 0, Double: 1, CoOp: 2 };
  const modeA = modeOrder[a.mode] ?? 99;
  const modeB = modeOrder[b.mode] ?? 99;
  if (modeA !== modeB) return modeA - modeB;
  if (a.level !== b.level) return a.level - b.level;
  return (a.chart_id || 0) - (b.chart_id || 0);
}

function calculateRating(level, grade, isPass = true) {
  if (!isPass) return 0;
  const base = LEVEL_BASE_RATING[parseInt(level, 10)];
  if (!base) return 0;
  const normalizedGrade = normalizeGrade(grade);
  const mult = GRADE_MULTIPLIER[normalizedGrade];
  if (!mult) return 0;
  return Math.round(base * mult);
}

function expandMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (!normalized || normalized === 'both' || normalized === 'all') return ['Single', 'Double'];
  if (normalized.startsWith('s')) return ['Single'];
  if (normalized.startsWith('d')) return ['Double'];
  return ['Single', 'Double'];
}

function getSongCatalogVersion(db) {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM songs) as songs_count,
      (SELECT IFNULL(MAX(id), 0) FROM songs) as songs_max_id,
      (SELECT COUNT(*) FROM chart_skills) as skills_count,
      (SELECT IFNULL(MAX(updated_at), '') FROM chart_skills) as skills_max_updated_at
  `).get();

  return [
    parseInt(row?.songs_count, 10) || 0,
    parseInt(row?.songs_max_id, 10) || 0,
    parseInt(row?.skills_count, 10) || 0,
    String(row?.skills_max_updated_at || ''),
  ].join('|');
}

function getSongCatalog(db, aliases, allowedModes = ['Single', 'Double']) {
  const catalogVersion = getSongCatalogVersion(db);
  if (catalogVersion !== cachedSongCatalogVersion) {
    cachedSongCatalogByModes = new Map();
    cachedSongCatalogVersion = catalogVersion;
  }

  const normalizedAllowedModes = allowedModes
    .map((mode) => normalizeMode(mode))
    .filter(Boolean);
  const modeKey = normalizedAllowedModes.slice().sort().join('|') || 'none';
  if (cachedSongCatalogByModes.has(modeKey)) {
    return cachedSongCatalogByModes.get(modeKey);
  }

  const chartSkillsById = loadChartSkillsById(db);

  const rows = db.prepare(`
    SELECT id, title, artist, jacket_url, mode, level, bpm, song_key, flags
    FROM songs
    ORDER BY title COLLATE NOCASE ASC, artist COLLATE NOCASE ASC, mode ASC, level ASC, id ASC
  `).all();

  const songsByGroup = new Map();
  const seenChartKeys = new Set();
  const charts = [];
  const chartsByKey = new Map();
  const chartsById = new Map();
  const allowedSet = new Set(normalizedAllowedModes);
  const levelModeTotals = {
    Single: new Map(),
    Double: new Map(),
    CoOp: new Map(),
  };

  for (const row of rows) {
    const mode = normalizeMode(row.mode);
    if (!mode) continue;
    if (allowedSet.size > 0 && !allowedSet.has(mode)) continue;
    const level = parseInt(row.level, 10) || 0;
    if (level <= 0) continue;

    const chartKey = makeChartKey(row.title, mode, level, aliases);
    if (!chartKey || seenChartKeys.has(chartKey)) continue;
    seenChartKeys.add(chartKey);

    const canonicalTitle = toCanonicalTitle(row.title, aliases);
    const artistNorm = normalizeSongName(row.artist);
    const groupKey = (row.song_key && String(row.song_key).trim())
      ? `song_key:${String(row.song_key).trim()}`
      : `${canonicalTitle}|${artistNorm}`;

    if (!songsByGroup.has(groupKey)) {
      songsByGroup.set(groupKey, {
        song_group_key: groupKey,
        title: row.title,
        artist: row.artist || '',
        jacket_url: row.jacket_url || '',
        song_key: row.song_key || '',
        flags: row.flags || '',
        charts: [],
        searchable_title: canonicalTitle,
      });
    }

    const group = songsByGroup.get(groupKey);
    const chart = {
      chart_id: row.id,
      key: chartKey,
      title: row.title,
      artist: row.artist || '',
      mode,
      level,
      jacket_url: row.jacket_url || '',
      bpm: row.bpm || '',
      song_key: row.song_key || '',
      flags: row.flags || '',
      skills: chartSkillsById.get(String(row.id)) || [],
    };

    group.charts.push(chart);
    charts.push(chart);
    chartsByKey.set(chartKey, chart);
    chartsById.set(String(row.id), chart);

    if (levelModeTotals[mode]) {
      const modeTotals = levelModeTotals[mode];
      modeTotals.set(level, (modeTotals.get(level) || 0) + 1);
    }
  }

  const songs = Array.from(songsByGroup.values()).map((song) => {
    song.charts.sort(levelModeSort);
    return song;
  }).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

  const levels = new Set([
    ...levelModeTotals.Single.keys(),
    ...levelModeTotals.Double.keys(),
    ...levelModeTotals.CoOp.keys(),
  ]);
  const sortedLevels = Array.from(levels).sort((a, b) => a - b);

  const catalog = {
    songs,
    charts,
    chartsByKey,
    chartsById,
    levelModeTotals,
    levels: sortedLevels,
  };
  cachedSongCatalogByModes.set(modeKey, catalog);
  return catalog;
}

function queryUserBestScores(db, userId) {
  if (!userId) return [];
  return db.prepare(`
    SELECT id, user_id, song_title, mode, level, score, grade, plate, background_url
    FROM user_best_scores
    WHERE user_id = ?
  `).all(userId);
}

function queryUserRecentScores(db, userId) {
  if (!userId) return [];
  return db.prepare(`
    SELECT id, user_id, song_title, mode, level, score, grade, plate, background_url, date_played,
           perfect, great, good, bad, miss, max_combo
    FROM user_recently_played
    WHERE user_id = ?
  `).all(userId);
}

function queryUserPumbilityScores(db, userId) {
  if (!userId) return [];
  return db.prepare(`
    SELECT id, user_id, song_title, mode, level, score, grade, background_url, date_played
    FROM user_pumbility_scores
    WHERE user_id = ?
  `).all(userId);
}

function buildUserBestByChartMap({ bestScores, recentScores, pumbilityScores, aliases, validChartKeys = null }) {
  const passBest = new Map();
  const failBest = new Map();

  const pushRecord = (source, row) => {
    const key = makeChartKey(row.song_title, row.mode, row.level, aliases);
    if (!key) return;
    if (validChartKeys && !validChartKeys.has(key)) return;

    const score = scoreValue(row.score);
    const grade = getGrade(row);
    const shaped = {
      id: row.id,
      source,
      user_id: row.user_id,
      song_title: row.song_title,
      mode: normalizeMode(row.mode),
      level: parseInt(row.level, 10) || 0,
      score,
      grade,
      plate: row.plate || '',
      background_url: row.background_url || '',
      date_played: row.date_played || row.created_at || '',
      is_pass: isPassRecord({ score, grade }),
      is_stage_break: !isPassRecord({ score, grade }),
      rating: calculateRating(row.level, grade, isPassRecord({ score, grade })),
    };

    if (shaped.is_pass) {
      passBest.set(key, compareRecords(passBest.get(key), shaped));
    } else {
      failBest.set(key, compareRecords(failBest.get(key), shaped));
    }
  };

  for (const row of bestScores || []) pushRecord('best', row);
  for (const row of recentScores || []) pushRecord('recent', row);
  for (const row of pumbilityScores || []) pushRecord('pumbility', row);

  const allKeys = new Set([...passBest.keys(), ...failBest.keys()]);
  const bestByChart = new Map();
  for (const key of allKeys) {
    bestByChart.set(key, passBest.get(key) || failBest.get(key) || null);
  }
  return { bestByChart, passBest, failBest };
}

function getLevelEntry(map, level) {
  if (!map.has(level)) {
    map.set(level, {
      level,
      total_charts: 0,
      cleared_charts: 0,
      clear_percentage: 0,
      rating_total: 0,
      score_sum: 0,
      score_count: 0,
      average_score: 0,
      average_grade: '',
    });
  }
  return map.get(level);
}

function finalizeLevelEntries(levelMap, totalChartsByLevel) {
  for (const [level, total] of totalChartsByLevel.entries()) {
    const entry = getLevelEntry(levelMap, level);
    entry.total_charts = total;
    entry.clear_percentage = total > 0
      ? Number(((entry.cleared_charts / total) * 100).toFixed(2))
      : 0;
    entry.average_score = entry.score_count > 0
      ? Math.round(entry.score_sum / entry.score_count)
      : 0;
    entry.average_grade = entry.average_score > 0 ? gradeFromScore(entry.average_score) : '';
  }
}

function getCompetitiveLevel(entries) {
  let best = null;
  for (const entry of entries) {
    if (!entry || entry.score_count <= 0) continue;
    const level = parseInt(entry.level, 10) || 0;
    const totalCharts = parseInt(entry.total_charts, 10) || 0;
    const clearedCharts = parseInt(entry.cleared_charts, 10) || 0;
    const averageScore = parseInt(entry.average_score, 10) || 0;
    if (level <= 0) continue;
    if (totalCharts <= 0) continue;
    if ((clearedCharts / totalCharts) < 0.5) continue;
    const grade = entry.average_grade || 'F';
    if ((GRADE_INDEX[grade] || 0) < (GRADE_INDEX.S || 0)) continue;
    if (!best || level > best.level) {
      best = {
        level,
        average_score: averageScore,
        average_grade: grade,
        passed_charts: clearedCharts,
        total_charts: totalCharts,
        clear_percentage: totalCharts > 0
          ? Number(((clearedCharts / totalCharts) * 100).toFixed(2))
          : 0,
      };
    }
  }
  return best || {
    level: null,
    average_score: 0,
    average_grade: '',
    passed_charts: 0,
    total_charts: 0,
    clear_percentage: 0,
  };
}

function formatAnalytics(userId, profile, syncRow, songCatalog, bestByChart, passBestByChart) {
  const singleLevels = new Map();
  const doubleLevels = new Map();
  const allLevels = new Map();

  for (const [level, count] of songCatalog.levelModeTotals.Single.entries()) {
    getLevelEntry(singleLevels, level).total_charts = count;
    getLevelEntry(allLevels, level).total_charts += count;
  }
  for (const [level, count] of songCatalog.levelModeTotals.Double.entries()) {
    getLevelEntry(doubleLevels, level).total_charts = count;
    getLevelEntry(allLevels, level).total_charts += count;
  }

  const ratedEntriesAll = [];
  const ratedEntriesSingle = [];
  const ratedEntriesDouble = [];

  for (const [chartKey, record] of passBestByChart.entries()) {
    if (!record) continue;
    const chart = songCatalog.chartsByKey.get(chartKey);
    if (!chart) continue;
    const rating = calculateRating(chart.level, record.grade, true);
    const modeMap = chart.mode === 'Single' ? singleLevels : doubleLevels;
    const modeEntry = getLevelEntry(modeMap, chart.level);
    const allEntry = getLevelEntry(allLevels, chart.level);

    modeEntry.cleared_charts += 1;
    modeEntry.rating_total += rating;
    modeEntry.score_sum += scoreValue(record.score);
    modeEntry.score_count += 1;

    allEntry.cleared_charts += 1;
    allEntry.rating_total += rating;
    allEntry.score_sum += scoreValue(record.score);
    allEntry.score_count += 1;

    const ratedEntry = {
      chart_id: chart.chart_id,
      title: chart.title,
      artist: chart.artist || '',
      mode: chart.mode,
      level: chart.level,
      score: scoreValue(record.score),
      grade: record.grade || '',
      plate: record.plate || '',
      rating,
      date_played: record.date_played || '',
      jacket_url: chart.jacket_url || '',
    };

    ratedEntriesAll.push(ratedEntry);
    if (chart.mode === 'Single') ratedEntriesSingle.push(ratedEntry);
    if (chart.mode === 'Double') ratedEntriesDouble.push(ratedEntry);
  }

  finalizeLevelEntries(singleLevels, songCatalog.levelModeTotals.Single);
  finalizeLevelEntries(doubleLevels, songCatalog.levelModeTotals.Double);

  const bothTotalsByLevel = new Map();
  for (const level of songCatalog.levels) {
    const total = (songCatalog.levelModeTotals.Single.get(level) || 0) + (songCatalog.levelModeTotals.Double.get(level) || 0);
    bothTotalsByLevel.set(level, total);
  }
  finalizeLevelEntries(allLevels, bothTotalsByLevel);

  const singleEntries = Array.from(singleLevels.values()).sort((a, b) => a.level - b.level);
  const doubleEntries = Array.from(doubleLevels.values()).sort((a, b) => a.level - b.level);
  const bothEntries = Array.from(allLevels.values()).sort((a, b) => a.level - b.level);

  const singleTotals = singleEntries.reduce((acc, row) => {
    acc.total_charts += row.total_charts;
    acc.cleared_charts += row.cleared_charts;
    acc.rating_total += row.rating_total;
    return acc;
  }, { total_charts: 0, cleared_charts: 0, rating_total: 0 });

  const doubleTotals = doubleEntries.reduce((acc, row) => {
    acc.total_charts += row.total_charts;
    acc.cleared_charts += row.cleared_charts;
    acc.rating_total += row.rating_total;
    return acc;
  }, { total_charts: 0, cleared_charts: 0, rating_total: 0 });

  const bothTotals = bothEntries.reduce((acc, row) => {
    acc.total_charts += row.total_charts;
    acc.cleared_charts += row.cleared_charts;
    acc.rating_total += row.rating_total;
    return acc;
  }, { total_charts: 0, cleared_charts: 0, rating_total: 0 });

  const applyPercent = (totals) => ({
    ...totals,
    clear_percentage: totals.total_charts > 0
      ? Number(((totals.cleared_charts / totals.total_charts) * 100).toFixed(2))
      : 0,
  });

  const sortRatedEntries = (a, b) => {
    if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    const ad = parseDateMs(a.date_played);
    const bd = parseDateMs(b.date_played);
    if (bd !== ad) return bd - ad;
    return (b.chart_id || 0) - (a.chart_id || 0);
  };

  ratedEntriesAll.sort(sortRatedEntries);
  ratedEntriesSingle.sort(sortRatedEntries);
  ratedEntriesDouble.sort(sortRatedEntries);

  const computedPumbility = ratedEntriesAll.slice(0, 50).reduce((sum, row) => sum + (row.rating || 0), 0);
  const singlesPumbility = ratedEntriesSingle.slice(0, 50).reduce((sum, row) => sum + (row.rating || 0), 0);

  const pumbility = (syncRow?.pumbility_value || 0) > 0
    ? parseInt(syncRow.pumbility_value, 10)
    : computedPumbility;

  return {
    user_id: userId,
    user: profile ? {
      id: profile.id,
      username: profile.username,
      avatar: normalizeUserAvatarForList(profile.avatar, profile.id, 64),
      pumbility: parseInt(profile.pumbility, 10) || 0,
    } : null,
    pumbility,
    computed_pumbility: computedPumbility,
    singles_pumbility: singlesPumbility,
    totals: {
      single: applyPercent(singleTotals),
      double: applyPercent(doubleTotals),
      both: applyPercent(bothTotals),
    },
    levels: {
      single: singleEntries,
      double: doubleEntries,
      both: bothEntries,
    },
    pumbility_breakdown: {
      overall_top50: ratedEntriesAll.slice(0, 50),
      singles_top50: ratedEntriesSingle.slice(0, 50),
      doubles_top50: ratedEntriesDouble.slice(0, 50),
    },
    competitive_levels: {
      single: getCompetitiveLevel(singleEntries),
      double: getCompetitiveLevel(doubleEntries),
    },
    sync: syncRow ? {
      best_scores_imported: !!syncRow.best_scores_imported,
      last_best_scores_sync: syncRow.last_best_scores_sync || null,
      pumbility_value: parseInt(syncRow.pumbility_value, 10) || 0,
    } : {
      best_scores_imported: false,
      last_best_scores_sync: null,
      pumbility_value: 0,
    },
  };
}

function getUserAnalytics(db, userId, aliases, songCatalog) {
  const bestScores = queryUserBestScores(db, userId);
  const recentScores = queryUserRecentScores(db, userId);
  const pumbilityScores = queryUserPumbilityScores(db, userId);
  const { bestByChart, passBest } = buildUserBestByChartMap({
    bestScores,
    recentScores,
    pumbilityScores,
    aliases,
    validChartKeys: songCatalog.chartsByKey,
  });

  const profile = db.prepare('SELECT id, username, avatar, pumbility FROM users WHERE id = ?').get(userId) || null;
  const syncRow = db.prepare('SELECT best_scores_imported, last_best_scores_sync, pumbility_value FROM user_piugame_sync WHERE user_id = ?').get(userId) || null;

  return {
    bestByChart,
    passBestByChart: passBest,
    analytics: formatAnalytics(userId, profile, syncRow, songCatalog, bestByChart, passBest),
  };
}

function parseLevelQuery(levelRaw) {
  if (levelRaw === undefined || levelRaw === null || levelRaw === '') return null;
  const level = parseInt(levelRaw, 10);
  return Number.isFinite(level) && level > 0 ? level : null;
}

function parseLevelBound(levelRaw) {
  if (levelRaw === undefined || levelRaw === null || levelRaw === '') return null;
  const level = parseInt(levelRaw, 10);
  return Number.isFinite(level) && level > 0 ? level : null;
}

function normalizeSkillSort(sortRaw) {
  const normalized = String(sortRaw || '').trim().toLowerCase();
  if (SKILL_SORTS.has(normalized)) return normalized;
  return 'level_asc';
}

function compareSkillChartBase(a, b) {
  if ((a.level || 0) !== (b.level || 0)) return (a.level || 0) - (b.level || 0);
  const modeOrder = { Single: 0, Double: 1 };
  const modeA = modeOrder[a.mode] ?? 99;
  const modeB = modeOrder[b.mode] ?? 99;
  if (modeA !== modeB) return modeA - modeB;
  const titleCompare = String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  if (titleCompare !== 0) return titleCompare;
  return (a.chart_id || 0) - (b.chart_id || 0);
}

function compareSkillCharts(a, b, sort) {
  const aScore = Number.isFinite(a.best_score) ? a.best_score : null;
  const bScore = Number.isFinite(b.best_score) ? b.best_score : null;

  if (sort === 'level_desc') {
    const levelDiff = (b.level || 0) - (a.level || 0);
    if (levelDiff !== 0) return levelDiff;
    return compareSkillChartBase(a, b);
  }

  if (sort === 'score_asc' || sort === 'score_desc') {
    const direction = sort === 'score_asc' ? 1 : -1;
    if (aScore === null && bScore !== null) return 1;
    if (aScore !== null && bScore === null) return -1;
    if (aScore !== null && bScore !== null && aScore !== bScore) {
      return (aScore - bScore) * direction;
    }
    return compareSkillChartBase(a, b);
  }

  return compareSkillChartBase(a, b);
}

function normalizeTierName(name) {
  const compact = String(name || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!compact) return '';
  if (compact === 'overrated') return 'Overrated';
  if (compact === 'veryeasy') return 'VeryEasy';
  if (compact === 'easy') return 'Easy';
  if (compact === 'medium' || compact === 'mid') return 'Medium';
  if (compact === 'hard') return 'Hard';
  if (compact === 'veryhard') return 'VeryHard';
  if (compact === 'underrated') return 'Underrated';
  return String(name || '').trim();
}

function getTierRank(name) {
  const normalized = normalizeTierName(name);
  if (TIER_NAME_INDEX[normalized] !== undefined) return TIER_NAME_INDEX[normalized];
  return 999;
}

function normalizeTierListType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Pass';
  if (raw === 'pass') return 'Pass';
  if (raw === 'score') return 'Score';
  if (raw === 'stagebreak' || raw === 'stage_break' || raw === 'stage-break') return 'StageBreak';
  if (raw === 'officialscores' || raw === 'official_scores' || raw === 'official-scores') return 'OfficialScores';
  if (raw === 'popularity') return 'Popularity';
  return 'Pass';
}

function loadSongAliases() {
  if (cachedSongAliases) return cachedSongAliases;

  const aliasesPath = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');
  if (!fs.existsSync(aliasesPath)) {
    cachedSongAliases = {};
    return cachedSongAliases;
  }

  try {
    const data = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'));
    const rawAliases = (data && typeof data.aliases === 'object' && data.aliases) || {};
    const normalizedAliases = {};

    for (const [alias, canonical] of Object.entries(rawAliases)) {
      const aliasNorm = normalizeSongName(alias);
      const canonicalNorm = normalizeSongName(canonical);
      if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
      if (!normalizedAliases[aliasNorm]) normalizedAliases[aliasNorm] = canonicalNorm;
    }

    cachedSongAliases = normalizedAliases;
    return cachedSongAliases;
  } catch (err) {
    console.warn('Failed to load piugame-song-aliases.json:', err.message);
    cachedSongAliases = {};
    return cachedSongAliases;
  }
}

function loadJacketMap() {
  if (cachedJacketMap) return cachedJacketMap;
  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  if (!fs.existsSync(jsonPath)) return {};
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const map = {};
  const chartKeysBySong = {};

  for (const song of data.songs) {
    if (!song.jacket) continue;
    const jacketUrl = '/jackets/' + song.jacket;
    const name = song.name || '';
    const norm = normalizeSongName(name);
    // Store by normalized name
    if (!map[norm]) map[norm] = jacketUrl;
    // Also store by name with mode|level for each chart
    for (const chart of (song.charts || [])) {
      if (chart.diffClass === 'S' || chart.diffClass === 'D') {
        const mode = chart.diffClass === 'S' ? 'Single' : 'Double';
        const key = `${norm}|${mode}|${chart.lvl}`;
        if (!map[key]) map[key] = jacketUrl;

        if (!chartKeysBySong[norm]) chartKeysBySong[norm] = [];
        chartKeysBySong[norm].push({ mode, level: chart.lvl, jacketUrl });
      }
    }
  }

  // Expand map with locale aliases (e.g., Korean PIUGame titles -> canonical English song)
  const aliases = loadSongAliases();
  for (const [aliasNorm, canonicalNorm] of Object.entries(aliases)) {
    const canonicalJacket = map[canonicalNorm];
    if (!canonicalJacket) continue;

    if (!map[aliasNorm]) map[aliasNorm] = canonicalJacket;

    const chartKeys = chartKeysBySong[canonicalNorm] || [];
    for (const chart of chartKeys) {
      const aliasChartKey = `${aliasNorm}|${chart.mode}|${chart.level}`;
      if (!map[aliasChartKey]) map[aliasChartKey] = chart.jacketUrl;
    }
  }

  cachedJacketMap = map;
  return map;
}

function invalidateSongCaches() {
  cachedJacketMap = null;
  cachedSongCatalogByModes = new Map();
  cachedSongCatalogVersion = '';
  cachedSkillMetadataBySlug = null;
}

// GET /api/songs/jacket-map — return song name → local jacket URL mapping
router.get('/jacket-map', (req, res) => {
  const map = loadJacketMap();
  res.json(map);
});

// GET /api/songs/chart-key-map — return normalised "title|Mode|level" → chart_id mapping
router.get('/chart-key-map', (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const catalog = getSongCatalog(db, aliases);
  const map = {};

  // Primary entries using canonical chart keys
  for (const [key, chart] of catalog.chartsByKey) {
    map[key] = chart.chart_id;
  }

  // Add entries keyed by raw DB title (may differ from canonical)
  for (const chart of catalog.charts) {
    const rawNorm = normalizeSongName(chart.title);
    const rawKey = `${rawNorm}|${chart.mode}|${chart.level}`;
    if (!map[rawKey]) map[rawKey] = chart.chart_id;
  }

  // Expand aliases so non-canonical titles also resolve
  for (const [aliasNorm, canonicalNorm] of Object.entries(aliases)) {
    for (const [key, chart] of catalog.chartsByKey) {
      if (key.startsWith(canonicalNorm + '|')) {
        const suffix = key.slice(canonicalNorm.length);
        const aliasKey = aliasNorm + suffix;
        if (!map[aliasKey]) map[aliasKey] = chart.chart_id;
      }
    }
  }

  res.json(map);
});

// GET /api/songs/skills/meta — available chart skills and coverage stats
router.get('/skills/meta', (req, res) => {
  const db = getDb();
  const skills = getSkillCatalogWithCounts(db);

  const totalChartRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM songs s
    WHERE s.mode IN ('Single', 'Double')
      AND ${SKILL_ELIGIBLE_WHERE_SQL}
  `).get();

  const withSkillsRow = db.prepare(`
    SELECT COUNT(DISTINCT s.id) as count
    FROM songs s
    JOIN chart_skills cs ON cs.chart_id = s.id
    WHERE s.mode IN ('Single', 'Double')
      AND ${SKILL_ELIGIBLE_WHERE_SQL}
  `).get();

  const totalCharts = parseInt(totalChartRow?.count, 10) || 0;
  const chartsWithSkills = parseInt(withSkillsRow?.count, 10) || 0;

  res.json({
    skills,
    totals: {
      total_charts: totalCharts,
      charts_with_skills: chartsWithSkills,
      charts_missing_skills: Math.max(0, totalCharts - chartsWithSkills),
    },
  });
});

// GET /api/songs/skills/missing — charts with no skill assignments yet
router.get('/skills/missing', (req, res) => {
  const db = getDb();

  const modeRaw = String(req.query.mode || '').trim().toLowerCase();
  let modeFilter = ['Single', 'Double'];
  if (modeRaw && modeRaw !== 'both' && modeRaw !== 'all') {
    const mode = normalizeMode(modeRaw);
    if (!mode || mode === 'CoOp') return res.status(400).json({ error: 'Invalid mode filter' });
    modeFilter = [mode];
  }

  const levelFilter = parseLevelQuery(req.query.level);
  const search = String(req.query.search || '').trim();

  const limitRaw = parseInt(req.query.limit, 10);
  const offsetRaw = parseInt(req.query.offset, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, 1000)
    : 250;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const modePlaceholders = modeFilter.map(() => '?').join(', ');
  const whereClauses = [SKILL_ELIGIBLE_WHERE_SQL, `s.mode IN (${modePlaceholders})`, 'cs.chart_id IS NULL'];
  const params = [...modeFilter];

  if (levelFilter) {
    whereClauses.push('s.level = ?');
    params.push(levelFilter);
  }

  if (search) {
    whereClauses.push('(s.title LIKE ? OR s.artist LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = whereClauses.join(' AND ');

  const totalRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM songs s
    LEFT JOIN chart_skills cs ON cs.chart_id = s.id
    WHERE ${whereSql}
  `).get(...params);

  const rows = db.prepare(`
    SELECT
      s.id as chart_id,
      s.title,
      s.artist,
      s.mode,
      s.level,
      s.jacket_url,
      s.bpm,
      s.song_key,
      s.flags
    FROM songs s
    LEFT JOIN chart_skills cs ON cs.chart_id = s.id
    WHERE ${whereSql}
    ORDER BY s.level ASC, s.mode ASC, s.title COLLATE NOCASE ASC, s.id ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    total_missing_charts: parseInt(totalRow?.count, 10) || 0,
    limit,
    offset,
    mode_filter: modeFilter,
    skills: getSkillCatalogWithCounts(db),
    charts: rows.map((row) => ({
      chart_id: row.chart_id,
      title: row.title,
      artist: row.artist || '',
      mode: normalizeMode(row.mode) || row.mode,
      level: parseInt(row.level, 10) || 0,
      jacket_url: row.jacket_url || '',
      bpm: row.bpm || '',
      song_key: row.song_key || '',
      flags: row.flags || '',
      skills: [],
    })),
  });
});

// GET /api/songs/skill/:skillSlug — charts tagged with a specific skill
router.get('/skill/:skillSlug/info', (req, res) => {
  const db = getDb();
  const skillSlug = normalizeSkillSlug(req.params.skillSlug);
  if (!skillSlug) return res.status(400).json({ error: 'Invalid skill slug' });

  const row = db.prepare(`
    SELECT COUNT(DISTINCT cs.chart_id) AS chart_count
    FROM chart_skills cs
    JOIN songs s ON s.id = cs.chart_id
    WHERE (cs.skill_slug = ? OR LOWER(cs.skill_slug) = ? OR cs.skill_slug LIKE ?)
      AND ${SKILL_ELIGIBLE_WHERE_SQL}
  `).get(skillSlug, skillSlug, `%/skill/${skillSlug}`) || { chart_count: 0 };

  const skillMetadata = getSkillMetadata(skillSlug);
  res.json({
    skill: {
      slug: skillSlug,
      name: skillMetadata?.name || getSkillNameForSlug(skillSlug),
      description_text: skillMetadata?.description_text || '',
      description_segments: skillMetadata?.description_segments || [],
      pattern_images: skillMetadata?.pattern_images || [],
      source_url: skillMetadata?.source_url || `${PIUCENTER_SKILL_BASE_URL}/${skillSlug}`,
    },
    chart_count: parseInt(row.chart_count, 10) || 0,
  });
});

// GET /api/songs/skill/:skillSlug — charts tagged with a specific skill
router.get('/skill/:skillSlug', optionalAuth, (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const skillSlug = normalizeSkillSlug(req.params.skillSlug);
  if (!skillSlug) return res.status(400).json({ error: 'Invalid skill slug' });

  const modeRaw = String(req.query.mode || '').trim().toLowerCase();
  let modeFilter = ['Single', 'Double'];
  if (modeRaw && modeRaw !== 'both' && modeRaw !== 'all') {
    const mode = normalizeMode(modeRaw);
    if (!mode || mode === 'CoOp') return res.status(400).json({ error: 'Invalid mode filter' });
    modeFilter = [mode];
  }

  const minLevel = parseLevelBound(req.query.min_level);
  const maxLevel = parseLevelBound(req.query.max_level);
  if (minLevel && maxLevel && minLevel > maxLevel) {
    return res.status(400).json({ error: 'min_level cannot exceed max_level' });
  }

  const sort = normalizeSkillSort(req.query.sort);
  const targetUserId = String(req.query.user_id || req.user?.id || '').trim();

  const modePlaceholders = modeFilter.map(() => '?').join(', ');
  const whereClauses = [
    SKILL_ELIGIBLE_WHERE_SQL,
    `s.mode IN (${modePlaceholders})`,
    '(cs.skill_slug = ? OR LOWER(cs.skill_slug) = ? OR cs.skill_slug LIKE ?)',
  ];
  const params = [...modeFilter, skillSlug, skillSlug, `%/skill/${skillSlug}`];

  if (minLevel) {
    whereClauses.push('s.level >= ?');
    params.push(minLevel);
  }
  if (maxLevel) {
    whereClauses.push('s.level <= ?');
    params.push(maxLevel);
  }

  const rows = db.prepare(`
    SELECT
      s.id as chart_id,
      s.title,
      s.artist,
      s.mode,
      s.level,
      s.jacket_url,
      s.bpm,
      s.song_key,
      s.flags,
      cs.skill_slug,
      cs.skill_name
    FROM songs s
    JOIN chart_skills cs ON cs.chart_id = s.id
    WHERE ${whereClauses.join(' AND ')}
  `).all(...params);

  const chartsById = new Map();
  let resolvedSkillName = '';
  for (const row of rows) {
    const rowSlug = normalizeSkillSlug(row.skill_slug);
    if (rowSlug !== skillSlug) continue;
    if (!resolvedSkillName) resolvedSkillName = getSkillNameForSlug(rowSlug, row.skill_name);

    const chartId = parseInt(row.chart_id, 10) || 0;
    if (!chartId || chartsById.has(chartId)) continue;

    const mode = normalizeMode(row.mode);
    const level = parseInt(row.level, 10) || 0;
    if (!mode || level <= 0) continue;

    chartsById.set(chartId, {
      chart_id: chartId,
      title: row.title,
      artist: row.artist || '',
      mode,
      level,
      jacket_url: row.jacket_url || '',
      bpm: row.bpm || '',
      song_key: row.song_key || '',
      flags: row.flags || '',
      key: makeChartKey(row.title, mode, level, aliases),
    });
  }

  let bestByChart = new Map();
  if (targetUserId) {
    const songCatalog = getSongCatalog(db, aliases);
    bestByChart = buildUserBestByChartMap({
      bestScores: queryUserBestScores(db, targetUserId),
      recentScores: queryUserRecentScores(db, targetUserId),
      pumbilityScores: queryUserPumbilityScores(db, targetUserId),
      aliases,
      validChartKeys: songCatalog.chartsByKey,
    }).bestByChart;
  }

  const charts = Array.from(chartsById.values()).map((chart) => {
    const best = chart.key ? (bestByChart.get(chart.key) || null) : null;
    return {
      chart_id: chart.chart_id,
      title: chart.title,
      artist: chart.artist,
      mode: chart.mode,
      level: chart.level,
      jacket_url: chart.jacket_url,
      bpm: chart.bpm,
      song_key: chart.song_key,
      flags: chart.flags,
      best_score: best ? best.score : null,
      best_grade: best ? (best.grade || '') : '',
      is_pass: best ? !!best.is_pass : false,
      is_stage_break: best ? !!best.is_stage_break : false,
      date_played: best ? (best.date_played || '') : '',
    };
  });

  charts.sort((a, b) => compareSkillCharts(a, b, sort));
  const skillMetadata = getSkillMetadata(skillSlug);

  res.json({
    skill: {
      slug: skillSlug,
      name: skillMetadata?.name || resolvedSkillName || getSkillNameForSlug(skillSlug),
      description_text: skillMetadata?.description_text || '',
      description_segments: skillMetadata?.description_segments || [],
      pattern_images: skillMetadata?.pattern_images || [],
      source_url: skillMetadata?.source_url || `${PIUCENTER_SKILL_BASE_URL}/${skillSlug}`,
    },
    total_charts: charts.length,
    mode_filter: modeFilter,
    min_level: minLevel,
    max_level: maxLevel,
    sort,
    user_id: targetUserId || '',
    charts,
  });
});

// PUT /api/songs/chart/:chartId/skills — replace chart skill set
router.put('/chart/:chartId/skills', optionalAuth, (req, res) => {
  const db = getDb();
  const chartId = parseInt(req.params.chartId, 10);
  if (!Number.isFinite(chartId) || chartId <= 0) {
    return res.status(400).json({ error: 'Invalid chart ID' });
  }

  const chart = db.prepare(`
    SELECT id, title, artist, mode, level, jacket_url, bpm, song_key, flags
    FROM songs
    WHERE id = ?
  `).get(chartId);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });

  if (!Array.isArray(req.body?.skills)) {
    return res.status(400).json({ error: 'skills must be an array' });
  }

  const normalized = [];
  const seen = new Set();
  for (const value of req.body.skills) {
    const rawSlug = typeof value === 'string'
      ? value
      : (value?.slug || value?.skill_slug || value?.name || value?.skill_name || '');
    const rawName = typeof value === 'object' && value
      ? (value.name || value.skill_name || '')
      : '';
    const slug = normalizeSkillSlug(rawSlug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    normalized.push({
      slug,
      name: getSkillNameForSlug(slug, rawName),
    });
  }

  if (normalized.length > 64) {
    return res.status(400).json({ error: 'Too many skills; max is 64' });
  }

  const updateSkills = db.transaction((skills) => {
    db.prepare('DELETE FROM chart_skills WHERE chart_id = ?').run(chartId);
    const insertStmt = db.prepare(`
      INSERT INTO chart_skills (chart_id, skill_slug, skill_name, source, created_at, updated_at)
      VALUES (?, ?, ?, 'manual', datetime('now'), datetime('now'))
      ON CONFLICT(chart_id, skill_slug)
      DO UPDATE SET
        skill_name = excluded.skill_name,
        source = 'manual',
        updated_at = datetime('now')
    `);
    for (const skill of skills) {
      insertStmt.run(chartId, skill.slug, skill.name);
    }
  });
  updateSkills(normalized);

  invalidateSongCaches();

  const aliases = loadSongAliases();
  const mode = normalizeMode(chart.mode) || chart.mode;
  const level = parseInt(chart.level, 10) || 0;

  res.json({
    chart: {
      chart_id: chart.id,
      key: makeChartKey(chart.title, mode, level, aliases),
      title: chart.title,
      artist: chart.artist || '',
      mode,
      level,
      jacket_url: chart.jacket_url || '',
      bpm: chart.bpm || '',
      song_key: chart.song_key || '',
      flags: chart.flags || '',
      skills: queryChartSkills(db, chartId),
    },
  });
});

// GET /api/songs/library — grouped songs + per-chart user best snapshot
router.get('/library', optionalAuth, (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const modeFilter = normalizeMode(req.query.mode);
  const songCatalog = getSongCatalog(
    db,
    aliases,
    modeFilter === 'CoOp' ? ['CoOp'] : ['Single', 'Double']
  );

  const search = String(req.query.search || '').trim().toLowerCase();
  const levelFilter = parseLevelQuery(req.query.level);
  const userId = String(req.query.user_id || req.user?.id || '').trim();

  let bestByChart = new Map();
  if (userId) {
    const bestScores = queryUserBestScores(db, userId);
    const recentScores = queryUserRecentScores(db, userId);
    const pumbilityScores = queryUserPumbilityScores(db, userId);
    bestByChart = buildUserBestByChartMap({
      bestScores,
      recentScores,
      pumbilityScores,
      aliases,
      validChartKeys: songCatalog.chartsByKey,
    }).bestByChart;
  }

  const songs = [];
  for (const song of songCatalog.songs) {
    const filteredCharts = song.charts.filter((chart) => {
      if (modeFilter && chart.mode !== modeFilter) return false;
      if (levelFilter && chart.level !== levelFilter) return false;
      if (search) {
        const haystack = `${song.title} ${song.artist}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    }).map((chart) => {
      const best = bestByChart.get(chart.key) || null;
      return {
        ...chart,
        best_score: best ? best.score : null,
        best_grade: best ? best.grade : '',
        is_pass: best ? !!best.is_pass : false,
        is_stage_break: best ? !!best.is_stage_break : false,
      };
    });

    if (filteredCharts.length === 0) continue;
    songs.push({
      song_group_key: song.song_group_key,
      title: song.title,
      artist: song.artist,
      jacket_url: song.jacket_url,
      song_key: song.song_key,
      flags: song.flags,
      charts: filteredCharts,
    });
  }

  res.json({
    total_songs: songs.length,
    total_charts: songs.reduce((sum, song) => sum + song.charts.length, 0),
    songs,
  });
});

// POST /api/songs/list-attempt-counts — count attempts per chart since each addedAt timestamp
router.post('/list-attempt-counts', optionalAuth, (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const userId = String(req.body.user_id || req.user?.id || '').trim();
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  const items = req.body.items;
  if (!Array.isArray(items) || items.length === 0) return res.json({ counts: {} });

  // Fetch all recent plays for this user once
  const allPlays = db.prepare(`
    SELECT song_title, mode, level, date_played
    FROM user_recently_played
    WHERE user_id = ?
  `).all(userId);

  const counts = {};
  for (const item of items) {
    const title = String(item.song_title || '');
    const mode = normalizeMode(item.mode);
    const level = parseInt(item.level, 10) || 0;
    const addedAtMs = parseInt(item.added_at, 10) || 0;
    if (!title || !mode || !level || !addedAtMs) continue;

    const chartKey = makeChartKey(title, mode, level, aliases);
    if (!chartKey) continue;

    let count = 0;
    for (const play of allPlays) {
      const playKey = makeChartKey(play.song_title, play.mode, play.level, aliases);
      if (playKey !== chartKey) continue;
      const playMs = parseDateMs(play.date_played);
      if (playMs >= addedAtMs) count++;
    }
    counts[`${item.chart_id}`] = count;
  }

  res.json({ counts });
});

// GET /api/songs/chart/:chartId/history — historical scores on a chart (includes fails)
router.get('/chart/:chartId/history', optionalAuth, (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const songCatalog = getSongCatalog(db, aliases, ['Single', 'Double', 'CoOp']);
  const chart = songCatalog.chartsById.get(String(req.params.chartId));
  if (!chart) return res.status(404).json({ error: 'Chart not found' });

  const targetUserId = String(req.query.user_id || req.user?.id || '').trim();
  if (!targetUserId) return res.status(400).json({ error: 'user_id is required' });

  const recentRows = db.prepare(`
    SELECT id, user_id, song_title, mode, level, score, grade, plate, background_url, date_played,
           perfect, great, good, bad, miss, max_combo
    FROM user_recently_played
    WHERE user_id = ? AND mode = ? AND level = ?
    ORDER BY id DESC
  `).all(targetUserId, chart.mode, chart.level);

  const chartHistory = recentRows
    .filter((row) => makeChartKey(row.song_title, row.mode, row.level, aliases) === chart.key)
    .map((row) => {
      const grade = getGrade(row);
      const score = scoreValue(row.score);
      const isPass = isPassRecord({ score, grade });
      return {
        id: row.id,
        score,
        grade,
        plate: row.plate || '',
        is_pass: isPass,
        is_stage_break: !isPass,
        date_played: row.date_played || '',
        rating: calculateRating(row.level, grade, isPass),
        perfect: parseInt(row.perfect, 10) || 0,
        great: parseInt(row.great, 10) || 0,
        good: parseInt(row.good, 10) || 0,
        bad: parseInt(row.bad, 10) || 0,
        miss: parseInt(row.miss, 10) || 0,
        max_combo: parseInt(row.max_combo, 10) || 0,
      };
    });

  res.json({
    chart_id: chart.chart_id,
    title: chart.title,
    mode: chart.mode,
    level: chart.level,
    history: chartHistory,
  });
});

// GET /api/songs/chart/:chartId — chart page payload
router.get('/chart/:chartId', optionalAuth, (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const songCatalog = getSongCatalog(db, aliases, ['Single', 'Double', 'CoOp']);
  const chart = songCatalog.chartsById.get(String(req.params.chartId));
  if (!chart) return res.status(404).json({ error: 'Chart not found' });

  const targetUserId = String(req.query.user_id || req.user?.id || '').trim();
  const followFromUserId = String(req.query.follow_from_user_id || req.user?.id || '').trim();

  let userSummary = null;
  let history = [];

  if (targetUserId) {
    const profile = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(targetUserId);
    const bestRows = db.prepare(`
      SELECT id, user_id, song_title, mode, level, score, grade, plate, background_url
      FROM user_best_scores
      WHERE user_id = ? AND mode = ? AND level = ?
    `).all(targetUserId, chart.mode, chart.level);
    const recentRows = db.prepare(`
      SELECT id, user_id, song_title, mode, level, score, grade, plate, background_url, date_played,
             perfect, great, good, bad, miss, max_combo
      FROM user_recently_played
      WHERE user_id = ? AND mode = ? AND level = ?
      ORDER BY id DESC
    `).all(targetUserId, chart.mode, chart.level);

    const bestCandidates = bestRows
      .filter((row) => makeChartKey(row.song_title, row.mode, row.level, aliases) === chart.key);
    const historyRows = recentRows
      .filter((row) => makeChartKey(row.song_title, row.mode, row.level, aliases) === chart.key);

    history = historyRows.map((row) => {
      const grade = getGrade(row);
      const score = scoreValue(row.score);
      const isPass = isPassRecord({ score, grade });
      return {
        id: row.id,
        source: 'recent',
        score,
        grade,
        plate: row.plate || '',
        is_pass: isPass,
        is_stage_break: !isPass,
        date_played: row.date_played || '',
        rating: calculateRating(row.level, grade, isPass),
        perfect: parseInt(row.perfect, 10) || 0,
        great: parseInt(row.great, 10) || 0,
        good: parseInt(row.good, 10) || 0,
        bad: parseInt(row.bad, 10) || 0,
        miss: parseInt(row.miss, 10) || 0,
        max_combo: parseInt(row.max_combo, 10) || 0,
      };
    });

    let bestPass = null;
    for (const row of bestCandidates) {
      const record = {
        id: row.id,
        source: 'best',
        score: scoreValue(row.score),
        grade: getGrade(row),
        plate: row.plate || '',
        date_played: '',
      };
      if (!isPassRecord(record)) continue;
      bestPass = compareRecords(bestPass, { ...record, is_pass: true, is_stage_break: false });
    }
    for (const row of history) {
      if (!row.is_pass) continue;
      bestPass = compareRecords(bestPass, row);
    }

    let bestFail = null;
    for (const row of history) {
      if (row.is_pass) continue;
      bestFail = compareRecords(bestFail, row);
    }

    const personalBest = bestPass || bestFail || null;

    // Include best score as a synthetic history point when older runs are missing from recent sync.
    if (personalBest && !history.some((entry) => entry.score === personalBest.score && entry.grade === personalBest.grade)) {
      history.push({
        id: `best-${personalBest.id}`,
        source: 'best',
        score: personalBest.score,
        grade: personalBest.grade,
        plate: personalBest.plate || '',
        is_pass: !!personalBest.is_pass,
        is_stage_break: !!personalBest.is_stage_break,
        date_played: personalBest.date_played || '',
        rating: calculateRating(chart.level, personalBest.grade, !!personalBest.is_pass),
        perfect: 0,
        great: 0,
        good: 0,
        bad: 0,
        miss: 0,
        max_combo: 0,
      });
    }

    userSummary = {
      user: profile ? {
        id: profile.id,
        username: profile.username,
        avatar: normalizeUserAvatarForList(profile.avatar, profile.id, 64),
      } : null,
      best: personalBest ? {
        ...personalBest,
        rating: calculateRating(chart.level, personalBest.grade, !!personalBest.is_pass),
      } : null,
    };
  }

  const progression = [...history]
    .sort((a, b) => {
      const aTime = parseDateMs(a.date_played);
      const bTime = parseDateMs(b.date_played);
      if (aTime !== bTime) return aTime - bTime;
      const aId = parseInt(a.id, 10) || 0;
      const bId = parseInt(b.id, 10) || 0;
      return aId - bId;
    })
    .map((row, idx) => ({
      idx: idx + 1,
      score: row.score,
      grade: row.grade,
      is_pass: row.is_pass,
      is_stage_break: row.is_stage_break,
      date_played: row.date_played || '',
      label: row.date_played ? String(row.date_played).slice(0, 10) : `Run ${idx + 1}`,
    }));

  let friendRecords = [];
  if (followFromUserId) {
    const following = db.prepare(`
      SELECT u.id, u.username, u.avatar
      FROM user_follows f
      JOIN users u ON u.id = f.following_id
      WHERE f.follower_id = ?
    `).all(followFromUserId);

    if (following.length > 0) {
      const followIds = following.map((row) => row.id);
      const placeholders = followIds.map(() => '?').join(', ');
      const bestRows = db.prepare(`
        SELECT id, user_id, song_title, mode, level, score, grade, plate, background_url
        FROM user_best_scores
        WHERE user_id IN (${placeholders}) AND mode = ? AND level = ?
      `).all(...followIds, chart.mode, chart.level);
      const recentRows = db.prepare(`
        SELECT id, user_id, song_title, mode, level, score, grade, plate, background_url, date_played,
               perfect, great, good, bad, miss, max_combo
        FROM user_recently_played
        WHERE user_id IN (${placeholders}) AND mode = ? AND level = ?
      `).all(...followIds, chart.mode, chart.level);

      const byUserPass = new Map();
      const byUserFail = new Map();
      const maybeAssign = (row, source) => {
        if (makeChartKey(row.song_title, row.mode, row.level, aliases) !== chart.key) return;
        const score = scoreValue(row.score);
        const grade = getGrade(row);
        const shaped = {
          id: row.id,
          source,
          user_id: row.user_id,
          score,
          grade,
          plate: row.plate || '',
          date_played: row.date_played || '',
          perfect: parseInt(row.perfect, 10) || 0,
          great: parseInt(row.great, 10) || 0,
          good: parseInt(row.good, 10) || 0,
          bad: parseInt(row.bad, 10) || 0,
          miss: parseInt(row.miss, 10) || 0,
          max_combo: parseInt(row.max_combo, 10) || 0,
          is_pass: isPassRecord({ score, grade }),
          is_stage_break: !isPassRecord({ score, grade }),
        };
        if (shaped.is_pass) {
          byUserPass.set(row.user_id, compareRecords(byUserPass.get(row.user_id), shaped));
        } else {
          byUserFail.set(row.user_id, compareRecords(byUserFail.get(row.user_id), shaped));
        }
      };

      for (const row of bestRows) maybeAssign(row, 'best');
      for (const row of recentRows) maybeAssign(row, 'recent');

      friendRecords = following.map((friend) => {
        const record = byUserPass.get(friend.id) || byUserFail.get(friend.id) || null;
        if (!record) return null;
        return {
          user: {
            id: friend.id,
            username: friend.username,
            avatar: normalizeUserAvatarForList(friend.avatar, friend.id, 56),
          },
          best: {
            ...record,
            rating: calculateRating(chart.level, record.grade, record.is_pass),
          },
        };
      }).filter(Boolean);

      friendRecords.sort((a, b) => {
        if (a.best.is_pass !== b.best.is_pass) return a.best.is_pass ? -1 : 1;
        if (a.best.score !== b.best.score) return b.best.score - a.best.score;
        return parseDateMs(b.best.date_played) - parseDateMs(a.best.date_played);
      });
    }
  }

  res.json({
    chart,
    user_summary: userSummary,
    progression,
    history: history.sort((a, b) => {
      const dt = parseDateMs(b.date_played) - parseDateMs(a.date_played);
      if (dt !== 0) return dt;
      return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
    }),
    friend_records: friendRecords,
  });
});

// GET /api/songs/analytics/user/:userId — clear/rating progress, level totals, pumbility metrics
router.get('/analytics/user/:userId', (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const songCatalog = getSongCatalog(db, aliases);
  const userId = String(req.params.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!userExists) return res.status(404).json({ error: 'User not found' });

  const result = getUserAnalytics(db, userId, aliases, songCatalog);
  res.json(result.analytics);
});

// GET /api/songs/analytics/head-to-head
// Query:
// - user_a_id, user_b_id (required)
// - level (optional)
// - mode: Single | Double | Both (default Both)
router.get('/analytics/head-to-head', (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const songCatalog = getSongCatalog(db, aliases);

  const userAId = String(req.query.user_a_id || '').trim();
  const userBId = String(req.query.user_b_id || '').trim();
  if (!userAId || !userBId) return res.status(400).json({ error: 'user_a_id and user_b_id are required' });
  const userAExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userAId);
  const userBExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userBId);
  if (!userAExists || !userBExists) return res.status(404).json({ error: 'One or both users were not found' });

  const modeList = expandMode(req.query.mode);
  const level = parseLevelQuery(req.query.level);

  const userA = getUserAnalytics(db, userAId, aliases, songCatalog);
  const userB = getUserAnalytics(db, userBId, aliases, songCatalog);

  const inFilter = (record) => {
    if (!record) return false;
    if (!modeList.includes(record.mode)) return false;
    if (level && record.level !== level) return false;
    return true;
  };

  const aPass = new Map(
    [...userA.passBestByChart.entries()].filter(([, record]) => inFilter(record))
  );
  const bPass = new Map(
    [...userB.passBestByChart.entries()].filter(([, record]) => inFilter(record))
  );

  let sharedCount = 0;
  let userAWins = 0;
  let userBWins = 0;
  let ties = 0;
  const songResults = [];

  for (const [key, aRecord] of aPass.entries()) {
    const bRecord = bPass.get(key);
    if (!aRecord || !bRecord) continue;

    sharedCount += 1;
    let winner = 'tie';
    if (aRecord.score > bRecord.score) {
      userAWins += 1;
      winner = 'a';
    } else if (bRecord.score > aRecord.score) {
      userBWins += 1;
      winner = 'b';
    } else {
      ties += 1;
    }

    const chart = songCatalog.chartsByKey.get(key);
    songResults.push({
      chart_id: chart?.chart_id || null,
      title: chart?.title || aRecord.song_title || bRecord.song_title,
      mode: chart?.mode || aRecord.mode,
      level: chart?.level || aRecord.level,
      jacket_url: chart?.jacket_url || '',
      score_a: aRecord.score,
      grade_a: aRecord.grade || gradeFromScore(aRecord.score),
      rating_a: calculateRating(chart?.level || aRecord.level, aRecord.grade || gradeFromScore(aRecord.score), true),
      score_b: bRecord.score,
      grade_b: bRecord.grade || gradeFromScore(bRecord.score),
      rating_b: calculateRating(chart?.level || bRecord.level, bRecord.grade || gradeFromScore(bRecord.score), true),
      winner,
    });
  }

  const modeLabel = modeList.length === 2 ? 'both' : (modeList[0] || '').toLowerCase();

  const sourceFor = (analytics) => {
    const source = modeLabel === 'single'
      ? analytics?.levels?.single
      : modeLabel === 'double'
        ? analytics?.levels?.double
        : analytics?.levels?.both;
    return Array.isArray(source) ? source : [];
  };

  const ratingFor = (analytics) => {
    const source = sourceFor(analytics);
    if (!Array.isArray(source)) return 0;
    if (!level) {
      return source.reduce((sum, row) => sum + (parseInt(row.rating_total, 10) || 0), 0);
    }
    const row = source.find((entry) => entry.level === level);
    return row ? parseInt(row.rating_total, 10) || 0 : 0;
  };

  const totalPassedFor = (analytics) => {
    const source = sourceFor(analytics);
    if (!Array.isArray(source)) return 0;
    if (!level) {
      return source.reduce((sum, row) => sum + (parseInt(row.cleared_charts, 10) || 0), 0);
    }
    const row = source.find((entry) => entry.level === level);
    return row ? parseInt(row.cleared_charts, 10) || 0 : 0;
  };

  const ratingA = ratingFor(userA.analytics);
  const ratingB = ratingFor(userB.analytics);
  const totalPassedA = totalPassedFor(userA.analytics);
  const totalPassedB = totalPassedFor(userB.analytics);

  const metricWins = {
    higher_score: userAWins > userBWins ? 'a' : userBWins > userAWins ? 'b' : null,
    rating_total: ratingA > ratingB ? 'a' : ratingB > ratingA ? 'b' : null,
    total_passed: totalPassedA > totalPassedB ? 'a' : totalPassedB > totalPassedA ? 'b' : null,
  };

  const userAMetricWins = Object.values(metricWins).filter((winner) => winner === 'a').length;
  const userBMetricWins = Object.values(metricWins).filter((winner) => winner === 'b').length;

  let clearCutWinner = null;
  if (userAMetricWins >= 2 && userAMetricWins > userBMetricWins) clearCutWinner = userAId;
  if (userBMetricWins >= 2 && userBMetricWins > userAMetricWins) clearCutWinner = userBId;

  const topSongDiffs = songResults
    .sort((a, b) => Math.abs(b.score_a - b.score_b) - Math.abs(a.score_a - a.score_b))
    .slice(0, 25);

  res.json({
    users: {
      a: userA.analytics.user,
      b: userB.analytics.user,
    },
    highlighted_stats: {
      pumbility: {
        a: userA.analytics.pumbility,
        b: userB.analytics.pumbility,
      },
      singles_pumbility: {
        a: userA.analytics.singles_pumbility,
        b: userB.analytics.singles_pumbility,
      },
      doubles_competitive_level: {
        a: userA.analytics.competitive_levels.double,
        b: userB.analytics.competitive_levels.double,
      },
      singles_competitive_level: {
        a: userA.analytics.competitive_levels.single,
        b: userB.analytics.competitive_levels.single,
      },
    },
    comparison: {
      level,
      mode: modeLabel,
      shared_chart_count: sharedCount,
      wins: {
        a: userAWins,
        b: userBWins,
        ties,
      },
      rating: {
        a: ratingA,
        b: ratingB,
      },
      total_passed: {
        a: totalPassedA,
        b: totalPassedB,
      },
      metric_wins: metricWins,
      clear_cut_winner: clearCutWinner,
    },
    level_series: {
      single: {
        a: userA.analytics.levels.single,
        b: userB.analytics.levels.single,
      },
      double: {
        a: userA.analytics.levels.double,
        b: userB.analytics.levels.double,
      },
      both: {
        a: userA.analytics.levels.both,
        b: userB.analytics.levels.both,
      },
    },
    top_song_diffs: topSongDiffs,
  });
});

// GET /api/songs/analytics/sniping
// Query:
// - user_a_id, user_b_id (required)
// - level (optional)
// - mode: Single | Double | Both (default Both)
// - page (optional, default 1)
// - limit (optional, default 50, max 100)
// Returns only shared passed charts where user_b score is higher than user_a score.
router.get('/analytics/sniping', (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const songCatalog = getSongCatalog(db, aliases);

  const userAId = String(req.query.user_a_id || '').trim();
  const userBId = String(req.query.user_b_id || '').trim();
  if (!userAId || !userBId) return res.status(400).json({ error: 'user_a_id and user_b_id are required' });
  const userAExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userAId);
  const userBExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userBId);
  if (!userAExists || !userBExists) return res.status(404).json({ error: 'One or both users were not found' });

  const modeList = expandMode(req.query.mode);
  const level = parseLevelQuery(req.query.level);

  const pageRaw = parseInt(req.query.page, 10);
  const limitRaw = parseInt(req.query.limit, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;

  const userA = getUserAnalytics(db, userAId, aliases, songCatalog);
  const userB = getUserAnalytics(db, userBId, aliases, songCatalog);

  const inFilter = (record) => {
    if (!record) return false;
    if (!modeList.includes(record.mode)) return false;
    if (level && record.level !== level) return false;
    return true;
  };

  const aPass = new Map(
    [...userA.passBestByChart.entries()].filter(([, record]) => inFilter(record))
  );
  const bPass = new Map(
    [...userB.passBestByChart.entries()].filter(([, record]) => inFilter(record))
  );

  let sharedCount = 0;
  let userAWins = 0;
  let userBWins = 0;
  let ties = 0;
  const opponentWins = [];

  for (const [key, aRecord] of aPass.entries()) {
    const bRecord = bPass.get(key);
    if (!aRecord || !bRecord) continue;

    sharedCount += 1;
    let winner = 'tie';
    if (aRecord.score > bRecord.score) {
      userAWins += 1;
      winner = 'a';
    } else if (bRecord.score > aRecord.score) {
      userBWins += 1;
      winner = 'b';
    } else {
      ties += 1;
    }

    if (winner !== 'b') continue;

    const chart = songCatalog.chartsByKey.get(key);
    const resolvedLevel = chart?.level || bRecord.level || aRecord.level;
    opponentWins.push({
      chart_id: chart?.chart_id || null,
      title: chart?.title || aRecord.song_title || bRecord.song_title,
      mode: chart?.mode || bRecord.mode || aRecord.mode,
      level: resolvedLevel,
      jacket_url: chart?.jacket_url || '',
      score_a: aRecord.score,
      grade_a: aRecord.grade || gradeFromScore(aRecord.score),
      rating_a: calculateRating(resolvedLevel, aRecord.grade || gradeFromScore(aRecord.score), true),
      score_b: bRecord.score,
      grade_b: bRecord.grade || gradeFromScore(bRecord.score),
      rating_b: calculateRating(resolvedLevel, bRecord.grade || gradeFromScore(bRecord.score), true),
      winner,
      score_diff: Math.max(0, (bRecord.score || 0) - (aRecord.score || 0)),
    });
  }

  opponentWins.sort((a, b) => {
    if ((b.score_diff || 0) !== (a.score_diff || 0)) return (b.score_diff || 0) - (a.score_diff || 0);
    if ((b.level || 0) !== (a.level || 0)) return (b.level || 0) - (a.level || 0);
    if ((b.score_b || 0) !== (a.score_b || 0)) return (b.score_b || 0) - (a.score_b || 0);
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  });

  const modeLabel = modeList.length === 2 ? 'both' : (modeList[0] || '').toLowerCase();

  const sourceFor = (analytics) => {
    const source = modeLabel === 'single'
      ? analytics?.levels?.single
      : modeLabel === 'double'
        ? analytics?.levels?.double
        : analytics?.levels?.both;
    return Array.isArray(source) ? source : [];
  };

  const ratingFor = (analytics) => {
    const source = sourceFor(analytics);
    if (!Array.isArray(source)) return 0;
    if (!level) {
      return source.reduce((sum, row) => sum + (parseInt(row.rating_total, 10) || 0), 0);
    }
    const row = source.find((entry) => entry.level === level);
    return row ? parseInt(row.rating_total, 10) || 0 : 0;
  };

  const totalPassedFor = (analytics) => {
    const source = sourceFor(analytics);
    if (!Array.isArray(source)) return 0;
    if (!level) {
      return source.reduce((sum, row) => sum + (parseInt(row.cleared_charts, 10) || 0), 0);
    }
    const row = source.find((entry) => entry.level === level);
    return row ? parseInt(row.cleared_charts, 10) || 0 : 0;
  };

  const ratingA = ratingFor(userA.analytics);
  const ratingB = ratingFor(userB.analytics);
  const totalPassedA = totalPassedFor(userA.analytics);
  const totalPassedB = totalPassedFor(userB.analytics);

  const metricWins = {
    higher_score: userAWins > userBWins ? 'a' : userBWins > userAWins ? 'b' : null,
    rating_total: ratingA > ratingB ? 'a' : ratingB > ratingA ? 'b' : null,
    total_passed: totalPassedA > totalPassedB ? 'a' : totalPassedB > totalPassedA ? 'b' : null,
  };

  const userAMetricWins = Object.values(metricWins).filter((winner) => winner === 'a').length;
  const userBMetricWins = Object.values(metricWins).filter((winner) => winner === 'b').length;

  let clearCutWinner = null;
  if (userAMetricWins >= 2 && userAMetricWins > userBMetricWins) clearCutWinner = userAId;
  if (userBMetricWins >= 2 && userBMetricWins > userAMetricWins) clearCutWinner = userBId;

  const totalItems = opponentWins.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const rows = opponentWins.slice(start, start + limit);

  res.json({
    users: {
      a: userA.analytics.user,
      b: userB.analytics.user,
    },
    comparison: {
      level,
      mode: modeLabel,
      shared_chart_count: sharedCount,
      wins: {
        a: userAWins,
        b: userBWins,
        ties,
      },
      rating: {
        a: ratingA,
        b: ratingB,
      },
      total_passed: {
        a: totalPassedA,
        b: totalPassedB,
      },
      metric_wins: metricWins,
      clear_cut_winner: clearCutWinner,
    },
    pagination: {
      page: currentPage,
      limit,
      total_items: totalItems,
      total_pages: totalPages,
      has_previous_page: currentPage > 1,
      has_next_page: currentPage < totalPages,
    },
    top_song_diffs: rows,
  });
});

// GET /api/songs/tiers/meta — available tier levels by mode
router.get('/tiers/meta', (req, res) => {
  const db = getDb();
  const tierListType = normalizeTierListType(req.query.tier_list_type);
  const rows = db.prepare(`
    SELECT mode, level, COUNT(*) as chart_count
    FROM chart_tiers
    WHERE tier_list_type = ?
    GROUP BY mode, level
    ORDER BY mode ASC, level ASC
  `).all(tierListType);

  const levelsByMode = { Single: [], Double: [], CoOp: [] };
  for (const row of rows) {
    const mode = normalizeMode(row.mode);
    const level = parseInt(row.level, 10) || 0;
    if (!mode || level <= 0) continue;
    levelsByMode[mode].push({
      level,
      chart_count: parseInt(row.chart_count, 10) || 0,
    });
  }

  for (const mode of Object.keys(levelsByMode)) {
    levelsByMode[mode].sort((a, b) => a.level - b.level);
  }

  const modePriority = ['Double', 'Single', 'CoOp'];
  const defaultMode = modePriority.find((mode) => levelsByMode[mode].length > 0)
    || Object.keys(levelsByMode).find((mode) => levelsByMode[mode].length > 0)
    || 'Double';
  const defaultLevel = levelsByMode[defaultMode][0]?.level || null;

  res.json({
    tier_list_type: tierListType,
    levels_by_mode: levelsByMode,
    tier_order: TIER_NAME_ORDER,
    default_mode: defaultMode,
    default_level: defaultLevel,
  });
});

// GET /api/songs/tiers — tier rows for a mode + level (with optional user overlay)
router.get('/tiers', optionalAuth, (req, res) => {
  const db = getDb();
  const aliases = loadSongAliases();
  const tierListType = normalizeTierListType(req.query.tier_list_type);

  const levelsByModeRows = db.prepare(`
    SELECT mode, level, COUNT(*) as chart_count
    FROM chart_tiers
    WHERE tier_list_type = ?
    GROUP BY mode, level
    ORDER BY mode ASC, level ASC
  `).all(tierListType);

  const levelsByMode = { Single: [], Double: [], CoOp: [] };
  for (const row of levelsByModeRows) {
    const mode = normalizeMode(row.mode);
    const level = parseInt(row.level, 10) || 0;
    if (!mode || level <= 0) continue;
    levelsByMode[mode].push({
      level,
      chart_count: parseInt(row.chart_count, 10) || 0,
    });
  }
  for (const mode of Object.keys(levelsByMode)) {
    levelsByMode[mode].sort((a, b) => a.level - b.level);
  }

  const modePriority = ['Double', 'Single', 'CoOp'];
  const fallbackMode = modePriority.find((mode) => levelsByMode[mode].length > 0)
    || Object.keys(levelsByMode).find((mode) => levelsByMode[mode].length > 0)
    || 'Double';

  let mode = normalizeMode(req.query.mode) || fallbackMode;
  if (!levelsByMode[mode] || levelsByMode[mode].length === 0) {
    mode = fallbackMode;
  }

  const levelList = levelsByMode[mode] || [];
  let level = parseLevelQuery(req.query.level);
  if (!levelList.some((entry) => entry.level === level)) {
    level = levelList[0]?.level || null;
  }

  if (!level || !mode) {
    return res.json({
      tier_list_type: tierListType,
      mode,
      level,
      levels_by_mode: levelsByMode,
      tier_order: TIER_NAME_ORDER,
      total_charts: 0,
      tiers: [],
    });
  }

  const rows = db.prepare(`
    SELECT
      ct.tier_name,
      ct.tier_rank,
      ct.chart_id,
      ct.source_slug,
      ct.source_url,
      s.title,
      s.artist,
      s.jacket_url,
      s.mode as song_mode,
      s.level as song_level,
      s.flags,
      s.song_key,
      s.bpm
    FROM chart_tiers ct
    JOIN songs s ON s.id = ct.chart_id
    WHERE ct.tier_list_type = ? AND ct.mode = ? AND ct.level = ?
    ORDER BY ct.tier_rank ASC, s.title COLLATE NOCASE ASC, s.id ASC
  `).all(tierListType, mode, level);

  const selectedChartKeys = new Set();
  const chartKeyByChartId = new Map();
  for (const row of rows) {
    const key = makeChartKey(row.title, row.song_mode, row.song_level, aliases);
    if (!key) continue;
    selectedChartKeys.add(key);
    chartKeyByChartId.set(parseInt(row.chart_id, 10), key);
  }

  const targetUserId = String(req.query.user_id || req.user?.id || '').trim();
  let bestByChart = new Map();
  if (targetUserId && selectedChartKeys.size > 0) {
    const bestScores = queryUserBestScores(db, targetUserId);
    const recentScores = queryUserRecentScores(db, targetUserId);
    const pumbilityScores = queryUserPumbilityScores(db, targetUserId);
    bestByChart = buildUserBestByChartMap({
      bestScores,
      recentScores,
      pumbilityScores,
      aliases,
      validChartKeys: selectedChartKeys,
    }).bestByChart;
  }

  const tierMap = new Map();
  for (const row of rows) {
    const tierName = normalizeTierName(row.tier_name);
    const tierRank = Number.isFinite(parseInt(row.tier_rank, 10))
      ? parseInt(row.tier_rank, 10)
      : getTierRank(tierName);

    if (!tierMap.has(tierName)) {
      tierMap.set(tierName, {
        name: tierName,
        rank: tierRank,
        charts: [],
      });
    }

    const chartId = parseInt(row.chart_id, 10) || 0;
    const chartKey = chartKeyByChartId.get(chartId) || '';
    const best = chartKey ? bestByChart.get(chartKey) : null;

    tierMap.get(tierName).charts.push({
      chart_id: chartId,
      title: row.title,
      artist: row.artist || '',
      mode: normalizeMode(row.song_mode) || mode,
      level: parseInt(row.song_level, 10) || level,
      jacket_url: row.jacket_url || '',
      bpm: row.bpm || '',
      song_key: row.song_key || '',
      flags: String(row.flags || '')
        .split(',')
        .map((flag) => flag.trim())
        .filter(Boolean),
      source_slug: row.source_slug || '',
      source_url: row.source_url || '',
      best_score: best ? best.score : null,
      best_grade: best ? best.grade : '',
      is_pass: best ? !!best.is_pass : false,
      is_stage_break: best ? !!best.is_stage_break : false,
      best_source: best ? best.source : '',
      best_date_played: best ? best.date_played || '' : '',
    });
  }

  const tiers = Array.from(tierMap.values())
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  res.json({
    tier_list_type: tierListType,
    mode,
    level,
    levels_by_mode: levelsByMode,
    tier_order: TIER_NAME_ORDER,
    total_charts: rows.length,
    tiers,
  });
});

// GET all songs (with optional filters)
router.get('/', (req, res) => {
  const db = getDb();
  const { min_level, max_level, mode, search } = req.query;
  let query = 'SELECT * FROM songs WHERE 1=1';
  const params = [];

  if (min_level) { query += ' AND level >= ?'; params.push(parseInt(min_level)); }
  if (max_level) { query += ' AND level <= ?'; params.push(parseInt(max_level)); }
  if (mode) { query += ' AND mode = ?'; params.push(mode); }
  if (search) { query += ' AND (title LIKE ? OR artist LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  query += ' ORDER BY level ASC, title ASC';
  const songs = db.prepare(query).all(...params);
  res.json(songs);
});

// GET song count by level
router.get('/stats', (req, res) => {
  const db = getDb();
  const stats = db.prepare(
    'SELECT level, mode, COUNT(*) as count FROM songs GROUP BY level, mode ORDER BY level ASC'
  ).all();
  const total = db.prepare('SELECT COUNT(*) as count FROM songs').get();
  res.json({ total: total.count, by_level: stats });
});

// POST bulk import songs
router.post('/import', (req, res) => {
  const db = getDb();
  const { songs } = req.body;

  const stmt = db.prepare(`
    INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key, flags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importSongs = db.transaction((songList) => {
    let imported = 0;
    for (const song of songList) {
      const flags = Array.isArray(song.flags) ? song.flags.join(',') : (song.flags || '');
      stmt.run(song.title, song.artist || '', song.jacket_url || '', song.mode, song.level, song.bpm || '', song.song_key || '', flags);
      imported++;
    }
    return imported;
  });

  const count = importSongs(songs);
  invalidateSongCaches();
  res.json({ imported: count });
});

// ─── Song Recommendations ───────────────────────────────────────────────

const RATING_TABLE = {
  10:  { AA: 100, 'AA+': 100, AAA: 105, 'AAA+': 110, S: 115, 'S+': 120, SS: 126, 'SS+': 132, SSS: 138, 'SSS+': 144 },
  11:  { AA: 110, 'AA+': 110, AAA: 116, 'AAA+': 121, S: 127, 'S+': 132, SS: 139, 'SS+': 145, SSS: 152, 'SSS+': 158 },
  12:  { AA: 130, 'AA+': 130, AAA: 137, 'AAA+': 143, S: 150, 'S+': 156, SS: 164, 'SS+': 172, SSS: 179, 'SSS+': 187 },
  13:  { AA: 160, 'AA+': 160, AAA: 168, 'AAA+': 176, S: 184, 'S+': 192, SS: 202, 'SS+': 211, SSS: 221, 'SSS+': 230 },
  14:  { AA: 200, 'AA+': 200, AAA: 210, 'AAA+': 220, S: 230, 'S+': 240, SS: 252, 'SS+': 264, SSS: 276, 'SSS+': 288 },
  15:  { AA: 250, 'AA+': 250, AAA: 263, 'AAA+': 275, S: 288, 'S+': 300, SS: 315, 'SS+': 330, SSS: 345, 'SSS+': 360 },
  16:  { AA: 310, 'AA+': 310, AAA: 326, 'AAA+': 341, S: 357, 'S+': 372, SS: 391, 'SS+': 409, SSS: 428, 'SSS+': 446 },
  17:  { AA: 380, 'AA+': 380, AAA: 399, 'AAA+': 418, S: 437, 'S+': 456, SS: 479, 'SS+': 502, SSS: 524, 'SSS+': 547 },
  18:  { AA: 460, 'AA+': 460, AAA: 483, 'AAA+': 506, S: 529, 'S+': 552, SS: 580, 'SS+': 607, SSS: 635, 'SSS+': 662 },
  19:  { AA: 550, 'AA+': 550, AAA: 578, 'AAA+': 605, S: 633, 'S+': 660, SS: 693, 'SS+': 726, SSS: 759, 'SSS+': 792 },
  20:  { AA: 650, 'AA+': 650, AAA: 683, 'AAA+': 715, S: 748, 'S+': 780, SS: 819, 'SS+': 858, SSS: 897, 'SSS+': 936 },
  21:  { AA: 760, 'AA+': 760, AAA: 798, 'AAA+': 836, S: 874, 'S+': 912, SS: 958, 'SS+': 1003, SSS: 1049, 'SSS+': 1094 },
  22:  { AA: 880, 'AA+': 880, AAA: 924, 'AAA+': 968, S: 1012, 'S+': 1056, SS: 1109, 'SS+': 1162, SSS: 1214, 'SSS+': 1267 },
  23:  { AA: 1010, 'AA+': 1010, AAA: 1061, 'AAA+': 1111, S: 1162, 'S+': 1212, SS: 1273, 'SS+': 1333, SSS: 1394, 'SSS+': 1454 },
  24:  { AA: 1150, 'AA+': 1150, AAA: 1208, 'AAA+': 1265, S: 1323, 'S+': 1380, SS: 1449, 'SS+': 1518, SSS: 1587, 'SSS+': 1656 },
  25:  { AA: 1300, 'AA+': 1300, AAA: 1365, 'AAA+': 1430, S: 1495, 'S+': 1560, SS: 1638, 'SS+': 1716, SSS: 1794, 'SSS+': 1872 },
  26:  { AA: 1460, 'AA+': 1460, AAA: 1533, 'AAA+': 1606, S: 1679, 'S+': 1752, SS: 1840, 'SS+': 1927, SSS: 2015, 'SSS+': 2102 },
  27:  { AA: 1630, 'AA+': 1630, AAA: 1712, 'AAA+': 1793, S: 1875, 'S+': 1956, SS: 2054, 'SS+': 2152, SSS: 2249, 'SSS+': 2347 },
  28:  { AA: 1810, 'AA+': 1810, AAA: 1901, 'AAA+': 1991, S: 2082, 'S+': 2172, SS: 2281, 'SS+': 2389, SSS: 2498, 'SSS+': 2606 },
};

const SORTED_LEVELS = Object.keys(RATING_TABLE).map(Number).sort((a, b) => a - b);

function determineUserLevels(avgRating) {
  let passingLevel = SORTED_LEVELS[0];
  let scoringLevel = SORTED_LEVELS[0];

  for (const lvl of SORTED_LEVELS) {
    if (RATING_TABLE[lvl].AA <= avgRating) passingLevel = lvl;
    if (RATING_TABLE[lvl].SSS <= avgRating) scoringLevel = lvl;
  }

  return { passingLevel, scoringLevel };
}

function pickCharts({ candidates, count, bestByChart, aliases, preferUnplayed = true }) {
  if (candidates.length === 0) return [];

  const unplayed = [];
  const played = [];

  for (const chart of candidates) {
    const key = makeChartKey(chart.title, chart.mode, chart.level, aliases);
    const best = bestByChart.get(key);
    if (!best) {
      unplayed.push(chart);
    } else {
      played.push({ chart, score: best.score });
    }
  }

  // Shuffle unplayed for variety
  for (let i = unplayed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unplayed[i], unplayed[j]] = [unplayed[j], unplayed[i]];
  }

  // Sort played by lowest score first
  played.sort((a, b) => a.score - b.score);

  const picked = [];
  const usedIds = new Set();

  if (preferUnplayed) {
    for (const chart of unplayed) {
      if (picked.length >= count) break;
      if (usedIds.has(chart.chart_id)) continue;
      usedIds.add(chart.chart_id);
      picked.push(chart);
    }
  }

  for (const { chart } of played) {
    if (picked.length >= count) break;
    if (usedIds.has(chart.chart_id)) continue;
    usedIds.add(chart.chart_id);
    picked.push(chart);
  }

  if (!preferUnplayed) {
    for (const chart of unplayed) {
      if (picked.length >= count) break;
      if (usedIds.has(chart.chart_id)) continue;
      usedIds.add(chart.chart_id);
      picked.push(chart);
    }
  }

  return picked;
}

function filterChartsBySkills(charts, mustHaveSlugs, avoidSlugs) {
  return charts.filter((chart) => {
    const chartSkillSlugs = new Set((chart.skills || []).map((s) => s.slug));

    // If chart has no skills tagged, we can't guarantee it matches - skip it
    if (mustHaveSlugs.length > 0 && chartSkillSlugs.size === 0) return false;

    // Must have at least one of the required skills
    if (mustHaveSlugs.length > 0) {
      const hasAny = mustHaveSlugs.some((slug) => chartSkillSlugs.has(slug));
      if (!hasAny) return false;
    }

    // Must NOT have any of the avoided skills
    for (const slug of avoidSlugs) {
      if (chartSkillSlugs.has(slug)) return false;
    }

    return true;
  });
}

function normalizeTrainingChartMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'single' || raw === 'singles' || raw === 's') {
    return { ok: true, chartMode: 'single', allowedModes: ['Single'] };
  }
  if (raw === 'double' || raw === 'doubles' || raw === 'd') {
    return { ok: true, chartMode: 'double', allowedModes: ['Double'] };
  }
  if (raw === 'both' || raw === 'all') {
    return { ok: true, chartMode: 'both', allowedModes: ['Single', 'Double'] };
  }
  return { ok: false, chartMode: 'single', allowedModes: ['Single'] };
}

function buildTrainingRecommendations({
  songCatalog,
  bestByChart,
  minLevel,
  maxLevel,
  limit = 10,
}) {
  const normalizedMinLevel = parseInt(minLevel, 10) || 0;
  const normalizedMaxLevel = parseInt(maxLevel, 10) || 0;

  const inRangeCharts = songCatalog.charts.filter((chart) => {
    const level = parseInt(chart.level, 10) || 0;
    return level >= normalizedMinLevel && level <= normalizedMaxLevel;
  });

  const lowScorePassed = [];
  for (const chart of inRangeCharts) {
    const best = bestByChart.get(chart.key);
    if (!best || !best.is_pass) continue;
    const bestScore = scoreValue(best.score);
    if (bestScore <= 0) continue;
    const bestGrade = getGrade(best);
    const gradeIndex = GRADE_INDEX[bestGrade];
    // Training "low score" definition: strictly below AAA.
    if (!Number.isFinite(gradeIndex) || gradeIndex >= GRADE_INDEX.AAA) continue;
    lowScorePassed.push({ chart, best, bestScore });
  }
  lowScorePassed.sort((a, b) => {
    if (a.bestScore !== b.bestScore) return a.bestScore - b.bestScore;
    if ((a.chart.level || 0) !== (b.chart.level || 0)) return (a.chart.level || 0) - (b.chart.level || 0);
    return String(a.chart.title || '').localeCompare(String(b.chart.title || ''), undefined, { sensitivity: 'base' });
  });

  const skillStats = new Map();
  const weakSkillSource = lowScorePassed.slice(0, 120);
  for (const row of weakSkillSource) {
    const seen = new Set();
    for (const skill of row.chart.skills || []) {
      const slug = normalizeSkillSlug(skill?.slug || skill?.skill_slug);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      const entry = skillStats.get(slug) || {
        slug,
        name: getSkillNameForSlug(slug, skill?.name || skill?.skill_name),
        count: 0,
        score_sum: 0,
        lowest_score: 0,
        pressure_weight: 0,
      };
      entry.count += 1;
      entry.score_sum += row.bestScore;
      entry.lowest_score = entry.lowest_score > 0 ? Math.min(entry.lowest_score, row.bestScore) : row.bestScore;
      entry.pressure_weight += Math.max(1, 1000000 - row.bestScore);
      skillStats.set(slug, entry);
    }
  }

  const weakSkills = Array.from(skillStats.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.pressure_weight !== a.pressure_weight) return b.pressure_weight - a.pressure_weight;
      return a.lowest_score - b.lowest_score;
    })
    .slice(0, 8)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      count: entry.count,
      average_score: entry.count > 0 ? Math.round(entry.score_sum / entry.count) : 0,
      lowest_score: entry.lowest_score,
    }));
  const weakSkillSet = new Set(weakSkills.map((entry) => entry.slug));

  const buildSkillHits = (chart) => {
    const hits = [];
    const seen = new Set();
    for (const skill of chart.skills || []) {
      const slug = normalizeSkillSlug(skill?.slug || skill?.skill_slug);
      if (!slug || seen.has(slug) || !weakSkillSet.has(slug)) continue;
      seen.add(slug);
      const stat = skillStats.get(slug);
      hits.push({
        slug,
        name: getSkillNameForSlug(slug, skill?.name || skill?.skill_name),
        count: stat?.count || 0,
      });
    }
    hits.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    return hits;
  };

  const buildRow = ({ chart, best, reason }) => {
    const bestScore = best ? scoreValue(best.score) : null;
    const bestGrade = best ? getGrade(best) : '';
    const skillHits = buildSkillHits(chart);
    const weakSkillWeight = skillHits.reduce((sum, hit) => sum + (skillStats.get(hit.slug)?.count || 0), 0);
    return {
      chart_id: chart.chart_id,
      title: chart.title,
      artist: chart.artist || '',
      mode: chart.mode,
      level: chart.level,
      jacket_url: chart.jacket_url || '',
      bpm: chart.bpm || '',
      skills: chart.skills || [],
      best_score: bestScore,
      best_grade: bestGrade,
      is_pass: best ? !!best.is_pass : false,
      skill_match_count: skillHits.length,
      weak_skill_hits: skillHits,
      weak_skill_weight: weakSkillWeight,
      reason,
    };
  };

  const primary = lowScorePassed
    .map((row) => buildRow({ chart: row.chart, best: row.best, reason: 'Low-score clears (<AAA) with recurring weak skills' }))
    .filter((row) => row.skill_match_count > 0);

  const secondary = lowScorePassed
    .map((row) => buildRow({ chart: row.chart, best: row.best, reason: 'Low-score clear (<AAA) in your current level range' }))
    .filter((row) => row.skill_match_count === 0);

  const tertiary = inRangeCharts
    .filter((chart) => {
      const best = bestByChart.get(chart.key);
      return !best || !best.is_pass;
    })
    .map((chart) => buildRow({
      chart,
      best: bestByChart.get(chart.key),
      reason: 'In-range chart covering recurring weak skills',
    }))
    .filter((row) => row.skill_match_count > 0);

  const sortRows = (a, b) => {
    if (b.skill_match_count !== a.skill_match_count) return b.skill_match_count - a.skill_match_count;
    if (b.weak_skill_weight !== a.weak_skill_weight) return b.weak_skill_weight - a.weak_skill_weight;
    const aScore = Number.isFinite(a.best_score) ? a.best_score : 1000001;
    const bScore = Number.isFinite(b.best_score) ? b.best_score : 1000001;
    if (aScore !== bScore) return aScore - bScore;
    if ((a.level || 0) !== (b.level || 0)) return (a.level || 0) - (b.level || 0);
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  };

  primary.sort(sortRows);
  secondary.sort(sortRows);
  tertiary.sort(sortRows);

  const recommendations = [];
  const seenCharts = new Set();
  const pushRows = (rows) => {
    for (const row of rows) {
      if (recommendations.length >= limit) break;
      if (seenCharts.has(row.chart_id)) continue;
      seenCharts.add(row.chart_id);
      recommendations.push(row);
    }
  };

  pushRows(primary);
  pushRows(secondary);
  pushRows(tertiary);

  return {
    recommendations: recommendations.slice(0, limit).map((row) => {
      const { weak_skill_weight, ...rest } = row;
      return rest;
    }),
    weak_skills: weakSkills,
    min_level: normalizedMinLevel,
    max_level: normalizedMaxLevel,
    low_score_max_grade: 'AA+',
    source_low_score_passed_count: lowScorePassed.length,
  };
}

router.get('/recommendations/training', optionalAuth, (req, res) => {
  const userId = String(req.user?.id || '').trim();
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const modeInfo = normalizeTrainingChartMode(req.query.chart_mode);
  if (!modeInfo.ok) {
    return res.status(400).json({ error: 'Invalid chart_mode value' });
  }

  const db = getDb();
  const aliases = loadSongAliases();

  const userRow = db.prepare('SELECT pumbility FROM users WHERE id = ?').get(userId);
  if (!userRow) return res.status(404).json({ error: 'User not found' });

  const pumbility = parseInt(userRow.pumbility, 10) || 0;
  const avgRating = pumbility / 50;
  const { passingLevel, scoringLevel } = determineUserLevels(avgRating);

  const songCatalog = getSongCatalog(db, aliases, modeInfo.allowedModes);
  const bestScores = queryUserBestScores(db, userId);
  const recentScores = queryUserRecentScores(db, userId);
  const pumbilityScores = queryUserPumbilityScores(db, userId);
  const { bestByChart } = buildUserBestByChartMap({
    bestScores,
    recentScores,
    pumbilityScores,
    aliases,
    validChartKeys: songCatalog.chartsByKey,
  });

  let highestPassedLevel = 0;
  for (const chart of songCatalog.charts) {
    const best = bestByChart.get(chart.key);
    if (!best || !best.is_pass) continue;
    const level = parseInt(chart.level, 10) || 0;
    if (level > highestPassedLevel) highestPassedLevel = level;
  }

  const rangeFloorCandidate = Math.max(1, (parseInt(scoringLevel, 10) || 0) - 5);
  const rangeCeilCandidate = highestPassedLevel > 0
    ? highestPassedLevel
    : Math.max(rangeFloorCandidate, parseInt(scoringLevel, 10) || 0);
  const rangeMinLevel = Math.min(rangeFloorCandidate, rangeCeilCandidate);
  const rangeMaxLevel = Math.max(rangeFloorCandidate, rangeCeilCandidate);
  const clampToSelectable = (level) => {
    const parsed = parseInt(level, 10) || 0;
    return Math.min(rangeMaxLevel, Math.max(rangeMinLevel, parsed));
  };

  const requestedMinLevel = parseLevelBound(req.query.min_level);
  const requestedMaxLevel = parseLevelBound(req.query.max_level);
  if (requestedMinLevel && requestedMaxLevel && requestedMinLevel > requestedMaxLevel) {
    return res.status(400).json({ error: 'min_level cannot exceed max_level' });
  }

  let selectedMinLevel = requestedMinLevel ? clampToSelectable(requestedMinLevel) : rangeMinLevel;
  let selectedMaxLevel = requestedMaxLevel ? clampToSelectable(requestedMaxLevel) : rangeMaxLevel;
  if (selectedMinLevel > selectedMaxLevel) {
    const tmp = selectedMinLevel;
    selectedMinLevel = selectedMaxLevel;
    selectedMaxLevel = tmp;
  }

  const levelOptions = [];
  for (let level = rangeMinLevel; level <= rangeMaxLevel; level++) {
    levelOptions.push(level);
  }

  const training = buildTrainingRecommendations({
    songCatalog,
    bestByChart,
    minLevel: selectedMinLevel,
    maxLevel: selectedMaxLevel,
    limit: 10,
  });

  res.json({
    pumbility,
    avg_rating: Math.round(avgRating * 100) / 100,
    scoring_level: scoringLevel,
    passing_level: passingLevel,
    chart_mode: modeInfo.chartMode,
    range_min_level: rangeMinLevel,
    range_max_level: rangeMaxLevel,
    selected_min_level: selectedMinLevel,
    selected_max_level: selectedMaxLevel,
    highest_passed_level: highestPassedLevel || null,
    level_options: levelOptions,
    ...training,
  });
});

router.post('/recommendations', optionalAuth, (req, res) => {
  const userId = String(req.user?.id || '').trim();
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const db = getDb();
  const aliases = loadSongAliases();

  const {
    feeling = 'normal',
    chart_mode = 'both',
    skills_train = [],
    skills_avoid = [],
  } = req.body;

  // Validate inputs
  const validFeelings = ['ambitious', 'normal', 'lethargic'];
  const normalizedFeeling = String(feeling).toLowerCase();
  if (!validFeelings.includes(normalizedFeeling)) {
    return res.status(400).json({ error: 'Invalid feeling value' });
  }

  const feelingModifier = normalizedFeeling === 'ambitious' ? 1 : normalizedFeeling === 'lethargic' ? -1 : 0;

  // Get user's pumbility
  const userRow = db.prepare('SELECT pumbility FROM users WHERE id = ?').get(userId);
  if (!userRow) return res.status(404).json({ error: 'User not found' });

  const pumbility = parseInt(userRow.pumbility, 10) || 0;
  const avgRating = pumbility / 50;

  // Determine user levels
  const { passingLevel, scoringLevel } = determineUserLevels(avgRating);

  // Build chart catalog and user scores
  const modeFilter = normalizeMode(chart_mode);
  const allowedModes = modeFilter ? [modeFilter] : ['Single', 'Double'];
  const songCatalog = getSongCatalog(db, aliases, allowedModes);

  const bestScores = queryUserBestScores(db, userId);
  const recentScores = queryUserRecentScores(db, userId);
  const pumbilityScores = queryUserPumbilityScores(db, userId);
  const { bestByChart } = buildUserBestByChartMap({
    bestScores,
    recentScores,
    pumbilityScores,
    aliases,
    validChartKeys: songCatalog.chartsByKey,
  });

  // Normalize skill inputs
  const mustHaveSlugs = (Array.isArray(skills_train) ? skills_train : [])
    .map(normalizeSkillSlug).filter(Boolean);
  const avoidSlugs = (Array.isArray(skills_avoid) ? skills_avoid : [])
    .map(normalizeSkillSlug).filter(Boolean);

  // Build level-indexed chart pools
  const chartsByLevel = new Map();
  for (const chart of songCatalog.charts) {
    const lv = chart.level;
    if (!chartsByLevel.has(lv)) chartsByLevel.set(lv, []);
    chartsByLevel.get(lv).push(chart);
  }

  // Apply skill filter
  const filteredByLevel = new Map();
  for (const [lv, charts] of chartsByLevel) {
    const filtered = filterChartsBySkills(charts, mustHaveSlugs, avoidSlugs);
    if (filtered.length > 0) filteredByLevel.set(lv, filtered);
  }

  // Helper to get charts at a target level, with fallback to nearby levels
  const getPoolAtLevel = (targetLevel) => {
    if (filteredByLevel.has(targetLevel)) return filteredByLevel.get(targetLevel);
    // Try +/- 1
    if (filteredByLevel.has(targetLevel - 1)) return filteredByLevel.get(targetLevel - 1);
    if (filteredByLevel.has(targetLevel + 1)) return filteredByLevel.get(targetLevel + 1);
    return [];
  };

  const usedChartIds = new Set();

  const pickFromPool = (targetLevel, count) => {
    const pool = getPoolAtLevel(targetLevel).filter((c) => !usedChartIds.has(c.chart_id));
    const picked = pickCharts({ candidates: pool, count, bestByChart, aliases });
    for (const c of picked) usedChartIds.add(c.chart_id);
    return picked;
  };

  const formatChart = (chart) => {
    const key = makeChartKey(chart.title, chart.mode, chart.level, aliases);
    const best = bestByChart.get(key);
    return {
      chart_id: chart.chart_id,
      title: chart.title,
      artist: chart.artist,
      mode: chart.mode,
      level: chart.level,
      jacket_url: chart.jacket_url,
      bpm: chart.bpm,
      skills: chart.skills || [],
      best_score: best ? best.score : null,
      best_grade: best ? best.grade : '',
      is_pass: best ? !!best.is_pass : false,
    };
  };

  // Apply feeling modifier
  const adjScoring = scoringLevel + feelingModifier;
  const adjPassing = passingLevel + feelingModifier;

  // ─── Activation (5 songs at adjusted scoring level - 3) ─────────────────────────────────
  const activationLevel = adjScoring - 3;
  const activation = [];
  const activationPicks = pickFromPool(activationLevel, 5);
  for (const chart of activationPicks) {
    activation.push(formatChart(chart));
  }

  // ─── Scoring songs (5 songs) ─────────────────────────────
  const scoringOffsets = [0, 0, +1, +1, +2];
  const scoringSongs = [];
  for (const offset of scoringOffsets) {
    const targetLv = adjScoring + offset;
    const picks = pickFromPool(targetLv, 1);
    if (picks.length > 0) scoringSongs.push(formatChart(picks[0]));
  }

  // ─── Passing songs (5 songs: 2 at -1, 2 at 0, 1 at +1) ─────────────────────────────
  const passingOffsets = [-1, -1, 0, 0, +1];
  const passingSongs = [];
  for (const offset of passingOffsets) {
    const targetLv = adjPassing + offset;
    const pool = getPoolAtLevel(targetLv).filter((c) => !usedChartIds.has(c.chart_id));
    // For passing, prefer unplayed/unpassed charts
    const unpassed = pool.filter((c) => {
      const key = makeChartKey(c.title, c.mode, c.level, aliases);
      const best = bestByChart.get(key);
      return !best || !best.is_pass;
    });
    const sourcePool = unpassed.length > 0 ? unpassed : pool;

    const picked = pickCharts({ candidates: sourcePool, count: 1, bestByChart, aliases });
    for (const c of picked) usedChartIds.add(c.chart_id);
    if (picked.length > 0) passingSongs.push(formatChart(picked[0]));
  }

  res.json({
    pumbility,
    avg_rating: Math.round(avgRating * 100) / 100,
    scoring_level: scoringLevel,
    passing_level: passingLevel,
    adjusted_scoring_level: adjScoring,
    adjusted_passing_level: adjPassing,
    feeling: normalizedFeeling,
    chart_mode: chart_mode,
    skills_train: mustHaveSlugs,
    skills_avoid: avoidSlugs,
    activation,
    scoring_songs: scoringSongs,
    passing_songs: passingSongs,
  });
});

module.exports = router;

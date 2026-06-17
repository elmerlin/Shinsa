const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { normalizeSongName, normalizeMode } = require('./chartKeys');

const PRESETS_ROOT = path.join(__dirname, '..', '..', 'chart-editor', 'public', 'presets');
const CHART_EDITOR_LIB_ROOT = path.join(__dirname, '..', '..', 'chart-editor', 'src', 'lib');
const ACTIONABLE_NOTE_TYPES = new Set(['tap', 'hold_head']);
const PANEL_BY_LOCAL_COLUMN = ['bottomLeft', 'topLeft', 'center', 'topRight', 'bottomRight'];
const STEP_TYPE_BY_MODE = {
  Single: 'pump-single',
  Double: 'pump-double',
};

let chartEditorModulesPromise = null;
let manifestCache = null;

function loadChartEditorModules() {
  if (!chartEditorModulesPromise) {
    chartEditorModulesPromise = Promise.all([
      import(pathToFileURL(path.join(CHART_EDITOR_LIB_ROOT, 'sscParser.js')).href),
      import(pathToFileURL(path.join(CHART_EDITOR_LIB_ROOT, 'timing.js')).href),
    ]).then(([parser, timing]) => ({
      parseSSC: parser.parseSSC,
      beatToTime: timing.beatToTime,
    }));
  }
  return chartEditorModulesPromise;
}

function readPresetManifest(presetsRoot = PRESETS_ROOT) {
  const manifestPath = path.join(presetsRoot, 'manifest.json');
  if (manifestCache && manifestCache.path === manifestPath) return manifestCache.value;
  const value = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifestCache = { path: manifestPath, value };
  return value;
}

function titleMatchKeys(title) {
  const raw = String(title || '').replace(/\s+/g, ' ').trim();
  const normalized = normalizeSongName(raw);
  if (!normalized) return [];

  const keys = new Set([normalized]);
  const compact = compactTitleKey(normalized);
  if (compact) keys.add(compact);

  const shortCutPrefix = normalized.match(/^\[short cut\]\s*(.+)$/);
  if (shortCutPrefix) {
    keys.add(shortCutPrefix[1]);
    keys.add(`${shortCutPrefix[1]} - short cut -`);
    const compactBase = compactTitleKey(shortCutPrefix[1]);
    if (compactBase) keys.add(compactBase);
  }

  const fullSongPrefix = normalized.match(/^\[full song\]\s*(.+)$/);
  if (fullSongPrefix) {
    keys.add(fullSongPrefix[1]);
    keys.add(`${fullSongPrefix[1]} - full song -`);
    const compactBase = compactTitleKey(fullSongPrefix[1]);
    if (compactBase) keys.add(compactBase);
  }

  const shortCutSuffix = normalized.match(/^(.+?)\s*-\s*short cut\s*-$/);
  if (shortCutSuffix) {
    keys.add(shortCutSuffix[1]);
    keys.add(`[short cut] ${shortCutSuffix[1]}`);
    const compactBase = compactTitleKey(shortCutSuffix[1]);
    if (compactBase) keys.add(compactBase);
  }

  const fullSongSuffix = normalized.match(/^(.+?)\s*-\s*full song\s*-$/);
  if (fullSongSuffix) {
    keys.add(fullSongSuffix[1]);
    keys.add(`[full song] ${fullSongSuffix[1]}`);
    const compactBase = compactTitleKey(fullSongSuffix[1]);
    if (compactBase) keys.add(compactBase);
  }

  return Array.from(keys);
}

function compactTitleKey(title) {
  return normalizeSongName(title).replace(/[^a-z0-9가-힣]/gi, '');
}

function getPresetSongs(manifest) {
  const packs = Array.isArray(manifest?.packs) ? manifest.packs : [];
  return packs.flatMap((pack) => {
    const songs = Array.isArray(pack?.songs) ? pack.songs : [];
    return songs.map((song) => ({ ...song, pack: pack.name || '' }));
  });
}

function selectPresetSong(manifest, chart) {
  const chartTitleKeys = new Set(titleMatchKeys(chart?.title));
  if (chartTitleKeys.size === 0) return null;

  for (const song of getPresetSongs(manifest)) {
    const presetKeys = titleMatchKeys(song?.title);
    if (presetKeys.some((key) => chartTitleKeys.has(key))) return song;
  }

  return null;
}

function chartStepTypeForMode(mode) {
  return STEP_TYPE_BY_MODE[normalizeMode(mode)] || '';
}

function selectPresetChart(parsedSong, chart) {
  const stepType = chartStepTypeForMode(chart?.mode);
  const level = parseInt(chart?.level, 10) || 0;
  if (!stepType || !level) return null;

  const charts = Array.isArray(parsedSong?.charts) ? parsedSong.charts : [];
  return charts.find((candidate) => (
    candidate?.type === stepType
    && (parseInt(candidate?.meter, 10) || 0) === level
  )) || null;
}

function panelForColumn(column, mode) {
  const rawColumn = parseInt(column, 10);
  if (!Number.isFinite(rawColumn) || rawColumn < 0) return null;

  const normalizedMode = normalizeMode(mode);
  const localColumn = normalizedMode === 'Double' ? rawColumn % 5 : rawColumn;
  const panel = PANEL_BY_LOCAL_COLUMN[localColumn];
  if (!panel) return null;

  if (normalizedMode !== 'Double') return { panel };
  if (rawColumn > 9) return null;
  return {
    panel,
    side: rawColumn < 5 ? 'left' : 'right',
  };
}

function buildStepCuesFromChart({ chartId, mode, level, metadata, chart, beatToTimeFn }) {
  const bpms = Array.isArray(chart?.bpms) ? chart.bpms : metadata?.bpms;
  const stops = Array.isArray(chart?.stops) ? chart.stops : metadata?.stops;
  const offset = chart?.offset !== undefined ? chart.offset : metadata?.offset;
  const notes = Array.isArray(chart?.notes) ? chart.notes : [];
  const beatToTime = typeof beatToTimeFn === 'function' ? beatToTimeFn : () => 0;
  const cues = [];

  for (const note of notes) {
    if (!ACTIONABLE_NOTE_TYPES.has(note?.type)) continue;

    const target = panelForColumn(note.column, mode);
    if (!target) continue;

    const beat = Number(note.beat);
    if (!Number.isFinite(beat)) continue;

    const seconds = beatToTime(beat, bpms || [{ beat: 0, bpm: 120 }], stops || []) + (Number(offset) || 0);
    const timeMs = Math.max(0, Math.round(seconds * 1000));
    cues.push({
      id: `${chartId}-${Number(beat.toFixed(6))}-${note.column}`,
      chartId,
      timeMs,
      beat,
      panel: target.panel,
      ...(target.side ? { side: target.side } : {}),
    });
  }

  cues.sort((a, b) => a.timeMs - b.timeMs || a.beat - b.beat || a.id.localeCompare(b.id));
  return cues;
}

async function loadChartTimingForChart(chart, options = {}) {
  const presetsRoot = options.presetsRoot || PRESETS_ROOT;
  const manifest = options.manifest || readPresetManifest(presetsRoot);
  const presetSong = selectPresetSong(manifest, chart);
  if (!presetSong?.file) return null;

  const filePath = path.join(presetsRoot, presetSong.file);
  if (!filePath.startsWith(presetsRoot + path.sep) || !fs.existsSync(filePath)) return null;

  const { parseSSC, beatToTime } = await loadChartEditorModules();
  const parsed = parseSSC(fs.readFileSync(filePath, 'utf-8'));
  const presetChart = selectPresetChart(parsed, chart);
  if (!presetChart) return null;

  const stepCues = buildStepCuesFromChart({
    chartId: chart.chart_id,
    mode: chart.mode,
    level: chart.level,
    metadata: parsed.metadata,
    chart: presetChart,
    beatToTimeFn: beatToTime,
  });

  return {
    chart: {
      chart_id: chart.chart_id,
      title: chart.title,
      artist: chart.artist || parsed.metadata?.artist || presetSong.artist || '',
      mode: chart.mode,
      level: chart.level,
    },
    source: {
      type: 'chart-editor-preset',
      file: presetSong.file,
      title: parsed.metadata?.title || presetSong.title || chart.title,
      artist: parsed.metadata?.artist || presetSong.artist || chart.artist || '',
    },
    stepCues,
  };
}

function invalidateChartTimingCaches() {
  manifestCache = null;
  chartEditorModulesPromise = null;
}

module.exports = {
  buildStepCuesFromChart,
  invalidateChartTimingCaches,
  loadChartTimingForChart,
  panelForColumn,
  selectPresetChart,
  selectPresetSong,
  titleMatchKeys,
};

const LIVE_MARKER_PREFIX = '[[SHINSA_LIVE_V1:';
const LIVE_MARKER_SUFFIX = ']]';
const LIVE_MARKER_REGEX = /\[\[SHINSA_LIVE_V1:([A-Za-z0-9+/=_-]+)\]\]/;

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function sanitizeSongRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 3).map((row) => ({
    song_title: String(row?.song_title || ''),
    mode: String(row?.mode || ''),
    level: toInt(row?.level),
    score: toInt(row?.score),
    grade: String(row?.grade || ''),
    rating: toInt(row?.rating),
    over_top100_rank: toInt(row?.over_top100_rank),
    jacket_url: String(row?.jacket_url || ''),
  }));
}

function sanitizeLiveSummary(summary) {
  const src = summary || {};
  return {
    version: 1,
    sessionId: String(src.sessionId || src.session_id || ''),
    sessionDateLabel: String(src.sessionDateLabel || ''),
    sessionTimeRange: String(src.sessionTimeRange || ''),
    sessionDurationMinutes: toInt(src.sessionDurationMinutes),
    sessionDurationLabel: String(src.sessionDurationLabel || ''),
    sessionMachineName: String(src.sessionMachineName || ''),
    sessionShoeLabel: String(src.sessionShoeLabel || ''),
    songCount: toInt(src.songCount),
    clearCount: toInt(src.clearCount),
    clearRate: toInt(src.clearRate),
    totalSteps: toInt(src.totalSteps),
    estimatedKcal: toInt(src.estimatedKcal),
    estimatedKcalPerHour: toInt(src.estimatedKcalPerHour),
    calorieWeightKg: toNumber(src.calorieWeightKg),
    calorieEstimatePersonalized: toBoolean(src.calorieEstimatePersonalized),
    singleCount: toInt(src.singleCount),
    doubleCount: toInt(src.doubleCount),
    otherCount: toInt(src.otherCount),
    judgmentTotals: {
      perfect: toInt(src?.judgmentTotals?.perfect),
      great: toInt(src?.judgmentTotals?.great),
      good: toInt(src?.judgmentTotals?.good),
      bad: toInt(src?.judgmentTotals?.bad),
      miss: toInt(src?.judgmentTotals?.miss),
    },
    perfectRate: toInt(src.perfectRate),
    averageScore: toInt(src.averageScore),
    averageLevel: toNumber(src.averageLevel),
    averageRating: toInt(src.averageRating),
    viewerCount: toInt(src.viewerCount),
    viewerPeak: toInt(src.viewerPeak),
    messageCount: toInt(src.messageCount),
    requestPlayCount: toInt(src.requestPlayCount),
    votedSongPlayCount: toInt(src.votedSongPlayCount),
    interactions: toInt(src.interactions),
    streamUrl: String(src.streamUrl || ''),
    hostUsername: String(src.hostUsername || ''),
    topSongsByScore: sanitizeSongRows(src.topSongsByScore),
    topSongsByRating: sanitizeSongRows(src.topSongsByRating),
  };
}

function serializeLiveSessionMarker(summary) {
  const payload = sanitizeLiveSummary(summary);
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return `${LIVE_MARKER_PREFIX}${encoded}${LIVE_MARKER_SUFFIX}`;
}

function parseLiveSessionMarker(content) {
  const raw = String(content || '');
  const match = raw.match(LIVE_MARKER_REGEX);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    return sanitizeLiveSummary(JSON.parse(decoded));
  } catch {
    return null;
  }
}

function splitLiveSessionContent(content) {
  const raw = String(content || '');
  const match = raw.match(LIVE_MARKER_REGEX);
  if (!match) {
    return {
      text: raw,
      live: null,
    };
  }

  return {
    text: raw.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim(),
    live: parseLiveSessionMarker(raw),
  };
}

module.exports = {
  LIVE_MARKER_PREFIX,
  LIVE_MARKER_SUFFIX,
  LIVE_MARKER_REGEX,
  parseLiveSessionMarker,
  sanitizeLiveSummary,
  serializeLiveSessionMarker,
  splitLiveSessionContent,
};

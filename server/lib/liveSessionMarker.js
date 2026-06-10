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
    plate: String(row?.plate || ''),
    rating: toInt(row?.rating),
    over_top100_rank: toInt(row?.over_top100_rank),
    jacket_url: String(row?.jacket_url || ''),
    replay_embed_url: String(row?.replay_embed_url || ''),
    replay_video_id: String(row?.replay_video_id || ''),
    perfect: toInt(row?.perfect),
    great: toInt(row?.great),
    good: toInt(row?.good),
    bad: toInt(row?.bad),
    miss: toInt(row?.miss),
    max_combo: toInt(row?.max_combo),
    machine_name: String(row?.machine_name || ''),
    date_played: String(row?.date_played || ''),
    play_id: toInt(row?.play_id),
    user_id: String(row?.user_id || ''),
  }));
}

function sanitizeLiveSummary(summary) {
  const src = summary || {};
  return {
    version: 1,
    sessionId: String(src.sessionId || src.session_id || ''),
    sessionTitle: String(src.sessionTitle || src.title || ''),
    participantRole: String(src.participantRole || ''),
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
    trainingLoad: toInt(src.trainingLoad),
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
    hr: sanitizeHrBlock(src.hr),
  };
}

// Session heart-rate rollup (see buildSessionHrBlock). Kept compact: the
// series is already downsampled to ≤120 points before it gets here.
function sanitizeHrBlock(src) {
  if (!src || typeof src !== 'object') return null;
  const peak = toInt(src.hr_peak);
  const avg = toInt(src.hr_avg);
  if (avg <= 0 && peak <= 0) return null;
  return {
    play_count: toInt(src.play_count),
    hr_avg: avg,
    hr_peak: peak,
    peak_song: src.peak_song && typeof src.peak_song === 'object'
      ? {
          song_title: String(src.peak_song.song_title || ''),
          mode: String(src.peak_song.mode || ''),
          level: toInt(src.peak_song.level),
          hr_peak: toInt(src.peak_song.hr_peak),
        }
      : null,
    max_hr: toInt(src.max_hr) || 190,
    zone_seconds: Object.fromEntries(
      Object.entries(src.zone_seconds || {})
        .map(([k, v]) => [String(k), toInt(v)])
        .filter(([k, v]) => /^z[0-9]$/.test(k) && v > 0),
    ),
    per_level: Array.isArray(src.per_level)
      ? src.per_level.slice(0, 40).map((g) => ({
          key: String(g?.key || ''),
          mode: g?.mode === 'D' ? 'D' : 'S',
          level: toInt(g?.level),
          plays: toInt(g?.plays),
          hr_avg: toInt(g?.hr_avg),
          hr_peak: toInt(g?.hr_peak),
        }))
      : [],
    series: Array.isArray(src.series) ? src.series.slice(0, 120).map((v) => toInt(v)).filter((n) => n > 0) : [],
    duration_s: toInt(src.duration_s),
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

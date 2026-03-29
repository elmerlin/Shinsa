const LIVE_MARKER_PREFIX = '[[SHINSA_LIVE_V1:';
const LIVE_MARKER_SUFFIX = ']]';
const LIVE_MARKER_REGEX = /\[\[SHINSA_LIVE_V1:([A-Za-z0-9+/=_-]+)\]\]/;

function encodeUnicodeBase64(value) {
  const bytes = encodeURIComponent(String(value || '')).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return btoa(bytes);
}

function decodeUnicodeBase64(value) {
  const bytes = atob(String(value || ''));
  const encoded = Array.from(bytes).map((char) =>
    `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  ).join('');
  return decodeURIComponent(encoded);
}

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  };
}

export function serializeLiveSessionMarker(summary) {
  const payload = sanitizeLiveSummary(summary);
  const encoded = encodeUnicodeBase64(JSON.stringify(payload));
  return `${LIVE_MARKER_PREFIX}${encoded}${LIVE_MARKER_SUFFIX}`;
}

export function parseLiveSessionMarker(content) {
  const raw = String(content || '');
  const match = raw.match(LIVE_MARKER_REGEX);
  if (!match) return null;

  try {
    const decoded = decodeUnicodeBase64(match[1]);
    const parsed = JSON.parse(decoded);
    return sanitizeLiveSummary(parsed);
  } catch {
    return null;
  }
}

export function splitLiveSessionContent(content) {
  const raw = String(content || '');
  const match = raw.match(LIVE_MARKER_REGEX);
  if (!match) {
    return {
      text: raw,
      live: null,
    };
  }

  const live = parseLiveSessionMarker(raw);
  const text = raw
    .replace(match[0], '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    text,
    live,
  };
}

export function mergeLiveSessionSummary(summary, overrides) {
  if (!summary) return null;
  if (!overrides || typeof overrides !== 'object') return sanitizeLiveSummary(summary);
  return sanitizeLiveSummary({
    ...summary,
    ...overrides,
  });
}

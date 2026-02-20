const SUMMARY_MARKER_PREFIX = '[[SHINSA_SUMMARY_V1:';
const SUMMARY_MARKER_SUFFIX = ']]';
const SUMMARY_MARKER_REGEX = /\[\[SHINSA_SUMMARY_V1:([A-Za-z0-9+/=_-]+)\]\]/;

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

function sanitizeSongRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 3).map((row) => ({
    song_title: String(row?.song_title || ''),
    mode: String(row?.mode || ''),
    level: toInt(row?._level ?? row?.level),
    score: toInt(row?._score ?? row?.score),
    grade: String((row?._grade ?? row?.grade) || ''),
    rating: toNumber(row?._rating ?? row?.rating),
    jacket_url: String((row?._jacketUrl ?? row?.jacket_url) || ''),
  }));
}

function sanitizeSummary(summary) {
  const src = summary || {};
  return {
    version: 1,
    sessionDateLabel: String(src.sessionDateLabel || ''),
    sessionTimeRange: String(src.sessionTimeRange || ''),
    songCount: toInt(src.songCount),
    clearCount: toInt(src.clearCount),
    clearRate: toInt(src.clearRate),
    totalSteps: toInt(src.totalSteps),
    estimatedKcal: toInt(src.estimatedKcal),
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
    topSongsByScore: sanitizeSongRows(src.topSongsByScore),
    topSongsByRating: sanitizeSongRows(src.topSongsByRating),
  };
}

export function serializeSessionSummaryMarker(summary) {
  const payload = sanitizeSummary(summary);
  const encoded = encodeUnicodeBase64(JSON.stringify(payload));
  return `${SUMMARY_MARKER_PREFIX}${encoded}${SUMMARY_MARKER_SUFFIX}`;
}

export function parseSessionSummaryMarker(content) {
  const raw = String(content || '');
  const match = raw.match(SUMMARY_MARKER_REGEX);
  if (!match) return null;

  try {
    const decoded = decodeUnicodeBase64(match[1]);
    const parsed = JSON.parse(decoded);
    return sanitizeSummary(parsed);
  } catch {
    return null;
  }
}

export function splitSessionSummaryContent(content) {
  const raw = String(content || '');
  const match = raw.match(SUMMARY_MARKER_REGEX);
  if (!match) {
    return {
      text: raw,
      summary: null,
    };
  }

  const summary = parseSessionSummaryMarker(raw);
  const text = raw
    .replace(match[0], '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    text,
    summary,
  };
}

const SHARE_MARKER_PREFIX = '[[SHINSA_SHARE_V1:';
const SHARE_MARKER_SUFFIX = ']]';
const SHARE_MARKER_REGEX = /\[\[SHINSA_SHARE_V1:([A-Za-z0-9+/=_-]+)\]\]/;

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

function toBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  return false;
}

function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 200).map((row) => ({
    song_title: String(row?.song_title || ''),
    mode: String(row?.mode || ''),
    level: toInt(row?.level),
    score: toInt(row?.score),
    grade: String(row?.grade || ''),
    rating_points: toInt(row?.rating_points),
    over_top100_rank: toInt(row?.over_top100_rank),
    chart_id: toInt(row?.chart_id),
    chart_path: String(row?.chart_path || ''),
    jacket_url: String(row?.jacket_url || ''),
    replay_embed_url: String(row?.replay_embed_url || ''),
    replay_video_id: String(row?.replay_video_id || ''),
    replay_start_seconds: toInt(row?.replay_start_seconds),
    replay_end_seconds: toInt(row?.replay_end_seconds),
    perfect: toInt(row?.perfect),
    great: toInt(row?.great),
    good: toInt(row?.good),
    bad: toInt(row?.bad),
    miss: toInt(row?.miss),
    max_combo: toInt(row?.max_combo),
    date_played: String(row?.date_played || ''),
    played_at_utc: String(row?.played_at_utc || ''),
    weekly_challenge_week_key: String(row?.weekly_challenge_week_key || ''),
    play_id: toInt(row?.play_id),
    user_id: String(row?.user_id || ''),
    machine_name: String(row?.machine_name || ''),
    plate: String(row?.plate || ''),
  }));
}

function sanitizeShare(share) {
  const src = share || {};
  const shareType = String(src.shareType || '').trim().toLowerCase() === 'hour_of_power'
    ? 'hour_of_power'
    : 'session_share';
  return {
    version: 1,
    shareType,
    sessionId: String(src.sessionId || ''),
    sessionTitle: String(src.sessionTitle || ''),
    streamUrl: String(src.streamUrl || ''),
    generatedAt: String(src.generatedAt || ''),
    sessionDateLabel: String(src.sessionDateLabel || ''),
    sessionTimeRange: String(src.sessionTimeRange || ''),
    sessionDurationMinutes: toInt(src.sessionDurationMinutes),
    sessionDurationLabel: String(src.sessionDurationLabel || ''),
    sessionMachineName: String(src.sessionMachineName || ''),
    filterMode: String(src.filterMode || 'Both'),
    minGrade: String(src.minGrade || 'PASS').toUpperCase(),
    minGradeLabel: String(src.minGradeLabel || 'Pass'),
    minLevel: toInt(src.minLevel),
    maxLevel: toInt(src.maxLevel),
    hasLevelRange: toBoolean(src.hasLevelRange),
    levelRangeLabel: String(src.levelRangeLabel || ''),
    songCount: toInt(src.songCount),
    clearCount: toInt(src.clearCount),
    clearRate: toInt(src.clearRate),
    averageScore: toInt(src.averageScore),
    singleCount: toInt(src.singleCount),
    doubleCount: toInt(src.doubleCount),
    otherCount: toInt(src.otherCount),
    totalRatingPoints: toInt(src.totalRatingPoints),
    averageRatingPoints: Number(src.averageRatingPoints) || 0,
    averageLevel: Number(src.averageLevel) || 0,
    highestRatingPoints: toInt(src.highestRatingPoints),
    lowestRatingPoints: toInt(src.lowestRatingPoints),
    countedClearCount: toInt(src.countedClearCount),
    completed: toBoolean(src.completed),
    leaderboardEligible: toBoolean(src.leaderboardEligible),
    judgmentTotals: {
      perfect: toInt(src?.judgmentTotals?.perfect),
      great: toInt(src?.judgmentTotals?.great),
      good: toInt(src?.judgmentTotals?.good),
      bad: toInt(src?.judgmentTotals?.bad),
      miss: toInt(src?.judgmentTotals?.miss),
    },
    perfectRate: toInt(src.perfectRate),
    rows: sanitizeRows(src.rows),
  };
}

export function serializeSessionShareMarker(share) {
  const payload = sanitizeShare(share);
  const encoded = encodeUnicodeBase64(JSON.stringify(payload));
  return `${SHARE_MARKER_PREFIX}${encoded}${SHARE_MARKER_SUFFIX}`;
}

export function parseSessionShareMarker(content) {
  const raw = String(content || '');
  const match = raw.match(SHARE_MARKER_REGEX);
  if (!match) return null;

  try {
    const decoded = decodeUnicodeBase64(match[1]);
    const parsed = JSON.parse(decoded);
    return sanitizeShare(parsed);
  } catch {
    return null;
  }
}

export function splitSessionShareContent(content) {
  const raw = String(content || '');
  const match = raw.match(SHARE_MARKER_REGEX);
  if (!match) {
    return {
      text: raw,
      share: null,
    };
  }

  const share = parseSessionShareMarker(raw);
  const text = raw
    .replace(match[0], '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    text,
    share,
  };
}

const WC_PERSONAL_MARKER_PREFIX = '[[SHINSA_WC_PERSONAL_V1:';
const WC_PERSONAL_MARKER_SUFFIX = ']]';
const WC_PERSONAL_MARKER_REGEX = /\[\[SHINSA_WC_PERSONAL_V1:([A-Za-z0-9+/=_-]+)\]\]/;

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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function sanitizeHighestRatedPlay(entry) {
  const src = entry || {};
  return {
    songTitle: String(src.songTitle || ''),
    mode: String(src.mode || ''),
    level: toInt(src.level),
    jacketUrl: String(src.jacketUrl || ''),
    score: toInt(src.score),
    grade: String(src.grade || ''),
    ratingPoints: toInt(src.ratingPoints),
  };
}

function sanitizeRankEntry(entry) {
  if (!entry) return null;
  return { rank: toInt(entry.rank), total: toInt(entry.total) };
}

function sanitizePodiumAward(entry) {
  const src = entry || {};
  return {
    awardKey: String(src.awardKey || ''),
    awardLabel: String(src.awardLabel || ''),
    rank: toInt(src.rank),
  };
}

function sanitizeBracketComparison(entry) {
  if (!entry) return null;
  return {
    bracketName: String(entry.bracketName || ''),
    bracketRank: toInt(entry.bracketRank),
    bracketParticipantCount: toInt(entry.bracketParticipantCount),
    bracketAverageScore: toInt(entry.bracketAverageScore),
  };
}

function sanitizeWcPersonalSummary(summary) {
  const src = summary || {};
  return {
    version: 1,
    weekId: toInt(src.weekId),
    weekKey: String(src.weekKey || ''),
    weekLabel: String(src.weekLabel || ''),
    userId: String(src.userId || ''),
    username: String(src.username || ''),
    avatar: String(src.avatar || ''),
    nationality: String(src.nationality || ''),
    skillFamily: String(src.skillFamily || ''),
    skillTitle: String(src.skillTitle || ''),
    averageScore: toInt(src.averageScore),
    highestRatedPlay: sanitizeHighestRatedPlay(src.highestRatedPlay),
    sssCount: toInt(src.sssCount),
    totalClears: toInt(src.totalClears),
    chartCount: toInt(src.chartCount),
    rankings: {
      overall: sanitizeRankEntry(src.rankings?.overall),
      singles: sanitizeRankEntry(src.rankings?.singles),
      doubles: sanitizeRankEntry(src.rankings?.doubles),
    },
    averageRank: toNumber(src.averageRank),
    bracketComparison: sanitizeBracketComparison(src.bracketComparison),
    podiums: Array.isArray(src.podiums)
      ? src.podiums.slice(0, 10).map(sanitizePodiumAward)
      : [],
    generatedAt: String(src.generatedAt || ''),
  };
}

export function serializeWcPersonalMarker(summary) {
  const payload = sanitizeWcPersonalSummary(summary);
  const encoded = encodeUnicodeBase64(JSON.stringify(payload));
  return `${WC_PERSONAL_MARKER_PREFIX}${encoded}${WC_PERSONAL_MARKER_SUFFIX}`;
}

export function parseWcPersonalMarker(content) {
  const match = WC_PERSONAL_MARKER_REGEX.exec(String(content || ''));
  if (!match) return null;
  try {
    const decoded = decodeUnicodeBase64(match[1]);
    return sanitizeWcPersonalSummary(JSON.parse(decoded));
  } catch {
    return null;
  }
}

export function splitWcPersonalContent(content) {
  const text = String(content || '');
  const match = WC_PERSONAL_MARKER_REGEX.exec(text);
  if (!match) return { text, personal: null };
  const personal = parseWcPersonalMarker(text);
  const cleaned = text.replace(WC_PERSONAL_MARKER_REGEX, '').trim();
  return { text: cleaned, personal };
}

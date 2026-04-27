const WC_SUMMARY_MARKER_PREFIX = '[[SHINSA_WC_SUMMARY_V1:';
const WC_SUMMARY_MARKER_SUFFIX = ']]';
const WC_SUMMARY_MARKER_REGEX = /\[\[SHINSA_WC_SUMMARY_V1:([A-Za-z0-9+/=_-]+)\]\]/;

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function sanitizePodiumEntry(entry) {
  const src = entry || {};
  return {
    rank: toInt(src.rank),
    user_id: String(src.user_id || ''),
    username: String(src.username || ''),
    avatar: String(src.avatar || ''),
    nationality: String(src.nationality || ''),
    skill_title: String(src.skill_title || ''),
    points: toInt(src.points),
    pg_bonus_points: toInt(src.pg_bonus_points),
    pg_bonus_count: toInt(src.pg_bonus_count),
    clears: toInt(src.clears),
  };
}

function sanitizePodiumArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 3).map(sanitizePodiumEntry);
}

function sanitizeSuperlativeEntry(entry) {
  const src = entry || {};
  return {
    rank: toInt(src.rank),
    user_id: String(src.user_id || ''),
    username: String(src.username || ''),
    avatar: String(src.avatar || ''),
    nationality: String(src.nationality || ''),
    value: toNumber(src.value),
    detail_json: src.detail_json || {},
  };
}

function sanitizeSuperlativeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 3).map(sanitizeSuperlativeEntry);
}

function sanitizeReplayHighlight(entry) {
  const src = entry || {};
  return {
    user_id: String(src.user_id || ''),
    username: String(src.username || ''),
    avatar: String(src.avatar || ''),
    nationality: String(src.nationality || ''),
    song_title: String(src.song_title || ''),
    mode: String(src.mode || ''),
    level: toInt(src.level),
    jacket_url: String(src.jacket_url || ''),
    score: toInt(src.score),
    grade: String(src.grade || ''),
    rating_points: toInt(src.rating_points),
    base_rating_points: toInt(src.base_rating_points),
    pg_bonus_points: toInt(src.pg_bonus_points),
    pg_bonus_percent: toInt(src.pg_bonus_percent),
    has_pg_bonus: !!src.has_pg_bonus,
    replay_embed_url: String(src.replay_embed_url || ''),
    replay_video_id: String(src.replay_video_id || ''),
    replay_start_seconds: toInt(src.replay_start_seconds),
    replay_end_seconds: toInt(src.replay_end_seconds),
    highlight_reason: String(src.highlight_reason || ''),
    play_post_id: toInt(src.play_post_id),
    play_post_comment_count: toInt(src.play_post_comment_count),
  };
}

function sanitizePreviewChart(entry) {
  const src = entry || {};
  return {
    song_title: String(src.song_title || ''),
    mode: String(src.mode || ''),
    level: toInt(src.level),
    jacket_url: String(src.jacket_url || ''),
  };
}

function sanitizeWcSummary(summary) {
  const src = summary || {};
  const nextWeek = src.nextWeek;
  return {
    version: 1,
    weekId: toInt(src.weekId),
    weekKey: String(src.weekKey || ''),
    weekLabel: String(src.weekLabel || ''),
    startsAtUtc: String(src.startsAtUtc || ''),
    endsAtUtc: String(src.endsAtUtc || ''),
    participantCount: toInt(src.participantCount),
    totalClears: toInt(src.totalClears),
    chartCount: toInt(src.chartCount),
    topOverallPodium: sanitizePodiumArray(src.topOverallPodium),
    awards: {
      overall: sanitizePodiumArray(src.awards?.overall),
      singles: sanitizePodiumArray(src.awards?.singles),
      doubles: sanitizePodiumArray(src.awards?.doubles),
      advanced: sanitizePodiumArray(src.awards?.advanced),
      intermediate: sanitizePodiumArray(src.awards?.intermediate),
    },
    superlatives: {
      most_sss: sanitizeSuperlativeArray(src.superlatives?.most_sss),
      highest_clear_percentage: sanitizeSuperlativeArray(src.superlatives?.highest_clear_percentage),
      highest_clear_rating: sanitizeSuperlativeArray(src.superlatives?.highest_clear_rating),
      biggest_improvements: sanitizeSuperlativeArray(src.superlatives?.biggest_improvements),
    },
    replayHighlights: Array.isArray(src.replayHighlights)
      ? src.replayHighlights.slice(0, 5).map(sanitizeReplayHighlight)
      : [],
    nextWeek: nextWeek ? {
      weekId: toInt(nextWeek.weekId),
      weekKey: String(nextWeek.weekKey || ''),
      weekLabel: String(nextWeek.weekLabel || ''),
      previewCharts: Array.isArray(nextWeek.previewCharts)
        ? nextWeek.previewCharts.slice(0, 6).map(sanitizePreviewChart)
        : [],
    } : null,
    generatedAt: String(src.generatedAt || ''),
  };
}

function serializeWcSummaryMarker(summary) {
  const payload = sanitizeWcSummary(summary);
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return `${WC_SUMMARY_MARKER_PREFIX}${encoded}${WC_SUMMARY_MARKER_SUFFIX}`;
}

function parseWcSummaryMarker(content) {
  const raw = String(content || '');
  const match = raw.match(WC_SUMMARY_MARKER_REGEX);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    return sanitizeWcSummary(JSON.parse(decoded));
  } catch {
    return null;
  }
}

function splitWcSummaryContent(content) {
  const raw = String(content || '');
  const match = raw.match(WC_SUMMARY_MARKER_REGEX);
  if (!match) {
    return { text: raw, summary: null };
  }

  return {
    text: raw.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim(),
    summary: parseWcSummaryMarker(raw),
  };
}

module.exports = {
  WC_SUMMARY_MARKER_PREFIX,
  WC_SUMMARY_MARKER_SUFFIX,
  WC_SUMMARY_MARKER_REGEX,
  sanitizeWcSummary,
  serializeWcSummaryMarker,
  parseWcSummaryMarker,
  splitWcSummaryContent,
};

const { normalizeUserAvatarForList } = require('./avatarProxy');
const {
  resolveDailyHighlightReplayRows,
  toInt,
} = require('./dailyHighlights');

function normalizeUtcDateKey(value = new Date()) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function getNextUtcDateKey(dateKey) {
  const parsed = new Date(`${normalizeUtcDateKey(dateKey)}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function shiftUtcDateKey(dateKey, dayOffset = 0) {
  const parsed = new Date(`${normalizeUtcDateKey(dateKey)}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + dayOffset);
  return parsed.toISOString().slice(0, 10);
}

function dedupeByUserChart(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const title = item.song_title || item.new_song_title || '';
    const key = `${item.user_id}|${title}|${item.mode}|${item.level || item.new_level || 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickTopNDiverse(items = [], n, getUserId) {
  if (items.length <= n) return items.slice(0, n);
  const uniqueUsers = new Set(items.map(getUserId));
  if (uniqueUsers.size >= n) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
      const userId = getUserId(item);
      if (seen.has(userId)) continue;
      seen.add(userId);
      result.push(item);
      if (result.length >= n) break;
    }
    return result;
  }
  return items.slice(0, n);
}

function buildReplayDateFilter(alias, dateKey) {
  const nextDateKey = getNextUtcDateKey(dateKey);
  return `(
    (
      ${alias}.played_at_utc IS NOT NULL
      AND ${alias}.played_at_utc != ''
      AND ${alias}.played_at_utc >= '${dateKey}'
      AND ${alias}.played_at_utc < '${nextDateKey}'
    )
    OR ${alias}.date_played = '${dateKey}'
  )`;
}

function queryReplayCandidates(db, dateKey, { candidateLimit = 20 } = {}) {
  const filter = buildReplayDateFilter('rp', normalizeUtcDateKey(dateKey));

  const directReplays = db.prepare(`
    SELECT rp.id, rp.user_id, rp.song_title, rp.mode, rp.level, rp.score, rp.grade, rp.plate,
           rp.perfect, rp.great, rp.good, rp.bad, rp.miss, rp.max_combo,
           rp.replay_embed_url, rp.replay_video_id, rp.replay_start_seconds, rp.replay_end_seconds,
           rp.background_url, rp.date_played, rp.played_at_utc, rp.machine_name,
           u.username, u.avatar, u.nationality,
           'direct' AS replay_source_kind,
           (SELECT COUNT(*) FROM play_comments WHERE play_id = rp.id) AS comment_count
    FROM user_recently_played rp
    JOIN users u ON rp.user_id = u.id
    WHERE rp.replay_embed_url IS NOT NULL AND rp.replay_embed_url != ''
      AND ${filter}
    ORDER BY (CAST(rp.level AS INTEGER) * CAST(rp.score AS INTEGER)) DESC
    LIMIT ?
  `).all(candidateLimit);

  const chartLinkedReplays = db.prepare(`
    SELECT rp.id, rp.user_id, rp.song_title, rp.mode, rp.level, rp.score, rp.grade, rp.plate,
           rp.perfect, rp.great, rp.good, rp.bad, rp.miss, rp.max_combo,
           yt.session_youtube_url AS replay_embed_url, '' AS replay_video_id,
           0 AS replay_start_seconds, 0 AS replay_end_seconds,
           rp.background_url, rp.date_played, rp.played_at_utc, rp.machine_name,
           u.username, u.avatar, u.nationality,
           'chart_linked' AS replay_source_kind,
           (SELECT COUNT(*) FROM play_comments WHERE play_id = rp.id) AS comment_count
    FROM user_recently_played rp
    JOIN users u ON rp.user_id = u.id
    JOIN songs s ON s.title = rp.song_title AND s.mode = rp.mode AND s.level = rp.level
    JOIN user_chart_youtube_links yt ON yt.user_id = rp.user_id AND yt.chart_id = s.id
    WHERE yt.session_youtube_url IS NOT NULL AND yt.session_youtube_url != ''
      AND (rp.replay_embed_url IS NULL OR rp.replay_embed_url = '')
      AND ${filter}
    ORDER BY (CAST(rp.level AS INTEGER) * CAST(rp.score AS INTEGER)) DESC
    LIMIT ?
  `).all(candidateLimit);

  const replayIdSet = new Set(directReplays.map((row) => row.id));
  const mergedReplays = [...directReplays];
  for (const row of chartLinkedReplays) {
    if (replayIdSet.has(row.id)) continue;
    replayIdSet.add(row.id);
    mergedReplays.push(row);
  }

  return mergedReplays;
}

function selectTopReplayHighlights(db, dateKey, { limit = 5, candidateLimit = 20 } = {}) {
  const mergedReplays = queryReplayCandidates(db, dateKey, { candidateLimit });
  const resolvedReplays = resolveDailyHighlightReplayRows(db, mergedReplays);
  resolvedReplays.sort((a, b) => (toInt(b.level) * toInt(b.score)) - (toInt(a.level) * toInt(a.score)));
  const dedupedReplays = dedupeByUserChart(resolvedReplays);

  return pickTopNDiverse(dedupedReplays, limit, (row) => row.user_id).map((row) => ({
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, row.user_id, 40),
  }));
}

function selectTopReplayHighlightsWithFallback(db, dateKey = new Date(), {
  limit = 5,
  candidateLimit = 20,
  maxLookbackDays = 7,
} = {}) {
  const normalizedDateKey = normalizeUtcDateKey(dateKey);
  const safeLookbackDays = Math.max(0, Number(maxLookbackDays) || 0);

  for (let offset = 0; offset <= safeLookbackDays; offset += 1) {
    const candidateDateKey = shiftUtcDateKey(normalizedDateKey, -offset);
    const items = selectTopReplayHighlights(db, candidateDateKey, { limit, candidateLimit });
    if (items.length > 0) {
      return {
        items,
        dateKey: candidateDateKey,
        isFallback: offset > 0,
      };
    }
  }

  return {
    items: [],
    dateKey: normalizedDateKey,
    isFallback: false,
  };
}

module.exports = {
  dedupeByUserChart,
  getNextUtcDateKey,
  normalizeUtcDateKey,
  pickTopNDiverse,
  queryReplayCandidates,
  selectTopReplayHighlights,
  selectTopReplayHighlightsWithFallback,
  shiftUtcDateKey,
};

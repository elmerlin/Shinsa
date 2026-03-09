const { parsePlayedAt } = require('./liveSessionSummary');

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function normalizeText(value, maxLength = 160) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function buildChartKey(songTitle, mode, level) {
  return [
    normalizeText(songTitle, 160).toLowerCase(),
    normalizeText(mode, 40).toLowerCase(),
    toInt(level),
  ].join('|');
}

function parseSqliteDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeRequestStatus(status, fulfilled = false) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'queued' || normalized === 'played' || normalized === 'skipped' || normalized === 'open') {
    return normalized;
  }
  return fulfilled ? 'played' : 'open';
}

function getSessionMessageCount(db, liveSessionId) {
  if (!liveSessionId) return 0;
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM live_session_messages
    WHERE live_session_id = ?
  `).get(liveSessionId);
  return toInt(row?.count);
}

function getSessionRequestCounts(db, liveSessionId) {
  const rows = db.prepare(`
    SELECT
      CASE
        WHEN COALESCE(NULLIF(status, ''), '') IN ('open', 'queued', 'played', 'skipped') THEN status
        WHEN fulfilled = 1 THEN 'played'
        ELSE 'open'
      END AS status_key,
      COUNT(*) AS count
    FROM live_session_requests
    WHERE live_session_id = ?
    GROUP BY 1
  `).all(liveSessionId);

  const counts = {
    open: 0,
    queued: 0,
    played: 0,
    skipped: 0,
  };

  for (const row of rows) {
    const key = normalizeRequestStatus(row?.status_key, false);
    counts[key] = toInt(row?.count);
  }

  return counts;
}

function getSessionVotedSongPlayCount(db, liveSessionId) {
  if (!liveSessionId) return 0;

  const voteRows = db.prepare(`
    SELECT
      v.id,
      v.winning_option_id,
      COALESCE(NULLIF(v.updated_at, ''), NULLIF(v.ends_at, ''), v.created_at) AS closed_at,
      o.chart_key,
      o.song_title,
      o.mode,
      o.level
    FROM live_session_votes v
    JOIN live_session_vote_options o ON o.id = v.winning_option_id
    WHERE v.live_session_id = ?
      AND COALESCE(v.winning_option_id, '') <> ''
    ORDER BY datetime(COALESCE(NULLIF(v.updated_at, ''), NULLIF(v.ends_at, ''), v.created_at)) ASC, v.id ASC
  `).all(liveSessionId);
  if (voteRows.length === 0) return 0;

  const playRows = db.prepare(`
    SELECT id, song_title, mode, level, date_played
    FROM live_session_plays
    WHERE live_session_id = ?
  `).all(liveSessionId);
  if (playRows.length === 0) return 0;

  const playsByKey = new Map();
  for (const row of playRows) {
    const key = row.chart_key || buildChartKey(row.song_title, row.mode, row.level);
    if (!key) continue;
    if (!playsByKey.has(key)) playsByKey.set(key, []);
    playsByKey.get(key).push({
      id: toInt(row.id),
      playedAt: parsePlayedAt(row.date_played),
      consumed: false,
    });
  }

  for (const rows of playsByKey.values()) {
    rows.sort((a, b) => {
      const aTime = a.playedAt ? a.playedAt.getTime() : 0;
      const bTime = b.playedAt ? b.playedAt.getTime() : 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.id - b.id;
    });
  }

  let count = 0;
  for (const vote of voteRows) {
    const key = vote.chart_key || buildChartKey(vote.song_title, vote.mode, vote.level);
    const plays = playsByKey.get(key);
    if (!plays || plays.length === 0) continue;

    const closedAt = parseSqliteDateTime(vote.closed_at);
    let matched = null;
    for (const play of plays) {
      if (play.consumed) continue;
      if (closedAt && play.playedAt && play.playedAt.getTime() < closedAt.getTime()) continue;
      matched = play;
      break;
    }

    if (!matched && !closedAt) {
      matched = plays.find((play) => !play.consumed) || null;
    }

    if (!matched) continue;
    matched.consumed = true;
    count += 1;
  }

  return count;
}

function getSessionInteractionCounts(db, liveSessionId) {
  const requestCounts = getSessionRequestCounts(db, liveSessionId);
  const requestPlayCount = toInt(requestCounts.played);
  const votedSongPlayCount = getSessionVotedSongPlayCount(db, liveSessionId);
  return {
    requestPlayCount,
    votedSongPlayCount,
    interactions: requestPlayCount + votedSongPlayCount,
    requestCounts,
  };
}

module.exports = {
  buildChartKey,
  getSessionInteractionCounts,
  getSessionMessageCount,
  getSessionRequestCounts,
  getSessionVotedSongPlayCount,
  normalizeRequestStatus,
  parseSqliteDateTime,
  toInt,
};

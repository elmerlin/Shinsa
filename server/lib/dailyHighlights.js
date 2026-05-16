const { applyChartMetadata } = require('./activityPostEnrichment');

const replaySourcePlayStmtCache = new WeakMap();

function getCachedStmt(cache, db, sql) {
  let stmt = cache.get(db);
  if (!stmt) {
    stmt = db.prepare(sql);
    cache.set(db, stmt);
  }
  return stmt;
}

function toInt(value) {
  const numeric = parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function extractYoutubeVideoId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  );
  if (match?.[1]) return match[1];
  return /^[a-zA-Z0-9_-]{11}$/.test(raw) ? raw : '';
}

function getReplaySourcePlayStmt(db) {
  return getCachedStmt(replaySourcePlayStmtCache, db, `
    SELECT
      rp.id AS play_id,
      rp.score,
      rp.grade,
      rp.plate,
      rp.perfect,
      rp.great,
      rp.good,
      rp.bad,
      rp.miss,
      rp.max_combo,
      rp.background_url,
      rp.date_played,
      rp.played_at_utc,
      rp.machine_name,
      rp.replay_embed_url,
      rp.replay_video_id,
      rp.replay_start_seconds,
      rp.replay_end_seconds,
      (SELECT COUNT(*) FROM play_comments WHERE play_id = rp.id) AS comment_count
    FROM user_recently_played rp
    WHERE rp.user_id = ?
      AND rp.song_title = ?
      AND rp.mode = ?
      AND rp.level = ?
      AND (
        rp.replay_embed_url = ?
        OR (? != '' AND rp.replay_video_id = ?)
        OR (? != '' AND rp.replay_embed_url LIKE '%' || ? || '%')
      )
    ORDER BY
      datetime(COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played, '1970-01-01')) DESC,
      rp.id DESC
    LIMIT 1
  `);
}

function findReplaySourcePlay(db, row) {
  if (!db || !row) return null;
  const replayEmbedUrl = String(row.replay_embed_url || '').trim();
  const replayVideoId = String(row.replay_video_id || '').trim() || extractYoutubeVideoId(replayEmbedUrl);
  if (!replayEmbedUrl && !replayVideoId) return null;

  return getReplaySourcePlayStmt(db).get(
    row.user_id,
    row.song_title,
    row.mode,
    toInt(row.level),
    replayEmbedUrl,
    replayVideoId,
    replayVideoId,
    replayVideoId,
    replayVideoId,
  ) || null;
}

function resolveReplayHighlightRow(db, row) {
  if (!row) return row;

  const replaySourceKind = String(row.replay_source_kind || '').trim();
  if (replaySourceKind !== 'chart_linked') {
    return {
      ...row,
      play_id: row.play_id || row.id || null,
    };
  }

  const source = findReplaySourcePlay(db, row);
  if (!source) {
    return {
      ...row,
      play_id: row.play_id || row.id || null,
    };
  }

  const replayEmbedUrl = String(row.replay_embed_url || source.replay_embed_url || '').trim();
  const replayVideoId = String(row.replay_video_id || source.replay_video_id || '').trim()
    || extractYoutubeVideoId(replayEmbedUrl);

  return {
    ...row,
    score: toInt(source.score),
    grade: String(source.grade || '').trim(),
    plate: String(source.plate || row.plate || '').trim(),
    perfect: toInt(source.perfect),
    great: toInt(source.great),
    good: toInt(source.good),
    bad: toInt(source.bad),
    miss: toInt(source.miss),
    max_combo: Math.max(toInt(row.max_combo), toInt(source.max_combo)),
    background_url: String(row.background_url || source.background_url || '').trim(),
    date_played: String(source.date_played || row.date_played || '').trim(),
    played_at_utc: String(source.played_at_utc || row.played_at_utc || '').trim(),
    machine_name: String(source.machine_name || row.machine_name || '').trim(),
    replay_embed_url: replayEmbedUrl,
    replay_video_id: replayVideoId,
    replay_start_seconds: toInt(row.replay_start_seconds) || toInt(source.replay_start_seconds),
    replay_end_seconds: toInt(row.replay_end_seconds) || toInt(source.replay_end_seconds),
    comment_count: toInt(source.comment_count),
    play_id: toInt(source.play_id) || row.play_id || row.id || null,
    replay_source_play_id: toInt(source.play_id) || null,
    highlight_play_id: row.id || null,
  };
}

function resolveDailyHighlightReplayRows(db, rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const resolved = resolveReplayHighlightRow(db, row);
    // applyChartMetadata fills in jacket_url + chart_id by looking up the
    // (song_title, mode, level) tuple in the songs table. Without it the
    // mobile highlight tile falls back to the piugame.com background_url
    // which loads slowly / inconsistently from some networks.
    return applyChartMetadata(db, resolved);
  });
}

module.exports = {
  extractYoutubeVideoId,
  findReplaySourcePlay,
  resolveDailyHighlightReplayRows,
  resolveReplayHighlightRow,
  toInt,
};

const recentPlayJudgmentsBeforeStmtCache = new WeakMap();
const recentPlayJudgmentsAnyStmtCache = new WeakMap();
const recentPlayMetadataBeforeStmtCache = new WeakMap();
const recentPlayMetadataAnyStmtCache = new WeakMap();
const sessionReplayLinkStmtCache = new WeakMap();
const songChartByExactStmtCache = new WeakMap();
const songChartByJacketStmtCache = new WeakMap();

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

function safeParseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasJudgmentData(entry) {
  return (
    toInt(entry?.perfect) > 0 ||
    toInt(entry?.great) > 0 ||
    toInt(entry?.good) > 0 ||
    toInt(entry?.bad) > 0 ||
    toInt(entry?.miss) > 0
  );
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

function getRecentPlayJudgmentsBeforeStmt(db) {
  return getCachedStmt(recentPlayJudgmentsBeforeStmtCache, db, `
    SELECT id AS play_id, perfect, great, good, bad, miss, max_combo, plate, background_url, date_played, played_at_utc, over_top100_rank, machine_name
    FROM user_recently_played
    WHERE user_id = ?
      AND song_title = ?
      AND mode = ?
      AND level = ?
      AND score = ?
      AND (
        COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
      ) > 0
      AND datetime(COALESCE(NULLIF(played_at_utc, ''), date_played, '')) <= datetime(?)
    ORDER BY
      datetime(COALESCE(NULLIF(played_at_utc, ''), date_played, '1970-01-01')) DESC,
      (
        COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
      ) DESC,
      id DESC
    LIMIT 1
  `);
}

function getRecentPlayJudgmentsAnyStmt(db) {
  return getCachedStmt(recentPlayJudgmentsAnyStmtCache, db, `
    SELECT id AS play_id, perfect, great, good, bad, miss, max_combo, plate, background_url, date_played, played_at_utc, over_top100_rank, machine_name
    FROM user_recently_played
    WHERE user_id = ?
      AND song_title = ?
      AND mode = ?
      AND level = ?
      AND score = ?
      AND (
        COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
      ) > 0
    ORDER BY
      datetime(COALESCE(NULLIF(played_at_utc, ''), date_played, '1970-01-01')) DESC,
      (
        COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
      ) DESC,
      id DESC
    LIMIT 1
  `);
}

function getRecentPlayMetadataBeforeStmt(db) {
  return getCachedStmt(recentPlayMetadataBeforeStmtCache, db, `
    SELECT
      id AS play_id, perfect, great, good, bad, miss, max_combo, background_url, date_played, played_at_utc, over_top100_rank,
      replay_embed_url, replay_video_id, replay_start_seconds, replay_end_seconds, machine_name, plate
    FROM user_recently_played
    WHERE user_id = ?
      AND song_title = ?
      AND mode = ?
      AND level = ?
      AND score = ?
      AND datetime(COALESCE(NULLIF(played_at_utc, ''), date_played, '')) <= datetime(?)
    ORDER BY
      datetime(COALESCE(NULLIF(played_at_utc, ''), date_played, '1970-01-01')) DESC,
      id DESC
    LIMIT 1
  `);
}

function getRecentPlayMetadataAnyStmt(db) {
  return getCachedStmt(recentPlayMetadataAnyStmtCache, db, `
    SELECT
      id AS play_id, perfect, great, good, bad, miss, max_combo, background_url, date_played, played_at_utc, over_top100_rank,
      replay_embed_url, replay_video_id, replay_start_seconds, replay_end_seconds, machine_name, plate
    FROM user_recently_played
    WHERE user_id = ?
      AND song_title = ?
      AND mode = ?
      AND level = ?
      AND score = ?
    ORDER BY
      datetime(COALESCE(NULLIF(played_at_utc, ''), date_played, '1970-01-01')) DESC,
      id DESC
    LIMIT 1
  `);
}

function getSessionReplayLinkStmt(db) {
  return getCachedStmt(sessionReplayLinkStmtCache, db, `
    SELECT COALESCE(NULLIF(yt.session_youtube_url, ''), '') AS replay_embed_url
    FROM songs chart
    LEFT JOIN user_chart_youtube_links yt
      ON yt.user_id = ?
     AND yt.chart_id = chart.id
    WHERE chart.title = ?
      AND chart.mode = ?
      AND chart.level = ?
    ORDER BY chart.id ASC
    LIMIT 1
  `);
}

function getSongChartByExactStmt(db) {
  return getCachedStmt(songChartByExactStmtCache, db, `
    SELECT id AS chart_id, jacket_url
    FROM songs
    WHERE title = ?
      AND mode = ?
      AND level = ?
    ORDER BY id ASC
    LIMIT 1
  `);
}

function getSongChartByJacketStmt(db) {
  return getCachedStmt(songChartByJacketStmtCache, db, `
    SELECT id AS chart_id, jacket_url
    FROM songs
    WHERE jacket_url = ?
      AND mode = ?
      AND level = ?
    ORDER BY id ASC
    LIMIT 1
  `);
}

function findRecentPlayJudgments(db, { userId, createdAt, songTitle, mode, level, score }) {
  if (!userId || !songTitle || !mode) return null;
  const numericLevel = toInt(level);
  const numericScore = toInt(score);
  if (numericLevel <= 0 || numericScore <= 0) return null;

  if (createdAt) {
    const datedMatch = getRecentPlayJudgmentsBeforeStmt(db).get(
      userId,
      songTitle,
      mode,
      numericLevel,
      numericScore,
      createdAt
    );
    if (datedMatch) return datedMatch;
  }

  return getRecentPlayJudgmentsAnyStmt(db).get(userId, songTitle, mode, numericLevel, numericScore) || null;
}

function findRecentPlayMetadata(db, { userId, createdAt, songTitle, mode, level, score }) {
  if (!userId || !songTitle || !mode) return null;
  const numericLevel = toInt(level);
  const numericScore = toInt(score);
  if (numericLevel <= 0 || numericScore <= 0) return null;

  if (createdAt) {
    const datedMatch = getRecentPlayMetadataBeforeStmt(db).get(
      userId,
      songTitle,
      mode,
      numericLevel,
      numericScore,
      createdAt
    );
    if (datedMatch) return datedMatch;
  }

  return getRecentPlayMetadataAnyStmt(db).get(userId, songTitle, mode, numericLevel, numericScore) || null;
}

function findSessionReplayLink(db, { userId, songTitle, mode, level }) {
  if (!userId || !songTitle || !mode) return null;
  const numericLevel = toInt(level);
  if (numericLevel <= 0) return null;
  const row = getSessionReplayLinkStmt(db).get(userId, songTitle, mode, numericLevel) || null;
  const replayEmbedUrl = String(row?.replay_embed_url || '').trim();
  if (!replayEmbedUrl) return null;
  return {
    replay_embed_url: replayEmbedUrl,
    replay_video_id: extractYoutubeVideoId(replayEmbedUrl),
  };
}

function findSongChartMetadata(db, { songTitle, mode, level, jacketUrl = '' }) {
  const normalizedTitle = String(songTitle || '').trim();
  const normalizedMode = String(mode || '').trim();
  const numericLevel = toInt(level);
  if (!normalizedMode || numericLevel <= 0) return null;

  if (normalizedTitle) {
    const exactMatch = getSongChartByExactStmt(db).get(normalizedTitle, normalizedMode, numericLevel) || null;
    if (exactMatch) return exactMatch;
  }

  const normalizedJacketUrl = String(jacketUrl || '').trim();
  if (!normalizedJacketUrl) return null;
  return getSongChartByJacketStmt(db).get(normalizedJacketUrl, normalizedMode, numericLevel) || null;
}

function applyChartMetadata(db, entry) {
  if (!entry) return entry;

  const songTitle = String(entry.song_title || '').trim();
  const existingChartId = toInt(entry.chart_id);
  const existingChartPath = String(entry.chart_path || '').trim();
  const existingJacketUrl = String(entry.jacket_url || '').trim();
  if (existingChartId > 0 && existingChartPath && existingJacketUrl) return entry;

  const metadata = findSongChartMetadata(db, {
    songTitle,
    mode: entry.mode,
    level: entry.level,
    jacketUrl: existingJacketUrl || entry.background_url || '',
  });
  const chartId = existingChartId || toInt(metadata?.chart_id);
  const chartPath = existingChartPath || (
    chartId > 0
      ? `/songs/chart/${chartId}`
      : (songTitle ? `/songs?q=${encodeURIComponent(songTitle)}` : '/songs')
  );

  return {
    ...entry,
    chart_id: chartId || 0,
    chart_path: chartPath,
    jacket_url: existingJacketUrl || String(metadata?.jacket_url || '').trim() || String(entry.background_url || '').trim(),
  };
}

function enrichEntryWithJudgments(db, userId, createdAt, entry, scoreKey = 'score') {
  if (!entry) return entry;

  const needsJudgments = !hasJudgmentData(entry);
  const needsMachine = !String(entry.machine_name || '').trim();
  const needsPlayId = !entry.play_id;

  if (!needsJudgments && !needsMachine && !needsPlayId) return entry;

  const lookup = findRecentPlayJudgments(db, {
    userId,
    createdAt,
    songTitle: entry.song_title,
    mode: entry.mode,
    level: entry.level,
    score: entry[scoreKey],
  });
  if (!lookup) return entry;

  if (needsJudgments) {
    return {
      ...entry,
      perfect: toInt(lookup.perfect),
      great: toInt(lookup.great),
      good: toInt(lookup.good),
      bad: toInt(lookup.bad),
      miss: toInt(lookup.miss),
      max_combo: Math.max(toInt(entry.max_combo), toInt(lookup.max_combo)),
      plate: entry.plate || lookup.plate || '',
      background_url: entry.background_url || lookup.background_url || '',
      over_top100_rank: toInt(entry.over_top100_rank) || toInt(lookup.over_top100_rank),
      machine_name: entry.machine_name || lookup.machine_name || '',
      played_at_utc: entry.played_at_utc || lookup.played_at_utc || '',
      play_id: entry.play_id || lookup.play_id || null,
    };
  }

  return {
    ...entry,
    machine_name: entry.machine_name || lookup.machine_name || '',
    played_at_utc: entry.played_at_utc || lookup.played_at_utc || '',
    play_id: entry.play_id || lookup.play_id || null,
  };
}

function mergeReplayMetadata(entry, lookup) {
  if (!lookup) return entry;

  const replayEmbedUrl = String(lookup.replay_embed_url || '').trim();
  return {
    ...entry,
    replay_embed_url: replayEmbedUrl,
    replay_video_id: replayEmbedUrl
      ? (String(lookup.replay_video_id || '').trim() || extractYoutubeVideoId(replayEmbedUrl))
      : '',
    replay_start_seconds: replayEmbedUrl ? toInt(lookup.replay_start_seconds) : 0,
    replay_end_seconds: replayEmbedUrl ? toInt(lookup.replay_end_seconds) : 0,
    machine_name: entry.machine_name || lookup.machine_name || '',
    played_at_utc: entry.played_at_utc || lookup.played_at_utc || '',
    date_played: entry.date_played || lookup.date_played || '',
    play_id: entry.play_id || lookup.play_id || null,
  };
}

function enrichUpscoreRows(db, userId, rows = [], createdAt = '') {
  return (Array.isArray(rows) ? rows : []).map((item) => {
    const enriched = applyChartMetadata(db, enrichEntryWithJudgments(db, userId, createdAt, item, 'new_score'));
    const lookup = findRecentPlayMetadata(db, {
      userId,
      createdAt,
      songTitle: item?.song_title,
      mode: item?.mode,
      level: item?.level,
      score: item?.new_score,
    });
    return mergeReplayMetadata(enriched, lookup);
  });
}

function buildClearFallbackItem(clear) {
  if (!clear?.song_title || !clear?.mode || !toInt(clear?.level)) return null;
  return {
    entry_type: 'song_clear',
    song_title: clear.song_title,
    mode: clear.mode,
    level: toInt(clear.level),
    score: toInt(clear.score),
    grade: clear.grade || '',
    plate: clear.plate || '',
    background_url: clear.background_url || '',
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
    pumbility_gain: toInt(clear.pumbility_gain),
    singles_pumbility_gain: toInt(clear.singles_pumbility_gain),
    over_top100_rank: toInt(clear.over_top100_rank),
    replay_embed_url: clear.replay_embed_url || '',
    replay_video_id: clear.replay_video_id || '',
    replay_start_seconds: toInt(clear.replay_start_seconds),
    replay_end_seconds: toInt(clear.replay_end_seconds),
    date_played: clear.date_played || '',
    played_at_utc: clear.played_at_utc || '',
    machine_name: clear.machine_name || '',
    play_id: clear.play_id || null,
  };
}

function enrichClearRows(db, userId, rows = [], createdAt = '') {
  return (Array.isArray(rows) ? rows : []).map((item) => {
    if (String(item?.entry_type || '') === 'title_unlock') return item;

    const enriched = enrichEntryWithJudgments(db, userId, createdAt, item, 'score');
    const lookup = findRecentPlayMetadata(db, {
      userId,
      createdAt,
      songTitle: item?.song_title,
      mode: item?.mode,
      level: item?.level,
      score: item?.score,
    });
    return applyChartMetadata(db, mergeReplayMetadata(enriched, lookup));
  });
}

function enrichUpscoreRecord(db, upscore) {
  if (!upscore?.upscores_json) return upscore;
  const items = safeParseJsonArray(upscore.upscores_json);
  if (items.length === 0) return upscore;

  return {
    ...upscore,
    upscores_json: JSON.stringify(enrichUpscoreRows(db, upscore.user_id, items, upscore.created_at)),
  };
}

function enrichClearRecord(db, clear) {
  const parsedItems = safeParseJsonArray(clear?.clears_json);
  const items = parsedItems.length > 0 ? parsedItems : [buildClearFallbackItem(clear)].filter(Boolean);
  if (items.length === 0) return clear;

  return {
    ...clear,
    clears_json: JSON.stringify(enrichClearRows(db, clear.user_id, items, clear.created_at)),
  };
}

module.exports = {
  applyChartMetadata,
  buildClearFallbackItem,
  enrichClearRecord,
  enrichClearRows,
  enrichUpscoreRecord,
  enrichUpscoreRows,
  extractYoutubeVideoId,
  findRecentPlayMetadata,
  findSongChartMetadata,
  findSessionReplayLink,
  hasJudgmentData,
  safeParseJsonArray,
  toInt,
};

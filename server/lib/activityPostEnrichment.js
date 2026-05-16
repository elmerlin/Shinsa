const { getUserTitleProgress } = require('./titleProgress');
const { normalizeMode } = require('./chartKeys');

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

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeComparable(value) {
  return normalizeString(value).toLowerCase().replace(/\s+/g, ' ');
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
  // TRIM(title) on both sides handles songs that landed in the catalog
  // with trailing whitespace (e.g. "Black Swan " from a quirky scrape).
  return getCachedStmt(songChartByExactStmtCache, db, `
    SELECT id AS chart_id, jacket_url
    FROM songs
    WHERE TRIM(title) = ?
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

/**
 * Common title variants that show up because the upstream piugame scraper
 * sometimes drops trailing punctuation ("R.I.P" vs the songs DB's "R.I.P.")
 * or normalizes whitespace differently. We try the literal title first,
 * then a few cheap variants before falling through to the jacket-URL match.
 */
function buildTitleVariants(rawTitle) {
  const seen = new Set();
  const out = [];
  const push = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  push(rawTitle);
  if (!rawTitle) return out;
  // Toggle a trailing period — handles "R.I.P" ↔ "R.I.P."
  if (rawTitle.endsWith('.')) push(rawTitle.replace(/\.+$/, ''));
  else push(`${rawTitle}.`);
  // Strip all trailing punctuation, then re-add a single dot — handles
  // weirder cases like "R.I.P!" or "R.I.P …" coming from bad scrapes.
  const stripped = rawTitle.replace(/[\s.!?…]+$/u, '');
  if (stripped && stripped !== rawTitle) {
    push(stripped);
    push(`${stripped}.`);
  }
  return out;
}

function findSongChartMetadata(db, { songTitle, mode, level, jacketUrl = '' }) {
  const normalizedTitle = String(songTitle || '').trim();
  // Songs catalog stores `CoOp` but upstream sources sometimes hand us
  // `Co-op` / `co op` / `coop`. normalizeMode() canonicalises both ways
  // so the lookup matches even when the input mode style differs.
  const normalizedMode = normalizeMode(mode) || String(mode || '').trim();
  const numericLevel = toInt(level);
  if (!normalizedMode || numericLevel <= 0) return null;

  if (normalizedTitle) {
    const stmt = getSongChartByExactStmt(db);
    for (const variant of buildTitleVariants(normalizedTitle)) {
      const match = stmt.get(variant, normalizedMode, numericLevel);
      if (match) return match;
    }
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

  // Prefer the songs-table jacket (Shinsa-hosted, e.g. /jackets/pump/123.jpg)
  // over whatever existingJacketUrl might already be on the row. Existing
  // values are often the piugame.com CDN URL which loads slowly /
  // inconsistently from some networks — keeping it would defeat the
  // whole point of the songs-table lookup.
  const metadataJacketUrl = String(metadata?.jacket_url || '').trim();
  const resolvedJacketUrl = metadataJacketUrl
    || existingJacketUrl
    || String(entry.background_url || '').trim();
  return {
    ...entry,
    chart_id: chartId || 0,
    chart_path: chartPath,
    jacket_url: resolvedJacketUrl,
  };
}

function enrichEntryWithJudgments(db, userId, createdAt, entry, scoreKey = 'score') {
  if (!entry) return entry;

  const needsJudgments = !hasJudgmentData(entry);
  const needsPlate = !String(entry.plate || '').trim();
  const needsBackground = !String(entry.background_url || '').trim();
  const needsMachine = !String(entry.machine_name || '').trim();
  const needsPlayId = !entry.play_id;

  if (!needsJudgments && !needsPlate && !needsBackground && !needsMachine && !needsPlayId) return entry;

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
    plate: entry.plate || lookup.plate || '',
    background_url: entry.background_url || lookup.background_url || '',
    over_top100_rank: toInt(entry.over_top100_rank) || toInt(lookup.over_top100_rank),
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

function serializeTitleProgressNode(title) {
  if (!title) return null;
  return {
    id: normalizeString(title.id),
    index: toInt(title.index),
    name: normalizeString(title.name || title.skill_title || 'Skill Title'),
    skill_title: normalizeString(title.skill_title || title.name || 'Skill Title'),
    skill_family: normalizeString(title.skill_family),
    skill_level: toInt(title.skill_level),
    level: toInt(title.level),
    tier: normalizeString(title.tier),
    required_points: toInt(title.required_points),
    earned_points: toInt(title.earned_points),
    remaining_points: toInt(title.remaining_points),
    progress_percent: Number(title.progress_percent) || 0,
    unlocked: !!title.unlocked,
  };
}

function mergeTitleProgressNode(existingNode, fallbackTitle) {
  const fallback = serializeTitleProgressNode(fallbackTitle);
  if (!existingNode && !fallback) return null;

  return {
    ...(fallback || {}),
    ...(existingNode || {}),
    id: normalizeString(existingNode?.id || fallback?.id),
    index: toInt(existingNode?.index) || toInt(fallback?.index),
    name: normalizeString(existingNode?.name || existingNode?.skill_title || fallback?.name || fallback?.skill_title || 'Skill Title'),
    skill_title: normalizeString(existingNode?.skill_title || existingNode?.name || fallback?.skill_title || fallback?.name || 'Skill Title'),
    skill_family: normalizeString(existingNode?.skill_family || fallback?.skill_family),
    skill_level: toInt(existingNode?.skill_level) || toInt(fallback?.skill_level),
    level: toInt(existingNode?.level) || toInt(fallback?.level),
    tier: normalizeString(existingNode?.tier || fallback?.tier),
    required_points: toInt(existingNode?.required_points) || toInt(fallback?.required_points),
    earned_points: toInt(existingNode?.earned_points) || toInt(fallback?.earned_points),
    remaining_points: toInt(existingNode?.remaining_points) || toInt(fallback?.remaining_points),
    progress_percent: Number(existingNode?.progress_percent) || Number(fallback?.progress_percent) || 0,
    unlocked: existingNode?.unlocked == null ? !!fallback?.unlocked : !!existingNode.unlocked,
  };
}

function findProgressTitleMatch(progress, item) {
  const titles = Array.isArray(progress?.titles) ? progress.titles : [];
  if (titles.length === 0) return null;

  const explicitId = normalizeString(item?.title_current_node?.id);
  if (explicitId) {
    const byId = titles.find((title) => normalizeString(title.id) === explicitId);
    if (byId) return byId;
  }

  const family = normalizeComparable(item?.title_family || item?.title_current_node?.skill_family);
  const skillLevel = toInt(item?.title_level || item?.title_current_node?.skill_level);
  if (family && skillLevel > 0) {
    const byFamilyAndLevel = titles.find((title) =>
      normalizeComparable(title.skill_family) === family && toInt(title.skill_level) === skillLevel
    );
    if (byFamilyAndLevel) return byFamilyAndLevel;
  }

  const nameCandidates = [
    item?.title_name,
    item?.song_title,
    item?.title_current_node?.name,
    item?.title_current_node?.skill_title,
  ].map(normalizeComparable).filter(Boolean);

  if (nameCandidates.length === 0) return null;
  return titles.find((title) => {
    const names = [title.name, title.skill_title].map(normalizeComparable).filter(Boolean);
    return nameCandidates.some((candidate) => names.includes(candidate));
  }) || null;
}

function enrichTitleUnlockItem(progress, item) {
  if (String(item?.entry_type || '') !== 'title_unlock') return item;
  if (!progress?.imported) return item;

  const currentTitle = findProgressTitleMatch(progress, item);
  if (!currentTitle) return item;

  const titleIndex = toInt(currentTitle.index);
  const allTitles = Array.isArray(progress?.titles) ? progress.titles : [];
  const previousTitle = titleIndex > 0 ? allTitles[titleIndex - 1] : null;
  const nextTitle = titleIndex >= 0 ? (allTitles[titleIndex + 1] || null) : null;

  return {
    ...item,
    song_title: normalizeString(item.song_title || currentTitle.name || currentTitle.skill_title || 'Skill Title'),
    mode: normalizeString(item.mode || 'Skill Title') || 'Skill Title',
    level: toInt(item.level) || toInt(currentTitle.level),
    score: toInt(item.score) || toInt(currentTitle.required_points),
    grade: normalizeString(item.grade || 'SKILL TITLE') || 'SKILL TITLE',
    title_name: normalizeString(item.title_name || currentTitle.name || currentTitle.skill_title || 'Skill Title'),
    title_family: normalizeString(item.title_family || currentTitle.skill_family),
    title_level: toInt(item.title_level) || toInt(currentTitle.skill_level),
    title_tier: normalizeString(item.title_tier || currentTitle.tier),
    title_required_points: toInt(item.title_required_points) || toInt(currentTitle.required_points),
    title_earned_points: toInt(item.title_earned_points) || toInt(currentTitle.earned_points),
    title_remaining_points: toInt(item.title_remaining_points) || toInt(currentTitle.remaining_points),
    title_progress_percent: Number(item.title_progress_percent) || Number(currentTitle.progress_percent) || 0,
    title_previous_node: mergeTitleProgressNode(item.title_previous_node, previousTitle),
    title_current_node: mergeTitleProgressNode(item.title_current_node, currentTitle),
    title_next_node: mergeTitleProgressNode(item.title_next_node, nextTitle),
  };
}

function enrichClearRows(db, userId, rows = [], createdAt = '') {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const needsTitleBackfill = normalizedRows.some((item) =>
    String(item?.entry_type || '') === 'title_unlock' && (
      !item?.title_current_node ||
      !item?.title_previous_node ||
      !item?.title_next_node ||
      !toInt(item?.title_required_points)
    )
  );
  const titleProgress = needsTitleBackfill ? getUserTitleProgress(db, userId) : null;

  return normalizedRows.map((item) => {
    if (String(item?.entry_type || '') === 'title_unlock') {
      return enrichTitleUnlockItem(titleProgress, item);
    }

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
  const enrichedItems = enrichClearRows(db, clear.user_id, items, clear.created_at);
  const primaryItem = enrichedItems.find((item) => String(item?.entry_type || '') !== 'title_unlock') || enrichedItems[0];

  return {
    ...clear,
    plate: clear.plate || primaryItem?.plate || '',
    background_url: clear.background_url || primaryItem?.background_url || '',
    // Surface the Shinsa-hosted jacket URL at the top level so feed
    // consumers can prefer it over the piugame.com background. The
    // enriched item already has it from applyChartMetadata.
    jacket_url: clear.jacket_url || primaryItem?.jacket_url || '',
    played_at_utc: clear.played_at_utc || primaryItem?.played_at_utc || '',
    machine_name: clear.machine_name || primaryItem?.machine_name || '',
    play_id: clear.play_id || primaryItem?.play_id || null,
    clears_json: JSON.stringify(enrichedItems),
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

const { getUserTitleProgress } = require('./titleProgress');
const { normalizeMode, normalizeSongName } = require('./chartKeys');
const { toCanonicalTitle } = require('./songAliases');
const { resolveJacketUrl } = require('./jacketMap');

const recentPlayJudgmentsBeforeStmtCache = new WeakMap();
const recentPlayJudgmentsAnyStmtCache = new WeakMap();
const recentPlayMetadataBeforeStmtCache = new WeakMap();
const recentPlayMetadataAnyStmtCache = new WeakMap();
const sessionReplayLinkStmtCache = new WeakMap();
const songChartByExactStmtCache = new WeakMap();
const songChartByCanonicalStmtCache = new WeakMap();
const songChartByJacketStmtCache = new WeakMap();
const songJacketByTitleStmtCache = new WeakMap();

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

const playHrByIdStmtCache = new WeakMap();
function getPlayHrByIdStmt(db) {
  return getCachedStmt(playHrByIdStmtCache, db, `
    SELECT hr_avg, hr_peak, hr_min, hr_series, hr_source, hr_duration_s
    FROM user_recently_played WHERE id = ?
  `);
}

// Player's effective max HR (manual users.max_hr, else highest synced peak,
// else 190) — shipped as hr_max so viewers render the PLAYER's zones.
// Mirrors getHrProfile in routes/health.js.
const userMaxHrStmtCache = new WeakMap();
function getUserEffectiveMaxHr(db, userId) {
  if (!userId) return 190;
  const stmt = getCachedStmt(userMaxHrStmtCache, db, `
    SELECT COALESCE(NULLIF((SELECT max_hr FROM users WHERE id = ?), 0),
                    (SELECT MAX(hr_peak) FROM user_recently_played WHERE user_id = ? AND hr_peak > 0),
                    190) AS max_hr
  `);
  return toInt(stmt.get(userId, userId)?.max_hr) || 190;
}

// Attach per-play heart rate by play_id. HR lives only on user_recently_played
// (never in the denormalized feed JSON), so it's looked up exactly by id once
// play_id is resolved. Only attaches when HR actually exists, to keep the
// feed payload lean for the (currently common) no-HR case.
function attachHeartRateById(db, entry, userId = '') {
  if (!entry || entry.hr_avg != null) return entry;
  const playId = toInt(entry.play_id);
  if (!playId) return entry;
  const row = getPlayHrByIdStmt(db).get(playId);
  if (!row) return entry;
  const avg = toInt(row.hr_avg);
  const peak = toInt(row.hr_peak);
  if (avg <= 0 && peak <= 0) return entry;
  return {
    ...entry,
    hr_avg: avg,
    hr_peak: peak,
    hr_min: toInt(row.hr_min),
    hr_series: row.hr_series || '',
    hr_source: row.hr_source || '',
    hr_duration_s: toInt(row.hr_duration_s),
    hr_max: getUserEffectiveMaxHr(db, userId),
  };
}

function normalizeString(value) {
  return String(value || '').trim();
}

// normalizeSongName + parenthesis stripping. The catalog stores the same song
// under both "Papasito (feat. KuTiNA)" and "Papasito feat. KuTiNA", with the
// chart we want sometimes living only under one form — so a paren-sensitive
// match misses. Dropping ( ) folds both to "papasito feat. kutina". The SQL in
// getSongChartByCanonicalStmt strips ( ) the same way so key and column agree.
function looseTitleKey(value) {
  return normalizeSongName(value).replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
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

// Title-only jacket lookup (any mode/level). Used for UCS / unscored entries
// that have no real chart row but ARE built on a base song that's in the
// catalog — so the base song's artwork is resolvable by normalized title.
function getSongJacketByTitleStmt(db) {
  return getCachedStmt(songJacketByTitleStmtCache, db, `
    SELECT jacket_url
    FROM songs
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(title)), '(', ''), ')', ''), '  ', ' '), '  ', ' ') = ?
      AND jacket_url != ''
    ORDER BY id ASC
    LIMIT 1
  `);
}

// Normalized fallback used when the scraped play-title and the catalog title
// differ only by capitalization, whitespace, or locale. The songs catalog is
// polluted with the same song under multiple casings (e.g. "feat. Skizzo" vs
// "feat. skizzo") and uneven per-casing chart coverage, so a case-sensitive
// exact match misses whenever the play's casing lacks that mode/level. We
// normalize the column the same way the lookup key is normalized — LOWER +
// TRIM + collapse internal whitespace (two REPLACE passes fold runs of up to
// four spaces to one, which is far beyond anything a real title contains).
function getSongChartByCanonicalStmt(db) {
  return getCachedStmt(songChartByCanonicalStmtCache, db, `
    SELECT id AS chart_id, jacket_url
    FROM songs
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(title)), '(', ''), ')', ''), '  ', ' '), '  ', ' ') = ?
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
  if (!normalizedMode || numericLevel <= 0) {
    // UCS / unscored plays carry mode "UCS" and level 0, so there's no real
    // chart row to match — but the custom step is built on a base song that
    // IS catalogued. Resolve that song's jacket by title alone so the feed
    // tile shows artwork instead of a "?" placeholder. chart_id stays 0
    // (there's no specific official chart to deep-link to).
    if (!normalizedTitle) return null;
    const titleStmt = getSongJacketByTitleStmt(db);
    for (const key of [looseTitleKey(normalizedTitle), looseTitleKey(toCanonicalTitle(normalizedTitle))]) {
      const k = String(key || '').trim();
      if (!k) continue;
      const match = titleStmt.get(k);
      if (match && match.jacket_url) return { chart_id: 0, jacket_url: match.jacket_url };
    }
    return null;
  }

  if (normalizedTitle) {
    // 1) Exact (case-sensitive) match incl. trailing-punctuation variants —
    //    the fast path that resolves the vast majority of rows.
    const exactStmt = getSongChartByExactStmt(db);
    for (const variant of buildTitleVariants(normalizedTitle)) {
      const match = exactStmt.get(variant, normalizedMode, numericLevel);
      if (match) return match;
    }

    // 2) Normalized fallback — ALWAYS run when the exact match misses, not
    //    only when an alias rewrites the title. The catalog and the scraped
    //    play-title routinely disagree on capitalization, whitespace, or
    //    locale, and the exact match above is case-sensitive. Retry against a
    //    normalized key: first the as-played title (lower + whitespace-
    //    collapsed), then its alias-resolved canonical form (Korean ↔ English,
    //    "feat. X" → base). This mirrors the normalization behind
    //    /api/songs/jacket-map so every consumer resolves identically.
    const ciStmt = getSongChartByCanonicalStmt(db);
    const keys = [];
    const pushKey = (value) => {
      const key = String(value || '').trim();
      if (key && !keys.includes(key)) keys.push(key);
    };
    pushKey(looseTitleKey(normalizedTitle));
    pushKey(looseTitleKey(toCanonicalTitle(normalizedTitle)));
    for (const key of keys) {
      const match = ciStmt.get(key, normalizedMode, numericLevel);
      if (match) return match;
    }

    // 3) Authoritative fallback — the shared jacket-map (the same resolver
    //    behind /api/songs/jacket-map), built from pump-phoenix.json + full
    //    alias expansion. It resolves every title-variant dimension the
    //    songs-table SQL can't (locale, feat./parens, cut suffixes, casing,
    //    whitespace) and covers songs the catalog table is simply missing.
    //    This is the single source of truth, so the feed shows exactly what
    //    the catalog page would. The map yields a jacket only — recover the
    //    chart_id from the songs table by that jacket so deep-links still work.
    const mapJacket = resolveJacketUrl(normalizedTitle, normalizedMode, numericLevel);
    if (mapJacket) {
      const byJacket = getSongChartByJacketStmt(db).get(mapJacket, normalizedMode, numericLevel);
      return { chart_id: byJacket ? byJacket.chart_id : 0, jacket_url: mapJacket };
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

  // Prefer the songs-table jacket (Shinsa-hosted, e.g. /jackets/pump/123.jpg).
  // We deliberately do NOT fall back to entry.background_url (the piugame
  // CDN URL) — every chart we know about has a local jacket, and a
  // missing entry here means the songs catalog is stale and should be
  // backfilled rather than papered over with an external image. The UI
  // renders a "?" placeholder when jacket_url is empty.
  const metadataJacketUrl = String(metadata?.jacket_url || '').trim();
  const resolvedJacketUrl = metadataJacketUrl || existingJacketUrl;
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
    return attachHeartRateById(db, mergeReplayMetadata(enriched, lookup), userId);
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
    return attachHeartRateById(db, applyChartMetadata(db, mergeReplayMetadata(enriched, lookup)), userId);
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

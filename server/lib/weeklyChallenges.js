// Weekly Challenges — core business logic
// Manages weekly challenge generation, result aggregation, and award finalization.

const path = require('path');
const crypto = require('crypto');
const { normalizeGrade, gradeFromScore, GRADE_MULTIPLIER, TITLE_REQUIREMENTS } = require('./titleProgress');
const {
  calculateWeeklyChallengeRatingPoints,
  getWeeklyChallengeRatingBreakdown,
  getPersistedWeeklyChallengeRatingBreakdown,
} = require('./weeklyChallengePoints');
const { isPassRecord } = require('./pumbilityCandidates');
const { makeChartKey, toCanonicalTitle, normalizeMode } = require('./chartKeys');
const { buildWeeklyChallengeSummary, buildPersonalSummaries } = require('./weeklyChallengeSummary');
const { serializeWcSummaryMarker } = require('./weeklyChallengeSummaryMarker');
const { serializeWcPersonalMarker } = require('./weeklyChallengePersonalMarker');
const { normalizeUserAvatarForList } = require('./avatarProxy');
const { SYSTEM_USER_ID } = require('../db/schema');

// Build a lookup from skill_title → skill_family
const _titleToFamily = {};
for (const t of TITLE_REQUIREMENTS) {
  _titleToFamily[t.skill_title.toLowerCase()] = t.skill_family;
  _titleToFamily[t.name.toLowerCase()] = t.skill_family;
}

function deriveSkillFamily(skillTitle) {
  const key = String(skillTitle || '').toLowerCase().trim();
  return _titleToFamily[key] || '';
}

const SONG_ALIAS_PATH = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');
let _aliases = null;
function getAliases() {
  if (!_aliases) {
    try {
      const payload = require(SONG_ALIAS_PATH);
      const rawAliases = (payload && typeof payload.aliases === 'object' && payload.aliases) || {};
      const normalized = {};
      for (const [alias, canonical] of Object.entries(rawAliases)) {
        const aliasNorm = toCanonicalTitle(alias, {});
        const canonicalNorm = toCanonicalTitle(canonical, {});
        if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
        if (!normalized[aliasNorm]) normalized[aliasNorm] = canonicalNorm;
      }
      _aliases = normalized;
    } catch {
      _aliases = {};
    }
  }
  return _aliases;
}

// Grade ordering for tie-breaking (higher index = better)
const GRADE_ORDER = Object.keys(GRADE_MULTIPLIER);

function resolvedGradeIndex(grade) {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx >= 0 ? idx : -1;
}

function resolveGrade(rawGrade, score) {
  return normalizeGrade(rawGrade) || gradeFromScore(parseInt(score, 10) || 0);
}

// ---------------------------------------------------------------------------
// Week boundary helpers (Europe/London)
// ---------------------------------------------------------------------------

function getLondonDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    day: parseInt(values.day, 10),
    month: parseInt(values.month, 10),
    year: parseInt(values.year, 10),
  };
}

function normalizeUtcDateParts(y, m, d) {
  const normalized = new Date(Date.UTC(y, m - 1, d));
  return {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate(),
  };
}

function getWeekBoundary(now) {
  // Compute Monday 00:00 to Sunday 23:59:59.999 in Europe/London
  const { day, month, year } = getLondonDateParts(now);
  const londonCalendarDate = new Date(Date.UTC(year, month - 1, day));
  const dow = londonCalendarDate.getUTCDay(); // 0=Sun, 1=Mon...
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = normalizeUtcDateParts(year, month, day + diffToMonday);
  const sunday = normalizeUtcDateParts(monday.year, monday.month, monday.day + 6);

  const startsAt = computeUtcFromLondon(monday.year, monday.month, monday.day, 0, 0, 0);
  const endsAt = computeUtcFromLondon(sunday.year, sunday.month, sunday.day, 23, 59, 59);

  // ISO week key must follow the London calendar date, not the UTC instant.
  const weekKey = computeIsoWeekKey(new Date(Date.UTC(monday.year, monday.month - 1, monday.day)));

  return { weekKey, startsAtUtc: startsAt.toISOString(), endsAtUtc: endsAt.toISOString() };
}

function computeUtcFromLondon(y, m, d, h, min, s) {
  // Create a date string in London time and let the runtime figure out UTC offset
  // We use a trick: construct the date as if UTC, then adjust
  const pad = (n) => String(n).padStart(2, '0');
  // Normalize overflowed days
  const temp = new Date(Date.UTC(y, m - 1, d, h, min, s));
  const normalY = temp.getUTCFullYear();
  const normalM = temp.getUTCMonth() + 1;
  const normalD = temp.getUTCDate();

  // Now figure out the UTC offset for London at this date
  // London is UTC+0 in winter, UTC+1 in summer (BST)
  const testDate = new Date(`${normalY}-${pad(normalM)}-${pad(normalD)}T${pad(h)}:${pad(min)}:${pad(s)}`);
  const londonStr = testDate.toLocaleString('en-US', { timeZone: 'Europe/London' });
  const utcStr = testDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const londonMs = new Date(londonStr).getTime();
  const utcMs = new Date(utcStr).getTime();
  const offsetMs = londonMs - utcMs; // positive when London is ahead

  // The actual UTC instant for this London wall-clock time
  return new Date(temp.getTime() - offsetMs);
}

function computeIsoWeekKey(date) {
  // ISO 8601 week: week starts Monday, W01 contains Jan 4
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1...Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Global max level
// ---------------------------------------------------------------------------

function getGlobalChallengeMaxLevel(db) {
  const rows = db.prepare(`
    SELECT level, score, grade FROM user_best_scores
    WHERE score > 0 AND mode IN ('Single','Double')
    UNION ALL
    SELECT level, score, grade FROM user_recently_played
    WHERE score > 0 AND mode IN ('Single','Double')
  `).all();

  let highest = 0;
  for (const row of rows) {
    if (isPassRecord(row) && row.level > highest) {
      highest = row.level;
    }
  }
  return Math.max(10, highest || 10);
}

// ---------------------------------------------------------------------------
// Chart selection
// ---------------------------------------------------------------------------

function hashSeed(weekKey, mode, level) {
  return crypto.createHash('sha256')
    .update(`${weekKey}|${mode}|${level}`)
    .digest();
}

function selectWeeklyCharts(db, weekRow) {
  const weekId = weekRow.id;
  const weekKey = weekRow.week_key;

  // Get all scoreable Single/Double charts
  const allCharts = db.prepare(`
    SELECT id, title, artist, jacket_url, mode, level
    FROM songs
    WHERE mode IN ('Single', 'Double')
    ORDER BY mode, level, title
  `).all();

  // Group by (mode, level)
  const byModeLevel = {};
  for (const chart of allCharts) {
    const key = `${chart.mode}|${chart.level}`;
    if (!byModeLevel[key]) byModeLevel[key] = [];
    byModeLevel[key].push(chart);
  }

  // Get chart IDs used in previous 4 weeks to avoid repeats
  const recentWeeks = db.prepare(`
    SELECT wc.chart_id, wc.mode, wc.level
    FROM weekly_challenge_charts wc
    JOIN weekly_challenge_weeks w ON wc.week_id = w.id
    WHERE w.week_key != ? AND w.id >= (SELECT COALESCE(MAX(id) - 4, 0) FROM weekly_challenge_weeks)
  `).all(weekKey);
  const recentByModeLevel = {};
  for (const r of recentWeeks) {
    const k = `${r.mode}|${r.level}`;
    if (!recentByModeLevel[k]) recentByModeLevel[k] = new Set();
    recentByModeLevel[k].add(r.chart_id);
  }

  // Find mode-specific max levels that exist in the catalog
  const maxLevel = weekRow.challenge_max_level;
  const insertStmt = db.prepare(`
    INSERT INTO weekly_challenge_charts
      (week_id, chart_id, mode, level, sort_order, song_title_snapshot, artist_snapshot, jacket_url_snapshot, division)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let sortOrder = 0;
  let chartCount = 0;

  for (let level = 10; level <= maxLevel; level++) {
    for (const mode of ['Single', 'Double']) {
      const key = `${mode}|${level}`;
      const candidates = byModeLevel[key];
      if (!candidates || candidates.length === 0) continue;

      // Filter out recent repeats if alternatives exist
      const recent = recentByModeLevel[key] || new Set();
      let pool = candidates.filter(c => !recent.has(c.id));
      if (pool.length === 0) pool = candidates; // all were recent, allow repeats

      // Deterministic pick using hash
      const seed = hashSeed(weekKey, mode, level);
      const idx = seed.readUInt32BE(0) % pool.length;
      const picked = pool[idx];

      insertStmt.run(
        weekId, picked.id, mode, level, sortOrder++,
        picked.title, picked.artist, picked.jacket_url || '', 'main'
      );
      chartCount++;
    }
  }

  db.prepare('UPDATE weekly_challenge_weeks SET chart_count = ? WHERE id = ?').run(chartCount, weekId);

  // Co-op WC division — its own pick stream. Scoped to 2-player charts for
  // now (per design decision); 3P/4P/5P deferred. Runs as a separate phase
  // so it can be back-filled into an existing week independently of the
  // main S/D picks (see `ensureCoopWeeklyChartsForWeek` below).
  selectCoopWeeklyCharts(db, weekRow);

  return chartCount;
}

/** Number of Co-op WC picks per week. Higher than the per-level S/D count
 *  because Co-op is its own division — a smaller pool would feel barren. */
const COOP_WEEKLY_CHART_COUNT = 5;

/**
 * Pick the Co-op WC charts for a given week. Idempotent — if any
 * `division='coop'` rows already exist for the week, the function bails
 * without re-picking (so re-running on the same week doesn't churn).
 * Returns the number of Co-op picks inserted (0 if the week was already
 * populated, or if the catalog has no 2P Co-op charts).
 */
function selectCoopWeeklyCharts(db, weekRow) {
  const weekId = weekRow.id;
  const weekKey = weekRow.week_key;

  const existingCount = db.prepare(
    "SELECT COUNT(*) AS c FROM weekly_challenge_charts WHERE week_id = ? AND division = 'coop'"
  ).get(weekId)?.c || 0;
  if (existingCount > 0) return 0;

  // Pool: 2-player Co-op charts. In our schema, CoOp `level` encodes the
  // player count (C2 → level 2, C3 → level 3, …). The user's design
  // decision is to ship 2P only for v1.
  const candidates = db.prepare(`
    SELECT id, title, artist, jacket_url, mode, level
    FROM songs
    WHERE mode = 'CoOp' AND level = 2
    ORDER BY title
  `).all();
  if (candidates.length === 0) return 0;

  // Anti-repeat: previous 4 weeks' Co-op picks. If filtering would empty
  // the pool, allow repeats — better to recycle than ship an empty week.
  const recent = new Set(
    db.prepare(`
      SELECT wc.chart_id
      FROM weekly_challenge_charts wc
      JOIN weekly_challenge_weeks w ON wc.week_id = w.id
      WHERE wc.division = 'coop'
        AND w.week_key != ?
        AND w.id >= (SELECT COALESCE(MAX(id) - 4, 0) FROM weekly_challenge_weeks)
    `).all(weekKey).map(r => r.chart_id),
  );
  let pool = candidates.filter(c => !recent.has(c.id));
  if (pool.length === 0) pool = candidates;

  // Deterministic shuffle of the pool, then take the top N. Same week +
  // same pool yields the same picks, so re-running the function is safe.
  const seeded = pool
    .map((c, i) => ({
      chart: c,
      // Different hash input per chart-index so we get distinct keys for
      // sorting (otherwise every chart would tie on the same week-level
      // seed and the sort would be stable but boring).
      key: hashSeed(weekKey, 'CoOp', 2 + i).readUInt32BE(0),
    }))
    .sort((a, b) => a.key - b.key)
    .map(e => e.chart);

  const count = Math.min(COOP_WEEKLY_CHART_COUNT, seeded.length);
  const picks = seeded.slice(0, count);

  const insertStmt = db.prepare(`
    INSERT INTO weekly_challenge_charts
      (week_id, chart_id, mode, level, sort_order, song_title_snapshot, artist_snapshot, jacket_url_snapshot, division)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'coop')
  `);
  // Sort order continues after the main picks so the Co-op division renders
  // below S/D when both are listed together. Each pick gets sequential
  // order within the Co-op division.
  const maxSortOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM weekly_challenge_charts WHERE week_id = ?'
  ).get(weekId)?.m || -1;
  let sortOrder = maxSortOrder + 1;
  for (const picked of picks) {
    insertStmt.run(
      weekId, picked.id, picked.mode, picked.level, sortOrder++,
      picked.title, picked.artist, picked.jacket_url || '',
    );
  }
  return picks.length;
}

/**
 * Backfill Co-op picks for an existing week if it's missing them. Safe to
 * call on every server start — `selectCoopWeeklyCharts` is idempotent and
 * returns 0 immediately when the week already has Co-op picks.
 */
function ensureCoopWeeklyChartsForWeek(db, weekRow) {
  if (!weekRow) return 0;
  return selectCoopWeeklyCharts(db, weekRow);
}

// ---------------------------------------------------------------------------
// Ensure current week exists
// ---------------------------------------------------------------------------

function ensureCurrentWeeklyChallengeWeek(db, now = new Date()) {
  const { weekKey, startsAtUtc, endsAtUtc } = getWeekBoundary(now);

  // Fast path: week already exists
  let week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
  if (week) {
    // Repair: publish summaries for any finalized weeks that failed during rollover
    repairMissingSummaryPosts(db);
    // Back-fill the Co-op WC division for weeks that were generated before
    // Co-op support existed. Idempotent — no-op if Co-op picks are already
    // populated. This ensures the current week gets its Co-op picks on the
    // first request after the server boots with the feature enabled.
    try {
      ensureCoopWeeklyChartsForWeek(db, week);
    } catch (err) {
      console.error('[WC Co-op] back-fill failed:', err.message);
    }
    return week;
  }

  // Atomic rollover: finalize + create + publish in one IMMEDIATE transaction.
  // .immediate() uses BEGIN IMMEDIATE to acquire the write lock up front.
  // The re-check inside the transaction handles the in-process race where two
  // async request handlers both pass the fast-path check.
  const rollover = db.transaction(() => {
    // Re-check inside transaction (another request may have won the race)
    let w = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
    if (w) return w;

    // Phase 1: Finalize previous active weeks
    const activeWeeks = db.prepare(
      "SELECT * FROM weekly_challenge_weeks WHERE status = 'active' AND week_key != ?"
    ).all(weekKey);
    for (const aw of activeWeeks) {
      finalizeWeek(db, aw.id);
    }

    // Phase 2: Create the new week
    const maxLevel = getGlobalChallengeMaxLevel(db);
    const result = db.prepare(`
      INSERT INTO weekly_challenge_weeks (week_key, starts_at_utc, ends_at_utc, challenge_max_level)
      VALUES (?, ?, ?, ?)
    `).run(weekKey, startsAtUtc, endsAtUtc, maxLevel);
    w = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(result.lastInsertRowid);
    selectWeeklyCharts(db, w);
    w = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(w.id);

    // Phase 3: Publish summaries (new week now exists as target)
    for (const aw of activeWeeks) {
      try {
        publishWeeklyChallengeSummary(db, aw.id, w.id);
      } catch (err) {
        console.error(`[WC Summary] Publish failed for week ${aw.id}:`, err);
      }
      try {
        publishWeeklyChallengePersonalSummaries(db, aw.id, w.id);
      } catch (err) {
        console.error(`[WC Personal] Publish failed for week ${aw.id}:`, err);
      }
    }

    return w;
  });

  return rollover.immediate();
}

// ---------------------------------------------------------------------------
// Result aggregation (active week — live from user_recently_played)
// ---------------------------------------------------------------------------

/**
 * Aggregate live results for a weekly challenge week.
 *
 * @param {object} db
 * @param {number} weekId
 * @param {'main' | 'coop'} division  Which division to aggregate. 'main'
 *   (default) covers the Singles + Doubles picks and is what every
 *   pre-existing caller already wants. 'coop' covers the Co-op WC division
 *   — only Co-op charts are loaded, and only Co-op plays are scanned, so
 *   the leaderboard for each division is fully isolated.
 */
function aggregateWeeklyResults(db, weekId, division = 'main') {
  const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(weekId);
  if (!week) return null;

  const aliases = getAliases();
  const isCoop = division === 'coop';
  // Mode allowlist that controls both the weekly-chart filter and the
  // recently-played play scan. Kept in sync so we can't accidentally try to
  // match Co-op plays against a Singles chart (or vice versa).
  const playModeFilter = isCoop ? ['CoOp'] : ['Single', 'Double'];

  // Load persisted weekly charts for this division
  const weeklyCharts = db.prepare(
    'SELECT * FROM weekly_challenge_charts WHERE week_id = ? AND division = ? ORDER BY sort_order'
  ).all(weekId, division);

  // Build chart key lookup: chartKey -> weeklyChart
  const chartKeyLookup = {};
  for (const wc of weeklyCharts) {
    const ck = makeChartKey(wc.song_title_snapshot, wc.mode, wc.level, aliases);
    if (ck) chartKeyLookup[ck] = wc;
  }

  // Also build by (title, mode, level) for direct match
  const directLookup = {};
  for (const wc of weeklyCharts) {
    directLookup[`${wc.song_title_snapshot}|${wc.mode}|${wc.level}`] = wc;
  }

  // Fetch all plays in the week window scoped to this division's modes.
  // (Inlined IN-list because `prepare` doesn't expand array placeholders.)
  const modePlaceholders = playModeFilter.map(() => '?').join(',');
  const plays = db.prepare(`
    SELECT rp.*, u.username, u.nationality, u.skill_title, u.skill_level
    FROM user_recently_played rp
    JOIN users u ON rp.user_id = u.id
    WHERE COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) >= ?
      AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) <= ?
      AND rp.score > 0
      AND rp.mode IN (${modePlaceholders})
  `).all(week.starts_at_utc, week.ends_at_utc, ...playModeFilter);

  // Match plays to weekly charts
  // userChartBests: Map<`${userId}|${weeklyChartId}`, { play, weeklyChart }>
  const userChartBests = new Map();
  const userProfiles = new Map(); // userId -> user profile data

  // Cache for resolving localized song titles via background_url
  const bgTitleCache = {};
  let bgResolveStmt = null;

  for (const play of plays) {
    // Try alias-aware chart key match first
    const ck = makeChartKey(play.song_title, play.mode, play.level, aliases);
    let wc = ck ? chartKeyLookup[ck] : null;

    // Fallback: direct title match
    if (!wc) {
      wc = directLookup[`${play.song_title}|${play.mode}|${play.level}`];
    }

    // Fallback: resolve localized title via background_url
    if (!wc && play.background_url) {
      const bgMatch = play.background_url.match(/song_img\/([a-f0-9]+)\./);
      if (bgMatch) {
        const bgKey = `${bgMatch[1]}|${play.mode}|${play.level}`;
        if (!(bgKey in bgTitleCache)) {
          if (!bgResolveStmt) {
            bgResolveStmt = db.prepare(`
              SELECT DISTINCT song_title FROM user_recently_played
              WHERE background_url = ? AND mode = ? AND level = ?
                AND song_title GLOB '[A-Za-z0-9]*'
              LIMIT 1
            `);
          }
          const row = bgResolveStmt.get(play.background_url, play.mode, play.level);
          bgTitleCache[bgKey] = row ? row.song_title : null;
        }
        const canonicalTitle = bgTitleCache[bgKey];
        if (canonicalTitle) {
          const fallbackCk = makeChartKey(canonicalTitle, play.mode, play.level, aliases);
          wc = fallbackCk ? chartKeyLookup[fallbackCk] : null;
          if (!wc) wc = directLookup[`${canonicalTitle}|${play.mode}|${play.level}`];
        }
      }
    }

    if (!wc) continue; // not a weekly challenge chart

    const resolved = resolveGrade(play.grade, play.score);
    if (resolved === 'F') continue; // not a pass

    const key = `${play.user_id}|${wc.id}`;
    const existing = userChartBests.get(key);

    if (!existing || isBetterPlay(play, resolved, existing.play, existing.resolvedGrade)) {
      // Pass `wc.mode` so Co-op plays use COOP_BASE_POINTS instead of the
      // main level table — without this every Co-op play scored 0 points.
      const ratingBreakdown = getWeeklyChallengeRatingBreakdown(
        wc.level, play.grade, play.score, play.plate, resolved, wc.mode,
      );
      userChartBests.set(key, {
        play,
        weeklyChart: wc,
        resolvedGrade: resolved,
        ratingPoints: ratingBreakdown.ratingPoints,
        baseRatingPoints: ratingBreakdown.baseRatingPoints,
        pgBonusPoints: ratingBreakdown.pgBonusPoints,
        pgBonusPercent: ratingBreakdown.pgBonusPercent,
        hasPgBonus: ratingBreakdown.hasPgBonus,
      });
    }

    // Track user profiles for snapshot
    if (!userProfiles.has(play.user_id)) {
      userProfiles.set(play.user_id, {
        user_id: play.user_id,
        username: play.username,
        avatar: '',
        nationality: play.nationality,
        skill_title: play.skill_title,
        skill_level: play.skill_level,
        skill_family: deriveSkillFamily(play.skill_title),
      });
    }
  }

  const userIdsNeedingProfiles = Array.from(userProfiles.keys());
  if (userIdsNeedingProfiles.length > 0) {
    const placeholders = userIdsNeedingProfiles.map(() => '?').join(', ');
    const userRows = db.prepare(`
      SELECT id, avatar, username, nationality, skill_title, skill_level
      FROM users
      WHERE id IN (${placeholders})
    `).all(...userIdsNeedingProfiles);

    for (const row of userRows) {
      const existing = userProfiles.get(row.id);
      if (!existing) continue;
      existing.avatar = row.avatar || '';
      existing.username = row.username || existing.username;
      existing.nationality = row.nationality || existing.nationality;
      existing.skill_title = row.skill_title || existing.skill_title;
      existing.skill_level = row.skill_level ?? existing.skill_level;
      existing.skill_family = deriveSkillFamily(existing.skill_title);
    }
  }

  // Upsert user snapshots
  const upsertSnapshot = db.prepare(`
    INSERT INTO weekly_challenge_user_snapshots
      (week_id, user_id, username_snapshot, avatar_snapshot, nationality_snapshot,
       skill_title_snapshot, skill_level_snapshot, skill_family_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(week_id, user_id) DO UPDATE SET
      username_snapshot = excluded.username_snapshot,
      avatar_snapshot = excluded.avatar_snapshot,
      nationality_snapshot = excluded.nationality_snapshot,
      skill_title_snapshot = excluded.skill_title_snapshot,
      skill_level_snapshot = excluded.skill_level_snapshot,
      skill_family_snapshot = excluded.skill_family_snapshot,
      last_seen_at = datetime('now')
  `);

  const snapshots = {};
  for (const [, profile] of userProfiles) {
    const avatarSnapshot = normalizeUserAvatarForList(profile.avatar, profile.user_id, 64);
    snapshots[profile.user_id] = {
      user_id: profile.user_id,
      username_snapshot: profile.username || '',
      avatar_snapshot: avatarSnapshot,
      nationality_snapshot: profile.nationality || '',
      skill_title_snapshot: profile.skill_title || '',
      skill_level_snapshot: profile.skill_level || 1,
      skill_family_snapshot: profile.skill_family || '',
    };
    upsertSnapshot.run(
      weekId, profile.user_id,
      profile.username || '', avatarSnapshot, profile.nationality || '',
      profile.skill_title || '', profile.skill_level || 1, profile.skill_family || ''
    );
  }

  // Build chart results: Top 3 per chart
  const chartResults = {};
  for (const wc of weeklyCharts) {
    chartResults[wc.id] = {
      chart: wc,
      top3: [],
      participantCount: 0,
      clearCount: 0,
    };
  }

  // Group bests by chart
  const chartBests = {}; // weeklyChartId -> [{ userId, play, resolvedGrade, ratingPoints }]
  for (const [key, entry] of userChartBests) {
    const chartId = entry.weeklyChart.id;
    if (!chartBests[chartId]) chartBests[chartId] = [];
    chartBests[chartId].push({
      userId: entry.play.user_id,
      play: entry.play,
      resolvedGrade: entry.resolvedGrade,
      ratingPoints: entry.ratingPoints,
      baseRatingPoints: entry.baseRatingPoints,
      pgBonusPoints: entry.pgBonusPoints,
      pgBonusPercent: entry.pgBonusPercent,
      hasPgBonus: entry.hasPgBonus,
    });
  }

  for (const [chartId, entries] of Object.entries(chartBests)) {
    // Sort: score DESC, resolved grade DESC, played_at ASC
    entries.sort((a, b) => {
      if (b.play.score !== a.play.score) return b.play.score - a.play.score;
      const gradeA = resolvedGradeIndex(a.resolvedGrade);
      const gradeB = resolvedGradeIndex(b.resolvedGrade);
      if (gradeB !== gradeA) return gradeB - gradeA;
      const timeA = a.play.played_at_utc || a.play.date_played || '';
      const timeB = b.play.played_at_utc || b.play.date_played || '';
      return timeA.localeCompare(timeB);
    });

    if (chartResults[chartId]) {
      chartResults[chartId].top3 = entries.slice(0, 3).map((e, i) => {
        const snap = snapshots[e.userId] || {};
        return {
        rank: i + 1,
        user_id: e.userId,
        username: snap.username_snapshot || e.play.username,
        avatar: snap.avatar_snapshot || normalizeUserAvatarForList(e.play.avatar, e.userId, 64),
        nationality: snap.nationality_snapshot || e.play.nationality,
        score: e.play.score,
        grade: e.resolvedGrade,
        rating_points: e.ratingPoints,
        base_rating_points: e.baseRatingPoints || e.ratingPoints,
        pg_bonus_points: e.pgBonusPoints || 0,
        pg_bonus_percent: e.pgBonusPercent || 0,
        has_pg_bonus: !!e.hasPgBonus,
        plate: e.play.plate || '',
        };
      });
      chartResults[chartId].participantCount = entries.length;
      chartResults[chartId].clearCount = entries.length;
    }
  }

  // Build leaderboard data (raw — caller applies filters)
  const userTotals = {}; // userId -> { both, single, double }
  for (const [, entry] of userChartBests) {
    const uid = entry.play.user_id;
    if (!userTotals[uid]) {
      userTotals[uid] = {
        userId: uid,
        profile: userProfiles.get(uid),
        both: { points: 0, clears: 0, totalScore: 0, bestAt: '' },
        single: { points: 0, clears: 0, totalScore: 0, bestAt: '' },
        double: { points: 0, clears: 0, totalScore: 0, bestAt: '' },
      };
      for (const scope of ['both', 'single', 'double']) {
        userTotals[uid][scope].pgBonusPoints = 0;
        userTotals[uid][scope].pgBonusCount = 0;
      }
    }
    const t = userTotals[uid];
    const mode = entry.weeklyChart.mode === 'Single' ? 'single' : 'double';
    const playedAt = entry.play.played_at_utc || entry.play.date_played || '';

    for (const scope of ['both', mode]) {
      t[scope].points += entry.ratingPoints;
      t[scope].pgBonusPoints += entry.pgBonusPoints || 0;
      if (entry.hasPgBonus) t[scope].pgBonusCount += 1;
      t[scope].clears += 1;
      t[scope].totalScore += entry.play.score;
      if (!t[scope].bestAt || playedAt < t[scope].bestAt) {
        t[scope].bestAt = playedAt;
      }
    }
  }

  return {
    week,
    weeklyCharts,
    chartResults,
    snapshots,
    userTotals,
    userChartBests,
    participantCount: userProfiles.size,
  };
}

function isBetterPlay(newPlay, newGrade, oldPlay, oldGrade) {
  if (newPlay.score !== oldPlay.score) return newPlay.score > oldPlay.score;
  const newIdx = resolvedGradeIndex(newGrade);
  const oldIdx = resolvedGradeIndex(oldGrade);
  if (newIdx !== oldIdx) return newIdx > oldIdx;
  const newTime = newPlay.played_at_utc || newPlay.date_played || '';
  const oldTime = oldPlay.played_at_utc || oldPlay.date_played || '';
  return newTime < oldTime; // earlier is better
}

// ---------------------------------------------------------------------------
// Leaderboard building (with filters)
// ---------------------------------------------------------------------------

function buildLeaderboard(userTotals, scopeMode = 'both', skillFamily = 'all', snapshots = null) {
  const entries = [];
  for (const [userId, totals] of Object.entries(userTotals)) {
    const scope = totals[scopeMode] || totals.both;
    if (!scope || scope.clears === 0) continue;
    const snap = snapshots?.[userId] || null;

    // Family filter
    if (skillFamily !== 'all' && snapshots) {
      const family = (snap?.skill_family_snapshot || totals.profile?.skill_family || '').toLowerCase();
      if (skillFamily === 'expert') {
        if (family !== 'expert' && family !== 'master') continue;
      } else if (family !== skillFamily) {
        continue;
      }
    }

    entries.push({
      user_id: userId,
      username: snap?.username_snapshot || totals.profile?.username || '',
      avatar: snap?.avatar_snapshot || normalizeUserAvatarForList(totals.profile?.avatar, userId, 64),
      nationality: snap?.nationality_snapshot || totals.profile?.nationality || '',
      skill_title: snap?.skill_title_snapshot || totals.profile?.skill_title || '',
      skill_family: totals.profile?.skill_family || '',
      points: scope.points,
      pg_bonus_points: scope.pgBonusPoints || 0,
      pg_bonus_count: scope.pgBonusCount || 0,
      clears: scope.clears,
      total_score: scope.totalScore,
      best_result_achieved_at: scope.bestAt,
    });
  }

  // Sort with tie-breakers
  entries.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.clears !== a.clears) return b.clears - a.clears;
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (a.best_result_achieved_at !== b.best_result_achieved_at) {
      return (a.best_result_achieved_at || '').localeCompare(b.best_result_achieved_at || '');
    }
    return (a.username || '').localeCompare(b.username || '');
  });

  // Assign ranks
  entries.forEach((e, i) => { e.rank = i + 1; });
  return entries;
}

// ---------------------------------------------------------------------------
// Week finalization
// ---------------------------------------------------------------------------

/**
 * Per-division finalize: freezes results, leaderboard, and awards for a
 * single division. Called once for 'main' (Singles + Doubles) and once
 * for 'coop' so each division persists its own snapshot.
 */
function finalizeWeekDivision(db, weekId, division, snapshots) {
  const agg = aggregateWeeklyResults(db, weekId, division);
  if (!agg) return;

  // Skip the freeze if this division had nothing happening this week.
  // Avoids writing zero leaderboard rows that would later confuse the
  // frozen readers into thinking there was participation.
  if (agg.userChartBests.size === 0 && Object.keys(agg.userTotals).length === 0) {
    return;
  }

  // Persist frozen per-chart results (chart already carries its division).
  const insertResult = db.prepare(`
    INSERT OR REPLACE INTO weekly_challenge_results
      (weekly_chart_id, user_id, score, raw_grade, resolved_grade, plate,
       perfect, great, good, bad, miss, max_combo, rating_points, played_at, source_play_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [, entry] of agg.userChartBests) {
    const p = entry.play;
    insertResult.run(
      entry.weeklyChart.id, p.user_id, p.score,
      p.grade || '', entry.resolvedGrade, p.plate || '',
      p.perfect || 0, p.great || 0, p.good || 0, p.bad || 0, p.miss || 0,
      p.max_combo || 0, entry.ratingPoints,
      p.played_at_utc || p.date_played || '',
      p.id || null,
    );
  }

  // Scope modes vary by division: main has the per-mode S/D split, but
  // Co-op only has one scope (every chart is CoOp, so the split is moot).
  const scopes = division === 'coop' ? ['both'] : ['both', 'single', 'double'];
  const insertLeaderboard = db.prepare(`
    INSERT OR REPLACE INTO weekly_challenge_leaderboard
      (week_id, user_id, scope_mode, division, points, clears,
       total_score, best_result_achieved_at, rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const scope of scopes) {
    const lb = buildLeaderboard(agg.userTotals, scope, 'all', snapshots);
    for (const entry of lb) {
      insertLeaderboard.run(
        weekId, entry.user_id, scope, division,
        entry.points, entry.clears, entry.total_score,
        entry.best_result_achieved_at, entry.rank,
      );
    }
  }

  // Award podiums. Main division ships its 5 categories; Co-op ships a
  // single 'coop' podium since there's no S/D or skill family split.
  const awardConfigs = division === 'coop'
    ? [{ key: 'coop', label: 'Weekly Co-Op', scopeMode: 'both', skillFamily: 'all' }]
    : [
        { key: 'overall', label: 'Weekly Overall', scopeMode: 'both', skillFamily: 'all' },
        { key: 'singles', label: 'Weekly Singles', scopeMode: 'single', skillFamily: 'all' },
        { key: 'doubles', label: 'Weekly Doubles', scopeMode: 'double', skillFamily: 'all' },
        { key: 'advanced', label: 'Weekly Advanced', scopeMode: 'both', skillFamily: 'advanced' },
        { key: 'intermediate', label: 'Weekly Intermediate', scopeMode: 'both', skillFamily: 'intermediate' },
      ];
  const insertAward = db.prepare(`
    INSERT OR REPLACE INTO weekly_challenge_awards
      (week_id, award_key, award_label, scope_mode, skill_family, division,
       user_id, rank, points, clears, total_score, best_result_achieved_at,
       username_snapshot, avatar_snapshot, nationality_snapshot, skill_title_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const cfg of awardConfigs) {
    const lb = buildLeaderboard(agg.userTotals, cfg.scopeMode, cfg.skillFamily, snapshots);
    const podium = lb.slice(0, 3);
    for (const entry of podium) {
      const snap = snapshots[entry.user_id] || {};
      insertAward.run(
        weekId, cfg.key, cfg.label, cfg.scopeMode, cfg.skillFamily, division,
        entry.user_id, entry.rank, entry.points, entry.clears, entry.total_score,
        entry.best_result_achieved_at,
        snap.username_snapshot || entry.username,
        snap.avatar_snapshot || entry.avatar,
        snap.nationality_snapshot || entry.nationality,
        snap.skill_title_snapshot || entry.skill_title,
      );
    }
  }
}

function finalizeWeek(db, weekId) {
  const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(weekId);
  if (!week || week.status === 'finalized') return;

  // Snapshots are shared across divisions — load once.
  const snapshotRows = db.prepare(
    'SELECT * FROM weekly_challenge_user_snapshots WHERE week_id = ?'
  ).all(weekId);
  const snapshots = {};
  for (const s of snapshotRows) snapshots[s.user_id] = s;

  finalizeWeekDivision(db, weekId, 'main', snapshots);
  finalizeWeekDivision(db, weekId, 'coop', snapshots);

  db.prepare("UPDATE weekly_challenge_weeks SET status = 'finalized', closed_at = datetime('now') WHERE id = ?")
    .run(weekId);
}

// ---------------------------------------------------------------------------
// Frozen data readers (for finalized weeks)
// ---------------------------------------------------------------------------

function toRatingBonusApiFields(breakdown) {
  return {
    base_rating_points: breakdown.baseRatingPoints || breakdown.ratingPoints || 0,
    pg_bonus_points: breakdown.pgBonusPoints || 0,
    pg_bonus_percent: breakdown.pgBonusPercent || 0,
    has_pg_bonus: !!breakdown.hasPgBonus,
  };
}

function getFrozenBonusTotalsByUser(db, weekId, scopeMode = 'both', division = 'main') {
  const rows = db.prepare(`
    SELECT r.user_id, r.score, r.resolved_grade, r.plate, r.rating_points,
           wc.mode, wc.level
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ? AND wc.division = ?
  `).all(weekId, division);

  const totals = {};
  for (const row of rows) {
    if (scopeMode === 'single' && row.mode !== 'Single') continue;
    if (scopeMode === 'double' && row.mode !== 'Double') continue;

    const breakdown = getPersistedWeeklyChallengeRatingBreakdown(
      row.level,
      row.resolved_grade,
      row.score,
      row.plate,
      row.rating_points,
      row.resolved_grade,
      row.mode,
    );
    if (!breakdown.hasPgBonus) continue;
    if (!totals[row.user_id]) totals[row.user_id] = { pg_bonus_points: 0, pg_bonus_count: 0 };
    totals[row.user_id].pg_bonus_points += breakdown.pgBonusPoints;
    totals[row.user_id].pg_bonus_count += 1;
  }
  return totals;
}

function enrichFrozenWeeklyChallengeAwards(db, weekId, awards = []) {
  // Key the bonus cache by (division, scope) since main and Co-op
  // bonuses are computed off different chart pools.
  const byKey = {};
  return (Array.isArray(awards) ? awards : []).map((award) => {
    const scope = award.scope_mode || 'both';
    const division = award.division || 'main';
    const key = `${division}|${scope}`;
    if (!byKey[key]) byKey[key] = getFrozenBonusTotalsByUser(db, weekId, scope, division);
    const bonus = byKey[key]?.[award.user_id] || {};
    return {
      ...award,
      pg_bonus_points: bonus.pg_bonus_points || 0,
      pg_bonus_count: bonus.pg_bonus_count || 0,
    };
  });
}

function getFrozenChartResults(db, weekId, division = 'main') {
  const charts = db.prepare(
    'SELECT * FROM weekly_challenge_charts WHERE week_id = ? AND division = ? ORDER BY sort_order'
  ).all(weekId, division);

  const results = {};
  for (const chart of charts) {
    const top3 = db.prepare(`
      SELECT r.*, s.username_snapshot, s.avatar_snapshot, s.nationality_snapshot
      FROM weekly_challenge_results r
      JOIN weekly_challenge_user_snapshots s ON s.week_id = ? AND s.user_id = r.user_id
      WHERE r.weekly_chart_id = ?
      ORDER BY r.score DESC, r.rating_points DESC, r.played_at ASC
      LIMIT 3
    `).all(weekId, chart.id);

    const participantCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM weekly_challenge_results WHERE weekly_chart_id = ?'
    ).get(chart.id)?.cnt || 0;

    results[chart.id] = {
      chart,
      top3: top3.map((r, i) => {
        const breakdown = getPersistedWeeklyChallengeRatingBreakdown(
          chart.level,
          r.resolved_grade,
          r.score,
          r.plate,
          r.rating_points,
          r.resolved_grade,
          chart.mode,
        );
        return {
          rank: i + 1,
          user_id: r.user_id,
          username: r.username_snapshot,
          avatar: r.avatar_snapshot,
          nationality: r.nationality_snapshot,
          score: r.score,
          grade: r.resolved_grade,
          rating_points: breakdown.ratingPoints,
          ...toRatingBonusApiFields(breakdown),
          plate: r.plate || '',
        };
      }),
      participantCount,
      clearCount: participantCount,
    };
  }
  return { charts, results };
}

function getFrozenLeaderboard(db, weekId, scopeMode = 'both', skillFamily = 'all', division = 'main') {
  const bonusByUser = getFrozenBonusTotalsByUser(db, weekId, scopeMode, division);

  // Get frozen leaderboard rows for this scope + division
  const rows = db.prepare(`
    SELECT lb.*, s.username_snapshot, s.avatar_snapshot, s.nationality_snapshot,
           s.skill_title_snapshot, s.skill_family_snapshot
    FROM weekly_challenge_leaderboard lb
    JOIN weekly_challenge_user_snapshots s ON s.week_id = lb.week_id AND s.user_id = lb.user_id
    WHERE lb.week_id = ? AND lb.scope_mode = ? AND lb.division = ?
    ORDER BY lb.rank ASC
  `).all(weekId, scopeMode, division);

  // Apply family filter and rerank
  let filtered = rows;
  if (skillFamily !== 'all') {
    filtered = rows.filter(r => {
      const family = (r.skill_family_snapshot || '').toLowerCase();
      if (skillFamily === 'expert') return family === 'expert' || family === 'master';
      return family === skillFamily;
    });
  }

  return filtered.map((r, i) => {
    const bonus = bonusByUser[r.user_id] || {};
    return {
      rank: i + 1,
      user_id: r.user_id,
      username: r.username_snapshot,
      avatar: r.avatar_snapshot,
      nationality: r.nationality_snapshot,
      skill_title: r.skill_title_snapshot,
      skill_family: r.skill_family_snapshot,
      points: r.points,
      pg_bonus_points: bonus.pg_bonus_points || 0,
      pg_bonus_count: bonus.pg_bonus_count || 0,
      clears: r.clears,
      total_score: r.total_score,
      best_result_achieved_at: r.best_result_achieved_at,
    };
  });
}

function getViewerWeeklyBests(db, weekId, userId, division = 'main') {
  if (!userId) return null;
  const rows = db.prepare(`
    SELECT r.*, wc.mode, wc.level, wc.song_title_snapshot
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ? AND r.user_id = ? AND wc.division = ?
  `).all(weekId, userId, division);

  if (rows.length === 0) return null;

  const bests = {};
  let totalPoints = 0;
  let pgBonusPoints = 0;
  let pgBonusCount = 0;
  let totalClears = 0;
  for (const r of rows) {
    const breakdown = getPersistedWeeklyChallengeRatingBreakdown(
      r.level,
      r.resolved_grade,
      r.score,
      r.plate,
      r.rating_points,
      r.resolved_grade,
      r.mode,
    );
    bests[r.weekly_chart_id] = {
      score: r.score,
      grade: r.resolved_grade,
      rating_points: breakdown.ratingPoints,
      ...toRatingBonusApiFields(breakdown),
      plate: r.plate,
    };
    totalPoints += breakdown.ratingPoints;
    pgBonusPoints += breakdown.pgBonusPoints;
    if (breakdown.hasPgBonus) pgBonusCount += 1;
    totalClears += 1;
  }
  return { bests, totalPoints, totalClears, pgBonusPoints, pgBonusCount };
}

function getActiveViewerBests(userChartBests, userId) {
  if (!userId || !userChartBests) return null;
  const bests = {};
  let totalPoints = 0;
  let pgBonusPoints = 0;
  let pgBonusCount = 0;
  let totalClears = 0;

  for (const [key, entry] of userChartBests) {
    if (entry.play.user_id !== userId) continue;
    bests[entry.weeklyChart.id] = {
      score: entry.play.score,
      grade: entry.resolvedGrade,
      rating_points: entry.ratingPoints,
      base_rating_points: entry.baseRatingPoints || entry.ratingPoints,
      pg_bonus_points: entry.pgBonusPoints || 0,
      pg_bonus_percent: entry.pgBonusPercent || 0,
      has_pg_bonus: !!entry.hasPgBonus,
      plate: entry.play.plate || '',
    };
    totalPoints += entry.ratingPoints;
    pgBonusPoints += entry.pgBonusPoints || 0;
    if (entry.hasPgBonus) pgBonusCount += 1;
    totalClears += 1;
  }

  if (totalClears === 0) return null;
  return { bests, totalPoints, totalClears, pgBonusPoints, pgBonusCount };
}

// ---------------------------------------------------------------------------
// User history (for profile tab)
// ---------------------------------------------------------------------------

function getUserWeeklyChallengeHistory(db, userId) {
  const weeks = db.prepare(`
    SELECT w.*,
      (SELECT COUNT(DISTINCT r.user_id)
       FROM weekly_challenge_results r
       JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
       WHERE wc.week_id = w.id) as participant_count
    FROM weekly_challenge_weeks w
    WHERE w.status = 'finalized'
    ORDER BY w.week_key DESC
  `).all();

  const history = [];
  for (const week of weeks) {
    // Get user's leaderboard entries
    const lbEntries = db.prepare(`
      SELECT * FROM weekly_challenge_leaderboard
      WHERE week_id = ? AND user_id = ?
    `).all(week.id, userId);

    if (lbEntries.length === 0) continue;

    const byScope = {};
    for (const e of lbEntries) byScope[e.scope_mode] = e;

    // Get awards for this user
    const awards = db.prepare(`
      SELECT award_key, rank FROM weekly_challenge_awards
      WHERE week_id = ? AND user_id = ?
    `).all(week.id, userId);

    history.push({
      week_key: week.week_key,
      starts_at_utc: week.starts_at_utc,
      ends_at_utc: week.ends_at_utc,
      participant_count: week.participant_count,
      overall: byScope.both ? { rank: byScope.both.rank, points: byScope.both.points, clears: byScope.both.clears } : null,
      singles: byScope.single ? { rank: byScope.single.rank, points: byScope.single.points, clears: byScope.single.clears } : null,
      doubles: byScope.double ? { rank: byScope.double.rank, points: byScope.double.points, clears: byScope.double.clears } : null,
      awards: awards.map(a => ({ award_key: a.award_key, rank: a.rank })),
    });
  }

  return history;
}

// ---------------------------------------------------------------------------
// Play row annotation for WC chips
// ---------------------------------------------------------------------------

/**
 * Annotate play rows in-place with weekly_challenge_rank and weekly_challenge_week_key.
 * Each play's timestamp determines which week it belongs to, so a delayed sync
 * spanning multiple weeks resolves correctly.
 *
 * @param {Object} db - database connection
 * @param {Array} plays - play objects with song_title, mode, level, and a timestamp
 * @param {string} userId - the player's user ID
 * @returns {Array} the same plays array, mutated with annotations
 */
function annotateWeeklyChallengePlayRows(db, plays, userId) {
  if (!plays || plays.length === 0) return plays;

  const aliases = getAliases();

  // Load all weeks that could be relevant (active + recent finalized)
  const allWeeks = db.prepare(`
    SELECT * FROM weekly_challenge_weeks
    WHERE status IN ('active', 'finalized')
    ORDER BY starts_at_utc DESC
    LIMIT 10
  `).all();

  if (allWeeks.length === 0) return plays;

  // Pre-load charts for each week
  const weekChartLookups = {}; // weekId -> { chartKeyToChart }
  const weekById = {};
  for (const week of allWeeks) {
    weekById[week.id] = week;
    const charts = db.prepare(
      'SELECT * FROM weekly_challenge_charts WHERE week_id = ?'
    ).all(week.id);
    const lookup = {};
    for (const c of charts) {
      const ck = makeChartKey(c.song_title_snapshot, c.mode, c.level, aliases);
      if (ck) lookup[ck] = c;
    }
    weekChartLookups[week.id] = lookup;
  }

  // Build background_url-based fallback lookup for localized titles (Korean, etc.)
  // Maps "bgHash|mode|level" -> canonical English song title
  const bgUrlTitleCache = {};
  let bgUrlResolveStmt = null;

  function resolveCanonicalTitle(bgUrl, mode, level) {
    if (!bgUrl) return null;
    // Extract the piugame hash from the URL
    const match = bgUrl.match(/song_img\/([a-f0-9]+)\./);
    if (!match) return null;
    const cacheKey = `${match[1]}|${mode}|${level}`;
    if (cacheKey in bgUrlTitleCache) return bgUrlTitleCache[cacheKey];

    // Find a play from another user with the same background_url + mode + level that has an English title
    if (!bgUrlResolveStmt) {
      bgUrlResolveStmt = db.prepare(`
        SELECT DISTINCT rp2.song_title
        FROM user_recently_played rp2
        WHERE rp2.background_url = ? AND rp2.mode = ? AND rp2.level = ?
          AND rp2.song_title GLOB '[A-Za-z0-9]*'
        LIMIT 1
      `);
    }
    const row = bgUrlResolveStmt.get(bgUrl, mode, level);
    const resolved = row ? row.song_title : null;
    bgUrlTitleCache[cacheKey] = resolved;
    return resolved;
  }

  // For each play, find its week and check for chart match
  for (const play of plays) {
    const playTime = String(play.played_at_utc || play.date_played || '').trim();
    if (!playTime) continue;

    const playTitle = play.song_title || play.new_song_title || '';
    const playMode = play.mode || play.new_mode || '';
    const playLevel = play.level || play.new_level || 0;

    let ck = makeChartKey(playTitle, playMode, playLevel, aliases);

    // Find which week this play belongs to
    let matchedWeek = null;
    let matchedChart = null;
    for (const week of allWeeks) {
      if (playTime >= week.starts_at_utc && playTime <= week.ends_at_utc) {
        const chartLookup = weekChartLookups[week.id];
        if (ck && chartLookup[ck]) {
          matchedWeek = week;
          matchedChart = chartLookup[ck];
          break;
        }
        // Fallback: resolve localized title via background_url
        const canonicalTitle = resolveCanonicalTitle(
          play.background_url || '', playMode, playLevel
        );
        if (canonicalTitle) {
          const fallbackCk = makeChartKey(canonicalTitle, playMode, playLevel, aliases);
          if (fallbackCk && chartLookup[fallbackCk]) {
            matchedWeek = week;
            matchedChart = chartLookup[fallbackCk];
            break;
          }
        }
      }
    }

    if (!matchedWeek || !matchedChart) continue;

    // Compute rank for this user on this chart
    let rank = 0;
    if (matchedWeek.status === 'finalized') {
      // Use frozen results
      const results = db.prepare(`
        SELECT user_id, score FROM weekly_challenge_results
        WHERE weekly_chart_id = ?
        ORDER BY score DESC, played_at ASC
      `).all(matchedChart.id);
      for (let i = 0; i < results.length; i++) {
        if (results[i].user_id === userId) { rank = i + 1; break; }
      }
    } else {
      // Live aggregation — query user_recently_played for this specific chart in the week window
      // Find background_urls that match this chart's song (handles localized titles)
      const chartBgUrls = db.prepare(`
        SELECT DISTINCT background_url FROM user_recently_played
        WHERE song_title = ? AND mode = ? AND level = ?
          AND background_url IS NOT NULL AND background_url != ''
        LIMIT 5
      `).all(matchedChart.song_title_snapshot, matchedChart.mode, matchedChart.level).map(r => r.background_url);

      let chartPlays;
      if (chartBgUrls.length > 0) {
        const bgPlaceholders = chartBgUrls.map(() => '?').join(',');
        chartPlays = db.prepare(`
          SELECT rp.user_id, rp.score
          FROM user_recently_played rp
          WHERE (rp.song_title = ? OR rp.background_url IN (${bgPlaceholders}))
            AND rp.mode = ? AND rp.level = ?
            AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) >= ?
            AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) <= ?
            AND rp.score > 0
          ORDER BY rp.score DESC
        `).all(matchedChart.song_title_snapshot, ...chartBgUrls, matchedChart.mode, matchedChart.level, matchedWeek.starts_at_utc, matchedWeek.ends_at_utc);
      } else {
        chartPlays = db.prepare(`
          SELECT rp.user_id, rp.score
          FROM user_recently_played rp
          WHERE rp.song_title = ? AND rp.mode = ? AND rp.level = ?
            AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) >= ?
            AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) <= ?
            AND rp.score > 0
          ORDER BY rp.score DESC
        `).all(matchedChart.song_title_snapshot, matchedChart.mode, matchedChart.level, matchedWeek.starts_at_utc, matchedWeek.ends_at_utc);
      }

      // Dedupe to best per user, then find rank
      const bestByUser = {};
      for (const cp of chartPlays) {
        if (!bestByUser[cp.user_id] || cp.score > bestByUser[cp.user_id]) {
          bestByUser[cp.user_id] = cp.score;
        }
      }
      const sorted = Object.entries(bestByUser).sort(([, a], [, b]) => b - a);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i][0] === userId) { rank = i + 1; break; }
      }
    }

    play.weekly_challenge_rank = rank || null;
    play.weekly_challenge_week_key = matchedWeek.week_key;
    play.weekly_challenge_chart_id = matchedChart.id;
  }

  return plays;
}

function buildWeeklyChallengePlayEntry(play) {
  const level = parseInt(play?.level, 10) || 0;
  const score = parseInt(play?.score, 10) || 0;
  const grade = String(play?.grade || '').trim();
  const mode = String(play?.mode || '').trim();
  // Pass mode so Co-op plays use COOP_BASE_POINTS rather than the
  // main-division level table (which would yield 0 pts for level=2).
  const ratingBreakdown = getWeeklyChallengeRatingBreakdown(level, grade, score, play?.plate, null, mode);
  return {
    song_title: String(play?.song_title || ''),
    mode: String(play?.mode || ''),
    level,
    score,
    grade,
    plate: String(play?.plate || ''),
    background_url: String(play?.background_url || ''),
    machine_name: String(play?.machine_name || ''),
    played_at_utc: String(play?.played_at_utc || ''),
    date_played: String(play?.date_played || ''),
    perfect: parseInt(play?.perfect, 10) || 0,
    great: parseInt(play?.great, 10) || 0,
    good: parseInt(play?.good, 10) || 0,
    bad: parseInt(play?.bad, 10) || 0,
    miss: parseInt(play?.miss, 10) || 0,
    replay_embed_url: String(play?.replay_embed_url || ''),
    replay_video_id: String(play?.replay_video_id || ''),
    replay_start_seconds: parseInt(play?.replay_start_seconds, 10) || 0,
    replay_end_seconds: parseInt(play?.replay_end_seconds, 10) || 0,
    weekly_challenge_rank: play?.weekly_challenge_rank || null,
    weekly_challenge_week_key: String(play?.weekly_challenge_week_key || ''),
    weekly_challenge_chart_id: parseInt(play?.weekly_challenge_chart_id, 10) || null,
    rating_points: ratingBreakdown.ratingPoints,
    base_rating_points: ratingBreakdown.baseRatingPoints,
    pg_bonus_points: ratingBreakdown.pgBonusPoints,
    pg_bonus_percent: ratingBreakdown.pgBonusPercent,
    has_pg_bonus: ratingBreakdown.hasPgBonus,
  };
}

function persistWeeklyChallengePlayPosts(db, plays, userId, options = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!db || !normalizedUserId) return [];

  const sourceRows = Array.isArray(plays) ? plays.filter(Boolean) : [];
  if (sourceRows.length === 0) return [];

  if (options.ensureCurrentWeek !== false) {
    ensureCurrentWeeklyChallengeWeek(db);
  }

  const candidates = sourceRows
    .filter((play) => isPassRecord(play))
    .map((play) => ({ ...play }));
  if (candidates.length === 0) return [];

  if (options.annotate !== false) {
    annotateWeeklyChallengePlayRows(db, candidates, normalizedUserId);
  }

  const playsByWeek = new Map();
  for (const play of candidates) {
    const weekKey = String(play?.weekly_challenge_week_key || '').trim();
    if (!weekKey) continue;
    if (!playsByWeek.has(weekKey)) playsByWeek.set(weekKey, []);
    playsByWeek.get(weekKey).push(play);
  }

  if (playsByWeek.size === 0) return [];

  const createdPostIds = [];
  for (const [weekKey, weekPlays] of playsByWeek.entries()) {
    const weekRow = db.prepare('SELECT id FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
    if (!weekRow?.id) continue;

    const bestByChart = new Map();
    for (const play of weekPlays.map(buildWeeklyChallengePlayEntry)) {
      const chartKey = `${play.song_title}|${play.mode}|${play.level}`;
      const existing = bestByChart.get(chartKey);
      if (!existing || play.score > existing.score) {
        bestByChart.set(chartKey, play);
      }
    }
    if (bestByChart.size === 0) continue;

    const existingPosts = db.prepare(
      'SELECT id, plays_json FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ? ORDER BY id ASC'
    ).all(normalizedUserId, weekRow.id);

    const previousBests = new Map();
    for (const post of existingPosts) {
      let oldPlays = [];
      try {
        oldPlays = JSON.parse(post?.plays_json || '[]');
      } catch {
        oldPlays = [];
      }
      for (const play of Array.isArray(oldPlays) ? oldPlays : []) {
        const chartKey = `${play?.song_title || ''}|${play?.mode || ''}|${parseInt(play?.level, 10) || 0}`;
        const existing = previousBests.get(chartKey);
        if (!existing || (parseInt(play?.score, 10) || 0) > existing.score) {
          previousBests.set(chartKey, { score: parseInt(play?.score, 10) || 0 });
        }
      }
    }

    const differential = [];
    for (const [chartKey, play] of bestByChart.entries()) {
      const previous = previousBests.get(chartKey);
      if (!previous || play.score > previous.score) {
        differential.push(play);
      }
    }
    if (differential.length === 0) continue;

    const hashInput = differential
      .map((play) => `${play.song_title}|${play.mode}|${play.level}|${play.score}`)
      .sort()
      .join('\n');
    const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 32);
    const duplicate = db.prepare(
      'SELECT id FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ? AND content_hash = ? LIMIT 1'
    ).get(normalizedUserId, weekRow.id, contentHash);
    if (duplicate?.id) continue;

    const result = db.prepare(
      'INSERT INTO user_weekly_challenge_plays (user_id, week_id, plays_json, content_hash) VALUES (?, ?, ?, ?)'
    ).run(normalizedUserId, weekRow.id, JSON.stringify(differential), contentHash);
    createdPostIds.push(result.lastInsertRowid);
  }

  return createdPostIds;
}

// ---------------------------------------------------------------------------
// Weekly challenge summary post publishing
// ---------------------------------------------------------------------------

function publishWeeklyChallengeSummary(db, weekId, targetWeekId) {
  // Idempotent: skip if summary post already exists for this week
  const existing = db.prepare(
    "SELECT id FROM user_posts WHERE post_kind = 'weekly_challenge_summary' AND source_week_id = ?"
  ).get(weekId);
  if (existing) return existing.id;

  const result = buildWeeklyChallengeSummary(db, weekId, targetWeekId);
  if (!result) return null; // empty week or not finalized

  const { payload, contentHash } = result;
  const markerContent = serializeWcSummaryMarker(payload);

  const insert = db.prepare(`
    INSERT INTO user_posts (user_id, content, post_kind, source_week_id, target_week_id, content_hash)
    VALUES (?, ?, 'weekly_challenge_summary', ?, ?, ?)
  `);
  const row = insert.run(SYSTEM_USER_ID, markerContent, weekId, targetWeekId, contentHash);
  console.log(`[WC Summary] Published summary post ${row.lastInsertRowid} for week ${weekId}`);
  return row.lastInsertRowid;
}

function publishWeeklyChallengePersonalSummaries(db, weekId, targetWeekId) {
  // Collect user_ids that already have a personal post for this week
  const existingRows = db.prepare(
    "SELECT user_id FROM user_posts WHERE post_kind = 'weekly_challenge_personal' AND source_week_id = ?"
  ).all(weekId);
  const existingSet = new Set(existingRows.map((r) => r.user_id));

  const summaries = buildPersonalSummaries(db, weekId);
  if (summaries.length === 0) return 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO user_posts (user_id, content, post_kind, source_week_id, target_week_id, content_hash)
    VALUES (?, ?, 'weekly_challenge_personal', ?, ?, ?)
  `);

  let count = 0;
  for (const { userId, payload, contentHash } of summaries) {
    if (existingSet.has(userId)) continue;
    const markerContent = serializeWcPersonalMarker(payload);
    insert.run(userId, markerContent, weekId, targetWeekId, contentHash);
    count++;
  }

  if (count > 0) {
    console.log(`[WC Personal] Published ${count} personal summary posts for week ${weekId}`);
  }
  return count;
}

function repairMissingSummaryPosts(db) {
  // Only repair finalized weeks that had participants (skip empty weeks to avoid infinite retry)
  const missing = db.prepare(`
    SELECT w.id, w.ends_at_utc FROM weekly_challenge_weeks w
    WHERE w.status = 'finalized'
      AND EXISTS (
        SELECT 1 FROM weekly_challenge_leaderboard lb WHERE lb.week_id = w.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_posts p
        WHERE p.post_kind = 'weekly_challenge_summary' AND p.source_week_id = w.id
      )
  `).all();

  for (const m of missing) {
    // Find the actual successor week (not current week — keeps target_week_id and payload.nextWeek consistent)
    const successor = db.prepare(`
      SELECT id FROM weekly_challenge_weeks
      WHERE starts_at_utc >= ?
      ORDER BY starts_at_utc ASC LIMIT 1
    `).get(m.ends_at_utc);
    const targetWeekId = successor ? successor.id : null;
    try {
      publishWeeklyChallengeSummary(db, m.id, targetWeekId);
    } catch (err) {
      console.error(`[WC Summary] Repair failed for week ${m.id}:`, err);
    }
  }

  // Repair personal posts: find finalized weeks with at least one missing user recap
  const missingPersonal = db.prepare(`
    SELECT DISTINCT w.id, w.ends_at_utc FROM weekly_challenge_weeks w
    JOIN weekly_challenge_leaderboard lb ON lb.week_id = w.id AND lb.scope_mode = 'both'
    WHERE w.status = 'finalized'
      AND NOT EXISTS (
        SELECT 1 FROM user_posts p
        WHERE p.post_kind = 'weekly_challenge_personal'
          AND p.source_week_id = w.id
          AND p.user_id = lb.user_id
      )
  `).all();

  for (const m of missingPersonal) {
    const successor = db.prepare(`
      SELECT id FROM weekly_challenge_weeks
      WHERE starts_at_utc >= ?
      ORDER BY starts_at_utc ASC LIMIT 1
    `).get(m.ends_at_utc);
    const targetWeekId = successor ? successor.id : null;
    try {
      publishWeeklyChallengePersonalSummaries(db, m.id, targetWeekId);
    } catch (err) {
      console.error(`[WC Personal] Repair failed for week ${m.id}:`, err);
    }
  }
}

module.exports = {
  ensureCurrentWeeklyChallengeWeek,
  aggregateWeeklyResults,
  publishWeeklyChallengePersonalSummaries,
  buildLeaderboard,
  finalizeWeek,
  getFrozenChartResults,
  getFrozenLeaderboard,
  getViewerWeeklyBests,
  getActiveViewerBests,
  getUserWeeklyChallengeHistory,
  getWeekBoundary,
  getGlobalChallengeMaxLevel,
  annotateWeeklyChallengePlayRows,
  persistWeeklyChallengePlayPosts,
  calculateWeeklyChallengeRatingPoints,
  getWeeklyChallengeRatingBreakdown,
  enrichFrozenWeeklyChallengeAwards,
  computeIsoWeekKey,
  publishWeeklyChallengeSummary,
  repairMissingSummaryPosts,
};

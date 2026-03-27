// Weekly Challenges — core business logic
// Manages weekly challenge generation, result aggregation, and award finalization.

const path = require('path');
const crypto = require('crypto');
const { calculateRatingPoints, normalizeGrade, gradeFromScore, GRADE_MULTIPLIER, TITLE_REQUIREMENTS } = require('./titleProgress');
const { isPassRecord } = require('./pumbilityCandidates');
const { makeChartKey, toCanonicalTitle, normalizeMode } = require('./chartKeys');

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
    try { _aliases = require(SONG_ALIAS_PATH); } catch { _aliases = {}; }
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

function getWeekBoundary(now) {
  // Compute Monday 00:00 to Sunday 23:59:59.999 in Europe/London
  const londonStr = now.toLocaleString('en-GB', { timeZone: 'Europe/London' });
  // Parse "DD/MM/YYYY, HH:MM:SS"
  const parts = londonStr.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+):(\d+)/);
  if (!parts) throw new Error('Failed to parse London date');
  const [, day, month, year] = parts.map(Number);

  // Reconstruct as a Date in London time
  const londonDate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`);
  const dow = londonDate.getDay(); // 0=Sun, 1=Mon...
  const diffToMonday = dow === 0 ? -6 : 1 - dow;

  // Monday 00:00 London
  const monday = new Date(londonDate);
  monday.setDate(monday.getDate() + diffToMonday);
  const mondayLondon = new Date(
    monday.toLocaleString('en-US', { timeZone: 'Europe/London' })
  );

  // Sunday 23:59:59 London
  const sunday = new Date(mondayLondon);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Convert to UTC ISO strings for DB storage
  // We need the actual UTC instant for Monday 00:00 London
  const startFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const startParts = startFormatter.formatToParts(now);
  const yearNow = parseInt(startParts.find(p => p.type === 'year').value, 10);

  // Use a simpler approach: build the London dates and convert
  const mondayStr = `${year}-${String(month).padStart(2, '0')}-${String(day + diffToMonday).padStart(2, '0')}`;
  // Actually, let's use a more robust approach
  const startsAt = computeUtcFromLondon(year, month, day + diffToMonday, 0, 0, 0);
  const endsAt = computeUtcFromLondon(year, month, day + diffToMonday + 6, 23, 59, 59);

  // ISO week key
  const weekKey = computeIsoWeekKey(startsAt);

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
  const aliases = getAliases();
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
  const recentChartIds = new Set();
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
      (week_id, chart_id, mode, level, sort_order, song_title_snapshot, artist_snapshot, jacket_url_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        picked.title, picked.artist, picked.jacket_url || ''
      );
      chartCount++;
    }
  }

  db.prepare('UPDATE weekly_challenge_weeks SET chart_count = ? WHERE id = ?').run(chartCount, weekId);
  return chartCount;
}

// ---------------------------------------------------------------------------
// Ensure current week exists
// ---------------------------------------------------------------------------

function ensureCurrentWeeklyChallengeWeek(db, now = new Date()) {
  const { weekKey, startsAtUtc, endsAtUtc } = getWeekBoundary(now);

  // Check if current week already exists
  let week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
  if (week) return week;

  // Finalize any previous active weeks
  const activeWeeks = db.prepare(
    "SELECT * FROM weekly_challenge_weeks WHERE status = 'active' AND week_key != ?"
  ).all(weekKey);
  for (const aw of activeWeeks) {
    finalizeWeek(db, aw.id);
  }

  // Create the new week
  const maxLevel = getGlobalChallengeMaxLevel(db);
  const result = db.prepare(`
    INSERT INTO weekly_challenge_weeks (week_key, starts_at_utc, ends_at_utc, challenge_max_level)
    VALUES (?, ?, ?, ?)
  `).run(weekKey, startsAtUtc, endsAtUtc, maxLevel);

  week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(result.lastInsertRowid);

  // Select charts for this week
  selectWeeklyCharts(db, week);

  // Re-fetch with updated chart_count
  return db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(week.id);
}

// ---------------------------------------------------------------------------
// Result aggregation (active week — live from user_recently_played)
// ---------------------------------------------------------------------------

function aggregateWeeklyResults(db, weekId) {
  const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(weekId);
  if (!week) return null;

  const aliases = getAliases();

  // Load persisted weekly charts
  const weeklyCharts = db.prepare(
    'SELECT * FROM weekly_challenge_charts WHERE week_id = ? ORDER BY sort_order'
  ).all(weekId);

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

  // Fetch all plays in the week window
  const plays = db.prepare(`
    SELECT rp.*, u.username, u.avatar, u.nationality, u.skill_title, u.skill_level
    FROM user_recently_played rp
    JOIN users u ON rp.user_id = u.id
    WHERE COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) >= ?
      AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) <= ?
      AND rp.score > 0
      AND rp.mode IN ('Single', 'Double')
  `).all(week.starts_at_utc, week.ends_at_utc);

  // Match plays to weekly charts
  // userChartBests: Map<`${userId}|${weeklyChartId}`, { play, weeklyChart }>
  const userChartBests = new Map();
  const userProfiles = new Map(); // userId -> user profile data

  for (const play of plays) {
    // Try alias-aware chart key match first
    const ck = makeChartKey(play.song_title, play.mode, play.level, aliases);
    let wc = ck ? chartKeyLookup[ck] : null;

    // Fallback: direct title match
    if (!wc) {
      wc = directLookup[`${play.song_title}|${play.mode}|${play.level}`];
    }

    if (!wc) continue; // not a weekly challenge chart

    const resolved = resolveGrade(play.grade, play.score);
    if (resolved === 'F') continue; // not a pass

    const key = `${play.user_id}|${wc.id}`;
    const existing = userChartBests.get(key);

    if (!existing || isBetterPlay(play, resolved, existing.play, existing.resolvedGrade)) {
      userChartBests.set(key, {
        play,
        weeklyChart: wc,
        resolvedGrade: resolved,
        ratingPoints: calculateRatingPoints(wc.level, play.grade, play.score),
      });
    }

    // Track user profiles for snapshot
    if (!userProfiles.has(play.user_id)) {
      userProfiles.set(play.user_id, {
        user_id: play.user_id,
        username: play.username,
        avatar: play.avatar,
        nationality: play.nationality,
        skill_title: play.skill_title,
        skill_level: play.skill_level,
        skill_family: deriveSkillFamily(play.skill_title),
      });
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

  for (const [, profile] of userProfiles) {
    upsertSnapshot.run(
      weekId, profile.user_id,
      profile.username || '', profile.avatar || '', profile.nationality || '',
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
      chartResults[chartId].top3 = entries.slice(0, 3).map((e, i) => ({
        rank: i + 1,
        user_id: e.userId,
        username: e.play.username,
        avatar: e.play.avatar,
        nationality: e.play.nationality,
        score: e.play.score,
        grade: e.resolvedGrade,
        rating_points: e.ratingPoints,
        plate: e.play.plate || '',
      }));
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
    }
    const t = userTotals[uid];
    const mode = entry.weeklyChart.mode === 'Single' ? 'single' : 'double';
    const playedAt = entry.play.played_at_utc || entry.play.date_played || '';

    for (const scope of ['both', mode]) {
      t[scope].points += entry.ratingPoints;
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

    // Family filter
    if (skillFamily !== 'all' && snapshots) {
      const snap = snapshots[userId];
      const family = (snap?.skill_family_snapshot || totals.profile?.skill_family || '').toLowerCase();
      if (skillFamily === 'expert') {
        if (family !== 'expert' && family !== 'master') continue;
      } else if (family !== skillFamily) {
        continue;
      }
    }

    entries.push({
      user_id: userId,
      username: totals.profile?.username || '',
      avatar: totals.profile?.avatar || '',
      nationality: totals.profile?.nationality || '',
      skill_title: totals.profile?.skill_title || '',
      skill_family: totals.profile?.skill_family || '',
      points: scope.points,
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

function finalizeWeek(db, weekId) {
  const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(weekId);
  if (!week || week.status === 'finalized') return;

  const agg = aggregateWeeklyResults(db, weekId);
  if (!agg) return;

  // Load snapshots for family filtering
  const snapshotRows = db.prepare(
    'SELECT * FROM weekly_challenge_user_snapshots WHERE week_id = ?'
  ).all(weekId);
  const snapshots = {};
  for (const s of snapshotRows) snapshots[s.user_id] = s;

  // Persist frozen results
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
      p.id || null
    );
  }

  // Persist frozen leaderboard for each scope
  const insertLeaderboard = db.prepare(`
    INSERT OR REPLACE INTO weekly_challenge_leaderboard
      (week_id, user_id, scope_mode, points, clears, total_score, best_result_achieved_at, rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const scope of ['both', 'single', 'double']) {
    const lb = buildLeaderboard(agg.userTotals, scope, 'all', snapshots);
    for (const entry of lb) {
      insertLeaderboard.run(
        weekId, entry.user_id, scope,
        entry.points, entry.clears, entry.total_score,
        entry.best_result_achieved_at, entry.rank
      );
    }
  }

  // Generate awards
  const awardConfigs = [
    { key: 'overall', label: 'Weekly Overall', scopeMode: 'both', skillFamily: 'all' },
    { key: 'singles', label: 'Weekly Singles', scopeMode: 'single', skillFamily: 'all' },
    { key: 'doubles', label: 'Weekly Doubles', scopeMode: 'double', skillFamily: 'all' },
    { key: 'advanced', label: 'Weekly Advanced', scopeMode: 'both', skillFamily: 'advanced' },
    { key: 'intermediate', label: 'Weekly Intermediate', scopeMode: 'both', skillFamily: 'intermediate' },
  ];

  const insertAward = db.prepare(`
    INSERT OR REPLACE INTO weekly_challenge_awards
      (week_id, award_key, award_label, scope_mode, skill_family,
       user_id, rank, points, clears, total_score, best_result_achieved_at,
       username_snapshot, avatar_snapshot, nationality_snapshot, skill_title_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const cfg of awardConfigs) {
    const lb = buildLeaderboard(agg.userTotals, cfg.scopeMode, cfg.skillFamily, snapshots);
    const podium = lb.slice(0, 3);
    for (const entry of podium) {
      const snap = snapshots[entry.user_id] || {};
      insertAward.run(
        weekId, cfg.key, cfg.label, cfg.scopeMode, cfg.skillFamily,
        entry.user_id, entry.rank, entry.points, entry.clears, entry.total_score,
        entry.best_result_achieved_at,
        snap.username_snapshot || entry.username,
        snap.avatar_snapshot || entry.avatar,
        snap.nationality_snapshot || entry.nationality,
        snap.skill_title_snapshot || entry.skill_title
      );
    }
  }

  // Mark week as finalized
  db.prepare("UPDATE weekly_challenge_weeks SET status = 'finalized', closed_at = datetime('now') WHERE id = ?")
    .run(weekId);
}

// ---------------------------------------------------------------------------
// Frozen data readers (for finalized weeks)
// ---------------------------------------------------------------------------

function getFrozenChartResults(db, weekId) {
  const charts = db.prepare(
    'SELECT * FROM weekly_challenge_charts WHERE week_id = ? ORDER BY sort_order'
  ).all(weekId);

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
      top3: top3.map((r, i) => ({
        rank: i + 1,
        user_id: r.user_id,
        username: r.username_snapshot,
        avatar: r.avatar_snapshot,
        nationality: r.nationality_snapshot,
        score: r.score,
        grade: r.resolved_grade,
        rating_points: r.rating_points,
        plate: r.plate || '',
      })),
      participantCount,
      clearCount: participantCount,
    };
  }
  return { charts, results };
}

function getFrozenLeaderboard(db, weekId, scopeMode = 'both', skillFamily = 'all') {
  // Get frozen leaderboard rows for this scope
  const rows = db.prepare(`
    SELECT lb.*, s.username_snapshot, s.avatar_snapshot, s.nationality_snapshot,
           s.skill_title_snapshot, s.skill_family_snapshot
    FROM weekly_challenge_leaderboard lb
    JOIN weekly_challenge_user_snapshots s ON s.week_id = lb.week_id AND s.user_id = lb.user_id
    WHERE lb.week_id = ? AND lb.scope_mode = ?
    ORDER BY lb.rank ASC
  `).all(weekId, scopeMode);

  // Apply family filter and rerank
  let filtered = rows;
  if (skillFamily !== 'all') {
    filtered = rows.filter(r => {
      const family = (r.skill_family_snapshot || '').toLowerCase();
      if (skillFamily === 'expert') return family === 'expert' || family === 'master';
      return family === skillFamily;
    });
  }

  return filtered.map((r, i) => ({
    rank: i + 1,
    user_id: r.user_id,
    username: r.username_snapshot,
    avatar: r.avatar_snapshot,
    nationality: r.nationality_snapshot,
    skill_title: r.skill_title_snapshot,
    skill_family: r.skill_family_snapshot,
    points: r.points,
    clears: r.clears,
    total_score: r.total_score,
    best_result_achieved_at: r.best_result_achieved_at,
  }));
}

function getViewerWeeklyBests(db, weekId, userId) {
  if (!userId) return null;
  const rows = db.prepare(`
    SELECT r.*, wc.mode, wc.level, wc.song_title_snapshot
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ? AND r.user_id = ?
  `).all(weekId, userId);

  if (rows.length === 0) return null;

  const bests = {};
  let totalPoints = 0;
  let totalClears = 0;
  for (const r of rows) {
    bests[r.weekly_chart_id] = {
      score: r.score,
      grade: r.resolved_grade,
      rating_points: r.rating_points,
      plate: r.plate,
    };
    totalPoints += r.rating_points;
    totalClears += 1;
  }
  return { bests, totalPoints, totalClears };
}

function getActiveViewerBests(userChartBests, userId) {
  if (!userId || !userChartBests) return null;
  const bests = {};
  let totalPoints = 0;
  let totalClears = 0;

  for (const [key, entry] of userChartBests) {
    if (entry.play.user_id !== userId) continue;
    bests[entry.weeklyChart.id] = {
      score: entry.play.score,
      grade: entry.resolvedGrade,
      rating_points: entry.ratingPoints,
      plate: entry.play.plate || '',
    };
    totalPoints += entry.ratingPoints;
    totalClears += 1;
  }

  if (totalClears === 0) return null;
  return { bests, totalPoints, totalClears };
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

module.exports = {
  ensureCurrentWeeklyChallengeWeek,
  aggregateWeeklyResults,
  buildLeaderboard,
  finalizeWeek,
  getFrozenChartResults,
  getFrozenLeaderboard,
  getViewerWeeklyBests,
  getActiveViewerBests,
  getUserWeeklyChallengeHistory,
  getWeekBoundary,
  getGlobalChallengeMaxLevel,
};

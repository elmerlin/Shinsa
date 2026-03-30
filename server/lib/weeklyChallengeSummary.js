// Weekly Challenge Summary Builder
// Builds an immutable summary payload from finalized weekly challenge data.
// Used to create the official summary post in the social feed.

const crypto = require('crypto');
const path = require('path');
const { makeChartKey, toCanonicalTitle } = require('./chartKeys');
const { calculateRatingPoints, normalizeGrade, gradeFromScore } = require('./titleProgress');

// ---------------------------------------------------------------------------
// Alias loading (mirrors weeklyChallenges.js)
// ---------------------------------------------------------------------------

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

function resolveGrade(rawGrade, score) {
  return normalizeGrade(rawGrade) || gradeFromScore(parseInt(score, 10) || 0);
}

// ---------------------------------------------------------------------------
// Week label helpers
// ---------------------------------------------------------------------------

function formatWeekLabel(week) {
  // "Week 13 — Mar 23–29, 2026"
  const weekMatch = (week.week_key || '').match(/W(\d+)$/);
  const weekNum = weekMatch ? parseInt(weekMatch[1], 10) : 0;

  const startDate = new Date(week.starts_at_utc);
  const endDate = new Date(week.ends_at_utc);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startMonth = months[startDate.getUTCMonth()];
  const endMonth = months[endDate.getUTCMonth()];
  const startDay = startDate.getUTCDate();
  const endDay = endDate.getUTCDate();
  const year = endDate.getUTCFullYear();

  const dateRange = startMonth === endMonth
    ? `${startMonth} ${startDay}\u2013${endDay}, ${year}`
    : `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${year}`;

  return `Week ${weekNum} \u2014 ${dateRange}`;
}

// ---------------------------------------------------------------------------
// Superlative computation
// ---------------------------------------------------------------------------

function computeSuperlatives(db, weekId, week, snapshots) {
  const superlatives = {};

  // most_sss: count of SSS/SSS+ grades per user
  const sssRows = db.prepare(`
    SELECT r.user_id, COUNT(*) as cnt
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ?
      AND r.resolved_grade IN ('SSS', 'SSS+')
    GROUP BY r.user_id
    HAVING cnt > 0
    ORDER BY cnt DESC, r.user_id ASC
    LIMIT 3
  `).all(weekId);
  superlatives.most_sss = sssRows.map((r, i) => {
    const snap = snapshots[r.user_id] || {};
    return {
      rank: i + 1, user_id: r.user_id, value: r.cnt,
      username: snap.username_snapshot || '', avatar: snap.avatar_snapshot || '',
      nationality: snap.nationality_snapshot || '',
      detail_json: { sss_count: r.cnt },
    };
  });

  // highest_clear_percentage: clears / chart_count * 100
  const chartCount = week.chart_count || 1;
  const pctRows = db.prepare(`
    SELECT lb.user_id, lb.clears,
           CAST(lb.clears AS REAL) / ? * 100.0 as pct
    FROM weekly_challenge_leaderboard lb
    WHERE lb.week_id = ? AND lb.scope_mode = 'both'
    ORDER BY pct DESC, lb.clears DESC, lb.user_id ASC
    LIMIT 3
  `).all(chartCount, weekId);
  superlatives.highest_clear_percentage = pctRows.map((r, i) => {
    const snap = snapshots[r.user_id] || {};
    return {
      rank: i + 1, user_id: r.user_id, value: Math.round(r.pct * 10) / 10,
      username: snap.username_snapshot || '', avatar: snap.avatar_snapshot || '',
      nationality: snap.nationality_snapshot || '',
      detail_json: { clears: r.clears, chart_count: chartCount },
    };
  });

  // highest_clear_rating: avg rating_points per clear, min 3 clears
  const ratingRows = db.prepare(`
    SELECT r.user_id,
           AVG(r.rating_points) as avg_rating,
           COUNT(*) as clear_count
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ?
    GROUP BY r.user_id
    HAVING clear_count >= 3
    ORDER BY avg_rating DESC, clear_count DESC, r.user_id ASC
    LIMIT 3
  `).all(weekId);
  superlatives.highest_clear_rating = ratingRows.map((r, i) => {
    const snap = snapshots[r.user_id] || {};
    return {
      rank: i + 1, user_id: r.user_id, value: Math.round(r.avg_rating),
      username: snap.username_snapshot || '', avatar: snap.avatar_snapshot || '',
      nationality: snap.nationality_snapshot || '',
      detail_json: { avg_rating: Math.round(r.avg_rating), clear_count: r.clear_count },
    };
  });

  // biggest_improvements: sum of (final_score - pre_week_best) for improved charts
  // Requires JS-based matching for alias resolution
  superlatives.biggest_improvements = computeBiggestImprovements(db, weekId, week, snapshots);

  return superlatives;
}

function computeBiggestImprovements(db, weekId, week, snapshots) {
  const aliases = getAliases();

  // Load all weekly charts
  const weeklyCharts = db.prepare(
    'SELECT * FROM weekly_challenge_charts WHERE week_id = ? ORDER BY sort_order'
  ).all(weekId);

  // Load all frozen results for this week
  const results = db.prepare(`
    SELECT r.*, wc.song_title_snapshot, wc.mode, wc.level
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ?
  `).all(weekId);

  // Build chart key lookup for alias-aware matching
  const chartKeyLookup = {};
  const directLookup = {};
  for (const wc of weeklyCharts) {
    const ck = makeChartKey(wc.song_title_snapshot, wc.mode, wc.level, aliases);
    if (ck) chartKeyLookup[ck] = wc;
    directLookup[`${wc.song_title_snapshot}|${wc.mode}|${wc.level}`] = wc;
  }

  // For each chart, find pre-week best scores for all users
  // Pre-week = played_at_utc (or date_played fallback) < week.starts_at_utc
  // Only passing plays (non-F grade)
  const preWeekBests = new Map(); // key: `${userId}|${chartId}` → best pre-week score

  for (const wc of weeklyCharts) {
    // Build list of song titles that could match this chart (canonical + aliases)
    const titleVariants = new Set([wc.song_title_snapshot]);
    // Add reverse-alias lookup: titles that map to this chart's canonical title
    const canonicalCk = makeChartKey(wc.song_title_snapshot, wc.mode, wc.level, aliases);
    if (canonicalCk) {
      // Check all aliases that map to the same canonical key
      for (const [aliasNorm, canonicalNorm] of Object.entries(aliases)) {
        if (canonicalNorm === toCanonicalTitle(wc.song_title_snapshot, aliases)) {
          // Find original title for this alias — scan user_recently_played is too expensive,
          // just include the alias as a variant
          titleVariants.add(aliasNorm);
        }
      }
    }

    // Query pre-week plays for this chart across all title variants
    const placeholders = [...titleVariants].map(() => '?').join(',');
    const preWeekPlays = db.prepare(`
      SELECT user_id, MAX(score) as best_score
      FROM user_recently_played
      WHERE song_title IN (${placeholders})
        AND mode = ?
        AND level = ?
        AND COALESCE(NULLIF(played_at_utc, ''), date_played) < ?
        AND score > 0
      GROUP BY user_id
    `).all(...titleVariants, wc.mode, wc.level, week.starts_at_utc);

    // Also try background_url-based resolution for localized titles
    const bgPreWeekPlays = db.prepare(`
      SELECT rp.user_id, MAX(rp.score) as best_score
      FROM user_recently_played rp
      WHERE rp.background_url IN (
        SELECT DISTINCT background_url FROM user_recently_played
        WHERE song_title IN (${placeholders}) AND mode = ? AND level = ?
          AND background_url != '' AND background_url IS NOT NULL
      )
        AND rp.mode = ?
        AND rp.level = ?
        AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) < ?
        AND rp.score > 0
      GROUP BY rp.user_id
    `).all(...titleVariants, wc.mode, wc.level, wc.mode, wc.level, week.starts_at_utc);

    // Merge: take the max of both queries per user
    const userBests = new Map();
    for (const row of preWeekPlays) {
      userBests.set(row.user_id, Math.max(userBests.get(row.user_id) || 0, row.best_score));
    }
    for (const row of bgPreWeekPlays) {
      userBests.set(row.user_id, Math.max(userBests.get(row.user_id) || 0, row.best_score));
    }

    // Filter to only passing scores (score >= threshold for a non-F grade)
    // In PIU, any score > 0 from user_recently_played that has a non-F grade is a pass.
    // We already filter score > 0 in SQL. We need to also check the grade was a pass.
    // But we don't have the grade in the MAX(score) aggregation — so we use a secondary check.
    // A passing play in PIU generally has score > 0. The finalization code uses resolveGrade
    // and skips F grades. For pre-week, we trust score > 0 as a reasonable proxy for a pass,
    // since the user_recently_played table generally only stores non-F plays.
    // However, to be precise, we should check that the max-score play was actually a pass.
    // For simplicity and performance, we accept score > 0 as the baseline.

    for (const [userId, bestScore] of userBests) {
      preWeekBests.set(`${userId}|${wc.id}`, bestScore);
    }
  }

  // Compute deltas: for each user's frozen result, subtract their pre-week best
  const userDeltas = new Map(); // userId → { totalDelta, chartsImproved }

  for (const r of results) {
    const key = `${r.user_id}|${r.weekly_chart_id}`;
    const preWeekBest = preWeekBests.get(key);
    if (preWeekBest === undefined || preWeekBest <= 0) continue; // no pre-week pass → skip

    const delta = r.score - preWeekBest;
    if (delta <= 0) continue; // no improvement

    const existing = userDeltas.get(r.user_id) || { totalDelta: 0, chartsImproved: 0 };
    existing.totalDelta += delta;
    existing.chartsImproved += 1;
    userDeltas.set(r.user_id, existing);
  }

  // Rank by totalDelta DESC
  const ranked = [...userDeltas.entries()]
    .sort((a, b) => b[1].totalDelta - a[1].totalDelta || a[0].localeCompare(b[0]))
    .slice(0, 3);

  return ranked.map(([userId, data], i) => {
    const snap = snapshots[userId] || {};
    return {
      rank: i + 1, user_id: userId, value: data.totalDelta,
      username: snap.username_snapshot || '', avatar: snap.avatar_snapshot || '',
      nationality: snap.nationality_snapshot || '',
      detail_json: { total_delta: data.totalDelta, charts_improved: data.chartsImproved },
    };
  });
}

// ---------------------------------------------------------------------------
// Replay highlight selection
// ---------------------------------------------------------------------------

function selectReplayHighlights(db, weekId, awards) {
  // Load all results with replay data
  const rows = db.prepare(`
    SELECT r.*, wc.song_title_snapshot, wc.mode, wc.level, wc.jacket_url_snapshot,
           rp.replay_embed_url, rp.replay_video_id, rp.replay_start_seconds, rp.replay_end_seconds,
           s.username_snapshot, s.avatar_snapshot, s.nationality_snapshot,
           wcp.id AS play_post_id,
           (
             SELECT COUNT(*)
             FROM weekly_challenge_play_comments wcc
             WHERE wcc.play_post_id = wcp.id
           ) AS play_post_comment_count
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    JOIN user_recently_played rp ON rp.id = r.source_play_id
    JOIN weekly_challenge_user_snapshots s ON s.week_id = ? AND s.user_id = r.user_id
    LEFT JOIN user_weekly_challenge_plays wcp ON wcp.week_id = wc.week_id AND wcp.user_id = r.user_id
    WHERE wc.week_id = ?
      AND r.source_play_id IS NOT NULL
      AND (rp.replay_embed_url != '' OR rp.replay_video_id != '')
  `).all(weekId, weekId);

  if (rows.length === 0) return [];

  // Build award lookup for scoring
  const awardUserRanks = {}; // userId → best rank across all awards
  if (awards) {
    for (const entries of Object.values(awards)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        const existing = awardUserRanks[e.user_id] || 99;
        if (e.rank < existing) awardUserRanks[e.user_id] = e.rank;
      }
    }
  }

  // Score each candidate
  const scored = rows.map(r => {
    let score = 0;

    // Award placement bonus
    const awardRank = awardUserRanks[r.user_id];
    if (awardRank === 1) score += 50;
    else if (awardRank === 2) score += 30;
    else if (awardRank === 3) score += 20;

    // Rating contribution (max 30)
    score += Math.min((r.rating_points || 0) / 100, 30);

    // Grade quality
    if (r.resolved_grade === 'SSS+' || r.resolved_grade === 'SSS') score += 15;
    else if (r.resolved_grade === 'SS+' || r.resolved_grade === 'SS') score += 10;

    // Build highlight reason
    let reason = '';
    if (awardRank === 1) reason = 'Gold medalist';
    else if (awardRank === 2) reason = 'Silver medalist';
    else if (awardRank === 3) reason = 'Bronze medalist';
    else if (r.resolved_grade === 'SSS+' || r.resolved_grade === 'SSS') reason = `${r.resolved_grade} clear`;
    else reason = `${r.rating_points} rating`;

    return {
      ...r,
      _score: score,
      highlight_reason: reason,
    };
  });

  // Sort by score DESC
  scored.sort((a, b) => b._score - a._score);

  // Select with diversity: max 2 per player
  const selected = [];
  const playerCounts = {};
  for (const r of scored) {
    if (selected.length >= 5) break;
    const count = playerCounts[r.user_id] || 0;
    if (count >= 2) continue;
    playerCounts[r.user_id] = count + 1;
    selected.push({
      user_id: r.user_id,
      username: r.username_snapshot || '',
      avatar: r.avatar_snapshot || '',
      nationality: r.nationality_snapshot || '',
      song_title: r.song_title_snapshot || '',
      mode: r.mode || '',
      level: r.level || 0,
      jacket_url: r.jacket_url_snapshot || '',
      score: r.score || 0,
      grade: r.resolved_grade || '',
      rating_points: r.rating_points || 0,
      replay_embed_url: r.replay_embed_url || '',
      replay_video_id: r.replay_video_id || '',
      replay_start_seconds: r.replay_start_seconds || 0,
      replay_end_seconds: r.replay_end_seconds || 0,
      highlight_reason: r.highlight_reason,
      play_post_id: r.play_post_id || 0,
      play_post_comment_count: r.play_post_comment_count || 0,
    });
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build an immutable weekly challenge summary payload from finalized data.
 * @param {Database} db
 * @param {number} weekId - The finalized week to summarize
 * @param {number|null} targetWeekId - The successor week (for next-week CTA). Null if no successor yet.
 * @returns {{ payload: object, contentHash: string } | null}
 */
function buildWeeklyChallengeSummary(db, weekId, targetWeekId = null) {
  // 1. Load finalized week
  const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ? AND status = ?')
    .get(weekId, 'finalized');
  if (!week) return null;

  // 2. Check participant count — skip empty weeks
  const participantCount = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as cnt FROM weekly_challenge_leaderboard WHERE week_id = ? AND scope_mode = 'both'"
  ).get(weekId)?.cnt || 0;
  if (participantCount === 0) return null;

  // 3. Load frozen awards
  const awardRows = db.prepare(
    'SELECT * FROM weekly_challenge_awards WHERE week_id = ? ORDER BY award_key, rank'
  ).all(weekId);

  const awards = { overall: [], singles: [], doubles: [], advanced: [], intermediate: [] };
  for (const a of awardRows) {
    const entry = {
      rank: a.rank,
      user_id: a.user_id,
      username: a.username_snapshot || '',
      avatar: a.avatar_snapshot || '',
      nationality: a.nationality_snapshot || '',
      skill_title: a.skill_title_snapshot || '',
      points: a.points,
      clears: a.clears,
    };
    if (awards[a.award_key]) awards[a.award_key].push(entry);
  }

  // 4. Aggregate stats from frozen leaderboard
  const lbStats = db.prepare(`
    SELECT SUM(clears) as total_clears
    FROM weekly_challenge_leaderboard
    WHERE week_id = ? AND scope_mode = 'both'
  `).get(weekId);
  const totalClears = lbStats?.total_clears || 0;

  // 5. Load snapshots for superlative computation
  const snapshotRows = db.prepare(
    'SELECT * FROM weekly_challenge_user_snapshots WHERE week_id = ?'
  ).all(weekId);
  const snapshots = {};
  for (const s of snapshotRows) snapshots[s.user_id] = s;

  // 6. Clear stale superlatives and recompute
  db.prepare('DELETE FROM weekly_challenge_superlatives WHERE week_id = ?').run(weekId);
  const superlatives = computeSuperlatives(db, weekId, week, snapshots);

  // Persist superlatives
  const insertSuperlative = db.prepare(`
    INSERT OR REPLACE INTO weekly_challenge_superlatives
      (week_id, reward_key, rank, user_id, value, detail_json,
       username_snapshot, avatar_snapshot, nationality_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [key, entries] of Object.entries(superlatives)) {
    for (const entry of entries) {
      insertSuperlative.run(
        weekId, key, entry.rank, entry.user_id, entry.value,
        JSON.stringify(entry.detail_json || {}),
        entry.username, entry.avatar, entry.nationality
      );
    }
  }

  // 7. Select replay highlights
  const replayHighlights = selectReplayHighlights(db, weekId, awards);

  // 8. Load next week data (using resolved targetWeekId)
  let nextWeek = null;
  if (targetWeekId) {
    const nw = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(targetWeekId);
    if (nw) {
      const previewCharts = db.prepare(
        'SELECT song_title_snapshot, mode, level, jacket_url_snapshot FROM weekly_challenge_charts WHERE week_id = ? ORDER BY sort_order LIMIT 6'
      ).all(targetWeekId);
      nextWeek = {
        weekId: nw.id,
        weekKey: nw.week_key,
        weekLabel: formatWeekLabel(nw),
        previewCharts: previewCharts.map(c => ({
          song_title: c.song_title_snapshot,
          mode: c.mode,
          level: c.level,
          jacket_url: c.jacket_url_snapshot,
        })),
      };
    }
  }

  // 9. Assemble payload
  const payload = {
    version: 1,
    weekId: week.id,
    weekKey: week.week_key,
    weekLabel: formatWeekLabel(week),
    startsAtUtc: week.starts_at_utc,
    endsAtUtc: week.ends_at_utc,
    participantCount,
    totalClears,
    chartCount: week.chart_count || 0,
    topOverallPodium: awards.overall.slice(0, 3),
    awards,
    superlatives,
    replayHighlights,
    nextWeek,
    generatedAt: new Date().toISOString(),
  };

  // 10. Content hash for idempotency
  const hashInput = JSON.stringify({
    weekId, participantCount, totalClears,
    awards, superlatives: Object.fromEntries(
      Object.entries(superlatives).map(([k, v]) => [k, v.map(e => e.user_id + ':' + e.value)])
    ),
  });
  const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex');

  return { payload, contentHash };
}

// ---------------------------------------------------------------------------
// Per-user personal summary builder
// ---------------------------------------------------------------------------

function buildPersonalSummaries(db, weekId) {
  const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE id = ?').get(weekId);
  if (!week || week.status !== 'finalized') return [];

  const chartCount = week.chart_count || 0;
  const weekLabel = formatWeekLabel(week);

  // Load all user snapshots for this week
  const snapshots = {};
  for (const row of db.prepare('SELECT * FROM weekly_challenge_user_snapshots WHERE week_id = ?').all(weekId)) {
    snapshots[row.user_id] = row;
  }

  // Average score and clear count per user
  const avgScoreMap = {};
  for (const row of db.prepare(`
    SELECT r.user_id, AVG(r.score) as avg_score, COUNT(*) as clears
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ?
    GROUP BY r.user_id
  `).all(weekId)) {
    avgScoreMap[row.user_id] = { avgScore: Math.round(row.avg_score || 0), clears: row.clears || 0 };
  }

  // Highest rated play per user (ordered by rating_points DESC, score DESC)
  const bestPlayMap = {};
  for (const row of db.prepare(`
    SELECT r.user_id, r.score, r.resolved_grade, r.rating_points,
           wc.song_title_snapshot, wc.mode, wc.level, wc.jacket_url_snapshot
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ?
    ORDER BY r.rating_points DESC, r.score DESC
  `).all(weekId)) {
    if (!bestPlayMap[row.user_id]) {
      bestPlayMap[row.user_id] = {
        songTitle: row.song_title_snapshot || '',
        mode: row.mode || '',
        level: row.level || 0,
        jacketUrl: row.jacket_url_snapshot || '',
        score: row.score || 0,
        grade: row.resolved_grade || '',
        ratingPoints: row.rating_points || 0,
      };
    }
  }

  // SSS count per user
  const sssMap = {};
  for (const row of db.prepare(`
    SELECT r.user_id, COUNT(*) as sss_count
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    WHERE wc.week_id = ? AND r.resolved_grade IN ('SSS', 'SSS+')
    GROUP BY r.user_id
  `).all(weekId)) {
    sssMap[row.user_id] = row.sss_count || 0;
  }

  // Leaderboard: group by user_id with sub-maps by scope_mode
  const lbRows = db.prepare('SELECT * FROM weekly_challenge_leaderboard WHERE week_id = ?').all(weekId);
  const lbByUser = {};
  const scopeTotals = {};
  for (const row of lbRows) {
    if (!lbByUser[row.user_id]) lbByUser[row.user_id] = {};
    lbByUser[row.user_id][row.scope_mode] = row;
    scopeTotals[row.scope_mode] = (scopeTotals[row.scope_mode] || 0) + 1;
  }

  // Awards/podiums: group by user_id
  const awardsByUser = {};
  for (const row of db.prepare('SELECT * FROM weekly_challenge_awards WHERE week_id = ?').all(weekId)) {
    if (!awardsByUser[row.user_id]) awardsByUser[row.user_id] = [];
    awardsByUser[row.user_id].push({
      awardKey: row.award_key || '',
      awardLabel: row.award_label || '',
      rank: row.rank || 0,
    });
  }

  // Bracket comparison data for intermediate/advanced
  const bracketData = {};
  for (const family of ['intermediate', 'advanced']) {
    const bracketUsers = Object.entries(snapshots)
      .filter(([, snap]) => snap.skill_family_snapshot === family)
      .map(([uid]) => uid);
    if (bracketUsers.length < 3) continue;

    const bracketLbRows = lbRows.filter(
      (row) => row.scope_mode === 'both' && bracketUsers.includes(row.user_id)
    );
    if (bracketLbRows.length < 3) continue;

    // Sort by same criteria as main leaderboard
    bracketLbRows.sort((a, b) =>
      (b.points - a.points)
      || (b.clears - a.clears)
      || (b.total_score - a.total_score)
    );

    const totalScore = bracketLbRows.reduce((sum, r) => sum + (r.total_score || 0), 0);
    const avgScore = Math.round(totalScore / bracketLbRows.length);

    for (let i = 0; i < bracketLbRows.length; i++) {
      bracketData[bracketLbRows[i].user_id] = {
        bracketName: family.charAt(0).toUpperCase() + family.slice(1),
        bracketRank: i + 1,
        bracketParticipantCount: bracketLbRows.length,
        bracketAverageScore: avgScore,
      };
    }
  }

  // Assemble personal summaries for all participants (scope_mode = 'both')
  const participants = lbRows.filter((row) => row.scope_mode === 'both');
  const results = [];

  for (const lb of participants) {
    const userId = lb.user_id;
    const snap = snapshots[userId] || {};
    const userLb = lbByUser[userId] || {};
    const scores = avgScoreMap[userId] || { avgScore: 0, clears: 0 };

    // Build rankings
    const overallLb = userLb.both;
    const singlesLb = userLb.single;
    const doublesLb = userLb.double;
    const rankings = {
      overall: overallLb ? { rank: overallLb.rank || 0, total: scopeTotals.both || 0 } : null,
      singles: singlesLb ? { rank: singlesLb.rank || 0, total: scopeTotals.single || 0 } : null,
      doubles: doublesLb ? { rank: doublesLb.rank || 0, total: scopeTotals.double || 0 } : null,
    };

    // Average rank across available scopes
    const rankValues = [rankings.overall, rankings.singles, rankings.doubles]
      .filter(Boolean)
      .map((r) => r.rank)
      .filter((r) => r > 0);
    const averageRank = rankValues.length > 0
      ? Math.round((rankValues.reduce((s, v) => s + v, 0) / rankValues.length) * 10) / 10
      : 0;

    const payload = {
      version: 1,
      weekId,
      weekKey: week.week_key || '',
      weekLabel,
      userId,
      username: snap.username_snapshot || '',
      avatar: snap.avatar_snapshot || '',
      nationality: snap.nationality_snapshot || '',
      skillFamily: snap.skill_family_snapshot || '',
      skillTitle: snap.skill_title_snapshot || '',
      averageScore: scores.avgScore,
      highestRatedPlay: bestPlayMap[userId] || null,
      sssCount: sssMap[userId] || 0,
      totalClears: scores.clears,
      chartCount,
      rankings,
      averageRank,
      bracketComparison: bracketData[userId] || null,
      podiums: awardsByUser[userId] || [],
      generatedAt: new Date().toISOString(),
    };

    const hashInput = JSON.stringify({
      weekId,
      userId,
      avgScore: scores.avgScore,
      sssCount: sssMap[userId] || 0,
      clears: scores.clears,
      rankings,
      podiums: awardsByUser[userId] || [],
    });
    const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    results.push({ userId, payload, contentHash });
  }

  return results;
}

module.exports = {
  buildWeeklyChallengeSummary,
  buildPersonalSummaries,
  formatWeekLabel,
};

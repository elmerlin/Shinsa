const express = require('express');
const path = require('path');
const router = express.Router();
const { getDb } = require('../db/schema');
const { optionalAuth } = require('./auth');
const { makeChartKey, toCanonicalTitle } = require('../lib/chartKeys');
const {
  ensureCurrentWeeklyChallengeWeek,
  aggregateWeeklyResults,
  buildLeaderboard,
  getFrozenChartResults,
  getFrozenLeaderboard,
  getViewerWeeklyBests,
  getActiveViewerBests,
  getUserWeeklyChallengeHistory,
  getWeeklyChallengeRatingBreakdown,
  enrichFrozenWeeklyChallengeAwards,
} = require('../lib/weeklyChallenges');

const SONG_ALIAS_PATH = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');
let cachedSongAliases = null;

function getSongAliases() {
  if (cachedSongAliases) return cachedSongAliases;
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
    cachedSongAliases = normalized;
  } catch {
    cachedSongAliases = {};
  }
  return cachedSongAliases;
}

// ---------------------------------------------------------------------------
// Cache — public aggregates only (viewer data composed post-cache)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getLiveWeekAggregate(db, week, division = 'main') {
  if (!week?.id) return null;
  // Cache by division so the main + coop divisions don't clobber each other.
  const cacheKey = `aggregate:${week.id}:${division}`;
  let aggregate = getCached(cacheKey);
  if (!aggregate) {
    aggregate = aggregateWeeklyResults(db, week.id, division);
    if (aggregate) setCache(cacheKey, aggregate);
  }
  return aggregate;
}

function getAggregateLeaderboard(aggregate, scopeMode = 'both', skillFamily = 'all') {
  if (!aggregate) return [];
  if (!aggregate.leaderboardCache) aggregate.leaderboardCache = new Map();
  const cacheKey = `${scopeMode}:${skillFamily}`;
  if (!aggregate.leaderboardCache.has(cacheKey)) {
    aggregate.leaderboardCache.set(
      cacheKey,
      buildLeaderboard(aggregate.userTotals, scopeMode, skillFamily, aggregate.snapshots || null)
    );
  }
  return aggregate.leaderboardCache.get(cacheKey);
}

// ---------------------------------------------------------------------------
// GET /home — Dashboard summary
// ---------------------------------------------------------------------------

router.get('/home', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    const week = ensureCurrentWeeklyChallengeWeek(db);

    const cacheKey = `home:${week.week_key}`;
    let publicData = getCached(cacheKey);

    if (!publicData) {
      const isFinalized = week.status === 'finalized';

      let awards = [];
      let challengePreviews = [];
      let participantCount = 0;

      if (isFinalized) {
        awards = db.prepare(
          'SELECT * FROM weekly_challenge_awards WHERE week_id = ? ORDER BY award_key, rank'
        ).all(week.id);
        awards = enrichFrozenWeeklyChallengeAwards(db, week.id, awards);

        const { charts, results } = getFrozenChartResults(db, week.id);
        challengePreviews = charts.slice(0, 4).map(c => ({
          ...c,
          top3: results[c.id]?.top3 || [],
          participantCount: results[c.id]?.participantCount || 0,
        }));

        const cnt = db.prepare(`
          SELECT COUNT(DISTINCT r.user_id) as cnt
          FROM weekly_challenge_results r
          JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
          WHERE wc.week_id = ?
        `).get(week.id);
        participantCount = cnt?.cnt || 0;
      } else {
        const agg = getLiveWeekAggregate(db, week);
        if (agg) {
          participantCount = agg.participantCount;
          const overallLb = getAggregateLeaderboard(agg, 'both', 'all');
          const singlesLb = getAggregateLeaderboard(agg, 'single', 'all');
          const doublesLb = getAggregateLeaderboard(agg, 'double', 'all');

          // Mock awards from live leaderboard for display
          const makeAwards = (key, label, lb) =>
            lb.slice(0, 3).map(e => ({
              award_key: key, award_label: label, rank: e.rank,
              user_id: e.user_id, username_snapshot: e.username,
              avatar_snapshot: e.avatar, nationality_snapshot: e.nationality,
              points: e.points, clears: e.clears,
              pg_bonus_points: e.pg_bonus_points || 0,
              pg_bonus_count: e.pg_bonus_count || 0,
            }));

          awards = [
            ...makeAwards('overall', 'Weekly Overall', overallLb),
            ...makeAwards('singles', 'Weekly Singles', singlesLb),
            ...makeAwards('doubles', 'Weekly Doubles', doublesLb),
          ];

          challengePreviews = agg.weeklyCharts.slice(0, 4).map(c => ({
            ...c,
            top3: agg.chartResults[c.id]?.top3 || [],
            participantCount: agg.chartResults[c.id]?.participantCount || 0,
          }));
        }
      }

      // Co-op summary tile — small payload so the dashboard can show
      // "Co-op WC is live, here are the picks + top 3" without hitting a
      // second endpoint. Wraps the same frozen/live readers but scoped to
      // division='coop' and capped at top-3 leaderboard rows.
      let coopSummary = null;
      try {
        if (week.status === 'finalized') {
          const frozen = getFrozenChartResults(db, week.id, 'coop');
          const coopLb = getFrozenLeaderboard(db, week.id, 'both', 'all', 'coop');
          const coopParticipantsRow = db.prepare(`
            SELECT COUNT(DISTINCT r.user_id) as cnt
            FROM weekly_challenge_results r
            JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
            WHERE wc.week_id = ? AND wc.division = 'coop'
          `).get(week.id);
          coopSummary = {
            chartCount: frozen.charts.length,
            participantCount: coopParticipantsRow?.cnt || 0,
            top3: coopLb.slice(0, 3),
          };
        } else {
          const coopAgg = getLiveWeekAggregate(db, week, 'coop');
          if (coopAgg) {
            coopSummary = {
              chartCount: coopAgg.weeklyCharts?.length || 0,
              participantCount: coopAgg.participantCount || 0,
              top3: getAggregateLeaderboard(coopAgg, 'both', 'all').slice(0, 3),
            };
          }
        }
      } catch (err) {
        console.error('[WeeklyChallenges] /home coopSummary error:', err.message);
      }

      publicData = {
        week: {
          week_key: week.week_key,
          starts_at_utc: week.starts_at_utc,
          ends_at_utc: week.ends_at_utc,
          status: week.status,
          chart_count: week.chart_count,
          challenge_max_level: week.challenge_max_level,
        },
        participantCount,
        awards,
        challengePreviews,
        coopSummary,
      };
      setCache(cacheKey, publicData);
    }

    // Compose viewer summary + personalized previews post-cache
    let viewerSummary = null;
    let viewerPreviews = null;
    if (req.user?.id) {
      const db2 = getDb();
      if (week.status === 'finalized') {
        viewerSummary = getViewerWeeklyBests(db2, week.id, req.user.id);
      } else {
        const agg = getLiveWeekAggregate(db2, week);
        if (agg) {
          viewerSummary = getActiveViewerBests(agg.userChartBests, req.user.id);
        }
      }

      // Pick viewer's lowest unplayed challenge charts
      const playedChartIds = new Set();
      if (viewerSummary?.bests) {
        for (const chartId of Object.keys(viewerSummary.bests)) {
          playedChartIds.add(Number(chartId));
        }
      }
      if (playedChartIds.size > 0) {
        const allCharts = db2.prepare(
          'SELECT * FROM weekly_challenge_charts WHERE week_id = ? ORDER BY sort_order'
        ).all(week.id);

        const unplayed = allCharts.filter(c => !playedChartIds.has(c.id));
        if (unplayed.length > 0) {
          viewerPreviews = unplayed.slice(0, 4).map(c => ({
            ...c, top3: [], participantCount: 0,
          }));
        }
      }
    }

    const response = { ...publicData, viewerSummary };
    if (viewerPreviews) response.challengePreviews = viewerPreviews;
    res.json(response);
  } catch (err) {
    console.error('[WeeklyChallenges] /home error:', err.message);
    res.status(500).json({ error: 'Failed to load weekly challenges' });
  }
});

// ---------------------------------------------------------------------------
// GET /weeks — Archive list
// ---------------------------------------------------------------------------

router.get('/weeks', (req, res) => {
  try {
    const db = getDb();
    ensureCurrentWeeklyChallengeWeek(db);

    let weeks = getCached('weeks:list');
    if (!weeks) {
      const rows = db.prepare(`
        SELECT w.*,
          (SELECT COUNT(DISTINCT s.user_id) FROM weekly_challenge_user_snapshots s WHERE s.week_id = w.id) as participant_count
        FROM weekly_challenge_weeks w
        ORDER BY w.week_key DESC
      `).all();

      weeks = rows.map(w => ({
        week_key: w.week_key,
        starts_at_utc: w.starts_at_utc,
        ends_at_utc: w.ends_at_utc,
        status: w.status,
        chart_count: w.chart_count,
        challenge_max_level: w.challenge_max_level,
        participant_count: w.participant_count,
      }));
      setCache('weeks:list', weeks);
    }

    res.json(weeks);
  } catch (err) {
    console.error('[WeeklyChallenges] /weeks error:', err.message);
    res.status(500).json({ error: 'Failed to load weeks' });
  }
});

// ---------------------------------------------------------------------------
// GET /week/current — Resolve current week without an extra redirect
// ---------------------------------------------------------------------------

router.get('/week/current', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    const week = ensureCurrentWeeklyChallengeWeek(db);
    return sendWeekDetail(req, res, week.week_key);
  } catch (err) {
    console.error('[WeeklyChallenges] /week/current error:', err.message);
    res.status(500).json({ error: 'Failed to resolve current week' });
  }
});

// ---------------------------------------------------------------------------
// GET /week/:weekKey — Full week detail
// ---------------------------------------------------------------------------

function sendWeekDetail(req, res, resolvedWeekKey = null) {
  try {
    const db = getDb();
    ensureCurrentWeeklyChallengeWeek(db);

    const weekKey = resolvedWeekKey || req.params.weekKey;
    // 'main' (S/D) is the default — pre-existing clients keep working without
    // touching the query string. 'coop' opts into the Co-op WC division.
    const division = String(req.query.division || 'main').trim().toLowerCase() === 'coop'
      ? 'coop'
      : 'main';
    const chartMode = req.query.chart_mode || 'both';
    const leaderboardMode = req.query.leaderboard_mode || 'both';
    const skillFamily = req.query.skill_family || 'all';

    const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
    if (!week) return res.status(404).json({ error: 'Week not found' });

    const cacheKey = `week:${weekKey}:${division}:${chartMode}:${leaderboardMode}:${skillFamily}`;
    let publicData = getCached(cacheKey);

    if (!publicData) {
      const isFinalized = week.status === 'finalized';
      let charts, chartResults, leaderboard, awards;

      if (isFinalized) {
        // Frozen readers are division-aware — for Co-op, weeks finalized
        // before the feature existed return empty arrays (no Co-op rows
        // were ever persisted) and the UI's empty state takes over.
        const frozen = getFrozenChartResults(db, week.id, division);
        charts = frozen.charts;
        chartResults = frozen.results;
        leaderboard = getFrozenLeaderboard(db, week.id, leaderboardMode, skillFamily, division);
        awards = db.prepare(
          'SELECT * FROM weekly_challenge_awards WHERE week_id = ? AND division = ? ORDER BY award_key, rank'
        ).all(week.id, division);
        awards = enrichFrozenWeeklyChallengeAwards(db, week.id, awards);
      } else {
        const agg = getLiveWeekAggregate(db, week, division);
        charts = agg?.weeklyCharts || [];
        chartResults = agg?.chartResults || {};
        leaderboard = agg ? getAggregateLeaderboard(agg, leaderboardMode, skillFamily) : [];

        // Live awards. Co-op has only one podium (no S/D split, no skill
        // family bucket) since every chart is CoOp.
        awards = [];
        if (agg) {
          const configs = division === 'coop'
            ? [{ key: 'coop', label: 'Weekly Co-Op', scope: 'both', family: 'all' }]
            : [
                { key: 'overall', label: 'Weekly Overall', scope: 'both', family: 'all' },
                { key: 'singles', label: 'Weekly Singles', scope: 'single', family: 'all' },
                { key: 'doubles', label: 'Weekly Doubles', scope: 'double', family: 'all' },
                { key: 'advanced', label: 'Weekly Advanced', scope: 'both', family: 'advanced' },
                { key: 'intermediate', label: 'Weekly Intermediate', scope: 'both', family: 'intermediate' },
              ];
          for (const cfg of configs) {
            const lb = getAggregateLeaderboard(agg, cfg.scope, cfg.family);
            for (const entry of lb.slice(0, 3)) {
              const snap = agg.snapshots?.[entry.user_id] || {};
              awards.push({
                award_key: cfg.key, award_label: cfg.label, rank: entry.rank,
                user_id: entry.user_id, points: entry.points, clears: entry.clears,
                pg_bonus_points: entry.pg_bonus_points || 0,
                pg_bonus_count: entry.pg_bonus_count || 0,
                total_score: entry.total_score, best_result_achieved_at: entry.best_result_achieved_at,
                username_snapshot: snap.username_snapshot || entry.username,
                avatar_snapshot: snap.avatar_snapshot || entry.avatar,
                nationality_snapshot: snap.nationality_snapshot || entry.nationality,
                skill_title_snapshot: snap.skill_title_snapshot || entry.skill_title,
              });
            }
          }
        }
      }

      // Filter charts by mode. `chart_mode` is meaningless for the Co-op
      // division (every chart is CoOp), so we skip filtering there and just
      // pass through whatever the aggregator already scoped.
      let filteredCharts = charts;
      if (division === 'main') {
        if (chartMode === 'single') {
          filteredCharts = charts.filter(c => c.mode === 'Single');
        } else if (chartMode === 'double') {
          filteredCharts = charts.filter(c => c.mode === 'Double');
        }
      }

      // Group charts by level
      const groupedByLevel = {};
      for (const c of filteredCharts) {
        if (!groupedByLevel[c.level]) groupedByLevel[c.level] = [];
        groupedByLevel[c.level].push({
          ...c,
          top3: chartResults[c.id]?.top3 || [],
          participantCount: chartResults[c.id]?.participantCount || 0,
          clearCount: chartResults[c.id]?.clearCount || 0,
        });
      }

      const participantCount = isFinalized
        ? (db.prepare(`
            SELECT COUNT(DISTINCT r.user_id) as cnt
            FROM weekly_challenge_results r
            JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
            WHERE wc.week_id = ?
          `).get(week.id)?.cnt || 0)
        : leaderboard.length;

      publicData = {
        week: {
          week_key: week.week_key,
          starts_at_utc: week.starts_at_utc,
          ends_at_utc: week.ends_at_utc,
          status: week.status,
          chart_count: week.chart_count,
          challenge_min_level: week.challenge_min_level,
          challenge_max_level: week.challenge_max_level,
        },
        division,
        awards,
        leaderboard,
        groupedByLevel,
        participantCount,
      };
      setCache(cacheKey, publicData);
    }

    // Compose viewer data post-cache. Now division-aware on both code paths.
    let viewerSummary = null;
    if (req.user?.id) {
      if (week.status === 'finalized') {
        viewerSummary = getViewerWeeklyBests(db, week.id, req.user.id, division);
      } else {
        const agg = getLiveWeekAggregate(db, week, division);
        if (agg) {
          viewerSummary = getActiveViewerBests(agg.userChartBests, req.user.id);
          // Also find viewer rank
          const lb = getAggregateLeaderboard(agg, 'both', 'all');
          const viewerEntry = lb.find(e => e.user_id === req.user.id);
          if (viewerSummary && viewerEntry) {
            viewerSummary.rank = viewerEntry.rank;
          }
        }
      }

      if (viewerSummary && week.status === 'finalized') {
        // Get viewer rank from frozen leaderboard, scoped to this division.
        const viewerLb = db.prepare(`
          SELECT rank FROM weekly_challenge_leaderboard
          WHERE week_id = ? AND user_id = ? AND scope_mode = 'both' AND division = ?
        `).get(week.id, req.user.id, division);
        if (viewerLb) viewerSummary.rank = viewerLb.rank;
      }
    }

    res.json({ ...publicData, viewerSummary });
  } catch (err) {
    console.error('[WeeklyChallenges] /week/:weekKey error:', err.message);
    res.status(500).json({ error: 'Failed to load week' });
  }
}

router.get('/week/:weekKey', optionalAuth, (req, res) => sendWeekDetail(req, res));

// ---------------------------------------------------------------------------
// GET /users/:userId/history — Profile tab
// ---------------------------------------------------------------------------

router.get('/users/:userId/history', (req, res) => {
  try {
    const db = getDb();
    const history = getUserWeeklyChallengeHistory(db, req.params.userId);
    res.json(history);
  } catch (err) {
    console.error('[WeeklyChallenges] /users/:userId/history error:', err.message);
    res.status(500).json({ error: 'Failed to load weekly challenge history' });
  }
});

// GET /users/:userId/week/:weekKey/personal — Personal summary for modal
// ---------------------------------------------------------------------------

router.get('/users/:userId/week/:weekKey/personal', (req, res) => {
  try {
    const db = getDb();
    const { userId, weekKey } = req.params;
    const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
    if (!week) return res.status(404).json({ error: 'Week not found' });
    if (week.status !== 'finalized') return res.status(400).json({ error: 'Week not yet finalized' });

    const { buildPersonalSummaries, formatWeekLabel } = require('../lib/weeklyChallengeSummary');
    const summaries = buildPersonalSummaries(db, week.id);
    const personal = summaries.find(s => String(s.userId) === String(userId));
    if (!personal) return res.status(404).json({ error: 'No data for this user/week' });

    res.json(personal.payload);
  } catch (err) {
    console.error('[WeeklyChallenges] personal summary error:', err.message);
    res.status(500).json({ error: 'Failed to load personal summary' });
  }
});

// GET /api/weekly-challenges/charts/:chartId/scores — full chart leaderboard
router.get('/charts/:chartId/scores', (req, res) => {
  try {
    const db = getDb();
    const chartId = parseInt(req.params.chartId);
    const chart = db.prepare(`
      SELECT wcc.*, w.week_key, w.starts_at_utc, w.ends_at_utc, w.status
      FROM weekly_challenge_charts wcc
      JOIN weekly_challenge_weeks w ON w.id = wcc.week_id
      WHERE wcc.id = ?
    `).get(chartId);
    if (!chart) return res.status(404).json({ error: 'Chart not found' });

    const aliases = getSongAliases();
    const targetChartKey = makeChartKey(chart.song_title_snapshot, chart.mode, chart.level, aliases);
    const candidateRows = db.prepare(`
      SELECT rp.id as play_id, rp.user_id, rp.song_title, rp.mode, rp.level, rp.score, rp.grade, rp.plate,
             rp.perfect, rp.great, rp.good, rp.bad, rp.miss, rp.max_combo,
             rp.background_url, rp.date_played, rp.played_at_utc,
             rp.replay_embed_url, rp.replay_video_id, rp.replay_start_seconds, rp.replay_end_seconds,
             rp.hr_avg, rp.hr_peak, rp.hr_min, rp.hr_series, rp.hr_source, rp.hr_duration_s,
             CASE WHEN rp.hr_avg > 0 OR rp.hr_peak > 0 THEN
               COALESCE(NULLIF(u.max_hr, 0),
                        (SELECT MAX(rp2.hr_peak) FROM user_recently_played rp2 WHERE rp2.user_id = rp.user_id AND rp2.hr_peak > 0),
                        190)
             ELSE 0 END AS hr_max,
             u.username, u.avatar, u.avatar_v, u.nationality, u.skill_title
      FROM user_recently_played rp
      JOIN users u ON rp.user_id = u.id
      WHERE rp.mode = ? AND rp.level = ?
        AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) >= ?
        AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) <= ?
      ORDER BY rp.id ASC
    `).all(chart.mode, chart.level, chart.starts_at_utc, chart.ends_at_utc);

    const matchedBgUrls = new Set(
      candidateRows
        .filter((row) => row.song_title === chart.song_title_snapshot && row.background_url)
        .map((row) => row.background_url)
    );

    const rows = candidateRows.filter((row) => {
      if (row.song_title === chart.song_title_snapshot) return true;
      const rowChartKey = makeChartKey(row.song_title, row.mode, row.level, aliases);
      if (targetChartKey && rowChartKey === targetChartKey) return true;
      return !!row.background_url && matchedBgUrls.has(row.background_url);
    });

    const attemptCounts = new Map();
    for (const row of rows) {
      const key = String(row.user_id || '').trim();
      if (!key) continue;
      attemptCounts.set(key, (attemptCounts.get(key) || 0) + 1);
    }

    const scoredRows = rows
      .filter((row) => (parseInt(row.score, 10) || 0) > 0)
      .sort((a, b) => {
        if ((parseInt(b.score, 10) || 0) !== (parseInt(a.score, 10) || 0)) {
          return (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0);
        }
        return (parseInt(a.play_id, 10) || 0) - (parseInt(b.play_id, 10) || 0);
      });

    // Keep only best per user
    const seen = new Set();
    const scores = [];
    for (const row of scoredRows) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      // Pass chart.mode so Co-op chart leaderboards use COOP_BASE_POINTS
      // (level=2/3/… isn't in the main LEVEL_BASE_POINTS table → would be 0).
      const ratingBreakdown = getWeeklyChallengeRatingBreakdown(chart.level, row.grade, row.score, row.plate, null, chart.mode);
      scores.push({
        ...row,
        rating_points: ratingBreakdown.ratingPoints,
        base_rating_points: ratingBreakdown.baseRatingPoints,
        pg_bonus_points: ratingBreakdown.pgBonusPoints,
        pg_bonus_percent: ratingBreakdown.pgBonusPercent,
        has_pg_bonus: ratingBreakdown.hasPgBonus,
        attempt_count: attemptCounts.get(row.user_id) || 0,
        rank: scores.length + 1,
      });
    }

    res.json({
      chart: {
        id: chart.id,
        song_title: chart.song_title_snapshot,
        artist: chart.artist_snapshot,
        mode: chart.mode,
        level: chart.level,
        jacket_url: chart.jacket_url_snapshot,
        week_key: chart.week_key,
      },
      total_attempts: rows.length,
      scores,
    });
  } catch (err) {
    console.error('[WeeklyChallenges] /charts/:chartId/scores error:', err.message);
    res.status(500).json({ error: 'Failed to load chart scores' });
  }
});

module.exports = router;

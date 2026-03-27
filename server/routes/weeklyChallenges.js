const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { optionalAuth } = require('./auth');
const {
  ensureCurrentWeeklyChallengeWeek,
  aggregateWeeklyResults,
  buildLeaderboard,
  getFrozenChartResults,
  getFrozenLeaderboard,
  getViewerWeeklyBests,
  getActiveViewerBests,
  getUserWeeklyChallengeHistory,
} = require('../lib/weeklyChallenges');

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
        const agg = aggregateWeeklyResults(db, week.id);
        if (agg) {
          participantCount = agg.participantCount;

          // Build overall leaderboard for podium
          const snapRows = db.prepare(
            'SELECT * FROM weekly_challenge_user_snapshots WHERE week_id = ?'
          ).all(week.id);
          const snapMap = {};
          for (const s of snapRows) snapMap[s.user_id] = s;

          const overallLb = buildLeaderboard(agg.userTotals, 'both', 'all', snapMap);
          const singlesLb = buildLeaderboard(agg.userTotals, 'single', 'all', snapMap);
          const doublesLb = buildLeaderboard(agg.userTotals, 'double', 'all', snapMap);

          // Mock awards from live leaderboard for display
          const makeAwards = (key, label, lb) =>
            lb.slice(0, 3).map(e => ({
              award_key: key, award_label: label, rank: e.rank,
              user_id: e.user_id, username_snapshot: e.username,
              avatar_snapshot: e.avatar, nationality_snapshot: e.nationality,
              points: e.points, clears: e.clears,
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
      };
      setCache(cacheKey, publicData);
    }

    // Compose viewer summary post-cache
    let viewerSummary = null;
    if (req.user?.id) {
      const db2 = getDb();
      if (week.status === 'finalized') {
        viewerSummary = getViewerWeeklyBests(db2, week.id, req.user.id);
      } else {
        const agg = aggregateWeeklyResults(db2, week.id);
        if (agg) {
          viewerSummary = getActiveViewerBests(agg.userChartBests, req.user.id);
        }
      }
    }

    res.json({ ...publicData, viewerSummary });
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

    const weeks = db.prepare(`
      SELECT w.*,
        (SELECT COUNT(DISTINCT s.user_id) FROM weekly_challenge_user_snapshots s WHERE s.week_id = w.id) as participant_count
      FROM weekly_challenge_weeks w
      ORDER BY w.week_key DESC
    `).all();

    res.json(weeks.map(w => ({
      week_key: w.week_key,
      starts_at_utc: w.starts_at_utc,
      ends_at_utc: w.ends_at_utc,
      status: w.status,
      chart_count: w.chart_count,
      challenge_max_level: w.challenge_max_level,
      participant_count: w.participant_count,
    })));
  } catch (err) {
    console.error('[WeeklyChallenges] /weeks error:', err.message);
    res.status(500).json({ error: 'Failed to load weeks' });
  }
});

// ---------------------------------------------------------------------------
// GET /week/current — Redirect to current week key
// ---------------------------------------------------------------------------

router.get('/week/current', (req, res) => {
  try {
    const db = getDb();
    const week = ensureCurrentWeeklyChallengeWeek(db);
    res.redirect(`/api/weekly-challenges/week/${week.week_key}${req._parsedUrl.search || ''}`);
  } catch (err) {
    console.error('[WeeklyChallenges] /week/current error:', err.message);
    res.status(500).json({ error: 'Failed to resolve current week' });
  }
});

// ---------------------------------------------------------------------------
// GET /week/:weekKey — Full week detail
// ---------------------------------------------------------------------------

router.get('/week/:weekKey', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    ensureCurrentWeeklyChallengeWeek(db);

    const { weekKey } = req.params;
    const chartMode = req.query.chart_mode || 'both';
    const leaderboardMode = req.query.leaderboard_mode || 'both';
    const skillFamily = req.query.skill_family || 'all';

    const week = db.prepare('SELECT * FROM weekly_challenge_weeks WHERE week_key = ?').get(weekKey);
    if (!week) return res.status(404).json({ error: 'Week not found' });

    const cacheKey = `week:${weekKey}:${chartMode}:${leaderboardMode}:${skillFamily}`;
    let publicData = getCached(cacheKey);

    if (!publicData) {
      const isFinalized = week.status === 'finalized';
      let charts, chartResults, leaderboard, awards;

      if (isFinalized) {
        const frozen = getFrozenChartResults(db, week.id);
        charts = frozen.charts;
        chartResults = frozen.results;
        leaderboard = getFrozenLeaderboard(db, week.id, leaderboardMode, skillFamily);
        awards = db.prepare(
          'SELECT * FROM weekly_challenge_awards WHERE week_id = ? ORDER BY award_key, rank'
        ).all(week.id);
      } else {
        const agg = aggregateWeeklyResults(db, week.id);
        charts = agg?.weeklyCharts || [];
        chartResults = agg?.chartResults || {};

        const snapRows = db.prepare(
          'SELECT * FROM weekly_challenge_user_snapshots WHERE week_id = ?'
        ).all(week.id);
        const snapMap = {};
        for (const s of snapRows) snapMap[s.user_id] = s;

        leaderboard = agg ? buildLeaderboard(agg.userTotals, leaderboardMode, skillFamily, snapMap) : [];

        // Live awards
        awards = [];
        if (agg) {
          const configs = [
            { key: 'overall', label: 'Weekly Overall', scope: 'both', family: 'all' },
            { key: 'singles', label: 'Weekly Singles', scope: 'single', family: 'all' },
            { key: 'doubles', label: 'Weekly Doubles', scope: 'double', family: 'all' },
            { key: 'advanced', label: 'Weekly Advanced', scope: 'both', family: 'advanced' },
            { key: 'intermediate', label: 'Weekly Intermediate', scope: 'both', family: 'intermediate' },
          ];
          for (const cfg of configs) {
            const lb = buildLeaderboard(agg.userTotals, cfg.scope, cfg.family, snapMap);
            for (const entry of lb.slice(0, 3)) {
              const snap = snapMap[entry.user_id] || {};
              awards.push({
                award_key: cfg.key, award_label: cfg.label, rank: entry.rank,
                user_id: entry.user_id, points: entry.points, clears: entry.clears,
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

      // Filter charts by mode
      let filteredCharts = charts;
      if (chartMode === 'single') {
        filteredCharts = charts.filter(c => c.mode === 'Single');
      } else if (chartMode === 'double') {
        filteredCharts = charts.filter(c => c.mode === 'Double');
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
        awards,
        leaderboard,
        groupedByLevel,
        participantCount,
      };
      setCache(cacheKey, publicData);
    }

    // Compose viewer data post-cache
    let viewerSummary = null;
    if (req.user?.id) {
      if (week.status === 'finalized') {
        viewerSummary = getViewerWeeklyBests(db, week.id, req.user.id);
      } else {
        const agg = aggregateWeeklyResults(db, week.id);
        if (agg) {
          viewerSummary = getActiveViewerBests(agg.userChartBests, req.user.id);
          // Also find viewer rank
          const snapRows = db.prepare(
            'SELECT * FROM weekly_challenge_user_snapshots WHERE week_id = ?'
          ).all(week.id);
          const snapMap = {};
          for (const s of snapRows) snapMap[s.user_id] = s;
          const lb = buildLeaderboard(agg.userTotals, 'both', 'all', snapMap);
          const viewerEntry = lb.find(e => e.user_id === req.user.id);
          if (viewerSummary && viewerEntry) {
            viewerSummary.rank = viewerEntry.rank;
          }
        }
      }

      if (viewerSummary && week.status === 'finalized') {
        // Get viewer rank from frozen leaderboard
        const viewerLb = db.prepare(`
          SELECT rank FROM weekly_challenge_leaderboard
          WHERE week_id = ? AND user_id = ? AND scope_mode = 'both'
        `).get(week.id, req.user.id);
        if (viewerLb) viewerSummary.rank = viewerLb.rank;
      }
    }

    res.json({ ...publicData, viewerSummary });
  } catch (err) {
    console.error('[WeeklyChallenges] /week/:weekKey error:', err.message);
    res.status(500).json({ error: 'Failed to load week' });
  }
});

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

module.exports = router;

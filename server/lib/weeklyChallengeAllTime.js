// Weekly Challenges — all-time summary aggregates.
//
// Reads the *frozen* tables (weekly_challenge_results / _awards / _weeks) that
// finalizeWeek() persists once a week closes, and rolls them up into a
// hall-of-fame across every finalized week. Player identity is resolved live
// from the users table (so avatars/usernames stay current), falling back to
// the most recent per-week snapshot for anyone who has since been deleted.
//
// Note: weekly_challenge_results only ever holds *passes* — the aggregator
// drops fails (resolved grade 'F') before freezing — so a result row is by
// definition a cleared chart. That's why "songs cleared" is just COUNT(*).

const LIST_LIMIT = 15;      // rows per leaderboard card
const TOP_PLAYS_LIMIT = 20; // hero list of best individual plays

/**
 * Resolve display identity for a set of user ids. Prefers the live users row
 * (current username + avatar), falling back to the newest weekly snapshot for
 * deleted accounts so historical boards never show a blank row.
 */
function resolveIdentities(db, userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  const out = {};
  if (ids.length === 0) return out;

  const ph = ids.map(() => '?').join(',');
  const liveRows = db.prepare(
    `SELECT id, username, avatar, avatar_v, nationality, skill_title FROM users WHERE id IN (${ph})`,
  ).all(...ids);
  for (const r of liveRows) {
    out[r.id] = {
      user_id: r.id,
      username: r.username || 'Player',
      avatar: r.avatar || '',
      avatar_v: r.avatar_v || 0,
      nationality: r.nationality || '',
      skill_title: r.skill_title || '',
    };
  }

  const missing = ids.filter((id) => !out[id]);
  if (missing.length > 0) {
    const ph2 = missing.map(() => '?').join(',');
    // Newest snapshot first so the first row we keep per user is the freshest.
    const snapRows = db.prepare(`
      SELECT s.user_id, s.username_snapshot, s.avatar_snapshot,
             s.nationality_snapshot, s.skill_title_snapshot
      FROM weekly_challenge_user_snapshots s
      WHERE s.user_id IN (${ph2})
      ORDER BY s.week_id DESC
    `).all(...missing);
    for (const r of snapRows) {
      if (out[r.user_id]) continue;
      out[r.user_id] = {
        user_id: r.user_id,
        username: r.username_snapshot || 'Player',
        avatar: r.avatar_snapshot || '',
        avatar_v: 0,
        nationality: r.nationality_snapshot || '',
        skill_title: r.skill_title_snapshot || '',
      };
    }
  }
  return out;
}

/** Attach resolved identity to a list of {user_id, ...} rows, dropping any
 *  row whose user can't be identified at all (shouldn't happen). */
function withIdentity(rows, identities) {
  return rows
    .map((row) => {
      const id = identities[String(row.user_id)];
      if (!id) return null;
      return { ...id, ...row };
    })
    .filter(Boolean);
}

/** Run one grouped-by-user leaderboard query and shape it. `extraSelect`
 *  lets a card carry a secondary number (e.g. chart count) alongside value. */
function userLeaderboard(db, { valueExpr, extraSelect = '', join = '', where = '', limit = LIST_LIMIT }) {
  const rows = db.prepare(`
    SELECT r.user_id AS user_id, ${valueExpr} AS value${extraSelect ? `, ${extraSelect}` : ''}
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts c ON c.id = r.weekly_chart_id
    ${join}
    ${where ? `WHERE ${where}` : ''}
    GROUP BY r.user_id
    HAVING value > 0
    ORDER BY value DESC, r.user_id ASC
    LIMIT ${limit}
  `).all();
  return rows;
}

/** Wins / podiums come off the frozen awards table, not results. */
function awardLeaderboard(db, { where, limit = LIST_LIMIT }) {
  return db.prepare(`
    SELECT a.user_id AS user_id, COUNT(*) AS value
    FROM weekly_challenge_awards a
    WHERE ${where}
    GROUP BY a.user_id
    HAVING value > 0
    ORDER BY value DESC, a.user_id ASC
    LIMIT ${limit}
  `).all();
}

function buildWeeklyChallengeAllTimeSummary(db) {
  // ---- Totals banner -----------------------------------------------------
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM weekly_challenge_weeks WHERE status = 'finalized') AS weeks,
      (SELECT COUNT(DISTINCT user_id) FROM weekly_challenge_results) AS players,
      (SELECT COUNT(*) FROM weekly_challenge_results) AS charts_cleared,
      (SELECT COALESCE(SUM(rating_points), 0) FROM weekly_challenge_results) AS rating_points,
      (SELECT COALESCE(SUM(perfect), 0) FROM weekly_challenge_results) AS perfects,
      (SELECT COUNT(*) FROM weekly_challenge_results WHERE resolved_grade = 'SSS+') AS sss_plus
  `).get() || {};

  // ---- Top individual plays (hero list) ----------------------------------
  const topPlaysRaw = db.prepare(`
    SELECT r.user_id, r.score, r.resolved_grade AS grade, r.plate, r.rating_points,
           r.perfect, r.great, r.good, r.bad, r.miss,
           c.song_title_snapshot AS song_title, c.mode, c.level,
           c.jacket_url_snapshot AS jacket_url,
           w.week_key
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts c ON c.id = r.weekly_chart_id
    JOIN weekly_challenge_weeks w ON w.id = c.week_id
    ORDER BY r.rating_points DESC, r.score DESC, r.id ASC
    LIMIT ${TOP_PLAYS_LIMIT}
  `).all();

  // ---- Grouped-by-user leaderboards --------------------------------------
  const mostRatingPoints = userLeaderboard(db, {
    valueExpr: 'SUM(r.rating_points)',
    extraSelect: 'COUNT(*) AS charts',
  });
  const mostSongsCleared = userLeaderboard(db, {
    valueExpr: 'COUNT(*)',
    extraSelect: "SUM(CASE WHEN r.resolved_grade = 'SSS+' THEN 1 ELSE 0 END) AS sss_plus",
  });
  const mostPerfects = userLeaderboard(db, {
    valueExpr: 'SUM(r.perfect)',
    extraSelect: 'COUNT(*) AS charts',
  });
  // "Most SSS+" ranks strictly on the top SSS+ grade; the `sss` extra carries
  // the plain-SSS count so the card can show the breakdown beneath it.
  const mostSSS = userLeaderboard(db, {
    valueExpr: "SUM(CASE WHEN r.resolved_grade = 'SSS+' THEN 1 ELSE 0 END)",
    extraSelect: "SUM(CASE WHEN r.resolved_grade = 'SSS' THEN 1 ELSE 0 END) AS sss",
  });
  const mostPerfectGames = userLeaderboard(db, {
    valueExpr: "SUM(CASE WHEN r.plate = 'PG' THEN 1 ELSE 0 END)",
    extraSelect: 'COUNT(*) AS charts',
  });
  const mostChallenges = userLeaderboard(db, {
    valueExpr: 'COUNT(DISTINCT c.week_id)',
    extraSelect: 'SUM(r.rating_points) AS points',
  });

  // ---- Wins & podiums (frozen awards) ------------------------------------
  const winsOverall = awardLeaderboard(db, { where: "a.rank = 1 AND a.division = 'main' AND a.award_key = 'overall'" });
  const winsSingles = awardLeaderboard(db, { where: "a.rank = 1 AND a.division = 'main' AND a.award_key = 'singles'" });
  const winsDoubles = awardLeaderboard(db, { where: "a.rank = 1 AND a.division = 'main' AND a.award_key = 'doubles'" });
  const mostPodiums = awardLeaderboard(db, {
    where: "a.rank <= 3 AND a.division = 'main' AND a.award_key IN ('overall','singles','doubles')",
  });

  // ---- Resolve identities in one pass -------------------------------------
  const allIds = [
    ...topPlaysRaw, ...mostRatingPoints, ...mostSongsCleared, ...mostPerfects,
    ...mostSSS, ...mostPerfectGames, ...mostChallenges,
    ...winsOverall, ...winsSingles, ...winsDoubles, ...mostPodiums,
  ].map((r) => r.user_id);
  const identities = resolveIdentities(db, allIds);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      weeks: totals.weeks || 0,
      players: totals.players || 0,
      chartsCleared: totals.charts_cleared || 0,
      ratingPoints: totals.rating_points || 0,
      perfects: totals.perfects || 0,
      sssPlus: totals.sss_plus || 0,
    },
    topPlays: withIdentity(topPlaysRaw, identities),
    mostRatingPoints: withIdentity(mostRatingPoints, identities),
    mostSongsCleared: withIdentity(mostSongsCleared, identities),
    mostPerfects: withIdentity(mostPerfects, identities),
    mostSSS: withIdentity(mostSSS, identities),
    mostPerfectGames: withIdentity(mostPerfectGames, identities),
    mostChallenges: withIdentity(mostChallenges, identities),
    wins: {
      overall: withIdentity(winsOverall, identities),
      singles: withIdentity(winsSingles, identities),
      doubles: withIdentity(winsDoubles, identities),
    },
    mostPodiums: withIdentity(mostPodiums, identities),
  };
}

module.exports = { buildWeeklyChallengeAllTimeSummary };

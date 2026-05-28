#!/usr/bin/env node
/**
 * De-duplicate the songs catalog.
 *
 * The catalog accumulated mixed-case duplicate chart rows: the same
 * (title, mode, level) chart inserted twice under different capitalizations
 * — once by the seed (from pump-phoenix.json, low id, authoritative jacket)
 * and once by backfill-songs-catalog.js (from a user play's scraped title,
 * high id, a piugame-downloaded jacket). e.g.:
 *   "God Mode feat. Skizzo"  (seed)     vs  "God Mode feat. skizzo"  (backfill)
 *
 * The Songs page already groups these so users never see both, and chart
 * lookups resolve via the normalized fallback in activityPostEnrichment, so
 * this is catalog hygiene — but it keeps the exact-match path honest and
 * shrinks the table.
 *
 * Dedup key:  REPLACE(REPLACE(LOWER(TRIM(title)),'  ',' '),'  ',' ') | mode | level
 * Keeper:     MIN(id) within the key. This is exactly the row getSongCatalog
 *             already displays — it orders by `title COLLATE NOCASE, ..., id ASC`,
 *             so the lowest id wins — AND it's the authoritative seed jacket.
 *             So dedup causes ZERO visible change.
 *
 * Before deleting losers we repoint every chart_id reference (loser -> keeper)
 * so nothing dangles. weekly_challenge_charts has a hard FK (no cascade) plus
 * UNIQUE(week_id, chart_id); we UPDATE OR IGNORE then drop any leftover loser
 * ref (the keeper already covers that week). WC display uses *_snapshot
 * columns, so even repointed past weeks are visually unaffected.
 *
 * Run on prod:
 *   node server/scripts/dedupe-songs-catalog.js          # dry run
 *   node server/scripts/dedupe-songs-catalog.js --apply  # do the writes
 *
 * ALWAYS take a DB backup before --apply.
 */
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || '/var/data/shinsa/shinsa.db';
const APPLY = process.argv.includes('--apply');

// Every table that stores a songs.id in a chart_id column. Repointed
// loser -> keeper before the loser row is deleted. We probe sqlite_master
// so a table missing on an older DB is simply skipped.
const REPOINT_TABLES = [
  'chart_tiers',
  'chart_skills',
  'user_chart_feedback',
  'user_song_of_week_picks',
  'weekly_challenge_charts',
  'user_chart_youtube_links',
  'user_list_items',
  'live_session_requests',
  'live_session_vote_options',
];

function tableExists(db, name) {
  return !!db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`
  ).get(name);
}

function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN'} (pass --apply to commit)`);
  console.log(`db:   ${DB_PATH}\n`);

  const db = new Database(DB_PATH, { readonly: !APPLY });
  db.pragma('foreign_keys = ON');

  // loser_id -> keeper_id for every mixed-case / whitespace chart duplicate.
  const pairs = db.prepare(`
    WITH norm AS (
      SELECT id, mode, level,
             REPLACE(REPLACE(LOWER(TRIM(title)),'  ',' '),'  ',' ') AS nt
      FROM songs
    ),
    keys AS (
      SELECT nt, mode, level, MIN(id) AS keeper_id, COUNT(*) AS c
      FROM norm GROUP BY nt, mode, level HAVING c > 1
    )
    SELECT n.id AS loser_id, k.keeper_id, k.nt, n.mode, n.level
    FROM norm n
    JOIN keys k ON n.nt = k.nt AND n.mode = k.mode AND n.level = k.level
    WHERE n.id <> k.keeper_id
    ORDER BY k.keeper_id, n.id
  `).all();

  console.log(`Duplicate loser rows to remove: ${pairs.length}`);
  if (pairs.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const presentTables = REPOINT_TABLES.filter((t) => tableExists(db, t));

  // Report reference exposure up front.
  console.log('\nReference repoints (loser -> keeper) per table:');
  const loserIds = pairs.map((p) => p.loser_id);
  const loserCsv = loserIds.join(',');
  for (const t of presentTables) {
    const n = db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE chart_id IN (${loserCsv})`).get().c;
    if (n > 0) console.log(`  ${t}: ${n}`);
  }

  if (!APPLY) {
    console.log('\nSample of planned removals (first 20):');
    for (const p of pairs.slice(0, 20)) {
      console.log(`  drop id ${p.loser_id} -> keep ${p.keeper_id}   [${p.nt} | ${p.mode} | ${p.level}]`);
    }
    console.log(`\nDRY RUN — no changes written. Re-run with --apply (after a backup).`);
    return;
  }

  const repointStmts = new Map(
    presentTables.map((t) => [t, db.prepare(`UPDATE OR IGNORE ${t} SET chart_id = ? WHERE chart_id = ?`)])
  );
  // weekly_challenge_charts has a hard FK with no cascade; any leftover loser
  // ref (skipped by OR IGNORE due to UNIQUE(week_id,chart_id)) must be dropped
  // so the songs DELETE doesn't fail. Keeper already covers that week.
  const dropLeftoverWc = tableExists(db, 'weekly_challenge_charts')
    ? db.prepare('DELETE FROM weekly_challenge_charts WHERE chart_id = ?')
    : null;
  const deleteSong = db.prepare('DELETE FROM songs WHERE id = ?');

  const stats = { repointed: {}, leftoverWcDropped: 0, deleted: 0 };

  const run = db.transaction(() => {
    for (const { loser_id, keeper_id } of pairs) {
      for (const t of presentTables) {
        const info = repointStmts.get(t).run(keeper_id, loser_id);
        if (info.changes > 0) stats.repointed[t] = (stats.repointed[t] || 0) + info.changes;
      }
      if (dropLeftoverWc) {
        const left = dropLeftoverWc.run(loser_id);
        stats.leftoverWcDropped += left.changes;
      }
      const del = deleteSong.run(loser_id);
      stats.deleted += del.changes;
    }
  });
  run();

  console.log('\nApplied:');
  for (const [t, n] of Object.entries(stats.repointed)) console.log(`  repointed ${t}: ${n}`);
  if (stats.leftoverWcDropped) console.log(`  dropped conflicting WC refs: ${stats.leftoverWcDropped}`);
  console.log(`  deleted song rows: ${stats.deleted}`);

  // Post-condition: no normalized chart-key collisions remain.
  const remaining = db.prepare(`
    SELECT COUNT(*) AS c FROM (
      SELECT 1 FROM songs
      GROUP BY REPLACE(REPLACE(LOWER(TRIM(title)),'  ',' '),'  ',' '), mode, level
      HAVING COUNT(*) > 1
    )
  `).get().c;
  console.log(`\nRemaining duplicate chart-keys after dedup: ${remaining}`);
  if (remaining !== 0) {
    throw new Error('Dedup left residual duplicates — investigate before trusting the result.');
  }
  console.log('OK.');
}

main();

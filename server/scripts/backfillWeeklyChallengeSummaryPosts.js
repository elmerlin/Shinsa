const { getDb } = require('../db/schema');
const { buildWeeklyChallengeSummary } = require('../lib/weeklyChallengeSummary');
const { serializeWcSummaryMarker } = require('../lib/weeklyChallengeSummaryMarker');

function main() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, source_week_id, target_week_id, content, content_hash
    FROM user_posts
    WHERE post_kind = 'weekly_challenge_summary'
    ORDER BY id ASC
  `).all();

  const updatePost = db.prepare(`
    UPDATE user_posts
    SET content = ?, content_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  let updated = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      const result = buildWeeklyChallengeSummary(db, row.source_week_id, row.target_week_id || null);
      if (!result) {
        skipped += 1;
        continue;
      }

      const nextContent = serializeWcSummaryMarker(result.payload);
      const nextHash = result.contentHash;
      if (nextContent === row.content && nextHash === row.content_hash) {
        skipped += 1;
        continue;
      }

      updatePost.run(nextContent, nextHash, row.id);
      updated += 1;
    }
  });

  tx();

  console.log(JSON.stringify({
    scanned_summary_posts: rows.length,
    updated_summary_posts: updated,
    skipped_summary_posts: skipped,
  }, null, 2));
}

main();

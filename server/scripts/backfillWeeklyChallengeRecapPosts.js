const { getDb } = require('../db/schema');
const { buildWeeklyChallengeSummary, buildPersonalSummaries } = require('../lib/weeklyChallengeSummary');
const { serializeWcSummaryMarker } = require('../lib/weeklyChallengeSummaryMarker');
const { serializeWcPersonalMarker } = require('../lib/weeklyChallengePersonalMarker');

function main() {
  const db = getDb();

  const summaryRows = db.prepare(`
    SELECT id, source_week_id, target_week_id, content, content_hash
    FROM user_posts
    WHERE post_kind = 'weekly_challenge_summary'
    ORDER BY id ASC
  `).all();

  const personalRows = db.prepare(`
    SELECT id, user_id, source_week_id, target_week_id, content, content_hash
    FROM user_posts
    WHERE post_kind = 'weekly_challenge_personal'
    ORDER BY id ASC
  `).all();

  const updatePost = db.prepare(`
    UPDATE user_posts
    SET content = ?, content_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  let updatedSummaryPosts = 0;
  let skippedSummaryPosts = 0;
  let updatedPersonalPosts = 0;
  let skippedPersonalPosts = 0;

  const personalCache = new Map();

  const tx = db.transaction(() => {
    for (const row of summaryRows) {
      const result = buildWeeklyChallengeSummary(db, row.source_week_id, row.target_week_id || null);
      if (!result) {
        skippedSummaryPosts += 1;
        continue;
      }

      const nextContent = serializeWcSummaryMarker(result.payload);
      const nextHash = result.contentHash;
      if (nextContent === row.content && nextHash === row.content_hash) {
        skippedSummaryPosts += 1;
        continue;
      }

      updatePost.run(nextContent, nextHash, row.id);
      updatedSummaryPosts += 1;
    }

    for (const row of personalRows) {
      const cacheKey = `${row.source_week_id}|${row.target_week_id || 0}`;
      let summariesByUser = personalCache.get(cacheKey);
      if (!summariesByUser) {
        const summaries = buildPersonalSummaries(db, row.source_week_id);
        summariesByUser = new Map(summaries.map((entry) => [String(entry.userId), entry]));
        personalCache.set(cacheKey, summariesByUser);
      }

      const summary = summariesByUser.get(String(row.user_id));
      if (!summary) {
        skippedPersonalPosts += 1;
        continue;
      }

      const nextContent = serializeWcPersonalMarker(summary.payload);
      const nextHash = summary.contentHash;
      if (nextContent === row.content && nextHash === row.content_hash) {
        skippedPersonalPosts += 1;
        continue;
      }

      updatePost.run(nextContent, nextHash, row.id);
      updatedPersonalPosts += 1;
    }
  });

  tx();

  console.log(JSON.stringify({
    scanned_summary_posts: summaryRows.length,
    updated_summary_posts: updatedSummaryPosts,
    skipped_summary_posts: skippedSummaryPosts,
    scanned_personal_posts: personalRows.length,
    updated_personal_posts: updatedPersonalPosts,
    skipped_personal_posts: skippedPersonalPosts,
  }, null, 2));
}

main();

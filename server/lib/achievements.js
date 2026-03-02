/**
 * Check and award pump-received achievements for a user after they get a pump.
 * Counts ALL pump types: post, upscore, clear, comment, community post, community comment.
 * Wrapped in try/catch so it never breaks the pump flow.
 */
function checkPumpAchievements(db, contentOwnerId) {
  try {
    const series = db.prepare("SELECT id FROM achievement_series WHERE key = 'pumps_received'").get();
    if (!series) return;

    const tiers = db.prepare('SELECT id, threshold FROM achievement_tiers WHERE series_id = ? ORDER BY threshold ASC').all(series.id);
    if (!tiers.length) return;

    const pumpResult = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM post_pumps pp JOIN user_posts up ON pp.post_id = up.id WHERE up.user_id = ?) +
        (SELECT COUNT(*) FROM upscore_pumps usp JOIN user_upscores us ON usp.upscore_id = us.id WHERE us.user_id = ?) +
        (SELECT COUNT(*) FROM new_clear_pumps ncp JOIN user_new_clears nc ON ncp.clear_id = nc.id WHERE nc.user_id = ?) +
        (SELECT COUNT(*) FROM comment_pumps cp JOIN post_comments pc ON cp.comment_type = 'post' AND cp.comment_id = pc.id WHERE pc.user_id = ?) +
        (SELECT COUNT(*) FROM comment_pumps cp JOIN upscore_comments uc ON cp.comment_type = 'upscore' AND cp.comment_id = uc.id WHERE uc.user_id = ?) +
        (SELECT COUNT(*) FROM comment_pumps cp JOIN new_clear_comments ncc ON cp.comment_type = 'clear' AND cp.comment_id = ncc.id WHERE ncc.user_id = ?) +
        (SELECT COUNT(*) FROM community_post_pumps cpp JOIN community_posts cpo ON cpp.post_id = cpo.id WHERE cpo.user_id = ?) +
        (SELECT COUNT(*) FROM community_comment_pumps ccp JOIN community_post_comments cpc ON ccp.comment_id = cpc.id WHERE cpc.user_id = ?)
        AS total
    `).get(contentOwnerId, contentOwnerId, contentOwnerId, contentOwnerId, contentOwnerId, contentOwnerId, contentOwnerId, contentOwnerId);
    const totalPumps = pumpResult?.total || 0;

    for (const tier of tiers) {
      if (totalPumps >= tier.threshold) {
        db.prepare("INSERT OR IGNORE INTO achievement_awards (tier_id, user_id, awarded_at) VALUES (?, ?, datetime('now'))").run(tier.id, contentOwnerId);
      }
    }
  } catch { /* achievement check should never break pump flow */ }
}

module.exports = { checkPumpAchievements };

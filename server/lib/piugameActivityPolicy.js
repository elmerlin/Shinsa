function toCount(value) {
  return Math.max(0, parseInt(value, 10) || 0);
}

function hasTimestamp(value) {
  return String(value || '').trim().length > 0;
}

function isInitialBestScoreImport(syncRow, existingBestScoreCount = 0) {
  const imported = toCount(syncRow?.best_scores_imported) === 1;
  return !imported
    && !hasTimestamp(syncRow?.last_best_scores_sync)
    && toCount(existingBestScoreCount) === 0;
}

function isInitialRecentlyPlayedSync(syncRow, existingRecentPlayCount = 0) {
  return !hasTimestamp(syncRow?.last_recently_played_sync)
    && toCount(existingRecentPlayCount) === 0;
}

function getPiugameActivityPostingPolicy(options = {}) {
  const initialSync = !!(options.initialBestScoreImport || options.initialRecentlyPlayedSync);
  return {
    allowUpscorePosts: !initialSync,
    allowNewClearPosts: !initialSync,
    allowWeeklyChallengePosts: !initialSync,
    onlyLatestTitle: initialSync,
  };
}

function selectTitleUnlocksForPosting(unlockedTitles, options = {}) {
  const titles = Array.isArray(unlockedTitles) ? unlockedTitles.filter(Boolean) : [];
  if (!options.onlyLatest || titles.length <= 1) return titles;
  return [titles[titles.length - 1]];
}

module.exports = {
  getPiugameActivityPostingPolicy,
  isInitialBestScoreImport,
  isInitialRecentlyPlayedSync,
  selectTitleUnlocksForPosting,
};

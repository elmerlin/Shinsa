const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPiugameActivityPostingPolicy,
  isInitialBestScoreImport,
  isInitialRecentlyPlayedSync,
  selectTitleUnlocksForPosting,
} = require('./piugameActivityPolicy');

test('initial best-score import suppresses bulk activity posts', () => {
  assert.equal(isInitialBestScoreImport({
    best_scores_imported: 0,
    last_best_scores_sync: '',
  }, 0), true);

  assert.deepEqual(
    getPiugameActivityPostingPolicy({ initialBestScoreImport: true }),
    {
      allowUpscorePosts: false,
      allowNewClearPosts: false,
      allowWeeklyChallengePosts: false,
      onlyLatestTitle: true,
    }
  );
});

test('existing sync history keeps normal activity posting enabled', () => {
  assert.equal(isInitialBestScoreImport({
    best_scores_imported: 1,
    last_best_scores_sync: '2026-04-05 12:00:00',
  }, 40), false);

  assert.equal(isInitialRecentlyPlayedSync({
    last_recently_played_sync: '2026-04-05 12:00:00',
  }, 80), false);

  assert.deepEqual(
    getPiugameActivityPostingPolicy({}),
    {
      allowUpscorePosts: true,
      allowNewClearPosts: true,
      allowWeeklyChallengePosts: true,
      onlyLatestTitle: false,
    }
  );
});

test('first recently-played sync also suppresses bulk activity posts', () => {
  assert.equal(isInitialRecentlyPlayedSync({
    last_recently_played_sync: '',
  }, 0), true);
});

test('title posting can collapse to only the latest unlocked title', () => {
  const titles = [{ name: 'Intermediate Lv.4' }, { name: 'Intermediate Lv.5' }, { name: 'Intermediate Lv.6' }];

  assert.deepEqual(
    selectTitleUnlocksForPosting(titles, { onlyLatest: true }),
    [{ name: 'Intermediate Lv.6' }]
  );

  assert.deepEqual(
    selectTitleUnlocksForPosting(titles, { onlyLatest: false }),
    titles
  );
});

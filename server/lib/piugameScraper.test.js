const test = require('node:test');
const assert = require('node:assert/strict');

const {
  setLanguage,
  scrapePumbility,
  scrapePlayDataLevelSummaries,
  scrapeBestScores,
  scrapeTopSongs,
  scrapeRecentlyPlayed,
} = require('./piugameScraper');

function createRecordingClient() {
  const calls = [];

  return {
    calls,
    async get(url, config = {}) {
      calls.push({ method: 'GET', url, config });
      return { data: '<html><body><div class="no_con"></div></body></html>' };
    },
    async post(url, data, config = {}) {
      calls.push({ method: 'POST', url, data, config });
      if (url.includes('/ajax/language_update.php')) {
        return { data: { status: 200 } };
      }
      return { data: '' };
    },
  };
}

test('live PIUGame scraper requests use the Phoenix host', async () => {
  const client = createRecordingClient();

  await setLanguage(client, 'en');
  await scrapePumbility(client);
  await scrapePlayDataLevelSummaries(client, ['10']);
  await scrapeBestScores(client);
  await scrapeTopSongs(client, { date: '202602', lang: '', maxPages: 1, delayMs: 0 });
  await scrapeRecentlyPlayed(client);

  const piugameCalls = client.calls.filter((call) => call.url.includes('piugame.com'));
  assert.ok(piugameCalls.length > 0, 'expected scraper calls to target PIUGame');

  const hosts = new Set(piugameCalls.map((call) => new URL(call.url).host));
  assert.deepEqual(hosts, new Set(['phoenix.piugame.com']));

  const languageCall = piugameCalls.find((call) => call.url.endsWith('/ajax/language_update.php'));
  assert.equal(
    languageCall?.config?.headers?.Referer,
    'https://phoenix.piugame.com/leaderboard/top_songs.php'
  );

  assert.ok(piugameCalls.some((call) => call.url === 'https://phoenix.piugame.com/my_page/pumbility.php'));
  assert.ok(piugameCalls.some((call) => call.url === 'https://phoenix.piugame.com/my_page/play_data.php?lv=10'));
  assert.ok(piugameCalls.some((call) => call.url === 'https://phoenix.piugame.com/my_page/my_best_score.php?page=1'));
  assert.ok(piugameCalls.some((call) => call.url === 'https://phoenix.piugame.com/leaderboard/top_songs.php?mode=total&date=202602'));
  assert.ok(piugameCalls.some((call) => call.url === 'https://phoenix.piugame.com/ajax/top_songs.php'));
  assert.ok(piugameCalls.some((call) => call.url === 'https://phoenix.piugame.com/my_page/recently_played.php'));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { CookieJar } = require('tough-cookie');

const {
  normalizeSsoCallbackUrl,
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

test('ssoc callback hops are rerouted to the working www handler', async () => {
  assert.equal(
    await normalizeSsoCallbackUrl('https://phoenix.piugame.com/ssoc?sid=abc123&referer=aHR0cA==', null),
    'https://www.piugame.com/ssoc/?sid=abc123&referer=aHR0cA=='
  );
  assert.equal(
    await normalizeSsoCallbackUrl('https://www.piugame.com/ssoc?sid=abc123&referer=aHR0cA==', null),
    'https://www.piugame.com/ssoc/?sid=abc123&referer=aHR0cA=='
  );
});

test('mangled phoenix ssoc redirects are repaired with the sid from the jar', async () => {
  const jar = new CookieJar();
  await jar.setCookie('sid=abc123; Domain=.piugame.com; Path=/', 'https://www.piugame.com/');

  assert.equal(
    await normalizeSsoCallbackUrl('https://phoenix.piugame.com/ssoc&referer=aHR0cA==', jar),
    'https://www.piugame.com/ssoc/?sid=abc123&referer=aHR0cA=='
  );

  // Keeps an explicit sid if the upstream redirect somehow retained one.
  assert.equal(
    await normalizeSsoCallbackUrl('https://phoenix.piugame.com/ssoc&sid=zzz&referer=aHR0cA==', jar),
    'https://www.piugame.com/ssoc/?sid=zzz&referer=aHR0cA=='
  );
});

test('non-ssoc and non-piugame URLs pass through unchanged', async () => {
  assert.equal(
    await normalizeSsoCallbackUrl('https://phoenix.piugame.com/my_page/recently_played.php', null),
    'https://phoenix.piugame.com/my_page/recently_played.php'
  );
  assert.equal(
    await normalizeSsoCallbackUrl('https://am-pass.net/ssoc?sid=abc&referer=aHR0cA==', null),
    'https://am-pass.net/ssoc?sid=abc&referer=aHR0cA=='
  );
  assert.equal(
    await normalizeSsoCallbackUrl('/ssoc&referer=aHR0cA==', null),
    '/ssoc&referer=aHR0cA=='
  );
});

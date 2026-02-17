const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');

const AM_PASS_BASE = 'https://am-pass.net';
const PIU_BASE = 'https://www.piugame.com';
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 12;

// Grade mapping from image filename codes
const GRADE_MAP = {
  sss_p: 'SSS+', sss: 'SSS', ss_p: 'SS+', ss: 'SS',
  s_p: 'S+', s: 'S', aaa_p: 'AAA+', aaa: 'AAA',
  aa_p: 'AA+', aa: 'AA', a_p: 'A+', a: 'A',
  b: 'B', c: 'C', d: 'D', f: 'F',
  // Broken grades (prefixed with X_)
  X_sss_p: 'SSS+', X_sss: 'SSS', X_ss_p: 'SS+', X_ss: 'SS',
  X_s_p: 'S+', X_s: 'S', X_aaa_p: 'AAA+', X_aaa: 'AAA',
  X_aa_p: 'AA+', X_aa: 'AA', X_a_p: 'A+', X_a: 'A',
  X_b: 'B', X_c: 'C', X_d: 'D', X_f: 'F',
};

// Plate mapping
const PLATE_MAP = {
  pg: 'PG', ug: 'UG', eg: 'EG', sg: 'SG',
  mg: 'MG', tg: 'TG', fg: 'FG', rg: 'RG',
};

// Mode letter mapping from image URLs
const MODE_MAP = { s: 'Single', d: 'Double', c: 'Co-op', u: 'UCS' };
const JUDGMENT_ORDER = ['perfect', 'great', 'good', 'bad', 'miss'];

function normalizeSetCookieHeaders(setCookieHeader) {
  if (!setCookieHeader) return [];
  return Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
}

async function persistCookiesFromResponse(jar, responseUrl, headers) {
  const setCookies = normalizeSetCookieHeaders(headers['set-cookie']);
  for (const cookie of setCookies) {
    try {
      await jar.setCookie(cookie, responseUrl);
    } catch (e) {
      // Ignore malformed cookies from upstream
    }
  }
}

/**
 * Axios does not expose intermediate redirect responses in interceptors.
 * Handle redirects manually so cookies from 30x hops are preserved.
 */
async function requestWithRedirects(rawClient, jar, config) {
  let method = (config.method || 'GET').toUpperCase();
  let url = config.url;
  let data = config.data;
  let headers = { ...(config.headers || {}) };

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const cookie = await jar.getCookieString(url);
    const reqHeaders = { ...headers };
    if (cookie) reqHeaders.Cookie = cookie;

    const response = await rawClient.request({
      ...config,
      method,
      url,
      data,
      headers: reqHeaders,
      maxRedirects: 0,
      validateStatus: () => true,
    });

    await persistCookiesFromResponse(jar, url, response.headers || {});

    const status = response.status || 0;
    const location = response.headers?.location;
    if (location && REDIRECT_STATUS.has(status)) {
      url = new URL(location, url).toString();

      // Browser-like behavior on redirect after form POST.
      if (status === 303 || ((status === 301 || status === 302) && method !== 'GET' && method !== 'HEAD')) {
        method = 'GET';
        data = undefined;
        delete headers['Content-Type'];
        delete headers['content-type'];
      }
      continue;
    }

    if (status >= 400) {
      throw new Error(`HTTP ${status} when requesting ${url}`);
    }

    return response;
  }

  throw new Error(`Too many redirects while requesting ${config.url}`);
}

/**
 * Create an HTTP client with cookie jar support for cross-domain auth
 */
function createClient() {
  const jar = new CookieJar();
  const rawClient = axios.create({
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const client = {
    request: (config) => requestWithRedirects(rawClient, jar, config),
    get: (url, config = {}) => requestWithRedirects(rawClient, jar, { ...config, method: 'GET', url }),
    post: (url, data, config = {}) => requestWithRedirects(rawClient, jar, { ...config, method: 'POST', url, data }),
  };

  return client;
}

function isLoggedInPiugameHtml(html) {
  const src = String(html || '');
  return src.includes('/bbs/logout.php') && !src.includes('/login.php?login_url=');
}

async function loginViaPiugame(client, username, password) {
  await client.get(`${PIU_BASE}/login.php?login_url=${encodeURIComponent('/my_page/recently_played.php')}`);

  const params = new URLSearchParams();
  params.append('url', '/my_page/recently_played.php');
  params.append('mb_id', username);
  params.append('mb_password', password);

  await client.post(
    `${PIU_BASE}/bbs/login_check.php`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const verifyRes = await client.get(`${PIU_BASE}/my_page/recently_played.php`);
  if (!isLoggedInPiugameHtml(verifyRes.data)) {
    throw new Error('PIUGame login verification failed');
  }
}

async function loginViaAmPass(client, username, password) {
  await client.get(AM_PASS_BASE);

  const params = new URLSearchParams();
  params.append('url', '/');
  params.append('mb_id', username);
  params.append('mb_password', password);

  await client.post(
    `${AM_PASS_BASE}/bbs/login_check.php`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const verifyRes = await client.get(`${PIU_BASE}/my_page/recently_played.php`);
  if (!isLoggedInPiugameHtml(verifyRes.data)) {
    throw new Error('AM-PASS login verification failed');
  }
}

/**
 * Login to PIUGame (primary: piugame.com form login, fallback: legacy am-pass flow)
 * Returns the authenticated client or throws on failure
 */
async function login(username, password) {
  const strategies = [loginViaPiugame, loginViaAmPass];
  let lastErr = null;

  for (const strategy of strategies) {
    const client = createClient();
    try {
      await strategy(client, username, password);
      return client;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(lastErr?.message || 'Login failed - invalid credentials');
}

/**
 * Parse mode letter from stepball image URL
 */
function parseModeFromUrl(src) {
  const match = src.match(/\/l_img\/stepball\/full\/([a-zA-Z])_(?:text|bg)\.png/);
  return match ? (MODE_MAP[match[1].toLowerCase()] || 'Single') : 'Single';
}

/**
 * Parse level digits from stepball number images
 */
function parseLevelFromImages($, container) {
  const digits = [];
  container.find('img').each((_, img) => {
    const src = $(img).attr('src') || '';
    const match = src.match(/_num_([0-9])\.png/);
    if (match) digits.push(match[1]);
  });
  return parseInt(digits.join(''), 10) || 0;
}

/**
 * Parse grade from grade image URL
 */
function parseGradeFromUrl(src) {
  const match = src.match(/\/l_img\/grade\/(\w+)\.png/);
  return match ? (GRADE_MAP[match[1]] || match[1]) : '';
}

/**
 * Parse plate from plate image URL
 */
function parsePlateFromUrl(src) {
  const match = src.match(/\/l_img\/plate\/(\w+)\.png/);
  return match ? (PLATE_MAP[match[1]] || match[1]) : '';
}

/**
 * Parse score string like "987,654" to integer
 */
function parseScore(text) {
  return parseInt((text || '').replace(/,/g, '').trim(), 10) || 0;
}

/**
 * Parse judgments from the recently-played breakdown table.
 * Returns null values when the breakdown table is unavailable.
 */
function parseJudgmentsFromRecentlyPlayedItem($, $li) {
  const judgments = {
    perfect: null,
    great: null,
    good: null,
    bad: null,
    miss: null,
  };

  const row = $li.find('table.recently_play tbody tr').first();
  if (!row.length) return judgments;

  row.find('td').each((idx, td) => {
    const $td = $(td);
    let key = ($td.attr('data-th') || '').trim().toLowerCase();

    if (!JUDGMENT_ORDER.includes(key)) {
      const cls = $td.attr('class') || '';
      const classMatch = cls.match(/\bfontCol([1-5])\b/i);
      if (classMatch) {
        key = JUDGMENT_ORDER[parseInt(classMatch[1], 10) - 1] || '';
      } else {
        key = JUDGMENT_ORDER[idx] || '';
      }
    }

    if (!key) return;
    judgments[key] = parseScore($td.find('.tx').first().text() || $td.text());
  });

  return judgments;
}

/**
 * Scrape pumbility page - returns { pumbilityValue, scores[] }
 */
async function scrapePumbility(client) {
  const res = await client.get(`${PIU_BASE}/my_page/pumbility.php`);
  const $ = cheerio.load(res.data);

  const scores = [];

  // Parse pumbility total value from the profile area
  // The first i.tt.en on the page is typically the coin/pumbility value
  let pumbilityValue = 0;
  const ratingEl = $('div.pumbility_total_wrap i.tt.en, div.rating_total_wrap i.tt.en, div.total_wrap i.tt.en');
  if (ratingEl.length) {
    pumbilityValue = parseScore(ratingEl.first().text());
  }

  // Each score entry
  $('div.rating_rangking_list_w ul.list > li').each((i, li) => {
    const $li = $(li);
    // Filter: must contain exactly the expected structure
    if ($li.find('div.in.flex').length === 0) return;

    const songTitle = $li.find('div.profile_name p.t1').text().trim();
    if (!songTitle) return;

    // Mode from type image
    const typeImg = $li.find('div.tw img').first().attr('src') || '';
    const mode = parseModeFromUrl(typeImg);

    // Level from number images
    const level = parseLevelFromImages($, $li.find('div.imG'));

    // Score
    const score = parseScore($li.find('div.score i.tt.en').text());

    // Grade
    const gradeImg = $li.find('div.grade_wrap img').first().attr('src') || '';
    const grade = parseGradeFromUrl(gradeImg);

    // Background image
    let bgUrl = '';
    const bgStyle = $li.find('div.re.bgfix').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
    if (bgMatch) bgUrl = bgMatch[1];

    // Date played
    const datePlayed = $li.find('div.date i.tt').text().trim();

    scores.push({
      song_title: songTitle,
      mode,
      level,
      score,
      grade,
      background_url: bgUrl,
      date_played: datePlayed,
      rank_order: i + 1,
    });
  });

  return { pumbilityValue, scores };
}

/**
 * Scrape best scores page with pagination
 * Returns array of score objects
 */
async function scrapeBestScores(client) {
  const allScores = [];

  // First, fetch page 1 to determine total pages
  const firstPageUrl = `${PIU_BASE}/my_page/my_best_score.php?page=1`;
  const firstRes = await client.get(firstPageUrl);
  const $first = cheerio.load(firstRes.data);

  // Check for empty state
  if ($first('div.no_con').length > 0) return [];

  // Get total pages from pagination
  let totalPages = 1;
  const lastPageBtn = $first('i.xi.last').parent();
  if (lastPageBtn.length) {
    const onclick = lastPageBtn.attr('onclick') || '';
    const pageMatch = onclick.match(/page=(\d+)/);
    if (pageMatch) totalPages = parseInt(pageMatch[1], 10);
  }
  // Fallback: check board_paging buttons
  if (totalPages === 1) {
    $first('.board_paging button').each((_, btn) => {
      const onclick = $first(btn).attr('onclick') || '';
      const pageMatch = onclick.match(/page=(\d+)/);
      if (pageMatch) {
        const p = parseInt(pageMatch[1], 10);
        if (p > totalPages) totalPages = p;
      }
    });
  }

  // Parse scores from a loaded page
  function parseScoresFromPage($) {
    const scores = [];
    $('ul.my_best_scoreList > li').each((_, li) => {
      const $li = $(li);
      if ($li.find('div.in').length === 0) return;

      const songTitle = $li.find('div.song_name p').first().text().trim();
      if (!songTitle) return;

      // Mode from background image of stepball container
      const stepBallStyle = $li.find('div.stepBall_in').attr('style') || '';
      const modeMatch = stepBallStyle.match(/\/l_img\/stepball\/full\/([a-zA-Z])_bg\.png/);
      const mode = modeMatch ? (MODE_MAP[modeMatch[1].toLowerCase()] || 'Single') : 'Single';

      // Level
      const level = parseLevelFromImages($, $li.find('div.numw'));

      // Score
      const score = parseScore($li.find('ul.list span.num').text());

      // Grade
      const gradeImg = $li.find('ul.list img').first().attr('src') || '';
      const grade = parseGradeFromUrl(gradeImg);

      // Plate
      const plateImg = $li.find('.etc_con .st1 img').first().attr('src') || '';
      const plate = parsePlateFromUrl(plateImg);

      scores.push({ song_title: songTitle, mode, level, score, grade, plate });
    });
    return scores;
  }

  // Parse first page
  allScores.push(...parseScoresFromPage($first));

  // Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    try {
      const res = await client.get(`${PIU_BASE}/my_page/my_best_score.php?page=${page}`);
      const $ = cheerio.load(res.data);
      allScores.push(...parseScoresFromPage($));
    } catch (err) {
      console.error(`Failed to fetch best scores page ${page}:`, err.message);
      break;
    }
  }

  return allScores;
}

/**
 * Scrape recently played page
 * Returns array of recent play objects
 */
async function scrapeRecentlyPlayed(client) {
  const res = await client.get(`${PIU_BASE}/my_page/recently_played.php`);
  const $ = cheerio.load(res.data);
  const plays = [];

  // Note: class is "recently_playeList" (typo in actual site)
  $('ul.recently_playeList > li, ul.recently_playedList > li').each((_, li) => {
    const $li = $(li);
    if ($li.find('div.wrap_in').length === 0) return;

    const songTitle = $li.find('div.song_name p').first().text().trim();
    if (!songTitle) return;

    // Mode
    const typeImg = $li.find('div.tw img').first().attr('src') || '';
    const mode = parseModeFromUrl(typeImg);

    // Level
    const level = parseLevelFromImages($, $li.find('div.imG'));

    // Score — can be "STAGE BREAK" for failures
    const scoreText = $li.find('div.li_in.ac i.tx').text().trim();
    const isStageBreak = scoreText === 'STAGE BREAK';
    const score = isStageBreak ? 0 : parseScore(scoreText);

    // Grade
    const gradeImg = $li.find('div.li_in.ac img').first().attr('src') || '';
    const grade = isStageBreak ? 'F' : parseGradeFromUrl(gradeImg);

    // Background image
    let bgUrl = '';
    const bgStyle = $li.find('div.in.bgfix').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
    if (bgMatch) bgUrl = bgMatch[1];

    // Date
    const datePlayed = $li.find('p.recently_date_tt').text().trim();
    const judgments = parseJudgmentsFromRecentlyPlayedItem($, $li);

    plays.push({
      song_title: songTitle,
      mode,
      level,
      score,
      grade,
      background_url: bgUrl,
      date_played: datePlayed,
      perfect: judgments.perfect,
      great: judgments.great,
      good: judgments.good,
      bad: judgments.bad,
      miss: judgments.miss,
    });
  });

  return plays;
}

module.exports = {
  login,
  scrapePumbility,
  scrapeBestScores,
  scrapeRecentlyPlayed,
};

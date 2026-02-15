const axios = require('axios');
const https = require('https');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');

// am-pass.net serves an incomplete certificate chain (missing intermediate CA certs).
// Browsers fetch missing intermediates automatically, but Node.js does not.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const AM_PASS_BASE = 'https://am-pass.net';
const PIU_BASE = 'https://www.piugame.com';

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

/**
 * Create an HTTP client with cookie jar support for cross-domain auth.
 * Handles redirects manually so cookies are captured at every hop
 * (axios interceptors only fire for the final response, not intermediate redirects).
 */
function createClient() {
  const jar = new CookieJar();
  const MAX_REDIRECTS = 20;

  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  async function request(method, url, data, extraHeaders) {
    let currentUrl = url;
    let currentMethod = method;
    let currentData = data;
    let headers = { ...defaultHeaders, ...extraHeaders };

    for (let i = 0; i < MAX_REDIRECTS; i++) {
      const reqHeaders = { ...headers };
      try {
        const cookies = await jar.getCookieString(currentUrl);
        if (cookies) reqHeaders.Cookie = cookies;
      } catch (e) { /* ignore */ }

      const res = await axios({
        method: currentMethod,
        url: currentUrl,
        data: currentData,
        headers: reqHeaders,
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: () => true,
        httpsAgent,
      });

      // Capture cookies from this hop
      const setCookies = res.headers['set-cookie'];
      if (setCookies) {
        for (const c of setCookies) {
          try { await jar.setCookie(c, currentUrl); } catch (e) { /* ignore */ }
        }
      }

      // Follow redirects manually
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.location;
        if (!location) return res;
        currentUrl = new URL(location, currentUrl).href;
        // POST becomes GET on 301/302/303
        if ([301, 302, 303].includes(res.status)) {
          currentMethod = 'GET';
          currentData = undefined;
          delete headers['Content-Type'];
        }
        continue;
      }

      return res;
    }

    throw new Error('Too many redirects');
  }

  const client = {
    get: (url, config = {}) => request('GET', url, undefined, config.headers),
    post: (url, data, config = {}) => request('POST', url, data, config.headers),
  };

  return { client, jar };
}

/**
 * Login to piugame via am-pass.net
 * Returns the authenticated client or throws on failure
 */
async function login(username, password) {
  const { client, jar } = createClient();

  // Step 1: GET am-pass.net to establish session
  await client.get(AM_PASS_BASE);

  // Step 2: POST login credentials
  const params = new URLSearchParams();
  params.append('url', '/');
  params.append('mb_id', username);
  params.append('mb_password', password);

  const loginRes = await client.post(
    `${AM_PASS_BASE}/bbs/login_check.php`,
    params.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  // Step 3: Verify login by checking for logout link
  const verifyRes = await client.get(AM_PASS_BASE);
  if (verifyRes.data.indexOf('bbs/logout.php') < 0) {
    throw new Error('Login failed - invalid credentials');
  }

  return client;
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

  // Fallback: if we couldn't scrape the total, sum all score values
  // Pumbility = sum of your top 50 highest rated scores
  if (pumbilityValue === 0 && scores.length > 0) {
    pumbilityValue = scores.reduce((sum, s) => sum + s.score, 0);
  }

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
    const onclick = lastPageBtn.attr('onclick') || lastPageBtn.attr('href') || '';
    const pageMatch = onclick.match(/page=(\d+)/);
    if (pageMatch) totalPages = parseInt(pageMatch[1], 10);
  }
  // Fallback: check board_paging buttons and links
  if (totalPages === 1) {
    $first('.board_paging button, .board_paging a').each((_, el) => {
      const onclick = $first(el).attr('onclick') || $first(el).attr('href') || '';
      const pageMatch = onclick.match(/page=(\d+)/);
      if (pageMatch) {
        const p = parseInt(pageMatch[1], 10);
        if (p > totalPages) totalPages = p;
      }
    });
  }
  // Fallback: if we still only found 1 page but got scores, use fetch-until-empty
  const useIncrementalFetch = totalPages === 1 && allScores.length > 0;

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
  const maxPage = useIncrementalFetch ? 200 : totalPages;
  for (let page = 2; page <= maxPage; page++) {
    try {
      const res = await client.get(`${PIU_BASE}/my_page/my_best_score.php?page=${page}`);
      const $ = cheerio.load(res.data);
      const pageScores = parseScoresFromPage($);
      if (pageScores.length === 0) break; // No more scores on this page
      allScores.push(...pageScores);
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
  $('ul.recently_playeList > li').each((_, li) => {
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

    // Try to extract judgment breakdown data
    let perfect = 0, great = 0, good = 0, bad = 0, miss = 0, maxCombo = 0, kcal = 0;
    // Check for judgment data in various possible selectors
    const judgmentContainer = $li.find('div.li_in.etc, div.etc_list, div.data_in');
    if (judgmentContainer.length) {
      judgmentContainer.find('div.etc_in, div.data_con').each((_, div) => {
        const label = ($(div).find('p.tt, i.tt, span.tt').text() || '').trim().toLowerCase();
        const valText = ($(div).find('p.dd, i.dd, i.tx, span.dd').text() || '').replace(/,/g, '').trim();
        const val = parseInt(valText, 10) || 0;
        if (label.includes('perfect')) perfect = val;
        else if (label.includes('great')) great = val;
        else if (label.includes('good')) good = val;
        else if (label.includes('bad')) bad = val;
        else if (label.includes('miss')) miss = val;
        else if (label.includes('combo')) maxCombo = val;
        else if (label.includes('kcal')) kcal = parseFloat(valText) || 0;
      });
    }
    // Alternative: look for multiple i.tx values beyond the score
    if (perfect === 0 && great === 0) {
      const allValues = [];
      $li.find('i.tx').each((idx, el) => {
        if (idx === 0) return; // skip the first one (score)
        allValues.push(parseInt($(el).text().replace(/,/g, '').trim(), 10) || 0);
      });
      // If we found 5+ values, they're likely: perfect, great, good, bad, miss[, combo, kcal]
      if (allValues.length >= 5) {
        [perfect, great, good, bad, miss] = allValues;
        if (allValues.length >= 6) maxCombo = allValues[5];
        if (allValues.length >= 7) kcal = allValues[6];
      }
    }

    plays.push({
      song_title: songTitle,
      mode,
      level,
      score,
      grade,
      background_url: bgUrl,
      date_played: datePlayed,
      perfect,
      great,
      good,
      bad,
      miss,
      max_combo: maxCombo,
      kcal,
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

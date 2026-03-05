const axios = require('axios');
const https = require('https');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');

// am-pass.net serves an incomplete certificate chain (missing intermediate CA certs).
// Browsers fetch missing intermediates automatically, but Node.js does not.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

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
};

// Plate mapping
const PLATE_MAP = {
  pg: 'PG', ug: 'UG', eg: 'EG', sg: 'SG',
  mg: 'MG', tg: 'TG', fg: 'FG', rg: 'RG',
};

// Mode letter mapping from image URLs
const MODE_MAP = { s: 'Single', d: 'Double', c: 'Co-op', u: 'UCS' };
const JUDGMENT_ORDER = ['perfect', 'great', 'good', 'bad', 'miss'];
const OVER_RANKING_PAGE_SIZE = 10;

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

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
 * Create an HTTP client with cookie jar support for cross-domain auth.
 * Handles redirects manually so cookies are captured at every hop
 * (axios interceptors only fire for the final response, not intermediate redirects).
 */
function createClient() {
  const jar = new CookieJar();
  const rawClient = axios.create({
    timeout: 30000,
    httpsAgent,
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

async function setLanguage(client, lang = 'en') {
  const normalizedLang = String(lang || '').toLowerCase() === 'kr' ? 'kr' : 'en';
  const params = new URLSearchParams();
  params.append('lang', normalizedLang);

  const res = await client.post(
    `${PIU_BASE}/ajax/language_update.php`,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${PIU_BASE}/leaderboard/top_songs.php`,
      },
    }
  );

  let payload = res.data;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      payload = null;
    }
  }

  if (!payload || Number(payload.status) !== 200) {
    throw new Error(`Failed to switch PIUGame language to ${normalizedLang}`);
  }
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
  if (!match) return '';
  const code = match[1];
  return GRADE_MAP[code] || GRADE_MAP[code.toLowerCase()] || code;
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

function extractBackgroundUrl(styleValue) {
  const style = String(styleValue || '');
  const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
  return match ? match[1] : '';
}

function normalizeKnownSongTitle(title) {
  const normalized = collapseWhitespace(title);
  if (!normalized) return '';
  const compact = normalized.toLowerCase().replace(/\s+/g, ' ');

  if (compact === 'yog-sothoth - short cut -' || compact === 'yog-sothoth- short cut -') {
    return 'Yog-Sothoth - SHORT CUT -';
  }

  return normalized;
}

function parseLastPaginationPage($) {
  let lastPage = 1;
  $('.board_paging button, .board_paging a, .paging button, .paging a').each((_, el) => {
    const $el = $(el);
    const raw = [
      $el.attr('onclick') || '',
      $el.attr('href') || '',
      $el.text() || '',
    ].join(' ');
    const matches = raw.match(/page=(\d+)/gi) || [];
    for (const token of matches) {
      const value = parseInt(token.replace(/[^\d]/g, ''), 10);
      if (Number.isInteger(value) && value > lastPage) lastPage = value;
    }
  });
  return Math.max(1, lastPage);
}

function parseOverRankingListPage(html) {
  const $ = cheerio.load(typeof html === 'string' ? html : '');
  const rows = [];
  $('ul.rating_ranking_list.overRangking_st > li .li_in > a').each((_, link) => {
    const $link = $(link);
    const href = String($link.attr('href') || '').trim();
    if (!href) return;

    const url = new URL(href, `${PIU_BASE}/leaderboard/over_ranking.php`);
    const path = `${url.pathname}${url.search}`;
    const sourceNo = String(url.searchParams.get('no') || '').trim();

    const songTitle = normalizeKnownSongTitle($link.find('.songName_w .tt').first().text());
    if (!songTitle) return;

    const modeImg = $link.find('.stepBall_in .tw img').first().attr('src') || '';
    const mode = parseModeFromUrl(modeImg);
    const level = parseLevelFromImages($, $link.find('.stepBall_in .numw').first());
    if (!mode || level <= 0) return;

    const jacketUrl = extractBackgroundUrl($link.find('.songImg_w .re.img.bgfix').first().attr('style') || '');
    rows.push({
      source_no: sourceNo,
      view_path: path,
      song_title: songTitle,
      mode,
      level,
      jacket_url: jacketUrl,
    });
  });

  return {
    rows,
    total_pages: parseLastPaginationPage($),
  };
}

function parseOverRankingChartPage(html, fallback = {}) {
  const $ = cheerio.load(typeof html === 'string' ? html : '');

  const headerSongTitle = normalizeKnownSongTitle($('.rangking_level_w .songName_w .tt').first().text());
  const headerModeImg = $('.rangking_level_w .stepBall_in .tw img').first().attr('src') || '';
  const headerMode = parseModeFromUrl(headerModeImg);
  const headerLevel = parseLevelFromImages($, $('.rangking_level_w .stepBall_in .numw').first());
  const headerJacket = extractBackgroundUrl($('.rangking_level_w .songImg_w .re.img.bgfix').first().attr('style') || '');

  const topScores = [];
  $('.rangking_list_w ul.list > li').each((idx, li) => {
    const $li = $(li);
    const rankText = collapseWhitespace($li.find('.num .tt').first().text());
    const parsedRank = parseInt(rankText, 10);
    const rank = Number.isInteger(parsedRank) && parsedRank > 0 ? parsedRank : idx + 1;
    const playerName = collapseWhitespace($li.find('.name_w .profile_name').first().text());
    const playerTag = collapseWhitespace($li.find('.name_w .profile_name.st1').first().text());
    const score = parseScore($li.find('.score .tt').first().text());
    const grade = parseGradeFromUrl($li.find('.grade img').first().attr('src') || '');
    const playedAt = collapseWhitespace($li.find('.date .tt').first().text());
    if (!Number.isInteger(rank) || rank <= 0 || score <= 0) return;

    topScores.push({
      rank,
      player_name: playerName,
      player_tag: playerTag,
      score,
      grade,
      played_at: playedAt,
    });
  });

  topScores.sort((a, b) => a.rank - b.rank);
  const top100 = topScores.slice(0, 100);
  const minScore = top100.length > 0
    ? (parseInt(top100[top100.length - 1].score, 10) || 0)
    : 0;

  return {
    source_no: String(fallback.source_no || ''),
    view_path: String(fallback.view_path || ''),
    song_title: headerSongTitle || normalizeKnownSongTitle(fallback.song_title || ''),
    mode: headerMode || String(fallback.mode || '').trim() || 'Single',
    level: parseInt(headerLevel, 10) || parseInt(fallback.level, 10) || 0,
    jacket_url: headerJacket || String(fallback.jacket_url || ''),
    top100_count: top100.length,
    min_score: minScore,
    top_scores: top100,
  };
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

function parseRecentlyAccessGame($) {
  const LABEL_RE = /^Recently\s*Access\s*Games\s*:\s*/i;
  const ALT_LABEL_RE = /^최근\s*접속\s*게임장\s*:\s*/i;
  let value = '';

  $('i.tt, p.tt, span.tt, div.tt').each((_, el) => {
    if (value) return;
    const text = collapseWhitespace($(el).text());
    if (!text) return;
    if (LABEL_RE.test(text)) {
      value = collapseWhitespace(text.replace(LABEL_RE, ''));
      return;
    }
    if (ALT_LABEL_RE.test(text)) {
      value = collapseWhitespace(text.replace(ALT_LABEL_RE, ''));
    }
  });

  if (value) return value;

  const fullText = collapseWhitespace($('body').text());
  const inlineMatch = fullText.match(/Recently\s*Access\s*Games\s*:\s*(.+?)(?=\s+(?:Last\s*Access\s*Date|Switch\s*Account|More)\b|$)/i);
  if (inlineMatch?.[1]) return collapseWhitespace(inlineMatch[1]);
  return '';
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
 * Small delay helper to avoid hammering piugame.com
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scrape best scores page with pagination
 * Returns array of score objects
 */
async function scrapeBestScores(client, onProgress) {
  const allScores = [];

  // First, fetch page 1 to determine total pages
  const firstPageUrl = `${PIU_BASE}/my_page/my_best_score.php?page=1`;
  const firstRes = await client.get(firstPageUrl);
  const $first = cheerio.load(firstRes.data);

  // Check for empty state
  if ($first('div.no_con').length > 0) return [];

  // Parse scores from a loaded page
  function parseScoresFromPage($) {
    const scores = [];
    $('ul.my_best_scoreList > li, ul.my_best_scoreList.flex.wrap > li').each((_, li) => {
      const $li = $(li);
      if ($li.find('div.in').length === 0) return;

      const songTitle = $li.find('div.song_name p').first().text().trim();
      if (!songTitle) return;

      // Mode from background image of stepball container
      const stepBallBg = $li.find('div.stepBall_in, div.stepBall_in.flex.vc.col.hc.wrap.bgfix.cont').first();
      const stepBallStyle = stepBallBg.attr('style') || '';
      const modeMatch = stepBallStyle.match(/\/l_img\/stepball\/full\/([a-zA-Z])_bg\.png/);
      const mode = modeMatch ? (MODE_MAP[modeMatch[1].toLowerCase()] || 'Single') : 'Single';

      // Level
      const level = parseLevelFromImages($, $li.find('div.numw, div.numw.flex.vc.hc'));

      // Score
      const score = parseScore($li.find('ul.list span.num').text());

      // Grade
      const gradeImg = $li.find('ul.list img').first().attr('src') || '';
      const grade = parseGradeFromUrl(gradeImg);

      // Plate
      const plateImg = $li.find('.etc_con .st1 img').first().attr('src') || '';
      const plate = parsePlateFromUrl(plateImg);

      // Background image (song jacket)
      let bgUrl = '';
      const bgStyle = $li.find('div.in.bgfix, div.re.bgfix, div.bgfix').first().attr('style') || '';
      const bgMatch = bgStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (bgMatch) bgUrl = bgMatch[1];

      scores.push({ song_title: songTitle, mode, level, score, grade, plate, background_url: bgUrl });
    });
    return scores;
  }

  // Parse first page
  allScores.push(...parseScoresFromPage($first));

  // Determine total pages using multiple strategies
  let totalPages = 1;

  // Strategy 1: Get total count from header and calculate pages (15 per page)
  const totalCountEl = $first('div.left.total_wrap > i.tt.t2, div.total_wrap i.tt.t2, div.total_wrap i.tt');
  if (totalCountEl.length) {
    const totalCount = parseInt(totalCountEl.first().text().replace(/,/g, '').trim(), 10) || 0;
    if (totalCount > 0) {
      totalPages = Math.ceil(totalCount / 15);
    }
  }

  // Strategy 2: Check "last" page button
  if (totalPages <= 1) {
    const lastPageBtn = $first('i.xi.last').parent();
    if (lastPageBtn.length) {
      const onclick = lastPageBtn.attr('onclick') || lastPageBtn.attr('href') || '';
      const pageMatch = onclick.match(/page=(\d+)/);
      if (pageMatch) totalPages = parseInt(pageMatch[1], 10);
    }
  }

  // Strategy 3: Check all pagination buttons/links for highest page number
  if (totalPages <= 1) {
    $first('.board_paging button, .board_paging a, .paging button, .paging a').each((_, el) => {
      const onclick = $first(el).attr('onclick') || $first(el).attr('href') || '';
      const pageMatch = onclick.match(/page=(\d+)/);
      if (pageMatch) {
        const p = parseInt(pageMatch[1], 10);
        if (p > totalPages) totalPages = p;
      }
    });
  }

  // Strategy 4: If we got scores on page 1 but couldn't detect pagination, use incremental fetching
  const useIncrementalFetch = totalPages <= 1 && allScores.length > 0;

  // Cap to avoid runaway fetching
  const maxPage = useIncrementalFetch ? 200 : Math.min(totalPages, 200);

  console.log(`Best scores: page 1 returned ${allScores.length} scores, totalPages=${totalPages}, incremental=${useIncrementalFetch}, maxPage=${maxPage}`);

  // Report initial progress
  if (onProgress) onProgress(1, maxPage);

  // Fetch remaining pages with small delay between requests
  for (let page = 2; page <= maxPage; page++) {
    try {
      await delay(300); // Be polite to piugame.com
      const res = await client.get(`${PIU_BASE}/my_page/my_best_score.php?page=${page}`);
      const $ = cheerio.load(res.data);
      const pageScores = parseScoresFromPage($);
      if (pageScores.length === 0) break; // No more scores on this page
      allScores.push(...pageScores);
      // Report progress
      if (onProgress) onProgress(page, maxPage);
      if (page % 10 === 0) {
        console.log(`Best scores: fetched page ${page}/${maxPage}, total so far: ${allScores.length}`);
      }
    } catch (err) {
      console.error(`Failed to fetch best scores page ${page}:`, err.message);
      break;
    }
  }

  console.log(`Best scores: completed with ${allScores.length} total scores`);
  return allScores;
}

/**
 * Scrape leaderboard top songs using the same AJAX pagination as piugame.com.
 * Returns songs in rank order.
 */
async function scrapeTopSongs(
  client,
  {
    date,
    mode = 'total',
    lang = 'en',
    pageSize = 50,
    maxPages = 100,
    delayMs = 150,
  } = {}
) {
  if (!date) throw new Error('Top songs scrape requires a YYYYMM date');

  const encodedDate = encodeURIComponent(String(date));
  const encodedMode = encodeURIComponent(String(mode));
  const pageUrl = `${PIU_BASE}/leaderboard/top_songs.php?mode=${encodedMode}&date=${encodedDate}`;

  await client.get(pageUrl);
  if (lang) {
    await setLanguage(client, lang);
  }

  const rows = [];

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const pageOffset = pageIndex * pageSize;
    const params = new URLSearchParams();
    params.append('page', String(pageOffset));
    params.append('date', String(date));
    params.append('mode', String(mode));

    if (pageIndex > 0 && delayMs > 0) {
      await delay(delayMs);
    }

    const res = await client.post(
      `${PIU_BASE}/ajax/top_songs.php`,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: pageUrl,
        },
      }
    );

    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);
    const items = $('li');
    if (!items.length) break;

    items.each((idx, li) => {
      const $li = $(li);
      const title = collapseWhitespace($li.find('.profile_name .t1').first().text());
      if (!title) return;

      const artist = collapseWhitespace($li.find('.profile_name .t2').first().text());

      let bgUrl = '';
      const bgStyle = $li.find('.profile_img .re.bgfix').first().attr('style') || '';
      const bgMatch = bgStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (bgMatch) bgUrl = bgMatch[1];

      const rankText = collapseWhitespace($li.find('.num > i.tt').first().text());
      const parsedRank = parseInt(rankText, 10);
      const rank = Number.isFinite(parsedRank) ? parsedRank : pageOffset + idx + 1;

      rows.push({
        rank,
        song_title: title,
        artist,
        background_url: bgUrl,
      });
    });

    if (items.length < pageSize) break;
  }

  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

/**
 * Extract judgment breakdown (PERFECT, GREAT, GOOD, BAD, MISS) from a
 * recently played list item using multiple selector strategies.
 * PIUGame.com shows these as a 5-column grid within each card.
 */
function extractJudgmentBreakdown($, $li) {
  let perfect = 0, great = 0, good = 0, bad = 0, miss = 0;
  let found = false;

  // Helper: assign judgment value by keyword
  function assign(keyword, value) {
    const kw = keyword.toLowerCase().replace(/[^a-z]/g, '');
    if (kw.includes('perfect') && !kw.includes('game')) { perfect = value; found = true; }
    else if (kw.includes('great')) { great = value; found = true; }
    else if (kw === 'good' || kw.startsWith('good')) { good = value; found = true; }
    else if (kw === 'bad' || kw.startsWith('bad')) { bad = value; found = true; }
    else if (kw.includes('miss')) { miss = value; found = true; }
  }

  // Helper: extract numeric value near an element
  function extractNearbyValue($el) {
    let val = -1;
    // Try next sibling
    const nextEl = $el.next();
    if (nextEl.length) {
      const parsed = parseInt(nextEl.text().replace(/,/g, '').trim(), 10);
      if (!isNaN(parsed)) val = parsed;
    }
    // Try element's own children (for cases like <p>PERFECT <span>1,367</span></p>)
    if (val < 0) {
      $el.children().each((_, child) => {
        if (val >= 0) return;
        const parsed = parseInt($(child).text().replace(/,/g, '').trim(), 10);
        if (!isNaN(parsed)) val = parsed;
      });
    }
    // Try parent's other children
    if (val < 0) {
      const parent = $el.parent();
      parent.children().each((_, child) => {
        if (val >= 0 || child === $el[0]) return;
        const parsed = parseInt($(child).text().replace(/,/g, '').trim(), 10);
        if (!isNaN(parsed)) val = parsed;
      });
    }
    return val >= 0 ? val : 0;
  }

  // Strategy 1: Look for labeled containers with broad selectors
  // including .etc_con which piugame uses for score details
  const containerSelectors = [
    'div.li_in.etc', 'div.etc_list', 'div.data_in',
    'div.etc_wrap', 'div.li_in.st', 'div.score_detail',
    'div.judge', 'div.detail', 'div.etc_con', 'div.etc_area',
    'div.data_wrap', 'div.etc', 'ul.etc_list', 'ul.list',
    'div.score_etc', 'div.judge_wrap',
  ].join(', ');

  const subItemSelectors = 'div.etc_in, div.data_con, div.data_il, div.judge_con, li, span.col, div.col';
  const labelSelectors = 'p.tt, i.tt, span.tt, p.label, span.label, .tit, .t1, p.name, span.name';
  const valueSelectors = 'p.dd, i.dd, i.tx, span.dd, span.num, .con, .t2, .v1, p.count, span.count, span.tx';

  const container = $li.find(containerSelectors);
  if (container.length) {
    const subItems = container.find(subItemSelectors);
    if (subItems.length >= 5) {
      subItems.each((_, div) => {
        const labelEl = $(div).find(labelSelectors).first();
        const valEl = $(div).find(valueSelectors).first();
        let label = (labelEl.text() || '').trim().toLowerCase();
        // Fallback: if no dedicated label element, check for image with keyword in src
        if (!label) {
          const img = $(div).find('img').first();
          const src = (img.attr('src') || '').toLowerCase();
          if (src.includes('perfect')) label = 'perfect';
          else if (src.includes('great')) label = 'great';
          else if (src.includes('good')) label = 'good';
          else if (src.includes('bad')) label = 'bad';
          else if (src.includes('miss')) label = 'miss';
        }
        // Fallback: use the full text of the sub-item
        if (!label) {
          label = $(div).text().toLowerCase().replace(/[\d,]/g, '').trim();
        }
        const val = parseInt((valEl.text() || '').replace(/,/g, '').trim(), 10) || 0;
        assign(label, val);
      });
    }
  }

  // Strategy 2: Search for text nodes containing judgment keywords anywhere
  // in the list item, using flexible matching (includes instead of exact)
  if (!found) {
    const JUDGMENT_KEYWORDS = ['perfect', 'great', 'good', 'bad', 'miss'];
    const allEls = $li.find('*');
    const matchedLabels = {};

    allEls.each((_, el) => {
      const directText = $(el).contents().filter(function() {
        return this.type === 'text';
      }).text().replace(/\u00A0/g, ' ').trim().toLowerCase();

      for (const kw of JUDGMENT_KEYWORDS) {
        // Match exact keyword, or keyword with colon (e.g. "perfect:")
        // Avoid matching compound words like "perfect game"
        if (!matchedLabels[kw] && (
          directText === kw ||
          directText === kw + ':' ||
          (directText.startsWith(kw) && directText.length <= kw.length + 2)
        )) {
          matchedLabels[kw] = extractNearbyValue($(el));
          found = true;
        }
      }
    });

    if (found) {
      perfect = matchedLabels.perfect || 0;
      great = matchedLabels.great || 0;
      good = matchedLabels.good || 0;
      bad = matchedLabels.bad || 0;
      miss = matchedLabels.miss || 0;
    }
  }

  // Strategy 3: Image-based label detection
  // piugame.com renders grades, plates, and modes as images — judgment labels may be images too
  if (!found) {
    const matchedFromImages = {};
    const KEYWORDS = ['perfect', 'great', 'good', 'bad', 'miss'];

    $li.find('img').each((_, img) => {
      const src = ($(img).attr('src') || '').toLowerCase();
      for (const kw of KEYWORDS) {
        if (src.includes(kw) && !matchedFromImages[kw]) {
          // Skip plate images (e.g. "perfect_game" in plate paths)
          if (src.includes('/plate/') || src.includes('game')) continue;
          matchedFromImages[kw] = extractNearbyValue($(img));
          found = true;
        }
      }
    });

    if (found) {
      perfect = matchedFromImages.perfect || 0;
      great = matchedFromImages.great || 0;
      good = matchedFromImages.good || 0;
      bad = matchedFromImages.bad || 0;
      miss = matchedFromImages.miss || 0;
    }
  }

  // Strategy 4: Positional approach — find all numeric text elements
  // beyond the main score. Breakdowns appear as 5 consecutive numbers
  // in order: PERFECT, GREAT, GOOD, BAD, MISS
  if (!found) {
    const allValues = [];
    // Broadened selectors to catch more element patterns
    $li.find('i.tx, span.num, i.num, span.tx, p.num, span.dd, p.dd, i.dd').each((_, el) => {
      const text = $(el).text().replace(/,/g, '').trim();
      const num = parseInt(text, 10);
      if (!isNaN(num)) allValues.push({ el, num, text });
    });

    // The first number is typically the score; the next 5 are breakdowns
    if (allValues.length >= 6) {
      [perfect, great, good, bad, miss] = allValues.slice(1, 6).map(v => v.num);
      found = true;
    } else if (allValues.length === 5) {
      [perfect, great, good, bad, miss] = allValues.map(v => v.num);
      found = true;
    }
  }

  // Strategy 5: Look for any container with 5+ child elements that have numeric content
  // (relaxed from exactly 5 to handle sections including MAX COMBO, KCAL, etc.)
  if (!found) {
    $li.find('div, ul').each((_, container) => {
      if (found) return;
      const children = $(container).children();
      if (children.length >= 5 && children.length <= 10) {
        const entries = [];
        children.each((_, child) => {
          const fullText = $(child).text().toLowerCase().replace(/,/g, '').trim();
          // Get the deepest numeric text element
          const numEl = $(child).find('i, span, p').last();
          const numText = numEl.length ? numEl.text().replace(/,/g, '').trim() : '';
          const n = parseInt(numText, 10);
          // Check for image-based labels too
          const imgSrc = ($(child).find('img').first().attr('src') || '').toLowerCase();
          entries.push({ text: fullText, imgSrc, num: isNaN(n) ? null : n });
        });

        // If entries contain judgment keywords (as text or images), use labeled matching
        const hasKeywords = entries.some(e =>
          /\bperfect\b/.test(e.text) || /\bgreat\b/.test(e.text) ||
          /\bgood\b/.test(e.text) || /\bbad\b/.test(e.text) || /\bmiss\b/.test(e.text) ||
          e.imgSrc.includes('perfect') || e.imgSrc.includes('great') ||
          e.imgSrc.includes('good') || e.imgSrc.includes('bad') || e.imgSrc.includes('miss')
        );

        if (hasKeywords) {
          for (const e of entries) {
            if (e.num !== null) {
              const label = e.imgSrc.includes('perfect') || e.imgSrc.includes('great') ||
                e.imgSrc.includes('good') || e.imgSrc.includes('bad') || e.imgSrc.includes('miss')
                ? e.imgSrc : e.text;
              assign(label, e.num);
            }
          }
        } else if (children.length === 5) {
          // Exactly 5 unlabeled children — assume positional order
          const nums = entries.filter(e => e.num !== null);
          if (nums.length === 5) {
            [perfect, great, good, bad, miss] = nums.map(e => e.num);
            found = true;
          }
        }
      }
    });
  }

  // Strategy 6: Raw HTML regex fallback — search the list item's HTML for
  // keyword-number patterns. Avoids matching plate names like "PERFECT GAME"
  if (!found) {
    const html = $li.html() || '';
    const htmlLower = html.toLowerCase();

    // Only attempt if the HTML actually contains at least some judgment keywords
    if (htmlLower.includes('perfect') || htmlLower.includes('great') || htmlLower.includes('miss')) {
      const results = {};
      // Match patterns like: >PERFECT</...> ... >1,367<
      // or: perfect ... 1367 (with limited gap to avoid cross-entry matching)
      const patterns = [
        { kw: 'perfect', re: /(?:>|"|')perfect(?:<|"|'|[\s:])[^]*?(?:>|"|')(\d[\d,]*)(?:<|"|')/gi },
        { kw: 'great', re: /(?:>|"|')great(?:<|"|'|[\s:])[^]*?(?:>|"|')(\d[\d,]*)(?:<|"|')/gi },
        { kw: 'good', re: /(?:>|"|')good(?:<|"|'|[\s:])[^]*?(?:>|"|')(\d[\d,]*)(?:<|"|')/gi },
        { kw: 'bad', re: /(?:>|"|')bad(?:<|"|'|[\s:])[^]*?(?:>|"|')(\d[\d,]*)(?:<|"|')/gi },
        { kw: 'miss', re: /(?:>|"|')miss(?:<|"|'|[\s:])[^]*?(?:>|"|')(\d[\d,]*)(?:<|"|')/gi },
      ];

      for (const { kw, re } of patterns) {
        const match = re.exec(html);
        if (match) {
          results[kw] = parseInt(match[1].replace(/,/g, ''), 10) || 0;
          found = true;
        }
      }

      if (found) {
        perfect = results.perfect || 0;
        great = results.great || 0;
        good = results.good || 0;
        bad = results.bad || 0;
        miss = results.miss || 0;
      }
    }
  }

  return { perfect, great, good, bad, miss, found };
}

/**
 * Scrape recently played page
 * Returns array of recent play objects
 */
async function scrapeRecentlyPlayed(client) {
  const res = await client.get(`${PIU_BASE}/my_page/recently_played.php`);
  const $ = cheerio.load(res.data);
  const plays = [];
  const machineName = parseRecentlyAccessGame($);

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

    // Plate (e.g. MARVELOUS GAME, PERFECT GAME, etc.)
    const plateImg = $li.find('.etc_con .st1 img, div.plate img').first().attr('src') || '';
    const plate = parsePlateFromUrl(plateImg);

    // Judgment breakdown (PERFECT, GREAT, GOOD, BAD, MISS)
    const breakdown = extractJudgmentBreakdown($, $li);
    const perfect = judgments.perfect ?? breakdown.perfect ?? 0;
    const great = judgments.great ?? breakdown.great ?? 0;
    const good = judgments.good ?? breakdown.good ?? 0;
    const bad = judgments.bad ?? breakdown.bad ?? 0;
    const miss = judgments.miss ?? breakdown.miss ?? 0;

    plays.push({
      song_title: songTitle,
      mode,
      level,
      score,
      grade,
      machine_name: machineName,
      plate,
      background_url: bgUrl,
      date_played: datePlayed,
      perfect,
      great,
      good,
      bad,
      miss,
      max_combo: 0,
      kcal: 0,
    });
  });

  return plays;
}

/**
 * Scrape pumbility ranking leaderboard (top 1000 players).
 * This is a public page — no login required.
 * Returns { rankings: [{ rank, player_name, pumbility }], threshold }
 */
async function scrapePumbilityRanking() {
  const client = createClient();
  const pageUrl = `${PIU_BASE}/leaderboard/pumbility_ranking.php`;
  const res = await client.get(pageUrl);

  const html = typeof res.data === 'string' ? res.data : '';
  const $ = cheerio.load(html);
  const listItems = $('.rating_ranking_wrap ul.list.pumbilitySt > li').length
    ? $('.rating_ranking_wrap ul.list.pumbilitySt > li')
    : $('.rating_ranking_wrap ul.list > li');

  const rankings = [];
  listItems.each((idx, li) => {
    const $li = $(li);

    // Use stable list position (1..1000) for unique storage.
    // PIUGame can emit duplicate displayed ranks for ties, which breaks a PRIMARY KEY(rank) cache table.
    const rank = idx + 1;

    const playerName = collapseWhitespace(
      $li.find('.name .name_w .profile_name').first().text()
      || $li.find('.profile_name .t1').first().text()
      || $li.find('.profile_name').first().text()
    );
    if (!playerName || playerName.startsWith('#')) return;

    const pumbilityText = collapseWhitespace(
      $li.find('.score i.tt, .profile_name .t2, .pumbility i.tt, .rating i.tt').first().text()
    );
    const pumbility = parseInt((pumbilityText || '').replace(/,/g, ''), 10) || 0;

    rankings.push({ rank, player_name: playerName, pumbility });
  });

  const top1000 = rankings.slice(0, 1000);
  const threshold = top1000.length > 0
    ? (parseInt(top1000[top1000.length - 1].pumbility, 10) || 0)
    : 0;

  return { rankings: top1000, threshold };
}

/**
 * Scrape all Over Lv.20 chart entries and each chart's TOP 100 ranking list.
 * Public pages; no account login required.
 */
async function scrapeOverRankingTop100(
  {
    lang = 'en',
    listDelayMs = 120,
    chartDelayMs = 100,
    chartConcurrency = 1,
    maxPages = 250,
    maxCharts = 3000,
    onProgress = null,
  } = {}
) {
  const client = createClient();
  const listBaseUrl = `${PIU_BASE}/leaderboard/over_ranking.php`;

  // Warm up + set preferred language before scraping pages.
  await client.get(`${listBaseUrl}?page=1`);
  if (lang) {
    try {
      await setLanguage(client, lang);
    } catch (err) {
      // Continue even if language switching fails; selectors are class-based.
    }
  }

  const discoveredCharts = [];
  const seenCharts = new Set();
  let totalPages = 1;
  const cappedMaxPages = Math.max(1, parseInt(maxPages, 10) || 1);

  for (let page = 1; page <= cappedMaxPages && page <= totalPages; page++) {
    if (page > 1 && listDelayMs > 0) await delay(listDelayMs);

    const pageRes = await client.get(`${listBaseUrl}?page=${page}`);
    const parsed = parseOverRankingListPage(pageRes.data);
    totalPages = Math.max(totalPages, parsed.total_pages || 1);

    for (const row of parsed.rows) {
      const key = `${row.song_title}|${row.mode}|${row.level}|${row.source_no}`;
      if (seenCharts.has(key)) continue;
      seenCharts.add(key);
      discoveredCharts.push(row);
      if (discoveredCharts.length >= maxCharts) break;
    }

    if (discoveredCharts.length >= maxCharts) break;
    if (parsed.rows.length === 0 && page >= totalPages) break;
  }

  const charts = [];
  const failedCharts = [];
  const normalizedConcurrency = Math.max(1, parseInt(chartConcurrency, 10) || 1);
  const totalCharts = discoveredCharts.length;
  let completedCharts = 0;

  async function scrapeChart(chart) {
    try {
      const fallbackPath = chart.source_no
        ? `/leaderboard/over_ranking_view.php?no=${encodeURIComponent(chart.source_no)}`
        : '/leaderboard/over_ranking_view.php';
      const viewUrl = new URL(chart.view_path || fallbackPath, PIU_BASE).toString();
      const viewRes = await client.get(viewUrl);
      const parsedChart = parseOverRankingChartPage(viewRes.data, chart);
      if (!parsedChart.song_title || parsedChart.level <= 0) {
        failedCharts.push({
          source_no: chart.source_no || '',
          reason: 'Missing chart header',
        });
        return;
      }
      charts.push(parsedChart);
    } catch (err) {
      failedCharts.push({
        source_no: chart.source_no || '',
        reason: err.message || 'Chart scrape failed',
      });
    } finally {
      completedCharts += 1;
      if (typeof onProgress === 'function') {
        try {
          onProgress(completedCharts, totalCharts);
        } catch (_) {}
      }
    }
  }

  if (normalizedConcurrency <= 1) {
    for (let i = 0; i < discoveredCharts.length; i++) {
      if (i > 0 && chartDelayMs > 0) await delay(chartDelayMs);
      await scrapeChart(discoveredCharts[i]);
    }
  } else {
    let cursor = 0;
    const workerCount = Math.min(normalizedConcurrency, discoveredCharts.length);
    const workers = Array.from({ length: workerCount }, async () => {
      let processed = 0;
      while (cursor < discoveredCharts.length) {
        const idx = cursor;
        cursor += 1;
        if (processed > 0 && chartDelayMs > 0) await delay(chartDelayMs);
        processed += 1;
        await scrapeChart(discoveredCharts[idx]);
      }
    });
    await Promise.all(workers);
  }

  return {
    charts,
    total_pages: totalPages,
    discovered_charts: discoveredCharts.length,
    failed_charts: failedCharts,
    scraped_at: new Date().toISOString(),
  };
}

module.exports = {
  login,
  createClient,
  setLanguage,
  scrapePumbility,
  scrapeBestScores,
  scrapeTopSongs,
  scrapeRecentlyPlayed,
  scrapePumbilityRanking,
  scrapeOverRankingTop100,
};

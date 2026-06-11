const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { getDb, SYSTEM_USER_ID } = require('./db/schema');
const { buildUserAvatarPath, isInlineDataAvatar } = require('./lib/avatarProxy');
const { splitLiveSessionContent } = require('./lib/liveSessionMarker');
const { splitWcSummaryContent } = require('./lib/weeklyChallengeSummaryMarker');
const { splitWcPersonalContent } = require('./lib/weeklyChallengePersonalMarker');

const SHARE_MARKER_REGEX = /\[\[SHINSA_SHARE_V1:([A-Za-z0-9+/=_-]+)\]\]/;
const SUMMARY_MARKER_REGEX = /\[\[SHINSA_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g;
const PLAN_MARKER_REGEX = /\[\[SHINSA_SESSION_PLAN_V1:[A-Za-z0-9+/=_-]+\]\]/g;
const SHARE_PREVIEW_RENDER_VERSION = '20260405d';
const SONG_ALIAS_OVERRIDES = {
  'papasito (feat. kutina)': 'papasito feat. kutina',
  '파파시토 (feat. kutina)': 'papasito feat. kutina',
};
const PLATE_NAMES = {
  PG: 'PERFECT GAME',
  UG: 'ULTIMATE GAME',
  EG: 'EXTREME GAME',
  SG: 'SUPERB GAME',
  MG: 'MARVELOUS GAME',
  TG: 'TALENTED GAME',
  FG: 'FAIR GAME',
  RG: 'ROUGH GAME',
};

function getRequestOrigin(req) {
  // Respect proxies (Render/Fly/NGINX) while still working locally.
  const protoHeader = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = protoHeader || req.protocol || 'http';
  const hostHeader = (req.get('x-forwarded-host') || '').split(',')[0].trim();
  const host = hostHeader || req.get('host');
  return `${proto}://${host}`;
}

function normalizeWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function textSnippet(s, maxLen) {
  const txt = normalizeWhitespace(s);
  if (!txt) return '';
  if (txt.length <= maxLen) return txt;
  return `${txt.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
}

function parseSessionShareMarker(content) {
  const raw = String(content || '');
  const match = raw.match(SHARE_MARKER_REGEX);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function buildPreviewImageUrl(origin, pathname, version = '') {
  const params = new URLSearchParams();
  if (version) params.set('v', version);
  params.set('rv', SHARE_PREVIEW_RENDER_VERSION);
  const query = params.toString();
  return `${origin}${pathname}${query ? `?${query}` : ''}`;
}

function splitSessionShareContent(content) {
  const raw = String(content || '');
  const match = raw.match(SHARE_MARKER_REGEX);
  if (!match) {
    return { text: raw, share: null };
  }
  return {
    text: raw.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim(),
    share: parseSessionShareMarker(raw),
  };
}

function stripPreviewMarkers(content) {
  return String(content || '')
    .replace(/\[\[SHINSA_WC_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(/\[\[SHINSA_WC_PERSONAL_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(SUMMARY_MARKER_REGEX, '')
    .replace(SHARE_MARKER_REGEX, '')
    .replace(/\[\[SHINSA_LIVE_V1:[A-Za-z0-9+/=_-]+\]\]/g, '')
    .replace(PLAN_MARKER_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function summarizePostContent(post, maxLen = 160) {
  // Check for WC summary marker first
  const { summary: wcSummary } = splitWcSummaryContent(post?.content || '');
  if (wcSummary) {
    return textSnippet(`${wcSummary.weekLabel} \u2014 ${wcSummary.participantCount} players, ${wcSummary.totalClears} clears`, maxLen);
  }

  // Check for personal recap marker
  const { personal: wcPersonal } = splitWcPersonalContent(post?.content || '');
  if (wcPersonal) {
    return textSnippet(`${wcPersonal.weekLabel} \u2014 Weekly challenge recap`, maxLen);
  }

  const { text: shareStrippedText, share } = splitSessionShareContent(post?.content || '');
  const { text: liveStrippedText, live } = splitLiveSessionContent(shareStrippedText || '');
  const cleanText = textSnippet(stripPreviewMarkers(liveStrippedText || ''), maxLen);
  if (cleanText) return cleanText;
  if (share) {
    const topRow = Array.isArray(share.rows) ? share.rows[0] : null;
    const pieces = [
      share.sessionTitle || '',
      share.sessionDateLabel || '',
      share.sessionTimeRange || '',
      share.songCount ? `${share.songCount} songs` : '',
      share.clearCount ? `${share.clearCount} clears` : '',
      topRow?.song_title || '',
    ].filter(Boolean);
    const shareSummary = textSnippet(pieces.join(' • '), maxLen);
    if (shareSummary) return shareSummary;
  }
  if (!live) return '';

  const pieces = [
    live.sessionTitle || 'Live session',
    live.sessionDateLabel || '',
    live.sessionTimeRange || '',
    live.songCount ? `${live.songCount} songs` : '',
    live.clearCount ? `${live.clearCount} clears` : '',
  ].filter(Boolean);
  return textSnippet(pieces.join(' • '), maxLen);
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
  } catch {
    return null;
  }
}

function wrapTextByChars(text, maxCharsPerLine, maxLines) {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) return { lines: [], truncated: false };

  const words = cleaned.split(' ');
  const lines = [];
  let line = '';

  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxCharsPerLine) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = w;
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && line) lines.push(line);

  const joined = lines.join(' ');
  const truncated = cleaned.length > joined.length;
  if (truncated && lines.length > 0) {
    const lastIdx = lines.length - 1;
    const last = lines[lastIdx];
    lines[lastIdx] = last.endsWith('...') ? last : `${last.replace(/\.*$/, '')}...`;
  }

  return { lines, truncated };
}

function upsertMeta($, { selector, attrName, key, content }) {
  const head = $('head');
  let node = $(selector).first();
  if (!node.length) {
    head.append(`<meta ${attrName}="${escapeXml(key)}" content="${escapeXml(content)}">`);
    return;
  }
  node.attr('content', content);
}

function upsertLink($, { rel, href }) {
  const head = $('head');
  let node = $(`link[rel="${rel}"]`).first();
  if (!node.length) {
    head.append(`<link rel="${escapeXml(rel)}" href="${escapeXml(href)}">`);
    return;
  }
  node.attr('href', href);
}

function injectSocialMeta(indexHtml, meta) {
  const $ = cheerio.load(indexHtml);

  if ($('title').length) $('title').text(meta.title || 'Pump Shinsa');
  else $('head').append(`<title>${escapeXml(meta.title || 'Pump Shinsa')}</title>`);

  upsertLink($, { rel: 'canonical', href: meta.url });

  upsertMeta($, { selector: 'meta[property="og:type"]', attrName: 'property', key: 'og:type', content: meta.type || 'website' });
  upsertMeta($, { selector: 'meta[property="og:site_name"]', attrName: 'property', key: 'og:site_name', content: meta.siteName || 'Pump Shinsa' });
  upsertMeta($, { selector: 'meta[property="og:title"]', attrName: 'property', key: 'og:title', content: meta.title });
  upsertMeta($, { selector: 'meta[property="og:description"]', attrName: 'property', key: 'og:description', content: meta.description });
  upsertMeta($, { selector: 'meta[property="og:url"]', attrName: 'property', key: 'og:url', content: meta.url });
  upsertMeta($, { selector: 'meta[property="og:image"]', attrName: 'property', key: 'og:image', content: meta.image });
  upsertMeta($, { selector: 'meta[property="og:image:secure_url"]', attrName: 'property', key: 'og:image:secure_url', content: meta.image });
  upsertMeta($, { selector: 'meta[property="og:image:type"]', attrName: 'property', key: 'og:image:type', content: meta.imageType || 'image/jpeg' });
  if (meta.imageWidth) upsertMeta($, { selector: 'meta[property="og:image:width"]', attrName: 'property', key: 'og:image:width', content: String(meta.imageWidth) });
  if (meta.imageHeight) upsertMeta($, { selector: 'meta[property="og:image:height"]', attrName: 'property', key: 'og:image:height', content: String(meta.imageHeight) });
  if (meta.imageAlt) upsertMeta($, { selector: 'meta[property="og:image:alt"]', attrName: 'property', key: 'og:image:alt', content: meta.imageAlt });

  upsertMeta($, { selector: 'meta[name="twitter:card"]', attrName: 'name', key: 'twitter:card', content: meta.twitterCard || 'summary_large_image' });
  upsertMeta($, { selector: 'meta[name="twitter:title"]', attrName: 'name', key: 'twitter:title', content: meta.title });
  upsertMeta($, { selector: 'meta[name="twitter:description"]', attrName: 'name', key: 'twitter:description', content: meta.description });
  upsertMeta($, { selector: 'meta[name="twitter:image"]', attrName: 'name', key: 'twitter:image', content: meta.image });
  if (meta.imageAlt) upsertMeta($, { selector: 'meta[name="twitter:image:alt"]', attrName: 'name', key: 'twitter:image:alt', content: meta.imageAlt });

  // Keep the app's existing meta name="description" in sync as well.
  if (meta.description) {
    if ($('meta[name="description"]').length) $('meta[name="description"]').attr('content', meta.description);
    else $('head').append(`<meta name="description" content="${escapeXml(meta.description)}">`);
  }

  return $.html();
}

async function renderPostOgJpeg({
  post,
  brandAssets = null,
  clientBuildDir,
  origin,
  contextLabel = '',
  width = 1200,
  height = 630,
}) {
  const { text: shareStrippedText, share } = splitSessionShareContent(post?.content || '');
  const { text: liveStrippedText, live } = splitLiveSessionContent(shareStrippedText || '');
  const cleanText = stripPreviewMarkers(liveStrippedText || '');
  const db = getDb();

  if (share && Array.isArray(share.rows) && share.rows.length > 0) {
    const items = share.rows.slice(0, 6).map((row) => ({ ...row }));
    await attachArtworkBuffersToItems({ db, items, clientBuildDir, origin });
    return renderSessionShareOgJpeg({
      post,
      share,
      items,
      cleanText,
      brandAssets,
      contextLabel,
      width,
      height,
    });
  }

  const liveItems = Array.isArray(live?.topSongsByScore) && live.topSongsByScore.length > 0
    ? live.topSongsByScore.slice(0, 6).map((row) => ({ ...row }))
    : Array.isArray(live?.topSongsByRating) && live.topSongsByRating.length > 0
      ? live.topSongsByRating.slice(0, 6).map((row) => ({ ...row }))
      : [];
  if (live && liveItems.length > 0) {
    await attachArtworkBuffersToItems({ db, items: liveItems, clientBuildDir, origin });
    return renderLiveSessionOgJpeg({
      post,
      live,
      items: liveItems,
      cleanText,
      brandAssets,
      contextLabel,
      width,
      height,
    });
  }

  const mediaBuffers = await loadPostMediaBuffers({
    post,
    clientBuildDir,
    origin,
    limit: 4,
  });
  if (mediaBuffers.length > 0) {
    return renderMediaPostOgJpeg({
      post,
      mediaBuffers,
      cleanText,
      brandAssets,
      contextLabel,
      width,
      height,
    });
  }

  return renderTextPostOgJpeg({
    post,
    cleanText,
    brandAssets,
    contextLabel,
    width,
    height,
  });
}

function parseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function modeShort(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'single') return 'S';
  if (normalized === 'double') return 'D';
  if (normalized === 'coop' || normalized === 'co-op') return 'C';
  return '';
}

function formatDisplayGrade(rawGrade) {
  const source = String(rawGrade || '').trim();
  if (!source) return '';

  const isBroken = /^x(?:[_-]|$)\s*/i.test(source);
  const stripped = isBroken ? source.replace(/^x(?:[_-]|$)\s*/i, '').trim() : source;
  if (!stripped) return '';
  if (!isBroken) return stripped;

  return stripped.replace(/(?:[_-]p|\+)$/i, '');
}

function formatPreviewDateLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const candidate = hasExplicitTimezone || /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    if (raw.length >= 16) return raw.slice(0, 16).replace('T', ' ');
    return raw;
  }
  const hasTime = /(?:T|\s)\d{2}:\d{2}/.test(raw);
  return hasTime
    ? parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    : parsed.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
}

function getPlateName(value) {
  const code = String(value || '').trim().toUpperCase();
  return PLATE_NAMES[code] || code;
}

function summarizeUpscore(upscore) {
  const username = upscore?.username ? `@${upscore.username}` : 'A player';
  const items = parseJsonArray(upscore?.upscores_json);
  if (items.length === 0) {
    return {
      title: `${username} score update`,
      description: `${username} posted a score improvement on Pump Shinsa.`,
      headline: 'Score Update',
      subline: `${username} improved a score`,
    };
  }

  const first = items[0] || {};
  const firstSong = String(first.song_title || '').trim() || 'a chart';
  const firstMode = modeShort(first.mode);
  const firstLevel = parseInt(first.level, 10) || 0;
  const firstLabel = `${firstSong}${firstMode && firstLevel ? ` (${firstMode}${firstLevel})` : ''}`;
  const gains = items.map((it) => (parseInt(it.new_score, 10) || 0) - (parseInt(it.old_score, 10) || 0));
  const maxGain = Math.max(0, ...gains);
  const multi = items.length > 1;

  return {
    title: multi
      ? `${username} improved ${items.length} scores`
      : `${username} improved ${firstLabel}`,
    description: multi
      ? `${username} improved ${items.length} songs on Pump Shinsa${maxGain > 0 ? ` (largest gain +${maxGain.toLocaleString()})` : ''}.`
      : `${username} improved ${firstLabel} on Pump Shinsa${maxGain > 0 ? ` by +${maxGain.toLocaleString()}` : ''}.`,
    headline: multi ? `${items.length} Score Improvements` : firstLabel,
    subline: maxGain > 0 ? `Largest gain +${maxGain.toLocaleString()}` : 'Updated on Pump Shinsa',
  };
}

function summarizeClear(clear) {
  const username = clear?.username ? `@${clear.username}` : 'A player';
  const items = parseJsonArray(clear?.clears_json);
  const source = items.length > 0 ? items : [{
    song_title: clear?.song_title || '',
    mode: clear?.mode || '',
    level: clear?.level || '',
    grade: clear?.grade || '',
    entry_type: 'song_clear',
  }];

  const first = source[0] || {};
  const isTitleUnlock = String(first.entry_type || '').toLowerCase() === 'title_unlock';
  const multi = source.length > 1;

  if (isTitleUnlock) {
    const firstTitle = String(first.title_name || first.song_title || 'a title').trim();
    return {
      title: multi
        ? `${username} unlocked ${source.length} skill titles`
        : `${username} unlocked ${firstTitle}`,
      description: multi
        ? `${username} unlocked ${source.length} new skill titles on Pump Shinsa.`
        : `${username} unlocked ${firstTitle} on Pump Shinsa.`,
      headline: multi ? `${source.length} New Skill Titles` : firstTitle,
      subline: 'Skill title unlock update',
    };
  }

  const firstSong = String(first.song_title || '').trim() || 'a chart';
  const firstMode = modeShort(first.mode);
  const firstLevel = parseInt(first.level, 10) || 0;
  const firstLabel = `${firstSong}${firstMode && firstLevel ? ` (${firstMode}${firstLevel})` : ''}`;
  const firstGrade = String(first.grade || '').replace(/^x[_-]\s*/i, '').trim();

  return {
    title: multi
      ? `${username} posted ${source.length} new clears`
      : `${username} cleared ${firstLabel}`,
    description: multi
      ? `${username} posted ${source.length} new clears on Pump Shinsa.`
      : `${username} cleared ${firstLabel} on Pump Shinsa${firstGrade ? ` with ${firstGrade}` : ''}.`,
    headline: multi ? `${source.length} New Clears` : firstLabel,
    subline: firstGrade ? `Grade ${firstGrade}` : 'Clear update',
  };
}

function summarizePlay(play) {
  const username = play?.username ? `@${play.username}` : 'A player';
  const songTitle = String(play?.song_title || '').trim() || 'a chart';
  const playMode = modeShort(play?.mode);
  const playLevel = parseInt(play?.level, 10) || 0;
  const playLabel = `${songTitle}${playMode && playLevel ? ` (${playMode}${playLevel})` : ''}`;
  const playGrade = String(play?.grade || '').replace(/^x[_-]\s*/i, '').trim();
  const playScore = parseInt(play?.score, 10) || 0;

  return {
    title: `${username} played ${playLabel}`,
    description: `${username} scored ${formatScore(playScore)} on ${playLabel} on Pump Shinsa${playGrade ? ` with ${playGrade}` : ''}.`,
    headline: playLabel,
    subline: `${playGrade ? `${playGrade} • ` : ''}${playScore > 0 ? formatScore(playScore) : 'Recent play'}`,
  };
}

function toAbsolutePreviewUrl(origin, value, fallbackPath = '/icons/app-icon-1024.png') {
  const raw = String(value || '').trim();
  if (!raw) return `${origin}${fallbackPath}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${origin}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function guessPreviewImageType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.endsWith('.png')) return 'image/png';
  if (raw.endsWith('.webp')) return 'image/webp';
  if (raw.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function findSongPreviewRowByTitle(db, query) {
  const normalizedQuery = normalizeWhitespace(query);
  if (!normalizedQuery) return null;

  const exact = db.prepare(`
    SELECT
      id,
      title,
      artist,
      mode,
      level,
      COALESCE(NULLIF(jacket_url, ''), '') AS artwork_url
    FROM songs
    WHERE lower(title) = lower(?)
    ORDER BY
      CASE mode
        WHEN 'Single' THEN 0
        WHEN 'Double' THEN 1
        ELSE 2
      END,
      level ASC,
      id ASC
    LIMIT 1
  `).get(normalizedQuery);
  if (exact) return exact;

  return db.prepare(`
    SELECT
      id,
      title,
      artist,
      mode,
      level,
      COALESCE(NULLIF(jacket_url, ''), '') AS artwork_url
    FROM songs
    WHERE lower(title) LIKE lower(?)
    ORDER BY
      CASE
        WHEN lower(title) LIKE lower(?) THEN 0
        ELSE 1
      END,
      CASE mode
        WHEN 'Single' THEN 0
        WHEN 'Double' THEN 1
        ELSE 2
      END,
      level ASC,
      id ASC
    LIMIT 1
  `).get(`%${normalizedQuery}%`, `${normalizedQuery}%`);
}

function summarizeSongChart(chart) {
  const songTitle = String(chart?.title || '').trim() || 'Song chart';
  const chartMode = modeShort(chart?.mode);
  const chartLevel = parseInt(chart?.level, 10) || 0;
  const chartLabel = chartMode && chartLevel ? `${chartMode}${chartLevel}` : '';
  const artist = normalizeWhitespace(String(chart?.artist || ''));

  return {
    title: chartLabel
      ? `${songTitle} • ${chartLabel} • Pump Shinsa`
      : `${songTitle} • Pump Shinsa`,
    description: artist
      ? `${songTitle}${chartLabel ? ` (${chartLabel})` : ''} by ${artist}. View chart info, scores, and replays on Pump Shinsa.`
      : `${songTitle}${chartLabel ? ` (${chartLabel})` : ''}. View chart info, scores, and replays on Pump Shinsa.`,
    imageAlt: chartLabel
      ? `${songTitle} ${chartLabel} jacket art`
      : `${songTitle} jacket art`,
  };
}

function summarizeSongSearch(row, query) {
  const songTitle = String(row?.title || query || '').trim() || 'Song';
  const artist = normalizeWhitespace(String(row?.artist || ''));
  return {
    title: `${songTitle} • Pump Shinsa`,
    description: artist
      ? `${songTitle} by ${artist}. Explore charts, scores, and replays on Pump Shinsa.`
      : `${songTitle}. Explore charts, scores, and replays on Pump Shinsa.`,
    imageAlt: `${songTitle} jacket art`,
  };
}

function formatScore(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getModeAccent(mode) {
  if (mode === 'Single') {
    return {
      from: '#fb7185',
      to: '#be123c',
      border: 'rgba(251,113,133,0.38)',
      fill: 'rgba(251,113,133,0.18)',
    };
  }
  if (mode === 'Double') {
    return {
      from: '#34d399',
      to: '#047857',
      border: 'rgba(52,211,153,0.38)',
      fill: 'rgba(52,211,153,0.18)',
    };
  }
  return {
    from: '#60a5fa',
    to: '#1d4ed8',
    border: 'rgba(96,165,250,0.40)',
    fill: 'rgba(96,165,250,0.18)',
  };
}

function getGradeAccent(grade) {
  const normalized = formatDisplayGrade(grade).toUpperCase();
  if (normalized.includes('SSS')) return '#7dd3fc';
  if (normalized.includes('SS')) return '#fde68a';
  if (normalized.startsWith('S')) return '#fbbf24';
  if (normalized.startsWith('AAA')) return '#e5e7eb';
  if (normalized.startsWith('AA')) return '#d6b386';
  if (normalized.startsWith('A')) return '#f59e0b';
  return '#d1d5db';
}

function chartBadgeLabel(mode, level) {
  const parsedLevel = parseInt(level, 10);
  return `${modeShort(mode) || 'X'}${parsedLevel > 0 ? parsedLevel : '?'}`;
}

function textWidthEstimate(text, perChar = 9, base = 18) {
  return base + (String(text || '').length * perChar);
}

function localAssetPathFromPublicUrl(clientBuildDir, publicUrl) {
  const normalized = String(publicUrl || '').trim();
  if (!normalized.startsWith('/')) return '';
  const relativePath = normalized.replace(/^\/+/, '').split('/').join(path.sep);
  return path.join(clientBuildDir, relativePath);
}

async function fetchImageBuffer(url) {
  const normalized = String(url || '').trim();
  if (!/^https?:\/\//i.test(normalized)) return null;
  try {
    const response = await fetch(normalized, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: {
        'user-agent': 'Pump-Shinsa-OG/1.0',
      },
    });
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

let cachedWordmarkBuffer = null;
let cachedPreviewSongAliases = null;
let cachedPreviewJacketMap = null;

function resolveAbsoluteUrl(origin, target) {
  const value = String(target || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${origin}${value}`;
  return `${origin}/${value.replace(/^\/+/, '')}`;
}

function normalizeSongName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function compactSongName(name) {
  return normalizeSongName(name).replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizePreviewMode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'single' || raw === 's') return 'Single';
  if (raw === 'double' || raw === 'd') return 'Double';
  if (raw === 'coop' || raw === 'co-op' || raw === 'co op' || raw === 'c') return 'CoOp';
  return String(mode || '').trim();
}

function loadPreviewSongAliases() {
  if (cachedPreviewSongAliases) return cachedPreviewSongAliases;
  const aliasesPath = path.join(__dirname, 'data', 'piugame-song-aliases.json');
  const topSongsPath = path.join(__dirname, 'data', 'piugame-top-songs-202602-total.json');
  const normalizedAliases = {};

  const upsertAlias = (alias, canonical, { overwrite = false } = {}) => {
    const canonicalNorm = normalizeSongName(canonical);
    if (!canonicalNorm) return;
    for (const key of [normalizeSongName(alias), compactSongName(alias)]) {
      if (!key || key === canonicalNorm) continue;
      if (!overwrite && normalizedAliases[key]) continue;
      normalizedAliases[key] = canonicalNorm;
    }
  };

  try {
    if (fs.existsSync(aliasesPath)) {
      const data = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
      const rawAliases = (data && typeof data.aliases === 'object' && data.aliases) || {};
      for (const [alias, canonical] of Object.entries(rawAliases)) {
        upsertAlias(alias, canonical);
      }
    }

    if (fs.existsSync(topSongsPath)) {
      const data = JSON.parse(fs.readFileSync(topSongsPath, 'utf8'));
      const songs = Array.isArray(data?.songs) ? data.songs : [];
      for (const song of songs) {
        const canonical = song?.canonical_title || song?.title_en || song?.title_kr || '';
        upsertAlias(song?.title_en, canonical);
        upsertAlias(song?.title_kr, canonical);
        upsertAlias(song?.canonical_title, canonical);
      }
    }

    for (const [alias, canonical] of Object.entries(SONG_ALIAS_OVERRIDES)) {
      upsertAlias(alias, canonical, { overwrite: true });
    }

    cachedPreviewSongAliases = normalizedAliases;
    return cachedPreviewSongAliases;
  } catch (err) {
    console.warn('Share preview: failed to load song aliases:', err.message);
    cachedPreviewSongAliases = normalizedAliases;
    return cachedPreviewSongAliases;
  }
}

function toCanonicalPreviewTitle(title, aliases) {
  let normalized = normalizeSongName(title);
  if (!normalized) return '';
  const seen = new Set();
  let aliasKey = normalized;
  const compact = compactSongName(title);
  if (!aliases[aliasKey] && compact && aliases[compact]) {
    aliasKey = compact;
  }
  while (aliases[aliasKey] && !seen.has(aliasKey)) {
    seen.add(aliasKey);
    normalized = aliases[aliasKey];
    aliasKey = normalized;
  }
  return normalizeSongName(normalized);
}

function getPreviewJacketMap(db) {
  if (cachedPreviewJacketMap) return cachedPreviewJacketMap;
  const aliases = loadPreviewSongAliases();
  const rows = db.prepare(`
    SELECT title, mode, level, jacket_url
    FROM songs
    WHERE jacket_url != ''
  `).all();

  const map = {};
  const chartKeysBySong = {};
  for (const row of rows) {
    const normalizedTitle = normalizeSongName(row.title);
    const compactTitle = compactSongName(row.title);
    const normalizedMode = normalizePreviewMode(row.mode);
    const level = parseInt(row.level, 10) || 0;
    const jacketUrl = String(row.jacket_url || '').trim();
    if (!normalizedTitle || !normalizedMode || !level || !jacketUrl) continue;

    if (!map[normalizedTitle]) map[normalizedTitle] = jacketUrl;
    if (compactTitle && !map[compactTitle]) map[compactTitle] = jacketUrl;
    const chartKey = `${normalizedTitle}|${normalizedMode}|${level}`;
    if (!map[chartKey]) map[chartKey] = jacketUrl;
    if (compactTitle) {
      const compactChartKey = `${compactTitle}|${normalizedMode}|${level}`;
      if (!map[compactChartKey]) map[compactChartKey] = jacketUrl;
    }

    if (!chartKeysBySong[normalizedTitle]) chartKeysBySong[normalizedTitle] = [];
    chartKeysBySong[normalizedTitle].push({ mode: normalizedMode, level, jacketUrl });
  }

  for (const [aliasNorm, canonicalNorm] of Object.entries(aliases)) {
    const canonicalJacket = map[canonicalNorm];
    if (canonicalJacket && !map[aliasNorm]) map[aliasNorm] = canonicalJacket;
    for (const chart of (chartKeysBySong[canonicalNorm] || [])) {
      const aliasChartKey = `${aliasNorm}|${chart.mode}|${chart.level}`;
      if (!map[aliasChartKey]) map[aliasChartKey] = chart.jacketUrl;
    }
  }

  cachedPreviewJacketMap = map;
  return cachedPreviewJacketMap;
}

function resolveUserAvatarSource({ avatar = '', userId = '', avatarVersion = 0 }) {
  const raw = String(avatar || '').trim();
  if (!raw) return '';
  if (isInlineDataAvatar(raw)) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
  if (raw.startsWith('avatars/')) return `/${raw}`;
  if (userId) return buildUserAvatarPath(userId, 128, avatarVersion);
  return `/${raw.replace(/^\/+/, '')}`;
}

async function ensureWordmarkBuffer(clientBuildDir) {
  if (cachedWordmarkBuffer) return cachedWordmarkBuffer;
  const wordmarkPath = path.join(clientBuildDir, 'pump-shinsa-wordmark.svg');
  cachedWordmarkBuffer = await sharp(wordmarkPath)
    .resize({ width: 250, height: 44, fit: 'inside' })
    .png()
    .toBuffer();
  return cachedWordmarkBuffer;
}

async function loadImageBuffer({ clientBuildDir, origin, source = '' }) {
  const value = String(source || '').trim();
  if (!value) return null;

  const decoded = decodeDataUrl(value);
  if (decoded?.buffer?.length) return decoded.buffer;

  if (value.startsWith('/')) {
    const localPath = localAssetPathFromPublicUrl(clientBuildDir, value);
    if (localPath && fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
    return fetchImageBuffer(resolveAbsoluteUrl(origin, value));
  }

  if (/^https?:\/\//i.test(value)) {
    return fetchImageBuffer(value);
  }

  return null;
}

async function buildBrandAssets({
  clientBuildDir,
  origin,
  username = '',
  avatar = '',
  userId = '',
  avatarVersion = 0,
}) {
  const assets = {
    wordmarkBuffer: await ensureWordmarkBuffer(clientBuildDir),
    avatarBuffer: null,
    usernameLabel: username ? `@${String(username).replace(/^@+/, '')}` : '@player',
  };

  const avatarSource = resolveUserAvatarSource({
    avatar,
    userId,
    avatarVersion,
  });
  const avatarBuffer = await loadImageBuffer({
    clientBuildDir,
    origin,
    source: avatarSource,
  });
  if (!avatarBuffer?.length) return assets;

  assets.avatarBuffer = await sharp(avatarBuffer)
    .rotate()
    .resize(72, 72, { fit: 'cover' })
    .composite([{
      input: Buffer.from('<svg width="72" height="72" xmlns="http://www.w3.org/2000/svg"><circle cx="36" cy="36" r="36" fill="#fff"/></svg>'),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();
  return assets;
}

function brandedBaseSvg({ width, height, usernameLabel = '@player' }) {
  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#07111c"/>
        <stop offset="55%" stop-color="#0b1730"/>
        <stop offset="100%" stop-color="#0e1222"/>
      </linearGradient>
      <linearGradient id="topBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(56,189,248,0.28)"/>
        <stop offset="50%" stop-color="rgba(59,130,246,0.18)"/>
        <stop offset="100%" stop-color="rgba(236,72,153,0.18)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)" />
    <rect x="0" y="0" width="${width}" height="88" fill="url(#topBar)" />
    <rect x="40" y="24" width="${width - 80}" height="${height - 48}" rx="28" fill="rgba(5,10,20,0.14)" stroke="rgba(148,163,184,0.10)" />
    <text x="${width - 128}" y="58" fill="rgba(255,255,255,0.72)" font-size="22" text-anchor="end" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(usernameLabel)}</text>
  </svg>
  `;
}

function buildBrandComposites({ width, brandAssets }) {
  const composites = [];
  if (brandAssets?.wordmarkBuffer) {
    composites.push({
      input: brandAssets.wordmarkBuffer,
      left: 62,
      top: 38,
    });
  }
  if (brandAssets?.avatarBuffer) {
    composites.push({
      input: brandAssets.avatarBuffer,
      left: width - 128,
      top: 20,
    });
    composites.push({
      input: Buffer.from('<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="38.5" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="3"/></svg>'),
      left: width - 132,
      top: 16,
    });
  }
  return composites;
}

async function loadPreviewArtworkBuffer({ clientBuildDir, origin = '', jacketUrl = '', backgroundUrl = '' }) {
  const jacketBuffer = await loadImageBuffer({
    clientBuildDir,
    origin,
    source: jacketUrl,
  });
  if (jacketBuffer?.length) return jacketBuffer;
  return loadImageBuffer({
    clientBuildDir,
    origin,
    source: backgroundUrl,
  });
}

function formatDecimal(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toFixed(digits).replace(/\.0+$/, '');
}

function parsePostImageSources(post) {
  return parseJsonArray(post?.images).map((entry) => {
    if (typeof entry === 'string') return entry;
    return String(
      entry?.url
      || entry?.src
      || entry?.image
      || entry?.image_url
      || entry?.dataUrl
      || ''
    ).trim();
  }).filter(Boolean);
}

async function buildRoundedImageBuffer(buffer, width, height, radius = 18) {
  if (!buffer?.length) return null;
  return sharp(buffer)
    .rotate()
    .resize(width, height, { fit: 'cover' })
    .composite([{
      input: Buffer.from(
        `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
      ),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();
}

async function attachArtworkBuffersToItems({
  db,
  items,
  clientBuildDir,
  origin = '',
}) {
  for (const item of items) {
    const jacketUrl = String(item?.jacket_url || '').trim() || resolveUpscoreItemJacketUrl(db, item);
    item._artworkBuffer = await loadPreviewArtworkBuffer({
      clientBuildDir,
      origin,
      jacketUrl,
      backgroundUrl: item?.background_url || '',
    });
  }
}

async function loadPostMediaBuffers({
  post,
  clientBuildDir,
  origin = '',
  limit = 4,
}) {
  const sources = parsePostImageSources(post).slice(0, limit);
  const buffers = [];
  for (const source of sources) {
    const buffer = await loadImageBuffer({
      clientBuildDir,
      origin,
      source,
    });
    if (buffer?.length) buffers.push(buffer);
  }
  return buffers;
}

async function renderTextPostOgJpeg({
  post,
  cleanText = '',
  brandAssets = null,
  contextLabel = '',
  width = 1200,
  height = 630,
}) {
  const username = brandAssets?.usernameLabel || (post.username ? `@${post.username}` : '@player');
  const snippet = textSnippet(cleanText || summarizePostContent(post, 160), 160) || `New post from ${username}`;
  const { lines } = wrapTextByChars(snippet, 34, 4);
  const fontSize = lines.length <= 2 ? 64 : lines.length === 3 ? 54 : 46;
  const lineHeight = Math.round(fontSize * 1.12);
  const startY = 240 - Math.floor((lines.length - 1) * lineHeight * 0.35);
  const eyebrow = contextLabel || 'Post';

  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#07111c"/>
        <stop offset="100%" stop-color="#0b1024"/>
      </linearGradient>
      <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.74"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)"/>
    <rect x="0" y="0" width="${width}" height="92" fill="rgba(13,21,39,0.46)"/>
    <rect x="52" y="116" width="190" height="28" rx="14" fill="rgba(56,189,248,0.14)" stroke="rgba(56,189,248,0.34)"/>
    <text x="147" y="135" text-anchor="middle" fill="#bae6fd" font-size="15" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(eyebrow)}</text>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bottomShade)"/>

    ${lines.map((ln, i) => {
      const y = startY + i * lineHeight;
      return `<text x="64" y="${y}" fill="white" font-size="${fontSize}" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(ln)}</text>`;
    }).join('\n')}

    <text x="64" y="${height - 70}" fill="rgba(255,255,255,0.70)" font-size="22" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
      View post on Pump Shinsa
    </text>
  </svg>
  `;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 10, g: 10, b: 26, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(textSvg) },
      ...buildBrandComposites({ width, brandAssets }),
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

async function renderSessionShareOgJpeg({
  post,
  share,
  items,
  cleanText = '',
  brandAssets = null,
  contextLabel = '',
  width = 1200,
  height = 630,
}) {
  const username = brandAssets?.usernameLabel || (post?.username ? `@${post.username}` : '@player');
  const visibleItems = items.slice(0, 3);
  const remainingCount = Math.max(0, items.length - visibleItems.length);
  const isHopShare = String(share?.shareType || '').toLowerCase() === 'hour_of_power';
  const eyebrow = contextLabel || (isHopShare ? 'Hour Of Power' : 'Session Share');
  const headline = textSnippet(cleanText || share?.sessionTitle || 'Session share', 72);
  const subtitlePieces = [
    share?.sessionDateLabel || '',
    share?.sessionTimeRange || '',
    share?.sessionDurationLabel || '',
  ].filter(Boolean);
  const subtitle = textSnippet(subtitlePieces.join(' • '), 80);
  const rowStartY = 286;
  const rowHeight = 98;
  const jacketX = 84;
  const jacketWidth = 120;
  const jacketHeight = 66;
  const titleX = 226;
  const scoreX = 920;
  const gradeX = 1032;
  const pillA = isHopShare
    ? { label: 'Points', value: formatScore(share?.totalRatingPoints), tone: '#fbbf24' }
    : { label: 'Songs', value: String(share?.songCount || items.length), tone: '#7dd3fc' };
  const pillB = isHopShare
    ? { label: 'Clears', value: String(share?.countedClearCount || visibleItems.length), tone: '#22d3ee' }
    : { label: 'Clears', value: `${share?.clearCount || 0} (${share?.clearRate || 0}%)`, tone: '#34d399' };
  const pillC = isHopShare
    ? { label: 'Avg Pts', value: formatDecimal(share?.averageRatingPoints), tone: '#f59e0b' }
    : { label: 'Avg Score', value: formatScore(share?.averageScore), tone: '#60a5fa' };
  const pillD = isHopShare
    ? { label: 'Avg Lvl', value: formatDecimal(share?.averageLevel), tone: '#c084fc' }
    : { label: 'Perfects', value: `${share?.perfectRate || 0}%`, tone: '#f472b6' };
  const stats = [pillA, pillB, pillC, pillD];
  const thumbnailOverlays = [];

  const statSvg = stats.map((stat, index) => {
    const x = 64 + (index * 266);
    return `
      <g>
        <rect x="${x}" y="214" width="248" height="54" rx="18" fill="rgba(10,15,30,0.82)" stroke="rgba(148,163,184,0.14)" />
        <text x="${x + 20}" y="235" fill="rgba(255,255,255,0.58)" font-size="14" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(stat.label)}</text>
        <text x="${x + 20}" y="256" fill="${escapeXml(stat.tone)}" font-size="25" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(stat.value || '0')}</text>
      </g>
    `;
  }).join('\n');

  const rowsSvg = visibleItems.map((item, index) => {
    const rowY = rowStartY + (index * rowHeight);
    const title = textSnippet(item.song_title || 'Unknown chart', 32);
    const badgeText = chartBadgeLabel(item.mode, item.level);
    const modeAccent = getModeAccent(item.mode);
    const scoreText = formatScore(item.score);
    const gradeText = formatDisplayGrade(item.grade || '') || '--';
    const badgeWidth = textWidthEstimate(badgeText, 11, 26);
    const gradeAccent = getGradeAccent(gradeText);
    const detailPieces = [];
    if (isHopShare && item.rating_points) detailPieces.push(`${formatScore(item.rating_points)} pts`);
    if (item.over_top100_rank > 0) detailPieces.push(`TOP #${item.over_top100_rank}`);
    const detailText = textSnippet(detailPieces.join(' • ') || 'Selected result', 30);
    const jacketY = rowY + 14;

    if (item._artworkBuffer?.length) {
      thumbnailOverlays.push({
        input: item._artworkBuffer,
        top: jacketY,
        left: jacketX,
      });
    }

    return `
      <g>
        <rect x="64" y="${rowY}" width="1072" height="80" rx="20" fill="rgba(10,15,30,0.84)" stroke="rgba(148,163,184,0.12)" />
        <rect x="${jacketX}" y="${jacketY}" width="${jacketWidth}" height="${jacketHeight}" rx="16" fill="rgba(17,24,39,0.95)" stroke="rgba(255,255,255,0.08)" />
        <rect x="${jacketX}" y="${jacketY}" width="${jacketWidth}" height="${jacketHeight}" rx="16" fill="url(#jacketShade)" />
        <text x="${titleX}" y="${rowY + 32}" fill="white" font-size="28" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(title)}</text>
        <rect x="${titleX}" y="${rowY + 42}" width="${badgeWidth}" height="24" rx="12" fill="${escapeXml(modeAccent.fill)}" stroke="${escapeXml(modeAccent.border)}" />
        <text x="${titleX + Math.round(badgeWidth / 2)}" y="${rowY + 59}" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(badgeText)}</text>
        <text x="${titleX + badgeWidth + 18}" y="${rowY + 59}" fill="rgba(255,255,255,0.66)" font-size="15" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(detailText)}</text>
        <text x="${scoreX}" y="${rowY + 46}" text-anchor="end" fill="white" font-size="28" font-weight="900" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">${escapeXml(scoreText)}</text>
        <text x="${gradeX}" y="${rowY + 46}" text-anchor="middle" fill="${escapeXml(gradeAccent)}" font-size="28" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(gradeText)}</text>
      </g>
    `;
  }).join('\n');

  for (const overlay of thumbnailOverlays) {
    overlay.input = await buildRoundedImageBuffer(overlay.input, jacketWidth, jacketHeight, 16);
  }

  const moreBadgeText = `+${remainingCount} more`;
  const moreBadgeWidth = textWidthEstimate(moreBadgeText, 10, 26);

  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="jacketShade" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgba(0,0,0,0.36)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.0)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="#07111c" />
    <rect x="0" y="0" width="${width}" height="88" fill="${isHopShare ? 'rgba(245,158,11,0.18)' : 'rgba(34,211,238,0.16)'}" />
    <rect x="40" y="24" width="${width - 80}" height="${height - 48}" rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.10)" />
    <text x="${width - 148}" y="60" fill="rgba(255,255,255,0.76)" font-size="22" text-anchor="end" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(username)}</text>
    <rect x="64" y="102" width="170" height="28" rx="14" fill="${isHopShare ? 'rgba(245,158,11,0.12)' : 'rgba(34,211,238,0.12)'}" stroke="${isHopShare ? 'rgba(245,158,11,0.32)' : 'rgba(34,211,238,0.30)'}" />
    <text x="149" y="121" text-anchor="middle" fill="${isHopShare ? '#fde68a' : '#a5f3fc'}" font-size="15" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(eyebrow)}</text>
    <text x="64" y="176" fill="white" font-size="42" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(headline)}</text>
    <text x="64" y="202" fill="rgba(255,255,255,0.66)" font-size="18" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(subtitle)}</text>
    ${statSvg}
    ${remainingCount > 0 ? `
      <rect x="972" y="258" width="${moreBadgeWidth}" height="32" rx="16" fill="rgba(125,211,252,0.14)" stroke="rgba(125,211,252,0.36)" />
      <text x="${972 + Math.round(moreBadgeWidth / 2)}" y="280" text-anchor="middle" fill="#bae6fd" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(moreBadgeText)}</text>
    ` : ''}
    ${rowsSvg}
  </svg>
  `;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 9, g: 15, b: 31, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(textSvg) },
      ...buildBrandComposites({ width, brandAssets }),
      ...thumbnailOverlays,
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function renderLiveSessionOgJpeg({
  post,
  live,
  items,
  cleanText = '',
  brandAssets = null,
  contextLabel = '',
  width = 1200,
  height = 630,
}) {
  const normalizedShare = {
    shareType: 'live_recap',
    sessionTitle: live?.sessionTitle || '',
    sessionDateLabel: live?.sessionDateLabel || '',
    sessionTimeRange: live?.sessionTimeRange || '',
    sessionDurationLabel: live?.sessionDurationLabel || '',
    songCount: live?.songCount || items.length,
    clearCount: live?.clearCount || 0,
    clearRate: live?.clearRate || 0,
    averageScore: live?.averageScore || 0,
    perfectRate: live?.perfectRate || 0,
    rows: items,
  };
  return renderSessionShareOgJpeg({
    post,
    share: normalizedShare,
    items,
    cleanText: cleanText || live?.sessionTitle || 'Shinsa Live recap',
    brandAssets,
    contextLabel: contextLabel || 'Shinsa Live',
    width,
    height,
  });
}

async function renderMediaPostOgJpeg({
  post,
  mediaBuffers,
  cleanText = '',
  brandAssets = null,
  contextLabel = '',
  width = 1200,
  height = 630,
}) {
  const username = brandAssets?.usernameLabel || (post?.username ? `@${post.username}` : '@player');
  const headline = textSnippet(cleanText || summarizePostContent(post, 160), 88) || `New post from ${username}`;
  const body = textSnippet(cleanText || '', 170);
  const background = await sharp(mediaBuffers[0])
    .rotate()
    .resize(width, height, { fit: 'cover' })
    .modulate({ brightness: 0.92, saturation: 1.04 })
    .toBuffer();
  const thumbnails = [];

  for (let i = 1; i < Math.min(mediaBuffers.length, 4); i += 1) {
    const thumb = await buildRoundedImageBuffer(mediaBuffers[i], 124, 124, 18);
    if (thumb) {
      thumbnails.push({
        input: thumb,
        left: width - 180,
        top: 150 + ((i - 1) * 140),
      });
    }
  }

  const overlaySvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(3,7,18,0.18)"/>
        <stop offset="100%" stop-color="rgba(3,7,18,0.88)"/>
      </linearGradient>
      <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(7,17,28,0.94)"/>
        <stop offset="100%" stop-color="rgba(11,16,36,0.90)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#shade)" />
    <rect x="56" y="126" width="720" height="404" rx="30" fill="url(#panel)" stroke="rgba(255,255,255,0.10)" />
    <rect x="84" y="160" width="160" height="28" rx="14" fill="rgba(59,130,246,0.14)" stroke="rgba(59,130,246,0.34)" />
    <text x="164" y="179" text-anchor="middle" fill="#bfdbfe" font-size="15" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(contextLabel || 'Photo Post')}</text>
    <text x="84" y="246" fill="white" font-size="54" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(textSnippet(headline, 42))}</text>
    ${body ? `<text x="84" y="300" fill="rgba(255,255,255,0.76)" font-size="26" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(textSnippet(body, 76))}</text>` : ''}
    <text x="84" y="490" fill="rgba(255,255,255,0.70)" font-size="22" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">View post on Pump Shinsa</text>
    ${mediaBuffers.length > 1 ? `<rect x="${width - 196}" y="110" width="140" height="32" rx="16" fill="rgba(12,18,36,0.70)" stroke="rgba(255,255,255,0.16)" />
      <text x="${width - 126}" y="132" text-anchor="middle" fill="rgba(255,255,255,0.82)" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(`${mediaBuffers.length} photos`)}</text>` : ''}
  </svg>
  `;

  return sharp(background)
    .composite([
      { input: Buffer.from(overlaySvg) },
      ...buildBrandComposites({ width, brandAssets }),
      ...thumbnails,
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

function normalizeClearWidgetItems(rows) {
  return rows.map((row) => {
    const parsed = parseJsonArray(row?.clears_json);
    const first = parsed[0] || {};
    return {
      ...first,
      song_title: first.song_title || row.song_title || '',
      mode: first.mode || row.mode || '',
      level: parseInt(first.level || row.level, 10) || 0,
      score: parseInt(first.score, 10) || 0,
      grade: first.grade || row.grade || '',
      jacket_url: first.jacket_url || '',
      background_url: first.background_url || '',
    };
  }).filter((item) => item.song_title);
}

async function renderStatsWidgetOgJpeg({
  user,
  stats,
  brandAssets = null,
  width = 1200,
  height = 630,
}) {
  const cards = [
    { label: 'Followers', value: String(stats.followers || 0), tone: '#7dd3fc' },
    { label: 'Posts', value: String(stats.posts || 0), tone: '#c084fc' },
    { label: 'Upscores', value: String(stats.upscores || 0), tone: '#34d399' },
    { label: 'Clears', value: String(stats.clears || 0), tone: '#f59e0b' },
  ];
  const cardsSvg = cards.map((card, index) => {
    const x = 64 + ((index % 2) * 284);
    const y = 280 + (Math.floor(index / 2) * 102);
    return `
      <g>
        <rect x="${x}" y="${y}" width="256" height="78" rx="20" fill="rgba(10,15,30,0.84)" stroke="rgba(148,163,184,0.14)" />
        <text x="${x + 22}" y="${y + 28}" fill="rgba(255,255,255,0.56)" font-size="16" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(card.label)}</text>
        <text x="${x + 22}" y="${y + 58}" fill="${escapeXml(card.tone)}" font-size="34" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(card.value)}</text>
      </g>
    `;
  }).join('\n');

  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#07111c" />
    <rect x="0" y="0" width="${width}" height="88" fill="rgba(96,165,250,0.16)" />
    <rect x="40" y="24" width="${width - 80}" height="${height - 48}" rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.10)" />
    <text x="64" y="142" fill="rgba(125,211,252,0.90)" font-size="18" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">Player Snapshot</text>
    <text x="64" y="212" fill="white" font-size="64" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(user.username)}</text>
    <text x="64" y="250" fill="rgba(255,255,255,0.68)" font-size="28" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">Pumbility ${escapeXml(formatScore(user.pumbility || 0))}</text>
    ${cardsSvg}
  </svg>
  `;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 9, g: 15, b: 31, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(textSvg) },
      ...buildBrandComposites({ width, brandAssets }),
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function renderRecentScoresWidgetOgJpeg({
  user,
  rows,
  brandAssets = null,
  width = 1200,
  height = 630,
}) {
  const visibleRows = rows.slice(0, 4);
  const remainingCount = Math.max(0, rows.length - visibleRows.length);
  const jacketX = 84;
  const jacketWidth = 108;
  const jacketHeight = 60;
  const titleX = 210;
  const rowStartY = 166;
  const rowHeight = 92;
  const scoreX = 920;
  const gradeX = 1030;
  const thumbnailOverlays = [];
  const rowsSvg = visibleRows.map((row, index) => {
    const rowY = rowStartY + (index * rowHeight);
    const title = textSnippet(row.song_title || 'Unknown chart', 33);
    const badgeText = chartBadgeLabel(row.mode, row.level);
    const modeAccent = getModeAccent(row.mode);
    const badgeWidth = textWidthEstimate(badgeText, 11, 26);
    const gradeText = formatDisplayGrade(row.grade || '') || '--';
    const gradeAccent = getGradeAccent(gradeText);
    const jacketY = rowY + 14;
    if (row._artworkBuffer?.length) {
      thumbnailOverlays.push({
        input: row._artworkBuffer,
        top: jacketY,
        left: jacketX,
      });
    }
    return `
      <g>
        <rect x="64" y="${rowY}" width="1072" height="76" rx="20" fill="rgba(10,15,30,0.84)" stroke="rgba(148,163,184,0.12)" />
        <rect x="${jacketX}" y="${jacketY}" width="${jacketWidth}" height="${jacketHeight}" rx="16" fill="rgba(17,24,39,0.95)" stroke="rgba(255,255,255,0.08)" />
        <rect x="${jacketX}" y="${jacketY}" width="${jacketWidth}" height="${jacketHeight}" rx="16" fill="url(#jacketShade)" />
        <text x="${titleX}" y="${rowY + 32}" fill="white" font-size="28" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(title)}</text>
        <rect x="${titleX}" y="${rowY + 42}" width="${badgeWidth}" height="24" rx="12" fill="${escapeXml(modeAccent.fill)}" stroke="${escapeXml(modeAccent.border)}" />
        <text x="${titleX + Math.round(badgeWidth / 2)}" y="${rowY + 59}" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(badgeText)}</text>
        <text x="${scoreX}" y="${rowY + 46}" text-anchor="end" fill="white" font-size="27" font-weight="900" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">${escapeXml(formatScore(row.score))}</text>
        <text x="${gradeX}" y="${rowY + 46}" text-anchor="middle" fill="${escapeXml(gradeAccent)}" font-size="28" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(gradeText)}</text>
      </g>
    `;
  }).join('\n');

  for (const overlay of thumbnailOverlays) {
    overlay.input = await buildRoundedImageBuffer(overlay.input, jacketWidth, jacketHeight, 16);
  }

  const moreBadgeText = `+${remainingCount} more`;
  const moreBadgeWidth = textWidthEstimate(moreBadgeText, 10, 26);
  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="jacketShade" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgba(0,0,0,0.36)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.0)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="#07111c" />
    <rect x="0" y="0" width="${width}" height="88" fill="rgba(59,130,246,0.16)" />
    <rect x="40" y="24" width="${width - 80}" height="${height - 48}" rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.10)" />
    <text x="64" y="136" fill="white" font-size="46" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(`${user.username} Recent Scores`)}</text>
    <text x="64" y="160" fill="rgba(255,255,255,0.64)" font-size="20" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">Latest charts on Pump Shinsa</text>
    ${remainingCount > 0 ? `
      <rect x="972" y="110" width="${moreBadgeWidth}" height="32" rx="16" fill="rgba(125,211,252,0.14)" stroke="rgba(125,211,252,0.36)" />
      <text x="${972 + Math.round(moreBadgeWidth / 2)}" y="132" text-anchor="middle" fill="#bae6fd" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(moreBadgeText)}</text>
    ` : ''}
    ${rowsSvg}
  </svg>
  `;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 9, g: 15, b: 31, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(textSvg) },
      ...buildBrandComposites({ width, brandAssets }),
      ...thumbnailOverlays,
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function renderRecentClearsWidgetOgJpeg({
  user,
  items,
  brandAssets = null,
  width = 1200,
  height = 630,
}) {
  const clear = { username: user.username };
  return renderClearOgJpeg({
    clear,
    items,
    brandAssets,
    width,
    height,
  });
}

function resolveUpscoreItemJacketUrl(db, item) {
  const title = String(item?.song_title || '').trim();
  const mode = normalizePreviewMode(item?.mode || '');
  const level = parseInt(item?.level, 10) || 0;
  if (!title || !mode || !level) return '';

  try {
    const jacketMap = getPreviewJacketMap(db);
    const aliases = loadPreviewSongAliases();
    const normalizedTitle = normalizeSongName(title);
    const compactTitle = compactSongName(title);
    const canonicalTitle = toCanonicalPreviewTitle(title, aliases);
    const compactCanonicalTitle = compactSongName(canonicalTitle);
    const keys = [
      `${normalizedTitle}|${mode}|${level}`,
      `${compactTitle}|${mode}|${level}`,
      `${canonicalTitle}|${mode}|${level}`,
      `${compactCanonicalTitle}|${mode}|${level}`,
      normalizedTitle,
      compactTitle,
      canonicalTitle,
      compactCanonicalTitle,
    ].filter(Boolean);
    for (const key of keys) {
      if (jacketMap[key]) return jacketMap[key];
    }
    return '';
  } catch {
    return '';
  }
}

async function renderUpscoreOgJpeg({
  upscore,
  items,
  brandAssets = null,
  width = 1200,
  height = 630,
}) {
  const username = brandAssets?.usernameLabel || (upscore?.username ? `@${upscore.username}` : '@player');
  const rankedItems = [...items]
    .map((item) => ({
      ...item,
      delta: Math.max(0, (parseInt(item?.new_score, 10) || 0) - (parseInt(item?.old_score, 10) || 0)),
    }))
    .sort((a, b) => b.delta - a.delta);

  const visibleItems = rankedItems.slice(0, 4);
  const remainingCount = Math.max(0, rankedItems.length - visibleItems.length);
  const totalGain = rankedItems.reduce((sum, item) => sum + item.delta, 0);

  const rowStartY = 164;
  const rowHeight = 92;
  const jacketX = 82;
  const jacketWidth = 108;
  const jacketHeight = 60;
  const titleX = 210;
  const oldScoreX = 826;
  const gradeX = 945;
  const deltaX = 1046;

  const thumbnailOverlays = [];
  const svgRows = visibleItems.map((item, index) => {
    const rowY = rowStartY + (index * rowHeight);
    const title = textSnippet(item.song_title || 'Unknown chart', 34);
    const badgeText = chartBadgeLabel(item.mode, item.level);
    const newGrade = formatDisplayGrade(item.new_grade || '');
    const oldGrade = formatDisplayGrade(item.old_grade || '');
    const deltaText = `+${formatScore(item.delta)}`;
    const oldScoreText = formatScore(item.old_score);
    const newScoreText = formatScore(item.new_score);
    const modeAccent = getModeAccent(item.mode);
    const gradeAccent = getGradeAccent(newGrade);
    const badgeWidth = textWidthEstimate(badgeText, 11, 26);
    const deltaWidth = textWidthEstimate(deltaText, 10, 28);
    const gradeDetail = oldGrade && newGrade ? `${oldGrade} -> ${newGrade}` : (newGrade || oldGrade || 'Updated');
    const jacketY = rowY + 14;

    if (item._artworkBuffer?.length) {
      thumbnailOverlays.push({
        input: item._artworkBuffer,
        top: jacketY,
        left: jacketX,
      });
    }

    return `
      <g>
        <rect x="64" y="${rowY}" width="1072" height="76" rx="20" fill="rgba(10,15,30,0.84)" stroke="rgba(148,163,184,0.12)" />
        <rect x="${jacketX}" y="${jacketY}" width="${jacketWidth}" height="${jacketHeight}" rx="16" fill="rgba(17,24,39,0.95)" stroke="rgba(255,255,255,0.08)" />
        <rect x="${jacketX}" y="${jacketY}" width="${jacketWidth}" height="${jacketHeight}" rx="16" fill="url(#jacketShade)" />

        <rect x="${titleX}" y="${rowY + 42}" width="${badgeWidth}" height="24" rx="12" fill="${escapeXml(modeAccent.fill)}" stroke="${escapeXml(modeAccent.border)}" />
        <text x="${titleX + Math.round(badgeWidth / 2)}" y="${rowY + 59}" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(badgeText)}</text>

        <text x="${titleX}" y="${rowY + 32}" fill="white" font-size="28" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(title)}</text>
        <text x="${titleX + badgeWidth + 18}" y="${rowY + 59}" fill="rgba(255,255,255,0.68)" font-size="15" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(gradeDetail)}</text>

        <text x="${oldScoreX}" y="${rowY + 31}" text-anchor="end" fill="rgba(255,255,255,0.58)" font-size="19" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">${escapeXml(oldScoreText)}</text>
        <text x="${oldScoreX + 20}" y="${rowY + 31}" fill="rgba(255,255,255,0.30)" font-size="17" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">-></text>
        <text x="${oldScoreX}" y="${rowY + 58}" text-anchor="end" fill="white" font-size="26" font-weight="800" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">${escapeXml(newScoreText)}</text>

        <text x="${gradeX}" y="${rowY + 45}" text-anchor="middle" fill="${escapeXml(gradeAccent)}" font-size="28" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(newGrade || '--')}</text>

        <rect x="${deltaX}" y="${rowY + 20}" width="${deltaWidth}" height="34" rx="17" fill="rgba(52,211,153,0.18)" stroke="rgba(52,211,153,0.42)" />
        <text x="${deltaX + Math.round(deltaWidth / 2)}" y="${rowY + 43}" text-anchor="middle" fill="#6ee7b7" font-size="18" font-weight="900" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">${escapeXml(deltaText)}</text>
      </g>
    `;
  }).join('\n');

  if (thumbnailOverlays.length > 0) {
    for (const overlay of thumbnailOverlays) {
      overlay.input = await sharp(overlay.input)
        .rotate()
        .resize(jacketWidth, jacketHeight, { fit: 'cover' })
        .composite([
          {
            input: Buffer.from(`<svg width="${jacketWidth}" height="${jacketHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${jacketWidth}" height="${jacketHeight}" rx="16" ry="16" fill="#fff"/></svg>`),
            blend: 'dest-in',
          },
        ])
        .png()
        .toBuffer();
    }
  }

  const summaryTitle = rankedItems.length > 1 ? `${rankedItems.length} Score Improvements` : 'Score Improvement';
  const summaryMeta = totalGain > 0 ? `Total gain +${formatScore(totalGain)}` : 'Updated on Pump Shinsa';
  const moreBadgeText = `+${remainingCount} more`;
  const moreBadgeWidth = textWidthEstimate(moreBadgeText, 10, 26);
  const moreBadge = remainingCount > 0
    ? `
      <rect x="972" y="110" width="${moreBadgeWidth}" height="32" rx="16" fill="rgba(125,211,252,0.14)" stroke="rgba(125,211,252,0.36)" />
      <text x="${972 + Math.round(moreBadgeWidth / 2)}" y="132" text-anchor="middle" fill="#bae6fd" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(moreBadgeText)}</text>
    `
    : '';

  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="jacketShade" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgba(0,0,0,0.36)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.0)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="#07111c" />
    <rect x="0" y="0" width="${width}" height="88" fill="rgba(32,157,222,0.20)" />
    <rect x="40" y="24" width="${width - 80}" height="${height - 48}" rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.10)" />
    <text x="${width - 148}" y="60" fill="rgba(255,255,255,0.76)" font-size="22" text-anchor="end" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(username)}</text>
    <text x="64" y="136" fill="white" font-size="46" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(summaryTitle)}</text>
    <text x="64" y="160" fill="rgba(255,255,255,0.64)" font-size="20" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(summaryMeta)}</text>
    ${moreBadge}

    ${svgRows}
  </svg>
  `;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 9, g: 15, b: 31, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(textSvg) },
      ...buildBrandComposites({ width, brandAssets }),
      ...thumbnailOverlays,
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function renderClearOgJpeg({
  clear,
  items,
  brandAssets = null,
  width = 1200,
  height = 630,
}) {
  const username = brandAssets?.usernameLabel || (clear?.username ? `@${clear.username}` : '@player');
  const visibleItems = items.slice(0, 4);
  const remainingCount = Math.max(0, items.length - visibleItems.length);
  const rowStartY = 164;
  const rowHeight = 92;
  const jacketX = 82;
  const jacketWidth = 108;
  const jacketHeight = 60;
  const titleX = 210;
  const scoreX = 856;
  const gradeX = 980;
  const subtitle = items.length > 0 ? 'Latest clears on Pump Shinsa' : 'Clear update';
  const summaryTitle = items.length > 1 ? `${items.length} New Clears` : 'New Clear';
  const thumbnailOverlays = [];

  const rowsSvg = visibleItems.map((item, index) => {
    const rowY = rowStartY + (index * rowHeight);
    const title = textSnippet(item.song_title || item.title_name || 'Unknown chart', 34);
    const badgeText = chartBadgeLabel(item.mode, item.level);
    const scoreText = formatScore(item.score);
    const gradeText = formatDisplayGrade(item.grade || '') || 'CLEAR';
    const badgeWidth = textWidthEstimate(badgeText, 11, 26);
    const modeAccent = getModeAccent(item.mode);
    const gradeAccent = getGradeAccent(gradeText);
    const jacketY = rowY + 14;

    if (item._artworkBuffer?.length) {
      thumbnailOverlays.push({
        input: item._artworkBuffer,
        top: jacketY,
        left: jacketX,
      });
    }

    return `
      <g>
        <rect x="64" y="${rowY}" width="1072" height="76" rx="20" fill="rgba(10,15,30,0.84)" stroke="rgba(148,163,184,0.12)" />
        <rect x="${jacketX}" y="${jacketY}" width="${jacketWidth}" height="${jacketHeight}" rx="16" fill="rgba(17,24,39,0.95)" stroke="rgba(255,255,255,0.08)" />
        <rect x="${jacketX}" y="${jacketY}" width="${jacketWidth}" height="${jacketHeight}" rx="16" fill="url(#jacketShade)" />

        <text x="${titleX}" y="${rowY + 32}" fill="white" font-size="28" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(title)}</text>
        <rect x="${titleX}" y="${rowY + 42}" width="${badgeWidth}" height="24" rx="12" fill="${escapeXml(modeAccent.fill)}" stroke="${escapeXml(modeAccent.border)}" />
        <text x="${titleX + Math.round(badgeWidth / 2)}" y="${rowY + 59}" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(badgeText)}</text>

        <text x="${scoreX}" y="${rowY + 46}" text-anchor="end" fill="white" font-size="27" font-weight="900" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">${escapeXml(scoreText)}</text>
        <text x="${gradeX}" y="${rowY + 46}" text-anchor="middle" fill="${escapeXml(gradeAccent)}" font-size="28" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(gradeText)}</text>
      </g>
    `;
  }).join('\n');

  if (thumbnailOverlays.length > 0) {
    for (const overlay of thumbnailOverlays) {
      overlay.input = await sharp(overlay.input)
        .rotate()
        .resize(jacketWidth, jacketHeight, { fit: 'cover' })
        .composite([{
          input: Buffer.from(`<svg width="${jacketWidth}" height="${jacketHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${jacketWidth}" height="${jacketHeight}" rx="16" ry="16" fill="#fff"/></svg>`),
          blend: 'dest-in',
        }])
        .png()
        .toBuffer();
    }
  }

  const moreBadgeText = `+${remainingCount} more`;
  const moreBadgeWidth = textWidthEstimate(moreBadgeText, 10, 26);
  const moreBadge = remainingCount > 0
    ? `
      <rect x="972" y="110" width="${moreBadgeWidth}" height="32" rx="16" fill="rgba(125,211,252,0.14)" stroke="rgba(125,211,252,0.36)" />
      <text x="${972 + Math.round(moreBadgeWidth / 2)}" y="132" text-anchor="middle" fill="#bae6fd" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(moreBadgeText)}</text>
    `
    : '';

  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="jacketShade" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgba(0,0,0,0.36)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.0)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="#07111c" />
    <rect x="0" y="0" width="${width}" height="88" fill="rgba(245,158,11,0.16)" />
    <rect x="40" y="24" width="${width - 80}" height="${height - 48}" rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.10)" />
    <text x="${width - 148}" y="60" fill="rgba(255,255,255,0.76)" font-size="22" text-anchor="end" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(username)}</text>
    <text x="64" y="136" fill="white" font-size="46" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(summaryTitle)}</text>
    <text x="64" y="160" fill="rgba(255,255,255,0.64)" font-size="20" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(subtitle)}</text>
    ${moreBadge}
    ${rowsSvg}
  </svg>
  `;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 9, g: 15, b: 31, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(textSvg) },
      ...buildBrandComposites({ width, brandAssets }),
      ...thumbnailOverlays,
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

const OG_HR_ZONES = [
  { pctMin: 0, pctMax: 0.68, color: '#94a3b8' },
  { pctMin: 0.68, pctMax: 0.73, color: '#60a5fa' },
  { pctMin: 0.73, pctMax: 0.8, color: '#34d399' },
  { pctMin: 0.8, pctMax: 0.87, color: '#fde047' },
  { pctMin: 0.87, pctMax: 0.93, color: '#fb923c' },
  { pctMin: 0.93, pctMax: 10, color: '#f87171' },
];

// Personal HR zone bands — % of the player's max HR, mirroring the app's
// heartRate lib (z0 below-zones … z5 very hard).
function ogHrZoneBands(maxHr) {
  const mx = (Number(maxHr) >= 120 && Number(maxHr) <= 260) ? Number(maxHr) : 190;
  return OG_HR_ZONES.map((z) => ({
    min: Math.round(z.pctMin * mx),
    max: Math.round(Math.min(z.pctMax, 10) * mx),
    color: z.color,
  }));
}

function ogHrZoneColor(bpm, maxHr) {
  const bands = ogHrZoneBands(maxHr);
  const n = Number(bpm) || 0;
  for (const b of bands) {
    if (n >= b.min && n < b.max) return b.color;
  }
  return bands[bands.length - 1].color;
}

function ogFmtClock(totalSeconds) {
  const v = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}


// Latest Shinsa app icon (Pump Gold brand) from the repo — the old client
// wordmark is the legacy look.
let cachedBrandIconBuffer = null;
async function loadShinsaBrandIcon() {
  if (cachedBrandIconBuffer) return cachedBrandIconBuffer;
  try {
    const iconPath = path.join(__dirname, '..', 'mobile', 'assets', 'brand', 'icon.png');
    const raw = fs.readFileSync(iconPath);
    cachedBrandIconBuffer = await sharp(raw)
      .resize(96, 96, { fit: 'cover' })
      .composite([{
        input: Buffer.from('<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96" rx="24" fill="#fff"/></svg>'),
        blend: 'dest-in',
      }])
      .png()
      .toBuffer();
  } catch { cachedBrandIconBuffer = null; }
  return cachedBrandIconBuffer;
}

// Instagram-story share card (1080x1920): top/bottom safe space, the score
// card with heavy scrims for readability, the HR zone-band chart stacked
// BELOW the card (mirrors the in-app layout), Pump Gold branding.
async function renderPlayStoryJpeg({ play, brandAssets = null, artworkBuffer = null }) {
  const width = 1080;
  const height = 1920;
  const M = 80;             // side margin
  const cardX = M;
  const cardW = width - M * 2;

  const hrAvgV = parseInt(play?.hr_avg, 10) || 0;
  const hrPeakV = parseInt(play?.hr_peak, 10) || 0;
  let hrSeries = [];
  try {
    const parsedSeries = JSON.parse(String(play?.hr_series || '[]'));
    if (Array.isArray(parsedSeries)) hrSeries = parsedSeries.map((n) => parseInt(n, 10) || 0).filter((n) => n > 0 && n < 300);
  } catch { /* not json */ }
  const hasHr = (hrAvgV > 0 || hrPeakV > 0) && hrSeries.length > 1;

  const cardY = 330;
  const cardH = hasHr ? 880 : 1060;
  const hrY = cardY + cardH + 28;
  const hrH = 470;

  const songTitle = String(play?.song_title || 'Unknown chart').trim() || 'Unknown chart';
  const titleLines = wrapTextByChars(songTitle, 20, 2).lines;
  const modeAccent = getModeAccent(play?.mode);
  const gradeText = formatDisplayGrade(play?.grade || '') || '--';
  const gradeAccent = getGradeAccent(gradeText);
  const scoreText = formatScore(play?.score);
  const playedAt = formatPreviewDateLabel(play?.played_at_utc || play?.date_played || '');
  const machineName = normalizeWhitespace(String(play?.machine_name || ''));
  const metaLine = [
    playedAt ? `Played ${playedAt}` : '',
    String(play?.mode || '').trim() && parseInt(play?.level, 10) > 0 ? `${String(play.mode).trim()} ${parseInt(play.level, 10)}` : '',
  ].filter(Boolean).join('  •  ');
  const plateName = getPlateName(play?.plate || '');
  const judgments = [
    { key: 'PERFECT', value: parseInt(play?.perfect, 10) || 0, color: '#7dd3fc' },
    { key: 'GREAT', value: parseInt(play?.great, 10) || 0, color: '#86efac' },
    { key: 'GOOD', value: parseInt(play?.good, 10) || 0, color: '#fde047' },
    { key: 'BAD', value: parseInt(play?.bad, 10) || 0, color: '#f5a5ff' },
    { key: 'MISS', value: parseInt(play?.miss, 10) || 0, color: '#fda4af' },
  ];
  const showJudgments = judgments.some((item) => item.value > 0);

  const titleSvg = titleLines.map((line, index) => (
    `<text x="${cardX + 48}" y="${cardY + 118 + index * 70}" fill="#ffffff" font-size="60" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(line)}</text>`
  )).join('\n');
  const metaBaseY = cardY + 118 + titleLines.length * 70;

  const judgPanelY = cardY + cardH - 132;
  const judgItemW = Math.floor((cardW - 96) / 5);
  const judgmentsSvg = showJudgments ? judgments.map((item, index) => {
    const cx = cardX + 48 + index * judgItemW + Math.floor(judgItemW / 2);
    return `
      <text x="${cx}" y="${judgPanelY + 42}" text-anchor="middle" fill="${item.color}" font-size="20" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${item.key}</text>
      <text x="${cx}" y="${judgPanelY + 86}" text-anchor="middle" fill="#ffffff" font-size="38" font-weight="900" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escapeXml(formatScore(item.value))}</text>`;
  }).join('\n') : '';

  // HR panel svg (below the card)
  let hrSvg = '';
  if (hasHr) {
    const maxHrV = parseInt(play?.hr_max, 10) || 190;
    const durS = (parseInt(play?.song_duration_s, 10) || 0) > 0
      ? parseInt(play.song_duration_s, 10)
      : ((parseInt(play?.hr_duration_s, 10) || 0) > 0 ? parseInt(play.hr_duration_s, 10) : 115);
    const chX = cardX + 48;
    const chW = cardW - 96;
    const chY = hrY + 150;
    const chH = 210;
    let lo = Math.min(...hrSeries) - 8;
    let hi = Math.max(...hrSeries) + 8;
    if (hi - lo < 30) { const mid = (hi + lo) / 2; lo = mid - 15; hi = mid + 15; }
    const yFor = (bpm) => chY + chH - ((bpm - lo) / (hi - lo)) * chH;
    const bandsSvg = ogHrZoneBands(maxHrV).map((b) => {
      const top = Math.min(b.max, hi);
      const bottom = Math.max(b.min, lo);
      if (top <= bottom) return '';
      const y = yFor(top);
      return `<rect x="${chX}" y="${y.toFixed(1)}" width="${chW}" height="${(yFor(bottom) - y).toFixed(1)}" fill="${b.color}" opacity="0.18" />`;
    }).join('\n');
    const gridSvg = [0.25, 0.5, 0.75].map((f) => (
      `<rect x="${(chX + chW * f).toFixed(1)}" y="${chY}" width="2" height="${chH}" fill="#ffffff" opacity="0.12" />`
    )).join('\n');
    const linePts = hrSeries.map((bpm, i) => (
      `${(chX + (i / Math.max(1, hrSeries.length - 1)) * chW).toFixed(1)},${yFor(bpm).toFixed(1)}`
    )).join(' ');
    const axisSvg = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const anchorPos = f === 0 ? 'start' : f === 1 ? 'end' : 'middle';
      return `<text x="${(chX + chW * f).toFixed(1)}" y="${chY + chH + 38}" text-anchor="${anchorPos}" fill="rgba(255,255,255,0.5)" font-size="22" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${ogFmtClock(durS * f)}</text>`;
    }).join('\n');
    hrSvg = `
    <rect x="${cardX}" y="${hrY}" width="${cardW}" height="${hrH}" rx="36" fill="rgba(248,113,113,0.10)" stroke="rgba(248,113,113,0.32)" stroke-width="2" />
    <text x="${chX}" y="${hrY + 64}" fill="rgba(252,165,165,0.92)" font-size="24" font-weight="800" letter-spacing="5" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">♥ HEART RATE</text>
    <text x="${chX}" y="${hrY + 124}" fill="#ffffff" font-size="58" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${hrAvgV || '—'}</text>
    <text x="${chX + (String(hrAvgV).length * 36) + 14}" y="${hrY + 120}" fill="rgba(255,255,255,0.6)" font-size="22" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">BPM AVG</text>
    ${hrPeakV > 0 ? `<text x="${cardX + cardW - 48}" y="${hrY + 78}" text-anchor="end" fill="rgba(255,255,255,0.5)" font-size="20" font-weight="900" letter-spacing="3" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">PEAK</text>
    <text x="${cardX + cardW - 48}" y="${hrY + 124}" text-anchor="end" fill="${ogHrZoneColor(hrPeakV, maxHrV)}" font-size="46" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${hrPeakV}</text>` : ''}
    ${bandsSvg}
    ${gridSvg}
    <polyline points="${linePts}" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" />
    ${axisSvg}
    <text x="${chX}" y="${hrY + hrH - 26}" fill="rgba(255,255,255,0.45)" font-size="20" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">Zones from max ${maxHrV} BPM</text>`;
  }

  const usernameLabel = brandAssets?.usernameLabel || '@player';
  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="storyGlow" cx="50%" cy="8%" r="70%">
        <stop offset="0%" stop-color="rgba(255,210,74,0.14)"/>
        <stop offset="60%" stop-color="rgba(255,210,74,0.03)"/>
        <stop offset="100%" stop-color="rgba(255,210,74,0)"/>
      </radialGradient>
      <linearGradient id="storyScrimTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(3,4,7,0.86)"/>
        <stop offset="100%" stop-color="rgba(3,4,7,0.18)"/>
      </linearGradient>
      <linearGradient id="storyScrimBottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(3,4,7,0.0)"/>
        <stop offset="40%" stop-color="rgba(3,4,7,0.45)"/>
        <stop offset="100%" stop-color="rgba(3,4,7,0.94)"/>
      </linearGradient>
      <linearGradient id="storyGold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ffd24a"/>
        <stop offset="100%" stop-color="#f7b733"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#storyGlow)" />

    <text x="${M + 118}" y="252" fill="#ffffff" font-size="56" font-weight="900" letter-spacing="6" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">SHINSA</text>
    <rect x="${M + 118}" y="268" width="120" height="6" rx="3" fill="url(#storyGold)" />
    <text x="${width - M}" y="252" text-anchor="end" fill="rgba(255,255,255,0.78)" font-size="34" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(usernameLabel)}</text>

    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="36" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="240" rx="36" fill="url(#storyScrimTop)" />
    <rect x="${cardX}" y="${cardY + Math.round(cardH * 0.42)}" width="${cardW}" height="${cardH - Math.round(cardH * 0.42)}" fill="url(#storyScrimBottom)" />
    <rect x="${cardX}" y="${cardY + cardH - 72}" width="${cardW}" height="72" fill="rgba(3,4,7,0.94)" />

    ${titleSvg}
    <text x="${cardX + 48}" y="${metaBaseY + 14}" fill="rgba(255,255,255,0.88)" font-size="28" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(String(play?.username || 'Player'))}</text>
    <text x="${cardX + 48}" y="${metaBaseY + 56}" fill="rgba(255,255,255,0.82)" font-size="26" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(metaLine)}</text>
    ${machineName ? `<text x="${cardX + 48}" y="${metaBaseY + 96}" fill="rgba(255,255,255,0.82)" font-size="26" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(machineName)}</text>` : ''}

    <circle cx="${cardX + cardW - 110}" cy="${cardY + 110}" r="74" fill="${modeAccent.from}" />
    <circle cx="${cardX + cardW - 110}" cy="${cardY + 110}" r="60" fill="rgba(8,10,16,0.45)" />
    <text x="${cardX + cardW - 110}" y="${cardY + 92}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="20" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">LEVEL</text>
    <text x="${cardX + cardW - 110}" y="${cardY + 142}" text-anchor="middle" fill="#ffffff" font-size="54" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(String(parseInt(play?.level, 10) || '?'))}</text>

    <text x="${cardX + 48}" y="${cardY + cardH - 196}" fill="${play?.is_stage_break ? '#fda4af' : '#ffffff'}" font-size="${play?.is_stage_break ? 72 : 104}" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(play?.is_stage_break ? 'STAGE BREAK' : scoreText)}</text>
    ${plateName ? `<text x="${cardX + 48}" y="${cardY + cardH - 152}" fill="#ffd24a" font-size="26" font-weight="800" letter-spacing="3" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(plateName)}</text>` : ''}
    <text x="${cardX + cardW - 48}" y="${cardY + cardH - 196}" text-anchor="end" fill="${escapeXml(gradeAccent)}" font-size="110" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(gradeText)}</text>

    ${showJudgments ? `<rect x="${cardX + 28}" y="${judgPanelY}" width="${cardW - 56}" height="112" rx="28" fill="rgba(3,7,15,0.66)" stroke="rgba(255,255,255,0.10)" />` : ''}
    ${judgmentsSvg}

    ${hrSvg}

    <text x="${width / 2}" y="1830" text-anchor="middle" fill="rgba(255,255,255,0.42)" font-size="30" font-weight="700" letter-spacing="3" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">pumpshinsa.com</text>
  </svg>`;

  let cardArtworkOverlay = null;
  if (artworkBuffer?.length) {
    cardArtworkOverlay = {
      input: await sharp(artworkBuffer)
        .rotate()
        .resize(cardW, cardH, { fit: 'cover' })
        .modulate({ brightness: 1.08, saturation: 1.08 })
        .composite([{
          input: Buffer.from(`<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg"><rect width="${cardW}" height="${cardH}" rx="36" fill="#fff"/></svg>`),
          blend: 'dest-in',
        }])
        .png()
        .toBuffer(),
      top: cardY,
      left: cardX,
    };
  }

  const brandIcon = await loadShinsaBrandIcon();
  const composites = [
    ...(cardArtworkOverlay ? [cardArtworkOverlay] : []),
    { input: Buffer.from(textSvg) },
  ];
  if (brandIcon) composites.push({ input: brandIcon, top: 180, left: M });
  if (brandAssets?.avatarBuffer?.length) {
    composites.push({
      input: await sharp(brandAssets.avatarBuffer).resize(56, 56).png().toBuffer(),
      top: 206,
      left: width - M - 320 - 56 >= 0 ? width - M - 380 : width - M - 56,
    });
  }

  return sharp({
    create: { width, height, channels: 4, background: { r: 5, g: 5, b: 8, alpha: 1 } },
  })
    .composite(composites)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function renderPlayOgJpeg({
  play,
  brandAssets = null,
  artworkBuffer = null,
  width = 1200,
  height = 630,
}) {
  const username = brandAssets?.usernameLabel || (play?.username ? `@${play.username}` : '@player');
  const hrAvgV = parseInt(play?.hr_avg, 10) || 0;
  const hrPeakV = parseInt(play?.hr_peak, 10) || 0;
  let hrSeries = [];
  try {
    const parsedSeries = JSON.parse(String(play?.hr_series || '[]'));
    if (Array.isArray(parsedSeries)) hrSeries = parsedSeries.map((n) => parseInt(n, 10) || 0).filter((n) => n > 0 && n < 300);
  } catch { /* not json */ }
  // Full HR panel (zone-band curve) when there's a series; pill fallback otherwise.
  const hasHrPanel = (hrAvgV > 0 || hrPeakV > 0) && hrSeries.length > 1;
  const songTitle = String(play?.song_title || 'Unknown chart').trim() || 'Unknown chart';
  const titleLines = wrapTextByChars(songTitle, hasHrPanel ? 16 : 24, 2).lines;
  const title = titleLines.length > 0 ? titleLines : [textSnippet(songTitle, 28)];
  const badgeText = chartBadgeLabel(play?.mode, play?.level);
  const modeAccent = getModeAccent(play?.mode);
  const gradeText = formatDisplayGrade(play?.grade || '') || '--';
  const gradeAccent = getGradeAccent(gradeText);
  const scoreText = formatScore(play?.score);
  const playedAt = formatPreviewDateLabel(play?.played_at_utc || play?.date_played || '');
  const playedAtLabel = playedAt ? `Played ${playedAt}` : '';
  const machineName = normalizeWhitespace(String(play?.machine_name || ''));
  const chartLine = [
    String(play?.mode || '').trim() && parseInt(play?.level, 10) > 0
      ? `${String(play.mode).trim()} ${parseInt(play.level, 10)}`
      : '',
    machineName,
  ].filter(Boolean).join(' • ');
  const skillTitle = normalizeWhitespace(String(play?.skill_title || ''));
  const plateName = getPlateName(play?.plate || '');
  const overRank = parseInt(play?.over_top100_rank, 10) || 0;
  const judgments = [
    { key: 'PERFECT', value: parseInt(play?.perfect, 10) || 0, color: '#7dd3fc' },
    { key: 'GREAT', value: parseInt(play?.great, 10) || 0, color: '#86efac' },
    { key: 'GOOD', value: parseInt(play?.good, 10) || 0, color: '#fde047' },
    { key: 'BAD', value: parseInt(play?.bad, 10) || 0, color: '#f5a5ff' },
    { key: 'MISS', value: parseInt(play?.miss, 10) || 0, color: '#fda4af' },
  ];
  const showJudgments = judgments.some((item) => item.value > 0);
  const hrAvg = hrAvgV;
  const hrPeak = hrPeakV;
  const pillItems = [
    skillTitle ? { text: skillTitle, fill: 'rgba(34,211,238,0.12)', stroke: 'rgba(103,232,249,0.34)', color: '#d9f9ff' } : null,
    overRank > 0 ? { text: `TOP #${overRank}`, fill: 'rgba(250,204,21,0.12)', stroke: 'rgba(250,204,21,0.36)', color: '#fef08a' } : null,
    badgeText ? { text: badgeText, fill: modeAccent.fill, stroke: modeAccent.border, color: '#ffffff' } : null,
    (hrAvg > 0 || hrPeak > 0) && !hasHrPanel
      ? { text: `♥ ${hrAvg || '—'} AVG · ${hrPeak || '—'} PEAK BPM`, fill: 'rgba(248,113,113,0.14)', stroke: 'rgba(248,113,113,0.40)', color: '#fecaca' }
      : null,
  ].filter(Boolean);

  const cardX = 68;
  const cardY = 102;
  const cardH = 468;
  const hrPanelW = 340;
  const hrPanelGap = 24;
  const fullCardW = width - 136;
  const cardW = hasHrPanel ? fullCardW - hrPanelW - hrPanelGap : fullCardW;
  const hrPanelX = cardX + cardW + hrPanelGap;

  // Dedicated HR panel — mirrors the in-app card: ♥ avg/peak header, the HR
  // curve over the player's personal zone bands, quarter gridlines + song-time
  // axis, max-HR footnote.
  let hrPanelSvg = '';
  if (hasHrPanel) {
    const maxHrV = parseInt(play?.hr_max, 10) || 190;
    const durS = (parseInt(play?.song_duration_s, 10) || 0) > 0
      ? parseInt(play.song_duration_s, 10)
      : ((parseInt(play?.hr_duration_s, 10) || 0) > 0 ? parseInt(play.hr_duration_s, 10) : 115);
    const chX = hrPanelX + 26;
    const chW = hrPanelW - 52;
    const chY = cardY + 132;
    const chH = 236;
    let lo = Math.min(...hrSeries) - 8;
    let hi = Math.max(...hrSeries) + 8;
    if (hi - lo < 30) { const mid = (hi + lo) / 2; lo = mid - 15; hi = mid + 15; }
    const yFor = (bpm) => chY + chH - ((bpm - lo) / (hi - lo)) * chH;
    const bandsSvg = ogHrZoneBands(maxHrV)
      .map((b) => {
        const top = Math.min(b.max, hi);
        const bottom = Math.max(b.min, lo);
        if (top <= bottom) return '';
        const y = yFor(top);
        return `<rect x="${chX}" y="${y.toFixed(1)}" width="${chW}" height="${(yFor(bottom) - y).toFixed(1)}" fill="${b.color}" opacity="0.18" />`;
      })
      .join('\n');
    const gridSvg = [0.25, 0.5, 0.75]
      .map((f) => `<rect x="${(chX + chW * f).toFixed(1)}" y="${chY}" width="1" height="${chH}" fill="#ffffff" opacity="0.14" />`)
      .join('\n');
    const linePts = hrSeries
      .map((bpm, i) => `${(chX + (i / Math.max(1, hrSeries.length - 1)) * chW).toFixed(1)},${yFor(bpm).toFixed(1)}`)
      .join(' ');
    const axisSvg = [0, 0.25, 0.5, 0.75, 1]
      .map((f) => {
        const anchor = f === 0 ? 'start' : f === 1 ? 'end' : 'middle';
        return `<text x="${(chX + chW * f).toFixed(1)}" y="${chY + chH + 26}" text-anchor="${anchor}" fill="rgba(255,255,255,0.45)" font-size="14" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${ogFmtClock(durS * f)}</text>`;
      })
      .join('\n');
    hrPanelSvg = `
    <rect x="${hrPanelX}" y="${cardY}" width="${hrPanelW}" height="${cardH}" rx="30" fill="rgba(248,113,113,0.10)" stroke="rgba(248,113,113,0.30)" />
    <text x="${chX}" y="${cardY + 44}" fill="rgba(252,165,165,0.9)" font-size="15" font-weight="800" letter-spacing="3" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">♥ HEART RATE</text>
    <text x="${chX}" y="${cardY + 96}" fill="#ffffff" font-size="46" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${hrAvgV || '—'}</text>
    <text x="${chX + (String(hrAvgV).length * 28) + 10}" y="${cardY + 94}" fill="rgba(255,255,255,0.6)" font-size="14" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">BPM AVG</text>
    ${hrPeakV > 0 ? `<text x="${hrPanelX + hrPanelW - 26}" y="${cardY + 70}" text-anchor="end" fill="rgba(255,255,255,0.5)" font-size="13" font-weight="900" letter-spacing="2" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">PEAK</text>
    <text x="${hrPanelX + hrPanelW - 26}" y="${cardY + 98}" text-anchor="end" fill="${ogHrZoneColor(hrPeakV, maxHrV)}" font-size="30" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${hrPeakV}</text>` : ''}
    ${bandsSvg}
    ${gridSvg}
    <polyline points="${linePts}" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
    ${axisSvg}
    <text x="${chX}" y="${cardY + cardH - 22}" fill="rgba(255,255,255,0.45)" font-size="13" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">Zones from max ${maxHrV} BPM</text>
    `;
  }
  const levelSize = 112;
  const levelX = cardX + cardW - levelSize - 36;
  const levelY = cardY + 42;
  const playerAvatarSize = 42;
  const playerAvatarX = cardX + 40;
  const playerAvatarY = cardY + 132;
  const scoreX = cardX + 40;

  let cardArtworkOverlay = null;
  if (artworkBuffer?.length) {
    cardArtworkOverlay = {
      input: await sharp(artworkBuffer)
        .rotate()
        .resize(cardW, cardH, { fit: 'cover' })
        .gamma(1.08)
        .modulate({ brightness: 1.3, saturation: 1.16 })
        .sharpen(1.1)
        .composite([{
          input: Buffer.from(`<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${cardW}" height="${cardH}" rx="30" ry="30" fill="#fff"/></svg>`),
          blend: 'dest-in',
        }])
        .png()
        .toBuffer(),
      top: cardY,
      left: cardX,
    };
  }

  let playerAvatarOverlay = null;
  if (brandAssets?.avatarBuffer?.length) {
    playerAvatarOverlay = {
      input: await sharp(brandAssets.avatarBuffer)
        .resize(playerAvatarSize, playerAvatarSize, { fit: 'cover' })
        .png()
        .toBuffer(),
      top: playerAvatarY,
      left: playerAvatarX,
    };
  }

  const titleSvg = title.map((line, index) => {
    const y = cardY + 74 + (index * 42);
    return `<text x="${cardX + 40}" y="${y}" fill="#ffffff" font-size="40" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(line)}</text>`;
  }).join('\n');

  let pillRowX = cardX + 40;
  const pillRowY = cardY + 186;
  const pillsSvg = pillItems.map((pill) => {
    const pillWidth = textWidthEstimate(pill.text, 9, 28);
    const svg = `
      <rect x="${pillRowX}" y="${pillRowY}" width="${pillWidth}" height="28" rx="14" fill="${escapeXml(pill.fill)}" stroke="${escapeXml(pill.stroke)}" />
      <text x="${pillRowX + Math.round(pillWidth / 2)}" y="${pillRowY + 19}" text-anchor="middle" fill="${escapeXml(pill.color)}" font-size="14" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(pill.text)}</text>
    `;
    pillRowX += pillWidth + 12;
    return svg;
  }).join('\n');

  const judgmentPanelY = cardY + cardH - 92;
  const judgmentItemWidth = Math.floor((cardW - 64) / 5);
  const judgmentsSvg = showJudgments
    ? judgments.map((item, index) => {
      const x = cardX + 28 + (index * judgmentItemWidth);
      const centerX = x + Math.floor(judgmentItemWidth / 2);
      return `
        <text x="${centerX}" y="${judgmentPanelY + 30}" text-anchor="middle" fill="${escapeXml(item.color)}" font-size="14" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${item.key}</text>
        <text x="${centerX}" y="${judgmentPanelY + 64}" text-anchor="middle" fill="#ffffff" font-size="28" font-weight="900" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">${escapeXml(formatScore(item.value))}</text>
      `;
    }).join('\n')
    : `<text x="${cardX + 36}" y="${judgmentPanelY + 49}" fill="rgba(252,211,77,0.92)" font-size="18" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">Judgment breakdown unavailable for this score.</text>`;

  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pageBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#070d18"/>
        <stop offset="55%" stop-color="#0b1326"/>
        <stop offset="100%" stop-color="#11152a"/>
      </linearGradient>
      <linearGradient id="topBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(53,123,255,0.18)"/>
        <stop offset="100%" stop-color="rgba(255,210,74,0.12)"/>
      </linearGradient>
      <linearGradient id="cardShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(4,8,16,0.02)"/>
        <stop offset="0.45" stop-color="rgba(5,9,18,0.05)"/>
        <stop offset="1" stop-color="rgba(5,9,18,0.28)"/>
      </linearGradient>
      <linearGradient id="leftRailShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(4,8,16,0.34)"/>
        <stop offset="28%" stop-color="rgba(4,8,16,0.16)"/>
        <stop offset="55%" stop-color="rgba(4,8,16,0.0)"/>
      </linearGradient>
      <linearGradient id="rightRailShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="45%" stop-color="rgba(4,8,16,0.0)"/>
        <stop offset="72%" stop-color="rgba(4,8,16,0.12)"/>
        <stop offset="100%" stop-color="rgba(4,8,16,0.28)"/>
      </linearGradient>
      <linearGradient id="innerGlow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(125,211,252,0.12)"/>
        <stop offset="55%" stop-color="rgba(125,211,252,0.0)"/>
        <stop offset="100%" stop-color="rgba(255,210,74,0.06)"/>
      </linearGradient>
      <linearGradient id="bottomVignette" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(7,12,22,0.0)"/>
        <stop offset="100%" stop-color="rgba(5,9,18,0.18)"/>
      </linearGradient>
      <radialGradient id="centerReveal" cx="50%" cy="38%" r="55%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
        <stop offset="60%" stop-color="rgba(255,255,255,0.02)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
      <linearGradient id="levelGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${escapeXml(modeAccent.from)}"/>
        <stop offset="100%" stop-color="${escapeXml(modeAccent.to)}"/>
      </linearGradient>
      <radialGradient id="pageGlow" cx="18%" cy="12%" r="80%">
        <stop offset="0%" stop-color="rgba(56,189,248,0.18)"/>
        <stop offset="100%" stop-color="rgba(56,189,248,0)"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="88" fill="url(#topBar)" />
    <text x="66" y="70" fill="rgba(186,230,253,0.86)" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" letter-spacing="4">RUN DETAILS</text>
    <text x="${width - 148}" y="60" fill="rgba(255,255,255,0.76)" font-size="22" text-anchor="end" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(username)}</text>

    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="rgba(5,10,20,0.05)" stroke="rgba(172,196,255,0.18)" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="url(#cardShade)" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="url(#leftRailShade)" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="url(#rightRailShade)" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="url(#innerGlow)" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="url(#centerReveal)" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="url(#bottomVignette)" />

    <rect x="${cardX + 22}" y="${cardY + 26}" width="${Math.round(cardW * 0.6)}" height="172" rx="20" fill="rgba(4,7,12,0.55)" />

    ${titleSvg}

    <rect x="${levelX}" y="${levelY}" width="${levelSize}" height="${levelSize}" rx="${Math.round(levelSize / 2)}" fill="url(#levelGrad)" stroke="rgba(255,255,255,0.40)" stroke-width="3" />
    <circle cx="${levelX + Math.round(levelSize / 2)}" cy="${levelY + Math.round(levelSize / 2)}" r="${Math.round(levelSize / 2) - 12}" fill="rgba(8,14,24,0.34)" />
    <text x="${levelX + Math.round(levelSize / 2)}" y="${levelY + 34}" text-anchor="middle" fill="rgba(222,234,247,0.86)" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">LEVEL</text>
    <text x="${levelX + Math.round(levelSize / 2)}" y="${levelY + 76}" text-anchor="middle" fill="#ffffff" font-size="42" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(String(parseInt(play?.level, 10) || '?'))}</text>

    ${playerAvatarOverlay ? `<circle cx="${playerAvatarX + Math.round(playerAvatarSize / 2)}" cy="${playerAvatarY + Math.round(playerAvatarSize / 2)}" r="${Math.round(playerAvatarSize / 2) + 2}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2" />` : ''}
    <text x="${cardX + 40 + (playerAvatarOverlay ? 58 : 0)}" y="${cardY + 148}" fill="#ffffff" font-size="20" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(String(play?.username || 'Player'))}</text>
    <text x="${cardX + 40 + (playerAvatarOverlay ? 58 : 0)}" y="${cardY + 172}" fill="rgba(214,224,240,0.82)" font-size="15" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml([playedAtLabel, chartLine].filter(Boolean).join(' • ') || 'Recent score on Pump Shinsa')}</text>

    ${pillsSvg}

    <text x="${scoreX}" y="${cardY + 326}" fill="${play?.is_stage_break ? '#fda4af' : '#ffffff'}" font-size="${play?.is_stage_break ? 46 : 62}" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(play?.is_stage_break ? 'STAGE BREAK' : scoreText)}</text>
    ${plateName ? `<text x="${scoreX}" y="${cardY + 358}" fill="rgba(250,226,150,0.92)" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" letter-spacing="1.5">${escapeXml(plateName)}</text>` : ''}

    <text x="${cardX + cardW - 40}" y="${cardY + 314}" text-anchor="end" fill="${escapeXml(gradeAccent)}" font-size="70" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(gradeText)}</text>
    ${badgeText ? `<text x="${cardX + cardW - 40}" y="${cardY + 344}" text-anchor="end" fill="rgba(214,224,240,0.80)" font-size="18" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(String(play?.mode || '').trim())} chart</text>` : ''}

    <rect x="${cardX + 20}" y="${judgmentPanelY}" width="${cardW - 40}" height="76" rx="22" fill="rgba(3,7,15,0.52)" stroke="rgba(255,255,255,0.10)" />
    ${judgmentsSvg}
    ${hrPanelSvg}
  </svg>
  `;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 9, g: 15, b: 31, alpha: 1 },
    },
  })
    .composite([
      ...(cardArtworkOverlay ? [cardArtworkOverlay] : []),
      { input: Buffer.from(textSvg) },
      ...buildBrandComposites({ width, brandAssets }),
      ...(playerAvatarOverlay ? [playerAvatarOverlay] : []),
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function renderActivityOgJpeg({
  username = '@player',
  brandAssets = null,
  headline = 'Pump Shinsa Update',
  subline = '',
  accentFrom = '#3aaaff',
  accentTo = '#ffd24a',
  width = 1200,
  height = 630,
}) {
  const { lines: headlineLines } = wrapTextByChars(headline, 32, 3);
  const { lines: sublineLines } = wrapTextByChars(subline, 56, 2);
  const titleLines = headlineLines.length > 0 ? headlineLines : ['Pump Shinsa Update'];
  const titleSize = titleLines.length > 1 ? 62 : 74;
  const titleStartY = 220 - Math.floor((titleLines.length - 1) * titleSize * 0.35);

  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#07111c"/>
        <stop offset="100%" stop-color="#0d1528"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${escapeXml(accentFrom)}"/>
        <stop offset="100%" stop-color="${escapeXml(accentTo)}"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)" />
    <rect x="0" y="0" width="${width}" height="88" fill="rgba(32,157,222,0.18)" />
    <rect x="40" y="24" width="${width - 80}" height="${height - 48}" rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.10)" />
    <rect x="64" y="116" width="8" height="86" rx="4" fill="url(#accent)" />
    <text x="${width - 148}" y="60" fill="rgba(255,255,255,0.76)" font-size="22" text-anchor="end" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(brandAssets?.usernameLabel || username)}</text>

    ${titleLines.map((line, idx) => {
      const y = Math.max(titleStartY, 192) + idx * Math.round(titleSize * 1.1);
      return `<text x="64" y="${y}" fill="white" font-size="${titleSize}" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(line)}</text>`;
    }).join('\\n')}

    ${sublineLines.map((line, idx) => {
      const y = height - 114 + idx * 34;
      return `<text x="64" y="${y}" fill="rgba(255,255,255,0.74)" font-size="28" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(line)}</text>`;
    }).join('\\n')}
  </svg>`;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 9, g: 15, b: 31, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(textSvg) },
      ...buildBrandComposites({ width, brandAssets }),
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

function renderWidgetPageHtml({
  title,
  description,
  canonicalUrl,
  imageUrl,
  bodyHtml,
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeXml(title)}</title>
    <meta name="description" content="${escapeXml(description)}" />
    <link rel="canonical" href="${escapeXml(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Pump Shinsa" />
    <meta property="og:title" content="${escapeXml(title)}" />
    <meta property="og:description" content="${escapeXml(description)}" />
    <meta property="og:url" content="${escapeXml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeXml(imageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeXml(title)}" />
    <meta name="twitter:description" content="${escapeXml(description)}" />
    <meta name="twitter:image" content="${escapeXml(imageUrl)}" />
    <style>
      :root {
        color-scheme: dark;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        background: radial-gradient(160% 120% at 20% 0%, #1b2a4a 0%, #0a1020 58%, #090d18 100%);
        color: #e5e7eb;
      }
      .shell {
        width: min(100%, 560px);
        margin: 16px auto;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 16px;
        background: rgba(8, 12, 26, 0.88);
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
        overflow: hidden;
      }
      .head {
        padding: 14px 16px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.25);
      }
      .brand {
        font-size: 10px;
        letter-spacing: 0.08em;
        color: #93c5fd;
        font-weight: 700;
      }
      .title {
        margin: 4px 0 0;
        font-size: 16px;
        font-weight: 700;
      }
      .body {
        padding: 14px 16px;
      }
      .muted {
        color: #94a3b8;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
      }
      .row:last-child { border-bottom: 0; }
      .pill {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        background: rgba(59, 130, 246, 0.2);
        color: #bfdbfe;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="head">
        <div class="brand">PUMP SHINSA WIDGET</div>
        <p class="title">${escapeXml(title)}</p>
      </header>
      <section class="body">
        ${bodyHtml}
      </section>
    </main>
  </body>
</html>`;
}

function registerSharePreviewRoutes(app, { clientBuildDir, mobileWebBuildDir = '' }) {
  // The Express server hosts share-preview routes for two different
  // front-ends: the legacy desktop SPA (pumpshinsa.com → clientBuildDir)
  // and the Expo mobile-web build (new.pumpshinsa.com → mobileWebBuildDir).
  // Both routes inject OG meta into their respective index.html and let
  // the SPA take over client-side, so an unfurl bot sees the rich preview
  // and humans land on the right front-end.
  //
  // When mobileWebBuildDir is unset (local dev without the mobile-web
  // export deployed), the mobile-host path falls through to the desktop
  // shell — uglier but functional.
  const desktopIndexHtmlPath = path.join(clientBuildDir, 'index.html');
  const mobileIndexHtmlPath = mobileWebBuildDir
    ? path.join(mobileWebBuildDir, 'index.html')
    : '';
  const cache = { desktop: null, mobile: null };

  function readIndexHtmlAt(filepath, key) {
    if (cache[key] != null) return cache[key];
    try {
      cache[key] = fs.readFileSync(filepath, 'utf8');
      return cache[key];
    } catch (err) {
      console.error(`Share preview: failed to read ${filepath}:`, err.message);
      cache[key] = null;
      return null;
    }
  }

  /**
   * Pick the SPA shell HTML to inject OG meta into based on the request's
   * Host header. new.pumpshinsa.com → mobile-web export; everything else
   * (pumpshinsa.com, www, IP, custom domains) → the desktop client.
   */
  function getIndexHtml(req) {
    const host = String(req?.headers?.host || '').toLowerCase().split(':')[0];
    if (host === 'new.pumpshinsa.com' && mobileIndexHtmlPath) {
      const html = readIndexHtmlAt(mobileIndexHtmlPath, 'mobile');
      if (html) return html;
      // Fall through to desktop if mobile shell is missing/unreadable —
      // better to serve *something* than 404 the share link.
    }
    return readIndexHtmlAt(desktopIndexHtmlPath, 'desktop');
  }

  // Social preview image for posts (WhatsApp/iMessage/Twitter/etc).
  app.get('/og/post/:id.jpg', async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    if (isNaN(postId)) return res.status(400).send('Invalid post id');

    const db = getDb();
    const post = db.prepare(`
      SELECT p.id, p.content, p.images, p.created_at, p.updated_at, u.id AS user_id, u.username, u.avatar, u.avatar_v
      FROM user_posts p JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(postId);
    if (!post) return res.status(404).send('Not found');

    const versionRaw = String(post.updated_at || post.created_at || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"post-og-${postId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const isSystemPost = post.user_id === SYSTEM_USER_ID;
      const brandAssets = await buildBrandAssets({
        clientBuildDir,
        origin,
        username: isSystemPost ? '' : post.username,
        avatar: isSystemPost ? '' : post.avatar,
        userId: post.user_id,
        avatarVersion: post.avatar_v,
      });
      if (isSystemPost) {
        brandAssets.usernameLabel = 'Shinsa';
      }
      const jpeg = await renderPostOgJpeg({
        post,
        brandAssets,
        clientBuildDir,
        origin,
        width: 1200,
        height: 630,
      });
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('ETag', etag);
      return res.send(jpeg);
    } catch (err) {
      console.error('Share preview: og image render failed:', err.message);
      return res.status(500).send('Error');
    }
  });

  // Inject per-post Open Graph/Twitter meta into the SPA HTML so social scrapers get real previews.
  app.get('/post/:id', (req, res, next) => {
    const postId = parseInt(req.params.id, 10);
    if (isNaN(postId)) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const post = db.prepare(`
      SELECT p.id, p.content, p.images, p.created_at, p.updated_at, u.id AS user_id, u.username, u.avatar, u.avatar_v
      FROM user_posts p JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(postId);

    // Still serve the SPA for invalid IDs; it can display "not found".
    if (!post) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const version = String(post.updated_at || post.created_at || '');
    const url = `${origin}/post/${postId}`;
    const image = buildPreviewImageUrl(origin, `/og/post/${postId}.jpg`, version);

    const isSystemPost = post.user_id === SYSTEM_USER_ID;
    const title = isSystemPost
      ? 'Weekly Challenge Recap \u2014 Pump Shinsa'
      : (post.username ? `@${post.username} on Pump Shinsa` : 'Pump Shinsa Post');
    const description = summarizePostContent(post, 180) || (isSystemPost ? 'View the weekly challenge recap on Pump Shinsa.' : (post.username ? `View @${post.username}'s post on Pump Shinsa.` : 'View this post on Pump Shinsa.'));

    const html = injectSocialMeta(indexHtml, {
      type: 'article',
      siteName: 'Pump Shinsa',
      title,
      description,
      url,
      image,
      imageType: 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: 'Pump Shinsa post preview',
      twitterCard: 'summary_large_image',
    });

    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  app.get('/og/upscore/:id.jpg', async (req, res) => {
    const upscoreId = parseInt(req.params.id, 10);
    if (Number.isNaN(upscoreId)) return res.status(400).send('Invalid upscore id');

    const db = getDb();
    const upscore = db.prepare(`
      SELECT us.id, us.upscores_json, us.created_at, u.id AS user_id, u.username, u.avatar, u.avatar_v
      FROM user_upscores us JOIN users u ON us.user_id = u.id
      WHERE us.id = ?
    `).get(upscoreId);
    if (!upscore) return res.status(404).send('Not found');

    const versionRaw = String(upscore.created_at || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"upscore-og-${upscoreId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const items = parseJsonArray(upscore.upscores_json);
      const db = getDb();
      for (const item of items) {
        const jacketUrl = resolveUpscoreItemJacketUrl(db, item);
        item._artworkBuffer = await loadPreviewArtworkBuffer({
          clientBuildDir,
          origin,
          jacketUrl,
          backgroundUrl: item.background_url,
        });
      }
      const brandAssets = await buildBrandAssets({
        clientBuildDir,
        origin,
        username: upscore.username,
        avatar: upscore.avatar,
        userId: upscore.user_id,
        avatarVersion: upscore.avatar_v,
      });
      const jpeg = items.length > 0
        ? await renderUpscoreOgJpeg({
            upscore,
            items,
            brandAssets,
            width: 1200,
            height: 630,
          })
        : await renderActivityOgJpeg({
            username: upscore.username ? `@${upscore.username}` : '@player',
            brandAssets,
            headline: summarizeUpscore(upscore).headline,
            subline: summarizeUpscore(upscore).subline,
            accentFrom: '#22d3ee',
            accentTo: '#34d399',
          });
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('ETag', etag);
      return res.send(jpeg);
    } catch (err) {
      console.error('Share preview: upscore og render failed:', err.message);
      return res.status(500).send('Error');
    }
  });

  app.get('/upscore/:id', (req, res, next) => {
    const upscoreId = parseInt(req.params.id, 10);
    if (Number.isNaN(upscoreId)) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const upscore = db.prepare(`
      SELECT us.id, us.upscores_json, us.created_at, u.id AS user_id, u.username, u.avatar, u.avatar_v
      FROM user_upscores us JOIN users u ON us.user_id = u.id
      WHERE us.id = ?
    `).get(upscoreId);
    if (!upscore) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const version = String(upscore.created_at || '');
    const url = `${origin}/upscore/${upscoreId}`;
    const image = buildPreviewImageUrl(origin, `/og/upscore/${upscoreId}.jpg`, version);
    const summary = summarizeUpscore(upscore);

    const html = injectSocialMeta(indexHtml, {
      type: 'article',
      siteName: 'Pump Shinsa',
      title: summary.title,
      description: summary.description,
      url,
      image,
      imageType: 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: 'Pump Shinsa upscore preview',
      twitterCard: 'summary_large_image',
    });
    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  app.get('/og/clear/:id.jpg', async (req, res) => {
    const clearId = parseInt(req.params.id, 10);
    if (Number.isNaN(clearId)) return res.status(400).send('Invalid clear id');

    const db = getDb();
    const clear = db.prepare(`
      SELECT nc.id, nc.song_title, nc.mode, nc.level, nc.grade, nc.clears_json, nc.created_at, u.id AS user_id, u.username, u.avatar, u.avatar_v
      FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
      WHERE nc.id = ?
    `).get(clearId);
    if (!clear) return res.status(404).send('Not found');

    const versionRaw = String(clear.created_at || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"clear-og-${clearId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const clearItems = parseJsonArray(clear.clears_json);
      const db = getDb();
      for (const item of clearItems) {
        const jacketUrl = resolveUpscoreItemJacketUrl(db, item);
        item._artworkBuffer = await loadPreviewArtworkBuffer({
          clientBuildDir,
          origin,
          jacketUrl,
          backgroundUrl: item.background_url,
        });
      }
      const brandAssets = await buildBrandAssets({
        clientBuildDir,
        origin,
        username: clear.username,
        avatar: clear.avatar,
        userId: clear.user_id,
        avatarVersion: clear.avatar_v,
      });
      const summary = summarizeClear(clear);
      const jpeg = clearItems.length > 0
        ? await renderClearOgJpeg({
            clear,
            items: clearItems,
            brandAssets,
            width: 1200,
            height: 630,
          })
        : await renderActivityOgJpeg({
            username: clear.username ? `@${clear.username}` : '@player',
            brandAssets,
            headline: summary.headline,
            subline: summary.subline,
            accentFrom: '#60a5fa',
            accentTo: '#f59e0b',
          });
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('ETag', etag);
      return res.send(jpeg);
    } catch (err) {
      console.error('Share preview: clear og render failed:', err.message);
      return res.status(500).send('Error');
    }
  });

  app.get('/clear/:id', (req, res, next) => {
    const clearId = parseInt(req.params.id, 10);
    if (Number.isNaN(clearId)) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const clear = db.prepare(`
      SELECT nc.id, nc.song_title, nc.mode, nc.level, nc.grade, nc.clears_json, nc.created_at, u.id AS user_id, u.username, u.avatar, u.avatar_v
      FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
      WHERE nc.id = ?
    `).get(clearId);
    if (!clear) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const version = String(clear.created_at || '');
    const url = `${origin}/clear/${clearId}`;
    const image = buildPreviewImageUrl(origin, `/og/clear/${clearId}.jpg`, version);
    const summary = summarizeClear(clear);

    const html = injectSocialMeta(indexHtml, {
      type: 'article',
      siteName: 'Pump Shinsa',
      title: summary.title,
      description: summary.description,
      url,
      image,
      imageType: 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: 'Pump Shinsa clear preview',
      twitterCard: 'summary_large_image',
    });
    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  app.get('/og/play/:id.jpg', async (req, res) => {
    const playId = parseInt(req.params.id, 10);
    if (Number.isNaN(playId)) return res.status(400).send('Invalid play id');

    const db = getDb();
    const play = db.prepare(`
      SELECT rp.*, u.id AS user_id, u.username, u.avatar, u.avatar_v, u.skill_title
      FROM user_recently_played rp
      JOIN users u ON rp.user_id = u.id
      WHERE rp.id = ?
    `).get(playId);
    if (!play) return res.status(404).send('Not found');

    if ((parseInt(play.hr_avg, 10) || 0) > 0 || (parseInt(play.hr_peak, 10) || 0) > 0) {
      play.hr_max = db.prepare(`
        SELECT COALESCE(NULLIF((SELECT max_hr FROM users WHERE id = ?), 0),
                        (SELECT MAX(hr_peak) FROM user_recently_played WHERE user_id = ? AND hr_peak > 0),
                        190) AS max_hr
      `).get(play.user_id, play.user_id)?.max_hr || 190;
      play.song_duration_s = db.prepare(
        'SELECT duration_seconds FROM songs WHERE TRIM(title) = TRIM(?) AND mode = ? AND level = ? LIMIT 1',
      ).get(play.song_title, play.mode, play.level)?.duration_seconds || 0;
    }

    const versionRaw = String(play.played_at_utc || play.date_played || play.id || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"play-og2-${playId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const resolvedJacketUrl = resolveUpscoreItemJacketUrl(db, play);
      const preferredArtworkUrl = resolvedJacketUrl || String(play.background_url || '').trim();
      const fallbackArtworkUrl = String(play.background_url || '').trim();
      // Asset fetches must never fail the render — a 500 here gets written to
      // disk by the app's share flow and attached as a blank "image" (the
      // observed blank-on-first-share bug: cold artwork fetch timed out, the
      // retry hit a warm cache). Render without the asset instead.
      let artworkBuffer = null;
      try {
        artworkBuffer = await loadPreviewArtworkBuffer({
          clientBuildDir,
          origin,
          jacketUrl: preferredArtworkUrl,
          backgroundUrl: fallbackArtworkUrl,
        });
      } catch (assetErr) {
        console.error('Share preview: play artwork load failed (rendering without):', assetErr.message);
      }
      let brandAssets = null;
      try {
        brandAssets = await buildBrandAssets({
          clientBuildDir,
          origin,
          username: play.username,
          avatar: play.avatar,
          userId: play.user_id,
          avatarVersion: play.avatar_v,
        });
      } catch (assetErr) {
        console.error('Share preview: play brand assets failed (rendering without):', assetErr.message);
      }
      const jpeg = await renderPlayOgJpeg({
        play,
        brandAssets,
        artworkBuffer,
        width: 1200,
        height: 630,
      });
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('ETag', etag);
      return res.send(jpeg);
    } catch (err) {
      console.error('Share preview: play og render failed:', err.message);
      return res.status(500).send('Error');
    }
  });

  // Portrait story-format share image (1080x1920) — what the app's Share
  // button attaches. The landscape /og/play/:id.jpg stays for link unfurls.
  app.get('/og/play/:id/story.jpg', async (req, res) => {
    const playId = parseInt(req.params.id, 10);
    if (Number.isNaN(playId)) return res.status(400).send('Invalid play id');

    const db = getDb();
    const play = db.prepare(`
      SELECT rp.*, u.id AS user_id, u.username, u.avatar, u.avatar_v, u.skill_title
      FROM user_recently_played rp
      JOIN users u ON rp.user_id = u.id
      WHERE rp.id = ?
    `).get(playId);
    if (!play) return res.status(404).send('Not found');

    if ((parseInt(play.hr_avg, 10) || 0) > 0 || (parseInt(play.hr_peak, 10) || 0) > 0) {
      play.hr_max = db.prepare(`
        SELECT COALESCE(NULLIF((SELECT max_hr FROM users WHERE id = ?), 0),
                        (SELECT MAX(hr_peak) FROM user_recently_played WHERE user_id = ? AND hr_peak > 0),
                        190) AS max_hr
      `).get(play.user_id, play.user_id)?.max_hr || 190;
      play.song_duration_s = db.prepare(
        'SELECT duration_seconds FROM songs WHERE TRIM(title) = TRIM(?) AND mode = ? AND level = ? LIMIT 1',
      ).get(play.song_title, play.mode, play.level)?.duration_seconds || 0;
    }

    const versionRaw = String(play.played_at_utc || play.date_played || play.id || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"play-story-${playId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const resolvedJacketUrl = resolveUpscoreItemJacketUrl(db, play);
      let artworkBuffer = null;
      try {
        artworkBuffer = await loadPreviewArtworkBuffer({
          clientBuildDir,
          origin,
          jacketUrl: resolvedJacketUrl || String(play.background_url || '').trim(),
          backgroundUrl: String(play.background_url || '').trim(),
        });
      } catch (assetErr) {
        console.error('Share preview: story artwork load failed (rendering without):', assetErr.message);
      }
      let brandAssets = null;
      try {
        brandAssets = await buildBrandAssets({
          clientBuildDir,
          origin,
          username: play.username,
          avatar: play.avatar,
          userId: play.user_id,
          avatarVersion: play.avatar_v,
        });
      } catch (assetErr) {
        console.error('Share preview: story brand assets failed (rendering without):', assetErr.message);
      }
      const jpeg = await renderPlayStoryJpeg({ play, brandAssets, artworkBuffer });
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('ETag', etag);
      return res.send(jpeg);
    } catch (err) {
      console.error('Share preview: play story render failed:', err.message);
      return res.status(500).send('Error');
    }
  });

  app.get('/play/:id', (req, res, next) => {
    const playId = parseInt(req.params.id, 10);
    if (Number.isNaN(playId)) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const play = db.prepare(`
      SELECT rp.*, u.id AS user_id, u.username, u.skill_title
      FROM user_recently_played rp
      JOIN users u ON rp.user_id = u.id
      WHERE rp.id = ?
    `).get(playId);
    if (!play) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const version = String(play.played_at_utc || play.date_played || play.id || '');
    const url = `${origin}/play/${playId}`;
    const image = buildPreviewImageUrl(origin, `/og/play/${playId}.jpg`, version);
    const summary = summarizePlay(play);

    const html = injectSocialMeta(indexHtml, {
      type: 'article',
      siteName: 'Pump Shinsa',
      title: summary.title,
      description: summary.description,
      url,
      image,
      imageType: 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: 'Pump Shinsa play preview',
      twitterCard: 'summary_large_image',
    });
    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  app.get('/songs/chart/:chartId', (req, res, next) => {
    const chartId = parseInt(req.params.chartId, 10);
    if (Number.isNaN(chartId)) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const chart = db.prepare(`
      SELECT
        id,
        title,
        artist,
        mode,
        level,
        COALESCE(NULLIF(jacket_url, ''), '') AS artwork_url
      FROM songs
      WHERE id = ?
      LIMIT 1
    `).get(chartId);

    if (!chart) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const url = `${origin}/songs/chart/${chartId}`;
    const summary = summarizeSongChart(chart);
    const image = toAbsolutePreviewUrl(origin, chart.artwork_url);
    const html = injectSocialMeta(indexHtml, {
      type: 'website',
      siteName: 'Pump Shinsa',
      title: summary.title,
      description: summary.description,
      url,
      image,
      imageType: guessPreviewImageType(image),
      imageAlt: summary.imageAlt,
      twitterCard: 'summary_large_image',
    });

    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  app.get('/songs', (req, res, next) => {
    const query = normalizeWhitespace(req.query?.q || '');
    if (!query) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const row = findSongPreviewRowByTitle(db, query);
    if (!row) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const url = `${origin}/songs?q=${encodeURIComponent(query)}`;
    const summary = summarizeSongSearch(row, query);
    const image = toAbsolutePreviewUrl(origin, row.artwork_url);
    const html = injectSocialMeta(indexHtml, {
      type: 'website',
      siteName: 'Pump Shinsa',
      title: summary.title,
      description: summary.description,
      url,
      image,
      imageType: guessPreviewImageType(image),
      imageAlt: summary.imageAlt,
      twitterCard: 'summary_large_image',
    });

    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  app.get('/og/widget/:username/:type.jpg', async (req, res) => {
    const type = String(req.params.type || '').toLowerCase();
    if (!['stats', 'recent-scores', 'recent-clears', 'posts'].includes(type)) {
      return res.status(404).send('Not found');
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username, avatar, avatar_v, pumbility FROM users WHERE lower(username) = lower(?)').get(req.params.username);
    if (!user) return res.status(404).send('Not found');

    let headline = `${user.username} Widget`;
    let subline = 'Pump Shinsa';
    let versionSeed = '';
    let stats = null;
    let recentScoreRows = [];
    let recentClearItems = [];
    let recentPosts = [];

    if (type === 'stats') {
      const followers = db.prepare('SELECT COUNT(*) as c FROM user_follows WHERE following_id = ?').get(user.id).c || 0;
      const posts = db.prepare('SELECT COUNT(*) as c FROM user_posts WHERE user_id = ?').get(user.id).c || 0;
      const upscores = db.prepare('SELECT COUNT(*) as c FROM user_upscores WHERE user_id = ?').get(user.id).c || 0;
      const clears = db.prepare('SELECT COUNT(*) as c FROM user_new_clears WHERE user_id = ?').get(user.id).c || 0;
      stats = { followers, posts, upscores, clears };
      headline = `${user.username} Stats Card`;
      subline = `PB ${user.pumbility || 0} • ${followers} followers • ${posts} posts • ${upscores} upscores • ${clears} clears`;
      versionSeed = `${followers}-${posts}-${upscores}-${clears}-${user.pumbility || 0}`;
    } else if (type === 'recent-scores') {
      recentScoreRows = db.prepare(`
        SELECT song_title, mode, level, score, grade, date_played
        FROM user_recently_played
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 8
      `).all(user.id);
      const first = recentScoreRows[0];
      headline = `${user.username} Recent Scores`;
      subline = first
        ? `${first.song_title} (${modeShort(first.mode)}${parseInt(first.level, 10) || 0}) ${parseInt(first.score, 10).toLocaleString()}`
        : 'No recent scores available';
      versionSeed = String(first?.date_played || first?.score || '0');
    } else if (type === 'recent-clears') {
      const rows = db.prepare(`
        SELECT song_title, mode, level, grade, clears_json, created_at
        FROM user_new_clears
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 8
      `).all(user.id);
      recentClearItems = normalizeClearWidgetItems(rows).slice(0, 8);
      const first = rows[0];
      const summary = first ? summarizeClear({ ...first, username: user.username }) : null;
      headline = `${user.username} Recent Clears`;
      subline = summary ? summary.subline : 'No recent clears available';
      versionSeed = String(first?.created_at || '0');
    } else {
      recentPosts = db.prepare(`
        SELECT id, content, images, created_at, updated_at
        FROM user_posts
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 6
      `).all(user.id);
      const first = recentPosts[0];
      headline = `${user.username} Recent Posts`;
      subline = first ? summarizePostContent(first, 120) || 'Latest post update' : 'No posts yet';
      versionSeed = String(first?.updated_at || first?.created_at || '0');
    }

    const etag = `W/"widget-og-${user.id}-${type}-${String(versionSeed).replace(/[^A-Za-z0-9_.-]/g, '_')}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const brandAssets = await buildBrandAssets({
        clientBuildDir,
        origin,
        username: user.username,
        avatar: user.avatar,
        userId: user.id,
        avatarVersion: user.avatar_v,
      });
      if (recentScoreRows.length > 0) {
        await attachArtworkBuffersToItems({
          db,
          items: recentScoreRows,
          clientBuildDir,
          origin,
        });
      }
      if (recentClearItems.length > 0) {
        await attachArtworkBuffersToItems({
          db,
          items: recentClearItems,
          clientBuildDir,
          origin,
        });
      }

      let jpeg;
      if (type === 'stats' && stats) {
        jpeg = await renderStatsWidgetOgJpeg({
          user,
          stats,
          brandAssets,
          width: 1200,
          height: 630,
        });
      } else if (type === 'recent-scores' && recentScoreRows.length > 0) {
        jpeg = await renderRecentScoresWidgetOgJpeg({
          user,
          rows: recentScoreRows,
          brandAssets,
          width: 1200,
          height: 630,
        });
      } else if (type === 'recent-clears' && recentClearItems.length > 0) {
        jpeg = await renderRecentClearsWidgetOgJpeg({
          user,
          items: recentClearItems,
          brandAssets,
          width: 1200,
          height: 630,
        });
      } else if (type === 'posts' && recentPosts.length > 0) {
        jpeg = await renderPostOgJpeg({
          post: { ...recentPosts[0], username: user.username },
          brandAssets,
          clientBuildDir,
          origin,
          contextLabel: 'Recent Posts',
          width: 1200,
          height: 630,
        });
      } else {
        jpeg = await renderActivityOgJpeg({
          username: `@${user.username}`,
          brandAssets,
          headline,
          subline,
          accentFrom: '#ff3366',
          accentTo: '#3aaaff',
        });
      }
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=1800');
      res.set('ETag', etag);
      return res.send(jpeg);
    } catch (err) {
      console.error('Share preview: widget og render failed:', err.message);
      return res.status(500).send('Error');
    }
  });

  app.get('/widget/:username/:type', (req, res) => {
    const type = String(req.params.type || '').toLowerCase();
    if (!['stats', 'recent-scores', 'recent-clears', 'posts'].includes(type)) {
      return res.status(404).send('Not found');
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username, avatar, avatar_v, pumbility, skill_title FROM users WHERE lower(username) = lower(?)').get(req.params.username);
    if (!user) return res.status(404).send('User not found');

    const origin = getRequestOrigin(req);
    const canonicalUrl = `${origin}/widget/${encodeURIComponent(user.username)}/${type}`;
    let imageVersion = '';
    let title = `${user.username} Widget`;
    let description = `Pump Shinsa widget for @${user.username}`;
    let bodyHtml = '<p class="muted">No data available.</p>';

    if (type === 'stats') {
      const followers = db.prepare('SELECT COUNT(*) as c FROM user_follows WHERE following_id = ?').get(user.id).c || 0;
      const following = db.prepare('SELECT COUNT(*) as c FROM user_follows WHERE follower_id = ?').get(user.id).c || 0;
      const posts = db.prepare('SELECT COUNT(*) as c FROM user_posts WHERE user_id = ?').get(user.id).c || 0;
      const upscores = db.prepare('SELECT COUNT(*) as c FROM user_upscores WHERE user_id = ?').get(user.id).c || 0;
      const clears = db.prepare('SELECT COUNT(*) as c FROM user_new_clears WHERE user_id = ?').get(user.id).c || 0;
      title = `${user.username} Stats Card`;
      description = `Live stats card for @${user.username} on Pump Shinsa.`;
      imageVersion = `${followers}-${posts}-${upscores}-${clears}-${user.pumbility || 0}`;
      bodyHtml = `
        <div class="row"><span>Pumbility</span><strong class="mono">${(user.pumbility || 0).toLocaleString()}</strong></div>
        <div class="row"><span>Skill Title</span><strong>${escapeXml(user.skill_title || 'Unranked')}</strong></div>
        <div class="row"><span>Followers</span><strong class="mono">${followers}</strong></div>
        <div class="row"><span>Following</span><strong class="mono">${following}</strong></div>
        <div class="row"><span>Posts</span><strong class="mono">${posts}</strong></div>
        <div class="row"><span>Upscores</span><strong class="mono">${upscores}</strong></div>
        <div class="row"><span>Clears</span><strong class="mono">${clears}</strong></div>
      `;
    } else if (type === 'recent-scores') {
      const rows = db.prepare(`
        SELECT song_title, mode, level, score, grade, date_played
        FROM user_recently_played
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 8
      `).all(user.id);
      title = `${user.username} Recent Scores`;
      description = `Recent scores from @${user.username} on Pump Shinsa.`;
      imageVersion = String(rows[0]?.date_played || rows[0]?.score || '0');
      bodyHtml = rows.length === 0
        ? '<p class="muted">No recent scores available.</p>'
        : rows.map((row) => `
            <div class="row">
              <div>
                <div>${escapeXml(row.song_title || 'Unknown')}</div>
                <div class="muted">${escapeXml(modeShort(row.mode))}${parseInt(row.level, 10) || 0}</div>
              </div>
              <div style="text-align:right">
                <div class="mono">${(parseInt(row.score, 10) || 0).toLocaleString()}</div>
                <div class="pill">${escapeXml(formatDisplayGrade(row.grade) || '--')}</div>
              </div>
            </div>
          `).join('');
    } else if (type === 'recent-clears') {
      const rows = db.prepare(`
        SELECT song_title, mode, level, grade, clears_json, created_at
        FROM user_new_clears
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 8
      `).all(user.id);
      title = `${user.username} Recent Clears`;
      description = `Recent clears from @${user.username} on Pump Shinsa.`;
      imageVersion = String(rows[0]?.created_at || '0');
      bodyHtml = rows.length === 0
        ? '<p class="muted">No recent clears available.</p>'
        : rows.map((row) => {
          const summary = summarizeClear({ ...row, username: user.username });
          const mode = modeShort(row.mode);
          const level = parseInt(row.level, 10) || 0;
          const grade = formatDisplayGrade(row.grade);
          return `
            <div class="row">
              <div>
                <div>${escapeXml(row.song_title || summary.headline)}</div>
                <div class="muted">${escapeXml(mode)}${level > 0 ? level : ''}</div>
              </div>
              <div style="text-align:right">
                <div class="pill">${escapeXml(grade || summary.subline || 'Clear')}</div>
              </div>
            </div>
          `;
        }).join('');
    } else {
      const rows = db.prepare(`
        SELECT content, created_at, updated_at
        FROM user_posts
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 6
      `).all(user.id);
      title = `${user.username} Recent Posts`;
      description = `Recent posts from @${user.username} on Pump Shinsa.`;
      imageVersion = String(rows[0]?.updated_at || rows[0]?.created_at || '0');
      bodyHtml = rows.length === 0
        ? '<p class="muted">No recent posts available.</p>'
        : rows.map((row) => `
            <div class="row">
              <div>
                <div>${escapeXml(summarizePostContent(row, 160) || '(No text content)')}</div>
                <div class="muted">${escapeXml(String(row.created_at || ''))}</div>
              </div>
            </div>
          `).join('');
    }

    const imageUrl = buildPreviewImageUrl(origin, `/og/widget/${encodeURIComponent(user.username)}/${type}.jpg`, imageVersion);

    const html = renderWidgetPageHtml({
      title,
      description,
      canonicalUrl,
      imageUrl,
      bodyHtml,
    });
    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  // ───────────────────────────────────────────────────
  // Live Session rich preview (WhatsApp / iMessage / etc.)
  // ───────────────────────────────────────────────────

  app.get('/og/live/:id.jpg', async (req, res) => {
    const sessionId = String(req.params.id || '').replace(/\.jpg$/i, '');
    if (!sessionId) return res.status(400).send('Invalid session id');

    const db = getDb();
    const session = db.prepare(`
      SELECT ls.id, ls.title, ls.status, ls.session_type, ls.stream_url,
             ls.youtube_video_id, ls.youtube_broadcast_id, ls.youtube_stream_title,
             ls.viewer_peak, ls.created_at, ls.started_at, ls.ended_at, ls.updated_at,
             u.id AS user_id, u.username, u.avatar, u.avatar_v
      FROM live_sessions ls
      JOIN users u ON ls.host_user_id = u.id
      WHERE ls.id = ? AND (ls.deleted_at IS NULL OR ls.deleted_at = '')
    `).get(sessionId);
    if (!session) return res.status(404).send('Not found');

    const versionRaw = String(session.updated_at || session.created_at || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"live-og-${sessionId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const brandAssets = await buildBrandAssets({
        clientBuildDir,
        origin,
        username: session.username,
        avatar: session.avatar,
        userId: session.user_id,
        avatarVersion: session.avatar_v,
      });

      // Try to load YouTube thumbnail as background
      let ytThumbnailBuffer = null;
      const ytVideoId = session.youtube_video_id || session.youtube_broadcast_id;
      if (ytVideoId) {
        const thumbUrl = `https://img.youtube.com/vi/${ytVideoId}/maxresdefault.jpg`;
        try {
          ytThumbnailBuffer = await loadImageBuffer({ clientBuildDir, origin, source: thumbUrl });
          if (ytThumbnailBuffer?.length) {
            ytThumbnailBuffer = await sharp(ytThumbnailBuffer)
              .resize(1200, 630, { fit: 'cover' })
              .jpeg({ quality: 80 })
              .toBuffer();
          }
        } catch { ytThumbnailBuffer = null; }
      }

      const isLive = session.status === 'live';
      const isHop = session.session_type === 'hop';
      const sessionTitle = session.title || session.youtube_stream_title || `${session.username}'s ${isHop ? 'Hour of Power' : 'Live Session'}`;
      const statusLabel = isLive ? '● LIVE NOW' : 'Session Ended';
      const statusColor = isLive ? '#ef4444' : '#94a3b8';
      const accentFrom = isLive ? '#ef4444' : '#3b82f6';
      const accentTo = isHop ? '#f59e0b' : '#ec4899';
      const hostLabel = brandAssets?.usernameLabel || `@${session.username}`;
      const viewerText = session.viewer_peak ? `Peak: ${session.viewer_peak} viewers` : '';

      const { lines: titleLines } = wrapTextByChars(sessionTitle, 30, 2);
      const titleSize = titleLines.length > 1 ? 56 : 68;
      const titleStartY = ytThumbnailBuffer ? 340 : 240;

      const width = 1200;
      const height = 630;

      const overlaySvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#07111c"/>
            <stop offset="100%" stop-color="#0d1528"/>
          </linearGradient>
          <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${escapeXml(accentFrom)}"/>
            <stop offset="100%" stop-color="${escapeXml(accentTo)}"/>
          </linearGradient>
          ${ytThumbnailBuffer ? `
          <linearGradient id="dim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(7,17,28,0.15)"/>
            <stop offset="45%" stop-color="rgba(7,17,28,0.55)"/>
            <stop offset="100%" stop-color="rgba(7,17,28,0.96)"/>
          </linearGradient>` : ''}
        </defs>
        ${ytThumbnailBuffer ? `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#dim)" />` : `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)" />`}

        <!-- Status badge -->
        <rect x="64" y="24" width="${statusLabel.length * 14 + 36}" height="40" rx="20" fill="${isLive ? 'rgba(239,68,68,0.25)' : 'rgba(100,116,139,0.25)'}" stroke="${isLive ? 'rgba(239,68,68,0.5)' : 'rgba(100,116,139,0.3)'}" stroke-width="1.5"/>
        <text x="84" y="51" fill="${escapeXml(statusColor)}" font-size="20" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(statusLabel)}</text>

        <!-- Accent bar -->
        <rect x="64" y="${titleStartY - 30}" width="8" height="80" rx="4" fill="url(#accent)" />

        <!-- Title -->
        ${titleLines.map((line, idx) => {
          const y = titleStartY + idx * Math.round(titleSize * 1.15);
          return `<text x="88" y="${y}" fill="white" font-size="${titleSize}" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(line)}</text>`;
        }).join('\n')}

        <!-- Host label -->
        <text x="${width - 148}" y="52" fill="rgba(255,255,255,0.76)" font-size="22" text-anchor="end" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(hostLabel)}</text>

        <!-- Viewer count / subtitle -->
        ${viewerText ? `<text x="88" y="${titleStartY + titleLines.length * Math.round(titleSize * 1.15) + 24}" fill="rgba(255,255,255,0.6)" font-size="24" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(viewerText)}</text>` : ''}

        <!-- PUMP SHINSA branding bottom -->
        <text x="64" y="${height - 30}" fill="rgba(255,255,255,0.28)" font-size="16" font-weight="700" letter-spacing="0.12em" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">PUMP SHINSA</text>
      </svg>`;

      const composites = [
        { input: Buffer.from(overlaySvg) },
        ...buildBrandComposites({ width, brandAssets }),
      ];

      let baseImage;
      if (ytThumbnailBuffer) {
        // Use YouTube thumbnail as background
        baseImage = sharp(ytThumbnailBuffer).resize(width, height, { fit: 'cover' });
      } else {
        baseImage = sharp({
          create: { width, height, channels: 4, background: { r: 9, g: 15, b: 31, alpha: 1 } },
        });
      }

      const jpeg = await baseImage
        .composite(composites)
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=300');
      res.set('ETag', etag);
      return res.send(jpeg);
    } catch (err) {
      console.error('Share preview: live session og render failed:', err.message);
      return res.status(500).send('Error');
    }
  });

  app.get('/live/:id', (req, res, next) => {
    const sessionId = String(req.params.id || '');
    if (!sessionId) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const session = db.prepare(`
      SELECT ls.id, ls.title, ls.status, ls.session_type, ls.stream_url,
             ls.youtube_video_id, ls.youtube_broadcast_id, ls.youtube_stream_title,
             ls.viewer_peak, ls.created_at, ls.started_at, ls.ended_at, ls.updated_at,
             u.id AS user_id, u.username, u.avatar, u.avatar_v
      FROM live_sessions ls
      JOIN users u ON ls.host_user_id = u.id
      WHERE ls.id = ? AND (ls.deleted_at IS NULL OR ls.deleted_at = '')
    `).get(sessionId);

    if (!session) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const isLive = session.status === 'live';
    const isHop = session.session_type === 'hop';
    const sessionTitle = session.title || session.youtube_stream_title || `${session.username}'s ${isHop ? 'Hour of Power' : 'Live Session'}`;
    const statusText = isLive ? '🔴 LIVE NOW' : 'Session ended';
    const description = `${statusText} — ${sessionTitle} hosted by @${session.username}${session.viewer_peak ? ` • Peak: ${session.viewer_peak} viewers` : ''} — Pump Shinsa`;

    const url = `${origin}/live/${sessionId}`;
    const version = String(session.updated_at || session.created_at || '');
    const image = buildPreviewImageUrl(origin, `/og/live/${sessionId}.jpg`, version);

    const html = injectSocialMeta(indexHtml, {
      type: isLive ? 'video.other' : 'article',
      siteName: 'Pump Shinsa',
      title: `${isLive ? '🔴 ' : ''}${sessionTitle} — @${session.username}`,
      description,
      url,
      image,
      imageType: 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: `${session.username}'s live session on Pump Shinsa`,
      twitterCard: 'summary_large_image',
    });
    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  // ═══════════════════════════════════════════════════════════
  //  TOURNAMENT POSTER — OG image + meta injection
  // ═══════════════════════════════════════════════════════════

  const TOURNAMENT_FORMAT_LABELS = {
    round_robin: 'Round Robin', pools: 'Pools', single_elim: 'Single Elimination',
    double_elim: 'Double Elimination', gauntlet: 'Gauntlet', hour_of_power: 'Hour of Power', b15: 'Best 15',
  };
  const TOURNAMENT_FORMAT_ICONS = {
    round_robin: '\uD83D\uDD04', pools: '\uD83C\uDFCA', single_elim: '\uD83C\uDFC6',
    double_elim: '\uD83E\uDD4A', gauntlet: '\u2694\uFE0F', hour_of_power: '\u23F1\uFE0F', b15: '\uD83C\uDFAF',
  };

  function formatTournamentDateServer(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    }
    return raw;
  }

  async function renderTournamentOgJpeg({ tournament, players, phases, clientBuildDir, origin }) {
    const W = 1200, H = 630;
    const title = escapeXml(String(tournament.name || 'Tournament').trim());
    const date = escapeXml(formatTournamentDateServer(tournament.date));
    const location = escapeXml(String(tournament.location || '').trim());
    const dateLoc = [date, location].filter(Boolean).join('  \u00B7  ');

    // Determine format flow
    const displayPhases = phases.length > 0 ? phases : [{ format: tournament.config?.gauntlet_enabled ? 'gauntlet' : 'round_robin' }];
    const phaseFlow = displayPhases.map(p => TOURNAMENT_FORMAT_LABELS[p.format] || p.format).join(' \u2192 ');
    const primaryFormat = displayPhases[0]?.format || 'round_robin';

    // Load tournament avatar (still)
    let avatarComposite = null;
    const avatarSize = 90;
    const avatarSource = String(tournament.avatar || '').trim();
    if (avatarSource) {
      const src = avatarSource.startsWith('http') || avatarSource.startsWith('/') || isInlineDataAvatar(avatarSource) ? avatarSource : `/${avatarSource}`;
      const buf = await loadImageBuffer({ clientBuildDir, origin, source: src });
      if (buf?.length) {
        avatarComposite = await sharp(buf)
          .rotate()
          .resize(avatarSize, avatarSize, { fit: 'cover' })
          .composite([{
            input: Buffer.from(`<svg width="${avatarSize}" height="${avatarSize}" xmlns="http://www.w3.org/2000/svg"><rect width="${avatarSize}" height="${avatarSize}" rx="18" fill="#fff"/></svg>`),
            blend: 'dest-in',
          }])
          .png()
          .toBuffer();
      }
    }

    // Load poster background — hero style (brighter, no blur, gradient overlay)
    let bgComposite = null;
    const bgSource = String(tournament.poster_bg || '').trim();
    if (bgSource) {
      const buf = await loadImageBuffer({ clientBuildDir, origin, source: bgSource });
      if (buf?.length) {
        bgComposite = await sharp(buf)
          .rotate()
          .resize(W, H, { fit: 'cover' })
          .modulate({ brightness: 0.55 })
          .png()
          .toBuffer();
      }
    }

    // Load player avatars (up to 10)
    const playerAvatars = [];
    const maxPlayerAvatars = Math.min(players.length, 10);
    for (let i = 0; i < maxPlayerAvatars; i++) {
      const p = players[i];
      const pSrc = String(p.avatar || '').trim();
      if (!pSrc) { playerAvatars.push(null); continue; }
      const src = pSrc.startsWith('http') || pSrc.startsWith('/') || isInlineDataAvatar(pSrc) ? pSrc : `/${pSrc}`;
      try {
        const buf = await loadImageBuffer({ clientBuildDir, origin, source: src });
        if (buf?.length) {
          playerAvatars.push(await sharp(buf).rotate().resize(36, 36, { fit: 'cover' }).composite([{
            input: Buffer.from('<svg width="36" height="36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="18" fill="#fff"/></svg>'),
            blend: 'dest-in',
          }]).png().toBuffer());
        } else { playerAvatars.push(null); }
      } catch { playerAvatars.push(null); }
    }

    // ── Centered hero-style layout measurements ──
    const CX = W / 2;
    let y = 28;
    const avatarTop = y;
    if (avatarComposite) y += avatarSize + 16;

    const dateLocY = dateLoc ? (y + 14) : y;
    if (dateLoc) y += 28;

    const titleY = y + 38;
    y += 50;
    const subtitleY = y + 16;
    y += 28;

    const dotsY = y + 14;
    y += 36;
    const divY = y;
    y += 14;

    const diagramCenterY = Math.min(Math.round((y + 510) / 2), 400);
    const playerAvatarY = 540;
    const avatarSpacing = 40;
    const avatarRowWidth = maxPlayerAvatars * avatarSpacing;
    const avatarRowStartX = CX - avatarRowWidth / 2;

    // ── Format diagram SVG ──
    const FORMAT_DOT_COLORS = {
      round_robin: '255,51,102', pools: '34,211,238', single_elim: '255,215,0',
      double_elim: '255,215,0', gauntlet: '168,85,247', hour_of_power: '52,211,153', b15: '167,139,250',
    };

    function renderDiagramSvg() {
      const dCx = CX, dCy = diagramCenterY;

      if (primaryFormat === 'round_robin') {
        const n = Math.min(Math.max(players.length || 6, 4), 8);
        const r = 75, nodeR = 14;
        const positions = [];
        for (let i = 0; i < n; i++) {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          positions.push({ x: dCx + Math.cos(angle) * r, y: dCy + Math.sin(angle) * r });
        }
        let s = '';
        // All connecting lines
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const hl = (i === 0 && j === 1);
            s += `<line x1="${positions[i].x.toFixed(1)}" y1="${positions[i].y.toFixed(1)}" x2="${positions[j].x.toFixed(1)}" y2="${positions[j].y.toFixed(1)}" stroke="rgba(255,51,102,${hl ? '0.45' : '0.07'})" stroke-width="${hl ? 2 : 0.8}"/>`;
          }
        }
        // Highlighted VS label
        if (n >= 2) {
          const mx = (positions[0].x + positions[1].x) / 2, my = (positions[0].y + positions[1].y) / 2;
          s += `<text x="${mx.toFixed(1)}" y="${(my - 10).toFixed(1)}" text-anchor="middle" fill="rgba(255,51,102,0.55)" font-size="10" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">VS</text>`;
        }
        // Player nodes
        for (let i = 0; i < n; i++) {
          const initial = escapeXml((players[i]?.name || `P${i + 1}`).charAt(0).toUpperCase());
          const active = i < 2;
          s += `<circle cx="${positions[i].x.toFixed(1)}" cy="${positions[i].y.toFixed(1)}" r="${nodeR}" fill="rgba(255,51,102,${active ? '0.18' : '0.05'})" stroke="rgba(255,51,102,${active ? '0.5' : '0.15'})" stroke-width="1.5"/>`;
          s += `<text x="${positions[i].x.toFixed(1)}" y="${(positions[i].y + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${active ? 'rgba(255,200,220,0.85)' : 'rgba(255,255,255,0.4)'}" font-size="11" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${initial}</text>`;
        }
        s += `<text x="${dCx}" y="${dCy + r + 32}" text-anchor="middle" fill="rgba(255,255,255,0.16)" font-size="10" font-weight="700" letter-spacing="2" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">EVERYONE PLAYS EVERYONE</text>`;
        return s;
      }

      if (primaryFormat === 'gauntlet') {
        const n = Math.min(Math.max(players.length || 6, 4), 7);
        const matchCount = Math.min(n - 1, 5);
        const stepH = 38, nodeR = 13;
        const totalH = (matchCount - 1) * stepH;
        const baseY = dCy + totalH / 2;

        let s = '';
        s += `<line x1="${dCx}" y1="${baseY + 8}" x2="${dCx}" y2="${baseY - totalH - 12}" stroke="rgba(168,85,247,0.1)" stroke-width="1.5" stroke-dasharray="4 4"/>`;
        for (let i = 0; i < matchCount; i++) {
          const yy = baseY - i * stepH;
          const isFinal = i === matchCount - 1;
          const col = isFinal ? '255,215,0' : '168,85,247';
          const p1 = players[i] || { name: `P${i + 1}` };
          const p2 = players[i + 1] || { name: `P${i + 2}` };
          const i1 = escapeXml(String(p1.name || '?').charAt(0).toUpperCase());
          const i2 = escapeXml(String(p2.name || '?').charAt(0).toUpperCase());

          s += `<line x1="${dCx - 50}" y1="${yy}" x2="${dCx + 50}" y2="${yy}" stroke="rgba(${col},${isFinal ? '0.35' : '0.16'})" stroke-width="1.5"/>`;
          s += `<circle cx="${dCx - 50}" cy="${yy}" r="${nodeR}" fill="rgba(${col},0.1)" stroke="rgba(${col},0.35)" stroke-width="1.5"/>`;
          s += `<text x="${dCx - 50}" y="${yy + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(${col},0.75)" font-size="10" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${i1}</text>`;
          s += `<text x="${dCx}" y="${yy + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(${col},0.3)" font-size="8" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">VS</text>`;
          s += `<circle cx="${dCx + 50}" cy="${yy}" r="${nodeR}" fill="rgba(${col},0.1)" stroke="rgba(${col},0.35)" stroke-width="1.5"/>`;
          s += `<text x="${dCx + 50}" y="${yy + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(${col},0.75)" font-size="10" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${i2}</text>`;
          s += `<text x="${dCx + 82}" y="${yy + 1}" dominant-baseline="central" fill="rgba(${col},${isFinal ? '0.5' : '0.25'})" font-size="8" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${isFinal ? 'FINAL' : '#' + (i + 1)}</text>`;
        }
        s += `<text x="${dCx}" y="${baseY - totalH - 22}" text-anchor="middle" fill="rgba(255,215,0,0.55)" font-size="14" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">\u2655</text>`;
        s += `<text x="${dCx}" y="${baseY + 28}" text-anchor="middle" fill="rgba(255,255,255,0.16)" font-size="10" font-weight="700" letter-spacing="2" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">CLIMB THE LADDER</text>`;
        return s;
      }

      if (primaryFormat === 'single_elim' || primaryFormat === 'double_elim') {
        const n = Math.min(Math.max(players.length || 8, 4), 8);
        const rounds = Math.ceil(Math.log2(n));
        const roundW = 90, totalW = rounds * roundW, totalH = 180;
        const startX = dCx - totalW / 2, startY = dCy - totalH / 2;
        const col = '255,215,0';
        let s = '';
        for (let round = 0; round < rounds; round++) {
          const matchesInRound = Math.pow(2, rounds - round - 1);
          const spacing = totalH / matchesInRound;
          const x = startX + round * roundW;
          const isFinal = round === rounds - 1;
          for (let mi = 0; mi < matchesInRound; mi++) {
            const yy = startY + spacing / 2 + mi * spacing;
            const slotH = Math.min(spacing * 0.5, 30);
            s += `<rect x="${x}" y="${yy - slotH / 2}" width="70" height="${slotH}" rx="6" fill="rgba(${col},${isFinal ? '0.06' : '0.03'})" stroke="rgba(${col},${isFinal ? '0.3' : '0.1'})" stroke-width="1"/>`;
            if (round === 0) {
              const pi = mi * 2;
              if (players[pi]) { const init = escapeXml(String(players[pi].name || '').charAt(0).toUpperCase()); s += `<text x="${x + 12}" y="${yy - slotH / 4 + 1}" dominant-baseline="central" fill="rgba(${col},0.5)" font-size="8" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${init}</text>`; }
              if (players[pi + 1]) { const init = escapeXml(String(players[pi + 1].name || '').charAt(0).toUpperCase()); s += `<text x="${x + 12}" y="${yy + slotH / 4 + 1}" dominant-baseline="central" fill="rgba(${col},0.5)" font-size="8" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${init}</text>`; }
            }
            if (mi === 0) {
              const label = isFinal ? 'FINAL' : round === rounds - 2 ? 'SEMIS' : `R${round + 1}`;
              s += `<text x="${x + 35}" y="${startY - 8}" text-anchor="middle" fill="rgba(${col},${isFinal ? '0.5' : '0.2'})" font-size="8" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${label}</text>`;
            }
            if (round < rounds - 1) {
              const nextSpacing = totalH / Math.pow(2, rounds - round - 2);
              const nextMi = Math.floor(mi / 2);
              const nextY = startY + nextSpacing / 2 + nextMi * nextSpacing;
              s += `<line x1="${x + 70}" y1="${yy}" x2="${x + roundW}" y2="${nextY}" stroke="rgba(${col},0.08)" stroke-width="1"/>`;
            }
          }
        }
        s += `<text x="${startX + totalW + 16}" y="${dCy + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(${col},0.4)" font-size="14" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">\u2655</text>`;
        return s;
      }

      if (primaryFormat === 'pools') {
        const poolCount = Math.min(displayPhases[0]?.config?.pool_count || 4, 6);
        const perPool = Math.min(Math.ceil((players.length || 16) / poolCount), 4);
        const poolW = 56, poolH = perPool * 16 + 28, gap = 12;
        const totalW = poolCount * poolW + (poolCount - 1) * gap;
        const startX = dCx - totalW / 2, startY = dCy - poolH / 2;
        let s = '';
        for (let pi = 0; pi < poolCount; pi++) {
          const px = startX + pi * (poolW + gap);
          s += `<rect x="${px}" y="${startY}" width="${poolW}" height="${poolH}" rx="8" fill="rgba(34,211,238,0.04)" stroke="rgba(34,211,238,0.15)" stroke-width="1"/>`;
          s += `<text x="${px + poolW / 2}" y="${startY + 14}" text-anchor="middle" fill="rgba(34,211,238,0.5)" font-size="8" font-weight="700" letter-spacing="1" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">POOL ${String.fromCharCode(65 + pi)}</text>`;
          for (let i = 0; i < perPool; i++) {
            const player = players[pi * perPool + i];
            const initial = escapeXml((player?.name || `P${pi * perPool + i + 1}`).charAt(0).toUpperCase());
            const dotY = startY + 26 + i * 16;
            s += `<circle cx="${px + 14}" cy="${dotY}" r="5" fill="rgba(34,211,238,0.12)" stroke="rgba(34,211,238,0.25)" stroke-width="1"/>`;
            s += `<text x="${px + 14}" y="${dotY + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(34,211,238,0.6)" font-size="6" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${initial}</text>`;
          }
        }
        return s;
      }

      // Default: format label circle (hour_of_power, b15, etc.)
      const col = FORMAT_DOT_COLORS[primaryFormat] || '255,255,255';
      const label = escapeXml(TOURNAMENT_FORMAT_LABELS[primaryFormat] || primaryFormat);
      let s = `<circle cx="${dCx}" cy="${dCy}" r="40" fill="rgba(${col},0.06)" stroke="rgba(${col},0.15)" stroke-width="1.5"/>`;
      s += `<text x="${dCx}" y="${dCy + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(${col},0.5)" font-size="15" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${label.substring(0, 3).toUpperCase()}</text>`;
      s += `<text x="${dCx}" y="${dCy + 55}" text-anchor="middle" fill="rgba(255,255,255,0.16)" font-size="10" font-weight="700" letter-spacing="2" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${label.toUpperCase()}</text>`;
      return s;
    }

    // ── Phase dot abbreviations ──
    const FORMAT_ABBR = {
      round_robin: 'RR', pools: 'PL', single_elim: 'SE',
      double_elim: 'DE', gauntlet: 'GA', hour_of_power: 'HP', b15: 'B15',
    };
    const dotSpacing = 52;
    const dotsStartX = CX - ((displayPhases.length - 1) * dotSpacing) / 2;
    const phaseDotsSvg = displayPhases.map((p, i) => {
      const x = dotsStartX + i * dotSpacing;
      const col = FORMAT_DOT_COLORS[p.format] || '255,255,255';
      const abbr = FORMAT_ABBR[p.format] || '?';
      let s = '';
      if (i > 0) {
        s += `<line x1="${x - dotSpacing + 16}" y1="${dotsY}" x2="${x - 16}" y2="${dotsY}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
        s += `<text x="${(x + x - dotSpacing) / 2}" y="${dotsY + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(255,255,255,0.12)" font-size="9" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">\u2192</text>`;
      }
      s += `<circle cx="${x}" cy="${dotsY}" r="15" fill="rgba(${col},0.06)" stroke="rgba(${col},0.2)" stroke-width="1"/>`;
      s += `<text x="${x}" y="${dotsY + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(${col},0.6)" font-size="9" font-weight="700" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${abbr}</text>`;
      return s;
    }).join('\n');

    // Player avatar initials (for those without image)
    const playerAvatarsSvg = playerAvatars.map((_, i) => {
      const x = avatarRowStartX + i * avatarSpacing;
      if (!playerAvatars[i]) {
        const initial = escapeXml((players[i]?.name || '?').charAt(0).toUpperCase());
        return `<circle cx="${x + 18}" cy="${playerAvatarY + 18}" r="18" fill="rgba(255,51,102,0.2)" stroke="rgba(255,51,102,0.3)" stroke-width="1"/>
                <text x="${x + 18}" y="${playerAvatarY + 24}" fill="rgba(255,200,220,0.8)" font-size="12" font-weight="700" text-anchor="middle" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${initial}</text>`;
      }
      return `<circle cx="${x + 18}" cy="${playerAvatarY + 18}" r="19" fill="none" stroke="rgba(10,10,26,0.9)" stroke-width="3"/>`;
    }).join('\n');

    const moreCount = players.length > maxPlayerAvatars ? players.length - maxPlayerAvatars : 0;
    const moreLabel = moreCount > 0 ? `<text x="${avatarRowStartX + maxPlayerAvatars * avatarSpacing + 10}" y="${playerAvatarY + 24}" fill="rgba(255,255,255,0.3)" font-size="13" font-weight="600" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">+${moreCount}</text>` : '';

    // ── Build SVG ──
    const hasBg = !!bgComposite;
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${!hasBg ? `
        <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stop-color="#0a0a1a"/>
          <stop offset="100%" stop-color="#0e1028"/>
        </linearGradient>
        <radialGradient id="glow1" cx="0.3" cy="0.15" r="0.5">
          <stop offset="0%" stop-color="rgba(255,51,102,0.15)"/>
          <stop offset="100%" stop-color="rgba(255,51,102,0)"/>
        </radialGradient>
        <radialGradient id="glow2" cx="0.7" cy="0.8" r="0.4">
          <stop offset="0%" stop-color="rgba(255,199,92,0.08)"/>
          <stop offset="100%" stop-color="rgba(255,199,92,0)"/>
        </radialGradient>
        <radialGradient id="glow3" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stop-color="rgba(68,136,255,0.06)"/>
          <stop offset="100%" stop-color="rgba(68,136,255,0)"/>
        </radialGradient>
        ` : ''}
        <linearGradient id="topLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="transparent"/>
          <stop offset="50%" stop-color="rgba(255,51,102,0.5)"/>
          <stop offset="100%" stop-color="transparent"/>
        </linearGradient>
        <linearGradient id="divLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="transparent"/>
          <stop offset="50%" stop-color="rgba(255,51,102,0.25)"/>
          <stop offset="100%" stop-color="transparent"/>
        </linearGradient>
      </defs>

      ${!hasBg ? `
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#glow1)"/>
      <rect width="${W}" height="${H}" fill="url(#glow2)"/>
      <rect width="${W}" height="${H}" fill="url(#glow3)"/>
      ` : ''}

      <!-- Top accent line -->
      <rect x="0" y="0" width="${W}" height="2" fill="url(#topLine)"/>

      <!-- Avatar border ring (centered) -->
      ${avatarComposite ? `<rect x="${CX - avatarSize / 2 - 2}" y="${avatarTop - 2}" width="${avatarSize + 4}" height="${avatarSize + 4}" rx="20" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>` : ''}

      <!-- Date/location (centered) -->
      ${dateLoc ? `<text x="${CX}" y="${dateLocY}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="15" font-weight="600" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${dateLoc}</text>` : ''}

      <!-- Title (centered) -->
      <text x="${CX}" y="${titleY}" text-anchor="middle" fill="#ffffff" font-size="46" font-weight="800" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${title}</text>

      <!-- Subtitle (centered) -->
      <text x="${CX}" y="${subtitleY}" text-anchor="middle" fill="rgba(255,255,255,0.42)" font-size="18" font-weight="600" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">${players.length} players  \u00B7  ${escapeXml(phaseFlow)}</text>

      <!-- Phase dots (centered) -->
      ${phaseDotsSvg}

      <!-- Divider -->
      <line x1="${W * 0.3}" y1="${divY}" x2="${W * 0.7}" y2="${divY}" stroke="url(#divLine)" stroke-width="1"/>

      <!-- Format diagram -->
      ${renderDiagramSvg()}

      <!-- Player avatars (centered) -->
      ${playerAvatarsSvg}
      ${moreLabel}

      <!-- Branding -->
      <text x="${W - 50}" y="${H - 18}" text-anchor="end" fill="rgba(255,255,255,0.16)" font-size="12" font-weight="700" letter-spacing="1.5" font-family="ui-sans-serif,system-ui,-apple-system,sans-serif">PUMP SHINSA</text>
    </svg>`;

    // ── Compose layers ──
    const composites = [];

    if (bgComposite) {
      composites.push({ input: bgComposite, top: 0, left: 0 });
      // Hero-style gradient overlay (light at top, dark at bottom — matches poster hero)
      const gradientOverlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgb(10,10,26)" stop-opacity="0.45"/>
            <stop offset="55%" stop-color="rgb(10,10,26)" stop-opacity="0.72"/>
            <stop offset="100%" stop-color="rgb(10,10,26)" stop-opacity="0.95"/>
          </linearGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#heroGrad)"/>
      </svg>`);
      composites.push({ input: gradientOverlay, top: 0, left: 0 });
      composites.push({ input: Buffer.from(svg), top: 0, left: 0 });
    }

    // Tournament avatar (centered)
    if (avatarComposite) {
      composites.push({ input: avatarComposite, top: avatarTop, left: Math.round(CX - avatarSize / 2) });
    }

    // Player avatar circles (centered row)
    for (let i = 0; i < playerAvatars.length; i++) {
      if (playerAvatars[i]) {
        composites.push({ input: playerAvatars[i], top: playerAvatarY, left: Math.round(avatarRowStartX + i * avatarSpacing) });
      }
    }

    // Wordmark
    const wordmark = await ensureWordmarkBuffer(clientBuildDir);
    if (wordmark) {
      composites.push({ input: wordmark, top: H - 48, left: 50 });
    }

    const base = bgComposite
      ? sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      : sharp(Buffer.from(svg));

    return base
      .composite(composites)
      .jpeg({ quality: 88 })
      .toBuffer();
  }

  // OG image endpoint for tournament posters
  app.get('/og/tournament/:id.jpg', async (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).send('Invalid tournament id');

    const db = getDb();
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
    if (!tournament) { db.close(); return res.status(404).send('Not found'); }

    try { tournament.config = JSON.parse(tournament.config || '{}'); } catch { tournament.config = {}; }

    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ? ORDER BY pumbility DESC, seed_rank ASC').all(id);
    let phases = [];
    try { phases = db.prepare('SELECT * FROM tournament_phases WHERE tournament_id = ? ORDER BY phase_order ASC').all(id); } catch {}
    db.close();

    const etag = `W/"tournament-og-${id}-${SHARE_PREVIEW_RENDER_VERSION}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const jpeg = await renderTournamentOgJpeg({ tournament, players, phases, clientBuildDir, origin });
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=1800');
      res.set('ETag', etag);
      return res.send(jpeg);
    } catch (err) {
      console.error('Tournament OG image render failed:', err.message);
      return res.status(500).send('Error');
    }
  });

  // Inject OG meta for tournament poster pages
  app.get('/tournament/:id/poster', (req, res, next) => {
    const id = req.params.id;
    if (!id) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
    if (!tournament) { db.close(); res.set('Content-Type', 'text/html'); return res.send(indexHtml); }

    try { tournament.config = JSON.parse(tournament.config || '{}'); } catch { tournament.config = {}; }

    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ? ORDER BY pumbility DESC, seed_rank ASC').all(id);
    let phases = [];
    try { phases = db.prepare('SELECT * FROM tournament_phases WHERE tournament_id = ? ORDER BY phase_order ASC').all(id); } catch {}
    db.close();

    const origin = getRequestOrigin(req);
    const url = `${origin}/tournament/${id}/poster`;
    const image = buildPreviewImageUrl(origin, `/og/tournament/${id}.jpg`, SHARE_PREVIEW_RENDER_VERSION);
    const title = `${String(tournament.name || 'Tournament').trim()} \u2014 Pump Shinsa`;
    const date = formatTournamentDateServer(tournament.date);
    const location = String(tournament.location || '').trim();
    const displayPhases = phases.length > 0 ? phases : [{ format: tournament.config?.gauntlet_enabled ? 'gauntlet' : 'round_robin' }];
    const phaseFlow = displayPhases.map(p => TOURNAMENT_FORMAT_LABELS[p.format] || p.format).join(' \u2192 ');

    const descParts = [];
    descParts.push(`${players.length} players`);
    descParts.push(phaseFlow);
    if (date) descParts.push(date);
    if (location) descParts.push(location);
    const description = descParts.join(' \u00B7 ');

    const html = injectSocialMeta(indexHtml, {
      type: 'website',
      siteName: 'Pump Shinsa',
      title,
      description,
      url,
      image,
      imageType: 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: `${tournament.name} tournament poster`,
      twitterCard: 'summary_large_image',
    });

    res.set('Content-Type', 'text/html');
    return res.send(html);
  });

  // Also inject OG meta for main tournament page
  app.get('/tournament/:id', (req, res, next) => {
    const id = req.params.id;
    if (!id) return next();

    const indexHtml = getIndexHtml(req);
    if (!indexHtml) return next();

    const db = getDb();
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
    if (!tournament) { db.close(); res.set('Content-Type', 'text/html'); return res.send(indexHtml); }

    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(id);
    db.close();

    const origin = getRequestOrigin(req);
    const url = `${origin}/tournament/${id}`;
    const image = buildPreviewImageUrl(origin, `/og/tournament/${id}.jpg`, SHARE_PREVIEW_RENDER_VERSION);
    const title = `${String(tournament.name || 'Tournament').trim()} \u2014 Pump Shinsa`;
    const description = `${players.length} player tournament on Pump Shinsa`;

    const html = injectSocialMeta(indexHtml, {
      type: 'website',
      siteName: 'Pump Shinsa',
      title,
      description,
      url,
      image,
      imageType: 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: `${tournament.name} tournament`,
      twitterCard: 'summary_large_image',
    });

    res.set('Content-Type', 'text/html');
    return res.send(html);
  });
}

module.exports = { registerSharePreviewRoutes };

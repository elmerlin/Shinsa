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
const SHARE_PREVIEW_RENDER_VERSION = '20260405a';
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

async function renderPlayOgJpeg({
  play,
  brandAssets = null,
  artworkBuffer = null,
  width = 1200,
  height = 630,
}) {
  const username = brandAssets?.usernameLabel || (play?.username ? `@${play.username}` : '@player');
  const songTitle = String(play?.song_title || 'Unknown chart').trim() || 'Unknown chart';
  const titleLines = wrapTextByChars(songTitle, 24, 2).lines;
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
  const pillItems = [
    skillTitle ? { text: skillTitle, fill: 'rgba(34,211,238,0.12)', stroke: 'rgba(103,232,249,0.34)', color: '#d9f9ff' } : null,
    overRank > 0 ? { text: `TOP #${overRank}`, fill: 'rgba(250,204,21,0.12)', stroke: 'rgba(250,204,21,0.36)', color: '#fef08a' } : null,
    badgeText ? { text: badgeText, fill: modeAccent.fill, stroke: modeAccent.border, color: '#ffffff' } : null,
  ].filter(Boolean);

  const cardX = 68;
  const cardY = 102;
  const cardW = width - 136;
  const cardH = 468;
  const levelSize = 112;
  const levelX = cardX + cardW - levelSize - 36;
  const levelY = cardY + 42;
  const playerAvatarSize = 42;
  const playerAvatarX = cardX + 40;
  const playerAvatarY = cardY + 132;

  let cardArtworkOverlay = null;
  if (artworkBuffer?.length) {
    cardArtworkOverlay = {
      input: await sharp(artworkBuffer)
        .rotate()
        .resize(cardW, cardH, { fit: 'cover' })
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
        <stop offset="100%" stop-color="rgba(255,87,164,0.12)"/>
      </linearGradient>
      <linearGradient id="cardShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(4,8,16,0.12)"/>
        <stop offset="0.48" stop-color="rgba(5,9,18,0.36)"/>
        <stop offset="1" stop-color="rgba(5,9,18,0.90)"/>
      </linearGradient>
      <linearGradient id="innerGlow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(125,211,252,0.20)"/>
        <stop offset="55%" stop-color="rgba(125,211,252,0.0)"/>
        <stop offset="100%" stop-color="rgba(236,72,153,0.10)"/>
      </linearGradient>
      <linearGradient id="levelGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${escapeXml(modeAccent.from)}"/>
        <stop offset="100%" stop-color="${escapeXml(modeAccent.to)}"/>
      </linearGradient>
      <radialGradient id="pageGlow" cx="18%" cy="12%" r="80%">
        <stop offset="0%" stop-color="rgba(56,189,248,0.18)"/>
        <stop offset="100%" stop-color="rgba(56,189,248,0)"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#pageBg)" />
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#pageGlow)" />
    <rect x="0" y="0" width="${width}" height="88" fill="url(#topBar)" />
    <text x="66" y="70" fill="rgba(186,230,253,0.86)" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" letter-spacing="4">RUN DETAILS</text>
    <text x="${width - 148}" y="60" fill="rgba(255,255,255,0.76)" font-size="22" text-anchor="end" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(username)}</text>

    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="rgba(5,10,20,0.48)" stroke="rgba(172,196,255,0.18)" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="url(#cardShade)" />
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="30" fill="url(#innerGlow)" />

    ${titleSvg}

    <rect x="${levelX}" y="${levelY}" width="${levelSize}" height="${levelSize}" rx="${Math.round(levelSize / 2)}" fill="url(#levelGrad)" stroke="rgba(255,255,255,0.40)" stroke-width="3" />
    <circle cx="${levelX + Math.round(levelSize / 2)}" cy="${levelY + Math.round(levelSize / 2)}" r="${Math.round(levelSize / 2) - 12}" fill="rgba(8,14,24,0.34)" />
    <text x="${levelX + Math.round(levelSize / 2)}" y="${levelY + 34}" text-anchor="middle" fill="rgba(222,234,247,0.86)" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">LEVEL</text>
    <text x="${levelX + Math.round(levelSize / 2)}" y="${levelY + 76}" text-anchor="middle" fill="#ffffff" font-size="42" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(String(parseInt(play?.level, 10) || '?'))}</text>

    ${playerAvatarOverlay ? `<circle cx="${playerAvatarX + Math.round(playerAvatarSize / 2)}" cy="${playerAvatarY + Math.round(playerAvatarSize / 2)}" r="${Math.round(playerAvatarSize / 2) + 2}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2" />` : ''}
    <text x="${cardX + 40 + (playerAvatarOverlay ? 58 : 0)}" y="${cardY + 148}" fill="#ffffff" font-size="20" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(String(play?.username || 'Player'))}</text>
    <text x="${cardX + 40 + (playerAvatarOverlay ? 58 : 0)}" y="${cardY + 172}" fill="rgba(214,224,240,0.82)" font-size="15" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml([playedAtLabel, chartLine].filter(Boolean).join(' • ') || 'Recent score on Pump Shinsa')}</text>

    ${pillsSvg}

    <text x="${cardX + 40}" y="${cardY + 326}" fill="${play?.is_stage_break ? '#fda4af' : '#ffffff'}" font-size="${play?.is_stage_break ? 46 : 62}" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(play?.is_stage_break ? 'STAGE BREAK' : scoreText)}</text>
    ${plateName ? `<text x="${cardX + 40}" y="${cardY + 358}" fill="rgba(250,226,150,0.92)" font-size="16" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" letter-spacing="1.5">${escapeXml(plateName)}</text>` : ''}

    <text x="${cardX + cardW - 40}" y="${cardY + 314}" text-anchor="end" fill="${escapeXml(gradeAccent)}" font-size="70" font-weight="900" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(gradeText)}</text>
    ${badgeText ? `<text x="${cardX + cardW - 40}" y="${cardY + 344}" text-anchor="end" fill="rgba(214,224,240,0.80)" font-size="18" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(String(play?.mode || '').trim())} chart</text>` : ''}

    <rect x="${cardX + 20}" y="${judgmentPanelY}" width="${cardW - 40}" height="76" rx="22" fill="rgba(3,7,15,0.52)" stroke="rgba(255,255,255,0.10)" />
    ${judgmentsSvg}
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
  accentTo = '#ff3366',
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

function registerSharePreviewRoutes(app, { clientBuildDir }) {
  const indexHtmlPath = path.join(clientBuildDir, 'index.html');
  let cachedIndexHtml = null;

  function getIndexHtml() {
    if (cachedIndexHtml != null) return cachedIndexHtml;
    try {
      cachedIndexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      return cachedIndexHtml;
    } catch (err) {
      console.error('Share preview: failed to read index.html:', err.message);
      cachedIndexHtml = null;
      return null;
    }
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

    const indexHtml = getIndexHtml();
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

    const indexHtml = getIndexHtml();
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

    const indexHtml = getIndexHtml();
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

    const versionRaw = String(play.played_at_utc || play.date_played || play.id || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"play-og-${playId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const origin = getRequestOrigin(req);
      const artworkBuffer = await loadPreviewArtworkBuffer({
        clientBuildDir,
        origin,
        jacketUrl: resolveUpscoreItemJacketUrl(db, play),
        backgroundUrl: play.background_url,
      });
      const brandAssets = await buildBrandAssets({
        clientBuildDir,
        origin,
        username: play.username,
        avatar: play.avatar,
        userId: play.user_id,
        avatarVersion: play.avatar_v,
      });
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

  app.get('/play/:id', (req, res, next) => {
    const playId = parseInt(req.params.id, 10);
    if (Number.isNaN(playId)) return next();

    const indexHtml = getIndexHtml();
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

    const indexHtml = getIndexHtml();
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
}

module.exports = { registerSharePreviewRoutes };

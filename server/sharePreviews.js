const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { getDb } = require('./db/schema');

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

async function renderPostOgJpeg({ post, width = 1200, height = 630 }) {
  const brand = 'PUMP SHINSA';
  const username = post.username ? `@${post.username}` : 'Someone';
  const snippet = textSnippet(post.content || '', 160) || `New post from ${username}`;

  let base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 10, g: 10, b: 26, alpha: 1 },
    },
  });

  // Use the first post image as the background when available.
  try {
    const imgs = JSON.parse(post.images || '[]');
    const first = Array.isArray(imgs) ? imgs[0] : null;
    const decoded = first ? decodeDataUrl(first) : null;
    if (decoded?.buffer?.length) {
      const bg = await sharp(decoded.buffer)
        .rotate()
        .resize(width, height, { fit: 'cover' })
        .modulate({ brightness: 0.92, saturation: 1.04 })
        .toBuffer();
      base = sharp(bg);
    }
  } catch {
    // ignore
  }

  const { lines } = wrapTextByChars(snippet, 34, 4);
  const fontSize = lines.length <= 2 ? 64 : lines.length === 3 ? 54 : 46;
  const lineHeight = Math.round(fontSize * 1.12);
  const startY = 240 - Math.floor((lines.length - 1) * lineHeight * 0.35);

  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="65%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.88"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ff3366"/>
        <stop offset="55%" stop-color="#3aaaff"/>
        <stop offset="100%" stop-color="#ffd166"/>
      </linearGradient>
    </defs>

    <rect x="0" y="0" width="${width}" height="${height}" fill="#000" opacity="0.16"/>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bottomShade)"/>

    <rect x="64" y="64" width="6" height="78" rx="3" fill="url(#accent)"/>
    <text x="86" y="98" fill="rgba(255,255,255,0.88)" font-size="28" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
      ${escapeXml(brand)}
    </text>
    <text x="86" y="132" fill="rgba(255,255,255,0.70)" font-size="20" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
      ${escapeXml(username)}
    </text>

    ${lines
      .map((ln, i) => {
        const y = startY + i * lineHeight;
        return `<text x="64" y="${y}" fill="white" font-size="${fontSize}" font-weight="800" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(ln)}</text>`;
      })
      .join('\n')}

    <text x="64" y="${height - 70}" fill="rgba(255,255,255,0.70)" font-size="22" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">
      View post on Pump Shinsa
    </text>
  </svg>
  `;

  return base
    .composite([{ input: Buffer.from(textSvg) }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
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
        ? `${username} unlocked ${source.length} titles`
        : `${username} unlocked ${firstTitle}`,
      description: multi
        ? `${username} unlocked ${source.length} new titles on Pump Shinsa.`
        : `${username} unlocked ${firstTitle} on Pump Shinsa.`,
      headline: multi ? `${source.length} New Titles` : firstTitle,
      subline: 'Title unlock update',
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

async function renderActivityOgJpeg({
  username = '@player',
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
        <stop offset="0%" stop-color="#090f1f"/>
        <stop offset="100%" stop-color="#0f1630"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${escapeXml(accentFrom)}"/>
        <stop offset="100%" stop-color="${escapeXml(accentTo)}"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)" />
    <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(0,0,0,0.20)" />
    <rect x="64" y="64" width="8" height="86" rx="4" fill="url(#accent)" />

    <text x="86" y="98" fill="rgba(255,255,255,0.9)" font-size="30" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">PUMP SHINSA</text>
    <text x="86" y="134" fill="rgba(255,255,255,0.72)" font-size="22" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${escapeXml(username)}</text>

    ${titleLines.map((line, idx) => {
      const y = titleStartY + idx * Math.round(titleSize * 1.1);
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
    .composite([{ input: Buffer.from(textSvg) }])
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
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:title" content="${escapeXml(title)}" />
    <meta property="twitter:description" content="${escapeXml(description)}" />
    <meta property="twitter:image" content="${escapeXml(imageUrl)}" />
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
      SELECT p.id, p.content, p.images, p.created_at, p.updated_at, u.username
      FROM user_posts p JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(postId);
    if (!post) return res.status(404).send('Not found');

    const versionRaw = String(post.updated_at || post.created_at || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"post-og-${postId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const jpeg = await renderPostOgJpeg({ post, width: 1200, height: 630 });
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
      SELECT p.id, p.content, p.images, p.created_at, p.updated_at, u.username
      FROM user_posts p JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(postId);

    // Still serve the SPA for invalid IDs; it can display "not found".
    if (!post) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const version = encodeURIComponent(String(post.updated_at || post.created_at || ''));
    const url = `${origin}/post/${postId}`;
    const image = `${origin}/og/post/${postId}.jpg${version ? `?v=${version}` : ''}`;

    const title = post.username ? `@${post.username} on Pump Shinsa` : 'Pump Shinsa Post';
    const description = textSnippet(post.content || '', 180) || (post.username ? `View @${post.username}'s post on Pump Shinsa.` : 'View this post on Pump Shinsa.');

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
      SELECT us.id, us.upscores_json, us.created_at, u.username
      FROM user_upscores us JOIN users u ON us.user_id = u.id
      WHERE us.id = ?
    `).get(upscoreId);
    if (!upscore) return res.status(404).send('Not found');

    const versionRaw = String(upscore.created_at || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"upscore-og-${upscoreId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const summary = summarizeUpscore(upscore);
      const jpeg = await renderActivityOgJpeg({
        username: upscore.username ? `@${upscore.username}` : '@player',
        headline: summary.headline,
        subline: summary.subline,
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
      SELECT us.id, us.upscores_json, us.created_at, u.username
      FROM user_upscores us JOIN users u ON us.user_id = u.id
      WHERE us.id = ?
    `).get(upscoreId);
    if (!upscore) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const version = encodeURIComponent(String(upscore.created_at || ''));
    const url = `${origin}/upscore/${upscoreId}`;
    const image = `${origin}/og/upscore/${upscoreId}.jpg${version ? `?v=${version}` : ''}`;
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
      SELECT nc.id, nc.song_title, nc.mode, nc.level, nc.grade, nc.clears_json, nc.created_at, u.username
      FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
      WHERE nc.id = ?
    `).get(clearId);
    if (!clear) return res.status(404).send('Not found');

    const versionRaw = String(clear.created_at || '');
    const version = versionRaw.replace(/[^A-Za-z0-9_.-]/g, '_');
    const etag = `W/"clear-og-${clearId}-${version}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const summary = summarizeClear(clear);
      const jpeg = await renderActivityOgJpeg({
        username: clear.username ? `@${clear.username}` : '@player',
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
      SELECT nc.id, nc.song_title, nc.mode, nc.level, nc.grade, nc.clears_json, nc.created_at, u.username
      FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
      WHERE nc.id = ?
    `).get(clearId);
    if (!clear) {
      res.set('Content-Type', 'text/html');
      return res.send(indexHtml);
    }

    const origin = getRequestOrigin(req);
    const version = encodeURIComponent(String(clear.created_at || ''));
    const url = `${origin}/clear/${clearId}`;
    const image = `${origin}/og/clear/${clearId}.jpg${version ? `?v=${version}` : ''}`;
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

  app.get('/og/widget/:username/:type.jpg', async (req, res) => {
    const type = String(req.params.type || '').toLowerCase();
    if (!['stats', 'recent-scores', 'recent-clears', 'posts'].includes(type)) {
      return res.status(404).send('Not found');
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username, pumbility FROM users WHERE lower(username) = lower(?)').get(req.params.username);
    if (!user) return res.status(404).send('Not found');

    let headline = `${user.username} Widget`;
    let subline = 'Pump Shinsa';
    let versionSeed = '';

    if (type === 'stats') {
      const followers = db.prepare('SELECT COUNT(*) as c FROM user_follows WHERE following_id = ?').get(user.id).c || 0;
      const posts = db.prepare('SELECT COUNT(*) as c FROM user_posts WHERE user_id = ?').get(user.id).c || 0;
      const upscores = db.prepare('SELECT COUNT(*) as c FROM user_upscores WHERE user_id = ?').get(user.id).c || 0;
      const clears = db.prepare('SELECT COUNT(*) as c FROM user_new_clears WHERE user_id = ?').get(user.id).c || 0;
      headline = `${user.username} Stats Card`;
      subline = `PB ${user.pumbility || 0} • ${followers} followers • ${posts} posts • ${upscores} upscores • ${clears} clears`;
      versionSeed = `${followers}-${posts}-${upscores}-${clears}-${user.pumbility || 0}`;
    } else if (type === 'recent-scores') {
      const rows = db.prepare(`
        SELECT song_title, mode, level, score, date_played
        FROM user_recently_played
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 5
      `).all(user.id);
      const first = rows[0];
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
        LIMIT 5
      `).all(user.id);
      const first = rows[0];
      const summary = first ? summarizeClear({ ...first, username: user.username }) : null;
      headline = `${user.username} Recent Clears`;
      subline = summary ? summary.subline : 'No recent clears available';
      versionSeed = String(first?.created_at || '0');
    } else {
      const rows = db.prepare(`
        SELECT content, created_at
        FROM user_posts
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 5
      `).all(user.id);
      const first = rows[0];
      headline = `${user.username} Recent Posts`;
      subline = first ? textSnippet(first.content || '', 120) || 'Latest post update' : 'No posts yet';
      versionSeed = String(first?.created_at || '0');
    }

    const etag = `W/"widget-og-${user.id}-${type}-${String(versionSeed).replace(/[^A-Za-z0-9_.-]/g, '_')}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const jpeg = await renderActivityOgJpeg({
        username: `@${user.username}`,
        headline,
        subline,
        accentFrom: '#ff3366',
        accentTo: '#3aaaff',
      });
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
    const user = db.prepare('SELECT id, username, pumbility, skill_title FROM users WHERE lower(username) = lower(?)').get(req.params.username);
    if (!user) return res.status(404).send('User not found');

    const origin = getRequestOrigin(req);
    const canonicalUrl = `${origin}/widget/${encodeURIComponent(user.username)}/${type}`;
    const imageUrl = `${origin}/og/widget/${encodeURIComponent(user.username)}/${type}.jpg`;
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
        SELECT content, created_at
        FROM user_posts
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 6
      `).all(user.id);
      title = `${user.username} Recent Posts`;
      description = `Recent posts from @${user.username} on Pump Shinsa.`;
      bodyHtml = rows.length === 0
        ? '<p class="muted">No recent posts available.</p>'
        : rows.map((row) => `
            <div class="row">
              <div>
                <div>${escapeXml(textSnippet(row.content || '', 160) || '(No text content)')}</div>
                <div class="muted">${escapeXml(String(row.created_at || ''))}</div>
              </div>
            </div>
          `).join('');
    }

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
}

module.exports = { registerSharePreviewRoutes };

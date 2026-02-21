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
}

module.exports = { registerSharePreviewRoutes };

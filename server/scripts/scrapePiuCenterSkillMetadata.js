#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SOURCE_BASE = 'https://www.piucenter.com';
const SOURCE_SKILL_INDEX = `${SOURCE_BASE}/skill`;

function parseArgs(argv) {
  const opts = {
    headless: true,
    timeoutMs: 30000,
    outPath: path.join(__dirname, '..', 'data', 'piucenter-skill-metadata.json'),
    skillFilters: [],
  };

  for (const arg of argv) {
    if (arg === '--headed') {
      opts.headless = false;
    } else if (arg.startsWith('--timeout-ms=')) {
      const parsed = parseInt(arg.slice('--timeout-ms='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) opts.timeoutMs = parsed;
    } else if (arg.startsWith('--out=')) {
      opts.outPath = path.resolve(arg.slice('--out='.length));
    } else if (arg.startsWith('--skill=')) {
      const slug = normalizeSkillSlug(arg.slice('--skill='.length));
      if (slug) opts.skillFilters.push(slug);
    }
  }

  opts.skillFilters = Array.from(new Set(opts.skillFilters));
  return opts;
}

function normalizeSkillSlug(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const fromPath = raw.includes('/skill/')
    ? raw.slice(raw.lastIndexOf('/skill/') + '/skill/'.length)
    : raw;
  return fromPath
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .trim();
}

function normalizeSkillName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (raw.startsWith('blob:')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${SOURCE_BASE}${raw}`;
  return `${SOURCE_BASE}/${raw.replace(/^\/+/, '')}`;
}

function normalizeTextSegment(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadSkillListFromExistingData() {
  const sourcePath = path.join(__dirname, '..', 'data', 'piucenter-skills.json');
  if (!fs.existsSync(sourcePath)) return [];

  try {
    const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    const skills = Array.isArray(payload?.source?.skills) ? payload.source.skills : [];
    const seen = new Set();
    const list = [];
    for (const row of skills) {
      const slug = normalizeSkillSlug(row?.slug || row?.url || '');
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      list.push({
        slug,
        name: normalizeSkillName(row?.name || slug.replace(/[_-]/g, ' ')),
        url: `${SOURCE_BASE}/skill/${slug}`,
      });
    }
    return list;
  } catch {
    return [];
  }
}

async function scrapeSkillList(page) {
  await page.goto(SOURCE_SKILL_INDEX, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(1000);
  const rows = await page.$$eval('a[href^="/skill/"]', (els) => {
    return els.map((el) => ({
      href: String(el.getAttribute('href') || '').trim(),
      name: String(el.textContent || '').replace(/\s+/g, ' ').trim(),
    })).filter((row) => row.href && row.href !== '/skill');
  });

  const seen = new Set();
  const skills = [];
  for (const row of rows) {
    const slug = normalizeSkillSlug(row.href);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    skills.push({
      slug,
      name: normalizeSkillName(row.name) || slug.replace(/[_-]/g, ' '),
      url: `${SOURCE_BASE}/skill/${slug}`,
    });
  }
  return skills;
}

function coalesceTextSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    if (!segment) continue;
    if (segment.type === 'text') {
      const text = normalizeTextSegment(segment.text);
      if (!text) continue;
      const prev = merged[merged.length - 1];
      if (prev && prev.type === 'text') {
        prev.text = normalizeTextSegment(`${prev.text} ${text}`);
      } else {
        merged.push({ type: 'text', text });
      }
      continue;
    }
    if (segment.type === 'image') {
      const url = toAbsoluteUrl(segment.url);
      if (!url) continue;
      merged.push({
        type: 'image',
        url,
        alt: normalizeTextSegment(segment.alt),
      });
    }
  }
  return merged;
}

async function scrapeSkillMetadata(page, skill, timeoutMs) {
  await page.goto(skill.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.markdown-content', { timeout: timeoutMs }).catch(() => null);

  const raw = await page.evaluate(() => {
    const extractBgImageUrl = (value) => {
      const rawValue = String(value || '').trim();
      if (!rawValue || rawValue === 'none') return '';
      const match = rawValue.match(/url\((['"]?)(.*?)\1\)/i);
      return match ? String(match[2] || '').trim() : '';
    };

    const root = document.querySelector('.markdown-content');
    if (!root) {
      return {
        description_text: '',
        description_segments: [],
      };
    }

    const paragraphs = Array.from(root.querySelectorAll('p'));
    const segments = [];

    for (const paragraph of paragraphs) {
      const paragraphSegments = [];
      for (const node of Array.from(paragraph.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          paragraphSegments.push({
            type: 'text',
            text: String(node.textContent || ''),
          });
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node;
        if (el.tagName === 'IMG') {
          paragraphSegments.push({
            type: 'image',
            url: String(el.getAttribute('src') || ''),
            alt: String(el.getAttribute('alt') || ''),
          });
          continue;
        }

        const iconClass = Array.from(el.classList || []).find((className) => String(className || '').startsWith('icon-'));
        if (iconClass) {
          const bgImageUrl = extractBgImageUrl(getComputedStyle(el).backgroundImage);
          if (bgImageUrl) {
            paragraphSegments.push({
              type: 'image',
              url: bgImageUrl,
              alt: iconClass,
            });
            continue;
          }
        }

        paragraphSegments.push({
          type: 'text',
          text: String(el.textContent || ''),
        });
      }

      if (paragraphSegments.length > 0) {
        if (segments.length > 0) {
          segments.push({ type: 'text', text: '\n\n' });
        }
        segments.push(...paragraphSegments);
      }
    }

    const descriptionText = paragraphs
      .map((paragraph) => String(paragraph.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');

    return {
      description_text: descriptionText,
      description_segments: segments,
    };
  });

  const normalizedSegments = coalesceTextSegments(raw.description_segments || []);
  const patternImages = [];
  const seenImageUrls = new Set();
  for (const segment of normalizedSegments) {
    if (segment.type !== 'image') continue;
    if (seenImageUrls.has(segment.url)) continue;
    seenImageUrls.add(segment.url);
    patternImages.push(segment.url);
  }

  return {
    slug: skill.slug,
    name: skill.name,
    url: skill.url,
    description_text: normalizeTextSegment(raw.description_text || ''),
    description_segments: normalizedSegments,
    pattern_images: patternImages,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let skills = loadSkillListFromExistingData();
  const browser = await chromium.launch({ headless: opts.headless });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } });

  if (skills.length === 0) {
    skills = await scrapeSkillList(page);
  }

  if (opts.skillFilters.length > 0) {
    skills = skills.filter((skill) => opts.skillFilters.includes(skill.slug));
  }

  if (skills.length === 0) {
    await browser.close();
    throw new Error('No skills to scrape');
  }

  const results = [];
  for (const skill of skills) {
    const metadata = await scrapeSkillMetadata(page, skill, opts.timeoutMs);
    results.push(metadata);
    console.log(
      `[${skill.slug}] description_chars=${metadata.description_text.length} images=${metadata.pattern_images.length}`
    );
  }

  await browser.close();

  const payload = {
    generated_at: new Date().toISOString(),
    source: {
      site: SOURCE_SKILL_INDEX,
      skill_count: results.length,
    },
    skills: results,
  };

  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  fs.writeFileSync(opts.outPath, JSON.stringify(payload, null, 2));
  console.log(`Saved ${results.length} skill metadata rows to ${opts.outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { initializeDb, getDb } = require('../db/schema');

const SOURCE_BASE = 'https://www.piucenter.com';

const MANUAL_TITLE_ALIASES = {
  theoremofxxx: 'theorem',
  doppelgangerc: 'doppelganger',
  finalauditionep21: 'finalauditionep2-1',
  finalauditionep22: 'finalauditionep2-2',
  xeroize: 'xeroize',
  dangerdanger: 'danger & danger',
  bullfightingssong: "bullfighter's song",
  loveisadangerzone2trytobpmremix: 'love is a danger zone (try to b.p.m.)',
};

function parseArgs(argv) {
  const opts = {
    headless: true,
    timeoutMs: 30000,
    outPath: path.join(__dirname, '..', 'data', 'piucenter-skills.json'),
    saveRaw: false,
    dryRun: false,
    skillFilters: [],
    includeSearch: true,
    includeSkillPages: true,
  };

  for (const arg of argv) {
    if (arg === '--headed') {
      opts.headless = false;
    } else if (arg.startsWith('--timeout-ms=')) {
      const parsed = parseInt(arg.slice('--timeout-ms='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) opts.timeoutMs = parsed;
    } else if (arg.startsWith('--out=')) {
      opts.outPath = path.resolve(arg.slice('--out='.length));
    } else if (arg === '--save-raw') {
      opts.saveRaw = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--skip-search') {
      opts.includeSearch = false;
    } else if (arg === '--skip-skill-pages') {
      opts.includeSkillPages = false;
    } else if (arg === '--search-only') {
      opts.includeSearch = true;
      opts.includeSkillPages = false;
    } else if (arg.startsWith('--skill=')) {
      const slug = normalizeSkillSlug(arg.slice('--skill='.length));
      if (slug) opts.skillFilters.push(slug);
    }
  }

  opts.skillFilters = Array.from(new Set(opts.skillFilters));
  return opts;
}

function normalizeSongName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeMode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'single' || raw === 's') return 'Single';
  if (raw === 'double' || raw === 'd') return 'Double';
  if (raw === 'coop' || raw === 'co-op' || raw === 'co op' || raw === 'c') return 'CoOp';
  return '';
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

function humanizeSkillSlug(slug) {
  return String(slug || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[(){}\[\]'"`~:;,.!?]/g, ' ')
    .replace(/[+/_-]+/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function loadSongAliases() {
  const aliasesPath = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');
  if (!fs.existsSync(aliasesPath)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'));
    const rawAliases = (data && typeof data.aliases === 'object' && data.aliases) || {};
    const normalized = {};
    for (const [alias, canonical] of Object.entries(rawAliases)) {
      const aliasNorm = normalizeSongName(alias);
      const canonicalNorm = normalizeSongName(canonical);
      if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
      if (!normalized[aliasNorm]) normalized[aliasNorm] = canonicalNorm;
    }
    return normalized;
  } catch {
    return {};
  }
}

function toCanonicalTitle(title, aliases) {
  let normalized = normalizeSongName(title);
  if (!normalized) return '';
  const seen = new Set();
  while (aliases[normalized] && !seen.has(normalized)) {
    seen.add(normalized);
    normalized = aliases[normalized];
  }
  return normalized;
}

function makeChartKey(title, mode, level, aliases) {
  const canonicalTitle = toCanonicalTitle(title, aliases);
  const normalizedMode = normalizeMode(mode);
  const lv = parseInt(level, 10) || 0;
  if (!canonicalTitle || !normalizedMode || !lv) return '';
  return `${canonicalTitle}|${normalizedMode}|${lv}`;
}

function parseChartRefFromHref(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;

  let pathname = raw;
  try {
    pathname = raw.startsWith('http')
      ? new URL(raw).pathname
      : raw;
  } catch {
    pathname = raw;
  }

  const marker = '/chart/';
  const idx = pathname.indexOf(marker);
  if (idx < 0) return null;

  const slug = pathname.slice(idx + marker.length).replace(/\/+$/, '');
  if (!slug) return null;

  const parts = slug.split('_');
  let diffToken = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = String(parts[i] || '').trim().toUpperCase();
    if (/^[SDC]\d+$/.test(candidate)) {
      diffToken = candidate;
      break;
    }
  }
  if (!diffToken) return null;

  const modeLetter = diffToken[0];
  const level = parseInt(diffToken.slice(1), 10) || 0;
  const mode = modeLetter === 'S'
    ? 'Single'
    : modeLetter === 'D'
      ? 'Double'
      : modeLetter === 'C'
        ? 'CoOp'
        : '';

  if (!mode || level <= 0) return null;
  return { mode, level, slug };
}

function extractTitleFromChartSlug(chartSlug) {
  const raw = String(chartSlug || '')
    .trim()
    .replace(/^\/?chart\//i, '')
    .replace(/\/+$/, '');
  if (!raw) return '';

  const parts = raw.split('_');
  let diffIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^[SDC]\d+$/i.test(String(parts[i] || '').trim())) {
      diffIdx = i;
      break;
    }
  }
  if (diffIdx <= 0) return '';

  const beforeDiff = parts.slice(0, diffIdx).join('_');
  if (!beforeDiff) return '';

  const artistSeparatorIdx = beforeDiff.lastIndexOf('_-_');
  const titlePart = artistSeparatorIdx >= 0
    ? beforeDiff.slice(0, artistSeparatorIdx)
    : beforeDiff;

  return titlePart.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripDifficultyFromChartLabel(label, mode, level) {
  const raw = String(label || '').replace(/\s+/g, ' ').trim();
  if (!raw || !mode || !level) return raw;
  const prefix = mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : mode === 'CoOp' ? 'C' : '';
  if (!prefix) return raw;

  const diffToken = `${prefix}${parseInt(level, 10) || 0}`;
  if (!/\d+/.test(diffToken)) return raw;

  const escaped = diffToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return raw
    .replace(new RegExp(`\\s+${escaped}(?:\\b.*)?$`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildChartIndexes(db, aliases) {
  const rows = db.prepare(`
    SELECT id as chart_id, title, artist, mode, level, jacket_url
    FROM songs
    WHERE mode IN ('Single', 'Double', 'CoOp')
    ORDER BY id ASC
  `).all();

  const byChartKey = new Map();
  const byCompactModeLevel = new Map();
  const byModeLevel = new Map();

  for (const row of rows) {
    const mode = normalizeMode(row.mode);
    const level = parseInt(row.level, 10) || 0;
    if (!mode || level <= 0) continue;

    const key = makeChartKey(row.title, mode, level, aliases);
    const compact = compactKey(row.title || '');
    const modeLevelKey = `${mode}|${level}`;
    const compactModeLevelKey = `${mode}|${level}|${compact}`;

    const chart = {
      chart_id: parseInt(row.chart_id, 10) || 0,
      title: row.title || '',
      artist: row.artist || '',
      mode,
      level,
      chart_key: key,
      compact_key: compact,
    };

    if (key && !byChartKey.has(key)) {
      byChartKey.set(key, chart);
    }

    if (!byCompactModeLevel.has(compactModeLevelKey)) byCompactModeLevel.set(compactModeLevelKey, []);
    byCompactModeLevel.get(compactModeLevelKey).push(chart);

    if (!byModeLevel.has(modeLevelKey)) byModeLevel.set(modeLevelKey, []);
    byModeLevel.get(modeLevelKey).push(chart);
  }

  return { byChartKey, byCompactModeLevel, byModeLevel };
}

async function scrapeSkillIndex(page) {
  const url = `${SOURCE_BASE}/skill`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(800);

  const rows = await page.$$eval('a[href^="/skill/"]', (els) => {
    return els.map((el) => {
      const href = String(el.getAttribute('href') || '').trim();
      const name = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      return { href, name };
    }).filter((row) => row.href && row.href !== '/skill');
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

async function waitForChartLinks(page, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await page.locator('a[href^="/chart/"]').count();
    if (count > 0) return count;
    await page.waitForTimeout(250);
  }
  return page.locator('a[href^="/chart/"]').count();
}

async function scrapeSkillPage(page, skill, timeoutMs) {
  await page.goto(skill.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForChartLinks(page, timeoutMs);

  const rawLinks = await page.$$eval('a[href^="/chart/"]', (els) => {
    return els.map((el) => ({
      href: String(el.getAttribute('href') || '').trim(),
      title: String(el.textContent || '').replace(/\s+/g, ' ').trim(),
    })).filter((row) => row.href && row.title);
  });

  const seen = new Set();
  const entries = [];
  for (const row of rawLinks) {
    const parsed = parseChartRefFromHref(row.href);
    if (!parsed) continue;
    const key = `${row.title}|${parsed.mode}|${parsed.level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      skill_slug: skill.slug,
      skill_name: skill.name,
      source_skill_url: skill.url,
      source_chart_url: row.href.startsWith('http') ? row.href : `${SOURCE_BASE}${row.href}`,
      title: row.title,
      mode: parsed.mode,
      level: parsed.level,
    });
  }

  return {
    skill,
    total_links: rawLinks.length,
    parsed_entries: entries.length,
    entries,
  };
}

async function waitForSearchRows(page, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await page.locator('table.search-results tbody tr').count();
    if (count > 0) return count;
    await page.waitForTimeout(120);
  }
  return page.locator('table.search-results tbody tr').count();
}

async function scrapeSearchPages(page, timeoutMs) {
  const searchUrl = `${SOURCE_BASE}/search?levelSort=none`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForSearchRows(page, timeoutMs);

  const initialPageInfo = await page.evaluate(() => {
    const span = document.querySelector('.pagination-controls .page-navigation span');
    const text = String(span?.textContent || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/Page\s+(\d+)\s+of\s+(\d+)\s*\((\d+)\s*stepcharts\)/i);
    return {
      page: match ? parseInt(match[1], 10) || 1 : 1,
      totalPages: match ? parseInt(match[2], 10) || 1 : 1,
      totalStepcharts: match ? parseInt(match[3], 10) || 0 : 0,
      label: text,
    };
  });

  const totalPages = Math.max(1, initialPageInfo.totalPages || 1);
  const nextButton = page.locator('.pagination-controls .page-navigation button').nth(1);
  const rawPages = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    await waitForSearchRows(page, timeoutMs);

    const pageRows = await page.$$eval('table.search-results tbody tr', (rows) => {
      return rows.map((row) => {
        const chartLink = row.querySelector('a[href^="/chart/"]');
        const chartHref = String(chartLink?.getAttribute('href') || '').trim();
        const chartName = String(chartLink?.textContent || '').replace(/\s+/g, ' ').trim();

        const skills = [];
        for (const skillLink of row.querySelectorAll('a[href^="/skill/"]')) {
          const href = String(skillLink.getAttribute('href') || '').trim();
          const text = String(skillLink.textContent || '').replace(/\s+/g, ' ').trim();
          if (!text) continue;
          skills.push({ href, text });
        }

        return { chart_href: chartHref, chart_name: chartName, skills };
      }).filter((row) => row.chart_href && row.chart_name);
    });

    rawPages.push({
      page: pageNum,
      row_count: pageRows.length,
      rows: pageRows,
    });

    if (pageNum >= totalPages) break;

    await nextButton.click();
    await page.waitForFunction((expectedPage) => {
      const span = document.querySelector('.pagination-controls .page-navigation span');
      const text = String(span?.textContent || '').replace(/\s+/g, ' ').trim();
      const match = text.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
      return !!(match && Number(match[1]) === expectedPage);
    }, pageNum + 1, { timeout: timeoutMs });
  }

  const entries = [];
  let totalRows = 0;
  for (const pageRow of rawPages) {
    totalRows += pageRow.row_count;

    for (const row of pageRow.rows) {
      const parsed = parseChartRefFromHref(row.chart_href);
      if (!parsed) continue;

      const parsedTitle = normalizeSkillName(extractTitleFromChartSlug(parsed.slug));
      const labelTitle = normalizeSkillName(stripDifficultyFromChartLabel(row.chart_name, parsed.mode, parsed.level));
      const fallbackTitle = normalizeSkillName(row.chart_name);
      const title = parsedTitle || labelTitle || fallbackTitle;
      if (!title) continue;

      const seenSkills = new Set();
      for (const skillRow of row.skills) {
        const slugFromHref = normalizeSkillSlug(skillRow.href);
        const slugFromText = normalizeSkillSlug(skillRow.text);
        const skillSlug = slugFromHref || slugFromText;
        if (!skillSlug || seenSkills.has(skillSlug)) continue;
        seenSkills.add(skillSlug);

        const skillName = normalizeSkillName(skillRow.text) || humanizeSkillSlug(skillSlug);
        const sourceSkillUrl = slugFromHref
          ? `${SOURCE_BASE}/skill/${slugFromHref}`
          : searchUrl;

        entries.push({
          skill_slug: skillSlug,
          skill_name: skillName,
          source_skill_url: sourceSkillUrl,
          source_chart_url: row.chart_href.startsWith('http') ? row.chart_href : `${SOURCE_BASE}${row.chart_href}`,
          title,
          mode: parsed.mode,
          level: parsed.level,
        });
      }
    }
  }

  return {
    source_url: searchUrl,
    total_pages: totalPages,
    total_stepcharts: initialPageInfo.totalStepcharts || 0,
    total_rows: totalRows,
    parsed_entries: entries.length,
    entries,
    raw_pages: rawPages,
  };
}

function mapScrapedEntry(entry, chartIndexes, aliases) {
  const directKey = makeChartKey(entry.title, entry.mode, entry.level, aliases);
  if (directKey && chartIndexes.byChartKey.has(directKey)) {
    return { chart: chartIndexes.byChartKey.get(directKey), method: `chart_key:${directKey}` };
  }

  const compact = compactKey(entry.title);
  const compactAlias = MANUAL_TITLE_ALIASES[compact] || '';
  if (compactAlias) {
    const aliasKey = makeChartKey(compactAlias, entry.mode, entry.level, aliases);
    if (aliasKey && chartIndexes.byChartKey.has(aliasKey)) {
      return { chart: chartIndexes.byChartKey.get(aliasKey), method: `manual_alias:${compact}->${compactAlias}` };
    }
  }

  const compactModeLevelKey = `${entry.mode}|${entry.level}|${compact}`;
  const compactCandidates = chartIndexes.byCompactModeLevel.get(compactModeLevelKey) || [];
  if (compactCandidates.length === 1) {
    return { chart: compactCandidates[0], method: `compact:${compact}` };
  }
  if (compactCandidates.length > 1) {
    return { chart: compactCandidates[0], method: `compact_ambiguous:${compact}` };
  }

  const modeLevelCandidates = chartIndexes.byModeLevel.get(`${entry.mode}|${entry.level}`) || [];
  const containsCandidates = modeLevelCandidates.filter((chart) => {
    if (!chart.compact_key || !compact) return false;
    return chart.compact_key.includes(compact) || compact.includes(chart.compact_key);
  });
  if (containsCandidates.length === 1) {
    return { chart: containsCandidates[0], method: `contains:${compact}` };
  }
  if (containsCandidates.length > 1) {
    return { chart: containsCandidates[0], method: `contains_ambiguous:${compact}` };
  }

  return { chart: null, method: 'unmatched' };
}

function saveAssignments(db, assignments) {
  const clearStmt = db.prepare(`DELETE FROM chart_skills WHERE source = 'piucenter'`);
  const insertStmt = db.prepare(`
    INSERT INTO chart_skills (
      chart_id, skill_slug, skill_name, source, created_at, updated_at
    ) VALUES (?, ?, ?, 'piucenter', datetime('now'), datetime('now'))
    ON CONFLICT(chart_id, skill_slug)
    DO UPDATE SET
      skill_name = excluded.skill_name,
      source = CASE
        WHEN chart_skills.source = 'manual' THEN 'manual'
        ELSE 'piucenter'
      END,
      updated_at = datetime('now')
  `);

  const tx = db.transaction((rows) => {
    clearStmt.run();
    for (const row of rows) {
      insertStmt.run(row.chart_id, row.skill_slug, row.skill_name);
    }
  });
  tx(assignments);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.includeSkillPages && !opts.includeSearch) {
    throw new Error('Nothing to scrape: enable at least one source (--skip-search / --skip-skill-pages)');
  }

  initializeDb();
  const db = getDb();
  const aliases = loadSongAliases();
  const chartIndexes = buildChartIndexes(db, aliases);

  const browser = await chromium.launch({ headless: opts.headless });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } });

  const rawResults = [];
  const assignments = [];
  const unmatched = [];
  const sourceSummary = {
    skill_pages: null,
    search: null,
  };

  const mapEntries = (entries, sourceTag) => {
    let matched = 0;
    for (const entry of entries) {
      const mapped = mapScrapedEntry(entry, chartIndexes, aliases);
      if (!mapped.chart) {
        unmatched.push({
          source: sourceTag,
          skill_slug: entry.skill_slug,
          skill_name: entry.skill_name,
          title: entry.title,
          mode: entry.mode,
          level: entry.level,
          source_skill_url: entry.source_skill_url,
          source_chart_url: entry.source_chart_url,
          map_method: mapped.method,
        });
        continue;
      }

      assignments.push({
        source: sourceTag,
        chart_id: mapped.chart.chart_id,
        title: mapped.chart.title,
        mode: mapped.chart.mode,
        level: mapped.chart.level,
        skill_slug: entry.skill_slug,
        skill_name: entry.skill_name,
        source_skill_url: entry.source_skill_url,
        source_chart_url: entry.source_chart_url,
        map_method: mapped.method,
      });
      matched++;
    }
    return matched;
  };

  let filteredSkills = [];
  if (opts.includeSkillPages) {
    const skillIndex = await scrapeSkillIndex(page);
    filteredSkills = opts.skillFilters.length > 0
      ? skillIndex.filter((skill) => opts.skillFilters.includes(skill.slug))
      : skillIndex;

    if (filteredSkills.length === 0) {
      await browser.close();
      throw new Error('No skills to scrape (check --skill filters)');
    }

    for (const skill of filteredSkills) {
      const raw = await scrapeSkillPage(page, skill, opts.timeoutMs);
      rawResults.push({
        type: 'skill_page',
        ...raw,
      });

      const matchedForSkill = mapEntries(raw.entries, `skill:${skill.slug}`);
      console.log(
        `[${skill.slug}] links=${raw.total_links} parsed=${raw.parsed_entries} matched=${matchedForSkill} unmatched=${raw.parsed_entries - matchedForSkill}`
      );
    }

    sourceSummary.skill_pages = {
      enabled: true,
      site: `${SOURCE_BASE}/skill`,
      skill_count: filteredSkills.length,
      skills: filteredSkills.map((skill) => ({
        slug: skill.slug,
        name: skill.name,
        url: skill.url,
      })),
    };
  }

  if (opts.includeSearch) {
    const rawSearch = await scrapeSearchPages(page, opts.timeoutMs);
    rawResults.push({
      type: 'search',
      ...rawSearch,
    });

    const matchedFromSearch = mapEntries(rawSearch.entries, 'search');
    console.log(
      `[search] pages=${rawSearch.total_pages} charts=${rawSearch.total_stepcharts || rawSearch.total_rows} parsed=${rawSearch.parsed_entries} matched=${matchedFromSearch} unmatched=${rawSearch.parsed_entries - matchedFromSearch}`
    );

    sourceSummary.search = {
      enabled: true,
      site: rawSearch.source_url,
      total_pages: rawSearch.total_pages,
      total_stepcharts: rawSearch.total_stepcharts,
      total_rows: rawSearch.total_rows,
      parsed_entries: rawSearch.parsed_entries,
    };
  }

  await browser.close();

  const deduped = [];
  const seen = new Set();
  for (const row of assignments) {
    const key = `${row.chart_id}|${row.skill_slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  if (!opts.dryRun) {
    saveAssignments(db, deduped);
  }

  const outPayload = {
    generated_at: new Date().toISOString(),
    source: sourceSummary,
    summary: {
      dry_run: !!opts.dryRun,
      scraped_entries: rawResults.reduce((sum, row) => sum + (parseInt(row.parsed_entries, 10) || 0), 0),
      mapped_rows_before_dedupe: assignments.length,
      mapped_rows: deduped.length,
      unmatched_rows: unmatched.length,
    },
    rows: deduped.map((row) => ({
      chart_id: row.chart_id,
      title: row.title,
      mode: row.mode,
      level: row.level,
      skill_slug: row.skill_slug,
      skill_name: row.skill_name,
      source_skill_url: row.source_skill_url,
      source_chart_url: row.source_chart_url,
      map_method: row.map_method,
    })),
  };

  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  fs.writeFileSync(opts.outPath, JSON.stringify(outPayload, null, 2));

  if (opts.saveRaw) {
    const rawPath = opts.outPath.replace(/\.json$/i, '.raw.json');
    fs.writeFileSync(rawPath, JSON.stringify(rawResults, null, 2));
  }

  if (unmatched.length > 0) {
    const unmatchedPath = opts.outPath.replace(/\.json$/i, '.unmatched.json');
    fs.writeFileSync(unmatchedPath, JSON.stringify(unmatched, null, 2));
    console.warn(`Unmatched rows: ${unmatched.length} (saved to ${unmatchedPath})`);
  }

  if (opts.dryRun) {
    console.log(`Dry run complete: ${deduped.length} mapped rows, no DB writes performed.`);
  } else {
    console.log(`Imported ${deduped.length} chart skill rows into chart_skills.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

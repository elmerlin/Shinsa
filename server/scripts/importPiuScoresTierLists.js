#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { initializeDb, getDb } = require('../db/schema');

const SOURCE_BASE = 'https://piuscores.arroweclip.se/TierLists';
const MODE_ORDER = ['Single', 'Double', 'CoOp'];

const MANUAL_SLUG_ALIASES = {
  doppelgangerc: 'doppelganger',
  phalanxrs2018edit: 'phalanx',
  meteo5ciencegadgetmix: 'meteo5cience',
  godmode20featskizzo: 'godmode20',
  koaaliceinwonderworldshortcut: 'koaaliceinwonderworld',
  exceed2openingshortcut: 'exceed2opening',
  stardreameurobeatshortcut: 'stardreameurobeat',
  interferencefullsong: 'interference',
  nxopeningshortcut: 'nxopening',
  passacagliashortcut: 'passacaglia',
  movethatbodyshortcut: 'movethatbody',
  finalaudition3shortcut: 'finalaudition3',
  selfishnessshortcut: 'selfishness',
  dignityfullsong: 'dignityfullsongmix',
  xraveshortcut: 'xrave',
  solitary2shortcut: 'solitary2',
  loveisadangerzoneshortcut: 'loveisadangerzone',
  badapplefeatnomico: 'badapple',
  badapplefeatnomicofullsong: 'badapple',
  underworldftskizzopiuedit: 'underworld',
  papasitofeatkutina: 'papasito',
  silverbeatfeatchisauezono: 'silverbeat',
  utsushiyonokazefeatkana: 'utsushiyonokaze',
  stardreameurobeat: 'stardreameurobeatremix',
};

function parseArgs(argv) {
  const opts = {
    tierListType: 'Pass',
    headless: true,
    timeoutMs: 25000,
    outPath: path.join(__dirname, '..', 'data', 'piuscores-tier-pass.json'),
    saveRaw: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--tier-list-type=')) {
      opts.tierListType = String(arg.slice('--tier-list-type='.length) || 'Pass').trim() || 'Pass';
    } else if (arg === '--headed') {
      opts.headless = false;
    } else if (arg.startsWith('--timeout-ms=')) {
      const parsed = parseInt(arg.slice('--timeout-ms='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) opts.timeoutMs = parsed;
    } else if (arg.startsWith('--out=')) {
      opts.outPath = path.resolve(arg.slice('--out='.length));
    } else if (arg === '--save-raw') {
      opts.saveRaw = true;
    }
  }

  return opts;
}

function normalizeText(value) {
  let src = String(value || '');
  src = src.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  src = src.toLowerCase();
  src = src.replace(/&/g, ' and ');
  src = src.replace(/[(){}\[\]'"`~:;,.!?]/g, ' ');
  src = src.replace(/[+/_-]+/g, ' ');
  src = src.replace(/\s+/g, ' ').trim();
  return src;
}

function compactKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function stripFeatureSuffix(value) {
  let src = String(value || '').toLowerCase();
  const markers = ['feat', 'ft', 'producedby'];
  let cutAt = -1;
  for (const marker of markers) {
    const idx = src.indexOf(marker);
    if (idx > 2 && (cutAt === -1 || idx < cutAt)) cutAt = idx;
  }
  if (cutAt > 0) src = src.slice(0, cutAt);
  return src;
}

function stripChartTypeSuffix(value) {
  let src = String(value || '').toLowerCase();
  const suffixes = [
    'fullsongmix',
    'fullsong',
    'shortcutmix',
    'shortcut',
    'piuedit',
    'remix',
    'mix',
    'edit',
  ];
  let prev = '';
  while (prev !== src) {
    prev = src;
    for (const suffix of suffixes) {
      if (src.endsWith(suffix)) {
        src = src.slice(0, -suffix.length);
      }
    }
  }
  return src;
}

function normalizeTierName(name) {
  const compact = String(name || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (compact === 'overrated') return 'Overrated';
  if (compact === 'veryeasy') return 'VeryEasy';
  if (compact === 'easy') return 'Easy';
  if (compact === 'medium' || compact === 'mid') return 'Medium';
  if (compact === 'hard') return 'Hard';
  if (compact === 'veryhard') return 'VeryHard';
  if (compact === 'underrated') return 'Underrated';
  return String(name || '').trim();
}

function toSlug(url) {
  const raw = String(url || '').split('/').pop() || '';
  return raw.replace(/\.(png|jpg|jpeg|webp)$/i, '');
}

function buildSlugKeys(slugRaw) {
  const slug = String(slugRaw || '').trim();
  const plain = slug.replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const camelSpaced = plain.replace(/([a-z])([A-Z])/g, '$1 $2');

  const keys = new Set();
  const strict = compactKey(plain);
  if (strict) keys.add(strict);
  const spaced = compactKey(camelSpaced);
  if (spaced) keys.add(spaced);

  const noFeat = compactKey(stripFeatureSuffix(plain));
  if (noFeat) keys.add(noFeat);
  const noType = compactKey(stripChartTypeSuffix(stripFeatureSuffix(plain)));
  if (noType) keys.add(noType);

  const alias = MANUAL_SLUG_ALIASES[strict] || MANUAL_SLUG_ALIASES[noType] || MANUAL_SLUG_ALIASES[noFeat];
  if (alias) keys.add(compactKey(alias));

  return Array.from(keys).filter(Boolean);
}

function buildTitleKeys(title) {
  const raw = String(title || '');
  const keys = new Set();

  const strict = compactKey(raw);
  if (strict) keys.add(strict);

  const noParen = compactKey(raw.replace(/\([^)]*\)/g, ' '));
  if (noParen) keys.add(noParen);

  const noFeat = compactKey(stripFeatureSuffix(raw));
  if (noFeat) keys.add(noFeat);

  const noType = compactKey(stripChartTypeSuffix(stripFeatureSuffix(raw)));
  if (noType) keys.add(noType);

  return Array.from(keys).filter(Boolean);
}

function buildChartIndex(charts) {
  const byKey = new Map();
  for (const chart of charts) {
    const keys = buildTitleKeys(chart.title);
    for (const key of keys) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(chart);
    }
  }
  return { byKey, all: charts };
}

function pickChartForSlug(slug, chartIndex, usedChartIds) {
  const slugKeys = buildSlugKeys(slug);

  for (const key of slugKeys) {
    const candidates = (chartIndex.byKey.get(key) || []).filter((chart) => !usedChartIds.has(chart.chart_id));
    if (candidates.length === 1) {
      return { chart: candidates[0], method: `key:${key}` };
    }
    if (candidates.length > 1) {
      return { chart: candidates[0], method: `ambiguous:${key}` };
    }
  }

  for (const key of slugKeys) {
    const candidates = chartIndex.all.filter((chart) => {
      if (usedChartIds.has(chart.chart_id)) return false;
      return chart.title_key.includes(key) || key.includes(chart.title_key);
    });
    if (candidates.length === 1) {
      return { chart: candidates[0], method: `contains:${key}` };
    }
    if (candidates.length > 1) {
      return { chart: candidates[0], method: `contains-ambiguous:${key}` };
    }
  }

  return { chart: null, method: 'unmatched' };
}

function buildSourceUrl(mode, level, tierListType) {
  const qs = new URLSearchParams({
    Difficulty: String(level),
    ChartType: mode,
    TierListType: tierListType,
  });
  return `${SOURCE_BASE}?${qs.toString()}`;
}

async function scrapeModeLevel(page, mode, level, tierListType, timeoutMs) {
  const url = buildSourceUrl(mode, level, tierListType);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const cardCount = await page.locator('.chart-card').count();
    if (cardCount > 0) break;
    await page.waitForTimeout(300);
  }

  const scraped = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('h6'))
      .map((el) => ({ el, text: String(el.textContent || '').trim() }))
      .filter(({ text }) => text && text.toLowerCase() !== 'piu scores');

    const tiers = [];
    for (const [idx, header] of headers.entries()) {
      const tierName = header.text;
      const cards = [];
      let node = header.el.parentElement?.nextElementSibling || null;

      while (node) {
        if (node.querySelector('h6')) break;
        const cardHeaders = node.querySelectorAll('.chart-card .mud-card-header');
        if (cardHeaders.length > 0) {
          cardHeaders.forEach((cardHeader) => {
            const style = String(cardHeader.style.backgroundImage || '');
            const match = style.match(/url\("?([^")]+)"?\)/i);
            if (match && match[1]) {
              cards.push({
                source_url: match[1],
                source_slug: (match[1].split('/').pop() || '').replace(/\.(png|jpg|jpeg|webp)$/i, ''),
              });
            }
          });
        }
        node = node.nextElementSibling;
      }

      if (cards.length > 0) {
        tiers.push({
          tier_name: tierName,
          tier_rank: idx,
          cards,
        });
      }
    }

    return {
      total_cards: document.querySelectorAll('.chart-card').length,
      tiers,
    };
  });

  return {
    mode,
    level,
    source_url: url,
    total_cards: scraped.total_cards || 0,
    tiers: (scraped.tiers || []).map((tier) => ({
      tier_name: normalizeTierName(tier.tier_name),
      tier_rank: parseInt(tier.tier_rank, 10) || 0,
      cards: Array.isArray(tier.cards) ? tier.cards : [],
    })),
  };
}

function mapModeLevelToCharts(db, mode, level, scraped) {
  const chartRows = db.prepare(`
    SELECT id as chart_id, title, artist, mode, level, jacket_url
    FROM songs
    WHERE mode = ? AND level = ?
    ORDER BY id ASC
  `).all(mode, level);

  const charts = chartRows.map((row) => ({
    ...row,
    title_key: compactKey(row.title || ''),
  }));
  const chartIndex = buildChartIndex(charts);
  const usedChartIds = new Set();

  const rows = [];
  const unmatched = [];
  const unmatchedCards = [];

  for (const tier of scraped.tiers) {
    const tierName = normalizeTierName(tier.tier_name);
    for (const card of tier.cards) {
      const slug = String(card.source_slug || toSlug(card.source_url || '')).trim();
      const picked = pickChartForSlug(slug, chartIndex, usedChartIds);
      if (!picked.chart) {
        unmatchedCards.push({
          mode,
          level,
          tier_name: tierName,
          tier_rank: tier.tier_rank,
          source_slug: slug,
          source_url: card.source_url || '',
        });
        continue;
      }

      usedChartIds.add(picked.chart.chart_id);
      rows.push({
        tier_list_type: 'Pass',
        mode,
        level,
        tier_name: tierName,
        tier_rank: tier.tier_rank,
        chart_id: picked.chart.chart_id,
        source_slug: slug,
        source_url: card.source_url || '',
        map_method: picked.method,
      });
    }
  }

  const remainingCharts = charts.filter((chart) => !usedChartIds.has(chart.chart_id));
  while (unmatchedCards.length > 0 && remainingCharts.length > 0) {
    const chart = remainingCharts.shift();
    const card = unmatchedCards.shift();
    usedChartIds.add(chart.chart_id);
    rows.push({
      tier_list_type: 'Pass',
      mode,
      level,
      tier_name: card.tier_name,
      tier_rank: card.tier_rank,
      chart_id: chart.chart_id,
      source_slug: card.source_slug,
      source_url: card.source_url,
      map_method: 'fallback:remaining-chart',
    });
  }

  unmatched.push(...unmatchedCards);

  if (remainingCharts.length > 0) {
    const tierByRank = [...scraped.tiers].sort((a, b) => (a.tier_rank || 0) - (b.tier_rank || 0));
    const fallbackTier = tierByRank[0] || { tier_name: 'Medium', tier_rank: 2 };
    for (const chart of remainingCharts) {
      rows.push({
        tier_list_type: 'Pass',
        mode,
        level,
        tier_name: normalizeTierName(fallbackTier.tier_name),
        tier_rank: parseInt(fallbackTier.tier_rank, 10) || 0,
        chart_id: chart.chart_id,
        source_slug: '',
        source_url: '',
        map_method: 'fallback:unlisted-chart',
      });
    }
  }

  return {
    mode,
    level,
    total_cards: scraped.total_cards,
    tier_count: scraped.tiers.length,
    matched_rows: rows.length,
    unmatched,
    rows,
    chart_pool_count: charts.length,
  };
}

function saveTierRows(db, tierListType, levelRows) {
  const clearStmt = db.prepare(`
    DELETE FROM chart_tiers
    WHERE tier_list_type = ? AND mode = ? AND level = ?
  `);
  const insertStmt = db.prepare(`
    INSERT INTO chart_tiers (
      tier_list_type,
      mode,
      level,
      tier_name,
      tier_rank,
      chart_id,
      source_slug,
      source_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tier_list_type, mode, level, chart_id)
    DO UPDATE SET
      tier_name = excluded.tier_name,
      tier_rank = excluded.tier_rank,
      source_slug = excluded.source_slug,
      source_url = excluded.source_url
  `);

  const upsertTx = db.transaction((payload) => {
    for (const levelRow of payload) {
      clearStmt.run(tierListType, levelRow.mode, levelRow.level);
      for (const row of levelRow.rows) {
        insertStmt.run(
          tierListType,
          row.mode,
          row.level,
          row.tier_name,
          row.tier_rank,
          row.chart_id,
          row.source_slug,
          row.source_url
        );
      }
    }
  });

  upsertTx(levelRows);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tierListType = String(opts.tierListType || 'Pass').trim() || 'Pass';

  initializeDb();
  const db = getDb();

  const levelsByMode = {
    Single: db.prepare("SELECT DISTINCT level FROM songs WHERE mode = 'Single' ORDER BY level ASC").all().map((r) => r.level),
    Double: db.prepare("SELECT DISTINCT level FROM songs WHERE mode = 'Double' ORDER BY level ASC").all().map((r) => r.level),
    CoOp: db.prepare("SELECT DISTINCT level FROM songs WHERE mode = 'CoOp' ORDER BY level ASC").all().map((r) => r.level),
  };

  const browser = await chromium.launch({ headless: opts.headless });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } });

  const rawResults = [];
  const mappedResults = [];
  const unmatched = [];
  let mappedTotal = 0;
  let scrapedTotal = 0;

  for (const mode of MODE_ORDER) {
    for (const level of (levelsByMode[mode] || [])) {
      const raw = await scrapeModeLevel(page, mode, level, tierListType, opts.timeoutMs);
      rawResults.push(raw);

      const mapped = mapModeLevelToCharts(db, mode, level, raw);
      mappedResults.push(mapped);
      unmatched.push(...mapped.unmatched);
      mappedTotal += mapped.matched_rows;
      scrapedTotal += raw.total_cards;

      console.log(
        `[${mode}${level}] tiers=${raw.tiers.length} cards=${raw.total_cards} mapped=${mapped.matched_rows} unmatched=${mapped.unmatched.length}`
      );
    }
  }

  await browser.close();

  saveTierRows(db, tierListType, mappedResults);

  const outPayload = {
    generated_at: new Date().toISOString(),
    source: {
      base_url: SOURCE_BASE,
      tier_list_type: tierListType,
      modes: MODE_ORDER,
    },
    summary: {
      scraped_cards: scrapedTotal,
      mapped_rows: mappedTotal,
      unmatched_rows: unmatched.length,
      levels_by_mode: levelsByMode,
    },
    levels: mappedResults.map((item) => ({
      mode: item.mode,
      level: item.level,
      total_cards: item.total_cards,
      chart_pool_count: item.chart_pool_count,
      matched_rows: item.matched_rows,
      unmatched_count: item.unmatched.length,
      rows: item.rows.map((row) => ({
        mode: row.mode,
        level: row.level,
        tier_name: row.tier_name,
        tier_rank: row.tier_rank,
        chart_id: row.chart_id,
        source_slug: row.source_slug,
        source_url: row.source_url,
      })),
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

  console.log(`Wrote ${mappedTotal} tier assignments to chart_tiers and ${opts.outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

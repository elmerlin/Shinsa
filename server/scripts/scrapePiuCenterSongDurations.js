#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SOURCE_BASE = 'https://www.piucenter.com';
const SONG_DURATION_OVERRIDES = new Map([
  ['nyarlathotep|nato', {
    title: 'Nyarlathotep',
    artist: 'Nato',
    duration_seconds: 120,
    duration_hint_seconds: 120,
  }],
]);

function parseArgs(argv) {
  const opts = {
    snapshot: '120524',
    concurrency: 10,
    limit: 0,
    outPath: path.join(__dirname, '..', 'data', 'piucenter-song-durations.json'),
  };

  for (const arg of argv) {
    if (arg.startsWith('--snapshot=')) {
      const value = String(arg.slice('--snapshot='.length)).trim();
      if (value) opts.snapshot = value;
    } else if (arg.startsWith('--concurrency=')) {
      const value = parseInt(arg.slice('--concurrency='.length), 10);
      if (Number.isFinite(value) && value > 0) opts.concurrency = value;
    } else if (arg.startsWith('--limit=')) {
      const value = parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(value) && value > 0) opts.limit = value;
    } else if (arg.startsWith('--out=')) {
      const value = String(arg.slice('--out='.length)).trim();
      if (value) opts.outPath = path.resolve(value);
    }
  }

  return opts;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function parseChartShortname(shortname) {
  const raw = String(shortname || '').trim().replace(/^\/?chart\//i, '').replace(/\/+$/, '');
  if (!raw) return null;

  const parts = raw.split('_');
  let diffIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^[SDC]\d+$/i.test(String(parts[i] || '').trim())) {
      diffIdx = i;
      break;
    }
  }
  if (diffIdx <= 0) return null;

  const beforeDiff = parts.slice(0, diffIdx).join('_');
  const artistSeparatorIdx = beforeDiff.lastIndexOf('_-_');
  const titlePart = artistSeparatorIdx >= 0 ? beforeDiff.slice(0, artistSeparatorIdx) : beforeDiff;
  const artistPart = artistSeparatorIdx >= 0 ? beforeDiff.slice(artistSeparatorIdx + 3) : '';

  const title = normalizeText(titlePart.replace(/_+/g, ' '));
  const artist = normalizeText(artistPart.replace(/_+/g, ' '));
  if (!title) return null;

  return {
    shortname: raw,
    title,
    artist,
    compact_title: compactKey(title),
    compact_artist: compactKey(artist),
  };
}

async function createOriginJsonFetcher(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(`${SOURCE_BASE}/chart/SONIC_BOOM_-_USAO_S7_ARCADE`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(1500);

  const fetchJson = async (relativeOrAbsoluteUrl) => {
    const result = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url);
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          text,
        };
      } catch (err) {
        return {
          ok: false,
          status: 0,
          error: String(err),
          text: '',
        };
      }
    }, relativeOrAbsoluteUrl);

    if (!result.ok) {
      throw new Error(result.error || `HTTP ${result.status} for ${relativeOrAbsoluteUrl}`);
    }

    try {
      return JSON.parse(result.text);
    } catch (err) {
      throw new Error(`Invalid JSON from ${relativeOrAbsoluteUrl}: ${err.message}`);
    }
  };

  return {
    page,
    fetchJson,
    close: () => page.close(),
  };
}

async function mapLimit(items, limit, iteratee) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await iteratee(items[index], index);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length || 1); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const workers = [];

  try {
    for (let i = 0; i < Math.max(1, opts.concurrency); i++) {
      workers.push(await createOriginJsonFetcher(browser));
    }

    const chartTablePath = `/chart-jsons/${opts.snapshot}/page-content/chart-table.json?cb=${Date.now()}`;
    const chartTable = await workers[0].fetchJson(chartTablePath);
    const chartTableUrl = `${SOURCE_BASE}${chartTablePath}`;
    if (!Array.isArray(chartTable) || chartTable.length === 0) {
      throw new Error(`No chart rows found at ${chartTableUrl}`);
    }

    const songsByKey = new Map();
    for (const row of chartTable) {
      const parsed = parseChartShortname(row?.name || '');
      if (!parsed) continue;
      const songKey = `${parsed.compact_title}|${parsed.compact_artist}`;
      if (!parsed.compact_title || songsByKey.has(songKey)) continue;
      songsByKey.set(songKey, {
        ...parsed,
        pack: normalizeText(row?.pack || ''),
      });
    }

    let songs = Array.from(songsByKey.values());
    if (opts.limit > 0) songs = songs.slice(0, opts.limit);

    const failures = [];
    let workerCursor = 0;
    const scraped = await mapLimit(songs, workers.length, async (song) => {
      const worker = workers[workerCursor % workers.length];
      workerCursor += 1;
      const chartPath = `/chart-jsons/${opts.snapshot}/${encodeURIComponent(song.shortname)}.json?cb=${Date.now()}-${workerCursor}`;
      try {
        const payload = await worker.fetchJson(chartPath);
        const meta = Array.isArray(payload) ? payload[2] : null;
        const rawHint = parseFloat(meta?.LASTSECONDHINT);
        if (!Number.isFinite(rawHint) || rawHint <= 0) {
          failures.push({ shortname: song.shortname, reason: 'Missing LASTSECONDHINT' });
          return null;
        }

        const override = SONG_DURATION_OVERRIDES.get(`${song.compact_title}|${song.compact_artist}`) || null;
        const durationSeconds = override?.duration_seconds || Math.round(rawHint);
        const durationHintSeconds = override?.duration_hint_seconds || rawHint;

        return {
          title: override?.title || song.title,
          artist: override?.artist || song.artist,
          compact_title: song.compact_title,
          compact_artist: song.compact_artist,
          pack: song.pack,
          duration_seconds: durationSeconds,
          duration_hint_seconds: durationHintSeconds,
          source_chart_slug: song.shortname,
          source_chart_url: `${SOURCE_BASE}/chart/${song.shortname}`,
        };
      } catch (err) {
        failures.push({ shortname: song.shortname, reason: err.message });
        return null;
      }
    });

    const durationSongs = scraped.filter(Boolean);
    const payload = {
      generated_at: new Date().toISOString(),
      source: {
        site: SOURCE_BASE,
        snapshot: opts.snapshot,
        chart_table_url: chartTableUrl,
        unique_song_candidates: songs.length,
        durations_found: durationSongs.length,
        failures: failures.length,
        transport: 'playwright-origin-fetch',
      },
      songs: durationSongs.sort((a, b) => {
        const byTitle = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        if (byTitle !== 0) return byTitle;
        return a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
      }),
      failures,
    };

    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
    fs.writeFileSync(opts.outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');

    console.log(`Saved ${durationSongs.length} PIU Center song durations -> ${opts.outPath}`);
    if (failures.length > 0) {
      console.warn(`Skipped ${failures.length} songs without usable duration metadata`);
    }
  } finally {
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exitCode = 1;
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const sharp = require('sharp');
const { createClient, scrapeTopSongs } = require('../lib/piugameScraper');

const ROOT_DIR = path.join(__dirname, '..', '..');
const PIU_BASE = 'https://www.piugame.com';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const JACKET_CANONICAL_OVERRIDES = {
  'Canon D - FULL SONG -': 'Canon D FULL Song MIX',
  'Dignity - FULL SONG -': 'DIGNITY FULL SONG MIX',
  "The People didn't know \"Pumping up\"": "The People didn't know Pumping up",
  'Beat of The War 2 - FULL SONG -': 'Beat of the War 2',
  'K.O.A : Alice In Wonderworld - SHORT CUT -': 'K.O.A : Alice in Wonderworld',
  'Bemera - SHORT CUT -': 'Bemera',
  'Love Is A Danger Zone(Cranky Mix)': 'Love Is A Danger Zone (Cranky Mix)',
  'Papasito (feat. KuTiNA)': 'Papasito feat. KuTiNA',
  'Paradoxx - SHORT CUT -': 'Paradoxx',
  'Stardream -Eurobeat Remix- - SHORT CUT -': 'Stardream ~Eurobeat Remix~ - SHORT CUT -',
};

function parseArgs(argv) {
  const opts = {
    date: '202602',
    mode: 'total',
    outDir: path.join(ROOT_DIR, 'client', 'public', 'jackets'),
    concurrency: 6,
    quality: 94,
  };

  for (const arg of argv) {
    if (arg.startsWith('--date=')) opts.date = arg.slice('--date='.length);
    else if (arg.startsWith('--mode=')) opts.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--out-dir=')) opts.outDir = path.resolve(arg.slice('--out-dir='.length));
    else if (arg.startsWith('--concurrency=')) opts.concurrency = Number(arg.slice('--concurrency='.length)) || opts.concurrency;
    else if (arg.startsWith('--quality=')) opts.quality = Number(arg.slice('--quality='.length)) || opts.quality;
  }

  opts.concurrency = Math.max(1, Math.min(20, Math.trunc(opts.concurrency)));
  opts.quality = Math.max(1, Math.min(100, Math.trunc(opts.quality)));
  return opts;
}

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSongName(value) {
  return collapseWhitespace(value).toLowerCase();
}

function toAbsoluteUrl(url) {
  const src = collapseWhitespace(url);
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  return new URL(src, PIU_BASE).toString();
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function buildLookupMaps(sourceObject) {
  const exact = new Map();
  const normalized = new Map();

  for (const [rawKey, rawValue] of Object.entries(sourceObject || {})) {
    const key = collapseWhitespace(rawKey);
    const value = collapseWhitespace(rawValue);
    if (!key || !value) continue;

    exact.set(key, value);
    const normalizedKey = normalizeSongName(key);
    if (!normalized.has(normalizedKey)) normalized.set(normalizedKey, value);
  }

  return { exact, normalized };
}

function loadAliasLookup() {
  const aliasesPath = path.join(ROOT_DIR, 'server', 'data', 'piugame-song-aliases.json');
  ensureFile(aliasesPath);
  const payload = readJson(aliasesPath);
  const aliases = payload?.aliases && typeof payload.aliases === 'object' ? payload.aliases : {};
  return buildLookupMaps(aliases);
}

function loadPumpJacketsByCanonical() {
  const pumpPath = path.join(ROOT_DIR, 'pump-phoenix.json');
  ensureFile(pumpPath);

  const payload = readJson(pumpPath);
  const songs = Array.isArray(payload?.songs) ? payload.songs : [];
  const map = new Map();
  const allJackets = new Set();

  for (const song of songs) {
    const canonical = collapseWhitespace(song?.name);
    const jacket = collapseWhitespace(song?.jacket);
    if (!canonical || !jacket) continue;
    allJackets.add(jacket);

    let cut = null;
    const flags = Array.isArray(song?.flags) ? song.flags : [];
    for (const flag of flags) {
      const match = String(flag || '').match(/^cut:(\d+)$/i);
      if (!match) continue;
      cut = Number(match[1]);
      break;
    }

    const normalizedCanonical = normalizeSongName(canonical);
    if (!map.has(normalizedCanonical)) map.set(normalizedCanonical, []);
    map.get(normalizedCanonical).push({ canonical, jacket, cut });
  }

  if (map.size === 0) {
    throw new Error(`No jacket mappings found in ${pumpPath}`);
  }

  return { byCanonical: map, allJackets };
}

function inferCutVariant(...titles) {
  const src = titles.join(' ').toUpperCase();
  if (src.includes('SHORT CUT') || src.includes('SHORTCUT') || src.includes('SHORT VER')) return 'short';
  if (src.includes('FULL SONG')) return 'full';
  return 'default';
}

function pickJacketEntry(entries, variant) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  if (entries.length === 1) return entries[0];

  const findByCut = (cut) => entries.find((entry) => entry.cut === cut) || null;
  const cut2 = findByCut(2);
  const cut3 = findByCut(3);
  const cut1 = findByCut(1);
  const cut4 = findByCut(4);
  const noCut = entries.find((entry) => !Number.isFinite(entry.cut)) || null;

  if (variant === 'short') return cut1 || cut3 || cut2 || noCut || cut4 || entries[0];
  if (variant === 'full') return cut4 || cut3 || cut2 || noCut || cut1 || entries[0];
  return cut2 || cut3 || noCut || cut1 || cut4 || entries[0];
}

function resolveCanonicalTitleForRow({
  enTitle,
  krTitle,
  aliasLookup,
  overrideLookup,
  jacketEntriesByCanonical,
}) {
  const titles = [collapseWhitespace(enTitle), collapseWhitespace(krTitle)].filter(Boolean);

  for (const title of titles) {
    const override = overrideLookup.exact.get(title);
    if (override) return override;
  }
  for (const title of titles) {
    const override = overrideLookup.normalized.get(normalizeSongName(title));
    if (override) return override;
  }
  for (const title of titles) {
    const alias = aliasLookup.exact.get(title);
    if (alias) return alias;
  }
  for (const title of titles) {
    const alias = aliasLookup.normalized.get(normalizeSongName(title));
    if (alias) return alias;
  }
  for (const title of titles) {
    if (jacketEntriesByCanonical.has(normalizeSongName(title))) return title;
  }

  return '';
}

async function fetchLocaleRows(lang, date, mode) {
  const client = createClient();
  return scrapeTopSongs(client, {
    date,
    mode,
    lang,
    pageSize: 50,
    maxPages: 60,
    delayMs: 120,
  });
}

function indexRowsByRank(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const rank = Number(row?.rank);
    if (!Number.isFinite(rank) || !Number.isFinite(Number(row?.rank))) continue;
    if (!map.has(rank)) map.set(rank, row);
  }
  return map;
}

async function downloadImage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 45000,
    httpsAgent,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: `${PIU_BASE}/leaderboard/top_songs.php`,
    },
    validateStatus: (status) => status >= 200 && status < 400,
    maxRedirects: 5,
  });

  return Buffer.from(res.data);
}

async function writeImageToTarget(imageBuffer, targetPath, quality) {
  const ext = path.extname(targetPath).toLowerCase();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (ext === '.png') {
    await sharp(imageBuffer).png({ compressionLevel: 9 }).toFile(targetPath);
    return;
  }

  if (ext === '.webp') {
    await sharp(imageBuffer).webp({ quality }).toFile(targetPath);
    return;
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    await sharp(imageBuffer)
      .flatten({ background: '#000000' })
      .jpeg({ quality, mozjpeg: true })
      .toFile(targetPath);
    return;
  }

  fs.writeFileSync(targetPath, imageBuffer);
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) break;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!/^\d{6}$/.test(String(opts.date))) {
    throw new Error(`Invalid --date value: ${opts.date} (expected YYYYMM)`);
  }

  console.log(`Fetching PIUGAME top songs for date=${opts.date}, mode=${opts.mode}...`);
  const [enRows, krRows] = await Promise.all([
    fetchLocaleRows('en', opts.date, opts.mode),
    fetchLocaleRows('kr', opts.date, opts.mode),
  ]);

  const enByRank = indexRowsByRank(enRows);
  const krByRank = indexRowsByRank(krRows);
  const aliasLookup = loadAliasLookup();
  const overrideLookup = buildLookupMaps(JACKET_CANONICAL_OVERRIDES);
  const { byCanonical: jacketEntriesByCanonical, allJackets } = loadPumpJacketsByCanonical();

  const jobs = [];
  const missing = [];

  const ranks = Array.from(new Set([...enByRank.keys(), ...krByRank.keys()])).sort((a, b) => a - b);

  for (const rank of ranks) {
    const en = enByRank.get(rank);
    const kr = krByRank.get(rank);
    const enTitle = collapseWhitespace(en?.song_title || '');
    const krTitle = collapseWhitespace(kr?.song_title || '');
    const canonical = resolveCanonicalTitleForRow({
      enTitle,
      krTitle,
      aliasLookup,
      overrideLookup,
      jacketEntriesByCanonical,
    });
    if (!canonical) {
      missing.push({ rank, en_title: enTitle, kr_title: krTitle, reason: 'missing_canonical_mapping' });
      continue;
    }

    const jacketEntries = jacketEntriesByCanonical.get(normalizeSongName(canonical));
    if (!jacketEntries || jacketEntries.length === 0) {
      missing.push({ rank, canonical, en_title: enTitle, kr_title: krTitle, reason: 'missing_jacket_mapping' });
      continue;
    }

    const variant = inferCutVariant(en?.song_title || '', kr?.song_title || '');
    const selectedEntry = pickJacketEntry(jacketEntries, variant);
    const jacketRel = collapseWhitespace(selectedEntry?.jacket);
    if (!jacketRel) {
      missing.push({ rank, canonical, en_title: enTitle, kr_title: krTitle, reason: 'missing_variant_jacket' });
      continue;
    }

    const sourceUrl = toAbsoluteUrl(en?.background_url || kr?.background_url || '');
    if (!sourceUrl) {
      missing.push({ rank, canonical, reason: 'missing_background_url' });
      continue;
    }

    jobs.push({
      rank,
      canonical,
      variant,
      en_title: enTitle,
      kr_title: krTitle,
      sourceUrl,
      jacketRel,
      targetPath: path.join(opts.outDir, jacketRel),
    });
  }

  if (jobs.length === 0) {
    throw new Error('No sync jobs were generated.');
  }

  const stats = {
    total: jobs.length,
    updated: 0,
    failed: 0,
  };
  const failures = [];

  const uniqueTargets = new Set(jobs.map((job) => job.jacketRel));
  const untouchedTargets = Array.from(allJackets).filter((jacket) => !uniqueTargets.has(jacket));
  console.log(
    `Syncing ${jobs.length} jackets into ${opts.outDir} (unique targets=${uniqueTargets.size}/${allJackets.size}, concurrency=${opts.concurrency})...`
  );
  if (untouchedTargets.length > 0) {
    console.log(`Preflight untouched targets: ${untouchedTargets.length}`);
    console.log('Untouched target preview:', JSON.stringify(untouchedTargets.slice(0, 20), null, 2));
  }
  await runPool(jobs, opts.concurrency, async (job, i) => {
    try {
      const imageBuffer = await downloadImage(job.sourceUrl);
      await writeImageToTarget(imageBuffer, job.targetPath, opts.quality);
      stats.updated += 1;
    } catch (err) {
      stats.failed += 1;
      failures.push({
        rank: job.rank,
        canonical: job.canonical,
        jacket: job.jacketRel,
        source: job.sourceUrl,
        error: err?.message || String(err),
      });
    }

    if ((i + 1) % 50 === 0 || i + 1 === jobs.length) {
      console.log(`Progress ${i + 1}/${jobs.length}`);
    }
  });

  console.log('');
  console.log('PIUGAME jacket sync complete');
  console.log(`- Updated: ${stats.updated}`);
  console.log(`- Failed: ${stats.failed}`);
  console.log(`- Missing mappings/urls: ${missing.length}`);

  if (missing.length > 0) {
    const preview = missing.slice(0, 10);
    console.log('Missing preview:', JSON.stringify(preview, null, 2));
  }

  if (failures.length > 0) {
    const preview = failures.slice(0, 10);
    console.log('Failure preview:', JSON.stringify(preview, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

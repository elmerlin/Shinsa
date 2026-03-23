#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient, scrapeTopSongs } = require('../lib/piugameScraper');

function parseArgs(argv) {
  const opts = {
    date: '202602',
    mode: 'total',
    outDir: path.join(__dirname, '..', 'data'),
  };

  for (const arg of argv) {
    if (arg.startsWith('--date=')) opts.date = arg.slice('--date='.length);
    else if (arg.startsWith('--mode=')) opts.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--out-dir=')) opts.outDir = path.resolve(arg.slice('--out-dir='.length));
  }

  return opts;
}

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSongName(value) {
  return collapseWhitespace(value).toLowerCase();
}

function normalizeLoose(value) {
  let src = String(value || '');
  src = src.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  src = src.toLowerCase();
  src = src.replace(/\r?\n/g, ' ');
  src = src.replace(/&/g, ' and ');

  src = src.replace(/\bfull\s*song\b/g, ' ');
  src = src.replace(/\bshort\s*cut\b/g, ' ');
  src = src.replace(/\bshort\s*ver\b/g, ' ');
  src = src.replace(/\bshortcut\b/g, ' ');

  src = src.replace(/\bfeat\.?\b/g, ' feat ');
  src = src.replace(/\bft\.?\b/g, ' feat ');
  src = src.replace(/[\(\[\{]\s*feat[^)\]}]*[\)\]\}]/g, ' ');

  src = src.replace(/[(){}\[\]"'`]/g, ' ');
  src = src.replace(/[~:;,.!?]/g, ' ');
  src = src.replace(/[+/_-]+/g, ' ');
  src = src.replace(/[^\p{L}\p{N}% ]+/gu, ' ');

  return collapseWhitespace(src);
}

function compactLoose(value) {
  return normalizeLoose(value).replace(/\s+/g, '');
}

function buildTitleCandidates(title) {
  const out = new Set();
  const raw = String(title || '');
  const base = collapseWhitespace(raw);
  if (base) out.add(base);

  for (const line of raw.split(/\r?\n+/)) {
    const clean = collapseWhitespace(line);
    if (clean) out.add(clean);
  }

  const asciiOnly = collapseWhitespace(raw.replace(/[^\x00-\x7F]/g, ' '));
  if (asciiOnly) out.add(asciiOnly);

  const latinTail = base.match(/([A-Za-z0-9][A-Za-z0-9 !'"().%&+\-_:;~,]+)$/);
  if (latinTail && latinTail[1]) out.add(collapseWhitespace(latinTail[1]));

  const variants = [
    base.replace(/\s*["“”][^"“”]+["“”]\s*$/u, ''),
    base.replace(/\s*~[^~]+~\s*$/u, ''),
    base.replace(/\s+-\s+[^-]+$/u, ''),
    base.replace(/\s*\([^)]*\)\s*$/u, ''),
    base.replace(/\s+/g, ''),
    collapseWhitespace(base.replace(/[^\p{L}\p{N}% ]+/gu, ' ')),
  ];

  for (const variant of variants) {
    const clean = collapseWhitespace(variant);
    if (clean) out.add(clean);
  }

  return Array.from(out);
}

function pickUnique(setLike) {
  if (!setLike || setLike.size !== 1) return null;
  for (const v of setLike) return v;
  return null;
}

function addToMultiMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

const MANUAL_CANONICAL_OVERRIDES = {
  '8 6': '86',
  '8 6 - FULL SONG -': '86',
  'ヨロピク ピクヨロ！ Yoropiku Pikuyoro !': 'Yoropiku Pikuyoro!',
  'Vanish 2 - Roar of the invisible dragon': 'Vanish 2',
  'F(R)IEND': 'Friend',
  'Dement ~After Legend~': 'Dement',
  'Phalanx "RS2018 edit"': 'Phalanx',
  'The Festival of Ghost2 (Sneak)': 'The Festival of Ghost 2 (Sneak)',
  'Kasou Shinja仮装信者': 'Kasou Shinja',
  '%X (Percent X)': 'Percent X',
  '甘い誘惑デインジャラス Amai Yuuwaku Dangerous': 'Amai Yuuwaku Dangerous',
  'X-Tream': 'X Treme',
  'Meteo5cience (GADGET mix)': 'Meteo5cience',
  'Allegro Più Mosso': 'Allegro Piu Mosso',
  'Love is a Danger Zone 2 Try To B.P.M': 'Love is a danger zone (try to B.P.M.)',
  'J Bong': 'JBong',
  'Tream Vook of the war': 'Tream Vook of the war REMIX',
  'Pneumonoultramicroscopicsilicovolcanoconiosis ft. Kagamine Len/GUMI':
    'Pneumonoultramicroscopicsilicovolcanoconiosis',
  'Cross Over feat. LyuU': 'Cross Over',
  'Paradoxx - SHORT CUT -': 'PARADOXX',
  'God Mode 2.0 feat. Skizzo': 'God Mode 2.0',
  'GOOD NIGHT - FULL SONG -': 'GOOD NIGHT',
  'Canon D - FULL SONG -': 'Canon D FULL Song MIX',
  'Stardream -Eurobeat Remix- - SHORT CUT -': 'Stardream -Eurobeat Remix-',
  'Bemera - SHORT CUT -': 'BEMERA',
  'CHICKEN WING - SHORT CUT -': 'CHICKEN WING',
  'Nyarlathotep - SHORT CUT -': 'Nyarlathotep - SHORT CUT -',
  '니알라토텝 - SHORT CUT -': 'Nyarlathotep - SHORT CUT -',
  'Yog-Sothoth - SHORT CUT -': 'Yog-Sothoth - SHORT CUT -',
  '요그 소토스 - SHORT CUT -': 'Yog-Sothoth - SHORT CUT -',
  'Final Audition Ep. 2-X - SHORT CUT -': 'Final Audition EP. 2-X',
  'K.O.A : Alice In Wonderworld - SHORT CUT -': 'K.O.A : Alice In Wonderworld',
  'Beat of The War 2 - FULL SONG -': 'Beat of The War 2',
};

function buildNormalizedOverrideMap() {
  const normalized = {};
  for (const [alias, canonical] of Object.entries(MANUAL_CANONICAL_OVERRIDES)) {
    normalized[normalizeSongName(alias)] = canonical;
  }
  return normalized;
}

function resolveCanonicalTitle(title, indexes, manualOverrides) {
  const manualKey = normalizeSongName(title);
  if (manualOverrides[manualKey]) return manualOverrides[manualKey];

  const candidates = buildTitleCandidates(title);

  for (const candidate of candidates) {
    const basicKey = normalizeSongName(candidate);
    const exact = indexes.byBasic.get(basicKey);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const loose = normalizeLoose(candidate);
    const looseMatch = pickUnique(indexes.byLoose.get(loose));
    if (looseMatch) return looseMatch;

    const compact = compactLoose(candidate);
    const compactMatch = pickUnique(indexes.byCompact.get(compact));
    if (compactMatch) return compactMatch;
  }

  return null;
}

function readPumpSongs() {
  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return Array.isArray(data.songs) ? data.songs : [];
}

function buildPumpIndexes(pumpSongs) {
  const byBasic = new Map();
  const byLoose = new Map();
  const byCompact = new Map();

  for (const song of pumpSongs) {
    const canonical = collapseWhitespace(song?.name || '');
    if (!canonical) continue;

    const basic = normalizeSongName(canonical);
    if (basic && !byBasic.has(basic)) byBasic.set(basic, canonical);

    addToMultiMap(byLoose, normalizeLoose(canonical), canonical);
    addToMultiMap(byCompact, compactLoose(canonical), canonical);
  }

  return { byBasic, byLoose, byCompact };
}

function toSortedObject(map) {
  return Object.fromEntries(
    Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'en'))
  );
}

function upsertAlias(aliasMap, conflicts, aliasTitle, canonicalTitle) {
  const alias = collapseWhitespace(aliasTitle);
  const canonical = collapseWhitespace(canonicalTitle);
  if (!alias || !canonical) return;

  const existing = aliasMap.get(alias);
  if (existing && existing !== canonical) {
    conflicts.push({ alias, existing, incoming: canonical });
    return;
  }

  aliasMap.set(alias, canonical);
}

async function fetchLocaleRows(lang, date, mode) {
  const client = createClient();
  return scrapeTopSongs(client, {
    lang,
    date,
    mode,
    pageSize: 50,
    maxPages: 60,
    delayMs: 120,
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!/^\d{6}$/.test(String(opts.date))) {
    throw new Error(`Invalid --date value: ${opts.date} (expected YYYYMM)`);
  }

  const generatedAt = new Date().toISOString();

  console.log(`Fetching PIUGAME top songs (en/kr) for date=${opts.date}, mode=${opts.mode}...`);
  const [enRows, krRows] = await Promise.all([
    fetchLocaleRows('en', opts.date, opts.mode),
    fetchLocaleRows('kr', opts.date, opts.mode),
  ]);

  const enSorted = [...enRows].sort((a, b) => a.rank - b.rank);
  const krSorted = [...krRows].sort((a, b) => a.rank - b.rank);

  if (enSorted.length === 0 || krSorted.length === 0) {
    throw new Error('Failed to fetch top songs (empty response)');
  }
  if (enSorted.length !== krSorted.length) {
    throw new Error(`Locale length mismatch: en=${enSorted.length}, kr=${krSorted.length}`);
  }

  const pumpSongs = readPumpSongs();
  const indexes = buildPumpIndexes(pumpSongs);
  const manualOverrides = buildNormalizedOverrideMap();

  const aliasMap = new Map();
  const aliasConflicts = [];
  const unresolved = [];
  const expandedRows = [];

  for (let i = 0; i < enSorted.length; i++) {
    const en = enSorted[i];
    const kr = krSorted[i];
    const rank = i + 1;
    const canonical = resolveCanonicalTitle(en.song_title, indexes, manualOverrides);

    if (!canonical) {
      unresolved.push({
        rank,
        title_en: en.song_title,
        title_kr: kr.song_title,
      });
    } else {
      upsertAlias(aliasMap, aliasConflicts, kr.song_title, canonical);
      if (normalizeSongName(en.song_title) !== normalizeSongName(canonical)) {
        upsertAlias(aliasMap, aliasConflicts, en.song_title, canonical);
      }
    }

    expandedRows.push({
      rank,
      title_en: en.song_title,
      artist_en: en.artist || '',
      title_kr: kr.song_title,
      artist_kr: kr.artist || '',
      canonical_title: canonical || null,
    });
  }

  if (aliasConflicts.length > 0) {
    throw new Error(`Alias conflicts detected (${aliasConflicts.length})`);
  }
  if (unresolved.length > 0) {
    console.error('Unresolved entries:', unresolved.slice(0, 50));
    throw new Error(`Unresolved canonical mappings: ${unresolved.length}`);
  }

  fs.mkdirSync(opts.outDir, { recursive: true });

  const topSongsPath = path.join(
    opts.outDir,
    `piugame-top-songs-${opts.date}-${opts.mode}.json`
  );
  const aliasesPath = path.join(opts.outDir, 'piugame-song-aliases.json');

  const topSongsPayload = {
    generated_at: generatedAt,
    source: {
      site: 'https://www.piugame.com/leaderboard/top_songs.php',
      date: String(opts.date),
      mode: String(opts.mode),
      locale_pair: ['en', 'kr'],
    },
    total_songs: expandedRows.length,
    songs: expandedRows,
  };

  const aliasesPayload = {
    generated_at: generatedAt,
    source: {
      site: 'https://www.piugame.com/leaderboard/top_songs.php',
      date: String(opts.date),
      mode: String(opts.mode),
    },
    stats: {
      total_pairs: expandedRows.length,
      total_aliases: aliasMap.size,
      unresolved: unresolved.length,
    },
    aliases: toSortedObject(aliasMap),
  };

  fs.writeFileSync(topSongsPath, `${JSON.stringify(topSongsPayload, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(aliasesPath, `${JSON.stringify(aliasesPayload, null, 2)}\n`, 'utf-8');

  console.log(`Saved ${expandedRows.length} expanded songs -> ${topSongsPath}`);
  console.log(`Saved ${aliasMap.size} aliases -> ${aliasesPath}`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

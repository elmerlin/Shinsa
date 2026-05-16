#!/usr/bin/env node
/**
 * Backfill the songs catalog from user_recently_played.
 *
 * For every (song_title, mode, level) tuple that's been played but isn't
 * in the songs table:
 *   1. Download the piugame.com jacket from the play row's background_url
 *      into /opt/Shinsa/client/public/jackets/pump/<hash>.png
 *   2. Insert a row in songs with the Shinsa-hosted path as jacket_url.
 *
 * The hash dedupes jackets that multiple chart variants share (Single 12
 * and Double 22 of the same song reuse one image), so we download each
 * piugame URL once even if it backs many charts.
 *
 * Run on prod:
 *   node server/scripts/backfill-songs-catalog.js          # dry run
 *   node server/scripts/backfill-songs-catalog.js --apply  # do the writes
 *
 * Re-run mobile/scripts/sync-jackets.sh locally afterwards so the new
 * jackets land in the next APK release.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || '/var/data/shinsa/shinsa.db';
const JACKETS_DIR = process.env.JACKETS_DIR || '/opt/Shinsa/client/public/jackets/pump';
const JACKET_URL_PREFIX = '/jackets/pump';
const APPLY = process.argv.includes('--apply');
const MAX_PARALLEL_DOWNLOADS = 4;

function normalizeMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'single' || m === 'singles' || m === 's') return 'Single';
  if (m === 'double' || m === 'doubles' || m === 'd') return 'Double';
  if (m === 'coop' || m === 'co-op' || m === 'co op' || m === 'cooperative' || m === 'c') return 'CoOp';
  return String(mode || '').trim();
}

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 15000 }, (res) => {
      // Follow one redirect — piugame occasionally 30x's.
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        downloadToBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    request.on('error', reject);
    request.on('timeout', () => { request.destroy(new Error('timeout')); });
  });
}

function detectExt(url, buf) {
  // Trust the URL extension first, fall back to magic bytes if missing.
  const m = String(url).match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'gif';
  return 'png';
}

async function ensureJacket(bgUrl, cache, stats) {
  if (cache.has(bgUrl)) return cache.get(bgUrl);
  try {
    const buf = await downloadToBuffer(bgUrl);
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
    const ext = detectExt(bgUrl, buf);
    const filename = `${hash}.${ext}`;
    const filepath = path.join(JACKETS_DIR, filename);
    const localPath = `${JACKET_URL_PREFIX}/${filename}`;
    if (APPLY) {
      if (!fs.existsSync(filepath)) {
        fs.mkdirSync(JACKETS_DIR, { recursive: true });
        fs.writeFileSync(filepath, buf);
        stats.imagesWritten++;
      } else {
        stats.imagesDeduped++;
      }
    } else {
      stats.imagesPlanned++;
    }
    cache.set(bgUrl, localPath);
    return localPath;
  } catch (err) {
    cache.set(bgUrl, null);
    stats.imageFailures.push({ bgUrl, error: err.message });
    return null;
  }
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN'} (pass --apply to commit)`);
  console.log(`db: ${DB_PATH}`);
  console.log(`jackets dir: ${JACKETS_DIR}`);

  const db = new Database(DB_PATH, { readonly: !APPLY });

  // The lookup mirrors what enrichment uses: TRIM(title) + normalize Co-op.
  // Limited to plays that have a usable background_url — without it we
  // have no jacket source for the new row.
  const rows = db.prepare(`
    SELECT
      TRIM(urp.song_title) AS title,
      CASE
        WHEN LOWER(REPLACE(REPLACE(urp.mode,'-',''),' ','')) IN ('coop','cooperative') THEN 'CoOp'
        WHEN LOWER(urp.mode) IN ('single','singles','s') THEN 'Single'
        WHEN LOWER(urp.mode) IN ('double','doubles','d') THEN 'Double'
        ELSE urp.mode
      END AS norm_mode,
      urp.level AS level,
      urp.background_url AS background_url,
      COUNT(*) AS play_count
    FROM user_recently_played urp
    LEFT JOIN songs s
      ON TRIM(s.title) = TRIM(urp.song_title)
      AND s.mode = (CASE
        WHEN LOWER(REPLACE(REPLACE(urp.mode,'-',''),' ','')) IN ('coop','cooperative') THEN 'CoOp'
        WHEN LOWER(urp.mode) IN ('single','singles','s') THEN 'Single'
        WHEN LOWER(urp.mode) IN ('double','doubles','d') THEN 'Double'
        ELSE urp.mode
      END)
      AND s.level = urp.level
    WHERE s.id IS NULL
      AND urp.background_url LIKE 'http%'
      AND urp.song_title != ''
      AND urp.mode != ''
      AND urp.level > 0
    GROUP BY TRIM(urp.song_title), norm_mode, urp.level, urp.background_url
    ORDER BY play_count DESC
  `).all();

  console.log(`\nFound ${rows.length} missing charts with downloadable jackets.\n`);

  const stats = {
    inserted: 0,
    skippedExisting: 0,
    skippedNoJacket: 0,
    imagesWritten: 0,
    imagesDeduped: 0,
    imagesPlanned: 0,
    imageFailures: [],
  };

  const jacketCache = new Map(); // bgUrl → local path
  const insertStmt = db.prepare(`
    INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key, flags)
    VALUES (?, '', ?, ?, ?, '', '', '')
  `);
  const dupCheckStmt = db.prepare(`
    SELECT id FROM songs WHERE TRIM(title) = ? AND mode = ? AND level = ? LIMIT 1
  `);

  // Process in small batches so we don't hammer piugame with 600 parallel reqs.
  for (let i = 0; i < rows.length; i += MAX_PARALLEL_DOWNLOADS) {
    const batch = rows.slice(i, i + MAX_PARALLEL_DOWNLOADS);
    // Download (or look up cached) jackets in parallel.
    await Promise.all(batch.map((row) => ensureJacket(row.background_url, jacketCache, stats)));

    // Insert sequentially so SQLite WAL stays happy.
    for (const row of batch) {
      const localPath = jacketCache.get(row.background_url);
      if (!localPath) {
        stats.skippedNoJacket++;
        continue;
      }
      const existing = dupCheckStmt.get(row.title, row.norm_mode, row.level);
      if (existing) {
        stats.skippedExisting++;
        continue;
      }
      if (APPLY) {
        try {
          insertStmt.run(row.title, localPath, row.norm_mode, row.level);
          stats.inserted++;
        } catch (err) {
          stats.imageFailures.push({ row: `${row.title} ${row.norm_mode} ${row.level}`, error: err.message });
        }
      } else {
        stats.inserted++; // planned insert
      }
    }
    if (i % 40 === 0 && i > 0) {
      process.stdout.write(`  ${i}/${rows.length} processed (${stats.inserted} ${APPLY ? 'inserted' : 'planned'})\n`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${APPLY ? 'INSERTED' : 'WOULD INSERT'}: ${stats.inserted} song rows`);
  console.log(`${APPLY ? 'NEW JACKET FILES' : 'PLANNED JACKET DOWNLOADS'}: ${APPLY ? stats.imagesWritten : stats.imagesPlanned}`);
  console.log(`DEDUPED JACKETS: ${stats.imagesDeduped} (already on disk)`);
  console.log(`SKIPPED — already in catalog: ${stats.skippedExisting}`);
  console.log(`SKIPPED — jacket download failed: ${stats.skippedNoJacket}`);
  console.log(`UNIQUE PIUGAME URLS: ${jacketCache.size}`);
  if (stats.imageFailures.length > 0) {
    console.log(`\nFailures (first 10):`);
    stats.imageFailures.slice(0, 10).forEach((f) => console.log(`  ${JSON.stringify(f)}`));
    if (stats.imageFailures.length > 10) console.log(`  ... and ${stats.imageFailures.length - 10} more`);
  }
  if (!APPLY) {
    console.log(`\nDry run — re-run with --apply to commit.`);
  } else {
    console.log(`\nDone. Re-run mobile/scripts/sync-jackets.sh locally to pull the new jackets into the next APK.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

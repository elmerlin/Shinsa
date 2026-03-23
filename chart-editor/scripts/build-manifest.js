/**
 * Build a manifest.json from all .ssc files in public/presets/
 * Extracts metadata (title, artist) and chart headers (type, difficulty, meter)
 * without parsing note data.
 *
 * Run: node scripts/build-manifest.js
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, '..', 'public', 'presets');
const PUMP_JSON = join(__dirname, '..', '..', 'pump-phoenix.json');

function parseTagSection(text) {
  const result = {};
  const tagRegex = /#([A-Z]+):([\s\S]*?);/g;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    result[match[1].toLowerCase()] = match[2].trim();
  }
  return result;
}

function parseBPM(text) {
  if (!text) return 120;
  const first = text.split(',')[0];
  const [, bpm] = (first || '').split('=');
  return parseFloat(bpm) || 120;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function loadJacketMap() {
  try {
    const data = JSON.parse(await readFile(PUMP_JSON, 'utf-8'));
    const map = {};
    for (const song of data.songs || []) {
      if (song.jacket) {
        map[normalize(song.name)] = `/jackets/${song.jacket}`;
      }
    }
    return map;
  } catch {
    console.warn('Could not load pump-phoenix.json for jacket mapping');
    return {};
  }
}

async function buildManifest() {
  const jacketMap = await loadJacketMap();
  const packs = [];

  // Scan pack directories
  const packDirs = await readdir(PRESETS_DIR, { withFileTypes: true });

  for (const packDir of packDirs) {
    if (!packDir.isDirectory()) continue;

    const packName = packDir.name;
    const packPath = join(PRESETS_DIR, packName);
    const files = await readdir(packPath);
    const sscFiles = files.filter(f => f.endsWith('.ssc')).sort();

    const songs = [];

    for (const file of sscFiles) {
      try {
        const content = await readFile(join(packPath, file), 'utf-8');
        const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Parse global metadata
        const notedataSplit = normalized.split(/^#NOTEDATA:;?\s*$/m);
        const globalTags = parseTagSection(notedataSplit[0]);
        const chartSections = notedataSplit.slice(1);

        const title = globalTags.title || file.replace('.ssc', '');
        const artist = globalTags.artist || '';
        const bpm = parseBPM(globalTags.bpms);

        // Parse chart headers (skip note data)
        const charts = chartSections.map(section => {
          const tags = parseTagSection(section);
          return {
            type: tags.stepstype || 'pump-single',
            difficulty: tags.difficulty || 'Edit',
            meter: parseInt(tags.meter) || 1,
          };
        }).sort((a, b) => {
          // Sort: singles first, then doubles, then by meter
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          return a.meter - b.meter;
        });

        if (charts.length > 0) {
          const music = globalTags.music || '';
          const entry = {
            title,
            artist,
            bpm: Math.round(bpm),
            file: `${packName}/${file}`,
            charts,
          };
          if (music) entry.music = `${packName}/audio/${music}`;
          // Look up jacket
          const jacket = jacketMap[normalize(title)];
          if (jacket) entry.jacket = jacket;
          songs.push(entry);
        }
      } catch (err) {
        console.error(`Failed to parse ${file}:`, err.message);
      }
    }

    // Sort songs by title
    songs.sort((a, b) => a.title.localeCompare(b.title));

    if (songs.length > 0) {
      packs.push({ name: packName, songs });
    }
  }

  const manifest = { packs };
  const outPath = join(PRESETS_DIR, 'manifest.json');
  await writeFile(outPath, JSON.stringify(manifest, null, 2));

  const totalSongs = packs.reduce((sum, p) => sum + p.songs.length, 0);
  const totalCharts = packs.reduce((sum, p) => sum + p.songs.reduce((s, song) => s + song.charts.length, 0), 0);
  console.log(`Built manifest: ${packs.length} packs, ${totalSongs} songs, ${totalCharts} charts`);
  console.log(`Written to: ${outPath}`);
}

buildManifest().catch(err => {
  console.error('Failed to build manifest:', err);
  process.exit(1);
});

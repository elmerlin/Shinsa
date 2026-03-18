const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { ensureBuiltInAchievementSeries } = require('../lib/achievements');
const { normalizePiugamePlayedAtUtc } = require('../lib/piugameDate');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shinsa.db');
const SONG_ALIAS_PATH = path.join(__dirname, '..', 'data', 'piugame-song-aliases.json');
const PIUCENTER_DURATION_PATH = path.join(__dirname, '..', 'data', 'piucenter-song-durations.json');

// Shared singleton connection — reused across all requests
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function getDb() {
  return db;
}

function normalizeShoeText(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeSongTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSongLookupName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function compactSongLookupKey(value) {
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

const SONG_DURATION_OVERRIDE_MAP = new Map([
  [`${compactSongLookupKey('Nyarlathotep')}|${compactSongLookupKey('Nato')}`, {
    duration_seconds: 120,
    duration_source: 'manual',
  }],
  [`${compactSongLookupKey('Start On Red')}|${compactSongLookupKey('Nato')}`, {
    duration_seconds: 116,
    duration_source: 'manual',
  }],
]);

function parseSongFlags(flags) {
  if (Array.isArray(flags)) {
    return flags
      .map((flag) => String(flag || '').trim())
      .filter(Boolean);
  }
  return String(flags || '')
    .split(',')
    .map((flag) => flag.trim())
    .filter(Boolean);
}

function resolveSongTitleForStorage(title, songKey, flags) {
  const normalizedTitle = normalizeSongTitle(title);
  if (!normalizedTitle) return '';
  const normalizedFlags = parseSongFlags(flags).map((flag) => flag.toLowerCase());
  const shortCutSuffixPattern = /\s*-\s*SHORT CUT\s*-\s*$/i;
  if (shortCutSuffixPattern.test(normalizedTitle)) {
    return normalizedTitle.replace(shortCutSuffixPattern, ' - SHORT CUT -');
  }

  const isShortCut = normalizedFlags.includes('cut:1')
    || (
      normalizedTitle.toLowerCase() === 'yog-sothoth'
      && String(songKey || '').trim() === '313'
    );

  if (isShortCut) {
    return `${normalizedTitle} - SHORT CUT -`;
  }

  return normalizedTitle;
}

function loadSongAliases() {
  if (!fs.existsSync(SONG_ALIAS_PATH)) return {};
  try {
    const payload = JSON.parse(fs.readFileSync(SONG_ALIAS_PATH, 'utf-8'));
    const rawAliases = (payload && typeof payload.aliases === 'object' && payload.aliases) || {};
    const normalized = {};
    for (const [alias, canonical] of Object.entries(rawAliases)) {
      const aliasNorm = normalizeSongLookupName(alias);
      const canonicalNorm = normalizeSongLookupName(canonical);
      if (!aliasNorm || !canonicalNorm || aliasNorm === canonicalNorm) continue;
      if (!normalized[aliasNorm]) normalized[aliasNorm] = canonicalNorm;
    }
    return normalized;
  } catch {
    return {};
  }
}

function toCanonicalSongName(title, aliases) {
  let normalized = normalizeSongLookupName(title);
  if (!normalized) return '';
  const seen = new Set();
  while (aliases[normalized] && !seen.has(normalized)) {
    seen.add(normalized);
    normalized = aliases[normalized];
  }
  return normalized;
}

function buildSongDurationGroupKey(row, aliases) {
  const songKey = String(row?.song_key || '').trim();
  if (songKey) return `song_key:${songKey}`;

  const resolvedTitle = resolveSongTitleForStorage(row?.title || '', row?.song_key || '', row?.flags || '');
  const canonicalTitle = toCanonicalSongName(resolvedTitle, aliases);
  const titleKey = compactSongLookupKey(canonicalTitle || resolvedTitle);
  const artistKey = compactSongLookupKey(row?.artist || '');
  return `${titleKey}|${artistKey}`;
}

function backfillSongDurationsFromSnapshot() {
  const songColumns = db.prepare("PRAGMA table_info(songs)").all().map((column) => column.name);
  if (!songColumns.includes('duration_seconds')) return;
  if (!fs.existsSync(PIUCENTER_DURATION_PATH)) return;

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(PIUCENTER_DURATION_PATH, 'utf-8'));
  } catch (err) {
    console.error('Failed to read piucenter-song-durations.json:', err.message);
    return;
  }

  const sourceSongs = Array.isArray(payload?.songs) ? payload.songs : [];
  if (sourceSongs.length === 0) return;

  const aliases = loadSongAliases();
  const exactMatches = new Map();
  const titleBuckets = new Map();

  for (const row of sourceSongs) {
    const durationSeconds = parseInt(row?.duration_seconds, 10) || 0;
    if (durationSeconds <= 0) continue;

    const canonicalTitle = toCanonicalSongName(
      row?.canonical_title || row?.title || '',
      aliases
    );
    const titleKey = compactSongLookupKey(row?.compact_title || canonicalTitle || row?.title || '');
    if (!titleKey) continue;

    const artistKey = compactSongLookupKey(row?.compact_artist || row?.canonical_artist || row?.artist || '');
    const snapshotRow = {
      duration_seconds: durationSeconds,
      duration_source: 'piucenter',
      titleKey,
      artistKey,
    };

    if (artistKey) {
      const exactKey = `${titleKey}|${artistKey}`;
      if (!exactMatches.has(exactKey)) exactMatches.set(exactKey, snapshotRow);
    }

    if (!titleBuckets.has(titleKey)) titleBuckets.set(titleKey, []);
    titleBuckets.get(titleKey).push(snapshotRow);
  }

  const uniqueTitleMatches = new Map();
  for (const [titleKey, rows] of titleBuckets.entries()) {
    const uniqueArtistRows = [];
    const seenArtists = new Set();
    for (const row of rows) {
      const key = `${row.titleKey}|${row.artistKey}`;
      if (seenArtists.has(key)) continue;
      seenArtists.add(key);
      uniqueArtistRows.push(row);
    }
    if (uniqueArtistRows.length === 1) {
      uniqueTitleMatches.set(titleKey, uniqueArtistRows[0]);
    }
  }

  const songRows = db.prepare(`
    SELECT id, title, artist, song_key, flags, duration_seconds, duration_source
    FROM songs
    ORDER BY id ASC
  `).all();
  if (songRows.length === 0) return;

  const groups = new Map();
  for (const row of songRows) {
    const groupKey = buildSongDurationGroupKey(row, aliases);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        ids: [],
        titleKey: compactSongLookupKey(toCanonicalSongName(
          resolveSongTitleForStorage(row.title || '', row.song_key || '', row.flags || ''),
          aliases
        ) || row.title || ''),
        artistKey: compactSongLookupKey(row.artist || ''),
        existingDuration: 0,
        existingSource: '',
      });
    }
    const group = groups.get(groupKey);
    group.ids.push(parseInt(row.id, 10) || 0);
    const durationSeconds = parseInt(row.duration_seconds, 10) || 0;
    if (durationSeconds > 0 && group.existingDuration <= 0) {
      group.existingDuration = durationSeconds;
      group.existingSource = String(row.duration_source || '').trim();
    }
  }

  const updateStmt = db.prepare(`
    UPDATE songs
    SET duration_seconds = ?,
        duration_source = ?,
        duration_updated_at = datetime('now')
    WHERE id = ?
      AND (
        COALESCE(duration_seconds, -1) <> ?
        OR COALESCE(duration_source, '') <> ?
      )
  `);

  const apply = db.transaction(() => {
    let seededGroups = 0;
    let overriddenGroups = 0;
    let syncedRows = 0;

    for (const group of groups.values()) {
      let durationSeconds = group.existingDuration;
      let durationSource = group.existingSource || 'manual';
      const overrideRow = SONG_DURATION_OVERRIDE_MAP.get(`${group.titleKey}|${group.artistKey}`) || null;

      if (overrideRow) {
        durationSeconds = overrideRow.duration_seconds;
        durationSource = overrideRow.duration_source || 'manual';
        overriddenGroups++;
      } else if (durationSeconds <= 0) {
        const snapshotRow = exactMatches.get(`${group.titleKey}|${group.artistKey}`)
          || uniqueTitleMatches.get(group.titleKey);
        if (!snapshotRow) continue;
        durationSeconds = snapshotRow.duration_seconds;
        durationSource = snapshotRow.duration_source || 'piucenter';
        seededGroups++;
      }

      for (const id of group.ids) {
        const result = updateStmt.run(durationSeconds, durationSource, id, durationSeconds, durationSource);
        syncedRows += result.changes;
      }
    }

    return { seededGroups, overriddenGroups, syncedRows };
  });

  try {
    const result = apply();
    if (result.seededGroups > 0 || result.overriddenGroups > 0 || result.syncedRows > 0) {
      console.log(
        `Backfilled song durations for ${result.seededGroups} groups with ${result.overriddenGroups} manual overrides `
        + `(${result.syncedRows} chart rows synced)`
      );
    }
  } catch (err) {
    console.error('Failed to backfill song durations:', err.message);
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLegacyShoeModel(makeValue, modelValue) {
  const make = normalizeShoeText(makeValue, 80);
  const modelTextRaw = normalizeShoeText(modelValue, 80);
  const modelText = make
    ? normalizeShoeText(
      modelTextRaw.replace(new RegExp(`^${escapeRegExp(make)}\\s+`, 'i'), ''),
      80
    )
    : modelTextRaw;
  if (!modelText) return { model: '', colorway: '' };

  const parenMatch = modelText.match(/^(.+?)\s*\(([^()]{2,})\)\s*$/);
  if (parenMatch) {
    return {
      model: normalizeShoeText(parenMatch[1], 80),
      colorway: normalizeShoeText(parenMatch[2], 80),
    };
  }

  for (const separator of [' - ', ' | ', ' / ', ' — ', ' – ']) {
    const idx = modelText.indexOf(separator);
    if (idx <= 0) continue;
    const left = normalizeShoeText(modelText.slice(0, idx), 80);
    const right = normalizeShoeText(modelText.slice(idx + separator.length), 80);
    if (left && right) return { model: left, colorway: right };
  }

  const knownByMake = [
    {
      makeRegex: /^nike$/i,
      models: ['Free RN 2018', 'Free Run 5.0'],
    },
  ];
  const makeNormalized = make.toLowerCase();
  for (const group of knownByMake) {
    if (!group.makeRegex.test(makeNormalized)) continue;
    for (const canonicalModel of group.models) {
      const re = new RegExp(`^${escapeRegExp(canonicalModel)}\\s+(.+)$`, 'i');
      const match = modelText.match(re);
      if (!match) continue;
      const colorway = normalizeShoeText(match[1], 80);
      if (colorway) {
        return { model: canonicalModel, colorway };
      }
    }
  }

  return { model: modelText, colorway: '' };
}

function chartModeLevelFromJson(chart) {
  if (!chart || typeof chart !== 'object') return null;
  const diffClass = String(chart.diffClass || '').trim().toUpperCase();
  const style = String(chart.style || '').trim().toLowerCase();

  if ((diffClass === 'S' || diffClass === 'D') && style === 'solo') {
    return {
      mode: diffClass === 'S' ? 'Single' : 'Double',
      level: parseInt(chart.lvl, 10) || 0,
    };
  }

  if (style === 'coop' && /^C[2-5]$/.test(diffClass)) {
    // PIU co-op charts encode player count in diff class (C2..C5).
    return {
      mode: 'CoOp',
      level: parseInt(diffClass.slice(1), 10) || 0,
    };
  }

  return null;
}

function ensureCoOpChartsFromJson() {
  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  if (!fs.existsSync(jsonPath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const songs = Array.isArray(data?.songs) ? data.songs : [];
    if (songs.length === 0) return;

    const existingRows = db.prepare(`
      SELECT title, artist, level, song_key
      FROM songs
      WHERE mode = 'CoOp'
    `).all();
    const existing = new Set(
      existingRows.map((row) => `${row.title}||${row.artist || ''}||${parseInt(row.level, 10) || 0}||${row.song_key || ''}`)
    );

    const insertSong = db.prepare(`
      INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key, flags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMissing = db.transaction((songList) => {
      let inserted = 0;
      for (const song of songList) {
        const jacketUrl = song.jacket ? `/jackets/${song.jacket}` : '';
        const flags = Array.isArray(song.flags) ? song.flags.join(',') : (song.flags || '');
        const songName = resolveSongTitleForStorage(song.name || '', song.saIndex || '', song.flags || '');
        const artist = song.artist || '';
        const songKey = song.saIndex || '';

        for (const chart of (song.charts || [])) {
          const mapped = chartModeLevelFromJson(chart);
          if (!mapped || mapped.mode !== 'CoOp' || mapped.level <= 0) continue;

          const key = `${songName}||${artist}||${mapped.level}||${songKey}`;
          if (existing.has(key)) continue;

          insertSong.run(
            songName,
            artist,
            jacketUrl,
            'CoOp',
            mapped.level,
            song.bpm || '',
            songKey,
            flags
          );
          existing.add(key);
          inserted++;
        }
      }
      return inserted;
    });

    const inserted = insertMissing(songs);
    if (inserted > 0) {
      console.log(`Added ${inserted} missing CoOp charts from pump-phoenix.json`);
    }
  } catch (err) {
    console.error('Failed to backfill CoOp charts from pump-phoenix.json:', err.message);
  }
}

function bootstrapChartTiersFromSnapshotIfEmpty() {
  let tierCount = 0;
  try {
    tierCount = db.prepare("SELECT COUNT(*) as c FROM chart_tiers WHERE tier_list_type = 'Pass'").get().c || 0;
  } catch {
    return;
  }
  if (tierCount > 0) return;

  const snapshotPath = path.join(__dirname, '..', 'data', 'piuscores-tier-pass.json');
  if (!fs.existsSync(snapshotPath)) return;

  try {
    const payload = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    const levels = Array.isArray(payload?.levels) ? payload.levels : [];
    if (levels.length === 0) return;

    const rows = [];
    for (const levelRow of levels) {
      for (const row of (levelRow?.rows || [])) {
        rows.push({
          tier_list_type: 'Pass',
          mode: String(row.mode || ''),
          level: parseInt(row.level, 10) || 0,
          tier_name: String(row.tier_name || ''),
          tier_rank: parseInt(row.tier_rank, 10) || 0,
          chart_id: parseInt(row.chart_id, 10) || 0,
          source_slug: String(row.source_slug || ''),
          source_url: String(row.source_url || ''),
        });
      }
    }
    if (rows.length === 0) return;

    const existingCharts = new Map(
      db.prepare('SELECT id, mode, level FROM songs').all().map((row) => [parseInt(row.id, 10), row])
    );

    const clearStmt = db.prepare("DELETE FROM chart_tiers WHERE tier_list_type = 'Pass'");
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tier_list_type, mode, level, chart_id)
      DO UPDATE SET
        tier_name = excluded.tier_name,
        tier_rank = excluded.tier_rank,
        source_slug = excluded.source_slug,
        source_url = excluded.source_url
    `);

    const bootstrap = db.transaction((tierRows) => {
      clearStmt.run();
      let inserted = 0;
      let skipped = 0;
      for (const row of tierRows) {
        const chart = existingCharts.get(row.chart_id);
        if (!chart) {
          skipped++;
          continue;
        }
        const chartMode = String(chart.mode || '');
        const chartLevel = parseInt(chart.level, 10) || 0;
        if (chartMode !== row.mode || chartLevel !== row.level) {
          skipped++;
          continue;
        }

        insertStmt.run(
          row.tier_list_type,
          row.mode,
          row.level,
          row.tier_name,
          row.tier_rank,
          row.chart_id,
          row.source_slug,
          row.source_url
        );
        inserted++;
      }
      return { inserted, skipped };
    });

    const result = bootstrap(rows);
    if (result.inserted > 0) {
      console.log(`Bootstrapped ${result.inserted} chart_tiers rows from snapshot (${result.skipped} skipped)`);
    }
  } catch (err) {
    console.error('Failed to bootstrap chart tiers from snapshot:', err.message);
  }
}

function bootstrapSongsFromJsonIfEmpty() {
  const songCount = db.prepare('SELECT COUNT(*) as c FROM songs').get();
  if (songCount.c > 0) return;

  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  if (!fs.existsSync(jsonPath)) {
    console.warn('Song bootstrap skipped: pump-phoenix.json not found');
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const songs = Array.isArray(data?.songs) ? data.songs : [];
    if (songs.length === 0) return;

    const insertSong = db.prepare(`
      INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key, flags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction((songList) => {
      let inserted = 0;
      for (const song of songList) {
        const jacketUrl = song.jacket ? `/jackets/${song.jacket}` : '';
        const flags = Array.isArray(song.flags) ? song.flags.join(',') : (song.flags || '');
        const songTitle = resolveSongTitleForStorage(song.name || '', song.saIndex || '', song.flags || '');

        for (const chart of (song.charts || [])) {
          const mapped = chartModeLevelFromJson(chart);
          if (!mapped || mapped.level <= 0 || mapped.mode === 'CoOp') continue;
          insertSong.run(
            songTitle,
            song.artist || '',
            jacketUrl,
            mapped.mode,
            mapped.level,
            song.bpm || '',
            song.saIndex || '',
            flags
          );
          inserted++;
        }
      }
      return inserted;
    });

    const inserted = insertAll(songs);
    if (inserted > 0) {
      console.log(`Bootstrapped ${inserted} charts from pump-phoenix.json`);
    }
  } catch (err) {
    console.error('Failed to bootstrap songs from pump-phoenix.json:', err.message);
  }
}

function backfillLegacyGroupedNewClears() {
  let clearCols = [];
  try {
    clearCols = db.prepare("PRAGMA table_info(user_new_clears)").all().map(c => c.name);
  } catch {
    return;
  }
  if (!clearCols.includes('clears_json')) return;

  const legacyRows = db.prepare(`
    SELECT nc.id, nc.user_id, nc.song_title, nc.mode, nc.level, nc.score, nc.grade, nc.plate, nc.background_url, nc.created_at,
           CAST(strftime('%s', datetime(nc.created_at)) AS INTEGER) as created_ts,
           (SELECT COUNT(*) FROM new_clear_pumps p WHERE p.clear_id = nc.id) as pump_count,
           (SELECT COUNT(*) FROM new_clear_comments c WHERE c.clear_id = nc.id) as comment_count
    FROM user_new_clears nc
    WHERE nc.clears_json IS NULL OR TRIM(nc.clears_json) = ''
    ORDER BY nc.user_id ASC, datetime(nc.created_at) ASC, nc.id ASC
  `).all();
  if (legacyRows.length === 0) return;

  const GROUP_WINDOW_SECONDS = 3;
  const groupUpdates = [];
  const deleteIds = [];

  const normalize = (row) => ({
    song_title: row.song_title || '',
    mode: row.mode || 'Single',
    level: parseInt(row.level) || 0,
    score: parseInt(row.score) || 0,
    grade: row.grade || '',
    plate: row.plate || '',
    background_url: row.background_url || '',
  });

  const finalizeGroup = (rows) => {
    if (rows.length < 2) return;
    const payload = rows.map(normalize);
    const first = payload[0];
    const survivor = rows[rows.length - 1];

    groupUpdates.push({
      id: survivor.id,
      song_title: first.song_title,
      mode: first.mode,
      level: first.level,
      score: first.score,
      grade: first.grade,
      plate: first.plate,
      background_url: first.background_url,
      clears_json: JSON.stringify(payload),
    });

    for (let i = 0; i < rows.length - 1; i++) {
      deleteIds.push(rows[i].id);
    }
  };

  let candidate = [];
  let prev = null;
  for (const row of legacyRows) {
    const hasEngagement = (row.pump_count || 0) > 0 || (row.comment_count || 0) > 0;
    if (hasEngagement) {
      finalizeGroup(candidate);
      candidate = [];
      prev = null;
      continue;
    }

    if (candidate.length === 0) {
      candidate = [row];
      prev = row;
      continue;
    }

    const sameUser = row.user_id === prev.user_id;
    const gap = (row.created_ts || 0) - (prev.created_ts || 0);
    const inWindow = sameUser && gap >= 0 && gap <= GROUP_WINDOW_SECONDS;

    if (inWindow) {
      candidate.push(row);
    } else {
      finalizeGroup(candidate);
      candidate = [row];
    }
    prev = row;
  }
  finalizeGroup(candidate);

  const applyBackfill = db.transaction(() => {
    const updateGrouped = db.prepare(`
      UPDATE user_new_clears
      SET song_title = ?, mode = ?, level = ?, score = ?, grade = ?, plate = ?, background_url = ?, clears_json = ?
      WHERE id = ?
    `);
    for (const g of groupUpdates) {
      updateGrouped.run(g.song_title, g.mode, g.level, g.score, g.grade, g.plate, g.background_url, g.clears_json, g.id);
    }

    if (deleteIds.length > 0) {
      const placeholders = deleteIds.map(() => '?').join(', ');
      db.prepare(`DELETE FROM user_new_clears WHERE id IN (${placeholders})`).run(...deleteIds);
    }

    const remainingLegacyRows = db.prepare(`
      SELECT id, song_title, mode, level, score, grade, plate, background_url
      FROM user_new_clears
      WHERE clears_json IS NULL OR TRIM(clears_json) = ''
      ORDER BY id ASC
    `).all();

    const fillSingle = db.prepare('UPDATE user_new_clears SET clears_json = ? WHERE id = ?');
    for (const row of remainingLegacyRows) {
      fillSingle.run(JSON.stringify([normalize(row)]), row.id);
    }

    return {
      grouped_posts: groupUpdates.length,
      merged_rows: deleteIds.length,
      singles_backfilled: remainingLegacyRows.length,
    };
  });

  const result = applyBackfill();
  if (result.grouped_posts > 0 || result.singles_backfilled > 0) {
    console.log(
      `Backfilled legacy clear posts: grouped ${result.grouped_posts} posts (merged ${result.merged_rows} rows), normalized ${result.singles_backfilled} single posts`
    );
  }
}

function bootstrapChangelogEntriesIfEmpty() {
  let count = 0;
  try {
    count = db.prepare('SELECT COUNT(*) AS c FROM changelog_entries').get()?.c || 0;
  } catch {
    return;
  }
  if (count > 0) return;

  const seedEntries = [
    {
      title: 'Profile rankings now highlight both people correctly',
      content: '(you) now always points to your own account, even on someone else\'s profile. The profile owner is still highlighted separately so both positions are clear.',
      pinned: 1,
    },
    {
      title: 'Skill Breakdown radar chart now uses better scaling',
      content: 'Radar values are now normalized from AA (900,000) to 1,000,000 so high-level score differences are easier to see.',
      pinned: 0,
    },
    {
      title: 'List song suggestions now scroll properly on mobile',
      content: 'The suggestion box now adapts to available viewport space and stays above the bottom mobile nav, so lower chart options remain selectable.',
      pinned: 0,
    },
    {
      title: 'Pass target behavior in Lists is fixed',
      content: 'If a song was already passed before being added with target Pass, it no longer auto-completes at 0 attempts. It now completes only after a new pass while in the list.',
      pinned: 0,
    },
    {
      title: 'Shoes tab now has an empty-state call to action',
      content: 'When your shoe cabinet is empty on your profile, you now see an Add your first shoe button.',
      pinned: 0,
    },
  ];

  const insert = db.prepare(`
    INSERT INTO changelog_entries (id, title, content, pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const applySeed = db.transaction((rows) => {
    rows.forEach((entry) => {
      insert.run(randomUUID(), entry.title, entry.content, entry.pinned ? 1 : 0);
    });
  });
  applySeed(seedEntries);
}

function initializeDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      date TEXT,
      phase TEXT DEFAULT 'SETUP',
      current_round INT DEFAULT 0,
      total_rounds INT DEFAULT 3,
      config TEXT DEFAULT '{}',
      avatar TEXT DEFAULT '',
      archived INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      name TEXT NOT NULL,
      skill_title TEXT DEFAULT '',
      skill_level INT DEFAULT 1,
      pumbility INT DEFAULT 0,
      description TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      wins INT DEFAULT 0,
      losses INT DEFAULT 0,
      points INT DEFAULT 0,
      buchholz REAL DEFAULT 0,
      seed_rank INT DEFAULT 0,
      is_active INT DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      jacket_url TEXT DEFAULT '',
      mode TEXT NOT NULL,
      level INT NOT NULL,
      bpm TEXT DEFAULT '',
      song_key TEXT DEFAULT '',
      flags TEXT DEFAULT '',
      duration_seconds INTEGER DEFAULT NULL,
      duration_source TEXT DEFAULT '',
      duration_updated_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS chart_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier_list_type TEXT NOT NULL DEFAULT 'Pass',
      mode TEXT NOT NULL,
      level INT NOT NULL,
      tier_name TEXT NOT NULL,
      tier_rank INT NOT NULL DEFAULT 0,
      chart_id INTEGER NOT NULL,
      source_slug TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (chart_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chart_skills (
      chart_id INTEGER NOT NULL,
      skill_slug TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (chart_id, skill_slug),
      FOREIGN KEY (chart_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      round_number INT NOT NULL,
      player1_id TEXT,
      player2_id TEXT,
      winner_id TEXT,
      difficulty_min INT,
      difficulty_max INT,
      is_bye INT DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      drawn_songs TEXT DEFAULT '[]',
      vetoed_songs TEXT DEFAULT '[]',
      played_songs TEXT DEFAULT '[]',
      scores TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (player1_id) REFERENCES players(id),
      FOREIGN KEY (player2_id) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      pinned INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS changelog_entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      pinned INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS duels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      date TEXT DEFAULT '',
      time TEXT DEFAULT '',
      mode TEXT DEFAULT 'both',
      player1_name TEXT NOT NULL,
      player2_name TEXT NOT NULL,
      player1_avatar TEXT DEFAULT '',
      player2_avatar TEXT DEFAULT '',
      creator_user_id TEXT DEFAULT '',
      status TEXT DEFAULT 'ACTIVE',
      winner TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS duel_songs (
      id TEXT PRIMARY KEY,
      duel_id TEXT NOT NULL,
      song_id INTEGER,
      song_title TEXT DEFAULT '',
      song_artist TEXT DEFAULT '',
      song_mode TEXT DEFAULT '',
      song_level INT DEFAULT 0,
      song_jacket_url TEXT DEFAULT '',
      song_bpm TEXT DEFAULT '',
      player1_score INT DEFAULT 0,
      player2_score INT DEFAULT 0,
      winner TEXT DEFAULT '',
      played_order INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (duel_id) REFERENCES duels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INT DEFAULT 0,
      email TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      pumbility INT DEFAULT 0,
      skill_title TEXT DEFAULT '',
      skill_level INT DEFAULT 1,
      gender TEXT DEFAULT '',
      nationality TEXT DEFAULT '',
      date_of_birth TEXT DEFAULT '',
      show_age INT DEFAULT 0,
      age INT DEFAULT NULL,
      height_cm REAL DEFAULT NULL,
      weight_kg REAL DEFAULT NULL,
      description TEXT DEFAULT '',
      location_country TEXT DEFAULT '',
      location_country_code TEXT DEFAULT '',
      location_city TEXT DEFAULT '',
      location_lat REAL DEFAULT NULL,
      location_lng REAL DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_feature_permissions (
      user_id TEXT NOT NULL,
      feature_key TEXT NOT NULL,
      granted_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, feature_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_user_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_members (
      group_id TEXT NOT NULL REFERENCES admin_user_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_feature_permissions (
      group_id TEXT NOT NULL REFERENCES admin_user_groups(id) ON DELETE CASCADE,
      feature_key TEXT NOT NULL,
      granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, feature_key)
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_badges (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES admin_user_groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_data TEXT NOT NULL DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_badge_assignments (
      badge_id TEXT NOT NULL REFERENCES admin_user_group_badges(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (badge_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_badge_group_assignments (
      badge_id TEXT NOT NULL REFERENCES admin_user_group_badges(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES admin_user_groups(id) ON DELETE CASCADE,
      assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (badge_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_popups (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      slides_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_popup_targets (
      popup_id TEXT NOT NULL REFERENCES admin_user_group_popups(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES admin_user_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (popup_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_popup_recipients (
      popup_id TEXT NOT NULL REFERENCES admin_user_group_popups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (popup_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS admin_user_group_popup_seen (
      popup_id TEXT NOT NULL REFERENCES admin_user_group_popups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seen_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (popup_id, user_id)
    );

    -- Achievement system: series define categories (e.g. "Pumps Received"),
    -- tiers define thresholds within a series (e.g. 10 / 50 / 100 pumps),
    -- and awards track which users have earned which tier.
    CREATE TABLE IF NOT EXISTS achievement_series (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS achievement_tiers (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL REFERENCES achievement_series(id) ON DELETE CASCADE,
      threshold INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_data TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS achievement_awards (
      tier_id TEXT NOT NULL REFERENCES achievement_tiers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      awarded_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (tier_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_achievement_tiers_series ON achievement_tiers(series_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_achievement_awards_user ON achievement_awards(user_id, tier_id);

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      tournament_id TEXT,
      duel_id TEXT,
      player_slot TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS online_duels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      date TEXT DEFAULT '',
      time TEXT DEFAULT '',
      mode TEXT DEFAULT 'both',
      creator_user_id TEXT NOT NULL,
      opponent_user_id TEXT DEFAULT '',
      status TEXT DEFAULT 'WAITING',
      current_turn TEXT DEFAULT 'player1',
      player1_end_requested INT DEFAULT 0,
      player2_end_requested INT DEFAULT 0,
      winner TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_user_id) REFERENCES users(id),
      FOREIGN KEY (opponent_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS online_duel_songs (
      id TEXT PRIMARY KEY,
      duel_id TEXT NOT NULL,
      song_id INTEGER,
      song_title TEXT DEFAULT '',
      song_artist TEXT DEFAULT '',
      song_mode TEXT DEFAULT '',
      song_level INT DEFAULT 0,
      song_jacket_url TEXT DEFAULT '',
      song_bpm TEXT DEFAULT '',
      chosen_by TEXT DEFAULT '',
      player1_accepted INT DEFAULT 0,
      player2_accepted INT DEFAULT 0,
      player1_score INT DEFAULT 0,
      player2_score INT DEFAULT 0,
      player1_perfect INT DEFAULT 0,
      player1_great INT DEFAULT 0,
      player1_good INT DEFAULT 0,
      player1_bad INT DEFAULT 0,
      player1_miss INT DEFAULT 0,
      player1_max_combo INT DEFAULT 0,
      player1_kcal REAL DEFAULT 0,
      player2_perfect INT DEFAULT 0,
      player2_great INT DEFAULT 0,
      player2_good INT DEFAULT 0,
      player2_bad INT DEFAULT 0,
      player2_miss INT DEFAULT 0,
      player2_max_combo INT DEFAULT 0,
      player2_kcal REAL DEFAULT 0,
      player1_submitted INT DEFAULT 0,
      player2_submitted INT DEFAULT 0,
      winner TEXT DEFAULT '',
      status TEXT DEFAULT 'drawn',
      played_order INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS duel_chat (
      id TEXT PRIMARY KEY,
      duel_id TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      is_system INT DEFAULT 0,
      is_participant INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS duel_pumps (
      duel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      player TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (duel_id, user_id),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round_number);
    CREATE INDEX IF NOT EXISTS idx_songs_level ON songs(level);
    CREATE INDEX IF NOT EXISTS idx_songs_mode ON songs(mode);
    CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_feature ON user_feature_permissions(feature_key, user_id);
    CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_user ON user_feature_permissions(user_id, feature_key);
    CREATE INDEX IF NOT EXISTS idx_admin_user_groups_name ON admin_user_groups(name);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_members_user ON admin_user_group_members(user_id, group_id);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_members_group ON admin_user_group_members(group_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_feature_permissions_group ON admin_user_group_feature_permissions(group_id, feature_key);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_badges_group ON admin_user_group_badges(group_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_badge_assignments_user ON admin_user_group_badge_assignments(user_id, badge_id);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_badge_group_assignments_group ON admin_user_group_badge_group_assignments(group_id, badge_id);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_popup_targets_group ON admin_user_group_popup_targets(group_id, popup_id);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_popup_recipients_user ON admin_user_group_popup_recipients(user_id, popup_id);
    CREATE INDEX IF NOT EXISTS idx_admin_user_group_popup_seen_user ON admin_user_group_popup_seen(user_id, popup_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chart_tiers_unique_chart
      ON chart_tiers(tier_list_type, mode, level, chart_id);
    CREATE INDEX IF NOT EXISTS idx_chart_tiers_mode_level_rank
      ON chart_tiers(tier_list_type, mode, level, tier_rank, chart_id);
    CREATE INDEX IF NOT EXISTS idx_chart_skills_chart
      ON chart_skills(chart_id);
    CREATE INDEX IF NOT EXISTS idx_chart_skills_skill
      ON chart_skills(skill_slug);
    CREATE INDEX IF NOT EXISTS idx_duel_songs_duel ON duel_songs(duel_id);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
    CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(user_id);
    CREATE INDEX IF NOT EXISTS idx_tournaments_created_at ON tournaments(created_at);
    CREATE INDEX IF NOT EXISTS idx_duels_created_at ON duels(created_at);
    CREATE INDEX IF NOT EXISTS idx_online_duels_created_at ON online_duels(created_at);
    CREATE INDEX IF NOT EXISTS idx_online_duel_songs ON online_duel_songs(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_chat ON duel_chat(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_pumps ON duel_pumps(duel_id);
    CREATE INDEX IF NOT EXISTS idx_duel_pumps_user ON duel_pumps(duel_id, user_id);

    CREATE TABLE IF NOT EXISTS duel_spectators (
      duel_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      last_seen TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (duel_id, session_id),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_duel_spectators ON duel_spectators(duel_id);

    CREATE TABLE IF NOT EXISTS duel_predictions (
      duel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      predicted_winner TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (duel_id, user_id),
      FOREIGN KEY (duel_id) REFERENCES online_duels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_duel_predictions ON duel_predictions(duel_id);

    -- PIUGame integration tables
    CREATE TABLE IF NOT EXISTS user_piugame_credentials (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_username TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_youtube_connections (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      channel_id TEXT DEFAULT '',
      channel_title TEXT DEFAULT '',
      channel_thumbnail_url TEXT DEFAULT '',
      encrypted_access_token TEXT NOT NULL DEFAULT '',
      access_token_iv TEXT NOT NULL DEFAULT '',
      access_token_auth_tag TEXT NOT NULL DEFAULT '',
      encrypted_refresh_token TEXT NOT NULL DEFAULT '',
      refresh_token_iv TEXT NOT NULL DEFAULT '',
      refresh_token_auth_tag TEXT NOT NULL DEFAULT '',
      token_scope TEXT DEFAULT '',
      token_type TEXT DEFAULT '',
      token_expires_at TEXT DEFAULT '',
      connected_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT DEFAULT (datetime('now')),
      last_error TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_pumbility_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      background_url TEXT DEFAULT '',
      date_played TEXT DEFAULT '',
      rank_order INTEGER DEFAULT 0,
      over_top100_rank INTEGER DEFAULT 0,
      UNIQUE(user_id, song_title, mode, level)
    );

    CREATE TABLE IF NOT EXISTS user_best_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      plate TEXT DEFAULT '',
      over_top100_rank INTEGER DEFAULT 0,
      shoe_id INTEGER REFERENCES user_shoes(id) ON DELETE SET NULL,
      UNIQUE(user_id, song_title, mode, level)
    );

    CREATE TABLE IF NOT EXISTS user_shoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      colorway TEXT NOT NULL DEFAULT '',
      image_data TEXT DEFAULT '',
      is_current INTEGER DEFAULT 0,
      retired_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shoe_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      colorway TEXT NOT NULL DEFAULT '',
      image_data TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shoe_model_display (
      make_key TEXT NOT NULL,
      model_key TEXT NOT NULL,
      catalog_id INTEGER NOT NULL REFERENCES shoe_catalog(id) ON DELETE CASCADE,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (make_key, model_key)
    );

    CREATE TABLE IF NOT EXISTS user_recently_played (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shoe_id INTEGER REFERENCES user_shoes(id) ON DELETE SET NULL,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      machine_name TEXT DEFAULT '',
      background_url TEXT DEFAULT '',
      date_played TEXT DEFAULT '',
      played_at_utc TEXT DEFAULT '',
      perfect INTEGER,
      great INTEGER,
      good INTEGER,
      bad INTEGER,
      miss INTEGER,
      max_combo INTEGER DEFAULT 0,
      kcal REAL DEFAULT 0,
      plate TEXT DEFAULT '',
      over_top100_rank INTEGER DEFAULT 0,
      replay_embed_url TEXT DEFAULT '',
      replay_video_id TEXT DEFAULT '',
      replay_start_seconds INTEGER DEFAULT 0,
      replay_end_seconds INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_piugame_sync (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_best_scores_sync TEXT DEFAULT '',
      last_pumbility_sync TEXT DEFAULT '',
      last_recently_played_sync TEXT DEFAULT '',
      best_scores_imported INTEGER DEFAULT 0,
      pumbility_value INTEGER DEFAULT 0,
      play_data_levels_json TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS pumbility_leaderboard (
      rank INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      pumbility INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT DEFAULT '',
      prev_rank INTEGER NOT NULL DEFAULT 0,
      rank_delta INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (rank)
    );

    CREATE TABLE IF NOT EXISTS pumbility_leaderboard_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      threshold INTEGER NOT NULL DEFAULT 0,
      total_entries INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS over_level_rankings (
      chart_key TEXT PRIMARY KEY,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      jacket_url TEXT DEFAULT '',
      source_no TEXT DEFAULT '',
      top100_count INTEGER NOT NULL DEFAULT 0,
      min_score INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS over_level_ranking_scores (
      chart_key TEXT NOT NULL REFERENCES over_level_rankings(chart_key) ON DELETE CASCADE,
      row_order INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      grade TEXT DEFAULT '',
      player_name TEXT DEFAULT '',
      player_avatar_url TEXT DEFAULT '',
      prev_rank INTEGER NOT NULL DEFAULT 0,
      rank_delta INTEGER NOT NULL DEFAULT 0,
      played_at TEXT DEFAULT '',
      PRIMARY KEY (chart_key, row_order)
    );

    CREATE TABLE IF NOT EXISTS over_level_ranking_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_charts INTEGER NOT NULL DEFAULT 0,
      total_entries INTEGER NOT NULL DEFAULT 0,
      source_pages INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS over_level_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_type TEXT NOT NULL DEFAULT 'sync',
      status TEXT NOT NULL DEFAULT 'success',
      trigger_reason TEXT DEFAULT '',
      force_flag INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      charts INTEGER NOT NULL DEFAULT 0,
      entries INTEGER NOT NULL DEFAULT 0,
      source_pages INTEGER NOT NULL DEFAULT 0,
      backfill_total_checked INTEGER NOT NULL DEFAULT 0,
      backfill_total_updated INTEGER NOT NULL DEFAULT 0,
      backfill_best_scores_updated INTEGER NOT NULL DEFAULT 0,
      backfill_pumbility_scores_updated INTEGER NOT NULL DEFAULT 0,
      backfill_recent_scores_updated INTEGER NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      read INT DEFAULT 0,
      link TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_activity_notification_subscriptions (
      subscriber_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notify_posts INT DEFAULT 0,
      notify_upscores INT DEFAULT 0,
      notify_new_clears INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (subscriber_user_id, target_user_id)
    );

    CREATE TABLE IF NOT EXISTS user_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      expiration_time TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'direct',
      direct_key TEXT NOT NULL UNIQUE,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT DEFAULT '',
      last_message_id TEXT DEFAULT '',
      last_message_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT DEFAULT (datetime('now')),
      last_read_at TEXT DEFAULT '',
      is_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT '',
      deleted_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_inbox_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      link_path TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      link_label TEXT DEFAULT '',
      thread_key TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL DEFAULT '',
      cleared_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_story_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      story_type TEXT NOT NULL DEFAULT 'image',
      source_kind TEXT DEFAULT '',
      source_id TEXT DEFAULT '',
      caption TEXT DEFAULT '',
      media_url TEXT DEFAULT '',
      link_path TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      link_label TEXT DEFAULT '',
      sticker_tokens_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL DEFAULT '',
      deleted_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS auth_qr_login_challenges (
      id TEXT PRIMARY KEY,
      claim_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      browser_label TEXT DEFAULT '',
      browser_user_agent TEXT DEFAULT '',
      browser_ip TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',
      consumed_at TEXT DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS user_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      youtube_url TEXT DEFAULT '',
      comments_disabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS post_pumps (
      post_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES user_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES user_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES post_comments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      youtube_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_post_drafts_user ON post_drafts(user_id);

    CREATE TABLE IF NOT EXISTS user_upscores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      upscores_json TEXT NOT NULL DEFAULT '[]',
      pumbility_gain INT DEFAULT 0,
      singles_pumbility_gain INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
    CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id);
    CREATE INDEX IF NOT EXISTS idx_follows_follower_time ON user_follows(follower_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_follows_following_time ON user_follows(following_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_user ON user_posts(user_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON user_posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_post_pumps ON post_pumps(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_pumps_user ON post_pumps(post_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_post_comments ON post_comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_upscores_user ON user_upscores(user_id);
    CREATE INDEX IF NOT EXISTS idx_upscores_created ON user_upscores(created_at);

    CREATE INDEX IF NOT EXISTS idx_pumbility_scores_user ON user_pumbility_scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_best_scores_user ON user_best_scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_best_scores_user_mode ON user_best_scores(user_id, mode);
    CREATE INDEX IF NOT EXISTS idx_pumbility_leaderboard_player_name ON pumbility_leaderboard(player_name);
    CREATE INDEX IF NOT EXISTS idx_over_level_rankings_song_mode_level ON over_level_rankings(song_title, mode, level);
    CREATE INDEX IF NOT EXISTS idx_over_level_ranking_scores_player_name ON over_level_ranking_scores(player_name);
    CREATE INDEX IF NOT EXISTS idx_over_level_ranking_scores_player_chart ON over_level_ranking_scores(player_name, chart_key);
    CREATE INDEX IF NOT EXISTS idx_over_level_sync_runs_started_at ON over_level_sync_runs(datetime(started_at) DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_over_level_sync_runs_type ON over_level_sync_runs(run_type, datetime(started_at) DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_user_shoes_user ON user_shoes(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_shoes_make_model ON user_shoes(make, model);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_shoes_single_active ON user_shoes(user_id) WHERE is_current = 1;
    CREATE INDEX IF NOT EXISTS idx_shoe_catalog_make_model ON shoe_catalog(make, model);
    CREATE INDEX IF NOT EXISTS idx_shoe_model_display_catalog ON shoe_model_display(catalog_id);
    CREATE INDEX IF NOT EXISTS idx_recently_played_user ON user_recently_played(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_notif_subscriber ON user_activity_notification_subscriptions(subscriber_user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_notif_target ON user_activity_notification_subscriptions(target_user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON user_push_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON user_push_subscriptions(endpoint);
    CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_time ON conversation_messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_sender ON conversation_messages(sender_user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_user_inbox_notes_user_active ON user_inbox_notes(user_id, cleared_at, expires_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_user_story_items_user_active ON user_story_items(user_id, deleted_at, expires_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_auth_qr_login_challenges_status ON auth_qr_login_challenges(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_qr_login_challenges_approved_user ON auth_qr_login_challenges(approved_user_id, created_at);

    CREATE TABLE IF NOT EXISTS user_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
      chart_id INTEGER NOT NULL,
      song_title TEXT NOT NULL,
      artist TEXT DEFAULT '',
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      jacket_url TEXT DEFAULT '',
      original_score INTEGER DEFAULT 0,
      original_grade TEXT DEFAULT '',
      had_pass INTEGER DEFAULT 0,
      target TEXT DEFAULT 'PASS',
      added_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_list_items_list ON user_list_items(list_id);

    CREATE TABLE IF NOT EXISTS user_chart_youtube_links (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chart_id INTEGER NOT NULL,
      youtube_url TEXT NOT NULL DEFAULT '',
      session_youtube_url TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, chart_id)
    );
  `);

  // Migrations for players table - add user_id
  const playerColumns = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!playerColumns.includes('user_id')) {
    db.exec("ALTER TABLE players ADD COLUMN user_id TEXT DEFAULT ''");
  }

  const chartYoutubeLinkColumns = db.prepare("PRAGMA table_info(user_chart_youtube_links)").all().map(c => c.name);
  if (!chartYoutubeLinkColumns.includes('session_youtube_url')) {
    db.exec("ALTER TABLE user_chart_youtube_links ADD COLUMN session_youtube_url TEXT NOT NULL DEFAULT ''");
  }

  // Migrations for duels table - add user_id columns
  const duelColsCheck = db.prepare("PRAGMA table_info(duels)").all().map(c => c.name);
  if (!duelColsCheck.includes('player1_user_id')) {
    db.exec("ALTER TABLE duels ADD COLUMN player1_user_id TEXT DEFAULT ''");
  }
  if (!duelColsCheck.includes('player2_user_id')) {
    db.exec("ALTER TABLE duels ADD COLUMN player2_user_id TEXT DEFAULT ''");
  }
  if (!duelColsCheck.includes('creator_user_id')) {
    db.exec("ALTER TABLE duels ADD COLUMN creator_user_id TEXT DEFAULT ''");
  }
  db.exec(`
    UPDATE duels
    SET creator_user_id = player1_user_id
    WHERE COALESCE(creator_user_id, '') = ''
      AND COALESCE(player1_user_id, '') != ''
  `);

  // Migrations for duels table - add player detail fields
  const duelColumns = db.prepare("PRAGMA table_info(duels)").all().map(c => c.name);
  const duelMigrations = [
    ['player1_skill_title', "TEXT DEFAULT ''"],
    ['player1_skill_level', "INT DEFAULT 1"],
    ['player1_gender', "TEXT DEFAULT ''"],
    ['player1_nationality', "TEXT DEFAULT ''"],
    ['player1_description', "TEXT DEFAULT ''"],
    ['player2_skill_title', "TEXT DEFAULT ''"],
    ['player2_skill_level', "INT DEFAULT 1"],
    ['player2_gender', "TEXT DEFAULT ''"],
    ['player2_nationality', "TEXT DEFAULT ''"],
    ['player2_description', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of duelMigrations) {
    if (!duelColumns.includes(col)) {
      db.exec(`ALTER TABLE duels ADD COLUMN ${col} ${type}`);
    }
  }

  // Migrations for existing databases
  const tournamentColumns = db.prepare("PRAGMA table_info(tournaments)").all().map(c => c.name);
  if (!tournamentColumns.includes('avatar')) {
    db.exec("ALTER TABLE tournaments ADD COLUMN avatar TEXT DEFAULT ''");
  }
  if (!tournamentColumns.includes('archived')) {
    db.exec("ALTER TABLE tournaments ADD COLUMN archived INT DEFAULT 0");
  }

  const columns = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!columns.includes('description')) {
    db.exec("ALTER TABLE players ADD COLUMN description TEXT DEFAULT ''");
  }
  if (!columns.includes('avatar')) {
    db.exec("ALTER TABLE players ADD COLUMN avatar TEXT DEFAULT ''");
  }
  if (!columns.includes('gender')) {
    db.exec("ALTER TABLE players ADD COLUMN gender TEXT DEFAULT ''");
  }
  if (!columns.includes('nationality')) {
    db.exec("ALTER TABLE players ADD COLUMN nationality TEXT DEFAULT ''");
  }

  // Migrations for songs table
  const songColumns = db.prepare("PRAGMA table_info(songs)").all().map(c => c.name);
  if (!songColumns.includes('flags')) {
    db.exec("ALTER TABLE songs ADD COLUMN flags TEXT DEFAULT ''");
  }
  if (!songColumns.includes('duration_seconds')) {
    db.exec("ALTER TABLE songs ADD COLUMN duration_seconds INTEGER DEFAULT NULL");
  }
  if (!songColumns.includes('duration_source')) {
    db.exec("ALTER TABLE songs ADD COLUMN duration_source TEXT DEFAULT ''");
  }
  if (!songColumns.includes('duration_updated_at')) {
    db.exec("ALTER TABLE songs ADD COLUMN duration_updated_at TEXT DEFAULT NULL");
  }

  // Migrations for online_duel_songs - add decline columns
  const onlineDuelSongCols = db.prepare("PRAGMA table_info(online_duel_songs)").all().map(c => c.name);
  if (!onlineDuelSongCols.includes('player1_declined')) {
    db.exec("ALTER TABLE online_duel_songs ADD COLUMN player1_declined INT DEFAULT 0");
  }
  if (!onlineDuelSongCols.includes('player2_declined')) {
    db.exec("ALTER TABLE online_duel_songs ADD COLUMN player2_declined INT DEFAULT 0");
  }

  // Migrations for matches table
  const matchColumns = db.prepare("PRAGMA table_info(matches)").all().map(c => c.name);
  if (!matchColumns.includes('match_type')) {
    db.exec("ALTER TABLE matches ADD COLUMN match_type TEXT DEFAULT 'round_robin'");
  }
  if (!matchColumns.includes('gauntlet_order')) {
    db.exec("ALTER TABLE matches ADD COLUMN gauntlet_order INT DEFAULT 0");
  }

  // Migrations for recently played - add breakdown columns
  const recentCols = db.prepare("PRAGMA table_info(user_recently_played)").all().map(c => c.name);
  const recentMigrations = [
    ['shoe_id', 'INTEGER DEFAULT NULL'],
    ['perfect', 'INT DEFAULT 0'],
    ['great', 'INT DEFAULT 0'],
    ['good', 'INT DEFAULT 0'],
    ['bad', 'INT DEFAULT 0'],
    ['miss', 'INT DEFAULT 0'],
    ['max_combo', 'INT DEFAULT 0'],
    ['kcal', 'REAL DEFAULT 0'],
    ['plate', "TEXT DEFAULT ''"],
    ['machine_name', "TEXT DEFAULT ''"],
    ['over_top100_rank', 'INT DEFAULT 0'],
    ['played_at_utc', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of recentMigrations) {
    if (!recentCols.includes(col)) {
      db.exec(`ALTER TABLE user_recently_played ADD COLUMN ${col} ${type}`);
    }
  }

  // Keep recently played history across syncs while preventing duplicate rows on re-import.
  const recentIndexes = db.prepare("PRAGMA index_list(user_recently_played)").all().map(i => i.name);
  if (!recentIndexes.includes('idx_recently_played_unique_play')) {
    db.exec(`
      DELETE FROM user_recently_played
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM user_recently_played
        GROUP BY user_id, song_title, mode, level, score, grade, date_played
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recently_played_unique_play
        ON user_recently_played(user_id, song_title, mode, level, score, grade, date_played);
    `);
  }
  if (!recentIndexes.includes('idx_recently_played_played_at_utc')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_recently_played_played_at_utc ON user_recently_played(user_id, played_at_utc DESC, id DESC)');
  }
  if (!recentIndexes.includes('idx_recently_played_shoe')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_recently_played_shoe ON user_recently_played(shoe_id)');
  }

  // Migrations for user_shoes - add colorway and lookup index
  const userShoeCols = db.prepare("PRAGMA table_info(user_shoes)").all().map(c => c.name);
  if (!userShoeCols.includes('colorway')) {
    db.exec("ALTER TABLE user_shoes ADD COLUMN colorway TEXT DEFAULT ''");
  }
  const userShoeIndexes = db.prepare("PRAGMA index_list(user_shoes)").all().map(i => i.name);
  if (!userShoeIndexes.includes('idx_user_shoes_make_model')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_user_shoes_make_model ON user_shoes(make, model)');
  }

  // Migrations for shoe catalog
  db.exec(`
    CREATE TABLE IF NOT EXISTS shoe_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      colorway TEXT NOT NULL DEFAULT '',
      image_data TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const shoeCatalogCols = db.prepare("PRAGMA table_info(shoe_catalog)").all().map(c => c.name);
  const shoeCatalogMigrations = [
    ['colorway', "TEXT DEFAULT ''"],
    ['image_data', "TEXT DEFAULT ''"],
    ['created_by', "TEXT DEFAULT NULL"],
    ['created_at', "TEXT DEFAULT ''"],
    ['updated_at', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of shoeCatalogMigrations) {
    if (!shoeCatalogCols.includes(col)) {
      db.exec(`ALTER TABLE shoe_catalog ADD COLUMN ${col} ${type}`);
    }
  }
  const shoeCatalogIndexes = db.prepare("PRAGMA index_list(shoe_catalog)").all().map(i => i.name);
  if (!shoeCatalogIndexes.includes('idx_shoe_catalog_make_model')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_shoe_catalog_make_model ON shoe_catalog(make, model)');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS shoe_model_display (
      make_key TEXT NOT NULL,
      model_key TEXT NOT NULL,
      catalog_id INTEGER NOT NULL REFERENCES shoe_catalog(id) ON DELETE CASCADE,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (make_key, model_key)
    );
    CREATE INDEX IF NOT EXISTS idx_shoe_model_display_catalog ON shoe_model_display(catalog_id);
  `);

  // Backfill legacy shoes where colorway was previously included inside model text.
  const legacyShoes = db.prepare(`
    SELECT id, make, model, colorway
    FROM user_shoes
    WHERE TRIM(COALESCE(model, '')) != ''
      AND TRIM(COALESCE(colorway, '')) = ''
  `).all();
  if (legacyShoes.length > 0) {
    const updateLegacyShoe = db.prepare(`
      UPDATE user_shoes
      SET model = ?, colorway = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const migrateLegacyShoes = db.transaction((rows) => {
      let updatedCount = 0;
      for (const row of rows) {
        const split = splitLegacyShoeModel(row.make, row.model);
        const nextModel = normalizeShoeText(split.model || row.model, 80);
        const nextColorway = normalizeShoeText(split.colorway || '', 120);
        if (!nextModel) continue;
        const sameModel = normalizeShoeText(row.model, 80) === nextModel;
        const sameColorway = normalizeShoeText(row.colorway, 80) === nextColorway;
        if (sameModel && sameColorway) continue;
        updateLegacyShoe.run(nextModel, nextColorway, row.id);
        updatedCount++;
      }
      return updatedCount;
    });
    const updatedCount = migrateLegacyShoes(legacyShoes);
    if (updatedCount > 0) {
      console.log(`Migrated ${updatedCount} legacy user_shoes rows to model+colorway format`);
    }
  }

  // Backfill legacy catalog rows where colorway was previously included inside model text.
  const legacyCatalogRows = db.prepare(`
    SELECT id, make, model, colorway
    FROM shoe_catalog
    WHERE TRIM(COALESCE(model, '')) != ''
      AND TRIM(COALESCE(colorway, '')) = ''
  `).all();
  if (legacyCatalogRows.length > 0) {
    const updateLegacyCatalogRow = db.prepare(`
      UPDATE shoe_catalog
      SET model = ?, colorway = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const migrateLegacyCatalogRows = db.transaction((rows) => {
      let updatedCount = 0;
      for (const row of rows) {
        const split = splitLegacyShoeModel(row.make, row.model);
        const nextModel = normalizeShoeText(split.model || row.model, 80);
        const nextColorway = normalizeShoeText(split.colorway || '', 120);
        if (!nextModel) continue;
        const sameModel = normalizeShoeText(row.model, 80) === nextModel;
        const sameColorway = normalizeShoeText(row.colorway, 80) === nextColorway;
        if (sameModel && sameColorway) continue;
        updateLegacyCatalogRow.run(nextModel, nextColorway, row.id);
        updatedCount++;
      }
      return updatedCount;
    });
    const updatedCount = migrateLegacyCatalogRows(legacyCatalogRows);
    if (updatedCount > 0) {
      console.log(`Migrated ${updatedCount} legacy shoe_catalog rows to model+colorway format`);
    }
  }

  // Migrations for best scores - add background_url
  const bestScoreCols = db.prepare("PRAGMA table_info(user_best_scores)").all().map(c => c.name);
  if (!bestScoreCols.includes('background_url')) {
    db.exec("ALTER TABLE user_best_scores ADD COLUMN background_url TEXT DEFAULT ''");
  }
  if (!bestScoreCols.includes('shoe_id')) {
    db.exec("ALTER TABLE user_best_scores ADD COLUMN shoe_id INTEGER DEFAULT NULL");
  }
  if (!bestScoreCols.includes('over_top100_rank')) {
    db.exec("ALTER TABLE user_best_scores ADD COLUMN over_top100_rank INT DEFAULT 0");
  }
  const bestScoreIndexes = db.prepare("PRAGMA index_list(user_best_scores)").all().map(i => i.name);
  if (!bestScoreIndexes.includes('idx_best_scores_shoe')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_best_scores_shoe ON user_best_scores(shoe_id)');
  }

  const pumbilityScoreCols = db.prepare("PRAGMA table_info(user_pumbility_scores)").all().map(c => c.name);
  if (!pumbilityScoreCols.includes('over_top100_rank')) {
    db.exec("ALTER TABLE user_pumbility_scores ADD COLUMN over_top100_rank INT DEFAULT 0");
  }

  // Migrations for user_posts - add youtube_url and comments_disabled
  const postCols = db.prepare("PRAGMA table_info(user_posts)").all().map(c => c.name);
  if (!postCols.includes('youtube_url')) {
    db.exec("ALTER TABLE user_posts ADD COLUMN youtube_url TEXT DEFAULT ''");
  }
  if (!postCols.includes('comments_disabled')) {
    db.exec("ALTER TABLE user_posts ADD COLUMN comments_disabled INTEGER DEFAULT 0");
  }
  if (!postCols.includes('updated_at')) {
    db.exec("ALTER TABLE user_posts ADD COLUMN updated_at TEXT DEFAULT NULL");
  }

  // Migrations for upscore interactions (pumps + comments)
  db.exec(`
    CREATE TABLE IF NOT EXISTS upscore_pumps (
      upscore_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (upscore_id, user_id),
      FOREIGN KEY (upscore_id) REFERENCES user_upscores(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS upscore_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upscore_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (upscore_id) REFERENCES user_upscores(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES upscore_comments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_upscore_comments_upscore ON upscore_comments(upscore_id);
    CREATE INDEX IF NOT EXISTS idx_upscore_comments_parent ON upscore_comments(parent_id);
  `);

  // New clears tables (first-time song clears)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_new_clears (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT DEFAULT '',
      plate TEXT DEFAULT '',
      background_url TEXT DEFAULT '',
      clears_json TEXT DEFAULT '',
      pumbility_gain INT DEFAULT 0,
      singles_pumbility_gain INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS new_clear_pumps (
      clear_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (clear_id, user_id),
      FOREIGN KEY (clear_id) REFERENCES user_new_clears(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS new_clear_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clear_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (clear_id) REFERENCES user_new_clears(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES new_clear_comments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_new_clears_user ON user_new_clears(user_id);
    CREATE INDEX IF NOT EXISTS idx_new_clears_created ON user_new_clears(created_at);
    CREATE INDEX IF NOT EXISTS idx_new_clear_pumps ON new_clear_pumps(clear_id);
    CREATE INDEX IF NOT EXISTS idx_new_clear_comments ON new_clear_comments(clear_id);
  `);

  // Comment pumps table (pumps on any comment or reply)
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_pumps (
      comment_type TEXT NOT NULL,
      comment_id INTEGER NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (comment_type, comment_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_comment_pumps_comment ON comment_pumps(comment_type, comment_id);

    -- Communities
    CREATE TABLE IF NOT EXISTS communities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      index_tags TEXT DEFAULT '[]',
      about TEXT DEFAULT '',
      location_country TEXT DEFAULT '',
      rules TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      banner TEXT DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_invite_only INT DEFAULT 0,
      badge_text TEXT DEFAULT '',
      badge_color TEXT DEFAULT '#ff3366',
      badge_text_color TEXT DEFAULT '#ffffff',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_members (
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (community_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_pumbility_rankings (
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      current_rank INTEGER NOT NULL DEFAULT 0,
      prev_rank INTEGER NOT NULL DEFAULT 0,
      rank_delta INTEGER NOT NULL DEFAULT 0,
      pumbility INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT DEFAULT '',
      PRIMARY KEY (community_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_role_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_tags (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#ff3366',
      text_color TEXT DEFAULT '#ffffff',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_member_tags (
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES community_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (community_id, user_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      youtube_url TEXT DEFAULT '',
      is_pinned INT DEFAULT 0,
      comments_disabled INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS community_post_pumps (
      post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_post_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id TEXT DEFAULT NULL REFERENCES community_post_comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_comment_pumps (
      comment_id TEXT NOT NULL REFERENCES community_post_comments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_join_requests (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_post_notification_subscriptions (
      subscriber_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'all' CHECK (mode IN ('all', 'following')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (subscriber_user_id, community_id)
    );

    CREATE INDEX IF NOT EXISTS idx_communities_name ON communities(name);
    CREATE INDEX IF NOT EXISTS idx_communities_owner ON communities(owner_id);
    CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_community_pumbility_rankings_community_rank ON community_pumbility_rankings(community_id, current_rank ASC);
    CREATE INDEX IF NOT EXISTS idx_community_pumbility_rankings_user ON community_pumbility_rankings(user_id);
    CREATE INDEX IF NOT EXISTS idx_community_role_events_user ON community_role_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_community_role_events_community ON community_role_events(community_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_community_tags_community ON community_tags(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_member_tags_community ON community_member_tags(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_posts_community ON community_posts(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_community_post_pumps ON community_post_pumps(post_id);
    CREATE INDEX IF NOT EXISTS idx_community_post_comments ON community_post_comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_community_join_requests ON community_join_requests(community_id, status);
    CREATE INDEX IF NOT EXISTS idx_community_post_notif_subscriber ON community_post_notification_subscriptions(subscriber_user_id);
    CREATE INDEX IF NOT EXISTS idx_community_post_notif_community ON community_post_notification_subscriptions(community_id);

    CREATE TABLE IF NOT EXISTS follower_daily_snapshots (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      follower_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, snapshot_date)
    );

    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      host_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      stream_url TEXT DEFAULT '',
      youtube_broadcast_id TEXT DEFAULT '',
      youtube_video_id TEXT DEFAULT '',
      youtube_channel_id TEXT DEFAULT '',
      youtube_stream_title TEXT DEFAULT '',
      youtube_lifecycle_status TEXT DEFAULT '',
      youtube_scheduled_start_time TEXT DEFAULT '',
      youtube_actual_start_time TEXT DEFAULT '',
      status_text TEXT DEFAULT '',
      requests_enabled INTEGER NOT NULL DEFAULT 1,
      request_mode_filter TEXT NOT NULL DEFAULT 'All',
      request_max_level INTEGER NOT NULL DEFAULT 30,
      request_show_scores INTEGER NOT NULL DEFAULT 1,
      is_hidden_from_profile INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT DEFAULT '',
      session_type TEXT NOT NULL DEFAULT 'live',
      hop_warmup_started_at TEXT DEFAULT '',
      hop_started_at TEXT DEFAULT '',
      hop_ends_at TEXT DEFAULT '',
      hop_warmup_seconds INTEGER NOT NULL DEFAULT 1200,
      hop_window_seconds INTEGER NOT NULL DEFAULT 3600,
      hop_warmup_finished_announced_at TEXT DEFAULT '',
      hop_finished_announced_at TEXT DEFAULT '',
      hop_total_rating_points INTEGER NOT NULL DEFAULT 0,
      hop_counted_clear_count INTEGER NOT NULL DEFAULT 0,
      hop_average_level REAL NOT NULL DEFAULT 0,
      hop_average_rating_points REAL NOT NULL DEFAULT 0,
      hop_highest_rating_points INTEGER NOT NULL DEFAULT 0,
      hop_lowest_rating_points INTEGER NOT NULL DEFAULT 0,
      hop_completed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'live',
      recent_anchor_id INTEGER NOT NULL DEFAULT 0,
      last_recent_row_id INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT DEFAULT '',
      last_sync_status TEXT DEFAULT '',
      viewer_peak INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS live_session_participants (
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'cohost',
      status TEXT NOT NULL DEFAULT 'active',
      added_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT DEFAULT (datetime('now')),
      left_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (live_session_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS live_session_participant_sync (
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recent_anchor_id INTEGER NOT NULL DEFAULT 0,
      last_recent_row_id INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT DEFAULT '',
      last_sync_status TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (live_session_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS live_session_presence (
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_seen TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (live_session_id, session_id)
    );

    CREATE TABLE IF NOT EXISTS live_session_messages (
      id TEXT PRIMARY KEY,
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      avatar TEXT DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      message_type TEXT NOT NULL DEFAULT 'chat',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS live_message_pumps (
      message_id TEXT NOT NULL REFERENCES live_session_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS live_session_requests (
      id TEXT PRIMARY KEY,
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL DEFAULT '',
      chart_id INTEGER DEFAULT NULL,
      chart_key TEXT DEFAULT '',
      song_title TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT '',
      level INTEGER NOT NULL DEFAULT 0,
      target_user_id TEXT DEFAULT '',
      target_username TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      fulfilled INTEGER NOT NULL DEFAULT 0,
      handled_at TEXT DEFAULT '',
      handled_by_user_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS live_session_moderation (
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chat_muted INTEGER NOT NULL DEFAULT 0,
      requests_blocked INTEGER NOT NULL DEFAULT 0,
      moderated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (live_session_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS live_session_votes (
      id TEXT PRIMARY KEY,
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      host_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode_filter TEXT NOT NULL DEFAULT 'Both',
      min_level INTEGER NOT NULL DEFAULT 0,
      max_level INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      pinned_message_id TEXT DEFAULT '',
      ends_at TEXT DEFAULT '',
      winning_option_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS live_session_vote_options (
      id TEXT PRIMARY KEY,
      vote_id TEXT NOT NULL REFERENCES live_session_votes(id) ON DELETE CASCADE,
      chart_id INTEGER DEFAULT NULL,
      chart_key TEXT DEFAULT '',
      song_title TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT '',
      level INTEGER NOT NULL DEFAULT 0,
      jacket_url TEXT DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS live_session_vote_ballots (
      vote_id TEXT NOT NULL REFERENCES live_session_votes(id) ON DELETE CASCADE,
      option_id TEXT NOT NULL REFERENCES live_session_vote_options(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (vote_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS live_session_plays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recently_played_id INTEGER DEFAULT NULL REFERENCES user_recently_played(id) ON DELETE SET NULL,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      grade TEXT DEFAULT '',
      machine_name TEXT DEFAULT '',
      background_url TEXT DEFAULT '',
      date_played TEXT DEFAULT '',
      played_at_utc TEXT DEFAULT '',
      perfect INTEGER DEFAULT 0,
      great INTEGER DEFAULT 0,
      good INTEGER DEFAULT 0,
      bad INTEGER DEFAULT 0,
      miss INTEGER DEFAULT 0,
      max_combo INTEGER DEFAULT 0,
      kcal REAL DEFAULT 0,
      plate TEXT DEFAULT '',
      over_top100_rank INTEGER DEFAULT 0,
      shoe_id INTEGER DEFAULT NULL,
      shoe_make TEXT DEFAULT '',
      shoe_model TEXT DEFAULT '',
      shoe_colorway TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(live_session_id, user_id, song_title, mode, level, score, grade, date_played)
    );

    CREATE TABLE IF NOT EXISTS live_session_buffered_upscores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      performer_user_id TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      pumbility_gain INTEGER NOT NULL DEFAULT 0,
      singles_pumbility_gain INTEGER NOT NULL DEFAULT 0,
      finalized_at TEXT DEFAULT '',
      finalized_post_id INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS live_session_buffered_clears (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      performer_user_id TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      pumbility_gain INTEGER NOT NULL DEFAULT 0,
      singles_pumbility_gain INTEGER NOT NULL DEFAULT 0,
      finalized_at TEXT DEFAULT '',
      finalized_post_id INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_live_sessions_host_status ON live_sessions(host_user_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_single_active_host ON live_sessions(host_user_id) WHERE status = 'live';
    CREATE INDEX IF NOT EXISTS idx_live_session_participants_session ON live_session_participants(live_session_id, status, role, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_participants_user ON live_session_participants(user_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_participant_sync_session ON live_session_participant_sync(live_session_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_presence_session ON live_session_presence(live_session_id, last_seen);
    CREATE INDEX IF NOT EXISTS idx_live_session_messages_session_time ON live_session_messages(live_session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_live_message_pumps_message ON live_message_pumps(message_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_requests_session_time ON live_session_requests(live_session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_moderation_session ON live_session_moderation(live_session_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_votes_session_status ON live_session_votes(live_session_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_vote_options_vote ON live_session_vote_options(vote_id, position);
    CREATE INDEX IF NOT EXISTS idx_live_session_plays_session_time ON live_session_plays(live_session_id, date_played, id);
    CREATE INDEX IF NOT EXISTS idx_live_session_plays_recent ON live_session_plays(recently_played_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_live_session_plays_unique_recent ON live_session_plays(live_session_id, recently_played_id) WHERE recently_played_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_live_session_buffered_upscores_session ON live_session_buffered_upscores(live_session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_buffered_clears_session ON live_session_buffered_clears(live_session_id, created_at);

    -- Community custom emojis (from sprite sheet uploads)
    CREATE TABLE IF NOT EXISTS community_emojis (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Community role badges (from sprite sheet uploads)
    CREATE TABLE IF NOT EXISTS community_role_badges (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Badge assignments to members
    CREATE TABLE IF NOT EXISTS community_member_badges (
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id TEXT NOT NULL REFERENCES community_role_badges(id) ON DELETE CASCADE,
      PRIMARY KEY (community_id, user_id, badge_id)
    );

    CREATE INDEX IF NOT EXISTS idx_community_emojis ON community_emojis(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_role_badges ON community_role_badges(community_id);
    CREATE INDEX IF NOT EXISTS idx_community_member_badges ON community_member_badges(community_id);

    -- World Max map data
    CREATE TABLE IF NOT EXISTS world_max_machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      added_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country TEXT NOT NULL DEFAULT '',
      country_code TEXT DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      venue_name TEXT DEFAULT '',
      address TEXT DEFAULT '',
      price_per_credit TEXT DEFAULT '',
      game_code TEXT NOT NULL DEFAULT '',
      game_name TEXT NOT NULL DEFAULT '',
      machine_code TEXT NOT NULL DEFAULT '',
      machine_name TEXT NOT NULL DEFAULT '',
      latitude REAL DEFAULT NULL,
      longitude REAL DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS world_max_machine_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id INTEGER NOT NULL REFERENCES world_max_machines(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER DEFAULT 0,
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS world_max_machine_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id INTEGER NOT NULL REFERENCES world_max_machines(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_data TEXT NOT NULL,
      caption TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_world_max_machine_coords ON world_max_machines(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_world_max_machine_city_country ON world_max_machines(city, country);
    CREATE INDEX IF NOT EXISTS idx_world_max_machine_reviews_machine ON world_max_machine_reviews(machine_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_world_max_machine_photos_machine ON world_max_machine_photos(machine_id, created_at);
  `);

  // Fun mini-game scores (registered users only).
  db.exec(`
    CREATE TABLE IF NOT EXISTS fun_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_fun_scores_user ON fun_scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_fun_scores_score ON fun_scores(score DESC);
    CREATE INDEX IF NOT EXISTS idx_fun_scores_created ON fun_scores(created_at DESC);
  `);

  // Venues, machines, and check-ins
  db.exec(`
    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      latitude REAL DEFAULT NULL,
      longitude REAL DEFAULT NULL,
      proximity_radius_m REAL DEFAULT 180,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS venue_machines (
      id TEXT PRIMARY KEY,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position TEXT DEFAULT 'left',
      sort_order INT DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_venue_machines_venue ON venue_machines(venue_id);

    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      machine_id TEXT NOT NULL REFERENCES venue_machines(id) ON DELETE CASCADE,
      client_session_id TEXT NOT NULL DEFAULT '',
      checked_in_at TEXT DEFAULT (datetime('now')),
      checked_out_at TEXT DEFAULT NULL,
      last_proximity_check_at TEXT DEFAULT NULL,
      last_near_venue_at TEXT DEFAULT NULL,
      last_proximity_lat REAL DEFAULT NULL,
      last_proximity_lng REAL DEFAULT NULL,
      last_proximity_accuracy_m REAL DEFAULT NULL,
      last_proximity_distance_m REAL DEFAULT NULL,
      last_proximity_status TEXT DEFAULT '',
      auto_checked_out_at TEXT DEFAULT NULL,
      checkout_reason TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id, checked_in_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checkins_venue ON checkins(venue_id, checked_out_at);
    CREATE INDEX IF NOT EXISTS idx_checkins_venue_time ON checkins(venue_id, checked_in_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checkins_active ON checkins(checked_out_at) WHERE checked_out_at IS NULL;

    CREATE TABLE IF NOT EXISTS venue_checkin_notification_subscriptions (
      subscriber_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      notify_checkins INT DEFAULT 1,
      notify_checkouts INT DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (subscriber_user_id, venue_id)
    );
    CREATE INDEX IF NOT EXISTS idx_venue_checkin_notif_subscriber ON venue_checkin_notification_subscriptions(subscriber_user_id);
    CREATE INDEX IF NOT EXISTS idx_venue_checkin_notif_venue ON venue_checkin_notification_subscriptions(venue_id);
  `);

  const venueCols = db.prepare("PRAGMA table_info(venues)").all().map(c => c.name);
  const venueMigrations = [
    ['latitude', 'REAL DEFAULT NULL'],
    ['longitude', 'REAL DEFAULT NULL'],
    ['proximity_radius_m', 'REAL DEFAULT 180'],
  ];
  for (const [col, type] of venueMigrations) {
    if (!venueCols.includes(col)) {
      db.exec(`ALTER TABLE venues ADD COLUMN ${col} ${type}`);
    }
  }

  db.prepare(`
    UPDATE venues
    SET latitude = ?,
        longitude = ?,
        proximity_radius_m = ?
    WHERE slug = ?
  `).run(51.53639, -0.31489, 180, 'london-pump-dojo');

  // Seed default venue and machines if empty
  const venueCount = db.prepare('SELECT COUNT(*) AS cnt FROM venues').get().cnt;
  if (venueCount === 0) {
    const venueId = randomUUID();
    db.prepare(`
      INSERT INTO venues (id, name, slug, latitude, longitude, proximity_radius_m)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(venueId, 'London Pump Dojo', 'london-pump-dojo', 51.53639, -0.31489, 180);
    db.prepare("INSERT INTO venue_machines (id, venue_id, name, position, sort_order) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), venueId, 'London Pump Dojo 1', 'left', 0);
    db.prepare("INSERT INTO venue_machines (id, venue_id, name, position, sort_order) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), venueId, 'London Pump Dojo 2', 'right', 1);
  }

  const checkinCols = db.prepare("PRAGMA table_info(checkins)").all().map(c => c.name);
  const checkinMigrations = [
    ['client_session_id', "TEXT NOT NULL DEFAULT ''"],
    ['last_proximity_check_at', 'TEXT DEFAULT NULL'],
    ['last_near_venue_at', 'TEXT DEFAULT NULL'],
    ['last_proximity_lat', 'REAL DEFAULT NULL'],
    ['last_proximity_lng', 'REAL DEFAULT NULL'],
    ['last_proximity_accuracy_m', 'REAL DEFAULT NULL'],
    ['last_proximity_distance_m', 'REAL DEFAULT NULL'],
    ['last_proximity_status', "TEXT DEFAULT ''"],
    ['auto_checked_out_at', 'TEXT DEFAULT NULL'],
    ['checkout_reason', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of checkinMigrations) {
    if (!checkinCols.includes(col)) {
      db.exec(`ALTER TABLE checkins ADD COLUMN ${col} ${type}`);
    }
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_checkins_proximity_active ON checkins(checked_out_at, last_proximity_status, last_near_venue_at)');

  db.exec(`
    UPDATE checkins
    SET last_near_venue_at = COALESCE(last_near_venue_at, datetime('now')),
        last_proximity_status = CASE
          WHEN COALESCE(last_proximity_status, '') = '' THEN 'near'
          ELSE last_proximity_status
        END
    WHERE checked_out_at IS NULL
  `);

  bootstrapSongsFromJsonIfEmpty();
  ensureCoOpChartsFromJson();
  bootstrapChartTiersFromSnapshotIfEmpty();

  // Migration: backfill empty song flags from pump-phoenix.json
  const emptyFlagCount = db.prepare("SELECT COUNT(*) as c FROM songs WHERE flags = '' OR flags IS NULL").get();
  if (emptyFlagCount.c > 0) {
    const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const updateStmt = db.prepare('UPDATE songs SET flags = ? WHERE title = ? AND mode = ? AND level = ? AND (flags = \'\' OR flags IS NULL)');
        const backfill = db.transaction(() => {
          let updated = 0;
          for (const song of data.songs) {
            const flags = (song.flags || []).join(',');
            if (!flags) continue;
            const songTitle = resolveSongTitleForStorage(song.name || '', song.saIndex || '', song.flags || '');
            for (const chart of (song.charts || [])) {
              const mapped = chartModeLevelFromJson(chart);
              if (!mapped || mapped.level <= 0) continue;
              const result = updateStmt.run(flags, songTitle, mapped.mode, mapped.level);
              updated += result.changes;
            }
          }
          return updated;
        });
        const count = backfill();
        if (count > 0) console.log(`Backfilled flags for ${count} songs from pump-phoenix.json`);
      } catch (err) {
        console.error('Failed to backfill song flags:', err.message);
      }
    }
  }

  // Migration: normalize all short cut chart titles into their own title bucket.
  try {
    const shortCutRows = db.prepare(`
      SELECT id, title, song_key, flags
      FROM songs
      WHERE LOWER(COALESCE(flags, '')) LIKE '%cut:1%'
         OR (
           LOWER(TRIM(COALESCE(title, ''))) = 'yog-sothoth'
           AND TRIM(COALESCE(song_key, '')) = '313'
         )
    `).all();
    if (shortCutRows.length > 0) {
      const updateShortCutTitle = db.prepare('UPDATE songs SET title = ? WHERE id = ?');
      const normalizeShortCutTitles = db.transaction((rows) => {
        let updated = 0;
        for (const row of rows) {
          const normalizedTitle = resolveSongTitleForStorage(row.title || '', row.song_key || '', row.flags || '');
          if (!normalizedTitle || normalizedTitle === String(row.title || '')) continue;
          updateShortCutTitle.run(normalizedTitle, row.id);
          updated += 1;
        }
        return updated;
      });
      const updated = normalizeShortCutTitles(shortCutRows);
      if (updated > 0) {
        console.log(`Normalized ${updated} short cut chart titles`);
      }
    }
  } catch (err) {
    console.error('Failed to normalize short cut chart rows:', err.message);
  }

  backfillSongDurationsFromSnapshot();

  // Migrations for grouped new-clear payloads
  const newClearCols = db.prepare("PRAGMA table_info(user_new_clears)").all().map(c => c.name);
  if (!newClearCols.includes('clears_json')) {
    db.exec("ALTER TABLE user_new_clears ADD COLUMN clears_json TEXT DEFAULT ''");
  }
  if (!newClearCols.includes('pumbility_gain')) {
    db.exec("ALTER TABLE user_new_clears ADD COLUMN pumbility_gain INT DEFAULT 0");
  }
  if (!newClearCols.includes('singles_pumbility_gain')) {
    db.exec("ALTER TABLE user_new_clears ADD COLUMN singles_pumbility_gain INT DEFAULT 0");
  }
  const upscoreCols = db.prepare("PRAGMA table_info(user_upscores)").all().map(c => c.name);
  if (!upscoreCols.includes('pumbility_gain')) {
    db.exec("ALTER TABLE user_upscores ADD COLUMN pumbility_gain INT DEFAULT 0");
  }
  if (!upscoreCols.includes('singles_pumbility_gain')) {
    db.exec("ALTER TABLE user_upscores ADD COLUMN singles_pumbility_gain INT DEFAULT 0");
  }
  backfillLegacyGroupedNewClears();

  // Cache of PIUGame OVER Lv.20 chart rankings (top 100 per chart)
  db.exec(`
    CREATE TABLE IF NOT EXISTS over_level_rankings (
      chart_key TEXT PRIMARY KEY,
      song_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      jacket_url TEXT DEFAULT '',
      source_no TEXT DEFAULT '',
      top100_count INTEGER NOT NULL DEFAULT 0,
      min_score INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS over_level_ranking_scores (
      chart_key TEXT NOT NULL REFERENCES over_level_rankings(chart_key) ON DELETE CASCADE,
      row_order INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      grade TEXT DEFAULT '',
      player_name TEXT DEFAULT '',
      player_avatar_url TEXT DEFAULT '',
      prev_rank INTEGER NOT NULL DEFAULT 0,
      rank_delta INTEGER NOT NULL DEFAULT 0,
      played_at TEXT DEFAULT '',
      PRIMARY KEY (chart_key, row_order)
    );

    CREATE TABLE IF NOT EXISTS over_level_ranking_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_charts INTEGER NOT NULL DEFAULT 0,
      total_entries INTEGER NOT NULL DEFAULT 0,
      source_pages INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_over_level_rankings_song_mode_level
      ON over_level_rankings(song_title, mode, level);
    CREATE INDEX IF NOT EXISTS idx_over_level_ranking_scores_player_name
      ON over_level_ranking_scores(player_name);
    CREATE INDEX IF NOT EXISTS idx_over_level_sync_runs_started_at
      ON over_level_sync_runs(datetime(started_at) DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_over_level_sync_runs_type
      ON over_level_sync_runs(run_type, datetime(started_at) DESC, id DESC);
  `);

  const pumbilityLeaderboardCols = db.prepare("PRAGMA table_info(pumbility_leaderboard)").all().map((c) => c.name);
  if (!pumbilityLeaderboardCols.includes('avatar_url')) {
    db.exec("ALTER TABLE pumbility_leaderboard ADD COLUMN avatar_url TEXT DEFAULT ''");
  }
  if (!pumbilityLeaderboardCols.includes('prev_rank')) {
    db.exec("ALTER TABLE pumbility_leaderboard ADD COLUMN prev_rank INTEGER NOT NULL DEFAULT 0");
  }
  if (!pumbilityLeaderboardCols.includes('rank_delta')) {
    db.exec("ALTER TABLE pumbility_leaderboard ADD COLUMN rank_delta INTEGER NOT NULL DEFAULT 0");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_pumbility_leaderboard_player_name ON pumbility_leaderboard(player_name)");

  let overRankingScoreInfo = db.prepare("PRAGMA table_info(over_level_ranking_scores)").all();
  let overRankingScoreCols = overRankingScoreInfo.map((c) => c.name);
  if (!overRankingScoreCols.includes('row_order')) {
    const avatarSelect = overRankingScoreCols.includes('player_avatar_url') ? 'player_avatar_url' : "'' AS player_avatar_url";
    const prevRankSelect = overRankingScoreCols.includes('prev_rank') ? 'prev_rank' : '0 AS prev_rank';
    const rankDeltaSelect = overRankingScoreCols.includes('rank_delta') ? 'rank_delta' : '0 AS rank_delta';
    const existingOverRankingRows = db.prepare(`
      SELECT chart_key, rank, score, grade, player_name, ${avatarSelect}, ${prevRankSelect}, ${rankDeltaSelect}, played_at
      FROM over_level_ranking_scores
      ORDER BY chart_key ASC, score DESC, rank ASC, player_name COLLATE NOCASE ASC
    `).all();

    const migrateOverRankingScores = db.transaction(() => {
      db.exec(`
        DROP INDEX IF EXISTS idx_over_level_ranking_scores_chart_score;
        DROP INDEX IF EXISTS idx_over_level_ranking_scores_player_name;
        DROP INDEX IF EXISTS idx_over_level_ranking_scores_player_chart;
        ALTER TABLE over_level_ranking_scores RENAME TO over_level_ranking_scores_old;
        CREATE TABLE over_level_ranking_scores (
          chart_key TEXT NOT NULL REFERENCES over_level_rankings(chart_key) ON DELETE CASCADE,
          row_order INTEGER NOT NULL,
          rank INTEGER NOT NULL,
          score INTEGER NOT NULL DEFAULT 0,
          grade TEXT DEFAULT '',
          player_name TEXT DEFAULT '',
          player_avatar_url TEXT DEFAULT '',
          prev_rank INTEGER NOT NULL DEFAULT 0,
          rank_delta INTEGER NOT NULL DEFAULT 0,
          played_at TEXT DEFAULT '',
          PRIMARY KEY (chart_key, row_order)
        );
      `);

      const insert = db.prepare(`
        INSERT INTO over_level_ranking_scores (
          chart_key, row_order, rank, score, grade, player_name, player_avatar_url, prev_rank, rank_delta, played_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let currentChartKey = '';
      let currentRowOrder = 0;
      for (const row of existingOverRankingRows) {
        const chartKey = String(row?.chart_key || '').trim();
        if (!chartKey) continue;
        if (chartKey !== currentChartKey) {
          currentChartKey = chartKey;
          currentRowOrder = 0;
        }
        currentRowOrder += 1;
        insert.run(
          chartKey,
          currentRowOrder,
          parseInt(row?.rank, 10) || 0,
          parseInt(row?.score, 10) || 0,
          String(row?.grade || ''),
          String(row?.player_name || ''),
          String(row?.player_avatar_url || ''),
          parseInt(row?.prev_rank, 10) || 0,
          parseInt(row?.rank_delta, 10) || 0,
          String(row?.played_at || '')
        );
      }

      db.exec('DROP TABLE over_level_ranking_scores_old');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_over_level_ranking_scores_chart_score
          ON over_level_ranking_scores(chart_key, score DESC, row_order ASC);
        CREATE INDEX IF NOT EXISTS idx_over_level_ranking_scores_player_name
          ON over_level_ranking_scores(player_name);
        CREATE INDEX IF NOT EXISTS idx_over_level_ranking_scores_player_chart
          ON over_level_ranking_scores(player_name, chart_key);
      `);
    });

    migrateOverRankingScores();
    overRankingScoreInfo = db.prepare("PRAGMA table_info(over_level_ranking_scores)").all();
    overRankingScoreCols = overRankingScoreInfo.map((c) => c.name);
  }
  if (!overRankingScoreCols.includes('player_avatar_url')) {
    db.exec("ALTER TABLE over_level_ranking_scores ADD COLUMN player_avatar_url TEXT DEFAULT ''");
  }
  if (!overRankingScoreCols.includes('prev_rank')) {
    db.exec("ALTER TABLE over_level_ranking_scores ADD COLUMN prev_rank INTEGER NOT NULL DEFAULT 0");
  }
  if (!overRankingScoreCols.includes('rank_delta')) {
    db.exec("ALTER TABLE over_level_ranking_scores ADD COLUMN rank_delta INTEGER NOT NULL DEFAULT 0");
  }
  db.exec("DROP INDEX IF EXISTS idx_over_level_ranking_scores_chart_score");
  db.exec("CREATE INDEX IF NOT EXISTS idx_over_level_ranking_scores_chart_score ON over_level_ranking_scores(chart_key, score DESC, row_order ASC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_over_level_ranking_scores_player_chart ON over_level_ranking_scores(player_name, chart_key)");

  // Migrations for users table - add world map location fields
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const userMigrations = [
    ['is_admin', 'INT DEFAULT 0'],
    ['age', 'INT DEFAULT NULL'],
    ['height_cm', 'REAL DEFAULT NULL'],
    ['weight_kg', 'REAL DEFAULT NULL'],
    ['location_country', "TEXT DEFAULT ''"],
    ['location_country_code', "TEXT DEFAULT ''"],
    ['location_city', "TEXT DEFAULT ''"],
    ['location_lat', 'REAL DEFAULT NULL'],
    ['location_lng', 'REAL DEFAULT NULL'],
    ['avatar_v', 'INT DEFAULT 0'],
    ['playing_status', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of userMigrations) {
    if (!userCols.includes(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
    }
  }

  // Migrations for world_max_machines
  const worldMaxMachineCols = db.prepare("PRAGMA table_info(world_max_machines)").all().map(c => c.name);
  const worldMaxMachineMigrations = [
    ['address', "TEXT DEFAULT ''"],
    ['price_per_credit', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of worldMaxMachineMigrations) {
    if (!worldMaxMachineCols.includes(col)) {
      db.exec(`ALTER TABLE world_max_machines ADD COLUMN ${col} ${type}`);
    }
  }

  // Migrations for piugame sync - add progress tracking
  const syncCols = db.prepare("PRAGMA table_info(user_piugame_sync)").all().map(c => c.name);
  const syncMigrations = [
    ['sync_in_progress', "TEXT DEFAULT ''"],
    ['sync_progress', 'INT DEFAULT 0'],
    ['sync_total', 'INT DEFAULT 0'],
    ['play_data_levels_json', "TEXT DEFAULT '[]'"],
  ];
  for (const [col, type] of syncMigrations) {
    if (!syncCols.includes(col)) {
      db.exec(`ALTER TABLE user_piugame_sync ADD COLUMN ${col} ${type}`);
    }
  }

  // Migrations for communities table
  const communityCols = db.prepare("PRAGMA table_info(communities)").all().map(c => c.name);
  const communityMigrations = [
    ['index_tags', "TEXT DEFAULT '[]'"],
    ['about', "TEXT DEFAULT ''"],
    ['location_country', "TEXT DEFAULT ''"],
    ['rules', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of communityMigrations) {
    if (!communityCols.includes(col)) {
      db.exec(`ALTER TABLE communities ADD COLUMN ${col} ${type}`);
    }
  }

  // Migrations for online_duels table - add best_of format
  const onlineDuelCols = db.prepare("PRAGMA table_info(online_duels)").all().map(c => c.name);
  if (!onlineDuelCols.includes('best_of')) {
    db.exec("ALTER TABLE online_duels ADD COLUMN best_of INT DEFAULT 0");
  }

  // Migrations for user_list_items - add sort_order for manual reordering
  const listItemCols = db.prepare("PRAGMA table_info(user_list_items)").all().map(c => c.name);
  if (!listItemCols.includes('sort_order')) {
    db.exec("ALTER TABLE user_list_items ADD COLUMN sort_order INTEGER DEFAULT 0");
    // Backfill sort_order based on existing id order
    db.exec("UPDATE user_list_items SET sort_order = id WHERE sort_order = 0");
  }

  const liveSessionCols = db.prepare("PRAGMA table_info(live_sessions)").all().map((c) => c.name);
  if (!liveSessionCols.includes('youtube_broadcast_id')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN youtube_broadcast_id TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('youtube_video_id')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN youtube_video_id TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('youtube_channel_id')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN youtube_channel_id TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('youtube_stream_title')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN youtube_stream_title TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('youtube_lifecycle_status')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN youtube_lifecycle_status TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('youtube_scheduled_start_time')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN youtube_scheduled_start_time TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('youtube_actual_start_time')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN youtube_actual_start_time TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('status_text')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN status_text TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('requests_enabled')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN requests_enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!liveSessionCols.includes('request_mode_filter')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN request_mode_filter TEXT NOT NULL DEFAULT 'All'");
  }
  if (!liveSessionCols.includes('request_max_level')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN request_max_level INTEGER NOT NULL DEFAULT 30");
  }
  if (!liveSessionCols.includes('request_show_scores')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN request_show_scores INTEGER NOT NULL DEFAULT 1");
  }
  if (!liveSessionCols.includes('is_hidden_from_profile')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN is_hidden_from_profile INTEGER NOT NULL DEFAULT 0");
  }
  if (!liveSessionCols.includes('deleted_at')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN deleted_at TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('session_type')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'live'");
  }
  if (!liveSessionCols.includes('hop_warmup_started_at')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_warmup_started_at TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('hop_started_at')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_started_at TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('hop_ends_at')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_ends_at TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('hop_warmup_seconds')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_warmup_seconds INTEGER NOT NULL DEFAULT 1200");
  }
  if (!liveSessionCols.includes('hop_window_seconds')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_window_seconds INTEGER NOT NULL DEFAULT 3600");
  }
  if (!liveSessionCols.includes('hop_warmup_finished_announced_at')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_warmup_finished_announced_at TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('hop_finished_announced_at')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_finished_announced_at TEXT DEFAULT ''");
  }
  if (!liveSessionCols.includes('hop_total_rating_points')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_total_rating_points INTEGER NOT NULL DEFAULT 0");
  }
  if (!liveSessionCols.includes('hop_counted_clear_count')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_counted_clear_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!liveSessionCols.includes('hop_average_level')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_average_level REAL NOT NULL DEFAULT 0");
  }
  if (!liveSessionCols.includes('hop_average_rating_points')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_average_rating_points REAL NOT NULL DEFAULT 0");
  }
  if (!liveSessionCols.includes('hop_highest_rating_points')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_highest_rating_points INTEGER NOT NULL DEFAULT 0");
  }
  if (!liveSessionCols.includes('hop_lowest_rating_points')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_lowest_rating_points INTEGER NOT NULL DEFAULT 0");
  }
  if (!liveSessionCols.includes('hop_completed')) {
    db.exec("ALTER TABLE live_sessions ADD COLUMN hop_completed INTEGER NOT NULL DEFAULT 0");
  }
  const liveSessionIndexCols = db.prepare("PRAGMA table_info(live_sessions)").all().map((c) => c.name);
  if (
    liveSessionIndexCols.includes('session_type')
    && liveSessionIndexCols.includes('status')
    && liveSessionIndexCols.includes('hop_completed')
    && liveSessionIndexCols.includes('ended_at')
  ) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_live_sessions_type_status ON live_sessions(session_type, status, hop_completed, ended_at)');
  }

  const livePlayCols = db.prepare("PRAGMA table_info(live_session_plays)").all().map((c) => c.name);
  if (!livePlayCols.includes('played_at_utc')) {
    db.exec("ALTER TABLE live_session_plays ADD COLUMN played_at_utc TEXT DEFAULT ''");
  }
  const livePlayIndexes = db.prepare("PRAGMA index_list(live_session_plays)").all().map((c) => c.name);
  if (!livePlayIndexes.includes('idx_live_session_plays_session_time_utc')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_live_session_plays_session_time_utc ON live_session_plays(live_session_id, played_at_utc, id)');
  }

  const recentMissingUtcRows = db.prepare(`
    SELECT id, date_played
    FROM user_recently_played
    WHERE TRIM(COALESCE(date_played, '')) <> ''
      AND TRIM(COALESCE(played_at_utc, '')) = ''
  `).all();
  if (recentMissingUtcRows.length > 0) {
    const updateRecentUtc = db.prepare(`
      UPDATE user_recently_played
      SET played_at_utc = ?
      WHERE id = ?
    `);
    const backfillRecentUtc = db.transaction((rows) => {
      let updatedCount = 0;
      for (const row of rows) {
        const normalizedUtc = normalizePiugamePlayedAtUtc(row.date_played);
        if (!normalizedUtc) continue;
        updateRecentUtc.run(normalizedUtc, row.id);
        updatedCount += 1;
      }
      return updatedCount;
    });
    const updatedCount = backfillRecentUtc(recentMissingUtcRows);
    if (updatedCount > 0) {
      console.log(`Backfilled played_at_utc for ${updatedCount} recently played rows`);
    }
  }

  const recentPlayCols = db.prepare("PRAGMA table_info(user_recently_played)").all().map((c) => c.name);
  if (!recentPlayCols.includes('replay_embed_url')) {
    db.exec("ALTER TABLE user_recently_played ADD COLUMN replay_embed_url TEXT DEFAULT ''");
  }
  if (!recentPlayCols.includes('replay_video_id')) {
    db.exec("ALTER TABLE user_recently_played ADD COLUMN replay_video_id TEXT DEFAULT ''");
  }
  if (!recentPlayCols.includes('replay_start_seconds')) {
    db.exec("ALTER TABLE user_recently_played ADD COLUMN replay_start_seconds INTEGER DEFAULT 0");
  }
  if (!recentPlayCols.includes('replay_end_seconds')) {
    db.exec("ALTER TABLE user_recently_played ADD COLUMN replay_end_seconds INTEGER DEFAULT 0");
  }

  const liveMissingUtcRows = db.prepare(`
    SELECT id, date_played
    FROM live_session_plays
    WHERE TRIM(COALESCE(date_played, '')) <> ''
      AND TRIM(COALESCE(played_at_utc, '')) = ''
  `).all();
  if (liveMissingUtcRows.length > 0) {
    const updateLiveUtc = db.prepare(`
      UPDATE live_session_plays
      SET played_at_utc = ?
      WHERE id = ?
    `);
    const backfillLiveUtc = db.transaction((rows) => {
      let updatedCount = 0;
      for (const row of rows) {
        const normalizedUtc = normalizePiugamePlayedAtUtc(row.date_played);
        if (!normalizedUtc) continue;
        updateLiveUtc.run(normalizedUtc, row.id);
        updatedCount += 1;
      }
      return updatedCount;
    });
    const updatedCount = backfillLiveUtc(liveMissingUtcRows);
    if (updatedCount > 0) {
      console.log(`Backfilled played_at_utc for ${updatedCount} live session plays`);
    }
  }

  const liveRequestCols = db.prepare("PRAGMA table_info(live_session_requests)").all().map((c) => c.name);
  const liveRequestMigrations = [
    ['status', "TEXT NOT NULL DEFAULT 'open'"],
    ['handled_at', "TEXT DEFAULT ''"],
    ['handled_by_user_id', "TEXT DEFAULT ''"],
    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
    ['target_user_id', "TEXT DEFAULT ''"],
    ['target_username', "TEXT DEFAULT ''"],
  ];
  for (const [col, type] of liveRequestMigrations) {
    if (!liveRequestCols.includes(col)) {
      db.exec(`ALTER TABLE live_session_requests ADD COLUMN ${col} ${type}`);
    }
  }
  db.exec(`
    UPDATE live_session_requests
    SET status = CASE
      WHEN fulfilled = 1 THEN 'played'
      ELSE 'open'
    END
    WHERE COALESCE(status, '') = ''
       OR status NOT IN ('open', 'queued', 'played', 'skipped');

    UPDATE live_session_requests
    SET updated_at = COALESCE(NULLIF(updated_at, ''), created_at, datetime('now'))
    WHERE COALESCE(updated_at, '') = '';

    UPDATE live_session_requests
    SET target_username = COALESCE((
      SELECT u.username
      FROM users u
      WHERE u.id = live_session_requests.target_user_id
      LIMIT 1
    ), '')
    WHERE COALESCE(target_user_id, '') <> ''
      AND COALESCE(target_username, '') = '';
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_session_participants (
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'cohost',
      status TEXT NOT NULL DEFAULT 'active',
      added_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT DEFAULT (datetime('now')),
      left_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (live_session_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS live_session_participant_sync (
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recent_anchor_id INTEGER NOT NULL DEFAULT 0,
      last_recent_row_id INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT DEFAULT '',
      last_sync_status TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (live_session_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS live_session_moderation (
      live_session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chat_muted INTEGER NOT NULL DEFAULT 0,
      requests_blocked INTEGER NOT NULL DEFAULT 0,
      moderated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (live_session_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_live_session_requests_session_status ON live_session_requests(live_session_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_requests_session_target ON live_session_requests(live_session_id, target_user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_participants_session ON live_session_participants(live_session_id, status, role, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_participants_user ON live_session_participants(user_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_participant_sync_session ON live_session_participant_sync(live_session_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_moderation_session ON live_session_moderation(live_session_id, updated_at);
  `);

  const liveBufferedUpscoreCols = db.prepare("PRAGMA table_info(live_session_buffered_upscores)").all().map((c) => c.name);
  const liveBufferedUpscoreMigrations = [
    ['performer_user_id', "TEXT NOT NULL DEFAULT ''"],
    ['finalized_at', "TEXT DEFAULT ''"],
    ['finalized_post_id', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [col, type] of liveBufferedUpscoreMigrations) {
    if (!liveBufferedUpscoreCols.includes(col)) {
      db.exec(`ALTER TABLE live_session_buffered_upscores ADD COLUMN ${col} ${type}`);
    }
  }

  const liveBufferedClearCols = db.prepare("PRAGMA table_info(live_session_buffered_clears)").all().map((c) => c.name);
  const liveBufferedClearMigrations = [
    ['performer_user_id', "TEXT NOT NULL DEFAULT ''"],
    ['finalized_at', "TEXT DEFAULT ''"],
    ['finalized_post_id', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [col, type] of liveBufferedClearMigrations) {
    if (!liveBufferedClearCols.includes(col)) {
      db.exec(`ALTER TABLE live_session_buffered_clears ADD COLUMN ${col} ${type}`);
    }
  }

  db.exec(`
    UPDATE live_session_buffered_upscores
    SET performer_user_id = COALESCE(NULLIF(json_extract(payload_json, '$.performer_user_id'), ''), performer_user_id, '')
    WHERE COALESCE(performer_user_id, '') = ''
      AND json_valid(payload_json) = 1;

    UPDATE live_session_buffered_upscores
    SET performer_user_id = COALESCE((
      SELECT s.host_user_id
      FROM live_sessions s
      WHERE s.id = live_session_buffered_upscores.live_session_id
      LIMIT 1
    ), '')
    WHERE COALESCE(performer_user_id, '') = '';

    UPDATE live_session_buffered_clears
    SET performer_user_id = COALESCE(NULLIF(json_extract(payload_json, '$.performer_user_id'), ''), performer_user_id, '')
    WHERE COALESCE(performer_user_id, '') = ''
      AND json_valid(payload_json) = 1;

    UPDATE live_session_buffered_clears
    SET performer_user_id = COALESCE((
      SELECT s.host_user_id
      FROM live_sessions s
      WHERE s.id = live_session_buffered_clears.live_session_id
      LIMIT 1
    ), '')
    WHERE COALESCE(performer_user_id, '') = '';

    CREATE INDEX IF NOT EXISTS idx_live_session_buffered_upscores_session_user
      ON live_session_buffered_upscores(live_session_id, performer_user_id, finalized_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_live_session_buffered_clears_session_user
      ON live_session_buffered_clears(live_session_id, performer_user_id, finalized_at, created_at);
  `);

  db.exec(`
    INSERT INTO live_session_participants (
      live_session_id, user_id, role, status, added_by_user_id, joined_at, left_at, created_at, updated_at
    )
    SELECT
      s.id,
      s.host_user_id,
      'owner',
      'active',
      s.host_user_id,
      COALESCE(NULLIF(s.started_at, ''), s.created_at, datetime('now')),
      '',
      COALESCE(NULLIF(s.created_at, ''), datetime('now')),
      datetime('now')
    FROM live_sessions s
    WHERE NOT EXISTS (
      SELECT 1
      FROM live_session_participants p
      WHERE p.live_session_id = s.id
        AND p.user_id = s.host_user_id
    );

    INSERT INTO live_session_participant_sync (
      live_session_id, user_id, recent_anchor_id, last_recent_row_id, last_sync_at, last_sync_status, created_at, updated_at
    )
    SELECT
      s.id,
      s.host_user_id,
      COALESCE(s.recent_anchor_id, 0),
      COALESCE(s.last_recent_row_id, 0),
      COALESCE(s.last_sync_at, ''),
      COALESCE(s.last_sync_status, ''),
      COALESCE(NULLIF(s.created_at, ''), datetime('now')),
      datetime('now')
    FROM live_sessions s
    WHERE NOT EXISTS (
      SELECT 1
      FROM live_session_participant_sync ps
      WHERE ps.live_session_id = s.id
        AND ps.user_id = s.host_user_id
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS live_message_pumps (
      message_id TEXT NOT NULL REFERENCES live_session_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_live_message_pumps_message ON live_message_pumps(message_id, created_at);
  `);

  // ── Venue Day Pass & Subscription System ──────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS venue_access_plans (
      id TEXT PRIMARY KEY,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      plan_type TEXT NOT NULL CHECK(plan_type IN ('day_pass_weekday', 'day_pass_weekend', 'monthly')),
      name TEXT NOT NULL,
      price_amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'gbp',
      square_plan_variation_id TEXT,
      monthly_cadences_json TEXT DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_venue_access_plans_venue ON venue_access_plans(venue_id, plan_type);

    CREATE TABLE IF NOT EXISTS venue_approved_users (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      approved_by TEXT REFERENCES users(id),
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, venue_id)
    );
    CREATE INDEX IF NOT EXISTS idx_venue_approved_users_venue ON venue_approved_users(venue_id);

    CREATE TABLE IF NOT EXISTS venue_user_discounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      discount_percent INTEGER NOT NULL CHECK(discount_percent IN (10, 20, 50)),
      applies_to TEXT NOT NULL DEFAULT 'all' CHECK(applies_to IN ('all', 'monthly', 'day_pass')),
      active INTEGER NOT NULL DEFAULT 1,
      granted_by TEXT REFERENCES users(id),
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_venue_user_discounts_user ON venue_user_discounts(user_id, venue_id, active);

    CREATE TABLE IF NOT EXISTS venue_day_passes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES venue_access_plans(id) ON DELETE CASCADE,
      pass_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'used', 'expired', 'cancelled', 'refunded')),
      payment_id TEXT REFERENCES venue_payments(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_venue_day_passes_user ON venue_day_passes(user_id, pass_date);
    CREATE INDEX IF NOT EXISTS idx_venue_day_passes_venue_date ON venue_day_passes(venue_id, pass_date);
    CREATE INDEX IF NOT EXISTS idx_venue_day_passes_payment ON venue_day_passes(payment_id);

    CREATE TABLE IF NOT EXISTS venue_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES venue_access_plans(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'past_due', 'cancelled', 'expired')),
      square_subscription_id TEXT,
      subscription_cadence_key TEXT DEFAULT '',
      subscription_cadence_label TEXT DEFAULT '',
      billing_interval_months INTEGER NOT NULL DEFAULT 1,
      current_period_start TEXT,
      current_period_end TEXT,
      cancelled_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_venue_subscriptions_user ON venue_subscriptions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_venue_subscriptions_venue ON venue_subscriptions(venue_id, status);
    CREATE INDEX IF NOT EXISTS idx_venue_subscriptions_square ON venue_subscriptions(square_subscription_id);

    CREATE TABLE IF NOT EXISTS venue_payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      plan_id TEXT REFERENCES venue_access_plans(id) ON DELETE SET NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('day_pass', 'subscription', 'subscription_renewal')),
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'gbp',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'succeeded', 'failed', 'refunded')),
      subscription_cadence_key TEXT DEFAULT '',
      subscription_cadence_label TEXT DEFAULT '',
      billing_interval_months INTEGER NOT NULL DEFAULT 1,
      square_payment_id TEXT,
      square_order_id TEXT,
      square_link_id TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_venue_payments_user ON venue_payments(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_venue_payments_venue ON venue_payments(venue_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_venue_payments_square_payment ON venue_payments(square_payment_id);
    CREATE INDEX IF NOT EXISTS idx_venue_payments_square_order ON venue_payments(square_order_id);
    CREATE INDEX IF NOT EXISTS idx_venue_payments_square_link ON venue_payments(square_link_id);

    CREATE TABLE IF NOT EXISTS venue_access_notification_subscriptions (
      subscriber_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      notify_subscription_events INTEGER NOT NULL DEFAULT 1,
      notify_day_pass_purchases INTEGER NOT NULL DEFAULT 1,
      notify_payments INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (subscriber_user_id, venue_id)
    );
    CREATE INDEX IF NOT EXISTS idx_venue_access_notif_subscriber ON venue_access_notification_subscriptions(subscriber_user_id);
    CREATE INDEX IF NOT EXISTS idx_venue_access_notif_venue ON venue_access_notification_subscriptions(venue_id);
  `);

  const venuePlanCols = db.prepare("PRAGMA table_info(venue_access_plans)").all().map(c => c.name);
  if (!venuePlanCols.includes('monthly_cadences_json')) {
    db.exec("ALTER TABLE venue_access_plans ADD COLUMN monthly_cadences_json TEXT DEFAULT '[]'");
  }

  const venueSubscriptionCols = db.prepare("PRAGMA table_info(venue_subscriptions)").all().map(c => c.name);
  if (!venueSubscriptionCols.includes('subscription_cadence_key')) {
    db.exec("ALTER TABLE venue_subscriptions ADD COLUMN subscription_cadence_key TEXT DEFAULT ''");
  }
  if (!venueSubscriptionCols.includes('subscription_cadence_label')) {
    db.exec("ALTER TABLE venue_subscriptions ADD COLUMN subscription_cadence_label TEXT DEFAULT ''");
  }
  if (!venueSubscriptionCols.includes('billing_interval_months')) {
    db.exec("ALTER TABLE venue_subscriptions ADD COLUMN billing_interval_months INTEGER NOT NULL DEFAULT 1");
  }

  const venuePaymentCols = db.prepare("PRAGMA table_info(venue_payments)").all().map(c => c.name);
  if (!venuePaymentCols.includes('subscription_cadence_key')) {
    db.exec("ALTER TABLE venue_payments ADD COLUMN subscription_cadence_key TEXT DEFAULT ''");
  }
  if (!venuePaymentCols.includes('subscription_cadence_label')) {
    db.exec("ALTER TABLE venue_payments ADD COLUMN subscription_cadence_label TEXT DEFAULT ''");
  }
  if (!venuePaymentCols.includes('billing_interval_months')) {
    db.exec("ALTER TABLE venue_payments ADD COLUMN billing_interval_months INTEGER NOT NULL DEFAULT 1");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ui_translation_overrides (
      locale TEXT NOT NULL,
      translation_key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'accepted')),
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (locale, translation_key)
    );
    CREATE INDEX IF NOT EXISTS idx_ui_translation_overrides_locale
      ON ui_translation_overrides(locale, status, updated_at DESC);
  `);

  ensureBuiltInAchievementSeries(db);
  bootstrapChangelogEntriesIfEmpty();
}

// Prevent route handlers from closing the shared connection
db.close = () => {};

module.exports = { getDb, initializeDb, DB_PATH };

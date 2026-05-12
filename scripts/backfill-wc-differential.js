// Create properly scoped WC play posts — only differential for latest sessions
const crypto = require('crypto');
process.env.DATABASE_PATH = process.env.DATABASE_PATH || '/var/data/shinsa/shinsa.db';
const { initializeDb, getDb } = require('../server/db/schema');
const { calculateRatingPoints } = require('../server/lib/titleProgress');
const { makeChartKey, toCanonicalTitle } = require('../server/lib/chartKeys');
const path = require('path');

initializeDb();
const db = getDb();

function safeParseJsonArray(raw) {
  try { const arr = JSON.parse(raw || '[]'); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

// Load aliases
let aliases = {};
try {
  const aliasPath = path.join(__dirname, '..', 'server', 'data', 'piugame-song-aliases.json');
  const payload = require(aliasPath);
  const rawAliases = (payload && typeof payload.aliases === 'object' && payload.aliases) || {};
  for (const [alias, canonical] of Object.entries(rawAliases)) {
    const aliasNorm = toCanonicalTitle(alias, {});
    const canonicalNorm = toCanonicalTitle(canonical, {});
    if (aliasNorm && canonicalNorm && aliasNorm !== canonicalNorm) aliases[aliasNorm] = canonicalNorm;
  }
} catch {}

const week = db.prepare("SELECT * FROM weekly_challenge_weeks WHERE status = 'active' LIMIT 1").get();
if (!week) { console.log('No active week'); process.exit(); }

const wcCharts = db.prepare('SELECT * FROM weekly_challenge_charts WHERE week_id = ?').all(week.id);
const chartKeyLookup = {};
const directLookup = {};
for (const wc of wcCharts) {
  const ck = makeChartKey(wc.song_title_snapshot, wc.mode, wc.level, aliases);
  if (ck) chartKeyLookup[ck] = wc;
  directLookup[`${wc.song_title_snapshot}|${wc.mode}|${wc.level}`] = wc;
}

const users = [
  { id: 'c1eff856-0297-4c22-b454-3b1fedd0301c', label: 'ELMER' },
  { id: 'f5681128-2ea0-4470-b932-f012148f6dc2', label: 'molamola' },
];

for (const { id: userId, label } of users) {
  // Build map of already-posted best scores
  const existingPosts = db.prepare(
    'SELECT plays_json FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ?'
  ).all(userId, week.id);
  const previousBests = new Map();
  for (const post of existingPosts) {
    for (const p of safeParseJsonArray(post.plays_json)) {
      const key = `${p.song_title}|${p.mode}|${p.level}`;
      const prev = previousBests.get(key);
      if (!prev || p.score > prev.score) previousBests.set(key, p);
    }
  }
  console.log(`${label}: ${previousBests.size} charts already posted`);

  // Get all plays in window
  const plays = db.prepare(`
    SELECT * FROM user_recently_played
    WHERE user_id = ? AND score > 0 AND mode IN ('Single', 'Double')
      AND COALESCE(NULLIF(played_at_utc, ''), date_played) >= ?
      AND COALESCE(NULLIF(played_at_utc, ''), date_played) <= ?
  `).all(userId, week.starts_at_utc, week.ends_at_utc);

  // Match to WC charts and find best per chart
  const bestByChart = new Map();
  const bgTitleCache = {};
  for (const p of plays) {
    const ck = makeChartKey(p.song_title, p.mode, p.level, aliases);
    let wc = ck ? chartKeyLookup[ck] : null;
    if (!wc) wc = directLookup[`${p.song_title}|${p.mode}|${p.level}`];
    if (!wc && p.background_url) {
      const bgMatch = p.background_url.match(/song_img\/([a-f0-9]+)\./);
      if (bgMatch) {
        const bgKey = `${bgMatch[1]}|${p.mode}|${p.level}`;
        if (!(bgKey in bgTitleCache)) {
          const row = db.prepare("SELECT DISTINCT song_title FROM user_recently_played WHERE background_url = ? AND mode = ? AND level = ? AND song_title GLOB '[A-Za-z0-9]*' LIMIT 1").get(p.background_url, p.mode, p.level);
          bgTitleCache[bgKey] = row ? row.song_title : null;
        }
        const canonical = bgTitleCache[bgKey];
        if (canonical) {
          const fallbackCk = makeChartKey(canonical, p.mode, p.level, aliases);
          wc = fallbackCk ? chartKeyLookup[fallbackCk] : null;
        }
      }
    }
    if (!wc) continue;

    const key = `${p.song_title}|${p.mode}|${p.level}`;
    const existing = bestByChart.get(key);
    if (!existing || p.score > existing.score) bestByChart.set(key, { play: p, wc });
  }

  // Find differential — only new or improved vs what's already posted
  const differential = [];
  for (const [key, { play: p, wc }] of bestByChart) {
    const prev = previousBests.get(key);
    // Also check with the WC chart's canonical title
    const canonKey = `${wc.song_title_snapshot}|${wc.mode}|${wc.level}`;
    const prevCanon = previousBests.get(canonKey);
    const bestPrev = prev || prevCanon;
    if (!bestPrev || p.score > bestPrev.score) {
      // Resolve replay URL
      let replayUrl = p.replay_embed_url || '';
      if (!replayUrl) {
        const chart = db.prepare('SELECT id FROM songs WHERE title = ? AND mode = ? AND level = ? LIMIT 1').get(wc.song_title_snapshot, p.mode, p.level);
        if (chart) {
          const yt = db.prepare('SELECT session_youtube_url FROM user_chart_youtube_links WHERE user_id = ? AND chart_id = ? LIMIT 1').get(userId, chart.id);
          if (yt?.session_youtube_url) replayUrl = yt.session_youtube_url;
        }
      }
      differential.push({
        song_title: p.song_title, mode: p.mode, level: p.level, score: p.score,
        grade: p.grade || '', plate: p.plate || '', background_url: p.background_url || '',
        machine_name: p.machine_name || '', played_at_utc: p.played_at_utc || '', date_played: p.date_played || '',
        perfect: p.perfect || 0, great: p.great || 0, good: p.good || 0, bad: p.bad || 0, miss: p.miss || 0,
        replay_embed_url: replayUrl, replay_video_id: p.replay_video_id || '',
        weekly_challenge_week_key: week.week_key, weekly_challenge_chart_id: wc.id,
        rating_points: calculateRatingPoints(p.level, p.grade, p.score),
      });
    }
  }

  if (differential.length === 0) { console.log(`${label}: nothing new to post`); continue; }

  console.log(`${label}: ${differential.length} new/improved charts:`);
  for (const d of differential) console.log(`  ${d.song_title} ${d.mode} ${d.level} => ${d.score} ${d.grade} machine=${d.machine_name} replay=${d.replay_embed_url ? 'yes' : 'no'}`);

  const playsJson = JSON.stringify(differential);
  const hashInput = differential.map(p => `${p.song_title}|${p.mode}|${p.level}|${p.score}`).sort().join('\n');
  const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 32);

  const dupeCheck = db.prepare(
    'SELECT id FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ? AND content_hash = ? LIMIT 1'
  ).get(userId, week.id, contentHash);
  if (dupeCheck) { console.log(`${label}: already posted (hash match)`); continue; }

  db.prepare(
    'INSERT INTO user_weekly_challenge_plays (user_id, week_id, plays_json, content_hash) VALUES (?, ?, ?, ?)'
  ).run(userId, week.id, playsJson, contentHash);
  console.log(`${label}: POSTED ${differential.length} WC plays`);
}

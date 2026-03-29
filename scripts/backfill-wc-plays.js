// One-time backfill: create missing weekly challenge play posts for specific users
const crypto = require('crypto');
process.env.DATABASE_PATH = process.env.DATABASE_PATH || '/var/data/shinsa/shinsa.db';
const { initializeDb, getDb } = require('../server/db/schema');
const { ensureCurrentWeeklyChallengeWeek } = require('../server/lib/weeklyChallenges');
const { calculateRatingPoints } = require('../server/lib/titleProgress');
const { makeChartKey, toCanonicalTitle } = require('../server/lib/chartKeys');

initializeDb();
const db = getDb();

function safeParseJsonArray(raw) {
  try { const arr = JSON.parse(raw || '[]'); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

const userIds = [
  'c1eff856-0297-4c22-b454-3b1fedd0301c', // ELMER
  'f5681128-2ea0-4470-b932-f012148f6dc2', // molamola
];

ensureCurrentWeeklyChallengeWeek(db);
const week = db.prepare("SELECT * FROM weekly_challenge_weeks WHERE status = 'active' LIMIT 1").get();
if (!week) { console.log('No active week'); process.exit(); }
console.log('Active week:', week.week_key, 'window:', week.starts_at_utc, 'to', week.ends_at_utc);

// Build chart lookup from WC charts (alias-aware, same as aggregateWeeklyResults)
const wcCharts = db.prepare('SELECT * FROM weekly_challenge_charts WHERE week_id = ?').all(week.id);

// Load aliases
let aliases = {};
try {
  const aliasPath = require('path').join(__dirname, '..', 'server', 'data', 'piugame-song-aliases.json');
  const payload = require(aliasPath);
  const rawAliases = (payload && typeof payload.aliases === 'object' && payload.aliases) || {};
  for (const [alias, canonical] of Object.entries(rawAliases)) {
    const aliasNorm = toCanonicalTitle(alias, {});
    const canonicalNorm = toCanonicalTitle(canonical, {});
    if (aliasNorm && canonicalNorm && aliasNorm !== canonicalNorm) aliases[aliasNorm] = canonicalNorm;
  }
} catch {}

const chartKeyLookup = {};
const directLookup = {};
for (const wc of wcCharts) {
  const ck = makeChartKey(wc.song_title_snapshot, wc.mode, wc.level, aliases);
  if (ck) chartKeyLookup[ck] = wc;
  directLookup[`${wc.song_title_snapshot}|${wc.mode}|${wc.level}`] = wc;
}
console.log('WC charts:', wcCharts.length);

for (const userId of userIds) {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  const label = user ? user.username : userId;

  // Get all passing plays in the week window
  const plays = db.prepare(`
    SELECT * FROM user_recently_played
    WHERE user_id = ? AND score > 0 AND mode IN ('Single', 'Double')
      AND COALESCE(NULLIF(played_at_utc, ''), date_played) >= ?
      AND COALESCE(NULLIF(played_at_utc, ''), date_played) <= ?
  `).all(userId, week.starts_at_utc, week.ends_at_utc);

  console.log(`${label}: ${plays.length} passing plays in window`);

  // Match to WC charts (alias-aware + background_url fallback, same as aggregateWeeklyResults)
  const bgTitleCache = {};
  const wcMatched = [];
  for (const p of plays) {
    // Try alias-aware chart key match
    const ck = makeChartKey(p.song_title, p.mode, p.level, aliases);
    let wc = ck ? chartKeyLookup[ck] : null;
    // Fallback: direct title match
    if (!wc) wc = directLookup[`${p.song_title}|${p.mode}|${p.level}`];
    // Fallback: resolve via background_url
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
    if (wc) {
      // Resolve replay URL from user_chart_youtube_links if not in recently_played
      let replayUrl = p.replay_embed_url || '';
      if (!replayUrl) {
        const chart = db.prepare('SELECT id FROM songs WHERE title = ? AND mode = ? AND level = ? LIMIT 1').get(wc.song_title_snapshot, p.mode, p.level);
        if (chart) {
          const yt = db.prepare('SELECT session_youtube_url FROM user_chart_youtube_links WHERE user_id = ? AND chart_id = ? LIMIT 1').get(userId, chart.id);
          if (yt?.session_youtube_url) replayUrl = yt.session_youtube_url;
        }
      }
      wcMatched.push({
        song_title: p.song_title, mode: p.mode, level: p.level, score: p.score,
        grade: p.grade || '', plate: p.plate || '', background_url: p.background_url || '',
        machine_name: p.machine_name || '', played_at_utc: p.played_at_utc || '', date_played: p.date_played || '',
        perfect: p.perfect || 0, great: p.great || 0, good: p.good || 0, bad: p.bad || 0, miss: p.miss || 0,
        replay_embed_url: replayUrl, replay_video_id: p.replay_video_id || '',
        weekly_challenge_week_key: week.week_key,
        weekly_challenge_chart_id: wc.id,
        rating_points: calculateRatingPoints(p.level, p.grade, p.score),
      });
    }
  }
  console.log(`${label}: ${wcMatched.length} WC chart matches`);

  if (wcMatched.length === 0) continue;

  // Dedupe to best per chart
  const bestByChart = new Map();
  for (const p of wcMatched) {
    const key = `${p.song_title}|${p.mode}|${p.level}`;
    const existing = bestByChart.get(key);
    if (!existing || p.score > existing.score) bestByChart.set(key, p);
  }

  // Check existing posts
  const existingPosts = db.prepare(
    'SELECT id, plays_json FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ? ORDER BY id ASC'
  ).all(userId, week.id);
  const previousBests = new Map();
  for (const post of existingPosts) {
    const oldPlays = safeParseJsonArray(post.plays_json);
    for (const p of oldPlays) {
      const key = `${p.song_title}|${p.mode}|${p.level}`;
      const prev = previousBests.get(key);
      if (!prev || p.score > prev.score) previousBests.set(key, p);
    }
  }

  const differential = [];
  for (const [key, play] of bestByChart) {
    const prev = previousBests.get(key);
    if (!prev || play.score > prev.score) differential.push(play);
  }

  if (differential.length === 0) { console.log(`${label}: nothing new to post`); continue; }

  console.log(`${label}: ${differential.length} new/improved charts:`);
  for (const d of differential) console.log(`  ${d.song_title} ${d.mode} ${d.level} => ${d.score} ${d.grade}`);

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
  console.log(`${label}: posted ${differential.length} WC plays`);
}

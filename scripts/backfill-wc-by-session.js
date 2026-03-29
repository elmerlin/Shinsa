// Backfill WC play posts split by session date, with proper differential logic
// Each session date gets its own post with only the new/improved charts from that day
const crypto = require('crypto');
const path = require('path');
const { initializeDb, getDb } = require('../server/db/schema');
const { calculateRatingPoints } = require('../server/lib/titleProgress');
const { makeChartKey, toCanonicalTitle } = require('../server/lib/chartKeys');

initializeDb();
const db = getDb();

// Load aliases
let aliases = {};
try {
  const aliasPath = path.join(__dirname, '..', 'server', 'data', 'piugame-song-aliases.json');
  const payload = require(aliasPath);
  const rawAliases = (payload && typeof payload.aliases === 'object' && payload.aliases) || {};
  for (const [alias, canonical] of Object.entries(rawAliases)) {
    const aN = toCanonicalTitle(alias, {});
    const cN = toCanonicalTitle(canonical, {});
    if (aN && cN && aN !== cN) aliases[aN] = cN;
  }
} catch {}

const userId = process.argv[2];
if (!userId) { console.log('Usage: node backfill-wc-by-session.js <userId>'); process.exit(1); }

const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
console.log('User:', user?.username || userId);

const week = db.prepare("SELECT * FROM weekly_challenge_weeks WHERE status = 'active' LIMIT 1").get();
if (!week) { console.log('No active week'); process.exit(); }
console.log('Week:', week.week_key);

// Build WC chart lookups
const wcCharts = db.prepare('SELECT * FROM weekly_challenge_charts WHERE week_id = ?').all(week.id);
const chartKeyLookup = {};
const directLookup = {};
for (const wc of wcCharts) {
  const ck = makeChartKey(wc.song_title_snapshot, wc.mode, wc.level, aliases);
  if (ck) chartKeyLookup[ck] = wc;
  directLookup[`${wc.song_title_snapshot}|${wc.mode}|${wc.level}`] = wc;
}

// Get ALL plays in window, ordered chronologically
const plays = db.prepare(`
  SELECT * FROM user_recently_played
  WHERE user_id = ? AND score > 0 AND mode IN ('Single', 'Double')
    AND COALESCE(NULLIF(played_at_utc, ''), date_played) >= ?
    AND COALESCE(NULLIF(played_at_utc, ''), date_played) <= ?
  ORDER BY COALESCE(NULLIF(played_at_utc, ''), date_played) ASC
`).all(userId, week.starts_at_utc, week.ends_at_utc);

// Match plays to WC charts
const bgTitleCache = {};
function matchWcChart(p) {
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
  return wc;
}

// Group WC-matched plays by session date (UTC date)
const sessionGroups = new Map(); // dateKey -> [{ play, wc }]
for (const p of plays) {
  const wc = matchWcChart(p);
  if (!wc) continue;
  const utc = p.played_at_utc || '';
  const dateKey = utc.slice(0, 10) || 'unknown'; // "2026-03-27"
  if (!sessionGroups.has(dateKey)) sessionGroups.set(dateKey, []);
  sessionGroups.get(dateKey).push({ play: p, wc });
}

console.log(`${sessionGroups.size} session dates with WC plays`);

// Process each session date in order, maintaining running best scores
const runningBests = new Map(); // chartKey -> best score
const insert = db.prepare(
  'INSERT INTO user_weekly_challenge_plays (user_id, week_id, plays_json, content_hash, created_at) VALUES (?, ?, ?, ?, ?)'
);

for (const [dateKey, group] of [...sessionGroups.entries()].sort()) {
  // Find best per chart for this session date
  const dateBests = new Map();
  for (const { play, wc } of group) {
    const key = `${play.song_title}|${play.mode}|${play.level}`;
    const existing = dateBests.get(key);
    if (!existing || play.score > existing.play.score) dateBests.set(key, { play, wc });
  }

  // Compute differential against running bests
  const differential = [];
  for (const [key, { play, wc }] of dateBests) {
    const prevBest = runningBests.get(key) || 0;
    if (play.score > prevBest) {
      // Resolve replay URL
      let replayUrl = play.replay_embed_url || '';
      if (!replayUrl) {
        const chart = db.prepare('SELECT id FROM songs WHERE title = ? AND mode = ? AND level = ? LIMIT 1').get(wc.song_title_snapshot, play.mode, play.level);
        if (chart) {
          const yt = db.prepare('SELECT session_youtube_url FROM user_chart_youtube_links WHERE user_id = ? AND chart_id = ? LIMIT 1').get(userId, chart.id);
          if (yt?.session_youtube_url) replayUrl = yt.session_youtube_url;
        }
      }
      differential.push({
        song_title: play.song_title, mode: play.mode, level: play.level, score: play.score,
        grade: play.grade || '', plate: play.plate || '', background_url: play.background_url || '',
        machine_name: play.machine_name || '', played_at_utc: play.played_at_utc || '', date_played: play.date_played || '',
        perfect: play.perfect || 0, great: play.great || 0, good: play.good || 0, bad: play.bad || 0, miss: play.miss || 0,
        replay_embed_url: replayUrl, replay_video_id: play.replay_video_id || '',
        weekly_challenge_week_key: week.week_key, weekly_challenge_chart_id: wc.id,
        rating_points: calculateRatingPoints(play.level, play.grade, play.score),
      });
      // Update running best
      runningBests.set(key, play.score);
    }
  }

  if (differential.length === 0) {
    console.log(`  ${dateKey}: no new/improved charts`);
    continue;
  }

  // Use a created_at timestamp from the session date (end of day)
  const createdAt = `${dateKey} 20:30:00`;

  const playsJson = JSON.stringify(differential);
  const hashInput = differential.map(p => `${p.song_title}|${p.mode}|${p.level}|${p.score}`).sort().join('\n');
  const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 32);

  insert.run(userId, week.id, playsJson, contentHash, createdAt);
  console.log(`  ${dateKey}: posted ${differential.length} charts`);
  for (const d of differential) {
    console.log(`    ${d.song_title} ${d.mode} ${d.level} => ${d.score} ${d.grade} replay=${d.replay_embed_url ? 'yes' : 'no'}`);
  }
}

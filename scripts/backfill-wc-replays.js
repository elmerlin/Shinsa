#!/usr/bin/env node
/**
 * Backfill: create differential WC posts for new higher scores + add replays.
 * Also updates existing posts to include replay data.
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const db = new Database(process.env.DATABASE_PATH || '/var/data/shinsa/shinsa.db');
db.pragma('journal_mode = WAL');
const { calculateRatingPoints } = require(path.resolve(__dirname, '../server/lib/titleProgress'));
const { annotateWeeklyChallengePlayRows, ensureCurrentWeeklyChallengeWeek } = require(path.resolve(__dirname, '../server/lib/weeklyChallenges'));

const USER_IDS = process.argv.slice(2);
if (USER_IDS.length === 0) {
  const week = db.prepare("SELECT id, week_key FROM weekly_challenge_weeks WHERE status = 'active' LIMIT 1").get();
  if (!week) { console.log('No active week'); process.exit(0); }
  const posts = db.prepare('SELECT DISTINCT user_id FROM user_weekly_challenge_plays WHERE week_id = ?').all(week.id);
  for (const p of posts) USER_IDS.push(p.user_id);
  console.log(`Processing ${USER_IDS.length} users for ${week.week_key}`);
}

ensureCurrentWeeklyChallengeWeek(db);

const week = db.prepare("SELECT id, week_key, starts_at_utc, ends_at_utc FROM weekly_challenge_weeks WHERE status = 'active' LIMIT 1").get();
if (!week) { console.log('No active week'); process.exit(0); }

function buildPlayEntry(p) {
  return {
    song_title: p.song_title, mode: p.mode, level: p.level, score: p.score,
    grade: p.grade, plate: p.plate || '', background_url: p.background_url || '',
    perfect: p.perfect || 0, great: p.great || 0, good: p.good || 0, bad: p.bad || 0, miss: p.miss || 0,
    replay_embed_url: p.replay_embed_url || '', replay_video_id: p.replay_video_id || '',
    replay_start_seconds: p.replay_start_seconds || 0, replay_end_seconds: p.replay_end_seconds || 0,
    weekly_challenge_rank: p.weekly_challenge_rank || null,
    weekly_challenge_week_key: p.weekly_challenge_week_key || week.week_key,
    weekly_challenge_chart_id: p.weekly_challenge_chart_id || null,
    rating_points: calculateRatingPoints(p.level, p.grade, p.score),
  };
}

for (const userId of USER_IDS) {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  console.log(`\n=== ${user?.username || userId} ===`);

  // Get all plays in the week window with full data
  const plays = db.prepare(`
    SELECT song_title, mode, level, score, grade, plate, background_url,
           COALESCE(NULLIF(played_at_utc, ''), date_played) as played_at_utc,
           perfect, great, good, bad, miss, max_combo,
           replay_embed_url, replay_video_id, replay_start_seconds, replay_end_seconds
    FROM user_recently_played
    WHERE user_id = ? AND COALESCE(NULLIF(played_at_utc, ''), date_played) >= ? AND COALESCE(NULLIF(played_at_utc, ''), date_played) <= ? AND score > 0
    ORDER BY COALESCE(NULLIF(played_at_utc, ''), date_played) ASC
  `).all(userId, week.starts_at_utc, week.ends_at_utc);

  annotateWeeklyChallengePlayRows(db, plays, userId);
  const wcMatched = plays.filter(p => p.weekly_challenge_week_key === week.week_key);

  // Best per chart from all plays
  const allBestByChart = new Map();
  for (const p of wcMatched) {
    const key = `${p.song_title}|${p.mode}|${p.level}`;
    const existing = allBestByChart.get(key);
    if (!existing || p.score > existing.score) allBestByChart.set(key, p);
  }

  // 1. Update existing posts to add replay data
  const existingPosts = db.prepare(
    'SELECT id, plays_json FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ? ORDER BY id ASC'
  ).all(userId, week.id);

  const previousBests = new Map();
  for (const post of existingPosts) {
    try {
      const oldPlays = JSON.parse(post.plays_json || '[]');
      let updated = false;
      const enriched = oldPlays.map(p => {
        const key = `${p.song_title}|${p.mode}|${p.level}`;
        const prev = previousBests.get(key);
        if (!prev || p.score > prev.score) previousBests.set(key, p);

        // Enrich with replay if missing
        if (!p.replay_embed_url) {
          const best = allBestByChart.get(key);
          if (best && best.score === p.score && best.replay_embed_url) {
            updated = true;
            return { ...p, replay_embed_url: best.replay_embed_url, replay_video_id: best.replay_video_id || '', replay_start_seconds: best.replay_start_seconds || 0, replay_end_seconds: best.replay_end_seconds || 0 };
          }
        }
        return p;
      });
      if (updated) {
        db.prepare('UPDATE user_weekly_challenge_plays SET plays_json = ? WHERE id = ?').run(JSON.stringify(enriched), post.id);
        console.log(`  Updated post id=${post.id} with replay data`);
      }
    } catch {}
  }

  // 2. Create differential post for new higher scores
  const differential = [];
  for (const [key, play] of allBestByChart) {
    const prev = previousBests.get(key);
    if (!prev || play.score > prev.score) {
      differential.push(buildPlayEntry(play));
    }
  }

  if (differential.length === 0) {
    console.log(`  No new higher scores to post`);
    continue;
  }

  const playsJson = JSON.stringify(differential);
  const hashInput = differential.map(p => `${p.song_title}|${p.mode}|${p.level}|${p.score}`).sort().join('\n');
  const contentHash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 32);

  const dupeCheck = db.prepare('SELECT id FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ? AND content_hash = ? LIMIT 1').get(userId, week.id, contentHash);
  if (dupeCheck) {
    console.log(`  Differential already posted (id=${dupeCheck.id})`);
    continue;
  }

  const replayCount = differential.filter(p => p.replay_embed_url).length;
  const r = db.prepare('INSERT INTO user_weekly_challenge_plays (user_id, week_id, plays_json, content_hash) VALUES (?, ?, ?, ?)').run(userId, week.id, playsJson, contentHash);
  console.log(`  Created differential post id=${r.lastInsertRowid} with ${differential.length} improved charts (${replayCount} replays)`);
}
console.log('\nDone!');

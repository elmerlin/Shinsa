const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const { login, scrapePumbility, scrapeBestScores, scrapeRecentlyPlayed, scrapePumbilityRanking } = require('../lib/piugameScraper');
const { createUserNotification } = require('../lib/notifications');
const { notifyActivitySubscribers, buildProfilePath } = require('../lib/activitySubscriptions');
const { getUserTitleProgress, updateUserSkillTitleFromBestScores, LEVEL_BASE_POINTS, GRADE_MULTIPLIER, SCORE_TO_GRADE, calculateRatingPoints, gradeFromScore } = require('../lib/titleProgress');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.PIU_ENCRYPT_KEY || 'shinsa-piugame-credential-key').digest();
const ADMIN_USERNAMES = new Set(
  String(process.env.ADMIN_USERNAMES || 'elmer')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const ADMIN_USER_IDS = new Set(
  String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const SHOE_UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/heic', 'image/heif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function normalizeShoeText(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeShoeColorway(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function buildShoeCatalogKey(make, model, colorway) {
  return [
    normalizeShoeText(make, 80).toLowerCase(),
    normalizeShoeText(model, 80).toLowerCase(),
    normalizeShoeColorway(colorway, 120).toLowerCase(),
  ].join('|');
}

async function encodeShoeImage(file) {
  if (!file) return '';
  try {
    let buffer = await sharp(file.buffer)
      .rotate()
      .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer();

    if (buffer.length > 220 * 1024) {
      buffer = await sharp(file.buffer)
        .rotate()
        .resize(760, 760, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 62 })
        .toBuffer();
    }

    return `data:image/webp;base64,${buffer.toString('base64')}`;
  } catch {
    const mime = file.mimetype || 'image/png';
    return `data:${mime};base64,${file.buffer.toString('base64')}`;
  }
}

function getShoeCabinet(db, userId) {
  const shoes = db.prepare(`
    SELECT id, user_id, make, model, colorway, image_data, is_current, retired_at, created_at, updated_at
    FROM user_shoes
    WHERE user_id = ?
    ORDER BY
      CASE
        WHEN retired_at IS NULL AND is_current = 1 THEN 0
        WHEN retired_at IS NULL THEN 1
        ELSE 2
      END,
      created_at DESC,
      id DESC
  `).all(userId);

  const playTotals = db.prepare(`
    SELECT
      shoe_id,
      COUNT(*) AS songs_logged,
      COALESCE(SUM(
        COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
      ), 0) AS steps_logged
    FROM user_recently_played
    WHERE user_id = ? AND shoe_id IS NOT NULL
    GROUP BY shoe_id
  `).all(userId);

  const totalsByShoe = new Map(
    playTotals.map((row) => [
      parseInt(row.shoe_id, 10),
      {
        songs_logged: parseInt(row.songs_logged, 10) || 0,
        steps_logged: parseInt(row.steps_logged, 10) || 0,
      },
    ])
  );

  const lifetime = db.prepare(`
    SELECT
      COUNT(*) AS songs_logged,
      COALESCE(SUM(
        COALESCE(perfect, 0) + COALESCE(great, 0) + COALESCE(good, 0) + COALESCE(bad, 0) + COALESCE(miss, 0)
      ), 0) AS steps_logged
    FROM user_recently_played
    WHERE user_id = ?
  `).get(userId) || { songs_logged: 0, steps_logged: 0 };

  const cabinetShoes = shoes.map((shoe) => {
    const totals = totalsByShoe.get(parseInt(shoe.id, 10)) || { songs_logged: 0, steps_logged: 0 };
    return {
      ...shoe,
      is_current: !!shoe.is_current && !shoe.retired_at,
      songs_logged: totals.songs_logged,
      steps_logged: totals.steps_logged,
      status: shoe.retired_at ? 'retired' : (shoe.is_current ? 'current' : 'available'),
    };
  });

  const activeShoe = cabinetShoes.find((shoe) => shoe.is_current) || null;

  return {
    active_shoe_id: activeShoe ? activeShoe.id : null,
    lifetime_songs: parseInt(lifetime.songs_logged, 10) || 0,
    lifetime_steps: parseInt(lifetime.steps_logged, 10) || 0,
    shoes: cabinetShoes,
  };
}

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function isAdminUser(user) {
  if (!user) return false;
  if (user.id && ADMIN_USER_IDS.has(String(user.id).trim())) return true;
  const username = String(user.username || '').trim().toLowerCase();
  if (!username) return false;
  return ADMIN_USERNAMES.has(username);
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Encrypt/decrypt helpers using AES-256-GCM
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(encrypted, ivHex, authTagHex) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── Credentials ────────────────────────────────────────

// GET /api/piugame/credentials/status — check if linked
router.get('/credentials/status', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT updated_at FROM user_piugame_credentials WHERE user_id = ?').get(req.user.id);
  res.json({ linked: !!row, updated_at: row?.updated_at || null });
});

// POST /api/piugame/credentials — save/update credentials
router.post('/credentials', requireAuth, (req, res) => {
  const db = getDb();
  const { piugame_username, piugame_password } = req.body;
  if (!piugame_username || !piugame_password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const encUser = encrypt(piugame_username);
  const encPass = encrypt(piugame_password);

  // Store both encrypted values sharing the same IV/tag for simplicity
  // Actually use separate encryption for each, but share IV row for storage
  const iv = encUser.iv;
  const combinedTag = encUser.authTag + ':' + encPass.authTag;

  db.prepare(`
    INSERT INTO user_piugame_credentials (user_id, encrypted_username, encrypted_password, iv, auth_tag, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_username = excluded.encrypted_username,
      encrypted_password = excluded.encrypted_password,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      updated_at = datetime('now')
  `).run(req.user.id, encUser.encrypted, encPass.encrypted, encUser.iv + ':' + encPass.iv, combinedTag);

  // Ensure sync row exists
  db.prepare(`
    INSERT OR IGNORE INTO user_piugame_sync (user_id) VALUES (?)
  `).run(req.user.id);

  res.json({ success: true });
});

// DELETE /api/piugame/credentials — unlink account
router.delete('/credentials', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM user_piugame_credentials WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM user_pumbility_scores WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM user_best_scores WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM user_recently_played WHERE user_id = ?').run(req.user.id);
  db.prepare('DELETE FROM user_piugame_sync WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// Helper: get decrypted credentials for a user
function getCredentials(userId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_piugame_credentials WHERE user_id = ?').get(userId);
  if (!row) return null;

  const [userIv, passIv] = row.iv.split(':');
  const [userTag, passTag] = row.auth_tag.split(':');

  const username = decrypt(row.encrypted_username, userIv, userTag);
  const password = decrypt(row.encrypted_password, passIv, passTag);
  return { username, password };
}

// Helper: login with stored credentials
async function loginWithStoredCredentials(userId) {
  const creds = getCredentials(userId);
  if (!creds) throw new Error('No PIUGame credentials linked');
  return login(creds.username, creds.password);
}

function insertGroupedNewClearPost(db, userId, clears) {
  if (!Array.isArray(clears) || clears.length === 0) return null;

  const normalized = clears.map(c => ({
    entry_type: c.entry_type || 'song_clear',
    song_title: c.song_title,
    mode: c.mode,
    level: c.level,
    score: c.score || 0,
    grade: c.grade || '',
    plate: c.plate || '',
    background_url: c.background_url || '',
    perfect: c.perfect || 0, great: c.great || 0, good: c.good || 0,
    bad: c.bad || 0, miss: c.miss || 0,
    title_name: c.title_name || '',
    title_family: c.title_family || '',
    title_level: c.title_level || 0,
    title_plate: c.title_plate || '',
    title_tier: c.title_tier || '',
  }));
  const first = normalized[0];

  const result = db.prepare(`
    INSERT INTO user_new_clears (
      user_id, song_title, mode, level, score, grade, plate, background_url, clears_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    userId,
    first.song_title,
    first.mode,
    first.level,
    first.score,
    first.grade,
    first.plate,
    first.background_url,
    JSON.stringify(normalized)
  );

  return result.lastInsertRowid;
}

function isBeginnerTitleRow(title) {
  const family = String(title?.skill_family || '').trim();
  const name = String(title?.name || title?.skill_title || '').trim();
  return /^beginner$/i.test(family) || /^beginner\b/i.test(name);
}

function getTitlePlateMeta(title) {
  const family = String(title?.skill_family || '').trim().toLowerCase();
  if (family === 'intermediate') {
    return { plate: 'Bronze Plate', tier: 'bronze' };
  }
  if (family === 'advanced') {
    return { plate: 'Silver Plate', tier: 'silver' };
  }
  if (family === 'expert') {
    return { plate: 'Gold Plate', tier: 'gold' };
  }
  if (family === 'master') {
    return { plate: 'Master Plate', tier: 'master' };
  }
  return { plate: 'Title Plate', tier: 'title' };
}

function getNewlyUnlockedTitles(previousProgress, latestProgress) {
  const previouslyUnlocked = new Set(
    (previousProgress?.titles || [])
      .filter((title) => title?.unlocked)
      .map((title) => title.id)
  );

  return (latestProgress?.titles || [])
    .filter((title) => title?.unlocked && !previouslyUnlocked.has(title.id) && !isBeginnerTitleRow(title));
}

function insertTitleUnlockActivityPost(db, userId, unlockedTitles) {
  if (!Array.isArray(unlockedTitles) || unlockedTitles.length === 0) return null;
  const payload = unlockedTitles.map((title) => {
    const plateMeta = getTitlePlateMeta(title);
    return {
      entry_type: 'title_unlock',
      song_title: title.name || title.skill_title || 'Title Unlock',
      mode: 'Title',
      level: parseInt(title.skill_level, 10) || 0,
      score: parseInt(title.required_points, 10) || 0,
      grade: 'TITLE',
      plate: plateMeta.plate,
      title_name: title.name || title.skill_title || 'Title Unlock',
      title_family: title.skill_family || '',
      title_level: parseInt(title.skill_level, 10) || 0,
      title_plate: plateMeta.plate,
      title_tier: plateMeta.tier,
      background_url: '',
    };
  });
  return insertGroupedNewClearPost(db, userId, payload);
}

// ─── Sync: Pumbility ───────────────────────────────────

// POST /api/piugame/sync/pumbility — fetch pumbility from piugame
router.post('/sync/pumbility', requireAuth, async (req, res) => {
  try {
    const client = await loginWithStoredCredentials(req.user.id);
    const { pumbilityValue, scores } = await scrapePumbility(client);
    const db = getDb();

    // Update pumbility scores in transaction
    const insertOrUpdate = db.prepare(`
      INSERT INTO user_pumbility_scores (user_id, song_title, mode, level, score, grade, background_url, date_played, rank_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, song_title, mode, level) DO UPDATE SET
        score = excluded.score,
        grade = excluded.grade,
        background_url = excluded.background_url,
        date_played = excluded.date_played,
        rank_order = excluded.rank_order
    `);

    const txn = db.transaction(() => {
      // Clear old pumbility scores and re-insert
      db.prepare('DELETE FROM user_pumbility_scores WHERE user_id = ?').run(req.user.id);
      for (const s of scores) {
        insertOrUpdate.run(
          req.user.id, s.song_title, s.mode, s.level, s.score,
          s.grade, s.background_url, s.date_played, s.rank_order
        );
      }

      // Update pumbility value on user profile and sync table
      if (pumbilityValue > 0) {
        db.prepare('UPDATE users SET pumbility = ? WHERE id = ?').run(pumbilityValue, req.user.id);
      }
      db.prepare(`
        UPDATE user_piugame_sync SET last_pumbility_sync = datetime('now'), pumbility_value = ? WHERE user_id = ?
      `).run(pumbilityValue, req.user.id);
    });
    txn();

    res.json({ success: true, pumbility_value: pumbilityValue, scores_count: scores.length });

    // Also sync leaderboard in background (no login required, rate-limited to 1/hour)
    (async () => {
      try {
        const meta = db.prepare('SELECT last_sync FROM pumbility_leaderboard_meta WHERE id = 1').get();
        if (meta?.last_sync) {
          const lastSync = new Date(meta.last_sync + 'Z');
          const minutesSince = (Date.now() - lastSync.getTime()) / (1000 * 60);
          if (minutesSince < 60) return;
        }
        const { rankings, threshold } = await scrapePumbilityRanking();
        const lbTxn = db.transaction(() => {
          db.prepare('DELETE FROM pumbility_leaderboard').run();
          const ins = db.prepare('INSERT INTO pumbility_leaderboard (rank, player_name, pumbility) VALUES (?, ?, ?)');
          for (const r of rankings) ins.run(r.rank, r.player_name, r.pumbility);
          db.prepare(`
            INSERT INTO pumbility_leaderboard_meta (id, threshold, total_entries, last_sync)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET threshold = excluded.threshold, total_entries = excluded.total_entries, last_sync = datetime('now')
          `).run(threshold, rankings.length);
        });
        lbTxn();
        console.log(`Pumbility leaderboard synced: ${rankings.length} entries, threshold=${threshold}`);
      } catch (err) {
        console.error('Background pumbility leaderboard sync error:', err.message);
      }
    })();
  } catch (err) {
    console.error('Pumbility sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Sync: Best Scores (background) ─────────────────────

// POST /api/piugame/sync/best-scores — starts background import, returns immediately
router.post('/sync/best-scores', requireAuth, async (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  // Check if already in progress
  const sync = db.prepare('SELECT * FROM user_piugame_sync WHERE user_id = ?').get(userId);
  if (sync && sync.sync_in_progress === 'best-scores') {
    return res.json({ started: true, already_running: true, progress: sync.sync_progress, total: sync.sync_total });
  }

  // Check rate limit (once per day) unless first import
  if (sync && sync.best_scores_imported && sync.last_best_scores_sync) {
    const lastSync = new Date(sync.last_best_scores_sync + 'Z');
    const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) {
      const hoursLeft = Math.ceil(24 - hoursSince);
      return res.status(429).json({
        error: `Full best scores sync is limited to once per day. Try again in ${hoursLeft} hours.`
      });
    }
  }

  // Mark as in progress and respond immediately
  db.prepare(`
    UPDATE user_piugame_sync SET sync_in_progress = 'best-scores', sync_progress = 0, sync_total = 0 WHERE user_id = ?
  `).run(userId);

  res.json({ started: true });

  // Run in background
  (async () => {
    try {
      const progressBeforeSync = getUserTitleProgress(db, userId);
      const client = await loginWithStoredCredentials(userId);
      const scores = await scrapeBestScores(client, (progress, total) => {
        // Update progress in DB so client can poll
        db.prepare('UPDATE user_piugame_sync SET sync_progress = ?, sync_total = ? WHERE user_id = ?')
          .run(progress, total, userId);
      });

      const insertOrUpdate = db.prepare(`
        INSERT INTO user_best_scores (user_id, song_title, mode, level, score, grade, plate, background_url, shoe_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, song_title, mode, level) DO UPDATE SET
          score = MAX(excluded.score, user_best_scores.score),
          grade = CASE WHEN excluded.score > user_best_scores.score THEN excluded.grade ELSE user_best_scores.grade END,
          plate = CASE WHEN excluded.score > user_best_scores.score THEN excluded.plate ELSE user_best_scores.plate END,
          background_url = CASE WHEN excluded.background_url != '' THEN excluded.background_url ELSE user_best_scores.background_url END,
          shoe_id = CASE WHEN excluded.score > user_best_scores.score THEN excluded.shoe_id ELSE user_best_scores.shoe_id END
      `);

      // Capture old scores for upscore tracking before replacing
      const oldScores = {};
      const existingScores = db.prepare('SELECT song_title, mode, level, score, grade, shoe_id FROM user_best_scores WHERE user_id = ?').all(userId);
      for (const s of existingScores) {
        oldScores[`${s.song_title}|${s.mode}|${s.level}`] = { score: s.score, grade: s.grade, shoe_id: s.shoe_id ? parseInt(s.shoe_id, 10) : null };
      }

      let upscores = [];
      let newClears = [];
      let upscorePostId = null;
      let newClearPostId = null;

      const txn = db.transaction(() => {
        db.prepare('DELETE FROM user_best_scores WHERE user_id = ?').run(userId);
        for (const s of scores) {
          const key = `${s.song_title}|${s.mode}|${s.level}`;
          const old = oldScores[key];
          const preservedShoeId = old && old.score === s.score ? old.shoe_id : null;
          insertOrUpdate.run(userId, s.song_title, s.mode, s.level, s.score, s.grade, s.plate, s.background_url || '', preservedShoeId);
        }

        // Track upscores and new clears
        upscores = [];
        newClears = [];
        for (const s of scores) {
          const key = `${s.song_title}|${s.mode}|${s.level}`;
          const old = oldScores[key];
          if (old && s.score > old.score) {
            upscores.push({
              song_title: s.song_title, mode: s.mode, level: s.level,
              old_score: old.score, new_score: s.score,
              old_grade: old.grade, new_grade: s.grade,
              background_url: s.background_url || '',
            });
          } else if (!old && s.score > 0) {
            newClears.push(s);
          }
        }
        if (upscores.length > 0) {
          const upscoreInsert = db.prepare(`
            INSERT INTO user_upscores (user_id, upscores_json, created_at)
            VALUES (?, ?, datetime('now'))
          `).run(userId, JSON.stringify(upscores));
          upscorePostId = upscoreInsert.lastInsertRowid;
        }
        newClearPostId = insertGroupedNewClearPost(db, userId, newClears);
        db.prepare(`
          UPDATE user_piugame_sync SET last_best_scores_sync = datetime('now'), best_scores_imported = 1,
          sync_in_progress = '', sync_progress = 0, sync_total = 0 WHERE user_id = ?
        `).run(userId);
      });
      txn();
      const progressAfterSync = updateUserSkillTitleFromBestScores(db, userId);
      const newlyUnlockedTitles = getNewlyUnlockedTitles(progressBeforeSync, progressAfterSync);
      const titleUnlockPostId = insertTitleUnlockActivityPost(db, userId, newlyUnlockedTitles);

      // Create notification
      const profile = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
      const actorUsername = profile?.username || 'Someone';
      const profileLink = buildProfilePath(profile?.username) || `/profile/${userId}`;
      createUserNotification(
        db,
        userId,
        'sync_complete',
        'Best Scores Synced',
        `${scores.length} scores imported successfully!`,
        profileLink
      );

      if (upscores.length > 0) {
        notifyActivitySubscribers(db, {
          actorUserId: userId,
          actorUsername,
          activityType: 'upscores',
          notificationType: 'followed_user_upscore',
          title: 'New Upscores',
          message: `${actorUsername} posted ${upscores.length} new upscore${upscores.length === 1 ? '' : 's'}`,
          link: upscorePostId ? `/upscore/${upscorePostId}` : profileLink,
        });
      }

      if (newClears.length > 0) {
        notifyActivitySubscribers(db, {
          actorUserId: userId,
          actorUsername,
          activityType: 'new_clears',
          notificationType: 'followed_user_new_clear',
          title: 'New Clears',
          message: `${actorUsername} posted ${newClears.length} new clear${newClears.length === 1 ? '' : 's'}`,
          link: newClearPostId ? `/clear/${newClearPostId}` : profileLink,
        });
      }

      if (newlyUnlockedTitles.length > 0) {
        const titleList = newlyUnlockedTitles.map((title) => title.name || title.skill_title).filter(Boolean);
        const titleSummary = titleList.length > 1 ? `${titleList[0]} +${titleList.length - 1}` : (titleList[0] || 'a new title');
        notifyActivitySubscribers(db, {
          actorUserId: userId,
          actorUsername,
          activityType: 'new_clears',
          notificationType: 'followed_user_new_title',
          title: 'Title Earned',
          message: `${actorUsername} earned ${titleSummary}`,
          link: titleUnlockPostId ? `/clear/${titleUnlockPostId}` : profileLink,
        });
      }

      console.log(`Background best scores sync complete for ${userId}: ${scores.length} scores`);
    } catch (err) {
      console.error('Background best scores sync error:', err.message);
      db.prepare(`
        UPDATE user_piugame_sync SET sync_in_progress = '', sync_progress = 0, sync_total = 0 WHERE user_id = ?
      `).run(userId);
      createUserNotification(db, userId, 'sync_error', 'Best Scores Sync Failed', err.message, '');
    }
  })();
});

// GET /api/piugame/sync/progress — poll sync progress
router.get('/sync/progress', requireAuth, (req, res) => {
  const db = getDb();
  const sync = db.prepare('SELECT sync_in_progress, sync_progress, sync_total FROM user_piugame_sync WHERE user_id = ?')
    .get(req.user.id);
  res.json({
    in_progress: sync?.sync_in_progress || '',
    progress: sync?.sync_progress || 0,
    total: sync?.sync_total || 0,
  });
});

// ─── Shoe Cabinet ───────────────────────────────────────

// GET /api/piugame/shoes/catalog/admin?q=...&limit=...&page=...
router.get('/shoes/catalog/admin', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const q = normalizeShoeText(req.query?.q, 120).toLowerCase();
  const parsedLimit = parseInt(req.query?.limit, 10);
  const parsedPage = parseInt(req.query?.page, 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : 12;
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const offset = (page - 1) * limit;
  const like = q ? `%${q}%` : '';

  const rows = db.prepare(`
    SELECT
      c.id,
      c.make,
      c.model,
      c.colorway,
      c.image_data,
      c.created_by,
      c.created_at,
      c.updated_at,
      CASE WHEN md.catalog_id = c.id THEN 1 ELSE 0 END AS is_model_display
    FROM shoe_catalog c
    LEFT JOIN shoe_model_display md
      ON md.make_key = LOWER(TRIM(COALESCE(c.make, '')))
      AND md.model_key = LOWER(TRIM(COALESCE(c.model, '')))
    WHERE
      ? = ''
      OR LOWER(TRIM(COALESCE(c.make, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(c.model, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(c.colorway, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(c.make, '') || ' ' || COALESCE(c.model, '') || ' ' || COALESCE(c.colorway, ''))) LIKE ?
    ORDER BY COALESCE(c.updated_at, c.created_at, datetime('now')) DESC, c.id DESC
    LIMIT ? OFFSET ?
  `).all(q, like, like, like, like, limit, offset);

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM shoe_catalog
    WHERE
      ? = ''
      OR LOWER(TRIM(COALESCE(make, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(model, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(colorway, ''))) LIKE ?
      OR LOWER(TRIM(COALESCE(make, '') || ' ' || COALESCE(model, '') || ' ' || COALESCE(colorway, ''))) LIKE ?
  `).get(q, like, like, like, like) || { total: 0 };

  const total = parseInt(totalRow.total, 10) || 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  res.json({
    q,
    page,
    limit,
    total,
    total_pages: totalPages,
    results: rows.map((row) => ({
      id: parseInt(row.id, 10),
      make: row.make || '',
      model: row.model || '',
      colorway: row.colorway || '',
      image_data: row.image_data || '',
      created_by: row.created_by || '',
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
      is_model_display: !!row.is_model_display,
    })),
  });
});

// POST /api/piugame/shoes/catalog/admin
router.post('/shoes/catalog/admin', requireAuth, requireAdmin, SHOE_UPLOAD.single('photo'), async (req, res) => {
  try {
    const db = getDb();
    const make = normalizeShoeText(req.body?.make, 80);
    const model = normalizeShoeText(req.body?.model, 80);
    const colorway = normalizeShoeColorway(req.body?.colorway, 120);
    if (!make || !model) {
      return res.status(400).json({ error: 'Shoe make and model are required' });
    }
    const imageData = await encodeShoeImage(req.file);

    const existing = db.prepare(`
      SELECT id
      FROM shoe_catalog
      WHERE LOWER(TRIM(COALESCE(make, ''))) = ?
        AND LOWER(TRIM(COALESCE(model, ''))) = ?
        AND LOWER(TRIM(COALESCE(colorway, ''))) = ?
      LIMIT 1
    `).get(make.toLowerCase(), model.toLowerCase(), colorway.toLowerCase());

    let catalogId = null;
    if (existing) {
      db.prepare(`
        UPDATE shoe_catalog
        SET
          make = ?,
          model = ?,
          colorway = ?,
          image_data = CASE WHEN ? != '' THEN ? ELSE image_data END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(make, model, colorway, imageData, imageData, existing.id);
      catalogId = parseInt(existing.id, 10);
    } else {
      const insert = db.prepare(`
        INSERT INTO shoe_catalog (make, model, colorway, image_data, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(make, model, colorway, imageData, req.user.id);
      catalogId = parseInt(insert.lastInsertRowid, 10);
    }

    const entry = db.prepare(`
      SELECT id, make, model, colorway, image_data, created_by, created_at, updated_at
      FROM shoe_catalog
      WHERE id = ?
    `).get(catalogId);
    res.status(existing ? 200 : 201).json({
      entry: {
        id: parseInt(entry?.id, 10) || catalogId,
        make: entry?.make || '',
        model: entry?.model || '',
        colorway: entry?.colorway || '',
        image_data: entry?.image_data || '',
        created_by: entry?.created_by || '',
        created_at: entry?.created_at || '',
        updated_at: entry?.updated_at || '',
      },
      updated: !!existing,
    });
  } catch (err) {
    console.error('Create admin shoe catalog entry error:', err.message);
    res.status(500).json({ error: 'Failed to save shoe catalog entry' });
  }
});

// DELETE /api/piugame/shoes/catalog/admin/:catalogId
router.delete('/shoes/catalog/admin/:catalogId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const catalogId = parseInt(req.params.catalogId, 10);
  if (!Number.isInteger(catalogId) || catalogId <= 0) {
    return res.status(400).json({ error: 'Invalid catalog entry ID' });
  }
  const existing = db.prepare('SELECT id FROM shoe_catalog WHERE id = ?').get(catalogId);
  if (!existing) return res.status(404).json({ error: 'Catalog entry not found' });
  db.prepare('DELETE FROM shoe_catalog WHERE id = ?').run(catalogId);
  res.json({ success: true });
});

// POST /api/piugame/shoes/catalog/admin/:catalogId/display
router.post('/shoes/catalog/admin/:catalogId/display', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const catalogId = parseInt(req.params.catalogId, 10);
  if (!Number.isInteger(catalogId) || catalogId <= 0) {
    return res.status(400).json({ error: 'Invalid catalog entry ID' });
  }

  const entry = db.prepare(`
    SELECT id, make, model, colorway
    FROM shoe_catalog
    WHERE id = ?
  `).get(catalogId);
  if (!entry) return res.status(404).json({ error: 'Catalog entry not found' });

  const makeKey = normalizeShoeText(entry.make, 80).toLowerCase();
  const modelKey = normalizeShoeText(entry.model, 80).toLowerCase();
  if (!makeKey || !modelKey) {
    return res.status(400).json({ error: 'Catalog entry must include make and model' });
  }

  db.prepare(`
    INSERT INTO shoe_model_display (make_key, model_key, catalog_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(make_key, model_key)
    DO UPDATE SET
      catalog_id = excluded.catalog_id,
      updated_at = datetime('now')
  `).run(makeKey, modelKey, catalogId);

  res.json({
    success: true,
    model: {
      make: entry.make || '',
      model: entry.model || '',
    },
    display: {
      catalog_id: catalogId,
      colorway: entry.colorway || '',
    },
  });
});

// GET /api/piugame/shoes/catalog?q=...&limit=...&page=...
router.get('/shoes/catalog', requireAuth, (req, res) => {
  const db = getDb();
  const q = normalizeShoeText(req.query?.q, 120).toLowerCase();
  const parsedLimit = parseInt(req.query?.limit, 10);
  const parsedPage = parseInt(req.query?.page, 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 6)
    : 6;
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const offset = (page - 1) * limit;
  if (!q) {
    return res.json({
      q: '',
      page,
      limit,
      total: 0,
      total_pages: 0,
      results: [],
    });
  }
  const like = `%${q}%`;

  const rows = db.prepare(`
    WITH catalog AS (
      SELECT
        printf('catalog:%d', c.id) AS id,
        c.id AS catalog_id,
        TRIM(COALESCE(c.make, '')) AS make,
        TRIM(COALESCE(c.model, '')) AS model,
        TRIM(COALESCE(c.colorway, '')) AS colorway,
        COALESCE(c.image_data, '') AS image_data,
        1 AS curated,
        0 AS usage_count,
        COALESCE(c.updated_at, c.created_at, datetime('now')) AS sort_time
      FROM shoe_catalog c
      WHERE
        (TRIM(COALESCE(c.make, '')) != '' OR TRIM(COALESCE(c.model, '')) != '')
        AND (
          LOWER(TRIM(COALESCE(c.make, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(c.model, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(c.colorway, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(c.make, '') || ' ' || COALESCE(c.model, '') || ' ' || COALESCE(c.colorway, ''))) LIKE ?
        )
    ),
    community_grouped AS (
      SELECT
        LOWER(TRIM(COALESCE(s.make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(s.model, ''))) AS model_key,
        LOWER(TRIM(COALESCE(s.colorway, ''))) AS colorway_key,
        MAX(TRIM(COALESCE(s.make, ''))) AS make,
        MAX(TRIM(COALESCE(s.model, ''))) AS model,
        MAX(TRIM(COALESCE(s.colorway, ''))) AS colorway,
        COUNT(DISTINCT s.user_id) AS usage_count,
        MAX(COALESCE(s.updated_at, s.created_at, datetime('now'))) AS sort_time,
        COALESCE(
          (
            SELECT s2.id
            FROM user_shoes s2
            WHERE LOWER(TRIM(COALESCE(s2.make, ''))) = LOWER(TRIM(COALESCE(s.make, '')))
              AND LOWER(TRIM(COALESCE(s2.model, ''))) = LOWER(TRIM(COALESCE(s.model, '')))
              AND LOWER(TRIM(COALESCE(s2.colorway, ''))) = LOWER(TRIM(COALESCE(s.colorway, '')))
              AND TRIM(COALESCE(s2.image_data, '')) != ''
            ORDER BY COALESCE(s2.updated_at, s2.created_at) DESC, s2.id DESC
            LIMIT 1
          ),
          (
            SELECT s2.id
            FROM user_shoes s2
            WHERE LOWER(TRIM(COALESCE(s2.make, ''))) = LOWER(TRIM(COALESCE(s.make, '')))
              AND LOWER(TRIM(COALESCE(s2.model, ''))) = LOWER(TRIM(COALESCE(s.model, '')))
              AND LOWER(TRIM(COALESCE(s2.colorway, ''))) = LOWER(TRIM(COALESCE(s.colorway, '')))
            ORDER BY COALESCE(s2.updated_at, s2.created_at) DESC, s2.id DESC
            LIMIT 1
          )
        ) AS sample_shoe_id
      FROM user_shoes s
      WHERE
        (TRIM(COALESCE(s.make, '')) != '' OR TRIM(COALESCE(s.model, '')) != '')
        AND (
          LOWER(TRIM(COALESCE(s.make, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(s.model, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(s.colorway, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(s.make, '') || ' ' || COALESCE(s.model, '') || ' ' || COALESCE(s.colorway, ''))) LIKE ?
        )
      GROUP BY make_key, model_key, colorway_key
    ),
    community AS (
      SELECT
        printf('user:%d', cg.sample_shoe_id) AS id,
        NULL AS catalog_id,
        cg.make,
        cg.model,
        cg.colorway,
        COALESCE((SELECT image_data FROM user_shoes WHERE id = cg.sample_shoe_id), '') AS image_data,
        0 AS curated,
        cg.usage_count AS usage_count,
        cg.sort_time AS sort_time
      FROM community_grouped cg
    ),
    combined AS (
      SELECT * FROM catalog
      UNION ALL
      SELECT * FROM community
    ),
    dedup AS (
      SELECT
        LOWER(TRIM(COALESCE(make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(model, ''))) AS model_key,
        LOWER(TRIM(COALESCE(colorway, ''))) AS colorway_key,
        MAX(make) AS make,
        MAX(model) AS model,
        MAX(colorway) AS colorway,
        MAX(catalog_id) AS catalog_id,
        MAX(curated) AS curated,
        MAX(usage_count) AS usage_count,
        MAX(sort_time) AS sort_time,
        MAX(CASE WHEN curated = 1 THEN id ELSE '' END) AS curated_id,
        MAX(CASE WHEN curated = 0 THEN id ELSE '' END) AS community_id,
        MAX(CASE WHEN curated = 1 AND TRIM(COALESCE(image_data, '')) != '' THEN image_data ELSE '' END) AS curated_image_data,
        MAX(CASE WHEN TRIM(COALESCE(image_data, '')) != '' THEN image_data ELSE '' END) AS any_image_data
      FROM combined
      GROUP BY make_key, model_key, colorway_key
    ),
    ranked AS (
      SELECT
        CASE
          WHEN curated_id != '' THEN curated_id
          ELSE community_id
        END AS id,
        catalog_id,
        make,
        model,
        colorway,
        CASE
          WHEN TRIM(COALESCE(curated_image_data, '')) != '' THEN curated_image_data
          ELSE COALESCE(any_image_data, '')
        END AS image_data,
        curated,
        usage_count,
        sort_time
      FROM dedup
    )
    SELECT
      id,
      catalog_id,
      make,
      model,
      colorway,
      image_data,
      curated,
      usage_count,
      COUNT(*) OVER() AS total_count
    FROM ranked
    ORDER BY curated DESC, usage_count DESC, sort_time DESC, model ASC, colorway ASC, make ASC
    LIMIT ? OFFSET ?
  `).all(
    like, like, like, like,
    like, like, like, like,
    limit, offset
  );

  const total = rows.length > 0 ? (parseInt(rows[0].total_count, 10) || 0) : 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  res.json({
    q,
    page,
    limit,
    total,
    total_pages: totalPages,
    results: rows.map((row) => ({
      id: row.id || '',
      catalog_id: Number.isInteger(parseInt(row.catalog_id, 10)) ? parseInt(row.catalog_id, 10) : null,
      make: row.make || '',
      model: row.model || '',
      colorway: row.colorway || '',
      usage_count: parseInt(row.usage_count, 10) || 0,
      curated: !!row.curated,
      image_data: row.image_data || '',
      catalog_key: buildShoeCatalogKey(row.make, row.model, row.colorway),
    })),
  });
});

// GET /api/piugame/shoes/stats/top?limit=...
router.get('/shoes/stats/top', requireAuth, (req, res) => {
  const db = getDb();
  const parsedLimit = parseInt(req.query?.limit, 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 60)
    : 24;

  const rows = db.prepare(`
    WITH grouped AS (
      SELECT
        LOWER(TRIM(COALESCE(make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(model, ''))) AS model_key,
        MAX(TRIM(COALESCE(make, ''))) AS make,
        MAX(TRIM(COALESCE(model, ''))) AS model,
        COUNT(*) AS shoe_entries,
        COUNT(DISTINCT user_id) AS player_count,
        COUNT(DISTINCT NULLIF(LOWER(TRIM(COALESCE(colorway, ''))), '')) AS colorway_count,
        MAX(COALESCE(updated_at, created_at, datetime('now'))) AS last_used_at
      FROM user_shoes
      WHERE TRIM(COALESCE(make, '')) != '' OR TRIM(COALESCE(model, '')) != ''
      GROUP BY make_key, model_key
    ),
    picked AS (
      SELECT
        g.*,
        COALESCE(
          (
            SELECT s.id
            FROM user_shoes s
            WHERE LOWER(TRIM(COALESCE(s.make, ''))) = g.make_key
              AND LOWER(TRIM(COALESCE(s.model, ''))) = g.model_key
              AND TRIM(COALESCE(s.image_data, '')) != ''
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
            LIMIT 1
          ),
          (
            SELECT s.id
            FROM user_shoes s
            WHERE LOWER(TRIM(COALESCE(s.make, ''))) = g.make_key
              AND LOWER(TRIM(COALESCE(s.model, ''))) = g.model_key
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
            LIMIT 1
          )
        ) AS sample_shoe_id
      FROM grouped g
    )
    SELECT
      p.sample_shoe_id AS id,
      p.make,
      p.model,
      p.shoe_entries,
      p.player_count,
      p.colorway_count,
      COALESCE(sc.image_data, (SELECT image_data FROM user_shoes WHERE id = p.sample_shoe_id), '') AS image_data,
      COALESCE(sc.colorway, '') AS display_colorway
    FROM picked p
    LEFT JOIN shoe_model_display md
      ON md.make_key = p.make_key
      AND md.model_key = p.model_key
    LEFT JOIN shoe_catalog sc
      ON sc.id = md.catalog_id
    ORDER BY p.player_count DESC, p.shoe_entries DESC, p.last_used_at DESC, p.model ASC, p.make ASC
    LIMIT ?
  `).all(limit);

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_shoe_entries,
      COUNT(DISTINCT user_id) AS players_with_shoes
    FROM user_shoes
    WHERE TRIM(COALESCE(make, '')) != '' OR TRIM(COALESCE(model, '')) != ''
  `).get() || { total_shoe_entries: 0, players_with_shoes: 0 };

  const totalModels = db.prepare(`
    SELECT COUNT(*) AS total_models
    FROM (
      SELECT
        LOWER(TRIM(COALESCE(make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(model, ''))) AS model_key
      FROM user_shoes
      WHERE TRIM(COALESCE(make, '')) != '' OR TRIM(COALESCE(model, '')) != ''
      GROUP BY make_key, model_key
    ) m
  `).get() || { total_models: 0 };

  res.json({
    summary: {
      total_models: parseInt(totalModels.total_models, 10) || 0,
      players_with_shoes: parseInt(totals.players_with_shoes, 10) || 0,
      total_shoe_entries: parseInt(totals.total_shoe_entries, 10) || 0,
    },
    results: rows.map((row) => ({
      id: parseInt(row.id, 10),
      make: row.make || '',
      model: row.model || '',
      player_count: parseInt(row.player_count, 10) || 0,
      shoe_entries: parseInt(row.shoe_entries, 10) || 0,
      colorway_count: parseInt(row.colorway_count, 10) || 0,
      image_data: row.image_data || '',
      display_colorway: row.display_colorway || '',
    })),
  });
});

// GET /api/piugame/shoes/stats/top/:shoeId/users
router.get('/shoes/stats/top/:shoeId/users', requireAuth, (req, res) => {
  const db = getDb();
  const shoeId = parseInt(req.params.shoeId, 10);
  if (!Number.isInteger(shoeId) || shoeId <= 0) {
    return res.status(400).json({ error: 'Invalid shoe ID' });
  }

  const target = db.prepare(`
    SELECT
      LOWER(TRIM(COALESCE(make, ''))) AS make_key,
      LOWER(TRIM(COALESCE(model, ''))) AS model_key
    FROM user_shoes
    WHERE id = ?
  `).get(shoeId);
  if (!target) return res.status(404).json({ error: 'Shoe model not found' });

  const makeKey = target.make_key || '';
  const modelKey = target.model_key || '';
  if (!makeKey && !modelKey) {
    return res.json({
      shoe: {
        id: shoeId,
        make: '',
        model: '',
        player_count: 0,
        shoe_entries: 0,
        image_data: '',
      },
      users: [],
    });
  }

  const shoe = db.prepare(`
    WITH grouped AS (
      SELECT
        MAX(TRIM(COALESCE(make, ''))) AS make,
        MAX(TRIM(COALESCE(model, ''))) AS model,
        COUNT(*) AS shoe_entries,
        COUNT(DISTINCT user_id) AS player_count,
        COUNT(DISTINCT NULLIF(LOWER(TRIM(COALESCE(colorway, ''))), '')) AS colorway_count,
        MAX(COALESCE(updated_at, created_at, datetime('now'))) AS last_used_at
      FROM user_shoes
      WHERE LOWER(TRIM(COALESCE(make, ''))) = ?
        AND LOWER(TRIM(COALESCE(model, ''))) = ?
    ),
    picked AS (
      SELECT
        g.*,
        COALESCE(
          (
            SELECT s.id
            FROM user_shoes s
            WHERE LOWER(TRIM(COALESCE(s.make, ''))) = ?
              AND LOWER(TRIM(COALESCE(s.model, ''))) = ?
              AND TRIM(COALESCE(s.image_data, '')) != ''
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
            LIMIT 1
          ),
          (
            SELECT s.id
            FROM user_shoes s
            WHERE LOWER(TRIM(COALESCE(s.make, ''))) = ?
              AND LOWER(TRIM(COALESCE(s.model, ''))) = ?
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
            LIMIT 1
          )
        ) AS sample_shoe_id
      FROM grouped g
    )
    SELECT
      p.sample_shoe_id AS id,
      p.make,
      p.model,
      p.player_count,
      p.shoe_entries,
      p.colorway_count,
      COALESCE((SELECT image_data FROM user_shoes WHERE id = p.sample_shoe_id), '') AS image_data
    FROM picked p
  `).get(makeKey, modelKey, makeKey, modelKey, makeKey, modelKey);

  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      COALESCE(u.avatar, '') AS avatar,
      COALESCE(u.skill_title, '') AS skill_title,
      COALESCE(u.nationality, '') AS nationality,
      COUNT(s.id) AS matching_shoe_count,
      GROUP_CONCAT(DISTINCT NULLIF(TRIM(COALESCE(s.colorway, '')), '')) AS colorways,
      MAX(CASE WHEN s.retired_at IS NULL THEN 1 ELSE 0 END) AS has_active_pair,
      MAX(CASE WHEN s.retired_at IS NULL AND s.is_current = 1 THEN 1 ELSE 0 END) AS is_current_pair
    FROM user_shoes s
    JOIN users u ON u.id = s.user_id
    WHERE LOWER(TRIM(COALESCE(s.make, ''))) = ?
      AND LOWER(TRIM(COALESCE(s.model, ''))) = ?
    GROUP BY u.id, u.username, u.avatar, u.skill_title, u.nationality
    ORDER BY is_current_pair DESC, has_active_pair DESC, u.username COLLATE NOCASE ASC
    LIMIT 300
  `).all(makeKey, modelKey);

  res.json({
    shoe: {
      id: parseInt(shoe?.id, 10) || shoeId,
      make: shoe?.make || '',
      model: shoe?.model || '',
      player_count: parseInt(shoe?.player_count, 10) || 0,
      shoe_entries: parseInt(shoe?.shoe_entries, 10) || 0,
      colorway_count: parseInt(shoe?.colorway_count, 10) || 0,
      image_data: shoe?.image_data || '',
    },
    users: users.map((row) => ({
      id: row.id,
      username: row.username || '',
      avatar: row.avatar || '',
      skill_title: row.skill_title || '',
      nationality: row.nationality || '',
      matching_shoe_count: parseInt(row.matching_shoe_count, 10) || 0,
      colorways: String(row.colorways || '')
        .split(',')
        .map((value) => normalizeShoeColorway(value, 120))
        .filter(Boolean),
      has_active_pair: !!row.has_active_pair,
      is_current_pair: !!row.is_current_pair,
    })),
  });
});

// GET /api/piugame/shoes/:userId
router.get('/shoes/:userId', (req, res) => {
  const db = getDb();
  res.json(getShoeCabinet(db, req.params.userId));
});

// POST /api/piugame/shoes
router.post('/shoes', requireAuth, SHOE_UPLOAD.single('photo'), async (req, res) => {
  try {
    const db = getDb();
    let make = normalizeShoeText(req.body?.make, 80);
    let model = normalizeShoeText(req.body?.model, 80);
    let colorway = normalizeShoeColorway(req.body?.colorway, 120);
    const parsedCatalogId = parseInt(req.body?.catalog_id, 10);
    const catalogId = Number.isInteger(parsedCatalogId) && parsedCatalogId > 0 ? parsedCatalogId : null;
    const catalogEntry = catalogId
      ? db.prepare(`
        SELECT id, make, model, colorway, image_data
        FROM shoe_catalog
        WHERE id = ?
      `).get(catalogId)
      : null;
    if (catalogEntry) {
      if (!make) make = normalizeShoeText(catalogEntry.make, 80);
      if (!model) model = normalizeShoeText(catalogEntry.model, 80);
      if (!colorway) colorway = normalizeShoeColorway(catalogEntry.colorway, 120);
    }
    if (!make || !model) {
      return res.status(400).json({ error: 'Shoe make and model are required' });
    }

    let imageData = await encodeShoeImage(req.file);
    if (!imageData && catalogEntry?.image_data) {
      imageData = catalogEntry.image_data;
    }
    const requestedCurrent = parseBoolean(req.body?.set_current);
    const existingCurrent = db.prepare(
      'SELECT id FROM user_shoes WHERE user_id = ? AND is_current = 1 AND retired_at IS NULL LIMIT 1'
    ).get(req.user.id);
    const shouldSetCurrent = requestedCurrent === true || (!existingCurrent && requestedCurrent !== false);

    const txn = db.transaction(() => {
      if (shouldSetCurrent) {
        db.prepare(`
          UPDATE user_shoes
          SET is_current = 0, updated_at = datetime('now')
          WHERE user_id = ? AND is_current = 1
        `).run(req.user.id);
      }
      return db.prepare(`
        INSERT INTO user_shoes (user_id, make, model, colorway, image_data, is_current, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(req.user.id, make, model, colorway, imageData, shouldSetCurrent ? 1 : 0);
    });

    const insert = txn();
    const shoe = db.prepare(`
      SELECT id, user_id, make, model, colorway, image_data, is_current, retired_at, created_at, updated_at
      FROM user_shoes
      WHERE id = ?
    `).get(insert.lastInsertRowid);

    res.status(201).json({
      shoe: {
        ...shoe,
        is_current: !!shoe?.is_current && !shoe?.retired_at,
        songs_logged: 0,
        steps_logged: 0,
        status: shoe?.retired_at ? 'retired' : (shoe?.is_current ? 'current' : 'available'),
      },
      cabinet: getShoeCabinet(db, req.user.id),
    });
  } catch (err) {
    console.error('Create shoe error:', err.message);
    res.status(500).json({ error: 'Failed to create shoe' });
  }
});

// POST /api/piugame/shoes/:shoeId/wear
router.post('/shoes/:shoeId/wear', requireAuth, (req, res) => {
  const db = getDb();
  const shoeId = parseInt(req.params.shoeId, 10);
  if (!Number.isInteger(shoeId) || shoeId <= 0) {
    return res.status(400).json({ error: 'Invalid shoe ID' });
  }

  const shoe = db.prepare(`
    SELECT id, retired_at
    FROM user_shoes
    WHERE id = ? AND user_id = ?
  `).get(shoeId, req.user.id);
  if (!shoe) return res.status(404).json({ error: 'Shoe not found' });
  if (shoe.retired_at) return res.status(400).json({ error: 'Retired shoes cannot be set as current' });

  const txn = db.transaction(() => {
    db.prepare(`
      UPDATE user_shoes
      SET is_current = 0, updated_at = datetime('now')
      WHERE user_id = ? AND is_current = 1
    `).run(req.user.id);

    db.prepare(`
      UPDATE user_shoes
      SET is_current = 1, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(shoeId, req.user.id);
  });
  txn();

  res.json({ success: true, cabinet: getShoeCabinet(db, req.user.id) });
});

// POST /api/piugame/shoes/:shoeId/photo
router.post('/shoes/:shoeId/photo', requireAuth, SHOE_UPLOAD.single('photo'), async (req, res) => {
  try {
    const db = getDb();
    const shoeId = parseInt(req.params.shoeId, 10);
    if (!Number.isInteger(shoeId) || shoeId <= 0) {
      return res.status(400).json({ error: 'Invalid shoe ID' });
    }
    if (!req.file) return res.status(400).json({ error: 'Photo is required' });

    const shoe = db.prepare(`
      SELECT id
      FROM user_shoes
      WHERE id = ? AND user_id = ?
    `).get(shoeId, req.user.id);
    if (!shoe) return res.status(404).json({ error: 'Shoe not found' });

    const imageData = await encodeShoeImage(req.file);
    db.prepare(`
      UPDATE user_shoes
      SET image_data = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(imageData, shoeId, req.user.id);

    res.json({ success: true, cabinet: getShoeCabinet(db, req.user.id) });
  } catch (err) {
    console.error('Update shoe photo error:', err.message);
    res.status(500).json({ error: 'Failed to update shoe photo' });
  }
});

// POST /api/piugame/shoes/:shoeId/retire
router.post('/shoes/:shoeId/retire', requireAuth, (req, res) => {
  const db = getDb();
  const shoeId = parseInt(req.params.shoeId, 10);
  if (!Number.isInteger(shoeId) || shoeId <= 0) {
    return res.status(400).json({ error: 'Invalid shoe ID' });
  }

  const shoe = db.prepare(`
    SELECT id, retired_at
    FROM user_shoes
    WHERE id = ? AND user_id = ?
  `).get(shoeId, req.user.id);
  if (!shoe) return res.status(404).json({ error: 'Shoe not found' });

  if (!shoe.retired_at) {
    db.prepare(`
      UPDATE user_shoes
      SET is_current = 0, retired_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(shoeId, req.user.id);
  }

  res.json({ success: true, cabinet: getShoeCabinet(db, req.user.id) });
});

// DELETE /api/piugame/shoes/:shoeId
router.delete('/shoes/:shoeId', requireAuth, (req, res) => {
  const db = getDb();
  const shoeId = parseInt(req.params.shoeId, 10);
  if (!Number.isInteger(shoeId) || shoeId <= 0) {
    return res.status(400).json({ error: 'Invalid shoe ID' });
  }

  const shoe = db.prepare(`
    SELECT id
    FROM user_shoes
    WHERE id = ? AND user_id = ?
  `).get(shoeId, req.user.id);
  if (!shoe) return res.status(404).json({ error: 'Shoe not found' });

  const txn = db.transaction(() => {
    // Clear references first to avoid stale historical links if foreign keys are not enforced.
    db.prepare(`
      UPDATE user_recently_played
      SET shoe_id = NULL
      WHERE user_id = ? AND shoe_id = ?
    `).run(req.user.id, shoeId);

    db.prepare(`
      DELETE FROM user_shoes
      WHERE id = ? AND user_id = ?
    `).run(shoeId, req.user.id);
  });
  txn();

  res.json({ success: true, cabinet: getShoeCabinet(db, req.user.id) });
});

// ─── Sync: Recently Played ─────────────────────────────

// POST /api/piugame/sync/recently-played — fetch recent plays & update best scores
router.post('/sync/recently-played', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const progressBeforeSync = getUserTitleProgress(db, req.user.id);
    const client = await loginWithStoredCredentials(req.user.id);
    const plays = await scrapeRecentlyPlayed(client);

    const activeShoe = db.prepare(`
      SELECT id
      FROM user_shoes
      WHERE user_id = ? AND is_current = 1 AND retired_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).get(req.user.id);
    const activeShoeId = activeShoe ? parseInt(activeShoe.id, 10) : null;

    const findRecentPlay = db.prepare(`
      SELECT id, shoe_id
      FROM user_recently_played
      WHERE user_id = ?
        AND song_title = ?
        AND mode = ?
        AND level = ?
        AND score = ?
        AND grade = ?
        AND date_played = ?
      LIMIT 1
    `);

    const insertRecent = db.prepare(`
      INSERT INTO user_recently_played
      (user_id, shoe_id, song_title, mode, level, score, grade, machine_name, background_url, date_played, perfect, great, good, bad, miss, max_combo, kcal, plate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, song_title, mode, level, score, grade, date_played) DO NOTHING
    `);

    const updateRecent = db.prepare(`
      UPDATE user_recently_played
      SET
        machine_name = CASE WHEN ? != '' THEN ? ELSE machine_name END,
        background_url = CASE WHEN ? != '' THEN ? ELSE background_url END,
        plate = CASE WHEN ? != '' THEN ? ELSE plate END,
        perfect = MAX(COALESCE(perfect, 0), ?),
        great = MAX(COALESCE(great, 0), ?),
        good = MAX(COALESCE(good, 0), ?),
        bad = MAX(COALESCE(bad, 0), ?),
        miss = MAX(COALESCE(miss, 0), ?),
        max_combo = MAX(COALESCE(max_combo, 0), ?),
        kcal = MAX(COALESCE(kcal, 0), ?),
        shoe_id = CASE
          WHEN shoe_id IS NULL AND ? IS NOT NULL THEN ?
          ELSE shoe_id
        END
      WHERE id = ?
    `);

    // Also update best scores if this play is better
    const updateBest = db.prepare(`
      INSERT INTO user_best_scores (user_id, song_title, mode, level, score, grade, plate, shoe_id)
      VALUES (?, ?, ?, ?, ?, ?, '', ?)
      ON CONFLICT(user_id, song_title, mode, level) DO UPDATE SET
        score = MAX(excluded.score, user_best_scores.score),
        grade = CASE WHEN excluded.score > user_best_scores.score THEN excluded.grade ELSE user_best_scores.grade END,
        shoe_id = CASE
          WHEN excluded.score > user_best_scores.score THEN excluded.shoe_id
          ELSE user_best_scores.shoe_id
        END
    `);

    let updatedCount = 0;
    const upscoresFromRecent = [];
    const newClearsFromRecent = [];
    let upscorePostId = null;
    let newClearPostId = null;

    const txn = db.transaction(() => {
      for (const p of plays) {
        const songTitle = p.song_title;
        const mode = p.mode;
        const level = parseInt(p.level, 10) || 0;
        const score = parseInt(p.score, 10) || 0;
        const grade = p.grade || '';
        const machineName = p.machine_name || '';
        const backgroundUrl = p.background_url || '';
        const datePlayed = p.date_played || '';
        const perfect = parseInt(p.perfect, 10) || 0;
        const great = parseInt(p.great, 10) || 0;
        const good = parseInt(p.good, 10) || 0;
        const bad = parseInt(p.bad, 10) || 0;
        const miss = parseInt(p.miss, 10) || 0;
        const maxCombo = parseInt(p.max_combo, 10) || 0;
        const kcal = Number.isFinite(Number(p.kcal)) ? Number(p.kcal) : 0;
        const plate = p.plate || '';

        // When syncing, the current shoe is treated as the shoe worn for fetched plays.
        const existingPlay = findRecentPlay.get(req.user.id, songTitle, mode, level, score, grade, datePlayed);
        if (!existingPlay) {
          insertRecent.run(
            req.user.id,
            activeShoeId,
            songTitle,
            mode,
            level,
            score,
            grade,
            machineName,
            backgroundUrl,
            datePlayed,
            perfect,
            great,
            good,
            bad,
            miss,
            maxCombo,
            kcal,
            plate
          );
        } else {
          updateRecent.run(
            machineName,
            machineName,
            backgroundUrl,
            backgroundUrl,
            plate,
            plate,
            perfect,
            great,
            good,
            bad,
            miss,
            maxCombo,
            kcal,
            activeShoeId,
            activeShoeId,
            existingPlay.id
          );
        }

        // Only update best scores if this was a real play (not stage break)
        if (score > 0) {
          const existing = db.prepare(
            'SELECT score, grade FROM user_best_scores WHERE user_id = ? AND song_title = ? AND mode = ? AND level = ?'
          ).get(req.user.id, songTitle, mode, level);
          if (!existing || score > existing.score) {
            if (existing && score > existing.score) {
              upscoresFromRecent.push({
                song_title: songTitle, mode, level,
                old_score: existing.score, new_score: score,
                old_grade: existing.grade || '', new_grade: grade || '',
                background_url: backgroundUrl || '',
                perfect, great, good, bad, miss,
              });
            } else if (!existing) {
              // New clear - first time playing this song
              newClearsFromRecent.push({
                song_title: songTitle,
                mode,
                level,
                score,
                grade: grade || '',
                plate: plate || '',
                background_url: backgroundUrl || '',
                perfect, great, good, bad, miss,
              });
            }
            updateBest.run(req.user.id, songTitle, mode, level, score, grade, activeShoeId);
            updatedCount++;
          }
        }
      }
      db.prepare(`
        UPDATE user_piugame_sync SET last_recently_played_sync = datetime('now') WHERE user_id = ?
      `).run(req.user.id);

      // Track upscores from recently played
      if (upscoresFromRecent.length > 0) {
        const upscoreInsert = db.prepare(`
          INSERT INTO user_upscores (user_id, upscores_json, created_at)
          VALUES (?, ?, datetime('now'))
        `).run(req.user.id, JSON.stringify(upscoresFromRecent));
        upscorePostId = upscoreInsert.lastInsertRowid;
      }
      newClearPostId = insertGroupedNewClearPost(db, req.user.id, newClearsFromRecent);
    });
    txn();
    const progressAfterSync = updateUserSkillTitleFromBestScores(db, req.user.id);
    const newlyUnlockedTitles = getNewlyUnlockedTitles(progressBeforeSync, progressAfterSync);
    const titleUnlockPostId = insertTitleUnlockActivityPost(db, req.user.id, newlyUnlockedTitles);

    const profile = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    const actorUsername = profile?.username || 'Someone';
    const profileLink = buildProfilePath(profile?.username) || `/profile/${req.user.id}`;

    if (upscoresFromRecent.length > 0) {
      notifyActivitySubscribers(db, {
        actorUserId: req.user.id,
        actorUsername,
        activityType: 'upscores',
        notificationType: 'followed_user_upscore',
        title: 'New Upscores',
        message: `${actorUsername} posted ${upscoresFromRecent.length} new upscore${upscoresFromRecent.length === 1 ? '' : 's'}`,
        link: upscorePostId ? `/upscore/${upscorePostId}` : profileLink,
      });
    }

    if (newClearsFromRecent.length > 0) {
      notifyActivitySubscribers(db, {
        actorUserId: req.user.id,
        actorUsername,
        activityType: 'new_clears',
        notificationType: 'followed_user_new_clear',
        title: 'New Clears',
        message: `${actorUsername} posted ${newClearsFromRecent.length} new clear${newClearsFromRecent.length === 1 ? '' : 's'}`,
        link: newClearPostId ? `/clear/${newClearPostId}` : profileLink,
      });
    }

    if (newlyUnlockedTitles.length > 0) {
      const titleList = newlyUnlockedTitles.map((title) => title.name || title.skill_title).filter(Boolean);
      const titleSummary = titleList.length > 1 ? `${titleList[0]} +${titleList.length - 1}` : (titleList[0] || 'a new title');
      notifyActivitySubscribers(db, {
        actorUserId: req.user.id,
        actorUsername,
        activityType: 'new_clears',
        notificationType: 'followed_user_new_title',
        title: 'Title Earned',
        message: `${actorUsername} earned ${titleSummary}`,
        link: titleUnlockPostId ? `/clear/${titleUnlockPostId}` : profileLink,
      });
    }

    res.json({ success: true, plays_count: plays.length, scores_updated: updatedCount });
  } catch (err) {
    console.error('Recently played sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Data Retrieval (public) ────────────────────────────

// GET /api/piugame/pumbility/:userId
router.get('/pumbility/:userId', (req, res) => {
  const db = getDb();
  const scores = db.prepare(
    'SELECT * FROM user_pumbility_scores WHERE user_id = ? ORDER BY rank_order ASC'
  ).all(req.params.userId);
  const sync = db.prepare('SELECT pumbility_value, last_pumbility_sync FROM user_piugame_sync WHERE user_id = ?').get(req.params.userId);
  res.json({
    pumbility_value: sync?.pumbility_value || 0,
    last_sync: sync?.last_pumbility_sync || null,
    scores,
  });
});

// GET /api/piugame/best-scores/:userId?mode=Single|Double
router.get('/best-scores/:userId', (req, res) => {
  const db = getDb();
  const { mode } = req.query;
  let scores;
  if (mode) {
    scores = db.prepare(
      'SELECT * FROM user_best_scores WHERE user_id = ? AND mode = ? ORDER BY level ASC, score DESC'
    ).all(req.params.userId, mode);
  } else {
    scores = db.prepare(
      'SELECT * FROM user_best_scores WHERE user_id = ? ORDER BY mode ASC, level ASC, score DESC'
    ).all(req.params.userId);
  }
  const sync = db.prepare('SELECT last_best_scores_sync, best_scores_imported FROM user_piugame_sync WHERE user_id = ?').get(req.params.userId);
  res.json({
    last_sync: sync?.last_best_scores_sync || null,
    imported: !!sync?.best_scores_imported,
    scores,
  });
});

// GET /api/piugame/recently-played/:userId
router.get('/recently-played/:userId', (req, res) => {
  const db = getDb();
  const plays = db.prepare(
    `SELECT
      p.*,
      COALESCE(s.make, '') AS shoe_make,
      COALESCE(s.model, '') AS shoe_model,
      COALESCE(s.colorway, '') AS shoe_colorway
    FROM user_recently_played p
    LEFT JOIN user_shoes s ON s.id = p.shoe_id
    WHERE p.user_id = ?
    ORDER BY p.id ASC`
  ).all(req.params.userId);
  const sync = db.prepare('SELECT last_recently_played_sync FROM user_piugame_sync WHERE user_id = ?').get(req.params.userId);
  res.json({
    last_sync: sync?.last_recently_played_sync || null,
    plays,
  });
});

// GET /api/piugame/titles/:userId
router.get('/titles/:userId', (req, res) => {
  const db = getDb();
  const progress = getUserTitleProgress(db, req.params.userId);
  res.json(progress);
});

// GET /api/piugame/sync-status/:userId
router.get('/sync-status/:userId', (req, res) => {
  const db = getDb();
  const sync = db.prepare('SELECT * FROM user_piugame_sync WHERE user_id = ?').get(req.params.userId);
  const hasCreds = !!db.prepare('SELECT 1 FROM user_piugame_credentials WHERE user_id = ?').get(req.params.userId);

  // Highest clears for Singles and Doubles (from best scores where score > 0)
  let highest_single = null;
  let highest_double = null;
  try {
    const hs = db.prepare("SELECT MAX(level) as max_level FROM user_best_scores WHERE user_id = ? AND mode = 'Single' AND score > 0").get(req.params.userId);
    highest_single = hs?.max_level || null;
    const hd = db.prepare("SELECT MAX(level) as max_level FROM user_best_scores WHERE user_id = ? AND mode = 'Double' AND score > 0").get(req.params.userId);
    highest_double = hd?.max_level || null;
  } catch {}

  res.json({
    linked: hasCreds,
    highest_single,
    highest_double,
    ...(sync || { best_scores_imported: 0, pumbility_value: 0, last_best_scores_sync: null, last_pumbility_sync: null, last_recently_played_sync: null, sync_in_progress: '', sync_progress: 0, sync_total: 0 }),
  });
});

// ─── Pumbility Leaderboard ──────────────────────────────

// POST /api/piugame/sync/pumbility-ranking — scrape the public leaderboard (no login required)
router.post('/sync/pumbility-ranking', requireAuth, async (req, res) => {
  try {
    const db = getDb();

    // Rate limit: once per hour
    const meta = db.prepare('SELECT last_sync FROM pumbility_leaderboard_meta WHERE id = 1').get();
    if (meta?.last_sync) {
      const lastSync = new Date(meta.last_sync + 'Z');
      const minutesSince = (Date.now() - lastSync.getTime()) / (1000 * 60);
      if (minutesSince < 60) {
        return res.json({ success: true, cached: true, message: 'Leaderboard was synced recently' });
      }
    }

    const { rankings, threshold } = await scrapePumbilityRanking();

    const txn = db.transaction(() => {
      db.prepare('DELETE FROM pumbility_leaderboard').run();
      const insert = db.prepare('INSERT INTO pumbility_leaderboard (rank, player_name, pumbility) VALUES (?, ?, ?)');
      for (const r of rankings) {
        insert.run(r.rank, r.player_name, r.pumbility);
      }
      db.prepare(`
        INSERT INTO pumbility_leaderboard_meta (id, threshold, total_entries, last_sync)
        VALUES (1, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          threshold = excluded.threshold,
          total_entries = excluded.total_entries,
          last_sync = datetime('now')
      `).run(threshold, rankings.length);
    });
    txn();

    res.json({ success: true, entries: rankings.length, threshold });
  } catch (err) {
    console.error('Pumbility ranking sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/piugame/pumbility-ranking — get cached leaderboard data
router.get('/pumbility-ranking', (req, res) => {
  const db = getDb();
  const meta = db.prepare('SELECT * FROM pumbility_leaderboard_meta WHERE id = 1').get();
  const rankings = db.prepare('SELECT * FROM pumbility_leaderboard ORDER BY rank ASC').all();
  res.json({
    threshold: meta?.threshold || 0,
    total_entries: meta?.total_entries || 0,
    last_sync: meta?.last_sync || null,
    rankings,
  });
});

// GET /api/piugame/pumbility-stats/:userId — compute pumbility analytics
router.get('/pumbility-stats/:userId', (req, res) => {
  const db = getDb();
  const userId = req.params.userId;

  // Get pumbility scores
  const scores = db.prepare(
    'SELECT * FROM user_pumbility_scores WHERE user_id = ? ORDER BY rank_order ASC'
  ).all(userId);

  const sync = db.prepare('SELECT pumbility_value FROM user_piugame_sync WHERE user_id = ?').get(userId);
  const pumbilityValue = sync?.pumbility_value || 0;

  if (!scores.length || pumbilityValue <= 0) {
    return res.json({
      pumbility_value: pumbilityValue,
      average_rating: 0,
      equivalent_level: null,
      equivalent_grade: null,
      min_entry_rating: 0,
      min_entry_score: null,
      ranking: null,
      threshold: 0,
    });
  }

  // Compute per-song rating for each pumbility entry
  const ratingsWithDetails = scores.map(s => {
    const level = parseInt(s.level, 10) || 0;
    const base = LEVEL_BASE_POINTS[level] || 0;
    const grade = s.grade || gradeFromScore(s.score);
    const multiplier = GRADE_MULTIPLIER[grade] || 0;
    const rating = base > 0 && multiplier > 0 ? Math.round(base * multiplier * 10) / 10 : 0;
    return { ...s, rating, base, grade, multiplier };
  });

  // Sort by rating desc to find actual top 50
  const sortedByRating = [...ratingsWithDetails].sort((a, b) => b.rating - a.rating);
  const top50 = sortedByRating.slice(0, 50);
  const computedPumbility = top50.reduce((sum, s) => sum + s.rating, 0);

  // Average rating = pumbility / 50
  const averageRating = Math.round((pumbilityValue / 50) * 10) / 10;

  // Find what level + grade this average equates to
  // For each level, find the grade whose rating is closest to the average
  let equivalentLevel = null;
  let equivalentGrade = null;
  let closestDiff = Infinity;

  const levels = Object.keys(LEVEL_BASE_POINTS).map(Number).sort((a, b) => a - b);
  const grades = Object.keys(GRADE_MULTIPLIER);

  for (const level of levels) {
    const base = LEVEL_BASE_POINTS[level];
    for (const grade of grades) {
      const mult = GRADE_MULTIPLIER[grade];
      const rating = Math.round(base * mult * 10) / 10;
      const diff = Math.abs(rating - averageRating);
      if (diff < closestDiff) {
        closestDiff = diff;
        equivalentLevel = level;
        equivalentGrade = grade;
      }
    }
  }

  // Minimum rating to enter top 50
  const minEntryRating = top50.length >= 50 ? top50[top50.length - 1].rating : 0;

  // Find what score/level would produce that min entry rating
  let minEntryDetails = null;
  if (minEntryRating > 0 && top50.length >= 50) {
    const minEntry = top50[top50.length - 1];
    minEntryDetails = {
      rating: minEntryRating,
      song_title: minEntry.song_title,
      mode: minEntry.mode,
      level: minEntry.level,
      score: minEntry.score,
      grade: minEntry.grade,
    };
  }

  // Leaderboard ranking
  const meta = db.prepare('SELECT threshold FROM pumbility_leaderboard_meta WHERE id = 1').get();
  const threshold = meta?.threshold || 0;
  let ranking = null;

  if (pumbilityValue > 0 && threshold > 0) {
    // Check if user is in the leaderboard by name or by pumbility value
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    if (user?.username) {
      const leaderboardEntry = db.prepare(
        'SELECT rank FROM pumbility_leaderboard WHERE player_name = ? COLLATE NOCASE'
      ).get(user.username);
      if (leaderboardEntry) {
        ranking = leaderboardEntry.rank;
      }
    }
    // Also try by exact pumbility match to estimate position
    if (!ranking && pumbilityValue >= threshold) {
      const higherCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM pumbility_leaderboard WHERE pumbility > ?'
      ).get(pumbilityValue);
      ranking = (higherCount?.cnt || 0) + 1;
    }
  }

  res.json({
    pumbility_value: pumbilityValue,
    average_rating: averageRating,
    equivalent_level: equivalentLevel,
    equivalent_grade: equivalentGrade,
    min_entry_rating: minEntryRating,
    min_entry_details: minEntryDetails,
    ranking,
    threshold,
    scores_with_ratings: ratingsWithDetails,
  });
});

// GET /api/piugame/pumbility-recommendations/:userId — smart recommendations
router.get('/pumbility-recommendations/:userId', (req, res) => {
  const db = getDb();
  const userId = req.params.userId;

  // Get pumbility scores (top 50)
  const pumbilityScores = db.prepare(
    'SELECT * FROM user_pumbility_scores WHERE user_id = ? ORDER BY rank_order ASC'
  ).all(userId);

  // Get all best scores for the user
  const bestScores = db.prepare(
    'SELECT * FROM user_best_scores WHERE user_id = ? AND score > 0 ORDER BY level DESC, score DESC'
  ).all(userId);

  if (!bestScores.length) {
    return res.json({ recommendations: [] });
  }

  // Compute rating for each pumbility entry
  const pumbilityRatings = pumbilityScores.map(s => {
    const level = parseInt(s.level, 10) || 0;
    const base = LEVEL_BASE_POINTS[level] || 0;
    const grade = s.grade || gradeFromScore(s.score);
    const multiplier = GRADE_MULTIPLIER[grade] || 0;
    return Math.round(base * multiplier * 10) / 10;
  }).sort((a, b) => b - a);

  const minPumbilityRating = pumbilityRatings.length >= 50 ? pumbilityRatings[49] : 0;

  // For each best score, calculate current rating and potential next-grade rating
  const candidates = [];

  for (const s of bestScores) {
    const level = parseInt(s.level, 10) || 0;
    const base = LEVEL_BASE_POINTS[level];
    if (!base) continue;

    const currentScore = parseInt(s.score, 10) || 0;
    if (currentScore <= 0) continue;

    const currentGrade = s.grade || gradeFromScore(currentScore);
    const currentMult = GRADE_MULTIPLIER[currentGrade] || 0;
    const currentRating = Math.round(base * currentMult * 10) / 10;

    // Find the next grade threshold above current score
    let nextGrade = null;
    let nextThreshold = null;

    for (let i = SCORE_TO_GRADE.length - 1; i >= 0; i--) {
      if (SCORE_TO_GRADE[i].min > currentScore) {
        nextGrade = SCORE_TO_GRADE[i].grade;
        nextThreshold = SCORE_TO_GRADE[i].min;
      }
    }

    if (!nextGrade || !nextThreshold) continue;

    const nextMult = GRADE_MULTIPLIER[nextGrade];
    if (!nextMult) continue;

    const nextRating = Math.round(base * nextMult * 10) / 10;
    const ratingGain = Math.round((nextRating - currentRating) * 10) / 10;
    const scoreNeeded = nextThreshold - currentScore;

    // Only recommend if this would improve pumbility
    // Either the current rating is already in top 50, or the new rating would enter top 50
    const wouldReplace = currentRating >= minPumbilityRating || nextRating > minPumbilityRating;
    if (!wouldReplace && pumbilityRatings.length >= 50) continue;

    // Calculate actual pumbility gain
    let pumbilityGain = 0;
    if (pumbilityRatings.length >= 50) {
      // If current rating is already in top 50, gain is the rating increase
      if (currentRating >= minPumbilityRating) {
        pumbilityGain = ratingGain;
      } else if (nextRating > minPumbilityRating) {
        // If crossing into top 50, gain is new rating minus the entry that gets pushed out
        pumbilityGain = Math.round((nextRating - minPumbilityRating) * 10) / 10;
      }
    } else {
      // Less than 50 entries, any improvement adds directly
      pumbilityGain = ratingGain;
    }

    if (pumbilityGain <= 0) continue;

    candidates.push({
      song_title: s.song_title,
      mode: s.mode,
      level,
      current_score: currentScore,
      current_grade: currentGrade,
      current_rating: currentRating,
      next_grade: nextGrade,
      next_threshold: nextThreshold,
      next_rating: nextRating,
      score_needed: scoreNeeded,
      rating_gain: ratingGain,
      pumbility_gain: pumbilityGain,
      background_url: s.background_url || '',
    });
  }

  // Sort by pumbility_gain descending, then by score_needed ascending (easiest to achieve)
  candidates.sort((a, b) => {
    if (b.pumbility_gain !== a.pumbility_gain) return b.pumbility_gain - a.pumbility_gain;
    return a.score_needed - b.score_needed;
  });

  // Return top 10 recommendations
  const recommendations = candidates.slice(0, 10);

  res.json({
    recommendations,
    min_pumbility_rating: minPumbilityRating,
    pumbility_scores_count: pumbilityRatings.length,
  });
});

module.exports = router;

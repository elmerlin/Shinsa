const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const { login, scrapePumbility, scrapeBestScores, scrapeRecentlyPlayed } = require('../lib/piugameScraper');
const { createUserNotification } = require('../lib/notifications');
const { notifyActivitySubscribers, buildProfilePath } = require('../lib/activitySubscriptions');
const { getUserTitleProgress, updateUserSkillTitleFromBestScores } = require('../lib/titleProgress');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.PIU_ENCRYPT_KEY || 'shinsa-piugame-credential-key').digest();
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
    SELECT id, user_id, make, model, image_data, is_current, retired_at, created_at, updated_at
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
        INSERT INTO user_best_scores (user_id, song_title, mode, level, score, grade, plate, background_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, song_title, mode, level) DO UPDATE SET
          score = MAX(excluded.score, user_best_scores.score),
          grade = CASE WHEN excluded.score > user_best_scores.score THEN excluded.grade ELSE user_best_scores.grade END,
          plate = CASE WHEN excluded.score > user_best_scores.score THEN excluded.plate ELSE user_best_scores.plate END,
          background_url = CASE WHEN excluded.background_url != '' THEN excluded.background_url ELSE user_best_scores.background_url END
      `);

      // Capture old scores for upscore tracking before replacing
      const oldScores = {};
      const existingScores = db.prepare('SELECT song_title, mode, level, score, grade FROM user_best_scores WHERE user_id = ?').all(userId);
      for (const s of existingScores) {
        oldScores[`${s.song_title}|${s.mode}|${s.level}`] = { score: s.score, grade: s.grade };
      }

      let upscores = [];
      let newClears = [];
      let upscorePostId = null;
      let newClearPostId = null;

      const txn = db.transaction(() => {
        db.prepare('DELETE FROM user_best_scores WHERE user_id = ?').run(userId);
        for (const s of scores) {
          insertOrUpdate.run(userId, s.song_title, s.mode, s.level, s.score, s.grade, s.plate, s.background_url || '');
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

// GET /api/piugame/shoes/catalog?q=...&limit=...
router.get('/shoes/catalog', requireAuth, (req, res) => {
  const db = getDb();
  const q = normalizeShoeText(req.query?.q, 80).toLowerCase();
  const parsedLimit = parseInt(req.query?.limit, 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 24)
    : 12;
  const like = q ? `%${q}%` : '';

  const rows = db.prepare(`
    WITH grouped AS (
      SELECT
        LOWER(TRIM(COALESCE(make, ''))) AS make_key,
        LOWER(TRIM(COALESCE(model, ''))) AS model_key,
        MAX(TRIM(COALESCE(make, ''))) AS make,
        MAX(TRIM(COALESCE(model, ''))) AS model,
        COUNT(*) AS usage_count,
        MAX(COALESCE(updated_at, created_at, datetime('now'))) AS last_used_at
      FROM user_shoes
      WHERE
        (TRIM(COALESCE(make, '')) != '' OR TRIM(COALESCE(model, '')) != '')
        AND (
          ? = ''
          OR LOWER(TRIM(COALESCE(make, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(model, ''))) LIKE ?
          OR LOWER(TRIM(COALESCE(make, '') || ' ' || COALESCE(model, ''))) LIKE ?
        )
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
      p.usage_count,
      COALESCE((SELECT image_data FROM user_shoes WHERE id = p.sample_shoe_id), '') AS image_data
    FROM picked p
    ORDER BY p.usage_count DESC, p.last_used_at DESC, p.model ASC, p.make ASC
    LIMIT ?
  `).all(q, like, like, like, limit);

  res.json({
    results: rows.map((row) => ({
      id: parseInt(row.id, 10),
      make: row.make || '',
      model: row.model || '',
      usage_count: parseInt(row.usage_count, 10) || 0,
      image_data: row.image_data || '',
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
    const make = normalizeShoeText(req.body?.make, 80);
    const model = normalizeShoeText(req.body?.model, 80);
    if (!make && !model) {
      return res.status(400).json({ error: 'Shoe make or model is required' });
    }

    const imageData = await encodeShoeImage(req.file);
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
        INSERT INTO user_shoes (user_id, make, model, image_data, is_current, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(req.user.id, make, model, imageData, shouldSetCurrent ? 1 : 0);
    });

    const insert = txn();
    const shoe = db.prepare(`
      SELECT id, user_id, make, model, image_data, is_current, retired_at, created_at, updated_at
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
      INSERT INTO user_best_scores (user_id, song_title, mode, level, score, grade, plate)
      VALUES (?, ?, ?, ?, ?, ?, '')
      ON CONFLICT(user_id, song_title, mode, level) DO UPDATE SET
        score = MAX(excluded.score, user_best_scores.score),
        grade = CASE WHEN excluded.score > user_best_scores.score THEN excluded.grade ELSE user_best_scores.grade END
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
            updateBest.run(req.user.id, songTitle, mode, level, score, grade);
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
    'SELECT * FROM user_recently_played WHERE user_id = ? ORDER BY id ASC'
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

module.exports = router;

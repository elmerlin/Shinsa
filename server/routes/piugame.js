const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');
const { login, scrapePumbility, scrapeBestScores, scrapeRecentlyPlayed } = require('../lib/piugameScraper');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.PIU_ENCRYPT_KEY || 'shinsa-piugame-credential-key').digest();

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

      const txn = db.transaction(() => {
        db.prepare('DELETE FROM user_best_scores WHERE user_id = ?').run(userId);
        for (const s of scores) {
          insertOrUpdate.run(userId, s.song_title, s.mode, s.level, s.score, s.grade, s.plate, s.background_url || '');
        }

        // Track upscores
        const upscores = [];
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
          }
        }
        if (upscores.length > 0) {
          db.prepare(`
            INSERT INTO user_upscores (user_id, upscores_json, created_at)
            VALUES (?, ?, datetime('now'))
          `).run(userId, JSON.stringify(upscores));
        }
        db.prepare(`
          UPDATE user_piugame_sync SET last_best_scores_sync = datetime('now'), best_scores_imported = 1,
          sync_in_progress = '', sync_progress = 0, sync_total = 0 WHERE user_id = ?
        `).run(userId);
      });
      txn();

      // Create notification
      db.prepare(`
        INSERT INTO user_notifications (user_id, type, title, message, link)
        VALUES (?, 'sync_complete', 'Best Scores Synced', ?, ?)
      `).run(userId, `${scores.length} scores imported successfully!`, `/profile/${userId}`);

      console.log(`Background best scores sync complete for ${userId}: ${scores.length} scores`);
    } catch (err) {
      console.error('Background best scores sync error:', err.message);
      db.prepare(`
        UPDATE user_piugame_sync SET sync_in_progress = '', sync_progress = 0, sync_total = 0 WHERE user_id = ?
      `).run(userId);
      db.prepare(`
        INSERT INTO user_notifications (user_id, type, title, message)
        VALUES (?, 'sync_error', 'Best Scores Sync Failed', ?)
      `).run(userId, err.message);
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

// ─── Sync: Recently Played ─────────────────────────────

// POST /api/piugame/sync/recently-played — fetch recent plays & update best scores
router.post('/sync/recently-played', requireAuth, async (req, res) => {
  try {
    const client = await loginWithStoredCredentials(req.user.id);
    const plays = await scrapeRecentlyPlayed(client);
    const db = getDb();

    const insertRecent = db.prepare(`
      INSERT INTO user_recently_played (user_id, song_title, mode, level, score, grade, background_url, date_played, perfect, great, good, bad, miss, max_combo, kcal, plate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    const txn = db.transaction(() => {
      // Clear old recently played and replace
      db.prepare('DELETE FROM user_recently_played WHERE user_id = ?').run(req.user.id);
      for (const p of plays) {
        insertRecent.run(req.user.id, p.song_title, p.mode, p.level, p.score, p.grade, p.background_url, p.date_played,
          p.perfect || 0, p.great || 0, p.good || 0, p.bad || 0, p.miss || 0, p.max_combo || 0, p.kcal || 0, p.plate || '');

        // Only update best scores if this was a real play (not stage break)
        if (p.score > 0) {
          const existing = db.prepare(
            'SELECT score, grade FROM user_best_scores WHERE user_id = ? AND song_title = ? AND mode = ? AND level = ?'
          ).get(req.user.id, p.song_title, p.mode, p.level);
          if (!existing || p.score > existing.score) {
            if (existing && p.score > existing.score) {
              upscoresFromRecent.push({
                song_title: p.song_title, mode: p.mode, level: p.level,
                old_score: existing.score, new_score: p.score,
                old_grade: existing.grade || '', new_grade: p.grade || '',
                background_url: p.background_url || '',
              });
            }
            updateBest.run(req.user.id, p.song_title, p.mode, p.level, p.score, p.grade);
            updatedCount++;
          }
        }
      }
      db.prepare(`
        UPDATE user_piugame_sync SET last_recently_played_sync = datetime('now') WHERE user_id = ?
      `).run(req.user.id);

      // Track upscores from recently played
      if (upscoresFromRecent.length > 0) {
        db.prepare(`
          INSERT INTO user_upscores (user_id, upscores_json, created_at)
          VALUES (?, ?, datetime('now'))
        `).run(req.user.id, JSON.stringify(upscoresFromRecent));
      }
    });
    txn();

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

// GET /api/piugame/sync-status/:userId
router.get('/sync-status/:userId', (req, res) => {
  const db = getDb();
  const sync = db.prepare('SELECT * FROM user_piugame_sync WHERE user_id = ?').get(req.params.userId);
  const hasCreds = !!db.prepare('SELECT 1 FROM user_piugame_credentials WHERE user_id = ?').get(req.params.userId);
  res.json({
    linked: hasCreds,
    ...(sync || { best_scores_imported: 0, pumbility_value: 0, last_best_scores_sync: null, last_pumbility_sync: null, last_recently_played_sync: null, sync_in_progress: '', sync_progress: 0, sync_total: 0 }),
  });
});

module.exports = router;

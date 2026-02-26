const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const { requireAuth, optionalAuth } = require('./auth');
const { findMentionedUsers, notifyMentionedUsers } = require('../lib/mentions');
const { createUserNotification } = require('../lib/notifications');
const {
  getActivitySubscription,
  setActivitySubscription,
  notifyActivitySubscribers,
  buildProfilePath,
} = require('../lib/activitySubscriptions');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');

// Helper: create notification (don't notify yourself)
function createNotification(db, userId, type, title, message, link) {
  if (!userId) return null;
  return createUserNotification(db, userId, type, title, message || '', link || '');
}

function parseBooleanInput(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function stripSessionSummaryMarkers(text) {
  return String(text || '').replace(/\[\[SHINSA_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g, '').trim();
}

function textSnippet(text, max = 80) {
  const compact = stripSessionSummaryMarkers(text).replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

const RECENT_ACTIVITY_TTL_MS = 30 * 1000;
let recentActivityCache = { data: null, expiresAt: 0 };

function readRecentActivityCache() {
  if (!recentActivityCache.data) return null;
  if (Date.now() >= recentActivityCache.expiresAt) {
    recentActivityCache = { data: null, expiresAt: 0 };
    return null;
  }
  return recentActivityCache.data;
}

function writeRecentActivityCache(data) {
  recentActivityCache = {
    data,
    expiresAt: Date.now() + RECENT_ACTIVITY_TTL_MS,
  };
}

function invalidateRecentActivityCache() {
  recentActivityCache = { data: null, expiresAt: 0 };
}

function normalizePumpUserRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, row.id, 40),
  }));
}

// Multer config for image uploads (memory-only, images stored as base64 in DB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB upload limit (will be compressed)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif', 'image/avif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── Follows ──────────────────────────────────────────

// POST /api/social/follow/:userId — follow a user
router.post('/follow/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const followingId = req.params.userId;

  if (followingId === req.user.id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(followingId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  try {
    const result = db.prepare('INSERT OR IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, followingId);
    // Send notification only if this is a new follow (not a duplicate)
    if (result.changes > 0) {
      const follower = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
      createNotification(
        db,
        followingId,
        'new_follower',
        'New Follower',
        `${follower?.username || 'Someone'} started following you`,
        buildProfilePath(follower?.username) || `/profile/${req.user.id}`
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/social/follow/:userId — unfollow a user
router.delete('/follow/:userId', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, req.params.userId);
  res.json({ success: true });
});

// GET /api/social/following/:userId — list who a user follows
router.get('/following/:userId', (req, res) => {
  const db = getDb();
  const following = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.pumbility, u.skill_title, u.nationality
    FROM user_follows f
    JOIN users u ON f.following_id = u.id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.userId);
  res.json(following);
});

// GET /api/social/followers/:userId — list a user's followers
router.get('/followers/:userId', (req, res) => {
  const db = getDb();
  const followers = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.pumbility, u.skill_title, u.nationality
    FROM user_follows f
    JOIN users u ON f.follower_id = u.id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.userId);
  res.json(followers);
});

// GET /api/social/follow-status/:userId — check if current user follows target
router.get('/follow-status/:userId', optionalAuth, (req, res) => {
  const db = getDb();
  if (!req.user) return res.json({ following: false, followers_count: 0, following_count: 0 });

  const isFollowing = !!db.prepare(
    'SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?'
  ).get(req.user.id, req.params.userId);

  const followersCount = db.prepare(
    'SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?'
  ).get(req.params.userId).count;

  const followingCount = db.prepare(
    'SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?'
  ).get(req.params.userId).count;

  res.json({ following: isFollowing, followers_count: followersCount, following_count: followingCount });
});

// GET /api/social/activity-notifications/:userId — get current user's activity notif prefs for target user
router.get('/activity-notifications/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const targetUserId = req.params.userId;

  if (!targetUserId) return res.status(400).json({ error: 'User ID is required' });
  if (targetUserId === req.user.id) {
    return res.json({
      subscribed: false,
      notify_posts: false,
      notify_upscores: false,
      notify_new_clears: false,
    });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  res.json(getActivitySubscription(db, req.user.id, targetUserId));
});

// PUT /api/social/activity-notifications/:userId — set current user's activity notif prefs for target user
router.put('/activity-notifications/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const targetUserId = req.params.userId;

  if (!targetUserId) return res.status(400).json({ error: 'User ID is required' });
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: 'You cannot subscribe to your own activity notifications' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const current = getActivitySubscription(db, req.user.id, targetUserId);
  const next = {
    notify_posts: current.notify_posts,
    notify_upscores: current.notify_upscores,
    notify_new_clears: current.notify_new_clears,
  };

  let changedFields = 0;
  const fields = ['notify_posts', 'notify_upscores', 'notify_new_clears'];
  for (const field of fields) {
    if (!(field in (req.body || {}))) continue;
    const parsed = parseBooleanInput(req.body[field]);
    if (parsed === null) {
      return res.status(400).json({ error: `${field} must be a boolean` });
    }
    next[field] = parsed;
    changedFields += 1;
  }

  if (changedFields === 0) {
    return res.status(400).json({ error: 'At least one notification field must be provided' });
  }

  const saved = setActivitySubscription(db, req.user.id, targetUserId, next);
  res.json(saved);
});

// GET /api/social/counts/:userId — follower/following/post counts + pumps + trend (public)
router.get('/counts/:userId', (req, res) => {
  const db = getDb();
  const userId = req.params.userId;
  const followersCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?').get(userId).count;
  const followingCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?').get(userId).count;
  const postsCount = db.prepare('SELECT COUNT(*) as count FROM user_posts WHERE user_id = ?').get(userId).count;

  // Total pumps received across all content types
  const postPumps = db.prepare('SELECT COUNT(*) as c FROM post_pumps pp JOIN user_posts up ON pp.post_id = up.id WHERE up.user_id = ?').get(userId).c;
  const upscorePumps = db.prepare('SELECT COUNT(*) as c FROM upscore_pumps usp JOIN user_upscores us ON usp.upscore_id = us.id WHERE us.user_id = ?').get(userId).c;
  const clearPumps = db.prepare('SELECT COUNT(*) as c FROM new_clear_pumps ncp JOIN user_new_clears nc ON ncp.clear_id = nc.id WHERE nc.user_id = ?').get(userId).c;
  let commentPumps = 0;
  try {
    commentPumps = db.prepare(`
      SELECT COUNT(*) as c FROM comment_pumps cp WHERE
        (cp.comment_type = 'post' AND cp.comment_id IN (SELECT id FROM post_comments WHERE user_id = ?)) OR
        (cp.comment_type = 'upscore' AND cp.comment_id IN (SELECT id FROM upscore_comments WHERE user_id = ?)) OR
        (cp.comment_type = 'clear' AND cp.comment_id IN (SELECT id FROM new_clear_comments WHERE user_id = ?))
    `).get(userId, userId, userId).c;
  } catch {}
  const totalPumps = postPumps + upscorePumps + clearPumps + commentPumps;

  // Follower trend: snapshot today, compare to yesterday
  const today = new Date().toISOString().split('T')[0];
  try {
    db.prepare('INSERT OR REPLACE INTO follower_daily_snapshots (user_id, snapshot_date, follower_count) VALUES (?, ?, ?)').run(userId, today, followersCount);
  } catch {}
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const yesterdaySnap = db.prepare('SELECT follower_count FROM follower_daily_snapshots WHERE user_id = ? AND snapshot_date = ?').get(userId, yesterday);
  const yesterdayFollowers = yesterdaySnap ? yesterdaySnap.follower_count : followersCount;

  // Last post time
  const lastPost = db.prepare('SELECT created_at FROM user_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);

  res.json({
    followers_count: followersCount,
    following_count: followingCount,
    posts_count: postsCount,
    total_pumps: totalPumps,
    yesterday_followers: yesterdayFollowers,
    last_post_at: lastPost ? lastPost.created_at : null,
  });
});

// ─── Posts ────────────────────────────────────────────

// POST /api/social/posts — create a post (up to 9 images)
router.post('/posts', requireAuth, upload.array('images', 9), async (req, res) => {
  const db = getDb();
  const { content, youtube_url, comments_disabled } = req.body;

  if (!content && (!req.files || req.files.length === 0) && !youtube_url) {
    return res.status(400).json({ error: 'Post must have content, images, or a video' });
  }

  // Process, compress, and encode images as base64 data URLs (stored in DB, no disk files)
  const imageDataUrls = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        // Auto-rotate based on EXIF orientation, then compress to WebP
        let buffer = await sharp(file.buffer)
          .rotate() // auto-rotate from EXIF, prevents sideways photos
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 60 })
          .toBuffer();

        // Reduce further if still over 100KB
        if (buffer.length > 100 * 1024) {
          buffer = await sharp(file.buffer)
            .rotate()
            .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 40 })
            .toBuffer();
        }

        imageDataUrls.push(`data:image/webp;base64,${buffer.toString('base64')}`);
      } catch (err) {
        console.error('Image processing error:', err.message);
        // Fallback: store original as base64 with its original MIME type
        try {
          const mime = file.mimetype || 'image/png';
          imageDataUrls.push(`data:${mime};base64,${file.buffer.toString('base64')}`);
        } catch (fallbackErr) {
          console.error('Fallback encode error:', fallbackErr.message);
        }
      }
    }
  }

  const result = db.prepare(
    'INSERT INTO user_posts (user_id, content, images, youtube_url, comments_disabled) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, content || '', JSON.stringify(imageDataUrls), youtube_url || '', comments_disabled === 'true' || comments_disabled === '1' ? 1 : 0);

  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);

  const actor = post?.username || req.user.username || 'Someone';
  const contentSnippet = textSnippet(post?.content || '');
  const postMessage = contentSnippet
    ? `${actor} posted: ${contentSnippet}`
    : `${actor} made a new post`;
  notifyActivitySubscribers(db, {
    actorUserId: req.user.id,
    actorUsername: actor,
    activityType: 'posts',
    notificationType: 'followed_user_post',
    title: 'New Post',
    message: postMessage,
    link: `/post/${post.id}`,
  });
  invalidateRecentActivityCache();

  res.status(201).json({ ...post, pump_count: 0, comment_count: 0 });
});

// GET /api/social/posts/user/:userId — get a user's posts with pump/comment counts
router.get('/posts/user/:userId', optionalAuth, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT p.*, u.username, u.avatar,
           (SELECT COUNT(*) FROM post_pumps WHERE post_id = p.id) as pump_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.params.userId, limit, offset);

  // Attach user's pump status if authenticated
  if (req.user) {
    for (const post of posts) {
      post.user_pumped = !!db.prepare(
        'SELECT 1 FROM post_pumps WHERE post_id = ? AND user_id = ?'
      ).get(post.id, req.user.id);
    }
  }

  res.json(posts);
});

// PUT /api/social/posts/:id — edit own post (text/youtube only, images unchanged)
router.put('/posts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM user_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { content, youtube_url } = req.body;
  db.prepare(
    'UPDATE user_posts SET content = ?, youtube_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(content || '', youtube_url || post.youtube_url || '', req.params.id);

  const updated = db.prepare(`
    SELECT p.*, u.username, u.avatar,
           (SELECT COUNT(*) FROM post_pumps WHERE post_id = p.id) as pump_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  res.json(updated);
});

// DELETE /api/social/posts/:id — delete own post
router.delete('/posts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM user_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  db.prepare('DELETE FROM user_posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Post Drafts ────────────────────────────────────

// POST /api/social/drafts — save a new draft
router.post('/drafts', requireAuth, (req, res) => {
  const db = getDb();
  const { content, youtube_url } = req.body;
  if (!content && !youtube_url) {
    return res.status(400).json({ error: 'Draft must have content or a video' });
  }
  const result = db.prepare(
    'INSERT INTO post_drafts (user_id, content, youtube_url) VALUES (?, ?, ?)'
  ).run(req.user.id, content || '', youtube_url || '');
  const draft = db.prepare('SELECT * FROM post_drafts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(draft);
});

// GET /api/social/drafts — list user's drafts
router.get('/drafts', requireAuth, (req, res) => {
  const db = getDb();
  const drafts = db.prepare(
    'SELECT * FROM post_drafts WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);
  res.json(drafts);
});

// GET /api/social/drafts/:id — get a single draft
router.get('/drafts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const draft = db.prepare('SELECT * FROM post_drafts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

// PUT /api/social/drafts/:id — update a draft
router.put('/drafts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const draft = db.prepare('SELECT * FROM post_drafts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  const { content, youtube_url } = req.body;
  db.prepare(
    "UPDATE post_drafts SET content = ?, youtube_url = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content ?? draft.content, youtube_url ?? draft.youtube_url, draft.id);
  const updated = db.prepare('SELECT * FROM post_drafts WHERE id = ?').get(draft.id);
  res.json(updated);
});

// DELETE /api/social/drafts/:id — delete a draft
router.delete('/drafts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const draft = db.prepare('SELECT * FROM post_drafts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  db.prepare('DELETE FROM post_drafts WHERE id = ?').run(draft.id);
  res.json({ success: true });
});

// ─── Post Pumps (Likes) ─────────────────────────────

// POST /api/social/posts/:id/pump — toggle pump on a post
router.post('/posts/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const post = db.prepare('SELECT id, user_id FROM user_posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = db.prepare(
    'SELECT 1 FROM post_pumps WHERE post_id = ? AND user_id = ?'
  ).get(postId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM post_pumps WHERE post_id = ? AND user_id = ?').run(postId, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM post_pumps WHERE post_id = ?').get(postId).count;
    return res.json({ pumped: false, pump_count: count });
  }

  db.prepare('INSERT INTO post_pumps (post_id, user_id) VALUES (?, ?)').run(postId, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM post_pumps WHERE post_id = ?').get(postId).count;

  // Notify post owner
  if (post.user_id !== req.user.id) {
    const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    createNotification(db, post.user_id, 'post_pump', 'New Pump', `${me.username} pumped your post`, `/post/${postId}`);
  }

  res.json({ pumped: true, pump_count: count });
});

// GET /api/social/posts/:id/pumps — list users who pumped a post
router.get('/posts/:id/pumps', (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id, 10);
  if (Number.isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });

  const post = db.prepare('SELECT id FROM user_posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar, pp.created_at
    FROM post_pumps pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.post_id = ?
    ORDER BY datetime(pp.created_at) DESC, u.username COLLATE NOCASE ASC
  `).all(postId);

  res.json(normalizePumpUserRows(rows));
});

// GET /api/social/posts/:id/pump-status — check if user pumped
router.get('/posts/:id/pump-status', optionalAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  if (!req.user) return res.json({ pumped: false, pump_count: 0 });

  const pumped = !!db.prepare(
    'SELECT 1 FROM post_pumps WHERE post_id = ? AND user_id = ?'
  ).get(postId, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM post_pumps WHERE post_id = ?').get(postId).count;
  res.json({ pumped, pump_count: count });
});

// ─── Post Comments ──────────────────────────────────

// GET /api/social/posts/:id/comments — get comments for a post
router.get('/posts/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);

  // Fetch all comments (parents + replies) in a single query
  const allComments = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM post_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(postId);

  if (allComments.length === 0) return res.json([]);

  const commentIds = allComments.map(c => c.id);
  const placeholders = commentIds.map(() => '?').join(',');

  // Batch pump counts
  const pumpCounts = db.prepare(`
    SELECT comment_id, COUNT(*) as cnt
    FROM comment_pumps
    WHERE comment_type = 'post' AND comment_id IN (${placeholders})
    GROUP BY comment_id
  `).all(...commentIds);
  const pumpMap = {};
  for (const row of pumpCounts) pumpMap[row.comment_id] = row.cnt;

  // Batch user pump status
  let userPumpSet;
  if (req.user) {
    const userPumps = db.prepare(`
      SELECT comment_id
      FROM comment_pumps
      WHERE comment_type = 'post' AND user_id = ? AND comment_id IN (${placeholders})
    `).all(req.user.id, ...commentIds);
    userPumpSet = new Set(userPumps.map(r => r.comment_id));
  }

  // Assemble: attach pump data and group into parent/replies
  for (const c of allComments) {
    c.pump_count = pumpMap[c.id] || 0;
    c.user_pumped = userPumpSet ? userPumpSet.has(c.id) : false;
  }

  const topLevel = [];
  const replyMap = {};
  for (const c of allComments) {
    if (!c.parent_id) {
      c.replies = [];
      topLevel.push(c);
      replyMap[c.id] = c.replies;
    }
  }
  for (const c of allComments) {
    if (c.parent_id && replyMap[c.parent_id]) {
      replyMap[c.parent_id].push(c);
    }
  }

  res.json(topLevel);
});

// POST /api/social/posts/:id/comments — add a comment
router.post('/posts/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  const trimmedContent = String(content || '').trim();

  if (!trimmedContent) {
    return res.status(400).json({ error: 'Comment cannot be empty' });
  }

  const post = db.prepare('SELECT id, comments_disabled, user_id FROM user_posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.comments_disabled) return res.status(403).json({ error: 'Comments are disabled on this post' });

  // If replying, ensure parent exists and belongs to the same post
  if (parent_id) {
    const parent = db.prepare('SELECT id FROM post_comments WHERE id = ? AND post_id = ?').get(parent_id, postId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO post_comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(postId, req.user.id, parent_id || null, trimmedContent);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM post_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  comment.replies = [];
  const commentLink = `/post/${postId}?comment=${encodeURIComponent(String(comment.id))}`;

  // Notifications
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    // Reply: notify parent comment author
    const parentComment = db.prepare('SELECT user_id FROM post_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'post_reply', 'New Reply', `${me.username} replied to your comment`, commentLink);
    }
  }
  if (post.user_id !== req.user.id) {
    createNotification(db, post.user_id, 'post_comment', 'New Comment', `${me.username} commented on your post`, commentLink);
  }

  const mentionedUsers = findMentionedUsers(db, trimmedContent);
  notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId: req.user.id,
    actorUsername: me?.username || 'Someone',
    type: 'post_mention',
    title: 'Mentioned in Comment',
    message: `${me?.username || 'Someone'} mentioned you in a post comment`,
    link: commentLink,
  });

  res.status(201).json(comment);
});

// DELETE /api/social/posts/comments/:id — delete a comment (author or post author)
router.delete('/posts/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const commentId = parseInt(req.params.id);

  const comment = db.prepare('SELECT c.*, p.user_id as post_author_id FROM post_comments c JOIN user_posts p ON c.post_id = p.id WHERE c.id = ?').get(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  // Only comment author or post author can delete
  if (comment.user_id !== req.user.id && comment.post_author_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized to delete this comment' });
  }

  db.prepare('DELETE FROM post_comments WHERE id = ? OR parent_id = ?').run(commentId, commentId);
  res.json({ success: true });
});

// PATCH /api/social/posts/:id/comments-toggle — toggle comments on/off (post author only)
router.patch('/posts/:id/comments-toggle', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);

  const post = db.prepare('SELECT id, user_id, comments_disabled FROM user_posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  const newVal = post.comments_disabled ? 0 : 1;
  db.prepare('UPDATE user_posts SET comments_disabled = ? WHERE id = ?').run(newVal, postId);
  res.json({ comments_disabled: !!newVal });
});

// ─── Individual Item Views ────────────────────────────

// GET /api/social/posts/:id — get a single post by ID (public)
router.get('/posts/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });

  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM post_pumps WHERE post_id = p.id) as pump_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count
    FROM user_posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (req.user) {
    post.user_pumped = !!db.prepare(
      'SELECT 1 FROM post_pumps WHERE post_id = ? AND user_id = ?'
    ).get(post.id, req.user.id);
  }
  post.type = 'post';
  res.json(post);
});

// GET /api/social/upscores/:id — get a single upscore by ID (public)
router.get('/upscores/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);
  if (isNaN(upscoreId)) return res.status(400).json({ error: 'Invalid upscore ID' });

  const upscore = db.prepare(`
    SELECT us.*, u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM upscore_pumps WHERE upscore_id = us.id) as pump_count,
           (SELECT COUNT(*) FROM upscore_comments WHERE upscore_id = us.id) as comment_count
    FROM user_upscores us JOIN users u ON us.user_id = u.id
    WHERE us.id = ?
  `).get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });

  if (req.user) {
    upscore.user_pumped = !!db.prepare(
      'SELECT 1 FROM upscore_pumps WHERE upscore_id = ? AND user_id = ?'
    ).get(upscore.id, req.user.id);
  }
  upscore.type = 'upscore';
  res.json(upscore);
});

// GET /api/social/clears/:id — get a single new clear by ID (public)
router.get('/clears/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);
  if (isNaN(clearId)) return res.status(400).json({ error: 'Invalid clear ID' });

  const clear = db.prepare(`
    SELECT nc.*, u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM new_clear_pumps WHERE clear_id = nc.id) as pump_count,
           (SELECT COUNT(*) FROM new_clear_comments WHERE clear_id = nc.id) as comment_count
    FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
    WHERE nc.id = ?
  `).get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });

  if (req.user) {
    clear.user_pumped = !!db.prepare(
      'SELECT 1 FROM new_clear_pumps WHERE clear_id = ? AND user_id = ?'
    ).get(clear.id, req.user.id);
  }
  clear.type = 'clear';
  res.json(clear);
});

// ─── Feed ─────────────────────────────────────────────

// GET /api/social/feed — get feed from followed users (posts + upscores)
router.get('/feed', requireAuth, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  // Get posts from followed users with pump/comment counts
  const posts = db.prepare(`
    SELECT p.id, p.user_id, p.content, p.images, p.youtube_url, p.comments_disabled, p.created_at,
           u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM post_pumps WHERE post_id = p.id) as pump_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count,
           CASE WHEN pp_me.user_id IS NULL THEN 0 ELSE 1 END as user_pumped,
           'post' as type
    FROM user_posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN post_pumps pp_me ON pp_me.post_id = p.id AND pp_me.user_id = ?
    WHERE p.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
       OR p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, req.user.id, limit, offset);
  for (const post of posts) {
    post.avatar = normalizeUserAvatarForList(post.avatar, post.user_id, 64);
  }

  // Get upscores from followed users with pump/comment counts
  const upscores = db.prepare(`
    SELECT us.id, us.user_id, us.upscores_json, us.pumbility_gain, us.singles_pumbility_gain, us.created_at,
           u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM upscore_pumps WHERE upscore_id = us.id) as pump_count,
           (SELECT COUNT(*) FROM upscore_comments WHERE upscore_id = us.id) as comment_count,
           CASE WHEN usp_me.user_id IS NULL THEN 0 ELSE 1 END as user_pumped,
           'upscore' as type
    FROM user_upscores us
    JOIN users u ON us.user_id = u.id
    LEFT JOIN upscore_pumps usp_me ON usp_me.upscore_id = us.id AND usp_me.user_id = ?
    WHERE us.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
       OR us.user_id = ?
    ORDER BY us.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, req.user.id, limit, offset);
  for (const us of upscores) {
    us.avatar = normalizeUserAvatarForList(us.avatar, us.user_id, 64);
  }

  // Get new clears from followed users with pump/comment counts
  const clears = db.prepare(`
    SELECT nc.id, nc.user_id, nc.song_title, nc.mode, nc.level, nc.score, nc.grade, nc.plate, nc.background_url, nc.clears_json, nc.pumbility_gain, nc.singles_pumbility_gain, nc.created_at,
           u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM new_clear_pumps WHERE clear_id = nc.id) as pump_count,
           (SELECT COUNT(*) FROM new_clear_comments WHERE clear_id = nc.id) as comment_count,
           CASE WHEN ncp_me.user_id IS NULL THEN 0 ELSE 1 END as user_pumped,
           'clear' as type
    FROM user_new_clears nc
    JOIN users u ON nc.user_id = u.id
    LEFT JOIN new_clear_pumps ncp_me ON ncp_me.clear_id = nc.id AND ncp_me.user_id = ?
    WHERE nc.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
       OR nc.user_id = ?
    ORDER BY nc.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, req.user.id, limit, offset);
  for (const c of clears) {
    c.avatar = normalizeUserAvatarForList(c.avatar, c.user_id, 64);
  }

  // Merge and sort by created_at
  const feed = [...posts, ...upscores, ...clears]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);

  res.json(feed);
});

// ─── Upscore Pumps ──────────────────────────────────────

// POST /api/social/upscores/:id/pump — toggle pump on an upscore
router.post('/upscores/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);
  const upscore = db.prepare('SELECT id, user_id FROM user_upscores WHERE id = ?').get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });

  const existing = db.prepare(
    'SELECT 1 FROM upscore_pumps WHERE upscore_id = ? AND user_id = ?'
  ).get(upscoreId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM upscore_pumps WHERE upscore_id = ? AND user_id = ?').run(upscoreId, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM upscore_pumps WHERE upscore_id = ?').get(upscoreId).count;
    return res.json({ pumped: false, pump_count: count });
  }

  db.prepare('INSERT INTO upscore_pumps (upscore_id, user_id) VALUES (?, ?)').run(upscoreId, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM upscore_pumps WHERE upscore_id = ?').get(upscoreId).count;

  // Notify upscore owner
  if (upscore.user_id !== req.user.id) {
    const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    createNotification(db, upscore.user_id, 'upscore_pump', 'New Pump', `${me.username} pumped your upscore!`, `/upscore/${upscoreId}`);
  }

  res.json({ pumped: true, pump_count: count });
});

// GET /api/social/upscores/:id/pumps — list users who pumped an upscore
router.get('/upscores/:id/pumps', (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id, 10);
  if (Number.isNaN(upscoreId)) return res.status(400).json({ error: 'Invalid upscore ID' });

  const upscore = db.prepare('SELECT id FROM user_upscores WHERE id = ?').get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });

  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar, p.created_at
    FROM upscore_pumps p
    JOIN users u ON u.id = p.user_id
    WHERE p.upscore_id = ?
    ORDER BY datetime(p.created_at) DESC, u.username COLLATE NOCASE ASC
  `).all(upscoreId);

  res.json(normalizePumpUserRows(rows));
});

// ─── Upscore Comments ──────────────────────────────────

// GET /api/social/upscores/:id/comments
router.get('/upscores/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);

  const allComments = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM upscore_comments c JOIN users u ON c.user_id = u.id
    WHERE c.upscore_id = ?
    ORDER BY c.created_at ASC
  `).all(upscoreId);

  if (allComments.length === 0) return res.json([]);

  const commentIds = allComments.map(c => c.id);
  const placeholders = commentIds.map(() => '?').join(',');

  const pumpCounts = db.prepare(`
    SELECT comment_id, COUNT(*) as cnt FROM comment_pumps
    WHERE comment_type = 'upscore' AND comment_id IN (${placeholders})
    GROUP BY comment_id
  `).all(...commentIds);
  const pumpMap = {};
  for (const row of pumpCounts) pumpMap[row.comment_id] = row.cnt;

  let userPumpSet;
  if (req.user) {
    const userPumps = db.prepare(`
      SELECT comment_id FROM comment_pumps
      WHERE comment_type = 'upscore' AND user_id = ? AND comment_id IN (${placeholders})
    `).all(req.user.id, ...commentIds);
    userPumpSet = new Set(userPumps.map(r => r.comment_id));
  }

  for (const c of allComments) {
    c.pump_count = pumpMap[c.id] || 0;
    c.user_pumped = userPumpSet ? userPumpSet.has(c.id) : false;
  }

  const topLevel = [];
  const replyMap = {};
  for (const c of allComments) {
    if (!c.parent_id) { c.replies = []; topLevel.push(c); replyMap[c.id] = c.replies; }
  }
  for (const c of allComments) {
    if (c.parent_id && replyMap[c.parent_id]) replyMap[c.parent_id].push(c);
  }

  res.json(topLevel);
});

// POST /api/social/upscores/:id/comments
router.post('/upscores/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) return res.status(400).json({ error: 'Comment cannot be empty' });

  const upscore = db.prepare('SELECT id, user_id FROM user_upscores WHERE id = ?').get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });

  if (parent_id) {
    const parent = db.prepare('SELECT id FROM upscore_comments WHERE id = ? AND upscore_id = ?').get(parent_id, upscoreId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO upscore_comments (upscore_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(upscoreId, req.user.id, parent_id || null, trimmedContent);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM upscore_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  comment.replies = [];
  const commentLink = `/upscore/${upscoreId}?comment=${encodeURIComponent(String(comment.id))}`;

  // Notify upscore owner
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    // Reply notification to parent comment author
    const parentComment = db.prepare('SELECT user_id FROM upscore_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'upscore_reply', 'New Reply', `${me.username} replied to your comment`, commentLink);
    }
  }
  if (upscore.user_id !== req.user.id) {
    createNotification(db, upscore.user_id, 'upscore_comment', 'New Comment', `${me.username} commented on your upscore`, commentLink);
  }

  const mentionedUsers = findMentionedUsers(db, trimmedContent);
  notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId: req.user.id,
    actorUsername: me?.username || 'Someone',
    type: 'upscore_mention',
    title: 'Mentioned in Comment',
    message: `${me?.username || 'Someone'} mentioned you in an upscore comment`,
    link: commentLink,
  });

  res.status(201).json(comment);
});

// DELETE /api/social/upscores/comments/:id
router.delete('/upscores/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const commentId = parseInt(req.params.id);
  const comment = db.prepare(`
    SELECT c.*, us.user_id as upscore_author_id
    FROM upscore_comments c
    JOIN user_upscores us ON c.upscore_id = us.id
    WHERE c.id = ?
  `).get(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id && comment.upscore_author_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.prepare('DELETE FROM upscore_comments WHERE id = ? OR parent_id = ?').run(commentId, commentId);
  res.json({ success: true });
});

// ─── New Clear Pumps ──────────────────────────────────────

// POST /api/social/clears/:id/pump — toggle pump on a new clear
router.post('/clears/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);
  const clear = db.prepare('SELECT id, user_id FROM user_new_clears WHERE id = ?').get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });

  const existing = db.prepare(
    'SELECT 1 FROM new_clear_pumps WHERE clear_id = ? AND user_id = ?'
  ).get(clearId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM new_clear_pumps WHERE clear_id = ? AND user_id = ?').run(clearId, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM new_clear_pumps WHERE clear_id = ?').get(clearId).count;
    return res.json({ pumped: false, pump_count: count });
  }

  db.prepare('INSERT INTO new_clear_pumps (clear_id, user_id) VALUES (?, ?)').run(clearId, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM new_clear_pumps WHERE clear_id = ?').get(clearId).count;

  if (clear.user_id !== req.user.id) {
    const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    createNotification(db, clear.user_id, 'clear_pump', 'New Pump', `${me.username} pumped your new clear!`, `/clear/${clearId}`);
  }

  res.json({ pumped: true, pump_count: count });
});

// GET /api/social/clears/:id/pumps — list users who pumped a clear
router.get('/clears/:id/pumps', (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id, 10);
  if (Number.isNaN(clearId)) return res.status(400).json({ error: 'Invalid clear ID' });

  const clear = db.prepare('SELECT id FROM user_new_clears WHERE id = ?').get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });

  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar, p.created_at
    FROM new_clear_pumps p
    JOIN users u ON u.id = p.user_id
    WHERE p.clear_id = ?
    ORDER BY datetime(p.created_at) DESC, u.username COLLATE NOCASE ASC
  `).all(clearId);

  res.json(normalizePumpUserRows(rows));
});

// ─── New Clear Comments ──────────────────────────────────

// GET /api/social/clears/:id/comments
router.get('/clears/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);

  const allComments = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM new_clear_comments c JOIN users u ON c.user_id = u.id
    WHERE c.clear_id = ?
    ORDER BY c.created_at ASC
  `).all(clearId);

  if (allComments.length === 0) return res.json([]);

  const commentIds = allComments.map(c => c.id);
  const placeholders = commentIds.map(() => '?').join(',');

  const pumpCounts = db.prepare(`
    SELECT comment_id, COUNT(*) as cnt FROM comment_pumps
    WHERE comment_type = 'clear' AND comment_id IN (${placeholders})
    GROUP BY comment_id
  `).all(...commentIds);
  const pumpMap = {};
  for (const row of pumpCounts) pumpMap[row.comment_id] = row.cnt;

  let userPumpSet;
  if (req.user) {
    const userPumps = db.prepare(`
      SELECT comment_id FROM comment_pumps
      WHERE comment_type = 'clear' AND user_id = ? AND comment_id IN (${placeholders})
    `).all(req.user.id, ...commentIds);
    userPumpSet = new Set(userPumps.map(r => r.comment_id));
  }

  for (const c of allComments) {
    c.pump_count = pumpMap[c.id] || 0;
    c.user_pumped = userPumpSet ? userPumpSet.has(c.id) : false;
  }

  const topLevel = [];
  const replyMap = {};
  for (const c of allComments) {
    if (!c.parent_id) { c.replies = []; topLevel.push(c); replyMap[c.id] = c.replies; }
  }
  for (const c of allComments) {
    if (c.parent_id && replyMap[c.parent_id]) replyMap[c.parent_id].push(c);
  }

  res.json(topLevel);
});

// POST /api/social/clears/:id/comments
router.post('/clears/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) return res.status(400).json({ error: 'Comment cannot be empty' });

  const clear = db.prepare('SELECT id, user_id FROM user_new_clears WHERE id = ?').get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });

  if (parent_id) {
    const parent = db.prepare('SELECT id FROM new_clear_comments WHERE id = ? AND clear_id = ?').get(parent_id, clearId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO new_clear_comments (clear_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(clearId, req.user.id, parent_id || null, trimmedContent);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM new_clear_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  comment.replies = [];
  const commentLink = `/clear/${clearId}?comment=${encodeURIComponent(String(comment.id))}`;

  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    const parentComment = db.prepare('SELECT user_id FROM new_clear_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'clear_reply', 'New Reply', `${me.username} replied to your comment`, commentLink);
    }
  }
  if (clear.user_id !== req.user.id) {
    createNotification(db, clear.user_id, 'clear_comment', 'New Comment', `${me.username} commented on your new clear`, commentLink);
  }

  const mentionedUsers = findMentionedUsers(db, trimmedContent);
  notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId: req.user.id,
    actorUsername: me?.username || 'Someone',
    type: 'clear_mention',
    title: 'Mentioned in Comment',
    message: `${me?.username || 'Someone'} mentioned you in a clear comment`,
    link: commentLink,
  });

  res.status(201).json(comment);
});

// DELETE /api/social/clears/comments/:id
router.delete('/clears/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const commentId = parseInt(req.params.id);
  const comment = db.prepare(`
    SELECT c.*, nc.user_id as clear_author_id
    FROM new_clear_comments c
    JOIN user_new_clears nc ON c.clear_id = nc.id
    WHERE c.id = ?
  `).get(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id && comment.clear_author_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.prepare('DELETE FROM new_clear_comments WHERE id = ? OR parent_id = ?').run(commentId, commentId);
  res.json({ success: true });
});

// ─── Comment Pumps ──────────────────────────────────────

// POST /api/social/comments/:type/:commentId/pump — toggle pump on a comment
router.post('/comments/:type/:commentId/pump', requireAuth, (req, res) => {
  const db = getDb();
  const { type, commentId } = req.params;
  const cid = parseInt(commentId);
  if (!['post', 'upscore', 'clear'].includes(type)) return res.status(400).json({ error: 'Invalid comment type' });

  // Verify comment exists and get author
  let comment;
  if (type === 'post') {
    comment = db.prepare('SELECT id, user_id, post_id as parent_item_id FROM post_comments WHERE id = ?').get(cid);
  } else if (type === 'upscore') {
    comment = db.prepare('SELECT id, user_id, upscore_id as parent_item_id FROM upscore_comments WHERE id = ?').get(cid);
  } else {
    comment = db.prepare('SELECT id, user_id, clear_id as parent_item_id FROM new_clear_comments WHERE id = ?').get(cid);
  }
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const existing = db.prepare(
    'SELECT 1 FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?'
  ).get(type, cid, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?').run(type, cid, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM comment_pumps WHERE comment_type = ? AND comment_id = ?').get(type, cid).count;
    return res.json({ pumped: false, pump_count: count });
  }

  db.prepare('INSERT INTO comment_pumps (comment_type, comment_id, user_id) VALUES (?, ?, ?)').run(type, cid, req.user.id);
  const count = db.prepare('SELECT COUNT(*) as count FROM comment_pumps WHERE comment_type = ? AND comment_id = ?').get(type, cid).count;

  // Notify comment author
  if (comment.user_id !== req.user.id) {
    const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    const parentItemId = encodeURIComponent(String(comment.parent_item_id));
    const commentParam = encodeURIComponent(String(cid));
    const link = type === 'post'
      ? `/post/${parentItemId}?comment=${commentParam}`
      : type === 'upscore'
        ? `/upscore/${parentItemId}?comment=${commentParam}`
        : `/clear/${parentItemId}?comment=${commentParam}`;
    createNotification(db, comment.user_id, 'comment_pump', 'Comment Pumped', `${me.username} pumped your comment`, link);
  }

  res.json({ pumped: true, pump_count: count });
});

// ─── Recent Activity (public) ──────────────────────────

// GET /api/social/recent-activity — aggregated activity feed for dashboard
router.get('/recent-activity', (req, res) => {
  res.set('Cache-Control', `public, max-age=${Math.floor(RECENT_ACTIVITY_TTL_MS / 1000)}`);
  const cached = readRecentActivityCache();
  if (cached) return res.json(cached);

  const db = getDb();
  const activities = [];

  // New user signups (last 50)
  const newUsers = db.prepare(`
    SELECT id, username, avatar, nationality, created_at FROM users ORDER BY created_at DESC LIMIT 10
  `).all();
  for (const u of newUsers) {
    activities.push({
      type: 'new_user', created_at: u.created_at,
      message: `${u.username} joined Pump **Shinsa**`,
      link: buildProfilePath(u.username) || `/profile/${u.id}`,
      avatar: normalizeUserAvatarForList(u.avatar, u.id, 40), username: u.username, nationality: u.nationality,
    });
  }

  // Upscore posts
  const upscores = db.prepare(`
    SELECT us.id, us.created_at, us.upscores_json, u.id as user_id, u.username, u.avatar, u.nationality
    FROM user_upscores us JOIN users u ON us.user_id = u.id
    ORDER BY us.created_at DESC LIMIT 10
  `).all();
  for (const us of upscores) {
    const upscoreData = JSON.parse(us.upscores_json || '[]');
    const songCount = upscoreData.length;
    activities.push({
      type: 'upscore', created_at: us.created_at,
      message: `${us.username} improved ${songCount} score${songCount !== 1 ? 's' : ''}`,
      link: `/upscore/${us.id}`,
      avatar: normalizeUserAvatarForList(us.avatar, us.user_id, 40), username: us.username, nationality: us.nationality,
    });
  }

  // New clear posts
  const clears = db.prepare(`
    SELECT nc.id, nc.song_title, nc.mode, nc.level, nc.clears_json, nc.created_at, u.id as user_id, u.username, u.avatar, u.nationality
    FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
    ORDER BY nc.created_at DESC LIMIT 10
  `).all();
  for (const c of clears) {
    let clearItems = [];
    try {
      const parsed = JSON.parse(c.clears_json || '[]');
      if (Array.isArray(parsed)) clearItems = parsed;
    } catch {}
    const clearCount = clearItems.length > 0 ? clearItems.length : 1;
    const firstClear = clearItems[0] || c;
    const mode = firstClear.mode === 'Single' ? 'S' : firstClear.mode === 'Double' ? 'D' : 'C';
    const message = clearCount > 1
      ? `${c.username} cleared ${clearCount} new songs`
      : `${c.username} cleared ${firstClear.song_title} (${mode}${firstClear.level})`;
    activities.push({
      type: 'new_clear', created_at: c.created_at,
      message,
      link: `/clear/${c.id}`,
      avatar: normalizeUserAvatarForList(c.avatar, c.user_id, 40), username: c.username, nationality: c.nationality,
    });
  }

  // New posts
  const posts = db.prepare(`
    SELECT p.id, p.created_at, p.content, u.id as user_id, u.username, u.avatar, u.nationality
    FROM user_posts p JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC LIMIT 10
  `).all();
  for (const p of posts) {
    const snippet = textSnippet(p.content || '', 60);
    activities.push({
      type: 'new_post', created_at: p.created_at,
      message: `${p.username} posted${snippet ? `: "${snippet}"` : ''}`,
      link: `/post/${p.id}`,
      avatar: normalizeUserAvatarForList(p.avatar, p.user_id, 40), username: p.username, nationality: p.nationality,
    });
  }

  // New tournaments
  const tournaments = db.prepare(`
    SELECT id, name, created_at FROM tournaments ORDER BY created_at DESC LIMIT 10
  `).all();
  for (const t of tournaments) {
    activities.push({
      type: 'new_tournament', created_at: t.created_at,
      message: `Tournament "${t.name}" was created`,
      link: `/tournament/${t.id}`,
    });
  }

  // New offline duels
  const duels = db.prepare(`
    SELECT id, name, player1_name, player2_name, status, winner, created_at FROM duels ORDER BY created_at DESC LIMIT 10
  `).all();
  for (const d of duels) {
    activities.push({
      type: 'new_duel', created_at: d.created_at,
      message: `Duel "${d.name}": ${d.player1_name} vs ${d.player2_name}`,
      link: `/duel/${d.id}`,
    });
    if (d.status === 'COMPLETED' && d.winner) {
      const winnerName = d.winner === 'player1' ? d.player1_name : d.player2_name;
      activities.push({
        type: 'duel_win', created_at: d.created_at,
        message: `${winnerName} won duel "${d.name}"`,
        link: `/duel/${d.id}`,
      });
    }
  }

  // New online duels
  const onlineDuels = db.prepare(`
    SELECT od.id, od.name, od.status, od.winner, od.created_at,
           u1.username as p1_name, u1.avatar as p1_avatar,
           u2.username as p2_name, u2.avatar as p2_avatar
    FROM online_duels od
    JOIN users u1 ON od.creator_user_id = u1.id
    LEFT JOIN users u2 ON od.opponent_user_id = u2.id
    ORDER BY od.created_at DESC LIMIT 10
  `).all();
  for (const od of onlineDuels) {
    activities.push({
      type: 'new_online_duel', created_at: od.created_at,
      message: `Online duel "${od.name}": ${od.p1_name} vs ${od.p2_name || 'Waiting...'}`,
      link: `/online-duel/${od.id}`,
    });
    if (od.status === 'COMPLETED' && od.winner) {
      const winnerName = od.winner === 'player1' ? od.p1_name : od.p2_name;
      activities.push({
        type: 'online_duel_win', created_at: od.created_at,
        message: `${winnerName} won online duel "${od.name}"`,
        link: `/online-duel/${od.id}`,
      });
    }
  }

  // Tournament wins
  const completedTournaments = db.prepare(`
    SELECT t.id, t.name, t.created_at,
           p.name as winner_name, p.avatar as winner_avatar
    FROM tournaments t
    JOIN players p ON p.tournament_id = t.id
    WHERE t.phase = 'COMPLETED'
    ORDER BY p.wins DESC, p.points DESC
    LIMIT 10
  `).all();
  // Group by tournament, take top player
  const tWinMap = {};
  for (const tw of completedTournaments) {
    if (!tWinMap[tw.id]) {
      tWinMap[tw.id] = tw;
      activities.push({
        type: 'tournament_win', created_at: tw.created_at,
        message: `${tw.winner_name} won tournament "${tw.name}"`,
        link: `/tournament/${tw.id}`,
      });
    }
  }

  // Sort all by created_at and return latest 30
  activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const latestActivities = activities.slice(0, 30);
  writeRecentActivityCache(latestActivities);
  res.json(latestActivities);
});

module.exports = router;

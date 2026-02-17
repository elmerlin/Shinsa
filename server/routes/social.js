const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const { requireAuth, optionalAuth } = require('./auth');

// Helper: create notification (don't notify yourself)
function createNotification(db, userId, type, title, message, link) {
  if (!userId) return;
  db.prepare(
    'INSERT INTO user_notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, type, title, message || '', link || '');
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
      db.prepare(
        'INSERT INTO user_notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
      ).run(
        followingId,
        'new_follower',
        'New Follower',
        `${follower?.username || 'Someone'} started following you`,
        `/profile/${req.user.id}`
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

  const comments = db.prepare(`
    SELECT c.*, u.username, u.avatar,
           (SELECT COUNT(*) FROM comment_pumps WHERE comment_type = 'post' AND comment_id = c.id) as pump_count
    FROM post_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ? AND c.parent_id IS NULL
    ORDER BY c.created_at ASC
  `).all(postId);

  // Attach replies and pump status
  for (const comment of comments) {
    if (req.user) {
      comment.user_pumped = !!db.prepare('SELECT 1 FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?').get('post', comment.id, req.user.id);
    }
    comment.replies = db.prepare(`
      SELECT c.*, u.username, u.avatar,
             (SELECT COUNT(*) FROM comment_pumps WHERE comment_type = 'post' AND comment_id = c.id) as pump_count
      FROM post_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.parent_id = ?
      ORDER BY c.created_at ASC
    `).all(comment.id);
    if (req.user) {
      for (const reply of comment.replies) {
        reply.user_pumped = !!db.prepare('SELECT 1 FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?').get('post', reply.id, req.user.id);
      }
    }
  }

  res.json(comments);
});

// POST /api/social/posts/:id/comments — add a comment
router.post('/posts/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const { content, parent_id } = req.body;

  if (!content || !content.trim()) {
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
  ).run(postId, req.user.id, parent_id || null, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM post_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  comment.replies = [];

  // Notifications
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    // Reply: notify parent comment author
    const parentComment = db.prepare('SELECT user_id FROM post_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'post_reply', 'New Reply', `${me.username} replied to your comment`, `/post/${postId}`);
    }
  }
  if (post.user_id !== req.user.id) {
    createNotification(db, post.user_id, 'post_comment', 'New Comment', `${me.username} commented on your post`, `/post/${postId}`);
  }

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
           'post' as type
    FROM user_posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
       OR p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, limit, offset);

  // Attach user's pump status
  for (const post of posts) {
    post.user_pumped = !!db.prepare(
      'SELECT 1 FROM post_pumps WHERE post_id = ? AND user_id = ?'
    ).get(post.id, req.user.id);
  }

  // Get upscores from followed users with pump/comment counts
  const upscores = db.prepare(`
    SELECT us.id, us.user_id, us.upscores_json, us.created_at,
           u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM upscore_pumps WHERE upscore_id = us.id) as pump_count,
           (SELECT COUNT(*) FROM upscore_comments WHERE upscore_id = us.id) as comment_count,
           'upscore' as type
    FROM user_upscores us
    JOIN users u ON us.user_id = u.id
    WHERE us.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
       OR us.user_id = ?
    ORDER BY us.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, limit, offset);

  // Attach user's pump status for upscores
  for (const us of upscores) {
    us.user_pumped = !!db.prepare(
      'SELECT 1 FROM upscore_pumps WHERE upscore_id = ? AND user_id = ?'
    ).get(us.id, req.user.id);
  }

  // Get new clears from followed users with pump/comment counts
  const clears = db.prepare(`
    SELECT nc.id, nc.user_id, nc.song_title, nc.mode, nc.level, nc.score, nc.grade, nc.plate, nc.background_url, nc.created_at,
           u.username, u.avatar, u.nationality,
           (SELECT COUNT(*) FROM new_clear_pumps WHERE clear_id = nc.id) as pump_count,
           (SELECT COUNT(*) FROM new_clear_comments WHERE clear_id = nc.id) as comment_count,
           'clear' as type
    FROM user_new_clears nc
    JOIN users u ON nc.user_id = u.id
    WHERE nc.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
       OR nc.user_id = ?
    ORDER BY nc.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, limit, offset);

  // Attach user's pump status for clears
  for (const c of clears) {
    c.user_pumped = !!db.prepare(
      'SELECT 1 FROM new_clear_pumps WHERE clear_id = ? AND user_id = ?'
    ).get(c.id, req.user.id);
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

// ─── Upscore Comments ──────────────────────────────────

// GET /api/social/upscores/:id/comments
router.get('/upscores/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);
  const comments = db.prepare(`
    SELECT c.*, u.username, u.avatar,
           (SELECT COUNT(*) FROM comment_pumps WHERE comment_type = 'upscore' AND comment_id = c.id) as pump_count
    FROM upscore_comments c JOIN users u ON c.user_id = u.id
    WHERE c.upscore_id = ? AND c.parent_id IS NULL
    ORDER BY c.created_at ASC
  `).all(upscoreId);

  for (const comment of comments) {
    if (req.user) {
      comment.user_pumped = !!db.prepare('SELECT 1 FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?').get('upscore', comment.id, req.user.id);
    }
    comment.replies = db.prepare(`
      SELECT c.*, u.username, u.avatar,
             (SELECT COUNT(*) FROM comment_pumps WHERE comment_type = 'upscore' AND comment_id = c.id) as pump_count
      FROM upscore_comments c JOIN users u ON c.user_id = u.id
      WHERE c.parent_id = ?
      ORDER BY c.created_at ASC
    `).all(comment.id);
    if (req.user) {
      for (const reply of comment.replies) {
        reply.user_pumped = !!db.prepare('SELECT 1 FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?').get('upscore', reply.id, req.user.id);
      }
    }
  }

  res.json(comments);
});

// POST /api/social/upscores/:id/comments
router.post('/upscores/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const upscoreId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

  const upscore = db.prepare('SELECT id, user_id FROM user_upscores WHERE id = ?').get(upscoreId);
  if (!upscore) return res.status(404).json({ error: 'Upscore not found' });

  if (parent_id) {
    const parent = db.prepare('SELECT id FROM upscore_comments WHERE id = ? AND upscore_id = ?').get(parent_id, upscoreId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO upscore_comments (upscore_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(upscoreId, req.user.id, parent_id || null, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM upscore_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  comment.replies = [];

  // Notify upscore owner
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    // Reply notification to parent comment author
    const parentComment = db.prepare('SELECT user_id FROM upscore_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'upscore_reply', 'New Reply', `${me.username} replied to your comment`, `/upscore/${upscoreId}`);
    }
  }
  if (upscore.user_id !== req.user.id) {
    createNotification(db, upscore.user_id, 'upscore_comment', 'New Comment', `${me.username} commented on your upscore`, `/upscore/${upscoreId}`);
  }

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

// ─── New Clear Comments ──────────────────────────────────

// GET /api/social/clears/:id/comments
router.get('/clears/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);
  const comments = db.prepare(`
    SELECT c.*, u.username, u.avatar,
           (SELECT COUNT(*) FROM comment_pumps WHERE comment_type = 'clear' AND comment_id = c.id) as pump_count
    FROM new_clear_comments c JOIN users u ON c.user_id = u.id
    WHERE c.clear_id = ? AND c.parent_id IS NULL
    ORDER BY c.created_at ASC
  `).all(clearId);

  for (const comment of comments) {
    if (req.user) {
      comment.user_pumped = !!db.prepare('SELECT 1 FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?').get('clear', comment.id, req.user.id);
    }
    comment.replies = db.prepare(`
      SELECT c.*, u.username, u.avatar,
             (SELECT COUNT(*) FROM comment_pumps WHERE comment_type = 'clear' AND comment_id = c.id) as pump_count
      FROM new_clear_comments c JOIN users u ON c.user_id = u.id
      WHERE c.parent_id = ?
      ORDER BY c.created_at ASC
    `).all(comment.id);
    if (req.user) {
      for (const reply of comment.replies) {
        reply.user_pumped = !!db.prepare('SELECT 1 FROM comment_pumps WHERE comment_type = ? AND comment_id = ? AND user_id = ?').get('clear', reply.id, req.user.id);
      }
    }
  }

  res.json(comments);
});

// POST /api/social/clears/:id/comments
router.post('/clears/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const clearId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

  const clear = db.prepare('SELECT id, user_id FROM user_new_clears WHERE id = ?').get(clearId);
  if (!clear) return res.status(404).json({ error: 'Clear not found' });

  if (parent_id) {
    const parent = db.prepare('SELECT id FROM new_clear_comments WHERE id = ? AND clear_id = ?').get(parent_id, clearId);
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
  }

  const result = db.prepare(
    'INSERT INTO new_clear_comments (clear_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)'
  ).run(clearId, req.user.id, parent_id || null, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM new_clear_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  comment.replies = [];

  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (parent_id) {
    const parentComment = db.prepare('SELECT user_id FROM new_clear_comments WHERE id = ?').get(parent_id);
    if (parentComment && parentComment.user_id !== req.user.id) {
      createNotification(db, parentComment.user_id, 'clear_reply', 'New Reply', `${me.username} replied to your comment`, `/clear/${clearId}`);
    }
  }
  if (clear.user_id !== req.user.id) {
    createNotification(db, clear.user_id, 'clear_comment', 'New Comment', `${me.username} commented on your new clear`, `/clear/${clearId}`);
  }

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
    comment = db.prepare('SELECT id, user_id FROM post_comments WHERE id = ?').get(cid);
  } else if (type === 'upscore') {
    comment = db.prepare('SELECT id, user_id FROM upscore_comments WHERE id = ?').get(cid);
  } else {
    comment = db.prepare('SELECT id, user_id FROM new_clear_comments WHERE id = ?').get(cid);
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
    createNotification(db, comment.user_id, 'comment_pump', 'Comment Pumped', `${me.username} pumped your comment`, '');
  }

  res.json({ pumped: true, pump_count: count });
});

// ─── Recent Activity (public) ──────────────────────────

// GET /api/social/recent-activity — aggregated activity feed for dashboard
router.get('/recent-activity', (req, res) => {
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
      link: `/profile/${u.id}`,
      avatar: u.avatar, username: u.username, nationality: u.nationality,
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
      avatar: us.avatar, username: us.username, nationality: us.nationality,
    });
  }

  // New clear posts
  const clears = db.prepare(`
    SELECT nc.id, nc.song_title, nc.mode, nc.level, nc.created_at, u.id as user_id, u.username, u.avatar, u.nationality
    FROM user_new_clears nc JOIN users u ON nc.user_id = u.id
    ORDER BY nc.created_at DESC LIMIT 10
  `).all();
  for (const c of clears) {
    activities.push({
      type: 'new_clear', created_at: c.created_at,
      message: `${c.username} cleared ${c.song_title} (${c.mode === 'Single' ? 'S' : c.mode === 'Double' ? 'D' : 'C'}${c.level})`,
      link: `/clear/${c.id}`,
      avatar: c.avatar, username: c.username, nationality: c.nationality,
    });
  }

  // New posts
  const posts = db.prepare(`
    SELECT p.id, p.created_at, p.content, u.id as user_id, u.username, u.avatar, u.nationality
    FROM user_posts p JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC LIMIT 10
  `).all();
  for (const p of posts) {
    const snippet = (p.content || '').slice(0, 60) + ((p.content || '').length > 60 ? '...' : '');
    activities.push({
      type: 'new_post', created_at: p.created_at,
      message: `${p.username} posted${snippet ? `: "${snippet}"` : ''}`,
      link: `/post/${p.id}`,
      avatar: p.avatar, username: p.username, nationality: p.nationality,
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
  res.json(activities.slice(0, 30));
});

module.exports = router;

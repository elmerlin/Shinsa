const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth, optionalAuth } = require('./auth');

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'posts');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer config for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB upload limit (will be compressed)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/bmp', 'image/tiff'];
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
    db.prepare('INSERT OR IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, followingId);
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

// GET /api/social/counts/:userId — follower/following/post counts (public)
router.get('/counts/:userId', (req, res) => {
  const db = getDb();
  const followersCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?').get(req.params.userId).count;
  const followingCount = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?').get(req.params.userId).count;
  const postsCount = db.prepare('SELECT COUNT(*) as count FROM user_posts WHERE user_id = ?').get(req.params.userId).count;
  res.json({ followers_count: followersCount, following_count: followingCount, posts_count: postsCount });
});

// ─── Posts ────────────────────────────────────────────

// POST /api/social/posts — create a post (up to 9 images)
router.post('/posts', requireAuth, upload.array('images', 9), async (req, res) => {
  const db = getDb();
  const { content, youtube_url, comments_disabled } = req.body;

  if (!content && (!req.files || req.files.length === 0) && !youtube_url) {
    return res.status(400).json({ error: 'Post must have content, images, or a video' });
  }

  // Process and compress images
  const imageUrls = [];
  if (req.files && req.files.length > 0) {
    // Ensure upload directory exists at runtime
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    for (const file of req.files) {
      try {
        const filename = `${uuidv4()}.webp`;
        const filepath = path.join(UPLOAD_DIR, filename);

        // Compress to under 100KB using sharp
        await sharp(file.buffer)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 60 })
          .toFile(filepath);

        // Check size and reduce quality if needed
        let stat = fs.statSync(filepath);
        if (stat.size > 100 * 1024) {
          await sharp(file.buffer)
            .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 40 })
            .toFile(filepath);
        }

        imageUrls.push(`/uploads/posts/${filename}`);
      } catch (err) {
        console.error('Image processing error:', err.message);
        // Fallback: save original file if sharp conversion fails
        try {
          const ext = (file.originalname || '').split('.').pop() || 'png';
          const fallbackName = `${uuidv4()}.${ext}`;
          const fallbackPath = path.join(UPLOAD_DIR, fallbackName);
          fs.writeFileSync(fallbackPath, file.buffer);
          imageUrls.push(`/uploads/posts/${fallbackName}`);
        } catch (fallbackErr) {
          console.error('Fallback save error:', fallbackErr.message);
        }
      }
    }
  }

  const result = db.prepare(
    'INSERT INTO user_posts (user_id, content, images, youtube_url, comments_disabled) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, content || '', JSON.stringify(imageUrls), youtube_url || '', comments_disabled === 'true' || comments_disabled === '1' ? 1 : 0);

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

// DELETE /api/social/posts/:id — delete own post
router.delete('/posts/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM user_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // Delete associated images
  try {
    const images = JSON.parse(post.images || '[]');
    for (const img of images) {
      const filepath = path.join(__dirname, '..', img);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
  } catch (e) { /* ignore */ }

  db.prepare('DELETE FROM user_posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Post Pumps (Likes) ─────────────────────────────

// POST /api/social/posts/:id/pump — toggle pump on a post
router.post('/posts/:id/pump', requireAuth, (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);
  const post = db.prepare('SELECT id FROM user_posts WHERE id = ?').get(postId);
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
router.get('/posts/:id/comments', (req, res) => {
  const db = getDb();
  const postId = parseInt(req.params.id);

  const comments = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM post_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ? AND c.parent_id IS NULL
    ORDER BY c.created_at ASC
  `).all(postId);

  // Attach replies to each comment
  for (const comment of comments) {
    comment.replies = db.prepare(`
      SELECT c.*, u.username, u.avatar
      FROM post_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.parent_id = ?
      ORDER BY c.created_at ASC
    `).all(comment.id);
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

  // Get upscores from followed users
  const upscores = db.prepare(`
    SELECT us.id, us.user_id, us.upscores_json, us.created_at,
           u.username, u.avatar, u.nationality,
           'upscore' as type
    FROM user_upscores us
    JOIN users u ON us.user_id = u.id
    WHERE us.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
       OR us.user_id = ?
    ORDER BY us.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, limit, offset);

  // Merge and sort by created_at
  const feed = [...posts, ...upscores]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);

  res.json(feed);
});

module.exports = router;

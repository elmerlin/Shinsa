const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const { requireAuth, optionalAuth } = require('./auth');

// Multer config for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif', 'image/avif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Helper: compress image to base64 data URL
async function compressImage(buffer, maxSize = 800, quality = 60) {
  let result = await sharp(buffer)
    .rotate()
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
  if (result.length > 100 * 1024) {
    result = await sharp(buffer)
      .rotate()
      .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 40 })
      .toBuffer();
  }
  return `data:image/webp;base64,${result.toString('base64')}`;
}

// Helper: compress banner (wider aspect)
async function compressBanner(buffer) {
  let result = await sharp(buffer)
    .rotate()
    .resize(1200, 400, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 60 })
    .toBuffer();
  if (result.length > 150 * 1024) {
    result = await sharp(buffer)
      .rotate()
      .resize(900, 300, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 40 })
      .toBuffer();
  }
  return `data:image/webp;base64,${result.toString('base64')}`;
}

// Helper: slugify community name for URL
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

// Helper: create notification
function createNotification(db, userId, type, title, message, link) {
  if (!userId) return;
  db.prepare(
    'INSERT INTO user_notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, type, title, message || '', link || '');
}

// Helper: get member role in a community
function getMemberRole(db, communityId, userId) {
  if (!userId) return null;
  const member = db.prepare(
    'SELECT role FROM community_members WHERE community_id = ? AND user_id = ?'
  ).get(communityId, userId);
  return member ? member.role : null;
}

// Helper: check if user is moderator or owner
function isModOrOwner(role) {
  return role === 'owner' || role === 'moderator';
}

// ─── Community CRUD ──────────────────────────────────

// POST /api/communities — create community
router.post('/', requireAuth, upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'banner', maxCount: 1 },
]), async (req, res) => {
  const db = getDb();
  const { display_name, description, is_invite_only, badge_text, badge_color, badge_text_color } = req.body;

  if (!display_name || display_name.trim().length < 2) {
    return res.status(400).json({ error: 'Community name must be at least 2 characters' });
  }

  let name = req.body.name || slugify(display_name);
  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'URL name must be at least 2 characters' });
  }

  // Check uniqueness
  const existing = db.prepare('SELECT id FROM communities WHERE LOWER(name) = LOWER(?)').get(name);
  if (existing) {
    return res.status(400).json({ error: 'A community with this name already exists' });
  }

  const id = uuidv4();
  let avatarData = '';
  let bannerData = '';

  try {
    if (req.files?.avatar?.[0]) {
      avatarData = await compressImage(req.files.avatar[0].buffer);
    }
    if (req.files?.banner?.[0]) {
      bannerData = await compressBanner(req.files.banner[0].buffer);
    }
  } catch (err) {
    console.error('Image processing error:', err.message);
  }

  // Handle avatar as base64 string (from AvatarPicker)
  if (!avatarData && req.body.avatar) {
    avatarData = req.body.avatar;
  }

  db.prepare(`
    INSERT INTO communities (id, name, display_name, description, avatar, banner, owner_id, is_invite_only, badge_text, badge_color, badge_text_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, display_name.trim(), description || '', avatarData, bannerData, req.user.id, is_invite_only === 'true' || is_invite_only === '1' ? 1 : 0, badge_text || '', badge_color || '#ff3366', badge_text_color || '#ffffff');

  // Auto-add creator as owner member
  db.prepare(
    'INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)'
  ).run(id, req.user.id, 'owner');

  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(id);
  res.status(201).json(community);
});

// GET /api/communities — list communities
router.get('/', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = req.query.q;

  let query = `
    SELECT c.*, u.username as owner_username, u.avatar as owner_avatar,
           (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
    FROM communities c
    JOIN users u ON c.owner_id = u.id
  `;
  const params = [];

  if (search) {
    query += ` WHERE c.display_name LIKE ? OR c.description LIKE ?`;
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY member_count DESC, c.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const communities = db.prepare(query).all(...params);
  res.json(communities);
});

// GET /api/communities/featured — 3 popular communities for home page
router.get('/featured', (req, res) => {
  const db = getDb();
  const communities = db.prepare(`
    SELECT c.*, u.username as owner_username, u.avatar as owner_avatar,
           (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
    FROM communities c
    JOIN users u ON c.owner_id = u.id
    ORDER BY member_count DESC, c.created_at DESC
    LIMIT 3
  `).all();
  res.json(communities);
});

// GET /api/communities/name/:name — get community by URL name
router.get('/name/:name', optionalAuth, (req, res) => {
  const db = getDb();
  const community = db.prepare(`
    SELECT c.*, u.username as owner_username, u.avatar as owner_avatar,
           (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
    FROM communities c
    JOIN users u ON c.owner_id = u.id
    WHERE LOWER(c.name) = LOWER(?)
  `).get(req.params.name);

  if (!community) return res.status(404).json({ error: 'Community not found' });

  // Attach user's membership info
  if (req.user) {
    const membership = db.prepare(
      'SELECT role FROM community_members WHERE community_id = ? AND user_id = ?'
    ).get(community.id, req.user.id);
    community.user_role = membership ? membership.role : null;

    const pendingReq = db.prepare(
      "SELECT id FROM community_join_requests WHERE community_id = ? AND user_id = ? AND status = 'pending'"
    ).get(community.id, req.user.id);
    community.user_pending_request = !!pendingReq;
  }

  res.json(community);
});

// PUT /api/communities/:id — update community
router.put('/:id', requireAuth, upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'banner', maxCount: 1 },
]), async (req, res) => {
  const db = getDb();
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const role = getMemberRole(db, community.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only owners and moderators can edit the community' });
  }

  const updates = {};
  const fields = ['display_name', 'description', 'is_invite_only', 'badge_text', 'badge_color', 'badge_text_color'];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  // Handle name/slug change (owner only)
  if (req.body.name && role === 'owner') {
    const newName = slugify(req.body.name);
    if (newName && newName !== community.name) {
      const existing = db.prepare('SELECT id FROM communities WHERE LOWER(name) = LOWER(?) AND id != ?').get(newName, community.id);
      if (existing) return res.status(400).json({ error: 'This community URL name is already taken' });
      updates.name = newName;
    }
  }

  try {
    if (req.files?.avatar?.[0]) {
      updates.avatar = await compressImage(req.files.avatar[0].buffer);
    } else if (req.body.avatar !== undefined) {
      updates.avatar = req.body.avatar;
    }
    if (req.files?.banner?.[0]) {
      updates.banner = await compressBanner(req.files.banner[0].buffer);
    }
  } catch (err) {
    console.error('Image processing error:', err.message);
  }

  if (updates.is_invite_only !== undefined) {
    updates.is_invite_only = updates.is_invite_only === 'true' || updates.is_invite_only === '1' ? 1 : 0;
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  if (setClauses) {
    db.prepare(`UPDATE communities SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), community.id);
  }

  const updated = db.prepare(`
    SELECT c.*, u.username as owner_username, u.avatar as owner_avatar,
           (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
    FROM communities c
    JOIN users u ON c.owner_id = u.id
    WHERE c.id = ?
  `).get(community.id);
  res.json(updated);
});

// DELETE /api/communities/:id — delete community (owner only)
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) return res.status(404).json({ error: 'Community not found' });
  if (community.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the owner can delete the community' });
  }
  db.prepare('DELETE FROM communities WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Membership ──────────────────────────────────────

// POST /api/communities/:id/join — join or request to join
router.post('/:id/join', requireAuth, (req, res) => {
  const db = getDb();
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  // Already a member?
  const existing = db.prepare(
    'SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?'
  ).get(community.id, req.user.id);
  if (existing) return res.status(400).json({ error: 'Already a member' });

  if (community.is_invite_only) {
    // Check for existing pending request
    const pendingReq = db.prepare(
      "SELECT id FROM community_join_requests WHERE community_id = ? AND user_id = ? AND status = 'pending'"
    ).get(community.id, req.user.id);
    if (pendingReq) return res.status(400).json({ error: 'You already have a pending join request' });

    const requestId = uuidv4();
    db.prepare(
      'INSERT INTO community_join_requests (id, community_id, user_id) VALUES (?, ?, ?)'
    ).run(requestId, community.id, req.user.id);

    // Notify owner
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    createNotification(db, community.owner_id, 'community_join_request', 'Join Request',
      `${user?.username || 'Someone'} wants to join ${community.display_name}`,
      `/c/${community.name}/settings`);

    return res.json({ status: 'pending', message: 'Join request submitted' });
  }

  // Open community — join directly
  db.prepare(
    'INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)'
  ).run(community.id, req.user.id, 'member');
  res.json({ status: 'joined' });
});

// DELETE /api/communities/:id/leave — leave community
router.delete('/:id/leave', requireAuth, (req, res) => {
  const db = getDb();
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  if (community.owner_id === req.user.id) {
    return res.status(400).json({ error: 'Owner cannot leave the community. Transfer ownership or delete it.' });
  }

  db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(community.id, req.user.id);
  // Also remove any tags assigned to this user in this community
  db.prepare('DELETE FROM community_member_tags WHERE community_id = ? AND user_id = ?').run(community.id, req.user.id);
  res.json({ success: true });
});

// GET /api/communities/:id/members — list members
router.get('/:id/members', (req, res) => {
  const db = getDb();
  const sort = req.query.sort || 'joined';
  const orderBy = sort === 'pumbility' ? 'u.pumbility DESC' : 'cm.joined_at ASC';

  const members = db.prepare(`
    SELECT cm.role, cm.joined_at, u.id, u.username, u.avatar, u.pumbility, u.skill_title, u.nationality
    FROM community_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.community_id = ?
    ORDER BY
      CASE cm.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
      ${orderBy}
  `).all(req.params.id);

  // Attach tags and badges for each member
  for (const member of members) {
    member.tags = db.prepare(`
      SELECT ct.id, ct.name, ct.color, ct.text_color
      FROM community_member_tags cmt
      JOIN community_tags ct ON cmt.tag_id = ct.id
      WHERE cmt.community_id = ? AND cmt.user_id = ?
    `).all(req.params.id, member.id);
    member.badges = db.prepare(`
      SELECT rb.id, rb.name, rb.image
      FROM community_member_badges cmb
      JOIN community_role_badges rb ON cmb.badge_id = rb.id
      WHERE cmb.community_id = ? AND cmb.user_id = ?
    `).all(req.params.id, member.id);
  }

  res.json(members);
});

// PUT /api/communities/:id/members/:userId/role — change member role
router.put('/:id/members/:userId/role', requireAuth, (req, res) => {
  const db = getDb();
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const myRole = getMemberRole(db, community.id, req.user.id);
  const { role } = req.body;

  if (!['member', 'moderator'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Only owner can promote/demote moderators
  if (role === 'moderator' && myRole !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can promote moderators' });
  }
  if (myRole !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can change roles' });
  }

  // Can't change owner's role
  if (req.params.userId === community.owner_id) {
    return res.status(400).json({ error: "Cannot change the owner's role" });
  }

  const member = db.prepare(
    'SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?'
  ).get(community.id, req.params.userId);
  if (!member) return res.status(404).json({ error: 'User is not a member' });

  db.prepare('UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?')
    .run(role, community.id, req.params.userId);

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.userId);
  createNotification(db, req.params.userId, 'community_role_change', 'Role Updated',
    `You are now a ${role} in ${community.display_name}`,
    `/c/${community.name}`);

  res.json({ success: true });
});

// DELETE /api/communities/:id/members/:userId — remove member
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const myRole = getMemberRole(db, community.id, req.user.id);
  if (!isModOrOwner(myRole)) {
    return res.status(403).json({ error: 'Only moderators and owners can remove members' });
  }

  // Can't remove the owner
  if (req.params.userId === community.owner_id) {
    return res.status(400).json({ error: 'Cannot remove the owner' });
  }

  // Moderators can't remove other moderators
  const targetRole = getMemberRole(db, community.id, req.params.userId);
  if (targetRole === 'moderator' && myRole !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can remove moderators' });
  }

  db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(community.id, req.params.userId);
  db.prepare('DELETE FROM community_member_tags WHERE community_id = ? AND user_id = ?').run(community.id, req.params.userId);
  res.json({ success: true });
});

// ─── Join Requests ───────────────────────────────────

// GET /api/communities/:id/requests — list pending join requests
router.get('/:id/requests', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can view join requests' });
  }

  const requests = db.prepare(`
    SELECT jr.*, u.username, u.avatar, u.pumbility, u.skill_title, u.nationality
    FROM community_join_requests jr
    JOIN users u ON jr.user_id = u.id
    WHERE jr.community_id = ? AND jr.status = 'pending'
    ORDER BY jr.created_at ASC
  `).all(req.params.id);
  res.json(requests);
});

// PUT /api/communities/:id/requests/:requestId — accept or decline
router.put('/:id/requests/:requestId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage join requests' });
  }

  const { status } = req.body;
  if (!['accepted', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'Status must be accepted or declined' });
  }

  const joinReq = db.prepare(
    "SELECT * FROM community_join_requests WHERE id = ? AND community_id = ? AND status = 'pending'"
  ).get(req.params.requestId, req.params.id);
  if (!joinReq) return res.status(404).json({ error: 'Join request not found' });

  db.prepare('UPDATE community_join_requests SET status = ? WHERE id = ?').run(status, joinReq.id);

  if (status === 'accepted') {
    db.prepare(
      'INSERT OR IGNORE INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)'
    ).run(joinReq.community_id, joinReq.user_id, 'member');

    const community = db.prepare('SELECT display_name, name FROM communities WHERE id = ?').get(joinReq.community_id);
    createNotification(db, joinReq.user_id, 'community_join_accepted', 'Request Accepted',
      `You've been accepted into ${community?.display_name || 'a community'}`,
      `/c/${community?.name}`);
  } else {
    const community = db.prepare('SELECT display_name FROM communities WHERE id = ?').get(joinReq.community_id);
    createNotification(db, joinReq.user_id, 'community_join_declined', 'Request Declined',
      `Your request to join ${community?.display_name || 'a community'} was declined`, '');
  }

  res.json({ success: true });
});

// ─── Tags ────────────────────────────────────────────

// GET /api/communities/:id/tags
router.get('/:id/tags', (req, res) => {
  const db = getDb();
  const tags = db.prepare('SELECT * FROM community_tags WHERE community_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(tags);
});

// POST /api/communities/:id/tags — create tag
router.post('/:id/tags', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage tags' });
  }

  const { name, color, text_color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tag name is required' });

  const id = uuidv4();
  db.prepare(
    'INSERT INTO community_tags (id, community_id, name, color, text_color) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.params.id, name.trim(), color || '#ff3366', text_color || '#ffffff');

  const tag = db.prepare('SELECT * FROM community_tags WHERE id = ?').get(id);
  res.status(201).json(tag);
});

// PUT /api/communities/:id/tags/:tagId — update tag
router.put('/:id/tags/:tagId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage tags' });
  }

  const { name, color, text_color } = req.body;
  const tag = db.prepare('SELECT * FROM community_tags WHERE id = ? AND community_id = ?').get(req.params.tagId, req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  db.prepare('UPDATE community_tags SET name = ?, color = ?, text_color = ? WHERE id = ?')
    .run(name || tag.name, color || tag.color, text_color || tag.text_color, tag.id);

  const updated = db.prepare('SELECT * FROM community_tags WHERE id = ?').get(tag.id);
  res.json(updated);
});

// DELETE /api/communities/:id/tags/:tagId — delete tag
router.delete('/:id/tags/:tagId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage tags' });
  }

  db.prepare('DELETE FROM community_tags WHERE id = ? AND community_id = ?').run(req.params.tagId, req.params.id);
  res.json({ success: true });
});

// POST /api/communities/:id/tags/:tagId/assign/:userId — assign tag to member
router.post('/:id/tags/:tagId/assign/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can assign tags' });
  }

  // Verify member exists
  const member = db.prepare(
    'SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?'
  ).get(req.params.id, req.params.userId);
  if (!member) return res.status(404).json({ error: 'User is not a member of this community' });

  // Verify tag exists
  const tag = db.prepare(
    'SELECT 1 FROM community_tags WHERE id = ? AND community_id = ?'
  ).get(req.params.tagId, req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  db.prepare(
    'INSERT OR IGNORE INTO community_member_tags (community_id, user_id, tag_id) VALUES (?, ?, ?)'
  ).run(req.params.id, req.params.userId, req.params.tagId);
  res.json({ success: true });
});

// DELETE /api/communities/:id/tags/:tagId/assign/:userId — remove tag from member
router.delete('/:id/tags/:tagId/assign/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can remove tags' });
  }

  db.prepare(
    'DELETE FROM community_member_tags WHERE community_id = ? AND user_id = ? AND tag_id = ?'
  ).run(req.params.id, req.params.userId, req.params.tagId);
  res.json({ success: true });
});

// ─── Community Posts ─────────────────────────────────

// POST /api/communities/:id/posts — create post (members only)
router.post('/:id/posts', requireAuth, upload.array('images', 9), async (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'You must be a member to post' });

  const { content, youtube_url, comments_disabled } = req.body;
  if (!content && (!req.files || req.files.length === 0) && !youtube_url) {
    return res.status(400).json({ error: 'Post must have content, images, or a video' });
  }

  const imageDataUrls = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        imageDataUrls.push(await compressImage(file.buffer));
      } catch (err) {
        console.error('Image processing error:', err.message);
        try {
          imageDataUrls.push(`data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`);
        } catch (e) { /* skip */ }
      }
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO community_posts (id, community_id, user_id, content, images, youtube_url, comments_disabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, req.user.id, content || '', JSON.stringify(imageDataUrls), youtube_url || '', comments_disabled === 'true' || comments_disabled === '1' ? 1 : 0);

  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar as user_avatar
    FROM community_posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(id);

  // Attach author's tags and badges in this community
  post.author_tags = db.prepare(`
    SELECT ct.id, ct.name, ct.color, ct.text_color
    FROM community_member_tags cmt
    JOIN community_tags ct ON cmt.tag_id = ct.id
    WHERE cmt.community_id = ? AND cmt.user_id = ?
  `).all(req.params.id, req.user.id);

  post.author_badges = db.prepare(`
    SELECT rb.id, rb.name, rb.image
    FROM community_member_badges cmb
    JOIN community_role_badges rb ON cmb.badge_id = rb.id
    WHERE cmb.community_id = ? AND cmb.user_id = ?
  `).all(req.params.id, req.user.id);

  res.status(201).json({ ...post, pump_count: 0, comment_count: 0 });
});

// GET /api/communities/:id/posts — list posts
router.get('/:id/posts', optionalAuth, (req, res) => {
  const db = getDb();
  const sort = req.query.sort || 'new';
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  let orderBy;
  if (sort === 'activity') {
    orderBy = `
      COALESCE(
        (SELECT MAX(created_at) FROM community_post_comments WHERE post_id = p.id),
        p.created_at
      ) DESC
    `;
  } else {
    orderBy = 'p.created_at DESC';
  }

  const posts = db.prepare(`
    SELECT p.*, u.username, u.avatar as user_avatar,
           (SELECT COUNT(*) FROM community_post_pumps WHERE post_id = p.id) as pump_count,
           (SELECT COUNT(*) FROM community_post_comments WHERE post_id = p.id) as comment_count
    FROM community_posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.community_id = ?
    ORDER BY p.is_pinned DESC, ${orderBy}
    LIMIT ? OFFSET ?
  `).all(req.params.id, limit, offset);

  // Attach author tags, badges, and user pump status
  for (const post of posts) {
    post.author_tags = db.prepare(`
      SELECT ct.id, ct.name, ct.color, ct.text_color
      FROM community_member_tags cmt
      JOIN community_tags ct ON cmt.tag_id = ct.id
      WHERE cmt.community_id = ? AND cmt.user_id = ?
    `).all(req.params.id, post.user_id);

    post.author_badges = db.prepare(`
      SELECT rb.id, rb.name, rb.image
      FROM community_member_badges cmb
      JOIN community_role_badges rb ON cmb.badge_id = rb.id
      WHERE cmb.community_id = ? AND cmb.user_id = ?
    `).all(req.params.id, post.user_id);

    if (req.user) {
      post.user_pumped = !!db.prepare(
        'SELECT 1 FROM community_post_pumps WHERE post_id = ? AND user_id = ?'
      ).get(post.id, req.user.id);
    }
  }

  res.json(posts);
});

// PUT /api/communities/:id/posts/:postId — edit post
router.put('/:id/posts/:postId', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM community_posts WHERE id = ? AND community_id = ?').get(req.params.postId, req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Can only edit your own posts' });

  const { content, youtube_url } = req.body;
  db.prepare("UPDATE community_posts SET content = ?, youtube_url = ?, updated_at = datetime('now') WHERE id = ?")
    .run(content ?? post.content, youtube_url ?? post.youtube_url, post.id);

  const updated = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(post.id);
  res.json(updated);
});

// DELETE /api/communities/:id/posts/:postId — delete post
router.delete('/:id/posts/:postId', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM community_posts WHERE id = ? AND community_id = ?').get(req.params.postId, req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const role = getMemberRole(db, req.params.id, req.user.id);
  if (post.user_id !== req.user.id && !isModOrOwner(role)) {
    return res.status(403).json({ error: 'Cannot delete this post' });
  }

  db.prepare('DELETE FROM community_posts WHERE id = ?').run(post.id);
  res.json({ success: true });
});

// PUT /api/communities/:id/posts/:postId/pin — pin/unpin post
router.put('/:id/posts/:postId/pin', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can pin posts' });
  }

  const post = db.prepare('SELECT * FROM community_posts WHERE id = ? AND community_id = ?').get(req.params.postId, req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  db.prepare('UPDATE community_posts SET is_pinned = ? WHERE id = ?').run(post.is_pinned ? 0 : 1, post.id);
  res.json({ pinned: !post.is_pinned });
});

// ─── Post Interactions ───────────────────────────────

// POST /api/communities/:id/posts/:postId/pump — pump post
router.post('/:id/posts/:postId/pump', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'You must be a member to pump' });

  const existing = db.prepare(
    'SELECT 1 FROM community_post_pumps WHERE post_id = ? AND user_id = ?'
  ).get(req.params.postId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM community_post_pumps WHERE post_id = ? AND user_id = ?').run(req.params.postId, req.user.id);
  } else {
    db.prepare('INSERT INTO community_post_pumps (post_id, user_id) VALUES (?, ?)').run(req.params.postId, req.user.id);
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM community_post_pumps WHERE post_id = ?').get(req.params.postId);
  res.json({ pumped: !existing, pump_count: count.c });
});

// GET /api/communities/:id/posts/:postId/comments — get comments
router.get('/:id/posts/:postId/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const comments = db.prepare(`
    SELECT c.*, u.username, u.avatar as user_avatar,
           (SELECT COUNT(*) FROM community_comment_pumps WHERE comment_id = c.id) as pump_count
    FROM community_post_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.postId);

  // Attach author tags, badges, and user pump status
  for (const comment of comments) {
    comment.author_tags = db.prepare(`
      SELECT ct.id, ct.name, ct.color, ct.text_color
      FROM community_member_tags cmt
      JOIN community_tags ct ON cmt.tag_id = ct.id
      WHERE cmt.community_id = ? AND cmt.user_id = ?
    `).all(req.params.id, comment.user_id);

    comment.author_badges = db.prepare(`
      SELECT rb.id, rb.name, rb.image
      FROM community_member_badges cmb
      JOIN community_role_badges rb ON cmb.badge_id = rb.id
      WHERE cmb.community_id = ? AND cmb.user_id = ?
    `).all(req.params.id, comment.user_id);

    if (req.user) {
      comment.user_pumped = !!db.prepare(
        'SELECT 1 FROM community_comment_pumps WHERE comment_id = ? AND user_id = ?'
      ).get(comment.id, req.user.id);
    }
  }

  res.json(comments);
});

// POST /api/communities/:id/posts/:postId/comments — add comment
router.post('/:id/posts/:postId/comments', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'You must be a member to comment' });

  const post = db.prepare('SELECT * FROM community_posts WHERE id = ? AND community_id = ?').get(req.params.postId, req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.comments_disabled) return res.status(403).json({ error: 'Comments are disabled on this post' });

  const { content, parent_id } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

  const id = uuidv4();
  db.prepare(
    'INSERT INTO community_post_comments (id, post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.params.postId, req.user.id, parent_id || null, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar as user_avatar
    FROM community_post_comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(id);

  comment.author_tags = db.prepare(`
    SELECT ct.id, ct.name, ct.color, ct.text_color
    FROM community_member_tags cmt
    JOIN community_tags ct ON cmt.tag_id = ct.id
    WHERE cmt.community_id = ? AND cmt.user_id = ?
  `).all(req.params.id, req.user.id);

  comment.author_badges = db.prepare(`
    SELECT rb.id, rb.name, rb.image
    FROM community_member_badges cmb
    JOIN community_role_badges rb ON cmb.badge_id = rb.id
    WHERE cmb.community_id = ? AND cmb.user_id = ?
  `).all(req.params.id, req.user.id);

  // Notify post author
  if (post.user_id !== req.user.id) {
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    const community = db.prepare('SELECT name FROM communities WHERE id = ?').get(req.params.id);
    createNotification(db, post.user_id, 'community_comment', 'New Comment',
      `${user?.username || 'Someone'} commented on your post`,
      `/c/${community?.name}`);
  }

  res.status(201).json({ ...comment, pump_count: 0 });
});

// DELETE /api/communities/:id/posts/:postId/comments/:commentId — delete comment
router.delete('/:id/posts/:postId/comments/:commentId', requireAuth, (req, res) => {
  const db = getDb();
  const comment = db.prepare('SELECT * FROM community_post_comments WHERE id = ? AND post_id = ?').get(req.params.commentId, req.params.postId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const role = getMemberRole(db, req.params.id, req.user.id);
  if (comment.user_id !== req.user.id && !isModOrOwner(role)) {
    return res.status(403).json({ error: 'Cannot delete this comment' });
  }

  db.prepare('DELETE FROM community_post_comments WHERE id = ?').run(comment.id);
  res.json({ success: true });
});

// POST /api/communities/:id/comments/:commentId/pump — pump comment
router.post('/:id/comments/:commentId/pump', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'You must be a member to pump' });

  const existing = db.prepare(
    'SELECT 1 FROM community_comment_pumps WHERE comment_id = ? AND user_id = ?'
  ).get(req.params.commentId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM community_comment_pumps WHERE comment_id = ? AND user_id = ?').run(req.params.commentId, req.user.id);
  } else {
    db.prepare('INSERT INTO community_comment_pumps (comment_id, user_id) VALUES (?, ?)').run(req.params.commentId, req.user.id);
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM community_comment_pumps WHERE comment_id = ?').get(req.params.commentId);
  res.json({ pumped: !existing, pump_count: count.c });
});

// ─── Custom Emojis ──────────────────────────────────

// GET /api/communities/:id/emojis — list community emojis
router.get('/:id/emojis', (req, res) => {
  const db = getDb();
  const emojis = db.prepare('SELECT * FROM community_emojis WHERE community_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(emojis);
});

// POST /api/communities/:id/emojis/upload-sheet — process sprite sheet into emojis
router.post('/:id/emojis/upload-sheet', requireAuth, upload.single('sheet'), async (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage emojis' });
  }

  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const cols = parseInt(req.body.cols) || 4;
  const rows = parseInt(req.body.rows) || 4;
  const prefix = (req.body.prefix || 'emoji').trim();

  try {
    const metadata = await sharp(req.file.buffer).metadata();
    const cellW = Math.floor(metadata.width / cols);
    const cellH = Math.floor(metadata.height / rows);

    const emojis = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const left = c * cellW;
        const top = r * cellH;
        const cellBuffer = await sharp(req.file.buffer)
          .extract({ left, top, width: cellW, height: cellH })
          .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();

        // Skip fully transparent cells
        const stats = await sharp(cellBuffer).stats();
        if (stats.channels[3] && stats.channels[3].mean < 5) continue;

        const id = uuidv4();
        const name = `${prefix}_${r * cols + c + 1}`;
        const image = `data:image/png;base64,${cellBuffer.toString('base64')}`;

        db.prepare(
          'INSERT INTO community_emojis (id, community_id, name, image) VALUES (?, ?, ?, ?)'
        ).run(id, req.params.id, name, image);

        emojis.push({ id, community_id: req.params.id, name, image });
      }
    }

    res.status(201).json(emojis);
  } catch (err) {
    console.error('Emoji sheet processing error:', err.message);
    res.status(500).json({ error: 'Failed to process sprite sheet' });
  }
});

// PUT /api/communities/:id/emojis/:emojiId — rename emoji
router.put('/:id/emojis/:emojiId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage emojis' });
  }

  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  db.prepare('UPDATE community_emojis SET name = ? WHERE id = ? AND community_id = ?')
    .run(name.trim(), req.params.emojiId, req.params.id);

  const emoji = db.prepare('SELECT * FROM community_emojis WHERE id = ?').get(req.params.emojiId);
  res.json(emoji);
});

// DELETE /api/communities/:id/emojis/:emojiId — delete emoji
router.delete('/:id/emojis/:emojiId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage emojis' });
  }

  db.prepare('DELETE FROM community_emojis WHERE id = ? AND community_id = ?').run(req.params.emojiId, req.params.id);
  res.json({ success: true });
});

// ─── Role Badges ────────────────────────────────────

// GET /api/communities/:id/badges — list community role badges
router.get('/:id/badges', (req, res) => {
  const db = getDb();
  const badges = db.prepare('SELECT * FROM community_role_badges WHERE community_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(badges);
});

// POST /api/communities/:id/badges/upload-sheet — process sprite sheet into badges
router.post('/:id/badges/upload-sheet', requireAuth, upload.single('sheet'), async (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage badges' });
  }

  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const cols = parseInt(req.body.cols) || 4;
  const rows = parseInt(req.body.rows) || 4;
  const prefix = (req.body.prefix || 'badge').trim();

  try {
    const metadata = await sharp(req.file.buffer).metadata();
    const cellW = Math.floor(metadata.width / cols);
    const cellH = Math.floor(metadata.height / rows);

    const badges = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const left = c * cellW;
        const top = r * cellH;
        const cellBuffer = await sharp(req.file.buffer)
          .extract({ left, top, width: cellW, height: cellH })
          .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();

        // Skip fully transparent cells
        const stats = await sharp(cellBuffer).stats();
        if (stats.channels[3] && stats.channels[3].mean < 5) continue;

        const id = uuidv4();
        const name = `${prefix}_${r * cols + c + 1}`;
        const image = `data:image/png;base64,${cellBuffer.toString('base64')}`;

        db.prepare(
          'INSERT INTO community_role_badges (id, community_id, name, image) VALUES (?, ?, ?, ?)'
        ).run(id, req.params.id, name, image);

        badges.push({ id, community_id: req.params.id, name, image });
      }
    }

    res.status(201).json(badges);
  } catch (err) {
    console.error('Badge sheet processing error:', err.message);
    res.status(500).json({ error: 'Failed to process sprite sheet' });
  }
});

// PUT /api/communities/:id/badges/:badgeId — rename badge
router.put('/:id/badges/:badgeId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage badges' });
  }

  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  db.prepare('UPDATE community_role_badges SET name = ? WHERE id = ? AND community_id = ?')
    .run(name.trim(), req.params.badgeId, req.params.id);

  const badge = db.prepare('SELECT * FROM community_role_badges WHERE id = ?').get(req.params.badgeId);
  res.json(badge);
});

// DELETE /api/communities/:id/badges/:badgeId — delete badge
router.delete('/:id/badges/:badgeId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can manage badges' });
  }

  db.prepare('DELETE FROM community_role_badges WHERE id = ? AND community_id = ?').run(req.params.badgeId, req.params.id);
  res.json({ success: true });
});

// POST /api/communities/:id/badges/:badgeId/assign/:userId — assign badge to member
router.post('/:id/badges/:badgeId/assign/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can assign badges' });
  }

  const member = db.prepare(
    'SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?'
  ).get(req.params.id, req.params.userId);
  if (!member) return res.status(404).json({ error: 'User is not a member' });

  const badge = db.prepare(
    'SELECT 1 FROM community_role_badges WHERE id = ? AND community_id = ?'
  ).get(req.params.badgeId, req.params.id);
  if (!badge) return res.status(404).json({ error: 'Badge not found' });

  db.prepare(
    'INSERT OR IGNORE INTO community_member_badges (community_id, user_id, badge_id) VALUES (?, ?, ?)'
  ).run(req.params.id, req.params.userId, req.params.badgeId);
  res.json({ success: true });
});

// DELETE /api/communities/:id/badges/:badgeId/assign/:userId — remove badge from member
router.delete('/:id/badges/:badgeId/assign/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const role = getMemberRole(db, req.params.id, req.user.id);
  if (!isModOrOwner(role)) {
    return res.status(403).json({ error: 'Only moderators and owners can remove badges' });
  }

  db.prepare(
    'DELETE FROM community_member_badges WHERE community_id = ? AND user_id = ? AND badge_id = ?'
  ).run(req.params.id, req.params.userId, req.params.badgeId);
  res.json({ success: true });
});

// ─── User's communities (for profile) ───────────────

// GET /api/communities/user/:userId — communities a user belongs to
router.get('/user/:userId', (req, res) => {
  const db = getDb();
  const communities = db.prepare(`
    SELECT c.id, c.name, c.display_name, c.avatar, c.badge_text, c.badge_color, c.badge_text_color, cm.role
    FROM community_members cm
    JOIN communities c ON cm.community_id = c.id
    WHERE cm.user_id = ?
    ORDER BY cm.joined_at DESC
  `).all(req.params.userId);
  res.json(communities);
});

module.exports = router;

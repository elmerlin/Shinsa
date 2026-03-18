const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { createUserNotification } = require('../lib/notifications');
const {
  buildDirectConversationKey,
  buildNotificationBody,
  buildNotificationTitle,
  normalizeConversationInput,
  normalizeConversationMessage,
  normalizeConversationRow,
} = require('../lib/directMessages');
const {
  NOTE_TTL_HOURS,
  STORY_TTL_HOURS,
  addHours,
  getInboxHighlights,
  getStoryItemsForUser,
  normalizeNotePayload,
  normalizeStoryUser,
  normalizeText,
  parseJsonObject,
  sanitizeAbsoluteUrl,
  sanitizeRelativePath,
  sanitizeStickerTokens,
  toSqliteDateTime: toInboxSqliteDateTime,
} = require('../lib/inboxHighlights');

const router = express.Router();
const highlightUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/heic', 'image/heif', 'image/avif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function toSqliteDateTime(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getConversationListRows(db, userId) {
  return db.prepare(`
    SELECT
      c.id,
      c.kind,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      c.last_message_id,
      lm.sender_user_id AS last_message_sender_user_id,
      lm.message_type AS last_message_type,
      lm.content AS last_message_content,
      lm.metadata_json AS last_message_metadata_json,
      partner.id AS partner_user_id,
      partner.username AS partner_username,
      partner.avatar AS partner_avatar,
      partner.avatar_v AS partner_avatar_v,
      (
        SELECT stomp_out.created_at
        FROM user_message_stomps stomp_out
        WHERE stomp_out.sender_user_id = ?
          AND stomp_out.recipient_user_id = partner.id
        LIMIT 1
      ) AS stomp_sent_at,
      EXISTS(
        SELECT 1
        FROM user_message_stomps stomp_in
        WHERE stomp_in.sender_user_id = partner.id
          AND stomp_in.recipient_user_id = ?
      ) AS has_incoming_stomp,
      (
        SELECT COUNT(*)
        FROM conversation_messages unread
        WHERE unread.conversation_id = c.id
          AND unread.deleted_at = ''
          AND unread.sender_user_id != ?
          AND (
            cm.last_read_at = ''
            OR datetime(unread.created_at) > datetime(cm.last_read_at)
          )
      ) AS unread_count
    FROM conversations c
    JOIN conversation_members cm
      ON cm.conversation_id = c.id
      AND cm.user_id = ?
    LEFT JOIN conversation_messages lm ON lm.id = c.last_message_id
    LEFT JOIN conversation_members other_cm
      ON other_cm.conversation_id = c.id
      AND other_cm.user_id != ?
    LEFT JOIN users partner ON partner.id = other_cm.user_id
    WHERE cm.is_hidden = 0
    ORDER BY datetime(COALESCE(NULLIF(c.last_message_at, ''), c.created_at)) DESC, c.id DESC
  `).all(userId, userId, userId, userId, userId);
}

function getConversationRowForUser(db, conversationId, userId) {
  return db.prepare(`
    SELECT
      c.id,
      c.kind,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      c.last_message_id,
      lm.sender_user_id AS last_message_sender_user_id,
      lm.message_type AS last_message_type,
      lm.content AS last_message_content,
      lm.metadata_json AS last_message_metadata_json,
      partner.id AS partner_user_id,
      partner.username AS partner_username,
      partner.avatar AS partner_avatar,
      partner.avatar_v AS partner_avatar_v,
      (
        SELECT stomp_out.created_at
        FROM user_message_stomps stomp_out
        WHERE stomp_out.sender_user_id = ?
          AND stomp_out.recipient_user_id = partner.id
        LIMIT 1
      ) AS stomp_sent_at,
      EXISTS(
        SELECT 1
        FROM user_message_stomps stomp_in
        WHERE stomp_in.sender_user_id = partner.id
          AND stomp_in.recipient_user_id = ?
      ) AS has_incoming_stomp,
      (
        SELECT COUNT(*)
        FROM conversation_messages unread
        WHERE unread.conversation_id = c.id
          AND unread.deleted_at = ''
          AND unread.sender_user_id != ?
          AND (
            cm.last_read_at = ''
            OR datetime(unread.created_at) > datetime(cm.last_read_at)
          )
      ) AS unread_count
    FROM conversations c
    JOIN conversation_members cm
      ON cm.conversation_id = c.id
      AND cm.user_id = ?
    LEFT JOIN conversation_messages lm ON lm.id = c.last_message_id
    LEFT JOIN conversation_members other_cm
      ON other_cm.conversation_id = c.id
      AND other_cm.user_id != ?
    LEFT JOIN users partner ON partner.id = other_cm.user_id
    WHERE c.id = ?
      AND cm.is_hidden = 0
    LIMIT 1
  `).get(userId, userId, userId, userId, userId, conversationId);
}

function getUserIdentity(db, userId) {
  return db.prepare(`
    SELECT id, username, avatar, avatar_v
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(userId);
}

function getHighlightUserRow(db, userId) {
  return db.prepare(`
    SELECT id, username, avatar, avatar_v, playing_status
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(userId);
}

function isFollowingOrSelf(db, viewerUserId, targetUserId) {
  const viewer = String(viewerUserId || '').trim();
  const target = String(targetUserId || '').trim();
  if (!viewer || !target) return false;
  if (viewer === target) return true;
  return !!db.prepare(`
    SELECT 1
    FROM user_follows
    WHERE follower_id = ? AND following_id = ?
    LIMIT 1
  `).get(viewer, target);
}

function getStoryBundleForUser(db, userId) {
  const user = getHighlightUserRow(db, userId);
  if (!user) return null;
  const normalizedUser = {
    ...user,
    avatar: normalizeStoryUser(user, 72)?.avatar || '',
  };
  return {
    user: normalizedUser,
    stories: getStoryItemsForUser(db, normalizedUser),
  };
}

function findStoryForUser(db, userId, storyId) {
  const bundle = getStoryBundleForUser(db, userId);
  if (!bundle) return null;
  const story = bundle.stories.find((entry) => String(entry?.id || '') === String(storyId || '').trim()) || null;
  return story ? { ...bundle, story } : null;
}

function hideStoryItem(db, ownerUserId, storyId, hiddenAt, reason = 'hidden') {
  db.prepare(`
    INSERT INTO user_story_hidden_items (id, owner_user_id, story_id, hidden_at, reason)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, story_id) DO UPDATE SET
      hidden_at = excluded.hidden_at,
      reason = excluded.reason
  `).run(uuidv4(), ownerUserId, storyId, hiddenAt, reason);
}

function listStoryComments(db, ownerUserId, storyId, limit = 0) {
  const query = `
    SELECT
      c.id,
      c.content,
      c.created_at,
      u.id AS user_id,
      u.username,
      u.avatar,
      u.avatar_v
    FROM user_story_comments c
    JOIN users u ON u.id = c.comment_user_id
    WHERE c.owner_user_id = ?
      AND c.story_id = ?
    ORDER BY datetime(c.created_at) DESC, c.id DESC
    ${limit > 0 ? `LIMIT ${Math.max(1, parseInt(limit, 10) || 0)}` : ''}
  `;
  const rows = db.prepare(query).all(ownerUserId, storyId);
  return rows
    .map((row) => ({
      id: row.id,
      content: String(row.content || ''),
      created_at: row.created_at || '',
      user: normalizeStoryUser({
        id: row.user_id,
        username: row.username,
        avatar: row.avatar,
        avatar_v: row.avatar_v,
      }, 40),
    }))
    .reverse();
}

function getStoryCounts(db, ownerUserId, storyId, viewerUserId = '') {
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM user_story_views WHERE owner_user_id = ? AND story_id = ?) AS view_count,
      (SELECT COUNT(*) FROM user_story_pumps WHERE owner_user_id = ? AND story_id = ?) AS pump_count,
      (SELECT COUNT(*) FROM user_story_comments WHERE owner_user_id = ? AND story_id = ?) AS comment_count
  `).get(ownerUserId, storyId, ownerUserId, storyId, ownerUserId, storyId);

  const userPumped = !!viewerUserId && !!db.prepare(`
    SELECT 1
    FROM user_story_pumps
    WHERE owner_user_id = ? AND story_id = ? AND pumper_user_id = ?
    LIMIT 1
  `).get(ownerUserId, storyId, viewerUserId);

  return {
    view_count: parseInt(counts?.view_count, 10) || 0,
    pump_count: parseInt(counts?.pump_count, 10) || 0,
    comment_count: parseInt(counts?.comment_count, 10) || 0,
    user_pumped: userPumped,
  };
}

function buildStoryEngagementPayload(db, ownerUserId, storyId, viewerUserId = '') {
  return {
    ...getStoryCounts(db, ownerUserId, storyId, viewerUserId),
    preview_comments: listStoryComments(db, ownerUserId, storyId, 6).slice(-3),
  };
}

function getStoryViewerList(db, ownerUserId, storyId) {
  return db.prepare(`
    SELECT
      v.viewer_user_id,
      v.viewed_at,
      u.username,
      u.avatar,
      u.avatar_v
    FROM user_story_views v
    JOIN users u ON u.id = v.viewer_user_id
    WHERE v.owner_user_id = ?
      AND v.story_id = ?
    ORDER BY datetime(v.viewed_at) DESC, v.id DESC
  `).all(ownerUserId, storyId).map((row) => ({
    viewed_at: row.viewed_at || '',
    user: normalizeStoryUser({
      id: row.viewer_user_id,
      username: row.username,
      avatar: row.avatar,
      avatar_v: row.avatar_v,
    }, 44),
  }));
}

function createStoryArchive(db, ownerUserId, story, archivedAt) {
  db.prepare(`
    INSERT INTO user_story_archives (id, owner_user_id, story_id, story_snapshot_json, archived_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, story_id) DO UPDATE SET
      story_snapshot_json = excluded.story_snapshot_json,
      archived_at = excluded.archived_at
  `).run(uuidv4(), ownerUserId, story.id, JSON.stringify(story), archivedAt);
}

function getArchivedStories(db, ownerUserId) {
  return db.prepare(`
    SELECT story_id, story_snapshot_json, archived_at
    FROM user_story_archives
    WHERE owner_user_id = ?
    ORDER BY datetime(archived_at) DESC, id DESC
    LIMIT 100
  `).all(ownerUserId).map((row) => {
    const parsed = parseJsonObject(row.story_snapshot_json, {});
    return {
      archived_at: row.archived_at || '',
      story: parsed && typeof parsed === 'object' ? parsed : null,
    };
  }).filter((entry) => entry.story?.id);
}

function deleteManualStoryRowIfPresent(db, ownerUserId, storyId, deletedAt) {
  const manualId = String(storyId || '').startsWith('story:') ? String(storyId).slice(6) : '';
  if (!manualId) return false;
  const result = db.prepare(`
    UPDATE user_story_items
    SET deleted_at = ?
    WHERE id = ?
      AND user_id = ?
      AND COALESCE(deleted_at, '') = ''
  `).run(deletedAt, manualId, ownerUserId);
  return result.changes > 0;
}

function buildStorySharePayload(story, ownerUser) {
  const fallbackPath = sanitizeRelativePath(`/profile/${encodeURIComponent(String(ownerUser?.id || ''))}`);
  const kind = String(
    story?.type === 'score_roundup'
      ? (story?.entry_kind === 'clear' ? 'clear' : 'upscore')
      : story?.type === 'live_session'
        ? 'live_session'
        : story?.type === 'hour_of_power'
          ? 'hour_of_power'
          : story?.source?.kind || 'story'
  ).trim().toLowerCase() || 'story';
  const linkPath = sanitizeRelativePath(story?.link?.path || fallbackPath);
  const linkUrl = sanitizeAbsoluteUrl(story?.link?.url || '');
  return {
    kind,
    path: linkPath || fallbackPath || '/messages',
    url: linkUrl,
    title: String(story?.title || `${ownerUser?.username || 'Player'} story`).trim().slice(0, 160),
    subtitle: String(story?.subtitle || story?.caption || '').trim().slice(0, 220),
    buttonLabel: String(story?.link?.label || 'Open story').trim().slice(0, 48),
    songTitle: story?.snapshot?.song_title || story?.scores?.[0]?.song_title || '',
    mode: story?.snapshot?.mode || story?.scores?.[0]?.mode || '',
    level: parseInt(story?.snapshot?.level ?? story?.scores?.[0]?.level, 10) || 0,
    score: parseInt(story?.snapshot?.score ?? story?.scores?.[0]?.score, 10) || 0,
    grade: String(story?.snapshot?.grade || story?.scores?.[0]?.grade || '').trim(),
    jacketUrl: String(story?.snapshot?.jacket_url || story?.scores?.[0]?.jacket_url || '').trim(),
    playerName: ownerUser?.username || '',
    playerAvatar: ownerUser?.avatar || '',
    contextLabel: 'Story',
  };
}

function getConversationMember(db, conversationId, userId) {
  return db.prepare(`
    SELECT conversation_id, user_id, last_read_at, is_hidden
    FROM conversation_members
    WHERE conversation_id = ? AND user_id = ?
    LIMIT 1
  `).get(conversationId, userId);
}

function getConversationRecipientIds(db, conversationId, senderUserId) {
  return db.prepare(`
    SELECT user_id
    FROM conversation_members
    WHERE conversation_id = ?
      AND user_id != ?
      AND is_hidden = 0
  `).all(conversationId, senderUserId).map((row) => row.user_id).filter(Boolean);
}

function getMessageRowById(db, messageId) {
  return db.prepare(`
    SELECT
      m.*,
      u.username AS sender_username,
      u.avatar AS sender_avatar,
      u.avatar_v AS sender_avatar_v
    FROM conversation_messages m
    JOIN users u ON u.id = m.sender_user_id
    WHERE m.id = ?
    LIMIT 1
  `).get(messageId);
}

function getConversationMessages(db, conversationId) {
  return db.prepare(`
    SELECT *
    FROM (
      SELECT
        m.*,
        u.username AS sender_username,
        u.avatar AS sender_avatar,
        u.avatar_v AS sender_avatar_v
      FROM conversation_messages m
      JOIN users u ON u.id = m.sender_user_id
      WHERE m.conversation_id = ?
        AND m.deleted_at = ''
      ORDER BY datetime(m.created_at) DESC, m.id DESC
      LIMIT 200
    ) recent
    ORDER BY datetime(created_at) ASC, id ASC
  `).all(conversationId);
}

function markConversationRead(db, conversationId, userId, now = toSqliteDateTime()) {
  db.prepare(`
    UPDATE conversation_members
    SET last_read_at = ?, updated_at = ?
    WHERE conversation_id = ? AND user_id = ?
  `).run(now, now, conversationId, userId);
}

function insertConversationMessage(db, conversationId, senderUser, input, createdAt = toSqliteDateTime()) {
  const messageId = uuidv4();
  db.prepare(`
    INSERT INTO conversation_messages (
      id, conversation_id, sender_user_id, message_type, content, metadata_json, created_at, updated_at, deleted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, '', '')
  `).run(
    messageId,
    conversationId,
    senderUser.id,
    input.messageType,
    input.content,
    JSON.stringify(input.metadata || {}),
    createdAt
  );

  db.prepare(`
    UPDATE conversations
    SET last_message_id = ?, last_message_at = ?, updated_at = ?
    WHERE id = ?
  `).run(messageId, createdAt, createdAt, conversationId);

  db.prepare(`
    UPDATE conversation_members
    SET updated_at = ?
    WHERE conversation_id = ?
  `).run(createdAt, conversationId);

  markConversationRead(db, conversationId, senderUser.id, createdAt);

  return getMessageRowById(db, messageId);
}

function getOrCreateDirectConversation(db, currentUserId, otherUserId) {
  const directKey = buildDirectConversationKey(currentUserId, otherUserId);
  if (!directKey) return null;

  let row = db.prepare(`
    SELECT id
    FROM conversations
    WHERE direct_key = ?
    LIMIT 1
  `).get(directKey);

  if (row?.id) return row.id;

  const now = toSqliteDateTime();
  const conversationId = uuidv4();

  try {
    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO conversations (id, kind, direct_key, created_by_user_id, title, last_message_id, last_message_at, created_at, updated_at)
        VALUES (?, 'direct', ?, ?, '', '', '', ?, ?)
      `).run(conversationId, directKey, currentUserId, now, now);

      const insertMember = db.prepare(`
        INSERT INTO conversation_members (conversation_id, user_id, joined_at, last_read_at, is_hidden, created_at, updated_at)
        VALUES (?, ?, ?, '', 0, ?, ?)
      `);
      insertMember.run(conversationId, currentUserId, now, now, now);
      insertMember.run(conversationId, otherUserId, now, now, now);
    });
    transaction();
    return conversationId;
  } catch {
    row = db.prepare(`
      SELECT id
      FROM conversations
      WHERE direct_key = ?
      LIMIT 1
    `).get(directKey);
    return row?.id || null;
  }
}

function notifyRecipients(db, conversationId, senderUser, recipientIds, input) {
  for (const userId of recipientIds) {
    createUserNotification(
      db,
      userId,
      'direct_message',
      buildNotificationTitle(senderUser?.username, input.messageType, input.share, input.linkShare, input.challengeCard),
      buildNotificationBody(input.content, input.messageType, input.share, input.linkShare, input.challengeCard),
      `/messages/${conversationId}`
    );
  }
}

function sendConversationStomp(db, conversationId, senderUserId, recipientUserId, now = toSqliteDateTime()) {
  const transaction = db.transaction(() => {
    const existing = db.prepare(`
      SELECT created_at
      FROM user_message_stomps
      WHERE sender_user_id = ? AND recipient_user_id = ?
      LIMIT 1
    `).get(senderUserId, recipientUserId);

    if (existing) {
      return {
        alreadyWaiting: true,
        sentAt: existing.created_at || '',
      };
    }

    db.prepare(`
      DELETE FROM user_message_stomps
      WHERE sender_user_id = ? AND recipient_user_id = ?
    `).run(recipientUserId, senderUserId);

    db.prepare(`
      INSERT INTO user_message_stomps (
        sender_user_id,
        recipient_user_id,
        conversation_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(senderUserId, recipientUserId, conversationId, now, now);

    return {
      alreadyWaiting: false,
      sentAt: now,
    };
  });

  return transaction();
}

function normalizeStoryLinkInput(raw = {}) {
  const path = sanitizeRelativePath(raw.link_path || raw.linkPath || '');
  const url = sanitizeAbsoluteUrl(raw.link_url || raw.linkUrl || '');
  const label = normalizeText(raw.link_label || raw.linkLabel || '', 48);
  return { path, url, label };
}

function normalizeNoteInput(raw = {}) {
  const content = normalizeText(raw.content, 120);
  const link = normalizeStoryLinkInput(raw);
  if (!content && !link.path && !link.url) {
    return { error: 'A note needs text or a link.' };
  }
  return { content, link };
}

async function processStoryImage(file) {
  if (!file?.buffer) return '';
  try {
    let buffer = await sharp(file.buffer)
      .rotate()
      .resize(1080, 1920, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();

    if (buffer.length > 350 * 1024) {
      buffer = await sharp(file.buffer)
        .rotate()
        .resize(900, 1600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 58 })
        .toBuffer();
    }

    return `data:image/webp;base64,${buffer.toString('base64')}`;
  } catch {
    try {
      const mime = file.mimetype || 'image/png';
      return `data:${mime};base64,${file.buffer.toString('base64')}`;
    } catch {
      return '';
    }
  }
}

router.get('/highlights', requireAuth, (req, res) => {
  const db = getDb();
  res.json(getInboxHighlights(db, req.user.id));
});

router.get('/highlights/:userId/story', requireAuth, (req, res) => {
  const db = getDb();
  const targetUserId = String(req.params.userId || '').trim();
  if (!targetUserId) return res.status(400).json({ error: 'User id is required' });
  if (!isFollowingOrSelf(db, req.user.id, targetUserId)) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const user = getHighlightUserRow(db, targetUserId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    user: normalizeStoryUser(user, 72),
    stories: getStoryItemsForUser(db, {
      ...user,
      avatar: normalizeStoryUser(user, 72)?.avatar || '',
    }).map((story) => ({
      ...story,
      engagement: buildStoryEngagementPayload(db, targetUserId, story.id, req.user.id),
    })),
    is_owner: String(req.user.id || '').trim() === targetUserId,
  });
});

router.post('/highlights/note', requireAuth, (req, res) => {
  const db = getDb();
  const input = normalizeNoteInput(req.body || {});
  if (input.error) return res.status(400).json({ error: input.error });

  const user = getHighlightUserRow(db, req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const now = new Date();
  const nowSql = toInboxSqliteDateTime(now);
  const expiresAt = toInboxSqliteDateTime(addHours(now, NOTE_TTL_HOURS));
  const noteId = uuidv4();
  const threadKey = `note:${noteId}`;

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE user_inbox_notes
      SET cleared_at = ?, updated_at = ?
      WHERE user_id = ?
        AND COALESCE(cleared_at, '') = ''
        AND datetime(expires_at) > datetime('now')
    `).run(nowSql, nowSql, req.user.id);

    db.prepare(`
      INSERT INTO user_inbox_notes (
        id, user_id, content, link_path, link_url, link_label, thread_key, created_at, updated_at, expires_at, cleared_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
    `).run(
      noteId,
      req.user.id,
      input.content,
      input.link.path,
      input.link.url,
      input.link.label,
      threadKey,
      nowSql,
      nowSql,
      expiresAt
    );
  });

  transaction();

  res.status(201).json({
    note: normalizeNotePayload({
      id: noteId,
      user_id: req.user.id,
      content: input.content,
      note_kind: 'manual',
      thread_key: threadKey,
      created_at: nowSql,
      updated_at: nowSql,
      expires_at: expiresAt,
      link_path: input.link.path,
      link_url: input.link.url,
      link_label: input.link.label,
    }, normalizeStoryUser(user, 56)),
  });
});

router.delete('/highlights/note', requireAuth, (req, res) => {
  const db = getDb();
  const nowSql = toInboxSqliteDateTime(new Date());
  db.prepare(`
    UPDATE user_inbox_notes
    SET cleared_at = ?, updated_at = ?
    WHERE user_id = ?
      AND COALESCE(cleared_at, '') = ''
      AND datetime(expires_at) > datetime('now')
  `).run(nowSql, nowSql, req.user.id);
  res.json({ success: true });
});

router.post('/highlights/story', requireAuth, highlightUpload.single('image'), async (req, res) => {
  try {
    const db = getDb();
    const user = getHighlightUserRow(db, req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const storyType = String(req.body?.story_type || req.body?.storyType || '').trim().toLowerCase() || 'image';
    const caption = normalizeText(req.body?.caption || '', 420);
    const sourceKind = String(req.body?.source_kind || req.body?.sourceKind || '').trim().toLowerCase();
    const sourceId = String(req.body?.source_id || req.body?.sourceId || '').trim();
    const stickerTokens = sanitizeStickerTokens(req.body?.sticker_tokens_json || req.body?.stickerTokens || req.body?.stickers || []);
    const link = normalizeStoryLinkInput(req.body || {});
    const metadata = {};
    let mediaUrl = '';

    if (!['image', 'link', 'score_snapshot'].includes(storyType)) {
      return res.status(400).json({ error: 'Unsupported story type' });
    }

    if (storyType === 'image') {
      mediaUrl = await processStoryImage(req.file);
      if (!mediaUrl) return res.status(400).json({ error: 'Please upload an image.' });
      metadata.title = normalizeText(req.body?.title || 'Story', 80);
      metadata.subtitle = normalizeText(req.body?.subtitle || '', 120);
    }

    if (storyType === 'link') {
      if (!caption && !link.path && !link.url) {
        return res.status(400).json({ error: 'A link story needs text or a destination.' });
      }
      metadata.title = normalizeText(req.body?.title || 'Shared link', 80);
      metadata.subtitle = normalizeText(req.body?.subtitle || '', 120);
    }

    if (storyType === 'score_snapshot') {
      if (!['upscore', 'clear'].includes(sourceKind) || !sourceId) {
        return res.status(400).json({ error: 'Choose a recent upscore or clear to share.' });
      }
    }

    const now = new Date();
    const nowSql = toInboxSqliteDateTime(now);
    const expiresAt = toInboxSqliteDateTime(addHours(now, STORY_TTL_HOURS));
    const storyId = uuidv4();

    db.prepare(`
      INSERT INTO user_story_items (
        id, user_id, story_type, source_kind, source_id, caption, media_url, link_path, link_url, link_label,
        sticker_tokens_json, metadata_json, created_at, expires_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
    `).run(
      storyId,
      req.user.id,
      storyType,
      sourceKind,
      sourceId,
      caption,
      mediaUrl,
      link.path,
      link.url,
      link.label,
      JSON.stringify(stickerTokens),
      JSON.stringify(metadata),
      nowSql,
      expiresAt
    );

    const stories = getStoryItemsForUser(db, {
      ...user,
      avatar: normalizeStoryUser(user, 72)?.avatar || '',
    });
    const story = stories.find((item) => item.id === `story:${storyId}`) || null;
    res.status(201).json({ story });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to add story item' });
  }
});

router.get('/highlights/archive', requireAuth, (req, res) => {
  const db = getDb();
  res.json({
    stories: getArchivedStories(db, req.user.id),
  });
});

router.post('/highlights/:userId/story/:storyId/view', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (!isFollowingOrSelf(db, req.user.id, ownerUserId)) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  if (String(req.user.id || '').trim() !== ownerUserId) {
    db.prepare(`
      INSERT INTO user_story_views (id, owner_user_id, story_id, viewer_user_id, viewed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(owner_user_id, story_id, viewer_user_id) DO UPDATE SET
        viewed_at = excluded.viewed_at
    `).run(uuidv4(), ownerUserId, storyId, req.user.id, toInboxSqliteDateTime(new Date()));
  }

  res.json({
    engagement: buildStoryEngagementPayload(db, ownerUserId, storyId, req.user.id),
  });
});

router.get('/highlights/:userId/story/:storyId/engagement', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (!isFollowingOrSelf(db, req.user.id, ownerUserId)) {
    return res.status(404).json({ error: 'Story not found' });
  }
  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }
  res.json({
    engagement: buildStoryEngagementPayload(db, ownerUserId, storyId, req.user.id),
  });
});

router.post('/highlights/:userId/story/:storyId/pump', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (!isFollowingOrSelf(db, req.user.id, ownerUserId)) {
    return res.status(404).json({ error: 'Story not found' });
  }
  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const existing = db.prepare(`
    SELECT id
    FROM user_story_pumps
    WHERE owner_user_id = ? AND story_id = ? AND pumper_user_id = ?
    LIMIT 1
  `).get(ownerUserId, storyId, req.user.id);

  if (existing?.id) {
    db.prepare('DELETE FROM user_story_pumps WHERE id = ?').run(existing.id);
  } else {
    db.prepare(`
      INSERT INTO user_story_pumps (id, owner_user_id, story_id, pumper_user_id, pumped_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), ownerUserId, storyId, req.user.id, toInboxSqliteDateTime(new Date()));
  }

  res.json({
    engagement: buildStoryEngagementPayload(db, ownerUserId, storyId, req.user.id),
  });
});

router.get('/highlights/:userId/story/:storyId/comments', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (!isFollowingOrSelf(db, req.user.id, ownerUserId)) {
    return res.status(404).json({ error: 'Story not found' });
  }
  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  res.json({
    comments: listStoryComments(db, ownerUserId, storyId),
  });
});

router.post('/highlights/:userId/story/:storyId/comments', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (!isFollowingOrSelf(db, req.user.id, ownerUserId)) {
    return res.status(404).json({ error: 'Story not found' });
  }
  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const content = normalizeText(req.body?.content || '', 280);
  if (!content) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  const nowSql = toInboxSqliteDateTime(new Date());
  const commentId = uuidv4();
  db.prepare(`
    INSERT INTO user_story_comments (id, owner_user_id, story_id, comment_user_id, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(commentId, ownerUserId, storyId, req.user.id, content, nowSql);

  res.status(201).json({
    comments: listStoryComments(db, ownerUserId, storyId),
    engagement: buildStoryEngagementPayload(db, ownerUserId, storyId, req.user.id),
  });
});

router.get('/highlights/:userId/story/:storyId/stats', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (String(req.user.id || '').trim() !== ownerUserId) {
    return res.status(403).json({ error: 'Only the owner can view story stats' });
  }
  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }
  res.json({
    story_id: storyId,
    ...getStoryCounts(db, ownerUserId, storyId, req.user.id),
    viewers: getStoryViewerList(db, ownerUserId, storyId),
  });
});

router.post('/highlights/:userId/story/:storyId/archive', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (String(req.user.id || '').trim() !== ownerUserId) {
    return res.status(403).json({ error: 'Only the owner can archive this story' });
  }
  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const nowSql = toInboxSqliteDateTime(new Date());
  createStoryArchive(db, ownerUserId, match.story, nowSql);
  hideStoryItem(db, ownerUserId, storyId, nowSql, 'archived');

  res.json({
    success: true,
    stories: getStoryBundleForUser(db, ownerUserId)?.stories || [],
    archived: getArchivedStories(db, ownerUserId),
  });
});

router.delete('/highlights/:userId/story/:storyId', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (String(req.user.id || '').trim() !== ownerUserId) {
    return res.status(403).json({ error: 'Only the owner can delete this story' });
  }
  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const nowSql = toInboxSqliteDateTime(new Date());
  const deletedManual = deleteManualStoryRowIfPresent(db, ownerUserId, storyId, nowSql);
  hideStoryItem(db, ownerUserId, storyId, nowSql, deletedManual ? 'deleted_manual' : 'deleted');

  res.json({
    success: true,
    stories: getStoryBundleForUser(db, ownerUserId)?.stories || [],
  });
});

router.get('/conversations', requireAuth, (req, res) => {
  const db = getDb();
  const rows = getConversationListRows(db, req.user.id);
  res.json({
    conversations: rows.map((row) => normalizeConversationRow(row)),
  });
});

router.get('/conversations/:id', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'Conversation id is required' });

  const member = getConversationMember(db, conversationId, req.user.id);
  if (!member || member.is_hidden) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const conversationRow = getConversationRowForUser(db, conversationId, req.user.id);
  if (!conversationRow) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const messages = getConversationMessages(db, conversationId).map((row) => normalizeConversationMessage(row, req.user.id));
  markConversationRead(db, conversationId, req.user.id);

  const conversation = normalizeConversationRow(conversationRow);
  if (conversation) conversation.unread_count = 0;

  res.json({ conversation, messages });
});

router.post('/conversations/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const member = getConversationMember(db, conversationId, req.user.id);
  if (!member || member.is_hidden) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  markConversationRead(db, conversationId, req.user.id);
  res.json({ success: true });
});

router.post('/conversations/:id/stomp', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const member = getConversationMember(db, conversationId, req.user.id);
  if (!member || member.is_hidden) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const conversationRow = getConversationRowForUser(db, conversationId, req.user.id);
  if (!conversationRow || conversationRow.kind !== 'direct') {
    return res.status(400).json({ error: 'Stomps are only available in direct messages' });
  }

  const partnerUserId = String(conversationRow.partner_user_id || '').trim();
  if (!partnerUserId || partnerUserId === String(req.user.id || '').trim()) {
    return res.status(400).json({ error: 'A valid stomp target is required' });
  }

  const senderUser = getUserIdentity(db, req.user.id);
  if (!senderUser) {
    return res.status(404).json({ error: 'Sender not found' });
  }

  const stompResult = sendConversationStomp(db, conversationId, req.user.id, partnerUserId);
  const normalizedConversation = normalizeConversationRow(getConversationRowForUser(db, conversationId, req.user.id));

  if (stompResult.alreadyWaiting) {
    return res.status(409).json({
      error: 'Wait for them to stomp you back first.',
      conversation: normalizedConversation,
    });
  }

  createUserNotification(
    db,
    partnerUserId,
    'message_stomp',
    `${senderUser.username || 'Someone'} stomped you`,
    'Stomp them back from your inbox.',
    `/messages/${conversationId}`
  );

  res.status(201).json({
    success: true,
    conversation: normalizedConversation,
  });
});

router.post('/conversations/:id/messages', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const member = getConversationMember(db, conversationId, req.user.id);
  if (!member || member.is_hidden) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const input = normalizeConversationInput(req.body || {});
  if (input.error) return res.status(400).json({ error: input.error });

  const senderUser = getUserIdentity(db, req.user.id);
  if (!senderUser) return res.status(404).json({ error: 'Sender not found' });

  const messageRow = insertConversationMessage(db, conversationId, senderUser, input);
  const recipientIds = getConversationRecipientIds(db, conversationId, req.user.id);
  notifyRecipients(db, conversationId, senderUser, recipientIds, input);

  const conversation = normalizeConversationRow(getConversationRowForUser(db, conversationId, req.user.id));
  if (conversation) conversation.unread_count = 0;

  res.status(201).json({
    conversation,
    message: normalizeConversationMessage(messageRow, req.user.id),
  });
});

router.post('/direct/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const targetUserId = String(req.params.userId || '').trim();
  if (!targetUserId) return res.status(400).json({ error: 'Recipient is required' });
  if (targetUserId === String(req.user.id || '').trim()) {
    return res.status(400).json({ error: 'You cannot message yourself' });
  }

  const targetUser = getUserIdentity(db, targetUserId);
  if (!targetUser) return res.status(404).json({ error: 'Recipient not found' });

  const conversationId = getOrCreateDirectConversation(db, req.user.id, targetUserId);
  if (!conversationId) {
    return res.status(500).json({ error: 'Failed to create conversation' });
  }

  const senderUser = getUserIdentity(db, req.user.id);
  if (!senderUser) return res.status(404).json({ error: 'Sender not found' });
  let message = null;
  const input = normalizeConversationInput(req.body || {});
  if (!input.error) {
    const messageRow = insertConversationMessage(db, conversationId, senderUser, input);
    notifyRecipients(db, conversationId, senderUser, [targetUserId], input);
    message = normalizeConversationMessage(messageRow, req.user.id);
  } else if (req.body && (
    String(req.body.content || '').trim()
    || req.body.session_share
    || req.body.share
    || req.body.link_share
    || req.body.linkShare
    || req.body.challenge_card
    || req.body.challengeCard
    || req.body.challenge
    || req.body.link
  )) {
    return res.status(400).json({ error: input.error });
  }

  const conversation = normalizeConversationRow(getConversationRowForUser(db, conversationId, req.user.id));
  if (conversation) conversation.unread_count = 0;

  res.status(message ? 201 : 200).json({ conversation, message });
});

module.exports = router;

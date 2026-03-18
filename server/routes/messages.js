const express = require('express');
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

const router = express.Router();

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
  `).all(userId, userId, userId);
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
  `).get(userId, userId, userId, conversationId);
}

function getUserIdentity(db, userId) {
  return db.prepare(`
    SELECT id, username, avatar, avatar_v
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(userId);
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
      buildNotificationTitle(senderUser?.username, input.messageType, input.share, input.linkShare),
      buildNotificationBody(input.content, input.messageType, input.share, input.linkShare),
      `/messages/${conversationId}`
    );
  }
}

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
    || req.body.link
  )) {
    return res.status(400).json({ error: input.error });
  }

  const conversation = normalizeConversationRow(getConversationRowForUser(db, conversationId, req.user.id));
  if (conversation) conversation.unread_count = 0;

  res.status(message ? 201 : 200).json({ conversation, message });
});

module.exports = router;

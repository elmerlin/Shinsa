const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { createUserNotification } = require('../lib/notifications');
const { findMentionedUsers, notifyMentionedUsers } = require('../lib/mentions');
const {
  buildReplyTargetPayloadFromRow,
  buildDirectConversationKey,
  buildNotificationBody,
  buildNotificationTitle,
  normalizeConversationInput,
  normalizeConversationMessage,
  normalizeConversationRow,
  sanitizeReactionKey,
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

function normalizeSquadTitle(value) {
  return normalizeText(value || '', 60);
}

function sanitizeSquadAvatar(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\/avatars\/[A-Za-z0-9._/-]+$/i.test(raw)) return raw;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(raw)) {
    return raw.slice(0, 2_000_000);
  }
  return '';
}

function sanitizeStoryAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return sanitizeAbsoluteUrl(raw, 1000);
  if (raw.startsWith('/')) return sanitizeRelativePath(raw, 1000);
  return '';
}

function sanitizeStorySnapshot(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : parseJsonObject(value, {});

  const snapshot = {
    song_title: normalizeText(raw.song_title || raw.songTitle || '', 160),
    mode: normalizeText(raw.mode || '', 40),
    level: parseInt(raw.level, 10) || 0,
    score: parseInt(raw.score ?? raw.new_score, 10) || 0,
    new_score: parseInt(raw.new_score ?? raw.score, 10) || 0,
    old_score: parseInt(raw.old_score, 10) || 0,
    grade: normalizeText(raw.grade || raw.new_grade || '', 24),
    new_grade: normalizeText(raw.new_grade || raw.grade || '', 24),
    old_grade: normalizeText(raw.old_grade || '', 24),
    scoreDelta: parseInt(raw.scoreDelta ?? raw.score_delta, 10) || 0,
    over_top100_rank: parseInt(raw.over_top100_rank ?? raw.overTop100Rank, 10) || 0,
    plate: normalizeText(raw.plate || '', 24),
    perfect: parseInt(raw.perfect, 10) || 0,
    great: parseInt(raw.great, 10) || 0,
    good: parseInt(raw.good, 10) || 0,
    bad: parseInt(raw.bad, 10) || 0,
    miss: parseInt(raw.miss, 10) || 0,
    is_stage_break: !!raw.is_stage_break || !!raw.isStageBreak,
    date_played: normalizeText(raw.date_played || raw.playedAt || '', 80),
    playerName: normalizeText(raw.playerName || raw.username || '', 80),
    playerAvatar: sanitizeStoryAssetUrl(raw.playerAvatar || raw.avatar || ''),
    playerSkillTitle: normalizeText(raw.playerSkillTitle || raw.skill_title || raw.skillTitle || '', 80),
    playerRoleLabel: normalizeText(raw.playerRoleLabel || raw.roleLabel || '', 40),
    contextLabel: normalizeText(raw.contextLabel || raw.context_label || '', 60),
    jacket_url: sanitizeStoryAssetUrl(raw.jacket_url || raw.jacketUrl || raw.background_url || ''),
  };

  const hasMeaningfulContent = snapshot.song_title
    || snapshot.mode
    || snapshot.level > 0
    || snapshot.score > 0
    || snapshot.new_score > 0
    || snapshot.grade
    || snapshot.new_grade
    || snapshot.playerName
    || snapshot.jacket_url;

  return hasMeaningfulContent ? snapshot : null;
}

function getConversationListRows(db, userId) {
  return db.prepare(`
    SELECT
      c.id,
      c.kind,
      c.title AS conversation_title,
      c.avatar AS conversation_avatar,
      c.theme AS conversation_theme,
      c.created_by_user_id AS conversation_created_by_user_id,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      c.last_message_id,
      lm.sender_user_id AS last_message_sender_user_id,
      lm.message_type AS last_message_type,
      lm.content AS last_message_content,
      lm.metadata_json AS last_message_metadata_json,
      cm.role AS viewer_role,
      cm.notifications_enabled AS viewer_notifications_enabled,
      cm.notify_mentions AS viewer_notify_mentions,
      cm.is_pinned AS is_pinned,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT u.id
        FROM conversation_members other_cm
        JOIN users u ON u.id = other_cm.user_id
        WHERE other_cm.conversation_id = c.id
          AND other_cm.user_id != ?
        LIMIT 1
      ) ELSE '' END AS partner_user_id,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT u.username
        FROM conversation_members other_cm
        JOIN users u ON u.id = other_cm.user_id
        WHERE other_cm.conversation_id = c.id
          AND other_cm.user_id != ?
        LIMIT 1
      ) ELSE '' END AS partner_username,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT u.avatar
        FROM conversation_members other_cm
        JOIN users u ON u.id = other_cm.user_id
        WHERE other_cm.conversation_id = c.id
          AND other_cm.user_id != ?
        LIMIT 1
      ) ELSE '' END AS partner_avatar,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT u.avatar_v
        FROM conversation_members other_cm
        JOIN users u ON u.id = other_cm.user_id
        WHERE other_cm.conversation_id = c.id
          AND other_cm.user_id != ?
        LIMIT 1
      ) ELSE 0 END AS partner_avatar_v,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT stomp_out.created_at
        FROM user_message_stomps stomp_out
        WHERE stomp_out.sender_user_id = ?
          AND stomp_out.recipient_user_id = (
            SELECT other_cm.user_id
            FROM conversation_members other_cm
            WHERE other_cm.conversation_id = c.id
              AND other_cm.user_id != ?
            LIMIT 1
          )
        LIMIT 1
      ) ELSE '' END AS stomp_sent_at,
      CASE WHEN c.kind = 'direct' THEN EXISTS(
        SELECT 1
        FROM user_message_stomps stomp_in
        WHERE stomp_in.sender_user_id = (
            SELECT other_cm.user_id
            FROM conversation_members other_cm
            WHERE other_cm.conversation_id = c.id
              AND other_cm.user_id != ?
            LIMIT 1
          )
          AND stomp_in.recipient_user_id = ?
      ) ELSE 0 END AS has_incoming_stomp,
      (
        SELECT COUNT(*)
        FROM conversation_members members
        WHERE members.conversation_id = c.id
      ) AS member_count,
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
    WHERE cm.is_hidden = 0
    ORDER BY cm.is_pinned DESC, datetime(COALESCE(NULLIF(c.last_message_at, ''), c.created_at)) DESC, c.id DESC
  `).all(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId);
}

function getConversationRowForUser(db, conversationId, userId) {
  return db.prepare(`
    SELECT
      c.id,
      c.kind,
      c.title AS conversation_title,
      c.avatar AS conversation_avatar,
      c.theme AS conversation_theme,
      c.created_by_user_id AS conversation_created_by_user_id,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      c.last_message_id,
      lm.sender_user_id AS last_message_sender_user_id,
      lm.message_type AS last_message_type,
      lm.content AS last_message_content,
      lm.metadata_json AS last_message_metadata_json,
      cm.role AS viewer_role,
      cm.notifications_enabled AS viewer_notifications_enabled,
      cm.notify_mentions AS viewer_notify_mentions,
      cm.is_pinned AS is_pinned,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT u.id
        FROM conversation_members other_cm
        JOIN users u ON u.id = other_cm.user_id
        WHERE other_cm.conversation_id = c.id
          AND other_cm.user_id != ?
        LIMIT 1
      ) ELSE '' END AS partner_user_id,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT u.username
        FROM conversation_members other_cm
        JOIN users u ON u.id = other_cm.user_id
        WHERE other_cm.conversation_id = c.id
          AND other_cm.user_id != ?
        LIMIT 1
      ) ELSE '' END AS partner_username,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT u.avatar
        FROM conversation_members other_cm
        JOIN users u ON u.id = other_cm.user_id
        WHERE other_cm.conversation_id = c.id
          AND other_cm.user_id != ?
        LIMIT 1
      ) ELSE '' END AS partner_avatar,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT u.avatar_v
        FROM conversation_members other_cm
        JOIN users u ON u.id = other_cm.user_id
        WHERE other_cm.conversation_id = c.id
          AND other_cm.user_id != ?
        LIMIT 1
      ) ELSE 0 END AS partner_avatar_v,
      CASE WHEN c.kind = 'direct' THEN (
        SELECT stomp_out.created_at
        FROM user_message_stomps stomp_out
        WHERE stomp_out.sender_user_id = ?
          AND stomp_out.recipient_user_id = (
            SELECT other_cm.user_id
            FROM conversation_members other_cm
            WHERE other_cm.conversation_id = c.id
              AND other_cm.user_id != ?
            LIMIT 1
          )
        LIMIT 1
      ) ELSE '' END AS stomp_sent_at,
      CASE WHEN c.kind = 'direct' THEN EXISTS(
        SELECT 1
        FROM user_message_stomps stomp_in
        WHERE stomp_in.sender_user_id = (
            SELECT other_cm.user_id
            FROM conversation_members other_cm
            WHERE other_cm.conversation_id = c.id
              AND other_cm.user_id != ?
            LIMIT 1
          )
          AND stomp_in.recipient_user_id = ?
      ) ELSE 0 END AS has_incoming_stomp,
      (
        SELECT COUNT(*)
        FROM conversation_members members
        WHERE members.conversation_id = c.id
      ) AS member_count,
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
    WHERE c.id = ?
      AND cm.is_hidden = 0
    LIMIT 1
  `).get(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, conversationId);
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

function normalizeSquadMemberUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username || '',
    avatar: row.avatar || '',
    avatar_v: row.avatar_v || 0,
    playing_status: row.playing_status || '',
  };
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

function hasDirectConversationAccess(db, viewerUserId, targetUserId) {
  const viewer = String(viewerUserId || '').trim();
  const target = String(targetUserId || '').trim();
  if (!viewer || !target || viewer === target) return false;
  const directKey = buildDirectConversationKey(viewer, target);
  if (!directKey) return false;
  return !!db.prepare(`
    SELECT 1
    FROM conversations c
    JOIN conversation_members viewer_member
      ON viewer_member.conversation_id = c.id
     AND viewer_member.user_id = ?
     AND viewer_member.is_hidden = 0
    JOIN conversation_members target_member
      ON target_member.conversation_id = c.id
     AND target_member.user_id = ?
     AND target_member.is_hidden = 0
    WHERE c.direct_key = ?
    LIMIT 1
  `).get(viewer, target, directKey);
}

function hasConversationStoryShareAccess(db, viewerUserId, ownerUserId, storyId, conversationId) {
  const viewer = String(viewerUserId || '').trim();
  const owner = String(ownerUserId || '').trim();
  const story = String(storyId || '').trim();
  const conversation = String(conversationId || '').trim();
  if (!viewer || !owner || !story || !conversation) return false;

  const member = getConversationMember(db, conversation, viewer);
  if (!member || member.is_hidden) return false;

  const rows = db.prepare(`
    SELECT metadata_json
    FROM conversation_messages
    WHERE conversation_id = ?
      AND message_type = 'link_share'
      AND COALESCE(deleted_at, '') = ''
    ORDER BY datetime(created_at) DESC, id DESC
  `).all(conversation);

  return rows.some((row) => {
    const metadata = parseJsonObject(row?.metadata_json, {});
    const linkShare = metadata?.link_share && typeof metadata.link_share === 'object' && !Array.isArray(metadata.link_share)
      ? metadata.link_share
      : parseJsonObject(metadata?.link_share, {});
    return String(linkShare?.kind || '').trim().toLowerCase() === 'story'
      && String(linkShare?.storyOwnerId || linkShare?.story_owner_id || '').trim() === owner
      && String(linkShare?.storyId || linkShare?.story_id || '').trim() === story;
  });
}

function canAccessSharedStory(db, viewerUserId, ownerUserId, storyId = '', conversationId = '') {
  return isFollowingOrSelf(db, viewerUserId, ownerUserId)
    || hasDirectConversationAccess(db, viewerUserId, ownerUserId)
    || hasConversationStoryShareAccess(db, viewerUserId, ownerUserId, storyId, conversationId);
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
    INSERT INTO user_story_hidden_items (story_id, owner_user_id, reason, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(story_id) DO UPDATE SET
      created_at = excluded.created_at,
      reason = excluded.reason
  `).run(storyId, ownerUserId, reason, hiddenAt);
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
    JOIN users u ON u.id = c.user_id
    WHERE c.owner_user_id = ?
      AND c.story_id = ?
      AND COALESCE(c.deleted_at, '') = ''
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
    WHERE owner_user_id = ? AND story_id = ? AND user_id = ?
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
    ORDER BY datetime(v.viewed_at) DESC, v.viewer_user_id DESC
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
    INSERT INTO user_story_archives (
      story_id,
      owner_user_id,
      story_type,
      story_payload_json,
      original_created_at,
      expires_at,
      archived_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(story_id) DO UPDATE SET
      story_type = excluded.story_type,
      story_payload_json = excluded.story_payload_json,
      original_created_at = excluded.original_created_at,
      expires_at = excluded.expires_at,
      archived_at = excluded.archived_at
  `).run(
    story.id,
    ownerUserId,
    String(story?.story_type || story?.type || ''),
    JSON.stringify(story),
    String(story?.created_at || ''),
    String(story?.expires_at || ''),
    archivedAt
  );
}

function getArchivedStories(db, ownerUserId) {
  return db.prepare(`
    SELECT story_id, story_payload_json, archived_at
    FROM user_story_archives
    WHERE owner_user_id = ?
    ORDER BY datetime(archived_at) DESC, story_id DESC
    LIMIT 100
  `).all(ownerUserId).map((row) => {
    const parsed = parseJsonObject(row.story_payload_json, {});
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
  const previewItems = Array.isArray(story?.scores)
    ? story.scores
      .slice(0, 3)
      .map((entry) => ({
        songTitle: String(entry?.song_title || '').trim(),
        mode: String(entry?.mode || '').trim(),
        level: parseInt(entry?.level, 10) || 0,
        score: parseInt(entry?.score, 10) || 0,
        grade: String(entry?.grade || '').trim(),
        jacketUrl: String(entry?.jacket_url || '').trim(),
      }))
      .filter((entry) => entry.songTitle || entry.score > 0 || entry.grade || entry.jacketUrl)
    : [];
  const totalItemCount = Math.max(parseInt(story?.total_count, 10) || 0, previewItems.length);
  const storyPath = sanitizeRelativePath(story?.link?.path || '');
  const linkUrl = sanitizeAbsoluteUrl(story?.link?.url || '');
  const fallbackPath = storyPath || '/messages';
  const storyOwnerId = String(ownerUser?.id || story?.user?.id || '').trim();
  const storyOwnerUsername = String(ownerUser?.username || story?.user?.username || '').trim();
  const storyOwnerAvatar = String(ownerUser?.avatar || story?.user?.avatar || '').trim();
  return {
    kind: 'story',
    path: fallbackPath,
    url: linkUrl,
    storyId: String(story?.id || '').trim(),
    storyOwnerId,
    storyOwnerUsername,
    storyOwnerAvatar,
    storyType: String(story?.type || '').trim(),
    storySourceKind: String(story?.source?.kind || '').trim(),
    storyCaption: String(story?.caption || '').trim().slice(0, 420),
    storyCreatedAt: String(story?.created_at || '').trim(),
    storyMediaUrl: String(story?.media_url || story?.post?.images?.[0] || '').trim(),
    storyFallbackPath: storyPath,
    storyFallbackUrl: linkUrl,
    title: String(story?.title || `${ownerUser?.username || 'Player'} story`).trim().slice(0, 160),
    subtitle: String(story?.subtitle || story?.caption || '').trim().slice(0, 220),
    buttonLabel: 'Open story',
    songTitle: story?.snapshot?.song_title || story?.scores?.[0]?.song_title || '',
    mode: story?.snapshot?.mode || story?.scores?.[0]?.mode || '',
    level: parseInt(story?.snapshot?.level ?? story?.scores?.[0]?.level, 10) || 0,
    score: parseInt(story?.snapshot?.score ?? story?.scores?.[0]?.score, 10) || 0,
    grade: String(story?.snapshot?.grade || story?.scores?.[0]?.grade || '').trim(),
    jacketUrl: String(story?.snapshot?.jacket_url || story?.scores?.[0]?.jacket_url || '').trim(),
    playerName: storyOwnerUsername,
    playerAvatar: storyOwnerAvatar,
    contextLabel: 'Story',
    previewItems,
    totalItemCount,
    extraItemCount: Math.max(0, totalItemCount - previewItems.length),
  };
}

function getConversationMember(db, conversationId, userId) {
  return db.prepare(`
    SELECT
      conversation_id,
      user_id,
      role,
      added_by_user_id,
      last_read_at,
      is_hidden,
      notifications_enabled,
      notify_mentions
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

function getConversationCore(db, conversationId) {
  return db.prepare(`
    SELECT id, kind, title, avatar, created_by_user_id
    FROM conversations
    WHERE id = ?
    LIMIT 1
  `).get(conversationId);
}

function isSquadConversation(db, conversationId) {
  return String(getConversationCore(db, conversationId)?.kind || '') === 'squad';
}

function getSquadMembers(db, conversationId) {
  return db.prepare(`
    SELECT
      cm.user_id,
      cm.role,
      cm.joined_at,
      cm.added_by_user_id,
      cm.notifications_enabled,
      cm.notify_mentions,
      u.username,
      u.avatar,
      u.avatar_v,
      u.playing_status
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ?
      AND cm.is_hidden = 0
    ORDER BY
      CASE cm.role
        WHEN 'creator' THEN 0
        WHEN 'moderator' THEN 1
        ELSE 2
      END,
      LOWER(u.username) ASC
  `).all(conversationId).map((row) => ({
    user_id: row.user_id,
    role: String(row.role || 'member'),
    joined_at: row.joined_at || '',
    added_by_user_id: row.added_by_user_id || '',
    notifications_enabled: Number(row.notifications_enabled) !== 0,
    notify_mentions: Number(row.notify_mentions) !== 0,
    user: normalizeSquadMemberUser({
      id: row.user_id,
      username: row.username,
      avatar: row.avatar,
      avatar_v: row.avatar_v,
      playing_status: row.playing_status,
    }),
  }));
}

function getSquadMemberRow(db, conversationId, userId) {
  return db.prepare(`
    SELECT conversation_id, user_id, role, added_by_user_id, joined_at, notifications_enabled, notify_mentions, is_hidden
    FROM conversation_members
    WHERE conversation_id = ? AND user_id = ?
    LIMIT 1
  `).get(conversationId, userId);
}

function getConversationMentionCandidates(db, conversationId, viewerUserId = '') {
  return db.prepare(`
    SELECT
      u.id,
      u.username,
      u.avatar,
      u.avatar_v,
      cm.role
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ?
      AND cm.is_hidden = 0
      AND (? = '' OR cm.user_id != ?)
    ORDER BY
      CASE cm.role
        WHEN 'creator' THEN 0
        WHEN 'moderator' THEN 1
        ELSE 2
      END,
      LOWER(u.username) ASC
  `).all(conversationId, viewerUserId, viewerUserId).map((row) => normalizeSquadMemberUser(row)).filter(Boolean);
}

function ensureConversationVisibleForUsers(db, conversationId, userIds = [], updatedAt = toSqliteDateTime()) {
  const normalizedUserIds = Array.from(new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
  if (!conversationId || normalizedUserIds.length === 0) return;

  db.prepare(`
    UPDATE conversation_members
    SET is_hidden = 0,
        updated_at = ?
    WHERE conversation_id = ?
      AND user_id IN (${normalizedUserIds.map(() => '?').join(', ')})
  `).run(updatedAt, conversationId, ...normalizedUserIds);
}

function filterMentionedUsersByInboxVisibility(db, ownerUserId, mentionedUsers = []) {
  return (Array.isArray(mentionedUsers) ? mentionedUsers : []).filter((user) => (
    user?.id && isFollowingOrSelf(db, user.id, ownerUserId)
  ));
}

function getVisibleStoryMentionedUsers(db, ownerUserId, content) {
  const ownerId = String(ownerUserId || '').trim();
  const text = String(content || '').trim();
  if (!ownerId || !text) return [];
  return filterMentionedUsersByInboxVisibility(db, ownerId, findMentionedUsers(db, text));
}

function notifyInboxNoteMentions(db, actorUser, content) {
  const actorUserId = String(actorUser?.id || '').trim();
  if (!actorUserId || !content) return 0;
  const mentionedUsers = filterMentionedUsersByInboxVisibility(db, actorUserId, findMentionedUsers(db, content));
  return notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId,
    actorUsername: actorUser?.username || 'Someone',
    type: 'note_mention',
    title: `${actorUser?.username || 'Someone'} mentioned you in a note`,
    message: `${actorUser?.username || 'Someone'} mentioned you in their note`,
    link: '/messages',
  });
}

function notifyStoryMentions(db, actorUser, ownerUserId, content, storyTitle = '', mentionedUsers = null) {
  const actorUserId = String(actorUser?.id || '').trim();
  const ownerId = String(ownerUserId || '').trim();
  if (!actorUserId || !ownerId || !content) return 0;
  const resolvedMentionedUsers = Array.isArray(mentionedUsers)
    ? mentionedUsers
    : getVisibleStoryMentionedUsers(db, ownerId, content);
  const label = storyTitle || 'a story';
  return notifyMentionedUsers(db, {
    mentionedUsers: resolvedMentionedUsers,
    actorUserId,
    actorUsername: actorUser?.username || 'Someone',
    type: 'story_mention',
    title: `${actorUser?.username || 'Someone'} mentioned you in ${label}`,
    message: `${actorUser?.username || 'Someone'} mentioned you in ${label}`,
    link: '/messages',
  });
}

function autoShareStoryWithMentionedUsers(db, actorUser, story, mentionedUsers = []) {
  const actorUserId = String(actorUser?.id || '').trim();
  if (!actorUserId || !story || !Array.isArray(mentionedUsers) || mentionedUsers.length === 0) return [];

  const storyOwner = {
    id: actorUserId,
    username: String(actorUser?.username || story?.user?.username || '').trim(),
    avatar: String(story?.user?.avatar || normalizeStoryUser(actorUser, 72)?.avatar || actorUser?.avatar || '').trim(),
  };
  const storySharePayload = buildStorySharePayload(story, storyOwner);
  const input = normalizeConversationInput({ link_share: storySharePayload });
  if (input.error) return [];

  const deliveredConversationIds = [];
  const deliveredUserIds = new Set();
  for (const mentionedUser of mentionedUsers) {
    const targetUserId = String(mentionedUser?.id || '').trim();
    if (!targetUserId || targetUserId === actorUserId || deliveredUserIds.has(targetUserId)) continue;

    const conversationId = getOrCreateDirectConversation(db, actorUserId, targetUserId);
    if (!conversationId) continue;

    ensureConversationVisibleForUsers(db, conversationId, [actorUserId, targetUserId]);
    insertConversationMessage(db, conversationId, storyOwner, input);
    notifyRecipients(db, conversationId, storyOwner, [targetUserId], input);

    deliveredUserIds.add(targetUserId);
    deliveredConversationIds.push(conversationId);
  }

  return deliveredConversationIds;
}

function notifyStoryCommentMentions(db, actorUser, ownerUserId, ownerUsername, content) {
  const actorUserId = String(actorUser?.id || '').trim();
  const ownerId = String(ownerUserId || '').trim();
  if (!actorUserId || !ownerId || !content) return 0;
  const mentionedUsers = filterMentionedUsersByInboxVisibility(db, ownerId, findMentionedUsers(db, content));
  const storyOwnerLabel = ownerUsername ? `${ownerUsername}'s story` : 'a story';
  return notifyMentionedUsers(db, {
    mentionedUsers,
    actorUserId,
    actorUsername: actorUser?.username || 'Someone',
    type: 'story_comment_mention',
    title: `${actorUser?.username || 'Someone'} mentioned you in ${storyOwnerLabel}`,
    message: `${actorUser?.username || 'Someone'} mentioned you in ${storyOwnerLabel}`,
    link: '/messages',
  });
}

function canManageSquadMembers(member) {
  const role = String(member?.role || '').trim();
  return role === 'creator' || role === 'moderator';
}

function canRemoveSquadMember(actorMember, targetMember) {
  const actorRole = String(actorMember?.role || '').trim();
  const targetRole = String(targetMember?.role || '').trim();
  if (actorRole === 'creator') return targetRole !== 'creator';
  if (actorRole === 'moderator') return targetRole === 'member';
  return false;
}

function buildSquadPermissions(member) {
  const role = String(member?.role || '').trim();
  return {
    can_manage_members: role === 'creator' || role === 'moderator',
    can_manage_roles: role === 'creator',
    can_edit_identity: role === 'creator',
  };
}

function buildSquadResponse(db, conversationId, viewerUserId) {
  const member = getSquadMemberRow(db, conversationId, viewerUserId);
  const conversation = normalizeConversationRow(getConversationRowForUser(db, conversationId, viewerUserId));
  const members = getSquadMembers(db, conversationId);
  return {
    conversation,
    members,
    viewer_membership: member ? {
      role: String(member.role || 'member'),
      notifications_enabled: Number(member.notifications_enabled) !== 0,
      notify_mentions: Number(member.notify_mentions) !== 0,
      permissions: buildSquadPermissions(member),
    } : null,
  };
}

function requireSquadMembership(db, conversationId, userId) {
  const conversation = getConversationCore(db, conversationId);
  const member = getConversationMember(db, conversationId, userId);
  if (!conversation || conversation.kind !== 'squad' || !member || member.is_hidden) {
    return { error: 'Squad not found', status: 404 };
  }
  return { conversation, member };
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

function getConversationReplyTargetRow(db, conversationId, messageId) {
  return db.prepare(`
    SELECT
      m.*,
      u.username AS sender_username,
      u.avatar AS sender_avatar,
      u.avatar_v AS sender_avatar_v
    FROM conversation_messages m
    JOIN users u ON u.id = m.sender_user_id
    WHERE m.id = ?
      AND m.conversation_id = ?
      AND m.deleted_at = ''
    LIMIT 1
  `).get(messageId, conversationId);
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

function getConversationMessageReactionState(db, messageIds = [], viewerUserId = '') {
  const ids = Array.from(new Set((Array.isArray(messageIds) ? messageIds : []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (ids.length === 0) return {};

  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT message_id, user_id, reaction_key
    FROM conversation_message_reactions
    WHERE message_id IN (${placeholders})
  `).all(...ids);

  const next = {};
  for (const row of rows) {
    const messageId = String(row.message_id || '').trim();
    const reactionKey = sanitizeReactionKey(row.reaction_key);
    if (!messageId || !reactionKey) continue;
    if (!next[messageId]) {
      next[messageId] = { reactions: [], viewerReaction: '' };
    }
    next[messageId].reactions.push({ reaction_key: reactionKey, count: 1 });
    if (viewerUserId && String(row.user_id || '').trim() === String(viewerUserId || '').trim()) {
      next[messageId].viewerReaction = reactionKey;
    }
  }

  return next;
}

function getConversationMessageForUser(db, conversationId, messageId, viewerUserId) {
  const row = db.prepare(`
    SELECT
      m.*,
      u.username AS sender_username,
      u.avatar AS sender_avatar,
      u.avatar_v AS sender_avatar_v
    FROM conversation_messages m
    JOIN users u ON u.id = m.sender_user_id
    WHERE m.id = ?
      AND m.conversation_id = ?
      AND m.deleted_at = ''
    LIMIT 1
  `).get(messageId, conversationId);
  if (!row) return null;
  const reactionState = getConversationMessageReactionState(db, [messageId], viewerUserId);
  return normalizeConversationMessage(row, viewerUserId, reactionState[messageId] || null);
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

function toggleConversationMessageReaction(db, conversationId, messageId, userId, reactionKey, now = toSqliteDateTime()) {
  const normalizedKey = sanitizeReactionKey(reactionKey);
  if (!normalizedKey) {
    throw new Error('A valid reaction is required');
  }

  const messageRow = db.prepare(`
    SELECT id
    FROM conversation_messages
    WHERE id = ?
      AND conversation_id = ?
      AND deleted_at = ''
    LIMIT 1
  `).get(messageId, conversationId);
  if (!messageRow) return null;

  const existing = db.prepare(`
    SELECT reaction_key
    FROM conversation_message_reactions
    WHERE message_id = ? AND user_id = ?
    LIMIT 1
  `).get(messageId, userId);

  if (existing && sanitizeReactionKey(existing.reaction_key) === normalizedKey) {
    db.prepare(`
      DELETE FROM conversation_message_reactions
      WHERE message_id = ? AND user_id = ?
    `).run(messageId, userId);
  } else if (existing) {
    db.prepare(`
      UPDATE conversation_message_reactions
      SET reaction_key = ?, updated_at = ?
      WHERE message_id = ? AND user_id = ?
    `).run(normalizedKey, now, messageId, userId);
  } else {
    db.prepare(`
      INSERT INTO conversation_message_reactions (
        message_id, user_id, reaction_key, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, userId, normalizedKey, now, now);
  }

  return getConversationMessageForUser(db, conversationId, messageId, userId);
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
        INSERT INTO conversation_members (
          conversation_id, user_id, role, added_by_user_id, joined_at, last_read_at, is_hidden,
          notifications_enabled, notify_mentions, created_at, updated_at
        )
        VALUES (?, ?, 'member', ?, ?, '', 0, 1, 1, ?, ?)
      `);
      insertMember.run(conversationId, currentUserId, currentUserId, now, now, now);
      insertMember.run(conversationId, otherUserId, currentUserId, now, now, now);
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

function createSquadConversation(db, ownerUserId, options = {}) {
  const title = normalizeSquadTitle(options.title);
  const avatar = sanitizeSquadAvatar(options.avatar);
  const memberIds = Array.from(new Set(
    (Array.isArray(options.memberIds) ? options.memberIds : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value && value !== String(ownerUserId || '').trim())
  ));

  if (!title) {
    throw new Error('Squad name is required');
  }
  if (memberIds.length === 0) {
    throw new Error('Add at least one player to create a squad');
  }

  const userRows = db.prepare(`
    SELECT id
    FROM users
    WHERE id IN (${memberIds.map(() => '?').join(', ')})
  `).all(...memberIds);
  const foundIds = new Set(userRows.map((row) => String(row.id || '').trim()).filter(Boolean));
  const missingIds = memberIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    throw new Error('One or more selected players could not be found');
  }

  const now = toSqliteDateTime();
  const conversationId = uuidv4();
  const directKey = `squad:${conversationId}`;

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO conversations (
        id, kind, direct_key, created_by_user_id, title, avatar, last_message_id, last_message_at, created_at, updated_at
      )
      VALUES (?, 'squad', ?, ?, ?, ?, '', '', ?, ?)
    `).run(conversationId, directKey, ownerUserId, title, avatar, now, now);

    const insertMember = db.prepare(`
      INSERT INTO conversation_members (
        conversation_id, user_id, role, added_by_user_id, joined_at, last_read_at, is_hidden,
        notifications_enabled, notify_mentions, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, '', 0, 1, 1, ?, ?)
    `);

    insertMember.run(conversationId, ownerUserId, 'creator', ownerUserId, now, now, now);
    for (const memberId of memberIds) {
      insertMember.run(conversationId, memberId, 'member', ownerUserId, now, now, now);
    }
  });

  transaction();
  return conversationId;
}

function notifyRecipients(db, conversationId, senderUser, recipientIds, input) {
  const conversation = getConversationCore(db, conversationId);
  if (!conversation) return;

  if (conversation.kind === 'squad') {
    const recipientSet = new Set(recipientIds.map((value) => String(value || '').trim()).filter(Boolean));
    const mentionedUsers = findMentionedUsers(db, input.content || '')
      .filter((user) => recipientSet.has(String(user.id || '').trim()));
    const mentionedUserIds = new Set(mentionedUsers.map((user) => String(user.id || '').trim()).filter(Boolean));

    for (const userId of recipientSet) {
      const member = getSquadMemberRow(db, conversationId, userId);
      if (!member || member.is_hidden) continue;

      const notificationsEnabled = Number(member.notifications_enabled) !== 0;
      const notifyMentions = Number(member.notify_mentions) !== 0;
      const isMentioned = mentionedUserIds.has(userId);

      if (isMentioned && notifyMentions) {
        createUserNotification(
          db,
          userId,
          'squad_mention',
          `${senderUser?.username || 'Someone'} mentioned you in ${conversation.title || 'a squad'}`,
          buildNotificationBody(input.content, input.messageType, input.share, input.linkShare, input.challengeCard),
          `/messages/${conversationId}`
        );
        continue;
      }

      if (!notificationsEnabled) continue;

      createUserNotification(
        db,
        userId,
        'squad_message',
        `${senderUser?.username || 'Someone'} posted in ${conversation.title || 'your squad'}`,
        buildNotificationBody(input.content, input.messageType, input.share, input.linkShare, input.challengeCard),
        `/messages/${conversationId}`
      );
    }
    return;
  }

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

router.get('/highlights/:userId/story/:storyId/shared', requireAuth, (req, res) => {
  const db = getDb();
  const ownerUserId = String(req.params.userId || '').trim();
  const storyId = String(req.params.storyId || '').trim();
  const conversationId = String(req.query.conversationId || '').trim();
  if (!ownerUserId || !storyId) return res.status(400).json({ error: 'Story is required' });
  if (!canAccessSharedStory(db, req.user.id, ownerUserId, storyId, conversationId)) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const match = findStoryForUser(db, ownerUserId, storyId);
  if (!match?.story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const interactive = isFollowingOrSelf(db, req.user.id, ownerUserId);
  res.json({
    user: normalizeStoryUser(match.user, 72),
    story: {
      ...match.story,
      engagement: interactive
        ? buildStoryEngagementPayload(db, ownerUserId, storyId, req.user.id)
        : (match.story.engagement || {
          pump_count: 0,
          comment_count: 0,
          user_pumped: false,
          preview_comments: [],
        }),
    },
    readonly: !interactive,
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
  notifyInboxNoteMentions(db, user, input.content);

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
    const snapshot = sanitizeStorySnapshot(req.body?.snapshot_json || req.body?.snapshot || {});
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
      const hasSource = ['upscore', 'clear'].includes(sourceKind) && !!sourceId;
      if (!hasSource && !snapshot) {
        return res.status(400).json({ error: 'Choose a recent upscore or clear to share.' });
      }
      if (snapshot) metadata.snapshot = snapshot;
      metadata.title = normalizeText(req.body?.title || '', 80);
      metadata.subtitle = normalizeText(req.body?.subtitle || '', 120);
    }

    const now = new Date();
    const nowSql = toInboxSqliteDateTime(now);
    const expiresAt = toInboxSqliteDateTime(addHours(now, STORY_TTL_HOURS));
    const storyId = uuidv4();

    const story = db.transaction(() => {
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
      const createdStory = stories.find((item) => item.id === `story:${storyId}`) || null;
      if (!createdStory) {
        throw new Error('Failed to load the created story');
      }

      const mentionedUsers = getVisibleStoryMentionedUsers(db, req.user.id, caption);
      autoShareStoryWithMentionedUsers(db, user, createdStory, mentionedUsers);
      notifyStoryMentions(
        db,
        user,
        req.user.id,
        caption,
        metadata.title || createdStory.title || 'your story',
        mentionedUsers
      );

      return createdStory;
    })();

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
      INSERT INTO user_story_views (owner_user_id, story_id, viewer_user_id, viewed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(story_id, viewer_user_id) DO UPDATE SET
        viewed_at = excluded.viewed_at
    `).run(ownerUserId, storyId, req.user.id, toInboxSqliteDateTime(new Date()));
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
    SELECT 1
    FROM user_story_pumps
    WHERE owner_user_id = ? AND story_id = ? AND user_id = ?
    LIMIT 1
  `).get(ownerUserId, storyId, req.user.id);

  if (existing) {
    db.prepare(`
      DELETE FROM user_story_pumps
      WHERE owner_user_id = ? AND story_id = ? AND user_id = ?
    `).run(ownerUserId, storyId, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO user_story_pumps (owner_user_id, story_id, user_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(ownerUserId, storyId, req.user.id, toInboxSqliteDateTime(new Date()));
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
    INSERT INTO user_story_comments (id, owner_user_id, story_id, user_id, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(commentId, ownerUserId, storyId, req.user.id, content, nowSql);
  notifyStoryCommentMentions(db, req.user, ownerUserId, match?.user?.username || '', content);

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

router.post('/squads', requireAuth, (req, res) => {
  const db = getDb();
  const title = req.body?.title;
  const avatar = req.body?.avatar;
  const memberIds = req.body?.member_ids || req.body?.memberIds || [];
  const creator = getUserIdentity(db, req.user.id);
  if (!creator) return res.status(404).json({ error: 'Creator not found' });

  try {
    const conversationId = createSquadConversation(db, req.user.id, { title, avatar, memberIds });
    const squad = buildSquadResponse(db, conversationId, req.user.id);

    for (const member of squad.members) {
      const memberUserId = String(member?.user?.id || '').trim();
      if (!memberUserId || memberUserId === String(req.user.id || '').trim()) continue;
      createUserNotification(
        db,
        memberUserId,
        'squad_invite',
        `${creator.username || 'Someone'} added you to ${squad.conversation?.title || 'a squad'}`,
        'Open the squad chat to jump in.',
        `/messages/${conversationId}`
      );
    }

    res.status(201).json(squad);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to create squad' });
  }
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

  const messageRows = getConversationMessages(db, conversationId);
  const reactionState = getConversationMessageReactionState(db, messageRows.map((row) => row.id), req.user.id);
  const messages = messageRows.map((row) => normalizeConversationMessage(row, req.user.id, reactionState[row.id] || null));
  markConversationRead(db, conversationId, req.user.id);

  const conversation = normalizeConversationRow(conversationRow);
  if (conversation) conversation.unread_count = 0;

  res.json({ conversation, messages });
});

router.get('/conversations/:id/squad', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'Conversation id is required' });

  const access = requireSquadMembership(db, conversationId, req.user.id);
  if (access.error) return res.status(access.status || 404).json({ error: access.error });

  res.json(buildSquadResponse(db, conversationId, req.user.id));
});

router.get('/conversations/:id/mentions', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'Conversation id is required' });

  const member = getConversationMember(db, conversationId, req.user.id);
  if (!member || member.is_hidden) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const query = String(req.query?.q || '').trim().toLowerCase();
  const users = getConversationMentionCandidates(db, conversationId, req.user.id)
    .filter((entry) => !query || String(entry?.username || '').toLowerCase().includes(query))
    .slice(0, 8);

  res.json({ users });
});

router.put('/conversations/:id/squad', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const access = requireSquadMembership(db, conversationId, req.user.id);
  if (access.error) return res.status(access.status || 404).json({ error: access.error });
  if (String(access.member.role || '') !== 'creator') {
    return res.status(403).json({ error: 'Only the creator can edit this squad' });
  }

  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'title')) {
    const title = normalizeSquadTitle(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Squad name is required' });
    updates.push('title = ?');
    params.push(title);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar')) {
    updates.push('avatar = ?');
    params.push(sanitizeSquadAvatar(req.body?.avatar));
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'theme')) {
    const VALID_THEMES = ['', 'cli', 'aim', 'yahoo', 'msn', 'skype', 'winamp'];
    const requestedTheme = String(req.body?.theme || '').trim().toLowerCase();
    if (!VALID_THEMES.includes(requestedTheme)) {
      return res.status(400).json({ error: 'Invalid theme' });
    }
    updates.push('theme = ?');
    params.push(requestedTheme);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No squad changes were provided' });
  }

  updates.push('updated_at = ?');
  params.push(toSqliteDateTime(), conversationId);

  db.prepare(`
    UPDATE conversations
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  res.json(buildSquadResponse(db, conversationId, req.user.id));
});

router.post('/conversations/:id/squad/members', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const targetUserId = String(req.body?.user_id || req.body?.userId || '').trim();
  if (!targetUserId) return res.status(400).json({ error: 'User is required' });

  const access = requireSquadMembership(db, conversationId, req.user.id);
  if (access.error) return res.status(access.status || 404).json({ error: access.error });
  if (!canManageSquadMembers(access.member)) {
    return res.status(403).json({ error: 'You cannot add players to this squad' });
  }

  const targetUser = getUserIdentity(db, targetUserId);
  if (!targetUser) return res.status(404).json({ error: 'Player not found' });
  const existingMember = getConversationMember(db, conversationId, targetUserId);
  if (existingMember && !existingMember.is_hidden) {
    return res.status(409).json({ error: 'That player is already in the squad' });
  }

  const now = toSqliteDateTime();
  db.prepare(`
    INSERT INTO conversation_members (
      conversation_id, user_id, role, added_by_user_id, joined_at, last_read_at, is_hidden,
      notifications_enabled, notify_mentions, created_at, updated_at
    )
    VALUES (?, ?, 'member', ?, ?, '', 0, 1, 1, ?, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET
      role = 'member',
      added_by_user_id = excluded.added_by_user_id,
      joined_at = excluded.joined_at,
      is_hidden = 0,
      notifications_enabled = 1,
      notify_mentions = 1,
      updated_at = excluded.updated_at
  `).run(conversationId, targetUserId, req.user.id, now, now, now);

  db.prepare(`
    UPDATE conversations
    SET updated_at = ?
    WHERE id = ?
  `).run(now, conversationId);

  createUserNotification(
    db,
    targetUserId,
    'squad_invite',
    `${req.user.username || 'Someone'} added you to ${access.conversation.title || 'a squad'}`,
    'Open the squad chat to jump in.',
    `/messages/${conversationId}`
  );

  res.status(201).json(buildSquadResponse(db, conversationId, req.user.id));
});

router.delete('/conversations/:id/squad/members/:userId', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const targetUserId = String(req.params.userId || '').trim();
  if (!targetUserId) return res.status(400).json({ error: 'User is required' });

  const access = requireSquadMembership(db, conversationId, req.user.id);
  if (access.error) return res.status(access.status || 404).json({ error: access.error });
  const targetMember = getConversationMember(db, conversationId, targetUserId);
  if (!targetMember || targetMember.is_hidden) {
    return res.status(404).json({ error: 'Squad member not found' });
  }
  if (targetUserId === String(req.user.id || '').trim()) {
    return res.status(400).json({ error: 'Leave controls are not supported here yet' });
  }
  if (!canRemoveSquadMember(access.member, targetMember)) {
    return res.status(403).json({ error: 'You cannot remove that player' });
  }

  db.prepare(`
    DELETE FROM conversation_members
    WHERE conversation_id = ? AND user_id = ?
  `).run(conversationId, targetUserId);

  db.prepare(`
    UPDATE conversations
    SET updated_at = ?
    WHERE id = ?
  `).run(toSqliteDateTime(), conversationId);

  res.json(buildSquadResponse(db, conversationId, req.user.id));
});

router.put('/conversations/:id/squad/members/:userId/role', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const targetUserId = String(req.params.userId || '').trim();
  const nextRole = String(req.body?.role || '').trim().toLowerCase();
  if (!['member', 'moderator'].includes(nextRole)) {
    return res.status(400).json({ error: 'Role must be member or moderator' });
  }

  const access = requireSquadMembership(db, conversationId, req.user.id);
  if (access.error) return res.status(access.status || 404).json({ error: access.error });
  if (String(access.member.role || '') !== 'creator') {
    return res.status(403).json({ error: 'Only the creator can manage moderators' });
  }

  const targetMember = getConversationMember(db, conversationId, targetUserId);
  if (!targetMember || targetMember.is_hidden) {
    return res.status(404).json({ error: 'Squad member not found' });
  }
  if (String(targetMember.role || '') === 'creator') {
    return res.status(400).json({ error: 'The creator role cannot be changed' });
  }

  db.prepare(`
    UPDATE conversation_members
    SET role = ?, updated_at = ?
    WHERE conversation_id = ? AND user_id = ?
  `).run(nextRole, toSqliteDateTime(), conversationId, targetUserId);

  res.json(buildSquadResponse(db, conversationId, req.user.id));
});

router.put('/conversations/:id/squad/notifications', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const access = requireSquadMembership(db, conversationId, req.user.id);
  if (access.error) return res.status(access.status || 404).json({ error: access.error });

  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notifications_enabled')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'enabled')) {
    updates.push('notifications_enabled = ?');
    params.push(req.body?.notifications_enabled ?? req.body?.enabled ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notify_mentions')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'mentions')) {
    updates.push('notify_mentions = ?');
    params.push(req.body?.notify_mentions ?? req.body?.mentions ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No notification settings were provided' });
  }

  updates.push('updated_at = ?');
  params.push(toSqliteDateTime(), conversationId, req.user.id);

  db.prepare(`
    UPDATE conversation_members
    SET ${updates.join(', ')}
    WHERE conversation_id = ? AND user_id = ?
  `).run(...params);

  res.json(buildSquadResponse(db, conversationId, req.user.id));
});

router.post('/conversations/:id/messages/:messageId/reactions', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  const messageId = String(req.params.messageId || '').trim();
  if (!conversationId || !messageId) {
    return res.status(400).json({ error: 'Conversation and message are required' });
  }

  const member = getConversationMember(db, conversationId, req.user.id);
  if (!member || member.is_hidden) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const reactionKey = sanitizeReactionKey(req.body?.reaction || req.body?.reaction_key || '');
  if (!reactionKey) {
    return res.status(400).json({ error: 'A valid reaction is required' });
  }

  const message = toggleConversationMessageReaction(db, conversationId, messageId, req.user.id, reactionKey);
  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }

  res.json({ message });
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

router.put('/conversations/:id/theme', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'Conversation id is required' });

  const member = getConversationMember(db, conversationId, req.user.id);
  if (!member || member.is_hidden) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  // For squads, only creator/moderator can change theme. For DMs, either party can.
  const conversation = getConversationCore(db, conversationId);
  if (conversation?.kind === 'squad') {
    const role = String(member.role || '').trim();
    if (role !== 'creator' && role !== 'moderator') {
      return res.status(403).json({ error: 'Only creators or moderators can change the theme' });
    }
  }

  const VALID_THEMES = ['', 'cli', 'aim', 'yahoo', 'msn', 'skype', 'winamp'];
  const requestedTheme = String(req.body?.theme || '').trim().toLowerCase();
  if (!VALID_THEMES.includes(requestedTheme)) {
    return res.status(400).json({ error: 'Invalid theme' });
  }

  const now = toSqliteDateTime();
  db.prepare(`
    UPDATE conversations
    SET theme = ?, updated_at = ?
    WHERE id = ?
  `).run(requestedTheme, now, conversationId);

  const conversationRow = getConversationRowForUser(db, conversationId, req.user.id);
  res.json({ conversation: normalizeConversationRow(conversationRow) });
});

router.put('/conversations/:id/pin', requireAuth, (req, res) => {
  const db = getDb();
  const conversationId = String(req.params.id || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'Conversation id is required' });

  const member = getConversationMember(db, conversationId, req.user.id);
  if (!member || member.is_hidden) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const pinned = req.body.pinned ? 1 : 0;
  const now = toSqliteDateTime();
  db.prepare(`
    UPDATE conversation_members
    SET is_pinned = ?, updated_at = ?
    WHERE conversation_id = ? AND user_id = ?
  `).run(pinned, now, conversationId, req.user.id);

  const conversationRow = getConversationRowForUser(db, conversationId, req.user.id);
  res.json({ conversation: normalizeConversationRow(conversationRow) });
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

  if (stompResult.alreadyWaiting) {
    const normalizedConversation = normalizeConversationRow(getConversationRowForUser(db, conversationId, req.user.id));
    return res.status(409).json({
      error: 'Wait for them to stomp you back first.',
      conversation: normalizedConversation,
    });
  }

  const stompFlavors = [
    'stomped you 👣',
    'just stomped on your pad 👟',
    'hit you with a stomp 💥',
    'dropped a stomp on you 🦶',
    'came through with a stomp 👊',
    'stomped your arrow 🎯',
    'left a footprint on your screen 👣',
    'wants your attention 👀',
    'is calling you out 🔥',
    'gave you a love tap 💫',
  ];
  const stompText = stompFlavors[Math.floor(Math.random() * stompFlavors.length)];

  const stompInput = {
    messageType: 'stomp',
    content: stompText,
    metadata: { stomp: { sender_user_id: req.user.id, recipient_user_id: partnerUserId } },
  };
  insertConversationMessage(db, conversationId, senderUser, stompInput);

  const normalizedConversation = normalizeConversationRow(getConversationRowForUser(db, conversationId, req.user.id));

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

  if (input.replyToMessageId) {
    const replyTargetRow = getConversationReplyTargetRow(db, conversationId, input.replyToMessageId);
    if (!replyTargetRow) {
      return res.status(400).json({ error: 'Reply target not found' });
    }
    const replyTarget = buildReplyTargetPayloadFromRow(replyTargetRow);
    if (replyTarget) {
      input.metadata.reply_to = replyTarget;
    }
  }

  const messageRow = insertConversationMessage(db, conversationId, senderUser, input);
  const recipientIds = getConversationRecipientIds(db, conversationId, req.user.id);
  notifyRecipients(db, conversationId, senderUser, recipientIds, input);

  const conversation = normalizeConversationRow(getConversationRowForUser(db, conversationId, req.user.id));
  if (conversation) conversation.unread_count = 0;

  res.status(201).json({
    conversation,
    message: normalizeConversationMessage(messageRow, req.user.id, { reactions: [], viewerReaction: '' }),
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
    if (input.replyToMessageId) {
      const replyTargetRow = getConversationReplyTargetRow(db, conversationId, input.replyToMessageId);
      if (!replyTargetRow) {
        return res.status(400).json({ error: 'Reply target not found' });
      }
      const replyTarget = buildReplyTargetPayloadFromRow(replyTargetRow);
      if (replyTarget) {
        input.metadata.reply_to = replyTarget;
      }
    }
    const messageRow = insertConversationMessage(db, conversationId, senderUser, input);
    notifyRecipients(db, conversationId, senderUser, [targetUserId], input);
    message = normalizeConversationMessage(messageRow, req.user.id, { reactions: [], viewerReaction: '' });
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

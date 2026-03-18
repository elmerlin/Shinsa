const { normalizeUserAvatarForList } = require('./avatarProxy');

const MAX_MESSAGE_LENGTH = 4000;
const MAX_SHARE_ROWS = 200;
const MAX_LINK_LENGTH = 500;
const LINK_SHARE_KIND_LABELS = {
  live_session: 'Live session',
  post: 'Post',
  upscore: 'Upscore',
  clear: 'Clear',
  hour_of_power: 'Hour of Power',
  link: 'Link',
};

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeMessageText(value, max = MAX_MESSAGE_LENGTH) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

function textSnippet(value, max = 120) {
  const compact = normalizeMessageText(value, max * 2).replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, MAX_SHARE_ROWS).map((row) => ({
    song_title: String(row?.song_title || ''),
    mode: String(row?.mode || ''),
    level: toInt(row?.level),
    score: toInt(row?.score),
    grade: String(row?.grade || ''),
    rating_points: toInt(row?.rating_points),
    over_top100_rank: toInt(row?.over_top100_rank),
    jacket_url: String(row?.jacket_url || ''),
    replay_embed_url: String(row?.replay_embed_url || ''),
    replay_video_id: String(row?.replay_video_id || ''),
    replay_start_seconds: toInt(row?.replay_start_seconds),
    replay_end_seconds: toInt(row?.replay_end_seconds),
    perfect: toInt(row?.perfect),
    great: toInt(row?.great),
    good: toInt(row?.good),
    bad: toInt(row?.bad),
    miss: toInt(row?.miss),
    max_combo: toInt(row?.max_combo),
    date_played: String(row?.date_played || ''),
  }));
}

function sanitizeSessionSharePayload(share) {
  if (!share || typeof share !== 'object') return null;
  const src = share || {};
  const shareType = String(src.shareType || '').trim().toLowerCase() === 'hour_of_power'
    ? 'hour_of_power'
    : 'session_share';

  return {
    version: 1,
    shareType,
    sessionId: String(src.sessionId || ''),
    sessionTitle: String(src.sessionTitle || ''),
    streamUrl: String(src.streamUrl || ''),
    generatedAt: String(src.generatedAt || ''),
    sessionDateLabel: String(src.sessionDateLabel || ''),
    sessionTimeRange: String(src.sessionTimeRange || ''),
    sessionDurationMinutes: toInt(src.sessionDurationMinutes),
    sessionDurationLabel: String(src.sessionDurationLabel || ''),
    sessionMachineName: String(src.sessionMachineName || ''),
    filterMode: String(src.filterMode || 'Both'),
    minGrade: String(src.minGrade || 'PASS').toUpperCase(),
    minGradeLabel: String(src.minGradeLabel || 'Pass'),
    minLevel: toInt(src.minLevel),
    maxLevel: toInt(src.maxLevel),
    hasLevelRange: toBoolean(src.hasLevelRange),
    levelRangeLabel: String(src.levelRangeLabel || ''),
    songCount: toInt(src.songCount),
    clearCount: toInt(src.clearCount),
    clearRate: toInt(src.clearRate),
    averageScore: toInt(src.averageScore),
    singleCount: toInt(src.singleCount),
    doubleCount: toInt(src.doubleCount),
    otherCount: toInt(src.otherCount),
    totalRatingPoints: toInt(src.totalRatingPoints),
    averageRatingPoints: toNumber(src.averageRatingPoints),
    averageLevel: toNumber(src.averageLevel),
    highestRatingPoints: toInt(src.highestRatingPoints),
    lowestRatingPoints: toInt(src.lowestRatingPoints),
    countedClearCount: toInt(src.countedClearCount),
    completed: toBoolean(src.completed),
    leaderboardEligible: toBoolean(src.leaderboardEligible),
    judgmentTotals: {
      perfect: toInt(src?.judgmentTotals?.perfect),
      great: toInt(src?.judgmentTotals?.great),
      good: toInt(src?.judgmentTotals?.good),
      bad: toInt(src?.judgmentTotals?.bad),
      miss: toInt(src?.judgmentTotals?.miss),
    },
    perfectRate: toInt(src.perfectRate),
    rows: sanitizeRows(src.rows),
  };
}

function sanitizeRelativePath(value) {
  const raw = String(value || '').trim().slice(0, MAX_LINK_LENGTH);
  if (!raw || /^https?:\/\//i.test(raw)) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function sanitizeAbsoluteUrl(value) {
  const raw = String(value || '').trim().slice(0, MAX_LINK_LENGTH);
  if (!/^https?:\/\//i.test(raw)) return '';
  return raw;
}

function sanitizeLinkSharePayload(linkShare) {
  if (!linkShare || typeof linkShare !== 'object') return null;
  const src = linkShare || {};
  const path = sanitizeRelativePath(src.path || src.url_path || src.urlPath);
  const url = sanitizeAbsoluteUrl(src.url);
  if (!path && !url) return null;

  const kindKey = String(src.kind || src.linkType || 'link').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const kind = LINK_SHARE_KIND_LABELS[kindKey] ? kindKey : 'link';

  return {
    version: 1,
    kind,
    path,
    url,
    title: String(src.title || '').trim().slice(0, 160),
    subtitle: String(src.subtitle || '').trim().slice(0, 220),
    buttonLabel: String(src.buttonLabel || src.button_label || '').trim().slice(0, 48),
  };
}

function parseJsonObject(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseMessageMetadata(raw) {
  return parseJsonObject(raw, {});
}

function buildDirectConversationKey(userIdA, userIdB) {
  const values = [String(userIdA || '').trim(), String(userIdB || '').trim()]
    .filter(Boolean)
    .sort();
  return values.length === 2 ? values.join(':') : '';
}

function buildLinkSharePreview(linkShare) {
  if (!linkShare) return 'Shared link';
  const kindLabel = LINK_SHARE_KIND_LABELS[linkShare.kind] || 'Link';
  return linkShare.title
    ? `${kindLabel}: ${linkShare.title}`
    : `Shared ${kindLabel.toLowerCase()}`;
}

function buildMessagePreview(messageType, content, share = null, linkShare = null) {
  const snippet = textSnippet(content, 120);
  if (snippet) return snippet;
  if (messageType === 'session_share' && share) {
    if (share.shareType === 'hour_of_power') {
      return share.sessionTitle
        ? `Hour of Power recap: ${share.sessionTitle}`
        : 'Hour of Power recap';
    }
    return share.sessionTitle ? `Session recap: ${share.sessionTitle}` : 'Session recap';
  }
  if (messageType === 'link_share' && linkShare) {
    return buildLinkSharePreview(linkShare);
  }
  return 'Message';
}

function buildNotificationTitle(senderUsername, messageType, share = null, linkShare = null) {
  const sender = String(senderUsername || 'Someone').trim() || 'Someone';
  if (messageType === 'session_share' && share?.shareType === 'hour_of_power') {
    return `${sender} shared an Hour of Power recap`;
  }
  if (messageType === 'session_share') {
    return `${sender} shared a session recap`;
  }
  if (messageType === 'link_share' && linkShare) {
    const kindLabel = LINK_SHARE_KIND_LABELS[linkShare.kind] || 'link';
    return `${sender} shared a ${kindLabel.toLowerCase()}`;
  }
  return `${sender} sent you a message`;
}

function buildNotificationBody(content, messageType, share = null, linkShare = null) {
  const snippet = textSnippet(content, 140);
  if (snippet) return snippet;
  if (messageType === 'session_share' && share?.sessionTitle) {
    return share.sessionTitle;
  }
  if (messageType === 'session_share' && share?.shareType === 'hour_of_power') {
    return 'Hour of Power recap';
  }
  if (messageType === 'session_share') {
    return 'Session recap';
  }
  if (messageType === 'link_share' && linkShare?.title) {
    return linkShare.title;
  }
  if (messageType === 'link_share' && linkShare) {
    const kindLabel = LINK_SHARE_KIND_LABELS[linkShare.kind] || 'Link';
    return `${kindLabel} shared with you`;
  }
  return 'Open the conversation to reply.';
}

function normalizeConversationPartner(row, size = 56) {
  if (!row?.partner_user_id) return null;
  return {
    id: row.partner_user_id,
    username: row.partner_username || '',
    avatar: normalizeUserAvatarForList(row.partner_avatar, row.partner_user_id, size, row.partner_avatar_v),
  };
}

function normalizeConversationRow(row) {
  if (!row) return null;
  const lastMetadata = parseMessageMetadata(row.last_message_metadata_json);
  const share = sanitizeSessionSharePayload(lastMetadata.share);
  const linkShare = sanitizeLinkSharePayload(lastMetadata.link_share);
  const messageType = String(row.last_message_type || '').trim() || 'text';
  const content = String(row.last_message_content || '');

  return {
    id: row.id,
    kind: row.kind || 'direct',
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    last_message_at: row.last_message_at || row.created_at || '',
    unread_count: toInt(row.unread_count),
    partner: normalizeConversationPartner(row, 56),
    last_message: row.last_message_id ? {
      id: row.last_message_id,
      sender_user_id: row.last_message_sender_user_id || '',
      message_type: messageType,
      content,
      share,
      link_share: linkShare,
      created_at: row.last_message_at || '',
      preview: buildMessagePreview(messageType, content, share, linkShare),
    } : null,
  };
}

function normalizeConversationMessage(row, viewerUserId = '') {
  const metadata = parseMessageMetadata(row?.metadata_json);
  const share = sanitizeSessionSharePayload(metadata.share);
  const linkShare = sanitizeLinkSharePayload(metadata.link_share);
  const senderUserId = String(row?.sender_user_id || '').trim();

  return {
    id: row?.id || '',
    conversation_id: row?.conversation_id || '',
    message_type: row?.message_type || 'text',
    content: String(row?.content || ''),
    share,
    link_share: linkShare,
    created_at: row?.created_at || '',
    updated_at: row?.updated_at || '',
    sender: {
      id: senderUserId,
      username: row?.sender_username || '',
      avatar: normalizeUserAvatarForList(row?.sender_avatar, senderUserId, 40, row?.sender_avatar_v),
    },
    is_own: !!viewerUserId && senderUserId === String(viewerUserId || '').trim(),
  };
}

function normalizeConversationInput(raw = {}) {
  const content = normalizeMessageText(raw.content);
  const share = sanitizeSessionSharePayload(raw.session_share || raw.share || null);
  const linkShare = sanitizeLinkSharePayload(raw.link_share || raw.linkShare || raw.link || null);
  const messageType = share ? 'session_share' : (linkShare ? 'link_share' : 'text');

  if (!content && !share && !linkShare) {
    return { error: 'Message is required' };
  }

  return {
    messageType,
    content,
    share,
    linkShare,
    metadata: share ? { share } : (linkShare ? { link_share: linkShare } : {}),
  };
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  buildDirectConversationKey,
  buildMessagePreview,
  buildNotificationBody,
  buildNotificationTitle,
  normalizeConversationInput,
  normalizeConversationMessage,
  normalizeConversationRow,
  parseMessageMetadata,
  sanitizeLinkSharePayload,
  sanitizeSessionSharePayload,
  textSnippet,
};

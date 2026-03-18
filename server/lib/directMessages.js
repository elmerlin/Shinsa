const { normalizeUserAvatarForList } = require('./avatarProxy');

const MAX_MESSAGE_LENGTH = 4000;
const MAX_SHARE_ROWS = 200;
const MAX_LINK_LENGTH = 500;
const MAX_CHALLENGE_TEXT_LENGTH = 220;
const LINK_SHARE_KIND_LABELS = {
  live_session: 'Live session',
  post: 'Post',
  upscore: 'Upscore',
  clear: 'Clear',
  score_snapshot: 'Score',
  chart_compare: 'Compare reply',
  hour_of_power: 'Hour of Power',
  story: 'Story',
  link: 'Link',
};
const CHALLENGE_KIND_LABELS = {
  beat_score: 'Score challenge',
  clear_chart: 'Clear challenge',
};
const CHALLENGE_SOURCE_KIND_LABELS = {
  upscore: 'Upscore',
  clear: 'Clear',
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
    chartPath: sanitizeRelativePath(src.chartPath || src.chart_path),
    title: String(src.title || '').trim().slice(0, 160),
    subtitle: String(src.subtitle || '').trim().slice(0, 220),
    buttonLabel: String(src.buttonLabel || src.button_label || '').trim().slice(0, 48),
    songTitle: String(src.songTitle || src.song_title || '').trim().slice(0, 120),
    mode: String(src.mode || '').trim().slice(0, 24),
    level: toInt(src.level),
    score: toInt(src.score),
    grade: String(src.grade || '').trim().slice(0, 24),
    isStageBreak: toBoolean(src.isStageBreak || src.is_stage_break),
    playerName: String(src.playerName || src.player_name || '').trim().slice(0, 80),
    playerAvatar: String(src.playerAvatar || src.player_avatar || '').trim().slice(0, MAX_LINK_LENGTH),
    playerSkillTitle: String(src.playerSkillTitle || src.player_skill_title || '').trim().slice(0, 48),
    playerRoleLabel: String(src.playerRoleLabel || src.player_role_label || '').trim().slice(0, 24),
    contextLabel: String(src.contextLabel || src.context_label || '').trim().slice(0, 48),
    playedAt: String(src.playedAt || src.played_at || '').trim().slice(0, 40),
    jacketUrl: String(src.jacketUrl || src.jacket_url || '').trim().slice(0, MAX_LINK_LENGTH),
    oldScore: toInt(src.oldScore || src.old_score),
    oldGrade: String(src.oldGrade || src.old_grade || '').trim().slice(0, 24),
    scoreDelta: toInt(src.scoreDelta || src.score_delta),
    overTop100Rank: toInt(src.overTop100Rank || src.over_top100_rank),
    plate: String(src.plate || '').trim().slice(0, 24),
    perfect: toInt(src.perfect),
    great: toInt(src.great),
    good: toInt(src.good),
    bad: toInt(src.bad),
    miss: toInt(src.miss),
    targetScore: toInt(src.targetScore || src.target_score),
    challengeKind: String(src.challengeKind || src.challenge_kind || '').trim().slice(0, 24),
    sourceMessageId: String(src.sourceMessageId || src.source_message_id || '').trim().slice(0, 80),
    statusKind: String(src.statusKind || src.status_kind || '').trim().slice(0, 24),
    statusLabel: String(src.statusLabel || src.status_label || '').trim().slice(0, 120),
  };
}

function sanitizeChallengeCardPayload(challengeCard) {
  if (!challengeCard || typeof challengeCard !== 'object') return null;
  const src = challengeCard || {};
  const path = sanitizeRelativePath(src.path || src.source_path || src.sourcePath || src.url_path || src.urlPath);
  if (!path) return null;

  const kindKey = String(src.kind || src.challengeType || src.challenge_type || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_');
  if (!CHALLENGE_KIND_LABELS[kindKey]) return null;

  const sourceKindKey = String(src.sourceKind || src.source_kind || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_');
  const sourceKind = CHALLENGE_SOURCE_KIND_LABELS[sourceKindKey] ? sourceKindKey : '';

  return {
    version: 1,
    kind: kindKey,
    sourceKind,
    sourceId: String(src.sourceId || src.source_id || '').trim().slice(0, 80),
    path,
    chartPath: sanitizeRelativePath(src.chartPath || src.chart_path),
    title: String(src.title || '').trim().slice(0, 120),
    subtitle: String(src.subtitle || '').trim().slice(0, MAX_CHALLENGE_TEXT_LENGTH),
    targetLabel: String(src.targetLabel || src.target_label || '').trim().slice(0, 80),
    detailLabel: String(src.detailLabel || src.detail_label || '').trim().slice(0, 120),
    buttonLabel: String(src.buttonLabel || src.button_label || '').trim().slice(0, 48),
    songTitle: String(src.songTitle || src.song_title || '').trim().slice(0, 120),
    mode: String(src.mode || '').trim().slice(0, 24),
    level: toInt(src.level),
    targetScore: toInt(src.targetScore || src.target_score),
    targetGrade: String(src.targetGrade || src.target_grade || '').trim().slice(0, 24),
    originUsername: String(src.originUsername || src.origin_username || '').trim().slice(0, 40),
    sourceMessageId: String(src.sourceMessageId || src.source_message_id || '').trim().slice(0, 80),
    statusKind: String(src.statusKind || src.status_kind || '').trim().slice(0, 24),
    statusLabel: String(src.statusLabel || src.status_label || '').trim().slice(0, 120),
  };
}

function sanitizeNoteThreadPayload(noteThread) {
  if (!noteThread || typeof noteThread !== 'object') return null;
  const src = noteThread || {};
  const threadKey = String(src.threadKey || src.thread_key || '').trim().slice(0, 120);
  if (!threadKey) return null;

  return {
    version: 1,
    threadKey,
    noteId: String(src.noteId || src.note_id || '').trim().slice(0, 120),
    ownerUserId: String(src.ownerUserId || src.owner_user_id || '').trim().slice(0, 80),
    ownerUsername: String(src.ownerUsername || src.owner_username || '').trim().slice(0, 60),
    noteText: normalizeMessageText(src.noteText || src.note_text || '', 180),
    noteKind: String(src.noteKind || src.note_kind || '').trim().slice(0, 40),
    createdAt: String(src.createdAt || src.created_at || '').trim().slice(0, 40),
    expiresAt: String(src.expiresAt || src.expires_at || '').trim().slice(0, 40),
    linkPath: sanitizeRelativePath(src.linkPath || src.link_path),
    linkUrl: sanitizeAbsoluteUrl(src.linkUrl || src.link_url),
    linkLabel: String(src.linkLabel || src.link_label || '').trim().slice(0, 48),
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
  if (linkShare.kind === 'chart_compare' && linkShare.statusLabel) {
    return `Compare reply: ${linkShare.statusLabel}`;
  }
  const kindLabel = LINK_SHARE_KIND_LABELS[linkShare.kind] || 'Link';
  return linkShare.title
    ? `${kindLabel}: ${linkShare.title}`
    : `Shared ${kindLabel.toLowerCase()}`;
}

function buildChallengeCardPreview(challengeCard) {
  if (!challengeCard) return 'Challenge sent';
  if (challengeCard.statusLabel) {
    return challengeCard.statusLabel;
  }
  if (challengeCard.targetLabel) {
    return `${CHALLENGE_KIND_LABELS[challengeCard.kind] || 'Challenge'}: ${challengeCard.targetLabel}`;
  }
  if (challengeCard.subtitle) {
    return `${CHALLENGE_KIND_LABELS[challengeCard.kind] || 'Challenge'}: ${challengeCard.subtitle}`;
  }
  return challengeCard.title || 'Challenge sent';
}

function buildMessagePreview(messageType, content, share = null, linkShare = null, challengeCard = null) {
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
  if (messageType === 'challenge_card' && challengeCard) {
    return buildChallengeCardPreview(challengeCard);
  }
  return 'Message';
}

function buildNotificationTitle(senderUsername, messageType, share = null, linkShare = null, challengeCard = null) {
  const sender = String(senderUsername || 'Someone').trim() || 'Someone';
  if (messageType === 'session_share' && share?.shareType === 'hour_of_power') {
    return `${sender} shared an Hour of Power recap`;
  }
  if (messageType === 'session_share') {
    return `${sender} shared a session recap`;
  }
  if (messageType === 'link_share' && linkShare) {
    if (linkShare.kind === 'chart_compare') {
      return linkShare.statusKind === 'beat_target'
        ? `${sender} beat the target`
        : linkShare.statusKind === 'pass_earned'
          ? `${sender} earned the pass`
          : `${sender} sent a compare reply`;
    }
    const kindLabel = LINK_SHARE_KIND_LABELS[linkShare.kind] || 'link';
    return `${sender} shared a ${kindLabel.toLowerCase()}`;
  }
  if (messageType === 'challenge_card' && challengeCard?.kind === 'beat_score') {
    if (challengeCard.statusKind === 'accepted') {
      return `${sender} accepted a challenge`;
    }
    if (challengeCard.statusKind === 'expired') {
      return `${sender} closed a challenge`;
    }
    return `${sender} challenged you to beat a score`;
  }
  if (messageType === 'challenge_card' && challengeCard?.kind === 'clear_chart') {
    if (challengeCard.statusKind === 'accepted') {
      return `${sender} accepted a challenge`;
    }
    if (challengeCard.statusKind === 'expired') {
      return `${sender} closed a challenge`;
    }
    return `${sender} challenged you to clear a chart`;
  }
  if (messageType === 'challenge_card') {
    return `${sender} sent you a challenge`;
  }
  return `${sender} sent you a message`;
}

function buildNotificationBody(content, messageType, share = null, linkShare = null, challengeCard = null) {
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
  if (messageType === 'link_share' && linkShare?.kind === 'chart_compare' && linkShare?.subtitle) {
    return linkShare.statusLabel || linkShare.subtitle;
  }
  if (messageType === 'link_share' && linkShare?.title) {
    return linkShare.title;
  }
  if (messageType === 'link_share' && linkShare) {
    const kindLabel = LINK_SHARE_KIND_LABELS[linkShare.kind] || 'Link';
    return `${kindLabel} shared with you`;
  }
  if (messageType === 'challenge_card' && challengeCard?.targetLabel) {
    if (challengeCard.statusLabel) return challengeCard.statusLabel;
    return challengeCard.targetLabel;
  }
  if (messageType === 'challenge_card' && challengeCard?.subtitle) {
    return challengeCard.subtitle;
  }
  if (messageType === 'challenge_card') {
    return 'Open the conversation to take on the challenge.';
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
  const challengeCard = sanitizeChallengeCardPayload(lastMetadata.challenge_card);
  const noteThread = sanitizeNoteThreadPayload(lastMetadata.note_thread);
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
      challenge_card: challengeCard,
      note_thread: noteThread,
      created_at: row.last_message_at || '',
      preview: buildMessagePreview(messageType, content, share, linkShare, challengeCard),
    } : null,
  };
}

function normalizeConversationMessage(row, viewerUserId = '') {
  const metadata = parseMessageMetadata(row?.metadata_json);
  const share = sanitizeSessionSharePayload(metadata.share);
  const linkShare = sanitizeLinkSharePayload(metadata.link_share);
  const challengeCard = sanitizeChallengeCardPayload(metadata.challenge_card);
  const noteThread = sanitizeNoteThreadPayload(metadata.note_thread);
  const senderUserId = String(row?.sender_user_id || '').trim();

  return {
    id: row?.id || '',
    conversation_id: row?.conversation_id || '',
    message_type: row?.message_type || 'text',
    content: String(row?.content || ''),
    share,
    link_share: linkShare,
    challenge_card: challengeCard,
    note_thread: noteThread,
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
  const challengeCard = sanitizeChallengeCardPayload(raw.challenge_card || raw.challengeCard || raw.challenge || null);
  const noteThread = sanitizeNoteThreadPayload(raw.note_thread || raw.noteThread || null);
  const messageType = share
    ? 'session_share'
    : (challengeCard ? 'challenge_card' : (linkShare ? 'link_share' : 'text'));

  if (!content && !share && !linkShare && !challengeCard) {
    return { error: 'Message is required' };
  }

  const metadata = {};
  if (share) metadata.share = share;
  if (challengeCard) metadata.challenge_card = challengeCard;
  if (linkShare) metadata.link_share = linkShare;
  if (noteThread) metadata.note_thread = noteThread;

  return {
    messageType,
    content,
    share,
    linkShare,
    challengeCard,
    noteThread,
    metadata,
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
  sanitizeChallengeCardPayload,
  sanitizeLinkSharePayload,
  sanitizeNoteThreadPayload,
  sanitizeSessionSharePayload,
  textSnippet,
};

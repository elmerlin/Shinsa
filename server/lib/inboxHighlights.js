const { normalizeUserAvatarForList } = require('./avatarProxy');

const NOTE_TTL_HOURS = 24;
const STORY_TTL_HOURS = 24;
const MAX_STICKERS = 12;

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function toSqliteDateTime(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function addHours(date, hours) {
  const base = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return new Date(base.getTime() + (Math.max(0, Number(hours) || 0) * 3600000));
}

function normalizeText(value, max = 240) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, max);
}

function sanitizeRelativePath(value, max = 500) {
  const raw = String(value || '').trim().slice(0, max);
  if (!raw || /^https?:\/\//i.test(raw)) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function sanitizeAbsoluteUrl(value, max = 500) {
  const raw = String(value || '').trim().slice(0, max);
  if (!/^https?:\/\//i.test(raw)) return '';
  return raw;
}

function parseJsonArray(raw, fallback = []) {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeStickerTokens(value) {
  const tokens = Array.isArray(value)
    ? value
    : parseJsonArray(value, []);
  return tokens
    .map((token) => String(token || '').trim().slice(0, 80))
    .filter((token) => /^:[a-z0-9_]+:$/i.test(token))
    .slice(0, MAX_STICKERS);
}

function buildStoryLink({ path = '', url = '', label = '' } = {}) {
  const nextPath = sanitizeRelativePath(path);
  const nextUrl = sanitizeAbsoluteUrl(url);
  const nextLabel = normalizeText(label, 60);
  if (!nextPath && !nextUrl) return null;
  return {
    path: nextPath,
    url: nextUrl,
    label: nextLabel || 'Open',
  };
}

function normalizeStoryUser(row, size = 72) {
  if (!row?.id) return null;
  return {
    id: row.id,
    username: row.username || '',
    avatar: normalizeUserAvatarForList(row.avatar, row.id, size, row.avatar_v),
  };
}

function normalizeNotePayload(row, fallbackUser = null) {
  if (!row) return null;
  const storyLink = buildStoryLink({
    path: row.link_path || '',
    url: row.link_url || '',
    label: row.link_label || '',
  });
  return {
    id: String(row.id || '').trim(),
    user_id: String(row.user_id || fallbackUser?.id || '').trim(),
    content: String(row.content || '').trim(),
    kind: String(row.note_kind || row.kind || 'manual').trim() || 'manual',
    thread_key: String(row.thread_key || '').trim(),
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
    expires_at: String(row.expires_at || '').trim(),
    is_auto: String(row.note_kind || row.kind || '').trim() !== 'manual',
    link: storyLink,
    user: fallbackUser || normalizeStoryUser({
      id: row.user_id,
      username: row.username,
      avatar: row.avatar,
      avatar_v: row.avatar_v,
    }, 56),
  };
}

function buildManualNoteRow(row, user) {
  if (!row || !user) return null;
  return normalizeNotePayload({
    ...row,
    note_kind: 'manual',
  }, user);
}

function getManualActiveNote(db, userId) {
  return db.prepare(`
    SELECT *
    FROM user_inbox_notes
    WHERE user_id = ?
      AND COALESCE(cleared_at, '') = ''
      AND datetime(expires_at) > datetime('now')
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `).get(userId);
}

function buildAutoNote(db, user) {
  if (!user?.id) return null;

  const session = db.prepare(`
    SELECT id, title, status_text, session_type, created_at
    FROM live_sessions
    WHERE host_user_id = ?
      AND COALESCE(deleted_at, '') = ''
      AND status = 'live'
    ORDER BY datetime(COALESCE(NULLIF(started_at, ''), created_at)) DESC, id DESC
    LIMIT 1
  `).get(user.id);

  if (session?.id) {
    const isHop = String(session.session_type || '').trim() === 'hour_of_power';
    return normalizeNotePayload({
      id: `live:${session.id}`,
      user_id: user.id,
      content: normalizeText(session.status_text, 120) || (isHop ? 'Hour of Power live' : 'Live now'),
      note_kind: isHop ? 'hour_of_power' : 'live_session',
      thread_key: `live:${session.id}`,
      created_at: session.created_at || '',
      updated_at: session.created_at || '',
      expires_at: toSqliteDateTime(addHours(new Date(), 1)),
      link_path: `/live/${session.id}`,
      link_label: isHop ? 'Open Hour of Power' : 'Open Live',
      link_url: '',
    }, user);
  }

  const playingStatus = normalizeText(user.playing_status, 120);
  if (playingStatus) {
    const statusTimestamp = user.updated_at || toSqliteDateTime(new Date());
    return normalizeNotePayload({
      id: `playing:${user.id}`,
      user_id: user.id,
      content: playingStatus,
      note_kind: 'playing_status',
      thread_key: `playing:${user.id}`,
      created_at: statusTimestamp,
      updated_at: statusTimestamp,
      expires_at: toSqliteDateTime(addHours(new Date(), 1)),
      link_path: '',
      link_label: '',
      link_url: '',
    }, user);
  }

  return null;
}

function getEffectiveNote(db, user) {
  const manualNote = getManualActiveNote(db, user?.id);
  if (manualNote) return buildManualNoteRow(manualNote, user);
  return buildAutoNote(db, user);
}

function buildSnapshotStoryItem({
  id = '',
  user,
  storyType = 'score_snapshot',
  createdAt = '',
  expiresAt = '',
  caption = '',
  link = null,
  stickerTokens = [],
  snapshot = null,
  source = null,
  title = '',
  subtitle = '',
}) {
  return {
    id,
    type: storyType,
    created_at: createdAt,
    expires_at: expiresAt,
    caption,
    title,
    subtitle,
    sticker_tokens: sanitizeStickerTokens(stickerTokens),
    link,
    source,
    user,
    snapshot,
  };
}

function buildLinkStoryItem({
  id = '',
  user,
  type = 'link',
  createdAt = '',
  expiresAt = '',
  caption = '',
  title = '',
  subtitle = '',
  link = null,
  stickerTokens = [],
  mediaUrl = '',
  source = null,
}) {
  return {
    id,
    type,
    created_at: createdAt,
    expires_at: expiresAt,
    caption,
    title,
    subtitle,
    sticker_tokens: sanitizeStickerTokens(stickerTokens),
    media_url: String(mediaUrl || '').trim(),
    link,
    source,
    user,
  };
}

function getStoryExpiry(createdAt) {
  const raw = String(createdAt || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return toSqliteDateTime(addHours(parsed, STORY_TTL_HOURS));
}

function buildUpscoreStoryItem(row, user) {
  if (!row || !user) return null;
  const items = parseJsonArray(row.upscores_json, []).filter(Boolean);
  const primary = items[0] || null;
  if (!primary) return null;
  return buildSnapshotStoryItem({
    id: `upscore:${row.id}`,
    user,
    createdAt: row.created_at || '',
    expiresAt: getStoryExpiry(row.created_at),
    caption: normalizeText(row.caption || '', 220),
    stickerTokens: [],
    link: buildStoryLink({
      path: `/upscore/${row.id}`,
      label: 'Open Upscore',
    }),
    source: { kind: 'upscore', id: String(row.id || '') },
    title: items.length > 1 ? `${items.length} new upscores` : 'New upscore',
    subtitle: `${primary.song_title || 'Song'} ${primary.mode || ''}${primary.level ? ` ${primary.level}` : ''}`.trim(),
    snapshot: {
      song_title: primary.song_title || '',
      mode: primary.mode || '',
      level: toInt(primary.level),
      score: toInt(primary.score),
      old_score: toInt(primary.old_score),
      old_grade: primary.old_grade || '',
      grade: primary.grade || '',
      scoreDelta: toInt(primary.score_delta || primary.scoreDelta),
      over_top100_rank: toInt(primary.over_top100_rank),
      plate: primary.plate || '',
      perfect: toInt(primary.perfect),
      great: toInt(primary.great),
      good: toInt(primary.good),
      bad: toInt(primary.bad),
      miss: toInt(primary.miss),
      playerName: user.username || '',
      playerAvatar: user.avatar || '',
      date_played: primary.date_played || row.created_at || '',
    },
  });
}

function buildClearStoryItem(row, user) {
  if (!row || !user) return null;
  return buildSnapshotStoryItem({
    id: `clear:${row.id}`,
    user,
    createdAt: row.created_at || '',
    expiresAt: getStoryExpiry(row.created_at),
    caption: normalizeText(row.caption || '', 220),
    stickerTokens: [],
    link: buildStoryLink({
      path: `/clear/${row.id}`,
      label: 'Open Clear',
    }),
    source: { kind: 'clear', id: String(row.id || '') },
    title: 'New clear',
    subtitle: `${row.song_title || 'Song'} ${row.mode || ''}${row.level ? ` ${row.level}` : ''}`.trim(),
    snapshot: {
      song_title: row.song_title || '',
      mode: row.mode || '',
      level: toInt(row.level),
      score: toInt(row.score),
      grade: row.grade || '',
      plate: row.plate || '',
      playerName: user.username || '',
      playerAvatar: user.avatar || '',
      date_played: row.created_at || '',
    },
  });
}

function buildPostStoryItem(row, user) {
  if (!row || !user) return null;
  const images = parseJsonArray(row.images, []).filter(Boolean);
  return {
    id: `post:${row.id}`,
    type: 'post',
    created_at: row.created_at || '',
    expires_at: getStoryExpiry(row.created_at),
    caption: normalizeText(row.content, 420),
    title: 'New post',
    subtitle: row.youtube_url ? 'Video post' : (images.length > 0 ? `${images.length} photo${images.length === 1 ? '' : 's'}` : ''),
    sticker_tokens: [],
    media_url: images[0] || '',
    post: {
      id: row.id,
      content: row.content || '',
      images,
      youtube_url: row.youtube_url || '',
    },
    link: buildStoryLink({
      path: `/post/${row.id}`,
      label: 'Open Post',
    }),
    source: { kind: 'post', id: String(row.id || '') },
    user,
  };
}

function buildLiveStoryItem(row, user) {
  if (!row || !user) return null;
  const isHop = String(row.session_type || '').trim() === 'hour_of_power';
  return buildLinkStoryItem({
    id: `live:${row.id}`,
    user,
    type: isHop ? 'hour_of_power' : 'live_session',
    createdAt: row.created_at || '',
    expiresAt: getStoryExpiry(row.created_at),
    caption: normalizeText(row.status_text, 220),
    title: row.title || (isHop ? 'Hour of Power' : 'Live session'),
    subtitle: isHop ? 'Jump in before the clock runs out.' : 'Join the live room.',
    link: buildStoryLink({
      path: `/live/${row.id}`,
      label: isHop ? 'Open Hour of Power' : 'Open Live',
    }),
    stickerTokens: [],
    source: { kind: isHop ? 'hour_of_power' : 'live_session', id: String(row.id || '') },
  });
}

function buildManualStoryItem(row, user, resolvedSource = null) {
  if (!row || !user) return null;
  const metadata = parseJsonObject(row.metadata_json, {});
  const storyType = String(row.story_type || '').trim() || 'image';
  const baseLink = buildStoryLink({
    path: row.link_path || metadata.link_path || '',
    url: row.link_url || metadata.link_url || '',
    label: metadata.link_label || row.link_label || '',
  });
  const stickerTokens = sanitizeStickerTokens(row.sticker_tokens_json);
  const base = {
    id: `story:${row.id}`,
    createdAt: row.created_at || '',
    expiresAt: row.expires_at || '',
    caption: normalizeText(row.caption || '', 420),
    stickerTokens,
    user,
    source: {
      kind: String(row.source_kind || '').trim(),
      id: String(row.source_id || '').trim(),
    },
  };

  if (storyType === 'score_snapshot' && resolvedSource) {
    return {
      ...resolvedSource,
      id: `story:${row.id}`,
      created_at: row.created_at || resolvedSource.created_at || '',
      expires_at: row.expires_at || resolvedSource.expires_at || '',
      caption: normalizeText(row.caption || resolvedSource.caption || '', 420),
      sticker_tokens: stickerTokens,
      source: {
        kind: String(row.source_kind || '').trim(),
        id: String(row.source_id || '').trim(),
      },
      manual: true,
    };
  }

  if (storyType === 'link') {
    return buildLinkStoryItem({
      id: base.id,
      user,
      type: 'link',
      createdAt: base.createdAt,
      expiresAt: base.expiresAt,
      caption: base.caption,
      title: normalizeText(metadata.title || row.caption || 'Shared link', 80),
      subtitle: normalizeText(metadata.subtitle || '', 120),
      link: baseLink,
      stickerTokens,
      mediaUrl: '',
      source: base.source,
    });
  }

  return buildLinkStoryItem({
    id: base.id,
    user,
    type: 'image',
    createdAt: base.createdAt,
    expiresAt: base.expiresAt,
    caption: base.caption,
    title: normalizeText(metadata.title || 'Story', 80),
    subtitle: normalizeText(metadata.subtitle || '', 120),
    link: baseLink,
    stickerTokens,
    mediaUrl: row.media_url || '',
    source: base.source,
  });
}

function getRecentAutoStoryItems(db, user) {
  if (!user?.id) return [];
  const items = [];

  const posts = db.prepare(`
    SELECT id, content, images, youtube_url, created_at
    FROM user_posts
    WHERE user_id = ?
      AND datetime(created_at) >= datetime('now', '-24 hours')
    ORDER BY datetime(created_at) ASC, id ASC
    LIMIT 8
  `).all(user.id);
  for (const row of posts) {
    const item = buildPostStoryItem(row, user);
    if (item) items.push(item);
  }

  const upscores = db.prepare(`
    SELECT id, upscores_json, created_at
    FROM user_upscores
    WHERE user_id = ?
      AND datetime(created_at) >= datetime('now', '-24 hours')
    ORDER BY datetime(created_at) ASC, id ASC
    LIMIT 10
  `).all(user.id);
  for (const row of upscores) {
    const item = buildUpscoreStoryItem(row, user);
    if (item) items.push(item);
  }

  const clears = db.prepare(`
    SELECT id, song_title, mode, level, score, grade, plate, created_at
    FROM user_new_clears
    WHERE user_id = ?
      AND datetime(created_at) >= datetime('now', '-24 hours')
    ORDER BY datetime(created_at) ASC, id ASC
    LIMIT 10
  `).all(user.id);
  for (const row of clears) {
    const item = buildClearStoryItem(row, user);
    if (item) items.push(item);
  }

  const sessions = db.prepare(`
    SELECT id, title, status_text, session_type, created_at
    FROM live_sessions
    WHERE host_user_id = ?
      AND COALESCE(deleted_at, '') = ''
      AND datetime(created_at) >= datetime('now', '-24 hours')
    ORDER BY datetime(created_at) ASC, id ASC
    LIMIT 4
  `).all(user.id);
  for (const row of sessions) {
    const item = buildLiveStoryItem(row, user);
    if (item) items.push(item);
  }

  return items.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function buildResolvedStorySource(db, user, sourceKind, sourceId) {
  const kind = String(sourceKind || '').trim();
  const idValue = String(sourceId || '').trim();
  if (!kind || !idValue || !user?.id) return null;

  if (kind === 'upscore') {
    const row = db.prepare(`
      SELECT id, user_id, upscores_json, created_at
      FROM user_upscores
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `).get(toInt(idValue), user.id);
    return row ? buildUpscoreStoryItem(row, user) : null;
  }

  if (kind === 'clear') {
    const row = db.prepare(`
      SELECT id, user_id, song_title, mode, level, score, grade, plate, created_at
      FROM user_new_clears
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `).get(toInt(idValue), user.id);
    return row ? buildClearStoryItem(row, user) : null;
  }

  return null;
}

function getManualStoryItems(db, user) {
  if (!user?.id) return [];
  const rows = db.prepare(`
    SELECT *
    FROM user_story_items
    WHERE user_id = ?
      AND COALESCE(deleted_at, '') = ''
      AND datetime(expires_at) > datetime('now')
    ORDER BY datetime(created_at) ASC, id ASC
    LIMIT 24
  `).all(user.id);

  return rows.map((row) => {
    const resolvedSource = buildResolvedStorySource(db, user, row.source_kind, row.source_id);
    return buildManualStoryItem(row, user, resolvedSource);
  }).filter(Boolean);
}

function getStoryItemsForUser(db, user) {
  const manualItems = getManualStoryItems(db, user);
  const autoItems = getRecentAutoStoryItems(db, user);
  return [...autoItems, ...manualItems]
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function getHighlightUsers(db, viewerUserId) {
  return db.prepare(`
    SELECT id, username, avatar, avatar_v, playing_status
    FROM users
    WHERE id = ?
       OR id IN (
         SELECT following_id
         FROM user_follows
         WHERE follower_id = ?
       )
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END ASC, LOWER(username) ASC
  `).all(viewerUserId, viewerUserId, viewerUserId);
}

function getInboxHighlights(db, viewerUserId) {
  const users = getHighlightUsers(db, viewerUserId)
    .map((row) => ({
      ...row,
      avatar: normalizeUserAvatarForList(row.avatar, row.id, 72, row.avatar_v),
    }))
    .map((row) => ({
      id: row.id,
      username: row.username || '',
      avatar: row.avatar || '',
      avatar_v: row.avatar_v || 0,
      playing_status: row.playing_status || '',
      updated_at: '',
    }));

  const circles = [];

  for (const user of users) {
    const note = getEffectiveNote(db, user);
    const stories = getStoryItemsForUser(db, user);
    const lastActivityAt = stories[stories.length - 1]?.created_at || note?.created_at || '';
    const isSelf = String(user.id || '') === String(viewerUserId || '');
    if (!isSelf && !note && stories.length === 0) continue;
    circles.push({
      user: {
        id: user.id,
        username: user.username || '',
        avatar: user.avatar || '',
      },
      note,
      has_story: stories.length > 0,
      story_count: stories.length,
      last_activity_at: lastActivityAt,
      is_self: isSelf,
    });
  }

  const me = circles.find((circle) => circle.is_self) || null;
  return {
    me,
    circles,
  };
}

module.exports = {
  NOTE_TTL_HOURS,
  STORY_TTL_HOURS,
  addHours,
  buildResolvedStorySource,
  getEffectiveNote,
  getInboxHighlights,
  getStoryItemsForUser,
  normalizeNotePayload,
  normalizeStoryUser,
  sanitizeAbsoluteUrl,
  sanitizeRelativePath,
  sanitizeStickerTokens,
  normalizeText,
  parseJsonArray,
  parseJsonObject,
  toSqliteDateTime,
};

const MENTION_REGEX = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,30})\b/g;
const { createUserNotification } = require('./notifications');

function extractMentionUsernames(text = '') {
  if (!text) return [];
  const usernames = new Set();
  let match;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const username = (match[2] || '').trim();
    if (username) usernames.add(username.toLowerCase());
  }

  return [...usernames];
}

function findMentionedUsers(db, textOrUsernames, options = {}) {
  const {
    restrictToCommunityMembers = false,
    communityId = '',
  } = options;

  const usernames = Array.isArray(textOrUsernames)
    ? textOrUsernames.map(u => String(u || '').toLowerCase()).filter(Boolean)
    : extractMentionUsernames(textOrUsernames);

  if (usernames.length === 0) return [];

  const getUser = db.prepare('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)');
  const isCommunityMember = restrictToCommunityMembers && communityId
    ? db.prepare('SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?')
    : null;

  const users = [];
  const seen = new Set();
  for (const username of usernames) {
    const user = getUser.get(username);
    if (!user || seen.has(user.id)) continue;
    if (isCommunityMember && !isCommunityMember.get(communityId, user.id)) continue;
    seen.add(user.id);
    users.push(user);
  }

  return users;
}

function notifyMentionedUsers(db, options = {}) {
  const {
    mentionedUsers = [],
    actorUserId = '',
    actorUsername = 'Someone',
    type = 'mention',
    title = 'Mentioned',
    message = '',
    link = '',
    skipUserIds = [],
  } = options;

  if (!Array.isArray(mentionedUsers) || mentionedUsers.length === 0) return 0;

  const skip = new Set([actorUserId, ...skipUserIds].filter(Boolean));
  let created = 0;
  for (const user of mentionedUsers) {
    if (!user?.id || skip.has(user.id)) continue;
    createUserNotification(db, user.id, type, title, message || `${actorUsername} mentioned you`, link || '');
    created += 1;
  }
  return created;
}

module.exports = {
  extractMentionUsernames,
  findMentionedUsers,
  notifyMentionedUsers,
};

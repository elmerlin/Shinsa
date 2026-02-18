function isInlineDataAvatar(value) {
  const avatar = String(value || '');
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(avatar);
}

function buildUserAvatarPath(userId, size = 64) {
  const uid = encodeURIComponent(String(userId || ''));
  const s = Math.max(24, Math.min(512, parseInt(size, 10) || 64));
  return `/api/auth/avatar/${uid}?s=${s}`;
}

function normalizeUserAvatarForList(avatar, userId, size = 64) {
  if (!avatar) return '';
  if (isInlineDataAvatar(avatar)) {
    return userId ? buildUserAvatarPath(userId, size) : '';
  }
  return avatar;
}

module.exports = {
  isInlineDataAvatar,
  buildUserAvatarPath,
  normalizeUserAvatarForList,
};


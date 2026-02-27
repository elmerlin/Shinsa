function isInlineDataAvatar(value) {
  const avatar = String(value || '');
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(avatar);
}

function buildUserAvatarPath(userId, size = 64, version) {
  const uid = encodeURIComponent(String(userId || ''));
  const s = Math.max(24, Math.min(512, parseInt(size, 10) || 64));
  const v = parseInt(version, 10);
  return `/api/auth/avatar/${uid}?s=${s}${v > 0 ? `&v=${v}` : ''}`;
}

function normalizeUserAvatarForList(avatar, userId, size = 64, version) {
  if (!avatar) return '';
  if (isInlineDataAvatar(avatar)) {
    return userId ? buildUserAvatarPath(userId, size, version) : '';
  }
  return avatar;
}

module.exports = {
  isInlineDataAvatar,
  buildUserAvatarPath,
  normalizeUserAvatarForList,
};


export function getProfilePathByUsername(username) {
  const clean = String(username || '').trim().replace(/^@+/, '');
  return clean ? `/@${encodeURIComponent(clean)}` : '/';
}

export function getProfilePath(userId, username) {
  if (username) return getProfilePathByUsername(username);
  if (userId) return `/profile/${encodeURIComponent(String(userId))}`;
  return '/';
}

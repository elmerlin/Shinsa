function compactText(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function buildPostLinkShare({
  postId,
  username,
  text,
  shareType = '',
}) {
  const id = String(postId || '').trim();
  if (!id) return null;

  const authorName = String(username || 'Player').trim() || 'Player';
  const normalizedShareType = String(shareType || '').trim().toLowerCase();
  const title = normalizedShareType === 'hour_of_power'
    ? `${authorName}'s Hour of Power recap`
    : normalizedShareType === 'session_share'
      ? `${authorName}'s session share`
      : `${authorName}'s post`;

  return {
    kind: 'post',
    path: `/post/${id}`,
    title,
    subtitle: compactText(text, 140) || 'Open this post on Shinsa.',
    buttonLabel: 'Open post',
  };
}

export function buildLiveSessionLinkShare({
  liveId,
  title,
  hostUsername,
  isHopSession = false,
  status = '',
}) {
  const id = String(liveId || '').trim();
  if (!id) return null;

  const hostLabel = String(hostUsername || '').trim();
  const sessionTitle = String(title || '').trim()
    || (hostLabel ? `${hostLabel}'s live session` : 'Shinsa Live session');
  const statusLabel = String(status || '').trim().toLowerCase();
  const baseSubtitle = isHopSession
    ? (hostLabel ? `Hour of Power live room hosted by ${hostLabel}` : 'Hour of Power live room')
    : (hostLabel ? `Live room hosted by ${hostLabel}` : 'Shinsa Live room');

  return {
    kind: 'live_session',
    path: `/live/${id}`,
    title: sessionTitle,
    subtitle: statusLabel ? `${baseSubtitle} • ${statusLabel}` : baseSubtitle,
    buttonLabel: isHopSession ? 'Open HoP room' : 'Open room',
  };
}

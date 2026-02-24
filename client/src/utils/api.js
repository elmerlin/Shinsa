const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options.headers },
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Longer timeout for scraping operations (5 min for multi-page best scores)
async function longRequest(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options.headers },
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Dashboard (combined)
export const getDashboard = () => request('/dashboard');

// Tournaments
export const getTournaments = () => request('/tournaments');
export const getTournament = (id) => request(`/tournaments/${id}`);
export const createTournament = (data) => request('/tournaments', { method: 'POST', body: JSON.stringify(data) });
export const updateTournament = (id, data) => request(`/tournaments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTournament = (id) => request(`/tournaments/${id}`, { method: 'DELETE' });
export const searchTournaments = (q) => request(`/tournaments/search?q=${encodeURIComponent(q)}`);
export const getArchivedTournaments = () => request('/tournaments/archived');
export const archiveTournament = (id, archived) => request(`/tournaments/${id}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) });

// Players
export const getPlayers = (tournamentId) => request(`/players/tournament/${tournamentId}`);
export const createPlayer = (data) => request('/players', { method: 'POST', body: JSON.stringify(data) });
export const updatePlayer = (id, data) => request(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePlayer = (id) => request(`/players/${id}`, { method: 'DELETE' });

// Matches
export const getMatches = (tournamentId, round) => {
  let url = `/matches/tournament/${tournamentId}`;
  if (round) url += `?round=${round}`;
  return request(url);
};
export const getMatch = (id) => request(`/matches/${id}`);
export const generateRoundRobin = (tournamentId) => request(`/matches/tournament/${tournamentId}/round-robin`, { method: 'POST' });
export const generateGauntlet = (tournamentId) => request(`/matches/tournament/${tournamentId}/gauntlet`, { method: 'POST' });
export const drawCards = (matchId) => request(`/matches/${matchId}/draw`, { method: 'POST' });
export const vetoSong = (matchId, data) => request(`/matches/${matchId}/veto`, { method: 'POST', body: JSON.stringify(data) });
export const submitResult = (matchId, data) => request(`/matches/${matchId}/result`, { method: 'POST', body: JSON.stringify(data) });

// Notices
export const getNotices = () => request('/notices');
export const createNotice = (data) => request('/notices', { method: 'POST', body: JSON.stringify(data) });
export const updateNotice = (id, data) => request(`/notices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteNotice = (id) => request(`/notices/${id}`, { method: 'DELETE' });

// Songs
export const getSongs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs${qs ? `?${qs}` : ''}`);
};
export const getJacketMap = () => request('/songs/jacket-map');
export const getChartKeyMap = () => request('/songs/chart-key-map');
export const getSongLibrary = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/library${qs ? `?${qs}` : ''}`);
};
export const getSongChartDetail = (chartId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/chart/${chartId}${qs ? `?${qs}` : ''}`);
};
export const getSongChartHistory = (chartId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/chart/${chartId}/history${qs ? `?${qs}` : ''}`);
};
export const getSongAnalytics = (userId) => request(`/songs/analytics/user/${userId}`);
export const getSongHeadToHead = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/analytics/head-to-head${qs ? `?${qs}` : ''}`);
};
export const getSongTierMeta = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/tiers/meta${qs ? `?${qs}` : ''}`);
};
export const getSongTiers = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/tiers${qs ? `?${qs}` : ''}`);
};
export const getSongSkillsMeta = () => request('/songs/skills/meta');
export const getSongMissingSkills = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/skills/missing${qs ? `?${qs}` : ''}`);
};
export const getSongSkillCharts = (skillSlug, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/skill/${encodeURIComponent(skillSlug)}${qs ? `?${qs}` : ''}`);
};
export const updateSongChartSkills = (chartId, skills = []) => request(`/songs/chart/${chartId}/skills`, {
  method: 'PUT',
  body: JSON.stringify({ skills }),
});

// Duels
export const getDuels = () => request('/duels');
export const getDuel = (id) => request(`/duels/${id}`);
export const createDuel = (data) => request('/duels', { method: 'POST', body: JSON.stringify(data) });
export const deleteDuel = (id) => request(`/duels/${id}`, { method: 'DELETE' });
export const duelDraw = (id, data) => request(`/duels/${id}/draw`, { method: 'POST', body: JSON.stringify(data) });
export const duelScore = (id, data) => request(`/duels/${id}/score`, { method: 'POST', body: JSON.stringify(data) });
export const duelDeleteSong = (id, songEntryId) => request(`/duels/${id}/song/${songEntryId}`, { method: 'DELETE' });
export const endDuel = (id) => request(`/duels/${id}/end`, { method: 'POST' });

// Auth
export const register = (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const login = (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
export const getMe = () => request('/auth/me');
export const updateMe = (data) => request('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
export const changePassword = (data) => request('/auth/password', { method: 'PUT', body: JSON.stringify(data) });
export const searchUsers = (q) => request(`/auth/search?q=${encodeURIComponent(q)}`);
export const getUserProfile = (id) => request(`/auth/user/${id}`);
export const getUserProfileByUsername = (username) => request(`/auth/user/username/${encodeURIComponent(username)}`);
export const getUserStats = (id) => request(`/auth/user/${id}/stats`);
export const getUserActivity = (id) => request(`/auth/user/${id}/activity`);
export const getInvitations = () => request('/auth/invitations');
export const respondInvitation = (id, status) => request(`/auth/invitations/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
export const sendInvitation = (data) => request('/auth/invite', { method: 'POST', body: JSON.stringify(data) });

// Fun mini-game
export const getFunLeaderboard = (limit = 10) => request(`/fun/leaderboard?limit=${encodeURIComponent(limit)}`);
export const submitFunScore = (score) => request('/fun/score', { method: 'POST', body: JSON.stringify({ score }) });
export const getFunSettings = () => request('/fun/settings');
export const updateFunSettings = (data) => request('/fun/settings', { method: 'PUT', body: JSON.stringify(data) });

// Online Duels
export const getOnlineDuels = () => request('/online-duels');
export const getOnlineDuel = (id) => request(`/online-duels/${id}`);
export const createOnlineDuel = (data) => request('/online-duels', { method: 'POST', body: JSON.stringify(data) });
export const joinOnlineDuel = (id) => request(`/online-duels/${id}/join`, { method: 'POST' });
export const deleteOnlineDuel = (id) => request(`/online-duels/${id}`, { method: 'DELETE' });
export const getOnlineDuelChat = (id, after) => request(`/online-duels/${id}/chat${after ? `?after=${encodeURIComponent(after)}` : ''}`);
export const sendChatMessage = (id, data) => request(`/online-duels/${id}/chat`, { method: 'POST', body: JSON.stringify(data) });
export const onlineDuelDraw = (id, data) => request(`/online-duels/${id}/draw`, { method: 'POST', body: JSON.stringify(data) });
export const onlineDuelAccept = (id, songId) => request(`/online-duels/${id}/accept`, { method: 'POST', body: JSON.stringify({ song_id: songId }) });
export const onlineDuelDecline = (id, songId) => request(`/online-duels/${id}/decline`, { method: 'POST', body: JSON.stringify({ song_id: songId }) });
export const onlineDuelSubmitScore = (id, data) => request(`/online-duels/${id}/submit-score`, { method: 'POST', body: JSON.stringify(data) });
export const onlineDuelEndRequest = (id) => request(`/online-duels/${id}/end-request`, { method: 'POST' });
export const onlineDuelCancelEnd = (id) => request(`/online-duels/${id}/cancel-end`, { method: 'POST' });
export const pumpPlayer = (id, player) => request(`/online-duels/${id}/pump`, { method: 'POST', body: JSON.stringify({ player }) });
export const getMyPump = (id) => request(`/online-duels/${id}/my-pump`);
export const onlineDuelRematch = (id) => request(`/online-duels/${id}/rematch`, { method: 'POST' });
export const onlineDuelForfeit = (id) => request(`/online-duels/${id}/forfeit`, { method: 'POST' });
export const sendSpectateHeartbeat = (id, sessionId) => request(`/online-duels/${id}/spectate`, { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });
export const getOnlineDuelHistory = (userId) => request(`/online-duels/user/${userId}/history`);
export const predictDuelWinner = (id, predicted_winner) => request(`/online-duels/${id}/predict`, { method: 'POST', body: JSON.stringify({ predicted_winner }) });
export const getDuelPredictions = (id) => request(`/online-duels/${id}/predictions`);

// PIUGame Integration
export const getPiugameCredentialStatus = () => request('/piugame/credentials/status');
export const savePiugameCredentials = (data) => request('/piugame/credentials', { method: 'POST', body: JSON.stringify(data) });
export const deletePiugameCredentials = () => request('/piugame/credentials', { method: 'DELETE' });
export const syncPumbility = () => longRequest('/piugame/sync/pumbility', { method: 'POST' });
export const syncBestScores = () => longRequest('/piugame/sync/best-scores', { method: 'POST' });
export const syncRecentlyPlayed = () => longRequest('/piugame/sync/recently-played', { method: 'POST' });
export const getPiugamePumbility = (userId) => request(`/piugame/pumbility/${userId}`);
export const getPiugameBestScores = (userId, mode) => request(`/piugame/best-scores/${userId}${mode ? `?mode=${mode}` : ''}`);
export const getPiugameRecentlyPlayed = (userId) => request(`/piugame/recently-played/${userId}`);
export const getPiugameTitles = (userId) => request(`/piugame/titles/${userId}`);
export const getPiugameSyncStatus = (userId) => request(`/piugame/sync-status/${userId}`);
export const getSyncProgress = () => request('/piugame/sync/progress');

// Notifications
export const getNotifications = () => request('/auth/notifications');
export const markNotificationRead = (id) => request(`/auth/notifications/${id}/read`, { method: 'PUT' });
export const markAllNotificationsRead = () => request('/auth/notifications/read-all', { method: 'PUT' });
export const deleteNotification = (id) => request(`/auth/notifications/${id}`, { method: 'DELETE' });
export const getPushPublicKey = () => request(`/auth/push/public-key?_=${Date.now()}`, {
  cache: 'no-store',
  headers: { 'Cache-Control': 'no-cache' },
});
export const savePushSubscription = (subscription) => request('/auth/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
export const removePushSubscription = (endpoint) => request('/auth/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) });

// Social — Follows
export const followUser = (userId) => request(`/social/follow/${userId}`, { method: 'POST' });
export const unfollowUser = (userId) => request(`/social/follow/${userId}`, { method: 'DELETE' });
export const getFollowing = (userId) => request(`/social/following/${userId}`);
export const getFollowingIds = async (userId) => {
  const list = await request(`/social/following/${userId}`);
  return list.map(u => u.id);
};
export const getFollowers = (userId) => request(`/social/followers/${userId}`);
export const getFollowStatus = (userId) => request(`/social/follow-status/${userId}`);
export const getActivityNotificationPreferences = (userId) => request(`/social/activity-notifications/${userId}`);
export const updateActivityNotificationPreferences = (userId, data) => request(`/social/activity-notifications/${userId}`, { method: 'PUT', body: JSON.stringify(data) });
export const getSocialCounts = (userId) => request(`/social/counts/${userId}`);

// Social — Posts
export async function createPost(content, imageFiles, youtubeUrl, commentsDisabled) {
  const formData = new FormData();
  formData.append('content', content);
  if (youtubeUrl) formData.append('youtube_url', youtubeUrl);
  if (commentsDisabled) formData.append('comments_disabled', 'true');
  if (imageFiles) {
    for (const f of imageFiles) {
      formData.append('images', f);
    }
  }
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/social/posts`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    if (err?.error) throw new Error(err.error);
    if (res.status === 413) {
      throw new Error('Upload too large. Keep each image under 10MB and total upload under 25MB.');
    }
    throw new Error(res.statusText || 'Failed to create post');
  }
  return res.json();
}
export const getUserPosts = (userId, page) => request(`/social/posts/user/${userId}?page=${page || 1}`);
export const editPost = (id, data) => request(`/social/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePost = (id) => request(`/social/posts/${id}`, { method: 'DELETE' });

// Social — Post Drafts
export const savePostDraft = (data) => request('/social/drafts', { method: 'POST', body: JSON.stringify(data) });
export const getPostDrafts = () => request('/social/drafts');
export const getPostDraft = (id) => request(`/social/drafts/${id}`);
export const updatePostDraft = (id, data) => request(`/social/drafts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePostDraft = (id) => request(`/social/drafts/${id}`, { method: 'DELETE' });

// Social — Post Pumps
export const pumpPost = (id) => request(`/social/posts/${id}/pump`, { method: 'POST' });
export const getPostPumpers = (id) => request(`/social/posts/${id}/pumps`);

// Social — Post Comments
export const getPostComments = (postId) => request(`/social/posts/${postId}/comments`);
export const addPostComment = (postId, content, parentId) => request(`/social/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deletePostComment = (id) => request(`/social/posts/comments/${id}`, { method: 'DELETE' });
export const togglePostComments = (postId) => request(`/social/posts/${postId}/comments-toggle`, { method: 'PATCH' });

// Social — Upscore Interactions
export const pumpUpscore = (id) => request(`/social/upscores/${id}/pump`, { method: 'POST' });
export const getUpscorePumpers = (id) => request(`/social/upscores/${id}/pumps`);
export const getUpscoreComments = (upscoreId) => request(`/social/upscores/${upscoreId}/comments`);
export const addUpscoreComment = (upscoreId, content, parentId) => request(`/social/upscores/${upscoreId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deleteUpscoreComment = (id) => request(`/social/upscores/comments/${id}`, { method: 'DELETE' });

// Social — New Clear Interactions
export const pumpNewClear = (id) => request(`/social/clears/${id}/pump`, { method: 'POST' });
export const getNewClearPumpers = (id) => request(`/social/clears/${id}/pumps`);
export const getNewClearComments = (clearId) => request(`/social/clears/${clearId}/comments`);
export const addNewClearComment = (clearId, content, parentId) => request(`/social/clears/${clearId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deleteNewClearComment = (id) => request(`/social/clears/comments/${id}`, { method: 'DELETE' });

// Social — Comment Pumps
export const pumpComment = (type, commentId) => request(`/social/comments/${type}/${commentId}/pump`, { method: 'POST' });

// Social — Individual Item Views
export const getPost = (id) => request(`/social/posts/${id}`);
export const getUpscore = (id) => request(`/social/upscores/${id}`);
export const getNewClear = (id) => request(`/social/clears/${id}`);

// Social — Feed
export const getFeed = (page) => request(`/social/feed?page=${page || 1}`);
export const getRecentActivity = () => request('/social/recent-activity');

// ─── Communities ─────────────────────────────────────

export async function createCommunity(formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/communities`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to create community');
  }
  return res.json();
}

export const getCommunities = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/communities${qs ? `?${qs}` : ''}`);
};
export const getFeaturedCommunities = () => request('/communities/featured');
export const getCommunityByName = (name) => request(`/communities/name/${encodeURIComponent(name)}`);

export async function updateCommunity(id, formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/communities/${id}`, {
    method: 'PUT',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to update community');
  }
  return res.json();
}

export const deleteCommunity = (id) => request(`/communities/${id}`, { method: 'DELETE' });
export const joinCommunity = (id) => request(`/communities/${id}/join`, { method: 'POST' });
export const leaveCommunity = (id) => request(`/communities/${id}/leave`, { method: 'DELETE' });
export const getCommunityNotificationPreferences = (id) => request(`/communities/${id}/notifications`);
export const updateCommunityNotificationPreferences = (id, data) => request(`/communities/${id}/notifications`, { method: 'PUT', body: JSON.stringify(data) });
export const getCommunityMembers = (id, sort, options = {}) => {
  const params = new URLSearchParams();
  if (sort) params.set('sort', sort);
  if (options.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return request(`/communities/${id}/members${qs ? `?${qs}` : ''}`);
};
export const searchCommunityMentions = (id, q) => request(`/communities/${id}/mentions?q=${encodeURIComponent(q)}`);
export const updateMemberRole = (communityId, userId, role) => request(`/communities/${communityId}/members/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
export const removeCommunityMember = (communityId, userId) => request(`/communities/${communityId}/members/${userId}`, { method: 'DELETE' });
export const getJoinRequests = (id) => request(`/communities/${id}/requests`);
export const respondJoinRequest = (communityId, requestId, status) => request(`/communities/${communityId}/requests/${requestId}`, { method: 'PUT', body: JSON.stringify({ status }) });
export const getCommunityTags = (id) => request(`/communities/${id}/tags`);
export const createCommunityTag = (id, data) => request(`/communities/${id}/tags`, { method: 'POST', body: JSON.stringify(data) });
export const updateCommunityTag = (id, tagId, data) => request(`/communities/${id}/tags/${tagId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCommunityTag = (id, tagId) => request(`/communities/${id}/tags/${tagId}`, { method: 'DELETE' });
export const assignCommunityTag = (communityId, tagId, userId) => request(`/communities/${communityId}/tags/${tagId}/assign/${userId}`, { method: 'POST' });
export const removeCommunityTag = (communityId, tagId, userId) => request(`/communities/${communityId}/tags/${tagId}/assign/${userId}`, { method: 'DELETE' });
export const getUserCommunities = (userId) => request(`/communities/user/${userId}`);

export async function createCommunityPost(communityId, formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/communities/${communityId}/posts`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to create post');
  }
  return res.json();
}

export const getCommunityPosts = (communityId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/communities/${communityId}/posts${qs ? `?${qs}` : ''}`);
};
export const editCommunityPost = (communityId, postId, data) => request(`/communities/${communityId}/posts/${postId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCommunityPost = (communityId, postId) => request(`/communities/${communityId}/posts/${postId}`, { method: 'DELETE' });
export const pinCommunityPost = (communityId, postId) => request(`/communities/${communityId}/posts/${postId}/pin`, { method: 'PUT' });
export const pumpCommunityPost = (communityId, postId) => request(`/communities/${communityId}/posts/${postId}/pump`, { method: 'POST' });
export const getCommunityPostPumpers = (communityId, postId) => request(`/communities/${communityId}/posts/${postId}/pumps`);
export const getCommunityPostComments = (communityId, postId) => request(`/communities/${communityId}/posts/${postId}/comments`);
export const addCommunityPostComment = (communityId, postId, content, parentId) => request(`/communities/${communityId}/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deleteCommunityPostComment = (communityId, postId, commentId) => request(`/communities/${communityId}/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
export const pumpCommunityComment = (communityId, commentId) => request(`/communities/${communityId}/comments/${commentId}/pump`, { method: 'POST' });

// Community Emojis
export const getCommunityEmojis = (communityId) => request(`/communities/${communityId}/emojis`);
export async function uploadEmojiSheet(communityId, file, cols, rows, prefix) {
  const formData = new FormData();
  formData.append('sheet', file);
  formData.append('cols', cols);
  formData.append('rows', rows);
  formData.append('prefix', prefix);
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/communities/${communityId}/emojis/upload-sheet`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to upload emoji sheet');
  }
  return res.json();
}
export const updateCommunityEmoji = (communityId, emojiId, name) => request(`/communities/${communityId}/emojis/${emojiId}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteCommunityEmoji = (communityId, emojiId) => request(`/communities/${communityId}/emojis/${emojiId}`, { method: 'DELETE' });

// Community Role Badges
export const getCommunityBadges = (communityId) => request(`/communities/${communityId}/badges`);
export async function uploadBadgeSheet(communityId, file, cols, rows, prefix) {
  const formData = new FormData();
  formData.append('sheet', file);
  formData.append('cols', cols);
  formData.append('rows', rows);
  formData.append('prefix', prefix);
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/communities/${communityId}/badges/upload-sheet`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to upload badge sheet');
  }
  return res.json();
}
export const updateCommunityBadge = (communityId, badgeId, name) => request(`/communities/${communityId}/badges/${badgeId}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteCommunityBadge = (communityId, badgeId) => request(`/communities/${communityId}/badges/${badgeId}`, { method: 'DELETE' });
export const assignCommunityBadge = (communityId, badgeId, userId) => request(`/communities/${communityId}/badges/${badgeId}/assign/${userId}`, { method: 'POST' });
export const removeCommunityBadge = (communityId, badgeId, userId) => request(`/communities/${communityId}/badges/${badgeId}/assign/${userId}`, { method: 'DELETE' });

// World Max
export const getWorldMaxMeta = () => request('/world-max/meta');
export const getWorldMaxPins = () => request('/world-max/pins');
export const getWorldMaxCitySuggestions = (q, country = '') => {
  const qs = new URLSearchParams();
  qs.set('q', String(q || ''));
  if (country) qs.set('country', String(country));
  return request(`/world-max/city-suggestions?${qs.toString()}`);
};
export const saveWorldMaxLocation = (data) => request('/world-max/location', { method: 'PUT', body: JSON.stringify(data) });
export const addWorldMaxMachine = (data) => request('/world-max/machines', { method: 'POST', body: JSON.stringify(data) });
export const getWorldMaxMachine = (machineId) => request(`/world-max/machines/${machineId}`);
export const addWorldMaxMachineReview = (machineId, data) => request(`/world-max/machines/${machineId}/reviews`, { method: 'POST', body: JSON.stringify(data) });

export async function addWorldMaxMachinePhoto(machineId, photoFile, caption = '') {
  const formData = new FormData();
  formData.append('photo', photoFile);
  if (caption) formData.append('caption', caption);
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/world-max/machines/${machineId}/photos`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to upload machine photo');
  }
  return res.json();
}

// Chatbot — streaming SSE
export async function streamChatbotAsk(message, history, onEvent) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/chatbot/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          onEvent(event);
        } catch { /* ignore parse errors */ }
      }
    }
  }

  // Process any remaining buffer
  if (buffer.startsWith('data: ')) {
    try {
      const event = JSON.parse(buffer.slice(6));
      onEvent(event);
    } catch { /* ignore */ }
  }
}

// Song Recommendations
export const getSongRecommendations = (data) => request('/songs/recommendations', { method: 'POST', body: JSON.stringify(data) });

// Parser
export async function parseScorePhoto(file) {
  const formData = new FormData();
  formData.append('photo', file);
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/parser/score`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Parse failed');
  }
  return res.json();
}

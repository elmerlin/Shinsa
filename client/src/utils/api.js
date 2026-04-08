import { triggerPumpReactionHaptic } from './haptics';

const API_BASE = '/api';
let jacketMapCache = null;
let jacketMapPromise = null;
let chartKeyMapCache = null;
let chartKeyMapPromise = null;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(url, options = {}) {
  const { timeoutMs = 8000, headers, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...headers },
      ...fetchOptions,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — please try again');
    }
    throw err;
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
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — please try again');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function pumpRequestWithHaptic(url, options = {}) {
  const payload = await request(url, options);
  triggerPumpReactionHaptic(payload);
  return payload;
}

// Dashboard (combined)
export const getDashboard = () => request('/dashboard');

// i18n
export const getLocaleTranslations = (locale = 'ko') => request(`/i18n/translations?locale=${encodeURIComponent(locale)}`);
export const saveLocaleTranslation = ({ locale = 'ko', key, value, status = 'draft' }) => request(`/i18n/translations/${encodeURIComponent(key)}`, {
  method: 'PUT',
  body: JSON.stringify({ locale, value, status }),
});

// Tournaments
export const getTournaments = () => request('/tournaments');
export const getTournament = (id) => request(`/tournaments/${id}`);
export const createTournament = (data) => request('/tournaments', { method: 'POST', body: JSON.stringify(data) });
export const updateTournament = (id, data) => request(`/tournaments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTournament = (id) => request(`/tournaments/${id}`, { method: 'DELETE' });
export const searchTournaments = (q) => request(`/tournaments/search?q=${encodeURIComponent(q)}`);
export const getArchivedTournaments = () => request('/tournaments/archived');
export const archiveTournament = (id, archived) => request(`/tournaments/${id}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) });

// Tournament Discussion
export const getTournamentDiscussion = (id) => request(`/tournaments/${id}/discussion`);
export const sendTournamentDiscussionMessage = (id, data) => request(`/tournaments/${id}/discussion`, { method: 'POST', body: JSON.stringify(data) });
export const pumpTournamentDiscussionMessage = (id, messageId) => request(`/tournaments/${id}/discussion/${messageId}/pump`, { method: 'POST' });
export const deleteTournamentDiscussionMessage = (id, messageId) => request(`/tournaments/${id}/discussion/${messageId}`, { method: 'DELETE' });

// Phase management
export const getPhases = (tournamentId) => request(`/phases/tournament/${tournamentId}`);
export const createPhase = (data) => request('/phases', { method: 'POST', body: JSON.stringify(data) });
export const updatePhase = (id, data) => request(`/phases/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePhase = (id) => request(`/phases/${id}`, { method: 'DELETE' });
export const activatePhase = (id) => request(`/phases/${id}/activate`, { method: 'POST' });
export const completePhase = (id) => request(`/phases/${id}/complete`, { method: 'POST' });
export const generatePhaseMatches = (phaseId) => request(`/matches/phase/${phaseId}/generate`, { method: 'POST' });
export const getPhaseStandings = (phaseId) => request(`/phases/${phaseId}/standings`);

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

// Changelog
export const getChangelogEntries = () => request('/changelog');
export const createChangelogEntry = (data) => request('/changelog', { method: 'POST', body: JSON.stringify(data) });
export const updateChangelogEntry = (id, data) => request(`/changelog/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteChangelogEntry = (id) => request(`/changelog/${id}`, { method: 'DELETE' });

// Songs
export const getSongs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs${qs ? `?${qs}` : ''}`);
};
export const getAdminMissingSongDurations = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/admin/durations/missing${qs ? `?${qs}` : ''}`);
};
export const updateAdminSongDuration = ({ song_group_key, duration_seconds }) => request('/songs/admin/durations', {
  method: 'PUT',
  body: JSON.stringify({ song_group_key, duration_seconds }),
});
export const getJacketMap = () => {
  if (jacketMapCache) return Promise.resolve(jacketMapCache);
  if (jacketMapPromise) return jacketMapPromise;
  jacketMapPromise = request('/songs/jacket-map').then((map) => {
    jacketMapCache = map && typeof map === 'object' ? map : {};
    return jacketMapCache;
  }).finally(() => {
    jacketMapPromise = null;
  });
  return jacketMapPromise;
};
export const getChartKeyMap = () => {
  if (chartKeyMapCache) return Promise.resolve(chartKeyMapCache);
  if (chartKeyMapPromise) return chartKeyMapPromise;
  chartKeyMapPromise = request('/songs/chart-key-map').then((map) => {
    chartKeyMapCache = map && typeof map === 'object' ? map : {};
    return chartKeyMapCache;
  }).finally(() => {
    chartKeyMapPromise = null;
  });
  return chartKeyMapPromise;
};
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
export const setChartYoutubeLink = (chartId, youtubeUrl) =>
  request(`/songs/chart/${chartId}/youtube`, { method: 'PUT', body: JSON.stringify({ youtube_url: youtubeUrl }) });
export const removeChartYoutubeLink = (chartId) =>
  request(`/songs/chart/${chartId}/youtube`, { method: 'DELETE' });
export const getSongAnalytics = (userId) => request(`/songs/analytics/user/${userId}`);
export const getPlayerIdentitySummary = (userId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/analytics/identity/${userId}${qs ? `?${qs}` : ''}`);
};
export const getPlayerScoutingCard = (userId) =>
  request(`/songs/analytics/scouting-card/${encodeURIComponent(userId)}`);
export const getFantasyPool = (count = 10) =>
  request(`/songs/analytics/fantasy-pool?count=${count}`, { timeoutMs: 30000 });
export const getGradeGoals = (userId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/analytics/grade-goals/${userId}${qs ? `?${qs}` : ''}`);
};
export const getSkillBreakdown = (userId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/analytics/skill-breakdown/${userId}${qs ? `?${qs}` : ''}`);
};
export const getUserRankings = (userId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/analytics/rankings/${userId}${qs ? `?${qs}` : ''}`);
};
export const getLevelLeaderboard = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/analytics/level-leaderboard${qs ? `?${qs}` : ''}`);
};
export const getSongHeadToHead = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/analytics/head-to-head${qs ? `?${qs}` : ''}`);
};
export const getSongSniping = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/songs/analytics/sniping${qs ? `?${qs}` : ''}`);
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
export const getSongSkillInfo = (skillSlug) => request(`/songs/skill/${encodeURIComponent(skillSlug)}/info`);
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
export const createQrLoginChallenge = () => request('/auth/qr-login/challenges', { method: 'POST' });
export const getQrLoginChallenge = (challengeId) => request(`/auth/qr-login/challenges/${encodeURIComponent(challengeId)}`, {
  cache: 'no-store',
  headers: { 'Cache-Control': 'no-cache' },
});
export const approveQrLoginChallenge = (challengeId) => request(`/auth/qr-login/challenges/${encodeURIComponent(challengeId)}/approve`, {
  method: 'POST',
});
export const pollQrLoginChallenge = (challengeId, claimToken) => request(
  `/auth/qr-login/challenges/${encodeURIComponent(challengeId)}/poll`,
  {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      'X-QR-Claim-Token': claimToken,
    },
  }
);
export const getQrLoginChallengeQrUrl = (challengeId) => `${API_BASE}/auth/qr-login/challenges/${encodeURIComponent(challengeId)}/qr`;
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
export const getAdminFeatures = () => request('/auth/admin/features');
export const getAdminFeatureUsers = (featureKey) => request(`/auth/admin/features/${encodeURIComponent(featureKey)}/users`);
export const grantAdminFeatureUser = (featureKey, userId) => request(`/auth/admin/features/${encodeURIComponent(featureKey)}/users`, {
  method: 'POST',
  body: JSON.stringify({ user_id: userId }),
});
export const revokeAdminFeatureUser = (featureKey, userId) => request(`/auth/admin/features/${encodeURIComponent(featureKey)}/users/${encodeURIComponent(userId)}`, {
  method: 'DELETE',
});
export const getAdminGroups = () => request('/auth/admin/groups');
export const createAdminGroup = (data) => request('/auth/admin/groups', { method: 'POST', body: JSON.stringify(data) });
export const updateAdminGroup = (groupId, data) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});
export const deleteAdminGroup = (groupId) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
export const getAdminGroupMembers = (groupId) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}/members`);
export const addAdminGroupMember = (groupId, userId) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}/members`, {
  method: 'POST',
  body: JSON.stringify({ user_id: userId }),
});
export const removeAdminGroupMember = (groupId, userId) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
  method: 'DELETE',
});
export const moveAdminGroupMember = (groupId, userId, targetGroupId) => request(
  `/auth/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/move`,
  {
    method: 'POST',
    body: JSON.stringify({ target_group_id: targetGroupId }),
  }
);
export const getAdminGroupPermissions = (groupId) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}/permissions`);
export const setAdminGroupPermission = (groupId, featureKey, enabled) => request(
  `/auth/admin/groups/${encodeURIComponent(groupId)}/permissions/${encodeURIComponent(featureKey)}`,
  {
    method: 'PUT',
    body: JSON.stringify({ enabled: !!enabled }),
  }
);
export const notifyAdminGroup = (groupId, data) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}/notify`, {
  method: 'POST',
  body: JSON.stringify(data),
});
export const pushAdminGroupPopup = (groupId, data) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}/popup`, {
  method: 'POST',
  body: JSON.stringify(data),
});
export const getAdminGroupBadges = (groupId) => request(`/auth/admin/groups/${encodeURIComponent(groupId)}/badges`);
export async function createAdminGroupBadge(groupId, { name, description, imageFile }) {
  const formData = new FormData();
  formData.append('name', String(name || '').trim());
  formData.append('description', String(description || '').trim());
  if (imageFile) formData.append('image', imageFile);
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/auth/admin/groups/${encodeURIComponent(groupId)}/badges`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to create group badge');
  }
  return res.json();
}
export async function updateAdminGroupBadge(groupId, badgeId, { name, description, imageFile }) {
  const formData = new FormData();
  if (name !== undefined) formData.append('name', String(name || '').trim());
  if (description !== undefined) formData.append('description', String(description || '').trim());
  if (imageFile) formData.append('image', imageFile);
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/auth/admin/groups/${encodeURIComponent(groupId)}/badges/${encodeURIComponent(badgeId)}`, {
    method: 'PUT',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to update group badge');
  }
  return res.json();
}
export const deleteAdminGroupBadge = (groupId, badgeId) => request(
  `/auth/admin/groups/${encodeURIComponent(groupId)}/badges/${encodeURIComponent(badgeId)}`,
  { method: 'DELETE' }
);
export const assignAdminGroupBadgeToAll = (groupId, badgeId) => request(
  `/auth/admin/groups/${encodeURIComponent(groupId)}/badges/${encodeURIComponent(badgeId)}/assign-all`,
  { method: 'POST' }
);
export const removeAdminGroupBadgeFromAll = (groupId, badgeId) => request(
  `/auth/admin/groups/${encodeURIComponent(groupId)}/badges/${encodeURIComponent(badgeId)}/assign-all`,
  { method: 'DELETE' }
);
export const assignAdminGroupBadgeToUser = (groupId, badgeId, userId) => request(
  `/auth/admin/groups/${encodeURIComponent(groupId)}/badges/${encodeURIComponent(badgeId)}/assign/${encodeURIComponent(userId)}`,
  { method: 'POST' }
);
export const removeAdminGroupBadgeFromUser = (groupId, badgeId, userId) => request(
  `/auth/admin/groups/${encodeURIComponent(groupId)}/badges/${encodeURIComponent(badgeId)}/assign/${encodeURIComponent(userId)}`,
  { method: 'DELETE' }
);
export const consumeGroupPopup = () => request('/auth/group-popups/consume', { method: 'POST' });

// Achievements
export const getAdminAchievements = () => request('/auth/admin/achievements');
export const createAdminAchievementSeries = (data) => request('/auth/admin/achievements', { method: 'POST', body: JSON.stringify(data) });
export const updateAdminAchievementSeries = (seriesId, data) => request(`/auth/admin/achievements/${encodeURIComponent(seriesId)}`, {
  method: 'PUT', body: JSON.stringify(data),
});
export const deleteAdminAchievementSeries = (seriesId) => request(`/auth/admin/achievements/${encodeURIComponent(seriesId)}`, { method: 'DELETE' });
export async function createAdminAchievementTier(seriesId, { name, description, threshold, imageFile }) {
  const formData = new FormData();
  formData.append('name', String(name || '').trim());
  formData.append('description', String(description || '').trim());
  formData.append('threshold', String(threshold || ''));
  if (imageFile) formData.append('image', imageFile);
  const res = await fetch(`${API_BASE}/auth/admin/achievements/${encodeURIComponent(seriesId)}/tiers`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: formData,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to create tier'); }
  return res.json();
}
export async function updateAdminAchievementTier(seriesId, tierId, { name, description, threshold, imageFile }) {
  const formData = new FormData();
  if (name !== undefined) formData.append('name', String(name || '').trim());
  if (description !== undefined) formData.append('description', String(description || '').trim());
  if (threshold !== undefined) formData.append('threshold', String(threshold || ''));
  if (imageFile) formData.append('image', imageFile);
  const res = await fetch(`${API_BASE}/auth/admin/achievements/${encodeURIComponent(seriesId)}/tiers/${encodeURIComponent(tierId)}`, {
    method: 'PUT',
    headers: { ...getAuthHeaders() },
    body: formData,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to update tier'); }
  return res.json();
}
export const deleteAdminAchievementTier = (seriesId, tierId) => request(
  `/auth/admin/achievements/${encodeURIComponent(seriesId)}/tiers/${encodeURIComponent(tierId)}`,
  { method: 'DELETE' }
);
export const evaluateAchievements = (seriesKey) => request(`/auth/admin/achievements/evaluate/${encodeURIComponent(seriesKey)}`, { method: 'POST' });
export const getUserAchievements = (userId) => request(`/auth/user/${encodeURIComponent(userId)}/achievements`);

// Fun mini-game
export const getFunLeaderboard = (limit = 10) => request(`/fun/leaderboard?limit=${encodeURIComponent(limit)}`);
export const submitFunScore = (score) => request('/fun/score', { method: 'POST', body: JSON.stringify({ score }) });
export const getFunSettings = () => request('/fun/settings');
export const updateFunSettings = (data) => request('/fun/settings', { method: 'PUT', body: JSON.stringify(data) });
export const getShinsaInMotionData = () => request('/fun/shinsa-in-motion');

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
export const onlineDuelFetchScore = (id) => longRequest(`/online-duels/${id}/fetch-score`, { method: 'POST' });
export const onlineDuelEndRequest = (id) => request(`/online-duels/${id}/end-request`, { method: 'POST' });
export const onlineDuelCancelEnd = (id) => request(`/online-duels/${id}/cancel-end`, { method: 'POST' });
export const pumpPlayer = (id, player) => pumpRequestWithHaptic(`/online-duels/${id}/pump`, { method: 'POST', body: JSON.stringify({ player }) });
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
export const getPiugameRecentlyPlayed = (userId, options = {}) => {
  const params = new URLSearchParams();
  if (options.year) params.set('year', String(options.year));
  if (options.sort) params.set('sort', String(options.sort));
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return request(`/piugame/recently-played/${userId}${query ? `?${query}` : ''}`);
};
export const getPiugameTitles = (userId) => request(`/piugame/titles/${userId}`);
export const getPiugameTrainingLoad = (userId) => request(`/piugame/training-load/${userId}`);
export const getPiugameTrainingPopulation = (userId) => request(`/piugame/training-population/${userId}`);
export const getPiugameSyncStatus = (userId) => request(`/piugame/sync-status/${userId}`);
export const getPumbilityRecommendations = (userId, options = {}) => {
  const qs = new URLSearchParams();
  if (options.metric) qs.set('metric', String(options.metric));
  if (options.mode) qs.set('mode', String(options.mode));
  const query = qs.toString();
  return request(`/piugame/pumbility-recommendations/${userId}${query ? `?${query}` : ''}`);
};

// What To Play goal recommendations
export const getGoalRecommendations = (options = {}) => {
  const qs = new URLSearchParams();
  if (options.goal) qs.set('goal', String(options.goal));
  if (options.mode) qs.set('mode', String(options.mode));
  if (options.seed != null) qs.set('seed', String(options.seed));
  if (options.limit != null) qs.set('limit', String(options.limit));
  const query = qs.toString();
  return request(`/songs/recommendations/goals${query ? `?${query}` : ''}`);
};

// Private chart feedback (passability rating + note)
export const saveChartFeedback = (chartId, payload) =>
  request(`/songs/chart/${chartId}/feedback`, { method: 'PUT', body: JSON.stringify(payload) });

// YouTube Integration
export const getYoutubeConnectionStatus = () => request('/youtube/status');
export const startYoutubeConnection = (nextPath) => request('/youtube/connect/start', {
  method: 'POST',
  body: JSON.stringify({ next_path: nextPath }),
});
export const getYoutubeBroadcasts = () => request('/youtube/broadcasts');
export const deleteYoutubeConnection = () => request('/youtube/connection', { method: 'DELETE' });
export const getPumbilityRanking = () => request('/piugame/pumbility-ranking');
export const syncPumbilityRanking = () => longRequest('/piugame/sync/pumbility-ranking', { method: 'POST' });
export const getAdminOverRankingScheduler = () => request('/piugame/admin/over-ranking/scheduler');
export const getAdminPumbilityRankingScheduler = () => request('/piugame/admin/pumbility-ranking/scheduler');
export const getAdminOverRankingRuns = (params = {}) => {
  const query = new URLSearchParams();
  if (params.type) query.set('type', String(params.type));
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/piugame/admin/over-ranking/runs${qs ? `?${qs}` : ''}`);
};
export const getGlobalPumbilityLeaderboard = (params = {}) => {
  const query = new URLSearchParams();
  if (params.metric) query.set('metric', String(params.metric));
  if (params.sort_by) query.set('sort_by', String(params.sort_by));
  if (params.sort_order) query.set('sort_order', String(params.sort_order));
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/piugame/leaderboards/pumbility${qs ? `?${qs}` : ''}`);
};
export const getGlobalPumbilityPlayerSheet = (params = {}) => {
  const query = new URLSearchParams();
  if (params.player_name) query.set('player_name', String(params.player_name));
  if (params.user_id) query.set('user_id', String(params.user_id));
  if (params.metric) query.set('metric', String(params.metric));
  const qs = query.toString();
  return request(`/piugame/leaderboards/pumbility/player-sheet${qs ? `?${qs}` : ''}`);
};
export const getOver20Levels = () => request('/piugame/leaderboards/over20/levels');
export const getOver20ChartsByLevel = (level) => request(`/piugame/leaderboards/over20/charts?level=${encodeURIComponent(level)}`);
export const getOver20ChartTop100 = (chartKey) => request(`/piugame/leaderboards/over20/chart?chart_key=${encodeURIComponent(chartKey)}`);
export const getMyTop100Scores = (params = {}) => {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/piugame/leaderboards/my-top100-scores${qs ? `?${qs}` : ''}`);
};
export const getSyncProgress = () => request('/piugame/sync/progress');
export const getProfileShoes = (userId) => request(`/piugame/shoes/${userId}`);
export const getShoeTopStats = (limit = 24) => request(`/piugame/shoes/stats/top?limit=${encodeURIComponent(limit)}`);
export const getShoeUsersByModel = (shoeId) => request(`/piugame/shoes/stats/top/${encodeURIComponent(shoeId)}/users`);
export const searchProfileShoeCatalog = (q = '', limit = 6, page = 1) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (limit) params.set('limit', String(limit));
  if (page) params.set('page', String(page));
  const query = params.toString();
  return request(`/piugame/shoes/catalog${query ? `?${query}` : ''}`);
};
export const getAdminShoeCatalog = (params = {}) => {
  const query = new URLSearchParams();
  if (params.q) query.set('q', String(params.q));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.page) query.set('page', String(params.page));
  const qs = query.toString();
  return request(`/piugame/shoes/catalog/admin${qs ? `?${qs}` : ''}`);
};
export const deleteAdminShoeCatalogEntry = (catalogId) => request(`/piugame/shoes/catalog/admin/${encodeURIComponent(catalogId)}`, { method: 'DELETE' });
export const setAdminShoeCatalogDisplay = (catalogId) => request(`/piugame/shoes/catalog/admin/${encodeURIComponent(catalogId)}/display`, { method: 'POST' });
export const wearProfileShoe = (shoeId) => request(`/piugame/shoes/${shoeId}/wear`, { method: 'POST' });
export const retireProfileShoe = (shoeId) => request(`/piugame/shoes/${shoeId}/retire`, { method: 'POST' });
export const deleteProfileShoe = (shoeId) => request(`/piugame/shoes/${shoeId}`, { method: 'DELETE' });

export async function createProfileShoe({ make, model, colorway, photoFile, setCurrent = true, catalogId = null }) {
  const formData = new FormData();
  formData.append('make', String(make || '').trim());
  formData.append('model', String(model || '').trim());
  formData.append('colorway', String(colorway || '').trim());
  formData.append('set_current', setCurrent ? 'true' : 'false');
  if (catalogId !== null && catalogId !== undefined && String(catalogId).trim() !== '') {
    formData.append('catalog_id', String(catalogId));
  }
  if (photoFile) formData.append('photo', photoFile);

  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/piugame/shoes`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to create shoe');
  }
  return res.json();
}

export async function createAdminShoeCatalogEntry({ make, model, colorway, photoFile }) {
  const formData = new FormData();
  formData.append('make', String(make || '').trim());
  formData.append('model', String(model || '').trim());
  formData.append('colorway', String(colorway || '').trim());
  if (photoFile) formData.append('photo', photoFile);

  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/piugame/shoes/catalog/admin`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to create shoe catalog entry');
  }
  return res.json();
}

export async function updateAdminShoeCatalogEntry(catalogId, { make, model, colorway, photoFile }) {
  const formData = new FormData();
  formData.append('make', String(make || '').trim());
  formData.append('model', String(model || '').trim());
  formData.append('colorway', String(colorway || '').trim());
  if (photoFile) formData.append('photo', photoFile);

  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/piugame/shoes/catalog/admin/${encodeURIComponent(catalogId)}`, {
    method: 'PUT',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to update shoe catalog entry');
  }
  return res.json();
}

export async function updateProfileShoePhoto(shoeId, photoFile) {
  const formData = new FormData();
  if (photoFile) formData.append('photo', photoFile);

  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/piugame/shoes/${encodeURIComponent(shoeId)}/photo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to update shoe photo');
  }
  return res.json();
}

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

// Direct Messages
export const getMessageConversations = () => request('/messages/conversations');
export const getMessageConversation = (conversationId, { before = '', limit = 50 } = {}) => {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (limit !== 50) params.set('limit', String(limit));
  const qs = params.toString();
  return request(`/messages/conversations/${encodeURIComponent(conversationId)}${qs ? `?${qs}` : ''}`);
};
export const createMessageSquad = (data) => request('/messages/squads', {
  method: 'POST',
  body: JSON.stringify(data || {}),
});
export const getMessageSquad = (conversationId) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/squad`);
export const updateMessageSquad = (conversationId, data) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/squad`, {
  method: 'PUT',
  body: JSON.stringify(data || {}),
});
export const addMessageSquadMember = (conversationId, userId) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/squad/members`, {
  method: 'POST',
  body: JSON.stringify({ user_id: userId }),
});
export const removeMessageSquadMember = (conversationId, userId) => request(
  `/messages/conversations/${encodeURIComponent(conversationId)}/squad/members/${encodeURIComponent(userId)}`,
  {
    method: 'DELETE',
  }
);
export const setMessageSquadMemberRole = (conversationId, userId, role) => request(
  `/messages/conversations/${encodeURIComponent(conversationId)}/squad/members/${encodeURIComponent(userId)}/role`,
  {
    method: 'PUT',
    body: JSON.stringify({ role }),
  }
);
export const updateMessageSquadNotifications = (conversationId, data) => request(
  `/messages/conversations/${encodeURIComponent(conversationId)}/squad/notifications`,
  {
    method: 'PUT',
    body: JSON.stringify(data || {}),
  }
);
export const markMessageConversationRead = (conversationId) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/read`, {
  method: 'POST',
});
export const setMessageConversationTheme = (conversationId, theme) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/theme`, {
  method: 'PUT',
  body: JSON.stringify({ theme }),
});
export const sendTypingIndicator = (conversationId) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/typing`, {
  method: 'POST',
});
export const pinMessageConversation = (conversationId, pinned) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/pin`, {
  method: 'PUT',
  body: JSON.stringify({ pinned }),
});
export const sendMessageConversationStomp = (conversationId) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/stomp`, {
  method: 'POST',
});
export const sendMessageConversationNudge = (conversationId) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/nudge`, {
  method: 'POST',
});
export const setMessageConversationReaction = (conversationId, messageId, reaction) => request(
  `/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
  {
    method: 'POST',
    body: JSON.stringify({ reaction }),
  }
);
export const searchConversationMentions = (conversationId, q) => request(
  `/messages/conversations/${encodeURIComponent(conversationId)}/mentions?q=${encodeURIComponent(q)}`
).then((payload) => (Array.isArray(payload?.users) ? payload.users : []));
export const sendConversationMessage = (conversationId, data) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/messages`, {
  method: 'POST',
  body: JSON.stringify(data),
});
export const unsendConversationMessage = (conversationId, messageId) => request(`/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, {
  method: 'DELETE',
});
export const getOrCreateDirectConversation = (userId, data = null) => request(`/messages/direct/${encodeURIComponent(userId)}`, {
  method: 'POST',
  body: JSON.stringify(data || {}),
});
export const getMessageHighlights = () => request('/messages/highlights');
export const getMessageStory = (userId) => request(`/messages/highlights/${encodeURIComponent(userId)}/story`);
export const getSharedMessageStory = (userId, storyId, options = {}) => {
  const params = new URLSearchParams();
  const conversationId = String(options?.conversationId || '').trim();
  if (conversationId) params.set('conversationId', conversationId);
  const qs = params.toString();
  return request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/shared${qs ? `?${qs}` : ''}`);
};
export const getMessageStoryArchive = () => request('/messages/highlights/archive');
export const getMessageStoryArchivePaginated = ({ beforeDate, beforeId, limit } = {}) => {
  const params = new URLSearchParams();
  if (beforeDate) params.set('before_date', beforeDate);
  if (beforeId) params.set('before_id', beforeId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return request(`/messages/highlights/archive${qs ? `?${qs}` : ''}`);
};
export const getArchivedStoryEngagement = (storyId) => request(`/messages/highlights/archive/${encodeURIComponent(storyId)}/engagement`);
export const getArchivedStoryStats = (storyId) => request(`/messages/highlights/archive/${encodeURIComponent(storyId)}/stats`);
export const getArchivedStoryComments = (storyId) => request(`/messages/highlights/archive/${encodeURIComponent(storyId)}/comments`);
export const markMessageStoryViewed = (userId, storyId) => request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/view`, {
  method: 'POST',
});
export const getMessageStoryEngagement = (userId, storyId) => request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/engagement`);
export const toggleMessageStoryPump = (userId, storyId) => request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/pump`, {
  method: 'POST',
});
export const getMessageStoryComments = (userId, storyId) => request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/comments`);
export const addMessageStoryComment = (userId, storyId, content) => request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/comments`, {
  method: 'POST',
  body: JSON.stringify({ content }),
});
export const getMessageStoryStats = (userId, storyId) => request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/stats`);
export const archiveMessageStory = (userId, storyId) => request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/archive`, {
  method: 'POST',
});
export const deleteMessageStory = (userId, storyId) => request(`/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}`, {
  method: 'DELETE',
});
export const createMessageNote = (data) => request('/messages/highlights/note', {
  method: 'POST',
  body: JSON.stringify(data || {}),
});
export const clearMessageNote = () => request('/messages/highlights/note', {
  method: 'DELETE',
});
export const searchLiveSessionMentions = (sessionId, q) => request(
  `/live/sessions/${encodeURIComponent(sessionId)}/mentions?q=${encodeURIComponent(q)}`
).then((payload) => (Array.isArray(payload?.users) ? payload.users : []));
export async function createMessageStoryItem({
  storyType = 'image',
  caption = '',
  sourceKind = '',
  sourceId = '',
  snapshot = null,
  title = '',
  subtitle = '',
  linkPath = '',
  linkUrl = '',
  linkLabel = '',
  stickerTokens = [],
  imageFile = null,
} = {}) {
  const formData = new FormData();
  formData.append('story_type', String(storyType || '').trim() || 'image');
  if (caption) formData.append('caption', String(caption));
  if (sourceKind) formData.append('source_kind', String(sourceKind));
  if (sourceId) formData.append('source_id', String(sourceId));
  if (snapshot && typeof snapshot === 'object') formData.append('snapshot_json', JSON.stringify(snapshot));
  if (title) formData.append('title', String(title));
  if (subtitle) formData.append('subtitle', String(subtitle));
  if (linkPath) formData.append('link_path', String(linkPath));
  if (linkUrl) formData.append('link_url', String(linkUrl));
  if (linkLabel) formData.append('link_label', String(linkLabel));
  if (Array.isArray(stickerTokens) && stickerTokens.length > 0) {
    formData.append('sticker_tokens_json', JSON.stringify(stickerTokens));
  }
  if (imageFile) formData.append('image', imageFile);

  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/messages/highlights/story`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to add story item');
  }
  return res.json();
}

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
export const pumpPost = (id) => pumpRequestWithHaptic(`/social/posts/${id}/pump`, { method: 'POST' });
export const getPostPumpers = (id) => request(`/social/posts/${id}/pumps`);

// Social — Post Comments
export const getPostComments = (postId) => request(`/social/posts/${postId}/comments`);
export const addPostComment = (postId, content, parentId) => request(`/social/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deletePostComment = (id) => request(`/social/posts/comments/${id}`, { method: 'DELETE' });
export const togglePostComments = (postId) => request(`/social/posts/${postId}/comments-toggle`, { method: 'PATCH' });

// Social — Upscore Interactions
export const pumpUpscore = (id) => pumpRequestWithHaptic(`/social/upscores/${id}/pump`, { method: 'POST' });
export const getUpscorePumpers = (id) => request(`/social/upscores/${id}/pumps`);
export const getUpscoreComments = (upscoreId) => request(`/social/upscores/${upscoreId}/comments`);
export const addUpscoreComment = (upscoreId, content, parentId) => request(`/social/upscores/${upscoreId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deleteUpscoreComment = (id) => request(`/social/upscores/comments/${id}`, { method: 'DELETE' });

// Social — New Clear Interactions
export const pumpNewClear = (id) => pumpRequestWithHaptic(`/social/clears/${id}/pump`, { method: 'POST' });
export const getNewClearPumpers = (id) => request(`/social/clears/${id}/pumps`);
export const getNewClearComments = (clearId) => request(`/social/clears/${clearId}/comments`);
export const addNewClearComment = (clearId, content, parentId) => request(`/social/clears/${clearId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deleteNewClearComment = (id) => request(`/social/clears/comments/${id}`, { method: 'DELETE' });

// Social — Play Comments
export const getPlay = (playId) => request(`/social/plays/${playId}`);
export const lookupPlay = ({ song_title, mode, level, score, user_id }) => request(`/social/plays/lookup?song_title=${encodeURIComponent(song_title)}&mode=${encodeURIComponent(mode)}&level=${level}&score=${score}&user_id=${encodeURIComponent(user_id)}`);
export const getPlayComments = (playId) => request(`/social/plays/${playId}/comments`);
export const addPlayComment = (playId, content, parentId) => request(`/social/plays/${playId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deletePlayComment = (id) => request(`/social/plays/comments/${id}`, { method: 'DELETE' });

// Social — Comment Pumps
export const pumpComment = (type, commentId) => pumpRequestWithHaptic(`/social/comments/${type}/${commentId}/pump`, { method: 'POST' });

// Social — Individual Item Views
export const getPost = (id) => request(`/social/posts/${id}`);
export const getUpscore = (id) => request(`/social/upscores/${id}`);
export const getNewClear = (id) => request(`/social/clears/${id}`);

// Social — Feed
export const getFeed = (page) => request(`/social/feed?page=${page || 1}`);
export const getExploreFeed = ({ scope = 'following', cursor } = {}) => {
  const params = new URLSearchParams({ scope });
  if (cursor) params.set('cursor', cursor);
  return request(`/social/feed/explore?${params}`);
};
export const getRecentActivity = () => request('/social/recent-activity');
export const getDailyHighlights = () => request('/social/daily-highlights');

// ─── Weekly Challenges ──────────────────────────────
export const getWeeklyChallengesHome = () => request('/weekly-challenges/home');
export const getWeeklyChallengeWeeks = () => request('/weekly-challenges/weeks');
export const getWeeklyChallengeWeek = (weekKey, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/weekly-challenges/week/${weekKey}${qs ? `?${qs}` : ''}`);
};
export const getUserWeeklyChallengeHistory = (userId) =>
  request(`/weekly-challenges/users/${userId}/history`);
export const getUserWeeklyChallengePersonal = (userId, weekKey) =>
  request(`/weekly-challenges/users/${userId}/week/${weekKey}/personal`);
export const getWeeklyChallengeChartScores = (chartId) =>
  request(`/weekly-challenges/charts/${chartId}/scores`);

// ─── Weekly Challenge Play Posts ─────────────────────
export const getWeeklyChallengePlay = (id) => request(`/social/weekly-challenge-plays/${id}`);
export const lookupWeeklyChallengePlay = (weekId, userId) => request(`/social/weekly-challenge-plays/lookup?weekId=${encodeURIComponent(weekId)}&userId=${encodeURIComponent(userId)}`);
export const getWeeklyChallengePlayComments = (playId) => request(`/social/weekly-challenge-plays/${playId}/comments`);
export const addWeeklyChallengePlayComment = (playId, content, parentId) => request(`/social/weekly-challenge-plays/${playId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deleteWeeklyChallengePlayComment = (id) => request(`/social/weekly-challenge-plays/comments/${id}`, { method: 'DELETE' });
export const pumpWeeklyChallengePlay = (id) => pumpRequestWithHaptic(`/social/weekly-challenge-plays/${id}/pump`, { method: 'POST' });
export const getWeeklyChallengePlayPumpers = (id) => request(`/social/weekly-challenge-plays/${id}/pumps`);

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
export const pumpCommunityPost = (communityId, postId) => pumpRequestWithHaptic(`/communities/${communityId}/posts/${postId}/pump`, { method: 'POST' });
export const getCommunityPostPumpers = (communityId, postId) => request(`/communities/${communityId}/posts/${postId}/pumps`);
export const getCommunityPostComments = (communityId, postId) => request(`/communities/${communityId}/posts/${postId}/comments`);
export const addCommunityPostComment = (communityId, postId, content, parentId) => request(`/communities/${communityId}/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId || null }) });
export const deleteCommunityPostComment = (communityId, postId, commentId) => request(`/communities/${communityId}/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
export const pumpCommunityComment = (communityId, commentId) => pumpRequestWithHaptic(`/communities/${communityId}/comments/${commentId}/pump`, { method: 'POST' });

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

// Lists (server-backed)
export const getUserLists = () => request('/songs/lists');
export const createList = (name) => request('/songs/lists', { method: 'POST', body: JSON.stringify({ name }) });
export const deleteList = (listId) => request(`/songs/lists/${listId}`, { method: 'DELETE' });
export const addListItem = (listId, data) => request(`/songs/lists/${listId}/items`, { method: 'POST', body: JSON.stringify(data) });
export const removeListItem = (listId, itemId) => request(`/songs/lists/${listId}/items/${itemId}`, { method: 'DELETE' });
export const updateListItemTarget = (listId, itemId, target) => request(`/songs/lists/${listId}/items/${itemId}/target`, { method: 'PUT', body: JSON.stringify({ target }) });
export const renameList = (listId, name) => request(`/songs/lists/${listId}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const cloneList = (listId, name) => request(`/songs/lists/${listId}/clone`, { method: 'POST', body: JSON.stringify({ name }) });
export const reorderListItems = (listId, itemIds) => request(`/songs/lists/${listId}/reorder`, { method: 'PUT', body: JSON.stringify({ itemIds }) });
export const bulkAddListItems = (listId, items) => request(`/songs/lists/${listId}/bulk-items`, { method: 'POST', body: JSON.stringify({ items }) });

// Song Recommendations
export const getSongRecommendations = (data) => request('/songs/recommendations', { method: 'POST', body: JSON.stringify(data) });
export const getTrainingRecommendations = (options = {}) => {
  const params = new URLSearchParams();
  params.set('chart_mode', String(options.chart_mode || 'single'));
  if (options.min_level) params.set('min_level', String(options.min_level));
  if (options.max_level) params.set('max_level', String(options.max_level));
  return request(`/songs/recommendations/training?${params.toString()}`);
};

// Checkins & Venues
export const getVenues = () => request('/checkins/venues');
export const getVenueBySlug = (slug) => request(`/checkins/venue/${encodeURIComponent(slug)}`);
export const getActiveCheckins = (venueSlug) => request(`/checkins/active/${encodeURIComponent(venueSlug)}`);
export const checkin = (venue_id, machine_id, client_session_id = '') => request('/checkins/checkin', { method: 'POST', body: JSON.stringify({ venue_id, machine_id, client_session_id }) });
export const checkout = () => request('/checkins/checkout', { method: 'POST' });
export const getMyCheckinStatus = () => request('/checkins/my-status');
export const sendCheckinProximity = (data) => request('/checkins/proximity', { method: 'POST', body: JSON.stringify(data) });
export const getCheckinHistory = () => request('/checkins/history');
export const getUserCheckinHistory = (userId) => request(`/checkins/user/${userId}/history`);
export const getDojoOverview = (venueSlug = 'london-pump-dojo', params = {}) => {
  const query = new URLSearchParams();
  if (params.month) query.set('month', String(params.month));
  if (params.week_start) query.set('week_start', String(params.week_start));
  const qs = query.toString();
  return request(`/checkins/dojo/${encodeURIComponent(venueSlug)}/overview${qs ? `?${qs}` : ''}`);
};
export const getCheckinNotificationPreferences = (venueSlug) => request(`/checkins/notifications/${encodeURIComponent(venueSlug)}`);
export const updateCheckinNotificationPreferences = (venueSlug, data) => request(`/checkins/notifications/${encodeURIComponent(venueSlug)}`, { method: 'PUT', body: JSON.stringify(data) });
export const getVenueAccessNotificationPreferences = (venueSlug) => request(`/venue-access/notifications/${encodeURIComponent(venueSlug)}`);
export const updateVenueAccessNotificationPreferences = (venueSlug, data) => request(`/venue-access/notifications/${encodeURIComponent(venueSlug)}`, { method: 'PUT', body: JSON.stringify(data) });
export const setPlayingStatus = (status) => request('/checkins/playing-status', { method: 'PUT', body: JSON.stringify({ status }) });
export const clearPlayingStatus = () => request('/checkins/playing-status', { method: 'DELETE' });

// Live Sessions
export const getLiveSessions = (options = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return request(`/live/sessions${query ? `?${query}` : ''}`);
};
export const getProfileLiveSessions = (userId) => request(`/live/profile/${encodeURIComponent(userId)}`);
export const updateLiveSessionProfileVisibility = (sessionId, hidden) => request(`/live/sessions/${encodeURIComponent(sessionId)}/profile-visibility`, {
  method: 'PATCH',
  body: JSON.stringify({ hidden: !!hidden }),
});
export const deleteLiveSession = (sessionId) => request(`/live/sessions/${encodeURIComponent(sessionId)}`, {
  method: 'DELETE',
});
export const getMyLiveSession = () => request('/live/sessions/mine/active');
export const getHourOfPowerLeaderboard = (options = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return request(`/live/hop/leaderboard${query ? `?${query}` : ''}`);
};
export const getHourOfPowerAttempts = (options = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.user_id) params.set('user_id', String(options.user_id));
  const query = params.toString();
  return request(`/live/hop/attempts${query ? `?${query}` : ''}`);
};
export const getHourOfPowerOptimize = (options = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return request(`/live/hop/optimize${query ? `?${query}` : ''}`);
};
export const createLiveSession = (data) => request('/live/sessions', {
  method: 'POST',
  body: JSON.stringify(data),
  timeoutMs: 60000,
});
export const getLiveSession = (sessionId) => request(`/live/sessions/${encodeURIComponent(sessionId)}`);
export const updateLiveSession = (sessionId, data) => request(`/live/sessions/${encodeURIComponent(sessionId)}`, {
  method: 'PATCH',
  body: JSON.stringify(data),
});
export const addLiveSessionCohost = (sessionId, userId) => request(`/live/sessions/${encodeURIComponent(sessionId)}/cohosts`, {
  method: 'POST',
  body: JSON.stringify({ user_id: userId }),
});
export const removeLiveSessionCohost = (sessionId, userId) => request(
  `/live/sessions/${encodeURIComponent(sessionId)}/cohosts/${encodeURIComponent(userId)}`,
  {
    method: 'DELETE',
  }
);
export const leaveLiveSession = (sessionId) => request(`/live/sessions/${encodeURIComponent(sessionId)}/leave`, {
  method: 'POST',
  body: '{}',
});
export const createLiveOverlayToken = (sessionId) => request(`/live/sessions/${encodeURIComponent(sessionId)}/overlay-token`, {
  method: 'POST',
  body: '{}',
});
export function openLiveSessionStream(sessionId, providedToken = '') {
  const token = String(providedToken || '').trim() || localStorage.getItem('token');
  if (!token) throw new Error('Authentication required');
  return new EventSource(
    `${API_BASE}/live/sessions/${encodeURIComponent(sessionId)}/stream?token=${encodeURIComponent(token)}`
  );
}
export const sendLivePresence = (sessionId, data) => request(`/live/sessions/${encodeURIComponent(sessionId)}/presence`, {
  method: 'POST',
  body: JSON.stringify(data),
});
export const getLiveMessages = (sessionId) => request(`/live/sessions/${encodeURIComponent(sessionId)}/messages`);
export const sendLiveMessage = (sessionId, data) => request(`/live/sessions/${encodeURIComponent(sessionId)}/messages`, {
  method: 'POST',
  body: JSON.stringify(data),
});
export const pumpLiveMessage = (sessionId, messageId) => pumpRequestWithHaptic(
  `/live/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/pump`,
  {
    method: 'POST',
    body: '{}',
  }
);
export const syncLiveSession = (sessionId) => request(`/live/sessions/${encodeURIComponent(sessionId)}/sync`, {
  method: 'POST',
  body: '{}',
  timeoutMs: 60000,
});
export const getLiveYoutubeTimestamps = (sessionId) => request(`/live/sessions/${encodeURIComponent(sessionId)}/youtube-timestamps`);
export const publishLiveYoutubeTimestamps = (sessionId) => request(
  `/live/sessions/${encodeURIComponent(sessionId)}/youtube-timestamps/publish`,
  {
    method: 'POST',
    body: '{}',
    timeoutMs: 60000,
  }
);
export const sendLiveRequest = (sessionId, data) => request(`/live/sessions/${encodeURIComponent(sessionId)}/requests`, {
  method: 'POST',
  body: JSON.stringify(data),
});
export const setLiveRequestStatus = (sessionId, requestId, status) => request(
  `/live/sessions/${encodeURIComponent(sessionId)}/requests/${encodeURIComponent(requestId)}/status`,
  {
    method: 'POST',
    body: JSON.stringify({ status }),
  }
);
export const fulfillLiveRequest = (sessionId, requestId) => request(
  `/live/sessions/${encodeURIComponent(sessionId)}/requests/${encodeURIComponent(requestId)}/fulfill`,
  {
    method: 'POST',
    body: '{}',
  }
);
export const setLiveModeration = (sessionId, data) => request(`/live/sessions/${encodeURIComponent(sessionId)}/moderation`, {
  method: 'POST',
  body: JSON.stringify(data),
});
export const deleteLiveMessage = (sessionId, messageId) => request(
  `/live/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/delete`,
  {
    method: 'POST',
    body: '{}',
  }
);
export const createLiveVote = (sessionId, data) => request(`/live/sessions/${encodeURIComponent(sessionId)}/votes`, {
  method: 'POST',
  body: JSON.stringify(data),
});
export const castLiveVote = (voteId, optionId) => request(`/live/votes/${encodeURIComponent(voteId)}/cast`, {
  method: 'POST',
  body: JSON.stringify({ option_id: optionId }),
});
export const endLiveSession = (sessionId) => request(`/live/sessions/${encodeURIComponent(sessionId)}/end`, {
  method: 'POST',
  body: '{}',
  timeoutMs: 300000,
});

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

// ── Venue Access / Day Pass / Subscriptions ─────────────────────────────
export const getVenueAccessConfig = () => request('/venue-access/config');
export const getVenueAccessPlans = (venueSlug) => request(`/venue-access/plans/${encodeURIComponent(venueSlug)}`);
export const getMyVenueAccess = (venueSlug) => request(`/venue-access/my-access/${encodeURIComponent(venueSlug)}`);
export const getMyMembership = (venueSlug) => request(`/venue-access/my-membership/${encodeURIComponent(venueSlug)}`);
export const purchaseDayPass = (planId, passDate) => request('/venue-access/purchase/day-pass', { method: 'POST', body: JSON.stringify({ plan_id: planId, pass_date: passDate }) });
export const purchaseSubscription = (planId, cadenceKey) => request('/venue-access/purchase/subscription', {
  method: 'POST',
  body: JSON.stringify({ plan_id: planId, cadence_key: cadenceKey || undefined }),
});
export const cancelVenueSubscription = (subscriptionId) => request('/venue-access/cancel-subscription', { method: 'POST', body: JSON.stringify({ subscription_id: subscriptionId }) });
export const getMyVenuePayments = () => request('/venue-access/my-payments');

// Admin venue access
export const getAdminVenueAccessOverview = (venueSlug, month) => {
  const query = new URLSearchParams();
  if (month) query.set('month', String(month));
  const qs = query.toString();
  return request(`/venue-access/admin/overview/${encodeURIComponent(venueSlug)}${qs ? `?${qs}` : ''}`);
};
export const getAdminVenueAccessPlans = (venueSlug) => request(`/venue-access/admin/plans/${encodeURIComponent(venueSlug)}`);
export const createAdminVenueAccessPlan = (data) => request('/venue-access/admin/plans', { method: 'POST', body: JSON.stringify(data) });
export const updateAdminVenueAccessPlan = (planId, data) => request(`/venue-access/admin/plans/${planId}`, { method: 'PUT', body: JSON.stringify(data) });
export const getAdminVenueMembers = (venueSlug) => request(`/venue-access/admin/members/${encodeURIComponent(venueSlug)}`);
export const getAdminVenueMemberDetail = (venueSlug, userId) => request(`/venue-access/admin/member-details/${encodeURIComponent(venueSlug)}/${encodeURIComponent(userId)}`);
export const getAdminVenuePayments = (venueSlug, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/venue-access/admin/payments/${encodeURIComponent(venueSlug)}${qs ? `?${qs}` : ''}`);
};
export const adminGrantDayPass = (data) => request('/venue-access/admin/grant-day-pass', { method: 'POST', body: JSON.stringify(data) });
export const adminGrantSubscription = (data) => request('/venue-access/admin/grant-subscription', { method: 'POST', body: JSON.stringify(data) });
export const adminRevokeAccess = (type, id) => request(`/venue-access/admin/revoke/${type}/${id}`, { method: 'POST' });
export const getAdminVenueDiscounts = (venueSlug) => request(`/venue-access/admin/discounts/${encodeURIComponent(venueSlug)}`);
export const adminGrantDiscount = (data) => request('/venue-access/admin/discounts', { method: 'POST', body: JSON.stringify(data) });
export const adminRevokeDiscount = (discountId) => request(`/venue-access/admin/discounts/${discountId}`, { method: 'DELETE' });
export const getAdminApprovedUsers = (venueSlug) => request(`/venue-access/admin/approved-users/${encodeURIComponent(venueSlug)}`);
export const adminApproveUser = (data) => request('/venue-access/admin/approved-users', { method: 'POST', body: JSON.stringify(data) });
export const adminRemoveApprovedUser = (venueId, userId) => request(`/venue-access/admin/approved-users/${venueId}/${userId}`, { method: 'DELETE' });

// Pets (Tamagotchi)
export const getMyPet = () => request('/pets/me');
export const getPublicPet = (userId) => request(`/pets/user/${userId}`);
export const adoptPet = (character) => request('/pets/adopt', { method: 'POST', body: JSON.stringify({ character }) });
export const feedPet = (songs = 1) => request('/pets/feed', { method: 'POST', body: JSON.stringify({ songs }) });
export const getPetCharacters = () => request('/pets/characters');
export const getPetShop = () => request('/pets/shop');
export const buyPetFood = (foodId) => request('/pets/buy-food', { method: 'POST', body: JSON.stringify({ foodId }) });
export const buyPetItem = (itemId) => request('/pets/buy-item', { method: 'POST', body: JSON.stringify({ itemId }) });
export const buyPetToy = (toyId) => request('/pets/buy-toy', { method: 'POST', body: JSON.stringify({ toyId }) });
export const buyPetHabitatItem = (itemId) => request('/pets/buy-habitat-item', { method: 'POST', body: JSON.stringify({ itemId }) });
export const equipPetItem = (itemId) => request('/pets/equip', { method: 'POST', body: JSON.stringify({ itemId }) });
export const unequipPetSlot = (slot) => request('/pets/equip', { method: 'POST', body: JSON.stringify({ itemId: '', slot }) });
export const equipPetHabitat = (itemId, slot) => request('/pets/equip-habitat', { method: 'POST', body: JSON.stringify(itemId ? { itemId } : { itemId: '', slot }) });
export const setPetColor = (slot, color) => request('/pets/set-color', { method: 'POST', body: JSON.stringify({ slot, color }) });
export const togglePetAvatar = () => request('/pets/toggle-avatar', { method: 'POST' });
export const setPetTrainingPath = (pathId) => request('/pets/training-path', { method: 'POST', body: JSON.stringify({ pathId }) });
export const interactPet = (actionId) => request('/pets/interact', { method: 'POST', body: JSON.stringify({ actionId }) });
export const doPetActivity = (activityId) => request(`/pets/activities/${activityId}`, { method: 'POST' });
export const usePetToy = (toyId) => request(`/pets/toys/${toyId}/use`, { method: 'POST' });
export const claimPetMission = (missionId) => request(`/pets/missions/${missionId}/claim`, { method: 'POST' });
export const demandTrick = (trickId) => request(`/pets/tricks/${trickId}/demand`, { method: 'POST' });
export const performTrick = (trickId) => request(`/pets/tricks/${trickId}/perform`, { method: 'POST' });
export const renamePet = (nickname) => request('/pets/rename', { method: 'POST', body: JSON.stringify({ nickname }) });
export const getPetLeaderboard = () => request('/pets/leaderboard');
export const reactToPet = (targetUserId, reactionType) => request('/pets/social/react', { method: 'POST', body: JSON.stringify({ targetUserId, reactionType }) });
export const sendPetGift = (targetUserId, giftType, giftId, message) => request('/pets/social/gift', { method: 'POST', body: JSON.stringify({ targetUserId, giftType, giftId, message }) });
export const getPetSocialFeed = () => request('/pets/social/feed-summary');
export const ackCoach = (priority) => request('/pets/coach-ack', { method: 'POST', body: JSON.stringify({ priority }) });
export const getMiniPumpStats = () => request('/pets/minigames/mini-pump');
export const completeMiniPump = (results) => request('/pets/minigames/mini-pump/complete', { method: 'POST', body: JSON.stringify(results) });

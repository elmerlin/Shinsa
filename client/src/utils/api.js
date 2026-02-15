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
export const getUserStats = (id) => request(`/auth/user/${id}/stats`);
export const getInvitations = () => request('/auth/invitations');
export const respondInvitation = (id, status) => request(`/auth/invitations/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
export const sendInvitation = (data) => request('/auth/invite', { method: 'POST', body: JSON.stringify(data) });

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
export const onlineDuelSubmitScore = (id, data) => request(`/online-duels/${id}/submit-score`, { method: 'POST', body: JSON.stringify(data) });
export const onlineDuelEndRequest = (id) => request(`/online-duels/${id}/end-request`, { method: 'POST' });
export const onlineDuelCancelEnd = (id) => request(`/online-duels/${id}/cancel-end`, { method: 'POST' });

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

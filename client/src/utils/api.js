const API_BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

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

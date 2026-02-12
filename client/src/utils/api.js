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

// Players
export const getPlayers = (tournamentId) => request(`/players/tournament/${tournamentId}`);
export const getPlayer = (id) => request(`/players/${id}`);
export const createPlayer = (data) => request('/players', { method: 'POST', body: JSON.stringify(data) });
export const updatePlayer = (id, data) => request(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePlayer = (id) => request(`/players/${id}`, { method: 'DELETE' });

// Matches
export const getMatches = (tournamentId, filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return request(`/matches/tournament/${tournamentId}${params ? `?${params}` : ''}`);
};
export const getMatch = (id) => request(`/matches/${id}`);
export const generateSwissRound = (tournamentId) => request(`/matches/tournament/${tournamentId}/swiss-round`, { method: 'POST' });
export const drawCards = (matchId) => request(`/matches/${matchId}/draw`, { method: 'POST' });
export const vetoSong = (matchId, data) => request(`/matches/${matchId}/veto`, { method: 'POST', body: JSON.stringify(data) });
export const submitResult = (matchId, data) => request(`/matches/${matchId}/result`, { method: 'POST', body: JSON.stringify(data) });
export const generateKoth = (tournamentId) => request(`/matches/tournament/${tournamentId}/koth`, { method: 'POST' });
export const advanceKoth = (matchId) => request(`/matches/${matchId}/koth-advance`, { method: 'POST' });

// Songs
export const getSongs = (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return request(`/songs${params ? `?${params}` : ''}`);
};
export const getSongStats = () => request('/songs/stats');

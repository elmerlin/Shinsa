import type { ApiClient } from './client';
import type { DiscussionResponse, Match, Player, Tournament } from './types';

export function createTournamentsApi(client: ApiClient) {
  return {
    list() {
      return client.request<Tournament[]>('/api/tournaments');
    },
    get(id: string) {
      return client.request<Tournament>(`/api/tournaments/${id}`);
    },
    archived() {
      return client.request<Tournament[]>('/api/tournaments/archived');
    },
    matches(id: string) {
      return client.request<Match[]>(`/api/matches/tournament/${id}`);
    },
    players(id: string) {
      return client.request<Player[]>(`/api/players/tournament/${id}`);
    },
    discussion(id: string) {
      return client.request<DiscussionResponse>(`/api/tournaments/${id}/discussion`);
    },
  };
}

export type TournamentsApi = ReturnType<typeof createTournamentsApi>;

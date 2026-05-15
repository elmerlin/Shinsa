import type { ApiClient } from './client';
import type { DiscussionMessage, DiscussionResponse, Match, Player, Tournament, TournamentPhase } from './types';

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
    /** Phases for a tournament — one row per stage (round_robin / pools /
     *  single_elim / double_elim / gauntlet / hour_of_power / b15). */
    phases(id: string) {
      return client.request<TournamentPhase[]>(`/api/phases/tournament/${id}`);
    },
    discussion(id: string) {
      return client.request<DiscussionResponse>(`/api/tournaments/${id}/discussion`);
    },
    postDiscussion(id: string, message: string, parentId?: string | null) {
      // Server expects `message` (not `body`); response wraps the row
      // as `{ message: DiscussionMessage }`.
      return client.request<{ message: DiscussionMessage }>(`/api/tournaments/${id}/discussion`, {
        method: 'POST',
        body: { message, parent_id: parentId ?? null },
      });
    },
    pumpDiscussion(id: string, messageId: string) {
      return client.request<{ message: DiscussionMessage; pumped: boolean }>(
        `/api/tournaments/${id}/discussion/${messageId}/pump`,
        { method: 'POST' },
      );
    },
    deleteDiscussion(id: string, messageId: string) {
      return client.request<{ ok: true }>(`/api/tournaments/${id}/discussion/${messageId}`, {
        method: 'DELETE',
      });
    },
  };
}

export type TournamentsApi = ReturnType<typeof createTournamentsApi>;

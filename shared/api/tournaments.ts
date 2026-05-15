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
    /** Create a new tournament. Server requires auth + admin. Returns the
     *  freshly inserted row (with id), so the caller can navigate into
     *  /tournament/:id immediately. */
    create(payload: {
      name: string;
      location?: string;
      date?: string;
      avatar?: string;
      gif_avatar?: string;
      total_rounds?: number;
      config?: Record<string, unknown>;
    }) {
      return client.request<Tournament>('/api/tournaments', {
        method: 'POST',
        body: payload,
      });
    },
    /** Partial update — server uses COALESCE so only included fields change. */
    update(id: string, payload: Record<string, unknown>) {
      return client.request<Tournament>(`/api/tournaments/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: payload,
      });
    },
    /** Archive/un-archive — keeps the row + history, just toggles flag. */
    archive(id: string, archived = true) {
      return client.request<Tournament>(`/api/tournaments/${encodeURIComponent(id)}/archive`, {
        method: 'PUT',
        body: { archived: archived ? 1 : 0 },
      });
    },
    delete(id: string) {
      return client.request<void>(`/api/tournaments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },

    // ── Players ──
    /** Add a registered Shinsa user to a tournament. The server pulls
     *  player meta (avatar, skill_title, pumbility) from the user row. */
    addPlayer(payload: { tournament_id: string; user_id: string }) {
      return client.request<Player>('/api/players', { method: 'POST', body: payload });
    },
    removePlayer(playerId: string) {
      return client.request<void>(`/api/players/${encodeURIComponent(playerId)}`, {
        method: 'DELETE',
      });
    },

    // ── Phases ──
    createPhase(payload: {
      tournament_id: string;
      phase_order: number;
      format: string;
      name?: string;
      config?: Record<string, unknown>;
      advancement?: Record<string, unknown>;
    }) {
      return client.request<TournamentPhase>('/api/phases', { method: 'POST', body: payload });
    },
    updatePhase(id: string, payload: Record<string, unknown>) {
      return client.request<TournamentPhase>(`/api/phases/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: payload,
      });
    },
    deletePhase(id: string) {
      return client.request<void>(`/api/phases/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
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

import type { ApiClient } from './client';
import type {
  LiveDirectoryItem,
  LiveLastPlay,
  LiveSessionHost,
  LiveSessionMessage,
  LiveSessionPlay,
  LiveSessionSnapshot,
  LiveSessionSummary,
  LiveSessionSummaryPayload,
  LiveSessionsResponse,
} from './types';

export interface LiveSessionParticipantUpdate {
  participant: {
    user_id: string;
    role: string;
    status: string;
    username?: string;
    avatar?: string;
    nationality?: string;
  };
  message: LiveSessionMessage | null;
  snapshot: LiveSessionSnapshot;
}

export interface LiveSessionsParams {
  limit?: number;
}

/** Wrapper the server returns for ended sessions on the profile Live tab.
 *  Matches `buildProfileEndedSessionPayload` in server/routes/live.js. */
export interface ProfileEndedLiveSession {
  session: LiveSessionSummary;
  summary: LiveSessionSummaryPayload | null;
  hop: Record<string, unknown> | null;
  last_play: LiveSessionPlay | null;
  message_count: number;
  play_count: number;
}

export interface LiveProfileResponse {
  active_session: LiveDirectoryItem | null;
  ended_sessions: ProfileEndedLiveSession[];
}

export interface CreateLiveSessionPayload {
  title?: string;
  status_text?: string;
  session_type?: 'live' | 'hop' | string;
  stream_url?: string;
  is_unlisted?: boolean;
  youtube_broadcast_id?: string;
}

export interface LiveMessagesResponse {
  messages: LiveSessionMessage[];
}

export interface LivePresenceResponse {
  viewer_count: number;
  viewer_peak: number;
  ended?: boolean;
}

export function createLiveApi(client: ApiClient) {
  return {
    sessions(params: LiveSessionsParams = {}) {
      const search = new URLSearchParams();
      if (params.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<LiveSessionsResponse>(`/api/live/sessions${qs ? `?${qs}` : ''}`);
    },
    /** Full session state: header info + recent plays + summary aggregates +
     *  chat messages + requests. Use this for the live viewer screen. */
    session(sessionId: string) {
      return client.request<LiveSessionSnapshot>(`/api/live/sessions/${encodeURIComponent(sessionId)}`);
    },
    profile(userId: string) {
      return client.request<LiveProfileResponse>(`/api/live/profile/${encodeURIComponent(userId)}`);
    },
    /** The current user's active session if they're hosting one. Returns
     *  `{ session: null }` if there's nothing to resume into. */
    myActiveSession() {
      return client.request<{ session: LiveSessionSnapshot['session'] | null }>(`/api/live/sessions/mine/active`);
    },
    /** Start a new live session. Server auto-titles it `${username} live
     *  session` if no title is provided. Returns the freshly inserted row. */
    createSession(payload: CreateLiveSessionPayload = {}) {
      return client.request<{ session: { id: string; title?: string; session_type?: string } }>(`/api/live/sessions`, {
        method: 'POST',
        body: payload,
      });
    },
    /** End the session (host only). Marks `ended_at`, broadcasts a
     *  `session_end` chat message, and freezes the recap. */
    endSession(sessionId: string) {
      return client.request<{ ok: boolean }>(`/api/live/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
    },
    sessionMessages(sessionId: string) {
      return client.request<LiveMessagesResponse>(`/api/live/sessions/${encodeURIComponent(sessionId)}/messages`);
    },
    /** Post a chat message. The server enforces 500-char cap + mute-check. */
    sendMessage(sessionId: string, message: string) {
      return client.request<{ message: LiveSessionMessage }>(`/api/live/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        body: { message },
      });
    },
    /** Heartbeat to keep the viewer counted. Server bumps the viewer count + peak
     *  and decays presence after ~30s of silence. */
    sessionPresence(sessionId: string) {
      return client.request<LivePresenceResponse>(`/api/live/sessions/${encodeURIComponent(sessionId)}/presence`, {
        method: 'POST',
        body: { session_id: sessionId },
      });
    },
    /** Host invites a user as a co-host. Server adds them to the
     *  participants list with role='cohost', status='active'. */
    addCohost(sessionId: string, userId: string) {
      return client.request<LiveSessionParticipantUpdate>(`/api/live/sessions/${encodeURIComponent(sessionId)}/cohosts`, {
        method: 'POST',
        body: { user_id: userId },
      });
    },
    /** Host removes a co-host. Server marks the participant as `left`. */
    removeCohost(sessionId: string, userId: string) {
      return client.request<LiveSessionParticipantUpdate>(
        `/api/live/sessions/${encodeURIComponent(sessionId)}/cohosts/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      );
    },
    /** Active co-host self-leaves the session. */
    leaveSession(sessionId: string) {
      return client.request<LiveSessionParticipantUpdate>(`/api/live/sessions/${encodeURIComponent(sessionId)}/leave`, {
        method: 'POST',
        body: {},
      });
    },

    /** Hour-of-Power global leaderboard (sorted by best HoP total rating). */
    hopLeaderboard(params: { limit?: number } = {}) {
      const search = new URLSearchParams();
      if (params.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<HopLeaderboardResponse>(`/api/live/hop/leaderboard${qs ? `?${qs}` : ''}`);
    },

    /** Recent HoP attempts for one player (defaults to current user). */
    hopAttempts(params: { user_id?: string; limit?: number } = {}) {
      const search = new URLSearchParams();
      if (params.user_id) search.set('user_id', params.user_id);
      if (params.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<HopAttemptsResponse>(`/api/live/hop/attempts${qs ? `?${qs}` : ''}`);
    },
  };
}

// --- Hour of Power ---

export interface HopLeaderboardRow {
  user_id: string;
  username: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
  /** Rank assigned client-side after fetch — server returns sorted but unranked. */
  rank?: number;
  /** Best HoP attempt total rating points for this player. */
  best_total_rating_points: number;
  best_average_rating_points?: number;
  best_average_level?: number;
  best_session_id?: string;
  best_attempt_started_at?: string;
  completed_attempts?: number;
}

export interface HopLeaderboardResponse {
  rows: HopLeaderboardRow[];
  current_user?: { rank?: number; row?: HopLeaderboardRow | null } | null;
}

export interface HopAttemptRow {
  session_id: string;
  user_id: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
  title?: string;
  /** True once the HoP window finished. */
  completed: boolean;
  /** True if the attempt qualifies for the global leaderboard. */
  leaderboard_eligible: boolean;
  started_at?: string;
  ended_at?: string;
  warmup_started_at?: string;
  session_duration_minutes?: number;
  counted_clear_count: number;
  total_rating_points: number;
  average_rating_points?: number;
  average_level?: number;
  highest_rating_points?: number;
  lowest_rating_points?: number;
  live_url?: string;
}

export interface HopAttemptsResponse {
  user_id: string;
  attempts: HopAttemptRow[];
}

export type LiveApi = ReturnType<typeof createLiveApi>;
export type { LiveDirectoryItem, LiveSessionsResponse, LiveLastPlay, LiveSessionHost };

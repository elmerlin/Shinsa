import type { ApiClient } from './client';
import type {
  LiveDirectoryItem,
  LiveLastPlay,
  LiveSessionHost,
  LiveSessionMessage,
  LiveSessionSnapshot,
  LiveSessionSummary,
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

export interface LiveProfileResponse {
  active_session: LiveDirectoryItem | null;
  ended_sessions: LiveSessionSummary[];
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
  };
}

export type LiveApi = ReturnType<typeof createLiveApi>;
export type { LiveDirectoryItem, LiveSessionsResponse, LiveLastPlay, LiveSessionHost };

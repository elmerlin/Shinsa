import type { ApiClient } from './client';

/**
 * Current state of the signed-in user's YouTube channel connection.
 * `configured` reports whether the server even has OAuth credentials set up;
 * `linked` reports whether THIS user has completed the OAuth handshake.
 */
export interface YoutubeConnectionStatus {
  /** True when the server has YouTube OAuth env vars set. */
  configured: boolean;
  /** True when the current user has stored OAuth tokens. */
  linked: boolean;
  channel_id: string;
  channel_title: string;
  channel_thumbnail_url: string;
  /** Last time the token was refreshed / saved. */
  updated_at: string | null;
  /** When the current access token expires (the server refreshes silently). */
  token_expires_at?: string | null;
  /** Most recent OAuth/API error, if any. */
  last_error: string;
}

export interface YoutubeConnectStartResponse {
  /** Full Google OAuth URL to open in a browser / WebBrowser session. */
  auth_url: string;
}

/** Path Google redirects back to after consent. Web sends `/account?tab=youtube`;
 *  mobile sends a deep link (e.g. `shinsa://youtube-callback`) so the in-app
 *  browser closes and returns control to the app. */
export interface YoutubeConnectStartPayload {
  next_path: string;
}

/** A live broadcast on the user's channel — used to attach a stream to a
 *  live session without pasting a URL. */
export interface YoutubeBroadcast {
  id: string;
  video_id: string;
  title: string;
  life_cycle_status: string;
  privacy_status: string;
  is_live_now: boolean;
  scheduled_start_time: string;
  actual_start_time: string;
  stream_url: string;
}

export function createYoutubeApi(client: ApiClient) {
  return {
    status() {
      return client.request<YoutubeConnectionStatus>('/api/youtube/status');
    },
    /** The user's live broadcasts (live now + upcoming/ready), newest-relevant
     *  first. Empty when not linked. */
    broadcasts() {
      return client.request<{ broadcasts: YoutubeBroadcast[] }>('/api/youtube/broadcasts');
    },
    /** Kick off the OAuth handshake. Caller is responsible for opening the
     *  returned `auth_url` in a browser session and awaiting the redirect
     *  back to `next_path`. */
    connectStart(payload: YoutubeConnectStartPayload) {
      return client.request<YoutubeConnectStartResponse>('/api/youtube/connect/start', {
        method: 'POST',
        body: payload,
      });
    },
    disconnect() {
      return client.request<{ success: boolean }>('/api/youtube/connection', {
        method: 'DELETE',
      });
    },
  };
}

export type YoutubeApi = ReturnType<typeof createYoutubeApi>;

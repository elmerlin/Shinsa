import type { ApiClient } from './client';
import type { AuthResponse, LoginPayload, RegisterPayload, User } from './types';

export function createAuthApi(client: ApiClient) {
  return {
    login(body: LoginPayload) {
      return client.request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body,
      });
    },
    register(body: RegisterPayload) {
      return client.request<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body,
      });
    },
    me() {
      return client.request<User>('/api/auth/me');
    },
    /** Update the signed-in user's editable profile fields. Server uses
     *  `COALESCE`, so only the fields you include in the payload get changed —
     *  passing partial updates is safe. */
    updateMe(payload: UpdateMePayload) {
      return client.request<User>('/api/auth/me', {
        method: 'PUT',
        body: payload,
      });
    },
    /** Typeahead search for registered users. Returns up to 10 matches sorted
     *  with exact matches first, then prefix, then substring. */
    searchUsers(q: string) {
      return client.request<User[]>(`/api/auth/search?q=${encodeURIComponent(q)}`);
    },
    /** Public profile by user_id. */
    getUser(id: string) {
      return client.request<User>(`/api/auth/user/${encodeURIComponent(id)}`);
    },
    /** Public profile by username. */
    getUserByUsername(username: string) {
      const clean = String(username || '').trim().replace(/^@+/, '');
      return client.request<User>(`/api/auth/user/username/${encodeURIComponent(clean)}`);
    },
    /** Tournament/duel competition stats for a user. */
    getUserStats(id: string) {
      return client.request<UserStats>(`/api/auth/user/${encodeURIComponent(id)}/stats`);
    },
    /** Activity timeline (posts, upscores, clears) for a user. */
    getUserActivity(id: string) {
      return client.request<UserActivityItem[]>(`/api/auth/user/${encodeURIComponent(id)}/activity`);
    },
    getUserAchievements(id: string) {
      return client.request<{ achievements: UserAchievement[] }>(`/api/auth/user/${encodeURIComponent(id)}/achievements`);
    },
    /** Public pet for the avatar modal. */
    getPublicPet(id: string) {
      return client.request<{ pet: Record<string, unknown> | null; username?: string }>(`/api/pets/user/${encodeURIComponent(id)}`);
    },
  };
}

/**
 * Editable subset of the User shape. All fields optional — server uses
 * `COALESCE` so omitting a key leaves the existing value untouched. Match
 * the columns enumerated in `server/routes/auth.js#PUT /me`.
 */
export interface UpdateMePayload {
  /** Either a `/avatars/<filename>` preset path or a `data:image/...;base64,...` URL. */
  avatar?: string;
  email?: string;
  skill_title?: string;
  skill_level?: number;
  /** 'male' | 'female' | 'other' (free-form on server). */
  gender?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. 'JP', 'US'. */
  nationality?: string;
  /** YYYY-MM-DD. */
  date_of_birth?: string;
  show_age?: boolean;
  /** Free-form bio. */
  description?: string;
  age?: number;
  height_cm?: number;
  weight_kg?: number;
  location_country?: string;
  location_country_code?: string;
  location_city?: string;
  location_lat?: number;
  location_lng?: number;
  timezone?: string;
}

export interface UserAchievement {
  tier_id?: number | string;
  series_id?: number | string;
  series_key?: string;
  series_name?: string;
  name?: string;
  description?: string;
  image?: string;
  threshold?: number;
  awarded_at?: string;
  current_value?: number;
  next_tier?: {
    name?: string;
    description?: string;
    image?: string;
    threshold?: number;
  } | null;
  [key: string]: unknown;
}

export interface TournamentParticipation {
  tournament: {
    id?: number | string;
    tournament_id?: string;
    user_id?: string;
    name?: string;
    tournament_name?: string;
    tournament_phase?: string;
    tournament_date?: string;
    tournament_avatar?: string;
    [key: string]: unknown;
  };
  matches: Array<{
    id?: number | string;
    tournament_id?: string;
    player1_id?: string;
    player2_id?: string;
    player1_name?: string;
    player2_name?: string;
    round_number?: number;
    [key: string]: unknown;
  }>;
}

export interface DuelStat {
  duel: Record<string, unknown>;
  songs: Record<string, unknown>[];
}

export interface UserStats {
  tournamentPlayers: TournamentParticipation[];
  duelStats: DuelStat[];
  onlineDuelStats: DuelStat[];
}

export interface UserActivityItem {
  type?: string;
  /** Coarse-grained bucket used to filter the activity feed. Values:
   *  'posts' | 'comments' | 'scores' | 'competitions' | 'community'. */
  category?: string;
  message?: string;
  link?: string;
  created_at?: string;
  [key: string]: unknown;
}

export type AuthApi = ReturnType<typeof createAuthApi>;

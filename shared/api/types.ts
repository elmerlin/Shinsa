/**
 * Auth-related types mirrored from server's toClientAuthUser shape.
 * Loose by design — server adds many derived fields. Tighten as consumers use them.
 */
export interface User {
  id: string;
  username: string;
  is_admin?: boolean | number;
  email?: string;
  avatar?: string;
  avatar_v?: number;
  pumbility?: number;
  skill_title?: string;
  skill_level?: number;
  description?: string;
  nationality?: string;
  timezone?: string;
  playing_status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  email?: string;
  avatar?: string;
  skill_title?: string;
  skill_level?: number;
  gender?: string;
  nationality?: string;
  date_of_birth?: string;
  show_age?: boolean;
  description?: string;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  location_country?: string;
  location_country_code?: string;
  location_city?: string;
  location_lat?: number | null;
  location_lng?: number | null;
  timezone?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

// --- Domain types ---

export interface Tournament {
  id: string;
  name: string;
  location?: string;
  date?: string;
  phase?: string;
  current_round?: number;
  total_rounds?: number;
  config?: Record<string, unknown>;
  avatar?: string;
  archived?: boolean | number;
  created_at?: string;
  [key: string]: unknown;
}

export interface Duel {
  id: string;
  name?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface Notice {
  id: string | number;
  title?: string;
  body?: string;
  pinned?: boolean | number;
  created_at?: string;
  [key: string]: unknown;
}

export interface DashboardResponse {
  tournaments: Tournament[];
  duels: Duel[];
  notices: Notice[];
}

/**
 * NOTE: `/api/songs` actually returns chart-level rows (each row = one mode+level
 * variant of a song). The `id` field is the underlying chart_id.
 */
export interface Song {
  id: number;
  title: string;
  artist: string;
  jacket_url?: string;
  mode?: string;
  level?: number;
  bpm?: string;
  song_key?: string;
  flags?: string;
  duration_seconds?: number;
  duration_source?: string;
  duration_updated_at?: string;
  [key: string]: unknown;
}

export interface ChartSkill {
  slug: string;
  name: string;
  source?: string;
}

export interface Chart {
  chart_id: number;
  key?: string;
  title: string;
  artist: string;
  mode?: string;
  level?: number;
  jacket_url?: string;
  bpm?: string;
  song_key?: string;
  flags?: string;
  duration_seconds?: number;
  duration_source?: string;
  duration_updated_at?: string;
  skills?: ChartSkill[];
  [key: string]: unknown;
}

export interface ChartUserSummary {
  best_score?: number | null;
  best_grade?: string;
  is_pass?: boolean;
  is_stage_break?: boolean;
  [key: string]: unknown;
}

export interface ChartDetailResponse {
  chart: Chart;
  user_summary: ChartUserSummary | null;
  user_youtube_url?: string;
  user_session_youtube_url?: string;
  progression?: unknown[];
  history?: unknown[];
  friend_records?: unknown[];
}

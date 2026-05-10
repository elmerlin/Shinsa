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

/**
 * Tournament. NOTE: list endpoint returns `config` as serialized JSON string;
 * detail endpoint returns it as an object. Consumers should be defensive.
 */
export interface Tournament {
  id: string;
  name: string;
  location?: string;
  date?: string;
  phase?: string;
  current_round?: number;
  total_rounds?: number;
  config?: string | Record<string, unknown>;
  avatar?: string;
  archived?: boolean | number;
  created_at?: string;
  current_phase_id?: string | null;
  poster_bg?: string;
  gif_avatar?: string;
  placement_snapshots?: unknown;
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

export interface Match {
  id: string;
  tournament_id: string;
  round_number?: number;
  player1_id?: string | null;
  player2_id?: string | null;
  winner_id?: string | null;
  difficulty_min?: number;
  difficulty_max?: number;
  is_bye?: boolean | number;
  status?: string;
  drawn_songs?: Song[];
  [key: string]: unknown;
}

export interface Player {
  id: string;
  tournament_id?: string;
  name: string;
  skill_title?: string;
  skill_level?: number;
  pumbility?: number;
  description?: string;
  avatar?: string;
  gender?: string;
  wins?: number;
  losses?: number;
  points?: number;
  buchholz?: number;
  seed_rank?: number;
  is_active?: boolean | number;
  created_at?: string;
  user_id?: string;
  nationality?: string;
  eliminated_at_phase?: string;
  [key: string]: unknown;
}

export interface DiscussionMessage {
  id: string;
  tournament_id?: string;
  user_id?: string;
  parent_id?: string | null;
  username?: string;
  avatar?: string;
  body?: string;
  created_at?: string;
  pumps?: number;
  pumped_by_viewer?: boolean;
  [key: string]: unknown;
}

export interface DiscussionResponse {
  threads: DiscussionMessage[];
  viewer_count?: number;
}

// --- Social ---

/**
 * Post — the most common feed item. The `images` field is sometimes a
 * JSON-encoded string (`"[]"` or stringified array) and sometimes already an
 * array; consumers should normalize.
 */
export interface Post {
  id: string;
  user_id?: string;
  content?: string;
  images?: string | string[];
  youtube_url?: string;
  comments_disabled?: boolean | number;
  is_pinned?: boolean | number;
  created_at?: string;
  updated_at?: string | null;
  post_kind?: string | null;
  community_id?: string;
  username?: string;
  avatar?: string;
  user_avatar?: string;
  nationality?: string;
  pump_count?: number;
  comment_count?: number;
  user_pumped?: boolean | number;
  [key: string]: unknown;
}

export interface Comment {
  id: string;
  post_id?: string;
  user_id?: string;
  parent_id?: string | null;
  content?: string;
  username?: string;
  avatar?: string;
  created_at?: string;
  pump_count?: number;
  user_pumped?: boolean | number;
  [key: string]: unknown;
}

/**
 * Feed items are heterogeneous: `type` discriminates between post / upscore /
 * clear / weekly_challenge. v1 renders posts richly and other types as compact
 * activity rows.
 */
export type FeedItemType = 'post' | 'upscore' | 'clear' | 'weekly_challenge';

export interface FeedItem {
  type: FeedItemType;
  id: string | number;
  user_id?: string;
  username?: string;
  avatar?: string;
  created_at?: string;
  pump_count?: number;
  // post
  content?: string;
  images?: string | string[];
  youtube_url?: string;
  comment_count?: number;
  user_pumped?: boolean | number;
  post_kind?: string | null;
  // upscore
  upscores_json?: string;
  pumbility_gain?: number;
  singles_pumbility_gain?: number;
  [key: string]: unknown;
}

// --- Pump response (toggling a pump on a feed item) ---

export interface PumpResponse {
  pumped: boolean;
  pump_count: number;
}

// --- Daily Highlights (Dashboard top-replays strip) ---

export interface ReplayHighlight {
  id: number;
  user_id?: string;
  song_title?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
  plate?: string;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  replay_embed_url?: string;
  replay_video_id?: string;
  replay_start_seconds?: number;
  replay_end_seconds?: number;
  background_url?: string;
  date_played?: string;
  machine_name?: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  comment_count?: number;
  play_id?: number;
  [key: string]: unknown;
}

export interface DailyHighlights {
  mixTape: unknown | null;
  topReplays: ReplayHighlight[];
}

// --- Weekly Challenges home ---

export interface WeeklyChallengeWeek {
  week_key: string;
  starts_at_utc?: string;
  ends_at_utc?: string;
  status?: string;
  chart_count?: number;
  challenge_max_level?: number;
}

export interface WeeklyChallengeAward {
  award_key: 'overall' | 'singles' | string;
  award_label?: string;
  rank: number;
  user_id?: string;
  username_snapshot?: string;
  avatar_snapshot?: string;
  nationality_snapshot?: string;
  points?: number;
  clears?: number;
  pg_bonus_points?: number;
  pg_bonus_count?: number;
}

export interface WeeklyChallengesHome {
  week: WeeklyChallengeWeek;
  participantCount: number;
  awards: WeeklyChallengeAward[];
}

// --- Song of the Week ---

export interface SongOfWeekItem {
  id: number;
  user_id?: string;
  week_key?: string;
  chart_id?: number;
  song_title_snapshot?: string;
  artist_snapshot?: string;
  mode?: string;
  level?: number;
  jacket_url_snapshot?: string;
  caption?: string;
  linked_play_id?: number | null;
  created_at?: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  comment_count?: number;
  [key: string]: unknown;
}

// --- Activity feed (used by Dashboard's Recent Activity strip) ---

export type ActivityType =
  | 'new_user'
  | 'upscore'
  | 'new_clear'
  | 'new_post'
  | 'new_tournament'
  | 'new_duel'
  | 'new_online_duel'
  | 'tournament_win'
  | 'duel_win'
  | 'online_duel_win'
  | string;

export interface ActivityItem {
  type: ActivityType;
  /** Pre-formatted message — server returns a human-friendly string. */
  message: string;
  /** Web URL to navigate to (we map to mobile route or leave as no-op). */
  link?: string;
  user_id?: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  created_at?: string;
  [key: string]: unknown;
}

// --- Communities ---

export interface Community {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  owner_id?: string;
  is_invite_only?: boolean | number;
  badge_text?: string;
  badge_color?: string;
  badge_text_color?: string;
  created_at?: string;
  about?: string;
  location_country?: string;
  rules?: string;
  index_tags?: string | string[];
  owner_username?: string;
  owner_avatar?: string;
  member_count?: number;
  posts_last_week?: number;
  [key: string]: unknown;
}

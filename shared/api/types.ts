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
  user?: {
    id?: string;
    username?: string;
    avatar?: string;
  } | null;
  best?: ChartBest | null;
  highest_replay?: ChartReplayLink | null;
  [key: string]: unknown;
}

export interface ChartBest {
  id?: number | string;
  source?: 'best' | 'recent' | string;
  score?: number;
  grade?: string;
  plate?: string;
  rating?: number;
  is_pass?: boolean;
  is_stage_break?: boolean;
  date_played?: string;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  [key: string]: unknown;
}

export interface ChartReplayLink {
  url?: string;
  score?: number;
  grade?: string;
  play_id?: number | string;
  [key: string]: unknown;
}

export interface ChartHistoryEntry {
  id: number | string;
  source: string;
  score: number;
  grade: string;
  plate?: string;
  is_pass: boolean;
  is_stage_break: boolean;
  date_played: string;
  rating?: number;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
}

export interface ChartProgressionPoint {
  idx: number;
  score: number;
  grade: string;
  is_pass: boolean;
  is_stage_break: boolean;
  date_played: string;
  label: string;
}

export interface ChartFriendRecord {
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  best: ChartBest;
  highest_replay?: ChartReplayLink | null;
  youtube_url?: string;
  session_youtube_url?: string;
}

export interface ChartDetailResponse {
  chart: Chart;
  user_summary: ChartUserSummary | null;
  user_youtube_url?: string;
  user_session_youtube_url?: string;
  progression?: ChartProgressionPoint[];
  history?: ChartHistoryEntry[];
  friend_records?: ChartFriendRecord[];
}

export type PumpPadSide = 'left' | 'right';
export type PumpPanel = 'topLeft' | 'topRight' | 'center' | 'bottomLeft' | 'bottomRight';

export interface StepCue {
  id: string;
  songId?: string;
  chartId?: number;
  timeMs: number;
  beat?: number;
  panel: PumpPanel;
  side?: PumpPadSide;
  expectedFoot?: 'left' | 'right';
}

export interface ChartTimingResponse {
  chart: {
    chart_id: number;
    title: string;
    artist: string;
    mode: 'Single' | 'Double' | string;
    level: number;
  };
  source: {
    type: 'chart-editor-preset';
    file: string;
    title: string;
    artist: string;
  };
  stepCues: StepCue[];
}

/** Player scouting card — the tournament Poster / Profile uses this to
 *  display attribute bars, competitive levels, specialties, and a
 *  signature blurb summarizing the player's style. Server endpoint:
 *  `GET /api/songs/analytics/scouting-card/:userId`. */
export interface ScoutingCard {
  user: {
    id: string;
    username: string;
    avatar: string;
    nationality: string;
    skillTitle: string;
  };
  benchmark?: {
    key?: string;
    label?: string;
    source?: string;
    doublesPartial?: boolean;
    cohortSize?: number;
  } | null;
  ratings?: {
    overall?: { score100?: number };
    singles?: { score100?: number };
    doubles?: { score100?: number };
  } | null;
  /** Default attribute view (defaultMode from `scoring`). 0-100 each. */
  attributes?: {
    overall?: { speed?: number; stamina?: number; mobility?: number; tech?: number };
    singles?: { speed?: number; stamina?: number; mobility?: number; tech?: number };
    doubles?: { speed?: number; stamina?: number; mobility?: number; tech?: number };
  } | null;
  scoring?: {
    defaultMode?: 'overall' | 'singles' | 'doubles';
    modes?: Record<string, { attributes?: Record<string, number>; ratings?: { overall?: { score100?: number }; singles?: { score100?: number }; doubles?: { score100?: number } } }>;
  } | null;
  cadence?: {
    label?: string;
    activeDaysPerWeek?: number;
    [key: string]: unknown;
  } | null;
  competitive?: {
    singleLevel?: number | null;
    doubleLevel?: number | null;
    dominantMode?: string;
    dominantLabel?: string;
  } | null;
  specialties?: { label: string; [key: string]: unknown }[];
  signature?: { homeLabel?: string; summaryLabel?: string };
  coverage: {
    hasPiuData: boolean;
    hasBenchmark?: boolean;
    doublesBenchmarkPartial?: boolean;
    attributeMode?: string;
  };
}

/** A song from /api/songs/library — bundles all charts for one song. */
export interface SongLibraryItem {
  song_group_key: string;
  title: string;
  artist?: string;
  jacket_url?: string;
  song_key?: string;
  flags?: string;
  charts: Chart[];
  [key: string]: unknown;
}

export interface SongLibraryResponse {
  total_songs: number;
  total_charts: number;
  songs: SongLibraryItem[];
}

/** One song played inside a multi-song tournament match. Either a flat
 *  shape or a `{ song: {...}, p1_score, p2_score }` nested shape — desktop
 *  helpers handle both, so we mirror that. */
export interface PlayedSong {
  title?: string;
  artist?: string;
  mode?: string;
  level?: number | string;
  jacket_url?: string;
  background_url?: string;
  song_jacket_url?: string;
  song?: {
    title?: string;
    artist?: string;
    mode?: string;
    level?: number | string;
    jacket_url?: string;
    background_url?: string;
    song_jacket_url?: string;
  };
  p1_score?: number | string;
  p2_score?: number | string;
  /** 'p1' | 'p2' | 'tie' | a player id. */
  song_winner_id?: string | null;
}

export interface MatchScores {
  /** Round-robin / pools: per-match game wins. */
  player1_wins?: number;
  player2_wins?: number;
  /** Multi-song matches: cumulative sum of song scores. */
  p1_total?: number;
  p2_total?: number;
  /** Round-robin co-op variant: both players "win" the match. */
  shared_win?: boolean | number;
  [key: string]: unknown;
}

export interface Match {
  id: string;
  tournament_id: string;
  phase_id?: string;
  round_number?: number;
  match_type?: string;
  bracket?: string;
  bracket_round?: number;
  bracket_position?: number;
  gauntlet_order?: number;
  pool_id?: number;
  player1_id?: string | null;
  player2_id?: string | null;
  winner_id?: string | null;
  difficulty_min?: number;
  difficulty_max?: number;
  is_bye?: boolean | number;
  status?: string;
  drawn_songs?: Song[];
  played_songs?: PlayedSong[];
  scores?: MatchScores;
  created_at?: string;
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
  skill_title?: string;
  /** Server returns `message` for the body text. */
  message?: string;
  thread_emoji?: string;
  is_participant?: boolean;
  pump_count?: number;
  user_pumped?: boolean;
  reply_count?: number;
  /** Hydrated only on top-level posts (server inlines first 50 replies). */
  replies?: DiscussionMessage[];
  created_at?: string;
  [key: string]: unknown;
}

export interface DiscussionResponse {
  threads: DiscussionMessage[];
  viewer_count?: number;
}

/** A tournament phase — a single segment of a multi-format event (e.g.
 *  "Round Robin" → "Single Elim Top 8" → "Final"). The desktop renders
 *  one tab per phase with format-specific bracket / pairings views. */
export interface TournamentPhase {
  id: string;
  tournament_id: string;
  phase_order: number;
  format: string;
  name?: string;
  config?: string | Record<string, unknown>;
  advancement?: string | Record<string, unknown>;
  placement_snapshots?: string | Record<string, unknown>;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | string;
  created_at?: string;
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
  /** Threaded replies to this top-level comment (server returns nested). */
  replies?: Comment[];
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
  jacket_url?: string;
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

export interface UpscoreHighlight {
  upscore_id?: number;
  /** Underlying play id (from recent-play enrichment) — keys comments. */
  play_id?: number;
  user_id?: string;
  song_title?: string;
  mode?: string;
  level?: number;
  chart_id?: number;
  jacket_url?: string;
  background_url?: string;
  /** Old (pre-upscore) score and grade. */
  old_score?: number;
  old_grade?: string;
  /** New score and grade — same fields as a regular play. */
  new_score?: number;
  new_grade?: string;
  /** Some payloads also expose `score`/`grade` aliases for the new value. */
  score?: number;
  grade?: string;
  plate?: string;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  pumbility_gain?: number;
  score_delta?: number;
  username?: string;
  avatar?: string;
  nationality?: string;
  played_at_utc?: string;
  date_played?: string;
  machine_name?: string;
  replay_embed_url?: string;
  [key: string]: unknown;
}

export interface ClearHighlight {
  clear_id?: number;
  /** Underlying play id (from recent-play enrichment) — keys comments. */
  play_id?: number;
  user_id?: string;
  song_title?: string;
  mode?: string;
  level?: number;
  chart_id?: number;
  jacket_url?: string;
  background_url?: string;
  score?: number;
  grade?: string;
  plate?: string;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  pumbility_gain?: number;
  username?: string;
  avatar?: string;
  nationality?: string;
  played_at_utc?: string;
  date_played?: string;
  machine_name?: string;
  replay_embed_url?: string;
  [key: string]: unknown;
}

export interface DailyHighlights {
  /** Daily mix-tape reel — present in the payload but the mobile client
   *  intentionally ignores it (the feature is web-only / experimental). */
  mixTape: unknown | null;
  topReplays: ReplayHighlight[];
  /** UTC date key the replays come from — set when `topReplaysIsFallback` is true. */
  topReplaysDateKey?: string;
  topReplaysIsFallback?: boolean;
  topUpscores: UpscoreHighlight[];
  topUpscoresIsFallback?: boolean;
  topClears: ClearHighlight[];
  topClearsIsFallback?: boolean;
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
  /** Optional preview of the parallel Co-Op WC division. Present when the
   *  picker has populated Co-op charts for the week. */
  coopSummary?: {
    chartCount: number;
    participantCount: number;
    top3: WeeklyChallengeLeaderboardRow[];
  } | null;
}

// --- Weekly Challenge week index (`/weeks`) ---

export interface WeeklyChallengeWeekIndexEntry {
  week_key: string;
  starts_at_utc: string;
  ends_at_utc: string;
  status: 'active' | 'finalized' | string;
  chart_count: number;
  challenge_max_level?: number;
  participant_count: number;
}

// --- Full week detail (`/week/{weekKey}`) ---

export interface WeeklyChallengeChartTopEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar?: string;
  nationality?: string;
  score: number;
  grade: string;
  rating_points: number;
  base_rating_points: number;
  pg_bonus_points: number;
  pg_bonus_percent: number;
  has_pg_bonus: boolean;
  plate?: string | null;
}

export interface WeeklyChallengeChart {
  id: number;
  week_id: number;
  chart_id: number;
  mode: string;
  level: number;
  sort_order: number;
  song_title_snapshot: string;
  artist_snapshot?: string;
  jacket_url_snapshot?: string;
  top3: WeeklyChallengeChartTopEntry[];
  participantCount: number;
  clearCount: number;
}

export interface WeeklyChallengeLeaderboardRow {
  rank: number;
  user_id: string;
  username: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
  points: number;
  clears: number;
  pg_bonus_points: number;
  pg_bonus_count: number;
}

/** Per-chart best for the viewer — keyed by `chart_id` (the WC chart id, not
 *  the underlying song chart). Server omits this if the user is unauthed. */
export interface WeeklyChallengeViewerBest {
  score: number;
  grade: string;
  rating_points: number;
  base_rating_points: number;
  pg_bonus_points: number;
  pg_bonus_percent: number;
  has_pg_bonus: boolean;
  plate?: string | null;
}

export interface WeeklyChallengeViewerSummary {
  bests: Record<string, WeeklyChallengeViewerBest>;
  totalPoints: number;
  totalClears: number;
  pgBonusPoints: number;
  pgBonusCount: number;
  rank: number | null;
}

export interface WeeklyChallengeFullWeek {
  week: WeeklyChallengeWeek & {
    challenge_min_level?: number;
  };
  /** Which division this payload was scoped to. Defaults to 'main' for
   *  pre-existing callers that don't pass the query param. */
  division?: 'main' | 'coop';
  participantCount: number;
  awards: WeeklyChallengeAward[];
  leaderboard: WeeklyChallengeLeaderboardRow[];
  groupedByLevel: Record<string, WeeklyChallengeChart[]>;
  viewerSummary: WeeklyChallengeViewerSummary | null;
}

// --- Single-chart leaderboard (`/charts/{chartId}/scores`) ---

export interface WeeklyChallengeChartScore {
  rank: number;
  user_id: string;
  username: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
  score: number;
  grade: string;
  plate?: string | null;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  rating_points: number;
  base_rating_points: number;
  pg_bonus_points: number;
  pg_bonus_percent: number;
  has_pg_bonus: boolean;
  attempt_count: number;
  play_id?: string | number;
  replay_embed_url?: string;
  background_url?: string;
}

export interface WeeklyChallengeChartScoresResponse {
  chart: {
    id: number;
    song_title: string;
    artist: string;
    mode: string;
    level: number;
    jacket_url?: string;
    week_key: string;
  };
  total_attempts: number;
  scores: WeeklyChallengeChartScore[];
}

// --- Song of the Week ---

/** Optional play attached to a Song of the Week pick — server pulls the
 *  most recent matching row from `user_recently_played` so the detail page
 *  can show the owner's score / grade / replay info inline. */
export interface SongOfWeekLinkedPlay {
  id: number;
  song_title?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
  plate?: string;
  date_played?: string;
  played_at_utc?: string;
  background_url?: string;
  replay_embed_url?: string;
  replay_video_id?: string;
  replay_start_seconds?: number;
  replay_end_seconds?: number;
}

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
  /** Hydrated by `hydrateSongOfWeekPick`. Null when no matching recent play. */
  linked_play?: SongOfWeekLinkedPlay | null;
  /** True for the viewer who owns the pick (exposes the composer / edit). */
  is_owner?: boolean;
  created_at?: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  comment_count?: number;
  [key: string]: unknown;
}

/** One play row in the desktop's "Explore" tessellated grid (also rendered
 *  in the mobile feed's right rail). Highlight tiers ("hero" / "feature" /
 *  "standard") are computed server-side from level + score + grade + plate
 *  + replay-availability so the most impressive plays bubble up. */
export interface ExplorePlay {
  play_id: number;
  user_id?: string;
  username?: string;
  avatar?: string;
  nationality?: string;
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
  background_url?: string;
  jacket_url?: string;
  replay_video_id?: string;
  replay_embed_url?: string;
  replay_start_seconds?: number;
  replay_end_seconds?: number;
  played_at_utc?: string;
  over_top100_rank?: number;
  highlight_tier?: 'hero' | 'feature' | 'standard';
  comment_count?: number;
}

export interface ExploreFeedResponse {
  items: ExplorePlay[];
  nextCursor: string | null;
  hasMore: boolean;
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

// --- Live Sessions ---

export interface LiveSessionHost {
  id?: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
  pumbility?: number;
  [key: string]: unknown;
}

export interface LiveSessionSummary {
  id: string;
  host_user_id?: string;
  title?: string;
  status?: string;
  started_at?: string;
  viewer_count?: number;
  stream_url?: string;
  live_url?: string;
  session_type?: string;
  is_unlisted?: boolean | number;
  [key: string]: unknown;
}

export interface LiveLastPlay {
  song_title?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
  background_url?: string;
  pumbility_gain?: number;
  hop_rating_points_earned?: number;
  [key: string]: unknown;
}

export interface LiveDirectoryItem {
  session: LiveSessionSummary;
  host?: LiveSessionHost;
  hop?: Record<string, unknown> | null;
  last_play?: LiveLastPlay | null;
  request_counts?: { open?: number; queued?: number; played?: number; skipped?: number };
  active_vote?: Record<string, unknown> | null;
  is_following?: boolean | number;
  [key: string]: unknown;
}

export interface LiveSessionsResponse {
  sessions: LiveDirectoryItem[];
}

// --- Live session detail (`/sessions/:id`) ---

export interface LiveSessionPlay {
  id: number;
  live_session_id: string;
  user_id: string;
  recently_played_id?: number;
  song_title: string;
  mode: string;
  level: number;
  score: number;
  grade: string;
  plate?: string;
  machine_name?: string;
  date_played?: string;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  kcal?: number;
  shoe_make?: string;
  shoe_model?: string;
  shoe_colorway?: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
  participant_role?: string;
  pumbility_gain?: number;
  singles_pumbility_gain?: number;
  rating?: number;
  background_url?: string;
  [key: string]: unknown;
}

/** Aggregate stats the server computes for the session. Includes top plays
 *  by score + rating, judgment totals, calorie estimate, etc. Used for the
 *  Summary panel in the viewer. */
export interface LiveSessionSummaryPayload {
  version: number;
  sessionId: string;
  sessionTitle?: string;
  sessionDateLabel?: string;
  sessionTimeRange?: string;
  sessionDurationMinutes?: number;
  sessionDurationLabel?: string;
  sessionMachineName?: string;
  sessionShoeLabel?: string;
  songCount: number;
  clearCount: number;
  clearRate: number;
  totalSteps: number;
  trainingLoad: number;
  estimatedKcal: number;
  estimatedKcalPerHour?: number;
  singleCount: number;
  doubleCount: number;
  otherCount: number;
  judgmentTotals: { perfect: number; great: number; good: number; bad: number; miss: number };
  perfectRate: number;
  averageScore: number;
  averageLevel: number;
  averageRating?: number;
  topSongsByScore?: LiveSessionPlay[];
  topSongsByRating?: LiveSessionPlay[];
  viewerCount: number;
  viewerPeak: number;
  messageCount: number;
  streamUrl?: string;
  hostUsername?: string;
  postText?: string;
  [key: string]: unknown;
}

export interface LiveSessionFull extends LiveSessionSummary {
  status_text?: string;
  stream_url?: string;
  youtube_broadcast_id?: string | null;
  youtube_video_id?: string | null;
  viewer_peak?: number;
  ended_at?: string | null;
  host?: LiveSessionHost;
  cohost_count?: number;
  participants?: { user_id: string; role: string; status: string; username?: string; avatar?: string; nationality?: string }[];
  hop_started_at?: string | null;
  hop_ends_at?: string | null;
}

export interface LiveSessionMessage {
  id: string;
  live_session_id: string;
  user_id: string;
  username: string;
  avatar?: string;
  message: string;
  /** 'chat' | 'session_start' | 'session_end' | 'song_played' | 'request_*' | ... */
  message_type: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  is_system?: boolean;
  skill_title?: string;
  pumbility?: number;
  nationality?: string;
  is_host?: boolean;
  is_participant?: boolean;
  participant_role?: string;
  pump_count?: number;
  user_pumped?: boolean;
  [key: string]: unknown;
}

export interface LiveSessionSnapshot {
  session: LiveSessionFull;
  viewer_state?: Record<string, unknown>;
  summary?: LiveSessionSummaryPayload;
  hop?: Record<string, unknown> | null;
  plays?: LiveSessionPlay[];
  messages?: LiveSessionMessage[];
  requests?: Record<string, unknown>[];
  active_vote?: Record<string, unknown> | null;
  last_play?: LiveSessionPlay | null;
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

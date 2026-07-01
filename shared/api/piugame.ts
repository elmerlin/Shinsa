import type { ApiClient } from './client';

export interface PiugameBestScore {
  id?: number | string;
  user_id?: string;
  song_title?: string;
  artist?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
  plate?: string;
  jacket_url?: string;
  background_url?: string;
  date_played?: string;
  played_at_utc?: string;
  is_pass?: boolean | number;
  is_stage_break?: boolean | number;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  rating?: number;
  chart_id?: number;
  play_id?: number;
  replay_embed_url?: string;
  [key: string]: unknown;
}

export interface PiugameRecentPlay extends PiugameBestScore {
  /** Recently-played list returns roughly the same shape as best_scores. */
  /** Heart rate captured for this play (HealthKit / Health Connect). */
  hr_avg?: number;
  hr_peak?: number;
  hr_series?: string;
  hr_source?: string;
  hr_duration_s?: number;
  hr_max?: number;
  song_duration_s?: number;
}

export interface PiugamePumbilityScore {
  rank_order?: number;
  song_title?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
  rating?: number;
  jacket_url?: string;
  background_url?: string;
  [key: string]: unknown;
}

export interface PiugamePumbility {
  pumbility_value?: number;
  official_pumbility?: number;
  last_sync?: string | null;
  scores?: PiugamePumbilityScore[];
  average_rating?: number;
  equivalent_level?: number | null;
  equivalent_grade?: string | null;
  min_entry_rating?: number;
  min_entry_details?: PiugamePumbilityScore | null;
  ranking?: number | null;
  threshold?: number;
  singles_competitive_level?: number;
  doubles_competitive_level?: number;
  competitive_level?: number;
  competitive_mode?: string;
  [key: string]: unknown;
}

export interface PiugameTitle {
  id?: number | string;
  name?: string;
  skill_title?: string;
  skill_family?: string;
  skill_level?: number;
  level?: number;
  required_points?: number;
  tier?: number | string;
  unlocked?: boolean | number;
  current_points?: number;
}

export interface PiugameTitleSummary {
  current_index?: number;
  current_title?: PiugameTitle | null;
  next_title?: PiugameTitle | null;
  unlocked_count?: number;
  total_titles?: number;
  segment_progress_percent?: number;
  total_points?: number;
  remaining_points_to_next_title?: number;
  aa_points_per_clear_for_next_level?: number;
  remaining_aa_clears_to_next_title?: number;
  [key: string]: unknown;
}

export interface PiugameTitlesResponse {
  imported?: boolean;
  best_scores_count?: number;
  last_best_scores_sync?: string | null;
  titles?: PiugameTitle[];
  levels?: Array<{ level: number; points: number; aa_points_per_clear?: number; thresholds?: number[] }>;
  summary?: PiugameTitleSummary;
}

export interface PiugameShoe {
  id: number;
  user_id: string;
  make?: string;
  model?: string;
  colorway?: string;
  image_data?: string;
  is_current?: boolean | number;
  retired_at?: string | null;
  created_at?: string;
  updated_at?: string;
  songs_logged?: number;
  steps_logged?: number;
  status?: 'current' | 'available' | 'retired' | string;
}

export interface PiugameShoesResponse {
  active_shoe_id?: number | null;
  lifetime_songs?: number;
  lifetime_steps?: number;
  shoes?: PiugameShoe[];
}

// --- Shoes community stats ---

export interface PiugameShoeStatsSummary {
  total_models: number;
  players_with_shoes: number;
  total_shoe_entries: number;
}

export interface PiugameShoeStatsModel {
  id: number;
  make: string;
  model: string;
  player_count: number;
  shoe_entries: number;
  colorway_count: number;
  /** Optional preferred display colorway from the catalog (may be empty). */
  display_colorway?: string;
  image_data?: string;
}

export interface PiugameShoeStatsResponse {
  summary: PiugameShoeStatsSummary;
  results: PiugameShoeStatsModel[];
}

export interface PiugameShoeUser {
  id: string;
  username: string;
  avatar?: string;
  skill_title?: string;
  nationality?: string;
  /** How many pairs of THIS model the user has registered. */
  matching_shoe_count: number;
  /** Array of colorways the user owns for this model (may be empty). */
  colorways: string[];
  /** True if the user has any non-retired pair of this model. */
  has_active_pair: boolean;
  /** True if this model is the user's currently-worn pair. */
  is_current_pair: boolean;
}

export interface PiugameShoeUsersResponse {
  shoe: PiugameShoeStatsModel;
  users: PiugameShoeUser[];
}

// --- Shoe catalog (autocomplete) ---

export interface PiugameShoeCatalogEntry {
  /** Composite key like `"catalog:5"` — unique per entry. */
  id: string;
  /** Foreign key into the curated catalog (numeric). Use when adding. */
  catalog_id: number;
  make: string;
  model: string;
  colorway: string;
  usage_count: number;
  curated: boolean;
  catalog_key?: string;
  image_data?: string;
}

export interface PiugameShoeCatalogResponse {
  q: string;
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  results: PiugameShoeCatalogEntry[];
}

export interface PiugameAddShoePayload {
  make: string;
  model: string;
  colorway?: string;
  /** Defaults to true server-side if the user has no current shoe. */
  set_current?: boolean;
  catalog_id?: number;
}

export interface PiugameAddShoeResponse {
  shoe: PiugameShoe;
  cabinet: PiugameShoesResponse;
}

export interface PiugameRecentlyPlayedParams {
  year?: number;
  /** 'asc' | 'desc' */
  sort?: string;
  limit?: number;
}

export interface PiugameBestScoresResponse {
  last_sync: string | null;
  imported: boolean;
  scores: PiugameBestScore[];
}

export interface PiugameRecentlyPlayedResponse {
  last_sync: string | null;
  plays: PiugameRecentPlay[];
}

export function createPiugameApi(client: ApiClient) {
  return {
    bestScores(userId: string, mode?: string) {
      const qs = mode ? `?mode=${encodeURIComponent(mode)}` : '';
      return client.request<PiugameBestScoresResponse>(`/api/piugame/best-scores/${encodeURIComponent(userId)}${qs}`);
    },
    recentlyPlayed(userId: string, params: PiugameRecentlyPlayedParams = {}) {
      const search = new URLSearchParams();
      if (params.year) search.set('year', String(params.year));
      if (params.sort) search.set('sort', params.sort);
      if (params.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<PiugameRecentlyPlayedResponse>(`/api/piugame/recently-played/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`);
    },
    pumbility(userId: string) {
      return client.request<PiugamePumbility>(`/api/piugame/pumbility/${encodeURIComponent(userId)}`);
    },
    titles(userId: string) {
      return client.request<PiugameTitlesResponse>(`/api/piugame/titles/${encodeURIComponent(userId)}`);
    },
    shoes(userId: string) {
      return client.request<PiugameShoesResponse>(`/api/piugame/shoes/${encodeURIComponent(userId)}`);
    },
    // The sync endpoints scrape Phoenix PIUGame live — best-scores can walk
    // dozens of pages and routinely takes 20-60s; recently-played +
    // pumbility are smaller but still ~15-25s. The ApiClient default
    // timeout is 8s, which aborts the request long before the server
    // finishes (the user then sees a spurious "Request timed out" even
    // though the sync usually completes server-side). Give each a
    // generous per-call timeout.
    syncBestScores() {
      return client.request<PiugameSyncResponse>('/api/piugame/sync/best-scores', {
        method: 'POST',
        timeoutMs: 180_000,
      });
    },
    syncRecentlyPlayed() {
      return client.request<PiugameSyncRecentResponse>('/api/piugame/sync/recently-played', {
        method: 'POST',
        timeoutMs: 90_000,
      });
    },
    /** Scrape and store the user's Top-50 Pumbility chart list from PIUGame. */
    syncPumbility() {
      return client.request<PiugameSyncPumbilityResponse>('/api/piugame/sync/pumbility', {
        method: 'POST',
        timeoutMs: 90_000,
      });
    },
    syncStatus(userId: string) {
      return client.request<PiugameSyncStatus>(`/api/piugame/sync-status/${encodeURIComponent(userId)}`);
    },
    /** Whether the current user has a stored PIUGame credential pair. */
    credentialStatus() {
      return client.request<PiugameCredentialStatus>('/api/piugame/credentials/status');
    },
    /** Save (or update) the user's PIUGame credentials. Server encrypts at rest. */
    saveCredentials(payload: PiugameCredentialPayload) {
      return client.request<{ success: boolean }>('/api/piugame/credentials', {
        method: 'POST',
        body: payload,
      });
    },
    /** Unlink the user's PIUGame account. Server also wipes all imported
     *  pumbility / best-score / recently-played data — the destructive part
     *  is intentional so a re-link starts from a clean slate. */
    deleteCredentials() {
      return client.request<{ success: boolean }>('/api/piugame/credentials', {
        method: 'DELETE',
      });
    },
    /** Top shoe models across the player base, with summary counts. */
    shoesStats(params: { limit?: number } = {}) {
      const search = new URLSearchParams();
      if (typeof params.limit === 'number') search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<PiugameShoeStatsResponse>(`/api/piugame/shoes/stats/top${qs ? `?${qs}` : ''}`);
    },
    /** Players who own a given shoe model — for the "Who Uses It" sheet. */
    shoeUsers(shoeId: number | string) {
      return client.request<PiugameShoeUsersResponse>(`/api/piugame/shoes/stats/top/${encodeURIComponent(String(shoeId))}/users`);
    },
    /** Mark a shoe in the current user's cabinet as "current". Auth required. */
    wearShoe(shoeId: number | string) {
      return client.request<PiugameShoesResponse>(`/api/piugame/shoes/${encodeURIComponent(String(shoeId))}/wear`, {
        method: 'POST',
      });
    },
    /** Fuzzy-match shoes in the curated catalog. Returns curated entries
     *  plus community-added shoes, prioritising curated then by usage. */
    shoesCatalog(params: { q?: string; page?: number; limit?: number } = {}) {
      const search = new URLSearchParams();
      if (params.q) search.set('q', params.q);
      if (typeof params.page === 'number') search.set('page', String(params.page));
      if (typeof params.limit === 'number') search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<PiugameShoeCatalogResponse>(`/api/piugame/shoes/catalog${qs ? `?${qs}` : ''}`);
    },
    /** Add a shoe to the current user's cabinet. Auth required.
     *  Pass a `photo: FormData` value to attach a JPEG/PNG/HEIC photo; the
     *  server resizes it server-side via Sharp. JSON-only adds are also fine
     *  (catalog selections auto-attach the curated photo). */
    addShoe(payload: PiugameAddShoePayload | FormData) {
      return client.request<PiugameAddShoeResponse>(`/api/piugame/shoes`, {
        method: 'POST',
        body: payload,
      });
    },
    /** Retire a shoe — server flips `retired_at` to now() and unsets current.
     *  Irreversible from this endpoint (the user would add a new entry to
     *  "restore" the model). Returns the refreshed cabinet. */
    retireShoe(shoeId: number | string) {
      return client.request<{ success: boolean; cabinet: PiugameShoesResponse }>(
        `/api/piugame/shoes/${encodeURIComponent(String(shoeId))}/retire`,
        { method: 'POST' },
      );
    },
    /** Delete a shoe entirely. Also clears the `shoe_id` from any historical
     *  plays linked to it (set to NULL) so the cabinet stays clean. */
    deleteShoe(shoeId: number | string) {
      return client.request<{ success: boolean; cabinet: PiugameShoesResponse }>(
        `/api/piugame/shoes/${encodeURIComponent(String(shoeId))}`,
        { method: 'DELETE' },
      );
    },
    /** Training-load profile: zone status, EWMA history, daily load history,
     *  comfortable level + grade predictions per mode. */
    trainingLoad(userId: string) {
      return client.request<TrainingLoadResponse>(`/api/piugame/training-load/${encodeURIComponent(userId)}`);
    },
    /** How the user stacks up against everyone else: percentile, milestone
     *  gap to the next bracket, ceiling prediction + scatter of peers. */
    trainingPopulation(userId: string) {
      return client.request<TrainingPopulationResponse>(`/api/piugame/training-population/${encodeURIComponent(userId)}`);
    },

    /** Global Pumbility leaderboard (overall vs singles), paginated. The
     *  payload includes `current_user` so the UI can pin "you" to the top. */
    pumbilityLeaderboard(params: PumbilityLeaderboardParams = {}) {
      const search = new URLSearchParams();
      if (params.metric) search.set('metric', params.metric);
      if (params.sort_by) search.set('sort_by', params.sort_by);
      if (params.sort_order) search.set('sort_order', params.sort_order);
      if (params.page) search.set('page', String(params.page));
      if (params.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<PumbilityLeaderboardResponse>(`/api/piugame/leaderboards/pumbility${qs ? `?${qs}` : ''}`);
    },

    /** All OVER (level 20+) ranking levels, with chart counts per level. */
    over20Levels() {
      return client.request<Over20LevelsResponse>(`/api/piugame/leaderboards/over20/levels`);
    },

    /** Charts for one OVER level. `mode` accepts 'all' | 'single' | 'double'. */
    over20Charts(params: { level: number | string; mode?: 'all' | 'single' | 'double' }) {
      const search = new URLSearchParams();
      search.set('level', String(params.level));
      if (params.mode && params.mode !== 'all') search.set('mode', params.mode);
      return client.request<Over20ChartsResponse>(`/api/piugame/leaderboards/over20/charts?${search.toString()}`);
    },

    /** Top 100 scores for a specific OVER chart (by chart_key). */
    over20ChartTop100(chartKey: string) {
      return client.request<Over20ChartTop100Response>(
        `/api/piugame/leaderboards/over20/chart?chart_key=${encodeURIComponent(chartKey)}`,
      );
    },

    /** Current user's stored Top-100 chart scores (anywhere they hit the
     *  global top 100 for a chart). Paginated. */
    myTop100Scores(params: { page?: number; limit?: number } = {}) {
      const search = new URLSearchParams();
      if (params.page) search.set('page', String(params.page));
      if (params.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<MyTop100ScoresResponse>(`/api/piugame/leaderboards/my-top100-scores${qs ? `?${qs}` : ''}`);
    },
  };
}

// --- Pumbility leaderboard ---

export interface PumbilityLeaderboardParams {
  metric?: 'overall' | 'singles';
  sort_by?: 'pumbility' | 'avg_grade' | 'avg_level' | 'competitive_level';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PumbilityLeaderboardRow {
  rank: number;
  user_id?: string;
  username: string;
  avatar?: string;
  local_avatar?: string;
  piugame_avatar?: string;
  piugame_avatar_url?: string;
  nationality?: string;
  is_local_user?: boolean;
  global_rank?: number;
  global_prev_rank?: number;
  global_rank_delta?: number;
  overall_pumbility?: number;
  singles_pumbility?: number;
  overall_average_grade?: string;
  overall_average_level?: number;
  singles_average_grade?: string;
  singles_average_level?: number;
  singles_competitive_level?: number;
  doubles_competitive_level?: number;
  competitive_level?: number;
  competitive_mode?: string;
  overall_breakdown_count?: number;
  singles_breakdown_count?: number;
}

export interface PumbilityLeaderboardResponse {
  metric: 'overall' | 'singles';
  sort_by: string;
  sort_order: 'asc' | 'desc';
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  rows: PumbilityLeaderboardRow[];
  current_user: {
    sort_rank: number;
    user_id: string;
    username: string;
    global_rank: number;
    global_prev_rank: number;
    global_rank_delta: number;
    overall_pumbility: number;
    singles_pumbility: number;
  } | null;
  source: string;
}

// --- OVER (level 20+) chart leaderboards ---

export interface Over20Level {
  level: number;
  chart_count: number;
}
export interface Over20LevelsResponse {
  levels: Over20Level[];
  total_levels: number;
  total_charts: number;
}

export interface Over20Chart {
  chart_key: string;
  song_title: string;
  mode: string;
  level: number;
  jacket_url?: string;
  source_no?: string;
  top100_count: number;
  min_score: number;
  last_sync?: string | null;
}
export interface Over20ChartsResponse {
  level: number;
  mode: string;
  total_charts: number;
  charts: Over20Chart[];
}

export interface Over20ChartScore {
  rank: number;
  score: number;
  grade: string;
  player_name: string;
  player_avatar?: string;
  player_avatar_url?: string;
  prev_rank?: number;
  rank_delta?: number;
  local_avatar?: string;
  piugame_avatar?: string;
  is_local_user?: boolean;
  played_at?: string;
}
export interface Over20ChartTop100Response {
  chart: Over20Chart;
  total_scores: number;
  scores: Over20ChartScore[];
}

// --- My top-100 across all OVER charts ---

export interface MyTop100ScoreRow {
  id: number;
  song_title: string;
  mode: string;
  level: number;
  score: number;
  grade: string;
  plate?: string;
  player_name?: string;
  jacket_url?: string;
  chart_key?: string;
  over_top100_rank: number;
  over_top100_prev_rank?: number;
  over_top100_rank_delta?: number;
  top100_count?: number;
}
export interface MyTop100ScoresResponse {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  rows: MyTop100ScoreRow[];
}

// --- Training-load shapes (mirrors server/routes/piugame.js#computeAllProfiles) ---

export type TrainingMode = 'overall' | 'single' | 'double';

/** Status the server bins each user into based on their current-form vs
 *  base-skill EWMA ratio. The label + accent color are server-driven so
 *  mobile doesn't need to know the exact bucket boundaries. */
export interface TrainingZone {
  base_skill: number;
  current_form: number;
  /** Percentage 0-100+. May be null while the server is calibrating. */
  training_ratio: number | null;
  training_status: string;
  /** Hex color the server picked for this zone — drives accent/glow. */
  training_color: string;
  play_days: number;
  chronic_clear_count: number;
  /** Server still gathering enough data — show a "calibrating" hint. */
  calibrating: boolean;
}

/** Per-mode profile that includes the projection fields (only on single/double,
 *  not on `overall`). Extends `TrainingZone`. */
export interface TrainingModeProfile extends TrainingZone {
  comfortable_level?: number | null;
  avg_play_load?: number;
  likely_pass?: TrainingLikelyPass | null;
  /** Map keyed by level string ("17", "18", ...) → predicted grade ("AAA+"). */
  grade_predictions?: Record<string, string>;
}

export interface TrainingLikelyPassClear {
  song_title: string;
  mode?: string;
  level?: number;
  score: number;
  grade: string;
  background_url?: string;
  /** Shinsa-hosted catalog jacket (server-resolved); preferred over the raw
   *  piugame background_url, which often fails to load on native. */
  jacket_url?: string;
}

export interface TrainingLikelyPassLevel {
  level: number;
  attempt_count: number;
  clear_count: number;
  clear_day_peak: number;
  near_pass_count: number;
  strong_near_pass_count: number;
  best_clear_score: number;
  best_clear_grade: string;
  best_near_pass_score: number;
  best_positive_score: number;
  clears: TrainingLikelyPassClear[];
  near_passes: TrainingLikelyPassClear[];
}

export interface TrainingLikelyPass {
  level: number;
  confidence: 'High' | 'Medium' | 'Low' | string;
  support_score: number;
  predicted_grade: string;
  load_supported_pass_level: number;
  form_ratio: number;
  target?: TrainingLikelyPassLevel;
  feeder_levels?: TrainingLikelyPassLevel[];
  reasons?: string[];
}

export interface TrainingEwmaSnapshot {
  base_skill: number;
  current_form: number;
  chronic_clear_count: number;
}

export interface TrainingEwmaHistoryRow {
  date: string;
  overall: TrainingEwmaSnapshot;
  single: TrainingEwmaSnapshot;
  double: TrainingEwmaSnapshot;
}

export interface TrainingDailyLoadRow {
  date: string;
  overall: number;
  single: number;
  double: number;
  play_count: number;
}

export interface TrainingLoadResponse {
  overall: TrainingZone;
  single: TrainingModeProfile;
  double: TrainingModeProfile;
  ewma_history: TrainingEwmaHistoryRow[];
  daily_load_history: TrainingDailyLoadRow[];
  sync_stale: boolean;
  last_synced_at: string | null;
}

// --- Population shapes ---

export interface TrainingPercentileBucket {
  lo: number;
  hi: number;
  count: number;
}

export interface TrainingPercentile {
  percentile: number;
  rank: number;
  total_users: number;
  distribution: TrainingPercentileBucket[];
}

export interface TrainingMilestone {
  target_level: number;
  target_avg_load: number;
  current_avg_load: number;
  gap_absolute: number;
  gap_percent: number;
  already_met: boolean;
}

export interface TrainingCeiling {
  ceiling_level: number;
  comfortable_level: number;
  delta: number;
}

export interface TrainingScatterPoint {
  username: string;
  avatar_url?: string;
  avg_load_per_clear: number;
  comfortable_level: number;
  ceiling_level: number;
  is_current_user?: boolean;
}

export interface TrainingPopulationProfile {
  percentile: TrainingPercentile;
  milestone: TrainingMilestone;
  ceiling: TrainingCeiling;
  scatter: TrainingScatterPoint[];
}

export interface TrainingPopulationResponse {
  single?: TrainingPopulationProfile;
  double?: TrainingPopulationProfile;
}

export interface PiugameSyncResponse {
  started?: boolean;
  already_running?: boolean;
  progress?: number;
  total?: number;
}

export interface PiugameSyncRecentResponse {
  success?: boolean;
  plays_count?: number;
  scores_updated?: number;
}

export interface PiugameSyncPumbilityResponse {
  success?: boolean;
  /** Top-50 pumbility value scraped from PIUGame. */
  pumbility_value?: number;
  scores_count?: number;
}

export interface PiugameCredentialStatus {
  linked: boolean;
  /** ISO timestamp of the last credential write. Null if never linked. */
  updated_at: string | null;
}

export interface PiugameCredentialPayload {
  piugame_username: string;
  piugame_password: string;
}

export interface PiugameSyncStatus {
  linked?: boolean;
  sync_in_progress?: string | null;
  sync_progress?: number;
  sync_total?: number;
  highest_single?: number;
  highest_double?: number;
  best_scores_imported?: boolean | number;
  pumbility_value?: number;
  last_best_scores_sync?: string | null;
  last_pumbility_sync?: string | null;
  last_recently_played_sync?: string | null;
  [key: string]: unknown;
}

export type PiugameApi = ReturnType<typeof createPiugameApi>;

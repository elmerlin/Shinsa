import type { ApiClient } from './client';
import type { ChartDetailResponse, Song, SongLibraryResponse } from './types';

export interface SongsListParams {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface SongsLibraryParams {
  user_id?: string;
  search?: string;
  mode?: string;
  level?: string | number;
}

export function createSongsApi(client: ApiClient) {
  return {
    /** Chart-level list (one row per chart). Prefer `library` for grouped views. */
    list(params: SongsListParams = {}) {
      const search = new URLSearchParams();
      if (params.q) search.set('q', params.q);
      if (typeof params.limit === 'number') search.set('limit', String(params.limit));
      if (typeof params.offset === 'number') search.set('offset', String(params.offset));
      const qs = search.toString();
      return client.request<Song[]>(`/api/songs${qs ? `?${qs}` : ''}`);
    },
    /** Songs grouped by song_group_key with embedded charts. Used by the songs page. */
    library(params: SongsLibraryParams = {}) {
      const search = new URLSearchParams();
      if (params.user_id) search.set('user_id', params.user_id);
      if (params.search) search.set('search', params.search);
      if (params.mode) search.set('mode', params.mode);
      if (params.level !== undefined && params.level !== null && String(params.level) !== '')
        search.set('level', String(params.level));
      const qs = search.toString();
      return client.request<SongLibraryResponse>(`/api/songs/library${qs ? `?${qs}` : ''}`);
    },
    chartDetail(chartId: number | string, params: { user_id?: string; follow_from_user_id?: string } = {}) {
      const search = new URLSearchParams();
      if (params.user_id) search.set('user_id', params.user_id);
      if (params.follow_from_user_id) search.set('follow_from_user_id', params.follow_from_user_id);
      const qs = search.toString();
      return client.request<ChartDetailResponse>(`/api/songs/chart/${chartId}${qs ? `?${qs}` : ''}`);
    },
    /** `{ "{normalized_title}|{Mode}|{level}": jacket_path }` plus base-title-only entries. */
    jacketMap() {
      return client.request<Record<string, string>>('/api/songs/jacket-map');
    },
    songAnalytics(userId: string) {
      return client.request<SongAnalyticsResponse>(`/api/songs/analytics/user/${encodeURIComponent(userId)}`);
    },
    skillBreakdown(userId: string, params: { mode?: string; min_level?: number } = {}) {
      const search = new URLSearchParams();
      if (params.mode) search.set('mode', params.mode);
      if (typeof params.min_level === 'number') search.set('min_level', String(params.min_level));
      const qs = search.toString();
      return client.request<SkillBreakdownResponse>(`/api/songs/analytics/skill-breakdown/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`);
    },
    rankings(userId: string, params: { scope?: string; mode?: string } = {}) {
      const search = new URLSearchParams();
      if (params.scope) search.set('scope', params.scope);
      if (params.mode) search.set('mode', params.mode);
      const qs = search.toString();
      return client.request<RankingsResponse>(`/api/songs/analytics/rankings/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`);
    },
    /** Per-level grade-goal tracker. `mode` and `level` are required by the server. */
    gradeGoals(userId: string, params: { mode: 'Single' | 'Double'; level: number; target_grade: string }) {
      const search = new URLSearchParams();
      search.set('mode', params.mode);
      search.set('level', String(params.level));
      search.set('target_grade', params.target_grade);
      return client.request<GradeGoalsResponse>(`/api/songs/analytics/grade-goals/${encodeURIComponent(userId)}?${search.toString()}`);
    },
    /** Available levels per mode for the tier list. */
    tiersMeta(params: { tier_list_type?: TierListType } = {}) {
      const search = new URLSearchParams();
      search.set('tier_list_type', params.tier_list_type || 'Pass');
      return client.request<TiersMetaResponse>(`/api/songs/tiers/meta?${search.toString()}`);
    },
    /** Charts grouped by community-perceived tier (Overrated → Underrated). */
    tiers(params: { mode: 'Single' | 'Double' | 'CoOp'; level: number; user_id?: string; tier_list_type?: TierListType }) {
      const search = new URLSearchParams();
      search.set('tier_list_type', params.tier_list_type || 'Pass');
      search.set('mode', params.mode);
      search.set('level', String(params.level));
      if (params.user_id) search.set('user_id', params.user_id);
      return client.request<TiersResponse>(`/api/songs/tiers?${search.toString()}`);
    },

    // --- Personal song lists ---

    /** Fetch all of the current user's lists with embedded items + progress counts. */
    lists() {
      return client.request<UserListsResponse>(`/api/songs/lists`);
    },
    createList(name: string) {
      return client.request<UserList>(`/api/songs/lists`, {
        method: 'POST',
        body: { name },
      });
    },
    deleteList(listId: number | string) {
      return client.request<{ ok: boolean }>(`/api/songs/lists/${encodeURIComponent(String(listId))}`, {
        method: 'DELETE',
      });
    },
    renameList(listId: number | string, name: string) {
      return client.request<UserList>(`/api/songs/lists/${encodeURIComponent(String(listId))}`, {
        method: 'PUT',
        body: { name },
      });
    },
    cloneList(listId: number | string, name?: string) {
      return client.request<UserList>(`/api/songs/lists/${encodeURIComponent(String(listId))}/clone`, {
        method: 'POST',
        body: name ? { name } : {},
      });
    },
    addListItem(listId: number | string, item: AddListItemPayload) {
      return client.request<{ id: number; sortOrder: number }>(`/api/songs/lists/${encodeURIComponent(String(listId))}/items`, {
        method: 'POST',
        body: item,
      });
    },
    removeListItem(listId: number | string, itemId: number | string) {
      return client.request<{ ok: boolean }>(`/api/songs/lists/${encodeURIComponent(String(listId))}/items/${encodeURIComponent(String(itemId))}`, {
        method: 'DELETE',
      });
    },
    updateListItemTarget(listId: number | string, itemId: number | string, target: string) {
      return client.request<{ ok: boolean }>(`/api/songs/lists/${encodeURIComponent(String(listId))}/items/${encodeURIComponent(String(itemId))}/target`, {
        method: 'PUT',
        body: { target },
      });
    },
    /** Persist a new chart order — `itemIds` MUST cover every item in the list. */
    reorderList(listId: number | string, itemIds: (number | string)[]) {
      return client.request<{ ok: boolean }>(`/api/songs/lists/${encodeURIComponent(String(listId))}/reorder`, {
        method: 'PUT',
        body: { itemIds },
      });
    },
    /** Add up to N charts in a single transaction. Server skips duplicates. */
    bulkAddListItems(listId: number | string, items: AddListItemPayload[]) {
      return client.request<{ added: { id: number; chartId: number }[] }>(`/api/songs/lists/${encodeURIComponent(String(listId))}/bulk-items`, {
        method: 'POST',
        body: { items },
      });
    },

    // --- Shared (squad) lists ---

    /** Lists this user has been invited to via squad conversations. */
    sharedLists() {
      return client.request<{ sharedLists: SharedListSummary[] }>(`/api/songs/lists/shared`);
    },
    sharedListDetail(sharedListId: number | string) {
      return client.request<SharedListDetail>(`/api/songs/lists/shared/${encodeURIComponent(String(sharedListId))}`);
    },
    joinSharedList(sharedListId: number | string) {
      return client.request<{ joined: boolean }>(`/api/songs/lists/shared/${encodeURIComponent(String(sharedListId))}/join`, {
        method: 'POST',
      });
    },
    leaveSharedList(sharedListId: number | string) {
      return client.request<{ left: boolean }>(`/api/songs/lists/shared/${encodeURIComponent(String(sharedListId))}/leave`, {
        method: 'DELETE',
      });
    },
    /** All shared lists scoped to a single conversation. Used by the squad
     *  settings sheet "Lists" tab. */
    sharedListsByConversation(conversationId: string) {
      return client.request<{ sharedLists: SharedListSummary[] }>(
        `/api/songs/lists/shared/by-conversation/${encodeURIComponent(conversationId)}`,
      );
    },
    /** Per-(mode,level) leaderboard ranked by average best-score across the
     *  user's clears at that level. Used by the profile Rankings drill-down. */
    levelLeaderboard(params: LevelLeaderboardParams) {
      const search = new URLSearchParams();
      search.set('mode', params.mode);
      search.set('level', String(params.level));
      if (params.scope) search.set('scope', params.scope);
      if (params.user_id) search.set('user_id', params.user_id);
      return client.request<LevelLeaderboardResponse>(`/api/songs/analytics/level-leaderboard?${search.toString()}`);
    },

    /** Head-to-head comparison between two players — used by the Rival page.
     *  `mode` accepts 'Single' | 'Double' | 'Both' (default Both), `level`
     *  is optional and narrows every metric to a single difficulty. */
    headToHead(params: HeadToHeadParams) {
      const search = new URLSearchParams();
      search.set('user_a_id', params.user_a_id);
      search.set('user_b_id', params.user_b_id);
      if (params.mode) search.set('mode', params.mode);
      if (params.level != null && String(params.level) !== '') search.set('level', String(params.level));
      return client.request<HeadToHeadResponse>(`/api/songs/analytics/head-to-head?${search.toString()}`);
    },

    /** What-to-play recommendations. `goal` is 'title' or 'pumbility'; the
     *  `mode` allowed depends on goal (see server validation). `seed` is an
     *  arbitrary number — pass a fresh value (Date.now()) to reroll picks. */
    goalRecommendations(params: GoalRecommendationParams = {}) {
      const search = new URLSearchParams();
      if (params.goal) search.set('goal', params.goal);
      if (params.mode) search.set('mode', params.mode);
      if (params.seed != null) search.set('seed', String(params.seed));
      if (params.limit != null) search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<GoalRecommendationsResponse>(`/api/songs/recommendations/goals${qs ? `?${qs}` : ''}`);
    },

    /** Save private chart feedback (your "read" + a private note). Pass
     *  `passability_rating: null` to clear the read; `note: ''` clears the
     *  note. Server stores per-user, per-chart. */
    saveChartFeedback(chartId: number | string, payload: SaveChartFeedbackPayload) {
      return client.request<{ ok: true; feedback: ChartFeedback }>(
        `/api/songs/chart/${encodeURIComponent(String(chartId))}/feedback`,
        { method: 'PUT', body: payload },
      );
    },

    /** Catalog of all known PIU Center skills + per-skill chart counts +
     *  coverage totals (S7+ / D10+). Used as the index for the Skills page. */
    skillsMeta() {
      return client.request<SkillsMetaResponse>(`/api/songs/skills/meta`);
    },

    /** Charts tagged with a single skill, with the user's best score per chart
     *  (when `user_id` is set or auth header is present). Server groups +
     *  filters by mode/level + sort. */
    skillCharts(skillSlug: string, params: SkillChartsParams = {}) {
      const search = new URLSearchParams();
      if (params.mode) search.set('mode', params.mode);
      if (params.min_level != null && String(params.min_level) !== '') search.set('min_level', String(params.min_level));
      if (params.max_level != null && String(params.max_level) !== '') search.set('max_level', String(params.max_level));
      if (params.sort) search.set('sort', params.sort);
      if (params.user_id) search.set('user_id', params.user_id);
      const qs = search.toString();
      return client.request<SkillChartsResponse>(`/api/songs/skill/${encodeURIComponent(skillSlug)}${qs ? `?${qs}` : ''}`);
    },

    /** Lightweight info-only payload for a skill (description + chart_count).
     *  Cheaper than `skillCharts` when you only need the header. */
    skillInfo(skillSlug: string) {
      return client.request<SkillInfoResponse>(`/api/songs/skill/${encodeURIComponent(skillSlug)}/info`);
    },
  };
}

// --- Skills (catalog + per-skill detail) ---

export interface SkillCatalogEntry {
  slug: string;
  name: string;
  /** Number of eligible charts (S7+ / D10+) tagged with this skill. */
  chart_count: number;
}

export interface SkillsMetaResponse {
  skills: SkillCatalogEntry[];
  totals: {
    total_charts: number;
    charts_with_skills: number;
    charts_missing_skills: number;
  };
}

export interface SkillDescriptionSegment {
  type: 'text' | 'image';
  text?: string;
  url?: string;
  alt?: string;
}

export interface SkillDetail {
  slug: string;
  name: string;
  description_text?: string;
  description_segments?: SkillDescriptionSegment[];
  pattern_images?: string[];
  source_url?: string;
}

export interface SkillInfoResponse {
  skill: SkillDetail;
  chart_count: number;
}

export type SkillChartsSort = 'level_asc' | 'level_desc' | 'score_asc' | 'score_desc';

export interface SkillChartsParams {
  mode?: 'single' | 'double' | 'both';
  min_level?: number | string;
  max_level?: number | string;
  sort?: SkillChartsSort;
  user_id?: string;
}

export interface SkillChart {
  chart_id: number;
  title: string;
  artist: string;
  mode: string;
  level: number;
  jacket_url?: string;
  bpm?: string;
  song_key?: string;
  flags?: string;
  best_score?: number | null;
  best_grade?: string;
  is_pass?: boolean;
  is_stage_break?: boolean;
  date_played?: string;
}

export interface SkillChartsResponse {
  skill: SkillDetail;
  total_charts: number;
  mode_filter: string[];
  min_level: number | null;
  max_level: number | null;
  sort: SkillChartsSort;
  user_id: string;
  charts: SkillChart[];
}

// --- Head to Head ---

export interface HeadToHeadParams {
  user_a_id: string;
  user_b_id: string;
  mode?: 'Single' | 'Double' | 'Both';
  level?: number | string;
}

export interface HeadToHeadUser {
  id?: string;
  username?: string;
  avatar?: string;
  pumbility?: number;
}

export interface HeadToHeadCompetitiveLevel {
  level?: number;
  average_score?: number;
  average_grade?: string;
  passed_charts?: number;
  total_charts?: number;
}

export interface HeadToHeadHighlightedStats {
  pumbility?: { a?: number; b?: number };
  singles_pumbility?: { a?: number; b?: number };
  doubles_competitive_level?: { a?: HeadToHeadCompetitiveLevel | null; b?: HeadToHeadCompetitiveLevel | null };
  singles_competitive_level?: { a?: HeadToHeadCompetitiveLevel | null; b?: HeadToHeadCompetitiveLevel | null };
}

export interface HeadToHeadComparison {
  level: number | null;
  mode: string;
  shared_chart_count: number;
  wins: { a: number; b: number; ties: number };
  rating: { a: number; b: number };
  total_passed: { a: number; b: number };
  metric_wins: {
    higher_score: 'a' | 'b' | null;
    rating_total: 'a' | 'b' | null;
    total_passed: 'a' | 'b' | null;
  };
  clear_cut_winner: string | null;
}

export interface HeadToHeadLevelSeriesRow {
  level: number;
  cleared_charts?: number;
  total_charts?: number;
  rating_total?: number;
  average_score?: number;
  average_grade?: string;
}

export interface HeadToHeadLevelSeries {
  single?: { a?: HeadToHeadLevelSeriesRow[]; b?: HeadToHeadLevelSeriesRow[] };
  double?: { a?: HeadToHeadLevelSeriesRow[]; b?: HeadToHeadLevelSeriesRow[] };
  both?: { a?: HeadToHeadLevelSeriesRow[]; b?: HeadToHeadLevelSeriesRow[] };
}

export interface HeadToHeadSongDiff {
  chart_id: number | null;
  title: string;
  mode: string;
  level: number;
  jacket_url?: string;
  score_a: number;
  grade_a: string;
  rating_a?: number;
  score_b: number;
  grade_b: string;
  rating_b?: number;
  winner: 'a' | 'b' | 'tie';
}

export interface HeadToHeadResponse {
  users: { a: HeadToHeadUser; b: HeadToHeadUser };
  highlighted_stats: HeadToHeadHighlightedStats;
  comparison: HeadToHeadComparison;
  level_series: HeadToHeadLevelSeries;
  top_song_diffs: HeadToHeadSongDiff[];
}

// --- What to Play (goal recommendations) ---

export interface GoalRecommendationParams {
  goal?: 'title' | 'pumbility';
  /** Allowed values depend on goal — title: single|double, pumbility: single|both. */
  mode?: 'single' | 'double' | 'both';
  seed?: number;
  limit?: number;
}

export interface GoalRecommendationFeedback {
  passability_rating?: 1 | 2 | 3 | 4 | 5 | null;
  passability_label?: string;
  note?: string;
  note_updated_at?: string | null;
}

export interface GoalRecommendationPlayHistory {
  logged_plays?: number;
  logged_passes?: number;
}

export interface GoalRecommendation {
  chart_id: number;
  song_title: string;
  artist?: string;
  mode: string;
  level: number;
  jacket_url?: string;
  background_url?: string;
  reason_type?: string;
  reason_label?: string;
  reasoning?: string;
  tier_name?: string;
  skills?: string[];
  // Title goal fields
  best_score?: number | null;
  best_grade?: string | null;
  fail_score?: number | null;
  // Pumbility goal fields
  current_score?: number | null;
  current_grade?: string | null;
  next_grade?: string | null;
  score_needed?: number | null;
  pumbility_gain?: number | null;
  // Per-user state
  player_feedback?: GoalRecommendationFeedback | null;
  play_history?: GoalRecommendationPlayHistory | null;
}

export interface TitleGoalSummary {
  current_title?: { name?: string; skill_title?: string; required_points?: number } | null;
  next_title?: { name?: string; skill_title?: string; required_points?: number } | null;
  points_remaining?: number;
  estimated_passes?: number;
  estimate_label?: string;
}

export interface PumbilityGoalSummary {
  current_pumbility?: number;
  frontier_size?: number;
  selection_note?: string;
}

export interface GoalRecommendationsResponse {
  status?: 'ok' | 'needs_import' | 'all_completed';
  goal?: 'title' | 'pumbility';
  mode?: string;
  summary?: TitleGoalSummary | PumbilityGoalSummary | null;
  recommendations?: GoalRecommendation[];
}

// --- Chart feedback ---

export interface SaveChartFeedbackPayload {
  passability_rating: 1 | 2 | 3 | 4 | 5 | null;
  note?: string;
}

export interface ChartFeedback {
  passability_rating?: 1 | 2 | 3 | 4 | 5 | null;
  passability_label?: string;
  note?: string;
  note_updated_at?: string | null;
}

export interface LevelLeaderboardParams {
  mode: string;
  level: number | string;
  /** 'global' (default) or 'following'. When 'following', `user_id` is required
   *  and the leaderboard is scoped to that user + their followees. */
  scope?: 'global' | 'following';
  user_id?: string;
}

export interface LevelLeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar?: string;
  avg_score: number;
  grade: string;
  chart_count: number;
}

export interface LevelLeaderboardResponse {
  mode: string;
  level: number;
  scope: 'global' | 'following';
  scope_user_id: string | null;
  total_users: number;
  leaderboard: LevelLeaderboardEntry[];
}

// --- List types (mirror shapes returned by /api/songs/lists*) ---

/** Free-text grade target a user assigns to a chart in a list. Server stores
 *  whatever string we send; UI typically picks one of these presets. */
export type ListItemTarget = 'PASS' | 'A' | 'AA' | 'AAA' | 'S' | 'SS' | 'SSS' | 'SSS+' | string;

export interface UserListItem {
  id: number;
  chartId: number;
  songTitle: string;
  artist: string;
  mode: string;
  level: number;
  jacketUrl?: string;
  /** User's score on this chart at the moment it was added to the list. */
  originalScore: number;
  originalGrade: string;
  /** True if the user had already passed the chart when they added it. */
  hadPass: boolean;
  /** Progress goal for this entry — 'PASS', 'AAA', 'SSS+', etc. */
  target: ListItemTarget;
  /** Unix ms timestamp the chart was added to the list. */
  addedAt: number;
  sortOrder: number;
  /** Number of attempts logged since the chart was added. */
  attempts: number;
  /** Number of passes logged since the chart was added. */
  passesSinceAdded: number;
  /** User's *current* best score on this chart (live, not at-add-time). */
  bestScore?: number;
  bestGrade?: string;
  /** Server-computed: whether the `target` goal has been met. For PASS,
   *  this means the chart has been passed since being added (or had-pass
   *  was true and the user hasn't broken it since). For grade targets,
   *  this means `bestScore` meets the threshold for that grade. */
  isComplete?: boolean;
}

export interface UserList {
  id: number;
  name: string;
  createdAt: string;
  items: UserListItem[];
}

export interface UserListsResponse {
  lists: UserList[];
}

export interface AddListItemPayload {
  chartId: number;
  songTitle: string;
  artist?: string;
  mode: string;
  level: number;
  jacketUrl?: string;
  originalScore?: number;
  originalGrade?: string;
  hadPass?: boolean;
  target?: ListItemTarget;
  addedAt?: number;
}

// --- Shared lists ---

export interface SharedListOwner {
  id: string;
  username: string;
  avatar?: string;
}

export interface SharedListSummary {
  id: number;
  listId: number;
  name: string;
  conversationId: string;
  owner: SharedListOwner;
  memberCount: number;
  itemCount: number;
  joinedAt?: string | null;
  createdAt: string;
}

/**
 * One member's progress on each chart in a shared list. `isComplete` is the
 * server's source-of-truth (it factors in the target grade, recent attempts,
 * historical pass status, etc.).
 */
export interface SharedListMemberItemResult {
  itemId: number;
  chartId: number;
  attempts: number;
  passesSinceAdded: number;
  bestScore: number;
  bestGrade: string;
  isPass: boolean;
  isComplete: boolean;
}

export interface SharedListMember {
  userId: string;
  username: string;
  avatar?: string;
  joinedAt?: string | null;
  /** Items this member has cleared toward their target. */
  completed: number;
  /** Total items in the list (same for every member). */
  total: number;
  items: SharedListMemberItemResult[];
}

/** A chart in a shared list — same shape as `UserListItem` minus the per-user
 *  attempt counts (those live on `SharedListMember.items` instead). */
export interface SharedListChart {
  id: number;
  chartId: number;
  songTitle: string;
  artist: string;
  mode: string;
  level: number;
  jacketUrl?: string;
  originalScore: number;
  originalGrade: string;
  hadPass: boolean;
  target: ListItemTarget;
  addedAt: number;
  sortOrder: number;
}

export interface SharedListDetail {
  id: number;
  listId: number;
  name: string;
  conversationId: string;
  owner: SharedListOwner;
  isMember: boolean;
  createdAt: string;
  items: SharedListChart[];
  members: SharedListMember[];
}

export type TierListType = 'Pass' | 'Score';
export type TierName = 'Overrated' | 'VeryEasy' | 'Easy' | 'Medium' | 'Hard' | 'VeryHard' | 'Underrated';

export interface TierLevelEntry {
  level: number;
  /** Optional helper fields the server may include (chart counts, etc.). */
  [key: string]: unknown;
}

export interface TiersMetaResponse {
  levels_by_mode: Record<string, TierLevelEntry[]>;
  default_mode?: string;
  default_level?: number;
}

export interface TierChart {
  chart_id: number;
  title: string;
  mode: string;
  level: number;
  jacket_url?: string;
  is_pass?: boolean;
  best_score?: number;
  best_grade?: string;
}

export interface TierGroup {
  name: TierName | string;
  rank: number;
  charts: TierChart[];
}

export interface TiersResponse {
  tier_list_type: TierListType;
  mode: string;
  level: number;
  levels_by_mode?: Record<string, TierLevelEntry[]>;
  tier_order?: string[];
  total_charts?: number;
  tiers: TierGroup[];
}

export type GradeGoalCloseness = 'achieved' | 'within_reach' | 'close' | 'needs_work' | 'unplayed';

export interface GradeGoalChart {
  chart_id: number;
  title: string;
  artist?: string;
  mode: string;
  level: number;
  jacket_url?: string;
  song_key?: string;
  current_score: number;
  current_grade?: string;
  is_pass: boolean;
  target_score: number;
  target_grade: string;
  points_needed: number;
  closeness: GradeGoalCloseness;
  skills?: { slug: string; name: string }[];
}

export interface GradeGoalsResponse {
  user_id: string;
  mode: string;
  level: number;
  target_grade: string;
  target_score: number;
  total_charts: number;
  achieved_count: number;
  played_count: number;
  progress_percent: number;
  charts: GradeGoalChart[];
}

export interface SkillBreakdownEntry {
  slug?: string;
  name?: string;
  total_charts?: number;
  played_charts?: number;
  passed_charts?: number;
  /** Average score across played charts in this skill family. */
  average_score?: number;
  average_grade?: string;
  /** % of charts in the skill played by user (0-100). */
  play_rate?: number;
  /** % of played charts cleared (0-100). */
  pass_rate?: number;
  /** Composite (avg score normalized + pass-rate weighted). Use for ranking. */
  performance_score?: number;
  best_chart?: { song_title?: string; mode?: string; level?: number; score?: number; grade?: string } | null;
  worst_chart?: { song_title?: string; mode?: string; level?: number; score?: number; grade?: string } | null;
  [key: string]: unknown;
}

export interface SkillBreakdownResponse {
  user_id?: string;
  mode?: string;
  min_level?: number | null;
  max_level?: number | null;
  /** Sorted by `performance_score` desc — strongest first. */
  skills?: SkillBreakdownEntry[];
  /** Top 3 skill slugs (matches `skills[*].slug`). */
  strengths?: string[];
  /** Bottom 3 played skill slugs (only present when there are 4+ played skills). */
  weaknesses?: string[];
}

export interface LevelPercentile {
  mode: string;
  level: number;
  rank: number;
  total_users: number;
  percentile: number;
  avg_score?: number;
  badge?: string | null;
}

export interface RankingsResponse {
  user_id?: string;
  pumbility?: number;
  pumbility_percentile?: number | null;
  pumbility_badge?: string | null;
  leaderboard_total?: number;
  scope?: string;
  synced_user_count?: number;
  level_percentiles?: LevelPercentile[];
  [key: string]: unknown;
}

export interface SongAnalyticsLevelBucket {
  level: number;
  cleared_charts: number;
  total_charts: number;
  rating_total: number;
}

export interface SongAnalyticsTotals {
  total_charts: number;
  cleared_charts: number;
  rating_total: number;
  clear_percentage: number;
}

export interface CompetitiveLevelStat {
  level: number;
  average_score?: number;
  average_grade?: string;
  passed_charts?: number;
  total_charts?: number;
  clear_percentage?: number;
}

export interface SongAnalyticsResponse {
  user?: { id?: string; username?: string; avatar?: string; pumbility?: number };
  pumbility?: number;
  computed_pumbility?: number;
  singles_pumbility?: number;
  totals?: {
    single?: SongAnalyticsTotals;
    double?: SongAnalyticsTotals;
    both?: SongAnalyticsTotals;
  };
  levels?: {
    single?: SongAnalyticsLevelBucket[];
    double?: SongAnalyticsLevelBucket[];
    both?: SongAnalyticsLevelBucket[];
  };
  pumbility_breakdown?: {
    overall_top50?: unknown[];
    singles_top50?: unknown[];
    doubles_top50?: unknown[];
  };
  competitive_levels?: { single?: CompetitiveLevelStat | null; double?: CompetitiveLevelStat | null };
  sync?: {
    best_scores_imported?: boolean;
    last_best_scores_sync?: string | null;
    pumbility_value?: number;
  };
}

export type SongsApi = ReturnType<typeof createSongsApi>;

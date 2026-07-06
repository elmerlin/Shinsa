import type { ApiClient } from './client';
import type {
  WeeklyChallengeChartScoresResponse,
  WeeklyChallengeFullWeek,
  WeeklyChallengeWeekIndexEntry,
  WeeklyChallengesHome,
} from './types';

export type WeeklyChallengeChartMode = 'single' | 'double' | 'both';
export type WeeklyChallengeSkillFamily = 'all' | 'intermediate' | 'advanced';
/** WC division. 'main' = the Singles/Doubles picks; 'coop' = the parallel
 *  Co-op WC division (currently 2P charts only). Each division has its own
 *  charts, leaderboard, and aggregation cache on the server. */
export type WeeklyChallengeDivision = 'main' | 'coop';

export function createWeeklyChallengesApi(client: ApiClient) {
  return {
    /** Lightweight summary used by the dashboard / home tile. */
    home() {
      return client.request<WeeklyChallengesHome>('/api/weekly-challenges/home');
    },
    /** All weeks the server knows about, newest first, with status + counts. */
    weeks() {
      return client.request<WeeklyChallengeWeekIndexEntry[]>('/api/weekly-challenges/weeks');
    },
    /** Full week detail including charts, leaderboard, awards, viewer summary.
     *  Pass `'current'` for the live week or any `week_key` (e.g. `2026-W19`).
     *  Filters scope the leaderboard but charts/awards always come back as a
     *  superset so client-side filtering of charts can run cheaply. */
    week(
      weekKey: string | 'current',
      params: {
        chart_mode?: WeeklyChallengeChartMode;
        leaderboard_mode?: WeeklyChallengeChartMode;
        skill_family?: WeeklyChallengeSkillFamily;
        /** Which division to fetch. Defaults to 'main' server-side. */
        division?: WeeklyChallengeDivision;
      } = {},
    ) {
      const search = new URLSearchParams();
      if (params.chart_mode) search.set('chart_mode', params.chart_mode);
      if (params.leaderboard_mode) search.set('leaderboard_mode', params.leaderboard_mode);
      if (params.skill_family) search.set('skill_family', params.skill_family);
      if (params.division) search.set('division', params.division);
      const qs = search.toString();
      return client.request<WeeklyChallengeFullWeek>(
        `/api/weekly-challenges/week/${encodeURIComponent(weekKey)}${qs ? `?${qs}` : ''}`,
      );
    },
    /** Full chart leaderboard (one row per user with their best attempt + replay). */
    chartScores(chartId: number | string) {
      return client.request<WeeklyChallengeChartScoresResponse>(
        `/api/weekly-challenges/charts/${encodeURIComponent(String(chartId))}/scores`,
      );
    },
    /** Profile competitions tab: a user's participation across every
     *  finalized week, with overall/singles/doubles ranks + clears +
     *  any awards earned. Empty array if the user never charted. */
    userHistory(userId: string) {
      return client.request<UserWeeklyChallengeHistoryEntry[]>(
        `/api/weekly-challenges/users/${encodeURIComponent(userId)}/history`,
      );
    },
    /** All-time hall of fame: rating/wins/judgment leaderboards rolled up
     *  across every finalized week. Cached server-side. */
    summary() {
      return client.request<WeeklyChallengeAllTimeSummary>('/api/weekly-challenges/summary');
    },
  };
}

/** One row in an all-time stat leaderboard. `value` is the ranked metric;
 *  the optional fields carry a card-specific secondary number. */
export interface WeeklyChallengePlayerStat {
  user_id: string;
  username: string;
  avatar: string;
  avatar_v?: number;
  nationality: string;
  skill_title?: string;
  value: number;
  charts?: number;
  sss?: number;
  sss_plus?: number;
  points?: number;
}

export interface WeeklyChallengeTopPlay {
  user_id: string;
  username: string;
  avatar: string;
  nationality: string;
  song_title: string;
  mode: string;
  level: number;
  jacket_url: string;
  score: number;
  grade: string;
  plate: string;
  rating_points: number;
  week_key: string;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
}

export interface WeeklyChallengeAllTimeSummary {
  generatedAt: string;
  totals: {
    weeks: number;
    players: number;
    chartsCleared: number;
    ratingPoints: number;
    perfects: number;
    sssPlus: number;
  };
  topPlays: WeeklyChallengeTopPlay[];
  mostRatingPoints: WeeklyChallengePlayerStat[];
  mostSongsCleared: WeeklyChallengePlayerStat[];
  mostPerfects: WeeklyChallengePlayerStat[];
  mostSSS: WeeklyChallengePlayerStat[];
  mostPerfectGames: WeeklyChallengePlayerStat[];
  mostChallenges: WeeklyChallengePlayerStat[];
  wins: {
    overall: WeeklyChallengePlayerStat[];
    singles: WeeklyChallengePlayerStat[];
    doubles: WeeklyChallengePlayerStat[];
  };
  mostPodiums: WeeklyChallengePlayerStat[];
}

export interface UserWeeklyChallengeHistoryEntry {
  week_key: string;
  starts_at_utc: string;
  ends_at_utc: string;
  participant_count: number;
  overall: { rank: number; points: number; clears: number } | null;
  singles: { rank: number; points: number; clears: number } | null;
  doubles: { rank: number; points: number; clears: number } | null;
  awards: { award_key: string; rank: number }[];
}

export type WeeklyChallengesApi = ReturnType<typeof createWeeklyChallengesApi>;

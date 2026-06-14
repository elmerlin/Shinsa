import type { ApiClient } from './client';

// Health / heart-rate API — mirrors server/routes/health.js. HR is captured on
// iOS from HealthKit (Apple Watch workout), correlated to each play's time
// window, and stored server-side so it renders on every platform.

export interface CardioSession {
  workout_uuid: string;
  started_at_utc: string;
  ended_at_utc: string;
  duration_s: number;
  hr_avg: number;
  hr_peak: number;
  hr_min: number;
  calories: number;
  /** BPM-band seconds, e.g. { z1: 120, z2: 300, ... }. */
  zone_seconds: Record<string, number>;
  play_count: number;
  source: string;
}

export interface CardioSessionsResponse {
  sessions: CardioSession[];
}

// Upload shapes (used by the iOS capture/correlation layer).
export interface HeartRatePlayUpload {
  play_id: number;
  hr_avg: number;
  hr_peak: number;
  hr_min?: number;
  hr_series?: number[];
  /** Seconds spanned by the sampled window — the sparkline's x-axis. */
  hr_duration_s?: number;
  source?: 'workout' | 'samples';
}

export interface CardioSessionUpload {
  workout_uuid: string;
  started_at_utc: string;
  ended_at_utc: string;
  duration_s: number;
  hr_avg: number;
  hr_peak: number;
  hr_min?: number;
  calories?: number;
  zone_seconds?: Record<string, number>;
  play_count?: number;
  source?: 'workout' | 'samples';
}

export interface HrProfile {
  max_hr_manual: number;
  max_hr_observed: number;
  max_hr_effective: number;
}

export interface HeartRateUploadResult {
  ok: boolean;
  plays_updated: number;
  session_saved: boolean;
}

export function createHealthApi(client: ApiClient) {
  return {
    // Recent cardio sessions, newest first. Pass user_id to view another
    // player's; omit for the current user.
    cardioSessions(params?: { user_id?: string; limit?: number }) {
      const q = new URLSearchParams();
      if (params?.user_id) q.set('user_id', params.user_id);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return client.request<CardioSessionsResponse>(
        `/api/health/cardio-sessions${qs ? `?${qs}` : ''}`,
      );
    },
    // Max-HR sources (manual / observed / effective) — personalizes HR zones.
    hrProfile(params?: { user_id?: string }) {
      const qs = params?.user_id ? `?user_id=${encodeURIComponent(params.user_id)}` : '';
      return client.request<HrProfile>(`/api/health/hr-profile${qs}`);
    },
    // Set the manual max HR (0 = back to auto).
    setMaxHr(maxHr: number) {
      return client.request<{ ok: boolean } & HrProfile>('/api/health/max-hr', {
        method: 'POST',
        body: { max_hr: maxHr },
      });
    },
    // Lightweight {id, played_at_utc} for plays still missing HR — the
    // device-side history backfill reads HealthKit/Health Connect for each.
    playsNeedingHr(limit = 10000) {
      return client.request<{ plays: { id: number; played_at_utc: string }[] }>(
        `/api/health/plays-needing-hr?limit=${limit}`,
      );
    },
    // Upload per-play HR + an optional cardio session summary.
    uploadHeartRate(payload: { plays: HeartRatePlayUpload[]; session?: CardioSessionUpload }) {
      return client.request<HeartRateUploadResult>('/api/health/heart-rate', {
        method: 'POST',
        body: payload,
      });
    },
  };
}

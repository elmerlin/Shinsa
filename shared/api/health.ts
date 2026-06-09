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
    // Upload per-play HR + an optional cardio session summary.
    uploadHeartRate(payload: { plays: HeartRatePlayUpload[]; session?: CardioSessionUpload }) {
      return client.request<HeartRateUploadResult>('/api/health/heart-rate', {
        method: 'POST',
        body: payload,
      });
    },
  };
}

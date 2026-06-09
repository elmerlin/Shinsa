// Correlate HealthKit heart rate to the user's recently-played scores and
// upload it. Runs after a piugame "recently played" sync (iOS only — gated by
// healthKit.isAvailable, which is false off-iOS). Pure-ish: all the math is
// here; the native reads live behind the healthKit interface.

import { healthApi, piugameApi } from '@/lib/api';
import { healthKit } from '@/lib/healthkit';
import { hrZoneFor } from '@/lib/heartRate';
import type { HrSample, WorkoutWindow } from '@/lib/healthkit-types';
import type { CardioSessionUpload, HeartRatePlayUpload } from '@shared/api';

// A PIU song runs ~1.5–2 min and played_at marks roughly when the score was
// recorded (song end), so we look back further than forward.
const WINDOW_BEFORE_MS = 95_000;
const WINDOW_AFTER_MS = 20_000;
const MAX_SERIES_POINTS = 40;
// Cap the gap credited to a single sample so a watch that stopped sampling
// doesn't dump a huge chunk of time into one zone.
const ZONE_GAP_CAP_MS = 15_000;

interface SyncablePlay {
  id?: number | string;
  play_id?: number | string;
  played_at_utc?: string;
  date_played?: string;
  [key: string]: unknown;
}

interface StampedPlay {
  id: number;
  t: number;
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// 'YYYY-MM-DD HH:MM:SS' (stored UTC) → epoch ms. Falls back to date_played.
function parsePlayedAt(p: SyncablePlay): number {
  const raw = String(p.played_at_utc || p.date_played || '').trim();
  if (!raw) return 0;
  const hasTz = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const norm = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const t = new Date(hasTz ? norm : `${norm}Z`).getTime();
  return Number.isFinite(t) ? t : 0;
}

// epoch ms → 'YYYY-MM-DD HH:MM:SS' UTC (matches the DB's stored format).
function toUtcSql(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// Evenly subsample to at most `max` points, preserving first/last.
function downsample(values: number[], max: number): number[] {
  if (values.length <= max) return values;
  const out: number[] = [];
  for (let i = 0; i < max; i += 1) {
    out.push(values[Math.round((i * (values.length - 1)) / (max - 1))]);
  }
  return out;
}

// Time-in-zone seconds, crediting each sample's zone for the gap until the next.
function zoneSeconds(samples: HrSample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < samples.length; i += 1) {
    const gap = i < samples.length - 1
      ? Math.min(samples[i + 1].t - samples[i].t, ZONE_GAP_CAP_MS)
      : 1000;
    const z = hrZoneFor(samples[i].bpm).key;
    out[z] = (out[z] || 0) + Math.max(0, gap) / 1000;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

function pickBestWorkout(workouts: WorkoutWindow[], plays: StampedPlay[]): WorkoutWindow | null {
  let best: WorkoutWindow | null = null;
  let bestCount = 0;
  for (const w of workouts) {
    const count = plays.filter((p) => p.t >= w.start && p.t <= w.end).length;
    if (count > bestCount || (count === bestCount && best && w.end - w.start > best.end - best.start)) {
      best = w;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
}

/** Outcome of an HR pass — surfaced in the sync feedback so failures are
 * visible instead of silently producing "no HR anywhere". */
export type HrSyncResult =
  | { state: 'unavailable' }   // no HealthKit / Health Connect on this device
  | { state: 'denied' }        // permission not granted
  | { state: 'no-data' }       // permission OK, but no HR samples in the play windows
  | { state: 'uploaded'; uploaded: number }
  | { state: 'error'; message: string };  // native layer threw — message names it

/**
 * Correlate HR for the given plays and upload. Returns a discriminated status —
 * never throws.
 */
export async function syncHeartRateForPlays(plays: SyncablePlay[]): Promise<HrSyncResult> {
  try {
    if (!(await healthKit.isAvailable())) return { state: 'unavailable' };
    if (!(await healthKit.requestPermissions())) return { state: 'denied' };
  } catch (e) {
    return { state: 'error', message: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }

  const stamped: StampedPlay[] = plays
    .map((p) => ({ id: Number(p.id ?? p.play_id), t: parsePlayedAt(p) }))
    .filter((s) => Number.isFinite(s.id) && s.id > 0 && s.t > 0);
  if (!stamped.length) return { state: 'no-data' };

  const minT = Math.min(...stamped.map((s) => s.t)) - WINDOW_BEFORE_MS;
  const maxT = Math.max(...stamped.map((s) => s.t)) + WINDOW_AFTER_MS;

  const [samples, workouts] = await Promise.all([
    healthKit.getHeartRateSamples(minT, maxT),
    healthKit.getWorkoutsInRange(minT, maxT),
  ]);
  if (!samples.length) return { state: 'no-data' };

  const playUploads: HeartRatePlayUpload[] = [];
  for (const { id, t } of stamped) {
    const from = t - WINDOW_BEFORE_MS;
    const to = t + WINDOW_AFTER_MS;
    const win = samples.filter((s) => s.t >= from && s.t <= to);
    if (!win.length) continue;
    const bpms = win.map((s) => s.bpm);
    const inWorkout = workouts.some((w) => t >= w.start && t <= w.end);
    playUploads.push({
      play_id: id,
      hr_avg: Math.round(mean(bpms)),
      hr_peak: Math.max(...bpms),
      hr_min: Math.min(...bpms),
      hr_series: downsample(bpms, MAX_SERIES_POINTS),
      source: inWorkout ? 'workout' : 'samples',
    });
  }

  let session: CardioSessionUpload | undefined;
  const best = pickBestWorkout(workouts, stamped);
  if (best) {
    const wSamples = samples.filter((s) => s.t >= best.start && s.t <= best.end);
    if (wSamples.length) {
      const bpms = wSamples.map((s) => s.bpm);
      session = {
        workout_uuid: best.uuid,
        started_at_utc: toUtcSql(best.start),
        ended_at_utc: toUtcSql(best.end),
        duration_s: Math.round((best.end - best.start) / 1000),
        hr_avg: Math.round(mean(bpms)),
        hr_peak: Math.max(...bpms),
        hr_min: Math.min(...bpms),
        calories: Math.round(best.calories),
        zone_seconds: zoneSeconds(wSamples),
        play_count: stamped.filter((s) => s.t >= best.start && s.t <= best.end).length,
        source: 'workout',
      };
    }
  }

  if (!playUploads.length && !session) return { state: 'no-data' };
  await healthApi.uploadHeartRate({ plays: playUploads, session });
  return { state: 'uploaded', uploaded: playUploads.length };
}

/**
 * Convenience entry point for after a piugame recently-played sync: fetch the
 * user's recent plays, correlate HR, upload. Never throws; returns the outcome
 * so the sync UI can surface it.
 */
export async function syncHeartRateAfterPiugameSync(userId: string): Promise<HrSyncResult> {
  try {
    if (!userId) return { state: 'unavailable' };
    const res = await piugameApi.recentlyPlayed(userId, { limit: 50, sort: 'desc' });
    const plays = (res?.plays || []) as SyncablePlay[];
    if (!plays.length) return { state: 'no-data' };
    return await syncHeartRateForPlays(plays);
  } catch (e) {
    // Best-effort — HR enrichment must never break the sync flow, but the
    // outcome must say what happened.
    return { state: 'error', message: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}

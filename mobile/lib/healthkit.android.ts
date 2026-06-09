// Android Health Connect reader. Health Connect is the device-agnostic hub —
// Garmin, Coros, Fitbit, Samsung, Wear OS, Whoop etc. all sync workouts + HR
// into it, so one API covers every watch brand. Metro resolves this file on
// Android; iOS gets healthkit.ios.ts (HealthKit) and web the no-op stub.
//
// Requires Android 8+ (minSdk 26) and, below Android 14, the Health Connect
// app installed — getSdkStatus reports that, so isAvailable() simply returns
// false on devices without it and the sync stays a silent no-op.

import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import type { Permission } from 'react-native-health-connect';
import type { HealthKitReader, HrSample, WorkoutWindow } from './healthkit-types';

export type { HrSample, WorkoutWindow } from './healthkit-types';

const READ_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
];

// readRecords paginates; HeartRate rows are series records (one per watch
// sync chunk), so a handful of pages covers any realistic play session.
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

let initPromise: Promise<boolean> | null = null;
function ensureInitialized(): Promise<boolean> {
  if (!initPromise) {
    initPromise = initialize().catch(() => {
      initPromise = null;
      return false;
    });
  }
  return initPromise;
}

function toMs(value: unknown): number {
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? t : 0;
}

function between(fromMs: number, toMs2: number) {
  return {
    operator: 'between' as const,
    startTime: new Date(fromMs).toISOString(),
    endTime: new Date(toMs2).toISOString(),
  };
}

function hasHeartRateRead(perms: readonly { accessType?: string; recordType?: string }[]): boolean {
  return perms.some((p) => p?.recordType === 'HeartRate' && p?.accessType === 'read');
}

// Health Connect sessions don't carry energy on the record — aggregate the
// calorie records over the workout window instead (watch apps write those).
async function workoutCalories(startMs: number, endMs: number): Promise<number> {
  try {
    const total = await aggregateRecord({
      recordType: 'TotalCaloriesBurned',
      timeRangeFilter: between(startMs, endMs),
    });
    const kcal = Number(total?.ENERGY_TOTAL?.inKilocalories) || 0;
    if (kcal > 0) return kcal;
  } catch {
    // fall through to active calories
  }
  try {
    const active = await aggregateRecord({
      recordType: 'ActiveCaloriesBurned',
      timeRangeFilter: between(startMs, endMs),
    });
    return Number(active?.ACTIVE_CALORIES_TOTAL?.inKilocalories) || 0;
  } catch {
    return 0;
  }
}

export const healthKit: HealthKitReader = {
  async isAvailable() {
    try {
      if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
      return await ensureInitialized();
    } catch {
      return false;
    }
  },

  async requestPermissions() {
    try {
      if (!(await ensureInitialized())) return false;
      // This runs after every score sync — skip the permission activity when
      // heart-rate read is already granted.
      const granted = await getGrantedPermissions();
      if (hasHeartRateRead(granted)) return true;
      const result = await requestPermission(READ_PERMISSIONS);
      return hasHeartRateRead(result || []);
    } catch {
      return false;
    }
  },

  async getWorkoutsInRange(fromMs, toMs2) {
    try {
      const { records } = await readRecords('ExerciseSession', {
        timeRangeFilter: between(fromMs, toMs2),
      });
      const windows: WorkoutWindow[] = [];
      for (const r of records || []) {
        const start = toMs(r.startTime);
        const end = toMs(r.endTime);
        if (!(start > 0 && end > start)) continue;
        windows.push({
          uuid: String(r.metadata?.id || `${start}-${end}`),
          start,
          end,
          activityType: Number(r.exerciseType) || 0,
          calories: await workoutCalories(start, end),
        });
      }
      return windows.sort((a, b) => b.start - a.start);
    } catch {
      return [];
    }
  },

  async getHeartRateSamples(fromMs, toMs2) {
    try {
      const out: HrSample[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const res = await readRecords('HeartRate', {
          timeRangeFilter: between(fromMs, toMs2),
          pageSize: PAGE_SIZE,
          pageToken,
        });
        for (const r of res?.records || []) {
          for (const s of r.samples || []) {
            const t = toMs(s.time);
            const bpm = Math.round(Number(s.beatsPerMinute) || 0);
            if (t > 0 && bpm > 0) out.push({ t, bpm });
          }
        }
        pageToken = res?.pageToken || undefined;
        if (!pageToken) break;
      }
      return out.sort((a, b) => a.t - b.t);
    } catch {
      return [];
    }
  },
};

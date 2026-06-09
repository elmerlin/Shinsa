// iOS HealthKit reader (Apple Watch heart rate + workouts). Metro resolves
// this file on iOS; web/Android get the no-op healthkit.ts stub, so the native
// module is only ever bundled for iOS. Built on @kingstinct/react-native-healthkit v14.

import {
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
import type { HealthKitReader, WorkoutWindow } from './healthkit-types';

export type { HrSample, WorkoutWindow } from './healthkit-types';

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';

// HK dates come back as Date (or occasionally an ISO string via Nitro) — coerce
// to epoch ms defensively.
function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? t : 0;
}

// Dev-only self-test at import: surfaces native-layer failures in the Metro
// console at app launch (no auth/sync needed to see them).
declare const __DEV__: boolean;

export const healthKit: HealthKitReader = {
  async isAvailable() {
    // No catch: let native/Nitro failures propagate so the sync feedback can
    // show the real error instead of a silent "no HealthKit on this device".
    return await isHealthDataAvailableAsync();
  },

  async requestPermissions() {
    // Read-only: heart rate, active energy (calories), and workouts.
    // No catch — see isAvailable.
    return await requestAuthorization({
      toRead: [HEART_RATE, ACTIVE_ENERGY, WorkoutTypeIdentifier] as never,
    });
  },

  async getWorkoutsInRange(fromMs, toMs2) {
    try {
      const proxies = await queryWorkoutSamples({
        filter: { date: { startDate: new Date(fromMs), endDate: new Date(toMs2) } },
        limit: 0, // all
        ascending: false,
      });
      return (proxies || [])
        .map((p) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const proxy = p as any;
          const w = typeof proxy.toJSON === 'function' ? proxy.toJSON() : proxy;
          const cals = w?.totalEnergyBurned?.quantity;
          return {
            uuid: String(w?.uuid || proxy?.uuid || `${toMs(w?.startDate)}-${toMs(w?.endDate)}`),
            start: toMs(w?.startDate),
            end: toMs(w?.endDate),
            activityType: Number(w?.workoutActivityType) || 0,
            calories: Number(cals) || 0,
          } as WorkoutWindow;
        })
        .filter((w) => w.start > 0 && w.end > w.start);
    } catch (e) {
      console.warn('[healthkit] queryWorkoutSamples failed:', e);
      return [];
    }
  },

  async getHeartRateSamples(fromMs, toMs2) {
    try {
      const samples = await queryQuantitySamples(HEART_RATE, {
        filter: { date: { startDate: new Date(fromMs), endDate: new Date(toMs2) } },
        unit: 'count/min',
        ascending: true,
        limit: 0, // all
      } as never);
      return (samples || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => ({ t: toMs(s.startDate), bpm: Math.round(Number(s.quantity) || 0) }))
        .filter((s) => s.t > 0 && s.bpm > 0);
    } catch (e) {
      console.warn('[healthkit] queryQuantitySamples failed:', e);
      return [];
    }
  },
};

if (__DEV__) {
  healthKit
    .isAvailable()
    .then((ok) => console.log('[healthkit] self-test: isAvailable =', ok))
    .catch((e) => console.warn('[healthkit] self-test threw:', e));
}

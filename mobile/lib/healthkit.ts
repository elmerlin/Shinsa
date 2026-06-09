// Web + Android stub for the HealthKit reader. HealthKit is iOS-only, so off
// iOS every call is a no-op and the native module is never imported (Metro
// resolves healthkit.ios.ts on iOS and this file everywhere else). The Android
// build additionally excludes the module from autolinking (react-native.config.js).

import type { HealthKitReader } from './healthkit-types';

export type { HrSample, WorkoutWindow } from './healthkit-types';

export const healthKit: HealthKitReader = {
  async isAvailable() {
    return false;
  },
  async requestPermissions() {
    return false;
  },
  async getWorkoutsInRange() {
    return [];
  },
  async getHeartRateSamples() {
    return [];
  },
};

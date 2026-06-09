// Shared types for the HealthKit layer. Pure types only — no native imports —
// so both the iOS implementation (healthkit.ios.ts) and the web/Android stub
// (healthkit.ts) can import them without pulling in the native module.

/** A single heart-rate reading. `t` is epoch milliseconds. */
export interface HrSample {
  t: number;
  bpm: number;
}

/** A HealthKit workout's bounds + energy, normalized to plain numbers. */
export interface WorkoutWindow {
  uuid: string;
  start: number; // epoch ms
  end: number; // epoch ms
  /** HKWorkoutActivityType raw value (44 = fitnessGaming). */
  activityType: number;
  /** kcal, 0 if unavailable. */
  calories: number;
}

export interface HealthKitReader {
  /** HealthKit present + data available (always false off-iOS). */
  isAvailable(): Promise<boolean>;
  /** Request read access to heart rate + workouts + active energy. */
  requestPermissions(): Promise<boolean>;
  /** Workouts overlapping [fromMs, toMs], newest first. */
  getWorkoutsInRange(fromMs: number, toMs: number): Promise<WorkoutWindow[]>;
  /** Heart-rate samples within [fromMs, toMs], ascending by time. */
  getHeartRateSamples(fromMs: number, toMs: number): Promise<HrSample[]>;
}

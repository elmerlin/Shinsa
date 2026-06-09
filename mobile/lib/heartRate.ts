// Heart-rate helpers shared by the display layer (and, later, the HealthKit
// capture/correlation). HR is captured on iOS from the Apple Watch workout,
// correlated to each play's time window, and stored server-side so it renders
// on every platform. Zones are simple BPM bands (no age/maxHR needed) — the
// same keys (z1..z5) the server stores in user_cardio_sessions.zone_seconds.

export interface HrZone {
  key: string;
  label: string;
  min: number; // inclusive
  max: number; // exclusive
  color: string;
}

// Ordered low → high. Bands are intentionally simple/absolute so they work
// without knowing the player's age or max HR. Tuned for the ~110–195 range a
// PIU session lives in.
export const HR_ZONES: readonly HrZone[] = [
  { key: 'z1', label: 'Warm up', min: 0, max: 120, color: '#60a5fa' },
  { key: 'z2', label: 'Fat burn', min: 120, max: 140, color: '#34d399' },
  { key: 'z3', label: 'Cardio', min: 140, max: 160, color: '#fde047' },
  { key: 'z4', label: 'Hard', min: 160, max: 180, color: '#fb923c' },
  { key: 'z5', label: 'Peak', min: 180, max: 1000, color: '#f87171' },
];

export function hrZoneFor(bpm: number): HrZone {
  const n = Number(bpm) || 0;
  for (const z of HR_ZONES) {
    if (n >= z.min && n < z.max) return z;
  }
  return HR_ZONES[HR_ZONES.length - 1];
}

export function hrZoneColor(bpm: number): string {
  return hrZoneFor(bpm).color;
}

// Accepts the stored hr_series (JSON string OR already-parsed array) and
// returns a clean number[] of BPM samples.
export function parseHrSeries(raw: unknown): number[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v) => Math.round(Number(v) || 0))
    .filter((n) => n > 0 && n < 300);
}

// Whether a play/score has any HR worth showing.
export function hasHeartRate(d: { hr_avg?: number; hr_peak?: number } | null | undefined): boolean {
  if (!d) return false;
  return (Number(d.hr_avg) || 0) > 0 || (Number(d.hr_peak) || 0) > 0;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Heart-rate helpers shared by the display layer and the capture/correlation
// pipeline. Zones are PERSONALIZED: percentage bands of the player's max HR
// (manual setting → else highest peak ever synced → else DEFAULT_MAX_HR).
// The player's effective max ships with their HR data as `hr_max`, so viewers
// always see the player's own zones. Zone keys (z0..z5) are stored in
// user_cardio_sessions.zone_seconds and must stay stable.

export const DEFAULT_MAX_HR = 190;

export interface HrZoneMeta {
  key: string;
  label: string;
  /** Band bounds as a fraction of max HR. [pctMin, pctMax) */
  pctMin: number;
  pctMax: number;
  color: string;
}

// Ordered low → high. z0 is "below zones" (recovery / between songs).
export const HR_ZONE_META: readonly HrZoneMeta[] = [
  { key: 'z0', label: 'Below zones', pctMin: 0, pctMax: 0.68, color: '#94a3b8' },
  { key: 'z1', label: 'Easy', pctMin: 0.68, pctMax: 0.73, color: '#60a5fa' },
  { key: 'z2', label: 'Steady', pctMin: 0.73, pctMax: 0.8, color: '#34d399' },
  { key: 'z3', label: 'Mod. hard', pctMin: 0.8, pctMax: 0.87, color: '#fde047' },
  { key: 'z4', label: 'Hard', pctMin: 0.87, pctMax: 0.93, color: '#fb923c' },
  { key: 'z5', label: 'Very hard', pctMin: 0.93, pctMax: 10, color: '#f87171' },
];

export interface HrZone extends HrZoneMeta {
  /** Absolute BPM bounds for a given max HR. [min, max) */
  min: number;
  max: number;
}

function normalizeMaxHr(maxHr?: number): number {
  const n = Math.round(Number(maxHr) || 0);
  return n >= 120 && n <= 260 ? n : DEFAULT_MAX_HR;
}

/** Absolute BPM bands for a player's max HR, low → high. */
export function hrZonesFor(maxHr?: number): HrZone[] {
  const mx = normalizeMaxHr(maxHr);
  return HR_ZONE_META.map((z) => ({
    ...z,
    min: Math.round(z.pctMin * mx),
    max: Math.round(Math.min(z.pctMax, 10) * mx),
  }));
}

export function hrZoneFor(bpm: number, maxHr?: number): HrZone {
  const zones = hrZonesFor(maxHr);
  const n = Number(bpm) || 0;
  for (const z of zones) {
    if (n >= z.min && n < z.max) return z;
  }
  return zones[zones.length - 1];
}

export function hrZoneColor(bpm: number, maxHr?: number): string {
  return hrZoneFor(bpm, maxHr).color;
}

export function hrZoneMetaByKey(key: string): HrZoneMeta | undefined {
  return HR_ZONE_META.find((z) => z.key === key);
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

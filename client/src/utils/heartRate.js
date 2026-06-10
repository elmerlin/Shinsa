// Heart-rate zone helpers — mirror of mobile/lib/heartRate.ts. Zones are
// percentage bands of the player's max HR; the player's effective max ships
// with their HR data as `hr_max` so viewers see the player's own zones.

export const DEFAULT_MAX_HR = 190;

export const HR_ZONE_META = [
  { key: 'z0', label: 'Below zones', pctMin: 0, pctMax: 0.68, color: '#94a3b8' },
  { key: 'z1', label: 'Easy', pctMin: 0.68, pctMax: 0.73, color: '#60a5fa' },
  { key: 'z2', label: 'Steady', pctMin: 0.73, pctMax: 0.8, color: '#34d399' },
  { key: 'z3', label: 'Mod. hard', pctMin: 0.8, pctMax: 0.87, color: '#fde047' },
  { key: 'z4', label: 'Hard', pctMin: 0.87, pctMax: 0.93, color: '#fb923c' },
  { key: 'z5', label: 'Very hard', pctMin: 0.93, pctMax: 10, color: '#f87171' },
];

function normalizeMaxHr(maxHr) {
  const n = Math.round(Number(maxHr) || 0);
  return n >= 120 && n <= 260 ? n : DEFAULT_MAX_HR;
}

export function hrZonesFor(maxHr) {
  const mx = normalizeMaxHr(maxHr);
  return HR_ZONE_META.map((z) => ({
    ...z,
    min: Math.round(z.pctMin * mx),
    max: Math.round(Math.min(z.pctMax, 10) * mx),
  }));
}

export function hrZoneFor(bpm, maxHr) {
  const zones = hrZonesFor(maxHr);
  const n = Number(bpm) || 0;
  for (const z of zones) {
    if (n >= z.min && n < z.max) return z;
  }
  return zones[zones.length - 1];
}

export function hrZoneColor(bpm, maxHr) {
  return hrZoneFor(bpm, maxHr).color;
}

export function parseHrSeries(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => Math.round(Number(v) || 0)).filter((n) => n > 0 && n < 300);
}

export function hasHeartRate(d) {
  if (!d) return false;
  return (Number(d.hr_avg) || 0) > 0 || (Number(d.hr_peak) || 0) > 0;
}

/**
 * Tournament format metadata — mirrors client/src/utils/tournamentConstants.js
 * so the mobile app surfaces the same labels + icons + status colors as
 * pumpshinsa.com.
 */

export const FORMAT_LABELS: Record<string, string> = {
  round_robin: 'Round Robin',
  pools: 'Pools',
  single_elim: 'Single Elimination',
  double_elim: 'Double Elimination',
  gauntlet: 'Gauntlet',
  hour_of_power: 'Hour of Power',
  b15: 'Best 15',
};

export const FORMAT_DESCRIPTIONS: Record<string, string> = {
  round_robin: 'Every player plays every other player to determine rankings.',
  pools: 'Players divided into groups, round robin within each.',
  single_elim: 'Single elimination bracket knockout.',
  double_elim: 'Double elimination with losers bracket.',
  gauntlet: 'Lowest ranked plays next lowest — winner stays on and climbs.',
  hour_of_power: '60 min timed session, cumulative rating points.',
  b15: 'Best 15 scores in a time window, like Pumbility but compressed.',
};

export const FORMAT_ICONS: Record<string, string> = {
  round_robin: '🔄',
  pools: '🏊',
  single_elim: '🏆',
  double_elim: '🥊',
  gauntlet: '⚔️',
  hour_of_power: '⏱️',
  b15: '🎯',
};

export const PHASE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Upcoming',
  ACTIVE: 'In Progress',
  COMPLETED: 'Complete',
};

/** Coarse-bucket the tournament's `phase` string into a status label
 *  used for the badge on the list card. */
export function tournamentStatusLabel(phase?: string | null): string {
  const p = String(phase || '').toUpperCase();
  if (p === 'COMPLETED') return 'Completed';
  if (p === 'SETUP') return 'Setup';
  return 'Active';
}

/** Maps the tournament phase to a single accent color for the status pill. */
export function tournamentStatusColor(phase?: string | null): { bg: string; text: string; border: string } {
  const p = String(phase || '').toUpperCase();
  if (p === 'COMPLETED') return { bg: 'rgba(52, 211, 153, 0.18)', text: '#34d399', border: 'rgba(52, 211, 153, 0.45)' };
  if (p === 'SETUP') return { bg: 'rgba(250, 204, 21, 0.18)', text: '#facc15', border: 'rgba(250, 204, 21, 0.45)' };
  return { bg: 'rgba(244, 63, 94, 0.18)', text: '#fb7185', border: 'rgba(244, 63, 94, 0.45)' };
}

/** Pull the tournament's primary format from the enriched server fields,
 *  falling back to config flags then to round_robin. */
export function primaryFormatKey(tournament: { primary_format?: string; config?: unknown } | null | undefined): string {
  if (!tournament) return 'round_robin';
  if (tournament.primary_format) return String(tournament.primary_format);
  const cfg = parseConfig(tournament.config);
  if (cfg?.gauntlet_enabled) return 'gauntlet';
  return 'round_robin';
}

/** Server returns `config` as either a JSON string (list endpoint) or
 *  a parsed object (detail endpoint). Normalize to the object form. */
export function parseConfig(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

/** Date formatter that handles the "YYYY-MM-DD" form (treat as UTC so the
 *  local timezone doesn't shift it back a day) AND ISO timestamps. */
export function formatTournamentDate(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

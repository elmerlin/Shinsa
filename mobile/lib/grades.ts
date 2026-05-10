/**
 * Grade tier helpers — mirrors `client/src/utils/grades.js` so mobile renders
 * the same grade labels and tier coloring as the web.
 */

export interface ParsedGrade {
  raw: string;
  display: string;
  normalized: string;
  isBroken: boolean;
}

export interface ScoreRank {
  label: string;
  /** Tier key — used by `gradeTierColor` to pick the theme color. */
  tier: GradeTier;
}

export type GradeTier = 'sss' | 'ss' | 's' | 'aaa' | 'aa' | 'a' | 'b' | 'c' | 'd' | 'f';

const GRADE_ALIASES: Record<string, string> = {
  AP: 'A+',
  AAP: 'AA+',
  AAAP: 'AAA+',
  SP: 'S+',
  SSP: 'SS+',
  SSSP: 'SSS+',
  A_P: 'A+',
  AA_P: 'AA+',
  AAA_P: 'AAA+',
  S_P: 'S+',
  SS_P: 'SS+',
  SSS_P: 'SSS+',
  STAGEBREAK: 'F',
  STAGE_BREAK: 'F',
};

export function parseGrade(rawGrade: unknown, fallback = ''): ParsedGrade {
  const source = String(rawGrade ?? fallback ?? '').trim();
  if (!source) return { raw: '', display: '', normalized: '', isBroken: false };

  const isBroken = /^x(?:[_-]|$)\s*/i.test(source);
  const stripped = isBroken ? source.replace(/^x(?:[_-]|$)\s*/i, '').trim() : source;
  const compact = stripped.replace(/\s+/g, '').replace(/-/g, '_');
  const upperCompact = compact.toUpperCase();

  const canonical = GRADE_ALIASES[upperCompact] || upperCompact || stripped || source;
  const display = isBroken ? canonical.replace(/\+/g, '').toLowerCase() : canonical;

  return {
    raw: source,
    display,
    normalized: display.toUpperCase(),
    isBroken,
  };
}

export function getScoreRank(score: number | string | null | undefined): ScoreRank {
  const s = parseInt(String(score ?? 0), 10) || 0;
  if (s >= 995000) return { label: 'SSS+', tier: 'sss' };
  if (s >= 990000) return { label: 'SSS', tier: 'sss' };
  if (s >= 985000) return { label: 'SS+', tier: 'ss' };
  if (s >= 980000) return { label: 'SS', tier: 'ss' };
  if (s >= 975000) return { label: 'S+', tier: 's' };
  if (s >= 970000) return { label: 'S', tier: 's' };
  if (s >= 960000) return { label: 'AAA+', tier: 'aaa' };
  if (s >= 950000) return { label: 'AAA', tier: 'aaa' };
  if (s >= 925000) return { label: 'AA+', tier: 'aa' };
  if (s >= 900000) return { label: 'AA', tier: 'aa' };
  if (s >= 825000) return { label: 'A+', tier: 'a' };
  if (s >= 750000) return { label: 'A', tier: 'a' };
  if (s >= 650000) return { label: 'B', tier: 'b' };
  if (s >= 550000) return { label: 'C', tier: 'c' };
  if (s >= 450000) return { label: 'D', tier: 'd' };
  return { label: 'F', tier: 'f' };
}

export function getGradeTier(rawGrade: unknown, score = 0): GradeTier {
  const fallback = getScoreRank(score);
  const normalized = parseGrade(rawGrade, fallback.label).normalized;
  if (normalized.includes('SSS')) return 'sss';
  if (normalized.includes('SS')) return 'ss';
  if (normalized.includes('S')) return 's';
  if (normalized.includes('AAA')) return 'aaa';
  if (normalized.includes('AA')) return 'aa';
  if (normalized === 'A+' || normalized === 'A') return 'a';
  return fallback.tier;
}

export function getGradeDisplayLabel(rawGrade: unknown, score = 0): string {
  const fallback = getScoreRank(score);
  return parseGrade(rawGrade, fallback.label).display || fallback.label;
}

/**
 * Concrete colors per tier — picked from the brand palette + Tailwind defaults
 * so mobile reads identically across light + dark themes (these are colors the
 * tier inherently is, not theme-tinted).
 */
export const TIER_COLORS: Record<GradeTier, string> = {
  sss: '#7dd3fc',  // sky-300
  ss: '#FFC400',   // piu gold
  s: '#fbbf24',    // amber-400
  aaa: '#c0c0c0',  // silver
  aa: '#cd7f32',   // bronze
  a: '#b45309',    // amber-700
  b: '#737373',    // neutral-500
  c: '#737373',
  d: '#525252',    // neutral-600
  f: '#525252',
};

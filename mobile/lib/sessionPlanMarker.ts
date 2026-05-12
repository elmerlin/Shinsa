/**
 * Decodes [[SHINSA_SESSION_PLAN_V1:<base64>]] markers — produced by the
 * "Plan a session" feature when a player shares their training plan.
 * Mirrors `client/src/utils/sessionPlanMarker.js`.
 */

const PLAN_MARKER_REGEX = /\[\[SHINSA_SESSION_PLAN_V1:([A-Za-z0-9+/=_-]+)\]\]/;

export interface SessionPlanSong {
  title?: string;
  mode?: string;
  level?: number;
  jacket_url?: string;
  best_score?: number | null;
  best_grade?: string;
}

export interface SessionPlan {
  generatedAt?: string;
  feeling?: string;
  chartMode?: string;
  pumbility?: number;
  avgRating?: number;
  scoringLevel?: number;
  passingLevel?: number;
  adjustedScoringLevel?: number;
  adjustedPassingLevel?: number;
  skillsTrain?: string[];
  skillsAvoid?: string[];
  activation?: SessionPlanSong[];
  scoring?: SessionPlanSong[];
  passing?: SessionPlanSong[];
  [key: string]: unknown;
}

function decodeUnicodeBase64(value: string): string {
  const bytes = atob(value);
  const encoded = Array.from(bytes)
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('');
  return decodeURIComponent(encoded);
}

export function parseSessionPlanMarker(content: unknown): SessionPlan | null {
  const raw = String(content ?? '');
  const match = raw.match(PLAN_MARKER_REGEX);
  if (!match) return null;
  try {
    const decoded = decodeUnicodeBase64(match[1]);
    return JSON.parse(decoded) as SessionPlan;
  } catch {
    return null;
  }
}

export function splitSessionPlanContent(content: unknown): { text: string; plan: SessionPlan | null } {
  const raw = String(content ?? '');
  const match = raw.match(PLAN_MARKER_REGEX);
  if (!match) return { text: raw, plan: null };
  const plan = parseSessionPlanMarker(raw);
  const text = raw.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, plan };
}

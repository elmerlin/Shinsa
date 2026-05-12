/**
 * Decodes [[SHINSA_SHARE_V1:<base64>]] markers — produced when a player shares
 * a session (or Hour of Power recap) into a post. Mirrors
 * `client/src/utils/sessionShareMarker.js` but only carries the fields the
 * mobile card actually renders.
 */

const SHARE_MARKER_REGEX = /\[\[SHINSA_SHARE_V1:([A-Za-z0-9+/=_-]+)\]\]/;

export interface SessionShareRow {
  song_title?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
  rating_points?: number;
  jacket_url?: string;
  played_at_utc?: string;
}

export interface SessionShare {
  shareType: 'session_share' | 'hour_of_power' | string;
  sessionId?: string;
  sessionTitle?: string;
  streamUrl?: string;
  sessionDateLabel?: string;
  sessionTimeRange?: string;
  sessionDurationLabel?: string;
  sessionMachineName?: string;
  filterMode?: string;
  minGradeLabel?: string;
  levelRangeLabel?: string;
  songCount?: number;
  clearCount?: number;
  clearRate?: number;
  averageScore?: number;
  totalRatingPoints?: number;
  averageRatingPoints?: number;
  averageLevel?: number;
  rows?: SessionShareRow[];
  [key: string]: unknown;
}

function decodeUnicodeBase64(value: string): string {
  const bytes = atob(value);
  const encoded = Array.from(bytes)
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('');
  return decodeURIComponent(encoded);
}

export function parseSessionShareMarker(content: unknown): SessionShare | null {
  const raw = String(content ?? '');
  const match = raw.match(SHARE_MARKER_REGEX);
  if (!match) return null;
  try {
    const decoded = decodeUnicodeBase64(match[1]);
    return JSON.parse(decoded) as SessionShare;
  } catch {
    return null;
  }
}

export function splitSessionShareContent(content: unknown): { text: string; share: SessionShare | null } {
  const raw = String(content ?? '');
  const match = raw.match(SHARE_MARKER_REGEX);
  if (!match) return { text: raw, share: null };
  const share = parseSessionShareMarker(raw);
  const text = raw.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, share };
}

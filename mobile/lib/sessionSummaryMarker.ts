/**
 * Decodes [[SHINSA_SUMMARY_V1:<base64>]] markers — produced when an end-of-
 * session recap is posted. Mirrors `client/src/utils/sessionSummaryMarker.js`.
 */

const SUMMARY_MARKER_REGEX = /\[\[SHINSA_SUMMARY_V1:([A-Za-z0-9+/=_-]+)\]\]/;

export interface SessionSummaryTopSong {
  song_title?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
  rating?: number;
  jacket_url?: string;
}

export interface SessionSummary {
  sessionDateLabel?: string;
  sessionTimeRange?: string;
  sessionDurationMinutes?: number;
  sessionDurationLabel?: string;
  sessionMachineName?: string;
  sessionShoeLabel?: string;
  songCount?: number;
  clearCount?: number;
  clearRate?: number;
  totalSteps?: number;
  estimatedKcal?: number;
  estimatedKcalPerHour?: number;
  singleCount?: number;
  doubleCount?: number;
  otherCount?: number;
  judgmentTotals?: { perfect?: number; great?: number; good?: number; bad?: number; miss?: number };
  perfectRate?: number;
  topSongsByScore?: SessionSummaryTopSong[];
  topSongsByRating?: SessionSummaryTopSong[];
  [key: string]: unknown;
}

function decodeUnicodeBase64(value: string): string {
  const bytes = atob(value);
  const encoded = Array.from(bytes)
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('');
  return decodeURIComponent(encoded);
}

export function parseSessionSummaryMarker(content: unknown): SessionSummary | null {
  const raw = String(content ?? '');
  const match = raw.match(SUMMARY_MARKER_REGEX);
  if (!match) return null;
  try {
    const decoded = decodeUnicodeBase64(match[1]);
    return JSON.parse(decoded) as SessionSummary;
  } catch {
    return null;
  }
}

export function splitSessionSummaryContent(content: unknown): { text: string; summary: SessionSummary | null } {
  const raw = String(content ?? '');
  const match = raw.match(SUMMARY_MARKER_REGEX);
  if (!match) return { text: raw, summary: null };
  const summary = parseSessionSummaryMarker(raw);
  const text = raw.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, summary };
}

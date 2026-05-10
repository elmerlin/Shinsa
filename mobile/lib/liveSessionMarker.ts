/**
 * Detects and decodes [[SHINSA_LIVE_V1:<base64>]] markers embedded in post
 * content. Mirrors `client/src/utils/liveSessionMarker.js` (kept compatible).
 */

const LIVE_MARKER_REGEX = /\[\[SHINSA_LIVE_V1:([A-Za-z0-9+/=_-]+)\]\]/;

export interface LiveSummary {
  sessionId?: string;
  sessionTitle?: string;
  participantRole?: string;
  sessionDateLabel?: string;
  sessionTimeRange?: string;
  sessionDurationLabel?: string;
  sessionMachineName?: string;
  sessionShoeLabel?: string;
  songCount?: number;
  clearCount?: number;
  clearRate?: number;
  perfectRate?: number;
  estimatedKcal?: number;
  averageScore?: number;
  averageLevel?: number;
  messageCount?: number;
  hostUsername?: string;
  streamUrl?: string;
  [key: string]: unknown;
}

export interface ParsedLivePost {
  content: string;
  summary: LiveSummary | null;
}

function decodeUnicodeBase64(value: string): string {
  // atob is available in React Native's JS runtime (Hermes) and on web.
  const bytes = atob(value);
  const encoded = Array.from(bytes)
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('');
  return decodeURIComponent(encoded);
}

export function parseLiveSessionMarker(content: string | null | undefined): ParsedLivePost {
  const text = String(content ?? '');
  const match = text.match(LIVE_MARKER_REGEX);
  if (!match) return { content: text, summary: null };
  try {
    const json = decodeUnicodeBase64(match[1]);
    const summary = JSON.parse(json) as LiveSummary;
    const stripped = text.replace(LIVE_MARKER_REGEX, '').trim();
    return { content: stripped, summary };
  } catch {
    return { content: text, summary: null };
  }
}

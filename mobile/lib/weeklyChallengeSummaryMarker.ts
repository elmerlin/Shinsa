/**
 * Parses `[[SHINSA_WC_SUMMARY_V1:<base64>]]` markers embedded in
 * `weekly_challenge_summary` posts (system-generated weekly recap posts).
 * Mirrors `server/lib/weeklyChallengeSummaryMarker.js#parseWcSummaryMarker`.
 */

const WC_SUMMARY_MARKER_REGEX = /\[\[SHINSA_WC_SUMMARY_V1:([A-Za-z0-9+/=_-]+)\]\]/;

export interface WcPodiumEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
  points: number;
  pg_bonus_points?: number;
  pg_bonus_count?: number;
  clears?: number;
}

export interface WcSuperlativeEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar?: string;
  nationality?: string;
  value: number;
  detail_json?: Record<string, unknown>;
}

export interface WcReplayHighlight {
  user_id: string;
  username: string;
  avatar?: string;
  song_title?: string;
  mode?: string;
  level?: number;
  jacket_url?: string;
  score?: number;
  grade?: string;
  rating_points?: number;
  pg_bonus_points?: number;
  has_pg_bonus?: boolean;
  replay_embed_url?: string;
  highlight_reason?: string;
  play_post_id?: number;
}

export interface WcSummary {
  version: number;
  weekId: number;
  weekKey?: string;
  weekLabel?: string;
  startsAtUtc?: string;
  endsAtUtc?: string;
  participantCount: number;
  totalClears: number;
  chartCount: number;
  topOverallPodium: WcPodiumEntry[];
  awards: {
    overall?: WcPodiumEntry[];
    singles?: WcPodiumEntry[];
    doubles?: WcPodiumEntry[];
    advanced?: WcPodiumEntry[];
    intermediate?: WcPodiumEntry[];
  };
  superlatives: {
    most_sss?: WcSuperlativeEntry[];
    highest_clear_percentage?: WcSuperlativeEntry[];
    highest_clear_rating?: WcSuperlativeEntry[];
    biggest_improvements?: WcSuperlativeEntry[];
  };
  replayHighlights: WcReplayHighlight[];
  nextWeek: {
    weekId: number;
    weekKey?: string;
    weekLabel?: string;
    previewCharts: { song_title?: string; mode?: string; level?: number; jacket_url?: string }[];
  } | null;
  generatedAt?: string;
}

function decodeUnicodeBase64(value: string): string {
  // Hermes/web atob handles base64; we re-encode bytes back to UTF-8.
  const bytes = atob(value);
  const encoded = Array.from(bytes)
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('');
  return decodeURIComponent(encoded);
}

export function parseWcSummaryMarker(content: string | null | undefined): WcSummary | null {
  const raw = String(content ?? '');
  const match = raw.match(WC_SUMMARY_MARKER_REGEX);
  if (!match) return null;
  try {
    const json = decodeUnicodeBase64(match[1]);
    return JSON.parse(json) as WcSummary;
  } catch {
    return null;
  }
}

export function splitWcSummaryContent(content: string | null | undefined): { text: string; summary: WcSummary | null } {
  const raw = String(content ?? '');
  const match = raw.match(WC_SUMMARY_MARKER_REGEX);
  if (!match) return { text: raw, summary: null };
  return {
    text: raw.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim(),
    summary: parseWcSummaryMarker(raw),
  };
}

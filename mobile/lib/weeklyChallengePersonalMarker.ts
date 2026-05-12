/**
 * Parses `[[SHINSA_WC_PERSONAL_V1:<base64>]]` markers embedded in
 * `weekly_challenge_personal` posts (system-generated per-player weekly
 * recap posts that summarise that user's week — clears, podium awards,
 * rankings, highest-rated play, etc).
 *
 * Mirrors `server/lib/weeklyChallengePersonalMarker.js#parseWcPersonalMarker`.
 */

const WC_PERSONAL_MARKER_REGEX = /\[\[SHINSA_WC_PERSONAL_V1:([A-Za-z0-9+/=_-]+)\]\]/;

export interface WcPersonalHighestRatedPlay {
  songTitle: string;
  mode: string;
  level: number;
  jacketUrl: string;
  score: number;
  grade: string;
  ratingPoints: number;
  baseRatingPoints: number;
  pgBonusPoints: number;
  pgBonusPercent: number;
  hasPgBonus: boolean;
}

export interface WcPersonalRankEntry {
  rank: number;
  total: number;
}

export interface WcPersonalPodiumAward {
  awardKey: string;
  awardLabel: string;
  rank: number;
}

export interface WcPersonalBracketComparison {
  bracketName: string;
  bracketRank: number;
  bracketParticipantCount: number;
  bracketAverageScore: number;
}

export interface WcPersonalSummary {
  version: number;
  weekId: number;
  weekKey: string;
  weekLabel: string;
  userId: string;
  username: string;
  avatar: string;
  nationality: string;
  skillFamily: string;
  skillTitle: string;
  averageScore: number;
  highestRatedPlay: WcPersonalHighestRatedPlay | null;
  sssCount: number;
  totalClears: number;
  chartCount: number;
  rankings: {
    overall: WcPersonalRankEntry | null;
    singles: WcPersonalRankEntry | null;
    doubles: WcPersonalRankEntry | null;
  };
  averageRank: number;
  bracketComparison: WcPersonalBracketComparison | null;
  podiums: WcPersonalPodiumAward[];
  generatedAt: string;
}

function decodeUnicodeBase64(value: string): string {
  // Hermes/web atob handles base64; we re-encode bytes back to UTF-8 so any
  // non-ASCII characters (week labels with em-dashes, etc) survive intact.
  const bytes = atob(value);
  const encoded = Array.from(bytes)
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('');
  return decodeURIComponent(encoded);
}

export function parseWcPersonalMarker(content: string | null | undefined): WcPersonalSummary | null {
  const raw = String(content ?? '');
  const match = raw.match(WC_PERSONAL_MARKER_REGEX);
  if (!match) return null;
  try {
    const json = decodeUnicodeBase64(match[1]);
    const parsed = JSON.parse(json);
    // Skip a heavy sanitize step — server already guarantees the shape and
    // the consuming card component defaults missing fields. Keep this
    // light-touch so feed scrolling stays snappy.
    return parsed as WcPersonalSummary;
  } catch {
    return null;
  }
}

export function splitWcPersonalContent(content: string | null | undefined): {
  text: string;
  personal: WcPersonalSummary | null;
} {
  const raw = String(content ?? '');
  const match = raw.match(WC_PERSONAL_MARKER_REGEX);
  if (!match) return { text: raw, personal: null };
  return {
    text: raw.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim(),
    personal: parseWcPersonalMarker(raw),
  };
}

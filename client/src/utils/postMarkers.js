import { parseWcSummaryMarker } from './weeklyChallengeSummaryMarker';
import { parseWcPersonalMarker } from './weeklyChallengePersonalMarker';
import { parseSessionSummaryMarker } from './sessionSummaryMarker';
import { parseSessionShareMarker } from './sessionShareMarker';
import { parseLiveSessionMarker } from './liveSessionMarker';
import { parseSessionPlanMarker } from './sessionPlanMarker';

// Central regex definitions — duplicated from each marker module since they don't export them.
const MARKER_REGEXES = [
  /\[\[SHINSA_WC_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g,
  /\[\[SHINSA_WC_PERSONAL_V1:[A-Za-z0-9+/=_-]+\]\]/g,
  /\[\[SHINSA_SUMMARY_V1:[A-Za-z0-9+/=_-]+\]\]/g,
  /\[\[SHINSA_SHARE_V1:[A-Za-z0-9+/=_-]+\]\]/g,
  /\[\[SHINSA_LIVE_V1:[A-Za-z0-9+/=_-]+\]\]/g,
  /\[\[SHINSA_SESSION_PLAN_V1:[A-Za-z0-9+/=_-]+\]\]/g,
];

export function parseAllMarkers(content) {
  const raw = String(content || '');

  const wcSummary = raw.includes('[[SHINSA_WC_SUMMARY_V1:') ? parseWcSummaryMarker(raw) : null;
  const wcPersonal = raw.includes('[[SHINSA_WC_PERSONAL_V1:') ? parseWcPersonalMarker(raw) : null;
  const sessionSummary = raw.includes('[[SHINSA_SUMMARY_V1:') ? parseSessionSummaryMarker(raw) : null;
  const sessionShare = raw.includes('[[SHINSA_SHARE_V1:') ? parseSessionShareMarker(raw) : null;
  const liveSession = raw.includes('[[SHINSA_LIVE_V1:') ? parseLiveSessionMarker(raw) : null;
  const sessionPlan = raw.includes('[[SHINSA_SESSION_PLAN_V1:') ? parseSessionPlanMarker(raw) : null;

  let text = raw;
  for (const regex of MARKER_REGEXES) {
    text = text.replace(regex, '');
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return { text, wcSummary, wcPersonal, sessionSummary, sessionShare, liveSession, sessionPlan };
}

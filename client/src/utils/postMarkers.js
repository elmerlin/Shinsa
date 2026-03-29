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

  const wcSummary = parseWcSummaryMarker(raw);
  const wcPersonal = parseWcPersonalMarker(raw);
  const sessionSummary = parseSessionSummaryMarker(raw);
  const sessionShare = parseSessionShareMarker(raw);
  const liveSession = parseLiveSessionMarker(raw);
  const sessionPlan = parseSessionPlanMarker(raw);

  let text = raw;
  for (const regex of MARKER_REGEXES) {
    text = text.replace(regex, '');
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return { text, wcSummary, wcPersonal, sessionSummary, sessionShare, liveSession, sessionPlan };
}

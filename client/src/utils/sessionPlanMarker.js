const PLAN_MARKER_PREFIX = '[[SHINSA_SESSION_PLAN_V1:';
const PLAN_MARKER_SUFFIX = ']]';
const PLAN_MARKER_REGEX = /\[\[SHINSA_SESSION_PLAN_V1:([A-Za-z0-9+/=_-]+)\]\]/;

function encodeUnicodeBase64(value) {
  const bytes = encodeURIComponent(String(value || '')).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return btoa(bytes);
}

function decodeUnicodeBase64(value) {
  const bytes = atob(String(value || ''));
  const encoded = Array.from(bytes).map((char) =>
    `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  ).join('');
  return decodeURIComponent(encoded);
}

function sanitizeSong(s) {
  const src = s || {};
  return {
    title: String(src.title || ''),
    mode: String(src.mode || ''),
    level: parseInt(src.level, 10) || 0,
    jacket_url: String(src.jacket_url || ''),
    best_score: src.best_score != null ? parseInt(src.best_score, 10) : null,
    best_grade: String(src.best_grade || ''),
  };
}

function sanitizePlan(plan) {
  const src = plan || {};
  return {
    version: 1,
    generatedAt: String(src.generatedAt || ''),
    feeling: String(src.feeling || 'normal'),
    chartMode: String(src.chartMode || 'both'),
    pumbility: parseInt(src.pumbility, 10) || 0,
    avgRating: Number(src.avgRating) || 0,
    scoringLevel: parseInt(src.scoringLevel, 10) || 0,
    passingLevel: parseInt(src.passingLevel, 10) || 0,
    adjustedScoringLevel: parseInt(src.adjustedScoringLevel, 10) || 0,
    adjustedPassingLevel: parseInt(src.adjustedPassingLevel, 10) || 0,
    skillsTrain: Array.isArray(src.skillsTrain) ? src.skillsTrain.map(String) : [],
    skillsAvoid: Array.isArray(src.skillsAvoid) ? src.skillsAvoid.map(String) : [],
    activation: Array.isArray(src.activation) ? src.activation.map(sanitizeSong) : [],
    scoring: Array.isArray(src.scoring) ? src.scoring.map(sanitizeSong) : [],
    passing: Array.isArray(src.passing) ? src.passing.map(sanitizeSong) : [],
  };
}

export function serializeSessionPlanMarker(plan) {
  const payload = sanitizePlan(plan);
  const encoded = encodeUnicodeBase64(JSON.stringify(payload));
  return `${PLAN_MARKER_PREFIX}${encoded}${PLAN_MARKER_SUFFIX}`;
}

export function parseSessionPlanMarker(content) {
  const raw = String(content || '');
  const match = raw.match(PLAN_MARKER_REGEX);
  if (!match) return null;

  try {
    const decoded = decodeUnicodeBase64(match[1]);
    const parsed = JSON.parse(decoded);
    return sanitizePlan(parsed);
  } catch {
    return null;
  }
}

export function splitSessionPlanContent(content) {
  const raw = String(content || '');
  const match = raw.match(PLAN_MARKER_REGEX);
  if (!match) {
    return { text: raw, plan: null };
  }

  const plan = parseSessionPlanMarker(raw);
  const text = raw
    .replace(match[0], '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, plan };
}

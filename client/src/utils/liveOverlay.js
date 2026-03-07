export const LIVE_OVERLAY_PRESETS = [
  {
    id: 'compact',
    label: 'Compact ticker',
    description: 'Wide lower-third with now playing, result chips, and vote state.',
    defaultWidgets: ['brand', 'viewers', 'play', 'result', 'vote'],
  },
  {
    id: 'results',
    label: 'Results card',
    description: 'Large featured card for score reveals and recap stats.',
    defaultWidgets: ['brand', 'viewers', 'play', 'result', 'requests', 'summary'],
  },
  {
    id: 'chat',
    label: 'Chat rail',
    description: 'Right-side chat strip with reactions and vote pressure.',
    defaultWidgets: ['brand', 'viewers', 'chat', 'reactions', 'vote'],
  },
  {
    id: 'mobile',
    label: 'Player mobile',
    description: 'Tall phone-safe stack for now playing, sync state, and queue info.',
    defaultWidgets: ['brand', 'viewers', 'play', 'result', 'requests', 'vote', 'sync'],
  },
];

export const LIVE_OVERLAY_WIDGETS = [
  { id: 'brand', label: 'Brand' },
  { id: 'viewers', label: 'Viewers' },
  { id: 'play', label: 'Now playing' },
  { id: 'result', label: 'Last result' },
  { id: 'requests', label: 'Requests' },
  { id: 'vote', label: 'Vote' },
  { id: 'summary', label: 'Session recap' },
  { id: 'sync', label: 'Sync status' },
  { id: 'chat', label: 'Chat' },
  { id: 'reactions', label: 'Reactions' },
];

export const LIVE_OVERLAY_THEMES = [
  {
    id: 'arena',
    label: 'Arena Neon',
    surface: 'radial-gradient(circle at top left, rgba(34, 211, 238, 0.22), transparent 46%), radial-gradient(circle at bottom right, rgba(244, 63, 94, 0.18), transparent 42%), linear-gradient(180deg, rgba(6, 10, 22, 0.88), rgba(4, 8, 18, 0.94))',
    chipClass: 'border-white/12 bg-black/28 text-slate-100',
    accentClass: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100',
    strongClass: 'border-rose-400/30 bg-rose-500/12 text-rose-100',
    altClass: 'border-amber-400/28 bg-amber-500/10 text-amber-100',
    faintClass: 'border-white/10 bg-white/6 text-slate-300',
    shadow: 'rgba(34, 211, 238, 0.18)',
  },
  {
    id: 'skyline',
    label: 'Skyline Ice',
    surface: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.22), transparent 48%), radial-gradient(circle at bottom left, rgba(125, 211, 252, 0.2), transparent 42%), linear-gradient(180deg, rgba(8, 15, 30, 0.86), rgba(5, 10, 20, 0.94))',
    chipClass: 'border-white/12 bg-slate-950/35 text-slate-100',
    accentClass: 'border-sky-400/30 bg-sky-500/12 text-sky-100',
    strongClass: 'border-indigo-400/28 bg-indigo-500/12 text-indigo-100',
    altClass: 'border-cyan-400/28 bg-cyan-500/10 text-cyan-100',
    faintClass: 'border-white/10 bg-white/6 text-slate-300',
    shadow: 'rgba(96, 165, 250, 0.2)',
  },
  {
    id: 'ember',
    label: 'Ember Heat',
    surface: 'radial-gradient(circle at top left, rgba(251, 146, 60, 0.24), transparent 48%), radial-gradient(circle at bottom right, rgba(239, 68, 68, 0.2), transparent 42%), linear-gradient(180deg, rgba(17, 9, 12, 0.88), rgba(10, 7, 10, 0.96))',
    chipClass: 'border-white/12 bg-black/30 text-stone-100',
    accentClass: 'border-orange-400/30 bg-orange-500/12 text-orange-100',
    strongClass: 'border-rose-400/28 bg-rose-500/12 text-rose-100',
    altClass: 'border-yellow-400/28 bg-yellow-500/10 text-yellow-100',
    faintClass: 'border-white/10 bg-white/6 text-stone-300',
    shadow: 'rgba(251, 146, 60, 0.2)',
  },
];

const PRESET_MAP = new Map(LIVE_OVERLAY_PRESETS.map((preset) => [preset.id, preset]));
const THEME_MAP = new Map(LIVE_OVERLAY_THEMES.map((theme) => [theme.id, theme]));
const WIDGET_IDS = new Set(LIVE_OVERLAY_WIDGETS.map((widget) => widget.id));

export function normalizeLiveOverlayPreset(value) {
  const id = String(value || '').trim().toLowerCase();
  return PRESET_MAP.has(id) ? id : LIVE_OVERLAY_PRESETS[0].id;
}

export function getLiveOverlayPreset(value) {
  return PRESET_MAP.get(normalizeLiveOverlayPreset(value)) || LIVE_OVERLAY_PRESETS[0];
}

export function normalizeLiveOverlayTheme(value) {
  const id = String(value || '').trim().toLowerCase();
  return THEME_MAP.has(id) ? id : LIVE_OVERLAY_THEMES[0].id;
}

export function getLiveOverlayTheme(value) {
  return THEME_MAP.get(normalizeLiveOverlayTheme(value)) || LIVE_OVERLAY_THEMES[0];
}

export function getDefaultLiveOverlayWidgets(presetId) {
  return [...getLiveOverlayPreset(presetId).defaultWidgets];
}

export function normalizeLiveOverlayWidgets(value, presetId) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  const deduped = [];
  for (const widgetId of source) {
    if (!WIDGET_IDS.has(widgetId) || deduped.includes(widgetId)) continue;
    deduped.push(widgetId);
  }
  return deduped.length > 0 ? deduped : getDefaultLiveOverlayWidgets(presetId);
}

export function buildLiveOverlayUrl(sessionId, options = {}) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return '';

  const params = new URLSearchParams();
  const presetId = normalizeLiveOverlayPreset(options.preset);
  const themeId = normalizeLiveOverlayTheme(options.theme);
  const widgetIds = normalizeLiveOverlayWidgets(options.widgets, presetId);
  const motion = options.motion === false ? '0' : '1';

  params.set('preset', presetId);
  params.set('theme', themeId);
  params.set('widgets', widgetIds.join(','));
  params.set('motion', motion);
  if (options.token) params.set('token', String(options.token).trim());

  const baseUrl = String(options.baseUrl || '').trim().replace(/\/$/, '');
  const path = `/live/${encodeURIComponent(normalizedSessionId)}/overlay?${params.toString()}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

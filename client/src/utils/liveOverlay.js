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

export const LIVE_OVERLAY_FITS = [
  { id: 'wide', label: 'Wide', description: 'Large lower-third or wide results slab.' },
  { id: 'card', label: 'Card', description: 'Compact card sized for corner result scenes.' },
  { id: 'rail', label: 'Rail', description: 'Tall side panel for chat and requests.' },
  { id: 'phone', label: 'Phone', description: 'Narrow portrait-friendly layout.' },
  { id: 'full', label: 'Full', description: 'Stretch the overlay across most of the scene.' },
];

export const LIVE_OVERLAY_ANCHORS = [
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
];

export const LIVE_OVERLAY_AUTO_HIDE_MODES = [
  { id: 'off', label: 'Always On', description: 'Keep the overlay visible at all times.' },
  { id: 'smart', label: 'Smart Idle', description: 'Fade when the room is quiet, reveal on plays, chat, and votes.' },
  { id: 'results', label: 'Results Burst', description: 'Stay hidden until a play lands or a vote is active.' },
  { id: 'chat', label: 'Chat Pulse', description: 'Show for fresh chat/reactions and active votes.' },
];

export const LIVE_OVERLAY_SCENES = [
  {
    id: 'gameplay',
    label: 'Gameplay Lower Third',
    description: 'Wide lower-third for gameplay scenes with score and vote info.',
    options: {
      preset: 'compact',
      theme: 'arena',
      fit: 'wide',
      anchor: 'bottom-center',
      widgets: ['brand', 'viewers', 'play', 'result', 'vote'],
      motion: true,
      guides: false,
      autoHide: 'smart',
    },
  },
  {
    id: 'results',
    label: 'Results Reveal',
    description: 'Corner card for post-song score reveals and recap stats.',
    options: {
      preset: 'results',
      theme: 'ember',
      fit: 'card',
      anchor: 'bottom-right',
      widgets: ['brand', 'viewers', 'play', 'result', 'requests', 'summary'],
      motion: true,
      guides: false,
      autoHide: 'results',
    },
  },
  {
    id: 'chat',
    label: 'Chat Sidecar',
    description: 'Right rail that keeps chat, reactions, and live votes visible.',
    options: {
      preset: 'chat',
      theme: 'skyline',
      fit: 'rail',
      anchor: 'top-right',
      widgets: ['brand', 'viewers', 'chat', 'reactions', 'vote'],
      motion: true,
      guides: false,
      autoHide: 'chat',
    },
  },
  {
    id: 'mobile',
    label: 'Mobile Companion',
    description: 'Narrow portrait HUD for a phone or vertical side scene.',
    options: {
      preset: 'mobile',
      theme: 'arena',
      fit: 'phone',
      anchor: 'top-left',
      widgets: ['brand', 'viewers', 'play', 'result', 'requests', 'vote', 'sync'],
      motion: true,
      guides: false,
      autoHide: 'smart',
    },
  },
];

const PRESET_MAP = new Map(LIVE_OVERLAY_PRESETS.map((preset) => [preset.id, preset]));
const THEME_MAP = new Map(LIVE_OVERLAY_THEMES.map((theme) => [theme.id, theme]));
const FIT_MAP = new Map(LIVE_OVERLAY_FITS.map((fit) => [fit.id, fit]));
const ANCHOR_MAP = new Map(LIVE_OVERLAY_ANCHORS.map((anchor) => [anchor.id, anchor]));
const AUTO_HIDE_MAP = new Map(LIVE_OVERLAY_AUTO_HIDE_MODES.map((mode) => [mode.id, mode]));
const SCENE_MAP = new Map(LIVE_OVERLAY_SCENES.map((scene) => [scene.id, scene]));
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

export function normalizeLiveOverlayFit(value) {
  const id = String(value || '').trim().toLowerCase();
  return FIT_MAP.has(id) ? id : LIVE_OVERLAY_FITS[0].id;
}

export function getLiveOverlayFit(value) {
  return FIT_MAP.get(normalizeLiveOverlayFit(value)) || LIVE_OVERLAY_FITS[0];
}

export function normalizeLiveOverlayAnchor(value) {
  const id = String(value || '').trim().toLowerCase();
  return ANCHOR_MAP.has(id) ? id : LIVE_OVERLAY_ANCHORS[1].id;
}

export function getLiveOverlayAnchor(value) {
  return ANCHOR_MAP.get(normalizeLiveOverlayAnchor(value)) || LIVE_OVERLAY_ANCHORS[1];
}

export function normalizeLiveOverlayAutoHide(value) {
  const id = String(value || '').trim().toLowerCase();
  return AUTO_HIDE_MAP.has(id) ? id : LIVE_OVERLAY_AUTO_HIDE_MODES[0].id;
}

export function getLiveOverlayAutoHide(value) {
  return AUTO_HIDE_MAP.get(normalizeLiveOverlayAutoHide(value)) || LIVE_OVERLAY_AUTO_HIDE_MODES[0];
}

export function normalizeLiveOverlayScene(value) {
  const id = String(value || '').trim().toLowerCase();
  return SCENE_MAP.has(id) ? id : '';
}

export function getLiveOverlayScene(value) {
  return SCENE_MAP.get(normalizeLiveOverlayScene(value)) || null;
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

export function normalizeLiveOverlayGuides(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function getLiveOverlaySceneOptions(sceneId) {
  const scene = getLiveOverlayScene(sceneId);
  if (!scene) return null;
  return {
    preset: normalizeLiveOverlayPreset(scene.options?.preset),
    theme: normalizeLiveOverlayTheme(scene.options?.theme),
    fit: normalizeLiveOverlayFit(scene.options?.fit),
    anchor: normalizeLiveOverlayAnchor(scene.options?.anchor),
    widgets: normalizeLiveOverlayWidgets(scene.options?.widgets, scene.options?.preset),
    motion: scene.options?.motion !== false,
    guides: normalizeLiveOverlayGuides(scene.options?.guides),
    autoHide: normalizeLiveOverlayAutoHide(scene.options?.autoHide),
  };
}

export function buildLiveOverlayUrl(sessionId, options = {}) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return '';

  const params = new URLSearchParams();
  const presetId = normalizeLiveOverlayPreset(options.preset);
  const themeId = normalizeLiveOverlayTheme(options.theme);
  const fitId = normalizeLiveOverlayFit(options.fit);
  const anchorId = normalizeLiveOverlayAnchor(options.anchor);
  const autoHideId = normalizeLiveOverlayAutoHide(options.autoHide);
  const widgetIds = normalizeLiveOverlayWidgets(options.widgets, presetId);
  const motion = options.motion === false ? '0' : '1';
  const guides = normalizeLiveOverlayGuides(options.guides) ? '1' : '0';
  const sceneId = normalizeLiveOverlayScene(options.scene);

  params.set('preset', presetId);
  params.set('theme', themeId);
  params.set('fit', fitId);
  params.set('anchor', anchorId);
  params.set('widgets', widgetIds.join(','));
  params.set('motion', motion);
  params.set('guides', guides);
  params.set('autohide', autoHideId);
  if (sceneId) params.set('scene', sceneId);
  if (options.token) params.set('token', String(options.token).trim());

  const baseUrl = String(options.baseUrl || '').trim().replace(/\/$/, '');
  const path = `/live/${encodeURIComponent(normalizedSessionId)}/overlay?${params.toString()}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

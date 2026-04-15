import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSongTierMeta, getSongTiers } from '../utils/api';
import { parseGrade } from '../utils/grades';

const TIER_LIST_TYPE = 'Pass';
const MODE_ORDER = ['Single', 'Double', 'CoOp'];
const MODE_PREFIX = { Single: 'S', Double: 'D', CoOp: 'C' };
const MODE_LABEL = { Single: 'Singles', Double: 'Doubles', CoOp: 'Co-Op' };

// Pump It Up color conventions: Singles = red, Doubles = green, Co-Op = yellow.
// `accent` is the full-saturation stripe color, mirroring the TIER_STYLE shape so
// the sticky header's mode pill matches the tier banner design language.
const MODE_STYLE = {
  Single: {
    bg: 'bg-piu-accent/[0.08]',
    hoverBg: 'hover:bg-piu-accent/[0.14]',
    activeBg: 'active:bg-piu-accent/[0.18]',
    accent: 'bg-piu-accent',
    text: 'text-piu-accent',
    hoverText: 'group-hover:text-piu-accent',
  },
  Double: {
    bg: 'bg-emerald-500/[0.08]',
    hoverBg: 'hover:bg-emerald-500/[0.14]',
    activeBg: 'active:bg-emerald-500/[0.18]',
    accent: 'bg-emerald-400',
    text: 'text-emerald-300',
    hoverText: 'group-hover:text-emerald-200',
  },
  CoOp: {
    bg: 'bg-amber-500/[0.08]',
    hoverBg: 'hover:bg-amber-500/[0.14]',
    activeBg: 'active:bg-amber-500/[0.18]',
    accent: 'bg-amber-400',
    text: 'text-amber-200',
    hoverText: 'group-hover:text-amber-100',
  },
};
const MODE_STYLE_FALLBACK = MODE_STYLE.Single;
const OVERLAY_MIN = 20;
const OVERLAY_MAX = 100;
const JACKET_OPACITY_MIN = 10;
const JACKET_OPACITY_MAX = 100;
const SONGS_PER_ROW_OPTIONS = [4, 5, 6, 7];

const TIER_STYLE = {
  Overrated:  { bg: 'bg-indigo-500/[0.09]',  accent: 'bg-indigo-400',  text: 'text-indigo-200'  },
  VeryEasy:   { bg: 'bg-cyan-500/[0.09]',    accent: 'bg-cyan-400',    text: 'text-cyan-200'    },
  Easy:       { bg: 'bg-emerald-500/[0.09]', accent: 'bg-emerald-400', text: 'text-emerald-200' },
  Medium:     { bg: 'bg-yellow-500/[0.10]',  accent: 'bg-yellow-400',  text: 'text-yellow-100'  },
  Hard:       { bg: 'bg-orange-500/[0.10]',  accent: 'bg-orange-400',  text: 'text-orange-200'  },
  VeryHard:   { bg: 'bg-rose-500/[0.10]',    accent: 'bg-rose-400',    text: 'text-rose-200'    },
  Underrated: { bg: 'bg-red-500/[0.12]',     accent: 'bg-red-500',     text: 'text-red-300'     },
};

const TIER_STYLE_FALLBACK = { bg: 'bg-slate-500/10', accent: 'bg-slate-400', text: 'text-slate-200' };

const TIER_LABEL = {
  Overrated: 'Overrated',
  VeryEasy: 'Very easy',
  Easy: 'Easy',
  Medium: 'Medium',
  Hard: 'Hard',
  VeryHard: 'Very hard',
  Underrated: 'Underrated',
};

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'single' || mode === 's') return 'Single';
  if (mode === 'double' || mode === 'd') return 'Double';
  if (mode === 'coop' || mode === 'co-op' || mode === 'co op' || mode === 'c') return 'CoOp';
  return '';
}

function parseIntSafe(value, fallback = null) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampOverlaySize(value) {
  const parsed = parseIntSafe(value, 78);
  return Math.min(OVERLAY_MAX, Math.max(OVERLAY_MIN, parsed));
}

function clampSongsPerRow(value) {
  const parsed = parseIntSafe(value, 4);
  return SONGS_PER_ROW_OPTIONS.includes(parsed) ? parsed : 4;
}

function clampJacketOpacity(value) {
  const parsed = parseIntSafe(value, 60);
  return Math.min(JACKET_OPACITY_MAX, Math.max(JACKET_OPACITY_MIN, parsed));
}

function getRank(score) {
  const s = parseInt(score, 10) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

function getGradeColor(grade, score = 0) {
  const normalized = parseGrade(grade).normalized;
  if (normalized) {
    if (normalized.includes('SSS')) return 'text-sky-300';
    if (normalized.includes('SS')) return 'text-piu-gold';
    if (normalized.includes('S')) return 'text-amber-400';
    if (normalized.includes('AAA')) return 'text-piu-silver';
    if (normalized.includes('AA')) return 'text-piu-bronze';
    if (normalized === 'A+' || normalized === 'A') return 'text-amber-700';
  }
  return getRank(score).color;
}

function formatOverlayScore(score) {
  const value = parseInt(score, 10) || 0;
  return (value / 10000).toFixed(1);
}

function nearestLevel(levels, targetLevel) {
  if (!Array.isArray(levels) || levels.length === 0) return null;
  if (levels.some((entry) => entry.level === targetLevel)) return targetLevel;
  let best = levels[0].level;
  let bestDist = Math.abs(best - targetLevel);
  for (const entry of levels) {
    const dist = Math.abs(entry.level - targetLevel);
    if (dist < bestDist) {
      best = entry.level;
      bestDist = dist;
    }
  }
  return best;
}

function SettingsModal({
  open,
  displayMode,
  setDisplayMode,
  overlaySize,
  setOverlaySize,
  jacketOpacity,
  setJacketOpacity,
  showUnplayed,
  setShowUnplayed,
  showEmptyTiers,
  setShowEmptyTiers,
  hideCoOp,
  setHideCoOp,
  defaultMode,
  setDefaultMode,
  defaultLevel,
  setDefaultLevel,
  defaultModeChoices,
  defaultLevelOptions,
  songsPerRow,
  setSongsPerRow,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-piu-border bg-piu-card shadow-2xl p-4 space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-sm text-piu-accent">TIER SETTINGS</h3>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-white">Close</button>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 font-display">Overlay Display</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDisplayMode('grade')}
              className={`rounded-lg border px-2 py-1.5 text-xs font-display ${displayMode === 'grade' ? 'border-piu-accent text-piu-accent bg-piu-accent/10' : 'border-piu-border text-gray-300'}`}
            >
              Grade
            </button>
            <button
              onClick={() => setDisplayMode('score')}
              className={`rounded-lg border px-2 py-1.5 text-xs font-display ${displayMode === 'score' ? 'border-piu-accent text-piu-accent bg-piu-accent/10' : 'border-piu-border text-gray-300'}`}
            >
              Score
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 font-display">Overlay Size</p>
            <span className="text-[11px] font-display text-gray-300">{overlaySize}%</span>
          </div>
          <input
            type="range"
            min={OVERLAY_MIN}
            max={OVERLAY_MAX}
            step={1}
            value={overlaySize}
            onChange={(event) => setOverlaySize(clampOverlaySize(event.target.value))}
            className="w-full accent-piu-accent"
          />
          <p className="text-[10px] text-gray-500">20% minimum, 100% maximum.</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 font-display">Jacket Opacity</p>
            <span className="text-[11px] font-display text-gray-300">{jacketOpacity}%</span>
          </div>
          <input
            type="range"
            min={JACKET_OPACITY_MIN}
            max={JACKET_OPACITY_MAX}
            step={1}
            value={jacketOpacity}
            onChange={(event) => setJacketOpacity(clampJacketOpacity(event.target.value))}
            className="w-full accent-piu-accent"
          />
          <p className="text-[10px] text-gray-500">Lower values make grade overlays easier to read.</p>
        </div>

        <label className="flex items-center justify-between text-xs text-gray-300">
          <span>Show unplayed charts</span>
          <input
            type="checkbox"
            checked={showUnplayed}
            onChange={(event) => setShowUnplayed(event.target.checked)}
            className="accent-piu-accent"
          />
        </label>

        <label className="flex items-center justify-between text-xs text-gray-300">
          <span>Show empty tiers</span>
          <input
            type="checkbox"
            checked={showEmptyTiers}
            onChange={(event) => setShowEmptyTiers(event.target.checked)}
            className="accent-piu-accent"
          />
        </label>

        <label className="flex items-center justify-between text-xs text-gray-300">
          <span>Don&apos;t show CoOp</span>
          <input
            type="checkbox"
            checked={hideCoOp}
            onChange={(event) => setHideCoOp(event.target.checked)}
            className="accent-piu-accent"
          />
        </label>

        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 font-display">Default Tier Level</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDefaultMode('Double')}
              disabled={!defaultModeChoices.includes('Double')}
              className={`rounded-lg border px-2 py-1.5 text-xs font-display disabled:opacity-40 disabled:cursor-not-allowed ${defaultMode === 'Double' ? 'border-piu-accent text-piu-accent bg-piu-accent/10' : 'border-piu-border text-gray-300'}`}
            >
              Doubles
            </button>
            <button
              onClick={() => setDefaultMode('Single')}
              disabled={!defaultModeChoices.includes('Single')}
              className={`rounded-lg border px-2 py-1.5 text-xs font-display disabled:opacity-40 disabled:cursor-not-allowed ${defaultMode === 'Single' ? 'border-piu-accent text-piu-accent bg-piu-accent/10' : 'border-piu-border text-gray-300'}`}
            >
              Singles
            </button>
          </div>
          {defaultLevelOptions.length > 0 ? (
            <select
              value={String(defaultLevel || '')}
              onChange={(event) => setDefaultLevel(parseIntSafe(event.target.value, defaultLevel || 18))}
              className="w-full bg-piu-dark border border-piu-border rounded-lg text-xs py-1.5 px-2 text-gray-200 focus:outline-none focus:border-piu-accent/50"
            >
              {defaultLevelOptions.map((entry) => (
                <option key={entry.level} value={entry.level}>
                  {(MODE_PREFIX[defaultMode] || '?')}{entry.level}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-[11px] text-gray-500">No levels available for this mode.</div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 font-display">Songs Per Row</p>
          <div className="grid grid-cols-4 gap-2">
            {SONGS_PER_ROW_OPTIONS.map((count) => (
              <button
                key={count}
                onClick={() => setSongsPerRow(count)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-display ${songsPerRow === count ? 'border-piu-accent text-piu-accent bg-piu-accent/10' : 'border-piu-border text-gray-300'}`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function JacketOverlayText({
  text,
  colorClass,
  baseFontRem,
  overlaySize,
  fitTemplate,
  isBroken = false,
}) {
  const frameRef = useRef(null);
  const widthRef = useRef(null);
  const measureRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);

  const hasPlus = typeof text === 'string' && text.endsWith('+') && text.length > 1;
  const mainText = hasPlus ? text.slice(0, -1) : text;

  useEffect(() => {
    const frameEl = frameRef.current;
    const widthEl = widthRef.current;
    const measureEl = measureRef.current;
    if (!frameEl || !widthEl || !measureEl) return undefined;

    let raf = null;
    const recalc = () => {
      const availW = widthEl.clientWidth;
      const availH = frameEl.clientHeight * 0.92;
      const textW = measureEl.scrollWidth;
      const textH = measureEl.scrollHeight;

      let next = 1;
      if (availW > 0 && textW > 0) next = Math.min(next, availW / textW);
      if (availH > 0 && textH > 0) next = Math.min(next, availH / textH);
      if (!Number.isFinite(next) || next <= 0) next = 1;

      setFitScale((prev) => {
        const rounded = Number(next.toFixed(3));
        return Math.abs(prev - rounded) < 0.01 ? prev : rounded;
      });
    };

    const schedule = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(recalc);
    };

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(frameEl);
      observer.observe(widthEl);
    }

    window.addEventListener('resize', schedule);
    schedule();

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [baseFontRem, overlaySize, fitTemplate, text]);

  return (
    <div ref={frameRef} className="absolute inset-0 pointer-events-none">
      <div
        ref={widthRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
        style={{
          width: `${overlaySize}%`,
          maxWidth: '100%',
          maxHeight: '100%',
          paddingInline: '2px',
          boxSizing: 'border-box',
        }}
      >
        <span
          ref={measureRef}
          aria-hidden="true"
          className="absolute opacity-0 pointer-events-none whitespace-nowrap font-display font-black leading-none"
          style={{
            fontSize: `${baseFontRem}rem`,
            lineHeight: 1,
          }}
        >
          {fitTemplate}
        </span>
        <span
          className={`inline-flex items-start justify-center whitespace-nowrap text-center font-display font-black italic ${colorClass} ${isBroken ? 'grade-broken' : ''}`}
          data-grade={text}
          style={{
            fontSize: `${baseFontRem}rem`,
            transform: `scale(${fitScale})`,
            transformOrigin: 'center center',
            lineHeight: 1,
            letterSpacing: '-0.12em',
            WebkitTextStroke: '4px rgba(20,10,0,0.95)',
            paintOrder: 'stroke fill',
            filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.65)) drop-shadow(0 0 5px rgba(0,0,0,0.35))',
          }}
        >
          <span style={{ lineHeight: 1 }}>{mainText}</span>
          {hasPlus && (
            <span
              style={{
                fontSize: '0.6em',
                lineHeight: 1,
                marginLeft: '-0.05em',
                marginTop: '-0.05em',
                color: 'rgb(239, 68, 68)',
                letterSpacing: 'normal',
                WebkitTextStroke: '2.5px rgba(20,10,0,0.95)',
                paintOrder: 'stroke fill',
              }}
            >
              +
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export default function TiersPage() {
  const { user } = useAuth();
  const captureRef = useRef(null);
  const [meta, setMeta] = useState(null);
  const [mode, setMode] = useState('');
  const [level, setLevel] = useState(null);
  const [data, setData] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingTier, setLoadingTier] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState(() => localStorage.getItem('tiers_display_mode') || 'grade');
  const [showUnplayed, setShowUnplayed] = useState(() => localStorage.getItem('tiers_show_unplayed') !== '0');
  const [showEmptyTiers, setShowEmptyTiers] = useState(() => localStorage.getItem('tiers_show_empty') === '1');
  const [hideCoOp, setHideCoOp] = useState(() => localStorage.getItem('tiers_hide_coop') !== '0');
  const [overlaySize, setOverlaySize] = useState(() => clampOverlaySize(localStorage.getItem('tiers_overlay_size')));
  const [jacketOpacity, setJacketOpacity] = useState(() => clampJacketOpacity(localStorage.getItem('tiers_jacket_opacity')));
  const [defaultMode, setDefaultMode] = useState(() => {
    const stored = normalizeMode(localStorage.getItem('tiers_default_mode'));
    return stored === 'Single' || stored === 'Double' ? stored : 'Double';
  });
  const [defaultLevel, setDefaultLevel] = useState(() => parseIntSafe(localStorage.getItem('tiers_default_level'), 18));
  const [songsPerRow, setSongsPerRow] = useState(() => clampSongsPerRow(localStorage.getItem('tiers_songs_per_row')));
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);

  useEffect(() => {
    localStorage.setItem('tiers_display_mode', displayMode);
  }, [displayMode]);

  useEffect(() => {
    localStorage.setItem('tiers_show_unplayed', showUnplayed ? '1' : '0');
  }, [showUnplayed]);

  useEffect(() => {
    localStorage.setItem('tiers_show_empty', showEmptyTiers ? '1' : '0');
  }, [showEmptyTiers]);

  useEffect(() => {
    localStorage.setItem('tiers_hide_coop', hideCoOp ? '1' : '0');
  }, [hideCoOp]);

  useEffect(() => {
    localStorage.setItem('tiers_overlay_size', String(overlaySize));
  }, [overlaySize]);

  useEffect(() => {
    localStorage.setItem('tiers_jacket_opacity', String(jacketOpacity));
  }, [jacketOpacity]);

  useEffect(() => {
    localStorage.setItem('tiers_default_mode', defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    localStorage.setItem('tiers_default_level', String(defaultLevel));
  }, [defaultLevel]);

  useEffect(() => {
    localStorage.setItem('tiers_songs_per_row', String(songsPerRow));
  }, [songsPerRow]);

  useEffect(() => {
    if (!mode) return;
    localStorage.setItem('tiers_last_mode', mode);
  }, [mode]);

  useEffect(() => {
    if (!level) return;
    localStorage.setItem('tiers_last_level', String(level));
  }, [level]);

  useEffect(() => {
    let alive = true;
    setLoadingMeta(true);
    setError('');

    getSongTierMeta({ tier_list_type: TIER_LIST_TYPE })
      .then((response) => {
        if (!alive) return;
        setMeta(response);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || 'Failed to load tier metadata.');
      })
      .finally(() => {
        if (!alive) return;
        setLoadingMeta(false);
      });

    return () => { alive = false; };
  }, []);

  const modeChoices = useMemo(() => {
    const levelsByMode = meta?.levels_by_mode || {};
    return MODE_ORDER.filter((candidate) => {
      if (hideCoOp && candidate === 'CoOp') return false;
      return Array.isArray(levelsByMode[candidate]) && levelsByMode[candidate].length > 0;
    });
  }, [meta, hideCoOp]);

  const defaultModeChoices = useMemo(() => {
    const levelsByMode = meta?.levels_by_mode || {};
    return ['Double', 'Single'].filter((candidate) => Array.isArray(levelsByMode[candidate]) && levelsByMode[candidate].length > 0);
  }, [meta]);

  useEffect(() => {
    if (defaultModeChoices.length === 0) return;
    if (!defaultModeChoices.includes(defaultMode)) {
      setDefaultMode(defaultModeChoices[0]);
    }
  }, [defaultModeChoices, defaultMode]);

  const defaultLevelOptions = useMemo(() => {
    const rows = meta?.levels_by_mode?.[defaultMode];
    return Array.isArray(rows) ? rows : [];
  }, [meta, defaultMode]);

  useEffect(() => {
    if (defaultLevelOptions.length === 0) return;
    if (!defaultLevelOptions.some((entry) => entry.level === defaultLevel)) {
      setDefaultLevel(nearestLevel(defaultLevelOptions, defaultLevel || 18));
    }
  }, [defaultLevelOptions, defaultLevel]);

  useEffect(() => {
    if (!meta) return;
    const levelsByMode = meta?.levels_by_mode || {};

    const resolveChoice = (targetMode, targetLevel) => {
      const normalizedMode = normalizeMode(targetMode);
      if (!modeChoices.includes(normalizedMode)) return null;
      const levels = Array.isArray(levelsByMode[normalizedMode]) ? levelsByMode[normalizedMode] : [];
      if (levels.length === 0) return null;
      return {
        mode: normalizedMode,
        level: nearestLevel(levels, parseIntSafe(targetLevel, levels[0].level)),
      };
    };

    if (!mode || !level) {
      const remembered = resolveChoice(localStorage.getItem('tiers_last_mode'), localStorage.getItem('tiers_last_level'));
      const configuredDefault = resolveChoice(defaultMode, defaultLevel);
      const metaDefault = resolveChoice(meta.default_mode, meta.default_level);
      const fallbackMode = modeChoices[0];
      const fallbackLevels = fallbackMode ? (levelsByMode[fallbackMode] || []) : [];
      const fallback = fallbackMode && fallbackLevels.length > 0
        ? { mode: fallbackMode, level: fallbackLevels[0].level }
        : null;
      const picked = remembered || configuredDefault || metaDefault || fallback;
      if (picked) {
        setMode(picked.mode);
        setLevel(picked.level);
      }
      return;
    }

    const currentLevels = Array.isArray(levelsByMode[mode]) ? levelsByMode[mode] : [];
    if (!modeChoices.includes(mode) || currentLevels.length === 0) {
      const fallback = resolveChoice(defaultMode, defaultLevel)
        || resolveChoice(meta.default_mode, meta.default_level)
        || resolveChoice(modeChoices[0], null);
      if (fallback) {
        setMode(fallback.mode);
        setLevel(fallback.level);
      }
      return;
    }

    if (!currentLevels.some((entry) => entry.level === level)) {
      setLevel(nearestLevel(currentLevels, level));
    }
  }, [meta, modeChoices, mode, level, defaultMode, defaultLevel]);

  useEffect(() => {
    if (!mode || !level) return;
    let alive = true;
    setLoadingTier(true);
    setError('');

    const params = {
      tier_list_type: TIER_LIST_TYPE,
      mode,
      level: String(level),
    };
    if (user?.id) params.user_id = user.id;

    getSongTiers(params)
      .then((response) => {
        if (!alive) return;
        setData(response);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || 'Failed to load tier data.');
      })
      .finally(() => {
        if (!alive) return;
        setLoadingTier(false);
      });

    return () => { alive = false; };
  }, [mode, level, user?.id]);

  const levelsForMode = useMemo(() => {
    const rows = meta?.levels_by_mode?.[mode];
    return Array.isArray(rows) ? rows : [];
  }, [meta, mode]);

  const currentLevelIndex = useMemo(
    () => levelsForMode.findIndex((entry) => entry.level === level),
    [levelsForMode, level]
  );

  const canGoPrev = currentLevelIndex > 0;
  const canGoNext = currentLevelIndex >= 0 && currentLevelIndex < levelsForMode.length - 1;

  const tiersForRender = useMemo(() => {
    const source = Array.isArray(data?.tiers) ? data.tiers : [];
    const transformed = source
      .map((tier) => {
        const charts = Array.isArray(tier.charts) ? tier.charts : [];
        const visibleCharts = showUnplayed ? charts : charts.filter((chart) => chart.is_pass);
        const sortedCharts = [...visibleCharts].sort((a, b) => {
          const aCleared = a.is_pass ? 1 : 0;
          const bCleared = b.is_pass ? 1 : 0;
          if (aCleared !== bCleared) return bCleared - aCleared;
          return (parseInt(b.best_score, 10) || 0) - (parseInt(a.best_score, 10) || 0);
        });
        return {
          ...tier,
          charts: sortedCharts,
        };
      })
      .filter((tier) => showEmptyTiers || tier.charts.length > 0);

    return transformed.sort((a, b) => (b.rank || 0) - (a.rank || 0));
  }, [data, showUnplayed, showEmptyTiers]);

  const handleModeCycle = () => {
    if (modeChoices.length <= 1) return;
    const currentIdx = Math.max(0, modeChoices.indexOf(mode));
    const nextMode = modeChoices[(currentIdx + 1) % modeChoices.length];
    const nextLevels = meta?.levels_by_mode?.[nextMode] || [];
    const nextLevel = nearestLevel(nextLevels, level);
    setMode(nextMode);
    setLevel(nextLevel);
  };

  const goPrevLevel = () => {
    if (!canGoPrev) return;
    const next = levelsForMode[currentLevelIndex - 1];
    setLevel(next.level);
  };

  const goNextLevel = () => {
    if (!canGoNext) return;
    const next = levelsForMode[currentLevelIndex + 1];
    setLevel(next.level);
  };

  const captureTierImage = async () => {
    if (!captureRef.current || captureBusy) return;
    setCaptureBusy(true);
    setCaptureMode(true);
    setError('');
    try {
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      });

      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(captureRef.current, {
        backgroundColor: '#071326',
        pixelRatio: 2,
      });
      const download = document.createElement('a');
      const levelLabel = `${MODE_PREFIX[mode] || '?'}${level || '-'}`;
      download.download = `tiers-${levelLabel}.png`;
      download.href = dataUrl;
      download.click();
    } catch (err) {
      setError(err?.message || 'Failed to create tier image.');
    } finally {
      setCaptureMode(false);
      setCaptureBusy(false);
    }
  };

  const modeStyle = MODE_STYLE[mode] || MODE_STYLE_FALLBACK;

  return (
    <div ref={captureRef} className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      {captureMode && (
        <div className="rounded-xl border border-piu-border/60 bg-piu-card/80 px-4 py-3 text-center">
          <h1 className="font-display inline-flex items-baseline justify-center gap-2">
            <span className={`text-[11px] font-bold uppercase tracking-[0.28em] ${modeStyle.text}`}>
              {MODE_LABEL[mode] || '—'}
            </span>
            <span className="text-3xl font-black leading-none tracking-wide text-white">
              {level || '-'}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-gray-400">
              Scores
            </span>
          </h1>
        </div>
      )}

      <div className={`${captureMode ? 'hidden' : 'sticky top-[56px] sm:top-[64px] z-30'} rounded-xl border border-piu-border/30 bg-piu-card/85 backdrop-blur-sm px-2 py-1.5 sm:px-3 sm:py-2`}>
        <div className="grid grid-cols-[96px_auto_96px] items-center">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={goPrevLevel}
              disabled={!canGoPrev}
              className="w-11 h-11 rounded-md text-gray-500 hover:text-white hover:bg-white/[0.05] active:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 transition-colors flex items-center justify-center"
              aria-label="Previous level"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={captureTierImage}
              disabled={captureBusy}
              className="w-11 h-11 rounded-md text-gray-500 hover:text-white hover:bg-white/[0.05] active:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 transition-colors flex items-center justify-center"
              aria-label="Download tier image"
              title="Download tier image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={handleModeCycle}
            className={`group justify-self-center relative flex items-baseline gap-2.5 pl-4 pr-3.5 py-1.5 rounded-md overflow-hidden ${modeStyle.bg} ${modeStyle.hoverBg} ${modeStyle.activeBg} transition-colors`}
            title="Switch mode"
          >
            <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-[3px] ${modeStyle.accent}`} />
            <span className={`font-display font-semibold text-[11px] uppercase tracking-[0.22em] ${modeStyle.text} ${modeStyle.hoverText}`}>
              {MODE_LABEL[mode] || '—'}
            </span>
            <span className="font-display font-extrabold text-[22px] leading-none tracking-tight text-white tabular-nums">
              {level || '-'}
            </span>
          </button>

          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-11 h-11 rounded-md text-gray-500 hover:text-white hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors flex items-center justify-center"
              aria-label="Tier settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </button>
            <button
              type="button"
              onClick={goNextLevel}
              disabled={!canGoNext}
              className="w-11 h-11 rounded-md text-gray-500 hover:text-white hover:bg-white/[0.05] active:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 transition-colors flex items-center justify-center"
              aria-label="Next level"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {(loadingMeta || loadingTier) && (
        <div className="rounded-xl border border-piu-border bg-piu-card/70 p-6 text-center text-sm text-gray-400 font-display">
          Loading tiers...
        </div>
      )}

      {!loadingMeta && !loadingTier && error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loadingMeta && !loadingTier && !error && tiersForRender.length === 0 && (
        <div className="rounded-xl border border-piu-border bg-piu-card/70 p-6 text-center text-sm text-gray-400">
          No tier rows found for this level.
        </div>
      )}

      {!loadingMeta && !loadingTier && !error && tiersForRender.map((tier) => {
        const style = TIER_STYLE[tier.name] || TIER_STYLE_FALLBACK;
        return (
          <section key={tier.name} className="rounded-xl overflow-hidden border border-piu-border/60 bg-piu-card/40">
            <div className={`relative flex items-center px-3.5 sm:px-4 py-2 border-b border-piu-border/40 ${style.bg}`}>
              <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-[3px] ${style.accent}`} />
              <span className={`font-display text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] ${style.text}`}>
                {TIER_LABEL[tier.name] || tier.name}
              </span>
            </div>
            <div className="p-2 sm:p-3 bg-[#061327]">
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${songsPerRow}, minmax(0, 1fr))` }}>
                {tier.charts.map((chart) => {
                  const parsedGrade = parseGrade(chart.best_grade, getRank(chart.best_score).label);
                  const overlayText = displayMode === 'score'
                    ? formatOverlayScore(chart.best_score)
                    : parsedGrade.display;
                  const overlayTemplate = displayMode === 'score' ? '100.0' : 'SSS+';
                  const overlayColor = getGradeColor(parsedGrade.display, chart.best_score);
                  const overlayBaseRem = displayMode === 'score' ? 1.2 : 1.45;
                  const overlayScale = overlaySize / 65;
                  const overlayFontRem = Math.max(0.7, Math.min(2.2, overlayBaseRem * overlayScale));

                  return (
                    <Link
                      key={chart.chart_id}
                      to={`/songs/chart/${chart.chart_id}`}
                      className="relative group rounded overflow-hidden border border-piu-border/50 bg-piu-dark/80 hover:border-piu-accent/60 transition-colors"
                      title={`${chart.title} (${MODE_PREFIX[chart.mode] || '?'}${chart.level})`}
                    >
                      {chart.jacket_url ? (
                        <img
                          src={chart.jacket_url}
                          alt={chart.title}
                          className="w-full aspect-[16/10] object-cover"
                          style={{ opacity: jacketOpacity / 100 }}
                        />
                      ) : (
                        <div className="w-full aspect-[16/10] bg-piu-dark" />
                      )}
                      {chart.is_pass && chart.best_score > 0 && (
                        <JacketOverlayText
                          text={overlayText}
                          colorClass={overlayColor}
                          baseFontRem={overlayFontRem}
                          overlaySize={overlaySize}
                          fitTemplate={overlayTemplate}
                          isBroken={displayMode === 'grade' && parsedGrade.isBroken}
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      <SettingsModal
        open={settingsOpen}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        overlaySize={overlaySize}
        setOverlaySize={setOverlaySize}
        jacketOpacity={jacketOpacity}
        setJacketOpacity={setJacketOpacity}
        showUnplayed={showUnplayed}
        setShowUnplayed={setShowUnplayed}
        showEmptyTiers={showEmptyTiers}
        setShowEmptyTiers={setShowEmptyTiers}
        hideCoOp={hideCoOp}
        setHideCoOp={setHideCoOp}
        defaultMode={defaultMode}
        setDefaultMode={setDefaultMode}
        defaultLevel={defaultLevel}
        setDefaultLevel={setDefaultLevel}
        defaultModeChoices={defaultModeChoices}
        defaultLevelOptions={defaultLevelOptions}
        songsPerRow={songsPerRow}
        setSongsPerRow={setSongsPerRow}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

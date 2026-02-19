import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSongTierMeta, getSongTiers } from '../utils/api';

const TIER_LIST_TYPE = 'Pass';
const MODE_ORDER = ['Single', 'Double', 'CoOp'];
const MODE_PREFIX = { Single: 'S', Double: 'D', CoOp: 'C' };
const OVERLAY_MIN = 20;
const OVERLAY_MAX = 100;
const SONGS_PER_ROW_OPTIONS = [4, 5, 6, 7];

const TIER_STYLE = {
  Overrated: 'bg-indigo-500 text-white',
  VeryEasy: 'bg-cyan-500 text-white',
  Easy: 'bg-emerald-500 text-white',
  Medium: 'bg-yellow-500 text-black',
  Hard: 'bg-orange-500 text-white',
  VeryHard: 'bg-rose-500 text-white',
  Underrated: 'bg-red-700 text-white',
};

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
  const parsed = parseIntSafe(value, 65);
  return Math.min(OVERLAY_MAX, Math.max(OVERLAY_MIN, parsed));
}

function clampSongsPerRow(value) {
  const parsed = parseIntSafe(value, 4);
  return SONGS_PER_ROW_OPTIONS.includes(parsed) ? parsed : 4;
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
  const normalized = String(grade || '').toUpperCase();
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
}) {
  const frameRef = useRef(null);
  const widthRef = useRef(null);
  const measureRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);

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
          className={`inline-flex items-center justify-center whitespace-nowrap text-center font-display font-black ${colorClass}`}
          style={{
            fontSize: `${baseFontRem}rem`,
            transform: `scale(${fitScale})`,
            transformOrigin: 'center center',
            lineHeight: 1,
            textShadow: '0 0 8px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95)',
          }}
        >
          {text}
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
        return {
          ...tier,
          charts: visibleCharts,
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

      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#071326',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const download = document.createElement('a');
      const levelLabel = `${MODE_PREFIX[mode] || '?'}${level || '-'}`;
      download.download = `tiers-${levelLabel}.png`;
      download.href = canvas.toDataURL('image/png');
      download.click();
    } catch (err) {
      setError(err?.message || 'Failed to create tier image.');
    } finally {
      setCaptureMode(false);
      setCaptureBusy(false);
    }
  };

  return (
    <div ref={captureRef} className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      {captureMode && (
        <div className="rounded-xl border border-piu-border/60 bg-piu-card/80 p-3 text-center">
          <h1 className="font-display font-black text-2xl tracking-wide text-white">
            {(MODE_PREFIX[mode] || '?')}{level || '-'} Scores
          </h1>
        </div>
      )}

      <div className={`${captureMode ? 'hidden' : 'sticky top-[56px] sm:top-[64px] z-30'} rounded-xl border border-piu-border bg-piu-card/90 backdrop-blur-sm p-3 sm:p-4`}>
        <div className="grid grid-cols-[100px_auto_100px] items-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrevLevel}
              disabled={!canGoPrev}
              className="w-11 h-11 rounded-lg bg-piu-dark border border-piu-border text-gray-300 hover:text-white disabled:opacity-40 flex items-center justify-center"
              aria-label="Previous level"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={captureTierImage}
              disabled={captureBusy}
              className="w-11 h-11 rounded-lg bg-piu-dark border border-piu-border text-gray-300 hover:text-white disabled:opacity-40 flex items-center justify-center"
              aria-label="Download tier image"
              title="Download tier image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h13A2.5 2.5 0 0121 7.5v9a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 16.5v-9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8.5h2.5l1-1.5h3l1 1.5H17" />
                <circle cx="12" cy="13" r="3.25" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={handleModeCycle}
            className="justify-self-center px-4 py-1.5 rounded-lg bg-piu-dark border border-piu-border font-display font-black text-2xl tracking-wide"
            title="Switch mode"
          >
            {(MODE_PREFIX[mode] || '?')}{level || '-'}
          </button>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-11 h-11 rounded-lg bg-piu-dark border border-piu-border text-gray-300 hover:text-white flex items-center justify-center"
              aria-label="Tier settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1 1 0 011.9 0l.31 1.24a1 1 0 00.95.757h1.3a1 1 0 01.75 1.66l-.97 1.11a1 1 0 000 1.318l.97 1.11a1 1 0 01-.75 1.66h-1.3a1 1 0 00-.95.757l-.31 1.24a1 1 0 01-1.9 0l-.31-1.24a1 1 0 00-.95-.757h-1.3a1 1 0 01-.75-1.66l.97-1.11a1 1 0 000-1.318l-.97-1.11a1 1 0 01.75-1.66h1.3a1 1 0 00.95-.757l.31-1.24z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={goNextLevel}
              disabled={!canGoNext}
              className="w-11 h-11 rounded-lg bg-piu-dark border border-piu-border text-gray-300 hover:text-white disabled:opacity-40 flex items-center justify-center"
              aria-label="Next level"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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
        const style = TIER_STYLE[tier.name] || 'bg-slate-600 text-white';
        return (
          <section key={tier.name} className="rounded-xl overflow-hidden border border-piu-border/60 bg-piu-card/40">
            <div className={`px-3 py-2 font-display font-bold text-lg text-center ${style}`}>
              {TIER_LABEL[tier.name] || tier.name}
            </div>
            <div className="p-2 sm:p-3 bg-[#061327]">
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${songsPerRow}, minmax(0, 1fr))` }}>
                {tier.charts.map((chart) => {
                  const overlayGrade = chart.best_grade || getRank(chart.best_score).label;
                  const overlayText = displayMode === 'score'
                    ? formatOverlayScore(chart.best_score)
                    : overlayGrade;
                  const overlayTemplate = displayMode === 'score' ? '100.0' : 'SSS+';
                  const overlayColor = getGradeColor(overlayGrade, chart.best_score);
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
                        <img src={chart.jacket_url} alt={chart.title} className="w-full aspect-[16/10] object-cover opacity-90" />
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

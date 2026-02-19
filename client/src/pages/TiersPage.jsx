import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSongTierMeta, getSongTiers } from '../utils/api';

const TIER_LIST_TYPE = 'Pass';
const MODE_ORDER = ['Single', 'Double', 'CoOp'];
const MODE_PREFIX = { Single: 'S', Double: 'D', CoOp: 'C' };

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
  showUnplayed,
  setShowUnplayed,
  showEmptyTiers,
  setShowEmptyTiers,
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
      </div>
    </div>
  );
}

export default function TiersPage() {
  const { user } = useAuth();
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
    let alive = true;
    setLoadingMeta(true);
    setError('');

    getSongTierMeta({ tier_list_type: TIER_LIST_TYPE })
      .then((response) => {
        if (!alive) return;
        setMeta(response);
        setMode((prev) => prev || response.default_mode || 'Double');
        setLevel((prev) => prev || response.default_level || null);
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

  const modeChoices = useMemo(() => {
    const levelsByMode = meta?.levels_by_mode || {};
    return MODE_ORDER.filter((m) => Array.isArray(levelsByMode[m]) && levelsByMode[m].length > 0);
  }, [meta]);

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

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      <div className="rounded-xl border border-piu-border bg-piu-card/80 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrevLevel}
            disabled={!canGoPrev}
            className="w-10 h-10 rounded-lg bg-piu-dark border border-piu-border text-gray-300 hover:text-white disabled:opacity-40"
            aria-label="Previous level"
          >
            &#8592;
          </button>

          <button
            type="button"
            onClick={handleModeCycle}
            className="px-4 py-1.5 rounded-lg bg-piu-dark border border-piu-border font-display font-black text-2xl tracking-wide"
            title="Tap to switch mode"
          >
            {(MODE_PREFIX[mode] || '?')}{level || '-'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-10 h-10 rounded-lg bg-piu-dark border border-piu-border text-gray-300 hover:text-white"
              aria-label="Tier settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1 1 0 011.9 0l.31 1.24a1 1 0 00.95.757h1.3a1 1 0 01.75 1.66l-.97 1.11a1 1 0 000 1.318l.97 1.11a1 1 0 01-.75 1.66h-1.3a1 1 0 00-.95.757l-.31 1.24a1 1 0 01-1.9 0l-.31-1.24a1 1 0 00-.95-.757h-1.3a1 1 0 01-.75-1.66l.97-1.11a1 1 0 000-1.318l-.97-1.11a1 1 0 01.75-1.66h1.3a1 1 0 00.95-.757l.31-1.24z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={goNextLevel}
              disabled={!canGoNext}
              className="w-10 h-10 rounded-lg bg-piu-dark border border-piu-border text-gray-300 hover:text-white disabled:opacity-40"
              aria-label="Next level"
            >
              &#8594;
            </button>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-gray-500 text-center font-display">
          Tap <span className="text-gray-300">S/D/C + level</span> to switch mode
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
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                {tier.charts.map((chart) => {
                  const overlayGrade = chart.best_grade || getRank(chart.best_score).label;
                  const overlayText = displayMode === 'score'
                    ? formatOverlayScore(chart.best_score)
                    : overlayGrade;
                  const overlayColor = getGradeColor(overlayGrade, chart.best_score);

                  return (
                    <Link
                      key={chart.chart_id}
                      to={`/songs/chart/${chart.chart_id}`}
                      className="relative group rounded overflow-hidden border border-piu-border/50 bg-piu-dark/80 hover:border-piu-accent/60 transition-colors"
                      title={`${chart.title} (${MODE_PREFIX[chart.mode] || '?'}${chart.level})`}
                    >
                      {chart.jacket_url ? (
                        <img src={chart.jacket_url} alt={chart.title} className="w-full aspect-[16/10] object-cover" />
                      ) : (
                        <div className="w-full aspect-[16/10] bg-piu-dark" />
                      )}
                      {chart.is_pass && chart.best_score > 0 && (
                        <div className={`absolute right-1 bottom-1 px-1.5 py-0.5 rounded bg-black/75 border border-white/10 text-[10px] font-display font-black leading-none ${overlayColor}`}>
                          {overlayText}
                        </div>
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
        showUnplayed={showUnplayed}
        setShowUnplayed={setShowUnplayed}
        showEmptyTiers={showEmptyTiers}
        setShowEmptyTiers={setShowEmptyTiers}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

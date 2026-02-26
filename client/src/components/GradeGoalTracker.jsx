import React, { useEffect, useState, useMemo } from 'react';
import { getGradeGoals } from '../utils/api';

const GRADE_OPTIONS = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA+', 'AAA', 'AA+', 'AA', 'A+', 'A'];

function getGradeColor(grade) {
  const g = String(grade || '').toUpperCase();
  if (g.includes('SSS')) return 'text-sky-300';
  if (g.includes('SS')) return 'text-piu-gold';
  if (g.includes('S')) return 'text-amber-400';
  if (g.includes('AAA')) return 'text-piu-silver';
  if (g.includes('AA')) return 'text-piu-bronze';
  if (g === 'A+' || g === 'A') return 'text-amber-700';
  return 'text-gray-500';
}

function getGradeBg(grade) {
  const g = String(grade || '').toUpperCase();
  if (g.includes('SSS')) return 'bg-sky-400/15 border-sky-400/40';
  if (g.includes('SS')) return 'bg-yellow-400/15 border-yellow-400/40';
  if (g.includes('S')) return 'bg-amber-400/15 border-amber-400/40';
  if (g.includes('AAA')) return 'bg-gray-400/15 border-gray-400/40';
  if (g.includes('AA')) return 'bg-orange-400/15 border-orange-400/40';
  return 'bg-amber-700/15 border-amber-700/40';
}

function closenessColor(closeness) {
  if (closeness === 'achieved') return 'border-l-emerald-400';
  if (closeness === 'within_reach') return 'border-l-sky-400';
  if (closeness === 'close') return 'border-l-amber-400';
  if (closeness === 'needs_work') return 'border-l-red-400';
  return 'border-l-gray-600';
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

export default function GradeGoalTracker({ userId, analyticsLevels }) {
  const [mode, setMode] = useState('Single');
  const [level, setLevel] = useState(null);
  const [targetGrade, setTargetGrade] = useState('S');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const availableLevels = useMemo(() => {
    if (!analyticsLevels) return [];
    const source = mode === 'Single'
      ? analyticsLevels.single || []
      : analyticsLevels.double || [];
    return source
      .filter((row) => (row.cleared_charts || 0) > 0)
      .map((row) => row.level)
      .sort((a, b) => a - b);
  }, [analyticsLevels, mode]);

  useEffect(() => {
    if (availableLevels.length > 0 && (!level || !availableLevels.includes(level))) {
      setLevel(availableLevels[availableLevels.length - 1]);
    }
  }, [availableLevels, level]);

  useEffect(() => {
    if (!userId || !level || !targetGrade) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getGradeGoals(userId, { mode, level: String(level), target_grade: targetGrade })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load goals');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, mode, level, targetGrade]);

  const filtered = useMemo(() => {
    if (!data?.charts) return [];
    if (filter === 'all') return data.charts;
    return data.charts.filter((c) => c.closeness === filter);
  }, [data, filter]);

  const filterCounts = useMemo(() => {
    if (!data?.charts) return {};
    const counts = { all: data.charts.length, within_reach: 0, close: 0, needs_work: 0, achieved: 0, unplayed: 0 };
    for (const c of data.charts) {
      if (counts[c.closeness] !== undefined) counts[c.closeness] += 1;
    }
    return counts;
  }, [data]);

  if (!analyticsLevels) return null;

  return (
    <div className="card">
      <h3 className="text-xs font-display font-bold tracking-wide text-piu-accent mb-3">GRADE GOAL TRACKER</h3>

      {/* Config row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* Mode toggle */}
        <div className="flex rounded-md overflow-hidden border border-piu-border/40">
          {['Single', 'Double'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs font-display font-bold transition-colors ${
                mode === m
                  ? m === 'Single' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                  : 'bg-piu-dark text-gray-400 hover:text-white'
              }`}
            >
              {m === 'Single' ? 'Singles' : 'Doubles'}
            </button>
          ))}
        </div>

        {/* Level selector */}
        <select
          value={level || ''}
          onChange={(e) => setLevel(parseInt(e.target.value, 10) || null)}
          className="bg-piu-dark border border-piu-border/40 text-white rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-piu-accent/50"
        >
          {availableLevels.map((l) => (
            <option key={l} value={l}>Lv. {l}</option>
          ))}
        </select>

        {/* Grade selector */}
        <div className="flex flex-wrap gap-1">
          {GRADE_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => setTargetGrade(g)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-display font-bold border transition-colors ${
                targetGrade === g
                  ? `${getGradeBg(g)} ${getGradeColor(g)}`
                  : 'border-piu-border/30 text-gray-500 hover:text-gray-300'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / Error */}
      {loading && <p className="text-center text-gray-500 py-4 text-xs animate-pulse">Loading goals...</p>}
      {error && <p className="text-center text-red-400 py-4 text-xs">{error}</p>}

      {data && !loading && (
        <>
          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-300">
                <span className="font-mono font-bold text-white">{data.achieved_count}</span>
                {' / '}
                <span className="font-mono">{data.total_charts}</span>
                {' charts at '}
                <span className={`font-display font-bold ${getGradeColor(data.target_grade)}`}>{data.target_grade}</span>
                {' or better'}
              </span>
              <span className="text-xs font-mono text-piu-accent">{data.progress_percent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-piu-dark/80 border border-piu-border/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-piu-accent to-pink-400 transition-all duration-500"
                style={{ width: `${Math.min(100, data.progress_percent)}%` }}
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {[
              { key: 'all', label: 'All' },
              { key: 'within_reach', label: 'Within Reach' },
              { key: 'close', label: 'Close' },
              { key: 'needs_work', label: 'Needs Work' },
              { key: 'achieved', label: 'Achieved' },
              { key: 'unplayed', label: 'Unplayed' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-display transition-colors ${
                  filter === key
                    ? 'bg-piu-accent/20 text-piu-accent border border-piu-accent/40'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                {label}
                {filterCounts[key] !== undefined ? ` (${filterCounts[key]})` : ''}
              </button>
            ))}
          </div>

          {/* Chart list */}
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {filtered.map((chart) => (
              <div
                key={chart.chart_id}
                className={`rounded-lg border border-piu-border/40 bg-piu-dark/45 px-2.5 py-2 border-l-[3px] ${closenessColor(chart.closeness)}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative w-14 h-9 rounded overflow-hidden border border-piu-border/40 shrink-0">
                    {chart.jacket_url ? (
                      <img src={chart.jacket_url} alt={chart.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-piu-dark flex items-center justify-center text-[9px] text-gray-600">No art</div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-body text-gray-100 truncate">{chart.title}</p>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      {chart.closeness === 'achieved' ? (
                        <span className="text-[11px] font-display font-bold text-emerald-400">Achieved</span>
                      ) : chart.closeness === 'unplayed' ? (
                        <span className="text-[11px] text-gray-500">Not yet played</span>
                      ) : (
                        <span className="text-[11px] text-gray-400">
                          <span className={`font-display font-bold ${getGradeColor(chart.current_grade)}`}>{chart.current_grade || 'F'}</span>
                          {' '}
                          <span className="font-mono text-gray-300">{formatNumber(chart.current_score)}</span>
                        </span>
                      )}
                      {chart.closeness !== 'achieved' && chart.closeness !== 'unplayed' && (
                        <span className="text-[11px] font-mono text-amber-300">+{formatNumber(chart.points_needed)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {chart.skills && chart.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-[4.25rem]">
                    {chart.skills.map((s) => (
                      <span key={s.slug} className="px-1.5 py-0.5 rounded text-[9px] bg-piu-border/20 text-gray-400">
                        {s.name || s.slug}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <p className="text-center text-gray-500 py-6 text-xs">
                {data.total_charts === 0 ? 'No charts at this level.' : 'No charts match this filter.'}
              </p>
            )}
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <p className="text-center text-gray-500 py-6 text-xs">
          Select a mode, level, and target grade to see your progress.
        </p>
      )}
    </div>
  );
}

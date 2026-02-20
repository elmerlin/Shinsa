import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSongMissingSkills, getSongSkillsMeta, updateSongChartSkills } from '../utils/api';

const PAGE_SIZE = 150;

function modeBadgeClass(mode) {
  if (mode === 'Single') return 'from-red-500 to-red-700 border-red-300/50';
  if (mode === 'Double') return 'from-green-500 to-emerald-700 border-green-300/50';
  return 'from-violet-500 to-violet-700 border-violet-300/50';
}

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  return 'C';
}

function SkillEditorModal({
  open,
  chart,
  skills,
  selected,
  setSelected,
  search,
  setSearch,
  onApplyLast,
  canApplyLast,
  onClose,
  onSave,
  saving,
}) {
  if (!open || !chart) return null;

  const filteredSkills = skills.filter((skill) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return skill.name.toLowerCase().includes(q) || skill.slug.toLowerCase().includes(q);
  });

  const toggleSkill = (slug) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-piu-border/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Assign Skills</p>
            <h2 className="text-base font-display font-bold truncate">{chart.title}</h2>
            <p className="text-[11px] text-gray-500">{chart.artist || 'Unknown artist'} • {modeShort(chart.mode)}{chart.level}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search skills"
              className="input-field flex-1 min-w-[180px]"
            />
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-3 py-2 rounded-lg border border-piu-border/60 bg-piu-dark/60 text-xs font-display font-bold hover:border-piu-accent/40 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onApplyLast}
              disabled={!canApplyLast}
              className="px-3 py-2 rounded-lg border border-piu-border/60 bg-piu-dark/60 text-xs font-display font-bold hover:border-piu-accent/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Use Last Set
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {Array.from(selected).map((slug) => {
              const skill = skills.find((item) => item.slug === slug);
              const label = skill?.name || slug;
              return (
                <span key={slug} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border border-piu-accent/45 bg-piu-accent/15 text-piu-accent">
                  {label}
                </span>
              );
            })}
            {selected.size === 0 && (
              <span className="text-[11px] text-gray-500">No skills selected</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredSkills.map((skill) => {
              const checked = selected.has(skill.slug);
              return (
                <button
                  key={skill.slug}
                  type="button"
                  onClick={() => toggleSkill(skill.slug)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    checked
                      ? 'border-piu-accent/55 bg-piu-accent/15'
                      : 'border-piu-border/50 bg-piu-dark/40 hover:border-piu-border'
                  }`}
                >
                  <p className="text-xs font-display font-bold">{skill.name}</p>
                  <p className="text-[10px] text-gray-500">{skill.slug}</p>
                </button>
              );
            })}
          </div>

          {filteredSkills.length === 0 && (
            <p className="text-sm text-gray-500 py-6 text-center">No skills match this search.</p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-piu-border/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-piu-border/60 bg-piu-dark/60 text-xs font-display font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-piu-accent/55 bg-piu-accent/20 text-piu-accent text-xs font-display font-bold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Skills'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [meta, setMeta] = useState(null);
  const [charts, setCharts] = useState([]);
  const [totalMissing, setTotalMissing] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('both');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');

  const [editorChart, setEditorChart] = useState(null);
  const [editorSelected, setEditorSelected] = useState(new Set());
  const [editorSearch, setEditorSearch] = useState('');
  const [savingChartId, setSavingChartId] = useState(null);
  const [lastUsedSkills, setLastUsedSkills] = useState([]);

  const skills = useMemo(() => Array.isArray(meta?.skills) ? meta.skills : [], [meta?.skills]);

  const buildQuery = (nextOffset = 0, overrides = {}) => {
    const activeMode = overrides.mode ?? mode;
    const activeSearch = overrides.search ?? search;
    const activeLevel = overrides.level ?? level;
    const params = {
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
      mode: activeMode,
    };
    if (String(activeSearch || '').trim()) params.search = String(activeSearch || '').trim();
    if (String(activeLevel || '').trim()) params.level = String(activeLevel || '').trim();
    return params;
  };

  const loadMeta = async () => {
    const payload = await getSongSkillsMeta();
    setMeta(payload);
  };

  const loadMissing = async ({ append = false, nextOffset = 0, overrides = {} } = {}) => {
    const payload = await getSongMissingSkills(buildQuery(nextOffset, overrides));
    const incoming = Array.isArray(payload?.charts) ? payload.charts : [];
    const total = parseInt(payload?.total_missing_charts, 10) || 0;
    setTotalMissing(total);
    setOffset(nextOffset + incoming.length);
    setCharts((current) => {
      if (!append) return incoming;
      const seen = new Set(current.map((chart) => chart.chart_id));
      const merged = [...current];
      for (const chart of incoming) {
        if (seen.has(chart.chart_id)) continue;
        seen.add(chart.chart_id);
        merged.push(chart);
      }
      return merged;
    });
    return payload;
  };

  const refreshAll = async (overrides = {}) => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([
        loadMeta(),
        loadMissing({ append: false, nextOffset: 0, overrides }),
      ]);
    } catch (err) {
      setError(err.message || 'Failed to load skill coverage data');
      setCharts([]);
      setTotalMissing(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = async (event) => {
    event.preventDefault();
    await refreshAll();
  };

  const clearFilters = async () => {
    setSearch('');
    setLevel('');
    setMode('both');
    await refreshAll({ mode: 'both', search: '', level: '' });
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setError('');
    try {
      await loadMissing({ append: true, nextOffset: offset });
    } catch (err) {
      setError(err.message || 'Failed to load more charts');
    } finally {
      setLoadingMore(false);
    }
  };

  const openEditor = (chart) => {
    setEditorChart(chart);
    setEditorSelected(new Set(Array.isArray(chart.skills) ? chart.skills.map((skill) => skill.slug) : []));
    setEditorSearch('');
  };

  const closeEditor = () => {
    if (savingChartId) return;
    setEditorChart(null);
    setEditorSelected(new Set());
    setEditorSearch('');
  };

  const saveEditor = async () => {
    if (!editorChart) return;
    const selectedArray = Array.from(editorSelected);
    setSavingChartId(editorChart.chart_id);
    setError('');
    try {
      await updateSongChartSkills(editorChart.chart_id, selectedArray);
      setLastUsedSkills(selectedArray);
      closeEditor();
      await Promise.all([
        loadMeta(),
        loadMissing({ append: false, nextOffset: 0 }),
      ]);
    } catch (err) {
      setError(err.message || 'Failed to save chart skills');
    } finally {
      setSavingChartId(null);
    }
  };

  const hasMore = charts.length < totalMissing;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">SKILL COVERAGE</h1>
          <p className="text-xs text-gray-500">Charts missing PIU Center skill tags (Single 7+ and Double 10+) and manual skill assignment tools</p>
        </div>
        <Link to="/songs" className="text-sm text-piu-accent hover:underline">Back to Songs</Link>
      </div>

      {meta?.totals && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-lg border border-piu-border/50 bg-piu-card/60 p-3">
            <p className="text-[10px] text-gray-500">Eligible Charts (S7+ / D10+)</p>
            <p className="text-lg font-mono">{(meta.totals.total_charts || 0).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-piu-border/50 bg-piu-card/60 p-3">
            <p className="text-[10px] text-gray-500">With Skills</p>
            <p className="text-lg font-mono">{(meta.totals.charts_with_skills || 0).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-piu-border/50 bg-piu-card/60 p-3">
            <p className="text-[10px] text-gray-500">Missing Skills</p>
            <p className="text-lg font-mono text-amber-300">{(meta.totals.charts_missing_skills || 0).toLocaleString()}</p>
          </div>
        </section>
      )}

      {error && (
        <div className="card border-red-500/40 bg-red-900/20 text-red-200 text-sm">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3">
        <form className="grid grid-cols-1 sm:grid-cols-4 gap-2" onSubmit={applyFilters}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title or artist"
            className="input-field sm:col-span-2"
          />
          <select value={mode} onChange={(event) => setMode(event.target.value)} className="input-field">
            <option value="both">Single + Double</option>
            <option value="single">Single</option>
            <option value="double">Double</option>
          </select>
          <input
            value={level}
            onChange={(event) => setLevel(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Level"
            className="input-field"
          />
          <button type="submit" className="px-3 py-2 rounded-lg border border-piu-accent/55 bg-piu-accent/15 text-piu-accent text-xs font-display font-bold">
            Apply Filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-2 rounded-lg border border-piu-border/60 bg-piu-dark/60 text-xs font-display font-bold"
          >
            Reset
          </button>
          <div className="sm:col-span-2 flex items-center text-xs text-gray-500">
            Showing {charts.length.toLocaleString()} / {totalMissing.toLocaleString()} missing charts
          </div>
        </form>
      </section>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading missing skill charts...</div>
      ) : (
        <section className="space-y-2">
          {charts.map((chart) => (
            <div key={chart.chart_id} className="rounded-xl border border-piu-border/50 bg-gradient-to-r from-[#112947] to-[#1b3554] p-3">
              <div className="flex items-start gap-3">
                {chart.jacket_url ? (
                  <img src={chart.jacket_url} alt={chart.title} className="w-24 h-14 sm:w-28 sm:h-16 rounded object-cover border border-piu-border/40 shrink-0" />
                ) : (
                  <div className="w-24 h-14 sm:w-28 sm:h-16 rounded bg-piu-dark border border-piu-border/40 flex items-center justify-center text-xs text-gray-500 shrink-0">
                    No image
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-lg font-display font-bold leading-tight truncate">{chart.title}</p>
                  <p className="text-xs text-gray-400 truncate">{chart.artist || 'Unknown artist'}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center justify-center min-w-[42px] h-[42px] text-sm rounded-full border bg-gradient-to-b ${modeBadgeClass(chart.mode)} text-white font-display font-black shadow-md`}>
                      {chart.level}
                    </span>
                    <span className="text-xs text-gray-400">{chart.mode}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openEditor(chart)}
                  className="shrink-0 px-3 py-2 rounded-lg border border-piu-accent/55 bg-piu-accent/15 text-piu-accent text-xs font-display font-bold hover:border-piu-accent transition-colors"
                >
                  Add Skills
                </button>
              </div>
            </div>
          ))}

          {charts.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">
              No missing charts found for the current filter.
            </p>
          )}

          {hasMore && (
            <div className="pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full px-3 py-2 rounded-lg border border-piu-border/60 bg-piu-dark/60 text-sm font-display font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </section>
      )}

      <SkillEditorModal
        open={!!editorChart}
        chart={editorChart}
        skills={skills}
        selected={editorSelected}
        setSelected={setEditorSelected}
        search={editorSearch}
        setSearch={setEditorSearch}
        onApplyLast={() => setEditorSelected(new Set(lastUsedSkills))}
        canApplyLast={lastUsedSkills.length > 0}
        onClose={closeEditor}
        onSave={saveEditor}
        saving={savingChartId === editorChart?.chart_id}
      />
    </div>
  );
}

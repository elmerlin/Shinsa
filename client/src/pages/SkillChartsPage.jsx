import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSongSkillCharts } from '../utils/api';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

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

function normalizeLevelInput(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function SkillDescription({ skill }) {
  const descriptionText = String(skill?.description_text || '').trim();
  const descriptionSegments = Array.isArray(skill?.description_segments) ? skill.description_segments : [];
  const patternImages = Array.isArray(skill?.pattern_images) ? skill.pattern_images : [];
  const sourceUrl = String(skill?.source_url || '').trim();

  if (!descriptionText && descriptionSegments.length === 0 && patternImages.length === 0) return null;

  return (
    <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-display font-bold text-piu-accent">ABOUT THIS SKILL</h2>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Source: PIU Center
          </a>
        )}
      </div>

      {descriptionSegments.length > 0 ? (
        <p className="text-sm text-gray-200 leading-7 whitespace-pre-wrap">
          {descriptionSegments.map((segment, index) => {
            if (segment?.type === 'image') {
              return (
                <img
                  key={`seg-img-${index}`}
                  src={segment.url}
                  alt={segment.alt || 'Skill pattern arrow'}
                  className="inline-block h-7 w-auto mx-0.5 align-middle"
                />
              );
            }
            return (
              <span key={`seg-text-${index}`}>
                {segment?.text || ''}
              </span>
            );
          })}
        </p>
      ) : (
        <p className="text-sm text-gray-200 leading-7 whitespace-pre-wrap">{descriptionText}</p>
      )}

      {patternImages.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500">Pattern arrows used in this skill description</p>
          <div className="flex flex-wrap gap-2">
            {patternImages.map((url) => (
              <span key={url} className="inline-flex items-center justify-center rounded-lg border border-piu-border/60 bg-black/35 px-2 py-1.5">
                <img src={url} alt="Skill pattern arrow" className="h-8 w-auto" />
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function SkillChartsPage() {
  const { skillSlug } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [charts, setCharts] = useState([]);

  const [mode, setMode] = useState('both');
  const [minLevel, setMinLevel] = useState('');
  const [maxLevel, setMaxLevel] = useState('');
  const [sort, setSort] = useState('level_asc');

  const fetchCharts = async (overrides = {}) => {
    const nextMode = overrides.mode ?? mode;
    const nextMinLevel = overrides.minLevel ?? minLevel;
    const nextMaxLevel = overrides.maxLevel ?? maxLevel;
    const nextSort = overrides.sort ?? sort;

    setLoading(true);
    setError('');

    try {
      const params = {
        mode: nextMode,
        sort: nextSort,
      };
      if (String(nextMinLevel).trim()) params.min_level = String(nextMinLevel).trim();
      if (String(nextMaxLevel).trim()) params.max_level = String(nextMaxLevel).trim();
      if (user?.id) params.user_id = user.id;

      const data = await getSongSkillCharts(skillSlug, params);
      setPayload(data);
      setCharts(Array.isArray(data?.charts) ? data.charts : []);
    } catch (err) {
      setError(err.message || 'Failed to load skill charts');
      setPayload(null);
      setCharts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCharts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillSlug, user?.id]);

  const applyFilters = async (event) => {
    event.preventDefault();
    await fetchCharts();
  };

  const resetFilters = async () => {
    setMode('both');
    setMinLevel('');
    setMaxLevel('');
    setSort('level_asc');
    await fetchCharts({
      mode: 'both',
      minLevel: '',
      maxLevel: '',
      sort: 'level_asc',
    });
  };

  const skillName = payload?.skill?.name || skillSlug;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">{String(skillName || '').toUpperCase()}</h1>
          <p className="text-xs text-gray-500">Charts tagged with this skill and your best score/grade on each chart</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/songs" className="text-sm text-piu-accent hover:underline">Back to Songs</Link>
          <Link to="/skill" className="text-sm text-gray-400 hover:text-white transition-colors">Manage Skills</Link>
        </div>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-900/20 text-red-200 text-sm">
          {error}
        </div>
      )}

      <SkillDescription skill={payload?.skill || null} />

      <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3">
        <form className="grid grid-cols-1 sm:grid-cols-5 gap-2" onSubmit={applyFilters}>
          <select value={mode} onChange={(event) => setMode(event.target.value)} className="input-field">
            <option value="both">Single + Double</option>
            <option value="single">Single</option>
            <option value="double">Double</option>
          </select>
          <input
            value={minLevel}
            onChange={(event) => setMinLevel(normalizeLevelInput(event.target.value))}
            placeholder="Min level"
            className="input-field"
          />
          <input
            value={maxLevel}
            onChange={(event) => setMaxLevel(normalizeLevelInput(event.target.value))}
            placeholder="Max level"
            className="input-field"
          />
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="input-field">
            <option value="level_asc">Difficulty: low to high</option>
            <option value="level_desc">Difficulty: high to low</option>
            <option value="score_asc">Score: low to high</option>
            <option value="score_desc">Score: high to low</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 px-3 py-2 rounded-lg border border-piu-accent/55 bg-piu-accent/15 text-piu-accent text-xs font-display font-bold">
              Apply
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="flex-1 px-3 py-2 rounded-lg border border-piu-border/60 bg-piu-dark/60 text-xs font-display font-bold"
            >
              Reset
            </button>
          </div>
          <div className="sm:col-span-5 text-xs text-gray-500">
            Showing {charts.length.toLocaleString()} chart{charts.length === 1 ? '' : 's'}
            {!user && ' • Log in to view your own score and grade data'}
          </div>
        </form>
      </section>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading skill charts...</div>
      ) : (
        <section className="space-y-2">
          {charts.map((chart) => {
            const hasScore = Number.isFinite(chart.best_score);
            const isStageBreak = hasScore && !!chart.is_stage_break;
            return (
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
                      <span className="text-xs text-gray-400">{modeShort(chart.mode)}{chart.level}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 min-w-[120px]">
                    {hasScore ? (
                      <>
                        <p className={`text-lg font-display font-black ${isStageBreak ? 'text-red-400' : 'text-white'}`}>
                          {isStageBreak ? 'STAGE BREAK' : formatNumber(chart.best_score)}
                        </p>
                        <p className={`text-xs font-display font-bold ${isStageBreak ? 'text-red-300' : 'text-piu-gold'}`}>
                          {chart.best_grade || (isStageBreak ? 'F' : '-')}
                        </p>
                        <p className="text-[10px] text-gray-500">{chart.date_played ? String(chart.date_played).slice(0, 10) : ''}</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 mt-2">No score</p>
                    )}
                    <Link
                      to={`/songs/chart/${chart.chart_id}`}
                      className="inline-flex mt-2 px-2.5 py-1.5 rounded-md border border-piu-border/55 text-[11px] font-display font-bold hover:border-piu-accent/45 hover:text-piu-accent transition-colors"
                    >
                      Open Chart
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

          {charts.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">
              No charts found for this skill and filter combination.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

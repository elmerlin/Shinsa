import React, { useEffect, useMemo, useState } from 'react';
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

function modeOrderValue(mode) {
  if (mode === 'Single') return 0;
  if (mode === 'Double') return 1;
  return 99;
}

function compareByScore(a, b, direction = 'desc') {
  const aScore = Number.isFinite(a?.best_score) ? a.best_score : null;
  const bScore = Number.isFinite(b?.best_score) ? b.best_score : null;
  if (aScore === null && bScore !== null) return 1;
  if (aScore !== null && bScore === null) return -1;
  if (aScore !== null && bScore !== null && aScore !== bScore) {
    return direction === 'asc' ? aScore - bScore : bScore - aScore;
  }
  return String(a?.title || '').localeCompare(String(b?.title || ''), undefined, { sensitivity: 'base' });
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

function formatChartResult(chart) {
  const hasScore = Number.isFinite(chart?.best_score);
  if (!hasScore) return 'No score';
  if (chart?.is_stage_break) return 'STAGE BREAK';
  const grade = String(chart?.best_grade || '').trim();
  if (!grade) return formatNumber(chart.best_score);
  return `${grade} ${formatNumber(chart.best_score)}`;
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

function GroupedDifficultyLayout({ groups }) {
  return (
    <section className="space-y-2">
      {groups.map((group) => (
        <div key={group.key} className="rounded-xl border border-piu-border/50 bg-gradient-to-r from-[#101f36] to-[#162947] p-2 sm:p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center justify-center rounded-full min-w-[42px] h-9 px-2 border text-white font-display font-black text-sm bg-gradient-to-b ${modeBadgeClass(group.mode)} shadow-md`}>
                {modeShort(group.mode)}{group.level}
              </span>
              <span className="text-xs text-gray-400">{group.charts.length} chart{group.charts.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
            {group.charts.map((chart) => (
              <Link
                key={chart.chart_id}
                to={`/songs/chart/${chart.chart_id}`}
                className="rounded-md border border-piu-border/45 bg-black/30 px-2 py-1.5 hover:border-piu-accent/55 hover:bg-black/45 transition-colors"
              >
                <div className="flex items-start gap-2 min-w-0">
                  {chart.jacket_url ? (
                    <img
                      src={chart.jacket_url}
                      alt={chart.title}
                      className="w-9 h-9 rounded object-cover border border-piu-border/45 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-piu-dark border border-piu-border/45 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] font-display font-bold leading-tight break-words line-clamp-2">{chart.title}</p>
                    <p className={`text-[10px] mt-0.5 ${
                      Number.isFinite(chart.best_score)
                        ? chart.is_stage_break
                          ? 'text-red-300'
                          : getGradeColor(chart.best_grade, chart.best_score)
                        : 'text-gray-500'
                    }`}>
                      {formatChartResult(chart)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
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
  const [rangeError, setRangeError] = useState('');

  const fetchCharts = async ({
    activeMode,
    activeMinLevel,
    activeMaxLevel,
    activeSort,
  }) => {
    setLoading(true);
    setError('');

    try {
      const params = {
        mode: activeMode,
        sort: activeSort,
      };
      if (String(activeMinLevel).trim()) params.min_level = String(activeMinLevel).trim();
      if (String(activeMaxLevel).trim()) params.max_level = String(activeMaxLevel).trim();
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

  const minLevelNum = parseInt(minLevel, 10) || 0;
  const maxLevelNum = parseInt(maxLevel, 10) || 0;
  const hasMin = String(minLevel).trim() !== '';
  const hasMax = String(maxLevel).trim() !== '';
  const levelRangeValid = !(hasMin && hasMax && minLevelNum > maxLevelNum);

  useEffect(() => {
    if (!levelRangeValid) {
      setRangeError('Min level must be less than or equal to max level');
      return;
    }

    setRangeError('');
    const timer = setTimeout(() => {
      fetchCharts({
        activeMode: mode,
        activeMinLevel: minLevel,
        activeMaxLevel: maxLevel,
        activeSort: sort,
      });
    }, 120);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillSlug, user?.id, mode, minLevel, maxLevel, sort, levelRangeValid]);

  const resetFilters = async () => {
    setMode('both');
    setMinLevel('');
    setMaxLevel('');
    setSort('level_asc');
  };

  const skillName = payload?.skill?.name || skillSlug;
  const groupedCharts = useMemo(() => {
    const map = new Map();
    for (const chart of charts) {
      const level = parseInt(chart?.level, 10) || 0;
      const modeName = String(chart?.mode || '');
      if (!modeName || level <= 0) continue;
      const key = `${modeName}|${level}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          mode: modeName,
          level,
          charts: [],
        });
      }
      map.get(key).charts.push(chart);
    }

    const groups = Array.from(map.values());
    for (const group of groups) {
      if (sort === 'score_asc') {
        group.charts.sort((a, b) => compareByScore(a, b, 'asc'));
      } else if (sort === 'score_desc') {
        group.charts.sort((a, b) => compareByScore(a, b, 'desc'));
      } else {
        group.charts.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
      }
    }

    groups.sort((a, b) => {
      const modeDiff = modeOrderValue(a.mode) - modeOrderValue(b.mode);
      if (modeDiff !== 0) return modeDiff;
      if (sort === 'level_desc') return b.level - a.level;
      return a.level - b.level;
    });
    return groups;
  }, [charts, sort]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">{String(skillName || '').toUpperCase()}</h1>
          <p className="text-xs text-gray-500">Charts tagged with this skill and your best score/grade on each chart</p>
        </div>
        <Link to="/songs" className="text-sm text-piu-accent hover:underline">Back to Songs</Link>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-900/20 text-red-200 text-sm">
          {error}
        </div>
      )}

      <SkillDescription skill={payload?.skill || null} />

      <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
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
          <button
            type="button"
            onClick={resetFilters}
            className="px-3 py-2 rounded-lg border border-piu-border/60 bg-piu-dark/60 text-xs font-display font-bold"
          >
            Reset Filters
          </button>
          <div className="sm:col-span-5 text-xs text-gray-500">
            Showing {charts.length.toLocaleString()} chart{charts.length === 1 ? '' : 's'}
            {!user && ' • Log in to view your own score and grade data'}
            {' • Filters auto-apply'}
          </div>
          {rangeError && (
            <div className="sm:col-span-5 text-xs text-amber-300">
              {rangeError}
            </div>
          )}
        </div>
      </section>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading skill charts...</div>
      ) : (
        <>
          {charts.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">
              No charts found for this skill and filter combination.
            </p>
          ) : (
            <GroupedDifficultyLayout groups={groupedCharts} />
          )}
        </>
      )}
    </div>
  );
}

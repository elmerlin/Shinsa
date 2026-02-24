import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getFollowing,
  getJacketMap,
  getPiugamePumbility,
  getPumbilityRecommendations,
  getSongLibrary,
  getSongSniping,
  getSongSkillInfo,
  getTrainingRecommendations,
  searchUsers,
} from '../utils/api';

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

function getGradeColor(grade) {
  const g = String(grade || '').replace('+', '_p').toUpperCase();
  if (g.includes('SSS')) return 'text-sky-300';
  if (g.includes('SS')) return 'text-piu-gold';
  if (g.includes('S')) return 'text-amber-400';
  if (g.includes('AAA')) return 'text-piu-silver';
  if (g.includes('AA')) return 'text-piu-bronze';
  if (g.includes('A')) return 'text-amber-700';
  return 'text-gray-500';
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getLevelOptionsFromLibrary(payload) {
  const singles = new Set();
  const doubles = new Set();

  const songs = Array.isArray(payload?.songs) ? payload.songs : [];
  for (const song of songs) {
    const charts = Array.isArray(song?.charts) ? song.charts : [];
    for (const chart of charts) {
      const level = parseInt(chart?.level, 10);
      if (!Number.isFinite(level) || level <= 0) continue;
      if (chart.mode === 'Single') singles.add(level);
      if (chart.mode === 'Double') doubles.add(level);
    }
  }

  const singlesList = Array.from(singles).sort((a, b) => a - b);
  const doublesList = Array.from(doubles).sort((a, b) => a - b);
  const bothList = Array.from(new Set([...singlesList, ...doublesList])).sort((a, b) => a - b);

  return {
    Both: bothList,
    Singles: singlesList,
    Doubles: doublesList,
  };
}

function SongJacket({ title, mode, level, bgUrl, jacketLookup, size = 'sm' }) {
  const sizeClass = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
  const badgeColor = mode === 'Single' ? 'bg-red-600' : mode === 'Double' ? 'bg-green-600' : 'bg-blue-600';

  const norm = String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const exactKey = `${norm}|${mode}|${level}`;
  const localJacket = jacketLookup[exactKey] || jacketLookup[norm] || '';
  const jacketUrl = localJacket || (bgUrl && !String(bgUrl).includes('piugame') ? bgUrl : '') || '';

  return (
    <div className="relative shrink-0">
      {jacketUrl ? (
        <img src={jacketUrl} alt="" className={`${sizeClass} rounded object-cover`} />
      ) : (
        <div className={`${sizeClass} rounded bg-piu-dark flex items-center justify-center font-display font-bold text-xs text-gray-500`}>
          {(title || '?')[0]}
        </div>
      )}
      <span className={`absolute -bottom-1 -right-1 min-w-[16px] h-[14px] px-1 rounded text-[8px] flex items-center justify-center font-display font-bold text-white leading-none ${badgeColor}`}>
        {level}
      </span>
    </div>
  );
}

function PumbilityRecommendationList({ title, subtitle, recommendations, jacketLookup }) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return (
      <div className="card">
        <h3 className="font-display font-bold text-sm text-piu-accent">{title}</h3>
        {subtitle ? <p className="text-[10px] text-gray-500 mt-1">{subtitle}</p> : null}
        <p className="text-xs text-gray-500 mt-3">No recommendations available yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="font-display font-bold text-sm text-piu-accent">{title}</h3>
      {subtitle ? <p className="text-[10px] text-gray-500 mt-1 mb-2">{subtitle}</p> : null}
      <div className="space-y-1.5">
        {recommendations.map((row, idx) => {
          const currentRank = getRank(row.current_score);
          const nextRank = getRank(row.next_threshold);
          return (
            <div key={`${row.song_title}-${row.mode}-${row.level}-${idx}`} className="flex items-center gap-2.5 py-1.5 border-b border-piu-border/30 last:border-0">
              <span className="text-[11px] text-gray-500 font-mono w-4 shrink-0 text-right">{idx + 1}</span>
              <SongJacket
                title={row.song_title}
                mode={row.mode}
                level={row.level}
                bgUrl={row.background_url}
                jacketLookup={jacketLookup}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs sm:text-sm font-display font-bold truncate">{row.song_title}</p>
                  {(row.recommendation_type === 'easiest' || row.recommendation_type === 'easiest_and_best_impact') && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-500/40 text-cyan-300 font-display shrink-0">
                      Easiest
                    </span>
                  )}
                  {(row.recommendation_type === 'best_impact_per_point' || row.recommendation_type === 'easiest_and_best_impact') && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-300 font-display shrink-0">
                      Best Impact
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[10px] font-display font-bold ${getGradeColor(row.current_grade)}`}>
                    {row.current_grade || currentRank.label}
                  </span>
                  <span className="text-[10px] text-gray-600">→</span>
                  <span className={`text-[10px] font-display font-bold ${getGradeColor(row.next_grade)}`}>
                    {row.next_grade || nextRank.label}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">+{(row.score_needed || 0).toLocaleString()} pts</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono font-bold text-green-400">+{(row.pumbility_gain || 0).toLocaleString()}</p>
                <p className="text-[10px] text-gray-500 font-mono">{(row.current_score || 0).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillDescriptionBody({ skill }) {
  const descriptionText = String(skill?.description_text || '').trim();
  const descriptionSegments = Array.isArray(skill?.description_segments) ? skill.description_segments : [];
  const patternImages = Array.isArray(skill?.pattern_images) ? skill.pattern_images : [];

  if (!descriptionText && descriptionSegments.length === 0 && patternImages.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No description available yet for this skill.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {descriptionSegments.length > 0 ? (
        <p className="text-sm text-gray-200 leading-7 whitespace-pre-wrap break-words">
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
            return <span key={`seg-text-${index}`}>{segment?.text || ''}</span>;
          })}
        </p>
      ) : (
        <p className="text-sm text-gray-200 leading-7 whitespace-pre-wrap break-words">{descriptionText}</p>
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
    </div>
  );
}

function SkillInfoModal({ open, loading, error, skill, chartCount, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-piu-border/60 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Skill Explainer</p>
            <h3 className="text-sm sm:text-base font-display font-bold text-piu-accent break-words">
              {skill?.name || 'Skill'}
            </h3>
            {Number.isFinite(chartCount) && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                {(chartCount || 0).toLocaleString()} chart{chartCount === 1 ? '' : 's'} tagged
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-500">Loading skill details...</p>
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : (
            <SkillDescriptionBody skill={skill} />
          )}

          {skill?.source_url && !loading && !error && (
            <a
              href={skill.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-xs text-gray-400 hover:text-white transition-colors"
            >
              Source: PIU Center
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OptimisePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('pumbility');
  const [error, setError] = useState('');

  const [jacketLookup, setJacketLookup] = useState({});

  const [pumbilityLoading, setPumbilityLoading] = useState(false);
  const [pumbilityData, setPumbilityData] = useState(null);
  const [overallRecs, setOverallRecs] = useState([]);
  const [singlesRecs, setSinglesRecs] = useState([]);

  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingData, setTrainingData] = useState(null);
  const [trainingChartMode, setTrainingChartMode] = useState('single');
  const [trainingRangeA, setTrainingRangeA] = useState(null);
  const [trainingRangeB, setTrainingRangeB] = useState(null);

  const [snipingInitLoading, setSnipingInitLoading] = useState(false);
  const [snipingLoading, setSnipingLoading] = useState(false);
  const [snipingFollowing, setSnipingFollowing] = useState([]);
  const [snipingModeLevels, setSnipingModeLevels] = useState({ Both: [], Singles: [], Doubles: [] });
  const [snipingInitialized, setSnipingInitialized] = useState(false);
  const [snipingQuery, setSnipingQuery] = useState('');
  const [snipingSuggestions, setSnipingSuggestions] = useState([]);
  const [snipingShowSuggestions, setSnipingShowSuggestions] = useState(false);
  const [snipingOpponent, setSnipingOpponent] = useState(null);
  const [snipingMode, setSnipingMode] = useState('Both');
  const [snipingLevel, setSnipingLevel] = useState('All');
  const [snipingPage, setSnipingPage] = useState(1);
  const [snipingResult, setSnipingResult] = useState(null);
  const snipingSearchWrapRef = useRef(null);

  const [skillInfoOpen, setSkillInfoOpen] = useState(false);
  const [skillInfoLoading, setSkillInfoLoading] = useState(false);
  const [skillInfoError, setSkillInfoError] = useState('');
  const [activeSkillSlug, setActiveSkillSlug] = useState('');
  const [skillInfoCache, setSkillInfoCache] = useState({});

  useEffect(() => {
    let cancelled = false;
    getJacketMap()
      .then((map) => {
        if (cancelled) return;
        setJacketLookup(map || {});
      })
      .catch(() => {
        if (cancelled) return;
        setJacketLookup({});
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.id || activeTab !== 'pumbility' || pumbilityData) return;

    let cancelled = false;
    setPumbilityLoading(true);
    setError('');

    Promise.all([
      getPiugamePumbility(user.id),
      getPumbilityRecommendations(user.id),
      getPumbilityRecommendations(user.id, { metric: 'singles' }),
    ])
      .then(([pumbility, overall, singles]) => {
        if (cancelled) return;
        setPumbilityData(pumbility || null);
        setOverallRecs(Array.isArray(overall?.recommendations) ? overall.recommendations : []);
        setSinglesRecs(Array.isArray(singles?.recommendations) ? singles.recommendations : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load pumbility recommendations');
      })
      .finally(() => {
        if (!cancelled) setPumbilityLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, pumbilityData, user?.id]);

  const fetchTrainingRecommendations = async ({
    chartMode = trainingChartMode,
    minLevel = null,
    maxLevel = null,
    preserveSelection = false,
  } = {}) => {
    setTrainingLoading(true);
    setError('');

    try {
      const payload = await getTrainingRecommendations({
        chart_mode: chartMode,
        min_level: minLevel,
        max_level: maxLevel,
      });
      setTrainingData(payload || null);

      if (!preserveSelection) {
        const nextMin = parseInt(payload?.selected_min_level, 10);
        const nextMax = parseInt(payload?.selected_max_level, 10);
        if (Number.isFinite(nextMin) && Number.isFinite(nextMax)) {
          setTrainingRangeA(nextMin);
          setTrainingRangeB(nextMax);
        } else {
          setTrainingRangeA(null);
          setTrainingRangeB(null);
        }
      }
    } catch (err) {
      setError(err?.message || 'Failed to load training recommendations');
    } finally {
      setTrainingLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id || activeTab !== 'training' || trainingData) return;
    fetchTrainingRecommendations({ chartMode: trainingChartMode }).catch(() => {});
  }, [activeTab, trainingData, trainingChartMode, user?.id]);

  useEffect(() => {
    if (!user?.id || activeTab !== 'sniping' || snipingInitialized) return;

    let cancelled = false;
    setSnipingInitLoading(true);
    Promise.all([
      getFollowing(user.id).catch(() => []),
      getSongLibrary().catch(() => null),
    ])
      .then(([followList, library]) => {
        if (cancelled) return;
        setSnipingFollowing(Array.isArray(followList) ? followList : []);
        if (library) {
          setSnipingModeLevels(getLevelOptionsFromLibrary(library));
        }
        setSnipingInitialized(true);
      })
      .finally(() => {
        if (!cancelled) setSnipingInitLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, snipingInitialized, user?.id]);

  useEffect(() => {
    if (activeTab !== 'sniping') return undefined;

    let cancelled = false;
    const q = snipingQuery.trim();
    if (q.length < 2) {
      setSnipingSuggestions([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const users = await searchUsers(q);
        if (cancelled) return;
        setSnipingSuggestions((Array.isArray(users) ? users : []).filter((item) => item.id !== user?.id));
      } catch {
        if (cancelled) return;
        setSnipingSuggestions([]);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, snipingQuery, user?.id]);

  useEffect(() => {
    function handleDocClick(event) {
      if (!snipingSearchWrapRef.current) return;
      if (!snipingSearchWrapRef.current.contains(event.target)) {
        setSnipingShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  const snipingCompareLevels = useMemo(() => snipingModeLevels[snipingMode] || [], [snipingModeLevels, snipingMode]);

  useEffect(() => {
    if (snipingLevel === 'All') return;
    const parsed = parseInt(snipingLevel, 10);
    if (!snipingCompareLevels.includes(parsed)) {
      setSnipingLevel('All');
    }
  }, [snipingCompareLevels, snipingLevel]);

  const displayedSnipingSuggestions = useMemo(() => {
    if (snipingQuery.trim().length >= 2) return snipingSuggestions;
    return snipingFollowing.filter((item) => item.id !== user?.id).slice(0, 8);
  }, [snipingFollowing, snipingQuery, snipingSuggestions, user?.id]);

  const handleSelectSnipingOpponent = (entry) => {
    setSnipingOpponent(entry);
    setSnipingQuery(entry?.username || '');
    setSnipingShowSuggestions(false);
    setSnipingPage(1);
    setSnipingResult(null);
  };

  const runSnipingComparison = async (targetPage = 1) => {
    if (!user?.id) return;
    if (!snipingOpponent?.id) {
      setError('Choose a player to compare against.');
      return;
    }

    setSnipingLoading(true);
    setError('');
    try {
      const params = {
        user_a_id: user.id,
        user_b_id: snipingOpponent.id,
        mode: snipingMode,
        page: targetPage,
        limit: 50,
      };
      if (snipingLevel !== 'All') params.level = snipingLevel;

      const payload = await getSongSniping(params);
      setSnipingResult(payload || null);
      setSnipingPage(parseInt(payload?.pagination?.page, 10) || targetPage);
    } catch (err) {
      setSnipingResult(null);
      setError(err?.message || 'Failed to load sniping comparison');
    } finally {
      setSnipingLoading(false);
    }
  };

  const headline = useMemo(() => {
    if (!pumbilityData || !pumbilityData.pumbility_value) return '';
    const base = `${(pumbilityData.pumbility_value || 0).toLocaleString()} PB`;
    if (pumbilityData.ranking) return `${base}  ·  #${pumbilityData.ranking}`;
    return base;
  }, [pumbilityData]);

  const activeSkillInfo = activeSkillSlug ? skillInfoCache[activeSkillSlug] : null;
  const selectedTrainingMin = Number.isFinite(trainingRangeA) && Number.isFinite(trainingRangeB)
    ? Math.min(trainingRangeA, trainingRangeB)
    : null;
  const selectedTrainingMax = Number.isFinite(trainingRangeA) && Number.isFinite(trainingRangeB)
    ? Math.max(trainingRangeA, trainingRangeB)
    : null;
  const snipingRows = Array.isArray(snipingResult?.top_song_diffs) ? snipingResult.top_song_diffs : [];
  const snipingComparison = snipingResult?.comparison || null;
  const snipingPagination = snipingResult?.pagination || {};
  const snipingCurrentPage = parseInt(snipingPagination.page, 10) || snipingPage;
  const snipingTotalPages = parseInt(snipingPagination.total_pages, 10) || 1;
  const snipingTotalItems = parseInt(snipingPagination.total_items, 10) || 0;
  const snipingUserA = snipingResult?.users?.a || user || null;
  const snipingUserB = snipingResult?.users?.b || snipingOpponent || null;

  const handleOpenSkillInfo = async (slug) => {
    const normalized = String(slug || '').trim().toLowerCase();
    if (!normalized) return;

    setActiveSkillSlug(normalized);
    setSkillInfoOpen(true);
    setSkillInfoError('');

    if (skillInfoCache[normalized]) {
      setSkillInfoLoading(false);
      return;
    }

    setSkillInfoLoading(true);
    try {
      const payload = await getSongSkillInfo(normalized);
      setSkillInfoCache((current) => ({
        ...current,
        [normalized]: payload || null,
      }));
    } catch (err) {
      setSkillInfoError(err?.message || 'Failed to load skill details');
    } finally {
      setSkillInfoLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="card text-center">
          <h1 className="text-xl font-display font-bold">OPTIMISE</h1>
          <p className="text-sm text-gray-400 mt-2">This page is only available when logged in.</p>
          <Link to="/login" className="inline-flex mt-4 btn-primary">Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6 space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-piu-accent">OPTIMISE</h1>
            <p className="text-[11px] text-gray-500 mt-1">Private planning tools for improving your performance.</p>
          </div>
          {headline ? <p className="text-xs sm:text-sm font-mono text-piu-gold">{headline}</p> : null}
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('pumbility')}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              activeTab === 'pumbility' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
            }`}
          >
            Pumbility
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('training')}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              activeTab === 'training' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
            }`}
          >
            Training
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sniping')}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              activeTab === 'sniping' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
            }`}
          >
            Sniping
          </button>
        </div>
      </div>

      {error ? (
        <div className="card border-red-500/40 bg-red-900/20 text-red-200 text-sm">{error}</div>
      ) : null}

      {activeTab === 'pumbility' && (
        <div className="space-y-4">
          {pumbilityLoading ? (
            <div className="card text-sm text-gray-500">Loading pumbility recommendations...</div>
          ) : (
            <>
              <PumbilityRecommendationList
                title="PUMBILITY RECOMMENDATIONS"
                subtitle="Top 10 songs closest to a one-grade increase with the highest pumbility impact."
                recommendations={overallRecs}
                jacketLookup={jacketLookup}
              />
              <PumbilityRecommendationList
                title="SINGLES PUMBILITY RECOMMENDATIONS"
                subtitle="Same recommendation model, calculated only from Singles ratings."
                recommendations={singlesRecs}
                jacketLookup={jacketLookup}
              />
            </>
          )}
        </div>
      )}

      {activeTab === 'training' && (
        <div className="space-y-4">
          {trainingLoading ? (
            <div className="card text-sm text-gray-500">Loading training recommendations...</div>
          ) : (
            <>
              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent">TRAINING OPTIONS</h3>
                {trainingData ? (
                  <div className="space-y-3 mt-3">
                    <div>
                      <p className="text-[10px] text-gray-500 font-display uppercase mb-1">Mode</p>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (trainingChartMode === 'single') return;
                            setTrainingChartMode('single');
                            setTrainingData(null);
                            setTrainingRangeA(null);
                            setTrainingRangeB(null);
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-display font-bold transition-colors ${
                            trainingChartMode === 'single' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                          }`}
                        >
                          Singles
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (trainingChartMode === 'double') return;
                            setTrainingChartMode('double');
                            setTrainingData(null);
                            setTrainingRangeA(null);
                            setTrainingRangeB(null);
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-display font-bold transition-colors ${
                            trainingChartMode === 'double' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                          }`}
                        >
                          Doubles
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] text-gray-500 font-display uppercase mb-1">Difficulty Range (select two levels)</p>
                      <p className="text-[10px] text-gray-500 mb-2">
                        Lowest selectable level is 5 below your scoring level. Highest selectable level is your highest passed level.
                      </p>
                      <p className="text-[10px] text-gray-500 mb-2">
                        Scoring level: Lv.{trainingData.scoring_level || '--'} · Highest passed: {trainingData.highest_passed_level ? `Lv.${trainingData.highest_passed_level}` : '--'}
                      </p>
                      {Array.isArray(trainingData.level_options) && trainingData.level_options.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {trainingData.level_options.map((level) => {
                            const selected = level === trainingRangeA || level === trainingRangeB;
                            const inSelectedRange = selectedTrainingMin !== null && selectedTrainingMax !== null
                              ? level >= selectedTrainingMin && level <= selectedTrainingMax
                              : false;
                            return (
                              <button
                                key={`level-option-${level}`}
                                type="button"
                                onClick={() => {
                                  if (trainingRangeA === null || (trainingRangeA !== null && trainingRangeB !== null)) {
                                    setTrainingRangeA(level);
                                    setTrainingRangeB(null);
                                    return;
                                  }
                                  if (trainingRangeA === level) {
                                    setTrainingRangeA(null);
                                    return;
                                  }
                                  setTrainingRangeB(level);
                                }}
                                className={`min-w-[34px] h-[30px] px-2 rounded-md text-xs font-display font-bold border transition-colors ${
                                  selected
                                    ? 'bg-piu-accent text-white border-piu-accent'
                                    : inSelectedRange
                                      ? 'bg-piu-accent/15 text-piu-accent border-piu-accent/40'
                                      : 'bg-piu-dark text-gray-400 border-piu-border/60 hover:text-white'
                                }`}
                              >
                                {level}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No selectable levels available yet.</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-gray-500">
                        Selected range:{' '}
                        {selectedTrainingMin !== null && selectedTrainingMax !== null
                          ? `Lv.${selectedTrainingMin} to Lv.${selectedTrainingMax}`
                          : 'Select two levels'}
                      </p>
                      <button
                        type="button"
                        disabled={trainingLoading || selectedTrainingMin === null || selectedTrainingMax === null}
                        onClick={() => {
                          fetchTrainingRecommendations({
                            chartMode: trainingChartMode,
                            minLevel: selectedTrainingMin,
                            maxLevel: selectedTrainingMax,
                            preserveSelection: true,
                          }).catch(() => {});
                        }}
                        className="px-3 py-1.5 rounded text-xs font-display font-bold bg-piu-accent text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Generate Training Songs
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-2">No training data available.</p>
                )}
              </div>

              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent">SKILLS TO PRACTISE</h3>
                {trainingData?.weak_skills?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {trainingData.weak_skills.map((skill) => (
                      <button
                        key={skill.slug}
                        type="button"
                        onClick={() => handleOpenSkillInfo(skill.slug)}
                        className="px-2 py-1 rounded-md text-[11px] bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 font-display hover:bg-cyan-500/25 transition-colors"
                      >
                        {skill.name} ({skill.count})
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-2">No weak-skill signal yet. Sync more best scores and recent plays.</p>
                )}
              </div>

              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent">TRAINING SONGS (TOP 10)</h3>
                <p className="text-[10px] text-gray-500 mt-1">
                  {trainingChartMode === 'single' ? 'Singles' : 'Doubles'}
                  {selectedTrainingMin !== null && selectedTrainingMax !== null
                    ? ` · Lv.${selectedTrainingMin} to Lv.${selectedTrainingMax}`
                    : ''}
                </p>
                {trainingData?.recommendations?.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    {trainingData.recommendations.map((row, idx) => (
                      <div key={`${row.chart_id}-${idx}`} className="flex items-start gap-2.5 py-2 border-b border-piu-border/30 last:border-0">
                        <span className="text-[11px] text-gray-500 font-mono w-4 shrink-0 text-right">{idx + 1}</span>
                        <SongJacket
                          title={row.title}
                          mode={row.mode}
                          level={row.level}
                          bgUrl={row.jacket_url}
                          jacketLookup={jacketLookup}
                        />
                        <div className="min-w-0 flex-1">
                          <Link to={`/songs/chart/${row.chart_id}`} className="text-sm font-display font-bold hover:text-piu-accent transition-colors line-clamp-1">
                            {row.title}
                          </Link>
                          <p className="text-[10px] text-gray-500">{row.artist || 'Unknown artist'} · {row.mode} {row.level}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{row.reason}</p>
                          {Array.isArray(row.weak_skill_hits) && row.weak_skill_hits.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {row.weak_skill_hits.map((hit) => (
                                <button
                                  key={`${row.chart_id}-${hit.slug}`}
                                  type="button"
                                  onClick={() => handleOpenSkillInfo(hit.slug)}
                                  className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-display hover:bg-cyan-500/25 transition-colors"
                                >
                                  {hit.name}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right shrink-0">
                          {row.best_score != null ? (
                            <>
                              <p className="text-xs font-mono font-bold">{row.best_score.toLocaleString()}</p>
                              <p className={`text-[10px] font-display ${getGradeColor(row.best_grade)}`}>{row.best_grade || getRank(row.best_score).label}</p>
                            </>
                          ) : (
                            <p className="text-[10px] font-display text-yellow-300">No clear yet</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-2">No recommendations found in your current scoring/passing range.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'sniping' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="font-display font-bold text-sm text-piu-accent">SNIPING OPTIONS</h3>
            {snipingInitLoading && !snipingInitialized ? (
              <p className="text-xs text-gray-500">Loading players and level options...</p>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div ref={snipingSearchWrapRef} className="relative sm:col-span-2">
                <label className="text-[10px] text-gray-500 font-display uppercase mb-1 block">Friend</label>
                <input
                  value={snipingQuery}
                  onFocus={() => setSnipingShowSuggestions(true)}
                  onChange={(event) => {
                    setSnipingQuery(event.target.value);
                    setSnipingShowSuggestions(true);
                  }}
                  placeholder="Search player"
                  className="input-field w-full"
                />
                {snipingShowSuggestions && displayedSnipingSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                    {displayedSnipingSuggestions.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleSelectSnipingOpponent(entry)}
                        className="w-full px-3 py-2 hover:bg-piu-dark/70 transition-colors border-b border-piu-border/20 last:border-0 text-left"
                      >
                        <p className="text-sm font-display font-bold truncate">{entry.username}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] text-gray-500 font-display uppercase mb-1 block">Mode</label>
                <select
                  value={snipingMode}
                  onChange={(event) => {
                    setSnipingMode(event.target.value);
                    setSnipingLevel('All');
                    setSnipingPage(1);
                    setSnipingResult(null);
                  }}
                  className="input-field w-full"
                >
                  <option>Both</option>
                  <option>Singles</option>
                  <option>Doubles</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 font-display uppercase mb-1 block">Level</label>
                <select
                  value={snipingLevel}
                  onChange={(event) => {
                    setSnipingLevel(event.target.value);
                    setSnipingPage(1);
                    setSnipingResult(null);
                  }}
                  className="input-field w-full"
                >
                  <option value="All">All Levels</option>
                  {snipingCompareLevels.map((level) => (
                    <option key={`sniping-level-${level}`} value={String(level)}>Lv.{level}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-gray-500">
                {snipingOpponent ? `Comparing against @${snipingOpponent.username}` : 'Select a player to compare against'}
              </p>
              <button
                type="button"
                disabled={snipingLoading}
                onClick={() => runSnipingComparison(1)}
                className="px-3 py-1.5 rounded text-xs font-display font-bold bg-piu-accent text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {snipingLoading ? 'Comparing...' : 'Find Snipes'}
              </button>
            </div>
          </div>

          {snipingLoading ? (
            <div className="card text-sm text-gray-500">Running sniping comparison...</div>
          ) : null}

          {snipingResult ? (
            <>
              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent">LEVEL COMPARISON</h3>
                <div className="overflow-x-auto mt-2 rounded-lg border border-piu-border/40">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-[#0f172a] text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Metric</th>
                        <th className="px-3 py-2 text-right">{snipingUserA?.username || 'You'}</th>
                        <th className="px-3 py-2 text-right">{snipingUserB?.username || 'Opponent'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-piu-border/30">
                        <td className="px-3 py-2">Shared passed charts</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(snipingComparison?.shared_chart_count)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(snipingComparison?.shared_chart_count)}</td>
                      </tr>
                      <tr className="border-t border-piu-border/30">
                        <td className="px-3 py-2">Higher score wins</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(snipingComparison?.wins?.a)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(snipingComparison?.wins?.b)}</td>
                      </tr>
                      <tr className="border-t border-piu-border/30">
                        <td className="px-3 py-2">Total passed</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(snipingComparison?.total_passed?.a)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(snipingComparison?.total_passed?.b)}</td>
                      </tr>
                      <tr className="border-t border-piu-border/30">
                        <td className="px-3 py-2">Rating total</td>
                        <td className="px-3 py-2 text-right font-mono text-piu-gold">{formatNumber(snipingComparison?.rating?.a)}</td>
                        <td className="px-3 py-2 text-right font-mono text-piu-gold">{formatNumber(snipingComparison?.rating?.b)}</td>
                      </tr>
                      <tr className="border-t border-piu-border/30">
                        <td className="px-3 py-2">Ties</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(snipingComparison?.wins?.ties)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(snipingComparison?.wins?.ties)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-sm text-piu-accent">TOP DIFFERENCES IN SHARED PASSED CHARTS</h3>
                  <p className="text-xs text-gray-500">{formatNumber(snipingTotalItems)} charts</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Only songs where {snipingUserB?.username || 'your opponent'} has a higher score than you. Sorted by biggest score difference.
                </p>
                <div className="overflow-x-auto mt-2 rounded-lg border border-piu-border/40">
                  <table className="min-w-[560px] w-full text-xs sm:text-sm">
                    <thead className="bg-[#0f172a] text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Song</th>
                        <th className="px-3 py-2 text-right">{snipingUserA?.username || 'You'}</th>
                        <th className="px-3 py-2 text-right">{snipingUserB?.username || 'Opponent'}</th>
                        <th className="px-3 py-2 text-right">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snipingRows.map((row, index) => (
                        <tr key={`${row.chart_id || row.title}-${index}`} className="border-t border-piu-border/30">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <SongJacket
                                title={row.title}
                                mode={row.mode}
                                level={row.level}
                                bgUrl={row.jacket_url}
                                jacketLookup={jacketLookup}
                              />
                              <div className="min-w-0">
                                {row.chart_id ? (
                                  <Link to={`/songs/chart/${row.chart_id}`} className="text-sm font-display font-bold hover:text-piu-accent transition-colors line-clamp-1">
                                    {row.title}
                                  </Link>
                                ) : (
                                  <p className="text-sm font-display font-bold line-clamp-1">{row.title}</p>
                                )}
                                <p className="text-[10px] text-gray-500">{row.mode} {row.level}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <p className="font-mono">{formatNumber(row.score_a)}</p>
                            <p className={`text-[10px] font-display ${getGradeColor(row.grade_a)}`}>{row.grade_a || getRank(row.score_a).label}</p>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <p className="font-mono">{formatNumber(row.score_b)}</p>
                            <p className={`text-[10px] font-display ${getGradeColor(row.grade_b)}`}>{row.grade_b || getRank(row.score_b).label}</p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-300">
                            {formatNumber(row.score_diff || ((row.score_b || 0) - (row.score_a || 0)))}
                          </td>
                        </tr>
                      ))}
                      {snipingRows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center text-gray-500 py-8">No opponent wins found for this mode/level selection.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={snipingLoading || snipingCurrentPage <= 1}
                    onClick={() => runSnipingComparison(snipingCurrentPage - 1)}
                    className="px-2.5 py-1 rounded text-[11px] font-display font-bold bg-piu-dark text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <p className="text-[11px] text-gray-500 font-mono">
                    Page {snipingCurrentPage} / {snipingTotalPages}
                  </p>
                  <button
                    type="button"
                    disabled={snipingLoading || snipingCurrentPage >= snipingTotalPages}
                    onClick={() => runSnipingComparison(snipingCurrentPage + 1)}
                    className="px-2.5 py-1 rounded text-[11px] font-display font-bold bg-piu-dark text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="card text-xs text-gray-500">
              Select a player, mode, and optional level, then run sniping to list charts where your opponent outscored you.
            </div>
          )}
        </div>
      )}

      <SkillInfoModal
        open={skillInfoOpen}
        loading={skillInfoLoading}
        error={skillInfoError}
        skill={activeSkillInfo?.skill || null}
        chartCount={Number.isFinite(parseInt(activeSkillInfo?.chart_count, 10)) ? parseInt(activeSkillInfo.chart_count, 10) : null}
        onClose={() => {
          setSkillInfoOpen(false);
          setSkillInfoError('');
          setSkillInfoLoading(false);
        }}
      />
    </div>
  );
}

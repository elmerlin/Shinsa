import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import {
  getFollowing,
  getHourOfPowerOptimize,
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

function formatDecimal(value, digits = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : (0).toFixed(digits);
}

function formatSecondsClock(value) {
  const totalSeconds = Math.max(0, parseInt(value, 10) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function PlayerAvatar({ player, fallbackName, size = 'w-8 h-8' }) {
  const name = player?.username || fallbackName || '?';
  if (player?.avatar) {
    return (
      <img
        src={getAvatarUrl(player.avatar)}
        alt={name}
        className={`${size} rounded-full object-cover border border-piu-border`}
      />
    );
  }
  return (
    <div className={`${size} rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs`}>
      {name[0].toUpperCase()}
    </div>
  );
}

function StarValue({ value, starred, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 justify-end ${className}`}>
      {starred && <span className="text-emerald-400">★</span>}
      <span>{value}</span>
    </span>
  );
}

function tinyLevelBadge(mode, level) {
  const isSingle = String(mode || '').toLowerCase().startsWith('s');
  return (
    <span className={`inline-flex items-center justify-center rounded-full min-w-[24px] h-6 px-1.5 border text-white font-display font-black text-[10px] ${
      isSingle
        ? 'bg-gradient-to-b from-red-500 to-red-800 border-red-300/50'
        : 'bg-gradient-to-b from-green-500 to-emerald-800 border-green-300/50'
    }`}>
      {level}
    </span>
  );
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

function compareHopOptimizeByEfficiency(a, b) {
  if ((Number(b?.rating_points_per_second) || 0) !== (Number(a?.rating_points_per_second) || 0)) {
    return (Number(b?.rating_points_per_second) || 0) - (Number(a?.rating_points_per_second) || 0);
  }
  if ((parseInt(b?.rating_points, 10) || 0) !== (parseInt(a?.rating_points, 10) || 0)) {
    return (parseInt(b?.rating_points, 10) || 0) - (parseInt(a?.rating_points, 10) || 0);
  }
  if ((parseInt(a?.duration_seconds, 10) || 0) !== (parseInt(b?.duration_seconds, 10) || 0)) {
    return (parseInt(a?.duration_seconds, 10) || 0) - (parseInt(b?.duration_seconds, 10) || 0);
  }
  if ((parseInt(a?.level, 10) || 0) !== (parseInt(b?.level, 10) || 0)) {
    return (parseInt(a?.level, 10) || 0) - (parseInt(b?.level, 10) || 0);
  }
  return String(a?.song_title || '').localeCompare(String(b?.song_title || ''));
}

function compareHopOptimizeByLevel(a, b) {
  if ((parseInt(a?.level, 10) || 0) !== (parseInt(b?.level, 10) || 0)) {
    return (parseInt(a?.level, 10) || 0) - (parseInt(b?.level, 10) || 0);
  }
  return compareHopOptimizeByEfficiency(a, b);
}

function getHopModeLabel(mode) {
  if (mode === 'Single') return 'Singles';
  if (mode === 'Double') return 'Doubles';
  return 'Both';
}

function HourOfPowerOptimizeList({ title, subtitle, rows, jacketLookup, showRank = false }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div className="card">
        <h3 className="font-display font-bold text-sm text-piu-accent">{title}</h3>
        {subtitle ? <p className="text-[11px] text-gray-500 mt-1">{subtitle}</p> : null}
        <p className="text-xs text-gray-500 mt-3">No recommendations available for the current filters.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="font-display font-bold text-sm text-piu-accent">{title}</h3>
      {subtitle ? <p className="text-[11px] text-gray-500 mt-1">{subtitle}</p> : null}
      <div className="overflow-x-auto mt-3 rounded-lg border border-piu-border/40">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-[#0f172a] text-gray-400">
            <tr>
              {showRank ? <th className="px-3 py-2 text-left">Rank</th> : null}
              <th className="px-3 py-2 text-left">Song</th>
              <th className="px-3 py-2 text-right">Best</th>
              <th className="px-3 py-2 text-right">Time</th>
              <th className="px-3 py-2 text-right">Pts</th>
              <th className="px-3 py-2 text-right">Pts/Sec</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${title}-${row.chart_key || `${row.song_title}-${row.mode}-${row.level}`}-${idx}`} className="border-t border-piu-border/30">
                {showRank ? (
                  <td className="px-3 py-2 align-top font-display font-black text-white">
                    #{idx + 1}
                  </td>
                ) : null}
                <td className="px-3 py-2 align-top min-w-0">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <SongJacket
                      title={row.song_title}
                      mode={row.mode}
                      level={row.level}
                      bgUrl={row.jacket_url}
                      jacketLookup={jacketLookup}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-display font-bold text-white truncate" title={row.song_title}>
                        {row.song_title}
                      </p>
                      {parseInt(row.over_top100_rank, 10) > 0 ? (
                        <span className="mt-1 inline-flex rounded-full border border-yellow-300/25 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-yellow-100">
                          #{row.over_top100_rank}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right align-top">
                  <p className={`font-display font-black ${getGradeColor(row.grade)}`}>{row.grade || '--'}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-gray-300">{formatNumber(row.score)}</p>
                </td>
                <td className="px-3 py-2 text-right align-top font-mono text-gray-200">{formatSecondsClock(row.duration_seconds)}</td>
                <td className="px-3 py-2 text-right align-top font-mono text-yellow-100">{formatNumber(row.rating_points)}</td>
                <td className="px-3 py-2 text-right align-top font-mono font-bold text-emerald-300">{formatDecimal(row.rating_points_per_second, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

  const [hopLoading, setHopLoading] = useState(false);
  const [hopData, setHopData] = useState(null);
  const [hopMode, setHopMode] = useState('Both');
  const [hopMinLevel, setHopMinLevel] = useState('');

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
  const [snipingOpenSongInfoKey, setSnipingOpenSongInfoKey] = useState('');
  const snipingSearchWrapRef = useRef(null);

  const [skillInfoOpen, setSkillInfoOpen] = useState(false);
  const [skillInfoLoading, setSkillInfoLoading] = useState(false);
  const [skillInfoError, setSkillInfoError] = useState('');
  const [activeSkillSlug, setActiveSkillSlug] = useState('');
  const [skillInfoCache, setSkillInfoCache] = useState({});
  const hasOptimiseAccess = !!(user?.is_admin || user?.feature_access?.optimise);

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
    if (!user?.id || activeTab !== 'hop' || hopData) return;

    let cancelled = false;
    setHopLoading(true);
    setError('');

    Promise.all([
      getHourOfPowerOptimize({ limit: 50 }),
      pumbilityData ? Promise.resolve(pumbilityData) : getPiugamePumbility(user.id).catch(() => null),
    ])
      .then(([optimizePayload, pumbilityPayload]) => {
        if (cancelled) return;
        setHopData(optimizePayload || null);
        if (!pumbilityData && pumbilityPayload) {
          setPumbilityData(pumbilityPayload);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load Hour of Power recommendations');
      })
      .finally(() => {
        if (!cancelled) setHopLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, hopData, pumbilityData, user?.id]);

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
    setSnipingOpenSongInfoKey('');
  };

  const runSnipingComparison = async (targetPage = 1) => {
    if (!user?.id) return;
    if (!snipingOpponent?.id) {
      setError('Choose a player to compare against.');
      return;
    }

    setSnipingLoading(true);
    setError('');
    setSnipingOpenSongInfoKey('');
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
  const hopRecommendationPool = useMemo(() => (
    Array.isArray(hopData?.level_order_recommendations) ? hopData.level_order_recommendations : []
  ), [hopData]);
  const hopAvailableLevels = useMemo(() => {
    const levelSet = new Set();
    for (const row of hopRecommendationPool) {
      const normalizedMode = String(row?.mode || '').trim();
      if (hopMode === 'Singles' && normalizedMode !== 'Single') continue;
      if (hopMode === 'Doubles' && normalizedMode !== 'Double') continue;
      const level = parseInt(row?.level, 10);
      if (Number.isFinite(level) && level > 0) levelSet.add(level);
    }
    return Array.from(levelSet).sort((a, b) => a - b);
  }, [hopRecommendationPool, hopMode]);
  const getDefaultHopMinLevel = (modeLabel, levels = hopAvailableLevels) => {
    const modeKey = String(modeLabel || 'Both');
    const available = Array.isArray(levels) ? levels : [];
    if (available.length === 0) return '';

    const competitiveLevel = modeKey === 'Singles'
      ? (parseInt(pumbilityData?.singles_competitive_level, 10) || 0)
      : modeKey === 'Doubles'
        ? (parseInt(pumbilityData?.doubles_competitive_level, 10) || 0)
        : (parseInt(pumbilityData?.competitive_level, 10) || 0);
    const desiredMin = Math.max(1, competitiveLevel > 0 ? competitiveLevel - 5 : available[0]);
    const fallback = available.find((level) => level >= desiredMin);
    return String(fallback || available[0] || '');
  };
  const hopEffectiveMinLevel = parseInt(hopMinLevel, 10) || 0;
  const filteredHopRows = useMemo(() => {
    return hopRecommendationPool.filter((row) => {
      const normalizedMode = String(row?.mode || '').trim();
      if (hopMode === 'Singles' && normalizedMode !== 'Single') return false;
      if (hopMode === 'Doubles' && normalizedMode !== 'Double') return false;
      if (hopEffectiveMinLevel > 0 && (parseInt(row?.level, 10) || 0) < hopEffectiveMinLevel) return false;
      return true;
    });
  }, [hopRecommendationPool, hopMode, hopEffectiveMinLevel]);
  const hopTopRows = useMemo(
    () => filteredHopRows.slice().sort(compareHopOptimizeByEfficiency).slice(0, 20),
    [filteredHopRows]
  );
  const hopLevelRows = useMemo(
    () => filteredHopRows.slice().sort(compareHopOptimizeByLevel),
    [filteredHopRows]
  );
  const hopBestRecommendation = hopTopRows[0] || null;
  const snipingRows = Array.isArray(snipingResult?.top_song_diffs) ? snipingResult.top_song_diffs : [];
  const snipingComparison = snipingResult?.comparison || null;
  const snipingPagination = snipingResult?.pagination || {};
  const snipingCurrentPage = parseInt(snipingPagination.page, 10) || snipingPage;
  const snipingTotalPages = parseInt(snipingPagination.total_pages, 10) || 1;
  const snipingTotalItems = parseInt(snipingPagination.total_items, 10) || 0;
  const snipingUserA = snipingResult?.users?.a || user || null;
  const snipingUserB = snipingResult?.users?.b || snipingOpponent || null;
  const snipingMetricWinner = useMemo(() => {
    const wins = snipingComparison?.metric_wins || {};
    return {
      higherScore: wins.higher_score || null,
      totalPassed: wins.total_passed || null,
      ratingTotal: wins.rating_total || null,
    };
  }, [snipingComparison]);
  const displayedSnipingRows = useMemo(() => {
    return [...snipingRows].sort((a, b) => {
      const diffA = parseInt(a?.score_diff, 10) || Math.max(0, (parseInt(a?.score_b, 10) || 0) - (parseInt(a?.score_a, 10) || 0));
      const diffB = parseInt(b?.score_diff, 10) || Math.max(0, (parseInt(b?.score_b, 10) || 0) - (parseInt(b?.score_a, 10) || 0));
      if (diffB !== diffA) return diffB - diffA;
      return (parseInt(b?.score_b, 10) || 0) - (parseInt(a?.score_b, 10) || 0);
    });
  }, [snipingRows]);

  useEffect(() => {
    if (activeTab !== 'hop') return;
    if (hopAvailableLevels.length === 0) {
      if (hopMinLevel) setHopMinLevel('');
      return;
    }
    if (hopMinLevel && hopAvailableLevels.includes(parseInt(hopMinLevel, 10))) return;
    setHopMinLevel(getDefaultHopMinLevel(hopMode, hopAvailableLevels));
  }, [activeTab, hopAvailableLevels, hopMinLevel, hopMode, pumbilityData]);

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

  if (!hasOptimiseAccess) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="card text-center">
          <h1 className="text-xl font-display font-bold">OPTIMISE</h1>
          <p className="text-sm text-gray-400 mt-2">This feature is invite-only.</p>
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
            onClick={() => setActiveTab('hop')}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              activeTab === 'hop' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
            }`}
          >
            HoP
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

      {activeTab === 'hop' && (
        <div className="space-y-4">
          {hopLoading ? (
            <div className="card text-sm text-gray-500">Loading Hour of Power recommendations...</div>
          ) : (
            <>
              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent">HOUR OF POWER OPTIMISER</h3>
                <p className="text-[11px] text-gray-500 mt-1">
                  Uses your stored best clears, the exact HoP rating formula, and song durations to prioritize rating points per second.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <p className="text-[10px] text-gray-500 font-display uppercase mb-1">Mode</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {['Both', 'Singles', 'Doubles'].map((modeLabel) => (
                        <button
                          key={`hop-mode-${modeLabel}`}
                          type="button"
                          onClick={() => {
                            if (hopMode === modeLabel) return;
                            const nextLevels = hopRecommendationPool
                              .filter((row) => (
                                modeLabel === 'Both'
                                  || (modeLabel === 'Singles' && row.mode === 'Single')
                                  || (modeLabel === 'Doubles' && row.mode === 'Double')
                              ))
                              .map((row) => parseInt(row?.level, 10))
                              .filter((level) => Number.isFinite(level) && level > 0);
                            const uniqueLevels = Array.from(new Set(nextLevels)).sort((a, b) => a - b);
                            setHopMode(modeLabel);
                            setHopMinLevel(getDefaultHopMinLevel(modeLabel, uniqueLevels));
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-display font-bold transition-colors ${
                            hopMode === modeLabel ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                          }`}
                        >
                          {modeLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 font-display uppercase mb-1 block">Minimum Level</label>
                    <select
                      value={hopMinLevel}
                      onChange={(event) => setHopMinLevel(event.target.value)}
                      className="input-field w-full"
                    >
                      {hopAvailableLevels.map((level) => (
                        <option key={`hop-level-${hopMode}-${level}`} value={String(level)}>Lv.{level}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Default start: competitive level minus 5 for {getHopModeLabel(hopMode).toLowerCase()}.
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5">
                    <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">Filtered Charts</p>
                    <p className="mt-1 text-lg font-display font-black text-white">{formatNumber(filteredHopRows.length)}</p>
                  </div>
                  <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5">
                    <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">Min Level</p>
                    <p className="mt-1 text-lg font-display font-black text-cyan-100">{hopMinLevel ? `Lv.${hopMinLevel}` : '--'}</p>
                  </div>
                  <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5">
                    <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">Best Pace</p>
                    <p className="mt-1 text-lg font-display font-black text-emerald-200">
                      {hopBestRecommendation ? formatDecimal(hopBestRecommendation.rating_points_per_second, 3) : '--'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5">
                    <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">Competitive Lv</p>
                    <p className="mt-1 text-lg font-display font-black text-amber-100">
                      {hopMode === 'Singles'
                        ? (pumbilityData?.singles_competitive_level ? `S${pumbilityData.singles_competitive_level}` : '--')
                        : hopMode === 'Doubles'
                          ? (pumbilityData?.doubles_competitive_level ? `D${pumbilityData.doubles_competitive_level}` : '--')
                          : (pumbilityData?.competitive_level
                            ? `${pumbilityData?.competitive_mode === 'Double' ? 'D' : 'S'}${pumbilityData.competitive_level}`
                            : '--')}
                    </p>
                  </div>
                </div>
              </div>

              <HourOfPowerOptimizeList
                title="TOP 20 HOUR OF POWER RECOMMENDATIONS"
                subtitle="Highest rating points per second in your current filtered pool."
                rows={hopTopRows}
                jacketLookup={jacketLookup}
                showRank
              />

              <HourOfPowerOptimizeList
                title="EASIEST TO HARDEST"
                subtitle="The same recommendation pool ordered by chart level, with the strongest points-per-second options first inside each level."
                rows={hopLevelRows}
                jacketLookup={jacketLookup}
              />
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
                        className="w-full px-3 py-2 hover:bg-piu-dark/70 transition-colors border-b border-piu-border/20 last:border-0 text-left flex items-center gap-2"
                      >
                        <PlayerAvatar player={entry} fallbackName={entry.username} size="w-8 h-8" />
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
                    setSnipingOpenSongInfoKey('');
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
                    setSnipingOpenSongInfoKey('');
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
                        <th className="px-3 py-2 text-right">
                          <span className="inline-flex items-center justify-end gap-1.5 w-full">
                            <PlayerAvatar player={snipingUserA} fallbackName={snipingUserA?.username || 'You'} size="w-6 h-6" />
                            <span>{snipingUserA?.username || 'You'}</span>
                          </span>
                        </th>
                        <th className="px-3 py-2 text-right">
                          <span className="inline-flex items-center justify-end gap-1.5 w-full">
                            <PlayerAvatar player={snipingUserB} fallbackName={snipingUserB?.username || 'Opponent'} size="w-6 h-6" />
                            <span>{snipingUserB?.username || 'Opponent'}</span>
                          </span>
                        </th>
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
                        <td className="px-3 py-2 text-right font-mono">
                          <StarValue value={formatNumber(snipingComparison?.wins?.a)} starred={snipingMetricWinner.higherScore === 'a'} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          <StarValue value={formatNumber(snipingComparison?.wins?.b)} starred={snipingMetricWinner.higherScore === 'b'} />
                        </td>
                      </tr>
                      <tr className="border-t border-piu-border/30">
                        <td className="px-3 py-2">Total passed</td>
                        <td className="px-3 py-2 text-right font-mono">
                          <StarValue value={formatNumber(snipingComparison?.total_passed?.a)} starred={snipingMetricWinner.totalPassed === 'a'} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          <StarValue value={formatNumber(snipingComparison?.total_passed?.b)} starred={snipingMetricWinner.totalPassed === 'b'} />
                        </td>
                      </tr>
                      <tr className="border-t border-piu-border/30">
                        <td className="px-3 py-2">Rating total</td>
                        <td className="px-3 py-2 text-right font-mono text-piu-gold">
                          <StarValue value={formatNumber(snipingComparison?.rating?.a)} starred={snipingMetricWinner.ratingTotal === 'a'} className="text-piu-gold" />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-piu-gold">
                          <StarValue value={formatNumber(snipingComparison?.rating?.b)} starred={snipingMetricWinner.ratingTotal === 'b'} className="text-piu-gold" />
                        </td>
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
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-[#0f172a] text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Song</th>
                        <th className="px-3 py-2 text-right">My Score</th>
                        <th className="px-3 py-2 text-right">Opponent Score</th>
                        <th className="px-3 py-2 text-right">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedSnipingRows.map((row, index) => {
                        const rowKey = `${row.chart_id || row.title}-${index}`;
                        const showInfo = snipingOpenSongInfoKey === rowKey;
                        const myGrade = row.grade_a || getRank(row.score_a).label;
                        const opponentGrade = row.grade_b || getRank(row.score_b).label;
                        const diff = row.score_diff || ((row.score_b || 0) - (row.score_a || 0));
                        return (
                          <tr key={rowKey} className="border-t border-piu-border/30 hover:bg-piu-dark/35 transition-colors">
                            <td className="px-3 py-2 align-top">
                              <button
                                type="button"
                                onClick={() => setSnipingOpenSongInfoKey((prev) => (prev === rowKey ? '' : rowKey))}
                                className="inline-flex flex-col items-start"
                                title={row.title || 'Song'}
                              >
                                <span className="relative inline-block w-10 h-6 shrink-0">
                                  {row.jacket_url ? (
                                    <img src={row.jacket_url} alt={row.title} className="w-full h-full rounded object-cover border border-piu-border/40" />
                                  ) : (
                                    <span className="w-full h-full rounded bg-piu-dark border border-piu-border/40 inline-block" />
                                  )}
                                  <span className="absolute -top-2 -right-2">{tinyLevelBadge(row.mode, row.level)}</span>
                                </span>
                                {showInfo && (
                                  <span className="mt-1 rounded-md border border-piu-border/40 bg-[#0b1324]/80 px-1.5 py-1 text-[10px] text-left leading-tight text-gray-200 max-w-[160px] break-words">
                                    {row.title}
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <p className="font-mono">{formatNumber(row.score_a)}</p>
                              <p className={`font-display font-bold ${getGradeColor(myGrade)}`}>{myGrade}</p>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <p className="font-mono inline-flex items-center gap-1 justify-end">
                                <span className="text-emerald-400">★</span>
                                {formatNumber(row.score_b)}
                              </p>
                              <p className={`font-display font-bold ${getGradeColor(opponentGrade)}`}>{opponentGrade}</p>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-300">{formatNumber(diff)}</td>
                          </tr>
                        );
                      })}
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

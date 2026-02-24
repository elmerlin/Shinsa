import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getJacketMap,
  getPiugamePumbility,
  getPumbilityRecommendations,
  getTrainingRecommendations,
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

  useEffect(() => {
    if (!user?.id || activeTab !== 'training' || trainingData) return;

    let cancelled = false;
    setTrainingLoading(true);
    setError('');

    getTrainingRecommendations('both')
      .then((data) => {
        if (cancelled) return;
        setTrainingData(data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load training recommendations');
      })
      .finally(() => {
        if (!cancelled) setTrainingLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, trainingData, user?.id]);

  const headline = useMemo(() => {
    if (!pumbilityData || !pumbilityData.pumbility_value) return '';
    const base = `${(pumbilityData.pumbility_value || 0).toLocaleString()} PB`;
    if (pumbilityData.ranking) return `${base}  ·  #${pumbilityData.ranking}`;
    return base;
  }, [pumbilityData]);

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
                <h3 className="font-display font-bold text-sm text-piu-accent">TRAINING PROFILE</h3>
                {trainingData ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
                      <div className="bg-piu-dark/50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-gray-500 font-display uppercase">Pumbility</p>
                        <p className="text-sm font-mono font-bold">{(trainingData.pumbility || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-piu-dark/50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-gray-500 font-display uppercase">Avg Rating</p>
                        <p className="text-sm font-mono font-bold">{(trainingData.avg_rating || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-piu-dark/50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-gray-500 font-display uppercase">Scoring Lv</p>
                        <p className="text-sm font-mono font-bold">{trainingData.scoring_level || '--'}</p>
                      </div>
                      <div className="bg-piu-dark/50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-gray-500 font-display uppercase">Passing Lv</p>
                        <p className="text-sm font-mono font-bold">{trainingData.passing_level || '--'}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                      Recommendation level range: Lv.{trainingData.min_level || '--'} to Lv.{trainingData.max_level || '--'}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-500 mt-2">No training data available.</p>
                )}
              </div>

              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent">SKILLS TO PRACTISE</h3>
                {trainingData?.weak_skills?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {trainingData.weak_skills.map((skill) => (
                      <span key={skill.slug} className="px-2 py-1 rounded-md text-[11px] bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 font-display">
                        {skill.name} ({skill.count})
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-2">No weak-skill signal yet. Sync more best scores and recent plays.</p>
                )}
              </div>

              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent">TRAINING SONGS (TOP 10)</h3>
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
                                <span key={`${row.chart_id}-${hit.slug}`} className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-display">
                                  {hit.name}
                                </span>
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
    </div>
  );
}

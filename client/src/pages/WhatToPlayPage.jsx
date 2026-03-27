import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getGoalRecommendations } from '../utils/api';
import GoalSummaryCard from '../components/recommendations/GoalSummaryCard';
import RecommendationSongCard from '../components/recommendations/RecommendationSongCard';

function GoalToggle({ goal, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-piu-border overflow-hidden">
      {[
        { value: 'title', label: 'Next Skill Title' },
        { value: 'pumbility', label: 'Pumbility' },
      ].map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 text-xs font-display font-bold transition-colors ${
            goal === opt.value
              ? 'bg-piu-accent text-white'
              : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ModeToggle({ mode, goal, onChange }) {
  const options = goal === 'title'
    ? [{ value: 'double', label: 'Doubles' }, { value: 'single', label: 'Singles' }]
    : [{ value: 'both', label: 'Both' }, { value: 'single', label: 'Singles' }];

  return (
    <div className="inline-flex rounded-lg border border-piu-border overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-[11px] font-display font-bold transition-colors ${
            mode === opt.value
              ? 'bg-piu-accent/20 text-piu-accent border-piu-accent'
              : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RefreshButton({ onClick, spinning }) {
  return (
    <button
      onClick={onClick}
      className="w-8 h-8 rounded-lg border border-piu-border bg-piu-dark flex items-center justify-center hover:border-gray-500 hover:text-white text-gray-400 transition-all active:scale-90"
      title="Refresh recommendations"
    >
      <svg
        className={`w-4 h-4 transition-transform duration-500 ${spinning ? 'animate-spin' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
}

export default function WhatToPlayPage() {
  const { user } = useAuth();
  const [goal, setGoal] = useState('title');
  const [mode, setMode] = useState('double');
  const [seed, setSeed] = useState(() => Date.now());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const fetchData = useCallback(async (g, m, s) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const result = await getGoalRecommendations({ goal: g, mode: m, seed: s, limit: 12 });
      setData(result);
      setAnimKey((k) => k + 1);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData(goal, mode, seed);
  }, [goal, mode, seed, fetchData]);

  const handleGoalChange = (newGoal) => {
    if (newGoal === goal) return;
    const defaultMode = newGoal === 'title' ? 'double' : 'both';
    setGoal(newGoal);
    setMode(defaultMode);
    setSeed(Date.now());
  };

  const handleRefresh = () => {
    setSpinning(true);
    setSeed(Date.now());
    setTimeout(() => setSpinning(false), 500);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-piu-bg flex items-center justify-center">
        <p className="text-gray-500 font-display">Sign in to see recommendations</p>
      </div>
    );
  }

  const recommendations = data?.recommendations || [];
  const status = data?.status || null;

  return (
    <div className="min-h-screen bg-piu-bg text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight">
            WHAT TO PLAY
          </h1>
          <p className="text-xs text-gray-500 font-body mt-1">
            Charts picked for your goal. Refresh for new picks.
          </p>
        </div>

        {/* Goal toggle */}
        <GoalToggle goal={goal} onChange={handleGoalChange} />

        {/* Controls row */}
        <div className="flex items-center gap-3 mt-4">
          <ModeToggle mode={mode} goal={goal} onChange={setMode} />
          <RefreshButton onClick={handleRefresh} spinning={spinning} />
          {loading && (
            <div className="w-4 h-4 border-2 border-piu-accent/30 border-t-piu-accent rounded-full animate-spin" />
          )}
        </div>

        {/* Summary */}
        <div className="mt-4">
          <GoalSummaryCard
            goal={goal}
            summary={data?.summary}
            status={status}
          />
        </div>

        {/* Recommendation grid */}
        {recommendations.length > 0 && (
          <div
            key={animKey}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-6"
          >
            {recommendations.map((rec, i) => (
              <RecommendationSongCard
                key={rec.chart_id || `${rec.song_title}-${rec.mode}-${rec.level}`}
                rec={rec}
                goal={goal}
                index={i}
                animKey={animKey}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && status === 'ok' && recommendations.length === 0 && (
          <div className="mt-8 text-center">
            <p className="text-gray-500 font-display text-sm">
              No recommendations found for this goal and mode.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

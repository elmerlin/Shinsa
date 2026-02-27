import React, { useEffect, useState, useMemo } from 'react';
import { getUserRankings } from '../utils/api';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function badgeStyle(badge) {
  if (badge === 'top5') return { text: 'Top 5%', color: 'text-sky-300', bg: 'bg-sky-400/15 border-sky-400/40' };
  if (badge === 'top10') return { text: 'Top 10%', color: 'text-piu-gold', bg: 'bg-yellow-400/15 border-yellow-400/40' };
  if (badge === 'top25') return { text: 'Top 25%', color: 'text-amber-400', bg: 'bg-amber-400/15 border-amber-400/40' };
  if (badge === 'top50') return { text: 'Top 50%', color: 'text-piu-silver', bg: 'bg-gray-400/15 border-gray-400/40' };
  return null;
}

function percentileBarColor(percentile) {
  if (percentile >= 90) return 'bg-sky-400';
  if (percentile >= 75) return 'bg-piu-gold';
  if (percentile >= 50) return 'bg-amber-400';
  return 'bg-gray-500';
}

function getGradeFromScore(score) {
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
  return { label: '', color: 'text-gray-500' };
}

export default function RankingsPanel({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMode, setSelectedMode] = useState('Both');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = {};
    if (selectedMode !== 'Both') params.mode = selectedMode;
    getUserRankings(userId, params)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load rankings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, selectedMode]);

  const filteredPercentiles = useMemo(() => {
    if (!data?.level_percentiles) return [];
    if (selectedMode === 'Both') return data.level_percentiles;
    return data.level_percentiles.filter((p) =>
      p.mode === (selectedMode === 'Single' ? 'Single' : 'Double')
    );
  }, [data, selectedMode]);

  if (loading && !data) {
    return (
      <div className="card">
        <h3 className="text-xs font-display font-bold tracking-wide text-piu-accent mb-3">RANKINGS</h3>
        <p className="text-center text-gray-500 py-4 text-xs animate-pulse">Loading rankings...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card">
        <h3 className="text-xs font-display font-bold tracking-wide text-piu-accent mb-3">RANKINGS</h3>
        <p className="text-center text-red-400 py-4 text-xs">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const hasPumbility = data.pumbility > 0 && data.pumbility_percentile !== null;
  const hasLevelData = filteredPercentiles.length > 0;

  if (!hasPumbility && !hasLevelData) {
    return null;
  }

  const overallBadge = data.pumbility_badge ? badgeStyle(data.pumbility_badge) : null;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-display font-bold tracking-wide text-piu-accent">RANKINGS</h3>
        <div className="flex rounded-md overflow-hidden border border-piu-border/40">
          {['Both', 'Single', 'Double'].map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMode(m)}
              className={`px-2 py-0.5 text-[10px] font-display font-bold transition-colors ${
                selectedMode === m
                  ? 'bg-piu-accent/20 text-piu-accent'
                  : 'bg-piu-dark text-gray-500 hover:text-gray-300'
              }`}
            >
              {m === 'Both' ? 'All' : m === 'Single' ? 'S' : 'D'}
            </button>
          ))}
        </div>
      </div>

      {/* Overall pumbility rank */}
      {hasPumbility && (
        <div className="rounded-lg border border-piu-border/50 bg-piu-dark/55 px-3 py-2.5 mb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 font-display">PUMBILITY RANKING</p>
              <p className="text-lg font-display font-black text-white">{formatNumber(data.pumbility)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">
                Top <span className={`font-display font-bold ${overallBadge?.color || 'text-gray-300'}`}>
                  {(100 - data.pumbility_percentile).toFixed(1)}%
                </span>
              </p>
              {overallBadge && (
                <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-display font-bold border ${overallBadge.bg} ${overallBadge.color}`}>
                  {overallBadge.text}
                </span>
              )}
              <p className="text-[10px] text-gray-600 mt-0.5">of {formatNumber(data.leaderboard_total)} players</p>
            </div>
          </div>
        </div>
      )}

      {/* Per-level percentiles */}
      {hasLevelData && (
        <div>
          <p className="text-[10px] text-gray-500 font-display mb-1">
            PER-LEVEL RANKING
            <span className="text-gray-600 ml-1">({data.synced_user_count} synced users)</span>
          </p>
          <p className="text-[10px] text-gray-600 mb-2">
            Your avg score rank at each level vs. other players.
          </p>

          {/* Column headers */}
          <div className="flex items-center gap-3 px-2.5 mb-1">
            <span className="w-8 shrink-0 text-[9px] text-gray-600 font-display">LVL</span>
            <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
              <span className="text-[9px] text-gray-600 font-display">RANK</span>
              <div className="flex items-center gap-3">
                <span className="text-[9px] text-gray-600 font-display">AVG SCORE</span>
                <span className="text-[9px] text-gray-600 font-display w-14 text-right">PERCENTILE</span>
              </div>
            </div>
          </div>

          <div className="space-y-1 max-h-[340px] overflow-y-auto">
            {filteredPercentiles.map((p) => {
              const isSingle = p.mode === 'Single';
              const label = `${isSingle ? 'S' : 'D'}${p.level}`;
              const levelBadge = p.badge ? badgeStyle(p.badge) : null;
              const grade = getGradeFromScore(p.avg_score);
              // Bar shows rank position: rank 1 = 100%, last place = near 0%
              const rankBarPercent = p.total_users > 1
                ? ((p.total_users - p.rank) / (p.total_users - 1)) * 100
                : 100;

              return (
                <div
                  key={`${p.mode}-${p.level}`}
                  className="rounded-lg border border-piu-border/40 bg-piu-dark/45 px-2.5 py-1.5 flex items-center gap-3"
                >
                  <span className={`font-display font-black text-sm w-8 shrink-0 ${
                    isSingle ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {label}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] text-gray-400">
                        <span className="font-mono text-gray-200">#{p.rank}</span>
                        <span className="text-gray-600"> / {p.total_users} players</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-display font-bold ${grade.color}`}>{grade.label}</span>
                        <span className="text-[11px] font-mono text-gray-400">{formatNumber(p.avg_score)}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-piu-dark/80 border border-piu-border/20 overflow-hidden"
                      title={`Rank #${p.rank} of ${p.total_users} — avg score ${formatNumber(p.avg_score)}`}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${percentileBarColor(p.percentile)}`}
                        style={{ width: `${Math.min(100, rankBarPercent)}%` }}
                      />
                    </div>
                    {levelBadge && (
                      <div className="mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-display font-bold border ${levelBadge.bg} ${levelBadge.color}`}>
                          {levelBadge.text}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getUserRankings, getLevelLeaderboard } from '../utils/api';
import { getProfilePath } from '../utils/profile';

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

function rankBarColor(rank, total) {
  if (total < 3) return 'bg-gray-500';
  const ratio = (total - rank) / (total - 1);
  if (ratio >= 0.9) return 'bg-sky-400';
  if (ratio >= 0.75) return 'bg-piu-gold';
  if (ratio >= 0.5) return 'bg-amber-400';
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

function rankMedalColor(rank) {
  if (rank === 1) return 'text-piu-gold';
  if (rank === 2) return 'text-piu-silver';
  if (rank === 3) return 'text-piu-bronze';
  return 'text-gray-500';
}

function sameUserId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function LeaderboardModal({ open, mode, level, profileUserId, viewerUserId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !mode || !level) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getLevelLeaderboard({ mode, level: String(level) })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, mode, level]);

  if (!open) return null;

  const isSingle = mode === 'Single';
  const label = `${isSingle ? 'S' : 'D'}${level}`;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <h3 className="font-display font-bold tracking-wide text-sm">
            <span className={isSingle ? 'text-red-400' : 'text-green-400'}>{label}</span>
            {' '}Leaderboard
          </h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-1.5">
          {loading && (
            <p className="text-center text-gray-500 py-6 text-xs animate-pulse">Loading leaderboard...</p>
          )}

          {!loading && data && data.leaderboard.map((entry) => {
            const isProfileUser = sameUserId(entry.user_id, profileUserId);
            const isViewerUser = sameUserId(entry.user_id, viewerUserId);
            const isBothHighlights = isProfileUser && isViewerUser;
            const showProfileTag = isProfileUser && viewerUserId && !isViewerUser;
            const grade = getGradeFromScore(entry.avg_score);

            return (
              <div
                key={entry.user_id}
                className={`rounded-lg border px-3 py-2 flex items-center gap-3 ${
                  isBothHighlights
                    ? 'border-violet-400/60 bg-violet-500/15'
                    : isViewerUser
                      ? 'border-piu-accent/60 bg-piu-accent/12'
                      : isProfileUser
                        ? 'border-sky-400/50 bg-sky-500/10'
                        : 'border-piu-border/40 bg-piu-dark/45'
                }`}
              >
                <span className={`w-6 shrink-0 text-sm font-display font-black text-center ${rankMedalColor(entry.rank)}`}>
                  {entry.rank}
                </span>

                {entry.avatar && (
                  <img
                    src={entry.avatar}
                    alt=""
                    className="w-7 h-7 rounded-full border border-piu-border/40 shrink-0 object-cover"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <Link
                    to={getProfilePath(entry.user_id, entry.username)}
                    className="text-xs font-body text-gray-100 hover:text-piu-accent transition-colors truncate block"
                    onClick={onClose}
                  >
                    {entry.username}
                    {isViewerUser && <span className="text-piu-accent ml-1">(you)</span>}
                    {showProfileTag && <span className="text-sky-300 ml-1">(profile)</span>}
                  </Link>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-display font-bold ${grade.color}`}>{grade.label}</span>
                  <span className="text-[11px] font-mono text-gray-400">{formatNumber(entry.avg_score)}</span>
                </div>
              </div>
            );
          })}

          {!loading && data && data.leaderboard.length === 0 && (
            <p className="text-center text-gray-500 py-6 text-xs">No players have synced scores at this level.</p>
          )}
        </div>

        {!loading && data && (
          <div className="px-4 py-2 border-t border-piu-border/40 text-center">
            <p className="text-[10px] text-gray-600">
              {data.total_users} player{data.total_users === 1 ? '' : 's'} ranked by avg best score
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RankingsPanel({ userId, viewerUserId = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMode, setSelectedMode] = useState('Both');
  const [leaderboardModal, setLeaderboardModal] = useState(null); // { mode, level }

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
            Your avg score rank at each level vs. other players. Tap a row to see the leaderboard.
          </p>

          {/* Column headers */}
          <div className="flex items-center gap-3 px-2.5 mb-1">
            <span className="w-8 shrink-0 text-[9px] text-gray-600 font-display">LVL</span>
            <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
              <span className="text-[9px] text-gray-600 font-display">RANK</span>
              <span className="text-[9px] text-gray-600 font-display">AVG SCORE</span>
            </div>
          </div>

          <div className="space-y-1 max-h-[340px] overflow-y-auto">
            {filteredPercentiles.map((p) => {
              const isSingle = p.mode === 'Single';
              const label = `${isSingle ? 'S' : 'D'}${p.level}`;
              const levelBadge = p.badge ? badgeStyle(p.badge) : null;
              const grade = getGradeFromScore(p.avg_score);
              const rankBarPercent = p.total_users > 1
                ? ((p.total_users - p.rank) / (p.total_users - 1)) * 100
                : 100;

              return (
                <button
                  type="button"
                  key={`${p.mode}-${p.level}`}
                  onClick={() => setLeaderboardModal({ mode: p.mode, level: p.level })}
                  className="w-full rounded-lg border border-piu-border/40 bg-piu-dark/45 px-2.5 py-1.5 flex items-center gap-3 hover:border-piu-accent/40 transition-colors text-left"
                >
                  <span className={`font-display font-black text-sm w-8 shrink-0 ${
                    isSingle ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {label}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono font-bold text-xs ${rankMedalColor(p.rank)}`}>#{p.rank}</span>
                        <span className="text-[11px] text-gray-600">/ {p.total_users}</span>
                        {levelBadge && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-display font-bold border ${levelBadge.bg} ${levelBadge.color}`}>
                            {levelBadge.text}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-display font-bold ${grade.color}`}>{grade.label}</span>
                        <span className="text-[11px] font-mono text-gray-400">{formatNumber(p.avg_score)}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-piu-dark/80 border border-piu-border/20 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${rankBarColor(p.rank, p.total_users)}`}
                        style={{ width: `${Math.min(100, rankBarPercent)}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Leaderboard modal */}
      <LeaderboardModal
        open={!!leaderboardModal}
        mode={leaderboardModal?.mode}
        level={leaderboardModal?.level}
        profileUserId={userId}
        viewerUserId={viewerUserId}
        onClose={() => setLeaderboardModal(null)}
      />
    </div>
  );
}

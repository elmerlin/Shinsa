import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatScore, getSkillColor } from '../../utils/tournamentConstants';

const POOL_COLORS = [
  { border: 'border-sky-400/30', bg: 'bg-sky-500/5', text: 'text-sky-300', label: 'Pool A' },
  { border: 'border-emerald-400/30', bg: 'bg-emerald-500/5', text: 'text-emerald-300', label: 'Pool B' },
  { border: 'border-amber-400/30', bg: 'bg-amber-500/5', text: 'text-amber-300', label: 'Pool C' },
  { border: 'border-piu-accent/30', bg: 'bg-piu-accent/5', text: 'text-piu-accent', label: 'Pool D' },
  { border: 'border-violet-400/30', bg: 'bg-violet-500/5', text: 'text-violet-300', label: 'Pool E' },
  { border: 'border-cyan-400/30', bg: 'bg-cyan-500/5', text: 'text-cyan-300', label: 'Pool F' },
  { border: 'border-rose-400/30', bg: 'bg-rose-500/5', text: 'text-rose-300', label: 'Pool G' },
  { border: 'border-lime-400/30', bg: 'bg-lime-500/5', text: 'text-lime-300', label: 'Pool H' },
];

function getPoolColor(poolId) {
  return POOL_COLORS[poolId % POOL_COLORS.length];
}

function isSharedWinMatch(match) {
  return !!match?.scores?.shared_win;
}

function PoolStandings({ poolPlayers, poolMatches, playerMap }) {
  const sorted = [...poolPlayers].sort((a, b) => {
    const aPlayer = playerMap[a.player_id] || a;
    const bPlayer = playerMap[b.player_id] || b;
    if ((b.wins || bPlayer.wins || 0) !== (a.wins || aPlayer.wins || 0)) {
      return (b.wins || bPlayer.wins || 0) - (a.wins || aPlayer.wins || 0);
    }
    return (b.points || bPlayer.pumbility || 0) - (a.points || aPlayer.pumbility || 0);
  });

  return (
    <div className="space-y-0.5">
      {sorted.map((pp, idx) => {
        const player = playerMap[pp.player_id] || pp;
        return (
          <div key={pp.player_id || pp.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs">
            <span className="text-gray-600 font-mono w-4 text-center">{idx + 1}</span>
            <span className="font-display font-bold truncate flex-1 text-white">{player.name}</span>
            <span className="font-mono text-piu-green text-[11px]">{pp.wins || player.wins || 0}W</span>
            <span className="font-mono text-red-400 text-[11px]">{pp.losses || player.losses || 0}L</span>
          </div>
        );
      })}
    </div>
  );
}

export default function PoolsView({ matches, players, phaseConfig, phasePlayers, onUpdate }) {
  const navigate = useNavigate();
  const playerMap = useMemo(() => {
    const map = {};
    players.forEach(p => { map[p.id] = p; });
    return map;
  }, [players]);

  // Group matches and players by pool_id
  const pools = useMemo(() => {
    const poolMap = {};

    // Group matches by pool
    matches.forEach(m => {
      const pid = m.pool_id || 0;
      if (!poolMap[pid]) poolMap[pid] = { matches: [], players: [] };
      poolMap[pid].matches.push(m);
    });

    // Group phase players by pool (if available)
    if (phasePlayers && phasePlayers.length > 0) {
      phasePlayers.forEach(pp => {
        const pid = pp.pool_id || 0;
        if (!poolMap[pid]) poolMap[pid] = { matches: [], players: [] };
        poolMap[pid].players.push(pp);
      });
    } else {
      // Infer players from matches
      Object.values(poolMap).forEach(pool => {
        const playerIds = new Set();
        pool.matches.forEach(m => {
          if (m.player1_id) playerIds.add(m.player1_id);
          if (m.player2_id) playerIds.add(m.player2_id);
        });
        pool.players = [...playerIds].map(id => ({ player_id: id }));
      });
    }

    return Object.entries(poolMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([poolId, data]) => ({
        poolId: Number(poolId),
        ...data,
      }));
  }, [matches, phasePlayers]);

  const totalCompleted = matches.filter(m => m.status === 'COMPLETED').length;
  const totalMatches = matches.length;

  if (pools.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No pool matches generated yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Pool Play</h2>
          <p className="text-sm text-gray-400">{pools.length} pools, round robin within each</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">{totalCompleted}/{totalMatches} matches</div>
          <div className="w-24 sm:w-32 h-2 bg-piu-dark rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-piu-green rounded-full transition-all duration-500"
              style={{ width: `${totalMatches > 0 ? (totalCompleted / totalMatches) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pools.map(({ poolId, matches: poolMatches, players: poolPlayers }) => {
          const color = getPoolColor(poolId);
          const completed = poolMatches.filter(m => m.status === 'COMPLETED').length;
          const total = poolMatches.length;

          return (
            <div key={poolId} className={`card border ${color.border} ${color.bg}`}>
              {/* Pool header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-display font-bold text-sm ${color.text}`}>
                  {color.label}
                </h3>
                <span className="text-[10px] text-gray-500 font-mono">
                  {completed}/{total}
                </span>
              </div>

              {/* Mini standings */}
              <div className="mb-3 rounded-lg bg-piu-dark/40 p-1.5">
                <PoolStandings
                  poolPlayers={poolPlayers}
                  poolMatches={poolMatches}
                  playerMap={playerMap}
                />
              </div>

              {/* Match list */}
              <div className="space-y-1">
                {poolMatches.map(match => {
                  const p1 = playerMap[match.player1_id];
                  const p2 = playerMap[match.player2_id];
                  const isComplete = match.status === 'COMPLETED';
                  const isActive = ['DRAWING', 'VETOING', 'READY'].includes(match.status);

                  return (
                    <div
                      key={match.id}
                      onClick={() => navigate(`/match/${match.id}`)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer transition-colors text-xs
                        ${isComplete ? 'bg-piu-green/5 hover:bg-piu-green/10' : isActive ? 'bg-piu-accent/5 hover:bg-piu-accent/10' : 'hover:bg-piu-dark/40'}
                      `}
                    >
                      <span className={`font-display font-bold truncate flex-1 text-right ${(match.winner_id === match.player1_id || isSharedWinMatch(match)) ? 'text-piu-green' : ''}`}>
                        {p1?.name || 'TBD'}
                      </span>
                      <span className="text-gray-600 mx-1 shrink-0">
                        {isComplete
                          ? `${match.scores?.player1_wins || 0}-${match.scores?.player2_wins || 0}`
                          : 'vs'
                        }
                      </span>
                      <span className={`font-display font-bold truncate flex-1 ${(match.winner_id === match.player2_id || isSharedWinMatch(match)) ? 'text-piu-green' : ''}`}>
                        {p2?.name || 'TBD'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

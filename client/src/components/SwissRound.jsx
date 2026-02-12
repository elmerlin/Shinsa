import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SwissRound({ round, matches, players, config, onUpdate, tournamentId }) {
  const navigate = useNavigate();
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const levelConfig = (config.round_levels || []).find(l => l.round === round);
  const completedCount = matches.filter(m => m.status === 'COMPLETED').length;
  const totalCount = matches.length;

  if (matches.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No matches generated yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Round {round}</h2>
          {levelConfig && (
            <p className="text-sm text-gray-400">
              Level {levelConfig.min} - {levelConfig.max} | Round Robin
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">
            {completedCount}/{totalCount} matches
          </div>
          <div className="w-32 h-2 bg-piu-dark rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-piu-green rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {matches.map(match => {
          const p1 = playerMap[match.player1_id];
          const p2 = playerMap[match.player2_id];
          const isComplete = match.status === 'COMPLETED';
          const scores = match.scores || {};

          return (
            <div
              key={match.id}
              onClick={() => navigate(`/match/${match.id}`)}
              className={`card flex items-center gap-4 cursor-pointer hover:border-piu-accent/50 hover:shadow-lg hover:shadow-piu-accent/10
                ${isComplete ? 'border-piu-green/20' : ''}
                ${match.status === 'DRAWING' || match.status === 'VETOING' || match.status === 'READY' ? 'border-piu-accent/30 animate-pulse-glow' : ''}
              `}
            >
              {/* Player 1 (higher seed) */}
              <div className={`flex-1 text-right ${match.winner_id === match.player1_id ? 'text-piu-green' : ''}`}>
                <div className="font-display font-bold">
                  {p1?.name || 'TBD'}
                </div>
                <div className="text-xs text-gray-500">
                  Seed {p1?.seed_rank || '?'} | {p1?.pumbility || 0}
                </div>
              </div>

              {/* Score / Status */}
              <div className="flex flex-col items-center min-w-[80px]">
                {isComplete ? (
                  <div className="flex items-center gap-2 font-display font-bold text-lg">
                    <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-500'}>
                      {scores.player1_wins || 0}
                    </span>
                    <span className="text-gray-600">-</span>
                    <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-500'}>
                      {scores.player2_wins || 0}
                    </span>
                  </div>
                ) : (
                  <span className={`badge ${
                    match.status === 'PENDING' ? 'badge-pending' :
                    match.status === 'DRAWING' || match.status === 'VETOING' ? 'badge-active' :
                    match.status === 'READY' ? 'bg-piu-blue/20 text-piu-blue' : 'badge-pending'
                  }`}>
                    {match.status}
                  </span>
                )}
              </div>

              {/* Player 2 (lower seed) */}
              <div className={`flex-1 ${match.winner_id === match.player2_id ? 'text-piu-green' : ''}`}>
                <div className="font-display font-bold">
                  {p2?.name || 'TBD'}
                </div>
                <div className="text-xs text-gray-500">
                  Seed {p2?.seed_rank || '?'} | {p2?.pumbility || 0}
                </div>
              </div>

              {!isComplete && (
                <div className="text-gray-600 text-lg">&#8250;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';

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
          <div className="w-24 sm:w-32 h-2 bg-piu-dark rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-piu-green rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:gap-3">
        {matches.map(match => {
          const p1 = playerMap[match.player1_id];
          const p2 = playerMap[match.player2_id];
          const isComplete = match.status === 'COMPLETED';
          const scores = match.scores || {};

          return (
            <div
              key={match.id}
              onClick={() => navigate(`/match/${match.id}`)}
              className={`card flex items-center gap-2 sm:gap-4 cursor-pointer hover:border-piu-accent/50 hover:shadow-lg hover:shadow-piu-accent/10 p-3 sm:p-4
                ${isComplete ? 'border-piu-green/20' : ''}
                ${match.status === 'DRAWING' || match.status === 'VETOING' || match.status === 'READY' ? 'border-piu-accent/30 animate-pulse-glow' : ''}
              `}
            >
              {/* Player 1 (higher seed) */}
              <div className={`flex-1 text-right min-w-0 ${match.winner_id === match.player1_id ? 'text-piu-green' : ''}`}>
                <div className="font-display font-bold text-sm sm:text-base truncate flex items-center justify-end gap-1.5">
                  {p1?.avatar && (
                    <img src={getAvatarUrl(p1.avatar)} alt="" className="h-5 w-5 rounded-full border border-white/10 shrink-0" />
                  )}
                  {p1?.name || 'TBD'}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">
                  #{p1?.seed_rank || '?'}
                </div>
              </div>

              {/* Score / Status */}
              <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]">
                {isComplete ? (
                  <div className="flex items-center gap-1 sm:gap-2 font-display font-bold text-base sm:text-lg">
                    <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-500'}>
                      {scores.player1_wins || 0}
                    </span>
                    <span className="text-gray-600">-</span>
                    <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-500'}>
                      {scores.player2_wins || 0}
                    </span>
                  </div>
                ) : (
                  <span className={`badge text-[10px] sm:text-xs ${
                    match.status === 'PENDING' ? 'badge-pending' :
                    match.status === 'DRAWING' || match.status === 'VETOING' ? 'badge-active' :
                    match.status === 'READY' ? 'bg-piu-blue/20 text-piu-blue' : 'badge-pending'
                  }`}>
                    {match.status}
                  </span>
                )}
              </div>

              {/* Player 2 (lower seed) */}
              <div className={`flex-1 min-w-0 ${match.winner_id === match.player2_id ? 'text-piu-green' : ''}`}>
                <div className="font-display font-bold text-sm sm:text-base truncate flex items-center gap-1.5">
                  {p2?.avatar && (
                    <img src={getAvatarUrl(p2.avatar)} alt="" className="h-5 w-5 rounded-full border border-white/10 shrink-0" />
                  )}
                  {p2?.name || 'TBD'}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">
                  #{p2?.seed_rank || '?'}
                </div>
              </div>

              {!isComplete && (
                <div className="text-gray-600 text-lg shrink-0">&#8250;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

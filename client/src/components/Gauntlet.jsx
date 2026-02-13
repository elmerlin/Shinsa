import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Gauntlet({ matches, players, onUpdate }) {
  const navigate = useNavigate();
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const gauntletMatches = [...matches]
    .filter(m => m.match_type === 'gauntlet')
    .sort((a, b) => a.gauntlet_order - b.gauntlet_order);

  const completedCount = gauntletMatches.filter(m => m.status === 'COMPLETED').length;
  const totalCount = gauntletMatches.length;
  const finalMatch = gauntletMatches[gauntletMatches.length - 1];
  const gauntletWinner = finalMatch?.status === 'COMPLETED' && finalMatch?.winner_id
    ? playerMap[finalMatch.winner_id] : null;

  if (gauntletMatches.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No gauntlet matches generated yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Gauntlet</h2>
          <p className="text-sm text-gray-400">
            King of the Hill - Bottom ranks fight upward
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">
            {completedCount}/{totalCount} matches
          </div>
          <div className="w-24 sm:w-32 h-2 bg-piu-dark rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-piu-accent rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {gauntletWinner && (
        <div className="card mb-4 border-piu-gold/30 bg-piu-gold/5 text-center py-4">
          <p className="text-xs text-gray-400 font-display uppercase tracking-wider mb-1">Gauntlet Champion</p>
          <p className="font-display font-bold text-piu-gold text-2xl">{gauntletWinner.name}</p>
        </div>
      )}

      <div className="space-y-2 sm:space-y-3">
        {gauntletMatches.map((match, idx) => {
          const p1 = playerMap[match.player1_id]; // ranked challenger
          const p2 = match.player2_id ? playerMap[match.player2_id] : null; // winner from previous / bottom player
          const isComplete = match.status === 'COMPLETED';
          const isActive = match.status === 'PENDING' || match.status === 'DRAWING' || match.status === 'READY';
          const isWaiting = match.status === 'WAITING';
          const isFinal = idx === gauntletMatches.length - 1;
          const scores = match.scores || {};

          return (
            <div
              key={match.id}
              onClick={() => {
                if (!isWaiting) navigate(`/match/${match.id}`);
              }}
              className={`card flex items-center gap-2 sm:gap-4 p-3 sm:p-4 transition-all
                ${!isWaiting ? 'cursor-pointer hover:border-piu-accent/50 hover:shadow-lg hover:shadow-piu-accent/10' : 'opacity-60'}
                ${isComplete ? 'border-piu-green/20' : ''}
                ${isActive ? 'border-piu-accent/30 animate-pulse-glow' : ''}
                ${isFinal ? 'ring-1 ring-piu-gold/30' : ''}
              `}
            >
              {/* Match number & difficulty */}
              <div className="text-center min-w-[50px] sm:min-w-[60px]">
                <div className={`font-display font-bold text-xs ${isFinal ? 'text-piu-gold' : 'text-gray-500'}`}>
                  {isFinal ? 'FINAL' : `#${match.gauntlet_order}`}
                </div>
                <div className="text-[10px] text-gray-600 font-mono">
                  S{match.difficulty_min}/D{match.difficulty_max}
                </div>
              </div>

              {/* Player 1 - ranked challenger */}
              <div className={`flex-1 text-right min-w-0 ${match.winner_id === match.player1_id ? 'text-piu-green' : ''}`}>
                <div className="font-display font-bold text-sm sm:text-base truncate">
                  {p1?.name || 'TBD'}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">
                  {p1 ? 'Challenger' : ''}
                </div>
              </div>

              {/* Score / Status */}
              <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]">
                {isComplete ? (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1 font-mono font-bold text-sm">
                      <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-500'}>
                        {scores.p1_total != null ? Number(scores.p1_total).toLocaleString() : '0'}
                      </span>
                      <span className="text-gray-600">-</span>
                      <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-500'}>
                        {scores.p2_total != null ? Number(scores.p2_total).toLocaleString() : '0'}
                      </span>
                    </div>
                  </div>
                ) : isWaiting ? (
                  <span className="badge text-[10px] sm:text-xs bg-gray-700/50 text-gray-500">WAITING</span>
                ) : (
                  <span className={`badge text-[10px] sm:text-xs ${
                    match.status === 'PENDING' ? 'badge-pending' :
                    match.status === 'READY' ? 'bg-piu-blue/20 text-piu-blue' : 'badge-active'
                  }`}>
                    {match.status}
                  </span>
                )}
              </div>

              {/* Player 2 - defender from previous match */}
              <div className={`flex-1 min-w-0 ${match.winner_id === match.player2_id ? 'text-piu-green' : ''}`}>
                <div className="font-display font-bold text-sm sm:text-base truncate">
                  {p2?.name || (isWaiting ? 'TBD' : 'TBD')}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">
                  {p2 ? (idx === 0 ? 'Bottom Rank' : 'Defender') : ''}
                </div>
              </div>

              {!isComplete && !isWaiting && (
                <div className="text-gray-600 text-lg shrink-0">&#8250;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

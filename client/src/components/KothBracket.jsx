import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function KothBracket({ matches, players, tournament, onUpdate }) {
  const navigate = useNavigate();
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const config = tournament.config || {};
  const sortedMatches = [...matches].sort((a, b) => a.koth_position - b.koth_position);
  const totalMatches = sortedMatches.length;

  const getStepHeight = () => {
    if (totalMatches <= 4) return 'h-24';
    if (totalMatches <= 6) return 'h-20';
    return 'h-16';
  };

  return (
    <div>
      <h2 className="section-title mb-2">KING OF THE HILL</h2>
      <p className="text-sm text-gray-400 mb-6">
        Gauntlet format: lowest rank starts, winner climbs to face the next
      </p>

      {/* Champion throne at top */}
      <div className="flex flex-col items-center mb-8">
        {/* Crown */}
        <div className="text-4xl mb-2 text-piu-gold">&#9733;</div>
        {sortedMatches.length > 0 && (() => {
          const finalMatch = sortedMatches[sortedMatches.length - 1];
          if (finalMatch.status === 'COMPLETED' && finalMatch.winner_id) {
            const champion = playerMap[finalMatch.winner_id];
            return (
              <div className="card border-piu-gold/50 text-center animate-pulse-glow px-8 py-4">
                <p className="text-xs text-piu-gold font-display uppercase tracking-wider">Champion</p>
                <p className="font-display font-bold text-2xl">{champion?.name || 'TBD'}</p>
              </div>
            );
          }
          // Show top seed waiting
          const topSeed = players.find(p => p.seed_rank === 1);
          return (
            <div className="card border-piu-gold/30 text-center px-8 py-4 opacity-60">
              <p className="text-xs text-piu-gold font-display uppercase tracking-wider">Rank #1 (Defending)</p>
              <p className="font-display font-bold text-xl">{topSeed?.name || 'TBD'}</p>
            </div>
          );
        })()}
      </div>

      {/* Ladder - reversed (finals at top) */}
      <div className="max-w-2xl mx-auto space-y-3">
        {[...sortedMatches].reverse().map((match, displayIdx) => {
          const realIdx = totalMatches - 1 - displayIdx;
          const p1 = playerMap[match.player1_id];
          const p2 = playerMap[match.player2_id];
          const isActive = match.status === 'PENDING' || match.status === 'DRAWING' || match.status === 'VETOING' || match.status === 'READY';
          const isWaiting = match.status === 'WAITING';
          const isComplete = match.status === 'COMPLETED';
          const isFinals = realIdx === totalMatches - 1;

          return (
            <div
              key={match.id}
              onClick={() => isActive && navigate(`/match/${match.id}`)}
              className={`card relative flex items-center gap-4 transition-all
                ${isActive ? 'border-piu-accent animate-pulse-glow cursor-pointer' : ''}
                ${isWaiting ? 'opacity-40' : ''}
                ${isComplete ? 'border-piu-green/20' : ''}
                ${isFinals ? 'border-piu-gold/30' : ''}
              `}
            >
              {/* Match label */}
              <div className="absolute -left-20 text-xs text-gray-600 font-display w-16 text-right hidden lg:block">
                {isFinals ? 'FINALS' : `Match ${match.koth_position}`}
                <br />
                <span className="text-piu-accent">Lv.{match.difficulty_min}</span>
              </div>

              {/* Level badge */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-sm
                ${isFinals ? 'bg-piu-gold/20 text-piu-gold' : 'bg-piu-accent/20 text-piu-accent'}`}>
                {match.difficulty_min}
              </div>

              {/* Challenger (player 1 - winner of previous or lowest rank) */}
              <div className={`flex-1 ${match.winner_id === match.player1_id ? 'text-piu-green' : ''}`}>
                <div className="text-xs text-gray-500 font-display">
                  {realIdx === 0 ? 'Lowest Rank' : 'Challenger'}
                </div>
                <div className="font-display font-bold">
                  {p1?.name || (isWaiting ? 'Winner of prev.' : 'TBD')}
                </div>
              </div>

              {/* VS */}
              <div className="text-gray-600 font-display font-bold text-xs">
                {isComplete ? (
                  <div className="text-center">
                    <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-500'}>
                      {(match.scores || {}).player1_wins || 0}
                    </span>
                    <span className="text-gray-600 mx-1">-</span>
                    <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-500'}>
                      {(match.scores || {}).player2_wins || 0}
                    </span>
                  </div>
                ) : isActive ? (
                  <span className="badge-active">LIVE</span>
                ) : (
                  'VS'
                )}
              </div>

              {/* Defender (higher seed) */}
              <div className={`flex-1 text-right ${match.winner_id === match.player2_id ? 'text-piu-green' : ''}`}>
                <div className="text-xs text-gray-500 font-display">
                  {isFinals ? 'Rank #1' : `Rank #${totalMatches - realIdx}`}
                </div>
                <div className="font-display font-bold">
                  {p2?.name || 'TBD'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

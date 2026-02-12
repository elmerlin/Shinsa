import React, { useState } from 'react';

export default function Standings({ players, matches, showFinal }) {
  const [expandedId, setExpandedId] = useState(null);

  // Sort by wins -> buchholz -> pumbility
  const sorted = [...players].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    return b.pumbility - a.pumbility;
  });

  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const getPlayerMatches = (playerId) => {
    return matches.filter(m =>
      m.stage_phase === 'SWISS' &&
      m.status === 'COMPLETED' &&
      (m.player1_id === playerId || m.player2_id === playerId)
    );
  };

  const getMedalColor = (rank) => {
    if (rank === 1) return 'text-piu-gold';
    if (rank === 2) return 'text-piu-silver';
    if (rank === 3) return 'text-piu-bronze';
    return 'text-gray-600';
  };

  return (
    <div>
      <h2 className="section-title mb-4">
        {showFinal ? 'FINAL RESULTS' : 'STANDINGS'}
      </h2>

      <div className="card overflow-hidden p-0">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-piu-dark text-xs text-gray-400 font-display uppercase tracking-wider">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Player</div>
          <div className="col-span-1 text-center">W</div>
          <div className="col-span-1 text-center">L</div>
          <div className="col-span-2 text-center">Buchholz</div>
          <div className="col-span-2 text-center">Pumbility</div>
          <div className="col-span-1"></div>
        </div>

        {sorted.map((player, idx) => {
          const rank = idx + 1;
          const playerMatches = getPlayerMatches(player.id);
          const isExpanded = expandedId === player.id;

          return (
            <div key={player.id}>
              <div
                onClick={() => setExpandedId(isExpanded ? null : player.id)}
                className={`grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer transition-colors
                  ${isExpanded ? 'bg-piu-accent/5' : 'hover:bg-piu-dark/50'}
                  ${idx > 0 ? 'border-t border-piu-border/50' : ''}`}
              >
                <div className={`col-span-1 font-display font-bold ${getMedalColor(rank)}`}>
                  {rank}
                </div>
                <div className="col-span-4 flex items-center gap-2">
                  <span className="font-display font-bold">{player.name}</span>
                  {player.skill_title && (
                    <span className="text-xs text-gray-500">{player.skill_title}</span>
                  )}
                </div>
                <div className="col-span-1 text-center text-piu-green font-mono font-bold">
                  {player.wins}
                </div>
                <div className="col-span-1 text-center text-red-400 font-mono">
                  {player.losses}
                </div>
                <div className="col-span-2 text-center text-gray-400 font-mono">
                  {player.buchholz.toFixed(1)}
                </div>
                <div className="col-span-2 text-center text-piu-gold font-mono">
                  {player.pumbility || '-'}
                </div>
                <div className="col-span-1 text-right text-gray-600">
                  {isExpanded ? '&#9650;' : '&#9660;'}
                </div>
              </div>

              {/* Expanded match history */}
              {isExpanded && (
                <div className="px-4 py-3 bg-piu-dark/30 border-t border-piu-border/30 animate-fade-in">
                  <p className="text-xs text-gray-500 mb-2 font-display uppercase">Match History</p>
                  {playerMatches.length === 0 ? (
                    <p className="text-sm text-gray-600">No matches played yet</p>
                  ) : (
                    <div className="space-y-2">
                      {playerMatches.map(m => {
                        const opponentId = m.player1_id === player.id ? m.player2_id : m.player1_id;
                        const opponent = playerMap[opponentId];
                        const isWin = m.winner_id === player.id;
                        const scores = m.scores || {};
                        const playedSongs = m.played_songs || [];

                        return (
                          <div key={m.id} className="flex items-center gap-3 text-sm">
                            <span className={`font-bold ${isWin ? 'text-piu-green' : 'text-red-400'}`}>
                              {isWin ? 'W' : 'L'}
                            </span>
                            <span className="text-gray-300">
                              vs {opponent?.name || 'BYE'}
                            </span>
                            {(scores.player1_wins !== undefined) && (
                              <span className="text-gray-500">
                                ({m.player1_id === player.id
                                  ? `${scores.player1_wins}-${scores.player2_wins}`
                                  : `${scores.player2_wins}-${scores.player1_wins}`})
                              </span>
                            )}
                            <span className="text-gray-600 text-xs">Round {m.round_number}</span>
                            {playedSongs.length > 0 && (
                              <span className="text-gray-600 text-xs truncate">
                                {playedSongs.map(s => `${s.title || s.song?.title} ${s.mode?.[0] || ''}${s.level || s.song?.level}`).join(', ')}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="text-center py-8 text-gray-500">No players</div>
        )}
      </div>
    </div>
  );
}

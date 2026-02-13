import React, { useState } from 'react';
import { getCountryFlag } from './PlayerRegistration';

const GENDER_SYMBOLS = { male: '\u2642', female: '\u2640' };

const SKILL_COLORS = {
  Beginner: 'text-green-400',
  Intermediate: 'text-piu-bronze',
  Advanced: 'text-piu-silver',
  Expert: 'text-piu-gold',
};

const getSkillColor = (title) => {
  if (!title) return 'text-gray-500';
  for (const [key, val] of Object.entries(SKILL_COLORS)) {
    if (title.startsWith(key)) return val;
  }
  return 'text-gray-500';
};

export default function Standings({ players, matches, showFinal }) {
  const [expandedId, setExpandedId] = useState(null);

  const sorted = [...players].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pumbility - a.pumbility;
  });

  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const getPlayerMatches = (playerId) => {
    return matches.filter(m =>
      m.status === 'COMPLETED' &&
      (m.player1_id === playerId || m.player2_id === playerId)
    ).sort((a, b) => {
      if (a.match_type !== b.match_type) return a.match_type === 'round_robin' ? -1 : 1;
      if (a.match_type === 'gauntlet') return a.gauntlet_order - b.gauntlet_order;
      if (a.round_number !== b.round_number) return a.round_number - b.round_number;
      return 0;
    });
  };

  const gauntletMatches = matches
    .filter(m => m.match_type === 'gauntlet')
    .sort((a, b) => a.gauntlet_order - b.gauntlet_order);
  const totalGauntletMatches = gauntletMatches.length;

  const getGauntletLabel = (m) => {
    if (m.gauntlet_order === totalGauntletMatches) return 'Final';
    const totalPlayers = totalGauntletMatches + 1;
    const position = totalPlayers - m.gauntlet_order;
    return `#${position} spot`;
  };

  const getMedalColor = (rank) => {
    if (rank === 1) return 'text-piu-gold';
    if (rank === 2) return 'text-piu-silver';
    if (rank === 3) return 'text-piu-bronze';
    return 'text-gray-600';
  };

  const formatScore = (score) => {
    if (!score && score !== 0) return '-';
    return Number(score).toLocaleString();
  };

  return (
    <div>
      <h2 className="section-title mb-1">
        {showFinal ? 'ROUND ROBIN RESULTS' : 'ROUND ROBIN STANDINGS'}
      </h2>
      <p className="text-sm text-gray-500 mb-4">Rankings based on Round Robin performance</p>

      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-10 gap-2 px-3 sm:px-4 py-2 bg-piu-dark text-xs text-gray-400 font-display uppercase tracking-wider">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Player</div>
          <div className="col-span-1 text-center">W</div>
          <div className="col-span-1 text-center">L</div>
          <div className="col-span-1 text-center">Pts</div>
          <div className="col-span-2 text-center">Pumbility</div>
        </div>

        {sorted.map((player, idx) => {
          const rank = idx + 1;
          const playerMatches = getPlayerMatches(player.id);
          const isExpanded = expandedId === player.id;
          const genderSymbol = player.gender ? GENDER_SYMBOLS[player.gender] || '' : '';
          const skillColor = getSkillColor(player.skill_title);
          const flag = getCountryFlag(player.nationality);

          return (
            <div key={player.id}>
              <div
                onClick={() => setExpandedId(isExpanded ? null : player.id)}
                className={`grid grid-cols-10 gap-2 px-3 sm:px-4 py-3 items-center cursor-pointer transition-colors
                  ${isExpanded ? 'bg-piu-accent/10 border-l-2 border-l-piu-accent' : 'hover:bg-piu-dark/50 border-l-2 border-l-transparent'}
                  ${idx > 0 ? 'border-t border-piu-border/50' : ''}`}
              >
                <div className={`col-span-1 font-display font-bold text-lg ${getMedalColor(rank)}`}>
                  {rank}
                </div>
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  {flag && <span className="text-sm shrink-0">{flag}</span>}
                  <span className="font-display font-bold truncate">{player.name}</span>
                  {genderSymbol && (
                    <span className={`text-xs shrink-0 ${player.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                      {genderSymbol}
                    </span>
                  )}
                  {player.skill_title && (
                    <span className={`text-xs hidden sm:inline shrink-0 ${skillColor}`}>{player.skill_title}</span>
                  )}
                </div>
                <div className="col-span-1 text-center text-piu-green font-mono font-bold">
                  {player.wins}
                </div>
                <div className="col-span-1 text-center text-red-400 font-mono">
                  {player.losses}
                </div>
                <div className="col-span-1 text-center text-piu-gold font-mono font-bold">
                  {player.points || player.wins}
                </div>
                <div className="col-span-2 text-center text-piu-gold font-mono text-sm">
                  {player.pumbility ? player.pumbility.toLocaleString() : '-'}
                </div>
              </div>

              {isExpanded && (
                <div className="px-3 sm:px-4 py-4 bg-piu-dark/40 border-t border-piu-border/30 border-l-2 border-l-piu-accent animate-fade-in">
                  <p className="text-xs text-piu-accent mb-3 font-display uppercase tracking-wider font-bold">
                    Match History ({playerMatches.length} matches)
                  </p>
                  {playerMatches.length === 0 ? (
                    <p className="text-sm text-gray-600">No matches played yet</p>
                  ) : (
                    <div className="space-y-3">
                      {playerMatches.map(m => {
                        const opponentId = m.player1_id === player.id ? m.player2_id : m.player1_id;
                        const opponent = playerMap[opponentId];
                        const isWin = m.winner_id === player.id;
                        const mScores = m.scores || {};
                        const playedSongs = m.played_songs || [];
                        const isP1 = m.player1_id === player.id;
                        const isGauntlet = m.match_type === 'gauntlet';
                        const opponentFlag = opponent ? getCountryFlag(opponent.nationality) : '';

                        return (
                          <div key={m.id} className={`rounded-lg p-3 ${isWin ? 'bg-piu-green/5 border border-piu-green/20' : 'bg-red-500/5 border border-red-500/20'}`}>
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-display font-bold text-sm px-2 py-0.5 rounded ${isWin ? 'bg-piu-green/20 text-piu-green' : 'bg-red-500/20 text-red-400'}`}>
                                  {isWin ? 'WIN' : 'LOSS'}
                                </span>
                                <span className="text-gray-300 font-display flex items-center gap-1">
                                  vs {opponentFlag && <span className="text-sm">{opponentFlag}</span>}{opponent?.name || 'Unknown'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                {!isGauntlet && (
                                  <span className="font-display font-bold">
                                    {isP1 ? mScores.player1_wins : mScores.player2_wins}-{isP1 ? mScores.player2_wins : mScores.player1_wins}
                                  </span>
                                )}
                                {isGauntlet ? (
                                  <span className="badge bg-piu-accent/20 text-piu-accent text-[10px]">
                                    Gauntlet {getGauntletLabel(m)}
                                  </span>
                                ) : (
                                  <span className="badge bg-gray-700/50 text-gray-400 text-[10px]">
                                    Round {m.round_number} Lv.{m.difficulty_min}-{m.difficulty_max}
                                  </span>
                                )}
                              </div>
                            </div>

                            {playedSongs.length > 0 && (
                              <div className="space-y-1 mt-2">
                                {playedSongs.map((s, si) => {
                                  const songMode = s.mode || s.song?.mode || 'Single';
                                  const songLevel = s.level || s.song?.level;
                                  const songTitle = s.title || s.song?.title;
                                  const myScore = isP1 ? s.p1_score : s.p2_score;
                                  const theirScore = isP1 ? s.p2_score : s.p1_score;
                                  const iSongWin = isGauntlet
                                    ? (myScore > theirScore)
                                    : (s.song_winner_id === player.id);

                                  return (
                                    <div key={si} className="flex items-center gap-2 text-sm">
                                      <span className={`w-8 text-center text-xs font-display font-bold px-1 rounded ${
                                        songMode === 'Single' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'
                                      }`}>
                                        {songMode[0]}{songLevel}
                                      </span>
                                      <span className="text-gray-300 flex-1 truncate text-xs">{songTitle}</span>
                                      <span className={`font-mono text-xs ${iSongWin ? 'text-piu-green font-bold' : 'text-gray-500'}`}>
                                        {formatScore(myScore)}
                                      </span>
                                      <span className="text-gray-700 text-xs">vs</span>
                                      <span className={`font-mono text-xs ${!iSongWin ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                                        {formatScore(theirScore)}
                                      </span>
                                    </div>
                                  );
                                })}
                                {isGauntlet && (
                                  <div className="text-xs text-gray-500 mt-1 text-right font-mono">
                                    Combined: {formatScore(isP1 ? mScores.p1_total : mScores.p2_total)} vs {formatScore(isP1 ? mScores.p2_total : mScores.p1_total)}
                                  </div>
                                )}
                              </div>
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

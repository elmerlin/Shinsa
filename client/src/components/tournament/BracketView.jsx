import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

function BracketMatch({ match, playerMap, onClick, isFinal }) {
  const p1 = playerMap[match.player1_id];
  const p2 = playerMap[match.player2_id];
  const isComplete = match.status === 'COMPLETED';
  const isActive = match.status === 'PENDING' || match.status === 'DRAWING' || match.status === 'VETOING' || match.status === 'READY';
  const isWaiting = !match.player1_id || !match.player2_id;
  const isBye = match.is_bye || match.status === 'BYE';
  const scores = match.scores || {};

  return (
    <div
      onClick={() => !isBye && !isWaiting && onClick?.(match.id)}
      className={`w-44 sm:w-52 rounded-lg border bg-piu-card/92 overflow-hidden transition-colors shrink-0
        ${isComplete ? 'border-piu-green/30' : ''}
        ${isActive ? 'border-piu-accent/40 ring-1 ring-piu-accent/20 cursor-pointer' : ''}
        ${isBye ? 'opacity-40 border-piu-border/30' : ''}
        ${isWaiting ? 'opacity-50 border-piu-border/30' : ''}
        ${!isBye && !isWaiting ? 'cursor-pointer hover:border-piu-accent/50' : ''}
        ${isFinal ? 'ring-1 ring-piu-gold/40' : ''}
      `}
      style={{ contain: 'layout paint' }}
    >
      {/* Player 1 */}
      <div className={`flex items-center gap-2 px-2.5 py-2 ${match.winner_id === match.player1_id ? 'bg-piu-green/8' : ''}`}>
        <span className="text-[10px] text-gray-600 font-mono w-4 shrink-0 text-center">
          {p1?.seed || match.bracket_position * 2 + 1}
        </span>
        <span className={`font-display font-bold text-xs truncate flex-1 ${match.winner_id === match.player1_id ? 'text-piu-green' : 'text-white'}`}>
          {p1?.name || (isBye ? 'BYE' : 'TBD')}
        </span>
        {isComplete && (
          <span className={`font-mono text-xs font-bold ${match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-600'}`}>
            {scores.player1_wins ?? scores.p1_total ?? '-'}
          </span>
        )}
      </div>
      <div className="border-t border-piu-border/30" />
      {/* Player 2 */}
      <div className={`flex items-center gap-2 px-2.5 py-2 ${match.winner_id === match.player2_id ? 'bg-piu-green/8' : ''}`}>
        <span className="text-[10px] text-gray-600 font-mono w-4 shrink-0 text-center">
          {p2?.seed || match.bracket_position * 2 + 2}
        </span>
        <span className={`font-display font-bold text-xs truncate flex-1 ${match.winner_id === match.player2_id ? 'text-piu-green' : 'text-white'}`}>
          {p2?.name || (isBye ? 'BYE' : 'TBD')}
        </span>
        {isComplete && (
          <span className={`font-mono text-xs font-bold ${match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-600'}`}>
            {scores.player2_wins ?? scores.p2_total ?? '-'}
          </span>
        )}
      </div>
      {/* Status bar */}
      {!isComplete && !isBye && (
        <div className="border-t border-piu-border/30 px-2.5 py-1 text-center">
          <span className={`text-[9px] font-display font-bold uppercase tracking-wider ${
            isActive ? 'text-piu-accent' : 'text-gray-600'
          }`}>
            {isWaiting ? 'Waiting' : match.status}
          </span>
        </div>
      )}
    </div>
  );
}

export default function BracketView({ matches, players, phaseConfig, onUpdate }) {
  const navigate = useNavigate();
  const playerMap = useMemo(() => {
    const map = {};
    players.forEach(p => { map[p.id] = p; });
    return map;
  }, [players]);

  const bracketMatches = useMemo(() => {
    return [...matches]
      .filter(m => m.bracket === 'winners' || m.bracket === '' || !m.bracket)
      .filter(m => m.match_type !== 'gauntlet')
      .sort((a, b) => {
        if (a.bracket_round !== b.bracket_round) return a.bracket_round - b.bracket_round;
        return a.bracket_position - b.bracket_position;
      });
  }, [matches]);

  // Group matches by round
  const rounds = useMemo(() => {
    const roundMap = {};
    bracketMatches.forEach(m => {
      const r = m.bracket_round || 1;
      if (!roundMap[r]) roundMap[r] = [];
      roundMap[r].push(m);
    });
    return Object.entries(roundMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([round, matches]) => ({
        round: Number(round),
        matches: matches.sort((a, b) => a.bracket_position - b.bracket_position),
      }));
  }, [bracketMatches]);

  const totalRounds = rounds.length;
  const completedCount = bracketMatches.filter(m => m.status === 'COMPLETED' || m.status === 'BYE').length;
  const totalCount = bracketMatches.length;

  const getRoundLabel = (roundNum) => {
    const remaining = totalRounds - roundNum + 1;
    if (remaining === 1) return 'Final';
    if (remaining === 2) return 'Semifinals';
    if (remaining === 3) return 'Quarterfinals';
    return `Round ${roundNum}`;
  };

  if (bracketMatches.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No bracket matches generated yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Bracket</h2>
          <p className="text-sm text-gray-400">Single Elimination</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">{completedCount}/{totalCount} matches</div>
          <div className="w-24 sm:w-32 h-2 bg-piu-dark rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-piu-gold rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bracket Tree */}
      <div className="overflow-x-auto pb-4 -mx-3 px-3">
        <div className="flex gap-4 sm:gap-6 min-w-max">
          {rounds.map(({ round, matches: roundMatches }) => {
            const isFinalRound = round === totalRounds || (rounds.length > 0 && round === rounds[rounds.length - 1].round);
            return (
              <div key={round} className="flex flex-col items-center">
                {/* Round label */}
                <div className={`text-[10px] font-display font-bold uppercase tracking-wider mb-3 ${
                  isFinalRound ? 'text-piu-gold' : 'text-gray-500'
                }`}>
                  {getRoundLabel(round)}
                </div>

                {/* Matches in this round */}
                <div className="flex flex-col justify-around flex-1" style={{ gap: `${Math.pow(2, round - 1) * 8 + 8}px` }}>
                  {roundMatches.map((match) => (
                    <BracketMatch
                      key={match.id}
                      match={match}
                      playerMap={playerMap}
                      onClick={(id) => navigate(`/match/${id}`)}
                      isFinal={isFinalRound && roundMatches.length === 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SVG Connector Lines */}
      {/* We use CSS gap-based alignment instead of SVG for simplicity and responsiveness */}
    </div>
  );
}

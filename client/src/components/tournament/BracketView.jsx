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
      className={`w-44 sm:w-52 rounded-xl border overflow-hidden transition-all shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.2)]
        ${isComplete ? 'border-piu-green/20 bg-zinc-950/80' : 'bg-zinc-950/70'}
        ${isActive ? 'border-piu-accent/40 ring-1 ring-piu-accent/15 shadow-[0_0_14px_rgba(255,51,102,0.1)] cursor-pointer' : ''}
        ${isBye ? 'opacity-40 border-white/6 shadow-none' : ''}
        ${isWaiting ? 'opacity-50 border-white/6 shadow-none' : ''}
        ${!isBye && !isWaiting && !isActive ? 'border-white/10 cursor-pointer hover:border-piu-accent/35 hover:shadow-[0_4px_20px_rgba(255,51,102,0.08)]' : ''}
        ${isFinal ? 'ring-1 ring-piu-gold/30 shadow-[0_0_18px_rgba(255,215,0,0.08)]' : ''}
      `}
      style={{ contain: 'layout paint' }}
    >
      {/* Player 1 */}
      <div className={`flex items-center gap-2 px-2.5 py-2 ${match.winner_id === match.player1_id ? 'bg-piu-green/6' : ''}`}>
        <span className="text-[10px] text-zinc-600 font-mono w-4 shrink-0 text-center">
          {p1?.seed || match.bracket_position * 2 + 1}
        </span>
        <span className={`font-display font-bold text-xs truncate flex-1 ${match.winner_id === match.player1_id ? 'text-piu-green' : 'text-white'}`}>
          {p1?.name || (isBye ? 'BYE' : 'TBD')}
        </span>
        {isComplete && (
          <span className={`font-mono text-xs font-bold ${match.winner_id === match.player1_id ? 'text-piu-green' : 'text-zinc-600'}`}>
            {scores.player1_wins ?? scores.p1_total ?? '-'}
          </span>
        )}
      </div>
      <div className="border-t border-white/6" />
      {/* Player 2 */}
      <div className={`flex items-center gap-2 px-2.5 py-2 ${match.winner_id === match.player2_id ? 'bg-piu-green/6' : ''}`}>
        <span className="text-[10px] text-zinc-600 font-mono w-4 shrink-0 text-center">
          {p2?.seed || match.bracket_position * 2 + 2}
        </span>
        <span className={`font-display font-bold text-xs truncate flex-1 ${match.winner_id === match.player2_id ? 'text-piu-green' : 'text-white'}`}>
          {p2?.name || (isBye ? 'BYE' : 'TBD')}
        </span>
        {isComplete && (
          <span className={`font-mono text-xs font-bold ${match.winner_id === match.player2_id ? 'text-piu-green' : 'text-zinc-600'}`}>
            {scores.player2_wins ?? scores.p2_total ?? '-'}
          </span>
        )}
      </div>
      {/* Status bar */}
      {!isComplete && !isBye && (
        <div className="border-t border-white/6 px-2.5 py-1 text-center bg-white/[0.02]">
          <span className={`text-[9px] font-display font-bold uppercase tracking-[0.14em] ${
            isActive ? 'text-piu-accent' : 'text-zinc-600'
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

  const pct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allDone = pct === 100;

  if (bracketMatches.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-zinc-950/55 py-14 text-center">
        <span className="mb-2 block text-3xl opacity-40" aria-hidden="true">&#9878;</span>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-zinc-500">No bracket matches generated yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-piu-gold/10 border border-piu-gold/20">
            <span className="font-display text-xs font-bold text-piu-gold">&#9824;</span>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-wide text-white">Bracket</h2>
            <p className="text-xs text-zinc-500">Single Elimination</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xs font-bold tracking-wider text-zinc-400">
            <span className={allDone ? 'text-piu-gold' : ''}>{completedCount}</span>
            <span className="text-zinc-600">/{totalCount}</span>
          </div>
          <div className="mt-1 h-1.5 w-24 sm:w-32 overflow-hidden rounded-full bg-piu-dark/80 ring-1 ring-white/5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-piu-gold shadow-[0_0_8px_rgba(255,215,0,0.4)]' : 'bg-piu-gold/70 shadow-[0_0_6px_rgba(255,215,0,0.25)]'}`}
              style={{ width: `${pct}%` }}
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
                <div className={`mb-3 inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.12em] ${
                  isFinalRound ? 'border-piu-gold/25 bg-piu-gold/8 text-piu-gold' : 'border-white/8 bg-white/4 text-zinc-500'
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

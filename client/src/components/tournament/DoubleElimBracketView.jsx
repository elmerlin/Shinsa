import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

function BracketMatchCard({ match, playerMap, onClick, highlight }) {
  const p1 = playerMap[match.player1_id];
  const p2 = playerMap[match.player2_id];
  const isComplete = match.status === 'COMPLETED';
  const isActive = ['PENDING', 'DRAWING', 'VETOING', 'READY'].includes(match.status);
  const isWaiting = !match.player1_id || !match.player2_id;
  const scores = match.scores || {};

  return (
    <div
      onClick={() => !isWaiting && onClick?.(match.id)}
      className={`w-40 sm:w-48 rounded-lg border bg-piu-card/90 overflow-hidden transition-all shrink-0
        ${isComplete ? 'border-piu-green/30' : ''}
        ${isActive ? 'border-piu-accent/40 animate-pulse-glow' : ''}
        ${isWaiting ? 'opacity-50 border-piu-border/30' : ''}
        ${!isWaiting ? 'cursor-pointer hover:border-piu-accent/50' : ''}
        ${highlight === 'gold' ? 'ring-1 ring-piu-gold/40' : ''}
        ${highlight === 'losers' ? 'border-rose-500/25' : ''}
      `}
    >
      <PlayerRow
        player={p1}
        seed={p1?.seed || ''}
        isWinner={match.winner_id === match.player1_id}
        score={isComplete ? (scores.player1_wins ?? scores.p1_total ?? '-') : null}
        fallback="TBD"
      />
      <div className="border-t border-piu-border/30" />
      <PlayerRow
        player={p2}
        seed={p2?.seed || ''}
        isWinner={match.winner_id === match.player2_id}
        score={isComplete ? (scores.player2_wins ?? scores.p2_total ?? '-') : null}
        fallback="TBD"
      />
      {!isComplete && (
        <div className="border-t border-piu-border/30 px-2 py-0.5 text-center">
          <span className={`text-[8px] font-display font-bold uppercase tracking-wider ${isActive ? 'text-piu-accent' : 'text-gray-600'}`}>
            {isWaiting ? 'Waiting' : match.status}
          </span>
        </div>
      )}
    </div>
  );
}

function PlayerRow({ player, seed, isWinner, score, fallback }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1.5 ${isWinner ? 'bg-piu-green/8' : ''}`}>
      {seed && <span className="text-[9px] text-gray-600 font-mono w-3 shrink-0">{seed}</span>}
      <span className={`font-display font-bold text-[11px] truncate flex-1 ${isWinner ? 'text-piu-green' : 'text-white'}`}>
        {player?.name || fallback}
      </span>
      {score !== null && (
        <span className={`font-mono text-[11px] font-bold ${isWinner ? 'text-piu-green' : 'text-gray-600'}`}>
          {score}
        </span>
      )}
    </div>
  );
}

export default function DoubleElimBracketView({ matches, players, phaseConfig, onUpdate }) {
  const navigate = useNavigate();
  const playerMap = useMemo(() => {
    const map = {};
    players.forEach(p => { map[p.id] = p; });
    return map;
  }, [players]);

  const { winnersRounds, losersRounds, grandFinal } = useMemo(() => {
    const winnersMap = {};
    const losersMap = {};
    let gf = null;

    matches.forEach(m => {
      if (m.bracket === 'grand_final') {
        gf = m;
      } else if (m.bracket === 'losers') {
        const r = m.bracket_round || 1;
        if (!losersMap[r]) losersMap[r] = [];
        losersMap[r].push(m);
      } else {
        const r = m.bracket_round || 1;
        if (!winnersMap[r]) winnersMap[r] = [];
        winnersMap[r].push(m);
      }
    });

    const sortRounds = (map) => Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([round, ms]) => ({
        round: Number(round),
        matches: ms.sort((a, b) => a.bracket_position - b.bracket_position),
      }));

    return {
      winnersRounds: sortRounds(winnersMap),
      losersRounds: sortRounds(losersMap),
      grandFinal: gf,
    };
  }, [matches]);

  const completedCount = matches.filter(m => m.status === 'COMPLETED').length;
  const totalCount = matches.length;

  if (matches.length === 0) {
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
          <h2 className="section-title">Double Elimination</h2>
          <p className="text-sm text-gray-400">Winners and Losers brackets</p>
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

      {/* Winners Bracket */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px flex-1 bg-piu-green/20" />
          <span className="text-[10px] font-display font-bold uppercase tracking-wider text-piu-green px-2">Winners Bracket</span>
          <div className="h-px flex-1 bg-piu-green/20" />
        </div>
        <div className="overflow-x-auto pb-3 -mx-3 px-3">
          <div className="flex gap-4 min-w-max">
            {winnersRounds.map(({ round, matches: roundMatches }) => (
              <div key={`w-${round}`} className="flex flex-col items-center">
                <div className="text-[9px] font-display font-bold text-gray-500 uppercase tracking-wider mb-2">
                  WR{round}
                </div>
                <div className="flex flex-col justify-around flex-1" style={{ gap: `${Math.pow(2, round - 1) * 6 + 6}px` }}>
                  {roundMatches.map(match => (
                    <BracketMatchCard
                      key={match.id}
                      match={match}
                      playerMap={playerMap}
                      onClick={(id) => navigate(`/match/${id}`)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grand Final */}
      {grandFinal && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-piu-gold/30" />
            <span className="text-[10px] font-display font-bold uppercase tracking-wider text-piu-gold px-2">Grand Final</span>
            <div className="h-px flex-1 bg-piu-gold/30" />
          </div>
          <div className="flex justify-center">
            <BracketMatchCard
              match={grandFinal}
              playerMap={playerMap}
              onClick={(id) => navigate(`/match/${id}`)}
              highlight="gold"
            />
          </div>
        </div>
      )}

      {/* Losers Bracket */}
      {losersRounds.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-rose-500/20" />
            <span className="text-[10px] font-display font-bold uppercase tracking-wider text-rose-400 px-2">Losers Bracket</span>
            <div className="h-px flex-1 bg-rose-500/20" />
          </div>
          <div className="overflow-x-auto pb-3 -mx-3 px-3">
            <div className="flex gap-4 min-w-max">
              {losersRounds.map(({ round, matches: roundMatches }) => (
                <div key={`l-${round}`} className="flex flex-col items-center">
                  <div className="text-[9px] font-display font-bold text-gray-500 uppercase tracking-wider mb-2">
                    LR{round}
                  </div>
                  <div className="flex flex-col justify-around flex-1" style={{ gap: `${Math.max(Math.pow(2, Math.floor((round - 1) / 2)) * 4, 4) + 4}px` }}>
                    {roundMatches.map(match => (
                      <BracketMatchCard
                        key={match.id}
                        match={match}
                        playerMap={playerMap}
                        onClick={(id) => navigate(`/match/${id}`)}
                        highlight="losers"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

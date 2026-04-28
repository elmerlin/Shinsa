import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';

function isSharedWinMatch(match) {
  return !!match?.scores?.shared_win;
}

export default function SwissRound({ round, matches, players, config, onUpdate, tournamentId, onPlayerClick }) {
  const navigate = useNavigate();
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const handlePlayerClick = (event, player) => {
    if (!player || !onPlayerClick) return;
    event.stopPropagation();
    onPlayerClick(player);
  };

  const renderPlayerName = (player, align = 'left') => {
    const content = (
      <>
        {player?.avatar && (
          <img src={getAvatarUrl(player.avatar)} alt="" className="h-6 w-6 rounded-full border border-white/10 shrink-0 shadow-sm" />
        )}
        <span className="truncate">{player?.name || 'TBD'}</span>
      </>
    );

    const baseClass = `font-display font-bold text-sm sm:text-base truncate flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`;
    if (!player || !onPlayerClick) {
      return <div className={baseClass}>{content}</div>;
    }

    return (
      <button
        type="button"
        onClick={(event) => handlePlayerClick(event, player)}
        className={`${baseClass} w-full min-w-0 text-inherit transition-colors hover:text-piu-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-piu-accent/60 rounded-md`}
      >
        {content}
      </button>
    );
  };

  const levelConfig = (config.round_levels || []).find(l => l.round === round);
  const completedCount = matches.filter(m => m.status === 'COMPLETED').length;
  const totalCount = matches.length;
  const pct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allDone = pct === 100;

  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-zinc-950/55 py-14 text-center">
        <span className="mb-2 block text-3xl opacity-40" aria-hidden="true">&#9878;</span>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-zinc-500">No matches generated yet</p>
      </div>
    );
  }

  return (
    <div>
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-piu-accent/12 border border-piu-accent/20">
            <span className="font-display text-sm font-bold text-piu-accent">{round}</span>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-wide text-white">Round {round}</h2>
            {levelConfig && (
              <p className="text-xs text-zinc-500">
                Lv {levelConfig.min}&#8211;{levelConfig.max} &middot; Round Robin
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xs font-bold tracking-wider text-zinc-400">
            <span className={allDone ? 'text-piu-green' : ''}>{completedCount}</span>
            <span className="text-zinc-600">/{totalCount}</span>
          </div>
          <div className="mt-1 h-1.5 w-24 sm:w-32 overflow-hidden rounded-full bg-piu-dark/80 ring-1 ring-white/5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-piu-green shadow-[0_0_8px_rgba(51,255,102,0.4)]' : 'bg-piu-accent/80 shadow-[0_0_6px_rgba(255,51,102,0.3)]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Match list */}
      <div className="grid gap-2 sm:gap-2.5">
        {matches.map(match => {
          const p1 = playerMap[match.player1_id];
          const p2 = playerMap[match.player2_id];
          const isComplete = match.status === 'COMPLETED';
          const isLive = match.status === 'DRAWING' || match.status === 'VETOING' || match.status === 'READY';
          const scores = match.scores || {};
          const sharedWin = isSharedWinMatch(match);

          return (
            <div
              key={match.id}
              onClick={() => navigate(`/match/${match.id}`)}
              className={`flex cursor-pointer items-center gap-2 sm:gap-4 rounded-xl border bg-zinc-950/70 p-3 sm:p-4 transition-all hover:border-piu-accent/40 hover:bg-zinc-900/60 hover:shadow-lg hover:shadow-piu-accent/8
                ${isComplete ? 'border-piu-green/15' : 'border-white/8'}
                ${isLive ? 'border-piu-accent/30 shadow-[0_0_12px_rgba(255,51,102,0.12)] animate-pulse-glow' : ''}
              `}
            >
              {/* Player 1 (higher seed) */}
              <div className={`flex-1 text-right min-w-0 ${(match.winner_id === match.player1_id || sharedWin) ? 'text-piu-green' : ''}`}>
                {renderPlayerName(p1, 'right')}
                <div className="text-[10px] sm:text-xs text-zinc-600">
                  #{p1?.seed_rank || '?'}
                </div>
              </div>

              {/* Score / Status */}
              <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]">
                {isComplete ? (
                  <div className="flex items-center gap-1.5 sm:gap-2 font-display font-bold text-base sm:text-lg">
                    <span className={match.winner_id === match.player1_id || sharedWin ? 'text-piu-green' : 'text-zinc-600'}>
                      {scores.player1_wins || 0}
                    </span>
                    <span className="text-zinc-700">&ndash;</span>
                    <span className={match.winner_id === match.player2_id || sharedWin ? 'text-piu-green' : 'text-zinc-600'}>
                      {scores.player2_wins || 0}
                    </span>
                  </div>
                ) : (
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] sm:text-xs font-display font-bold ${
                    match.status === 'PENDING' ? 'border-white/8 bg-white/4 text-zinc-500' :
                    isLive ? 'border-piu-accent/25 bg-piu-accent/10 text-piu-accent' :
                    match.status === 'READY' ? 'border-piu-blue/20 bg-piu-blue/10 text-piu-blue' : 'border-white/8 bg-white/4 text-zinc-500'
                  }`}>
                    {match.status}
                  </span>
                )}
              </div>

              {/* Player 2 (lower seed) */}
              <div className={`flex-1 min-w-0 ${(match.winner_id === match.player2_id || sharedWin) ? 'text-piu-green' : ''}`}>
                {renderPlayerName(p2)}
                <div className="text-[10px] sm:text-xs text-zinc-600">
                  #{p2?.seed_rank || '?'}
                </div>
              </div>

              {!isComplete && (
                <div className="text-zinc-700 text-sm shrink-0">&#8250;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

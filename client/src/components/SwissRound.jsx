import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';

const STATUS_LABELS = {
  PENDING: 'Queued',
  DRAWING: 'Drawing',
  VETOING: 'Vetoing',
  READY: 'Ready',
  WAITING: 'Waiting',
  BYE: 'Bye',
};

function isSharedWinMatch(match) {
  return !!match?.scores?.shared_win;
}

function StatusBadge({ status }) {
  const isLive = status === 'DRAWING' || status === 'VETOING';
  const isReady = status === 'READY';
  const isPending = status === 'PENDING';

  const cls = isLive
    ? 'border-piu-accent/40 bg-piu-accent/15 text-piu-accent shadow-[0_0_10px_rgba(255,51,102,0.25)]'
    : isReady
      ? 'border-piu-blue/30 bg-piu-blue/12 text-piu-blue'
      : isPending
        ? 'border-white/10 bg-white/[0.04] text-zinc-400'
        : 'border-white/10 bg-white/[0.04] text-zinc-500';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.12em] ${cls}`}>
      {isLive ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-piu-accent opacity-75 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-piu-accent" />
        </span>
      ) : null}
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function PlayerCell({ player, align = 'right', isWinner = false, isLoser = false, onClick }) {
  const justify = align === 'right' ? 'justify-end' : 'justify-start';
  const flex = align === 'right' ? 'flex-row-reverse' : 'flex-row';
  const textAlign = align === 'right' ? 'text-right' : 'text-left';

  const avatarRing =
    isWinner ? 'ring-piu-green/50 shadow-[0_0_12px_rgba(51,255,102,0.3)]' :
    isLoser ? 'ring-white/8 opacity-70 grayscale' :
    'ring-white/15';
  const nameColor =
    isWinner ? 'text-piu-green' :
    isLoser ? 'text-zinc-500' :
    'text-white';

  const inner = (
    <>
      <div className="relative shrink-0">
        {player?.avatar ? (
          <img
            src={getAvatarUrl(player.avatar)}
            alt=""
            className={`h-10 w-10 sm:h-11 sm:w-11 rounded-full object-cover ring-1 transition-all ${avatarRing}`}
          />
        ) : (
          <div className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-gradient-to-br from-piu-accent/80 to-purple-700/80 font-display text-xs font-bold text-white ring-1 ${avatarRing}`}>
            {String(player?.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className={`min-w-0 ${textAlign}`}>
        <div className={`font-display font-bold text-sm sm:text-[15px] truncate transition-colors ${nameColor}`}>
          {player?.name || 'TBD'}
        </div>
        <div className="text-[10px] sm:text-[11px] text-zinc-600 font-mono uppercase tracking-wider">
          Seed #{player?.seed_rank || '?'}
        </div>
      </div>
    </>
  );

  const baseClass = `flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3 ${flex} ${justify}`;

  if (player && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} rounded-lg px-1.5 py-1 -mx-1.5 transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-piu-accent/60`}
        title={`View ${player.name}'s phase match history`}
      >
        {inner}
      </button>
    );
  }

  return <div className={baseClass}>{inner}</div>;
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

  const levelConfig = (config.round_levels || []).find(l => l.round === round);
  const completedCount = matches.filter(m => m.status === 'COMPLETED').length;
  const totalCount = matches.length;
  const liveCount = matches.filter(m => ['DRAWING','VETOING','READY'].includes(m.status)).length;
  const pct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allDone = pct === 100;

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-zinc-950/55 py-14 text-center">
        <span className="mb-3 block text-4xl opacity-40" aria-hidden="true">⚙</span>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-zinc-500">No matches generated yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-piu-accent/20 to-piu-accent/5 border border-piu-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-4px_rgba(255,51,102,0.3)]">
            <span className="font-display text-base sm:text-lg font-bold text-piu-accent">{round}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">Round {round}</h2>
              {liveCount > 0 && (
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-piu-accent">
                  · {liveCount} live
                </span>
              )}
            </div>
            {levelConfig && (
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                Lv {levelConfig.min}–{levelConfig.max}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-baseline gap-1 font-display font-bold tracking-wide">
            <span className={`text-base sm:text-lg ${allDone ? 'text-piu-green' : 'text-white'}`}>{completedCount}</span>
            <span className="text-zinc-600 text-sm">/</span>
            <span className="text-sm text-zinc-500">{totalCount}</span>
          </div>
          <div className="h-1.5 w-28 sm:w-36 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                allDone
                  ? 'bg-gradient-to-r from-piu-green/80 to-piu-green shadow-[0_0_12px_rgba(51,255,102,0.5)]'
                  : 'bg-gradient-to-r from-piu-accent/70 to-piu-accent shadow-[0_0_10px_rgba(255,51,102,0.4)]'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Match list */}
      <div className="grid gap-2 sm:gap-2.5">
        {matches.map((match, idx) => {
          const p1 = playerMap[match.player1_id];
          const p2 = playerMap[match.player2_id];
          const isComplete = match.status === 'COMPLETED';
          const isLive = ['DRAWING', 'VETOING', 'READY'].includes(match.status);
          const scores = match.scores || {};
          const sharedWin = isSharedWinMatch(match);
          const p1Wins = match.winner_id === match.player1_id || sharedWin;
          const p2Wins = match.winner_id === match.player2_id || sharedWin;

          return (
            <div
              key={match.id}
              onClick={() => navigate(`/match/${match.id}`)}
              className={`group relative flex cursor-pointer items-center gap-2 sm:gap-4 rounded-2xl border bg-zinc-950/70 p-3 sm:p-4 transition-all duration-200
                ${isComplete ? 'border-white/8 hover:border-white/15' : 'border-white/8 hover:border-piu-accent/35'}
                ${isLive ? 'border-piu-accent/40 shadow-[0_0_24px_-4px_rgba(255,51,102,0.35)] animate-pulse-glow' : 'hover:bg-zinc-900/50 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]'}
              `}
            >
              {/* Match number */}
              <div className="hidden sm:flex flex-col items-center justify-center w-8 shrink-0">
                <span className="font-mono text-[10px] text-zinc-700">M</span>
                <span className="font-display text-sm font-bold text-zinc-600">{idx + 1}</span>
              </div>

              {/* Player 1 (higher seed - right aligned) */}
              <PlayerCell
                player={p1}
                align="right"
                isWinner={p1Wins}
                isLoser={isComplete && !p1Wins}
                onClick={onPlayerClick && p1 ? (e) => handlePlayerClick(e, p1) : null}
              />

              {/* Score / Status */}
              <div className="flex flex-col items-center justify-center min-w-[68px] sm:min-w-[88px] shrink-0">
                {isComplete ? (
                  <>
                    <div className="flex items-center gap-2 font-display font-bold text-xl sm:text-2xl leading-none">
                      <span className={p1Wins ? 'text-piu-green' : 'text-zinc-600'}>
                        {scores.player1_wins || 0}
                      </span>
                      <span className="text-zinc-700 text-base">–</span>
                      <span className={p2Wins ? 'text-piu-green' : 'text-zinc-600'}>
                        {scores.player2_wins || 0}
                      </span>
                    </div>
                    <span className="mt-1 text-[9px] font-display font-bold uppercase tracking-[0.16em] text-zinc-600">
                      {sharedWin ? 'Shared' : 'Final'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] sm:text-[11px] font-mono text-zinc-700 mb-1">vs</span>
                    <StatusBadge status={match.status} />
                  </>
                )}
              </div>

              {/* Player 2 (lower seed - left aligned) */}
              <PlayerCell
                player={p2}
                align="left"
                isWinner={p2Wins}
                isLoser={isComplete && !p2Wins}
                onClick={onPlayerClick && p2 ? (e) => handlePlayerClick(e, p2) : null}
              />

              {!isComplete && (
                <div className="hidden sm:flex shrink-0 text-zinc-700 group-hover:text-piu-accent transition-colors">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M6 3l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

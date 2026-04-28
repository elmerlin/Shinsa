import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';

const STATUS_LABELS = {
  PENDING: 'Up Next',
  DRAWING: 'Drawing',
  VETOING: 'Vetoing',
  READY: 'Ready',
  WAITING: 'Waiting',
  BYE: 'Bye',
};

function formatLevelBand(minLevel, maxLevel) {
  const min = parseInt(minLevel, 10) || 0;
  const max = parseInt(maxLevel, 10) || min;
  if (!min && !max) return '?';
  return min === max ? `${min}` : `${min}-${max}`;
}

function GauntletStatusBadge({ status, isWaiting }) {
  if (isWaiting) {
    return (
      <span className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-zinc-600">
        Waiting
      </span>
    );
  }
  const isLive = status === 'DRAWING' || status === 'VETOING';
  const isReady = status === 'READY';

  const cls = isLive
    ? 'border-piu-accent/40 bg-piu-accent/15 text-piu-accent shadow-[0_0_10px_rgba(255,51,102,0.25)]'
    : isReady
      ? 'border-piu-blue/30 bg-piu-blue/12 text-piu-blue'
      : 'border-white/10 bg-white/[0.04] text-zinc-400';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.14em] ${cls}`}>
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

function GauntletPlayer({ player, align = 'right', label, isWinner = false, isLoser = false, isFinal = false, isWaiting = false, onClick }) {
  const justify = align === 'right' ? 'justify-end' : 'justify-start';
  const flex = align === 'right' ? 'flex-row-reverse' : 'flex-row';
  const textAlign = align === 'right' ? 'text-right' : 'text-left';

  const avatarRing =
    isWinner ? (isFinal ? 'ring-piu-gold/60 shadow-[0_0_14px_rgba(255,215,0,0.45)]' : 'ring-piu-green/50 shadow-[0_0_12px_rgba(51,255,102,0.3)]') :
    isLoser ? 'ring-white/8 opacity-60 grayscale' :
    isWaiting ? 'ring-white/8 opacity-50' :
    'ring-white/15';
  const nameColor =
    isWinner ? (isFinal ? 'text-piu-gold' : 'text-piu-green') :
    isLoser ? 'text-zinc-500' :
    isWaiting ? 'text-zinc-600' :
    'text-white';

  const inner = (
    <>
      <div className="relative shrink-0">
        {player?.avatar ? (
          <img
            src={getAvatarUrl(player.avatar)}
            alt=""
            className={`h-9 w-9 sm:h-11 sm:w-11 rounded-full object-cover ring-1 transition-all ${avatarRing}`}
          />
        ) : (
          <div className={`flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-gradient-to-br from-piu-accent/80 to-purple-700/80 font-display text-xs font-bold text-white ring-1 ${avatarRing}`}>
            {String(player?.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className={`min-w-0 ${textAlign}`}>
        <div className={`font-display font-bold text-sm sm:text-[15px] truncate transition-colors ${nameColor}`}>
          {player?.name || 'TBD'}
        </div>
        {label && (
          <div className="text-[10px] sm:text-[11px] text-zinc-600 font-display uppercase tracking-[0.1em] mt-0.5">
            {label}
          </div>
        )}
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

export default function Gauntlet({ matches, players, onUpdate, onPlayerClick }) {
  const navigate = useNavigate();
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const handlePlayerClick = (event, player) => {
    if (!player || !onPlayerClick) return;
    event.stopPropagation();
    onPlayerClick(player);
  };

  const gauntletMatches = [...matches]
    .filter(m => m.match_type === 'gauntlet')
    .sort((a, b) => a.gauntlet_order - b.gauntlet_order);

  const completedCount = gauntletMatches.filter(m => m.status === 'COMPLETED').length;
  const totalCount = gauntletMatches.length;
  const pct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allDone = pct === 100;
  const finalMatch = gauntletMatches[gauntletMatches.length - 1];
  const gauntletWinner = finalMatch?.status === 'COMPLETED' && finalMatch?.winner_id
    ? playerMap[finalMatch.winner_id] : null;

  if (gauntletMatches.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-zinc-950/55 py-14 text-center">
        <span className="mb-3 block text-4xl opacity-40" aria-hidden="true">⚔</span>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-zinc-500">No gauntlet matches generated yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-piu-accent/20 to-piu-accent/5 border border-piu-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-4px_rgba(255,51,102,0.3)]">
            <span className="text-base sm:text-lg" aria-hidden>⚔️</span>
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">Gauntlet</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              King of the Hill · Climb the ladder
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-baseline gap-1 font-display font-bold tracking-wide">
            <span className={`text-base sm:text-lg ${allDone ? 'text-piu-gold' : 'text-white'}`}>{completedCount}</span>
            <span className="text-zinc-600 text-sm">/</span>
            <span className="text-sm text-zinc-500">{totalCount}</span>
          </div>
          <div className="h-1.5 w-28 sm:w-36 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                allDone
                  ? 'bg-gradient-to-r from-piu-gold/80 to-piu-gold shadow-[0_0_12px_rgba(255,215,0,0.5)]'
                  : 'bg-gradient-to-r from-piu-accent/70 to-piu-accent shadow-[0_0_10px_rgba(255,51,102,0.4)]'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Champion banner */}
      {gauntletWinner && (
        <div className="relative overflow-hidden rounded-2xl border border-piu-gold/30 bg-[radial-gradient(circle_at_50%_-30%,rgba(255,215,0,0.18),transparent_55%),radial-gradient(circle_at_80%_120%,rgba(255,51,102,0.08),transparent_45%),linear-gradient(180deg,rgba(22,18,12,0.9),rgba(13,11,8,0.95))] py-6 sm:py-7 text-center shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5),0_0_28px_-4px_rgba(255,215,0,0.25)]">
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-piu-gold/60 to-transparent" />
          <div className="pointer-events-none absolute -top-8 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full bg-piu-gold/30 blur-2xl" />
          <div className="relative">
            <p className="text-[10px] text-piu-gold/70 font-display uppercase tracking-[0.24em] font-bold mb-2">Gauntlet Champion</p>
            <p className="font-display font-bold text-piu-gold text-2xl sm:text-3xl tracking-tight drop-shadow-[0_2px_8px_rgba(255,215,0,0.4)]">{gauntletWinner.name}</p>
          </div>
        </div>
      )}

      {/* Ladder */}
      <div className="relative">
        <div className="space-y-2 sm:space-y-2.5">
          {gauntletMatches.map((match, idx) => {
            const p1 = playerMap[match.player1_id];
            const p2 = match.player2_id ? playerMap[match.player2_id] : null;
            const isComplete = match.status === 'COMPLETED';
            const isActive = match.status === 'PENDING' || match.status === 'DRAWING' || match.status === 'READY';
            const isWaiting = match.status === 'WAITING';
            const isFinal = idx === gauntletMatches.length - 1;
            const scores = match.scores || {};
            const p1Wins = match.winner_id === match.player1_id;
            const p2Wins = match.winner_id === match.player2_id;

            return (
              <div
                key={match.id}
                onClick={() => {
                  if (!isWaiting) navigate(`/match/${match.id}`);
                }}
                className={`group relative flex items-center gap-2 sm:gap-4 rounded-2xl border p-3 sm:p-4 transition-all duration-200
                  ${!isWaiting ? 'cursor-pointer hover:bg-zinc-900/50 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]' : ''}
                  ${isFinal ? 'border-piu-gold/30 bg-[radial-gradient(circle_at_0%_50%,rgba(255,215,0,0.06),transparent_55%),rgba(13,11,8,0.78)] shadow-[0_0_18px_-4px_rgba(255,215,0,0.18)]' :
                    isComplete ? 'border-white/8 bg-zinc-950/70' :
                    'border-white/8 bg-zinc-950/70 hover:border-piu-accent/35'}
                  ${isActive && !isFinal ? 'border-piu-accent/40 shadow-[0_0_24px_-4px_rgba(255,51,102,0.35)] animate-pulse-glow' : ''}
                `}
              >
                {/* Match position node */}
                <div className="relative shrink-0 z-10">
                  <div className={`flex h-12 w-12 sm:h-14 sm:w-14 flex-col items-center justify-center rounded-xl border ${
                    isFinal
                      ? 'bg-gradient-to-br from-piu-gold/25 to-piu-gold/8 border-piu-gold/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_14px_-4px_rgba(255,215,0,0.4)]'
                      : isActive
                        ? 'bg-gradient-to-br from-piu-accent/20 to-piu-accent/5 border-piu-accent/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-4px_rgba(255,51,102,0.3)]'
                        : 'bg-gradient-to-br from-zinc-900 to-zinc-950 border-white/10'
                  }`}>
                    {isFinal ? (
                      <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-piu-gold">Final</span>
                    ) : (
                      <>
                        <span className={`font-mono text-[9px] ${isActive ? 'text-piu-accent/80' : 'text-zinc-600'}`}>#</span>
                        <span className={`font-display text-base sm:text-lg font-bold leading-none ${isActive ? 'text-piu-accent' : 'text-zinc-400'}`}>
                          {match.gauntlet_order}
                        </span>
                      </>
                    )}
                  </div>
                  <div className={`mt-1 text-center font-mono text-[10px] ${isFinal ? 'text-piu-gold/80' : 'text-zinc-600'}`}>
                    Lv{formatLevelBand(match.difficulty_min, match.difficulty_max)}
                  </div>
                </div>

                {/* Player 1 (challenger - right aligned) */}
                <GauntletPlayer
                  player={p1}
                  align="right"
                  label={p1 ? 'Challenger' : ''}
                  isWinner={p1Wins}
                  isLoser={isComplete && !p1Wins}
                  isFinal={isFinal}
                  isWaiting={isWaiting}
                  onClick={onPlayerClick && p1 ? (e) => handlePlayerClick(e, p1) : null}
                />

                {/* Score / Status */}
                <div className="flex flex-col items-center justify-center min-w-[70px] sm:min-w-[96px] shrink-0">
                  {isComplete ? (
                    <>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-sm sm:text-base leading-none">
                        <span className={p1Wins ? (isFinal ? 'text-piu-gold' : 'text-piu-green') : 'text-zinc-600'}>
                          {scores.p1_total != null ? Number(scores.p1_total).toLocaleString() : '0'}
                        </span>
                        <span className="text-zinc-700">–</span>
                        <span className={p2Wins ? (isFinal ? 'text-piu-gold' : 'text-piu-green') : 'text-zinc-600'}>
                          {scores.p2_total != null ? Number(scores.p2_total).toLocaleString() : '0'}
                        </span>
                      </div>
                      <span className="mt-1 text-[9px] font-display font-bold uppercase tracking-[0.16em] text-zinc-600">
                        Result
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] sm:text-[11px] font-mono text-zinc-700 mb-1">vs</span>
                      <GauntletStatusBadge status={match.status} isWaiting={isWaiting} />
                    </>
                  )}
                </div>

                {/* Player 2 (defender - left aligned) */}
                <GauntletPlayer
                  player={p2}
                  align="left"
                  label={p2 ? (idx === 0 ? 'Bottom Rank' : 'Defender') : ''}
                  isWinner={p2Wins}
                  isLoser={isComplete && !p2Wins}
                  isFinal={isFinal}
                  isWaiting={isWaiting}
                  onClick={onPlayerClick && p2 ? (e) => handlePlayerClick(e, p2) : null}
                />

                {!isComplete && !isWaiting && (
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
    </div>
  );
}

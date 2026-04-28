import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';

function formatLevelBand(minLevel, maxLevel) {
  const min = parseInt(minLevel, 10) || 0;
  const max = parseInt(maxLevel, 10) || min;
  if (!min && !max) return '?';
  return min === max ? `${min}` : `${min}-${max}`;
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

  const renderPlayerCell = (player, subtitle, align = 'left', highlighted = false) => {
    const content = (
      <>
        <div className={`font-display font-bold text-sm sm:text-base truncate flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
          {player?.avatar && (
            <img src={getAvatarUrl(player.avatar)} alt="" className="h-6 w-6 rounded-full border border-white/10 shrink-0 shadow-sm" />
          )}
          <span className="truncate">{player?.name || 'TBD'}</span>
        </div>
        <div className="text-[10px] sm:text-xs text-zinc-600">
          {subtitle}
        </div>
      </>
    );

    const baseClass = `flex-1 min-w-0 rounded-lg px-1.5 py-1 -mx-1.5 ${align === 'right' ? 'text-right' : ''} ${highlighted ? 'text-piu-green' : ''}`;
    if (!player || !onPlayerClick) {
      return <div className={baseClass}>{content}</div>;
    }

    return (
      <button
        type="button"
        onClick={(event) => handlePlayerClick(event, player)}
        className={`${baseClass} block text-inherit transition-colors hover:bg-white/[0.04] hover:text-piu-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-piu-accent/60`}
        title={`View ${player.name}'s phase match history`}
      >
        {content}
      </button>
    );
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
      <div className="rounded-xl border border-white/8 bg-zinc-950/55 py-14 text-center">
        <span className="mb-2 block text-3xl opacity-40" aria-hidden="true">&#9878;</span>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-zinc-500">No gauntlet matches generated yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-piu-accent/12 border border-piu-accent/20">
            <span className="font-display text-sm font-bold text-piu-accent">&#9876;</span>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-wide text-white">Gauntlet</h2>
            <p className="text-xs text-zinc-500">King of the Hill &middot; Bottom ranks fight upward</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xs font-bold tracking-wider text-zinc-400">
            <span className={allDone ? 'text-piu-accent' : ''}>{completedCount}</span>
            <span className="text-zinc-600">/{totalCount}</span>
          </div>
          <div className="mt-1 h-1.5 w-24 sm:w-32 overflow-hidden rounded-full bg-piu-dark/80 ring-1 ring-white/5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-piu-accent shadow-[0_0_8px_rgba(255,51,102,0.4)]' : 'bg-piu-accent/70 shadow-[0_0_6px_rgba(255,51,102,0.25)]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {gauntletWinner && (
        <div className="relative mb-4 overflow-hidden rounded-xl border border-piu-gold/25 bg-[radial-gradient(circle_at_50%_0%,rgba(255,215,0,0.12),transparent_60%)] py-5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-piu-gold/40 to-transparent" />
          <p className="text-[10px] text-zinc-400 font-display uppercase tracking-[0.18em] font-bold mb-1.5">Gauntlet Champion</p>
          <p className="font-display font-bold text-piu-gold text-2xl tracking-wide">{gauntletWinner.name}</p>
        </div>
      )}

      <div className="space-y-2 sm:space-y-2.5">
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
              className={`flex items-center gap-2 sm:gap-4 rounded-xl border p-3 sm:p-4 transition-all
                ${!isWaiting ? 'cursor-pointer hover:border-piu-accent/40 hover:bg-zinc-900/60 hover:shadow-lg hover:shadow-piu-accent/8' : 'opacity-50'}
                ${isComplete ? 'border-piu-green/15 bg-zinc-950/70' : 'border-white/8 bg-zinc-950/70'}
                ${isActive ? 'border-piu-accent/30 shadow-[0_0_12px_rgba(255,51,102,0.12)] animate-pulse-glow' : ''}
                ${isFinal ? 'ring-1 ring-piu-gold/25 border-piu-gold/20 shadow-[0_0_14px_rgba(255,215,0,0.06)]' : ''}
              `}
            >
              {/* Match number & difficulty */}
              <div className="text-center min-w-[50px] sm:min-w-[60px]">
                <div className={`font-display font-bold text-xs ${isFinal ? 'text-piu-gold' : 'text-zinc-500'}`}>
                  {isFinal ? 'FINAL' : `#${match.gauntlet_order}`}
                </div>
                <div className="text-[10px] text-zinc-600 font-mono">
                  Lv{formatLevelBand(match.difficulty_min, match.difficulty_max)}
                </div>
              </div>

              {renderPlayerCell(p1, p1 ? 'Challenger' : '', 'right', match.winner_id === match.player1_id)}

              {/* Score / Status */}
              <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]">
                {isComplete ? (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1 font-mono font-bold text-sm">
                      <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-zinc-600'}>
                        {scores.p1_total != null ? Number(scores.p1_total).toLocaleString() : '0'}
                      </span>
                      <span className="text-zinc-700">&ndash;</span>
                      <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-zinc-600'}>
                        {scores.p2_total != null ? Number(scores.p2_total).toLocaleString() : '0'}
                      </span>
                    </div>
                  </div>
                ) : isWaiting ? (
                  <span className="inline-flex items-center rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] sm:text-xs font-display font-bold text-zinc-600">WAITING</span>
                ) : (
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] sm:text-xs font-display font-bold ${
                    match.status === 'PENDING' ? 'border-white/8 bg-white/4 text-zinc-500' :
                    match.status === 'READY' ? 'border-piu-blue/20 bg-piu-blue/10 text-piu-blue' : 'border-piu-accent/25 bg-piu-accent/10 text-piu-accent'
                  }`}>
                    {match.status}
                  </span>
                )}
              </div>

              {renderPlayerCell(p2, p2 ? (idx === 0 ? 'Bottom Rank' : 'Defender') : '', 'left', match.winner_id === match.player2_id)}

              {!isComplete && !isWaiting && (
                <div className="text-zinc-700 text-sm shrink-0">&#8250;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

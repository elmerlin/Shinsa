/**
 * PetInvadersLauncher — Featured minigame card for Play & Care section
 */

import React from 'react';
import SpritePet from '../../SpritePet';

export default function PetInvadersLauncher({ onPlay, stats, leaderboard, cost, comboBalance }) {
  const highScore = stats?.highScore ?? 0;
  const bestWave = stats?.bestWave ?? 0;
  const totalRuns = stats?.totalRuns ?? 0;
  const topEntries = Array.isArray(leaderboard) ? leaderboard.slice(0, 3) : [];
  const comboCost = cost?.combo || 0;
  const canAfford = (comboBalance ?? Infinity) >= comboCost;

  return (
    <button
      onClick={onPlay}
      className="w-full group relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-emerald-950/40 via-cyan-950/30 to-black/20 p-3 text-left transition-all hover:border-white/15 active:scale-[0.98] overflow-hidden"
    >
      {/* Glow accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />

      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-400/15 flex items-center justify-center shrink-0">
          <span className="text-lg">👾</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white/90">Pet Invaders</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-300/80 border border-emerald-400/10">
              Shooter
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">
            Your pet auto-fires — dodge and destroy waves of invaders!
          </p>
          <div className="flex items-center gap-2 mt-1">
            {totalRuns > 0 && (
              <>
                <span className="text-[9px] text-amber-400/80 font-semibold">Best: {highScore}</span>
                <span className="text-[9px] text-cyan-400/80 font-semibold">Wave {bestWave}</span>
                <span className="text-[9px] text-gray-600">{totalRuns} runs</span>
              </>
            )}
            {comboCost > 0 && (
              <span className={`text-[9px] font-semibold ${canAfford ? 'text-amber-400/60' : 'text-rose-400/80'}`}>
                {comboCost}c
              </span>
            )}
          </div>
        </div>

        {/* Play arrow */}
        <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center group-hover:bg-white/10 transition-colors shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/60 group-hover:text-white transition-colors">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mt-3 rounded-lg border border-white/[0.05] bg-black/20 px-2.5 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black tracking-[0.2em] uppercase text-emerald-200/80">Top Invaders Runs</span>
          <span className="text-[9px] text-gray-600">Players + pets</span>
        </div>

        {topEntries.length > 0 ? (
          <div className="space-y-1.5">
            {topEntries.map((entry) => (
              <div
                key={`${entry.user_id || entry.username}-${entry.rank}`}
                className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${entry.is_me ? 'bg-emerald-400/[0.08]' : 'bg-white/[0.025]'}`}
              >
                <div className={`w-5 text-[10px] font-black tabular-nums ${entry.rank === 1 ? 'text-amber-300' : entry.rank === 2 ? 'text-slate-300' : 'text-orange-300'}`}>
                  #{entry.rank}
                </div>
                <div className="shrink-0 rounded-md border border-white/[0.05] bg-white/[0.03] px-1 py-0.5">
                  <SpritePet
                    character={entry.character}
                    weightState={entry.weight_state || 'normal'}
                    mood={entry.mood || 'happy'}
                    hat={entry.equipped_hat || ''}
                    top={entry.equipped_top || ''}
                    hatColor={entry.hat_color || ''}
                    topColor={entry.top_color || ''}
                    size={24}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-semibold text-white/90">
                    {entry.username}
                    {entry.nickname ? <span className="text-gray-500"> · {entry.nickname}</span> : null}
                  </div>
                  <div className="text-[9px] text-gray-500 truncate">
                    {entry.form?.label || 'Companion'} · wave {entry.best_wave || 0}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-black tabular-nums text-emerald-200">{entry.high_score}</div>
                  <div className="text-[9px] tabular-nums text-gray-600">{entry.total_kills || 0} kills</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-500">Loading community runs...</div>
        )}
      </div>
    </button>
  );
}

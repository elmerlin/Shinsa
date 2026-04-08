/**
 * MiniPumpLauncher — Featured minigame card for Play & Care section
 */

import React from 'react';

export default function MiniPumpLauncher({ onPlay, stats, cost, comboBalance }) {
  const personalBest = stats?.personalBest ?? 0;
  const roundsPlayed = stats?.roundsPlayed ?? 0;
  const comboCost = cost?.combo || 0;
  const canAfford = (comboBalance ?? Infinity) >= comboCost;

  return (
    <button
      onClick={onPlay}
      className="w-full group relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-blue-950/40 via-purple-950/30 to-black/20 p-3 text-left transition-all hover:border-white/15 active:scale-[0.98] overflow-hidden"
    >
      {/* Glow accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-bl-full pointer-events-none" />

      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/15 flex items-center justify-center shrink-0">
          <span className="text-lg">🎯</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white/90">Mini-Pump</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase bg-blue-500/15 text-blue-300/80 border border-blue-400/10">
              Arcade
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">
            Match falling blobs — your pet fires the laser!
          </p>
          <div className="flex items-center gap-2 mt-1">
            {roundsPlayed > 0 && (
              <>
                <span className="text-[9px] text-amber-400/80 font-semibold">Best: {personalBest}</span>
                <span className="text-[9px] text-gray-600">{roundsPlayed} rounds</span>
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

      <div className="mt-3 rounded-lg border border-white/[0.05] bg-black/20 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black tracking-[0.2em] uppercase text-cyan-200/80">Inside The Game</span>
          <span className="text-[9px] text-gray-600">Leaderboard + replay</span>
        </div>
        <p className="mt-1 text-[10px] text-gray-500">
          Open Mini-Pump to see the live community board and start a fresh run from the game screen.
        </p>
      </div>
    </button>
  );
}

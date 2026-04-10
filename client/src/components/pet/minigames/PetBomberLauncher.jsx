import React from 'react';

export default function PetBomberLauncher({ onPlay, stats, cost, comboBalance }) {
  const wins = (stats?.human?.wins ?? 0) + (stats?.bot?.wins ?? 0);
  const matches = (stats?.human?.matchesPlayed ?? 0) + (stats?.bot?.matchesPlayed ?? 0);
  const comboCost = cost?.combo || 0;
  const canAfford = (comboBalance ?? Infinity) >= comboCost;

  return (
    <button
      onClick={onPlay}
      className="w-full group relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-violet-950/50 via-fuchsia-950/35 to-black/20 p-3 text-left transition-all hover:border-white/15 active:scale-[0.98] overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-violet-500/12 to-transparent rounded-bl-full pointer-events-none" />

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-400/15 flex items-center justify-center shrink-0">
          <span className="text-lg">💣</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white/90">Pet Bomber</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase bg-violet-500/15 text-violet-300/85 border border-violet-400/10">
              Multiplayer
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">
            Drop bombs, grab power-ups, and blast your rivals in sci-fi arenas.
          </p>
          <div className="flex items-center gap-2 mt-1">
            {matches > 0 && (
              <>
                <span className="text-[9px] text-violet-300/90 font-semibold">{wins}W</span>
                <span className="text-[9px] text-gray-600">{matches} matches</span>
              </>
            )}
            {comboCost > 0 && (
              <span className={`text-[9px] font-semibold ${canAfford ? 'text-amber-400/65' : 'text-rose-400/80'}`}>
                {comboCost}c
              </span>
            )}
          </div>
        </div>

        <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center group-hover:bg-white/10 transition-colors shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/60 group-hover:text-white transition-colors">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </div>
      </div>
    </button>
  );
}

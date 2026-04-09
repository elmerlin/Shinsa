import React from 'react';

export default function PacItUpLauncher({ onPlay, stats, cost, comboBalance }) {
  const canAfford = !cost || (comboBalance ?? Infinity) >= (cost.combo || 0);
  return (
    <button
      onClick={onPlay}
      className="w-full group relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-teal-950/40 via-gray-900/60 to-gray-900/80 overflow-hidden
                 hover:border-teal-400/15 hover:shadow-lg hover:shadow-teal-900/10 transition-all text-left"
    >
      {/* Accent glow */}
      <div className="absolute -top-6 -right-6 w-20 h-20 bg-teal-500/[0.06] rounded-full blur-2xl group-hover:bg-teal-400/[0.10] transition-colors" />

      <div className="flex items-center gap-3 p-3 relative">
        {/* Icon */}
        <div className="w-11 h-11 rounded-lg bg-teal-900/40 border border-teal-400/10 flex items-center justify-center text-lg flex-shrink-0">
          👻
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-white">Pac It Up!</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-300/80 font-medium uppercase tracking-wider">Maze</span>
          </div>
          <div className="text-[10px] text-gray-500 leading-tight mb-1.5">
            Guide your pet through stomp mazes, dodge mines, and cash in ghost chains.
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            {stats ? (
              <>
                <span>Best <span className="text-teal-300/70 font-medium">{stats.highScore || 0}</span></span>
                <span>Stage <span className="text-teal-300/70 font-medium">{stats.bestStage || 0}</span></span>
                <span>{stats.totalRuns || 0} runs</span>
              </>
            ) : (
              <span className="text-gray-600">—</span>
            )}
            {cost && (
              <span className={canAfford ? 'text-gray-500' : 'text-amber-400/80'}>
                {cost.combo || 0}c
              </span>
            )}
          </div>
        </div>

        {/* Play arrow */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-500/10 border border-teal-400/10 flex items-center justify-center
                        group-hover:bg-teal-500/20 group-hover:border-teal-400/20 transition-all">
          <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
            <path d="M1 1.5l7.5 4.5L1 10.5V1.5z" fill="currentColor" className="text-teal-300/60 group-hover:text-teal-200/80 transition-colors" />
          </svg>
        </div>
      </div>
    </button>
  );
}

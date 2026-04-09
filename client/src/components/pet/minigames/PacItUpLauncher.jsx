import React from 'react';

function PixelGhostIcon() {
  const pixels = [
    '  rr  rr  ',
    ' rrrrrrrr ',
    'rrrrrrrrrr',
    'rrwwrrwwrr',
    'rrwprrwprr',
    'rrrrrrrrrr',
    'rrrmmmmmrr',
    'rmmmmmmmrr',
    'r r rr r r',
    'r  r  r  r',
  ];

  const palette = {
    r: '#ee5f7a',
    w: '#ffffff',
    p: '#1f2f5a',
    m: '#8e1e34',
  };

  return (
    <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden="true" shapeRendering="crispEdges">
      {pixels.map((row, y) => (
        row.split('').map((cell, x) => (
          cell === ' ' ? null : (
            <rect
              key={`${x}-${y}`}
              x={x * 4}
              y={y * 4}
              width="4"
              height="4"
              fill={palette[cell]}
            />
          )
        ))
      ))}
    </svg>
  );
}

export default function PacItUpLauncher({ onPlay, stats, cost, comboBalance }) {
  const highScore = stats?.highScore ?? 0;
  const bestStage = stats?.bestStage ?? 0;
  const totalRuns = stats?.totalRuns ?? 0;
  const comboCost = cost?.combo || 0;
  const canAfford = (comboBalance ?? Infinity) >= comboCost;

  return (
    <button
      onClick={onPlay}
      className="w-full group relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-teal-950/40 via-cyan-950/30 to-black/20 p-3 text-left transition-all hover:border-white/15 active:scale-[0.98] overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-teal-500/10 to-transparent rounded-bl-full pointer-events-none" />

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-400/15 flex items-center justify-center shrink-0">
          <PixelGhostIcon />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white/90">Pac It Up!</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase bg-teal-500/15 text-teal-300/80 border border-teal-400/10">
              Maze
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">
            Collect stomps, dodge ghosts, and clear pixel mazes with your pet.
          </p>
          <div className="flex items-center gap-2 mt-1">
            {totalRuns > 0 && (
              <>
                <span className="text-[9px] text-amber-400/80 font-semibold">Best: {highScore}</span>
                <span className="text-[9px] text-teal-300/80 font-semibold">Stage {bestStage}</span>
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

        <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center group-hover:bg-white/10 transition-colors shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/60 group-hover:text-white transition-colors">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </div>
      </div>
    </button>
  );
}

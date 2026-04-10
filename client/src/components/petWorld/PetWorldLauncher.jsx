import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

/* ── Pixel-art village icon (house + tree, 40x40) ──────────────── */
function VillageIcon() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = 4; // pixel scale
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 40, 40);

    // Tree trunk
    ctx.fillStyle = '#6B3E26';
    ctx.fillRect(3 * s, 6 * s, 1 * s, 3 * s);

    // Tree canopy
    ctx.fillStyle = '#22C55E';
    ctx.fillRect(2 * s, 4 * s, 3 * s, 1 * s);
    ctx.fillRect(1 * s, 5 * s, 5 * s, 1 * s);
    ctx.fillRect(2 * s, 3 * s, 3 * s, 1 * s);

    // House body
    ctx.fillStyle = '#D4A574';
    ctx.fillRect(5 * s, 5 * s, 4 * s, 4 * s);

    // Roof
    ctx.fillStyle = '#B45309';
    ctx.fillRect(5 * s, 4 * s, 4 * s, 1 * s);
    ctx.fillRect(6 * s, 3 * s, 2 * s, 1 * s);

    // Door
    ctx.fillStyle = '#78350F';
    ctx.fillRect(6 * s, 7 * s, 1 * s, 2 * s);

    // Window
    ctx.fillStyle = '#FDE68A';
    ctx.fillRect(8 * s, 6 * s, 1 * s, 1 * s);

    // Ground line
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 9 * s, 10 * s, 1 * s);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={40}
      height={40}
      className="block"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export default function PetWorldLauncher({ stats }) {
  const population = stats?.population ?? 0;
  const biome = stats?.biome || null;
  const expansions = stats?.expansions ?? 0;
  const hasWorld = !!stats?.hasWorld;

  return (
    <Link
      to="/pet/world"
      className="w-full group relative block rounded-xl border border-white/[0.08] bg-gradient-to-br from-emerald-950/50 via-green-950/35 to-black/20 p-3 text-left transition-all hover:border-white/15 active:scale-[0.98] overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-emerald-500/12 to-transparent rounded-bl-full pointer-events-none" />

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-400/15 flex items-center justify-center shrink-0">
          <VillageIcon />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white/90">Pet World</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-300/85 border border-emerald-400/10">
              Idle Sim
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">
            Build a persistent village, grow your population, and trade with friends
          </p>
          <div className="flex items-center gap-2 mt-1">
            {hasWorld ? (
              <>
                <span className="text-[9px] text-emerald-300/90 font-semibold">{population} pop</span>
                {biome && <span className="text-[9px] text-gray-600 capitalize">{biome}</span>}
                {expansions > 0 && <span className="text-[9px] text-gray-600">{expansions} exp</span>}
              </>
            ) : (
              <span className="text-[9px] text-emerald-400/70 font-semibold">Create your world</span>
            )}
          </div>
        </div>

        <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center group-hover:bg-white/10 transition-colors shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/60 group-hover:text-white transition-colors">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

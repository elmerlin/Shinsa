import React from 'react';
import { Link } from 'react-router-dom';

export default function PetWorldLauncher() {
  return (
    <Link
      to="/pet/world"
      className="w-full group relative block overflow-hidden rounded-2xl border border-emerald-400/10 bg-[linear-gradient(135deg,rgba(19,48,28,0.95),rgba(17,24,39,0.96)_58%,rgba(45,88,58,0.84))] p-3 text-left transition-all hover:border-emerald-300/20 hover:shadow-[0_16px_40px_rgba(10,18,14,0.36)] active:scale-[0.99]"
    >
      <div className="absolute inset-y-0 right-0 w-28 bg-[radial-gradient(circle_at_top_right,rgba(110,231,183,0.14),transparent_68%)] pointer-events-none" />
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-300/14 bg-emerald-400/10 text-lg">
          🌿
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white/90">Pet World</span>
            <span className="rounded bg-emerald-400/12 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-emerald-200/80">
              Village
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-emerald-50/55">
            Build a persistent village, grow your population, and turn combos into a thriving world.
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 transition-all group-hover:bg-white/[0.09] group-hover:text-white">
          →
        </div>
      </div>
    </Link>
  );
}

import React from 'react';
import { getBiomeUi } from './petWorldTiles';

const BIOMES = ['grasslands', 'forest', 'coastal', 'mountain', 'desert', 'tropical', 'tundra', 'volcanic'];

export default function PetWorldCreateModal({ open, selectedBiome, onSelectBiome, onCreate, creating }) {
  if (!open) return null;
  return (
    <section className="rounded-[1.6rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(13,18,26,0.98),rgba(8,11,16,0.96))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
      <div className="max-w-2xl">
        <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/50">Found a village</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Choose your biome</h1>
        <p className="mt-2 text-sm text-white/56">
          Every biome starts with the same handcrafted 12x12 village for fairness, then opens into different terrain as you expand.
        </p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BIOMES.map((biome) => {
          const ui = getBiomeUi(biome);
          const active = biome === selectedBiome;
          return (
            <button
              key={biome}
              type="button"
              onClick={() => onSelectBiome?.(biome)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                active
                  ? 'border-emerald-300/35 bg-emerald-500/[0.14]'
                  : 'border-white/[0.07] bg-white/[0.04] hover:border-white/16 hover:bg-white/[0.06]'
              }`}
            >
              <div className="text-sm font-black text-white">{ui.label}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/45">{ui.badge}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onCreate?.(selectedBiome)}
          disabled={creating}
          className="rounded-2xl border border-emerald-300/24 bg-emerald-500/[0.14] px-4 py-3 text-sm font-bold text-emerald-100 transition-all hover:bg-emerald-500/[0.18] disabled:opacity-50"
        >
          {creating ? 'Creating world…' : 'Create world'}
        </button>
        <span className="text-sm text-white/45">Starter house included. Population starts at 2.</span>
      </div>
    </section>
  );
}

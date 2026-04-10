import React from 'react';
import { getBiomeUi } from './petWorldTiles';

const BIOMES = ['grasslands', 'forest', 'coastal', 'mountain', 'desert', 'tropical', 'tundra', 'volcanic'];

const BIOME_META = {
  grasslands: { flavor: 'Rolling fields rich with crops',     terrain: 'Rivers \u00B7 Meadows \u00B7 Orchards',         gradient: 'from-emerald-900/40 to-emerald-800/20' },
  forest:     { flavor: 'Dense woods full of timber',          terrain: 'Old-growth trees \u00B7 Glades \u00B7 Streams', gradient: 'from-green-950/50 to-green-900/20' },
  coastal:    { flavor: 'Sandy shores and abundant seas',      terrain: 'Beaches \u00B7 Tide pools \u00B7 Reefs',        gradient: 'from-cyan-900/40 to-sky-800/20' },
  mountain:   { flavor: 'Rocky highlands with deep quarries',  terrain: 'Peaks \u00B7 Passes \u00B7 Caverns',           gradient: 'from-slate-800/50 to-slate-700/20' },
  desert:     { flavor: 'Arid dunes hiding ancient gold',      terrain: 'Sand dunes \u00B7 Oases \u00B7 Ruins',         gradient: 'from-amber-900/40 to-yellow-800/20' },
  tropical:   { flavor: 'Lush jungles with rare fibers',       terrain: 'Rainforest \u00B7 Waterfalls \u00B7 Canopy',    gradient: 'from-teal-900/40 to-emerald-800/20' },
  tundra:     { flavor: 'Frozen tundra with exposed stone',    terrain: 'Ice flats \u00B7 Frost pines \u00B7 Hot springs', gradient: 'from-blue-950/40 to-indigo-900/20' },
  volcanic:   { flavor: 'Ashen lands over molten riches',      terrain: 'Lava flows \u00B7 Ash fields \u00B7 Vents',     gradient: 'from-red-950/50 to-orange-900/20' },
};

export default function PetWorldCreateModal({ open, selectedBiome, onSelectBiome, onCreate, creating }) {
  if (!open) return null;

  return (
    <section className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(16,24,40,0.98),rgba(6,8,14,1))]">
      {/* Starfield dots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: `${1 + (i % 3)}px`,
              height: `${1 + (i % 3)}px`,
              top: `${((i * 37 + 13) % 100)}%`,
              left: `${((i * 53 + 7) % 100)}%`,
              opacity: 0.08 + (i % 5) * 0.04,
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-16">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Create Your World</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/50 sm:text-base">
            Choose a biome for your village. Each biome has unique terrain and a resource specialty.
          </p>
        </div>

        {/* Biome grid */}
        <div className="mt-8 grid gap-3 grid-cols-2 lg:grid-cols-4">
          {BIOMES.map((biome) => {
            const ui = getBiomeUi(biome);
            const meta = BIOME_META[biome];
            const active = biome === selectedBiome;
            return (
              <button
                key={biome}
                type="button"
                onClick={() => onSelectBiome?.(biome)}
                className={`group relative rounded-2xl border p-4 text-left transition-all ${
                  active
                    ? 'scale-[1.03] border-emerald-300/40 bg-white/[0.08] shadow-[0_0_20px_rgba(16,185,129,0.12)]'
                    : 'border-white/[0.07] bg-white/[0.04] hover:border-white/14 hover:bg-white/[0.06]'
                }`}
              >
                {/* Gradient bg */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${meta.gradient} pointer-events-none`} />

                {/* Checkmark */}
                {active && (
                  <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">
                    &#10003;
                  </div>
                )}

                <div className="relative">
                  <div className="text-base font-black text-white sm:text-lg">{ui.label}</div>
                  <div className="mt-1 inline-block rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/60">
                    {ui.badge}
                  </div>
                  <div className="mt-2 text-xs text-white/45 leading-relaxed">{meta.flavor}</div>
                  <div className="mt-1.5 text-[10px] text-white/30">{meta.terrain}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Create button */}
        <div className="mt-10 flex flex-col items-center">
          <button
            type="button"
            onClick={() => selectedBiome && onCreate?.(selectedBiome)}
            disabled={!selectedBiome || creating}
            className="relative rounded-2xl border border-emerald-300/24 bg-emerald-500/[0.16] px-8 py-4 text-base font-black text-emerald-100 transition-all hover:bg-emerald-500/[0.24] disabled:opacity-40 disabled:cursor-not-allowed sm:text-lg"
          >
            {creating && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-200/30 border-t-emerald-200" />
              </span>
            )}
            <span className={creating ? 'ml-4' : ''}>{creating ? 'Founding...' : 'Found Your Village'}</span>
          </button>
          {!selectedBiome && (
            <div className="mt-3 text-xs text-white/35">Select a biome above to continue</div>
          )}
          {selectedBiome && !creating && (
            <div className="mt-3 text-xs text-white/35">Starter house included. Population starts at 2.</div>
          )}
        </div>
      </div>
    </section>
  );
}

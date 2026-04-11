import React, { useState } from 'react';
import { getBuildingUi } from './petWorldBuildings';
import { RESOURCE_ICONS as RES_ICONS } from './petWorldUtils';
import PetWorldSpriteThumbnail from './PetWorldSpriteThumbnail';

const CATEGORIES = ['All', 'Food', 'Wood', 'Stone', 'Cloth', 'Gold', 'Housing', 'Support', 'Storage', 'Cosmetic', 'Trade'];

const FLOWER_VARIANTS = [
  { id: 'pink', label: 'Pink', color: '#e060a0' },
  { id: 'yellow', label: 'Yellow', color: '#e0e040' },
  { id: 'blue', label: 'Blue', color: '#4080e0' },
  { id: 'red', label: 'Red', color: '#e04040' },
];

function CostLine({ comboCost, materials = {} }) {
  const mats = Object.entries(materials).filter(([, v]) => v > 0);
  return (
    <span className="flex flex-wrap items-center gap-0.5 text-[9px] text-white/50">
      <span className="font-semibold">{comboCost}c</span>
      {mats.map(([key, amt]) => (
        <span key={key} className="inline-flex items-center gap-px rounded bg-white/[0.06] px-1 py-px">
          {amt}{RES_ICONS[key] || key}
        </span>
      ))}
    </span>
  );
}

function keyStat(building) {
  if (building.production) {
    const [res, rate] = Object.entries(building.production)[0] || [];
    if (res) return `${rate}/hr ${res}`;
  }
  if (building.housing) return `+${building.housing} pop`;
  if (building.happiness) return `+${building.happiness} happy`;
  if (building.storageBonus) return `+${building.storageBonus} storage`;
  return building.description || '';
}

export default function PetWorldBuildMenu({
  open,
  buildings = [],
  world,
  selectedType,
  selectedVariant,
  layout = 'browse',
  onSelect,
  onClose,
}) {
  const [cat, setCat] = useState('All');

  if (!open) return null;

  const filtered = cat === 'All'
    ? buildings
    : buildings.filter((b) => {
        const ui = getBuildingUi(b.id);
        return ui.category === cat;
      });

  const isPeek = layout === 'peek';
  const gridCols = layout === 'expanded'
    ? 'grid-cols-3 sm:grid-cols-4'
    : 'grid-cols-2';

  return (
    <div className="space-y-2">
      {/* Category pills -- horizontal scroll */}
      <div
        className="flex gap-1 overflow-x-auto scrollbar-none"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
      >
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-semibold transition-all motion-reduce:transition-none ${
              cat === c
                ? 'border-cyan-300/18 bg-cyan-400/[0.12] text-cyan-50'
                : 'border-white/[0.06] text-white/38 hover:bg-white/[0.06] hover:text-white/70'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {isPeek ? (
        <div
          className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
        >
          {filtered.map((building) => {
            const ui = getBuildingUi(building.id);
            const locked = (world?.population || 0) < (building.tierUnlockPopulation || 0);
            const selected = selectedType === building.id;
            return (
              <button
                key={building.id}
                type="button"
                onClick={() => !locked && onSelect(building.id)}
                className={`relative flex min-w-[148px] shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all motion-reduce:transition-none ${
                  selected
                    ? 'border-cyan-300/24 bg-cyan-400/[0.12] text-white'
                    : locked
                      ? 'border-white/[0.04] bg-white/[0.02] text-white/25'
                      : 'border-white/[0.08] bg-white/[0.04] text-white/82 hover:border-white/14 hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-black/25">
                  <PetWorldSpriteThumbnail type={building.id} biome={world?.biome} size={34} className="block" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold">{building.name}</span>
                  <span className="mt-0.5 block truncate text-[9px] text-white/48">{keyStat(building)}</span>
                  <span className="mt-1 block text-[8px] text-white/34">{building.comboCost}c</span>
                </span>
                <span className="rounded-full border px-1.5 py-0.5 text-[7px] uppercase tracking-[0.18em]" style={{ borderColor: `${ui.accent}30`, color: `${ui.accent}` }}>
                  T{building.tier}
                </span>
                {locked && (
                  <span className="absolute inset-x-2 bottom-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-center text-[8px] font-semibold text-white/42">
                    Need {building.tierUnlockPopulation} pop
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className={`grid ${gridCols} gap-1.5`}
          style={{ touchAction: 'pan-y' }}
        >
          {filtered.map((building) => {
            const ui = getBuildingUi(building.id);
            const locked = (world?.population || 0) < (building.tierUnlockPopulation || 0);
            const selected = selectedType === building.id;
            return (
              <button
                key={building.id}
                type="button"
                onClick={() => !locked && onSelect(building.id)}
                className={`relative rounded-lg border text-left transition-all motion-reduce:transition-none ${
                  selected
                    ? 'border-cyan-300/26 bg-cyan-400/[0.12] ring-1 ring-cyan-300/15'
                    : locked
                      ? 'border-white/[0.03] bg-white/[0.02]'
                      : 'border-white/[0.06] bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-black/20">
                    <PetWorldSpriteThumbnail type={building.id} biome={world?.biome} size={34} className="block" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[11px] font-bold leading-tight ${locked ? 'text-white/25' : 'text-white/88'}`}>
                      {building.name}
                    </div>
                    <div className={`mt-0.5 truncate text-[9px] font-medium leading-tight ${locked ? 'text-white/20' : 'text-white/50'}`}>
                      {keyStat(building)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[7px] uppercase tracking-[0.18em] text-white/28">T{building.tier}</span>
                </div>

                <div className={`flex items-center justify-between px-2.5 pb-2 ${locked ? 'opacity-30' : ''}`}>
                  <CostLine comboCost={building.comboCost} materials={building.materials} />
                  <span className="text-[8px] text-white/25">{building.width}&times;{building.height}</span>
                </div>

                {selected && building.id === 'flower_bed' && (
                  <div className="flex items-center gap-1 px-2.5 pb-2">
                    <span className="mr-0.5 text-[8px] text-white/35">Color:</span>
                    {FLOWER_VARIANTS.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSelect(building.id, v.id); }}
                        className={`h-3.5 w-3.5 rounded-full border-2 transition-all motion-reduce:transition-none ${
                          selectedVariant === v.id ? 'scale-110 border-white' : 'border-white/20 hover:border-white/50'
                        }`}
                        style={{ backgroundColor: v.color }}
                        title={v.label}
                      />
                    ))}
                  </div>
                )}

                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                    <span className="text-[9px] font-semibold text-white/40">Need {building.tierUnlockPopulation} pop</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

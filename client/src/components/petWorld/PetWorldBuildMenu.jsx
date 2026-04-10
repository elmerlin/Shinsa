import React, { useState } from 'react';
import { getBuildingUi } from './petWorldBuildings';
import { RESOURCE_ICONS as RES_ICONS } from './petWorldUtils';

const CATEGORIES = ['All', 'Food', 'Wood', 'Stone', 'Cloth', 'Gold', 'Housing', 'Support', 'Storage', 'Cosmetic', 'Trade'];

const FLOWER_VARIANTS = [
  { id: 'pink', label: 'Pink', color: '#e060a0' },
  { id: 'yellow', label: 'Yellow', color: '#e0e040' },
  { id: 'blue', label: 'Blue', color: '#4080e0' },
  { id: 'red', label: 'Red', color: '#e04040' },
];

function MaterialPills({ materials = {} }) {
  const entries = Object.entries(materials).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([key, amt]) => (
        <span key={key} className="inline-flex items-center gap-0.5 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/55">
          {amt} {RES_ICONS[key] || key}
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

  return (
    <div className="rounded-[1.3rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,12,18,0.96))] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🏗️</span>
          <h2 className="text-base font-black text-white">Build</h2>
        </div>
        <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-sm text-white/60 hover:border-white/20 hover:text-white">&times;</button>
      </div>

      {/* Category tabs */}
      <div className="mb-2 flex gap-1 overflow-x-auto scrollbar-none">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all ${
              cat === c
                ? 'bg-white/[0.12] text-white'
                : 'text-white/40 hover:bg-white/[0.05] hover:text-white/60'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 overflow-y-auto" style={{ maxHeight: '20rem' }}>
        {filtered.map((building) => {
          const ui = getBuildingUi(building.id);
          const locked = (world?.population || 0) < (building.tierUnlockPopulation || 0);
          const selected = selectedType === building.id;
          return (
            <button
              key={building.id}
              type="button"
              onClick={() => !locked && onSelect(building.id)}
              className={`relative rounded-xl border text-left transition-all ${
                selected
                  ? 'border-emerald-300/40 bg-emerald-500/[0.14] shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : locked
                    ? 'border-white/[0.04] bg-white/[0.02]'
                    : 'border-white/[0.07] bg-white/[0.04] hover:border-white/16 hover:bg-white/[0.06]'
              }`}
            >
              {/* Color bar header */}
              <div className={`flex items-center justify-between rounded-t-xl px-2.5 py-1.5 ${locked ? 'bg-white/[0.02]' : 'bg-white/[0.04]'}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm">{ui.icon}</span>
                  <span className={`truncate text-xs font-bold ${locked ? 'text-white/30' : 'text-white/90'}`}>{building.name}</span>
                </div>
                <span className="shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-[8px] uppercase tracking-[0.1em] text-white/45">
                  T{building.tier}
                </span>
              </div>

              {/* Body */}
              <div className={`px-2.5 pb-2 pt-1.5 ${locked ? 'opacity-35' : ''}`}>
                {/* Cost line */}
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-white/55">
                  <span className="font-semibold">{building.comboCost}c</span>
                  <MaterialPills materials={building.materials} />
                </div>
                {/* Key stat */}
                <div className="mt-1 truncate text-[10px] font-medium text-white/65">{keyStat(building)}</div>
                {/* Size + build time */}
                <div className="mt-1 flex items-center gap-2 text-[9px] text-white/35">
                  <span>{building.width}&times;{building.height}</span>
                  <span>{building.buildMinutes ? `${building.buildMinutes}m` : 'Instant'}</span>
                </div>
              </div>

              {/* Flower variant selector */}
              {selected && building.id === 'flower_bed' && (
                <div className="px-2.5 pb-2 flex items-center gap-1">
                  <span className="text-[9px] text-white/40 mr-1">Color:</span>
                  {FLOWER_VARIANTS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelect(building.id, v.id); }}
                      className={`w-4 h-4 rounded-full border-2 transition-all ${
                        selectedVariant === v.id ? 'border-white scale-110' : 'border-white/20 hover:border-white/50'
                      }`}
                      style={{ backgroundColor: v.color }}
                      title={v.label}
                    />
                  ))}
                </div>
              )}

              {/* Locked overlay */}
              {locked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/40">
                  <span className="text-base">🔒</span>
                  <span className="mt-0.5 text-[9px] font-semibold text-white/50">Need {building.tierUnlockPopulation} pop</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

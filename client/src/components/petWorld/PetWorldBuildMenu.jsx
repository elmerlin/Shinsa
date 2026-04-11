import React, { useState } from 'react';
import { getBuildingUi } from './petWorldBuildings';
import { RESOURCE_ICONS as RES_ICONS } from './petWorldUtils';
import { drawBuildingThumbnail } from './petWorldSprites';

const CATEGORIES = ['All', 'Food', 'Wood', 'Stone', 'Cloth', 'Gold', 'Housing', 'Support', 'Storage', 'Cosmetic', 'Trade'];

const FLOWER_VARIANTS = [
  { id: 'pink', label: 'Pink', color: '#e060a0' },
  { id: 'yellow', label: 'Yellow', color: '#e0e040' },
  { id: 'blue', label: 'Blue', color: '#4080e0' },
  { id: 'red', label: 'Red', color: '#e04040' },
];

function BuildingThumbnail({ type, biome, size = 36 }) {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const thumb = drawBuildingThumbnail(type, biome, size);
    if (!thumb) return;
    // Replace content with the cached canvas clone
    const container = containerRef.current;
    container.innerHTML = '';
    const clone = thumb.cloneNode(true);
    const srcCtx = thumb.getContext('2d');
    const destCtx = clone.getContext('2d');
    destCtx.drawImage(thumb, 0, 0);
    clone.style.width = `${size}px`;
    clone.style.height = `${size}px`;
    clone.style.display = 'block';
    container.appendChild(clone);
  }, [type, biome, size]);

  return <div ref={containerRef} className="shrink-0" style={{ width: size, height: size }} />;
}

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
    <div>
      {/* Category pills -- horizontal scroll */}
      <div className="mb-2 flex gap-1 overflow-x-auto scrollbar-none" style={{ overscrollBehavior: 'contain' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold transition-all ${
              cat === c
                ? 'bg-white/[0.14] text-white'
                : 'text-white/35 hover:bg-white/[0.06] hover:text-white/55'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Dense 2-col grid */}
      <div
        className="grid grid-cols-2 gap-1 overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
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
              className={`relative rounded-xl border text-left transition-all ${
                selected
                  ? 'border-emerald-300/30 bg-emerald-500/[0.12] ring-1 ring-emerald-400/20'
                  : locked
                    ? 'border-white/[0.03] bg-white/[0.02]'
                    : 'border-white/[0.06] bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <BuildingThumbnail type={building.id} biome={world?.biome} size={32} />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[11px] font-bold leading-tight ${locked ? 'text-white/25' : 'text-white/85'}`}>
                    {building.name}
                  </div>
                  <div className={`mt-0.5 truncate text-[9px] font-medium leading-tight ${locked ? 'text-white/20' : 'text-white/50'}`}>
                    {keyStat(building)}
                  </div>
                </div>
                <span className="shrink-0 text-[7px] uppercase tracking-wide text-white/30">T{building.tier}</span>
              </div>

              {/* Cost + size row */}
              <div className={`flex items-center justify-between px-2 pb-1.5 ${locked ? 'opacity-30' : ''}`}>
                <CostLine comboCost={building.comboCost} materials={building.materials} />
                <span className="text-[8px] text-white/25">{building.width}&times;{building.height}</span>
              </div>

              {/* Flower variant picker */}
              {selected && building.id === 'flower_bed' && (
                <div className="px-2 pb-1.5 flex items-center gap-1">
                  <span className="text-[8px] text-white/35 mr-0.5">Color:</span>
                  {FLOWER_VARIANTS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelect(building.id, v.id); }}
                      className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
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
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                  <span className="text-[9px] font-semibold text-white/40">Need {building.tierUnlockPopulation} pop</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

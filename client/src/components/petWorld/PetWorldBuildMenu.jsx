import React from 'react';
import { getBuildingUi } from './petWorldBuildings';

function formatMaterialList(materials = {}) {
  const parts = Object.entries(materials)
    .filter(([, amount]) => amount > 0)
    .map(([key, amount]) => `${amount} ${key}`);
  return parts.length ? parts.join(' • ') : 'No materials';
}

export default function PetWorldBuildMenu({
  open,
  buildings = [],
  world,
  selectedType,
  onSelect,
  onClose,
}) {
  if (!open) return null;
  return (
    <div className="rounded-[1.3rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,12,18,0.96))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Build Menu</div>
          <div className="text-lg font-black text-white">Choose a structure</div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-white/20 hover:text-white">
          Close
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {buildings.map((building) => {
          const ui = getBuildingUi(building.id);
          const locked = (world?.population || 0) < (building.tierUnlockPopulation || 0);
          const selected = selectedType === building.id;
          return (
            <button
              key={building.id}
              type="button"
              onClick={() => !locked && onSelect(building.id)}
              className={`rounded-2xl border p-3 text-left transition-all ${
                selected
                  ? 'border-emerald-300/40 bg-emerald-500/[0.14]'
                  : locked
                    ? 'border-white/[0.05] bg-white/[0.02] text-white/35'
                    : 'border-white/[0.07] bg-white/[0.04] text-white/80 hover:border-white/16 hover:bg-white/[0.06]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-lg">
                  {ui.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-bold">{building.name}</div>
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.16em] text-white/55">
                      Tier {building.tier}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/55">{building.description}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/55">
                    <span>{building.comboCost} combos</span>
                    <span>{building.width}x{building.height}</span>
                    <span>{building.buildMinutes}m</span>
                  </div>
                  <div className="mt-1 text-[10px] text-white/40">{formatMaterialList(building.materials)}</div>
                  {locked ? (
                    <div className="mt-2 text-[10px] font-semibold text-rose-300/80">
                      Unlocks at population {building.tierUnlockPopulation}
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import React from 'react';
import { getBuildingUi } from './petWorldBuildings';

function ActionButton({ children, onClick, disabled, tone = 'default' }) {
  const tones = {
    default: 'border-white/10 bg-white/[0.05] text-white/80 hover:border-white/20 hover:text-white',
    danger: 'border-rose-400/20 bg-rose-500/[0.12] text-rose-100 hover:bg-rose-500/[0.18]',
    good: 'border-emerald-400/20 bg-emerald-500/[0.12] text-emerald-100 hover:bg-emerald-500/[0.18]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone] || tones.default}`}
    >
      {children}
    </button>
  );
}

export default function PetWorldBuildingInfo({
  building,
  readonly = false,
  world,
  onDemolish,
  onUpgrade,
  onSetWorkers,
}) {
  if (!building) return null;
  const ui = getBuildingUi(building.type);
  return (
    <aside className="rounded-[1.3rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,28,0.96),rgba(9,12,18,0.94))] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.24)]">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xl">
          {ui.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Selected Building</div>
          <div className="mt-1 text-lg font-black text-white">{building.name}</div>
          <div className="mt-1 text-sm text-white/55">{building.description}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-white/80">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">Level</div>
          <div className="mt-1 font-black">{building.level}</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">Workers</div>
          <div className="mt-1 font-black">{building.workers}/{building.max_workers}</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">Footprint</div>
          <div className="mt-1 font-black">{building.width}x{building.height}</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">State</div>
          <div className="mt-1 font-black capitalize">{building.state}</div>
        </div>
      </div>

      {!readonly && building.max_workers > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/45">Workers</div>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].filter((count) => count <= building.max_workers).map((count) => (
              <ActionButton
                key={count}
                onClick={() => onSetWorkers?.(count)}
                disabled={count === building.workers || count > (world?.available_workers || 0) + building.workers}
                tone={count === building.workers ? 'good' : 'default'}
              >
                {count === 0 ? 'Unassign' : `${count} worker${count > 1 ? 's' : ''}`}
              </ActionButton>
            ))}
          </div>
        </div>
      ) : null}

      {!readonly ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton onClick={onUpgrade} disabled={!building.can_upgrade || building.state !== 'built'} tone="good">
            Upgrade
          </ActionButton>
          <ActionButton onClick={onDemolish} tone="danger">
            Demolish
          </ActionButton>
        </div>
      ) : null}
    </aside>
  );
}

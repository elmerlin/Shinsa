import React, { useState } from 'react';
import { getBuildingUi } from './petWorldBuildings';
import { RESOURCE_ICONS as RES_ICONS, productionRate, formatMaterials, buildTimeRemaining } from './petWorldUtils';

function Btn({ children, onClick, disabled, tone = 'default', className = '' }) {
  const tones = {
    default: 'border-white/10 bg-white/[0.05] text-white/80 hover:border-white/20 hover:text-white',
    danger:  'border-rose-400/20 bg-rose-500/[0.12] text-rose-100 hover:bg-rose-500/[0.2]',
    good:    'border-emerald-400/20 bg-emerald-500/[0.12] text-emerald-100 hover:bg-emerald-500/[0.2]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone] || tones.default} ${className}`}
    >
      {children}
    </button>
  );
}

function Stat({ label, children }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.025] px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className="mt-px font-bold text-[12px] text-white/80">{children}</div>
    </div>
  );
}

// productionRate, formatMaterials, buildTimeRemaining imported from petWorldUtils

export default function PetWorldBuildingInfo({
  building,
  buildingDef,
  readonly = false,
  ownerName,
  world,
  onClose,
  onDemolish,
  onUpgrade,
  onSetWorkers,
}) {
  const [confirmDemolish, setConfirmDemolish] = useState(false);

  if (!building) return null;

  const ui = getBuildingUi(building.type);
  const prod = productionRate(building);
  const minsLeft = buildTimeRemaining(building);
  const isBuilding = building.state === 'building';
  const level = building.level || 1;
  const maxLevel = buildingDef?.maxLevel || 5;
  const canUpgrade = building.can_upgrade && !isBuilding && level < maxLevel;
  const upgradeCost = buildingDef?.upgradeCosts?.[level];
  const isStarter = building.is_starter;

  // Next-level / next-worker projections
  const nextLevelProd = prod && building.production
    ? (() => {
        const [res, base] = Object.entries(building.production)[0] || [];
        if (!res) return null;
        const nextRate = base * (level + 1) * Math.max(building.workers || 0, 0.25);
        return { resource: res, rate: Math.round(nextRate * 100) / 100 };
      })()
    : null;

  const nextWorkerProd = prod && building.production && building.workers < building.max_workers
    ? (() => {
        const [res, base] = Object.entries(building.production)[0] || [];
        if (!res) return null;
        const nextRate = base * level * (building.workers + 1);
        return { resource: res, rate: Math.round(nextRate * 100) / 100 };
      })()
    : null;

  // Refund estimate (50% of original cost)
  const refundCombo = buildingDef ? Math.floor((buildingDef.comboCost || 0) * 0.5) : 0;
  const refundMats = buildingDef?.materials
    ? Object.fromEntries(Object.entries(buildingDef.materials).map(([k, v]) => [k, Math.floor(v * 0.5)]))
    : {};

  function handleDemolish() {
    if (!confirmDemolish) {
      setConfirmDemolish(true);
      return;
    }
    setConfirmDemolish(false);
    onDemolish?.();
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-lg">
          {ui.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-black text-white">{building.name}</h3>
            <span className="shrink-0 rounded bg-white/[0.07] px-1 py-px text-[9px] font-bold text-white/50">Lv.{level}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/35">
            <span>{ui.category}</span>
            <span className="rounded bg-white/[0.05] px-1 py-px text-[7px] uppercase tracking-[0.08em]">T{building.tier || buildingDef?.tier || 1}</span>
          </div>
        </div>
      </div>

      {/* Readonly visitor note */}
      {readonly && ownerName && (
        <div className="mt-2 rounded-lg border border-white/[0.05] bg-white/[0.025] px-2.5 py-1.5 text-[11px] text-white/45">
          This is {ownerName}&apos;s building
        </div>
      )}

      {/* Stats grid */}
      <div className="mt-2 grid grid-cols-3 gap-1">
        {prod && (
          <Stat label="Output">
            {RES_ICONS[prod.resource] || prod.resource} {prod.rate}/hr
          </Stat>
        )}
        <Stat label="Workers">
          {building.workers}/{building.max_workers}
        </Stat>
        <Stat label="Size">
          {building.width}&times;{building.height}
        </Stat>
        <Stat label="State">
          {isBuilding ? (
            <span className="text-amber-300">
              Building{minsLeft != null && <span className="ml-0.5 text-white/40 text-[10px]">{minsLeft}m</span>}
            </span>
          ) : (
            <span className="text-emerald-300">Built</span>
          )}
        </Stat>
      </div>

      {/* Building progress bar */}
      {isBuilding && minsLeft != null && buildingDef?.buildMinutes && (
        <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-400/60 transition-all"
            style={{ width: `${Math.max(2, Math.min(100, ((buildingDef.buildMinutes - minsLeft) / buildingDef.buildMinutes) * 100))}%` }}
          />
        </div>
      )}

      {/* Special building abilities */}
      {building.type === 'watchtower' && (
        <div className="mt-2 rounded-lg border border-amber-400/8 bg-amber-500/[0.05] px-2 py-1.5 text-[10px] text-amber-200/75">
          <span className="font-bold">Wildlife Defense</span> -- Hunt success: {Math.min(95, 60 + (level - 1) * 15)}%
        </div>
      )}
      {building.type === 'shrine' && (
        <div className="mt-2 rounded-lg border border-violet-400/8 bg-violet-500/[0.05] px-2 py-1.5 text-[10px] text-violet-200/75">
          <span className="font-bold">Breeding Boost</span> -- Reduces interval from 24h to 16h.
        </div>
      )}
      {building.type === 'market' && (
        <div className="mt-2 rounded-lg border border-cyan-400/8 bg-cyan-500/[0.05] px-2 py-1.5 text-[10px] text-cyan-200/75">
          <span className="font-bold">Trading Unlocked</span> -- Both players need a Market.
        </div>
      )}
      {building.type === 'trading_post' && (
        <div className="mt-2 rounded-lg border border-yellow-400/8 bg-yellow-500/[0.05] px-2 py-1.5 text-[10px] text-yellow-200/75">
          <span className="font-bold">Combo Converter</span> -- Converts combos into gold each tick.
        </div>
      )}

      {/* Production projections */}
      {prod && !readonly && (nextWorkerProd || (nextLevelProd && level < maxLevel)) && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/35">
          {nextWorkerProd && (
            <span><span className="text-emerald-300/60">+{Math.round((nextWorkerProd.rate - prod.rate) * 100) / 100}/hr</span> w/ +1 worker</span>
          )}
          {nextLevelProd && level < maxLevel && (
            <span>Lv.{level + 1}: <span className="text-white/50">{nextLevelProd.rate}/hr</span></span>
          )}
        </div>
      )}

      {/* Worker assignment + Upgrade + Demolish -- compact action row */}
      {!readonly && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/[0.05] pt-2.5">
          {/* Worker controls inline */}
          {building.max_workers > 0 && (
            <div className="flex items-center gap-1 mr-auto">
              <Btn
                onClick={() => onSetWorkers?.(Math.max(0, building.workers - 1))}
                disabled={building.workers <= 0}
              >
                &minus;
              </Btn>
              <span className="w-6 text-center text-[11px] font-bold text-white tabular-nums">{building.workers}</span>
              <Btn
                onClick={() => onSetWorkers?.(building.workers + 1)}
                disabled={building.workers >= building.max_workers || building.workers >= (world?.available_workers || 0) + building.workers}
              >
                +
              </Btn>
              <span className="text-[8px] text-white/30">/{building.max_workers}</span>
            </div>
          )}
          <Btn
            onClick={onUpgrade}
            disabled={!canUpgrade}
            tone="good"
          >
            {level >= maxLevel ? 'Max' : `Upgrade`}
          </Btn>
          <Btn
            onClick={handleDemolish}
            tone="danger"
            className={confirmDemolish ? 'animate-pulse' : ''}
          >
            {confirmDemolish ? 'Confirm?' : 'Demolish'}
          </Btn>
        </div>
      )}

      {/* Cost / refund hints */}
      {!readonly && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-[9px] text-white/30">
          {upgradeCost && level < maxLevel && (
            <span>Upgrade: {upgradeCost.comboCost || 0}c{upgradeCost.materials ? ` + ${formatMaterials(upgradeCost.materials)}` : ''}</span>
          )}
          {!canUpgrade && level < maxLevel && !isBuilding && (
            <span className="text-rose-300/50">Not enough resources</span>
          )}
          {isStarter ? (
            <span>Starter -- no refund</span>
          ) : refundCombo > 0 || Object.values(refundMats).some((v) => v > 0) ? (
            <span>Refund: {refundCombo}c{Object.keys(refundMats).length ? ` + ${formatMaterials(refundMats)}` : ''}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

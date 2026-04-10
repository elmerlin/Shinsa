import React, { useState } from 'react';
import { getBuildingUi } from './petWorldBuildings';

const RES_ICONS = { food: '\uD83C\uDF3E', wood: '\uD83E\uDEB5', stone: '\uD83E\uDEA8', cloth: '\uD83E\uDDF5', gold: '\uD83E\uDE99' };

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
      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone] || tones.default} ${className}`}
    >
      {children}
    </button>
  );
}

function StatCell({ label, children }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</div>
      <div className="mt-0.5 font-bold text-sm text-white/85">{children}</div>
    </div>
  );
}

function productionRate(building) {
  if (!building.production) return null;
  const [res, base] = Object.entries(building.production)[0] || [];
  if (!res) return null;
  const rate = base * (building.level || 1) * Math.max(building.workers || 0, 0.25);
  return { resource: res, rate: Math.round(rate * 100) / 100 };
}

function formatMaterials(mats = {}) {
  return Object.entries(mats)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${RES_ICONS[k] || k}`)
    .join(' + ');
}

function buildTimeRemaining(building) {
  if (building.state !== 'building' || !building.build_finish_at) return null;
  const remaining = Math.max(0, new Date(building.build_finish_at).getTime() - Date.now());
  const mins = Math.ceil(remaining / 60000);
  return mins;
}

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
    <aside className="rounded-[1.3rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,28,0.96),rgba(9,12,18,0.94))] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.24)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xl">
            {ui.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-lg font-black text-white">{building.name}</h3>
              <span className="shrink-0 rounded-lg bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold text-white/60">
                Lv.{level}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/40">
              <span>{ui.category}</span>
              <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[8px] uppercase tracking-[0.1em]">Tier {building.tier || buildingDef?.tier || 1}</span>
            </div>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-sm text-white/60 hover:border-white/20 hover:text-white">&times;</button>
        )}
      </div>

      {/* Readonly visitor note */}
      {readonly && ownerName && (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-white/50">
          This is {ownerName}&apos;s building
        </div>
      )}

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-sm text-white/80">
        {prod && (
          <StatCell label="Output">
            {RES_ICONS[prod.resource] || prod.resource} {prod.rate}/hr
          </StatCell>
        )}
        <StatCell label="Workers">
          {building.workers}/{building.max_workers}
        </StatCell>
        <StatCell label="Footprint">
          {building.width}&times;{building.height}
        </StatCell>
        <StatCell label="State">
          {isBuilding ? (
            <div>
              <span className="text-amber-300">Building</span>
              {minsLeft != null && <span className="ml-1 text-white/45">{minsLeft}m left</span>}
            </div>
          ) : (
            <span className="text-emerald-300">Built</span>
          )}
        </StatCell>
      </div>

      {/* Building progress bar */}
      {isBuilding && minsLeft != null && buildingDef?.buildMinutes && (
        <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-400/60 transition-all"
            style={{ width: `${Math.max(2, Math.min(100, ((buildingDef.buildMinutes - minsLeft) / buildingDef.buildMinutes) * 100))}%` }}
          />
        </div>
      )}

      {/* Special building abilities */}
      {building.type === 'watchtower' && (
        <div className="mt-3 rounded-xl border border-amber-400/10 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/80">
          <div className="font-bold text-amber-200">Wildlife Defense</div>
          <div className="mt-0.5 text-[10px] text-white/50">
            Enables hunting encounters. Higher level = better success rate.
            Hunt success: {Math.min(95, 60 + (level - 1) * 15)}%
          </div>
        </div>
      )}
      {building.type === 'shrine' && (
        <div className="mt-3 rounded-xl border border-violet-400/10 bg-violet-500/[0.06] px-3 py-2 text-xs text-violet-200/80">
          <div className="font-bold text-violet-200">Breeding Boost</div>
          <div className="mt-0.5 text-[10px] text-white/50">Reduces breeding check interval from 24h to 16h.</div>
        </div>
      )}
      {building.type === 'market' && (
        <div className="mt-3 rounded-xl border border-cyan-400/10 bg-cyan-500/[0.06] px-3 py-2 text-xs text-cyan-200/80">
          <div className="font-bold text-cyan-200">Trading Unlocked</div>
          <div className="mt-0.5 text-[10px] text-white/50">Both players need a Market to trade resources.</div>
        </div>
      )}
      {building.type === 'trading_post' && (
        <div className="mt-3 rounded-xl border border-yellow-400/10 bg-yellow-500/[0.06] px-3 py-2 text-xs text-yellow-200/80">
          <div className="font-bold text-yellow-200">Combo Converter</div>
          <div className="mt-0.5 text-[10px] text-white/50">Converts your accumulated combos into gold each sim tick. Workers increase throughput.</div>
        </div>
      )}

      {/* Production projections */}
      {prod && !readonly && (
        <div className="mt-3 space-y-1">
          {nextWorkerProd && (
            <div className="text-[11px] text-white/40">
              <span className="text-emerald-300/70">+{Math.round((nextWorkerProd.rate - prod.rate) * 100) / 100}/hr</span> with 1 more worker
            </div>
          )}
          {nextLevelProd && level < maxLevel && (
            <div className="text-[11px] text-white/40">
              Lv.{level + 1}: <span className="text-white/60">{nextLevelProd.rate}/hr {RES_ICONS[nextLevelProd.resource] || nextLevelProd.resource}</span>
            </div>
          )}
        </div>
      )}

      {/* Worker assignment */}
      {!readonly && building.max_workers > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/40">Assign Workers</div>
          <div className="flex items-center gap-1.5">
            <Btn
              onClick={() => onSetWorkers?.(Math.max(0, building.workers - 1))}
              disabled={building.workers <= 0}
            >
              &minus;
            </Btn>
            <span className="w-10 text-center text-sm font-bold text-white">{building.workers}</span>
            <Btn
              onClick={() => onSetWorkers?.(building.workers + 1)}
              disabled={building.workers >= building.max_workers || building.workers >= (world?.available_workers || 0) + building.workers}
            >
              +
            </Btn>
            <span className="ml-1 text-[10px] text-white/35">/ {building.max_workers} max</span>
          </div>
        </div>
      )}

      {/* Upgrade section */}
      {!readonly && (
        <div className="mt-3">
          <Btn
            onClick={onUpgrade}
            disabled={!canUpgrade}
            tone="good"
            className="w-full"
          >
            {level >= maxLevel ? 'Max Level' : `Upgrade to Level ${level + 1}`}
          </Btn>
          {upgradeCost && level < maxLevel && (
            <div className="mt-1.5 text-[10px] text-white/40">
              Cost: {upgradeCost.comboCost || 0}c{upgradeCost.materials ? ` + ${formatMaterials(upgradeCost.materials)}` : ''}
            </div>
          )}
          {upgradeCost && nextLevelProd && prod && level < maxLevel && (
            <div className="mt-0.5 text-[10px] text-emerald-300/50">
              +{Math.round((nextLevelProd.rate - prod.rate) * 100) / 100} {prod.resource}/hr, +{upgradeCost.workerSlots || 1} worker slot
            </div>
          )}
          {!canUpgrade && level < maxLevel && !isBuilding && (
            <div className="mt-1 text-[10px] text-rose-300/60">Not enough resources to upgrade</div>
          )}
        </div>
      )}

      {/* Demolish section */}
      {!readonly && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <Btn
            onClick={handleDemolish}
            tone="danger"
            className={confirmDemolish ? 'w-full animate-pulse' : 'w-full'}
          >
            {confirmDemolish ? 'Are you sure? Click to confirm' : 'Demolish'}
          </Btn>
          {isStarter ? (
            <div className="mt-1 text-[10px] text-white/35">Starter building -- no refund</div>
          ) : refundCombo > 0 || Object.values(refundMats).some((v) => v > 0) ? (
            <div className="mt-1 text-[10px] text-white/35">
              Refund: {refundCombo}c{Object.keys(refundMats).length ? ` + ${formatMaterials(refundMats)}` : ''}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}

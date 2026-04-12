import React, { useState } from 'react';
import { getBuildingUi } from './petWorldBuildings';
import { RESOURCE_ICONS as RES_ICONS, productionRate, formatMaterials, buildTimeRemaining } from './petWorldUtils';
import PetWorldSpriteThumbnail from './PetWorldSpriteThumbnail';
import './petWorldCfUi.css';

function Btn({ children, onClick, disabled, tone = 'default', className = '' }) {
  const toneClass = {
    default: 'cf-btn cf-btn-brown',
    danger:  'cf-btn cf-btn-red',
    good:    'cf-btn cf-btn-green',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${toneClass[tone] || toneClass.default} ${className}`}
      style={{ padding: '5px 10px', fontSize: 11 }}
    >
      {children}
    </button>
  );
}

function Stat({ label, children }) {
  return (
    <div className="cf-inset" style={{ padding: '8px 10px' }}>
      <div className="cf-text-label">{label}</div>
      <div className="cf-text mt-1 text-[12px] font-bold">{children}</div>
    </div>
  );
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
  const previewBiome = world?.biome || 'grasslands';
  const categoryLabel = ui.category || 'Village';
  const tierLabel = `T${building.tier || buildingDef?.tier || 1}`;
  const statusLabel = isBuilding ? `Building${minsLeft != null ? ` · ${minsLeft}m` : ''}` : 'Settled';
  const summaryCopy = buildingDef?.description
    || building.description
    || (prod ? `Produces ${RES_ICONS[prod.resource] || prod.resource} over time.` : 'A village structure with its own role in the settlement.');

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
    <div className="space-y-3">
      <div className="cf-inset" style={{ padding: 12 }}>
        <div className="flex items-start gap-3">
          <span className="cf-inset flex h-14 w-14 shrink-0 items-center justify-center">
            <PetWorldSpriteThumbnail type={building.type} biome={previewBiome} size={48} className="block" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="cf-text cf-heading min-w-0 flex-1 truncate text-[15px] font-black">{building.name}</h3>
              <span className="cf-pill" style={{ fontSize: 9, padding: '1px 8px' }}>Lv.{level}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="cf-pill cf-pill-accent" style={{ fontSize: 9, padding: '1px 8px' }}>
                {categoryLabel}
              </span>
              <span className="cf-pill" style={{ fontSize: 9, padding: '1px 8px' }}>{tierLabel}</span>
              <span className="cf-pill" style={{ fontSize: 9, padding: '1px 8px' }}>{statusLabel}</span>
            </div>
            <p className="cf-text-muted mt-2 text-[11px] leading-relaxed">
              {summaryCopy}
            </p>
          </div>
        </div>

        {readonly && ownerName && (
          <div className="cf-inset-light mt-3" style={{ padding: '8px 10px', fontSize: 11, color: '#2a5a3a' }}>
            Part of {ownerName}&apos;s village.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
          {isBuilding ? <span style={{ color: '#c48820' }}>Building</span> : <span style={{ color: '#3d8b3d' }}>Built</span>}
        </Stat>
      </div>

      {isBuilding && minsLeft != null && buildingDef?.buildMinutes && (
        <div className="cf-bar-track">
          <div
            className="cf-bar-fill cf-bar-fill-amber"
            style={{ width: `${Math.max(2, Math.min(100, ((buildingDef.buildMinutes - minsLeft) / buildingDef.buildMinutes) * 100))}%` }}
          />
        </div>
      )}

      {building.type === 'watchtower' && (
        <div className="cf-inset-light" style={{ padding: '6px 8px', fontSize: 10, color: '#7a5a10' }}>
          <span style={{ fontWeight: 700 }}>Wildlife Defense</span> · Hunt success {Math.min(95, 60 + (level - 1) * 15)}%
        </div>
      )}
      {building.type === 'shrine' && (
        <div className="cf-inset-light" style={{ padding: '6px 8px', fontSize: 10, color: '#5a3a8a' }}>
          <span style={{ fontWeight: 700 }}>Breeding Boost</span> · Reduces interval from 24h to 16h.
        </div>
      )}
      {building.type === 'market' && (
        <div className="cf-inset-light" style={{ padding: '6px 8px', fontSize: 10, color: '#2a6a7a' }}>
          <span style={{ fontWeight: 700 }}>Trading Unlocked</span> · Both players need a Market.
        </div>
      )}
      {building.type === 'trading_post' && (
        <div className="cf-inset-light" style={{ padding: '6px 8px', fontSize: 10, color: '#8a6a10' }}>
          <span style={{ fontWeight: 700 }}>Combo Converter</span> · Converts combos into gold each tick.
        </div>
      )}

      {prod && !readonly && (nextWorkerProd || (nextLevelProd && level < maxLevel)) && (
        <div className="cf-text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
          {nextWorkerProd && (
            <span><span style={{ color: '#3d8b3d' }}>+{Math.round((nextWorkerProd.rate - prod.rate) * 100) / 100}/hr</span> with +1 worker</span>
          )}
          {nextLevelProd && level < maxLevel && (
            <span>Lv.{level + 1}: <span className="cf-text">{nextLevelProd.rate}/hr</span></span>
          )}
        </div>
      )}

      {!readonly && (
        <div className="cf-inset" style={{ padding: '8px 12px' }}>
          <div className="flex flex-wrap items-center gap-1.5">
          {building.max_workers > 0 && (
              <div className="mr-auto flex items-center gap-1">
              <Btn
                onClick={() => onSetWorkers?.(Math.max(0, building.workers - 1))}
                disabled={building.workers <= 0}
              >
                &minus;
              </Btn>
              <span className="cf-text w-6 text-center text-[11px] font-bold tabular-nums">{building.workers}</span>
              <Btn
                onClick={() => onSetWorkers?.(building.workers + 1)}
                disabled={building.workers >= building.max_workers || building.workers >= (world?.available_workers || 0) + building.workers}
              >
                +
              </Btn>
              <span className="cf-text-muted text-[8px]">/{building.max_workers}</span>
            </div>
          )}
            <Btn
              onClick={onUpgrade}
              disabled={!canUpgrade}
              tone="good"
            >
              {level >= maxLevel ? 'Max' : 'Upgrade'}
            </Btn>
            <Btn
              onClick={handleDemolish}
              tone="danger"
              className={confirmDemolish ? 'animate-pulse motion-reduce:animate-none' : ''}
            >
              {confirmDemolish ? 'Confirm?' : 'Demolish'}
            </Btn>
          </div>
        </div>
      )}

      {!readonly && (
        <div className="cf-text-muted flex flex-wrap gap-x-3 text-[9px]">
          {upgradeCost && level < maxLevel && (
            <span>Upgrade: {upgradeCost.comboCost || 0}c{upgradeCost.materials ? ` + ${formatMaterials(upgradeCost.materials)}` : ''}</span>
          )}
          {!canUpgrade && level < maxLevel && !isBuilding && (
            <span style={{ color: '#a83030' }}>Not enough resources</span>
          )}
          {isStarter ? (
            <span>Starter · no refund</span>
          ) : refundCombo > 0 || Object.values(refundMats).some((v) => v > 0) ? (
            <span>Refund: {refundCombo}c{Object.keys(refundMats).length ? ` + ${formatMaterials(refundMats)}` : ''}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

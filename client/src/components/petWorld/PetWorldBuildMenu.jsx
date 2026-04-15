import React, { useState } from 'react';
import { getBuildingUi } from './petWorldBuildings';
import { RESOURCE_ICONS as RES_ICONS } from './petWorldUtils';
import PetWorldSpriteThumbnail from './PetWorldSpriteThumbnail';
import './petWorldCfUi.css';

const CATEGORIES = ['All', 'Terraform', 'Food', 'Wood', 'Stone', 'Cloth', 'Gold', 'Housing', 'Support', 'Storage', 'Cosmetic', 'Trade'];

const FLOWER_VARIANTS = [
  { id: 'pink', label: 'Pink', color: '#e060a0' },
  { id: 'yellow', label: 'Yellow', color: '#e0e040' },
  { id: 'blue', label: 'Blue', color: '#4080e0' },
  { id: 'red', label: 'Red', color: '#e04040' },
];

const PATH_VARIANTS = [
  { id: 'dirt', label: 'Dust', icon: '/pet-world/cute-fantasy/Tiles/wang_dirt_grass.png', sx: '-32px', sy: '-16px' },
  { id: 'stone', label: 'Pavement', icon: '/pet-world/cute-fantasy/Tiles/wang_grass_path.png', sx: '-32px', sy: '-16px' },
];

function PathVariantSwatch({ variant, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex h-6 items-center gap-1 rounded-sm px-1 text-[8px] font-bold transition-all motion-reduce:transition-none ${
        selected ? 'cf-select-ring' : ''
      }`}
      style={{
        background: 'rgba(232,200,138,0.55)',
        border: selected ? '2px solid #8b5e2b' : '2px solid rgba(139,94,43,0.3)',
        color: '#5a3a18',
      }}
      title={variant.label}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 16,
          height: 16,
          backgroundImage: `url(${variant.icon})`,
          backgroundPosition: `${variant.sx} ${variant.sy}`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          borderRadius: 2,
        }}
      />
      {variant.label}
    </button>
  );
}

// Terraform / bridge actions -- these are not real buildings but live in the
// build menu so the player finds land-shaping tools next to their miniatures.
const TERRAFORM_ITEMS = [
  {
    id: 'fill',
    name: 'Add Land',
    description: 'Fill water to grow your island',
    icon: '/pet-world/cute-fantasy/Tiles/Cliff/Cliff_Tile.png',
    comboCost: 15,
    materials: { stone: 2 },
  },
  {
    id: 'dig',
    name: 'Dig Water',
    description: 'Carve a pond or channel out of land',
    icon: '/pet-world/cute-fantasy/Tiles/Water/Water_Middle.png',
    comboCost: 10,
    materials: {},
  },
  {
    id: 'bridge_wood',
    name: 'Wood Bridge',
    description: 'A light wooden crossing over water',
    icon: '/pet-world/cute-fantasy/Tiles/Bridge/Bridge_Wood_1.png',
    comboCost: 8,
    materials: { wood: 3 },
  },
  {
    id: 'bridge_stone',
    name: 'Stone Bridge',
    description: 'A sturdy stone crossing over water',
    icon: '/pet-world/cute-fantasy/Tiles/Bridge/Bridge_Stone_Horizontal.png',
    comboCost: 12,
    materials: { stone: 3 },
  },
];

function TerraformThumb({ icon, size = 34 }) {
  return (
    <img
      src={icon}
      alt=""
      width={size}
      height={size}
      style={{
        imageRendering: 'pixelated',
        objectFit: 'contain',
        width: size,
        height: size,
      }}
    />
  );
}

function CostLine({ comboCost, materials = {} }) {
  const mats = Object.entries(materials).filter(([, v]) => v > 0);
  return (
    <span className="flex flex-wrap items-center gap-0.5" style={{ fontSize: 9, color: '#6b4420' }}>
      <span style={{ fontWeight: 700 }}>{comboCost}c</span>
      {mats.map(([key, amt]) => (
        <span key={key} className="cf-inset-light" style={{ display: 'inline-flex', alignItems: 'center', gap: 1, padding: '1px 4px', fontSize: 9 }}>
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
  terraformMode,
  layout = 'browse',
  onSelect,
  onSelectTerraform,
  onClose,
}) {
  const [cat, setCat] = useState('All');

  if (!open) return null;

  const isTerraformCat = cat === 'Terraform';
  const filtered = cat === 'All'
    ? buildings
    : isTerraformCat
      ? []
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
            className={`cf-btn shrink-0 ${cat === c ? 'cf-btn-orange' : 'cf-btn-ghost'}`}
            style={{ padding: '4px 10px', fontSize: 9, fontWeight: 700 }}
          >
            {c}
          </button>
        ))}
      </div>

      {isTerraformCat && (
        <div className={`grid ${gridCols} gap-1.5`} style={{ touchAction: 'pan-y' }}>
          {TERRAFORM_ITEMS.map((item) => {
            const selected = terraformMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTerraform && onSelectTerraform(item.id)}
                className={`cf-inset relative text-left transition-all motion-reduce:transition-none ${
                  selected ? 'cf-select-ring' : ''
                }`}
                style={{ borderRadius: 4 }}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <span className="cf-inset flex h-10 w-10 shrink-0 items-center justify-center">
                    <TerraformThumb icon={item.icon} size={34} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="cf-text truncate text-[11px] font-bold leading-tight">
                      {item.name}
                    </div>
                    <div className="cf-text-muted mt-0.5 truncate text-[9px] font-medium leading-tight">
                      {item.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-2.5 pb-2">
                  <CostLine comboCost={item.comboCost} materials={item.materials} />
                  <span className="cf-text-muted text-[8px]">1&times;1</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {!isTerraformCat && isPeek && (
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
                className={`cf-inset relative flex min-w-[148px] shrink-0 items-center gap-2 px-2.5 py-2 text-left transition-all motion-reduce:transition-none ${
                  selected ? 'cf-select-ring' : ''
                }`}
                style={{ opacity: locked ? 0.45 : 1 }}
              >
                <span className="cf-inset flex h-10 w-10 shrink-0 items-center justify-center">
                  <PetWorldSpriteThumbnail type={building.id} biome={world?.biome} size={34} className="block" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="cf-text block truncate text-[11px] font-bold">{building.name}</span>
                  <span className="cf-text-muted mt-0.5 block truncate text-[9px]">{keyStat(building)}</span>
                  <span className="cf-text-muted mt-1 block text-[8px]">{building.comboCost}c</span>
                </span>
                <span className="cf-pill" style={{ fontSize: 7, padding: '1px 6px' }}>
                  T{building.tier}
                </span>
                {locked && (
                  <span className="absolute inset-x-2 bottom-1.5 rounded text-center text-[8px] font-semibold cf-text-muted"
                    style={{ background: 'rgba(232,200,138,0.8)', padding: '2px 6px' }}>
                    Need {building.tierUnlockPopulation} pop
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {!isTerraformCat && !isPeek && (
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
                className={`cf-inset relative text-left transition-all motion-reduce:transition-none ${
                  selected ? 'cf-select-ring' : ''
                }`}
                style={{ opacity: locked ? 0.45 : 1, borderRadius: 4 }}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <span className="cf-inset flex h-10 w-10 shrink-0 items-center justify-center">
                    <PetWorldSpriteThumbnail type={building.id} biome={world?.biome} size={34} className="block" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="cf-text truncate text-[11px] font-bold leading-tight">
                      {building.name}
                    </div>
                    <div className="cf-text-muted mt-0.5 truncate text-[9px] font-medium leading-tight">
                      {keyStat(building)}
                    </div>
                  </div>
                  <span className="cf-text-label shrink-0">T{building.tier}</span>
                </div>

                <div className="flex items-center justify-between px-2.5 pb-2">
                  <CostLine comboCost={building.comboCost} materials={building.materials} />
                  <span className="cf-text-muted text-[8px]">{building.width}&times;{building.height}</span>
                </div>

                {selected && building.id === 'flower_bed' && (
                  <div className="flex items-center gap-1 px-2.5 pb-2">
                    <span className="cf-text-muted mr-0.5 text-[8px]">Color:</span>
                    {FLOWER_VARIANTS.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSelect(building.id, v.id); }}
                        className={`h-3.5 w-3.5 rounded-full transition-all motion-reduce:transition-none ${
                          selectedVariant === v.id ? 'scale-110' : ''
                        }`}
                        style={{
                          backgroundColor: v.color,
                          border: selectedVariant === v.id ? '2px solid #8b5e2b' : '2px solid rgba(139,94,43,0.3)',
                        }}
                        title={v.label}
                      />
                    ))}
                  </div>
                )}

                {selected && building.id === 'path' && (
                  <div className="flex items-center gap-1.5 px-2.5 pb-2">
                    <span className="cf-text-muted mr-0.5 text-[8px]">Style:</span>
                    {PATH_VARIANTS.map((v) => (
                      <PathVariantSwatch
                        key={v.id}
                        variant={v}
                        selected={(selectedVariant || 'dirt') === v.id}
                        onClick={() => onSelect(building.id, v.id)}
                      />
                    ))}
                  </div>
                )}

                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(232,200,138,0.6)', borderRadius: 4 }}>
                    <span className="cf-text text-[9px] font-semibold">Need {building.tierUnlockPopulation} pop</span>
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

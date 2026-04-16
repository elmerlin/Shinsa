import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import piuAvatarCatalog from '../data/piuAvatarCatalog.json';

const TOTAL_SUPPLY_DEFAULT = 1000;
const SOURCE_URL = 'https://piugame.com/my_page/avatar_shop.php';

const CUSTOM_HEROES = [
  {
    id: 'hero-dojocat',
    name: 'Dojocat',
    preview: '/piumon/dojocat-reference.jpeg',
    source: 'Custom Hero',
    sourceNote: 'Approved Shinsa hero reference · exact source preview',
    generationStatus: 'Ready',
    weight: 12,
    lockedName: true,
    characterGroups: ['Dojocat'],
  },
  {
    id: 'hero-buu',
    name: 'Buu',
    preview: '/pet-world/heroes/buu/base.png',
    source: 'Custom Hero',
    sourceNote: 'Approved Shinsa hero reference',
    generationStatus: 'Ready',
    weight: 12,
    lockedName: true,
    characterGroups: ['Buu'],
  },
  {
    id: 'hero-devit',
    name: 'Devit',
    preview: '/emojis/devit/idle.png',
    source: 'Custom Hero',
    sourceNote: 'Sticker / emoji source · curated clean reference',
    generationStatus: 'Curated',
    weight: 10,
    lockedName: true,
    characterGroups: ['Devit'],
  },
  {
    id: 'hero-pixiu',
    name: 'Pixiu',
    preview: '/emojis/dojocat_pixiu/dojocat-pixiu-traditional-10.png',
    source: 'Custom Hero',
    sourceNote: 'Sticker / emoji source · curated clean reference',
    generationStatus: 'Curated',
    weight: 10,
    lockedName: true,
    characterGroups: ['Pixiu'],
  },
];

const TRAIT_GROUPS = [
  {
    key: 'hat',
    title: 'Headwear',
    note: 'Keep hat anchors identical across every PixelLab generation so hats can swap cleanly.',
    items: [
      { id: 'hat-none', name: 'No Hat', weight: 18 },
      { id: 'hat-chicken', name: 'Chicken Cap', weight: 6 },
      { id: 'hat-crown', name: 'Arcade Crown', weight: 3 },
      { id: 'hat-beanie', name: 'Night Beanie', weight: 7 },
      { id: 'hat-visor', name: 'Step Visor', weight: 8 },
      { id: 'hat-horns', name: 'Chaos Horns', weight: 4 },
    ],
  },
  {
    key: 'eyewear',
    title: 'Eyewear',
    note: 'Eyewear should share one eye-line so glasses can be reused across all bases.',
    items: [
      { id: 'eye-none', name: 'No Eyewear', weight: 22 },
      { id: 'eye-round', name: 'Round Specs', weight: 8 },
      { id: 'eye-shades', name: 'Pixel Shades', weight: 5 },
      { id: 'eye-mono', name: 'Monocle', weight: 2 },
      { id: 'eye-star', name: 'Star Visor', weight: 3 },
    ],
  },
  {
    key: 'neck',
    title: 'Neckwear',
    note: 'Neck items should sit on one fixed neck line so medals and charms are truly reusable.',
    items: [
      { id: 'neck-none', name: 'No Necklace', weight: 14 },
      { id: 'neck-stomp', name: 'Stomp Medal', weight: 10 },
      { id: 'neck-luck', name: 'Lucky Charm', weight: 6 },
      { id: 'neck-crystal', name: 'Crystal Pendant', weight: 4 },
      { id: 'neck-scarf', name: 'Short Scarf', weight: 7 },
    ],
  },
  {
    key: 'outfit',
    title: 'Clothes',
    note: 'Every base should be generated in the same standing pose so outfits can be swapped without reposing.',
    items: [
      { id: 'outfit-tee', name: 'Plain Tee', weight: 14 },
      { id: 'outfit-hoodie', name: 'Arcade Hoodie', weight: 10 },
      { id: 'outfit-jacket', name: 'Street Jacket', weight: 8 },
      { id: 'outfit-robe', name: 'Elemental Robe', weight: 4 },
      { id: 'outfit-armor', name: 'Rhythm Armor', weight: 2 },
      { id: 'outfit-kimono', name: 'Festival Kimono', weight: 3 },
    ],
  },
];

const HABITATS = [
  {
    id: 'rock',
    name: 'Rock Habitat',
    weight: 7,
    accent: 'from-stone-300/30 via-stone-500/20 to-stone-900/70',
    border: 'border-stone-300/30',
    note: 'Craggy ground, broken monoliths, old ruin light.',
  },
  {
    id: 'fire',
    name: 'Fire Habitat',
    weight: 6,
    accent: 'from-orange-300/30 via-red-500/20 to-red-950/80',
    border: 'border-orange-300/30',
    note: 'Volcanic ash, ember lanterns, heat haze, molten cracks.',
  },
  {
    id: 'water',
    name: 'Water Habitat',
    weight: 8,
    accent: 'from-cyan-300/30 via-sky-500/20 to-blue-950/80',
    border: 'border-cyan-300/30',
    note: 'Lagoon blue, floating pads, stone piers, mist shadow.',
  },
  {
    id: 'ice',
    name: 'Ice Habitat',
    weight: 5,
    accent: 'from-sky-100/35 via-blue-200/20 to-slate-900/80',
    border: 'border-sky-200/30',
    note: 'Frost bloom, hard light, glassy snow, pale wind.',
  },
];

const ATTRIBUTE_AXES = [
  { id: 'speed', name: 'Speed', note: 'Explosive tempo and initiative.' },
  { id: 'stamina', name: 'Stamina', note: 'Long-form endurance and sustain.' },
  { id: 'tech', name: 'Tech', note: 'Control, precision, and difficult execution.' },
  { id: 'consistency', name: 'Consistency', note: 'Low-variance reliability over time.' },
  { id: 'level', name: 'Level', note: 'Overall class / combat rank.' },
];

const PIPELINE_STEPS = [
  {
    title: 'Identity Source',
    body: 'PIUGAME avatar image + official character name define the base identity. This page now imports the authenticated shop roster, then lets us curate and rename edge cases before PixelLab generation.',
  },
  {
    title: 'Consistent PixelLab Body',
    body: 'Every character is regenerated into one shared full-body pose in the Dojocat-style reference, so clothing and accessories fit every card the same way.',
  },
  {
    title: 'Reusable Trait Layers',
    body: 'Hat, eyewear, necklace, and clothes all sit on fixed anchors. That makes the collection behave more like BAYC / CryptoPunks trait layering instead of unique one-off art.',
  },
  {
    title: 'Habitat Backdrops',
    body: 'Rock, fire, water, and ice backgrounds are a separate rarity layer so the same base character can exist in different elemental worlds without redrawing the figure.',
  },
];

function createShopSeeds() {
  return piuAvatarCatalog.map((item) => ({
    id: `piu-${item.filename.replace('.png', '')}`,
    name: item.name,
    officialName: item.name,
    preview: `/avatars/${item.filename}`,
    source: 'PIUGAME Avatar Shop',
    sourceNote: item.owned
      ? 'Official PIUGAME roster import · already owned in source shop'
      : `Official PIUGAME roster import · unlockable for ${item.price || '?'} PP`,
    generationStatus: item.owned ? 'Source Owned' : 'Source Imported',
    weight: item.owned ? 3 : 1,
    lockedName: false,
    ownedInShop: item.owned,
    sourcePrice: item.price,
    multiCharacter: false,
    removed: false,
    characterGroups: [],
  }));
}

function clampWeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(999, Math.round(parsed)));
}

function sumActiveWeight(items) {
  return items.reduce((sum, item) => sum + (item.active === false || item.removed ? 0 : Math.max(0, Number(item.weight) || 0)), 0);
}

function formatEstimate(value) {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value);
}

function formatComboCount(value) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value > 999999) return `${(value / 1000000).toFixed(1)}M`;
  if (value > 9999) return `${(value / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat('en-GB').format(Math.round(value));
}

function normalizeGroupName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getDerivedCharacterGroups(character) {
  const manualGroups = Array.isArray(character.characterGroups)
    ? character.characterGroups.map(normalizeGroupName).filter(Boolean)
    : [];
  const splitNames = character.multiCharacter
    ? String(character.name || '')
      .split(';')
      .map(normalizeGroupName)
      .filter(Boolean)
    : [];
  return [...new Set([...manualGroups, ...splitNames])];
}

function SectionShell({ eyebrow, index, title, children, aside }) {
  return (
    <section className="relative grid gap-5 border-t border-white/10 pt-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8 lg:pt-6">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          {index ? (
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-cyan-300/70">{index}</span>
          ) : null}
          <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-300/70">{eyebrow}</span>
        </div>
        <h2 className="mt-2 font-display text-[1.75rem] font-black leading-[1.05] tracking-tight text-white sm:text-[2rem]">{title}</h2>
        <div className="mt-5">{children}</div>
      </div>
      {aside ? <aside className="lg:pt-[3.1rem]">{aside}</aside> : null}
    </section>
  );
}

function WeightPill({ children, tone = 'cyan' }) {
  const toneClasses = {
    cyan: 'border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-200',
    amber: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-200',
    pink: 'border-pink-400/25 bg-pink-400/[0.08] text-pink-200',
    emerald: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200',
    slate: 'border-white/10 bg-white/[0.04] text-gray-300',
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${toneClasses[tone] || toneClasses.slate}`}>
      {children}
    </span>
  );
}

function UploadButton({ assetUrl, onUpload, onDelete, size = 'sm', label = 'Upload' }) {
  const inputRef = useRef(null);
  const handleChange = (event) => {
    const file = event.target.files?.[0];
    if (file) onUpload(file);
    event.target.value = '';
  };
  if (assetUrl) {
    return (
      <div className="group/upload relative">
        <img
          src={`${assetUrl}?t=${Date.now()}`}
          alt="Uploaded asset"
          className={`rounded-lg border border-white/[0.08] bg-[#0a0915] object-contain ${size === 'lg' ? 'h-28 w-28' : 'h-10 w-10'}`}
          style={{ imageRendering: 'pixelated' }}
        />
        <button
          type="button"
          onClick={onDelete}
          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500/90 text-[8px] font-bold text-white group-hover/upload:flex"
          aria-label="Remove asset"
        >
          x
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500 transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.04] hover:text-cyan-300 ${
          size === 'lg' ? 'flex h-28 w-28 items-center justify-center' : 'px-2 py-1'
        }`}
      >
        {label}
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={handleChange} />
    </>
  );
}

function CharacterCard({
  character,
  mintSize,
  totalBaseWeight,
  onUpdate,
  groupDraft,
  onGroupDraftChange,
  onAddGroup,
  onRemoveGroup,
}) {
  const estimate = totalBaseWeight > 0 && character.active !== false && character.weight > 0
    ? (character.weight / totalBaseWeight) * mintSize
    : 0;
  const characterGroups = getDerivedCharacterGroups(character);

  return (
    <article
      className={`group/card rounded-2xl border p-4 transition-colors ${
        character.removed
          ? 'border-rose-300/20 bg-rose-300/[0.04]'
          : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.14] hover:bg-white/[0.035]'
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0915] p-1.5">
          <img src={character.preview} alt={character.name} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">{character.source === 'PIUGAME Avatar Shop' ? 'PIUGAME' : 'Custom Hero'}</div>
              <input
                type="text"
                value={character.name}
                disabled={character.lockedName}
                onChange={(event) => onUpdate(character.id, { name: event.target.value })}
                className={`mt-1 w-full bg-transparent font-display text-[18px] font-black leading-tight tracking-tight text-white outline-none ${
                  character.lockedName ? 'cursor-default' : 'focus:text-cyan-200'
                }`}
              />
              {character.officialName && character.name !== character.officialName ? (
                <div className="mt-0.5 text-[10px] text-gray-600">
                  Official: <span className="text-gray-400">{character.officialName}</span>
                </div>
              ) : null}
            </div>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500 hover:text-gray-300">
              <input
                type="checkbox"
                checked={character.active !== false}
                onChange={(event) => onUpdate(character.id, { active: event.target.checked })}
                className="h-3.5 w-3.5 rounded-sm border-white/20 bg-black/30 text-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:ring-offset-0"
              />
              Live
            </label>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1">
            <WeightPill tone={character.generationStatus === 'Ready' ? 'emerald' : 'amber'}>
              {character.generationStatus}
            </WeightPill>
            <WeightPill tone="slate">{formatEstimate(estimate)} est</WeightPill>
            {character.source === 'PIUGAME Avatar Shop' ? (
              <WeightPill tone={character.ownedInShop ? 'emerald' : 'amber'}>
                {character.ownedInShop ? 'Owned' : `${character.sourcePrice || '?'} PP`}
              </WeightPill>
            ) : null}
            {character.multiCharacter ? <WeightPill tone="pink">Multi</WeightPill> : null}
          </div>

          <p className="mt-2.5 text-[11px] leading-snug text-gray-500">{character.sourceNote}</p>
        </div>
      </div>

      <div className="mt-3 border-t border-white/[0.06] pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Groups</span>
          <input
            type="number"
            min="0"
            max="999"
            value={character.weight}
            onChange={(event) => onUpdate(character.id, { weight: clampWeight(event.target.value) })}
            className="h-7 w-16 rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[12px] tabular-nums text-white outline-none focus:border-cyan-400/60"
            aria-label="Distribution weight"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {characterGroups.length ? characterGroups.map((groupName) => {
            const removable = !(character.multiCharacter && String(character.name || '').split(';').map(normalizeGroupName).includes(groupName));
            return (
              <span
                key={groupName}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-400/20 bg-cyan-400/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200"
              >
                {groupName}
                {removable ? (
                  <button
                    type="button"
                    onClick={() => onRemoveGroup(character.id, groupName)}
                    className="text-cyan-300/60 transition hover:text-cyan-200"
                    aria-label={`Remove ${groupName} from character group`}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          }) : (
            <span className="text-[10px] text-gray-600">—</span>
          )}
        </div>
        <div className="mt-2 flex gap-1">
          <input
            type="text"
            value={groupDraft}
            onChange={(event) => onGroupDraftChange(character.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onAddGroup(character.id);
              }
            }}
            list="piumon-character-groups"
            placeholder="Add group…"
            className="h-7 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-2 text-[11px] text-white outline-none placeholder:text-gray-600 focus:border-cyan-400/60"
          />
          <button
            type="button"
            onClick={() => onAddGroup(character.id)}
            className="h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.06] hover:text-cyan-200"
          >
            Add
          </button>
        </div>

        {character.source === 'PIUGAME Avatar Shop' ? (
          <div className="mt-3 flex items-start justify-between gap-2">
            <label className="inline-flex cursor-pointer items-start gap-1.5 text-[10px] text-gray-500">
              <input
                type="checkbox"
                checked={character.multiCharacter === true}
                onChange={(event) => onUpdate(character.id, { multiCharacter: event.target.checked })}
                className="mt-px h-3.5 w-3.5 rounded-sm border-white/20 bg-black/30 text-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:ring-offset-0"
              />
              <span className="leading-tight">
                <span className="font-semibold text-gray-300">Multi-char</span>
                <span className="mt-0.5 block font-mono text-[9px] text-gray-600">name1;name2</span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => onUpdate(character.id, { removed: !character.removed, active: character.removed ? character.active : false })}
              className={`h-7 rounded-md border px-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] transition ${
                character.removed
                  ? 'border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-200 hover:bg-emerald-300/[0.14]'
                  : 'border-rose-300/25 bg-rose-300/[0.06] text-rose-200 hover:bg-rose-300/[0.12]'
              }`}
            >
              {character.removed ? 'Restore' : 'Remove'}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TraitCard({ group, items, onToggle, onWeightChange, getAssetUrl, onUpload, onDelete }) {
  const totalWeight = sumActiveWeight(items);
  const uploadedCount = items.filter((item) => getAssetUrl?.('traits', item.id)).length;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-black tracking-tight text-white">{group.title}</h3>
          <p className="mt-1 text-[11px] leading-snug text-gray-500">{group.note}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">Total</div>
          <div className="mt-0.5 font-display text-lg font-black leading-none tabular-nums text-amber-200">{totalWeight}</div>
          {onUpload ? (
            <div className="mt-1 font-mono text-[9px] font-bold tracking-[0.12em] text-emerald-300/70">
              {uploadedCount}/{items.length} layers
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 divide-y divide-white/[0.05] border-y border-white/[0.05]">
        {items.map((item) => {
          const active = item.active !== false;
          const url = getAssetUrl?.('traits', item.id);
          return (
            <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2">
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => onToggle(group.key, item.id, event.target.checked)}
                  className="h-3.5 w-3.5 rounded-sm border-white/20 bg-black/30 text-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:ring-offset-0"
                />
                <span className={active ? 'text-white' : 'text-gray-600 line-through'}>{item.name}</span>
              </label>
              {onUpload ? (
                <UploadButton
                  assetUrl={url}
                  onUpload={(file) => onUpload('traits', item.id, file)}
                  onDelete={() => onDelete?.('traits', item.id)}
                />
              ) : null}
              <input
                type="number"
                min="0"
                max="999"
                value={item.weight}
                onChange={(event) => onWeightChange(group.key, item.id, event.target.value)}
                className="h-7 w-14 rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[11px] tabular-nums text-white outline-none focus:border-cyan-400/60"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HabitatCard({ habitat, onToggle, onWeightChange, backdropUrl, onUpload, onDelete }) {
  const active = habitat.active !== false;
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${habitat.border} bg-white/[0.02]`}>
      {backdropUrl ? (
        <img src={`${backdropUrl}?t=${Date.now()}`} alt={habitat.name} className="absolute inset-x-0 top-0 h-24 w-full object-cover opacity-40" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <div className={`absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${habitat.accent} opacity-60`} />
      )}
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">{habitat.id}</div>
            <h3 className="mt-1 font-display text-[15px] font-black tracking-tight text-white">{habitat.name}</h3>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400 hover:text-gray-200">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => onToggle(habitat.id, event.target.checked)}
              className="h-3.5 w-3.5 rounded-sm border-white/20 bg-black/30 text-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:ring-offset-0"
            />
            Live
          </label>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-gray-500">{habitat.note}</p>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">Weight</span>
          <input
            type="number"
            min="0"
            max="999"
            value={habitat.weight}
            onChange={(event) => onWeightChange(habitat.id, event.target.value)}
            className="h-7 w-16 rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[12px] tabular-nums text-white outline-none focus:border-cyan-400/60"
          />
        </div>
        {onUpload ? (
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">Backdrop</span>
            <UploadButton
              assetUrl={backdropUrl}
              onUpload={(file) => onUpload('habitats', habitat.id, file)}
              onDelete={() => onDelete?.('habitats', habitat.id)}
              label="Upload"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PiumonPage() {
  const [mintSize, setMintSize] = useState(TOTAL_SUPPLY_DEFAULT);
  const [baseQuery, setBaseQuery] = useState('');
  const [baseFilter, setBaseFilter] = useState('all');
  const [baseCharacters, setBaseCharacters] = useState(() => [...CUSTOM_HEROES, ...createShopSeeds()].map((item) => ({ ...item, active: true })));
  const [groupDrafts, setGroupDrafts] = useState({});
  const [traits, setTraits] = useState(() => Object.fromEntries(
    TRAIT_GROUPS.map((group) => [group.key, group.items.map((item) => ({ ...item, active: true }))])
  ));
  const [habitats, setHabitats] = useState(() => HABITATS.map((item) => ({ ...item, active: true })));

  // Asset management
  const [assets, setAssets] = useState({ bodies: [], traits: [], habitats: [] });
  const [assetsLoading, setAssetsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setAssetsLoading(false); return; }
    fetch('/api/piumon/assets', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { bodies: [], traits: [], habitats: [] }))
      .then(setAssets)
      .catch(() => {})
      .finally(() => setAssetsLoading(false));
  }, []);

  const getAssetUrl = useCallback((type, id) => {
    const asset = assets[type]?.find((a) => a.id === id);
    return asset ? `/piumon-assets/${type}/${asset.filename}` : null;
  }, [assets]);

  const uploadAsset = useCallback(async (type, id, file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`/api/piumon/assets/${type}/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) return;
    const data = await res.json();
    setAssets((prev) => ({
      ...prev,
      [type]: [...prev[type].filter((a) => a.id !== id), { id, filename: data.filename }],
    }));
  }, []);

  const deleteAsset = useCallback(async (type, id) => {
    const token = localStorage.getItem('token');
    await fetch(`/api/piumon/assets/${type}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setAssets((prev) => ({
      ...prev,
      [type]: prev[type].filter((a) => a.id !== id),
    }));
  }, []);

  // PixelLab generation
  const [genJobs, setGenJobs] = useState({}); // characterId -> { status, jobId, error }
  const [genSize, setGenSize] = useState(48);
  const pollTimers = useRef({});

  const startGeneration = useCallback(async (character) => {
    const token = localStorage.getItem('token');
    setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'starting' } }));
    try {
      const res = await fetch('/api/piumon/generate/body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          characterId: character.id,
          previewUrl: character.preview,
          name: character.name,
          size: genSize,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', error: err.error } }));
        return;
      }
      const { jobId } = await res.json();
      setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'processing', jobId } }));

      // Start polling
      const poll = async () => {
        try {
          const pollRes = await fetch(`/api/piumon/generate/job/${jobId}?characterId=${encodeURIComponent(character.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await pollRes.json();
          if (data.status === 'completed') {
            setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'completed', jobId } }));
            setAssets((prev) => ({
              ...prev,
              bodies: [...prev.bodies.filter((a) => a.id !== character.id), { id: character.id, filename: data.filename }],
            }));
            delete pollTimers.current[character.id];
          } else if (data.status === 'failed') {
            setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', jobId, error: data.error } }));
            delete pollTimers.current[character.id];
          } else {
            pollTimers.current[character.id] = setTimeout(poll, 6000);
          }
        } catch {
          pollTimers.current[character.id] = setTimeout(poll, 8000);
        }
      };
      pollTimers.current[character.id] = setTimeout(poll, 5000);
    } catch (err) {
      setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', error: err.message } }));
    }
  }, [genSize]);

  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearTimeout);
    };
  }, []);

  // Composition preview
  const [compBase, setCompBase] = useState('');
  const [compHabitat, setCompHabitat] = useState('');
  const [compTraits, setCompTraits] = useState({ hat: '', eyewear: '', neck: '', outfit: '' });

  const filteredCharacters = useMemo(() => {
    const query = baseQuery.trim().toLowerCase();
    return baseCharacters.filter((item) => {
      if (baseFilter === 'removed') {
        if (!item.removed) return false;
      } else {
        if (item.removed) return false;
        if (baseFilter !== 'all' && item.source !== baseFilter) return false;
      }
      if (!query) return true;
      return item.name.toLowerCase().includes(query)
        || item.sourceNote.toLowerCase().includes(query)
        || String(item.officialName || '').toLowerCase().includes(query);
    });
  }, [baseCharacters, baseFilter, baseQuery]);

  const activeBases = useMemo(() => baseCharacters.filter((item) => item.removed !== true && item.active !== false && item.weight > 0), [baseCharacters]);
  const totalBaseWeight = useMemo(() => sumActiveWeight(baseCharacters), [baseCharacters]);
  const removedBaseCount = useMemo(() => baseCharacters.filter((item) => item.removed).length, [baseCharacters]);
  const visibleBaseCount = useMemo(() => baseCharacters.filter((item) => !item.removed).length, [baseCharacters]);
  const activeTraitCounts = useMemo(() => {
    return TRAIT_GROUPS.map((group) => ({
      key: group.key,
      active: (traits[group.key] || []).filter((item) => item.active !== false && item.weight > 0).length,
      totalWeight: sumActiveWeight(traits[group.key] || []),
    }));
  }, [traits]);
  const activeHabitats = useMemo(() => habitats.filter((item) => item.active !== false && item.weight > 0), [habitats]);
  const totalHabitatWeight = useMemo(() => sumActiveWeight(habitats), [habitats]);
  const characterGroups = useMemo(() => {
    const groupMap = new Map();
    baseCharacters.forEach((character) => {
      if (character.removed) return;
      getDerivedCharacterGroups(character).forEach((groupName) => {
        const next = groupMap.get(groupName) || { count: 0, characters: [] };
        next.count += 1;
        next.characters.push(character.name);
        groupMap.set(groupName, next);
      });
    });
    return [...groupMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [baseCharacters]);
  const groupSuggestions = useMemo(() => characterGroups.map((group) => group.name), [characterGroups]);
  const theoreticalCombos = useMemo(() => {
    const traitProduct = activeTraitCounts.reduce((product, group) => product * Math.max(1, group.active), 1);
    return activeBases.length * Math.max(1, activeHabitats.length) * traitProduct;
  }, [activeBases.length, activeHabitats.length, activeTraitCounts]);

  const projectedTopBases = useMemo(() => {
    if (!totalBaseWeight) return [];
    return [...activeBases]
      .map((item) => ({
        ...item,
        estimate: (item.weight / totalBaseWeight) * mintSize,
      }))
      .sort((a, b) => b.estimate - a.estimate)
      .slice(0, 8);
  }, [activeBases, mintSize, totalBaseWeight]);

  const heroReference = activeBases[0] || baseCharacters[0];

  function updateBaseCharacter(id, updates) {
    setBaseCharacters((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  function updateGroupDraft(id, value) {
    setGroupDrafts((current) => ({ ...current, [id]: value }));
  }

  function addCharacterGroup(id) {
    const nextGroup = normalizeGroupName(groupDrafts[id]);
    if (!nextGroup) return;
    const target = baseCharacters.find((item) => item.id === id);
    const nextGroups = [...new Set([...(target?.characterGroups || []), nextGroup])];
    updateBaseCharacter(id, { characterGroups: nextGroups });
    updateGroupDraft(id, '');
  }

  function removeCharacterGroup(id, groupName) {
    const target = baseCharacters.find((item) => item.id === id);
    if (!target) return;
    updateBaseCharacter(
      id,
      { characterGroups: (target.characterGroups || []).filter((item) => item !== groupName) }
    );
  }

  function updateTrait(groupKey, id, updates) {
    setTraits((current) => ({
      ...current,
      [groupKey]: (current[groupKey] || []).map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
  }

  function updateHabitat(id, updates) {
    setHabitats((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  const totalTraitLayers = activeTraitCounts.reduce((sum, item) => sum + item.active, 0);

  return (
    <div className="relative min-h-screen bg-[#070610] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(49,196,255,0.14),transparent_60%)]" />
        <div className="absolute left-1/2 top-[-8rem] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-500/[0.06] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-[1240px] px-5 pb-20 pt-7 sm:px-8">
        <div className="flex items-center justify-between gap-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400">
          <Link to="/" className="inline-flex items-center gap-1.5 transition hover:text-cyan-300">
            <span className="text-base leading-none">←</span>
            Shinsa
          </Link>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 transition hover:text-cyan-300"
          >
            PIUGAME Avatar Shop
            <span className="text-base leading-none">↗</span>
          </a>
        </div>

        <header className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-300/80">
              Piumon · Preparation Phase
            </div>
            <h1 className="mt-3 font-display text-[3.25rem] font-black leading-[0.88] tracking-[-0.02em] text-white sm:text-[4.25rem]">
              PIUMON
              <br />
              <span className="text-cyan-300">FORGE</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-gray-400 sm:text-[15px]">
              Pipeline prep before the 1K mint. Import PIUGAME identities, regenerate them in one consistent PixelLab body, then layer reusable wearables and elemental habitats on top.
            </p>
          </div>
        </header>

        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-white/[0.08] py-5 sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-white/[0.08]">
          <div className="sm:px-6 sm:first:pl-0">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Mint Size</dt>
            <dd className="mt-2 font-display text-[2.25rem] font-black leading-none tracking-tight text-white tabular-nums">{mintSize}</dd>
            <dd className="mt-2 text-[11px] leading-snug text-gray-500">Hard claim ceiling.</dd>
          </div>
          <div className="sm:px-6">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Identity Seeds</dt>
            <dd className="mt-2 font-display text-[2.25rem] font-black leading-none tracking-tight text-white tabular-nums">{visibleBaseCount}</dd>
            <dd className="mt-2 text-[11px] leading-snug text-gray-500">
              <span className="text-cyan-300">{activeBases.length}</span> live in pool{removedBaseCount ? <> · <span className="text-amber-300">{removedBaseCount}</span> removed</> : null}
            </dd>
          </div>
          <div className="sm:px-6">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Trait Layers</dt>
            <dd className="mt-2 font-display text-[2.25rem] font-black leading-none tracking-tight text-white tabular-nums">{totalTraitLayers}</dd>
            <dd className="mt-2 text-[11px] leading-snug text-gray-500">Across hats, eyes, neck, clothes.</dd>
          </div>
          <div className="sm:px-6 sm:last:pr-0">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Possible Combos</dt>
            <dd className="mt-2 font-display text-[2.25rem] font-black leading-none tracking-tight text-white tabular-nums">{formatComboCount(theoreticalCombos)}</dd>
            <dd className="mt-2 text-[11px] leading-snug text-gray-500">Room to hide the 1K distribution.</dd>
          </div>
        </dl>

        <div className="mt-10 space-y-10 lg:mt-12 lg:space-y-12">
        <SectionShell
          index="01"
          eyebrow="Generation Contract"
          title="One body. Many swappable layers."
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Style Reference</div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#13111e] to-[#09081a]">
                <img
                  src={heroReference?.preview || '/pet-world/heroes/dojocat/base.png'}
                  alt={heroReference?.name || 'Dojocat'}
                  className="mx-auto block h-56 w-auto object-contain"
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                Target density: front-facing, fixed stance, clean head and torso anchors — enough negative space to swap wearables without redrawing.
              </p>
            </div>
          }
        >
          <ol className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {PIPELINE_STEPS.map((step, index) => (
              <li key={step.title} className="group grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1 py-4 sm:grid-cols-[3rem_minmax(0,14rem)_minmax(0,1fr)] sm:gap-x-6">
                <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-cyan-300/60 sm:pt-1">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="col-start-2 font-display text-[15px] font-black tracking-tight text-white">
                  {step.title}
                </h3>
                <p className="col-span-2 text-[13px] leading-relaxed text-gray-400 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-amber-200/70">Attribute Axes</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Rarity-agnostic rank dimensions</div>
            </div>
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
              {ATTRIBUTE_AXES.map((axis) => (
                <div key={axis.id} className="border-l border-amber-200/20 pl-3">
                  <div className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-amber-100">{axis.name}</div>
                  <div className="mt-1 text-[11px] leading-snug text-gray-500">{axis.note}</div>
                </div>
              ))}
            </div>
          </div>
        </SectionShell>

        <SectionShell
          index="02"
          eyebrow="Base Roster"
          title="Identity sources to regenerate"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Import Status</div>
              <dl className="mt-3 space-y-4">
                <div>
                  <dt className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-white">PIUGAME avatars</dt>
                  <dd className="mt-1 text-[11px] leading-snug text-gray-500">Authenticated shop import matched against Shinsa&apos;s local avatar cache.</dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-white">Multi-character</dt>
                  <dd className="mt-1 text-[11px] leading-snug text-gray-500">Rename as <span className="font-mono text-gray-300">name1;name2</span>. Left-most figure first.</dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-white">Custom heroes</dt>
                  <dd className="mt-1 text-[11px] leading-snug text-gray-500">Buu and Dojocat use approved source art. Devit and Pixiu use curated sticker references.</dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-white">Rarity model</dt>
                  <dd className="mt-1 text-[11px] leading-snug text-gray-500">Character rarity = pool weight. Trait rarity = overlap with enabled wearables and habitats.</dd>
                </div>
              </dl>
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Character Groups</div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {characterGroups.length ? characterGroups.slice(0, 18).map((group) => (
                    <span
                      key={group.name}
                      className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] px-2 py-0.5 text-[10px] font-semibold text-cyan-200"
                      title={group.characters.join(', ')}
                    >
                      {group.name}
                      <span className="font-mono text-cyan-300/60">×{group.count}</span>
                    </span>
                  )) : (
                    <span className="text-[11px] text-gray-600">None defined yet.</span>
                  )}
                </div>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'PIUGAME Avatar Shop', label: 'PIUGAME' },
                { key: 'Custom Hero', label: 'Custom' },
                { key: 'removed', label: 'Removed' },
              ].map(({ key, label }) => {
                const active = baseFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBaseFilter(key)}
                    className={`h-8 rounded-md border px-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition ${
                      active
                        ? 'border-cyan-300/40 bg-cyan-300/[0.08] text-cyan-200'
                        : 'border-white/[0.08] bg-transparent text-gray-500 hover:border-white/20 hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex h-8 items-center gap-2 rounded-md border border-white/[0.08] bg-black/20 px-3 sm:w-64">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-600">Search</span>
              <input
                type="text"
                value={baseQuery}
                onChange={(event) => setBaseQuery(event.target.value)}
                placeholder="Name or source note"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-gray-600"
              />
            </div>
          </div>
          <datalist id="piumon-character-groups">
            {groupSuggestions.map((groupName) => (
              <option key={groupName} value={groupName} />
            ))}
          </datalist>
          <div className="mt-5 grid max-h-[42rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                mintSize={mintSize}
                totalBaseWeight={totalBaseWeight}
                onUpdate={updateBaseCharacter}
                groupDraft={groupDrafts[character.id] || ''}
                onGroupDraftChange={updateGroupDraft}
                onAddGroup={addCharacterGroup}
                onRemoveGroup={removeCharacterGroup}
              />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          index="03"
          eyebrow="Body Generation"
          title="PixelLab base bodies"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Generation Progress</div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <div className="font-display text-[2rem] font-black leading-none tabular-nums text-white">
                    {activeBases.filter((c) => getAssetUrl('bodies', c.id)).length}
                    <span className="ml-1 text-[14px] text-gray-500">/ {activeBases.length}</span>
                  </div>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300/70">
                    {activeBases.length > 0
                      ? `${Math.round((activeBases.filter((c) => getAssetUrl('bodies', c.id)).length / activeBases.length) * 100)}%`
                      : '0%'}
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                    style={{ width: activeBases.length > 0 ? `${(activeBases.filter((c) => getAssetUrl('bodies', c.id)).length / activeBases.length) * 100}%` : '0%' }}
                  />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Sprite Size (px)</label>
                  <input
                    type="number"
                    min="16"
                    max="128"
                    step="8"
                    value={genSize}
                    onChange={(e) => setGenSize(Math.max(16, Math.min(128, Number(e.target.value) || 48)))}
                    className="mt-1 block h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[12px] tabular-nums text-white outline-none focus:border-cyan-400/60"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const pending = activeBases.filter((c) => !getAssetUrl('bodies', c.id) && !genJobs[c.id]?.status?.match(/starting|processing/));
                    for (const c of pending) {
                      await startGeneration(c);
                      await new Promise((r) => setTimeout(r, 4000));
                    }
                  }}
                  className="w-full rounded-lg border border-cyan-300/30 bg-cyan-300/[0.08] py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200 transition hover:bg-cyan-300/[0.14]"
                >
                  Generate All Pending
                </button>
              </div>
              <p className="mt-4 text-[11px] leading-snug text-gray-500">
                Uses PixelLab&apos;s create-from-concept API. Each character&apos;s avatar is sent as the concept image and regenerated as an 8-direction pixel sprite.
              </p>
            </div>
          }
        >
          <div className="grid max-h-[42rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeBases.map((character) => {
              const bodyUrl = getAssetUrl('bodies', character.id);
              const job = genJobs[character.id];
              const isGenerating = job?.status === 'starting' || job?.status === 'processing';
              return (
                <div key={character.id} className={`rounded-2xl border p-3 ${isGenerating ? 'border-cyan-400/20 bg-cyan-400/[0.03]' : 'border-white/[0.08] bg-white/[0.025]'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0915] p-1">
                      <img src={character.preview} alt={character.name} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                    </div>
                    <div className="text-[10px] font-bold text-gray-500">→</div>
                    {bodyUrl ? (
                      <div className="group/upload relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-400/20 bg-[#0a0915] p-1">
                        <img src={`${bodyUrl}?t=${Date.now()}`} alt={`${character.name} body`} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                        <button
                          type="button"
                          onClick={() => deleteAsset('bodies', character.id)}
                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500/90 text-[8px] font-bold text-white group-hover/upload:flex"
                        >
                          x
                        </button>
                      </div>
                    ) : isGenerating ? (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-[#0a0915]">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-[#0a0915]">
                        <span className="font-mono text-[8px] text-gray-600">—</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="truncate font-display text-[13px] font-black tracking-tight text-white">{character.name}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {bodyUrl ? (
                        <WeightPill tone="emerald">Generated</WeightPill>
                      ) : isGenerating ? (
                        <WeightPill tone="cyan">Generating…</WeightPill>
                      ) : job?.status === 'failed' ? (
                        <WeightPill tone="pink">Failed</WeightPill>
                      ) : (
                        <WeightPill tone="amber">Pending</WeightPill>
                      )}
                      <span className="font-mono text-[9px] text-gray-600">{character.source === 'PIUGAME Avatar Shop' ? 'PIUGAME' : 'Custom'}</span>
                    </div>
                    {job?.error ? (
                      <div className="mt-1 truncate text-[10px] text-rose-300/70" title={job.error}>{job.error}</div>
                    ) : null}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {!bodyUrl && !isGenerating ? (
                      <button
                        type="button"
                        onClick={() => startGeneration(character)}
                        className="h-7 flex-1 rounded-md border border-cyan-300/25 bg-cyan-300/[0.06] font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-200 transition hover:bg-cyan-300/[0.12]"
                      >
                        Generate
                      </button>
                    ) : null}
                    {!bodyUrl ? (
                      <UploadButton
                        assetUrl={null}
                        onUpload={(file) => uploadAsset('bodies', character.id, file)}
                        onDelete={() => {}}
                        label="Upload"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startGeneration(character)}
                        className="h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400 transition hover:text-cyan-200"
                      >
                        Regen
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionShell>

        <SectionShell
          index="04"
          eyebrow="Trait Pools"
          title="Reusable accessories and clothes"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Layer Order</div>
              <ol className="mt-3 divide-y divide-white/[0.05] border-y border-white/[0.05]">
                {['Base body', 'Clothes', 'Neckwear', 'Eyewear', 'Headwear'].map((label, index) => (
                  <li key={label} className="flex items-center justify-between py-2">
                    <span className="text-[12px] text-white">{label}</span>
                    <span className="font-mono text-[10px] font-bold tracking-[0.1em] text-cyan-300/60">{String(index + 1).padStart(2, '0')}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] leading-snug text-gray-500">
                Break this stack and the collectible stops being composable. Catch it before the final mint batch generates.
              </p>
            </div>
          }
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {TRAIT_GROUPS.map((group) => (
              <TraitCard
                key={group.key}
                group={group}
                items={traits[group.key] || []}
                onToggle={(groupKey, id, checked) => updateTrait(groupKey, id, { active: checked })}
                onWeightChange={(groupKey, id, value) => updateTrait(groupKey, id, { weight: clampWeight(value) })}
                getAssetUrl={getAssetUrl}
                onUpload={uploadAsset}
                onDelete={deleteAsset}
              />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          index="05"
          eyebrow="Habitats"
          title="Elemental background distributions"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Habitat Logic</div>
              <p className="mt-3 text-[12px] leading-relaxed text-gray-400">
                Habitats are a rarity axis, not a background. Reuse one composition grid so boats, rocks, crystals, or firelight can vary while the pose stays untouched.
              </p>
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Active habitat weight</div>
                <div className="mt-1.5 font-display text-[2rem] font-black leading-none tabular-nums text-white">{totalHabitatWeight}</div>
              </div>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {habitats.map((habitat) => (
              <HabitatCard
                key={habitat.id}
                habitat={habitat}
                onToggle={(id, checked) => updateHabitat(id, { active: checked })}
                onWeightChange={(id, value) => updateHabitat(id, { weight: clampWeight(value) })}
                backdropUrl={getAssetUrl('habitats', habitat.id)}
                onUpload={uploadAsset}
                onDelete={deleteAsset}
              />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          index="06"
          eyebrow="Composition Preview"
          title="Layer stack verification"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Asset Readiness</div>
              <dl className="mt-3 space-y-3">
                <div className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-gray-400">Bodies</dt>
                  <dd className="font-mono text-[11px] font-bold tabular-nums text-emerald-300">
                    {activeBases.filter((c) => getAssetUrl('bodies', c.id)).length}/{activeBases.length}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-gray-400">Trait layers</dt>
                  <dd className="font-mono text-[11px] font-bold tabular-nums text-emerald-300">
                    {TRAIT_GROUPS.reduce((sum, g) => sum + (traits[g.key] || []).filter((t) => t.active !== false && getAssetUrl('traits', t.id)).length, 0)}
                    /{TRAIT_GROUPS.reduce((sum, g) => sum + (traits[g.key] || []).filter((t) => t.active !== false).length, 0)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-gray-400">Habitats</dt>
                  <dd className="font-mono text-[11px] font-bold tabular-nums text-emerald-300">
                    {activeHabitats.filter((h) => getAssetUrl('habitats', h.id)).length}/{activeHabitats.length}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] leading-snug text-gray-500">
                Select a character, traits, and habitat to preview the full composition. All layers stack via absolute positioning at the same dimensions.
              </p>
            </div>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
            <div className="relative flex h-72 w-72 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0915]">
              {compHabitat && getAssetUrl('habitats', compHabitat) ? (
                <img src={getAssetUrl('habitats', compHabitat)} alt="Habitat" className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-slate-800/40 to-slate-900/80" />
              )}
              {compBase && getAssetUrl('bodies', compBase) ? (
                <img src={getAssetUrl('bodies', compBase)} alt="Body" className="relative z-10 h-56 w-56 object-contain" style={{ imageRendering: 'pixelated' }} />
              ) : null}
              {Object.entries(compTraits).map(([key, traitId]) => {
                if (!traitId) return null;
                const url = getAssetUrl('traits', traitId);
                if (!url) return null;
                return <img key={key} src={url} alt={key} className="absolute inset-0 z-20 h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />;
              })}
              {!compBase ? (
                <span className="relative z-30 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">Select a character</span>
              ) : null}
            </div>
            <div className="space-y-4">
              <div>
                <label className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Character</label>
                <select
                  value={compBase}
                  onChange={(e) => setCompBase(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-400/60"
                >
                  <option value="">— select —</option>
                  {activeBases.filter((c) => getAssetUrl('bodies', c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {TRAIT_GROUPS.map((group) => (
                <div key={group.key}>
                  <label className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">{group.title}</label>
                  <select
                    value={compTraits[group.key] || ''}
                    onChange={(e) => setCompTraits((prev) => ({ ...prev, [group.key]: e.target.value }))}
                    className="mt-1.5 block w-full rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-400/60"
                  >
                    <option value="">None</option>
                    {(traits[group.key] || []).filter((t) => t.active !== false && getAssetUrl('traits', t.id)).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Habitat</label>
                <select
                  value={compHabitat}
                  onChange={(e) => setCompHabitat(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-400/60"
                >
                  <option value="">— none —</option>
                  {activeHabitats.filter((h) => getAssetUrl('habitats', h.id)).map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </SectionShell>

        <SectionShell
          index="07"
          eyebrow="Distribution Readout"
          title="What the current weights imply"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Why this matters</div>
              <p className="mt-3 text-[12px] leading-relaxed text-gray-400">
                Cards mint progressively until all {mintSize} are claimed. This page should make it hard to accidentally overproduce a trait or underrepresent a base before the claim window opens.
              </p>
            </div>
          }
        >
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Top Projected Identities</div>
                  <div className="mt-1 font-display text-[15px] font-black tracking-tight text-white">Share of the {mintSize} mint</div>
                </div>
                <label className="flex items-center gap-2">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">Mint</span>
                  <input
                    type="number"
                    min="100"
                    max="10000"
                    step="100"
                    value={mintSize}
                    onChange={(event) => setMintSize(Math.max(100, Math.min(10000, clampWeight(event.target.value))))}
                    className="h-8 w-24 rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[12px] tabular-nums text-white outline-none focus:border-cyan-400/60"
                  />
                </label>
              </div>
              <div className="mt-4 divide-y divide-white/[0.05] border-y border-white/[0.05]">
                {projectedTopBases.map((item) => {
                  const share = Math.round((item.weight / totalBaseWeight) * 100);
                  return (
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-white">{item.name}</div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-gray-600">{item.source === 'PIUGAME Avatar Shop' ? 'PIUGAME' : 'Custom Hero'}</div>
                      </div>
                      <div className="font-display text-[15px] font-black tabular-nums text-cyan-300">{formatEstimate(item.estimate)}</div>
                      <div className="text-right font-mono text-[11px] tabular-nums text-gray-500">{share}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Trait Readiness</div>
                <div className="mt-3 divide-y divide-white/[0.05] border-y border-white/[0.05]">
                  {activeTraitCounts.map((group) => (
                    <div key={group.key} className="flex items-baseline justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-white">{TRAIT_GROUPS.find((item) => item.key === group.key)?.title}</div>
                        <div className="font-mono text-[10px] text-gray-600">{group.totalWeight} total weight</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-display text-[15px] font-black tabular-nums text-cyan-300">{group.active}</span>
                        <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.14em] text-gray-500">live</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-l-2 border-cyan-300/40 pl-4">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300/80">Next Step</div>
                <p className="mt-2 text-[12px] leading-relaxed text-gray-400">
                  Once identities are fully imported from the logged-in PIUGAME shop, this page drives the first PixelLab batch: generate standardized base bodies, then split swappable wearables and habitats from the approved layer system.
                </p>
              </div>
            </div>
          </div>
        </SectionShell>
        </div>
      </div>
    </div>
  );
}

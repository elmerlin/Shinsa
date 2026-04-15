import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

function SectionShell({ eyebrow, title, children, aside }) {
  return (
    <section className="grid gap-4 rounded-[28px] border border-piu-border/50 bg-piu-card/70 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm lg:grid-cols-[minmax(0,1fr)_300px] lg:p-6">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.34em] text-piu-accent/80">{eyebrow}</div>
        <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-white">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
      {aside ? <aside className="rounded-[24px] border border-white/8 bg-black/20 p-4">{aside}</aside> : null}
    </section>
  );
}

function WeightPill({ children, tone = 'cyan' }) {
  const toneClasses = {
    cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
    pink: 'border-pink-400/20 bg-pink-400/10 text-pink-100',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
    slate: 'border-white/10 bg-white/5 text-gray-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${toneClasses[tone] || toneClasses.slate}`}>
      {children}
    </span>
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
      className={`rounded-[26px] border px-4 py-4 transition-colors ${
        character.removed
          ? 'border-rose-300/20 bg-rose-300/[0.05]'
          : 'border-white/8 bg-white/[0.035]'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-white/10 bg-[#0c0a16] p-2">
          <img src={character.preview} alt={character.name} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.26em] text-gray-500">{character.source}</div>
              <input
                type="text"
                value={character.name}
                disabled={character.lockedName}
                onChange={(event) => onUpdate(character.id, { name: event.target.value })}
                className={`mt-2 w-full border-b border-white/10 bg-transparent pb-1 font-display text-[1.75rem] font-black leading-none text-white outline-none ${
                  character.lockedName ? 'cursor-default opacity-95' : 'focus:border-piu-accent'
                }`}
              />
              {character.officialName && character.name !== character.officialName ? (
                <div className="mt-2 text-[11px] text-gray-500">
                  Official source name: <span className="text-gray-300">{character.officialName}</span>
                </div>
              ) : null}
            </div>
            <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-gray-200">
              <input
                type="checkbox"
                checked={character.active !== false}
                onChange={(event) => onUpdate(character.id, { active: event.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-black/20 text-piu-accent focus:ring-piu-accent"
              />
              Live
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <WeightPill tone={character.generationStatus === 'Ready' ? 'emerald' : 'amber'}>
              {character.generationStatus}
            </WeightPill>
            <WeightPill tone="slate">{formatEstimate(estimate)} est.</WeightPill>
            {character.source === 'PIUGAME Avatar Shop' ? (
              <WeightPill tone={character.ownedInShop ? 'emerald' : 'amber'}>
                {character.ownedInShop ? 'Owned in source shop' : `${character.sourcePrice || '?'} PP`}
              </WeightPill>
            ) : null}
            {character.multiCharacter ? <WeightPill tone="pink">Multi-character</WeightPill> : null}
            {character.removed ? <WeightPill tone="amber">Removed from prep</WeightPill> : null}
          </div>

          <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-gray-300">{character.sourceNote}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-white/8 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">Character Groups</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {characterGroups.length ? characterGroups.map((groupName) => {
                const removable = !(character.multiCharacter && String(character.name || '').split(';').map(normalizeGroupName).includes(groupName));
                return (
                  <span
                    key={groupName}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100"
                  >
                    {groupName}
                    {removable ? (
                      <button
                        type="button"
                        onClick={() => onRemoveGroup(character.id, groupName)}
                        className="text-cyan-100/70 transition hover:text-cyan-100"
                        aria-label={`Remove ${groupName} from character group`}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                );
              }) : (
                <span className="text-xs text-gray-500">No group links yet.</span>
              )}
            </div>
          </div>

          <div className="flex min-w-[16rem] flex-1 flex-wrap justify-end gap-2">
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
              placeholder="Add to character group"
              className="min-w-[12rem] flex-1 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-piu-accent"
            />
            <button
              type="button"
              onClick={() => onAddGroup(character.id)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white transition hover:border-piu-accent/35 hover:bg-piu-accent/10"
            >
              Add To Character Group
            </button>
          </div>
        </div>

        {character.source === 'PIUGAME Avatar Shop' ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex max-w-[32rem] items-start gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={character.multiCharacter === true}
                onChange={(event) => onUpdate(character.id, { multiCharacter: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/20 text-piu-accent focus:ring-piu-accent"
              />
              <span>
                <span className="block font-semibold text-white">Contains more than one character</span>
                <span className="mt-1 block text-gray-500">
                  Use <span className="font-semibold text-gray-300">name1;name2</span> so the furthest-left figure is first. Those names auto-link into matching character groups.
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => onUpdate(character.id, { removed: !character.removed, active: character.removed ? character.active : false })}
              className={`rounded-2xl border px-3 py-2 text-xs font-bold transition ${
                character.removed
                  ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15'
                  : 'border-rose-300/20 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15'
              }`}
            >
              {character.removed ? 'Restore To Prep' : 'Remove From Prep'}
            </button>
          </div>
        ) : null}

        {character.source === 'PIUGAME Avatar Shop' && character.multiCharacter ? (
          <div className="mt-4 text-xs leading-relaxed text-pink-100/90">
            Ordered multi-character example:
            <span className="ml-1 font-semibold text-white">NameLeft;NameRight</span>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-4">
          <span className="text-xs text-gray-400">Distribution weight</span>
          <input
            type="number"
            min="0"
            max="999"
            value={character.weight}
            onChange={(event) => onUpdate(character.id, { weight: clampWeight(event.target.value) })}
            className="w-20 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-right text-sm text-white outline-none focus:border-piu-accent"
          />
        </div>
      </div>
    </article>
  );
}

function TraitCard({ group, items, onToggle, onWeightChange }) {
  const totalWeight = sumActiveWeight(items);
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-black text-white">{group.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{group.note}</p>
        </div>
        <WeightPill tone="amber">{totalWeight} total weight</WeightPill>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={item.active !== false}
                onChange={(event) => onToggle(group.key, item.id, event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/20 text-piu-accent focus:ring-piu-accent"
              />
              <span>{item.name}</span>
            </label>
            <span className="text-[11px] text-gray-400">weight</span>
            <input
              type="number"
              min="0"
              max="999"
              value={item.weight}
              onChange={(event) => onWeightChange(group.key, item.id, event.target.value)}
              className="w-16 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-right text-sm text-white outline-none focus:border-piu-accent"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function HabitatCard({ habitat, onToggle, onWeightChange }) {
  return (
    <div className={`rounded-[24px] border ${habitat.border} bg-gradient-to-br ${habitat.accent} p-[1px]`}>
      <div className="rounded-[23px] bg-piu-card/95 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-black text-white">{habitat.name}</h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">{habitat.note}</p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={habitat.active !== false}
              onChange={(event) => onToggle(habitat.id, event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-black/20 text-piu-accent focus:ring-piu-accent"
            />
            Live
          </label>
        </div>
        <div className="mt-4 h-24 overflow-hidden rounded-[18px] border border-white/8 bg-black/20 p-3">
          <div className="relative h-full rounded-[14px] bg-black/20">
            <div className={`absolute inset-0 rounded-[14px] bg-gradient-to-br ${habitat.accent}`} />
            <div className="absolute left-0 right-0 bottom-0 h-10 rounded-b-[14px] bg-black/25" />
            <div className="absolute left-3 bottom-4 h-6 w-10 rounded-full border border-white/10 bg-white/10 blur-[1px]" />
            <div className="absolute right-5 top-4 h-5 w-5 rounded-full bg-white/10 blur-[2px]" />
            <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/10 backdrop-blur-[2px]" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">Weight</span>
          <input
            type="number"
            min="0"
            max="999"
            value={habitat.weight}
            onChange={(event) => onWeightChange(habitat.id, event.target.value)}
            className="w-20 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-right text-sm text-white outline-none focus:border-piu-accent"
          />
        </div>
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

  return (
    <div className="min-h-screen bg-[#090814] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(49,196,255,0.18),transparent_58%)]" />
        <div className="absolute right-0 top-24 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute left-[-6rem] top-[28rem] h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-piu-accent/80 transition hover:text-piu-accent">
              <span className="text-lg leading-none">←</span>
              Back to Shinsa
            </Link>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100">
              Preparation Phase
            </div>
            <h1 className="mt-4 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
              PIUMON FORGE
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-300 sm:text-base">
              Define the collectible pipeline before minting: take PIUGAME avatar identities and regenerate them with PixelLab into one
              consistent full-body style, then layer hats, glasses, necklaces, clothes, and elemental habitats on top.
            </p>
          </div>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-2xl border border-piu-accent/20 bg-piu-accent/10 px-4 py-3 text-right text-xs text-piu-accent transition hover:border-piu-accent/40 hover:bg-piu-accent/15 sm:block"
          >
            <div className="font-black uppercase tracking-[0.22em]">Source</div>
            <div className="mt-1 text-[11px] text-gray-200">PIUGAME Avatar Shop</div>
          </a>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Mint Size</div>
            <div className="mt-2 font-display text-3xl font-black text-white">{mintSize}</div>
            <div className="mt-3 text-xs text-gray-400">Planned claim ceiling before the full distribution is exhausted.</div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Identity Seeds</div>
            <div className="mt-2 font-display text-3xl font-black text-white">{visibleBaseCount}</div>
            <div className="mt-3 text-xs text-gray-400">
              {activeBases.length} currently active in the mint pool
              {removedBaseCount ? ` · ${removedBaseCount} removed from prep` : '.'}
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Trait Layers</div>
            <div className="mt-2 font-display text-3xl font-black text-white">{activeTraitCounts.reduce((sum, item) => sum + item.active, 0)}</div>
            <div className="mt-3 text-xs text-gray-400">Reusable wearable variants across hats, eyewear, neckwear, and clothes.</div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Possible Combos</div>
            <div className="mt-2 font-display text-3xl font-black text-white">{formatComboCount(theoreticalCombos)}</div>
            <div className="mt-3 text-xs text-gray-400">Enough room to hide the final 1k distribution until claims play out.</div>
          </div>
        </div>

        <SectionShell
          eyebrow="Generation Contract"
          title="One consistent body, many swappable layers"
          aside={
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Style Reference</div>
              <div className="mt-3 rounded-[24px] border border-white/8 bg-black/20 p-3">
                <div className="overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_55%),linear-gradient(180deg,#12111f_0%,#0a0916_100%)] p-4">
                  <img
                    src={heroReference?.preview || '/pet-world/heroes/dojocat/base.png'}
                    alt={heroReference?.name || 'Dojocat'}
                    className="mx-auto h-52 w-auto object-contain drop-shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
                  />
                </div>
              </div>
              <div className="mt-3 text-xs leading-relaxed text-gray-400">
                The final collectible art should match this crisp full-body pixel density: front-facing, fixed stance, clean head and torso anchors, with enough negative space to swap wearables without redrawing the whole character.
              </div>
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            {PIPELINE_STEPS.map((step, index) => (
              <div key={step.title} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10 font-display text-lg font-black text-cyan-100">
                    {index + 1}
                  </div>
                  <h3 className="font-display text-lg font-black text-white">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-300">{step.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 rounded-[22px] border border-amber-300/15 bg-amber-300/[0.06] p-4 lg:grid-cols-5">
            {ATTRIBUTE_AXES.map((axis) => (
              <div key={axis.id}>
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-100">{axis.name}</div>
                <div className="mt-1 text-xs leading-relaxed text-gray-300">{axis.note}</div>
              </div>
            ))}
          </div>
        </SectionShell>

        <div className="mt-8" />

        <SectionShell
          eyebrow="Base Roster"
          title="Identity sources to regenerate with PixelLab"
          aside={
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Import Status</div>
              <div className="mt-3 space-y-3">
                <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                  <div className="font-display text-sm font-black text-white">PIUGAME avatars</div>
                  <div className="mt-1 text-xs leading-relaxed text-gray-400">
                    Images and official names are imported from the authenticated PIUGAME avatar shop and matched against Shinsa&apos;s local avatar cache, so these are real source identities ready for PixelLab regeneration.
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                  <div className="font-display text-sm font-black text-white">Multi-character handling</div>
                  <div className="mt-1 text-xs leading-relaxed text-gray-400">
                    If an avatar contains more than one figure, mark it as multi-character and rename it using
                    <span className="mx-1 font-semibold text-white">name1;name2</span>
                    so the furthest-left figure is always first.
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                  <div className="font-display text-sm font-black text-white">Custom heroes</div>
                  <div className="mt-1 text-xs leading-relaxed text-gray-400">
                    Buu and Dojocat use approved source art. Devit and Pixiu now use curated sticker references instead of the broken generated hero previews.
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                  <div className="font-display text-sm font-black text-white">Rarity model</div>
                  <div className="mt-1 text-xs leading-relaxed text-gray-400">
                    Character rarity comes from weight in this pool. Trait rarity comes from overlap with every enabled wearable and habitat in the other pools.
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                  <div className="font-display text-sm font-black text-white">Character groups</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {characterGroups.length ? characterGroups.slice(0, 18).map((group) => (
                      <span
                        key={group.name}
                        className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100"
                        title={group.characters.join(', ')}
                      >
                        {group.name}
                        <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] text-cyan-100/80">{group.count}</span>
                      </span>
                    )) : (
                      <span className="text-xs text-gray-500">No character groups defined yet.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {['all', 'PIUGAME Avatar Shop', 'Custom Hero', 'removed'].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setBaseFilter(filter)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    baseFilter === filter
                      ? 'border-piu-accent/40 bg-piu-accent/15 text-piu-accent'
                      : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/20'
                  }`}
                >
                  {filter === 'all' ? 'All Sources' : filter === 'removed' ? 'Removed' : filter}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
              <span className="text-xs text-gray-500">Search</span>
              <input
                type="text"
                value={baseQuery}
                onChange={(event) => setBaseQuery(event.target.value)}
                placeholder="Name or source note"
                className="min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
              />
            </div>
          </div>
          <datalist id="piumon-character-groups">
            {groupSuggestions.map((groupName) => (
              <option key={groupName} value={groupName} />
            ))}
          </datalist>
          <div className="mt-4 grid max-h-[38rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
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

        <div className="mt-8" />

        <SectionShell
          eyebrow="Trait Pools"
          title="Reusable accessories and clothes"
          aside={
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Layer Order</div>
              <div className="mt-3 space-y-2">
                {['Base body', 'Clothes', 'Neckwear', 'Eyewear', 'Headwear'].map((label, index) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-piu-accent/20 bg-piu-accent/10 text-xs font-black text-piu-accent">
                      {index + 1}
                    </div>
                    <span className="text-sm text-white">{label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs leading-relaxed text-gray-400">
                If a PixelLab generation breaks this layer order, the collectible stops being composable. This page is meant to catch that before any final mint batch is generated.
              </div>
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {TRAIT_GROUPS.map((group) => (
              <TraitCard
                key={group.key}
                group={group}
                items={traits[group.key] || []}
                onToggle={(groupKey, id, checked) => updateTrait(groupKey, id, { active: checked })}
                onWeightChange={(groupKey, id, value) => updateTrait(groupKey, id, { weight: clampWeight(value) })}
              />
            ))}
          </div>
        </SectionShell>

        <div className="mt-8" />

        <SectionShell
          eyebrow="Habitats"
          title="Elemental background distributions"
          aside={
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Habitat Logic</div>
              <div className="mt-3 text-sm leading-relaxed text-gray-300">
                Habitats are a full rarity axis, not a background afterthought. They should reuse one consistent composition grid so boats, rocks, clouds, crystals, or firelight can vary while the character pose stays untouched.
              </div>
              <div className="mt-4 rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">Active habitat weight</div>
                <div className="mt-2 font-display text-3xl font-black text-white">{totalHabitatWeight}</div>
              </div>
            </div>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {habitats.map((habitat) => (
              <HabitatCard
                key={habitat.id}
                habitat={habitat}
                onToggle={(id, checked) => updateHabitat(id, { active: checked })}
                onWeightChange={(id, value) => updateHabitat(id, { weight: clampWeight(value) })}
              />
            ))}
          </div>
        </SectionShell>

        <div className="mt-8" />

        <SectionShell
          eyebrow="Distribution Readout"
          title="What the current weights imply"
          aside={
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Why this matters</div>
              <div className="mt-3 text-sm leading-relaxed text-gray-300">
                Cards will mint out progressively until all {mintSize} are claimed, so this prep page should make it hard to accidentally overproduce a trait or underrepresent a base character before the live claim window opens.
              </div>
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Top projected identities</div>
                  <div className="mt-1 font-display text-lg font-black text-white">Estimated share of the 1k mint</div>
                </div>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={mintSize}
                  onChange={(event) => setMintSize(Math.max(100, Math.min(10000, clampWeight(event.target.value))))}
                  className="w-24 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-right text-sm text-white outline-none focus:border-piu-accent"
                />
              </div>
              <div className="mt-4 space-y-2">
                {projectedTopBases.map((item) => (
                  <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{item.name}</div>
                      <div className="text-[11px] text-gray-500">{item.source}</div>
                    </div>
                    <div className="text-sm font-bold text-cyan-100">{formatEstimate(item.estimate)}</div>
                    <div className="text-[11px] text-gray-500">{Math.round((item.weight / totalBaseWeight) * 100)}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Trait readiness</div>
                <div className="mt-3 space-y-3">
                  {activeTraitCounts.map((group) => (
                    <div key={group.key} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      <div className="flex items-center justify-between text-sm text-white">
                        <span>{TRAIT_GROUPS.find((item) => item.key === group.key)?.title}</span>
                        <span className="font-bold">{group.active} live</span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">{group.totalWeight} total weight</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Next step</div>
                <div className="mt-2 text-sm leading-relaxed text-gray-300">
                  Once the identity names are fully imported from the logged-in PIUGAME shop, this page can drive the first PixelLab batch: generate standardized base bodies, then split out swappable wearables and elemental habitat backgrounds from the approved layer system.
                </div>
              </div>
            </div>
          </div>
        </SectionShell>
      </div>
    </div>
  );
}

import React, { useState } from 'react';

function MiniPill({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-white/10 bg-black/35 text-white/75',
    accent: 'border-cyan-300/15 bg-cyan-400/10 text-cyan-100',
    happy: 'border-emerald-300/15 bg-emerald-400/10 text-emerald-100',
    warn: 'border-amber-300/15 bg-amber-400/10 text-amber-100',
  };
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${tones[tone] || tones.neutral}`}>
      <span className="text-[9px] uppercase tracking-[0.16em] text-white/40">{label}</span>
      <span className="text-[11px] font-semibold text-inherit">{value}</span>
    </div>
  );
}

function ResourcePill({ dot, value, capacity, title }) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-white/75"
      title={title}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
      <span className="font-semibold tabular-nums">{Math.floor(value || 0)}</span>
      {capacity != null ? <span className="text-white/35">/{capacity}</span> : null}
    </div>
  );
}

export default function PetWorldHUD({
  world,
  population,
  populationCap,
  happiness,
  phaseCap,
  activeEvents,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!world) return null;

  const pop = population ?? world.population ?? 0;
  const popCap = populationCap ?? phaseCap ?? world.housing_capacity ?? 50;
  const happy = happiness ?? world.happiness ?? 0;
  const food = world.food ?? 0;
  const combos = Math.floor(world.combo_balance || 0);
  const foodCap = world.food_capacity ?? 0;
  const wood = world.wood ?? 0;
  const woodCap = world.wood_capacity ?? 0;
  const stone = world.stone ?? 0;
  const stoneCap = world.stone_capacity ?? 0;
  const cloth = world.cloth ?? 0;
  const clothCap = world.cloth_capacity ?? 0;
  const gold = world.gold ?? 0;
  const goldCap = world.gold_capacity ?? 0;
  const currentEvent = activeEvents?.[0] || null;

  return (
    <div className="pointer-events-auto rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,14,20,0.86),rgba(7,12,18,0.74))] px-3 py-2 backdrop-blur-md shadow-[0_14px_28px_rgba(0,0,0,0.26)]">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <MiniPill label="Pets" value={`${pop}/${popCap}`} tone="accent" />
          <MiniPill label="Mood" value={Math.round(happy)} tone={happy >= 70 ? 'happy' : happy >= 45 ? 'neutral' : 'warn'} />
          <MiniPill label="Food" value={Math.floor(food)} tone={food <= pop * 2 ? 'warn' : 'neutral'} />
          <MiniPill label="Combos" value={combos.toLocaleString()} tone="neutral" />
          {currentEvent ? (
            <MiniPill
              label="Event"
              value={currentEvent.name}
              tone="happy"
            />
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-xs font-bold text-white/65 transition-colors hover:bg-black/40 hover:text-white"
          aria-label={expanded ? 'Collapse resource details' : 'Expand resource details'}
        >
          {expanded ? '−' : '+'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/8 pt-2">
          <ResourcePill dot="#34d399" value={food} capacity={foodCap} title={`Food ${Math.floor(food)}/${foodCap}`} />
          <ResourcePill dot="#b56a2d" value={wood} capacity={woodCap} title={`Wood ${Math.floor(wood)}/${woodCap}`} />
          <ResourcePill dot="#a5acb7" value={stone} capacity={stoneCap} title={`Stone ${Math.floor(stone)}/${stoneCap}`} />
          <ResourcePill dot="#df71ca" value={cloth} capacity={clothCap} title={`Cloth ${Math.floor(cloth)}/${clothCap}`} />
          <ResourcePill dot="#f3d15b" value={gold} capacity={goldCap} title={`Gold ${Math.floor(gold)}/${goldCap}`} />
        </div>
      ) : null}
    </div>
  );
}

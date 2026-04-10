import React from 'react';

function Pill({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-white/8 bg-white/[0.06] text-white/70',
    accent: 'border-cyan-300/12 bg-cyan-400/[0.08] text-cyan-200/90',
    happy: 'border-emerald-300/12 bg-emerald-400/[0.08] text-emerald-200/90',
    warn: 'border-amber-300/12 bg-amber-400/[0.08] text-amber-200/90',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 leading-none whitespace-nowrap ${tones[tone] || tones.neutral}`}>
      <span className="text-[7px] uppercase tracking-[0.12em] opacity-50">{label}</span>
      <span className="text-[10px] font-bold tabular-nums">{value}</span>
    </span>
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
  if (!world) return null;

  const pop = population ?? world.population ?? 0;
  const popCap = populationCap ?? phaseCap ?? world.housing_capacity ?? 50;
  const happy = happiness ?? world.happiness ?? 0;
  const food = world.food ?? 0;
  const combos = Math.floor(world.combo_balance || 0);
  const currentEvent = activeEvents?.[0] || null;

  return (
    <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto scrollbar-none" style={{ maxHeight: 36 }}>
      <Pill label="Pets" value={`${pop}/${popCap}`} tone="accent" />
      <Pill label="Mood" value={Math.round(happy)} tone={happy >= 70 ? 'happy' : happy >= 45 ? 'neutral' : 'warn'} />
      <Pill label="Food" value={Math.floor(food)} tone={food <= pop * 2 ? 'warn' : 'neutral'} />
      <Pill label="Combos" value={combos.toLocaleString()} tone="neutral" />
      {currentEvent ? (
        <Pill label="Event" value={currentEvent.name} tone="happy" />
      ) : null}
    </div>
  );
}

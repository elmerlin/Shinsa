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

function StatusDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={label}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
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
  collapsed,
  onToggle,
}) {
  if (!world) return null;

  const pop = population ?? world.population ?? 0;
  const popCap = populationCap ?? phaseCap ?? world.housing_capacity ?? 50;
  const happy = happiness ?? world.happiness ?? 0;
  const food = world.food ?? 0;
  const combos = Math.floor(world.combo_balance || 0);
  const currentEvent = activeEvents?.[0] || null;

  const moodColor = happy >= 70 ? '#6ee7b7' : happy >= 45 ? '#fcd34d' : '#fca5a5';
  const foodColor = food <= pop * 2 ? '#fca5a5' : '#9ca3af';

  if (collapsed) {
    return (
      <div className="pointer-events-auto flex items-center gap-1.5" style={{ maxHeight: 28 }}>
        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/10 bg-cyan-400/[0.06] px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-cyan-200/80">
          {pop}/{popCap}
        </span>
        <StatusDot color={moodColor} label={`Mood ${Math.round(happy)}`} />
        <StatusDot color={foodColor} label={`Food ${Math.floor(food)}`} />
        {currentEvent && <StatusDot color="#6ee7b7" label={currentEvent.name} />}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/25 transition-colors hover:text-white/50"
            aria-label="Expand HUD"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto scrollbar-none" style={{ maxHeight: 36 }}>
      <Pill label="Pets" value={`${pop}/${popCap}`} tone="accent" />
      <Pill label="Mood" value={Math.round(happy)} tone={happy >= 70 ? 'happy' : happy >= 45 ? 'neutral' : 'warn'} />
      <Pill label="Food" value={Math.floor(food)} tone={food <= pop * 2 ? 'warn' : 'neutral'} />
      <Pill label="Combos" value={combos.toLocaleString()} tone="neutral" />
      {currentEvent ? (
        <Pill label="Event" value={currentEvent.name} tone="happy" />
      ) : null}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/30 transition-colors hover:text-white/50"
          aria-label="Collapse HUD"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
            <path fillRule="evenodd" d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}

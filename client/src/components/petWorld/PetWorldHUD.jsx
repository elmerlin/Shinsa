import React, { useState } from 'react';

function HappinessBar({ value, target }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="group relative flex items-center gap-1">
      <span className="text-[10px]" role="img" aria-label="happiness">😊</span>
      <div className="w-10 h-[5px] rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-white/60">{Math.round(value)}</span>
      <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-50 whitespace-nowrap rounded bg-black/90 border border-white/10 px-2 py-1 text-[9px] text-white/70 shadow-lg">
        Happiness: {Math.round(value)}{target != null && ` / target ${Math.round(target)}`}
      </div>
    </div>
  );
}

function ResourceDot({ icon, value, capacity, tooltip, color }) {
  return (
    <div className="group relative flex items-center gap-1 px-1.5">
      <span className={`w-[6px] h-[6px] rounded-full ${color}`} />
      <span className="text-[10px] font-mono text-white/75 tabular-nums">
        {typeof value === 'number' ? Math.floor(value) : value}
        {capacity != null && <span className="text-white/35">/{capacity}</span>}
      </span>
      <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-50 whitespace-nowrap rounded bg-black/90 border border-white/10 px-2 py-1 text-[9px] text-white/70 shadow-lg">
        {tooltip}
      </div>
    </div>
  );
}

export default function PetWorldHUD({
  world,
  population,
  populationCap,
  happiness,
  happinessTarget,
  happinessBonus,
  housing,
  workers,
  availableWorkers,
  phaseCap,
  activeEvents,
  encounterCount,
  onShowEncounters,
  onShowVisitors,
  visitorsOnline,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!world) return null;

  const pop = population ?? world.population ?? 0;
  const popCap = populationCap ?? phaseCap ?? world.housing_capacity ?? 50;
  const happy = happiness ?? world.happiness ?? 0;
  const happyTarget = happinessTarget ?? world.happiness_target ?? null;
  const happyBonus = happinessBonus ?? world.happiness_bonus ?? null;
  const housingCap = housing ?? world.housing_capacity ?? 0;
  const workerCount = workers ?? (world.housing_capacity - (availableWorkers ?? world.available_workers ?? 0));
  const workerAvail = availableWorkers ?? world.available_workers ?? 0;

  const food = world.food ?? 0;
  const foodCap = world.food_capacity ?? 0;
  const wood = world.wood ?? 0;
  const woodCap = world.wood_capacity ?? 0;
  const stone = world.stone ?? 0;
  const stoneCap = world.stone_capacity ?? 0;
  const cloth = world.cloth ?? 0;
  const clothCap = world.cloth_capacity ?? 0;
  const gold = world.gold ?? 0;
  const goldCap = world.gold_capacity ?? 0;
  const combos = Math.floor(world.combo_balance || 0);

  return (
    <div className="bg-black/60 backdrop-blur-sm rounded-lg border border-white/[0.08] select-none">
      <div className="flex items-center gap-1 px-2 py-1.5 min-h-[36px] flex-wrap">
        {/* Population */}
        <div className="group relative flex items-center gap-1 px-1.5">
          <span className="text-[10px]">👥</span>
          <span className="text-[10px] font-mono text-white/80 tabular-nums font-semibold">{pop}/{popCap}</span>
          <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-50 whitespace-nowrap rounded bg-black/90 border border-white/10 px-2 py-1 text-[9px] text-white/70 shadow-lg">
            Population: {pop} / {popCap} cap
          </div>
        </div>

        <span className="w-px h-4 bg-white/10" />

        {/* Happiness */}
        <HappinessBar value={happy} target={happyTarget} />

        <span className="w-px h-4 bg-white/10" />

        {/* Workers */}
        <div className="group relative flex items-center gap-1 px-1.5">
          <span className="text-[10px]">⚒️</span>
          <span className="text-[10px] font-mono text-white/80 tabular-nums">{workerCount}/{workerAvail + workerCount}</span>
          <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-50 whitespace-nowrap rounded bg-black/90 border border-white/10 px-2 py-1 text-[9px] text-white/70 shadow-lg">
            Workers assigned / total
          </div>
        </div>

        <span className="w-px h-4 bg-white/10" />

        {/* Resources: compact dots */}
        <ResourceDot color="bg-amber-400" value={combos} tooltip={`Combos: ${combos}`} />
        <ResourceDot color="bg-emerald-400" value={food} capacity={foodCap} tooltip={`Food: ${Math.floor(food)}/${foodCap}`} />
        <ResourceDot color="bg-amber-600" value={wood} capacity={woodCap} tooltip={`Wood: ${Math.floor(wood)}/${woodCap}`} />
        <ResourceDot color="bg-slate-400" value={stone} capacity={stoneCap} tooltip={`Stone: ${Math.floor(stone)}/${stoneCap}`} />
        <ResourceDot color="bg-fuchsia-400" value={cloth} capacity={clothCap} tooltip={`Cloth: ${Math.floor(cloth)}/${clothCap}`} />
        <ResourceDot color="bg-yellow-400" value={gold} capacity={goldCap} tooltip={`Gold: ${Math.floor(gold)}/${goldCap}`} />

        {/* Encounter badge */}
        {encounterCount > 0 && (
          <button
            type="button"
            onClick={onShowEncounters}
            className="relative flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] transition-colors"
            title="Wildlife encounters"
          >
            <span>🐾</span>
            <span className="absolute -top-1 -right-1 w-3 h-3 flex items-center justify-center rounded-full bg-amber-500 text-[7px] font-bold text-black">
              {encounterCount}
            </span>
          </button>
        )}

        {/* Visitors online */}
        {visitorsOnline > 0 && (
          <button
            type="button"
            onClick={onShowVisitors}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[10px] transition-colors"
            title={`${visitorsOnline} visitor${visitorsOnline !== 1 ? 's' : ''} online`}
          >
            <span className="w-[5px] h-[5px] rounded-full bg-emerald-400 animate-pulse" />
            <span>{visitorsOnline}</span>
          </button>
        )}

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto flex items-center justify-center w-5 h-5 rounded bg-white/[0.06] hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors text-[10px]"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? '⬆' : '⬇'}
        </button>
      </div>

      {/* Seasonal event banner */}
      {activeEvents && activeEvents.length > 0 && (
        <div className="border-t border-white/[0.06] px-2 py-1 flex items-center gap-2 overflow-x-auto">
          {activeEvents.map((event) => {
            const eventStyles = {
              spring_bloom: 'from-pink-500/15 to-emerald-500/15 border-pink-400/10 text-pink-300 shadow-[0_0_12px_rgba(236,72,153,0.15)]',
              summer_festival: 'from-amber-500/15 to-orange-500/15 border-amber-400/10 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
              harvest_moon: 'from-orange-500/15 to-amber-700/15 border-orange-400/10 text-orange-300 shadow-[0_0_12px_rgba(234,88,12,0.15)]',
              winter_solstice: 'from-blue-500/15 to-cyan-500/15 border-blue-400/10 text-blue-300 shadow-[0_0_12px_rgba(56,189,248,0.15)]',
            };
            const style = eventStyles[event.id] || 'from-violet-500/15 to-fuchsia-500/15 border-violet-400/10 text-violet-300';
            const daysText = typeof event.daysLeft === 'number'
              ? event.daysLeft === 0 ? 'last day!' : `${event.daysLeft}d left`
              : null;
            const desc = event.description && event.description.length > 60
              ? event.description.slice(0, 57) + '...'
              : event.description;
            return (
              <div key={event.id} className={`group relative flex items-center gap-1.5 bg-gradient-to-r ${style} rounded-lg px-2 py-0.5 border shrink-0`}>
                <span className="w-[5px] h-[5px] rounded-full bg-current animate-pulse" style={{ filter: 'blur(0.5px)' }} />
                {event.icon && <span className="text-[11px]">{event.icon}</span>}
                <span className="text-[11px] font-semibold">{event.name}</span>
                {daysText && <span className="text-[9px] text-white/50">{daysText}</span>}
                {desc && (
                  <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-50 max-w-[240px] rounded bg-black/90 border border-white/10 px-2 py-1 text-[9px] text-white/70 shadow-lg">
                    {event.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded detail row */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-2 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] text-white/60 sm:grid-cols-4 lg:grid-cols-7">
          <div>
            <span className="uppercase tracking-wider text-white/35">Combos</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">{combos.toLocaleString()}</div>
          </div>
          <div>
            <span className="uppercase tracking-wider text-white/35">Food</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">{Math.floor(food)}/{foodCap}</div>
          </div>
          <div>
            <span className="uppercase tracking-wider text-white/35">Wood</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">{Math.floor(wood)}/{woodCap}</div>
          </div>
          <div>
            <span className="uppercase tracking-wider text-white/35">Stone</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">{Math.floor(stone)}/{stoneCap}</div>
          </div>
          <div>
            <span className="uppercase tracking-wider text-white/35">Cloth</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">{Math.floor(cloth)}/{clothCap}</div>
          </div>
          <div>
            <span className="uppercase tracking-wider text-white/35">Gold</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">{Math.floor(gold)}/{goldCap}</div>
          </div>
          <div>
            <span className="uppercase tracking-wider text-white/35">Happiness</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">
              {Math.round(happy)}{happyBonus != null && <span className="text-emerald-400/60"> +{happyBonus}</span>}
            </div>
          </div>
          <div>
            <span className="uppercase tracking-wider text-white/35">Housing</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">{housingCap}</div>
          </div>
          <div>
            <span className="uppercase tracking-wider text-white/35">Workers</span>
            <div className="font-mono text-white/80 font-bold text-[11px]">{workerCount} / {workerAvail + workerCount}</div>
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';

function StatPill({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-white/10 bg-white/[0.05] text-white/80',
    emerald: 'border-emerald-400/20 bg-emerald-500/[0.12] text-emerald-100',
    amber: 'border-amber-400/20 bg-amber-500/[0.12] text-amber-100',
    sky: 'border-sky-400/20 bg-sky-500/[0.12] text-sky-100',
    rose: 'border-rose-400/20 bg-rose-500/[0.12] text-rose-100',
    fuchsia: 'border-fuchsia-400/20 bg-fuchsia-500/[0.12] text-fuchsia-100',
    yellow: 'border-yellow-400/20 bg-yellow-500/[0.12] text-yellow-100',
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone] || tones.slate}`}>
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-1 text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}

export default function PetWorldHUD({ world, title, subtitle, actions }) {
  if (!world) return null;
  return (
    <section className="rounded-[1.4rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,28,0.96),rgba(9,12,18,0.92))] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/50">{title}</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">{subtitle}</h1>
          <p className="mt-1 text-sm text-white/52">
            {world.population} pets, {world.housing_capacity} housing, {world.available_workers} worker slots open.
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatPill label="Combos" value={Math.floor(world.combo_balance || 0).toLocaleString()} tone="amber" />
        <StatPill label="Food" value={`${world.food?.toFixed?.(1) ?? world.food}/${world.food_capacity}`} tone="emerald" />
        <StatPill label="Wood" value={`${world.wood?.toFixed?.(1) ?? world.wood}/${world.wood_capacity}`} tone="amber" />
        <StatPill label="Stone" value={`${world.stone?.toFixed?.(1) ?? world.stone}/${world.stone_capacity}`} tone="slate" />
        <StatPill label="Cloth" value={`${world.cloth?.toFixed?.(1) ?? world.cloth}/${world.cloth_capacity}`} tone="fuchsia" />
        <StatPill label="Gold" value={`${world.gold?.toFixed?.(1) ?? world.gold}/${world.gold_capacity}`} tone="yellow" />
        <StatPill label="Happiness" value={`${Math.round(world.happiness || 0)}`} tone="rose" />
      </div>
    </section>
  );
}

import React from 'react';

const MOMENT_STYLES = {
  bond_rank: { icon: '💗', accent: 'border-pink-400/15 bg-pink-500/[0.04]', label: 'Bond Milestone' },
  form_upgrade: { icon: '⭐', accent: 'border-amber-400/15 bg-amber-500/[0.04]', label: 'Form Evolution' },
  mastery_milestone: { icon: '🧠', accent: 'border-cyan-400/15 bg-cyan-500/[0.04]', label: 'Mastery Node' },
  favorite_toy: { icon: '🎁', accent: 'border-emerald-400/12 bg-emerald-500/[0.03]', label: 'Toy Discovery' },
  memory_unlocked: { icon: '📸', accent: 'border-violet-400/12 bg-violet-500/[0.03]', label: 'Memory Unlocked' },
  streak_milestone: { icon: '🔥', accent: 'border-orange-400/15 bg-orange-500/[0.04]', label: 'Streak' },
};

export default function PetMomentCard({ moment }) {
  if (!moment) return null;
  const style = MOMENT_STYLES[moment.type] || MOMENT_STYLES.memory_unlocked;

  return (
    <div className={`rounded-xl border p-3 ${style.accent} transition-all`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0 mt-0.5">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-white/40">{style.label}</span>
            {moment.date && <span className="text-[9px] text-white/25">{moment.date}</span>}
          </div>
          <div className="text-[12px] font-bold text-white/90 mt-0.5">{moment.title}</div>
          {moment.detail && (
            <div className="text-[11px] text-white/55 mt-1 leading-relaxed">{moment.detail}</div>
          )}
        </div>
      </div>
    </div>
  );
}

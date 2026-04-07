import React from 'react';

const SURFACE_LINKS = {
  feed: { label: 'Feed', scroll: 'food' },
  pet: { label: 'Pet tab', scroll: 'pet' },
  training: { label: 'Training', href: '/training' },
  live: { label: 'Live', href: '/live' },
  profile: { label: 'Profile', href: '/profile' },
  weekly: { label: 'Weekly', href: '/weekly-challenge' },
  hop: { label: 'Hour of Power', href: '/live' },
};

export default function PetCoachPanel({ coach, character, onTabSwitch }) {
  if (!coach) return null;

  const surface = SURFACE_LINKS[coach.related_surface] || null;

  const priorityAccent = {
    care: 'border-red-500/15 bg-red-500/[0.04]',
    recovery: 'border-amber-500/12 bg-amber-500/[0.04]',
    accuracy: 'border-sky-400/12 bg-sky-400/[0.03]',
    stamina: 'border-orange-400/12 bg-orange-400/[0.03]',
    tech: 'border-violet-400/12 bg-violet-400/[0.03]',
    social: 'border-pink-400/12 bg-pink-400/[0.03]',
    tournament: 'border-yellow-400/12 bg-yellow-400/[0.03]',
    consistency: 'border-emerald-400/12 bg-emerald-400/[0.03]',
  };

  const priorityIcon = {
    care: '🍖', recovery: '💤', accuracy: '🎯', stamina: '💪',
    tech: '🧠', social: '✨', tournament: '🏆', consistency: '🪴',
  };

  const handleCta = () => {
    if (surface?.scroll && onTabSwitch) {
      onTabSwitch(surface.scroll);
    } else if (surface?.href) {
      window.location.href = surface.href;
    }
  };

  return (
    <div className={`rounded-xl border p-3 ${priorityAccent[coach.priority] || priorityAccent.consistency}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0 mt-0.5">{priorityIcon[coach.priority] || '🐾'}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold text-white/90">{coach.headline}</div>
          <div className="text-[11px] text-white/65 mt-1 leading-relaxed">{coach.suggestion}</div>
          <div className="text-[10px] text-white/40 mt-1.5 italic">{coach.why}</div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleCta}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-white/80 hover:bg-white/[0.07] hover:border-white/15 transition-all active:scale-[0.97]"
            >
              {coach.cta_label}
            </button>
            <span className="text-[9px] text-white/30 uppercase tracking-wider">{coach.focus}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

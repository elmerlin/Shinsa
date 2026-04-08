import React, { useState, useEffect, useCallback } from 'react';
import SpritePet from '../SpritePet';

const STORAGE_KEY = 'pet_onboarding_seen';

const SLIDES = [
  {
    id: 'welcome',
    badge: 'New Feature',
    title: 'Meet Your Companion',
    body: 'Every player gets a personal pet companion that grows alongside your PIU journey. Feed it, care for it, and watch it evolve into something uniquely yours.',
    petMood: 'happy',
    petReaction: '',
    accent: 'cyan',
    bg: 'from-cyan-500/[0.08] via-purple-500/[0.04] to-transparent',
  },
  {
    id: 'loop',
    badge: 'Core Loop',
    title: 'Play. Care. Grow.',
    body: 'Play Pump to earn Combo and Momentum. Spend Combo on food and care to keep your pet healthy. Good wellbeing turns into Bond — your permanent progression.',
    petMood: 'happy',
    petReaction: 'nod',
    accent: 'amber',
    bg: 'from-amber-500/[0.06] via-orange-500/[0.03] to-transparent',
    steps: [
      { icon: '🎮', label: 'Play Pump', sub: 'Earn Combo & Momentum' },
      { icon: '🥣', label: 'Care', sub: 'Feed, rest, interact' },
      { icon: '💎', label: 'Grow Bond', sub: 'Unlock ranks & forms' },
    ],
  },
  {
    id: 'stats',
    badge: 'Vital Stats',
    title: 'Keep Them Healthy',
    body: 'Your pet has four vital stats to manage. Hunger and Energy are the basics — Trust and Momentum unlock the fun stuff.',
    petMood: 'content',
    petReaction: 'proud',
    accent: 'emerald',
    bg: 'from-emerald-500/[0.06] via-cyan-500/[0.03] to-transparent',
    stats: [
      { name: 'Hunger', icon: '🍖', color: 'orange', desc: 'Feed regularly' },
      { name: 'Energy', icon: '⚡', color: 'cyan', desc: 'Rest to recover' },
      { name: 'Trust', icon: '🤝', color: 'emerald', desc: 'Consistent care' },
      { name: 'Momentum', icon: '🔥', color: 'violet', desc: 'Play Pump often' },
    ],
  },
  {
    id: 'features',
    badge: 'What You Can Do',
    title: 'More Than A Pet',
    body: 'Customise your companion with hats, outfits, and habitat decorations. Complete missions, play minigames, and climb the bond leaderboard.',
    petMood: 'happy',
    petReaction: 'hop',
    accent: 'pink',
    bg: 'from-pink-500/[0.06] via-purple-500/[0.03] to-transparent',
    features: [
      { icon: '👒', label: 'Wardrobe & Style' },
      { icon: '🏠', label: 'Habitat Customisation' },
      { icon: '🎮', label: 'Pet Minigames' },
      { icon: '📋', label: 'Missions & Requests' },
      { icon: '⭐', label: 'Evolution Forms' },
      { icon: '🏆', label: 'Bond Leaderboard' },
    ],
  },
  {
    id: 'cta',
    badge: 'Ready?',
    title: 'Choose Your Companion',
    body: 'Four unique characters are waiting. Each has their own personality, favourite foods, and playstyle fit. Your journey starts now.',
    petMood: 'happy',
    petReaction: 'kata',
    accent: 'amber',
    bg: 'from-amber-500/[0.08] via-cyan-500/[0.04] to-transparent',
    characters: [
      { id: 'dojocat', name: 'Dojo Cat' },
      { id: 'buu', name: 'Buu' },
      { id: 'devit', name: 'Devit' },
      { id: 'pixiu', name: 'Pixiu' },
    ],
  },
];

const ACCENT_MAP = {
  cyan: { badge: 'border-cyan-400/20 bg-cyan-500/[0.08] text-cyan-200', dot: 'bg-cyan-400', dotInactive: 'bg-cyan-400/25', btn: 'bg-cyan-500/20 border-cyan-400/25 text-cyan-100 hover:bg-cyan-500/30 shadow-[0_0_16px_rgba(34,211,238,0.10)]' },
  amber: { badge: 'border-amber-400/20 bg-amber-500/[0.08] text-amber-200', dot: 'bg-amber-400', dotInactive: 'bg-amber-400/25', btn: 'bg-amber-500/20 border-amber-400/25 text-amber-100 hover:bg-amber-500/30 shadow-[0_0_16px_rgba(245,158,11,0.10)]' },
  emerald: { badge: 'border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-200', dot: 'bg-emerald-400', dotInactive: 'bg-emerald-400/25', btn: 'bg-emerald-500/20 border-emerald-400/25 text-emerald-100 hover:bg-emerald-500/30 shadow-[0_0_16px_rgba(52,211,153,0.10)]' },
  pink: { badge: 'border-pink-400/20 bg-pink-500/[0.08] text-pink-200', dot: 'bg-pink-400', dotInactive: 'bg-pink-400/25', btn: 'bg-pink-500/20 border-pink-400/25 text-pink-100 hover:bg-pink-500/30 shadow-[0_0_16px_rgba(236,72,153,0.10)]' },
};

export default function PetOnboardingModal({ onNavigateToPet }) {
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(0);
  const [closing, setClosing] = useState(false);
  const [petExpression, setPetExpression] = useState('');

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Small delay so the page loads first
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const slide = SLIDES[page];
    if (slide?.petReaction) {
      setPetExpression(slide.petReaction);
      const t = setTimeout(() => setPetExpression(''), 1200);
      return () => clearTimeout(t);
    }
  }, [page, visible]);

  const dismiss = useCallback(() => {
    setClosing(true);
    localStorage.setItem(STORAGE_KEY, '1');
    setTimeout(() => setVisible(false), 300);
  }, []);

  const handleCta = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1');
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      if (onNavigateToPet) onNavigateToPet();
    }, 250);
  }, [onNavigateToPet]);

  if (!visible) return null;

  const slide = SLIDES[page];
  const accent = ACCENT_MAP[slide.accent] || ACCENT_MAP.cyan;
  const isLast = page === SLIDES.length - 1;

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-3xl border border-white/[0.08] bg-piu-dark shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
        {/* Background gradient */}
        <div className={`absolute inset-0 bg-gradient-to-b ${slide.bg} pointer-events-none`} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.03),transparent_60%)] pointer-events-none" />

        {/* Close button */}
        <button onClick={dismiss} className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full border border-white/[0.08] bg-white/[0.04] flex items-center justify-center text-gray-500 hover:text-white hover:border-white/15 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
        </button>

        {/* Content */}
        <div className="relative px-6 pt-8 pb-6">
          {/* Badge */}
          <div className="flex justify-center mb-4">
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${accent.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${accent.dot} animate-pulse`} />
              {slide.badge}
            </div>
          </div>

          {/* Pet sprite */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.2)]" style={{ animation: 'pet-onboard-float 3s ease-in-out infinite' }}>
                {slide.id === 'cta' ? (
                  <div className="flex items-end gap-2">
                    {slide.characters.map((c, i) => (
                      <div key={c.id} className="transition-all" style={{ animation: `pop-in 400ms ease-out ${i * 100}ms backwards` }}>
                        <SpritePet character={c.id} weightState="normal" mood="happy" size={48} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <SpritePet character="dojocat" weightState="normal" mood={slide.petMood} reaction={petExpression} size={96} />
                )}
              </div>
              {/* Ambient glow behind pet */}
              <div className="absolute inset-0 -z-10 rounded-2xl opacity-40 blur-xl" style={{ background: `radial-gradient(circle, ${slide.accent === 'cyan' ? 'rgba(34,211,238,0.2)' : slide.accent === 'amber' ? 'rgba(245,158,11,0.2)' : slide.accent === 'emerald' ? 'rgba(52,211,153,0.2)' : 'rgba(236,72,153,0.2)'}, transparent 70%)` }} />
            </div>
          </div>

          {/* Title & body */}
          <div className="text-center mb-5" key={slide.id} style={{ animation: 'onboard-fade-in 350ms ease-out' }}>
            <h2 className="text-2xl font-black tracking-tight text-white">{slide.title}</h2>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed max-w-xs mx-auto">{slide.body}</p>
          </div>

          {/* Slide-specific content */}
          {slide.steps && (
            <div className="flex justify-center gap-3 mb-5" style={{ animation: 'onboard-fade-in 400ms ease-out 100ms backwards' }}>
              {slide.steps.map((step, i) => (
                <React.Fragment key={step.label}>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl border border-white/[0.06] bg-white/[0.03] flex items-center justify-center text-xl mx-auto mb-1.5">{step.icon}</div>
                    <div className="text-[11px] font-semibold text-white/85">{step.label}</div>
                    <div className="text-[9px] text-gray-500 mt-0.5">{step.sub}</div>
                  </div>
                  {i < slide.steps.length - 1 && (
                    <div className="flex items-center pt-1 text-white/20 text-xs">&rarr;</div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {slide.stats && (
            <div className="grid grid-cols-2 gap-2 mb-5" style={{ animation: 'onboard-fade-in 400ms ease-out 100ms backwards' }}>
              {slide.stats.map(s => {
                const colors = { orange: 'border-orange-400/15 bg-orange-500/[0.06]', cyan: 'border-cyan-400/15 bg-cyan-500/[0.06]', emerald: 'border-emerald-400/15 bg-emerald-500/[0.06]', violet: 'border-violet-400/15 bg-violet-500/[0.06]' };
                return (
                  <div key={s.name} className={`rounded-xl border p-2.5 ${colors[s.color] || ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{s.icon}</span>
                      <span className="text-[11px] font-semibold text-white/85">{s.name}</span>
                    </div>
                    <div className="text-[10px] text-white/50 mt-1">{s.desc}</div>
                  </div>
                );
              })}
            </div>
          )}

          {slide.features && (
            <div className="grid grid-cols-3 gap-2 mb-5" style={{ animation: 'onboard-fade-in 400ms ease-out 100ms backwards' }}>
              {slide.features.map(f => (
                <div key={f.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2 text-center">
                  <div className="text-lg mb-1">{f.icon}</div>
                  <div className="text-[9px] text-white/70 font-medium leading-tight">{f.label}</div>
                </div>
              ))}
            </div>
          )}

          {slide.id === 'cta' && (
            <div className="flex justify-center mb-5" style={{ animation: 'onboard-fade-in 400ms ease-out 100ms backwards' }}>
              <div className="flex gap-2">
                {slide.characters.map(c => (
                  <div key={c.id} className="text-center">
                    <div className="text-[9px] text-white/60 font-medium">{c.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            {/* Dots */}
            <div className="flex gap-1.5">
              {SLIDES.map((_, i) => (
                <button key={i} onClick={() => setPage(i)} className={`h-1.5 rounded-full transition-all duration-300 ${i === page ? `w-6 ${accent.dot}` : `w-1.5 ${accent.dotInactive}`}`} />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {page > 0 && (
                <button onClick={() => setPage(p => p - 1)} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[11px] font-semibold text-white/70 hover:text-white hover:border-white/15 transition-all">
                  Back
                </button>
              )}
              {isLast ? (
                <button onClick={handleCta} className={`action-btn rounded-xl border px-5 py-2 text-[11px] font-bold transition-all ${accent.btn}`}>
                  Choose Companion &rarr;
                </button>
              ) : (
                <button onClick={() => setPage(p => p + 1)} className={`action-btn rounded-xl border px-4 py-2 text-[11px] font-semibold transition-all ${accent.btn}`}>
                  Next
                </button>
              )}
            </div>
          </div>

          {/* Skip */}
          <div className="mt-3 text-center">
            <button onClick={dismiss} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
              Skip intro
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pet-onboard-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes onboard-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pop-in { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.04); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

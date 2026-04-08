import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SpritePet from '../components/SpritePet';

// ─── Section data ─────────────────────────────────────────────
const CHARACTERS = [
  { id: 'dojocat', name: 'Dojo Cat', title: 'Proud Training Companion', desc: 'Disciplined, proud, and dependable once trust is earned. Favours structured training and clean form.', color: 'amber', favFood: 'Pump Chow, Step Fuel, Banya Biscuits', personality: 'Best for players who like structure, training, and clean form.' },
  { id: 'buu', name: 'Buu', title: 'Indulgent Rhythm Goblin', desc: 'Food-motivated, playful, and always ready to show off. Lives for replays and social moments.', color: 'pink', favFood: 'Beat Bites, Dance Dust, Doof Bites', personality: 'Best for players who want a loud, social, cosy little menace.' },
  { id: 'devit', name: 'Devit', title: 'Chaotic Step Gremlin', desc: 'Restless, mischievous, and happiest when things get intense. Thrives on doubles and adrenaline.', color: 'red', favFood: 'Doof Bites, Adrenaline Chow, Slam Grub', personality: 'Best for grinders, doubles players, and chaos enjoyers.' },
  { id: 'pixiu', name: 'Pixiu', title: 'Ceremonial Luck Guardian', desc: 'Warm, lucky, and deeply rewarding for consistent caretakers. Loves weekly challenges and community events.', color: 'cyan', favFood: 'Rhythm Rations, Banya Biscuits, Pad Power', personality: 'Best for players who want calm, ritual, and long-term bond building.' },
];

const STAT_CARDS = [
  { name: 'Hunger', icon: '🍖', color: 'orange', desc: 'Core upkeep. Low hunger blocks demanding actions and slows recovery.', tip: 'Food restores it. Favourite foods give stronger mood and trust bonuses.', danger: 'Below 15% your pet should be fed before hard activity.' },
  { name: 'Energy', icon: '⚡', color: 'cyan', desc: 'Action budget. Activities, minigames, and performances spend it.', tip: 'Rest and good hunger restore it over time.', danger: 'Below 20% your pet loses access to demanding actions.' },
  { name: 'Trust', icon: '🤝', color: 'emerald', desc: 'Relationship depth. Unlocks stronger interactions and more advanced actions.', tip: 'Grows through consistent care, grooming, bonding, and meeting requests.', danger: 'Neglect causes slow trust decay after long gaps without care.' },
  { name: 'Momentum', icon: '🔥', color: 'violet', desc: 'Short-term scene energy from recent Pump play.', tip: 'Syncing sessions, strong grades, replays, and hard clears raise it.', danger: 'It fades quickly and gates showcase-style actions when too low.' },
  { name: 'Bond', icon: '💎', color: 'amber', desc: 'Permanent progression. It never decays.', tip: 'Unlocks ranks, forms, cosmetics, and long-term identity.', danger: 'Low wellbeing slows how efficiently you build it.' },
  { name: 'Combo', icon: '🎵', color: 'pink', desc: 'Primary pet currency earned from real Pump play.', tip: 'Spend it on food, toys, habitat items, and minigames.', danger: 'No Combo means no easy recovery items, so play and care must stay in rhythm.' },
];

const LOOP_STEPS = [
  { n: 1, title: 'Play Pump', body: 'Synced plays give Combo, XP, mastery progress, and Momentum. Harder charts and better grades pay more.', icon: '🎮' },
  { n: 2, title: 'Care For Your Pet', body: 'Spend Combo on food, rest, toys, and upkeep so Hunger and Energy stay healthy.', icon: '🥣' },
  { n: 3, title: 'Use Good Wellbeing', body: 'Healthy pets can spar, explore, perform, and take on stronger requests more reliably.', icon: '💪' },
  { n: 4, title: 'Grow Bond', body: 'Good care and good Pump habits turn into Bond, Tokens, Shards, ranks, forms, and personality.', icon: '💎' },
];

const THRESHOLD_ROWS = [
  { stat: 'Hunger', safe: '40%+', warning: '15-39%', critical: '0-14%', effect: 'Very low hunger blocks demanding actions.' },
  { stat: 'Energy', safe: '35%+', warning: '20-34%', critical: '0-19%', effect: 'Low energy blocks activities, minigames, and performances.' },
  { stat: 'Trust', safe: '40%+', warning: '25-39%', critical: '0-24%', effect: 'Low trust locks stronger interactions and higher-tier actions.' },
  { stat: 'Momentum', safe: '20%+', warning: '1-19%', critical: '0%', effect: 'Low momentum weakens the "showcase" side of the pet loop.' },
];

const ACTION_GROUPS = [
  {
    title: 'Care', icon: '🥣', color: 'emerald',
    items: [
      'Food restores Hunger and usually helps Energy.',
      'Rest restores Energy but can make your pet hungry again.',
      'Favourite foods give stronger mood and trust bonuses.',
      'Disliked foods still help upkeep, but they are less efficient emotionally.',
    ],
  },
  {
    title: 'Bonding', icon: '🫶', color: 'pink',
    items: [
      'Praise, cuddles, grooming, and toys help Trust and Bond.',
      'Trust grows best from consistency, not spam.',
      'If you only tap endlessly, returns diminish quickly.',
      'Strong Trust unlocks better activities and a more capable companion.',
    ],
  },
  {
    title: 'Activities', icon: '🎮', color: 'cyan',
    items: [
      'Train, play, groom, rest, spar, and explore each trade Energy and Hunger for progress.',
      'Spar and explore need good Energy, Hunger, and Momentum.',
      'The pet should feel like it has to be maintained before the fun stuff works.',
      'Higher Bond means the same actions carry more long-term meaning.',
    ],
  },
  {
    title: 'Requests', icon: '📌', color: 'amber',
    items: [
      'Your pet now surfaces direct needs such as a meal, recovery, bonding, or a Pump session.',
      'Completed requests become claimable rewards.',
      'Ignored requests can expire and hurt relationship quality.',
      'Requests are meant to tell you what the pet needs next instead of making you guess.',
    ],
  },
];

const CURRENCIES = [
  { name: 'Combo', desc: 'Earned from synced plays. Main spending currency.', icon: '🎵', color: 'amber' },
  { name: 'Bond Tokens', desc: 'Earned from missions, requests, and deeper progression beats.', icon: '💎', color: 'cyan' },
  { name: 'Shards', desc: 'Rare progression currency tied to stronger rewards and future premium unlocks.', icon: '✨', color: 'fuchsia' },
  { name: 'XP', desc: 'Levels up your companion and unlocks tricks and milestones.', icon: '⭐', color: 'purple' },
];

const BOND_RANKS = [
  { threshold: 0, label: 'Training Partner', desc: 'Your journey begins here.', color: 'gray' },
  { threshold: 40, label: 'Pad Gremlin', desc: 'Unlocks Perform interaction, Neon Alley, LED Tiles.', color: 'emerald' },
  { threshold: 90, label: 'Dojo Mascot', desc: 'Unlocks Sakura Garden, Arcade Cabinet, Photo Wall.', color: 'cyan' },
  { threshold: 160, label: 'Arena Spirit', desc: 'Unlocks Thunderdome, Galaxy Floor, Champion Banner.', color: 'purple' },
  { threshold: 260, label: 'Blessed Beast', desc: 'Unlocks Celestial Shrine and ultimate customisation.', color: 'amber' },
];

const FORMS = [
  { id: 'fresh', label: 'Fresh Form', req: 'Default', desc: 'A young companion finding its rhythm.', color: 'gray' },
  { id: 'trusted', label: 'Trusted Form', req: 'Bond 90 + Mastery 45', desc: 'Shaped by routine and trust.', color: 'emerald' },
  { id: 'showcase', label: 'Showcase Form', req: 'Bond 190 + Mastery 120', desc: 'Polished and turns heads.', color: 'cyan' },
  { id: 'ascendant', label: 'Ascendant Form', req: 'Bond 320 + Mastery 220', desc: 'Scene-defining presence.', color: 'amber' },
  { id: 'beyond', label: 'Beyond Form', req: 'Bond 500 + Mastery 400', desc: 'Surpassed all known limits.', color: 'purple' },
];

const FOODS = [
  { name: 'Pump Chow', cost: 22, hunger: 7, happy: 1, emoji: '🥩' },
  { name: 'Beat Bites', cost: 28, hunger: 6, happy: 5, emoji: '🍪' },
  { name: 'Dance Dust', cost: 18, hunger: 3, happy: 10, emoji: '✨' },
  { name: 'Slam Grub', cost: 36, hunger: 11, happy: 2, emoji: '🍖' },
  { name: 'Step Fuel', cost: 42, hunger: 13, happy: 4, emoji: '⚡' },
  { name: 'Rhythm Rations', cost: 26, hunger: 5, happy: 7, emoji: '🎵' },
  { name: 'Doof Bites', cost: 32, hunger: 9, happy: 6, emoji: '🔥' },
  { name: 'Gargoyle Munch', cost: 52, hunger: 16, happy: 2, emoji: '👹' },
  { name: 'Adrenaline Chow', cost: 82, hunger: 25, happy: 10, emoji: '🚀' },
  { name: 'Pad Power', cost: 68, hunger: 21, happy: 8, emoji: '💪' },
  { name: 'Banya Biscuits', cost: 94, hunger: 24, happy: 16, emoji: '🏆' },
];

const MASTERY_PATHS = [
  { path: 'accuracy', icon: '🎯', label: 'Accuracy', desc: 'Clean timing and high grades. Gains XP from AAA+ plays.' },
  { path: 'stamina', icon: '💪', label: 'Stamina', desc: 'Hard charts and endurance. Gains XP from Lv18+ clears.' },
  { path: 'tech', icon: '🧠', label: 'Tech', desc: 'Footwork and doubles. Gains XP from doubles and Lv17+ charts.' },
  { path: 'consistency', icon: '🌱', label: 'Consistency', desc: 'Daily care and steady habits. Gains XP from regular play.' },
  { path: 'tournament', icon: '🏆', label: 'Tournament', desc: 'Competitive focus. Gains XP from hard charts and weekly challenges.' },
  { path: 'social', icon: '✨', label: 'Social', desc: 'Scene presence. Gains XP from replays and community engagement.' },
];

const WEIGHT_STATES = [
  { range: '0-14%', state: 'Starving', look: 'Visibly thin, rib lines' },
  { range: '15-35%', state: 'Thin', look: 'Slender frame' },
  { range: '36-65%', state: 'Normal', look: 'Healthy, balanced' },
  { range: '66-85%', state: 'Chubby', look: 'Rounded belly, short legs' },
  { range: '86-100%', state: 'Fat', look: 'Big belly droop, wide feet' },
];

const TIPS = [
  { text: 'If your pet feels "stuck," check Hunger first, then Energy, then Momentum.', icon: '🔍' },
  { text: 'Momentum is supposed to fade quickly. It reflects recent Pump activity, not permanent mood.', icon: '🔥' },
  { text: 'Trust is slow by design. Reliable care beats one big burst.', icon: '🤝' },
  { text: 'Bond never decays, so short rough patches do not erase your long-term progress.', icon: '💎' },
  { text: 'Requests are your best "what should I do next?" surface.', icon: '📌' },
  { text: 'Favourite foods give stronger mood and trust bonuses than regular food.', icon: '🍖' },
];

// ─── Table of Contents ────────────────────────────────────────
const TOC = [
  { id: 'characters', label: 'Meet the Companions' },
  { id: 'core-loop', label: 'Core Loop' },
  { id: 'vitals', label: 'Vital Stats' },
  { id: 'thresholds', label: 'Thresholds & Locks' },
  { id: 'actions', label: 'How Actions Fit' },
  { id: 'feeding', label: 'Feeding & Food' },
  { id: 'requests', label: 'Requests & Missions' },
  { id: 'bond', label: 'Bond & Ranks' },
  { id: 'evolution', label: 'Evolution Forms' },
  { id: 'mastery', label: 'Training Paths' },
  { id: 'economy', label: 'Economy & Currency' },
  { id: 'tips', label: 'Quick Tips' },
];

// ─── Animated section observer ────────────────────────────────
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.12 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function RevealSection({ children, className = '', delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ─── Reusable components ──────────────────────────────────────
function SectionHeading({ id, icon, title, subtitle }) {
  return (
    <div id={id} className="scroll-mt-20 pt-8 pb-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.06] flex items-center justify-center text-lg shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.03)]">{icon}</div>
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-3 h-px bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent" />
    </div>
  );
}

function InfoCard({ children, className = '', glow }) {
  const glowBorder = glow === 'gold' ? 'border-amber-400/15' : glow === 'cyan' ? 'border-cyan-400/15' : glow === 'pink' ? 'border-pink-400/15' : glow === 'emerald' ? 'border-emerald-400/15' : glow === 'violet' ? 'border-violet-400/15' : 'border-white/[0.06]';
  const glowBg = glow === 'gold' ? 'bg-amber-500/[0.03]' : glow === 'cyan' ? 'bg-cyan-500/[0.03]' : glow === 'pink' ? 'bg-pink-500/[0.03]' : glow === 'emerald' ? 'bg-emerald-500/[0.03]' : glow === 'violet' ? 'bg-violet-500/[0.03]' : 'bg-white/[0.02]';
  return <div className={`rounded-xl border ${glowBorder} ${glowBg} p-4 ${className}`}>{children}</div>;
}

function Chip({ children, color = 'gray' }) {
  const styles = {
    amber: 'border-amber-400/20 bg-amber-500/[0.08] text-amber-200',
    cyan: 'border-cyan-400/15 bg-cyan-500/[0.06] text-cyan-200',
    pink: 'border-pink-400/15 bg-pink-500/[0.06] text-pink-200',
    purple: 'border-purple-400/15 bg-purple-500/[0.06] text-purple-200',
    emerald: 'border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-200',
    violet: 'border-violet-400/15 bg-violet-500/[0.06] text-violet-200',
    red: 'border-red-400/15 bg-red-500/[0.06] text-red-200',
    gray: 'border-white/[0.08] bg-white/[0.03] text-gray-300',
  };
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${styles[color] || styles.gray}`}>{children}</span>;
}

function statColorClass(color) {
  return {
    orange: 'border-orange-400/15 bg-orange-500/[0.06] text-orange-200',
    cyan: 'border-cyan-400/15 bg-cyan-500/[0.06] text-cyan-200',
    emerald: 'border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-200',
    violet: 'border-violet-400/15 bg-violet-500/[0.06] text-violet-200',
    amber: 'border-amber-400/15 bg-amber-500/[0.06] text-amber-200',
    pink: 'border-pink-400/15 bg-pink-500/[0.06] text-pink-200',
  }[color] || 'border-white/[0.08] bg-white/[0.03] text-gray-200';
}

// ─── Main Page ────────────────────────────────────────────────
export default function PetGuidePage() {
  const [activeCharacter, setActiveCharacter] = useState('dojocat');
  const [tocOpen, setTocOpen] = useState(false);

  return (
    <div className="min-h-screen bg-piu-dark pb-28">
      {/* ═══ Hero ═══ */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/[0.06] via-purple-500/[0.03] to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(139,92,246,0.08),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.10),transparent_38%),radial-gradient(circle_at_bottom,rgba(245,158,11,0.08),transparent_35%)]" />
        <div className="relative max-w-3xl mx-auto px-4 pt-10 pb-8 text-center">
          <RevealSection>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-1 text-[10px] font-semibold text-cyan-200 uppercase tracking-[0.16em] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Pet Companion Guide
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              Pump more.
              <br />
              <span className="bg-gradient-to-r from-amber-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent">
                Care better.
              </span>
              <br />
              Grow together.
            </h1>
            <p className="text-sm text-gray-400 mt-4 max-w-lg mx-auto leading-relaxed">
              The pet system is built around a simple loop: real Pump play creates resources and Momentum,
              then good care turns those into Bond, unlocks, and a stronger companion identity.
            </p>
            <div className="mt-5 inline-flex rounded-xl border border-amber-400/15 bg-amber-500/[0.06] px-4 py-2 text-[11px] font-semibold text-amber-200 tracking-wide">
              Pump &rarr; Combo + Momentum &rarr; Care &rarr; Bond
            </div>
          </RevealSection>

          {/* Floating character showcase */}
          <RevealSection delay={200}>
            <div className="mt-6 flex items-end justify-center gap-3 sm:gap-5">
              {CHARACTERS.map((c) => (
                <button key={c.id} onClick={() => setActiveCharacter(c.id)} className={`transition-all duration-300 ${activeCharacter === c.id ? 'scale-110 -translate-y-1' : 'scale-90 opacity-60 hover:opacity-80 hover:scale-95'}`}>
                  <div className={`rounded-2xl border ${activeCharacter === c.id ? 'border-white/15 bg-white/[0.06] shadow-lg shadow-white/[0.03]' : 'border-transparent'} p-1.5 transition-all duration-300`}>
                    <SpritePet character={c.id} weightState="normal" mood="happy" size={activeCharacter === c.id ? 64 : 48} />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 text-sm font-black text-white">{CHARACTERS.find(c => c.id === activeCharacter)?.name}</div>
            <div className="text-[10px] text-gray-500">{CHARACTERS.find(c => c.id === activeCharacter)?.title}</div>
          </RevealSection>

          <RevealSection delay={350}>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link
                to="/pet"
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/85 transition-all hover:border-white/15 hover:text-white hover:bg-white/[0.06] active:scale-[0.97]"
              >
                Back to Pet
              </Link>
            </div>
          </RevealSection>
        </div>
      </div>

      {/* ═══ Sticky TOC / Jump bar ═══ */}
      <div className="sticky top-0 z-50 bg-piu-dark/95 backdrop-blur-md border-b border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-4">
          <button onClick={() => setTocOpen(o => !o)} className="w-full py-2.5 flex items-center justify-between text-[11px] font-semibold text-gray-400">
            <span className="flex items-center gap-2"><span className="text-sm">📖</span> Jump to Section</span>
            <span className={`transition-transform duration-200 ${tocOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {tocOpen && (
            <div className="pb-3 grid grid-cols-2 sm:grid-cols-3 gap-1 animate-[fadeInDown_200ms_ease-out]">
              {TOC.map(t => (
                <a key={t.id} href={`#${t.id}`} onClick={() => setTocOpen(false)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors truncate">{t.label}</a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className="max-w-3xl mx-auto px-4">

        {/* ─── Characters ─── */}
        <SectionHeading id="characters" icon="🐾" title="Meet the Companions" subtitle="Each companion has its own flavour, but the core care loop is shared" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHARACTERS.map(c => (
              <InfoCard key={c.id} glow={c.color === 'amber' ? 'gold' : c.color === 'pink' ? 'pink' : c.color === 'cyan' ? 'cyan' : null}>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
                    <SpritePet character={c.id} weightState="normal" mood="happy" size={56} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white">{c.name}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{c.title}</div>
                    <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{c.desc}</p>
                    <div className="mt-2">
                      <div className="text-[9px] text-gray-600 uppercase tracking-wide">Favourites</div>
                      <div className="text-[10px] text-emerald-300/80 mt-0.5">{c.favFood}</div>
                    </div>
                    <div className="mt-1.5">
                      <div className="text-[9px] text-gray-600 uppercase tracking-wide">Playstyle Fit</div>
                      <div className="text-[10px] text-white/60 mt-0.5">{c.personality}</div>
                    </div>
                  </div>
                </div>
              </InfoCard>
            ))}
          </div>
        </RevealSection>

        {/* ─── Core Loop ─── */}
        <SectionHeading id="core-loop" icon="🔄" title="Core Loop" subtitle="This is the intended rhythm of the feature" />
        <RevealSection>
          <InfoCard>
            <div className="space-y-4">
              {LOOP_STEPS.map((step) => (
                <div key={step.n} className="flex items-start gap-3 group">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/[0.12] to-cyan-400/[0.04] border border-cyan-400/15 flex items-center justify-center text-xs font-black text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.06)] group-hover:shadow-[0_0_20px_rgba(34,211,238,0.12)] transition-shadow">
                    {step.n}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{step.icon}</span>
                      {step.title}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>
          <InfoCard className="mt-3" glow="gold">
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              <span className="font-semibold">Mood</span> is now best understood as a derived state, not another confusing bar. When Hunger, Energy, Trust,
              and Momentum are all healthy, your pet feels <span className="font-semibold text-emerald-200">Thriving</span>.
              When they are neglected, the pet becomes <span className="font-semibold text-rose-200">Neglected</span> and
              more of the system starts pushing back.
            </p>
          </InfoCard>
        </RevealSection>

        {/* ─── Vital Stats ─── */}
        <SectionHeading id="vitals" icon="❤️" title="Vital Stats" subtitle="The six stats that define your pet's wellbeing, economy, and progression" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STAT_CARDS.map(s => (
              <div key={s.name} className={`rounded-xl border p-4 ${statColorClass(s.color)}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-sm font-black text-white">{s.name}</span>
                </div>
                <p className="text-[11px] text-white/75 leading-relaxed">{s.desc}</p>
                <div className="mt-2 rounded-lg border border-cyan-400/10 bg-cyan-500/[0.04] px-2.5 py-1.5">
                  <p className="text-[10px] text-cyan-200/80 leading-relaxed"><span className="font-semibold">Tip:</span> {s.tip}</p>
                </div>
                <div className="mt-1.5 text-[10px] text-white/45 leading-relaxed">{s.danger}</div>
              </div>
            ))}
          </div>
        </RevealSection>

        {/* Weight states */}
        <RevealSection delay={100}>
          <InfoCard className="mt-3">
            <div className="text-xs font-black text-white mb-2">Weight States</div>
            <p className="text-[11px] text-gray-400 mb-3">Your pet's hunger level determines its physical appearance. Keep hunger balanced for a healthy look!</p>
            <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-5 mb-3">
              {['starving', 'thin', 'normal', 'chubby', 'fat'].map(w => (
                <div key={w} className="text-center group">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 transition-all group-hover:border-white/15 group-hover:bg-white/[0.04]">
                    <SpritePet character={activeCharacter} weightState={w} mood={w === 'starving' ? 'desperate' : 'happy'} size={44} />
                  </div>
                  <div className="text-[9px] text-gray-500 mt-1 capitalize">{w}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-gray-600 text-left">
                    <th className="py-1 pr-3 font-medium">Hunger</th>
                    <th className="py-1 pr-3 font-medium">State</th>
                    <th className="py-1 font-medium">Appearance</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  {WEIGHT_STATES.map(w => (
                    <tr key={w.state} className="border-t border-white/[0.03]">
                      <td className="py-1.5 pr-3 tabular-nums text-white/70">{w.range}</td>
                      <td className="py-1.5 pr-3 font-semibold">{w.state}</td>
                      <td className="py-1.5">{w.look}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Thresholds ─── */}
        <SectionHeading id="thresholds" icon="🚦" title="Thresholds & Locks" subtitle="These are the rough bands that decide what your pet can do" />
        <RevealSection>
          <InfoCard>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-gray-600 text-left border-b border-white/[0.06]">
                    <th className="py-1.5 px-1 font-medium">Stat</th>
                    <th className="py-1.5 px-1 font-medium">Safe</th>
                    <th className="py-1.5 px-1 font-medium">Warning</th>
                    <th className="py-1.5 px-1 font-medium">Critical</th>
                    <th className="py-1.5 px-1 font-medium">What it changes</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  {THRESHOLD_ROWS.map(row => (
                    <tr key={row.stat} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-1.5 px-1 text-white/80 font-semibold">{row.stat}</td>
                      <td className="py-1.5 px-1 text-emerald-200 tabular-nums">{row.safe}</td>
                      <td className="py-1.5 px-1 text-amber-200 tabular-nums">{row.warning}</td>
                      <td className="py-1.5 px-1 text-rose-200 tabular-nums">{row.critical}</td>
                      <td className="py-1.5 px-1">{row.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── How Actions Fit ─── */}
        <SectionHeading id="actions" icon="🎯" title="How Actions Fit" subtitle="Every surface should answer a different part of the care loop" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACTION_GROUPS.map(group => {
              const glowMap = { emerald: 'emerald', pink: 'pink', cyan: 'cyan', amber: 'gold' };
              return (
                <InfoCard key={group.title} glow={glowMap[group.color]}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{group.icon}</span>
                    <span className="text-sm font-black text-white">{group.title}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div key={item} className="flex items-start gap-2 rounded-lg bg-black/20 px-2.5 py-1.5">
                        <span className="text-[8px] text-white/30 mt-1.5">●</span>
                        <p className="text-[11px] text-gray-300 leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                </InfoCard>
              );
            })}
          </div>
        </RevealSection>

        {/* ─── Feeding & Food ─── */}
        <SectionHeading id="feeding" icon="🍖" title="Feeding & Food" subtitle="Buy food with Combo to keep your pet fed and happy" />
        <RevealSection>
          <InfoCard>
            <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
              Each food item has different hunger and happiness values. <span className="text-emerald-300">Favourite foods</span> give big bonus stats — <span className="text-rose-300">disliked foods</span> still help upkeep, but they are less efficient emotionally.
            </p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-gray-600 text-left border-b border-white/[0.06]">
                    <th className="py-1.5 px-1 font-medium">Food</th>
                    <th className="py-1.5 px-1 font-medium text-right">Cost</th>
                    <th className="py-1.5 px-1 font-medium text-right">Hunger</th>
                    <th className="py-1.5 px-1 font-medium text-right">Happy</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  {FOODS.map(f => (
                    <tr key={f.name} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-1.5 px-1"><span className="mr-1">{f.emoji}</span><span className="text-white/80 font-medium">{f.name}</span></td>
                      <td className="py-1.5 px-1 text-right text-amber-200 tabular-nums">{f.cost}</td>
                      <td className="py-1.5 px-1 text-right text-orange-300 tabular-nums">+{f.hunger}</td>
                      <td className="py-1.5 px-1 text-right text-pink-300 tabular-nums">+{f.happy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-400/10 bg-emerald-500/[0.04] px-2.5 py-2">
              <p className="text-[10px] text-emerald-200/80 leading-relaxed">
                <span className="font-semibold">Favourite food bonus:</span> Favourite foods give stronger mood, trust, and energy bonuses on top of base values.
              </p>
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Requests & Missions ─── */}
        <SectionHeading id="requests" icon="📌" title="Requests & Missions" subtitle='These are the main "what should I do next?" guides' />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoCard glow="cyan">
              <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/75 mb-2">Requests</div>
              <div className="text-sm font-bold text-white">Short-cycle pet needs</div>
              <p className="mt-2 text-[11px] text-white/70 leading-relaxed">
                Requests surface immediate care goals like feeding, recovery, bonding, or getting a fresh Pump session in.
                Complete them, then claim the reward directly from the pet page.
              </p>
              <div className="mt-3 space-y-1">
                {['24-hour lifetime, 8-hour refresh cooldown', 'Ignored requests expire and hurt relationship quality', 'Best "what should I do next?" surface'].map(t => (
                  <div key={t} className="flex items-start gap-2 text-[10px] text-cyan-100/60">
                    <span className="text-cyan-400 mt-0.5">&#8250;</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </InfoCard>
            <InfoCard glow="gold">
              <div className="text-[10px] uppercase tracking-[0.16em] text-amber-200/75 mb-2">Missions</div>
              <div className="text-sm font-bold text-white">Longer progression objectives</div>
              <p className="mt-2 text-[11px] text-white/70 leading-relaxed">
                Missions are broader daily and weekly goals tied to the style of play your pet likes. They are for
                structured progress, while requests are for immediate needs.
              </p>
              <div className="mt-3 space-y-1">
                {['Tailored to your pet\'s character', 'Rewards: Bond, Combo, Bond Tokens', 'Claim from the Pet tab once complete'].map(t => (
                  <div key={t} className="flex items-start gap-2 text-[10px] text-amber-100/60">
                    <span className="text-amber-400 mt-0.5">&#8250;</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </InfoCard>
          </div>
        </RevealSection>

        {/* ─── Bond & Ranks ─── */}
        <SectionHeading id="bond" icon="💎" title="Bond & Ranks" subtitle="Your deepening relationship unlocks new abilities and items" />
        <RevealSection>
          <div className="space-y-2">
            {BOND_RANKS.map((r) => (
              <InfoCard key={r.label}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-black ${
                    r.color === 'amber' ? 'border-amber-400/20 bg-amber-500/[0.08] text-amber-300' :
                    r.color === 'purple' ? 'border-purple-400/15 bg-purple-500/[0.06] text-purple-300' :
                    r.color === 'cyan' ? 'border-cyan-400/15 bg-cyan-500/[0.06] text-cyan-300' :
                    r.color === 'emerald' ? 'border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-300' :
                    'border-white/[0.08] bg-white/[0.03] text-gray-400'
                  }`}>{r.threshold}</div>
                  <div>
                    <div className="text-sm font-bold text-white">{r.label}</div>
                    <p className="text-[10px] text-gray-500">{r.desc}</p>
                  </div>
                </div>
              </InfoCard>
            ))}
          </div>
          <InfoCard className="mt-3" glow="gold">
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              <span className="font-semibold">Bond is the anchor.</span> It is your permanent relationship history with the pet. Hunger, Energy, Trust, and
              Momentum are the living systems that make maintaining that bond interesting.
            </p>
          </InfoCard>
        </RevealSection>

        {/* ─── Evolution Forms ─── */}
        <SectionHeading id="evolution" icon="⭐" title="Evolution Forms" subtitle="Your pet visually evolves as bond and mastery deepen" />
        <RevealSection>
          <div className="relative">
            {/* Progress line */}
            <div className="absolute left-5 top-4 bottom-4 w-px bg-gradient-to-b from-gray-700 via-cyan-500/30 to-purple-500/30" />
            <div className="space-y-3">
              {FORMS.map((f) => (
                <div key={f.id} className="relative pl-12">
                  <div className={`absolute left-3 top-3 w-4 h-4 rounded-full border-2 ${
                    f.color === 'amber' ? 'border-amber-400 bg-amber-400/20' :
                    f.color === 'purple' ? 'border-purple-400 bg-purple-400/20' :
                    f.color === 'cyan' ? 'border-cyan-400 bg-cyan-400/20' :
                    f.color === 'emerald' ? 'border-emerald-400 bg-emerald-400/20' :
                    'border-gray-600 bg-gray-700'
                  }`} />
                  <InfoCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-white">{f.label}</div>
                        <p className="text-[10px] text-gray-500 mt-0.5">{f.desc}</p>
                      </div>
                      <Chip color={f.color}>{f.req}</Chip>
                    </div>
                  </InfoCard>
                </div>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* ─── Training Paths ─── */}
        <SectionHeading id="mastery" icon="🎯" title="Training Paths" subtitle="Focus your pet's growth and build long-term identity" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MASTERY_PATHS.map(p => (
              <InfoCard key={p.path}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">{p.icon}</span>
                  <span className="text-sm font-bold text-white">{p.label}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">{p.desc}</p>
              </InfoCard>
            ))}
          </div>
          <InfoCard className="mt-3" glow="cyan">
            <p className="text-[10px] text-cyan-200/80 leading-relaxed">
              <span className="font-semibold">Mastery ranks:</span> Rookie &rarr; Apprentice &rarr; Specialist &rarr; Elite &rarr; Master. Each rank unlocks talent nodes with titles, habitat items, and bonus effects.
            </p>
          </InfoCard>
        </RevealSection>

        {/* ─── Economy ─── */}
        <SectionHeading id="economy" icon="💰" title="Economy & Currency" subtitle="Short-term wellbeing and long-term progression should stay separate" />
        <RevealSection>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CURRENCIES.map(c => {
              const glowMap = { amber: 'gold', cyan: 'cyan', fuchsia: 'pink', purple: 'violet' };
              return (
                <InfoCard key={c.name} glow={glowMap[c.color]}>
                  <div className="text-center">
                    <span className="text-xl">{c.icon}</span>
                    <div className="text-sm font-bold text-white mt-1.5">{c.name}</div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{c.desc}</p>
                  </div>
                </InfoCard>
              );
            })}
          </div>
        </RevealSection>

        {/* ─── Quick Tips ─── */}
        <SectionHeading id="tips" icon="💡" title="Quick Tips" subtitle="The fastest way to keep the system feeling good" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TIPS.map((tip) => (
              <InfoCard key={tip.text}>
                <div className="flex items-start gap-2.5">
                  <span className="text-lg shrink-0">{tip.icon}</span>
                  <p className="text-[11px] text-gray-300 leading-relaxed">{tip.text}</p>
                </div>
              </InfoCard>
            ))}
          </div>
        </RevealSection>
      </div>

      <style>{`
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

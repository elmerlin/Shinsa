import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SpritePet from '../components/SpritePet';

// ─── Section data ─────────────────────────────────────────────
const CHARACTERS = [
  { id: 'dojocat', name: 'Dojo Cat', title: 'Proud Training Companion', desc: 'Disciplined, proud, and quietly affectionate once trust is earned. Favours structured training and clean technique.', color: 'amber', favFood: 'Pump Chow, Step Fuel, Banya Biscuits', personality: 'The strong, silent type — until you earn a purr.' },
  { id: 'buu', name: 'Buu', title: 'Indulgent Rhythm Goblin', desc: 'Smug, food-motivated, and happiest when showing off. Lives for replays and social moments.', color: 'pink', favFood: 'Beat Bites, Dance Dust, Doof Bites', personality: 'Will do anything for a snack. Literally anything.' },
  { id: 'devit', name: 'Devit', title: 'Chaotic Step Gremlin', desc: 'Playful, restless, and always turning training into mischief. Thrives on doubles and adrenaline.', color: 'red', favFood: 'Doof Bites, Adrenaline Chow, Slam Grub', personality: 'Chaos is a ladder — and a chart.' },
  { id: 'pixiu', name: 'Pixiu', title: 'Ceremonial Luck Guardian', desc: 'Warm, auspicious, and protective, with a taste for elegant rituals. Loves weekly challenges and community events.', color: 'cyan', favFood: 'Rhythm Rations, Banya Biscuits, Pad Power', personality: 'Brings fortune to those who show up consistently.' },
];

const STATS_INFO = [
  { name: 'Hunger', icon: '🍖', color: 'orange', desc: 'How full your pet is. Decays over time — feed regularly to keep it above 25%. Below 15% triggers a warning.', tip: 'Favourite foods give bonus happiness, bond, trust, and energy.' },
  { name: 'Happiness', icon: '💗', color: 'pink', desc: 'Your pet\'s mood level. Rises from interactions, activities, favourite food, and good plays. Decays slowly.', tip: 'High happiness improves your pet\'s mood expression and speech.' },
  { name: 'Energy', icon: '⚡', color: 'cyan', desc: 'Fuel for activities and toys. Training and sparring cost the most. Use Rest to recover.', tip: 'Keep energy above 18 to unlock the Explore activity.' },
  { name: 'Bond', icon: '💎', color: 'purple', desc: 'The core progression stat. Grows from everything: feeding, interactions, activities, missions, and PIU plays. Never decays.', tip: 'Bond unlocks new ranks, forms, habitat items, and the Perform interaction at Bond 40.' },
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
  { name: 'Slam Grub', cost: 36, hunger: 11, happy: 2, emoji: '🍗' },
  { name: 'Step Fuel', cost: 42, hunger: 13, happy: 4, emoji: '⚡' },
  { name: 'Rhythm Rations', cost: 26, hunger: 5, happy: 7, emoji: '🎵' },
  { name: 'Gargoyle Munch', cost: 52, hunger: 16, happy: 2, emoji: '👹' },
  { name: 'Pad Power', cost: 68, hunger: 21, happy: 8, emoji: '💪' },
  { name: 'Dance Dust', cost: 18, hunger: 3, happy: 10, emoji: '✨' },
  { name: 'Doof Bites', cost: 32, hunger: 9, happy: 6, emoji: '🔥' },
  { name: 'Adrenaline Chow', cost: 82, hunger: 25, happy: 10, emoji: '🚀' },
  { name: 'Banya Biscuits', cost: 94, hunger: 24, happy: 16, emoji: '🏆' },
];

const INTERACTIONS = [
  { name: 'Praise', icon: '👏', bond: 4, trust: 4, happy: 4, hype: 3, req: '' },
  { name: 'Cuddle', icon: '🤗', bond: 5, trust: 3, happy: 5, hype: 0, req: '' },
  { name: 'Tease', icon: '😏', bond: 1, trust: -2, happy: -1, hype: 6, req: '' },
  { name: 'Mission', icon: '📋', bond: 2, trust: 2, happy: 1, hype: 2, req: '' },
  { name: 'Perform', icon: '🎭', bond: 3, trust: 3, happy: 6, hype: 8, req: 'Bond 40+' },
];

const ACTIVITIES = [
  { name: 'Train', icon: '🥋', energy: -16, happy: 3, trust: 5, bond: 5, combo: 6, desc: 'Structured practice. High trust and bond gains.' },
  { name: 'Play', icon: '🎮', energy: -10, happy: 7, trust: 2, bond: 4, combo: 4, desc: 'Free-form fun. Best for happiness and hype.' },
  { name: 'Groom', icon: '✂️', energy: -4, happy: 8, trust: 6, bond: 3, combo: 0, desc: 'Low energy cost, high happiness and trust.' },
  { name: 'Rest', icon: '💤', energy: 22, happy: 2, trust: 1, bond: 2, combo: 0, desc: 'Recover energy. Essential for sustained activity.' },
  { name: 'Spar', icon: '⚔️', energy: -18, happy: 4, trust: 7, bond: 6, combo: 10, desc: 'Intense. Best combo and trust. Requires Trust 35+.' },
  { name: 'Explore', icon: '🗺️', energy: -14, happy: 5, trust: 3, bond: 4, combo: 8, desc: 'Discover rewards. Drops Rare Shards. Needs Energy 18+.' },
];

const MASTERY_PATHS = [
  { path: 'accuracy', icon: '🎯', label: 'Accuracy', desc: 'Clean timing and high grades. Gains XP from AAA+ plays.', milestones: ['Eye for Timing', 'Judge Whisperer', 'Perfect Form'] },
  { path: 'stamina', icon: '💪', label: 'Stamina', desc: 'Hard charts and endurance. Gains XP from Lv18+ clears.', milestones: ['Endurance Spark', 'Iron Rhythm', 'Arena Engine'] },
  { path: 'tech', icon: '🧠', label: 'Tech', desc: 'Footwork and doubles. Gains XP from doubles and Lv17+ charts.', milestones: ['Footwork Instinct', 'Pattern Reader', 'Lab Monster'] },
  { path: 'consistency', icon: '🌱', label: 'Consistency', desc: 'Daily care and steady habits. Gains XP from regular play.', milestones: ['Care Rhythm', 'Steady Partner', 'Evergreen Companion'] },
  { path: 'tournament', icon: '🏆', label: 'Tournament', desc: 'Competitive focus. Gains XP from hard charts and weekly challenges.', milestones: ['Bracket Pulse', 'Stage Instinct', 'Finals Aura'] },
  { path: 'social', icon: '✨', label: 'Social', desc: 'Scene presence. Gains XP from replays and community engagement.', milestones: ['Replay Spark', 'Scene Familiar', 'Dojo Celebrity'] },
];

const MASTERY_RANKS = [
  { xp: 0, label: 'Rookie' },
  { xp: 45, label: 'Apprentice' },
  { xp: 120, label: 'Specialist' },
  { xp: 240, label: 'Elite' },
  { xp: 420, label: 'Master' },
];

const WEIGHT_STATES = [
  { range: '0–15%', state: 'Starving', look: 'Visibly thin, rib lines' },
  { range: '16–35%', state: 'Thin', look: 'Slender frame' },
  { range: '36–65%', state: 'Normal', look: 'Healthy, balanced' },
  { range: '66–85%', state: 'Chubby', look: 'Rounded belly, short legs' },
  { range: '86–100%', state: 'Fat', look: 'Big belly droop, wide feet' },
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

// ─── Table of Contents ────────────────────────────────────────
const TOC = [
  { id: 'characters', label: 'Meet the Characters' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'vitals', label: 'Vital Stats' },
  { id: 'feeding', label: 'Feeding & Food' },
  { id: 'interactions', label: 'Interactions' },
  { id: 'activities', label: 'Activities' },
  { id: 'missions', label: 'Missions' },
  { id: 'bond', label: 'Bond & Ranks' },
  { id: 'evolution', label: 'Evolution Forms' },
  { id: 'mastery', label: 'Training Paths' },
  { id: 'wardrobe', label: 'Wardrobe & Style' },
  { id: 'habitat', label: 'Habitat' },
  { id: 'tricks', label: 'Tricks' },
  { id: 'social', label: 'Social & Gifting' },
  { id: 'companion', label: 'Floating Companion' },
  { id: 'economy', label: 'Economy & Currency' },
  { id: 'tips', label: 'Pro Tips' },
];

// ─── Reusable components ──────────────────────────────────────
function SectionHeading({ id, icon, title, subtitle }) {
  return (
    <div id={id} className="scroll-mt-20 pt-8 pb-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.06] flex items-center justify-center text-lg shrink-0">{icon}</div>
        <div>
          <h2 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-3 h-px bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent" />
    </div>
  );
}

function InfoCard({ children, className = '', glow }) {
  const glowBorder = glow === 'gold' ? 'border-amber-400/15' : glow === 'cyan' ? 'border-cyan-400/15' : glow === 'pink' ? 'border-pink-400/15' : 'border-white/[0.06]';
  const glowBg = glow === 'gold' ? 'bg-amber-500/[0.03]' : glow === 'cyan' ? 'bg-cyan-500/[0.03]' : glow === 'pink' ? 'bg-pink-500/[0.03]' : 'bg-white/[0.02]';
  return <div className={`rounded-xl border ${glowBorder} ${glowBg} p-4 ${className}`}>{children}</div>;
}

function StatBadge({ label, value, color = 'gray' }) {
  const colors = { orange: 'text-orange-300', pink: 'text-pink-300', cyan: 'text-cyan-300', purple: 'text-purple-300', amber: 'text-amber-300', emerald: 'text-emerald-300', gray: 'text-gray-300', red: 'text-red-300' };
  return (
    <div className="text-center">
      <div className={`text-sm font-bold ${colors[color] || colors.gray}`}>{value}</div>
      <div className="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

function Chip({ children, color = 'gray' }) {
  const styles = {
    amber: 'border-amber-400/20 bg-amber-500/[0.08] text-amber-200',
    cyan: 'border-cyan-400/15 bg-cyan-500/[0.06] text-cyan-200',
    pink: 'border-pink-400/15 bg-pink-500/[0.06] text-pink-200',
    purple: 'border-purple-400/15 bg-purple-500/[0.06] text-purple-200',
    emerald: 'border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-200',
    red: 'border-red-400/15 bg-red-500/[0.06] text-red-200',
    gray: 'border-white/[0.08] bg-white/[0.03] text-gray-300',
  };
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${styles[color] || styles.gray}`}>{children}</span>;
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
        <div className="relative max-w-3xl mx-auto px-4 pt-10 pb-8 text-center">
          <RevealSection>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-1 text-[10px] font-semibold text-cyan-200 uppercase tracking-wider mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Complete Guide
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight leading-tight">
              Your Pet<br/>
              <span className="bg-gradient-to-r from-amber-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent">Companion</span>
            </h1>
            <p className="text-sm text-gray-400 mt-3 max-w-md mx-auto leading-relaxed">
              Adopt, nurture, and evolve a personal companion that grows with your PIU journey. Every play, every combo, every interaction shapes who they become.
            </p>
          </RevealSection>

          {/* Floating character showcase */}
          <RevealSection delay={200}>
            <div className="mt-6 flex items-end justify-center gap-3 sm:gap-5">
              {CHARACTERS.map((c, i) => (
                <button key={c.id} onClick={() => setActiveCharacter(c.id)} className={`transition-all duration-300 ${activeCharacter === c.id ? 'scale-110 -translate-y-1' : 'scale-90 opacity-60 hover:opacity-80'}`}>
                  <div className={`rounded-2xl border ${activeCharacter === c.id ? 'border-white/15 bg-white/[0.06] shadow-lg' : 'border-transparent'} p-1.5 transition-all`}>
                    <SpritePet character={c.id} weightState="normal" mood="happy" size={activeCharacter === c.id ? 64 : 48} />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 text-sm font-display font-bold text-white">{CHARACTERS.find(c => c.id === activeCharacter)?.name}</div>
            <div className="text-[10px] text-gray-500">{CHARACTERS.find(c => c.id === activeCharacter)?.title}</div>
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
        <SectionHeading id="characters" icon="🐾" title="Meet the Characters" subtitle="Each companion has a unique personality, food preferences, and missions" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHARACTERS.map(c => (
              <InfoCard key={c.id} glow={c.color === 'amber' ? 'gold' : c.color === 'pink' ? 'pink' : c.color === 'cyan' ? 'cyan' : null}>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
                    <SpritePet character={c.id} weightState="normal" mood="happy" size={56} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-display font-bold text-white">{c.name}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{c.title}</div>
                    <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{c.desc}</p>
                    <div className="mt-2">
                      <div className="text-[9px] text-gray-600 uppercase tracking-wide">Favourites</div>
                      <div className="text-[10px] text-emerald-300/80 mt-0.5">{c.favFood}</div>
                    </div>
                  </div>
                </div>
              </InfoCard>
            ))}
          </div>
        </RevealSection>

        {/* ─── Getting Started ─── */}
        <SectionHeading id="getting-started" icon="🚀" title="Getting Started" subtitle="Adopt your first pet and begin building your bond" />
        <RevealSection>
          <InfoCard>
            <div className="space-y-4">
              <Step n={1} title="Adopt a companion">
                Head to the <Link to="/pet" className="text-cyan-300 hover:underline">Pet page</Link> and choose your character. Each has unique food preferences, missions, and personality.
              </Step>
              <Step n={2} title="Play PIU to earn Combo">
                Every synced play earns Combo currency based on your grade. SSS = 5 Combo, S = 4, AAA = 3, A = 1. Higher chart levels give bonus Combo too.
              </Step>
              <Step n={3} title="Feed and interact">
                Use your Combo to buy food from the shop. Interact with your pet daily — Praise, Cuddle, or start Activities like Train and Spar.
              </Step>
              <Step n={4} title="Complete missions">
                Your pet has daily and weekly missions tied to your PIU activity. Completing them gives Bond, Combo, and Bond Tokens.
              </Step>
              <Step n={5} title="Watch your pet evolve">
                As Bond and Mastery grow, your pet ranks up, evolves form, and unlocks new gear, habitat items, and abilities.
              </Step>
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Vitals ─── */}
        <SectionHeading id="vitals" icon="❤️" title="Vital Stats" subtitle="The four core stats that define your pet's wellbeing" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STATS_INFO.map(s => (
              <InfoCard key={s.name}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-sm font-display font-bold text-white">{s.name}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">{s.desc}</p>
                <div className="mt-2 rounded-lg border border-cyan-400/10 bg-cyan-500/[0.04] px-2.5 py-1.5">
                  <p className="text-[10px] text-cyan-200/80 leading-relaxed"><span className="font-semibold">Tip:</span> {s.tip}</p>
                </div>
              </InfoCard>
            ))}
          </div>
        </RevealSection>

        {/* Weight states */}
        <RevealSection delay={100}>
          <InfoCard className="mt-3">
            <div className="text-xs font-display font-bold text-white mb-2">Weight States</div>
            <p className="text-[11px] text-gray-400 mb-3">Your pet's hunger level determines its physical appearance. Keep hunger balanced for a healthy look!</p>
            <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-5 mb-3">
              {['starving', 'thin', 'normal', 'chubby', 'fat'].map(w => (
                <div key={w} className="text-center">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
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

        {/* ─── Feeding ─── */}
        <SectionHeading id="feeding" icon="🍖" title="Feeding & Food" subtitle="Buy food with Combo to keep your pet fed and happy" />
        <RevealSection>
          <InfoCard>
            <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
              Each food item has different hunger and happiness values. <span className="text-emerald-300">Favourite foods</span> give big bonus stats — <span className="text-rose-300">disliked foods</span> reduce happiness and trust. Feeding also grants energy, hype, and +1 bond.
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
                <span className="font-semibold">Favourite food bonus:</span> +4 happiness, +5 bond, +2 trust, +5 energy, +4 hype on top of base values.
              </p>
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Interactions ─── */}
        <SectionHeading id="interactions" icon="🤝" title="Interactions" subtitle="Direct ways to bond with your pet" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {INTERACTIONS.map(a => (
              <InfoCard key={a.name}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{a.icon}</span>
                  <span className="text-sm font-display font-bold text-white">{a.name}</span>
                  {a.req && <Chip color="purple">{a.req}</Chip>}
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <StatBadge label="Bond" value={`+${a.bond}`} color="purple" />
                  <StatBadge label="Trust" value={a.trust >= 0 ? `+${a.trust}` : `${a.trust}`} color={a.trust >= 0 ? 'cyan' : 'red'} />
                  <StatBadge label="Happy" value={a.happy >= 0 ? `+${a.happy}` : `${a.happy}`} color={a.happy >= 0 ? 'pink' : 'red'} />
                  <StatBadge label="Hype" value={`+${a.hype}`} color="amber" />
                </div>
              </InfoCard>
            ))}
          </div>
          <InfoCard className="mt-3" glow="gold">
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              <span className="font-semibold">Daily streak bonus:</span> Your first interaction each day grants up to +7 bonus bond based on your streak length. Keep the streak alive!
            </p>
          </InfoCard>
        </RevealSection>

        {/* ─── Activities ─── */}
        <SectionHeading id="activities" icon="🏋️" title="Activities" subtitle="Spend energy to gain stats, currency, and mastery XP" />
        <RevealSection>
          <div className="space-y-2">
            {ACTIVITIES.map(a => (
              <InfoCard key={a.name}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{a.icon}</span>
                    <div>
                      <span className="text-sm font-display font-bold text-white">{a.name}</span>
                      <p className="text-[10px] text-gray-500 mt-0.5">{a.desc}</p>
                    </div>
                  </div>
                  <div className={`text-xs font-bold tabular-nums ${a.energy > 0 ? 'text-emerald-300' : 'text-orange-300'}`}>
                    {a.energy > 0 ? `+${a.energy}` : a.energy} ⚡
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-white/[0.04]">
                  <StatBadge label="Bond" value={`+${a.bond}`} color="purple" />
                  <StatBadge label="Trust" value={`+${a.trust}`} color="cyan" />
                  <StatBadge label="Happy" value={`+${a.happy}`} color="pink" />
                  {a.combo > 0 && <StatBadge label="Combo" value={`+${a.combo}`} color="amber" />}
                </div>
              </InfoCard>
            ))}
          </div>
        </RevealSection>

        {/* ─── Missions ─── */}
        <SectionHeading id="missions" icon="📋" title="Missions" subtitle="Daily and weekly goals tied to your real PIU play" />
        <RevealSection>
          <InfoCard>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              Your pet's missions are tailored to its character. Complete them by playing PIU, feeding, and interacting. Claim rewards from the Pet tab once complete.
            </p>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold text-amber-200 uppercase tracking-wide mb-1.5">Daily Missions</div>
                <div className="space-y-1">
                  {[
                    { label: 'Care Routine', desc: 'Feed your pet at least once today' },
                    { label: 'Quality Time', desc: 'Interact with your pet three times today' },
                    { label: 'Clean Timing', desc: 'Hit two AAA-or-better plays today' },
                    { label: 'Capture the Moment', desc: 'Record one replay-enabled score today' },
                    { label: 'Fresh Chart', desc: 'Play a new chart today' },
                    { label: 'Double Trouble', desc: 'Play one doubles chart today' },
                  ].map(m => (
                    <div key={m.label} className="flex items-start gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                      <span className="text-[10px] text-amber-300 mt-px">●</span>
                      <div>
                        <div className="text-[11px] font-semibold text-white/80">{m.label}</div>
                        <div className="text-[10px] text-gray-500">{m.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-purple-200 uppercase tracking-wide mb-1.5">Weekly Missions</div>
                <div className="space-y-1">
                  {[
                    { label: 'Heavy Set', desc: 'Clear three level 18+ charts this week' },
                    { label: 'Doubles Grind', desc: 'Play five doubles charts this week' },
                    { label: 'Scene Presence', desc: 'Land three replay-enabled plays this week' },
                    { label: 'Hour of Power', desc: 'Join one HoP session this week' },
                    { label: 'Weekly Challenger', desc: 'Log at least one weekly challenge result' },
                  ].map(m => (
                    <div key={m.label} className="flex items-start gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                      <span className="text-[10px] text-purple-300 mt-px">●</span>
                      <div>
                        <div className="text-[11px] font-semibold text-white/80">{m.label}</div>
                        <div className="text-[10px] text-gray-500">{m.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-cyan-400/10 bg-cyan-500/[0.04] px-2.5 py-2">
              <p className="text-[10px] text-cyan-200/80"><span className="font-semibold">Note:</span> Each character gets a curated set of 4 missions from these pools. Your missions reflect your pet's personality.</p>
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Bond & Ranks ─── */}
        <SectionHeading id="bond" icon="💎" title="Bond & Ranks" subtitle="Your deepening relationship unlocks new abilities and items" />
        <RevealSection>
          <div className="space-y-2">
            {BOND_RANKS.map((r, i) => (
              <InfoCard key={r.label}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-display font-black ${
                    r.color === 'amber' ? 'border-amber-400/20 bg-amber-500/[0.08] text-amber-300' :
                    r.color === 'purple' ? 'border-purple-400/15 bg-purple-500/[0.06] text-purple-300' :
                    r.color === 'cyan' ? 'border-cyan-400/15 bg-cyan-500/[0.06] text-cyan-300' :
                    r.color === 'emerald' ? 'border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-300' :
                    'border-white/[0.08] bg-white/[0.03] text-gray-400'
                  }`}>{r.threshold}</div>
                  <div>
                    <div className="text-sm font-display font-bold text-white">{r.label}</div>
                    <p className="text-[10px] text-gray-500">{r.desc}</p>
                  </div>
                </div>
              </InfoCard>
            ))}
          </div>
        </RevealSection>

        {/* ─── Evolution Forms ─── */}
        <SectionHeading id="evolution" icon="⭐" title="Evolution Forms" subtitle="Your pet visually evolves as bond and mastery deepen" />
        <RevealSection>
          <div className="relative">
            {/* Progress line */}
            <div className="absolute left-5 top-4 bottom-4 w-px bg-gradient-to-b from-gray-700 via-cyan-500/30 to-purple-500/30" />
            <div className="space-y-3">
              {FORMS.map((f, i) => (
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
                        <div className="text-sm font-display font-bold text-white">{f.label}</div>
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

        {/* ─── Mastery Paths ─── */}
        <SectionHeading id="mastery" icon="🎯" title="Training Paths" subtitle="Choose a mastery focus that shapes your pet's identity" />
        <RevealSection>
          <InfoCard className="mb-3">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Pick an active Training Path to focus your pet's growth. Mastery XP is earned from activities, missions, and PIU plays — with bonuses for path-aligned actions. Reaching mastery milestones unlocks titles, habitat items, and auras.
            </p>
          </InfoCard>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MASTERY_PATHS.map(p => (
              <InfoCard key={p.path}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{p.icon}</span>
                  <span className="text-sm font-display font-bold text-white">{p.label}</span>
                </div>
                <p className="text-[10px] text-gray-500 mb-2">{p.desc}</p>
                <div className="space-y-1">
                  {p.milestones.map((m, i) => (
                    <div key={m} className="flex items-center gap-2 text-[10px]">
                      <span className={`w-1 h-1 rounded-full ${i === 0 ? 'bg-emerald-400' : i === 1 ? 'bg-cyan-400' : 'bg-purple-400'}`} />
                      <span className="text-gray-300">{m}</span>
                      <span className="text-gray-600 tabular-nums ml-auto">{[40, 120, 260][i]} XP</span>
                    </div>
                  ))}
                </div>
              </InfoCard>
            ))}
          </div>
          <InfoCard className="mt-3">
            <div className="text-xs font-display font-bold text-white mb-2">Mastery Ranks</div>
            <div className="flex flex-wrap gap-2">
              {MASTERY_RANKS.map(r => (
                <div key={r.label} className="text-center rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                  <div className="text-[10px] font-bold text-white/80">{r.label}</div>
                  <div className="text-[9px] text-gray-600 tabular-nums">{r.xp}+ XP</div>
                </div>
              ))}
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Wardrobe ─── */}
        <SectionHeading id="wardrobe" icon="👒" title="Wardrobe & Style" subtitle="Dress your pet with hats, tops, belts, and shoes" />
        <RevealSection>
          <InfoCard>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              Buy clothing from the shop with Combo. All items support custom colours — pick any hex colour to make your pet uniquely yours. Equip from the Clothing tab.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { slot: 'Hats', count: 11, range: '15–120', examples: 'Party Hat, Beanie, Crown, Astronaut Helmet' },
                { slot: 'Tops', count: 9, range: '35–100', examples: 'Hoodie, Lab Coat, STOMP Jacket, Power Suit' },
                { slot: 'Belts', count: 6, range: '15–60', examples: 'Ribbon, Utility Belt, Champion Sash' },
                { slot: 'Shoes', count: 6, range: '10–65', examples: 'Sandals, Cat Slippers, Power Boots' },
              ].map(s => (
                <div key={s.slot}>
                  <div className="text-[11px] font-semibold text-white/80">{s.slot}</div>
                  <div className="text-[9px] text-gray-600">{s.count} items · {s.range} Combo</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{s.examples}</div>
                </div>
              ))}
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Habitat ─── */}
        <SectionHeading id="habitat" icon="🏠" title="Habitat" subtitle="Customise your pet's living space with backgrounds, props, and decor" />
        <RevealSection>
          <InfoCard>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              Your pet's habitat has four customisable slots. Some items require bond and mastery thresholds to unlock. Higher-tier items make a statement about your dedication.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { slot: 'Backgrounds', count: 8, range: '90–300', highlight: 'Celestial Shrine (Bond 260+)' },
                { slot: 'Props', count: 8, range: '70–220', highlight: 'Spirit Lantern (Bond 160+)' },
                { slot: 'Floor', count: 4, range: '60–200', highlight: 'Galaxy Floor (Bond 160+)' },
                { slot: 'Wall', count: 4, range: '55–180', highlight: 'Champion Banner (Bond 160+)' },
              ].map(s => (
                <div key={s.slot}>
                  <div className="text-[11px] font-semibold text-white/80">{s.slot}</div>
                  <div className="text-[9px] text-gray-600">{s.count} items · {s.range} Combo</div>
                  <div className="text-[10px] text-amber-200/60 mt-0.5">{s.highlight}</div>
                </div>
              ))}
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Tricks ─── */}
        <SectionHeading id="tricks" icon="🎪" title="Tricks" subtitle="Demand tricks and prove your skill to earn rewards" />
        <RevealSection>
          <InfoCard>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              Each character has 4 unique tricks unlocked by XP milestones. To perform a trick: demand it, then play a qualifying PIU chart (grade A or better, scaling with trick difficulty). Successful tricks earn Combo, happiness, and +25 bonus XP.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {CHARACTERS.map(c => (
                <div key={c.id} className="rounded-lg border border-white/[0.04] bg-white/[0.015] p-2.5">
                  <div className="text-[11px] font-semibold text-white/80 mb-1.5">{c.name}</div>
                  <div className="space-y-0.5 text-[10px] text-gray-500">
                    {(c.id === 'dojocat' ? ['Strike a Pose', 'Show Off', 'Lab Experiment', 'POWER UP!'] :
                      c.id === 'buu' ? ['Big Smile', 'Costume Party', 'Go Ranger!', 'Cast Spell'] :
                      c.id === 'devit' ? ['Stand Still', 'Quick Dash', 'Happy Dance', 'Victory Cheer'] :
                      ['Greeting', 'Big Laugh', 'Lion Dance', 'Fortune Blessing']).map((t, i) => (
                      <div key={t} className="flex items-center justify-between">
                        <span className="text-gray-300">{t}</span>
                        <span className="text-gray-600 tabular-nums">{[0, 150, 600, 2500][i]} XP</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Social ─── */}
        <SectionHeading id="social" icon="🤩" title="Social & Gifting" subtitle="React to other players' pets and send gifts" />
        <RevealSection>
          <InfoCard>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              Tap a player's pet avatar anywhere on Shinsa to view their companion. You can send reactions and gifts to other pets:
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] p-2.5">
                <div className="text-[11px] font-semibold text-white/80 mb-1">Reactions</div>
                <div className="flex gap-2 mb-1">
                  {['📣 Cheer', '🤩 Wow', '💪 Flex', '💗 Love'].map(r => (
                    <span key={r} className="text-[10px] text-gray-400">{r}</span>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500">1 per type per pet per day. Gives the target +1 bond, +2 hype.</p>
              </div>
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] p-2.5">
                <div className="text-[11px] font-semibold text-white/80 mb-1">Gifts</div>
                <p className="text-[10px] text-gray-500">Send food or toys to friends' pets using Bond Tokens. Food gifts give half the normal stat boost. Up to 3 gifts per day.</p>
              </div>
            </div>
            <div className="rounded-lg border border-amber-400/10 bg-amber-500/[0.04] px-2.5 py-2">
              <p className="text-[10px] text-amber-200/80"><span className="font-semibold">Your pet as avatar:</span> Toggle "Use pet as avatar" on the Pet page to show your companion across Shinsa — leaderboards, posts, and profiles.</p>
            </div>
          </InfoCard>
        </RevealSection>

        {/* ─── Floating Companion ─── */}
        <SectionHeading id="companion" icon="📎" title="Floating Companion" subtitle="Your pet follows you across Shinsa" />
        <RevealSection>
          <InfoCard glow="cyan">
            <p className="text-[11px] text-gray-400 leading-relaxed mb-2">
              The floating companion is a Clippy-style overlay that shows your pet in the bottom-right corner on every page. It reacts to what you do:
            </p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-start gap-2"><span className="text-cyan-300">●</span><span className="text-gray-300">Speaks mood-aware dialogue based on hunger and happiness</span></div>
              <div className="flex items-start gap-2"><span className="text-cyan-300">●</span><span className="text-gray-300">Reacts when you pump a post — with author-specific commentary</span></div>
              <div className="flex items-start gap-2"><span className="text-cyan-300">●</span><span className="text-gray-300">Nudges you to leave comments after pumping</span></div>
              <div className="flex items-start gap-2"><span className="text-cyan-300">●</span><span className="text-gray-300">Shows warning dots when hunger or energy is low</span></div>
              <div className="flex items-start gap-2"><span className="text-cyan-300">●</span><span className="text-gray-300">Tap to expand a quick-status card with vitals, mood, and streak</span></div>
            </div>
            <p className="text-[10px] text-gray-500 mt-2">Toggle the companion on/off from the Pet page under "Companion Overlay".</p>
          </InfoCard>
        </RevealSection>

        {/* ─── Economy ─── */}
        <SectionHeading id="economy" icon="💰" title="Economy & Currency" subtitle="Three currencies fuel the pet ecosystem" />
        <RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InfoCard glow="gold">
              <div className="text-center">
                <div className="text-2xl mb-1">🎵</div>
                <div className="text-sm font-display font-bold text-amber-200">Combo</div>
                <p className="text-[10px] text-gray-500 mt-1">Primary currency. Earned from PIU plays (1–5 per play based on grade). Spent on food, clothing, habitat, and toys.</p>
                <div className="mt-2 rounded border border-white/[0.04] bg-white/[0.02] px-2 py-1">
                  <div className="text-[9px] text-gray-600">SSS = 5 · S = 4 · AAA = 3 · A = 1</div>
                </div>
              </div>
            </InfoCard>
            <InfoCard glow="cyan">
              <div className="text-center">
                <div className="text-2xl mb-1">💎</div>
                <div className="text-sm font-display font-bold text-cyan-200">Bond Tokens</div>
                <p className="text-[10px] text-gray-500 mt-1">Earned from missions and activities like Train, Groom, and Spar. Used for rare unlocks and sending gifts to friends.</p>
              </div>
            </InfoCard>
            <InfoCard glow="pink">
              <div className="text-center">
                <div className="text-2xl mb-1">✨</div>
                <div className="text-sm font-display font-bold text-pink-200">Rare Shards</div>
                <p className="text-[10px] text-gray-500 mt-1">Dropped from Explore activity and HoP sessions. For legendary unlocks in the future.</p>
              </div>
            </InfoCard>
          </div>
          <InfoCard className="mt-3">
            <div className="text-xs font-display font-bold text-white mb-2">Combo from PIU Plays</div>
            <p className="text-[10px] text-gray-500 mb-2">Higher chart levels give bonus Combo: Lv16+ adds +1, Lv19+ adds +1, Lv22+ adds +2, Lv25+ adds +3.</p>
            <p className="text-[10px] text-gray-500">Plays also feed your pet directly: hunger +1 (A+), happiness +1 to +4 (grade-dependent), and XP for mastery progression.</p>
          </InfoCard>
        </RevealSection>

        {/* ─── Tips ─── */}
        <SectionHeading id="tips" icon="🧠" title="Pro Tips" subtitle="Strategies to get the most from your companion" />
        <RevealSection>
          <div className="space-y-2">
            {[
              { tip: 'Feed favourite foods', detail: 'The stat bonus from favourites is massive — +5 bond, +4 happiness, +2 trust, and +5 energy on top of base values. Prioritise them.' },
              { tip: 'Maintain your daily streak', detail: 'Your first interaction each day grants bonus bond equal to your streak length (up to 7). A 7-day streak means +7 free bond daily.' },
              { tip: 'Balance activities with rest', detail: 'Spar and Train are the best for progression but drain energy fast. Use Rest between intense activities. Keep energy above 18 to unlock Explore.' },
              { tip: 'Complete missions for bond tokens', detail: 'Bond Tokens are needed for gifts and rare items. Missions are the primary source — especially weekly missions that give 2 tokens each.' },
              { tip: 'Choose a mastery path early', detail: 'Path-aligned activities and missions give +2–4 bonus XP. Pick a path that matches how you play PIU (accuracy for grade chasers, stamina for hard chart grinders).' },
              { tip: 'Use toys for massive hype', detail: 'Toys give some of the highest hype gains in the game. Favoured toys (based on character) give +2 bond, +2 trust, +2 happiness, +3 hype on top.' },
              { tip: 'Don\'t let hunger drop below 25%', detail: 'Below 15% triggers warnings and impacts mood. Below 25% the companion coach starts nagging. Starving pets look visibly distressed.' },
              { tip: 'Play consistently for Combo income', detail: 'Target ~75 songs per week to comfortably maintain food costs. High grades at high levels maximise Combo per play.' },
            ].map((t, i) => (
              <InfoCard key={i}>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-400/15 flex items-center justify-center text-[10px] font-bold text-amber-300 shrink-0">{i + 1}</div>
                  <div>
                    <div className="text-[11px] font-semibold text-white/90">{t.tip}</div>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{t.detail}</p>
                  </div>
                </div>
              </InfoCard>
            ))}
          </div>
        </RevealSection>

        {/* ─── CTA ─── */}
        <RevealSection delay={100}>
          <div className="mt-10 mb-6 text-center">
            <div className="inline-flex items-end gap-2 mb-4">
              {CHARACTERS.map(c => <SpritePet key={c.id} character={c.id} weightState="normal" mood="happy" size={36} />)}
            </div>
            <h3 className="text-lg font-display font-bold text-white">Ready to begin?</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">Your companion is waiting.</p>
            <Link to="/pet" className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.08] px-5 py-2.5 text-sm font-display font-bold text-cyan-200 hover:bg-cyan-500/[0.12] hover:border-cyan-400/30 transition-all">
              Open Pet Page
              <span className="text-xs">→</span>
            </Link>
          </div>
        </RevealSection>

      </div>

      <style>{`
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ─── Step component for Getting Started ───────────────────────
function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/10 border border-cyan-400/15 flex items-center justify-center text-[11px] font-display font-bold text-cyan-300 shrink-0">{n}</div>
      <div>
        <div className="text-[12px] font-semibold text-white/90">{title}</div>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

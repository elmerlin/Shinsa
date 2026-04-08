import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SpritePet from '../components/SpritePet';

const CHARACTERS = [
  {
    id: 'dojocat',
    name: 'Dojo Cat',
    title: 'Proud Training Companion',
    desc: 'Disciplined, proud, and dependable once trust is earned.',
    favorites: 'Pump Chow, Step Fuel, Banya Biscuits',
    personality: 'Best for players who like structure, training, and clean form.',
  },
  {
    id: 'buu',
    name: 'Buu',
    title: 'Indulgent Rhythm Goblin',
    desc: 'Food-motivated, playful, and always ready to show off.',
    favorites: 'Beat Bites, Dance Dust, Doof Bites',
    personality: 'Best for players who want a loud, social, cosy little menace.',
  },
  {
    id: 'devit',
    name: 'Devit',
    title: 'Chaotic Step Gremlin',
    desc: 'Restless, mischievous, and happiest when things get intense.',
    favorites: 'Doof Bites, Adrenaline Chow, Slam Grub',
    personality: 'Best for grinders, doubles players, and chaos enjoyers.',
  },
  {
    id: 'pixiu',
    name: 'Pixiu',
    title: 'Ceremonial Luck Guardian',
    desc: 'Warm, lucky, and deeply rewarding for consistent caretakers.',
    favorites: 'Rhythm Rations, Banya Biscuits, Pad Power',
    personality: 'Best for players who want calm, ritual, and long-term bond building.',
  },
];

const STAT_CARDS = [
  {
    name: 'Hunger',
    icon: '🍖',
    color: 'orange',
    desc: 'Core upkeep. Low hunger blocks demanding actions and slows recovery.',
    good: 'Food restores it.',
    danger: 'Below 15% your pet should be fed before hard activity.',
  },
  {
    name: 'Energy',
    icon: '⚡',
    color: 'cyan',
    desc: 'Action budget. Activities, minigames, and performances spend it.',
    good: 'Rest and good hunger restore it over time.',
    danger: 'Below 20% your pet loses access to demanding actions.',
  },
  {
    name: 'Trust',
    icon: '🤝',
    color: 'emerald',
    desc: 'Relationship depth. Unlocks stronger interactions and more advanced actions.',
    good: 'Grows through consistent care, grooming, bonding, and meeting requests.',
    danger: 'Neglect causes slow trust decay after long gaps without care.',
  },
  {
    name: 'Momentum',
    icon: '🔥',
    color: 'violet',
    desc: 'Short-term scene energy from recent Pump play.',
    good: 'Syncing sessions, strong grades, replays, and hard clears raise it.',
    danger: 'It fades quickly and gates showcase-style actions when too low.',
  },
  {
    name: 'Bond',
    icon: '💎',
    color: 'amber',
    desc: 'Permanent progression. It never decays.',
    good: 'Unlocks ranks, forms, cosmetics, and long-term identity.',
    danger: 'Low wellbeing slows how efficiently you build it.',
  },
  {
    name: 'Combo',
    icon: '🎵',
    color: 'pink',
    desc: 'Primary pet currency earned from real Pump play.',
    good: 'Spend it on food, toys, habitat items, and minigames.',
    danger: 'No Combo means no easy recovery items, so play and care must stay in rhythm.',
  },
];

const LOOP_STEPS = [
  {
    title: 'Play Pump',
    body: 'Synced plays give Combo, XP, mastery progress, and Momentum. Harder charts and better grades pay more.',
  },
  {
    title: 'Care For Your Pet',
    body: 'Spend Combo on food, rest, toys, and upkeep so Hunger and Energy stay healthy.',
  },
  {
    title: 'Use Good Wellbeing',
    body: 'Healthy pets can spar, explore, perform, and take on stronger requests more reliably.',
  },
  {
    title: 'Grow Bond',
    body: 'Good care and good Pump habits turn into Bond, Tokens, Shards, ranks, forms, and personality.',
  },
];

const THRESHOLD_ROWS = [
  { stat: 'Hunger', safe: '40%+', warning: '15-39%', critical: '0-14%', effect: 'Very low hunger blocks demanding actions.' },
  { stat: 'Energy', safe: '35%+', warning: '20-34%', critical: '0-19%', effect: 'Low energy blocks activities, minigames, and performances.' },
  { stat: 'Trust', safe: '40%+', warning: '25-39%', critical: '0-24%', effect: 'Low trust locks stronger interactions and higher-tier actions.' },
  { stat: 'Momentum', safe: '20%+', warning: '1-19%', critical: '0%', effect: 'Low momentum weakens the “showcase” side of the pet loop.' },
];

const ACTION_GROUPS = [
  {
    title: 'Care',
    icon: '🥣',
    items: [
      'Food restores Hunger and usually helps Energy.',
      'Rest restores Energy but can make your pet hungry again.',
      'Favourite foods give stronger mood and trust bonuses.',
      'Disliked foods still help upkeep, but they are less efficient emotionally.',
    ],
  },
  {
    title: 'Bonding',
    icon: '🫶',
    items: [
      'Praise, cuddles, grooming, and toys help Trust and Bond.',
      'Trust grows best from consistency, not spam.',
      'If you only tap endlessly, returns diminish quickly.',
      'Strong Trust unlocks better activities and a more capable companion.',
    ],
  },
  {
    title: 'Activities',
    icon: '🎮',
    items: [
      'Train, play, groom, rest, spar, and explore each trade Energy and Hunger for progress.',
      'Spar and explore need good Energy, Hunger, and Momentum.',
      'The pet should feel like it has to be maintained before the fun stuff works.',
      'Higher Bond means the same actions carry more long-term meaning.',
    ],
  },
  {
    title: 'Requests',
    icon: '📌',
    items: [
      'Your pet now surfaces direct needs such as a meal, recovery, bonding, or a Pump session.',
      'Completed requests become claimable rewards.',
      'Ignored requests can expire and hurt relationship quality.',
      'Requests are meant to tell you what the pet needs next instead of making you guess.',
    ],
  },
];

const CURRENCIES = [
  { name: 'Combo', desc: 'Earned from synced plays. Main spending currency.' },
  { name: 'Bond Tokens', desc: 'Earned from missions, requests, and deeper progression beats.' },
  { name: 'Shards', desc: 'Rare progression currency tied to stronger rewards and future premium unlocks.' },
  { name: 'XP', desc: 'Levels up your companion and unlocks tricks and milestones.' },
];

const TIPS = [
  'If your pet feels “stuck,” check Hunger first, then Energy, then Momentum.',
  'Momentum is supposed to fade quickly. It reflects recent Pump activity, not permanent mood.',
  'Trust is slow by design. Reliable care beats one big burst.',
  'Bond never decays, so short rough patches do not erase your long-term progress.',
  'Requests are your best “what should I do next?” surface.',
];

function colorClass(color) {
  return {
    orange: 'border-orange-400/15 bg-orange-500/[0.06] text-orange-200',
    cyan: 'border-cyan-400/15 bg-cyan-500/[0.06] text-cyan-200',
    emerald: 'border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-200',
    violet: 'border-violet-400/15 bg-violet-500/[0.06] text-violet-200',
    amber: 'border-amber-400/15 bg-amber-500/[0.06] text-amber-200',
    pink: 'border-pink-400/15 bg-pink-500/[0.06] text-pink-200',
  }[color] || 'border-white/[0.08] bg-white/[0.03] text-gray-200';
}

function Section({ title, subtitle, children }) {
  return (
    <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function PetGuidePage() {
  const [activeCharacter, setActiveCharacter] = useState('dojocat');
  const active = CHARACTERS.find((entry) => entry.id === activeCharacter) || CHARACTERS[0];

  return (
    <div className="min-h-screen bg-piu-dark pb-28">
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_38%),radial-gradient(circle_at_bottom,rgba(245,158,11,0.10),transparent_35%)]" />
        <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-cyan-400/15 bg-cyan-500/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
              Pet Guide
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Pump more.
              <br />
              Care better.
              <br />
              Grow together.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-300 sm:text-base">
              The pet system is built around a simple loop: real Pump play creates resources and Momentum,
              then good care turns those into Bond, unlocks, and a stronger companion identity.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/pet"
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/85 transition-all hover:border-white/15 hover:text-white"
              >
                Back to Pet
              </Link>
              <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.06] px-4 py-2 text-sm font-semibold text-amber-200">
                Pump {'->'} Combo + Momentum {'->'} Care {'->'} Bond
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-6 sm:px-6">
        <Section title="Meet The Companions" subtitle="Each companion has its own flavour, but the core care loop is shared.">
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
              {CHARACTERS.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => setActiveCharacter(character.id)}
                  className={`rounded-2xl border p-3 text-left transition-all ${
                    activeCharacter === character.id
                      ? 'border-cyan-400/20 bg-cyan-500/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.03] hover:border-white/14'
                  }`}
                >
                  <div className="flex justify-center">
                    <SpritePet character={character.id} weightState="normal" mood="happy" size={72} />
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{character.name}</div>
                  <div className="mt-1 text-[11px] text-gray-400">{character.title}</div>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <SpritePet character={active.id} weightState="normal" mood="happy" size={96} />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-black tracking-tight text-white">{active.name}</div>
                  <div className="mt-1 text-sm text-cyan-200">{active.title}</div>
                  <div className="mt-2 text-sm text-gray-300">{active.desc}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Favourite Foods</div>
                  <div className="mt-2 text-sm text-white/85">{active.favorites}</div>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Playstyle Fit</div>
                  <div className="mt-2 text-sm text-white/85">{active.personality}</div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Core Loop" subtitle="This is the intended rhythm of the feature.">
          <div className="grid gap-3 md:grid-cols-4">
            {LOOP_STEPS.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/75">Step {index + 1}</div>
                <div className="mt-2 text-lg font-bold text-white">{step.title}</div>
                <div className="mt-2 text-sm leading-6 text-gray-300">{step.body}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Vital Stats" subtitle="Only the stats that matter on the live page should be on the live page.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {STAT_CARDS.map((stat) => (
              <div key={stat.name} className={`rounded-2xl border p-4 ${colorClass(stat.color)}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-2xl">{stat.icon}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Live stat</div>
                </div>
                <div className="mt-3 text-lg font-black text-white">{stat.name}</div>
                <div className="mt-2 text-sm leading-6 text-white/80">{stat.desc}</div>
                <div className="mt-3 text-[11px] text-white/70">{stat.good}</div>
                <div className="mt-1 text-[11px] text-white/55">{stat.danger}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-sm leading-6 text-gray-300">
            Mood is now best understood as a derived state, not another confusing bar. When Hunger, Energy, Trust,
            and Momentum are all healthy, your pet feels <span className="font-semibold text-emerald-200">Thriving</span>.
            When they are neglected, the pet becomes <span className="font-semibold text-rose-200">Neglected</span> and
            more of the system starts pushing back.
          </div>
        </Section>

        <Section title="Thresholds And Locks" subtitle="These are the rough bands that decide what your pet can do.">
          <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
            <div className="grid grid-cols-[110px_100px_100px_100px_minmax(0,1fr)] gap-px bg-white/[0.06] text-[11px]">
              <div className="bg-white/[0.03] px-3 py-2 font-semibold text-white/85">Stat</div>
              <div className="bg-white/[0.03] px-3 py-2 font-semibold text-white/85">Safe</div>
              <div className="bg-white/[0.03] px-3 py-2 font-semibold text-white/85">Warning</div>
              <div className="bg-white/[0.03] px-3 py-2 font-semibold text-white/85">Critical</div>
              <div className="bg-white/[0.03] px-3 py-2 font-semibold text-white/85">What it changes</div>
              {THRESHOLD_ROWS.map((row) => (
                <React.Fragment key={row.stat}>
                  <div className="bg-black/20 px-3 py-2 text-white/85">{row.stat}</div>
                  <div className="bg-black/20 px-3 py-2 text-emerald-200">{row.safe}</div>
                  <div className="bg-black/20 px-3 py-2 text-amber-200">{row.warning}</div>
                  <div className="bg-black/20 px-3 py-2 text-rose-200">{row.critical}</div>
                  <div className="bg-black/20 px-3 py-2 text-gray-300">{row.effect}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </Section>

        <Section title="How Actions Fit" subtitle="Every surface should answer a different part of the care loop.">
          <div className="grid gap-3 md:grid-cols-2">
            {ACTION_GROUPS.map((group) => (
              <div key={group.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{group.icon}</span>
                  <div className="text-lg font-bold text-white">{group.title}</div>
                </div>
                <div className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <div key={item} className="rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2 text-sm leading-6 text-gray-300">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Requests And Missions" subtitle="These are the main “what should I do next?” guides.">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.06] p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/75">Requests</div>
              <div className="mt-2 text-lg font-bold text-white">Short-cycle pet needs</div>
              <div className="mt-2 text-sm leading-6 text-white/80">
                Requests surface immediate care goals like feeding, recovery, bonding, or getting a fresh Pump session in.
                Complete them, then claim the reward directly from the pet page.
              </div>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-amber-200/75">Missions</div>
              <div className="mt-2 text-lg font-bold text-white">Longer progression objectives</div>
              <div className="mt-2 text-sm leading-6 text-white/80">
                Missions are broader daily and weekly goals tied to the style of play your pet likes. They are for
                structured progress, while requests are for immediate needs.
              </div>
            </div>
          </div>
        </Section>

        <Section title="Progression And Currency" subtitle="Short-term wellbeing and long-term progression should stay separate.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {CURRENCIES.map((currency) => (
              <div key={currency.name} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="text-lg font-bold text-white">{currency.name}</div>
                <div className="mt-2 text-sm leading-6 text-gray-300">{currency.desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-sm leading-6 text-gray-300">
            Bond is the anchor. It is your permanent relationship history with the pet. Hunger, Energy, Trust, and
            Momentum are the living systems that make maintaining that bond interesting.
          </div>
        </Section>

        <Section title="Quick Tips" subtitle="The fastest way to keep the system feeling good.">
          <div className="grid gap-3 md:grid-cols-2">
            {TIPS.map((tip) => (
              <div key={tip} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm leading-6 text-gray-300">
                {tip}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

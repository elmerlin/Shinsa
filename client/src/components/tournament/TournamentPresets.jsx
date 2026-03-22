import React from 'react';

const PRESETS = [
  {
    id: 'round_robin_only',
    name: 'Round Robin',
    description: 'Everyone plays everyone across multiple rounds',
    icon: '\u{1F504}',
    color: 'border-sky-400/40 bg-sky-500/8 hover:border-sky-400/60',
    phases: [
      {
        format: 'round_robin',
        name: 'Round Robin',
        config: {
          rounds: 3,
          round_levels: [
            { round: 1, min: 18, max: 19 },
            { round: 2, min: 20, max: 21 },
            { round: 3, min: 22, max: 23 },
          ],
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
        },
        advancement: { type: 'all' },
      },
    ],
  },
  {
    id: 'pools_bracket',
    name: 'Pools \u2192 Top 8 Bracket',
    description: '4 pools of round robin, top 2 from each advance to single elimination',
    icon: '\u{1F3CA}\u{1F3C6}',
    color: 'border-cyan-400/40 bg-cyan-500/8 hover:border-cyan-400/60',
    phases: [
      {
        format: 'pools',
        name: 'Group Stage',
        config: {
          pool_count: 4,
          rounds_per_pool: 1,
          difficulty_min: 18,
          difficulty_max: 21,
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
        },
        advancement: { type: 'per_pool_top_n', count: 2 },
      },
      {
        format: 'single_elim',
        name: 'Top 8 Bracket',
        config: {
          difficulty_min: 20,
          difficulty_max: 23,
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
          third_place_match: true,
        },
        advancement: { type: 'all' },
      },
    ],
  },
  {
    id: 'swiss_gauntlet',
    name: 'Swiss \u2192 Gauntlet',
    description: 'Round robin seeding into King of the Hill elimination',
    icon: '\u{1F504}\u2694\uFE0F',
    color: 'border-piu-accent/40 bg-piu-accent/8 hover:border-piu-accent/60',
    phases: [
      {
        format: 'round_robin',
        name: 'Swiss Rounds',
        config: {
          rounds: 3,
          round_levels: [
            { round: 1, min: 18, max: 19 },
            { round: 2, min: 20, max: 21 },
            { round: 3, min: 22, max: 23 },
          ],
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
        },
        advancement: { type: 'all' },
      },
      {
        format: 'gauntlet',
        name: 'Gauntlet',
        config: {
          start_single_level: 19,
          final_single_level: 24,
        },
        advancement: { type: 'all' },
      },
    ],
  },
  {
    id: 'double_elim',
    name: 'Double Elimination',
    description: 'Full double elimination bracket with losers bracket and grand final',
    icon: '\u{1F94A}',
    color: 'border-amber-400/40 bg-amber-500/8 hover:border-amber-400/60',
    phases: [
      {
        format: 'double_elim',
        name: 'Double Elimination',
        config: {
          difficulty_min: 20,
          difficulty_max: 23,
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
          grand_final_reset: true,
        },
        advancement: { type: 'all' },
      },
    ],
  },
  {
    id: 'rr_hour_of_power',
    name: 'Round Robin \u2192 Hour of Power',
    description: 'Round robin seeding into a timed endurance challenge',
    icon: '\u{1F504}\u23F1\uFE0F',
    color: 'border-emerald-400/40 bg-emerald-500/8 hover:border-emerald-400/60',
    phases: [
      {
        format: 'round_robin',
        name: 'Seeding Rounds',
        config: {
          rounds: 2,
          round_levels: [
            { round: 1, min: 18, max: 19 },
            { round: 2, min: 20, max: 21 },
          ],
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
        },
        advancement: { type: 'all' },
      },
      {
        format: 'hour_of_power',
        name: 'Hour of Power',
        config: {
          duration_minutes: 60,
          difficulty_min: 18,
          difficulty_max: 23,
        },
        advancement: { type: 'all' },
      },
    ],
  },
  {
    id: 'pools_double_elim',
    name: 'Pools \u2192 Double Elim',
    description: 'Pool play into double elimination for the top contenders',
    icon: '\u{1F3CA}\u{1F94A}',
    color: 'border-piu-gold/40 bg-piu-gold/8 hover:border-piu-gold/60',
    phases: [
      {
        format: 'pools',
        name: 'Pool Play',
        config: {
          pool_count: 4,
          rounds_per_pool: 1,
          difficulty_min: 18,
          difficulty_max: 21,
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
        },
        advancement: { type: 'per_pool_top_n', count: 2 },
      },
      {
        format: 'double_elim',
        name: 'Double Elimination',
        config: {
          difficulty_min: 20,
          difficulty_max: 24,
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
          grand_final_reset: true,
        },
        advancement: { type: 'all' },
      },
    ],
  },
];

export default function TournamentPresets({ onSelect }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-display font-bold text-sm text-gray-300 uppercase tracking-wider">Quick Start Presets</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.phases)}
            className={`card border text-left p-3 transition-all cursor-pointer ${preset.color}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{preset.icon}</span>
              <span className="font-display font-bold text-sm text-white">{preset.name}</span>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed">{preset.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export { PRESETS };

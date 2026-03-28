import React from 'react';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

function NumberField({ label, value, onChange, min = 1, max = 99, hint }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type="number"
        className="input-field w-full"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : parseInt(e.target.value, 10) || min)}
        onFocus={(e) => e.target.select()}
      />
      {hint ? <p className="mt-1 text-[10px] text-gray-600">{hint}</p> : null}
    </div>
  );
}

function ConfigSection({ eyebrow, title, description, children }) {
  return (
    <Card className="border-white/8 bg-black/18">
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {eyebrow ? <Badge variant="default">{eyebrow}</Badge> : null}
          {title ? <p className="font-display text-lg font-bold text-white">{title}</p> : null}
          {description ? <p className="text-sm leading-relaxed text-zinc-400">{description}</p> : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function DifficultyRange({ config, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        label="Min Level"
        value={config.difficulty_min ?? 18}
        onChange={(value) => onChange({ ...config, difficulty_min: value })}
        min={1}
        max={28}
      />
      <NumberField
        label="Max Level"
        value={config.difficulty_max ?? 23}
        onChange={(value) => onChange({ ...config, difficulty_max: value })}
        min={1}
        max={28}
      />
    </div>
  );
}

function MatchSettings({ config, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <NumberField
        label="Best of"
        value={config.best_of ?? 3}
        onChange={(value) => onChange({ ...config, best_of: value })}
        min={1}
        max={9}
      />
      <NumberField
        label="Cards drawn"
        value={config.cards_per_draw ?? 5}
        onChange={(value) => onChange({ ...config, cards_per_draw: value })}
        min={2}
        max={10}
      />
      <NumberField
        label="Vetoes"
        value={config.vetoes_per_player ?? 1}
        onChange={(value) => onChange({ ...config, vetoes_per_player: value })}
        min={0}
        max={5}
      />
    </div>
  );
}

function RoundLevels({ config, onChange }) {
  const rounds = config.rounds || 3;
  const roundLevels = config.round_levels || [];

  const updateRoundLevel = (index, field, value) => {
    const updated = [...roundLevels];
    updated[index] = { ...updated[index], [field]: value === '' ? '' : parseInt(value, 10) || 1, round: index + 1 };
    onChange({ ...config, round_levels: updated });
  };

  const handleRoundsChange = (value) => {
    const nextRounds = parseInt(value, 10) || 1;
    const nextLevels = [];
    for (let index = 0; index < nextRounds; index += 1) {
      nextLevels.push(roundLevels[index] || { round: index + 1, min: 18 + index * 2, max: 19 + index * 2 });
    }
    onChange({ ...config, rounds: nextRounds, round_levels: nextLevels });
  };

  return (
    <div className="space-y-3">
      <NumberField
        label="Number of Rounds"
        value={rounds}
        onChange={handleRoundsChange}
        min={1}
        max={10}
      />
      {roundLevels.map((level, index) => (
        <div key={`round-level-${index}`} className="flex items-center gap-3">
          <span className="w-14 shrink-0 font-display text-xs font-bold text-gray-500">R{index + 1}</span>
          <div className="flex flex-1 items-center gap-2">
            <input
              type="number"
              className="input-field w-16"
              min={1}
              max={28}
              value={level.min ?? 18}
              onChange={(e) => updateRoundLevel(index, 'min', e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <span className="text-gray-600">-</span>
            <input
              type="number"
              className="input-field w-16"
              min={1}
              max={28}
              value={level.max ?? 19}
              onChange={(e) => updateRoundLevel(index, 'max', e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AdvancementConfig({ advancement, onChange, format }) {
  const type = advancement.type || 'all';
  const showPoolOption = format === 'pools';

  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-400">Advancement to next phase</label>
      <select
        className="input-field w-full"
        value={type}
        onChange={(e) => onChange({ ...advancement, type: e.target.value })}
      >
        <option value="all">All players advance</option>
        <option value="top_n">Top N advance</option>
        {showPoolOption ? <option value="per_pool_top_n">Top N per pool</option> : null}
        <option value="threshold">Points threshold</option>
      </select>

      {(type === 'top_n' || type === 'per_pool_top_n') ? (
        <NumberField
          label={type === 'per_pool_top_n' ? 'Players per pool' : 'Number of players'}
          value={advancement.count ?? 8}
          onChange={(value) => onChange({ ...advancement, count: value })}
          min={1}
          max={64}
        />
      ) : null}

      {type === 'threshold' ? (
        <NumberField
          label="Minimum points"
          value={advancement.points ?? 5}
          onChange={(value) => onChange({ ...advancement, points: value })}
          min={0}
          max={999}
        />
      ) : null}
    </div>
  );
}

export default function PhaseConfigPanel({ phase, onChange, isLastPhase }) {
  const format = phase.format || 'round_robin';
  const config = phase.config || {};
  const advancement = phase.advancement || {};

  const updateConfig = (nextConfig) => onChange({ ...phase, config: nextConfig });
  const updateAdvancement = (nextAdvancement) => onChange({ ...phase, advancement: nextAdvancement });

  return (
    <div className="space-y-4">
      <ConfigSection
        eyebrow="Identity"
        title="Phase label"
        description="Use a custom name if you want a friendlier label than the default format name."
      >
        <div>
          <label className="mb-1 block text-sm text-gray-400">Phase Name (optional)</label>
          <input
            type="text"
            className="input-field w-full"
            placeholder={`e.g. "Group Stage", "Top 8 Bracket"`}
            value={phase.name || ''}
            onChange={(e) => onChange({ ...phase, name: e.target.value })}
          />
        </div>
      </ConfigSection>

      {format === 'round_robin' ? (
        <ConfigSection
          eyebrow="Round Robin"
          title="Rounds and match rules"
          description="Set round count, chart ranges, and the draft rules used in each match."
        >
          <RoundLevels config={config} onChange={updateConfig} />
          <MatchSettings config={config} onChange={updateConfig} />
        </ConfigSection>
      ) : null}

      {format === 'pools' ? (
        <ConfigSection
          eyebrow="Pools"
          title="Group stage structure"
          description="Choose pool count, rounds per pool, and the chart range used across the group stage."
        >
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Number of Pools"
              value={config.pool_count ?? 4}
              onChange={(value) => updateConfig({ ...config, pool_count: value })}
              min={2}
              max={16}
            />
            <NumberField
              label="Rounds per Pool"
              value={config.rounds_per_pool ?? 1}
              onChange={(value) => updateConfig({ ...config, rounds_per_pool: value })}
              min={1}
              max={5}
            />
          </div>
          <DifficultyRange config={config} onChange={updateConfig} />
          <MatchSettings config={config} onChange={updateConfig} />
        </ConfigSection>
      ) : null}

      {format === 'single_elim' ? (
        <ConfigSection
          eyebrow="Single Elimination"
          title="Bracket rules"
          description="Configure the chart range and whether to run a third-place decider."
        >
          <DifficultyRange config={config} onChange={updateConfig} />
          <MatchSettings config={config} onChange={updateConfig} />
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={config.third_place_match ?? true}
              onChange={(e) => updateConfig({ ...config, third_place_match: e.target.checked })}
              className="peer sr-only"
            />
            <div className="relative h-5 w-9 rounded-full bg-piu-dark transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-piu-accent peer-checked:after:translate-x-full" />
            <span className="text-sm text-gray-400">3rd place match</span>
          </label>
        </ConfigSection>
      ) : null}

      {format === 'double_elim' ? (
        <ConfigSection
          eyebrow="Double Elimination"
          title="Winners and losers bracket"
          description="Configure the chart band and whether the grand final resets for the losers bracket winner."
        >
          <DifficultyRange config={config} onChange={updateConfig} />
          <MatchSettings config={config} onChange={updateConfig} />
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={config.grand_final_reset ?? true}
              onChange={(e) => updateConfig({ ...config, grand_final_reset: e.target.checked })}
              className="peer sr-only"
            />
            <div className="relative h-5 w-9 rounded-full bg-piu-dark transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-piu-accent peer-checked:after:translate-x-full" />
            <span className="text-sm text-gray-400">Grand Final reset (losers bracket winner gets 2nd chance)</span>
          </label>
        </ConfigSection>
      ) : null}

      {format === 'gauntlet' ? (
        <ConfigSection
          eyebrow="Gauntlet"
          title="Difficulty climb"
          description="Set the starting and final single-chart levels for the king-of-the-hill run."
        >
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Starting Single Level"
              value={config.start_single_level ?? 19}
              onChange={(value) => updateConfig({ ...config, start_single_level: value })}
              min={1}
              max={28}
              hint={`Double: ${(parseInt(config.start_single_level, 10) || 19) + 1}`}
            />
            <NumberField
              label="Final Single Level"
              value={config.final_single_level ?? 24}
              onChange={(value) => updateConfig({ ...config, final_single_level: value })}
              min={1}
              max={28}
              hint={`Double: ${(parseInt(config.final_single_level, 10) || 24) + 1}`}
            />
          </div>
        </ConfigSection>
      ) : null}

      {format === 'hour_of_power' ? (
        <ConfigSection
          eyebrow="Hour of Power"
          title="Timed endurance settings"
          description="Players play as many songs as possible inside the time window. Cumulative rating points determine rank."
        >
          <NumberField
            label="Duration (minutes)"
            value={config.duration_minutes ?? 60}
            onChange={(value) => updateConfig({ ...config, duration_minutes: value })}
            min={10}
            max={180}
          />
          <DifficultyRange config={config} onChange={updateConfig} />
        </ConfigSection>
      ) : null}

      {format === 'b15' ? (
        <ConfigSection
          eyebrow="Best 15"
          title="Compressed pumbility window"
          description="This format scores the best 15 results inside the time limit, similar to a condensed pumbility session."
        >
          <NumberField
            label="Duration (minutes)"
            value={config.duration_minutes ?? 60}
            onChange={(value) => updateConfig({ ...config, duration_minutes: value })}
            min={10}
            max={180}
          />
          <DifficultyRange config={config} onChange={updateConfig} />
        </ConfigSection>
      ) : null}

      {!isLastPhase ? (
        <ConfigSection
          eyebrow="Advancement"
          title="Who moves on?"
          description="Choose how players qualify into the next phase of the tournament."
        >
          <AdvancementConfig
            advancement={advancement}
            onChange={updateAdvancement}
            format={format}
          />
        </ConfigSection>
      ) : null}
    </div>
  );
}

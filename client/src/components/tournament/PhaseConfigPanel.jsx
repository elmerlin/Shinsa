import React from 'react';
import { ADVANCEMENT_TYPES } from '../../utils/tournamentConstants';

function NumberField({ label, value, onChange, min = 1, max = 99, hint }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        className="input-field w-full"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : parseInt(e.target.value) || min)}
        onFocus={(e) => e.target.select()}
      />
      {hint && <p className="text-[10px] text-gray-600 mt-1">{hint}</p>}
    </div>
  );
}

function DifficultyRange({ config, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        label="Min Level"
        value={config.difficulty_min ?? 18}
        onChange={(v) => onChange({ ...config, difficulty_min: v })}
        min={1}
        max={28}
      />
      <NumberField
        label="Max Level"
        value={config.difficulty_max ?? 23}
        onChange={(v) => onChange({ ...config, difficulty_max: v })}
        min={1}
        max={28}
      />
    </div>
  );
}

function MatchSettings({ config, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <NumberField
        label="Best of"
        value={config.best_of ?? 3}
        onChange={(v) => onChange({ ...config, best_of: v })}
        min={1}
        max={9}
      />
      <NumberField
        label="Cards drawn"
        value={config.cards_per_draw ?? 5}
        onChange={(v) => onChange({ ...config, cards_per_draw: v })}
        min={2}
        max={10}
      />
      <NumberField
        label="Vetoes"
        value={config.vetoes_per_player ?? 1}
        onChange={(v) => onChange({ ...config, vetoes_per_player: v })}
        min={0}
        max={5}
      />
    </div>
  );
}

function RoundLevels({ config, onChange }) {
  const rounds = config.rounds || 3;
  const roundLevels = config.round_levels || [];

  const updateRoundLevel = (idx, field, val) => {
    const updated = [...roundLevels];
    updated[idx] = { ...updated[idx], [field]: val === '' ? '' : parseInt(val) || 1, round: idx + 1 };
    onChange({ ...config, round_levels: updated });
  };

  const handleRoundsChange = (val) => {
    const n = parseInt(val) || 1;
    const newLevels = [];
    for (let i = 0; i < n; i++) {
      newLevels.push(roundLevels[i] || { round: i + 1, min: 18 + i * 2, max: 19 + i * 2 });
    }
    onChange({ ...config, rounds: n, round_levels: newLevels });
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
      {roundLevels.map((lvl, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-14 font-display font-bold shrink-0">R{idx + 1}</span>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="number"
              className="input-field w-16"
              min={1}
              max={28}
              value={lvl.min ?? 18}
              onChange={(e) => updateRoundLevel(idx, 'min', e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <span className="text-gray-600">-</span>
            <input
              type="number"
              className="input-field w-16"
              min={1}
              max={28}
              value={lvl.max ?? 19}
              onChange={(e) => updateRoundLevel(idx, 'max', e.target.value)}
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
    <div className="space-y-3 pt-3 border-t border-piu-border/30">
      <label className="block text-sm text-gray-400">Advancement to next phase</label>
      <select
        className="input-field w-full"
        value={type}
        onChange={(e) => onChange({ ...advancement, type: e.target.value })}
      >
        <option value="all">All players advance</option>
        <option value="top_n">Top N advance</option>
        {showPoolOption && <option value="per_pool_top_n">Top N per pool</option>}
        <option value="threshold">Points threshold</option>
      </select>
      {(type === 'top_n' || type === 'per_pool_top_n') && (
        <NumberField
          label={type === 'per_pool_top_n' ? 'Players per pool' : 'Number of players'}
          value={advancement.count ?? 8}
          onChange={(v) => onChange({ ...advancement, count: v })}
          min={1}
          max={64}
        />
      )}
      {type === 'threshold' && (
        <NumberField
          label="Minimum points"
          value={advancement.points ?? 5}
          onChange={(v) => onChange({ ...advancement, points: v })}
          min={0}
          max={999}
        />
      )}
    </div>
  );
}

export default function PhaseConfigPanel({ phase, onChange, isLastPhase }) {
  const format = phase.format || 'round_robin';
  const config = phase.config || {};
  const advancement = phase.advancement || {};

  const updateConfig = (newConfig) => onChange({ ...phase, config: newConfig });
  const updateAdvancement = (newAdv) => onChange({ ...phase, advancement: newAdv });

  return (
    <div className="space-y-4">
      {/* Optional phase name */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Phase Name (optional)</label>
        <input
          type="text"
          className="input-field w-full"
          placeholder={`e.g. "Group Stage", "Top 8 Bracket"`}
          value={phase.name || ''}
          onChange={(e) => onChange({ ...phase, name: e.target.value })}
        />
      </div>

      {/* Format-specific config */}
      {(format === 'round_robin') && (
        <>
          <RoundLevels config={config} onChange={updateConfig} />
          <MatchSettings config={config} onChange={updateConfig} />
        </>
      )}

      {format === 'pools' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Number of Pools"
              value={config.pool_count ?? 4}
              onChange={(v) => updateConfig({ ...config, pool_count: v })}
              min={2}
              max={16}
            />
            <NumberField
              label="Rounds per Pool"
              value={config.rounds_per_pool ?? 1}
              onChange={(v) => updateConfig({ ...config, rounds_per_pool: v })}
              min={1}
              max={5}
            />
          </div>
          <DifficultyRange config={config} onChange={updateConfig} />
          <MatchSettings config={config} onChange={updateConfig} />
        </>
      )}

      {format === 'single_elim' && (
        <>
          <DifficultyRange config={config} onChange={updateConfig} />
          <MatchSettings config={config} onChange={updateConfig} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.third_place_match ?? true}
              onChange={(e) => updateConfig({ ...config, third_place_match: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-piu-dark rounded-full peer peer-checked:bg-piu-accent transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full relative" />
            <span className="text-sm text-gray-400">3rd place match</span>
          </label>
        </>
      )}

      {format === 'double_elim' && (
        <>
          <DifficultyRange config={config} onChange={updateConfig} />
          <MatchSettings config={config} onChange={updateConfig} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.grand_final_reset ?? true}
              onChange={(e) => updateConfig({ ...config, grand_final_reset: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-piu-dark rounded-full peer peer-checked:bg-piu-accent transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full relative" />
            <span className="text-sm text-gray-400">Grand Final reset (losers bracket winner gets 2nd chance)</span>
          </label>
        </>
      )}

      {format === 'gauntlet' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Starting Single Level"
            value={config.start_single_level ?? 19}
            onChange={(v) => updateConfig({ ...config, start_single_level: v })}
            min={1}
            max={28}
            hint={`Double: ${(parseInt(config.start_single_level) || 19) + 1}`}
          />
          <NumberField
            label="Final Single Level"
            value={config.final_single_level ?? 24}
            onChange={(v) => updateConfig({ ...config, final_single_level: v })}
            min={1}
            max={28}
            hint={`Double: ${(parseInt(config.final_single_level) || 24) + 1}`}
          />
        </div>
      )}

      {format === 'hour_of_power' && (
        <>
          <NumberField
            label="Duration (minutes)"
            value={config.duration_minutes ?? 60}
            onChange={(v) => updateConfig({ ...config, duration_minutes: v })}
            min={10}
            max={180}
          />
          <DifficultyRange config={config} onChange={updateConfig} />
          <p className="text-xs text-gray-500">Players play as many songs as possible. Cumulative rating points determine ranking.</p>
        </>
      )}

      {format === 'b15' && (
        <>
          <NumberField
            label="Duration (minutes)"
            value={config.duration_minutes ?? 60}
            onChange={(v) => updateConfig({ ...config, duration_minutes: v })}
            min={10}
            max={180}
          />
          <DifficultyRange config={config} onChange={updateConfig} />
          <p className="text-xs text-gray-500">Best 15 scores within the time window. Like Pumbility (best 50) but compressed to 15.</p>
        </>
      )}

      {/* Advancement rules - only if not the last phase */}
      {!isLastPhase && (
        <AdvancementConfig
          advancement={advancement}
          onChange={updateAdvancement}
          format={format}
        />
      )}
    </div>
  );
}

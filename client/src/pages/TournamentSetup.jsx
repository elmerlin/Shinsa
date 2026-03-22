import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTournament, createPhase } from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS, FORMAT_DESCRIPTIONS } from '../utils/tournamentConstants';
import AvatarPicker from '../components/AvatarPicker';
import PhaseCard from '../components/tournament/PhaseCard';
import PhaseConfigPanel from '../components/tournament/PhaseConfigPanel';
import TournamentPresets from '../components/tournament/TournamentPresets';

const ALL_FORMATS = ['round_robin', 'pools', 'single_elim', 'double_elim', 'gauntlet', 'hour_of_power', 'b15'];

const DEFAULT_CONFIGS = {
  round_robin: {
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
  pools: {
    pool_count: 4,
    rounds_per_pool: 1,
    difficulty_min: 18,
    difficulty_max: 21,
    cards_per_draw: 5,
    vetoes_per_player: 1,
    best_of: 3,
  },
  single_elim: {
    difficulty_min: 20,
    difficulty_max: 23,
    cards_per_draw: 5,
    vetoes_per_player: 1,
    best_of: 3,
    third_place_match: true,
  },
  double_elim: {
    difficulty_min: 20,
    difficulty_max: 23,
    cards_per_draw: 5,
    vetoes_per_player: 1,
    best_of: 3,
    grand_final_reset: true,
  },
  gauntlet: {
    start_single_level: 19,
    final_single_level: 24,
  },
  hour_of_power: {
    duration_minutes: 60,
    difficulty_min: 18,
    difficulty_max: 23,
  },
  b15: {
    duration_minutes: 60,
    difficulty_min: 18,
    difficulty_max: 23,
  },
};

export default function TournamentSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    avatar: '',
  });
  const [phases, setPhases] = useState([]);
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const addPhase = (format) => {
    const newPhase = {
      _key: Date.now(),
      format,
      name: '',
      config: { ...DEFAULT_CONFIGS[format] },
      advancement: { type: 'all' },
    };
    setPhases(prev => [...prev, newPhase]);
    setExpandedPhase(prev => prev === null ? phases.length : prev);
    setShowFormatPicker(false);
  };

  const updatePhase = (idx, updated) => {
    setPhases(prev => prev.map((p, i) => i === idx ? { ...p, ...updated } : p));
  };

  const removePhase = (idx) => {
    setPhases(prev => prev.filter((_, i) => i !== idx));
    if (expandedPhase === idx) setExpandedPhase(null);
    else if (expandedPhase > idx) setExpandedPhase(expandedPhase - 1);
  };

  const movePhase = (idx, direction) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= phases.length) return;
    setPhases(prev => {
      const updated = [...prev];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      return updated;
    });
    if (expandedPhase === idx) setExpandedPhase(newIdx);
    else if (expandedPhase === newIdx) setExpandedPhase(idx);
  };

  const loadPreset = (presetPhases) => {
    setPhases(presetPhases.map((p, i) => ({ ...p, _key: Date.now() + i })));
    setExpandedPhase(0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (phases.length === 0) return;
    setSaving(true);
    try {
      // Build legacy config from first phase for backwards compat
      const firstPhase = phases[0];
      const legacyConfig = firstPhase.config || {};

      const tournament = await createTournament({
        name: form.name,
        location: form.location,
        date: form.date,
        avatar: form.avatar,
        total_rounds: legacyConfig.rounds || 1,
        config: {
          ...legacyConfig,
          phases_enabled: true,
        },
      });

      // Create phases in order
      for (let i = 0; i < phases.length; i++) {
        const p = phases[i];
        await createPhase({
          tournament_id: tournament.id,
          phase_order: i + 1,
          format: p.format,
          name: p.name || '',
          config: p.config || {},
          advancement: p.advancement || { type: 'all' },
        });
      }

      navigate(`/tournament/${tournament.id}`);
    } catch (err) {
      // Toast will handle this once integrated, fall back to alert for now
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getFlowPreview = () => {
    if (phases.length === 0) return null;
    return phases.map((p, i) => {
      const label = p.name || FORMAT_LABELS[p.format] || p.format;
      const adv = p.advancement;
      let arrow = '';
      if (i < phases.length - 1 && adv && adv.type !== 'all') {
        if (adv.type === 'top_n') arrow = ` \u2192 Top ${adv.count || 8}`;
        else if (adv.type === 'per_pool_top_n') arrow = ` \u2192 Top ${adv.count || 2}/pool`;
        else if (adv.type === 'threshold') arrow = ` \u2192 ${adv.points || 0}+ pts`;
      }
      return { label, arrow, icon: FORMAT_ICONS[p.format] || '' };
    });
  };

  const flowPreview = getFlowPreview();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="section-title mb-6">CREATE TOURNAMENT</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Info */}
        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">General Info</h2>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Tournament Name *</label>
            <input
              type="text"
              className="input-field"
              placeholder='e.g. "Shinsa Season 1"'
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <AvatarPicker
            value={form.avatar}
            onChange={(avatar) => setForm(f => ({ ...f, avatar }))}
            shape="square"
            size="md"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Location</label>
              <input
                type="text"
                className="input-field"
                placeholder="Pump Dojo"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date</label>
              <input
                type="date"
                className="input-field"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Presets */}
        {phases.length === 0 && (
          <TournamentPresets onSelect={loadPreset} />
        )}

        {/* Phase Pipeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg text-piu-accent">
              Tournament Phases {phases.length > 0 && <span className="text-gray-500 text-sm">({phases.length})</span>}
            </h2>
            {phases.length > 0 && (
              <button
                type="button"
                onClick={() => setPhases([])}
                className="text-xs text-gray-500 hover:text-piu-accent transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {phases.length === 0 && (
            <div className="card border-dashed border-piu-border/50 text-center py-8">
              <p className="text-gray-500 text-sm mb-3">No phases added yet</p>
              <p className="text-gray-600 text-xs">Choose a preset above or add phases manually below</p>
            </div>
          )}

          <div className="space-y-6">
            {phases.map((phase, idx) => (
              <PhaseCard
                key={phase._key}
                phase={phase}
                index={idx}
                total={phases.length}
                isExpanded={expandedPhase === idx}
                onToggle={() => setExpandedPhase(expandedPhase === idx ? null : idx)}
                onRemove={() => removePhase(idx)}
                onMoveUp={() => movePhase(idx, -1)}
                onMoveDown={() => movePhase(idx, 1)}
              >
                <PhaseConfigPanel
                  phase={phase}
                  onChange={(updated) => updatePhase(idx, updated)}
                  isLastPhase={idx === phases.length - 1}
                />
              </PhaseCard>
            ))}
          </div>

          {/* Add Phase */}
          {showFormatPicker ? (
            <div className="card border-piu-accent/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-piu-accent">Add Phase</h3>
                <button
                  type="button"
                  onClick={() => setShowFormatPicker(false)}
                  className="text-gray-500 hover:text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_FORMATS.map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => addPhase(format)}
                    className="card border border-piu-border/50 hover:border-piu-accent/50 p-3 text-left transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{FORMAT_ICONS[format] || ''}</span>
                      <span className="font-display font-bold text-xs text-white">{FORMAT_LABELS[format] || format}</span>
                    </div>
                    <p className="text-[9px] text-gray-500 leading-relaxed">{FORMAT_DESCRIPTIONS[format] || ''}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowFormatPicker(true)}
              className="w-full card border-dashed border-piu-border/50 hover:border-piu-accent/40 text-center py-3 transition-all cursor-pointer"
            >
              <span className="text-gray-400 text-sm font-display font-bold">+ Add Phase</span>
            </button>
          )}
        </div>

        {/* Flow Preview */}
        {flowPreview && flowPreview.length > 0 && (
          <div className="card bg-piu-dark/50 border-piu-border/30 p-3">
            <h3 className="font-display font-bold text-[10px] text-gray-500 uppercase tracking-wider mb-2">Tournament Flow</h3>
            <div className="flex items-center gap-1 flex-wrap text-xs">
              {flowPreview.map((step, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-piu-accent font-bold mx-1">{'\u2192'}</span>}
                  <span className="inline-flex items-center gap-1 rounded-full border border-piu-border/40 bg-piu-card px-2.5 py-1 font-display font-bold text-white">
                    <span>{step.icon}</span> {step.label}
                  </span>
                  {step.arrow && (
                    <span className="text-[10px] text-piu-green font-mono">{step.arrow}</span>
                  )}
                </React.Fragment>
              ))}
              <span className="text-piu-accent font-bold mx-1">{'\u2192'}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-piu-gold/40 bg-piu-gold/10 px-2.5 py-1 font-display font-bold text-piu-gold">
                {'\u{1F3C6}'} Champion
              </span>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            className="btn-primary flex-1"
            disabled={saving || phases.length === 0 || !form.name.trim()}
          >
            {saving ? 'Creating...' : 'Create Tournament'}
          </button>
          <button type="button" onClick={() => navigate('/')} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

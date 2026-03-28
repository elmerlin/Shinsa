import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTournament, createPhase } from '../utils/api';
import { FORMAT_DESCRIPTIONS, FORMAT_ICONS, FORMAT_LABELS } from '../utils/tournamentConstants';
import AvatarPicker from '../components/AvatarPicker';
import PhaseCard from '../components/tournament/PhaseCard';
import PhaseConfigPanel from '../components/tournament/PhaseConfigPanel';
import TournamentPresets from '../components/tournament/TournamentPresets';
import { TournamentEmptyPanel } from '../components/tournament/TournamentChrome';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';

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

function SetupSectionHeader({ eyebrow, title, description, action = null }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? <Badge variant="default">{eyebrow}</Badge> : null}
        {title ? <h2 className="mt-2 font-display text-2xl font-bold text-white">{title}</h2> : null}
        {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

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
    setPhases((prev) => [...prev, newPhase]);
    setExpandedPhase((prev) => (prev === null ? phases.length : prev));
    setShowFormatPicker(false);
  };

  const updatePhase = (idx, updated) => {
    setPhases((prev) => prev.map((phase, index) => (index === idx ? { ...phase, ...updated } : phase)));
  };

  const removePhase = (idx) => {
    setPhases((prev) => prev.filter((_, index) => index !== idx));
    if (expandedPhase === idx) setExpandedPhase(null);
    else if (expandedPhase > idx) setExpandedPhase(expandedPhase - 1);
  };

  const movePhase = (idx, direction) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= phases.length) return;
    setPhases((prev) => {
      const updated = [...prev];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      return updated;
    });
    if (expandedPhase === idx) setExpandedPhase(newIdx);
    else if (expandedPhase === newIdx) setExpandedPhase(idx);
  };

  const loadPreset = (presetPhases) => {
    setPhases(presetPhases.map((phase, index) => ({ ...phase, _key: Date.now() + index })));
    setExpandedPhase(0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (phases.length === 0) return;
    setSaving(true);
    try {
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

      for (let index = 0; index < phases.length; index += 1) {
        const phase = phases[index];
        await createPhase({
          tournament_id: tournament.id,
          phase_order: index + 1,
          format: phase.format,
          name: phase.name || '',
          config: phase.config || {},
          advancement: phase.advancement || { type: 'all' },
        });
      }

      navigate(`/tournament/${tournament.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getFlowPreview = () => {
    if (phases.length === 0) return null;
    return phases.map((phase, index) => {
      const label = phase.name || FORMAT_LABELS[phase.format] || phase.format;
      const advancement = phase.advancement;
      let arrow = '';
      if (index < phases.length - 1 && advancement && advancement.type !== 'all') {
        if (advancement.type === 'top_n') arrow = `Top ${advancement.count || 8}`;
        else if (advancement.type === 'per_pool_top_n') arrow = `Top ${advancement.count || 2}/pool`;
        else if (advancement.type === 'threshold') arrow = `${advancement.points || 0}+ pts`;
      }
      return { label, arrow, icon: FORMAT_ICONS[phase.format] || '' };
    });
  };

  const flowPreview = getFlowPreview();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="space-y-6">
        <Card className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,51,102,0.18),transparent_36%),radial-gradient(circle_at_82%_20%,rgba(255,199,92,0.14),transparent_28%),rgba(8,11,20,0.94)]">
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="border-piu-accent/25 bg-piu-accent/12 text-rose-100">Tournament Setup</Badge>
              <Badge variant={phases.length > 0 ? 'success' : 'warning'}>
                {phases.length > 0 ? `${phases.length} phase${phases.length === 1 ? '' : 's'} configured` : 'Add at least one phase'}
              </Badge>
            </div>

            <div className="space-y-4">
              <div>
                <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Build the bracket before match one</h1>
                <p className="mt-3 max-w-3xl text-sm text-zinc-300">
                  Set the shell, line up the phases, then add registered players.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-[0.14em] text-zinc-300">
                  1. Details
                </span>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-[0.14em] text-zinc-300">
                  2. Phases
                </span>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-[0.14em] text-zinc-300">
                  3. Players
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-white/8 bg-zinc-950/60">
            <CardContent className="space-y-5">
              <SetupSectionHeader
                eyebrow="General Info"
                title="Tournament details"
                description="Shown on setup, overview, and watch pages."
              />

              <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm text-gray-400">Tournament Name *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder='e.g. "Shinsa Season 1"'
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-gray-400">Location</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Pump Dojo"
                        value={form.location}
                        onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-400">Date</label>
                      <input
                        type="date"
                        className="input-field"
                        value={form.date}
                        onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[1rem] border border-white/8 bg-black/18 p-4">
                  <p className="font-display text-sm font-bold uppercase tracking-[0.16em] text-zinc-400">Card Avatar</p>
                  <p className="mt-1 text-sm text-zinc-500">Used on the tournament card and header.</p>
                  <div className="mt-4">
                    <AvatarPicker
                      value={form.avatar}
                      onChange={(avatar) => setForm((prev) => ({ ...prev, avatar }))}
                      shape="square"
                      size="md"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {phases.length === 0 ? (
            <TournamentPresets onSelect={loadPreset} />
          ) : null}

          <div className="space-y-4">
              <SetupSectionHeader
                eyebrow="Phase Pipeline"
                title="Design the tournament flow"
                description="Stack formats in order and define how each stage feeds the next."
                action={phases.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setPhases([])}
                  className="rounded-full border border-white/8 bg-white/5 px-3 py-2 text-xs font-display font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-white/14 hover:text-white"
                >
                  Clear all
                </button>
              ) : null}
            />

            {phases.length === 0 ? (
              <TournamentEmptyPanel
                title="No phases added yet"
                description="Choose a preset above or add formats manually below."
              />
            ) : (
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
            )}

            {showFormatPicker ? (
              <Card className="border-piu-accent/25 bg-zinc-950/60">
                <CardContent className="space-y-4">
                  <SetupSectionHeader
                    eyebrow="Add Phase"
                    title="Choose the next format"
                    description="Each phase becomes its own tournament tab."
                    action={(
                      <button
                        type="button"
                        onClick={() => setShowFormatPicker(false)}
                        className="rounded-full border border-white/8 bg-white/5 px-3 py-2 text-xs font-display font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-white/14 hover:text-white"
                      >
                        Cancel
                      </button>
                    )}
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {ALL_FORMATS.map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => addPhase(format)}
                        className="rounded-xl border border-white/8 bg-black/18 p-4 text-left transition-colors hover:border-piu-accent/35 hover:bg-black/26"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-lg">
                            {FORMAT_ICONS[format] || ''}
                          </div>
                          <div>
                            <p className="font-display text-sm font-bold text-white">{FORMAT_LABELS[format] || format}</p>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Add phase</p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{FORMAT_DESCRIPTIONS[format] || ''}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <button
                type="button"
                onClick={() => setShowFormatPicker(true)}
                className="w-full rounded-xl border border-dashed border-white/12 bg-zinc-950/40 px-4 py-5 text-center transition-colors hover:border-piu-accent/35 hover:bg-zinc-950/55"
              >
                <span className="font-display text-sm font-bold uppercase tracking-[0.16em] text-zinc-300">+ Add Phase</span>
              </button>
            )}
          </div>

          {flowPreview && flowPreview.length > 0 ? (
            <Card className="border-white/8 bg-zinc-950/60">
              <CardContent className="space-y-4">
                <SetupSectionHeader
                  eyebrow="Tournament Flow"
                  title="Phase order"
                  description="Preview the progression from opening phase to champion."
                />

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {flowPreview.map((step, index) => (
                    <React.Fragment key={`${step.label}-${index}`}>
                      {index > 0 ? <span className="text-piu-accent">→</span> : null}
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/6 px-3 py-1.5 font-display font-bold text-white">
                        <span aria-hidden="true">{step.icon}</span>
                        <span>{step.label}</span>
                      </span>
                      {step.arrow ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/15 bg-emerald-400/8 px-2.5 py-1 text-xs font-mono text-emerald-200">
                          {step.arrow}
                        </span>
                      ) : null}
                    </React.Fragment>
                  ))}
                  <span className="text-piu-accent">→</span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-piu-gold/25 bg-piu-gold/10 px-3 py-1.5 font-display font-bold text-piu-gold">
                    {'\u{1F3C6}'} Champion
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
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
    </div>
  );
}

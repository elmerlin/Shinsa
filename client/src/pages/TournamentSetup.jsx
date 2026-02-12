import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTournament } from '../utils/api';

export default function TournamentSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    swiss_rounds: 3,
    koth_top_n: 8,
  });
  const [levels, setLevels] = useState([
    { round: 1, min: 18, max: 19 },
    { round: 2, min: 20, max: 21 },
    { round: 3, min: 22, max: 23 },
  ]);
  const [saving, setSaving] = useState(false);

  const updateLevel = (idx, field, val) => {
    const updated = [...levels];
    updated[idx] = { ...updated[idx], [field]: parseInt(val) || 0 };
    setLevels(updated);
  };

  const handleRoundsChange = (val) => {
    const n = parseInt(val) || 1;
    setForm(f => ({ ...f, swiss_rounds: n }));
    const newLevels = [];
    for (let i = 0; i < n; i++) {
      newLevels.push(levels[i] || { round: i + 1, min: 18 + i * 2, max: 19 + i * 2 });
    }
    setLevels(newLevels);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const tournament = await createTournament({
        ...form,
        config: {
          swiss_levels: levels,
          koth_start_level: 20,
          koth_level_increment: 1,
          koth_max_level: 27,
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
          finals_best_of: 5,
          modes: ['Single', 'Double'],
        },
      });
      navigate(`/tournament/${tournament.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="section-title mb-6">CREATE TOURNAMENT</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">General Info</h2>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Tournament Name *</label>
            <input
              type="text"
              className="input-field"
              placeholder='e.g. "The Big One 2024"'
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Location</label>
              <input
                type="text"
                className="input-field"
                placeholder='e.g. "Pump Dojo"'
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

        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Tournament Format</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Swiss Rounds</label>
              <input
                type="number"
                className="input-field"
                min="1"
                max="10"
                value={form.swiss_rounds}
                onChange={e => handleRoundsChange(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">KotH Top N Players</label>
              <input
                type="number"
                className="input-field"
                min="2"
                max="32"
                value={form.koth_top_n}
                onChange={e => setForm(f => ({ ...f, koth_top_n: parseInt(e.target.value) || 8 }))}
              />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Difficulty Levels per Round</h2>

          {levels.map((lvl, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <span className="text-sm text-gray-400 w-20">Round {idx + 1}</span>
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs text-gray-500">Min</label>
                <input
                  type="number"
                  className="input-field w-20"
                  min="1"
                  max="28"
                  value={lvl.min}
                  onChange={e => updateLevel(idx, 'min', e.target.value)}
                />
                <span className="text-gray-600">-</span>
                <label className="text-xs text-gray-500">Max</label>
                <input
                  type="number"
                  className="input-field w-20"
                  min="1"
                  max="28"
                  value={lvl.max}
                  onChange={e => updateLevel(idx, 'max', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
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

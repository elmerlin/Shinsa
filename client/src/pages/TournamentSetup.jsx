import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTournament } from '../utils/api';

export default function TournamentSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    total_rounds: 3,
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
    setForm(f => ({ ...f, total_rounds: n }));
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
          round_levels: levels,
          cards_per_draw: 5,
          vetoes_per_player: 1,
          best_of: 3,
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
              placeholder='e.g. "Shinsa Season 1"'
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
                placeholder='e.g. "Round 1 Arcade"'
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
          <h2 className="font-display font-bold text-lg text-piu-accent">Round Robin Format</h2>
          <p className="text-sm text-gray-500">Each round is a full round robin - every player plays every other player. Best of 3 songs per match.</p>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Number of Rounds</label>
            <input
              type="number"
              className="input-field w-32"
              min="1"
              max="10"
              value={form.total_rounds}
              onChange={e => handleRoundsChange(e.target.value)}
            />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Difficulty Levels per Round</h2>
          <p className="text-sm text-gray-500">Song draws will pull charts from this level range. Must have Single and Double charts available.</p>

          {levels.map((lvl, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <span className="text-sm text-gray-400 w-20 font-display font-bold">Round {idx + 1}</span>
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

        <div className="card p-3 bg-piu-dark/50 border-piu-accent/20">
          <h3 className="font-display font-bold text-sm text-piu-accent mb-2">Match Rules</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>5 cards drawn per match (min 2 Single + 2 Double)</li>
            <li>1 veto per player (higher seed bans first)</li>
            <li>Best of 3 songs (match ends early if 2-0)</li>
            <li>Score per song: 0 - 1,000,000</li>
            <li>Single charts = Red, Double charts = Green</li>
          </ul>
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

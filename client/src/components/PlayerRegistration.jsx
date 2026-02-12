import React, { useState } from 'react';
import { createPlayer, deletePlayer, updatePlayer } from '../utils/api';

const SKILL_TITLES = [
  '', 'Beginner', 'Intermediate', 'Advanced', 'Expert',
  'Specialist', 'Master', 'Grand Master', 'Legend',
];

export default function PlayerRegistration({ tournamentId, players, isSetup, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', bio: '', avatar_url: '', skill_title: '', pumbility: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createPlayer({
        tournament_id: tournamentId,
        ...form,
        pumbility: parseInt(form.pumbility) || 0,
      });
      setForm({ name: '', bio: '', avatar_url: '', skill_title: '', pumbility: '' });
      setShowForm(false);
      onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (playerId) => {
    if (!confirm('Remove this player?')) return;
    await deletePlayer(playerId);
    onUpdate();
  };

  const getInitials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const avatarColors = [
    'from-piu-accent to-purple-700',
    'from-blue-500 to-cyan-500',
    'from-green-500 to-emerald-500',
    'from-orange-500 to-red-500',
    'from-pink-500 to-rose-500',
    'from-yellow-500 to-amber-500',
    'from-indigo-500 to-violet-500',
    'from-teal-500 to-green-500',
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">Players ({players.length})</h2>
        {isSetup && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            {showForm ? 'Cancel' : '+ Add Player'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-4 animate-slide-up">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Player Name *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Player name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Pumbility</label>
              <input
                type="number"
                className="input-field"
                placeholder="e.g. 2500"
                value={form.pumbility}
                onChange={e => setForm(f => ({ ...f, pumbility: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill Title</label>
              <select
                className="input-field"
                value={form.skill_title}
                onChange={e => setForm(f => ({ ...f, skill_title: e.target.value }))}
              >
                {SKILL_TITLES.map(t => (
                  <option key={t} value={t}>{t || 'Select...'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Avatar URL</label>
              <input
                type="text"
                className="input-field"
                placeholder="https://..."
                value={form.avatar_url}
                onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Bio</label>
            <textarea
              className="input-field"
              rows="2"
              placeholder="Short bio..."
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? 'Adding...' : 'Add Player'}
          </button>
        </form>
      )}

      <div className="grid gap-3">
        {players.map((player, idx) => (
          <div key={player.id} className="card flex items-center gap-4 group">
            <div className="text-gray-600 font-mono text-sm w-6 text-right">
              #{player.seed_rank || idx + 1}
            </div>

            {player.avatar_url ? (
              <img
                src={player.avatar_url}
                alt={player.name}
                className="w-10 h-10 rounded-full object-cover border border-piu-border"
              />
            ) : (
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColors[idx % avatarColors.length]} flex items-center justify-center font-display font-bold text-sm`}>
                {getInitials(player.name)}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold">{player.name}</span>
                {player.skill_title && (
                  <span className="badge bg-piu-blue/20 text-piu-blue">{player.skill_title}</span>
                )}
              </div>
              {player.bio && <p className="text-sm text-gray-500 truncate">{player.bio}</p>}
            </div>

            <div className="text-right">
              {player.pumbility > 0 && (
                <div className="text-sm text-piu-gold font-mono">{player.pumbility}</div>
              )}
              <div className="text-xs text-gray-500">
                {player.wins}W - {player.losses}L
              </div>
            </div>

            {isSetup && (
              <button
                onClick={() => handleDelete(player.id)}
                className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                &#10005;
              </button>
            )}
          </div>
        ))}
      </div>

      {players.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No players registered yet</p>
          {isSetup && <p className="text-sm mt-1">Click "+ Add Player" to register participants</p>}
        </div>
      )}
    </div>
  );
}

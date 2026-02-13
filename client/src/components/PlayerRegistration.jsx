import React, { useState, useRef } from 'react';
import { createPlayer, updatePlayer, deletePlayer } from '../utils/api';

const SKILL_TITLES = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const SKILL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const GENDER_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];
const GENDER_SYMBOLS = { male: '\u2642', female: '\u2640' };

const skillColors = {
  Beginner: 'bg-green-500/20 text-green-400 border-green-500/30',
  Intermediate: 'bg-piu-bronze/20 text-piu-bronze border-piu-bronze/30',
  Advanced: 'bg-piu-silver/20 text-piu-silver border-piu-silver/30',
  Expert: 'bg-piu-gold/20 text-piu-gold border-piu-gold/30',
};

const getSkillColor = (title) => {
  if (!title) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  for (const [key, val] of Object.entries(skillColors)) {
    if (title.startsWith(key)) return val;
  }
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
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

export default function PlayerRegistration({ tournamentId, players, isSetup, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [form, setForm] = useState({
    name: '', skill_title: 'Beginner', skill_level: 1, pumbility: '', description: '', avatar: '', gender: '',
  });
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setForm({ name: '', skill_title: 'Beginner', skill_level: 1, pumbility: '', description: '', avatar: '', gender: '' });
    setEditingPlayer(null);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Avatar must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm(f => ({ ...f, avatar: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        skill_title: `${form.skill_title} lvl. ${form.skill_level}`,
        skill_level: parseInt(form.skill_level) || 1,
        description: form.description,
        avatar: form.avatar,
        gender: form.gender,
      };

      if (editingPlayer) {
        await updatePlayer(editingPlayer.id, payload);
      } else {
        await createPlayer({
          tournament_id: tournamentId,
          pumbility: parseInt(form.pumbility) || 0,
          ...payload,
        });
      }
      resetForm();
      setShowForm(false);
      onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (player) => {
    const titleParts = (player.skill_title || '').match(/^(Beginner|Intermediate|Advanced|Expert)\s*lvl\.\s*(\d+)/);
    setForm({
      name: player.name,
      skill_title: titleParts ? titleParts[1] : 'Beginner',
      skill_level: titleParts ? parseInt(titleParts[2]) : (player.skill_level || 1),
      pumbility: player.pumbility || '',
      description: player.description || '',
      avatar: player.avatar || '',
      gender: player.gender || '',
    });
    setEditingPlayer(player);
    setShowForm(true);
  };

  const handleDelete = async (playerId) => {
    if (!confirm('Remove this player?')) return;
    await deletePlayer(playerId);
    onUpdate();
  };

  const handleCancel = () => {
    resetForm();
    setShowForm(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">Players ({players.length})</h2>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary">
            {isSetup ? '+ Add Player' : 'Edit Players'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-piu-accent">
            {editingPlayer ? `Edit: ${editingPlayer.name}` : 'Add New Player'}
          </h3>

          {/* Avatar upload */}
          <div className="flex items-center gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-full cursor-pointer overflow-hidden border-2 border-dashed border-piu-border hover:border-piu-accent transition-colors flex items-center justify-center bg-piu-dark shrink-0"
            >
              {form.avatar ? (
                <img src={form.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-gray-500 text-center leading-tight">Upload<br/>Photo</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div className="flex-1">
              <p className="text-sm text-gray-400">Player Avatar</p>
              <p className="text-xs text-gray-600">Tap to upload (max 2MB)</p>
              {form.avatar && (
                <button type="button" onClick={() => setForm(f => ({ ...f, avatar: '' }))} className="text-xs text-red-400 hover:text-red-300 mt-1">
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            {!editingPlayer ? (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Pumbility (Seeding)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="e.g. 2500"
                  value={form.pumbility}
                  onChange={e => setForm(f => ({ ...f, pumbility: e.target.value }))}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Pumbility (locked)</label>
                <input
                  type="number"
                  className="input-field opacity-50"
                  value={editingPlayer.pumbility || 0}
                  disabled
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill Title</label>
              <select
                className="input-field"
                value={form.skill_title}
                onChange={e => setForm(f => ({ ...f, skill_title: e.target.value }))}
              >
                {SKILL_TITLES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill Level</label>
              <select
                className="input-field"
                value={form.skill_level}
                onChange={e => setForm(f => ({ ...f, skill_level: parseInt(e.target.value) }))}
              >
                {SKILL_LEVELS.map(l => (
                  <option key={l} value={l}>Level {l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gender</label>
              <select
                className="input-field"
                value={form.gender}
                onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
              >
                {GENDER_OPTIONS.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              className="input-field resize-none"
              rows="2"
              placeholder="Short bio or notes about the player..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Skill preview */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Preview:</span>
            <span className={`badge border ${getSkillColor(form.skill_title)}`}>
              {form.skill_title} lvl. {form.skill_level}
            </span>
            {form.gender && (
              <span className={`text-sm ${form.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                {GENDER_SYMBOLS[form.gender]}
              </span>
            )}
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving...' : editingPlayer ? 'Save Changes' : 'Add Player'}
            </button>
            <button type="button" onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-3">
        {players.map((player, idx) => {
          const genderSymbol = player.gender ? GENDER_SYMBOLS[player.gender] || '' : '';

          return (
            <div key={player.id} className="card flex items-center gap-3 sm:gap-4 group">
              <div className="text-gray-600 font-mono text-sm w-6 text-right shrink-0">
                #{idx + 1}
              </div>

              {player.avatar ? (
                <img src={player.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColors[idx % avatarColors.length]} flex items-center justify-center font-display font-bold text-sm shrink-0`}>
                  {getInitials(player.name)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-bold">{player.name}</span>
                  {genderSymbol && (
                    <span className={`text-sm ${player.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                      {genderSymbol}
                    </span>
                  )}
                  {player.skill_title && (
                    <span className={`badge border ${getSkillColor(player.skill_title)}`}>
                      {player.skill_title}
                    </span>
                  )}
                </div>
                {player.description && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{player.description}</p>
                )}
              </div>

              <div className="text-right shrink-0">
                {player.pumbility > 0 && (
                  <div className="text-sm text-piu-gold font-mono font-bold">{player.pumbility.toLocaleString()}</div>
                )}
                <div className="text-xs text-gray-500">
                  {player.wins}W - {player.losses}L
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleEdit(player)}
                  className="text-gray-600 hover:text-piu-accent transition-colors sm:opacity-0 sm:group-hover:opacity-100 p-1"
                  title="Edit player"
                >
                  &#9998;
                </button>
                {isSetup && (
                  <button
                    onClick={() => handleDelete(player.id)}
                    className="text-gray-600 hover:text-red-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100 p-1"
                    title="Delete player"
                  >
                    &#10005;
                  </button>
                )}
              </div>
            </div>
          );
        })}
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

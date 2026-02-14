import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDuel } from '../utils/api';
import AvatarPicker, { getAvatarUrl } from '../components/AvatarPicker';

const MODE_OPTIONS = [
  { value: 'both', label: 'Both', desc: 'Singles & Doubles' },
  { value: 'singles', label: 'Singles', desc: 'Singles only' },
  { value: 'doubles', label: 'Doubles', desc: 'Doubles only' },
];

export default function DuelSetup() {
  const navigate = useNavigate();
  const now = new Date();
  const [form, setForm] = useState({
    name: '',
    location: '',
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().slice(0, 5),
    mode: 'both',
    player1_name: '',
    player2_name: '',
    player1_avatar: '',
    player2_avatar: '',
  });
  const [activeAvatar, setActiveAvatar] = useState(null); // 'player1' or 'player2'
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.player1_name.trim() || !form.player2_name.trim()) return;
    setSaving(true);
    try {
      const duel = await createDuel(form);
      navigate(`/duel/${duel.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="section-title mb-6">OFFLINE DUEL</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Duel Info */}
        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Duel Info</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Duel Name *</label>
            <input
              type="text"
              className="input-field"
              placeholder='e.g. "Friday Night Showdown"'
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div>
              <label className="block text-sm text-gray-400 mb-1">Time</label>
              <input
                type="time"
                className="input-field"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Mode</h2>
          <div className="grid grid-cols-3 gap-3">
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, mode: opt.value }))}
                className={`p-3 rounded-lg border-2 transition-all text-center ${
                  form.mode === opt.value
                    ? 'border-piu-accent bg-piu-accent/10'
                    : 'border-piu-border hover:border-piu-accent/50'
                }`}
              >
                <div className="font-display font-bold text-sm">{opt.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Players */}
        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Players</h2>

          {/* Duel Avatar Preview */}
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="text-center">
              <div
                onClick={() => setActiveAvatar(activeAvatar === 'player1' ? null : 'player1')}
                className={`w-16 h-16 rounded-full overflow-hidden border-2 cursor-pointer transition-all mx-auto ${
                  activeAvatar === 'player1' ? 'border-piu-accent scale-110' : 'border-piu-border hover:border-piu-accent/50'
                }`}
              >
                {form.player1_avatar ? (
                  <img src={getAvatarUrl(form.player1_avatar)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-lg">
                    {form.player1_name ? form.player1_name[0].toUpperCase() : 'P1'}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 font-display">{form.player1_name || 'Player 1'}</p>
            </div>

            {/* Crossed Swords */}
            <div className="text-2xl text-piu-accent font-bold select-none" title="VS">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 8L32 32M8 8L12 4M8 8L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M32 8L8 32M32 8L28 4M32 8L36 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="20" cy="20" r="3" fill="currentColor" opacity="0.5"/>
              </svg>
            </div>

            <div className="text-center">
              <div
                onClick={() => setActiveAvatar(activeAvatar === 'player2' ? null : 'player2')}
                className={`w-16 h-16 rounded-full overflow-hidden border-2 cursor-pointer transition-all mx-auto ${
                  activeAvatar === 'player2' ? 'border-piu-accent scale-110' : 'border-piu-border hover:border-piu-accent/50'
                }`}
              >
                {form.player2_avatar ? (
                  <img src={getAvatarUrl(form.player2_avatar)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-lg">
                    {form.player2_name ? form.player2_name[0].toUpperCase() : 'P2'}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 font-display">{form.player2_name || 'Player 2'}</p>
            </div>
          </div>

          {/* Player names */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Player 1 Name *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Player 1"
                value={form.player1_name}
                onChange={e => setForm(f => ({ ...f, player1_name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Player 2 Name *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Player 2"
                value={form.player2_name}
                onChange={e => setForm(f => ({ ...f, player2_name: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Avatar picker for selected player */}
          {activeAvatar && (
            <div className="pt-2 border-t border-piu-border/50">
              <p className="text-sm text-gray-400 mb-2 font-display">
                Choose avatar for {activeAvatar === 'player1' ? form.player1_name || 'Player 1' : form.player2_name || 'Player 2'}
              </p>
              <AvatarPicker
                value={activeAvatar === 'player1' ? form.player1_avatar : form.player2_avatar}
                onChange={(avatar) => setForm(f => ({
                  ...f,
                  [activeAvatar === 'player1' ? 'player1_avatar' : 'player2_avatar']: avatar,
                }))}
                shape="circle"
                size="sm"
              />
            </div>
          )}
        </div>

        {/* Rules Summary */}
        <div className="card p-3 bg-piu-dark/50 border-piu-accent/20">
          <h3 className="font-display font-bold text-sm text-piu-accent mb-2">Duel Rules</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>Draw one card at a time at your chosen level</li>
            <li>Both players play the song and enter their scores</li>
            <li>Highest score (out of 1,000,000) wins the round</li>
            <li>End the duel at any time - most wins takes the match</li>
            {form.mode === 'singles' && <li className="text-red-400">Singles charts only</li>}
            {form.mode === 'doubles' && <li className="text-green-400">Doubles charts only</li>}
            {form.mode === 'both' && <li className="text-piu-accent">Both Singles and Doubles charts</li>}
          </ul>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Creating...' : 'Start Duel'}
          </button>
          <button type="button" onClick={() => navigate('/')} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

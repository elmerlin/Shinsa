import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDuel, searchUsers, sendInvitation } from '../utils/api';
import AvatarPicker, { getAvatarUrl } from '../components/AvatarPicker';
import {
  SKILL_TITLES, SKILL_LEVELS, GENDER_OPTIONS, GENDER_SYMBOLS,
  COUNTRIES, getCountryFlag, getSkillColor,
} from '../components/PlayerRegistration';

const MODE_OPTIONS = [
  { value: 'both', label: 'Both', desc: 'Singles & Doubles' },
  { value: 'singles', label: 'Singles', desc: 'Singles only' },
  { value: 'doubles', label: 'Doubles', desc: 'Doubles only' },
];

const DEFAULT_PLAYER = {
  name: '', avatar: '', skill_title: 'Beginner', skill_level: 1, gender: '', nationality: '', description: '', user_id: '',
};

function UserSearchField({ player, setPlayer, label, color }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async (q) => {
    if (q.length < 1) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await searchUsers(q);
      setResults(res);
    } catch (e) { setResults([]); }
    finally { setSearching(false); }
  }, []);

  const selectUser = (u) => {
    const titleParts = (u.skill_title || '').match(/^(Beginner|Intermediate|Advanced|Expert)\s*lvl\.\s*(\d+)/);
    setPlayer({
      name: u.username,
      avatar: u.avatar || '',
      skill_title: titleParts ? titleParts[1] : 'Beginner',
      skill_level: titleParts ? parseInt(titleParts[2]) : 1,
      gender: u.gender || '',
      nationality: u.nationality || '',
      description: u.description || '',
      user_id: u.id,
    });
    setQuery('');
    setResults([]);
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs text-gray-500">Search registered player for {label}</label>
      <input
        type="text"
        className="input-field text-sm"
        placeholder="Type a username..."
        value={query}
        onChange={e => { setQuery(e.target.value); handleSearch(e.target.value); }}
      />
      {player.user_id && (
        <div className="flex items-center gap-2 text-xs text-piu-green bg-piu-green/10 px-3 py-1.5 rounded-lg">
          <span>Linked: <strong>{player.name}</strong></span>
          <button type="button" onClick={() => setPlayer({ ...DEFAULT_PLAYER })} className="text-gray-400 hover:text-red-400 ml-auto">&#10005;</button>
        </div>
      )}
      {results.length > 0 && (
        <div className="bg-piu-dark border border-piu-border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
          {results.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => selectUser(u)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-piu-card/50 transition-colors border-b border-piu-border/50 last:border-0 text-left"
            >
              {u.avatar ? (
                <img src={getAvatarUrl(u.avatar)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[10px] shrink-0">
                  {u.username[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm font-display font-bold truncate">{u.username}</span>
              {u.nationality && <span className="text-xs">{getCountryFlag(u.nationality)}</span>}
              {u.skill_title && <span className={`badge border text-[10px] ${getSkillColor(u.skill_title)}`}>{u.skill_title}</span>}
            </button>
          ))}
        </div>
      )}
      {searching && <p className="text-[10px] text-gray-500">Searching...</p>}
    </div>
  );
}

function PlayerFields({ player, setPlayer, label, prefix, color, isExpanded, onToggle }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className={`font-display font-bold text-sm ${color}`}>{label}</h3>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-gray-500 hover:text-piu-accent transition-colors font-display"
        >
          {isExpanded ? 'Collapse' : 'More details'}
        </button>
      </div>

      {/* User search */}
      <UserSearchField player={player} setPlayer={setPlayer} label={label} color={color} />

      <div>
        <label className="block text-sm text-gray-400 mb-1">Name *</label>
        <input
          type="text"
          className="input-field"
          placeholder={label}
          value={player.name}
          onChange={e => setPlayer(p => ({ ...p, name: e.target.value }))}
          required
        />
      </div>

      {isExpanded && (
        <div className="space-y-3 animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill Title</label>
              <select
                className="input-field"
                value={player.skill_title}
                onChange={e => setPlayer(p => ({ ...p, skill_title: e.target.value }))}
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
                value={player.skill_level}
                onChange={e => setPlayer(p => ({ ...p, skill_level: parseInt(e.target.value) }))}
              >
                {SKILL_LEVELS.map(l => (
                  <option key={l} value={l}>Level {l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gender</label>
              <select
                className="input-field"
                value={player.gender}
                onChange={e => setPlayer(p => ({ ...p, gender: e.target.value }))}
              >
                {GENDER_OPTIONS.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nationality</label>
              <select
                className="input-field"
                value={player.nationality}
                onChange={e => setPlayer(p => ({ ...p, nationality: e.target.value }))}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ''}{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              className="input-field resize-none"
              rows="2"
              placeholder="Short bio or notes..."
              value={player.description}
              onChange={e => setPlayer(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          {/* Preview */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Preview:</span>
            {player.nationality && <span className="text-base">{getCountryFlag(player.nationality)}</span>}
            <span className={`badge border ${getSkillColor(player.skill_title)}`}>
              {player.skill_title} lvl. {player.skill_level}
            </span>
            {player.gender && (
              <span className={`text-sm ${player.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                {GENDER_SYMBOLS[player.gender]}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DuelSetup() {
  const navigate = useNavigate();
  const now = new Date();
  const [form, setForm] = useState({
    name: '',
    location: '',
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().slice(0, 5),
    mode: 'both',
  });
  const [p1, setP1] = useState({ ...DEFAULT_PLAYER });
  const [p2, setP2] = useState({ ...DEFAULT_PLAYER });
  const [activeAvatar, setActiveAvatar] = useState(null);
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !p1.name.trim() || !p2.name.trim()) return;
    setSaving(true);
    try {
      const duel = await createDuel({
        ...form,
        player1_name: p1.name,
        player2_name: p2.name,
        player1_avatar: p1.avatar,
        player2_avatar: p2.avatar,
        player1_skill_title: `${p1.skill_title} lvl. ${p1.skill_level}`,
        player1_skill_level: p1.skill_level,
        player1_gender: p1.gender,
        player1_nationality: p1.nationality,
        player1_description: p1.description,
        player2_skill_title: `${p2.skill_title} lvl. ${p2.skill_level}`,
        player2_skill_level: p2.skill_level,
        player2_gender: p2.gender,
        player2_nationality: p2.nationality,
        player2_description: p2.description,
        player1_user_id: p1.user_id || '',
        player2_user_id: p2.user_id || '',
      });
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
                {p1.avatar ? (
                  <img src={getAvatarUrl(p1.avatar)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-lg">
                    {p1.name ? p1.name[0].toUpperCase() : 'P1'}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 font-display">{p1.name || 'Player 1'}</p>
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
                {p2.avatar ? (
                  <img src={getAvatarUrl(p2.avatar)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-lg">
                    {p2.name ? p2.name[0].toUpperCase() : 'P2'}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 font-display">{p2.name || 'Player 2'}</p>
            </div>
          </div>

          {/* Avatar picker for selected player */}
          {activeAvatar && (
            <div className="pt-2 border-t border-piu-border/50">
              <p className="text-sm text-gray-400 mb-2 font-display">
                Choose avatar for {activeAvatar === 'player1' ? p1.name || 'Player 1' : p2.name || 'Player 2'}
              </p>
              <AvatarPicker
                value={activeAvatar === 'player1' ? p1.avatar : p2.avatar}
                onChange={(avatar) => {
                  if (activeAvatar === 'player1') setP1(p => ({ ...p, avatar }));
                  else setP2(p => ({ ...p, avatar }));
                }}
                shape="circle"
                size="sm"
              />
            </div>
          )}

          {/* Player 1 fields */}
          <div className="pt-3 border-t border-piu-border/50">
            <PlayerFields player={p1} setPlayer={setP1} label="Player 1" prefix="player1" color="text-red-400" isExpanded={expandedPlayer === 'player1'} onToggle={() => setExpandedPlayer(expandedPlayer === 'player1' ? null : 'player1')} />
          </div>

          {/* Player 2 fields */}
          <div className="pt-3 border-t border-piu-border/50">
            <PlayerFields player={p2} setPlayer={setP2} label="Player 2" prefix="player2" color="text-blue-400" isExpanded={expandedPlayer === 'player2'} onToggle={() => setExpandedPlayer(expandedPlayer === 'player2' ? null : 'player2')} />
          </div>
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

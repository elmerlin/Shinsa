import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOnlineDuel, searchUsers } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag, getSkillColor } from '../components/PlayerRegistration';

const MODE_OPTIONS = [
  { value: 'both', label: 'Both', desc: 'Singles & Doubles' },
  { value: 'singles', label: 'Singles', desc: 'Singles only' },
  { value: 'doubles', label: 'Doubles', desc: 'Doubles only' },
];

export default function OnlineDuelSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const now = new Date();
  const [form, setForm] = useState({
    name: '', location: '',
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().slice(0, 5),
    mode: 'both',
  });
  const [opponent, setOpponent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSearch = useCallback(async (q) => {
    if (q.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(q);
      setSearchResults(results.filter(u => u.id !== user?.id));
    } catch (e) { setSearchResults([]); }
    finally { setSearching(false); }
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">ONLINE DUEL</h1>
        <p className="text-gray-400 mb-4">You need to be logged in to create an Online Duel.</p>
        <button onClick={() => navigate('/login')} className="btn-primary">Login</button>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!opponent) return;
    setSaving(true);
    try {
      const duel = await createOnlineDuel({
        ...form,
        opponent_user_id: opponent.id,
      });
      navigate(`/online-duel/${duel.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="section-title mb-6">ONLINE DUEL</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Duel Info</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Duel Name *</label>
            <input type="text" className="input-field" placeholder='e.g. "Cross-Country Showdown"' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Location(s)</label>
              <input type="text" className="input-field" placeholder="NYC vs LA" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date</label>
              <input type="date" className="input-field" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Time</label>
              <input type="time" className="input-field" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Mode</h2>
          <div className="grid grid-cols-3 gap-3">
            {MODE_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, mode: opt.value }))}
                className={`p-3 rounded-lg border-2 transition-all text-center ${form.mode === opt.value ? 'border-piu-accent bg-piu-accent/10' : 'border-piu-border hover:border-piu-accent/50'}`}>
                <div className="font-display font-bold text-sm">{opt.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-display font-bold text-lg text-piu-accent">Players</h2>

          {/* VS Preview */}
          <div className="flex items-center justify-center gap-6 py-4">
            <div className="text-center">
              {user.avatar ? (
                <img src={getAvatarUrl(user.avatar)} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-red-500/50 mx-auto" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-lg mx-auto">{user.username[0].toUpperCase()}</div>
              )}
              <p className="text-xs text-gray-400 mt-1 font-display">{user.username} (You)</p>
            </div>
            <div className="text-piu-accent">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M8 8L32 32M8 8L12 4M8 8L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M32 8L8 32M32 8L28 4M32 8L36 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="20" cy="20" r="3" fill="currentColor" opacity="0.5"/></svg>
            </div>
            <div className="text-center">
              {opponent ? (
                <>
                  {opponent.avatar ? (
                    <img src={getAvatarUrl(opponent.avatar)} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-blue-500/50 mx-auto" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-lg mx-auto">{opponent.username[0].toUpperCase()}</div>
                  )}
                  <p className="text-xs text-gray-400 mt-1 font-display">{opponent.username}</p>
                </>
              ) : (
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-piu-border flex items-center justify-center mx-auto">
                  <span className="text-gray-600 text-2xl">?</span>
                </div>
              )}
            </div>
          </div>

          {/* Search opponent */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-400">Search opponent (registered users only) *</label>
            <input type="text" className="input-field" placeholder="Type a username..." value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); handleSearch(e.target.value); }} />
            {opponent && (
              <div className="flex items-center gap-2 text-xs text-piu-green bg-piu-green/10 px-3 py-2 rounded-lg">
                {opponent.avatar && <img src={getAvatarUrl(opponent.avatar)} alt="" className="w-6 h-6 rounded-full object-cover" />}
                <span>Opponent: <strong>{opponent.username}</strong></span>
                <button type="button" onClick={() => setOpponent(null)} className="text-gray-400 hover:text-red-400 ml-auto">&#10005;</button>
              </div>
            )}
            {searchResults.length > 0 && !opponent && (
              <div className="bg-piu-dark border border-piu-border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                {searchResults.map(u => (
                  <button key={u.id} type="button" onClick={() => { setOpponent(u); setSearchQuery(''); setSearchResults([]); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-piu-card/50 transition-colors border-b border-piu-border/50 last:border-0 text-left">
                    {u.avatar ? <img src={getAvatarUrl(u.avatar)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" /> :
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[10px] shrink-0">{u.username[0].toUpperCase()}</div>}
                    <span className="text-sm font-display font-bold truncate">{u.username}</span>
                    {u.nationality && <span className="text-xs">{getCountryFlag(u.nationality)}</span>}
                    {u.skill_title && <span className={`badge border text-[10px] ${getSkillColor(u.skill_title)}`}>{u.skill_title}</span>}
                  </button>
                ))}
              </div>
            )}
            {searching && <p className="text-[10px] text-gray-500">Searching...</p>}
          </div>
        </div>

        <div className="card p-3 bg-piu-dark/50 border-piu-accent/20">
          <h3 className="font-display font-bold text-sm text-piu-accent mb-2">Online Duel Rules</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>Both players must have registered accounts</li>
            <li>An invitation is sent to the opponent - they join when they accept</li>
            <li>Players take turns choosing mode + level, a song is drawn</li>
            <li>Both players accept, then play the song on their own machine</li>
            <li>Upload a photo of your result screen to submit your score</li>
            <li>The duel ends when both players agree to end it</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={saving || !opponent}>
            {saving ? 'Creating...' : 'Create Online Duel'}
          </button>
          <button type="button" onClick={() => navigate('/')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}

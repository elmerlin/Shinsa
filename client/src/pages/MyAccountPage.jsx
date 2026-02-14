import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateMe, changePassword, getInvitations, respondInvitation } from '../utils/api';
import AvatarPicker, { getAvatarUrl } from '../components/AvatarPicker';
import {
  SKILL_TITLES, SKILL_LEVELS, GENDER_OPTIONS, GENDER_SYMBOLS,
  COUNTRIES, getCountryFlag, getSkillColor,
} from '../components/PlayerRegistration';

export default function MyAccountPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('profile');
  const [invitations, setInvitations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Profile form
  const [form, setForm] = useState({
    email: '', avatar: '', pumbility: '', skill_title: 'Beginner', skill_level: 1,
    gender: '', nationality: '', date_of_birth: '', show_age: false, description: '',
  });

  // Password form
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const titleParts = (user.skill_title || '').match(/^(Beginner|Intermediate|Advanced|Expert)\s*lvl\.\s*(\d+)/);
    setForm({
      email: user.email || '',
      avatar: user.avatar || '',
      pumbility: user.pumbility || '',
      skill_title: titleParts ? titleParts[1] : 'Beginner',
      skill_level: titleParts ? parseInt(titleParts[2]) : (user.skill_level || 1),
      gender: user.gender || '',
      nationality: user.nationality || '',
      date_of_birth: user.date_of_birth || '',
      show_age: !!user.show_age,
      description: user.description || '',
    });
    getInvitations().then(setInvitations).catch(() => {});
  }, [user]);

  if (!user) return null;

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await updateMe({
        email: form.email,
        avatar: form.avatar,
        pumbility: parseInt(form.pumbility) || 0,
        skill_title: `${form.skill_title} lvl. ${form.skill_level}`,
        skill_level: parseInt(form.skill_level) || 1,
        gender: form.gender,
        nationality: form.nationality,
        date_of_birth: form.date_of_birth,
        show_age: form.show_age,
        description: form.description,
      });
      await refreshUser();
      setMessage('Profile updated!');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passForm.new_password !== passForm.confirm) {
      setMessage('Passwords do not match');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await changePassword({
        current_password: passForm.current_password,
        new_password: passForm.new_password,
      });
      setPassForm({ current_password: '', new_password: '', confirm: '' });
      setMessage('Password changed!');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInvitation = async (id, status) => {
    try {
      await respondInvitation(id, status);
      setInvitations(inv => inv.filter(i => i.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold tracking-wider">MY ACCOUNT</h1>
        <Link to={`/profile/${user.id}`} className="text-sm text-piu-accent hover:underline font-display">
          View public profile
        </Link>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-display font-bold text-piu-accent mb-2">
            PENDING INVITATIONS ({invitations.length})
          </h2>
          <div className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.id} className="card flex items-center justify-between gap-3">
                <div>
                  <p className="font-display font-bold text-sm">
                    {inv.type === 'tournament' ? inv.tournament_name : inv.duel_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {inv.type === 'tournament' ? 'Tournament' : 'Duel'} invitation
                    {inv.tournament_date || inv.duel_date ? ` - ${inv.tournament_date || inv.duel_date}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleInvitation(inv.id, 'accepted')}
                    className="px-3 py-1 bg-piu-green/20 text-piu-green text-xs font-display font-bold rounded-lg hover:bg-piu-green/30 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleInvitation(inv.id, 'declined')}
                    className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-display font-bold rounded-lg hover:bg-red-500/30 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {['profile', 'password'].map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setMessage(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-display font-bold transition-colors ${
              tab === t ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {t === 'profile' ? 'Edit Profile' : 'Change Password'}
          </button>
        ))}
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          message.includes('!') ? 'bg-piu-green/10 text-piu-green border border-piu-green/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>
          {message}
        </div>
      )}

      {tab === 'profile' ? (
        <form onSubmit={handleSaveProfile} className="card space-y-4">
          <AvatarPicker
            value={form.avatar}
            onChange={(avatar) => setForm(f => ({ ...f, avatar }))}
            shape="circle"
            size="md"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Pump Alias</label>
              <input type="text" className="input-field opacity-50" value={user.username} disabled />
              <p className="text-[10px] text-gray-600 mt-1">Username cannot be changed</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email (for password recovery)</label>
              <input
                type="email"
                className="input-field"
                placeholder="your@email.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill Title</label>
              <select className="input-field" value={form.skill_title} onChange={e => setForm(f => ({ ...f, skill_title: e.target.value }))}>
                {SKILL_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill Level</label>
              <select className="input-field" value={form.skill_level} onChange={e => setForm(f => ({ ...f, skill_level: parseInt(e.target.value) }))}>
                {SKILL_LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gender</label>
              <select className="input-field" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nationality</label>
              <select className="input-field" value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ''}{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date of Birth</label>
              <input
                type="date"
                className="input-field"
                value={form.date_of_birth}
                onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_age}
                  onChange={e => setForm(f => ({ ...f, show_age: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-400">Show age on profile</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              className="input-field resize-none"
              rows="3"
              placeholder="Short bio..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Preview:</span>
            {form.nationality && <span className="text-base">{getCountryFlag(form.nationality)}</span>}
            <span className={`badge border ${getSkillColor(form.skill_title)}`}>
              {form.skill_title} lvl. {form.skill_level}
            </span>
            {form.gender && (
              <span className={`text-sm ${form.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                {GENDER_SYMBOLS[form.gender]}
              </span>
            )}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleChangePassword} className="card space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Current Password</label>
            <input
              type="password"
              className="input-field"
              value={passForm.current_password}
              onChange={e => setPassForm(f => ({ ...f, current_password: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">New Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="At least 4 characters"
              value={passForm.new_password}
              onChange={e => setPassForm(f => ({ ...f, new_password: e.target.value }))}
              required
              minLength={4}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Confirm New Password</label>
            <input
              type="password"
              className="input-field"
              value={passForm.confirm}
              onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      )}
    </div>
  );
}

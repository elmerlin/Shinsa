import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  updateMe, changePassword, getInvitations, respondInvitation,
  getPiugameCredentialStatus, savePiugameCredentials, deletePiugameCredentials,
  syncPumbility, syncBestScores, syncRecentlyPlayed, saveWorldMaxLocation,
} from '../utils/api';
import AvatarPicker, { getAvatarUrl } from '../components/AvatarPicker';
import {
  SKILL_TITLES, SKILL_LEVELS, GENDER_OPTIONS, GENDER_SYMBOLS,
  COUNTRIES, getCountryFlag, getSkillColor,
} from '../components/PlayerRegistration';
import { getProfilePath } from '../utils/profile';

function normalizeCountryString(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function resolveCountryCode(input) {
  const normalized = normalizeCountryString(input);
  if (!normalized) return '';
  for (const country of COUNTRIES) {
    if (!country.code) continue;
    if (normalizeCountryString(country.name) === normalized) return country.code;
    if (String(country.code).toLowerCase() === normalized) return country.code;
  }
  return '';
}

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
    location_country: '', location_city: '',
  });
  const [avatarDirty, setAvatarDirty] = useState(false);

  // Password form
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });

  // PIUGame link state
  const [piuLinked, setPiuLinked] = useState(false);
  const [piuForm, setPiuForm] = useState({ piugame_username: '', piugame_password: '' });
  const [piuSyncing, setPiuSyncing] = useState('');
  const [piuMessage, setPiuMessage] = useState('');

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
      location_country: user.location_country || '',
      location_city: user.location_city || '',
    });
    setAvatarDirty(false);
    getInvitations().then(setInvitations).catch(() => {});
    getPiugameCredentialStatus().then(r => setPiuLinked(r.linked)).catch(() => {});
  }, [user]);

  if (!user) return null;

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        email: form.email,
        pumbility: parseInt(form.pumbility) || 0,
        skill_title: `${form.skill_title} lvl. ${form.skill_level}`,
        skill_level: parseInt(form.skill_level) || 1,
        gender: form.gender,
        nationality: form.nationality,
        date_of_birth: form.date_of_birth,
        show_age: form.show_age,
        description: form.description,
      };
      if (avatarDirty) payload.avatar = form.avatar;
      await updateMe(payload);
      const nextCountry = String(form.location_country || '').trim();
      const nextCity = String(form.location_city || '').trim();
      const prevCountry = String(user.location_country || '').trim();
      const prevCity = String(user.location_city || '').trim();
      if (nextCountry !== prevCountry || nextCity !== prevCity) {
        await saveWorldMaxLocation({
          country: nextCountry,
          city: nextCity,
          country_code: resolveCountryCode(nextCountry),
        });
      }
      await refreshUser();
      setAvatarDirty(false);
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

  // PIUGame handlers
  const handleLinkPiugame = async (e) => {
    e.preventDefault();
    setPiuSyncing('linking');
    setPiuMessage('');
    try {
      await savePiugameCredentials(piuForm);
      setPiuLinked(true);
      setPiuForm({ piugame_username: '', piugame_password: '' });
      setPiuMessage('PIUGame account linked!');
    } catch (err) {
      setPiuMessage(err.message);
    } finally {
      setPiuSyncing('');
    }
  };

  const handleUnlinkPiugame = async () => {
    if (!confirm('Unlink your PIUGame account? All imported scores will be deleted.')) return;
    setPiuSyncing('unlinking');
    setPiuMessage('');
    try {
      await deletePiugameCredentials();
      setPiuLinked(false);
      setPiuMessage('PIUGame account unlinked!');
    } catch (err) {
      setPiuMessage(err.message);
    } finally {
      setPiuSyncing('');
    }
  };

  const handleSync = async (type) => {
    setPiuSyncing(type);
    setPiuMessage('');
    try {
      let result;
      if (type === 'pumbility') {
        result = await syncPumbility();
        await refreshUser();
        setPiuMessage(`Pumbility synced! Value: ${result.pumbility_value?.toLocaleString() || 0}, ${result.scores_count} top scores imported!`);
      } else if (type === 'best-scores') {
        result = await syncBestScores();
        setPiuMessage(`Best scores imported! ${result.scores_count} scores synced!`);
      } else if (type === 'recently-played') {
        result = await syncRecentlyPlayed();
        setPiuMessage(`Recently played synced! ${result.plays_count} plays, ${result.scores_updated} best scores updated!`);
      }
    } catch (err) {
      setPiuMessage(err.message);
    } finally {
      setPiuSyncing('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold tracking-wider">MY ACCOUNT</h1>
        <Link to={getProfilePath(user.id, user.username)} className="text-sm text-piu-accent hover:underline font-display">
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
                    {inv.type === 'tournament' ? inv.tournament_name : (inv.type === 'online_duel' ? inv.online_duel_name : inv.duel_name)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {inv.type === 'tournament' ? 'Tournament' : inv.type === 'online_duel' ? 'Online Duel' : 'Duel'} invitation
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
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: 'profile', label: 'Edit Profile' },
          { key: 'password', label: 'Change Password' },
          { key: 'piugame', label: 'PIUGame Link' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setMessage(''); setPiuMessage(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-display font-bold transition-colors ${
              tab === t.key ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
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
            onChange={(avatar) => {
              setForm(f => ({ ...f, avatar }));
              setAvatarDirty(true);
            }}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Location Country</label>
              <input
                type="text"
                className="input-field"
                placeholder="Japan"
                value={form.location_country}
                onChange={e => setForm(f => ({ ...f, location_country: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Location City / Town</label>
              <input
                type="text"
                className="input-field"
                placeholder="Tokyo"
                value={form.location_city}
                onChange={e => setForm(f => ({ ...f, location_city: e.target.value }))}
              />
            </div>
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
      ) : tab === 'password' ? (
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
      ) : (
        /* PIUGame Link Tab */
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${piuLinked ? 'bg-piu-green' : 'bg-gray-600'}`} />
              <h3 className="font-display font-bold text-sm">
                {piuLinked ? 'PIUGame Account Linked' : 'Link Your PIUGame Account'}
              </h3>
            </div>

            <p className="text-xs text-gray-400">
              Connect your piugame.com account to import your pumbility rating, best scores,
              and recently played songs. Your credentials are stored encrypted on the server.
            </p>

            {piuMessage && (
              <div className={`px-4 py-2 rounded-lg text-sm ${
                piuMessage.includes('!') ? 'bg-piu-green/10 text-piu-green border border-piu-green/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
              }`}>
                {piuMessage}
              </div>
            )}

            {!piuLinked ? (
              <form onSubmit={handleLinkPiugame} className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">PIUGame Username</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Your am-pass / piugame.com username"
                    value={piuForm.piugame_username}
                    onChange={e => setPiuForm(f => ({ ...f, piugame_username: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">PIUGame Password</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Your am-pass / piugame.com password"
                    value={piuForm.piugame_password}
                    onChange={e => setPiuForm(f => ({ ...f, piugame_password: e.target.value }))}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={!!piuSyncing}
                >
                  {piuSyncing === 'linking' ? 'Linking...' : 'Link Account'}
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                {/* Update credentials */}
                <details className="group">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
                    Update credentials
                  </summary>
                  <form onSubmit={handleLinkPiugame} className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">PIUGame Username</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Your am-pass / piugame.com username"
                        value={piuForm.piugame_username}
                        onChange={e => setPiuForm(f => ({ ...f, piugame_username: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">PIUGame Password</label>
                      <input
                        type="password"
                        className="input-field"
                        placeholder="Your am-pass / piugame.com password"
                        value={piuForm.piugame_password}
                        onChange={e => setPiuForm(f => ({ ...f, piugame_password: e.target.value }))}
                        required
                      />
                    </div>
                    <button type="submit" className="btn-primary w-full text-sm" disabled={!!piuSyncing}>
                      {piuSyncing === 'linking' ? 'Updating...' : 'Update Credentials'}
                    </button>
                  </form>
                </details>

                <button
                  onClick={handleUnlinkPiugame}
                  className="w-full px-4 py-2 bg-red-500/10 text-red-400 text-sm font-display font-bold rounded-lg border border-red-500/30 hover:bg-red-500/20 transition-colors"
                  disabled={!!piuSyncing}
                >
                  {piuSyncing === 'unlinking' ? 'Unlinking...' : 'Unlink PIUGame Account'}
                </button>
              </div>
            )}
          </div>

          {/* Sync Actions */}
          {piuLinked && (
            <div className="card space-y-3">
              <h3 className="font-display font-bold text-sm text-piu-accent">DATA SYNC</h3>
              <p className="text-xs text-gray-400">
                Import and update your data from piugame.com. Best scores can only be fully refreshed once per day.
              </p>

              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => handleSync('pumbility')}
                  disabled={!!piuSyncing}
                  className="flex items-center justify-between px-4 py-3 bg-piu-dark rounded-lg border border-piu-border/30 hover:border-piu-accent/50 transition-colors disabled:opacity-50"
                >
                  <div className="text-left">
                    <p className="text-sm font-display font-bold">Sync Pumbility</p>
                    <p className="text-[10px] text-gray-500">Updates your pumbility rating and top 50 scores</p>
                  </div>
                  {piuSyncing === 'pumbility' ? (
                    <span className="text-xs text-piu-accent animate-pulse">Syncing...</span>
                  ) : (
                    <span className="text-xs text-gray-500">&rarr;</span>
                  )}
                </button>

                <button
                  onClick={() => handleSync('best-scores')}
                  disabled={!!piuSyncing}
                  className="flex items-center justify-between px-4 py-3 bg-piu-dark rounded-lg border border-piu-border/30 hover:border-piu-accent/50 transition-colors disabled:opacity-50"
                >
                  <div className="text-left">
                    <p className="text-sm font-display font-bold">Import All Best Scores</p>
                    <p className="text-[10px] text-gray-500">Full import from piugame.com (once per day)</p>
                  </div>
                  {piuSyncing === 'best-scores' ? (
                    <span className="text-xs text-piu-accent animate-pulse">Importing...</span>
                  ) : (
                    <span className="text-xs text-gray-500">&rarr;</span>
                  )}
                </button>

                <button
                  onClick={() => handleSync('recently-played')}
                  disabled={!!piuSyncing}
                  className="flex items-center justify-between px-4 py-3 bg-piu-dark rounded-lg border border-piu-border/30 hover:border-piu-accent/50 transition-colors disabled:opacity-50"
                >
                  <div className="text-left">
                    <p className="text-sm font-display font-bold">Sync Recently Played</p>
                    <p className="text-[10px] text-gray-500">Fetches recent plays and updates best scores if better</p>
                  </div>
                  {piuSyncing === 'recently-played' ? (
                    <span className="text-xs text-piu-accent animate-pulse">Syncing...</span>
                  ) : (
                    <span className="text-xs text-gray-500">&rarr;</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

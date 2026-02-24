import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  updateMe, changePassword, getInvitations, respondInvitation,
  getPiugameCredentialStatus, savePiugameCredentials, deletePiugameCredentials,
  syncPumbility, syncBestScores, syncRecentlyPlayed, saveWorldMaxLocation,
  getProfileShoes, searchProfileShoeCatalog, createProfileShoe, updateProfileShoePhoto, retireProfileShoe, deleteProfileShoe,
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
  const [shoeCabinet, setShoeCabinet] = useState(null);
  const [shoeLoading, setShoeLoading] = useState(false);
  const [shoeBusy, setShoeBusy] = useState(false);
  const [shoeMessage, setShoeMessage] = useState('');
  const [shoeForm, setShoeForm] = useState({
    make: '',
    model: '',
    setCurrent: true,
    photoFile: null,
  });
  const [shoePhotoFiles, setShoePhotoFiles] = useState({});
  const [shoeRetireConfirmId, setShoeRetireConfirmId] = useState(null);
  const [shoeDeleteConfirmId, setShoeDeleteConfirmId] = useState(null);
  const [shoeCatalogQuery, setShoeCatalogQuery] = useState('');
  const [shoeCatalogResults, setShoeCatalogResults] = useState([]);
  const [shoeCatalogLoading, setShoeCatalogLoading] = useState(false);
  const [shoeCatalogSelectedId, setShoeCatalogSelectedId] = useState(null);

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
    setShoeCabinet(null);
    setShoeMessage('');
    setShoePhotoFiles({});
    setShoeRetireConfirmId(null);
    setShoeDeleteConfirmId(null);
    setShoeCatalogQuery('');
    setShoeCatalogResults([]);
    setShoeCatalogLoading(false);
    setShoeCatalogSelectedId(null);
    setShoeForm({ make: '', model: '', setCurrent: true, photoFile: null });
    getInvitations().then(setInvitations).catch(() => {});
    getPiugameCredentialStatus().then(r => setPiuLinked(r.linked)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || tab !== 'shoes') return;
    let cancelled = false;
    setShoeLoading(true);
    getProfileShoes(user.id)
      .then((data) => {
        if (cancelled) return;
        setShoeCabinet(data || { active_shoe_id: null, lifetime_songs: 0, lifetime_steps: 0, shoes: [] });
      })
      .catch(() => {
        if (cancelled) return;
        setShoeCabinet({ active_shoe_id: null, lifetime_songs: 0, lifetime_steps: 0, shoes: [] });
      })
      .finally(() => {
        if (!cancelled) setShoeLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab, user?.id]);

  useEffect(() => {
    if (!user || tab !== 'shoes') return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      setShoeCatalogLoading(true);
      searchProfileShoeCatalog(shoeCatalogQuery, 12)
        .then((data) => {
          if (cancelled) return;
          setShoeCatalogResults(Array.isArray(data?.results) ? data.results : []);
        })
        .catch(() => {
          if (cancelled) return;
          setShoeCatalogResults([]);
        })
        .finally(() => {
          if (!cancelled) setShoeCatalogLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, user?.id, shoeCatalogQuery]);

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

  const refreshShoeCabinet = async () => {
    if (!user?.id) return null;
    const data = await getProfileShoes(user.id);
    const cabinet = data || { active_shoe_id: null, lifetime_songs: 0, lifetime_steps: 0, shoes: [] };
    setShoeCabinet(cabinet);
    return cabinet;
  };

  const handleSelectCatalogShoe = (catalogShoe) => {
    if (!catalogShoe) return;
    setShoeCatalogSelectedId(catalogShoe.id);
    setShoeForm((prev) => ({
      ...prev,
      make: String(catalogShoe.make || ''),
      model: String(catalogShoe.model || ''),
    }));
  };

  const handleAddShoe = async (e) => {
    e.preventDefault();
    if (shoeBusy) return;
    const make = String(shoeForm.make || '').trim();
    const model = String(shoeForm.model || '').trim();
    if (!make && !model) {
      setShoeMessage('Enter a shoe make or model.');
      return;
    }

    setShoeBusy(true);
    setShoeMessage('');
    try {
      const result = await createProfileShoe({
        make,
        model,
        photoFile: shoeForm.photoFile || null,
        setCurrent: !!shoeForm.setCurrent,
      });
      setShoeCabinet(result?.cabinet || shoeCabinet);
      setShoeForm({ make: '', model: '', setCurrent: true, photoFile: null });
      setShoeRetireConfirmId(null);
      setShoeDeleteConfirmId(null);
      setShoeCatalogSelectedId(null);
      setShoeMessage('Shoe saved.');
    } catch (err) {
      setShoeMessage(err.message || 'Failed to add shoe.');
    } finally {
      setShoeBusy(false);
    }
  };

  const handleUploadShoePhoto = async (shoeId) => {
    if (shoeBusy) return;
    const file = shoePhotoFiles[shoeId] || null;
    if (!file) {
      setShoeMessage('Choose a photo file first.');
      return;
    }

    setShoeBusy(true);
    setShoeMessage('');
    try {
      const result = await updateProfileShoePhoto(shoeId, file);
      setShoeCabinet(result?.cabinet || shoeCabinet);
      setShoePhotoFiles((prev) => {
        const next = { ...prev };
        delete next[shoeId];
        return next;
      });
      setShoeRetireConfirmId(null);
      setShoeDeleteConfirmId(null);
      setShoeMessage('Shoe photo updated.');
    } catch (err) {
      setShoeMessage(err.message || 'Failed to update shoe photo.');
    } finally {
      setShoeBusy(false);
    }
  };

  const handleRetireShoe = async (shoeId) => {
    if (shoeBusy) return;

    setShoeBusy(true);
    setShoeMessage('');
    try {
      const result = await retireProfileShoe(shoeId);
      setShoeCabinet(result?.cabinet || shoeCabinet);
      setShoeRetireConfirmId(null);
      setShoeDeleteConfirmId(null);
      setShoeMessage('Shoe retired.');
    } catch (err) {
      setShoeMessage(err.message || 'Failed to retire shoe.');
    } finally {
      setShoeBusy(false);
    }
  };

  const handleDeleteShoe = async (shoeId) => {
    if (shoeBusy) return;

    setShoeBusy(true);
    setShoeMessage('');
    try {
      const result = await deleteProfileShoe(shoeId);
      setShoeCabinet(result?.cabinet || shoeCabinet);
      setShoePhotoFiles((prev) => {
        const next = { ...prev };
        delete next[shoeId];
        return next;
      });
      setShoeRetireConfirmId(null);
      setShoeDeleteConfirmId(null);
      setShoeMessage('Shoe deleted.');
    } catch (err) {
      setShoeMessage(err.message || 'Failed to delete shoe.');
    } finally {
      setShoeBusy(false);
    }
  };

  const cabinetShoes = Array.isArray(shoeCabinet?.shoes) ? shoeCabinet.shoes : [];
  const activeCabinetShoes = cabinetShoes.filter((shoe) => !shoe.retired_at);
  const retiredCabinetShoes = cabinetShoes.filter((shoe) => !!shoe.retired_at);
  const activeShoe = cabinetShoes.find((shoe) => shoe.is_current) || null;

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
          { key: 'shoes', label: 'Shoes' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setMessage(''); setPiuMessage(''); setShoeMessage(''); }}
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
      ) : tab === 'shoes' ? (
        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display font-bold text-sm text-piu-accent">SHOE CABINET SETTINGS</h3>
              <button
                type="button"
                onClick={() => refreshShoeCabinet().catch(() => {})}
                className="px-3 py-1 rounded-lg text-[11px] font-display font-bold bg-piu-dark text-gray-300 border border-piu-border hover:text-white disabled:opacity-60"
                disabled={shoeBusy || shoeLoading}
              >
                {shoeLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Add your shoes here and upload or replace photos later if needed.
            </p>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/40 p-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Lifetime Steps</p>
                <p className="font-mono font-bold text-sm text-piu-accent mt-1">
                  {(shoeCabinet?.lifetime_steps || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/40 p-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Lifetime Songs</p>
                <p className="font-mono font-bold text-sm text-piu-accent mt-1">
                  {(shoeCabinet?.lifetime_songs || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/40 p-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Current Shoe</p>
                <p className="font-display font-bold text-xs mt-1 truncate">
                  {activeShoe ? `${activeShoe.make} ${activeShoe.model}`.trim() : 'Not set'}
                </p>
              </div>
            </div>

            <form onSubmit={handleAddShoe} className="space-y-3 pt-2 border-t border-piu-border/30">
              <h4 className="font-display font-bold text-xs text-gray-300 uppercase tracking-wide">Add Shoe</h4>

              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Find Existing Shoe Model</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search make or model..."
                  value={shoeCatalogQuery}
                  onChange={(e) => setShoeCatalogQuery(e.target.value)}
                  maxLength={80}
                  disabled={shoeBusy}
                />
                {shoeCatalogLoading ? (
                  <p className="text-[11px] text-gray-500">Searching shared shoe models...</p>
                ) : shoeCatalogResults.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {shoeCatalogResults.map((catalogShoe) => {
                      const catalogLabel = `${catalogShoe.make} ${catalogShoe.model}`.trim() || 'Unnamed Shoe';
                      const isSelected = String(shoeCatalogSelectedId || '') === String(catalogShoe.id || '');
                      return (
                        <button
                          key={catalogShoe.id}
                          type="button"
                          onClick={() => handleSelectCatalogShoe(catalogShoe)}
                          className={`rounded-lg border p-2 text-left transition-colors ${
                            isSelected
                              ? 'border-piu-accent/70 bg-piu-accent/10'
                              : 'border-piu-border/40 bg-piu-dark/40 hover:border-piu-accent/50'
                          }`}
                          disabled={shoeBusy}
                        >
                          {catalogShoe.image_data ? (
                            <img
                              src={catalogShoe.image_data}
                              alt={catalogLabel}
                              className="w-full h-16 rounded-md object-contain bg-piu-dark/60 border border-piu-border/30 p-1"
                            />
                          ) : (
                            <div className="w-full h-16 rounded-md bg-piu-dark/60 border border-piu-border/30 flex items-center justify-center text-[10px] text-gray-500">
                              No Photo
                            </div>
                          )}
                          <p className="font-display font-bold text-[11px] mt-1 leading-tight line-clamp-2">{catalogLabel}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Used by {(catalogShoe.usage_count || 0).toLocaleString()} players
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    {shoeCatalogQuery ? 'No matching models found.' : 'Popular community models will appear here.'}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Make</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Nike"
                    maxLength={80}
                    value={shoeForm.make}
                    onChange={(e) => {
                      setShoeCatalogSelectedId(null);
                      setShoeForm((prev) => ({ ...prev, make: e.target.value }));
                    }}
                    disabled={shoeBusy}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Model</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. ZoomX Invincible 3"
                    maxLength={80}
                    value={shoeForm.model}
                    onChange={(e) => {
                      setShoeCatalogSelectedId(null);
                      setShoeForm((prev) => ({ ...prev, model: e.target.value }));
                    }}
                    disabled={shoeBusy}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setShoeForm((prev) => ({ ...prev, photoFile: e.target.files?.[0] || null }))}
                  className="text-xs text-gray-400 file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border file:border-piu-border file:bg-piu-dark file:text-gray-300 file:cursor-pointer"
                  disabled={shoeBusy}
                />
                <label className="inline-flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={shoeForm.setCurrent}
                    onChange={(e) => setShoeForm((prev) => ({ ...prev, setCurrent: e.target.checked }))}
                    disabled={shoeBusy}
                  />
                  Set as current shoe
                </label>
              </div>

              <button type="submit" className="btn-primary w-full" disabled={shoeBusy}>
                {shoeBusy ? 'Saving...' : 'Add Shoe'}
              </button>
            </form>
          </div>

          {shoeMessage && (
            <div className={`px-4 py-2 rounded-lg text-sm ${
              shoeMessage.includes('saved')
              || shoeMessage.includes('updated')
              || shoeMessage.includes('retired')
              || shoeMessage.includes('deleted')
                ? 'bg-piu-green/10 text-piu-green border border-piu-green/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {shoeMessage}
            </div>
          )}

          <div className="space-y-3">
            {shoeLoading && cabinetShoes.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">Loading shoes...</p>
            ) : cabinetShoes.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">No shoes in your cabinet yet.</p>
            ) : (
              <>
                {activeCabinetShoes.map((shoe) => {
                  const label = `${shoe.make} ${shoe.model}`.trim() || 'Unnamed Shoe';
                  const pendingFile = shoePhotoFiles[shoe.id] || null;
                  return (
                    <div key={shoe.id} className="card space-y-3">
                      <div className="flex items-start gap-3">
                        {shoe.image_data ? (
                          <img src={shoe.image_data} alt={label} className="w-28 h-16 rounded-lg object-contain bg-piu-dark/60 border border-piu-border/40 shrink-0 p-1" />
                        ) : (
                          <div className="w-28 h-16 rounded-lg border border-piu-border/40 bg-piu-dark/60 flex items-center justify-center text-[11px] text-gray-500 text-center shrink-0">
                            No Photo
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-display font-bold text-sm truncate">{label}</p>
                            {shoe.is_current ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-display font-bold bg-piu-accent/20 text-piu-accent border border-piu-accent/40">
                                Current
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">
                            {(shoe.songs_logged || 0).toLocaleString()} songs
                            <span className="mx-1.5 text-gray-700">|</span>
                            {(shoe.steps_logged || 0).toLocaleString()} steps
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-piu-border/30 space-y-2">
                        <label className="block text-xs text-gray-400">Upload / replace photo</label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setShoePhotoFiles((prev) => ({ ...prev, [shoe.id]: e.target.files?.[0] || null }))}
                            className="text-xs text-gray-400 file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border file:border-piu-border file:bg-piu-dark file:text-gray-300 file:cursor-pointer"
                            disabled={shoeBusy}
                          />
                          <button
                            type="button"
                            onClick={() => handleUploadShoePhoto(shoe.id)}
                            className="px-3 py-1 rounded-lg text-xs font-display font-bold bg-piu-dark text-gray-300 border border-piu-border hover:text-white disabled:opacity-60"
                            disabled={shoeBusy || !pendingFile}
                          >
                            {shoeBusy ? 'Saving...' : 'Save Photo'}
                          </button>
                        </div>

                        <div className="pt-2 border-t border-red-500/30">
                          {shoeRetireConfirmId === shoe.id ? (
                            <div className="space-y-1.5">
                              <button
                                type="button"
                                onClick={() => handleRetireShoe(shoe.id)}
                                className="w-full px-3 py-1.5 rounded-lg text-[11px] font-display font-bold text-red-200 border border-red-500/60 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-60"
                                disabled={shoeBusy}
                              >
                                Confirm Retire
                              </button>
                              <button
                                type="button"
                                onClick={() => setShoeRetireConfirmId(null)}
                                className="w-full px-3 py-1 rounded-lg text-[10px] font-display font-bold bg-piu-dark text-gray-400 border border-piu-border hover:text-gray-200 disabled:opacity-60"
                                disabled={shoeBusy}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setShoeDeleteConfirmId(null);
                                setShoeRetireConfirmId(shoe.id);
                              }}
                              className="w-full px-3 py-1 rounded-lg text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200 disabled:opacity-60"
                              disabled={shoeBusy}
                            >
                              Retire...
                            </button>
                          )}
                        </div>

                        <div className="pt-2 border-t border-red-500/30">
                          {shoeDeleteConfirmId === shoe.id ? (
                            <div className="space-y-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteShoe(shoe.id)}
                                className="w-full px-3 py-1.5 rounded-lg text-[11px] font-display font-bold text-red-200 border border-red-500/60 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-60"
                                disabled={shoeBusy}
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setShoeDeleteConfirmId(null)}
                                className="w-full px-3 py-1 rounded-lg text-[10px] font-display font-bold bg-piu-dark text-gray-400 border border-piu-border hover:text-gray-200 disabled:opacity-60"
                                disabled={shoeBusy}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setShoeRetireConfirmId(null);
                                setShoeDeleteConfirmId(shoe.id);
                              }}
                              className="w-full px-3 py-1 rounded-lg text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200 disabled:opacity-60"
                              disabled={shoeBusy}
                            >
                              Delete...
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {retiredCabinetShoes.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] font-display font-bold text-gray-400 uppercase tracking-wide">Retired Shoes</p>
                  </div>
                )}

                {retiredCabinetShoes.map((shoe) => {
                  const label = `${shoe.make} ${shoe.model}`.trim() || 'Unnamed Shoe';
                  const pendingFile = shoePhotoFiles[shoe.id] || null;
                  return (
                    <div key={shoe.id} className="card space-y-3">
                      <div className="flex items-start gap-3">
                        {shoe.image_data ? (
                          <img src={shoe.image_data} alt={label} className="w-28 h-16 rounded-lg object-contain bg-piu-dark/60 border border-piu-border/40 shrink-0 p-1" />
                        ) : (
                          <div className="w-28 h-16 rounded-lg border border-piu-border/40 bg-piu-dark/60 flex items-center justify-center text-[11px] text-gray-500 text-center shrink-0">
                            No Photo
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-display font-bold text-sm truncate">{label}</p>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-display font-bold bg-gray-700/60 text-gray-300 border border-gray-500/40">
                              Retired
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">
                            {(shoe.songs_logged || 0).toLocaleString()} songs
                            <span className="mx-1.5 text-gray-700">|</span>
                            {(shoe.steps_logged || 0).toLocaleString()} steps
                          </p>
                          <p className="text-[10px] text-gray-600 mt-1">
                            Retired {new Date(`${shoe.retired_at}Z`).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-piu-border/30 space-y-2">
                        <label className="block text-xs text-gray-400">Upload / replace photo</label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setShoePhotoFiles((prev) => ({ ...prev, [shoe.id]: e.target.files?.[0] || null }))}
                            className="text-xs text-gray-400 file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border file:border-piu-border file:bg-piu-dark file:text-gray-300 file:cursor-pointer"
                            disabled={shoeBusy}
                          />
                          <button
                            type="button"
                            onClick={() => handleUploadShoePhoto(shoe.id)}
                            className="px-3 py-1 rounded-lg text-xs font-display font-bold bg-piu-dark text-gray-300 border border-piu-border hover:text-white disabled:opacity-60"
                            disabled={shoeBusy || !pendingFile}
                          >
                            {shoeBusy ? 'Saving...' : 'Save Photo'}
                          </button>
                        </div>

                        <div className="pt-2 border-t border-red-500/30">
                          {shoeDeleteConfirmId === shoe.id ? (
                            <div className="space-y-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteShoe(shoe.id)}
                                className="w-full px-3 py-1.5 rounded-lg text-[11px] font-display font-bold text-red-200 border border-red-500/60 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-60"
                                disabled={shoeBusy}
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setShoeDeleteConfirmId(null)}
                                className="w-full px-3 py-1 rounded-lg text-[10px] font-display font-bold bg-piu-dark text-gray-400 border border-piu-border hover:text-gray-200 disabled:opacity-60"
                                disabled={shoeBusy}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setShoeRetireConfirmId(null);
                                setShoeDeleteConfirmId(shoe.id);
                              }}
                              className="w-full px-3 py-1 rounded-lg text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200 disabled:opacity-60"
                              disabled={shoeBusy}
                            >
                              Delete...
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
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

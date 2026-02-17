import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createCommunity } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

export default function CommunitySetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [name, setName] = useState('');
  const [nameManual, setNameManual] = useState(false);
  const [description, setDescription] = useState('');
  const [inviteOnly, setInviteOnly] = useState(false);
  const [badgeText, setBadgeText] = useState('');
  const [badgeColor, setBadgeColor] = useState('#ff3366');
  const [badgeTextColor, setBadgeTextColor] = useState('#ffffff');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-400">Please log in to create a community.</p>
      </div>
    );
  }

  const handleDisplayNameChange = (val) => {
    setDisplayName(val);
    if (!nameManual) setName(slugify(val));
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleBannerChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return setError('Community name is required');
    if (!name.trim() || name.length < 2) return setError('URL name must be at least 2 characters');

    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('display_name', displayName.trim());
      formData.append('name', name);
      formData.append('description', description);
      formData.append('is_invite_only', inviteOnly ? 'true' : 'false');
      formData.append('badge_text', badgeText);
      formData.append('badge_color', badgeColor);
      formData.append('badge_text_color', badgeTextColor);
      if (avatarFile) formData.append('avatar', avatarFile);
      if (bannerFile) formData.append('banner', bannerFile);

      const community = await createCommunity(formData);
      navigate(`/c/${community.name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display font-bold text-2xl tracking-wider mb-6">CREATE COMMUNITY</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Display Name */}
        <div>
          <label className="block text-sm font-display font-bold text-gray-400 mb-1">Community Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => handleDisplayNameChange(e.target.value)}
            className="w-full bg-piu-dark border border-piu-border rounded-lg px-4 py-2.5 text-white font-display focus:outline-none focus:border-piu-accent"
            placeholder="e.g. Korean Pumpers"
            maxLength={60}
          />
        </div>

        {/* URL Name */}
        <div>
          <label className="block text-sm font-display font-bold text-gray-400 mb-1">
            URL Name
            <span className="text-gray-600 font-normal ml-2">c/{name || '...'}</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setNameManual(true); setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
            className="w-full bg-piu-dark border border-piu-border rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-piu-accent"
            placeholder="community-url-name"
            maxLength={60}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-display font-bold text-gray-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-piu-dark border border-piu-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-piu-accent resize-none"
            rows={3}
            placeholder="What is this community about?"
            maxLength={500}
          />
        </div>

        {/* Avatar */}
        <div>
          <label className="block text-sm font-display font-bold text-gray-400 mb-2">Avatar</label>
          <div className="flex items-center gap-4">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-piu-border" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-piu-dark border-2 border-piu-border flex items-center justify-center text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            )}
            <label className="cursor-pointer px-4 py-2 bg-piu-dark border border-piu-border rounded-lg text-sm font-display hover:border-piu-accent transition-colors">
              Choose Image
              <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </label>
          </div>
        </div>

        {/* Banner */}
        <div>
          <label className="block text-sm font-display font-bold text-gray-400 mb-2">Banner</label>
          {bannerPreview ? (
            <div className="relative mb-2">
              <img src={bannerPreview} alt="" className="w-full h-32 object-cover rounded-lg border border-piu-border" />
              <button
                type="button"
                onClick={() => { setBannerFile(null); setBannerPreview(''); }}
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1 hover:bg-black/80 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <label className="cursor-pointer flex items-center justify-center w-full h-32 bg-piu-dark border-2 border-dashed border-piu-border rounded-lg hover:border-piu-accent transition-colors">
              <div className="text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 mx-auto text-gray-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-gray-500 font-display">Upload Banner</span>
              </div>
              <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
            </label>
          )}
        </div>

        {/* Invite Only */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setInviteOnly(!inviteOnly)}
            className={`relative w-11 h-6 rounded-full transition-colors ${inviteOnly ? 'bg-piu-accent' : 'bg-piu-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${inviteOnly ? 'translate-x-5' : ''}`} />
          </button>
          <span className="text-sm font-display text-gray-300">Invite Only</span>
          <span className="text-xs text-gray-600">Members must be approved to join</span>
        </div>

        {/* Badge Configuration */}
        <div className="border border-piu-border rounded-lg p-4">
          <label className="block text-sm font-display font-bold text-gray-400 mb-3">Affiliation Badge</label>
          <p className="text-xs text-gray-500 mb-3">This badge appears next to member names to show they belong to your community.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Badge Text</label>
              <input
                type="text"
                value={badgeText}
                onChange={(e) => setBadgeText(e.target.value)}
                className="w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-piu-accent"
                placeholder="e.g. KR, PIU, NA"
                maxLength={10}
              />
            </div>
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">BG Color</label>
                <input
                  type="color"
                  value={badgeColor}
                  onChange={(e) => setBadgeColor(e.target.value)}
                  className="w-10 h-9 rounded cursor-pointer border border-piu-border bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Text Color</label>
                <input
                  type="color"
                  value={badgeTextColor}
                  onChange={(e) => setBadgeTextColor(e.target.value)}
                  className="w-10 h-9 rounded cursor-pointer border border-piu-border bg-transparent"
                />
              </div>
              {/* Live Preview */}
              {badgeText && (
                <div className="flex items-center gap-2 pb-0.5">
                  <span className="text-xs text-gray-500">Preview:</span>
                  <span
                    className="inline-flex items-center text-[10px] font-display font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    style={{ backgroundColor: badgeColor, color: badgeTextColor }}
                  >
                    {badgeText}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-gradient-to-r from-piu-accent to-purple-600 rounded-lg font-display font-bold tracking-wider text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'CREATE COMMUNITY'}
        </button>
      </form>
    </div>
  );
}

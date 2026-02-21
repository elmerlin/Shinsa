import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import CommunityTag from '../components/CommunityTag';
import {
  getCommunityByName, updateCommunity, deleteCommunity,
  getCommunityMembers, updateMemberRole, removeCommunityMember,
  getJoinRequests, respondJoinRequest,
  getCommunityTags, createCommunityTag, updateCommunityTag, deleteCommunityTag,
  assignCommunityTag, removeCommunityTag,
  getCommunityEmojis, uploadEmojiSheet, updateCommunityEmoji, deleteCommunityEmoji,
  getCommunityBadges, uploadBadgeSheet, updateCommunityBadge, deleteCommunityBadge,
  assignCommunityBadge, removeCommunityBadge,
} from '../utils/api';

export default function CommunitySettingsPage() {
  const { communityName } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadCommunity = useCallback(async () => {
    try {
      const data = await getCommunityByName(communityName);
      setCommunity(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [communityName]);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" /></div>;
  if (!community) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">{error || 'Community not found'}</div>;

  const isOwner = community.user_role === 'owner';
  const isModOrOwner = community.user_role === 'owner' || community.user_role === 'moderator';
  if (!isModOrOwner) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">You don't have permission to manage this community.</div>;

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'members', label: 'Members' },
    { id: 'tags', label: 'Tags' },
    { id: 'emojis', label: 'Emojis' },
    { id: 'badges', label: 'Badges' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/c/${community.name}`} className="text-gray-500 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display font-bold text-xl tracking-wider">COMMUNITY SETTINGS</h1>
      </div>

      {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">{error}</div>}
      {success && <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-sm text-green-400">{success}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-piu-border mb-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); setError(''); setSuccess(''); }}
            className={`px-4 py-2.5 font-display font-bold text-sm border-b-2 transition-colors ${
              activeTab === t.id ? 'border-piu-accent text-piu-accent' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <GeneralTab
          community={community}
          isOwner={isOwner}
          onUpdate={(updated) => { setCommunity(updated); setSuccess('Settings saved'); setTimeout(() => setSuccess(''), 3000); }}
          onDelete={() => navigate('/')}
          setError={setError}
        />
      )}
      {activeTab === 'members' && (
        <MembersTab
          community={community}
          isOwner={isOwner}
          user={user}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {activeTab === 'tags' && (
        <TagsTab
          community={community}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {activeTab === 'emojis' && (
        <EmojisTab
          community={community}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {activeTab === 'badges' && (
        <BadgesTab
          community={community}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
    </div>
  );
}

// ─── General Tab ─────────────────────────────────────

function GeneralTab({ community, isOwner, onUpdate, onDelete, setError }) {
  const [displayName, setDisplayName] = useState(community.display_name);
  const [description, setDescription] = useState(community.description || '');
  const [inviteOnly, setInviteOnly] = useState(!!community.is_invite_only);
  const [badgeText, setBadgeText] = useState(community.badge_text || '');
  const [badgeColor, setBadgeColor] = useState(community.badge_color || '#ff3366');
  const [badgeTextColor, setBadgeTextColor] = useState(community.badge_text_color || '#ffffff');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('display_name', displayName);
      formData.append('description', description);
      formData.append('is_invite_only', inviteOnly ? 'true' : 'false');
      formData.append('badge_text', badgeText);
      formData.append('badge_color', badgeColor);
      formData.append('badge_text_color', badgeTextColor);
      if (avatarFile) formData.append('avatar', avatarFile);
      if (bannerFile) formData.append('banner', bannerFile);
      const updated = await updateCommunity(community.id, formData);
      onUpdate(updated);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to permanently delete this community? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteCommunity(community.id);
      onDelete();
    } catch (err) { setError(err.message); setDeleting(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-display font-bold text-gray-400 mb-1">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full bg-piu-dark border border-piu-border rounded-lg px-4 py-2.5 text-white font-display focus:outline-none focus:border-piu-accent"
          maxLength={60}
        />
      </div>

      <div>
        <label className="block text-sm font-display font-bold text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-piu-dark border border-piu-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-piu-accent resize-none"
          rows={3}
          maxLength={500}
        />
      </div>

      <div>
        <label className="block text-sm font-display font-bold text-gray-400 mb-2">Avatar</label>
        <div className="flex items-center gap-4">
          {(avatarPreview || community.avatar) ? (
            <img src={avatarPreview || community.avatar} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-piu-border" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-piu-dark border-2 border-piu-border flex items-center justify-center text-2xl font-display font-bold text-gray-600">
              {community.display_name[0]?.toUpperCase()}
            </div>
          )}
          <label className="cursor-pointer px-4 py-2 bg-piu-dark border border-piu-border rounded-lg text-sm font-display hover:border-piu-accent transition-colors">
            Change
            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f)); } }} className="hidden" />
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-display font-bold text-gray-400 mb-2">Banner</label>
        <div className="relative">
          {(bannerPreview || community.banner) ? (
            <img src={bannerPreview || community.banner} alt="" className="w-full h-32 object-cover rounded-lg border border-piu-border" />
          ) : (
            <div className="w-full h-32 bg-piu-dark border border-piu-border rounded-lg flex items-center justify-center text-gray-600 text-sm">No banner</div>
          )}
          <label className="absolute bottom-2 right-2 cursor-pointer px-3 py-1 bg-black/60 rounded-lg text-xs font-display hover:bg-black/80 transition-colors">
            Change
            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setBannerFile(f); setBannerPreview(URL.createObjectURL(f)); } }} className="hidden" />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setInviteOnly(!inviteOnly)}
          className={`relative w-11 h-6 rounded-full transition-colors ${inviteOnly ? 'bg-piu-accent' : 'bg-piu-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${inviteOnly ? 'translate-x-5' : ''}`} />
        </button>
        <span className="text-sm font-display text-gray-300">Invite Only</span>
      </div>

      <div className="border border-piu-border rounded-lg p-4">
        <label className="block text-sm font-display font-bold text-gray-400 mb-3">Affiliation Badge</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Badge Text</label>
            <input type="text" value={badgeText} onChange={(e) => setBadgeText(e.target.value)} className="w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-piu-accent" maxLength={10} />
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">BG</label>
              <input type="color" value={badgeColor} onChange={(e) => setBadgeColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border border-piu-border bg-transparent" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Text</label>
              <input type="color" value={badgeTextColor} onChange={(e) => setBadgeTextColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border border-piu-border bg-transparent" />
            </div>
            {badgeText && (
              <span className="inline-flex items-center text-[10px] font-display font-bold px-1.5 py-0.5 rounded-full mb-1" style={{ backgroundColor: badgeColor, color: badgeTextColor }}>
                {badgeText}
              </span>
            )}
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-gradient-to-r from-piu-accent to-purple-600 rounded-lg font-display font-bold tracking-wider text-white hover:opacity-90 transition-opacity disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      {isOwner && (
        <div className="border-t border-piu-border pt-6">
          <h3 className="text-sm font-display font-bold text-red-400 mb-2">Danger Zone</h3>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 border border-red-500/30 rounded-lg text-sm font-display text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
            {deleting ? 'Deleting...' : 'Delete Community'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Members Tab ─────────────────────────────────────

function MembersTab({ community, isOwner, user, setError, setSuccess }) {
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([
        getCommunityMembers(community.id),
        community.is_invite_only ? getJoinRequests(community.id) : Promise.resolve([]),
      ]);
      setMembers(m);
      setRequests(r);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [community.id, community.is_invite_only, setError]);

  useEffect(() => { load(); }, [load]);

  const handleRoleChange = async (userId, role) => {
    try {
      await updateMemberRole(community.id, userId, role);
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, role } : m));
      setSuccess(`Role updated to ${role}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleRemove = async (userId, username) => {
    if (!confirm(`Remove ${username} from the community?`)) return;
    try {
      await removeCommunityMember(community.id, userId);
      setMembers(prev => prev.filter(m => m.id !== userId));
      setSuccess(`${username} has been removed`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleRequest = async (requestId, status) => {
    try {
      await respondJoinRequest(community.id, requestId, status);
      setRequests(prev => prev.filter(r => r.id !== requestId));
      if (status === 'accepted') load();
      setSuccess(`Request ${status}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {/* Join Requests */}
      {requests.length > 0 && (
        <div className="mb-6">
          <h3 className="font-display font-bold text-sm text-yellow-400 mb-3">Pending Requests ({requests.length})</h3>
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="flex items-center gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                <Link to={`/profile/${req.user_id}`} className="flex items-center gap-2 flex-1 min-w-0">
                  {req.avatar ? (
                    <img src={req.avatar.startsWith('data:') ? req.avatar : getAvatarUrl(req.avatar)} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">{req.username[0]?.toUpperCase()}</div>
                  )}
                  <div>
                    <span className="font-display font-bold text-sm">{req.username}</span>
                    {req.pumbility > 0 && <span className="ml-2 text-[10px] font-mono text-piu-accent">{req.pumbility}</span>}
                  </div>
                </Link>
                <div className="flex gap-2">
                  <button onClick={() => handleRequest(req.id, 'accepted')} className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-xs font-display font-bold hover:bg-green-500/30">Accept</button>
                  <button onClick={() => handleRequest(req.id, 'declined')} className="px-3 py-1 bg-red-500/20 text-red-400 rounded-lg text-xs font-display font-bold hover:bg-red-500/30">Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members list */}
      <h3 className="font-display font-bold text-sm text-gray-400 mb-3">Members ({members.length})</h3>
      <div className="space-y-1">
        {members.map(member => (
          <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-piu-dark/30">
            <Link to={`/profile/${member.id}`} className="flex items-center gap-2 flex-1 min-w-0">
              {member.avatar ? (
                <img src={member.avatar.startsWith('data:') ? member.avatar : getAvatarUrl(member.avatar)} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">{member.username[0]?.toUpperCase()}</div>
              )}
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-bold text-sm">{member.username}</span>
                  {member.nationality && <span className="text-sm">{getCountryFlag(member.nationality)}</span>}
                  {member.role === 'owner' && <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-gold/20 text-piu-gold">Owner</span>}
                  {member.role === 'moderator' && <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-blue/20 text-piu-blue">Mod</span>}
                </div>
                {member.pumbility > 0 && <span className="text-[10px] font-mono text-piu-accent">{member.pumbility}</span>}
              </div>
            </Link>

            {/* Role actions */}
            {isOwner && member.id !== user?.id && member.role !== 'owner' && (
              <div className="flex items-center gap-2">
                {member.role === 'member' ? (
                  <button onClick={() => handleRoleChange(member.id, 'moderator')} className="text-[10px] font-display text-piu-blue hover:underline">Make Mod</button>
                ) : (
                  <button onClick={() => handleRoleChange(member.id, 'member')} className="text-[10px] font-display text-gray-400 hover:underline">Demote</button>
                )}
                <button onClick={() => handleRemove(member.id, member.username)} className="text-[10px] font-display text-red-400 hover:underline">Remove</button>
              </div>
            )}
            {!isOwner && member.role === 'member' && member.id !== user?.id && (
              <button onClick={() => handleRemove(member.id, member.username)} className="text-[10px] font-display text-red-400 hover:underline">Remove</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tags Tab ────────────────────────────────────────

function TagsTab({ community, setError, setSuccess }) {
  const [tags, setTags] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#ff3366');
  const [newTagTextColor, setNewTagTextColor] = useState('#ffffff');
  const [editingTag, setEditingTag] = useState(null);
  const [assigningTag, setAssigningTag] = useState(null);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        getCommunityTags(community.id),
        getCommunityMembers(community.id),
      ]);
      setTags(t);
      setMembers(m);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [community.id, setError]);

  useEffect(() => { load(); }, [load]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await createCommunityTag(community.id, { name: newTagName.trim(), color: newTagColor, text_color: newTagTextColor });
      setTags(prev => [...prev, tag]);
      setNewTagName('');
      setSuccess('Tag created');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleUpdateTag = async (tag) => {
    try {
      const updated = await updateCommunityTag(community.id, tag.id, { name: tag.name, color: tag.color, text_color: tag.text_color });
      setTags(prev => prev.map(t => t.id === updated.id ? updated : t));
      setEditingTag(null);
      setSuccess('Tag updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleDeleteTag = async (tagId) => {
    if (!confirm('Delete this tag?')) return;
    try {
      await deleteCommunityTag(community.id, tagId);
      setTags(prev => prev.filter(t => t.id !== tagId));
      setSuccess('Tag deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleAssign = async (tagId, userId) => {
    try {
      await assignCommunityTag(community.id, tagId, userId);
      load();
      setSuccess('Tag assigned');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleUnassign = async (tagId, userId) => {
    try {
      await removeCommunityTag(community.id, tagId, userId);
      load();
      setSuccess('Tag removed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {/* Create tag */}
      <div className="bg-piu-card border border-piu-border rounded-xl p-4 mb-6">
        <h3 className="font-display font-bold text-sm text-gray-400 mb-3">Create New Tag</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} className="w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-piu-accent" placeholder="Tag name" maxLength={20} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">BG</label>
            <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border border-piu-border bg-transparent" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Text</label>
            <input type="color" value={newTagTextColor} onChange={(e) => setNewTagTextColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border border-piu-border bg-transparent" />
          </div>
          {newTagName && (
            <CommunityTag name={newTagName} color={newTagColor} textColor={newTagTextColor} />
          )}
          <button onClick={handleCreateTag} disabled={!newTagName.trim()} className="px-4 py-2 bg-piu-accent rounded-lg text-xs font-display font-bold hover:bg-piu-accent/80 disabled:opacity-40">
            Create
          </button>
        </div>
      </div>

      {/* Existing tags */}
      {tags.length === 0 ? (
        <p className="text-center text-gray-500 py-6 text-sm font-display">No tags yet. Create one above.</p>
      ) : (
        <div className="space-y-3">
          {tags.map(tag => (
            <div key={tag.id} className="bg-piu-card border border-piu-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {editingTag === tag.id ? (
                    <EditTagInline tag={tag} onSave={handleUpdateTag} onCancel={() => setEditingTag(null)} />
                  ) : (
                    <>
                      <CommunityTag name={tag.name} color={tag.color} textColor={tag.text_color} />
                      <button onClick={() => setEditingTag(tag.id)} className="text-[10px] text-gray-500 hover:text-gray-300">Edit</button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAssigningTag(assigningTag === tag.id ? null : tag.id)}
                    className="text-[10px] font-display text-piu-accent hover:underline"
                  >
                    {assigningTag === tag.id ? 'Close' : 'Assign'}
                  </button>
                  <button onClick={() => handleDeleteTag(tag.id)} className="text-[10px] text-red-400 hover:underline">Delete</button>
                </div>
              </div>

              {/* Tag assignment panel */}
              {assigningTag === tag.id && (
                <div className="mt-3 pt-3 border-t border-piu-border/30">
                  <p className="text-[10px] text-gray-500 mb-2">Click to assign/remove this tag from members:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map(member => {
                      const hasTag = member.tags?.some(t => t.id === tag.id);
                      return (
                        <button
                          key={member.id}
                          onClick={() => hasTag ? handleUnassign(tag.id, member.id) : handleAssign(tag.id, member.id)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-display transition-colors ${
                            hasTag ? 'bg-piu-accent/20 text-piu-accent border border-piu-accent/30' : 'bg-piu-dark text-gray-400 border border-piu-border hover:border-gray-500'
                          }`}
                        >
                          {member.avatar ? (
                            <img src={member.avatar.startsWith('data:') ? member.avatar : getAvatarUrl(member.avatar)} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center text-[6px] font-bold">{member.username[0]?.toUpperCase()}</div>
                          )}
                          {member.username}
                          {hasTag && <span className="ml-0.5">x</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditTagInline({ tag, onSave, onCancel }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [textColor, setTextColor] = useState(tag.text_color);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="bg-piu-dark border border-piu-border rounded px-2 py-1 text-xs text-white w-28 focus:outline-none focus:border-piu-accent" maxLength={20} />
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-piu-border bg-transparent" />
      <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-piu-border bg-transparent" />
      <CommunityTag name={name} color={color} textColor={textColor} />
      <button onClick={() => onSave({ ...tag, name, color, text_color: textColor })} className="text-[10px] text-green-400 font-display font-bold">Save</button>
      <button onClick={onCancel} className="text-[10px] text-gray-500">Cancel</button>
    </div>
  );
}

// ─── Emojis Tab ─────────────────────────────────────

function EmojisTab({ community, setError, setSuccess }) {
  const [emojis, setEmojis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [prefix, setPrefix] = useState('emoji');
  const [editingEmoji, setEditingEmoji] = useState(null);
  const [sheetPreview, setSheetPreview] = useState('');
  const fileRef = React.useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await getCommunityEmojis(community.id);
      setEmojis(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [community.id, setError]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSheetPreview(URL.createObjectURL(file));
    setUploading(true);
    setError('');
    try {
      const newEmojis = await uploadEmojiSheet(community.id, file, cols, rows, prefix);
      setEmojis(prev => [...prev, ...newEmojis]);
      setSuccess(`${newEmojis.length} emojis processed from sheet`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
    finally { setUploading(false); setSheetPreview(''); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleRename = async (emoji) => {
    try {
      const updated = await updateCommunityEmoji(community.id, emoji.id, emoji.name);
      setEmojis(prev => prev.map(e => e.id === updated.id ? updated : e));
      setEditingEmoji(null);
      setSuccess('Emoji renamed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (emojiId) => {
    if (!confirm('Delete this emoji?')) return;
    try {
      await deleteCommunityEmoji(community.id, emojiId);
      setEmojis(prev => prev.filter(e => e.id !== emojiId));
      setSuccess('Emoji deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {/* Upload section */}
      <div className="bg-piu-card border border-piu-border rounded-xl p-4 mb-6">
        <h3 className="font-display font-bold text-sm text-gray-400 mb-3">Upload Emoji Sheet</h3>
        <p className="text-[10px] text-gray-500 mb-3">Upload a sprite sheet image. It will be divided into a grid of individual emojis based on the rows and columns you specify.</p>

        <div className="flex items-end gap-3 flex-wrap mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Columns</label>
            <input type="number" value={cols} onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={20} className="w-16 bg-piu-dark border border-piu-border rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-piu-accent" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rows</label>
            <input type="number" value={rows} onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={20} className="w-16 bg-piu-dark border border-piu-border rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-piu-accent" />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-gray-500 mb-1">Name Prefix</label>
            <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-full bg-piu-dark border border-piu-border rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-piu-accent" maxLength={20} placeholder="emoji" />
          </div>
        </div>

        {sheetPreview && (
          <div className="mb-3">
            <img src={sheetPreview} alt="Sheet preview" className="max-h-40 rounded-lg border border-piu-border" />
          </div>
        )}

        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-display font-bold cursor-pointer transition-colors ${
          uploading ? 'bg-piu-dark text-gray-500' : 'bg-piu-accent hover:bg-piu-accent/80 text-white'
        }`}>
          {uploading ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Sheet
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {/* Existing emojis */}
      {emojis.length === 0 ? (
        <p className="text-center text-gray-500 py-6 text-sm font-display">No custom emojis yet. Upload a sprite sheet above.</p>
      ) : (
        <div>
          <h3 className="font-display font-bold text-sm text-gray-400 mb-3">Custom Emojis ({emojis.length})</h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {emojis.map(emoji => (
              <div key={emoji.id} className="bg-piu-card border border-piu-border rounded-lg p-2 flex flex-col items-center gap-1 group relative">
                <img src={emoji.image} alt={emoji.name} className="w-10 h-10 object-contain" />
                {editingEmoji === emoji.id ? (
                  <EmojiRenameInline
                    emoji={emoji}
                    onSave={handleRename}
                    onCancel={() => setEditingEmoji(null)}
                  />
                ) : (
                  <span className="text-[9px] text-gray-500 font-display truncate max-w-full">:{emoji.name}:</span>
                )}
                <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditingEmoji(emoji.id)} className="w-4 h-4 rounded bg-piu-dark/80 flex items-center justify-center text-[8px] text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => handleDelete(emoji.id)} className="w-4 h-4 rounded bg-red-500/80 flex items-center justify-center text-[8px] text-white hover:bg-red-500">
                    x
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmojiRenameInline({ emoji, onSave, onCancel }) {
  const [name, setName] = useState(emoji.name);
  return (
    <div className="flex items-center gap-1">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="bg-piu-dark border border-piu-border rounded px-1 py-0.5 text-[9px] text-white w-16 focus:outline-none focus:border-piu-accent" maxLength={30} autoFocus />
      <button onClick={() => onSave({ ...emoji, name })} className="text-[8px] text-green-400">OK</button>
      <button onClick={onCancel} className="text-[8px] text-gray-500">X</button>
    </div>
  );
}

// ─── Badges Tab ─────────────────────────────────────

function BadgesTab({ community, setError, setSuccess }) {
  const [badges, setBadges] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [prefix, setPrefix] = useState('badge');
  const [editingBadge, setEditingBadge] = useState(null);
  const [assigningBadge, setAssigningBadge] = useState(null);
  const [sheetPreview, setSheetPreview] = useState('');
  const fileRef = React.useRef(null);

  const load = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([
        getCommunityBadges(community.id),
        getCommunityMembers(community.id),
      ]);
      setBadges(b);
      setMembers(m);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [community.id, setError]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSheetPreview(URL.createObjectURL(file));
    setUploading(true);
    setError('');
    try {
      const newBadges = await uploadBadgeSheet(community.id, file, cols, rows, prefix);
      setBadges(prev => [...prev, ...newBadges]);
      setSuccess(`${newBadges.length} badges processed from sheet`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
    finally { setUploading(false); setSheetPreview(''); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleRename = async (badge) => {
    try {
      const updated = await updateCommunityBadge(community.id, badge.id, badge.name);
      setBadges(prev => prev.map(b => b.id === updated.id ? updated : b));
      setEditingBadge(null);
      setSuccess('Badge renamed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (badgeId) => {
    if (!confirm('Delete this badge? It will be removed from all members.')) return;
    try {
      await deleteCommunityBadge(community.id, badgeId);
      setBadges(prev => prev.filter(b => b.id !== badgeId));
      setSuccess('Badge deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleAssign = async (badgeId, userId) => {
    try {
      await assignCommunityBadge(community.id, badgeId, userId);
      load();
      setSuccess('Badge assigned');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleUnassign = async (badgeId, userId) => {
    try {
      await removeCommunityBadge(community.id, badgeId, userId);
      load();
      setSuccess('Badge removed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {/* Upload section */}
      <div className="bg-piu-card border border-piu-border rounded-xl p-4 mb-6">
        <h3 className="font-display font-bold text-sm text-gray-400 mb-3">Upload Badge Sheet</h3>
        <p className="text-[10px] text-gray-500 mb-3">Upload a sprite sheet of role badges. Each badge will be a small square displayed beside a member's name. Specify the grid dimensions below.</p>

        <div className="flex items-end gap-3 flex-wrap mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Columns</label>
            <input type="number" value={cols} onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={20} className="w-16 bg-piu-dark border border-piu-border rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-piu-accent" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rows</label>
            <input type="number" value={rows} onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={20} className="w-16 bg-piu-dark border border-piu-border rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-piu-accent" />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-gray-500 mb-1">Name Prefix</label>
            <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-full bg-piu-dark border border-piu-border rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-piu-accent" maxLength={20} placeholder="badge" />
          </div>
        </div>

        {sheetPreview && (
          <div className="mb-3">
            <img src={sheetPreview} alt="Sheet preview" className="max-h-40 rounded-lg border border-piu-border" />
          </div>
        )}

        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-display font-bold cursor-pointer transition-colors ${
          uploading ? 'bg-piu-dark text-gray-500' : 'bg-piu-accent hover:bg-piu-accent/80 text-white'
        }`}>
          {uploading ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Sheet
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {/* Existing badges */}
      {badges.length === 0 ? (
        <p className="text-center text-gray-500 py-6 text-sm font-display">No role badges yet. Upload a sprite sheet above.</p>
      ) : (
        <div className="space-y-3">
          {badges.map(badge => (
            <div key={badge.id} className="bg-piu-card border border-piu-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <img src={badge.image} alt={badge.name} className="w-8 h-8 object-contain" />
                  {editingBadge === badge.id ? (
                    <BadgeRenameInline badge={badge} onSave={handleRename} onCancel={() => setEditingBadge(null)} />
                  ) : (
                    <>
                      <span className="font-display font-bold text-sm">{badge.name}</span>
                      <button onClick={() => setEditingBadge(badge.id)} className="text-[10px] text-gray-500 hover:text-gray-300">Edit</button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAssigningBadge(assigningBadge === badge.id ? null : badge.id)}
                    className="text-[10px] font-display text-piu-accent hover:underline"
                  >
                    {assigningBadge === badge.id ? 'Close' : 'Assign'}
                  </button>
                  <button onClick={() => handleDelete(badge.id)} className="text-[10px] text-red-400 hover:underline">Delete</button>
                </div>
              </div>

              {/* Badge assignment panel */}
              {assigningBadge === badge.id && (
                <div className="mt-3 pt-3 border-t border-piu-border/30">
                  <p className="text-[10px] text-gray-500 mb-2">Click to assign/remove this badge from members:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map(member => {
                      const hasBadge = member.badges?.some(b => b.id === badge.id);
                      return (
                        <button
                          key={member.id}
                          onClick={() => hasBadge ? handleUnassign(badge.id, member.id) : handleAssign(badge.id, member.id)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-display transition-colors ${
                            hasBadge ? 'bg-piu-accent/20 text-piu-accent border border-piu-accent/30' : 'bg-piu-dark text-gray-400 border border-piu-border hover:border-gray-500'
                          }`}
                        >
                          {member.avatar ? (
                            <img src={member.avatar.startsWith('data:') ? member.avatar : getAvatarUrl(member.avatar)} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center text-[6px] font-bold">{member.username[0]?.toUpperCase()}</div>
                          )}
                          {member.username}
                          {hasBadge && <span className="ml-0.5">x</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BadgeRenameInline({ badge, onSave, onCancel }) {
  const [name, setName] = useState(badge.name);
  return (
    <div className="flex items-center gap-2">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="bg-piu-dark border border-piu-border rounded px-2 py-1 text-xs text-white w-28 focus:outline-none focus:border-piu-accent" maxLength={30} autoFocus />
      <button onClick={() => onSave({ ...badge, name })} className="text-[10px] text-green-400 font-display font-bold">Save</button>
      <button onClick={onCancel} className="text-[10px] text-gray-500">Cancel</button>
    </div>
  );
}

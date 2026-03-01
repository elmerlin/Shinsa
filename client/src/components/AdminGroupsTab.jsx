import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAvatarUrl } from './AvatarPicker';
import MarkdownContent from './MarkdownContent';
import {
  addAdminGroupMember,
  assignAdminGroupBadgeToAll,
  assignAdminGroupBadgeToUser,
  createAdminGroup,
  createAdminGroupBadge,
  deleteAdminGroup,
  deleteAdminGroupBadge,
  getAdminFeatures,
  getAdminGroupBadges,
  getAdminGroupMembers,
  getAdminGroupPermissions,
  getAdminGroups,
  moveAdminGroupMember,
  notifyAdminGroup,
  pushAdminGroupPopup,
  removeAdminGroupBadgeFromAll,
  removeAdminGroupBadgeFromUser,
  removeAdminGroupMember,
  searchUsers,
  setAdminGroupPermission,
  updateAdminGroup,
  updateAdminGroupBadge,
} from '../utils/api';

function normalizeSlides(slides) {
  const out = [];
  for (const raw of (Array.isArray(slides) ? slides : [])) {
    const title = String(raw?.title || '').trim();
    const content = String(raw?.content || '').trim();
    if (!title && !content) continue;
    out.push({ title, content });
  }
  return out;
}

export default function AdminGroupsTab() {
  const [features, setFeatures] = useState([
    { key: 'optimise', label: 'Optimise' },
    { key: 'checkin', label: 'Check In' },
  ]);

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [groupsMessage, setGroupsMessage] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const [groupSaving, setGroupSaving] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState('');
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [moveTargets, setMoveTargets] = useState({});
  const memberSearchRef = useRef(null);

  const [permissionMap, setPermissionMap] = useState({});
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [permissionMessage, setPermissionMessage] = useState('');

  const [notifyForm, setNotifyForm] = useState({ title: '', message: '', link: '' });
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyError, setNotifyError] = useState('');

  const [popupTitle, setPopupTitle] = useState('');
  const [popupSlides, setPopupSlides] = useState([{ title: '', content: '' }]);
  const [popupSaving, setPopupSaving] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [popupError, setPopupError] = useState('');
  const slideContentRefs = useRef({});

  const [badges, setBadges] = useState([]);
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [badgeSaving, setBadgeSaving] = useState(false);
  const [badgeError, setBadgeError] = useState('');
  const [badgeMessage, setBadgeMessage] = useState('');
  const [badgeEditingId, setBadgeEditingId] = useState('');
  const [badgeImageInputKey, setBadgeImageInputKey] = useState(0);
  const [badgeForm, setBadgeForm] = useState({ name: '', description: '', imageFile: null });
  const [selectedBadgeId, setSelectedBadgeId] = useState('');
  const [selectedBadgeUserId, setSelectedBadgeUserId] = useState('');

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  const memberIdSet = useMemo(() => new Set(members.map((entry) => entry.id)), [members]);
  const selectedBadge = useMemo(
    () => badges.find((badge) => badge.id === selectedBadgeId) || null,
    [badges, selectedBadgeId]
  );
  const selectedBadgeHasUser = useMemo(
    () => !!(selectedBadge && selectedBadgeUserId && Array.isArray(selectedBadge.assigned_user_ids) && selectedBadge.assigned_user_ids.includes(selectedBadgeUserId)),
    [selectedBadge, selectedBadgeUserId]
  );

  const loadGroups = async ({ keepSelection = true } = {}) => {
    setGroupsLoading(true);
    setGroupsError('');
    try {
      const payload = await getAdminGroups();
      const nextGroups = Array.isArray(payload?.groups) ? payload.groups : [];
      setGroups(nextGroups);

      if (!nextGroups.length) {
        setSelectedGroupId('');
        return;
      }

      if (keepSelection && selectedGroupId && nextGroups.some((group) => group.id === selectedGroupId)) {
        return;
      }
      setSelectedGroupId(nextGroups[0].id);
    } catch (err) {
      setGroupsError(err?.message || 'Failed to load groups');
      setGroups([]);
      setSelectedGroupId('');
    } finally {
      setGroupsLoading(false);
    }
  };

  const loadSelectedGroupData = async (groupId) => {
    if (!groupId) {
      setMembers([]);
      setPermissionMap({});
      setBadges([]);
      return;
    }

    setMembersLoading(true);
    setBadgesLoading(true);
    setMembersError('');
    setPermissionError('');
    try {
      const [memberPayload, permissionPayload, badgePayload] = await Promise.all([
        getAdminGroupMembers(groupId),
        getAdminGroupPermissions(groupId),
        getAdminGroupBadges(groupId),
      ]);

      setMembers(Array.isArray(memberPayload?.members) ? memberPayload.members : []);
      const featureRows = Array.isArray(permissionPayload?.features) ? permissionPayload.features : [];
      const nextPermissionMap = {};
      for (const feature of featureRows) {
        nextPermissionMap[feature.key] = !!feature.enabled;
      }
      setPermissionMap(nextPermissionMap);
      setBadges(Array.isArray(badgePayload?.badges) ? badgePayload.badges : []);
    } catch (err) {
      const msg = err?.message || 'Failed to load group details';
      setMembersError(msg);
      setPermissionError(msg);
      setBadgeError(msg);
      setMembers([]);
      setPermissionMap({});
      setBadges([]);
    } finally {
      setMembersLoading(false);
      setBadgesLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const featurePayload = await getAdminFeatures();
        if (!active) return;
        const nextFeatures = Array.isArray(featurePayload?.features) && featurePayload.features.length > 0
          ? featurePayload.features
          : [{ key: 'optimise', label: 'Optimise' }, { key: 'checkin', label: 'Check In' }];
        setFeatures(nextFeatures);
      } catch {
        if (!active) return;
        setFeatures([{ key: 'optimise', label: 'Optimise' }, { key: 'checkin', label: 'Check In' }]);
      }
    })();
    loadGroups({ keepSelection: true });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    loadSelectedGroupData(selectedGroupId);
    setMoveTargets({});
    setMemberSearchQuery('');
    setMemberSuggestions([]);
    setMemberSearchOpen(false);
    setSelectedBadgeUserId('');
    setSelectedBadgeId('');
    setNotifyMessage('');
    setNotifyError('');
    setPopupMessage('');
    setPopupError('');
    setBadgeError('');
    setBadgeMessage('');
  }, [selectedGroupId]);

  useEffect(() => {
    const query = memberSearchQuery.trim();
    if (!selectedGroupId || query.length < 2) {
      setMemberSuggestions([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const users = await searchUsers(query);
        if (cancelled) return;
        const list = Array.isArray(users) ? users : [];
        setMemberSuggestions(list.filter((entry) => !memberIdSet.has(entry.id)));
      } catch {
        if (!cancelled) setMemberSuggestions([]);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [memberSearchQuery, memberIdSet, selectedGroupId]);

  useEffect(() => {
    function handleDocClick(event) {
      if (!memberSearchRef.current) return;
      if (!memberSearchRef.current.contains(event.target)) {
        setMemberSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  const resetGroupForm = () => {
    setEditingGroupId('');
    setGroupForm({ name: '', description: '' });
  };

  const handleSaveGroup = async (event) => {
    event.preventDefault();
    if (groupSaving) return;

    setGroupSaving(true);
    setGroupsError('');
    setGroupsMessage('');
    try {
      const payload = {
        name: String(groupForm.name || '').trim(),
        description: String(groupForm.description || '').trim(),
      };

      let saved = null;
      if (editingGroupId) {
        saved = await updateAdminGroup(editingGroupId, payload);
        setGroupsMessage(`Updated group "${saved?.name || payload.name}".`);
      } else {
        saved = await createAdminGroup(payload);
        setGroupsMessage(`Created group "${saved?.name || payload.name}".`);
      }

      await loadGroups({ keepSelection: false });
      if (saved?.id) setSelectedGroupId(saved.id);
      resetGroupForm();
    } catch (err) {
      setGroupsError(err?.message || 'Failed to save group');
    } finally {
      setGroupSaving(false);
    }
  };

  const handleEditGroup = (group) => {
    setEditingGroupId(group.id);
    setGroupForm({
      name: group.name || '',
      description: group.description || '',
    });
  };

  const handleDeleteGroup = async (group) => {
    if (!group?.id) return;
    if (!confirm(`Delete group "${group.name}"?`)) return;
    setGroupsError('');
    setGroupsMessage('');
    try {
      await deleteAdminGroup(group.id);
      setGroupsMessage(`Deleted group "${group.name}".`);
      await loadGroups({ keepSelection: false });
    } catch (err) {
      setGroupsError(err?.message || 'Failed to delete group');
    }
  };

  const handleAddMember = async (entry) => {
    if (!selectedGroupId || !entry?.id || memberSaving) return;
    setMemberSaving(true);
    setMembersError('');
    try {
      await addAdminGroupMember(selectedGroupId, entry.id);
      setMemberSearchQuery('');
      setMemberSuggestions([]);
      setMemberSearchOpen(false);
      await loadSelectedGroupData(selectedGroupId);
      await loadGroups();
    } catch (err) {
      setMembersError(err?.message || 'Failed to add member');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (entry) => {
    if (!selectedGroupId || !entry?.id || memberSaving) return;
    if (!confirm(`Remove @${entry.username} from this group?`)) return;
    setMemberSaving(true);
    setMembersError('');
    try {
      await removeAdminGroupMember(selectedGroupId, entry.id);
      await loadSelectedGroupData(selectedGroupId);
      await loadGroups();
    } catch (err) {
      setMembersError(err?.message || 'Failed to remove member');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleMoveMember = async (entry) => {
    if (!selectedGroupId || !entry?.id || memberSaving) return;
    const targetGroupId = String(moveTargets[entry.id] || '').trim();
    if (!targetGroupId) return;
    setMemberSaving(true);
    setMembersError('');
    try {
      await moveAdminGroupMember(selectedGroupId, entry.id, targetGroupId);
      setMoveTargets((prev) => ({ ...prev, [entry.id]: '' }));
      await loadSelectedGroupData(selectedGroupId);
      await loadGroups();
    } catch (err) {
      setMembersError(err?.message || 'Failed to move member');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleTogglePermission = async (featureKey, enabled) => {
    if (!selectedGroupId || permissionSaving) return;
    setPermissionSaving(true);
    setPermissionError('');
    setPermissionMessage('');
    try {
      await setAdminGroupPermission(selectedGroupId, featureKey, enabled);
      setPermissionMap((prev) => ({ ...prev, [featureKey]: !!enabled }));
      setPermissionMessage(`${enabled ? 'Granted' : 'Removed'} ${featureKey} for this group.`);
      await loadGroups();
    } catch (err) {
      setPermissionError(err?.message || 'Failed to update permission');
    } finally {
      setPermissionSaving(false);
    }
  };

  const handleSendNotification = async (event) => {
    event.preventDefault();
    if (!selectedGroupId || notifySaving) return;
    setNotifySaving(true);
    setNotifyError('');
    setNotifyMessage('');
    try {
      const payload = await notifyAdminGroup(selectedGroupId, notifyForm);
      setNotifyMessage(`Sent notification to ${payload?.notified_count || 0} group member(s).`);
      setNotifyForm({ title: '', message: '', link: '' });
    } catch (err) {
      setNotifyError(err?.message || 'Failed to send notification');
    } finally {
      setNotifySaving(false);
    }
  };

  const applySlideInlineFormat = (index, prefix, suffix = prefix, placeholder = 'text') => {
    const input = slideContentRefs.current[index];
    if (!input) return;

    const slides = [...popupSlides];
    const current = String(slides[index]?.content || '');
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const selected = current.slice(start, end);
    const useText = selected || placeholder;
    const replacement = `${prefix}${useText}${suffix}`;
    const updated = `${current.slice(0, start)}${replacement}${current.slice(end)}`;
    slides[index] = { ...slides[index], content: updated };
    setPopupSlides(slides);

    window.requestAnimationFrame(() => {
      const ref = slideContentRefs.current[index];
      if (!ref) return;
      ref.focus();
      ref.setSelectionRange(start + prefix.length, start + prefix.length + useText.length);
    });
  };

  const applySlideLineFormat = (index, mode) => {
    const input = slideContentRefs.current[index];
    if (!input) return;

    const slides = [...popupSlides];
    const current = String(slides[index]?.content || '');
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const blockStart = current.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextBreak = current.indexOf('\n', end);
    const blockEnd = nextBreak === -1 ? current.length : nextBreak;
    const selectedBlock = current.slice(blockStart, blockEnd);
    const lines = selectedBlock.split('\n');

    let transformed = lines;
    if (mode === 'bullet') {
      transformed = lines.map((line) => (line.trim() ? `- ${line.replace(/^\s*([-*]|\d+\.)\s+/, '')}` : line));
    } else if (mode === 'number') {
      transformed = lines.map((line, idx) => (line.trim() ? `${idx + 1}. ${line.replace(/^\s*([-*]|\d+\.)\s+/, '')}` : line));
    } else if (mode === 'heading') {
      transformed = lines.map((line) => (line.trim() ? `## ${line.replace(/^\s*#{1,3}\s+/, '')}` : line));
    } else if (mode === 'quote') {
      transformed = lines.map((line) => (line.trim() ? `> ${line.replace(/^\s*>\s?/, '')}` : line));
    }

    const replacement = transformed.join('\n');
    const updated = `${current.slice(0, blockStart)}${replacement}${current.slice(blockEnd)}`;
    slides[index] = { ...slides[index], content: updated };
    setPopupSlides(slides);

    window.requestAnimationFrame(() => {
      const ref = slideContentRefs.current[index];
      if (!ref) return;
      ref.focus();
      ref.setSelectionRange(blockStart, blockStart + replacement.length);
    });
  };

  const handlePushPopup = async (event) => {
    event.preventDefault();
    if (!selectedGroupId || popupSaving) return;
    setPopupSaving(true);
    setPopupError('');
    setPopupMessage('');
    try {
      const slides = normalizeSlides(popupSlides);
      if (!slides.length) {
        setPopupError('Add at least one slide with title or content.');
        return;
      }
      const payload = await pushAdminGroupPopup(selectedGroupId, {
        title: popupTitle,
        slides,
      });
      setPopupMessage(`Queued popup for ${payload?.recipient_count || 0} recipient(s).`);
      setPopupTitle('');
      setPopupSlides([{ title: '', content: '' }]);
    } catch (err) {
      setPopupError(err?.message || 'Failed to push popup');
    } finally {
      setPopupSaving(false);
    }
  };

  const resetBadgeForm = () => {
    setBadgeEditingId('');
    setBadgeForm({ name: '', description: '', imageFile: null });
    setBadgeImageInputKey((prev) => prev + 1);
  };

  const handleSaveBadge = async (event) => {
    event.preventDefault();
    if (!selectedGroupId || badgeSaving) return;
    setBadgeSaving(true);
    setBadgeError('');
    setBadgeMessage('');
    try {
      const payload = {
        name: badgeForm.name,
        description: badgeForm.description,
        imageFile: badgeForm.imageFile || null,
      };
      if (badgeEditingId) {
        await updateAdminGroupBadge(selectedGroupId, badgeEditingId, payload);
        setBadgeMessage('Badge updated.');
      } else {
        await createAdminGroupBadge(selectedGroupId, payload);
        setBadgeMessage('Badge created.');
      }
      resetBadgeForm();
      const refreshed = await getAdminGroupBadges(selectedGroupId);
      setBadges(Array.isArray(refreshed?.badges) ? refreshed.badges : []);
      await loadGroups();
    } catch (err) {
      setBadgeError(err?.message || 'Failed to save badge');
    } finally {
      setBadgeSaving(false);
    }
  };

  const handleEditBadge = (badge) => {
    setBadgeEditingId(badge.id);
    setBadgeForm({
      name: badge.name || '',
      description: badge.description || '',
      imageFile: null,
    });
    setBadgeImageInputKey((prev) => prev + 1);
  };

  const handleDeleteBadge = async (badge) => {
    if (!selectedGroupId || !badge?.id || badgeSaving) return;
    if (!confirm(`Delete badge "${badge.name}"?`)) return;
    setBadgeSaving(true);
    setBadgeError('');
    setBadgeMessage('');
    try {
      await deleteAdminGroupBadge(selectedGroupId, badge.id);
      const refreshed = await getAdminGroupBadges(selectedGroupId);
      setBadges(Array.isArray(refreshed?.badges) ? refreshed.badges : []);
      setBadgeMessage('Badge deleted.');
      await loadGroups();
    } catch (err) {
      setBadgeError(err?.message || 'Failed to delete badge');
    } finally {
      setBadgeSaving(false);
    }
  };

  const handleToggleAssignAll = async (badge) => {
    if (!selectedGroupId || !badge?.id || badgeSaving) return;
    setBadgeSaving(true);
    setBadgeError('');
    setBadgeMessage('');
    try {
      if (badge.group_assigned) {
        await removeAdminGroupBadgeFromAll(selectedGroupId, badge.id);
        setBadgeMessage(`Removed "${badge.name}" from whole group assignment.`);
      } else {
        await assignAdminGroupBadgeToAll(selectedGroupId, badge.id);
        setBadgeMessage(`Assigned "${badge.name}" to the whole group.`);
      }
      const refreshed = await getAdminGroupBadges(selectedGroupId);
      setBadges(Array.isArray(refreshed?.badges) ? refreshed.badges : []);
    } catch (err) {
      setBadgeError(err?.message || 'Failed to update group badge assignment');
    } finally {
      setBadgeSaving(false);
    }
  };

  const handleAssignSelectedBadgeUser = async () => {
    if (!selectedGroupId || !selectedBadgeId || !selectedBadgeUserId || badgeSaving) return;
    setBadgeSaving(true);
    setBadgeError('');
    setBadgeMessage('');
    try {
      if (selectedBadgeHasUser) {
        await removeAdminGroupBadgeFromUser(selectedGroupId, selectedBadgeId, selectedBadgeUserId);
        setBadgeMessage('Removed individual badge assignment.');
      } else {
        await assignAdminGroupBadgeToUser(selectedGroupId, selectedBadgeId, selectedBadgeUserId);
        setBadgeMessage('Assigned badge to selected member.');
      }
      const refreshed = await getAdminGroupBadges(selectedGroupId);
      setBadges(Array.isArray(refreshed?.badges) ? refreshed.badges : []);
    } catch (err) {
      setBadgeError(err?.message || 'Failed to update individual badge assignment');
    } finally {
      setBadgeSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
      <div className="space-y-4">
        <form onSubmit={handleSaveGroup} className="card space-y-3">
          <h3 className="font-display font-bold text-piu-accent">
            {editingGroupId ? 'Edit Group' : 'Create Group'}
          </h3>
          <label className="block">
            <span className="text-xs text-gray-400">Group Name</span>
            <input
              type="text"
              className="input-field mt-1"
              value={groupForm.name}
              onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={80}
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400">Description</span>
            <textarea
              className="input-field mt-1 min-h-[80px] resize-y"
              value={groupForm.description}
              onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={300}
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn-primary text-sm" disabled={groupSaving}>
              {groupSaving ? 'Saving...' : editingGroupId ? 'Save Group' : 'Create Group'}
            </button>
            {editingGroupId && (
              <button type="button" className="btn-secondary text-sm" onClick={resetGroupForm}>
                Cancel
              </button>
            )}
          </div>
          {groupsError && <p className="text-xs text-red-400">{groupsError}</p>}
          {groupsMessage && <p className="text-xs text-piu-green">{groupsMessage}</p>}
        </form>

        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-bold text-piu-accent">Groups</h3>
            <button
              type="button"
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={() => loadGroups({ keepSelection: true })}
              disabled={groupsLoading}
            >
              {groupsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No groups yet.</p>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => {
                const active = group.id === selectedGroupId;
                return (
                  <div
                    key={group.id}
                    className={`rounded-xl border px-3 py-2 ${active ? 'border-piu-accent/70 bg-piu-accent/10' : 'border-piu-border/50 bg-piu-dark/35'}`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedGroupId(group.id)}
                    >
                      <p className="text-sm font-display font-bold">{group.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {group.member_count || 0} member(s) • {group.badge_count || 0} badge(s)
                      </p>
                    </button>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded text-[11px] font-display font-bold text-gray-300 border border-piu-border/60 bg-piu-dark hover:text-white"
                        onClick={() => handleEditGroup(group)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200"
                        onClick={() => handleDeleteGroup(group)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 min-w-0">
        {!selectedGroup ? (
          <div className="card text-center">
            <p className="text-sm text-gray-500">Create or select a group to manage members, permissions, badges, notifications, and popups.</p>
          </div>
        ) : (
          <>
            <div className="card">
              <h3 className="font-display font-bold text-piu-accent">
                {selectedGroup.name}
              </h3>
              {selectedGroup.description ? (
                <p className="text-sm text-gray-400 mt-1">{selectedGroup.description}</p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">No description set.</p>
              )}
            </div>

            <div className="card space-y-3">
              <h4 className="font-display font-bold text-gray-200">Group Feature Permissions</h4>
              <p className="text-xs text-gray-500">Users in this group inherit these feature permissions.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {features.map((feature) => {
                  const enabled = !!permissionMap[feature.key];
                  return (
                    <label key={feature.key} className="rounded-lg border border-piu-border/50 px-3 py-2 bg-piu-dark/35 flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm font-display font-bold">{feature.label}</span>
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={enabled}
                        disabled={permissionSaving}
                        onChange={(e) => handleTogglePermission(feature.key, e.target.checked)}
                      />
                    </label>
                  );
                })}
              </div>
              {permissionError && <p className="text-xs text-red-400">{permissionError}</p>}
              {permissionMessage && <p className="text-xs text-piu-green">{permissionMessage}</p>}
            </div>

            <div className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-display font-bold text-gray-200">Members ({members.length})</h4>
                <button
                  type="button"
                  className="btn-secondary text-xs px-3 py-1.5"
                  onClick={() => loadSelectedGroupData(selectedGroupId)}
                  disabled={membersLoading}
                >
                  {membersLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div ref={memberSearchRef} className="relative">
                <input
                  type="text"
                  className="input-field"
                  value={memberSearchQuery}
                  onFocus={() => setMemberSearchOpen(true)}
                  onChange={(e) => {
                    setMemberSearchQuery(e.target.value);
                    setMemberSearchOpen(true);
                  }}
                  placeholder="Search users to add..."
                  disabled={memberSaving}
                />
                {memberSearchOpen && memberSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                    {memberSuggestions.map((entry) => (
                      <div key={entry.id} className="px-3 py-2 border-b border-piu-border/20 last:border-0 flex items-center gap-2">
                        {entry.avatar ? (
                          <img src={getAvatarUrl(entry.avatar)} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
                            {(entry.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-display font-bold truncate">{entry.username}</p>
                        </div>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[11px] font-display font-bold bg-piu-accent text-white disabled:opacity-50"
                          onClick={() => handleAddMember(entry)}
                          disabled={memberSaving}
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {membersError && <p className="text-xs text-red-400">{membersError}</p>}
              {members.length === 0 ? (
                <p className="text-xs text-gray-500 py-2">No members in this group.</p>
              ) : (
                <div className="space-y-2">
                  {members.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-piu-border/50 bg-piu-dark/35 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {entry.avatar ? (
                          <img src={getAvatarUrl(entry.avatar)} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
                            {(entry.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-display font-bold truncate">{entry.username}</p>
                          <p className="text-[10px] text-gray-500">
                            Joined {entry.joined_at ? new Date(entry.joined_at).toLocaleString() : '-'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                        <select
                          className="input-field text-xs"
                          value={moveTargets[entry.id] || ''}
                          onChange={(e) => setMoveTargets((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                          disabled={memberSaving}
                        >
                          <option value="">Move to group...</option>
                          {groups
                            .filter((group) => group.id !== selectedGroupId)
                            .map((group) => (
                              <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[11px] font-display font-bold text-cyan-200 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50"
                          onClick={() => handleMoveMember(entry)}
                          disabled={memberSaving || !moveTargets[entry.id]}
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200 disabled:opacity-50"
                          onClick={() => handleRemoveMember(entry)}
                          disabled={memberSaving}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSendNotification} className="card space-y-3">
              <h4 className="font-display font-bold text-gray-200">Notify Group Members</h4>
              <input
                type="text"
                className="input-field"
                placeholder="Notification title"
                value={notifyForm.title}
                onChange={(e) => setNotifyForm((prev) => ({ ...prev, title: e.target.value }))}
                maxLength={90}
                required
              />
              <textarea
                className="input-field min-h-[90px] resize-y"
                placeholder="Message"
                value={notifyForm.message}
                onChange={(e) => setNotifyForm((prev) => ({ ...prev, message: e.target.value }))}
                maxLength={260}
                required
              />
              <input
                type="text"
                className="input-field"
                placeholder="Optional link, e.g. /changelog"
                value={notifyForm.link}
                onChange={(e) => setNotifyForm((prev) => ({ ...prev, link: e.target.value }))}
              />
              <button type="submit" className="btn-primary text-sm" disabled={notifySaving}>
                {notifySaving ? 'Sending...' : 'Send Notification'}
              </button>
              {notifyError && <p className="text-xs text-red-400">{notifyError}</p>}
              {notifyMessage && <p className="text-xs text-piu-green">{notifyMessage}</p>}
            </form>

            <form onSubmit={handlePushPopup} className="card space-y-3">
              <h4 className="font-display font-bold text-gray-200">One-Time Login Popup</h4>
              <p className="text-xs text-gray-500">
                Push a one-time carousel modal to this group. Slides support Markdown formatting.
              </p>
              <input
                type="text"
                className="input-field"
                placeholder="Popup title"
                value={popupTitle}
                onChange={(e) => setPopupTitle(e.target.value)}
                maxLength={120}
              />
              <div className="space-y-3">
                {popupSlides.map((slide, idx) => (
                  <div key={`slide-${idx}`} className="rounded-xl border border-piu-border/50 bg-piu-dark/35 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-display font-bold text-gray-300">Slide {idx + 1}</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[10px] border border-piu-border text-gray-300 hover:text-white"
                          onClick={() => setPopupSlides((prev) => prev.map((row, i) => (i === idx ? { ...row, content: `## ${row.content || ''}`.trim() } : row)))}
                        >
                          H2
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[10px] border border-piu-border text-gray-300 hover:text-white"
                          onClick={() => applySlideInlineFormat(idx, '**', '**', 'bold')}
                        >
                          Bold
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[10px] border border-piu-border text-gray-300 hover:text-white"
                          onClick={() => applySlideInlineFormat(idx, '*', '*', 'italic')}
                        >
                          Italic
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[10px] border border-piu-border text-gray-300 hover:text-white"
                          onClick={() => applySlideLineFormat(idx, 'bullet')}
                        >
                          List
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[10px] border border-piu-border text-gray-300 hover:text-white"
                          onClick={() => applySlideLineFormat(idx, 'quote')}
                        >
                          Quote
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[10px] border border-piu-border text-gray-300 hover:text-white"
                          onClick={() => setPopupSlides((prev) => prev.filter((_, i) => i !== idx))}
                          disabled={popupSlides.length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Slide heading"
                      value={slide.title}
                      onChange={(e) => setPopupSlides((prev) => prev.map((row, i) => (i === idx ? { ...row, title: e.target.value } : row)))}
                      maxLength={120}
                    />
                    <textarea
                      ref={(node) => { slideContentRefs.current[idx] = node; }}
                      className="input-field min-h-[90px] resize-y"
                      placeholder="Slide content (Markdown supported)"
                      value={slide.content}
                      onChange={(e) => setPopupSlides((prev) => prev.map((row, i) => (i === idx ? { ...row, content: e.target.value } : row)))}
                      maxLength={4000}
                    />
                    <div className="rounded-lg border border-piu-border/40 bg-piu-dark/25 p-2">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide font-display">Preview</p>
                      {(slide.title || slide.content) ? (
                        <div className="mt-2">
                          {slide.title && <p className="text-sm font-display font-bold text-piu-accent mb-1">{slide.title}</p>}
                          {slide.content ? <MarkdownContent text={slide.content} compact /> : null}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">Add title/content to preview this slide.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => setPopupSlides((prev) => [...prev, { title: '', content: '' }])}
                >
                  Add Slide
                </button>
                <button type="submit" className="btn-primary text-sm" disabled={popupSaving}>
                  {popupSaving ? 'Pushing...' : 'Push Popup'}
                </button>
              </div>
              {popupError && <p className="text-xs text-red-400">{popupError}</p>}
              {popupMessage && <p className="text-xs text-piu-green">{popupMessage}</p>}
            </form>

            <div className="card space-y-3">
              <form onSubmit={handleSaveBadge} className="space-y-3">
                <h4 className="font-display font-bold text-gray-200">
                  {badgeEditingId ? 'Edit Group Badge' : 'Create Group Badge'}
                </h4>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Badge name"
                  value={badgeForm.name}
                  onChange={(e) => setBadgeForm((prev) => ({ ...prev, name: e.target.value }))}
                  maxLength={64}
                  required
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Badge hover description"
                  value={badgeForm.description}
                  onChange={(e) => setBadgeForm((prev) => ({ ...prev, description: e.target.value }))}
                  maxLength={200}
                />
                <input
                  key={badgeImageInputKey}
                  type="file"
                  accept="image/*"
                  className="text-xs text-gray-400 file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border file:border-piu-border file:bg-piu-dark file:text-gray-300 file:cursor-pointer"
                  onChange={(e) => setBadgeForm((prev) => ({ ...prev, imageFile: e.target.files?.[0] || null }))}
                  required={!badgeEditingId}
                />
                <div className="flex items-center gap-2">
                  <button type="submit" className="btn-primary text-sm" disabled={badgeSaving}>
                    {badgeSaving ? 'Saving...' : badgeEditingId ? 'Save Badge' : 'Create Badge'}
                  </button>
                  {badgeEditingId && (
                    <button type="button" className="btn-secondary text-sm" onClick={resetBadgeForm}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {badgeError && <p className="text-xs text-red-400">{badgeError}</p>}
              {badgeMessage && <p className="text-xs text-piu-green">{badgeMessage}</p>}

              {badgesLoading ? (
                <p className="text-xs text-gray-500 py-2">Loading badges...</p>
              ) : badges.length === 0 ? (
                <p className="text-xs text-gray-500 py-2">No badges created for this group.</p>
              ) : (
                <div className="space-y-2">
                  {badges.map((badge) => (
                    <div key={badge.id} className="rounded-xl border border-piu-border/50 bg-piu-dark/35 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-piu-border/50 bg-piu-dark/60 overflow-hidden flex items-center justify-center shrink-0">
                          {badge.image ? (
                            <img src={badge.image} alt={badge.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[9px] text-gray-500">No image</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-display font-bold truncate">{badge.name}</p>
                          {badge.description ? <p className="text-[11px] text-gray-500 truncate">{badge.description}</p> : null}
                          <p className="text-[10px] text-gray-500">
                            {badge.group_assigned ? 'Assigned to whole group' : 'Not assigned to whole group'} • {(badge.assigned_user_ids || []).length} individual assignment(s)
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[11px] font-display font-bold text-gray-300 border border-piu-border/60 bg-piu-dark hover:text-white"
                          onClick={() => handleEditBadge(badge)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`px-2 py-1 rounded text-[11px] font-display font-bold border ${
                            badge.group_assigned
                              ? 'text-amber-200 border-amber-500/40 bg-amber-500/10'
                              : 'text-emerald-200 border-emerald-500/40 bg-emerald-500/10'
                          }`}
                          onClick={() => handleToggleAssignAll(badge)}
                        >
                          {badge.group_assigned ? 'Remove Group Assignment' : 'Assign to Whole Group'}
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200"
                          onClick={() => handleDeleteBadge(badge)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-piu-border/50 bg-piu-dark/35 p-3 space-y-2">
                <h5 className="font-display font-bold text-sm text-gray-200">Assign Badge to Individual Member</h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    className="input-field text-xs"
                    value={selectedBadgeId}
                    onChange={(e) => setSelectedBadgeId(e.target.value)}
                  >
                    <option value="">Select badge...</option>
                    {badges.map((badge) => (
                      <option key={badge.id} value={badge.id}>{badge.name}</option>
                    ))}
                  </select>
                  <select
                    className="input-field text-xs"
                    value={selectedBadgeUserId}
                    onChange={(e) => setSelectedBadgeUserId(e.target.value)}
                  >
                    <option value="">Select member...</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>{member.username}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded text-xs font-display font-bold ${
                      selectedBadgeHasUser
                        ? 'text-amber-200 border border-amber-500/40 bg-amber-500/10'
                        : 'text-emerald-200 border border-emerald-500/40 bg-emerald-500/10'
                    }`}
                    onClick={handleAssignSelectedBadgeUser}
                    disabled={!selectedBadgeId || !selectedBadgeUserId || badgeSaving}
                  >
                    {selectedBadgeHasUser ? 'Remove Assignment' : 'Assign Badge'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Individual assignments can be used in addition to whole-group assignments.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

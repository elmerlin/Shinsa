import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMessageSquadMember,
  getMessageSquad,
  removeMessageSquadMember,
  setMessageSquadMemberRole,
  updateMessageSquad,
  updateMessageSquadNotifications,
  setMessageConversationTheme,
  getSharedListsByConversation,
  joinSharedList,
} from '../utils/api';
import SharedListDetailModal from './SharedListDetailModal';
import ThemePicker from './ChatThemes';
import { parseYouTubeUrl } from '../utils/youtube';
import { parseGrade } from '../utils/grades';
import AvatarPicker, { getAvatarUrl } from './AvatarPicker';
import UserPickerDialog from './UserPickerDialog';

const EXTERNAL_URL_REGEX = /https?:\/\/[^\s<>()]+/ig;
const SHARE_KIND_LABELS = {
  upscore: 'Upscore',
  clear: 'Clear',
  score_snapshot: 'Score',
  chart_compare: 'Compare',
};
const TAB_OPTIONS = [
  { key: 'videos', label: 'Videos' },
  { key: 'shares', label: 'Scores/Clears' },
  { key: 'links', label: 'Off-app links' },
];
const SETTINGS_TABS = [
  { key: 'members', label: 'Members' },
  { key: 'lists', label: 'Lists' },
  { key: 'theme', label: 'Theme' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'activity', label: 'Activity' },
];

function getInitials(value) {
  const text = String(value || '').trim();
  if (!text) return 'SQ';
  const parts = text.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join('') || text.slice(0, 2).toUpperCase();
}

function getRoleLabel(role) {
  if (role === 'creator') return 'Creator';
  if (role === 'moderator') return 'Moderator';
  return 'Member';
}

function getRank(score) {
  const s = parseInt(score, 10) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

function getGradeColor(grade, score = 0) {
  const normalized = parseGrade(grade).normalized;
  if (normalized) {
    if (normalized.includes('SSS')) return 'text-sky-300';
    if (normalized.includes('SS')) return 'text-piu-gold';
    if (normalized.includes('S')) return 'text-amber-400';
    if (normalized.includes('AAA')) return 'text-piu-silver';
    if (normalized.includes('AA')) return 'text-piu-bronze';
    if (normalized === 'A+' || normalized === 'A') return 'text-amber-700';
  }
  return getRank(score).color;
}

function getModeBadgeClasses(mode) {
  if (String(mode || '').trim() === 'Single') {
    return 'border-red-300/60 bg-gradient-to-b from-red-500 to-red-800 text-white';
  }
  if (String(mode || '').trim() === 'Double') {
    return 'border-emerald-300/60 bg-gradient-to-b from-emerald-500 to-emerald-800 text-white';
  }
  return 'border-sky-300/50 bg-gradient-to-b from-sky-500 to-sky-800 text-white';
}

function getHostLabel(url) {
  try {
    return new URL(String(url || '')).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function getYouTubeThumbnailUrl(url) {
  const videoId = parseYouTubeUrl(url).videoId;
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}

function extractUrlsFromText(value) {
  return String(value || '').match(EXTERNAL_URL_REGEX) || [];
}

function sortNewestFirst(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(String(left?.createdAt || '').replace(' ', 'T')) || 0;
    const rightTime = Date.parse(String(right?.createdAt || '').replace(' ', 'T')) || 0;
    return rightTime - leftTime;
  });
}

function buildSquadResources(messages = []) {
  const videoItems = [];
  const shareItems = [];
  const linkItems = [];
  const seenVideoUrls = new Set();
  const seenLinkUrls = new Set();

  const registerUrl = (url, message, title = '', source = '') => {
    const trimmedUrl = String(url || '').trim();
    if (!trimmedUrl) return;

    const youtubeMeta = parseYouTubeUrl(trimmedUrl);
    if (youtubeMeta?.videoId) {
      if (seenVideoUrls.has(trimmedUrl)) return;
      seenVideoUrls.add(trimmedUrl);
      videoItems.push({
        url: trimmedUrl,
        title: String(title || '').trim() || youtubeMeta.videoId,
        subtitle: source || getHostLabel(trimmedUrl) || 'YouTube',
        thumbnailUrl: getYouTubeThumbnailUrl(trimmedUrl),
        createdAt: message?.created_at || '',
      });
      return;
    }

    if (seenLinkUrls.has(trimmedUrl)) return;
    seenLinkUrls.add(trimmedUrl);
    linkItems.push({
      url: trimmedUrl,
      title: String(title || '').trim() || trimmedUrl,
      subtitle: source || getHostLabel(trimmedUrl) || 'External link',
      createdAt: message?.created_at || '',
    });
  };

  for (const message of Array.isArray(messages) ? messages : []) {
    for (const url of extractUrlsFromText(message?.content)) {
      registerUrl(url, message, message?.content, message?.sender?.username || 'Shared in chat');
    }

    if (message?.message_type === 'session_share' && message?.share?.streamUrl) {
      registerUrl(
        message.share.streamUrl,
        message,
        message.share.sessionTitle || message.share.streamUrl,
        `${message?.sender?.username || 'Player'} shared a session`
      );
    }

    if (message?.message_type === 'link_share' && message?.link_share) {
      const linkShare = message.link_share;
      if (SHARE_KIND_LABELS[linkShare.kind]) {
        shareItems.push({
          id: message.id,
          kind: SHARE_KIND_LABELS[linkShare.kind],
          title: linkShare.title || linkShare.songTitle || 'Shared play',
          songTitle: linkShare.songTitle || linkShare.title || '',
          mode: String(linkShare.mode || '').trim(),
          level: parseInt(linkShare.level, 10) || 0,
          score: parseInt(linkShare.score, 10) || 0,
          grade: String(linkShare.grade || '').trim(),
          jacketUrl: String(linkShare.jacketUrl || '').trim(),
          senderName: message?.sender?.username || 'Player',
          createdAt: message?.created_at || '',
          linkTarget: {
            path: linkShare.path || '',
            url: linkShare.url || '',
            title: linkShare.title || linkShare.songTitle || 'Shared play',
          },
        });
      }

      if (linkShare.url) {
        registerUrl(
          linkShare.url,
          message,
          linkShare.title || linkShare.songTitle || linkShare.url,
          linkShare.subtitle || `${message?.sender?.username || 'Player'} shared a link`
        );
      }
    }
  }

  return {
    videos: sortNewestFirst(videoItems),
    shares: sortNewestFirst(shareItems),
    links: sortNewestFirst(linkItems),
  };
}

function ToggleRow({
  label,
  description,
  enabled,
  disabled = false,
  onToggle,
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-piu-border/60 bg-piu-dark/70 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-display font-black text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onToggle?.(!enabled)}
        disabled={disabled}
        className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border transition-colors ${
          enabled ? 'border-cyan-400/25 bg-cyan-500/12' : 'border-piu-border/60 bg-piu-card/70'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        aria-pressed={enabled}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-[0_6px_16px_rgba(0,0,0,0.24)] transition-transform ${
            enabled ? 'translate-x-8' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export default function SquadSettingsModal({
  open = false,
  conversation = null,
  messages = [],
  currentUserId = '',
  onClose,
  onConversationUpdated,
  onOpenLink,
}) {
  const [settingsTab, setSettingsTab] = useState('members');
  const [tab, setTab] = useState('videos');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [identityDraft, setIdentityDraft] = useState({ title: '', avatar: '' });
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [avatarDrawerOpen, setAvatarDrawerOpen] = useState(false);
  const titleInputRef = React.useRef(null);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);
  const [actingMemberId, setActingMemberId] = useState('');
  const [savingTheme, setSavingTheme] = useState(false);
  const [sharedLists, setSharedLists] = useState([]);
  const [loadingSharedLists, setLoadingSharedLists] = useState(false);
  const [sharedListDetailId, setSharedListDetailId] = useState(null);
  const [joiningListId, setJoiningListId] = useState(null);

  const conversationId = String(conversation?.id || '').trim();

  const applyPayload = useCallback((payload) => {
    setDetail(payload || null);
    setError('');
    if (payload?.conversation) {
      setIdentityDraft({
        title: String(payload.conversation.title || '').trim(),
        avatar: String(payload.conversation.avatar || '').trim(),
      });
      onConversationUpdated?.(payload.conversation);
    }
  }, [onConversationUpdated]);

  const loadDetail = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const payload = await getMessageSquad(conversationId);
      applyPayload(payload);
    } catch (err) {
      setError(err?.message || 'Failed to load squad settings.');
    } finally {
      setLoading(false);
    }
  }, [applyPayload, conversationId]);

  useEffect(() => {
    if (!open || !conversationId) return;
    setSettingsTab('members');
    setTab('videos');
    setError('');
    setPickerOpen(false);
    setEditingTitle(false);
    setAvatarDrawerOpen(false);
    loadDetail();
  }, [conversationId, loadDetail, open]);

  useEffect(() => {
    if (!open || !conversationId || settingsTab !== 'lists') return;
    setLoadingSharedLists(true);
    getSharedListsByConversation(conversationId)
      .then(res => setSharedLists(res?.sharedLists || []))
      .catch(() => setSharedLists([]))
      .finally(() => setLoadingSharedLists(false));
  }, [open, conversationId, settingsTab]);

  const handleJoinList = async (sharedListId) => {
    setJoiningListId(sharedListId);
    try {
      await joinSharedList(sharedListId);
      const res = await getSharedListsByConversation(conversationId);
      setSharedLists(res?.sharedLists || []);
    } catch { /* ignore */ }
    setJoiningListId(null);
  };

  const viewerMembership = detail?.viewer_membership || conversation?.squad || null;
  const viewerRole = String(viewerMembership?.role || viewerMembership?.viewer_role || conversation?.squad?.viewer_role || 'member').trim();
  const members = Array.isArray(detail?.members) ? detail.members : [];
  const resources = useMemo(() => buildSquadResources(messages), [messages]);
  const excludeUserIds = useMemo(
    () => [currentUserId, ...members.map((member) => member?.user?.id || member?.user_id)].filter(Boolean),
    [currentUserId, members]
  );
  const canEditIdentity = viewerRole === 'creator';
  const canManageMembers = viewerRole === 'creator' || viewerRole === 'moderator';

  if (!open || !conversationId) return null;

  const notificationsEnabled = detail?.viewer_membership?.notifications_enabled
    ?? conversation?.squad?.notifications?.enabled
    ?? true;
  const notifyMentions = detail?.viewer_membership?.notify_mentions
    ?? conversation?.squad?.notifications?.mentions
    ?? true;

  const isIdentityDirty = String(identityDraft.title || '').trim() !== String(detail?.conversation?.title || conversation?.title || '').trim()
    || String(identityDraft.avatar || '').trim() !== String(detail?.conversation?.avatar || conversation?.avatar || '').trim();

  const toggleNotifications = async (changes) => {
    setUpdatingNotifications(true);
    try {
      const payload = await updateMessageSquadNotifications(conversationId, changes);
      applyPayload(payload);
    } catch (err) {
      setError(err?.message || 'Failed to update notifications.');
    } finally {
      setUpdatingNotifications(false);
    }
  };

  const handleSaveIdentity = async () => {
    if (!canEditIdentity || savingIdentity || !isIdentityDirty) return;
    setSavingIdentity(true);
    try {
      const payload = await updateMessageSquad(conversationId, {
        title: String(identityDraft.title || '').trim(),
        avatar: identityDraft.avatar || '',
      });
      applyPayload(payload);
    } catch (err) {
      setError(err?.message || 'Failed to save squad details.');
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleThemeChange = async (themeKey) => {
    if (savingTheme) return;
    setSavingTheme(true);
    try {
      const payload = await setMessageConversationTheme(conversationId, themeKey);
      if (payload?.conversation) {
        onConversationUpdated?.(payload.conversation);
      }
    } catch (err) {
      setError(err?.message || 'Failed to update theme.');
    } finally {
      setSavingTheme(false);
    }
  };

  const handleAddMember = async (selectedUser) => {
    if (!selectedUser?.id) return;
    setActingMemberId(String(selectedUser.id));
    try {
      const payload = await addMessageSquadMember(conversationId, selectedUser.id);
      applyPayload(payload);
      setPickerOpen(false);
    } catch (err) {
      setError(err?.message || 'Failed to add player.');
    } finally {
      setActingMemberId('');
    }
  };

  const handleRoleToggle = async (member) => {
    const userId = String(member?.user?.id || member?.user_id || '').trim();
    if (!userId || viewerRole !== 'creator' || member?.role === 'creator') return;
    setActingMemberId(userId);
    try {
      const nextRole = member?.role === 'moderator' ? 'member' : 'moderator';
      const payload = await setMessageSquadMemberRole(conversationId, userId, nextRole);
      applyPayload(payload);
    } catch (err) {
      setError(err?.message || 'Failed to update role.');
    } finally {
      setActingMemberId('');
    }
  };

  const handleRemoveMember = async (member) => {
    const userId = String(member?.user?.id || member?.user_id || '').trim();
    if (!userId) return;
    setActingMemberId(userId);
    try {
      const payload = await removeMessageSquadMember(conversationId, userId);
      applyPayload(payload);
    } catch (err) {
      setError(err?.message || 'Failed to remove player.');
    } finally {
      setActingMemberId('');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[155] flex items-center justify-center bg-black/84 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
        <div
          className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.35rem] border border-piu-border/60 bg-piu-card/95 shadow-[0_24px_72px_rgba(0,0,0,0.44)] sm:max-h-[calc(100dvh-2rem)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-3 border-b border-piu-border/50 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => canEditIdentity ? setAvatarDrawerOpen(true) : undefined}
              className={`relative shrink-0 ${canEditIdentity ? 'cursor-pointer group' : ''}`}
            >
              {(identityDraft.avatar || conversation?.avatar) ? (
                <img
                  src={getAvatarUrl(identityDraft.avatar || conversation?.avatar)}
                  alt=""
                  className="h-12 w-12 rounded-[0.85rem] object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
                  {getInitials(identityDraft.title || conversation?.title)}
                </div>
              )}
              {canEditIdentity ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-[0.85rem] bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-white">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                  </svg>
                </div>
              ) : null}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-gray-400">Squad settings</p>
              {editingTitle && canEditIdentity ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={identityDraft.title}
                  onChange={(event) => setIdentityDraft((prev) => ({ ...prev, title: event.target.value }))}
                  onBlur={() => {
                    setEditingTitle(false);
                    if (isIdentityDirty) handleSaveIdentity();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.target.blur();
                    }
                  }}
                  maxLength={60}
                  autoFocus
                  className="mt-0.5 w-full truncate rounded-lg border border-cyan-400/30 bg-piu-dark/80 px-2 py-1 text-lg font-display font-black text-white focus:outline-none"
                />
              ) : (
                <h2
                  className={`mt-0.5 truncate text-lg font-display font-black text-white ${canEditIdentity ? 'cursor-pointer rounded-lg px-2 py-1 transition-colors hover:bg-white/5' : ''}`}
                  onClick={() => {
                    if (!canEditIdentity) return;
                    setEditingTitle(true);
                    window.requestAnimationFrame(() => titleInputRef.current?.focus());
                  }}
                >
                  {identityDraft.title || conversation?.title || 'Squad'}
                  {savingIdentity ? <span className="ml-2 text-xs font-normal text-gray-400">saving...</span> : null}
                </h2>
              )}
              <p className="mt-0.5 text-xs text-gray-400">
                {members.length || conversation?.member_count || 0} members
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-piu-border/60 bg-piu-dark/70 text-gray-300 transition-colors hover:border-cyan-400/30 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-1 border-b border-piu-border/50 px-4">
            {SETTINGS_TABS.map((sTab) => (
              <button
                key={sTab.key}
                type="button"
                onClick={() => setSettingsTab(sTab.key)}
                className={`px-3 py-2.5 text-xs font-display font-black transition-colors ${
                  settingsTab === sTab.key
                    ? 'border-b-2 border-cyan-400 text-cyan-100'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {sTab.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
            {loading ? (
              <div className="rounded-xl border border-piu-border/60 bg-piu-dark/55 px-4 py-8 text-center text-sm text-gray-400">
                Loading squad settings...
              </div>
            ) : settingsTab === 'members' ? (
              <div className="space-y-3">
                <section className="rounded-xl border border-piu-border/60 bg-piu-dark/55 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-display font-black text-white">Members</p>
                      <p className="mt-0.5 text-xs leading-5 text-gray-400">
                        Moderators can add or kick players. Only the creator can promote moderators.
                      </p>
                    </div>
                    {canManageMembers ? (
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="shrink-0 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-display font-black text-cyan-100 transition-colors hover:border-cyan-400/40 hover:text-white"
                      >
                        Add player
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-2">
                    {members.map((member) => {
                      const memberUserId = String(member?.user?.id || member?.user_id || '').trim();
                      const canToggleRole = viewerRole === 'creator' && member?.role !== 'creator';
                      const canKick = memberUserId !== String(currentUserId || '').trim()
                        && (
                          viewerRole === 'creator'
                            ? member?.role !== 'creator'
                            : (viewerRole === 'moderator' && member?.role === 'member')
                        );
                      const isActing = actingMemberId === memberUserId;
                      const hasActions = canToggleRole || canKick;

                      return (
                        <div
                          key={memberUserId || member?.joined_at}
                          className="flex items-center gap-2.5 rounded-xl border border-piu-border/60 bg-piu-card/75 px-2.5 py-2"
                        >
                          {member?.user?.avatar ? (
                            <img src={getAvatarUrl(member.user.avatar)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-xs text-white">
                              {getInitials(member?.user?.username)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-display font-black text-white">
                                {member?.user?.username || 'Player'}
                                {memberUserId === String(currentUserId || '').trim() ? ' (You)' : ''}
                              </p>
                              <span className="shrink-0 rounded-full border border-piu-border/60 bg-piu-dark/80 px-1.5 py-px text-[9px] font-display font-black uppercase tracking-[0.14em] text-gray-200">
                                {getRoleLabel(member?.role)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              Joined {member?.joined_at ? new Date(`${String(member.joined_at).replace(' ', 'T')}Z`).toLocaleDateString() : 'recently'}
                            </p>
                          </div>
                          {hasActions ? (
                            <div className="flex shrink-0 flex-col gap-1">
                              {canToggleRole ? (
                                <button
                                  type="button"
                                  onClick={() => handleRoleToggle(member)}
                                  disabled={isActing}
                                  className="rounded-lg border border-piu-border/60 bg-piu-dark/80 px-2 py-1 text-[10px] font-display font-black text-gray-100 transition-colors hover:border-cyan-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  {isActing ? '...' : (member?.role === 'moderator' ? 'Make member' : 'Make mod')}
                                </button>
                              ) : null}
                              {canKick ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(member)}
                                  disabled={isActing}
                                  className="rounded-lg border border-red-300/20 bg-red-500/10 px-2 py-1 text-[10px] font-display font-black text-red-100 transition-colors hover:border-red-300/35 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  {isActing ? '...' : 'Kick'}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : settingsTab === 'lists' ? (
              <div className="space-y-3">
                {loadingSharedLists ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-violet-400" />
                  </div>
                ) : sharedLists.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">No lists shared to this squad yet.</p>
                    <p className="mt-1 text-xs text-gray-600">Share a list from your Lists page to see it here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sharedLists.map(sl => {
                      const pct = sl.itemCount > 0 ? 0 : 0;
                      return (
                        <div
                          key={sl.id}
                          className="rounded-xl border border-piu-border/50 bg-piu-dark/40 p-3 cursor-pointer hover:border-violet-400/30 hover:bg-piu-dark/60 transition-all"
                          onClick={() => setSharedListDetailId(sl.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-display font-bold text-white truncate">{sl.name}</p>
                              <p className="mt-0.5 text-[10px] text-gray-400">
                                {sl.owner?.username ? `by ${sl.owner.username}` : 'Shared list'}
                                {' · '}{sl.itemCount} song{sl.itemCount !== 1 ? 's' : ''}
                                {' · '}{sl.memberCount} member{sl.memberCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                            {!sl.isMember ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleJoinList(sl.id); }}
                                disabled={joiningListId === sl.id}
                                className="shrink-0 rounded-lg border border-cyan-400/25 bg-cyan-500/12 px-3 py-1.5 text-[10px] font-display font-bold text-cyan-100 transition-colors hover:border-cyan-400/40"
                              >
                                {joiningListId === sl.id ? '...' : 'Join'}
                              </button>
                            ) : (
                              <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-display font-bold text-emerald-300">
                                Joined
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <SharedListDetailModal
                  sharedListId={sharedListDetailId}
                  open={!!sharedListDetailId}
                  onClose={() => setSharedListDetailId(null)}
                />
              </div>
            ) : settingsTab === 'theme' ? (
              <div className="space-y-3">
                <ThemePicker
                  value={conversation?.theme || ''}
                  onChange={handleThemeChange}
                  disabled={savingTheme || (!canEditIdentity && viewerRole !== 'moderator')}
                />
                {savingTheme ? (
                  <p className="text-xs text-gray-400">Saving theme...</p>
                ) : null}
              </div>
            ) : settingsTab === 'notifications' ? (
              <div className="space-y-3">
                <p className="text-xs leading-5 text-gray-400">
                  Mention notifications can still reach you even if general squad notifications are off.
                </p>
                <ToggleRow
                  label="Notifications"
                  description="Turn general squad message notifications on or off."
                  enabled={!!notificationsEnabled}
                  disabled={updatingNotifications}
                  onToggle={(enabled) => toggleNotifications({ enabled })}
                />
                <ToggleRow
                  label="@mentions"
                  description="If this is on, mentions will still notify you even when general notifications are off."
                  enabled={!!notifyMentions}
                  disabled={updatingNotifications}
                  onToggle={(mentions) => toggleNotifications({ mentions })}
                />
              </div>
            ) : settingsTab === 'activity' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs leading-5 text-gray-400">
                    Linked videos, shared scores/clears, and links from this squad chat.
                  </p>
                  <div className="inline-flex rounded-xl border border-piu-border/60 bg-piu-card/75 p-1">
                    {TAB_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setTab(option.key)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-display font-black transition-colors ${
                          tab === option.key
                            ? 'border border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {tab === 'videos' ? (
                  resources.videos.length > 0 ? (
                    <div className="space-y-2">
                      {resources.videos.map((item) => (
                        <button
                          key={item.url}
                          type="button"
                          onClick={() => onOpenLink?.({ url: item.url, title: item.title })}
                          className="flex w-full items-center gap-2.5 rounded-xl border border-piu-border/60 bg-piu-card/75 px-2.5 py-2.5 text-left transition-colors hover:border-cyan-300/30"
                        >
                          <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-[0.75rem] bg-black">
                            {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-display font-black text-white">{item.title}</p>
                            <p className="mt-0.5 text-xs text-gray-400">{item.subtitle}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-piu-border/60 bg-piu-dark/70 px-4 py-6 text-center text-sm text-gray-500">
                      No linked videos yet.
                    </div>
                  )
                ) : null}

                {tab === 'shares' ? (
                  resources.shares.length > 0 ? (
                    <div className="space-y-2">
                      {resources.shares.map((item) => {
                        const displayScore = item.score || 0;
                        const rank = getRank(displayScore);
                        const parsedGrade = parseGrade(item.grade, rank.label);
                        const gradeDisplay = parsedGrade.display || rank.label;
                        const gradeColorClass = getGradeColor(item.grade, displayScore);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onOpenLink?.(item.linkTarget)}
                            className="relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-piu-border/60 bg-piu-card/75 px-3 py-2.5 text-left transition-colors hover:border-cyan-300/30"
                          >
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                              {item.jacketUrl ? (
                                <img src={item.jacketUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#152238] to-[#090d18]">
                                  <span className="text-[8px] font-display font-black text-gray-500">PIU</span>
                                </div>
                              )}
                              {item.level > 0 ? (
                                <span className={`absolute -bottom-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full border px-0.5 text-[8px] font-display font-black leading-[16px] ${getModeBadgeClasses(item.mode)}`}>
                                  {item.level}
                                </span>
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="rounded-full border border-piu-border/60 bg-piu-dark/80 px-1.5 py-px text-[8px] font-display font-black uppercase tracking-[0.14em] text-gray-300">
                                  {item.kind}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-sm font-display font-black text-white">
                                {item.songTitle || item.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-gray-500">Shared by {item.senderName}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              {displayScore > 0 ? (
                                <p className="font-display text-sm font-black text-white">{displayScore.toLocaleString()}</p>
                              ) : null}
                              {gradeDisplay ? (
                                <p className={`font-display text-lg font-black leading-tight ${gradeColorClass} ${parsedGrade.isBroken ? 'grade-broken' : ''}`} data-grade={gradeDisplay}>
                                  {gradeDisplay}
                                </p>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-piu-border/60 bg-piu-dark/70 px-4 py-6 text-center text-sm text-gray-500">
                      No shared scores or clears yet.
                    </div>
                  )
                ) : null}

                {tab === 'links' ? (
                  resources.links.length > 0 ? (
                    <div className="space-y-2">
                      {resources.links.map((item) => (
                        <button
                          key={item.url}
                          type="button"
                          onClick={() => onOpenLink?.({ url: item.url, title: item.title })}
                          className="flex w-full items-start gap-2.5 rounded-xl border border-piu-border/60 bg-piu-card/75 px-2.5 py-2.5 text-left transition-colors hover:border-cyan-300/30"
                        >
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-piu-border/60 bg-piu-dark/80 text-sm text-cyan-100">
                            ↗
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-display font-black text-white">{item.title}</p>
                            <p className="mt-0.5 text-xs text-gray-400">{item.subtitle}</p>
                            <p className="mt-0.5 truncate text-[11px] text-gray-500">{item.url}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-piu-border/60 bg-piu-dark/70 px-4 py-6 text-center text-sm text-gray-500">
                      No off-app links yet.
                    </div>
                  )
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 text-sm text-red-300">{error}</p>
            ) : null}
          </div>
        </div>
      </div>

      <UserPickerDialog
        open={pickerOpen}
        title="Add squad player"
        description="Search for a player to add to this squad."
        selectLabel={actingMemberId ? 'Adding...' : 'Add'}
        eyebrowLabel="Squads"
        onClose={() => setPickerOpen(false)}
        onSelect={handleAddMember}
        excludeUserIds={excludeUserIds}
      />

      {avatarDrawerOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6" onClick={(event) => { event.stopPropagation(); setAvatarDrawerOpen(false); }}>
          <div
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-[1.35rem] border border-piu-border/60 bg-piu-card/95 shadow-[0_24px_72px_rgba(0,0,0,0.5)] sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-piu-border/50 px-4 py-3">
              <p className="text-sm font-display font-black text-white">Choose avatar</p>
              <button
                type="button"
                onClick={() => setAvatarDrawerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-piu-border/60 bg-piu-dark/70 text-gray-300 transition-colors hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <AvatarPicker
                value={identityDraft.avatar}
                onChange={async (value) => {
                  setIdentityDraft((prev) => ({ ...prev, avatar: value }));
                  setAvatarDrawerOpen(false);
                  if (!canEditIdentity || savingIdentity) return;
                  const avatarChanged = String(value || '').trim() !== String(detail?.conversation?.avatar || conversation?.avatar || '').trim();
                  if (!avatarChanged) return;
                  setSavingIdentity(true);
                  try {
                    const payload = await updateMessageSquad(conversationId, {
                      title: String(identityDraft.title || '').trim(),
                      avatar: value || '',
                    });
                    applyPayload(payload);
                  } catch (err) {
                    setError(err?.message || 'Failed to save avatar.');
                  } finally {
                    setSavingIdentity(false);
                  }
                }}
                shape="square"
                size="md"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMessageSquadMember,
  getMessageSquad,
  removeMessageSquadMember,
  setMessageSquadMemberRole,
  updateMessageSquad,
  updateMessageSquadNotifications,
} from '../utils/api';
import { parseYouTubeUrl } from '../utils/youtube';
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
          subtitle: linkShare.subtitle || [linkShare.mode, Number(linkShare.level) > 0 ? `Level ${linkShare.level}` : ''].filter(Boolean).join(' • '),
          detail: [
            Number(linkShare.score) > 0 ? Number(linkShare.score).toLocaleString() : '',
            String(linkShare.grade || '').trim(),
          ].filter(Boolean).join(' • '),
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
    <div className="flex items-start justify-between gap-4 rounded-[1.15rem] border border-white/8 bg-white/5 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-display font-black text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onToggle?.(!enabled)}
        disabled={disabled}
        className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border transition-colors ${
          enabled ? 'border-cyan-300/35 bg-cyan-400/20' : 'border-white/15 bg-white/10'
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
  const [tab, setTab] = useState('videos');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [identityDraft, setIdentityDraft] = useState({ title: '', avatar: '' });
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);
  const [actingMemberId, setActingMemberId] = useState('');

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
    setTab('videos');
    setError('');
    setPickerOpen(false);
    loadDetail();
  }, [conversationId, loadDetail, open]);

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
      <div className="fixed inset-0 z-[155] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
        <div
          className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.8rem] border border-piu-border/70 bg-[#07111f] shadow-[0_30px_90px_rgba(0,0,0,0.48)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-display font-bold uppercase tracking-[0.24em] text-cyan-200/70">Squad settings</p>
              <h2 className="mt-2 truncate text-2xl font-display font-black text-white">
                {detail?.conversation?.title || conversation?.title || 'Squad'}
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                {members.length || conversation?.member_count || 0} members
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:border-cyan-300/30 hover:text-cyan-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {loading ? (
              <div className="rounded-[1.4rem] border border-white/8 bg-white/5 px-4 py-8 text-center text-sm text-gray-400">
                Loading squad settings...
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-5">
                  <section className="rounded-[1.45rem] border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-display font-black text-white">Identity</p>
                        <p className="mt-1 text-xs leading-5 text-gray-400">
                          The creator can change the squad name and avatar.
                        </p>
                      </div>
                      <span className="rounded-full border border-cyan-300/18 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-display font-black tracking-[0.18em] text-cyan-100">
                        {getRoleLabel(viewerRole)}
                      </span>
                    </div>

                    {canEditIdentity ? (
                      <div className="mt-4 space-y-4">
                        <AvatarPicker value={identityDraft.avatar} onChange={(value) => setIdentityDraft((prev) => ({ ...prev, avatar: value }))} size="md" />
                        <label className="block">
                          <p className="text-xs font-display font-bold uppercase tracking-[0.18em] text-gray-400">Name</p>
                          <input
                            type="text"
                            value={identityDraft.title}
                            onChange={(event) => setIdentityDraft((prev) => ({ ...prev, title: event.target.value }))}
                            maxLength={60}
                            className="mt-2 w-full rounded-[1rem] border border-piu-border/60 bg-piu-dark/45 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-cyan-300/35 focus:outline-none"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleSaveIdentity}
                          disabled={!isIdentityDirty || savingIdentity}
                          className="rounded-[1rem] border border-cyan-300/30 bg-cyan-500/15 px-4 py-2.5 text-sm font-display font-black text-cyan-50 transition-colors hover:border-cyan-200/45 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {savingIdentity ? 'Saving...' : 'Save squad details'}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center gap-3 rounded-[1.2rem] border border-white/8 bg-[#04111d]/75 px-3 py-3">
                        {conversation?.avatar ? (
                          <img src={getAvatarUrl(conversation.avatar)} alt="" className="h-14 w-14 rounded-[1rem] object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-[1rem] bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-base text-white">
                            {getInitials(conversation?.title)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-base font-display font-black text-white">{conversation?.title || 'Squad'}</p>
                          <p className="mt-1 text-xs text-gray-400">Only the creator can edit this.</p>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="rounded-[1.45rem] border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-display font-black text-white">Members</p>
                        <p className="mt-1 text-xs leading-5 text-gray-400">
                          Moderators can add or kick players. Only the creator can promote moderators.
                        </p>
                      </div>
                      {canManageMembers ? (
                        <button
                          type="button"
                          onClick={() => setPickerOpen(true)}
                          className="rounded-[1rem] border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-display font-black text-cyan-100 transition-colors hover:border-cyan-300/40 hover:text-white"
                        >
                          Add player
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-3">
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

                        return (
                          <div
                            key={memberUserId || member?.joined_at}
                            className="flex flex-wrap items-center gap-3 rounded-[1.15rem] border border-white/8 bg-[#04111d]/72 px-3 py-3"
                          >
                            {member?.user?.avatar ? (
                              <img src={getAvatarUrl(member.user.avatar)} alt="" className="h-11 w-11 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
                                {getInitials(member?.user?.username)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-display font-black text-white">
                                  {member?.user?.username || 'Player'}
                                  {memberUserId === String(currentUserId || '').trim() ? ' (You)' : ''}
                                </p>
                                <span className="rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-[10px] font-display font-black uppercase tracking-[0.16em] text-gray-200">
                                  {getRoleLabel(member?.role)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                Joined {member?.joined_at ? new Date(`${String(member.joined_at).replace(' ', 'T')}Z`).toLocaleDateString() : 'recently'}
                              </p>
                            </div>
                            {canToggleRole ? (
                              <button
                                type="button"
                                onClick={() => handleRoleToggle(member)}
                                disabled={isActing}
                                className="rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-[11px] font-display font-black text-gray-100 transition-colors hover:border-cyan-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
                              >
                                {isActing ? 'Saving...' : (member?.role === 'moderator' ? 'Make member' : 'Make moderator')}
                              </button>
                            ) : null}
                            {canKick ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member)}
                                disabled={isActing}
                                className="rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-2 text-[11px] font-display font-black text-red-100 transition-colors hover:border-red-300/35 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-55"
                              >
                                {isActing ? 'Removing...' : 'Kick'}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <div className="space-y-5">
                  <section className="rounded-[1.45rem] border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-display font-black text-white">Notifications</p>
                    <p className="mt-1 text-xs leading-5 text-gray-400">
                      Mention notifications can still reach you even if general squad notifications are off.
                    </p>
                    <div className="mt-4 space-y-3">
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
                  </section>

                  <section className="rounded-[1.45rem] border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-display font-black text-white">Shared activity</p>
                        <p className="mt-1 text-xs leading-5 text-gray-400">
                          Linked videos, shared scores/clears, and links from this squad chat.
                        </p>
                      </div>
                      <div className="inline-flex rounded-full border border-white/10 bg-[#04111d]/75 p-1">
                        {TAB_OPTIONS.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setTab(option.key)}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-display font-black transition-colors ${
                              tab === option.key
                                ? 'bg-cyan-400/16 text-cyan-50'
                                : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      {tab === 'videos' ? (
                        resources.videos.length > 0 ? (
                          <div className="space-y-3">
                            {resources.videos.map((item) => (
                              <button
                                key={item.url}
                                type="button"
                                onClick={() => onOpenLink?.({ url: item.url, title: item.title })}
                                className="flex w-full items-center gap-3 rounded-[1.15rem] border border-white/8 bg-[#04111d]/72 px-3 py-3 text-left transition-colors hover:border-cyan-300/30"
                              >
                                <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-[0.9rem] bg-black">
                                  {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : null}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="line-clamp-2 text-sm font-display font-black text-white">{item.title}</p>
                                  <p className="mt-1 text-xs text-gray-400">{item.subtitle}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[1.15rem] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-gray-500">
                            No linked videos yet.
                          </div>
                        )
                      ) : null}

                      {tab === 'shares' ? (
                        resources.shares.length > 0 ? (
                          <div className="space-y-3">
                            {resources.shares.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => onOpenLink?.(item.linkTarget)}
                                className="flex w-full items-start gap-3 rounded-[1.15rem] border border-white/8 bg-[#04111d]/72 px-3 py-3 text-left transition-colors hover:border-cyan-300/30"
                              >
                                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-display font-black uppercase tracking-[0.18em] text-cyan-100">
                                  {item.kind}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-display font-black text-white">{item.title}</p>
                                  {item.subtitle ? <p className="mt-1 text-xs text-gray-400">{item.subtitle}</p> : null}
                                  {item.detail ? <p className="mt-1 text-xs text-cyan-100">{item.detail}</p> : null}
                                  <p className="mt-1 text-[11px] text-gray-500">Shared by {item.senderName}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[1.15rem] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-gray-500">
                            No shared scores or clears yet.
                          </div>
                        )
                      ) : null}

                      {tab === 'links' ? (
                        resources.links.length > 0 ? (
                          <div className="space-y-3">
                            {resources.links.map((item) => (
                              <button
                                key={item.url}
                                type="button"
                                onClick={() => onOpenLink?.({ url: item.url, title: item.title })}
                                className="flex w-full items-start gap-3 rounded-[1.15rem] border border-white/8 bg-[#04111d]/72 px-3 py-3 text-left transition-colors hover:border-cyan-300/30"
                              >
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/6 text-cyan-100">
                                  ↗
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-display font-black text-white">{item.title}</p>
                                  <p className="mt-1 text-xs text-gray-400">{item.subtitle}</p>
                                  <p className="mt-1 truncate text-[11px] text-gray-500">{item.url}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[1.15rem] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-gray-500">
                            No off-app links yet.
                          </div>
                        )
                      ) : null}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {error ? (
              <p className="mt-4 text-sm text-red-300">{error}</p>
            ) : null}
          </div>
        </div>
      </div>

      <UserPickerDialog
        open={pickerOpen}
        title="Add squad player"
        selectLabel={actingMemberId ? 'Adding...' : 'Add'}
        onClose={() => setPickerOpen(false)}
        onSelect={handleAddMember}
        excludeUserIds={excludeUserIds}
      />
    </>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProfilePath } from '../utils/profile';
import { parseYouTubeUrl } from '../utils/youtube';
import { parseGrade } from '../utils/grades';
import { getAvatarUrl } from './AvatarPicker';
import { setMessageConversationTheme } from '../utils/api';
import ThemePicker from './ChatThemes';

const EXTERNAL_URL_REGEX = /https?:\/\/[^\s<>()]+/ig;
const SHARE_KIND_LABELS = {
  upscore: 'Upscore',
  clear: 'Clear',
  score_snapshot: 'Score',
  chart_compare: 'Compare',
};
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

const ACTIVITY_TABS = [
  { key: 'videos', label: 'Videos' },
  { key: 'shares', label: 'Scores/Clears' },
  { key: 'links', label: 'Off-app links' },
];
const SETTINGS_TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'search', label: 'Search' },
  { key: 'theme', label: 'Theme' },
  { key: 'activity', label: 'Activity' },
];

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

function buildConversationResources(messages = []) {
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

export default function ConversationSettingsModal({
  open = false,
  partner = null,
  conversation = null,
  messages = [],
  onClose,
  onOpenLink,
  onConversationUpdated,
}) {
  const [settingsTab, setSettingsTab] = useState('profile');
  const [activityTab, setActivityTab] = useState('videos');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = React.useRef(null);
  const [savingTheme, setSavingTheme] = useState(false);

  const resources = useMemo(() => buildConversationResources(messages), [messages]);

  const searchResults = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return messages.filter((msg) => {
      const content = String(msg?.content || '').toLowerCase();
      return content.includes(q);
    }).slice(0, 50);
  }, [messages, searchQuery]);

  useEffect(() => {
    if (!open) return;
    setSettingsTab('profile');
    setActivityTab('videos');
    setSearchQuery('');
  }, [open]);

  useEffect(() => {
    if (open && settingsTab === 'search') {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open, settingsTab]);

  const handleThemeChange = async (themeKey) => {
    if (savingTheme || !conversation?.id) return;
    setSavingTheme(true);
    try {
      const payload = await setMessageConversationTheme(conversation.id, themeKey);
      if (payload?.conversation) {
        onConversationUpdated?.(payload.conversation);
      }
    } catch {
      // silently ignore
    } finally {
      setSavingTheme(false);
    }
  };

  if (!open || !partner) return null;

  const profilePath = getProfilePath(partner.id, partner.username);

  return (
    <div className="fixed inset-0 z-[155] flex items-center justify-center bg-black/84 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.35rem] border border-piu-border/60 bg-piu-card/95 shadow-[0_24px_72px_rgba(0,0,0,0.44)] sm:max-h-[calc(100dvh-2rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-piu-border/50 px-4 py-3 sm:px-5">
          {partner.avatar ? (
            <img
              src={getAvatarUrl(partner.avatar)}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
              {String(partner.username || '').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-gray-400">Conversation</p>
            <h2 className="mt-0.5 truncate text-lg font-display font-black text-white">
              {partner.username || 'Player'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">Private chat</p>
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

        {/* Tabs */}
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

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          {/* Profile Tab */}
          {settingsTab === 'profile' ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-piu-border/60 bg-piu-dark/55 px-4 py-6">
                {partner.avatar ? (
                  <img
                    src={getAvatarUrl(partner.avatar)}
                    alt=""
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-2xl text-white">
                    {String(partner.username || '').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="text-center">
                  <p className="text-lg font-display font-black text-white">{partner.username || 'Player'}</p>
                  <p className="mt-1 text-xs text-gray-400">Private chat</p>
                </div>
                <Link
                  to={profilePath}
                  onClick={onClose}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-display font-black text-cyan-100 transition-colors hover:border-cyan-400/40 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  Visit profile
                </Link>
              </div>
            </div>
          ) : null}

          {/* Search Tab */}
          {settingsTab === 'search' ? (
            <div className="space-y-3">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search messages..."
                  className="w-full rounded-xl border border-piu-border/60 bg-piu-dark/80 py-2.5 pl-10 pr-3 text-sm text-white placeholder-gray-500 focus:border-cyan-400/30 focus:outline-none"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </div>

              {searchQuery.trim().length < 2 ? (
                <div className="rounded-xl border border-dashed border-piu-border/60 bg-piu-dark/70 px-4 py-6 text-center text-sm text-gray-500">
                  Type at least 2 characters to search.
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-xl border border-piu-border/60 bg-piu-card/75 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-display font-black text-cyan-100">
                          {msg?.sender?.username || 'Player'}
                        </p>
                        <span className="text-[10px] text-gray-500">
                          {msg?.created_at ? new Date(`${String(msg.created_at).replace(' ', 'T')}Z`).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-gray-200">{msg.content}</p>
                    </div>
                  ))}
                  {searchResults.length >= 50 ? (
                    <p className="text-center text-xs text-gray-500">Showing first 50 results.</p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-piu-border/60 bg-piu-dark/70 px-4 py-6 text-center text-sm text-gray-500">
                  No messages found.
                </div>
              )}
            </div>
          ) : null}

          {/* Theme Tab */}
          {settingsTab === 'theme' ? (
            <div className="space-y-3">
              <ThemePicker
                value={conversation?.theme || ''}
                onChange={handleThemeChange}
                disabled={savingTheme}
              />
              {savingTheme ? (
                <p className="text-xs text-gray-400">Saving theme...</p>
              ) : null}
            </div>
          ) : null}

          {/* Activity Tab */}
          {settingsTab === 'activity' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-5 text-gray-400">
                  Linked videos, shared scores/clears, and links from this conversation.
                </p>
                <div className="inline-flex rounded-xl border border-piu-border/60 bg-piu-card/75 p-1">
                  {ACTIVITY_TABS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setActivityTab(option.key)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-display font-black transition-colors ${
                        activityTab === option.key
                          ? 'border border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {activityTab === 'videos' ? (
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

              {activityTab === 'shares' ? (
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
                          {/* Jacket thumbnail */}
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                            {item.jacketUrl ? (
                              <img src={item.jacketUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#152238] to-[#090d18]">
                                <span className="text-[8px] font-display font-black text-gray-500">PIU</span>
                              </div>
                            )}
                            {/* Level badge overlay */}
                            {item.level > 0 ? (
                              <span className={`absolute -bottom-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full border px-0.5 text-[8px] font-display font-black leading-[16px] ${getModeBadgeClasses(item.mode)}`}>
                                {item.level}
                              </span>
                            ) : null}
                          </div>

                          {/* Song info */}
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

                          {/* Score + Grade */}
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

              {activityTab === 'links' ? (
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
        </div>
      </div>
    </div>
  );
}

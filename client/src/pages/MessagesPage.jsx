import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import {
  createMessageSquad,
  clearMessageNote,
  createMessageNote,
  createMessageStoryItem,
  getChartKeyMap,
  getJacketMap,
  getMessageHighlights,
  getMessageStoryArchive,
  getMessageStory,
  getSharedMessageStory,
  getNewClear,
  getMessageConversation,
  getMessageConversations,
  getOrCreateDirectConversation,
  getSongChartDetail,
  getUpscore,
  searchConversationMentions,
  setMessageConversationReaction,
  sendMessageConversationStomp,
  sendMessageConversationNudge,
  sendConversationMessage,
  pinMessageConversation,
} from '../utils/api';
import {
  buildClearLinkShare,
  buildChartCompareLinkShare,
  buildChallengeLifecycleCard,
  buildClearChallengeCard,
  buildRematchChallengeCard,
  buildUpscoreLinkShare,
  buildUpscoreChallengeCard,
} from '../utils/directMessageShares';
import { getProfilePath } from '../utils/profile';
import { renderFormattedText } from '../utils/formatText';
import { getStickerEmoji, STICKER_TOKEN_REGEX } from '../utils/stickers';
import StickerAsset from '../components/StickerAsset';
import { getAvatarUrl } from '../components/AvatarPicker';
import { parseYouTubeUrl } from '../utils/youtube';
import ActionIconButton from '../components/ActionIconButton';
import DojoCatStickerPicker from '../components/DojoCatStickerPicker';
import InboxHighlightsStrip, {
  NoteComposerModal,
  NoteThreadModal,
  StoryArchiveModal,
  StoryComposerModal,
  StoryViewerModal,
} from '../components/InboxHighlightsStrip';
import ScoreSnapshotCard from '../components/ScoreSnapshotCard';
import SessionShareCard from '../components/SessionShareCard';
import SquadComposerModal from '../components/SquadComposerModal';
import MentionSuggestionsPanel from '../components/MentionSuggestionsPanel';
import SquadSettingsModal from '../components/SquadSettingsModal';
import ConversationSettingsModal from '../components/ConversationSettingsModal';
import { getTheme } from '../components/ChatThemes';
import YouTubeReplayModal from '../components/YouTubeReplayModal';
import UserPickerDialog from '../components/UserPickerDialog';
import PiuChartJacket, { resolveChartJacketUrl } from '../components/PiuChartJacket';
import { useMentionComposer } from '../hooks/useMentionComposer';
import { buildReplayModalTitle } from '../utils/replayTitle';

const LINK_SHARE_BADGES = {
  live_session: 'Live session',
  post: 'Post',
  upscore: 'Upscore',
  clear: 'Clear',
  score_snapshot: 'Score',
  chart_compare: 'Compare',
  hour_of_power: 'Hour of Power',
  story: 'Story',
  link: 'Link',
};
const CHALLENGE_BADGES = {
  beat_score: 'Score Challenge',
  clear_chart: 'Clear Challenge',
};
const MESSAGE_LINK_PREFERENCE_KEY = 'shinsa.messages.open-links-externally';
const CHAT_DEFAULT_REACTION_KEY = 'shinsa.messages.default-reaction';
const CHAT_QUICK_REACTIONS_KEY = 'shinsa.messages.quick-reactions';
const PUMP_ICON_ACTIVE_PATH = '/piu/stomp-yellow.svg';
const PUMP_ICON_INACTIVE_PATH = '/piu/stomp-gray.svg';
const EXTERNAL_URL_REGEX = /https?:\/\/[^\s<>()]+/ig;
const SCORE_SHARE_PAGE_SIZE = 3;
const REACTION_OPTIONS = [
  { key: 'pump', label: 'Pumps', icon: PUMP_ICON_ACTIVE_PATH },
  { key: 'fire', label: 'Fire', emoji: '🔥' },
  { key: 'heart', label: 'Heart', emoji: '💜' },
  { key: 'clap', label: 'Clap', emoji: '👏' },
  { key: 'mind_blown', label: 'Mind blown', emoji: '🤯' },
  { key: 'sleepy', label: 'Sleepy', emoji: '😴' },
];
const DEFAULT_QUICK_REACTION_KEYS = ['pump', 'fire', 'heart', 'clap'];
const REPLY_SWIPE_MAX_OFFSET = 72;
const REPLY_SWIPE_TRIGGER_OFFSET = 54;
const MOBILE_MESSAGE_INTERACTION_ARM_DELAY_MS = 520;

function isCoarsePointerDevice() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia) {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    if (window.matchMedia('(hover: none)').matches && Number(window.navigator?.maxTouchPoints || 0) > 0) return true;
  }
  return Number(window.navigator?.maxTouchPoints || 0) > 0 && window.innerWidth < 1024;
}

function formatCompactScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toLocaleString() : '';
}

function formatCompactDelta(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `+${numeric.toLocaleString()}` : '';
}

function extractUrlsFromText(value) {
  const text = String(value || '');
  return text.match(EXTERNAL_URL_REGEX) || [];
}

function extractFirstUrl(value) {
  return extractUrlsFromText(value)[0] || '';
}

function isStandaloneUrlMessage(value, url = '') {
  const text = String(value || '').trim();
  const candidate = String(url || extractFirstUrl(text) || '').trim();
  return !!text && !!candidate && text === candidate;
}

function extractFirstYouTubeUrl(value) {
  return extractUrlsFromText(value).find((url) => parseYouTubeUrl(url).videoId) || '';
}

function getYouTubeThumbnailUrl(value) {
  const videoId = parseYouTubeUrl(value).videoId;
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}

function getLevelBadgeLabel(mode, level) {
  const modeLabel = String(mode || '').trim();
  const levelValue = Number(level) || 0;
  if (!modeLabel && !levelValue) return '';
  if (!modeLabel) return String(levelValue);
  const prefix = modeLabel.toLowerCase().startsWith('double')
    ? 'D'
    : modeLabel.toLowerCase().startsWith('single')
      ? 'S'
      : modeLabel.slice(0, 1).toUpperCase();
  return `${prefix}${levelValue || ''}`;
}

function enrichPreviewItemsWithJackets(items, jacketLookup = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.map((item) => ({
    ...item,
    jacketUrl: resolveChartJacketUrl({
      title: item?.songTitle || '',
      mode: item?.mode || '',
      level: item?.level || '',
      jacketLookup,
      jacketUrl: item?.jacketUrl || '',
    }),
  }));
}

function getExternalHostLabel(url) {
  try {
    const parsed = new URL(String(url || ''));
    return String(parsed.hostname || '').replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function sanitizeReactionKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 32);
}

function normalizeReactionKeys(value) {
  const keys = Array.isArray(value) ? value : [];
  const unique = [];
  for (const entry of keys) {
    const key = sanitizeReactionKey(entry);
    if (!key || unique.includes(key) || !REACTION_OPTIONS.some((option) => option.key === key)) continue;
    unique.push(key);
  }
  return unique;
}

function getReactionOption(key) {
  return REACTION_OPTIONS.find((option) => option.key === sanitizeReactionKey(key)) || REACTION_OPTIONS[0];
}

function renderReactionGlyph(key, className = 'h-4 w-4', active = true) {
  const option = getReactionOption(key);
  if (option.icon) {
    return <img src={active ? option.icon : PUMP_ICON_INACTIVE_PATH} alt="" className={`${className} object-contain`} />;
  }
  return <span className={`${className} inline-flex items-center justify-center text-[1rem] leading-none`}>{option.emoji || '•'}</span>;
}

function formatReactionCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  return numeric > 99 ? '99+' : String(numeric);
}

const COMPARE_STATUS_META = {
  beat_target: {
    fallbackLabel: 'Beat target',
    className: 'border-emerald-300/28 bg-[#10221c] text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  },
  pass_earned: {
    fallbackLabel: 'Pass earned',
    className: 'border-emerald-300/28 bg-[#10221c] text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  },
  chasing_target: {
    fallbackLabel: 'Still chasing',
    className: 'border-amber-300/28 bg-[#261b10] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  },
  still_breaking: {
    fallbackLabel: 'Still breaking',
    className: 'border-rose-300/28 bg-[#261218] text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  },
  shared_best: {
    fallbackLabel: 'Current best',
    className: 'border-cyan-300/28 bg-[#10202b] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  },
  accepted: {
    fallbackLabel: 'Accepted',
    className: 'border-sky-300/28 bg-[#112133] text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  },
  expired: {
    fallbackLabel: 'Expired',
    className: 'border-white/12 bg-[#171c29] text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  },
};

function normalizeSongName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseResourceIdFromPath(path, resource) {
  const raw = String(path || '').trim();
  const prefix = `/${String(resource || '').replace(/^\/+|\/+$/g, '')}/`;
  if (!raw.startsWith(prefix)) return '';
  return raw.slice(prefix.length).split(/[/?#]/, 1)[0] || '';
}

function resolveChartId(songTitle, mode, level, chartMap) {
  if (!chartMap || typeof chartMap !== 'object') return '';
  const normalizedTitle = normalizeSongName(songTitle);
  const modeLabel = String(mode || '').trim();
  const levelValue = parseInt(level, 10) || 0;
  if (!normalizedTitle || !modeLabel || levelValue <= 0) return '';
  return String(chartMap[`${normalizedTitle}|${modeLabel}|${levelValue}`] || '').trim();
}

function parseUpscoreItems(item) {
  try {
    const parsed = JSON.parse(item?.upscores_json || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getClearItems(item) {
  const fallback = [{
    entry_type: 'song_clear',
    song_title: item?.song_title || '',
    mode: item?.mode || 'Single',
    level: parseInt(item?.level, 10) || 0,
    score: parseInt(item?.score, 10) || 0,
    grade: item?.grade || '',
  }];

  try {
    const parsed = JSON.parse(item?.clears_json || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed.map((entry) => ({
      entry_type: entry?.entry_type || 'song_clear',
      song_title: entry?.song_title || fallback[0].song_title,
      mode: entry?.mode || fallback[0].mode,
      level: parseInt(entry?.level, 10) || fallback[0].level,
      score: parseInt(entry?.score, 10) || 0,
      grade: entry?.grade || '',
    }));
  } catch {
    return fallback;
  }
}

function appendStickerToken(value, token) {
  const current = String(value || '');
  const needsSpace = current.length > 0 && !/\s$/.test(current);
  return `${current}${needsSpace ? ' ' : ''}${token} `;
}

function getMessageSortTime(message) {
  const raw = String(message?.created_at || message?.updated_at || '').trim();
  if (!raw) return 0;
  const normalized = raw.includes('T') || raw.endsWith('Z')
    ? raw
    : `${raw.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeConversationMessages(items) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((left, right) => {
    const timeDiff = getMessageSortTime(left) - getMessageSortTime(right);
    if (timeDiff !== 0) return timeDiff;

    const leftId = Number.parseInt(left?.id, 10);
    const rightId = Number.parseInt(right?.id, 10);
    if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
      return leftId - rightId;
    }

    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });
}

function buildNoteThreadPayload(note) {
  if (!note?.thread_key) return null;
  return {
    thread_key: note.thread_key,
    note_id: note.id || '',
    owner_user_id: note.user?.id || note.user_id || '',
    owner_username: note.user?.username || '',
    note_text: note.content || '',
    note_kind: note.kind || '',
    created_at: note.created_at || '',
    expires_at: note.expires_at || '',
    link_path: note.link?.path || '',
    link_url: note.link?.url || '',
    link_label: note.link?.label || '',
  };
}

function getThreadMessages(messages, note) {
  const threadKey = String(note?.thread_key || '').trim();
  if (!threadKey) return [];
  return Array.isArray(messages)
    ? messages.filter((message) => String(message?.note_thread?.threadKey || '').trim() === threadKey)
    : [];
}

function buildScoreStoryOptions(stories = []) {
  return (Array.isArray(stories) ? stories : [])
    .filter((story) => story?.source?.kind === 'upscore' || story?.source?.kind === 'clear')
    .map((story) => ({
      value: `${story.source.kind}:${story.source.id}`,
      sourceKind: story.source.kind,
      sourceId: story.source.id,
      label: story.snapshot
        ? `${story.snapshot.song_title || 'Song'} ${story.snapshot.mode || ''}${story.snapshot.level ? ` ${story.snapshot.level}` : ''}`.trim()
        : (story.title || 'Score snapshot'),
      subtitle: story.title || story.subtitle || 'Recent score activity',
      timeLabel: formatConversationTime(story.created_at),
    }));
}

function formatConversationTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw.endsWith('Z') ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '';

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function MultiScorePreviewCard({ linkShare, badge, buttonClass, onOpenLink }) {
  const previewItems = Array.isArray(linkShare?.previewItems) ? linkShare.previewItems.filter(Boolean) : [];
  const extraItemCount = Math.max(0, Number(linkShare?.extraItemCount) || 0);
  const title = String(linkShare?.title || '').trim() || 'Shared charts';
  const subtitle = String(linkShare?.subtitle || '').trim();
  const buttonLabel = String(linkShare?.buttonLabel || '').trim() || 'Open';
  const totalItemCount = Math.max(Number(linkShare?.totalItemCount) || 0, previewItems.length);
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(previewItems.length / SCORE_SHARE_PAGE_SIZE));
  const pageStart = pageIndex * SCORE_SHARE_PAGE_SIZE;
  const visibleItems = previewItems.slice(pageStart, pageStart + SCORE_SHARE_PAGE_SIZE);
  const visibleEnd = Math.min(pageStart + visibleItems.length, totalItemCount || previewItems.length);

  useEffect(() => {
    setPageIndex(0);
  }, [linkShare?.path, linkShare?.title, previewItems.length]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  if (visibleItems.length === 0) return null;

  return (
    <div className="w-full rounded-[1.2rem] border border-piu-border/60 bg-piu-card/75 px-3 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/75">{badge}</p>
          <p className="mt-1 text-[15px] font-display font-black leading-tight text-white">{title}</p>
          {subtitle ? <p className="mt-1 text-[12px] leading-5 text-gray-300">{subtitle}</p> : null}
        </div>
        {totalItemCount > 0 ? (
          <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-display font-black tracking-[0.18em] text-cyan-100">
            {pageStart + 1}-{visibleEnd}/{totalItemCount}
          </span>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {visibleItems.map((item, index) => (
          <div
            key={`${item.songTitle || 'song'}-${pageStart + index}`}
            className="flex items-center gap-2.5 rounded-[1rem] border border-white/10 bg-piu-dark/45 px-2.5 py-2.5"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[0.95rem] border border-white/10 bg-black/30">
              {item.jacketUrl ? (
                <img src={item.jacketUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/30 to-emerald-500/20 text-[10px] font-display font-black text-cyan-100">
                  {getLevelBadgeLabel(item.mode, item.level) || 'PIU'}
                </div>
              )}
              {getLevelBadgeLabel(item.mode, item.level) ? (
                <span className="absolute bottom-1 right-1 rounded-full border border-cyan-200/25 bg-[#03131d]/90 px-1.5 py-0.5 text-[9px] font-display font-black tracking-[0.14em] text-cyan-100">
                  {getLevelBadgeLabel(item.mode, item.level)}
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-display font-black text-white">{item.songTitle || 'Song'}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {[String(item.mode || '').trim(), Number(item.level) > 0 ? `Level ${item.level}` : ''].filter(Boolean).join(' • ')}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12px] font-display font-black text-white">{formatCompactScore(item.score) || '--'}</p>
              <p className="mt-0.5 text-[11px] font-display font-black text-cyan-100">{item.grade || '--'}</p>
              {Number(item.scoreDelta) > 0 ? (
                <p className="mt-0.5 text-[10px] font-display font-bold text-emerald-300">{formatCompactDelta(item.scoreDelta)}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {extraItemCount > 0 ? (
            <p className="text-[11px] font-display font-bold tracking-[0.14em] text-gray-400">+ {extraItemCount} more</p>
          ) : <span />}
          {pageCount > 1 ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                disabled={pageIndex <= 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Show previous shared scores"
              >
                &#8249;
              </button>
              <span className="px-1 text-[10px] font-display font-black tracking-[0.16em] text-gray-300">
                {pageIndex + 1}/{pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                disabled={pageIndex >= pageCount - 1}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Show next shared scores"
              >
                &#8250;
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpenLink}
          className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors ${buttonClass}`}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

function buildStoryFromLinkShare(linkShare) {
  if (!linkShare) return null;
  const ownerId = String(linkShare?.storyOwnerId || '').trim();
  const ownerUsername = String(linkShare?.storyOwnerUsername || linkShare?.playerName || '').trim();
  const ownerAvatar = String(linkShare?.storyOwnerAvatar || linkShare?.playerAvatar || '').trim();
  const storyType = String(linkShare?.storyType || '').trim().toLowerCase() || 'image';
  const caption = String(linkShare?.storyCaption || '').trim();
  const title = String(linkShare?.title || '').trim();
  const subtitle = String(linkShare?.subtitle || '').trim();
  const mediaUrl = String(linkShare?.storyMediaUrl || '').trim();
  const previewItems = Array.isArray(linkShare?.previewItems) ? linkShare.previewItems.filter(Boolean) : [];
  const fallbackLink = {
    path: String(linkShare?.storyFallbackPath || '').trim(),
    url: String(linkShare?.storyFallbackUrl || '').trim(),
    label: String(linkShare?.buttonLabel || '').trim() || 'Open story',
  };
  const hasFallbackLink = fallbackLink.path || fallbackLink.url;
  const baseStory = {
    id: String(linkShare?.storyId || '').trim(),
    type: storyType,
    created_at: String(linkShare?.storyCreatedAt || '').trim(),
    caption,
    title,
    subtitle,
    user: {
      id: ownerId,
      username: ownerUsername,
      avatar: ownerAvatar,
    },
    source: {
      kind: String(linkShare?.storySourceKind || '').trim(),
      id: '',
    },
    link: hasFallbackLink ? fallbackLink : null,
  };

  if (storyType === 'score_roundup' && previewItems.length > 0) {
    return {
      ...baseStory,
      type: 'score_roundup',
      entry_kind: String(linkShare?.storySourceKind || '').trim().toLowerCase() === 'clear' ? 'clear' : 'upscore',
      scores: previewItems.map((item) => ({
        song_title: item.songTitle || '',
        mode: item.mode || '',
        level: parseInt(item.level, 10) || 0,
        score: parseInt(item.score, 10) || 0,
        grade: item.grade || '',
        jacket_url: item.jacketUrl || '',
      })),
      total_count: Math.max(parseInt(linkShare?.totalItemCount, 10) || 0, previewItems.length),
    };
  }

  if (storyType === 'score_snapshot' || (linkShare?.songTitle && linkShare?.mode && Number(linkShare?.level) > 0)) {
    return {
      ...baseStory,
      type: 'score_snapshot',
      snapshot: {
        song_title: linkShare.songTitle || '',
        mode: linkShare.mode || '',
        level: parseInt(linkShare.level, 10) || 0,
        score: parseInt(linkShare.score, 10) || 0,
        new_score: parseInt(linkShare.score, 10) || 0,
        grade: linkShare.grade || '',
        new_grade: linkShare.grade || '',
        jacket_url: linkShare.jacketUrl || '',
        playerName: ownerUsername,
        playerAvatar: ownerAvatar,
      },
    };
  }

  if (storyType === 'post') {
    return {
      ...baseStory,
      type: 'post',
      media_url: mediaUrl,
      post: {
        id: '',
        content: caption,
        images: mediaUrl ? [mediaUrl] : [],
        youtube_url: '',
      },
    };
  }

  if (storyType === 'link') {
    return {
      ...baseStory,
      type: 'link',
      media_url: mediaUrl,
    };
  }

  return {
    ...baseStory,
    type: 'image',
    media_url: mediaUrl,
  };
}

function StorySharePreviewCard({ linkShare, buttonClass, onOpenLink, conversationId = '' }) {
  const [sharedStoryState, setSharedStoryState] = useState({
    story: null,
    user: null,
  });
  const storyOwnerId = String(linkShare?.storyOwnerId || '').trim();
  const storyId = String(linkShare?.storyId || '').trim();

  useEffect(() => {
    let active = true;
    if (!storyOwnerId || !storyId) {
      setSharedStoryState({ story: null, user: null });
      return undefined;
    }
    getSharedMessageStory(storyOwnerId, storyId, conversationId ? { conversationId } : undefined)
      .then((payload) => {
        if (!active) return;
        setSharedStoryState({
          story: payload?.story || null,
          user: payload?.user || null,
        });
      })
      .catch(() => {
        if (!active) return;
        setSharedStoryState({ story: null, user: null });
      });
    return () => {
      active = false;
    };
  }, [conversationId, storyId, storyOwnerId]);

  const story = sharedStoryState.story || buildStoryFromLinkShare(linkShare);
  const owner = sharedStoryState.user || story?.user || null;
  const ownerName = String(owner?.username || linkShare?.storyOwnerUsername || linkShare?.playerName || '').trim() || 'Player';
  const ownerAvatar = String(owner?.avatar || linkShare?.storyOwnerAvatar || linkShare?.playerAvatar || '').trim();
  const title = String(story?.title || linkShare?.title || '').trim();
  const subtitle = String(story?.subtitle || linkShare?.subtitle || '').trim();
  const caption = String(story?.caption || linkShare?.storyCaption || '').trim();
  const createdLabel = formatConversationTime(story?.created_at || linkShare?.storyCreatedAt);
  const buttonLabel = String(linkShare?.buttonLabel || '').trim() || 'Open story';
  const storyMediaUrl = String(story?.media_url || '').trim();
  const roundupItems = Array.isArray(story?.scores) ? story.scores.filter(Boolean).slice(0, 2) : [];
  const totalRoundupCount = Math.max(parseInt(story?.total_count, 10) || 0, roundupItems.length);
  const snapshot = story?.snapshot || null;
  const summaryText = compactReplyPreviewText(caption || subtitle, 160);
  const normalizedOwnerTitle = ownerName ? `${ownerName} story`.toLowerCase() : '';
  const normalizedTitle = title.toLowerCase();
  const isGenericTitle = !title
    || normalizedTitle === 'story'
    || (!!normalizedOwnerTitle && normalizedTitle === normalizedOwnerTitle);
  const displayTitle = (
    isGenericTitle
      ? String(subtitle || summaryText || ownerName || 'Story').trim()
      : title
  ) || 'Story';
  const displaySubtitle = isGenericTitle
    ? ''
    : (subtitle && subtitle !== displayTitle ? subtitle : '');
  const detailText = displaySubtitle
    ? (summaryText && summaryText !== displaySubtitle ? summaryText : '')
    : (summaryText && summaryText !== displayTitle ? summaryText : '');
  const handleOpen = () => onOpenLink?.(linkShare);

  return (
    <div className="w-full rounded-[1.25rem] border border-piu-border/60 bg-[linear-gradient(160deg,rgba(15,22,36,0.98),rgba(10,14,25,0.94))] p-3 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
      <div className="flex items-center gap-2.5">
        {ownerAvatar ? (
          <img src={ownerAvatar} alt="" className="h-9 w-9 rounded-full border border-white/10 object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-500/10 font-display text-sm font-black text-cyan-100">
            {ownerName.slice(0, 1).toUpperCase() || 'S'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/72">Story</p>
          <p className="truncate text-[13px] font-display font-black text-white">{ownerName}</p>
        </div>
        {createdLabel ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-display font-bold text-gray-300">
            {createdLabel}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={handleOpen}
        className="mt-3 block w-full overflow-hidden rounded-[1.15rem] border border-white/8 bg-piu-dark/78 text-left transition-colors hover:border-cyan-300/25 hover:bg-piu-dark/86"
      >
        {storyMediaUrl ? (
          <div className="overflow-hidden border-b border-white/8 bg-black/25">
            <img src={storyMediaUrl} alt={title || 'Shared story'} className="max-h-[14rem] w-full object-cover" />
          </div>
        ) : null}

        {roundupItems.length > 0 ? (
          <div className="space-y-2 px-3.5 py-3.5">
            {roundupItems.map((item, index) => (
              <div key={`${item.song_title || 'story'}:${item.mode || ''}:${item.level || 0}:${index}`} className="flex items-center gap-3 rounded-[1rem] border border-piu-border/55 bg-[#0f1624]/92 px-3 py-2.5">
                <PiuChartJacket
                  title={item.song_title || ''}
                  mode={item.mode || ''}
                  level={item.level || 0}
                  jacketUrl={item.jacket_url || ''}
                  size="wide"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-display font-black text-white">{item.song_title || 'Song'}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {item.mode || 'Mode'}
                    {item.level ? ` • ${getLevelBadgeLabel(item.mode, item.level)}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-display font-black text-white">{formatCompactScore(item.score) || 'Shared'}</p>
                  {item.grade ? <p className="mt-1 text-[10px] font-display font-bold text-cyan-100/90">{item.grade}</p> : null}
                </div>
              </div>
            ))}
            {totalRoundupCount > roundupItems.length ? (
              <p className="text-[11px] text-gray-400">
                {`+${Math.max(0, totalRoundupCount - roundupItems.length)} more in the story`}
              </p>
            ) : null}
          </div>
        ) : null}

        {!storyMediaUrl && snapshot ? (
          <div className="flex items-center gap-3 px-3.5 py-3.5">
            <PiuChartJacket
              title={snapshot.song_title}
              mode={snapshot.mode}
              level={snapshot.level}
              jacketUrl={snapshot.jacket_url}
              size="wide"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-display font-black text-white">{snapshot.song_title || 'Song'}</p>
              <p className="mt-1 text-[11px] text-gray-400">
                {snapshot.mode || 'Mode'}
                {snapshot.level ? ` • ${getLevelBadgeLabel(snapshot.mode, snapshot.level)}` : ''}
              </p>
              <p className="mt-2 text-[15px] font-display font-black text-white">{formatCompactScore(snapshot.score || snapshot.new_score) || 'Shared score'}</p>
            </div>
            {snapshot.grade || snapshot.new_grade ? (
              <div className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-display font-black text-cyan-100">
                {snapshot.grade || snapshot.new_grade}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="px-3.5 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-display font-black text-white">{displayTitle}</p>
            {displaySubtitle ? (
              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-gray-300">{displaySubtitle}</p>
            ) : null}
            {detailText ? (
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-400">{detailText}</p>
            ) : null}
          </div>
        </div>
      </button>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={handleOpen}
          className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors ${buttonClass}`}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

function YouTubeMessagePreviewCard({ url, onOpen }) {
  const [meta, setMeta] = useState({ title: '', authorName: '' });
  const videoId = parseYouTubeUrl(url).videoId;
  const thumbnailUrl = getYouTubeThumbnailUrl(url);

  useEffect(() => {
    let active = true;
    if (!videoId || !url) {
      setMeta({ title: '', authorName: '' });
      return undefined;
    }

    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!active || !payload || typeof payload !== 'object') return;
        setMeta({
          title: String(payload.title || '').trim(),
          authorName: String(payload.author_name || '').trim(),
        });
      })
      .catch(() => {
        if (active) setMeta({ title: '', authorName: '' });
      });

    return () => {
      active = false;
    };
  }, [url, videoId]);

  if (!videoId) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full overflow-hidden rounded-[1.2rem] border border-piu-border/60 bg-piu-card/75 text-left shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-colors hover:border-cyan-300/30"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {thumbnailUrl ? <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-display font-black tracking-[0.18em] text-white">
          YOUTUBE
        </div>
      </div>
      <div className="space-y-1 px-3 py-3">
        <p className="line-clamp-2 text-[14px] font-display font-black text-white">
          {meta.title || 'YouTube video'}
        </p>
        <p className="text-[11px] text-gray-400">
          {[meta.authorName, getExternalHostLabel(url)].filter(Boolean).join(' • ') || 'Watch in chat'}
        </p>
      </div>
    </button>
  );
}

function InAppBrowserModal({ open, title = 'Open link', url, onClose }) {
  if (!open || !url) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="flex h-[min(88vh,46rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.8rem] border border-piu-border/70 bg-[#07111f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-piu-border/40 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-display font-black text-white">{title}</p>
            <p className="truncate text-xs text-gray-500">{getExternalHostLabel(url) || url}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-display font-bold text-cyan-100 transition-colors hover:border-cyan-200/45 hover:text-white"
            >
              Open externally
            </a>
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
        </div>
        <iframe title={title} src={url} className="h-full w-full bg-white" />
      </div>
    </div>
  );
}

function ChatSettingsModal({
  open,
  openLinksExternally,
  onToggleOpenLinksExternally,
  defaultReaction,
  quickReactions = [],
  onDefaultReactionChange,
  onQuickReactionsChange,
  onClose,
}) {
  if (!open) return null;

  const selectedQuickReactions = normalizeReactionKeys(quickReactions);

  const toggleQuickReaction = (reactionKey) => {
    const normalizedKey = sanitizeReactionKey(reactionKey);
    const hasKey = selectedQuickReactions.includes(normalizedKey);
    const next = hasKey
      ? selectedQuickReactions.filter((entry) => entry !== normalizedKey)
      : [...selectedQuickReactions, normalizedKey].slice(0, 5);
    onQuickReactionsChange?.(next.length > 0 ? next : DEFAULT_QUICK_REACTION_KEYS);
  };

  return (
    <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[1.8rem] border border-piu-border/65 bg-[#07111f] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.42)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.24em] text-cyan-200/70">Chat settings</p>
            <h2 className="mt-2 text-2xl font-display font-black text-white">Chat behavior</h2>
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
        <div className="mt-5 space-y-4">
          <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-display font-black text-white">Open web links in external browser</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">
                  Turn this off to open links inside chat. YouTube videos will play in a modal, and other web links will try to load in-app first.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onToggleOpenLinksExternally(!openLinksExternally)}
                className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border transition-colors ${
                  openLinksExternally
                    ? 'border-cyan-300/35 bg-cyan-400/20'
                    : 'border-white/15 bg-white/10'
                }`}
                aria-pressed={openLinksExternally}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-[0_6px_16px_rgba(0,0,0,0.24)] transition-transform ${
                    openLinksExternally ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-display font-black text-white">Default double-tap reaction</p>
            <p className="mt-1 text-xs leading-5 text-gray-400">
              Double-tapping a DM uses this reaction first.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {REACTION_OPTIONS.map((option) => {
                const selected = sanitizeReactionKey(defaultReaction) === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onDefaultReactionChange?.(option.key)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-display font-black transition-colors ${
                      selected
                        ? 'border-cyan-300/35 bg-cyan-400/14 text-white'
                        : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    {renderReactionGlyph(option.key, 'h-4 w-4', selected)}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-display font-black text-white">Quick reaction tray</p>
            <p className="mt-1 text-xs leading-5 text-gray-400">
              Single tap or hover opens this one-line tray. Pick up to 5.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {REACTION_OPTIONS.map((option) => {
                const selected = selectedQuickReactions.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => toggleQuickReaction(option.key)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-display font-black transition-colors ${
                      selected
                        ? 'border-cyan-300/35 bg-cyan-400/14 text-white'
                        : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    {renderReactionGlyph(option.key, 'h-4 w-4', selected)}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getCompareStatusInfo(statusKind, statusLabel) {
  const meta = COMPARE_STATUS_META[String(statusKind || '').trim()] || COMPARE_STATUS_META.shared_best;
  return {
    label: String(statusLabel || '').trim() || meta.fallbackLabel,
    className: meta.className,
  };
}

function CompareStatusPill({ statusKind = '', statusLabel = '', prefix = '' }) {
  const info = getCompareStatusInfo(statusKind, statusLabel);
  return (
    <p className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-display font-bold ${info.className}`}>
      {prefix ? `${prefix}: ${info.label}` : info.label}
    </p>
  );
}

function getResponseStatusPrefix(responseStatus) {
  if (!responseStatus) return 'Latest reply';
  const senderLabel = responseStatus.senderName ? ` by ${responseStatus.senderName}` : '';
  if (responseStatus.statusKind === 'accepted') {
    return `Accepted${senderLabel}`;
  }
  if (responseStatus.statusKind === 'expired') {
    return `Expired${senderLabel}`;
  }
  if (responseStatus.statusKind === 'beat_target' || responseStatus.statusKind === 'pass_earned') {
    return `Challenge complete${senderLabel}`;
  }
  return responseStatus.senderName ? `Latest reply from ${responseStatus.senderName}` : 'Latest reply';
}

function getMessageLabel(message) {
  if (!message) return '';
  if (message.message_type === 'session_share' && message.share?.shareType === 'hour_of_power') {
    return 'Hour of Power recap';
  }
  if (message.message_type === 'session_share') {
    return 'Session recap';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'live_session') {
    return 'Live session invite';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'post') {
    return 'Shared post';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'upscore') {
    return 'Shared upscore';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'clear') {
    return 'Shared clear';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'score_snapshot') {
    return 'Shared score';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'chart_compare') {
    return 'Compare reply';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'story') {
    return 'Shared story';
  }
  if (message.message_type === 'challenge_card' && message.challenge_card?.kind === 'beat_score') {
    if (message.challenge_card?.statusKind === 'accepted') return 'Challenge accepted';
    if (message.challenge_card?.statusKind === 'expired') return 'Challenge expired';
    return 'Score challenge';
  }
  if (message.message_type === 'challenge_card' && message.challenge_card?.kind === 'clear_chart') {
    if (message.challenge_card?.statusKind === 'accepted') return 'Challenge accepted';
    if (message.challenge_card?.statusKind === 'expired') return 'Challenge expired';
    return 'Clear challenge';
  }
  if (message.message_type === 'challenge_card') {
    return 'Challenge';
  }
  if (message.message_type === 'link_share') {
    return 'Shared link';
  }
  if (message.message_type === 'stomp') {
    return 'Stomp';
  }
  if (message.message_type === 'nudge') {
    return 'Nudge';
  }
  return '';
}

function compactReplyPreviewText(value, max = 160) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

function renderReplyPreview(text, max = 140) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return 'Message';
  const truncated = compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;

  // Check if text contains any sticker tokens
  const testRegex = new RegExp(STICKER_TOKEN_REGEX.source, 'gi');
  if (!testRegex.test(truncated)) return truncated;

  // Split text around sticker tokens and render stickers inline
  const parts = [];
  let lastIndex = 0;
  const splitRegex = new RegExp(STICKER_TOKEN_REGEX.source, 'gi');
  let match = splitRegex.exec(truncated);
  while (match) {
    if (match.index > lastIndex) {
      parts.push(truncated.slice(lastIndex, match.index));
    }
    const sticker = getStickerEmoji(match[0]);
    if (sticker) {
      parts.push(
        <StickerAsset
          key={`reply-sticker-${match.index}`}
          sticker={sticker}
          alt={sticker.label}
          title={sticker.label}
          className="inline-block h-6 w-6 align-middle"
        />,
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
    match = splitRegex.exec(truncated);
  }
  if (lastIndex < truncated.length) {
    parts.push(truncated.slice(lastIndex));
  }
  return parts;
}

function buildReplyPreviewText(message) {
  if (!message) return 'Message';

  const contentSnippet = compactReplyPreviewText(message.content);
  if (contentSnippet) return contentSnippet;

  if (message.share?.sessionTitle) {
    return compactReplyPreviewText(message.share.sessionTitle);
  }

  if (message.link_share?.subtitle) {
    return compactReplyPreviewText(message.link_share.subtitle);
  }

  if (message.link_share?.title) {
    return compactReplyPreviewText(message.link_share.title);
  }

  if (message.link_share?.songTitle) {
    return compactReplyPreviewText(message.link_share.songTitle);
  }

  if (message.challenge_card?.statusLabel) {
    return compactReplyPreviewText(message.challenge_card.statusLabel);
  }

  if (message.challenge_card?.targetLabel) {
    return compactReplyPreviewText(message.challenge_card.targetLabel);
  }

  if (message.challenge_card?.subtitle) {
    return compactReplyPreviewText(message.challenge_card.subtitle);
  }

  if (message.note_thread?.noteText) {
    return compactReplyPreviewText(message.note_thread.noteText);
  }

  const messageLabel = getMessageLabel(message);
  return messageLabel || 'Message';
}

function buildReplyDraftTarget(message) {
  if (!message?.id) return null;
  return {
    messageId: String(message.id),
    senderUserId: String(message?.sender?.id || ''),
    senderUsername: String(message?.sender?.username || '').trim() || 'Someone',
    messageType: String(message?.message_type || 'text'),
    previewText: buildReplyPreviewText(message),
  };
}

function hasScoreSnapshotLinkShare(linkShare) {
  if (!linkShare || !['upscore', 'clear', 'score_snapshot'].includes(linkShare.kind)) return false;
  return !!(
    linkShare.songTitle
    && linkShare.mode
    && Number(linkShare.level) > 0
    && (
      Number(linkShare.score) > 0
      || Number(linkShare.oldScore) > 0
      || Number(linkShare.perfect) > 0
      || Number(linkShare.great) > 0
      || Number(linkShare.good) > 0
      || Number(linkShare.bad) > 0
      || Number(linkShare.miss) > 0
      || linkShare.playerName
    )
  );
}

function MessageLinkCard({
  linkShare,
  conversationId = '',
  compareAction = null,
  compareLoading = false,
  responseStatus = null,
  followUpAction = null,
  followUpLoading = false,
  followUpLabel = 'Rematch',
  onOpenLink = null,
}) {
  if (!linkShare) return null;

  const [hydratedLinkShare, setHydratedLinkShare] = useState(null);
  const [jacketLookup, setJacketLookup] = useState(null);
  const needsRichHydration = !hasScoreSnapshotLinkShare(linkShare)
    && ['upscore', 'clear'].includes(linkShare.kind)
    && (!Array.isArray(linkShare.previewItems) || linkShare.previewItems.length === 0);
  const needsJacketLookup = Array.isArray(linkShare?.previewItems)
    && linkShare.previewItems.some((item) => item?.songTitle && !item?.jacketUrl);

  useEffect(() => {
    let active = true;
    if (!needsRichHydration && !needsJacketLookup) {
      setJacketLookup(null);
      return undefined;
    }
    getJacketMap()
      .then((payload) => {
        if (active) setJacketLookup(payload && typeof payload === 'object' ? payload : {});
      })
      .catch(() => {
        if (active) setJacketLookup({});
      });
    return () => {
      active = false;
    };
  }, [needsJacketLookup, needsRichHydration]);

  useEffect(() => {
    let active = true;
    if (!needsRichHydration) {
      setHydratedLinkShare(null);
      return undefined;
    }

    const resourceId = parseResourceIdFromPath(linkShare.path, linkShare.kind);
    if (!resourceId) {
      setHydratedLinkShare(null);
      return undefined;
    }

    (async () => {
      try {
        if (linkShare.kind === 'clear') {
          const [clearItem, lookup] = await Promise.all([
            getNewClear(resourceId),
            jacketLookup ? Promise.resolve(jacketLookup) : getJacketMap().catch(() => ({})),
          ]);
          const rebuilt = buildClearLinkShare({
            clearId: resourceId,
            username: clearItem?.username || linkShare.playerName || '',
            clears: getClearItems(clearItem),
          });
          if (!active || !rebuilt?.previewItems?.length) return;
          setHydratedLinkShare({
            ...rebuilt,
            ...linkShare,
            previewItems: enrichPreviewItemsWithJackets(rebuilt.previewItems, lookup),
            totalItemCount: rebuilt.totalItemCount,
            extraItemCount: rebuilt.extraItemCount,
            title: rebuilt.title || linkShare.title,
            subtitle: rebuilt.subtitle || linkShare.subtitle,
            buttonLabel: linkShare.buttonLabel || rebuilt.buttonLabel,
            path: linkShare.path || rebuilt.path,
            url: linkShare.url || rebuilt.url,
          });
          return;
        }

        const [upscoreItem, lookup] = await Promise.all([
          getUpscore(resourceId),
          jacketLookup ? Promise.resolve(jacketLookup) : getJacketMap().catch(() => ({})),
        ]);
        const rebuilt = buildUpscoreLinkShare({
          upscoreId: resourceId,
          username: upscoreItem?.username || linkShare.playerName || '',
          upscores: parseUpscoreItems(upscoreItem),
        });
        if (!active || !rebuilt?.previewItems?.length) return;
        setHydratedLinkShare({
          ...rebuilt,
          ...linkShare,
          previewItems: enrichPreviewItemsWithJackets(rebuilt.previewItems, lookup),
          totalItemCount: rebuilt.totalItemCount,
          extraItemCount: rebuilt.extraItemCount,
          title: rebuilt.title || linkShare.title,
          subtitle: rebuilt.subtitle || linkShare.subtitle,
          buttonLabel: linkShare.buttonLabel || rebuilt.buttonLabel,
          path: linkShare.path || rebuilt.path,
          url: linkShare.url || rebuilt.url,
        });
      } catch {
        if (active) setHydratedLinkShare(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [jacketLookup, linkShare, needsRichHydration]);

  const resolvedLinkShare = useMemo(() => {
    const baseShare = hydratedLinkShare?.previewItems?.length ? hydratedLinkShare : linkShare;
    if (!baseShare || !Array.isArray(baseShare.previewItems) || !baseShare.previewItems.length || !jacketLookup) {
      return baseShare;
    }
    if (!baseShare.previewItems.some((item) => item?.songTitle && !item?.jacketUrl)) {
      return baseShare;
    }
    return {
      ...baseShare,
      previewItems: enrichPreviewItemsWithJackets(baseShare.previewItems, jacketLookup),
    };
  }, [hydratedLinkShare, jacketLookup, linkShare]);

  const title = String(resolvedLinkShare.title || '').trim() || 'Open link';
  const subtitle = String(resolvedLinkShare.subtitle || '').trim();
  const badge = LINK_SHARE_BADGES[resolvedLinkShare.kind] || 'Link';
  const buttonLabel = String(resolvedLinkShare.buttonLabel || '').trim() || 'Open';
  const isCompare = resolvedLinkShare.kind === 'chart_compare';
  const frameClass = isCompare
    ? 'border-emerald-300/25 bg-emerald-500/10'
    : 'border-piu-border/60 bg-piu-card/70';
  const badgeClass = isCompare ? 'text-emerald-200/85' : 'text-cyan-200/75';
  const buttonClass = isCompare
    ? 'border-emerald-300/30 bg-emerald-500/12 text-emerald-100 hover:border-emerald-200/40 hover:text-white'
    : 'border-piu-border/70 bg-piu-dark/40 text-cyan-100 hover:border-cyan-300/35 hover:text-white';
  const compareButtonLabel = responseStatus ? 'Send updated best' : 'Reply with my best';
  const isScoreSnapshot = hasScoreSnapshotLinkShare(resolvedLinkShare);
  const isMultiScoreShare = !isScoreSnapshot
    && ['upscore', 'clear'].includes(resolvedLinkShare.kind)
    && Array.isArray(resolvedLinkShare.previewItems)
    && resolvedLinkShare.previewItems.length > 0;
  const isStoryShare = resolvedLinkShare.kind === 'story';
  const isYouTubeShare = !resolvedLinkShare.path && !!parseYouTubeUrl(resolvedLinkShare.url).videoId;
  const handlePrimaryOpen = () => onOpenLink?.(resolvedLinkShare);
  const replayUrl = String(resolvedLinkShare.replayUrl || '').trim();
  const replayTitle = buildReplayModalTitle({
    song_title: resolvedLinkShare.songTitle,
    mode: resolvedLinkShare.mode,
    level: resolvedLinkShare.level,
    grade: resolvedLinkShare.grade,
    new_grade: resolvedLinkShare.grade,
    score: resolvedLinkShare.score,
    new_score: resolvedLinkShare.score,
  });
  const handleOpenReplay = () => {
    if (!replayUrl) return;
    onOpenLink?.({
      url: replayUrl,
      title: replayTitle,
      forceEmbed: true,
    });
  };

  if (isScoreSnapshot) {
    const snapshotScore = {
      song_title: resolvedLinkShare.songTitle,
      mode: resolvedLinkShare.mode,
      level: resolvedLinkShare.level,
      score: resolvedLinkShare.score,
      grade: resolvedLinkShare.grade,
      is_stage_break: resolvedLinkShare.isStageBreak,
      old_score: resolvedLinkShare.oldScore,
      old_grade: resolvedLinkShare.oldGrade,
      scoreDelta: resolvedLinkShare.scoreDelta,
      over_top100_rank: resolvedLinkShare.overTop100Rank,
      plate: resolvedLinkShare.plate,
      perfect: resolvedLinkShare.perfect,
      great: resolvedLinkShare.great,
      good: resolvedLinkShare.good,
      bad: resolvedLinkShare.bad,
      miss: resolvedLinkShare.miss,
      username: resolvedLinkShare.playerName,
      playerAvatar: resolvedLinkShare.playerAvatar,
      playerSkillTitle: resolvedLinkShare.playerSkillTitle,
      playerRoleLabel: resolvedLinkShare.playerRoleLabel,
      contextLabel: resolvedLinkShare.contextLabel,
      date_played: resolvedLinkShare.playedAt,
      replayUrl,
      replay_start_seconds: resolvedLinkShare.replayStartSeconds,
      replay_end_seconds: resolvedLinkShare.replayEndSeconds,
    };

    return (
      <div className="w-full space-y-2">
        <p className="px-1 text-[9px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/75">{badge}</p>
        <ScoreSnapshotCard
          score={snapshotScore}
          jacketUrl={resolvedLinkShare.jacketUrl}
          chartLink={resolvedLinkShare.chartPath || ''}
          replayUrl={replayUrl}
          replayTitle={replayTitle}
          onOpenReplay={replayUrl ? handleOpenReplay : null}
        />
        {responseStatus ? (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <CompareStatusPill
              statusKind={responseStatus.statusKind}
              statusLabel={responseStatus.statusLabel}
              prefix={getResponseStatusPrefix(responseStatus)}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5 px-1">
          <button
            type="button"
            onClick={handlePrimaryOpen}
            className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </button>
          {compareAction ? (
            <button
              type="button"
              onClick={compareAction}
              disabled={compareLoading}
              className="inline-flex rounded-md border border-emerald-300/35 bg-emerald-500/12 px-2.5 py-1.5 text-[10px] font-display font-bold text-emerald-100 transition-colors hover:border-emerald-200/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {compareLoading ? 'Sending...' : compareButtonLabel}
            </button>
          ) : null}
          {followUpAction ? (
            <button
              type="button"
              onClick={followUpAction}
              disabled={followUpLoading}
              className="inline-flex rounded-md border border-amber-300/30 bg-amber-500/12 px-2.5 py-1.5 text-[10px] font-display font-bold text-amber-100 transition-colors hover:border-amber-200/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {followUpLoading ? 'Sending...' : followUpLabel}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (isMultiScoreShare) {
    return (
      <MultiScorePreviewCard
        linkShare={resolvedLinkShare}
        badge={badge}
        buttonClass={buttonClass}
        onOpenLink={handlePrimaryOpen}
      />
    );
  }

  if (isStoryShare) {
    return (
      <StorySharePreviewCard
        linkShare={resolvedLinkShare}
        buttonClass={buttonClass}
        onOpenLink={handlePrimaryOpen}
        conversationId={conversationId}
      />
    );
  }

  return (
    <div className={`w-full rounded-[1.2rem] border px-3 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.16)] ${frameClass}`}>
      <p className={`text-[9px] font-display font-bold uppercase tracking-[0.18em] ${badgeClass}`}>{badge}</p>
      <p className="mt-1 text-[15px] font-display font-black leading-tight text-white">{title}</p>
      {subtitle ? <p className="mt-1 text-[12px] leading-5 text-gray-300">{subtitle}</p> : null}
      {isYouTubeShare ? (
        <div className="mt-3">
          <YouTubeMessagePreviewCard url={resolvedLinkShare.url} onOpen={handlePrimaryOpen} />
        </div>
      ) : null}
      {isCompare && resolvedLinkShare.statusLabel ? (
        <div className="mt-2.5">
          <CompareStatusPill statusKind={resolvedLinkShare.statusKind} statusLabel={resolvedLinkShare.statusLabel} />
        </div>
      ) : null}
      {!isCompare && responseStatus ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <CompareStatusPill
            statusKind={responseStatus.statusKind}
            statusLabel={responseStatus.statusLabel}
            prefix={getResponseStatusPrefix(responseStatus)}
          />
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={handlePrimaryOpen}
          className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors ${buttonClass}`}
        >
          {buttonLabel}
        </button>
        {compareAction ? (
          <button
            type="button"
            onClick={compareAction}
            disabled={compareLoading}
            className="inline-flex rounded-md border border-emerald-300/35 bg-emerald-500/12 px-2.5 py-1.5 text-[10px] font-display font-bold text-emerald-100 transition-colors hover:border-emerald-200/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {compareLoading ? 'Sending...' : compareButtonLabel}
          </button>
        ) : null}
        {followUpAction ? (
          <button
            type="button"
            onClick={followUpAction}
            disabled={followUpLoading}
            className="inline-flex rounded-md border border-amber-300/30 bg-amber-500/12 px-2.5 py-1.5 text-[10px] font-display font-bold text-amber-100 transition-colors hover:border-amber-200/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {followUpLoading ? 'Sending...' : followUpLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessageChallengeCard({
  challengeCard,
  compareAction = null,
  compareLoading = false,
  responseStatus = null,
  lifecycleAction = null,
  lifecycleLoading = false,
  lifecycleLabel = 'Accept',
}) {
  const [challengeJacketLookup, setChallengeJacketLookup] = useState(null);
  const challengeSongTitle = String(challengeCard?.songTitle || '').trim();
  const challengeMode = String(challengeCard?.mode || '').trim();
  const challengeLevel = Number(challengeCard?.level) || 0;
  const challengeJacketUrl = String(challengeCard?.jacketUrl || '').trim();
  const needsChallengeJacketLookup = !!challengeSongTitle && !challengeJacketUrl;

  useEffect(() => {
    let active = true;
    if (!needsChallengeJacketLookup) {
      setChallengeJacketLookup(null);
      return undefined;
    }
    getJacketMap()
      .then((payload) => {
        if (active) setChallengeJacketLookup(payload && typeof payload === 'object' ? payload : {});
      })
      .catch(() => {
        if (active) setChallengeJacketLookup({});
      });
    return () => {
      active = false;
    };
  }, [needsChallengeJacketLookup, challengeLevel, challengeMode, challengeSongTitle]);

  const resolvedChallengeJacketUrl = useMemo(() => resolveChartJacketUrl({
    title: challengeSongTitle,
    mode: challengeMode,
    level: challengeLevel,
    jacketLookup: challengeJacketLookup || {},
    jacketUrl: challengeJacketUrl,
  }), [challengeJacketLookup, challengeJacketUrl, challengeLevel, challengeMode, challengeSongTitle]);

  if (!challengeCard) return null;

  const badge = CHALLENGE_BADGES[challengeCard.kind] || 'Challenge';
  const title = String(challengeCard.title || '').trim() || badge;
  const subtitle = String(challengeCard.subtitle || '').trim();
  const targetLabel = String(challengeCard.targetLabel || '').trim();
  const detailLabel = String(challengeCard.detailLabel || '').trim();
  const buttonLabel = String(challengeCard.buttonLabel || '').trim() || 'Open challenge';
  const compareButtonLabel = responseStatus ? 'Send updated best' : 'Reply with my best';
  const hasLifecycleStatus = !!String(challengeCard.statusKind || '').trim();
  const detailBits = detailLabel
    .split('•')
    .map((bit) => bit.trim())
    .filter(Boolean);
  const metadataBits = [
    challengeMode,
    challengeLevel > 0 ? `Level ${challengeLevel}` : '',
  ].filter(Boolean);
  const contextLine = String(challengeCard.originUsername || '').trim()
    ? `${String(challengeCard.originUsername || '').trim()} challenged you`
    : subtitle;
  const captionLine = subtitle && subtitle !== contextLine ? subtitle : '';
  const isClearChallenge = challengeCard.kind === 'clear_chart';
  const theme = isClearChallenge
    ? {
      badgeClass: 'text-amber-200/78',
      glowClass: 'bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.05),transparent_36%)]',
      targetClass: 'border-amber-300/18 bg-amber-500/8 text-amber-50',
      actionClass: 'border-amber-300/20 bg-[#121624] text-amber-100 hover:border-amber-300/28 hover:bg-[#161c2c]',
      responseClass: 'border-emerald-300/20 bg-[#121925] text-emerald-100 hover:border-emerald-300/28 hover:bg-[#162033]',
      lifecycleClass: 'border-cyan-300/20 bg-[#121925] text-cyan-50 hover:border-cyan-300/28 hover:bg-[#172033]',
      metaClass: 'text-amber-100/72',
    }
    : {
      badgeClass: 'text-cyan-200/78',
      glowClass: 'bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(167,139,250,0.05),transparent_38%)]',
      targetClass: 'border-cyan-300/18 bg-cyan-500/8 text-cyan-50',
      actionClass: 'border-cyan-300/20 bg-[#121624] text-cyan-100 hover:border-cyan-300/28 hover:bg-[#161c2c]',
      responseClass: 'border-emerald-300/20 bg-[#121925] text-emerald-100 hover:border-emerald-300/28 hover:bg-[#162033]',
      lifecycleClass: 'border-sky-300/20 bg-[#121925] text-sky-50 hover:border-sky-300/28 hover:bg-[#172033]',
      metaClass: 'text-cyan-100/72',
    };

  return (
    <div className="relative isolate w-full overflow-hidden rounded-[1.4rem] border border-piu-border/65 bg-[linear-gradient(180deg,#111525_0%,#0c1120_100%)] px-3 py-3 shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
      <div className={`pointer-events-none absolute inset-0 ${theme.glowClass}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[9px] font-display font-bold uppercase tracking-[0.22em] ${theme.badgeClass}`}>{badge}</p>
          <p className="mt-1.5 text-[17px] font-display font-black leading-tight text-white sm:text-[19px]">{title}</p>
        </div>
        {targetLabel ? (
          <span className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-display font-black tracking-[0.12em] ${theme.targetClass}`}>
            {targetLabel}
          </span>
        ) : null}
      </div>
      <div className="relative mt-3 rounded-[1.2rem] border border-white/10 bg-piu-dark/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div className="flex items-center gap-3">
          <PiuChartJacket
            title={challengeSongTitle || title}
            mode={challengeMode}
            level={challengeLevel}
            jacketUrl={resolvedChallengeJacketUrl}
            size="wide"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-display font-black text-white">
              {challengeSongTitle || title}
            </p>
            {metadataBits.length ? (
              <p className={`mt-0.5 text-[11px] font-display font-bold ${theme.metaClass}`}>{metadataBits.join(' • ')}</p>
            ) : null}
            {contextLine ? (
              <p className="mt-1 text-[12px] leading-5 text-gray-300">{contextLine}</p>
            ) : null}
            {captionLine ? (
              <p className="mt-0.5 text-[11px] leading-5 text-gray-400">{captionLine}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
        {hasLifecycleStatus ? (
          <CompareStatusPill statusKind={challengeCard.statusKind} statusLabel={challengeCard.statusLabel} />
        ) : null}
        {responseStatus ? (
          <CompareStatusPill
            statusKind={responseStatus.statusKind}
            statusLabel={responseStatus.statusLabel}
            prefix={getResponseStatusPrefix(responseStatus)}
          />
        ) : null}
      </div>
      {detailBits.length ? (
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {detailBits.map((bit) => (
            <span
              key={bit}
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-display font-bold tracking-[0.12em] text-gray-200"
            >
              {bit}
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative mt-3 flex flex-wrap gap-1.5">
        <Link
          to={challengeCard.path}
          className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors ${theme.actionClass}`}
        >
          {buttonLabel}
        </Link>
        {compareAction ? (
          <button
            type="button"
            onClick={compareAction}
            disabled={compareLoading}
            className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${theme.responseClass}`}
          >
            {compareLoading ? 'Sending...' : compareButtonLabel}
          </button>
        ) : null}
        {lifecycleAction ? (
          <button
            type="button"
            onClick={lifecycleAction}
            disabled={lifecycleLoading}
            className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${theme.lifecycleClass}`}
          >
            {lifecycleLoading ? 'Sending...' : lifecycleLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  conversationId = '',
  chatTheme = null,
  onReplyWithBest = null,
  compareLoading = false,
  responseStatus = null,
  onFollowUp = null,
  followUpLoading = false,
  lifecycleAction = null,
  lifecycleLoading = false,
  lifecycleLabel = 'Accept',
  onOpenThread = null,
  onOpenLink = null,
  onReply = null,
  activeReplyMessageId = '',
  replyHighlightVersion = 0,
  touchInteractionsEnabled = true,
  touchInteractionsBlockedUntil = 0,
  availableReactions = DEFAULT_QUICK_REACTION_KEYS,
  defaultReaction = 'pump',
  onReact = null,
}) {
  const isOwn = !!message?.is_own;
  const hasContent = !!String(message?.content || '').trim();
  const hasShare = !!message?.share;
  const hasLinkShare = !!message?.link_share;
  const hasChallengeCard = !!message?.challenge_card;
  const hasRichAttachment = hasShare || hasLinkShare || hasChallengeCard;
  const coarsePointerDevice = isCoarsePointerDevice();
  const alignmentClass = isOwn ? 'items-end' : 'items-start';
  const themedOwnBg = chatTheme ? `${chatTheme.ownBubbleBorder} ${chatTheme.ownBubbleBg}` : 'border-cyan-400/20 bg-cyan-500/10';
  const themedOtherBg = chatTheme ? `${chatTheme.otherBubbleBorder} ${chatTheme.otherBubbleBg}` : 'border-piu-border/60 bg-piu-dark/55';
  const bubbleTone = isOwn ? themedOwnBg : themedOtherBg;
  const bubbleTextClass = chatTheme ? (isOwn ? chatTheme.ownBubbleText : chatTheme.otherBubbleText) : '';
  const senderName = message?.sender?.username || 'Unknown';
  const senderAvatar = message?.sender?.avatar || '';
  const shareLabel = getMessageLabel(message);
  const noteThread = message?.note_thread || null;
  const replyTo = message?.reply_to || null;
  const hasLongUnbrokenToken = /\S{24,}/.test(String(message?.content || ''));
  const inlineYouTubeUrl = !hasShare && !hasLinkShare && !hasChallengeCard
    ? extractFirstYouTubeUrl(message?.content || '')
    : '';
  const suppressRawUrlContent = !!inlineYouTubeUrl && isStandaloneUrlMessage(message?.content || '', inlineYouTubeUrl);
  const isAttachmentOnly = (hasRichAttachment && !hasContent) || (!hasRichAttachment && suppressRawUrlContent);
  const themeRadius = chatTheme?.bubbleRadius || '1.25rem';
  const themeShadow = chatTheme?.shadow ?? '0 8px 20px rgba(0,0,0,0.14)';
  const bubbleClass = isAttachmentOnly
    ? 'w-full max-w-[19.25rem] sm:max-w-[22.5rem]'
    : `border ${bubbleTone} px-2.5 py-2 ${chatTheme?.extraBubbleClass || ''} ${bubbleTextClass}`.trim();
  const reactionItems = Array.isArray(message?.reactions) ? message.reactions : [];
  const viewerReaction = sanitizeReactionKey(message?.viewer_reaction);
  const trayKeys = normalizeReactionKeys(availableReactions).length > 0
    ? normalizeReactionKeys(availableReactions)
    : DEFAULT_QUICK_REACTION_KEYS;
  const isReplyTarget = String(activeReplyMessageId || '').trim() !== '' && String(message?.id || '') === String(activeReplyMessageId);
  const [trayOpen, setTrayOpen] = useState(false);
  const tapStateRef = useRef({ lastTapAt: 0, timer: null });
  const interactionLockUntilRef = useRef(0);
  const bubbleRef = useRef(null);
  const mobileTrayRef = useRef(null);
  const [replyFlashActive, setReplyFlashActive] = useState(false);
  const [mobileTrayStyle, setMobileTrayStyle] = useState({ left: 12, top: 12 });
  const [mobileTrayPlacement, setMobileTrayPlacement] = useState('above');
  const [mobileTrayReady, setMobileTrayReady] = useState(false);
  const swipeStateRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    active: false,
    moved: false,
    ignoreClick: false,
  });
  const [replySwipeOffset, setReplySwipeOffset] = useState(0);
  const [replySwipeDragging, setReplySwipeDragging] = useState(false);

  const areTouchInteractionsBlocked = () => (
    !touchInteractionsEnabled
    || (Number(touchInteractionsBlockedUntil) > 0 && Date.now() < Number(touchInteractionsBlockedUntil))
  );
  const isInteractionLocked = () => Date.now() < Number(interactionLockUntilRef.current || 0);
  const clearTapTimer = useCallback(() => {
    if (tapStateRef.current.timer) {
      window.clearTimeout(tapStateRef.current.timer);
      tapStateRef.current.timer = null;
    }
  }, []);
  const armInteractionLock = useCallback((durationMs = 320) => {
    interactionLockUntilRef.current = Date.now() + durationMs;
  }, []);

  const closeTray = useCallback(() => {
    setTrayOpen(false);
  }, []);
  const triggerReaction = useCallback((reactionKey) => {
    if (!message?.id || !onReact) return;
    onReact(message, reactionKey);
  }, [message, onReact]);
  const handleTrayReactionSelect = useCallback((reactionKey) => {
    clearTapTimer();
    tapStateRef.current.lastTapAt = 0;
    armInteractionLock();
    triggerReaction(reactionKey);
    closeTray();
  }, [armInteractionLock, clearTapTimer, closeTray, triggerReaction]);
  const trayButtons = trayKeys.map((reactionKey) => {
    const selected = viewerReaction === reactionKey;
    return (
      <button
        key={`${message?.id}-${reactionKey}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleTrayReactionSelect(reactionKey);
        }}
        className={`inline-flex h-9 min-w-[2.35rem] items-center justify-center rounded-full border px-2.5 transition-colors ${
          selected
            ? 'border-cyan-300/40 bg-cyan-400/18 shadow-[0_10px_18px_rgba(34,211,238,0.14)]'
            : 'border-white/10 bg-[#141c2b] hover:border-white/14 hover:bg-[#1a2436]'
        }`}
        aria-label={`React with ${getReactionOption(reactionKey).label}`}
      >
        {renderReactionGlyph(reactionKey, 'h-4 w-4', selected)}
      </button>
    );
  });

  const trayBody = (
    <div className="flex items-center gap-1 rounded-[1.15rem] border border-white/12 bg-[#090f1c] px-2 py-1.5 shadow-[0_18px_36px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)]">
      {trayButtons}
    </div>
  );
  const mobileTrayOpen = trayOpen && coarsePointerDevice;

  useEffect(() => () => {
    clearTapTimer();
  }, [clearTapTimer]);

  useEffect(() => {
    if (!mobileTrayOpen || typeof window === 'undefined') return undefined;
    setMobileTrayReady(false);

    const updatePosition = () => {
      const bubbleRect = bubbleRef.current?.getBoundingClientRect();
      const trayRect = mobileTrayRef.current?.getBoundingClientRect();
      if (!bubbleRect || !trayRect) return;

      const viewportPadding = 12;
      const trayGap = 10;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const preferredLeft = bubbleRect.left + (bubbleRect.width / 2) - (trayRect.width / 2);
      const maxLeft = Math.max(viewportPadding, viewportWidth - trayRect.width - viewportPadding);
      const nextLeft = Math.max(viewportPadding, Math.min(maxLeft, preferredLeft));

      const aboveTop = bubbleRect.top - trayRect.height - trayGap;
      const belowTop = bubbleRect.bottom + trayGap;
      const fitsAbove = aboveTop >= viewportPadding;
      const fitsBelow = belowTop + trayRect.height <= viewportHeight - viewportPadding;
      const nextPlacement = fitsAbove || !fitsBelow ? 'above' : 'below';
      const preferredTop = nextPlacement === 'above' ? aboveTop : belowTop;
      const maxTop = Math.max(viewportPadding, viewportHeight - trayRect.height - viewportPadding);
      const nextTop = Math.max(viewportPadding, Math.min(maxTop, preferredTop));

      setMobileTrayPlacement(nextPlacement);
      setMobileTrayStyle({
        left: Math.round(nextLeft),
        top: Math.round(nextTop),
      });
      setMobileTrayReady(true);
    };

    const animationFrameId = window.requestAnimationFrame(updatePosition);
    const handleOutsidePointerDown = (event) => {
      const target = event.target;
      if (mobileTrayRef.current?.contains(target) || bubbleRef.current?.contains(target)) return;
      closeTray();
    };
    const handleScroll = () => closeTray();
    const handleResize = () => window.requestAnimationFrame(updatePosition);

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [closeTray, mobileTrayOpen]);

  useEffect(() => {
    if (!isReplyTarget || !replyHighlightVersion) return undefined;
    setReplyFlashActive(true);
    const timeoutId = window.setTimeout(() => {
      setReplyFlashActive(false);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [isReplyTarget, replyHighlightVersion]);

  const resetReplySwipe = useCallback(() => {
    swipeStateRef.current.pointerId = null;
    swipeStateRef.current.startX = 0;
    swipeStateRef.current.startY = 0;
    swipeStateRef.current.active = false;
    swipeStateRef.current.moved = false;
    setReplySwipeOffset(0);
    setReplySwipeDragging(false);
  }, []);

  useEffect(() => {
    if (!areTouchInteractionsBlocked()) return undefined;
    clearTapTimer();
    tapStateRef.current.lastTapAt = 0;
    setTrayOpen(false);
    resetReplySwipe();
    return undefined;
  }, [clearTapTimer, resetReplySwipe, touchInteractionsBlockedUntil, touchInteractionsEnabled]);

  const triggerReply = useCallback(() => {
    if (!message?.id || !onReply) return;
    onReply(message);
  }, [message, onReply]);

  const handlePointerDown = (event) => {
    if (event.pointerType !== 'touch') return;
    if (areTouchInteractionsBlocked()) return;
    if (isInteractionLocked()) return;
    if (event?.target?.closest?.('button,a,textarea,input,select')) return;
    swipeStateRef.current.pointerId = event.pointerId;
    swipeStateRef.current.startX = event.clientX;
    swipeStateRef.current.startY = event.clientY;
    swipeStateRef.current.active = true;
    swipeStateRef.current.moved = false;
    if (event.currentTarget?.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (event) => {
    if (event.pointerType !== 'touch') return;
    if (areTouchInteractionsBlocked()) {
      resetReplySwipe();
      return;
    }
    if (!swipeStateRef.current.active || swipeStateRef.current.pointerId !== event.pointerId) return;

    const dx = event.clientX - swipeStateRef.current.startX;
    const dy = event.clientY - swipeStateRef.current.startY;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      swipeStateRef.current.moved = true;
    }

    if (Math.abs(dy) > 32 && Math.abs(dy) > Math.abs(dx)) {
      resetReplySwipe();
      return;
    }

    const offset = Math.max(0, Math.min(REPLY_SWIPE_MAX_OFFSET, dx));
    if (offset <= 0) return;

    swipeStateRef.current.ignoreClick = true;
    setReplySwipeDragging(true);
    setReplySwipeOffset(offset);
  };

  const handlePointerUp = (event) => {
    if (event.pointerType === 'touch' && swipeStateRef.current.pointerId === event.pointerId) {
      if (areTouchInteractionsBlocked()) {
        resetReplySwipe();
        return;
      }
      if (isInteractionLocked()) {
        resetReplySwipe();
        return;
      }
      const shouldReply = replySwipeOffset >= REPLY_SWIPE_TRIGGER_OFFSET;
      const shouldTreatAsTap = swipeStateRef.current.active && !swipeStateRef.current.moved && replySwipeOffset < 8;
      if (shouldReply) {
        clearTapTimer();
        tapStateRef.current.lastTapAt = 0;
        triggerReply();
        closeTray();
      } else if (shouldTreatAsTap && !event?.target?.closest?.('button,a,textarea,input,select')) {
        if (coarsePointerDevice) {
          const now = Date.now();
          if (now - tapStateRef.current.lastTapAt < 260) {
            clearTapTimer();
            tapStateRef.current.lastTapAt = 0;
            armInteractionLock();
            triggerReaction(defaultReaction);
            closeTray();
          } else {
            tapStateRef.current.lastTapAt = now;
            clearTapTimer();
            tapStateRef.current.timer = window.setTimeout(() => {
              setTrayOpen(true);
              tapStateRef.current.lastTapAt = 0;
              tapStateRef.current.timer = null;
            }, 220);
          }
        } else {
          const now = Date.now();
          if (now - tapStateRef.current.lastTapAt < 260) {
            clearTapTimer();
            tapStateRef.current.lastTapAt = 0;
            triggerReaction(defaultReaction);
            closeTray();
          } else {
            tapStateRef.current.lastTapAt = now;
            clearTapTimer();
            tapStateRef.current.timer = window.setTimeout(() => {
              setTrayOpen((current) => !current);
              tapStateRef.current.timer = null;
            }, 210);
          }
        }
      }
      if (event.currentTarget?.releasePointerCapture) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {}
      }
      window.setTimeout(() => {
        swipeStateRef.current.ignoreClick = false;
      }, 120);
      resetReplySwipe();
    }
  };

  const handleBubbleClick = (event) => {
    if (coarsePointerDevice) return;
    if (isInteractionLocked()) return;
    if (event?.nativeEvent?.pointerType === 'touch') return;
    if (window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (event?.target?.closest?.('button,a,textarea,input,select')) return;
    if (swipeStateRef.current.ignoreClick) {
      swipeStateRef.current.ignoreClick = false;
      return;
    }
    const now = Date.now();
    if (now - tapStateRef.current.lastTapAt < 260) {
      clearTapTimer();
      tapStateRef.current.lastTapAt = 0;
      triggerReaction(defaultReaction);
      closeTray();
      return;
    }

    tapStateRef.current.lastTapAt = now;
    clearTapTimer();
    tapStateRef.current.timer = window.setTimeout(() => {
      setTrayOpen((current) => !current);
      tapStateRef.current.timer = null;
    }, 210);
  };

  if (message?.message_type === 'nudge') {
    const nudgeSenderName = message?.sender?.username || 'Someone';
    return (
      <div className="flex w-full flex-col items-center py-2">
        <div
          className="group relative flex items-center gap-3 rounded-2xl border border-purple-400/25 bg-gradient-to-r from-purple-500/8 via-fuchsia-400/12 to-purple-500/8 px-5 py-3 shadow-[0_4px_24px_rgba(168,85,247,0.08)] transition-all duration-500 hover:border-purple-400/40 hover:shadow-[0_4px_32px_rgba(168,85,247,0.18)]"
          style={{ animation: 'nudge-shake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both' }}
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <span
              className="text-2xl drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]"
              style={{ animation: 'nudge-buzz 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both' }}
            >
              📳
            </span>
            <span
              className="pointer-events-none absolute inset-0 rounded-full bg-purple-400/20"
              style={{ animation: 'nudge-ring 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both' }}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-display font-black text-purple-100/90">
              <span className="text-purple-300">{nudgeSenderName}</span>
              {' '}
              <span className="text-gray-300">{message.content || 'sent a nudge!'}</span>
            </p>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-gray-500">{formatConversationTime(message?.created_at)}</p>
      </div>
    );
  }

  if (message?.message_type === 'stomp') {
    const stompSenderName = message?.sender?.username || 'Someone';
    return (
      <div className="flex w-full flex-col items-center py-2">
        <div className="group relative flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-gradient-to-r from-amber-500/8 via-amber-400/12 to-amber-500/8 px-5 py-3 shadow-[0_4px_24px_rgba(251,191,36,0.08)] transition-all duration-500 hover:border-amber-300/35 hover:shadow-[0_4px_32px_rgba(251,191,36,0.14)]"
          style={{ animation: 'stomp-land 0.5s cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <img
              src="/piu/stomp-yellow.svg"
              alt=""
              className="h-8 w-8 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-8deg]"
              style={{ animation: 'stomp-bounce 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both' }}
            />
            <span
              className="pointer-events-none absolute inset-0 rounded-full bg-amber-300/15"
              style={{ animation: 'stomp-ripple 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both' }}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-display font-black text-amber-100/90">
              <span className="text-amber-300">{stompSenderName}</span>
              {' '}
              <span className="text-gray-300">{message.content || 'stomped you'}</span>
            </p>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-gray-500">{formatConversationTime(message?.created_at)}</p>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col ${alignmentClass}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        setTrayOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        setTrayOpen(false);
      }}
    >
      {!isOwn ? (
        <div className={`mb-1 flex items-center gap-1.5 px-1 ${chatTheme?.showAvatars ? '' : ''}`}>
          {chatTheme?.showAvatars && senderAvatar ? (
            <img src={senderAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : chatTheme?.showAvatars ? (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-400/20 text-[9px] font-bold text-gray-400">
              {senderName.slice(0, 1).toUpperCase()}
            </div>
          ) : null}
          <p className={chatTheme?.senderNameClass || 'text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500'}>
            {senderName}
          </p>
        </div>
      ) : null}
      {touchInteractionsEnabled && mobileTrayOpen ? (
        <div
          ref={mobileTrayRef}
          className="fixed z-[95] sm:hidden"
          style={{
            left: `${mobileTrayStyle.left}px`,
            top: `${mobileTrayStyle.top}px`,
            maxWidth: 'calc(100vw - 1.5rem)',
            opacity: mobileTrayReady ? 1 : 0,
            pointerEvents: mobileTrayReady ? 'auto' : 'none',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className={`flex min-h-[3.7rem] items-center justify-center rounded-[1.5rem] border border-white/12 bg-[#070c16] px-3 py-2.5 shadow-[0_24px_50px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-150 ${
              mobileTrayPlacement === 'below'
                ? 'origin-top translate-y-0'
                : 'origin-bottom translate-y-0'
            }`}
          >
            <div className="flex w-full items-center justify-center gap-1.5 rounded-[1.2rem] bg-[#0c1221] px-2 py-1.5">
              {trayButtons}
            </div>
          </div>
        </div>
      ) : null}
      <div className="relative max-w-[85%]" style={{ touchAction: 'pan-y', width: 'fit-content' }}>
        {trayOpen ? (
          <div
            className={`pointer-events-none absolute top-1/2 z-20 hidden -translate-y-1/2 sm:flex ${
              isOwn ? 'right-full mr-2 justify-end' : 'left-full ml-2 justify-start'
            }`}
          >
            <div className="pointer-events-auto">
              {trayBody}
            </div>
          </div>
        ) : null}
        <div
          className={`pointer-events-none absolute left-0 top-1/2 z-[1] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[0_10px_24px_rgba(34,211,238,0.16)] transition-all duration-200 ${
            replySwipeOffset > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
          }`}
          style={{
            transform: `translateY(-50%) scale(${0.75 + Math.min(0.25, replySwipeOffset / REPLY_SWIPE_TRIGGER_OFFSET * 0.25)})`,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9 5 12l5 3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h9a5 5 0 0 1 5 5" />
          </svg>
        </div>
        <div
          ref={bubbleRef}
          className={`${bubbleClass} ${isReplyTarget ? 'ring-1 ring-cyan-300/18 shadow-[0_0_0_1px_rgba(103,232,249,0.08),0_14px_28px_rgba(8,145,178,0.12)]' : ''} ${replyFlashActive ? 'animate-pulse' : ''}`}
          style={{
            transform: replySwipeOffset > 0 ? `translateX(${replySwipeOffset}px)` : 'translateX(0px)',
            transition: replySwipeDragging ? 'none' : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
            ...(!isAttachmentOnly ? { borderRadius: themeRadius, boxShadow: themeShadow !== 'none' ? themeShadow : undefined } : {}),
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleBubbleClick}
        >
          {isReplyTarget ? (
            <div className={`mb-2 flex items-center gap-2 text-[10px] font-display font-black uppercase tracking-[0.16em] ${bubbleTextClass ? 'opacity-70' : 'text-cyan-100/82'}`}>
              <span className={`h-2 w-2 rounded-full bg-cyan-300 ${replyFlashActive ? 'animate-pulse' : ''}`} />
              Reply target
            </div>
          ) : null}
        {replyTo ? (
          <div
            className={`mb-2 rounded-[0.95rem] border px-3 py-2 ${
              bubbleTextClass
                ? (isOwn ? 'border-current/15 bg-current/5' : 'border-current/10 bg-current/5')
                : (isOwn ? 'border-cyan-300/18 bg-black/18' : 'border-white/10 bg-black/20')
            }`}
          >
            <p className={`text-[10px] font-display font-bold tracking-[0.16em] ${bubbleTextClass ? 'opacity-70' : 'text-cyan-100/80'}`}>
              {isOwn ? `You replied to ${replyTo.senderUsername || 'someone'}` : `Replied to ${replyTo.senderUsername || 'someone'}`}
            </p>
            <p className={`mt-1 text-xs leading-5 ${bubbleTextClass ? 'opacity-60' : 'text-gray-300'}`}>
              {renderReplyPreview(replyTo.previewText || 'Message', 140)}
            </p>
          </div>
        ) : null}
        {noteThread ? (
          <button
            type="button"
            onClick={() => onOpenThread?.(message)}
            className={`mb-2 block w-full rounded-[1rem] border px-3 py-2 text-left transition-colors ${
              isOwn
                ? 'border-cyan-200/15 bg-black/20 hover:bg-black/30'
                : 'border-white/10 bg-black/20 hover:bg-black/30'
            }`}
          >
            <p className={`text-[10px] font-display font-bold uppercase tracking-[0.18em] ${bubbleTextClass ? 'opacity-70' : 'text-cyan-200/80'}`}>
              {noteThread.ownerUsername ? `${noteThread.ownerUsername}'s note` : 'Note thread'}
            </p>
            <p className={`mt-1 line-clamp-2 text-xs leading-5 ${bubbleTextClass ? 'opacity-60' : 'text-gray-200'}`}>{noteThread.noteText || 'Open thread'}</p>
          </button>
        ) : null}
        {hasContent && !suppressRawUrlContent ? (
          <div className={`whitespace-pre-wrap text-sm leading-5 ${bubbleTextClass || 'text-gray-100'} ${hasLongUnbrokenToken ? 'break-words' : 'break-normal'}`}>
            {renderFormattedText(message.content)}
          </div>
        ) : null}
        {inlineYouTubeUrl ? (
          <div className={hasContent && !suppressRawUrlContent ? 'mt-3' : ''}>
            <YouTubeMessagePreviewCard
              url={inlineYouTubeUrl}
              onOpen={() => onOpenLink?.({ url: inlineYouTubeUrl, title: 'YouTube video' })}
            />
          </div>
        ) : null}
        {hasShare ? (
          <div className={hasContent ? 'mt-3' : ''}>
            {shareLabel && !isAttachmentOnly ? (
              <p className={`mb-2 text-[10px] font-display font-bold uppercase tracking-[0.2em] ${bubbleTextClass ? 'opacity-70' : 'text-cyan-200/80'}`}>
                {shareLabel}
              </p>
            ) : null}
            <SessionShareCard share={message.share} />
          </div>
        ) : null}
        {hasLinkShare ? (
          <div className={hasContent || hasShare ? 'mt-3' : ''}>
            <MessageLinkCard
              linkShare={message.link_share}
              conversationId={conversationId}
              compareAction={onReplyWithBest}
              compareLoading={compareLoading}
              responseStatus={responseStatus}
              followUpAction={onFollowUp}
              followUpLoading={followUpLoading}
              onOpenLink={onOpenLink}
            />
          </div>
        ) : null}
        {hasChallengeCard ? (
          <div className={hasContent || hasShare || hasLinkShare ? 'mt-3' : ''}>
            <MessageChallengeCard
              challengeCard={message.challenge_card}
              compareAction={onReplyWithBest}
              compareLoading={compareLoading}
              responseStatus={responseStatus}
              lifecycleAction={lifecycleAction}
              lifecycleLoading={lifecycleLoading}
              lifecycleLabel={lifecycleLabel}
            />
          </div>
        ) : null}
        </div>
      </div>
      {reactionItems.length > 0 ? (
        <div className={`mt-1 flex flex-wrap gap-1 px-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          {reactionItems.map((entry) => {
            const option = getReactionOption(entry.key);
            const selected = viewerReaction === option.key;
            return (
              <button
                key={`${message?.id}-${option.key}`}
                type="button"
                onClick={() => triggerReaction(option.key)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-display font-black transition-colors ${
                  selected
                    ? 'border-cyan-300/35 bg-cyan-400/14 text-white'
                    : 'border-white/12 bg-white/6 text-gray-200 hover:bg-white/10'
                }`}
              >
                {renderReactionGlyph(option.key, 'h-3.5 w-3.5', selected)}
                <span>{formatReactionCount(entry.count)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="mt-0.5 px-1 text-[10px] text-gray-500">{formatConversationTime(message?.created_at)}</p>
    </div>
  );
}

function ConversationRow({ conversation, stomping, celebrate, onStomp }) {
  const partner = conversation?.partner;
  const isSquad = conversation?.kind === 'squad';
  const timeLabel = formatConversationTime(conversation.last_message_at);
  const previewText = conversation?.last_message?.preview || 'Started a conversation';
  const stompState = conversation?.stomp || null;
  const stompDisabled = Boolean(stomping || (stompState && !stompState.can_send));
  const isCelebrating = Boolean(celebrate);
  const stompButtonTone = stompState?.has_incoming
    ? 'border-amber-300/40 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]'
    : 'border-white/10 bg-white/5';

  return (
    <Link
      to={`/messages/${conversation.id}`}
      className="flex items-center gap-3 border-b border-piu-border/20 px-4 py-3.5 transition-colors hover:bg-piu-dark/35 sm:px-5"
    >
      {conversation?.avatar ? (
        <img
          src={conversation.avatar}
          alt=""
          className={`h-11 w-11 object-cover ${isSquad ? 'rounded-[1rem]' : 'rounded-full'}`}
        />
      ) : (
        <div className={`flex h-11 w-11 items-center justify-center bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white ${isSquad ? 'rounded-[1rem]' : 'rounded-full'}`}>
          {(conversation?.title || partner?.username || 'U').slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm font-display font-black ${conversation.unread_count > 0 ? 'text-white' : 'text-gray-200'}`}>
            {conversation?.title || partner?.username || 'Unknown player'}
          </p>
          {conversation.is_pinned ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-cyan-400/70">
              <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5H8.5v5.5a.5.5 0 0 1-1 0V10H3.5a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A6 6 0 0 1 5 6.708V2.277a3 3 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354" />
            </svg>
          ) : null}
          {isSquad ? (
            <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[9px] font-display font-black uppercase tracking-[0.16em] text-cyan-100">
              Squad
            </span>
          ) : null}
          {conversation.unread_count > 0 ? (
            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-cyan-500 px-1 text-[9px] font-display font-black text-white">
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          ) : null}
        </div>
        <p className={`mt-1 truncate text-xs ${conversation.unread_count > 0 ? 'text-gray-200' : 'text-gray-500'}`}>
          {isSquad && conversation?.subtitle ? (
            <>
              <span className="text-gray-400">{conversation.subtitle}</span>
              <span className="text-gray-600"> {'\u2022'} </span>
            </>
          ) : null}
          {previewText}
          {timeLabel ? <span className="text-gray-600"> {'\u2022'} </span> : null}
          {timeLabel ? <span className="text-[10px] text-gray-500">{timeLabel}</span> : null}
        </p>
      </div>
      {isSquad ? (
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (stompDisabled || !onStomp) return;
            onStomp(conversation);
          }}
          disabled={stompDisabled}
          aria-label={stompDisabled ? `Waiting for ${partner?.username || 'this user'} to stomp back` : `Stomp ${partner?.username || 'this user'}`}
          title={stompDisabled ? 'Waiting for a stomp back' : 'Stomp this user'}
          className={`group relative flex h-[2.45rem] min-w-[5.1rem] shrink-0 items-center justify-center overflow-hidden rounded-[0.95rem] border px-3 transition-all duration-200 ${stompButtonTone} ${stompDisabled ? 'cursor-not-allowed opacity-45 grayscale' : 'hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-400/10 active:translate-y-0'} ${stomping ? '' : ''} ${isCelebrating ? 'border-cyan-300/50 bg-cyan-400/12' : ''}`}
          style={stomping ? { animation: 'stomp-press 0.45s cubic-bezier(0.22, 1, 0.36, 1) both' } : isCelebrating ? { animation: 'stomp-press 0.45s cubic-bezier(0.22, 1, 0.36, 1) both' } : undefined}
        >
          {isCelebrating ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[0.95rem]"
              style={{ animation: 'stomp-shockwave 0.7s cubic-bezier(0.16, 1, 0.3, 1) both' }}
            />
          ) : null}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 rounded-[0.95rem] bg-cyan-300/20 transition duration-500 ${stomping ? 'opacity-100 scale-110' : 'opacity-0 scale-100'}`}
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-[3px] rounded-[0.8rem] border border-cyan-200/35 transition duration-500 ${isCelebrating ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
          />
          <span
            className={`relative z-[1] select-none text-sm font-display font-black uppercase text-cyan-50 [text-shadow:0_0_10px_rgba(103,232,249,0.18)] ${stompDisabled ? 'tracking-[0.18em] text-gray-300' : 'tracking-[0.18em] group-hover:scale-[1.04]'}`}
            style={isCelebrating ? { animation: 'stomp-text-slam 0.5s cubic-bezier(0.22, 1, 0.36, 1) both' } : stomping ? { transform: 'scale(1.1) rotate(-5deg)', transition: 'transform 0.15s cubic-bezier(0.22, 1, 0.36, 1)' } : { transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
          >
            STOMP
          </span>
        </button>
      )}
    </Link>
  );
}

function InboxView({
  conversations,
  loadingConversations,
  conversationError,
  highlights,
  loadingHighlights,
  highlightError,
  onOpenHighlightStory,
  onOpenHighlightNote,
  onOpenStoryComposer,
  onOpenStoryArchive,
  onOpenChatSettings,
  onStompConversation,
  stompCelebrationConversationId,
  stompingConversationId,
  onStartChat,
  onStartSquad,
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef(null);

  useEffect(() => {
    if (!optionsOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!optionsRef.current || optionsRef.current.contains(event.target)) return;
      setOptionsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [optionsOpen]);

  return (
    <div className="flex min-h-screen flex-col sm:min-h-0 sm:mx-auto sm:w-full sm:max-w-3xl sm:px-4 sm:py-6">
      <section className="relative flex flex-1 flex-col overflow-visible bg-transparent sm:rounded-[1.75rem] sm:border sm:border-piu-border/60 sm:bg-piu-card/75">
        <div
          className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-piu-border/40 bg-piu-card/95 px-4 py-2.5 backdrop-blur-md sm:px-5"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0.55rem)' }}
        >
          <div className="min-w-0">
            <h1 className="text-[2rem] leading-none font-display font-black text-white sm:text-[2.35rem]">Messages</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={optionsRef}>
              <ActionIconButton
                onClick={() => setOptionsOpen((prev) => !prev)}
                title="More options"
                ariaLabel="Open messages options"
                tone="cyan"
                active={optionsOpen}
                className="h-10 w-10 justify-center rounded-[1.05rem] border border-white/12 bg-white/6 text-cyan-100 shadow-[0_10px_24px_rgba(0,0,0,0.16)] hover:border-cyan-300/35"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zm0 6a.75.75 0 110-1.5.75.75 0 010 1.5zm0 6a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                </svg>
              </ActionIconButton>
              {optionsOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-56 overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0a1220] p-2 shadow-[0_22px_50px_rgba(0,0,0,0.42)]">
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsOpen(false);
                      onOpenStoryArchive?.();
                    }}
                    className="flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-left transition-colors hover:bg-white/6"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v11A2.5 2.5 0 0117.5 21h-11A2.5 2.5 0 014 18.5v-11z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v4h8V5" />
                      </svg>
                    </span>
                    <span>
                      <p className="text-sm font-display font-black text-white">Archive</p>
                      <p className="text-[11px] text-gray-400">Open your saved stories</p>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsOpen(false);
                      onStartSquad?.();
                    }}
                    className="mt-1 flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-left transition-colors hover:bg-white/6"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5V9l-5 11zM17 20H7M17 20l-2.5-5M7 20H2V9l5 11zm0 0l2.5-5m0 0h5" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM6.5 8.5a2 2 0 110 4 2 2 0 010-4zm11 0a2 2 0 110 4 2 2 0 010-4z" />
                      </svg>
                    </span>
                    <span>
                      <p className="text-sm font-display font-black text-white">New squad</p>
                      <p className="text-[11px] text-gray-400">Start a group chat</p>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsOpen(false);
                      onOpenChatSettings?.();
                    }}
                    className="mt-1 flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-left transition-colors hover:bg-white/6"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.983 3.5c.59 0 1.068.478 1.068 1.068v.714c.45.123.875.3 1.264.524l.506-.506a1.068 1.068 0 011.511 0l1.39 1.39a1.068 1.068 0 010 1.512l-.505.505c.223.389.4.814.523 1.264h.715a1.068 1.068 0 011.068 1.068v1.965a1.068 1.068 0 01-1.068 1.068h-.715a5.42 5.42 0 01-.523 1.264l.505.505a1.068 1.068 0 010 1.512l-1.39 1.39a1.068 1.068 0 01-1.511 0l-.506-.506a5.42 5.42 0 01-1.264.524v.714a1.068 1.068 0 01-1.068 1.068h-1.965a1.068 1.068 0 01-1.068-1.068v-.714a5.42 5.42 0 01-1.264-.524l-.505.506a1.068 1.068 0 01-1.512 0l-1.39-1.39a1.068 1.068 0 010-1.512l.506-.505a5.421 5.421 0 01-.524-1.264h-.714A1.068 1.068 0 012.5 13.502v-1.965c0-.59.478-1.068 1.068-1.068h.714c.123-.45.3-.875.524-1.264L4.3 8.7a1.068 1.068 0 010-1.512l1.39-1.39a1.068 1.068 0 011.512 0l.505.506c.389-.224.814-.401 1.264-.524v-.714c0-.59.478-1.068 1.068-1.068h1.944z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.25A3.25 3.25 0 1112 15.75 3.25 3.25 0 0112 9.25z" />
                      </svg>
                    </span>
                    <span>
                      <p className="text-sm font-display font-black text-white">Chat settings</p>
                      <p className="text-[11px] text-gray-400">Control how links open</p>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
            <ActionIconButton
              onClick={onStartChat}
              title="New chat"
              ariaLabel="Start new chat"
              tone="cyan"
              className="h-10 w-10 justify-center rounded-[1.05rem] border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 shadow-[0_10px_24px_rgba(0,0,0,0.16)] hover:border-cyan-300/45"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
            </ActionIconButton>
          </div>
        </div>

        <InboxHighlightsStrip
          me={highlights?.me || null}
          circles={highlights?.circles || []}
          loading={loadingHighlights}
          error={highlightError}
          onOpenStory={onOpenHighlightStory}
          onOpenNote={onOpenHighlightNote}
          onOpenStoryComposer={onOpenStoryComposer}
        />

        <div className="flex-1">
          {loadingConversations ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="px-5 py-14 text-center sm:px-8">
              <p className="text-sm text-gray-300">No messages yet.</p>
              <p className="mt-2 text-xs leading-6 text-gray-500">Start from here, from a profile, or by sending a play into DM.</p>
              <button
                type="button"
                onClick={onStartChat}
                className="mt-5 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-2 text-sm font-display font-bold text-cyan-100 transition-colors hover:border-cyan-300/45 hover:text-white"
              >
                Start new chat
              </button>
              <button
                type="button"
                onClick={onStartSquad}
                className="mt-3 rounded-xl border border-white/12 bg-white/6 px-4 py-2 text-sm font-display font-bold text-gray-200 transition-colors hover:border-cyan-300/25 hover:text-white"
              >
                Create a squad
              </button>
            </div>
          ) : (
            conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                celebrate={stompCelebrationConversationId === conversation.id}
                stomping={stompingConversationId === conversation.id}
                onStomp={onStompConversation}
              />
            ))
          )}
        </div>
        {conversationError ? (
          <p className="border-t border-piu-border/40 px-4 py-3 text-sm text-red-300">{conversationError}</p>
        ) : null}
      </section>
    </div>
  );
}

function ConversationView({
  conversationId,
  activeConversation,
  activePartner,
  loadingMessages,
  messageError,
  actionError,
  messages,
  getMessageStatus,
  messagesViewportRef,
  messagesEndRef,
  draft,
  draftInputRef,
  replyTarget,
  activeReplyMessageId,
  replyHighlightVersion,
  touchInteractionsEnabled,
  touchInteractionsBlockedUntil,
  onDraftChange,
  onComposerKeyDown,
  onSend,
  onReply,
  onCancelReply,
  mentionUsers,
  mentionLoading,
  showMentions,
  onApplyMention,
  onRefreshMentions,
  onInsertSticker,
  onReplyWithBest,
  canReplyWithBest,
  onSendRematch,
  canSendRematch,
  rematchingMessageId,
  onAcceptChallenge,
  canAcceptChallenge,
  acceptingMessageId,
  onExpireChallenge,
  canExpireChallenge,
  expiringMessageId,
  replyingMessageId,
  sending,
  onOpenThread,
  onOpenLink,
  onOpenSquadSettings,
  onOpenPersonSettings,
  onPinConversation,
  isPinned,
  defaultReaction,
  availableReactions,
  onReact,
  readReceipts = [],
  onNudge,
  nudging = false,
}) {
  const isSquad = activeConversation?.kind === 'squad';
  const headerTitle = isSquad
    ? (activeConversation?.title || 'Squad')
    : (activePartner?.username || 'Unknown player');
  const headerSubtitle = isSquad
    ? (activeConversation?.subtitle || `${activeConversation?.member_count || 0} members`)
    : 'Private chat';
  const headerAvatar = isSquad ? activeConversation?.avatar : activePartner?.avatar;
  const composerPlaceholder = isSquad ? 'Message Squad' : `Message ${headerTitle || 'chat'}...`;
  const chatTheme = useMemo(() => getTheme(activeConversation?.theme), [activeConversation?.theme]);

  const readReceiptMap = useMemo(() => {
    const map = {};
    for (const receipt of readReceipts) {
      const mid = receipt?.last_read_message_id;
      if (!mid) continue;
      if (!map[mid]) map[mid] = [];
      map[mid].push(receipt);
    }
    return map;
  }, [readReceipts]);

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] max-h-[100dvh] flex-col overflow-hidden sm:mx-auto sm:h-[calc(100vh-5rem)] sm:min-h-[40rem] sm:max-h-[calc(100vh-5rem)] sm:w-full sm:max-w-4xl sm:px-4 sm:py-6" style={chatTheme.fontFamily ? { fontFamily: chatTheme.fontFamily } : undefined}>
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent sm:rounded-[1.75rem] sm:border sm:border-piu-border/60 sm:bg-piu-card/75">
        <div
          className={`z-10 shrink-0 flex items-center justify-between gap-3 border-b ${chatTheme.headerBorder} ${chatTheme.headerBg} px-4 pb-2.5 pt-3.5 sm:px-5 sm:pt-4`}
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/messages"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-black/30 text-white shadow-[0_8px_22px_rgba(0,0,0,0.22)] transition-colors hover:border-cyan-300/25 hover:bg-piu-dark/70 hover:text-white"
              aria-label="Back to inbox"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 shrink-0"
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.25}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            {isSquad ? (
              <button
                type="button"
                onClick={onOpenSquadSettings}
                className="flex min-w-0 items-center gap-3 rounded-[1rem] px-1 py-1 text-left transition-colors hover:bg-white/6"
              >
                {headerAvatar ? (
                  <img src={headerAvatar} alt="" className="h-10 w-10 rounded-[0.95rem] object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-[0.95rem] bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
                    {headerTitle.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className={`truncate text-lg font-display font-black ${chatTheme.headerText}`}>{headerTitle}</h1>
                  <p className={`mt-0.5 text-[11px] ${chatTheme.headerText} opacity-70`}>{headerSubtitle}</p>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenPersonSettings}
                className="flex min-w-0 items-center gap-3 rounded-[1rem] px-1 py-1 text-left transition-colors hover:bg-white/6"
              >
                {headerAvatar ? (
                  <img src={headerAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
                    {headerTitle.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="truncate text-lg font-display font-black text-white">{headerTitle}</h1>
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500">{headerSubtitle}</p>
                </div>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNudge}
              disabled={nudging}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-black/30 text-gray-400 transition-colors hover:border-purple-400/30 hover:bg-purple-500/10 hover:text-purple-300 disabled:opacity-50"
              aria-label="Nudge"
              title="Nudge"
              style={nudging ? { animation: 'nudge-shake 0.4s ease both' } : undefined}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[1.125rem] w-[1.125rem]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onPinConversation}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${
                isPinned
                  ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-300'
                  : 'border-white/12 bg-black/30 text-gray-400 hover:border-cyan-300/25 hover:text-white'
              }`}
              aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
              title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-[1.125rem] w-[1.125rem]" style={{ opacity: isPinned ? 1 : 0.7 }}>
                <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5H8.5v5.5a.5.5 0 0 1-1 0V10H3.5a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A6 6 0 0 1 5 6.708V2.277a3 3 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354" />
              </svg>
            </button>
            {isSquad ? (
              <button
                type="button"
                onClick={onOpenSquadSettings}
                className="hidden rounded-lg border border-piu-border/60 bg-piu-dark/70 px-3 py-1.5 text-xs font-display font-bold text-gray-300 transition-colors hover:text-white sm:inline-flex"
              >
                Squad settings
              </button>
            ) : null}
          </div>
        </div>

        <div ref={messagesViewportRef} className={`relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 sm:py-4 ${chatTheme.viewportBg} ${chatTheme.extraViewportClass}`} style={chatTheme.viewportStyle}>
          {chatTheme.decorOverlay}
          {!touchInteractionsEnabled ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-10 sm:hidden"
            />
          ) : null}
          {loadingMessages && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading conversation...</div>
          ) : messageError ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-5 text-sm text-red-200">
                {messageError}
              </div>
              <Link
                to="/messages"
                className="mt-4 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-2 text-sm font-display font-bold text-cyan-100 transition-colors hover:text-white"
              >
                Back to inbox
              </Link>
            </div>
          ) : !activeConversation ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading conversation...</div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">No messages yet. Say hello.</div>
          ) : (
            <div className="space-y-3 pb-1">
              {messages.map((message) => {
                const readers = readReceiptMap[message.id];
                return (
                  <React.Fragment key={`${conversationId || 'conversation'}:${message.id}`}>
                    <MessageBubble
                      message={message}
                      conversationId={conversationId}
                      chatTheme={chatTheme}
                      onReplyWithBest={canReplyWithBest(message) ? () => onReplyWithBest(message) : null}
                      compareLoading={replyingMessageId === message.id}
                      responseStatus={getMessageStatus(message) || null}
                      onFollowUp={canSendRematch(message) ? () => onSendRematch(message) : null}
                      followUpLoading={rematchingMessageId === message.id}
                      lifecycleAction={
                        canAcceptChallenge(message)
                          ? () => onAcceptChallenge(message)
                          : (canExpireChallenge(message) ? () => onExpireChallenge(message) : null)
                      }
                      lifecycleLoading={acceptingMessageId === message.id || expiringMessageId === message.id}
                      lifecycleLabel={canAcceptChallenge(message) ? 'Accept' : 'Expire'}
                      onOpenThread={message?.note_thread?.threadKey ? () => onOpenThread?.(message) : null}
                      onOpenLink={onOpenLink}
                      onReply={onReply}
                      activeReplyMessageId={activeReplyMessageId}
                      replyHighlightVersion={replyHighlightVersion}
                      touchInteractionsEnabled={touchInteractionsEnabled}
                      touchInteractionsBlockedUntil={touchInteractionsBlockedUntil}
                      defaultReaction={defaultReaction}
                      availableReactions={availableReactions}
                      onReact={onReact}
                    />
                    {readers?.length > 0 ? (
                      <div className={`flex ${message.is_own ? 'justify-end' : 'justify-start'} px-3 -mt-1.5`}>
                        {isSquad ? (
                          <div className="flex -space-x-1.5">
                            {readers.slice(0, 8).map((r) => (
                              r.avatar ? (
                                <img key={r.user_id} src={getAvatarUrl(r.avatar)} alt={r.username} title={r.username} className="h-4 w-4 rounded-full object-cover ring-1 ring-black/40" />
                              ) : (
                                <div key={r.user_id} title={r.username} className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-500/30 text-[7px] font-bold text-gray-300 ring-1 ring-black/40">
                                  {(r.username || '?').slice(0, 1).toUpperCase()}
                                </div>
                              )
                            ))}
                            {readers.length > 8 ? (
                              <div className="flex h-4 items-center pl-1 text-[9px] text-gray-500">+{readers.length - 8}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-500">Seen</span>
                        )}
                      </div>
                    ) : null}
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div
          className={`z-10 shrink-0 border-t ${chatTheme.composerBorder} ${chatTheme.composerBg} px-3 pb-2.5 pt-2.5 sm:px-5 sm:pb-3 sm:pt-3`}
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.6rem)' }}
        >
          {actionError ? <p className="mb-3 text-sm text-red-300">{actionError}</p> : null}
          <div className="flex items-end gap-2.5">
            <DojoCatStickerPicker
              compact
              onSelect={onInsertSticker}
              buttonClassName="h-11 w-11 shrink-0 rounded-full border border-piu-border/65 bg-piu-dark/55 text-lg text-gray-300 hover:border-cyan-300/35 hover:bg-piu-dark/80 hover:text-white"
              panelClassName="w-[min(21rem,calc(100vw-1rem))]"
              align="left"
            />
            <div className="relative min-w-0 flex-1">
              {replyTarget ? (
                <div className="mb-2 rounded-[1.15rem] border border-cyan-300/18 bg-[#0a1322] px-3 py-2.5 shadow-[0_10px_26px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-display font-black uppercase tracking-[0.18em] text-cyan-100/80">
                        Replying to {replyTarget.senderUsername || 'someone'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-300">
                        {renderReplyPreview(replyTarget.previewText || 'Message', 160)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onCancelReply}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400 transition-colors hover:text-white"
                      aria-label="Cancel reply"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : null}
              <MentionSuggestionsPanel
                open={showMentions || mentionLoading}
                loading={mentionLoading}
                users={mentionUsers}
                onSelect={onApplyMention}
              />
              <textarea
                ref={draftInputRef}
                value={draft}
                onChange={(event) => {
                  onDraftChange(event.target.value);
                  onRefreshMentions(event.target.value, event.target.selectionStart);
                }}
                onClick={(event) => onRefreshMentions(draft, event.currentTarget.selectionStart)}
                onKeyDown={onComposerKeyDown}
                maxLength={4000}
                placeholder={composerPlaceholder}
                className={`w-full resize-none overflow-hidden rounded-[1.4rem] border border-piu-border/70 px-4 text-sm focus:outline-none focus:ring-0 ${chatTheme.composerInputBg || 'bg-piu-dark/55'} ${chatTheme.composerInputText || 'text-white placeholder:text-gray-500'} focus:border-cyan-300/35`}
                style={{ display: 'block', boxSizing: 'border-box', height: 44, maxHeight: 160, paddingTop: 12, paddingBottom: 12, whiteSpace: draft ? 'pre-wrap' : 'nowrap', lineHeight: '20px', verticalAlign: 'bottom' }}
                disabled={sending || !activeConversation}
              />
            </div>
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !draft.trim() || !activeConversation}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-cyan-500 px-4 text-sm font-display font-black text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { refreshMessageUnread } = useNotifications();
  const navigate = useNavigate();
  const { conversationId = '' } = useParams();
  const messagesEndRef = useRef(null);
  const messagesViewportRef = useRef(null);
  const draftInputRef = useRef(null);
  const lastAutoScrollKeyRef = useRef('');
  const initialConversationScrollRef = useRef('');
  const lastSeenNudgeIdRef = useRef('');
  const chartKeyMapRef = useRef(null);
  const chartKeyMapPromiseRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversationError, setConversationError] = useState('');
  const [stompingConversationId, setStompingConversationId] = useState('');
  const [stompCelebrationConversationId, setStompCelebrationConversationId] = useState('');
  const [highlights, setHighlights] = useState({ me: null, circles: [] });
  const [loadingHighlights, setLoadingHighlights] = useState(true);
  const [highlightError, setHighlightError] = useState('');

  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [readReceipts, setReadReceipts] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [replyingMessageId, setReplyingMessageId] = useState('');
  const [rematchingMessageId, setRematchingMessageId] = useState('');
  const [acceptingMessageId, setAcceptingMessageId] = useState('');
  const [expiringMessageId, setExpiringMessageId] = useState('');

  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyHighlightVersion, setReplyHighlightVersion] = useState(0);
  const [touchInteractionsEnabled, setTouchInteractionsEnabled] = useState(() => (
    !conversationId || !isCoarsePointerDevice()
  ));
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [squadComposerOpen, setSquadComposerOpen] = useState(false);
  const [creatingSquad, setCreatingSquad] = useState(false);
  const [squadSettingsOpen, setSquadSettingsOpen] = useState(false);
  const [personSettingsOpen, setPersonSettingsOpen] = useState(false);
  const [pinningConversation, setPinningConversation] = useState(false);
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteComposerError, setNoteComposerError] = useState('');
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [storyComposerSubmitting, setStoryComposerSubmitting] = useState(false);
  const [storyComposerError, setStoryComposerError] = useState('');
  const [storyComposerOptions, setStoryComposerOptions] = useState([]);
  const [storyArchiveOpen, setStoryArchiveOpen] = useState(false);
  const [archivedStories, setArchivedStories] = useState([]);
  const [storyArchiveError, setStoryArchiveError] = useState('');
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [openLinksExternally, setOpenLinksExternally] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(MESSAGE_LINK_PREFERENCE_KEY) !== 'internal';
  });
  const [defaultReaction, setDefaultReaction] = useState(() => {
    if (typeof window === 'undefined') return 'pump';
    const stored = sanitizeReactionKey(localStorage.getItem(CHAT_DEFAULT_REACTION_KEY));
    return REACTION_OPTIONS.some((option) => option.key === stored) ? stored : 'pump';
  });
  const [quickReactions, setQuickReactions] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_QUICK_REACTION_KEYS;
    try {
      const stored = JSON.parse(localStorage.getItem(CHAT_QUICK_REACTIONS_KEY) || '[]');
      const normalized = normalizeReactionKeys(stored);
      return normalized.length > 0 ? normalized : DEFAULT_QUICK_REACTION_KEYS;
    } catch {
      return DEFAULT_QUICK_REACTION_KEYS;
    }
  });
  const [embeddedBrowserState, setEmbeddedBrowserState] = useState({
    open: false,
    title: '',
    url: '',
  });
  const [youtubeModalState, setYoutubeModalState] = useState({
    open: false,
    title: '',
    url: '',
  });
  const [storyViewerState, setStoryViewerState] = useState({
    open: false,
    user: null,
    stories: [],
    loading: false,
    error: '',
    readonly: false,
    sourceUserId: '',
    initialIndex: 0,
  });
  const [threadState, setThreadState] = useState({
    open: false,
    note: null,
    conversation: null,
    messages: [],
    loading: false,
    sending: false,
    draft: '',
    error: '',
  });

  const activePartner = activeConversation?.partner || null;
  const activeSquad = activeConversation?.kind === 'squad' ? activeConversation : null;
  const conversationMentionSearch = useCallback(async (query) => {
    if (!activeConversation?.id || activeConversation?.kind !== 'squad') return [];
    return searchConversationMentions(activeConversation.id, query);
  }, [activeConversation?.id, activeConversation?.kind]);
  const {
    mentionUsers,
    mentionLoading,
    showMentions,
    updateMentionState,
    applyMention,
    handleKeyDown: handleMentionKeyDown,
    clearMentions,
  } = useMentionComposer({
    value: draft,
    setValue: setDraft,
    inputRef: draftInputRef,
    enabled: activeConversation?.kind === 'squad',
    searchMentions: conversationMentionSearch,
    excludeUserIds: [user?.id].filter(Boolean),
  });
  const excludeUserIds = useMemo(() => [user?.id].filter(Boolean), [user?.id]);
  const orderedStoryCircles = useMemo(() => {
    const circles = [];
    if (highlights?.me?.user) {
      circles.push({
        is_self: true,
        user: highlights.me.user,
        has_story: !!highlights.me.has_story,
        note: highlights.me.note || null,
      });
    }
    for (const circle of Array.isArray(highlights?.circles) ? highlights.circles : []) {
      if (!circle?.user?.id) continue;
      circles.push(circle);
    }
    return circles.filter((circle) => circle?.has_story && circle?.user?.id);
  }, [highlights]);
  const touchInteractionsBlockedUntil = useMemo(() => {
    if (!conversationId || !isCoarsePointerDevice()) return 0;
    return Date.now() + MOBILE_MESSAGE_INTERACTION_ARM_DELAY_MS;
  }, [conversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MESSAGE_LINK_PREFERENCE_KEY, openLinksExternally ? 'external' : 'internal');
  }, [openLinksExternally]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CHAT_DEFAULT_REACTION_KEY, sanitizeReactionKey(defaultReaction) || 'pump');
  }, [defaultReaction]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CHAT_QUICK_REACTIONS_KEY, JSON.stringify(normalizeReactionKeys(quickReactions)));
  }, [quickReactions]);

  async function openSharedStoryLinkTarget(linkTarget) {
    const storyId = String(linkTarget?.storyId || '').trim();
    const storyOwnerId = String(linkTarget?.storyOwnerId || '').trim();
    if (!storyId || !storyOwnerId) return 'skip';

    const fallbackUser = {
      id: storyOwnerId,
      username: String(linkTarget?.storyOwnerUsername || '').trim(),
      avatar: String(linkTarget?.storyOwnerAvatar || '').trim(),
    };

    setStoryViewerState({
      open: true,
      user: fallbackUser,
      stories: [],
      loading: true,
      error: '',
      readonly: false,
      sourceUserId: storyOwnerId,
      initialIndex: 0,
    });

    try {
      const payload = await getSharedMessageStory(storyOwnerId, storyId, conversationId ? { conversationId } : undefined);
      const sharedStory = payload?.story || null;
      if (!sharedStory) throw new Error('Story not found');
      setStoryViewerState({
        open: true,
        user: payload?.user || fallbackUser,
        stories: [sharedStory],
        loading: false,
        error: '',
        readonly: !!payload?.readonly,
        sourceUserId: storyOwnerId,
        initialIndex: 0,
      });
      return 'opened';
    } catch {
      const fallbackStory = buildStoryFromLinkShare(linkTarget);
      setStoryViewerState({
        open: true,
        user: fallbackUser,
        stories: fallbackStory ? [fallbackStory] : [],
        loading: false,
        error: fallbackStory ? '' : 'Story unavailable right now.',
        readonly: true,
        sourceUserId: storyOwnerId,
        initialIndex: 0,
      });
      return fallbackStory ? 'opened' : 'error';
    }
  }

  async function handleOpenChatLink(linkTarget) {
    const kind = String(linkTarget?.kind || '').trim().toLowerCase();
    const canOpenSharedStory = kind === 'story'
      && !!String(linkTarget?.storyId || '').trim()
      && !!String(linkTarget?.storyOwnerId || '').trim();
    const title = String(linkTarget?.title || linkTarget?.buttonLabel || 'Open link').trim() || 'Open link';
    const forceEmbed = !!linkTarget?.forceEmbed;

    if (canOpenSharedStory) {
      const storyOpenResult = await openSharedStoryLinkTarget(linkTarget);
      if (storyOpenResult !== 'skip') {
        return;
      }
    }

    const path = String((canOpenSharedStory ? linkTarget?.storyFallbackPath : linkTarget?.path) || '').trim();
    const url = String((canOpenSharedStory ? linkTarget?.storyFallbackUrl : linkTarget?.url) || '').trim();

    if (path) {
      navigate(path);
      return;
    }

    if (!url) return;

    if (forceEmbed && parseYouTubeUrl(url).videoId) {
      setYoutubeModalState({
        open: true,
        title,
        url,
      });
      return;
    }

    if (openLinksExternally) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (parseYouTubeUrl(url).videoId) {
      setYoutubeModalState({
        open: true,
        title,
        url,
      });
      return;
    }

    setEmbeddedBrowserState({
      open: true,
      title,
      url,
    });
  }

  const ensureChartKeyMap = useCallback(async () => {
    if (chartKeyMapRef.current) return chartKeyMapRef.current;
    if (!chartKeyMapPromiseRef.current) {
      chartKeyMapPromiseRef.current = getChartKeyMap()
        .then((payload) => {
          const nextMap = payload && typeof payload === 'object' ? payload : {};
          chartKeyMapRef.current = nextMap;
          return nextMap;
        })
        .catch((err) => {
          chartKeyMapPromiseRef.current = null;
          throw err;
        });
    }
    return chartKeyMapPromiseRef.current;
  }, []);

  const resolveChartReference = useCallback(async ({ chartPath = '', songTitle = '', mode = '', level = 0 } = {}) => {
    const directChartId = parseResourceIdFromPath(chartPath, 'songs/chart');
    if (directChartId) return directChartId;
    const chartMap = await ensureChartKeyMap();
    return resolveChartId(songTitle, mode, level, chartMap);
  }, [ensureChartKeyMap]);

  const resolveCompareSource = useCallback(async (message) => {
    if (!message) {
      throw new Error('This message cannot be compared yet.');
    }

    if (message.message_type === 'challenge_card' && message.challenge_card) {
      const challengeCard = message.challenge_card;
      const directChartId = await resolveChartReference({
        chartPath: challengeCard.chartPath || '',
        songTitle: challengeCard.songTitle,
        mode: challengeCard.mode,
        level: challengeCard.level,
      });
      if (directChartId) {
        return {
          chartId: directChartId,
          targetScore: parseInt(challengeCard.targetScore, 10) || 0,
          challengeKind: challengeCard.kind || '',
        };
      }

      const upscoreId = challengeCard.sourceKind === 'upscore'
        ? String(challengeCard.sourceId || '').trim() || parseResourceIdFromPath(challengeCard.path, 'upscore')
        : '';
      if (upscoreId) {
        const upscore = await getUpscore(upscoreId);
        const fallbackCard = buildUpscoreChallengeCard({
          upscoreId: upscore?.id || upscoreId,
          username: upscore?.username,
          upscores: parseUpscoreItems(upscore),
        });
        const fallbackChartId = await resolveChartReference({
          songTitle: fallbackCard?.songTitle,
          mode: fallbackCard?.mode,
          level: fallbackCard?.level,
        });
        if (fallbackChartId) {
          return {
            chartId: fallbackChartId,
            targetScore: parseInt(fallbackCard?.targetScore, 10) || parseInt(challengeCard.targetScore, 10) || 0,
            challengeKind: challengeCard.kind || fallbackCard?.kind || '',
          };
        }
      }

      const clearId = challengeCard.sourceKind === 'clear'
        ? String(challengeCard.sourceId || '').trim() || parseResourceIdFromPath(challengeCard.path, 'clear')
        : '';
      if (clearId) {
        const clear = await getNewClear(clearId);
        const fallbackCard = buildClearChallengeCard({
          clearId: clear?.id || clearId,
          username: clear?.username,
          clears: getClearItems(clear),
        });
        const fallbackChartId = await resolveChartReference({
          songTitle: fallbackCard?.songTitle,
          mode: fallbackCard?.mode,
          level: fallbackCard?.level,
        });
        if (fallbackChartId) {
          return {
            chartId: fallbackChartId,
            targetScore: parseInt(fallbackCard?.targetScore, 10) || parseInt(challengeCard.targetScore, 10) || 0,
            challengeKind: challengeCard.kind || fallbackCard?.kind || '',
          };
        }
      }
    }

    if (message.message_type === 'link_share' && message.link_share) {
      const linkShare = message.link_share;
      const directChartId = await resolveChartReference({
        chartPath: linkShare.chartPath || (linkShare.kind === 'chart_compare' ? linkShare.path : ''),
        songTitle: linkShare.songTitle,
        mode: linkShare.mode,
        level: linkShare.level,
      });
      if (directChartId) {
        return {
          chartId: directChartId,
          targetScore: parseInt(linkShare.targetScore, 10) || 0,
          challengeKind: linkShare.kind === 'clear' ? 'clear_chart' : (linkShare.kind === 'upscore' ? 'beat_score' : ''),
        };
      }

      const upscoreId = linkShare.kind === 'upscore'
        ? parseResourceIdFromPath(linkShare.path, 'upscore')
        : '';
      if (upscoreId) {
        const upscore = await getUpscore(upscoreId);
        const fallbackCard = buildUpscoreChallengeCard({
          upscoreId: upscore?.id || upscoreId,
          username: upscore?.username,
          upscores: parseUpscoreItems(upscore),
        });
        const fallbackChartId = await resolveChartReference({
          songTitle: fallbackCard?.songTitle,
          mode: fallbackCard?.mode,
          level: fallbackCard?.level,
        });
        if (fallbackChartId) {
          return {
            chartId: fallbackChartId,
            targetScore: parseInt(fallbackCard?.targetScore, 10) || 0,
            challengeKind: fallbackCard?.kind || 'beat_score',
          };
        }
      }

      const clearId = linkShare.kind === 'clear'
        ? parseResourceIdFromPath(linkShare.path, 'clear')
        : '';
      if (clearId) {
        const clear = await getNewClear(clearId);
        const fallbackCard = buildClearChallengeCard({
          clearId: clear?.id || clearId,
          username: clear?.username,
          clears: getClearItems(clear),
        });
        const fallbackChartId = await resolveChartReference({
          songTitle: fallbackCard?.songTitle,
          mode: fallbackCard?.mode,
          level: fallbackCard?.level,
        });
        if (fallbackChartId) {
          return {
            chartId: fallbackChartId,
            targetScore: parseInt(fallbackCard?.targetScore, 10) || 0,
            challengeKind: fallbackCard?.kind || 'clear_chart',
          };
        }
      }
    }

    throw new Error('This share does not point to a playable chart yet.');
  }, [resolveChartReference]);

  const latestCompareBySourceId = useMemo(() => {
    const next = {};
    for (const message of messages) {
      if (message?.message_type !== 'link_share' || message?.link_share?.kind !== 'chart_compare') continue;
      const sourceMessageId = String(message?.link_share?.sourceMessageId || '').trim();
      if (!sourceMessageId) continue;
      next[sourceMessageId] = {
        statusKind: String(message.link_share.statusKind || '').trim(),
        statusLabel: String(message.link_share.statusLabel || message.link_share.subtitle || '').trim(),
        senderName: String(message?.sender?.username || '').trim(),
        messageId: message.id,
      };
    }
    return next;
  }, [messages]);

  const latestChallengeLifecycleBySourceId = useMemo(() => {
    const next = {};
    for (const message of messages) {
      if (message?.message_type !== 'challenge_card' || !message?.challenge_card?.sourceMessageId) continue;
      next[String(message.challenge_card.sourceMessageId).trim()] = {
        statusKind: String(message.challenge_card.statusKind || '').trim(),
        statusLabel: String(message.challenge_card.statusLabel || message.challenge_card.subtitle || '').trim(),
        senderName: String(message?.sender?.username || '').trim(),
        messageId: message.id,
      };
    }
    return next;
  }, [messages]);

  const canReplyWithBest = useCallback((message) => {
    if (!message || message.is_own) return false;
    const state = latestChallengeLifecycleBySourceId[message.id] || latestCompareBySourceId[message.id] || null;
    if (state?.statusKind === 'expired' || state?.statusKind === 'beat_target' || state?.statusKind === 'pass_earned') {
      return false;
    }
    if (message.message_type === 'challenge_card' && message.challenge_card) {
      if (message.challenge_card.sourceMessageId || message.challenge_card.statusKind) return false;
      return message.challenge_card.kind === 'beat_score' || message.challenge_card.kind === 'clear_chart';
    }
    if (message.message_type !== 'link_share') return false;
    return message.link_share?.kind === 'upscore' || message.link_share?.kind === 'clear';
  }, [latestChallengeLifecycleBySourceId, latestCompareBySourceId]);

  const getChallengeStatusForMessage = useCallback((message) => {
    if (!message?.id) return null;
    return latestChallengeLifecycleBySourceId[message.id] || latestCompareBySourceId[message.id] || null;
  }, [latestChallengeLifecycleBySourceId, latestCompareBySourceId]);

  const canSendRematch = useCallback((message) => {
    if (!message || message.is_own) return false;
    if (message.message_type !== 'link_share' || message.link_share?.kind !== 'chart_compare') return false;
    return message.link_share.statusKind === 'beat_target' || message.link_share.statusKind === 'pass_earned';
  }, []);

  const canAcceptChallenge = useCallback((message) => {
    if (!message || message.is_own) return false;
    if (message.message_type !== 'challenge_card' || !message.challenge_card) return false;
    if (message.challenge_card.sourceMessageId || message.challenge_card.statusKind) return false;
    const state = latestChallengeLifecycleBySourceId[message.id] || latestCompareBySourceId[message.id] || null;
    return !state;
  }, [latestChallengeLifecycleBySourceId, latestCompareBySourceId]);

  const canExpireChallenge = useCallback((message) => {
    if (!message || !message.is_own) return false;
    if (message.message_type !== 'challenge_card' || !message.challenge_card) return false;
    if (message.challenge_card.sourceMessageId || message.challenge_card.statusKind) return false;
    const state = latestChallengeLifecycleBySourceId[message.id] || latestCompareBySourceId[message.id] || null;
    if (!state) return true;
    return state.statusKind !== 'expired' && state.statusKind !== 'beat_target' && state.statusKind !== 'pass_earned';
  }, [latestChallengeLifecycleBySourceId, latestCompareBySourceId]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const payload = await getMessageConversations();
      setConversations(Array.isArray(payload?.conversations) ? payload.conversations : []);
      setConversationError('');
    } catch (err) {
      setConversationError(err?.message || 'Failed to load conversations.');
    } finally {
      setLoadingConversations(false);
    }
  }, [user]);

  const loadHighlights = useCallback(async () => {
    if (!user) return;
    try {
      const payload = await getMessageHighlights();
      setHighlights({
        me: payload?.me || null,
        circles: Array.isArray(payload?.circles) ? payload.circles : [],
      });
      setHighlightError('');
    } catch (err) {
      setHighlightError(err?.message || 'Failed to load circles.');
    } finally {
      setLoadingHighlights(false);
    }
  }, [user]);

  const handleConversationStomp = useCallback(async (conversation) => {
    const targetConversationId = String(conversation?.id || '').trim();
    if (!targetConversationId) return;
    if (!conversation?.stomp?.can_send) return;

    setStompingConversationId(targetConversationId);
    setConversationError('');
    try {
      const payload = await sendMessageConversationStomp(targetConversationId);
      if (payload?.conversation?.id) {
        setConversations((prev) => prev.map((entry) => (
          entry.id === payload.conversation.id ? payload.conversation : entry
        )));
        setStompCelebrationConversationId(targetConversationId);
        window.setTimeout(() => {
          setStompCelebrationConversationId((current) => (current === targetConversationId ? '' : current));
        }, 900);
      } else {
        await loadConversations();
      }
    } catch (err) {
      if (String(err?.message || '').toLowerCase().includes('stomp you back')) {
        await loadConversations();
      } else {
        setConversationError(err?.message || 'Failed to stomp player.');
      }
    } finally {
      setStompingConversationId('');
    }
  }, [loadConversations]);

  const loadConversation = useCallback(async (targetConversationId, { silent = false } = {}) => {
    if (!user || !targetConversationId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const payload = await getMessageConversation(targetConversationId);
      setActiveConversation(payload?.conversation || null);
      setReadReceipts(Array.isArray(payload?.read_receipts) ? payload.read_receipts : []);
      const nextMessages = normalizeConversationMessages(payload?.messages);
      if (silent) {
        setMessages((prev) => {
          if (prev.length === nextMessages.length && prev.length > 0) {
            const prevLastId = prev[prev.length - 1]?.id;
            const nextLastId = nextMessages[nextMessages.length - 1]?.id;
            if (prevLastId === nextLastId) return prev;
          }
          return nextMessages;
        });
      } else {
        setMessages(nextMessages);
      }
      setMessageError('');
      refreshMessageUnread();
    } catch (err) {
      if (!silent) {
        setActiveConversation(null);
        setMessages([]);
        setReadReceipts([]);
        setMessageError(err?.message || 'Failed to load conversation.');
      }
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [user, refreshMessageUnread]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return undefined;
    setLoadingConversations(true);
    loadConversations();
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
  }, [user, loadConversations]);

  useEffect(() => {
    if (!user) return undefined;
    setLoadingHighlights(true);
    loadHighlights();
    const interval = setInterval(loadHighlights, 20000);
    return () => clearInterval(interval);
  }, [user, loadHighlights]);

  useEffect(() => {
    if (!user) return undefined;
    if (!conversationId) {
      setActiveConversation(null);
      setMessages([]);
      setReadReceipts([]);
      setMessageError('');
      return undefined;
    }
    setMessages([]);
    setReadReceipts([]);
    setActiveConversation(null);
    loadConversation(conversationId);
    const interval = setInterval(() => loadConversation(conversationId, { silent: true }), 5000);
    return () => clearInterval(interval);
  }, [user, conversationId, loadConversation]);

  useEffect(() => {
    setDraft('');
    setReplyTarget(null);
    setReplyHighlightVersion(0);
    clearMentions();
    setActionError('');
    setSquadSettingsOpen(false);
    setReplyingMessageId('');
    setRematchingMessageId('');
    setAcceptingMessageId('');
    setExpiringMessageId('');
    lastAutoScrollKeyRef.current = '';
    initialConversationScrollRef.current = '';
  }, [clearMentions, conversationId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !conversationId) {
      setTouchInteractionsEnabled(true);
      return undefined;
    }

    if (!isCoarsePointerDevice()) {
      setTouchInteractionsEnabled(true);
      return undefined;
    }

    setTouchInteractionsEnabled(false);
    const timeoutId = window.setTimeout(() => {
      setTouchInteractionsEnabled(true);
    }, Math.max(0, touchInteractionsBlockedUntil - Date.now()));
    return () => window.clearTimeout(timeoutId);
  }, [conversationId, touchInteractionsBlockedUntil]);

  useEffect(() => {
    if (!conversationId || typeof window === 'undefined' || window.innerWidth >= 640) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [conversationId]);

  useEffect(() => {
    const input = draftInputRef.current;
    if (!input) return;
    input.style.height = '0px';
    const nextHeight = Math.min(input.scrollHeight, 160);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > 160 ? 'auto' : 'hidden';
  }, [draft, conversationId]);

  useEffect(() => {
    if (!conversationId || loadingMessages || messages.length === 0) return undefined;
    if (initialConversationScrollRef.current === conversationId) return undefined;

    initialConversationScrollRef.current = conversationId;
    const lastMessage = messages[messages.length - 1] || null;
    lastAutoScrollKeyRef.current = `${conversationId}:${messages.length}:${lastMessage?.id || 'empty'}`;

    const viewport = messagesViewportRef.current;
    const scrollToBottom = () => {
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    };

    scrollToBottom();
    window.requestAnimationFrame(scrollToBottom);

    // Keep scroll pinned to bottom for 2s after entering a conversation.
    // This catches any DOM changes (images loading, re-renders) that shift content.
    if (!viewport) return undefined;
    let pinActive = true;
    const observer = new MutationObserver(() => {
      if (pinActive) scrollToBottom();
    });
    observer.observe(viewport, { childList: true, subtree: true, attributes: true });
    const pinTimeout = window.setTimeout(() => {
      pinActive = false;
      observer.disconnect();
    }, 2000);

    return () => {
      pinActive = false;
      observer.disconnect();
      window.clearTimeout(pinTimeout);
    };
  }, [conversationId, loadingMessages, messages]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !conversationId || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1] || null;
    const nextKey = `${conversationId}:${messages.length}:${lastMessage?.id || 'empty'}`;
    const previousKey = lastAutoScrollKeyRef.current;

    if (!previousKey || !previousKey.startsWith(`${conversationId}:`)) return;
    if (nextKey === previousKey) return;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const isNearBottom = distanceFromBottom < 120;
    if (!isNearBottom && !lastMessage?.is_own) return;

    lastAutoScrollKeyRef.current = nextKey;
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [messages, conversationId]);

  // Detect new nudge messages and trigger the shake + haptic effect
  useEffect(() => {
    if (!messages.length || !conversationId) return;
    const nudges = messages.filter((m) => m.message_type === 'nudge' && !m.is_own);
    if (nudges.length === 0) {
      lastSeenNudgeIdRef.current = '';
      return;
    }
    const latestNudge = nudges[nudges.length - 1];
    if (latestNudge.id === lastSeenNudgeIdRef.current) return;
    const isFirstLoad = !lastSeenNudgeIdRef.current;
    lastSeenNudgeIdRef.current = latestNudge.id;
    // Trigger effect — on first load (experience on join) or when a new nudge arrives
    const delay = isFirstLoad ? 600 : 100;
    const timer = setTimeout(() => {
      const viewport = messagesViewportRef.current;
      if (viewport) {
        viewport.style.animation = 'none';
        viewport.offsetHeight;
        viewport.style.animation = 'nudge-viewport-shake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';
        setTimeout(() => { viewport.style.animation = ''; }, 700);
      }
      if (navigator.vibrate) {
        navigator.vibrate([50, 30, 80, 30, 50, 30, 40, 20, 30]);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [messages, conversationId]);

  const handleSend = async () => {
    if (!conversationId || sending) return;
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) return;
    setActionError('');
    setSending(true);
    try {
      const replyMessageId = replyTarget?.messageId || '';
      const payload = await sendConversationMessage(conversationId, {
        content: trimmedDraft,
        reply_to_message_id: replyMessageId,
      });
      setDraft('');
      setReplyTarget(null);
      setReplyHighlightVersion(0);
      clearMentions();
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
      window.requestAnimationFrame(() => {
        draftInputRef.current?.focus();
      });
    } catch (err) {
      setActionError(err?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const [nudging, setNudging] = useState(false);
  const handleNudge = async () => {
    if (!conversationId || nudging || sending) return;
    setNudging(true);
    setActionError('');
    try {
      const payload = await sendMessageConversationNudge(conversationId);
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
      triggerNudgeEffect();
    } catch (err) {
      setActionError(err?.message || 'Failed to nudge.');
    } finally {
      setNudging(false);
    }
  };

  const triggerNudgeEffect = useCallback(() => {
    const viewport = messagesViewportRef.current;
    if (viewport) {
      viewport.style.animation = 'none';
      viewport.offsetHeight;
      viewport.style.animation = 'nudge-viewport-shake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';
      setTimeout(() => { viewport.style.animation = ''; }, 700);
    }
    if (navigator.vibrate) {
      navigator.vibrate([50, 30, 80, 30, 50, 30, 40, 20, 30]);
    }
  }, []);

  const handleBeginReply = useCallback((message) => {
    const nextTarget = buildReplyDraftTarget(message);
    if (!nextTarget) return;
    setReplyTarget(nextTarget);
    setReplyHighlightVersion((prev) => prev + 1);
    window.requestAnimationFrame(() => {
      const input = draftInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, []);

  const handleComposerKeyDown = (event) => {
    if (handleMentionKeyDown(event)) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleInsertSticker = useCallback((token) => {
    setDraft((prev) => appendStickerToken(prev, token));
    window.requestAnimationFrame(() => {
      const input = draftInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, []);

  const handleReplyWithBest = useCallback(async (message) => {
    if (!conversationId || !user || !message?.id) return;
    setActionError('');
    setReplyingMessageId(message.id);

    try {
      const source = await resolveCompareSource(message);
      if (!source?.chartId) {
        throw new Error('Could not find the chart for this compare reply.');
      }

      const detail = await getSongChartDetail(source.chartId, { user_id: user.id });
      const chart = detail?.chart || null;
      const best = detail?.user_summary?.best || null;

      if (!chart) {
        throw new Error('That chart could not be loaded.');
      }
      if (!best) {
        throw new Error('You do not have a recorded best on that chart yet.');
      }

      const compareLinkShare = buildChartCompareLinkShare({
        chartId: chart.chart_id || source.chartId,
        chartTitle: chart.title,
        mode: chart.mode,
        level: chart.level,
        username: user.username,
        best,
        targetScore: source.targetScore,
        challengeKind: source.challengeKind,
        sourceMessageId: message.id,
      });

      if (!compareLinkShare) {
        throw new Error('Could not build a compare reply for this chart.');
      }

      const payload = await sendConversationMessage(conversationId, { link_share: compareLinkShare });
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
    } catch (err) {
      setActionError(err?.message || 'Failed to send compare reply.');
    } finally {
      setReplyingMessageId('');
    }
  }, [conversationId, loadConversations, resolveCompareSource, user]);

  const sendChallengeLifecycleUpdate = useCallback(async (message, statusKind, setLoadingId) => {
    if (!conversationId || !user || !message?.id || message?.message_type !== 'challenge_card' || !message.challenge_card) return;

    setActionError('');
    setLoadingId(message.id);

    try {
      const lifecycleCard = buildChallengeLifecycleCard({
        challengeCard: message.challenge_card,
        actorName: user.username,
        statusKind,
        sourceMessageId: message.id,
      });

      if (!lifecycleCard) {
        throw new Error('Could not update challenge state.');
      }

      const payload = await sendConversationMessage(conversationId, { challenge_card: lifecycleCard });
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
    } catch (err) {
      setActionError(err?.message || 'Failed to update challenge.');
    } finally {
      setLoadingId('');
    }
  }, [conversationId, loadConversations, user]);

  const handleAcceptChallenge = useCallback(async (message) => {
    await sendChallengeLifecycleUpdate(message, 'accepted', setAcceptingMessageId);
  }, [sendChallengeLifecycleUpdate]);

  const handleExpireChallenge = useCallback(async (message) => {
    await sendChallengeLifecycleUpdate(message, 'expired', setExpiringMessageId);
  }, [sendChallengeLifecycleUpdate]);

  const handleSendRematch = useCallback(async (message) => {
    if (!conversationId || !user || !message?.id || message?.message_type !== 'link_share') return;
    const linkShare = message.link_share || null;
    if (!linkShare || linkShare.kind !== 'chart_compare') return;

    setActionError('');
    setRematchingMessageId(message.id);

    try {
      const chartId = await resolveChartReference({
        chartPath: linkShare.chartPath || linkShare.path,
        songTitle: linkShare.songTitle,
        mode: linkShare.mode,
        level: linkShare.level,
      });
      if (!chartId) {
        throw new Error('Could not find the chart for this rematch.');
      }

      let targetScore = parseInt(linkShare.score, 10) || 0;
      let targetGrade = String(linkShare.grade || '').trim();
      let chartTitle = String(linkShare.songTitle || '').trim();
      let mode = String(linkShare.mode || '').trim();
      let level = parseInt(linkShare.level, 10) || 0;

      if (!targetScore || !chartTitle || !mode || !level) {
        const detail = await getSongChartDetail(chartId, { user_id: message.sender?.id || '' });
        const chart = detail?.chart || null;
        const best = detail?.user_summary?.best || null;
        if (!chart) {
          throw new Error('That chart could not be loaded.');
        }
        chartTitle = chart.title;
        mode = chart.mode;
        level = chart.level;
        targetScore = targetScore || (parseInt(best?.score, 10) || 0);
        targetGrade = targetGrade || String(best?.grade || '').trim();
      }

      if (!targetScore) {
        throw new Error('No rematch target is available for this reply yet.');
      }

      const rematchCard = buildRematchChallengeCard({
        chartId,
        chartTitle,
        mode,
        level,
        challengerName: user.username,
        targetScore,
        targetGrade,
      });

      if (!rematchCard) {
        throw new Error('Could not build a rematch challenge.');
      }

      const payload = await sendConversationMessage(conversationId, { challenge_card: rematchCard });
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
    } catch (err) {
      setActionError(err?.message || 'Failed to send rematch.');
    } finally {
      setRematchingMessageId('');
    }
  }, [conversationId, loadConversations, resolveChartReference, user]);

  const handleStartConversation = async (selectedUser) => {
    const payload = await getOrCreateDirectConversation(selectedUser.id);
    setPickerOpen(false);
    await loadConversations();
    if (payload?.conversation?.id) {
      navigate(`/messages/${payload.conversation.id}`);
    }
  };

  const handleCreateSquad = useCallback(async ({ title, avatar, memberIds }) => {
    setCreatingSquad(true);
    try {
      const payload = await createMessageSquad({
        title,
        avatar,
        member_ids: memberIds,
      });
      setSquadComposerOpen(false);
      await loadConversations();
      if (payload?.conversation?.id) {
        navigate(`/messages/${payload.conversation.id}`);
      }
    } finally {
      setCreatingSquad(false);
    }
  }, [loadConversations, navigate]);

  const handleSquadConversationUpdated = useCallback((nextConversation) => {
    if (!nextConversation?.id) return;
    setActiveConversation((prev) => (
      prev?.id === nextConversation.id
        ? { ...prev, ...nextConversation }
        : prev
    ));
    setConversations((prev) => prev.map((entry) => (
      entry.id === nextConversation.id ? { ...entry, ...nextConversation } : entry
    )));
    loadConversations();
  }, [loadConversations]);

  const handlePinConversation = useCallback(async () => {
    if (!activeConversation?.id || pinningConversation) return;
    const nextPinned = !activeConversation.is_pinned;
    setPinningConversation(true);
    try {
      const payload = await pinMessageConversation(activeConversation.id, nextPinned);
      if (payload?.conversation) {
        setActiveConversation((prev) => (
          prev?.id === payload.conversation.id ? { ...prev, ...payload.conversation } : prev
        ));
        setConversations((prev) => prev.map((entry) => (
          entry.id === payload.conversation.id ? { ...entry, ...payload.conversation } : entry
        )));
        loadConversations();
      }
    } catch {
      // silently ignore
    } finally {
      setPinningConversation(false);
    }
  }, [activeConversation?.id, activeConversation?.is_pinned, pinningConversation, loadConversations]);

  const closeStoryViewer = useCallback(() => {
    setStoryViewerState({
      open: false,
      user: null,
      stories: [],
      loading: false,
      error: '',
      readonly: false,
      sourceUserId: '',
      initialIndex: 0,
    });
  }, []);

  const openStoryForCircle = useCallback(async (circle, readonly = false, initialIndex = 0) => {
    if (!circle?.user?.id) return;
    setStoryViewerState({
      open: true,
      user: circle.user,
      stories: [],
      loading: true,
      error: '',
      readonly,
      sourceUserId: circle.user.id,
      initialIndex,
    });
    try {
      const payload = await getMessageStory(circle.user.id);
      const nextStories = Array.isArray(payload?.stories) ? payload.stories : [];
      const resolvedInitialIndex = initialIndex < 0
        ? Math.max(0, nextStories.length - 1)
        : Math.max(0, Math.min(initialIndex, Math.max(0, nextStories.length - 1)));
      setStoryViewerState({
        open: true,
        user: payload?.user || circle.user,
        stories: nextStories,
        loading: false,
        error: '',
        readonly,
        sourceUserId: circle.user.id,
        initialIndex: resolvedInitialIndex,
      });
    } catch (err) {
      setStoryViewerState({
        open: true,
        user: circle.user,
        stories: [],
        loading: false,
        error: 'Story unavailable right now.',
        readonly,
        sourceUserId: circle.user.id,
        initialIndex: 0,
      });
    }
  }, []);

  const handleOpenHighlightStory = useCallback(async (circle) => {
    await openStoryForCircle(circle, false);
  }, [openStoryForCircle]);

  const handleOpenStoryArchive = useCallback(async () => {
    setStoryArchiveOpen(true);
    setStoryArchiveError('');
    try {
      const payload = await getMessageStoryArchive();
      setArchivedStories(Array.isArray(payload?.stories) ? payload.stories : []);
    } catch (err) {
      setArchivedStories([]);
      setStoryArchiveError(err?.message || 'Failed to load archive.');
    }
  }, []);

  const handleOpenArchivedStory = useCallback((story) => {
    if (!story) return;
    setStoryArchiveOpen(false);
    setStoryViewerState({
      open: true,
      user: story.user || highlights?.me?.user || null,
      stories: [story],
      loading: false,
      error: '',
      readonly: true,
      sourceUserId: story?.user?.id || highlights?.me?.user?.id || '',
      initialIndex: 0,
    });
  }, [highlights?.me?.user]);

  const handleStoryViewerNavigateUser = useCallback(async (direction) => {
    const currentUserId = String(storyViewerState.sourceUserId || storyViewerState.user?.id || '').trim();
    if (!currentUserId || storyViewerState.readonly) return;
    const currentIndex = orderedStoryCircles.findIndex((circle) => String(circle?.user?.id || '').trim() === currentUserId);
    if (currentIndex === -1) return;
    const nextCircle = orderedStoryCircles[currentIndex + direction];
    if (!nextCircle) return;
    await openStoryForCircle(nextCircle, false, direction < 0 ? -1 : 0);
  }, [openStoryForCircle, orderedStoryCircles, storyViewerState.readonly, storyViewerState.sourceUserId, storyViewerState.user?.id]);

  const handleReactToMessage = useCallback(async (message, reactionKey) => {
    if (!conversationId || !message?.id) return;
    const normalizedKey = sanitizeReactionKey(reactionKey);
    if (!normalizedKey) return;
    try {
      const payload = await setMessageConversationReaction(conversationId, message.id, normalizedKey);
      if (payload?.message?.id) {
        setMessages((prev) => prev.map((entry) => (
          entry.id === payload.message.id ? payload.message : entry
        )));
      }
    } catch (err) {
      setActionError(err?.message || 'Failed to react to message.');
    }
  }, [conversationId]);

  const handleStoryViewerStoriesChange = useCallback((nextStories) => {
    setStoryViewerState((prev) => ({
      ...prev,
      stories: Array.isArray(nextStories) ? nextStories : prev.stories,
    }));
    loadHighlights();
  }, [loadHighlights]);

  const handleStoryArchiveChange = useCallback((nextArchived) => {
    setArchivedStories(Array.isArray(nextArchived) ? nextArchived : []);
  }, []);

  const handleOpenStoryComposer = useCallback(async () => {
    if (!user?.id) return;
    setStoryComposerError('');
    setStoryComposerOpen(true);
    try {
      const payload = await getMessageStory(user.id);
      setStoryComposerOptions(buildScoreStoryOptions(payload?.stories || []));
    } catch {
      setStoryComposerOptions([]);
    }
  }, [user?.id]);

  const handleOpenHighlightNote = useCallback(async (circle) => {
    if (!circle?.user?.id) return;
    if (circle.is_self) {
      setNoteComposerError('');
      setNoteComposerOpen(true);
      return;
    }
    if (!circle.note?.thread_key) return;

    setThreadState({
      open: true,
      note: { ...circle.note, user: circle.user },
      conversation: null,
      messages: [],
      loading: true,
      sending: false,
      draft: '',
      error: '',
    });

    try {
      const directPayload = await getOrCreateDirectConversation(circle.user.id);
      const targetConversationId = directPayload?.conversation?.id || '';
      if (!targetConversationId) {
        throw new Error('Could not open this thread yet.');
      }
      const payload = await getMessageConversation(targetConversationId);
      setThreadState({
        open: true,
        note: { ...circle.note, user: circle.user },
        conversation: payload?.conversation || null,
        messages: getThreadMessages(payload?.messages || [], circle.note),
        loading: false,
        sending: false,
        draft: '',
        error: '',
      });
      refreshMessageUnread();
    } catch (err) {
      setThreadState({
        open: true,
        note: { ...circle.note, user: circle.user },
        conversation: null,
        messages: [],
        loading: false,
        sending: false,
        draft: '',
        error: err?.message || 'Failed to load thread.',
      });
    }
  }, [refreshMessageUnread]);

  const handleOpenMessageThread = useCallback((message) => {
    const thread = message?.note_thread || null;
    if (!thread?.threadKey) return;
    const note = {
      id: thread.noteId || thread.threadKey,
      user_id: thread.ownerUserId || '',
      user: {
        id: thread.ownerUserId || '',
        username: thread.ownerUsername || 'Thread',
      },
      content: thread.noteText || '',
      kind: thread.noteKind || '',
      thread_key: thread.threadKey,
      created_at: thread.createdAt || '',
      expires_at: thread.expiresAt || '',
      link: {
        path: thread.linkPath || '',
        url: thread.linkUrl || '',
        label: thread.linkLabel || '',
      },
    };
    setThreadState({
      open: true,
      note,
      conversation: activeConversation,
      messages: getThreadMessages(messages, note),
      loading: false,
      sending: false,
      draft: '',
      error: '',
    });
  }, [activeConversation, messages]);

  const handleThreadSend = useCallback(async () => {
    const trimmedDraft = threadState.draft.trim();
    const notePayload = buildNoteThreadPayload(threadState.note);
    if (!threadState.conversation?.id || !trimmedDraft || !notePayload || threadState.sending) return;

    setThreadState((prev) => ({ ...prev, sending: true, error: '' }));
    try {
      const payload = await sendConversationMessage(threadState.conversation.id, {
        content: trimmedDraft,
        note_thread: notePayload,
      });
      const nextMessage = payload?.message || null;
      if (!nextMessage) throw new Error('Failed to send reply.');

      setThreadState((prev) => ({
        ...prev,
        sending: false,
        draft: '',
        messages: [...prev.messages, nextMessage],
      }));

      if (conversationId === threadState.conversation.id) {
        setMessages((prev) => [...prev, nextMessage]);
      }
      if (payload?.conversation && conversationId === payload.conversation.id) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
      loadHighlights();
    } catch (err) {
      setThreadState((prev) => ({
        ...prev,
        sending: false,
        error: err?.message || 'Failed to send reply.',
      }));
    }
  }, [conversationId, loadConversations, loadHighlights, threadState]);

  const handleSaveNote = useCallback(async ({ content }) => {
    setNoteSubmitting(true);
    setNoteComposerError('');
    try {
      await createMessageNote({ content });
      await loadHighlights();
      setNoteComposerOpen(false);
    } catch (err) {
      setNoteComposerError(err?.message || 'Failed to save note.');
    } finally {
      setNoteSubmitting(false);
    }
  }, [loadHighlights]);

  const handleClearNote = useCallback(async () => {
    setNoteSubmitting(true);
    setNoteComposerError('');
    try {
      await clearMessageNote();
      await loadHighlights();
      setNoteComposerOpen(false);
    } catch (err) {
      setNoteComposerError(err?.message || 'Failed to clear note.');
    } finally {
      setNoteSubmitting(false);
    }
  }, [loadHighlights]);

  const handleSubmitStory = useCallback(async (payload) => {
    setStoryComposerSubmitting(true);
    setStoryComposerError('');
    try {
      await createMessageStoryItem(payload);
      await loadHighlights();
      setStoryComposerOpen(false);
    } catch (err) {
      setStoryComposerError(err?.message || 'Failed to add story.');
    } finally {
      setStoryComposerSubmitting(false);
    }
  }, [loadHighlights]);

  return (
    <>
      {conversationId ? (
        <ConversationView
          conversationId={conversationId}
          activeConversation={activeConversation}
          activePartner={activePartner}
          loadingMessages={loadingMessages}
          messageError={messageError}
          actionError={actionError}
          messages={messages}
          getMessageStatus={getChallengeStatusForMessage}
          messagesViewportRef={messagesViewportRef}
          messagesEndRef={messagesEndRef}
          draft={draft}
          draftInputRef={draftInputRef}
          replyTarget={replyTarget}
          activeReplyMessageId={replyTarget?.messageId || ''}
          replyHighlightVersion={replyHighlightVersion}
          touchInteractionsEnabled={touchInteractionsEnabled}
          touchInteractionsBlockedUntil={touchInteractionsBlockedUntil}
          onDraftChange={setDraft}
          onComposerKeyDown={handleComposerKeyDown}
          onSend={handleSend}
          onReply={handleBeginReply}
          onCancelReply={() => {
            setReplyTarget(null);
            setReplyHighlightVersion(0);
          }}
          mentionUsers={mentionUsers}
          mentionLoading={mentionLoading}
          showMentions={showMentions}
          onApplyMention={applyMention}
          onRefreshMentions={updateMentionState}
          onInsertSticker={handleInsertSticker}
          onReplyWithBest={handleReplyWithBest}
          canReplyWithBest={canReplyWithBest}
          onSendRematch={handleSendRematch}
          canSendRematch={canSendRematch}
          rematchingMessageId={rematchingMessageId}
          onAcceptChallenge={handleAcceptChallenge}
          canAcceptChallenge={canAcceptChallenge}
          acceptingMessageId={acceptingMessageId}
          onExpireChallenge={handleExpireChallenge}
          canExpireChallenge={canExpireChallenge}
          expiringMessageId={expiringMessageId}
          replyingMessageId={replyingMessageId}
          sending={sending}
          onOpenThread={handleOpenMessageThread}
          onOpenLink={handleOpenChatLink}
          onOpenSquadSettings={() => setSquadSettingsOpen(true)}
          onOpenPersonSettings={() => setPersonSettingsOpen(true)}
          onPinConversation={handlePinConversation}
          isPinned={!!activeConversation?.is_pinned}
          defaultReaction={defaultReaction}
          availableReactions={quickReactions}
          onReact={handleReactToMessage}
          readReceipts={readReceipts}
          onNudge={handleNudge}
          nudging={nudging}
        />
      ) : (
        <InboxView
          conversations={conversations}
          loadingConversations={loadingConversations}
          conversationError={conversationError}
          highlights={highlights}
          loadingHighlights={loadingHighlights}
          highlightError={highlightError}
          onOpenHighlightStory={handleOpenHighlightStory}
          onOpenHighlightNote={handleOpenHighlightNote}
          onOpenStoryComposer={handleOpenStoryComposer}
          onOpenStoryArchive={handleOpenStoryArchive}
          onOpenChatSettings={() => setChatSettingsOpen(true)}
          onStompConversation={handleConversationStomp}
          stompCelebrationConversationId={stompCelebrationConversationId}
          stompingConversationId={stompingConversationId}
          onStartChat={() => setPickerOpen(true)}
          onStartSquad={() => setSquadComposerOpen(true)}
        />
      )}

      <UserPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleStartConversation}
        excludeUserIds={excludeUserIds}
      />

      <SquadComposerModal
        open={squadComposerOpen}
        currentUserId={user?.id || ''}
        submitting={creatingSquad}
        onClose={() => {
          if (creatingSquad) return;
          setSquadComposerOpen(false);
        }}
        onSubmit={handleCreateSquad}
      />

      <SquadSettingsModal
        open={squadSettingsOpen}
        conversation={activeSquad}
        messages={messages}
        currentUserId={user?.id || ''}
        onClose={() => setSquadSettingsOpen(false)}
        onConversationUpdated={handleSquadConversationUpdated}
        onOpenLink={handleOpenChatLink}
      />

      <ConversationSettingsModal
        open={personSettingsOpen}
        partner={activePartner}
        conversation={activeConversation}
        messages={messages}
        onClose={() => setPersonSettingsOpen(false)}
        onOpenLink={handleOpenChatLink}
        onConversationUpdated={(updated) => {
          setActiveConversation((prev) => prev?.id === updated.id ? { ...prev, ...updated } : prev);
          setConversations((prev) => prev.map((entry) => entry.id === updated.id ? { ...entry, ...updated } : entry));
        }}
      />

      <StoryViewerModal
        open={storyViewerState.open}
        user={storyViewerState.user}
        stories={storyViewerState.stories}
        loading={storyViewerState.loading}
        error={storyViewerState.error}
        readonly={storyViewerState.readonly}
        initialIndex={storyViewerState.initialIndex}
        onStoriesChange={handleStoryViewerStoriesChange}
        onArchiveChange={handleStoryArchiveChange}
        hasPreviousUser={!storyViewerState.readonly && orderedStoryCircles.findIndex((circle) => circle?.user?.id === storyViewerState.sourceUserId) > 0}
        hasNextUser={!storyViewerState.readonly && orderedStoryCircles.findIndex((circle) => circle?.user?.id === storyViewerState.sourceUserId) < orderedStoryCircles.length - 1}
        onNavigatePreviousUser={() => handleStoryViewerNavigateUser(-1)}
        onNavigateNextUser={() => handleStoryViewerNavigateUser(1)}
        onClose={closeStoryViewer}
      />

      <StoryArchiveModal
        open={storyArchiveOpen}
        stories={archivedStories}
        onClose={() => setStoryArchiveOpen(false)}
        onOpenStory={handleOpenArchivedStory}
      />

      {storyArchiveOpen && storyArchiveError ? (
        <div className="fixed inset-x-4 bottom-4 z-[170] rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 shadow-[0_18px_42px_rgba(0,0,0,0.28)] sm:left-1/2 sm:max-w-md sm:-translate-x-1/2">
          {storyArchiveError}
        </div>
      ) : null}

      <ChatSettingsModal
        open={chatSettingsOpen}
        openLinksExternally={openLinksExternally}
        onToggleOpenLinksExternally={setOpenLinksExternally}
        defaultReaction={defaultReaction}
        quickReactions={quickReactions}
        onDefaultReactionChange={setDefaultReaction}
        onQuickReactionsChange={setQuickReactions}
        onClose={() => setChatSettingsOpen(false)}
      />

      <InAppBrowserModal
        open={embeddedBrowserState.open}
        title={embeddedBrowserState.title}
        url={embeddedBrowserState.url}
        onClose={() => setEmbeddedBrowserState({ open: false, title: '', url: '' })}
      />

      <YouTubeReplayModal
        url={youtubeModalState.open ? youtubeModalState.url : ''}
        title={youtubeModalState.title || 'YouTube video'}
        onClose={() => setYoutubeModalState({ open: false, title: '', url: '' })}
      />

      <NoteComposerModal
        open={noteComposerOpen}
        note={highlights?.me?.note || null}
        submitting={noteSubmitting}
        error={noteComposerError}
        onClose={() => setNoteComposerOpen(false)}
        onSubmit={handleSaveNote}
        onClear={handleClearNote}
      />

      <StoryComposerModal
        open={storyComposerOpen}
        scoreOptions={storyComposerOptions}
        submitting={storyComposerSubmitting}
        error={storyComposerError}
        onClose={() => setStoryComposerOpen(false)}
        onSubmit={handleSubmitStory}
      />

      <NoteThreadModal
        open={threadState.open}
        note={threadState.note}
        conversation={threadState.conversation}
        messages={threadState.messages}
        loading={threadState.loading}
        sending={threadState.sending}
        error={threadState.error}
        draft={threadState.draft}
        onClose={() => setThreadState({
          open: false,
          note: null,
          conversation: null,
          messages: [],
          loading: false,
          sending: false,
          draft: '',
          error: '',
        })}
        onDraftChange={(value) => setThreadState((prev) => ({ ...prev, draft: value }))}
        onSend={handleThreadSend}
        onOpenConversation={() => {
          if (threadState.conversation?.id) {
            navigate(`/messages/${threadState.conversation.id}`);
            setThreadState({
              open: false,
              note: null,
              conversation: null,
              messages: [],
              loading: false,
              sending: false,
              draft: '',
              error: '',
            });
          }
        }}
      />
    </>
  );
}

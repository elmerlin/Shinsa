import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  addLiveSessionCohost,
  castLiveVote,
  createLiveOverlayToken,
  createLiveSession,
  createLiveVote,
  deleteLiveMessage,
  endLiveSession,
  getLiveSession,
  getLiveSessions,
  getLiveYoutubeTimestamps,
  getMyLiveSession,
  getSongLibrary,
  publishLiveYoutubeTimestamps,
  getYoutubeBroadcasts,
  getYoutubeConnectionStatus,
  leaveLiveSession,
  openLiveSessionStream,
  pumpLiveMessage,
  removeLiveSessionCohost,
  searchUsers,
  sendLiveMessage,
  sendLivePresence,
  sendLiveRequest,
  startYoutubeConnection,
  setLiveModeration,
  setLiveRequestStatus,
  syncLiveSession,
  updateLiveSession,
} from '../utils/api';
import LiveEmote from '../components/LiveEmote';
import LiveDirectoryCard from '../components/LiveDirectoryCard';
import LiveHeaderStatusStrip from '../components/LiveHeaderStatusStrip';
import PiuChartJacket from '../components/PiuChartJacket';
import { parseGrade } from '../utils/grades';
import {
  LIVE_EMOTE_TRAY_GROUPS,
  LIVE_EMOJI_GROUPS,
  getLiveReactionPayload,
  getReactionBurstColors,
  tokenizeLiveMessage,
} from '../utils/liveEmotes';
import { renderFormattedText } from '../utils/formatText';
import { isStickerOnlyMessage, STICKER_GROUPS } from '../utils/stickers';
import {
  getLiveOverlaySceneOptions,
  getLiveOverlayOutputSpec,
  buildLiveOverlayUrl,
  getDefaultLiveOverlayWidgets,
  LIVE_OVERLAY_ANCHORS,
  LIVE_OVERLAY_AUTO_HIDE_MODES,
  LIVE_OVERLAY_FITS,
  LIVE_OVERLAY_PRESETS,
  LIVE_OVERLAY_SCENES,
  LIVE_OVERLAY_THEMES,
  LIVE_OVERLAY_WIDGETS,
  normalizeLiveOverlayAnchor,
  normalizeLiveOverlayAutoHide,
  normalizeLiveOverlayBrandMotion,
  normalizeLiveOverlayFit,
  normalizeLiveOverlayGuides,
  normalizeLiveOverlayOpacity,
  normalizeLiveOverlayPreset,
  normalizeLiveOverlayTheme,
  normalizeLiveOverlayWidgets,
} from '../utils/liveOverlay';

const QUICK_REACTIONS = LIVE_EMOJI_GROUPS[0]?.emojis || ['🔥', '💪', '👏', '😂', '❤️', '⚡'];
const LIVE_CHAT_TRAY_TABS = [
  { id: 'emotes', label: 'Emotes' },
  { id: 'stickers', label: 'Stickers' },
];
const GRADE_SORT = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const PLATE_NAMES = { PG: 'PERFECT GAME', UG: 'ULTIMATE GAME', EG: 'EXTREME GAME', SG: 'SUPERB GAME', MG: 'MARVELOUS GAME', TG: 'TALENTED GAME', FG: 'FAIR GAME', RG: 'ROUGH GAME' };
const PLATE_COLORS = { PG: 'text-piu-gold', UG: 'text-yellow-400', EG: 'text-green-400', SG: 'text-blue-400', MG: 'text-sky-400', TG: 'text-purple-400', FG: 'text-gray-400', RG: 'text-red-400' };
const REQUEST_STATUS_META = {
  open: {
    label: 'Open',
    pill: 'border border-sky-400/30 bg-sky-500/10 text-sky-200',
    card: 'border-piu-border bg-black/10',
  },
  queued: {
    label: 'Queued',
    pill: 'border border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200',
    card: 'border-fuchsia-400/25 bg-fuchsia-500/8',
  },
  played: {
    label: 'Played',
    pill: 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    card: 'border-emerald-400/25 bg-emerald-500/8',
  },
  skipped: {
    label: 'Skipped',
    pill: 'border border-amber-400/30 bg-amber-500/10 text-amber-200',
    card: 'border-amber-400/25 bg-amber-500/8',
  },
};
const REQUEST_MODE_OPTIONS = [
  { value: 'All', label: 'All' },
  { value: 'Single', label: 'Singles' },
  { value: 'Double', label: 'Doubles' },
];
const DEFAULT_REQUEST_MAX_LEVEL = 30;
const REQUEST_MAX_LEVEL_OPTIONS = Array.from({ length: DEFAULT_REQUEST_MAX_LEVEL }, (_, index) => index + 1);

function LiveEmoteTrayTile({ emote, disabled, onReact, onAdd }) {
  return (
    <div className="rounded-2xl border border-piu-border/50 bg-piu-card/70 p-2">
      <button
        type="button"
        onClick={onReact}
        disabled={disabled}
        title={`React with ${emote.label}`}
        className="flex min-h-[4.75rem] w-full items-center justify-center rounded-xl border border-piu-border/50 bg-piu-dark/50 px-2 py-2 transition-colors hover:border-piu-accent/40 hover:bg-piu-dark/70 disabled:opacity-40"
      >
        <LiveEmote emote={emote} size="compact" showLabel={false} />
      </button>
      <div className="mt-2 min-w-0">
        <p className="truncate text-[11px] font-display font-bold text-white">{emote.label}</p>
        <p className="mt-0.5 truncate text-[10px] text-gray-500">{emote.token}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="mt-2 w-full rounded-md border border-piu-border/60 bg-piu-dark/80 px-2.5 py-1.5 text-[10px] font-display font-semibold text-gray-300 transition-colors hover:border-piu-accent/50 hover:text-white disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

function getGradeIndex(grade) {
  const normalized = String(grade || '').trim().toUpperCase();
  const idx = GRADE_SORT.indexOf(normalized);
  return idx >= 0 ? idx : -1;
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

function getOverTop100Rank(value) {
  const rank = parseInt(value, 10) || 0;
  return rank > 0 && rank <= 100 ? rank : 0;
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function formatYoutubeChapterSourceLabel(kind) {
  if (kind === 'youtube_video_actual_start_time' || kind === 'youtube_actual_start_time') {
    return 'YouTube live start';
  }
  if (kind === 'youtube_video_scheduled_start_time' || kind === 'youtube_scheduled_start_time') {
    return 'Scheduled YouTube start';
  }
  if (kind === 'session_started_at') return 'Session start';
  return 'Unknown start';
}

function formatYoutubeChapterTitle(chapter) {
  const songTitle = String(chapter?.song_title || '').trim();
  if (!songTitle) return String(chapter?.title || '').trim() || 'Stream start';
  const performer = String(chapter?.username || '').trim();
  const base = `${songTitle} (${modeShort(chapter?.mode)}${parseInt(chapter?.level, 10) || '?'})`;
  return performer ? `${performer} - ${base}` : base;
}

function getYouTubeId(url) {
  if (!url) return '';
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = String(url).match(pattern);
    if (match) return match[1];
  }
  return '';
}

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  return 'X';
}

function formatPlayLabel(play) {
  return `${String(play?.song_title || 'Unknown chart').trim() || 'Unknown chart'} (${modeShort(play?.mode)}${parseInt(play?.level, 10) || '?'})`;
}

function getRequestStatus(status, fulfilled = false) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'open' || normalized === 'queued' || normalized === 'played' || normalized === 'skipped') {
    return normalized;
  }
  return fulfilled ? 'played' : 'open';
}

function getRequestStatusMeta(status, fulfilled = false) {
  return REQUEST_STATUS_META[getRequestStatus(status, fulfilled)] || REQUEST_STATUS_META.open;
}

function getInitial(name) {
  return String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
}

function buildRequestKey(songTitle, mode, level) {
  return [
    String(songTitle || '').trim().toLowerCase(),
    String(mode || '').trim().toLowerCase(),
    parseInt(level, 10) || 0,
  ].join('|');
}

function normalizeRequestModeFilterValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'single' || normalized === 'singles') return 'Single';
  if (normalized === 'double' || normalized === 'doubles') return 'Double';
  return 'All';
}

function normalizeRequestMaxLevelValue(value) {
  const parsed = parseInt(value, 10) || 0;
  return parsed > 0 ? Math.min(parsed, DEFAULT_REQUEST_MAX_LEVEL) : DEFAULT_REQUEST_MAX_LEVEL;
}

function requestPolicyAllowsChart(chart, modeFilter = 'All', maxLevel = DEFAULT_REQUEST_MAX_LEVEL) {
  const normalizedModeFilter = normalizeRequestModeFilterValue(modeFilter);
  const normalizedMaxLevel = normalizeRequestMaxLevelValue(maxLevel);
  if (normalizedModeFilter !== 'All' && String(chart?.mode || '') !== normalizedModeFilter) return false;
  return (parseInt(chart?.level, 10) || 0) <= normalizedMaxLevel;
}

function filterSongResultsForRequests(results, modeFilter = 'All', maxLevel = DEFAULT_REQUEST_MAX_LEVEL) {
  return (Array.isArray(results) ? results : []).map((song) => {
    const charts = (Array.isArray(song?.charts) ? song.charts : []).filter((chart) => (
      requestPolicyAllowsChart(chart, modeFilter, maxLevel)
    ));
    return charts.length > 0 ? { ...song, charts } : null;
  }).filter(Boolean);
}

function formatRequestPolicySummary(modeFilter = 'All', maxLevel = DEFAULT_REQUEST_MAX_LEVEL) {
  const normalizedModeFilter = normalizeRequestModeFilterValue(modeFilter);
  const normalizedMaxLevel = normalizeRequestMaxLevelValue(maxLevel);
  const modeLabel = normalizedModeFilter === 'Single'
    ? 'Singles'
    : normalizedModeFilter === 'Double'
      ? 'Doubles'
      : 'All charts';
  return `${modeLabel} up to Lv.${normalizedMaxLevel}`;
}

function formatCountdownLabel(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil((Number(remainingMs) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}`;
  return `${seconds}s`;
}

function formatRelativeSyncTime(timestamp) {
  if (!timestamp) return 'No sync yet';
  const parsed = Date.parse(`${timestamp}Z`);
  if (!Number.isFinite(parsed)) return 'No sync yet';
  const diffMs = Math.max(0, Date.now() - parsed);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) return 'Synced just now';
  if (diffMinutes < 60) return `Synced ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  const remMinutes = diffMinutes % 60;
  return remMinutes > 0 ? `Synced ${diffHours}h ${remMinutes}m ago` : `Synced ${diffHours}h ago`;
}

function buildSyncStatusNote(syncResult, fallback = 'Live session is up to date.') {
  const parts = [];
  const newPlays = parseInt(syncResult?.new_plays_added, 10) || 0;
  const fulfilledRequests = parseInt(syncResult?.requests_fulfilled, 10) || 0;
  const titleUnlocks = parseInt(syncResult?.title_unlocks, 10) || 0;

  if (newPlays > 0) parts.push(`${newPlays} new play${newPlays === 1 ? '' : 's'} added.`);
  if (fulfilledRequests > 0) parts.push(`${fulfilledRequests} request${fulfilledRequests === 1 ? '' : 's'} fulfilled.`);
  if (titleUnlocks > 0) parts.push(`${titleUnlocks} title unlock${titleUnlocks === 1 ? '' : 's'} picked up.`);

  return parts.length > 0 ? parts.join(' ') : fallback;
}

function formatRequestStateLabel(info) {
  if (!info) return '';
  if ((info.queuedCount || 0) > 0) {
    return info.queuedCount === 1 ? 'Queued request' : `${info.queuedCount} queued`;
  }
  if ((info.openCount || 0) > 0) {
    return info.openCount === 1 ? 'Viewer request' : `${info.openCount} requests`;
  }
  if ((info.playedCount || 0) > 0) {
    return info.playedCount === 1 ? 'Request fulfilled' : `${info.playedCount} fulfilled`;
  }
  if ((info.skippedCount || 0) > 0) {
    return info.skippedCount === 1 ? 'Skipped request' : `${info.skippedCount} skipped`;
  }
  return '';
}

function formatCompactRequestStateLabel(info) {
  if (!info) return '';
  if ((info.queuedCount || 0) > 0) {
    return info.queuedCount === 1 ? 'Queued' : `${info.queuedCount} queued`;
  }
  if ((info.openCount || 0) > 0) {
    return info.openCount === 1 ? 'Request' : `${info.openCount} requests`;
  }
  if ((info.playedCount || 0) > 0) {
    return info.playedCount === 1 ? 'Request ✔' : `${info.playedCount} fulfilled`;
  }
  if ((info.skippedCount || 0) > 0) {
    return info.skippedCount === 1 ? 'Skipped' : `${info.skippedCount} skipped`;
  }
  return '';
}

function canPumpLiveMessage(entry) {
  return String(entry?.message_type || '').trim().toLowerCase() !== 'system';
}

function getMessageTone(message) {
  if (!message?.is_system && message?.message_type !== 'request') {
    return {
      wrapper: 'bg-black/15 border border-piu-border',
      label: '',
      labelClass: '',
      usernameClass: 'text-cyan-200',
      bodyClass: 'text-gray-200',
    };
  }

  switch (message?.message_type) {
    case 'play':
      return {
        wrapper: 'bg-cyan-500/10 border border-cyan-400/25',
        label: 'Play',
        labelClass: 'bg-cyan-400/15 text-cyan-200 border border-cyan-300/30',
        usernameClass: 'text-cyan-100',
        bodyClass: 'text-cyan-50',
      };
    case 'request':
      return {
        wrapper: 'bg-sky-500/10 border border-sky-400/20',
        label: 'Request',
        labelClass: 'bg-sky-400/15 text-sky-200 border border-sky-300/30',
        usernameClass: 'text-sky-100',
        bodyClass: 'text-sky-50',
      };
    case 'request_fulfilled':
      return {
        wrapper: 'bg-emerald-500/10 border border-emerald-400/25',
        label: 'Played',
        labelClass: 'bg-emerald-400/15 text-emerald-200 border border-emerald-300/30',
        usernameClass: 'text-emerald-100',
        bodyClass: 'text-emerald-50',
      };
    case 'title_unlock':
      return {
        wrapper: 'bg-amber-500/10 border border-amber-400/25',
        label: 'Title',
        labelClass: 'bg-amber-400/15 text-amber-200 border border-amber-300/30',
        usernameClass: 'text-amber-100',
        bodyClass: 'text-amber-50',
      };
    case 'vote':
      return {
        wrapper: 'bg-fuchsia-500/10 border border-fuchsia-400/20',
        label: 'Vote',
        labelClass: 'bg-fuchsia-400/15 text-fuchsia-200 border border-fuchsia-300/30',
        usernameClass: 'text-fuchsia-100',
        bodyClass: 'text-fuchsia-50',
      };
    case 'request_queue':
      return {
        wrapper: 'bg-fuchsia-500/10 border border-fuchsia-400/20',
        label: 'Queue',
        labelClass: 'bg-fuchsia-400/15 text-fuchsia-200 border border-fuchsia-300/30',
        usernameClass: 'text-fuchsia-100',
        bodyClass: 'text-fuchsia-50',
      };
    case 'moderation':
      return {
        wrapper: 'bg-amber-500/10 border border-amber-400/20',
        label: 'Host',
        labelClass: 'bg-amber-400/15 text-amber-200 border border-amber-300/30',
        usernameClass: 'text-amber-100',
        bodyClass: 'text-amber-50',
      };
    case 'vote_result':
      return {
        wrapper: 'bg-orange-500/10 border border-orange-400/20',
        label: 'Result',
        labelClass: 'bg-orange-400/15 text-orange-200 border border-orange-300/30',
        usernameClass: 'text-orange-100',
        bodyClass: 'text-orange-50',
      };
    default:
      return {
        wrapper: 'bg-rose-500/10 border border-rose-400/20',
        label: 'Live',
        labelClass: 'bg-rose-400/15 text-rose-200 border border-rose-300/30',
        usernameClass: 'text-rose-100',
        bodyClass: 'text-rose-50',
      };
  }
}

function buildLiveChatMessageLookups(plays, currentVote) {
  const playById = new Map();
  const playByChartKey = new Map();
  for (const play of Array.isArray(plays) ? plays : []) {
    const playId = String(play?.id || '').trim();
    if (playId) {
      playById.set(playId, play);
    }
    const chartKey = buildRequestKey(play?.song_title, play?.mode, play?.level);
    if (chartKey && !playByChartKey.has(chartKey)) {
      playByChartKey.set(chartKey, play);
    }
  }

  const voteById = new Map();
  const voteOptionById = new Map();
  const voteId = String(currentVote?.id || '').trim();
  if (voteId) {
    voteById.set(voteId, currentVote);
    for (const option of Array.isArray(currentVote?.options) ? currentVote.options : []) {
      const optionId = String(option?.id || '').trim();
      if (optionId) {
        voteOptionById.set(`${voteId}:${optionId}`, option);
      }
    }
  }

  return {
    playById,
    playByChartKey,
    voteById,
    voteOptionById,
  };
}

function getLiveChatRequesterLabel(message) {
  const match = String(message || '').match(/\b(?:for|from)\s+(.+?)\.\s*$/i);
  return match?.[1]?.trim() || '';
}

function getLiveChatPlayDetail(message) {
  const normalized = String(message || '').trim();
  if (!normalized) return '';
  const separatorIndex = normalized.indexOf('. ');
  if (separatorIndex < 0) return '';
  return normalized.slice(separatorIndex + 2).trim();
}

function buildStructuredSongMessage(entry, lookups = {}) {
  const messageType = String(entry?.message_type || '').trim().toLowerCase();
  if (!['play', 'request', 'request_fulfilled', 'request_queue', 'vote_result'].includes(messageType)) {
    return null;
  }

  const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
  const voteId = String(metadata.vote_id || '').trim();
  const winningOptionId = String(metadata.winning_option_id || '').trim();
  const vote = voteId ? lookups.voteById?.get(voteId) || null : null;
  const winningOption = voteId && winningOptionId
    ? lookups.voteOptionById?.get(`${voteId}:${winningOptionId}`) || null
    : Array.isArray(vote?.options)
      ? vote.options.find((option) => option?.is_winner) || null
      : null;
  const recentlyPlayedId = String(metadata.recently_played_id || '').trim();
  const linkedPlay = recentlyPlayedId ? lookups.playById?.get(recentlyPlayedId) || null : null;

  const songTitle = String(metadata.song_title || winningOption?.song_title || linkedPlay?.song_title || '').trim();
  const mode = String(metadata.mode || winningOption?.mode || linkedPlay?.mode || '').trim();
  const level = parseInt(metadata.level, 10) || parseInt(winningOption?.level, 10) || parseInt(linkedPlay?.level, 10) || 0;
  const fallbackPlay = songTitle
    ? lookups.playByChartKey?.get(buildRequestKey(songTitle, mode, level)) || null
    : null;
  const resolvedPlay = linkedPlay || fallbackPlay;
  const jacketUrl = String(
    metadata.jacket_url
      || winningOption?.jacket_url
      || resolvedPlay?.background_url
      || ''
  ).trim();

  if (!songTitle || !mode || level <= 0) {
    return null;
  }

  const score = parseInt(metadata.score, 10) || parseInt(resolvedPlay?.score, 10) || 0;
  const parsedGrade = parseGrade(
    metadata.grade || resolvedPlay?.grade || '',
    score > 0 ? getRank(score).label : ''
  );
  const displayGrade = parsedGrade.display || '';
  const requesterLabel = getLiveChatRequesterLabel(entry?.message);
  const requestStatus = String(metadata.request_status || '').trim().toLowerCase();
  const performerLabel = String(metadata.performed_by_username || resolvedPlay?.username || '').trim();
  const targetUsername = String(metadata.target_username || '').trim();
  let detail = '';

  if (messageType === 'play') {
    const baseDetail = getLiveChatPlayDetail(entry?.message);
    detail = performerLabel ? `${performerLabel}${baseDetail ? ` • ${baseDetail}` : ''}` : baseDetail;
  } else if (messageType === 'request_fulfilled') {
    detail = performerLabel
      ? `${performerLabel}${requesterLabel ? ` for ${requesterLabel}` : ''}.`
      : requesterLabel ? `Request hit for ${requesterLabel}.` : 'Request hit.';
  } else if (messageType === 'request_queue') {
    if (requestStatus === 'skipped') {
      detail = requesterLabel ? `Skipped from ${requesterLabel}.` : 'Request skipped.';
    } else if (requestStatus === 'open') {
      detail = requesterLabel ? `Back open for ${requesterLabel}.` : 'Request reopened.';
    } else {
      detail = requesterLabel ? `Queued from ${requesterLabel}.` : 'Request queued.';
    }
  } else if (messageType === 'vote_result') {
    const voteCount = parseInt(metadata.vote_count, 10) || parseInt(winningOption?.vote_count, 10) || 0;
    detail = voteCount > 0
      ? `Wins with ${voteCount} vote${voteCount === 1 ? '' : 's'}.`
      : 'Vote locked.';
  }

  const tags = [];
  const pumbilityGain = parseInt(metadata.pumbility_gain, 10) || 0;
  const overTop100Rank = parseInt(metadata.over_top100_rank, 10) || 0;
  const resultType = String(metadata.session_result_type || '').trim().toLowerCase();

  if (resultType === 'upscore') tags.push({ label: 'Upscore', tone: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100' });
  else if (resultType === 'clear') tags.push({ label: 'First clear', tone: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' });
  if (pumbilityGain > 0) tags.push({ label: `+${pumbilityGain} p`, tone: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' });
  if (overTop100Rank > 0) tags.push({ label: `OVER #${overTop100Rank}`, tone: 'border-yellow-400/25 bg-yellow-500/10 text-yellow-100' });
  if (targetUsername) tags.push({ label: `Target ${targetUsername}`, tone: 'border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-100' });

  return {
    messageType,
    songTitle,
    mode,
    level,
    jacketUrl,
    score,
    parsedGrade,
    displayGrade,
    detail,
    tags,
  };
}

function StructuredSongMessageBody({ structured, tone, compact = false, dense = false }) {
  const showResult = structured.messageType === 'play' && (structured.displayGrade || structured.score > 0);
  const gradeClass = structured.displayGrade
    ? `${getGradeColor(structured.displayGrade, structured.score)} ${structured.parsedGrade.isBroken ? 'grade-broken' : ''}`.trim()
    : '';
  const rowGapClass = compact ? 'mt-1 gap-2' : dense ? 'mt-1 gap-2' : 'mt-1.5 gap-2.5';
  const textSizeClass = compact ? 'text-[12px]' : dense ? 'text-[13px]' : 'text-sm';
  const metaTextSizeClass = compact ? 'text-[11px]' : dense ? 'text-[10px]' : 'text-xs';
  const pillSizeClass = compact ? 'px-1.5 py-0.5 text-[9px]' : dense ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';

  return (
    <div className={`${rowGapClass} flex min-w-0 items-center`}>
      <PiuChartJacket
        title={structured.songTitle}
        mode={structured.mode}
        level={structured.level}
        jacketUrl={structured.jacketUrl}
        size={compact ? 'xs' : dense ? 'xs' : 'sm'}
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden">
        <p className={`${textSizeClass} min-w-0 shrink truncate font-display font-bold text-white`}>
          {structured.songTitle}
        </p>
        {showResult && structured.displayGrade ? (
          <span
            className={`${compact ? 'text-[13px]' : dense ? 'text-[14px]' : 'text-[15px]'} shrink-0 font-display font-black leading-none ${gradeClass}`}
            data-grade={structured.displayGrade}
          >
            {structured.displayGrade}
          </span>
        ) : null}
        {showResult && structured.score > 0 ? (
          <span className={`${metaTextSizeClass} shrink-0 font-display font-bold text-cyan-100/90`}>
            {formatNumber(structured.score)}
          </span>
        ) : null}
        {structured.detail ? (
          <span className={`${metaTextSizeClass} min-w-0 shrink truncate ${tone.bodyClass}`}>
            {structured.detail}
          </span>
        ) : null}
        {structured.tags.map((tag) => (
          <span
            key={`${structured.songTitle}-${tag.label}`}
            className={`${pillSizeClass} shrink-0 rounded-full border font-display font-bold ${tag.tone}`}
          >
            {tag.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MessageBody({ entry, tone, compact = false, dense = false }) {
  const message = entry?.message || '';
  const isSystem = !!entry?.is_system;
  const reaction = !isSystem ? getLiveReactionPayload(message) : null;
  if (entry?.structured) {
    return <StructuredSongMessageBody structured={entry.structured} tone={tone} compact={compact} dense={dense} />;
  }
  if (reaction?.kind === 'emoji') {
    return <p className={`${compact || dense ? 'mt-0.5 text-xl' : 'mt-1 text-2xl'} max-w-full overflow-hidden leading-none`}>{reaction.emoji}</p>;
  }
  if (reaction?.kind === 'emote') {
    return (
      <div className={`${compact || dense ? 'mt-1.5' : 'mt-2'} max-w-full overflow-hidden`}>
        <LiveEmote emote={reaction.emote} size="reaction" />
      </div>
    );
  }

  const segments = tokenizeLiveMessage(message);
  const textSizeClass = compact ? 'text-[12px]' : dense ? 'text-[13px]' : 'text-sm';
  const marginTopClass = compact || dense ? 'mt-0.5' : 'mt-1';
  const messageContent = renderFormattedText(message);
  if (segments.length === 0) {
    if (isStickerOnlyMessage(message)) {
      return (
        <div className={`${marginTopClass} w-full max-w-full overflow-hidden ${tone.bodyClass}`}>
          {messageContent}
        </div>
      );
    }
    return (
      <p className={`${marginTopClass} w-full max-w-full overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${textSizeClass} ${tone.bodyClass}`}>
        {messageContent}
      </p>
    );
  }

  return (
    <div className={`${marginTopClass} flex w-full max-w-full min-w-0 flex-wrap items-center ${compact || dense ? 'gap-1' : 'gap-1.5'} overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${textSizeClass} ${tone.bodyClass}`}>
      {segments.map((segment, idx) => (
        segment.type === 'emote' ? (
          <LiveEmote key={`${segment.emote.token}-${idx}`} emote={segment.emote} size="inline" />
        ) : isStickerOnlyMessage(segment.text) ? (
          <div key={`text-${idx}`} className="min-w-0 max-w-full overflow-hidden">
            {renderFormattedText(segment.text)}
          </div>
        ) : (
          <span key={`text-${idx}`} className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {renderFormattedText(segment.text)}
          </span>
        )
      ))}
    </div>
  );
}

function normalizeSongResults(payload, options = {}) {
  const unlimited = !!options.unlimited;
  const maxSongs = parseInt(options.maxSongs, 10) || 10;
  const maxCharts = parseInt(options.maxCharts, 10) || 30;
  const songs = Array.isArray(payload?.songs) ? payload.songs : [];
  const grouped = [];
  let totalCharts = 0;
  for (const song of songs) {
    const charts = (Array.isArray(song?.charts) ? song.charts : []).map((chart) => ({
      ...chart,
      song_title: song.title || chart.song_title || chart.title || '',
      jacket_url: chart.jacket_url || song.jacket_url || '',
    }));
    if (charts.length === 0) continue;
    grouped.push({
      song_group_key: song.song_group_key || song.song_key || song.title || `song-${grouped.length}`,
      title: song.title || charts[0]?.song_title || 'Unknown song',
      artist: song.artist || '',
      jacket_url: song.jacket_url || charts[0]?.jacket_url || '',
      charts,
    });
    totalCharts += charts.length;
    if (!unlimited && (grouped.length >= maxSongs || totalCharts >= maxCharts)) break;
  }
  return grouped;
}

function buildParticipantScoreSnapshot(participant, chart) {
  return {
    user_id: participant?.user_id || participant?.id || '',
    username: participant?.username || '',
    avatar: participant?.avatar || '',
    role: participant?.role || '',
    best_score: chart?.best_score ?? null,
    best_grade: chart?.best_grade || '',
    is_pass: !!chart?.is_pass,
  };
}

function pickBestParticipantScoreSnapshot(snapshots = []) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  return list.slice().sort((a, b) => {
    const aScore = parseInt(a?.best_score, 10) || 0;
    const bScore = parseInt(b?.best_score, 10) || 0;
    if (bScore !== aScore) return bScore - aScore;
    if (Number(!!b?.is_pass) !== Number(!!a?.is_pass)) return Number(!!b?.is_pass) - Number(!!a?.is_pass);
    return String(a?.username || '').localeCompare(String(b?.username || ''));
  })[0] || null;
}

function mergeParticipantSongResults(payloads, participants, options = {}) {
  const songMap = new Map();
  const orderedSongKeys = [];

  (Array.isArray(payloads) ? payloads : []).forEach((payload, index) => {
    const participant = participants[index] || {};
    const normalizedSongs = normalizeSongResults(payload, options);
    for (const song of normalizedSongs) {
      const songKey = song.song_group_key || song.title || `song-${orderedSongKeys.length}`;
      if (!songMap.has(songKey)) {
        songMap.set(songKey, {
          song_group_key: songKey,
          title: song.title || 'Unknown song',
          artist: song.artist || '',
          jacket_url: song.jacket_url || '',
          chartMap: new Map(),
          chartOrder: [],
        });
        orderedSongKeys.push(songKey);
      }
      const targetSong = songMap.get(songKey);
      for (const chart of Array.isArray(song?.charts) ? song.charts : []) {
        const chartKey = `${chart.chart_id || ''}|${chart.mode || ''}|${chart.level || ''}|${chart.song_title || song.title || ''}`;
        if (!targetSong.chartMap.has(chartKey)) {
          targetSong.chartMap.set(chartKey, {
            ...chart,
            performer_scores: [],
          });
          targetSong.chartOrder.push(chartKey);
        }
        const targetChart = targetSong.chartMap.get(chartKey);
        targetChart.performer_scores = [
          ...(Array.isArray(targetChart.performer_scores) ? targetChart.performer_scores.filter((snapshot) => snapshot.user_id !== (participant?.user_id || participant?.id || '')) : []),
          buildParticipantScoreSnapshot(participant, chart),
        ];
        const bestSnapshot = pickBestParticipantScoreSnapshot(targetChart.performer_scores);
        targetChart.best_score = bestSnapshot?.best_score ?? null;
        targetChart.best_grade = bestSnapshot?.best_grade || '';
        targetChart.is_pass = targetChart.performer_scores.some((snapshot) => !!snapshot.is_pass);
      }
    }
  });

  return orderedSongKeys.map((songKey) => {
    const entry = songMap.get(songKey);
    return {
      song_group_key: entry.song_group_key,
      title: entry.title,
      artist: entry.artist,
      jacket_url: entry.jacket_url,
      charts: entry.chartOrder.map((chartKey) => entry.chartMap.get(chartKey)).filter(Boolean),
    };
  });
}

function parseRequestShortcutSearch(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/')) return null;
  const match = raw.match(/^\/([sdc])\s*(\d{1,2})(?:\s+(.*))?$/i);
  if (!match) return null;
  const modeToken = match[1].toLowerCase();
  const level = parseInt(match[2], 10) || 0;
  if (level <= 0) return null;
  return {
    mode: modeToken === 's' ? 'Single' : modeToken === 'd' ? 'Double' : 'CoOp',
    level,
    search: String(match[3] || '').trim(),
    token: `/${modeToken}${level}`,
  };
}

function flattenSongResultsToCharts(results) {
  const charts = [];
  for (const song of Array.isArray(results) ? results : []) {
    for (const chart of Array.isArray(song?.charts) ? song.charts : []) {
      charts.push({
        ...chart,
        song_group_key: song.song_group_key,
        song_title: chart.song_title || song.title || 'Unknown song',
        artist: song.artist || '',
        jacket_url: chart.jacket_url || song.jacket_url || '',
      });
    }
  }
  return charts;
}

function getRequestChartBadgeTone(mode) {
  if (mode === 'Single') {
    return 'border-red-500/35 bg-red-500/10 text-red-100';
  }
  if (mode === 'Double') {
    return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100';
  }
  return 'border-piu-border/60 bg-piu-dark/70 text-slate-100';
}

function getParticipantRoleLabel(role) {
  return role === 'owner' ? 'Host' : role === 'cohost' ? 'Co-host' : '';
}

function ParticipantScorePills({ performerScores, compact = false }) {
  const rows = Array.isArray(performerScores) ? performerScores : [];
  if (rows.length === 0) return null;

  return (
    <div className={`flex min-h-[1.4rem] flex-wrap gap-1 ${compact ? '' : 'mt-0.5'}`}>
      {rows.map((scoreRow) => {
        const bestScore = parseInt(scoreRow?.best_score, 10) || 0;
        const parsedBestGrade = parseGrade(
          scoreRow?.best_grade || '',
          bestScore > 0 ? getRank(bestScore).label : ''
        );
        const displayBestGrade = parsedBestGrade.display || '';
        return (
          <span
            key={`${scoreRow?.user_id || scoreRow?.username || 'player'}:${scoreRow?.best_score || 'na'}`}
            className={`rounded-full border px-2 py-0.5 font-display font-bold ${
              compact ? 'text-[9px]' : 'text-[10px]'
            } ${
              bestScore > 0 || scoreRow?.is_pass
                ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                : 'border-piu-border/60 bg-piu-dark/70 text-gray-300'
            }`}
          >
            {scoreRow?.username || 'Player'}: {displayBestGrade || (scoreRow?.is_pass ? 'Clear' : 'No clear')}
            {bestScore > 0 ? ` ${formatNumber(bestScore)}` : ''}
          </span>
        );
      })}
    </div>
  );
}

function SongRequestTierShortcutResult({ chart, disabled, onSelectChart, showHostScores = false, requestInfo = null, livePlayInfo = null }) {
  const bestScore = parseInt(chart?.best_score, 10) || 0;
  const parsedBestGrade = parseGrade(
    chart?.best_grade || '',
    bestScore > 0 ? getRank(bestScore).label : ''
  );
  const displayBestGrade = parsedBestGrade.display || '';
  const hasHostScoreSnapshot = chart?.best_score !== null && chart?.best_score !== undefined;
  const overlayVisible = showHostScores && displayBestGrade;
  const playedCount = parseInt(livePlayInfo?.count, 10) || 0;
  const queuedCount = parseInt(requestInfo?.queuedCount, 10) || 0;
  const openCount = parseInt(requestInfo?.openCount, 10) || 0;
  const playedRequestCount = parseInt(requestInfo?.playedCount, 10) || 0;
  const skippedCount = parseInt(requestInfo?.skippedCount, 10) || 0;

  return (
    <button
      type="button"
      onClick={() => onSelectChart(chart)}
      disabled={disabled}
      className="group text-left disabled:opacity-50"
      title={`Request ${chart.song_title} (${modeShort(chart.mode)}${chart.level})`}
    >
      <div className="overflow-hidden rounded-xl border border-piu-border/60 bg-piu-card/95 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-colors group-hover:border-piu-accent/50">
        <div className="relative aspect-[16/10] overflow-hidden bg-piu-dark">
          {chart.jacket_url ? (
            <img
              src={chart.jacket_url}
              alt={chart.song_title}
              className="h-full w-full object-cover opacity-90 transition-transform duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_top,#14375f,transparent_55%),linear-gradient(135deg,#0b1430,#060913)]" />
          )}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
            <span className={`rounded-md border px-2 py-1 text-[11px] font-display font-black shadow-[0_2px_8px_rgba(0,0,0,0.3)] ${getRequestChartBadgeTone(chart.mode)}`}>
              {modeShort(chart.mode)}{chart.level}
            </span>
            {playedCount > 0 ? (
              <span className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[10px] font-display font-bold text-emerald-100 shadow-[0_2px_8px_rgba(0,0,0,0.28)]">
                Played
              </span>
            ) : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#050816] via-[#050816]/80 to-transparent" />
          {overlayVisible ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                className={`font-display text-[34px] font-black leading-none ${getGradeColor(displayBestGrade, bestScore)} ${parsedBestGrade.isBroken ? 'grade-broken' : ''}`}
                data-grade={displayBestGrade}
                style={{ textShadow: '0 0 12px rgba(0,0,0,0.92), 0 2px 4px rgba(0,0,0,0.92)' }}
              >
                {displayBestGrade}
              </span>
            </div>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 p-2">
            <p className="truncate text-sm font-display font-bold text-white">
              {chart.song_title}
            </p>
            <p className="truncate text-[11px] text-gray-300/90">
              {chart.artist || 'Unknown artist'}
            </p>
          </div>
        </div>
        <div className="space-y-2 p-2.5">
          <div className="flex min-h-[1.5rem] flex-wrap gap-1.5">
            {showHostScores ? (
              Array.isArray(chart?.performer_scores) && chart.performer_scores.length > 0 ? (
                <ParticipantScorePills performerScores={chart.performer_scores} />
              ) : hasHostScoreSnapshot ? (
                displayBestGrade ? (
                  <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-cyan-100">
                    {displayBestGrade} {bestScore > 0 ? `• ${formatNumber(bestScore)}` : ''}
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-amber-100">
                    Not passed yet
                  </span>
                )
              ) : (
                <span className="rounded-full border border-piu-border/60 bg-piu-dark/70 px-2 py-0.5 text-[10px] font-display font-bold text-gray-300">
                  No synced score
                </span>
              )
            ) : null}
            {queuedCount > 0 ? (
              <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-fuchsia-100">
                {queuedCount === 1 ? 'Queued' : `${queuedCount} queued`}
              </span>
            ) : openCount > 0 ? (
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-sky-100">
                {openCount === 1 ? 'Requested' : `${openCount} requests`}
              </span>
            ) : null}
            {playedRequestCount > 0 ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-emerald-100">
                {playedRequestCount === 1 ? 'Request played' : `${playedRequestCount} played`}
              </span>
            ) : null}
            {skippedCount > 0 ? (
              <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-amber-100">
                {skippedCount === 1 ? 'Skipped once' : `${skippedCount} skipped`}
              </span>
            ) : null}
            {playedCount > 0 ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-emerald-100">
                {playedCount === 1 ? 'Played this session' : `${playedCount} live plays`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function LiveStickerTrayTile({ sticker, disabled, onAdd }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      title={`Add ${sticker.label}`}
      className="group flex min-h-[5.5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-piu-border/50 bg-piu-card/70 px-2 py-3 transition-colors hover:border-piu-accent/40 hover:bg-piu-dark/70 disabled:opacity-40"
    >
      <img
        src={sticker.image}
        alt={sticker.label}
        loading="lazy"
        decoding="async"
        className="h-11 w-11 object-contain transition-transform group-hover:scale-105"
      />
      <span className="min-h-[2rem] text-center text-[10px] font-display font-semibold leading-tight text-gray-300">
        {sticker.label}
      </span>
    </button>
  );
}

function SongRequestSearchResult({ song, disabled, onSelectChart, showHostScores = false, requestLookup = null, livePlayLookup = null }) {
  return (
    <div className="rounded-lg border border-piu-border/60 bg-piu-card/95 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <div className="flex gap-3">
        {song.jacket_url ? (
          <img
            src={song.jacket_url}
            alt={song.title}
            className="h-14 w-24 rounded border border-piu-border/40 object-cover sm:h-16 sm:w-28"
          />
        ) : (
          <div className="flex h-14 w-24 items-center justify-center rounded border border-piu-border/40 bg-piu-dark text-xs text-gray-500 sm:h-16 sm:w-28">
            No image
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-display font-bold leading-tight text-white">{song.title}</p>
          <p className="truncate text-xs text-gray-400">{song.artist || 'Unknown artist'}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {song.charts.map((chart) => {
          const bestScore = parseInt(chart.best_score, 10) || 0;
          const parsedBestGrade = parseGrade(
            chart.best_grade || '',
            bestScore > 0 ? getRank(bestScore).label : ''
          );
          const displayBestGrade = parsedBestGrade.display || '';
          const requestInfo = requestLookup?.get(buildRequestKey(song.title, chart.mode, chart.level)) || null;
          const livePlayInfo = livePlayLookup?.get(buildRequestKey(song.title, chart.mode, chart.level)) || null;
          const playedCount = parseInt(livePlayInfo?.count, 10) || 0;
          return (
            <div key={`${song.song_group_key}-${chart.chart_id}-${chart.mode}-${chart.level}`} className="relative flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => onSelectChart(chart)}
                disabled={disabled}
                className={`inline-flex h-[42px] min-w-[42px] items-center justify-center rounded-full border px-3 text-sm font-display font-black transition-colors hover:border-piu-accent/50 hover:text-white disabled:opacity-50 ${getRequestChartBadgeTone(chart.mode)}`}
                title={`Request ${song.title} (${modeShort(chart.mode)}${chart.level})`}
              >
                {chart.level}
              </button>
              <span className="absolute -bottom-1 -right-1 rounded-full border border-piu-border bg-piu-dark px-1 text-[9px] font-mono text-piu-accent">
                {modeShort(chart.mode)}
              </span>
              {showHostScores && displayBestGrade ? (
                <span
                  className={`pointer-events-none absolute -right-1 -top-1 rounded-full border border-piu-border bg-piu-dark/95 px-1.5 py-0.5 text-[9px] font-display font-black leading-none ${getGradeColor(displayBestGrade, bestScore)} ${parsedBestGrade.isBroken ? 'grade-broken' : ''}`}
                  data-grade={displayBestGrade}
                >
                  {displayBestGrade}
                </span>
              ) : null}
              {playedCount > 0 ? (
                <span className="pointer-events-none absolute -left-1 -top-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-display font-bold leading-none text-emerald-100">
                  Played
                </span>
              ) : null}
              {(requestInfo?.queuedCount || requestInfo?.openCount) ? (
                <span className="pointer-events-none absolute -left-1 -bottom-1 rounded-full border border-fuchsia-400/25 bg-fuchsia-500/12 px-1.5 py-0.5 text-[9px] font-display font-bold leading-none text-fuchsia-100">
                  {requestInfo?.queuedCount ? 'Queued' : 'Req'}
                </span>
              ) : null}
              {showHostScores && Array.isArray(chart?.performer_scores) && chart.performer_scores.length > 0 ? (
                <ParticipantScorePills performerScores={chart.performer_scores} compact />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function makePresenceId() {
  return `live_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function appendUniqueLiveMessage(messages, message) {
  const current = Array.isArray(messages) ? messages : [];
  if (!message?.id) return current;

  const existingIndex = current.findIndex((row) => row.id === message.id);
  if (existingIndex >= 0) {
    if (current[existingIndex] === message) return current;
    const next = current.slice();
    next[existingIndex] = message;
    return next;
  }

  const next = [...current, message];
  return next.length > 200 ? next.slice(next.length - 200) : next;
}

function removeLiveMessageById(messages, messageId) {
  const current = Array.isArray(messages) ? messages : [];
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) return current;
  const next = current.filter((row) => row?.id !== normalizedMessageId);
  return next.length === current.length ? current : next;
}

function replaceLiveMessageById(messages, message) {
  const current = Array.isArray(messages) ? messages : [];
  if (!message?.id) return current;
  return appendUniqueLiveMessage(current, message);
}

function applyModerationToMessages(messages, targetUserId, moderation) {
  const current = Array.isArray(messages) ? messages : [];
  const normalizedTargetUserId = String(targetUserId || '').trim();
  if (!normalizedTargetUserId) return current;

  let changed = false;
  const next = current.map((row) => {
    if (String(row?.user_id || '') !== normalizedTargetUserId) return row;
    const chatMuted = !!moderation?.chat_muted;
    const requestsBlocked = !!moderation?.requests_blocked;
    if (row.chat_muted === chatMuted && row.requests_blocked === requestsBlocked) return row;
    changed = true;
    return {
      ...row,
      chat_muted: chatMuted,
      requests_blocked: requestsBlocked,
    };
  });

  return changed ? next : current;
}

function applyModerationToRequests(requests, targetUserId, moderation) {
  const current = Array.isArray(requests) ? requests : [];
  const normalizedTargetUserId = String(targetUserId || '').trim();
  if (!normalizedTargetUserId) return current;

  let changed = false;
  const next = current.map((row) => {
    if (String(row?.user_id || '') !== normalizedTargetUserId) return row;
    const chatMuted = !!moderation?.chat_muted;
    const requestsBlocked = !!moderation?.requests_blocked;
    if (row.chat_muted === chatMuted && row.requests_blocked === requestsBlocked) return row;
    changed = true;
    return {
      ...row,
      chat_muted: chatMuted,
      requests_blocked: requestsBlocked,
    };
  });

  return changed ? next : current;
}

function PlayDetailModal({ play, onClose }) {
  if (!play) return null;
  const rank = getRank(play.score ?? 0);
  const displayScore = play.score ?? 0;
  const parsedGrade = parseGrade(play.grade, rank.label);
  const grade = parsedGrade.display || rank.label;
  const overRank = getOverTop100Rank(play.over_top100_rank);
  const plateName = PLATE_NAMES[play.plate] || play.plate || '';
  const plateColor = PLATE_COLORS[play.plate] || 'text-gray-400';
  const hasJudgments = (play.perfect > 0 || play.great > 0 || play.good > 0 || play.bad > 0 || play.miss > 0);
  const judgments = [
    { label: 'PERFECT', value: play.perfect || 0, textColor: 'text-sky-400' },
    { label: 'GREAT', value: play.great || 0, textColor: 'text-green-400' },
    { label: 'GOOD', value: play.good || 0, textColor: 'text-yellow-400' },
    { label: 'BAD', value: play.bad || 0, textColor: 'text-fuchsia-400' },
    { label: 'MISS', value: play.miss || 0, textColor: 'text-gray-400' },
  ];
  const modalBg = play.jacket_url || play.background_url || '';

  return (
    <div className="fixed inset-0 bg-black/80 z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-xl border border-piu-border/60 bg-piu-card/95 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        {modalBg ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-15"
            style={{ backgroundImage: `url(${modalBg})` }}
          />
        ) : null}
        <div className="absolute inset-0 bg-piu-card/90" />

        <div className="relative p-5">
          <button
            type="button"
            className="absolute right-3 top-3 text-xl leading-none text-gray-500 hover:text-white"
            onClick={onClose}
          >
            x
          </button>

          <p className="font-display font-bold text-lg leading-tight pr-6 break-words">{play.song_title || 'Song'}</p>
          {play?.username ? (
            <UserIdentity
              avatar={play.avatar}
              username={play.username}
              skillTitle={play.skill_title}
              isHost={play.participant_role === 'owner'}
              participantRole={play.participant_role}
              className="mt-3"
            />
          ) : null}

          <div className="flex items-center gap-3 mt-4">
            <div className={`flex items-center gap-1 rounded-md border px-2.5 py-1 ${
              play.mode === 'Single' ? 'border-red-500/40 bg-red-500/10' : play.mode === 'Double' ? 'border-green-500/40 bg-green-500/10' : 'border-slate-500/40 bg-white/[0.04]'
            }`}>
              <span className={`font-display text-[10px] font-semibold ${play.mode === 'Single' ? 'text-red-300' : play.mode === 'Double' ? 'text-green-300' : 'text-slate-300'}`}>{play.mode}</span>
              <span className={`font-display text-base font-bold ${play.mode === 'Single' ? 'text-red-200' : play.mode === 'Double' ? 'text-green-200' : 'text-slate-100'}`}>{play.level}</span>
            </div>
            {overRank > 0 ? (
              <span className="rounded-md border border-piu-gold/40 bg-piu-gold/12 px-2 py-0.5 text-[11px] leading-none text-yellow-200">
                TOP #{overRank}
              </span>
            ) : null}
            <div className="text-center flex-1">
              {displayScore > 0 ? (
                <p
                  className={`text-3xl font-display font-black ${getGradeColor(grade, displayScore)} ${parsedGrade.isBroken ? 'grade-broken' : ''}`}
                  data-grade={grade}
                >
                  {grade}
                </p>
              ) : (
                <p className="text-xl font-display font-black text-red-500">STAGE BREAK</p>
              )}
            </div>
          </div>

          {plateName ? (
            <p className={`text-center font-display font-bold text-sm mt-1 ${plateColor}`}>{plateName}</p>
          ) : null}

          {displayScore > 0 ? (
            <p className="text-center font-mono text-2xl font-bold mt-2">{displayScore.toLocaleString()}</p>
          ) : null}

          {hasJudgments ? (
            <div className="grid grid-cols-5 gap-1 text-center mt-5 pt-4 border-t border-piu-border/30">
              {judgments.map((j) => (
                <div key={j.label}>
                  <p className={`text-[10px] font-display font-bold ${j.textColor}`}>{j.label}</p>
                  <p className="font-mono font-bold text-base mt-0.5">{j.value}</p>
                </div>
              ))}
            </div>
          ) : displayScore > 0 ? (
            <p className="text-center text-xs text-gray-600 mt-4 pt-4 border-t border-piu-border/30">
              Judgment breakdown not available
            </p>
          ) : null}

        </div>
      </div>
    </div>
  );
}

function EndSessionConfirmModal({ open, ending, onClose, onConfirm }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-piu-border/60 bg-piu-card/95 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-display font-semibold text-gray-300">Live session</p>
        <h3 className="mt-2 text-2xl font-display font-black text-white">End session and post recap?</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          This will end the live session now, post the Shinsa Live recap automatically, and flush any buffered upscore and clear posts.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onClose} disabled={ending}>
            Keep session open
          </button>
          <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={onConfirm} disabled={ending}>
            {ending ? 'Ending...' : 'End and post recap'}
          </button>
        </div>
      </div>
    </div>
  );
}

function VotePanel({ vote, canVote, onVote }) {
  if (!vote) return null;

  const [nowMs, setNowMs] = useState(Date.now());
  const endsAtMs = vote?.ends_at ? Date.parse(`${vote.ends_at}Z`) : NaN;
  const remainingMs = Number.isFinite(endsAtMs) ? Math.max(0, endsAtMs - nowMs) : 0;
  const winningOption = vote.options.find((option) => option.is_winner) || null;

  useEffect(() => {
    setNowMs(Date.now());
    if (vote.status !== 'active') return undefined;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [vote.id, vote.status, vote.ends_at]);

  return (
    <div className="rounded-lg border border-piu-border/60 bg-piu-card/95 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-display font-semibold text-gray-400">Live vote</p>
          <p className="text-sm font-display font-bold text-white">
            {vote.mode_filter} Lv.{vote.min_level}{vote.max_level !== vote.min_level ? `-${vote.max_level}` : ''}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-1 text-[10px] font-display font-semibold ${vote.status === 'active' ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/35 bg-amber-500/10 text-amber-200'}`}>
          {vote.status === 'active' ? 'Open' : 'Locked'}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        {vote.status === 'active'
          ? `${formatCountdownLabel(remainingMs)} left to vote`
          : winningOption
            ? `${formatPlayLabel(winningOption)} won`
            : 'No ballots were cast'}
      </p>
      <div className="space-y-2 mt-3">
        {vote.options.map((option) => (
          <div key={option.id} className={`rounded-lg border px-3 py-2 ${option.is_winner ? 'border-emerald-500/35 bg-emerald-500/10' : 'border-piu-border/50 bg-piu-dark/60'}`}>
            <div className="flex items-center gap-3">
              <PiuChartJacket title={option.song_title} mode={option.mode} level={option.level} jacketUrl={option.jacket_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold text-white truncate">{option.song_title}</p>
                <p className="text-[11px] text-gray-400">{modeShort(option.mode)}{option.level}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-display font-bold text-cyan-300">{option.vote_count}</p>
                <p className="text-[10px] text-gray-500">votes</p>
              </div>
            </div>
            {vote.status === 'active' && canVote && (
              <button
                type="button"
                onClick={() => onVote(option.id)}
                className={`mt-2 w-full rounded-md border px-3 py-2 text-xs font-display font-semibold transition-colors ${option.user_voted ? 'border-cyan-500/35 bg-cyan-500/12 text-white' : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'}`}
              >
                {option.user_voted ? 'Your vote' : 'Vote for this chart'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatPinnedVoteSummary(vote) {
  if (!vote) return '';

  const optionCount = Array.isArray(vote?.options) ? vote.options.length : 0;
  const winningOption = Array.isArray(vote?.options)
    ? vote.options.find((option) => option?.is_winner) || null
    : null;

  if (vote.status === 'active') {
    return `${optionCount} option${optionCount === 1 ? '' : 's'} live`;
  }

  if (winningOption) {
    return `${formatPlayLabel(winningOption)} won`;
  }

  return optionCount > 0
    ? `${optionCount} option${optionCount === 1 ? '' : 's'} locked`
    : 'Vote locked';
}

function PinnedVoteCard({
  vote,
  canVote,
  onVote,
  collapsed,
  onToggle,
  label,
}) {
  if (!vote) return null;

  return (
    <div className="rounded-lg border border-piu-border/60 bg-piu-card/90 p-2">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[11px] font-display font-semibold text-gray-300">
            {label}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {formatPinnedVoteSummary(vote)}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-md border border-piu-border/60 bg-piu-dark/80 px-2.5 py-1 text-[10px] font-display font-semibold text-gray-300 transition-colors hover:border-piu-accent/50 hover:text-white"
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>
      {!collapsed ? (
        <div className="mt-2">
          <VotePanel vote={vote} canVote={canVote} onVote={onVote} />
        </div>
      ) : null}
    </div>
  );
}

function formatYoutubeBroadcastTimeLabel(broadcast) {
  const actual = broadcast?.actual_start_time ? new Date(broadcast.actual_start_time) : null;
  if (actual && Number.isFinite(actual.getTime())) {
    return `Started ${actual.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
  const scheduled = broadcast?.scheduled_start_time ? new Date(broadcast.scheduled_start_time) : null;
  if (scheduled && Number.isFinite(scheduled.getTime())) {
    return `Scheduled ${scheduled.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
  return 'No start time from YouTube';
}

function getYoutubeBroadcastBadge(broadcast) {
  if (broadcast?.is_live_now) {
    return {
      label: 'Live now',
      className: 'border border-rose-400/30 bg-rose-500/10 text-rose-200',
    };
  }
  if (broadcast?.life_cycle_status === 'ready' || broadcast?.life_cycle_status === 'created') {
    return {
      label: 'Upcoming',
      className: 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
    };
  }
  return {
    label: broadcast?.life_cycle_status || 'Attached',
    className: 'border border-piu-border/60 bg-piu-dark/70 text-gray-300',
  };
}

function YoutubeBroadcastSelector({
  connection,
  broadcasts,
  loading,
  selectedBroadcastId,
  disabled,
  helperText,
  onConnect,
  onRefresh,
  onSelectBroadcast,
}) {
  if (loading && !connection?.linked && !connection?.configured && !connection?.last_error) {
    return (
      <div className="rounded-lg border border-piu-border/60 bg-piu-dark/40 p-3 text-sm text-gray-300">
        Loading YouTube streams...
      </div>
    );
  }

  if (!connection?.configured) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        YouTube OAuth is not configured on this server yet.
      </div>
    );
  }

  if (!connection?.linked) {
    return (
      <div className="rounded-lg border border-piu-border/60 bg-piu-dark/40 p-3">
        <p className="text-sm text-gray-300">
          Link your YouTube channel to pick the active or upcoming stream instead of pasting a URL manually.
        </p>
        <button
          type="button"
          onClick={onConnect}
          className="btn-primary mt-3 w-full sm:w-auto"
          disabled={disabled}
        >
          Connect YouTube
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-piu-border/60 bg-piu-dark/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {connection.channel_thumbnail_url ? (
            <img
              src={connection.channel_thumbnail_url}
              alt={connection.channel_title || 'YouTube channel'}
              className="h-10 w-10 rounded-full border border-piu-border/50 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-piu-border/50 bg-piu-card text-[10px] font-display font-bold text-red-200">
              YT
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-display font-semibold text-gray-400">Linked YouTube channel</p>
            <p className="truncate text-sm font-display font-bold text-white">
              {connection.channel_title || 'Unnamed channel'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const maybePromise = onRefresh?.();
            if (maybePromise?.catch) maybePromise.catch(() => {});
          }}
          className="rounded-md border border-piu-border/60 bg-piu-card/70 px-3 py-1.5 text-[11px] font-display font-semibold text-gray-300 hover:border-piu-accent/50 hover:text-white disabled:opacity-60"
          disabled={disabled || loading}
        >
          {loading ? 'Refreshing...' : 'Refresh streams'}
        </button>
      </div>

      {connection.last_error ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
          Last YouTube error: {connection.last_error}
        </div>
      ) : null}

      {helperText ? <p className="text-[11px] text-gray-400">{helperText}</p> : null}

      <button
        type="button"
        onClick={() => onSelectBroadcast('')}
        className={`rounded-md border px-3 py-1.5 text-[11px] font-display font-semibold transition-colors ${
          !selectedBroadcastId
            ? 'border-piu-accent/50 bg-piu-accent/10 text-white'
            : 'border-piu-border/60 bg-piu-card/70 text-gray-300 hover:border-piu-accent/50 hover:text-white'
        }`}
        disabled={disabled}
      >
        Manual URL only
      </button>

      {broadcasts.length === 0 ? (
        <div className="rounded-md border border-piu-border/60 bg-piu-card/60 px-3 py-3 text-sm text-gray-300">
          No active or upcoming broadcasts were returned for this channel.
        </div>
      ) : (
        <div className="space-y-2">
          {broadcasts.map((broadcast) => {
            const selected = selectedBroadcastId === broadcast.id;
            const badge = getYoutubeBroadcastBadge(broadcast);
            return (
              <button
                key={broadcast.id}
                type="button"
                onClick={() => onSelectBroadcast(selected ? '' : broadcast.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? 'border-piu-accent/50 bg-piu-accent/10'
                    : 'border-piu-border/60 bg-piu-card/60 hover:border-piu-accent/40'
                }`}
                disabled={disabled}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-display font-bold text-white">
                      {broadcast.title || 'Untitled stream'}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {formatYoutubeBroadcastTimeLabel(broadcast)}
                    </p>
                  </div>
                  <span className={`rounded-md px-2.5 py-1 text-[10px] font-display font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateSessionCard({
  title,
  streamUrl,
  youtubeConnection,
  youtubeBroadcasts,
  youtubeLoading,
  selectedBroadcastId,
  statusText,
  creating,
  onConnectYoutube,
  onRefreshYoutube,
  onSelectBroadcast,
  onTitleChange,
  onStreamUrlChange,
  onStatusTextChange,
  onSubmit,
}) {
  return (
    <div className="max-w-xl rounded-xl border border-piu-border bg-piu-card p-5 shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
      <p className="text-sm font-display font-semibold text-gray-300">Live session</p>
      <h1 className="text-2xl font-display font-black text-white mt-1">Start a live session</h1>
      <p className="text-sm text-gray-400 mt-2">
        This opens a session lobby with live score polling, viewer chat, requests, votes, and an automatic recap post when you end it.
      </p>
      <div className="space-y-3 mt-4">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="input-field w-full"
          placeholder="Session title"
          maxLength={120}
        />
        <YoutubeBroadcastSelector
          connection={youtubeConnection}
          broadcasts={youtubeBroadcasts}
          loading={youtubeLoading}
          selectedBroadcastId={selectedBroadcastId}
          disabled={creating}
          helperText="Choose the live or upcoming YouTube broadcast you started in OBS, or leave it on manual URL mode."
          onConnect={onConnectYoutube}
          onRefresh={onRefreshYoutube}
          onSelectBroadcast={onSelectBroadcast}
        />
        <input
          value={streamUrl}
          onChange={(e) => onStreamUrlChange(e.target.value)}
          className="input-field w-full"
          placeholder="YouTube stream URL fallback (optional)"
          maxLength={400}
        />
        <input
          value={statusText}
          onChange={(e) => onStatusTextChange(e.target.value)}
          className="input-field w-full"
          placeholder="Current status (optional)"
          maxLength={160}
        />
      </div>
      <button type="button" onClick={onSubmit} disabled={creating} className="btn-primary mt-4 w-full py-2.5">
        {creating ? 'Starting...' : 'Launch Shinsa Live'}
      </button>
    </div>
  );
}

function StreamUrlEditorCard({
  streamUrl,
  youtubeConnection,
  youtubeBroadcasts,
  youtubeLoading,
  selectedBroadcastId,
  saving,
  attached,
  recognized,
  onConnectYoutube,
  onChange,
  onRefreshYoutube,
  onSelectBroadcast,
  onSubmit,
}) {
  return (
    <div className="mt-4 rounded-lg border border-piu-border/60 bg-piu-card/95 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-display font-semibold text-gray-400">Stream link</p>
          <p className="mt-2 text-sm text-gray-300">
            Attach or replace your YouTube live URL without ending the session.
          </p>
        </div>
        <span className={`rounded-md border px-3 py-1 text-[11px] font-display font-semibold ${
          attached
            ? recognized
              ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border border-amber-400/30 bg-amber-500/10 text-amber-200'
            : 'border border-piu-border bg-black/20 text-gray-400'
        }`}>
          {attached ? (recognized ? 'Video ready' : 'Link saved') : 'No link attached'}
        </span>
      </div>
      <div className="mt-4">
        <YoutubeBroadcastSelector
          connection={youtubeConnection}
          broadcasts={youtubeBroadcasts}
          loading={youtubeLoading}
          selectedBroadcastId={selectedBroadcastId}
          disabled={saving}
          helperText="Attach a broadcast from your linked channel, or leave the session on a pasted manual URL."
          onConnect={onConnectYoutube}
          onRefresh={onRefreshYoutube}
          onSelectBroadcast={onSelectBroadcast}
        />
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={streamUrl}
          onChange={(e) => onChange(e.target.value)}
          className="input-field w-full"
          placeholder="YouTube stream URL fallback"
          maxLength={400}
        />
        <button type="button" onClick={onSubmit} disabled={saving} className="btn-primary px-4 py-2.5 sm:w-auto">
          {saving ? 'Saving...' : attached ? 'Update link' : 'Attach link'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Leave it blank and save if you want to remove the current link.
      </p>
      {attached && !recognized ? (
        <p className="mt-2 text-[11px] text-amber-200">
          The link is attached to the room, but Shinsa could not turn it into an embedded YouTube player yet.
        </p>
      ) : null}
    </div>
  );
}

function YoutubeTimestampsCard({
  data,
  loading,
  publishing,
  copiedLabel,
  onRefresh,
  onCopy,
  onPublish,
}) {
  const sourceLabel = formatYoutubeChapterSourceLabel(data?.source_start_kind);
  const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
  const syncedSongChapters = chapters.filter((chapter) => String(chapter?.song_title || '').trim());

  return (
    <div className="overflow-hidden rounded-xl border border-piu-border/60 bg-piu-card/95 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <div className="border-b border-piu-border/50 bg-piu-dark/55 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-display font-semibold text-gray-400">YouTube chapters</p>
            <p className="mt-1 text-sm text-gray-300">
              Review the generated chapter run, then copy or publish it to the linked video.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRefresh} disabled={loading || publishing} className="btn-secondary px-3 py-2 text-xs">
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" onClick={onCopy} disabled={!data?.text || loading || publishing} className="btn-secondary px-3 py-2 text-xs">
              {copiedLabel || 'Copy text'}
            </button>
            <button type="button" onClick={onPublish} disabled={!data?.text || loading || publishing} className="btn-primary px-3 py-2 text-xs">
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {data ? (
          <>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-piu-border/60 bg-piu-dark/70 px-3 py-1 text-[11px] text-gray-300">
                Video: <span className="font-display font-semibold text-white">{data.video_title || data.video_id || 'Linked video'}</span>
              </span>
              <span className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100">
                {data.matched_count || 0} synced chapter{(data.matched_count || 0) === 1 ? '' : 's'}
              </span>
              <span className="rounded-md border border-piu-border/60 bg-piu-dark/70 px-3 py-1 text-[11px] text-gray-300">
                Start source: <span className="font-display font-semibold text-white">{sourceLabel}</span>
              </span>
            </div>

            {data.missing_duration_count > 0 ? (
              <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {data.missing_duration_count} play{data.missing_duration_count === 1 ? '' : 's'} skipped because SHINSA could not find a song duration.
              </p>
            ) : null}
            {data.skipped_negative_offset_count > 0 ? (
              <p className="mt-2 rounded-lg border border-piu-border/50 bg-piu-dark/50 px-3 py-2 text-xs text-gray-400">
                {data.skipped_negative_offset_count} early play{data.skipped_negative_offset_count === 1 ? '' : 's'} landed before the detected stream start and were nudged forward.
              </p>
            ) : null}
            {data.skipped_non_clear_count > 0 ? (
              <p className="mt-2 rounded-lg border border-piu-border/50 bg-piu-dark/50 px-3 py-2 text-xs text-gray-400">
                {data.skipped_non_clear_count} non-clear attempt{data.skipped_non_clear_count === 1 ? '' : 's'} ignored because chapter timing only uses passed songs.
              </p>
            ) : null}

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(19rem,0.82fr)]">
              <div className="overflow-hidden rounded-lg border border-piu-border/60 bg-piu-dark/45">
                <div className="flex items-center justify-between gap-3 border-b border-piu-border/50 px-3 py-2">
                  <div>
                    <p className="text-[11px] font-display font-semibold text-gray-400">Chapter run</p>
                    <p className="text-xs text-gray-500">{syncedSongChapters.length} song chapter{syncedSongChapters.length === 1 ? '' : 's'} plus stream start</p>
                  </div>
                </div>
                <div className="max-h-[28rem] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
                  {chapters.map((chapter, index) => {
                    const isStreamStart = !String(chapter?.song_title || '').trim();
                    const parsedGrade = parseGrade(chapter?.grade, (parseInt(chapter?.score, 10) || 0) > 0 ? getRank(chapter.score).label : '');
                    const displayGrade = parsedGrade.display || '';
                    const gradeColor = getGradeColor(displayGrade, chapter?.score);
                    return (
                      <div
                        key={`${chapter?.offset_label || index}-${chapter?.song_title || 'stream'}`}
                        className="border-b border-piu-border/40 px-3 py-3 last:border-b-0"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 shrink-0 rounded-md border border-piu-border/60 bg-piu-card/80 px-2 py-1 font-mono text-[11px] text-cyan-100">
                            {chapter?.offset_label || '0:00'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="min-w-0 truncate text-sm font-display font-bold text-white">
                                {formatYoutubeChapterTitle(chapter)}
                              </p>
                              {!isStreamStart && displayGrade ? (
                                <span className={`rounded-md border border-piu-border/50 bg-piu-card/75 px-2 py-0.5 text-[10px] font-display font-semibold ${gradeColor}`}>
                                  {displayGrade}
                                </span>
                              ) : null}
                              {!isStreamStart && (parseInt(chapter?.score, 10) || 0) > 0 ? (
                                <span className="rounded-md border border-piu-border/50 bg-piu-card/75 px-2 py-0.5 font-mono text-[10px] text-gray-200">
                                  {formatNumber(chapter.score)}
                                </span>
                              ) : null}
                            </div>
                            {chapter?.started_at_utc ? (
                              <p className="mt-1 text-[11px] text-gray-500">
                                Starts at {new Date(chapter.started_at_utc).toLocaleTimeString([], {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-piu-border/60 bg-piu-dark/45 p-3">
                  <p className="text-[11px] font-display font-semibold text-gray-400">Publish preview</p>
                  <textarea
                    className="input-field mt-3 min-h-[12rem] w-full resize-y font-mono text-xs leading-6"
                    value={data.text || ''}
                    readOnly
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            Attach a YouTube stream and sync at least one play to generate chapters.
          </p>
        )}
      </div>
    </div>
  );
}

function DirectorySection({ title, subtitle, sessions }) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-base font-display font-semibold text-white">{title}</p>
          {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {sessions.map((item) => (
          <LiveDirectoryCard key={item?.session?.id || item?.session?.host_user_id || 'live-directory'} item={item} />
        ))}
      </div>
    </section>
  );
}

function MobilePanelSheet({ open, title, subtitle = '', onClose, children, allowDesktop = false }) {
  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-[95] ${allowDesktop ? '' : 'lg:hidden'}`}>
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close panel"
      />
      <div className={`absolute overflow-hidden border border-piu-border/60 bg-piu-card/95 ${
        allowDesktop
          ? 'inset-x-0 bottom-0 max-h-[86vh] rounded-t-xl shadow-[0_-8px_24px_rgba(0,0,0,0.28)] lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[min(92vw,64rem)] lg:max-h-[86vh] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl lg:shadow-[0_8px_24px_rgba(0,0,0,0.28)]'
          : 'inset-x-0 bottom-0 max-h-[86vh] rounded-t-xl shadow-[0_-8px_24px_rgba(0,0,0,0.28)]'
      }`}>
        <div className="flex items-center justify-between gap-3 border-b border-piu-border/60 px-4 py-3">
          <div>
            <p className="text-sm font-display font-semibold text-white">{title}</p>
            {subtitle ? <p className="mt-1 text-xs text-gray-400">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-2 text-xs">
            Close
          </button>
        </div>
        <div className="max-h-[calc(86vh-74px)] overflow-y-auto px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function UserIdentity({ avatar, username, skillTitle, isHost, participantRole = '', className = '', compact = false, dense = false }) {
  const roleLabel = isHost ? 'Host' : getParticipantRoleLabel(participantRole);
  const roleTone = roleLabel === 'Host'
    ? 'border-rose-400/25 bg-rose-500/10 text-rose-200'
    : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100';
  return (
    <div className={`flex min-w-0 items-center ${compact || dense ? 'gap-1.5' : 'gap-2'} ${className}`.trim()}>
      <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-piu-border bg-piu-dark font-display font-bold text-white ${
        compact ? 'h-7 w-7 text-[10px]' : dense ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-[11px]'
      }`}>
        {avatar ? (
          <img src={avatar} alt={username || 'User'} className="h-full w-full object-cover" />
        ) : (
          <span>{getInitial(username)}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className={`flex flex-wrap items-center ${compact || dense ? 'gap-1' : 'gap-1.5'}`}>
          <p className={`truncate font-display font-bold text-white ${compact ? 'text-[10px]' : dense ? 'text-[10px]' : 'text-[11px]'}`}>{username || 'Viewer'}</p>
          {roleLabel ? (
            <span className={`rounded-md border font-display font-semibold ${roleTone} ${
              compact ? 'px-1.5 py-0.5 text-[8px]' : dense ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'
            }`}>
              {roleLabel}
            </span>
          ) : null}
          {skillTitle ? (
            <span className={`rounded-md border border-cyan-400/20 bg-cyan-500/10 font-display font-semibold text-cyan-200 ${
              compact ? 'px-1.5 py-0.5 text-[8px]' : dense ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'
            }`}>
              {skillTitle}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CohostParticipantList({ participants, actionUserId, onRemove, compact = false }) {
  const rows = Array.isArray(participants) ? participants : [];
  if (rows.length === 0) return null;

  return (
    <div className={compact ? 'space-y-2' : 'flex flex-wrap gap-2'}>
      {rows.map((participant) => (
        <div
          key={participant.user_id}
          className={`flex items-center justify-between gap-2 rounded-lg border border-piu-border/60 bg-piu-card/70 ${
            compact ? 'px-3 py-2' : 'px-2.5 py-2'
          }`}
        >
          <UserIdentity
            avatar={participant.avatar}
            username={participant.username}
            skillTitle={participant.skill_title}
            isHost={false}
            participantRole={participant.role}
            compact
          />
          <button
            type="button"
            onClick={() => onRemove(participant)}
            disabled={actionUserId === participant.user_id}
            className={`rounded-md border border-piu-border/60 bg-piu-dark/80 font-display font-semibold text-gray-300 transition-colors hover:border-piu-accent/50 hover:text-white disabled:opacity-60 ${
              compact ? 'px-2.5 py-1 text-[10px]' : 'px-2 py-1 text-[10px]'
            }`}
          >
            {actionUserId === participant.user_id ? 'Removing...' : 'Remove'}
          </button>
        </div>
      ))}
    </div>
  );
}

function CohostSearchResults({ results, actionUserId, onAdd, compact = false }) {
  const rows = Array.isArray(results) ? results.slice(0, 6) : [];
  if (rows.length === 0) return null;

  return (
    <div className={compact ? 'space-y-2' : 'mt-3 space-y-2'}>
      {rows.map((targetUser) => (
        <div
          key={targetUser.id}
          className={`flex items-center justify-between gap-3 rounded-lg border border-piu-border/60 bg-piu-card/70 ${
            compact ? 'px-2.5 py-2' : 'px-3 py-2'
          }`}
        >
          <UserIdentity
            avatar={targetUser.avatar}
            username={targetUser.username}
            skillTitle={targetUser.skill_title}
            isHost={false}
          />
          <button
            type="button"
            onClick={() => onAdd(targetUser)}
            disabled={actionUserId === targetUser.id}
            className={`btn-secondary ${compact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-1.5 text-[11px]'}`}
          >
            {actionUserId === targetUser.id ? 'Adding...' : 'Add co-host'}
          </button>
        </div>
      ))}
    </div>
  );
}

function NowPlayingPanel({ play, requestInfo, live, onOpen, compact = false, showPerformer = false }) {
  const requestStatus = requestInfo
    ? (requestInfo.queuedCount > 0
      ? 'queued'
      : requestInfo.openCount > 0
        ? 'open'
        : requestInfo.playedCount > 0
          ? 'played'
          : 'skipped')
    : '';
  const requestPillClass = requestStatus ? getRequestStatusMeta(requestStatus).pill : '';
  const requestLabel = compact ? formatCompactRequestStateLabel(requestInfo) : formatRequestStateLabel(requestInfo);

  return (
    <div className={`flex h-full flex-col rounded-xl border border-piu-border/60 bg-piu-card/95 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.18)] ${compact ? 'min-h-0' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-display font-semibold text-gray-400">Latest play</p>
          {!play ? (
            <p className="mt-1 text-sm text-gray-400">
              {live?.status === 'live'
                ? 'Waiting for the first chart to land.'
                : 'Live wrapped.'}
            </p>
          ) : null}
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-md border ${compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-1 text-[10px]'} font-display font-semibold ${live?.status === 'live' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-piu-border/60 bg-piu-dark/60 text-gray-400'}`}>
          {live?.status === 'live' ? 'Live sync' : 'Session ended'}
        </span>
      </div>

      {play ? (
        <div className={`${compact ? 'mt-2 flex flex-1 flex-col' : 'mt-4 flex flex-col'}`}>
          <p className={`truncate font-display font-black text-white ${compact ? 'text-base leading-tight' : 'text-lg'}`}>{play.song_title}</p>
          {showPerformer && play?.username ? (
            <UserIdentity
              avatar={play.avatar}
              username={play.username}
              skillTitle={play.skill_title}
              isHost={play.participant_role === 'owner'}
              participantRole={play.participant_role}
              className="mt-2"
              compact={compact}
            />
          ) : null}
          {compact ? (
            <div className="mt-2 flex flex-1 flex-col">
              <div className="flex items-start gap-2">
                <button type="button" onClick={onOpen} className="shrink-0 text-left">
                  <PiuChartJacket title={play.song_title} mode={play.mode} level={play.level} jacketUrl={play.background_url} size="xs" />
                </button>
                <div className="min-w-0 flex flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                  <button
                    type="button"
                    onClick={onOpen}
                    className="flex shrink-0 items-center gap-1.5 text-left transition-colors hover:text-white"
                  >
                    <span className={`font-display font-black text-xl leading-none ${getGradeColor(play.grade || '-', play.score || 0)}`}>
                      {play.grade || '-'}
                    </span>
                    <span className="font-display text-sm font-bold leading-none text-cyan-100/90">
                      {formatNumber(play.score)}
                    </span>
                  </button>
                  {requestInfo ? (
                    <span className={`min-w-0 shrink rounded-md px-2 py-0.5 text-[9px] font-display font-semibold ${requestPillClass}`}>
                      {requestLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {play.pumbility_gain > 0 ? (
                  <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-display font-semibold text-emerald-200">
                    +{play.pumbility_gain} pumbility
                  </span>
                ) : null}
                {play.over_top100_rank > 0 ? (
                  <span className="rounded-md border border-yellow-400/30 bg-yellow-500/10 px-2.5 py-0.5 text-[10px] font-display font-semibold text-yellow-200">
                    OVER Top 100 #{play.over_top100_rank}
                  </span>
                ) : null}
                {play.session_result_type ? (
                  <span className="rounded-md border border-piu-border/60 bg-piu-dark/60 px-2.5 py-0.5 text-[10px] text-gray-300 capitalize">
                    {play.session_result_type}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={onOpen} className="shrink-0 text-left">
                <PiuChartJacket title={play.song_title} mode={play.mode} level={play.level} jacketUrl={play.background_url} size="md" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <button
                    type="button"
                    onClick={onOpen}
                    className="flex min-w-0 items-baseline gap-2 text-left transition-colors hover:text-white"
                  >
                    <span className={`font-display font-black text-2xl ${getGradeColor(play.grade || '-', play.score || 0)}`}>
                      {play.grade || '-'}
                    </span>
                    <span className="text-base font-display font-bold text-cyan-100/90">{formatNumber(play.score)}</span>
                  </button>
                  {requestInfo ? (
                    <span className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-[11px] font-display font-semibold ${requestPillClass}`}>
                      {requestLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {play.pumbility_gain > 0 ? (
                    <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-display font-semibold text-emerald-200">
                      +{play.pumbility_gain} pumbility
                    </span>
                  ) : null}
                  {play.over_top100_rank > 0 ? (
                    <span className="rounded-md border border-yellow-400/30 bg-yellow-500/10 px-3 py-1 text-[11px] font-display font-semibold text-yellow-200">
                      OVER Top 100 #{play.over_top100_rank}
                    </span>
                  ) : null}
                  {play.session_result_type ? (
                    <span className="rounded-md border border-piu-border/60 bg-piu-dark/60 px-3 py-1 text-[11px] text-gray-300 capitalize">
                      {play.session_result_type}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )}
          {play.machine_name ? (
            <p className={`text-right text-gray-400 ${compact ? 'mt-auto pt-1 text-[10px]' : 'mt-2 text-sm'}`}>at {play.machine_name}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-1 items-center">
          <p className={`${compact ? 'text-sm' : 'text-base'} text-gray-400`}>
            No song played.
          </p>
        </div>
      )}
    </div>
  );
}

function OverlayStudioCard({
  previewUrl,
  preset,
  theme,
  fit,
  anchor,
  widgets,
  motionEnabled,
  brandMotionEnabled,
  opacity,
  guidesEnabled,
  autoHide,
  copying,
  copiedLabel,
  tokenExpiresAt,
  onPresetChange,
  onThemeChange,
  onFitChange,
  onAnchorChange,
  onAutoHideChange,
  onToggleGuides,
  onToggleWidget,
  onToggleMotion,
  onToggleBrandMotion,
  onOpacityChange,
  onApplyScene,
  onPreview,
  onCopyBrowserSource,
  onCopyScene,
}) {
  const presetLabel = LIVE_OVERLAY_PRESETS.find((item) => item.id === preset)?.label || preset;
  const themeLabel = LIVE_OVERLAY_THEMES.find((item) => item.id === theme)?.label || theme;
  const fitLabel = LIVE_OVERLAY_FITS.find((item) => item.id === fit)?.label || fit;
  const anchorLabel = LIVE_OVERLAY_ANCHORS.find((item) => item.id === anchor)?.label || anchor;
  const autoHideLabel = LIVE_OVERLAY_AUTO_HIDE_MODES.find((item) => item.id === autoHide)?.label || autoHide;
  const outputSpec = getLiveOverlayOutputSpec({ preset, fit });
  const themeToneById = {
    arena: {
      active: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-50',
      strip: 'from-cyan-300 via-fuchsia-400 to-rose-400',
    },
    skyline: {
      active: 'border-sky-400/35 bg-sky-500/10 text-sky-50',
      strip: 'from-sky-300 via-blue-400 to-cyan-300',
    },
    ember: {
      active: 'border-orange-400/35 bg-orange-500/10 text-orange-50',
      strip: 'from-amber-300 via-orange-400 to-rose-400',
    },
    transparent: {
      active: 'border-slate-300/30 bg-slate-500/10 text-slate-100',
      strip: 'from-slate-200/70 via-slate-400/35 to-cyan-300/55',
    },
  };
  const studioShellClass = 'rounded-3xl border border-piu-border/70 bg-[radial-gradient(circle_at_top_left,rgba(255,51,102,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(68,136,255,0.16),transparent_36%),linear-gradient(180deg,#0d1322,#09101b)] p-4 shadow-[0_24px_60px_rgba(6,10,22,0.45)] sm:p-5';
  const panelClass = 'rounded-2xl border border-piu-border/70 bg-[linear-gradient(180deg,rgba(11,16,29,0.95),rgba(8,12,24,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';
  const insetClass = 'rounded-2xl border border-piu-border/70 bg-black/20';
  const inactiveTileClass = 'border-piu-border/70 bg-black/20 text-gray-300 hover:border-cyan-400/30 hover:text-cyan-100';
  const inactiveChipClass = 'border-piu-border/70 bg-[#121a2b] text-gray-300 hover:border-cyan-400/30 hover:text-cyan-100';

  return (
    <div className={studioShellClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[10px] font-display font-black uppercase tracking-[0.28em] text-rose-300">Overlay Studio</p>
          <h2 className="mt-2 text-xl font-display font-black text-cyan-50">Browser-source layouts for stream scenes</h2>
          <p className="mt-2 text-sm text-slate-300">
            Use this once to set up OBS or Streamlabs, then return to the live room tab.
            The overlay reads the same Shinsa Live stream, so scores, chat, votes, and reactions update in real time.
          </p>
          <div className="mt-4 rounded-2xl border border-piu-border/70 bg-[radial-gradient(circle_at_top_left,rgba(255,51,102,0.12),transparent_38%),linear-gradient(180deg,rgba(13,18,31,0.96),rgba(9,13,24,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-amber-200">How to use it</p>
            <ol className="mt-3 space-y-2 text-sm text-slate-300">
              <li>1. Pick a quick scene or preset that matches the stream layout you want.</li>
              <li>2. Click `Preview overlay` to see the transparent browser-source page.</li>
              <li>3. Click `Copy browser source URL`, then paste it into an OBS `Browser Source`.</li>
              <li>4. Set the OBS browser source to the recommended size shown here, then position it in scene.</li>
            </ol>
            <p className="mt-3 text-[11px] text-cyan-200/90">
              Use `Transparent Rail` when you want chat or status cards to float over gameplay without a dark slab behind them.
            </p>
          </div>
        </div>

        <div className="min-w-[240px] rounded-2xl border border-piu-border/70 bg-[radial-gradient(circle_at_top_right,rgba(68,136,255,0.16),transparent_36%),linear-gradient(180deg,rgba(12,18,34,0.96),rgba(8,12,24,0.99))] p-4 shadow-[0_18px_36px_rgba(8,14,28,0.34)]">
          <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-cyan-200">Current output</p>
          <p className="mt-2 text-base font-display font-black text-cyan-50">{presetLabel}</p>
          <p className="mt-1 text-[11px] text-fuchsia-200/85">{themeLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-amber-100">{fitLabel}</span>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-cyan-100">{anchorLabel}</span>
            <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-rose-100">{autoHideLabel}</span>
            <span className="rounded-full border border-slate-300/25 bg-slate-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-slate-100">{opacity}% opacity</span>
            {guidesEnabled ? (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-amber-100">
                Guides on
              </span>
            ) : null}
          </div>
          <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/8 px-3 py-3">
            <p className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-cyan-200">OBS start size</p>
            <p className="mt-1 text-lg font-display font-black text-cyan-50">{outputSpec.sourceLabel}</p>
            <p className="mt-1 text-[11px] text-cyan-100/80">Card frame: {outputSpec.frameLabel}</p>
          </div>
          <p className="mt-3 truncate rounded-2xl border border-piu-border/70 bg-black/25 px-3 py-2.5 text-[11px] text-cyan-100">
            {previewUrl}
          </p>
          {copiedLabel ? <p className="mt-2 text-xs text-emerald-200">{copiedLabel}</p> : null}
          {tokenExpiresAt ? <p className="mt-2 text-[11px] text-slate-400">Overlay access valid until {new Date(tokenExpiresAt).toLocaleString()}</p> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-gray-500">Quick scenes</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LIVE_OVERLAY_SCENES.map((scene) => {
                const sceneOutputSpec = getLiveOverlayOutputSpec({ sceneId: scene.id });
                return (
                  <div key={scene.id} className={`${panelClass} overflow-hidden px-4 py-3`}>
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-400/80 via-fuchsia-400/70 to-rose-400/80" />
                    <p className="mt-3 text-sm font-display font-bold text-cyan-50">{scene.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{scene.description}</p>
                    <div className="mt-3 rounded-2xl border border-piu-border/70 bg-black/20 px-3 py-2.5">
                      <p className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-cyan-200">OBS start size</p>
                      <p className="mt-1 text-sm font-display font-black text-cyan-50">{sceneOutputSpec.sourceLabel}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Card frame: {sceneOutputSpec.frameLabel}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => onApplyScene(scene.id)} className="btn-secondary px-3 py-2 text-[11px]">
                        Load
                      </button>
                      <button type="button" onClick={() => onCopyScene(scene.id)} disabled={copying} className="btn-primary px-3 py-2 text-[11px]">
                        {copying ? 'Preparing...' : 'Copy'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-gray-500">Preset</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LIVE_OVERLAY_PRESETS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onPresetChange(option.id)}
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                    option.id === preset
                      ? 'border-fuchsia-400/35 bg-fuchsia-500/12 text-rose-50'
                      : inactiveTileClass
                  }`}
                >
                  <p className="text-sm font-display font-bold">{option.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-gray-500">Fit</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LIVE_OVERLAY_FITS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onFitChange(option.id)}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-display font-bold transition-colors ${
                    option.id === fit
                      ? 'border-amber-400/35 bg-amber-500/12 text-amber-100'
                      : inactiveChipClass
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {LIVE_OVERLAY_FITS.find((item) => item.id === fit)?.description || ''}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-gray-500">Position</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LIVE_OVERLAY_ANCHORS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onAnchorChange(option.id)}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-display font-bold transition-colors ${
                    option.id === anchor
                      ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100'
                      : inactiveChipClass
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-gray-500">Widgets</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LIVE_OVERLAY_WIDGETS.map((widget) => {
                const active = widgets.includes(widget.id);
                return (
                  <button
                    key={widget.id}
                    type="button"
                    onClick={() => onToggleWidget(widget.id)}
                    className={`rounded-xl border px-3 py-2 text-[11px] font-display font-bold transition-colors ${
                      active
                        ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100'
                        : inactiveChipClass
                    }`}
                  >
                    {widget.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-gray-500">Theme</p>
            <div className="mt-2 grid gap-2">
              {LIVE_OVERLAY_THEMES.map((option) => {
                const tone = themeToneById[option.id] || themeToneById.arena;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onThemeChange(option.id)}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      option.id === theme
                        ? tone.active
                        : inactiveTileClass
                    }`}
                  >
                    <div className={`h-1.5 rounded-full bg-gradient-to-r ${tone.strip}`} />
                    <p className="mt-3 text-sm font-display font-bold">{option.label}</p>
                    {option.id === 'transparent' ? (
                      <p className="mt-1 text-xs text-slate-400">Minimal chrome for browser sources that should sit directly over gameplay.</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`${panelClass} p-4`}>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-rose-200">Visibility</p>
            <div className="mt-3 grid gap-2">
              {LIVE_OVERLAY_AUTO_HIDE_MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onAutoHideChange(option.id)}
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                    option.id === autoHide
                      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-50'
                      : inactiveChipClass
                  }`}
                >
                  <p className="text-sm font-display font-bold">{option.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{option.description}</p>
                </button>
              ))}
            </div>

            <div className={`mt-4 flex items-center justify-between gap-3 ${insetClass} px-4 py-3`}>
              <div>
                <p className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-amber-200">Safe-zone guides</p>
                <p className="mt-1 text-sm text-slate-300">Useful while placing the browser source. Turn them off before going live.</p>
              </div>
              <button
                type="button"
                onClick={onToggleGuides}
                className={`rounded-xl border px-3 py-2 text-[11px] font-display font-bold ${
                  guidesEnabled
                    ? 'border-amber-400/35 bg-amber-500/12 text-amber-100'
                    : 'border-piu-border/70 bg-black/15 text-gray-300'
                }`}
              >
                {guidesEnabled ? 'Guides on' : 'Guides off'}
              </button>
            </div>
          </div>

          <div className={`${panelClass} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-cyan-200">Motion</p>
                <p className="mt-1 text-sm text-slate-300">Toggle emote bursts and animated reaction flourishes.</p>
              </div>
              <button
                type="button"
                onClick={onToggleMotion}
                className={`rounded-xl border px-3 py-2 text-[11px] font-display font-bold ${
                  motionEnabled
                    ? 'border-emerald-400/35 bg-emerald-500/12 text-emerald-100'
                    : 'border-piu-border/70 bg-black/20 text-gray-300'
                }`}
              >
                {motionEnabled ? 'Motion on' : 'Motion off'}
              </button>
            </div>

            <div className={`mt-4 flex items-center justify-between gap-3 ${insetClass} px-4 py-3`}>
              <div>
                <p className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-fuchsia-200">Brand motion</p>
                <p className="mt-1 text-sm text-slate-300">Animate the `SHINSA LIVE` label with pulse and sparkle motion.</p>
              </div>
              <button
                type="button"
                onClick={onToggleBrandMotion}
                className={`rounded-xl border px-3 py-2 text-[11px] font-display font-bold ${
                  brandMotionEnabled
                    ? 'border-emerald-400/35 bg-emerald-500/12 text-emerald-100'
                    : 'border-piu-border/70 bg-black/20 text-gray-300'
                }`}
              >
                {brandMotionEnabled ? 'Brand on' : 'Brand off'}
              </button>
            </div>

            <div className={`mt-4 ${insetClass} px-4 py-3`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-cyan-200">Opacity</p>
                  <p className="mt-1 text-sm text-slate-300">Control how transparent the browser source appears over gameplay.</p>
                </div>
                <span className="rounded-xl border border-piu-border/70 bg-black/20 px-3 py-2 text-[11px] font-display font-bold text-cyan-100">
                  {opacity}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={opacity}
                onChange={(e) => onOpacityChange(e.target.value)}
                className="mt-3 w-full accent-cyan-400"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={onPreview} className="btn-secondary px-4 py-2 text-xs">
                Preview overlay
              </button>
              <button type="button" onClick={onCopyBrowserSource} disabled={copying} className="btn-primary px-4 py-2 text-xs">
                {copying ? 'Preparing...' : 'Copy browser source URL'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LivePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [directorySessions, setDirectorySessions] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createStreamUrl, setCreateStreamUrl] = useState('');
  const [createYoutubeBroadcastId, setCreateYoutubeBroadcastId] = useState('');
  const [createStatusText, setCreateStatusText] = useState('');
  const [editStreamUrl, setEditStreamUrl] = useState('');
  const [editYoutubeBroadcastId, setEditYoutubeBroadcastId] = useState('');
  const [editStatusText, setEditStatusText] = useState('');
  const [youtubeConnection, setYoutubeConnection] = useState({
    configured: true,
    linked: false,
    channel_title: '',
    channel_thumbnail_url: '',
    last_error: '',
  });
  const [youtubeBroadcasts, setYoutubeBroadcasts] = useState([]);
  const [youtubeStatusLoading, setYoutubeStatusLoading] = useState(true);
  const [youtubeBroadcastsLoading, setYoutubeBroadcastsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingStreamUrl, setSavingStreamUrl] = useState(false);
  const [savingStatusText, setSavingStatusText] = useState(false);
  const [savingRequestsEnabled, setSavingRequestsEnabled] = useState(false);
  const [savingRequestPolicy, setSavingRequestPolicy] = useState(false);
  const [lockVideo, setLockVideo] = useState(false);
  const [mobileVideoDocked, setMobileVideoDocked] = useState(false);
  const [mobileVideoDockHeight, setMobileVideoDockHeight] = useState(0);
  const [mobileVideoDockStyle, setMobileVideoDockStyle] = useState(null);
  const [mobilePanel, setMobilePanel] = useState('');
  const [hostWorkspaceTab, setHostWorkspaceTab] = useState('room');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : false
  ));
  const [isXlViewport, setIsXlViewport] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1280px)').matches
      : false
  ));
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [reactionBursts, setReactionBursts] = useState([]);
  const [showEmoteTray, setShowEmoteTray] = useState(false);
  const [activeEmoteTrayTab, setActiveEmoteTrayTab] = useState('emotes');
  const [selectedPlay, setSelectedPlay] = useState(null);
  const [playModeFilter, setPlayModeFilter] = useState('All');
  const [playUserFilter, setPlayUserFilter] = useState('all');
  const [playPassOnly, setPlayPassOnly] = useState(true);
  const [songSearch, setSongSearch] = useState('');
  const deferredSongSearch = useDeferredValue(songSearch);
  const [requestTargetUserId, setRequestTargetUserId] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [searchingSongs, setSearchingSongs] = useState(false);
  const [cohostSearch, setCohostSearch] = useState('');
  const deferredCohostSearch = useDeferredValue(cohostSearch);
  const [showCohostManager, setShowCohostManager] = useState(false);
  const [cohostResults, setCohostResults] = useState([]);
  const [searchingCohosts, setSearchingCohosts] = useState(false);
  const [cohostActionUserId, setCohostActionUserId] = useState('');
  const [voteModeFilter, setVoteModeFilter] = useState('All');
  const [voteMinLevel, setVoteMinLevel] = useState('16');
  const [voteMaxLevel, setVoteMaxLevel] = useState('19');
  const [creatingVote, setCreatingVote] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [votePinCollapsed, setVotePinCollapsed] = useState(false);
  const [requestActionKey, setRequestActionKey] = useState('');
  const [moderationActionKey, setModerationActionKey] = useState('');
  const [messagePumpActionKey, setMessagePumpActionKey] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [streamState, setStreamState] = useState('idle');
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => (
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  ));
  const [copied, setCopied] = useState(false);
  const [overlayPreset, setOverlayPreset] = useState('compact');
  const [overlayTheme, setOverlayTheme] = useState('arena');
  const [overlayFit, setOverlayFit] = useState('wide');
  const [overlayAnchor, setOverlayAnchor] = useState('bottom-center');
  const [overlayWidgets, setOverlayWidgets] = useState(() => getDefaultLiveOverlayWidgets('compact'));
  const [overlayMotion, setOverlayMotion] = useState(true);
  const [overlayBrandMotion, setOverlayBrandMotion] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlayGuides, setOverlayGuides] = useState(false);
  const [overlayAutoHide, setOverlayAutoHide] = useState('off');
  const [overlayCopying, setOverlayCopying] = useState(false);
  const [overlayCopiedLabel, setOverlayCopiedLabel] = useState('');
  const [overlayTokenExpiresAt, setOverlayTokenExpiresAt] = useState('');
  const [youtubeTimestampPreview, setYoutubeTimestampPreview] = useState(null);
  const [youtubeTimestampLoading, setYoutubeTimestampLoading] = useState(false);
  const [youtubeTimestampPublishing, setYoutubeTimestampPublishing] = useState(false);
  const [youtubeTimestampCopiedLabel, setYoutubeTimestampCopiedLabel] = useState('');
  const [desktopMediaHeight, setDesktopMediaHeight] = useState(0);
  const chatScrollRef = useRef(null);
  const chatInputRef = useRef(null);
  const desktopVideoFrameRef = useRef(null);
  const mobileVideoShellRef = useRef(null);
  const cohostSearchInputRef = useRef(null);
  const reactionIdRef = useRef(0);
  const seenMessageIdsRef = useRef(new Set());
  const presenceIdRef = useRef('');
  const liveStreamRef = useRef(null);
  const wakeLockRef = useRef(null);
  const overlayPrefsKeyRef = useRef('');
  const overlayCopyTimerRef = useRef(null);
  const youtubeTimestampCopyTimerRef = useRef(null);

  const activeSessionId = sessionId || snapshot?.session?.id || '';
  const live = snapshot?.session || null;
  const currentVote = snapshot?.active_vote || null;
  const lastPlay = snapshot?.last_play || null;
  const youtubeId = String(live?.youtube_video_id || '').trim() || getYouTubeId(live?.stream_url || '');
  const participants = Array.isArray(live?.participants) ? live.participants : [];
  const activeParticipants = useMemo(
    () => participants.filter((participant) => String(participant?.status || 'active').trim() !== 'left'),
    [participants]
  );
  const performerParticipants = useMemo(
    () => activeParticipants.filter((participant) => participant?.role === 'owner' || participant?.role === 'cohost'),
    [activeParticipants]
  );
  const cohostParticipants = useMemo(
    () => performerParticipants.filter((participant) => participant?.role === 'cohost'),
    [performerParticipants]
  );
  const showPerformerLabels = performerParticipants.length > 1;
  const requestsEnabled = live?.requests_enabled !== false;
  const requestModeFilter = normalizeRequestModeFilterValue(live?.request_mode_filter);
  const requestMaxLevel = normalizeRequestMaxLevelValue(live?.request_max_level);
  const requestShowScores = live?.request_show_scores !== false;
  const requestShortcutSearch = useMemo(
    () => parseRequestShortcutSearch(deferredSongSearch),
    [deferredSongSearch]
  );
  const requestPolicySummary = formatRequestPolicySummary(requestModeFilter, requestMaxLevel);
  const requests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];
  const viewerState = snapshot?.viewer_state || { chat_muted: false, requests_blocked: false };
  const isHost = !!live?.is_host;
  const isParticipant = !!live?.is_participant;
  const showCohostControl = isHost && live?.status === 'live';
  const requestTargetParticipant = useMemo(
    () => performerParticipants.find((participant) => participant.user_id === requestTargetUserId) || null,
    [performerParticipants, requestTargetUserId]
  );
  const followedDirectorySessions = useMemo(
    () => directorySessions.filter((item) => !!item?.is_following),
    [directorySessions]
  );
  const otherDirectorySessions = useMemo(
    () => directorySessions.filter((item) => !item?.is_following),
    [directorySessions]
  );
  const isMobileChatLayout = !isDesktopViewport;
  const isCompactSongCardLayout = !isDesktopViewport;
  const useDesktopViewerLayout = !!youtubeId && isDesktopViewport;
  const useDesktopSidebarLayout = isDesktopViewport && !useDesktopViewerLayout;
  const mobileVideoLockAvailable = !!youtubeId && !isDesktopViewport && hostWorkspaceTab !== 'overlay' && hostWorkspaceTab !== 'chapters';
  const shouldLockMobileVideo = mobileVideoLockAvailable && lockVideo;
  const desktopMediaHeightStyle = useDesktopViewerLayout && desktopMediaHeight && isXlViewport
    ? { height: `${desktopMediaHeight}px`, maxHeight: `${desktopMediaHeight}px`, minHeight: `${desktopMediaHeight}px` }
    : undefined;
  const desktopChatFallbackHeight = 'clamp(24rem, calc(100dvh - 16rem), 64rem)';
  const overlayPreviewUrl = useMemo(() => {
    if (!activeSessionId || typeof window === 'undefined') return '';
    return buildLiveOverlayUrl(activeSessionId, {
      preset: overlayPreset,
      theme: overlayTheme,
      fit: overlayFit,
      anchor: overlayAnchor,
      widgets: overlayWidgets,
      motion: overlayMotion,
      brandMotion: overlayBrandMotion,
      opacity: overlayOpacity,
      guides: overlayGuides,
      autoHide: overlayAutoHide,
      baseUrl: window.location.origin,
    });
  }, [activeSessionId, overlayAnchor, overlayAutoHide, overlayBrandMotion, overlayFit, overlayGuides, overlayMotion, overlayOpacity, overlayPreset, overlayTheme, overlayWidgets]);

  useEffect(() => {
    setEditStreamUrl(live?.stream_url || '');
  }, [live?.id, live?.stream_url]);

  useEffect(() => {
    setEditStatusText(live?.status_text || '');
  }, [live?.id, live?.status_text]);

  useEffect(() => {
    setEditYoutubeBroadcastId(String(live?.youtube_broadcast_id || '').trim());
  }, [live?.id, live?.youtube_broadcast_id]);

  useEffect(() => {
    setShowEmoteTray(false);
    setActiveEmoteTrayTab('emotes');
  }, [activeSessionId, live?.status]);

  useEffect(() => {
    if (!requestTargetUserId) return;
    if (!performerParticipants.some((participant) => participant.user_id === requestTargetUserId)) {
      setRequestTargetUserId('');
    }
  }, [performerParticipants, requestTargetUserId]);

  useEffect(() => {
    if (playUserFilter === 'all') return;
    if (!performerParticipants.some((participant) => participant.user_id === playUserFilter)) {
      setPlayUserFilter('all');
    }
  }, [performerParticipants, playUserFilter]);

  useEffect(() => {
    if (!isHost || !activeSessionId || !showCohostManager) {
      setCohostResults([]);
      setSearchingCohosts(false);
      return undefined;
    }

    const query = deferredCohostSearch.trim();
    if (query.length < 1) {
      setCohostResults([]);
      setSearchingCohosts(false);
      return undefined;
    }

    let cancelled = false;
    setSearchingCohosts(true);
    searchUsers(query)
      .then((rows) => {
        if (cancelled) return;
        const blockedIds = new Set(performerParticipants.map((participant) => participant.user_id));
        startTransition(() => setCohostResults(
          (Array.isArray(rows) ? rows : []).filter((row) => row?.id && !blockedIds.has(row.id))
        ));
      })
      .catch(() => {
        if (!cancelled) setCohostResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchingCohosts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, deferredCohostSearch, isHost, performerParticipants, showCohostManager]);

  useEffect(() => {
    if (!showCohostManager || !cohostSearchInputRef.current) return;
    try {
      cohostSearchInputRef.current.focus({ preventScroll: true });
    } catch {
      cohostSearchInputRef.current.focus();
    }
  }, [showCohostManager]);

  useEffect(() => {
    if (isHost && live?.status === 'live') return;
    setShowCohostManager(false);
    setCohostSearch('');
    setCohostResults([]);
    setSearchingCohosts(false);
  }, [isHost, live?.status]);

  const loadYoutubeStatus = async () => {
    if (!user) return null;
    setYoutubeStatusLoading(true);
    try {
      const payload = await getYoutubeConnectionStatus();
      const nextStatus = {
        configured: !!payload?.configured,
        linked: !!payload?.linked,
        channel_title: payload?.channel_title || '',
        channel_thumbnail_url: payload?.channel_thumbnail_url || '',
        last_error: payload?.last_error || '',
      };
      setYoutubeConnection(nextStatus);
      return nextStatus;
    } catch (err) {
      const fallback = {
        configured: false,
        linked: false,
        channel_title: '',
        channel_thumbnail_url: '',
        last_error: err.message || 'Failed to load YouTube connection',
      };
      setYoutubeConnection(fallback);
      return fallback;
    } finally {
      setYoutubeStatusLoading(false);
    }
  };

  const loadYoutubeBroadcastOptions = async () => {
    if (!user) return;
    setYoutubeBroadcastsLoading(true);
    try {
      const payload = await getYoutubeBroadcasts();
      setYoutubeConnection({
        configured: !!payload?.configured,
        linked: !!payload?.linked,
        channel_title: payload?.channel_title || '',
        channel_thumbnail_url: payload?.channel_thumbnail_url || '',
        last_error: payload?.last_error || '',
      });
      setYoutubeBroadcasts(Array.isArray(payload?.broadcasts) ? payload.broadcasts : []);
    } catch (err) {
      setYoutubeBroadcasts([]);
      setYoutubeConnection((prev) => ({
        ...prev,
        last_error: err.message || 'Failed to load YouTube streams',
      }));
      throw err;
    } finally {
      setYoutubeBroadcastsLoading(false);
    }
  };

  const handleConnectYoutube = async () => {
    setError('');
    try {
      const payload = await startYoutubeConnection(location.pathname || '/live');
      if (!payload?.auth_url) throw new Error('Failed to start YouTube connection');
      window.location.assign(payload.auth_url);
    } catch (err) {
      setError(err.message || 'Failed to connect YouTube');
    }
  };

  const loadYoutubeTimestampPreview = async (targetSessionId = activeSessionId, options = {}) => {
    if (!user || !targetSessionId || !isHost) {
      setYoutubeTimestampPreview(null);
      return null;
    }
    if (!options.silent) {
      setYoutubeTimestampLoading(true);
    }
    try {
      const payload = await getLiveYoutubeTimestamps(targetSessionId);
      setYoutubeTimestampPreview(payload || null);
      return payload || null;
    } catch (err) {
      setYoutubeTimestampPreview(null);
      if (!options.silent) {
        setError(err.message || 'Failed to load YouTube chapters');
      }
      return null;
    } finally {
      if (!options.silent) {
        setYoutubeTimestampLoading(false);
      }
    }
  };

  const flashYoutubeTimestampCopiedLabel = (label) => {
    setYoutubeTimestampCopiedLabel(label);
    if (youtubeTimestampCopyTimerRef.current) {
      window.clearTimeout(youtubeTimestampCopyTimerRef.current);
    }
    youtubeTimestampCopyTimerRef.current = window.setTimeout(() => {
      setYoutubeTimestampCopiedLabel('');
      youtubeTimestampCopyTimerRef.current = null;
    }, 2200);
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadYoutubeStatus()
      .then((status) => {
        if (cancelled || !status?.linked) return;
        return loadYoutubeBroadcastOptions().catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const youtubeState = String(params.get('youtube') || '').trim();
    const youtubeMessage = String(params.get('youtube_message') || '').trim();
    if (youtubeState === 'connected') {
      setStatusNote(youtubeMessage || 'YouTube connected. Select your stream below.');
      loadYoutubeStatus()
        .then((status) => {
          if (status?.linked) return loadYoutubeBroadcastOptions().catch(() => {});
          return null;
        })
        .catch(() => {});
    } else if (youtubeState === 'error') {
      setError(youtubeMessage || 'Failed to connect YouTube');
    }
  }, [location.search]);

  useEffect(() => () => {
    if (youtubeTimestampCopyTimerRef.current) {
      window.clearTimeout(youtubeTimestampCopyTimerRef.current);
      youtubeTimestampCopyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!user || !activeSessionId || !isHost || !youtubeId) {
      setYoutubeTimestampPreview(null);
      setYoutubeTimestampLoading(false);
      return;
    }

    let cancelled = false;
    setYoutubeTimestampLoading(true);
    getLiveYoutubeTimestamps(activeSessionId)
      .then((payload) => {
        if (!cancelled) {
          setYoutubeTimestampPreview(payload || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setYoutubeTimestampPreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setYoutubeTimestampLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, isHost, lastPlay?.id, live?.youtube_actual_start_time, live?.youtube_scheduled_start_time, user, youtubeId]);

  if (!presenceIdRef.current && typeof window !== 'undefined') {
    const storageKey = 'shinsa_live_presence_id';
    presenceIdRef.current = window.sessionStorage.getItem(storageKey) || makePresenceId();
    window.sessionStorage.setItem(storageKey, presenceIdRef.current);
  }

  const releaseWakeLock = async () => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!lock) {
      setWakeLockActive(false);
      return;
    }
    try {
      await lock.release();
    } catch {
      // Ignore release errors from stale locks.
    } finally {
      setWakeLockActive(false);
    }
  };

  const requestWakeLock = async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setWakeLockSupported(false);
      return;
    }

    try {
      const lock = await navigator.wakeLock.request('screen');
      wakeLockRef.current = lock;
      setWakeLockActive(true);
      if (typeof lock?.addEventListener === 'function') {
        lock.addEventListener('release', () => {
          if (wakeLockRef.current === lock) {
            wakeLockRef.current = null;
          }
          setWakeLockActive(false);
        });
      }
    } catch (err) {
      setWakeLockActive(false);
      setError(err?.message || 'Failed to keep the screen awake');
    }
  };

  const reconcileSeenMessages = (nextMessages, options = {}) => {
    const normalizedMessages = Array.isArray(nextMessages) ? nextMessages : [];
    if (options.markMessagesSeen) {
      seenMessageIdsRef.current = new Set(normalizedMessages.map((msg) => msg.id));
    } else {
      const seen = seenMessageIdsRef.current;
      for (const msg of normalizedMessages) {
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        if (!msg?.is_system) {
          const reaction = getLiveReactionPayload(msg?.message);
          if (reaction) {
            showFloatingReaction(reaction);
          }
        }
      }
    }
  };

  const applySnapshot = (data, options = {}) => {
    const nextMessages = Array.isArray(data?.messages) ? data.messages : [];
    reconcileSeenMessages(nextMessages, options);

    setSnapshot(data);
    setMessages(nextMessages);
  };

  const applyEndedSessionResult = (payload = {}) => {
    startTransition(() => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const nextSession = payload?.session
          ? { ...(prev.session || {}), ...payload.session }
          : prev.session
            ? { ...prev.session, status: 'ended' }
            : prev.session;
        const nextVote = prev?.active_vote?.status === 'active'
          ? { ...prev.active_vote, status: 'closed' }
          : prev?.active_vote || null;
        return {
          ...prev,
          session: nextSession,
          summary: payload?.summary || prev.summary,
          active_vote: nextVote,
        };
      });
    });
  };

  const appendLiveMessage = (message, options = {}) => {
    if (!message?.id) return;

    if (options.markMessagesSeen) {
      seenMessageIdsRef.current.add(message.id);
    } else if (!seenMessageIdsRef.current.has(message.id)) {
      seenMessageIdsRef.current.add(message.id);
      if (!message?.is_system) {
        const reaction = getLiveReactionPayload(message?.message);
        if (reaction) {
          showFloatingReaction(reaction);
        }
      }
    }

    startTransition(() => {
      setMessages((prev) => appendUniqueLiveMessage(prev, message));
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: appendUniqueLiveMessage(prev.messages, message),
        };
      });
    });
  };

  const replaceLiveMessage = (message) => {
    if (!message?.id) return;

    startTransition(() => {
      setMessages((prev) => replaceLiveMessageById(prev, message));
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: replaceLiveMessageById(prev.messages, message),
        };
      });
    });
  };

  const removeLiveMessage = (messageId) => {
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedMessageId) return;
    seenMessageIdsRef.current.delete(normalizedMessageId);

    startTransition(() => {
      setMessages((prev) => removeLiveMessageById(prev, normalizedMessageId));
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: removeLiveMessageById(prev.messages, normalizedMessageId),
        };
      });
    });
  };

  const replaceLiveRequests = (nextRequests) => {
    const normalizedRequests = Array.isArray(nextRequests) ? nextRequests : [];
    startTransition(() => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          requests: normalizedRequests,
        };
      });
    });
  };

  const applyPresenceUpdate = (viewerCount, viewerPeak) => {
    startTransition(() => {
      setSnapshot((prev) => {
        if (!prev?.session) return prev;
        return {
          ...prev,
          session: {
            ...prev.session,
            viewer_count: viewerCount,
            viewer_peak: viewerPeak,
          },
          summary: prev.summary ? {
            ...prev.summary,
            viewerCount,
            viewerPeak,
          } : prev.summary,
        };
      });
    });
  };

  const applySessionUpdate = (sessionPayload) => {
    if (!sessionPayload) return;
    startTransition(() => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          session: sessionPayload,
        };
      });
    });
  };

  const applyPlaysPayload = (payload = {}) => {
    startTransition(() => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          session: payload?.session || prev.session,
          plays: Array.isArray(payload?.plays) ? payload.plays : prev.plays,
          last_play: Object.prototype.hasOwnProperty.call(payload, 'last_play') ? payload.last_play : prev.last_play,
          summary: payload?.summary || prev.summary,
        };
      });
    });
  };

  const applyVoteUpdate = (vote) => {
    startTransition(() => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          active_vote: vote || null,
        };
      });
    });
  };

  const applyModerationPayload = (payload) => {
    const targetUserId = String(payload?.target_user_id || '').trim();
    const moderation = payload?.moderation || { chat_muted: false, requests_blocked: false };

    startTransition(() => {
      setMessages((prev) => applyModerationToMessages(prev, targetUserId, moderation));
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: applyModerationToMessages(prev.messages, targetUserId, moderation),
          requests: applyModerationToRequests(prev.requests, targetUserId, moderation),
          viewer_state: payload?.viewer_state || prev.viewer_state,
        };
      });
    });
  };

  const showFloatingReaction = (payload) => {
    const reaction = typeof payload === 'string'
      ? getLiveReactionPayload(payload) || { kind: 'emoji', emoji: payload }
      : payload;
    if (!reaction) return;

    const rid = reactionIdRef.current++;
    const x = 15 + Math.random() * 70;
    setFloatingReactions((prev) => [...prev, { id: rid, reaction, x }]);
    const colors = getReactionBurstColors(reaction);
    const burstId = reactionIdRef.current++;
    const particles = Array.from({ length: 7 }).map((_, idx) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 1.2) / 6) * idx;
      const distance = 28 + Math.random() * 34;
      return {
        id: `${burstId}-${idx}`,
        dx: `${Math.cos(angle) * distance}px`,
        dy: `${Math.sin(angle) * distance}px`,
        size: `${8 + Math.round(Math.random() * 7)}px`,
        color: colors[idx % colors.length],
      };
    });
    setReactionBursts((prev) => [...prev, { id: burstId, x, particles }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((row) => row.id !== rid));
    }, 1800);
    setTimeout(() => {
      setReactionBursts((prev) => prev.filter((row) => row.id !== burstId));
    }, 950);
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setError('');
      try {
        let data = null;
        if (sessionId) {
          data = await getLiveSession(sessionId);
        } else {
          const mine = await getMyLiveSession();
          if (mine?.session?.id) data = mine;
        }
        if (cancelled) return;
        if (!data || !data.session) {
          setSnapshot(null);
          setMessages([]);
          seenMessageIdsRef.current = new Set();
          return;
        }
        applySnapshot(data, { markMessagesSeen: true });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load live session');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitial();
    return () => { cancelled = true; };
  }, [sessionId, user]);

  useEffect(() => {
    if (!user || sessionId || live || !isDocumentVisible) return undefined;

    let cancelled = false;
    const loadDirectory = async () => {
      setDirectoryLoading(true);
      try {
        const data = await getLiveSessions({ limit: 18 });
        if (cancelled) return;
        setDirectorySessions(Array.isArray(data?.sessions) ? data.sessions : []);
        setDirectoryError('');
      } catch (err) {
        if (!cancelled) setDirectoryError(err.message || 'Failed to load live directory');
      } finally {
        if (!cancelled) setDirectoryLoading(false);
      }
    };

    loadDirectory();
    const interval = setInterval(loadDirectory, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isDocumentVisible, live, sessionId, user]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === 'visible');
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setWakeLockSupported('wakeLock' in navigator);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktopViewport(query.matches);
    update();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsXlViewport(query.matches);
    update();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return undefined;
    const liveRoomWorkspaceVisible = hostWorkspaceTab !== 'overlay' && hostWorkspaceTab !== 'chapters';
    if (!useDesktopViewerLayout || !liveRoomWorkspaceVisible) {
      setDesktopMediaHeight(0);
      return undefined;
    }

    const node = desktopVideoFrameRef.current;
    if (!node) return undefined;

    const updateHeight = () => {
      const nextHeight = Math.round(node.getBoundingClientRect().height);
      setDesktopMediaHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [hostWorkspaceTab, useDesktopViewerLayout, youtubeId]);

  useEffect(() => {
    setVotePinCollapsed(!!currentVote && currentVote.status !== 'active');
  }, [currentVote?.id, currentVote?.status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `shinsa_live_video_lock:${user?.id || 'viewer'}`;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === '1' || stored === '0') {
      setLockVideo(stored === '1');
    }
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`shinsa_live_video_lock:${user?.id || 'viewer'}`, lockVideo ? '1' : '0');
  }, [lockVideo, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || !shouldLockMobileVideo) {
      setMobileVideoDocked(false);
      setMobileVideoDockHeight(0);
      setMobileVideoDockStyle(null);
      return undefined;
    }

    const updateDockState = () => {
      const shell = mobileVideoShellRef.current;
      if (!shell) return;

      const headerRect = typeof document !== 'undefined'
        ? document.querySelector('header')?.getBoundingClientRect?.()
        : null;
      const lockTop = headerRect ? Math.max(0, headerRect.bottom) : 56;

      const rect = shell.getBoundingClientRect();
      const height = shell.offsetHeight || rect.height || 0;
      const shouldDock = rect.top <= lockTop;

      setMobileVideoDockHeight(height);
      setMobileVideoDocked(shouldDock);
      setMobileVideoDockStyle(
        shouldDock
          ? {
              top: `${lockTop}px`,
              left: `${Math.max(0, rect.left)}px`,
              width: `${rect.width}px`,
            }
          : null
      );
    };

    updateDockState();
    window.addEventListener('scroll', updateDockState, { passive: true });
    window.addEventListener('resize', updateDockState);

    return () => {
      window.removeEventListener('scroll', updateDockState);
      window.removeEventListener('resize', updateDockState);
    };
  }, [shouldLockMobileVideo, youtubeId]);

  useEffect(() => {
    if (!isHost || typeof window === 'undefined') return;
    const storageKey = `shinsa_live_overlay:${user?.id || 'host'}`;
    if (overlayPrefsKeyRef.current === storageKey) return;
    overlayPrefsKeyRef.current = storageKey;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const normalizedPreset = normalizeLiveOverlayPreset(parsed?.preset);
      setOverlayPreset(normalizedPreset);
      setOverlayTheme(normalizeLiveOverlayTheme(parsed?.theme));
      setOverlayFit(normalizeLiveOverlayFit(parsed?.fit));
      setOverlayAnchor(normalizeLiveOverlayAnchor(parsed?.anchor));
      setOverlayWidgets(normalizeLiveOverlayWidgets(parsed?.widgets, normalizedPreset));
      setOverlayMotion(parsed?.motion !== false);
      setOverlayBrandMotion(normalizeLiveOverlayBrandMotion(parsed?.brandMotion));
      setOverlayOpacity(normalizeLiveOverlayOpacity(parsed?.opacity));
      setOverlayGuides(normalizeLiveOverlayGuides(parsed?.guides));
      setOverlayAutoHide(normalizeLiveOverlayAutoHide(parsed?.autoHide));
    } catch {
      // Ignore malformed overlay preferences and fall back to defaults.
    }
  }, [isHost, user?.id]);

  useEffect(() => {
    if (!isHost || typeof window === 'undefined' || !overlayPrefsKeyRef.current) return;
    try {
      window.localStorage.setItem(overlayPrefsKeyRef.current, JSON.stringify({
        preset: overlayPreset,
        theme: overlayTheme,
        fit: overlayFit,
        anchor: overlayAnchor,
        widgets: overlayWidgets,
        motion: overlayMotion,
        brandMotion: overlayBrandMotion,
        opacity: overlayOpacity,
        guides: overlayGuides,
        autoHide: overlayAutoHide,
      }));
    } catch {
      // Ignore storage write failures.
    }
  }, [isHost, overlayAnchor, overlayAutoHide, overlayBrandMotion, overlayFit, overlayGuides, overlayMotion, overlayOpacity, overlayPreset, overlayTheme, overlayWidgets]);

  useEffect(() => {
    if (live?.status !== 'live' && mobilePanel === 'vote') {
      setMobilePanel('');
    }
  }, [live?.status, mobilePanel]);

  useEffect(() => {
    if (hostWorkspaceTab === 'chapters' && !youtubeId) {
      setHostWorkspaceTab('room');
    }
  }, [hostWorkspaceTab, youtubeId]);

  useEffect(() => () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    if (overlayCopyTimerRef.current) {
      window.clearTimeout(overlayCopyTimerRef.current);
      overlayCopyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!wakeLockActive || typeof document === 'undefined') return undefined;

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!wakeLockRef.current) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [wakeLockActive]);

  useEffect(() => {
    if (!user || !activeSessionId || !live?.id || live?.status !== 'live') {
      if (liveStreamRef.current) {
        liveStreamRef.current.close();
        liveStreamRef.current = null;
      }
      setStreamState('idle');
      return undefined;
    }

    let closed = false;
    let source;
    try {
      setStreamState('connecting');
      source = openLiveSessionStream(activeSessionId);
      liveStreamRef.current = source;
    } catch (err) {
      setStreamState('error');
      setError(err.message || 'Failed to connect live channel');
      return undefined;
    }

    const handleReady = () => {
      if (closed) return;
      setError('');
      setStreamState('live');
    };

    const handleSnapshot = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload?.snapshot) {
          applySnapshot(payload.snapshot, { markMessagesSeen: payload?.reason === 'initial' });
          setError('');
        }
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handlePresence = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        const viewerCount = parseInt(payload?.viewer_count, 10) || 0;
        const viewerPeak = parseInt(payload?.viewer_peak, 10) || 0;
        applyPresenceUpdate(viewerCount, viewerPeak);
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handleSessionUpdated = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload?.session) {
          applySessionUpdate(payload.session);
        }
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handlePlaysUpdated = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        applyPlaysPayload(payload);
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handleMessageAdded = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload?.message) {
          appendLiveMessage(payload.message);
        }
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handleMessageRemoved = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload?.message_id) {
          removeLiveMessage(payload.message_id);
        }
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handleMessageUpdated = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload?.message) {
          replaceLiveMessage(payload.message);
        }
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handleRequestsUpdated = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (Array.isArray(payload?.requests)) {
          replaceLiveRequests(payload.requests);
        }
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handleModerationUpdated = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        applyModerationPayload(payload);
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    const handleVoteUpdated = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (Object.prototype.hasOwnProperty.call(payload || {}, 'vote')) {
          applyVoteUpdate(payload.vote || null);
        }
        if (!closed) setError('');
        if (!closed) setStreamState('live');
      } catch {}
    };

    source.addEventListener('ready', handleReady);
    source.addEventListener('snapshot', handleSnapshot);
    source.addEventListener('presence', handlePresence);
    source.addEventListener('session_updated', handleSessionUpdated);
    source.addEventListener('plays_updated', handlePlaysUpdated);
    source.addEventListener('message_added', handleMessageAdded);
    source.addEventListener('message_updated', handleMessageUpdated);
    source.addEventListener('message_removed', handleMessageRemoved);
    source.addEventListener('requests_updated', handleRequestsUpdated);
    source.addEventListener('moderation_updated', handleModerationUpdated);
    source.addEventListener('vote_updated', handleVoteUpdated);
    source.onopen = handleReady;
    source.onerror = () => {
      if (!closed) setStreamState('reconnecting');
    };

    return () => {
      closed = true;
      if (liveStreamRef.current) {
        liveStreamRef.current.close();
        liveStreamRef.current = null;
      } else if (source) {
        source.close();
      }
    };
  }, [activeSessionId, live?.id, live?.status, user]);

  useEffect(() => {
    if (!user || !activeSessionId || !isDocumentVisible || loading || streamState === 'live') return undefined;

    let cancelled = false;
    const refreshSnapshot = async () => {
      try {
        const data = await getLiveSession(activeSessionId);
        if (cancelled || !data?.session) return;
        applySnapshot(data);
        setError('');
      } catch (err) {
        if (!cancelled && streamState === 'error') {
          setError(err.message || 'Failed to refresh live session');
        }
      }
    };

    refreshSnapshot();
    const interval = setInterval(refreshSnapshot, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSessionId, isDocumentVisible, loading, streamState, user]);

  useEffect(() => {
    if (!user || !activeSessionId || !isDocumentVisible || live?.status !== 'live') return undefined;
    const ping = () => sendLivePresence(activeSessionId, { session_id: presenceIdRef.current }).catch(() => {});
    ping();
    const interval = setInterval(ping, 10000);
    return () => clearInterval(interval);
  }, [activeSessionId, isDocumentVisible, live?.status, user]);

  useEffect(() => {
    const trimmedSearch = deferredSongSearch.trim();
    const shortcut = parseRequestShortcutSearch(trimmedSearch);
    const hasShortcutModeSearch = !!shortcut;
    const scoreParticipants = performerParticipants;
    const shortcutNeedsParticipantScores = hasShortcutModeSearch && (!requestShowScores || scoreParticipants.length === 0);
    const shortcutTextSearch = shortcut?.search || '';
    if (!trimmedSearch || (!hasShortcutModeSearch && trimmedSearch.length < 2)) {
      setSongResults([]);
      setSearchingSongs(false);
      return undefined;
    }
    if (shortcutNeedsParticipantScores) {
      setSongResults([]);
      setSearchingSongs(false);
      return undefined;
    }
    let cancelled = false;
    setSearchingSongs(true);
    const params = hasShortcutModeSearch
      ? {
          mode: shortcut.mode,
          level: shortcut.level,
          ...(shortcutTextSearch ? { search: shortcutTextSearch } : {}),
        }
      : {
          search: trimmedSearch,
        };
    const baseOptions = hasShortcutModeSearch ? { unlimited: true } : undefined;

    const requestPromise = requestShowScores && scoreParticipants.length > 0
      ? Promise.all(scoreParticipants.map((participant) => getSongLibrary({
          ...params,
          user_id: participant.user_id,
        }))).then((payloads) => mergeParticipantSongResults(payloads, scoreParticipants, baseOptions))
      : getSongLibrary(params).then((data) => normalizeSongResults(data, baseOptions));

    requestPromise
      .then((results) => {
        if (cancelled) return;
        const filteredResults = filterSongResultsForRequests(
          results,
          requestModeFilter,
          requestMaxLevel
        );
        startTransition(() => setSongResults(filteredResults));
      })
      .catch(() => {
        if (!cancelled) setSongResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchingSongs(false);
      });
    return () => { cancelled = true; };
  }, [deferredSongSearch, performerParticipants, requestMaxLevel, requestModeFilter, requestShowScores]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const visiblePlays = useMemo(() => {
    const rows = Array.isArray(snapshot?.plays) ? [...snapshot.plays] : [];
    let filtered = playModeFilter === 'All'
      ? rows
      : rows.filter((play) => play.mode === playModeFilter);

    if (playUserFilter !== 'all') {
      filtered = filtered.filter((play) => play.user_id === playUserFilter);
    }

    if (playPassOnly) {
      filtered = filtered.filter((play) => (parseInt(play.score, 10) || 0) > 0);
    }

    filtered.sort((a, b) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0));
    return filtered;
  }, [playModeFilter, playPassOnly, playUserFilter, snapshot?.plays]);

  const requestLookup = useMemo(() => {
    const map = new Map();
    for (const request of requests) {
      const key = buildRequestKey(request.song_title, request.mode, request.level);
      if (!map.has(key)) {
        map.set(key, {
          openCount: 0,
          queuedCount: 0,
          playedCount: 0,
          skippedCount: 0,
          usernames: [],
        });
      }
      const row = map.get(key);
      const status = getRequestStatus(request.status, request.fulfilled);
      if (status === 'queued') row.queuedCount += 1;
      else if (status === 'played') row.playedCount += 1;
      else if (status === 'skipped') row.skippedCount += 1;
      else row.openCount += 1;
      if (request.username) row.usernames.push(request.username);
    }
    return map;
  }, [requests]);
  const livePlayLookup = useMemo(() => {
    const map = new Map();
    for (const play of Array.isArray(snapshot?.plays) ? snapshot.plays : []) {
      const key = buildRequestKey(play.song_title, play.mode, play.level);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { count: 0 });
      }
      map.get(key).count += 1;
    }
    return map;
  }, [snapshot?.plays]);

  const requestCounts = useMemo(() => requests.reduce((acc, request) => {
    const status = getRequestStatus(request.status, request.fulfilled);
    acc[status] += 1;
    return acc;
  }, { open: 0, queued: 0, played: 0, skipped: 0 }), [requests]);
  const shortcutChartResults = useMemo(() => {
    if (!requestShortcutSearch) return [];
    return flattenSongResultsToCharts(songResults).sort((a, b) => {
      const aKey = buildRequestKey(a.song_title, a.mode, a.level);
      const bKey = buildRequestKey(b.song_title, b.mode, b.level);
      const aPlayed = parseInt(livePlayLookup.get(aKey)?.count, 10) || 0;
      const bPlayed = parseInt(livePlayLookup.get(bKey)?.count, 10) || 0;
      if ((bPlayed > 0) !== (aPlayed > 0)) return (bPlayed > 0) - (aPlayed > 0);

      const aHasScore = a.best_score !== null && a.best_score !== undefined;
      const bHasScore = b.best_score !== null && b.best_score !== undefined;
      if (Number(bHasScore) !== Number(aHasScore)) return Number(bHasScore) - Number(aHasScore);
      if (Number(a.is_pass) !== Number(b.is_pass)) return Number(a.is_pass) - Number(b.is_pass);

      const bestScoreDiff = (parseInt(b.best_score, 10) || 0) - (parseInt(a.best_score, 10) || 0);
      if (bestScoreDiff !== 0) return bestScoreDiff;

      const titleDiff = String(a.song_title || '').localeCompare(String(b.song_title || ''));
      if (titleDiff !== 0) return titleDiff;
      return (parseInt(a.chart_id, 10) || 0) - (parseInt(b.chart_id, 10) || 0);
    });
  }, [livePlayLookup, requestShortcutSearch, songResults]);
  const shortcutChartSummary = useMemo(() => {
    if (!requestShortcutSearch) return null;
    return shortcutChartResults.reduce((acc, chart) => {
      const key = buildRequestKey(chart.song_title, chart.mode, chart.level);
      const playedCount = parseInt(livePlayLookup.get(key)?.count, 10) || 0;
      const hasHostScoreSnapshot = chart.best_score !== null && chart.best_score !== undefined;
      acc.total += 1;
      if (playedCount > 0) acc.played += 1;
      if (hasHostScoreSnapshot) {
        if (chart.is_pass) acc.passed += 1;
        else acc.unpassed += 1;
      } else {
        acc.unsynced += 1;
      }
      return acc;
    }, { total: 0, played: 0, passed: 0, unpassed: 0, unsynced: 0 });
  }, [livePlayLookup, requestShortcutSearch, shortcutChartResults]);
  const liveChatMessageLookups = useMemo(
    () => buildLiveChatMessageLookups(snapshot?.plays, currentVote),
    [snapshot?.plays, currentVote]
  );
  const chatMessages = useMemo(
    () => messages.map((message) => ({
      ...message,
      structured: buildStructuredSongMessage(message, liveChatMessageLookups),
    })),
    [messages, liveChatMessageLookups]
  );
  const nowPlayingRequestInfo = lastPlay
    ? requestLookup.get(buildRequestKey(lastPlay.song_title, lastPlay.mode, lastPlay.level))
    : null;

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const data = await createLiveSession({
        title: createTitle,
        stream_url: createStreamUrl,
        youtube_broadcast_id: createYoutubeBroadcastId,
        status_text: createStatusText,
      });
      seenMessageIdsRef.current = new Set((data?.messages || []).map((msg) => msg.id));
      applySnapshot(data, { markMessagesSeen: true });
      if ((parseInt(data?.notified_followers, 10) || 0) > 0) {
        setStatusNote(`${data.notified_followers} follower${data.notified_followers === 1 ? '' : 's'} notified.`);
      }
      if (data?.session?.id) navigate(`/live/${data.session.id}`, { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to create live session');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatusText = async () => {
    if (!activeSessionId || !isHost) return;
    setSavingStatusText(true);
    setError('');
    try {
      const data = await updateLiveSession(activeSessionId, { status_text: editStatusText });
      applySnapshot(data, { markMessagesSeen: false });
      const savedStatus = String(data?.session?.status_text || '').trim();
      setEditStatusText(data?.session?.status_text || '');
      setStatusNote(savedStatus ? 'Live status updated.' : 'Live status cleared.');
    } catch (err) {
      setError(err.message || 'Failed to update live status');
    } finally {
      setSavingStatusText(false);
    }
  };

  const handleUpdateStreamUrl = async () => {
    if (!activeSessionId || !isHost) return;
    setSavingStreamUrl(true);
    setError('');
    try {
      const data = await updateLiveSession(activeSessionId, {
        stream_url: editStreamUrl,
        youtube_broadcast_id: editYoutubeBroadcastId,
      });
      applySnapshot(data, { markMessagesSeen: false });
      const savedUrl = String(data?.session?.stream_url || '').trim();
      setEditStreamUrl(savedUrl);
      setStatusNote(savedUrl ? 'Live stream link updated.' : 'Live stream link removed.');
    } catch (err) {
      setError(err.message || 'Failed to update live stream link');
    } finally {
      setSavingStreamUrl(false);
    }
  };

  const handleToggleRequestsEnabled = async () => {
    if (!activeSessionId || !isHost) return;
    setSavingRequestsEnabled(true);
    setError('');
    try {
      const data = await updateLiveSession(activeSessionId, {
        stream_url: editStreamUrl,
        requests_enabled: !requestsEnabled,
      });
      applySnapshot(data, { markMessagesSeen: false });
      setStatusNote(!requestsEnabled ? 'Song requests are now open.' : 'Song requests are now closed.');
    } catch (err) {
      setError(err.message || 'Failed to update request availability');
    } finally {
      setSavingRequestsEnabled(false);
    }
  };

  const handleUpdateRequestSettings = async (changes, successMessage) => {
    if (!activeSessionId || !isHost) return;
    setSavingRequestPolicy(true);
    setError('');
    try {
      const data = await updateLiveSession(activeSessionId, changes);
      applySnapshot(data, { markMessagesSeen: false });
      setStatusNote(successMessage);
    } catch (err) {
      setError(err.message || 'Failed to update request settings');
    } finally {
      setSavingRequestPolicy(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!activeSessionId || !trimmed || viewerState.chat_muted) return;
    setSendingChat(true);
    try {
      const data = await sendLiveMessage(activeSessionId, { message: trimmed });
      appendLiveMessage(data.message, { markMessagesSeen: true });
      setChatInput('');
      const reaction = getLiveReactionPayload(trimmed);
      if (reaction) showFloatingReaction(reaction);
    } catch (err) {
      setError(err.message || 'Failed to send chat message');
    } finally {
      setSendingChat(false);
    }
  };

  const handleQuickReaction = async (emoji) => {
    if (!activeSessionId || live?.status !== 'live' || viewerState.chat_muted) return;
    showFloatingReaction(emoji);
    try {
      const data = await sendLiveMessage(activeSessionId, { message: emoji });
      appendLiveMessage(data.message, { markMessagesSeen: true });
      setShowEmoteTray(false);
    } catch (err) {
      setError(err.message || 'Failed to send reaction');
    }
  };

  const handleInsertChatToken = (token) => {
    setChatInput((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token} `);
    setShowEmoteTray(true);
    if (chatInputRef.current) {
      try {
        chatInputRef.current.focus({ preventScroll: true });
      } catch {
        chatInputRef.current.focus();
      }
      if (typeof chatInputRef.current.scrollIntoView === 'function') {
        chatInputRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  };

  const handleLiveRequest = async (chart) => {
    if (!activeSessionId || viewerState.requests_blocked) return;
    try {
      const data = await sendLiveRequest(activeSessionId, {
        chart_id: chart.chart_id,
        target_user_id: requestTargetUserId || '',
      });
      if (Array.isArray(data?.requests)) {
        replaceLiveRequests(data.requests);
      }
      if (data?.message) {
        appendLiveMessage(data.message, { markMessagesSeen: true });
      }
      const targetParticipant = performerParticipants.find((participant) => participant.user_id === requestTargetUserId) || null;
      setStatusNote(
        `Requested ${chart.song_title} (${modeShort(chart.mode)}${chart.level})${targetParticipant?.username ? ` for ${targetParticipant.username}` : ''}.`
      );
      setSongSearch('');
      setSongResults([]);
    } catch (err) {
      setError(err.message || 'Failed to send request');
    }
  };

  const handleAddCohost = async (targetUser) => {
    if (!activeSessionId || !targetUser?.id) return;
    setCohostActionUserId(targetUser.id);
    setError('');
    try {
      const data = await addLiveSessionCohost(activeSessionId, targetUser.id);
      if (data?.snapshot) applySnapshot(data.snapshot, { markMessagesSeen: false });
      if (data?.message) appendLiveMessage(data.message, { markMessagesSeen: true });
      setShowCohostManager(false);
      setCohostSearch('');
      setCohostResults([]);
      setStatusNote(`${targetUser.username || 'Player'} joined as a co-host.`);
    } catch (err) {
      setError(err.message || 'Failed to add co-host');
    } finally {
      setCohostActionUserId('');
    }
  };

  const handleRemoveCohost = async (participant) => {
    if (!activeSessionId || !participant?.user_id) return;
    setCohostActionUserId(participant.user_id);
    setError('');
    try {
      const data = await removeLiveSessionCohost(activeSessionId, participant.user_id);
      if (data?.snapshot) applySnapshot(data.snapshot, { markMessagesSeen: false });
      if (data?.message) appendLiveMessage(data.message, { markMessagesSeen: true });
      setStatusNote(`${participant.username || 'Co-host'} left the room.`);
    } catch (err) {
      setError(err.message || 'Failed to remove co-host');
    } finally {
      setCohostActionUserId('');
    }
  };

  const handleLeaveRoom = async () => {
    if (!activeSessionId) return;
    setCohostActionUserId(user?.id || 'leave');
    setError('');
    try {
      const data = await leaveLiveSession(activeSessionId);
      if (data?.snapshot) applySnapshot(data.snapshot, { markMessagesSeen: false });
      if (data?.message) appendLiveMessage(data.message, { markMessagesSeen: true });
      setStatusNote('You left the co-host lineup.');
    } catch (err) {
      setError(err.message || 'Failed to leave live session');
    } finally {
      setCohostActionUserId('');
    }
  };

  const toggleCohostManager = () => {
    setShowCohostManager((current) => {
      if (current) {
        setCohostSearch('');
        setCohostResults([]);
        setSearchingCohosts(false);
      }
      return !current;
    });
  };

  const handleCreateVote = async () => {
    if (!activeSessionId) return;
    setCreatingVote(true);
    try {
      const data = await createLiveVote(activeSessionId, {
        mode_filter: voteModeFilter,
        min_level: parseInt(voteMinLevel, 10) || 1,
        max_level: parseInt(voteMaxLevel, 10) || parseInt(voteMinLevel, 10) || 1,
      });
      if (Object.prototype.hasOwnProperty.call(data || {}, 'vote')) {
        applyVoteUpdate(data.vote || null);
      }
      if (data?.message) {
        appendLiveMessage(data.message, { markMessagesSeen: true });
      }
    } catch (err) {
      setError(err.message || 'Failed to create vote');
    } finally {
      setCreatingVote(false);
    }
  };

  const handleCastVote = async (optionId) => {
    if (!currentVote) return;
    try {
      const data = await castLiveVote(currentVote.id, optionId);
      applyVoteUpdate(data.vote);
    } catch (err) {
      setError(err.message || 'Failed to cast vote');
    }
  };

  const handleSyncNow = async () => {
    if (!activeSessionId) return;
    setSyncing(true);
    try {
      const data = await syncLiveSession(activeSessionId);
      if (data?.snapshot) applySnapshot(data.snapshot);
      if (isHost && youtubeId) {
        loadYoutubeTimestampPreview(activeSessionId, { silent: true }).catch(() => {});
      }
      setStatusNote(buildSyncStatusNote(data?.sync_result, 'Live session is up to date.'));
    } catch (err) {
      setError(err.message || 'Failed to sync live session');
    } finally {
      setSyncing(false);
    }
  };

  const handleSetRequestStatus = async (request, status) => {
    if (!activeSessionId || !request?.id) return;
    const nextStatus = getRequestStatus(status, status === 'played');
    setRequestActionKey(`${request.id}:${nextStatus}`);
    try {
      const data = await setLiveRequestStatus(activeSessionId, request.id, nextStatus);
      if (Array.isArray(data?.requests)) {
        replaceLiveRequests(data.requests);
      }
      if (data?.message) {
        appendLiveMessage(data.message, { markMessagesSeen: true });
      }
      setStatusNote(`Request ${request.song_title} is now ${getRequestStatusMeta(nextStatus).label.toLowerCase()}.`);
    } catch (err) {
      setError(err.message || 'Failed to update request');
    } finally {
      setRequestActionKey('');
    }
  };

  const handleFulfillRequest = async (request) => {
    handleSetRequestStatus(request, 'played');
  };

  const handleToggleModeration = async (target, field) => {
    if (!activeSessionId || !target?.user_id || target?.is_host) return;
    const chatMuted = field === 'chat_muted' ? !target.chat_muted : !!target.chat_muted;
    const requestsBlocked = field === 'requests_blocked' ? !target.requests_blocked : !!target.requests_blocked;
    setModerationActionKey(`${field}:${target.user_id}`);
    try {
      const data = await setLiveModeration(activeSessionId, {
        target_user_id: target.user_id,
        chat_muted: chatMuted,
        requests_blocked: requestsBlocked,
      });
      applyModerationPayload(data);
      if (data?.message) {
        appendLiveMessage(data.message, { markMessagesSeen: true });
      }
      setStatusNote(
        field === 'chat_muted'
          ? `${target.username || 'Viewer'} ${chatMuted ? 'was muted in chat.' : 'can chat again.'}`
          : `${target.username || 'Viewer'} ${requestsBlocked ? 'can no longer send requests.' : 'can send requests again.'}`
      );
    } catch (err) {
      setError(err.message || 'Failed to update moderation');
    } finally {
      setModerationActionKey('');
    }
  };

  const handlePumpChatMessage = async (message) => {
    const messageId = String(message?.id || '').trim();
    if (!activeSessionId || !messageId || !canPumpLiveMessage(message)) return;
    setMessagePumpActionKey(messageId);
    try {
      const data = await pumpLiveMessage(activeSessionId, messageId);
      if (data?.message) {
        replaceLiveMessage(data.message);
      }
    } catch (err) {
      setError(err.message || 'Failed to pump message');
    } finally {
      setMessagePumpActionKey('');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!activeSessionId || !messageId) return;
    setDeletingMessageId(messageId);
    try {
      const data = await deleteLiveMessage(activeSessionId, messageId);
      if (data?.message_id) {
        removeLiveMessage(data.message_id);
      }
      setStatusNote('Viewer message removed.');
    } catch (err) {
      setError(err.message || 'Failed to remove message');
    } finally {
      setDeletingMessageId('');
    }
  };

  const handleEndSession = async () => {
    if (!activeSessionId) return;
    setShowEndConfirm(true);
  };

  const handleConfirmEndSession = async () => {
    if (!activeSessionId) return;
    setError('');
    setEnding(true);
    setShowEndConfirm(false);
    setStatusNote('Ending live session...');
    try {
      const data = await endLiveSession(activeSessionId);
      applyEndedSessionResult(data);
      setStatusNote(data?.summary_post_id ? `Live session ended. Recap post #${data.summary_post_id} created.` : 'Live session ended.');
      getLiveSession(activeSessionId)
        .then((fresh) => {
          if (fresh?.session) {
            applySnapshot(fresh);
          }
        })
        .catch(() => {});
    } catch (err) {
      try {
        const fresh = await getLiveSession(activeSessionId);
        if (fresh?.session?.status === 'ended') {
          applySnapshot(fresh);
          setStatusNote(fresh?.summary_post_id ? `Live session ended. Recap post #${fresh.summary_post_id} created.` : 'Live session ended.');
          return;
        }
      } catch {}
      setError(err.message || 'Failed to end live session');
    } finally {
      setEnding(false);
    }
  };

  const handleCopyYoutubeTimestamps = async () => {
    if (!youtubeTimestampPreview?.text) return;
    try {
      await navigator.clipboard.writeText(youtubeTimestampPreview.text);
      flashYoutubeTimestampCopiedLabel('Copied');
      setStatusNote('YouTube chapters copied to the clipboard.');
    } catch (err) {
      setError(err.message || 'Failed to copy YouTube chapters');
    }
  };

  const handlePublishYoutubeTimestamps = async () => {
    if (!activeSessionId || !youtubeTimestampPreview?.text) return;
    setYoutubeTimestampPublishing(true);
    setError('');
    try {
      const payload = await publishLiveYoutubeTimestamps(activeSessionId);
      setYoutubeTimestampPreview((prev) => prev ? {
        ...prev,
        video_description: payload?.description || prev.video_description || '',
        next_description: payload?.description || prev.next_description || '',
      } : prev);
      setStatusNote('YouTube chapters published to the linked video description.');
    } catch (err) {
      setError(err.message || 'Failed to publish YouTube chapters');
    } finally {
      setYoutubeTimestampPublishing(false);
    }
  };

  const handleShareViewerLink = async () => {
    if (!live?.id) return;
    const url = `${window.location.origin}/live/${live.id}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: live?.title || 'Shinsa Live Session',
          text: live?.host?.username ? `Watch ${live.host.username}'s live session` : 'Watch this live session',
          url,
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        return;
      }

      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
    }
  };

  const flashOverlayCopyLabel = (label) => {
    setOverlayCopiedLabel(label);
    if (overlayCopyTimerRef.current) {
      window.clearTimeout(overlayCopyTimerRef.current);
    }
    overlayCopyTimerRef.current = window.setTimeout(() => {
      setOverlayCopiedLabel('');
      overlayCopyTimerRef.current = null;
    }, 2200);
  };

  const buildCurrentOverlayOptions = (overrides = {}) => ({
    preset: overlayPreset,
    theme: overlayTheme,
    fit: overlayFit,
    anchor: overlayAnchor,
    widgets: overlayWidgets,
    motion: overlayMotion,
    brandMotion: overlayBrandMotion,
    opacity: overlayOpacity,
    guides: overlayGuides,
    autoHide: overlayAutoHide,
    ...overrides,
  });

  const applyOverlayScene = (sceneId) => {
    const sceneOptions = getLiveOverlaySceneOptions(sceneId);
    if (!sceneOptions) return;
    setOverlayPreset(sceneOptions.preset);
    setOverlayTheme(sceneOptions.theme);
    setOverlayFit(sceneOptions.fit);
    setOverlayAnchor(sceneOptions.anchor);
    setOverlayWidgets(sceneOptions.widgets);
    setOverlayMotion(sceneOptions.motion);
    setOverlayBrandMotion(sceneOptions.brandMotion);
    setOverlayOpacity(sceneOptions.opacity);
    setOverlayGuides(sceneOptions.guides);
    setOverlayAutoHide(sceneOptions.autoHide);
    setStatusNote(`${LIVE_OVERLAY_SCENES.find((item) => item.id === sceneId)?.label || 'Overlay scene'} loaded into the studio.`);
  };

  const handleToggleOverlayWidget = (widgetId) => {
    setOverlayWidgets((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (current.includes(widgetId)) {
        return current.length > 1 ? current.filter((item) => item !== widgetId) : current;
      }
      return [...current, widgetId];
    });
  };

  const handleOpenOverlayPreview = () => {
    if (!overlayPreviewUrl) return;
    window.open(overlayPreviewUrl, '_blank', 'noopener,noreferrer');
  };

  const copyOverlayBrowserSource = async (options = {}, message = 'Overlay browser source copied.') => {
    if (!activeSessionId) return;
    setOverlayCopying(true);
    try {
      const data = await createLiveOverlayToken(activeSessionId);
      const finalOptions = buildCurrentOverlayOptions(options);
      const url = buildLiveOverlayUrl(activeSessionId, {
        ...finalOptions,
        token: data?.token || '',
        baseUrl: window.location.origin,
      });
      await navigator.clipboard.writeText(url);
      setOverlayTokenExpiresAt(data?.expires_at || '');
      flashOverlayCopyLabel(message);
      setStatusNote(
        data?.expires_at
          ? `${message}. Access token expires ${new Date(data.expires_at).toLocaleString()}.`
          : `${message}.`
      );
    } catch (err) {
      setError(err.message || 'Failed to copy overlay browser source');
    } finally {
      setOverlayCopying(false);
    }
  };

  const handleCopyOverlayBrowserSource = async () => {
    if (!overlayPreviewUrl) return;
    await copyOverlayBrowserSource({}, 'Browser source URL copied');
  };

  const handleCopyOverlayScene = async (sceneId) => {
    const sceneOptions = getLiveOverlaySceneOptions(sceneId);
    if (!sceneOptions) return;
    const sceneLabel = LIVE_OVERLAY_SCENES.find((item) => item.id === sceneId)?.label || 'Overlay scene';
    await copyOverlayBrowserSource({ ...sceneOptions, scene: sceneId }, `${sceneLabel} copied`);
  };

  const handleToggleWakeLock = async () => {
    if (!wakeLockSupported) {
      setError('Wake lock is not supported on this device.');
      return;
    }
    if (wakeLockRef.current || wakeLockActive) {
      await releaseWakeLock();
    } else {
      await requestWakeLock();
    }
  };

  const hostCanCreateVote = isHost && (!currentVote || currentVote.status !== 'active') && live?.status === 'live';
  const liveStatusText = String(live?.status_text || '').trim();
  const streamStatusLabel = streamState === 'live'
    ? 'Channel live'
    : streamState === 'reconnecting'
      ? 'Reconnecting'
      : streamState === 'connecting'
        ? 'Connecting'
        : 'Offline';
  const syncLabel = formatRelativeSyncTime(live?.last_sync_at);
  const desktopViewerColumns = 'xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]';
  const desktopSidebarColumns = 'lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]';
  const showCompactStreamEditor = isHost && activeSessionId && hostWorkspaceTab === 'stream';
  const showYoutubeChaptersTab = isHost && activeSessionId && !!youtubeId;
  const showLiveRoomWorkspace = hostWorkspaceTab !== 'overlay' && hostWorkspaceTab !== 'chapters';
  const viewerNowCount = live?.viewer_count || 0;
  const songCount = Array.isArray(snapshot?.plays) ? snapshot.plays.length : 0;
  const requestTabDisabled = !isHost && (!requestsEnabled || live?.status !== 'live');
  const voteTabDisabled = !isHost && !currentVote;
  const mobileRequestModalDisabled = false;
  const mobileVoteModalDisabled = false;
  const showOverlayStudioTab = isHost && activeSessionId;
  const voteSection = (
    <div className="space-y-4">
      {hostCanCreateVote ? (
        <div className="rounded-xl border border-piu-border/60 bg-piu-card/95 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
          <p className="text-[11px] font-display font-semibold text-gray-400">Start vote</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <select value={voteModeFilter} onChange={(e) => setVoteModeFilter(e.target.value)} className="input-field text-xs py-2">
              <option>All</option>
              <option>Single</option>
              <option>Double</option>
            </select>
            <input value={voteMinLevel} onChange={(e) => setVoteMinLevel(e.target.value)} className="input-field text-xs py-2" placeholder="Min" />
            <input value={voteMaxLevel} onChange={(e) => setVoteMaxLevel(e.target.value)} className="input-field text-xs py-2" placeholder="Max" />
          </div>
          <button type="button" onClick={handleCreateVote} disabled={creatingVote} className="btn-primary mt-3 w-full py-2.5 text-sm">
            {creatingVote ? 'Creating vote...' : 'Open 30 second vote'}
          </button>
        </div>
      ) : null}

      {currentVote ? (
        <PinnedVoteCard
          vote={currentVote}
          canVote={!isHost && live?.status === 'live'}
          onVote={handleCastVote}
          collapsed={votePinCollapsed}
          onToggle={() => setVotePinCollapsed((prev) => !prev)}
          label={currentVote.status === 'active' ? 'Pinned Vote' : 'Last Vote'}
        />
      ) : null}

      {!hostCanCreateVote && !currentVote ? (
        <div className="rounded-xl border border-dashed border-piu-border/60 bg-piu-card/90 px-4 py-5 text-sm text-gray-400">
          No live vote is open right now.
        </div>
      ) : null}
    </div>
  );

  const songsSection = (
    <div className="rounded-xl border border-piu-border/60 bg-piu-card/95 p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.18)] sm:p-3 lg:p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <p className="text-[11px] font-display font-semibold text-gray-400">Songs this session</p>
          <p className={`${isCompactSongCardLayout ? 'text-[13px]' : 'text-sm'} font-display font-bold text-white`}>{visiblePlays.length} visible plays</p>
        </div>
        <div className={`grid w-full gap-2 sm:w-auto ${showPerformerLabels ? 'grid-cols-1 sm:min-w-[500px] sm:grid-cols-3' : 'grid-cols-2 sm:min-w-[320px]'}`}>
          <select value={playModeFilter} onChange={(e) => setPlayModeFilter(e.target.value)} className={`input-field rounded-lg border border-piu-border/60 bg-piu-dark/60 ${isCompactSongCardLayout ? 'text-[11px] py-2 px-3' : 'text-xs py-2.5 px-3'}`}>
            <option>All</option>
            <option>Single</option>
            <option>Double</option>
          </select>
          {showPerformerLabels ? (
            <select value={playUserFilter} onChange={(e) => setPlayUserFilter(e.target.value)} className={`input-field rounded-lg border border-piu-border/60 bg-piu-dark/60 ${isCompactSongCardLayout ? 'text-[11px] py-2 px-3' : 'text-xs py-2.5 px-3'}`}>
              <option value="all">All players</option>
              {performerParticipants.map((participant) => (
                <option key={participant.user_id} value={participant.user_id}>{participant.username}</option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => setPlayPassOnly((prev) => !prev)}
            className={`rounded-lg border px-3 text-left transition-colors ${
              playPassOnly
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                : 'border-piu-border/60 bg-piu-dark/60 text-gray-300 hover:border-piu-accent/50 hover:text-white'
            } ${isCompactSongCardLayout ? 'py-2' : 'py-2.5'}`}
          >
            <p className="text-[11px] font-display font-semibold text-gray-300">Pass</p>
            <p className="mt-1 text-[11px]">{playPassOnly ? 'Showing passes only' : 'Showing all results'}</p>
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-2.5 xl:grid-cols-3 2xl:grid-cols-4">
        {visiblePlays.map((play) => {
          const requestInfo = requestLookup.get(buildRequestKey(play.song_title, play.mode, play.level));
          const requestStatus = requestInfo
            ? requestInfo.queuedCount > 0
              ? 'queued'
              : requestInfo.openCount > 0
                ? 'open'
                : requestInfo.playedCount > 0
                  ? 'played'
                  : 'skipped'
            : '';
          const parsedGrade = parseGrade(play.grade, getRank(play.score ?? 0).label);
          const displayGrade = parsedGrade.display || '-';
          const displayScore = parseInt(play.score, 10) || 0;
          return (
            <button
              type="button"
              key={play.id}
              onClick={() => setSelectedPlay(play)}
              className={`w-full rounded-lg border border-piu-border/60 bg-piu-dark/60 text-left transition-colors hover:border-piu-accent/50 ${
                isCompactSongCardLayout ? 'p-2.5' : 'p-3'
              }`}
            >
              <div className={`flex items-start ${isCompactSongCardLayout ? 'gap-2.5' : 'gap-3'}`}>
                <PiuChartJacket
                  title={play.song_title}
                  mode={play.mode}
                  level={play.level}
                  jacketUrl={play.background_url}
                  size={isCompactSongCardLayout ? 'sm' : 'md'}
                />
                <div className="min-w-0 flex-1">
                  <p className={`${isCompactSongCardLayout ? 'text-[10px]' : 'text-[11px]'} truncate font-display font-bold leading-tight text-white`}>{play.song_title}</p>
                  {showPerformerLabels && play?.username ? (
                    <UserIdentity
                      avatar={play.avatar}
                      username={play.username}
                      skillTitle={play.skill_title}
                      isHost={play.participant_role === 'owner'}
                      participantRole={play.participant_role}
                      className="mt-1.5"
                      compact={isCompactSongCardLayout}
                    />
                  ) : null}
                  <div className={`${isCompactSongCardLayout ? 'mt-2' : 'mt-3'}`}>
                    <div className={`flex items-baseline ${isCompactSongCardLayout ? 'gap-2' : 'gap-2.5'}`}>
                      <p
                        className={`${isCompactSongCardLayout ? 'text-base' : 'text-lg'} font-display font-black leading-none ${getGradeColor(displayGrade, displayScore)} ${parsedGrade.isBroken ? 'grade-broken' : ''}`}
                        data-grade={displayGrade}
                      >
                        {displayGrade}
                      </p>
                      <p className={`${isCompactSongCardLayout ? 'text-[10px]' : 'text-[11px]'} font-display font-bold text-cyan-300`}>{formatNumber(play.score)}</p>
                    </div>
                  </div>
                  <div className={`flex flex-wrap ${isCompactSongCardLayout ? 'mt-1.5 gap-1' : 'mt-2 gap-1.5'}`}>
                    {play.pumbility_gain > 0 ? (
                      <span className={`rounded-md border border-emerald-400/25 bg-emerald-500/10 font-display font-semibold text-emerald-200 ${isCompactSongCardLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
                        +{play.pumbility_gain} p
                      </span>
                    ) : null}
                    {play.over_top100_rank > 0 ? (
                      <span className={`rounded-md border border-yellow-400/25 bg-yellow-500/10 font-display font-semibold text-yellow-200 ${isCompactSongCardLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
                        Top 100 #{play.over_top100_rank}
                      </span>
                    ) : null}
                    {requestInfo ? (
                      <span className={`rounded-md font-display font-semibold ${isCompactSongCardLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} ${getRequestStatusMeta(requestStatus).pill}`}>
                        {formatRequestStateLabel(requestInfo)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {visiblePlays.length === 0 ? <p className="col-span-full text-sm text-gray-500">No plays match the current filter yet.</p> : null}
      </div>
    </div>
  );

  const requestsSection = (
    <div className="rounded-xl border border-piu-border/60 bg-piu-card/95 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-display font-semibold text-gray-400">Song requests</p>
          <p className="text-sm font-display font-bold text-white">
            {requestCounts.open} open • {requestCounts.queued} queued • {requestCounts.played} played
            {requestCounts.skipped ? ` • ${requestCounts.skipped} skipped` : ''}
          </p>
        </div>
        <span className={`rounded-md border px-3 py-1 text-[10px] font-display font-semibold ${
          live?.status !== 'live'
            ? 'border-piu-border/60 bg-piu-dark/60 text-gray-400'
            : requestsEnabled
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border-piu-border/60 bg-piu-dark/60 text-gray-400'
        }`}>
          {live?.status !== 'live' ? 'Closed' : requestsEnabled ? 'Open' : 'Disabled'}
        </span>
      </div>
      {isHost ? (
        <div className="mt-3 rounded-lg border border-piu-border/60 bg-piu-dark/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-display font-semibold text-gray-300">Request settings</p>
              <p className="mt-1 text-xs text-gray-300">Viewers can request {requestPolicySummary}.</p>
            </div>
            <button
              type="button"
              onClick={() => handleUpdateRequestSettings(
                { request_show_scores: !requestShowScores },
                !requestShowScores ? 'Player scores are now visible in request search.' : 'Player scores are now hidden in request search.'
              )}
              disabled={savingRequestPolicy || live?.status !== 'live'}
              className={`rounded-md border px-3 py-1.5 text-[10px] font-display font-semibold ${
                requestShowScores
                  ? 'border-emerald-400/35 bg-emerald-500/12 text-emerald-100'
                  : 'border-piu-border/60 bg-piu-dark/80 text-gray-400'
              } disabled:opacity-60`}
            >
              {savingRequestPolicy ? 'Saving...' : requestShowScores ? 'Scores shown' : 'Scores hidden'}
            </button>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-display font-semibold text-gray-400">Chart type</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REQUEST_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleUpdateRequestSettings(
                    { request_mode_filter: option.value },
                    `Request settings updated: ${formatRequestPolicySummary(option.value, requestMaxLevel)}.`
                  )}
                  disabled={savingRequestPolicy || live?.status !== 'live'}
                  className={`rounded-md border px-3 py-1.5 text-[11px] font-display font-semibold transition-colors ${
                    requestModeFilter === option.value
                      ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100'
                      : 'border-piu-border/60 bg-piu-dark/80 text-gray-400 hover:border-piu-accent/50 hover:text-white'
                  } disabled:opacity-60`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-display font-semibold text-gray-400">Max level</p>
            <select
              value={requestMaxLevel}
              onChange={(e) => handleUpdateRequestSettings(
                { request_max_level: parseInt(e.target.value, 10) || DEFAULT_REQUEST_MAX_LEVEL },
                `Request settings updated: ${formatRequestPolicySummary(requestModeFilter, e.target.value)}.`
              )}
              disabled={savingRequestPolicy || live?.status !== 'live'}
              className="input-field mt-2 w-full text-xs py-2"
            >
              {REQUEST_MAX_LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>Lv. {level}</option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      {performerParticipants.length > 1 ? (
        <div className="mt-3 rounded-lg border border-piu-border/60 bg-piu-dark/60 p-3">
          <p className="text-[11px] font-display font-semibold text-gray-300">Request target</p>
          <p className="mt-1 text-xs text-gray-400">Leave it on any player, or aim the request at one co-host.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRequestTargetUserId('')}
              disabled={live?.status !== 'live' || viewerState.requests_blocked || (!requestsEnabled && !isHost)}
              className={`rounded-md border px-3 py-1.5 text-[10px] font-display font-semibold ${
                !requestTargetUserId
                  ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100'
                  : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
              } disabled:opacity-60`}
            >
              Any player
            </button>
            {performerParticipants.map((participant) => (
              <button
                key={participant.user_id}
                type="button"
                onClick={() => setRequestTargetUserId(participant.user_id)}
                disabled={live?.status !== 'live' || viewerState.requests_blocked || (!requestsEnabled && !isHost)}
                className={`rounded-md border px-3 py-1.5 text-[10px] font-display font-semibold ${
                  requestTargetUserId === participant.user_id
                    ? 'border-fuchsia-400/35 bg-fuchsia-500/12 text-fuchsia-100'
                    : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
                } disabled:opacity-60`}
              >
                {participant.username}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <input
        value={songSearch}
        onChange={(e) => setSongSearch(e.target.value)}
        className="input-field w-full mt-3"
        placeholder={
          live?.status !== 'live'
            ? 'Requests are closed'
            : !requestsEnabled && !isHost
              ? 'Host has not enabled requests'
            : viewerState.requests_blocked
              ? 'Host has blocked your requests'
              : requestShowScores
                ? 'Search songs or use /d22 or /s21'
                : 'Search songs to request'
        }
        disabled={live?.status !== 'live' || viewerState.requests_blocked || (!requestsEnabled && !isHost)}
      />
      {live?.status === 'live' ? (
        <p className="mt-2 text-[11px] text-gray-400">
          Room is taking {requestPolicySummary}.
          {requestShowScores
            ? ' Player scores are shown on chart buttons. Use /d22 or /s21 to browse one level like the tiers page.'
            : ' Player scores are hidden.'}
          {requestTargetParticipant?.username ? ` Requests will target ${requestTargetParticipant.username}.` : ''}
        </p>
      ) : null}
      {requestShortcutSearch && (!requestShowScores || performerParticipants.length === 0) ? (
        <p className="mt-2 text-[11px] text-amber-200">
          Slash chart search is only available when player scores are visible in this room.
        </p>
      ) : null}
      {!isHost && !requestsEnabled && live?.status === 'live' ? (
        <p className="mt-2 text-[11px] text-gray-400">The host has not enabled song requests for this session.</p>
      ) : null}
      {!isHost && viewerState.requests_blocked ? (
        <p className="mt-2 text-[11px] text-fuchsia-200">The host has disabled requests from your account for this session.</p>
      ) : null}
      {searchingSongs ? <p className="text-[11px] text-gray-500 mt-2">Searching...</p> : null}
      <div className="space-y-2 mt-3">
        {requestShortcutSearch && shortcutChartSummary?.total > 0 ? (
          <div className="rounded-xl border border-piu-border/60 bg-piu-dark/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-display font-semibold text-gray-300">
                  {modeShort(requestShortcutSearch.mode)}{requestShortcutSearch.level} chart search
                </p>
                <p className="mt-1 text-[11px] text-gray-400">
                  {shortcutChartSummary.total} chart{shortcutChartSummary.total === 1 ? '' : 's'} matched
                  {shortcutChartSummary.played ? ` • ${shortcutChartSummary.played} played live` : ''}
                  {shortcutChartSummary.unpassed ? ` • ${shortcutChartSummary.unpassed} not yet passed` : ''}
                  {shortcutChartSummary.unsynced ? ` • ${shortcutChartSummary.unsynced} without synced scores` : ''}
                </p>
              </div>
              <span className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-display font-bold text-cyan-100">
                Tier view
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {shortcutChartResults.map((chart) => {
                const chartKey = buildRequestKey(chart.song_title, chart.mode, chart.level);
                return (
                  <SongRequestTierShortcutResult
                    key={`${chart.song_group_key}-${chart.chart_id}-${chart.mode}-${chart.level}`}
                    chart={chart}
                    disabled={live?.status !== 'live' || viewerState.requests_blocked || (!requestsEnabled && !isHost)}
                    onSelectChart={handleLiveRequest}
                    showHostScores={requestShowScores}
                    requestInfo={requestLookup.get(chartKey) || null}
                    livePlayInfo={livePlayLookup.get(chartKey) || null}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
        {!requestShortcutSearch ? songResults.map((song) => (
          <SongRequestSearchResult
            key={song.song_group_key}
            song={song}
            disabled={live?.status !== 'live' || viewerState.requests_blocked || (!requestsEnabled && !isHost)}
            onSelectChart={handleLiveRequest}
            showHostScores={requestShowScores}
            requestLookup={requestLookup}
            livePlayLookup={livePlayLookup}
          />
        )) : null}
        {!searchingSongs && (
          (requestShortcutSearch && (!requestShowScores || performerParticipants.length === 0))
            ? null
            : ((requestShortcutSearch && shortcutChartResults.length === 0)
              || (!requestShortcutSearch && deferredSongSearch.trim().length >= 2 && songResults.length === 0))
        ) ? (
          <p className="rounded-xl border border-piu-border/60 bg-black/10 px-3 py-4 text-center text-sm text-gray-500">
            {requestShortcutSearch
              ? 'No charts matched that mode and level within this room\'s request settings.'
              : 'No songs matched that search within this room\'s request settings.'}
          </p>
        ) : null}
      </div>
      <div className="space-y-2 mt-4">
        {requests.slice(0, 10).map((request) => {
          const requestStatus = getRequestStatus(request.status, request.fulfilled);
          const requestMeta = getRequestStatusMeta(requestStatus, request.fulfilled);
          return (
            <div key={request.id} className={`rounded-lg border px-3 py-2 ${requestMeta.card}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <UserIdentity
                    avatar={request.avatar}
                    username={request.username}
                    skillTitle={request.skill_title}
                    isHost={request.is_host}
                    participantRole={request.participant_role}
                    className="mb-2"
                  />
                  <p className="text-xs font-display font-bold text-white">{request.song_title}</p>
                  <p className="text-[11px] text-gray-400">
                    {modeShort(request.mode)}{request.level}
                    {request.queue_position ? ` • Queue #${request.queue_position}` : ''}
                    {request.target_username ? ` • Target ${request.target_username}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-display font-semibold ${requestMeta.pill}`}>
                  {requestMeta.label}
                </span>
              </div>
              {isHost && live?.status === 'live' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {requestStatus !== 'queued' ? (
                    <button
                      type="button"
                      onClick={() => handleSetRequestStatus(request, 'queued')}
                      disabled={requestActionKey === `${request.id}:queued`}
                      className="rounded-lg bg-piu-dark px-3 py-2 text-[11px] font-display font-bold text-gray-200 transition-colors hover:text-white disabled:opacity-60"
                    >
                      {requestActionKey === `${request.id}:queued` ? 'Updating...' : 'Queue'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetRequestStatus(request, 'open')}
                      disabled={requestActionKey === `${request.id}:open`}
                      className="rounded-lg bg-piu-dark px-3 py-2 text-[11px] font-display font-bold text-gray-200 transition-colors hover:text-white disabled:opacity-60"
                    >
                      {requestActionKey === `${request.id}:open` ? 'Updating...' : 'Move open'}
                    </button>
                  )}
                  {requestStatus !== 'played' ? (
                    <button
                      type="button"
                      onClick={() => handleFulfillRequest(request)}
                      disabled={requestActionKey === `${request.id}:played`}
                      className="rounded-lg bg-emerald-500/15 px-3 py-2 text-[11px] font-display font-bold text-emerald-200 transition-colors hover:text-white disabled:opacity-60"
                    >
                      {requestActionKey === `${request.id}:played` ? 'Updating...' : 'Mark played'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetRequestStatus(request, 'open')}
                      disabled={requestActionKey === `${request.id}:open`}
                      className="rounded-lg bg-piu-dark px-3 py-2 text-[11px] font-display font-bold text-gray-200 transition-colors hover:text-white disabled:opacity-60"
                    >
                      {requestActionKey === `${request.id}:open` ? 'Updating...' : 'Reopen'}
                    </button>
                  )}
                  {requestStatus !== 'skipped' ? (
                    <button
                      type="button"
                      onClick={() => handleSetRequestStatus(request, 'skipped')}
                      disabled={requestActionKey === `${request.id}:skipped`}
                      className="rounded-lg bg-amber-500/15 px-3 py-2 text-[11px] font-display font-bold text-amber-200 transition-colors hover:text-white disabled:opacity-60"
                    >
                      {requestActionKey === `${request.id}:skipped` ? 'Updating...' : 'Skip'}
                    </button>
                  ) : null}
                  {!request.is_host ? (
                    <button
                      type="button"
                      onClick={() => handleToggleModeration(request, 'requests_blocked')}
                      disabled={moderationActionKey === `requests_blocked:${request.user_id}`}
                      className="rounded-lg bg-fuchsia-500/15 px-3 py-2 text-[11px] font-display font-bold text-fuchsia-200 transition-colors hover:text-white disabled:opacity-60"
                    >
                      {moderationActionKey === `requests_blocked:${request.user_id}`
                        ? 'Updating...'
                        : request.requests_blocked
                          ? 'Allow requests'
                          : 'Block requests'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {requests.length === 0 ? <p className="text-sm text-gray-500">No requests yet.</p> : null}
      </div>
    </div>
  );

  const desktopInteractionsSection = (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-piu-border/60 bg-piu-card/95 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <div className={`gap-2 ${isDesktopViewport ? 'flex flex-wrap items-start justify-between' : 'flex flex-col items-start'}`}>
        <div className="min-w-0">
          <p className="text-[11px] font-display font-semibold text-gray-400">Interactions</p>
        </div>
        {isHost ? (
          <button
            type="button"
            onClick={handleToggleRequestsEnabled}
            disabled={savingRequestsEnabled || live?.status !== 'live'}
            className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-[8px] font-display font-semibold ${
              requestsEnabled
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                : 'border-piu-border/60 bg-piu-dark/60 text-gray-400'
            } disabled:opacity-60`}
          >
            {savingRequestsEnabled ? 'Saving...' : requestsEnabled ? 'Requests on' : 'Requests off'}
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            if (isDesktopViewport) {
              if (requestTabDisabled) return;
              setMobilePanel((prev) => (prev === 'requests' ? '' : 'requests'));
            } else {
              setMobilePanel('requests');
            }
          }}
          disabled={isDesktopViewport ? requestTabDisabled : mobileRequestModalDisabled}
          className={`min-w-0 rounded-lg border px-2.5 py-2.5 text-left transition-colors ${
            mobilePanel === 'requests' && !(isDesktopViewport ? requestTabDisabled : mobileRequestModalDisabled)
              ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
              : (isDesktopViewport ? requestTabDisabled : mobileRequestModalDisabled)
                ? 'border-piu-border/60 bg-piu-dark/60 text-gray-500'
                : 'border-piu-border/60 bg-piu-dark/60 text-gray-300 hover:border-piu-accent/50 hover:text-white'
          }`}
        >
          <p className="text-[11px] font-display font-semibold text-white">Requests</p>
          <p className="mt-1 text-[10px] leading-tight">
            {isDesktopViewport && requestTabDisabled ? 'Waiting for host' : `${requestCounts.open} open`}
          </p>
        </button>
        <button
          type="button"
          onClick={() => {
            if (isDesktopViewport) {
              if (voteTabDisabled) return;
              setMobilePanel((prev) => (prev === 'vote' ? '' : 'vote'));
            } else {
              setMobilePanel('vote');
            }
          }}
          disabled={isDesktopViewport ? voteTabDisabled : mobileVoteModalDisabled}
          className={`min-w-0 rounded-lg border px-2.5 py-2.5 text-left transition-colors ${
            mobilePanel === 'vote' && !(isDesktopViewport ? voteTabDisabled : mobileVoteModalDisabled)
              ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
              : (isDesktopViewport ? voteTabDisabled : mobileVoteModalDisabled)
                ? 'border-piu-border/60 bg-piu-dark/60 text-gray-500'
                : 'border-piu-border/60 bg-piu-dark/60 text-gray-300 hover:border-piu-accent/50 hover:text-white'
          }`}
        >
          <p className="text-[11px] font-display font-semibold text-white">Vote</p>
          <p className="mt-1 text-[10px] leading-tight">
            {isDesktopViewport && voteTabDisabled ? 'No active vote' : currentVote?.status === 'active' ? 'Live now' : 'Available'}
          </p>
        </button>
      </div>
    </div>
  );

  const desktopTopCardsSection = isDesktopViewport ? (
    <div className="grid items-stretch gap-4 lg:grid-cols-2 lg:gap-5">
      <NowPlayingPanel
        play={lastPlay}
        live={live}
        requestInfo={nowPlayingRequestInfo}
        onOpen={() => lastPlay && setSelectedPlay(lastPlay)}
        showPerformer={showPerformerLabels}
      />
      {desktopInteractionsSection}
    </div>
  ) : null;

  const youtubeTimestampsSection = isHost && youtubeId ? (
    <YoutubeTimestampsCard
      data={youtubeTimestampPreview}
      loading={youtubeTimestampLoading}
      publishing={youtubeTimestampPublishing}
      copiedLabel={youtubeTimestampCopiedLabel}
      onRefresh={() => loadYoutubeTimestampPreview(activeSessionId)}
      onCopy={handleCopyYoutubeTimestamps}
      onPublish={handlePublishYoutubeTimestamps}
    />
  ) : null;

  const chatSection = (
    <div
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-piu-border/60 bg-piu-card/95 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.18)] ${
        useDesktopViewerLayout
          ? 'h-full min-h-0'
          : isMobileChatLayout
            ? 'min-h-0'
            : 'min-h-0'
      }`}
      style={
        desktopMediaHeightStyle
          ? desktopMediaHeightStyle
          : useDesktopSidebarLayout
            ? { height: 'calc(100dvh - 7rem)', maxHeight: 'calc(100dvh - 7rem)' }
            : isMobileChatLayout
              ? { maxHeight: 'min(68dvh, calc(100dvh - 10rem))' }
              : {
                  height: desktopChatFallbackHeight,
                  maxHeight: desktopChatFallbackHeight,
                  minHeight: desktopChatFallbackHeight,
                }
      }
    >
      {reactionBursts.map((burst) => (
        <div key={burst.id} className="live-reaction-burst" style={{ left: `${burst.x}%` }}>
          {burst.particles.map((particle) => (
            <span
              key={particle.id}
              className="live-reaction-burst__particle"
              style={{
                '--dx': particle.dx,
                '--dy': particle.dy,
                '--size': particle.size,
                '--color': particle.color,
              }}
            />
          ))}
        </div>
      ))}

      {floatingReactions.map((reaction) => (
        <div
          key={reaction.id}
          className="absolute pointer-events-none z-10 animate-float-up"
          style={{ left: `${reaction.x}%`, bottom: '88px' }}
        >
          {reaction.reaction?.kind === 'emote'
            ? <LiveEmote emote={reaction.reaction.emote} size="reaction" />
            : <span style={{ fontSize: '24px' }}>{reaction.reaction?.emoji || ''}</span>}
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-display font-semibold text-gray-400">Live chat</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleQuickReaction(emoji)}
              disabled={viewerState.chat_muted || live?.status !== 'live'}
              className="h-8 w-8 rounded-md border border-piu-border/60 bg-piu-dark/80 text-sm transition-colors hover:border-piu-accent/50 hover:text-white disabled:opacity-40"
            >
              {emoji}
            </button>
          ))}
          {!isMobileChatLayout ? (
            <button
              type="button"
              onClick={() => setShowEmoteTray((prev) => !prev)}
              disabled={viewerState.chat_muted || live?.status !== 'live'}
              className={`rounded-md border px-2.5 py-1.5 text-[10px] font-display font-semibold transition-colors ${
                showEmoteTray
                  ? 'border-rose-400/30 bg-rose-500/12 text-rose-100'
                  : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
              } disabled:opacity-40`}
            >
              Emotes
            </button>
          ) : null}
        </div>
      </div>

      {currentVote ? (
        <div className="mt-3">
          <PinnedVoteCard
            vote={currentVote}
            canVote={!isHost && live?.status === 'live'}
            onVote={handleCastVote}
            collapsed={votePinCollapsed}
            onToggle={() => setVotePinCollapsed((prev) => !prev)}
            label="Pinned Vote"
          />
        </div>
      ) : null}

      {showEmoteTray && live?.status === 'live' ? (
        <div className={`min-h-0 overflow-hidden rounded-lg border border-piu-border/60 bg-piu-dark/95 p-3 ${
          isMobileChatLayout
            ? 'absolute inset-x-3 bottom-[4.25rem] z-30 shadow-[0_18px_48px_rgba(0,0,0,0.42)]'
            : 'mt-3'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-display font-semibold text-gray-300">Chat tray</p>
              <p className="mt-1 text-[11px] text-gray-400">
                {activeEmoteTrayTab === 'stickers'
                  ? 'Tap a sticker to add it to your live chat message.'
                  : 'React instantly, or add a Shinsa emote into your message.'}
              </p>
              <div className="mt-3 inline-flex rounded-xl border border-piu-border/60 bg-piu-card/80 p-1">
                {LIVE_CHAT_TRAY_TABS.map((tab) => {
                  const isActive = activeEmoteTrayTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveEmoteTrayTab(tab.id)}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-display font-semibold transition-colors ${
                        isActive
                          ? 'bg-cyan-400/15 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)]'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button type="button" onClick={() => setShowEmoteTray(false)} className="text-[11px] text-gray-500 hover:text-white">
              Close
            </button>
          </div>

          <div
            className={`mt-3 min-h-0 overflow-y-auto overscroll-contain pr-1 ${
              isMobileChatLayout
                ? 'max-h-[min(32dvh,18rem)]'
                : 'max-h-[52vh] lg:max-h-64 xl:max-h-72'
            }`}
            style={isMobileChatLayout ? { WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' } : undefined}
          >
            {activeEmoteTrayTab === 'stickers' ? (
              <div className="grid gap-3">
                {STICKER_GROUPS.map((group) => (
                  <div key={group.label} className="rounded-2xl border border-piu-border/50 bg-piu-dark/55 p-3">
                    <div className="px-1">
                      <p className="text-[11px] font-display font-semibold text-gray-300">{group.label}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                      {group.emojis.map((sticker) => (
                        <LiveStickerTrayTile
                          key={sticker.id}
                          sticker={sticker}
                          disabled={viewerState.chat_muted || live?.status !== 'live'}
                          onAdd={() => handleInsertChatToken(sticker.token)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {LIVE_EMOTE_TRAY_GROUPS.map((group) => (
                  <div key={group.label} className="mt-3 first:mt-0">
                    <div className="px-1">
                      <p className="text-[11px] font-display font-semibold text-gray-300">{group.label}</p>
                      {group.description ? <p className="mt-1 text-[11px] text-gray-400">{group.description}</p> : null}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 xl:grid-cols-4">
                      {group.emotes.map((emote) => (
                        <LiveEmoteTrayTile
                          key={emote.token}
                          emote={emote}
                          disabled={viewerState.chat_muted || live?.status !== 'live'}
                          onReact={() => handleQuickReaction(emote.token)}
                          onAdd={() => handleInsertChatToken(emote.token)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}

      <div
        ref={chatScrollRef}
        className={`mt-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${
          isMobileChatLayout ? 'pr-0.5' : 'pr-1'
        } ${isDesktopViewport ? 'space-y-1.5' : 'space-y-2'}`}
        style={isMobileChatLayout
          ? { WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }
          : { scrollbarGutter: 'stable' }}
      >
        {chatMessages.map((msg) => {
          const tone = getMessageTone(msg);
          const canPump = canPumpLiveMessage(msg);
          const isPumpingMessage = messagePumpActionKey === msg.id;
          const pumpButtonClasses = msg.user_pumped
            ? 'border-piu-gold/35 bg-piu-gold/10 text-piu-gold'
            : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-gold/35 hover:text-piu-gold';
          return (
            <div key={msg.id} className={`overflow-hidden ${isMobileChatLayout ? 'rounded-lg px-2.5 py-2' : isDesktopViewport ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-3 py-2'} ${tone.wrapper}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  {tone.label ? (
                    <span className={`shrink-0 rounded-md font-display font-semibold ${tone.labelClass} ${isMobileChatLayout ? 'px-1.5 py-0.5 text-[9px]' : isDesktopViewport ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
                      {tone.label}
                    </span>
                  ) : null}
                  {msg.is_system ? (
                    <p className={`truncate ${isMobileChatLayout ? 'text-[10px]' : isDesktopViewport ? 'text-[10px]' : 'text-[11px]'} font-display font-bold ${tone.usernameClass}`}>
                      {msg.username || 'System'}
                    </p>
                  ) : (
                    <UserIdentity
                      avatar={msg.avatar}
                      username={msg.username}
                      skillTitle={msg.skill_title}
                      isHost={msg.is_host}
                      participantRole={msg.participant_role}
                      compact={isMobileChatLayout}
                      dense={isDesktopViewport}
                    />
                  )}
                  {isHost && !msg.is_system && msg.chat_muted ? (
                    <span className={`rounded-md border border-amber-400/30 bg-amber-500/10 font-display font-semibold text-amber-200 ${isMobileChatLayout ? 'px-1.5 py-0.5 text-[8px]' : isDesktopViewport ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'}`}>
                      Muted
                    </span>
                  ) : null}
                  {isHost && !msg.is_system && msg.requests_blocked ? (
                    <span className={`rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10 font-display font-semibold text-fuchsia-200 ${isMobileChatLayout ? 'px-1.5 py-0.5 text-[8px]' : isDesktopViewport ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'}`}>
                      Requests off
                    </span>
                  ) : null}
                </div>
                <p className={`shrink-0 ${isMobileChatLayout ? 'text-[9px]' : isDesktopViewport ? 'text-[9px]' : 'text-[10px]'} text-gray-500`}>
                  {msg.created_at ? new Date(`${msg.created_at}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
              <div className={`min-w-0 ${canPump ? 'mt-2 flex items-start gap-2' : ''}`}>
                <div className="min-w-0 flex-1">
                  <MessageBody entry={msg} tone={tone} compact={isMobileChatLayout} dense={isDesktopViewport} />
                </div>
                {canPump ? (
                  <button
                    type="button"
                    onClick={() => handlePumpChatMessage(msg)}
                    disabled={isPumpingMessage}
                    className={`mt-1 inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-display font-bold transition-colors disabled:opacity-60 ${pumpButtonClasses}`}
                    title={msg.user_pumped ? 'Un-pump' : 'Pump it up!'}
                  >
                    <img
                      src={msg.user_pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'}
                      alt=""
                      className={`h-4 w-4 ${isPumpingMessage ? 'animate-bounce' : ''}`}
                    />
                    {msg.pump_count > 0 ? <span>{msg.pump_count}</span> : null}
                  </button>
                ) : null}
              </div>
              {isHost && live?.status === 'live' && !msg.is_system && !msg.is_host ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(msg.id)}
                    disabled={deletingMessageId === msg.id}
                    className="rounded-md border border-piu-border/60 bg-piu-dark/80 px-3 py-1.5 text-[10px] font-display font-semibold text-gray-300 transition-colors hover:border-piu-accent/35 hover:text-white disabled:opacity-60"
                  >
                    {deletingMessageId === msg.id ? 'Removing...' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleModeration(msg, 'chat_muted')}
                    disabled={moderationActionKey === `chat_muted:${msg.user_id}`}
                    className="rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-[10px] font-display font-semibold text-amber-200 transition-colors hover:border-amber-300/30 hover:text-white disabled:opacity-60"
                  >
                    {moderationActionKey === `chat_muted:${msg.user_id}`
                      ? 'Updating...'
                      : msg.chat_muted
                        ? 'Unmute chat'
                        : 'Mute chat'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleModeration(msg, 'requests_blocked')}
                    disabled={moderationActionKey === `requests_blocked:${msg.user_id}`}
                    className="rounded-md border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-1.5 text-[10px] font-display font-semibold text-fuchsia-200 transition-colors hover:border-fuchsia-300/30 hover:text-white disabled:opacity-60"
                  >
                    {moderationActionKey === `requests_blocked:${msg.user_id}`
                      ? 'Updating...'
                      : msg.requests_blocked
                        ? 'Allow requests'
                        : 'Block requests'}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {live?.status === 'live' ? (
        <form onSubmit={handleSendChat} className="mt-3 flex gap-2">
          <input
            ref={chatInputRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className={`input-field flex-1 ${isMobileChatLayout ? 'text-base' : ''}`}
            placeholder={viewerState.chat_muted ? 'Host has muted your chat' : 'Send a message or use :shinsa_hype:'}
            maxLength={500}
            disabled={viewerState.chat_muted}
          />
          {isMobileChatLayout ? (
            <button
              type="button"
              onClick={() => setShowEmoteTray((prev) => !prev)}
              disabled={viewerState.chat_muted || live?.status !== 'live'}
              aria-label={showEmoteTray ? 'Close emotes' : 'Open emotes'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                showEmoteTray
                  ? 'border-rose-400/30 bg-rose-500/12 text-rose-100'
                  : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
              } disabled:opacity-40`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 14h.01M16 14h.01M8.5 9.5h7M12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9-9 4.03-9 9c0 1.71.48 3.31 1.31 4.67.18.29.23.64.13.97L3.5 21l3.71-.95c.33-.08.68-.03.97.13A8.95 8.95 0 0 0 12 21Z" />
              </svg>
            </button>
          ) : null}
          <button type="submit" disabled={sendingChat || viewerState.chat_muted} className="btn-primary px-4 disabled:opacity-50">
            {sendingChat ? '...' : 'Send'}
          </button>
        </form>
      ) : (
        <p className="text-[11px] text-gray-500 mt-3">Chat is read-only because this session has ended.</p>
      )}
      {live?.status === 'live' && !isHost && viewerState.chat_muted ? (
        <p className="mt-2 text-[11px] text-amber-200">The host has muted your chat for this session.</p>
      ) : null}
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-piu-border/60 bg-piu-card/95 p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
          <p className="text-sm text-gray-400">You need a Shinsa account to join Shinsa Live.</p>
          <Link to="/login" className="btn-primary inline-flex mt-4">Log In</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="py-12 text-center text-gray-400 font-display">Loading Shinsa Live...</div>;
  }

  if (!live && sessionId && !error) {
    return <div className="py-12 text-center text-gray-400 font-display">Loading live session...</div>;
  }

  if (!live && !sessionId) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 sm:px-8 xl:px-10">
        {error ? <p className="mb-4 text-sm text-red-300">{error}</p> : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
          <CreateSessionCard
            title={createTitle}
            streamUrl={createStreamUrl}
            youtubeConnection={youtubeConnection}
            youtubeBroadcasts={youtubeBroadcasts}
            youtubeLoading={youtubeStatusLoading || youtubeBroadcastsLoading}
            selectedBroadcastId={createYoutubeBroadcastId}
            statusText={createStatusText}
            creating={creating}
            onConnectYoutube={handleConnectYoutube}
            onRefreshYoutube={loadYoutubeBroadcastOptions}
            onSelectBroadcast={setCreateYoutubeBroadcastId}
            onTitleChange={setCreateTitle}
            onStreamUrlChange={setCreateStreamUrl}
            onStatusTextChange={setCreateStatusText}
            onSubmit={handleCreate}
          />

          <div className="rounded-xl border border-piu-border/60 bg-piu-card/95 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
            <p className="text-sm font-display font-semibold text-gray-300">Live directory</p>
            <h2 className="mt-2 text-2xl font-display font-black text-white">
              {directorySessions.length > 0 ? `${directorySessions.length} room${directorySessions.length === 1 ? '' : 's'} live right now` : 'No live rooms at the moment'}
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Followed players float to the top, viewer counts stay fresh, and each card shows the latest chart, requests, and vote state before you join.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-piu-border/60 bg-piu-dark/70 p-3">
                <p className="text-[11px] font-display font-semibold text-gray-400">Following live</p>
                <p className="mt-1 text-2xl font-display font-black text-rose-100">{followedDirectorySessions.length}</p>
              </div>
              <div className="rounded-lg border border-piu-border/60 bg-piu-dark/70 p-3">
                <p className="text-[11px] font-display font-semibold text-gray-400">Open sessions</p>
                <p className="mt-1 text-2xl font-display font-black text-white">{directorySessions.length}</p>
              </div>
              <div className="rounded-lg border border-piu-border/60 bg-piu-dark/70 p-3">
                <p className="text-[11px] font-display font-semibold text-gray-400">Viewer accounts</p>
                <p className="mt-1 text-2xl font-display font-black text-amber-100">
                  {directorySessions.reduce((sum, item) => sum + (parseInt(item?.session?.viewer_count, 10) || 0), 0)}
                </p>
              </div>
            </div>
            {directoryLoading ? <p className="mt-4 text-sm text-gray-500">Refreshing live rooms...</p> : null}
            {directoryError ? <p className="mt-4 text-sm text-red-300">{directoryError}</p> : null}
          </div>
        </div>

        <DirectorySection
          title="Following Live"
          subtitle="Players you already follow are surfaced first so you can jump straight into rooms you care about."
          sessions={followedDirectorySessions}
        />

        <DirectorySection
          title={followedDirectorySessions.length > 0 ? 'More Live Rooms' : 'Live Now'}
          subtitle="Browse every active Shinsa Live room, sorted by follow state and audience."
          sessions={followedDirectorySessions.length > 0 ? otherDirectorySessions : directorySessions}
        />

        {!directoryLoading && directorySessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-piu-border/60 bg-piu-card/95 px-5 py-8 text-center">
            <p className="text-lg font-display font-black text-white">Be the first room on the board.</p>
            <p className="mt-2 text-sm text-gray-400">
              Start a Shinsa Live session and your followers will get a go-live notification with a direct link into the room.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  if (error && !live) {
    return <div className="py-12 text-center text-red-300">{error}</div>;
  }

    return (
      <div className="mx-auto max-w-[1760px] space-y-4 overflow-x-hidden px-4 py-4 sm:px-8 xl:px-10 2xl:px-14">
      <div className="rounded-xl border border-piu-border/60 bg-piu-card/95 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.2)] sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between">
          <div className="min-w-0 w-full md:flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-display font-semibold text-gray-300">Live session</p>
                <h1 className="mt-0.5 text-2xl font-display font-black text-white sm:text-3xl">
                  {live?.title || 'Live session'}
                </h1>
              </div>
              {liveStatusText || isHost ? (
                <div className="w-[10rem] shrink-0 md:hidden">
                  <LiveHeaderStatusStrip
                    isHost={isHost}
                    liveStatusText={liveStatusText}
                    statusText={editStatusText}
                    saving={savingStatusText}
                    compact
                    onChange={setEditStatusText}
                    onSubmit={handleUpdateStatusText}
                  />
                </div>
              ) : null}
            </div>
            <p className={`text-sm text-gray-400 mt-1 ${isDesktopViewport ? '' : 'hidden'}`}>
              {live?.host?.username
                ? `Hosted by ${live.host.username}${performerParticipants.length > 1 ? ` + ${performerParticipants.length - 1} co-host${performerParticipants.length - 1 === 1 ? '' : 's'}` : ''}`
                : 'Live session'}
              {live?.status === 'ended' ? ' • ended' : ' • live'}
            </p>
            {performerParticipants.length > 0 ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-start gap-2">
                  {performerParticipants.map((participant) => (
                    <div key={participant.user_id} className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-2.5 py-2">
                      <UserIdentity
                        avatar={participant.avatar}
                        username={participant.username}
                        skillTitle={participant.skill_title}
                        isHost={participant.role === 'owner'}
                        participantRole={participant.role}
                        compact
                      />
                    </div>
                  ))}
                  {showCohostControl ? (
                    <div className="ml-auto flex min-w-[7.25rem] shrink-0">
                      {showCohostManager ? (
                        <div className="flex w-[11.5rem] items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-2 text-cyan-100 shadow-[0_2px_8px_rgba(34,211,238,0.14)] sm:w-[13rem] lg:w-[16rem] xl:w-[18rem]">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-3.5-3.5" />
                          </svg>
                          <input
                            ref={cohostSearchInputRef}
                            value={cohostSearch}
                            onChange={(e) => setCohostSearch(e.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-white placeholder:text-cyan-100/55 focus:outline-none"
                            placeholder="Search player"
                            maxLength={80}
                            aria-label="Search player for co-host"
                          />
                          <button
                            type="button"
                            onClick={toggleCohostManager}
                            className="rounded-md border border-white/10 bg-black/15 p-1 text-cyan-100/80 transition-colors hover:text-white"
                            aria-label="Close co-host search"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M6 6 18 18" />
                              <path d="M18 6 6 18" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={toggleCohostManager}
                          className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-piu-border/60 bg-piu-card/70 px-2.5 py-2 text-left transition-colors hover:border-cyan-400/35 hover:text-white"
                        >
                          <span className="text-[11px] font-display font-semibold text-gray-200">Co-host</span>
                          <span className="rounded-md border border-piu-border/60 bg-piu-dark/80 px-1.5 py-0.5 text-[10px] font-display font-semibold text-gray-300">
                            {cohostParticipants.length}
                          </span>
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                {showCohostControl && showCohostManager ? (
                  <div className="mt-2 w-full max-w-[32rem] rounded-lg border border-piu-border/60 bg-piu-dark/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-display font-semibold text-gray-300">Co-hosts</p>
                      <span className="rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[10px] font-display font-semibold text-gray-300">
                        {cohostParticipants.length} active
                      </span>
                    </div>
                    {cohostParticipants.length > 0 ? (
                      <div className="mt-2">
                        <CohostParticipantList
                          participants={cohostParticipants}
                          actionUserId={cohostActionUserId}
                          onRemove={handleRemoveCohost}
                          compact
                        />
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-gray-500">No co-hosts yet. Search for a player above to add one.</p>
                    )}
                    {searchingCohosts ? <p className="mt-2 text-[11px] text-gray-500">Searching players...</p> : null}
                    {!searchingCohosts && cohostSearch.trim().length > 0 && cohostResults.length === 0 ? (
                      <p className="mt-2 text-[11px] text-gray-500">No available players matched that search.</p>
                    ) : null}
                    <div className="mt-2">
                      <CohostSearchResults
                        results={cohostResults}
                        actionUserId={cohostActionUserId}
                        onAdd={handleAddCohost}
                        compact
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-col items-start gap-1.5 md:w-auto md:max-w-[30rem] md:shrink-0 md:items-end">
            {!isDesktopViewport ? (
              <p className="text-xs text-left text-gray-400">
                {live?.host?.username
                  ? `Hosted by ${live.host.username}${performerParticipants.length > 1 ? ` + ${performerParticipants.length - 1} co-host${performerParticipants.length - 1 === 1 ? '' : 's'}` : ''}`
                  : 'Live session'}
                {syncLabel ? ` • ${syncLabel}` : ''}
              </p>
            ) : null}
            <div className="flex w-full flex-wrap items-center gap-1.5 justify-start md:w-auto md:justify-end">
              {mobileVideoLockAvailable ? (
                <button
                  type="button"
                  onClick={() => setLockVideo((prev) => !prev)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-display font-semibold transition-colors ${
                    lockVideo
                      ? 'border-cyan-400/30 bg-cyan-500/12 text-cyan-100'
                      : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
                  }`}
                >
                  {lockVideo ? 'Video locked' : 'Lock video'}
                </button>
              ) : null}
              <button type="button" onClick={handleShareViewerLink} className="btn-secondary px-3 py-1.5 text-xs">
                {copied ? 'Shared' : 'Share viewer link'}
              </button>
              {live?.is_host && live?.status === 'live' && (
                <>
                  <button type="button" onClick={handleSyncNow} disabled={syncing} className="btn-secondary px-3 py-1.5 text-xs">
                    {syncing ? 'Syncing...' : 'Sync now'}
                  </button>
                  <button type="button" onClick={handleEndSession} disabled={ending} className="btn-primary px-3 py-1.5 text-xs">
                    {ending ? 'Ending...' : 'End session'}
                  </button>
                </>
              )}
              {!isHost && isParticipant && live?.status === 'live' ? (
                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  disabled={cohostActionUserId === (user?.id || 'leave')}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {cohostActionUserId === (user?.id || 'leave') ? 'Leaving...' : 'Leave room'}
                </button>
              ) : null}
            </div>
            {liveStatusText || isHost ? (
              <div className="hidden w-full md:block md:max-w-[28rem]">
                <LiveHeaderStatusStrip
                  isHost={isHost}
                  liveStatusText={liveStatusText}
                  statusText={editStatusText}
                  saving={savingStatusText}
                  onChange={setEditStatusText}
                  onSubmit={handleUpdateStatusText}
                />
              </div>
            ) : null}
          </div>
        </div>

        {showOverlayStudioTab ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setHostWorkspaceTab('room')}
              className={`rounded-md border px-3 py-1 text-[11px] font-display font-semibold ${
                hostWorkspaceTab === 'room'
                  ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                  : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
              }`}
            >
              Live Room
            </button>
            <button
              type="button"
              onClick={() => setHostWorkspaceTab('stream')}
              className={`rounded-md border px-3 py-1 text-[11px] font-display font-semibold ${
                hostWorkspaceTab === 'stream'
                  ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                  : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
              }`}
            >
              Stream Link
            </button>
            {showYoutubeChaptersTab ? (
              <button
                type="button"
                onClick={() => setHostWorkspaceTab('chapters')}
                className={`rounded-md border px-3 py-1 text-[11px] font-display font-semibold ${
                  hostWorkspaceTab === 'chapters'
                    ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                    : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
                }`}
              >
                Chapters
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setHostWorkspaceTab('overlay')}
              className={`rounded-md border px-3 py-1 text-[11px] font-display font-semibold ${
                hostWorkspaceTab === 'overlay'
                  ? 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100'
                  : 'border-piu-border/60 bg-piu-dark/80 text-gray-300 hover:border-piu-accent/50 hover:text-white'
              }`}
            >
              Overlays
            </button>
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 lg:gap-2">
          <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-display font-semibold text-emerald-200">
            {live?.viewer_count || 0} viewers
          </span>
          <span className="rounded-md border border-piu-border/60 bg-piu-dark/60 px-3 py-1 text-[11px] text-gray-300">
            Peak {live?.viewer_peak || 0}
          </span>
          {activeSessionId || (isHost && wakeLockSupported && !isDesktopViewport) ? (
            <div className="flex items-center gap-1.5">
              {activeSessionId ? (
                <span className={`rounded-md border px-3 py-1 text-[11px] font-display font-semibold ${
                  streamState === 'live'
                    ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                    : streamState === 'reconnecting'
                      ? 'border-orange-400/30 bg-orange-500/10 text-orange-200'
                      : 'border-piu-border/60 bg-piu-dark/60 text-gray-400'
                }`}>
                  {streamStatusLabel}
                </span>
              ) : null}
              {isHost && wakeLockSupported && !isDesktopViewport ? (
                <button
                  type="button"
                  onClick={handleToggleWakeLock}
                  className={`rounded-md border px-3 py-1 text-[11px] font-display font-semibold ${
                    wakeLockActive
                      ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                      : 'border-piu-border/60 bg-piu-dark/60 text-gray-300'
                  }`}
                >
                  {wakeLockActive ? 'Screen awake' : 'Keep awake'}
                </button>
              ) : null}
            </div>
          ) : null}
          {live?.last_sync_at && isDesktopViewport ? (
            <span className="rounded-md border border-piu-border/60 bg-piu-dark/60 px-3 py-1 text-[11px] text-gray-400">
              {syncLabel}
            </span>
          ) : null}
          {!live?.is_host && viewerState.chat_muted ? (
            <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] font-display font-semibold text-amber-200">
              Chat muted
            </span>
          ) : null}
          {!live?.is_host && viewerState.requests_blocked ? (
            <span className="rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-display font-semibold text-fuchsia-200">
              Requests blocked
            </span>
          ) : null}
        </div>

        {statusNote ? <p className="mt-3 text-sm text-cyan-200">{statusNote}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        {showCompactStreamEditor ? (
          <StreamUrlEditorCard
            streamUrl={editStreamUrl}
            youtubeConnection={youtubeConnection}
            youtubeBroadcasts={youtubeBroadcasts}
            youtubeLoading={youtubeStatusLoading || youtubeBroadcastsLoading}
            selectedBroadcastId={editYoutubeBroadcastId}
            saving={savingStreamUrl}
            attached={!!String(live?.stream_url || '').trim()}
            recognized={!!youtubeId}
            onConnectYoutube={handleConnectYoutube}
            onChange={setEditStreamUrl}
            onRefreshYoutube={loadYoutubeBroadcastOptions}
            onSelectBroadcast={setEditYoutubeBroadcastId}
            onSubmit={handleUpdateStreamUrl}
          />
        ) : null}
      </div>

      {!youtubeId && isHost ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-piu-border/60 bg-piu-card/95 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-display font-semibold text-gray-300">Companion dashboard</p>
                <p className="mt-2 text-sm text-gray-300">
                  No stream link is attached, so this room is running in session-tracker mode with the same compact live-room layout on your phone.
                </p>
              </div>
              <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-4 py-3 text-right">
                <p className="text-[11px] font-display font-semibold text-gray-400">Current viewers</p>
                <p className="text-2xl font-display font-black text-cyan-200">{viewerNowCount}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isHost && activeSessionId && hostWorkspaceTab === 'overlay' ? (
        <OverlayStudioCard
          previewUrl={overlayPreviewUrl}
          preset={overlayPreset}
          theme={overlayTheme}
          fit={overlayFit}
          anchor={overlayAnchor}
          widgets={overlayWidgets}
          motionEnabled={overlayMotion}
          brandMotionEnabled={overlayBrandMotion}
          opacity={overlayOpacity}
          guidesEnabled={overlayGuides}
          autoHide={overlayAutoHide}
          copying={overlayCopying}
          copiedLabel={overlayCopiedLabel}
          tokenExpiresAt={overlayTokenExpiresAt}
          onPresetChange={(nextPreset) => {
            const normalized = normalizeLiveOverlayPreset(nextPreset);
            setOverlayPreset(normalized);
            setOverlayWidgets(getDefaultLiveOverlayWidgets(normalized));
          }}
          onThemeChange={(nextTheme) => setOverlayTheme(normalizeLiveOverlayTheme(nextTheme))}
          onFitChange={(nextFit) => setOverlayFit(normalizeLiveOverlayFit(nextFit))}
          onAnchorChange={(nextAnchor) => setOverlayAnchor(normalizeLiveOverlayAnchor(nextAnchor))}
          onAutoHideChange={(nextMode) => setOverlayAutoHide(normalizeLiveOverlayAutoHide(nextMode))}
          onToggleGuides={() => setOverlayGuides((prev) => !prev)}
          onToggleWidget={handleToggleOverlayWidget}
          onToggleMotion={() => setOverlayMotion((prev) => !prev)}
          onToggleBrandMotion={() => setOverlayBrandMotion((prev) => !prev)}
          onOpacityChange={(nextOpacity) => setOverlayOpacity(normalizeLiveOverlayOpacity(nextOpacity))}
          onApplyScene={applyOverlayScene}
          onPreview={handleOpenOverlayPreview}
          onCopyBrowserSource={handleCopyOverlayBrowserSource}
          onCopyScene={handleCopyOverlayScene}
        />
      ) : null}

      {isHost && activeSessionId && hostWorkspaceTab === 'chapters' ? (
        youtubeTimestampsSection
      ) : null}

        {showLiveRoomWorkspace && useDesktopViewerLayout ? (
          <div className={`grid gap-5 items-stretch ${desktopViewerColumns}`}>
            <div className="overflow-hidden rounded-xl border border-piu-border/60 bg-piu-dark/60">
              <div ref={desktopVideoFrameRef} className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                title="Shinsa Live stream"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                frameBorder="0"
              />
              </div>
            </div>
            <div className="h-full min-h-0 overflow-hidden" style={desktopMediaHeightStyle}>
              {chatSection}
            </div>
          </div>
      ) : showLiveRoomWorkspace && youtubeId ? (
        <div
          ref={mobileVideoShellRef}
          className="lg:hidden"
          style={mobileVideoDocked && mobileVideoDockHeight ? { height: `${mobileVideoDockHeight}px` } : undefined}
        >
          <div
            className={`overflow-hidden rounded-xl border border-piu-border/60 bg-piu-dark/60 ${
              mobileVideoDocked ? 'fixed z-40' : ''
            }`}
            style={mobileVideoDocked && mobileVideoDockStyle ? mobileVideoDockStyle : undefined}
          >
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                title="Shinsa Live stream"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                frameBorder="0"
              />
            </div>
          </div>
        </div>
      ) : null}

      {showLiveRoomWorkspace ? (
        !isDesktopViewport ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 items-stretch gap-3">
              <NowPlayingPanel
                play={lastPlay}
                live={live}
                requestInfo={nowPlayingRequestInfo}
                onOpen={() => lastPlay && setSelectedPlay(lastPlay)}
                compact
                showPerformer={showPerformerLabels}
              />
              {desktopInteractionsSection}
            </div>
            {chatSection}
            {songsSection}
          </div>
        ) : (
          <div className="space-y-4">
            {desktopTopCardsSection}
            {useDesktopViewerLayout ? (
              songsSection
            ) : (
              <div className={`grid items-start gap-5 ${desktopSidebarColumns}`}>
                <div className="space-y-4">
                  {songsSection}
                </div>
                <div className="space-y-4 lg:sticky lg:top-5">
                  {chatSection}
                </div>
              </div>
            )}
          </div>
        )
      ) : null}

      <MobilePanelSheet
        open={mobilePanel === 'requests'}
        title="Song Requests"
        subtitle="Viewer requests, queue management, and quick search."
        onClose={() => setMobilePanel('')}
        allowDesktop
      >
        {requestsSection}
      </MobilePanelSheet>

      <MobilePanelSheet
        open={mobilePanel === 'vote'}
        title="Vote Control"
        subtitle="Run the next-chart vote without leaving the live room."
        onClose={() => setMobilePanel('')}
        allowDesktop
      >
        {voteSection}
      </MobilePanelSheet>

      <EndSessionConfirmModal
        open={showEndConfirm}
        ending={ending}
        onClose={() => !ending && setShowEndConfirm(false)}
        onConfirm={handleConfirmEndSession}
      />
      <PlayDetailModal play={selectedPlay} onClose={() => setSelectedPlay(null)} />
    </div>
  );
}

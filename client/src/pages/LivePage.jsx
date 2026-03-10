import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  castLiveVote,
  createLiveOverlayToken,
  createLiveSession,
  createLiveVote,
  deleteLiveMessage,
  endLiveSession,
  getLiveSession,
  getLiveSessions,
  getMyLiveSession,
  getSongLibrary,
  openLiveSessionStream,
  sendLiveMessage,
  sendLivePresence,
  sendLiveRequest,
  setLiveModeration,
  setLiveRequestStatus,
  syncLiveSession,
  updateLiveSession,
} from '../utils/api';
import LiveEmote from '../components/LiveEmote';
import LiveDirectoryCard from '../components/LiveDirectoryCard';
import PiuChartJacket from '../components/PiuChartJacket';
import { parseGrade } from '../utils/grades';
import {
  LIVE_EMOTE_TRAY_GROUPS,
  LIVE_EMOJI_GROUPS,
  getLiveReactionPayload,
  getReactionBurstColors,
  tokenizeLiveMessage,
} from '../utils/liveEmotes';
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
  normalizeLiveOverlayFit,
  normalizeLiveOverlayGuides,
  normalizeLiveOverlayPreset,
  normalizeLiveOverlayTheme,
  normalizeLiveOverlayWidgets,
} from '../utils/liveOverlay';

const QUICK_REACTIONS = LIVE_EMOJI_GROUPS[0]?.emojis || ['🔥', '💪', '👏', '😂', '❤️', '⚡'];
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

function LiveEmoteTrayTile({ emote, disabled, onReact, onAdd }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-2">
      <button
        type="button"
        onClick={onReact}
        disabled={disabled}
        title={`React with ${emote.label}`}
        className="flex min-h-[4.75rem] w-full items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
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
        className="mt-2 w-full rounded-lg bg-piu-dark/70 px-2.5 py-1.5 text-[10px] font-display font-bold uppercase tracking-wide text-gray-300 transition-colors hover:bg-piu-dark hover:text-white disabled:opacity-40"
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
  let detail = '';

  if (messageType === 'play') {
    detail = getLiveChatPlayDetail(entry?.message);
  } else if (messageType === 'request_fulfilled') {
    detail = requesterLabel ? `Request hit for ${requesterLabel}.` : 'Request hit.';
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
  if (segments.length === 0) {
    return <p className={`${marginTopClass} w-full max-w-full overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${textSizeClass} ${tone.bodyClass}`}>{message}</p>;
  }

  return (
    <p className={`${marginTopClass} flex w-full max-w-full min-w-0 flex-wrap items-center ${compact || dense ? 'gap-1' : 'gap-1.5'} overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${textSizeClass} ${tone.bodyClass}`}>
      {segments.map((segment, idx) => (
        segment.type === 'emote'
          ? <LiveEmote key={`${segment.emote.token}-${idx}`} emote={segment.emote} size="inline" />
          : <span key={`text-${idx}`} className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{segment.text}</span>
      ))}
    </p>
  );
}

function normalizeSongResults(payload) {
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
    if (grouped.length >= 10 || totalCharts >= 30) break;
  }
  return grouped;
}

function getRequestChartBadgeTone(mode) {
  if (mode === 'Single') {
    return 'from-red-500 to-red-700 border-red-300/50';
  }
  if (mode === 'Double') {
    return 'from-green-500 to-emerald-700 border-green-300/50';
  }
  return 'from-sky-500 to-blue-700 border-sky-300/50';
}

function SongRequestSearchResult({ song, disabled, onSelectChart }) {
  return (
    <div className="rounded-xl border border-piu-border/50 bg-gradient-to-r from-[#112947] to-[#1b3554] p-3">
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
        {song.charts.map((chart) => (
          <div key={`${song.song_group_key}-${chart.chart_id}-${chart.mode}-${chart.level}`} className="relative">
            <button
              type="button"
              onClick={() => onSelectChart(chart)}
              disabled={disabled}
              className={`inline-flex h-[42px] min-w-[42px] items-center justify-center rounded-full border bg-gradient-to-b px-3 text-sm font-display font-black text-white shadow-md transition-all hover:brightness-110 disabled:opacity-50 ${getRequestChartBadgeTone(chart.mode)}`}
              title={`Request ${song.title} (${modeShort(chart.mode)}${chart.level})`}
            >
              {chart.level}
            </button>
            <span className="absolute -bottom-1 -right-1 rounded-full border border-piu-border bg-piu-dark px-1 text-[9px] font-mono text-piu-accent">
              {modeShort(chart.mode)}
            </span>
          </div>
        ))}
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
        className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-piu-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {modalBg ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-15"
            style={{ backgroundImage: `url(${modalBg})` }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-piu-bg/85 to-piu-bg" />

        <div className="relative p-5">
          <button
            type="button"
            className="absolute top-3 right-3 text-gray-500 hover:text-white text-xl leading-none"
            onClick={onClose}
          >
            x
          </button>

          <p className="font-display font-bold text-lg leading-tight pr-6 break-words">{play.song_title || 'Song'}</p>

          <div className="flex items-center gap-3 mt-4">
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border ${
              play.mode === 'Single' ? 'border-red-500/50 bg-red-500/10' : play.mode === 'Double' ? 'border-green-500/50 bg-green-500/10' : 'border-blue-500/50 bg-blue-500/10'
            }`}>
              <span className={`font-display font-bold text-[10px] uppercase ${play.mode === 'Single' ? 'text-red-400' : play.mode === 'Double' ? 'text-green-400' : 'text-blue-400'}`}>{play.mode}</span>
              <span className={`font-display font-bold text-base ${play.mode === 'Single' ? 'text-red-300' : play.mode === 'Double' ? 'text-green-300' : 'text-blue-300'}`}>{play.level}</span>
            </div>
            {overRank > 0 ? (
              <span className="px-2 py-0.5 rounded-full border border-piu-gold/55 bg-piu-gold/15 text-yellow-200 text-[11px] leading-none font-display font-black tracking-wide">
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
        className="w-full max-w-md rounded-3xl border border-rose-400/35 bg-gradient-to-br from-[#10173a] via-[#09142c] to-[#08101f] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[10px] font-display font-black uppercase tracking-[0.28em] text-rose-300">Shinsa Live</p>
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
    <div className="rounded-2xl border border-piu-border bg-[#0c1220] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Live Vote</p>
          <p className="text-sm font-display font-bold text-white">
            {vote.mode_filter} Lv.{vote.min_level}{vote.max_level !== vote.min_level ? `-${vote.max_level}` : ''}
          </p>
        </div>
        <span className={`text-[10px] font-display font-bold uppercase tracking-wide ${vote.status === 'active' ? 'text-emerald-300' : 'text-orange-300'}`}>
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
          <div key={option.id} className={`rounded-xl border px-3 py-2 ${option.is_winner ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-piu-border bg-black/15'}`}>
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
                className={`mt-2 w-full rounded-lg px-3 py-2 text-xs font-display font-bold transition-colors ${option.user_voted ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-300 hover:text-white hover:bg-piu-dark/70'}`}
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
    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/8 p-2">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-rose-200">
            {label}
          </p>
          <p className="mt-1 text-[11px] text-rose-100/75">
            {formatPinnedVoteSummary(vote)}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-full border border-rose-300/30 bg-black/15 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wide text-rose-100 transition-colors hover:bg-black/25"
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

function CreateSessionCard({ title, streamUrl, creating, onTitleChange, onStreamUrlChange, onSubmit }) {
  return (
    <div className="max-w-xl rounded-3xl border border-piu-border bg-[#0c1220] p-5 shadow-2xl">
      <p className="text-[10px] font-display uppercase tracking-[0.28em] text-rose-300">Shinsa Live</p>
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
        <input
          value={streamUrl}
          onChange={(e) => onStreamUrlChange(e.target.value)}
          className="input-field w-full"
          placeholder="YouTube stream URL (optional)"
          maxLength={400}
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
  saving,
  attached,
  recognized,
  onChange,
  onSubmit,
}) {
  return (
    <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_40%),linear-gradient(180deg,rgba(12,20,38,0.96),rgba(9,16,29,0.96))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.24em] text-cyan-200">Stream Link</p>
          <p className="mt-2 text-sm text-gray-300">
            Attach or replace your YouTube live URL without ending the session.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-display font-bold ${
          attached
            ? recognized
              ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border border-amber-400/30 bg-amber-500/10 text-amber-200'
            : 'border border-piu-border bg-black/20 text-gray-400'
        }`}>
          {attached ? (recognized ? 'Video ready' : 'Link saved') : 'No link attached'}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={streamUrl}
          onChange={(e) => onChange(e.target.value)}
          className="input-field w-full"
          placeholder="YouTube stream URL"
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

function DirectorySection({ title, subtitle, sessions }) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.28em] text-rose-300">{title}</p>
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
      <div className={`absolute overflow-hidden border border-piu-border bg-[linear-gradient(180deg,#0d1322,#09101b)] ${
        allowDesktop
          ? 'inset-x-0 bottom-0 max-h-[86vh] rounded-t-[32px] shadow-[0_-18px_50px_rgba(0,0,0,0.45)] lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[min(92vw,64rem)] lg:max-h-[86vh] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[32px] lg:shadow-[0_28px_80px_rgba(0,0,0,0.5)]'
          : 'inset-x-0 bottom-0 max-h-[86vh] rounded-t-[32px] shadow-[0_-18px_50px_rgba(0,0,0,0.45)]'
      }`}>
        <div className="flex items-center justify-between gap-3 border-b border-piu-border/60 px-4 py-3">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-rose-300">{title}</p>
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

function UserIdentity({ avatar, username, skillTitle, isHost, className = '', compact = false, dense = false }) {
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
          {isHost ? (
            <span className={`rounded-full border border-rose-400/30 bg-rose-500/10 font-display font-bold uppercase tracking-wide text-rose-200 ${
              compact ? 'px-1.5 py-0.5 text-[8px]' : dense ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'
            }`}>
              Host
            </span>
          ) : null}
          {skillTitle ? (
            <span className={`rounded-full border border-cyan-400/20 bg-cyan-500/10 font-display font-bold uppercase tracking-wide text-cyan-200 ${
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

function NowPlayingPanel({ play, requestInfo, live, onOpen, compact = false }) {
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
    <div className={`flex h-full flex-col rounded-2xl border border-cyan-400/25 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_45%),linear-gradient(180deg,#0c1426,#09101d)] p-3 shadow-[0_18px_40px_rgba(8,145,178,0.14)] ${compact ? 'min-h-0' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-display uppercase tracking-[0.24em] text-cyan-200">Latest Play</p>
          {!play ? (
            <p className="text-sm text-cyan-50/80 mt-1">
              {live?.status === 'live'
                ? 'Waiting for the first chart to land.'
                : 'Live wrapped.'}
            </p>
          ) : null}
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-full ${compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-1 text-[10px]'} font-display font-bold uppercase tracking-wide ${live?.status === 'live' ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border border-piu-border bg-black/20 text-gray-400'}`}>
          {live?.status === 'live' ? 'Live sync' : 'Session ended'}
        </span>
      </div>

      {play ? (
        <div className={`${compact ? 'mt-2 flex flex-1 flex-col' : 'mt-4 flex flex-col'}`}>
          <p className={`truncate font-display font-black text-white ${compact ? 'text-base leading-tight' : 'text-lg'}`}>{play.song_title}</p>
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
                    <span className={`min-w-0 shrink rounded-full px-2 py-0.5 text-[9px] font-display font-bold ${requestPillClass}`}>
                      {requestLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {play.pumbility_gain > 0 ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-display font-bold text-emerald-200">
                    +{play.pumbility_gain} pumbility
                  </span>
                ) : null}
                {play.over_top100_rank > 0 ? (
                  <span className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-2.5 py-0.5 text-[10px] font-display font-bold text-yellow-200">
                    OVER Top 100 #{play.over_top100_rank}
                  </span>
                ) : null}
                {play.session_result_type ? (
                  <span className="rounded-full border border-piu-border bg-black/20 px-2.5 py-0.5 text-[10px] text-gray-300 capitalize">
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
                    <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-display font-bold ${requestPillClass}`}>
                      {requestLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {play.pumbility_gain > 0 ? (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-display font-bold text-emerald-200">
                      +{play.pumbility_gain} pumbility
                    </span>
                  ) : null}
                  {play.over_top100_rank > 0 ? (
                    <span className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1 text-[11px] font-display font-bold text-yellow-200">
                      OVER Top 100 #{play.over_top100_rank}
                    </span>
                  ) : null}
                  {play.session_result_type ? (
                    <span className="rounded-full border border-piu-border bg-black/20 px-3 py-1 text-[11px] text-gray-300 capitalize">
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
          <p className={`${compact ? 'text-sm' : 'text-base'} text-cyan-50/75`}>
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

  return (
    <div className="rounded-3xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_36%),linear-gradient(180deg,#0d1322,#09101b)] p-4 sm:p-5 shadow-[0_20px_44px_rgba(17,24,39,0.3)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[10px] font-display uppercase tracking-[0.28em] text-fuchsia-200">Overlay Studio</p>
          <h2 className="mt-1 text-xl font-display font-black text-white">Browser-source layouts for stream scenes</h2>
          <p className="mt-2 text-sm text-gray-300">
            Use this once to set up OBS or Streamlabs, then return to the live room tab.
            The overlay reads the same Shinsa Live stream, so scores, chat, votes, and reactions update in real time.
          </p>
          <div className="mt-4 rounded-[24px] border border-white/10 bg-black/18 p-4">
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-cyan-200">How To Use It</p>
            <ol className="mt-3 space-y-2 text-sm text-gray-300">
              <li>1. Pick a quick scene or preset that matches the stream layout you want.</li>
              <li>2. Click `Preview overlay` to see the transparent browser-source page.</li>
              <li>3. Click `Copy browser source URL`, then paste it into an OBS `Browser Source`.</li>
              <li>4. Set the OBS browser source to the recommended size shown here, then position it in scene.</li>
            </ol>
            <p className="mt-3 text-xs text-cyan-100/85">
              Use `Transparent Rail` when you want chat or status cards to float over gameplay without a dark slab behind them.
            </p>
          </div>
        </div>

        <div className="min-w-[240px] rounded-[24px] border border-piu-border/70 bg-black/15 p-3">
          <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Current output</p>
          <p className="mt-2 text-sm font-display font-bold text-white">{presetLabel}</p>
          <p className="mt-1 text-xs text-gray-400">{themeLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-piu-border/70 bg-black/20 px-2.5 py-1 text-[10px] font-display font-bold text-cyan-100">{fitLabel}</span>
            <span className="rounded-full border border-piu-border/70 bg-black/20 px-2.5 py-1 text-[10px] font-display font-bold text-cyan-100">{anchorLabel}</span>
            <span className="rounded-full border border-piu-border/70 bg-black/20 px-2.5 py-1 text-[10px] font-display font-bold text-cyan-100">{autoHideLabel}</span>
            {guidesEnabled ? (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-display font-bold text-amber-100">
                Guides on
              </span>
            ) : null}
          </div>
          <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/8 px-3 py-2.5">
            <p className="text-[10px] font-display uppercase tracking-wide text-cyan-200">OBS start size</p>
            <p className="mt-1 text-lg font-display font-black text-white">{outputSpec.sourceLabel}</p>
            <p className="mt-1 text-[11px] text-cyan-100/80">Card frame: {outputSpec.frameLabel}</p>
          </div>
          <p className="mt-3 truncate rounded-xl border border-piu-border/60 bg-black/20 px-3 py-2 text-[11px] text-cyan-100">
            {previewUrl}
          </p>
          {copiedLabel ? <p className="mt-2 text-xs text-emerald-200">{copiedLabel}</p> : null}
          {tokenExpiresAt ? <p className="mt-1 text-[11px] text-gray-400">Overlay access valid until {new Date(tokenExpiresAt).toLocaleString()}</p> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Quick Scenes</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LIVE_OVERLAY_SCENES.map((scene) => {
                const sceneOutputSpec = getLiveOverlayOutputSpec({ sceneId: scene.id });
                return (
                  <div key={scene.id} className="rounded-[24px] border border-piu-border bg-black/12 px-4 py-3">
                    <p className="text-sm font-display font-bold text-white">{scene.label}</p>
                    <p className="mt-1 text-xs text-gray-400">{scene.description}</p>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/18 px-3 py-2">
                      <p className="text-[10px] font-display uppercase tracking-wide text-cyan-200">OBS start size</p>
                      <p className="mt-1 text-sm font-display font-black text-white">{sceneOutputSpec.sourceLabel}</p>
                      <p className="mt-1 text-[11px] text-gray-400">Card frame: {sceneOutputSpec.frameLabel}</p>
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
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Preset</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LIVE_OVERLAY_PRESETS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onPresetChange(option.id)}
                  className={`rounded-[24px] border px-4 py-3 text-left transition-colors ${
                    option.id === preset
                      ? 'border-fuchsia-400/35 bg-fuchsia-500/12 text-white shadow-[0_12px_28px_rgba(217,70,239,0.16)]'
                      : 'border-piu-border bg-black/12 text-gray-300 hover:border-fuchsia-300/25 hover:text-white'
                  }`}
                >
                  <p className="text-sm font-display font-bold">{option.label}</p>
                  <p className="mt-1 text-xs text-gray-400">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Fit</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LIVE_OVERLAY_FITS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onFitChange(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-display font-bold transition-colors ${
                    option.id === fit
                      ? 'border-fuchsia-400/35 bg-fuchsia-500/12 text-fuchsia-100'
                      : 'border-piu-border bg-black/18 text-gray-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {LIVE_OVERLAY_FITS.find((item) => item.id === fit)?.description || ''}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Position</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LIVE_OVERLAY_ANCHORS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onAnchorChange(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-display font-bold transition-colors ${
                    option.id === anchor
                      ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100'
                      : 'border-piu-border bg-black/18 text-gray-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Widgets</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LIVE_OVERLAY_WIDGETS.map((widget) => {
                const active = widgets.includes(widget.id);
                return (
                  <button
                    key={widget.id}
                    type="button"
                    onClick={() => onToggleWidget(widget.id)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-display font-bold transition-colors ${
                      active
                        ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100'
                        : 'border-piu-border bg-black/18 text-gray-400 hover:text-white'
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
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Theme</p>
            <div className="mt-2 grid gap-2">
              {LIVE_OVERLAY_THEMES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onThemeChange(option.id)}
                  className={`rounded-[22px] border px-4 py-3 text-left transition-colors ${
                    option.id === theme
                      ? 'border-cyan-400/35 bg-cyan-500/10 text-white'
                      : 'border-piu-border bg-black/12 text-gray-300 hover:border-cyan-300/25 hover:text-white'
                  }`}
                >
                  <p className="text-sm font-display font-bold">{option.label}</p>
                  {option.id === 'transparent' ? (
                    <p className="mt-1 text-xs text-gray-400">Minimal chrome for browser sources that should sit directly over gameplay.</p>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-piu-border/70 bg-black/12 p-4">
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Visibility</p>
            <div className="mt-3 grid gap-2">
              {LIVE_OVERLAY_AUTO_HIDE_MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onAutoHideChange(option.id)}
                  className={`rounded-[18px] border px-4 py-3 text-left transition-colors ${
                    option.id === autoHide
                      ? 'border-emerald-400/35 bg-emerald-500/10 text-white'
                      : 'border-piu-border bg-black/12 text-gray-300 hover:border-emerald-300/25 hover:text-white'
                  }`}
                >
                  <p className="text-sm font-display font-bold">{option.label}</p>
                  <p className="mt-1 text-xs text-gray-400">{option.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-piu-border/70 bg-black/14 px-4 py-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Safe-zone guides</p>
                <p className="mt-1 text-sm text-gray-300">Useful while placing the browser source. Turn them off before going live.</p>
              </div>
              <button
                type="button"
                onClick={onToggleGuides}
                className={`rounded-full px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-wide ${
                  guidesEnabled
                    ? 'border border-amber-400/35 bg-amber-500/12 text-amber-100'
                    : 'border border-piu-border bg-black/18 text-gray-400'
                }`}
              >
                {guidesEnabled ? 'Guides on' : 'Guides off'}
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-piu-border/70 bg-black/12 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Motion</p>
                <p className="mt-1 text-sm text-gray-300">Toggle emote bursts and animated reaction flourishes.</p>
              </div>
              <button
                type="button"
                onClick={onToggleMotion}
                className={`rounded-full px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-wide ${
                  motionEnabled
                    ? 'border border-emerald-400/35 bg-emerald-500/12 text-emerald-100'
                    : 'border border-piu-border bg-black/18 text-gray-400'
                }`}
              >
                {motionEnabled ? 'Motion on' : 'Motion off'}
              </button>
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
  const [editStreamUrl, setEditStreamUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingStreamUrl, setSavingStreamUrl] = useState(false);
  const [savingRequestsEnabled, setSavingRequestsEnabled] = useState(false);
  const [playerMode, setPlayerMode] = useState(false);
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
  const [selectedPlay, setSelectedPlay] = useState(null);
  const [playModeFilter, setPlayModeFilter] = useState('All');
  const [playPassOnly, setPlayPassOnly] = useState(true);
  const [songSearch, setSongSearch] = useState('');
  const deferredSongSearch = useDeferredValue(songSearch);
  const [songResults, setSongResults] = useState([]);
  const [searchingSongs, setSearchingSongs] = useState(false);
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
  const [overlayGuides, setOverlayGuides] = useState(false);
  const [overlayAutoHide, setOverlayAutoHide] = useState('off');
  const [overlayCopying, setOverlayCopying] = useState(false);
  const [overlayCopiedLabel, setOverlayCopiedLabel] = useState('');
  const [overlayTokenExpiresAt, setOverlayTokenExpiresAt] = useState('');
  const [desktopMediaHeight, setDesktopMediaHeight] = useState(0);
  const chatScrollRef = useRef(null);
  const chatInputRef = useRef(null);
  const desktopVideoFrameRef = useRef(null);
  const mobileVideoShellRef = useRef(null);
  const reactionIdRef = useRef(0);
  const seenMessageIdsRef = useRef(new Set());
  const presenceIdRef = useRef('');
  const liveStreamRef = useRef(null);
  const wakeLockRef = useRef(null);
  const playerModeInitRef = useRef(false);
  const overlayPrefsKeyRef = useRef('');
  const overlayCopyTimerRef = useRef(null);

  const activeSessionId = sessionId || snapshot?.session?.id || '';
  const live = snapshot?.session || null;
  const currentVote = snapshot?.active_vote || null;
  const lastPlay = snapshot?.last_play || null;
  const youtubeId = getYouTubeId(live?.stream_url || '');
  const requestsEnabled = live?.requests_enabled !== false;
  const requests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];
  const viewerState = snapshot?.viewer_state || { chat_muted: false, requests_blocked: false };
  const isHost = !!live?.is_host;
  const followedDirectorySessions = useMemo(
    () => directorySessions.filter((item) => !!item?.is_following),
    [directorySessions]
  );
  const otherDirectorySessions = useMemo(
    () => directorySessions.filter((item) => !item?.is_following),
    [directorySessions]
  );
  const isPlayerMode = isHost && playerMode;
  const useMobilePlayerHud = isPlayerMode && !isDesktopViewport;
  const isMobileChatLayout = !isDesktopViewport;
  const isMobileChatSheet = mobilePanel === 'chat' && !isDesktopViewport;
  const isCompactSongCardLayout = !isDesktopViewport;
  const hasPlayerPanels = useMobilePlayerHud && live?.status === 'live';
  const useDesktopViewerLayout = !!youtubeId && !hasPlayerPanels && isDesktopViewport;
  const useDesktopSidebarLayout = isDesktopViewport && !hasPlayerPanels && !useDesktopViewerLayout;
  const mobileVideoLockAvailable = !!youtubeId && !isDesktopViewport && !hasPlayerPanels && hostWorkspaceTab !== 'overlay';
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
      guides: overlayGuides,
      autoHide: overlayAutoHide,
      baseUrl: window.location.origin,
    });
  }, [activeSessionId, overlayAnchor, overlayAutoHide, overlayFit, overlayGuides, overlayMotion, overlayPreset, overlayTheme, overlayWidgets]);

  useEffect(() => {
    setEditStreamUrl(live?.stream_url || '');
  }, [live?.id, live?.stream_url]);

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

    startTransition(() => {
      setSnapshot(data);
      setMessages(nextMessages);
    });
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
    if (!useDesktopViewerLayout) {
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
  }, [useDesktopViewerLayout, youtubeId]);

  useEffect(() => {
    setVotePinCollapsed(!!currentVote && currentVote.status !== 'active');
  }, [currentVote?.id, currentVote?.status]);

  useEffect(() => {
    if (!isHost || typeof window === 'undefined') return;

    const storageKey = `shinsa_live_player_mode:${user?.id || 'host'}`;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === '1' || stored === '0') {
      setPlayerMode(stored === '1');
      playerModeInitRef.current = true;
      return;
    }

    if (!playerModeInitRef.current) {
      const autoEnable = window.matchMedia ? window.matchMedia('(max-width: 1023px)').matches : false;
      setPlayerMode(autoEnable);
      playerModeInitRef.current = true;
    }
  }, [isHost, user?.id]);

  useEffect(() => {
    if (!isHost || typeof window === 'undefined' || !playerModeInitRef.current) return;
    window.localStorage.setItem(`shinsa_live_player_mode:${user?.id || 'host'}`, playerMode ? '1' : '0');
  }, [isHost, playerMode, user?.id]);

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

    const lockTop = 76;
    const updateDockState = () => {
      const shell = mobileVideoShellRef.current;
      if (!shell) return;

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
        guides: overlayGuides,
        autoHide: overlayAutoHide,
      }));
    } catch {
      // Ignore storage write failures.
    }
  }, [isHost, overlayAnchor, overlayAutoHide, overlayFit, overlayGuides, overlayMotion, overlayPreset, overlayTheme, overlayWidgets]);

  useEffect(() => {
    if (!useMobilePlayerHud) {
      setMobilePanel('');
      if (wakeLockRef.current) releaseWakeLock();
    }
  }, [useMobilePlayerHud]);

  useEffect(() => {
    if (live?.status !== 'live' && mobilePanel && mobilePanel !== 'requests' && mobilePanel !== 'vote') {
      setMobilePanel('');
    }
  }, [live?.status, mobilePanel]);

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
    if (!user || !activeSessionId) {
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
  }, [activeSessionId, user]);

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
    if (!deferredSongSearch || deferredSongSearch.trim().length < 2) {
      setSongResults([]);
      return undefined;
    }
    let cancelled = false;
    setSearchingSongs(true);
    getSongLibrary({ search: deferredSongSearch.trim() })
      .then((data) => {
        if (cancelled) return;
        startTransition(() => setSongResults(normalizeSongResults(data)));
      })
      .catch(() => {
        if (!cancelled) setSongResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchingSongs(false);
      });
    return () => { cancelled = true; };
  }, [deferredSongSearch]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (mobilePanel !== 'chat' || isDesktopViewport || typeof window === 'undefined') return undefined;

    const focusInput = () => {
      const input = chatInputRef.current;
      if (!input) return;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      if (typeof input.scrollIntoView === 'function') {
        input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };

    const frameId = window.requestAnimationFrame(focusInput);
    const timeoutId = window.setTimeout(focusInput, 160);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [isDesktopViewport, mobilePanel]);

  const visiblePlays = useMemo(() => {
    const rows = Array.isArray(snapshot?.plays) ? [...snapshot.plays] : [];
    let filtered = playModeFilter === 'All'
      ? rows
      : rows.filter((play) => play.mode === playModeFilter);

    if (playPassOnly) {
      filtered = filtered.filter((play) => (parseInt(play.score, 10) || 0) > 0);
    }

    filtered.sort((a, b) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0));
    return filtered;
  }, [snapshot?.plays, playModeFilter, playPassOnly]);

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

  const requestCounts = useMemo(() => requests.reduce((acc, request) => {
    const status = getRequestStatus(request.status, request.fulfilled);
    acc[status] += 1;
    return acc;
  }, { open: 0, queued: 0, played: 0, skipped: 0 }), [requests]);
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
      const data = await createLiveSession({ title: createTitle, stream_url: createStreamUrl });
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

  const handleUpdateStreamUrl = async () => {
    if (!activeSessionId || !isHost) return;
    setSavingStreamUrl(true);
    setError('');
    try {
      const data = await updateLiveSession(activeSessionId, { stream_url: editStreamUrl });
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
      const data = await sendLiveRequest(activeSessionId, { chart_id: chart.chart_id });
      if (Array.isArray(data?.requests)) {
        replaceLiveRequests(data.requests);
      }
      if (data?.message) {
        appendLiveMessage(data.message, { markMessagesSeen: true });
      }
      setStatusNote(`Requested ${chart.song_title} (${modeShort(chart.mode)}${chart.level}).`);
      setSongSearch('');
      setSongResults([]);
    } catch (err) {
      setError(err.message || 'Failed to send request');
    }
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

  const handleCopyLink = async () => {
    if (!live?.id) return;
    const url = `${window.location.origin}/live/${live.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
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
  const viewerNowCount = live?.viewer_count || 0;
  const songCount = Array.isArray(snapshot?.plays) ? snapshot.plays.length : 0;
  const requestTabDisabled = !isHost && (!requestsEnabled || live?.status !== 'live');
  const voteTabDisabled = !isHost && !currentVote;
  const mobileRequestModalDisabled = false;
  const mobileVoteModalDisabled = false;
  const showOverlayStudioTab = isHost && activeSessionId;
  const playerSummaryCards = [
    {
      label: 'Last Score',
      value: lastPlay ? formatNumber(lastPlay.score) : 'Waiting',
      tone: 'text-cyan-200',
    },
    {
      label: 'Grade',
      value: lastPlay?.grade || '-',
      tone: 'text-white',
    },
    {
      label: 'Requests',
      value: `${requestCounts.open}/${requestCounts.queued}`,
      tone: 'text-fuchsia-200',
    },
    {
      label: 'Songs',
      value: songCount,
      tone: 'text-rose-200',
    },
  ];

  const voteSection = (
    <div className="space-y-4">
      {hostCanCreateVote ? (
        <div className="rounded-2xl border border-piu-border bg-[#0c1220] p-3">
          <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Start vote</p>
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
        <div className="rounded-2xl border border-dashed border-piu-border bg-black/15 px-4 py-5 text-sm text-gray-400">
          No live vote is open right now.
        </div>
      ) : null}
    </div>
  );

  const songsSection = (
    <div className="rounded-2xl border border-piu-border bg-[#0c1220] p-2.5 sm:p-3 lg:p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-gray-500">Songs This Session</p>
          <p className={`${isCompactSongCardLayout ? 'text-[13px]' : 'text-sm'} font-display font-bold text-white`}>{visiblePlays.length} visible plays</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[320px]">
          <select value={playModeFilter} onChange={(e) => setPlayModeFilter(e.target.value)} className={`input-field rounded-2xl border border-piu-border bg-black/15 ${isCompactSongCardLayout ? 'text-[11px] py-2 px-3' : 'text-xs py-2.5 px-3'}`}>
            <option>All</option>
            <option>Single</option>
            <option>Double</option>
          </select>
          <button
            type="button"
            onClick={() => setPlayPassOnly((prev) => !prev)}
            className={`rounded-2xl border px-3 text-left transition-colors ${
              playPassOnly
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                : 'border-piu-border bg-black/15 text-gray-300 hover:text-white'
            } ${isCompactSongCardLayout ? 'py-2' : 'py-2.5'}`}
          >
            <p className="text-[10px] font-display font-bold uppercase tracking-wide">Pass</p>
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
              className={`w-full rounded-2xl border border-piu-border bg-black/15 text-left transition-all hover:border-cyan-400/40 hover:shadow-[0_4px_16px_rgba(34,211,238,0.06)] ${
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
                      <span className={`rounded-full border border-emerald-400/25 bg-emerald-500/10 font-display font-bold text-emerald-200 ${isCompactSongCardLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
                        +{play.pumbility_gain} p
                      </span>
                    ) : null}
                    {play.over_top100_rank > 0 ? (
                      <span className={`rounded-full border border-yellow-400/25 bg-yellow-500/10 font-display font-bold text-yellow-200 ${isCompactSongCardLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
                        Top 100 #{play.over_top100_rank}
                      </span>
                    ) : null}
                    {requestInfo ? (
                      <span className={`rounded-full font-display font-bold ${isCompactSongCardLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} ${getRequestStatusMeta(requestStatus).pill}`}>
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
    <div className="rounded-2xl border border-piu-border bg-[#0c1220] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-gray-500">Song requests</p>
          <p className="text-sm font-display font-bold text-white">
            {requestCounts.open} open • {requestCounts.queued} queued • {requestCounts.played} played
            {requestCounts.skipped ? ` • ${requestCounts.skipped} skipped` : ''}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-display font-bold uppercase tracking-wide ${
          live?.status !== 'live'
            ? 'border border-piu-border bg-black/20 text-gray-400'
            : requestsEnabled
              ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border border-piu-border bg-black/20 text-gray-400'
        }`}>
          {live?.status !== 'live' ? 'Closed' : requestsEnabled ? 'Open' : 'Disabled'}
        </span>
      </div>
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
              : 'Search songs to request'
        }
        disabled={live?.status !== 'live' || viewerState.requests_blocked || (!requestsEnabled && !isHost)}
      />
      {!isHost && !requestsEnabled && live?.status === 'live' ? (
        <p className="mt-2 text-[11px] text-gray-400">The host has not enabled song requests for this session.</p>
      ) : null}
      {!isHost && viewerState.requests_blocked ? (
        <p className="mt-2 text-[11px] text-fuchsia-200">The host has disabled requests from your account for this session.</p>
      ) : null}
      {searchingSongs ? <p className="text-[11px] text-gray-500 mt-2">Searching...</p> : null}
      <div className="space-y-2 mt-3">
        {songResults.map((song) => (
          <SongRequestSearchResult
            key={song.song_group_key}
            song={song}
            disabled={live?.status !== 'live' || viewerState.requests_blocked || (!requestsEnabled && !isHost)}
            onSelectChart={handleLiveRequest}
          />
        ))}
        {!searchingSongs && deferredSongSearch.trim().length >= 2 && songResults.length === 0 ? (
          <p className="rounded-xl border border-piu-border/60 bg-black/10 px-3 py-4 text-center text-sm text-gray-500">
            No songs matched that request search.
          </p>
        ) : null}
      </div>
      <div className="space-y-2 mt-4">
        {requests.slice(0, 10).map((request) => {
          const requestStatus = getRequestStatus(request.status, request.fulfilled);
          const requestMeta = getRequestStatusMeta(requestStatus, request.fulfilled);
          return (
            <div
              key={request.id}
              className={`rounded-xl border px-3 py-2 ${requestMeta.card}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <UserIdentity
                    avatar={request.avatar}
                    username={request.username}
                    skillTitle={request.skill_title}
                    isHost={request.is_host}
                    className="mb-2"
                  />
                  <p className="text-xs font-display font-bold text-white">{request.song_title}</p>
                  <p className="text-[11px] text-gray-400">
                    {modeShort(request.mode)}{request.level}
                    {request.queue_position ? ` • Queue #${request.queue_position}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wide ${requestMeta.pill}`}>
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

  const desktopInteractionsSection = hasPlayerPanels ? null : (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-cyan-400/25 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_45%),linear-gradient(180deg,#0c1426,#09101d)] p-3 shadow-[0_18px_40px_rgba(8,145,178,0.14)]">
      <div className={`gap-2 ${isDesktopViewport ? 'flex flex-wrap items-start justify-between' : 'flex flex-col items-start'}`}>
        <div className="min-w-0">
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-cyan-200">Interactions</p>
        </div>
        {isHost ? (
          <button
            type="button"
            onClick={handleToggleRequestsEnabled}
            disabled={savingRequestsEnabled || live?.status !== 'live'}
            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[8px] font-display font-bold uppercase tracking-[0.1em] ${
              requestsEnabled
                ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                : 'border border-piu-border bg-black/20 text-gray-400'
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
          className={`min-w-0 rounded-2xl border px-2.5 py-2.5 text-left transition-colors ${
            mobilePanel === 'requests' && !(isDesktopViewport ? requestTabDisabled : mobileRequestModalDisabled)
              ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
              : (isDesktopViewport ? requestTabDisabled : mobileRequestModalDisabled)
                ? 'border-piu-border/60 bg-black/10 text-gray-500'
                : 'border-piu-border bg-black/15 text-gray-300 hover:text-white'
          }`}
        >
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.12em]">Requests</p>
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
          className={`min-w-0 rounded-2xl border px-2.5 py-2.5 text-left transition-colors ${
            mobilePanel === 'vote' && !(isDesktopViewport ? voteTabDisabled : mobileVoteModalDisabled)
              ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
              : (isDesktopViewport ? voteTabDisabled : mobileVoteModalDisabled)
                ? 'border-piu-border/60 bg-black/10 text-gray-500'
                : 'border-piu-border bg-black/15 text-gray-300 hover:text-white'
          }`}
        >
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.12em]">Vote</p>
          <p className="mt-1 text-[10px] leading-tight">
            {isDesktopViewport && voteTabDisabled ? 'No active vote' : currentVote?.status === 'active' ? 'Live now' : 'Available'}
          </p>
        </button>
      </div>
    </div>
  );

  const desktopTopCardsSection = isDesktopViewport && !hasPlayerPanels ? (
    <div className="grid items-stretch gap-4 lg:grid-cols-2 lg:gap-5">
      <NowPlayingPanel
        play={lastPlay}
        live={live}
        requestInfo={nowPlayingRequestInfo}
        onOpen={() => lastPlay && setSelectedPlay(lastPlay)}
      />
      {desktopInteractionsSection}
    </div>
  ) : null;

  const chatSection = (
    <div
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-piu-border bg-[#0c1220] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] p-3 ${
        useDesktopViewerLayout
          ? 'h-full min-h-0'
          : isMobileChatLayout
            ? 'min-h-0'
            : hasPlayerPanels
              ? 'min-h-[420px]'
              : 'min-h-0'
      }`}
      style={
        desktopMediaHeightStyle
          ? desktopMediaHeightStyle
          : useDesktopSidebarLayout
            ? { height: 'calc(100dvh - 7rem)', maxHeight: 'calc(100dvh - 7rem)' }
            : isMobileChatLayout
              ? { maxHeight: isMobileChatSheet ? 'calc(100dvh - 8.5rem)' : 'min(68dvh, calc(100dvh - 10rem))' }
              : isMobileChatSheet
                ? { maxHeight: 'calc(100dvh - 8.5rem)' }
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
          <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Live chat</p>
          <p className={`${isMobileChatLayout ? 'text-[13px]' : 'text-sm'} font-display font-bold text-white`}>{messages.length} recent messages</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleQuickReaction(emoji)}
              disabled={viewerState.chat_muted || live?.status !== 'live'}
              className="w-8 h-8 rounded-lg bg-piu-dark/60 hover:bg-piu-dark text-sm disabled:opacity-40"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowEmoteTray((prev) => !prev)}
            disabled={viewerState.chat_muted || live?.status !== 'live'}
            className={`rounded-lg px-2.5 py-1.5 text-[10px] font-display font-bold uppercase tracking-wide transition-colors ${
              showEmoteTray
                ? 'bg-rose-500/20 text-rose-100'
                : 'bg-piu-dark/60 text-gray-300 hover:bg-piu-dark hover:text-white'
            } disabled:opacity-40`}
          >
            Emotes
          </button>
        </div>
      </div>

      {currentVote && !hasPlayerPanels ? (
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
        <div className="mt-3 min-h-0 overflow-hidden rounded-2xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.14),transparent_38%),linear-gradient(180deg,#111827,#0b1220)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-display uppercase tracking-[0.24em] text-fuchsia-200">Emotes and Stickers</p>
              <p className="mt-1 text-[11px] text-gray-400">Tap a reaction to fire it instantly, or add its token into your next message.</p>
            </div>
            <button type="button" onClick={() => setShowEmoteTray(false)} className="text-[11px] text-gray-500 hover:text-white">
              Close
            </button>
          </div>

          <div className="mt-3 max-h-[52vh] overflow-y-auto overscroll-contain pr-1 lg:max-h-64 xl:max-h-72">
            {LIVE_EMOTE_TRAY_GROUPS.map((group) => (
              <div key={group.label} className="mt-3 first:mt-0">
                <div className="px-1">
                  <p className="text-[10px] font-display uppercase tracking-[0.22em] text-fuchsia-100">{group.label}</p>
                  <p className="mt-1 text-[11px] text-gray-400">{group.description}</p>
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

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {LIVE_EMOJI_GROUPS.map((group) => (
                <div key={group.label} className="rounded-2xl border border-piu-border/70 bg-black/15 p-3">
                  <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">{group.label}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {group.emojis.map((emoji) => (
                      <button
                        key={`${group.label}-${emoji}`}
                        type="button"
                        onClick={() => handleQuickReaction(emoji)}
                        disabled={viewerState.chat_muted || live?.status !== 'live'}
                        className="flex h-10 items-center justify-center rounded-xl bg-piu-dark/70 text-[22px] leading-none transition-colors hover:bg-piu-dark hover:text-white disabled:opacity-40"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div
        ref={chatScrollRef}
        className={`mt-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 ${isDesktopViewport ? 'space-y-1.5' : 'space-y-2'}`}
        style={{ scrollbarGutter: 'stable' }}
      >
        {chatMessages.map((msg) => {
          const tone = getMessageTone(msg);
          return (
            <div key={msg.id} className={`overflow-hidden ${isMobileChatLayout ? 'rounded-lg px-2.5 py-2' : isDesktopViewport ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-3 py-2'} ${tone.wrapper}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  {tone.label ? (
                    <span className={`shrink-0 rounded-full font-display font-bold uppercase tracking-wide ${tone.labelClass} ${isMobileChatLayout ? 'px-1.5 py-0.5 text-[9px]' : isDesktopViewport ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
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
                      compact={isMobileChatLayout}
                      dense={isDesktopViewport}
                    />
                  )}
                  {isHost && !msg.is_system && msg.chat_muted ? (
                    <span className={`rounded-full border border-amber-400/30 bg-amber-500/10 font-display font-bold uppercase tracking-wide text-amber-200 ${isMobileChatLayout ? 'px-1.5 py-0.5 text-[8px]' : isDesktopViewport ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'}`}>
                      Muted
                    </span>
                  ) : null}
                  {isHost && !msg.is_system && msg.requests_blocked ? (
                    <span className={`rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 font-display font-bold uppercase tracking-wide text-fuchsia-200 ${isMobileChatLayout ? 'px-1.5 py-0.5 text-[8px]' : isDesktopViewport ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'}`}>
                      Requests off
                    </span>
                  ) : null}
                </div>
                <p className={`shrink-0 ${isMobileChatLayout ? 'text-[9px]' : isDesktopViewport ? 'text-[9px]' : 'text-[10px]'} text-gray-500`}>
                  {msg.created_at ? new Date(`${msg.created_at}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
              <MessageBody entry={msg} tone={tone} compact={isMobileChatLayout} dense={isDesktopViewport} />
              {isHost && live?.status === 'live' && !msg.is_system && !msg.is_host ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(msg.id)}
                    disabled={deletingMessageId === msg.id}
                    className="rounded-lg bg-piu-dark px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-wide text-gray-300 transition-colors hover:text-white disabled:opacity-60"
                  >
                    {deletingMessageId === msg.id ? 'Removing...' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleModeration(msg, 'chat_muted')}
                    disabled={moderationActionKey === `chat_muted:${msg.user_id}`}
                    className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-wide text-amber-200 transition-colors hover:text-white disabled:opacity-60"
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
                    className="rounded-lg bg-fuchsia-500/15 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-wide text-fuchsia-200 transition-colors hover:text-white disabled:opacity-60"
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
        <div className="max-w-md rounded-3xl border border-piu-border bg-[#0c1220] p-6 text-center">
          <p className="text-sm text-gray-400">You need a Shinsa account to join Shinsa Live.</p>
          <Link to="/login" className="btn-primary inline-flex mt-4">Log In</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="py-12 text-center text-gray-400 font-display">Loading Shinsa Live...</div>;
  }

  if (!live && !sessionId) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 sm:px-8 xl:px-10">
        {error ? <p className="mb-4 text-sm text-red-300">{error}</p> : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
          <CreateSessionCard
            title={createTitle}
            streamUrl={createStreamUrl}
            creating={creating}
            onTitleChange={setCreateTitle}
            onStreamUrlChange={setCreateStreamUrl}
            onSubmit={handleCreate}
          />

          <div className="rounded-3xl border border-piu-border bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_38%),linear-gradient(180deg,#0c1323,#09101c)] p-5 shadow-2xl">
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-cyan-200">Live Directory</p>
            <h2 className="mt-2 text-2xl font-display font-black text-white">
              {directorySessions.length > 0 ? `${directorySessions.length} room${directorySessions.length === 1 ? '' : 's'} live right now` : 'No live rooms at the moment'}
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Followed players float to the top, viewer counts stay fresh, and each card shows the latest chart, requests, and vote state before you join.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-piu-border/70 bg-black/15 p-3">
                <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Following live</p>
                <p className="mt-1 text-2xl font-display font-black text-cyan-200">{followedDirectorySessions.length}</p>
              </div>
              <div className="rounded-2xl border border-piu-border/70 bg-black/15 p-3">
                <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Open sessions</p>
                <p className="mt-1 text-2xl font-display font-black text-white">{directorySessions.length}</p>
              </div>
              <div className="rounded-2xl border border-piu-border/70 bg-black/15 p-3">
                <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Viewer accounts</p>
                <p className="mt-1 text-2xl font-display font-black text-rose-200">
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
          <div className="rounded-3xl border border-dashed border-piu-border bg-black/20 px-5 py-8 text-center">
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
      <div className={`mx-auto max-w-[1760px] overflow-x-hidden px-4 py-5 sm:px-8 xl:px-10 2xl:px-14 space-y-4 ${hasPlayerPanels ? 'pb-28 lg:pb-5' : ''}`}>
      <div className="rounded-3xl border border-piu-border bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.14),transparent_50%),linear-gradient(180deg,#0d1424,#09101d)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:justify-between">
          <div className="min-w-0 w-full md:flex-1">
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-rose-300">Shinsa Live</p>
            <h1 className="mt-1 text-2xl font-display font-black text-white sm:text-3xl">
              {live?.title || 'Live session'}
            </h1>
            <p className={`text-sm text-gray-400 mt-1 ${isDesktopViewport ? '' : 'hidden'}`}>
              {live?.host?.username ? `Hosted by ${live.host.username}` : 'Live session'}
              {live?.status === 'ended' ? ' • ended' : ' • live'}
            </p>
          </div>
          <div className="flex w-full flex-col items-start gap-2 md:w-auto md:shrink-0 md:items-end">
            {!isDesktopViewport ? (
              <p className="text-xs text-left text-gray-400">
                {live?.host?.username ? `Hosted by ${live.host.username}` : 'Live session'}
                {syncLabel ? ` • ${syncLabel}` : ''}
              </p>
            ) : null}
            <div className="flex w-full flex-wrap items-center gap-2 justify-start md:w-auto md:justify-end">
              {isHost ? (
                <button
                  type="button"
                  onClick={() => setPlayerMode((prev) => !prev)}
                  className={`text-xs px-3 py-2 rounded-lg font-display font-bold transition-colors ${
                    playerMode
                      ? 'bg-cyan-500/15 text-cyan-100 border border-cyan-400/30'
                      : 'bg-black/20 text-gray-300 border border-piu-border hover:text-white'
                  }`}
                >
                  {playerMode ? 'Player mode on' : 'Player mode'}
                </button>
              ) : null}
              {mobileVideoLockAvailable ? (
                <button
                  type="button"
                  onClick={() => setLockVideo((prev) => !prev)}
                  className={`text-xs px-3 py-2 rounded-lg font-display font-bold transition-colors ${
                    lockVideo
                      ? 'bg-cyan-500/15 text-cyan-100 border border-cyan-400/30'
                      : 'bg-black/20 text-gray-300 border border-piu-border hover:text-white'
                  }`}
                >
                  {lockVideo ? 'Video locked' : 'Lock video'}
                </button>
              ) : null}
              <button type="button" onClick={handleCopyLink} className="btn-secondary text-xs px-3 py-2">
                {copied ? 'Copied' : 'Copy viewer link'}
              </button>
              {live?.is_host && live?.status === 'live' && (
                <>
                  <button type="button" onClick={handleSyncNow} disabled={syncing} className="btn-secondary text-xs px-3 py-2">
                    {syncing ? 'Syncing...' : 'Sync now'}
                  </button>
                  <button type="button" onClick={handleEndSession} disabled={ending} className="btn-primary text-xs px-3 py-2">
                    {ending ? 'Ending...' : 'End session'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {showOverlayStudioTab ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHostWorkspaceTab('room')}
              className={`rounded-full px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-wide ${
                hostWorkspaceTab === 'room'
                  ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                  : 'border border-piu-border bg-black/20 text-gray-300 hover:text-white'
              }`}
            >
              Live Room
            </button>
            <button
              type="button"
              onClick={() => setHostWorkspaceTab('stream')}
              className={`rounded-full px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-wide ${
                hostWorkspaceTab === 'stream'
                  ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                  : 'border border-piu-border bg-black/20 text-gray-300 hover:text-white'
              }`}
            >
              Stream Link
            </button>
            <button
              type="button"
              onClick={() => setHostWorkspaceTab('overlay')}
              className={`rounded-full px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-wide ${
                hostWorkspaceTab === 'overlay'
                  ? 'border border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100'
                  : 'border border-piu-border bg-black/20 text-gray-300 hover:text-white'
              }`}
            >
              Overlay Studio
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 lg:gap-2.5 mt-3">
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-display font-bold text-emerald-200">
            {live?.viewer_count || 0} watching now
          </span>
          <span className="rounded-full border border-piu-border bg-black/20 px-3 py-1 text-[11px] text-gray-300">
            Peak {live?.viewer_peak || 0}
          </span>
          {activeSessionId ? (
            <span className={`rounded-full px-3 py-1 text-[11px] font-display font-bold uppercase tracking-wide ${
              streamState === 'live'
                ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                : streamState === 'reconnecting'
                  ? 'border border-orange-400/30 bg-orange-500/10 text-orange-200'
                  : 'border border-piu-border bg-black/20 text-gray-400'
            }`}>
              {streamStatusLabel}
            </span>
          ) : null}
          {live?.last_sync_at && isDesktopViewport ? (
            <span className="rounded-full border border-piu-border bg-black/20 px-3 py-1 text-[11px] text-gray-400">
              {syncLabel}
            </span>
          ) : null}
          {isHost && wakeLockSupported && playerMode ? (
            <button
              type="button"
              onClick={handleToggleWakeLock}
              className={`rounded-full px-3 py-1 text-[11px] font-display font-bold uppercase tracking-wide ${
                wakeLockActive
                  ? 'border border-amber-400/30 bg-amber-500/10 text-amber-200'
                  : 'border border-piu-border bg-black/20 text-gray-300'
              }`}
            >
              {wakeLockActive ? 'Screen awake' : 'Keep awake'}
            </button>
          ) : null}
          {!live?.is_host && viewerState.chat_muted ? (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] font-display font-bold text-amber-200">
              Chat muted
            </span>
          ) : null}
          {!live?.is_host && viewerState.requests_blocked ? (
            <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-display font-bold text-fuchsia-200">
              Requests blocked
            </span>
          ) : null}
        </div>

        {statusNote ? <p className="mt-3 text-sm text-cyan-200">{statusNote}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        {showCompactStreamEditor ? (
          <StreamUrlEditorCard
            streamUrl={editStreamUrl}
            saving={savingStreamUrl}
            attached={!!String(live?.stream_url || '').trim()}
            recognized={!!youtubeId}
            onChange={setEditStreamUrl}
            onSubmit={handleUpdateStreamUrl}
          />
        ) : null}
      </div>

      {!youtubeId && isHost ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_40%),linear-gradient(180deg,#0d1524,#09101b)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.24em] text-cyan-200">Companion Dashboard</p>
                <p className="mt-2 text-sm text-gray-300">
                  No stream link is attached, so this room is running in session-tracker mode. The player HUD can stay pinned while you watch sync state, results, requests, and chat on your phone.
                </p>
              </div>
              <div className="rounded-2xl border border-piu-border bg-black/15 px-4 py-3 text-right">
                <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Current viewers</p>
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
          onApplyScene={applyOverlayScene}
          onPreview={handleOpenOverlayPreview}
          onCopyBrowserSource={handleCopyOverlayBrowserSource}
          onCopyScene={handleCopyOverlayScene}
        />
      ) : null}

      {hostWorkspaceTab !== 'overlay' && hasPlayerPanels ? (
        <div className="lg:hidden sticky top-[68px] z-30 space-y-3">
          <div className="rounded-[28px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_38%),linear-gradient(180deg,rgba(8,14,28,0.96),rgba(7,10,18,0.96))] p-4 shadow-[0_18px_36px_rgba(3,7,18,0.34)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.24em] text-cyan-200">Player HUD</p>
                <p className="mt-1 text-sm text-gray-300">
                  {youtubeId ? 'Pinned while the stream sits above.' : 'Built for streamless session tracking on your phone.'}
                </p>
              </div>
              <button type="button" onClick={() => setPlayerMode(false)} className="btn-secondary px-3 py-2 text-xs">
                Full page
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {playerSummaryCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-piu-border/70 bg-black/20 px-3 py-2.5">
                  <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">{card.label}</p>
                  <p className={`mt-1 text-lg font-display font-black ${card.tone}`}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <button type="button" onClick={() => setMobilePanel('songs')} className="rounded-2xl border border-piu-border bg-black/15 px-2 py-2 text-[11px] font-display font-bold text-white">
                Songs
              </button>
              <button
                type="button"
                onClick={() => setMobilePanel('requests')}
                disabled={!isHost && (!requestsEnabled || live?.status !== 'live')}
                className="rounded-2xl border border-piu-border bg-black/15 px-2 py-2 text-[11px] font-display font-bold text-white disabled:text-gray-500 disabled:opacity-60"
              >
                Requests
              </button>
              <button
                type="button"
                onClick={() => setMobilePanel('vote')}
                disabled={!isHost && !currentVote}
                className="rounded-2xl border border-piu-border bg-black/15 px-2 py-2 text-[11px] font-display font-bold text-white disabled:text-gray-500 disabled:opacity-60"
              >
                Vote
              </button>
              <button type="button" onClick={() => setMobilePanel('chat')} className="rounded-2xl border border-piu-border bg-black/15 px-2 py-2 text-[11px] font-display font-bold text-white">
                Chat
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={handleSyncNow} disabled={syncing} className="btn-secondary flex-1 min-w-[120px] px-3 py-2 text-xs">
                {syncing ? 'Syncing...' : 'Sync now'}
              </button>
              <button type="button" onClick={handleCopyLink} className="btn-secondary flex-1 min-w-[120px] px-3 py-2 text-xs">
                {copied ? 'Copied' : 'Copy link'}
              </button>
              {wakeLockSupported ? (
                <button type="button" onClick={handleToggleWakeLock} className="btn-secondary flex-1 min-w-[120px] px-3 py-2 text-xs">
                  {wakeLockActive ? 'Screen awake' : 'Keep awake'}
                </button>
              ) : null}
              <button type="button" onClick={handleEndSession} disabled={ending} className="btn-primary flex-1 min-w-[120px] px-3 py-2 text-xs">
                {ending ? 'Ending...' : 'End session'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

        {hostWorkspaceTab !== 'overlay' && useDesktopViewerLayout ? (
          <div className={`grid gap-5 items-stretch ${desktopViewerColumns}`}>
            <div className="rounded-3xl overflow-hidden border border-piu-border bg-black/30">
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
      ) : hostWorkspaceTab !== 'overlay' && youtubeId ? (
        <div
          ref={mobileVideoShellRef}
          className="lg:hidden"
          style={mobileVideoDocked && mobileVideoDockHeight ? { height: `${mobileVideoDockHeight}px` } : undefined}
        >
          <div
            className={`rounded-3xl overflow-hidden border border-piu-border bg-black/30 ${
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

      {hostWorkspaceTab !== 'overlay' ? (
        !isDesktopViewport && !hasPlayerPanels ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 items-stretch gap-3">
              <NowPlayingPanel
                play={lastPlay}
                live={live}
                requestInfo={nowPlayingRequestInfo}
                onOpen={() => lastPlay && setSelectedPlay(lastPlay)}
                compact
              />
              {desktopInteractionsSection}
            </div>
            {chatSection}
            {songsSection}
          </div>
        ) : isDesktopViewport && !hasPlayerPanels ? (
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
        ) : (
          <div className={`grid items-start gap-5 ${desktopViewerColumns}`}>
            <div className="space-y-4">
              <NowPlayingPanel
                play={lastPlay}
                live={live}
                requestInfo={nowPlayingRequestInfo}
                onOpen={() => lastPlay && setSelectedPlay(lastPlay)}
                compact={!isDesktopViewport}
              />

            {hasPlayerPanels ? null : songsSection}
          </div>

          {hasPlayerPanels ? null : (
            <div className="space-y-4">
              {useDesktopViewerLayout ? desktopInteractionsSection : (
                <>
                  {desktopInteractionsSection}
                  {chatSection}
                </>
              )}
            </div>
          )}
        </div>
        )
      ) : null}

      <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-piu-border/70 bg-[linear-gradient(180deg,rgba(9,12,20,0.94),rgba(6,8,14,0.98))] px-4 py-3 shadow-[0_-16px_36px_rgba(0,0,0,0.4)] lg:hidden ${hasPlayerPanels && hostWorkspaceTab !== 'overlay' ? '' : 'hidden'}`}>
        <div className="mx-auto grid max-w-2xl grid-cols-4 gap-2">
          <button type="button" onClick={() => setMobilePanel('songs')} className="rounded-2xl border border-piu-border bg-black/20 px-2 py-2 text-[11px] font-display font-bold text-white">
            Songs
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel('requests')}
            disabled={!isHost && (!requestsEnabled || live?.status !== 'live')}
            className="rounded-2xl border border-piu-border bg-black/20 px-2 py-2 text-[11px] font-display font-bold text-white disabled:text-gray-500 disabled:opacity-60"
          >
            Requests
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel('vote')}
            disabled={!isHost && !currentVote}
            className="rounded-2xl border border-piu-border bg-black/20 px-2 py-2 text-[11px] font-display font-bold text-white disabled:text-gray-500 disabled:opacity-60"
          >
            Vote
          </button>
          <button type="button" onClick={() => setMobilePanel('chat')} className="rounded-2xl border border-piu-border bg-black/20 px-2 py-2 text-[11px] font-display font-bold text-white">
            Chat
          </button>
        </div>
      </div>

      <MobilePanelSheet
        open={mobilePanel === 'songs'}
        title="Songs This Session"
        subtitle="Full session results with sorting and judgment drill-in."
        onClose={() => setMobilePanel('')}
      >
        {songsSection}
      </MobilePanelSheet>

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
        subtitle="Run the next-chart vote without leaving the player HUD."
        onClose={() => setMobilePanel('')}
        allowDesktop
      >
        {voteSection}
      </MobilePanelSheet>

      <MobilePanelSheet
        open={mobilePanel === 'chat'}
        title="Live Chat"
        subtitle="Chat, emotes, moderation, and crowd reactions."
        onClose={() => setMobilePanel('')}
      >
        {chatSection}
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

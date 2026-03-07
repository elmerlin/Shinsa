import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  castLiveVote,
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
} from '../utils/api';
import LiveEmote from '../components/LiveEmote';
import LiveDirectoryCard from '../components/LiveDirectoryCard';
import LiveSessionCard from '../components/LiveSessionCard';
import PiuChartJacket from '../components/PiuChartJacket';
import {
  LIVE_EMOTES,
  LIVE_EMOJI_GROUPS,
  getLiveReactionPayload,
  getReactionBurstColors,
  tokenizeLiveMessage,
} from '../utils/liveEmotes';

const QUICK_REACTIONS = LIVE_EMOJI_GROUPS[0]?.emojis || ['🔥', '💪', '👏', '😂', '❤️', '⚡'];
const GRADE_SORT = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
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

function getGradeIndex(grade) {
  const normalized = String(grade || '').trim().toUpperCase();
  const idx = GRADE_SORT.indexOf(normalized);
  return idx >= 0 ? idx : -1;
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getYouTubeId(url) {
  if (!url) return '';
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
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

function isReactionOnlyMessage(message) {
  return !!getLiveReactionPayload(message);
}

function MessageBody({ message, tone, isSystem }) {
  const reaction = !isSystem ? getLiveReactionPayload(message) : null;
  if (reaction?.kind === 'emoji') {
    return <p className="mt-1 text-2xl leading-none">{reaction.emoji}</p>;
  }
  if (reaction?.kind === 'emote') {
    return (
      <div className="mt-2">
        <LiveEmote emote={reaction.emote} size="reaction" />
      </div>
    );
  }

  const segments = tokenizeLiveMessage(message);
  if (segments.length === 0) {
    return <p className={`mt-1 text-sm break-words whitespace-pre-wrap ${tone.bodyClass}`}>{message}</p>;
  }

  return (
    <p className={`mt-1 flex flex-wrap items-center gap-1.5 text-sm break-words whitespace-pre-wrap ${tone.bodyClass}`}>
      {segments.map((segment, idx) => (
        segment.type === 'emote'
          ? <LiveEmote key={`${segment.emote.token}-${idx}`} emote={segment.emote} size="inline" />
          : <span key={`text-${idx}`} className="whitespace-pre-wrap">{segment.text}</span>
      ))}
    </p>
  );
}

function flattenSongResults(payload) {
  const songs = Array.isArray(payload?.songs) ? payload.songs : [];
  const charts = [];
  for (const song of songs) {
    for (const chart of Array.isArray(song?.charts) ? song.charts : []) {
      charts.push({
        chart_id: chart.chart_id,
        song_title: song.title || chart.title || '',
        mode: chart.mode || '',
        level: parseInt(chart.level, 10) || 0,
        jacket_url: chart.jacket_url || song.jacket_url || '',
      });
      if (charts.length >= 24) return charts;
    }
  }
  return charts;
}

function makePresenceId() {
  return `live_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function PlayDetailModal({ play, onClose }) {
  if (!play) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-piu-border bg-[#0d1426] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Judgments</p>
            <h3 className="text-lg font-display font-bold text-white">{play.song_title}</h3>
            <p className="text-sm text-cyan-300">{modeShort(play.mode)}{play.level} • {play.grade || '-'} • {formatNumber(play.score)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-white">Close</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          <div className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2">
            <p className="text-[10px] text-sky-200/70 uppercase tracking-wide">Perfect</p>
            <p className="text-lg font-display font-bold text-sky-200">{formatNumber(play.perfect)}</p>
          </div>
          <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-3 py-2">
            <p className="text-[10px] text-green-200/70 uppercase tracking-wide">Great</p>
            <p className="text-lg font-display font-bold text-green-200">{formatNumber(play.great)}</p>
          </div>
          <div className="rounded-lg border border-yellow-400/25 bg-yellow-500/10 px-3 py-2">
            <p className="text-[10px] text-yellow-200/70 uppercase tracking-wide">Good</p>
            <p className="text-lg font-display font-bold text-yellow-200">{formatNumber(play.good)}</p>
          </div>
          <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2">
            <p className="text-[10px] text-red-200/70 uppercase tracking-wide">Bad</p>
            <p className="text-lg font-display font-bold text-red-200">{formatNumber(play.bad)}</p>
          </div>
          <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2">
            <p className="text-[10px] text-red-200/70 uppercase tracking-wide">Miss</p>
            <p className="text-lg font-display font-bold text-red-200">{formatNumber(play.miss)}</p>
          </div>
          <div className="rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-2">
            <p className="text-[10px] text-fuchsia-200/70 uppercase tracking-wide">Max Combo</p>
            <p className="text-lg font-display font-bold text-fuchsia-200">{formatNumber(play.max_combo)}</p>
          </div>
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

function UserIdentity({ avatar, username, skillTitle, isHost, className = '' }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`.trim()}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-piu-border bg-piu-dark text-[11px] font-display font-bold text-white">
        {avatar ? (
          <img src={avatar} alt={username || 'User'} className="h-full w-full object-cover" />
        ) : (
          <span>{getInitial(username)}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[11px] font-display font-bold text-white">{username || 'Viewer'}</p>
          {isHost ? (
            <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[9px] font-display font-bold uppercase tracking-wide text-rose-200">
              Host
            </span>
          ) : null}
          {skillTitle ? (
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-display font-bold uppercase tracking-wide text-cyan-200">
              {skillTitle}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NowPlayingPanel({ play, requestInfo, live, onOpen }) {
  return (
    <div className="rounded-2xl border border-cyan-400/25 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_45%),linear-gradient(180deg,#0c1426,#09101d)] p-3 shadow-[0_18px_40px_rgba(8,145,178,0.14)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.24em] text-cyan-200">Now Playing</p>
          <p className="text-sm text-cyan-50/80 mt-1">
            {play
              ? 'Latest chart synced into the live room.'
              : live?.status === 'live'
                ? 'Waiting for the first chart to land.'
                : 'This live room has wrapped.'}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-display font-bold uppercase tracking-wide ${live?.status === 'live' ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border border-piu-border bg-black/20 text-gray-400'}`}>
          {live?.status === 'live' ? 'Live sync' : 'Session ended'}
        </span>
      </div>

      {play ? (
        <div className="mt-4 flex items-center gap-3">
          <PiuChartJacket title={play.song_title} mode={play.mode} level={play.level} jacketUrl={play.background_url} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-display font-black text-white">{play.song_title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 font-display font-bold text-cyan-100">
                {modeShort(play.mode)}{play.level}
              </span>
              <span className="font-display font-bold text-white">{play.grade || '-'}</span>
              <span className="text-cyan-100/80">{formatNumber(play.score)}</span>
              {play.machine_name ? <span className="text-gray-400">at {play.machine_name}</span> : null}
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
              {requestInfo ? (
                <span className={`rounded-full px-3 py-1 text-[11px] font-display font-bold ${getRequestStatusMeta(
                  requestInfo.queuedCount > 0 ? 'queued' : requestInfo.openCount > 0 ? 'open' : requestInfo.playedCount > 0 ? 'played' : 'skipped'
                ).pill}`}>
                  {formatRequestStateLabel(requestInfo)}
                </span>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onOpen} className="btn-secondary shrink-0 px-3 py-2 text-xs">
            Judgments
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-piu-border bg-black/15 px-4 py-5 text-sm text-gray-400">
          Once a chart lands through the live sync, it will pin here with score, grade, pumbility, and request context.
        </div>
      )}
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
  const [creating, setCreating] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [reactionBursts, setReactionBursts] = useState([]);
  const [showEmoteTray, setShowEmoteTray] = useState(false);
  const [selectedPlay, setSelectedPlay] = useState(null);
  const [playModeFilter, setPlayModeFilter] = useState('All');
  const [playSort, setPlaySort] = useState('recent');
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
  const [requestActionKey, setRequestActionKey] = useState('');
  const [moderationActionKey, setModerationActionKey] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [streamState, setStreamState] = useState('idle');
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const reactionIdRef = useRef(0);
  const seenMessageIdsRef = useRef(new Set());
  const presenceIdRef = useRef('');
  const liveStreamRef = useRef(null);

  const activeSessionId = sessionId || snapshot?.session?.id || '';
  const live = snapshot?.session || null;
  const currentVote = snapshot?.active_vote || null;
  const lastPlay = snapshot?.last_play || null;
  const youtubeId = getYouTubeId(live?.stream_url || '');
  const requests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];
  const viewerState = snapshot?.viewer_state || { chat_muted: false, requests_blocked: false };
  const followedDirectorySessions = useMemo(
    () => directorySessions.filter((item) => !!item?.is_following),
    [directorySessions]
  );
  const otherDirectorySessions = useMemo(
    () => directorySessions.filter((item) => !item?.is_following),
    [directorySessions]
  );

  if (!presenceIdRef.current && typeof window !== 'undefined') {
    const storageKey = 'shinsa_live_presence_id';
    presenceIdRef.current = window.sessionStorage.getItem(storageKey) || makePresenceId();
    window.sessionStorage.setItem(storageKey, presenceIdRef.current);
  }

  const applySnapshot = (data, options = {}) => {
    const nextMessages = Array.isArray(data?.messages) ? data.messages : [];
    if (options.markMessagesSeen) {
      seenMessageIdsRef.current = new Set(nextMessages.map((msg) => msg.id));
    } else {
      const seen = seenMessageIdsRef.current;
      for (const msg of nextMessages) {
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

    startTransition(() => {
      setSnapshot(data);
      setMessages(nextMessages);
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
    if (!user || sessionId || live) return undefined;

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
  }, [live, sessionId, user]);

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
        if (!closed) setStreamState('live');
      } catch {}
    };

    source.addEventListener('ready', handleReady);
    source.addEventListener('snapshot', handleSnapshot);
    source.addEventListener('presence', handlePresence);
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
    if (!user || !activeSessionId || loading || streamState === 'live') return undefined;

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
  }, [activeSessionId, loading, streamState, user]);

  useEffect(() => {
    if (!user || !activeSessionId || live?.status !== 'live') return undefined;
    const ping = () => sendLivePresence(activeSessionId, { session_id: presenceIdRef.current }).catch(() => {});
    ping();
    const interval = setInterval(ping, 10000);
    return () => clearInterval(interval);
  }, [activeSessionId, live?.status, user]);

  useEffect(() => {
    if (!user || !activeSessionId || !live?.is_host || live?.status !== 'live') return undefined;
    const interval = setInterval(async () => {
      if (syncing) return;
      try {
        const data = await syncLiveSession(activeSessionId);
        if (data?.snapshot) applySnapshot(data.snapshot);
        if (data?.sync_result) {
          const note = buildSyncStatusNote(data.sync_result, '');
          if (note) setStatusNote(note);
        }
      } catch {}
    }, 90000);
    return () => clearInterval(interval);
  }, [activeSessionId, live?.is_host, live?.status, syncing, user]);

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
        startTransition(() => setSongResults(flattenSongResults(data)));
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
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const visiblePlays = useMemo(() => {
    const rows = Array.isArray(snapshot?.plays) ? [...snapshot.plays] : [];
    const filtered = playModeFilter === 'All'
      ? rows
      : rows.filter((play) => play.mode === playModeFilter);

    filtered.sort((a, b) => {
      if (playSort === 'level_desc') return (parseInt(b.level, 10) || 0) - (parseInt(a.level, 10) || 0);
      if (playSort === 'score_desc') return (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0);
      if (playSort === 'grade_desc') return getGradeIndex(b.grade) - getGradeIndex(a.grade);
      return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
    });
    return filtered;
  }, [snapshot?.plays, playModeFilter, playSort]);

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

  const handleSendChat = async (e) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!activeSessionId || !trimmed || viewerState.chat_muted) return;
    setSendingChat(true);
    try {
      const data = await sendLiveMessage(activeSessionId, { message: trimmed });
      setMessages((prev) => [...prev, data.message]);
      seenMessageIdsRef.current.add(data.message.id);
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
      setMessages((prev) => [...prev, data.message]);
      seenMessageIdsRef.current.add(data.message.id);
      setShowEmoteTray(false);
    } catch (err) {
      setError(err.message || 'Failed to send reaction');
    }
  };

  const handleInsertChatToken = (token) => {
    setChatInput((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token} `);
    setShowEmoteTray(true);
    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  };

  const handleLiveRequest = async (chart) => {
    if (!activeSessionId || viewerState.requests_blocked) return;
    try {
      await sendLiveRequest(activeSessionId, { chart_id: chart.chart_id });
      setStatusNote(`Requested ${chart.song_title} (${modeShort(chart.mode)}${chart.level}).`);
      setSongSearch('');
      setSongResults([]);
      const data = await getLiveSession(activeSessionId);
      applySnapshot(data);
    } catch (err) {
      setError(err.message || 'Failed to send request');
    }
  };

  const handleCreateVote = async () => {
    if (!activeSessionId) return;
    setCreatingVote(true);
    try {
      await createLiveVote(activeSessionId, {
        mode_filter: voteModeFilter,
        min_level: parseInt(voteMinLevel, 10) || 1,
        max_level: parseInt(voteMaxLevel, 10) || parseInt(voteMinLevel, 10) || 1,
      });
      const data = await getLiveSession(activeSessionId);
      applySnapshot(data);
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
      setSnapshot((prev) => ({ ...prev, active_vote: data.vote }));
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
      if (data?.snapshot) applySnapshot(data.snapshot);
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
      if (data?.snapshot) applySnapshot(data.snapshot);
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
      if (data?.snapshot) applySnapshot(data.snapshot);
      setStatusNote('Viewer message removed.');
    } catch (err) {
      setError(err.message || 'Failed to remove message');
    } finally {
      setDeletingMessageId('');
    }
  };

  const handleEndSession = async () => {
    if (!activeSessionId || !window.confirm('End this live session and auto-post the recap now?')) return;
    setEnding(true);
    try {
      const data = await endLiveSession(activeSessionId);
      setStatusNote(data?.summary_post_id ? `Live session ended. Recap post #${data.summary_post_id} created.` : 'Live session ended.');
      const fresh = await getLiveSession(activeSessionId);
      applySnapshot(fresh);
    } catch (err) {
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
      <div className="space-y-5 px-4 py-6 sm:px-6">
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
    <div className="px-4 py-5 sm:px-6 space-y-4">
      <div className="rounded-3xl border border-piu-border bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.18),transparent_42%),linear-gradient(180deg,#0d1322,#09101d)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-rose-300">Shinsa Live</p>
            <h1 className="text-2xl sm:text-3xl font-display font-black text-white mt-1">{live?.title || 'Live session'}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {live?.host?.username ? `Hosted by ${live.host.username}` : 'Live session'}
              {live?.status === 'ended' ? ' • ended' : ' • live'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        <div className="flex flex-wrap items-center gap-2 mt-3">
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
              {streamState === 'live'
                ? 'Channel live'
                : streamState === 'reconnecting'
                  ? 'Reconnecting'
                  : streamState === 'connecting'
                    ? 'Connecting'
                    : 'Offline'}
            </span>
          ) : null}
          {live?.last_sync_at ? (
            <span className="rounded-full border border-piu-border bg-black/20 px-3 py-1 text-[11px] text-gray-400">
              Last sync {new Date(`${live.last_sync_at}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
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
      </div>

      {youtubeId ? (
        <div className="rounded-3xl overflow-hidden border border-piu-border bg-black/30">
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
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="space-y-4">
          <NowPlayingPanel
            play={lastPlay}
            live={live}
            requestInfo={nowPlayingRequestInfo}
            onOpen={() => lastPlay && setSelectedPlay(lastPlay)}
          />

          {snapshot?.summary ? <LiveSessionCard summary={snapshot.summary} /> : null}

          <div className="rounded-2xl border border-piu-border bg-[#0c1220] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Songs This Session</p>
                <p className="text-sm font-display font-bold text-white">{visiblePlays.length} visible plays</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={playModeFilter} onChange={(e) => setPlayModeFilter(e.target.value)} className="input-field text-xs py-2">
                  <option>All</option>
                  <option>Single</option>
                  <option>Double</option>
                </select>
                <select value={playSort} onChange={(e) => setPlaySort(e.target.value)} className="input-field text-xs py-2">
                  <option value="recent">Recent</option>
                  <option value="level_desc">Level high to low</option>
                  <option value="grade_desc">Grade high to low</option>
                  <option value="score_desc">Score high to low</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 mt-3">
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
                return (
                  <button
                    type="button"
                    key={play.id}
                    onClick={() => setSelectedPlay(play)}
                    className="w-full rounded-xl border border-piu-border bg-black/15 px-3 py-2 text-left hover:border-cyan-400/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <PiuChartJacket title={play.song_title} mode={play.mode} level={play.level} jacketUrl={play.background_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold text-white truncate">{play.song_title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <p className="text-[11px] text-gray-400">{modeShort(play.mode)}{play.level}</p>
                          {play.pumbility_gain > 0 ? (
                            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-emerald-200">
                              +{play.pumbility_gain} p
                            </span>
                          ) : null}
                          {play.over_top100_rank > 0 ? (
                            <span className="rounded-full border border-yellow-400/25 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-display font-bold text-yellow-200">
                              Top 100 #{play.over_top100_rank}
                            </span>
                          ) : null}
                          {requestInfo ? (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-display font-bold ${getRequestStatusMeta(requestStatus).pill}`}>
                              {formatRequestStateLabel(requestInfo)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-display font-bold text-cyan-300">{formatNumber(play.score)}</p>
                        <p className="text-[11px] text-gray-400">{play.grade || '-'}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {visiblePlays.length === 0 ? <p className="text-sm text-gray-500">No plays match the current filter yet.</p> : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {live?.is_host && (!currentVote || currentVote.status !== 'active') && live?.status === 'live' ? (
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

          <div className="rounded-2xl border border-piu-border bg-[#0c1220] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Song requests</p>
                <p className="text-sm font-display font-bold text-white">
                  {requestCounts.open} open • {requestCounts.queued} queued • {requestCounts.played} played
                  {requestCounts.skipped ? ` • ${requestCounts.skipped} skipped` : ''}
                </p>
              </div>
              {live?.status !== 'live' ? (
                <span className="rounded-full border border-piu-border bg-black/20 px-3 py-1 text-[10px] font-display font-bold uppercase tracking-wide text-gray-400">
                  Closed
                </span>
              ) : null}
            </div>
            <input
              value={songSearch}
              onChange={(e) => setSongSearch(e.target.value)}
              className="input-field w-full mt-3"
              placeholder={
                live?.status !== 'live'
                  ? 'Requests are closed'
                  : viewerState.requests_blocked
                    ? 'Host has blocked your requests'
                    : 'Search song or chart'
              }
              disabled={live?.status !== 'live' || viewerState.requests_blocked}
            />
            {!live?.is_host && viewerState.requests_blocked ? (
              <p className="mt-2 text-[11px] text-fuchsia-200">The host has disabled requests from your account for this session.</p>
            ) : null}
            {searchingSongs ? <p className="text-[11px] text-gray-500 mt-2">Searching...</p> : null}
            <div className="space-y-2 mt-3">
              {songResults.map((chart) => (
                <button
                  type="button"
                  key={`${chart.chart_id}-${chart.mode}-${chart.level}`}
                  onClick={() => handleLiveRequest(chart)}
                  disabled={live?.status !== 'live' || viewerState.requests_blocked}
                  className="w-full rounded-xl border border-piu-border bg-black/15 px-3 py-2 text-left hover:border-cyan-400/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PiuChartJacket title={chart.song_title} mode={chart.mode} level={chart.level} jacketUrl={chart.jacket_url} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-display font-bold text-white truncate">{chart.song_title}</p>
                      <p className="text-[11px] text-gray-400">{modeShort(chart.mode)}{chart.level}</p>
                    </div>
                  </div>
                </button>
              ))}
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
                  {live?.is_host && live?.status === 'live' ? (
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
              )})}
              {requests.length === 0 ? <p className="text-sm text-gray-500">No requests yet.</p> : null}
            </div>
          </div>

          <div className="relative rounded-2xl border border-piu-border bg-[#0c1220] p-3 flex flex-col min-h-[520px]">
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
                <p className="text-sm font-display font-bold text-white">{messages.length} recent messages</p>
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

            {currentVote ? (
              <div className="mt-3 rounded-2xl border border-rose-400/25 bg-rose-500/8 p-2">
                <p className="px-1 text-[10px] font-display font-bold uppercase tracking-[0.24em] text-rose-200">
                  Pinned Vote
                </p>
                <VotePanel vote={currentVote} canVote={!live?.is_host && live?.status === 'live'} onVote={handleCastVote} />
              </div>
            ) : null}

            {showEmoteTray && live?.status === 'live' ? (
              <div className="mt-3 rounded-2xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.14),transparent_38%),linear-gradient(180deg,#111827,#0b1220)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-display uppercase tracking-[0.24em] text-fuchsia-200">Shinsa Emotes</p>
                    <p className="mt-1 text-[11px] text-gray-400">Tap an emote to fire it instantly, or add its token into your next message.</p>
                  </div>
                  <button type="button" onClick={() => setShowEmoteTray(false)} className="text-[11px] text-gray-500 hover:text-white">
                    Close
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {LIVE_EMOTES.map((emote) => (
                    <div key={emote.token} className="rounded-2xl border border-white/8 bg-black/20 p-2">
                      <button
                        type="button"
                        onClick={() => handleQuickReaction(emote.token)}
                        disabled={viewerState.chat_muted || live?.status !== 'live'}
                        className="w-full disabled:opacity-40"
                      >
                        <LiveEmote emote={emote} size="tray" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertChatToken(emote.token)}
                        disabled={viewerState.chat_muted || live?.status !== 'live'}
                        className="mt-2 w-full rounded-lg bg-piu-dark/70 px-3 py-2 text-[10px] font-display font-bold uppercase tracking-wide text-gray-300 transition-colors hover:bg-piu-dark hover:text-white disabled:opacity-40"
                      >
                        Add to message
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {LIVE_EMOJI_GROUPS.map((group) => (
                    <div key={group.label} className="rounded-2xl border border-piu-border/70 bg-black/15 p-3">
                      <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">{group.label}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.emojis.map((emoji) => (
                          <button
                            key={`${group.label}-${emoji}`}
                            type="button"
                            onClick={() => handleQuickReaction(emoji)}
                            disabled={viewerState.chat_muted || live?.status !== 'live'}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-piu-dark/70 text-base transition-colors hover:bg-piu-dark hover:text-white disabled:opacity-40"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1">
              {messages.map((msg) => {
                const tone = getMessageTone(msg);
                return (
                  <div key={msg.id} className={`rounded-xl px-3 py-2 ${tone.wrapper}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {tone.label ? (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide ${tone.labelClass}`}>
                            {tone.label}
                          </span>
                        ) : null}
                        {msg.is_system ? (
                          <p className={`truncate text-[11px] font-display font-bold ${tone.usernameClass}`}>
                            {msg.username || 'System'}
                          </p>
                        ) : (
                          <UserIdentity
                            avatar={msg.avatar}
                            username={msg.username}
                            skillTitle={msg.skill_title}
                            isHost={msg.is_host}
                          />
                        )}
                        {live?.is_host && !msg.is_system && msg.chat_muted ? (
                          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-display font-bold uppercase tracking-wide text-amber-200">
                            Muted
                          </span>
                        ) : null}
                        {live?.is_host && !msg.is_system && msg.requests_blocked ? (
                          <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[9px] font-display font-bold uppercase tracking-wide text-fuchsia-200">
                            Requests off
                          </span>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-[10px] text-gray-500">
                        {msg.created_at ? new Date(`${msg.created_at}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                    <MessageBody message={msg.message} tone={tone} isSystem={msg.is_system} />
                    {live?.is_host && live?.status === 'live' && !msg.is_system && !msg.is_host ? (
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
              <div ref={chatEndRef} />
            </div>

            {live?.status === 'live' ? (
              <form onSubmit={handleSendChat} className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setShowEmoteTray((prev) => !prev)}
                  disabled={viewerState.chat_muted}
                  className="btn-secondary px-3 text-xs disabled:opacity-40"
                >
                  {showEmoteTray ? 'Hide' : 'Emotes'}
                </button>
                <input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="input-field flex-1"
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
            {live?.status === 'live' && !live?.is_host && viewerState.chat_muted ? (
              <p className="mt-2 text-[11px] text-amber-200">The host has muted your chat for this session.</p>
            ) : null}
          </div>
        </div>
      </div>

      <PlayDetailModal play={selectedPlay} onClose={() => setSelectedPlay(null)} />
    </div>
  );
}

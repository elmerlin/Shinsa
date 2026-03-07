import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  castLiveVote,
  createLiveSession,
  createLiveVote,
  endLiveSession,
  fulfillLiveRequest,
  getLiveMessages,
  getLiveSession,
  getMyLiveSession,
  getSongLibrary,
  sendLiveMessage,
  sendLivePresence,
  sendLiveRequest,
  syncLiveSession,
} from '../utils/api';
import LiveSessionCard from '../components/LiveSessionCard';
import PiuChartJacket from '../components/PiuChartJacket';

const QUICK_REACTIONS = ['🔥', '💪', '👏', '😂', '❤️', '⚡'];
const GRADE_SORT = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];

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
  if ((info.openCount || 0) > 0) {
    return info.openCount === 1 ? 'Viewer request' : `${info.openCount} requests`;
  }
  return (info.fulfilledCount || 0) <= 1 ? 'Request fulfilled' : `${info.fulfilledCount} fulfilled`;
}

function getMessageTone(message) {
  if (!message?.is_system) {
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

function isEmojiOnly(message) {
  return /^[\p{Emoji}\s]{1,5}$/u.test(String(message || '').trim());
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

export default function LivePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createStreamUrl, setCreateStreamUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
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
  const [fulfillingRequestId, setFulfillingRequestId] = useState('');
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef(null);
  const reactionIdRef = useRef(0);
  const seenMessageIdsRef = useRef(new Set());
  const presenceIdRef = useRef('');

  const activeSessionId = sessionId || snapshot?.session?.id || '';
  const live = snapshot?.session || null;
  const currentVote = snapshot?.active_vote || null;
  const lastPlay = snapshot?.last_play || null;
  const youtubeId = getYouTubeId(live?.stream_url || '');
  const requests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];

  if (!presenceIdRef.current && typeof window !== 'undefined') {
    const storageKey = 'shinsa_live_presence_id';
    presenceIdRef.current = window.sessionStorage.getItem(storageKey) || makePresenceId();
    window.sessionStorage.setItem(storageKey, presenceIdRef.current);
  }

  const applySnapshot = (data, options = {}) => {
    startTransition(() => {
      setSnapshot(data);
      if (Array.isArray(data?.messages)) {
        if (options.markMessagesSeen) {
          seenMessageIdsRef.current = new Set(data.messages.map((msg) => msg.id));
        }
        setMessages(data.messages);
      }
    });
  };

  const applyMessages = (rows, options = {}) => {
    const list = Array.isArray(rows) ? rows : [];
    if (options.markSeen) {
      seenMessageIdsRef.current = new Set(list.map((msg) => msg.id));
    } else {
      const seen = seenMessageIdsRef.current;
      for (const msg of list) {
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        if (!msg?.is_system && isEmojiOnly(msg?.message)) {
          const rid = reactionIdRef.current++;
          const x = 15 + Math.random() * 70;
          setFloatingReactions((prev) => [...prev, { id: rid, emoji: msg.message.trim(), x }]);
          setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((row) => row.id !== rid));
          }, 1800);
        }
      }
    }
    startTransition(() => setMessages(list));
  };

  const showFloatingReaction = (emoji) => {
    const rid = reactionIdRef.current++;
    const x = 15 + Math.random() * 70;
    setFloatingReactions((prev) => [...prev, { id: rid, emoji, x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((row) => row.id !== rid));
    }, 1800);
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
    if (!user || !activeSessionId) return undefined;
    const loadSnapshot = async () => {
      try {
        const data = await getLiveSession(activeSessionId);
        applySnapshot(data);
      } catch (err) {
        setError(err.message || 'Failed to refresh live session');
      }
    };
    const interval = setInterval(loadSnapshot, 7000);
    return () => clearInterval(interval);
  }, [activeSessionId, user]);

  useEffect(() => {
    if (!user || !activeSessionId) return undefined;
    const loadMessages = async () => {
      try {
        const data = await getLiveMessages(activeSessionId);
        applyMessages(data?.messages || []);
      } catch {}
    };
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [activeSessionId, user]);

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
          fulfilledCount: 0,
          usernames: [],
        });
      }
      const row = map.get(key);
      if (request.fulfilled) row.fulfilledCount += 1;
      else row.openCount += 1;
      if (request.username) row.usernames.push(request.username);
    }
    return map;
  }, [requests]);

  const openRequestCount = useMemo(
    () => requests.filter((request) => !request.fulfilled).length,
    [requests]
  );
  const fulfilledRequestCount = useMemo(
    () => requests.filter((request) => request.fulfilled).length,
    [requests]
  );

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const data = await createLiveSession({ title: createTitle, stream_url: createStreamUrl });
      seenMessageIdsRef.current = new Set((data?.messages || []).map((msg) => msg.id));
      applySnapshot(data, { markMessagesSeen: true });
      if (data?.session?.id) navigate(`/live/${data.session.id}`, { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to create live session');
    } finally {
      setCreating(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!activeSessionId || !chatInput.trim()) return;
    setSendingChat(true);
    try {
      const data = await sendLiveMessage(activeSessionId, { message: chatInput.trim() });
      setMessages((prev) => [...prev, data.message]);
      seenMessageIdsRef.current.add(data.message.id);
      setChatInput('');
    } catch (err) {
      setError(err.message || 'Failed to send chat message');
    } finally {
      setSendingChat(false);
    }
  };

  const handleQuickReaction = async (emoji) => {
    if (!activeSessionId || live?.status !== 'live') return;
    showFloatingReaction(emoji);
    try {
      const data = await sendLiveMessage(activeSessionId, { message: emoji });
      setMessages((prev) => [...prev, data.message]);
      seenMessageIdsRef.current.add(data.message.id);
    } catch (err) {
      setError(err.message || 'Failed to send reaction');
    }
  };

  const handleLiveRequest = async (chart) => {
    if (!activeSessionId) return;
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

  const handleFulfillRequest = async (requestId) => {
    if (!activeSessionId || !requestId) return;
    setFulfillingRequestId(requestId);
    try {
      const data = await fulfillLiveRequest(activeSessionId, requestId);
      if (data?.snapshot) applySnapshot(data.snapshot);
      setStatusNote('Request marked as played.');
    } catch (err) {
      setError(err.message || 'Failed to mark request as played');
    } finally {
      setFulfillingRequestId('');
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
      <div className="px-4 py-6 sm:px-6">
        {error ? <p className="mb-4 text-sm text-red-300">{error}</p> : null}
        <CreateSessionCard
          title={createTitle}
          streamUrl={createStreamUrl}
          creating={creating}
          onTitleChange={setCreateTitle}
          onStreamUrlChange={setCreateStreamUrl}
          onSubmit={handleCreate}
        />
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
          {live?.last_sync_at ? (
            <span className="rounded-full border border-piu-border bg-black/20 px-3 py-1 text-[11px] text-gray-400">
              Last sync {new Date(`${live.last_sync_at}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          {snapshot?.summary ? <LiveSessionCard summary={snapshot.summary} /> : null}

          {lastPlay ? (
            <div className="rounded-2xl border border-piu-border bg-[#0c1220] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Last Played</p>
                  <p className="text-lg font-display font-bold text-white">{lastPlay.song_title}</p>
                  <p className="text-sm text-cyan-300">
                    {modeShort(lastPlay.mode)}{lastPlay.level} • {lastPlay.grade || '-'} • {formatNumber(lastPlay.score)}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedPlay(lastPlay)} className="btn-secondary text-xs px-3 py-2">
                  Judgments
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {lastPlay.pumbility_gain > 0 ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-display font-bold text-emerald-200">
                    +{lastPlay.pumbility_gain} pumbility
                  </span>
                ) : null}
                {lastPlay.over_top100_rank > 0 ? (
                  <span className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1 text-[11px] font-display font-bold text-yellow-200">
                    OVER Top 100 #{lastPlay.over_top100_rank}
                  </span>
                ) : null}
                {lastPlay.session_result_type ? (
                  <span className="rounded-full border border-piu-border bg-black/20 px-3 py-1 text-[11px] text-gray-300 capitalize">
                    {lastPlay.session_result_type}
                  </span>
                ) : null}
                {(() => {
                  const requestInfo = requestLookup.get(buildRequestKey(lastPlay.song_title, lastPlay.mode, lastPlay.level));
                  if (!requestInfo) return null;
                  const isOpen = requestInfo.openCount > 0;
                  return (
                    <span className={`rounded-full px-3 py-1 text-[11px] font-display font-bold ${isOpen ? 'border border-sky-400/30 bg-sky-500/10 text-sky-200' : 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'}`}>
                      {formatRequestStateLabel(requestInfo)}
                    </span>
                  );
                })()}
              </div>
            </div>
          ) : null}

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
                const isOpenRequest = (requestInfo?.openCount || 0) > 0;
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
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-display font-bold ${isOpenRequest ? 'border border-sky-400/25 bg-sky-500/10 text-sky-200' : 'border border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`}>
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
                <p className="text-sm font-display font-bold text-white">{openRequestCount} open • {fulfilledRequestCount} played</p>
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
              placeholder={live?.status === 'live' ? 'Search song or chart' : 'Requests are closed'}
              disabled={live?.status !== 'live'}
            />
            {searchingSongs ? <p className="text-[11px] text-gray-500 mt-2">Searching...</p> : null}
            <div className="space-y-2 mt-3">
              {songResults.map((chart) => (
                <button
                  type="button"
                  key={`${chart.chart_id}-${chart.mode}-${chart.level}`}
                  onClick={() => handleLiveRequest(chart)}
                  disabled={live?.status !== 'live'}
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
              {requests.slice(0, 8).map((request) => (
                <div
                  key={request.id}
                  className={`rounded-xl border px-3 py-2 ${request.fulfilled ? 'border-emerald-400/25 bg-emerald-500/8' : 'border-piu-border bg-black/10'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-display font-bold text-white">{request.song_title}</p>
                      <p className="text-[11px] text-gray-400">
                        {request.username} requested {modeShort(request.mode)}{request.level}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wide ${request.fulfilled ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border border-sky-400/30 bg-sky-500/10 text-sky-200'}`}>
                      {request.fulfilled ? 'Played' : 'Open'}
                    </span>
                  </div>
                  {live?.is_host && live?.status === 'live' && !request.fulfilled ? (
                    <button
                      type="button"
                      onClick={() => handleFulfillRequest(request.id)}
                      disabled={fulfillingRequestId === request.id}
                      className="mt-2 rounded-lg bg-piu-dark px-3 py-2 text-[11px] font-display font-bold text-gray-200 transition-colors hover:text-white disabled:opacity-60"
                    >
                      {fulfillingRequestId === request.id ? 'Marking...' : 'Mark played'}
                    </button>
                  ) : null}
                </div>
              ))}
              {requests.length === 0 ? <p className="text-sm text-gray-500">No requests yet.</p> : null}
            </div>
          </div>

          <div className="relative rounded-2xl border border-piu-border bg-[#0c1220] p-3 flex flex-col min-h-[520px]">
            {floatingReactions.map((reaction) => (
              <div
                key={reaction.id}
                className="absolute pointer-events-none z-10 animate-float-up"
                style={{ left: `${reaction.x}%`, bottom: '88px', fontSize: '24px' }}
              >
                {reaction.emoji}
              </div>
            ))}

            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Live chat</p>
                <p className="text-sm font-display font-bold text-white">{messages.length} recent messages</p>
              </div>
              <div className="flex gap-1">
                {QUICK_REACTIONS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => handleQuickReaction(emoji)} className="w-8 h-8 rounded-lg bg-piu-dark/60 hover:bg-piu-dark text-sm">
                    {emoji}
                  </button>
                ))}
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
                        <p className={`truncate text-[11px] font-display font-bold ${tone.usernameClass}`}>
                          {msg.username || 'System'}
                        </p>
                      </div>
                      <p className="shrink-0 text-[10px] text-gray-500">
                        {msg.created_at ? new Date(`${msg.created_at}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                    <p className={`${isEmojiOnly(msg.message) && !msg.is_system ? 'text-2xl leading-none mt-1' : `text-sm mt-1 break-words ${tone.bodyClass}`}`}>
                      {msg.message}
                    </p>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {live?.status === 'live' ? (
              <form onSubmit={handleSendChat} className="flex gap-2 mt-3">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="input-field flex-1"
                  placeholder="Send a message"
                  maxLength={500}
                />
                <button type="submit" disabled={sendingChat} className="btn-primary px-4">
                  {sendingChat ? '...' : 'Send'}
                </button>
              </form>
            ) : (
              <p className="text-[11px] text-gray-500 mt-3">Chat is read-only because this session has ended.</p>
            )}
          </div>
        </div>
      </div>

      <PlayDetailModal play={selectedPlay} onClose={() => setSelectedPlay(null)} />
    </div>
  );
}

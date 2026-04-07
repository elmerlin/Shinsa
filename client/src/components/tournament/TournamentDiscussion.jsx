import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  getTournamentDiscussion,
  sendTournamentDiscussionMessage,
  pumpTournamentDiscussionMessage,
  deleteTournamentDiscussionMessage,
} from '../../utils/api';
import { LIVE_EMOTES, LIVE_EMOTE_TRAY_GROUPS, LIVE_EMOJI_GROUPS, tokenizeLiveMessage, getLiveReactionPayload } from '../../utils/liveEmotes';
import LiveEmote from '../LiveEmote';

const API_BASE = '/api';
const QUICK_REACTIONS = ['🔥', '💪', '👏', '🏆', '⚡', '🎉'];

function getInitial(name) {
  return String(name || '?').charAt(0).toUpperCase();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(`${dateStr}Z`).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function DiscussionMessageBody({ message }) {
  const reaction = getLiveReactionPayload(message);
  if (reaction?.kind === 'emoji') {
    return <p className="mt-0.5 text-2xl leading-none">{reaction.emoji}</p>;
  }
  if (reaction?.kind === 'emote') {
    return (
      <div className="mt-1.5">
        <LiveEmote emote={reaction.emote} size="reaction" />
      </div>
    );
  }

  const segments = tokenizeLiveMessage(message);
  if (segments.length === 0) {
    return (
      <p className="mt-0.5 text-[13px] text-zinc-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
        {message}
      </p>
    );
  }

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[13px] text-zinc-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
      {segments.map((seg, i) =>
        seg.type === 'emote' ? (
          <LiveEmote key={`${seg.emote.token}-${i}`} emote={seg.emote} size="inline" />
        ) : (
          <span key={`t-${i}`}>{seg.text}</span>
        )
      )}
    </div>
  );
}

function EmoteTray({ onReact, onInsert, onClose }) {
  return (
    <div className="tournament-discuss-emote-tray rounded-xl border border-white/10 bg-zinc-950/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-display font-semibold text-zinc-300">Emotes & Reactions</p>
        <button type="button" onClick={onClose} className="text-[10px] text-zinc-500 hover:text-white transition-colors">Close</button>
      </div>

      {/* Quick emoji row */}
      <div className="flex flex-wrap gap-1 mb-3">
        {LIVE_EMOJI_GROUPS.flatMap(g => g.emojis).map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            className="h-8 w-8 rounded-lg border border-white/8 bg-white/4 text-base transition-all hover:scale-110 hover:border-rose-400/30 hover:bg-rose-500/10 active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Shinsa emotes */}
      <div className="max-h-[30vh] overflow-y-auto overscroll-contain pr-1 space-y-3">
        {LIVE_EMOTE_TRAY_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-display font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">{group.label}</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {group.emotes.map((emote) => (
                <button
                  key={emote.token}
                  type="button"
                  onClick={() => onInsert(emote.token)}
                  className="group relative flex flex-col items-center gap-1 rounded-lg border border-white/6 bg-white/[0.02] p-2 transition-all hover:border-rose-400/25 hover:bg-rose-500/8 active:scale-95"
                >
                  <LiveEmote emote={emote} size="tray" showLabel={false} />
                  <span className="text-[9px] text-zinc-500 group-hover:text-zinc-300 transition-colors truncate max-w-full">{emote.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FloatingReaction({ reaction, id, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const timer = setTimeout(() => onDone(id), 2200);
    return () => clearTimeout(timer);
  }, [id, onDone]);

  return (
    <div
      ref={ref}
      className="tournament-discuss-float-reaction pointer-events-none absolute"
      style={{ left: `${reaction.x}%`, bottom: '100%' }}
    >
      {reaction.payload?.kind === 'emote' ? (
        <LiveEmote emote={reaction.payload.emote} size="reaction" />
      ) : (
        <span className="text-2xl">{reaction.payload?.emoji || reaction.payload || ''}</span>
      )}
    </div>
  );
}

export default function TournamentDiscussion({ tournamentId, players = [], tournament = null }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoteTray, setShowEmoteTray] = useState(false);
  const [pumpingId, setPumpingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const chatScrollRef = useRef(null);
  const chatInputRef = useRef(null);
  const sseRef = useRef(null);
  const floatIdRef = useRef(0);

  const isActive = tournament?.phase !== 'SETUP' && tournament?.phase !== 'COMPLETED';
  const isCompleted = tournament?.phase === 'COMPLETED';
  const isSetup = tournament?.phase === 'SETUP';

  // Map of player names (lowercased) to player objects for participant detection
  const playerNameSet = useMemo(() => {
    const s = new Set();
    for (const p of players) {
      if (p.name) s.add(p.name.toLowerCase());
    }
    return s;
  }, [players]);

  const isCurrentUserParticipant = useMemo(() => {
    if (!user) return false;
    return playerNameSet.has((user.username || '').toLowerCase());
  }, [user, playerNameSet]);

  // Load messages
  const loadMessages = useCallback(async () => {
    try {
      const data = await getTournamentDiscussion(tournamentId);
      setMessages(data.messages || []);
      setViewerCount(data.viewer_count || 0);
    } catch (err) {
      console.error('Failed to load discussion:', err);
    } finally {
      setLoaded(true);
    }
  }, [tournamentId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // SSE real-time connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    const url = `${API_BASE}/tournaments/${tournamentId}/discussion/stream`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    // EventSource doesn't support custom headers, so we use fetch-based SSE
    const controller = new AbortController();
    let retryTimeout;

    function connect() {
      fetch(url, { headers, signal: controller.signal })
        .then((res) => {
          if (!res.ok || !res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          function read() {
            reader.read().then(({ done, value }) => {
              if (done) {
                // Reconnect after a delay
                retryTimeout = setTimeout(connect, 3000);
                return;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              let eventName = '';
              let dataStr = '';

              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  eventName = line.slice(7).trim();
                } else if (line.startsWith('data: ')) {
                  dataStr = line.slice(6);
                } else if (line === '' && eventName && dataStr) {
                  try {
                    const payload = JSON.parse(dataStr);
                    handleSSEEvent(eventName, payload);
                  } catch { /* ignore */ }
                  eventName = '';
                  dataStr = '';
                }
              }
              read();
            }).catch(() => {
              retryTimeout = setTimeout(connect, 3000);
            });
          }
          read();
        })
        .catch(() => {
          retryTimeout = setTimeout(connect, 5000);
        });
    }

    connect();
    sseRef.current = controller;

    return () => {
      controller.abort();
      clearTimeout(retryTimeout);
    };
  }, [tournamentId]);

  function handleSSEEvent(eventName, payload) {
    if (eventName === 'message_added' && payload.message) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
    } else if (eventName === 'message_updated' && payload.message) {
      setMessages((prev) => prev.map((m) => m.id === payload.message.id ? payload.message : m));
    } else if (eventName === 'message_removed' && payload.message_id) {
      setMessages((prev) => prev.filter((m) => m.id !== payload.message_id));
    } else if (eventName === 'viewer_count') {
      setViewerCount(payload.count || 0);
    }
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages]);

  const showFloatingReaction = useCallback((payload) => {
    const id = ++floatIdRef.current;
    const x = 10 + Math.random() * 80;
    setFloatingReactions((prev) => [...prev.slice(-8), { id, x, payload }]);
  }, []);

  const removeFloating = useCallback((id) => {
    setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || sending || !user) return;
    setSending(true);
    setError('');
    try {
      await sendTournamentDiscussionMessage(tournamentId, { message: trimmed });
      setChatInput('');
      setShowEmoteTray(false);
      const reaction = getLiveReactionPayload(trimmed);
      if (reaction) showFloatingReaction(reaction);
    } catch (err) {
      setError(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleQuickReaction = async (emoji) => {
    if (!user) return;
    showFloatingReaction(typeof emoji === 'string' ? { kind: 'emoji', emoji } : emoji);
    try {
      await sendTournamentDiscussionMessage(tournamentId, { message: typeof emoji === 'string' ? emoji : emoji.token });
    } catch { /* silent */ }
  };

  const handleInsertToken = (token) => {
    setChatInput((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token} `);
    if (chatInputRef.current) chatInputRef.current.focus({ preventScroll: true });
  };

  const handlePump = async (msg) => {
    if (!user || pumpingId) return;
    setPumpingId(msg.id);
    try {
      const data = await pumpTournamentDiscussionMessage(tournamentId, msg.id);
      setMessages((prev) => prev.map((m) => m.id === data.message.id ? data.message : m));
    } catch { /* silent */ }
    setPumpingId('');
  };

  const handleDelete = async (msg) => {
    if (!user || deletingId) return;
    setDeletingId(msg.id);
    try {
      await deleteTournamentDiscussionMessage(tournamentId, msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch { /* silent */ }
    setDeletingId('');
  };

  // Phase-aware mood
  const moodConfig = useMemo(() => {
    if (isSetup) return {
      headerGlow: 'from-cyan-500/20 via-transparent to-blue-500/15',
      accent: 'cyan',
      label: 'Pre-Tournament Hype',
      sublabel: 'Get hyped! Tournament starts soon.',
      icon: '🏟️',
      pulse: true,
    };
    if (isActive) return {
      headerGlow: 'from-rose-500/25 via-transparent to-amber-500/15',
      accent: 'rose',
      label: 'Live Discussion',
      sublabel: 'Tournament in progress!',
      icon: '🔴',
      pulse: true,
    };
    return {
      headerGlow: 'from-amber-500/15 via-transparent to-zinc-500/10',
      accent: 'amber',
      label: 'Post-Tournament',
      sublabel: 'Relive the highlights.',
      icon: '🏆',
      pulse: false,
    };
  }, [isSetup, isActive]);

  if (!loaded) {
    return (
      <div className="tournament-discuss-skeleton rounded-2xl border border-white/8 bg-zinc-950/60 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-4 w-32 rounded-full bg-white/6 animate-pulse" />
          <div className="h-4 w-16 rounded-full bg-white/6 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="h-8 w-8 shrink-0 rounded-full bg-white/6 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded bg-white/6 animate-pulse" />
                <div className="h-3 w-48 rounded bg-white/4 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tournament-discuss relative flex flex-col rounded-2xl border border-white/10 bg-zinc-950/70 overflow-hidden">
      {/* Ambient glow */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${moodConfig.headerGlow} to-transparent opacity-60`} />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`text-base ${moodConfig.pulse ? 'tournament-discuss-pulse' : ''}`}>{moodConfig.icon}</span>
          <div className="min-w-0">
            <p className="text-[12px] font-display font-bold tracking-wide text-white">{moodConfig.label}</p>
            <p className="text-[10px] text-zinc-500 truncate">{moodConfig.sublabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {viewerCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[10px] text-zinc-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className={`absolute inline-flex h-full w-full rounded-full ${isActive ? 'bg-rose-400 animate-ping' : 'bg-zinc-500'} opacity-75`} />
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isActive ? 'bg-rose-400' : 'bg-zinc-500'}`} />
              </span>
              {viewerCount} watching
            </span>
          ) : null}
          {messages.length > 0 ? (
            <span className="text-[10px] text-zinc-600">{messages.length} msgs</span>
          ) : null}
        </div>
      </div>

      {/* Floating reactions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-16 z-30">
        {floatingReactions.map((r) => (
          <FloatingReaction key={r.id} reaction={r} id={r.id} onDone={removeFloating} />
        ))}
      </div>

      {/* Message list */}
      <div
        ref={chatScrollRef}
        className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-1 sm:px-4"
        style={{ minHeight: '200px', maxHeight: 'min(50vh, 480px)', WebkitOverflowScrolling: 'touch', scrollbarGutter: 'stable' }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <span className="text-4xl mb-3 tournament-discuss-bounce">{isSetup ? '🎤' : isActive ? '💬' : '🎊'}</span>
            <p className="text-sm font-display font-bold text-white/80">
              {isSetup ? 'Be the first to hype up!' : isActive ? 'Chat about the action!' : 'Share your thoughts!'}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {isSetup ? 'Drop a message to get the discussion started before the tournament begins.' : isActive ? 'React in real-time as matches unfold.' : 'Discuss results, standout plays, and memorable moments.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = user && msg.user_id === user.id;
            const isPumping = pumpingId === msg.id;
            const isDeleting = deletingId === msg.id;

            return (
              <div
                key={msg.id}
                className={`tournament-discuss-msg group relative rounded-xl px-3 py-2 transition-colors ${
                  msg.is_participant
                    ? 'bg-gradient-to-r from-rose-500/[0.06] to-transparent border border-rose-400/12 hover:border-rose-400/20'
                    : 'bg-white/[0.02] border border-white/[0.04] hover:border-white/10'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Avatar */}
                  <div className={`relative shrink-0 mt-0.5 ${msg.is_participant ? 'tournament-discuss-participant-ring' : ''}`}>
                    <div className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border bg-zinc-900 font-display font-bold text-white text-[10px] ${
                      msg.is_participant ? 'border-rose-400/30' : 'border-white/10'
                    }`}>
                      {msg.avatar ? (
                        <img src={msg.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span>{getInitial(msg.username)}</span>
                      )}
                    </div>
                    {msg.is_participant ? (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[7px] ring-2 ring-zinc-950" title="Tournament Player">
                        ⚔
                      </span>
                    ) : null}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[11px] font-display font-bold truncate max-w-[10rem] ${
                        msg.is_participant ? 'text-rose-100' : 'text-white'
                      }`}>
                        {msg.username || 'Anonymous'}
                      </span>
                      {msg.is_participant ? (
                        <span className="tournament-discuss-badge shrink-0 inline-flex items-center gap-0.5 rounded-md border border-rose-400/25 bg-rose-500/12 px-1.5 py-px text-[8px] font-display font-bold uppercase tracking-widest text-rose-200">
                          Player
                        </span>
                      ) : null}
                      {msg.skill_title ? (
                        <span className="text-[9px] font-display text-cyan-300/60 truncate max-w-[6rem]">{msg.skill_title}</span>
                      ) : null}
                      <span className="text-[9px] text-zinc-600 shrink-0">{timeAgo(msg.created_at)}</span>
                    </div>

                    <DiscussionMessageBody message={msg.message} />
                  </div>

                  {/* Pump button */}
                  {user ? (
                    <button
                      type="button"
                      onClick={() => handlePump(msg)}
                      disabled={isPumping}
                      className={`mt-1 shrink-0 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-display font-bold transition-all ${
                        msg.user_pumped
                          ? 'border-amber-400/30 bg-amber-500/12 text-amber-300 tournament-discuss-pumped'
                          : 'border-white/8 bg-white/[0.02] text-zinc-500 hover:border-amber-400/25 hover:text-amber-300'
                      } disabled:opacity-50 active:scale-90`}
                      title={msg.user_pumped ? 'Un-pump' : 'Pump it!'}
                    >
                      <img
                        src={msg.user_pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'}
                        alt=""
                        className={`h-3.5 w-3.5 ${isPumping ? 'animate-bounce' : ''}`}
                      />
                      {msg.pump_count > 0 ? <span>{msg.pump_count}</span> : null}
                    </button>
                  ) : null}
                </div>

                {/* Delete own message */}
                {isOwnMessage ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(msg)}
                    disabled={isDeleting}
                    className="absolute top-1.5 right-2 hidden group-hover:inline-flex text-[9px] text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? '...' : 'Delete'}
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Quick reactions bar */}
      {user ? (
        <div className="relative z-10 border-t border-white/8 px-3 py-2 sm:px-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-display font-semibold text-zinc-500">Quick react</p>
            <div className="flex gap-1">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleQuickReaction(emoji)}
                  className="h-7 w-7 rounded-lg border border-white/8 bg-white/[0.03] text-sm transition-all hover:scale-110 hover:border-rose-400/30 hover:bg-rose-500/8 active:scale-90"
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowEmoteTray((v) => !v)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-display font-semibold transition-all ${
                  showEmoteTray
                    ? 'border-rose-400/30 bg-rose-500/12 text-rose-200'
                    : 'border-white/8 bg-white/[0.03] text-zinc-400 hover:border-rose-400/25 hover:text-white'
                }`}
              >
                Emotes
              </button>
            </div>
          </div>

          {/* Emote tray */}
          {showEmoteTray ? (
            <div className="mb-2">
              <EmoteTray
                onReact={(emoji) => handleQuickReaction(emoji)}
                onInsert={handleInsertToken}
                onClose={() => setShowEmoteTray(false)}
              />
            </div>
          ) : null}

          {/* Chat input */}
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:border-rose-400/30 focus:outline-none focus:ring-1 focus:ring-rose-400/20 transition-all"
              placeholder={isSetup ? 'Hype it up! Use :shinsa_hype: for emotes' : isActive ? 'React to the action...' : 'Share your thoughts...'}
              maxLength={500}
            />
            <button
              type="submit"
              disabled={sending || !chatInput.trim()}
              className={`shrink-0 rounded-xl border px-4 py-2.5 text-[12px] font-display font-bold uppercase tracking-wider transition-all disabled:opacity-40 ${
                isActive
                  ? 'border-rose-400/30 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 active:scale-95'
                  : 'border-white/12 bg-white/6 text-white hover:bg-white/10 active:scale-95'
              }`}
            >
              {sending ? '...' : 'Send'}
            </button>
          </form>

          {isCurrentUserParticipant ? (
            <p className="mt-1.5 text-[9px] text-rose-300/60 flex items-center gap-1">
              <span>⚔</span> Posting as tournament player
            </p>
          ) : null}
          {error ? <p className="mt-1 text-[10px] text-red-400">{error}</p> : null}
        </div>
      ) : (
        <div className="relative z-10 border-t border-white/8 px-4 py-4 text-center">
          <p className="text-[12px] text-zinc-400">
            <Link to="/login" className="text-rose-300 hover:text-rose-200 font-display font-bold transition-colors">Log in</Link> to join the discussion
          </p>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  getTournamentDiscussion,
  sendTournamentDiscussionMessage,
  pumpTournamentDiscussionMessage,
  deleteTournamentDiscussionMessage,
} from '../../utils/api';
import { LIVE_EMOTE_TRAY_GROUPS, LIVE_EMOJI_GROUPS, tokenizeLiveMessage, getLiveReactionPayload } from '../../utils/liveEmotes';
import LiveEmote from '../LiveEmote';

const API_BASE = '/api';

const THREAD_EMOJI_PALETTE = [
  '🔥', '⚡', '🏆', '💪', '🎯', '💬', '🫡', '🤔',
  '📣', '👀', '🎉', '😂', '💖', '🕹️', '🎵', '📊',
  '💯', '🚀', '🧊', '🫠', '☠️', '🤝', '🏅', '✨',
];

function getInitial(name) {
  return String(name || '?').charAt(0).toUpperCase();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.max(0, Date.now() - new Date(`${dateStr}Z`).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function MessageBody({ message }) {
  const reaction = getLiveReactionPayload(message);
  if (reaction?.kind === 'emoji') return <p className="mt-1 text-2xl leading-none">{reaction.emoji}</p>;
  if (reaction?.kind === 'emote') return <div className="mt-1.5"><LiveEmote emote={reaction.emote} size="reaction" /></div>;

  const segments = tokenizeLiveMessage(message);
  if (segments.length === 0) {
    return <p className="text-[13px] text-zinc-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{message}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1 text-[13px] text-zinc-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
      {segments.map((seg, i) =>
        seg.type === 'emote'
          ? <LiveEmote key={`${seg.emote.token}-${i}`} emote={seg.emote} size="inline" />
          : <span key={`t-${i}`}>{seg.text}</span>
      )}
    </div>
  );
}

function AuthorLine({ msg, compact = false }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${compact ? '' : 'mb-1'}`}>
      <div className={`relative shrink-0 ${msg.is_participant ? 'td-wall-participant-ring' : ''}`}>
        <div className={`flex items-center justify-center overflow-hidden rounded-full border bg-zinc-900 font-display font-bold text-white ${
          compact ? 'h-6 w-6 text-[8px]' : 'h-7 w-7 text-[9px]'
        } ${msg.is_participant ? 'border-rose-400/30' : 'border-white/10'}`}>
          {msg.avatar
            ? <img src={msg.avatar} alt="" className="h-full w-full object-cover" />
            : <span>{getInitial(msg.username)}</span>}
        </div>
        {msg.is_participant ? (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-rose-500 text-[6px] ring-[1.5px] ring-zinc-950">⚔</span>
        ) : null}
      </div>
      <span className={`font-display font-bold truncate max-w-[9rem] ${msg.is_participant ? 'text-rose-100' : 'text-white'} ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        {msg.username || 'Anonymous'}
      </span>
      {msg.is_participant ? (
        <span className="td-wall-badge shrink-0 rounded-md border border-rose-400/25 bg-rose-500/12 px-1.5 py-px text-[7px] font-display font-bold uppercase tracking-widest text-rose-200">Player</span>
      ) : null}
      {msg.skill_title ? <span className="text-[8px] font-display text-cyan-300/50 truncate max-w-[5rem]">{msg.skill_title}</span> : null}
      <span className="text-[8px] text-zinc-600 shrink-0">{timeAgo(msg.created_at)}</span>
    </div>
  );
}

function PumpButton({ msg, pumping, onPump, size = 'sm' }) {
  const isPumping = pumping === msg.id;
  return (
    <button
      type="button"
      onClick={() => onPump(msg)}
      disabled={isPumping}
      className={`shrink-0 inline-flex items-center gap-1 rounded-lg border font-display font-bold transition-all active:scale-90 disabled:opacity-50 ${
        msg.user_pumped
          ? 'border-amber-400/30 bg-amber-500/12 text-amber-300 td-wall-pumped'
          : 'border-white/8 bg-white/[0.02] text-zinc-500 hover:border-amber-400/25 hover:text-amber-300'
      } ${size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]'}`}
      title={msg.user_pumped ? 'Un-pump' : 'Pump it!'}
    >
      <img
        src={msg.user_pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'}
        alt=""
        className={`${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${isPumping ? 'animate-bounce' : ''}`}
      />
      {msg.pump_count > 0 ? <span>{msg.pump_count}</span> : null}
    </button>
  );
}

function EmoteTray({ onInsert, onClose }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-display font-semibold text-zinc-300">Emotes</p>
        <button type="button" onClick={onClose} className="text-[10px] text-zinc-500 hover:text-white transition-colors">Close</button>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {LIVE_EMOJI_GROUPS.flatMap(g => g.emojis).map((emoji) => (
          <button key={emoji} type="button" onClick={() => onInsert(emoji)}
            className="h-8 w-8 rounded-lg border border-white/8 bg-white/4 text-base transition-all hover:scale-110 hover:border-rose-400/30 hover:bg-rose-500/10 active:scale-95">
            {emoji}
          </button>
        ))}
      </div>
      <div className="max-h-[25vh] overflow-y-auto overscroll-contain pr-1 space-y-3">
        {LIVE_EMOTE_TRAY_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[9px] font-display font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">{group.label}</p>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {group.emotes.map((emote) => (
                <button key={emote.token} type="button" onClick={() => onInsert(emote.token)}
                  className="group flex flex-col items-center gap-0.5 rounded-lg border border-white/6 bg-white/[0.02] p-1.5 transition-all hover:border-rose-400/25 hover:bg-rose-500/8 active:scale-95">
                  <LiveEmote emote={emote} size="tray" showLabel={false} />
                  <span className="text-[8px] text-zinc-500 group-hover:text-zinc-300 truncate max-w-full">{emote.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadCard({ thread, user, pumpingId, onPump, onReply, onDelete, expanded, onToggleExpand }) {
  const emoji = thread.thread_emoji || '💬';
  const isOwn = user && thread.user_id === user.id;
  const replies = thread.replies || [];
  const hasReplies = replies.length > 0;

  return (
    <div className="td-wall-card group relative rounded-2xl border border-white/8 bg-zinc-950/60 overflow-hidden transition-all hover:border-white/14">
      {/* Thread emoji accent stripe */}
      <div className="td-wall-emoji-stripe pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ '--td-emoji-hue': emojiHue(emoji) }} />

      {/* Header: emoji + author + pump */}
      <div className="relative px-4 pt-4 pb-0 sm:px-5">
        <div className="flex items-start gap-3">
          {/* Big emoji badge */}
          <div className="td-wall-emoji-orb shrink-0 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-xl" style={{ '--td-emoji-hue': emojiHue(emoji) }}>
            {emoji}
          </div>

          <div className="min-w-0 flex-1">
            <AuthorLine msg={thread} />
            <div className="mt-1">
              <MessageBody message={thread.message} />
            </div>
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          {user ? <PumpButton msg={thread} pumping={pumpingId} onPump={onPump} /> : null}
          {user ? (
            <button type="button" onClick={() => onReply(thread.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.02] px-2 py-1 text-[10px] font-display font-bold text-zinc-500 transition-all hover:border-cyan-400/25 hover:text-cyan-300 active:scale-95">
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8.5 2 11l3 2.5" /><path d="M2 11h7a4 4 0 0 0 0-8H6" /></svg>
              Reply
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {hasReplies ? (
            <button type="button" onClick={() => onToggleExpand(thread.id)}
              className="inline-flex items-center gap-1 text-[10px] font-display font-bold text-zinc-500 hover:text-white transition-colors">
              <span className="td-wall-reply-count rounded-full border border-white/10 bg-white/4 px-2 py-0.5 tabular-nums">{replies.length}</span>
              <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 6 4 4 4-4" /></svg>
            </button>
          ) : null}
          {isOwn ? (
            <button type="button" onClick={() => onDelete(thread)}
              className="hidden group-hover:inline-flex text-[9px] text-zinc-600 hover:text-red-400 transition-colors">Delete</button>
          ) : null}
        </div>
      </div>

      {/* Replies */}
      {expanded && hasReplies ? (
        <div className="td-wall-replies border-t border-white/6 bg-white/[0.01]">
          {replies.map((reply, i) => (
            <div key={reply.id} className={`td-wall-reply flex items-start gap-2.5 px-4 py-2.5 sm:px-5 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
              <div className="min-w-0 flex-1">
                <AuthorLine msg={reply} compact />
                <div className="mt-0.5 pl-[1.875rem]">
                  <MessageBody message={reply.message} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-1">
                {user ? <PumpButton msg={reply} pumping={pumpingId} onPump={onPump} size="sm" /> : null}
                {user && reply.user_id === user.id ? (
                  <button type="button" onClick={() => onDelete(reply)}
                    className="hidden group-hover:inline-flex text-[8px] text-zinc-600 hover:text-red-400 transition-colors">Del</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function emojiHue(emoji) {
  let hash = 0;
  const s = String(emoji || '');
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl transition-all active:scale-90 ${
          value ? 'border-white/15 bg-white/6' : 'border-dashed border-white/15 bg-white/[0.02] text-zinc-500'
        }`}>
        {value || '?'}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1.5 rounded-xl border border-white/10 bg-zinc-950/98 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          <div className="grid grid-cols-6 gap-1">
            {THREAD_EMOJI_PALETTE.map((e) => (
              <button key={e} type="button" onClick={() => { onChange(e); setOpen(false); }}
                className={`h-9 w-9 rounded-lg text-lg transition-all hover:scale-115 active:scale-90 ${value === e ? 'bg-rose-500/20 ring-1 ring-rose-400/40' : 'hover:bg-white/6'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NewThreadForm({ onSubmit, sending, isSetup, isActive }) {
  const [message, setMessage] = useState('');
  const [emoji, setEmoji] = useState('');
  const [showEmotes, setShowEmotes] = useState(false);
  const inputRef = useRef(null);

  const handleInsertToken = (token) => {
    setMessage((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token} `);
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSubmit({ message: message.trim(), thread_emoji: emoji || '💬' });
    setMessage('');
    setEmoji('');
    setShowEmotes(false);
  };

  return (
    <form onSubmit={handleSubmit} className="td-wall-compose rounded-2xl border border-white/10 bg-zinc-950/60 p-4 sm:p-5">
      <p className="text-[10px] font-display font-bold uppercase tracking-widest text-zinc-500 mb-3">
        {isSetup ? 'Start a hype thread' : isActive ? 'Post to the wall' : 'Share your thoughts'}
      </p>
      <div className="flex gap-3">
        <EmojiPicker value={emoji} onChange={setEmoji} />
        <div className="min-w-0 flex-1">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:border-rose-400/30 focus:outline-none focus:ring-1 focus:ring-rose-400/20 transition-all"
            placeholder={isSetup ? "Who\u2019s gonna take it? Drop your predictions..." : isActive ? 'What a play! Talk about it...' : 'That tournament was wild...'}
            rows={2}
            maxLength={500}
          />
        </div>
      </div>

      {showEmotes ? (
        <div className="mt-3">
          <EmoteTray onInsert={handleInsertToken} onClose={() => setShowEmotes(false)} />
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setShowEmotes(v => !v)}
          className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-display font-semibold transition-all ${
            showEmotes ? 'border-rose-400/30 bg-rose-500/12 text-rose-200' : 'border-white/8 bg-white/[0.03] text-zinc-400 hover:text-white'
          }`}>
          Emotes
        </button>
        <button type="submit" disabled={sending || !message.trim()}
          className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-5 py-2 text-[11px] font-display font-bold uppercase tracking-wider text-rose-100 transition-all hover:bg-rose-500/25 active:scale-95 disabled:opacity-40">
          {sending ? '...' : 'Post'}
        </button>
      </div>
    </form>
  );
}

function ReplyForm({ threadId, onSubmit, sending }) {
  const [message, setMessage] = useState('');
  const [showEmotes, setShowEmotes] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  const handleInsertToken = (token) => {
    setMessage((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token} `);
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSubmit({ message: message.trim(), parent_id: threadId });
    setMessage('');
    setShowEmotes(false);
  };

  return (
    <div className="td-wall-reply-form border-t border-white/6 bg-white/[0.015] px-4 py-3 sm:px-5">
      {showEmotes ? (
        <div className="mb-3">
          <EmoteTray onInsert={handleInsertToken} onClose={() => setShowEmotes(false)} />
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:border-cyan-400/30 focus:outline-none focus:ring-1 focus:ring-cyan-400/15 transition-all"
          placeholder="Write a reply..."
          maxLength={500}
        />
        <button type="button" onClick={() => setShowEmotes(v => !v)}
          className={`shrink-0 rounded-lg border px-2 py-1.5 text-[10px] font-display font-semibold transition-all ${
            showEmotes ? 'border-rose-400/30 bg-rose-500/12 text-rose-200' : 'border-white/8 bg-white/[0.03] text-zinc-400 hover:text-white'
          }`}>
          😀
        </button>
        <button type="submit" disabled={sending || !message.trim()}
          className="shrink-0 rounded-xl border border-cyan-400/25 bg-cyan-500/12 px-4 py-2 text-[11px] font-display font-bold text-cyan-100 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-40">
          {sending ? '...' : 'Reply'}
        </button>
      </form>
    </div>
  );
}

export default function TournamentDiscussion({ tournamentId, players = [], tournament = null }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [pumpingId, setPumpingId] = useState('');
  const [expandedThreads, setExpandedThreads] = useState(new Set());
  const [replyingTo, setReplyingTo] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const isActive = tournament?.phase !== 'SETUP' && tournament?.phase !== 'COMPLETED';
  const isSetup = tournament?.phase === 'SETUP';

  const isCurrentUserParticipant = useMemo(() => {
    if (!user) return false;
    const names = new Set(players.filter(p => p.name).map(p => p.name.toLowerCase()));
    return names.has((user.username || '').toLowerCase());
  }, [user, players]);

  // Load threads
  const loadThreads = useCallback(async () => {
    try {
      const data = await getTournamentDiscussion(tournamentId);
      setThreads(data.threads || []);
      setViewerCount(data.viewer_count || 0);
    } catch (err) {
      console.error('Failed to load discussion:', err);
    } finally {
      setLoaded(true);
    }
  }, [tournamentId]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // SSE real-time connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    const url = `${API_BASE}/tournaments/${tournamentId}/discussion/stream`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
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
              if (done) { retryTimeout = setTimeout(connect, 3000); return; }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              let eventName = '', dataStr = '';
              for (const line of lines) {
                if (line.startsWith('event: ')) eventName = line.slice(7).trim();
                else if (line.startsWith('data: ')) dataStr = line.slice(6);
                else if (line === '' && eventName && dataStr) {
                  try { handleSSE(eventName, JSON.parse(dataStr)); } catch { /* */ }
                  eventName = ''; dataStr = '';
                }
              }
              read();
            }).catch(() => { retryTimeout = setTimeout(connect, 3000); });
          }
          read();
        })
        .catch(() => { retryTimeout = setTimeout(connect, 5000); });
    }
    connect();
    return () => { controller.abort(); clearTimeout(retryTimeout); };
  }, [tournamentId]);

  function handleSSE(event, payload) {
    if (event === 'thread_added' && payload.message) {
      setThreads(prev => {
        if (prev.some(t => t.id === payload.message.id)) return prev;
        return [{ ...payload.message, replies: [] }, ...prev];
      });
    } else if (event === 'reply_added' && payload.message) {
      setThreads(prev => prev.map(t => {
        if (t.id === payload.message.parent_id) {
          const replies = t.replies || [];
          if (replies.some(r => r.id === payload.message.id)) return t;
          return { ...t, reply_count: (t.reply_count || 0) + 1, replies: [...replies, payload.message] };
        }
        return t;
      }));
      // Auto-expand thread when new reply arrives
      if (payload.message.parent_id) {
        setExpandedThreads(prev => new Set(prev).add(payload.message.parent_id));
      }
    } else if (event === 'message_updated' && payload.message) {
      setThreads(prev => prev.map(t => {
        if (t.id === payload.message.id) return { ...t, ...payload.message, replies: t.replies };
        const replies = (t.replies || []).map(r => r.id === payload.message.id ? payload.message : r);
        return { ...t, replies };
      }));
    } else if (event === 'message_removed') {
      const { message_id, parent_id } = payload;
      if (!parent_id) {
        setThreads(prev => prev.filter(t => t.id !== message_id));
      } else {
        setThreads(prev => prev.map(t => {
          if (t.id === parent_id) {
            return { ...t, reply_count: Math.max(0, (t.reply_count || 0) - 1), replies: (t.replies || []).filter(r => r.id !== message_id) };
          }
          return t;
        }));
      }
    } else if (event === 'viewer_count') {
      setViewerCount(payload.count || 0);
    }
  }

  const handleNewThread = async (data) => {
    if (!user || sending) return;
    setSending(true); setError('');
    try {
      await sendTournamentDiscussionMessage(tournamentId, data);
    } catch (err) { setError(err.message || 'Failed to post'); }
    setSending(false);
  };

  const handleReply = async (data) => {
    if (!user || sending) return;
    setSending(true); setError('');
    try {
      await sendTournamentDiscussionMessage(tournamentId, data);
      setReplyingTo(null);
    } catch (err) { setError(err.message || 'Failed to reply'); }
    setSending(false);
  };

  const handlePump = async (msg) => {
    if (!user || pumpingId) return;
    setPumpingId(msg.id);
    try {
      const data = await pumpTournamentDiscussionMessage(tournamentId, msg.id);
      // Optimistic: SSE will also update
      setThreads(prev => prev.map(t => {
        if (t.id === data.message.id) return { ...t, ...data.message, replies: t.replies };
        const replies = (t.replies || []).map(r => r.id === data.message.id ? data.message : r);
        return { ...t, replies };
      }));
    } catch { /* */ }
    setPumpingId('');
  };

  const handleDelete = async (msg) => {
    if (!user) return;
    try {
      await deleteTournamentDiscussionMessage(tournamentId, msg.id);
    } catch { /* */ }
  };

  const toggleExpand = (threadId) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      next.has(threadId) ? next.delete(threadId) : next.add(threadId);
      return next;
    });
  };

  const handleReplyClick = (threadId) => {
    setReplyingTo(prev => prev === threadId ? null : threadId);
    setExpandedThreads(prev => new Set(prev).add(threadId));
  };

  const moodConfig = useMemo(() => {
    if (isSetup) return { glow: 'from-cyan-500/20 via-transparent to-blue-500/15', icon: '🏟️', label: 'Pre-Tournament Hype', sub: 'Predictions, trash talk, hype threads', pulse: true };
    if (isActive) return { glow: 'from-rose-500/25 via-transparent to-amber-500/15', icon: '🔴', label: 'Live Wall', sub: 'React to the action in real-time', pulse: true };
    return { glow: 'from-amber-500/15 via-transparent to-zinc-500/10', icon: '🏆', label: 'Post-Tournament', sub: 'Highlights, GGs, and memories', pulse: false };
  }, [isSetup, isActive]);

  const totalPosts = threads.length;
  const totalReplies = threads.reduce((acc, t) => acc + (t.replies?.length || 0), 0);

  if (!loaded) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="rounded-2xl border border-white/8 bg-zinc-950/60 p-5">
            <div className="flex gap-3">
              <div className="h-11 w-11 rounded-xl bg-white/6 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-white/6 animate-pulse" />
                <div className="h-3 w-48 rounded bg-white/4 animate-pulse" />
                <div className="h-3 w-24 rounded bg-white/4 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="td-wall space-y-4">
      {/* Header bar */}
      <div className="relative rounded-2xl border border-white/10 bg-zinc-950/70 overflow-hidden">
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${moodConfig.glow} to-transparent opacity-60`} />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`text-lg ${moodConfig.pulse ? 'td-wall-pulse' : ''}`}>{moodConfig.icon}</span>
            <div className="min-w-0">
              <p className="text-[12px] font-display font-bold tracking-wide text-white">{moodConfig.label}</p>
              <p className="text-[10px] text-zinc-500 truncate">{moodConfig.sub}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {totalPosts > 0 ? (
              <span className="text-[10px] text-zinc-500 tabular-nums">{totalPosts} thread{totalPosts !== 1 ? 's' : ''} · {totalReplies} repl{totalReplies !== 1 ? 'ies' : 'y'}</span>
            ) : null}
            {viewerCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[10px] text-zinc-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className={`absolute inline-flex h-full w-full rounded-full ${isActive ? 'bg-rose-400 animate-ping' : 'bg-zinc-500'} opacity-75`} />
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isActive ? 'bg-rose-400' : 'bg-zinc-500'}`} />
                </span>
                {viewerCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* New thread form */}
      {user ? (
        <>
          <NewThreadForm onSubmit={handleNewThread} sending={sending} isSetup={isSetup} isActive={isActive} />
          {isCurrentUserParticipant ? (
            <p className="text-[9px] text-rose-300/60 flex items-center gap-1 -mt-2 pl-1">
              <span>⚔</span> Posting as tournament player
            </p>
          ) : null}
          {error ? <p className="text-[10px] text-red-400 -mt-2 pl-1">{error}</p> : null}
        </>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-zinc-950/60 px-5 py-5 text-center">
          <p className="text-[12px] text-zinc-400">
            <Link to="/login" className="text-rose-300 hover:text-rose-200 font-display font-bold transition-colors">Log in</Link> to post on the wall
          </p>
        </div>
      )}

      {/* Thread list */}
      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <span className="text-5xl mb-4 td-wall-bounce">{isSetup ? '📣' : isActive ? '🔥' : '🎊'}</span>
          <p className="text-sm font-display font-bold text-white/80">
            {isSetup ? 'The wall is empty — be first!' : isActive ? 'Drop the first take!' : 'No posts yet — relive the moments!'}
          </p>
          <p className="mt-1.5 text-[11px] text-zinc-500 max-w-xs">
            {isSetup ? 'Pick an emoji, write your prediction, and start the hype.' : isActive ? 'Post your reactions, callouts, and hot takes as matches unfold.' : 'Share your favorite moments, congratulate winners, or just say GG.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map(thread => (
            <React.Fragment key={thread.id}>
              <ThreadCard
                thread={thread}
                user={user}
                pumpingId={pumpingId}
                onPump={handlePump}
                onReply={handleReplyClick}
                onDelete={handleDelete}
                expanded={expandedThreads.has(thread.id)}
                onToggleExpand={toggleExpand}
              />
              {replyingTo === thread.id && user ? (
                <ReplyForm threadId={thread.id} onSubmit={handleReply} sending={sending} />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

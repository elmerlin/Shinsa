import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import {
  getOnlineDuel, getOnlineDuelChat, sendChatMessage, joinOnlineDuel,
  onlineDuelDraw, onlineDuelAccept, onlineDuelDecline, onlineDuelSubmitScore,
  onlineDuelFetchScore,
  onlineDuelEndRequest, onlineDuelCancelEnd,
  pumpPlayer, getMyPump,
  onlineDuelRematch, onlineDuelForfeit, sendSpectateHeartbeat,
  predictDuelWinner, getDuelPredictions, createPost,
  getPiugameCredentialStatus,
} from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag, getSkillColor, GENDER_SYMBOLS } from '../components/PlayerRegistration';
import { SongJacket } from './DuelView';
import { getProfilePath } from '../utils/profile';

const RANKS = [
  { min: 995000, label: 'SSS+', color: 'text-sky-300',      bg: 'bg-sky-400/20 border-sky-400/40' },
  { min: 990000, label: 'SSS',  color: 'text-sky-400',      bg: 'bg-sky-400/15 border-sky-400/30' },
  { min: 985000, label: 'SS+',  color: 'text-piu-gold',     bg: 'bg-piu-gold/20 border-piu-gold/40' },
  { min: 980000, label: 'SS',   color: 'text-yellow-400',   bg: 'bg-yellow-400/15 border-yellow-400/30' },
  { min: 975000, label: 'S+',   color: 'text-amber-400',    bg: 'bg-amber-400/15 border-amber-400/30' },
  { min: 970000, label: 'S',    color: 'text-amber-500',    bg: 'bg-amber-500/15 border-amber-500/30' },
  { min: 960000, label: 'AAA+', color: 'text-piu-silver',   bg: 'bg-piu-silver/15 border-piu-silver/30' },
  { min: 950000, label: 'AAA',  color: 'text-gray-300',     bg: 'bg-gray-300/15 border-gray-300/30' },
  { min: 925000, label: 'AA+',  color: 'text-piu-bronze',   bg: 'bg-piu-bronze/15 border-piu-bronze/30' },
  { min: 900000, label: 'AA',   color: 'text-piu-bronze',   bg: 'bg-piu-bronze/15 border-piu-bronze/30' },
  { min: 825000, label: 'A+',   color: 'text-amber-700',    bg: 'bg-amber-700/15 border-amber-700/30' },
  { min: 750000, label: 'A',    color: 'text-amber-700',    bg: 'bg-amber-700/15 border-amber-700/30' },
  { min: 650000, label: 'B',    color: 'text-gray-600',     bg: 'bg-gray-600/15 border-gray-600/30' },
  { min: 550000, label: 'C',    color: 'text-gray-600',     bg: 'bg-gray-600/15 border-gray-600/30' },
  { min: 450000, label: 'D',    color: 'text-gray-600',     bg: 'bg-gray-600/15 border-gray-600/30' },
  { min: 0,      label: 'F',    color: 'text-gray-600',     bg: 'bg-gray-600/15 border-gray-600/30' },
];

function getRank(score) {
  const s = parseInt(score) || 0;
  for (const r of RANKS) {
    if (s >= r.min) return r;
  }
  return RANKS[RANKS.length - 1];
}

export default function OnlineDuelRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [duel, setDuel] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [guestName, setGuestName] = useState('');
  const [drawLevel, setDrawLevel] = useState(15);
  const [drawMode, setDrawMode] = useState('any');
  const [scoreEntry, setScoreEntry] = useState(null);
  const [selectedBreakdown, setSelectedBreakdown] = useState(null);
  const [tab, setTab] = useState('match');
  const [statsFilter, setStatsFilter] = useState('all');
  const [myPump, setMyPump] = useState(null);
  const [pumpFeedback, setPumpFeedback] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [myPrediction, setMyPrediction] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [fetchingScore, setFetchingScore] = useState(false);
  const [hasPiugameCreds, setHasPiugameCreds] = useState(null);
  const chatEndRef = useRef(null);
  const lastChatTime = useRef('');
  const reactionIdRef = useRef(0);
  const songCardRef = useRef(null);
  const drawAreaRef = useRef(null);
  const sessionIdRef = useRef(() => {
    const stored = sessionStorage.getItem('spectate_session');
    if (stored) return stored;
    const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('spectate_session', sid);
    return sid;
  });

  // Determine current user's role
  const playerSlot = duel && user ? (
    duel.creator_user_id === user.id ? 'player1' :
    duel.opponent_user_id === user.id ? 'player2' : null
  ) : null;
  const isParticipant = !!playerSlot;
  const isChatLocked = duel?.status === 'COMPLETED';

  // Poll for duel state
  useEffect(() => {
    const load = () => getOnlineDuel(id).then(setDuel).catch(() => {});
    load();
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
  }, [id]);

  // Poll for chat
  useEffect(() => {
    const loadChat = () => {
      getOnlineDuelChat(id, lastChatTime.current).then(msgs => {
        if (msgs.length > 0) {
          setChat(prev => [...prev, ...msgs]);
          lastChatTime.current = msgs[msgs.length - 1].created_at;
        }
      }).catch(() => {});
    };
    loadChat();
    const interval = setInterval(loadChat, 2000);
    return () => clearInterval(interval);
  }, [id]);

  // Auto-scroll chat only within the chat container (not the page)
  useEffect(() => {
    const container = chatEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chat]);

  // Current song (non-completed)
  const currentSong = duel?.songs?.find(s => s.status !== 'completed');

  // Scroll to song card when a new song is drawn
  const prevSongRef = useRef(null);
  useEffect(() => {
    if (currentSong && currentSong.status === 'drawn' && prevSongRef.current !== currentSong.id) {
      prevSongRef.current = currentSong.id;
      setTimeout(() => {
        songCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [currentSong]);

  // Fetch user's pump choice, prediction, and PIUGame credential status
  useEffect(() => {
    if (user) {
      getMyPump(id).then(r => setMyPump(r.player)).catch(() => {});
      getDuelPredictions(id).then(r => setMyPrediction(r.myPick)).catch(() => {});
      getPiugameCredentialStatus().then(r => setHasPiugameCreds(r.linked)).catch(() => setHasPiugameCreds(false));
    }
  }, [id, user]);

  // Spectator heartbeat — sends a ping every 10 seconds
  useEffect(() => {
    const sid = typeof sessionIdRef.current === 'function' ? sessionIdRef.current() : sessionIdRef.current;
    sessionIdRef.current = sid;
    const ping = () => sendSpectateHeartbeat(id, sid).catch(() => {});
    ping();
    const interval = setInterval(ping, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const handlePump = async (player) => {
    if (!user) return;
    try {
      const res = await pumpPlayer(id, player);
      setMyPump(res.pumped || null);
      if (res.pumped) {
        const name = player === 'player1' ? duel.player1_name : duel.player2_name;
        setPumpFeedback({ player, name });
        setTimeout(() => setPumpFeedback(null), 1500);
      }
      getOnlineDuel(id).then(setDuel).catch(() => {});
    } catch (err) { alert(err.message); }
  };

  const QUICK_EMOJIS = ['🔥', '💪', '👏', '😤', '🎯', '💀', '😂', '❤️', '⚡', '🏆', '👀', '🫡'];
  const QUICK_REACTIONS = ['🔥', '💪', '👏', '💀', '😂', '❤️'];

  const addFloatingReaction = (emoji) => {
    const rid = reactionIdRef.current++;
    const x = 20 + Math.random() * 60;
    setFloatingReactions(prev => [...prev, { id: rid, emoji, x }]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== rid));
    }, 2000);
  };

  const handleQuickReaction = async (emoji) => {
    if (isChatLocked) return;
    addFloatingReaction(emoji);
    try {
      await sendChatMessage(id, { message: emoji, guest_name: guestName || undefined });
    } catch (err) { /* ignore */ }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (isChatLocked) return;
    if (!chatInput.trim()) return;
    try {
      await sendChatMessage(id, { message: chatInput, guest_name: guestName || undefined });
      setChatInput('');
    } catch (err) { /* ignore */ }
  };

  const handleJoin = async () => {
    try {
      await joinOnlineDuel(id);
    } catch (err) { alert(err.message); }
  };

  const handleDraw = async () => {
    if (!drawLevel || parseInt(drawLevel) < 1) return alert('Please enter a level');
    try {
      await onlineDuelDraw(id, { level: parseInt(drawLevel), draw_mode: drawMode === 'any' ? undefined : drawMode });
    } catch (err) { alert(err.message); }
  };

  const handleAccept = async (songId) => {
    try {
      await onlineDuelAccept(id, songId);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 300);
    } catch (err) { alert(err.message); }
  };

  const handleDecline = async (songId) => {
    try {
      await onlineDuelDecline(id, songId);
      setTimeout(() => drawAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    } catch (err) { alert(err.message); }
  };

  const handleSubmitScore = async () => {
    if (!scoreEntry) return;
    try {
      await onlineDuelSubmitScore(id, {
        score: Number(scoreEntry.score) || 0,
        perfect: 0, great: 0, good: 0, bad: 0, miss: 0,
        max_combo: 0, kcal: 0,
      });
      setScoreEntry(null);
    } catch (err) { alert(err.message); }
  };

  const handleFetchScore = async () => {
    setFetchingScore(true);
    try {
      await onlineDuelFetchScore(id);
    } catch (err) { alert(err.message); }
    finally { setFetchingScore(false); }
  };

  const handleEndRequest = async () => {
    if (!confirm('Request to end the duel? Both players must agree.')) return;
    try { await onlineDuelEndRequest(id); } catch (err) { alert(err.message); }
  };

  const handleForfeit = async () => {
    if (!confirm('Are you sure you want to forfeit? Your opponent will win the duel.')) return;
    try { await onlineDuelForfeit(id); } catch (err) { alert(err.message); }
  };

  const handleRematch = async () => {
    try {
      const res = await onlineDuelRematch(id);
      if (res.id) navigate(`/online-duel/${res.id}`);
    } catch (err) { alert(err.message); }
  };

  const handlePredict = async (player) => {
    if (!user) return;
    try {
      await predictDuelWinner(id, player);
      setMyPrediction(player);
      getOnlineDuel(id).then(setDuel).catch(() => {});
    } catch (err) { alert(err.message); }
  };

  const handleShareToFeed = async () => {
    if (!user || !duel || duel.status !== 'COMPLETED') return;
    setSharing(true);
    try {
      const winnerName = duel.winner === 'draw' ? 'Draw' : duel.winner === 'player1' ? duel.player1_name : duel.player2_name;
      const content = `Online Duel Result: ${duel.player1_name} vs ${duel.player2_name}\n${stats.p1Wins} - ${stats.p2Wins}${duel.best_of ? ` (Best of ${duel.best_of})` : ''}\n${duel.winner === 'draw' ? "It's a draw!" : `${winnerName} wins!`}\n\n${window.location.href}`;
      await createPost(content);
      alert('Shared to feed!');
    } catch (err) { alert(err.message); }
    finally { setSharing(false); }
  };

  // Compute stats
  const stats = useMemo(() => {
    if (!duel?.songs) return { p1Wins: 0, p2Wins: 0, completed: [] };
    const completed = duel.songs.filter(s => s.status === 'completed');
    const p1Wins = completed.filter(s => s.winner === 'player1').length;
    const p2Wins = completed.filter(s => s.winner === 'player2').length;
    const draws = completed.filter(s => s.winner === 'draw').length;
    const p1TotalScore = completed.reduce((s, c) => s + c.player1_score, 0);
    const p2TotalScore = completed.reduce((s, c) => s + c.player2_score, 0);
    const p1Avg = completed.length > 0 ? Math.round(p1TotalScore / completed.length) : 0;
    const p2Avg = completed.length > 0 ? Math.round(p2TotalScore / completed.length) : 0;
    const p1Best = completed.length > 0 ? Math.max(...completed.map(s => s.player1_score)) : 0;
    const p2Best = completed.length > 0 ? Math.max(...completed.map(s => s.player2_score)) : 0;

    // Current streak
    let streak = { player: null, count: 0 };
    for (let i = completed.length - 1; i >= 0; i--) {
      const w = completed[i].winner;
      if (w === 'draw') break;
      if (streak.player === null) { streak.player = w; streak.count = 1; }
      else if (streak.player === w) streak.count++;
      else break;
    }

    return { p1Wins, p2Wins, draws, completed, p1Avg, p2Avg, p1Best, p2Best, streak };
  }, [duel]);

  // Chart data: group by level
  const chartData = useMemo(() => {
    if (!stats.completed.length) return [];
    const levelMap = {};
    stats.completed.forEach(s => {
      const lvl = s.song_level;
      if (!levelMap[lvl]) levelMap[lvl] = { level: lvl, p1Scores: [], p2Scores: [], count: 0 };
      levelMap[lvl].p1Scores.push(s.player1_score);
      levelMap[lvl].p2Scores.push(s.player2_score);
      levelMap[lvl].count++;
    });
    return Object.values(levelMap)
      .sort((a, b) => a.level - b.level)
      .map(d => ({
        level: `Lv.${d.level}`,
        songsPlayed: d.count,
        p1Avg: Math.round(d.p1Scores.reduce((a, b) => a + b, 0) / d.p1Scores.length),
        p2Avg: Math.round(d.p2Scores.reduce((a, b) => a + b, 0) / d.p2Scores.length),
      }));
  }, [stats.completed]);

  // Filtered data for Statistics tab (respects mode filter)
  const filteredCompleted = useMemo(() => {
    if (statsFilter === 'all') return stats.completed;
    return stats.completed.filter(s => s.song_mode === statsFilter);
  }, [stats.completed, statsFilter]);

  const filteredStats = useMemo(() => {
    const songs = filteredCompleted;
    const p1Wins = songs.filter(s => s.winner === 'player1').length;
    const p2Wins = songs.filter(s => s.winner === 'player2').length;
    const draws = songs.filter(s => s.winner === 'draw').length;
    const p1TotalScore = songs.reduce((s, c) => s + c.player1_score, 0);
    const p2TotalScore = songs.reduce((s, c) => s + c.player2_score, 0);
    const p1Avg = songs.length > 0 ? Math.round(p1TotalScore / songs.length) : 0;
    const p2Avg = songs.length > 0 ? Math.round(p2TotalScore / songs.length) : 0;
    const p1Best = songs.length > 0 ? Math.max(...songs.map(s => s.player1_score)) : 0;
    const p2Best = songs.length > 0 ? Math.max(...songs.map(s => s.player2_score)) : 0;
    return { p1Wins, p2Wins, draws, p1Avg, p2Avg, p1Best, p2Best };
  }, [filteredCompleted]);

  const filteredChartData = useMemo(() => {
    if (!filteredCompleted.length) return [];
    const levelMap = {};
    filteredCompleted.forEach(s => {
      const lvl = s.song_level;
      if (!levelMap[lvl]) levelMap[lvl] = { level: lvl, p1Scores: [], p2Scores: [], count: 0 };
      levelMap[lvl].p1Scores.push(s.player1_score);
      levelMap[lvl].p2Scores.push(s.player2_score);
      levelMap[lvl].count++;
    });
    return Object.values(levelMap)
      .sort((a, b) => a.level - b.level)
      .map(d => ({
        level: `Lv.${d.level}`,
        songsPlayed: d.count,
        p1Avg: Math.round(d.p1Scores.reduce((a, b) => a + b, 0) / d.p1Scores.length),
        p2Avg: Math.round(d.p2Scores.reduce((a, b) => a + b, 0) / d.p2Scores.length),
      }));
  }, [filteredCompleted]);

  if (!duel) return <div className="text-center py-20 text-gray-500">Loading match room...</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-xl tracking-wider">{duel.name}</h1>
            {duel.best_of > 0 && (
              <span className="badge bg-purple-500/20 border-purple-500/40 text-purple-300 text-[10px]">Bo{duel.best_of}</span>
            )}
          </div>
          <p className="text-xs text-gray-500">{duel.location} {duel.date && `- ${duel.date}`} | Online Duel</p>
        </div>
        <div className="flex items-center gap-2">
          {duel.spectatorCount > 0 && (
            <span className="text-[10px] text-gray-500 flex items-center gap-1" title={`${duel.spectatorCount} watching`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              {duel.spectatorCount}
            </span>
          )}
          {duel.status === 'ACTIVE' && (
            <span className="badge bg-red-500/20 border-red-500/50 text-red-400 text-[10px] animate-pulse flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              LIVE
            </span>
          )}
          <span className={`badge ${duel.status === 'COMPLETED' ? 'badge-completed' : duel.status === 'WAITING' ? 'badge-pending' : 'badge-active'}`}>
            {duel.status}
          </span>
        </div>
      </div>

      {/* Scoreboard — VS layout with Pump system */}
      <div className="card mb-4">
        <div className="flex items-center justify-center gap-3 sm:gap-6 py-4">
          {/* Player 1 side */}
          <div className="text-center flex-1">
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              {/* P1 PIU arrow: red top-left if higher, blue bottom-left if lower */}
              {(() => {
                const p1Pumps = duel.p1Pumps || 0;
                const p2Pumps = duel.p2Pumps || 0;
                if (p1Pumps > p2Pumps) return <img src="/piu/arrow-red-ul.svg" alt="Higher pumps" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0 animate-arrow-nudge-ul" />;
                if (p1Pumps < p2Pumps) return <img src="/piu/arrow-blue-dl.svg" alt="Lower pumps" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0 animate-arrow-nudge-dl" />;
                return null;
              })()}
              <div>
                <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 mx-auto ${
                  duel.status === 'COMPLETED' && duel.winner === 'player1' ? 'border-piu-gold shadow-lg shadow-piu-gold/30' :
                  duel.status === 'COMPLETED' && duel.winner === 'player2' ? 'border-gray-500' : 'border-red-500/50'
                }`}>
                  {duel.player1_avatar ? (
                    <img src={getAvatarUrl(duel.player1_avatar)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-lg sm:text-2xl">
                      {(duel.player1_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1 mt-1">
              {duel.player1_nationality && <span className="text-sm">{getCountryFlag(duel.player1_nationality)}</span>}
              <Link to={getProfilePath(duel.creator_user_id, duel.player1_name)} className="font-display font-bold text-sm sm:text-base hover:text-piu-accent transition-colors">{duel.player1_name || 'Waiting...'}</Link>
              {duel.player1_gender && <span className={`text-xs ${duel.player1_gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>{GENDER_SYMBOLS[duel.player1_gender]}</span>}
            </div>
            {duel.player1_skill_title && <span className={`badge border text-[10px] ${getSkillColor(duel.player1_skill_title)}`}>{duel.player1_skill_title}</span>}
            {/* Pump button + count for P1 */}
            <div className="relative flex items-center justify-center gap-1 mt-1.5">
              <button
                onClick={() => handlePump('player1')}
                disabled={!user || myPump === 'player2'}
                className={`transition-all active:scale-90 ${myPump === 'player1' ? 'animate-stomp-heartbeat drop-shadow-[0_0_6px_rgba(234,179,8,0.5)]' : 'animate-stomp-wiggle hover:scale-105'} ${!user || myPump === 'player2' ? 'opacity-30 cursor-not-allowed !animate-none' : 'cursor-pointer'}`}
                title={!user ? 'Log in to pump' : myPump === 'player2' ? 'Already pumping opponent' : myPump === 'player1' ? 'Click to unpump' : `Pump ${duel.player1_name}!`}
              >
                <img src={myPump === 'player1' ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'} alt="Pump" className="w-7 h-7 sm:w-9 sm:h-9" />
              </button>
              <span className={`text-xs font-mono font-bold ${myPump === 'player1' ? 'text-yellow-400' : 'text-gray-500'}`}>{duel.p1Pumps || 0}</span>
              {pumpFeedback?.player === 'player1' && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-display font-bold text-yellow-400 animate-pump-feedback">
                  Pumping {pumpFeedback.name} up!
                </span>
              )}
            </div>
            {duel.status === 'COMPLETED' && duel.winner === 'player1' && <div className="text-piu-gold text-xs font-display">&#127942; GOLD</div>}
            {duel.status === 'COMPLETED' && duel.winner === 'player2' && <div className="text-gray-400 text-xs font-display">&#129352; SILVER</div>}
            {duel.status === 'COMPLETED' && duel.winner === 'draw' && <div className="text-gray-400 text-xs font-display">DRAW</div>}
          </div>

          {/* Center VS */}
          <div className="flex flex-col items-center shrink-0">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-piu-accent">
              <path d="M8 8L32 32M8 8L12 4M8 8L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M32 8L8 32M32 8L28 4M32 8L36 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="20" cy="20" r="3" fill="currentColor" opacity="0.5"/>
            </svg>
            <div className="font-mono font-bold text-lg sm:text-2xl mt-1">
              <span className={stats.p1Wins > stats.p2Wins ? 'text-piu-green' : ''}>{stats.p1Wins}</span>
              <span className="text-gray-600 mx-1">-</span>
              <span className={stats.p2Wins > stats.p1Wins ? 'text-piu-green' : ''}>{stats.p2Wins}</span>
            </div>
            {duel.status === 'ACTIVE' && (
              <p className="text-[10px] text-gray-500 font-display mt-0.5">
                {duel.current_turn === playerSlot ? "Your turn" : duel.current_turn === 'player1' ? `${duel.player1_name}'s turn` : `${duel.player2_name}'s turn`}
              </p>
            )}
          </div>

          {/* Player 2 side */}
          <div className="text-center flex-1">
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              <div>
                <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 mx-auto ${
                  duel.status === 'COMPLETED' && duel.winner === 'player2' ? 'border-piu-gold shadow-lg shadow-piu-gold/30' :
                  duel.status === 'COMPLETED' && duel.winner === 'player1' ? 'border-gray-500' : 'border-blue-500/50'
                }`}>
                  {duel.player2_avatar ? (
                    <img src={getAvatarUrl(duel.player2_avatar)} alt="" className="w-full h-full object-cover" />
                  ) : duel.player2_name ? (
                    <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-lg sm:text-2xl">
                      {duel.player2_name[0].toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-full h-full border-2 border-dashed border-piu-border flex items-center justify-center"><span className="text-gray-600 text-2xl">?</span></div>
                  )}
                </div>
              </div>
              {/* P2 PIU arrow: red top-right if higher, blue bottom-right if lower */}
              {(() => {
                const p1Pumps = duel.p1Pumps || 0;
                const p2Pumps = duel.p2Pumps || 0;
                if (p2Pumps > p1Pumps) return <img src="/piu/arrow-red-ur.svg" alt="Higher pumps" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0 animate-arrow-nudge-ur" />;
                if (p2Pumps < p1Pumps) return <img src="/piu/arrow-blue-dr.svg" alt="Lower pumps" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0 animate-arrow-nudge-dr" />;
                return null;
              })()}
            </div>
            <div className="flex items-center justify-center gap-1 mt-1">
              {duel.player2_nationality && <span className="text-sm">{getCountryFlag(duel.player2_nationality)}</span>}
              {duel.player2_name ? (
                <Link to={getProfilePath(duel.opponent_user_id, duel.player2_name)} className="font-display font-bold text-sm sm:text-base hover:text-piu-accent transition-colors">{duel.player2_name}</Link>
              ) : <span className="text-gray-500 text-sm font-display">Waiting...</span>}
              {duel.player2_gender && <span className={`text-xs ${duel.player2_gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>{GENDER_SYMBOLS[duel.player2_gender]}</span>}
            </div>
            {duel.player2_skill_title && <span className={`badge border text-[10px] ${getSkillColor(duel.player2_skill_title)}`}>{duel.player2_skill_title}</span>}
            {/* Pump button + count for P2 */}
            <div className="relative flex items-center justify-center gap-1 mt-1.5">
              <span className={`text-xs font-mono font-bold ${myPump === 'player2' ? 'text-yellow-400' : 'text-gray-500'}`}>{duel.p2Pumps || 0}</span>
              <button
                onClick={() => handlePump('player2')}
                disabled={!user || myPump === 'player1'}
                className={`transition-all active:scale-90 ${myPump === 'player2' ? 'animate-stomp-heartbeat drop-shadow-[0_0_6px_rgba(234,179,8,0.5)]' : 'animate-stomp-wiggle hover:scale-105'} ${!user || myPump === 'player1' ? 'opacity-30 cursor-not-allowed !animate-none' : 'cursor-pointer'}`}
                title={!user ? 'Log in to pump' : myPump === 'player1' ? 'Already pumping opponent' : myPump === 'player2' ? 'Click to unpump' : `Pump ${duel.player2_name}!`}
              >
                <img src={myPump === 'player2' ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'} alt="Pump" className="w-7 h-7 sm:w-9 sm:h-9" />
              </button>
              {pumpFeedback?.player === 'player2' && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-display font-bold text-yellow-400 animate-pump-feedback">
                  Pumping {pumpFeedback.name} up!
                </span>
              )}
            </div>
            {duel.status === 'COMPLETED' && duel.winner === 'player2' && <div className="text-piu-gold text-xs font-display">&#127942; GOLD</div>}
            {duel.status === 'COMPLETED' && duel.winner === 'player1' && <div className="text-gray-400 text-xs font-display">&#129352; SILVER</div>}
            {duel.status === 'COMPLETED' && duel.winner === 'draw' && <div className="text-gray-400 text-xs font-display">DRAW</div>}
          </div>
        </div>
      </div>

      {/* Win Probability Bar + Streak + Best-of-N progress */}
      {stats.completed.length > 0 && (
        <div className="card mb-4 space-y-2">
          {/* Win probability bar */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-400 font-mono font-bold w-10 text-right">
              {stats.completed.length > 0 ? Math.round((stats.p1Wins / stats.completed.length) * 100) : 50}%
            </span>
            <div className="flex-1 h-2.5 bg-piu-dark rounded-full overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
                style={{ width: `${stats.completed.length > 0 ? (stats.p1Wins / stats.completed.length) * 100 : 50}%` }}
              />
              {stats.draws > 0 && (
                <div
                  className="h-full bg-gray-500 transition-all duration-500"
                  style={{ width: `${(stats.draws / stats.completed.length) * 100}%` }}
                />
              )}
              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 flex-1 transition-all duration-500" />
            </div>
            <span className="text-blue-400 font-mono font-bold w-10">
              {stats.completed.length > 0 ? Math.round((stats.p2Wins / stats.completed.length) * 100) : 50}%
            </span>
          </div>

          {/* Best-of-N progress */}
          {duel.best_of > 0 && (
            <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400 font-display">
              <span>Best of {duel.best_of}: first to {Math.ceil(duel.best_of / 2)}</span>
              <span className="text-red-400 font-bold ml-2">{stats.p1Wins}</span>
              <span className="text-gray-600">-</span>
              <span className="text-blue-400 font-bold">{stats.p2Wins}</span>
            </div>
          )}

          {/* Streak indicator */}
          {stats.streak.count >= 2 && (
            <div className="flex items-center justify-center gap-1 text-[10px] font-display">
              <span className={stats.streak.player === 'player1' ? 'text-red-400' : 'text-blue-400'}>
                {stats.streak.player === 'player1' ? duel.player1_name : duel.player2_name}
              </span>
              <span className="text-piu-gold font-bold">
                {stats.streak.count} win streak {Array(Math.min(stats.streak.count, 5)).fill('\u{1F525}').join('')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Predictions */}
      {duel.status === 'ACTIVE' && !isParticipant && (
        <div className="card mb-4">
          <h3 className="font-display font-bold text-xs text-gray-400 mb-2">Who will win? Predict!</h3>
          <div className="flex gap-2">
            <button
              onClick={() => handlePredict('player1')}
              disabled={!user}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all border-2 ${
                myPrediction === 'player1'
                  ? 'border-red-500 bg-red-500/20 text-red-300'
                  : 'border-piu-border hover:border-red-500/50 text-gray-400'
              } ${!user ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {duel.player1_name}
              {duel.predictions && <span className="ml-1 text-gray-500">({duel.predictions.player1})</span>}
            </button>
            <button
              onClick={() => handlePredict('player2')}
              disabled={!user}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all border-2 ${
                myPrediction === 'player2'
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-piu-border hover:border-blue-500/50 text-gray-400'
              } ${!user ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {duel.player2_name}
              {duel.predictions && <span className="ml-1 text-gray-500">({duel.predictions.player2})</span>}
            </button>
          </div>
          {!user && <p className="text-[10px] text-gray-600 mt-1">Log in to predict</p>}
        </div>
      )}

      {/* Prediction results (when duel is completed) */}
      {duel.status === 'COMPLETED' && duel.predictions && (duel.predictions.player1 + duel.predictions.player2) > 0 && (
        <div className="card mb-4">
          <h3 className="font-display font-bold text-xs text-gray-400 mb-2">Predictions</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-400 font-display">{duel.player1_name}: {duel.predictions.player1}</span>
            <div className="flex-1 h-2 bg-piu-dark rounded-full overflow-hidden flex">
              {(duel.predictions.player1 + duel.predictions.player2) > 0 && (
                <>
                  <div className="h-full bg-red-500" style={{ width: `${(duel.predictions.player1 / (duel.predictions.player1 + duel.predictions.player2)) * 100}%` }} />
                  <div className="h-full bg-blue-500 flex-1" />
                </>
              )}
            </div>
            <span className="text-blue-400 font-display">{duel.player2_name}: {duel.predictions.player2}</span>
          </div>
          {myPrediction && (
            <p className="text-[10px] text-gray-500 mt-1">
              You predicted {myPrediction === 'player1' ? duel.player1_name : duel.player2_name}
              {myPrediction === duel.winner ? ' - Correct!' : duel.winner === 'draw' ? ' - Draw' : ''}
            </p>
          )}
        </div>
      )}

      {/* Join button for opponent */}
      {duel.status === 'WAITING' && user && duel.opponent_user_id === user.id && (
        <div className="card text-center py-6 mb-4">
          <p className="text-gray-400 mb-3">You've been challenged!</p>
          <button onClick={handleJoin} className="btn-primary">Accept & Join Duel</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {['match', 'stats'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${tab === t ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'}`}>
            {t === 'match' ? 'Match Room' : 'Statistics'}
          </button>
        ))}
      </div>

      {tab === 'match' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Match Area (2/3) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Current Song / Draw Controls */}
            {duel.status === 'ACTIVE' && (
              <>
                {currentSong ? (
                  <div ref={songCardRef} className="card space-y-3">
                    <div className="flex items-center gap-3">
                      {currentSong.song_jacket_url && <img src={currentSong.song_jacket_url} alt="" className="w-16 h-16 rounded-lg object-cover shadow-lg" />}
                      <div className="flex-1">
                        <h3 className="font-display font-bold">{currentSong.song_title}</h3>
                        <p className="text-xs text-gray-500">{currentSong.song_artist} | {currentSong.song_mode} Lv.{currentSong.song_level}</p>
                        <p className="text-xs text-piu-accent font-display mt-1">
                          {currentSong.status === 'drawn' && 'Waiting for players to accept...'}
                          {currentSong.status === 'playing' && 'Play this song, then fetch your score!'}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {currentSong.status === 'drawn' ? (
                          <>
                            <span className={`w-3 h-3 rounded-full ${currentSong.player1_accepted ? 'bg-piu-green' : currentSong.player1_declined ? 'bg-red-500' : 'bg-gray-600'}`} title={`${duel.player1_name} ${currentSong.player1_accepted ? 'accepted' : currentSong.player1_declined ? 'declined' : 'pending'}`} />
                            <span className={`w-3 h-3 rounded-full ${currentSong.player2_accepted ? 'bg-piu-green' : currentSong.player2_declined ? 'bg-red-500' : 'bg-gray-600'}`} title={`${duel.player2_name} ${currentSong.player2_accepted ? 'accepted' : currentSong.player2_declined ? 'declined' : 'pending'}`} />
                          </>
                        ) : (
                          <>
                            <span className={`w-3 h-3 rounded-full ${currentSong.player1_submitted ? 'bg-piu-green' : 'bg-gray-600 animate-pulse'}`} title={`${duel.player1_name} ${currentSong.player1_submitted ? 'submitted' : 'pending'}`} />
                            <span className={`w-3 h-3 rounded-full ${currentSong.player2_submitted ? 'bg-piu-green' : 'bg-gray-600 animate-pulse'}`} title={`${duel.player2_name} ${currentSong.player2_submitted ? 'submitted' : 'pending'}`} />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Accept / Decline buttons */}
                    {currentSong.status === 'drawn' && isParticipant && (() => {
                      const myAccepted = playerSlot === 'player1' ? currentSong.player1_accepted : currentSong.player2_accepted;
                      const myDeclined = playerSlot === 'player1' ? currentSong.player1_declined : currentSong.player2_declined;
                      if (myAccepted) return <p className="text-xs text-piu-green font-display">You accepted. Waiting for opponent...</p>;
                      if (myDeclined) return <p className="text-xs text-red-400 font-display">You declined. Waiting for opponent...</p>;
                      const myDeclineCount = playerSlot === 'player1' ? (duel.p1Declines || 0) : (duel.p2Declines || 0);
                      const maxDeclines = 3;
                      const declinesLeft = maxDeclines - myDeclineCount;
                      return (
                        <div className="space-y-1">
                          <div className="flex gap-2">
                            <button onClick={() => handleAccept(currentSong.id)} className="btn-primary flex-1 text-sm">Accept Song</button>
                            <button onClick={() => handleDecline(currentSong.id)} disabled={declinesLeft <= 0} className={`flex-1 text-sm px-4 py-2 rounded-lg font-display font-bold transition-colors ${declinesLeft <= 0 ? 'bg-gray-700/30 text-gray-600 cursor-not-allowed' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}>
                              Decline{declinesLeft < maxDeclines ? ` (${declinesLeft} left)` : ''}
                            </button>
                          </div>
                          {declinesLeft <= 0 && <p className="text-[10px] text-red-400">No declines remaining. You must accept.</p>}
                        </div>
                      );
                    })()}

                    {/* Score submission — fetch from PIUGame or manual fallback */}
                    {currentSong.status === 'playing' && isParticipant && (
                      !(playerSlot === 'player1' ? currentSong.player1_submitted : currentSong.player2_submitted) ? (
                        <div className="space-y-2 pt-2 border-t border-piu-border/50">
                          <p className="text-sm text-gray-400 font-display">Play the song, then fetch your score</p>
                          {hasPiugameCreds ? (
                            <button
                              onClick={handleFetchScore}
                              disabled={fetchingScore}
                              className="btn-primary w-full text-sm flex items-center justify-center gap-2"
                            >
                              {fetchingScore ? (
                                <>
                                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                  Fetching from PIUGame...
                                </>
                              ) : 'Fetch My Score'}
                            </button>
                          ) : (
                            <div className="text-center space-y-2">
                              <p className="text-[10px] text-gray-500">Link your PIUGame account in Settings to auto-fetch scores.</p>
                            </div>
                          )}
                          {/* Manual entry fallback */}
                          {!scoreEntry ? (
                            <button
                              onClick={() => setScoreEntry({ score: '' })}
                              className={`w-full text-sm px-4 py-2 rounded-lg font-display font-bold transition-colors ${hasPiugameCreds ? 'bg-piu-card text-gray-400 hover:text-white' : 'btn-primary'}`}
                            >
                              Enter Score Manually
                            </button>
                          ) : (
                            <div className="bg-piu-dark/50 rounded-lg p-3 space-y-2">
                              <div>
                                <label className="text-gray-500 block text-[10px] mb-1">Score (0 - 1,000,000)</label>
                                <input
                                  type="number"
                                  className="input-field text-sm font-mono w-full py-2 px-2"
                                  value={scoreEntry.score}
                                  min="0"
                                  max="1000000"
                                  placeholder="e.g. 990973"
                                  autoFocus
                                  onChange={e => setScoreEntry({ score: e.target.value === '' ? '' : (parseInt(e.target.value) || '') })}
                                  onBlur={e => { if (e.target.value === '') setScoreEntry({ score: 0 }); }}
                                />
                              </div>
                              {scoreEntry.score > 0 && (
                                <p className="text-xs text-center">
                                  <span className="text-gray-500">Rank: </span>
                                  <span className={`font-display font-bold ${getRank(scoreEntry.score).color}`}>{getRank(scoreEntry.score).label}</span>
                                </p>
                              )}
                              <div className="flex gap-2">
                                <button onClick={handleSubmitScore} className="btn-primary flex-1 text-sm">Confirm</button>
                                <button onClick={() => setScoreEntry(null)} className="flex-1 text-sm px-4 py-2 bg-piu-card text-gray-400 rounded-lg font-display font-bold hover:text-white transition-colors">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-piu-green font-display">Score submitted! Waiting for opponent...</p>
                      )
                    )}
                  </div>
                ) : (
                  /* Draw controls */
                  duel.current_turn === playerSlot ? (
                    <div ref={drawAreaRef} className="card space-y-3">
                      <h3 className="font-display font-bold text-sm text-piu-accent">Your Turn - Draw a Song</h3>
                      <div className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">Level</label>
                          <input type="number" className="input-field" min="1" max="28" value={drawLevel} onChange={e => setDrawLevel(e.target.value === '' ? '' : (parseInt(e.target.value) || ''))} onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) setDrawLevel(1); }} />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">Mode</label>
                          <select className="input-field" value={drawMode} onChange={e => setDrawMode(e.target.value)}>
                            <option value="any">Any</option>
                            {duel.mode !== 'doubles' && <option value="Single">Singles</option>}
                            {duel.mode !== 'singles' && <option value="Double">Doubles</option>}
                          </select>
                        </div>
                        <button onClick={handleDraw} className="btn-primary text-sm px-6">Draw</button>
                      </div>
                    </div>
                  ) : (
                    <div ref={drawAreaRef} className="card text-center py-4">
                      <p className="text-gray-400 font-display text-sm">
                        Waiting for {duel.current_turn === 'player1' ? duel.player1_name : duel.player2_name} to draw a song...
                      </p>
                    </div>
                  )
                )}

                {/* End duel / Forfeit */}
                {isParticipant && (
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      {(playerSlot === 'player1' ? duel.player1_end_requested : duel.player2_end_requested) ? (
                        <span className="text-yellow-400 font-display">You requested to end the duel. Waiting for opponent...</span>
                      ) : (
                        <button onClick={handleEndRequest} className="text-gray-500 hover:text-red-400 transition-colors font-display">End Duel</button>
                      )}
                      <button onClick={handleForfeit} className="text-gray-600 hover:text-red-500 transition-colors font-display">Forfeit</button>
                    </div>
                    {(playerSlot === 'player1' ? duel.player2_end_requested : duel.player1_end_requested) && (
                      <button onClick={handleEndRequest} className="text-yellow-400 hover:text-yellow-300 font-display font-bold">Opponent wants to end - Confirm?</button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Winner banner */}
            {duel.status === 'COMPLETED' && (
              <div className="card text-center py-6">
                <h2 className="font-display font-bold text-xl text-piu-gold mb-2">DUEL COMPLETE</h2>
                <p className="text-lg font-display font-bold">
                  {duel.winner === 'draw' ? "It's a draw!" :
                    duel.winner === 'player1' ? `${duel.player1_name} wins!` : `${duel.player2_name} wins!`}
                </p>
                <p className="text-gray-400 mt-1">{stats.p1Wins} - {stats.p2Wins}</p>
                <div className="flex items-center justify-center gap-3 mt-4">
                  {isParticipant && (
                    <button onClick={handleRematch} className="btn-primary text-sm px-6">Rematch</button>
                  )}
                  {user && (
                    <button onClick={handleShareToFeed} disabled={sharing} className="text-sm px-4 py-2 rounded-lg font-display font-bold bg-piu-card text-gray-300 hover:text-white hover:bg-piu-card/80 transition-colors border border-piu-border disabled:opacity-50">
                      {sharing ? 'Sharing...' : 'Share to Feed'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Song History */}
            {stats.completed.length > 0 && (
              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Song Results</h3>
                <div className="space-y-2">
                  {stats.completed.map(song => {
                    const p1Rank = getRank(song.player1_score);
                    const p2Rank = getRank(song.player2_score);
                    return (
                      <button key={song.id} onClick={() => setSelectedBreakdown(song)} className="flex items-center gap-0 py-1 border-b border-piu-border/20 last:border-0 w-full hover:bg-piu-dark/30 rounded transition-colors">
                        <div className={`flex-1 flex items-center justify-end gap-1 pr-2 ${song.winner === 'player1' ? 'text-piu-green' : ''}`}>
                          {song.winner === 'player1' && <span className="text-[10px]">&#9733;</span>}
                          <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p1Rank.bg} ${p1Rank.color}`}>{p1Rank.label}</span>
                          <span className="font-mono text-xs font-bold">{song.player1_score.toLocaleString()}</span>
                        </div>
                        <div className="shrink-0">
                          <SongJacket song={song} size="sm" />
                        </div>
                        <div className={`flex-1 flex items-center gap-1 pl-2 ${song.winner === 'player2' ? 'text-piu-green' : ''}`}>
                          <span className="font-mono text-xs font-bold">{song.player2_score.toLocaleString()}</span>
                          <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p2Rank.bg} ${p2Rank.color}`}>{p2Rank.label}</span>
                          {song.winner === 'player2' && <span className="text-[10px]">&#9733;</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Chat (1/3) — sticky on desktop */}
          <div className="card flex flex-col h-[400px] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-4 lg:self-start relative overflow-hidden">
            {/* Floating reactions overlay */}
            {floatingReactions.map(r => (
              <div
                key={r.id}
                className="absolute pointer-events-none z-10 animate-float-up"
                style={{ left: `${r.x}%`, bottom: '60px', fontSize: '24px' }}
              >
                {r.emoji}
              </div>
            ))}

            <h3 className="font-display font-bold text-sm text-piu-accent mb-2 shrink-0">Match Chat</h3>

            {/* Quick reaction bar — live stream style */}
            <div className="flex gap-1 mb-2 shrink-0 flex-wrap">
              {QUICK_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleQuickReaction(emoji)}
                  disabled={isChatLocked}
                  className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center text-sm border border-piu-border/20 ${
                    isChatLocked
                      ? 'bg-piu-dark/30 text-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-piu-dark/50 hover:bg-piu-dark hover:scale-110 active:scale-95'
                  }`}
                  title={`Send ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 mb-2 min-h-0">
              {chat.map(msg => {
                const isP1 = msg.user_id && msg.user_id === duel.creator_user_id;
                const isP2 = msg.user_id && msg.user_id === duel.opponent_user_id;
                const nameColor = isP1 ? 'text-amber-400 font-bold' : isP2 ? 'text-blue-400 font-bold' : msg.is_participant ? 'font-bold text-white' : 'text-gray-500';
                const msgColor = isP1 ? 'text-amber-200/80' : isP2 ? 'text-blue-200/80' : msg.is_participant ? 'text-gray-200' : 'text-gray-500';
                const isEmojiOnly = /^[\p{Emoji}\s]{1,5}$/u.test(msg.message) && !msg.is_system;
                const chatAvatar = isP1 ? duel.player1_avatar : isP2 ? duel.player2_avatar : null;
                const chatAvatarFallback = isP1 ? (duel.player1_name || '?')[0].toUpperCase() : isP2 ? (duel.player2_name || '?')[0].toUpperCase() : null;
                const chatAvatarBg = isP1 ? 'bg-amber-600' : 'bg-blue-600';
                const avatarEl = (isP1 || isP2) ? (
                  chatAvatar ? (
                    <img src={getAvatarUrl(chatAvatar)} alt="" className="w-4 h-4 rounded-full object-cover shrink-0 inline-block align-text-bottom" />
                  ) : (
                    <span className={`w-4 h-4 rounded-full ${chatAvatarBg} inline-flex items-center justify-center text-[8px] font-bold text-white shrink-0 align-text-bottom`}>{chatAvatarFallback}</span>
                  )
                ) : null;
                return (
                  <div key={msg.id} className={`text-xs ${msg.is_system ? 'text-piu-accent italic' : ''}`}>
                    {msg.is_system ? (
                      <span>{msg.message}</span>
                    ) : isEmojiOnly ? (
                      <div className="flex items-center gap-1">
                        <span className={nameColor}>
                          {avatarEl}
                          {(isP1 || isP2) && ' '}
                          {msg.username}
                        </span>
                        <span className="text-xl leading-none">{msg.message}</span>
                      </div>
                    ) : (
                      <>
                        <span className={nameColor}>
                          {avatarEl}
                          {(isP1 || isP2) && ' '}
                          {msg.username}:
                        </span>{' '}
                        <span className={msgColor}>{msg.message}</span>
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Emoji picker popover */}
            {showEmoji && (
              <div className="bg-piu-card border border-piu-border rounded-lg p-2 mb-1 shrink-0">
                <div className="flex flex-wrap gap-1">
                  {QUICK_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      disabled={isChatLocked}
                      onClick={() => { setChatInput(prev => prev + emoji); setShowEmoji(false); }}
                      className={`w-8 h-8 rounded transition-colors flex items-center justify-center text-lg ${
                        isChatLocked ? 'opacity-50 cursor-not-allowed text-gray-600' : 'hover:bg-piu-dark'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSendChat} className="flex gap-1.5 shrink-0 items-center">
              {!user && (
                <input type="text" className="input-field text-xs w-16" placeholder="Name" value={guestName} onChange={e => setGuestName(e.target.value)} disabled={isChatLocked} />
              )}
              <button
                type="button"
                disabled={isChatLocked}
                onClick={() => setShowEmoji(!showEmoji)}
                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${
                  isChatLocked
                    ? 'bg-piu-dark/30 text-gray-600 cursor-not-allowed opacity-50'
                    : showEmoji
                      ? 'bg-piu-accent text-white'
                      : 'bg-piu-dark/50 text-gray-400 hover:text-white hover:bg-piu-dark'
                }`}
                title="Emojis"
              >
                &#128578;
              </button>
              <input
                type="text"
                className="input-field text-xs flex-1"
                placeholder={isChatLocked ? 'Chat closed - duel completed' : 'Type a message...'}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                maxLength={500}
                disabled={isChatLocked}
              />
              <button type="submit" disabled={isChatLocked} className="btn-primary text-xs px-3 py-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">Send</button>
            </form>
            {isChatLocked && (
              <p className="text-[10px] text-gray-500 mt-1 shrink-0">Chat is closed because this duel is completed.</p>
            )}
          </div>
        </div>
      ) : (
        /* Statistics tab */
        <div className="space-y-4">
          {stats.completed.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg font-display">No completed songs yet</p>
              <p className="text-sm mt-1">Play some songs to see statistics</p>
            </div>
          ) : (
            <>
              {/* Mode Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-display">Filter:</span>
                {[
                  { value: 'all', label: 'All' },
                  { value: 'Single', label: 'Singles' },
                  { value: 'Double', label: 'Doubles' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setStatsFilter(opt.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-display font-bold transition-colors ${
                      statsFilter === opt.value
                        ? 'bg-piu-accent text-white'
                        : 'bg-piu-card text-gray-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card text-center">
                  <p className="text-xs text-gray-500 font-display mb-1">{duel.player1_name}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="font-mono font-bold text-lg text-piu-green">{filteredStats.p1Wins}</p>
                      <p className="text-[10px] text-gray-600">Wins</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-sm">{filteredStats.p1Avg.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-600">Avg Score</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-sm">{filteredStats.p1Best.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-600">Best</p>
                    </div>
                  </div>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-gray-500 font-display mb-1">{duel.player2_name}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="font-mono font-bold text-lg text-piu-green">{filteredStats.p2Wins}</p>
                      <p className="text-[10px] text-gray-600">Wins</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-sm">{filteredStats.p2Avg.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-600">Avg Score</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-sm">{filteredStats.p2Best.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-600">Best</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart — Average Score by Level */}
              {filteredChartData.length > 0 && (
                <div className="card">
                  <h3 className="font-display font-bold text-sm text-piu-accent mb-4">Average Score by Level</h3>
                  <div className="h-[300px] sm:h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={filteredChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="level" tick={{ fontSize: 11, fill: '#888' }} />
                        <YAxis
                          yAxisId="left"
                          domain={[
                            (dataMin) => Math.max(0, Math.floor((Math.min(...filteredChartData.map(d => Math.min(d.p1Avg, d.p2Avg))) - 50000) / 50000) * 50000),
                            1000000
                          ]}
                          tickFormatter={(v) => v >= 1000000 ? '1M' : `${(v / 1000).toFixed(0)}k`}
                          tick={{ fontSize: 10, fill: '#888' }}
                          label={{ value: 'Avg Score', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 10, fill: '#666' } }}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: '#888' }}
                          label={{ value: 'Songs', angle: 90, position: 'insideRight', offset: 15, style: { fontSize: 10, fill: '#666' } }}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                          labelStyle={{ color: '#aaa', fontWeight: 'bold' }}
                          formatter={(value, name) => {
                            if (name === 'Songs Played') return [value, name];
                            return [Number(value).toLocaleString(), name];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar yAxisId="right" dataKey="songsPlayed" name="Songs Played" fill="#333" opacity={0.6} barSize={30} />
                        <Line yAxisId="left" type="monotone" dataKey="p1Avg" name={duel.player1_name} stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                        <Line yAxisId="left" type="monotone" dataKey="p2Avg" name={duel.player2_name} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Song-by-Song Comparison */}
              {filteredCompleted.length > 0 && (
                <div className="card">
                  <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Song Results</h3>
                  <div className="flex items-center text-[10px] text-gray-500 font-display font-bold mb-2 px-1">
                    <div className="flex-1 text-right pr-2">{duel.player1_name}</div>
                    <div className="w-12 text-center shrink-0"></div>
                    <div className="flex-1 pl-2">{duel.player2_name}</div>
                  </div>
                  <div className="space-y-1.5">
                    {filteredCompleted.map(song => {
                      const p1Rank = getRank(song.player1_score);
                      const p2Rank = getRank(song.player2_score);
                      const p1Won = song.winner === 'player1';
                      const p2Won = song.winner === 'player2';
                      return (
                        <div key={song.id} className="flex items-center gap-0 py-1 border-b border-piu-border/20 last:border-0">
                          <div className={`flex-1 flex items-center justify-end gap-1 pr-2 ${p1Won ? 'text-piu-green' : ''}`}>
                            {p1Won && <span className="text-[10px]">&#9733;</span>}
                            <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p1Rank.bg} ${p1Rank.color}`}>{p1Rank.label}</span>
                            <span className="font-mono text-xs font-bold">{song.player1_score.toLocaleString()}</span>
                          </div>
                          <div className="shrink-0">
                            <SongJacket song={song} size="sm" />
                          </div>
                          <div className={`flex-1 flex items-center gap-1 pl-2 ${p2Won ? 'text-piu-green' : ''}`}>
                            <span className="font-mono text-xs font-bold">{song.player2_score.toLocaleString()}</span>
                            <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p2Rank.bg} ${p2Rank.color}`}>{p2Rank.label}</span>
                            {p2Won && <span className="text-[10px]">&#9733;</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rank Distribution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <RankDistribution playerName={duel.player1_name} songs={filteredCompleted} scoreKey="player1_score" color="red" />
                <RankDistribution playerName={duel.player2_name} songs={filteredCompleted} scoreKey="player2_score" color="blue" />
              </div>
            </>
          )}
        </div>
      )}

      {/* Score Modal — both players side by side */}
      {selectedBreakdown && (() => {
        const p1Rank = getRank(selectedBreakdown.player1_score);
        const p2Rank = getRank(selectedBreakdown.player2_score);
        const p1Won = selectedBreakdown.winner === 'player1';
        const p2Won = selectedBreakdown.winner === 'player2';
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedBreakdown(null)}>
            <div className="card max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  {selectedBreakdown.song_jacket_url && <img src={selectedBreakdown.song_jacket_url} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                  <div>
                    <h3 className="font-display font-bold">{selectedBreakdown.song_title}</h3>
                    <p className="text-xs text-gray-500">{selectedBreakdown.song_artist} | {selectedBreakdown.song_mode} Lv.{selectedBreakdown.song_level}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedBreakdown(null)} className="text-gray-500 hover:text-white text-xl">&#10005;</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-lg border p-3 text-center ${p1Won ? 'border-piu-green/40 bg-piu-green/5' : 'border-piu-border/30 bg-piu-dark/30'}`}>
                  <p className={`text-[10px] font-display font-bold mb-2 ${p1Won ? 'text-piu-green' : 'text-gray-400'}`}>
                    {p1Won && <span className="mr-0.5">&#9733;</span>}{duel.player1_name}
                  </p>
                  <span className={`text-sm font-display font-bold px-2 py-0.5 rounded border ${p1Rank.bg} ${p1Rank.color}`}>{p1Rank.label}</span>
                  <p className={`font-mono font-bold text-lg mt-1 ${p1Won ? 'text-piu-green' : 'text-white'}`}>{selectedBreakdown.player1_score.toLocaleString()}</p>
                  {(selectedBreakdown.player1_perfect > 0 || selectedBreakdown.player1_great > 0 || selectedBreakdown.player1_miss > 0) && (
                    <div className="mt-2 space-y-0.5 text-[10px] font-mono">
                      <div className="flex justify-between"><span className="text-yellow-400">PERFECT</span><span>{selectedBreakdown.player1_perfect.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-green-400">GREAT</span><span>{selectedBreakdown.player1_great.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-cyan-400">GOOD</span><span>{selectedBreakdown.player1_good.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-orange-400">BAD</span><span>{selectedBreakdown.player1_bad.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-red-400">MISS</span><span>{selectedBreakdown.player1_miss.toLocaleString()}</span></div>
                    </div>
                  )}
                </div>
                <div className={`rounded-lg border p-3 text-center ${p2Won ? 'border-piu-green/40 bg-piu-green/5' : 'border-piu-border/30 bg-piu-dark/30'}`}>
                  <p className={`text-[10px] font-display font-bold mb-2 ${p2Won ? 'text-piu-green' : 'text-gray-400'}`}>
                    {p2Won && <span className="mr-0.5">&#9733;</span>}{duel.player2_name}
                  </p>
                  <span className={`text-sm font-display font-bold px-2 py-0.5 rounded border ${p2Rank.bg} ${p2Rank.color}`}>{p2Rank.label}</span>
                  <p className={`font-mono font-bold text-lg mt-1 ${p2Won ? 'text-piu-green' : 'text-white'}`}>{selectedBreakdown.player2_score.toLocaleString()}</p>
                  {(selectedBreakdown.player2_perfect > 0 || selectedBreakdown.player2_great > 0 || selectedBreakdown.player2_miss > 0) && (
                    <div className="mt-2 space-y-0.5 text-[10px] font-mono">
                      <div className="flex justify-between"><span className="text-yellow-400">PERFECT</span><span>{selectedBreakdown.player2_perfect.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-green-400">GREAT</span><span>{selectedBreakdown.player2_great.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-cyan-400">GOOD</span><span>{selectedBreakdown.player2_good.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-orange-400">BAD</span><span>{selectedBreakdown.player2_bad.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-red-400">MISS</span><span>{selectedBreakdown.player2_miss.toLocaleString()}</span></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function RankDistribution({ playerName, songs, scoreKey, color }) {
  const rankCounts = {};
  songs.forEach(s => {
    const rank = getRank(s[scoreKey]);
    rankCounts[rank.label] = (rankCounts[rank.label] || 0) + 1;
  });

  const entries = RANKS.map(r => r.label).filter(r => rankCounts[r]).map(r => ({ rank: r, count: rankCounts[r] }));
  if (entries.length === 0) return null;

  return (
    <div className="card">
      <p className={`text-xs font-display font-bold mb-2 ${color === 'red' ? 'text-red-400' : 'text-blue-400'}`}>{playerName} Ranks</p>
      <div className="space-y-1">
        {entries.map(e => {
          const r = RANKS.find(x => x.label === e.rank);
          return (
            <div key={e.rank} className="flex items-center gap-2">
              <span className={`font-display font-bold text-xs w-10 ${r?.color || 'text-gray-400'}`}>{e.rank}</span>
              <div className="flex-1 h-3 bg-piu-dark rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${color === 'red' ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, (e.count / songs.length) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 font-mono w-6 text-right">{e.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

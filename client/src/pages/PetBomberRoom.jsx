import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { completePetBomber, getMyPet } from '../utils/api';
import PetBomberRenderer from '../components/pet/minigames/petBomberRenderer';
import {
  startAudio, startMusic, stopMusic, setMuted as setAudioMuted, isMuted,
  playBombPlace, playExplosion, playPickup, playKill, playDeath,
  playCountdown, playRoundWin, playRoundLoss, playSuddenDeath,
} from '../components/pet/minigames/petBomberAudio';

const COLS = 13;
const ROWS = 11;
const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;

const SEAT_COLORS = ['#60a5fa', '#f87171', '#34d399', '#fbbf24'];
const SEAT_LABELS = ['P1', 'P2', 'P3', 'P4'];

// ---------------------------------------------------------------------------
//  PetBomberRoom
// ---------------------------------------------------------------------------

export default function PetBomberRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const botMode = searchParams.get('bot') || null; // 'duel' | 'full' | null
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── UI state (triggers re-renders) ─────────────────────────────
  const [room, setRoom] = useState(null);
  const [localSeat, setLocalSeat] = useState(-1);
  const [phase, setPhase] = useState('connecting'); // connecting | waiting | playing | round_end | match_end | error
  const [roundResult, setRoundResult] = useState(null); // { winner, roundWins }
  const [matchResult, setMatchResult] = useState(null); // { winner, stats }
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [rematchVotes, setRematchVotes] = useState(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [muted, setMutedState] = useState(isMuted());

  // ── Refs (mutable game state, no re-renders) ───────────────────
  const wsRef = useRef(null);
  const rendererRef = useRef(null);
  const containerRef = useRef(null);
  const chatEndRef = useRef(null);
  const inputIntervalRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const joinedRef = useRef(false);
  const autoStartedRef = useRef(false);
  const characterRef = useRef('dojocat');
  const localSeatRef = useRef(-1);
  const roomIdRef = useRef(roomId);

  // Input tracking
  const dirStackRef = useRef([]); // stack of held direction keys
  const bombHeldRef = useRef(false);
  const dpadActiveRef = useRef(null); // currently touched dpad direction

  // ── Detect mobile ──────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Fetch character ────────────────────────────────────────────
  useEffect(() => {
    getMyPet()
      .then((res) => {
        if (res?.pet?.character) characterRef.current = res.pet.character;
      })
      .catch(() => {});
  }, []);

  // ── Helpers ────────────────────────────────────────────────────
  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const currentDir = useCallback(() => {
    if (dpadActiveRef.current) return dpadActiveRef.current;
    const stack = dirStackRef.current;
    return stack.length > 0 ? stack[stack.length - 1] : null;
  }, []);

  // ── Update room state helper ───────────────────────────────────
  const updateRoom = useCallback((roomData) => {
    if (!roomData) return;
    setRoom(roomData);
    // Find our seat
    if (user) {
      const idx = (roomData.seats || []).findIndex(
        (s) => s && s.userId === user.id
      );
      if (idx !== -1) {
        setLocalSeat(idx);
        localSeatRef.current = idx;
      }
    }
  }, [user]);

  // ── WebSocket connection ───────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws/pet-bomber?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setPhase('waiting');
      setErrorMsg('');

      // Join room
      if (!joinedRef.current) {
        send({ type: 'join_room', roomId, character: characterRef.current });
        joinedRef.current = true;
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      handleServerMessage(data);
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      // Don't reconnect if intentionally closed
      if (event.code === 4000 || event.code === 1000) return;
      // Attempt one reconnect after 1s
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (mountedRef.current) {
            joinedRef.current = false;
            connectWs();
          }
        }, 1000);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [user, roomId, send]);

  // ── Server message handler ─────────────────────────────────────
  const handleServerMessage = useCallback((data) => {
    switch (data.type) {
      case 'connected':
        break;

      case 'room_created':
      case 'room_state':
      case 'countdown':
        updateRoom(data.room);
        break;

      case 'player_joined':
        updateRoom(data.room);
        // Auto-start if we're host and botMode is set
        if (
          botMode &&
          !autoStartedRef.current &&
          data.userId === user?.id
        ) {
          autoStartedRef.current = true;
          // Brief delay so join is processed
          setTimeout(() => {
            send({ type: 'start', roomId: roomIdRef.current, botMode });
          }, 300);
        }
        break;

      case 'player_left':
        updateRoom(data.room);
        break;

      case 'round_start': {
        updateRoom(data.room);
        setPhase('playing');
        setRoundResult(null);
        setMatchResult(null);
        setRematchVotes(new Set());

        // Init renderer
        const renderer = rendererRef.current;
        if (renderer && data.room?.round?.grid) {
          renderer.setGrid(data.room.round.grid);
          renderer.setLocalSeat(localSeatRef.current);
          if (data.room.round.snapshot) {
            renderer.applySnapshot(data.room.round.snapshot);
          }
        }

        // Start music on first round
        startAudio();
        startMusic();
        break;
      }

      case 'tick': {
        const renderer = rendererRef.current;
        if (renderer) {
          if (data.snapshot) renderer.applySnapshot(data.snapshot);
          if (data.gridChanges) {
            renderer.applyGridChanges(data.gridChanges);
            // Trigger SFX for notable events
            for (const change of data.gridChanges) {
              if (change.type === 'bomb') playBombPlace();
              else if (change.type === 'explosion') playExplosion();
              else if (change.type === 'pickup') playPickup();
              else if (change.type === 'kill') {
                if (change.seat === localSeatRef.current) playDeath();
                else playKill();
              }
              else if (change.type === 'sudden_death_start') playSuddenDeath();
            }
          }
        }
        break;
      }

      case 'round_end':
        setPhase('round_end');
        setRoundResult({ winner: data.winner, roundWins: data.roundWins });
        if (data.winner === localSeatRef.current) playRoundWin();
        else playRoundLoss();
        break;

      case 'match_end':
        setPhase('match_end');
        setMatchResult({ winner: data.winner, stats: data.stats });
        stopMusic();
        // Report to backend
        completePetBomber({
          roomId: roomIdRef.current,
          winner: data.winner,
          stats: data.stats,
        }).catch(() => {});
        break;

      case 'chat':
        setChatMessages((prev) => {
          const next = [...prev, { userId: data.userId, text: data.text, ts: Date.now() }];
          return next.length > 50 ? next.slice(-50) : next;
        });
        break;

      case 'emote':
        setChatMessages((prev) => {
          const next = [...prev, { userId: data.userId, emote: data.emote, ts: Date.now() }];
          return next.length > 50 ? next.slice(-50) : next;
        });
        break;

      case 'player_disconnected':
        setChatMessages((prev) => [
          ...prev,
          { system: true, text: `Player disconnected`, ts: Date.now() },
        ]);
        break;

      case 'rematch_vote':
        if (data.userId) {
          setRematchVotes((prev) => new Set([...prev, data.userId]));
        }
        if (data.room) updateRoom(data.room);
        break;

      case 'error':
        setErrorMsg(data.message || 'Unknown error');
        break;

      default:
        break;
    }
  }, [updateRoom, botMode, user, send]);

  // ── Mount / unmount lifecycle ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    roomIdRef.current = roomId;

    connectWs();

    return () => {
      mountedRef.current = false;
      // Leave room
      send({ type: 'leave', roomId });
      // Close WS
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close(1000);
        wsRef.current = null;
      }
      // Clear reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // Clear input loop
      if (inputIntervalRef.current) {
        clearInterval(inputIntervalRef.current);
        inputIntervalRef.current = null;
      }
      // Dispose renderer
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      // Stop music
      stopMusic();
    };
  }, [roomId, connectWs, send]);

  // ── Three.js renderer setup ────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const renderer = new PetBomberRenderer(el);
    rendererRef.current = renderer;

    const handleResize = () => renderer.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ── Input sending loop (20/sec) ────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') {
      if (inputIntervalRef.current) {
        clearInterval(inputIntervalRef.current);
        inputIntervalRef.current = null;
      }
      return;
    }

    inputIntervalRef.current = setInterval(() => {
      const dir = currentDir();
      const bomb = bombHeldRef.current;
      send({ type: 'input', roomId: roomIdRef.current, dir, bomb });
      // Reset bomb after sending (tap, not hold)
      bombHeldRef.current = false;
    }, TICK_INTERVAL);

    return () => {
      if (inputIntervalRef.current) {
        clearInterval(inputIntervalRef.current);
        inputIntervalRef.current = null;
      }
    };
  }, [phase, send, currentDir]);

  // ── Keyboard controls ──────────────────────────────────────────
  useEffect(() => {
    const dirMap = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
    };

    const handleKeyDown = (e) => {
      // Chat input focus
      if (e.key === 'Enter' && phase === 'playing') {
        if (chatOpen && chatInput.trim()) {
          send({ type: 'chat', roomId: roomIdRef.current, text: chatInput.trim() });
          setChatInput('');
          setChatOpen(false);
          return;
        }
        if (!chatOpen) {
          setChatOpen(true);
          return;
        }
      }
      if (e.key === 'Escape') {
        setChatOpen(false);
        return;
      }

      // Don't capture keys when chat is focused
      if (chatOpen) return;

      const dir = dirMap[e.key];
      if (dir) {
        e.preventDefault();
        const stack = dirStackRef.current;
        // Only add if not already in stack
        if (!stack.includes(dir)) {
          stack.push(dir);
        }
      }

      if (e.key === ' ' || e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        bombHeldRef.current = true;
      }
    };

    const handleKeyUp = (e) => {
      if (chatOpen) return;

      const dir = dirMap[e.key];
      if (dir) {
        e.preventDefault();
        dirStackRef.current = dirStackRef.current.filter((d) => d !== dir);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [phase, chatOpen, chatInput, send]);

  // ── Auto-scroll chat ───────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Handle start button (host only, non-bot) ──────────────────
  const handleStart = useCallback(() => {
    send({ type: 'start', roomId, botMode: null });
  }, [send, roomId]);

  const handleRematch = useCallback(() => {
    send({ type: 'rematch', roomId });
  }, [send, roomId]);

  const handleLeave = useCallback(() => {
    navigate('/pet');
  }, [navigate]);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    send({ type: 'chat', roomId, text: chatInput.trim() });
    setChatInput('');
  }, [send, roomId, chatInput]);

  // ── D-pad touch handlers ───────────────────────────────────────
  const handleDpadStart = useCallback((dir) => (e) => {
    e.preventDefault();
    dpadActiveRef.current = dir;
  }, []);

  const handleDpadEnd = useCallback(() => (e) => {
    e.preventDefault();
    dpadActiveRef.current = null;
  }, []);

  const handleBombTouch = useCallback((e) => {
    e.preventDefault();
    bombHeldRef.current = true;
  }, []);

  // ── Derived state ──────────────────────────────────────────────
  const isHost = room && user && room.hostId === user.id;
  const seats = room?.seats || [null, null, null, null];
  const roundWins = room?.roundWins || roundResult?.roundWins || [0, 0, 0, 0];
  const bestOf = room?.bestOf || 3;
  const currentRound = room?.currentRound || 0;
  const activePlayers = seats.filter((s) => s && s.userId).length;

  // Seat display name for a seat index
  const seatName = (idx) => {
    const seat = seats[idx];
    if (!seat) return SEAT_LABELS[idx];
    if (seat.isBot) return `Bot ${idx + 1}`;
    if (seat.userId === user?.id) return 'You';
    return SEAT_LABELS[idx];
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#0d0e16] flex flex-col select-none">
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/50 border-b border-white/[0.06] shrink-0 z-20">
        <button
          onClick={handleLeave}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black tracking-[0.15em] uppercase text-white/50">Pet Bomber</span>
          {room && (
            <span className="text-[9px] text-gray-600 font-mono">{roomId}</span>
          )}
        </div>

        <button
          onClick={() => { const next = !muted; setMutedState(next); setAudioMuted(next); }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* ── Game area ─────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">

        {/* ── Top HUD: scores + round ─────────────────── */}
        {phase === 'playing' && (
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-1 px-2 py-1.5 pointer-events-none">
            {seats.map((seat, idx) => {
              if (!seat) return null;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm border ${
                    idx === localSeat ? 'border-white/20' : 'border-white/[0.06]'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: SEAT_COLORS[idx] }}
                  />
                  <span className="text-[10px] font-bold text-white/80">{seatName(idx)}</span>
                  <div className="flex gap-0.5 ml-1">
                    {Array.from({ length: bestOf }).map((_, ri) => (
                      <div
                        key={ri}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            ri < (roundWins[idx] || 0)
                              ? SEAT_COLORS[idx]
                              : 'rgba(255,255,255,0.1)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Waiting overlay ──────────────────────────── */}
        {phase === 'waiting' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#13141f] border border-white/[0.08] rounded-2xl p-6 max-w-xs w-full mx-4 text-center space-y-4">
              <div className="text-3xl">💣</div>
              <h2 className="text-lg font-black text-white">Waiting for Players</h2>
              <p className="text-xs text-gray-500">Room: {roomId}</p>

              {/* Seats */}
              <div className="grid grid-cols-2 gap-2">
                {seats.map((seat, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-3 py-2 border text-left ${
                      seat
                        ? 'border-white/10 bg-white/[0.04]'
                        : 'border-dashed border-white/[0.06] bg-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: seat ? SEAT_COLORS[idx] : 'rgba(255,255,255,0.1)',
                        }}
                      />
                      <span className="text-[11px] font-semibold text-white/80 truncate">
                        {seat ? (seat.isBot ? `Bot` : seat.userId === user?.id ? 'You' : 'Player') : 'Empty'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Host start button */}
              {isHost && !botMode && activePlayers >= 2 && (
                <button
                  onClick={handleStart}
                  className="w-full h-11 rounded-xl bg-violet-500/20 border border-violet-400/30 text-violet-100 font-black tracking-wide text-sm hover:bg-violet-500/30 active:scale-[0.98] transition-all"
                >
                  Start Match
                </button>
              )}

              {isHost && activePlayers < 2 && !botMode && (
                <p className="text-[10px] text-gray-600">Need at least 2 players to start</p>
              )}

              {!isHost && (
                <p className="text-[10px] text-gray-500">Waiting for host to start...</p>
              )}

              {botMode && (
                <p className="text-[10px] text-gray-500 animate-pulse">Starting {botMode === 'duel' ? 'duel' : 'arena'} match...</p>
              )}
            </div>
          </div>
        )}

        {/* ── Round end overlay ────────────────────────── */}
        {phase === 'round_end' && roundResult && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#13141f] border border-white/[0.08] rounded-2xl p-6 max-w-xs w-full mx-4 text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="text-2xl font-black text-white">
                {roundResult.winner === localSeat ? 'Round Won!' : 'Round Lost'}
              </div>
              <div className="flex items-center justify-center gap-3">
                {roundResult.roundWins.map((wins, idx) => {
                  if (!seats[idx]) return null;
                  return (
                    <div key={idx} className="text-center">
                      <div
                        className="w-3 h-3 rounded-full mx-auto mb-1"
                        style={{ backgroundColor: SEAT_COLORS[idx] }}
                      />
                      <div className="text-xs font-bold text-white/80">{wins}</div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500 animate-pulse">Next round starting...</p>
            </div>
          </div>
        )}

        {/* ── Match end overlay ────────────────────────── */}
        {phase === 'match_end' && matchResult && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#13141f] border border-white/[0.08] rounded-2xl p-6 max-w-sm w-full mx-4 text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="text-4xl mb-1">
                {matchResult.winner === localSeat ? '🏆' : '💥'}
              </div>
              <h2 className="text-xl font-black text-white">
                {matchResult.winner === localSeat ? 'Victory!' : 'Defeat'}
              </h2>
              <p className="text-xs text-gray-400">
                {matchResult.winner === localSeat
                  ? 'You dominated the arena!'
                  : `${seatName(matchResult.winner)} wins the match`}
              </p>

              {/* Stats */}
              {matchResult.stats && (
                <div className="grid grid-cols-2 gap-2 text-left">
                  {Object.entries(matchResult.stats).map(([key, val]) => (
                    <div key={key} className="rounded-lg bg-black/30 px-3 py-2">
                      <div className="text-[9px] text-gray-500 uppercase tracking-wider">{key.replace(/_/g, ' ')}</div>
                      <div className="text-sm font-bold text-white/90 tabular-nums">{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleRematch}
                  className={`flex-1 h-11 rounded-xl border font-bold text-sm transition-all active:scale-[0.98] ${
                    rematchVotes.has(user?.id)
                      ? 'border-violet-400/40 bg-violet-500/25 text-violet-200'
                      : 'border-violet-400/30 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25'
                  }`}
                >
                  {rematchVotes.has(user?.id) ? `Rematch (${rematchVotes.size})` : 'Rematch'}
                </button>
                <button
                  onClick={handleLeave}
                  className="flex-1 h-11 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/70 font-semibold text-sm hover:bg-white/[0.07] transition-all active:scale-[0.98]"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Error overlay ────────────────────────────── */}
        {errorMsg && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-400/30 text-rose-200 text-xs font-semibold backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
            {errorMsg}
          </div>
        )}

        {/* ── Connecting overlay ───────────────────────── */}
        {phase === 'connecting' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-violet-400/40 border-t-violet-400 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-400">Connecting...</p>
            </div>
          </div>
        )}

        {/* ── Chat overlay ─────────────────────────────── */}
        <div className="absolute bottom-2 left-2 z-20 w-48 sm:w-56 pointer-events-none">
          {/* Messages */}
          <div className="max-h-28 overflow-y-auto mb-1 space-y-0.5 scrollbar-none">
            {chatMessages.slice(-8).map((msg, i) => (
              <div
                key={i}
                className="text-[10px] leading-tight px-1.5 py-0.5 rounded bg-black/40 backdrop-blur-sm pointer-events-auto"
                style={{ opacity: Math.max(0.4, 1 - (chatMessages.length - (chatMessages.length - 8 + i)) * 0.08) }}
              >
                {msg.system ? (
                  <span className="text-gray-500 italic">{msg.text}</span>
                ) : msg.emote ? (
                  <span className="text-white/80">{msg.emote}</span>
                ) : (
                  <>
                    <span
                      className="font-semibold mr-1"
                      style={{
                        color: SEAT_COLORS[
                          seats.findIndex((s) => s && s.userId === msg.userId)
                        ] || '#888',
                      }}
                    >
                      {seatName(seats.findIndex((s) => s && s.userId === msg.userId))}:
                    </span>
                    <span className="text-white/70">{msg.text}</span>
                  </>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input (desktop, toggle with Enter) */}
          {chatOpen && !isMobile && (
            <div className="flex gap-1 pointer-events-auto">
              <input
                autoFocus
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendChat();
                    setChatOpen(false);
                  }
                  if (e.key === 'Escape') setChatOpen(false);
                }}
                maxLength={100}
                placeholder="Type message..."
                className="flex-1 h-7 px-2 rounded bg-black/60 border border-white/10 text-[11px] text-white placeholder:text-gray-600 outline-none focus:border-white/20"
              />
            </div>
          )}
        </div>

        {/* ── Touch controls (mobile) ──────────────────── */}
        {isMobile && phase === 'playing' && (
          <>
            {/* D-pad - left side */}
            <div className="absolute bottom-6 left-4 z-20 pointer-events-auto">
              <div className="relative w-32 h-32">
                {/* Up */}
                <button
                  onTouchStart={handleDpadStart('up')}
                  onTouchEnd={handleDpadEnd()}
                  onTouchCancel={handleDpadEnd()}
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-11 h-11 rounded-lg bg-white/[0.08] border border-white/[0.12] active:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white/60">
                    <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {/* Down */}
                <button
                  onTouchStart={handleDpadStart('down')}
                  onTouchEnd={handleDpadEnd()}
                  onTouchCancel={handleDpadEnd()}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-11 h-11 rounded-lg bg-white/[0.08] border border-white/[0.12] active:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white/60">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {/* Left */}
                <button
                  onTouchStart={handleDpadStart('left')}
                  onTouchEnd={handleDpadEnd()}
                  onTouchCancel={handleDpadEnd()}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg bg-white/[0.08] border border-white/[0.12] active:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white/60">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>
                {/* Right */}
                <button
                  onTouchStart={handleDpadStart('right')}
                  onTouchEnd={handleDpadEnd()}
                  onTouchCancel={handleDpadEnd()}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg bg-white/[0.08] border border-white/[0.12] active:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white/60">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
                {/* Center dot */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-3 h-3 rounded-full bg-white/[0.06] border border-white/[0.08]" />
                </div>
              </div>
            </div>

            {/* Bomb button - right side */}
            <button
              onTouchStart={handleBombTouch}
              className="absolute bottom-10 right-6 z-20 w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-400/30 active:bg-rose-500/40 flex items-center justify-center transition-colors pointer-events-auto"
            >
              <span className="text-2xl">💣</span>
            </button>

            {/* Mobile chat toggle */}
            <button
              onClick={() => setChatOpen((v) => !v)}
              className="absolute bottom-10 right-24 z-20 w-10 h-10 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center pointer-events-auto"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/40">
                <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.232 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
              </svg>
            </button>
          </>
        )}

        {/* Mobile chat input overlay */}
        {isMobile && chatOpen && (
          <div className="absolute bottom-0 left-0 right-0 z-30 p-2 bg-black/80 backdrop-blur-sm pointer-events-auto">
            <div className="flex gap-2">
              <input
                autoFocus
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendChat();
                    setChatOpen(false);
                  }
                }}
                maxLength={100}
                placeholder="Type message..."
                className="flex-1 h-9 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-sm text-white placeholder:text-gray-600 outline-none focus:border-white/20"
              />
              <button
                onClick={() => { handleSendChat(); setChatOpen(false); }}
                className="h-9 px-4 rounded-lg bg-violet-500/20 border border-violet-400/30 text-violet-200 text-sm font-semibold"
              >
                Send
              </button>
              <button
                onClick={() => setChatOpen(false)}
                className="h-9 px-2 text-gray-500 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

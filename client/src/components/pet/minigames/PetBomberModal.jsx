import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SpritePet from '../../SpritePet';
import { CHAR_COLORS } from './miniPumpSprites';
import {
  getPetBomberStats,
  getPetBomberHumanLeaderboard,
  getPetBomberBotLeaderboard,
  getPetBomberRooms,
  createPetBomberRoom,
} from '../../../utils/api';

// ── Pixel art helpers (same as miniPumpSprites internals) ──
function _px(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), s, s);
}
function _ellipse(ctx, cx, cy, rx, ry, ps, color) {
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++)
      if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1)
        _px(ctx, cx + dx * ps, cy + dy * ps, ps, color);
}
function _circle(ctx, cx, cy, r, ps, color) { _ellipse(ctx, cx, cy, r, r, ps, color); }

// ── Bomber pet hero: chubby pet holding bomb with determination ──
function drawBomberPet(ctx, x, y, ps, character, time) {
  const c = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const centerX = x;
  const headY = y - 10 * ps;
  const bodyY = y + 2 * ps;
  const bodyDy = -ps;

  // Shadow
  _ellipse(ctx, centerX, y + 14 * ps + bodyDy, 7, 2, ps, 'rgba(0,0,0,0.15)');
  // Body
  _ellipse(ctx, centerX, bodyY + bodyDy, 8, 7, ps, c.outline);
  _ellipse(ctx, centerX, bodyY + bodyDy, 7, 6, ps, c.body);
  _ellipse(ctx, centerX, bodyY + 2 * ps + bodyDy, 5, 4, ps, c.belly);
  // Legs
  const legY = bodyY + 7 * ps + bodyDy, legSpread = 4 * ps;
  ctx.fillStyle = c.outline;
  ctx.fillRect(centerX - legSpread - ps, legY, 3 * ps, 6 * ps);
  ctx.fillStyle = c.body;
  ctx.fillRect(centerX - legSpread, legY + ps, ps, 4 * ps);
  ctx.fillStyle = c.outline;
  ctx.fillRect(centerX + legSpread - 2 * ps, legY, 3 * ps, 6 * ps);
  ctx.fillStyle = c.body;
  ctx.fillRect(centerX + legSpread - ps, legY + ps, ps, 4 * ps);

  // Head
  const hx = centerX, hy = headY;
  if (character === 'buu') {
    _ellipse(ctx, hx, hy + 2 * ps, 10, 8, ps, c.outline);
    _ellipse(ctx, hx, hy + 2 * ps, 9, 7, ps, c.body);
    _ellipse(ctx, hx, hy - ps, 7, 6, ps, c.body);
    _px(ctx, hx - ps, hy - 8 * ps, ps, c.accent);
    _px(ctx, hx, hy - 9 * ps, ps, c.accent);
    _px(ctx, hx + ps, hy - 10 * ps, ps, c.accent);
    _circle(ctx, hx + 2 * ps, hy - 11 * ps, 2, ps, c.accent);
  } else {
    _ellipse(ctx, hx, hy, 10, 8, ps, c.outline);
    _ellipse(ctx, hx, hy, 9, 7, ps, c.body);
    _ellipse(ctx, hx, hy - 2 * ps, 6, 4, ps, c.light);
  }
  // Ears / horns
  if (character === 'dojocat' || character === 'pixiu') {
    const earY2 = hy - 7 * ps;
    for (let i = 0; i < 4; i++) { _px(ctx, hx - 8 * ps + i * ps, earY2 - i * ps, ps, c.outline); _px(ctx, hx + 8 * ps - i * ps, earY2 - i * ps, ps, c.outline); }
    for (let i = 0; i < 3; i++) { _px(ctx, hx - 7 * ps + i * ps, earY2 - i * ps + ps, ps, c.accent); _px(ctx, hx + 7 * ps - i * ps, earY2 - i * ps + ps, ps, c.accent); }
    _ellipse(ctx, hx, hy + 2 * ps, 4, 3, ps, c.belly);
  }
  if (character === 'devit') { for (let i = 0; i < 5; i++) { _px(ctx, hx - 6 * ps - i * ps, hy - 5 * ps - i * ps, ps * 2, c.accent); _px(ctx, hx + 6 * ps + i * ps, hy - 5 * ps - i * ps, ps * 2, c.accent); } }
  if (character === 'pixiu') { for (let i = 0; i < 3; i++) { _px(ctx, hx - 10 * ps, hy - 2 * ps + i * 2 * ps, ps * 2, c.accent); _px(ctx, hx + 9 * ps, hy - 2 * ps + i * 2 * ps, ps * 2, c.accent); } }

  // Eyes – determined (round eyes + angled brows)
  const eyeY = hy + ps, eyeSpread = 4 * ps;
  _circle(ctx, hx - eyeSpread, eyeY, 2, ps, c.eye);
  _circle(ctx, hx + eyeSpread, eyeY, 2, ps, c.eye);
  _px(ctx, hx - eyeSpread + ps, eyeY - ps, ps, '#ffffff');
  _px(ctx, hx + eyeSpread + ps, eyeY - ps, ps, '#ffffff');
  // Brows angled inward
  _px(ctx, hx - eyeSpread - 2 * ps, eyeY - 4 * ps, ps, c.outline);
  _px(ctx, hx - eyeSpread - ps, eyeY - 4 * ps, ps, c.outline);
  _px(ctx, hx - eyeSpread, eyeY - 3 * ps, ps, c.outline);
  _px(ctx, hx + eyeSpread, eyeY - 3 * ps, ps, c.outline);
  _px(ctx, hx + eyeSpread + ps, eyeY - 4 * ps, ps, c.outline);
  _px(ctx, hx + eyeSpread + 2 * ps, eyeY - 4 * ps, ps, c.outline);
  // Mouth – small smirk
  _px(ctx, hx - ps, hy + 4 * ps, ps, c.nose);
  _px(ctx, hx, hy + 4 * ps, ps, c.nose);
  _px(ctx, hx + ps, hy + 3 * ps, ps, c.nose);

  // Left arm – down
  const armY = bodyY - 2 * ps + bodyDy;
  for (let i = 0; i < 5; i++) _px(ctx, centerX - 9 * ps, armY + i * ps, 2 * ps, c.outline);

  // Right arm – raised up + angled, holding bomb
  const armX = centerX + 8 * ps;
  for (let i = 0; i < 5; i++) _px(ctx, armX, armY - i * ps, 2 * ps, c.outline);
  for (let i = 0; i < 5; i++) _px(ctx, armX + i * ps, armY - (5 + i) * ps, 2 * ps, c.outline);

  // Bomb
  const bombX = armX + 5 * ps;
  const bombY = armY - 10 * ps;
  _circle(ctx, bombX, bombY, 5, ps, '#111111');
  _circle(ctx, bombX, bombY, 4, ps, '#2a2a2a');
  _px(ctx, bombX - 2 * ps, bombY - 2 * ps, ps, '#555555');
  _px(ctx, bombX - ps, bombY - 3 * ps, ps, '#444444');
  // Fuse
  _px(ctx, bombX, bombY - 5 * ps, ps, '#886633');
  _px(ctx, bombX + ps, bombY - 6 * ps, ps, '#886633');
  // Spark (flickers)
  const sparkOn = Math.sin(time * 8) > 0;
  _px(ctx, bombX + 2 * ps, bombY - 7 * ps, ps, sparkOn ? '#ffcc00' : '#ff6600');
  _px(ctx, bombX + ps, bombY - 7 * ps, ps, '#ff4400');
  _px(ctx, bombX + 2 * ps, bombY - 8 * ps, ps, sparkOn ? '#ff4400' : '#ffaa00');
}

// ── Animated canvas component for the hero pet ──
function BomberPetHero({ character }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = 160, h = 140;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    let raf;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = Date.now() / 1000;
      const bob = Math.sin(t * 2.5) * 1.5;
      drawBomberPet(ctx, 70, 85 + bob, 3, character || 'dojocat', t);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [character]);
  return <canvas ref={ref} className="mx-auto" />;
}

function LeaderboardEntry({ entry, rank, character }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${entry.is_me ? 'bg-violet-400/[0.08]' : 'bg-black/20'}`}>
      <div className={`w-6 text-[10px] font-black tabular-nums ${rank === 1 ? 'text-amber-300' : rank === 2 ? 'text-slate-300' : 'text-violet-300'}`}>#{rank}</div>
      <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1 py-0.5 shrink-0">
        <SpritePet character={entry.character || character || 'dojocat'} size={24} inline />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-semibold text-white/90">{entry.username || 'Unknown'}</div>
        <div className="truncate text-[9px] text-gray-500">Streak {entry.bestStreak || 0}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[12px] font-black tabular-nums text-violet-200">{entry.wins || 0}W</div>
        <div className="text-[9px] text-gray-600 tabular-nums">{entry.matchesPlayed || 0} matches</div>
      </div>
    </div>
  );
}

export default function PetBomberModal({ open, onClose, character }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [humanLb, setHumanLb] = useState(null);
  const [botLb, setBotLb] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [lbTab, setLbTab] = useState('human');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    getPetBomberStats().then(setStats).catch(() => {});
    getPetBomberHumanLeaderboard().then((r) => setHumanLb(r.leaderboard || [])).catch(() => {});
    getPetBomberBotLeaderboard().then((r) => setBotLb(r.leaderboard || [])).catch(() => {});
    getPetBomberRooms().then((r) => setRooms(r.rooms || [])).catch(() => {});
  }, [open]);

  const refreshRooms = useCallback(() => {
    getPetBomberRooms().then((r) => setRooms(r.rooms || [])).catch(() => {});
  }, []);

  const handleCreateRoom = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await createPetBomberRoom(character);
      const nextRoomId = result?.roomId || result?.id || result?.room?.roomId || result?.room?.id;
      if (nextRoomId) {
        onClose?.();
        navigate(`/pet/bomber/${nextRoomId}`);
      }
    } catch (e) {
      console.error('Failed to create room', e);
    } finally {
      setBusy(false);
    }
  }, [busy, character, navigate, onClose]);

  const handleJoinRoom = useCallback((roomId) => {
    onClose?.();
    navigate(`/pet/bomber/${roomId}`);
  }, [navigate, onClose]);

  const handleSoloPlay = useCallback(async (botMode) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await createPetBomberRoom(character);
      const nextRoomId = result?.roomId || result?.id || result?.room?.roomId || result?.room?.id;
      if (nextRoomId) {
        onClose?.();
        navigate(`/pet/bomber/${nextRoomId}?bot=${botMode}`);
      }
    } catch (e) {
      console.error('Failed to create solo room', e);
    } finally {
      setBusy(false);
    }
  }, [busy, character, navigate, onClose]);

  if (!open) return null;

  const humanStats = stats?.human;
  const botStats = stats?.bot;
  const lbEntries = (lbTab === 'human' ? humanLb : botLb) || [];

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0d0e16] select-none" style={{ WebkitTouchCallout: 'none', overscrollBehavior: 'none' }} onContextMenu={(e) => e.preventDefault()}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/40 border-b border-white/[0.06] shrink-0">
        <button onClick={onClose} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <div className="text-[11px] font-black tracking-widest text-white/60 uppercase">Pet Bomber</div>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {/* Hero */}
        <div className="text-center">
          <BomberPetHero character={character} />
          <h2 className="text-xl font-black text-white -mt-1">Pet Bomber</h2>
          <p className="text-xs text-gray-500 mt-1">Drop bombs, grab power-ups, and blast your rivals!</p>
        </div>

        {/* Play buttons */}
        <div className="space-y-2">
          <button
            onClick={handleCreateRoom}
            disabled={busy}
            className="w-full h-12 rounded-xl border border-violet-400/30 bg-violet-500/15 text-violet-100 font-black tracking-wide hover:bg-violet-500/20 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            Create Room
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleSoloPlay('duel')}
              disabled={busy}
              className="h-11 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/80 font-semibold text-sm hover:bg-white/[0.07] active:scale-[0.99] transition-all disabled:opacity-50"
            >
              Duel Bot
            </button>
            <button
              onClick={() => handleSoloPlay('full')}
              disabled={busy}
              className="h-11 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/80 font-semibold text-sm hover:bg-white/[0.07] active:scale-[0.99] transition-all disabled:opacity-50"
            >
              Full Arena
            </button>
          </div>
        </div>

        {/* Power-ups */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
          <div className="text-[10px] font-black tracking-[0.2em] uppercase text-violet-200/80 mb-2">Power-ups</div>
          <div className="grid grid-cols-1 gap-1.5">
            {[
              { icon: '💣', name: 'Extra Bomb', desc: '+1 bomb capacity', color: '#ff6666' },
              { icon: '🔥', name: 'Blast Up', desc: '+1 blast range', color: '#ffaa33' },
              { icon: '⚡', name: 'Speed Up', desc: 'Move faster', color: '#55ccff' },
              { icon: '👢', name: 'Kick', desc: 'Kick bombs forward', color: '#ffdd44' },
              { icon: '👻', name: 'Pass', desc: 'Walk through bombs', color: '#bb77ff' },
            ].map(item => (
              <div key={item.name} className="flex items-center gap-2 px-2 py-1 rounded-md bg-black/20">
                <span className="text-sm w-5 text-center shrink-0">{item.icon}</span>
                <span className="text-[11px] font-semibold shrink-0" style={{ color: item.color }}>{item.name}</span>
                <span className="text-[10px] text-gray-500 ml-auto">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Open rooms */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-black tracking-[0.2em] uppercase text-violet-200/80">Open Rooms</div>
            <button onClick={refreshRooms} className="text-[10px] text-gray-500 hover:text-white transition-colors">Refresh</button>
          </div>
          {rooms.length > 0 ? (
            <div className="space-y-1.5">
              {rooms.map((room) => {
                const roomId = room.roomId || room.id;
                if (!roomId) return null;
                return (
                <button
                  key={roomId}
                  onClick={() => handleJoinRoom(roomId)}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-black/20 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div>
                    <div className="text-[11px] font-semibold text-white/90">{room.hostName || room.hostId || 'Room'}</div>
                    <div className="text-[9px] text-gray-500">{room.playerCount}/4 players</div>
                  </div>
                  <span className="text-[10px] text-violet-300 font-semibold">Join</span>
                </button>
                );
              })}
            </div>
          ) : (
            <div className="text-[10px] text-gray-600 py-2">No open rooms right now. Create one!</div>
          )}
        </div>

        {/* Stats */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
          <div className="text-[10px] font-black tracking-[0.2em] uppercase text-violet-200/80 mb-2">Your Stats</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">vs Humans</div>
              <div className="text-sm font-black text-white tabular-nums">{humanStats?.wins ?? 0}W - {humanStats?.losses ?? 0}L</div>
              <div className="text-[9px] text-gray-600">Best streak: {humanStats?.bestStreak ?? 0}</div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">vs Bots</div>
              <div className="text-sm font-black text-white tabular-nums">{botStats?.wins ?? 0}W - {botStats?.losses ?? 0}L</div>
              <div className="text-[9px] text-gray-600">Best streak: {botStats?.bestStreak ?? 0}</div>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] font-black tracking-[0.2em] uppercase text-violet-200/80">Leaderboard</div>
            <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
              <button
                onClick={() => setLbTab('human')}
                className={`px-2 py-0.5 text-[9px] font-semibold transition-colors ${lbTab === 'human' ? 'bg-violet-500/20 text-violet-200' : 'text-gray-500 hover:text-white'}`}
              >
                Human
              </button>
              <button
                onClick={() => setLbTab('bot')}
                className={`px-2 py-0.5 text-[9px] font-semibold transition-colors ${lbTab === 'bot' ? 'bg-violet-500/20 text-violet-200' : 'text-gray-500 hover:text-white'}`}
              >
                Bot
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {lbEntries.length > 0 ? lbEntries.slice(0, 10).map((entry, i) => (
              <LeaderboardEntry key={entry.userId || i} entry={entry} rank={i + 1} character={character} />
            )) : (
              <div className="text-[10px] text-gray-500 py-2">No entries yet. Be the first!</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

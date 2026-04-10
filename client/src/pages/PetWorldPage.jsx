import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getMyPetWorld,
  createPetWorld,
  buildPetWorldBuilding,
  demolishPetWorldBuilding,
  upgradePetWorldBuilding,
  assignPetWorldWorkers,
  expandPetWorld,
  clearPetWorldTile,
  getPetWorldTrades,
  acceptPetWorldTrade,
  declinePetWorldTrade,
  getPetWorldLeaderboard,
  getPetWorldEncounters,
  huntPetWorldEncounter,
  dismissPetWorldEncounter,
  getPetWorldVisitors,
  postPetWorldPresence,
} from '../utils/api';
import PetWorldHUD from '../components/petWorld/PetWorldHUD';
import PetWorldCanvas from '../components/petWorld/PetWorldCanvas';
import PetWorldBuildMenu from '../components/petWorld/PetWorldBuildMenu';
import PetWorldBuildingInfo from '../components/petWorld/PetWorldBuildingInfo';
import PetWorldCreateModal from '../components/petWorld/PetWorldCreateModal';
import PetWorldTradeModal from '../components/petWorld/PetWorldTradeModal';
import { playBuildSound, playClearSound, playExpandSound, playUpgradeSound, playErrorSound, playHuntStrikeSound, playHuntSuccessSound, playHuntEscapeSound, playEncounterAlertSound } from '../components/petWorld/petWorldAudio';

/* ─── Toast ─────────────────────────────────────────────────────── */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
      {message}
    </div>
  );
}

/* ─── Seasonal Events Banner ───────────────────────────────────── */
function SeasonalBanner({ events }) {
  if (!events || events.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-amber-500/15 border-b border-amber-400/10 overflow-x-auto">
      {events.map((evt, i) => (
        <div key={evt.id || i} className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] font-semibold text-amber-200/90">{evt.name || evt.title}</span>
          {evt.ends_at && (
            <span className="text-[9px] text-amber-300/50 ml-1">
              ends {new Date(evt.ends_at).toLocaleDateString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Encounter Scene Drawing Helpers ──────────────────────────── */

function _epx(ctx, x, y, w, h, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
}

function _ecirc(ctx, cx, cy, r, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function _etri(ctx, x1, y1, x2, y2, x3, y3, fill) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/* Scene background: gradient sky, rolling hills, grass tufts, two trees */
function drawEncounterBackground(ctx, w, h, time) {
  // sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  skyGrad.addColorStop(0, '#1a2640');
  skyGrad.addColorStop(1, '#2d4a3e');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // stars
  const starSeed = [0.12, 0.28, 0.45, 0.62, 0.78, 0.91, 0.34, 0.56];
  for (let i = 0; i < starSeed.length; i++) {
    const sx = starSeed[i] * w;
    const sy = (starSeed[(i + 3) % starSeed.length]) * h * 0.35;
    const twinkle = 0.3 + 0.4 * Math.sin(time * 0.003 + i * 1.7);
    _ecirc(ctx, sx, sy, 1, '#ffffff', twinkle);
  }

  // distant hills
  ctx.fillStyle = '#1e3a2a';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.55);
  ctx.quadraticCurveTo(w * 0.25, h * 0.42, w * 0.5, h * 0.50);
  ctx.quadraticCurveTo(w * 0.75, h * 0.58, w, h * 0.48);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // ground
  const groundGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
  groundGrad.addColorStop(0, '#2a5e3a');
  groundGrad.addColorStop(1, '#1d4a2c');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  // grass tufts
  const grassColor = '#3a7a4a';
  const grassHighlight = '#4a9a5a';
  for (let i = 0; i < 12; i++) {
    const gx = (i * 21 + 7) % w;
    const gy = h * 0.62 + (i % 3) * 14;
    const sway = Math.sin(time * 0.002 + i * 0.8) * 2;
    _etri(ctx, gx, gy, gx + sway - 2, gy - 8, gx + sway + 2, gy - 6, grassColor);
    _etri(ctx, gx + 5, gy, gx + 5 + sway - 1.5, gy - 6, gx + 5 + sway + 1.5, gy - 4, grassHighlight);
  }

  // left tree
  const treeX = w * 0.08;
  const treeY = h * 0.58;
  const treeSway = Math.sin(time * 0.0015) * 1.5;
  _epx(ctx, treeX + 4, treeY, 5, 18, '#3d2b1a');
  _ecirc(ctx, treeX + 6 + treeSway, treeY - 4, 11, '#1e5030');
  _ecirc(ctx, treeX + 3 + treeSway, treeY - 6, 7, '#2a6a3e', 0.8);

  // right tree
  const tree2X = w * 0.88;
  const tree2Y = h * 0.56;
  const tree2Sway = Math.sin(time * 0.0015 + 2) * 1.5;
  _epx(ctx, tree2X + 3, tree2Y, 4, 16, '#3d2b1a');
  _ecirc(ctx, tree2X + 5 + tree2Sway, tree2Y - 3, 9, '#1e5030');
  _ecirc(ctx, tree2X + 2 + tree2Sway, tree2Y - 5, 6, '#2a6a3e', 0.8);
}

/* Animal sprite drawing: each gets a 2-frame idle animation */
function drawAnimal(ctx, type, cx, cy, frame, fleeing, captured) {
  const s = 3; // pixel scale
  const f = frame % 2; // 0 or 1 for idle bob
  const bob = f === 0 ? 0 : -s;

  // fleeing: slide right and fade
  let ox = 0;
  let alpha = 1;
  if (fleeing > 0) {
    ox = fleeing * 80;
    alpha = Math.max(0, 1 - fleeing);
  }
  if (captured > 0) {
    alpha = Math.max(0, 1 - captured * 0.8);
  }

  ctx.globalAlpha = alpha;
  const bx = cx + ox;
  const by = cy + bob;

  if (type === 'fox_raid' || type === 'fox') {
    // body
    _epx(ctx, bx - 6*s, by - 2*s, 12*s, 5*s, '#d4702a', alpha);
    // head
    _epx(ctx, bx + 5*s, by - 4*s, 5*s, 5*s, '#d4702a', alpha);
    // ears
    _etri(ctx, bx + 6*s, by - 4*s, bx + 7*s, by - 7*s, bx + 8*s, by - 4*s, '#d4702a');
    _etri(ctx, bx + 8*s, by - 4*s, bx + 9*s, by - 7*s, bx + 10*s, by - 4*s, '#d4702a');
    // ear insides
    _etri(ctx, bx + 6.5*s, by - 4*s, bx + 7*s, by - 6*s, bx + 7.5*s, by - 4*s, '#e8a070');
    _etri(ctx, bx + 8.5*s, by - 4*s, bx + 9*s, by - 6*s, bx + 9.5*s, by - 4*s, '#e8a070');
    // white chest
    _epx(ctx, bx - 2*s, by, 4*s, 3*s, '#f0e0d0', alpha);
    // eye
    _epx(ctx, bx + 8*s, by - 3*s, s, s, '#1a1a1a', alpha);
    // nose
    _epx(ctx, bx + 10*s, by - 2*s, s, s, '#1a1a1a', alpha);
    // tail
    _epx(ctx, bx - 9*s, by - 3*s, 4*s, 2*s, '#d4702a', alpha);
    _epx(ctx, bx - 10*s, by - 4*s, 2*s, 2*s, '#f0e0d0', alpha);
    // legs
    const legShift = f === 0 ? 0 : s;
    _epx(ctx, bx - 4*s, by + 3*s, 2*s, 3*s + legShift, '#b85a1e', alpha);
    _epx(ctx, bx + 2*s, by + 3*s, 2*s, 3*s - legShift + s, '#b85a1e', alpha);
  } else if (type === 'wolf_pack' || type === 'wolf') {
    // body
    _epx(ctx, bx - 7*s, by - 2*s, 14*s, 6*s, '#6e6e7a', alpha);
    // head
    _epx(ctx, bx + 6*s, by - 4*s, 6*s, 5*s, '#7a7a88', alpha);
    // ears
    _etri(ctx, bx + 7*s, by - 4*s, bx + 8*s, by - 8*s, bx + 9*s, by - 4*s, '#6e6e7a');
    _etri(ctx, bx + 10*s, by - 4*s, bx + 11*s, by - 8*s, bx + 12*s, by - 4*s, '#6e6e7a');
    // snout
    _epx(ctx, bx + 11*s, by - 2*s, 3*s, 3*s, '#8a8a96', alpha);
    // eye
    _epx(ctx, bx + 9*s, by - 3*s, s, s, '#eeba30', alpha);
    // nose
    _epx(ctx, bx + 13*s, by - 1*s, s, s, '#1a1a1a', alpha);
    // belly lighter
    _epx(ctx, bx - 3*s, by + 1*s, 8*s, 3*s, '#8a8a96', alpha);
    // tail
    _epx(ctx, bx - 10*s, by - 4*s, 4*s, 2*s, '#5e5e6a', alpha);
    _epx(ctx, bx - 11*s, by - 5*s, 2*s, 2*s, '#5e5e6a', alpha);
    // legs
    const legShift = f === 0 ? 0 : s;
    _epx(ctx, bx - 5*s, by + 4*s, 2*s, 4*s + legShift, '#5e5e6a', alpha);
    _epx(ctx, bx - 1*s, by + 4*s, 2*s, 4*s - legShift + s, '#5e5e6a', alpha);
    _epx(ctx, bx + 3*s, by + 4*s, 2*s, 4*s + legShift, '#5e5e6a', alpha);
  } else if (type === 'bear_sighting' || type === 'bear') {
    // body (larger, rounder)
    _epx(ctx, bx - 8*s, by - 4*s, 16*s, 10*s, '#5a3a20', alpha);
    // head
    _ecirc(ctx, bx + 7*s, by - 3*s, 4*s, '#6a4a2a', alpha);
    // ears
    _ecirc(ctx, bx + 5*s, by - 6*s, 2*s, '#5a3a20', alpha);
    _ecirc(ctx, bx + 9*s, by - 6*s, 2*s, '#5a3a20', alpha);
    _ecirc(ctx, bx + 5*s, by - 6*s, s, '#7a5a3a', alpha);
    _ecirc(ctx, bx + 9*s, by - 6*s, s, '#7a5a3a', alpha);
    // snout
    _epx(ctx, bx + 9*s, by - 2*s, 3*s, 2*s, '#7a5a3a', alpha);
    // eyes
    _epx(ctx, bx + 6*s, by - 4*s, s, s, '#1a1a1a', alpha);
    _epx(ctx, bx + 8*s, by - 4*s, s, s, '#1a1a1a', alpha);
    // nose
    _epx(ctx, bx + 10*s, by - 2*s, s, s, '#1a1a1a', alpha);
    // belly
    _epx(ctx, bx - 4*s, by + 1*s, 10*s, 5*s, '#7a5a3a', alpha);
    // legs (stocky)
    const legShift = f === 0 ? 0 : s;
    _epx(ctx, bx - 6*s, by + 6*s, 3*s, 4*s + legShift, '#4a2a10', alpha);
    _epx(ctx, bx, by + 6*s, 3*s, 4*s - legShift + s, '#4a2a10', alpha);
    _epx(ctx, bx + 4*s, by + 6*s, 3*s, 4*s + legShift, '#4a2a10', alpha);
  } else if (type === 'deer_herd' || type === 'deer') {
    // body
    _epx(ctx, bx - 6*s, by - 1*s, 12*s, 5*s, '#a07840', alpha);
    // neck
    _epx(ctx, bx + 5*s, by - 5*s, 3*s, 6*s, '#a07840', alpha);
    // head
    _epx(ctx, bx + 5*s, by - 7*s, 5*s, 4*s, '#b08850', alpha);
    // antlers
    _epx(ctx, bx + 5*s, by - 9*s, s, 3*s, '#8a6a3a', alpha);
    _epx(ctx, bx + 4*s, by - 10*s, s, 2*s, '#8a6a3a', alpha);
    _epx(ctx, bx + 6*s, by - 11*s, s, s, '#8a6a3a', alpha);
    _epx(ctx, bx + 9*s, by - 9*s, s, 3*s, '#8a6a3a', alpha);
    _epx(ctx, bx + 10*s, by - 10*s, s, 2*s, '#8a6a3a', alpha);
    _epx(ctx, bx + 8*s, by - 11*s, s, s, '#8a6a3a', alpha);
    // eye
    _epx(ctx, bx + 8*s, by - 6*s, s, s, '#1a1a1a', alpha);
    // white belly spots
    _ecirc(ctx, bx - 2*s, by, 1.5*s, '#c0a060', alpha * 0.6);
    _ecirc(ctx, bx + 1*s, by - 0.5*s, s, '#c0a060', alpha * 0.5);
    // tail
    _epx(ctx, bx - 7*s, by - 1*s, 2*s, 2*s, '#f0e0c0', alpha);
    // legs (slender)
    const legShift = f === 0 ? 0 : s;
    _epx(ctx, bx - 4*s, by + 4*s, s * 1.5, 5*s + legShift, '#8a6830', alpha);
    _epx(ctx, bx - 1*s, by + 4*s, s * 1.5, 5*s - legShift + s, '#8a6830', alpha);
    _epx(ctx, bx + 2*s, by + 4*s, s * 1.5, 5*s + legShift, '#8a6830', alpha);
    _epx(ctx, bx + 5*s, by + 4*s, s * 1.5, 5*s - legShift + s, '#8a6830', alpha);
  } else {
    // rare_bird / default bird
    // body
    _ecirc(ctx, bx, by, 4*s, '#3a8ad0', alpha);
    // head
    _ecirc(ctx, bx + 4*s, by - 2*s, 2.5*s, '#4a9ae0', alpha);
    // eye
    _epx(ctx, bx + 5*s, by - 3*s, s * 0.8, s * 0.8, '#1a1a1a', alpha);
    // beak
    _etri(ctx, bx + 6*s, by - 2*s, bx + 8.5*s, by - 1.5*s, bx + 6*s, by - s, '#e8a030');
    // wing
    const wingY = f === 0 ? by - 2*s : by - 3.5*s;
    _etri(ctx, bx - s, by - s, bx - 4*s, wingY, bx + 2*s, by + s, '#2a6ab0');
    // tail feathers
    _etri(ctx, bx - 3*s, by, bx - 7*s, by - 2*s, bx - 5*s, by + s, '#2a6ab0');
    _etri(ctx, bx - 3*s, by + s, bx - 7*s, by, bx - 5*s, by + 2*s, '#3070c0');
    // tail plume highlights
    _epx(ctx, bx - 6*s, by - s, s, s, '#e8d040', alpha * 0.8);
    _epx(ctx, bx - 5*s, by + s, s * 0.8, s * 0.8, '#e84040', alpha * 0.7);
    // legs
    _epx(ctx, bx - s, by + 3*s, s * 0.7, 2*s, '#8a6830', alpha);
    _epx(ctx, bx + s, by + 3*s, s * 0.7, 2*s, '#8a6830', alpha);
  }
  ctx.globalAlpha = 1;
}

/* Timing ring colors */
function getRingColor(progress) {
  // progress 0..1: 0=outer/red, approaching 1=green sweet spot, then back to red
  // The "best" zone is 0.75..0.95
  if (progress < 0.4) return '#ef4444'; // red
  if (progress < 0.65) return '#f59e0b'; // amber
  if (progress < 0.85) return '#22c55e'; // green (sweet spot)
  return '#f59e0b'; // amber (past the sweet spot)
}

function getTimingBonus(progress) {
  // 0.75..0.85 is the green zone center
  const dist = Math.abs(progress - 0.8);
  if (dist < 0.05) return 1.0;
  if (dist < 0.15) return 0.7;
  if (dist < 0.25) return 0.4;
  return 0.1;
}

/* Resource label prettifier */
const RESOURCE_ICONS = { food: 'Food', wood: 'Wood', stone: 'Stone', cloth: 'Cloth', gold: 'Gold' };

/* ─── Encounter Modal ──────────────────────────────────────────── */
function EncounterModal({ encounter, onHunt, onDismiss, onClose, busy, buildings }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const startTimeRef = useRef(null);
  const frameCountRef = useRef(0);
  const [phase, setPhase] = useState('aim'); // 'aim' | 'striking' | 'result'
  const [ringProgress, setRingProgress] = useState(0);
  const [timingBonus, setTimingBonus] = useState(0);
  const [result, setResult] = useState(null); // { success, rewards }
  const [resultTimer, setResultTimer] = useState(0);
  const resultStartRef = useRef(null);

  // Derive watchtower success chance for display
  const watchtowerLevel = useMemo(() => {
    if (!buildings || buildings.length === 0) return 1;
    const wts = buildings.filter((b) => b.type === 'watchtower' && b.state === 'built');
    if (wts.length === 0) return 1;
    return Math.max(...wts.map((b) => b.level || 1));
  }, [buildings]);
  const successChance = Math.min(95, 60 + (watchtowerLevel - 1) * 15);

  // Reward preview from encounter DB record
  const rewardPreview = useMemo(() => {
    if (!encounter) return [];
    const items = [];
    if (encounter.reward_resource && encounter.reward_amount) {
      items.push({ resource: encounter.reward_resource, amount: encounter.reward_amount });
    }
    return items;
  }, [encounter]);

  // Reset state when encounter changes
  useEffect(() => {
    setPhase('aim');
    setRingProgress(0);
    setTimingBonus(0);
    setResult(null);
    setResultTimer(0);
    startTimeRef.current = null;
    resultStartRef.current = null;
  }, [encounter?.id]);

  // Main canvas animation loop
  useEffect(() => {
    if (!encounter) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 240;
    const H = 160;

    let running = true;
    const animate = (ts) => {
      if (!running) return;
      if (!startTimeRef.current) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      frameCountRef.current = Math.floor(elapsed / 500); // ~2fps sprite frame

      ctx.clearRect(0, 0, W, H);

      // Draw background scene
      drawEncounterBackground(ctx, W, H, elapsed);

      // Determine animal position
      const animalX = W * 0.48;
      const animalY = H * 0.68;
      const fleeVal = phase === 'result' && result && !result.success ? resultTimer : 0;
      const captVal = phase === 'result' && result && result.success ? resultTimer : 0;

      // Draw animal
      drawAnimal(ctx, encounter.encounter_type, animalX, animalY, frameCountRef.current, fleeVal, captVal);

      // Draw timing ring during aim phase
      if (phase === 'aim') {
        const RING_DURATION = 3000;
        const cycleTime = elapsed % RING_DURATION;
        const progress = cycleTime / RING_DURATION;
        setRingProgress(progress);

        const maxRadius = 34;
        const minRadius = 8;
        const currentRadius = maxRadius - (maxRadius - minRadius) * progress;
        const color = getRingColor(progress);

        // Outer static ring (target)
        ctx.beginPath();
        ctx.arc(animalX, animalY, minRadius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Green zone indicator ring
        ctx.beginPath();
        ctx.arc(animalX, animalY, minRadius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.2;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Shrinking ring
        ctx.beginPath();
        ctx.arc(animalX, animalY, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Crosshair lines
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(animalX - 40, animalY);
        ctx.lineTo(animalX + 40, animalY);
        ctx.moveTo(animalX, animalY - 40);
        ctx.lineTo(animalX, animalY + 40);
        ctx.stroke();
      }

      // Result phase: animate capture sparkles or escape dust
      if (phase === 'result' && result) {
        const t = resultTimer;
        if (result.success) {
          // Sparkle particles flying outward
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + t * 2;
            const dist = t * 40;
            const sx = animalX + Math.cos(angle) * dist;
            const sy = animalY + Math.sin(angle) * dist;
            const sparkAlpha = Math.max(0, 1 - t);
            const colors = ['#fbbf24', '#f59e0b', '#22c55e', '#60a5fa'];
            _ecirc(ctx, sx, sy, 2 + (1 - t) * 2, colors[i % 4], sparkAlpha);
          }
          // "Captured!" text
          if (t > 0.3) {
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#22c55e';
            ctx.globalAlpha = Math.min(1, (t - 0.3) * 3);
            ctx.fillText('Captured!', W / 2, H * 0.35);
            ctx.globalAlpha = 1;
          }
          // Reward fly-in
          if (t > 0.5 && result.rewards) {
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            const entries = Object.entries(result.rewards);
            entries.forEach(([res, amt], i) => {
              const ry = H * 0.42 + i * 16;
              const flyX = W / 2 + (1 - Math.min(1, (t - 0.5) * 4)) * 30;
              ctx.globalAlpha = Math.min(1, (t - 0.5) * 3);
              ctx.fillStyle = '#fbbf24';
              ctx.fillText(`+${amt} ${RESOURCE_ICONS[res] || res}`, flyX, ry);
              ctx.globalAlpha = 1;
            });
          }
        } else {
          // Escape dust cloud
          for (let i = 0; i < 6; i++) {
            const dx = animalX + t * 60 + i * 8;
            const dy = animalY + Math.sin(i * 1.5) * 6;
            const dustAlpha = Math.max(0, 0.6 - t * 0.5);
            _ecirc(ctx, dx, dy, 3 + i * 0.8, '#a08860', dustAlpha);
          }
          // "Escaped..." text
          if (t > 0.3) {
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ef4444';
            ctx.globalAlpha = Math.min(1, (t - 0.3) * 3);
            ctx.fillText('Escaped...', W / 2, H * 0.35);
            ctx.globalAlpha = 1;
          }
          // Partial reward
          if (t > 0.5 && result.rewards) {
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            const entries = Object.entries(result.rewards);
            entries.forEach(([res, amt], i) => {
              const ry = H * 0.42 + i * 14;
              ctx.globalAlpha = Math.min(1, (t - 0.5) * 3);
              ctx.fillStyle = '#f59e0b';
              ctx.fillText(`+${amt} ${RESOURCE_ICONS[res] || res} (partial)`, W / 2, ry);
              ctx.globalAlpha = 1;
            });
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [encounter, phase, result, resultTimer]);

  // Result animation timer
  useEffect(() => {
    if (phase !== 'result' || !result) return;
    resultStartRef.current = performance.now();
    let running = true;
    const tick = (ts) => {
      if (!running) return;
      const elapsed = (ts - resultStartRef.current) / 1500; // 1.5s duration
      setResultTimer(Math.min(1, elapsed));
      if (elapsed < 1) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    return () => { running = false; };
  }, [phase, result]);

  // Auto-close after result animation finishes
  useEffect(() => {
    if (phase === 'result' && resultTimer >= 1) {
      const timer = setTimeout(() => {
        onClose?.(result?.success ? 'Hunt successful!' : 'The creature escaped...');
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [phase, resultTimer, result, onClose]);

  if (!encounter) return null;

  const handleStrike = async () => {
    if (phase !== 'aim' || busy) return;
    const bonus = getTimingBonus(ringProgress);
    setTimingBonus(bonus);
    setPhase('striking');
    playHuntStrikeSound();

    try {
      const res = await onHunt(encounter.id, bonus);
      if (res && typeof res.success === 'boolean') {
        setResult(res);
        if (res.success) {
          playHuntSuccessSound();
        } else {
          playHuntEscapeSound();
        }
      } else {
        // Fallback if handler doesn't return result shape
        setResult({ success: true, rewards: {} });
        playHuntSuccessSound();
      }
    } catch {
      setResult({ success: false, rewards: {} });
      playHuntEscapeSound();
    }
    setPhase('result');
  };

  const handleDismiss = () => {
    if (busy) return;
    onDismiss(encounter.id);
  };

  const encounterName = encounter.encounter_name || encounter.name || 'Unknown creature';
  const encounterDesc = encounter.description || 'A creature has appeared near your village.';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="w-[280px] rounded-xl border border-white/[0.08] bg-slate-950/95 shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ animation: 'encounterSlideIn 0.25s ease-out' }}
      >
        {/* Canvas scene */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={240}
            height={160}
            className="w-full h-auto bg-slate-900"
            style={{ imageRendering: 'pixelated' }}
          />
          {/* Success chance badge */}
          <div className="absolute top-1.5 right-1.5 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 border border-white/10">
            <span className="text-[8px] uppercase tracking-wider text-white/50">chance </span>
            <span className="text-[10px] font-bold text-emerald-400">{successChance}%</span>
          </div>
          {/* Timing quality indicator during aim */}
          {phase === 'aim' && (
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-md bg-black/60 backdrop-blur-sm px-2 py-0.5 border border-white/10">
              <span className="text-[8px] font-bold" style={{ color: getRingColor(ringProgress) }}>
                {ringProgress < 0.4 ? 'Wait...' : ringProgress < 0.65 ? 'Almost...' : ringProgress < 0.85 ? 'NOW!' : 'Hmm...'}
              </span>
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="px-3 pt-2.5 pb-1.5">
          <div className="text-[9px] uppercase tracking-[0.16em] text-white/40">Encounter</div>
          <div className="mt-1 text-[13px] font-black text-white leading-tight">{encounterName}</div>
          <p className="mt-0.5 text-[10px] text-white/50 leading-relaxed">{encounterDesc}</p>

          {/* Reward preview */}
          {rewardPreview.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[8px] uppercase tracking-wider text-white/30">Reward</span>
              {rewardPreview.map((r) => (
                <span key={r.resource} className="text-[10px] font-semibold text-amber-300/80">
                  +{r.amount} {RESOURCE_ICONS[r.resource] || r.resource}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-3 pb-3 pt-1.5">
          {phase === 'aim' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleStrike}
                className="w-full rounded-lg border border-rose-400/25 bg-rose-500/[0.15] px-3 py-2.5 text-[12px] font-bold text-rose-100 hover:bg-rose-500/[0.28] active:scale-[0.97] transition-all disabled:opacity-50"
              >
                Strike!
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleDismiss}
                className="w-full mt-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold text-white/40 hover:bg-white/[0.08] hover:text-white/60 transition-colors disabled:opacity-50"
              >
                Dismiss
              </button>
            </>
          )}
          {phase === 'striking' && (
            <div className="flex items-center justify-center py-3">
              <div className="w-4 h-4 rounded-full border-2 border-rose-400/60 border-t-transparent animate-spin" />
              <span className="ml-2 text-[11px] text-white/50">Hunting...</span>
            </div>
          )}
          {phase === 'result' && (
            <div className="text-center py-1">
              <span className="text-[10px] text-white/30">
                {result?.success ? 'Hunt successful' : 'The creature fled'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes encounterSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

/* ─── Visitor Log Panel ────────────────────────────────────────── */
function VisitorLogPanel({ visitors, open, onClose }) {
  if (!open) return null;
  return (
    <div className="absolute top-12 right-2 z-40 w-56 rounded-xl border border-white/[0.08] bg-black/80 backdrop-blur-md p-3 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-[0.16em] text-white/40">Visitor Log</span>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xs">✕</button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {(!visitors || visitors.length === 0) ? (
          <div className="text-[10px] text-white/30 py-2 text-center">No recent visitors</div>
        ) : (
          visitors.map((v, i) => (
            <Link
              key={v.user_id || i}
              to={`/pet/world/${v.user_id}`}
              className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/[0.06] transition-colors"
            >
              <span className="truncate">{v.username || 'Unknown'}</span>
              <span className="text-white/40 text-[9px] shrink-0 ml-1">
                {v.visited_at ? timeAgo(v.visited_at) : ''}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Relative time helper ──────────────────────────────────────── */
function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── Tile Info (floating panel) ────────────────────────────────── */
function TileInfo({ selectedTile, onClear }) {
  if (!selectedTile) return null;
  const isObstacle = ['tree', 'rock', 'bush'].includes(selectedTile.tile?.t);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/70 backdrop-blur-sm p-3 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/40">Selected Tile</div>
      <div className="mt-1 text-sm font-black text-white">
        {selectedTile.x}, {selectedTile.y}
      </div>
      <div className="mt-0.5 text-[11px] capitalize text-white/50">{selectedTile.tile?.t || 'empty ground'}</div>
      {isObstacle ? (
        <button
          type="button"
          onClick={() => onClear?.(selectedTile)}
          className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.12] px-2.5 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/[0.18]"
        >
          Clear obstacle
        </button>
      ) : null}
    </div>
  );
}

/* ─── Expand Button Row ─────────────────────────────────────────── */
function ExpandButtons({ onExpand }) {
  return (
    <div className="flex gap-1.5">
      {[
        ['n', 'N'],
        ['e', 'E'],
        ['s', 'S'],
        ['w', 'W'],
      ].map(([dir, label]) => (
        <button
          key={dir}
          type="button"
          onClick={() => onExpand(dir)}
          className="rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm px-2 py-1 text-[10px] font-semibold text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ─── Leaderboard floating panel ────────────────────────────────── */
function LeaderboardPanel({ leaderboard, open, onClose }) {
  if (!open) return null;
  return (
    <div className="absolute top-12 right-2 z-40 w-56 rounded-xl border border-white/[0.08] bg-black/80 backdrop-blur-md p-3 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-[0.16em] text-white/40">Leaderboard</span>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xs">✕</button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {leaderboard.slice(0, 6).map((entry) => (
          <Link
            key={entry.user_id}
            to={`/pet/world/${entry.user_id}`}
            className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <span>#{entry.rank} {entry.username || 'Unknown'}</span>
            <span className="text-white/40 font-mono">{entry.population}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PetWorldPage - Full-screen game mode
   ═══════════════════════════════════════════════════════════════════ */

export default function PetWorldPage() {
  const [bundle, setBundle] = useState(null);
  const [trades, setTrades] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [activeEncounter, setActiveEncounter] = useState(null);
  const [encounterBusy, setEncounterBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedBiome, setSelectedBiome] = useState('grasslands');
  const [buildDrawerOpen, setBuildDrawerOpen] = useState(false);
  const [pendingBuildType, setPendingBuildType] = useState('');
  const [pendingBuildVariant, setPendingBuildVariant] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [showTrades, setShowTrades] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showVisitors, setShowVisitors] = useState(false);
  const [toast, setToast] = useState('');
  const [entered, setEntered] = useState(false);
  const gameRef = useRef(null);

  /* Fade-in on mount */
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Disable context menu on game area */
  useEffect(() => {
    const el = gameRef.current;
    if (!el) return;
    const handler = (e) => e.preventDefault();
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, []);

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => setToast(''), 2200);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [worldRes, tradeRes, leaderboardRes, encounterRes, visitorRes] = await Promise.all([
        getMyPetWorld(),
        getPetWorldTrades().catch(() => ({ trades: [] })),
        getPetWorldLeaderboard().catch(() => ({ leaderboard: [] })),
        getPetWorldEncounters().catch(() => ({ encounters: [] })),
        getPetWorldVisitors().catch(() => ({ visitors: [] })),
      ]);
      setBundle(worldRes);
      setTrades(tradeRes.trades || []);
      setLeaderboard(leaderboardRes.leaderboard || []);
      setEncounters(encounterRes.encounters || []);
      setVisitors(visitorRes.visitors || []);
    } catch (error) {
      showToast(error.message || 'Could not load Pet World');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
    return () => window.clearTimeout(showToast._timer);
  }, [loadAll, showToast]);

  /* Presence heartbeat: POST every 2 minutes */
  useEffect(() => {
    const userId = bundle?.world?.user_id;
    if (!userId) return;
    const tick = () => postPetWorldPresence(userId).catch(() => {});
    tick();
    const id = setInterval(tick, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [bundle?.world?.user_id]);

  const world = bundle?.world || null;
  const buildings = bundle?.buildings || [];
  const catalog = bundle?.building_catalog || [];
  const activeEvents = bundle?.active_events || [];

  const refreshAndSelectBuilding = useCallback((nextBundle, buildingId = null) => {
    setBundle(nextBundle);
    if (buildingId != null) {
      setSelectedBuilding((nextBundle.buildings || []).find((building) => building.id === buildingId) || null);
    } else {
      setSelectedBuilding(null);
    }
    setSelectedTile(null);
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const next = await createPetWorld(selectedBiome);
      setBundle(next);
      showToast('Village founded');
    } catch (error) {
      showToast(error.message || 'Could not create world');
    } finally {
      setCreating(false);
    }
  };

  const handlePlaceBuilding = async (x, y) => {
    if (!pendingBuildType) return;
    try {
      const next = await buildPetWorldBuilding({ type: pendingBuildType, x, y, variant: pendingBuildVariant });
      playBuildSound();
      setBundle(next);
      setPendingBuildType('');
      setPendingBuildVariant(null);
      setBuildDrawerOpen(false);
      setSelectedTile(null);
      showToast('Building placed');
    } catch (error) {
      showToast(error.message || 'Could not place building');
    }
  };

  const handleDemolish = async () => {
    if (!selectedBuilding) return;
    try {
      const next = await demolishPetWorldBuilding(selectedBuilding.id);
      setBundle(next);
      setSelectedBuilding(null);
      showToast('Building removed');
    } catch (error) {
      showToast(error.message || 'Could not demolish building');
    }
  };

  const handleUpgrade = async () => {
    if (!selectedBuilding) return;
    try {
      const next = await upgradePetWorldBuilding(selectedBuilding.id);
      playBuildSound();
      refreshAndSelectBuilding(next, selectedBuilding.id);
      showToast('Building upgraded');
    } catch (error) {
      showToast(error.message || 'Could not upgrade building');
    }
  };

  const handleSetWorkers = async (count) => {
    if (!selectedBuilding) return;
    try {
      const next = await assignPetWorldWorkers(selectedBuilding.id, count);
      refreshAndSelectBuilding(next, selectedBuilding.id);
      showToast('Workers updated');
    } catch (error) {
      showToast(error.message || 'Could not update workers');
    }
  };

  const handleExpand = async (direction) => {
    try {
      const next = await expandPetWorld(direction);
      playExpandSound();
      setBundle(next);
      showToast(`Expanded ${direction.toUpperCase()}`);
    } catch (error) {
      showToast(error.message || 'Could not expand world');
    }
  };

  const handleClearTile = async (tile) => {
    try {
      const next = await clearPetWorldTile(tile.x, tile.y);
      playClearSound();
      setBundle(next);
      setSelectedTile(null);
      showToast('Obstacle cleared');
    } catch (error) {
      showToast(error.message || 'Could not clear tile');
    }
  };

  const handleAcceptTrade = async (tradeId) => {
    try {
      const response = await acceptPetWorldTrade(tradeId);
      setTrades(response.trades || []);
      showToast('Trade accepted');
      loadAll();
    } catch (error) {
      showToast(error.message || 'Could not accept trade');
    }
  };

  const handleDeclineTrade = async (tradeId) => {
    try {
      const response = await declinePetWorldTrade(tradeId);
      setTrades(response.trades || []);
      showToast('Trade declined');
    } catch (error) {
      showToast(error.message || 'Could not decline trade');
    }
  };

  const handleHuntEncounter = useCallback(async (encounterId, timingBonus) => {
    setEncounterBusy(true);
    try {
      const res = await huntPetWorldEncounter(encounterId, timingBonus);
      // Update bundle immediately if server returned one
      if (res.bundle) setBundle(res.bundle);
      // Remove from encounters list
      setEncounters((prev) => prev.filter((e) => e.id !== encounterId));
      return { success: !!res.success, rewards: res.rewards || {} };
    } catch (error) {
      showToast(error.message || 'Could not hunt encounter');
      return { success: false, rewards: {} };
    } finally {
      setEncounterBusy(false);
    }
  }, [showToast]);

  const handleEncounterClose = useCallback((message) => {
    setActiveEncounter(null);
    if (message) showToast(message);
    loadAll();
  }, [showToast, loadAll]);

  const handleDismissEncounter = async (encounterId) => {
    setEncounterBusy(true);
    try {
      await dismissPetWorldEncounter(encounterId);
      setEncounters((prev) => prev.filter((e) => e.id !== encounterId));
      setActiveEncounter(null);
      showToast('Encounter dismissed');
    } catch (error) {
      showToast(error.message || 'Could not dismiss encounter');
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleSelectBuilding = useCallback((building) => {
    setSelectedBuilding(building);
    setSelectedTile(null);
    setPendingBuildType('');
  }, []);

  const handleSelectTile = useCallback((tile) => {
    setSelectedTile(tile);
    setSelectedBuilding(null);
  }, []);

  /* ── Loading ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950"
        style={{
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/12 border-t-emerald-400/70" />
      </div>
    );
  }

  /* ── Create-world modal (full-screen backdrop) ───────────────── */
  if (!world) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950"
        style={{
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}
      >
        <Link
          to="/pet"
          className="absolute top-3 left-3 z-50 flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </Link>
        <PetWorldCreateModal
          open
          selectedBiome={selectedBiome}
          onSelectBiome={setSelectedBiome}
          onCreate={handleCreate}
          creating={creating}
        />
      </div>
    );
  }

  /* ── Full-screen game mode ───────────────────────────────────── */
  return (
    <div
      ref={gameRef}
      className={`fixed inset-0 z-50 bg-slate-950 flex flex-col transition-opacity duration-300 ${entered ? 'opacity-100' : 'opacity-0'}`}
      style={{
        overscrollBehavior: 'none',
        userSelect: 'none',
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }}
    >
      <Toast message={toast} />

      {/* ── Seasonal Events Banner ─────────────────────────────────── */}
      <SeasonalBanner events={activeEvents} />

      {/* ── Top HUD bar ──────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex flex-col" style={{ top: activeEvents.length > 0 ? '28px' : '0' }}>
        <div className="flex items-center gap-2 px-2 py-1.5" style={{ paddingTop: activeEvents.length > 0 ? '2px' : 'max(6px, env(safe-area-inset-top))' }}>
          {/* Back button */}
          <Link
            to="/pet"
            className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm px-2 py-1.5 text-[11px] font-semibold text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </Link>

          {/* HUD resource bar */}
          <div className="flex-1 min-w-0">
            <PetWorldHUD world={world} />
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Encounters badge */}
            <button
              type="button"
              onClick={() => { if (encounters.length > 0) { setActiveEncounter(encounters[0]); playEncounterAlertSound(); } }}
              className="relative flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
              aria-label="Encounters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
              {encounters.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white px-0.5">
                  {encounters.length}
                </span>
              )}
            </button>

            {/* Visitors */}
            <button
              type="button"
              onClick={() => { setShowVisitors((v) => !v); setShowLeaderboard(false); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
              aria-label="Visitors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => { setShowLeaderboard((v) => !v); setShowVisitors(false); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
              aria-label="Leaderboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06A.75.75 0 116.11 5.173L5.05 4.11a.75.75 0 010-1.06zm9.9 0a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.061-1.06a.75.75 0 011.06 0zM3 8a7 7 0 1114 0A7 7 0 013 8zm8 0a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowTrades(true)}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
              aria-label="Trades"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M13.2 2.24a.75.75 0 00.04 1.06l2.1 1.95H6.75a.75.75 0 000 1.5h8.59l-2.1 1.95a.75.75 0 101.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 00-1.06.04zm-6.4 8a.75.75 0 00-1.06-.04l-3.5 3.25a.75.75 0 000 1.1l3.5 3.25a.75.75 0 101.02-1.1l-2.1-1.95h8.59a.75.75 0 000-1.5H4.66l2.1-1.95a.75.75 0 00.04-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Leaderboard floating panel */}
      <LeaderboardPanel leaderboard={leaderboard} open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

      {/* Visitor log floating panel */}
      <VisitorLogPanel visitors={visitors} open={showVisitors} onClose={() => setShowVisitors(false)} />

      {/* ── Canvas (full screen base layer) ──────────────────────── */}
      <div className="flex-1 relative min-h-0">
        <PetWorldCanvas
          world={world}
          buildings={buildings}
          selectedBuildingId={selectedBuilding?.id}
          selectedTile={selectedTile}
          pendingBuildType={pendingBuildType}
          onSelectBuilding={handleSelectBuilding}
          onSelectTile={handleSelectTile}
          onPlaceBuilding={handlePlaceBuilding}
        />

        {/* Floating building info panel (right side) */}
        {selectedBuilding && (
          <div className="absolute top-14 right-2 z-30 w-64 max-h-[calc(100%-8rem)] overflow-y-auto rounded-xl border border-white/[0.08] bg-black/75 backdrop-blur-md shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-wider text-white/40">Building</span>
                <button type="button" onClick={() => setSelectedBuilding(null)} className="text-white/40 hover:text-white text-xs">✕</button>
              </div>
              <PetWorldBuildingInfo
                building={selectedBuilding}
                world={world}
                onDemolish={handleDemolish}
                onUpgrade={handleUpgrade}
                onSetWorkers={handleSetWorkers}
              />
            </div>
          </div>
        )}

        {/* Floating tile info panel (right side) */}
        {!selectedBuilding && selectedTile && (
          <div className="absolute top-14 right-2 z-30 w-56">
            <TileInfo selectedTile={selectedTile} onClear={handleClearTile} />
          </div>
        )}

        {/* Expand buttons (bottom-left) */}
        <div className="absolute bottom-2 left-2 z-30">
          <ExpandButtons onExpand={handleExpand} />
        </div>
      </div>

      {/* ── Build drawer (bottom) ────────────────────────────────── */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out ${buildDrawerOpen ? 'translate-y-0' : 'translate-y-[calc(100%-40px)]'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drawer handle / collapsed bar */}
        <button
          type="button"
          onClick={() => setBuildDrawerOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-2 h-10 bg-black/70 backdrop-blur-md border-t border-white/[0.08] text-white/60 hover:text-white/90 transition-colors"
        >
          <span className={`text-xs transition-transform duration-200 ${buildDrawerOpen ? 'rotate-180' : ''}`}>▲</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider">{buildDrawerOpen ? 'Close' : 'Build'}</span>
        </button>

        {/* Drawer content */}
        <div className="bg-black/80 backdrop-blur-md max-h-[45vh] overflow-y-auto">
          <PetWorldBuildMenu
            open
            buildings={catalog}
            world={world}
            selectedType={pendingBuildType}
            selectedVariant={pendingBuildVariant}
            onSelect={(type, variant) => {
              setPendingBuildType(type);
              setPendingBuildVariant(variant || null);
              setSelectedBuilding(null);
              showToast('Tap a tile to place this building');
            }}
            onClose={() => setBuildDrawerOpen(false)}
          />
        </div>
      </div>

      {/* ── Trade modal ──────────────────────────────────────────── */}
      <PetWorldTradeModal
        open={showTrades}
        trades={trades}
        onClose={() => setShowTrades(false)}
        onAccept={handleAcceptTrade}
        onDecline={handleDeclineTrade}
      />

      {/* ── Encounter resolution modal ───────────────────────────── */}
      <EncounterModal
        encounter={activeEncounter}
        onHunt={handleHuntEncounter}
        onDismiss={handleDismissEncounter}
        onClose={handleEncounterClose}
        busy={encounterBusy}
        buildings={buildings}
      />
    </div>
  );
}

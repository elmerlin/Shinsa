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
} from '../utils/api';
import PetWorldHUD from '../components/petWorld/PetWorldHUD';
import PetWorldCanvas from '../components/petWorld/PetWorldCanvas';
import PetWorldBuildMenu from '../components/petWorld/PetWorldBuildMenu';
import PetWorldBuildingInfo from '../components/petWorld/PetWorldBuildingInfo';
import PetWorldCreateModal from '../components/petWorld/PetWorldCreateModal';
import PetWorldTradeModal from '../components/petWorld/PetWorldTradeModal';
import { getBuildingUi } from '../components/petWorld/petWorldBuildings';
import { playBuildSound, playClearSound, playExpandSound, playUpgradeSound, playErrorSound, playHuntStrikeSound, playHuntSuccessSound, playHuntEscapeSound, playEncounterAlertSound } from '../components/petWorld/petWorldAudio';
import usePetWorldPresence from '../hooks/usePetWorldPresence';

/* ─── Toast ─────────────────────────────────────────────────────── */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
      {message}
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
  const [pendingBuildType, setPendingBuildType] = useState('');
  const [pendingBuildVariant, setPendingBuildVariant] = useState(null);
  const [hudCollapsed, setHudCollapsed] = useState(true);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [showTrades, setShowTrades] = useState(false);
  const [activeSheet, setActiveSheet] = useState(null);
  const [villageTab, setVillageTab] = useState('overview');
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

  /* Real-time co-presence via WebSocket (owner joins own village room) */
  const handleVisitorJoined = useCallback((data) => {
    showToast(`${data.username || 'Someone'} is visiting your world`);
  }, [showToast]);

  const { visitors: wsVisitors } = usePetWorldPresence(
    bundle?.world?.user_id || null,
    { onVisitorJoined: handleVisitorJoined },
  );

  const world = bundle?.world || null;
  const buildings = bundle?.buildings || [];
  const catalog = bundle?.building_catalog || [];
  const activeEvents = bundle?.active_events || [];
  const inspectedObstacle = ['tree', 'rock', 'bush'].includes(selectedTile?.tile?.t);

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
      setActiveSheet(null);
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
    setPendingBuildVariant(null);
    setActiveSheet('inspect');
  }, []);

  const handleSelectTile = useCallback((tile) => {
    setSelectedTile(tile);
    setSelectedBuilding(null);
    // Only open inspect if not in placement mode
    if (!pendingBuildType) setActiveSheet('inspect');
  }, [pendingBuildType]);

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

  /* ── Derive the selected building's catalog entry for the placement tray ── */
  const pendingBuildDef = pendingBuildType
    ? catalog.find((b) => b.id === pendingBuildType)
    : null;

  /* ── Full-screen game mode ───────────────────────────────────── */
  return (
    <div
      ref={gameRef}
      className={`fixed inset-0 z-50 overflow-hidden bg-[#050b12] text-white transition-opacity duration-300 ${entered ? 'opacity-100' : 'opacity-0'}`}
      style={{
        overscrollBehavior: 'none',
        userSelect: 'none',
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }}
    >
      {/* Atmospheric radial gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,80,110,0.24),transparent_34%),linear-gradient(180deg,rgba(7,18,26,0.18),rgba(3,6,10,0.92))]" />
      <Toast message={toast} />

      {/* Canvas */}
      <div className="absolute inset-0">
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
      </div>

      {/* Reduced gradient overlays */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-[#03070d]/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-[#03070d]/80 to-transparent" />

      {/* ═══ TOP HUD STRIP ═══ */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center gap-2 px-2.5 py-1.5"
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top))', maxHeight: 52 }}
      >
        {/* Back button */}
        <Link
          to="/pet"
          className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-black/40 text-white/65 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
          aria-label="Back to pet"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </Link>

        {/* Resource pills row */}
        <div className="min-w-0 flex-1">
          <PetWorldHUD world={world} activeEvents={activeEvents} collapsed={hudCollapsed} onToggle={() => setHudCollapsed(c => !c)} />
        </div>

        {/* Encounter badge */}
        {encounters.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setActiveSheet(null);
              setActiveEncounter(encounters[0]);
              playEncounterAlertSound();
            }}
            className="pointer-events-auto flex h-9 items-center gap-1 rounded-full border border-amber-300/12 bg-black/40 px-2 text-[10px] font-semibold text-amber-200 backdrop-blur-md transition-colors hover:bg-amber-400/15"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
            {encounters.length}
          </button>
        )}

        {/* Menu dots -- opens village tools */}
        <button
          type="button"
          onClick={() => {
            setPendingBuildType('');
            setPendingBuildVariant(null);
            setVillageTab('overview');
            setActiveSheet((s) => (s === 'village' ? null : 'village'));
          }}
          className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-black/40 text-white/60 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
          aria-label="Village tools"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 14a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
          </svg>
        </button>
      </div>

      {/* ═══ BUILD FAB (bottom-right) ═══ */}
      {activeSheet !== 'build' && activeSheet !== 'placement' && (
        <div className="absolute bottom-5 right-3 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <button
            type="button"
            onClick={() => {
              if (pendingBuildType) {
                // Cancel placement
                setPendingBuildType('');
                setPendingBuildVariant(null);
                setActiveSheet(null);
                return;
              }
              setSelectedBuilding(null);
              setSelectedTile(null);
              setActiveSheet('build');
            }}
            className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border shadow-[0_6px_20px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all duration-200 ease-out active:scale-95 ${
              pendingBuildType
                ? 'border-rose-400/25 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                : 'border-emerald-400/20 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 animate-[pulse_3s_ease-in-out_infinite]'
            }`}
            aria-label={pendingBuildType ? 'Cancel build' : 'Build'}
          >
            {pendingBuildType ? (
              /* X icon for cancel */
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            ) : (
              /* Wrench icon for build */
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.101 3.046 3.046 0 01-1.61-1.61.454.454 0 01.1-.492l2.693-2.693c.242-.242.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01zM5 16a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* ═══ PLACEMENT TRAY (when building selected from catalog) ═══ */}
      {pendingBuildType && activeSheet !== 'build' && (
        <div
          className="absolute inset-x-0 bottom-0 z-50 animate-[slideUp_0.2s_ease-out] transition-all duration-200 ease-out"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-white/8 bg-black/85 px-3 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl mx-3">
            {pendingBuildDef && (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04]" style={{ backgroundColor: getBuildingUi(pendingBuildDef.id).accent + '22' }}>
                  <span className="text-xs">{getBuildingUi(pendingBuildDef.id).icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-bold text-white">{pendingBuildDef.name}</div>
                  <div className="text-[10px] text-white/40">{pendingBuildDef.comboCost}c -- Tap to place</div>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setActiveSheet('build');
              }}
              className="pointer-events-auto shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingBuildType('');
                setPendingBuildVariant(null);
                setActiveSheet(null);
              }}
              className="pointer-events-auto shrink-0 rounded-lg border border-rose-400/15 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-rose-200/70 transition-colors hover:bg-rose-500/20 hover:text-rose-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ═══ BUILD CATALOG SHEET ═══ */}
      {activeSheet === 'build' && (
        <div
          className="absolute inset-x-0 bottom-0 z-50 px-3 pb-3 transition-all duration-200 ease-out"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/8 bg-black/85 shadow-[0_-12px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-8 rounded-full bg-white/15" />
            </div>
            {/* Sheet header */}
            <div className="flex items-center justify-between px-3.5 pb-2">
              <h2 className="text-[13px] font-black text-white">Build</h2>
              <button
                type="button"
                onClick={() => {
                  setActiveSheet(null);
                  setPendingBuildType('');
                  setPendingBuildVariant(null);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/8 text-[11px] text-white/50 transition-colors hover:border-white/15 hover:text-white"
                aria-label="Close build menu"
              >
                &times;
              </button>
            </div>
            <div className="max-h-[28vh] overflow-y-auto px-3 pb-3" style={{ overscrollBehavior: 'contain' }}>
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
                  setSelectedTile(null);
                  setHudCollapsed(true);
                  // Auto-switch to placement mode
                  setActiveSheet(null);
                  showToast('Tap a tile to place this building');
                }}
                onClose={() => {
                  setPendingBuildType('');
                  setPendingBuildVariant(null);
                  setActiveSheet(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ INSPECT SHEET ═══ */}
      {activeSheet === 'inspect' && (
        <div
          className="absolute inset-x-0 bottom-0 z-50 px-3 pb-3 transition-all duration-200 ease-out"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/8 bg-black/85 shadow-[0_-12px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-8 rounded-full bg-white/15" />
            </div>
            {/* Close */}
            <div className="flex items-center justify-between px-3.5 pb-1">
              <span className="text-[9px] uppercase tracking-[0.16em] text-white/30">
                {selectedBuilding ? 'Building' : 'Tile'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedBuilding(null);
                  setSelectedTile(null);
                  setActiveSheet(null);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/8 text-[11px] text-white/50 transition-colors hover:border-white/15 hover:text-white"
                aria-label="Close inspect"
              >
                &times;
              </button>
            </div>
            <div className="max-h-[28vh] overflow-y-auto px-3.5 pb-3" style={{ overscrollBehavior: 'contain' }}>
              {selectedBuilding ? (
                <PetWorldBuildingInfo
                  building={selectedBuilding}
                  world={world}
                  onClose={() => {
                    setSelectedBuilding(null);
                    setActiveSheet(null);
                  }}
                  onDemolish={handleDemolish}
                  onUpgrade={handleUpgrade}
                  onSetWorkers={handleSetWorkers}
                />
              ) : selectedTile ? (
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-black text-white">{selectedTile.x}, {selectedTile.y}</div>
                    <span className="text-[11px] text-white/45 capitalize">{selectedTile.tile?.t || 'empty ground'}</span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-white/50 leading-relaxed">
                    {inspectedObstacle
                      ? 'This obstacle blocks construction. Clear it to open the area.'
                      : 'Open ground. Use the Build button to place something here.'}
                  </div>
                  {inspectedObstacle && (
                    <button
                      type="button"
                      onClick={() => handleClearTile(selectedTile)}
                      className="mt-2 rounded-lg border border-amber-300/15 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition-colors hover:bg-amber-400/18"
                    >
                      Clear obstacle
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center text-[11px] text-white/35">Select a building or tile to inspect it.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ VILLAGE TOOLS MODAL (full-screen overlay) ═══ */}
      {activeSheet === 'village' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center transition-all duration-200 ease-out">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setActiveSheet(null)}
          />
          {/* Centered card */}
          <div className="relative mx-4 w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl border border-white/8 bg-[#0a0f16]/95 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h2 className="text-sm font-black text-white">Village Tools</h2>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/8 text-[11px] text-white/50 transition-colors hover:border-white/15 hover:text-white"
                aria-label="Close village tools"
              >
                &times;
              </button>
            </div>

            {/* Tab pills */}
            <div className="flex gap-1 px-4 pt-3">
              {[
                ['overview', 'Overview'],
                ['visitors', `Visitors${wsVisitors.length ? ` (${wsVisitors.length})` : ''}`],
                ['leaderboard', 'Leaderboard'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVillageTab(id)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    villageTab === id
                      ? 'border-cyan-300/15 bg-cyan-400/12 text-cyan-50'
                      : 'border-white/8 bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/70'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="overflow-y-auto px-4 py-3" style={{ maxHeight: 'calc(80vh - 7rem)', overscrollBehavior: 'contain' }}>
              {villageTab === 'overview' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
                      <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Village Mood</div>
                      <div className="mt-0.5 text-lg font-black text-white">{Math.round(world.happiness || 0)}</div>
                      <div className="mt-0.5 text-[10px] text-white/35">Keep high for breeding.</div>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
                      <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Online Now</div>
                      <div className="mt-0.5 text-lg font-black text-white">{wsVisitors.length}</div>
                      <div className="mt-0.5 text-[10px] text-white/35">Friends visiting now.</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Expand Village</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <ExpandButtons onExpand={handleExpand} />
                    </div>
                    <div className="mt-1.5 text-[10px] text-white/35">Grow toward resources to shape your village.</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setActiveSheet(null); setShowTrades(true); }}
                      className="rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      Open Trades
                    </button>
                    {encounters.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSheet(null);
                          setActiveEncounter(encounters[0]);
                          playEncounterAlertSound();
                        }}
                        className="rounded-lg border border-amber-300/12 bg-amber-400/8 px-3 py-2 text-[11px] font-semibold text-amber-100 transition-colors hover:bg-amber-400/15"
                      >
                        Hunt Encounter
                      </button>
                    )}
                  </div>
                </div>
              )}

              {villageTab === 'visitors' && (
                <div className="space-y-2">
                  {wsVisitors.length > 0 && (
                    <div className="rounded-xl border border-emerald-300/10 bg-emerald-400/[0.04] p-2.5">
                      <div className="text-[9px] uppercase tracking-[0.14em] text-emerald-200/50">Online now</div>
                      <div className="mt-1.5 space-y-1">
                        {wsVisitors.map((visitor) => (
                          <Link
                            key={visitor.user_id}
                            to={`/pet/world/${visitor.user_id}`}
                            className="flex items-center justify-between rounded-lg border border-emerald-300/8 bg-black/20 px-2.5 py-1.5 text-[11px] text-emerald-100/80"
                          >
                            <span>{visitor.username || 'Unknown visitor'}</span>
                            <span className="text-[9px] uppercase text-emerald-200/40">Visiting</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Recent visitors</div>
                    <div className="mt-1.5 space-y-1">
                      {visitors.length > 0 ? visitors.map((visitor, index) => (
                        <Link
                          key={visitor.user_id || index}
                          to={`/pet/world/${visitor.user_id}`}
                          className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-[11px] text-white/65"
                        >
                          <span className="truncate">{visitor.username || 'Unknown visitor'}</span>
                          <span className="ml-2 shrink-0 text-[9px] text-white/30">
                            {visitor.visited_at ? timeAgo(visitor.visited_at) : ''}
                          </span>
                        </Link>
                      )) : (
                        <div className="rounded-lg border border-dashed border-white/8 px-3 py-3 text-[11px] text-white/35">
                          No visitors yet. Share your village once it grows.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {villageTab === 'leaderboard' && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Top villages</div>
                  <div className="mt-1.5 space-y-1">
                    {leaderboard.slice(0, 8).map((entry) => (
                      <Link
                        key={entry.user_id}
                        to={`/pet/world/${entry.user_id}`}
                        className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-[11px] text-white/65"
                      >
                        <span className="truncate">#{entry.rank} {entry.username || 'Unknown'}</span>
                        <span className="ml-2 shrink-0 font-mono text-cyan-100/70">{entry.population}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

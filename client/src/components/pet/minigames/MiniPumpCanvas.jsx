/**
 * MiniPumpCanvas v2 — Target-line based rendering
 *
 * Blob y is computed from game state timing, not stored position.
 * Target line is the visual judgement point.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import {
  drawPet, drawBlobCreature, drawPad, drawLaser, drawTargetLine,
  drawExplosion, drawMissFizz, drawBonkFX, drawJudgementFX, drawHUD,
} from './miniPumpSprites';
import { blobY, TARGET_LINE_Y } from './useMiniPumpGame';

// Layout fractions
const PET_Y = 0.78;
const PAD_Y = 0.88;
const PAD_H_FRAC = 0.08;
const PLAYFIELD_TOP = 0.06;
const BLOB_WIDTH_FRAC = 0.25;   // blob width as fraction of canvas width
const BLOB_HEIGHT_FRAC = 0.045; // blob height as fraction of canvas height
const BLOB_GAP_FRAC = 0.012;    // gap between stacked blobs

const BG_GRADIENT = [
  [0, '#06080f'], [0.4, '#0a0e1a'], [0.7, '#0c1020'], [1, '#080c16'],
];

function drawBackground(ctx, w, h, pulse) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  BG_GRADIENT.forEach(([stop, color]) => grad.addColorStop(stop, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Grid
  ctx.strokeStyle = `rgba(100,180,255,${0.02 + pulse * 0.01})`;
  ctx.lineWidth = 0.5;
  for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  // Center glow
  const colGrad = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.4);
  colGrad.addColorStop(0, `rgba(40,80,160,${0.04 + pulse * 0.02})`);
  colGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = colGrad;
  ctx.fillRect(0, 0, w, h);
}

function drawCountdown(ctx, w, h, value) {
  ctx.save();
  const text = value <= 0 ? 'GO!' : String(value);
  ctx.font = `900 ${value <= 0 ? 64 : 80}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = value <= 0 ? '#44ff88' : '#4488ff'; ctx.shadowBlur = 20;
  ctx.fillStyle = value <= 0 ? '#44ff88' : '#ffffff';
  ctx.fillText(text, w / 2, h * 0.4);
  ctx.restore();
}

function drawStartScreen(ctx, w, h) {
  ctx.save();
  ctx.font = '900 32px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#4488ff'; ctx.shadowBlur = 15;
  ctx.fillText('MINI-PUMP', w / 2, h * 0.20);
  ctx.shadowBlur = 0;

  // Instruction
  ctx.font = '600 13px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Shoot when the blob hits the line!', w / 2, h * 0.27);

  // Controls
  const colors = [
    { label: 'A', color: '#ff4455', name: 'RED' },
    { label: 'S', color: '#ffcc22', name: 'YEL' },
    { label: 'D', color: '#4488ff', name: 'BLU' },
  ];
  const btnW = 50, btnH = 36, gap = 12;
  const totalW = colors.length * btnW + (colors.length - 1) * gap;
  const startX = (w - totalW) / 2, btnY = h * 0.34;
  colors.forEach((c, i) => {
    const x = startX + i * (btnW + gap);
    ctx.beginPath(); ctx.roundRect(x, btnY, btnW, btnH, 6);
    ctx.fillStyle = c.color; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = c.color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = 'bold 14px system-ui'; ctx.fillStyle = c.color;
    ctx.fillText(c.label, x + btnW / 2, btnY + btnH / 2 + 1);
    ctx.font = '600 9px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(c.name, x + btnW / 2, btnY + btnH + 14);
  });

  // Rules
  ctx.font = '500 11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('Match the color \u2022 Wrong color = miss', w / 2, h * 0.52);
  ctx.fillText('Missed blobs bonk your pet (-1s)', w / 2, h * 0.56);

  const pulse = 0.6 + Math.sin(Date.now() / 400) * 0.4;
  ctx.font = '700 16px system-ui'; ctx.fillStyle = `rgba(100,200,255,${pulse})`;
  ctx.fillText('TAP TO START', w / 2, h * 0.65);
  ctx.restore();
}

function drawResults(ctx, w, h, state) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,8,15,0.88)'; ctx.fillRect(0, 0, w, h);
  ctx.font = '900 28px system-ui, -apple-system, sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff'; ctx.shadowColor = state.score >= 10 ? '#44ff88' : '#ff8866'; ctx.shadowBlur = 12;
  ctx.fillText(state.score >= 10 ? 'GREAT RUN!' : 'ROUND OVER', w / 2, h * 0.15);
  ctx.shadowBlur = 0;
  ctx.font = '900 56px system-ui'; ctx.fillStyle = '#4488ff';
  ctx.fillText(String(state.score), w / 2, h * 0.30);
  ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('SCORE', w / 2, h * 0.34);
  const stats = [
    { label: 'HITS', value: state.hits, color: '#44ff88' },
    { label: 'MISSES', value: state.misses, color: '#ff6666' },
    { label: 'BONKS', value: state.headBonks, color: '#ff8844' },
    { label: 'BEST STREAK', value: state.bestStreak, color: '#ffcc22' },
    { label: 'FASTEST', value: `${state.fastestCadenceMs}ms`, color: '#66bbff' },
  ];
  stats.forEach((s, i) => {
    const y = h * 0.40 + i * 28;
    ctx.font = '600 11px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(s.label, w * 0.2, y);
    ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'right'; ctx.fillStyle = s.color;
    ctx.fillText(String(s.value), w * 0.8, y);
  });
  const pulse = 0.7 + Math.sin(Date.now() / 350) * 0.3;
  ctx.font = '700 16px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(100,200,255,${pulse})`;
  ctx.fillText('TAP TO REPLAY', w / 2, h * 0.75);
  ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText('or press any key', w / 2, h * 0.79);
  ctx.restore();
}

// ─── Convert normalized blob-y (0=top, 1=target line) to pixel-y ──
function normToPixelY(normY, h) {
  const top = PLAYFIELD_TOP * h;
  const lineY = TARGET_LINE_Y * h;
  return top + normY * (lineY - top);
}

export default function MiniPumpCanvas({ game, character, onStart, onShoot, reducedMotion }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const dprRef = useRef(1);
  const sizeRef = useRef({ w: 0, h: 0 });

  const resize = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    dprRef.current = dpr;
    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    sizeRef.current = { w, h };
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  const render = useCallback((state) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = sizeRef.current; if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);

    const cadencePulse = state.mode === 'playing'
      ? Math.sin((state.cadenceClock / state.cadenceMs) * Math.PI) * 0.5 : 0;
    const targetLinePx = TARGET_LINE_Y * h;
    const petYPx = h * PET_Y;
    const petPS = Math.max(2, Math.round(h / 180));
    const blobW = w * BLOB_WIDTH_FRAC;
    const blobH = h * BLOB_HEIGHT_FRAC;

    // Background
    drawBackground(ctx, w, h, reducedMotion ? 0 : cadencePulse);

    // ─── Mode-specific ───
    if (state.mode === 'idle') {
      drawPet(ctx, w / 2, petYPx - 10, petPS, character, 'idle', 'normal');
      drawStartScreen(ctx, w, h);
      return;
    }
    if (state.mode === 'countdown') {
      drawPet(ctx, w / 2, petYPx - 10, petPS, character, 'ready', 'focused');
      drawCountdown(ctx, w, h, state.countdownValue);
      return;
    }

    // ─── Playing + round_end ───

    // Target line
    if (state.mode === 'playing') {
      const flashColor = state.lineFlash
        ? state.lineFlash.progress < 0.5 ? state.lineFlash.color : null
        : null;
      drawTargetLine(ctx, w / 2, targetLinePx, w * 0.85, reducedMotion ? 0 : cadencePulse, flashColor);
    }

    // Blob stack
    state.stack.forEach((blob, i) => {
      const normY = blobY(blob, state.gameClockMs);
      if (normY > 1.3) return; // past screen
      const pixY = normToPixelY(normY, h);
      const isBottom = i === 0;
      // "nearLine" intensity: 0 far, 1 at line
      const nearLine = isBottom ? Math.max(0, 1 - Math.abs(1 - normY) * 4) : 0;
      drawBlobCreature(ctx, w / 2, pixY, blobW, blobH, blob.color, isBottom, nearLine);
    });

    // Laser
    if (state.activeLaser) {
      drawLaser(ctx, w / 2, targetLinePx, h * PLAYFIELD_TOP, state.activeLaser.color, state.activeLaser.progress);
    }

    // Pet
    drawPet(ctx, w / 2, petYPx - 10, petPS, character, state.petPose, state.petExpression);

    // Pads
    if (state.mode === 'playing') {
      const padY = h * PAD_Y, padH = h * PAD_H_FRAC;
      const padW = (w - 48) / 3, padGap = 8;
      const totalPadW = padW * 3 + padGap * 2, padStartX = (w - totalPadW) / 2;
      ['red', 'yellow', 'blue'].forEach((color, i) => {
        const px = padStartX + i * (padW + padGap);
        const isActive = state.petPose === `step_${color}` || state.petPose === 'laser_fire';
        drawPad(ctx, px, padY, padW, padH, color, isActive && state.activeLaser?.color === color);
      });
    }

    // Explosions
    state.explosions.forEach(e => {
      const ey = normToPixelY(e.y, h);
      drawExplosion(ctx, w / 2, ey, e.color, e.progress);
    });

    // Judgement FX
    state.judgementFX.forEach(e => {
      drawJudgementFX(ctx, w / 2, targetLinePx - 10, e.text, e.color, e.progress);
    });

    // Miss FX
    state.missFX.forEach(() => {
      // handled by judgementFX now
    });

    // Bonk FX
    state.bonkFX.forEach(e => {
      drawBonkFX(ctx, w / 2, petYPx - 20, e.progress);
    });

    // HUD
    if (state.mode === 'playing') {
      drawHUD(ctx, w, state.timeRemainingMs, state.score, state.streak, state.cadenceMs);
    }

    // Results overlay
    if (state.mode === 'round_end') {
      drawResults(ctx, w, h, state);
    }
  }, [character, reducedMotion]);

  useEffect(() => {
    game.setOnRender(render);
    render(game.getState());
  }, [game, render]);

  // Touch input
  const handleTouch = useCallback((e) => {
    const state = game.getState();
    if (state.mode === 'idle') { onStart(); return; }
    if (state.mode === 'round_end') { game.reset(); setTimeout(onStart, 100); return; }
    if (state.mode !== 'playing') return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX = (clientX - rect.left) / rect.width;
    onShoot(relX < 0.33 ? 'red' : relX < 0.67 ? 'yellow' : 'blue');
  }, [game, onStart, onShoot]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e) => {
      const state = game.getState();
      if (state.mode === 'idle') { onStart(); return; }
      if (state.mode === 'round_end') { game.reset(); setTimeout(onStart, 100); return; }
      if (state.mode !== 'playing') return;
      const key = e.key.toLowerCase();
      if (key === 'a') onShoot('red');
      else if (key === 's') onShoot('yellow');
      else if (key === 'd') onShoot('blue');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [game, onStart, onShoot]);

  return (
    <div ref={containerRef} className="w-full h-full relative select-none touch-none" style={{ minHeight: 400 }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
        onTouchStart={handleTouch} onClick={handleTouch} style={{ touchAction: 'none' }} />
    </div>
  );
}

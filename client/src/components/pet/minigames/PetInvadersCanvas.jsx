/**
 * PetInvadersCanvas — Canvas renderer for Pet Invaders
 * Scrolling starfield, enemies, bosses, projectiles, power-ups, player pet
 */

import React, { useRef, useEffect, useCallback } from 'react';
import {
  drawStarfield, drawPlayerPet, drawEnemy, drawBoss, drawProjectile,
  drawPowerUp, drawExplosion, drawDamageFlash, drawHUD, drawWaveBanner,
  drawBossWarningBanner,
} from './petInvadersSprites';

// Layout
const PLAYER_Y = 0.88;

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
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#44ff88'; ctx.shadowBlur = 15;
  ctx.fillText('PET INVADERS', w / 2, h * 0.18);
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.font = '600 12px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Your pet auto-fires \u2014 you dodge!', w / 2, h * 0.24);

  // Controls
  const controls = [
    { label: '\u2190 / A', desc: 'Move left' },
    { label: '\u2192 / D', desc: 'Move right' },
  ];
  const ctrlY = h * 0.32;
  controls.forEach((c, i) => {
    const y = ctrlY + i * 32;
    ctx.font = 'bold 13px system-ui';
    ctx.fillStyle = '#66bbff';
    ctx.fillText(c.label, w / 2 - 40, y);
    ctx.font = '600 11px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText(c.desc, w / 2 + 10, y);
    ctx.textAlign = 'center';
  });

  // Enemy preview
  ctx.font = '600 10px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('Survive waves of invaders \u2022 Boss every 5th wave', w / 2, h * 0.48);
  ctx.fillText('Collect power-ups: Spread \u2022 Rate \u2022 Damage', w / 2, h * 0.52);

  ctx.font = '700 15px system-ui'; ctx.fillStyle = 'rgba(100,255,200,0.75)';
  ctx.fillText('Use the button below to start', w / 2, h * 0.64);
  ctx.restore();
}

function drawResults(ctx, w, h, state) {
  ctx.save();
  ctx.fillStyle = 'rgba(2,4,8,0.90)'; ctx.fillRect(0, 0, w, h);
  ctx.font = '900 28px system-ui, -apple-system, sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff'; ctx.shadowColor = state.score >= 200 ? '#44ff88' : '#ff8866'; ctx.shadowBlur = 12;
  ctx.fillText(state.score >= 200 ? 'GREAT RUN!' : 'GAME OVER', w / 2, h * 0.12);
  ctx.shadowBlur = 0;

  // Score
  ctx.font = '900 48px system-ui'; ctx.fillStyle = '#44ff88';
  ctx.fillText(String(state.score), w / 2, h * 0.26);
  ctx.font = '600 10px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('SCORE', w / 2, h * 0.30);

  // Stats
  const stats = [
    { label: 'WAVE', value: state.bestWave || state.wave, color: '#66bbff' },
    { label: 'KILLS', value: state.kills, color: '#44ff88' },
    { label: 'BOSSES', value: state.bossesDefeated, color: '#ffcc22' },
  ];
  stats.forEach((s, i) => {
    const y = h * 0.38 + i * 30;
    ctx.font = '600 11px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(s.label, w * 0.25, y);
    ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'right'; ctx.fillStyle = s.color;
    ctx.fillText(String(s.value), w * 0.75, y);
  });

  ctx.font = '700 15px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(100,255,200,0.75)';
  ctx.fillText('Use the button below to play again', w / 2, h * 0.62);
  ctx.font = '600 11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText('Leaderboard sits under the game', w / 2, h * 0.66);
  ctx.restore();
}

export default function PetInvadersCanvas({ game, character, onStart, reducedMotion }) {
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

    // Background
    drawStarfield(ctx, w, h, reducedMotion ? 0 : state.scrollOffset);

    // ─── Mode-specific ───
    if (state.mode === 'idle') {
      drawPlayerPet(ctx, w / 2, h * PLAYER_Y, Math.max(32, h / 12.5), character, false);
      drawStartScreen(ctx, w, h);
      return;
    }
    if (state.mode === 'countdown') {
      drawPlayerPet(ctx, w / 2, h * PLAYER_Y, Math.max(32, h / 12.5), character, false);
      drawCountdown(ctx, w, h, state.countdownValue);
      return;
    }

    // ─── Playing / wave_clear / boss_warning / game_over ───
    const petSize = Math.max(32, h / 12.5);

    // Enemies
    state.enemies.forEach(enemy => {
      const ex = enemy.x * w, ey = enemy.y * h;
      const eSize = w * 0.06 * (1 + Math.min(enemy.maxHp - 1, 3) * 0.12);
      drawEnemy(ctx, ex, ey, eSize, enemy.type, enemy.animFrame, enemy.hp, enemy.maxHp);
    });

    // Bosses
    state.bosses.forEach(boss => {
      const bx = boss.x * w, by = boss.y * h;
      const bSize = w * 0.15;
      drawBoss(ctx, bx, by, bSize, boss.type, boss.animFrame, boss.hp, boss.maxHp);
    });

    // Power-ups
    state.powerUps.forEach(pu => {
      drawPowerUp(ctx, pu.x * w, pu.y * h, pu.type, pu.animFrame || 0);
    });

    // Projectiles
    state.projectiles.forEach(p => {
      drawProjectile(ctx, p.x * w, p.y * h, p.type, p.power || 0);
    });

    // Player pet
    const playerX = state.playerX * w;
    const playerYPx = h * PLAYER_Y;
    const invulnBlink = state.playerInvuln > 0 && Math.sin(state.animFrame * 0.5) > 0;
    if (!invulnBlink) {
      drawPlayerPet(ctx, playerX, playerYPx, petSize, character, state.playerFiring);
    }

    // Explosions
    state.explosions.forEach(e => {
      drawExplosion(ctx, e.x * w, e.y * h, e.progress, e.size, e.color);
    });

    // Damage flash
    if (state.damageFlash > 0 && state.damageFlash < 1) {
      drawDamageFlash(ctx, w, h, state.damageFlash);
    }

    // HUD
    if (state.mode === 'playing' || state.mode === 'wave_clear' || state.mode === 'boss_warning') {
      drawHUD(ctx, w, state.score, state.playerLives, state.wave, state.activeBuffs);
    }

    // Wave banner
    if (state.waveBanner) {
      drawWaveBanner(ctx, w, h, state.waveBanner.text, state.waveBanner.progress);
    }

    // Boss warning
    if (state.bossWarning) {
      drawBossWarningBanner(ctx, w, h, state.bossWarning.type, state.bossWarning.progress);
    }

    // Results overlay
    if (state.mode === 'game_over') {
      drawResults(ctx, w, h, state);
    }
  }, [character, reducedMotion]);

  useEffect(() => {
    game.setOnRender(render);
    render(game.getState());
  }, [game, render]);

  // Touch input — tap left = move left, tap right = move right, tap same = stop
  const handleTouchStart = useCallback((e) => {
    const state = game.getState();
    if (state.mode !== 'playing' && state.mode !== 'wave_clear' && state.mode !== 'boss_warning') return;

    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const relX = (touch.clientX - rect.left) / rect.width;
    const dir = relX < 0.5 ? -1 : 1;
    game.setTouchDir(dir); // toggle: same dir = stop
  }, [game, onStart]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      const state = game.getState();
      if (state.mode !== 'playing' && state.mode !== 'wave_clear' && state.mode !== 'boss_warning') return;
      const key = e.key;
      if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key)) {
        e.preventDefault();
        game.setKeyDown(key, true);
      }
    };
    const handleKeyUp = (e) => {
      const key = e.key;
      if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key)) {
        game.setKeyDown(key, false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [game, onStart]);

  return (
    <div ref={containerRef} className="w-full h-full relative select-none touch-none" style={{ minHeight: 400 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onTouchStart={handleTouchStart}
        onClick={handleTouchStart}
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}

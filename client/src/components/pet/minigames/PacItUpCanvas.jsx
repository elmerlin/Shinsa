import React, { useRef, useEffect, useCallback } from 'react';
import { COLS, ROWS } from './pacItUpMazes';
import {
  drawBackground, drawWalls, drawDecor, drawGhostHouseDoor,
  drawStomp, drawPowerStomp, drawMine, drawShieldPickup,
  drawGhost, drawPlayerPet, drawScorePopup,
  drawDamageFlash, drawCameraShake,
  drawHUD, drawCountdown, drawBanner, drawResultsOverlay,
  GHOST_NAMES,
} from './pacItUpSprites';

export default function PacItUpCanvas({ game, character, reducedMotion }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const dprRef = useRef(1);
  const sizeRef = useRef({ w: 0, h: 0 });
  const renderRef = useRef(null);
  const touchStartRef = useRef(null);

  // ── Resize ─────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    dprRef.current = dpr;
    sizeRef.current = { w, h };
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderRef.current?.(game.getState());
  }, [game]);

  // ── Render ─────────────────────────────────────────
  const render = useCallback((state) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;
    ctx.clearRect(0, 0, w, h);

    // Idle screen
    if (state.mode === 'idle') {
      drawBackground(ctx, w, h, 'dojo');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Pac It Up!', w / 2, h * 0.35);
      ctx.font = '11px monospace';
      ctx.fillStyle = '#999999';
      ctx.fillText('Arrow keys / WASD to move', w / 2, h * 0.48);
      ctx.fillText('Collect stomps, avoid mines & ghosts', w / 2, h * 0.55);
      ctx.fillText('Power stomps let you eat ghosts!', w / 2, h * 0.62);
      return;
    }

    // Countdown
    if (state.mode === 'countdown') {
      const theme = state.maze?.theme || 'dojo';
      drawBackground(ctx, w, h, theme);
      if (state.grid) {
        const ts = Math.min(w / COLS, h / ROWS);
        const ox = (w - COLS * ts) / 2;
        const oy = (h - ROWS * ts) / 2;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.globalAlpha = 0.4;
        drawWalls(ctx, state.grid, ts, theme, 0);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      drawCountdown(ctx, w, h, state.countdownValue <= 0 ? 'GO!' : String(state.countdownValue));
      return;
    }

    // ── Playing / life_lost / stage_clear / game_over ──
    const theme = state.maze?.theme || 'dojo';
    const ts = Math.min(w / COLS, h / ROWS);
    const ox = (w - COLS * ts) / 2;
    const oy = (h - ROWS * ts) / 2;

    drawBackground(ctx, w, h, theme);

    ctx.save();
    ctx.translate(ox, oy);

    // Camera shake
    const shake = drawCameraShake(ctx, state.cameraShake, reducedMotion);

    // Maze walls
    if (state.grid) {
      drawWalls(ctx, state.grid, ts, theme, state.animFrame);
    }

    // Decor
    drawDecor(ctx, state.maze?.decor, ts, state.animFrame);

    // Ghost house door
    if (state.maze?.ghostHouseDoor) {
      drawGhostHouseDoor(ctx, state.maze.ghostHouseDoor.x, state.maze.ghostHouseDoor.y, ts, state.animFrame);
    }

    // Collectibles
    if (state.grid) {
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const tile = state.grid[y][x];
          const cx = x * ts + ts / 2;
          const cy = y * ts + ts / 2;
          if (tile === 'stomp') drawStomp(ctx, cx, cy, ts, state.animFrame);
          else if (tile === 'power') drawPowerStomp(ctx, cx, cy, ts, state.animFrame);
          else if (tile === 'mine') drawMine(ctx, cx, cy, ts, state.animFrame);
        }
      }
    }

    // Shield pickup
    if (state.shieldPickup) {
      const sp = state.shieldPickup;
      drawShieldPickup(ctx, sp.x * ts + ts / 2, sp.y * ts + ts / 2, ts, state.animFrame);
    }

    // Ghosts
    state.ghosts.forEach((g, i) => {
      if (g.releaseDelay > 0 && g.state !== 'returning') return;
      drawGhost(
        ctx, g.x * ts + ts / 2, g.y * ts + ts / 2, ts,
        GHOST_NAMES[i] || 'tempo', g.state, g.dir, state.animFrame, reducedMotion,
      );
    });

    // Player
    if (state.mode !== 'game_over') {
      drawPlayerPet(
        ctx, state.px * ts + ts / 2, state.py * ts + ts / 2, ts,
        state.character, state.dir, state.animFrame,
        state.respawnInvulnMs > 0, state.shieldCharges > 0, reducedMotion,
      );
    }

    // FX
    state.fx.forEach(f => {
      drawScorePopup(ctx, f.x * ts + ts / 2, f.y * ts + ts / 2, f.text, f.age, f.color);
    });

    // Undo shake
    if (shake.x || shake.y) ctx.translate(-shake.x, -shake.y);
    ctx.restore();

    // Damage flash
    drawDamageFlash(ctx, w, h, state.damageFlash);

    // HUD
    drawHUD(ctx, w, h, state);

    // Banner
    if (state.banner && state.bannerTimer > 0) {
      drawBanner(ctx, w, h, state.banner, null, '#44ff66', Math.min(1, state.bannerTimer / 300));
    }

    // Results overlay
    if (state.mode === 'game_over') {
      drawResultsOverlay(ctx, w, h, state);
    }
  }, [character, reducedMotion]);

  // ── Effect: wire up render + resize ────────────────
  useEffect(() => {
    renderRef.current = render;
    game.setOnRender(render);
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    let ro;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(onResize);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [game, render, resize]);

  // ── Keyboard ───────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault();
        game.setKeyDown(key, e.type === 'keydown');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [game]);

  // ── Touch (swipe) ──────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const minSwipe = 20;
    if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      game.queueDirection(dx > 0 ? 'right' : 'left');
    } else {
      game.queueDirection(dy > 0 ? 'down' : 'up');
    }
    touchStartRef.current = null;
  }, [game]);

  return (
    <div ref={containerRef} className="w-full h-full relative select-none touch-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}

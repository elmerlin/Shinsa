import React, { useCallback, useEffect, useRef } from 'react';
import { loadAllSprites, loadAllEnemySprites } from './petBattleSpriteLoader';
import {
  drawAuraMeter,
  drawBattlefield,
  drawCountdown,
  drawEnemyBase,
  drawEnemyUnit,
  drawExplosion,
  drawHUD,
  drawPlayerBase,
  drawPlayerUnit,
  drawProjectile,
  drawResults,
  drawSpawnButtons,
  drawStageClearBanner,
  drawStartScreen,
  drawDeathPoof,
  drawSlashFX,
  drawImpactStars,
  getBattlefieldGroundY,
} from './petBattleSprites';
import { VIEWPORT_WIDTH, ENEMY_BASE_X, PLAYER_BASE_X } from './usePetBattleGame';

export default function PetBattleCanvas({ game, character, reducedMotion, world }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const renderRef = useRef(null);
  const pressedKeysRef = useRef(new Set());

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    sizeRef.current = { w, h };
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderRef.current?.(game.getState());
  }, [game]);

  const render = useCallback((state) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);

    drawBattlefield(ctx, w, h, state, reducedMotion, world || 'grassland');
    const groundY = getBattlefieldGroundY(h);
    const pxPerWorld = w / VIEWPORT_WIDTH;
    const worldToScreen = (worldX) => (worldX - state.cameraX) * pxPerWorld;
    const scale = Math.max(4, Math.min(9, Math.round(Math.min(pxPerWorld * 1.12, h / 84))));

    const playerBaseX = worldToScreen(PLAYER_BASE_X);
    const enemyBaseX = worldToScreen(ENEMY_BASE_X);
    drawPlayerBase(ctx, playerBaseX, groundY, scale, state.character || character || 'dojocat', state.playerBaseHp, state.playerBaseMaxHp);
    drawEnemyBase(ctx, enemyBaseX, groundY, scale, state.enemyBaseHp, state.enemyBaseMaxHp);

    const entities = [
      ...state.playerUnits.map((unit) => ({ team: 'player', unit })),
      ...state.enemyUnits.map((unit) => ({ team: 'enemy', unit })),
    ].sort((a, b) => a.unit.x - b.unit.x);

    entities.forEach(({ team, unit }) => {
      const screenX = worldToScreen(unit.x);
      if (screenX < -110 || screenX > w + 110) return;
      if (team === 'player') drawPlayerUnit(ctx, unit, screenX, groundY, scale, state.character || character || 'dojocat', state.animFrame);
      else drawEnemyUnit(ctx, unit, screenX, groundY, scale, state.animFrame, world || 'grassland');
    });

    state.projectiles.forEach((projectile) => {
      const screenX = worldToScreen(projectile.x);
      if (screenX < -40 || screenX > w + 40) return;
      drawProjectile(ctx, projectile, screenX, groundY - 28, Math.max(2, scale * 0.6), state.character || character || 'dojocat');
    });

    state.fx.forEach((fx) => {
      const screenX = worldToScreen(fx.x);
      const fxSize = fx.size * scale * 0.35;
      if (fx.type === 'explosion') drawExplosion(ctx, screenX, groundY - 22, fxSize, fx.progress);
      else if (fx.type === 'slash') drawSlashFX(ctx, screenX, groundY - 22, fxSize, fx.progress);
      else if (fx.type === 'impact') drawImpactStars(ctx, screenX, groundY - 18, fxSize, fx.progress);
      else drawDeathPoof(ctx, screenX, groundY - 18, fxSize, fx.progress);
    });

    drawHUD(ctx, w, h, state);

    if (state.mode === 'idle') {
      drawStartScreen(ctx, w, h, state.character || character || 'dojocat');
      drawSpawnButtons(ctx, 12, h - 28, 140, state, state.character || character || 'dojocat');
      drawAuraMeter(ctx, 12, h - 42, 120, state.aura, state.auraMax, state.auraLevel);
      return;
    }

    if (state.mode === 'countdown') {
      drawCountdown(ctx, w, h, state.countdownValue <= 0 ? 'GO!' : String(state.countdownValue));
      return;
    }

    if (state.mode === 'stage_clear') {
      drawStageClearBanner(ctx, w, h, state);
    }

    if (state.mode === 'game_over') {
      drawResults(ctx, w, h, state);
    }
  }, [character, game, reducedMotion, world]);

  useEffect(() => {
    renderRef.current = render;
    game.setOnRender(render);
    render(game.getState());
  }, [game, render]);

  useEffect(() => {
    const rerender = () => renderRef.current?.(game.getState());
    loadAllSprites().then(rerender);
    loadAllEnemySprites().then(rerender);
  }, [game]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => resize())
      : null;
    if (observer && containerRef.current) observer.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, [resize]);

  useEffect(() => {
    const actionByKey = {
      '1': () => game.spawnUnit('meatshield'),
      q: () => game.spawnUnit('meatshield'),
      '2': () => game.spawnUnit('brawler'),
      w: () => game.spawnUnit('brawler'),
      '3': () => game.spawnUnit('ranged'),
      e: () => game.spawnUnit('ranged'),
      '4': () => game.spawnUnit('tank'),
      r: () => game.spawnUnit('tank'),
      '5': () => game.upgradeAura(),
      u: () => game.upgradeAura(),
    };

    const handleKeyDown = (event) => {
      const state = game.getState();
      if (state.mode !== 'playing') return;
      const key = event.key.toLowerCase();
      const action = actionByKey[key];
      if (!action) return;
      event.preventDefault();
      if (event.repeat || pressedKeysRef.current.has(key)) return;
      pressedKeysRef.current.add(key);
      action();
    };

    const handleKeyUp = (event) => {
      pressedKeysRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      pressedKeysRef.current.clear();
    };
  }, [game]);

  return (
    <div ref={containerRef} className="w-full h-full relative select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

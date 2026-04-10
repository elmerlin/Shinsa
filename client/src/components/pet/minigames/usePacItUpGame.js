import { useRef, useCallback, useEffect, useMemo } from 'react';
import {
  PAC_IT_UP_MAZES, COLS, ROWS,
  getMazeForStage, buildTileGrid, countCollectibles,
  tunnelWrap, bfsDirection, randomDirection, manhattan,
} from './pacItUpMazes';
import {
  playChomp, playPowerUp, playGhostEat, playMineHit,
  playShieldPickup, playShieldBreak, playLifeLost,
  playStageClear, playGameOver, playCountdown,
  startSiren, stopSiren, startAudio, stopAll,
} from './pacItUpAudio';

// ─── Constants ───────────────────────────────────────────────────

const PLAYER_SPEED   = 3.8;  // tiles/sec
const GHOST_BASE     = 3.1;
const GHOST_TIER_INC = 0.15;
const GHOST_MAX      = 3.9;
const GHOST_FRIGHT   = 2.4;
const GHOST_RETURN   = 4.2;

const FRIGHT_BASE    = 8000;
const FRIGHT_TIER    = 400;
const FRIGHT_MIN     = 4800;

const RESPAWN_MS     = 1200;
const SHIELD_INVULN  = 1000;
const RETURN_PAUSE   = 800;

const DX = { up: 0, down: 0, left: -1, right: 1 };
const DY = { up: -1, down: 1, left: 0, right: 0 };
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const FIXED_DT = 1000 / 60; // ~16.67ms per tick

// ─── Initial state factory ───────────────────────────────────────

function createInitialState() {
  return {
    mode: 'idle', // idle | countdown | playing | life_lost | stage_clear | game_over
    // Player
    character: 'dojocat',
    px: 9, py: 16, dir: 'left', queuedDir: null,
    lives: 3, combo: 0, longestCombo: 0,
    shieldCharges: 0, respawnInvulnMs: 0,
    // Run
    score: 0, stage: 1, mazeIndex: 0, tier: 0,
    stompsCollected: 0, ghostsEaten: 0, frightChain: 0,
    // Stage
    grid: null, maze: null,
    remainingCollectibles: 0, powerModeMs: 0,
    assistSpawned: false, assistCollected: false,
    stageCollectibleTotal: 0,
    shieldPickup: null,
    // Ghosts
    ghosts: [],
    // FX
    fx: [],
    // Render
    countdownValue: 3,
    banner: null, bannerTimer: 0,
    damageFlash: 0, animFrame: 0, cameraShake: 0,
    modeTimer: 0,
    // Touch/keys
    heldKeys: {},
    touchPadDir: null,
  };
}

// ─── Ghost factory ───────────────────────────────────────────────

const GHOST_NAMES = ['tempo', 'glint', 'drift', 'ember'];

function createGhosts(maze, tier) {
  return maze.ghostSpawns.map((sp, i) => ({
    name: GHOST_NAMES[i],
    x: sp.x, y: sp.y,
    dir: 'up',
    state: 'scatter', // scatter | chase | frightened | returning | house
    stateTimer: 0,
    scatterTarget: maze.scatterTargets[i],
    speed: Math.min(GHOST_MAX, GHOST_BASE + GHOST_TIER_INC * tier),
    moveProgress: 0,
    returnPauseMs: 0,
    releaseDelay: i * 2500, // stagger exits
  }));
}

// ─── Stage setup ─────────────────────────────────────────────────

function setupStage(state) {
  const { maze, mazeIndex, tier } = getMazeForStage(state.stage);
  const grid = buildTileGrid(maze, tier);
  const total = countCollectibles(grid);

  state.maze = maze;
  state.mazeIndex = mazeIndex;
  state.tier = tier;
  state.grid = grid;
  state.remainingCollectibles = total;
  state.stageCollectibleTotal = total;
  state.powerModeMs = 0;
  state.assistSpawned = false;
  state.assistCollected = false;
  state.shieldPickup = null;
  state.frightChain = 0;
  state.shieldCharges = 0;

  // Player spawn
  state.px = maze.playerSpawn.x;
  state.py = maze.playerSpawn.y;
  state.dir = 'left';
  state.queuedDir = null;
  state.respawnInvulnMs = 0;

  // Ghosts
  state.ghosts = createGhosts(maze, tier);
  state.fx = [];
}

// ─── Movement helper ─────────────────────────────────────────────

function canMove(grid, layout, x, y, dir) {
  let nx = x + DX[dir];
  let ny = y + DY[dir];
  nx = tunnelWrap(nx, ny, layout);
  if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS) return false;
  const tile = grid[ny]?.[nx];
  return tile && tile !== 'wall';
}

function isAtTileCenter(pos) {
  return Math.abs(pos - Math.round(pos)) < 0.05;
}

function moveEntity(x, y, dir, speed, dtSec, grid, layout) {
  const dist = speed * dtSec;
  let nx = x + DX[dir] * dist;
  let ny = y + DY[dir] * dist;

  // Snap toward tile center for the perpendicular axis
  if (DX[dir] !== 0) ny = Math.round(ny); // moving horizontally
  else nx = Math.round(nx); // moving vertically

  // Check wall collision — don't move past tile center of a wall tile
  const targetTileX = Math.round(x + DX[dir]);
  const targetTileY = Math.round(y + DY[dir]);
  let wrappedTX = tunnelWrap(targetTileX, targetTileY, layout);
  if (targetTileY >= 0 && targetTileY < ROWS && wrappedTX >= 0 && wrappedTX < COLS) {
    const tile = grid[targetTileY]?.[wrappedTX];
    if (tile === 'wall') {
      // Clamp to current tile center
      nx = Math.round(x);
      ny = Math.round(y);
    }
  }

  // Tunnel wrap
  if (nx < -0.5) nx = COLS - 0.5;
  else if (nx > COLS - 0.5) nx = -0.5;

  return { x: nx, y: ny };
}

// ─── Scoring ─────────────────────────────────────────────────────

function stompScore(combo) { return 10 + Math.min(5, Math.floor(combo / 10)); }
function powerScore(combo) { return 50 + Math.min(5, Math.floor(combo / 10)); }
function ghostChainScore(chain) {
  const values = [200, 400, 800, 1600];
  return values[Math.min(chain, values.length - 1)];
}
function stageClearBonus(livesRemaining) { return 500 + 100 * livesRemaining; }

// ─── Ghost AI ────────────────────────────────────────────────────

function getGhostTarget(ghost, state) {
  const { px, py, dir } = state;
  switch (ghost.name) {
    case 'tempo': // direct chaser
      return { x: Math.round(px), y: Math.round(py) };
    case 'glint': { // ambusher — 4 tiles ahead
      let tx = Math.round(px) + DX[dir] * 4;
      let ty = Math.round(py) + DY[dir] * 4;
      tx = Math.max(0, Math.min(COLS - 1, tx));
      ty = Math.max(0, Math.min(ROWS - 1, ty));
      return { x: tx, y: ty };
    }
    case 'drift': // patroller — prefers side flank
      if (Math.abs(ghost.x - px) > 6) return { x: Math.round(px), y: Math.round(py) };
      return ghost.scatterTarget;
    case 'ember': { // opportunist — chase when far, scatter when close
      const dist = manhattan({ x: ghost.x, y: ghost.y }, { x: px, y: py });
      if (dist > 8) return { x: Math.round(px), y: Math.round(py) };
      return ghost.scatterTarget;
    }
    default:
      return { x: Math.round(px), y: Math.round(py) };
  }
}

function tickGhost(ghost, state, dtMs) {
  const { grid, maze } = state;
  const layout = maze.layout;
  const tier = state.tier;

  // Release delay
  if (ghost.releaseDelay > 0) {
    ghost.releaseDelay -= dtMs;
    return;
  }

  // Return pause after being eaten
  if (ghost.returnPauseMs > 0) {
    ghost.returnPauseMs -= dtMs;
    if (ghost.returnPauseMs <= 0) {
      ghost.state = 'scatter';
      ghost.stateTimer = 0;
    }
    return;
  }

  // State timer — alternate scatter/chase
  ghost.stateTimer += dtMs;
  if (ghost.state === 'scatter' && ghost.stateTimer > 7000) {
    ghost.state = 'chase';
    ghost.stateTimer = 0;
  } else if (ghost.state === 'chase' && ghost.stateTimer > 20000) {
    ghost.state = 'scatter';
    ghost.stateTimer = 0;
  }

  // Speed
  let speed = ghost.speed;
  if (ghost.state === 'frightened') speed = GHOST_FRIGHT;
  else if (ghost.state === 'returning') speed = GHOST_RETURN;

  // Direction at tile center
  const gx = Math.round(ghost.x);
  const gy = Math.round(ghost.y);
  if (isAtTileCenter(ghost.x) && isAtTileCenter(ghost.y)) {
    if (ghost.state === 'returning') {
      // Path to ghost house door
      const door = maze.ghostHouseDoor;
      if (gx === door.x && gy === door.y) {
        // Arrived at door — move into house
        ghost.x = maze.ghostSpawns[0].x;
        ghost.y = maze.ghostSpawns[0].y;
        ghost.returnPauseMs = RETURN_PAUSE;
        return;
      }
      ghost.dir = bfsDirection(grid, layout, gx, gy, door.x, door.y, ghost.dir);
    } else if (ghost.state === 'frightened') {
      ghost.dir = randomDirection(grid, layout, gx, gy, ghost.dir);
    } else {
      // Scatter or chase
      const target = ghost.state === 'scatter' ? ghost.scatterTarget : getGhostTarget(ghost, state);
      ghost.dir = bfsDirection(grid, layout, gx, gy, target.x, target.y, ghost.dir);
    }
  }

  // Move
  const dtSec = dtMs / 1000;
  const moved = moveEntity(ghost.x, ghost.y, ghost.dir, speed, dtSec, grid, layout);
  ghost.x = moved.x;
  ghost.y = moved.y;
}

// ─── Tick ────────────────────────────────────────────────────────

function tick(state, dtMs) {
  if (state.mode !== 'playing') return;

  state.animFrame++;

  // Timers
  if (state.respawnInvulnMs > 0) state.respawnInvulnMs -= dtMs;
  if (state.damageFlash > 0) state.damageFlash -= dtMs / 300;
  if (state.cameraShake > 0) state.cameraShake -= dtMs / 200;
  if (state.bannerTimer > 0) state.bannerTimer -= dtMs;
  else state.banner = null;

  // FX aging
  state.fx = state.fx.filter(f => {
    f.age += dtMs;
    return f.age < 800;
  });

  // Power mode countdown
  if (state.powerModeMs > 0) {
    state.powerModeMs -= dtMs;
    if (state.powerModeMs <= 0) {
      state.powerModeMs = 0;
      state.frightChain = 0;
      // End frightened for all ghosts
      state.ghosts.forEach(g => {
        if (g.state === 'frightened') {
          g.state = 'scatter';
          g.stateTimer = 0;
          g.dir = REVERSE[g.dir] || g.dir;
        }
      });
      startSiren('normal');
    }
  }

  // ── Player movement ──
  const { grid, maze } = state;
  const layout = maze.layout;
  const dtSec = dtMs / 1000;

  // Resolve queued direction
  if (state.queuedDir && isAtTileCenter(state.px) && isAtTileCenter(state.py)) {
    if (canMove(grid, layout, Math.round(state.px), Math.round(state.py), state.queuedDir)) {
      state.dir = state.queuedDir;
      state.queuedDir = null;
    }
  }

  // Try to move in current direction
  if (canMove(grid, layout, Math.round(state.px), Math.round(state.py), state.dir) || !isAtTileCenter(state.px) || !isAtTileCenter(state.py)) {
    const moved = moveEntity(state.px, state.py, state.dir, PLAYER_SPEED, dtSec, grid, layout);
    state.px = moved.x;
    state.py = moved.y;
  }

  // Snap to tile center for collection checks
  const tileX = Math.round(state.px);
  const tileY = Math.round(state.py);
  const nearCenter = Math.abs(state.px - tileX) < 0.2 && Math.abs(state.py - tileY) < 0.2;

  if (nearCenter && tileY >= 0 && tileY < ROWS && tileX >= 0 && tileX < COLS) {
    const tile = grid[tileY]?.[tileX];

    // Collect stomp
    if (tile === 'stomp') {
      grid[tileY][tileX] = 'empty';
      state.combo++;
      state.longestCombo = Math.max(state.longestCombo, state.combo);
      state.stompsCollected++;
      state.remainingCollectibles--;
      state.score += stompScore(state.combo);
      state.fx.push({ type: 'score', x: tileX, y: tileY, text: `+${stompScore(state.combo)}`, age: 0, color: '#ffcc22' });
      playChomp();
    }

    // Collect power stomp
    if (tile === 'power') {
      grid[tileY][tileX] = 'empty';
      state.combo++;
      state.longestCombo = Math.max(state.longestCombo, state.combo);
      state.stompsCollected++;
      state.remainingCollectibles--;
      state.score += powerScore(state.combo);
      state.fx.push({ type: 'score', x: tileX, y: tileY, text: `+${powerScore(state.combo)}`, age: 0, color: '#ff4466' });

      // Activate frightened mode
      state.frightChain = 0;
      state.powerModeMs = Math.max(FRIGHT_MIN, FRIGHT_BASE - FRIGHT_TIER * state.tier);
      state.ghosts.forEach(g => {
        if (g.state !== 'returning' && g.releaseDelay <= 0) {
          if (g.state !== 'frightened') g.dir = REVERSE[g.dir] || g.dir;
          g.state = 'frightened';
        }
      });
      playPowerUp();
      startSiren('frightened');
    }

    // Collect shield pickup
    if (state.shieldPickup && tileX === state.shieldPickup.x && tileY === state.shieldPickup.y) {
      state.shieldCharges = 1;
      state.shieldPickup = null;
      state.assistCollected = true;
      playShieldPickup();
    }

    // Mine collision
    if (tile === 'mine' && state.respawnInvulnMs <= 0) {
      if (state.shieldCharges > 0) {
        state.shieldCharges = 0;
        state.respawnInvulnMs = SHIELD_INVULN;
        // Knock back to previous safe tile
        state.px = tileX - DX[state.dir];
        state.py = tileY - DY[state.dir];
        state.damageFlash = 0.5;
        state.cameraShake = 0.5;
        playShieldBreak();
      } else {
        handleLifeLoss(state);
        return;
      }
    }
  }

  // ── Shield spawn check ──
  if (!state.assistSpawned && !state.assistCollected && state.shieldCharges === 0) {
    const collected = state.stageCollectibleTotal - state.remainingCollectibles;
    if (collected >= Math.floor(state.stageCollectibleTotal * 0.5)) {
      // Spawn at farthest assist candidate
      const candidates = maze.assistCandidates || [];
      if (candidates.length > 0) {
        let best = candidates[0];
        let bestDist = 0;
        for (const c of candidates) {
          const d = manhattan(c, { x: tileX, y: tileY });
          if (d > bestDist) { bestDist = d; best = c; }
        }
        state.shieldPickup = { x: best.x, y: best.y };
        state.assistSpawned = true;
      }
    }
  }

  // ── Ghost ticks ──
  state.ghosts.forEach(g => tickGhost(g, state, dtMs));

  // ── Ghost-player collision ──
  state.ghosts.forEach(g => {
    if (g.returnPauseMs > 0 || g.releaseDelay > 0 || g.state === 'returning') return;
    const dist = Math.abs(g.x - state.px) + Math.abs(g.y - state.py);
    if (dist > 0.8) return;

    if (g.state === 'frightened') {
      // Eat ghost
      state.ghostsEaten++;
      const chainScore = ghostChainScore(state.frightChain);
      state.score += chainScore;
      state.frightChain++;
      state.fx.push({ type: 'score', x: g.x, y: g.y, text: `+${chainScore}`, age: 0, color: '#44ccff' });
      g.state = 'returning';
      playGhostEat();
    } else if (state.respawnInvulnMs <= 0) {
      if (state.shieldCharges > 0) {
        state.shieldCharges = 0;
        state.respawnInvulnMs = SHIELD_INVULN;
        state.damageFlash = 0.5;
        state.cameraShake = 0.5;
        playShieldBreak();
      } else {
        handleLifeLoss(state);
        return;
      }
    }
  });

  // ── Stage clear check ──
  if (state.remainingCollectibles <= 0) {
    const bonus = stageClearBonus(state.lives);
    state.score += bonus;
    state.mode = 'stage_clear';
    state.modeTimer = 2000;
    state.banner = `STAGE ${state.stage} CLEAR! +${bonus}`;
    state.bannerTimer = 2000;
    stopSiren();
    playStageClear();
  }
}

function handleLifeLoss(state) {
  state.lives--;
  state.combo = 0;
  state.damageFlash = 1;
  state.cameraShake = 1;
  stopSiren();

  if (state.lives <= 0) {
    state.mode = 'game_over';
    playGameOver();
    return;
  }

  state.mode = 'life_lost';
  state.modeTimer = 1500;
  playLifeLost();
}

// ─── Mode transitions ────────────────────────────────────────────

function tickModeTimer(state, dtMs) {
  if (state.modeTimer <= 0) return;
  state.modeTimer -= dtMs;
  if (state.modeTimer > 0) return;

  if (state.mode === 'life_lost') {
    // Respawn
    state.px = state.maze.playerSpawn.x;
    state.py = state.maze.playerSpawn.y;
    state.dir = 'left';
    state.queuedDir = null;
    state.respawnInvulnMs = RESPAWN_MS;
    state.ghosts = createGhosts(state.maze, state.tier);
    state.powerModeMs = 0;
    state.shieldPickup = null;
    state.mode = 'playing';
    startSiren('normal');
  } else if (state.mode === 'stage_clear') {
    state.stage++;
    setupStage(state);
    state.mode = 'countdown';
    state.countdownValue = 3;
  }
}

// ─── Hook ────────────────────────────────────────────────────────

export default function usePacItUpGame() {
  const stateRef = useRef(createInitialState());
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const accRef = useRef(0);
  const onRenderRef = useRef(null);
  const countdownRef = useRef(null);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTimeRef.current = null;
    accRef.current = 0;
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdown();

    const state = stateRef.current;
    state.mode = 'countdown';
    state.countdownValue = 3;
    onRenderRef.current?.(state);
    playCountdown(false);

    countdownRef.current = setInterval(() => {
      const current = stateRef.current;
      if (current.mode !== 'countdown') {
        clearCountdown();
        return;
      }

      current.countdownValue--;
      if (current.countdownValue <= 0) {
        clearCountdown();
        current.mode = 'playing';
        startSiren('normal');
        playCountdown(true);
      } else {
        playCountdown(false);
      }

      onRenderRef.current?.(current);
    }, 800);
  }, [clearCountdown]);

  const startLoop = useCallback(() => {
    stopLoop();
    const loop = (ts) => {
      const state = stateRef.current;
      if (!lastTimeRef.current) lastTimeRef.current = ts;
      const frameDt = Math.min(ts - lastTimeRef.current, 50);
      lastTimeRef.current = ts;

      if (state.mode === 'playing') {
        accRef.current += frameDt;
        while (accRef.current >= FIXED_DT) {
          tick(state, FIXED_DT);
          accRef.current -= FIXED_DT;
        }
      } else if (state.mode === 'life_lost' || state.mode === 'stage_clear') {
        tickModeTimer(state, frameDt);
        state.animFrame++;
      } else {
        if (state.mode === 'countdown' && !countdownRef.current) {
          startCountdown();
        }
        state.animFrame++;
      }

      onRenderRef.current?.(state);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [stopLoop, startCountdown]);

  const startGame = useCallback((character) => {
    stopLoop();
    clearCountdown();
    startAudio();

    const state = createInitialState();
    state.character = character || 'dojocat';
    setupStage(state);
    stateRef.current = state;
    startCountdown();

    startLoop();
  }, [clearCountdown, startCountdown, stopLoop, startLoop]);

  const queueDirection = useCallback((dir) => {
    if (!dir) return;
    stateRef.current.queuedDir = dir;
  }, []);

  const setTouchPadDir = useCallback((dir) => {
    stateRef.current.touchPadDir = dir;
    if (dir) stateRef.current.queuedDir = dir;
  }, []);

  const setKeyDown = useCallback((key, down) => {
    const state = stateRef.current;
    state.heldKeys[key] = down;
    if (!down) return;
    const map = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    const dir = map[key.toLowerCase()];
    if (dir) state.queuedDir = dir;
  }, []);

  const reset = useCallback(() => {
    stopLoop();
    clearCountdown();
    stopAll();
    stateRef.current = createInitialState();
    onRenderRef.current?.(stateRef.current);
  }, [clearCountdown, stopLoop]);

  const getState = useCallback(() => stateRef.current, []);

  const setOnRender = useCallback((fn) => {
    onRenderRef.current = fn;
  }, []);

  useEffect(() => {
    return () => {
      stopLoop();
      clearCountdown();
      stopAll();
    };
  }, [clearCountdown, stopLoop]);

  return useMemo(() => ({
    startGame,
    queueDirection,
    setTouchPadDir,
    setKeyDown,
    reset,
    getState,
    setOnRender,
    stopLoop,
  }), [startGame, queueDirection, setTouchPadDir, setKeyDown, reset, getState, setOnRender, stopLoop]);
}

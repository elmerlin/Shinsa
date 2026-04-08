/**
 * Mini-Pump Game State Machine
 * Deterministic state machine with explicit modes:
 *   idle → countdown → playing → round_end
 *
 * Exposes window.advanceTime(ms) for test stepping
 * Exposes window.render_game_to_text for Playwright inspection
 */

import { useCallback, useRef, useEffect } from 'react';
import * as audio from './miniPumpAudio';

const ROUND_DURATION = 30000;
const INITIAL_CADENCE = 1000;
const CADENCE_REDUCTION = 50;
const CADENCE_FLOOR = 300;
const BONK_TIME_PENALTY = 1000;
const BLOB_COLORS = ['red', 'yellow', 'blue'];
const HIT_WINDOW_HALF = 0.08; // fraction of playfield height (±8%)
const BLOB_RADIUS_FRAC = 0.028; // fraction of canvas height
const COUNTDOWN_TICKS = [3, 2, 1, 0]; // 0 = GO

// ─── Initial state ───────────────────────────────────
function createInitialState() {
  return {
    mode: 'idle',
    timeRemainingMs: ROUND_DURATION,
    score: 0,
    hits: 0,
    misses: 0,
    headBonks: 0,
    cadenceMs: INITIAL_CADENCE,
    fastestCadenceMs: INITIAL_CADENCE,
    streak: 0,
    bestStreak: 0,
    stack: [],           // [{id, color, y}] — y is 0..1 normalized
    spawnTimerMs: 0,
    petPose: 'idle',
    petExpression: 'normal',
    activeLaser: null,   // {color, progress} or null
    audioPhase: 'bass',  // 'bass' | 'snare' — alternates within cadence
    countdownValue: 3,
    cadenceClock: 0,     // ms into current cadence cycle

    // FX queues
    explosions: [],      // [{x, y, color, progress}]
    missFX: [],          // [{x, y, progress}]
    bonkFX: [],          // [{x, y, progress}]

    // Pose timers
    poseTimer: 0,
    laserTimer: 0,

    // Per-blob ID counter
    _nextId: 1,
  };
}

// ─── Spawn a new blob at top ─────────────────────────
function spawnBlob(state) {
  const color = BLOB_COLORS[Math.floor(Math.random() * 3)];
  const blob = { id: state._nextId++, color, y: -0.05 };
  return { ...state, stack: [...state.stack, blob] };
}

// ─── Deterministic random for test mode ──────────────
let _rngSeed = null;
function seededRandom() {
  if (_rngSeed === null) return Math.random();
  _rngSeed = (_rngSeed * 16807 + 0) % 2147483647;
  return (_rngSeed - 1) / 2147483646;
}

export function setSeed(seed) { _rngSeed = seed; }

// ─── Core tick function ──────────────────────────────
function tick(state, dt) {
  if (state.mode !== 'playing') return state;

  let s = { ...state };

  // ─── Time ───
  s.timeRemainingMs -= dt;
  if (s.timeRemainingMs <= 0) {
    s.timeRemainingMs = 0;
    s.mode = 'round_end';
    s.petPose = s.score >= 10 ? 'results_proud' : 'results_tired';
    s.petExpression = s.score >= 10 ? 'celebrate' : 'stunned';
    audio.playRoundEnd();
    return s;
  }

  // ─── Cadence clock + audio cues ───
  s.cadenceClock += dt;
  const halfCadence = s.cadenceMs / 2;

  if (state.audioPhase === 'bass' && s.cadenceClock >= halfCadence) {
    s.audioPhase = 'snare';
    audio.playSnare();
  }
  if (s.cadenceClock >= s.cadenceMs) {
    s.cadenceClock -= s.cadenceMs;
    s.audioPhase = 'bass';
    audio.playBass();
  }

  // ─── Spawn blobs ───
  s.spawnTimerMs += dt;
  if (s.spawnTimerMs >= s.cadenceMs) {
    s.spawnTimerMs -= s.cadenceMs;
    s = spawnBlob(s);
  }

  // ─── Move blobs down ───
  const speed = 1 / (s.cadenceMs * 4); // takes ~4 cadence cycles to cross field
  s.stack = s.stack.map(b => ({ ...b, y: b.y + speed * dt }));

  // ─── Head bonk detection (lowest blob past hit zone) ───
  const hitZoneY = 0.72; // pet head zone (fraction of playfield)
  const bonkY = 0.82;    // bonk threshold
  const lowestBlob = s.stack.length > 0 ? s.stack[0] : null;

  if (lowestBlob && lowestBlob.y >= bonkY) {
    s.headBonks++;
    s.timeRemainingMs = Math.max(0, s.timeRemainingMs - BONK_TIME_PENALTY);
    s.cadenceMs = INITIAL_CADENCE;
    s.cadenceClock = 0;
    s.streak = 0;
    s.petPose = 'bonk';
    s.petExpression = 'stunned';
    s.poseTimer = 600;
    s.bonkFX = [...s.bonkFX, { x: 0.5, y: hitZoneY, progress: 0 }];
    s.stack = s.stack.slice(1); // remove bonked blob
    audio.playBonk();

    if (s.timeRemainingMs <= 0) {
      s.timeRemainingMs = 0;
      s.mode = 'round_end';
      s.petPose = 'results_tired';
      s.petExpression = 'stunned';
      audio.playRoundEnd();
      return s;
    }
  }

  // ─── Laser animation ───
  if (s.activeLaser) {
    s.laserTimer -= dt;
    s.activeLaser = { ...s.activeLaser, progress: 1 - Math.max(0, s.laserTimer / 200) };
    if (s.laserTimer <= 0) {
      s.activeLaser = null;
      s.laserTimer = 0;
    }
  }

  // ─── Explosion/FX animation ───
  const fxDt = dt / 400;
  s.explosions = s.explosions
    .map(e => ({ ...e, progress: e.progress + fxDt }))
    .filter(e => e.progress < 1);
  s.missFX = s.missFX
    .map(e => ({ ...e, progress: e.progress + fxDt * 1.5 }))
    .filter(e => e.progress < 1);
  s.bonkFX = s.bonkFX
    .map(e => ({ ...e, progress: e.progress + fxDt }))
    .filter(e => e.progress < 1);

  // ─── Pose timer ───
  if (s.poseTimer > 0) {
    s.poseTimer -= dt;
    if (s.poseTimer <= 0) {
      s.petPose = 'ready';
      s.petExpression = 'focused';
      s.poseTimer = 0;
    }
  }

  return s;
}

// ─── Player input handler ────────────────────────────
function handleShot(state, color) {
  if (state.mode !== 'playing') return state;
  if (state.activeLaser) return state; // can't fire while laser active

  let s = { ...state };

  const hitZoneY = 0.72;
  const lowestBlob = s.stack.length > 0 ? s.stack[0] : null;

  // Fire laser
  s.activeLaser = { color, progress: 0 };
  s.laserTimer = 200;
  audio.playShot(color);

  // Set step pose
  const poseName = `step_${color}`;
  s.petPose = poseName;
  s.poseTimer = 300;

  if (lowestBlob) {
    const inHitWindow = Math.abs(lowestBlob.y - hitZoneY) <= HIT_WINDOW_HALF;
    const colorMatch = lowestBlob.color === color;

    if (inHitWindow && colorMatch) {
      // ─── HIT ───
      s.hits++;
      s.score++;
      s.streak++;
      if (s.streak > s.bestStreak) s.bestStreak = s.streak;
      s.cadenceMs = Math.max(CADENCE_FLOOR, s.cadenceMs - CADENCE_REDUCTION);
      if (s.cadenceMs < s.fastestCadenceMs) s.fastestCadenceMs = s.cadenceMs;

      s.explosions = [...s.explosions, { x: 0.5, y: lowestBlob.y, color: lowestBlob.color, progress: 0 }];
      s.stack = s.stack.slice(1);

      s.petPose = 'laser_fire';
      s.petExpression = 'celebrate';
      s.poseTimer = 250;

      audio.playHitExplode();
      if (s.streak > 0 && s.streak % 5 === 0) audio.playStreak();
    } else {
      // ─── MISS ───
      s.misses++;
      s.streak = 0;
      s.missFX = [...s.missFX, { x: 0.5, y: hitZoneY, progress: 0 }];
      s.petExpression = 'normal';
      audio.playMiss();
    }
  } else {
    // No blob to hit
    s.misses++;
    s.streak = 0;
    s.petExpression = 'normal';
    audio.playMiss();
  }

  return s;
}

// ─── Hook ────────────────────────────────────────────
export default function useMiniPumpGame() {
  const stateRef = useRef(createInitialState());
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const onRenderRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Expose for tests
  useEffect(() => {
    window.advanceTime = (ms) => {
      stateRef.current = tick(stateRef.current, ms);
      return stateRef.current;
    };
    window.render_game_to_text = () => {
      const s = stateRef.current;
      const bottom = s.stack.length > 0 ? s.stack[0] : null;
      return JSON.stringify({
        mode: s.mode,
        timeRemainingMs: s.timeRemainingMs,
        score: s.score,
        hits: s.hits,
        misses: s.misses,
        headBonks: s.headBonks,
        cadenceMs: s.cadenceMs,
        fastestCadenceMs: s.fastestCadenceMs,
        streak: s.streak,
        bestStreak: s.bestStreak,
        petPose: s.petPose,
        petExpression: s.petExpression,
        bottomBlob: bottom ? { color: bottom.color, y: bottom.y.toFixed(3) } : null,
        stackLength: s.stack.length,
        hitWindow: { centerY: 0.72, halfHeight: HIT_WINDOW_HALF },
        activeLaser: s.activeLaser ? { color: s.activeLaser.color, progress: s.activeLaser.progress.toFixed(2) } : null,
        note: 'y=0 is top, y=1 is bottom, hitZone at y=0.72',
      }, null, 2);
    };

    return () => {
      delete window.advanceTime;
      delete window.render_game_to_text;
    };
  }, []);

  // Animation loop
  const loop = useCallback((timestamp) => {
    if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
    const dt = Math.min(timestamp - lastTimeRef.current, 50); // cap at 50ms
    lastTimeRef.current = timestamp;

    if (stateRef.current.mode === 'playing') {
      stateRef.current = tick(stateRef.current, dt);
    }

    onRenderRef.current?.(stateRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const startLoop = useCallback(() => {
    lastTimeRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  // ─── Public API ────────────────────────────────────
  const startGame = useCallback(() => {
    audio.startAudio();
    stateRef.current = { ...createInitialState(), mode: 'countdown', countdownValue: 3 };

    // Countdown sequence
    let count = 3;
    audio.playCountdown(count);
    onRenderRef.current?.(stateRef.current);

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      count--;
      stateRef.current = { ...stateRef.current, countdownValue: count };
      audio.playCountdown(count);
      onRenderRef.current?.(stateRef.current);

      if (count <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        stateRef.current = {
          ...stateRef.current,
          mode: 'playing',
          petPose: 'ready',
          petExpression: 'focused',
        };
        // Spawn first blob
        stateRef.current = spawnBlob(stateRef.current);
        audio.playBass();
        startLoop();
      }
    }, 800);
  }, [startLoop]);

  const shoot = useCallback((color) => {
    if (!BLOB_COLORS.includes(color)) return;
    stateRef.current = handleShot(stateRef.current, color);
    onRenderRef.current?.(stateRef.current);
  }, []);

  const reset = useCallback(() => {
    stopLoop();
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    stateRef.current = createInitialState();
    onRenderRef.current?.(stateRef.current);
  }, [stopLoop]);

  const getState = useCallback(() => stateRef.current, []);

  const setOnRender = useCallback((fn) => { onRenderRef.current = fn; }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLoop();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [stopLoop]);

  return { startGame, shoot, reset, getState, setOnRender, stopLoop };
}

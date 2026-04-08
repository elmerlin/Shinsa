/**
 * Mini-Pump Game State Machine v2
 * Timing-based target-line judgement (±35ms tolerance)
 *
 * Each blob has a computed targetTimeMs — the exact game-clock moment
 * its center reaches the target line. Shots are judged against this.
 * Bonk occurs once the blob passes beyond tolerance.
 *
 * Bass fires on cycle start. Snare fires when bottom blob reaches line.
 */

import { useCallback, useRef, useEffect } from 'react';
import * as audio from './miniPumpAudio';

// ─── Constants ───────────────────────────────────────
const ROUND_DURATION = 30000;
const INITIAL_CADENCE = 1000;
const CADENCE_REDUCTION = 50;
const CADENCE_FLOOR = 300;
const BONK_TIME_PENALTY = 1000;
const TIMING_TOLERANCE_MS = 35;
const TRAVEL_CYCLES = 3;        // blob takes 3 cadence-cycles to reach line
const TARGET_LINE_Y = 0.68;     // normalized y-position of target line
const BLOB_COLORS = ['red', 'yellow', 'blue'];

// ─── Initial state ───────────────────────────────────
function createInitialState() {
  return {
    mode: 'idle',               // idle | countdown | playing | round_end
    gameClockMs: 0,             // total elapsed game time
    timeRemainingMs: ROUND_DURATION,
    score: 0,
    hits: 0,
    misses: 0,
    headBonks: 0,
    cadenceMs: INITIAL_CADENCE,
    fastestCadenceMs: INITIAL_CADENCE,
    streak: 0,
    bestStreak: 0,

    // Blob stack — each: {id, color, spawnTimeMs, targetTimeMs, travelMs}
    stack: [],
    spawnTimerMs: 0,

    // Target line state
    targetLineY: TARGET_LINE_Y,

    // Pet state
    petPose: 'idle',
    petExpression: 'normal',
    activeLaser: null,          // {color, progress} or null
    laserTimer: 0,

    // Audio scheduling
    snareFiredForBlob: null,    // id of blob whose snare has already fired
    cadenceClock: 0,            // ms into current cadence cycle

    // Countdown
    countdownValue: 3,

    // Judgement feedback
    lastShotDeltaMs: null,
    lastJudgement: null,        // 'perfect' | 'miss'
    lastJudgementReason: null,  // 'wrong_color' | 'too_early' | 'too_late' | 'no_blob' | 'hit'

    // FX queues
    explosions: [],             // [{x, y, color, progress}]
    missFX: [],                 // [{x, y, progress}]
    bonkFX: [],                 // [{x, y, progress}]
    judgementFX: [],            // [{text, color, progress}]
    lineFlash: null,            // {color, progress} or null

    // Pose timers
    poseTimer: 0,

    // Internal
    _nextId: 1,
  };
}

// ─── Helpers ─────────────────────────────────────────
function pickColor() {
  return BLOB_COLORS[Math.floor(Math.random() * 3)];
}

function spawnBlob(state) {
  const travelMs = state.cadenceMs * TRAVEL_CYCLES;
  const blob = {
    id: state._nextId,
    color: pickColor(),
    spawnTimeMs: state.gameClockMs,
    targetTimeMs: state.gameClockMs + travelMs,
    travelMs,
  };
  return {
    ...state,
    _nextId: state._nextId + 1,
    stack: [...state.stack, blob],
  };
}

/** Get normalized y (0=top, 1=target line) for a blob */
function blobY(blob, gameClockMs) {
  const elapsed = gameClockMs - blob.spawnTimeMs;
  return Math.min(elapsed / blob.travelMs, 1.5); // clamp at 1.5 for past-line
}

// ─── Core tick ───────────────────────────────────────
function tick(state, dt) {
  if (state.mode !== 'playing') return state;

  let s = { ...state };
  s.gameClockMs += dt;

  // ─── Time remaining ───
  s.timeRemainingMs -= dt;
  if (s.timeRemainingMs <= 0) {
    s.timeRemainingMs = 0;
    s.mode = 'round_end';
    s.petPose = s.score >= 10 ? 'results_proud' : 'results_tired';
    s.petExpression = s.score >= 10 ? 'celebrate' : 'stunned';
    audio.playRoundEnd();
    return s;
  }

  // ─── Cadence clock + bass ───
  s.cadenceClock += dt;
  if (s.cadenceClock >= s.cadenceMs) {
    s.cadenceClock -= s.cadenceMs;
    audio.playBass();
  }

  // ─── Snare: fire when bottom blob reaches target line ───
  const bottom = s.stack.length > 0 ? s.stack[0] : null;
  if (bottom && s.snareFiredForBlob !== bottom.id) {
    if (s.gameClockMs >= bottom.targetTimeMs) {
      audio.playSnare();
      s.snareFiredForBlob = bottom.id;
    }
  }

  // ─── Spawn blobs on cadence ───
  s.spawnTimerMs += dt;
  if (s.spawnTimerMs >= s.cadenceMs) {
    s.spawnTimerMs -= s.cadenceMs;
    s = spawnBlob(s);
  }

  // ─── Bonk detection: bottom blob past tolerance window ───
  if (bottom) {
    const pastTolerance = s.gameClockMs > bottom.targetTimeMs + TIMING_TOLERANCE_MS;
    if (pastTolerance) {
      s.headBonks++;
      s.timeRemainingMs = Math.max(0, s.timeRemainingMs - BONK_TIME_PENALTY);
      s.cadenceMs = INITIAL_CADENCE;
      s.cadenceClock = 0;
      s.streak = 0;
      s.petPose = 'bonk';
      s.petExpression = 'stunned';
      s.poseTimer = 500;
      s.bonkFX = [...s.bonkFX, { x: 0.5, y: TARGET_LINE_Y, progress: 0 }];
      s.judgementFX = [...s.judgementFX, { text: 'BONK!', color: '#ff4455', progress: 0 }];
      s.lineFlash = { color: '#ff4455', progress: 0 };
      s.stack = s.stack.slice(1);
      s.snareFiredForBlob = null;
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
  }

  // ─── Laser animation ───
  if (s.activeLaser) {
    s.laserTimer -= dt;
    s.activeLaser = { ...s.activeLaser, progress: 1 - Math.max(0, s.laserTimer / 180) };
    if (s.laserTimer <= 0) {
      s.activeLaser = null;
      s.laserTimer = 0;
    }
  }

  // ─── FX animation ───
  const fxDt = dt / 400;
  s.explosions = s.explosions.map(e => ({ ...e, progress: e.progress + fxDt })).filter(e => e.progress < 1);
  s.missFX = s.missFX.map(e => ({ ...e, progress: e.progress + fxDt * 1.5 })).filter(e => e.progress < 1);
  s.bonkFX = s.bonkFX.map(e => ({ ...e, progress: e.progress + fxDt })).filter(e => e.progress < 1);
  s.judgementFX = s.judgementFX.map(e => ({ ...e, progress: e.progress + fxDt * 1.2 })).filter(e => e.progress < 1);
  if (s.lineFlash) {
    s.lineFlash = { ...s.lineFlash, progress: s.lineFlash.progress + fxDt * 2 };
    if (s.lineFlash.progress >= 1) s.lineFlash = null;
  }

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

// ─── Player input ────────────────────────────────────
function handleShot(state, color) {
  if (state.mode !== 'playing') return state;
  if (state.activeLaser) return state;

  let s = { ...state };
  const bottom = s.stack.length > 0 ? s.stack[0] : null;

  // Fire laser + step
  s.activeLaser = { color, progress: 0 };
  s.laserTimer = 180;
  s.petPose = `step_${color}`;
  s.poseTimer = 250;
  audio.playShot(color);

  if (!bottom) {
    s.misses++;
    s.streak = 0;
    s.lastShotDeltaMs = null;
    s.lastJudgement = 'miss';
    s.lastJudgementReason = 'no_blob';
    s.petExpression = 'normal';
    s.judgementFX = [...s.judgementFX, { text: 'MISS', color: '#ff6666', progress: 0 }];
    audio.playMiss();
    return s;
  }

  const deltaMs = s.gameClockMs - bottom.targetTimeMs;
  s.lastShotDeltaMs = Math.round(deltaMs);

  const colorMatch = bottom.color === color;
  const inTolerance = Math.abs(deltaMs) <= TIMING_TOLERANCE_MS;

  if (colorMatch && inTolerance) {
    // ─── HIT ───
    s.hits++;
    s.score++;
    s.streak++;
    s.lastJudgement = 'perfect';
    s.lastJudgementReason = 'hit';
    if (s.streak > s.bestStreak) s.bestStreak = s.streak;
    s.cadenceMs = Math.max(CADENCE_FLOOR, s.cadenceMs - CADENCE_REDUCTION);
    if (s.cadenceMs < s.fastestCadenceMs) s.fastestCadenceMs = s.cadenceMs;

    const by = blobY(bottom, s.gameClockMs);
    s.explosions = [...s.explosions, { x: 0.5, y: by, color: bottom.color, progress: 0 }];
    s.lineFlash = { color: bottom.color === 'red' ? '#ff4455' : bottom.color === 'yellow' ? '#ffcc22' : '#4488ff', progress: 0 };
    s.judgementFX = [...s.judgementFX, { text: `HIT`, color: '#44ff88', progress: 0 }];
    s.stack = s.stack.slice(1);
    s.snareFiredForBlob = null;

    s.petPose = 'laser_fire';
    s.petExpression = 'celebrate';
    s.poseTimer = 220;

    audio.playHitExplode();
    if (s.streak > 0 && s.streak % 5 === 0) audio.playStreak();
  } else {
    // ─── MISS ───
    s.misses++;
    s.streak = 0;
    s.lastJudgement = 'miss';
    s.lastJudgementReason = !colorMatch ? 'wrong_color' : deltaMs < 0 ? 'too_early' : 'too_late';
    s.missFX = [...s.missFX, { x: 0.5, y: TARGET_LINE_Y, progress: 0 }];
    s.judgementFX = [...s.judgementFX, { text: 'MISS', color: '#ff6666', progress: 0 }];
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

  // Expose deterministic test hooks
  useEffect(() => {
    window.advanceTime = (ms) => {
      stateRef.current = tick(stateRef.current, ms);
      return stateRef.current;
    };
    window.render_game_to_text = () => {
      const s = stateRef.current;
      const bottom = s.stack.length > 0 ? s.stack[0] : null;
      const bottomCenterY = bottom ? blobY(bottom, s.gameClockMs).toFixed(3) : null;
      return JSON.stringify({
        mode: s.mode,
        gameClockMs: Math.round(s.gameClockMs),
        timeRemainingMs: Math.round(s.timeRemainingMs),
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
        targetLineY: TARGET_LINE_Y,
        timingToleranceMs: TIMING_TOLERANCE_MS,
        bottomBlob: bottom ? {
          color: bottom.color,
          centerY: bottomCenterY,
          targetTimeMs: Math.round(bottom.targetTimeMs),
          bonkTimeMs: Math.round(bottom.targetTimeMs + TIMING_TOLERANCE_MS),
        } : null,
        stackLength: s.stack.length,
        lastShotDeltaMs: s.lastShotDeltaMs,
        lastJudgement: s.lastJudgement,
        lastJudgementReason: s.lastJudgementReason,
        activeLaser: s.activeLaser ? { color: s.activeLaser.color, progress: s.activeLaser.progress.toFixed(2) } : null,
        note: 'y=0 top, y=1.0 target line. Shoot when bottomBlob.centerY~=1.0. Tolerance ±35ms from targetTimeMs.',
      }, null, 2);
    };
    return () => { delete window.advanceTime; delete window.render_game_to_text; };
  }, []);

  // Animation loop
  const loop = useCallback((timestamp) => {
    if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
    const dt = Math.min(timestamp - lastTimeRef.current, 50);
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

  const startGame = useCallback(() => {
    audio.startAudio();
    stateRef.current = { ...createInitialState(), mode: 'countdown', countdownValue: 3 };

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
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    stateRef.current = createInitialState();
    onRenderRef.current?.(stateRef.current);
  }, [stopLoop]);

  const getState = useCallback(() => stateRef.current, []);
  const setOnRender = useCallback((fn) => { onRenderRef.current = fn; }, []);

  useEffect(() => {
    return () => { stopLoop(); if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); };
  }, [stopLoop]);

  return { startGame, shoot, reset, getState, setOnRender, stopLoop };
}

// Export for canvas renderer
export { blobY, TARGET_LINE_Y, TIMING_TOLERANCE_MS };

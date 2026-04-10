import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as audio from './petBattleAudio';

export const VIEWPORT_WIDTH = 100;
export const WORLD_WIDTH = 300;
export const PLAYER_BASE_X = 12;
export const ENEMY_BASE_X = WORLD_WIDTH - 12;

const FIXED_DT = 1000 / 60;
const PLAYER_BASE_HP = 1000;
const AURA_MAX = 500;
const AURA_BASE_RATE = 14;
const MAX_AURA_LEVEL = 8;
const STAGE_CLEAR_MS = 1700;
const WAVE_GAP_MS = 1200;
const PROJECTILE_SPEED = 44;
const CAMERA_LERP = 0.08;
const BASE_CONTACT_RANGE = 8;

export const ARCHETYPES = {
  meatshield: { key: 'meatshield', label: 'Frontliner', cost: 50, hp: 80, damage: 10, moveSpeed: 14.4, range: 8, cooldownMs: 2000, attackMs: 650, projectile: false, size: 7.5 },
  brawler: { key: 'brawler', label: 'Brawler', cost: 150, hp: 250, damage: 35, moveSpeed: 9.6, range: 10, cooldownMs: 5000, attackMs: 900, projectile: false, size: 9.5 },
  ranged: { key: 'ranged', label: 'Ranged', cost: 250, hp: 120, damage: 50, moveSpeed: 7.2, range: 28, cooldownMs: 8000, attackMs: 1200, projectile: true, size: 8.5 },
  tank: { key: 'tank', label: 'Tank', cost: 500, hp: 600, damage: 80, moveSpeed: 4.8, range: 12, cooldownMs: 15000, attackMs: 1500, projectile: false, aoe: 12, size: 12 },
};

export const PET_UNIT_NAMES = {
  dojocat: { meatshield: 'White Belt', brawler: 'Nunchuck', ranged: 'Shuriken', tank: 'Sensei' },
  pixiu: { meatshield: 'Mini Coin', brawler: 'Jade Claws', ranged: 'Fire Breath', tank: 'Giant Winged' },
  buu: { meatshield: 'Tiny Blob', brawler: 'Boxing Gloves', ranged: 'Candy Beam', tank: 'Muscle Buu' },
  devit: { meatshield: 'Imp', brawler: 'Pitchfork', ranged: 'Fireball', tank: 'Demon Lord' },
};

export const ENEMY_TYPES = {
  basic: { key: 'basic', hp: 60, damage: 8, moveSpeed: 10.8, range: 8, score: 10, bounty: 15, attackMs: 700, size: 7 },
  bruiser: { key: 'bruiser', hp: 200, damage: 25, moveSpeed: 7.2, range: 10, score: 25, bounty: 30, attackMs: 950, size: 9.5 },
  sniper: { key: 'sniper', hp: 80, damage: 45, moveSpeed: 4.8, range: 28, score: 30, bounty: 35, attackMs: 1300, projectile: true, size: 8.5 },
  tank: { key: 'tank', hp: 500, damage: 60, moveSpeed: 3.6, range: 12, score: 50, bounty: 50, attackMs: 1500, aoe: 12, size: 11 },
  boss: { key: 'boss', hp: 1500, damage: 100, moveSpeed: 2.4, range: 14, score: 200, bounty: 100, attackMs: 1750, aoe: 16, size: 14 },
};

function getWaveCount(stage) {
  return 3 + (stage % 3);
}

function getEnemyBaseHp(stage) {
  return Math.round(800 + ((10000 - 800) * (stage - 1)) / 9);
}

function createInitialState() {
  return {
    mode: 'idle',
    countdownValue: 3,
    character: 'dojocat',
    score: 0,
    stage: 1,
    stageReached: 1,
    wave: 1,
    waveCount: getWaveCount(1),
    globalWave: 0,
    aura: 100,
    auraLevel: 1,
    auraMax: AURA_MAX,
    playerBaseHp: PLAYER_BASE_HP,
    playerBaseMaxHp: PLAYER_BASE_HP,
    enemyBaseHp: getEnemyBaseHp(1),
    enemyBaseMaxHp: getEnemyBaseHp(1),
    playerUnits: [],
    enemyUnits: [],
    projectiles: [],
    fx: [],
    cooldowns: {
      meatshield: 0,
      brawler: 0,
      ranged: 0,
      tank: 0,
    },
    unitsSpawned: 0,
    enemiesDefeated: 0,
    bossesDefeated: 0,
    waveQueue: [],
    waveDelayMs: 0,
    cameraX: 0,
    animFrame: 0,
    modeTimer: 0,
    outcome: '',
    victory: false,
    _nextId: 1,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function auraRate(level) {
  return AURA_BASE_RATE + level * 4;
}

function upgradeCost(level) {
  return Math.round(100 * (1.5 ** (level - 1)));
}

function enemyScale(stage) {
  return 1 + (stage - 1) * 0.3;
}

function stageOutcomeScore(stage) {
  return stage * 500;
}

function createPlayerUnit(state, typeKey) {
  const template = ARCHETYPES[typeKey];
  const names = PET_UNIT_NAMES[state.character] || PET_UNIT_NAMES.dojocat;
  return {
    id: state._nextId++,
    team: 'player',
    type: typeKey,
    name: names[typeKey] || template.label,
    x: PLAYER_BASE_X + 8,
    hp: template.hp,
    maxHp: template.hp,
    damage: template.damage,
    moveSpeed: template.moveSpeed,
    range: template.range,
    attackMs: template.attackMs,
    attackTimer: 250,
    cooldownMs: template.cooldownMs,
    projectile: template.projectile,
    aoe: template.aoe || 0,
    size: template.size,
    attackFlash: 0,
  };
}

function createEnemyUnit(state, typeKey) {
  const template = ENEMY_TYPES[typeKey];
  const scale = enemyScale(state.stage);
  const hp = Math.round(template.hp * scale);
  return {
    id: state._nextId++,
    team: 'enemy',
    type: typeKey,
    x: ENEMY_BASE_X - 10,
    hp,
    maxHp: hp,
    damage: Math.round(template.damage * Math.min(2.2, 1 + (state.stage - 1) * 0.12)),
    moveSpeed: template.moveSpeed,
    range: template.range,
    attackMs: template.attackMs,
    attackTimer: 200,
    projectile: template.projectile,
    aoe: template.aoe || 0,
    size: template.size,
    score: template.score,
    bounty: template.bounty,
    attackFlash: 0,
  };
}

export function generateWaveEnemies(stage, wave, globalWave) {
  const bossWave = globalWave % 5 === 0;
  if (bossWave) {
    return [{ delayMs: 500, type: 'boss' }];
  }

  const count = 4 + stage + wave;
  const pool = ['basic'];
  if (stage >= 2 || wave >= 2) pool.push('bruiser');
  if (stage >= 3) pool.push('sniper');
  if (stage >= 5) pool.push('tank');
  const enemies = [];
  for (let i = 0; i < count; i++) {
    let type = pool[Math.floor(Math.random() * pool.length)];
    if (i === count - 1 && stage >= 4 && wave === getWaveCount(stage)) type = 'tank';
    enemies.push({
      delayMs: 450 + i * Math.max(220, 650 - stage * 25),
      type,
    });
  }
  return enemies;
}

function queueWave(state) {
  state.globalWave += 1;
  state.waveQueue = generateWaveEnemies(state.stage, state.wave, state.globalWave);
  state.waveDelayMs = 0;
  if (state.globalWave % 5 === 0) audio.playBossAppear();
}

function setupStage(state, stage) {
  state.stage = stage;
  state.stageReached = Math.max(state.stageReached, stage);
  state.wave = 1;
  state.waveCount = getWaveCount(stage);
  state.enemyBaseHp = getEnemyBaseHp(stage);
  state.enemyBaseMaxHp = state.enemyBaseHp;
  state.enemyUnits = [];
  state.projectiles = [];
  state.fx = [];
  state.modeTimer = 0;
  queueWave(state);
}

function addFx(state, type, x, y, size = 8) {
  state.fx.push({ id: state._nextId++, type, x, y, size, progress: 0 });
}

function damageBase(state, team, damage) {
  if (team === 'enemy') {
    state.playerBaseHp = Math.max(0, state.playerBaseHp - damage);
  } else {
    state.enemyBaseHp = Math.max(0, state.enemyBaseHp - damage);
  }
  audio.playBaseHit();
}

function attackUnit(state, attacker, target, isBase = false) {
  attacker.attackTimer = attacker.attackMs;
  attacker.attackFlash = 180;
  if (attacker.projectile && !isBase) {
    state.projectiles.push({
      id: state._nextId++,
      team: attacker.team,
      sourceType: attacker.type,
      kind: 'ranged',
      x: attacker.x,
      y: 0,
      dir: attacker.team === 'player' ? 1 : -1,
      damage: attacker.damage,
      targetId: target.id,
      targetTeam: target.team,
      speed: PROJECTILE_SPEED,
    });
    audio.playRangedShot();
    return;
  }

  if (attacker.team === 'player') audio.playMeleeHit();
  else audio.playEnemyHit();

  if (isBase) {
    damageBase(state, attacker.team, attacker.damage);
    return;
  }

  target.hp -= attacker.damage;
  if (attacker.aoe) {
    const pool = attacker.team === 'player' ? state.enemyUnits : state.playerUnits;
    pool.forEach((candidate) => {
      if (candidate.id === target.id) return;
      if (Math.abs(candidate.x - target.x) <= attacker.aoe) {
        candidate.hp -= Math.round(attacker.damage * 0.35);
      }
    });
  }
}

function updateCooldowns(state, dt) {
  Object.keys(state.cooldowns).forEach((key) => {
    state.cooldowns[key] = Math.max(0, state.cooldowns[key] - dt);
  });
}

function updateWaveSpawning(state, dt) {
  if (!state.waveQueue.length) return;
  state.waveDelayMs += dt;
  while (state.waveQueue.length && state.waveDelayMs >= state.waveQueue[0].delayMs) {
    const next = state.waveQueue.shift();
    state.enemyUnits.push(createEnemyUnit(state, next.type));
  }
}

function updateUnits(state, dt, playerUnits, enemyUnits) {
  const dtSec = dt / 1000;
  playerUnits.forEach((unit) => {
    unit.attackTimer = Math.max(0, unit.attackTimer - dt);
    unit.attackFlash = Math.max(0, unit.attackFlash - dt);
    const target = enemyUnits.find((enemy) => enemy.hp > 0 && enemy.x >= unit.x && enemy.x - unit.x <= unit.range);
    const canHitBase = state.enemyBaseHp > 0 && ENEMY_BASE_X - unit.x <= Math.max(BASE_CONTACT_RANGE, unit.range);
    if (target) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, target, false);
    } else if (canHitBase) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, null, true);
    } else {
      unit.x = Math.min(ENEMY_BASE_X - 4, unit.x + unit.moveSpeed * dtSec);
    }
  });

  enemyUnits.forEach((unit) => {
    unit.attackTimer = Math.max(0, unit.attackTimer - dt);
    unit.attackFlash = Math.max(0, unit.attackFlash - dt);
    const target = playerUnits.find((ally) => ally.hp > 0 && ally.x <= unit.x && unit.x - ally.x <= unit.range);
    const canHitBase = state.playerBaseHp > 0 && unit.x - PLAYER_BASE_X <= Math.max(BASE_CONTACT_RANGE, unit.range);
    if (target) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, target, false);
    } else if (canHitBase) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, null, true);
    } else {
      unit.x = Math.max(PLAYER_BASE_X + 4, unit.x - unit.moveSpeed * dtSec);
    }
  });
}

function updateProjectiles(state, dt) {
  const dtSec = dt / 1000;
  state.projectiles.forEach((projectile) => {
    projectile.x += projectile.dir * projectile.speed * dtSec;
    const targets = projectile.team === 'player' ? state.enemyUnits : state.playerUnits;
    const hitTarget = targets.find((unit) => (
      Math.abs(unit.x - projectile.x) <= Math.max(2, unit.size * 0.55)
    ));
    if (hitTarget) {
      hitTarget.hp -= projectile.damage;
      projectile.done = true;
      addFx(state, 'explosion', projectile.x, 0, 6);
      if (projectile.team === 'player') audio.playEnemyHit();
      else audio.playMeleeHit();
      return;
    }

    if (projectile.team === 'player' && projectile.x >= ENEMY_BASE_X - BASE_CONTACT_RANGE) {
      damageBase(state, 'player', projectile.damage);
      projectile.done = true;
      addFx(state, 'explosion', ENEMY_BASE_X - 3, 0, 8);
    } else if (projectile.team === 'enemy' && projectile.x <= PLAYER_BASE_X + BASE_CONTACT_RANGE) {
      damageBase(state, 'enemy', projectile.damage);
      projectile.done = true;
      addFx(state, 'explosion', PLAYER_BASE_X + 3, 0, 8);
    }
  });
  state.projectiles = state.projectiles.filter((projectile) => !projectile.done && projectile.x >= 0 && projectile.x <= WORLD_WIDTH);
}

function resolveDeaths(state) {
  state.playerUnits = state.playerUnits.filter((unit) => {
    if (unit.hp > 0) return true;
    addFx(state, 'poof', unit.x, 0, unit.size * 1.2);
    return false;
  });

  state.enemyUnits = state.enemyUnits.filter((unit) => {
    if (unit.hp > 0) return true;
    state.score += unit.score;
    state.aura = clamp(state.aura + unit.bounty, 0, state.auraMax);
    state.enemiesDefeated += 1;
    if (unit.type === 'boss') state.bossesDefeated += 1;
    addFx(state, 'poof', unit.x, 0, unit.size * 1.2);
    audio.playEnemyDeath();
    return false;
  });
}

function updateFx(state, dt) {
  state.fx.forEach((fx) => {
    fx.progress += dt / 400;
  });
  state.fx = state.fx.filter((fx) => fx.progress < 1);
}

function updateCamera(state) {
  const playerFront = state.playerUnits.length ? Math.max(...state.playerUnits.map((unit) => unit.x)) : PLAYER_BASE_X + 12;
  const enemyFront = state.enemyUnits.length ? Math.min(...state.enemyUnits.map((unit) => unit.x)) : ENEMY_BASE_X - 12;
  const focus = clamp(((playerFront + enemyFront) / 2) - VIEWPORT_WIDTH / 2, 0, WORLD_WIDTH - VIEWPORT_WIDTH);
  state.cameraX += (focus - state.cameraX) * CAMERA_LERP;
}

export function tick(state, dt) {
  state.animFrame += dt / 16;
  state.aura = clamp(state.aura + auraRate(state.auraLevel) * (dt / 1000), 0, state.auraMax);

  if (state.mode === 'stage_clear') {
    state.modeTimer -= dt;
    updateFx(state, dt);
    updateCamera(state);
    if (state.modeTimer <= 0) {
      if (state.stage >= 10 && state.enemyBaseHp <= 0) {
        state.mode = 'game_over';
        state.outcome = 'win';
        state.victory = true;
        state.stageReached = 10;
        audio.playGameOverWin();
      } else {
        setupStage(state, state.stage + 1);
        state.mode = 'playing';
      }
    }
    return state;
  }

  if (state.mode !== 'playing') return state;

  updateCooldowns(state, dt);
  updateWaveSpawning(state, dt);
  updateUnits(state, dt, state.playerUnits, state.enemyUnits);
  updateProjectiles(state, dt);
  resolveDeaths(state);
  updateFx(state, dt);
  updateCamera(state);

  const waveCleared = !state.waveQueue.length && state.enemyUnits.length === 0;
  if (waveCleared && state.enemyBaseHp > 0) {
    if (state.wave < state.waveCount) {
      state.wave += 1;
      queueWave(state);
      state.waveDelayMs = -WAVE_GAP_MS;
    }
  }

  if (state.enemyBaseHp <= 0) {
    state.score += stageOutcomeScore(state.stage);
    state.mode = 'stage_clear';
    state.modeTimer = STAGE_CLEAR_MS;
    state.waveQueue = [];
    state.enemyUnits = [];
    state.projectiles = [];
    audio.playStageClear();
  } else if (state.playerBaseHp <= 0) {
    state.mode = 'game_over';
    state.outcome = 'loss';
    state.victory = false;
    state.stageReached = Math.max(state.stageReached, state.stage);
    audio.playGameOverLoss();
  }

  return state;
}

export default function usePetBattleGame() {
  const stateRef = useRef(createInitialState());
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const countdownRef = useRef(null);
  const onRenderRef = useRef(null);

  const renderNow = useCallback(() => {
    onRenderRef.current?.(stateRef.current);
  }, []);

  const loop = useCallback((time) => {
    if (lastTimeRef.current == null) lastTimeRef.current = time;
    const dt = Math.min(40, time - lastTimeRef.current);
    lastTimeRef.current = time;

    if (stateRef.current.mode === 'playing' || stateRef.current.mode === 'stage_clear') {
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(FIXED_DT, remaining);
        tick(stateRef.current, step);
        remaining -= step;
      }
      renderNow();
      if (stateRef.current.mode === 'game_over') {
        rafRef.current = null;
        return;
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [renderNow]);

  const startLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startGame = useCallback((character) => {
    stopLoop();
    clearCountdown();
    audio.startAudio();
    stateRef.current = { ...createInitialState(), character: character || 'dojocat', mode: 'countdown', countdownValue: 3 };
    renderNow();

    let count = 3;
    audio.playCountdown(count);
    countdownRef.current = setInterval(() => {
      count -= 1;
      stateRef.current.countdownValue = count;
      audio.playCountdown(count);
      renderNow();
      if (count <= 0) {
        clearCountdown();
        setupStage(stateRef.current, 1);
        stateRef.current.mode = 'playing';
        renderNow();
        startLoop();
      }
    }, 800);
  }, [clearCountdown, renderNow, startLoop, stopLoop]);

  const spawnUnit = useCallback((typeKey) => {
    const state = stateRef.current;
    if (state.mode !== 'playing') return false;
    const template = ARCHETYPES[typeKey];
    if (!template) return false;
    if (state.aura < template.cost) return false;
    if ((state.cooldowns[typeKey] || 0) > 0) return false;
    state.aura -= template.cost;
    state.cooldowns[typeKey] = template.cooldownMs;
    state.playerUnits.push(createPlayerUnit(state, typeKey));
    state.unitsSpawned += 1;
    audio.playSpawn();
    renderNow();
    return true;
  }, [renderNow]);

  const upgradeAura = useCallback(() => {
    const state = stateRef.current;
    if (state.mode !== 'playing') return false;
    if (state.auraLevel >= MAX_AURA_LEVEL) return false;
    const cost = upgradeCost(state.auraLevel);
    if (state.aura < cost) return false;
    state.aura -= cost;
    state.auraLevel += 1;
    audio.playAuraUpgrade();
    renderNow();
    return true;
  }, [renderNow]);

  const reset = useCallback(() => {
    stopLoop();
    clearCountdown();
    stateRef.current = createInitialState();
    renderNow();
  }, [clearCountdown, renderNow, stopLoop]);

  const getState = useCallback(() => stateRef.current, []);
  const setOnRender = useCallback((fn) => {
    onRenderRef.current = fn;
  }, []);

  useEffect(() => {
    return () => {
      stopLoop();
      clearCountdown();
    };
  }, [clearCountdown, stopLoop]);

  return useMemo(() => ({
    startGame,
    spawnUnit,
    upgradeAura,
    reset,
    getState,
    setOnRender,
    stopLoop,
  }), [startGame, spawnUnit, upgradeAura, reset, getState, setOnRender, stopLoop]);
}

import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as audio from './petBattleAudio';

export const VIEWPORT_WIDTH = 98;
export const WORLD_WIDTH = 240;
export const PLAYER_BASE_X = 14;
export const ENEMY_BASE_X = WORLD_WIDTH - 14;

const FIXED_DT = 1000 / 60;
const PLAYER_BASE_HP = 1000;
const AURA_BASE_MAX = 500;
const AURA_PER_LEVEL = 200;
const AURA_BASE_RATE = 14;
const MAX_AURA_LEVEL = 8;
const VET_KILLS_NEEDED = 3;
const VET_BONUS = 0.12;
const STAGE_CLEAR_MS = 1700;
const WAVE_GAP_MS = 700;
const PROJECTILE_SPEED = 44;
const CAMERA_LERP = 0.12;
const BASE_CONTACT_RANGE = 8;

export const ARCHETYPES = {
  meatshield: { key: 'meatshield', label: 'Frontliner', cost: 50, hp: 95, damage: 12, moveSpeed: 15.2, range: 8, cooldownMs: 1200, attackMs: 620, projectile: false, size: 8 },
  brawler: { key: 'brawler', label: 'Brawler', cost: 150, hp: 285, damage: 40, moveSpeed: 10.8, range: 10, cooldownMs: 2800, attackMs: 820, projectile: false, size: 10.5 },
  ranged: { key: 'ranged', label: 'Ranged', cost: 250, hp: 145, damage: 55, moveSpeed: 7.6, range: 34, cooldownMs: 4500, attackMs: 1050, projectile: true, size: 9.5 },
  tank: { key: 'tank', label: 'Tank', cost: 500, hp: 760, damage: 92, moveSpeed: 5.8, range: 14, cooldownMs: 8000, attackMs: 1320, projectile: false, aoe: 14, size: 14 },
};

export const PET_UNIT_NAMES = {
  dojocat: { meatshield: 'White Belt', brawler: 'Nunchuck', ranged: 'Shuriken', tank: 'Sensei' },
  pixiu: { meatshield: 'Mini Coin', brawler: 'Jade Claws', ranged: 'Fire Breath', tank: 'Giant Winged' },
  buu: { meatshield: 'Tiny Blob', brawler: 'Boxing Gloves', ranged: 'Candy Beam', tank: 'Muscle Buu' },
  devit: { meatshield: 'Imp', brawler: 'Pitchfork', ranged: 'Fireball', tank: 'Demon Lord' },
};

export const ENEMY_TYPES = {
  basic: { key: 'basic', hp: 60, damage: 8, moveSpeed: 11.6, range: 8, score: 10, bounty: 15, attackMs: 700, size: 8 },
  bruiser: { key: 'bruiser', hp: 200, damage: 25, moveSpeed: 8.1, range: 10, score: 25, bounty: 30, attackMs: 930, size: 10.5 },
  sniper: { key: 'sniper', hp: 80, damage: 45, moveSpeed: 5.4, range: 30, score: 30, bounty: 35, attackMs: 1220, projectile: true, size: 9.5 },
  tank: { key: 'tank', hp: 500, damage: 60, moveSpeed: 4.1, range: 13, score: 50, bounty: 50, attackMs: 1440, aoe: 13, size: 12.5 },
  boss: { key: 'boss', hp: 1500, damage: 100, moveSpeed: 2.8, range: 16, score: 200, bounty: 100, attackMs: 1680, aoe: 18, size: 16 },
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
    auraMax: AURA_BASE_MAX,
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
    stageElapsedMs: 0,
    lastStageBonus: null, // { speed, hp, waveSkip } for banner display
    battlefieldGround: 0,
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

// Par time per stage in ms — clearing faster than this earns a speed bonus
function stageParTime(stage) {
  return (30 + stage * 6) * 1000; // 36s for stage 1, up to 90s for stage 10
}

function stageOutcomeScore(stage) {
  return stage * 500;
}

function createPlayerUnit(state, typeKey) {
  const template = ARCHETYPES[typeKey];
  const names = PET_UNIT_NAMES[state.character] || PET_UNIT_NAMES.dojocat;
  const lane = state._nextId % 3;
  const spawnOffset = (state.unitsSpawned % 3) * 1.1;
  return {
    id: state._nextId++,
    team: 'player',
    type: typeKey,
    name: names[typeKey] || template.label,
    x: PLAYER_BASE_X + 10 + spawnOffset,
    hp: template.hp,
    maxHp: template.hp,
    damage: template.damage,
    moveSpeed: template.moveSpeed,
    range: template.range,
    attackMs: template.attackMs,
    attackTimer: template.attackMs * (0.18 + Math.random() * 0.52),
    cooldownMs: template.cooldownMs,
    projectile: template.projectile,
    aoe: template.aoe || 0,
    size: template.size,
    attackFlash: 0,
    renderLane: lane,
    animOffset: Math.random() * 36,
    kills: 0,
    veterancy: 0,
  };
}

function applyVeterancy(unit) {
  const template = ARCHETYPES[unit.type];
  if (!template) return;
  const mult = 1 + unit.veterancy * VET_BONUS;
  unit.maxHp = Math.round(template.hp * mult);
  unit.damage = Math.round(template.damage * mult);
  unit.hp = unit.maxHp;
}

function createEnemyUnit(state, typeKey) {
  const template = ENEMY_TYPES[typeKey];
  const scale = enemyScale(state.stage);
  const hp = Math.round(template.hp * scale);
  const lane = state._nextId % 3;
  return {
    id: state._nextId++,
    team: 'enemy',
    type: typeKey,
    x: ENEMY_BASE_X - 12 - (lane * 1.6),
    hp,
    maxHp: hp,
    damage: Math.round(template.damage * Math.min(2.2, 1 + (state.stage - 1) * 0.12)),
    moveSpeed: template.moveSpeed,
    range: template.range,
    attackMs: template.attackMs,
    attackTimer: template.attackMs * (0.16 + Math.random() * 0.48),
    projectile: template.projectile,
    aoe: template.aoe || 0,
    size: template.size,
    score: template.score,
    bounty: template.bounty,
    attackFlash: 0,
    renderLane: lane,
    animOffset: Math.random() * 36,
  };
}

export function generateWaveEnemies(stage, wave, globalWave) {
  const bossWave = globalWave % 5 === 0;
  if (bossWave) {
    return [{ delayMs: 500, type: 'boss' }];
  }

  const count = 5 + stage + wave;
  const pool = ['basic'];
  if (stage >= 2 || wave >= 2) pool.push('bruiser');
  if (stage >= 3) pool.push('sniper');
  if (stage >= 5) pool.push('tank');
  const enemies = [];
  for (let i = 0; i < count; i++) {
    let type = pool[Math.floor(Math.random() * pool.length)];
    if (i === count - 1 && stage >= 4 && wave === getWaveCount(stage)) type = 'tank';
    enemies.push({
      delayMs: 300 + i * Math.max(150, 420 - stage * 18),
      type,
    });
  }
  return enemies;
}

function getCombatGap(attacker, target) {
  const bodyGap = ((attacker.size || 8) + (target.size || 8)) * 0.42;
  return Math.abs(attacker.x - target.x) - bodyGap;
}

function findClosestTarget(attacker, targets) {
  let best = null;
  let bestDistance = Infinity;
  targets.forEach((target) => {
    if (target.hp <= 0) return;
    const distance = getCombatGap(attacker, target);
    if (distance < -1.2 || distance > attacker.range) return;
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  });
  return best;
}

function resolveOverlaps(units) {
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      const minGap = ((a.size || 8) + (b.size || 8)) * 0.065;
      const dist = Math.abs(a.x - b.x);
      if (dist < minGap) {
        const push = (minGap - dist) * 0.5;
        if (a.x < b.x) { a.x -= push; b.x += push; }
        else { a.x += push; b.x -= push; }
      }
    }
  }
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
  state.stageElapsedMs = 0;
  state.lastStageBonus = null;
  // Reset surviving player units back to player base for the new stage, fully healed
  state.playerUnits.forEach((unit, i) => {
    unit.x = PLAYER_BASE_X + 10 + (i % 3) * 1.2;
    unit.hp = unit.maxHp;
    unit.attackTimer = unit.attackMs * 0.4;
    unit.attackFlash = 0;
  });
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
    addFx(state, 'slash', attacker.team === 'player' ? ENEMY_BASE_X - 4 : PLAYER_BASE_X + 4, 0, 8);
    return;
  }

  target.hp -= attacker.damage;
  addFx(state, 'slash', target.x, 0, target.size || 8);
  addFx(state, 'impact', target.x, 0, 5);
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

  // Find the current frontline positions so melee units can push past ranged
  const enemyFront = enemyUnits.length ? Math.min(...enemyUnits.map(u => u.x)) : ENEMY_BASE_X;

  playerUnits.forEach((unit) => {
    unit.attackTimer = Math.max(0, unit.attackTimer - dt);
    unit.attackFlash = Math.max(0, unit.attackFlash - dt);
    const target = findClosestTarget(unit, enemyUnits);
    const canHitBase = state.enemyBaseHp > 0 && ENEMY_BASE_X - unit.x <= Math.max(BASE_CONTACT_RANGE, unit.range);

    if (target) {
      // In range of a target — attack it
      if (unit.attackTimer <= 0) attackUnit(state, unit, target, false);
    } else if (canHitBase) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, null, true);
    } else {
      // No target in range — always move forward to engage
      unit.x = Math.min(ENEMY_BASE_X - 4, unit.x + unit.moveSpeed * dtSec);
    }
  });
  resolveOverlaps(playerUnits);

  const playerFront = playerUnits.length ? Math.max(...playerUnits.map(u => u.x)) : PLAYER_BASE_X;

  enemyUnits.forEach((unit) => {
    unit.attackTimer = Math.max(0, unit.attackTimer - dt);
    unit.attackFlash = Math.max(0, unit.attackFlash - dt);
    const target = findClosestTarget(unit, playerUnits);
    const canHitBase = state.playerBaseHp > 0 && unit.x - PLAYER_BASE_X <= Math.max(BASE_CONTACT_RANGE, unit.range);

    if (target) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, target, false);
    } else if (canHitBase) {
      if (unit.attackTimer <= 0) attackUnit(state, unit, null, true);
    } else {
      unit.x = Math.max(PLAYER_BASE_X + 4, unit.x - unit.moveSpeed * dtSec);
    }
  });
  resolveOverlaps(enemyUnits);
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

  // Track which player unit was closest to each dying enemy (the "killer")
  const deadEnemies = state.enemyUnits.filter(u => u.hp <= 0);

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

  // Award veterancy to the closest player unit for each kill
  deadEnemies.forEach((enemy) => {
    let closest = null;
    let closestDist = Infinity;
    state.playerUnits.forEach((unit) => {
      const dist = Math.abs(unit.x - enemy.x);
      if (dist < closestDist) { closest = unit; closestDist = dist; }
    });
    if (closest) {
      closest.kills = (closest.kills || 0) + 1;
      if (closest.kills >= VET_KILLS_NEEDED * (closest.veterancy + 1)) {
        closest.veterancy += 1;
        applyVeterancy(closest);
      }
    }
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
  const fightCenter = state.enemyUnits.length
    ? (playerFront + enemyFront) * 0.5
    : Math.min(ENEMY_BASE_X - 8, playerFront + VIEWPORT_WIDTH * 0.2);
  const focus = clamp(fightCenter - VIEWPORT_WIDTH * 0.5, 0, WORLD_WIDTH - VIEWPORT_WIDTH);
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

  state.stageElapsedMs += dt;
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
    const stg = state.stage;
    // Base clear score (unchanged)
    const baseScore = stageOutcomeScore(stg);

    // Speed bonus — clearing under par time earns up to stage×400 extra
    const par = stageParTime(stg);
    const speedRatio = Math.max(0, 1 - state.stageElapsedMs / par);
    const speedBonus = Math.round(stg * 400 * speedRatio);

    // Base HP bonus — keeping your castle healthy earns up to stage×150
    const hpRatio = state.playerBaseHp / Math.max(1, state.playerBaseMaxHp);
    const hpBonus = Math.round(stg * 150 * hpRatio);

    // Wave skip bonus — credit for waves that never spawned (efficient clear)
    const wavesSkipped = Math.max(0, state.waveCount - state.wave);
    const waveSkipBonus = wavesSkipped * stg * 80;

    const totalBonus = baseScore + speedBonus + hpBonus + waveSkipBonus;
    state.score += totalBonus;
    state.lastStageBonus = { base: baseScore, speed: speedBonus, hp: hpBonus, waveSkip: waveSkipBonus };

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
    state.auraMax = AURA_BASE_MAX + state.auraLevel * AURA_PER_LEVEL;
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

/**
 * Pet Invaders Game State Machine
 * Space Invaders-style arcade shooter — pet auto-fires, player controls left/right
 *
 * Modes: idle → countdown → playing → game_over → results
 * Survival waves, boss every 5th wave, escalating difficulty.
 */

import { useCallback, useRef, useEffect, useMemo } from 'react';
import * as audio from './petInvadersAudio';

// ─── Constants ───────────────────────────────────────
const PLAYER_SPEED = 0.5;        // normalized units per second
const PLAYER_WIDTH = 0.08;       // normalized width
const AUTO_FIRE_BASE_MS = 400;   // ms between shots
const PROJECTILE_SPEED = 0.8;    // normalized units per second (upward)
const ENEMY_PROJECTILE_SPEED = 0.3;
const BOSS_PROJECTILE_SPEED = 0.25;
const INITIAL_LIVES = 3;
const INVULN_MS = 1500;          // invulnerability after hit
const POWERUP_DURATION = 8000;   // ms
const POWERUP_HYBRID_DUR = 5000;
const WAVE_PAUSE_MS = 2000;      // pause between waves
const BOSS_WARNING_MS = 2500;    // boss warning duration
const BOSS_WAVE_INTERVAL = 5;    // boss every N waves
const ENEMY_SIZE = 0.04;         // normalized size
const BOSS_SIZE = 0.10;
const HIT_RADIUS = 0.025;       // collision radius
const BOSS_HIT_RADIUS = 0.045;
const PLAYER_HIT_RADIUS = 0.03;
const POWERUP_COLLECT_RADIUS = 0.035;
const POWERUP_DROP_CHANCE = 0.15;

// Enemy roster
const FODDER_TYPES = [
  { type: 'jelly', hp: 1, speed: 0.06, score: 10, pattern: 'straight' },
  { type: 'bat', hp: 1, speed: 0.09, score: 15, pattern: 'zigzag' },
  { type: 'robot', hp: 2, speed: 0.05, score: 20, pattern: 'straight' },
  { type: 'cloud', hp: 1, speed: 0.04, score: 10, pattern: 'sway' },
  { type: 'slime', hp: 2, speed: 0.03, score: 20, pattern: 'bounce' },
  { type: 'star', hp: 1, speed: 0.12, score: 25, pattern: 'diagonal' },
];

// Boss roster (filter by player's character)
const ALL_BOSSES = ['labubu', 'buu', 'dojocat', 'pixiu', 'vegetacat'];
const BOSS_HP_BASE = 20;
const BOSS_SCORE = 200;
const POWERUP_TYPES = ['spread', 'rate', 'damage', 'hybrid'];

// ─── Initial state ───────────────────────────────────
function createInitialState() {
  return {
    mode: 'idle',              // idle | countdown | playing | wave_clear | boss_warning | game_over | results
    countdownValue: 3,

    // Player
    playerX: 0.5,              // normalized 0-1
    playerLives: INITIAL_LIVES,
    playerInvuln: 0,           // ms remaining
    playerFiring: false,
    moveDir: 0,                // -1 left, 0 none, 1 right
    keysDown: {},

    // Combat
    projectiles: [],           // [{id, x, y, type:'player'|'enemy'|'boss', dx, dy}]
    autoFireTimer: 0,
    fireRateMs: AUTO_FIRE_BASE_MS,

    // Enemies
    enemies: [],               // [{id, x, y, type, hp, maxHp, speed, score, pattern, spawnTime, animFrame}]
    bosses: [],                // [{id, x, y, type, hp, maxHp, phase, phaseTimer, attackTimer, moveDir, animFrame}]

    // Power-ups
    powerUps: [],              // [{id, x, y, type, animFrame}]
    activeBuffs: [],           // [{type, remaining, duration}]

    // Wave
    wave: 1,
    enemiesRemaining: 0,
    waveTimer: 0,              // ms into current wave
    spawnQueue: [],            // enemies left to spawn
    spawnTimer: 0,
    wavePauseTimer: 0,
    bossWarningTimer: 0,

    // Stats
    score: 0,
    kills: 0,
    bossesDefeated: 0,
    bestWave: 1,

    // FX
    explosions: [],            // [{x, y, progress, size, color}]
    damageFlash: 0,            // progress 0-1
    waveBanner: null,          // {text, progress}
    bossWarning: null,         // {type, progress}

    // Rendering
    animFrame: 0,
    scrollOffset: 0,

    // Character (set on start)
    character: 'dojocat',

    // Internal
    _nextId: 1,
  };
}

// ─── Wave generation ─────────────────────────────────
function generateWaveEnemies(wave) {
  const isBossWave = wave % BOSS_WAVE_INTERVAL === 0;
  if (isBossWave) return []; // Boss wave has no fodder spawns

  const count = Math.min(4 + wave * 2, 30);
  const enemies = [];
  // Pick enemy types based on wave
  const availableTypes = FODDER_TYPES.slice(0, Math.min(2 + Math.floor(wave / 2), FODDER_TYPES.length));

  for (let i = 0; i < count; i++) {
    const template = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    const hpScale = 1 + Math.floor(wave / 6);
    enemies.push({
      type: template.type,
      hp: template.hp * hpScale,
      maxHp: template.hp * hpScale,
      speed: template.speed * (1 + wave * 0.03),
      score: template.score + wave * 2,
      pattern: template.pattern,
      spawnDelay: i * (600 - Math.min(wave * 20, 400)),
    });
  }
  return enemies;
}

function pickBoss(character) {
  const available = ALL_BOSSES.filter(b => b !== character);
  return available[Math.floor(Math.random() * available.length)];
}

function spawnBoss(state) {
  const bossType = pickBoss(state.character);
  const hpScale = 1 + Math.floor((state.wave - 5) / 5);
  const boss = {
    id: state._nextId,
    x: 0.5,
    y: 0.12,
    type: bossType,
    hp: BOSS_HP_BASE * hpScale,
    maxHp: BOSS_HP_BASE * hpScale,
    phase: 'enter',
    phaseTimer: 0,
    attackTimer: 2000,
    moveDir: 1,
    animFrame: 0,
  };
  return {
    ...state,
    _nextId: state._nextId + 1,
    bosses: [...state.bosses, boss],
    enemiesRemaining: 1,
  };
}

// ─── Core tick ───────────────────────────────────────
function tick(state, dt) {
  if (state.mode !== 'playing' && state.mode !== 'wave_clear' && state.mode !== 'boss_warning') return state;

  let s = { ...state };
  s.animFrame += dt / 16;
  s.scrollOffset += dt * 0.02;

  // ─── Wave clear pause ───
  if (s.mode === 'wave_clear') {
    s.wavePauseTimer -= dt;
    if (s.waveBanner) {
      s.waveBanner = { ...s.waveBanner, progress: s.waveBanner.progress + dt / WAVE_PAUSE_MS };
    }
    if (s.wavePauseTimer <= 0) {
      s.wave++;
      if (s.wave > s.bestWave) s.bestWave = s.wave;
      const isBossWave = s.wave % BOSS_WAVE_INTERVAL === 0;
      if (isBossWave) {
        s.mode = 'boss_warning';
        s.bossWarningTimer = BOSS_WARNING_MS;
        s.bossWarning = { type: pickBoss(s.character), progress: 0 };
        audio.playBossWarning();
      } else {
        s = startWave(s);
      }
    }
    // Still update player movement during pause
    s = updatePlayerMovement(s, dt);
    s = updateFX(s, dt);
    return s;
  }

  // ─── Boss warning ───
  if (s.mode === 'boss_warning') {
    s.bossWarningTimer -= dt;
    if (s.bossWarning) {
      s.bossWarning = { ...s.bossWarning, progress: 1 - s.bossWarningTimer / BOSS_WARNING_MS };
    }
    if (s.bossWarningTimer <= 0) {
      s.bossWarning = null;
      s = spawnBoss(s);
      s.mode = 'playing';
    }
    s = updatePlayerMovement(s, dt);
    s = updateFX(s, dt);
    return s;
  }

  // ─── Playing ───
  s = updatePlayerMovement(s, dt);
  s = updateAutoFire(s, dt);
  s = updateProjectiles(s, dt);
  s = updateEnemies(s, dt);
  s = updateBosses(s, dt);
  s = updatePowerUps(s, dt);
  s = updateBuffs(s, dt);
  s = checkCollisions(s);
  s = updateSpawning(s, dt);
  s = updateInvulnerability(s, dt);
  s = updateFX(s, dt);

  // Check wave complete
  if (s.enemiesRemaining <= 0 && s.spawnQueue.length === 0 && s.enemies.length === 0 && s.bosses.length === 0) {
    s.mode = 'wave_clear';
    s.wavePauseTimer = WAVE_PAUSE_MS;
    s.waveBanner = { text: `WAVE ${s.wave} CLEAR!`, progress: 0 };
    audio.playWaveClear();
  }

  return s;
}

function startWave(s) {
  const queue = generateWaveEnemies(s.wave);
  s.spawnQueue = queue;
  s.enemiesRemaining = queue.length;
  s.spawnTimer = 0;
  s.waveTimer = 0;
  s.mode = 'playing';
  s.waveBanner = { text: `WAVE ${s.wave}`, progress: 0 };
  return s;
}

// ─── Sub-update functions ────────────────────────────

function updatePlayerMovement(s, dt) {
  const dir = (s.keysDown['ArrowRight'] || s.keysDown['d'] ? 1 : 0) -
              (s.keysDown['ArrowLeft'] || s.keysDown['a'] ? 1 : 0);
  s.moveDir = dir || s.moveDir; // keep touchDir if no keys
  if (s.moveDir !== 0) {
    s.playerX += s.moveDir * PLAYER_SPEED * (dt / 1000);
    s.playerX = Math.max(PLAYER_WIDTH / 2, Math.min(1 - PLAYER_WIDTH / 2, s.playerX));
  }
  return s;
}

function updateAutoFire(s, dt) {
  const rateMultiplier = s.activeBuffs.some(b => b.type === 'rate' || b.type === 'hybrid') ? 0.5 : 1;
  const effectiveRate = s.fireRateMs * rateMultiplier;
  s.autoFireTimer += dt;
  if (s.autoFireTimer >= effectiveRate) {
    s.autoFireTimer -= effectiveRate;
    s.playerFiring = true;
    const hasSpread = s.activeBuffs.some(b => b.type === 'spread' || b.type === 'hybrid');
    const dmgLevel = s.activeBuffs.some(b => b.type === 'damage' || b.type === 'hybrid') ? 2 : 0;

    if (hasSpread) {
      // 3-shot spread
      s.projectiles = [
        ...s.projectiles,
        { id: s._nextId, x: s.playerX, y: 0.85, type: 'player', dx: 0, dy: -PROJECTILE_SPEED, power: dmgLevel },
        { id: s._nextId + 1, x: s.playerX - 0.02, y: 0.85, type: 'player', dx: -PROJECTILE_SPEED * 0.15, dy: -PROJECTILE_SPEED, power: dmgLevel },
        { id: s._nextId + 2, x: s.playerX + 0.02, y: 0.85, type: 'player', dx: PROJECTILE_SPEED * 0.15, dy: -PROJECTILE_SPEED, power: dmgLevel },
      ];
      s._nextId += 3;
      audio.playSpreadShoot();
    } else {
      s.projectiles = [...s.projectiles, {
        id: s._nextId, x: s.playerX, y: 0.85, type: 'player', dx: 0, dy: -PROJECTILE_SPEED, power: dmgLevel,
      }];
      s._nextId++;
      audio.playShoot();
    }
  } else {
    if (s.autoFireTimer > effectiveRate * 0.1) s.playerFiring = false;
  }
  return s;
}

function updateProjectiles(s, dt) {
  const dtSec = dt / 1000;
  s.projectiles = s.projectiles
    .map(p => ({
      ...p,
      x: p.x + (p.dx || 0) * dtSec,
      y: p.y + p.dy * dtSec,
    }))
    .filter(p => p.y > -0.05 && p.y < 1.1 && p.x > -0.1 && p.x < 1.1);
  return s;
}

function updateEnemies(s, dt) {
  const dtSec = dt / 1000;
  s.enemies = s.enemies.map(e => {
    let { x, y, speed, pattern, spawnTime, animFrame: af } = e;
    af += dt / 16;
    y += speed * dtSec;

    switch (pattern) {
      case 'zigzag':
        x += Math.sin(af * 0.08) * speed * dtSec * 2;
        break;
      case 'sway':
        x += Math.sin(af * 0.04) * speed * dtSec * 1.5;
        break;
      case 'diagonal':
        x += (e.diagDir || 1) * speed * dtSec * 0.5;
        if (x < 0.05 || x > 0.95) e = { ...e, diagDir: -(e.diagDir || 1) };
        break;
      case 'bounce':
        x += Math.sin(af * 0.06) * speed * dtSec;
        break;
      default: break;
    }

    x = Math.max(0.05, Math.min(0.95, x));

    // Enemy shooting (rare)
    if (Math.random() < 0.0005 * (1 + s.wave * 0.1)) {
      s.projectiles = [...s.projectiles, {
        id: s._nextId++,
        x, y: y + ENEMY_SIZE,
        type: 'enemy',
        dx: 0,
        dy: ENEMY_PROJECTILE_SPEED,
        power: 0,
      }];
    }

    return { ...e, x, y, animFrame: af };
  }).filter(e => {
    if (e.y > 1.1) {
      // Enemy escaped off bottom — no penalty, just remove
      s.enemiesRemaining = Math.max(0, s.enemiesRemaining - 1);
      return false;
    }
    return true;
  });
  return s;
}

function updateBosses(s, dt) {
  const dtSec = dt / 1000;
  s.bosses = s.bosses.map(boss => {
    let b = { ...boss };
    b.animFrame += dt / 16;
    b.phaseTimer += dt;

    // Enter phase — slide down
    if (b.phase === 'enter') {
      b.y = Math.min(0.15, b.y + 0.1 * dtSec);
      if (b.y >= 0.15) {
        b.phase = 'attack';
        b.phaseTimer = 0;
      }
      return b;
    }

    // Movement — sweep left/right
    b.x += b.moveDir * 0.08 * dtSec;
    if (b.x > 0.85) { b.moveDir = -1; b.x = 0.85; }
    if (b.x < 0.15) { b.moveDir = 1; b.x = 0.15; }

    // Attack — shoot periodically
    b.attackTimer -= dt;
    if (b.attackTimer <= 0) {
      const attackRate = Math.max(800, 2000 - s.wave * 50);
      b.attackTimer = attackRate;

      // Boss attack patterns
      const patterns = [
        // Single aimed shot
        () => {
          const dx = (s.playerX - b.x) * 0.3;
          s.projectiles = [...s.projectiles, {
            id: s._nextId++, x: b.x, y: b.y + BOSS_SIZE * 0.5,
            type: 'boss', dx, dy: BOSS_PROJECTILE_SPEED, power: 0,
          }];
        },
        // Spread burst
        () => {
          for (let i = -2; i <= 2; i++) {
            s.projectiles = [...s.projectiles, {
              id: s._nextId++, x: b.x, y: b.y + BOSS_SIZE * 0.5,
              type: 'boss', dx: i * 0.06, dy: BOSS_PROJECTILE_SPEED * 0.8, power: 0,
            }];
          }
        },
        // Ring burst
        () => {
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            s.projectiles = [...s.projectiles, {
              id: s._nextId++, x: b.x, y: b.y,
              type: 'boss', dx: Math.cos(angle) * 0.15, dy: Math.sin(angle) * 0.15 + 0.05, power: 0,
            }];
          }
        },
      ];

      const patternIdx = Math.floor(Math.random() * patterns.length);
      patterns[patternIdx]();
    }

    // Spawn minions occasionally
    if (b.phaseTimer > 5000 && Math.random() < 0.001) {
      const template = FODDER_TYPES[Math.floor(Math.random() * 3)];
      s.enemies = [...s.enemies, {
        id: s._nextId++,
        x: b.x + (Math.random() - 0.5) * 0.3,
        y: b.y + 0.05,
        type: template.type,
        hp: template.hp, maxHp: template.hp,
        speed: template.speed * 1.5,
        score: template.score,
        pattern: template.pattern,
        spawnTime: 0,
        animFrame: 0,
        diagDir: Math.random() > 0.5 ? 1 : -1,
      }];
    }

    return b;
  });
  return s;
}

function updatePowerUps(s, dt) {
  const dtSec = dt / 1000;
  s.powerUps = s.powerUps
    .map(p => ({ ...p, y: p.y + 0.04 * dtSec, animFrame: (p.animFrame || 0) + dt / 16 }))
    .filter(p => p.y < 1.1);
  return s;
}

function updateBuffs(s, dt) {
  s.activeBuffs = s.activeBuffs
    .map(b => ({ ...b, remaining: b.remaining - dt }))
    .filter(b => b.remaining > 0);
  return s;
}

function updateSpawning(s, dt) {
  if (s.spawnQueue.length === 0) return s;
  s.waveTimer += dt;
  s.spawnTimer += dt;

  const nextEnemy = s.spawnQueue[0];
  if (nextEnemy && s.waveTimer >= (nextEnemy.spawnDelay || 0)) {
    const x = 0.1 + Math.random() * 0.8;
    const enemy = {
      id: s._nextId++,
      x,
      y: -0.05,
      type: nextEnemy.type,
      hp: nextEnemy.hp,
      maxHp: nextEnemy.maxHp,
      speed: nextEnemy.speed,
      score: nextEnemy.score,
      pattern: nextEnemy.pattern,
      spawnTime: s.waveTimer,
      animFrame: 0,
      diagDir: Math.random() > 0.5 ? 1 : -1,
    };
    s.enemies = [...s.enemies, enemy];
    s.spawnQueue = s.spawnQueue.slice(1);
  }
  return s;
}

function updateInvulnerability(s, dt) {
  if (s.playerInvuln > 0) {
    s.playerInvuln = Math.max(0, s.playerInvuln - dt);
  }
  return s;
}

function updateFX(s, dt) {
  const fxDt = dt / 500;
  s.explosions = s.explosions.map(e => ({ ...e, progress: e.progress + fxDt })).filter(e => e.progress < 1);
  if (s.damageFlash > 0) {
    s.damageFlash = Math.min(1, s.damageFlash + fxDt * 2);
    if (s.damageFlash >= 1) s.damageFlash = 0;
  }
  if (s.waveBanner) {
    s.waveBanner = { ...s.waveBanner, progress: Math.min(1, s.waveBanner.progress + fxDt * 0.5) };
    if (s.waveBanner.progress >= 1) s.waveBanner = null;
  }
  return s;
}

// ─── Collision detection ─────────────────────────────
function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function checkCollisions(s) {
  const playerProjs = s.projectiles.filter(p => p.type === 'player');
  const enemyProjs = s.projectiles.filter(p => p.type === 'enemy' || p.type === 'boss');
  let hitProjIds = new Set();
  let destroyedEnemyIds = new Set();
  let destroyedBossIds = new Set();

  // Player projectiles vs enemies
  for (const proj of playerProjs) {
    for (const enemy of s.enemies) {
      if (destroyedEnemyIds.has(enemy.id) || hitProjIds.has(proj.id)) continue;
      if (dist(proj, enemy) < HIT_RADIUS + ENEMY_SIZE * 0.5) {
        hitProjIds.add(proj.id);
        const dmg = 1 + (proj.power || 0);
        const newHp = enemy.hp - dmg;
        if (newHp <= 0) {
          destroyedEnemyIds.add(enemy.id);
          s.score += enemy.score;
          s.kills++;
          s.enemiesRemaining = Math.max(0, s.enemiesRemaining - 1);
          s.explosions = [...s.explosions, { x: enemy.x, y: enemy.y, progress: 0, size: 20, color: null }];
          audio.playEnemyDestroy();

          // Power-up drop
          if (Math.random() < POWERUP_DROP_CHANCE) {
            const puType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
            s.powerUps = [...s.powerUps, { id: s._nextId++, x: enemy.x, y: enemy.y, type: puType, animFrame: 0 }];
          }
        } else {
          // Update enemy HP
          s.enemies = s.enemies.map(e => e.id === enemy.id ? { ...e, hp: newHp } : e);
          audio.playEnemyHit();
        }
      }
    }

    // Player projectiles vs bosses
    for (const boss of s.bosses) {
      if (destroyedBossIds.has(boss.id) || hitProjIds.has(proj.id)) continue;
      if (dist(proj, boss) < BOSS_HIT_RADIUS + 0.02) {
        hitProjIds.add(proj.id);
        const dmg = 1 + (proj.power || 0);
        const newHp = boss.hp - dmg;
        if (newHp <= 0) {
          destroyedBossIds.add(boss.id);
          s.score += BOSS_SCORE + s.wave * 20;
          s.bossesDefeated++;
          s.kills++;
          s.enemiesRemaining = Math.max(0, s.enemiesRemaining - 1);
          s.explosions = [...s.explosions,
            { x: boss.x, y: boss.y, progress: 0, size: 50, color: 'rgba(255,200,50,0.5)' },
            { x: boss.x - 0.05, y: boss.y + 0.02, progress: 0.1, size: 30, color: null },
            { x: boss.x + 0.05, y: boss.y - 0.02, progress: 0.15, size: 35, color: null },
          ];
          audio.playBossDefeat();

          // Boss always drops hybrid power-up
          s.powerUps = [...s.powerUps, { id: s._nextId++, x: boss.x, y: boss.y, type: 'hybrid', animFrame: 0 }];
        } else {
          s.bosses = s.bosses.map(b => b.id === boss.id ? { ...b, hp: newHp } : b);
          audio.playBossHit();
        }
      }
    }
  }

  // Enemy/boss projectiles vs player
  if (s.playerInvuln <= 0) {
    for (const proj of enemyProjs) {
      if (hitProjIds.has(proj.id)) continue;
      if (dist(proj, { x: s.playerX, y: 0.88 }) < PLAYER_HIT_RADIUS) {
        hitProjIds.add(proj.id);
        s.playerLives--;
        s.playerInvuln = INVULN_MS;
        s.damageFlash = 0.01;
        audio.playPlayerHit();

        if (s.playerLives <= 0) {
          s.mode = 'game_over';
          s.playerLives = 0;
          audio.playPlayerDeath();
          audio.stopMusic();
          setTimeout(() => audio.playGameOver(), 500);
          return s;
        }
      }
    }

    // Enemy body collision with player
    for (const enemy of s.enemies) {
      if (destroyedEnemyIds.has(enemy.id)) continue;
      if (dist(enemy, { x: s.playerX, y: 0.88 }) < PLAYER_HIT_RADIUS + ENEMY_SIZE * 0.3) {
        destroyedEnemyIds.add(enemy.id);
        s.enemiesRemaining = Math.max(0, s.enemiesRemaining - 1);
        s.playerLives--;
        s.playerInvuln = INVULN_MS;
        s.damageFlash = 0.01;
        s.explosions = [...s.explosions, { x: enemy.x, y: enemy.y, progress: 0, size: 15, color: null }];
        audio.playPlayerHit();

        if (s.playerLives <= 0) {
          s.mode = 'game_over';
          s.playerLives = 0;
          audio.playPlayerDeath();
          audio.stopMusic();
          setTimeout(() => audio.playGameOver(), 500);
          return s;
        }
      }
    }
  }

  // Power-up collection
  let collectedPUIds = new Set();
  for (const pu of s.powerUps) {
    if (dist(pu, { x: s.playerX, y: 0.88 }) < POWERUP_COLLECT_RADIUS) {
      collectedPUIds.add(pu.id);
      const dur = pu.type === 'hybrid' ? POWERUP_HYBRID_DUR : POWERUP_DURATION;
      // Replace existing buff of same type, or add new
      s.activeBuffs = [...s.activeBuffs.filter(b => b.type !== pu.type), { type: pu.type, remaining: dur, duration: dur }];
      audio.playPowerUp();
    }
  }

  // Remove hit/destroyed entities
  s.projectiles = s.projectiles.filter(p => !hitProjIds.has(p.id));
  s.enemies = s.enemies.filter(e => !destroyedEnemyIds.has(e.id));
  s.bosses = s.bosses.filter(b => !destroyedBossIds.has(b.id));
  s.powerUps = s.powerUps.filter(p => !collectedPUIds.has(p.id));

  return s;
}

// ─── Hook ────────────────────────────────────────────
export default function usePetInvadersGame() {
  const stateRef = useRef(createInitialState());
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const onRenderRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Expose test hooks
  useEffect(() => {
    window.invaders_advanceTime = (ms) => {
      stateRef.current = tick(stateRef.current, ms);
      return stateRef.current;
    };
    window.invaders_render_game_to_text = () => {
      const s = stateRef.current;
      return JSON.stringify({
        mode: s.mode,
        wave: s.wave,
        score: s.score,
        kills: s.kills,
        bossesDefeated: s.bossesDefeated,
        playerX: s.playerX.toFixed(3),
        playerLives: s.playerLives,
        enemyCount: s.enemies.length,
        bossCount: s.bosses.length,
        projectileCount: s.projectiles.length,
        powerUpCount: s.powerUps.length,
        activeBuffs: s.activeBuffs.map(b => ({ type: b.type, remaining: Math.round(b.remaining) })),
        enemiesRemaining: s.enemiesRemaining,
        spawnQueueLength: s.spawnQueue.length,
      }, null, 2);
    };
    return () => { delete window.invaders_advanceTime; delete window.invaders_render_game_to_text; };
  }, []);

  // Animation loop
  const loop = useCallback((timestamp) => {
    if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
    const dt = Math.min(timestamp - lastTimeRef.current, 50);
    lastTimeRef.current = timestamp;

    const mode = stateRef.current.mode;
    if (mode === 'playing' || mode === 'wave_clear' || mode === 'boss_warning') {
      stateRef.current = tick(stateRef.current, dt);
    }
    onRenderRef.current?.(stateRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const startGame = useCallback((character) => {
    stopLoop();
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    audio.startAudio();
    stateRef.current = { ...createInitialState(), mode: 'countdown', countdownValue: 3, character: character || 'dojocat' };

    let count = 3;
    audio.playCountdown(count);
    onRenderRef.current?.(stateRef.current);

    countdownTimerRef.current = setInterval(() => {
      count--;
      stateRef.current = { ...stateRef.current, countdownValue: count };
      audio.playCountdown(count);
      onRenderRef.current?.(stateRef.current);

      if (count <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        let s = { ...stateRef.current, mode: 'playing' };
        s = startWave(s);
        stateRef.current = s;
        onRenderRef.current?.(stateRef.current);
        audio.startMusic();
        startLoop();
      }
    }, 800);
  }, [startLoop, stopLoop]);

  const setMoveDir = useCallback((dir) => {
    stateRef.current = { ...stateRef.current, moveDir: dir };
  }, []);

  const setKeyDown = useCallback((key, down) => {
    stateRef.current = {
      ...stateRef.current,
      keysDown: { ...stateRef.current.keysDown, [key]: down },
    };
  }, []);

  const reset = useCallback(() => {
    stopLoop();
    audio.stopMusic();
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    stateRef.current = createInitialState();
    onRenderRef.current?.(stateRef.current);
  }, [stopLoop]);

  const getState = useCallback(() => stateRef.current, []);
  const setOnRender = useCallback((fn) => { onRenderRef.current = fn; }, []);

  useEffect(() => {
    return () => { stopLoop(); audio.stopMusic(); if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); };
  }, [stopLoop]);

  return useMemo(() => ({
    startGame,
    setMoveDir,
    setKeyDown,
    reset,
    getState,
    setOnRender,
    stopLoop,
  }), [startGame, setMoveDir, setKeyDown, reset, getState, setOnRender, stopLoop]);
}

// Export for testing
export { createInitialState, tick, generateWaveEnemies, FODDER_TYPES, ALL_BOSSES };

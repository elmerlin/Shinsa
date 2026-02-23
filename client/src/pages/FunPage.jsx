import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getFunLeaderboard, submitFunScore } from '../utils/api';

const GAME_WIDTH = 420;
const GAME_HEIGHT = 700;
const CAMERA_LINE = 250;
const FRAME_MS = 1000 / 60;
const MAX_PLATFORMS = 18;
const BEST_SCORE_KEY = 'fun_city_jump_best_score_v1';
const GAME_TITLE = 'TOP CITY JUMP';
const SCORE_DIFFICULTY_CAP = 100000;
const DEVIT_TOUCH_PADDING = 8;
const DEVIT_START_PLATFORM_LAG = 3;
const DEVIT_JUMP_COOLDOWN_FRAMES = 5;
const DEVIT_GRAVITY_SCALE = 1;
const DEVIT_MAX_PATH_QUEUE = 2500;
const BGM_TRACKS = [
  '/fun-assets/audio/Pixel%20Paws%20Pursuit.mp3',
  '/fun-assets/audio/Pixel%20Paws.mp3',
  '/fun-assets/audio/Devit%20Pursuit.mp3',
  '/fun-assets/audio/Devil%20Hop.mp3',
];
const BACKGROUND_TRANSITION_WINDOW = 2600;
const BACKGROUND_TIERS = [
  {
    id: 'ground',
    name: 'Ground Level',
    minScore: 0,
    maxScore: 10000,
    backgroundPath: '/fun-assets/backgrounds/Ground.png',
    sky: { top: '#7ed2ff', mid: '#bce9ff', bottom: '#ffe1a1' },
    celestial: {
      mode: 'sun',
      x: 0.82,
      y: 0.16,
      radius: 24,
      color: 'rgba(255, 222, 120, 0.96)',
      glow: 'rgba(255, 236, 182, 0.46)',
    },
    weather: {
      clouds: 0.24,
      wisps: 0.05,
      rain: 0,
      snow: 0,
      storm: 0,
      stars: 0,
      aurora: 0,
      stardust: 0.02,
      breeze: 0.28,
    },
    imageLayers: [
      { parallax: 0.024, height: 0.64, yOffset: 80, alpha: 0.2 },
      { parallax: 0.056, height: 0.78, yOffset: 114, alpha: 0.3 },
      { parallax: 0.104, height: 0.92, yOffset: 152, alpha: 0.4 },
    ],
    cityLayers: [
      {
        baseY: GAME_HEIGHT - 74,
        parallax: 0.06,
        minWidth: 30,
        maxWidth: 62,
        minHeight: 54,
        maxHeight: 154,
        gap: 8,
        fill: '#6d9dcd',
        stroke: 'rgba(55, 91, 131, 0.65)',
        windowColor: 'rgba(207, 231, 255, 0.16)',
        seed: 0.3,
        detail: false,
      },
      {
        baseY: GAME_HEIGHT - 67,
        parallax: 0.12,
        minWidth: 34,
        maxWidth: 74,
        minHeight: 82,
        maxHeight: 208,
        gap: 9,
        fill: '#4f7cad',
        stroke: 'rgba(36, 63, 94, 0.66)',
        windowColor: 'rgba(213, 236, 255, 0.2)',
        seed: 1.2,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 60,
        parallax: 0.2,
        minWidth: 38,
        maxWidth: 88,
        minHeight: 112,
        maxHeight: 258,
        gap: 12,
        fill: '#385d84',
        stroke: 'rgba(20, 39, 61, 0.82)',
        windowColor: 'rgba(211, 234, 255, 0.2)',
        seed: 2.4,
        detail: true,
      },
    ],
    streetAlpha: 1,
    carsAlpha: 1,
    detailMode: 'ground',
    cloudDeck: 0,
  },
  {
    id: 'metropolis',
    name: 'The Metropolis',
    minScore: 10001,
    maxScore: 30000,
    backgroundPath: '/fun-assets/backgrounds/Metropolis.png',
    sky: { top: '#74b8f0', mid: '#f0d1a6', bottom: '#d79e64' },
    celestial: {
      mode: 'sun',
      x: 0.76,
      y: 0.2,
      radius: 21,
      color: 'rgba(255, 195, 104, 0.94)',
      glow: 'rgba(255, 200, 128, 0.4)',
    },
    weather: {
      clouds: 0.46,
      wisps: 0.4,
      rain: 0,
      snow: 0,
      storm: 0,
      stars: 0,
      aurora: 0,
      stardust: 0.02,
      breeze: 0.2,
    },
    imageLayers: [
      { parallax: 0.03, height: 0.7, yOffset: 70, alpha: 0.24 },
      { parallax: 0.068, height: 0.82, yOffset: 102, alpha: 0.34 },
      { parallax: 0.116, height: 0.94, yOffset: 136, alpha: 0.44 },
    ],
    cityLayers: [
      {
        baseY: GAME_HEIGHT - 80,
        parallax: 0.05,
        minWidth: 34,
        maxWidth: 78,
        minHeight: 96,
        maxHeight: 238,
        gap: 10,
        fill: '#59789f',
        stroke: 'rgba(52, 70, 95, 0.7)',
        windowColor: 'rgba(250, 220, 162, 0.2)',
        seed: 3.1,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 70,
        parallax: 0.108,
        minWidth: 40,
        maxWidth: 92,
        minHeight: 122,
        maxHeight: 286,
        gap: 11,
        fill: '#426387',
        stroke: 'rgba(32, 49, 70, 0.78)',
        windowColor: 'rgba(255, 226, 170, 0.26)',
        seed: 3.8,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 64,
        parallax: 0.18,
        minWidth: 44,
        maxWidth: 106,
        minHeight: 154,
        maxHeight: 334,
        gap: 12,
        fill: '#334d6b',
        stroke: 'rgba(20, 33, 49, 0.84)',
        windowColor: 'rgba(255, 219, 162, 0.3)',
        seed: 4.5,
        detail: true,
      },
    ],
    streetAlpha: 0.58,
    carsAlpha: 0.55,
    detailMode: 'metropolis',
    cloudDeck: 0.06,
  },
  {
    id: 'skyline',
    name: 'The Skyline',
    minScore: 30001,
    maxScore: 60000,
    backgroundPath: '/fun-assets/backgrounds/Skyline.png',
    sky: { top: '#482f6d', mid: '#a6577d', bottom: '#ff995c' },
    celestial: {
      mode: 'sunset',
      x: 0.74,
      y: 0.22,
      radius: 19,
      color: 'rgba(255, 156, 109, 0.9)',
      glow: 'rgba(255, 145, 110, 0.34)',
    },
    weather: {
      clouds: 0.38,
      wisps: 0.28,
      rain: 0.32,
      snow: 0,
      storm: 0,
      stars: 0.14,
      aurora: 0,
      stardust: 0.04,
      breeze: 0.13,
    },
    imageLayers: [
      { parallax: 0.032, height: 0.74, yOffset: 56, alpha: 0.25 },
      { parallax: 0.074, height: 0.87, yOffset: 92, alpha: 0.36 },
      { parallax: 0.13, height: 1.0, yOffset: 126, alpha: 0.5 },
    ],
    cityLayers: [
      {
        baseY: GAME_HEIGHT - 92,
        parallax: 0.046,
        minWidth: 36,
        maxWidth: 84,
        minHeight: 136,
        maxHeight: 288,
        gap: 10,
        fill: '#503b6f',
        stroke: 'rgba(39, 28, 58, 0.72)',
        windowColor: 'rgba(227, 169, 255, 0.22)',
        seed: 5.2,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 84,
        parallax: 0.096,
        minWidth: 44,
        maxWidth: 104,
        minHeight: 180,
        maxHeight: 356,
        gap: 12,
        fill: '#382953',
        stroke: 'rgba(26, 18, 39, 0.8)',
        windowColor: 'rgba(115, 240, 255, 0.22)',
        seed: 5.8,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 78,
        parallax: 0.162,
        minWidth: 52,
        maxWidth: 118,
        minHeight: 212,
        maxHeight: 418,
        gap: 12,
        fill: '#291c40',
        stroke: 'rgba(18, 12, 31, 0.88)',
        windowColor: 'rgba(255, 157, 223, 0.24)',
        seed: 6.3,
        detail: true,
      },
    ],
    streetAlpha: 0.22,
    carsAlpha: 0,
    detailMode: 'skyline',
    cloudDeck: 0.14,
  },
  {
    id: 'stratosphere',
    name: 'The Stratosphere',
    minScore: 60001,
    maxScore: 100000,
    backgroundPath: '/fun-assets/backgrounds/Stratosphere.png',
    sky: { top: '#040c1d', mid: '#112343', bottom: '#1f3e66' },
    celestial: {
      mode: 'moon',
      x: 0.18,
      y: 0.18,
      radius: 20,
      color: 'rgba(221, 233, 255, 0.95)',
      glow: 'rgba(178, 206, 255, 0.3)',
    },
    weather: {
      clouds: 0.28,
      wisps: 0.16,
      rain: 0.74,
      snow: 0,
      storm: 0.86,
      stars: 0.42,
      aurora: 0.06,
      stardust: 0.08,
      breeze: 0.08,
    },
    imageLayers: [
      { parallax: 0.034, height: 0.78, yOffset: 50, alpha: 0.22 },
      { parallax: 0.08, height: 0.9, yOffset: 86, alpha: 0.3 },
      { parallax: 0.146, height: 1.04, yOffset: 120, alpha: 0.42 },
    ],
    cityLayers: [
      {
        baseY: GAME_HEIGHT - 120,
        parallax: 0.04,
        minWidth: 44,
        maxWidth: 98,
        minHeight: 196,
        maxHeight: 378,
        gap: 12,
        fill: '#243955',
        stroke: 'rgba(16, 25, 39, 0.8)',
        windowColor: 'rgba(156, 214, 255, 0.24)',
        seed: 7.2,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 110,
        parallax: 0.088,
        minWidth: 52,
        maxWidth: 122,
        minHeight: 246,
        maxHeight: 470,
        gap: 13,
        fill: '#182942',
        stroke: 'rgba(10, 17, 28, 0.86)',
        windowColor: 'rgba(184, 224, 255, 0.28)',
        seed: 7.9,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 102,
        parallax: 0.15,
        minWidth: 62,
        maxWidth: 132,
        minHeight: 284,
        maxHeight: 548,
        gap: 14,
        fill: '#101d32',
        stroke: 'rgba(6, 10, 19, 0.9)',
        windowColor: 'rgba(168, 246, 255, 0.24)',
        seed: 8.6,
        detail: true,
      },
    ],
    streetAlpha: 0,
    carsAlpha: 0,
    detailMode: 'stratosphere',
    cloudDeck: 0.32,
  },
  {
    id: 'orbit',
    name: 'Low Orbit',
    minScore: 100001,
    maxScore: Number.POSITIVE_INFINITY,
    backgroundPath: '/fun-assets/backgrounds/Orbit.png',
    sky: { top: '#030510', mid: '#10244f', bottom: '#385f8d' },
    celestial: {
      mode: 'night',
      x: 0.14,
      y: 0.16,
      radius: 16,
      color: 'rgba(214, 230, 255, 0.85)',
      glow: 'rgba(152, 209, 255, 0.24)',
    },
    weather: {
      clouds: 0.08,
      wisps: 0.12,
      rain: 0,
      snow: 0.4,
      storm: 0,
      stars: 0.76,
      aurora: 0.7,
      stardust: 0.82,
      breeze: 0.05,
    },
    imageLayers: [
      { parallax: 0.022, height: 0.74, yOffset: 44, alpha: 0.22 },
      { parallax: 0.054, height: 0.88, yOffset: 74, alpha: 0.3 },
      { parallax: 0.11, height: 1.02, yOffset: 110, alpha: 0.4 },
    ],
    cityLayers: [
      {
        baseY: GAME_HEIGHT - 166,
        parallax: 0.034,
        minWidth: 40,
        maxWidth: 90,
        minHeight: 82,
        maxHeight: 206,
        gap: 14,
        fill: '#233858',
        stroke: 'rgba(15, 23, 39, 0.84)',
        windowColor: 'rgba(170, 246, 255, 0.3)',
        seed: 9.4,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 152,
        parallax: 0.078,
        minWidth: 48,
        maxWidth: 104,
        minHeight: 94,
        maxHeight: 244,
        gap: 15,
        fill: '#182b47',
        stroke: 'rgba(10, 16, 27, 0.9)',
        windowColor: 'rgba(161, 255, 255, 0.34)',
        seed: 10.1,
        detail: true,
      },
      {
        baseY: GAME_HEIGHT - 140,
        parallax: 0.13,
        minWidth: 52,
        maxWidth: 112,
        minHeight: 110,
        maxHeight: 274,
        gap: 15,
        fill: '#111f35',
        stroke: 'rgba(5, 10, 17, 0.92)',
        windowColor: 'rgba(164, 255, 255, 0.33)',
        seed: 10.8,
        detail: true,
      },
    ],
    streetAlpha: 0,
    carsAlpha: 0,
    detailMode: 'orbit',
    cloudDeck: 0.42,
  },
];

const PLAYABLE_CHARACTER = {
  id: 'cat',
  name: 'Dojo Cat',
  description: 'The Dojo Mascot',
  cardClass: 'from-amber-500 to-orange-500',
};

const CHARACTER_STATS = {
  width: 52,
  height: 58,
  accel: 0.5,
  maxSpeed: 5.9,
  gravity: 0.236,
  jumpVelocity: -8.9,
};

const CAT_SPRITE_SHEET = {
  path: '/fun-assets/dojo-cat.png',
  columns: 4,
  rows: 4,
  scale: 1.74,
  yOffset: -10,
  previewFrame: 12,
  idleFrames: [12, 13, 14, 15],
  moveFrames: [0, 1, 2, 3],
  riseFrames: [5, 6, 7],
  apexFrame: 10,
  fallFrames: [8, 9, 10, 11],
};

const DEVIT_SPRITE_SHEET = {
  path: '/fun-assets/characters/devit-sprite.png',
  columns: 4,
  rows: 4,
  scale: 1.74,
  yOffset: -10,
  moveFrames: [0, 1, 2, 3],
  riseFrames: [5, 6, 7],
  fallFrames: [8, 9, 10, 11],
  idleFrames: [12, 13, 14, 15],
  apexFrame: 10,
};

const PREVIEW_LOOP_FRAMES = [12, 13, 14, 15, 0, 1, 2, 3, 5, 6, 7, 10, 9, 8];
const PREVIEW_LOOP_FRAME_MS = 95;

const NOTES = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);
const getDifficultyProgress = (score) => clamp((score || 0) / SCORE_DIFFICULTY_CAP, 0, 1);

function resolveBackgroundState(score) {
  const altitudeScore = Math.max(0, Number(score) || 0);
  let currentIndex = 0;
  for (let i = BACKGROUND_TIERS.length - 1; i >= 0; i -= 1) {
    if (altitudeScore >= BACKGROUND_TIERS[i].minScore) {
      currentIndex = i;
      break;
    }
  }

  const currentTier = BACKGROUND_TIERS[currentIndex];
  const nextTier = BACKGROUND_TIERS[currentIndex + 1] || currentTier;
  if (currentTier === nextTier) {
    return {
      currentTier,
      nextTier,
      currentIndex,
      nextIndex: currentIndex,
      blend: 0,
    };
  }

  const tierRange = Math.max(1, nextTier.minScore - currentTier.minScore);
  const transitionWindow = clamp(
    currentTier.transitionWindow || BACKGROUND_TRANSITION_WINDOW,
    1,
    tierRange,
  );
  const transitionStart = nextTier.minScore - transitionWindow;
  const blend = altitudeScore >= transitionStart
    ? clamp((altitudeScore - transitionStart) / transitionWindow, 0, 1)
    : 0;

  return {
    currentTier,
    nextTier,
    currentIndex,
    nextIndex: currentIndex + 1,
    blend,
  };
}

function entitiesOverlap(a, b, padding = 0) {
  const leftA = a.x + padding;
  const rightA = a.x + a.width - padding;
  const topA = a.y + padding;
  const bottomA = a.y + a.height - padding;
  const leftB = b.x + padding;
  const rightB = b.x + b.width - padding;
  const topB = b.y + padding;
  const bottomB = b.y + b.height - padding;
  return rightA >= leftB && leftA <= rightB && bottomA >= topB && topA <= bottomB;
}

function hashNoise(index, salt = 0) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

let platformIdCounter = 1;

const SAFE_PATH_MARGIN = 10;

function createWindNoiseBuffer(audioContext, durationSeconds = 2.5) {
  const frameCount = Math.floor(audioContext.sampleRate * durationSeconds);
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * 0.46;
  }
  return buffer;
}

function selectPlatformType(score) {
  const progress = getDifficultyProgress(score);
  const roll = Math.random();
  if (roll < 0.76 - progress * 0.12) return 'normal';
  if (roll < 0.9) return 'moving';
  if (roll < 0.96) return 'break';
  return 'boost';
}

function createPlatform(y, score, options = {}) {
  const width = options.width ?? randomBetween(76, 122);
  const type = options.type ?? selectPlatformType(score);
  const x = clamp(
    options.x ?? randomBetween(8, GAME_WIDTH - width - 8),
    5,
    GAME_WIDTH - width - 5,
  );
  return {
    id: platformIdCounter++,
    x,
    y,
    width,
    type,
    velocityX: type === 'moving' ? randomBetween(0.8, 1.7) * (Math.random() < 0.5 ? -1 : 1) : 0,
    broken: false,
    brokenTimer: 0,
    path: Boolean(options.path),
  };
}

function createSafePathPlatform(previousPlatform, score) {
  const difficulty = getDifficultyProgress(score);
  const minGap = 52 + difficulty * 24;
  const maxGap = 80 + difficulty * 38;
  const gap = randomBetween(minGap, maxGap);
  const y = previousPlatform.y - gap;
  const width = randomBetween(108 - difficulty * 40, 142 - difficulty * 48);
  const previousCenter = previousPlatform.x + previousPlatform.width * 0.5;
  const gapWeight = (gap - minGap) / Math.max(1, maxGap - minGap);
  const maxShift = clamp((72 + difficulty * 62) - gapWeight * 18, 56, 146);
  const center = clamp(
    previousCenter + randomBetween(-maxShift, maxShift),
    SAFE_PATH_MARGIN + width * 0.5,
    GAME_WIDTH - SAFE_PATH_MARGIN - width * 0.5,
  );
  const boostChance = 0.04 + difficulty * 0.08;
  const type = Math.random() < boostChance ? 'boost' : 'normal';

  return createPlatform(y, score, {
    x: center - width * 0.5,
    width,
    type,
    path: true,
  });
}

function pickCompanionCount(score) {
  const progress = getDifficultyProgress(score);
  const onePlatformChance = 0.58 + progress * 0.2;
  const twoPlatformChance = 0.94 + progress * 0.03;
  const roll = Math.random();
  if (roll < onePlatformChance) return 0; // total platforms in jump: 1
  if (roll < twoPlatformChance) return 1; // total platforms in jump: 2
  return 2; // total platforms in jump: 3
}

function overlapsHorizontally(a, b, padding = 18) {
  return a.x < b.x + b.width + padding && a.x + a.width > b.x - padding;
}

function createCompanionPlatform(pathPlatform, score, existingCompanions = []) {
  const difficulty = getDifficultyProgress(score);
  const pathCenter = pathPlatform.x + pathPlatform.width * 0.5;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const y = pathPlatform.y + randomBetween(6, 24 + difficulty * 10);
    const width = randomBetween(74 - difficulty * 22, 108 - difficulty * 26);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const offset = randomBetween(80 + difficulty * 30, 152 + difficulty * 54) * direction + randomBetween(-18, 18);
    const center = clamp(
      pathCenter + offset,
      SAFE_PATH_MARGIN + width * 0.5,
      GAME_WIDTH - SAFE_PATH_MARGIN - width * 0.5,
    );
    const candidate = createPlatform(y, score, { x: center - width * 0.5, width });
    if (score < 900 && candidate.type === 'break') {
      candidate.type = 'normal';
    }
    if (overlapsHorizontally(candidate, pathPlatform, 16)) continue;
    if (existingCompanions.some((platform) => overlapsHorizontally(candidate, platform, 16))) continue;
    return candidate;
  }
  return null;
}

function getTopPathPlatform(platforms) {
  let topPath = null;
  for (const platform of platforms) {
    if (platform.path && (!topPath || platform.y < topPath.y)) {
      topPath = platform;
    }
  }
  if (topPath) return topPath;
  let topAny = null;
  for (const platform of platforms) {
    if (!topAny || platform.y < topAny.y) {
      topAny = platform;
    }
  }
  return topAny;
}

function fillReachablePlatforms(platforms, score) {
  let topPath = getTopPathPlatform(platforms);
  if (!topPath) return;

  while (topPath.y > -84 && platforms.length < MAX_PLATFORMS) {
    const nextPath = createSafePathPlatform(topPath, score);
    platforms.push(nextPath);
    topPath = nextPath;
    if (platforms.length >= MAX_PLATFORMS) break;

    const companionCount = pickCompanionCount(score);
    const companions = [];
    for (let i = 0; i < companionCount && platforms.length < MAX_PLATFORMS; i += 1) {
      const companion = createCompanionPlatform(nextPath, score, companions);
      if (!companion) continue;
      companions.push(companion);
      platforms.push(companion);
    }
  }
}

function createPathStepFromPlatform(platform) {
  return {
    platformId: platform.id,
    x: platform.x + platform.width * 0.5,
    y: platform.y,
    width: platform.width,
  };
}

function sortPathPlatformsByHeight(platforms) {
  return platforms
    .filter((platform) => platform.path && !platform.broken)
    .sort((a, b) => b.y - a.y);
}

function createClouds() {
  const clouds = [];
  for (let i = 0; i < 14; i += 1) {
    clouds.push({
      x: randomBetween(-40, GAME_WIDTH + 40),
      y: randomBetween(-GAME_HEIGHT, GAME_HEIGHT),
      scale: randomBetween(0.6, 1.35),
      speed: randomBetween(0.08, 0.35),
    });
  }
  return clouds;
}

function createCars() {
  return [
    {
      x: -120,
      y: GAME_HEIGHT - 66,
      width: 86,
      height: 26,
      speed: 1.55,
      color: '#273449',
    },
    {
      x: GAME_WIDTH + 50,
      y: GAME_HEIGHT - 49,
      width: 64,
      height: 20,
      speed: -1.1,
      color: '#3b4f6f',
    },
  ];
}

function createInitialGame(bestScore) {
  const stats = CHARACTER_STATS;
  const player = {
    x: GAME_WIDTH * 0.5 - stats.width * 0.5,
    y: GAME_HEIGHT - 120,
    width: stats.width,
    height: stats.height,
    vx: 0,
    vy: -6,
    facing: 1,
    squash: 0,
  };

  const platforms = [];
  platforms.push({
    id: platformIdCounter++,
    x: GAME_WIDTH * 0.5 - 64,
    y: GAME_HEIGHT - 34,
    width: 128,
    type: 'normal',
    velocityX: 0,
    broken: false,
    brokenTimer: 0,
    path: true,
  });

  let topPath = platforms[0];
  for (let i = 0; i < 3 && platforms.length < MAX_PLATFORMS; i += 1) {
    const pathPlatform = createSafePathPlatform(topPath, 0);
    pathPlatform.type = 'normal';
    platforms.push(pathPlatform);
    topPath = pathPlatform;
  }
  fillReachablePlatforms(platforms, 0);

  const pathPlatforms = sortPathPlatformsByHeight(platforms);
  const devitStartPlatform = pathPlatforms[0] || platforms[0];
  const initialPathQueue = [];
  for (let i = 1; i <= DEVIT_START_PLATFORM_LAG && i < pathPlatforms.length; i += 1) {
    initialPathQueue.push(createPathStepFromPlatform(pathPlatforms[i]));
  }

  const devitCenterX = devitStartPlatform
    ? devitStartPlatform.x + devitStartPlatform.width * 0.5
    : player.x + player.width * 0.5;
  const devitStandY = devitStartPlatform
    ? devitStartPlatform.y - stats.height
    : player.y + 140;

  const devit = {
    active: true,
    x: devitCenterX - stats.width * 0.5,
    y: devitStandY,
    width: stats.width,
    height: stats.height,
    vx: 0,
    vy: 0,
    facing: 1,
    squash: 0,
    jumping: false,
    jumpCooldown: DEVIT_JUMP_COOLDOWN_FRAMES,
    currentPlatformId: devitStartPlatform?.id || null,
  };

  return {
    characterId: PLAYABLE_CHARACTER.id,
    stats,
    player,
    devit,
    playerPathQueue: initialPathQueue,
    playerLastLandedPlatformId: null,
    jumpCount: 0,
    platforms,
    clouds: createClouds(),
    cars: createCars(),
    score: 0,
    distance: 0,
    bestScore,
    time: 0,
    bounceFlash: 0,
  };
}

function enqueuePlayerPathStep(game, platform) {
  if (!platform) return;
  if (platform.id === game.playerLastLandedPlatformId) return;
  game.playerLastLandedPlatformId = platform.id;
  if (game.playerPathQueue.some((step) => step.platformId === platform.id)) return;
  game.playerPathQueue.push(createPathStepFromPlatform(platform));
  if (game.playerPathQueue.length > DEVIT_MAX_PATH_QUEUE) {
    game.playerPathQueue.splice(0, game.playerPathQueue.length - DEVIT_MAX_PATH_QUEUE);
  }
}

function getPathTargetRect(step) {
  if (!step) return null;
  return {
    x: step.x,
    y: step.y,
    width: step.width,
    platformId: step.platformId,
  };
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCloud(ctx, x, y, scale, opacity = 0.9, fillColor = '#f4f9ff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.ellipse(0, 8, 22, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(-16, 10, 12, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(17, 11, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCityLayer(ctx, options) {
  const {
    baseY,
    score,
    parallax,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    gap,
    fill,
    stroke,
    seed,
    detail = false,
    windowColor = 'rgba(203, 228, 255, 0.16)',
  } = options;
  const scroll = (score * parallax) % (maxWidth + gap);
  let x = -maxWidth - scroll;
  let index = 0;

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;

  while (x < GAME_WIDTH + maxWidth) {
    const width = minWidth + hashNoise(index, seed) * (maxWidth - minWidth);
    const height = minHeight + hashNoise(index + 13, seed + 0.4) * (maxHeight - minHeight);
    const y = baseY - height;
    drawRoundedRect(ctx, x, y, width, height, 2);
    ctx.fill();
    ctx.stroke();

    if (detail && height > 60) {
      ctx.fillStyle = windowColor;
      for (let winY = y + 10; winY < baseY - 10; winY += 14) {
        for (let winX = x + 8; winX < x + width - 8; winX += 11) {
          if (hashNoise(winX + winY, 0.91) > 0.52) {
            ctx.fillRect(winX, winY, 4, 6);
          }
        }
      }
      ctx.fillStyle = fill;
    }

    x += width + gap;
    index += 1;
  }
}

function drawCars(ctx, cars, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const car of cars) {
    ctx.fillStyle = car.color;
    drawRoundedRect(ctx, car.x, car.y, car.width, car.height, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(155, 181, 215, 0.35)';
    drawRoundedRect(ctx, car.x + 10, car.y + 3, car.width - 22, car.height - 10, 5);
    ctx.fill();
    ctx.fillStyle = '#121d2c';
    ctx.beginPath();
    ctx.arc(car.x + 17, car.y + car.height + 3, 6, 0, Math.PI * 2);
    ctx.arc(car.x + car.width - 17, car.y + car.height + 3, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParallaxBackdropImage(ctx, image, score, layer) {
  if (!image || !image.naturalWidth || !image.naturalHeight) return;
  const drawHeight = GAME_HEIGHT * layer.height;
  const drawWidth = Math.max(GAME_WIDTH + 40, drawHeight * (image.naturalWidth / image.naturalHeight));
  const gap = 26;
  const wrapWidth = drawWidth + gap;
  const scroll = (score * layer.parallax) % wrapWidth;
  let x = -scroll - gap * 0.5;
  const y = GAME_HEIGHT - drawHeight + layer.yOffset;

  ctx.save();
  ctx.globalAlpha = layer.alpha;
  while (x < GAME_WIDTH + drawWidth) {
    ctx.drawImage(image, x, y, drawWidth, drawHeight);
    x += wrapWidth;
  }
  ctx.restore();
}

function drawCelestialBody(ctx, celestial) {
  if (!celestial) return;
  const cx = GAME_WIDTH * celestial.x;
  const cy = GAME_HEIGHT * celestial.y;
  const radius = celestial.radius;

  const glow = ctx.createRadialGradient(cx, cy, radius * 0.45, cx, cy, radius * 2.7);
  glow.addColorStop(0, celestial.glow);
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 2.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = celestial.color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawStars(ctx, time, intensity) {
  if (intensity <= 0) return;
  const starCount = Math.floor(26 + intensity * 102);
  for (let i = 0; i < starCount; i += 1) {
    const baseX = hashNoise(i, 4.13) * GAME_WIDTH;
    const baseY = hashNoise(i, 7.61) * (GAME_HEIGHT * 0.72);
    const twinkle = 0.45 + 0.55 * Math.sin(time * 0.022 + i * 1.37);
    const radius = 0.6 + hashNoise(i, 2.9) * (1.55 + intensity * 0.9);
    ctx.fillStyle = `rgba(226, 238, 255, ${Math.max(0, 0.22 + twinkle * 0.5) * intensity})`;
    ctx.beginPath();
    ctx.arc(baseX, baseY, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAurora(ctx, time, intensity) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let band = 0; band < 3; band += 1) {
    const baseY = 122 + band * 34;
    const amplitude = 20 + band * 8;
    ctx.beginPath();
    ctx.moveTo(-40, baseY);
    for (let x = -40; x <= GAME_WIDTH + 40; x += 36) {
      const wave = Math.sin(x * 0.02 + time * 0.006 + band * 1.6) * amplitude;
      ctx.lineTo(x, baseY + wave);
    }
    ctx.lineTo(GAME_WIDTH + 40, baseY + 150);
    ctx.lineTo(-40, baseY + 150);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - 46, 0, baseY + 142);
    g.addColorStop(0, `rgba(138, 250, 220, ${0.22 * intensity})`);
    g.addColorStop(0.45, `rgba(118, 162, 255, ${0.18 * intensity})`);
    g.addColorStop(1, 'rgba(100, 255, 211, 0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

function drawWindStreaks(ctx, time, strength) {
  if (strength <= 0) return;
  const streaks = Math.floor(6 + strength * 14);
  ctx.save();
  ctx.strokeStyle = `rgba(233, 247, 255, ${0.08 + strength * 0.18})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < streaks; i += 1) {
    const y = hashNoise(i, 12.2) * (GAME_HEIGHT * 0.64);
    const width = 26 + hashNoise(i, 10.1) * 52;
    const speed = 0.065 + hashNoise(i, 8.7) * 0.08;
    const x = ((time * speed + hashNoise(i, 7.2)) % 1.2) * (GAME_WIDTH + 80) - 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y - width * 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRain(ctx, time, intensity) {
  if (intensity <= 0) return;
  const count = Math.floor(34 + intensity * 152);
  const heavy = intensity > 0.58;
  const length = heavy ? 18 : 13;
  const drift = heavy ? 0.34 : 0.24;
  const speed = heavy ? 0.006 : 0.0046;

  ctx.save();
  ctx.strokeStyle = heavy
    ? `rgba(176, 204, 255, ${0.26 + intensity * 0.4})`
    : `rgba(182, 210, 255, ${0.18 + intensity * 0.3})`;
  ctx.lineWidth = heavy ? 1.25 : 1;
  for (let i = 0; i < count; i += 1) {
    const baseX = hashNoise(i, 22.3);
    const baseY = hashNoise(i, 27.9);
    const wobble = Math.sin(time * 0.028 + i * 0.51) * 4.8;
    const x = baseX * (GAME_WIDTH + 70) - 35 + wobble;
    const y = ((baseY + time * speed) % 1.16) * (GAME_HEIGHT + 120) - 80;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - length * drift, y + length);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnowAndStardust(ctx, time, snowIntensity, stardustIntensity) {
  const total = Math.max(0, snowIntensity) + Math.max(0, stardustIntensity);
  if (total <= 0) return;
  const count = Math.floor(26 + snowIntensity * 70 + stardustIntensity * 86);
  for (let i = 0; i < count; i += 1) {
    const baseX = hashNoise(i, 33.1);
    const baseY = hashNoise(i, 35.4);
    const drift = Math.sin(time * 0.016 + i * 1.9) * (4 + stardustIntensity * 7);
    const x = baseX * GAME_WIDTH + drift;
    const y = ((baseY + time * (0.0012 + snowIntensity * 0.0018 + stardustIntensity * 0.0013)) % 1.24) * (GAME_HEIGHT + 120) - 80;
    const radius = 0.9 + hashNoise(i, 38.7) * (1.8 + stardustIntensity * 1.4);
    const sparkle = 0.45 + 0.55 * Math.sin(time * 0.03 + i * 0.73);
    const alpha = (0.15 + sparkle * 0.4) * (0.5 * snowIntensity + 0.7 * stardustIntensity + 0.15);
    ctx.fillStyle = `rgba(225, 240, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCloudDeck(ctx, opacity = 0) {
  if (opacity <= 0) return;
  const deckY = GAME_HEIGHT * 0.54;
  const g = ctx.createLinearGradient(0, deckY - 120, 0, GAME_HEIGHT);
  g.addColorStop(0, `rgba(223, 237, 255, ${0.03 + opacity * 0.08})`);
  g.addColorStop(0.56, `rgba(228, 240, 255, ${0.15 + opacity * 0.16})`);
  g.addColorStop(1, `rgba(239, 248, 255, ${0.24 + opacity * 0.2})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, deckY - 120, GAME_WIDTH, GAME_HEIGHT - deckY + 120);
}

function drawTierDetails(ctx, tier, game) {
  switch (tier.detailMode) {
    case 'ground': {
      ctx.fillStyle = 'rgba(84, 136, 90, 0.42)';
      ctx.fillRect(0, GAME_HEIGHT - 102, GAME_WIDTH, 26);
      for (let i = 0; i < 6; i += 1) {
        const x = i * 80 - ((game.score * 0.05) % 80) - 20;
        ctx.fillStyle = 'rgba(204, 172, 140, 0.45)';
        drawRoundedRect(ctx, x, GAME_HEIGHT - 132, 42, 34, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(82, 133, 86, 0.55)';
        ctx.beginPath();
        ctx.arc(x + 8, GAME_HEIGHT - 108, 8, 0, Math.PI * 2);
        ctx.arc(x + 16, GAME_HEIGHT - 112, 9, 0, Math.PI * 2);
        ctx.arc(x + 24, GAME_HEIGHT - 108, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'metropolis': {
      ctx.strokeStyle = 'rgba(55, 62, 78, 0.52)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const x = i * 146 - ((game.score * 0.06) % 146) + 40;
        const y = GAME_HEIGHT - 228 - (i % 2) * 42;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 84);
        ctx.moveTo(x, y + 14);
        ctx.lineTo(x + 56, y - 6);
        ctx.moveTo(x + 54, y - 6);
        ctx.lineTo(x + 54, y + 18);
        ctx.stroke();
      }
      break;
    }
    case 'skyline': {
      for (let i = 0; i < 4; i += 1) {
        const x = i * 118 - ((game.score * 0.12) % 118) + 24;
        const y = GAME_HEIGHT - 280 - (i % 2) * 36;
        drawRoundedRect(ctx, x, y, 34, 16, 3);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(106, 237, 255, 0.42)' : 'rgba(255, 117, 209, 0.4)';
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(122, 95, 132, 0.22)';
      for (let i = 0; i < 3; i += 1) {
        const x = 90 + i * 140 - ((game.score * 0.05) % 140);
        ctx.beginPath();
        ctx.ellipse(x, GAME_HEIGHT - 108, 58, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stratosphere': {
      for (let i = 0; i < 2; i += 1) {
        const x = ((game.time * (0.22 + i * 0.08) + i * 160 + game.score * 0.03) % (GAME_WIDTH + 220)) - 110;
        const y = 110 + i * 76;
        ctx.fillStyle = 'rgba(186, 203, 236, 0.34)';
        ctx.beginPath();
        ctx.ellipse(x, y, 44, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(121, 154, 214, 0.35)';
        ctx.fillRect(x - 8, y - 10, 16, 8);
      }
      for (let i = 0; i < 3; i += 1) {
        const x = ((game.time * (0.4 + i * 0.09) + i * 128 + game.score * 0.04) % (GAME_WIDTH + 170)) - 85;
        const y = 220 + i * 42;
        ctx.fillStyle = 'rgba(151, 212, 255, 0.4)';
        drawRoundedRect(ctx, x, y, 22, 8, 3);
        ctx.fill();
      }
      break;
    }
    case 'orbit': {
      const earthY = GAME_HEIGHT + 280;
      ctx.fillStyle = 'rgba(55, 112, 168, 0.42)';
      ctx.beginPath();
      ctx.arc(GAME_WIDTH * 0.5, earthY, 420, Math.PI * 1.07, Math.PI * 1.93);
      ctx.lineTo(GAME_WIDTH, GAME_HEIGHT);
      ctx.lineTo(0, GAME_HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(153, 220, 255, 0.3)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(GAME_WIDTH * 0.52, GAME_HEIGHT - 140);
      ctx.lineTo(GAME_WIDTH * 0.525, 42);
      ctx.stroke();
      for (let i = 0; i < 4; i += 1) {
        const x = ((game.time * (0.18 + i * 0.07) + i * 126) % (GAME_WIDTH + 100)) - 50;
        const y = 128 + i * 66;
        ctx.fillStyle = 'rgba(204, 236, 255, 0.5)';
        drawRoundedRect(ctx, x, y, 18, 8, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(144, 220, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 8, y + 4);
        ctx.lineTo(x + 26, y + 4);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

function drawCloudAndBreezeLayer(ctx, game, weather) {
  if (!weather) return;
  if (weather.clouds > 0) {
    for (const cloud of game.clouds) {
      const tint = weather.storm > 0.3 ? '#d3deef' : '#f4f9ff';
      drawCloud(ctx, cloud.x, cloud.y, cloud.scale, weather.clouds * (0.42 + cloud.scale * 0.18), tint);
    }
  }
  if (weather.wisps > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(236, 245, 255, ${0.1 + weather.wisps * 0.2})`;
    for (let i = 0; i < 6; i += 1) {
      const x = ((game.time * (0.32 + i * 0.09) + i * 90) % (GAME_WIDTH + 180)) - 90;
      const y = 70 + i * 52 + Math.sin(game.time * 0.01 + i) * 8;
      ctx.beginPath();
      ctx.ellipse(x, y, 56, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (weather.breeze > 0) {
    drawWindStreaks(ctx, game.time, weather.breeze);
  }
}

function drawFrontWeatherLayer(ctx, game, weather) {
  if (!weather) return;
  if (weather.rain > 0) {
    drawRain(ctx, game.time + game.score * 0.02, weather.rain);
  }
  if (weather.snow > 0 || weather.stardust > 0) {
    drawSnowAndStardust(ctx, game.time + game.score * 0.01, weather.snow, weather.stardust);
  }
  if (weather.storm > 0) {
    const flashA = Math.max(0, Math.sin(game.time * 0.046 + 0.4) - 0.905) * 8.3;
    const flashB = Math.max(0, Math.sin(game.time * 0.089 + 2.1) - 0.966) * 15.2;
    const flash = clamp(flashA + flashB, 0, 1) * weather.storm;
    if (flash > 0.02) {
      ctx.fillStyle = `rgba(214, 230, 255, ${0.15 + flash * 0.36})`;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
  }
}

function drawTierScene(ctx, game, tier, backgroundSheets, alpha = 1) {
  if (!tier || alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, tier.sky.top);
  gradient.addColorStop(0.53, tier.sky.mid);
  gradient.addColorStop(1, tier.sky.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  drawStars(ctx, game.time + game.score * 0.01, tier.weather.stars);
  drawAurora(ctx, game.time + game.score * 0.006, tier.weather.aurora);
  drawCelestialBody(ctx, tier.celestial);
  drawCloudAndBreezeLayer(ctx, game, tier.weather);

  const backdrop = backgroundSheets?.[tier.id];
  if (backdrop) {
    for (const layer of tier.imageLayers) {
      drawParallaxBackdropImage(ctx, backdrop, game.score, layer);
    }
  }

  for (const layer of tier.cityLayers) {
    drawCityLayer(ctx, {
      ...layer,
      score: game.score,
    });
  }

  drawTierDetails(ctx, tier, game);
  drawCloudDeck(ctx, tier.cloudDeck);
  drawFrontWeatherLayer(ctx, game, tier.weather);

  if (tier.streetAlpha > 0) {
    ctx.fillStyle = `rgba(18, 31, 49, ${0.86 * tier.streetAlpha})`;
    ctx.fillRect(0, GAME_HEIGHT - 70, GAME_WIDTH, 70);
    ctx.fillStyle = `rgba(143, 177, 220, ${0.3 * tier.streetAlpha})`;
    for (let i = 0; i < GAME_WIDTH; i += 32) {
      ctx.fillRect(i + ((game.score * 0.55) % 32), GAME_HEIGHT - 45, 16, 4);
    }
  }

  drawCars(ctx, game.cars, tier.carsAlpha || 0);
  ctx.restore();
}

function drawBackground(ctx, game, backgroundSheets) {
  const state = resolveBackgroundState(game.score);
  const baseAlpha = clamp(1 - state.blend, 0, 1);
  drawTierScene(ctx, game, state.currentTier, backgroundSheets, baseAlpha);
  if (state.blend > 0.001) {
    drawTierScene(ctx, game, state.nextTier, backgroundSheets, state.blend);
  }
  if (game.bounceFlash > 0.02) {
    ctx.fillStyle = `rgba(255, 246, 196, ${Math.min(0.2, game.bounceFlash * 0.2)})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}

function drawPlatform(ctx, platform) {
  if (platform.broken) return;
  let fill = '#7bc97e';
  let stroke = '#2f6b3a';
  if (platform.type === 'moving') {
    fill = '#64b5ff';
    stroke = '#245990';
  } else if (platform.type === 'break') {
    fill = '#f8bc6a';
    stroke = '#9f5a1f';
  } else if (platform.type === 'boost') {
    fill = '#8cf2a8';
    stroke = '#2c7b4e';
  }

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.2;
  drawRoundedRect(ctx, platform.x, platform.y - 10, platform.width, 13, 7);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillRect(platform.x + 10, platform.y - 8, platform.width - 20, 3);

  if (platform.type === 'break') {
    ctx.strokeStyle = 'rgba(105, 60, 23, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(platform.x + platform.width * 0.22, platform.y - 8);
    ctx.lineTo(platform.x + platform.width * 0.42, platform.y + 1);
    ctx.lineTo(platform.x + platform.width * 0.58, platform.y - 4);
    ctx.lineTo(platform.x + platform.width * 0.76, platform.y + 2);
    ctx.stroke();
  }

  if (platform.type === 'boost') {
    const springX = platform.x + platform.width * 0.5;
    ctx.strokeStyle = '#2e7e4e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(springX, platform.y - 10);
    ctx.lineTo(springX, platform.y - 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(springX, platform.y - 18, 4.2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCharacterShadow(ctx, player) {
  const shadowY = player.y + player.height + 4;
  const shadowWidth = player.width * 0.52;
  const shadowHeight = 7;
  ctx.fillStyle = 'rgba(19, 35, 53, 0.28)';
  ctx.beginPath();
  ctx.ellipse(player.x + player.width * 0.5, shadowY, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCatCharacter(ctx, player, time) {
  const centerX = player.x + player.width * 0.5;
  const centerY = player.y + player.height * 0.54;
  const bob = Math.sin(time * 0.095 + 0.4) * 1.6;
  const squash = clamp(player.squash, 0, 0.42);
  const scaleX = 1 + squash * 0.2;
  const scaleY = 1 - squash * 0.13;

  ctx.save();
  ctx.translate(centerX, centerY + bob);
  ctx.scale(player.facing, 1);
  ctx.scale(scaleX, scaleY);
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = '#1f3d2f';
  ctx.fillStyle = '#f4d39b';

  ctx.beginPath();
  ctx.ellipse(0, 1, player.width * 0.34, player.height * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-player.width * 0.2, -player.height * 0.14);
  ctx.lineTo(-player.width * 0.3, -player.height * 0.36);
  ctx.lineTo(-player.width * 0.09, -player.height * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(player.width * 0.2, -player.height * 0.14);
  ctx.lineTo(player.width * 0.3, -player.height * 0.36);
  ctx.lineTo(player.width * 0.09, -player.height * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f5b78a';
  ctx.beginPath();
  ctx.arc(-player.width * 0.205, -player.height * 0.22, 5, 0, Math.PI * 2);
  ctx.arc(player.width * 0.205, -player.height * 0.22, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d84e36';
  ctx.strokeStyle = '#993327';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, -player.width * 0.34, -player.height * 0.27, player.width * 0.68, 9, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1a2f1f';
  ctx.beginPath();
  ctx.ellipse(-player.width * 0.12, -player.height * 0.02, 5.3, 7, -0.18, 0, Math.PI * 2);
  ctx.ellipse(player.width * 0.12, -player.height * 0.02, 5.3, 7, 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#7c3426';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, player.height * 0.02);
  ctx.lineTo(-4, player.height * 0.1);
  ctx.lineTo(0, player.height * 0.1);
  ctx.lineTo(4, player.height * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-10, player.height * 0.1);
  ctx.lineTo(-16, player.height * 0.11);
  ctx.moveTo(10, player.height * 0.1);
  ctx.lineTo(16, player.height * 0.11);
  ctx.stroke();

  ctx.strokeStyle = '#1f3d2f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.width * 0.28, player.height * 0.12);
  ctx.quadraticCurveTo(player.width * 0.52, player.height * 0.02, player.width * 0.46, player.height * 0.25);
  ctx.stroke();

  ctx.restore();
}

function getSpriteRectFromIndex(sheet, spriteConfig, frameIndex) {
  if (Array.isArray(spriteConfig.frames) && spriteConfig.frames[frameIndex]) {
    return spriteConfig.frames[frameIndex];
  }
  const frameWidth = Math.floor(sheet.naturalWidth / spriteConfig.columns);
  const frameHeight = Math.floor(sheet.naturalHeight / spriteConfig.rows);
  const col = frameIndex % spriteConfig.columns;
  const row = Math.floor(frameIndex / spriteConfig.columns);
  return {
    sx: col * frameWidth,
    sy: row * frameHeight,
    sw: frameWidth,
    sh: frameHeight,
  };
}

function selectCatFrameIndex(player, time) {
  const tick = Math.floor(time / 5);
  if (player.vy < -3.5) return CAT_SPRITE_SHEET.riseFrames[tick % CAT_SPRITE_SHEET.riseFrames.length];
  if (player.vy < -0.8) return CAT_SPRITE_SHEET.apexFrame;
  if (player.vy > 2.6) return CAT_SPRITE_SHEET.fallFrames[tick % CAT_SPRITE_SHEET.fallFrames.length];
  if (Math.abs(player.vx) > 0.45) return CAT_SPRITE_SHEET.moveFrames[tick % CAT_SPRITE_SHEET.moveFrames.length];
  return CAT_SPRITE_SHEET.idleFrames[tick % CAT_SPRITE_SHEET.idleFrames.length];
}

function selectDevitFrameIndex(devit, time) {
  const tick = Math.floor(time / 5);
  if (devit.vy < -2.8) return DEVIT_SPRITE_SHEET.riseFrames[tick % DEVIT_SPRITE_SHEET.riseFrames.length];
  if (devit.vy < -0.6) return DEVIT_SPRITE_SHEET.apexFrame;
  if (devit.vy > 2.4) return DEVIT_SPRITE_SHEET.fallFrames[tick % DEVIT_SPRITE_SHEET.fallFrames.length];
  if (Math.abs(devit.vx) > 0.45) return DEVIT_SPRITE_SHEET.moveFrames[tick % DEVIT_SPRITE_SHEET.moveFrames.length];
  return DEVIT_SPRITE_SHEET.idleFrames[tick % DEVIT_SPRITE_SHEET.idleFrames.length];
}

function drawCharacterSprite(ctx, player, time, spriteSheet, spriteConfig, frameIndex) {
  if (!spriteSheet) return false;
  const centerX = player.x + player.width * 0.5;
  const centerY = player.y + player.height * 0.54;
  const bob = Math.sin(time * 0.095 + 0.4) * 1.6;
  const squash = clamp(player.squash, 0, 0.45);
  const scaleX = 1 + squash * 0.2;
  const scaleY = 1 - squash * 0.14;
  const frame = getSpriteRectFromIndex(spriteSheet, spriteConfig, frameIndex);
  const targetHeight = player.height * (spriteConfig.scale || 1);
  const ratio = frame.sw / frame.sh;
  const targetWidth = targetHeight * ratio;

  ctx.save();
  ctx.translate(centerX, centerY + bob + (spriteConfig.yOffset || 0));
  ctx.scale(player.facing, 1);
  ctx.scale(scaleX, scaleY);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    spriteSheet,
    frame.sx, frame.sy, frame.sw, frame.sh,
    -targetWidth * 0.5, -targetHeight * 0.78, targetWidth, targetHeight,
  );
  ctx.restore();
  return true;
}

function drawCharacterPreview(ctx, spriteSheet, spriteConfig, frameIndex = spriteConfig.previewFrame) {
  ctx.clearRect(0, 0, 92, 92);
  ctx.fillStyle = '#f2f8ff';
  drawRoundedRect(ctx, 2, 2, 88, 88, 16);
  ctx.fill();

  if (spriteSheet) {
    const frame = getSpriteRectFromIndex(spriteSheet, spriteConfig, frameIndex);
    const ratio = frame.sw / frame.sh;
    const targetHeight = 61;
    const targetWidth = targetHeight * ratio;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      spriteSheet,
      frame.sx, frame.sy, frame.sw, frame.sh,
      46 - targetWidth * 0.5, 46 - targetHeight * 0.56, targetWidth, targetHeight,
    );
    return;
  }

  const dummy = { x: 22, y: 20, width: 46, height: 52, facing: 1, squash: 0 };
  drawCatCharacter(ctx, dummy, 0);
}

function renderGame(ctx, game, status, spriteSheet, devitSpriteSheet, backgroundSheets) {
  drawBackground(ctx, game, backgroundSheets);

  for (const platform of game.platforms) {
    drawPlatform(ctx, platform);
  }

  if (game.devit?.active) {
    drawCharacterShadow(ctx, game.devit);
    drawCharacterSprite(
      ctx,
      game.devit,
      game.time + 7.5,
      devitSpriteSheet,
      DEVIT_SPRITE_SHEET,
      selectDevitFrameIndex(game.devit, game.time),
    );
  }

  drawCharacterShadow(ctx, game.player);
  const usedSprite = drawCharacterSprite(
    ctx,
    game.player,
    game.time,
    spriteSheet,
    CAT_SPRITE_SHEET,
    selectCatFrameIndex(game.player, game.time),
  );
  if (!usedSprite) {
    drawCatCharacter(ctx, game.player, game.time);
  }

  ctx.fillStyle = 'rgba(9, 20, 35, 0.72)';
  drawRoundedRect(ctx, 12, 12, 120, 44, 12);
  ctx.fill();
  ctx.fillStyle = '#cae8ff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('SCORE', 24, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(String(game.score), 24, 48);

  ctx.fillStyle = 'rgba(9, 20, 35, 0.72)';
  drawRoundedRect(ctx, GAME_WIDTH - 132, 12, 120, 44, 12);
  ctx.fill();
  ctx.fillStyle = '#cae8ff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('BEST', GAME_WIDTH - 120, 30);
  ctx.fillStyle = '#fff2ac';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(String(game.bestScore), GAME_WIDTH - 120, 48);

  if (game.devit?.active) {
    ctx.fillStyle = 'rgba(63, 7, 10, 0.72)';
    drawRoundedRect(ctx, GAME_WIDTH * 0.5 - 76, 12, 152, 30, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd3d8';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DEVIT IS CHASING', GAME_WIDTH * 0.5, 32);
    ctx.textAlign = 'start';
  }

  if (status !== 'playing') {
    ctx.fillStyle = 'rgba(8, 16, 28, 0.56)';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}

function CharacterPreview({ spriteSheet, spriteVersion = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    if (!spriteSheet) {
      drawCharacterPreview(ctx, null, CAT_SPRITE_SHEET);
      return undefined;
    }

    let rafId = 0;
    let frameCursor = 0;
    let lastTs = 0;

    const renderCurrent = () => {
      const frame = PREVIEW_LOOP_FRAMES[frameCursor % PREVIEW_LOOP_FRAMES.length];
      drawCharacterPreview(ctx, spriteSheet, CAT_SPRITE_SHEET, frame);
    };

    renderCurrent();

    const tick = (ts) => {
      if (!lastTs || ts - lastTs >= PREVIEW_LOOP_FRAME_MS) {
        frameCursor = (frameCursor + 1) % PREVIEW_LOOP_FRAMES.length;
        renderCurrent();
        lastTs = ts;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [spriteSheet, spriteVersion]);

  return <canvas ref={canvasRef} width={92} height={92} className="w-[92px] h-[92px] rounded-2xl border border-white/30 shadow-sm" />;
}

export default function FunPage() {
  const { user } = useAuth();
  const [gameStatus, setGameStatus] = useState('idle');
  const [score, setScore] = useState(0);
  const [spriteVersion, setSpriteVersion] = useState(0);
  const [backgroundVersion, setBackgroundVersion] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    const raw = Number(window.localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [myLeaderboardSummary, setMyLeaderboardSummary] = useState(null);
  const [showLeaderboardAtStart, setShowLeaderboardAtStart] = useState(false);
  const [gameOverReason, setGameOverReason] = useState('fall');

  const canvasRef = useRef(null);
  const animationRef = useRef(0);
  const lastTimeRef = useRef(0);
  const controlsRef = useRef({ left: false, right: false });
  const gameStatusRef = useRef(gameStatus);
  const bestScoreRef = useRef(bestScore);
  const soundEnabledRef = useRef(soundEnabled);
  const scoreRef = useRef(score);
  const spriteSheetRef = useRef(null);
  const devitSpriteSheetRef = useRef(null);
  const backgroundSheetsRef = useRef({});
  const gameRef = useRef(createInitialGame(bestScore));

  const audioContextRef = useRef(null);
  const bgmAudioRef = useRef(null);
  const bgmTrackPathRef = useRef('');
  const bgmTrackIndexRef = useRef(0);
  const bgmPlaylistRef = useRef([...BGM_TRACKS]);
  const windNodesRef = useRef(null);
  const windBufferRef = useRef(null);
  const pointerStateRef = useRef({ id: null, direction: null, startedAt: 0 });
  const tapReleaseTimeoutRef = useRef(0);
  const leaderboardSubmitInFlightRef = useRef(false);

  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    let cancelled = false;
    const catImage = new Image();
    catImage.decoding = 'async';
    catImage.onload = () => {
      if (cancelled) return;
      spriteSheetRef.current = catImage;
      setSpriteVersion((v) => v + 1);
    };
    catImage.onerror = () => {};
    catImage.src = CAT_SPRITE_SHEET.path;

    const devitImage = new Image();
    devitImage.decoding = 'async';
    devitImage.onload = () => {
      if (cancelled) return;
      devitSpriteSheetRef.current = devitImage;
      setSpriteVersion((v) => v + 1);
    };
    devitImage.onerror = () => {};
    devitImage.src = DEVIT_SPRITE_SHEET.path;

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadedIds = new Set();
    for (const tier of BACKGROUND_TIERS) {
      if (loadedIds.has(tier.id)) continue;
      loadedIds.add(tier.id);
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (cancelled) return;
        backgroundSheetsRef.current[tier.id] = image;
        setBackgroundVersion((v) => v + 1);
      };
      image.onerror = () => {};
      image.src = tier.backgroundPath;
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (!soundEnabledRef.current) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  const ensureBgmAudio = useCallback(() => {
    if (!bgmAudioRef.current) {
      const audio = new Audio();
      audio.loop = false;
      audio.preload = 'auto';
      audio.volume = 0.36;
      audio.addEventListener('ended', () => {
        if (!soundEnabledRef.current || gameStatusRef.current !== 'playing') return;
        const playlist = bgmPlaylistRef.current;
        if (!playlist.length) return;
        bgmTrackIndexRef.current = (bgmTrackIndexRef.current + 1) % playlist.length;
        const nextPath = playlist[bgmTrackIndexRef.current];
        bgmTrackPathRef.current = nextPath;
        audio.src = nextPath;
        audio.load();
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      });
      bgmAudioRef.current = audio;
    }
    return bgmAudioRef.current;
  }, []);

  const playTone = useCallback((frequency, duration = 0.1, options = {}) => {
    const ctx = ensureAudioContext();
    if (!ctx || !frequency) return;
    const type = options.type || 'square';
    const volume = options.volume ?? 0.05;
    const detune = options.detune ?? 0;
    const slideTo = options.slideTo ?? null;
    const startAt = ctx.currentTime + (options.delay ?? 0);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);
    if (detune) osc.detune.setValueAtTime(detune, startAt);
    if (slideTo) {
      osc.frequency.linearRampToValueAtTime(slideTo, startAt + duration);
    }

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);
  }, [ensureAudioContext]);

  const playJumpSound = useCallback((boost = false) => {
    if (boost) {
      playTone(NOTES.C5, 0.11, { volume: 0.06 });
      playTone(NOTES.E5, 0.1, { delay: 0.04, volume: 0.06 });
      playTone(NOTES.A5, 0.14, { delay: 0.08, volume: 0.065 });
    } else {
      playTone(NOTES.G4, 0.09, { volume: 0.055 });
      playTone(NOTES.C5, 0.11, { delay: 0.03, volume: 0.05 });
    }
  }, [playTone]);

  const playBreakSound = useCallback(() => {
    playTone(NOTES.E4, 0.08, { type: 'sawtooth', volume: 0.04, slideTo: NOTES.C4 });
    playTone(NOTES.C4, 0.1, { type: 'triangle', volume: 0.032, delay: 0.02 });
  }, [playTone]);

  const playGameOverSound = useCallback(() => {
    playTone(NOTES.C5, 0.13, { volume: 0.055, type: 'square' });
    playTone(NOTES.G4, 0.14, { volume: 0.05, type: 'square', delay: 0.1 });
    playTone(NOTES.E4, 0.18, { volume: 0.05, type: 'square', delay: 0.22 });
    playTone(NOTES.C4, 0.24, { volume: 0.05, type: 'triangle', delay: 0.36 });
  }, [playTone]);

  const stopWind = useCallback(() => {
    const wind = windNodesRef.current;
    if (!wind) return;
    try { wind.source.stop(); } catch {}
    try { wind.lfo.stop(); } catch {}
    try { wind.source.disconnect(); } catch {}
    try { wind.highpass.disconnect(); } catch {}
    try { wind.lowpass.disconnect(); } catch {}
    try { wind.gain.disconnect(); } catch {}
    try { wind.lfo.disconnect(); } catch {}
    try { wind.lfoGain.disconnect(); } catch {}
    windNodesRef.current = null;
  }, []);

  const startWind = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx || windNodesRef.current) return;

    if (!windBufferRef.current || windBufferRef.current.sampleRate !== ctx.sampleRate) {
      windBufferRef.current = createWindNoiseBuffer(ctx, 2.5);
    }

    const source = ctx.createBufferSource();
    source.buffer = windBufferRef.current;
    source.loop = true;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(260, ctx.currentTime);
    highpass.Q.setValueAtTime(0.6, ctx.currentTime);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(2100, ctx.currentTime);
    lowpass.Q.setValueAtTime(0.35, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.8);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.07, ctx.currentTime);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.011, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(ctx.destination);

    source.start();
    lfo.start();

    windNodesRef.current = { source, highpass, lowpass, gain, lfo, lfoGain };
  }, [ensureAudioContext]);

  const stopBgm = useCallback(() => {
    const bgm = bgmAudioRef.current;
    if (bgm) {
      bgm.pause();
      bgm.currentTime = 0;
    }
    stopWind();
  }, [stopWind]);

  const startBgm = useCallback(() => {
    if (!soundEnabledRef.current) return;
    ensureAudioContext();
    startWind();
    const playlist = bgmPlaylistRef.current;
    if (!playlist.length) return;
    const bgm = ensureBgmAudio();
    if (!bgm) return;
    if (!bgm.paused) return;
    const currentPath = playlist[bgmTrackIndexRef.current] || playlist[0];
    if (currentPath && bgmTrackPathRef.current !== currentPath) {
      bgmTrackPathRef.current = currentPath;
      bgm.src = currentPath;
      bgm.load();
    }
    const playPromise = bgm.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }, [ensureAudioContext, ensureBgmAudio, startWind]);

  const loadLeaderboard = useCallback(async () => {
    if (!user?.id) {
      setLeaderboard([]);
      setMyLeaderboardSummary(null);
      setLeaderboardError('');
      setLeaderboardLoading(false);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const payload = await getFunLeaderboard(8);
      setLeaderboard(Array.isArray(payload?.leaderboard) ? payload.leaderboard : []);
      setMyLeaderboardSummary(payload?.me || null);
      setLeaderboardError('');
    } catch (error) {
      setLeaderboardError(error?.message || 'Failed to load high scores');
    } finally {
      setLeaderboardLoading(false);
    }
  }, [user?.id]);

  const submitLeaderboardScore = useCallback(async (finalScore) => {
    if (!user?.id || finalScore <= 0 || leaderboardSubmitInFlightRef.current) return;
    leaderboardSubmitInFlightRef.current = true;
    try {
      const payload = await submitFunScore(finalScore);
      if (payload) {
        setMyLeaderboardSummary({
          best_score: payload.best_score || finalScore,
          run_count: payload.run_count || 0,
          rank: payload.rank || null,
        });
      }
      await loadLeaderboard();
    } catch {}
    leaderboardSubmitInFlightRef.current = false;
  }, [loadLeaderboard, user?.id]);

  const setControl = useCallback((direction, value) => {
    controlsRef.current[direction] = value;
  }, []);

  const clearTapReleaseTimeout = useCallback(() => {
    if (tapReleaseTimeoutRef.current) {
      window.clearTimeout(tapReleaseTimeoutRef.current);
      tapReleaseTimeoutRef.current = 0;
    }
  }, []);

  const applyDirectionalControl = useCallback((direction) => {
    setControl('left', direction === 'left');
    setControl('right', direction === 'right');
    pointerStateRef.current.direction = direction;
  }, [setControl]);

  const releaseDirectionalControl = useCallback((delayMs = 0) => {
    clearTapReleaseTimeout();
    if (delayMs > 0) {
      tapReleaseTimeoutRef.current = window.setTimeout(() => {
        setControl('left', false);
        setControl('right', false);
        tapReleaseTimeoutRef.current = 0;
      }, delayMs);
      return;
    }
    setControl('left', false);
    setControl('right', false);
  }, [clearTapReleaseTimeout, setControl]);

  const getPointerDirection = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    return relativeX < rect.width * 0.5 ? 'left' : 'right';
  }, []);

  const handleGameAreaPointerDown = useCallback((event) => {
    if (gameStatusRef.current !== 'playing') return;
    clearTapReleaseTimeout();
    const direction = getPointerDirection(event);
    applyDirectionalControl(direction);
    pointerStateRef.current.id = event.pointerId;
    pointerStateRef.current.startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (event.currentTarget.setPointerCapture) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    }
    event.preventDefault();
  }, [applyDirectionalControl, clearTapReleaseTimeout, getPointerDirection]);

  const handleGameAreaPointerMove = useCallback((event) => {
    if (gameStatusRef.current !== 'playing') return;
    if (pointerStateRef.current.id !== event.pointerId) return;
    const direction = getPointerDirection(event);
    if (direction !== pointerStateRef.current.direction) {
      applyDirectionalControl(direction);
    }
  }, [applyDirectionalControl, getPointerDirection]);

  const handleGameAreaPointerRelease = useCallback((event) => {
    if (pointerStateRef.current.id !== event.pointerId) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const heldMs = Math.max(0, now - (pointerStateRef.current.startedAt || now));
    const graceMs = heldMs < 110 ? 120 : 0;
    pointerStateRef.current.id = null;
    pointerStateRef.current.direction = null;
    pointerStateRef.current.startedAt = 0;
    releaseDirectionalControl(graceMs);
    if (event.currentTarget.releasePointerCapture) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    }
  }, [releaseDirectionalControl]);

  const handleGameOver = useCallback((finalScore, reason = 'fall') => {
    pointerStateRef.current.id = null;
    pointerStateRef.current.direction = null;
    pointerStateRef.current.startedAt = 0;
    releaseDirectionalControl();
    setGameOverReason(reason);
    setShowLeaderboardAtStart(true);
    setGameStatus('gameover');
    stopBgm();
    playGameOverSound();
    void submitLeaderboardScore(finalScore);
    if (finalScore > bestScoreRef.current) {
      setBestScore(finalScore);
      window.localStorage.setItem(BEST_SCORE_KEY, String(finalScore));
    }
  }, [playGameOverSound, releaseDirectionalControl, stopBgm, submitLeaderboardScore]);

  const updateGame = useCallback((delta) => {
    const game = gameRef.current;
    if (!game || gameStatusRef.current !== 'playing') return;

    const { player, stats, devit } = game;
    const difficulty = getDifficultyProgress(game.score);
    game.time += delta;
    game.bounceFlash *= Math.pow(0.82, delta);
    player.squash *= Math.pow(0.8, delta);

    const controls = controlsRef.current;
    if (controls.left) player.vx -= stats.accel * delta;
    if (controls.right) player.vx += stats.accel * delta;
    if (!controls.left && !controls.right) {
      player.vx *= Math.pow(0.84, delta);
    }

    player.vx = clamp(player.vx, -stats.maxSpeed, stats.maxSpeed);
    if (Math.abs(player.vx) < 0.02) player.vx = 0;
    if (player.vx > 0.2) player.facing = 1;
    if (player.vx < -0.2) player.facing = -1;

    player.x += player.vx * delta;
    if (player.x > GAME_WIDTH + player.width * 0.48) player.x = -player.width * 0.48;
    if (player.x < -player.width * 0.48) player.x = GAME_WIDTH + player.width * 0.48;

    const previousY = player.y;
    player.vy += stats.gravity * delta;
    player.y += player.vy * delta;

    for (const cloud of game.clouds) {
      cloud.x += cloud.speed * delta;
      if (cloud.x > GAME_WIDTH + 60) {
        cloud.x = -60;
      }
    }

    for (const car of game.cars) {
      car.x += car.speed * delta;
      if (car.speed > 0 && car.x > GAME_WIDTH + 120) car.x = -car.width - 80;
      if (car.speed < 0 && car.x < -car.width - 120) car.x = GAME_WIDTH + 100;
    }

    for (const platform of game.platforms) {
      if (platform.type === 'moving' && !platform.broken) {
        platform.x += platform.velocityX * delta;
        if (platform.x < 5 || platform.x + platform.width > GAME_WIDTH - 5) {
          platform.velocityX *= -1;
          platform.x = clamp(platform.x, 5, GAME_WIDTH - platform.width - 5);
        }
      }
      if (platform.broken) {
        platform.brokenTimer += delta;
        platform.y += (1.8 + platform.brokenTimer * 0.15) * delta;
      }
    }

    if (player.vy > 0) {
      const oldBottom = previousY + player.height;
      const newBottom = player.y + player.height;
      for (const platform of game.platforms) {
        if (platform.broken) continue;
        if (oldBottom <= platform.y + 4 && newBottom >= platform.y - 1) {
          const footInsetRatio = 0.18 + difficulty * 0.12;
          const footLeft = player.x + player.width * footInsetRatio;
          const footRight = player.x + player.width * (1 - footInsetRatio);
          if (footRight >= platform.x && footLeft <= platform.x + platform.width) {
            if (platform.type === 'break') {
              platform.broken = true;
              platform.brokenTimer = 0;
              player.vy = Math.max(player.vy, 1.8);
              playBreakSound();
              break;
            }

            const boostJump = platform.type === 'boost';
            player.vy = boostJump ? -12.8 : stats.jumpVelocity;
            player.squash = boostJump ? 0.4 : 0.32;
            game.bounceFlash = boostJump ? 0.95 : 0.52;
            game.jumpCount += 1;
            enqueuePlayerPathStep(game, platform);
            playJumpSound(boostJump);
            break;
          }
        }
      }
    }

    if (player.y < CAMERA_LINE) {
      const shift = CAMERA_LINE - player.y;
      player.y = CAMERA_LINE;
      game.distance += shift;
      for (const platform of game.platforms) {
        platform.y += shift;
      }
      if (devit.active) {
        devit.y += shift;
      }
      for (const step of game.playerPathQueue) {
        step.y += shift;
      }
      for (const cloud of game.clouds) {
        cloud.y += shift * 0.17;
        if (cloud.y > GAME_HEIGHT + 60) {
          cloud.y = -randomBetween(40, GAME_HEIGHT * 0.8);
        }
      }
    }

    game.platforms = game.platforms.filter((platform) => {
      if (platform.y > GAME_HEIGHT + 120) return false;
      if (platform.broken && platform.brokenTimer > 26) return false;
      return true;
    });

    fillReachablePlatforms(game.platforms, game.score);

    if (devit.active) {
      devit.squash *= Math.pow(0.8, delta);
      const targetStep = game.playerPathQueue[0];
      const targetRect = getPathTargetRect(targetStep);

      if (devit.jumping) {
        const previousDevitY = devit.y;
        devit.vy += stats.gravity * DEVIT_GRAVITY_SCALE * delta;
        devit.x += devit.vx * delta;
        devit.y += devit.vy * delta;
        if (devit.vx > 0.2) devit.facing = 1;
        if (devit.vx < -0.2) devit.facing = -1;
        if (devit.x > GAME_WIDTH + devit.width * 0.48) devit.x = -devit.width * 0.48;
        if (devit.x < -devit.width * 0.48) devit.x = GAME_WIDTH + devit.width * 0.48;

        if (targetRect) {
          const targetLeft = targetRect.x - targetRect.width * 0.5;
          const targetRight = targetRect.x + targetRect.width * 0.5;
          const oldBottom = previousDevitY + devit.height;
          const newBottom = devit.y + devit.height;
          if (devit.vy > 0 && oldBottom <= targetRect.y + 4 && newBottom >= targetRect.y - 1) {
            const footLeft = devit.x + devit.width * 0.2;
            const footRight = devit.x + devit.width * 0.8;
            if (footRight >= targetLeft && footLeft <= targetRight) {
              devit.x = clamp(targetRect.x - devit.width * 0.5, -devit.width * 0.45, GAME_WIDTH - devit.width * 0.55);
              devit.y = targetRect.y - devit.height;
              devit.vx = 0;
              devit.vy = 0;
              devit.jumping = false;
              devit.jumpCooldown = DEVIT_JUMP_COOLDOWN_FRAMES;
              devit.squash = 0.25;
              devit.currentPlatformId = targetRect.platformId;
              game.playerPathQueue.shift();
            }
          }
        }
      } else {
        devit.vx *= Math.pow(0.82, delta);
        if (Math.abs(devit.vx) < 0.02) devit.vx = 0;
        devit.vy = 0;
        devit.jumpCooldown = Math.max(0, devit.jumpCooldown - delta);
        if (targetRect && devit.jumpCooldown <= 0) {
          const startCenterX = devit.x + devit.width * 0.5;
          const targetCenterX = targetRect.x;
          let deltaX = targetCenterX - startCenterX;
          if (deltaX > GAME_WIDTH * 0.5) deltaX -= GAME_WIDTH;
          if (deltaX < -GAME_WIDTH * 0.5) deltaX += GAME_WIDTH;
          const destinationY = targetRect.y - devit.height;
          const deltaY = destinationY - devit.y;
          const airTime = clamp(
            16 + Math.abs(deltaX) * 0.22 + Math.max(0, -deltaY) * 0.14,
            14,
            42,
          );
          const gravity = stats.gravity * DEVIT_GRAVITY_SCALE;
          devit.vx = deltaX / airTime;
          devit.vy = (deltaY - 0.5 * gravity * airTime * airTime) / airTime;
          devit.jumping = true;
          devit.squash = 0.34;
          if (Math.abs(devit.vx) > 0.16) {
            devit.facing = devit.vx > 0 ? 1 : -1;
          }
        }
      }

      if (entitiesOverlap(player, devit, DEVIT_TOUCH_PADDING)) {
        handleGameOver(game.score, 'devit');
        return;
      }
    }

    const nextScore = Math.max(0, Math.floor(game.distance));
    if (nextScore !== game.score) {
      game.score = nextScore;
      if (nextScore > game.bestScore) {
        game.bestScore = nextScore;
      }
      if (nextScore !== scoreRef.current) {
        scoreRef.current = nextScore;
        setScore(nextScore);
      }
    }

    if (player.y > GAME_HEIGHT + 96) {
      handleGameOver(game.score, 'fall');
    }
  }, [handleGameOver, playBreakSound, playJumpSound]);

  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderGame(
      ctx,
      gameRef.current,
      gameStatusRef.current,
      spriteSheetRef.current,
      devitSpriteSheetRef.current,
      backgroundSheetsRef.current,
    );
  }, []);

  const startGame = useCallback(() => {
    pointerStateRef.current.id = null;
    pointerStateRef.current.direction = null;
    pointerStateRef.current.startedAt = 0;
    releaseDirectionalControl();
    const nextGame = createInitialGame(bestScoreRef.current);
    gameRef.current = nextGame;
    scoreRef.current = 0;
    setScore(0);
    setLeaderboardError('');
    setShowLeaderboardAtStart(false);
    setGameOverReason('fall');
    setGameStatus('playing');
    if (soundEnabledRef.current) {
      ensureAudioContext();
      startBgm();
    }
  }, [ensureAudioContext, releaseDirectionalControl, startBgm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const tick = (timestamp) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }
      const delta = clamp((timestamp - lastTimeRef.current) / FRAME_MS, 0.45, 2.3);
      lastTimeRef.current = timestamp;
      if (gameStatusRef.current === 'playing') {
        updateGame(delta);
      }
      drawGame();
      animationRef.current = window.requestAnimationFrame(tick);
    };

    animationRef.current = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [drawGame, updateGame]);

  useEffect(() => {
    drawGame();
  }, [backgroundVersion, drawGame, spriteVersion]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') {
        event.preventDefault();
        setControl('left', true);
      }
      if (key === 'arrowright' || key === 'd') {
        event.preventDefault();
        setControl('right', true);
      }
      if (key === ' ' && gameStatusRef.current !== 'playing') {
        event.preventDefault();
        startGame();
      }
    };

    const onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') {
        setControl('left', false);
      }
      if (key === 'arrowright' || key === 'd') {
        setControl('right', false);
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [setControl, startGame]);

  useEffect(() => () => {
    clearTapReleaseTimeout();
    stopBgm();
    if (bgmAudioRef.current) {
      bgmTrackPathRef.current = '';
      bgmAudioRef.current.src = '';
      bgmAudioRef.current.load();
      bgmAudioRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [clearTapReleaseTimeout, stopBgm]);

  useEffect(() => {
    if (!soundEnabled) {
      stopBgm();
    } else if (gameStatus === 'playing') {
      ensureAudioContext();
      startBgm();
    }
  }, [ensureAudioContext, gameStatus, soundEnabled, startBgm, stopBgm]);

  const shouldShowLeaderboard = gameStatus === 'gameover' || (gameStatus === 'idle' && showLeaderboardAtStart);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-wider">
            <span className="text-piu-accent">FUN</span> SECTION
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Top City Jump: a vertical jumper with one sprite-sheet animated fighter.
          </p>
        </div>
        <Link
          to="/"
          className="px-3 py-2 rounded-lg border border-piu-border bg-piu-card hover:border-piu-accent/40 text-sm font-display transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-display font-bold tracking-wider text-piu-accent">{GAME_TITLE}</h2>
          <div className="text-xs text-gray-400">
            Score: <span className="text-white font-display">{score}</span>
            {'  '}|{'  '}
            Best: <span className="text-piu-gold font-display">{bestScore}</span>
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-piu-border/50 bg-slate-900 max-w-[780px] mx-auto">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="w-full h-auto block touch-none"
            style={{ touchAction: 'none' }}
            onPointerDown={handleGameAreaPointerDown}
            onPointerMove={handleGameAreaPointerMove}
            onPointerUp={handleGameAreaPointerRelease}
            onPointerCancel={handleGameAreaPointerRelease}
            onPointerLeave={handleGameAreaPointerRelease}
          />

          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold backdrop-blur-sm transition-colors ${
                soundEnabled
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                  : 'bg-gray-800/55 text-gray-300 border border-gray-600/60'
              }`}
            >
              {soundEnabled ? 'Audio: ON' : 'Audio: OFF'}
            </button>
          </div>

          {gameStatus === 'playing' && (
            <div className="absolute inset-x-0 bottom-4 px-4 pointer-events-none">
              <div className="mx-auto max-w-[330px] rounded-xl bg-black/35 border border-white/10 py-2 text-center text-[11px] text-gray-200">
                Tap left half to move left. Tap right half to move right.
              </div>
            </div>
          )}

          {gameStatus !== 'playing' && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className={`w-full ${shouldShowLeaderboard ? 'max-w-[388px]' : 'max-w-[330px]'} rounded-2xl bg-black/58 border border-white/20 backdrop-blur-md p-4 pointer-events-auto`}>
                <p className="text-center font-display font-bold text-xl text-white mb-3">
                  {gameStatus === 'gameover' ? 'ROUND OVER' : GAME_TITLE}
                </p>
                <div className="rounded-xl border border-piu-accent/40 bg-piu-accent/10 p-3">
                  <div className="flex items-center gap-3">
                    <CharacterPreview
                      spriteSheet={spriteSheetRef.current}
                      spriteVersion={spriteVersion}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-display font-bold text-white">{PLAYABLE_CHARACTER.name}</p>
                      <p className="text-xs text-gray-300 mt-1">{PLAYABLE_CHARACTER.description}</p>
                      <div className={`mt-2 inline-flex px-2 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-to-r ${PLAYABLE_CHARACTER.cardClass}`}>
                        PLAYABLE
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startGame}
                  className="w-full mt-4 btn-primary text-center"
                >
                  {gameStatus === 'gameover' ? 'Restart Run' : 'Start Run'}
                </button>
                {gameStatus === 'idle' && (
                  <button
                    type="button"
                    onClick={() => setShowLeaderboardAtStart((prev) => !prev)}
                    className="w-full mt-2 rounded-xl border-2 border-[#7b3f09] bg-gradient-to-b from-[#ffd56a] to-[#f3902f] text-[#4a2200] font-display font-black tracking-wide py-2 shadow-[0_4px_0_#6b3207]"
                  >
                    {shouldShowLeaderboard ? 'Hide Leaderboard' : 'View Leaderboard'}
                  </button>
                )}
                <p className="mt-3 text-[11px] text-gray-200 text-center leading-snug">
                  Tap left side of the game area to go left, right side to go right.
                </p>
                <p className="mt-1 text-[10px] text-gray-400 text-center">
                  Keyboard fallback: Left/Right or A/D.
                </p>
                {gameStatus === 'gameover' && (
                  <>
                    <p className="mt-2 text-sm text-piu-gold text-center font-display">Final score: {score}</p>
                    <p className="mt-1 text-[11px] text-rose-200 text-center font-display">
                      {gameOverReason === 'devit' ? 'Devit caught you.' : 'You fell from the skyline.'}
                    </p>
                  </>
                )}

                {shouldShowLeaderboard && (
                  <div className="mt-4 rounded-[18px] border-4 border-[#5a2f06] bg-gradient-to-b from-[#ffd86f] via-[#ffad43] to-[#f06d1f] shadow-[0_6px_0_#7b3f09,0_14px_26px_rgba(0,0,0,0.45)] p-3 text-[#3f1d00]">
                    <p className="text-center font-display font-black tracking-[0.12em] text-sm">LEADERBOARD</p>
                    {!user && (
                      <p className="mt-2 text-[11px] font-semibold text-[#5a2500] text-center">
                        Registered users only. Log in to view the table.
                      </p>
                    )}
                    {user && leaderboardLoading && (
                      <p className="mt-2 text-[11px] font-semibold text-[#5a2500] text-center">Loading...</p>
                    )}
                    {user && !leaderboardLoading && leaderboardError && (
                      <p className="mt-2 text-[11px] font-semibold text-[#6f0000] text-center">{leaderboardError}</p>
                    )}
                    {user && !leaderboardLoading && !leaderboardError && leaderboard.length === 0 && (
                      <p className="mt-2 text-[11px] font-semibold text-[#5a2500] text-center">No scores yet.</p>
                    )}
                    {user && !leaderboardLoading && !leaderboardError && leaderboard.length > 0 && (
                      <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {leaderboard.slice(0, 8).map((entry) => (
                          <div key={entry.user_id} className="flex items-center justify-between gap-2 rounded-lg border-2 border-[#6b340b]/70 bg-[rgba(84,38,8,0.18)] px-2 py-1">
                            <p className="truncate text-[11px] font-semibold">
                              <span className="inline-flex min-w-[32px] justify-center rounded-md bg-[rgba(60,24,0,0.52)] px-1 py-0.5 mr-1 text-[#ffe6a1] font-display">#{entry.rank}</span>
                              <span className="text-[#4a2200]">{entry.username}</span>
                            </p>
                            <span className="text-[12px] font-display font-black text-[#3d1800]">{entry.score}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {user && myLeaderboardSummary?.best_score > 0 && (
                      <p className="mt-2 text-[11px] text-center font-display font-black text-[#4a2200]">
                        Dojo Cat Rank: #{myLeaderboardSummary.rank || '-'}  Score: {myLeaderboardSummary.best_score}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

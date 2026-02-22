import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const GAME_WIDTH = 420;
const GAME_HEIGHT = 700;
const CAMERA_LINE = 250;
const FRAME_MS = 1000 / 60;
const MAX_PLATFORMS = 34;
const BEST_SCORE_KEY = 'fun_city_jump_best_score_v1';

const CHARACTERS = [
  {
    id: 'devil',
    name: 'Sky Devil',
    description: 'Floaty jumps and smooth control.',
    cardClass: 'from-rose-500 to-orange-500',
  },
  {
    id: 'cat',
    name: 'Fighter Cat',
    description: 'Fast movement and stronger dash feel.',
    cardClass: 'from-amber-500 to-orange-500',
  },
];

const CHARACTER_STATS = {
  devil: {
    width: 48,
    height: 56,
    accel: 0.42,
    maxSpeed: 5.4,
    gravity: 0.218,
    jumpVelocity: -9.2,
  },
  cat: {
    width: 52,
    height: 58,
    accel: 0.5,
    maxSpeed: 5.9,
    gravity: 0.236,
    jumpVelocity: -8.9,
  },
};

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

const MELODY_SEQUENCE = [
  'E5', 'G5', 'A5', 'R', 'A5', 'C6', 'B5', 'R',
  'G5', 'E5', 'D5', 'R', 'E5', 'G5', 'A5', 'R',
  'C6', 'B5', 'A5', 'G5', 'E5', 'D5', 'C5', 'R',
  'E5', 'G5', 'A5', 'B5', 'A5', 'G5', 'E5', 'R',
];

const BASS_SEQUENCE = [
  'C3', 'R', 'C3', 'R', 'A3', 'R', 'A3', 'R',
  'F3', 'R', 'F3', 'R', 'G3', 'R', 'G3', 'R',
  'C3', 'R', 'C3', 'R', 'A3', 'R', 'A3', 'R',
  'F3', 'R', 'G3', 'R', 'C4', 'R', 'C4', 'R',
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);

function hashNoise(index, salt = 0) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

let platformIdCounter = 1;

function selectPlatformType(score) {
  const progress = Math.min(1, score / 6500);
  const roll = Math.random();
  if (roll < 0.63 - progress * 0.12) return 'normal';
  if (roll < 0.82) return 'moving';
  if (roll < 0.93) return 'break';
  return 'boost';
}

function createPlatform(y, score) {
  const width = randomBetween(76, 122);
  const type = selectPlatformType(score);
  return {
    id: platformIdCounter++,
    x: randomBetween(8, GAME_WIDTH - width - 8),
    y,
    width,
    type,
    velocityX: type === 'moving' ? randomBetween(0.8, 1.7) * (Math.random() < 0.5 ? -1 : 1) : 0,
    broken: false,
    brokenTimer: 0,
  };
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

function createInitialGame(characterId, bestScore) {
  const stats = CHARACTER_STATS[characterId] || CHARACTER_STATS.devil;
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
  });

  let nextY = GAME_HEIGHT - 92;
  for (let i = 0; i < 13; i += 1) {
    nextY -= randomBetween(56, 84);
    const platform = createPlatform(nextY, 0);
    if (i < 2) platform.type = 'normal';
    platforms.push(platform);
  }

  return {
    characterId,
    stats,
    player,
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

function drawCloud(ctx, x, y, scale, opacity = 0.9) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#f4f9ff';
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
      ctx.fillStyle = 'rgba(203, 228, 255, 0.16)';
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

function drawCars(ctx, cars) {
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
}

function drawBackground(ctx, game) {
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, '#d7ecff');
  gradient.addColorStop(0.53, '#a4cdf5');
  gradient.addColorStop(1, '#678dbe');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = 'rgba(255, 221, 120, 0.82)';
  ctx.beginPath();
  ctx.arc(GAME_WIDTH - 66, 82, 24, 0, Math.PI * 2);
  ctx.fill();

  for (const cloud of game.clouds) {
    drawCloud(ctx, cloud.x, cloud.y, cloud.scale, 0.78);
  }

  drawCityLayer(ctx, {
    baseY: GAME_HEIGHT - 72,
    score: game.score,
    parallax: 0.07,
    minWidth: 30,
    maxWidth: 64,
    minHeight: 58,
    maxHeight: 170,
    gap: 7,
    fill: '#6596cc',
    stroke: 'rgba(57, 94, 139, 0.6)',
    seed: 0.3,
    detail: false,
  });
  drawCityLayer(ctx, {
    baseY: GAME_HEIGHT - 66,
    score: game.score,
    parallax: 0.13,
    minWidth: 34,
    maxWidth: 74,
    minHeight: 80,
    maxHeight: 212,
    gap: 8,
    fill: '#4878af',
    stroke: 'rgba(37, 65, 97, 0.65)',
    seed: 1.1,
    detail: true,
  });
  drawCityLayer(ctx, {
    baseY: GAME_HEIGHT - 60,
    score: game.score,
    parallax: 0.2,
    minWidth: 38,
    maxWidth: 90,
    minHeight: 110,
    maxHeight: 260,
    gap: 11,
    fill: '#365b84',
    stroke: 'rgba(20, 39, 62, 0.8)',
    seed: 2.4,
    detail: true,
  });

  ctx.fillStyle = '#1f2e46';
  ctx.fillRect(0, GAME_HEIGHT - 70, GAME_WIDTH, 70);
  ctx.fillStyle = 'rgba(117, 145, 188, 0.26)';
  for (let i = 0; i < GAME_WIDTH; i += 32) {
    ctx.fillRect(i + ((game.score * 0.55) % 32), GAME_HEIGHT - 45, 16, 4);
  }

  drawCars(ctx, game.cars);

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

function drawDevilCharacter(ctx, player, time) {
  const centerX = player.x + player.width * 0.5;
  const centerY = player.y + player.height * 0.52;
  const bob = Math.sin(time * 0.11) * 1.8;
  const squash = clamp(player.squash, 0, 0.45);
  const scaleX = 1 + squash * 0.22;
  const scaleY = 1 - squash * 0.17;

  ctx.save();
  ctx.translate(centerX, centerY + bob);
  ctx.scale(player.facing, 1);
  ctx.scale(scaleX, scaleY);
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = '#3f3f46';
  ctx.fillStyle = '#ffffff';

  ctx.beginPath();
  ctx.ellipse(0, 0, player.width * 0.34, player.height * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ff6548';
  ctx.strokeStyle = '#c63c20';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-player.width * 0.19, -player.height * 0.28);
  ctx.quadraticCurveTo(-player.width * 0.27, -player.height * 0.54, -player.width * 0.09, -player.height * 0.49);
  ctx.quadraticCurveTo(-player.width * 0.03, -player.height * 0.42, -player.width * 0.12, -player.height * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(player.width * 0.19, -player.height * 0.28);
  ctx.quadraticCurveTo(player.width * 0.27, -player.height * 0.54, player.width * 0.09, -player.height * 0.49);
  ctx.quadraticCurveTo(player.width * 0.03, -player.height * 0.42, player.width * 0.12, -player.height * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ff6c5d';
  ctx.beginPath();
  ctx.ellipse(-player.width * 0.1, -player.height * 0.02, 5.5, 7.5, -0.2, 0, Math.PI * 2);
  ctx.ellipse(player.width * 0.1, -player.height * 0.02, 5.5, 7.5, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2f2f35';
  ctx.beginPath();
  ctx.arc(-player.width * 0.1, -player.height * 0.03, 2.5, 0, Math.PI * 2);
  ctx.arc(player.width * 0.1, -player.height * 0.03, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2f2f35';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, player.height * 0.06, 7, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.fillStyle = '#ffbfd0';
  ctx.beginPath();
  ctx.arc(-player.width * 0.2, player.height * 0.06, 4.5, 0, Math.PI * 2);
  ctx.arc(player.width * 0.2, player.height * 0.06, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
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

function drawCharacterPreview(ctx, characterId) {
  ctx.clearRect(0, 0, 92, 92);
  ctx.fillStyle = '#f2f8ff';
  drawRoundedRect(ctx, 2, 2, 88, 88, 16);
  ctx.fill();
  const dummy = {
    x: 22,
    y: 20,
    width: characterId === 'cat' ? 46 : 42,
    height: characterId === 'cat' ? 52 : 50,
    facing: 1,
    squash: 0,
  };
  if (characterId === 'cat') {
    drawCatCharacter(ctx, dummy, 0);
  } else {
    drawDevilCharacter(ctx, dummy, 0);
  }
}

function renderGame(ctx, game, status) {
  drawBackground(ctx, game);

  for (const platform of game.platforms) {
    drawPlatform(ctx, platform);
  }

  drawCharacterShadow(ctx, game.player);
  if (game.characterId === 'cat') {
    drawCatCharacter(ctx, game.player, game.time);
  } else {
    drawDevilCharacter(ctx, game.player, game.time);
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

  if (status !== 'playing') {
    ctx.fillStyle = 'rgba(8, 16, 28, 0.56)';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 31px sans-serif';
    const title = status === 'gameover' ? 'ROUND OVER' : 'CITY SKY JUMP';
    ctx.fillText(title, GAME_WIDTH * 0.5, GAME_HEIGHT * 0.38);

    ctx.font = '600 16px sans-serif';
    const subtitle = status === 'gameover'
      ? `Final score: ${game.score}`
      : 'Start to launch into the skyline.';
    ctx.fillText(subtitle, GAME_WIDTH * 0.5, GAME_HEIGHT * 0.43);

    ctx.font = '500 13px sans-serif';
    ctx.fillStyle = 'rgba(228, 240, 255, 0.92)';
    ctx.fillText('Use Left/Right or A/D. Wrap around screen edges.', GAME_WIDTH * 0.5, GAME_HEIGHT * 0.48);
    ctx.fillText('Land on platforms to chain jumps and climb.', GAME_WIDTH * 0.5, GAME_HEIGHT * 0.51);
    ctx.textAlign = 'start';
  }
}

function CharacterPreview({ characterId }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    drawCharacterPreview(ctx, characterId);
    return undefined;
  }, [characterId]);

  return <canvas ref={canvasRef} width={92} height={92} className="w-[92px] h-[92px] rounded-2xl border border-white/30 shadow-sm" />;
}

export default function FunPage() {
  const [selectedCharacter, setSelectedCharacter] = useState('devil');
  const [gameStatus, setGameStatus] = useState('idle');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    const raw = Number(window.localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  });
  const [soundEnabled, setSoundEnabled] = useState(true);

  const canvasRef = useRef(null);
  const animationRef = useRef(0);
  const lastTimeRef = useRef(0);
  const controlsRef = useRef({ left: false, right: false });
  const gameStatusRef = useRef(gameStatus);
  const selectedCharacterRef = useRef(selectedCharacter);
  const bestScoreRef = useRef(bestScore);
  const soundEnabledRef = useRef(soundEnabled);
  const scoreRef = useRef(score);
  const gameRef = useRef(createInitialGame(selectedCharacter, bestScore));

  const audioContextRef = useRef(null);
  const bgmIntervalRef = useRef(null);
  const bgmStepRef = useRef(0);

  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  useEffect(() => {
    selectedCharacterRef.current = selectedCharacter;
  }, [selectedCharacter]);

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

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

  const stopBgm = useCallback(() => {
    if (bgmIntervalRef.current) {
      window.clearInterval(bgmIntervalRef.current);
      bgmIntervalRef.current = null;
    }
  }, []);

  const startBgm = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx || bgmIntervalRef.current) return;
    bgmStepRef.current = 0;
    const stepMs = 140;

    bgmIntervalRef.current = window.setInterval(() => {
      if (!soundEnabledRef.current) return;
      const i = bgmStepRef.current % MELODY_SEQUENCE.length;
      const melodyNote = MELODY_SEQUENCE[i];
      const bassNote = BASS_SEQUENCE[i];
      if (melodyNote && melodyNote !== 'R') {
        playTone(NOTES[melodyNote], 0.13, { type: 'square', volume: 0.032 });
      }
      if (bassNote && bassNote !== 'R') {
        playTone(NOTES[bassNote], 0.15, { type: 'triangle', volume: 0.022 });
      }
      bgmStepRef.current += 1;
    }, stepMs);
  }, [ensureAudioContext, playTone]);

  const setControl = useCallback((direction, value) => {
    controlsRef.current[direction] = value;
  }, []);

  const handleGameOver = useCallback((finalScore) => {
    setGameStatus('gameover');
    stopBgm();
    playGameOverSound();
    if (finalScore > bestScoreRef.current) {
      setBestScore(finalScore);
      window.localStorage.setItem(BEST_SCORE_KEY, String(finalScore));
    }
  }, [playGameOverSound, stopBgm]);

  const updateGame = useCallback((delta) => {
    const game = gameRef.current;
    if (!game || gameStatusRef.current !== 'playing') return;

    const { player, stats } = game;
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
          const footLeft = player.x + player.width * 0.2;
          const footRight = player.x + player.width * 0.8;
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

    let minimumY = Infinity;
    for (const platform of game.platforms) {
      if (platform.y < minimumY) minimumY = platform.y;
    }
    if (!Number.isFinite(minimumY)) minimumY = GAME_HEIGHT - 32;

    while (minimumY > -120 && game.platforms.length < MAX_PLATFORMS) {
      const gap = randomBetween(55, 87 + Math.min(34, game.score / 220));
      minimumY -= gap;
      game.platforms.push(createPlatform(minimumY, game.score));
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
      handleGameOver(game.score);
    }
  }, [handleGameOver, playBreakSound, playJumpSound]);

  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderGame(ctx, gameRef.current, gameStatusRef.current);
  }, []);

  const startGame = useCallback(() => {
    const nextGame = createInitialGame(selectedCharacterRef.current, bestScoreRef.current);
    gameRef.current = nextGame;
    scoreRef.current = 0;
    setScore(0);
    setGameStatus('playing');
    if (soundEnabledRef.current) {
      ensureAudioContext();
      startBgm();
    }
  }, [ensureAudioContext, startBgm]);

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
  }, [drawGame, selectedCharacter]);

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
    stopBgm();
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [stopBgm]);

  useEffect(() => {
    if (!soundEnabled) {
      stopBgm();
    } else if (gameStatus === 'playing') {
      ensureAudioContext();
      startBgm();
    }
  }, [ensureAudioContext, gameStatus, soundEnabled, startBgm, stopBgm]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-wider">
            <span className="text-piu-accent">FUN</span> SECTION
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            City Sky Jump: a vertical jumper with selectable mascot fighters.
          </p>
        </div>
        <Link
          to="/"
          className="px-3 py-2 rounded-lg border border-piu-border bg-piu-card hover:border-piu-accent/40 text-sm font-display transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <section className="card space-y-4">
          <div>
            <h2 className="text-base font-display font-bold tracking-wider text-piu-accent mb-2">CHARACTER SELECT</h2>
            <div className="space-y-3">
              {CHARACTERS.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  disabled={gameStatus === 'playing'}
                  onClick={() => {
                    setSelectedCharacter(character.id);
                    if (gameStatusRef.current !== 'playing') {
                      gameRef.current = createInitialGame(character.id, bestScoreRef.current);
                      drawGame();
                    }
                  }}
                  className={`w-full text-left rounded-xl border transition-all ${
                    selectedCharacter === character.id
                      ? 'border-piu-accent bg-piu-accent/10'
                      : 'border-piu-border bg-piu-dark/30 hover:border-piu-accent/40'
                  } ${gameStatus === 'playing' ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3 p-3">
                    <CharacterPreview characterId={character.id} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-bold">{character.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{character.description}</p>
                      <div className={`mt-2 inline-flex px-2 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-to-r ${character.cardClass}`}>
                        SELECTABLE
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {gameStatus === 'playing' && (
              <p className="text-[11px] text-gray-500 mt-2">Restart the run to switch character.</p>
            )}
          </div>

          <div className="border-t border-piu-border/40 pt-4">
            <h3 className="text-sm font-display font-bold tracking-wider text-piu-accent mb-2">AUDIO</h3>
            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className={`w-full py-2 rounded-lg text-sm font-display font-bold transition-colors ${
                soundEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-gray-700/30 text-gray-300 border border-gray-600/60'
              }`}
            >
              {soundEnabled ? 'Sound: ON (Jump + 16-bit BGM)' : 'Sound: OFF'}
            </button>
          </div>

          <div className="border-t border-piu-border/40 pt-4 space-y-2">
            <button
              type="button"
              onClick={startGame}
              className="w-full btn-primary text-center"
            >
              {gameStatus === 'playing' ? 'Restart Run' : 'Start Run'}
            </button>
            <p className="text-xs text-gray-400 leading-relaxed">
              Controls: <span className="text-gray-200 font-semibold">Left/Right</span> or <span className="text-gray-200 font-semibold">A/D</span>.
              You auto-jump when landing on platforms.
            </p>
            <p className="text-xs text-gray-500">
              Orange platforms break, blue platforms move, green spring platforms launch high.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-display font-bold tracking-wider text-piu-accent">CITY SKY JUMP</h2>
            <div className="text-xs text-gray-400">
              Score: <span className="text-white font-display">{score}</span>
              {'  '}|{'  '}
              Best: <span className="text-piu-gold font-display">{bestScore}</span>
            </div>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-piu-border/50 bg-slate-900">
            <canvas
              ref={canvasRef}
              width={GAME_WIDTH}
              height={GAME_HEIGHT}
              className="w-full h-auto block"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:hidden">
            <button
              type="button"
              className="py-2 rounded-lg bg-piu-dark border border-piu-border font-display text-sm active:scale-95 transition-transform"
              onTouchStart={() => setControl('left', true)}
              onTouchEnd={() => setControl('left', false)}
              onMouseDown={() => setControl('left', true)}
              onMouseUp={() => setControl('left', false)}
              onMouseLeave={() => setControl('left', false)}
            >
              Move Left
            </button>
            <button
              type="button"
              className="py-2 rounded-lg bg-piu-dark border border-piu-border font-display text-sm active:scale-95 transition-transform"
              onTouchStart={() => setControl('right', true)}
              onTouchEnd={() => setControl('right', false)}
              onMouseDown={() => setControl('right', true)}
              onMouseUp={() => setControl('right', false)}
              onMouseLeave={() => setControl('right', false)}
            >
              Move Right
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

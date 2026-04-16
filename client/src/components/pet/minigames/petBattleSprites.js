import { CHAR_COLORS } from './miniPumpSprites';
import { isLoaded, getAnimationFrame, getRotation, drawSprite, getAnimationLength } from './petBattleSpriteLoader';

// ━━━ Palette ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SMB_PALETTE = {
  sky: '#5C94FC',
  skyDeep: '#3B67C7',
  cloud: '#FCFCFC',
  cloudShadow: '#BCBCBC',
  grass: '#00A800',
  grassDark: '#005800',
  grassShadow: '#003d00',
  dirt: '#C84C0C',
  dirtDark: '#A02800',
  dirtLight: '#df6d2d',
  brick: '#C84C0C',
  brickDark: '#7C2000',
  gold: '#FCB838',
  red: '#E40058',
  black: '#151515',
  white: '#ffffff',
  purple: '#4A2268',
};

const METAL = { dark: '#4a5568', mid: '#718096', light: '#a0aec0', bright: '#cbd5e0', shine: '#e2e8f0' };
const WOOD = { dark: '#5a3825', mid: '#8b6c42', light: '#b8956a' };
const HERO_ASSET_ROOT = '/pet-world/heroes';
const PET_BATTLE_ASSET_ROOT = '/pet-battle/units';
const HERO_ASSET_VERSION = '20260416a';
const PET_BATTLE_ASSET_VERSION = '20260416a';
const IMAGE_CACHE = new Map();

function getImageAsset(src) {
  if (typeof Image === 'undefined') return null;
  if (IMAGE_CACHE.has(src)) return IMAGE_CACHE.get(src);
  const img = new Image();
  const entry = { image: img, loaded: false, error: false };
  img.decoding = 'async';
  img.onload = () => { entry.loaded = true; entry.error = false; };
  img.onerror = () => { entry.error = true; };
  img.src = src;
  IMAGE_CACHE.set(src, entry);
  return entry;
}

function drawImageAsset(ctx, src, x, y, w, h, alpha = 1) {
  const entry = getImageAsset(src);
  if (!entry?.loaded) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(entry.image, x, y, w, h);
  ctx.restore();
  return true;
}

function heroBasePath(character) {
  return `${HERO_ASSET_ROOT}/${character}/base.png?v=${HERO_ASSET_VERSION}`;
}

function flierMountPath(character, veterancy = 0) {
  const file = veterancy > 0 ? 'flier_veteran.png' : 'flier.png';
  return `${PET_BATTLE_ASSET_ROOT}/${character}/${file}?v=${PET_BATTLE_ASSET_VERSION}`;
}

function drawBottomCenteredImage(ctx, src, cx, bottomY, width, height, alpha = 1) {
  const entry = getImageAsset(src);
  if (!entry?.loaded) return false;
  const naturalW = entry.image.naturalWidth || width;
  const naturalH = entry.image.naturalHeight || height;
  const scale = Math.min(width / Math.max(1, naturalW), height / Math.max(1, naturalH));
  const drawW = naturalW * scale;
  const drawH = naturalH * scale;
  return drawImageAsset(ctx, src, cx - drawW / 2, bottomY - drawH, drawW, drawH, alpha);
}

// ━━━ World Palettes ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const WORLD_THEMES = {
  grassland: {
    name: 'Grassland',
    sky: ['#6090e8', '#78a8ff', '#5C94FC', '#4e84ea'],
    ground: '#00A800', groundDark: '#005800', groundAccent: '#29d129', groundShadow: '#003d00',
    dirt: '#C84C0C', dirtDark: '#A02800', dirtLight: '#df6d2d',
    hillBase: '#1a8a2e', hillLight: '#2ec446',
    mountainBase: '#2a5aa0', mountainMid: '#3b78d0', mountainSnow: '#d8e8ff',
    treeColors: ['#004d00', '#008000', '#00a800'],
    particles: null,
  },
  fire: {
    name: 'Fire World',
    sky: ['#1a0a00', '#3d1500', '#6b2000', '#8b3000'],
    ground: '#5c2800', groundDark: '#3a1800', groundAccent: '#ff6a20', groundShadow: '#2a1000',
    dirt: '#4a1a08', dirtDark: '#2e0e04', dirtLight: '#6b3020',
    hillBase: '#3a1200', hillLight: '#5c2000',
    mountainBase: '#2a0800', mountainMid: '#4a1500', mountainSnow: '#ff4400',
    treeColors: null,
    particles: { color: '#ff6a20', glow: '#ff4400', type: 'embers' },
  },
  water: {
    name: 'Water World',
    sky: ['#0a2a4a', '#104068', '#186090', '#1878b0'],
    ground: '#1a6878', groundDark: '#0e4a58', groundAccent: '#30b8d8', groundShadow: '#083848',
    dirt: '#0e3848', dirtDark: '#082830', dirtLight: '#185868',
    hillBase: '#104860', hillLight: '#1a6880',
    mountainBase: '#082040', mountainMid: '#0e3060', mountainSnow: '#80d0f0',
    treeColors: null,
    particles: { color: '#60c8e8', glow: '#80e0ff', type: 'bubbles' },
  },
  rock: {
    name: 'Rock World',
    sky: ['#2a2030', '#3a3040', '#504858', '#605060'],
    ground: '#686058', groundDark: '#484040', groundAccent: '#908070', groundShadow: '#383030',
    dirt: '#585048', dirtDark: '#3a3430', dirtLight: '#786858',
    hillBase: '#484040', hillLight: '#606058',
    mountainBase: '#383030', mountainMid: '#504840', mountainSnow: '#a09890',
    treeColors: null,
    particles: { color: '#908880', glow: '#a8a098', type: 'dust' },
  },
  ice: {
    name: 'Ice World',
    sky: ['#0a1828', '#182840', '#284060', '#386088'],
    ground: '#88b8d8', groundDark: '#6898b8', groundAccent: '#c0e8ff', groundShadow: '#5080a0',
    dirt: '#4878a0', dirtDark: '#306088', dirtLight: '#6898c0',
    hillBase: '#6090b0', hillLight: '#88c0e0',
    mountainBase: '#385878', mountainMid: '#5888b0', mountainSnow: '#e0f0ff',
    treeColors: null,
    particles: { color: '#c0e0ff', glow: '#ffffff', type: 'snow' },
  },
};

// ━━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function px(ctx, x, y, size, color, alpha = 1) {
  if (!color) return;
  if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(size), Math.ceil(size));
  if (alpha < 1) ctx.restore();
}

function drawPixelMap(ctx, x, y, ps, rows, palette, alpha = 1) {
  const s = Math.ceil(ps);
  rows.forEach((row, ri) => {
    row.split('').forEach((ch, ci) => {
      if (ch === ' ') return;
      px(ctx, x + ci * ps, y + ri * ps, s, palette[ch], alpha);
    });
  });
}

function drawPixelEllipse(ctx, cx, cy, rx, ry, ps, color, alpha = 1) {
  const s = Math.ceil(ps);
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx / Math.max(1, rx)) ** 2 + (dy / Math.max(1, ry)) ** 2 <= 1)
        px(ctx, cx + dx * ps, cy + dy * ps, s, color, alpha);
    }
  }
}

function lerpHex(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function attackCurve(p) {
  if (p < 0.25) return -p * 2.4;
  if (p < 0.55) return (p - 0.25) * 4.3 - 0.6;
  return 0.69 - (p - 0.55) * 1.53;
}

const AIR_LAYER_HEIGHT = 26;

function getLayerLift(layer, animFrame = 0, bobOffset = 0) {
  if (layer !== 'air') return 0;
  return AIR_LAYER_HEIGHT + Math.sin(animFrame * 0.08 + bobOffset) * 3;
}

// ━━━ Scenery ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawMountainRange(ctx, w, groundY, drift) {
  // Far mountains
  const farColors = ['#6a80b0', '#7890c0', '#8498c4'];
  for (let i = -1; i < 5; i++) {
    const mx = i * 168 - drift * 0.4;
    const mh = 58 + (i % 3) * 24;
    const mw = 145 + (i % 2) * 30;
    ctx.fillStyle = farColors[0];
    ctx.beginPath();
    ctx.moveTo(mx, groundY);
    ctx.lineTo(mx + mw * 0.42, groundY - mh);
    ctx.lineTo(mx + mw * 0.56, groundY - mh * 0.82);
    ctx.lineTo(mx + mw, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = farColors[1];
    ctx.beginPath();
    ctx.moveTo(mx + mw * 0.35, groundY);
    ctx.lineTo(mx + mw * 0.42, groundY - mh);
    ctx.lineTo(mx + mw * 0.56, groundY - mh * 0.82);
    ctx.lineTo(mx + mw * 0.62, groundY);
    ctx.closePath();
    ctx.fill();
    if (mh > 65) {
      ctx.fillStyle = '#d8e4f4';
      ctx.beginPath();
      ctx.moveTo(mx + mw * 0.38, groundY - mh * 0.84);
      ctx.lineTo(mx + mw * 0.42, groundY - mh);
      ctx.lineTo(mx + mw * 0.46, groundY - mh * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#eef2fa';
      ctx.beginPath();
      ctx.moveTo(mx + mw * 0.40, groundY - mh * 0.92);
      ctx.lineTo(mx + mw * 0.42, groundY - mh);
      ctx.lineTo(mx + mw * 0.44, groundY - mh * 0.95);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Near mountains
  for (let i = -1; i < 4; i++) {
    const mx = i * 200 + 80 - drift * 0.8;
    const mh = 42 + (i % 2) * 16;
    const mw = 170;
    ctx.fillStyle = '#486888';
    ctx.beginPath();
    ctx.moveTo(mx, groundY);
    ctx.lineTo(mx + mw * 0.46, groundY - mh);
    ctx.lineTo(mx + mw, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a7ca0';
    ctx.beginPath();
    ctx.moveTo(mx + mw * 0.3, groundY);
    ctx.lineTo(mx + mw * 0.46, groundY - mh);
    ctx.lineTo(mx + mw * 0.52, groundY - mh * 0.68);
    ctx.lineTo(mx + mw * 0.48, groundY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPixelTree(ctx, x, y, ps, variant) {
  const v = variant % 3;
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(x - ps, y - 6 * ps, 2 * ps, 6 * ps);
  ctx.fillStyle = WOOD.mid;
  ctx.fillRect(x, y - 5 * ps, ps, 4 * ps);
  if (v === 0) {
    drawPixelEllipse(ctx, x, y - 9 * ps, 4, 4, ps, '#1a6a2a');
    drawPixelEllipse(ctx, x - ps, y - 10 * ps, 3, 3, ps, '#2a8a3a');
    drawPixelEllipse(ctx, x + ps, y - 11 * ps, 2, 2, ps, '#3aaa4a');
    px(ctx, x - ps, y - 12 * ps, ps, '#50c060', 0.8);
  } else if (v === 1) {
    for (let row = 0; row < 3; row++) {
      const w = 4 - row;
      ctx.fillStyle = ['#1a5a2a', '#2a7a3a', '#3a9a4a'][row];
      ctx.fillRect(x - w * ps, y - (8 + row * 2.5) * ps, w * 2 * ps, 2.5 * ps);
    }
    px(ctx, x, y - 15 * ps, ps, '#4ab05a');
  } else {
    drawPixelEllipse(ctx, x, y - 8 * ps, 3, 3, ps, '#2a6a2a');
    drawPixelEllipse(ctx, x + ps, y - 9 * ps, 2, 2, ps, '#3a8a3a');
    drawPixelEllipse(ctx, x - 2 * ps, y - 10 * ps, 2, 1, ps, '#4a9a4a');
  }
}

function drawCloud(ctx, x, y, scale, variant) {
  const ps = Math.max(2, Math.round(scale));
  const white = '#ffffff';
  const light = '#eef4ff';
  const mid = '#d4ddf0';
  const shadow = '#b0bcd4';
  const deep = '#94a4c0';

  if (variant === 0) {
    drawPixelEllipse(ctx, x, y + ps, 9, 3, ps, deep);
    drawPixelEllipse(ctx, x - 2 * ps, y - ps, 7, 4, ps, shadow);
    drawPixelEllipse(ctx, x + 3 * ps, y, 6, 3, ps, shadow);
    drawPixelEllipse(ctx, x, y, 8, 3, ps, mid);
    drawPixelEllipse(ctx, x - 2 * ps, y - ps, 5, 3, ps, light);
    drawPixelEllipse(ctx, x + 2 * ps, y, 4, 2, ps, light);
    drawPixelEllipse(ctx, x - 2 * ps, y - 2 * ps, 3, 2, ps, white);
    drawPixelEllipse(ctx, x + ps, y - ps, 2, 1, ps, white);
  } else if (variant === 1) {
    drawPixelEllipse(ctx, x, y, 5, 2, ps, shadow);
    drawPixelEllipse(ctx, x - ps, y - ps, 4, 2, ps, mid);
    drawPixelEllipse(ctx, x + 2 * ps, y, 3, 2, ps, mid);
    drawPixelEllipse(ctx, x, y - ps, 3, 1, ps, light);
    drawPixelEllipse(ctx, x - ps, y - ps, 2, 1, ps, white);
  } else {
    drawPixelEllipse(ctx, x, y, 11, 2, ps, deep);
    drawPixelEllipse(ctx, x - ps, y - ps, 9, 2, ps, shadow);
    drawPixelEllipse(ctx, x + 2 * ps, y, 7, 1, ps, mid);
    drawPixelEllipse(ctx, x - 3 * ps, y - ps, 4, 1, ps, light);
    drawPixelEllipse(ctx, x + 4 * ps, y, 3, 1, ps, light);
    px(ctx, x - 5 * ps, y - 2 * ps, ps, white, 0.6);
  }
}

function drawHill(ctx, x, y, width, height) {
  ctx.fillStyle = SMB_PALETTE.grassDark;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + width * 0.3, y - height, x + width * 0.5, y - height * 0.85);
  ctx.quadraticCurveTo(x + width * 0.7, y - height * 0.55, x + width, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(6, 96, 16, 0.5)';
  ctx.beginPath();
  ctx.moveTo(x + width * 0.18, y);
  ctx.quadraticCurveTo(x + width * 0.34, y - height * 0.62, x + width * 0.54, y - height * 0.48);
  ctx.quadraticCurveTo(x + width * 0.7, y - height * 0.36, x + width * 0.84, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(30, 130, 30, 0.35)';
  ctx.beginPath();
  ctx.moveTo(x + width * 0.22, y);
  ctx.quadraticCurveTo(x + width * 0.38, y - height * 0.5, x + width * 0.5, y - height * 0.42);
  ctx.quadraticCurveTo(x + width * 0.6, y - height * 0.3, x + width * 0.72, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + width * 0.24, y - height * 0.18);
  ctx.quadraticCurveTo(x + width * 0.42, y - height * 0.62, x + width * 0.58, y - height * 0.26);
  ctx.stroke();
}

export function getBattlefieldGroundY(h) {
  return Math.min(h * 0.742, h - 102);
}

export function drawBattlefield(ctx, w, h, state, reducedMotion, world) {
  const theme = WORLD_THEMES[world] || WORLD_THEMES.grassland;
  const groundY = getBattlefieldGroundY(h);

  // Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0, theme.sky[0]);
  skyGrad.addColorStop(0.35, theme.sky[1]);
  skyGrad.addColorStop(0.7, theme.sky[2]);
  skyGrad.addColorStop(1, theme.sky[3]);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, groundY + 20);

  const drift = reducedMotion ? 0 : (state.cameraX || 0) * 0.25;

  // Mountains (tinted per world)
  drawWorldMountains(ctx, w, groundY, drift, theme);

  // Clouds (skip in fire/rock worlds, use themed tint)
  if (world !== 'fire' && world !== 'rock') {
    const cloudAlpha = world === 'ice' ? 0.6 : 1;
    const cloudConfigs = [
      { x: 0, y: 48, v: 0 }, { x: 190, y: 36, v: 1 }, { x: 380, y: 58, v: 2 },
      { x: 130, y: 28, v: 1 }, { x: 320, y: 44, v: 0 }, { x: 500, y: 52, v: 2 },
    ];
    ctx.save();
    if (cloudAlpha < 1) ctx.globalAlpha = cloudAlpha;
    cloudConfigs.forEach(({ x: cx, y: cy, v }) => {
      drawCloud(ctx, ((cx - drift * 3.5) % (w + 300)) - 100, cy, 3.5, v);
    });
    ctx.restore();
  }

  // Particles (embers, bubbles, snow, dust)
  if (theme.particles && !reducedMotion) {
    drawWorldParticles(ctx, w, groundY, drift, state.animFrame || 0, theme.particles);
  }

  // Hills
  for (let i = -1; i < 4; i++) {
    drawWorldHill(ctx, i * 176 - drift * 2, groundY, 228, 96 - (i % 2) * 16, theme);
  }

  // Trees (only grassland)
  if (theme.treeColors) {
    const treePx = 3;
    const treePositions = [60, 150, 240, 340, 440, 520];
    treePositions.forEach((tx, i) => {
      drawPixelTree(ctx, ((tx - drift * 1.8) % (w + 100)) - 40, groundY, treePx, i);
    });
  }

  const airBandY = groundY - AIR_LAYER_HEIGHT - 16;
  const airGrad = ctx.createLinearGradient(0, airBandY - 22, 0, airBandY + 12);
  airGrad.addColorStop(0, 'rgba(220, 242, 255, 0)');
  airGrad.addColorStop(0.35, 'rgba(220, 242, 255, 0.14)');
  airGrad.addColorStop(1, 'rgba(220, 242, 255, 0)');
  ctx.fillStyle = airGrad;
  ctx.fillRect(0, airBandY - 24, w, 36);
  ctx.strokeStyle = 'rgba(236, 247, 255, 0.32)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(0, airBandY);
  ctx.lineTo(w, airBandY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 7; i++) {
    const sx = (((i * 92) - drift * 2.4) % (w + 120)) - 30;
    ctx.fillRect(sx, airBandY - 6 - (i % 2) * 4, 18, 2);
    ctx.fillRect(sx + 6, airBandY - 9 - (i % 2) * 3, 10, 2);
  }

  // World-specific decorations
  if (world === 'fire') drawFireDecor(ctx, w, groundY, drift);
  else if (world === 'ice') drawIceDecor(ctx, w, groundY, drift);
  else if (world === 'rock') drawRockDecor(ctx, w, groundY, drift);
  else if (world === 'water') drawWaterDecor(ctx, w, groundY, drift);

  // Ground layers
  ctx.fillStyle = theme.groundDark;
  ctx.fillRect(0, groundY - 4, w, 18);
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, groundY, w, 10);
  ctx.fillStyle = theme.groundAccent;
  ctx.fillRect(0, groundY + 2, w, 2);
  ctx.fillStyle = theme.groundShadow;
  ctx.fillRect(0, groundY + 10, w, 4);
  ctx.fillStyle = theme.dirtLight;
  ctx.fillRect(0, groundY + 14, w, h - groundY - 14);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, groundY + 14, w, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, groundY + 17, w, 6);

  // Brick/block pattern
  const brickW = 26, brickH = 16;
  for (let y = groundY + 30; y < h; y += brickH) {
    for (let x2 = ((Math.floor(y / brickH) % 2) * (brickW / 2)) - brickW; x2 < w + brickW; x2 += brickW) {
      ctx.fillStyle = theme.dirt;
      ctx.fillRect(x2, y, brickW - 2, brickH - 2);
      ctx.fillStyle = theme.dirtDark;
      ctx.fillRect(x2 + 2, y + brickH - 6, brickW - 8, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x2 + 2, y + 2, brickW - 9, 2);
    }
  }
}

// ━━━ World-specific scenery helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawWorldMountains(ctx, w, groundY, drift, theme) {
  const peaks = [
    { x: 0, w: 180, h: 120 }, { x: 160, w: 220, h: 150 }, { x: 360, w: 200, h: 130 },
    { x: 520, w: 240, h: 160 }, { x: 700, w: 180, h: 110 },
  ];
  peaks.forEach(({ x: mx, w: mw, h: mh }) => {
    const sx = ((mx - drift * 0.6) % (w + 300)) - 100;
    ctx.fillStyle = theme.mountainBase;
    ctx.beginPath();
    ctx.moveTo(sx, groundY);
    ctx.lineTo(sx + mw / 2, groundY - mh);
    ctx.lineTo(sx + mw, groundY);
    ctx.fill();
    // Mid highlight
    ctx.fillStyle = theme.mountainMid;
    ctx.beginPath();
    ctx.moveTo(sx + mw * 0.15, groundY);
    ctx.lineTo(sx + mw / 2, groundY - mh * 0.85);
    ctx.lineTo(sx + mw * 0.55, groundY);
    ctx.fill();
    // Snow/glow cap
    ctx.fillStyle = theme.mountainSnow;
    ctx.beginPath();
    ctx.moveTo(sx + mw * 0.35, groundY - mh * 0.6);
    ctx.lineTo(sx + mw / 2, groundY - mh);
    ctx.lineTo(sx + mw * 0.65, groundY - mh * 0.6);
    ctx.fill();
  });
}

function drawWorldHill(ctx, x, groundY, width, height, theme) {
  ctx.fillStyle = theme.hillBase;
  ctx.beginPath();
  ctx.ellipse(x + width / 2, groundY + 8, width / 2, height, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = theme.hillLight;
  ctx.beginPath();
  ctx.ellipse(x + width / 2 - 20, groundY + 8, width / 3, height * 0.6, 0, Math.PI, 0);
  ctx.fill();
}

function drawWorldParticles(ctx, w, groundY, drift, animFrame, p) {
  const count = p.type === 'snow' ? 28 : p.type === 'embers' ? 18 : 14;
  for (let i = 0; i < count; i++) {
    const seed = i * 137.5;
    let px2, py;
    if (p.type === 'snow') {
      px2 = ((seed + animFrame * 0.3 + Math.sin(i * 0.7) * 40 - drift * 2) % (w + 40)) - 20;
      py = ((seed * 2.3 + animFrame * 0.8) % (groundY + 20)) - 10;
    } else if (p.type === 'embers') {
      px2 = ((seed + Math.sin(animFrame * 0.02 + i) * 30 - drift * 1.5) % (w + 40)) - 20;
      py = groundY - 10 - ((seed * 1.7 + animFrame * 1.2) % (groundY * 0.7));
    } else if (p.type === 'bubbles') {
      px2 = ((seed - drift * 1.8) % (w + 40)) - 20;
      py = groundY - 10 - ((seed * 2 + animFrame * 0.6) % (groundY * 0.6));
    } else {
      px2 = ((seed + animFrame * 0.15 - drift * 2.5) % (w + 40)) - 20;
      py = groundY - ((seed * 1.2 + animFrame * 0.4) % 60) - 5;
    }
    const size = (p.type === 'snow' ? 2.5 : p.type === 'embers' ? 2 : 1.5) + (i % 3) * 0.5;
    const alpha = 0.3 + (Math.sin(animFrame * 0.03 + i) + 1) * 0.3;
    ctx.fillStyle = (i % 3 === 0) ? p.glow : p.color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(Math.floor(px2), Math.floor(py), Math.ceil(size), Math.ceil(size));
  }
  ctx.globalAlpha = 1;
}

function drawFireDecor(ctx, w, groundY, drift) {
  // Lava pools along the ground
  const pools = [80, 250, 420, 580];
  pools.forEach((px2, i) => {
    const sx = ((px2 - drift * 1.5) % (w + 100)) - 50;
    const pw = 30 + (i % 2) * 15;
    ctx.fillStyle = '#ff4400';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(sx, groundY - 2, pw, 4);
    ctx.fillStyle = '#ff8800';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(sx + 4, groundY - 1, pw - 8, 2);
    ctx.globalAlpha = 1;
  });
}

function drawWaterDecor(ctx, w, groundY, drift) {
  // Water ripple lines
  const ripples = [60, 180, 310, 470];
  ripples.forEach((px2) => {
    const sx = ((px2 - drift * 2) % (w + 100)) - 50;
    ctx.fillStyle = 'rgba(96,200,232,0.3)';
    ctx.fillRect(sx, groundY - 6, 40, 2);
    ctx.fillRect(sx + 10, groundY - 3, 25, 1);
  });
}

function drawRockDecor(ctx, w, groundY, drift) {
  // Small boulders
  const rocks = [90, 200, 350, 500];
  rocks.forEach((px2, i) => {
    const sx = ((px2 - drift * 1.6) % (w + 100)) - 50;
    const rw = 10 + (i % 3) * 5;
    const rh = 6 + (i % 2) * 4;
    ctx.fillStyle = '#585050';
    ctx.beginPath();
    ctx.ellipse(sx + rw / 2, groundY - rh / 2 + 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#706860';
    ctx.beginPath();
    ctx.ellipse(sx + rw / 2 - 2, groundY - rh / 2, rw / 3, rh / 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawIceDecor(ctx, w, groundY, drift) {
  // Ice crystals
  const crystals = [70, 220, 380, 530];
  crystals.forEach((px2, i) => {
    const sx = ((px2 - drift * 1.4) % (w + 100)) - 50;
    const ch = 12 + (i % 3) * 6;
    ctx.fillStyle = 'rgba(192,224,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(sx, groundY);
    ctx.lineTo(sx + 3, groundY - ch);
    ctx.lineTo(sx + 6, groundY);
    ctx.fill();
    ctx.fillStyle = 'rgba(224,240,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(sx + 1, groundY);
    ctx.lineTo(sx + 3, groundY - ch * 0.7);
    ctx.lineTo(sx + 4, groundY);
    ctx.fill();
  });
}

// ━━━ Castles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawCastle(ctx, x, y, scale, mainColor, darkColor, flagColor, hpRatio, facingLeft = false) {
  const ps = Math.max(2, Math.round(scale));
  const baseW = 18 * ps;
  const baseH = 20 * ps;
  const left = x - baseW / 2;
  const top = y - baseH;

  ctx.fillStyle = darkColor;
  ctx.fillRect(left, top + 3 * ps, baseW, baseH - 3 * ps);
  ctx.fillStyle = mainColor;
  ctx.fillRect(left + ps, top + 4 * ps, baseW - 2 * ps, baseH - 4 * ps);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(left + 2 * ps, top + 5 * ps, baseW * 0.45, 2 * ps);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(left + baseW * 0.58, top + 4 * ps, baseW * 0.22, baseH - 6 * ps);
  ctx.fillStyle = darkColor;
  ctx.fillRect(left + 4 * ps, top + 11 * ps, 4 * ps, 8 * ps);
  ctx.fillRect(left + 10 * ps, top + 11 * ps, 4 * ps, 8 * ps);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = darkColor;
    ctx.fillRect(left + (i * 4 + 1) * ps, top, 3 * ps, 4 * ps);
  }
  for (let row = 0; row < 3; row++) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(left + 2 * ps, top + (row * 4 + 6) * ps, baseW * 0.28, ps);
  }
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    ctx.beginPath();
    ctx.moveTo(left + ps, top + (row * 4 + 6) * ps);
    ctx.lineTo(left + baseW - ps, top + (row * 4 + 6) * ps);
    ctx.stroke();
  }
  const poleX = facingLeft ? left + baseW - 3 * ps : left + 3 * ps;
  ctx.fillStyle = SMB_PALETTE.black;
  ctx.fillRect(poleX, top - 8 * ps, ps, 12 * ps);
  ctx.fillStyle = flagColor;
  ctx.beginPath();
  ctx.moveTo(poleX + ps, top - 8 * ps);
  ctx.lineTo(poleX + (facingLeft ? -5 : 5) * ps, top - 5 * ps);
  ctx.lineTo(poleX + ps, top - 2 * ps);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(left + 6 * ps, top + 7 * ps, 2 * ps, 2 * ps);
  ctx.fillRect(left + 11 * ps, top + 7 * ps, 2 * ps, 2 * ps);

  const barW = baseW;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(left, top - 14 * ps, barW, 3 * ps);
  ctx.fillStyle = hpRatio > 0.45 ? '#44dd66' : hpRatio > 0.2 ? SMB_PALETTE.gold : '#ff6666';
  ctx.fillRect(left, top - 14 * ps, barW * Math.max(0, Math.min(1, hpRatio)), 3 * ps);
}

export function drawPlayerBase(ctx, x, y, scale, character, hp, maxHp) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  drawCastle(ctx, x, y, scale, SMB_PALETTE.brick, SMB_PALETTE.brickDark, colors.accent, hp / Math.max(1, maxHp), false);
}

export function drawEnemyBase(ctx, x, y, scale, hp, maxHp) {
  drawCastle(ctx, x, y, scale, '#684180', '#2e163b', SMB_PALETTE.red, hp / Math.max(1, maxHp), true);
}

// ━━━ Character Head Features ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawCharFeatures(ctx, hx, hy, ps, c, character, clipped) {
  if (character === 'dojocat' || character === 'pixiu') {
    const earBase = clipped ? 3 : 4;
    for (let i = 0; i < earBase; i++) {
      px(ctx, hx - 6 * ps + i * ps, hy - (5 + i) * ps, ps, c.outline);
      px(ctx, hx + 6 * ps - i * ps, hy - (5 + i) * ps, ps, c.outline);
    }
    for (let i = 0; i < earBase - 1; i++) {
      px(ctx, hx - 5 * ps + i * ps, hy - (5 + i) * ps, ps, c.accent);
      px(ctx, hx + 5 * ps - i * ps, hy - (5 + i) * ps, ps, c.accent);
    }
  }
  if (character === 'buu') {
    px(ctx, hx, hy - 6 * ps, ps, c.accent);
    px(ctx, hx, hy - 7 * ps, ps, c.accent);
    drawPixelEllipse(ctx, hx, hy - 8 * ps, 1, 1, ps, c.accent);
  }
  if (character === 'devit') {
    for (let i = 0; i < 3; i++) {
      px(ctx, hx - 5 * ps - i * ps, hy - (5 + i) * ps, ps, c.accent);
      px(ctx, hx + 5 * ps + i * ps, hy - (5 + i) * ps, ps, c.accent);
    }
  }
  if (character === 'pixiu') {
    px(ctx, hx - 8 * ps, hy + ps, ps, c.accent);
    px(ctx, hx + 8 * ps, hy + ps, ps, c.accent);
    px(ctx, hx - 8 * ps, hy + 3 * ps, ps, c.accent, 0.6);
    px(ctx, hx + 8 * ps, hy + 3 * ps, ps, c.accent, 0.6);
  }
}

function drawFace(ctx, hx, hy, ps, c, attacking, expression) {
  const eyeSpread = 3;
  if (attacking) {
    // Effort squint
    ctx.fillStyle = c.eye;
    ctx.fillRect(hx - (eyeSpread + 1) * ps, hy + ps, 2 * ps, ps);
    ctx.fillRect(hx + eyeSpread * ps, hy + ps, 2 * ps, ps);
    // Grit mouth
    ctx.fillStyle = c.nose;
    ctx.fillRect(hx - ps, hy + 3 * ps, 2 * ps, ps);
    px(ctx, hx - 2 * ps, hy + 3 * ps, ps, c.nose, 0.5);
    px(ctx, hx + 2 * ps, hy + 3 * ps, ps, c.nose, 0.5);
  } else if (expression === 'proud') {
    // Happy arc eyes
    px(ctx, hx - (eyeSpread + 1) * ps, hy, ps, c.eye);
    px(ctx, hx - eyeSpread * ps, hy + ps, ps, c.eye);
    px(ctx, hx - (eyeSpread - 1) * ps, hy, ps, c.eye);
    px(ctx, hx + (eyeSpread - 1) * ps, hy, ps, c.eye);
    px(ctx, hx + eyeSpread * ps, hy + ps, ps, c.eye);
    px(ctx, hx + (eyeSpread + 1) * ps, hy, ps, c.eye);
    // Smile
    px(ctx, hx - ps, hy + 3 * ps, ps, c.nose);
    px(ctx, hx, hy + 3 * ps, ps, c.nose);
    px(ctx, hx + ps, hy + 3 * ps, ps, c.nose);
    px(ctx, hx - 2 * ps, hy + 2 * ps, ps, c.nose, 0.5);
    px(ctx, hx + 2 * ps, hy + 2 * ps, ps, c.nose, 0.5);
  } else {
    // Normal eyes with highlights
    drawPixelEllipse(ctx, hx - eyeSpread * ps, hy + ps, 1, 1, ps, c.eye);
    drawPixelEllipse(ctx, hx + eyeSpread * ps, hy + ps, 1, 1, ps, c.eye);
    px(ctx, hx - (eyeSpread - 1) * ps, hy, ps, '#ffffff');
    px(ctx, hx + (eyeSpread + 1) * ps, hy, ps, '#ffffff');
    // Blush
    px(ctx, hx - 5 * ps, hy + 2 * ps, ps, c.accent, 0.3);
    px(ctx, hx + 5 * ps, hy + 2 * ps, ps, c.accent, 0.3);
    // Mouth
    px(ctx, hx - ps, hy + 3 * ps, ps, c.nose);
    px(ctx, hx, hy + 3 * ps, ps, c.nose);
  }
}

const PLAYER_UNIT_BASE_SIZES = {
  meatshield: 8,
  brawler: 10.8,
  ranged: 9.5,
  flier: 9.8,
  tank: 14.2,
};

const FLIER_LAYOUTS = {
  dojocat: { width: 16, height: 10, seatYOffset: -2.4 },
  buu: { width: 18, height: 11, seatYOffset: -1.8 },
  devit: { width: 16, height: 9, seatYOffset: -2.8 },
  pixiu: { width: 18, height: 11, seatYOffset: -2.6 },
};

function drawHeroPilot(ctx, character, x, seatY, ps, pilotScaleAdjust = 0.74, veterancy = 0) {
  const size = Math.max(18, Math.round(ps * 11 * pilotScaleAdjust));
  const bottomY = seatY + size * 0.62;
  const loaded = drawBottomCenteredImage(ctx, heroBasePath(character), x, bottomY, size, size);
  if (!loaded) return false;
  if (veterancy > 0) {
    const trim = lerpHex(CHAR_COLORS[character]?.accent || '#ffd36c', '#ffffff', 0.35);
    ctx.fillStyle = trim;
    ctx.fillRect(x - size * 0.18, bottomY - size + size * 0.08, size * 0.36, Math.max(2, ps));
    if (veterancy > 1) {
      ctx.fillRect(x - size * 0.1, bottomY - size - Math.max(2, ps), size * 0.2, Math.max(2, ps));
    }
  }
  return true;
}

function drawVeterancyTrim(ctx, unit, x, fy, ps, c) {
  const vet = unit.veterancy || 0;
  if (!vet) return;
  const trim = lerpHex(c.accent, '#ffffff', 0.35);
  ctx.fillStyle = trim;
  ctx.fillRect(x - 4 * ps, fy - 13 * ps, 8 * ps, ps);
  if (vet >= 2) {
    ctx.fillRect(x - 6 * ps, fy - 3 * ps, 3 * ps, ps);
    ctx.fillRect(x + 3 * ps, fy - 3 * ps, 3 * ps, ps);
  }
  if (vet >= 3) {
    ctx.fillRect(x + 5 * ps, fy - 18 * ps, ps, 6 * ps);
    ctx.fillRect(x + 6 * ps, fy - 18 * ps, 2 * ps, 2 * ps);
  }
}

function drawAccessoryTrim(ctx, unit, x, fy, ps, c) {
  const accentBright = lerpHex(c.accent, '#ffffff', 0.28);
  switch (unit.accessoryKey) {
    case 'wrap_guard':
      ctx.fillStyle = accentBright;
      ctx.fillRect(x - 3 * ps, fy - 10 * ps, 6 * ps, ps);
      ctx.fillRect(x - 6 * ps, fy - 6 * ps, 2 * ps, ps);
      ctx.fillRect(x + 4 * ps, fy - 6 * ps, 2 * ps, ps);
      break;
    case 'dojo_brawler':
      ctx.fillStyle = WOOD.dark;
      ctx.fillRect(x - 9 * ps, fy - 16 * ps, ps, 8 * ps);
      ctx.fillRect(x - 11 * ps, fy - 10 * ps, 5 * ps, ps);
      ctx.fillStyle = accentBright;
      ctx.fillRect(x - 4 * ps, fy - 8 * ps, 8 * ps, ps);
      break;
    case 'sky_monk':
      ctx.fillStyle = accentBright;
      ctx.fillRect(x - ps, fy - 15 * ps, 2 * ps, 5 * ps);
      ctx.fillStyle = '#f6e6ba';
      for (let bead = -4; bead <= 4; bead += 2) px(ctx, x + bead * ps * 0.5, fy - 11 * ps, ps, '#f6e6ba');
      break;
    case 'temple_tank':
      ctx.fillStyle = accentBright;
      ctx.fillRect(x - 5 * ps, fy - 4 * ps, 10 * ps, 2 * ps);
      ctx.fillRect(x - ps, fy - 19 * ps, 2 * ps, 4 * ps);
      break;
    case 'blob_guard':
      ctx.fillStyle = '#ffd36c';
      ctx.fillRect(x - 2 * ps, fy - 14 * ps, 4 * ps, ps);
      ctx.fillRect(x - ps, fy - 3 * ps, 2 * ps, 2 * ps);
      break;
    case 'buu_brawler':
      ctx.fillStyle = '#ffd36c';
      ctx.fillRect(x - 5 * ps, fy - 5 * ps, 10 * ps, 2 * ps);
      ctx.fillRect(x - 2 * ps, fy - 16 * ps, 4 * ps, ps);
      break;
    case 'bubble_mage':
      ctx.fillStyle = accentBright;
      drawPixelEllipse(ctx, x + 6 * ps, fy - 12 * ps, 2, 2, ps, accentBright, 0.85);
      ctx.fillStyle = '#ffffff';
      px(ctx, x + 6 * ps, fy - 13 * ps, ps, '#ffffff');
      break;
    case 'mega_buu':
      ctx.fillStyle = '#ffd36c';
      ctx.fillRect(x - 6 * ps, fy - 11 * ps, 3 * ps, 2 * ps);
      ctx.fillRect(x + 3 * ps, fy - 11 * ps, 3 * ps, 2 * ps);
      ctx.fillRect(x - ps, fy - 4 * ps, 2 * ps, 3 * ps);
      break;
    case 'imp_guard':
      ctx.fillStyle = c.accent;
      ctx.fillRect(x - 4 * ps, fy - 12 * ps, 8 * ps, ps);
      px(ctx, x - 3 * ps, fy - 13 * ps, ps, '#ffffff', 0.5);
      px(ctx, x + 2 * ps, fy - 13 * ps, ps, '#ffffff', 0.5);
      break;
    case 'hell_brawler':
      ctx.fillStyle = c.accent;
      ctx.fillRect(x - 7 * ps, fy - 9 * ps, 2 * ps, ps);
      ctx.fillRect(x + 5 * ps, fy - 9 * ps, 2 * ps, ps);
      ctx.fillStyle = METAL.light;
      ctx.fillRect(x - 4 * ps, fy - 5 * ps, 8 * ps, ps);
      break;
    case 'infernal_pike':
      ctx.fillStyle = c.accent;
      ctx.fillRect(x + 6 * ps, fy - 18 * ps, ps, 8 * ps);
      ctx.fillRect(x + 5 * ps, fy - 18 * ps, 3 * ps, 2 * ps);
      break;
    case 'abyss_tank':
      ctx.fillStyle = c.accent;
      ctx.fillRect(x - 6 * ps, fy - 16 * ps, 3 * ps, 2 * ps);
      ctx.fillRect(x + 3 * ps, fy - 16 * ps, 3 * ps, 2 * ps);
      ctx.fillRect(x - 2 * ps, fy - 3 * ps, 4 * ps, 2 * ps);
      break;
    case 'coin_guard':
      ctx.fillStyle = '#f6d36c';
      drawPixelEllipse(ctx, x, fy - 10 * ps, 2, 2, ps, '#f6d36c');
      ctx.fillStyle = accentBright;
      ctx.fillRect(x - 4 * ps, fy - 4 * ps, 8 * ps, ps);
      break;
    case 'jade_brawler':
      ctx.fillStyle = accentBright;
      ctx.fillRect(x - 6 * ps, fy - 6 * ps, 2 * ps, 4 * ps);
      ctx.fillRect(x + 4 * ps, fy - 6 * ps, 2 * ps, 4 * ps);
      break;
    case 'jade_lantern':
      ctx.fillStyle = '#f6d36c';
      drawPixelEllipse(ctx, x + 6 * ps, fy - 12 * ps, 2, 3, ps, '#f6d36c');
      ctx.fillStyle = accentBright;
      ctx.fillRect(x - ps, fy - 15 * ps, 2 * ps, 4 * ps);
      break;
    case 'celestial_guardian':
      ctx.fillStyle = '#f6d36c';
      ctx.fillRect(x - 5 * ps, fy - 16 * ps, 10 * ps, ps);
      ctx.fillStyle = accentBright;
      ctx.fillRect(x - 5 * ps, fy - 4 * ps, 10 * ps, 2 * ps);
      break;
    default:
      break;
  }
}

function drawFallbackFlierMount(ctx, unit, x, fy, groundY, ps, c, character, unitAnim) {
  const flap = Math.sin(unitAnim * 0.22);
  drawPixelEllipse(ctx, x, groundY - 1, 5, 1, ps, 'rgba(0,0,0,0.12)');
  if (character === 'dojocat') {
    const rotor = Math.sin(unitAnim * 0.55) * 2 * ps;
    drawPixelEllipse(ctx, x, fy, 6, 4, ps, c.outline);
    drawPixelEllipse(ctx, x, fy, 5, 3, ps, lerpHex(c.body, '#ffffff', 0.08));
    ctx.fillStyle = WOOD.mid;
    ctx.fillRect(x - ps, fy - 8 * ps, 2 * ps, 6 * ps);
    ctx.fillStyle = c.accent;
    ctx.fillRect(x - 7 * ps - rotor, fy - 9 * ps, 14 * ps + rotor * 2, ps);
    ctx.fillRect(x + 6 * ps, fy - ps, 4 * ps, ps);
  } else if (character === 'buu') {
    drawPixelEllipse(ctx, x, fy + ps, 7, 3, ps, '#b85c95');
    drawPixelEllipse(ctx, x, fy, 6, 2, ps, '#f29dc5');
    drawPixelEllipse(ctx, x, fy - 3 * ps, 3, 2, ps, '#e7f4ff', 0.85);
    ctx.fillStyle = '#ffd36c';
    ctx.fillRect(x - ps, fy + 2 * ps, 2 * ps, ps);
    ctx.fillRect(x - 9 * ps, fy + ps, 2 * ps, ps);
    ctx.fillRect(x + 7 * ps, fy + ps, 2 * ps, ps);
  } else if (character === 'devit') {
    ctx.fillStyle = WOOD.dark;
    ctx.fillRect(x - ps, fy - 7 * ps, 2 * ps, 12 * ps);
    ctx.fillStyle = c.accent;
    ctx.fillRect(x - 5 * ps, fy - 9 * ps, 10 * ps, 2 * ps);
    ctx.fillRect(x - 7 * ps, fy - 11 * ps, 2 * ps, 4 * ps);
    ctx.fillRect(x + 5 * ps, fy - 11 * ps, 2 * ps, 4 * ps);
    drawPixelEllipse(ctx, x, fy + 2 * ps, 4, 1, ps, c.accent, 0.22 + Math.abs(flap) * 0.08);
  } else {
    drawPixelEllipse(ctx, x - 2 * ps, fy, 6, 3, ps, '#7bc7ff');
    drawPixelEllipse(ctx, x + 4 * ps, fy - ps, 5, 3, ps, '#99e7ff');
    ctx.fillStyle = '#f6d36c';
    ctx.fillRect(x - ps, fy - 3 * ps, 2 * ps, 6 * ps);
    ctx.fillStyle = c.accent;
    ctx.fillRect(x - 9 * ps, fy - 2 * ps, 3 * ps, ps);
    ctx.fillRect(x + 7 * ps, fy - 2 * ps, 3 * ps, ps);
  }
}

function drawCharacterFlierMount(ctx, unit, x, fy, groundY, ps, c, character, unitAnim) {
  const layout = FLIER_LAYOUTS[character] || FLIER_LAYOUTS.dojocat;
  const mountW = Math.round(ps * layout.width);
  const mountH = Math.round(ps * layout.height);
  const mountBottomY = fy + ps * 5.5;
  const hasMountAsset = drawBottomCenteredImage(
    ctx,
    flierMountPath(character, unit.veterancy || 0),
    x,
    mountBottomY,
    mountW,
    mountH,
  );

  if (!hasMountAsset) drawFallbackFlierMount(ctx, unit, x, fy + ps * 1.5, groundY, ps, c, character, unitAnim);
  if ((unit.veterancy || 0) > 0) {
    const trim = lerpHex(c.accent, '#ffffff', 0.35);
    ctx.fillStyle = trim;
    ctx.fillRect(x - ps, mountBottomY - mountH - ps, 2 * ps, ps);
    if ((unit.veterancy || 0) > 1) ctx.fillRect(x + 4 * ps, mountBottomY - mountH * 0.55, ps, 3 * ps);
  }
  drawHeroPilot(ctx, character, x, fy + ps * layout.seatYOffset, ps, unit.pilotScaleAdjust, unit.veterancy || 0);
}

// ━━━ Player Unit Type Renderers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function drawMeatshieldBody(ctx, x, fy, ps, c, character, walk, atk, atkP) {
  // Small zippy warrior with shield + sword. Headband.
  const headCY = fy - 16 * ps;
  const bodyCY = fy - 8 * ps;
  const variation = (walk * 0.01) || 0;
  const bob = -Math.abs(walk) * 0.8 * ps;
  const atkSwing = atk ? attackCurve(atkP) : 0;
  const lunge = atkSwing * 3 * ps;

  // Shadow
  drawPixelEllipse(ctx, x, fy, 4, 1, ps, 'rgba(0,0,0,0.13)');

  // Legs
  const lLeg = walk > 0 ? -walk * 2 * ps : 0;
  const rLeg = walk < 0 ? walk * 2 * ps : 0;
  ctx.fillStyle = c.outline;
  ctx.fillRect(x - 3 * ps, fy - 5 * ps + lLeg, 2 * ps, 5 * ps - lLeg);
  ctx.fillRect(x + ps, fy - 5 * ps + rLeg, 2 * ps, 5 * ps - rLeg);
  // Shoes
  ctx.fillStyle = c.dark;
  ctx.fillRect(x - 3 * ps, fy - ps + Math.min(0, lLeg), 3 * ps, ps);
  ctx.fillRect(x + ps, fy - ps + Math.min(0, rLeg), 3 * ps, ps);
  // Leg shading
  ctx.fillStyle = c.body;
  px(ctx, x - 2 * ps, fy - 4 * ps + lLeg, ps, c.body);
  px(ctx, x + ps, fy - 4 * ps + rLeg, ps, c.body);

  // Body
  const bx = x + lunge * 0.3;
  const by = bodyCY + bob;
  drawPixelEllipse(ctx, bx, by, 5, 3, ps, c.outline);
  drawPixelEllipse(ctx, bx, by, 4, 2, ps, c.body);
  drawPixelEllipse(ctx, bx, by + ps, 3, 1, ps, c.belly);
  // Body shading - top highlight
  px(ctx, bx - 2 * ps, by - 2 * ps, ps, c.light, 0.7);
  px(ctx, bx - ps, by - 2 * ps, ps, c.light, 0.5);

  // Shield on left side - drawn as part of the arm
  const shX = bx - 6 * ps;
  const shY = by - ps + bob;
  ctx.fillStyle = c.dark;
  ctx.fillRect(shX - ps, shY - 2 * ps, 3 * ps, 5 * ps);
  ctx.fillStyle = c.accent;
  ctx.fillRect(shX, shY - ps, ps, 3 * ps);
  ctx.fillStyle = lerpHex(c.accent, '#ffffff', 0.3);
  px(ctx, shX, shY - ps, ps, lerpHex(c.accent, '#ffffff', 0.3));
  // Arm connecting shield to body
  ctx.fillStyle = c.outline;
  ctx.fillRect(bx - 5 * ps, by - ps, 2 * ps, 2 * ps);

  // Right arm + sword
  const swordSwing = atkSwing * 5 * ps;
  const armX = bx + 4 * ps + Math.max(0, swordSwing);
  const armY = by - ps;
  ctx.fillStyle = c.outline;
  ctx.fillRect(bx + 3 * ps, armY, Math.max(2 * ps, 2 * ps + swordSwing), 2 * ps);
  // Sword blade
  const bladeX = armX + ps;
  ctx.fillStyle = METAL.light;
  ctx.fillRect(bladeX, armY - 4 * ps, ps, 6 * ps);
  ctx.fillStyle = METAL.shine;
  px(ctx, bladeX, armY - 4 * ps, ps, METAL.shine);
  px(ctx, bladeX, armY - 3 * ps, ps, METAL.bright);
  // Handle crossguard
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(bladeX - ps, armY + ps, 3 * ps, ps);

  // Head
  const hx = bx + lunge * 0.15;
  const hy = headCY + bob;
  drawPixelEllipse(ctx, hx, hy, 7, 5, ps, c.outline);
  drawPixelEllipse(ctx, hx, hy, 6, 4, ps, c.body);
  drawPixelEllipse(ctx, hx, hy - ps, 4, 2, ps, c.light);
  // Belly cheek
  drawPixelEllipse(ctx, hx, hy + 2 * ps, 3, 2, ps, c.belly);
  // Headband
  ctx.fillStyle = c.accent;
  ctx.fillRect(hx - 6 * ps, hy - ps, 12 * ps, ps);
  ctx.fillStyle = lerpHex(c.accent, '#ffffff', 0.25);
  ctx.fillRect(hx - 4 * ps, hy - ps, 3 * ps, ps);

  drawCharFeatures(ctx, hx, hy, ps, c, character, false);
  drawFace(ctx, hx, hy, ps, c, atk, 'normal');
}

function drawBrawlerBody(ctx, x, fy, ps, c, character, walk, atk, atkP) {
  // Stocky fighter with oversized boxing gloves and chest plate
  const headCY = fy - 19 * ps;
  const bodyCY = fy - 10 * ps;
  const bob = -Math.abs(walk) * 0.6 * ps;
  const atkSwing = atk ? attackCurve(atkP) : 0;
  const lunge = atkSwing * 3.5 * ps;
  const punchR = atk ? Math.max(0, atkSwing) * 6 * ps : 0;
  const punchL = atk ? Math.max(0, -atkSwing) * 4 * ps : 0;

  drawPixelEllipse(ctx, x, fy, 5, 1, ps, 'rgba(0,0,0,0.15)');

  // Legs - sturdier
  const lLeg = walk > 0 ? -walk * 1.5 * ps : 0;
  const rLeg = walk < 0 ? walk * 1.5 * ps : 0;
  ctx.fillStyle = c.outline;
  ctx.fillRect(x - 4 * ps, fy - 6 * ps + lLeg, 3 * ps, 6 * ps - lLeg);
  ctx.fillRect(x + ps, fy - 6 * ps + rLeg, 3 * ps, 6 * ps - rLeg);
  ctx.fillStyle = c.body;
  ctx.fillRect(x - 3 * ps, fy - 5 * ps + lLeg, ps, 4 * ps);
  ctx.fillRect(x + 2 * ps, fy - 5 * ps + rLeg, ps, 4 * ps);
  // Boots
  ctx.fillStyle = c.dark;
  ctx.fillRect(x - 4 * ps, fy - ps + Math.min(0, lLeg), 4 * ps, ps);
  ctx.fillRect(x + ps, fy - ps + Math.min(0, rLeg), 4 * ps, ps);

  // Body - wider
  const bx = x + lunge * 0.3;
  const by = bodyCY + bob;
  drawPixelEllipse(ctx, bx, by, 7, 5, ps, c.outline);
  drawPixelEllipse(ctx, bx, by, 6, 4, ps, c.body);
  // Chest plate
  drawPixelEllipse(ctx, bx, by - ps, 5, 3, ps, c.dark);
  drawPixelEllipse(ctx, bx, by - ps, 4, 2, ps, lerpHex(c.dark, c.body, 0.3));
  // Plate highlight
  px(ctx, bx - 2 * ps, by - 3 * ps, ps, c.body, 0.5);
  px(ctx, bx - ps, by - 3 * ps, ps, c.body, 0.3);
  // Belt
  ctx.fillStyle = c.accent;
  ctx.fillRect(bx - 5 * ps, by + 2 * ps, 10 * ps, ps);
  px(ctx, bx, by + 2 * ps, ps, lerpHex(c.accent, '#ffffff', 0.4));

  // Left arm + glove
  const lArmX = bx - 7 * ps - punchL;
  ctx.fillStyle = c.outline;
  ctx.fillRect(bx - 6 * ps, by - 2 * ps, 2 * ps, 2 * ps);
  ctx.fillRect(Math.min(lArmX, bx - 6 * ps), by - 2 * ps, Math.abs(lArmX - (bx - 6 * ps)) + 2 * ps, 2 * ps);
  // Boxing glove - oversized circle
  drawPixelEllipse(ctx, lArmX - ps, by - ps, 3, 3, ps, c.accent);
  drawPixelEllipse(ctx, lArmX - ps, by - ps, 2, 2, ps, lerpHex(c.accent, '#ffffff', 0.2));
  px(ctx, lArmX - 2 * ps, by - 3 * ps, ps, lerpHex(c.accent, '#ffffff', 0.4));

  // Right arm + glove (punch arm)
  const rArmX = bx + 7 * ps + punchR;
  ctx.fillStyle = c.outline;
  ctx.fillRect(bx + 5 * ps, by - 2 * ps, Math.max(2 * ps, rArmX - bx - 5 * ps + ps), 2 * ps);
  drawPixelEllipse(ctx, rArmX + ps, by - ps, 3, 3, ps, c.accent);
  drawPixelEllipse(ctx, rArmX + ps, by - ps, 2, 2, ps, lerpHex(c.accent, '#ffffff', 0.2));
  px(ctx, rArmX, by - 3 * ps, ps, lerpHex(c.accent, '#ffffff', 0.4));

  // Head
  const hx = bx + lunge * 0.12;
  const hy = headCY + bob;
  drawPixelEllipse(ctx, hx, hy, 8, 6, ps, c.outline);
  drawPixelEllipse(ctx, hx, hy, 7, 5, ps, c.body);
  drawPixelEllipse(ctx, hx, hy - ps, 5, 3, ps, c.light);
  drawPixelEllipse(ctx, hx, hy + 2 * ps, 4, 2, ps, c.belly);

  drawCharFeatures(ctx, hx, hy, ps, c, character, false);
  drawFace(ctx, hx, hy, ps, c, atk, atk ? 'attack' : 'proud');
}

function drawRangedBody(ctx, x, fy, ps, c, character, walk, atk, atkP) {
  // Slim mage/archer with hood, cape, and staff
  const headCY = fy - 19 * ps;
  const bodyCY = fy - 10 * ps;
  const bob = -Math.abs(walk) * 0.5 * ps;
  const atkSwing = atk ? attackCurve(atkP) : 0;
  const staffAim = atk ? Math.max(0, atkSwing) * 4 * ps : 0;

  drawPixelEllipse(ctx, x, fy, 4, 1, ps, 'rgba(0,0,0,0.13)');

  // Cape (drawn behind body) - billowing
  const capeFlutter = walk * 1.5 * ps;
  const capeX = x - 2 * ps - capeFlutter * 0.5;
  ctx.fillStyle = c.dark;
  ctx.fillRect(capeX - 3 * ps, bodyCY - 6 * ps + bob, 5 * ps, 12 * ps);
  ctx.fillStyle = lerpHex(c.dark, c.outline, 0.4);
  ctx.fillRect(capeX - 3 * ps, bodyCY - 6 * ps + bob, 2 * ps, 12 * ps);
  ctx.fillStyle = lerpHex(c.dark, c.body, 0.3);
  ctx.fillRect(capeX + ps, bodyCY - 4 * ps + bob, ps, 8 * ps);
  // Cape bottom flutter
  ctx.fillStyle = c.dark;
  ctx.fillRect(capeX - 4 * ps + capeFlutter * 0.3, bodyCY + 5 * ps + bob, 3 * ps, 2 * ps);

  // Legs - slim
  const lLeg = walk > 0 ? -walk * 1.8 * ps : 0;
  const rLeg = walk < 0 ? walk * 1.8 * ps : 0;
  ctx.fillStyle = c.outline;
  ctx.fillRect(x - 3 * ps, fy - 5 * ps + lLeg, 2 * ps, 5 * ps - lLeg);
  ctx.fillRect(x + ps, fy - 5 * ps + rLeg, 2 * ps, 5 * ps - rLeg);
  ctx.fillStyle = c.body;
  px(ctx, x - 2 * ps, fy - 4 * ps + lLeg, ps, c.body);
  px(ctx, x + ps, fy - 4 * ps + rLeg, ps, c.body);
  // Pointed shoes
  ctx.fillStyle = c.accent;
  ctx.fillRect(x - 3 * ps, fy - ps + Math.min(0, lLeg), 3 * ps, ps);
  ctx.fillRect(x + ps, fy - ps + Math.min(0, rLeg), 3 * ps, ps);

  // Body - slim
  const bx = x;
  const by = bodyCY + bob;
  drawPixelEllipse(ctx, bx, by, 5, 4, ps, c.outline);
  drawPixelEllipse(ctx, bx, by, 4, 3, ps, c.body);
  drawPixelEllipse(ctx, bx, by + ps, 3, 2, ps, c.belly);
  // Robe sash
  ctx.fillStyle = c.accent;
  ctx.fillRect(bx - ps, by - 3 * ps, 2 * ps, 6 * ps);
  ctx.fillStyle = lerpHex(c.accent, '#ffffff', 0.3);
  px(ctx, bx - ps, by - 3 * ps, ps, lerpHex(c.accent, '#ffffff', 0.3));

  // Left arm
  ctx.fillStyle = c.outline;
  ctx.fillRect(bx - 5 * ps, by - 2 * ps, 2 * ps, 3 * ps);
  ctx.fillStyle = c.body;
  px(ctx, bx - 4 * ps, by - ps, ps, c.body);

  // Staff in right hand
  const staffX = bx + 5 * ps + staffAim;
  const staffTop = by - 10 * ps;
  const staffBot = by + 3 * ps;
  // Arm reaching to staff
  ctx.fillStyle = c.outline;
  ctx.fillRect(bx + 4 * ps, by - 2 * ps, Math.max(2 * ps, staffX - bx - 3 * ps), 2 * ps);
  // Staff shaft
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(staffX, staffTop, ps, staffBot - staffTop);
  ctx.fillStyle = WOOD.mid;
  px(ctx, staffX, staffTop + ps, ps, WOOD.mid);
  px(ctx, staffX, staffTop + 2 * ps, ps, WOOD.light);
  // Staff orb
  drawPixelEllipse(ctx, staffX + ps * 0.5, staffTop - ps, 2, 2, ps, c.accent);
  drawPixelEllipse(ctx, staffX + ps * 0.5, staffTop - ps, 1, 1, ps, lerpHex(c.accent, '#ffffff', 0.5));
  if (atk) {
    // Glowing orb during attack
    drawPixelEllipse(ctx, staffX + ps * 0.5, staffTop - ps, 3, 3, ps, c.accent, 0.3);
  }

  // Shoulder bag / quiver
  ctx.fillStyle = WOOD.mid;
  ctx.fillRect(bx - 5 * ps, by - 5 * ps, 2 * ps, 4 * ps);
  ctx.fillStyle = WOOD.light;
  px(ctx, bx - 5 * ps, by - 5 * ps, ps, WOOD.light);

  // Head with hood
  const hx = bx;
  const hy = headCY + bob;
  drawPixelEllipse(ctx, hx, hy, 7, 5, ps, c.outline);
  drawPixelEllipse(ctx, hx, hy, 6, 4, ps, c.body);
  drawPixelEllipse(ctx, hx, hy - ps, 4, 2, ps, c.light);
  drawPixelEllipse(ctx, hx, hy + 2 * ps, 3, 2, ps, c.belly);
  // Hood
  drawPixelEllipse(ctx, hx, hy - 2 * ps, 7, 4, ps, c.dark, 0.6);
  drawPixelEllipse(ctx, hx, hy - 2 * ps, 6, 3, ps, c.dark, 0.4);
  // Hood pointed tip
  px(ctx, hx, hy - 6 * ps, ps, c.dark);
  px(ctx, hx, hy - 7 * ps, ps, c.dark, 0.7);

  drawCharFeatures(ctx, hx, hy, ps, c, character, true);
  drawFace(ctx, hx, hy, ps, c, atk, 'focused');
}

function drawTankBody(ctx, x, fy, ps, c, character, walk, atk, atkP) {
  // Massive armored knight with helmet, pauldrons, and great axe
  const headCY = fy - 22 * ps;
  const bodyCY = fy - 12 * ps;
  const bob = -Math.abs(walk) * 0.3 * ps;
  const atkSwing = atk ? attackCurve(atkP) : 0;
  const weaponSwing = atkSwing * 6 * ps;
  const bodyLean = atkSwing * 2 * ps;

  drawPixelEllipse(ctx, x, fy, 7, 2, ps, 'rgba(0,0,0,0.18)');

  // Legs - thick, armored
  const lLeg = walk > 0 ? -walk * ps : 0;
  const rLeg = walk < 0 ? walk * ps : 0;
  // Leg armor
  ctx.fillStyle = METAL.dark;
  ctx.fillRect(x - 5 * ps, fy - 7 * ps + lLeg, 4 * ps, 7 * ps - lLeg);
  ctx.fillRect(x + ps, fy - 7 * ps + rLeg, 4 * ps, 7 * ps - rLeg);
  ctx.fillStyle = METAL.mid;
  ctx.fillRect(x - 4 * ps, fy - 6 * ps + lLeg, 2 * ps, 5 * ps);
  ctx.fillRect(x + 2 * ps, fy - 6 * ps + rLeg, 2 * ps, 5 * ps);
  ctx.fillStyle = METAL.light;
  px(ctx, x - 4 * ps, fy - 6 * ps + lLeg, ps, METAL.light);
  px(ctx, x + 2 * ps, fy - 6 * ps + rLeg, ps, METAL.light);
  // Armored boots
  ctx.fillStyle = METAL.dark;
  ctx.fillRect(x - 6 * ps, fy - ps + Math.min(0, lLeg), 5 * ps, 2 * ps);
  ctx.fillRect(x + ps, fy - ps + Math.min(0, rLeg), 5 * ps, 2 * ps);

  // Great axe (behind body on one side)
  const axeX = x + 8 * ps + weaponSwing;
  const axeTop = bodyCY - 12 * ps + bob - (atk ? weaponSwing * 0.6 : 0);
  const axeBot = bodyCY + 4 * ps + bob;
  // Shaft
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(axeX, axeTop, ps, axeBot - axeTop);
  ctx.fillStyle = WOOD.mid;
  px(ctx, axeX, axeTop + 3 * ps, ps, WOOD.mid);
  // Axe head
  ctx.fillStyle = METAL.mid;
  ctx.fillRect(axeX - 2 * ps, axeTop - ps, 5 * ps, 4 * ps);
  ctx.fillStyle = METAL.light;
  ctx.fillRect(axeX - ps, axeTop, 3 * ps, 2 * ps);
  ctx.fillStyle = METAL.shine;
  px(ctx, axeX - ps, axeTop, ps, METAL.shine);
  ctx.fillStyle = METAL.dark;
  ctx.fillRect(axeX + 2 * ps, axeTop - ps, ps, 4 * ps);

  // Body - large with full plate armor
  const bx = x + bodyLean;
  const by = bodyCY + bob;
  // Armor base
  drawPixelEllipse(ctx, bx, by, 9, 7, ps, METAL.dark);
  drawPixelEllipse(ctx, bx, by, 8, 6, ps, METAL.mid);
  // Armor highlight
  drawPixelEllipse(ctx, bx - ps, by - ps, 5, 4, ps, METAL.light);
  drawPixelEllipse(ctx, bx - 2 * ps, by - 2 * ps, 3, 2, ps, METAL.bright, 0.5);
  // Accent trim
  ctx.fillStyle = c.accent;
  ctx.fillRect(bx - 7 * ps, by + 4 * ps, 14 * ps, ps);
  ctx.fillRect(bx - ps, by - 5 * ps, 2 * ps, 10 * ps);
  ctx.fillStyle = lerpHex(c.accent, '#ffffff', 0.3);
  px(ctx, bx - ps, by - 5 * ps, ps, lerpHex(c.accent, '#ffffff', 0.3));

  // Shoulder pauldrons
  drawPixelEllipse(ctx, bx - 9 * ps, by - 4 * ps, 3, 2, ps, METAL.mid);
  drawPixelEllipse(ctx, bx - 9 * ps, by - 4 * ps, 2, 1, ps, METAL.light);
  px(ctx, bx - 10 * ps, by - 5 * ps, ps, METAL.bright, 0.6);
  drawPixelEllipse(ctx, bx + 9 * ps, by - 4 * ps, 3, 2, ps, METAL.mid);
  drawPixelEllipse(ctx, bx + 9 * ps, by - 4 * ps, 2, 1, ps, METAL.light);
  px(ctx, bx + 9 * ps, by - 5 * ps, ps, METAL.bright, 0.6);

  // Arms
  ctx.fillStyle = METAL.dark;
  ctx.fillRect(bx - 11 * ps, by - 3 * ps, 3 * ps, 4 * ps);
  ctx.fillRect(bx + 8 * ps, by - 3 * ps, 3 * ps, 4 * ps);
  ctx.fillStyle = METAL.mid;
  ctx.fillRect(bx - 10 * ps, by - 2 * ps, ps, 2 * ps);
  ctx.fillRect(bx + 9 * ps, by - 2 * ps, ps, 2 * ps);

  // Head with helmet
  const hx = bx + bodyLean * 0.3;
  const hy = headCY + bob;
  // Helmet
  drawPixelEllipse(ctx, hx, hy, 9, 7, ps, METAL.dark);
  drawPixelEllipse(ctx, hx, hy, 8, 6, ps, METAL.mid);
  drawPixelEllipse(ctx, hx, hy - ps, 6, 4, ps, METAL.light);
  // Helmet crest
  ctx.fillStyle = c.accent;
  ctx.fillRect(hx - ps, hy - 7 * ps, 2 * ps, 4 * ps);
  ctx.fillStyle = lerpHex(c.accent, '#ffffff', 0.3);
  px(ctx, hx - ps, hy - 7 * ps, ps, lerpHex(c.accent, '#ffffff', 0.3));
  // Visor slit - this is where the face shows through
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(hx - 4 * ps, hy + ps, 8 * ps, 2 * ps);
  // Eyes visible through visor
  px(ctx, hx - 3 * ps, hy + ps, ps, c.eye);
  px(ctx, hx + 2 * ps, hy + ps, ps, c.eye);
  if (atk) {
    // Glowing attack eyes
    px(ctx, hx - 3 * ps, hy + ps, ps, c.accent, 0.8);
    px(ctx, hx + 2 * ps, hy + ps, ps, c.accent, 0.8);
  } else {
    px(ctx, hx - 2 * ps, hy + ps, ps, '#ffffff', 0.6);
    px(ctx, hx + 3 * ps, hy + ps, ps, '#ffffff', 0.6);
  }
  // Character features peek from helmet
  drawCharFeatures(ctx, hx, hy, ps, c, character, true);
}

function drawFlierBody(ctx, x, fy, groundY, ps, c, character, walk, atk, atkP, unitAnim) {
  const flap = Math.sin(unitAnim * 0.34) * 2.6 * ps;
  const dive = atk ? Math.max(-4 * ps, attackCurve(atkP) * 5 * ps) : 0;
  const bodyY = fy - 8 * ps + dive * 0.18;
  const wingY = bodyY - ps;
  const wingSpan = 7 * ps + flap;
  const tailSwing = Math.sin(unitAnim * 0.26) * 2 * ps;

  drawPixelEllipse(ctx, x, groundY - 1, 5, 1, ps, 'rgba(0,0,0,0.12)');

  ctx.fillStyle = lerpHex(c.dark, c.outline, 0.15);
  ctx.beginPath();
  ctx.moveTo(x - 2 * ps, wingY);
  ctx.lineTo(x - wingSpan, wingY - 2.5 * ps);
  ctx.lineTo(x - 4 * ps, wingY + 2 * ps);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 2 * ps, wingY);
  ctx.lineTo(x + wingSpan, wingY - 2.5 * ps);
  ctx.lineTo(x + 4 * ps, wingY + 2 * ps);
  ctx.closePath();
  ctx.fill();

  drawPixelEllipse(ctx, x, bodyY, 5, 4, ps, c.outline);
  drawPixelEllipse(ctx, x, bodyY, 4, 3, ps, c.body);
  drawPixelEllipse(ctx, x, bodyY + ps, 2, 1, ps, c.belly);
  drawPixelEllipse(ctx, x, bodyY - ps, 3, 2, ps, c.light);
  drawPixelEllipse(ctx, x, bodyY - 5 * ps, 4, 3, ps, c.outline);
  drawPixelEllipse(ctx, x, bodyY - 5 * ps, 3, 2, ps, c.body);
  drawFace(ctx, x, bodyY - 5 * ps, ps, c, atk, 'proud');
  drawCharFeatures(ctx, x, bodyY - 5 * ps, ps, c, character, false);

  ctx.fillStyle = c.accent;
  ctx.fillRect(x - ps, bodyY - 10 * ps, 2 * ps, 3 * ps);
  ctx.fillStyle = lerpHex(c.accent, '#ffffff', 0.35);
  px(ctx, x - ps, bodyY - 10 * ps, ps, lerpHex(c.accent, '#ffffff', 0.35));

  ctx.fillStyle = c.dark;
  ctx.fillRect(x - ps, bodyY + 3 * ps, 2 * ps, 3 * ps);
  ctx.fillRect(x - 4 * ps + tailSwing, bodyY + 4 * ps, 2 * ps, 2 * ps);
  ctx.fillRect(x + 2 * ps + tailSwing, bodyY + 4 * ps, 2 * ps, 2 * ps);
}

export function drawPlayerUnit(ctx, unit, x, groundY, scale, character, animFrame) {
  const unitAnim = animFrame + (unit.animOffset || 0);
  const layerLift = getLayerLift(unit.layer, unitAnim, unit.flightBobOffset || 0);
  const unitScaleMap = { meatshield: 0.48, brawler: 0.56, ranged: 0.52, flier: 0.5, tank: 0.68 };
  const baseSize = PLAYER_UNIT_BASE_SIZES[unit.type] || 8;
  const visualScaleAdjust = (unit.size || baseSize) / baseSize;
  const ps = Math.max(2, Math.floor(scale * (unitScaleMap[unit.type] || 0.5) * visualScaleAdjust));
  const fy = groundY - layerLift;
  const c = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const variation = ((unit.animOffset || 0) / 36);
  const walkFreq = 0.28 + variation * 0.12;
  const walkPhase = Math.sin(unitAnim * walkFreq);

  const atk = unit.attackFlash > 0;
  const atkP = atk ? Math.max(0, Math.min(1, (180 - unit.attackFlash) / 180)) : 0;
  const vet = unit.veterancy || 0;

  if (vet > 0) drawPixelEllipse(ctx, x, fy - 8 * ps, Math.max(3, ps * 1.4), Math.max(2, ps * 0.8), ps, c.accent, 0.12 + vet * 0.03);

  if (isLoaded(character, unit.type)) {
    const spriteH = ps * (unit.type === 'tank' ? 22 : unit.type === 'brawler' ? 18 : 16);
    const dir = 'east';
    let img = null;
    if (atk) {
      const animType = unit.type === 'ranged' ? 'fireball' : 'attack';
      const len = getAnimationLength(character, unit.type, animType);
      const fi = len > 0 ? Math.floor(atkP * (len - 1)) : 0;
      img = getAnimationFrame(character, unit.type, animType, dir, fi);
    }
    if (!img) {
      const walkLen = getAnimationLength(character, unit.type, 'walk');
      if (walkLen > 0) {
        const fi = Math.floor((unitAnim * 0.15) % walkLen);
        img = getAnimationFrame(character, unit.type, 'walk', dir, fi);
      }
    }
    if (!img) img = getRotation(character, unit.type, dir);
    // Sprites have ~20% bottom padding; shift down so feet touch ground
    if (img && drawSprite(ctx, img, x, fy + spriteH * 0.18, spriteH, false)) {
      drawPlayerUnitOverlay(ctx, unit, x, fy, ps);
      return;
    }
  }

  switch (unit.type) {
    case 'meatshield': drawMeatshieldBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP); break;
    case 'brawler': drawBrawlerBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP); break;
    case 'ranged': drawRangedBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP); break;
    case 'flier': drawCharacterFlierMount(ctx, unit, x, fy, groundY, ps, c, character, unitAnim); break;
    case 'tank': drawTankBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP); break;
    default: drawMeatshieldBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP);
  }

  if (unit.type !== 'flier') drawAccessoryTrim(ctx, unit, x, fy, ps, c);
  drawVeterancyTrim(ctx, unit, x, fy, ps, c);
  drawPlayerUnitOverlay(ctx, unit, x, fy, ps, vet);
}

function drawPlayerUnitOverlay(ctx, unit, x, fy, ps, vet = unit.veterancy || 0) {
  // HP bar
  const barW = Math.max(20, ps * 16);
  const hpRatio = unit.hp / Math.max(1, unit.maxHp);
  const barColor = hpRatio > 0.5 ? '#58e17c' : hpRatio > 0.25 ? '#f7d55b' : '#ff6a5a';
  const barY = fy - (unit.type === 'tank' ? 30 : unit.type === 'brawler' ? 26 : unit.type === 'ranged' ? 26 : unit.type === 'flier' ? 28 : 22) * ps;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - barW / 2, barY, barW, 3);
  ctx.fillStyle = barColor;
  ctx.fillRect(x - barW / 2, barY, barW * hpRatio, 3);

  // Veterancy stars
  if (vet > 0) {
    const starY = barY - 6;
    const starSize = Math.max(2, ps * 1.2);
    ctx.fillStyle = '#ffd700';
    for (let i = 0; i < Math.min(vet, 5); i++) {
      const sx = x - (vet - 1) * starSize * 0.6 + i * starSize * 1.2;
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const angle = -Math.PI / 2 + (p * 2 * Math.PI) / 5;
        const r = p % 2 === 0 ? starSize : starSize * 0.4;
        const method = p === 0 ? 'moveTo' : 'lineTo';
        ctx[method](sx + Math.cos(angle) * r, starY + Math.sin(angle) * r);
        const innerAngle = angle + Math.PI / 5;
        ctx.lineTo(sx + Math.cos(innerAngle) * starSize * 0.4, starY + Math.sin(innerAngle) * starSize * 0.4);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ━━━ Enemy Unit Sprites ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ENEMY_FRAMES = {
  basic: {
    walk1: ['  dddd  ', ' drpprd ', 'drpppprd', 'dpwppwpd', 'drpppprd', ' drpprd ', '  drd   ', '  d dd  '],
    walk2: ['  dddd  ', ' drpprd ', 'drpppprd', 'dpwppwpd', 'drpppprd', ' drpprd ', '  drd   ', 'd d d   '],
    attack: ['  dddd  ', ' drpprd ', 'drpppprd', 'dpwppwpd', ' drpprdd', '  drd x ', ' d d dxx', '  d d   '],
  },
  bruiser: {
    walk1: ['  dddddd  ', ' drpppppd ', 'drpppppprd', 'drwwppwwrd', 'drpppppprd', ' drpppppd ', '  ddddrdd ', ' dd   dd  '],
    walk2: ['  dddddd  ', ' drpppppd ', 'drpppppprd', 'drwwppwwrd', 'drpppppprd', ' drpppppd ', '  ddd drd ', ' d d   dd '],
    attack: ['  ddddddxx', ' drpppppxx', 'drpppppprd', 'drwwppwwrd', 'drpppppprd', ' drpppppd ', '  ddddrdd ', ' dd   dd  '],
  },
  sniper: {
    walk1: ['  dddd  ', ' drpprd ', 'drpppprd', 'dpwppwpd', ' drpprdx', '  drd xx', ' d d d  '],
    walk2: ['  dddd  ', ' drpprd ', 'drpppprd', 'dpwppwpd', ' drpprdx', '  drdx x', 'd d d   '],
    attack: ['  dddd xx', ' drpprdx ', 'drpppprd ', 'dpwppwpd ', ' drpprd  ', '  drd    ', ' d d d   '],
  },
  ballista: {
    walk1: ['  dqqqqd   ', ' dqrrrrqd  ', 'dqrrxxxrqd ', 'dqrwwwwrqd ', ' dqrrrrqd  ', '  dttttd   ', ' d d  d d  '],
    walk2: ['  dqqqqd   ', ' dqrrrrqd  ', 'dqrrxxxrqd ', 'dqrwwwwrqd ', ' dqrrrrqd  ', ' dtttttd   ', 'd d  d d   '],
    attack: ['  dqqqqdxx ', ' dqrrrrqxx ', 'dqrrxxxrqd ', 'dqrwwwwrqd ', ' dqrrrrqd  ', '  dttttd   ', ' d d  d d  '],
  },
  tank: {
    walk1: ['  dqqqqqd  ', ' dqrrrrrqd ', 'dqrrrrrrrqd', 'dqrwwrwwrqd', 'dqrrrrrrrqd', ' dqrrrrrqd ', '  dqqqqqd  ', ' ddd   ddd '],
    walk2: ['  dqqqqqd  ', ' dqrrrrrqd ', 'dqrrrrrrrqd', 'dqrwwrwwrqd', 'dqrrrrrrrqd', ' dqrrrrrqd ', '  dqqqqqd  ', 'ddd   ddd  '],
    attack: ['  dqqqqqddx', ' dqrrrrrqxx', 'dqrrrrrrrqd', 'dqrwwrwwrqd', 'dqrrrrrrrqd', ' dqrrrrrqd ', '  dqqqqqd  ', ' ddd   ddd '],
  },
  harpy: {
    walk1: ['    ss    ', '  ssrrss  ', ' ssrrrrss ', 'ssrwwwwrss', ' ssrrrrss ', '  s rd s  ', '   d  d   '],
    walk2: ['    ss    ', ' ssrrrrss ', 'ssrrrrrrss', ' srwwwwrs ', '  ssrrss  ', '   sdds   ', '  d    d  '],
    attack: ['   sss x  ', ' ssrrrrxx ', 'ssrwwwwrss', ' ssrrrrss ', '  s rd s  ', '   d  d   '],
  },
  boss: {
    walk1: ['   dqqqqqqqd   ', '  dqrrrrrrrrqd  ', ' dqrrrrrrrrrrqd ', 'dqrrwwrrrrwwrqd', 'dqrrrrrrrrrrrrqd', 'dqrrrsrrrrssrqd', ' dqrrrrrrrrrrqd ', '  dqqqrrrqqqqd  ', ' ddd ddd ddd   '],
    walk2: ['   dqqqqqqqd   ', '  dqrrrrrrrrqd  ', ' dqrrrrrrrrrrqd ', 'dqrrwwrrrrwwrqd', 'dqrrrrrrrrrrrrqd', 'dqrrrsrrrrssrqd', ' dqrrrrrrrrrrqd ', '  dqqqrrrqqqqd  ', 'ddd  ddd  ddd  '],
    attack: ['   dqqqqqqqddxx', '  dqrrrrrrrrqxx ', ' dqrrrrrrrrrrqd ', 'dqrrwwrrrrwwrqd', 'dqrrrrrrrrrrrrqd', 'dqrrrsrrrrssrqd', ' dqrrrrrrrrrrqd ', '  dqqqrrrqqqqd  ', ' ddd ddd ddd   '],
  },
};

const ENEMY_PALETTES = {
  grassland: { d: '#4a1838', p: '#7a3a88', q: '#9a5aaa', r: '#6a2868', w: '#ffffff', x: '#FCB838', s: '#ff6688', t: '#7fb3ff' },
  fire:      { d: '#4a0800', p: '#8b2000', q: '#cc4400', r: '#6b1500', w: '#ffe0c0', x: '#ff6600', s: '#ffaa00', t: '#ff4400' },
  water:     { d: '#082840', p: '#1a5878', q: '#3090b8', r: '#0e4060', w: '#d0f0ff', x: '#40c8e8', s: '#60e8ff', t: '#80b0ff' },
  rock:      { d: '#2a2420', p: '#585048', q: '#787068', r: '#484038', w: '#d8d0c8', x: '#a09080', s: '#c0a888', t: '#908070' },
  ice:       { d: '#1a2838', p: '#3868a0', q: '#60a0d8', r: '#285080', w: '#e8f4ff', x: '#80d0ff', s: '#a0e0ff', t: '#c0e8ff' },
};
const ENEMY_PALETTE = ENEMY_PALETTES.grassland;

function unitFrame(unit, animFrame) {
  if (unit.attackFlash > 0) return 'attack';
  return Math.floor(animFrame / 10) % 2 === 0 ? 'walk1' : 'walk2';
}

export function drawEnemyUnit(ctx, unit, x, groundY, scale, animFrame, world) {
  const palette = ENEMY_PALETTES[world] || ENEMY_PALETTE;
  const layerLift = getLayerLift(unit.layer, animFrame + (unit.animOffset || 0), unit.flightBobOffset || 0);
  const ps = Math.max(2, Math.round(scale * 0.9));
  const frame = ENEMY_FRAMES[unit.type]?.[unitFrame(unit, animFrame + (unit.animOffset || 0))] || ENEMY_FRAMES.basic.walk1;
  const fy = groundY - layerLift;
  drawPixelEllipse(ctx, x, groundY - 1, Math.max(4, ps * (unit.layer === 'air' ? 2.2 : 2.8)), 1, 1, 'rgba(0,0,0,0.14)');
  if (unit.layer === 'air') drawPixelEllipse(ctx, x, fy - frame.length * ps * 0.35, Math.max(4, ps * 2.2), 2, 1, '#d7e8ff', 0.12);
  drawPixelMap(ctx, x - (frame[0].length * ps) / 2, fy - frame.length * ps, ps, frame, palette);
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x - frame[0].length * ps * 0.2, fy - frame.length * ps + ps, frame[0].length * ps * 0.3, Math.max(2, ps));

  const barW = Math.max(18, ps * 9);
  const hpRatio = unit.hp / Math.max(1, unit.maxHp);
  const barColor = hpRatio > 0.5 ? '#ff8c7a' : hpRatio > 0.25 ? '#ff6644' : '#ff3322';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x - barW / 2, fy - (frame.length + 3) * ps, barW, 3);
  ctx.fillStyle = barColor;
  ctx.fillRect(x - barW / 2, fy - (frame.length + 3) * ps, barW * hpRatio, 3);
}

// ━━━ Projectiles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function drawProjectile(ctx, projectile, x, y, scale, character) {
  const ps = Math.max(2, Math.round(scale * (projectile.sizeBoost || 1)));
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const isPlayer = projectile.team === 'player';
  const fill = isPlayer ? colors.accent : '#9a5aaa';
  const glow = isPlayer ? lerpHex(colors.accent, '#ffffff', 0.5) : '#c88add';
  const kind = projectile.variant || projectile.kind;

  ctx.save();
  switch (kind) {
    case 'bamboo_dart':
      ctx.fillStyle = '#d5b16e';
      ctx.fillRect(x - 4 * ps, y - ps, 7 * ps, 2 * ps);
      ctx.fillStyle = '#6bbf67';
      ctx.fillRect(x - 5 * ps, y - 2 * ps, 2 * ps, 4 * ps);
      ctx.fillStyle = '#ffffff';
      px(ctx, x + 2 * ps, y - ps, ps, '#ffffff');
      break;
    case 'bubble_beam':
      drawPixelEllipse(ctx, x, y, 3, 3, ps, '#ffb9d5');
      drawPixelEllipse(ctx, x, y, 2, 2, ps, '#ffe6f1');
      px(ctx, x + ps, y - 2 * ps, ps, '#ffffff');
      ctx.fillStyle = 'rgba(255, 184, 216, 0.2)';
      ctx.fillRect(x - 6 * ps, y - ps, 5 * ps, 2 * ps);
      break;
    case 'infernal_pike':
      ctx.fillStyle = '#e34b4b';
      ctx.fillRect(x - 4 * ps, y - ps, 6 * ps, 2 * ps);
      ctx.fillRect(x + ps, y - 2 * ps, 2 * ps, 4 * ps);
      ctx.fillStyle = '#ffd36c';
      px(ctx, x + 2 * ps, y - 2 * ps, ps, '#ffd36c');
      break;
    case 'jade_charm':
      drawPixelEllipse(ctx, x, y, 2, 3, ps, '#8fd4b4');
      drawPixelEllipse(ctx, x, y, 1, 2, ps, '#d9fff0');
      ctx.fillStyle = '#f6d36c';
      ctx.fillRect(x - ps, y - 4 * ps, 2 * ps, ps);
      break;
    case 'copter_star':
      ctx.fillStyle = fill;
      ctx.fillRect(x - 3 * ps, y - ps, 6 * ps, 2 * ps);
      ctx.fillRect(x - ps, y - 3 * ps, 2 * ps, 6 * ps);
      ctx.fillStyle = '#ffffff';
      px(ctx, x, y, ps, '#ffffff');
      break;
    case 'gum_comet':
      drawPixelEllipse(ctx, x, y, 3, 3, ps, '#ff87c1');
      drawPixelEllipse(ctx, x, y, 2, 2, ps, '#ffd8ec');
      ctx.fillStyle = 'rgba(255, 124, 188, 0.25)';
      ctx.fillRect(x - 8 * ps, y - ps, 7 * ps, 2 * ps);
      break;
    case 'trident_spark':
      ctx.fillStyle = '#ff7559';
      ctx.fillRect(x - 2 * ps, y - 3 * ps, ps, 6 * ps);
      ctx.fillRect(x - 3 * ps, y - 4 * ps, ps, 2 * ps);
      ctx.fillRect(x, y - 4 * ps, ps, 2 * ps);
      ctx.fillStyle = '#ffd36c';
      px(ctx, x - ps, y - 3 * ps, ps, '#ffd36c');
      break;
    case 'jade_pearl':
      drawPixelEllipse(ctx, x, y, 3, 3, ps, '#c5fff7');
      drawPixelEllipse(ctx, x, y, 2, 2, ps, '#ffffff');
      ctx.fillStyle = '#f6d36c';
      ctx.fillRect(x - 7 * ps, y - ps, 5 * ps, 2 * ps);
      break;
    case 'lance':
      ctx.fillStyle = fill;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x - 8 * ps, y - ps, 8 * ps, 2 * ps);
      ctx.globalAlpha = 1;
      ctx.fillStyle = SMB_PALETTE.white;
      ctx.fillRect(x - 3 * ps, y - ps, 4 * ps, 2 * ps);
      ctx.fillStyle = fill;
      ctx.fillRect(x + ps, y - 2 * ps, 2 * ps, 4 * ps);
      px(ctx, x + 2 * ps, y - 2 * ps, ps, glow);
      break;
    case 'ember':
      drawPixelEllipse(ctx, x, y, 3, 3, ps, '#ff9548');
      drawPixelEllipse(ctx, x, y, 2, 2, ps, '#ffd36c');
      drawPixelEllipse(ctx, x, y, 1, 1, ps, '#ffffff');
      ctx.fillStyle = 'rgba(255, 132, 64, 0.22)';
      ctx.fillRect(x - 7 * ps, y - ps, 6 * ps, 2 * ps);
      break;
    case 'bomb':
      drawPixelEllipse(ctx, x, y, 3, 3, ps, '#75415e');
      drawPixelEllipse(ctx, x, y, 2, 2, ps, '#c66f8a');
      px(ctx, x + ps, y - 3 * ps, ps, '#ffd36c');
      break;
    case 'bolt':
      ctx.fillStyle = '#cfddff';
      ctx.fillRect(x - 2 * ps, y - 3 * ps, ps, 6 * ps);
      ctx.fillRect(x - ps, y - 2 * ps, 3 * ps, ps);
      ctx.fillRect(x + ps, y - ps, ps, 3 * ps);
      break;
    case 'orb':
      drawPixelEllipse(ctx, x, y, 2, 2, ps, fill);
      drawPixelEllipse(ctx, x, y, 1, 1, ps, glow);
      ctx.fillStyle = fill;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(x + 2 * ps, y - ps, 5 * ps, 2 * ps);
      break;
    default:
      drawPixelEllipse(ctx, x, y, 2, 2, ps, fill);
      drawPixelEllipse(ctx, x, y, 1, 1, ps, glow);
  }
  if ((projectile.veterancy || 0) > 0) drawPixelEllipse(ctx, x, y, 4, 2, ps, glow, 0.18 + Math.min(0.25, (projectile.veterancy || 0) * 0.05));
  ctx.restore();
}

// ━━━ Effects ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function drawExplosion(ctx, x, y, size, progress) {
  const radius = Math.max(6, size * (0.3 + progress * 0.8));
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress);
  const color1 = progress < 0.4 ? SMB_PALETTE.gold : '#ff8a60';
  const color2 = progress < 0.4 ? '#ffffff' : SMB_PALETTE.gold;
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8 + progress * 0.8;
    const dist = radius * (0.2 + progress * 0.6);
    const sz = Math.max(1, 3.5 * (1 - progress));
    ctx.fillStyle = i % 2 === 0 ? color1 : color2;
    ctx.fillRect(
      x + Math.cos(angle) * dist - sz / 2,
      y + Math.sin(angle) * dist - sz / 2,
      sz, sz,
    );
  }
  // Center flash
  if (progress < 0.3) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = Math.max(0, 0.6 - progress * 2);
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  ctx.restore();
}

export function drawDeathPoof(ctx, x, y, size, progress) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress * 1.2);
  const spread = progress * size * 0.8;
  const ps = Math.max(2, Math.round(size / 6));
  drawPixelEllipse(ctx, x - spread * 0.6, y - spread * 0.3, 2, 2, ps, '#f0f0f0');
  drawPixelEllipse(ctx, x + spread * 0.4, y - spread * 0.5, 2, 2, ps, '#d8d8d8');
  drawPixelEllipse(ctx, x + spread * 0.2, y + spread * 0.2, 2, 2, ps, '#e8e8e8');
  if (progress < 0.4) {
    drawPixelEllipse(ctx, x, y, 1, 1, ps, '#ffffff', 0.5);
  }
  ctx.restore();
}

export function drawSlashFX(ctx, x, y, size, progress) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress * 1.8);
  const r = size * (0.4 + progress * 0.6);
  ctx.strokeStyle = progress < 0.25 ? '#ffffff' : '#ffe888';
  ctx.lineWidth = Math.max(1.5, 3.5 * (1 - progress));
  // Three-slash arc
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 1.5, y + i * 1.5, r + i * 2, -0.6, 1.0);
    ctx.stroke();
  }
  // Small sparkle particles
  if (progress < 0.5) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + progress * 3;
      const d = r * 0.6 * progress;
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ffe888';
      const sz = Math.max(1, 2 * (1 - progress * 2));
      ctx.fillRect(x + Math.cos(angle) * d - sz / 2, y + Math.sin(angle) * d - sz / 2, sz, sz);
    }
  }
  ctx.restore();
}

export function drawImpactStars(ctx, x, y, size, progress) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress * 1.3);
  const burst = size * progress * 1.2;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - 0.3;
    const dist = burst * (0.3 + (i % 3) * 0.15);
    const sz = Math.max(1, 2.5 * (1 - progress));
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffee44' : '#ffaa22';
    ctx.fillRect(x + Math.cos(angle) * dist - sz / 2, y + Math.sin(angle) * dist - sz / 2, sz, sz);
  }
  ctx.restore();
}

// ━━━ HUD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function drawHUD(ctx, w, h, state) {
  const panelH = 34;
  ctx.fillStyle = 'rgba(8, 14, 28, 0.48)';
  ctx.fillRect(0, 0, w, panelH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`SCORE ${state.score}`, 12, 14);
  ctx.fillText(`${state.stage > 10 ? 'SURV' : 'STAGE'} ${state.stage}`, 12, 28);
  ctx.fillText(`WAVE ${state.wave}/${state.waveCount}`, 112, 14);
  ctx.fillText(`AURA ${Math.floor(state.aura)}/${state.auraMax}`, 112, 28);
  ctx.textAlign = 'right';
  ctx.fillText(`BASE ${Math.max(0, Math.ceil(state.playerBaseHp))}`, w - 12, 14);
  ctx.fillText(state.abilityCooldownMs > 0 ? `BURST ${Math.ceil(state.abilityCooldownMs / 1000)}s` : 'BURST READY', w - 12, 28);
  ctx.textAlign = 'left';
}

export function drawSpawnButtons(ctx, x, y, width, state, character) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, width, 26);
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`READY ${Object.values(state.cooldowns || {}).filter((v) => v <= 0).length}/5`, x + 10, y + 12);
  ctx.fillText('GROUND + AIR', x + 10, y + 22);
}

export function drawAuraMeter(ctx, x, y, width, aura, auraMax, auraLevel) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, width, 10);
  ctx.fillStyle = '#f7d55b';
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, aura / Math.max(1, auraMax))), 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`FLOW ${auraLevel}`, x + width + 8, y + 8);
}

// ━━━ Screens ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function drawStartScreen(ctx, w, h, character) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  ctx.fillStyle = 'rgba(10, 12, 24, 0.48)';
  ctx.fillRect(0, 0, w, h);
  const portraitSize = Math.max(56, Math.min(92, Math.round(h * 0.16)));
  drawBottomCenteredImage(ctx, heroBasePath(character), w / 2, h * 0.3, portraitSize, portraitSize);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('PET BATTLE', w / 2, h * 0.2);
  ctx.fillStyle = colors.accent;
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('Command ground troops, air units, and a timed burst skill', w / 2, h * 0.38);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillText('1-5 / QWERT to deploy units • 6 / Y for Comet Burst', w / 2, h * 0.5);
  ctx.fillText('7-9 / UIO upgrade Flow, Reserve, and Rhythm', w / 2, h * 0.55);
  ctx.fillText('Skyguard targets air first. Fliers skip the ground frontline.', w / 2, h * 0.6);
  ctx.textAlign = 'left';
}

export function drawCountdown(ctx, w, h, label) {
  ctx.save();
  ctx.font = `900 ${label === 'GO!' ? 58 : 72}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = label === 'GO!' ? '#44ff88' : '#ffffff';
  ctx.shadowColor = label === 'GO!' ? '#44ff88' : '#0a2458';
  ctx.shadowBlur = 16;
  ctx.fillText(label, w / 2, h * 0.4);
  ctx.restore();
}

export function drawStageClearBanner(ctx, w, h, state) {
  const stage = state.stage;
  const bonus = state.lastStageBonus;
  const hasBonus = bonus && (bonus.speed > 0 || bonus.hp > 0 || bonus.waveSkip > 0);
  const bannerH = hasBonus ? 100 : 64;
  const bannerY = h * 0.22;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(w * 0.1, bannerY, w * 0.8, bannerH);
  ctx.strokeStyle = '#f7d55b';
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.1, bannerY, w * 0.8, bannerH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`STAGE ${stage} CLEAR!`, w / 2, bannerY + 26);
  if (hasBonus) {
    ctx.font = '700 10px monospace';
    let row = 0;
    if (bonus.speed > 0) { ctx.fillStyle = '#58e17c'; ctx.fillText(`\u26A1 Speed  +${bonus.speed}`, w / 2, bannerY + 46 + row * 14); row++; }
    if (bonus.hp > 0)    { ctx.fillStyle = '#60a5fa'; ctx.fillText(`\uD83D\uDEE1\uFE0F  No-hit  +${bonus.hp}`, w / 2, bannerY + 46 + row * 14); row++; }
    if (bonus.waveSkip > 0) { ctx.fillStyle = '#c084fc'; ctx.fillText(`\uD83D\uDD25 Blitz  +${bonus.waveSkip}`, w / 2, bannerY + 46 + row * 14); row++; }
    ctx.fillStyle = '#f7d55b';
    ctx.font = '700 11px system-ui, -apple-system, sans-serif';
    ctx.fillText(bonus.survival ? 'Survival pressure is rising...' : 'Marching to the next castle...', w / 2, bannerY + bannerH - 10);
  } else {
    ctx.fillStyle = '#f7d55b';
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(stage >= 10 ? 'Into survival...' : 'Marching to the next castle...', w / 2, bannerY + 48);
  }
  ctx.textAlign = 'left';
}

export function drawResults(ctx, w, h, state) {
  ctx.fillStyle = 'rgba(7, 10, 18, 0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(state.outcome === 'win' ? 'KINGDOM SAVED!' : 'RUN OVER', w / 2, h * 0.16);
  ctx.fillStyle = state.outcome === 'win' ? '#58e17c' : '#ff8a60';
  ctx.font = '900 46px system-ui, -apple-system, sans-serif';
  ctx.fillText(String(state.score), w / 2, h * 0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillText('SCORE', w / 2, h * 0.34);
  const lines = [
    `Stage reached: ${state.stageReached || state.stage}`,
    `Units spawned: ${state.unitsSpawned}`,
    `Enemies defeated: ${state.enemiesDefeated}`,
    `Bosses defeated: ${state.bossesDefeated}`,
  ];
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#f7d55b' : 'rgba(255,255,255,0.84)';
    ctx.fillText(line, w / 2, h * 0.46 + i * 22);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Use the button below to play again', w / 2, h * 0.72);
  ctx.textAlign = 'left';
}

export { SMB_PALETTE };

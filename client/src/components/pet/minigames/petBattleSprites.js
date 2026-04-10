import { CHAR_COLORS } from './miniPumpSprites';

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

const LANE_HEIGHT = 5;

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

export function drawBattlefield(ctx, w, h, state, reducedMotion) {
  const groundY = getBattlefieldGroundY(h);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0, '#6090e8');
  skyGrad.addColorStop(0.35, '#78a8ff');
  skyGrad.addColorStop(0.7, SMB_PALETTE.sky);
  skyGrad.addColorStop(1, '#4e84ea');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, groundY + 20);

  const drift = reducedMotion ? 0 : (state.cameraX || 0) * 0.25;

  drawMountainRange(ctx, w, groundY, drift);

  const cloudConfigs = [
    { x: 0, y: 48, v: 0 }, { x: 190, y: 36, v: 1 }, { x: 380, y: 58, v: 2 },
    { x: 130, y: 28, v: 1 }, { x: 320, y: 44, v: 0 }, { x: 500, y: 52, v: 2 },
  ];
  cloudConfigs.forEach(({ x: cx, y: cy, v }) => {
    drawCloud(ctx, ((cx - drift * 3.5) % (w + 300)) - 100, cy, 3.5, v);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  for (let i = 0; i < 9; i++) {
    const sx = ((i * 113) - drift * 3.2) % (w + 140);
    ctx.fillRect(sx, 28 + (i % 3) * 18, 3, 3);
    ctx.fillRect(sx + 5, 29 + (i % 2) * 16, 2, 2);
  }

  for (let i = -1; i < 4; i++) {
    drawHill(ctx, i * 176 - drift * 2, groundY, 228, 96 - (i % 2) * 16);
  }

  const treePx = 3;
  const treePositions = [60, 150, 240, 340, 440, 520];
  treePositions.forEach((tx, i) => {
    drawPixelTree(ctx, ((tx - drift * 1.8) % (w + 100)) - 40, groundY, treePx, i);
  });

  ctx.fillStyle = SMB_PALETTE.grassDark;
  ctx.fillRect(0, groundY - 4, w, 18);
  ctx.fillStyle = SMB_PALETTE.grass;
  ctx.fillRect(0, groundY, w, 10);
  ctx.fillStyle = '#29d129';
  ctx.fillRect(0, groundY + 2, w, 2);
  ctx.fillStyle = SMB_PALETTE.grassShadow;
  ctx.fillRect(0, groundY + 10, w, 4);
  ctx.fillStyle = SMB_PALETTE.dirtLight;
  ctx.fillRect(0, groundY + 14, w, h - groundY - 14);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, groundY + 14, w, 3);
  ctx.fillStyle = 'rgba(124,32,0,0.3)';
  ctx.fillRect(0, groundY + 17, w, 6);

  const brickW = 26, brickH = 16;
  for (let y = groundY + 30; y < h; y += brickH) {
    for (let x2 = ((Math.floor(y / brickH) % 2) * (brickW / 2)) - brickW; x2 < w + brickW; x2 += brickW) {
      ctx.fillStyle = SMB_PALETTE.dirt;
      ctx.fillRect(x2, y, brickW - 2, brickH - 2);
      ctx.fillStyle = SMB_PALETTE.dirtDark;
      ctx.fillRect(x2 + 2, y + brickH - 6, brickW - 8, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x2 + 2, y + 2, brickW - 9, 2);
    }
  }
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

export function drawPlayerUnit(ctx, unit, x, groundY, scale, character, animFrame) {
  const laneLift = (unit.renderLane || 0) * LANE_HEIGHT;
  const unitScaleMap = { meatshield: 0.48, brawler: 0.56, ranged: 0.52, tank: 0.68 };
  const ps = Math.max(2, Math.floor(scale * (unitScaleMap[unit.type] || 0.5)));
  const fy = groundY - laneLift;
  const c = CHAR_COLORS[character] || CHAR_COLORS.dojocat;

  const unitAnim = animFrame + (unit.animOffset || 0);
  const variation = ((unit.animOffset || 0) / 36);
  const walkFreq = 0.28 + variation * 0.12;
  const walkPhase = Math.sin(unitAnim * walkFreq);

  const atk = unit.attackFlash > 0;
  const atkP = atk ? Math.max(0, Math.min(1, (180 - unit.attackFlash) / 180)) : 0;

  switch (unit.type) {
    case 'meatshield': drawMeatshieldBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP); break;
    case 'brawler': drawBrawlerBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP); break;
    case 'ranged': drawRangedBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP); break;
    case 'tank': drawTankBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP); break;
    default: drawMeatshieldBody(ctx, x, fy, ps, c, character, walkPhase, atk, atkP);
  }

  // HP bar
  const barW = Math.max(20, ps * 16);
  const hpRatio = unit.hp / Math.max(1, unit.maxHp);
  const barColor = hpRatio > 0.5 ? '#58e17c' : hpRatio > 0.25 ? '#f7d55b' : '#ff6a5a';
  const barY = fy - (unit.type === 'tank' ? 30 : unit.type === 'brawler' ? 26 : unit.type === 'ranged' ? 26 : 22) * ps;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - barW / 2, barY, barW, 3);
  ctx.fillStyle = barColor;
  ctx.fillRect(x - barW / 2, barY, barW * hpRatio, 3);

  // Veterancy stars
  const vet = unit.veterancy || 0;
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
  tank: {
    walk1: ['  dqqqqqd  ', ' dqrrrrrqd ', 'dqrrrrrrrqd', 'dqrwwrwwrqd', 'dqrrrrrrrqd', ' dqrrrrrqd ', '  dqqqqqd  ', ' ddd   ddd '],
    walk2: ['  dqqqqqd  ', ' dqrrrrrqd ', 'dqrrrrrrrqd', 'dqrwwrwwrqd', 'dqrrrrrrrqd', ' dqrrrrrqd ', '  dqqqqqd  ', 'ddd   ddd  '],
    attack: ['  dqqqqqddx', ' dqrrrrrqxx', 'dqrrrrrrrqd', 'dqrwwrwwrqd', 'dqrrrrrrrqd', ' dqrrrrrqd ', '  dqqqqqd  ', ' ddd   ddd '],
  },
  boss: {
    walk1: ['   dqqqqqqqd   ', '  dqrrrrrrrrqd  ', ' dqrrrrrrrrrrqd ', 'dqrrwwrrrrwwrqd', 'dqrrrrrrrrrrrrqd', 'dqrrrsrrrrssrqd', ' dqrrrrrrrrrrqd ', '  dqqqrrrqqqqd  ', ' ddd ddd ddd   '],
    walk2: ['   dqqqqqqqd   ', '  dqrrrrrrrrqd  ', ' dqrrrrrrrrrrqd ', 'dqrrwwrrrrwwrqd', 'dqrrrrrrrrrrrrqd', 'dqrrrsrrrrssrqd', ' dqrrrrrrrrrrqd ', '  dqqqrrrqqqqd  ', 'ddd  ddd  ddd  '],
    attack: ['   dqqqqqqqddxx', '  dqrrrrrrrrqxx ', ' dqrrrrrrrrrrqd ', 'dqrrwwrrrrwwrqd', 'dqrrrrrrrrrrrrqd', 'dqrrrsrrrrssrqd', ' dqrrrrrrrrrrqd ', '  dqqqrrrqqqqd  ', ' ddd ddd ddd   '],
  },
};

const ENEMY_PALETTE = {
  d: '#4a1838',
  p: '#7a3a88',
  q: '#9a5aaa',
  r: '#6a2868',
  w: SMB_PALETTE.white,
  x: SMB_PALETTE.gold,
  s: '#ff6688',
  t: '#7fb3ff',
};

function unitFrame(unit, animFrame) {
  if (unit.attackFlash > 0) return 'attack';
  return Math.floor(animFrame / 10) % 2 === 0 ? 'walk1' : 'walk2';
}

export function drawEnemyUnit(ctx, unit, x, groundY, scale, animFrame) {
  const laneLift = (unit.renderLane || 0) * LANE_HEIGHT;
  const ps = Math.max(2, Math.round(scale * 0.9));
  const frame = ENEMY_FRAMES[unit.type]?.[unitFrame(unit, animFrame + (unit.animOffset || 0))] || ENEMY_FRAMES.basic.walk1;
  drawPixelEllipse(ctx, x, groundY - laneLift - 1, Math.max(4, ps * 2.8), 1, 1, 'rgba(0,0,0,0.14)');
  drawPixelMap(ctx, x - (frame[0].length * ps) / 2, groundY - laneLift - frame.length * ps, ps, frame, ENEMY_PALETTE);
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x - frame[0].length * ps * 0.2, groundY - laneLift - frame.length * ps + ps, frame[0].length * ps * 0.3, Math.max(2, ps));

  const barW = Math.max(18, ps * 9);
  const hpRatio = unit.hp / Math.max(1, unit.maxHp);
  const barColor = hpRatio > 0.5 ? '#ff8c7a' : hpRatio > 0.25 ? '#ff6644' : '#ff3322';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x - barW / 2, groundY - laneLift - (frame.length + 3) * ps, barW, 3);
  ctx.fillStyle = barColor;
  ctx.fillRect(x - barW / 2, groundY - laneLift - (frame.length + 3) * ps, barW * hpRatio, 3);
}

// ━━━ Projectiles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function drawProjectile(ctx, projectile, x, y, scale, character) {
  const ps = Math.max(2, Math.round(scale));
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const isPlayer = projectile.team === 'player';
  const fill = isPlayer ? colors.accent : '#9a5aaa';
  const glow = isPlayer ? lerpHex(colors.accent, '#ffffff', 0.5) : '#c88add';

  if (isPlayer && projectile.kind === 'ranged') {
    // Energy bolt with trail
    ctx.save();
    // Trail
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(x - 6 * ps, y - ps, 6 * ps, 2 * ps);
    ctx.globalAlpha = 0.1;
    ctx.fillRect(x - 10 * ps, y - ps * 0.5, 4 * ps, ps);
    ctx.globalAlpha = 1;
    // Main bolt
    drawPixelEllipse(ctx, x, y, 2, 2, ps, fill);
    drawPixelEllipse(ctx, x, y, 1, 1, ps, glow);
    // Sparkle
    px(ctx, x + ps, y - 2 * ps, ps, '#ffffff', 0.7);
    ctx.restore();
  } else {
    // Enemy projectile - dark orb
    ctx.save();
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(x + 2 * ps, y - ps, 5 * ps, 2 * ps);
    ctx.globalAlpha = 1;
    drawPixelEllipse(ctx, x, y, 2, 2, ps, fill);
    drawPixelEllipse(ctx, x, y, 1, 1, ps, glow);
    ctx.restore();
  }
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
  ctx.fillText(`STAGE ${state.stage}`, 12, 28);
  ctx.fillText(`WAVE ${state.wave}/${state.waveCount}`, 112, 14);
  ctx.fillText(`AURA ${Math.floor(state.aura)}/${state.auraMax}`, 112, 28);
  ctx.textAlign = 'right';
  ctx.fillText(`BASE ${Math.max(0, Math.ceil(state.playerBaseHp))}`, w - 12, 14);
  ctx.fillText(`FOES ${state.enemiesDefeated}`, w - 12, 28);
  ctx.textAlign = 'left';
}

export function drawSpawnButtons(ctx, x, y, width, state, character) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, width, 26);
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`READY ${Object.values(state.cooldowns || {}).filter((v) => v <= 0).length}/4`, x + 10, y + 17);
}

export function drawAuraMeter(ctx, x, y, width, aura, auraMax, auraLevel) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, width, 10);
  ctx.fillStyle = '#f7d55b';
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, aura / Math.max(1, auraMax))), 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`LV ${auraLevel}`, x + width + 8, y + 8);
}

// ━━━ Screens ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function drawStartScreen(ctx, w, h, character) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  ctx.fillStyle = 'rgba(10, 12, 24, 0.48)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('PET BATTLE', w / 2, h * 0.2);
  ctx.fillStyle = colors.accent;
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('Deploy your pet army and crush the enemy castle', w / 2, h * 0.27);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillText('1-4 or QWER to spawn units', w / 2, h * 0.42);
  ctx.fillText('5 or U to upgrade aura income', w / 2, h * 0.47);
  ctx.fillText('Touch controls live below the battlefield', w / 2, h * 0.52);
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

export function drawStageClearBanner(ctx, w, h, stage) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(w * 0.15, h * 0.28, w * 0.7, 64);
  ctx.strokeStyle = '#f7d55b';
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.15, h * 0.28, w * 0.7, 64);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`STAGE ${stage} CLEAR!`, w / 2, h * 0.28 + 26);
  ctx.fillStyle = '#f7d55b';
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('Marching to the next castle...', w / 2, h * 0.28 + 48);
  ctx.textAlign = 'left';
}

export function drawResults(ctx, w, h, state) {
  ctx.fillStyle = 'rgba(7, 10, 18, 0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(state.outcome === 'win' ? 'KINGDOM SAVED!' : 'CASTLE FALLEN', w / 2, h * 0.16);
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

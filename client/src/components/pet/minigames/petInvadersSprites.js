/**
 * Pet Invaders Canvas Sprites
 * Player pet, fodder enemies, bosses, projectiles, power-ups, explosions, HUD
 */

import { CHAR_COLORS } from './miniPumpSprites';

// ─── Enemy color themes ─────────────────────────────
const ENEMY_COLORS = {
  jelly:     { body: '#66dd88', dark: '#44aa66', eye: '#ffffff', pupil: '#222222', outline: '#338855' },
  bat:       { body: '#9966cc', dark: '#7744aa', eye: '#ffcc00', pupil: '#222222', outline: '#664499', wing: '#bb88ee' },
  robot:     { body: '#aabbcc', dark: '#8899aa', eye: '#ff4444', pupil: '#880000', outline: '#667788', accent: '#4488ff' },
  cloud:     { body: '#ddeeff', dark: '#aaccee', eye: '#6688aa', pupil: '#334455', outline: '#99bbdd' },
  slime:     { body: '#ffaa44', dark: '#dd8822', eye: '#ffffff', pupil: '#222222', outline: '#cc7711' },
  star:      { body: '#ffee44', dark: '#ddcc22', eye: '#ff6644', pupil: '#882200', outline: '#bbaa11' },
};

// Boss color themes
const BOSS_COLORS = {
  labubu:     { body: '#c9e8a0', dark: '#96c06c', eye: '#222222', outline: '#6a9040', accent: '#ff88aa' },
  buu:        { body: '#f0b8c8', dark: '#d98ea7', eye: '#2d2d2d', outline: '#b06a80', accent: '#ff4488' },
  dojocat:    { body: '#dfae6f', dark: '#b77739', eye: '#2d2d2d', outline: '#8a5520', accent: '#ff6644' },
  pixiu:      { body: '#fff2f7', dark: '#efc0cf', eye: '#6d4c41', outline: '#aa6688', accent: '#ee81b0' },
  vegetacat:  { body: '#4466cc', dark: '#2244aa', eye: '#ffcc00', outline: '#112288', accent: '#ffdd44' },
};

const POWER_UP_COLORS = {
  spread: { fill: '#ff6644', glow: 'rgba(255,102,68,0.4)', icon: 'S' },
  rate:   { fill: '#44ccff', glow: 'rgba(68,204,255,0.4)', icon: 'R' },
  damage: { fill: '#ff44cc', glow: 'rgba(255,68,204,0.4)', icon: 'D' },
  hybrid: { fill: '#ffcc22', glow: 'rgba(255,204,34,0.5)', icon: '*' },
};

// ─── Drawing helpers ─────────────────────────────────
function px(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}

function drawPixelEllipse(ctx, cx, cy, rx, ry, ps, color) {
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1)
        px(ctx, cx + dx * ps, cy + dy * ps, ps, color);
    }
}

// ─── Player Pet (simplified for game) ────────────────
export function drawPlayerPet(ctx, x, y, size, character, firing) {
  const cc = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const ps = Math.max(1, Math.round(size / 12));
  const hw = ps * 5, hh = ps * 6;

  // Body
  ctx.fillStyle = cc.body;
  ctx.beginPath();
  ctx.roundRect(x - hw, y - hh, hw * 2, hh * 2, ps * 2);
  ctx.fill();
  ctx.strokeStyle = cc.outline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Belly
  drawPixelEllipse(ctx, x, y + ps * 2, 3, 2, ps, cc.belly || cc.light);

  // Eyes
  const eyeSpread = ps * 2;
  px(ctx, x - eyeSpread - ps, y - ps * 2, ps * 2, cc.eye);
  px(ctx, x + eyeSpread - ps, y - ps * 2, ps * 2, cc.eye);

  // Ears (triangles)
  ctx.fillStyle = cc.dark;
  ctx.beginPath();
  ctx.moveTo(x - hw + ps, y - hh);
  ctx.lineTo(x - hw + ps * 3, y - hh - ps * 3);
  ctx.lineTo(x - hw + ps * 5, y - hh);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + hw - ps * 5, y - hh);
  ctx.lineTo(x + hw - ps * 3, y - hh - ps * 3);
  ctx.lineTo(x + hw - ps, y - hh);
  ctx.fill();

  // Firing muzzle flash
  if (firing) {
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y - hh - ps * 2, ps * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Fodder Enemies ──────────────────────────────────

function drawJelly(ctx, x, y, size, animFrame) {
  const ec = ENEMY_COLORS.jelly;
  const r = size / 2;
  const squish = Math.sin(animFrame * 0.15) * 2;

  ctx.fillStyle = ec.body;
  ctx.beginPath();
  ctx.ellipse(x, y, r + squish, r - squish * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ec.outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Face
  ctx.fillStyle = ec.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ec.pupil;
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.05, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.05, r * 0.1, 0, Math.PI * 2); ctx.fill();

  // Smile
  ctx.strokeStyle = ec.dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.1, r * 0.25, 0, Math.PI);
  ctx.stroke();
}

function drawBat(ctx, x, y, size, animFrame) {
  const ec = ENEMY_COLORS.bat;
  const r = size / 2;
  const wingFlap = Math.sin(animFrame * 0.25) * 8;

  // Wings
  ctx.fillStyle = ec.wing;
  ctx.beginPath();
  ctx.ellipse(x - r * 1.2, y - wingFlap, r * 0.7, r * 0.4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 1.2, y + wingFlap, r * 0.7, r * 0.4, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = ec.body;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ec.outline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Eyes
  ctx.fillStyle = ec.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.15, r * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.25, y - r * 0.15, r * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ec.pupil;
  ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.12, r * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.25, y - r * 0.12, r * 0.07, 0, Math.PI * 2); ctx.fill();
}

function drawRobot(ctx, x, y, size, animFrame) {
  const ec = ENEMY_COLORS.robot;
  const hw = size * 0.4, hh = size * 0.45;

  // Body
  ctx.fillStyle = ec.body;
  ctx.fillRect(x - hw, y - hh, hw * 2, hh * 2);
  ctx.strokeStyle = ec.outline;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - hw, y - hh, hw * 2, hh * 2);

  // Antenna
  ctx.strokeStyle = ec.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x, y - hh - size * 0.2); ctx.stroke();
  ctx.fillStyle = ec.accent;
  ctx.beginPath(); ctx.arc(x, y - hh - size * 0.2, 2, 0, Math.PI * 2); ctx.fill();

  // Eyes (LED blink)
  const blink = Math.sin(animFrame * 0.1) > 0;
  ctx.fillStyle = blink ? ec.eye : ec.dark;
  ctx.fillRect(x - hw * 0.5, y - hh * 0.4, hw * 0.3, hh * 0.3);
  ctx.fillRect(x + hw * 0.2, y - hh * 0.4, hw * 0.3, hh * 0.3);

  // Chest plate
  ctx.fillStyle = ec.accent;
  ctx.fillRect(x - hw * 0.3, y + hh * 0.1, hw * 0.6, hh * 0.3);
}

function drawCloudImp(ctx, x, y, size, animFrame) {
  const ec = ENEMY_COLORS.cloud;
  const r = size / 2;
  const bob = Math.sin(animFrame * 0.08) * 3;

  // Cloud body (bumpy circles)
  ctx.fillStyle = ec.body;
  ctx.beginPath(); ctx.arc(x, y + bob, r * 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.4, y + bob + r * 0.1, r * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.4, y + bob + r * 0.1, r * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.15, y + bob - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.2, y + bob - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill();

  // Outline
  ctx.strokeStyle = ec.outline;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y + bob, r * 0.6, 0, Math.PI * 2); ctx.stroke();

  // Face
  ctx.fillStyle = ec.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.2, y + bob - r * 0.05, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.2, y + bob - r * 0.05, r * 0.1, 0, Math.PI * 2); ctx.fill();
}

function drawSlime(ctx, x, y, size, animFrame) {
  const ec = ENEMY_COLORS.slime;
  const r = size / 2;
  const bounce = Math.abs(Math.sin(animFrame * 0.12)) * 4;

  ctx.fillStyle = ec.body;
  ctx.beginPath();
  ctx.ellipse(x, y - bounce, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ec.outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.25, y - bounce - r * 0.2, r * 0.2, r * 0.15, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Face
  ctx.fillStyle = ec.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - bounce - r * 0.1, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3, y - bounce - r * 0.1, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ec.pupil;
  ctx.beginPath(); ctx.arc(x - r * 0.28, y - bounce - r * 0.05, r * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.32, y - bounce - r * 0.05, r * 0.08, 0, Math.PI * 2); ctx.fill();
}

function drawStarCritter(ctx, x, y, size, animFrame) {
  const ec = ENEMY_COLORS.star;
  const r = size / 2;
  const spin = animFrame * 0.05;

  // Star shape
  ctx.fillStyle = ec.body;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = spin + (i * Math.PI * 2) / 5 - Math.PI / 2;
    const innerAngle = spin + ((i + 0.5) * Math.PI * 2) / 5 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    ctx.lineTo(x + Math.cos(innerAngle) * r * 0.4, y + Math.sin(innerAngle) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ec.outline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Face
  ctx.fillStyle = ec.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.2, y - r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
}

export function drawEnemy(ctx, x, y, size, type, animFrame, hp, maxHp) {
  const drawFns = { jelly: drawJelly, bat: drawBat, robot: drawRobot, cloud: drawCloudImp, slime: drawSlime, star: drawStarCritter };
  const fn = drawFns[type];
  if (fn) fn(ctx, x, y, size, animFrame);

  // HP bar for multi-hit enemies
  if (maxHp > 1 && hp > 0) {
    const barW = size * 0.8;
    const barH = 3;
    const barX = x - barW / 2;
    const barY = y - size / 2 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hp / maxHp > 0.5 ? '#44ff88' : '#ff6644';
    ctx.fillRect(barX, barY, barW * (hp / maxHp), barH);
  }
}

// ─── Boss Sprites ────────────────────────────────────

function drawBossBase(ctx, x, y, size, colors, animFrame) {
  const r = size / 2;
  const pulse = Math.sin(animFrame * 0.06) * 3;

  // Glow
  ctx.save();
  ctx.shadowColor = colors.accent;
  ctx.shadowBlur = 10 + pulse;
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner detail
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.1, r * 0.6, 0, Math.PI * 2);
  ctx.fill();

  return r;
}

function drawBossLabubu(ctx, x, y, size, animFrame, hp, maxHp) {
  const bc = BOSS_COLORS.labubu;
  const r = drawBossBase(ctx, x, y, size, bc, animFrame);

  // Pointed ears
  ctx.fillStyle = bc.body;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y - r * 0.7);
  ctx.lineTo(x - r * 0.3, y - r * 1.2);
  ctx.lineTo(x, y - r * 0.7);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.7);
  ctx.lineTo(x + r * 0.3, y - r * 1.2);
  ctx.lineTo(x + r * 0.6, y - r * 0.7);
  ctx.fill();

  // Eyes (big round)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.15, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bc.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.12, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.12, r * 0.12, 0, Math.PI * 2); ctx.fill();

  // Cute mouth
  ctx.strokeStyle = bc.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.15, r * 0.15, 0, Math.PI);
  ctx.stroke();
}

function drawBossBuu(ctx, x, y, size, animFrame, hp, maxHp) {
  const bc = BOSS_COLORS.buu;
  const r = drawBossBase(ctx, x, y, size, bc, animFrame);

  // Head tentacle
  ctx.fillStyle = bc.accent;
  ctx.beginPath();
  const tentX = x + Math.sin(animFrame * 0.08) * r * 0.3;
  ctx.moveTo(x, y - r * 0.8);
  ctx.quadraticCurveTo(tentX + r * 0.5, y - r * 1.5, tentX, y - r * 1.3);
  ctx.lineWidth = 4;
  ctx.strokeStyle = bc.accent;
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.25, y - r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bc.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.18, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.25, y - r * 0.18, r * 0.1, 0, Math.PI * 2); ctx.fill();

  // Angry mouth
  ctx.strokeStyle = bc.eye;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y + r * 0.15);
  ctx.lineTo(x + r * 0.2, y + r * 0.15);
  ctx.stroke();
}

function drawBossDojocat(ctx, x, y, size, animFrame, hp, maxHp) {
  const bc = BOSS_COLORS.dojocat;
  const r = drawBossBase(ctx, x, y, size, bc, animFrame);

  // Cat ears
  ctx.fillStyle = bc.body;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.7, y - r * 0.5);
  ctx.lineTo(x - r * 0.4, y - r * 1.1);
  ctx.lineTo(x - r * 0.1, y - r * 0.5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.1, y - r * 0.5);
  ctx.lineTo(x + r * 0.4, y - r * 1.1);
  ctx.lineTo(x + r * 0.7, y - r * 0.5);
  ctx.fill();

  // Headband
  ctx.fillStyle = bc.accent;
  ctx.fillRect(x - r * 0.8, y - r * 0.3, r * 1.6, r * 0.15);

  // Eyes (determined)
  ctx.fillStyle = bc.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();

  // Smile
  ctx.strokeStyle = bc.eye;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.1, r * 0.2, 0, Math.PI);
  ctx.stroke();
}

function drawBossPixiu(ctx, x, y, size, animFrame, hp, maxHp) {
  const bc = BOSS_COLORS.pixiu;
  const r = drawBossBase(ctx, x, y, size, bc, animFrame);

  // Mane/crown
  for (let i = -2; i <= 2; i++) {
    ctx.fillStyle = bc.accent;
    ctx.beginPath();
    ctx.arc(x + i * r * 0.25, y - r * 0.9, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes (gentle)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.15, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.25, y - r * 0.15, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bc.eye;
  ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.13, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.25, y - r * 0.13, r * 0.1, 0, Math.PI * 2); ctx.fill();

  // Whiskers
  ctx.strokeStyle = bc.dark;
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x - r * 0.4, y + r * 0.05); ctx.lineTo(x - r * 0.9, y - r * 0.05); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * 0.4, y + r * 0.1); ctx.lineTo(x - r * 0.9, y + r * 0.15); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + r * 0.4, y + r * 0.05); ctx.lineTo(x + r * 0.9, y - r * 0.05); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + r * 0.4, y + r * 0.1); ctx.lineTo(x + r * 0.9, y + r * 0.15); ctx.stroke();
}

function drawBossVegetacat(ctx, x, y, size, animFrame, hp, maxHp) {
  const bc = BOSS_COLORS.vegetacat;
  const r = drawBossBase(ctx, x, y, size, bc, animFrame);

  // Flame hair (spiky)
  ctx.fillStyle = bc.accent;
  for (let i = -2; i <= 2; i++) {
    const spikeH = (3 - Math.abs(i)) * r * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + i * r * 0.2 - r * 0.1, y - r * 0.7);
    ctx.lineTo(x + i * r * 0.2, y - r * 0.7 - spikeH);
    ctx.lineTo(x + i * r * 0.2 + r * 0.1, y - r * 0.7);
    ctx.fill();
  }

  // Eyes (fierce)
  ctx.fillStyle = bc.eye;
  const eyeAngle = -0.15;
  ctx.save();
  ctx.translate(x - r * 0.3, y - r * 0.15);
  ctx.rotate(eyeAngle);
  ctx.fillRect(-r * 0.12, -r * 0.06, r * 0.24, r * 0.12);
  ctx.restore();
  ctx.save();
  ctx.translate(x + r * 0.3, y - r * 0.15);
  ctx.rotate(-eyeAngle);
  ctx.fillRect(-r * 0.12, -r * 0.06, r * 0.24, r * 0.12);
  ctx.restore();

  // Frown
  ctx.strokeStyle = bc.eye;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y + r * 0.2);
  ctx.lineTo(x + r * 0.2, y + r * 0.15);
  ctx.stroke();
}

const BOSS_DRAW_FNS = {
  labubu: drawBossLabubu,
  buu: drawBossBuu,
  dojocat: drawBossDojocat,
  pixiu: drawBossPixiu,
  vegetacat: drawBossVegetacat,
};

export function drawBoss(ctx, x, y, size, type, animFrame, hp, maxHp) {
  const fn = BOSS_DRAW_FNS[type];
  if (fn) fn(ctx, x, y, size, animFrame, hp, maxHp);

  // HP bar
  if (maxHp > 0) {
    const barW = size * 1.2;
    const barH = 5;
    const barX = x - barW / 2;
    const barY = y - size / 2 - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    const pct = hp / maxHp;
    ctx.fillStyle = pct > 0.5 ? '#44ff88' : pct > 0.25 ? '#ffcc22' : '#ff4455';
    ctx.fillRect(barX, barY, barW * pct, barH);
    // Boss name
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(type.toUpperCase(), x, barY - 3);
  }
}

// ─── Projectiles ─────────────────────────────────────
export function drawProjectile(ctx, x, y, type, powerLevel) {
  if (type === 'player') {
    const colors = ['#44ff88', '#88ffaa', '#ffffff'];
    const color = colors[Math.min(powerLevel, 2)];
    const size = 3 + powerLevel;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.fillRect(x - 1.5, y - size, 3, size * 2);
    ctx.restore();
  } else if (type === 'enemy') {
    ctx.save();
    ctx.shadowColor = '#ff4455';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ff4455';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (type === 'boss') {
    ctx.save();
    ctx.shadowColor = '#ff22cc';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ff44dd';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Power-ups ───────────────────────────────────────
export function drawPowerUp(ctx, x, y, type, animFrame) {
  const pc = POWER_UP_COLORS[type];
  if (!pc) return;
  const r = 10;
  const bob = Math.sin(animFrame * 0.1) * 2;

  ctx.save();
  ctx.shadowColor = pc.glow;
  ctx.shadowBlur = 8;

  // Box
  ctx.fillStyle = pc.fill;
  ctx.beginPath();
  ctx.roundRect(x - r, y - r + bob, r * 2, r * 2, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Icon
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pc.icon, x, y + bob);
  ctx.restore();
}

// ─── Explosions ──────────────────────────────────────
export function drawExplosion(ctx, x, y, progress, size, color) {
  const r = size * (0.5 + progress * 1.5);
  const alpha = 1 - progress;
  ctx.save();

  // Outer ring
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.5})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Inner flash
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 0.6);
  grad.addColorStop(0, `rgba(255,255,255,${alpha * 0.8})`);
  grad.addColorStop(0.5, color || `rgba(255,200,100,${alpha * 0.4})`);
  grad.addColorStop(1, 'rgba(255,100,50,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Particles
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + progress * 2;
    const dist = r * 0.7 * progress;
    const px = x + Math.cos(angle) * dist;
    const py = y + Math.sin(angle) * dist;
    ctx.fillStyle = `rgba(255,200,100,${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, 2 * (1 - progress), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ─── Damage flash ────────────────────────────────────
export function drawDamageFlash(ctx, w, h, progress) {
  const alpha = (1 - progress) * 0.3;
  ctx.fillStyle = `rgba(255,50,50,${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

// ─── HUD ─────────────────────────────────────────────
export function drawHUD(ctx, w, score, lives, wave, activeBuffs) {
  ctx.save();
  // Score — top right
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(score), w - 12, 24);
  ctx.font = '600 9px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('SCORE', w - 12, 34);

  // Wave — top center
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px system-ui';
  ctx.fillStyle = '#66bbff';
  ctx.fillText(`WAVE ${wave}`, w / 2, 20);

  // Lives — top left
  ctx.textAlign = 'left';
  ctx.font = '14px system-ui';
  for (let i = 0; i < lives; i++) {
    ctx.fillStyle = '#ff4466';
    ctx.fillText('\u2764', 10 + i * 18, 22);
  }

  // Active power-ups
  if (activeBuffs && activeBuffs.length > 0) {
    const buffY = 44;
    activeBuffs.forEach((buff, i) => {
      const pc = POWER_UP_COLORS[buff.type];
      if (!pc) return;
      const bx = 10 + i * 28;
      ctx.fillStyle = pc.fill;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.roundRect(bx, buffY, 24, 14, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(pc.icon, bx + 12, buffY + 10);
      // Timer bar
      const pct = buff.remaining / buff.duration;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(bx, buffY + 14, 24 * pct, 2);
    });
  }

  ctx.restore();
}

// ─── Wave banner ─────────────────────────────────────
export function drawWaveBanner(ctx, w, h, text, progress) {
  const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '900 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#4488ff';
  ctx.shadowBlur = 15;
  ctx.fillText(text, w / 2, h * 0.35);
  ctx.restore();
}

// ─── Boss warning banner ─────────────────────────────
export function drawBossWarningBanner(ctx, w, h, bossType, progress) {
  const alpha = Math.sin(progress * Math.PI * 3) * 0.5 + 0.5;
  ctx.save();
  ctx.globalAlpha = alpha * (progress < 0.8 ? 1 : (1 - progress) / 0.2);
  ctx.font = '900 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff4455';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 20;
  ctx.fillText('WARNING', w / 2, h * 0.30);
  ctx.font = '700 14px system-ui';
  ctx.fillStyle = '#ffcc22';
  ctx.fillText(`BOSS: ${(bossType || '').toUpperCase()}`, w / 2, h * 0.38);
  ctx.restore();
}

// ─── Star field background ──────────────────────────
let _stars = null;

export function drawStarfield(ctx, w, h, scrollOffset) {
  if (!_stars || _stars.w !== w || _stars.h !== h) {
    const stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.5 + 0.5,
        speed: Math.random() * 0.5 + 0.2,
        brightness: Math.random() * 0.5 + 0.2,
      });
    }
    _stars = { w, h, stars };
  }

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#020408');
  grad.addColorStop(0.5, '#060c14');
  grad.addColorStop(1, '#040810');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Stars
  _stars.stars.forEach(star => {
    const sy = (star.y + scrollOffset * star.speed) % h;
    ctx.fillStyle = `rgba(200,220,255,${star.brightness})`;
    ctx.fillRect(star.x, sy, star.size, star.size);
  });
}

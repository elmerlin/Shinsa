/**
 * Mini-Pump Canvas Sprites
 * Pixel-art rendering for game scene: pet, blobs, laser, pads, FX
 * Inspired by SpritePet.jsx palette/style but built for canvas
 */

// ─── Character color themes ─────────────────────────
export const CHAR_COLORS = {
  dojocat: {
    body: '#dfae6f', dark: '#b77739', light: '#f6d7aa', belly: '#fff2df',
    eye: '#2d2d2d', outline: '#151515', accent: '#f6a3ae', nose: '#b4544a',
  },
  buu: {
    body: '#f0b8c8', dark: '#d98ea7', light: '#ffdbe7', belly: '#f7d1de',
    eye: '#2d2d2d', outline: '#1a1a1a', accent: '#f48fb1', nose: '#a55f6c',
  },
  devit: {
    body: '#faf9f2', dark: '#dfddd2', light: '#ffffff', belly: '#fefcf8',
    eye: '#e53935', outline: '#202020', accent: '#c43d34', nose: '#ffb2b7',
  },
  pixiu: {
    body: '#fff2f7', dark: '#efc0cf', light: '#ffffff', belly: '#fff8fb',
    eye: '#6d4c41', outline: '#40262f', accent: '#ee81b0', nose: '#d76f79',
  },
};

// ─── Blob colors ─────────────────────────────────────
export const BLOB_COLORS = {
  red:    { fill: '#ff4455', glow: '#ff6677', core: '#ff2233', outline: '#cc1122' },
  yellow: { fill: '#ffcc22', glow: '#ffdd55', core: '#ffbb00', outline: '#cc9900' },
  blue:   { fill: '#4488ff', glow: '#66aaff', core: '#2266ee', outline: '#1144cc' },
};

export const LASER_COLORS = {
  red:    { beam: '#ff4455', glow: 'rgba(255,68,85,0.3)', core: '#ff8899' },
  yellow: { beam: '#ffcc22', glow: 'rgba(255,204,34,0.3)', core: '#ffee88' },
  blue:   { beam: '#4488ff', glow: 'rgba(68,136,255,0.3)', core: '#88bbff' },
};

const PAD_COLORS = {
  red:    { base: '#661122', active: '#ff4455', border: '#992233' },
  yellow: { base: '#665500', active: '#ffcc22', border: '#997700' },
  blue:   { base: '#112266', active: '#4488ff', border: '#224499' },
};

// ─── Drawing helpers ─────────────────────────────────
function px(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}

function drawPixelCircle(ctx, cx, cy, r, ps, color) {
  const half = r;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      if (dx * dx + dy * dy <= half * half) {
        px(ctx, cx + dx * ps, cy + dy * ps, ps, color);
      }
    }
  }
}

function drawPixelEllipse(ctx, cx, cy, rx, ry, ps, color) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const ex = dx / rx, ey = dy / ry;
      if (ex * ex + ey * ey <= 1) {
        px(ctx, cx + dx * ps, cy + dy * ps, ps, color);
      }
    }
  }
}

// ─── Pet sprite (simplified for game canvas) ─────────
export function drawPet(ctx, x, y, ps, character, pose, expression) {
  const c = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const centerX = x;
  const headY = y - 10 * ps;
  const bodyY = y + 2 * ps;

  // Pose offsets
  let headDx = 0, headDy = 0, bodyDy = 0;
  let leftLegDy = 0, rightLegDy = 0;
  let leftLegDx = 0, rightLegDx = 0;

  switch (pose) {
    case 'step_red':
      leftLegDy = -2 * ps; leftLegDx = -2 * ps; headDx = -1 * ps;
      break;
    case 'step_yellow':
      bodyDy = -1 * ps; headDy = -2 * ps;
      break;
    case 'step_blue':
      rightLegDy = -2 * ps; rightLegDx = 2 * ps; headDx = 1 * ps;
      break;
    case 'laser_fire':
      bodyDy = -2 * ps; headDy = -3 * ps;
      break;
    case 'bonk':
      bodyDy = 3 * ps; headDy = 4 * ps;
      break;
    case 'celebrate':
      bodyDy = -3 * ps; headDy = -4 * ps;
      break;
    case 'stunned':
      headDx = Math.sin(Date.now() / 80) * 2 * ps;
      break;
    case 'ready':
      bodyDy = -1 * ps;
      break;
    default:
      break;
  }

  // Shadow
  drawPixelEllipse(ctx, centerX, y + 14 * ps + bodyDy, 7, 2, ps, 'rgba(0,0,0,0.15)');

  // Body
  drawPixelEllipse(ctx, centerX, bodyY + bodyDy, 8, 7, ps, c.outline);
  drawPixelEllipse(ctx, centerX, bodyY + bodyDy, 7, 6, ps, c.body);
  drawPixelEllipse(ctx, centerX, bodyY + 2 * ps + bodyDy, 5, 4, ps, c.belly);

  // Legs
  const legY = bodyY + 7 * ps + bodyDy;
  const legSpread = 4 * ps;
  // Left
  ctx.fillStyle = c.outline;
  ctx.fillRect(centerX - legSpread + leftLegDx - ps, legY + leftLegDy, 3 * ps, 6 * ps);
  ctx.fillStyle = c.body;
  ctx.fillRect(centerX - legSpread + leftLegDx, legY + leftLegDy + ps, ps, 4 * ps);
  // Right
  ctx.fillStyle = c.outline;
  ctx.fillRect(centerX + legSpread - 2 * ps + rightLegDx, legY + rightLegDy, 3 * ps, 6 * ps);
  ctx.fillStyle = c.body;
  ctx.fillRect(centerX + legSpread - ps + rightLegDx, legY + rightLegDy + ps, ps, 4 * ps);

  // Head
  const hx = centerX + headDx;
  const hy = headY + headDy;
  if (character === 'buu') {
    drawPixelEllipse(ctx, hx, hy + 2 * ps, 10, 8, ps, c.outline);
    drawPixelEllipse(ctx, hx, hy + 2 * ps, 9, 7, ps, c.body);
    drawPixelEllipse(ctx, hx, hy - 1 * ps, 7, 6, ps, c.body);
    // Antenna
    px(ctx, hx - ps, hy - 8 * ps, ps, c.accent);
    px(ctx, hx, hy - 9 * ps, ps, c.accent);
    px(ctx, hx + ps, hy - 10 * ps, ps, c.accent);
    drawPixelCircle(ctx, hx + 2 * ps, hy - 11 * ps, 2, ps, c.accent);
  } else {
    drawPixelEllipse(ctx, hx, hy, 10, 8, ps, c.outline);
    drawPixelEllipse(ctx, hx, hy, 9, 7, ps, c.body);
    drawPixelEllipse(ctx, hx, hy - 2 * ps, 6, 4, ps, c.light);
  }

  // Character-specific features
  if (character === 'dojocat' || character === 'pixiu') {
    // Ears
    const earY = hy - 7 * ps;
    for (let i = 0; i < 4; i++) {
      px(ctx, hx - 8 * ps + i * ps, earY - i * ps, ps, c.outline);
      px(ctx, hx + 8 * ps - i * ps, earY - i * ps, ps, c.outline);
    }
    for (let i = 0; i < 3; i++) {
      px(ctx, hx - 7 * ps + i * ps, earY - i * ps + ps, ps, c.accent);
      px(ctx, hx + 7 * ps - i * ps, earY - i * ps + ps, ps, c.accent);
    }
    // Muzzle
    drawPixelEllipse(ctx, hx, hy + 2 * ps, 4, 3, ps, c.belly);
  }

  if (character === 'devit') {
    // Horns
    for (let i = 0; i < 5; i++) {
      px(ctx, hx - 6 * ps - i * ps, hy - 5 * ps - i * ps, ps * 2, c.accent);
      px(ctx, hx + 6 * ps + i * ps, hy - 5 * ps - i * ps, ps * 2, c.accent);
    }
  }

  if (character === 'pixiu') {
    // Mane tufts
    for (let i = 0; i < 3; i++) {
      px(ctx, hx - 10 * ps, hy - 2 * ps + i * 2 * ps, ps * 2, c.accent);
      px(ctx, hx + 9 * ps, hy - 2 * ps + i * 2 * ps, ps * 2, c.accent);
    }
  }

  // Eyes
  const eyeY = hy + ps;
  const eyeSpread = 4 * ps;
  if (expression === 'stunned' || pose === 'stunned') {
    // X eyes
    px(ctx, hx - eyeSpread - ps, eyeY - ps, ps, c.eye);
    px(ctx, hx - eyeSpread + ps, eyeY + ps, ps, c.eye);
    px(ctx, hx - eyeSpread + ps, eyeY - ps, ps, c.eye);
    px(ctx, hx - eyeSpread - ps, eyeY + ps, ps, c.eye);
    px(ctx, hx + eyeSpread - ps, eyeY - ps, ps, c.eye);
    px(ctx, hx + eyeSpread + ps, eyeY + ps, ps, c.eye);
    px(ctx, hx + eyeSpread + ps, eyeY - ps, ps, c.eye);
    px(ctx, hx + eyeSpread - ps, eyeY + ps, ps, c.eye);
  } else if (expression === 'celebrate' || pose === 'celebrate') {
    // Happy arcs
    for (let i = -1; i <= 1; i++) {
      px(ctx, hx - eyeSpread + i * ps, eyeY, ps, c.eye);
      px(ctx, hx + eyeSpread + i * ps, eyeY, ps, c.eye);
    }
    px(ctx, hx - eyeSpread - 2 * ps, eyeY - ps, ps, c.eye);
    px(ctx, hx + eyeSpread + 2 * ps, eyeY - ps, ps, c.eye);
  } else if (expression === 'focused') {
    // Narrow determined eyes
    for (let i = -1; i <= 1; i++) {
      px(ctx, hx - eyeSpread + i * ps, eyeY, ps * 1.2, c.eye);
      px(ctx, hx + eyeSpread + i * ps, eyeY, ps * 1.2, c.eye);
    }
  } else {
    // Normal eyes
    drawPixelCircle(ctx, hx - eyeSpread, eyeY, 2, ps, c.eye);
    drawPixelCircle(ctx, hx + eyeSpread, eyeY, 2, ps, c.eye);
    // Eye shine
    px(ctx, hx - eyeSpread + ps, eyeY - ps, ps, '#ffffff');
    px(ctx, hx + eyeSpread + ps, eyeY - ps, ps, '#ffffff');
  }

  // Mouth
  if (expression === 'celebrate' || pose === 'celebrate') {
    // Big happy mouth
    for (let i = -2; i <= 2; i++) {
      px(ctx, hx + i * ps, hy + 4 * ps, ps, c.nose);
    }
    px(ctx, hx - 2 * ps, hy + 3 * ps, ps, c.nose);
    px(ctx, hx + 2 * ps, hy + 3 * ps, ps, c.nose);
  } else if (expression === 'stunned' || pose === 'bonk') {
    // O mouth
    drawPixelCircle(ctx, hx, hy + 4 * ps, 2, ps, c.nose);
    px(ctx, hx, hy + 4 * ps, ps, c.belly);
  } else {
    // Small mouth
    px(ctx, hx, hy + 3 * ps, ps, c.nose);
    px(ctx, hx - ps, hy + 3 * ps, ps, c.nose);
  }

  // Arms (pose-dependent)
  const armY = bodyY - 2 * ps + bodyDy;
  if (pose === 'celebrate') {
    // Arms up!
    for (let i = 0; i < 5; i++) {
      px(ctx, centerX - 9 * ps, armY - i * ps, 2 * ps, c.outline);
      px(ctx, centerX + 8 * ps, armY - i * ps, 2 * ps, c.outline);
    }
  } else if (pose === 'laser_fire') {
    // Arms forward
    for (let i = 0; i < 4; i++) {
      px(ctx, centerX - 9 * ps - i * ps, armY + 2 * ps, 2 * ps, c.outline);
      px(ctx, centerX + 8 * ps + i * ps, armY + 2 * ps, 2 * ps, c.outline);
    }
  } else {
    // Arms at sides
    for (let i = 0; i < 5; i++) {
      px(ctx, centerX - 9 * ps, armY + i * ps, 2 * ps, c.outline);
      px(ctx, centerX + 8 * ps, armY + i * ps, 2 * ps, c.outline);
    }
  }
}

// ─── Blob rendering ──────────────────────────────────
export function drawBlob(ctx, x, y, radius, color, pulse = 0) {
  const bc = BLOB_COLORS[color];
  if (!bc) return;

  const r = radius + pulse * 2;

  // Glow
  ctx.save();
  ctx.shadowColor = bc.glow;
  ctx.shadowBlur = 8 + pulse * 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = bc.fill;
  ctx.fill();
  ctx.restore();

  // Core bright center
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = bc.core;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.25, r * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();

  // Outline ring
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.strokeStyle = bc.outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ─── Pad buttons (on-canvas) ─────────────────────────
export function drawPad(ctx, x, y, w, h, color, active) {
  const pc = PAD_COLORS[color];
  if (!pc) return;

  const r = 6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = active ? pc.active : pc.base;
  ctx.fill();
  ctx.strokeStyle = active ? pc.active : pc.border;
  ctx.lineWidth = active ? 2 : 1;
  ctx.stroke();

  if (active) {
    ctx.save();
    ctx.shadowColor = pc.active;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.strokeStyle = pc.active;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Label
  ctx.fillStyle = active ? '#ffffff' : 'rgba(255,255,255,0.5)';
  ctx.font = `bold ${Math.round(h * 0.35)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labels = { red: 'A', yellow: 'S', blue: 'D' };
  ctx.fillText(labels[color] || '', x + w / 2, y + h / 2);
}

// ─── Laser beam ──────────────────────────────────────
export function drawLaser(ctx, x, startY, endY, color, progress) {
  const lc = LASER_COLORS[color];
  if (!lc) return;

  const beamW = 4;
  const alpha = Math.max(0, 1 - progress * 1.5);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Glow
  ctx.shadowColor = lc.glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = lc.beam;
  ctx.fillRect(x - beamW, startY, beamW * 2, endY - startY);

  // Core
  ctx.fillStyle = lc.core;
  ctx.fillRect(x - 1, startY, 2, endY - startY);

  ctx.restore();
}

// ─── Hit window indicator ────────────────────────────
export function drawHitZone(ctx, x, y, width, pulse) {
  const alpha = 0.12 + pulse * 0.08;
  ctx.save();

  // Scanline glow band
  const grad = ctx.createLinearGradient(x - width / 2, y - 6, x - width / 2, y + 6);
  grad.addColorStop(0, `rgba(255,255,255,0)`);
  grad.addColorStop(0.5, `rgba(100,220,255,${alpha})`);
  grad.addColorStop(1, `rgba(255,255,255,0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - width / 2, y - 6, width, 12);

  // Center line
  ctx.strokeStyle = `rgba(100,220,255,${alpha * 1.5})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x - width / 2 + 10, y);
  ctx.lineTo(x + width / 2 - 10, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ─── Explosion particles ─────────────────────────────
export function drawExplosion(ctx, x, y, color, progress) {
  const bc = BLOB_COLORS[color];
  if (!bc) return;

  const numParticles = 12;
  const maxR = 40;
  const alpha = Math.max(0, 1 - progress);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Glow ring
  const ringR = progress * maxR;
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = bc.glow;
  ctx.lineWidth = 3 * (1 - progress);
  ctx.stroke();

  // Debris pixels
  for (let i = 0; i < numParticles; i++) {
    const angle = (i / numParticles) * Math.PI * 2 + progress * 0.5;
    const dist = progress * maxR * (0.6 + Math.sin(i * 1.7) * 0.4);
    const px = x + Math.cos(angle) * dist;
    const py = y + Math.sin(angle) * dist;
    const size = Math.max(1, 4 * (1 - progress));
    ctx.fillStyle = i % 3 === 0 ? bc.core : i % 3 === 1 ? bc.fill : '#ffffff';
    ctx.fillRect(px - size / 2, py - size / 2, size, size);
  }

  ctx.restore();
}

// ─── Miss fizz ───────────────────────────────────────
export function drawMissFizz(ctx, x, y, progress) {
  const alpha = Math.max(0, 1 - progress * 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ff6666';
  ctx.font = `bold ${14 + progress * 6}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('MISS', x, y - progress * 20);
  ctx.restore();
}

// ─── Bonk effect ─────────────────────────────────────
export function drawBonkFX(ctx, x, y, progress) {
  const alpha = Math.max(0, 1 - progress);
  ctx.save();
  ctx.globalAlpha = alpha;

  // Stars
  const starCount = 5;
  for (let i = 0; i < starCount; i++) {
    const angle = (i / starCount) * Math.PI * 2 + progress * 2;
    const dist = 15 + progress * 25;
    const sx = x + Math.cos(angle) * dist;
    const sy = y + Math.sin(angle) * dist;
    ctx.fillStyle = i % 2 ? '#ffcc22' : '#ffffff';
    ctx.font = `${10 + (1 - progress) * 6}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('*', sx, sy);
  }

  // BONK text
  ctx.fillStyle = '#ff4455';
  ctx.font = `bold ${16 + progress * 8}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('BONK!', x, y - 30 - progress * 15);

  ctx.restore();
}

// ─── HUD elements ────────────────────────────────────
export function drawHUD(ctx, canvasW, time, score, streak, cadence) {
  ctx.save();

  // Time bar background
  const barY = 8;
  const barH = 6;
  const barW = canvasW - 24;
  const barX = 12;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 3);
  ctx.fill();

  // Time bar fill
  const pct = Math.max(0, time / 30000);
  const barColor = pct > 0.3 ? '#4488ff' : pct > 0.1 ? '#ffcc22' : '#ff4455';
  ctx.fillStyle = barColor;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW * pct, barH, 3);
  ctx.fill();

  // Score
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(String(score), 14, 36);

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '600 10px system-ui';
  ctx.fillText('SCORE', 14, 48);

  // Streak
  if (streak > 1) {
    ctx.fillStyle = '#ffcc22';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`${streak}x`, canvasW - 14, 36);
    ctx.fillStyle = 'rgba(255,204,34,0.5)';
    ctx.font = '600 9px system-ui';
    ctx.fillText('STREAK', canvasW - 14, 47);
  }

  ctx.restore();
}

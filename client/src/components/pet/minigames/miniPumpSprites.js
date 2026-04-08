/**
 * Mini-Pump Canvas Sprites v2
 * Horizontal blob creatures, segmented target line, pet, laser, pads, FX
 */

// ─── Character color themes ─────────────────────────
export const CHAR_COLORS = {
  dojocat: { body: '#dfae6f', dark: '#b77739', light: '#f6d7aa', belly: '#fff2df', eye: '#2d2d2d', outline: '#151515', accent: '#f6a3ae', nose: '#b4544a' },
  buu:     { body: '#f0b8c8', dark: '#d98ea7', light: '#ffdbe7', belly: '#f7d1de', eye: '#2d2d2d', outline: '#1a1a1a', accent: '#f48fb1', nose: '#a55f6c' },
  devit:   { body: '#faf9f2', dark: '#dfddd2', light: '#ffffff', belly: '#fefcf8', eye: '#e53935', outline: '#202020', accent: '#c43d34', nose: '#ffb2b7' },
  pixiu:   { body: '#fff2f7', dark: '#efc0cf', light: '#ffffff', belly: '#fff8fb', eye: '#6d4c41', outline: '#40262f', accent: '#ee81b0', nose: '#d76f79' },
};

export const BLOB_COLORS = {
  red:    { fill: '#ff4455', glow: '#ff6677', core: '#ff2233', outline: '#cc1122', dark: '#991118' },
  yellow: { fill: '#ffcc22', glow: '#ffdd55', core: '#ffbb00', outline: '#cc9900', dark: '#996600' },
  blue:   { fill: '#4488ff', glow: '#66aaff', core: '#2266ee', outline: '#1144cc', dark: '#0c3399' },
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

function drawPixelEllipse(ctx, cx, cy, rx, ry, ps, color) {
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1)
        px(ctx, cx + dx * ps, cy + dy * ps, ps, color);
    }
}

function drawPixelCircle(ctx, cx, cy, r, ps, color) {
  drawPixelEllipse(ctx, cx, cy, r, r, ps, color);
}

// ─── Blob creature (horizontal pill with face) ──────
export function drawBlobCreature(ctx, x, y, w, h, color, isBottom, nearLine) {
  const bc = BLOB_COLORS[color];
  if (!bc) return;

  const hw = w / 2, hh = h / 2;
  const r = Math.min(hw, hh);

  // Glow when bottom blob approaching line
  if (isBottom && nearLine > 0) {
    ctx.save();
    ctx.shadowColor = bc.glow;
    ctx.shadowBlur = 6 + nearLine * 10;
    ctx.beginPath();
    ctx.roundRect(x - hw, y - hh, w, h, r);
    ctx.fillStyle = bc.fill;
    ctx.fill();
    ctx.restore();
  }

  // Body — rounded capsule
  ctx.beginPath();
  ctx.roundRect(x - hw, y - hh, w, h, r);
  ctx.fillStyle = bc.fill;
  ctx.fill();
  ctx.strokeStyle = bc.outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Highlight band on top
  ctx.beginPath();
  ctx.roundRect(x - hw + 4, y - hh + 2, w - 8, h * 0.35, r * 0.6);
  ctx.fillStyle = bc.glow;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Dark belly
  ctx.beginPath();
  ctx.roundRect(x - hw + 6, y + 1, w - 12, h * 0.3, r * 0.4);
  ctx.fillStyle = bc.dark;
  ctx.globalAlpha = 0.25;
  ctx.fill();
  ctx.globalAlpha = 1;

  // ─── Face ───
  const eyeY = y - 1;
  const eyeSpread = w * 0.18;
  const eyeR = Math.max(2, h * 0.12);

  if (color === 'red') {
    // Fierce: angled brows, flat mouth
    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x - eyeSpread, eyeY, eyeR + 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + eyeSpread, eyeY, eyeR + 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bc.outline;
    ctx.beginPath(); ctx.arc(x - eyeSpread + 1, eyeY + 1, eyeR * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + eyeSpread + 1, eyeY + 1, eyeR * 0.6, 0, Math.PI * 2); ctx.fill();
    // Brows
    ctx.strokeStyle = bc.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - eyeSpread - eyeR, eyeY - eyeR - 2);
    ctx.lineTo(x - eyeSpread + eyeR * 0.5, eyeY - eyeR);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + eyeSpread + eyeR, eyeY - eyeR - 2);
    ctx.lineTo(x + eyeSpread - eyeR * 0.5, eyeY - eyeR);
    ctx.stroke();
    // Flat mouth
    ctx.strokeStyle = bc.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.08, y + hh * 0.4);
    ctx.lineTo(x + w * 0.08, y + hh * 0.4);
    ctx.stroke();
  } else if (color === 'yellow') {
    // Alert: round eyes, small O mouth
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x - eyeSpread, eyeY, eyeR + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + eyeSpread, eyeY, eyeR + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bc.outline;
    ctx.beginPath(); ctx.arc(x - eyeSpread, eyeY + 0.5, eyeR * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + eyeSpread, eyeY + 0.5, eyeR * 0.7, 0, Math.PI * 2); ctx.fill();
    // Eye shine
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x - eyeSpread + 1, eyeY - 1, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + eyeSpread + 1, eyeY - 1, 1.2, 0, Math.PI * 2); ctx.fill();
    // O mouth
    ctx.strokeStyle = bc.outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y + hh * 0.35, 2.5, 0, Math.PI * 2); ctx.stroke();
  } else {
    // Blue: sleepy half-lid, gentle curve mouth
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x - eyeSpread, eyeY, eyeR + 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + eyeSpread, eyeY, eyeR + 1, 0, Math.PI * 2); ctx.fill();
    // Half-lid overlay
    ctx.fillStyle = bc.fill;
    ctx.fillRect(x - eyeSpread - eyeR - 2, eyeY - eyeR - 2, (eyeR + 2) * 2 + 2, eyeR + 1);
    ctx.fillRect(x + eyeSpread - eyeR - 2, eyeY - eyeR - 2, (eyeR + 2) * 2 + 2, eyeR + 1);
    // Pupils
    ctx.fillStyle = bc.outline;
    ctx.beginPath(); ctx.arc(x - eyeSpread, eyeY + 1, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + eyeSpread, eyeY + 1, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
    // Gentle smile
    ctx.strokeStyle = bc.outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y + hh * 0.15, w * 0.06, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  // Cheek blush marks
  ctx.fillStyle = bc.glow;
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(x - eyeSpread - eyeR - 3, eyeY + 3, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + eyeSpread + eyeR + 3, eyeY + 3, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

// ─── Target line ─────────────────────────────────────
export function drawTargetLine(ctx, x, y, width, pulse, flashColor) {
  ctx.save();

  const hw = width / 2;
  const baseAlpha = 0.35 + pulse * 0.15;

  // Soft glow bloom behind the line
  const grad = ctx.createLinearGradient(x - hw, y - 8, x - hw, y + 8);
  grad.addColorStop(0, 'rgba(100,220,255,0)');
  grad.addColorStop(0.5, `rgba(100,220,255,${baseAlpha * 0.3})`);
  grad.addColorStop(1, 'rgba(100,220,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - hw, y - 8, width, 16);

  // Flash overlay on hit/bonk
  if (flashColor) {
    ctx.fillStyle = flashColor;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x - hw, y - 3, width, 6);
    ctx.globalAlpha = 1;
  }

  // Segmented center line
  const segLen = 8, gapLen = 5;
  ctx.strokeStyle = `rgba(180,230,255,${baseAlpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let sx = x - hw + 12; sx < x + hw - 12; sx += segLen + gapLen) {
    ctx.moveTo(sx, y);
    ctx.lineTo(Math.min(sx + segLen, x + hw - 12), y);
  }
  ctx.stroke();

  // Tick marks at edges
  const tickH = 6;
  ctx.strokeStyle = `rgba(140,200,240,${baseAlpha * 0.6})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - hw + 6, y - tickH); ctx.lineTo(x - hw + 6, y + tickH);
  ctx.moveTo(x + hw - 6, y - tickH); ctx.lineTo(x + hw - 6, y + tickH);
  ctx.stroke();

  ctx.restore();
}

// ─── Pet sprite ──────────────────────────────────────
export function drawPet(ctx, x, y, ps, character, pose, expression) {
  const c = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const centerX = x;
  const headY = y - 10 * ps;
  const bodyY = y + 2 * ps;

  let headDx = 0, headDy = 0, bodyDy = 0;
  let leftLegDy = 0, rightLegDy = 0, leftLegDx = 0, rightLegDx = 0;

  switch (pose) {
    case 'step_red':    leftLegDy = -2 * ps; leftLegDx = -2 * ps; headDx = -1 * ps; break;
    case 'step_yellow': bodyDy = -1 * ps; headDy = -2 * ps; break;
    case 'step_blue':   rightLegDy = -2 * ps; rightLegDx = 2 * ps; headDx = 1 * ps; break;
    case 'laser_fire':  bodyDy = -2 * ps; headDy = -3 * ps; break;
    case 'bonk':        bodyDy = 3 * ps; headDy = 4 * ps; break;
    case 'celebrate': case 'results_proud': bodyDy = -3 * ps; headDy = -4 * ps; break;
    case 'stunned': case 'results_tired': headDx = Math.sin(Date.now() / 80) * 2 * ps; break;
    case 'ready':       bodyDy = -1 * ps; break;
    default: break;
  }

  // Shadow
  drawPixelEllipse(ctx, centerX, y + 14 * ps + bodyDy, 7, 2, ps, 'rgba(0,0,0,0.15)');
  // Body
  drawPixelEllipse(ctx, centerX, bodyY + bodyDy, 8, 7, ps, c.outline);
  drawPixelEllipse(ctx, centerX, bodyY + bodyDy, 7, 6, ps, c.body);
  drawPixelEllipse(ctx, centerX, bodyY + 2 * ps + bodyDy, 5, 4, ps, c.belly);
  // Legs
  const legY = bodyY + 7 * ps + bodyDy, legSpread = 4 * ps;
  ctx.fillStyle = c.outline;
  ctx.fillRect(centerX - legSpread + leftLegDx - ps, legY + leftLegDy, 3 * ps, 6 * ps);
  ctx.fillStyle = c.body;
  ctx.fillRect(centerX - legSpread + leftLegDx, legY + leftLegDy + ps, ps, 4 * ps);
  ctx.fillStyle = c.outline;
  ctx.fillRect(centerX + legSpread - 2 * ps + rightLegDx, legY + rightLegDy, 3 * ps, 6 * ps);
  ctx.fillStyle = c.body;
  ctx.fillRect(centerX + legSpread - ps + rightLegDx, legY + rightLegDy + ps, ps, 4 * ps);
  // Head
  const hx = centerX + headDx, hy = headY + headDy;
  if (character === 'buu') {
    drawPixelEllipse(ctx, hx, hy + 2 * ps, 10, 8, ps, c.outline);
    drawPixelEllipse(ctx, hx, hy + 2 * ps, 9, 7, ps, c.body);
    drawPixelEllipse(ctx, hx, hy - 1 * ps, 7, 6, ps, c.body);
    px(ctx, hx - ps, hy - 8 * ps, ps, c.accent);
    px(ctx, hx, hy - 9 * ps, ps, c.accent);
    px(ctx, hx + ps, hy - 10 * ps, ps, c.accent);
    drawPixelCircle(ctx, hx + 2 * ps, hy - 11 * ps, 2, ps, c.accent);
  } else {
    drawPixelEllipse(ctx, hx, hy, 10, 8, ps, c.outline);
    drawPixelEllipse(ctx, hx, hy, 9, 7, ps, c.body);
    drawPixelEllipse(ctx, hx, hy - 2 * ps, 6, 4, ps, c.light);
  }
  // Ears/horns
  if (character === 'dojocat' || character === 'pixiu') {
    const earY2 = hy - 7 * ps;
    for (let i = 0; i < 4; i++) { px(ctx, hx - 8 * ps + i * ps, earY2 - i * ps, ps, c.outline); px(ctx, hx + 8 * ps - i * ps, earY2 - i * ps, ps, c.outline); }
    for (let i = 0; i < 3; i++) { px(ctx, hx - 7 * ps + i * ps, earY2 - i * ps + ps, ps, c.accent); px(ctx, hx + 7 * ps - i * ps, earY2 - i * ps + ps, ps, c.accent); }
    drawPixelEllipse(ctx, hx, hy + 2 * ps, 4, 3, ps, c.belly);
  }
  if (character === 'devit') { for (let i = 0; i < 5; i++) { px(ctx, hx - 6 * ps - i * ps, hy - 5 * ps - i * ps, ps * 2, c.accent); px(ctx, hx + 6 * ps + i * ps, hy - 5 * ps - i * ps, ps * 2, c.accent); } }
  if (character === 'pixiu') { for (let i = 0; i < 3; i++) { px(ctx, hx - 10 * ps, hy - 2 * ps + i * 2 * ps, ps * 2, c.accent); px(ctx, hx + 9 * ps, hy - 2 * ps + i * 2 * ps, ps * 2, c.accent); } }
  // Eyes
  const eyeY = hy + ps, eyeSpread = 4 * ps;
  if (expression === 'stunned' || pose === 'stunned' || pose === 'bonk' || pose === 'results_tired') {
    px(ctx, hx - eyeSpread - ps, eyeY - ps, ps, c.eye); px(ctx, hx - eyeSpread + ps, eyeY + ps, ps, c.eye);
    px(ctx, hx - eyeSpread + ps, eyeY - ps, ps, c.eye); px(ctx, hx - eyeSpread - ps, eyeY + ps, ps, c.eye);
    px(ctx, hx + eyeSpread - ps, eyeY - ps, ps, c.eye); px(ctx, hx + eyeSpread + ps, eyeY + ps, ps, c.eye);
    px(ctx, hx + eyeSpread + ps, eyeY - ps, ps, c.eye); px(ctx, hx + eyeSpread - ps, eyeY + ps, ps, c.eye);
  } else if (expression === 'celebrate' || pose === 'celebrate' || pose === 'results_proud') {
    for (let i = -1; i <= 1; i++) { px(ctx, hx - eyeSpread + i * ps, eyeY, ps, c.eye); px(ctx, hx + eyeSpread + i * ps, eyeY, ps, c.eye); }
    px(ctx, hx - eyeSpread - 2 * ps, eyeY - ps, ps, c.eye); px(ctx, hx + eyeSpread + 2 * ps, eyeY - ps, ps, c.eye);
  } else if (expression === 'focused') {
    for (let i = -1; i <= 1; i++) { px(ctx, hx - eyeSpread + i * ps, eyeY, ps * 1.2, c.eye); px(ctx, hx + eyeSpread + i * ps, eyeY, ps * 1.2, c.eye); }
  } else {
    drawPixelCircle(ctx, hx - eyeSpread, eyeY, 2, ps, c.eye); drawPixelCircle(ctx, hx + eyeSpread, eyeY, 2, ps, c.eye);
    px(ctx, hx - eyeSpread + ps, eyeY - ps, ps, '#ffffff'); px(ctx, hx + eyeSpread + ps, eyeY - ps, ps, '#ffffff');
  }
  // Mouth
  if (expression === 'celebrate' || pose === 'celebrate' || pose === 'results_proud') {
    for (let i = -2; i <= 2; i++) px(ctx, hx + i * ps, hy + 4 * ps, ps, c.nose);
    px(ctx, hx - 2 * ps, hy + 3 * ps, ps, c.nose); px(ctx, hx + 2 * ps, hy + 3 * ps, ps, c.nose);
  } else if (expression === 'stunned' || pose === 'bonk') {
    drawPixelCircle(ctx, hx, hy + 4 * ps, 2, ps, c.nose); px(ctx, hx, hy + 4 * ps, ps, c.belly);
  } else { px(ctx, hx, hy + 3 * ps, ps, c.nose); px(ctx, hx - ps, hy + 3 * ps, ps, c.nose); }
  // Arms
  const armY = bodyY - 2 * ps + bodyDy;
  if (pose === 'celebrate' || pose === 'results_proud') {
    for (let i = 0; i < 5; i++) { px(ctx, centerX - 9 * ps, armY - i * ps, 2 * ps, c.outline); px(ctx, centerX + 8 * ps, armY - i * ps, 2 * ps, c.outline); }
  } else if (pose === 'laser_fire') {
    for (let i = 0; i < 4; i++) { px(ctx, centerX - 9 * ps - i * ps, armY + 2 * ps, 2 * ps, c.outline); px(ctx, centerX + 8 * ps + i * ps, armY + 2 * ps, 2 * ps, c.outline); }
  } else {
    for (let i = 0; i < 5; i++) { px(ctx, centerX - 9 * ps, armY + i * ps, 2 * ps, c.outline); px(ctx, centerX + 8 * ps, armY + i * ps, 2 * ps, c.outline); }
  }
}

// ─── Pads ────────────────────────────────────────────
export function drawPad(ctx, x, y, w, h, color, active) {
  const pc = PAD_COLORS[color]; if (!pc) return;
  const r = 6;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = active ? pc.active : pc.base; ctx.fill();
  ctx.strokeStyle = active ? pc.active : pc.border; ctx.lineWidth = active ? 2 : 1; ctx.stroke();
  if (active) { ctx.save(); ctx.shadowColor = pc.active; ctx.shadowBlur = 12; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.strokeStyle = pc.active; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = active ? '#ffffff' : 'rgba(255,255,255,0.5)';
  ctx.font = `bold ${Math.round(h * 0.35)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText({ red: 'A', yellow: 'S', blue: 'D' }[color] || '', x + w / 2, y + h / 2);
}

// ─── Laser ───────────────────────────────────────────
export function drawLaser(ctx, x, startY, endY, color, progress) {
  const lc = LASER_COLORS[color]; if (!lc) return;
  const alpha = Math.max(0, 1 - progress * 1.5);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.shadowColor = lc.glow; ctx.shadowBlur = 16;
  ctx.fillStyle = lc.beam; ctx.fillRect(x - 4, endY, 8, startY - endY);
  ctx.fillStyle = lc.core; ctx.fillRect(x - 1, endY, 2, startY - endY);
  ctx.restore();
}

// ─── Explosion ───────────────────────────────────────
export function drawExplosion(ctx, x, y, color, progress) {
  const bc = BLOB_COLORS[color]; if (!bc) return;
  const alpha = Math.max(0, 1 - progress);
  ctx.save(); ctx.globalAlpha = alpha;
  const maxR = 40, ringR = progress * maxR;
  ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = bc.glow; ctx.lineWidth = 3 * (1 - progress); ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + progress * 0.5;
    const dist = progress * maxR * (0.6 + Math.sin(i * 1.7) * 0.4);
    const size = Math.max(1, 4 * (1 - progress));
    ctx.fillStyle = i % 3 === 0 ? bc.core : i % 3 === 1 ? bc.fill : '#ffffff';
    ctx.fillRect(x + Math.cos(angle) * dist - size / 2, y + Math.sin(angle) * dist - size / 2, size, size);
  }
  ctx.restore();
}

// ─── Judgement text FX ───────────────────────────────
export function drawJudgementFX(ctx, x, y, text, color, progress) {
  const alpha = Math.max(0, 1 - progress);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `bold ${14 + progress * 4}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y - progress * 24);
  ctx.restore();
}

// ─── Miss fizz ───────────────────────────────────────
export function drawMissFizz(ctx, x, y, progress) {
  const alpha = Math.max(0, 1 - progress * 2);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ff6666';
  ctx.font = `bold ${13 + progress * 4}px system-ui`; ctx.textAlign = 'center';
  ctx.fillText('MISS', x, y - progress * 18);
  ctx.restore();
}

// ─── Bonk FX ─────────────────────────────────────────
export function drawBonkFX(ctx, x, y, progress) {
  const alpha = Math.max(0, 1 - progress);
  ctx.save(); ctx.globalAlpha = alpha;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + progress * 2;
    const dist = 12 + progress * 25;
    ctx.fillStyle = i % 2 ? '#ffcc22' : '#ffffff';
    ctx.font = `${10 + (1 - progress) * 6}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText('*', x + Math.cos(angle) * dist, y + Math.sin(angle) * dist);
  }
  ctx.restore();
}

// ─── HUD ─────────────────────────────────────────────
export function drawHUD(ctx, canvasW, time, score, streak, cadence) {
  ctx.save();

  // Time bar
  const barY = 8, barH = 6, barW = canvasW - 24, barX = 12;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();
  const pct = Math.max(0, time / 30000);
  const barColor = pct > 0.3 ? '#4488ff' : pct > 0.1 ? '#ffcc22' : '#ff4455';
  ctx.fillStyle = barColor;
  ctx.beginPath(); ctx.roundRect(barX, barY, barW * pct, barH, 3); ctx.fill();

  // Countdown clock (seconds remaining)
  const secs = Math.ceil(time / 1000);
  ctx.fillStyle = pct > 0.3 ? 'rgba(255,255,255,0.85)' : barColor;
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(secs), canvasW / 2, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '600 8px system-ui';
  ctx.fillText('SEC', canvasW / 2, 42);

  // Score (left)
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left'; ctx.fillText(String(score), 14, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '600 10px system-ui'; ctx.fillText('SCORE', 14, 46);

  // Streak (right)
  if (streak > 1) {
    ctx.fillStyle = '#ffcc22'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(`${streak}x`, canvasW - 14, 34);
    ctx.fillStyle = 'rgba(255,204,34,0.5)'; ctx.font = '600 9px system-ui'; ctx.fillText('STREAK', canvasW - 14, 44);
  }

  ctx.restore();
}

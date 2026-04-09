// ─── Pac It Up! sprite drawing (pixel-art, canvas only) ──────────
import { CHAR_COLORS } from './miniPumpSprites';
export { CHAR_COLORS };

// ─── Palettes ────────────────────────────────────────────────────

export const GHOST_COLORS = {
  tempo: { body: '#ee3333', dark: '#aa1111', eye: '#ffffff', pupil: '#222244', skirt: '#cc2222', fright: '#2244ff', frightBlink: '#ffffff' },
  glint: { body: '#ff88bb', dark: '#cc5588', eye: '#ffffff', pupil: '#222244', skirt: '#ee6699', fright: '#2244ff', frightBlink: '#ffffff' },
  drift: { body: '#44ddee', dark: '#22aabb', eye: '#ffffff', pupil: '#222244', skirt: '#33ccdd', fright: '#2244ff', frightBlink: '#ffffff' },
  ember: { body: '#ffaa33', dark: '#cc7711', eye: '#ffffff', pupil: '#222244', skirt: '#ee9922', fright: '#2244ff', frightBlink: '#ffffff' },
};
export const GHOST_NAMES = ['tempo', 'glint', 'drift', 'ember'];

export const WALL_THEMES = {
  dojo:   { fill: '#1a2844', border: '#3366aa', glow: 'rgba(50,100,180,0.15)' },
  snack:  { fill: '#2a1a30', border: '#8855aa', glow: 'rgba(130,80,170,0.15)' },
  shrine: { fill: '#1a2a1a', border: '#44aa66', glow: 'rgba(60,160,90,0.15)' },
};

export const STOMP_COLORS = { fill: '#ffcc22', glow: 'rgba(255,204,34,0.4)', core: '#ffe866' };
export const POWER_COLORS = { fill: '#ff4466', glow: 'rgba(255,68,102,0.5)', core: '#ff8899', ring: '#ff2244' };
export const MINE_COLORS  = { fill: '#555555', spike: '#ff3333', core: '#222222', warn: '#ff6644' };
export const SHIELD_COLORS = { fill: '#44ccff', glow: 'rgba(68,204,255,0.5)', ring: '#88eeff' };

// ─── Pixel helpers ───────────────────────────────────────────────

function px(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), s, s);
}

function drawPixelCircle(ctx, cx, cy, r, ps, color) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        px(ctx, cx + dx * ps, cy + dy * ps, ps, color);
      }
    }
  }
}

// ─── Wall drawing ────────────────────────────────────────────────

export function drawWalls(ctx, grid, tileSize, theme, animFrame) {
  const colors = WALL_THEMES[theme] || WALL_THEMES.dojo;
  const rows = grid.length;
  const cols = grid[0].length;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] !== 'wall') continue;
      const px0 = x * tileSize;
      const py0 = y * tileSize;

      ctx.fillStyle = colors.fill;
      ctx.fillRect(px0, py0, tileSize, tileSize);

      // Draw border edges where adjacent to non-wall
      ctx.fillStyle = colors.border;
      const bw = Math.max(1, tileSize * 0.15);
      if (y === 0 || grid[y - 1]?.[x] !== 'wall') ctx.fillRect(px0, py0, tileSize, bw);
      if (y === rows - 1 || grid[y + 1]?.[x] !== 'wall') ctx.fillRect(px0, py0 + tileSize - bw, tileSize, bw);
      if (x === 0 || grid[y][x - 1] !== 'wall') ctx.fillRect(px0, py0, bw, tileSize);
      if (x === cols - 1 || grid[y][x + 1] !== 'wall') ctx.fillRect(px0 + tileSize - bw, py0, bw, tileSize);
    }
  }
}

// ─── Stomp (center-panel style) ──────────────────────────────────

export function drawStomp(ctx, cx, cy, size, animFrame) {
  const r = size * 0.3;
  const pulse = 1 + Math.sin(animFrame * 0.08) * 0.1;

  // Glow
  ctx.fillStyle = STOMP_COLORS.glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Core diamond shape (pad-like)
  const s = r * pulse;
  ctx.fillStyle = STOMP_COLORS.fill;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.7, cy);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s * 0.7, cy);
  ctx.closePath();
  ctx.fill();

  // Inner highlight
  ctx.fillStyle = STOMP_COLORS.core;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Power stomp ─────────────────────────────────────────────────

export function drawPowerStomp(ctx, cx, cy, size, animFrame) {
  const r = size * 0.4;
  const pulse = 1 + Math.sin(animFrame * 0.12) * 0.2;

  // Outer ring glow
  ctx.strokeStyle = POWER_COLORS.ring;
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse * 1.3, 0, Math.PI * 2);
  ctx.stroke();

  // Glow
  ctx.fillStyle = POWER_COLORS.glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Core (larger diamond)
  const s = r * pulse;
  ctx.fillStyle = POWER_COLORS.fill;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.8, cy);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s * 0.8, cy);
  ctx.closePath();
  ctx.fill();

  // Inner
  ctx.fillStyle = POWER_COLORS.core;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Mine ────────────────────────────────────────────────────────

export function drawMine(ctx, cx, cy, size, animFrame) {
  const r = size * 0.3;
  const wobble = Math.sin(animFrame * 0.06) * 0.5;

  // Warning glow
  ctx.fillStyle = MINE_COLORS.warn;
  ctx.globalAlpha = 0.15 + Math.sin(animFrame * 0.1) * 0.1;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Body
  ctx.fillStyle = MINE_COLORS.fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Spikes
  ctx.fillStyle = MINE_COLORS.spike;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + wobble;
    const sx = cx + Math.cos(angle) * r * 1.3;
    const sy = cy + Math.sin(angle) * r * 1.3;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // Core
  ctx.fillStyle = MINE_COLORS.core;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // X mark
  ctx.strokeStyle = MINE_COLORS.spike;
  ctx.lineWidth = Math.max(1, size * 0.05);
  const xs = r * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx - xs, cy - xs); ctx.lineTo(cx + xs, cy + xs);
  ctx.moveTo(cx + xs, cy - xs); ctx.lineTo(cx - xs, cy + xs);
  ctx.stroke();
}

// ─── Shield pickup ───────────────────────────────────────────────

export function drawShieldPickup(ctx, cx, cy, size, animFrame) {
  const r = size * 0.35;
  const pulse = 1 + Math.sin(animFrame * 0.1) * 0.15;
  const float = Math.sin(animFrame * 0.06) * size * 0.08;

  ctx.fillStyle = SHIELD_COLORS.glow;
  ctx.beginPath();
  ctx.arc(cx, cy + float, r * pulse * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Shield shape
  ctx.fillStyle = SHIELD_COLORS.fill;
  ctx.beginPath();
  ctx.moveTo(cx, cy + float - r * pulse);
  ctx.quadraticCurveTo(cx + r * pulse, cy + float - r * 0.3, cx + r * pulse * 0.7, cy + float + r * 0.6);
  ctx.lineTo(cx, cy + float + r * pulse);
  ctx.lineTo(cx - r * pulse * 0.7, cy + float + r * 0.6);
  ctx.quadraticCurveTo(cx - r * pulse, cy + float - r * 0.3, cx, cy + float - r * pulse);
  ctx.fill();

  ctx.strokeStyle = SHIELD_COLORS.ring;
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.stroke();
}

// ─── Ghost ───────────────────────────────────────────────────────

export function drawGhost(ctx, cx, cy, size, ghostName, state, dir, animFrame, reducedMotion) {
  const colors = GHOST_COLORS[ghostName] || GHOST_COLORS.tempo;
  const r = size * 0.4;
  const ps = Math.max(1, Math.floor(size / 12));

  const isFrightened = state === 'frightened';
  const isReturning = state === 'returning';
  const isBlinking = isFrightened && (animFrame % 20 < 10);

  if (isReturning) {
    // Just eyes
    drawGhostEyes(ctx, cx, cy - r * 0.2, r, dir, '#ffffff', '#222244');
    return;
  }

  const bodyColor = isFrightened ? (isBlinking ? colors.frightBlink : colors.fright) : colors.body;
  const darkColor = isFrightened ? '#1122aa' : colors.dark;

  // Body (rounded top, wavy bottom)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0, false);
  ctx.lineTo(cx + r, cy + r * 0.7);

  // Wavy skirt
  const segments = 4;
  const segW = (r * 2) / segments;
  const waveAmp = r * 0.15;
  const waveOff = reducedMotion ? 0 : (animFrame * 0.15);
  for (let i = segments; i >= 0; i--) {
    const sx = cx - r + i * segW;
    const sy = cy + r * 0.7 + Math.sin(waveOff + i * 1.5) * waveAmp;
    ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();

  // Eyes
  if (isFrightened) {
    // Frightened face: wavy mouth + simple eyes
    const eyeR = r * 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.2, eyeR, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.25, cy - r * 0.2, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Wavy mouth
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, ps);
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const mx = cx - r * 0.35 + (r * 0.7 / 4) * i;
      const my = cy + r * 0.2 + (i % 2 === 0 ? -ps : ps);
      i === 0 ? ctx.moveTo(mx, my) : ctx.lineTo(mx, my);
    }
    ctx.stroke();
  } else {
    drawGhostEyes(ctx, cx, cy - r * 0.2, r, dir, colors.eye, colors.pupil);
  }
}

function drawGhostEyes(ctx, cx, cy, r, dir, eyeColor, pupilColor) {
  const eyeR = r * 0.22;
  const pupilR = r * 0.11;
  const eyeSpacing = r * 0.35;
  const dx = { up: 0, down: 0, left: -pupilR * 0.6, right: pupilR * 0.6 };
  const dy = { up: -pupilR * 0.6, down: pupilR * 0.6, left: 0, right: 0 };
  const pd = dx[dir] || 0;
  const pdy = dy[dir] || 0;

  for (const side of [-1, 1]) {
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(cx + side * eyeSpacing, cy, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pupilColor;
    ctx.beginPath();
    ctx.arc(cx + side * eyeSpacing + pd, cy + pdy, pupilR, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Player pet ──────────────────────────────────────────────────

export function drawPlayerPet(ctx, cx, cy, size, character, dir, animFrame, invuln, shieldActive, reducedMotion) {
  const c = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const ps = Math.max(1, Math.floor(size / 12));
  const r = size * 0.38;

  // Invulnerability blink
  if (invuln && !reducedMotion && animFrame % 8 < 4) return;

  // Shield aura
  if (shieldActive) {
    ctx.strokeStyle = SHIELD_COLORS.ring;
    ctx.lineWidth = Math.max(1, ps * 1.5);
    ctx.globalAlpha = 0.5 + Math.sin(animFrame * 0.15) * 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Body
  drawPixelCircle(ctx, cx, cy, Math.round(r / ps), ps, c.body);

  // Darker bottom half
  drawPixelCircle(ctx, cx, cy + ps * 2, Math.round(r / ps) - 1, ps, c.dark);
  drawPixelCircle(ctx, cx, cy, Math.round(r / ps) - 1, ps, c.body);

  // Belly
  drawPixelCircle(ctx, cx, cy + ps, Math.round(r / ps * 0.5), ps, c.belly || c.light);

  // Face direction offset
  const fdx = dir === 'left' ? -ps : dir === 'right' ? ps : 0;
  const fdy = dir === 'up' ? -ps : dir === 'down' ? ps : 0;

  // Eyes
  const eyeSpacing = ps * 2.5;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - eyeSpacing + fdx - ps, cy - ps * 2 + fdy, ps * 2, ps * 2);
  ctx.fillRect(cx + eyeSpacing + fdx - ps, cy - ps * 2 + fdy, ps * 2, ps * 2);

  // Pupils
  ctx.fillStyle = c.eye || '#2d2d2d';
  const pOff = dir === 'left' ? -ps * 0.5 : dir === 'right' ? ps * 0.5 : 0;
  const pyOff = dir === 'up' ? -ps * 0.5 : dir === 'down' ? ps * 0.5 : 0;
  ctx.fillRect(cx - eyeSpacing + fdx + pOff, cy - ps * 1.5 + fdy + pyOff, ps, ps);
  ctx.fillRect(cx + eyeSpacing + fdx + pOff, cy - ps * 1.5 + fdy + pyOff, ps, ps);

  // Nose
  px(ctx, cx + fdx - ps * 0.5, cy + fdy, ps, c.nose || c.accent || c.dark);

  // Mouth (open when moving)
  if (dir !== 'up' && dir !== 'down') {
    const mouthX = dir === 'left' ? cx - r * 0.6 : dir === 'right' ? cx + r * 0.3 : cx - ps;
    ctx.fillStyle = c.outline || '#151515';
    ctx.fillRect(mouthX, cy + ps * 1.5 + fdy, ps * 2, ps);
  }
}

// ─── FX ──────────────────────────────────────────────────────────

export function drawScorePopup(ctx, cx, cy, text, age, color) {
  const alpha = Math.max(0, 1 - age / 800);
  const rise = age * 0.04;
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = color || '#ffee44';
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, cy - rise);
  ctx.globalAlpha = 1;
}

export function drawDamageFlash(ctx, w, h, intensity) {
  if (intensity <= 0) return;
  ctx.fillStyle = `rgba(255, 40, 40, ${Math.min(0.4, intensity)})`;
  ctx.fillRect(0, 0, w, h);
}

export function drawCameraShake(ctx, intensity, reducedMotion) {
  if (reducedMotion || intensity <= 0) return { x: 0, y: 0 };
  const x = (Math.random() - 0.5) * intensity * 4;
  const y = (Math.random() - 0.5) * intensity * 4;
  ctx.translate(x, y);
  return { x, y };
}

// ─── HUD ─────────────────────────────────────────────────────────

export function drawHUD(ctx, w, h, state) {
  const pad = 6;
  ctx.font = 'bold 11px monospace';
  ctx.textBaseline = 'top';

  // Score (top-left)
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${state.score}`, pad, pad);

  // Stage (top-center)
  ctx.textAlign = 'center';
  ctx.fillText(`STAGE ${state.stage}`, w / 2, pad);

  // Combo (top-right)
  ctx.textAlign = 'right';
  if (state.combo > 0) {
    ctx.fillStyle = '#ffcc22';
    ctx.fillText(`COMBO ×${state.combo}`, w - pad, pad);
  }

  // Lives (bottom-left)
  ctx.textAlign = 'left';
  const heartSize = 8;
  for (let i = 0; i < state.lives; i++) {
    const hx = pad + i * (heartSize + 4);
    const hy = h - pad - heartSize;
    ctx.fillStyle = '#ff4466';
    ctx.beginPath();
    ctx.arc(hx + heartSize * 0.3, hy + heartSize * 0.3, heartSize * 0.3, 0, Math.PI * 2);
    ctx.arc(hx + heartSize * 0.7, hy + heartSize * 0.3, heartSize * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx, hy + heartSize * 0.45);
    ctx.lineTo(hx + heartSize * 0.5, hy + heartSize);
    ctx.lineTo(hx + heartSize, hy + heartSize * 0.45);
    ctx.fill();
  }

  // Shield indicator (bottom-right)
  if (state.shieldCharges > 0) {
    ctx.fillStyle = SHIELD_COLORS.fill;
    ctx.textAlign = 'right';
    ctx.fillText('🛡', w - pad, h - pad - 12);
  }
}

// ─── Banners ─────────────────────────────────────────────────────

export function drawCountdown(ctx, w, h, value) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = value === 'GO!' ? '#44ff66' : '#ffffff';
  ctx.font = `bold ${Math.min(w, h) * 0.2}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, w / 2, h / 2);
}

export function drawBanner(ctx, w, h, text, subtext, color, alpha) {
  if (alpha <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, h * 0.35, w, h * 0.3);
  ctx.fillStyle = color || '#ffffff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h * 0.47);
  if (subtext) {
    ctx.font = '11px monospace';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(subtext, w / 2, h * 0.55);
  }
  ctx.globalAlpha = 1;
}

export function drawResultsOverlay(ctx, w, h, state) {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#ff4466';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('GAME OVER', w / 2, h * 0.25);

  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Score: ${state.score}`, w / 2, h * 0.38);

  ctx.font = '12px monospace';
  ctx.fillStyle = '#cccccc';
  const lines = [
    `Stage ${state.stage}`,
    `Longest Combo: ${state.longestCombo}`,
    `Stomps: ${state.stompsCollected}`,
    `Ghosts Eaten: ${state.ghostsEaten}`,
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, h * 0.48 + i * 18);
  });

  ctx.fillStyle = '#888888';
  ctx.font = '10px monospace';
  ctx.fillText('Tap or press Enter to continue', w / 2, h * 0.82);
}

// ─── Background / Decor ─────────────────────────────────────────

export function drawBackground(ctx, w, h, theme) {
  const colors = WALL_THEMES[theme] || WALL_THEMES.dojo;
  // Dark gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0a14');
  grad.addColorStop(1, '#0d0d1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function drawDecor(ctx, decor, tileSize, animFrame) {
  if (!decor) return;
  for (const d of decor) {
    const dx = d.x * tileSize;
    const dy = d.y * tileSize;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    switch (d.type) {
      case 'lantern': ctx.fillText('🏮', dx, dy); break;
      case 'banner': ctx.fillText('🎌', dx, dy); break;
      case 'pad-silhouette': ctx.fillText('⬆', dx, dy); break;
      case 'snack-stand': ctx.fillText('🍡', dx, dy); break;
      case 'cabinet-trim': ctx.fillText('🕹', dx, dy); break;
      case 'torii': ctx.fillText('⛩', dx, dy); break;
      case 'rank-flash': ctx.fillText('⭐', dx, dy); break;
    }
    ctx.globalAlpha = 1;
  }
}

// ─── Ghost house door ────────────────────────────────────────────

export function drawGhostHouseDoor(ctx, x, y, tileSize, animFrame) {
  ctx.fillStyle = '#554433';
  const dh = tileSize * 0.3;
  ctx.fillRect(x * tileSize, y * tileSize + tileSize - dh, tileSize, dh);
  // Subtle pulsing line
  ctx.strokeStyle = `rgba(255,200,100,${0.3 + Math.sin(animFrame * 0.05) * 0.15})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x * tileSize, y * tileSize + tileSize - dh);
  ctx.lineTo(x * tileSize + tileSize, y * tileSize + tileSize - dh);
  ctx.stroke();
}

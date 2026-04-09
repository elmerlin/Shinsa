import { CHAR_COLORS, drawPet as drawMiniPumpPet } from './miniPumpSprites';
export { CHAR_COLORS };

export const GHOST_COLORS = {
  tempo: { body: '#ee5f7a', dark: '#8e1e34', eye: '#ffffff', pupil: '#1f2f5a', fright: '#335dff', frightBlink: '#ffffff' },
  glint: { body: '#ff97cf', dark: '#a64b7a', eye: '#ffffff', pupil: '#1f2f5a', fright: '#335dff', frightBlink: '#ffffff' },
  drift: { body: '#57d6e8', dark: '#1d8295', eye: '#ffffff', pupil: '#1f2f5a', fright: '#335dff', frightBlink: '#ffffff' },
  ember: { body: '#ffb14b', dark: '#b4661d', eye: '#ffffff', pupil: '#1f2f5a', fright: '#335dff', frightBlink: '#ffffff' },
};
export const GHOST_NAMES = ['tempo', 'glint', 'drift', 'ember'];

export const WALL_THEMES = {
  dojo:   { fill: '#1a2844', border: '#3366aa' },
  snack:  { fill: '#2a1a30', border: '#8855aa' },
  shrine: { fill: '#1a2a1a', border: '#44aa66' },
};

const STOMP_PALETTE = {
  O: '#9b5d09',
  Y: '#ffcc22',
  C: '#ffe97d',
};

const POWER_PALETTE = {
  O: '#89173a',
  P: '#ff4f8f',
  C: '#ffd0e0',
  R: '#ff7aa8',
};

const MINE_PALETTE = {
  S: '#ff5555',
  M: '#676767',
  D: '#323232',
  C: '#111111',
};

const SHIELD_PALETTE = {
  O: '#1a5c7c',
  B: '#4ecbff',
  W: '#d7f7ff',
};

const STOMP_FRAMES = [
  [
    '   OYO   ',
    '  OYYYO  ',
    ' OYYYYYO ',
    'OYYYCYYYO',
    ' OYYYYYO ',
    '  OYYYO  ',
    '   OYO   ',
  ],
  [
    '  O Y O  ',
    ' OYYYYYO ',
    ' OYYYYYO ',
    'OYYYCYYYO',
    ' OYYYYYO ',
    ' OYYYYYO ',
    '  O Y O  ',
  ],
];

const POWER_FRAMES = [
  [
    '   ROR   ',
    '  RPPPR  ',
    ' RPPCPPR ',
    'OPPCCCPPO',
    ' RPPCPPR ',
    '  RPPPR  ',
    '   ROR   ',
  ],
  [
    '  R O R  ',
    ' RPPPPPR ',
    'OPPCCCPPO',
    'RPCCCCCPR',
    'OPPCCCPPO',
    ' RPPPPPR ',
    '  R O R  ',
  ],
];

const MINE_FRAMES = [
  [
    '   S S   ',
    '  SMMMS  ',
    ' SMMCMMS ',
    'SMMCDC MMS'.replace(/ /g, ''),
    ' SMMCMMS ',
    '  SMMMS  ',
    '   S S   ',
  ],
  [
    '    S    ',
    '  SMMS   ',
    ' SMMCMMS ',
    'SMMCDCMM S'.replace(/ /g, ''),
    ' SMMCMMS ',
    '   SMMS  ',
    '    S    ',
  ],
].map((frame) => frame.map((row) => row.padEnd(9, ' ')));

const SHIELD_FRAMES = [
  [
    '   OBO   ',
    '  OBBBO  ',
    ' OBBWBBO ',
    ' OBBW B O'.replace(/ /g, ''),
    '  OBBBO  ',
    '   OBO   ',
  ],
  [
    '   OWO   ',
    '  OBBBO  ',
    ' OBBW B O'.replace(/ /g, ''),
    ' OBBWBBO ',
    '  OBBBO  ',
    '   OWO   ',
  ],
].map((frame) => frame.map((row) => row.padEnd(7, ' ')));

const GHOST_BASE_FRAME_A = [
  '  BBBBBB  ',
  ' BBBBBBBB ',
  'BBBBBBBBBB',
  'BBWWBBWWBB',
  'BBWWBBWWBB',
  'BBBBBBBBBB',
  'BBDDDDDDBB',
  'B B BBB B ',
  'BB  BB  BB',
];

const GHOST_BASE_FRAME_B = [
  '  BBBBBB  ',
  ' BBBBBBBB ',
  'BBBBBBBBBB',
  'BBWWBBWWBB',
  'BBWWBBWWBB',
  'BBBBBBBBBB',
  'BBDDDDDDBB',
  ' BB BBB BB',
  'B  B  B  B',
];

const GHOST_FRIGHT_FRAME_A = [
  '  BBBBBB  ',
  ' BBBBBBBB ',
  'BBBBBBBBBB',
  'BBWWBBWWBB',
  'BBWWBBWWBB',
  'BBBBBBBBBB',
  'BBWWWWWWBB',
  'B B WW B B',
  'BB  WW  BB',
];

const GHOST_FRIGHT_FRAME_B = [
  '  BBBBBB  ',
  ' BBBBBBBB ',
  'BBBBBBBBBB',
  'BBWWBBWWBB',
  'BBWWBBWWBB',
  'BBBBBBBBBB',
  'BBWWWWWWBB',
  ' BB WW BB ',
  'B  W  W  B',
];

const GHOST_EYES_FRAME = [
  ' WW    WW ',
  'WWWW  WWWW',
  ' WWP  PWW ',
  '  WW  WW  ',
];

function px(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), s, s);
}

function drawPixelMap(ctx, cx, cy, ps, map, palette) {
  const rows = map.length;
  const cols = Math.max(...map.map((row) => row.length));
  const ox = Math.round(cx - (cols * ps) / 2);
  const oy = Math.round(cy - (rows * ps) / 2);

  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    const row = map[rowIndex];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const cell = row[colIndex];
      if (cell === ' ') continue;
      const color = palette[cell];
      if (!color) continue;
      px(ctx, ox + colIndex * ps, oy + rowIndex * ps, ps, color);
    }
  }

  return { ox, oy, cols, rows };
}

function getGhostFrame(animFrame) {
  return Math.floor(animFrame / 10) % 2 === 0 ? GHOST_BASE_FRAME_A : GHOST_BASE_FRAME_B;
}

function getFrightFrame(animFrame) {
  return Math.floor(animFrame / 10) % 2 === 0 ? GHOST_FRIGHT_FRAME_A : GHOST_FRIGHT_FRAME_B;
}

function drawGhostPupils(ctx, frameInfo, ps, dir, pupilColor) {
  const xOffset = dir === 'left' ? -ps : dir === 'right' ? ps : 0;
  const yOffset = dir === 'up' ? -ps : dir === 'down' ? ps : 0;
  const leftEyeX = frameInfo.ox + 2 * ps;
  const rightEyeX = frameInfo.ox + 6 * ps;
  const eyeY = frameInfo.oy + 3 * ps;

  px(ctx, leftEyeX + xOffset, eyeY + yOffset, ps, pupilColor);
  px(ctx, rightEyeX + xOffset, eyeY + yOffset, ps, pupilColor);
}

function drawShieldAura(ctx, cx, cy, ps, animFrame) {
  const orbit = Math.floor(animFrame / 8) % 4;
  const sparkPalette = { B: '#5edbff', W: '#d9f9ff' };
  const sparkFrame = [
    ' W ',
    'WBW',
    ' W ',
  ];
  const offsets = [
    { x: 0, y: -9 * ps },
    { x: 9 * ps, y: 0 },
    { x: 0, y: 9 * ps },
    { x: -9 * ps, y: 0 },
  ];

  offsets.forEach((offset, index) => {
    const active = index === orbit || index === (orbit + 2) % offsets.length;
    drawPixelMap(ctx, cx + offset.x, cy + offset.y, ps, sparkFrame, active ? sparkPalette : { B: '#224e61', W: '#5a8294' });
  });
}

export function drawWalls(ctx, grid, tileSize, theme) {
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

      const bw = Math.max(1, tileSize * 0.15);
      ctx.fillStyle = colors.border;
      if (y === 0 || grid[y - 1]?.[x] !== 'wall') ctx.fillRect(px0, py0, tileSize, bw);
      if (y === rows - 1 || grid[y + 1]?.[x] !== 'wall') ctx.fillRect(px0, py0 + tileSize - bw, tileSize, bw);
      if (x === 0 || grid[y][x - 1] !== 'wall') ctx.fillRect(px0, py0, bw, tileSize);
      if (x === cols - 1 || grid[y][x + 1] !== 'wall') ctx.fillRect(px0 + tileSize - bw, py0, bw, tileSize);
    }
  }
}

export function drawStomp(ctx, cx, cy, size, animFrame) {
  const ps = Math.max(1, Math.floor(size / 10));
  const frame = STOMP_FRAMES[Math.floor(animFrame / 8) % STOMP_FRAMES.length];
  drawPixelMap(ctx, cx, cy, ps, frame, STOMP_PALETTE);
}

export function drawPowerStomp(ctx, cx, cy, size, animFrame) {
  const ps = Math.max(1, Math.floor(size / 10));
  const frame = POWER_FRAMES[Math.floor(animFrame / 8) % POWER_FRAMES.length];
  drawPixelMap(ctx, cx, cy, ps, frame, POWER_PALETTE);
}

export function drawMine(ctx, cx, cy, size, animFrame) {
  const ps = Math.max(1, Math.floor(size / 10));
  const frame = MINE_FRAMES[Math.floor(animFrame / 10) % MINE_FRAMES.length];
  drawPixelMap(ctx, cx, cy, ps, frame, MINE_PALETTE);
}

export function drawShieldPickup(ctx, cx, cy, size, animFrame) {
  const ps = Math.max(1, Math.floor(size / 9));
  const frame = SHIELD_FRAMES[Math.floor(animFrame / 10) % SHIELD_FRAMES.length];
  drawPixelMap(ctx, cx, cy, ps, frame, SHIELD_PALETTE);
}

export function drawGhost(ctx, cx, cy, size, ghostName, state, dir, animFrame) {
  const colors = GHOST_COLORS[ghostName] || GHOST_COLORS.tempo;
  const ps = Math.max(1, Math.floor(size / 12));

  if (state === 'returning') {
    drawPixelMap(ctx, cx, cy, ps, GHOST_EYES_FRAME, {
      W: '#ffffff',
      P: colors.pupil,
    });
    return;
  }

  const frightened = state === 'frightened';
  const blink = frightened && Math.floor(animFrame / 12) % 2 === 1;
  const palette = {
    B: frightened ? (blink ? colors.frightBlink : colors.fright) : colors.body,
    D: frightened ? '#1834a8' : colors.dark,
    W: '#ffffff',
  };

  const frame = frightened ? getFrightFrame(animFrame) : getGhostFrame(animFrame);
  const frameInfo = drawPixelMap(ctx, cx, cy, ps, frame, palette);

  if (!frightened) {
    drawGhostPupils(ctx, frameInfo, ps, dir, colors.pupil);
  }
}

export function drawPlayerPet(ctx, cx, cy, size, character, dir, animFrame, invuln, shieldActive, reducedMotion) {
  if (invuln && !reducedMotion && Math.floor(animFrame / 4) % 2 === 0) return;

  const ps = Math.max(1, Math.round(size / 22));
  const stepFrame = Math.floor(animFrame / 6) % 2 === 0;
  const pose = reducedMotion
    ? 'ready'
    : dir === 'left'
      ? (stepFrame ? 'step_red' : 'ready')
      : dir === 'right'
        ? (stepFrame ? 'step_blue' : 'ready')
        : (stepFrame ? 'step_yellow' : 'ready');

  if (shieldActive) {
    drawShieldAura(ctx, cx, cy - 2 * ps, ps, animFrame);
  }

  drawMiniPumpPet(
    ctx,
    cx,
    cy + 2 * ps,
    ps,
    character,
    pose,
    dir === 'up' ? 'focused' : 'normal',
  );

  const accentColor = (CHAR_COLORS[character] || CHAR_COLORS.dojocat).accent || '#f6a3ae';
  const facingMarker = {
    up: { x: 0, y: -9 * ps },
    down: { x: 0, y: 8 * ps },
    left: { x: -10 * ps, y: 0 },
    right: { x: 10 * ps, y: 0 },
  }[dir] || { x: 0, y: 0 };
  drawPixelMap(ctx, cx + facingMarker.x, cy + facingMarker.y, ps, [' A ', 'AAA', ' A '], { A: accentColor });
}

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

export function drawHUD(ctx, w, h, state) {
  const pad = 6;
  ctx.font = 'bold 11px monospace';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${state.score}`, pad, pad);

  ctx.textAlign = 'center';
  ctx.fillText(`STAGE ${state.stage}`, w / 2, pad);

  ctx.textAlign = 'right';
  if (state.combo > 0) {
    ctx.fillStyle = '#ffcc22';
    ctx.fillText(`COMBO ×${state.combo}`, w - pad, pad);
  }

  const heartPalette = { R: '#ff4f6c', H: '#ff90aa' };
  for (let i = 0; i < state.lives; i++) {
    drawPixelMap(ctx, pad + 7 + i * 14, h - 11, 2, [
      ' RR RR ',
      'RRRRRRR',
      'RRRRRRR',
      ' RRRRR ',
      '  RRR  ',
      '   R   ',
    ], heartPalette);
  }

  if (state.shieldCharges > 0) {
    drawPixelMap(ctx, w - 18, h - 14, 2, SHIELD_FRAMES[0], SHIELD_PALETTE);
  }
}

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
  lines.forEach((line, index) => {
    ctx.fillText(line, w / 2, h * 0.48 + index * 18);
  });

  ctx.fillStyle = '#888888';
  ctx.font = '10px monospace';
  ctx.fillText('Tap or press Enter to continue', w / 2, h * 0.82);
}

export function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0a14');
  grad.addColorStop(1, '#0d0d1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function drawDecor(ctx, decor, tileSize) {
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

export function drawGhostHouseDoor(ctx, x, y, tileSize, animFrame) {
  ctx.fillStyle = '#554433';
  const dh = tileSize * 0.3;
  ctx.fillRect(x * tileSize, y * tileSize + tileSize - dh, tileSize, dh);
  ctx.strokeStyle = `rgba(255,200,100,${0.3 + Math.sin(animFrame * 0.05) * 0.15})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x * tileSize, y * tileSize + tileSize - dh);
  ctx.lineTo(x * tileSize + tileSize, y * tileSize + tileSize - dh);
  ctx.stroke();
}

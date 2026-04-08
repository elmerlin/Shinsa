import React, { useMemo } from 'react';

/**
 * CSS Pixel Art Pet Renderer — box-shadow technique
 *
 * Each character is drawn on a pixel grid using drawing primitives,
 * then rendered via a single div whose box-shadow paints every pixel.
 * `font-size` in em units controls pixel scale → perfect crisp scaling.
 *
 * Body parts are separate layers for independent animation:
 *   - Base layer (body + head + legs)
 *   - Arms layer (for wave/idle animation)
 *   - Face layer (swappable per expression)
 *   - Feature layer (ears, horns, antenna, etc.)
 *   - Clothing layers (hat, top, belt, shoes)
 *   - Tail layer (devit)
 */

// ═══════════════════════════════════════════════════════════════
// 1. GRID DRAWING PRIMITIVES
// ═══════════════════════════════════════════════════════════════

function createGrid(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(null));
}

function setPixel(g, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
}

function fillRect(g, x0, y0, w, h, c) {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(g.length, Math.round(y0 + h)); y++)
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(g[0].length, Math.round(x0 + w)); x++)
      g[y][x] = c;
}

function fillEllipse(g, cx, cy, rx, ry, c) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(g.length - 1, Math.ceil(cy + ry)); y++)
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(g[0].length - 1, Math.ceil(cx + rx)); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) g[y][x] = c;
    }
}

function fillCircle(g, cx, cy, r, c) { fillEllipse(g, cx, cy, r, r, c); }

function fillTriangle(g, x1, y1, x2, y2, x3, y3, c) {
  const minY = Math.max(0, Math.floor(Math.min(y1, y2, y3)));
  const maxY = Math.min(g.length - 1, Math.ceil(Math.max(y1, y2, y3)));
  for (let y = minY; y <= maxY; y++) {
    const edges = [[x1,y1,x2,y2],[x2,y2,x3,y3],[x3,y3,x1,y1]];
    const xs = [];
    for (const [ax,ay,bx,by] of edges) {
      if ((ay <= y && by >= y) || (by <= y && ay >= y)) {
        if (ay === by) continue;
        xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
      }
    }
    if (xs.length >= 2) {
      xs.sort((a, b) => a - b);
      for (let x = Math.max(0, Math.round(xs[0])); x <= Math.min(g[0].length - 1, Math.round(xs[xs.length - 1])); x++)
        g[y][x] = c;
    }
  }
}

function fillLine(g, x1, y1, x2, y2, c) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  if (steps === 0) { setPixel(g, x1, y1, c); return; }
  for (let i = 0; i <= steps; i++) {
    setPixel(g, x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps, c);
  }
}

function cloneGrid(g) {
  return g.map((row) => [...row]);
}

function outlineGrid(g, outlineKey = 'K') {
  const outlined = cloneGrid(g);
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      if (!g[y][x]) continue;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (ny < 0 || ny >= g.length || nx < 0 || nx >= g[0].length) continue;
          if (!g[ny][nx] && !outlined[ny][nx]) {
            outlined[ny][nx] = outlineKey;
          }
        }
      }
    }
  }
  return outlined;
}

function shiftGrid(g, dx, dy) {
  if (!dx && !dy) return g;
  const shifted = createGrid(g[0].length, g.length);
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      if (g[y][x]) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny >= 0 && ny < g.length && nx >= 0 && nx < g[0].length) {
          shifted[ny][nx] = g[y][x];
        }
      }
    }
  }
  return shifted;
}

// Convert grid to box-shadow CSS string
function gridToShadow(grid, colorMap) {
  const shadows = [];
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[0].length; x++) {
      const k = grid[y][x];
      if (k && colorMap[k]) shadows.push(`${x}em ${y}em 0 ${colorMap[k]}`);
    }
  return shadows.join(',');
}

// ═══════════════════════════════════════════════════════════════
// 2. COLOR PALETTES
// ═══════════════════════════════════════════════════════════════

const PALETTES = {
  dojocat: {
    B: '#dfae6f',  // body tan
    D: '#b77739',  // dark shade
    L: '#f6d7aa',  // light
    Y: '#fff2df',  // belly
    E: '#2d2d2d',  // eyes
    W: '#ffffff',  // white
    N: '#b4544a',  // nose pink-red
    H: '#f6a3ae',  // blush
    P: '#efcab4',  // ear inner
    K: '#151515',  // outline
    T: '#c68a4c',  // tail dark
    S: '#f6e7cf',  // skin lighter
    R: '#74431d',  // whisker mark
  },
  buu: {
    B: '#f0b8c8',  // body peach/pink skin
    D: '#d98ea7',  // dark shade
    L: '#ffdbe7',  // light
    Y: '#f7d1de',  // belly
    E: '#2d2d2d',  // eyes
    W: '#ffffff',  // white
    N: '#a55f6c',  // nose/mouth
    H: '#f48fb1',  // blush pink
    P: '#efb2c5',  // antenna
    K: '#1a1a1a',  // outline
    T: '#d4978a',  // unused
    S: '#fff0f5',  // highlight
    R: '#f5c9d7',  // cheek
  },
  devit: {
    B: '#faf9f2',  // body white
    D: '#dfddd2',  // dark shade
    L: '#ffffff',  // light
    Y: '#fefcf8',  // belly
    E: '#e53935',  // eyes RED
    W: '#ffffff',  // white highlight
    N: '#ffb2b7',  // nose light pink
    H: '#ffcdd2',  // blush
    P: '#c43d34',  // horns RED
    K: '#202020',  // outline
    T: '#e53935',  // tail red
    S: '#ffdce5',  // accent / tears
    R: '#e0e0e0',  // shadow
  },
  pixiu: {
    B: '#fff2f7',  // body pink-cream
    D: '#efc0cf',  // dark pink shade
    L: '#ffffff',  // light
    Y: '#fff8fb',  // belly white
    E: '#6d4c41',  // eyes brown
    W: '#ffffff',  // white
    N: '#d76f79',  // nose peach
    H: '#f4adc4',  // blush
    P: '#ee81b0',  // mane pink
    K: '#40262f',  // outline
    T: '#e3b04d',  // horn gold
    S: '#f8d98c',  // wing gold
    R: '#f3a0c5',  // ornament pink
  },
};

// ═══════════════════════════════════════════════════════════════
// 3. BODY DIMENSIONS PER WEIGHT STATE
// ═══════════════════════════════════════════════════════════════

const WEIGHT_DIMS = {
  starving: { bodyRx: 10, bodyRy: 6,  limbW: 2, armLen: 3, legH: 6, bellyDroop: 0 },
  thin:     { bodyRx: 12, bodyRy: 7,  limbW: 2, armLen: 4, legH: 6, bellyDroop: 0 },
  normal:   { bodyRx: 14, bodyRy: 9,  limbW: 3, armLen: 5, legH: 6, bellyDroop: 0 },
  chubby:   { bodyRx: 17, bodyRy: 11, limbW: 3, armLen: 6, legH: 5, bellyDroop: 2 },
  fat:      { bodyRx: 20, bodyRy: 13, limbW: 4, armLen: 6, legH: 4, bellyDroop: 4 },
};

// Grid size constants
const GW = 60;      // grid width
const GH = 74;      // grid height
const CX = 30;      // center x
const HEAD_CY = 19; // head center y
const HEAD_R = 16;  // head radius
const HEAD_RX = 19;
const HEAD_RY = 13;

function getBodyMetrics(weightState) {
  const w = WEIGHT_DIMS[weightState] || WEIGHT_DIMS.normal;
  const bodyCy = HEAD_CY + HEAD_RY + Math.floor(w.bodyRy * 0.94) + 3;
  const legHeight = w.legH || Math.max(5, Math.min(7, Math.floor(w.bodyRy * 0.68)));
  const legSpread = Math.max(2, Math.floor(w.bodyRx * 0.45));
  const legTop = bodyCy + w.bodyRy - 1 + (w.bellyDroop || 0);
  return { w, bodyCy, legHeight, legSpread, legTop };
}


// ═══════════════════════════════════════════════════════════════
// 4. CHARACTER BODY BUILDERS
// ═══════════════════════════════════════════════════════════════

function buildBase(character, weightState, pose = 'rest') {
  const g = createGrid(GW, GH);
  const { w, bodyCy, legHeight, legSpread, legTop } = getBodyMetrics(weightState);

  // === Body drawn FIRST (behind head) ===
  fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, 'B');
  fillEllipse(g, CX - 1, bodyCy - 2, Math.max(8, w.bodyRx - 2), Math.max(5, w.bodyRy - 2), 'L');

  // Belly patch
  fillEllipse(g, CX, bodyCy + 2, Math.max(4, Math.floor(w.bodyRx * 0.5)), Math.max(3, Math.floor(w.bodyRy * 0.46)), 'Y');

  // Belly droop for chubby/fat
  if (w.bellyDroop > 0) {
    fillEllipse(g, CX, bodyCy + w.bodyRy - 1, Math.floor(w.bodyRx * 0.65), w.bellyDroop + 2, 'B');
    fillEllipse(g, CX, bodyCy + w.bodyRy, Math.floor(w.bodyRx * 0.4), w.bellyDroop + 1, 'Y');
  }

  // Ribs for starving
  if (weightState === 'starving') {
    for (let ry = -2; ry <= 2; ry += 2) {
      setPixel(g, CX - w.bodyRx + 1, bodyCy + ry, 'K');
      setPixel(g, CX + w.bodyRx - 1, bodyCy + ry, 'K');
    }
  }

  // ── Legs — pose-dependent ──
  const footW = w.limbW + 2 + (w.bellyDroop > 2 ? 1 : 0);

  if (pose === 'waddle_l') {
    // Left foot lifted (waddle frame 1) — duck walk
    fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, legHeight - 2, 'D');
    // Left foot raised
    fillRect(g, CX - legSpread - w.limbW - 1, legTop + legHeight - 3, footW, 2, 'D');
    // Right foot planted
    fillRect(g, CX + legSpread, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX + legSpread - 1, legTop + legHeight - 1, footW, 2, 'D');
  } else if (pose === 'waddle_r') {
    // Right foot lifted (waddle frame 2)
    fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX - legSpread - w.limbW - 1, legTop + legHeight - 1, footW, 2, 'D');
    // Right foot raised
    fillRect(g, CX + legSpread, legTop, w.limbW, legHeight - 2, 'D');
    fillRect(g, CX + legSpread - 1, legTop + legHeight - 3, footW, 2, 'D');
  } else if (pose === 'stomp') {
    // Right foot raised high, about to stomp
    fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX - legSpread - w.limbW - 1, legTop + legHeight - 1, footW, 2, 'D');
    // Right leg raised high
    fillRect(g, CX + legSpread, legTop - 2, w.limbW, legHeight - 3, 'D');
    fillRect(g, CX + legSpread - 1, legTop - 2, footW, 2, 'D');
  } else if (pose === 'kick') {
    // Left leg normal, right leg raised outward
    fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX - legSpread - w.limbW - 1, legTop + legHeight - 1, footW, 2, 'D');
    // Right leg — horizontal kick
    fillRect(g, CX + legSpread, legTop + 1, legHeight - 1, w.limbW, 'D');
    fillRect(g, CX + legSpread + legHeight - 2, legTop, footW - 1, 2, 'D');
  } else if (pose === 'crane') {
    // Left leg normal, right leg tucked up
    fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX - legSpread - w.limbW - 1, legTop + legHeight - 1, footW, 2, 'D');
    // Right leg — tucked (half height, no foot visible)
    fillRect(g, CX + legSpread, legTop, w.limbW, Math.max(2, legHeight - 3), 'D');
  } else if (pose === 'lunge') {
    // Both legs wide stance
    fillRect(g, CX - legSpread - w.limbW - 1, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX - legSpread - w.limbW - 3, legTop + legHeight - 1, footW, 2, 'D');
    fillRect(g, CX + legSpread + 2, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX + legSpread + 1, legTop + legHeight - 1, footW, 2, 'D');
  } else {
    // Default legs
    fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX + legSpread, legTop, w.limbW, legHeight, 'D');
    fillRect(g, CX - legSpread - w.limbW - 1, legTop + legHeight - 1, footW, 2, 'D');
    fillRect(g, CX + legSpread - 1, legTop + legHeight - 1, footW, 2, 'D');
  }

  // Short visible neck
  if (character !== 'buu') {
    const neckTop = bodyCy - w.bodyRy;
    fillRect(g, CX - 5, neckTop - 2, 11, 3, 'B');
    fillRect(g, CX - 3, neckTop - 1, 7, 2, 'D');
  }

  return g;
}

// Head as a separate layer — rendered ABOVE clothing
function buildHead(character) {
  const g = createGrid(GW, GH);

  if (character === 'buu') {
    // Pear-shaped head — narrow forehead, wide droopy cheeks, uniform color
    fillEllipse(g, CX, HEAD_CY + 4, HEAD_RX + 3, HEAD_RY - 1, 'B');
    fillEllipse(g, CX, HEAD_CY, HEAD_RX - 1, HEAD_RY, 'B');
    fillEllipse(g, CX, HEAD_CY - 3, HEAD_RX - 5, HEAD_RY - 4, 'B');
  } else {
    fillEllipse(g, CX, HEAD_CY, HEAD_RX, HEAD_RY, 'B');
    fillEllipse(g, CX - 3, HEAD_CY - 4, HEAD_RX - 6, HEAD_RY - 6, 'L');
    fillEllipse(g, CX + 3, HEAD_CY + 5, HEAD_RX - 10, HEAD_RY - 9, 'S');
    // Centered muzzle mask for cat-like characters
    if (character === 'dojocat' || character === 'pixiu') {
      fillEllipse(g, CX, HEAD_CY + 4, 7, 5, 'Y');
    }
  }

  return g;
}

function buildArms(character, weightState, pose = 'rest') {
  const g = createGrid(GW, GH);
  const { w, bodyCy } = getBodyMetrics(weightState);
  const armY = bodyCy + Math.floor(w.bodyRy * 0.1);
  const lx = CX - w.bodyRx - 1;    // left arm x
  const rx = CX + w.bodyRx + 1;    // right arm x

  if (pose === 'guard') {
    // Arms raised, bent inward — fighting guard
    fillEllipse(g, lx + 2, armY - 3, 2, w.armLen - 1, 'B');
    fillEllipse(g, rx - 2, armY - 3, 2, w.armLen - 1, 'B');
    setPixel(g, lx + 2, armY - 3 - w.armLen + 1, 'D');
    setPixel(g, rx - 2, armY - 3 - w.armLen + 1, 'D');
  } else if (pose === 'punch') {
    // Left arm guard, right arm extended outward (horizontal)
    fillEllipse(g, lx + 1, armY - 2, 2, w.armLen - 1, 'B');
    setPixel(g, lx + 1, armY - 2 - w.armLen + 1, 'D');
    // Right arm horizontal punch
    fillEllipse(g, rx + 3, armY - 2, w.armLen + 1, 2, 'B');
    setPixel(g, rx + w.armLen + 3, armY - 2, 'D');
    setPixel(g, rx + w.armLen + 4, armY - 2, 'D');
  } else if (pose === 'wave') {
    // Left arm at side, right arm raised high (waving)
    fillEllipse(g, lx, armY, 2, w.armLen, 'B');
    setPixel(g, lx, armY + w.armLen, 'D');
    // Right arm up and slightly out
    fillEllipse(g, rx + 1, armY - w.armLen - 1, 2, w.armLen, 'B');
    setPixel(g, rx + 1, armY - w.armLen * 2 - 1, 'D');
  } else if (pose === 'flex') {
    // Both arms raised and bent — flexing/showing muscles
    fillEllipse(g, lx - 1, armY - 4, 3, w.armLen - 1, 'B');
    fillEllipse(g, rx + 1, armY - 4, 3, w.armLen - 1, 'B');
    setPixel(g, lx - 1, armY - 4 - w.armLen + 1, 'D');
    setPixel(g, rx + 1, armY - 4 - w.armLen + 1, 'D');
  } else if (pose === 'crane') {
    // Arms spread wide horizontally — crane stance
    fillEllipse(g, lx - 3, armY - 1, w.armLen, 2, 'B');
    fillEllipse(g, rx + 3, armY - 1, w.armLen, 2, 'B');
    setPixel(g, lx - w.armLen - 3, armY - 1, 'D');
    setPixel(g, rx + w.armLen + 3, armY - 1, 'D');
  } else if (pose === 'kick') {
    // Arms back for balance during kick
    fillEllipse(g, lx - 1, armY - 1, 2, w.armLen, 'B');
    fillEllipse(g, rx + 1, armY + 1, 2, w.armLen - 1, 'B');
    setPixel(g, lx - 1, armY - 1 + w.armLen, 'D');
    setPixel(g, rx + 1, armY + w.armLen, 'D');
  } else if (pose === 'lunge') {
    // One arm forward, one back — lunge/reach
    fillEllipse(g, lx - 1, armY + 1, 2, w.armLen, 'B');
    setPixel(g, lx - 1, armY + 1 + w.armLen, 'D');
    fillEllipse(g, rx + 2, armY - 3, w.armLen, 2, 'B');
    setPixel(g, rx + w.armLen + 2, armY - 3, 'D');
  } else if (pose === 'bless') {
    // Both arms raised — blessing/ceremony
    fillEllipse(g, lx, armY - w.armLen, 2, w.armLen, 'B');
    fillEllipse(g, rx, armY - w.armLen, 2, w.armLen, 'B');
    setPixel(g, lx, armY - w.armLen * 2, 'D');
    setPixel(g, rx, armY - w.armLen * 2, 'D');
  } else if (pose === 'punch_forward') {
    // Both fists punching toward viewer — foreshortened arms with prominent fists
    // Short arm stubs angled inward
    fillEllipse(g, CX - 5, armY - 1, 3, 2, 'B');
    fillEllipse(g, CX + 5, armY - 1, 3, 2, 'B');
    // Fists — larger circles representing foreshortened punch
    fillCircle(g, CX - 5, armY - 1, 3, 'D');
    fillCircle(g, CX + 5, armY - 1, 3, 'D');
    // Highlight on fists
    setPixel(g, CX - 6, armY - 2, 'L');
    setPixel(g, CX + 4, armY - 2, 'L');
  } else if (pose === 'stomp') {
    // Arms raised for stomp emphasis
    fillEllipse(g, lx - 1, armY - 4, 2, w.armLen, 'B');
    fillEllipse(g, rx + 1, armY - 4, 2, w.armLen, 'B');
    setPixel(g, lx - 1, armY - 4 - w.armLen, 'D');
    setPixel(g, rx + 1, armY - 4 - w.armLen, 'D');
  } else {
    // Default: arms at sides
    fillEllipse(g, lx, armY, 2, w.armLen, 'B');
    fillEllipse(g, rx, armY, 2, w.armLen, 'B');
    setPixel(g, lx, armY + w.armLen, 'D');
    setPixel(g, rx, armY + w.armLen, 'D');
  }

  return g;
}

function buildFeatures(character, featureFrame = 0) {
  const g = createGrid(GW, GH);
  const hcy = HEAD_CY;

  switch (character) {
    case 'dojocat': {
      // Pointy ears at top of head
      fillTriangle(g, CX - 11, hcy - 2, CX - 17, hcy - HEAD_RY - 2, CX - 6, hcy - HEAD_RY + 3, 'B');
      fillTriangle(g, CX + 11, hcy - 2, CX + 17, hcy - HEAD_RY - 2, CX + 6, hcy - HEAD_RY + 3, 'B');
      // Inner ear pink
      fillTriangle(g, CX - 10, hcy - 3, CX - 14, hcy - HEAD_RY, CX - 7, hcy - HEAD_RY + 4, 'P');
      fillTriangle(g, CX + 10, hcy - 3, CX + 14, hcy - HEAD_RY, CX + 7, hcy - HEAD_RY + 4, 'P');
      // Whisker lines from cheeks (not triangles)
      fillLine(g, CX - 8, hcy + 6, CX - 19, hcy + 4, 'R');
      fillLine(g, CX - 8, hcy + 8, CX - 19, hcy + 8, 'R');
      fillLine(g, CX + 8, hcy + 6, CX + 19, hcy + 4, 'R');
      fillLine(g, CX + 8, hcy + 8, CX + 19, hcy + 8, 'R');
      break;
    }
    case 'buu': {
      // Animated head tentacle — sways based on featureFrame
      const sway = featureFrame % 3; // 0, 1, 2
      const tipDx = sway === 0 ? 0 : sway === 1 ? 2 : -2;
      const tipDy = sway === 0 ? 0 : sway === 1 ? -1 : 1;
      // Wide base emerging from top of head (stays fixed)
      fillEllipse(g, CX + 2, hcy - HEAD_RY + 5, 5, 4, 'P');
      // Thick curved body — 7 parallel lines for real width
      for (let t = -3; t <= 3; t++) {
        // Rise up from head
        fillLine(g, CX + 2 + t, hcy - HEAD_RY + 2, CX + 8 + t, hcy - HEAD_RY - 2, 'P');
        // Curve over to the right — tip sways
        fillLine(g, CX + 8 + t, hcy - HEAD_RY - 2, CX + 12 + Math.min(t, 1) + tipDx, hcy - HEAD_RY + 1 + tipDy, 'P');
        // Droop down slightly at the end — sway continues
        fillLine(g, CX + 12 + Math.min(t, 1) + tipDx, hcy - HEAD_RY + 1 + tipDy, CX + 14 + Math.min(t, 0) + tipDx, hcy - HEAD_RY + 4 + tipDy, 'P');
      }
      // Bulbous tip — sways with tentacle
      fillCircle(g, CX + 14 + tipDx, hcy - HEAD_RY + 5 + tipDy, 3, 'P');
      fillCircle(g, CX + 13 + tipDx, hcy - HEAD_RY + 4 + tipDy, 2, 'P');
      // (blush drawn on face layer to avoid dark outline)
      break;
    }
    case 'devit': {
      fillTriangle(g, CX - 9, hcy - 4, CX - 12, hcy - HEAD_RY - 5, CX - 6, hcy - HEAD_RY, 'P');
      fillTriangle(g, CX + 9, hcy - 4, CX + 12, hcy - HEAD_RY - 5, CX + 6, hcy - HEAD_RY, 'P');
      fillRect(g, CX - 10, hcy + 7, 3, 2, 'H');
      fillRect(g, CX + 7, hcy + 7, 3, 2, 'H');
      break;
    }
    case 'pixiu': {
      // Pointy ears
      fillTriangle(g, CX - 10, hcy - 3, CX - 15, hcy - HEAD_RY - 2, CX - 6, hcy - HEAD_RY + 2, 'B');
      fillTriangle(g, CX + 10, hcy - 3, CX + 15, hcy - HEAD_RY - 2, CX + 6, hcy - HEAD_RY + 2, 'B');
      // Inner ear
      fillTriangle(g, CX - 8, hcy - 4, CX - 11, hcy - HEAD_RY + 1, CX - 5, hcy - HEAD_RY + 4, 'R');
      fillTriangle(g, CX + 8, hcy - 4, CX + 11, hcy - HEAD_RY + 1, CX + 5, hcy - HEAD_RY + 4, 'R');
      // Small blush
      fillRect(g, CX - 9, hcy + 6, 2, 1, 'H');
      fillRect(g, CX + 7, hcy + 6, 2, 1, 'H');
      break;
    }
    default: break;
  }
  return g;
}

function buildTail(character, weightState, tailFrame = 0) {
  const g = createGrid(GW, GH);
  const { w, bodyCy } = getBodyMetrics(weightState);
  // Tail starts at body edge — firmly attached
  const tx = CX + w.bodyRx - 2;

  if (character === 'devit') {
    // Devil tail — short zigzag with pointy tip
    const flip = tailFrame % 2 === 0 ? -1 : 1;
    fillLine(g, tx, bodyCy + 1, tx + 2, bodyCy + flip, 'T');
    fillLine(g, tx + 2, bodyCy + flip, tx + 4, bodyCy - flip, 'T');
    // Pointy tip
    setPixel(g, tx + 4, bodyCy - flip, 'T');
    setPixel(g, tx + 5, bodyCy - flip, 'T');
  } else if (character === 'dojocat') {
    // Cat tail — short, curved, attached to body
    const flip = tailFrame % 2 === 0 ? 0 : 2;
    // Base connects to body
    setPixel(g, tx, bodyCy, 'B');
    setPixel(g, tx + 1, bodyCy, 'B');
    fillLine(g, tx + 1, bodyCy, tx + 3, bodyCy - 2 + flip, 'B');
    setPixel(g, tx + 3, bodyCy - 3 + flip, 'D');
  } else if (character === 'pixiu') {
    // Fluffy ceremonial tail — short, poofy, attached
    const flip = tailFrame % 2 === 0 ? 0 : 1;
    // Base connected to body
    setPixel(g, tx, bodyCy, 'D');
    setPixel(g, tx + 1, bodyCy - 1, 'D');
    // Poof — small, close to body
    fillCircle(g, tx + 2, bodyCy - 2 + flip, 2, 'P');
    setPixel(g, tx + 3, bodyCy - 3 + flip, 'D');
  }
  return g;
}


// ═══════════════════════════════════════════════════════════════
// 5. FACE / EXPRESSION BUILDERS
// ═══════════════════════════════════════════════════════════════

function drawSmile(g, y, width = 2, color = 'K') {
  setPixel(g, CX - width, y, color);
  setPixel(g, CX - 2, y + 1, color);
  setPixel(g, CX - 1, y + 2, color);
  setPixel(g, CX, y + 2, color);
  setPixel(g, CX + 1, y + 2, color);
  setPixel(g, CX + 2, y + 1, color);
  setPixel(g, CX + width, y, color);
}

function drawCatNose(g, y, color = 'N') {
  setPixel(g, CX, y, color);
  setPixel(g, CX - 1, y + 1, color);
  setPixel(g, CX, y + 1, color);
  setPixel(g, CX + 1, y + 1, color);
  setPixel(g, CX, y + 2, 'K');
}

function drawCatMouth(g, y, mood = 'neutral') {
  setPixel(g, CX - 1, y + 2, 'K');
  setPixel(g, CX + 1, y + 2, 'K');
  if (mood === 'smile') {
    setPixel(g, CX - 2, y + 3, 'K');
    setPixel(g, CX + 2, y + 3, 'K');
  } else if (mood === 'frown') {
    setPixel(g, CX - 2, y + 1, 'K');
    setPixel(g, CX + 2, y + 1, 'K');
  } else {
    setPixel(g, CX - 2, y + 2, 'K');
    setPixel(g, CX + 2, y + 2, 'K');
  }
}

function drawTinySmile(g, y) {
  setPixel(g, CX - 2, y, 'K');
  setPixel(g, CX - 1, y + 1, 'K');
  setPixel(g, CX, y + 1, 'K');
  setPixel(g, CX + 1, y + 1, 'K');
  setPixel(g, CX + 2, y, 'K');
}

function drawPout(g, y, color = 'N') {
  fillRect(g, CX - 1, y, 3, 2, color);
  setPixel(g, CX - 1, y - 1, 'K');
  setPixel(g, CX + 1, y - 1, 'K');
}

function drawOpenMouth(g, y, accent = 'N') {
  fillRect(g, CX - 2, y, 5, 3, accent);
  setPixel(g, CX - 2, y, 'K');
  setPixel(g, CX + 2, y, 'K');
  setPixel(g, CX, y + 1, 'W');
}

function buildFace(character, mood, expression = '') {
  const g = createGrid(GW, GH);
  const hcy = HEAD_CY;
  const eyeColor = 'E';
  const leftEyeX = CX - 8;
  const rightEyeX = CX + 7;
  const eyeTop = hcy - 1;
  const browTop = hcy - 6;
  const noseY = hcy + 5;
  const mouthY = hcy + 8;

  if (expression === 'wink') {
    fillRect(g, leftEyeX - 2, hcy + 1, 5, 1, eyeColor);
    fillRect(g, rightEyeX - 1, eyeTop, 3, 6, eyeColor);
    setPixel(g, rightEyeX, eyeTop + 1, 'W');
    setPixel(g, rightEyeX, eyeTop + 3, 'W');
    if (character === 'dojocat' || character === 'pixiu') {
      drawCatNose(g, noseY);
      drawCatMouth(g, noseY, 'smile');
    } else {
      drawTinySmile(g, mouthY + 1);
    }
    return g;
  }

  if (expression === 'smirk' || expression === 'proud') {
    fillRect(g, leftEyeX - 2, hcy + 1, 5, 1, eyeColor);
    fillRect(g, rightEyeX - 2, hcy, 5, 1, eyeColor);
    fillLine(g, leftEyeX - 3, browTop + 1, leftEyeX + 1, browTop + 2, 'K');
    fillLine(g, rightEyeX + 2, browTop + 1, rightEyeX - 2, browTop + 2, 'K');
    if (character === 'dojocat' || character === 'pixiu') {
      drawCatNose(g, noseY);
      drawCatMouth(g, noseY, 'smile');
      setPixel(g, CX + 3, mouthY + 1, 'K');
    } else {
      drawTinySmile(g, mouthY);
      setPixel(g, CX + 3, mouthY - 1, 'K');
    }
    return g;
  }

  if (expression === 'excited' || expression === 'sparkle') {
    fillRect(g, leftEyeX - 1, eyeTop - 1, 3, 7, eyeColor);
    fillRect(g, rightEyeX - 1, eyeTop - 1, 3, 7, eyeColor);
    setPixel(g, leftEyeX, eyeTop, 'W');
    setPixel(g, rightEyeX, eyeTop, 'W');
    setPixel(g, leftEyeX + 1, eyeTop + 4, 'W');
    setPixel(g, rightEyeX + 1, eyeTop + 4, 'W');
    if (character === 'dojocat' || character === 'pixiu') {
      drawCatNose(g, noseY);
      drawOpenMouth(g, mouthY + 1, 'N');
    } else {
      drawOpenMouth(g, mouthY + 1, character === 'devit' ? 'H' : 'N');
    }
    return g;
  }

  if (expression === 'soft') {
    fillRect(g, leftEyeX - 1, hcy + 2, 4, 1, eyeColor);
    fillRect(g, rightEyeX - 2, hcy + 2, 4, 1, eyeColor);
    if (character === 'dojocat' || character === 'pixiu') {
      drawCatNose(g, noseY);
      drawCatMouth(g, noseY, 'smile');
    } else {
      drawTinySmile(g, mouthY + 1);
    }
    return g;
  }

  if (expression === 'grin') {
    fillRect(g, leftEyeX - 1, eyeTop, 3, 6, eyeColor);
    fillRect(g, rightEyeX - 1, eyeTop, 3, 6, eyeColor);
    setPixel(g, leftEyeX, eyeTop, 'W');
    setPixel(g, rightEyeX, eyeTop, 'W');
    drawOpenMouth(g, mouthY, 'W');
    return g;
  }

  if (expression === 'eating') {
    fillRect(g, leftEyeX - 1, hcy + 2, 4, 1, eyeColor);
    fillRect(g, rightEyeX - 2, hcy + 2, 4, 1, eyeColor);
    if (character === 'dojocat' || character === 'pixiu') {
      drawCatNose(g, noseY);
    }
    drawPout(g, mouthY + 1, 'N');
    return g;
  }

  switch (mood) {
    case 'desperate': {
      fillRect(g, leftEyeX - 1, eyeTop - 1, 3, 6, eyeColor);
      fillRect(g, rightEyeX - 1, eyeTop - 1, 3, 6, eyeColor);
      setPixel(g, leftEyeX, eyeTop, 'W');
      setPixel(g, rightEyeX, eyeTop, 'W');
      setPixel(g, CX - 5, hcy + 4, 'S');
      setPixel(g, CX + 5, hcy + 4, 'S');
      if (character !== 'devit') {
        setPixel(g, CX - 5, hcy + 5, 'S');
        setPixel(g, CX + 5, hcy + 5, 'S');
      }
      if (character === 'dojocat' || character === 'pixiu') {
        drawCatNose(g, noseY);
        drawCatMouth(g, noseY, 'frown');
      } else {
        setPixel(g, CX - 2, mouthY + 1, 'K');
        setPixel(g, CX, mouthY, 'K');
        setPixel(g, CX + 2, mouthY + 1, 'K');
      }
      break;
    }
    case 'hungry': {
      fillRect(g, leftEyeX - 1, hcy + 1, 3, 4, eyeColor);
      fillRect(g, rightEyeX - 1, hcy + 1, 3, 4, eyeColor);
      setPixel(g, leftEyeX, hcy + 1, 'W');
      setPixel(g, rightEyeX, hcy + 1, 'W');
      fillLine(g, leftEyeX - 2, browTop + 2, leftEyeX + 1, browTop, 'K');
      fillLine(g, rightEyeX + 2, browTop + 2, rightEyeX - 1, browTop, 'K');
      if (character === 'dojocat' || character === 'pixiu') {
        drawCatNose(g, noseY);
      }
      drawPout(g, mouthY, 'N');
      break;
    }
    case 'content': {
      fillRect(g, leftEyeX - 1, hcy + 2, 4, 1, eyeColor);
      fillRect(g, rightEyeX - 2, hcy + 2, 4, 1, eyeColor);
      if (character === 'dojocat' || character === 'pixiu') {
        drawCatNose(g, noseY);
        drawCatMouth(g, noseY, 'smile');
      } else {
        drawTinySmile(g, mouthY);
      }
      if (character !== 'devit') {
        fillRect(g, CX - 8, hcy + 3, 2, 1, 'H');
        fillRect(g, CX + 6, hcy + 3, 2, 1, 'H');
      }
      break;
    }
    case 'stuffed': {
      setPixel(g, leftEyeX - 1, hcy + 2, 'K');
      setPixel(g, leftEyeX, hcy + 1, 'K');
      setPixel(g, leftEyeX + 1, hcy + 2, 'K');
      setPixel(g, rightEyeX - 1, hcy + 2, 'K');
      setPixel(g, rightEyeX, hcy + 1, 'K');
      setPixel(g, rightEyeX + 1, hcy + 2, 'K');
      if (character === 'dojocat' || character === 'pixiu') {
        drawCatNose(g, noseY);
        drawCatMouth(g, noseY, 'smile');
      } else {
        drawTinySmile(g, mouthY);
      }
      fillRect(g, CX - 8, hcy + 3, 2, 2, 'H');
      fillRect(g, CX + 6, hcy + 3, 2, 2, 'H');
      break;
    }
    default: { // happy
      if (character === 'dojocat') {
        // Both eyes big & wide (cat-like)
        fillRect(g, leftEyeX - 1, eyeTop, 4, 7, eyeColor);
        setPixel(g, leftEyeX, eyeTop + 1, 'W');
        setPixel(g, leftEyeX, eyeTop + 3, 'W');
        fillRect(g, rightEyeX - 2, eyeTop, 4, 7, eyeColor);
        setPixel(g, rightEyeX - 1, eyeTop + 1, 'W');
        setPixel(g, rightEyeX - 1, eyeTop + 3, 'W');
        fillLine(g, leftEyeX - 3, browTop + 2, leftEyeX + 2, browTop, 'K');
        fillLine(g, rightEyeX + 2, browTop + 2, rightEyeX - 3, browTop, 'K');
        drawCatNose(g, noseY);
        drawCatMouth(g, noseY, 'smile');
      } else if (character === 'buu') {
        // Small dot eyes — high up on face, close together
        const buuEyeY = hcy - 1;
        fillCircle(g, CX - 5, buuEyeY, 1, eyeColor);
        fillCircle(g, CX + 5, buuEyeY, 1, eyeColor);
        // Mouth close to eyes, higher up
        const buuMouthY = hcy + 3;
        drawTinySmile(g, buuMouthY);
        setPixel(g, CX + 3, buuMouthY - 1, 'K');
        // Rosy cheeks on face layer (no outline)
        fillEllipse(g, CX - 9, hcy + 2, 3, 2, 'H');
        fillEllipse(g, CX + 9, hcy + 2, 3, 2, 'H');
      } else if (character === 'pixiu') {
        fillRect(g, leftEyeX - 1, eyeTop - 1, 4, 7, eyeColor);
        fillRect(g, rightEyeX - 2, eyeTop - 1, 4, 7, eyeColor);
        fillLine(g, leftEyeX - 3, browTop + 2, leftEyeX + 1, browTop + 1, 'K');
        fillLine(g, rightEyeX + 2, browTop + 2, rightEyeX - 2, browTop + 1, 'K');
        setPixel(g, leftEyeX, eyeTop, 'W');
        setPixel(g, rightEyeX, eyeTop, 'W');
        setPixel(g, leftEyeX + 1, eyeTop + 3, 'W');
        setPixel(g, rightEyeX + 1, eyeTop + 3, 'W');
        drawCatNose(g, noseY);
        drawOpenMouth(g, mouthY, 'N');
      } else {
        fillRect(g, leftEyeX - 1, eyeTop + 1, 3, 6, eyeColor);
        fillRect(g, rightEyeX - 1, eyeTop + 1, 3, 6, eyeColor);
        setPixel(g, leftEyeX, eyeTop + 2, 'W');
        setPixel(g, rightEyeX, eyeTop + 2, 'W');
        setPixel(g, leftEyeX, eyeTop + 4, 'W');
        setPixel(g, rightEyeX, eyeTop + 4, 'W');
        drawTinySmile(g, mouthY);
      }
      break;
    }
  }
  return g;
}


// ═══════════════════════════════════════════════════════════════
// 6. CLOTHING BUILDERS
// ═══════════════════════════════════════════════════════════════

function buildHat(hatId, color, character) {
  const g = createGrid(GW, GH);
  const topY = character === 'devit' ? HEAD_CY - HEAD_RY - 5 : HEAD_CY - HEAD_RY - 2;

  switch (hatId) {
    case 'chicken-hat': {
      const cy = topY + 5;
      // Larger round body that covers head top
      fillEllipse(g, CX, cy, 14, 8, '1');
      fillEllipse(g, CX, cy - 2, 12, 7, '1');
      // Wide brim
      fillRect(g, CX - 15, cy + 6, 31, 3, '1');
      fillRect(g, CX - 16, cy + 7, 3, 2, '1');
      fillRect(g, CX + 13, cy + 7, 3, 2, '1');
      // Brim shadow
      fillRect(g, CX - 14, cy + 8, 29, 1, '8');
      // Large comb (3 points)
      fillTriangle(g, CX - 3, cy - 12, CX - 1, cy - 18, CX + 1, cy - 12, '8');
      fillTriangle(g, CX, cy - 10, CX + 2, cy - 16, CX + 4, cy - 10, '8');
      fillTriangle(g, CX + 2, cy - 11, CX + 5, cy - 17, CX + 7, cy - 10, '8');
      // Beak
      fillRect(g, CX - 3, cy - 1, 7, 3, '5');
      fillRect(g, CX - 2, cy, 5, 2, '5');
      // Eyes
      setPixel(g, CX - 6, cy - 3, 'K');
      setPixel(g, CX + 6, cy - 3, 'K');
      setPixel(g, CX - 6, cy - 4, 'W');
      setPixel(g, CX + 6, cy - 4, 'W');
      // Wattle
      fillRect(g, CX - 1, cy + 2, 3, 3, '8');
      setPixel(g, CX, cy + 5, '8');
      // Buu's tentacle poking through hat — curves to the right
      if (character === 'buu') {
        for (let t = -2; t <= 2; t++) {
          fillLine(g, CX + 3 + t, cy - 5, CX + 10 + t, Math.max(0, cy - 10), '7');
          fillLine(g, CX + 10 + t, Math.max(0, cy - 10), CX + 14 + Math.min(t, 0), Math.max(1, cy - 7), '7');
        }
        fillCircle(g, CX + 14, Math.max(3, cy - 6), 3, '7');
      }
      break;
    }
    case 'headband': {
      fillRect(g, CX - HEAD_RX + 1, HEAD_CY - HEAD_RY + 3, HEAD_RX * 2 - 1, 3, '1');
      // Circle emblem (bigger)
      fillCircle(g, CX, HEAD_CY - HEAD_RY + 4, 2, '2');
      // Knot tails at back
      setPixel(g, CX + HEAD_RX - 2, HEAD_CY - HEAD_RY + 5, '1');
      setPixel(g, CX + HEAD_RX - 1, HEAD_CY - HEAD_RY + 6, '1');
      setPixel(g, CX + HEAD_RX, HEAD_CY - HEAD_RY + 7, '1');
      break;
    }
    case 'crown': {
      const cy = topY + 1;
      // Wider crown base
      fillRect(g, CX - 8, cy + 1, 17, 4, '1');
      // 5 crown points
      setPixel(g, CX - 7, cy, '1');
      setPixel(g, CX - 4, cy - 1, '1'); setPixel(g, CX - 4, cy, '1');
      setPixel(g, CX, cy - 2, '1'); setPixel(g, CX, cy - 1, '1');
      setPixel(g, CX + 4, cy - 1, '1'); setPixel(g, CX + 4, cy, '1');
      setPixel(g, CX + 7, cy, '1');
      // Band detail
      fillRect(g, CX - 8, cy + 3, 17, 1, '2');
      // Gems
      fillRect(g, CX - 4, cy + 2, 2, 1, '2');
      fillRect(g, CX + 3, cy + 2, 2, 1, '3');
      fillRect(g, CX - 1, cy + 1, 2, 2, '4');
      break;
    }
    case 'beanie': {
      const cy = topY + 1;
      fillEllipse(g, CX, cy + 2, 12, 6, '1');
      fillRect(g, CX - 12, cy + 6, 25, 3, '1');
      // Pom pom (bigger)
      fillCircle(g, CX, cy - 3, 3, '1');
      // Stripes
      fillRect(g, CX - 11, cy + 6, 23, 1, '2');
      fillRect(g, CX - 11, cy + 8, 23, 1, '2');
      // Ribbed texture
      for (let x = CX - 9; x <= CX + 9; x += 3) {
        fillLine(g, x, cy + 2, x, cy + 5, '2');
      }
      break;
    }
    case 'wizard-hat': {
      const cy = topY;
      fillTriangle(g, CX - 10, cy + 5, CX, cy - 12, CX + 10, cy + 5, '1');
      fillRect(g, CX - 12, cy + 4, 25, 3, '1');
      // Stars and sparkles
      setPixel(g, CX + 3, cy - 3, '2');
      setPixel(g, CX - 2, cy + 1, '2');
      setPixel(g, CX + 5, cy - 7, '2');
      setPixel(g, CX - 4, cy - 2, '2');
      // Moon
      setPixel(g, CX + 1, cy - 5, '2');
      setPixel(g, CX + 2, cy - 6, '2');
      // Brim accent
      fillRect(g, CX - 11, cy + 5, 23, 1, '2');
      break;
    }
    case 'party-hat': {
      const cy = topY;
      fillTriangle(g, CX - 6, cy + 4, CX, cy - 8, CX + 6, cy + 4, '1');
      // Pom pom (bigger)
      fillCircle(g, CX, cy - 9, 2, '2');
      // Diagonal stripes
      setPixel(g, CX - 3, cy + 2, '2');
      setPixel(g, CX - 2, cy + 1, '2');
      setPixel(g, CX + 2, cy, '2');
      setPixel(g, CX + 1, cy - 1, '2');
      setPixel(g, CX - 1, cy - 2, '2');
      // Base band
      fillRect(g, CX - 5, cy + 3, 11, 1, '2');
      break;
    }
    case 'astronaut-helmet': {
      // Large glass dome
      fillEllipse(g, CX, HEAD_CY, HEAD_RX + 3, HEAD_RY + 3, '1');
      fillEllipse(g, CX, HEAD_CY, HEAD_RX + 1, HEAD_RY + 1, null);
      // Visor shine
      setPixel(g, CX - HEAD_RX - 1, HEAD_CY - 3, '2');
      setPixel(g, CX - HEAD_RX - 1, HEAD_CY - 2, '2');
      setPixel(g, CX - HEAD_RX, HEAD_CY - 1, '2');
      // Antenna
      setPixel(g, CX, HEAD_CY - HEAD_RY - 3, '2');
      setPixel(g, CX, HEAD_CY - HEAD_RY - 2, '1');
      break;
    }
    case 'goggles': {
      // Left lens
      fillRect(g, CX - 9, HEAD_CY - 3, 8, 5, '1');
      fillRect(g, CX - 8, HEAD_CY - 2, 6, 3, '2');
      // Right lens
      fillRect(g, CX + 2, HEAD_CY - 3, 8, 5, '1');
      fillRect(g, CX + 3, HEAD_CY - 2, 6, 3, '2');
      // Bridge
      fillRect(g, CX - 1, HEAD_CY - 2, 3, 2, '1');
      // Strap
      fillRect(g, CX - 10, HEAD_CY - 2, 1, 2, '1');
      fillRect(g, CX + 10, HEAD_CY - 2, 1, 2, '1');
      // Lens shine
      setPixel(g, CX - 7, HEAD_CY - 2, 'W');
      setPixel(g, CX + 4, HEAD_CY - 2, 'W');
      break;
    }
    case 'cat-hoodie': {
      fillEllipse(g, CX, HEAD_CY - 1, HEAD_RX + 2, HEAD_RY + 2, '1');
      // Cat ear tips (bigger)
      fillTriangle(g, CX - 8, HEAD_CY - 6, CX - 11, HEAD_CY - HEAD_RY - 4, CX - 4, HEAD_CY - HEAD_RY - 1, '1');
      fillTriangle(g, CX + 8, HEAD_CY - 6, CX + 11, HEAD_CY - HEAD_RY - 4, CX + 4, HEAD_CY - HEAD_RY - 1, '1');
      // Inner ears
      fillTriangle(g, CX - 7, HEAD_CY - 7, CX - 9, HEAD_CY - HEAD_RY - 2, CX - 5, HEAD_CY - HEAD_RY, '2');
      fillTriangle(g, CX + 7, HEAD_CY - 7, CX + 9, HEAD_CY - HEAD_RY - 2, CX + 5, HEAD_CY - HEAD_RY, '2');
      // Face opening
      fillEllipse(g, CX, HEAD_CY + 2, HEAD_RX - 2, HEAD_RY - 2, null);
      // Hood seam
      fillLine(g, CX, HEAD_CY - HEAD_RY - 1, CX, HEAD_CY - 4, '2');
      break;
    }
    case 'ranger-helmet': {
      const cy = topY;
      fillEllipse(g, CX, HEAD_CY - 2, HEAD_RX + 2, HEAD_RY, '1');
      // Visor
      fillRect(g, CX - 7, HEAD_CY - 1, 15, 3, '2');
      // Crest
      fillTriangle(g, CX - 2, cy - 1, CX, cy - 6, CX + 2, cy - 1, '1');
      // Ear covers
      fillRect(g, CX - HEAD_RX - 1, HEAD_CY - 1, 2, 4, '1');
      fillRect(g, CX + HEAD_RX, HEAD_CY - 1, 2, 4, '1');
      break;
    }
    case 'santa-hat': {
      const cy = topY;
      fillTriangle(g, CX - 8, cy + 4, CX + 7, cy - 6, CX + 9, cy + 4, '1');
      // Fur brim (white, thick)
      fillRect(g, CX - 10, cy + 3, 21, 3, 'W');
      // Pom pom (bigger)
      fillCircle(g, CX + 8, cy - 6, 3, 'W');
      // Fold detail
      setPixel(g, CX + 3, cy - 2, '2');
      setPixel(g, CX + 5, cy - 4, '2');
      break;
    }
    default: break;
  }
  return g;
}

function buildTop(topId, color, weightState) {
  const g = createGrid(GW, GH);
  const { w, bodyCy } = getBodyMetrics(weightState);
  const bt = bodyCy - w.bodyRy;
  const bb = bodyCy + w.bodyRy;

  switch (topId) {
    case 'denim-jacket': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Lighter wash center panel
      fillRect(g, CX - 3, bt + 2, 7, w.bodyRy * 2 - 4, 'W');
      // Center zipper line
      fillLine(g, CX, bt + 2, CX, bb - 1, 'K');
      // Collar — V-neck
      fillLine(g, CX - 4, bt, CX, bt + 3, '2');
      fillLine(g, CX + 4, bt, CX, bt + 3, '2');
      // Chest pockets
      fillRect(g, CX - w.bodyRx + 3, bodyCy - 2, 4, 3, '2');
      fillRect(g, CX + w.bodyRx - 6, bodyCy - 2, 4, 3, '2');
      // Pocket flaps
      fillRect(g, CX - w.bodyRx + 3, bodyCy - 2, 4, 1, 'K');
      fillRect(g, CX + w.bodyRx - 6, bodyCy - 2, 4, 1, 'K');
      // Buttons
      setPixel(g, CX + 1, bt + 4, 'K');
      setPixel(g, CX + 1, bodyCy, 'K');
      setPixel(g, CX + 1, bodyCy + 3, 'K');
      break;
    }
    case 'leather-jacket': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Diagonal zipper
      fillLine(g, CX - 3, bt + 1, CX + 2, bodyCy + 2, 'K');
      // Stand collar
      fillRect(g, CX - 5, bt, 10, 2, '2');
      // Shoulder epaulets
      fillRect(g, CX - w.bodyRx + 1, bt + 2, 3, 1, 'K');
      fillRect(g, CX + w.bodyRx - 3, bt + 2, 3, 1, 'K');
      // Side panels (darker)
      fillRect(g, CX - w.bodyRx + 1, bodyCy - 1, 3, 5, '2');
      fillRect(g, CX + w.bodyRx - 3, bodyCy - 1, 3, 5, '2');
      // Zipper pull
      setPixel(g, CX + 2, bodyCy + 2, 'W');
      break;
    }
    case 'lab-coat': {
      fillEllipse(g, CX, bodyCy, w.bodyRx + 1, w.bodyRy + 1, '1');
      // Lapels
      fillLine(g, CX - 4, bt - 1, CX - 1, bt + 4, '2');
      fillLine(g, CX + 4, bt - 1, CX + 1, bt + 4, '2');
      // Center closure
      fillLine(g, CX, bt + 3, CX, bb, 'K');
      // Breast pocket with pen
      fillRect(g, CX - w.bodyRx + 3, bt + 3, 3, 2, '2');
      setPixel(g, CX - w.bodyRx + 4, bt + 2, '3');
      // Lower pocket
      fillRect(g, CX + 2, bodyCy + 1, 4, 3, '2');
      // ID badge
      fillRect(g, CX - w.bodyRx + 3, bodyCy - 2, 2, 3, '3');
      break;
    }
    case 'sailor-shirt': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Sailor collar (wide triangular)
      fillTriangle(g, CX - w.bodyRx + 1, bt + 2, CX, bt + 5, CX + w.bodyRx - 1, bt + 2, '2');
      // Horizontal stripes (lower half)
      for (let sy = bodyCy - 1; sy < bb; sy += 2) {
        for (let sx = CX - w.bodyRx; sx <= CX + w.bodyRx; sx++) {
          if (sx >= 0 && sx < GW && sy >= 0 && sy < GH) {
            const dx = (sx - CX) / w.bodyRx, dy = (sy - bodyCy) / w.bodyRy;
            if (dx * dx + dy * dy <= 1) setPixel(g, sx, sy, '2');
          }
        }
      }
      // V-neck opening
      fillTriangle(g, CX - 2, bt + 1, CX, bt + 4, CX + 2, bt + 1, 'W');
      // Ribbon tie
      setPixel(g, CX, bt + 4, '3');
      setPixel(g, CX - 1, bt + 5, '3');
      setPixel(g, CX + 1, bt + 5, '3');
      break;
    }
    case 'dress': {
      fillEllipse(g, CX, bodyCy - 1, w.bodyRx - 1, w.bodyRy - 1, '1');
      // Flared skirt
      fillTriangle(g, CX - w.bodyRx - 2, bb + 2, CX, bodyCy, CX + w.bodyRx + 2, bb + 2, '1');
      // Waistline
      for (let x = CX - w.bodyRx + 2; x <= CX + w.bodyRx - 2; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 0.85) setPixel(g, x, bodyCy, '2');
      }
      // Straps
      fillLine(g, CX - 3, bt, CX - 5, bt - 2, '1');
      fillLine(g, CX + 3, bt, CX + 5, bt - 2, '1');
      // Bow at waist
      setPixel(g, CX - 1, bodyCy - 1, '2');
      setPixel(g, CX, bodyCy - 1, '2');
      setPixel(g, CX + 1, bodyCy - 1, '2');
      setPixel(g, CX - 2, bodyCy, '2');
      setPixel(g, CX + 2, bodyCy, '2');
      break;
    }
    case 'hoodie': {
      fillEllipse(g, CX, bodyCy, w.bodyRx + 1, w.bodyRy, '1');
      // Hood visible behind head
      fillEllipse(g, CX, HEAD_CY + HEAD_R - 2, HEAD_R + 2, 6, '1');
      // Kangaroo pocket
      fillEllipse(g, CX, bodyCy + 2, 5, 3, '2');
      // Front center line
      fillLine(g, CX, bt + 2, CX, bb - 1, '2');
      // Drawstrings
      fillLine(g, CX - 1, bt + 1, CX - 2, bt + 4, 'W');
      fillLine(g, CX + 1, bt + 1, CX + 2, bt + 4, 'W');
      // Ribbed bottom
      for (let x = CX - w.bodyRx + 1; x <= CX + w.bodyRx - 1; x += 2) {
        const dx = (x - CX) / (w.bodyRx + 1);
        if (dx * dx <= 0.9) setPixel(g, x, bb - 1, '2');
      }
      break;
    }
    case 'camo-vest': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Camo patches (scattered)
      fillRect(g, CX - 5, bodyCy - 3, 3, 2, '2');
      fillRect(g, CX + 3, bodyCy - 1, 2, 3, '2');
      fillRect(g, CX - 2, bodyCy + 2, 4, 2, '3');
      fillRect(g, CX + 1, bodyCy - 4, 3, 2, '3');
      fillRect(g, CX - 6, bodyCy + 1, 2, 2, '2');
      // Front zipper
      fillLine(g, CX, bt + 1, CX, bb - 1, 'K');
      // Pockets
      fillRect(g, CX - w.bodyRx + 2, bodyCy, 3, 3, '2');
      fillRect(g, CX + w.bodyRx - 4, bodyCy, 3, 3, '2');
      break;
    }
    case 'power-suit': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Tech panel lines
      fillLine(g, CX - w.bodyRx + 3, bt + 2, CX - w.bodyRx + 3, bb - 2, '2');
      fillLine(g, CX + w.bodyRx - 3, bt + 2, CX + w.bodyRx - 3, bb - 2, '2');
      // Chest emblem (glowing diamond)
      setPixel(g, CX, bodyCy - 3, '3');
      setPixel(g, CX - 1, bodyCy - 2, '3');
      setPixel(g, CX + 1, bodyCy - 2, '3');
      setPixel(g, CX - 2, bodyCy - 1, '2');
      setPixel(g, CX, bodyCy - 1, '3');
      setPixel(g, CX + 2, bodyCy - 1, '2');
      setPixel(g, CX - 1, bodyCy, '3');
      setPixel(g, CX + 1, bodyCy, '3');
      setPixel(g, CX, bodyCy + 1, '3');
      // Belt line
      for (let x = CX - w.bodyRx + 1; x <= CX + w.bodyRx - 1; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) setPixel(g, x, bb - 3, '2');
      }
      // Shoulder pads
      fillRect(g, CX - w.bodyRx, bt + 1, 3, 2, '2');
      fillRect(g, CX + w.bodyRx - 2, bt + 1, 3, 2, '2');
      break;
    }
    case 'traditional-robe': {
      fillEllipse(g, CX, bodyCy, w.bodyRx + 1, w.bodyRy + 1, '1');
      // Crossed front panels
      fillLine(g, CX - 5, bt, CX + 2, bodyCy + 3, '2');
      fillLine(g, CX + 5, bt, CX - 2, bodyCy + 3, '2');
      // Neckline
      fillLine(g, CX - 3, bt, CX, bt + 2, '2');
      fillLine(g, CX + 3, bt, CX, bt + 2, '2');
      // Obi/sash belt
      for (let x = CX - w.bodyRx; x <= CX + w.bodyRx; x++) {
        const dx = (x - CX) / (w.bodyRx + 1);
        if (dx * dx <= 1) {
          setPixel(g, x, bodyCy - 1, '6');
          setPixel(g, x, bodyCy, '6');
          setPixel(g, x, bodyCy + 1, '6');
        }
      }
      // Obi knot
      fillRect(g, CX + w.bodyRx - 2, bodyCy - 1, 3, 3, '6');
      // Bottom trim
      for (let x = CX - w.bodyRx; x <= CX + w.bodyRx; x += 2) {
        const dx = (x - CX) / (w.bodyRx + 1);
        if (dx * dx <= 1 && bb + 1 < GH) setPixel(g, x, bb + 1, '6');
      }
      break;
    }
    default: break;
  }
  return g;
}

function buildBelt(beltId, color, weightState) {
  const g = createGrid(GW, GH);
  const { w, bodyCy } = getBodyMetrics(weightState);
  const beltY = bodyCy;

  switch (beltId) {
    case 'stomp-belt': {
      // Wide belt — 2 rows
      for (let x = CX - w.bodyRx + 1; x <= CX + w.bodyRx - 1; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) {
          setPixel(g, x, beltY, '1');
          setPixel(g, x, beltY + 1, '1');
        }
      }
      // Large buckle
      fillRect(g, CX - 2, beltY - 1, 5, 3, '2');
      fillRect(g, CX - 1, beltY, 3, 1, '1');
      // Belt holes
      setPixel(g, CX + 4, beltY, 'K');
      setPixel(g, CX + 6, beltY, 'K');
      break;
    }
    case 'chain-belt': {
      // Chain links — alternating pattern
      for (let x = CX - w.bodyRx + 2; x <= CX + w.bodyRx - 2; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) {
          if (x % 3 === 0) {
            setPixel(g, x, beltY, '1');
            setPixel(g, x, beltY + 1, '1');
          } else if (x % 3 === 1) {
            setPixel(g, x, beltY - 1, '1');
            setPixel(g, x, beltY, '1');
          }
        }
      }
      // Hanging chain dangle
      fillLine(g, CX - 3, beltY + 1, CX - 5, beltY + 3, '1');
      setPixel(g, CX - 5, beltY + 4, '2');
      break;
    }
    case 'medal-chain': {
      // V-shaped chain
      fillLine(g, CX - 5, bodyCy - w.bodyRy + 1, CX, bodyCy, '6');
      fillLine(g, CX + 5, bodyCy - w.bodyRy + 1, CX, bodyCy, '6');
      // Medal body
      fillCircle(g, CX, bodyCy + 2, 3, '6');
      fillCircle(g, CX, bodyCy + 2, 2, 'K');
      // Emblem on medal
      setPixel(g, CX, bodyCy + 1, '6');
      setPixel(g, CX - 1, bodyCy + 2, '6');
      setPixel(g, CX + 1, bodyCy + 2, '6');
      setPixel(g, CX, bodyCy + 3, '6');
      break;
    }
    case 'ribbon': {
      // Thin satin ribbon
      for (let x = CX - w.bodyRx + 1; x <= CX + w.bodyRx - 1; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) setPixel(g, x, beltY + 1, '1');
      }
      // Bow on the side
      fillRect(g, CX + w.bodyRx - 4, beltY - 1, 3, 1, '1');
      fillRect(g, CX + w.bodyRx - 4, beltY + 2, 3, 1, '1');
      setPixel(g, CX + w.bodyRx - 3, beltY, '2');
      setPixel(g, CX + w.bodyRx - 3, beltY + 1, '2');
      // Tail ribbons hanging down
      fillLine(g, CX + w.bodyRx - 4, beltY + 2, CX + w.bodyRx - 5, beltY + 4, '1');
      fillLine(g, CX + w.bodyRx - 2, beltY + 2, CX + w.bodyRx - 1, beltY + 4, '1');
      break;
    }
    case 'sash': {
      // Diagonal sash — 2px wide
      fillLine(g, CX - w.bodyRx + 2, bodyCy - w.bodyRy + 2, CX + w.bodyRx - 2, bodyCy + w.bodyRy - 2, '1');
      fillLine(g, CX - w.bodyRx + 3, bodyCy - w.bodyRy + 2, CX + w.bodyRx - 1, bodyCy + w.bodyRy - 2, '1');
      // Decorative trim
      fillLine(g, CX - w.bodyRx + 2, bodyCy - w.bodyRy + 3, CX + w.bodyRx - 2, bodyCy + w.bodyRy - 1, '2');
      // Medal at hip
      fillCircle(g, CX + w.bodyRx - 3, bodyCy + w.bodyRy - 3, 2, '2');
      setPixel(g, CX + w.bodyRx - 3, bodyCy + w.bodyRy - 3, '3');
      break;
    }
    case 'utility-belt': {
      // Thick belt — 3 rows
      for (let x = CX - w.bodyRx + 1; x <= CX + w.bodyRx - 1; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) {
          setPixel(g, x, beltY - 1, '1');
          setPixel(g, x, beltY, '1');
          setPixel(g, x, beltY + 1, '1');
        }
      }
      // Pouches
      fillRect(g, CX - 6, beltY - 1, 3, 4, '2');
      fillRect(g, CX - 2, beltY, 2, 3, '2');
      fillRect(g, CX + 4, beltY - 1, 3, 4, '2');
      // Buckle
      fillRect(g, CX + 1, beltY - 1, 2, 3, '3');
      // Pouch flaps
      fillRect(g, CX - 6, beltY - 1, 3, 1, 'K');
      fillRect(g, CX + 4, beltY - 1, 3, 1, 'K');
      break;
    }
    default: break;
  }
  return g;
}

function buildShoes(shoeId, color, weightState) {
  const g = createGrid(GW, GH);
  const { w, legSpread, legTop, legHeight } = getBodyMetrics(weightState);
  const footY = legTop + legHeight - 2;

  switch (shoeId) {
    case 'sneakers': {
      // Shoe body
      fillRect(g, CX - legSpread - w.limbW - 1, footY, w.limbW + 3, 3, '1');
      fillRect(g, CX + legSpread - 2, footY, w.limbW + 3, 3, '1');
      // White sole
      fillRect(g, CX - legSpread - w.limbW - 1, footY + 2, w.limbW + 3, 1, 'W');
      fillRect(g, CX + legSpread - 2, footY + 2, w.limbW + 3, 1, 'W');
      // Stripe
      fillRect(g, CX - legSpread - w.limbW, footY + 1, w.limbW + 1, 1, '2');
      fillRect(g, CX + legSpread - 1, footY + 1, w.limbW + 1, 1, '2');
      // Lace dots
      setPixel(g, CX - legSpread - 1, footY, 'W');
      setPixel(g, CX + legSpread, footY, 'W');
      break;
    }
    case 'boots': {
      // Tall boot shaft
      fillRect(g, CX - legSpread - w.limbW - 1, footY - 3, w.limbW + 2, 6, '1');
      fillRect(g, CX + legSpread - 1, footY - 3, w.limbW + 2, 6, '1');
      // Boot toe
      fillRect(g, CX - legSpread - w.limbW - 2, footY + 2, w.limbW + 3, 1, '1');
      fillRect(g, CX + legSpread - 2, footY + 2, w.limbW + 3, 1, '1');
      // Thick sole
      fillRect(g, CX - legSpread - w.limbW - 2, footY + 2, w.limbW + 4, 1, '2');
      fillRect(g, CX + legSpread - 2, footY + 2, w.limbW + 4, 1, '2');
      // Lacing
      setPixel(g, CX - legSpread, footY - 2, 'W');
      setPixel(g, CX - legSpread, footY - 1, 'W');
      setPixel(g, CX + legSpread, footY - 2, 'W');
      setPixel(g, CX + legSpread, footY - 1, 'W');
      // Boot strap
      fillRect(g, CX - legSpread - w.limbW, footY - 1, w.limbW + 1, 1, '2');
      fillRect(g, CX + legSpread - 1, footY - 1, w.limbW + 1, 1, '2');
      break;
    }
    case 'sandals': {
      // Flat sole
      fillRect(g, CX - legSpread - w.limbW - 1, footY + 2, w.limbW + 3, 1, '1');
      fillRect(g, CX + legSpread - 2, footY + 2, w.limbW + 3, 1, '1');
      // Cross straps
      setPixel(g, CX - legSpread - 1, footY, '1');
      setPixel(g, CX - legSpread, footY + 1, '1');
      setPixel(g, CX + legSpread, footY, '1');
      setPixel(g, CX + legSpread - 1, footY + 1, '1');
      // Back strap
      setPixel(g, CX - legSpread - w.limbW + 1, footY + 1, '2');
      setPixel(g, CX + legSpread + w.limbW - 2, footY + 1, '2');
      break;
    }
    case 'dance-shoes': {
      // Sleek low shoe
      fillRect(g, CX - legSpread - w.limbW - 1, footY + 1, w.limbW + 3, 2, '1');
      fillRect(g, CX + legSpread - 2, footY + 1, w.limbW + 3, 2, '1');
      // High shine
      setPixel(g, CX - legSpread - w.limbW, footY + 1, 'W');
      setPixel(g, CX - legSpread, footY + 1, 'W');
      setPixel(g, CX + legSpread - 1, footY + 1, 'W');
      setPixel(g, CX + legSpread + 1, footY + 1, 'W');
      // Thin heel
      setPixel(g, CX - legSpread - w.limbW, footY + 2, 'K');
      setPixel(g, CX + legSpread + w.limbW - 1, footY + 2, 'K');
      break;
    }
    case 'power-boots': {
      // Chunky armored boots
      fillRect(g, CX - legSpread - w.limbW - 2, footY - 3, w.limbW + 4, 7, '1');
      fillRect(g, CX + legSpread - 2, footY - 3, w.limbW + 4, 7, '1');
      // Armor plating
      fillRect(g, CX - legSpread - w.limbW - 1, footY - 2, w.limbW + 2, 2, '2');
      fillRect(g, CX + legSpread - 1, footY - 2, w.limbW + 2, 2, '2');
      // Thick sole
      fillRect(g, CX - legSpread - w.limbW - 2, footY + 3, w.limbW + 5, 1, '2');
      fillRect(g, CX + legSpread - 2, footY + 3, w.limbW + 5, 1, '2');
      // Glow accent
      setPixel(g, CX - legSpread - 1, footY - 1, '3');
      setPixel(g, CX + legSpread, footY - 1, '3');
      break;
    }
    case 'cat-slippers': {
      // Round slipper body
      fillEllipse(g, CX - legSpread, footY + 1, w.limbW + 1, 2, '1');
      fillEllipse(g, CX + legSpread, footY + 1, w.limbW + 1, 2, '1');
      // Cat ears
      setPixel(g, CX - legSpread - w.limbW, footY - 1, '1');
      setPixel(g, CX - legSpread - w.limbW + 2, footY - 1, '1');
      setPixel(g, CX + legSpread - 1, footY - 1, '1');
      setPixel(g, CX + legSpread + 1, footY - 1, '1');
      // Cat face — eyes & nose
      setPixel(g, CX - legSpread - 1, footY, 'K');
      setPixel(g, CX - legSpread + 1, footY, 'K');
      setPixel(g, CX - legSpread, footY + 1, '2');
      setPixel(g, CX + legSpread - 1, footY, 'K');
      setPixel(g, CX + legSpread + 1, footY, 'K');
      setPixel(g, CX + legSpread, footY + 1, '2');
      // Whiskers
      setPixel(g, CX - legSpread - 2, footY + 1, 'K');
      setPixel(g, CX - legSpread + 2, footY + 1, 'K');
      setPixel(g, CX + legSpread - 2, footY + 1, 'K');
      setPixel(g, CX + legSpread + 2, footY + 1, 'K');
      break;
    }
    default: break;
  }
  return g;
}

const DEFAULT_ICONIC_LOOKS = {
  dojocat: {
    hat: { id: 'chicken-hat', color: '#f5edd0' },
    top: { id: 'denim-jacket', color: '#42649f' },
    belt: { id: 'medal-chain', color: '#d4a43a' },
  },
  buu: {
    hat: { id: 'chicken-hat', color: '#f3f0df' },
    top: { id: 'leather-jacket', color: '#24283b' },
    belt: { id: 'medal-chain', color: '#b88b3e' },
  },
  pixiu: {
    hat: { id: 'chicken-hat', color: '#fff0ea' },
    top: { id: 'traditional-robe', color: '#d6548d' },
    belt: { id: 'sash', color: '#d9b04a' },
  },
};

function buildFood(foodId) {
  const g = createGrid(12, 12);
  switch (foodId) {
    case 'pump-chow':
      fillRect(g, 2, 5, 8, 4, '1');
      fillRect(g, 3, 4, 6, 1, '2');
      break;
    case 'beat-bites':
      fillCircle(g, 6, 6, 4, '1');
      setPixel(g, 4, 5, '2');
      setPixel(g, 7, 7, '2');
      setPixel(g, 8, 4, '2');
      break;
    case 'slam-grub':
      fillEllipse(g, 6, 6, 4, 3, '1');
      fillRect(g, 1, 5, 2, 2, '2');
      fillRect(g, 9, 5, 2, 2, '2');
      break;
    case 'step-fuel':
      fillTriangle(g, 5, 1, 9, 6, 6, 11, '1');
      fillTriangle(g, 7, 1, 3, 6, 6, 11, '2');
      break;
    case 'rhythm-rations':
      fillCircle(g, 6, 6, 4, '1');
      fillLine(g, 6, 2, 6, 10, '2');
      fillLine(g, 2, 6, 10, 6, '2');
      break;
    case 'gargoyle-munch':
      fillRect(g, 2, 4, 8, 5, '1');
      setPixel(g, 4, 3, '2');
      setPixel(g, 7, 3, '2');
      break;
    case 'pad-power':
      fillRect(g, 3, 2, 6, 8, '1');
      fillRect(g, 4, 3, 4, 6, 'W');
      setPixel(g, 6, 6, '2');
      break;
    case 'dance-dust':
      setPixel(g, 6, 2, '1');
      setPixel(g, 3, 5, '1');
      setPixel(g, 6, 5, '1');
      setPixel(g, 9, 5, '1');
      setPixel(g, 4, 8, '1');
      setPixel(g, 8, 8, '1');
      break;
    case 'doof-bites':
      fillRect(g, 3, 5, 6, 3, '1');
      setPixel(g, 4, 4, '2');
      setPixel(g, 7, 4, '2');
      setPixel(g, 5, 8, '2');
      break;
    case 'adrenaline-chow':
      fillTriangle(g, 6, 1, 10, 10, 2, 10, '1');
      fillTriangle(g, 6, 3, 8, 8, 4, 8, '2');
      break;
    case 'banya-biscuits':
      fillCircle(g, 6, 6, 4, '1');
      setPixel(g, 6, 2, '2');
      setPixel(g, 3, 5, '2');
      setPixel(g, 9, 5, '2');
      break;
    default:
      fillRect(g, 3, 4, 6, 4, '1');
      break;
  }
  return g;
}


// ═══════════════════════════════════════════════════════════════
// 7. SHADOW COMPOSITION
// ═══════════════════════════════════════════════════════════════

function getClothingColorMap(color) {
  const c = color || '#888888';
  // Compute a darker and lighter variant
  const hex = c.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const gn = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const darker = `#${Math.max(0, r - 40).toString(16).padStart(2, '0')}${Math.max(0, gn - 40).toString(16).padStart(2, '0')}${Math.max(0, b - 40).toString(16).padStart(2, '0')}`;
  const lighter = `#${Math.min(255, r + 40).toString(16).padStart(2, '0')}${Math.min(255, gn + 40).toString(16).padStart(2, '0')}${Math.min(255, b + 40).toString(16).padStart(2, '0')}`;
  return {
    '1': c,
    '2': darker,
    '3': lighter,
    '4': '#ff6b9d', // accent (chicken wattle etc)
    '5': '#efaa3a',
    '6': '#e0c15f',
    '7': '#efb2c5',
    '8': '#cb5147',
    K: '#1a1a1a',
    W: '#ffffff',
  };
}

function composeShadow(grid, palette) {
  return gridToShadow(grid, palette);
}


// ═══════════════════════════════════════════════════════════════
// 8. ANIMATION STYLES
// ═══════════════════════════════════════════════════════════════

const PIXEL_ART_STYLES = `
  .pixel-pet-wrap {
    position: relative;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }
  .pixel-pet-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 1em;
    height: 1em;
    overflow: visible;
  }
  /* All movement is frame-based pixel animation — no CSS transform bobbing */
  @keyframes petFoodTravel {
    0% { transform: translate(-6em, 9em) scale(0.7); opacity: 0; }
    15% { opacity: 1; }
    65% { transform: translate(-1.4em, 3.8em) scale(1); opacity: 1; }
    100% { transform: translate(0.1em, 2.6em) scale(0.25); opacity: 0; }
  }
  .pet-food {
    animation: petFoodTravel 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    transform-origin: center center;
  }
  .sprite-blink { opacity: 0.92; transition: opacity 0.15s ease; }
  @media (prefers-reduced-motion: reduce) {
    .pixel-pet-wrap *, .pixel-pet-wrap { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
    [class*="idle-"] { animation: none !important; }
    .sprite-blink { opacity: 1 !important; transition: none !important; }
  }
`;


// ═══════════════════════════════════════════════════════════════
// 9. POSE HELPERS — separate body pose from head movement
// ═══════════════════════════════════════════════════════════════

// Poses that only move the head (body stays in rest)
function getBodyPose(pose) {
  if (pose === 'head_bob_l' || pose === 'head_bob_r' ||
      pose === 'head_nod_down' || pose === 'head_nod_up') return 'rest';
  return pose;
}

// Head pixel offsets for poses that involve head movement [dx, dy]
function getHeadOffset(pose) {
  switch (pose) {
    case 'waddle_l':     return [-1, 0];
    case 'waddle_r':     return [1, 0];
    case 'stomp':        return [0, 2];
    case 'head_bob_l':   return [-2, 0];
    case 'head_bob_r':   return [2, 0];
    case 'head_nod_down': return [0, 2];
    case 'head_nod_up':  return [0, -1];
    default:             return [0, 0];
  }
}


// ═══════════════════════════════════════════════════════════════
// 10. PIXEL LAYER COMPONENT
// ═══════════════════════════════════════════════════════════════

function PixelLayer({ shadow, className = '', style = {} }) {
  if (!shadow) return null;
  return (
    <div
      className={`pixel-pet-layer ${className}`}
      style={{
        boxShadow: shadow,
        ...style,
      }}
    />
  );
}


// ═══════════════════════════════════════════════════════════════
// 10. CANVAS RENDERER — for share/export (draws pet to a Canvas)
// ═══════════════════════════════════════════════════════════════

/**
 * Renders the pet as pixel art onto a Canvas context.
 * Used for social sharing — produces a clean raster image.
 */
export function renderPetToCanvas(ctx, opts = {}) {
  const {
    character = 'dojocat',
    weightState = 'normal',
    mood = 'happy',
    expression = '',
    pose = 'rest',
    equippedHat = '',
    equippedBelt = '',
    equippedShoes = '',
    equippedTop = '',
    hatColor = '',
    beltColor = '',
    shoesColor = '',
    topColor = '',
    x = 0,
    y = 0,
    pixelSize = 4,
  } = opts;

  const palette = PALETTES[character] || PALETTES.dojocat;
  const iconicLook = DEFAULT_ICONIC_LOOKS[character] || null;

  function drawGrid(grid, colorMap) {
    for (let gy = 0; gy < grid.length; gy++) {
      for (let gx = 0; gx < grid[0].length; gx++) {
        const k = grid[gy][gx];
        if (k && colorMap[k]) {
          ctx.fillStyle = colorMap[k];
          ctx.fillRect(x + gx * pixelSize, y + gy * pixelSize, pixelSize, pixelSize);
        }
      }
    }
  }

  const bodyPose = getBodyPose(pose);
  const [headDx, headDy] = getHeadOffset(pose);

  // Shadow
  const shadowGrid = createGrid(GW, GH);
  const { w, legTop } = getBodyMetrics(weightState);
  fillEllipse(shadowGrid, CX, legTop + 7, Math.floor(w.bodyRx * 0.7), 2, 'X');
  drawGrid(shadowGrid, { X: 'rgba(0,0,0,0.15)' });

  // Tail (frame-based wiggle)
  drawGrid(outlineGrid(buildTail(character, weightState, 0)), palette);

  // Body
  drawGrid(outlineGrid(buildBase(character, weightState, bodyPose)), palette);

  // Clothing (bottom layers)
  const defaultTop = equippedTop ? null : iconicLook?.top;
  const defaultBelt = equippedBelt ? null : iconicLook?.belt;
  if (defaultTop) drawGrid(outlineGrid(buildTop(defaultTop.id, defaultTop.color, weightState)), getClothingColorMap(defaultTop.color));
  if (equippedTop) drawGrid(outlineGrid(buildTop(equippedTop, topColor, weightState)), getClothingColorMap(topColor));
  if (defaultBelt) drawGrid(outlineGrid(buildBelt(defaultBelt.id, defaultBelt.color, weightState)), getClothingColorMap(defaultBelt.color));
  if (equippedBelt) drawGrid(outlineGrid(buildBelt(equippedBelt, beltColor, weightState)), getClothingColorMap(beltColor));
  if (equippedShoes) drawGrid(outlineGrid(buildShoes(equippedShoes, shoesColor, weightState)), getClothingColorMap(shoesColor));

  // Head (shifted with pose)
  drawGrid(shiftGrid(outlineGrid(buildHead(character)), headDx, headDy), palette);

  // Arms
  drawGrid(outlineGrid(buildArms(character, weightState, bodyPose)), palette);

  // Features (shifted with head)
  drawGrid(shiftGrid(outlineGrid(buildFeatures(character, 0)), headDx, headDy), palette);

  // Hat (shifted with head)
  const defaultHat = equippedHat ? null : iconicLook?.hat;
  if (defaultHat) drawGrid(shiftGrid(outlineGrid(buildHat(defaultHat.id, defaultHat.color, character)), headDx, headDy), getClothingColorMap(defaultHat.color));
  if (equippedHat) drawGrid(shiftGrid(outlineGrid(buildHat(equippedHat, hatColor, character)), headDx, headDy), getClothingColorMap(hatColor));

  // Face (shifted with head)
  drawGrid(shiftGrid(buildFace(character, mood, expression), headDx, headDy), palette);
}

// ═══════════════════════════════════════════════════════════════
// 11. MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function SpritePet({
  character = 'dojocat',
  weightState = 'normal',
  mood = 'happy',
  equippedHat = '',
  equippedBelt = '',
  equippedShoes = '',
  equippedTop = '',
  hatColor = '',
  beltColor = '',
  shoesColor = '',
  topColor = '',
  isEating = false,
  isTricking = false,
  reaction = '',
  expression = '',
  foodId = '',
  actionState = '',
  size = 140,
  className = '',
  onClick,
}) {
  const palette = PALETTES[character] || PALETTES.dojocat;
  const pixelSize = size / GW;
  const iconicLook = DEFAULT_ICONIC_LOOKS[character] || null;
  const hasReaction = (!!reaction || !!actionState) && !isEating && !isTricking;
  const renderedAspect = GH / GW;

  // ─── Frame-based animation system ──────────────────────────
  // ALL movement is pixel-art pose changes, no CSS transforms
  const [idleTick, setIdleTick] = React.useState(0);
  const [reactionFrame, setReactionFrame] = React.useState(0);
  const [blinkState, setBlinkState] = React.useState(false);
  const [tailFrame, setTailFrame] = React.useState(0);

  // Idle: change pose every 3-5 seconds, tail wags every 700ms
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (hasReaction || isEating || isTricking) return;

    const blinkInterval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 150);
    }, 3000 + Math.random() * 3000);

    const idleInterval = setInterval(() => {
      setIdleTick(t => t + 1);
    }, 3000 + Math.random() * 2000);

    const tailInterval = setInterval(() => {
      setTailFrame(t => t + 1);
    }, 700);

    return () => {
      clearInterval(blinkInterval);
      clearInterval(idleInterval);
      clearInterval(tailInterval);
    };
  }, [hasReaction, isEating, isTricking]);

  // Reactions: rapid pose cycling (frame-based animation at ~250ms per frame)
  React.useEffect(() => {
    if (!hasReaction) { setReactionFrame(0); return; }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    setReactionFrame(0);
    const frameInterval = setInterval(() => {
      setReactionFrame(f => f + 1);
    }, 250);

    // Tail still wags during reactions
    const tailInterval = setInterval(() => {
      setTailFrame(t => t + 1);
    }, 700);

    return () => {
      clearInterval(frameInterval);
      clearInterval(tailInterval);
    };
  }, [hasReaction, reaction, actionState]);

  // Character idle poses — now includes waddle, head bob/nod, stomp, punch
  const IDLE_POSE_SEQUENCE = {
    dojocat: ['rest', 'guard', 'rest', 'waddle_l', 'waddle_r', 'waddle_l', 'waddle_r', 'rest', 'head_bob_l', 'head_bob_r', 'rest', 'punch', 'rest', 'kick', 'rest', 'stomp', 'rest', 'crane', 'rest', 'head_nod_down', 'head_nod_up', 'rest', 'lunge', 'rest'],
    buu:     ['rest', 'wave', 'rest', 'waddle_l', 'waddle_r', 'rest', 'head_bob_l', 'head_bob_r', 'rest', 'flex', 'rest', 'punch', 'rest', 'head_nod_down', 'head_nod_up', 'rest', 'bless', 'rest', 'punch_forward', 'rest', 'guard', 'rest'],
    devit:   ['rest', 'punch', 'rest', 'waddle_l', 'waddle_r', 'waddle_l', 'waddle_r', 'rest', 'kick', 'rest', 'head_bob_l', 'head_bob_r', 'rest', 'stomp', 'rest', 'lunge', 'rest', 'head_nod_down', 'head_nod_up', 'rest', 'guard', 'rest', 'punch_forward', 'rest', 'wave', 'rest'],
    pixiu:   ['rest', 'bless', 'rest', 'waddle_l', 'waddle_r', 'rest', 'head_bob_l', 'head_bob_r', 'rest', 'crane', 'rest', 'head_nod_down', 'head_nod_up', 'rest', 'guard', 'rest', 'wave', 'rest', 'stomp', 'rest', 'kick', 'rest'],
  };
  // Multi-frame pose sequences per reaction — each is a sequence of pixel-art
  // poses cycled at 250ms intervals, so the pet visibly animates its body
  const REACTION_FRAMES = {
    kata:     ['rest', 'guard', 'punch', 'kick', 'stomp', 'guard', 'rest'],          // Train: martial combo
    hop:      ['rest', 'waddle_l', 'waddle_r', 'waddle_l', 'wave', 'flex', 'rest'],  // Play: waddle + fun
    bless:    ['rest', 'bless', 'crane', 'head_nod_down', 'head_nod_up', 'bless', 'rest'],  // Groom: graceful
    sway:     ['rest', 'head_bob_l', 'head_bob_r', 'rest'],                          // Rest: gentle head sway
    dart:     ['rest', 'lunge', 'kick', 'punch_forward', 'punch', 'lunge', 'rest'],  // Spar: aggressive
    swish:    ['rest', 'lunge', 'head_bob_l', 'crane', 'head_bob_r', 'lunge', 'rest'],  // Explore: scanning
    proud:    ['rest', 'flex', 'head_nod_up', 'flex', 'rest'],                       // Praise: puff up
    mischief: ['rest', 'punch', 'kick', 'stomp', 'punch', 'rest'],                   // Tease: wild
    nod:      ['rest', 'head_nod_down', 'head_nod_up', 'rest'],                      // Mission: calm nod
    swagger:  ['rest', 'flex', 'waddle_l', 'waddle_r', 'flex', 'rest'],              // Swagger: flex + waddle
    squish:   ['rest', 'head_nod_down', 'rest', 'wave', 'rest'],
    wobble:   ['rest', 'waddle_l', 'waddle_r', 'waddle_l', 'waddle_r', 'rest'],
    feeding:  ['rest', 'head_nod_down', 'rest'],                                     // Eating: chomping
    stomp_react: ['rest', 'stomp', 'stomp', 'rest'],                                 // Stomp reaction
  };
  const posePool = IDLE_POSE_SEQUENCE[character] || IDLE_POSE_SEQUENCE.dojocat;
  let currentPose;
  if (hasReaction || isEating || isTricking) {
    const reactionKey = reaction || actionState || (isEating ? 'feeding' : 'nod');
    const frames = REACTION_FRAMES[reactionKey] || REACTION_FRAMES.nod;
    currentPose = frames[Math.min(reactionFrame, frames.length - 1)];
  } else {
    currentPose = posePool[idleTick % posePool.length];
  }
  const blinkClass = blinkState ? 'sprite-blink' : '';

  // Derive body pose and head offset from the composite current pose
  const bodyPose = getBodyPose(currentPose);
  const [headDx, headDy] = getHeadOffset(currentPose);
  const featureFrame = tailFrame; // Buu tentacle sways with tail frame

  // Memoize all grid computations
  const layers = useMemo(() => {
    let baseShadow = '';
    let armsShadow = '';
    let featShadow = '';
    let faceShadow = '';
    let tailShadow = '';
    let headShadow = '';

    // Shadow ellipse (simple dark oval at feet)
    const shadowGrid = createGrid(GW, GH);
    const { w, bodyCy, legTop } = getBodyMetrics(weightState);
    fillEllipse(shadowGrid, CX, legTop + 7, Math.floor(w.bodyRx * 0.7), 2, 'X');
    const groundShadow = gridToShadow(shadowGrid, { X: 'rgba(0,0,0,0.15)' });

    // Clothing layers
    let hatShadow = '', topShadow = '', beltShadow2 = '', shoesShadow = '', foodShadow = '';

    // Base body — uses bodyPose (head_* poses → rest)
    const baseGrid = outlineGrid(buildBase(character, weightState, bodyPose));
    baseShadow = composeShadow(baseGrid, palette);

    // Head — shifted with headDx/headDy for bob/nod poses
    const headGrid = shiftGrid(outlineGrid(buildHead(character)), headDx, headDy);
    headShadow = composeShadow(headGrid, palette);

    // Arms — pose-dependent pixel frames (uses bodyPose)
    const armsGrid = outlineGrid(buildArms(character, weightState, bodyPose));
    armsShadow = composeShadow(armsGrid, palette);

    // Character features (ears, horns, tentacle) — shifted with head, animated with featureFrame
    const featGrid = shiftGrid(outlineGrid(buildFeatures(character, featureFrame)), headDx, headDy);
    featShadow = composeShadow(featGrid, palette);

    // Face / expression — shifted with head
    const faceGrid = shiftGrid(buildFace(character, mood, expression), headDx, headDy);
    faceShadow = composeShadow(faceGrid, palette);

    // Tail — frame-based wiggle animation
    const tailGrid = outlineGrid(buildTail(character, weightState, tailFrame));
    tailShadow = composeShadow(tailGrid, palette);

    const defaultHat = equippedHat ? null : iconicLook?.hat;
    const defaultTop = equippedTop ? null : iconicLook?.top;
    const defaultBelt = equippedBelt ? null : iconicLook?.belt;

    if (defaultHat) {
      // Hat shifts with head
      const hg = shiftGrid(outlineGrid(buildHat(defaultHat.id, defaultHat.color, character)), headDx, headDy);
      hatShadow = gridToShadow(hg, getClothingColorMap(defaultHat.color));
    }
    if (defaultTop) {
      const tg = outlineGrid(buildTop(defaultTop.id, defaultTop.color, weightState));
      topShadow = gridToShadow(tg, getClothingColorMap(defaultTop.color));
    }
    if (defaultBelt) {
      const bg = outlineGrid(buildBelt(defaultBelt.id, defaultBelt.color, weightState));
      beltShadow2 = gridToShadow(bg, getClothingColorMap(defaultBelt.color));
    }
    if (equippedHat) {
      const hg = shiftGrid(outlineGrid(buildHat(equippedHat, hatColor, character)), headDx, headDy);
      hatShadow = gridToShadow(hg, getClothingColorMap(hatColor));
    }
    if (equippedTop) {
      const tg = outlineGrid(buildTop(equippedTop, topColor, weightState));
      topShadow = gridToShadow(tg, getClothingColorMap(topColor));
    }
    if (equippedBelt) {
      const bg = outlineGrid(buildBelt(equippedBelt, beltColor, weightState));
      beltShadow2 = gridToShadow(bg, getClothingColorMap(beltColor));
    }
    if (equippedShoes) {
      const sg = outlineGrid(buildShoes(equippedShoes, shoesColor, weightState));
      shoesShadow = gridToShadow(sg, getClothingColorMap(shoesColor));
    }
    if (foodId) {
      const fg = buildFood(foodId);
      foodShadow = gridToShadow(fg, {
        '1': '#f6d17a',
        '2': '#d95c4f',
        W: '#ffffff',
      });
    }

    return { baseShadow, headShadow, armsShadow, featShadow, faceShadow, tailShadow, groundShadow, hatShadow, topShadow, beltShadow2, shoesShadow, foodShadow };
  }, [character, weightState, mood, expression, equippedHat, equippedBelt, equippedShoes, equippedTop, hatColor, beltColor, shoesColor, topColor, foodId, iconicLook, palette, bodyPose, headDx, headDy, tailFrame, featureFrame]);

  return (
    <div
      className={`pixel-pet-wrap ${className}`}
      style={{
        width: size,
        height: Math.ceil(size * renderedAspect),
        fontSize: `${pixelSize}px`,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <style>{PIXEL_ART_STYLES}</style>

      {/* Ground shadow */}
      <PixelLayer shadow={layers.groundShadow} />

      {/* Animated group */}
      <div className={blinkClass} style={{ position: 'absolute', inset: 0 }}>
        {/* Tail — frame-based pixel animation */}
        <PixelLayer shadow={layers.tailShadow} />

        {/* Base body */}
        <PixelLayer shadow={layers.baseShadow} />

        {/* Clothing: top */}
        {layers.topShadow && <PixelLayer shadow={layers.topShadow} />}

        {/* Clothing: belt */}
        {layers.beltShadow2 && <PixelLayer shadow={layers.beltShadow2} />}

        {/* Clothing: shoes */}
        {layers.shoesShadow && <PixelLayer shadow={layers.shoesShadow} />}

        {/* Head (in front of clothing, behind features) */}
        <PixelLayer shadow={layers.headShadow} />

        {/* Arms */}
        <PixelLayer shadow={layers.armsShadow} />

        {/* Features (ears, horns, mane) */}
        <PixelLayer shadow={layers.featShadow} />

        {/* Face (eyes, mouth) */}
        <PixelLayer shadow={layers.faceShadow} />

        {/* Hat (on top of everything) */}
        {layers.hatShadow && <PixelLayer shadow={layers.hatShadow} />}
      </div>

      {/* STOMP! action text */}
      {currentPose === 'stomp' && (
        <div style={{
          position: 'absolute',
          top: `${size * 0.02}px`,
          left: '50%',
          transform: 'translateX(-50%) rotate(-8deg)',
          fontFamily: 'monospace',
          fontWeight: 900,
          fontSize: `${Math.max(10, size / 8)}px`,
          color: '#ff4444',
          textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10,
          letterSpacing: '2px',
        }}>
          STOMP!
        </div>
      )}

      {layers.foodShadow && (
        <PixelLayer
          shadow={layers.foodShadow}
          className="pet-food"
          style={{ left: '50%', top: '0.5em' }}
        />
      )}
    </div>
  );
}

// Export for backward compat
const BODY_SHAPES = WEIGHT_DIMS;
export { PALETTES, BODY_SHAPES };

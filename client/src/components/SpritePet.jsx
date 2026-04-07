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
  starving: { bodyRx: 11, bodyRy: 9, limbW: 2, armLen: 4 },
  thin:     { bodyRx: 12, bodyRy: 10, limbW: 2, armLen: 5 },
  normal:   { bodyRx: 13, bodyRy: 11, limbW: 3, armLen: 5 },
  chubby:   { bodyRx: 14, bodyRy: 12, limbW: 3, armLen: 6 },
  fat:      { bodyRx: 15, bodyRy: 13, limbW: 3, armLen: 6 },
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
  const bodyCy = HEAD_CY + HEAD_RY + Math.floor(w.bodyRy * 0.94);
  const legHeight = Math.max(5, Math.min(7, Math.floor(w.bodyRy * 0.68)));
  const legSpread = Math.max(2, Math.floor(w.bodyRx * 0.45));
  const legTop = bodyCy + w.bodyRy - 1;
  return { w, bodyCy, legHeight, legSpread, legTop };
}


// ═══════════════════════════════════════════════════════════════
// 4. CHARACTER BODY BUILDERS
// ═══════════════════════════════════════════════════════════════

function buildBase(character, weightState) {
  const g = createGrid(GW, GH);
  const { w, bodyCy, legHeight, legSpread, legTop } = getBodyMetrics(weightState);

  // Head
  fillEllipse(g, CX, HEAD_CY, HEAD_RX, HEAD_RY, 'B');
  fillEllipse(g, CX - 3, HEAD_CY - 4, HEAD_RX - 6, HEAD_RY - 6, 'L');
  fillEllipse(g, CX + 3, HEAD_CY + 5, HEAD_RX - 10, HEAD_RY - 9, 'S');

  // Body
  fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, 'B');
  fillEllipse(g, CX - 1, bodyCy - 3, Math.max(8, w.bodyRx - 2), Math.max(6, w.bodyRy - 3), 'L');
  fillRect(g, CX - 6, bodyCy - w.bodyRy - 1, 13, 2, 'D');
  fillRect(g, CX - 4, bodyCy - w.bodyRy - 3, 9, 1, 'K');

  // Belly patch
  fillEllipse(g, CX, bodyCy + 2, Math.max(4, Math.floor(w.bodyRx * 0.5)), Math.max(3, Math.floor(w.bodyRy * 0.46)), 'Y');

  // Legs
  fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, legHeight, 'D');
  fillRect(g, CX + legSpread, legTop, w.limbW, legHeight, 'D');

  // Feet
  fillRect(g, CX - legSpread - w.limbW - 1, legTop + legHeight - 1, w.limbW + 2, 2, 'D');
  fillRect(g, CX + legSpread - 1, legTop + legHeight - 1, w.limbW + 2, 2, 'D');

  return g;
}

function buildArms(character, weightState) {
  const g = createGrid(GW, GH);
  const { w, bodyCy } = getBodyMetrics(weightState);

  // Arms as small ellipses beside the body
  const armY = bodyCy - Math.max(1, Math.floor(w.bodyRy * 0.55));
  fillEllipse(g, CX - w.bodyRx - 1, armY, 2, w.armLen, 'B');
  fillEllipse(g, CX + w.bodyRx + 1, armY, 2, w.armLen, 'B');

  // Hands (slightly darker)
  setPixel(g, CX - w.bodyRx - 1, armY + w.armLen, 'D');
  setPixel(g, CX + w.bodyRx + 1, armY + w.armLen, 'D');

  return g;
}

function buildFeatures(character) {
  const g = createGrid(GW, GH);
  const hcy = HEAD_CY;

  switch (character) {
    case 'dojocat': {
      fillTriangle(g, CX - 11, hcy - 2, CX - 17, hcy - HEAD_RY - 2, CX - 6, hcy - HEAD_RY + 3, 'B');
      fillTriangle(g, CX + 11, hcy - 2, CX + 17, hcy - HEAD_RY - 2, CX + 6, hcy - HEAD_RY + 3, 'B');
      fillTriangle(g, CX - 10, hcy - 3, CX - 14, hcy - HEAD_RY, CX - 7, hcy - HEAD_RY + 4, 'P');
      fillTriangle(g, CX + 10, hcy - 3, CX + 14, hcy - HEAD_RY, CX + 7, hcy - HEAD_RY + 4, 'P');
      fillTriangle(g, CX - 18, hcy + 7, CX - 14, hcy + 3, CX - 12, hcy + 10, 'B');
      fillTriangle(g, CX + 18, hcy + 7, CX + 14, hcy + 3, CX + 12, hcy + 10, 'B');
      fillRect(g, CX - 15, hcy + 5, 4, 1, 'R');
      fillRect(g, CX + 11, hcy + 5, 4, 1, 'R');
      fillRect(g, CX - 16, hcy + 8, 4, 1, 'R');
      fillRect(g, CX + 12, hcy + 8, 4, 1, 'R');
      break;
    }
    case 'buu': {
      fillLine(g, CX + 4, hcy - 2, CX + 7, hcy - 10, 'P');
      fillLine(g, CX + 7, hcy - 10, CX + 5, hcy - 18, 'P');
      fillLine(g, CX + 5, hcy - 18, CX + 1, hcy - 22, 'P');
      fillLine(g, CX + 1, hcy - 22, CX - 3, hcy - 21, 'P');
      setPixel(g, CX - 4, hcy - 20, 'P');
      fillEllipse(g, CX - 9, hcy + 7, 3, 2, 'H');
      fillEllipse(g, CX + 9, hcy + 7, 3, 2, 'H');
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
      fillTriangle(g, CX - 10, hcy - 3, CX - 15, hcy - HEAD_RY - 2, CX - 6, hcy - HEAD_RY + 2, 'B');
      fillTriangle(g, CX + 10, hcy - 3, CX + 15, hcy - HEAD_RY - 2, CX + 6, hcy - HEAD_RY + 2, 'B');
      fillTriangle(g, CX - 8, hcy - 4, CX - 11, hcy - HEAD_RY + 1, CX - 5, hcy - HEAD_RY + 4, 'R');
      fillTriangle(g, CX + 8, hcy - 4, CX + 11, hcy - HEAD_RY + 1, CX + 5, hcy - HEAD_RY + 4, 'R');
      fillCircle(g, CX - HEAD_RX + 2, hcy - 1, 3, 'P');
      fillCircle(g, CX + HEAD_RX - 2, hcy - 1, 3, 'P');
      fillCircle(g, CX - HEAD_RX + 3, hcy + 4, 3, 'P');
      fillCircle(g, CX + HEAD_RX - 3, hcy + 4, 3, 'P');
      fillTriangle(g, CX - 1, hcy - HEAD_RY + 2, CX, hcy - HEAD_RY - 4, CX + 1, hcy - HEAD_RY + 2, 'T');
      fillTriangle(g, CX - 11, hcy + 10, CX - 16, hcy + 5, CX - 12, hcy + 15, 'S');
      fillTriangle(g, CX + 11, hcy + 10, CX + 16, hcy + 5, CX + 12, hcy + 15, 'S');
      fillRect(g, CX - 9, hcy + 6, 2, 1, 'H');
      fillRect(g, CX + 7, hcy + 6, 2, 1, 'H');
      break;
    }
    default: break;
  }
  return g;
}

function buildTail(character, weightState) {
  const g = createGrid(GW, GH);
  const { w, bodyCy } = getBodyMetrics(weightState);

  if (character === 'devit') {
    // Devil tail - curvy line extending right
    const tx = CX + w.bodyRx;
    fillLine(g, tx, bodyCy + 1, tx + 3, bodyCy - 1, 'T');
    fillLine(g, tx + 3, bodyCy - 1, tx + 5, bodyCy + 1, 'T');
    // Tail tip (pointy)
    setPixel(g, tx + 5, bodyCy, 'T');
    setPixel(g, tx + 6, bodyCy, 'T');
  } else if (character === 'dojocat') {
    // Cat tail curving up
    const tx = CX + w.bodyRx;
    fillLine(g, tx, bodyCy + 2, tx + 2, bodyCy, 'T');
    fillLine(g, tx + 2, bodyCy, tx + 4, bodyCy - 2, 'T');
    setPixel(g, tx + 4, bodyCy - 3, 'B');
  } else if (character === 'pixiu') {
    // Fluffy tail
    const tx = CX + w.bodyRx;
    fillLine(g, tx, bodyCy + 1, tx + 2, bodyCy - 1, 'D');
    fillCircle(g, tx + 3, bodyCy - 2, 2, 'P');
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
        fillRect(g, leftEyeX - 1, eyeTop, 3, 7, eyeColor);
        setPixel(g, leftEyeX, eyeTop + 1, 'W');
        setPixel(g, leftEyeX, eyeTop + 3, 'W');
        fillRect(g, rightEyeX - 2, eyeTop + 3, 5, 1, eyeColor);
        fillLine(g, leftEyeX - 3, browTop + 2, leftEyeX + 1, browTop, 'K');
        fillLine(g, rightEyeX + 3, browTop + 1, rightEyeX - 2, browTop + 3, 'K');
        drawCatNose(g, noseY);
        drawCatMouth(g, noseY, 'smile');
      } else if (character === 'buu') {
        fillLine(g, leftEyeX - 3, hcy + 2, leftEyeX + 2, hcy + 1, eyeColor);
        fillLine(g, rightEyeX + 2, hcy + 2, rightEyeX - 3, hcy + 1, eyeColor);
        fillLine(g, leftEyeX - 4, browTop + 2, leftEyeX + 2, browTop + 3, 'K');
        fillLine(g, rightEyeX + 3, browTop + 2, rightEyeX - 2, browTop + 3, 'K');
        drawTinySmile(g, mouthY);
        setPixel(g, CX + 3, mouthY - 1, 'K');
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
      const cy = topY + 4;
      fillEllipse(g, CX, cy + 1, 9, 5, '1');
      fillEllipse(g, CX, cy - 1, 7, 4, '1');
      fillRect(g, CX - 9, cy + 3, 19, 2, '1');
      fillRect(g, CX - 11, cy + 4, 3, 2, '1');
      fillRect(g, CX + 8, cy + 4, 3, 2, '1');
      fillRect(g, CX - 8, cy + 5, 17, 1, '8');
      fillTriangle(g, CX - 2, cy - 10, CX, cy - 16, CX + 2, cy - 10, '8');
      fillTriangle(g, CX - 1, cy - 8, CX + 1, cy - 14, CX + 4, cy - 7, '8');
      fillRect(g, CX - 2, cy - 3, 5, 2, '5');
      setPixel(g, CX - 5, cy - 2, 'K');
      setPixel(g, CX + 5, cy - 2, 'K');
      fillRect(g, CX - 1, cy + 1, 3, 2, '8');
      setPixel(g, CX, cy + 3, '8');
      break;
    }
    case 'headband': {
      fillRect(g, CX - HEAD_RX + 1, HEAD_CY - HEAD_RY + 3, HEAD_RX * 2 - 1, 2, '1');
      // Circle emblem
      setPixel(g, CX, HEAD_CY - HEAD_RY + 3, '2');
      break;
    }
    case 'crown': {
      const cy = topY;
      fillRect(g, CX - 5, cy + 1, 11, 3, '1');
      // Crown points
      setPixel(g, CX - 4, cy, '1');
      setPixel(g, CX - 2, cy - 1, '1');
      setPixel(g, CX, cy - 2, '1');
      setPixel(g, CX + 2, cy - 1, '1');
      setPixel(g, CX + 4, cy, '1');
      // Gems
      setPixel(g, CX - 2, cy + 2, '2');
      setPixel(g, CX + 2, cy + 2, '3');
      setPixel(g, CX, cy + 2, '4');
      break;
    }
    case 'beanie': {
      const cy = topY;
      fillEllipse(g, CX, cy + 1, 7, 3, '1');
      fillRect(g, CX - 7, cy + 2, 15, 2, '1');
      // Pom pom
      fillCircle(g, CX, cy - 2, 2, '1');
      // Stripe
      fillRect(g, CX - 6, cy + 3, 13, 1, '2');
      break;
    }
    case 'wizard-hat': {
      const cy = topY;
      fillTriangle(g, CX - 7, cy + 4, CX, cy - 8, CX + 7, cy + 4, '1');
      fillRect(g, CX - 8, cy + 3, 17, 2, '1');
      // Stars
      setPixel(g, CX + 2, cy - 2, '2');
      setPixel(g, CX - 1, cy + 1, '2');
      setPixel(g, CX + 3, cy - 5, '2');
      break;
    }
    case 'party-hat': {
      const cy = topY;
      fillTriangle(g, CX - 4, cy + 3, CX, cy - 5, CX + 4, cy + 3, '1');
      // Pom pom top
      setPixel(g, CX, cy - 6, '2');
      setPixel(g, CX - 1, cy - 6, '2');
      // Stripes
      setPixel(g, CX - 2, cy + 1, '2');
      setPixel(g, CX + 1, cy - 1, '2');
      break;
    }
    case 'astronaut-helmet': {
      const cy = topY + 1;
      // Glass dome
      fillEllipse(g, CX, HEAD_CY, HEAD_R + 2, HEAD_R + 2, '1');
      fillEllipse(g, CX, HEAD_CY, HEAD_R + 1, HEAD_R + 1, null);
      // Visor shine
      setPixel(g, CX - HEAD_R, HEAD_CY - 2, '2');
      setPixel(g, CX - HEAD_R, HEAD_CY - 1, '2');
      break;
    }
    case 'goggles': {
      fillRect(g, CX - 6, HEAD_CY - 2, 5, 3, '1');
      fillRect(g, CX + 2, HEAD_CY - 2, 5, 3, '1');
      fillRect(g, CX - 5, HEAD_CY - 1, 3, 1, '2');
      fillRect(g, CX + 3, HEAD_CY - 1, 3, 1, '2');
      // Bridge
      fillRect(g, CX - 1, HEAD_CY - 1, 3, 1, '1');
      // Strap
      fillRect(g, CX - 7, HEAD_CY - 1, 1, 1, '1');
      fillRect(g, CX + 7, HEAD_CY - 1, 1, 1, '1');
      break;
    }
    case 'cat-hoodie': {
      // Hood covering head with cat ears on top
      fillEllipse(g, CX, HEAD_CY - 1, HEAD_R + 1, HEAD_R + 1, '1');
      // Cat ear tips on hood
      fillTriangle(g, CX - 6, HEAD_CY - 5, CX - 8, HEAD_CY - HEAD_R - 3, CX - 3, HEAD_CY - HEAD_R, '1');
      fillTriangle(g, CX + 6, HEAD_CY - 5, CX + 8, HEAD_CY - HEAD_R - 3, CX + 3, HEAD_CY - HEAD_R, '1');
      // Face opening (clear center)
      fillEllipse(g, CX, HEAD_CY + 1, HEAD_R - 2, HEAD_R - 2, null);
      break;
    }
    case 'ranger-helmet': {
      const cy = topY;
      fillEllipse(g, CX, HEAD_CY - 2, HEAD_R + 1, HEAD_R - 1, '1');
      // Visor
      fillRect(g, CX - 5, HEAD_CY - 1, 11, 2, '2');
      // Crest
      fillTriangle(g, CX - 1, cy - 2, CX, cy - 5, CX + 1, cy - 2, '1');
      break;
    }
    case 'santa-hat': {
      const cy = topY;
      fillTriangle(g, CX - 6, cy + 3, CX + 5, cy - 4, CX + 7, cy + 3, '1');
      // Brim
      fillRect(g, CX - 7, cy + 2, 15, 2, 'W');
      // Pom pom
      fillCircle(g, CX + 6, cy - 4, 2, 'W');
      break;
    }
    default: break;
  }
  return g;
}

function buildTop(topId, color, weightState) {
  const g = createGrid(GW, GH);
  const { w, bodyCy } = getBodyMetrics(weightState);

  switch (topId) {
    case 'denim-jacket': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      fillRect(g, CX - 4, bodyCy - w.bodyRy + 3, 9, w.bodyRy * 2 - 1, 'W');
      fillTriangle(g, CX - 4, bodyCy - w.bodyRy + 2, CX - 7, bodyCy - 1, CX - 1, bodyCy, '2');
      fillTriangle(g, CX + 4, bodyCy - w.bodyRy + 2, CX + 7, bodyCy - 1, CX + 1, bodyCy, '2');
      fillRect(g, CX - w.bodyRx + 1, bodyCy - 1, 3, 4, '2');
      fillRect(g, CX + w.bodyRx - 3, bodyCy - 1, 3, 4, '2');
      fillRect(g, CX - 6, bodyCy, 3, 2, '2');
      fillRect(g, CX + 3, bodyCy, 3, 2, '2');
      fillLine(g, CX, bodyCy - w.bodyRy + 3, CX, bodyCy + w.bodyRy - 1, '2');
      break;
    }
    case 'leather-jacket': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      fillRect(g, CX - 4, bodyCy - w.bodyRy + 3, 9, w.bodyRy * 2 - 2, 'W');
      fillTriangle(g, CX - 3, bodyCy - w.bodyRy + 1, CX - 7, bodyCy - 1, CX, bodyCy - 1, '2');
      fillTriangle(g, CX + 3, bodyCy - w.bodyRy + 1, CX + 7, bodyCy - 1, CX, bodyCy - 1, '2');
      fillRect(g, CX - w.bodyRx + 1, bodyCy - 1, 3, 5, '2');
      fillRect(g, CX + w.bodyRx - 3, bodyCy - 1, 3, 5, '2');
      fillLine(g, CX, bodyCy - w.bodyRy + 2, CX, bodyCy + w.bodyRy - 1, '2');
      break;
    }
    case 'lab-coat': {
      fillEllipse(g, CX, bodyCy, w.bodyRx + 1, w.bodyRy + 1, '1');
      // Pocket
      fillRect(g, CX + 1, bodyCy, 3, 2, '2');
      // Badge
      setPixel(g, CX - 3, bodyCy - w.bodyRy + 3, '3');
      setPixel(g, CX - 2, bodyCy - w.bodyRy + 3, '3');
      break;
    }
    case 'sailor-shirt': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Horizontal stripes
      for (let sy = bodyCy - w.bodyRy + 2; sy < bodyCy + w.bodyRy; sy += 2) {
        for (let sx = CX - w.bodyRx; sx <= CX + w.bodyRx; sx++) {
          if (sx >= 0 && sx < GW && sy >= 0 && sy < GH) {
            const dx = (sx - CX) / w.bodyRx, dy = (sy - bodyCy) / w.bodyRy;
            if (dx * dx + dy * dy <= 1) setPixel(g, sx, sy, '2');
          }
        }
      }
      break;
    }
    case 'dress': {
      // Dress that flares at bottom
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Flared skirt
      fillTriangle(g, CX - w.bodyRx - 2, bodyCy + w.bodyRy + 2, CX, bodyCy + 1, CX + w.bodyRx + 2, bodyCy + w.bodyRy + 2, '1');
      // Bow
      setPixel(g, CX - 1, bodyCy - w.bodyRy + 2, '2');
      setPixel(g, CX, bodyCy - w.bodyRy + 2, '2');
      setPixel(g, CX + 1, bodyCy - w.bodyRy + 2, '2');
      break;
    }
    case 'hoodie': {
      fillEllipse(g, CX, bodyCy, w.bodyRx + 1, w.bodyRy, '1');
      // Hood visible behind head
      fillEllipse(g, CX, HEAD_CY + HEAD_R, HEAD_R, 4, '1');
      // Front pocket
      fillRect(g, CX - 3, bodyCy + 1, 7, 2, '2');
      break;
    }
    case 'camo-vest': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Camo patches
      setPixel(g, CX - 3, bodyCy - 2, '2');
      setPixel(g, CX + 2, bodyCy, '2');
      setPixel(g, CX - 1, bodyCy + 2, '2');
      setPixel(g, CX + 4, bodyCy - 1, '3');
      setPixel(g, CX - 4, bodyCy + 1, '3');
      break;
    }
    case 'power-suit': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Chest emblem (diamond)
      setPixel(g, CX, bodyCy - 2, '2');
      setPixel(g, CX - 1, bodyCy - 1, '2');
      setPixel(g, CX + 1, bodyCy - 1, '2');
      setPixel(g, CX, bodyCy, '2');
      // Belt line
      fillRect(g, CX - w.bodyRx + 1, bodyCy + w.bodyRy - 3, w.bodyRx * 2 - 1, 1, '2');
      break;
    }
    case 'traditional-robe': {
      fillEllipse(g, CX, bodyCy, w.bodyRx + 1, w.bodyRy + 1, '1');
      fillLine(g, CX - 3, bodyCy - w.bodyRy + 1, CX + 1, bodyCy + 2, '2');
      fillLine(g, CX + 3, bodyCy - w.bodyRy + 1, CX - 1, bodyCy + 2, '2');
      fillRect(g, CX - 4, bodyCy - 1, 8, 2, '6');
      for (let i = -w.bodyRx; i <= w.bodyRx; i += 2) {
        const bx = CX + i, by = bodyCy + w.bodyRy;
        if (bx >= 0 && bx < GW && by >= 0 && by < GH) {
          const dx = i / w.bodyRx;
          if (dx * dx <= 1) setPixel(g, bx, by, '6');
        }
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
      // Belt across middle
      for (let x = CX - w.bodyRx + 1; x <= CX + w.bodyRx - 1; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) setPixel(g, x, beltY, '1');
      }
      // Buckle
      setPixel(g, CX - 1, beltY, '2');
      setPixel(g, CX, beltY, '2');
      setPixel(g, CX + 1, beltY, '2');
      break;
    }
    case 'chain-belt': {
      for (let x = CX - w.bodyRx + 2; x <= CX + w.bodyRx - 2; x += 2) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) setPixel(g, x, beltY, '1');
      }
      break;
    }
    case 'medal-chain': {
      fillLine(g, CX - 4, bodyCy - w.bodyRy + 1, CX - 1, bodyCy - 1, '6');
      fillLine(g, CX + 4, bodyCy - w.bodyRy + 1, CX + 1, bodyCy - 1, '6');
      fillRect(g, CX - 3, bodyCy, 7, 6, '6');
      fillRect(g, CX - 2, bodyCy + 1, 5, 4, 'K');
      fillRect(g, CX - 1, bodyCy + 2, 3, 2, '6');
      break;
    }
    case 'ribbon': {
      for (let x = CX - w.bodyRx + 1; x <= CX + w.bodyRx - 1; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) setPixel(g, x, beltY + 1, '1');
      }
      // Bow
      setPixel(g, CX + w.bodyRx - 2, beltY, '1');
      setPixel(g, CX + w.bodyRx - 1, beltY + 2, '1');
      break;
    }
    case 'sash': {
      // Diagonal sash
      fillLine(g, CX - w.bodyRx + 2, bodyCy - w.bodyRy + 2, CX + w.bodyRx - 2, bodyCy + w.bodyRy - 2, '1');
      fillLine(g, CX - w.bodyRx + 3, bodyCy - w.bodyRy + 2, CX + w.bodyRx - 1, bodyCy + w.bodyRy - 2, '1');
      // Medal
      setPixel(g, CX + w.bodyRx - 3, bodyCy + w.bodyRy - 3, '2');
      setPixel(g, CX + w.bodyRx - 2, bodyCy + w.bodyRy - 3, '2');
      break;
    }
    case 'utility-belt': {
      for (let x = CX - w.bodyRx + 1; x <= CX + w.bodyRx - 1; x++) {
        const dx = (x - CX) / w.bodyRx;
        if (dx * dx <= 1) {
          setPixel(g, x, beltY, '1');
          setPixel(g, x, beltY + 1, '1');
        }
      }
      // Pouches
      fillRect(g, CX - 4, beltY, 2, 2, '2');
      fillRect(g, CX + 3, beltY, 2, 2, '2');
      break;
    }
    default: break;
  }
  return g;
}

function buildShoes(shoeId, color, weightState) {
  const g = createGrid(GW, GH);
  const { w, legSpread, legTop } = getBodyMetrics(weightState);
  const footY = legTop + 4;

  switch (shoeId) {
    case 'sneakers': {
      fillRect(g, CX - legSpread - w.limbW, footY, w.limbW + 2, 2, '1');
      fillRect(g, CX + legSpread - 1, footY, w.limbW + 2, 2, '1');
      // Stripe
      setPixel(g, CX - legSpread - w.limbW + 1, footY, '2');
      setPixel(g, CX + legSpread, footY, '2');
      break;
    }
    case 'boots': {
      fillRect(g, CX - legSpread - w.limbW, footY - 2, w.limbW + 1, 4, '1');
      fillRect(g, CX + legSpread - 1, footY - 2, w.limbW + 1, 4, '1');
      // Boot tip extends forward
      setPixel(g, CX - legSpread - w.limbW - 1, footY + 1, '1');
      setPixel(g, CX + legSpread + w.limbW, footY + 1, '1');
      break;
    }
    case 'sandals': {
      fillRect(g, CX - legSpread - w.limbW, footY + 1, w.limbW + 1, 1, '1');
      fillRect(g, CX + legSpread - 1, footY + 1, w.limbW + 1, 1, '1');
      // Straps
      setPixel(g, CX - legSpread - 1, footY, '1');
      setPixel(g, CX + legSpread, footY, '1');
      break;
    }
    case 'dance-shoes': {
      fillRect(g, CX - legSpread - w.limbW, footY, w.limbW + 1, 2, '1');
      fillRect(g, CX + legSpread - 1, footY, w.limbW + 1, 2, '1');
      // Shine
      setPixel(g, CX - legSpread - w.limbW + 1, footY, 'W');
      setPixel(g, CX + legSpread, footY, 'W');
      break;
    }
    case 'power-boots': {
      fillRect(g, CX - legSpread - w.limbW - 1, footY - 2, w.limbW + 2, 5, '1');
      fillRect(g, CX + legSpread - 1, footY - 2, w.limbW + 2, 5, '1');
      // Accent stripe
      setPixel(g, CX - legSpread - w.limbW, footY - 1, '2');
      setPixel(g, CX + legSpread, footY - 1, '2');
      break;
    }
    case 'cat-slippers': {
      fillRect(g, CX - legSpread - w.limbW, footY, w.limbW + 2, 2, '1');
      fillRect(g, CX + legSpread - 1, footY, w.limbW + 2, 2, '1');
      // Little ears
      setPixel(g, CX - legSpread - w.limbW, footY - 1, '1');
      setPixel(g, CX - legSpread - w.limbW + 2, footY - 1, '1');
      setPixel(g, CX + legSpread - 1, footY - 1, '1');
      setPixel(g, CX + legSpread + 1, footY - 1, '1');
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
  @keyframes petBreathe {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-0.4em); }
  }
  @keyframes dojoIdle {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    35% { transform: translateY(-0.35em) rotate(-1deg); }
    70% { transform: translateY(-0.15em) rotate(1deg); }
  }
  @keyframes buuIdle {
    0%, 100% { transform: translateY(0) scale(1, 1); }
    50% { transform: translateY(-0.25em) scale(1.03, 0.98); }
  }
  @keyframes devitIdle {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    40% { transform: translateY(-0.55em) rotate(-2deg); }
    80% { transform: translateY(-0.1em) rotate(2deg); }
  }
  @keyframes pixiuIdle {
    0%, 100% { transform: translateY(0) translateX(0); }
    50% { transform: translateY(-0.3em) translateX(0.2em); }
  }
  @keyframes petBounce {
    0%, 100% { transform: translateY(0) scaleY(1); }
    25% { transform: translateY(-1.5em) scaleY(1.05); }
    50% { transform: translateY(0) scaleY(0.92); }
    75% { transform: translateY(-0.5em) scaleY(1); }
  }
  @keyframes petSpin {
    0% { transform: rotate(0deg); }
    25% { transform: rotate(10deg) translateY(-1em); }
    50% { transform: rotate(0deg) translateY(-2em); }
    75% { transform: rotate(-10deg) translateY(-1em); }
    100% { transform: rotate(0deg); }
  }
  @keyframes petKata {
    0% { transform: translateY(0) rotate(0deg) scale(1); }
    30% { transform: translateY(-0.8em) rotate(-4deg) scale(1.04); }
    60% { transform: translateY(-0.2em) rotate(4deg) scale(1.01); }
    100% { transform: translateY(0) rotate(0deg) scale(1); }
  }
  @keyframes petProud {
    0%, 100% { transform: translateY(0) scale(1); }
    35% { transform: translateY(-0.55em) scale(1.04, 1.02); }
    70% { transform: translateY(-0.15em) scale(1.01); }
  }
  @keyframes petSwish {
    0%, 100% { transform: translateX(0) rotate(0deg); }
    35% { transform: translateX(-0.35em) rotate(-3deg); }
    65% { transform: translateX(0.35em) rotate(3deg); }
  }
  @keyframes petBuuSquish {
    0%, 100% { transform: translateY(0) scale(1, 1); }
    30% { transform: translateY(0.15em) scale(1.08, 0.92); }
    65% { transform: translateY(-0.3em) scale(0.96, 1.04); }
  }
  @keyframes petBuuWobble {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(-0.2em) rotate(-4deg); }
    50% { transform: translateY(0.05em) rotate(4deg); }
    75% { transform: translateY(-0.15em) rotate(-2deg); }
  }
  @keyframes petSwagger {
    0%, 100% { transform: translateX(0) scale(1); }
    35% { transform: translateX(-0.45em) scale(1.03); }
    70% { transform: translateX(0.45em) scale(1.03); }
  }
  @keyframes petDevitHop {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    30% { transform: translateY(-1.15em) rotate(-6deg); }
    60% { transform: translateY(-0.15em) rotate(6deg); }
  }
  @keyframes petDart {
    0%, 100% { transform: translateX(0) rotate(0deg); }
    30% { transform: translateX(-0.8em) rotate(-5deg); }
    55% { transform: translateX(0.8em) rotate(5deg); }
    75% { transform: translateX(-0.2em) rotate(-2deg); }
  }
  @keyframes petMischief {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    20% { transform: translateY(-0.3em) rotate(-5deg); }
    45% { transform: translateY(-0.15em) rotate(5deg); }
    70% { transform: translateY(-0.35em) rotate(-3deg); }
  }
  @keyframes petPixiuBless {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    35% { transform: translateY(-0.55em) rotate(-2deg); }
    70% { transform: translateY(-0.15em) rotate(2deg); }
  }
  @keyframes petSway {
    0%, 100% { transform: translateX(0) rotate(0deg); }
    35% { transform: translateX(-0.3em) rotate(-2deg); }
    70% { transform: translateX(0.3em) rotate(2deg); }
  }
  @keyframes petNod {
    0%, 100% { transform: translateY(0) scaleY(1); }
    35% { transform: translateY(0.15em) scaleY(0.98); }
    65% { transform: translateY(-0.25em) scaleY(1.02); }
  }
  @keyframes tailWag {
    0%, 100% { transform: scaleX(1); }
    50% { transform: scaleX(-1); }
  }
  @keyframes petFoodTravel {
    0% { transform: translate(-6em, 9em) scale(0.7); opacity: 0; }
    15% { opacity: 1; }
    65% { transform: translate(-1.4em, 3.8em) scale(1); opacity: 1; }
    100% { transform: translate(0.1em, 2.6em) scale(0.25); opacity: 0; }
  }
  .pet-breathe { animation: petBreathe 3s ease-in-out infinite; }
  .pet-eating { animation: petBounce 0.6s ease-in-out infinite; }
  .pet-tricking { animation: petSpin 1s ease-in-out infinite; }
  .pet-tail { animation: tailWag 2s ease-in-out infinite; }
  .pet-idle-dojocat { animation: dojoIdle 3.4s cubic-bezier(0.22, 1, 0.36, 1) infinite; }
  .pet-idle-buu { animation: buuIdle 3.1s cubic-bezier(0.25, 1, 0.5, 1) infinite; }
  .pet-idle-devit { animation: devitIdle 2.7s cubic-bezier(0.22, 1, 0.36, 1) infinite; }
  .pet-idle-pixiu { animation: pixiuIdle 3.8s cubic-bezier(0.25, 1, 0.5, 1) infinite; }
  .pet-react-dojocat, .pet-react-kata { animation: petKata 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-proud { animation: petProud 760ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-swish { animation: petSwish 720ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-buu, .pet-react-squish { animation: petBuuSquish 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-wobble { animation: petBuuWobble 760ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-swagger { animation: petSwagger 720ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-devit, .pet-react-hop { animation: petDevitHop 650ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-dart { animation: petDart 620ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-mischief { animation: petMischief 720ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-pixiu, .pet-react-bless { animation: petPixiuBless 800ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-sway { animation: petSway 820ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-nod { animation: petNod 640ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-food {
    animation: petFoodTravel 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    transform-origin: center center;
  }
  @media (prefers-reduced-motion: reduce) {
    .pixel-pet-wrap *,
    .pixel-pet-wrap {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;


// ═══════════════════════════════════════════════════════════════
// 9. PIXEL LAYER COMPONENT
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
// 10. MAIN COMPONENT
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
  size = 140,
  className = '',
  onClick,
}) {
  const palette = PALETTES[character] || PALETTES.dojocat;
  const pixelSize = size / GW;
  const iconicLook = DEFAULT_ICONIC_LOOKS[character] || null;
  const hasReaction = !!reaction && !isEating && !isTricking;
  const renderedAspect = GH / GW;

  // Memoize all grid computations
  const layers = useMemo(() => {
    let baseShadow = '';
    let armsShadow = '';
    let featShadow = '';
    let faceShadow = '';
    let tailShadow = '';

    // Shadow ellipse (simple dark oval at feet)
    const shadowGrid = createGrid(GW, GH);
    const { w, bodyCy, legTop } = getBodyMetrics(weightState);
    fillEllipse(shadowGrid, CX, legTop + 7, Math.floor(w.bodyRx * 0.7), 2, 'X');
    const groundShadow = gridToShadow(shadowGrid, { X: 'rgba(0,0,0,0.15)' });

    // Clothing layers
    let hatShadow = '', topShadow = '', beltShadow2 = '', shoesShadow = '', foodShadow = '';

    // Base body
    const baseGrid = outlineGrid(buildBase(character, weightState));
    baseShadow = composeShadow(baseGrid, palette);

    // Arms
    const armsGrid = outlineGrid(buildArms(character, weightState));
    armsShadow = composeShadow(armsGrid, palette);

    // Character features (ears, horns, etc)
    const featGrid = outlineGrid(buildFeatures(character));
    featShadow = composeShadow(featGrid, palette);

    // Face / expression
    const faceGrid = buildFace(character, mood, expression);
    faceShadow = composeShadow(faceGrid, palette);

    // Tail
    const tailGrid = outlineGrid(buildTail(character, weightState));
    tailShadow = composeShadow(tailGrid, palette);

    const defaultHat = equippedHat ? null : iconicLook?.hat;
    const defaultTop = equippedTop ? null : iconicLook?.top;
    const defaultBelt = equippedBelt ? null : iconicLook?.belt;

    if (defaultHat) {
      const hg = outlineGrid(buildHat(defaultHat.id, defaultHat.color, character));
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
      const hg = outlineGrid(buildHat(equippedHat, hatColor, character));
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

    return { baseShadow, armsShadow, featShadow, faceShadow, tailShadow, groundShadow, hatShadow, topShadow, beltShadow2, shoesShadow, foodShadow };
  }, [character, weightState, mood, expression, equippedHat, equippedBelt, equippedShoes, equippedTop, hatColor, beltColor, shoesColor, topColor, foodId, iconicLook, palette]);

  const idleClass = `pet-idle-${character}`;
  const reactionClass = hasReaction
    ? (
      ['dojocat', 'buu', 'devit', 'pixiu'].includes(character)
        ? `pet-react-${reaction}`
        : ''
    )
    : '';
  const animClass = isTricking
    ? 'pet-tricking'
    : isEating
      ? 'pet-eating'
      : hasReaction
        ? reactionClass
        : idleClass;

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
      <div className={animClass} style={{ position: 'absolute', inset: 0 }}>
        {/* Tail */}
        <PixelLayer shadow={layers.tailShadow} className="pet-tail" />

        {/* Base body */}
        <PixelLayer shadow={layers.baseShadow} />

        {/* Clothing: top */}
        {layers.topShadow && <PixelLayer shadow={layers.topShadow} />}

        {/* Clothing: belt */}
        {layers.beltShadow2 && <PixelLayer shadow={layers.beltShadow2} />}

        {/* Clothing: shoes */}
        {layers.shoesShadow && <PixelLayer shadow={layers.shoesShadow} />}

        {/* Arms */}
        <PixelLayer shadow={layers.armsShadow} />

        {/* Features (ears, horns, mane) */}
        <PixelLayer shadow={layers.featShadow} />

        {/* Face (eyes, mouth) */}
        <PixelLayer shadow={layers.faceShadow} />

        {/* Hat (on top of everything) */}
        {layers.hatShadow && <PixelLayer shadow={layers.hatShadow} />}
      </div>

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

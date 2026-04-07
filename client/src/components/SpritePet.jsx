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
    B: '#f5a623',  // body orange
    D: '#d4841a',  // dark shade
    L: '#ffe082',  // light
    Y: '#fff3d0',  // belly
    E: '#2d2d2d',  // eyes
    W: '#ffffff',  // white
    N: '#ff6b9d',  // nose pink
    H: '#ff9eb5',  // blush
    P: '#ffcdd2',  // ear inner
    K: '#1a1a1a',  // outline
    T: '#c48a1a',  // tail dark
    S: '#f0c27a',  // skin lighter
    R: '#d4841a',  // whisker mark
  },
  buu: {
    B: '#f4b8a8',  // body peach/pink skin
    D: '#d4978a',  // dark shade
    L: '#ffe0d6',  // light
    Y: '#ffe8e0',  // belly
    E: '#2d2d2d',  // eyes
    W: '#ffffff',  // white
    N: '#e07070',  // nose/mouth
    H: '#f48fb1',  // blush pink
    P: '#5d4037',  // hair brown
    K: '#1a1a1a',  // outline
    T: '#d4978a',  // unused
    S: '#fce4ec',  // highlight
    R: '#f4b8a8',  // cheek
  },
  devit: {
    B: '#f5f5f5',  // body white
    D: '#e0e0e0',  // dark shade
    L: '#ffffff',  // light
    Y: '#fafafa',  // belly
    E: '#e53935',  // eyes RED
    W: '#ffffff',  // white highlight
    N: '#ffcdd2',  // nose light pink
    H: '#ffcdd2',  // blush
    P: '#e53935',  // horns RED
    K: '#333333',  // outline
    T: '#e53935',  // tail red
    S: '#b3e5fc',  // scarf light blue
    R: '#e0e0e0',  // shadow
  },
  pixiu: {
    B: '#fff9e0',  // body cream/light gold
    D: '#ffd54f',  // dark gold
    L: '#fffde7',  // light
    Y: '#ffffff',  // belly white
    E: '#6d4c41',  // eyes brown
    W: '#ffffff',  // white
    N: '#ffab91',  // nose peach
    H: '#ffccbc',  // blush
    P: '#ff8f00',  // mane orange
    K: '#5d4037',  // outline
    T: '#ffca28',  // horn gold
    S: '#ffe082',  // wing gold
    R: '#e91e63',  // ornament pink
  },
};

// ═══════════════════════════════════════════════════════════════
// 3. BODY DIMENSIONS PER WEIGHT STATE
// ═══════════════════════════════════════════════════════════════

const WEIGHT_DIMS = {
  starving: { bodyRx: 5,  bodyRy: 4,  limbW: 2, armLen: 4 },
  thin:     { bodyRx: 6,  bodyRy: 5,  limbW: 2, armLen: 5 },
  normal:   { bodyRx: 7,  bodyRy: 6,  limbW: 2, armLen: 5 },
  chubby:   { bodyRx: 9,  bodyRy: 7,  limbW: 3, armLen: 5 },
  fat:      { bodyRx: 11, bodyRy: 9,  limbW: 3, armLen: 6 },
};

// Grid size constants
const GW = 28;    // grid width
const GH = 34;    // grid height
const CX = 14;    // center x
const HEAD_CY = 9; // head center y
const HEAD_R = 7;  // head radius


// ═══════════════════════════════════════════════════════════════
// 4. CHARACTER BODY BUILDERS
// ═══════════════════════════════════════════════════════════════

function buildBase(character, weightState) {
  const g = createGrid(GW, GH);
  const w = WEIGHT_DIMS[weightState] || WEIGHT_DIMS.normal;
  const bodyCy = HEAD_CY + HEAD_R + w.bodyRy;

  // Head
  fillCircle(g, CX, HEAD_CY, HEAD_R, 'B');

  // Body
  fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, 'B');

  // Belly patch
  fillEllipse(g, CX, bodyCy + 1, Math.floor(w.bodyRx * 0.6), Math.floor(w.bodyRy * 0.55), 'Y');

  // Legs
  const legSpread = Math.max(2, Math.floor(w.bodyRx * 0.45));
  const legTop = bodyCy + w.bodyRy - 1;
  fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, 5, 'D');
  fillRect(g, CX + legSpread, legTop, w.limbW, 5, 'D');

  // Feet
  fillRect(g, CX - legSpread - w.limbW, legTop + 4, w.limbW + 1, 2, 'D');
  fillRect(g, CX + legSpread - 1, legTop + 4, w.limbW + 1, 2, 'D');

  return g;
}

function buildArms(character, weightState) {
  const g = createGrid(GW, GH);
  const w = WEIGHT_DIMS[weightState] || WEIGHT_DIMS.normal;
  const bodyCy = HEAD_CY + HEAD_R + w.bodyRy;

  // Arms as small ellipses beside the body
  const armY = bodyCy - 1;
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
      // Pointy ears (outer)
      fillTriangle(g, CX - 7, hcy - 3, CX - 9, hcy - HEAD_R - 4, CX - 3, hcy - HEAD_R + 1, 'B');
      fillTriangle(g, CX + 7, hcy - 3, CX + 9, hcy - HEAD_R - 4, CX + 3, hcy - HEAD_R + 1, 'B');
      // Ear inner
      fillTriangle(g, CX - 6, hcy - 4, CX - 8, hcy - HEAD_R - 2, CX - 4, hcy - HEAD_R + 1, 'P');
      fillTriangle(g, CX + 6, hcy - 4, CX + 8, hcy - HEAD_R - 2, CX + 4, hcy - HEAD_R + 1, 'P');
      // Nose + muzzle
      setPixel(g, CX, hcy + 2, 'N');
      setPixel(g, CX - 1, hcy + 1, 'N');
      setPixel(g, CX + 1, hcy + 1, 'N');
      fillRect(g, CX - 2, hcy + 2, 5, 2, 'L');
      // Whisker marks
      setPixel(g, CX - 4, hcy + 2, 'R');
      setPixel(g, CX + 4, hcy + 2, 'R');
      setPixel(g, CX - 5, hcy + 1, 'R');
      setPixel(g, CX + 5, hcy + 1, 'R');
      setPixel(g, CX - 6, hcy + 2, 'R');
      setPixel(g, CX + 6, hcy + 2, 'R');
      break;
    }
    case 'buu': {
      // Signature antenna curl
      fillLine(g, CX + 1, hcy - 6, CX + 3, hcy - 9, 'P');
      fillLine(g, CX + 3, hcy - 9, CX + 2, hcy - 12, 'P');
      fillLine(g, CX + 2, hcy - 12, CX - 1, hcy - 12, 'P');
      setPixel(g, CX - 2, hcy - 12, 'P');
      // Rosy cheeks (always visible)
      fillRect(g, CX - 6, hcy + 2, 2, 2, 'H');
      fillRect(g, CX + 5, hcy + 2, 2, 2, 'H');
      // Buu nose + mouth tint
      fillRect(g, CX - 1, hcy + 1, 3, 2, 'N');
      break;
    }
    case 'devit': {
      // Red horns
      fillTriangle(g, CX - 5, hcy - 4, CX - 7, hcy - HEAD_R - 5, CX - 3, hcy - HEAD_R - 1, 'P');
      fillTriangle(g, CX + 5, hcy - 4, CX + 7, hcy - HEAD_R - 5, CX + 3, hcy - HEAD_R - 1, 'P');
      // Scarf/collar (light blue)
      fillRect(g, CX - 4, hcy + HEAD_R - 1, 9, 2, 'S');
      // Blush
      fillRect(g, CX - 5, hcy + 2, 2, 1, 'H');
      fillRect(g, CX + 4, hcy + 2, 2, 1, 'H');
      break;
    }
    case 'pixiu': {
      // Cat ears
      fillTriangle(g, CX - 6, hcy - 3, CX - 8, hcy - HEAD_R - 3, CX - 3, hcy - HEAD_R + 1, 'B');
      fillTriangle(g, CX + 6, hcy - 3, CX + 8, hcy - HEAD_R - 3, CX + 3, hcy - HEAD_R + 1, 'B');
      // Ear inner
      fillTriangle(g, CX - 5, hcy - 4, CX - 7, hcy - HEAD_R - 1, CX - 4, hcy - HEAD_R + 1, 'R');
      fillTriangle(g, CX + 5, hcy - 4, CX + 7, hcy - HEAD_R - 1, CX + 4, hcy - HEAD_R + 1, 'R');
      // Mane tufts (golden)
      fillCircle(g, CX - HEAD_R + 1, hcy - 3, 2, 'P');
      fillCircle(g, CX + HEAD_R - 1, hcy - 3, 2, 'P');
      fillCircle(g, CX - HEAD_R, hcy, 2, 'P');
      fillCircle(g, CX + HEAD_R, hcy, 2, 'P');
      // Horn (golden)
      fillTriangle(g, CX - 1, hcy - HEAD_R + 1, CX, hcy - HEAD_R - 4, CX + 1, hcy - HEAD_R + 1, 'T');
      setPixel(g, CX, hcy - HEAD_R - 3, 'T');
      // Wings (small, on body sides)
      const wg = WEIGHT_DIMS.normal;
      const bcy = HEAD_CY + HEAD_R + wg.bodyRy;
      fillTriangle(g, CX - wg.bodyRx, bcy - 3, CX - wg.bodyRx - 4, bcy - 5, CX - wg.bodyRx - 3, bcy, 'S');
      fillTriangle(g, CX + wg.bodyRx, bcy - 3, CX + wg.bodyRx + 4, bcy - 5, CX + wg.bodyRx + 3, bcy, 'S');
      // Nose
      setPixel(g, CX, hcy + 1, 'N');
      fillRect(g, CX - 1, hcy + 1, 3, 2, 'L');
      // Blush
      fillRect(g, CX - 5, hcy + 2, 2, 1, 'H');
      fillRect(g, CX + 4, hcy + 2, 2, 1, 'H');
      break;
    }
    default: break;
  }
  return g;
}

function buildTail(character, weightState) {
  const g = createGrid(GW, GH);
  const w = WEIGHT_DIMS[weightState] || WEIGHT_DIMS.normal;
  const bodyCy = HEAD_CY + HEAD_R + w.bodyRy;

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

function drawSmile(g, hcy, width = 2, color = 'K') {
  setPixel(g, CX - width, hcy + 3, color);
  setPixel(g, CX - 1, hcy + 4, color);
  setPixel(g, CX, hcy + 4, color);
  setPixel(g, CX + 1, hcy + 4, color);
  setPixel(g, CX + width, hcy + 3, color);
}

function buildFace(character, mood, expression = '') {
  const g = createGrid(GW, GH);
  const hcy = HEAD_CY;
  const eyeColor = 'E';

  if (expression === 'wink') {
    fillRect(g, CX - 5, hcy, 4, 1, eyeColor);
    fillRect(g, CX + 3, hcy - 1, 2, 3, eyeColor);
    setPixel(g, CX + 4, hcy - 1, 'W');
    drawSmile(g, hcy, 2);
    return g;
  }

  if (expression === 'smirk' || expression === 'proud') {
    fillRect(g, CX - 5, hcy, 3, 1, eyeColor);
    fillRect(g, CX + 2, hcy - 1, 3, 1, eyeColor);
    setPixel(g, CX - 5, hcy - 1, 'K');
    setPixel(g, CX + 4, hcy - 2, 'K');
    setPixel(g, CX - 1, hcy + 3, 'K');
    setPixel(g, CX, hcy + 4, 'K');
    setPixel(g, CX + 1, hcy + 4, 'K');
    setPixel(g, CX + 2, hcy + 4, 'K');
    return g;
  }

  if (expression === 'excited' || expression === 'sparkle') {
    fillRect(g, CX - 4, hcy - 2, 2, 4, eyeColor);
    fillRect(g, CX + 3, hcy - 2, 2, 4, eyeColor);
    setPixel(g, CX - 3, hcy - 2, 'W');
    setPixel(g, CX + 4, hcy - 2, 'W');
    setPixel(g, CX - 3, hcy + 2, 'W');
    setPixel(g, CX + 4, hcy + 2, 'W');
    drawSmile(g, hcy, 2);
    return g;
  }

  if (expression === 'soft') {
    fillRect(g, CX - 4, hcy, 3, 1, eyeColor);
    fillRect(g, CX + 2, hcy, 3, 1, eyeColor);
    drawSmile(g, hcy, 1);
    return g;
  }

  if (expression === 'grin') {
    fillRect(g, CX - 4, hcy - 1, 2, 3, eyeColor);
    fillRect(g, CX + 3, hcy - 1, 2, 3, eyeColor);
    setPixel(g, CX - 3, hcy - 1, 'W');
    setPixel(g, CX + 4, hcy - 1, 'W');
    fillRect(g, CX - 2, hcy + 3, 5, 2, 'W');
    fillRect(g, CX - 2, hcy + 3, 5, 1, 'K');
    return g;
  }

  if (expression === 'eating') {
    fillRect(g, CX - 5, hcy, 3, 1, eyeColor);
    fillRect(g, CX + 2, hcy, 3, 1, eyeColor);
    fillRect(g, CX - 1, hcy + 3, 3, 2, 'N');
    setPixel(g, CX - 2, hcy + 4, 'K');
    setPixel(g, CX + 2, hcy + 4, 'K');
    return g;
  }

  switch (mood) {
    case 'desperate': {
      // Teary big eyes
      fillRect(g, CX - 4, hcy - 2, 2, 3, eyeColor);
      fillRect(g, CX + 3, hcy - 2, 2, 3, eyeColor);
      setPixel(g, CX - 3, hcy - 2, 'W');
      setPixel(g, CX + 4, hcy - 2, 'W');
      // Tear drops
      setPixel(g, CX - 3, hcy + 2, 'S');
      setPixel(g, CX + 4, hcy + 2, 'S');
      if (character !== 'devit') {
        setPixel(g, CX - 3, hcy + 3, 'S');
        setPixel(g, CX + 4, hcy + 3, 'S');
      }
      // Frown
      setPixel(g, CX - 1, hcy + 4, 'K');
      setPixel(g, CX, hcy + 3, 'K');
      setPixel(g, CX + 1, hcy + 4, 'K');
      break;
    }
    case 'hungry': {
      // Sad/worried eyes
      fillRect(g, CX - 4, hcy - 1, 2, 2, eyeColor);
      fillRect(g, CX + 3, hcy - 1, 2, 2, eyeColor);
      setPixel(g, CX - 3, hcy - 1, 'W');
      setPixel(g, CX + 4, hcy - 1, 'W');
      // Worried brows
      setPixel(g, CX - 5, hcy - 3, 'K');
      setPixel(g, CX - 4, hcy - 4, 'K');
      setPixel(g, CX + 5, hcy - 3, 'K');
      setPixel(g, CX + 4, hcy - 4, 'K');
      // Pout mouth (small o)
      setPixel(g, CX, hcy + 4, 'N');
      setPixel(g, CX - 1, hcy + 4, 'N');
      setPixel(g, CX + 1, hcy + 4, 'N');
      break;
    }
    case 'content': {
      // Half-closed relaxed eyes
      fillRect(g, CX - 4, hcy, 3, 1, eyeColor);
      fillRect(g, CX + 2, hcy, 3, 1, eyeColor);
      // Content smirk
      setPixel(g, CX - 1, hcy + 3, 'K');
      setPixel(g, CX, hcy + 4, 'K');
      setPixel(g, CX + 1, hcy + 3, 'K');
      setPixel(g, CX + 2, hcy + 3, 'K');
      // Blush
      if (character !== 'devit') {
        fillRect(g, CX - 6, hcy + 1, 2, 1, 'H');
        fillRect(g, CX + 5, hcy + 1, 2, 1, 'H');
      }
      break;
    }
    case 'stuffed': {
      // Closed happy eyes (^ ^)
      setPixel(g, CX - 4, hcy, 'K');
      setPixel(g, CX - 3, hcy - 1, 'K');
      setPixel(g, CX - 2, hcy, 'K');
      setPixel(g, CX + 2, hcy, 'K');
      setPixel(g, CX + 3, hcy - 1, 'K');
      setPixel(g, CX + 4, hcy, 'K');
      // Full satisfied smile
      setPixel(g, CX - 2, hcy + 3, 'K');
      setPixel(g, CX - 1, hcy + 4, 'K');
      setPixel(g, CX, hcy + 4, 'K');
      setPixel(g, CX + 1, hcy + 4, 'K');
      setPixel(g, CX + 2, hcy + 3, 'K');
      // Heavy blush
      fillRect(g, CX - 6, hcy + 1, 2, 2, 'H');
      fillRect(g, CX + 5, hcy + 1, 2, 2, 'H');
      break;
    }
    default: { // happy
      if (character === 'buu') {
        fillRect(g, CX - 5, hcy, 3, 1, eyeColor);
        fillRect(g, CX + 3, hcy, 3, 1, eyeColor);
        setPixel(g, CX - 5, hcy - 1, eyeColor);
        setPixel(g, CX + 5, hcy - 1, eyeColor);
        setPixel(g, CX - 1, hcy + 4, 'K');
        setPixel(g, CX, hcy + 3, 'K');
        setPixel(g, CX + 1, hcy + 3, 'K');
        setPixel(g, CX + 2, hcy + 4, 'K');
      } else if (character === 'pixiu') {
        fillRect(g, CX - 4, hcy - 1, 2, 3, eyeColor);
        fillRect(g, CX + 3, hcy - 1, 2, 3, eyeColor);
        setPixel(g, CX - 3, hcy - 1, 'W');
        setPixel(g, CX + 4, hcy - 1, 'W');
        setPixel(g, CX - 3, hcy + 1, 'W');
        setPixel(g, CX + 4, hcy + 1, 'W');
        drawSmile(g, hcy, 1);
      } else {
        fillRect(g, CX - 4, hcy - 1, 2, 3, eyeColor);
        fillRect(g, CX + 3, hcy - 1, 2, 3, eyeColor);
        setPixel(g, CX - 3, hcy - 1, 'W');
        setPixel(g, CX + 4, hcy - 1, 'W');
        drawSmile(g, hcy, character === 'devit' ? 1 : 2);
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
  const topY = character === 'devit' ? HEAD_CY - HEAD_R - 5 : HEAD_CY - HEAD_R - 1;

  switch (hatId) {
    case 'chicken-hat': {
      // Chicken body sitting on head
      const cy = topY - 2;
      fillEllipse(g, CX, cy, 5, 3, '1'); // chicken body
      fillEllipse(g, CX, cy - 1, 4, 2, '1'); // upper body
      // Red comb
      setPixel(g, CX - 1, cy - 4, '2');
      setPixel(g, CX, cy - 5, '2');
      setPixel(g, CX + 1, cy - 4, '2');
      setPixel(g, CX + 2, cy - 5, '2');
      // Orange beak
      setPixel(g, CX + 5, cy - 1, '3');
      setPixel(g, CX + 6, cy, '3');
      // Eye
      setPixel(g, CX + 3, cy - 1, 'K');
      setPixel(g, CX + 3, cy - 2, 'W');
      // Pink wattle
      setPixel(g, CX + 4, cy + 1, '4');
      break;
    }
    case 'headband': {
      fillRect(g, CX - HEAD_R, HEAD_CY - HEAD_R + 2, HEAD_R * 2 + 1, 2, '1');
      // Circle emblem
      setPixel(g, CX, HEAD_CY - HEAD_R + 2, '2');
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
  const w = WEIGHT_DIMS[weightState] || WEIGHT_DIMS.normal;
  const bodyCy = HEAD_CY + HEAD_R + w.bodyRy;

  switch (topId) {
    case 'denim-jacket': {
      // STOMP denim jacket
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Collar
      fillRect(g, CX - 3, bodyCy - w.bodyRy + 1, 7, 2, '2');
      // STOMP badge
      setPixel(g, CX - 2, bodyCy, '2');
      setPixel(g, CX - 1, bodyCy, '2');
      setPixel(g, CX, bodyCy, '2');
      setPixel(g, CX + 1, bodyCy, '2');
      // Center line
      fillLine(g, CX, bodyCy - w.bodyRy + 2, CX, bodyCy + w.bodyRy - 1, '2');
      break;
    }
    case 'leather-jacket': {
      fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, '1');
      // Lapels
      fillTriangle(g, CX - 2, bodyCy - w.bodyRy + 1, CX - 4, bodyCy - 2, CX, bodyCy - 2, '2');
      fillTriangle(g, CX + 2, bodyCy - w.bodyRy + 1, CX + 4, bodyCy - 2, CX, bodyCy - 2, '2');
      // Zipper
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
      // Cross-front overlap
      fillLine(g, CX - 3, bodyCy - w.bodyRy + 1, CX + 1, bodyCy + 2, '2');
      fillLine(g, CX + 3, bodyCy - w.bodyRy + 1, CX - 1, bodyCy + 2, '2');
      // Ornament border
      for (let i = -w.bodyRx; i <= w.bodyRx; i += 2) {
        const bx = CX + i, by = bodyCy + w.bodyRy;
        if (bx >= 0 && bx < GW && by >= 0 && by < GH) {
          const dx = i / w.bodyRx;
          if (dx * dx <= 1) setPixel(g, bx, by, '3');
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
  const w = WEIGHT_DIMS[weightState] || WEIGHT_DIMS.normal;
  const bodyCy = HEAD_CY + HEAD_R + w.bodyRy;
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
      // Chain going down from neck
      fillLine(g, CX - 2, bodyCy - w.bodyRy + 1, CX, bodyCy - 1, '1');
      fillLine(g, CX + 2, bodyCy - w.bodyRy + 1, CX, bodyCy - 1, '1');
      // Medal
      fillCircle(g, CX, bodyCy, 2, '2');
      setPixel(g, CX, bodyCy, '3');
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
  const w = WEIGHT_DIMS[weightState] || WEIGHT_DIMS.normal;
  const bodyCy = HEAD_CY + HEAD_R + w.bodyRy;
  const legSpread = Math.max(2, Math.floor(w.bodyRx * 0.45));
  const legTop = bodyCy + w.bodyRy - 1;
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
  @keyframes petBuuSquish {
    0%, 100% { transform: translateY(0) scale(1, 1); }
    30% { transform: translateY(0.15em) scale(1.08, 0.92); }
    65% { transform: translateY(-0.3em) scale(0.96, 1.04); }
  }
  @keyframes petDevitHop {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    30% { transform: translateY(-1.15em) rotate(-6deg); }
    60% { transform: translateY(-0.15em) rotate(6deg); }
  }
  @keyframes petPixiuBless {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    35% { transform: translateY(-0.55em) rotate(-2deg); }
    70% { transform: translateY(-0.15em) rotate(2deg); }
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
  .pet-react-dojocat, .pet-react-kata, .pet-react-proud, .pet-react-swish { animation: petKata 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-buu, .pet-react-squish, .pet-react-wobble, .pet-react-swagger { animation: petBuuSquish 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-devit, .pet-react-hop, .pet-react-dart, .pet-react-mischief { animation: petDevitHop 650ms cubic-bezier(0.22, 1, 0.36, 1); }
  .pet-react-pixiu, .pet-react-bless, .pet-react-sway, .pet-react-nod { animation: petPixiuBless 800ms cubic-bezier(0.22, 1, 0.36, 1); }
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

  // Memoize all grid computations
  const layers = useMemo(() => {
    // Base body
    const baseGrid = buildBase(character, weightState);
    const baseShadow = composeShadow(baseGrid, palette);

    // Arms
    const armsGrid = buildArms(character, weightState);
    const armsShadow = composeShadow(armsGrid, palette);

    // Character features (ears, horns, etc)
    const featGrid = buildFeatures(character);
    const featShadow = composeShadow(featGrid, palette);

    // Face / expression
    const faceGrid = buildFace(character, mood, expression);
    const faceShadow = composeShadow(faceGrid, palette);

    // Tail
    const tailGrid = buildTail(character, weightState);
    const tailShadow = composeShadow(tailGrid, palette);

    // Shadow ellipse (simple dark oval at feet)
    const shadowGrid = createGrid(GW, GH);
    const w = WEIGHT_DIMS[weightState] || WEIGHT_DIMS.normal;
    const bodyCy = HEAD_CY + HEAD_R + w.bodyRy;
    const legTop = bodyCy + w.bodyRy - 1;
    fillEllipse(shadowGrid, CX, legTop + 7, Math.floor(w.bodyRx * 0.7), 2, 'X');
    const groundShadow = gridToShadow(shadowGrid, { X: 'rgba(0,0,0,0.15)' });

    // Clothing layers
    let hatShadow = '', topShadow = '', beltShadow2 = '', shoesShadow = '', foodShadow = '';
    const defaultHat = equippedHat ? null : iconicLook?.hat;
    const defaultTop = equippedTop ? null : iconicLook?.top;
    const defaultBelt = equippedBelt ? null : iconicLook?.belt;

    if (defaultHat) {
      const hg = buildHat(defaultHat.id, defaultHat.color, character);
      hatShadow = gridToShadow(hg, getClothingColorMap(defaultHat.color));
    }
    if (defaultTop) {
      const tg = buildTop(defaultTop.id, defaultTop.color, weightState);
      topShadow = gridToShadow(tg, getClothingColorMap(defaultTop.color));
    }
    if (defaultBelt) {
      const bg = buildBelt(defaultBelt.id, defaultBelt.color, weightState);
      beltShadow2 = gridToShadow(bg, getClothingColorMap(defaultBelt.color));
    }
    if (equippedHat) {
      const hg = buildHat(equippedHat, hatColor, character);
      hatShadow = gridToShadow(hg, getClothingColorMap(hatColor));
    }
    if (equippedTop) {
      const tg = buildTop(equippedTop, topColor, weightState);
      topShadow = gridToShadow(tg, getClothingColorMap(topColor));
    }
    if (equippedBelt) {
      const bg = buildBelt(equippedBelt, beltColor, weightState);
      beltShadow2 = gridToShadow(bg, getClothingColorMap(beltColor));
    }
    if (equippedShoes) {
      const sg = buildShoes(equippedShoes, shoesColor, weightState);
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
        height: Math.ceil(size * GH / GW),
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

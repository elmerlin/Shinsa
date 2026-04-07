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

function buildBase(character, weightState) {
  const g = createGrid(GW, GH);
  const { w, bodyCy, legHeight, legSpread, legTop } = getBodyMetrics(weightState);

  // === Body drawn FIRST (behind head) ===
  fillEllipse(g, CX, bodyCy, w.bodyRx, w.bodyRy, 'B');
  fillEllipse(g, CX - 1, bodyCy - 2, Math.max(8, w.bodyRx - 2), Math.max(5, w.bodyRy - 2), 'L');

  // Belly patch
  fillEllipse(g, CX, bodyCy + 2, Math.max(4, Math.floor(w.bodyRx * 0.5)), Math.max(3, Math.floor(w.bodyRy * 0.46)), 'Y');

  // Belly droop for chubby/fat — extra ellipse hanging below body center
  if (w.bellyDroop > 0) {
    fillEllipse(g, CX, bodyCy + w.bodyRy - 1, Math.floor(w.bodyRx * 0.65), w.bellyDroop + 2, 'B');
    fillEllipse(g, CX, bodyCy + w.bodyRy, Math.floor(w.bodyRx * 0.4), w.bellyDroop + 1, 'Y');
  }

  // Ribs for starving — subtle horizontal lines on sides
  if (weightState === 'starving') {
    for (let ry = -2; ry <= 2; ry += 2) {
      setPixel(g, CX - w.bodyRx + 1, bodyCy + ry, 'K');
      setPixel(g, CX + w.bodyRx - 1, bodyCy + ry, 'K');
    }
  }

  // Legs — shorter and wider for fat
  fillRect(g, CX - legSpread - w.limbW + 1, legTop, w.limbW, legHeight, 'D');
  fillRect(g, CX + legSpread, legTop, w.limbW, legHeight, 'D');

  // Feet — wider for fat
  const footW = w.limbW + 2 + (w.bellyDroop > 2 ? 1 : 0);
  fillRect(g, CX - legSpread - w.limbW - 1, legTop + legHeight - 1, footW, 2, 'D');
  fillRect(g, CX + legSpread - 1, legTop + legHeight - 1, footW, 2, 'D');

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

function buildArms(character, weightState) {
  const g = createGrid(GW, GH);
  const { w, bodyCy } = getBodyMetrics(weightState);

  // Arms resting at sides (centered on body)
  const armY = bodyCy + Math.floor(w.bodyRy * 0.1);
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
      // Very prominent thick head tentacle (Majin Buu's iconic antenna)
      // Wide base emerging from top of head
      fillEllipse(g, CX + 2, hcy - HEAD_RY + 5, 5, 4, 'P');
      // Thick curved body — 7 parallel lines for real width
      for (let t = -3; t <= 3; t++) {
        // Rise up from head
        fillLine(g, CX + 2 + t, hcy - HEAD_RY + 2, CX + 8 + t, hcy - HEAD_RY - 2, 'P');
        // Curve over to the right
        fillLine(g, CX + 8 + t, hcy - HEAD_RY - 2, CX + 12 + Math.min(t, 1), hcy - HEAD_RY + 1, 'P');
        // Droop down slightly at the end
        fillLine(g, CX + 12 + Math.min(t, 1), hcy - HEAD_RY + 1, CX + 14 + Math.min(t, 0), hcy - HEAD_RY + 4, 'P');
      }
      // Bulbous tip at the end of droop
      fillCircle(g, CX + 14, hcy - HEAD_RY + 5, 3, 'P');
      fillCircle(g, CX + 13, hcy - HEAD_RY + 4, 2, 'P');
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
  @keyframes petBreathe {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-0.4em); }
  }
  @keyframes dojoIdle {
    0%, 100% { transform: translateY(0) rotate(0deg) scale(1, 1); }
    12% { transform: translateY(-0.25em) rotate(-1.5deg) scale(1.01, 0.99); }
    28% { transform: translateY(-0.05em) rotate(0.5deg) scale(1, 1); }
    42% { transform: translateY(0.04em) rotate(0deg) scale(0.99, 1.01); }
    58% { transform: translateY(-0.4em) rotate(1deg) scale(1.01, 0.99); }
    75% { transform: translateY(-0.12em) rotate(-0.5deg) scale(1, 1); }
    88% { transform: translateY(0.02em) rotate(0deg) scale(1, 1.01); }
  }
  @keyframes buuIdle {
    0%, 100% { transform: translateY(0) scale(1, 1) rotate(0deg); }
    10% { transform: translateY(-0.12em) scale(1.04, 0.96) rotate(-1deg); }
    22% { transform: translateY(0.04em) scale(0.97, 1.03) rotate(0.5deg); }
    36% { transform: translateY(-0.28em) scale(1.02, 0.98) rotate(0deg); }
    50% { transform: translateY(0em) scale(0.98, 1.02) rotate(-0.5deg); }
    65% { transform: translateY(-0.18em) scale(1.05, 0.96) rotate(1deg); }
    80% { transform: translateY(-0.04em) scale(1, 1) rotate(0deg); }
    90% { transform: translateY(0.03em) scale(0.99, 1.01) rotate(0deg); }
  }
  @keyframes devitIdle {
    0%, 100% { transform: translateY(0) rotate(0deg) scale(1); }
    8% { transform: translateY(-0.55em) rotate(-2deg) scale(1.02); }
    18% { transform: translateY(-0.08em) rotate(1.5deg) scale(0.99); }
    30% { transform: translateY(-0.35em) rotate(-1deg) scale(1.01); }
    44% { transform: translateY(0.05em) rotate(2deg) scale(0.98); }
    58% { transform: translateY(-0.65em) rotate(-2.5deg) scale(1.03); }
    72% { transform: translateY(-0.12em) rotate(1deg) scale(1); }
    85% { transform: translateY(-0.4em) rotate(-0.5deg) scale(1.01); }
  }
  @keyframes pixiuIdle {
    0%, 100% { transform: translateY(0) translateX(0) rotate(0deg) scale(1); }
    15% { transform: translateY(-0.18em) translateX(0.08em) rotate(0.5deg) scale(1.01, 0.99); }
    32% { transform: translateY(-0.04em) translateX(-0.04em) rotate(-0.5deg) scale(1, 1); }
    48% { transform: translateY(-0.32em) translateX(0.12em) rotate(1deg) scale(1.01, 0.99); }
    62% { transform: translateY(-0.08em) translateX(-0.08em) rotate(-0.3deg) scale(1, 1); }
    78% { transform: translateY(-0.2em) translateX(0.05em) rotate(0.3deg) scale(1, 1.01); }
    90% { transform: translateY(-0.04em) translateX(-0.02em) rotate(0deg) scale(1, 1); }
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
  /* ── Idle variant animations (intermittent, character-specific) ── */
  /* ── Subtle idle ── */
  @keyframes sprite-idle-nod { 0%,100% { transform: translateY(0); } 40% { transform: translateY(1px); } }
  @keyframes sprite-idle-stance { 0%,100% { transform: rotate(0); } 30% { transform: rotate(0.5deg); } 70% { transform: rotate(-0.3deg); } }
  @keyframes sprite-idle-whisker { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(1.003); } }
  @keyframes sprite-idle-wobble { 0%,100% { transform: rotate(0); } 25% { transform: rotate(1.5deg); } 75% { transform: rotate(-1.5deg); } }
  @keyframes sprite-idle-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
  @keyframes sprite-idle-sway { 0%,100% { transform: translateX(0); } 50% { transform: translateX(1.5px); } }
  @keyframes sprite-idle-twitch { 0%,50%,100% { transform: translateX(0); } 25% { transform: translateX(-1px); } 75% { transform: translateX(1px); } }
  @keyframes sprite-idle-shimmy { 0%,100% { transform: rotate(0); } 20% { transform: rotate(1deg); } 40% { transform: rotate(-1deg); } 60% { transform: rotate(0.5deg); } }
  @keyframes sprite-idle-hop { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-3px); } }
  @keyframes sprite-idle-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
  @keyframes sprite-idle-glow { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.05); } }
  /* ── Active idle — martial arts, stretching, looking ── */
  @keyframes sprite-idle-kick { 0%,100% { transform: rotate(0) translateY(0); } 20% { transform: rotate(-3deg) translateY(-1px); } 35% { transform: rotate(6deg) translateY(-4px); } 55% { transform: rotate(4deg) translateY(-2px); } 75% { transform: rotate(0) translateY(0); } }
  @keyframes sprite-idle-punch { 0%,100% { transform: translateX(0) scaleX(1); } 15% { transform: translateX(-2px) scaleX(0.97); } 30% { transform: translateX(5px) scaleX(1.04); } 50% { transform: translateX(3px) scaleX(1.02); } 70% { transform: translateX(0) scaleX(1); } }
  @keyframes sprite-idle-crane { 0%,100% { transform: translateY(0) rotate(0); } 25% { transform: translateY(-5px) rotate(-1deg); } 50% { transform: translateY(-5px) rotate(0.5deg); } 80% { transform: translateY(-2px) rotate(0); } }
  @keyframes sprite-idle-stretch { 0%,100% { transform: scaleY(1) translateY(0); } 30% { transform: scaleY(1.06) translateY(-3px); } 60% { transform: scaleY(1.04) translateY(-2px); } }
  @keyframes sprite-idle-look { 0%,100% { transform: scaleX(1) translateX(0); } 25% { transform: scaleX(-1) translateX(0); } 60% { transform: scaleX(-1) translateX(0); } 75% { transform: scaleX(1) translateX(0); } }
  @keyframes sprite-idle-jump { 0%,100% { transform: translateY(0); } 20% { transform: translateY(2px); } 40% { transform: translateY(-8px); } 55% { transform: translateY(-6px); } 70% { transform: translateY(1px); } 85% { transform: translateY(0); } }
  @keyframes sprite-idle-kata { 0%,100% { transform: rotate(0) translateX(0); } 15% { transform: rotate(3deg) translateX(2px); } 30% { transform: rotate(-4deg) translateX(-3px); } 50% { transform: rotate(2deg) translateX(1px); } 70% { transform: rotate(0); } }
  @keyframes sprite-idle-flex { 0%,100% { transform: scaleX(1) scaleY(1); } 25% { transform: scaleX(1.05) scaleY(0.97); } 50% { transform: scaleX(1.07) scaleY(0.95); } 75% { transform: scaleX(1.03) scaleY(0.98); } }
  @keyframes sprite-idle-spin { 0% { transform: scaleX(1); } 25% { transform: scaleX(0.15); } 50% { transform: scaleX(-1); } 75% { transform: scaleX(-0.15); } 100% { transform: scaleX(1); } }
  @keyframes sprite-idle-dart { 0%,100% { transform: translateX(0); } 15% { transform: translateX(-6px); } 30% { transform: translateX(6px); } 50% { transform: translateX(-3px); } 65% { transform: translateX(3px); } 80% { transform: translateX(0); } }
  @keyframes sprite-idle-mischief { 0%,100% { transform: rotate(0) translateY(0); } 20% { transform: rotate(-2deg) translateY(-1px); } 40% { transform: rotate(3deg) translateY(-3px); } 55% { transform: rotate(-1deg) translateY(-1px); } 75% { transform: rotate(1deg); } }
  @keyframes sprite-idle-swing { 0%,100% { transform: rotate(0); } 20% { transform: rotate(5deg); } 40% { transform: rotate(-5deg); } 60% { transform: rotate(3deg); } 80% { transform: rotate(-2deg); } }
  @keyframes sprite-idle-bless { 0%,100% { transform: translateY(0) scale(1); filter: brightness(1); } 30% { transform: translateY(-3px) scale(1.02); filter: brightness(1.08); } 60% { transform: translateY(-2px) scale(1.01); filter: brightness(1.04); } }
  /* ── Subtle idle classes ── */
  .idle-nod { animation: sprite-idle-nod 2s ease-in-out; }
  .idle-stance { animation: sprite-idle-stance 1.8s ease-in-out; }
  .idle-whisker { animation: sprite-idle-whisker 1.5s ease-in-out; }
  .idle-wobble { animation: sprite-idle-wobble 2s ease-in-out; }
  .idle-bounce { animation: sprite-idle-bounce 1.6s ease-in-out; }
  .idle-sway { animation: sprite-idle-sway 2.2s ease-in-out; }
  .idle-twitch { animation: sprite-idle-twitch 0.8s ease-in-out; }
  .idle-shimmy { animation: sprite-idle-shimmy 1.4s ease-in-out; }
  .idle-hop { animation: sprite-idle-hop 1s ease-in-out; }
  .idle-float { animation: sprite-idle-float 2.5s ease-in-out; }
  .idle-glow { animation: sprite-idle-glow 2s ease-in-out; }
  /* ── Active idle classes ── */
  .idle-kick { animation: sprite-idle-kick 1.2s cubic-bezier(0.4,0,0.2,1); }
  .idle-punch { animation: sprite-idle-punch 0.9s cubic-bezier(0.4,0,0.2,1); }
  .idle-crane { animation: sprite-idle-crane 2.5s ease-in-out; }
  .idle-stretch { animation: sprite-idle-stretch 2s ease-in-out; }
  .idle-look { animation: sprite-idle-look 2.2s ease-in-out; }
  .idle-jump { animation: sprite-idle-jump 1s cubic-bezier(0.4,0,0.2,1); }
  .idle-kata { animation: sprite-idle-kata 1.6s cubic-bezier(0.4,0,0.2,1); }
  .idle-flex { animation: sprite-idle-flex 1.8s ease-in-out; }
  .idle-spin { animation: sprite-idle-spin 1.4s ease-in-out; }
  .idle-dart { animation: sprite-idle-dart 1.2s cubic-bezier(0.4,0,0.2,1); }
  .idle-mischief { animation: sprite-idle-mischief 1.5s ease-in-out; }
  .idle-swing { animation: sprite-idle-swing 1.6s ease-in-out; }
  .idle-bless { animation: sprite-idle-bless 2.2s ease-in-out; }
  .sprite-blink { opacity: 0.92; transition: opacity 0.15s ease; }
  @media (prefers-reduced-motion: reduce) {
    .pixel-pet-wrap *, .pixel-pet-wrap { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
    [class*="idle-"] { animation: none !important; }
    .sprite-blink { opacity: 1 !important; transition: none !important; }
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

  // ─── Idle animation system ──────────────────────────
  const [idleTick, setIdleTick] = React.useState(0);
  const [blinkState, setBlinkState] = React.useState(false);

  React.useEffect(() => {
    // Respect reduced motion
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (hasReaction || isEating || isTricking) return;

    // Blink every 3-6 seconds
    const blinkInterval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 150);
    }, 3000 + Math.random() * 3000);

    // Idle tick for subtle motion every 4-8 seconds
    const idleInterval = setInterval(() => {
      setIdleTick(t => t + 1);
    }, 4000 + Math.random() * 4000);

    return () => {
      clearInterval(blinkInterval);
      clearInterval(idleInterval);
    };
  }, [hasReaction, isEating, isTricking]);

  // Character idle behaviors — cycle through 10 variants for richer life
  const IDLE_VARIANT_CLASSES = {
    dojocat: ['idle-nod', 'idle-stance', 'idle-kick', 'idle-stretch', 'idle-look', 'idle-punch', 'idle-crane', 'idle-whisker', 'idle-jump', 'idle-kata'],
    buu:     ['idle-wobble', 'idle-bounce', 'idle-kick', 'idle-stretch', 'idle-look', 'idle-punch', 'idle-sway', 'idle-jump', 'idle-flex', 'idle-spin'],
    devit:   ['idle-twitch', 'idle-shimmy', 'idle-hop', 'idle-stretch', 'idle-look', 'idle-dart', 'idle-mischief', 'idle-jump', 'idle-kick', 'idle-swing'],
    pixiu:   ['idle-float', 'idle-sway', 'idle-glow', 'idle-stretch', 'idle-look', 'idle-kick', 'idle-bless', 'idle-jump', 'idle-punch', 'idle-crane'],
  };
  const pool = IDLE_VARIANT_CLASSES[character] || IDLE_VARIANT_CLASSES.dojocat;
  const idleVariant = idleTick % pool.length;
  const idleVariantClass = (!hasReaction && !isEating && !isTricking)
    ? pool[idleVariant]
    : '';
  const blinkClass = blinkState ? 'sprite-blink' : '';

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

    // Base body (no head — head is a separate layer above clothing)
    const baseGrid = outlineGrid(buildBase(character, weightState));
    baseShadow = composeShadow(baseGrid, palette);

    // Head (separate layer — rendered above clothing, below features)
    const headGrid = outlineGrid(buildHead(character));
    headShadow = composeShadow(headGrid, palette);

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

    return { baseShadow, headShadow, armsShadow, featShadow, faceShadow, tailShadow, groundShadow, hatShadow, topShadow, beltShadow2, shoesShadow, foodShadow };
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
      <div className={`${animClass} ${idleVariantClass} ${blinkClass}`} style={{ position: 'absolute', inset: 0 }}>
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

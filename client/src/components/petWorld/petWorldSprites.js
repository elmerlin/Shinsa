import { getBuildingUi } from './petWorldBuildings';
import { getBiomeUi, getTilePalette } from './petWorldTiles';

// --- low-level drawing helpers ---

function px(ctx, x, y, w, h, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
}

function outline(ctx, x, y, w, h, color = 'rgba(0,0,0,0.55)', lineWidth = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

function shadow(ctx, x, y, w, h) {
  px(ctx, x + 2, y + 2, w, h, 'rgba(0,0,0,0.22)');
}

function tri(ctx, x1, y1, x2, y2, x3, y3, fill) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function circ(ctx, cx, cy, r, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 0xff) + (((pb >> 16) & 0xff) - ((pa >> 16) & 0xff)) * t;
  const g = ((pa >> 8) & 0xff) + (((pb >> 8) & 0xff) - ((pa >> 8) & 0xff)) * t;
  const bl = (pa & 0xff) + ((pb & 0xff) - (pa & 0xff)) * t;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(bl)})`;
}

function tileHash(x, y) {
  return ((x * 2654435761) ^ (y * 2246822519)) >>> 0;
}

// --- tile drawing ---

export function drawTile(ctx, biome, tile, x, y, tileSize, time = 0) {
  const palette = getTilePalette(biome, tile.t);
  const biomeUi = getBiomeUi(biome);
  const s = tileSize;
  const ix = Math.round(x);
  const iy = Math.round(y);

  // base fill
  px(ctx, ix, iy, s, s, palette.fill);

  // grid line
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(ix, iy, s, s);

  if (tile.t === 'water') {
    // animated shimmer bands
    const phase = (time * 0.001 + ix * 0.02 + iy * 0.03) % 1;
    const shimY1 = iy + s * (0.15 + phase * 0.15);
    const shimY2 = iy + s * (0.50 + ((phase + 0.4) % 1) * 0.12);
    px(ctx, ix + s * 0.08, shimY1, s * 0.84, s * 0.08, palette.detail, 0.35);
    px(ctx, ix + s * 0.20, shimY2, s * 0.52, s * 0.06, palette.detail, 0.25);
    // sparkle
    const spark = ((time * 0.002 + ix * 17 + iy * 31) % 3) | 0;
    if (spark === 0) px(ctx, ix + s * 0.6, iy + s * 0.3, 2, 2, '#ffffff', 0.5);
    return;
  }

  if (tile.t === 'tree') {
    const h = tileHash(ix, iy);
    const sway = Math.sin(time * 0.0015 + h * 0.01) * (s * 0.04);
    const trunkX = ix + s * 0.40;
    const trunkW = s * 0.18;
    // trunk
    px(ctx, trunkX, iy + s * 0.55, trunkW, s * 0.28, palette.trunk || biomeUi.treeTrunk);
    // canopy shadow
    circ(ctx, ix + s * 0.5 + sway, iy + s * 0.40, s * 0.34, 'rgba(0,0,0,0.15)');
    // main canopy
    circ(ctx, ix + s * 0.5 + sway, iy + s * 0.36, s * 0.32, palette.fill);
    // highlight
    circ(ctx, ix + s * 0.42 + sway, iy + s * 0.28, s * 0.14, palette.detail || biomeUi.treeHighlight, 0.7);
    return;
  }

  if (tile.t === 'rock') {
    // main body
    const rx = ix + s * 0.15;
    const ry = iy + s * 0.22;
    const rw = s * 0.65;
    const rh = s * 0.48;
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, [s * 0.1, s * 0.14, s * 0.08, s * 0.12]);
    ctx.fillStyle = palette.fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 3D highlights
    px(ctx, rx + rw * 0.15, ry + rh * 0.12, rw * 0.3, rh * 0.14, palette.detail, 0.5);
    px(ctx, rx + rw * 0.55, ry + rh * 0.22, rw * 0.18, rh * 0.1, palette.detail, 0.35);
    // small chip
    px(ctx, ix + s * 0.65, iy + s * 0.58, s * 0.12, s * 0.1, palette.fill);
    return;
  }

  if (tile.t === 'bush') {
    // main bush body
    circ(ctx, ix + s * 0.5, iy + s * 0.50, s * 0.28, palette.fill);
    circ(ctx, ix + s * 0.35, iy + s * 0.46, s * 0.18, palette.fill);
    circ(ctx, ix + s * 0.65, iy + s * 0.46, s * 0.18, palette.fill);
    // highlight
    circ(ctx, ix + s * 0.42, iy + s * 0.40, s * 0.08, 'rgba(255,255,255,0.12)');
    // berry/flower detail spots
    const h = tileHash(ix, iy);
    const dx1 = (h % 7) / 7;
    const dx2 = ((h >> 4) % 5) / 5;
    circ(ctx, ix + s * (0.30 + dx1 * 0.12), iy + s * 0.42, s * 0.04, palette.detail, 0.85);
    circ(ctx, ix + s * (0.54 + dx2 * 0.14), iy + s * 0.48, s * 0.035, palette.detail, 0.75);
    circ(ctx, ix + s * 0.48, iy + s * 0.56, s * 0.03, palette.detail, 0.65);
    return;
  }

  // ground: biome micro-detail
  const h = tileHash(ix, iy);
  const detailColor = biomeUi.groundDetail;
  if (h % 5 === 0) {
    // small flower or detail dot
    px(ctx, ix + s * ((h >> 3) % 6) / 8 + s * 0.1, iy + s * ((h >> 6) % 5) / 7 + s * 0.15, s * 0.06, s * 0.06, detailColor, 0.35);
  }
  if (h % 7 === 0) {
    px(ctx, ix + s * 0.55, iy + s * 0.6, s * 0.08, s * 0.04, detailColor, 0.25);
  }
}

// --- building sprites ---

const SPRITE_DRAWERS = {
  farm(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06; // unit
    // base field
    px(ctx, x + u, y + h * 0.30, w - u * 2, h * 0.62, '#6a8a2a');
    // crop rows
    for (let row = 0; row < 4; row++) {
      const ry = y + h * 0.35 + row * h * 0.14;
      px(ctx, x + u * 3, ry, w - u * 6, u * 1.5, '#4a6a1a');
      // stalks
      for (let col = 0; col < 5; col++) {
        const cx = x + u * 4 + col * (w - u * 8) / 4;
        px(ctx, cx, ry - u * 2, u, u * 3, '#2a5a10');
        px(ctx, cx - u * 0.5, ry - u * 3, u * 2, u * 1.5, '#d4b030'); // wheat top
      }
    }
    // fence border
    px(ctx, x, y + h * 0.28, w, u, '#7a5a30');
    px(ctx, x, y + h * 0.88, w, u, '#7a5a30');
    px(ctx, x, y + h * 0.28, u, h * 0.62, '#7a5a30');
    px(ctx, x + w - u, y + h * 0.28, u, h * 0.62, '#7a5a30');
    // fence posts
    for (let i = 0; i < 3; i++) {
      px(ctx, x + w * (0.25 + i * 0.25), y + h * 0.24, u, h * 0.08, '#5a3a18');
    }
  },

  house(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // shadow
    shadow(ctx, x + u * 2, y + h * 0.30, w - u * 4, h * 0.60);
    // walls
    px(ctx, x + u * 3, y + h * 0.40, w - u * 6, h * 0.52, ui.wallColor);
    px(ctx, x + u * 3, y + h * 0.40, w - u * 6, h * 0.12, lerpColor(ui.wallColor, '#ffffff', 0.15));
    // door
    px(ctx, x + w * 0.44, y + h * 0.65, w * 0.12, h * 0.27, '#5a3a1a');
    px(ctx, x + w * 0.44 + u, y + h * 0.67, w * 0.12 - u * 2, h * 0.08, '#7a5a3a');
    // window
    px(ctx, x + w * 0.20, y + h * 0.50, w * 0.14, h * 0.12, '#88c8e8');
    px(ctx, x + w * 0.20, y + h * 0.555, w * 0.14, u * 0.5, '#6a4a2a');
    px(ctx, x + w * 0.67, y + h * 0.50, w * 0.14, h * 0.12, '#88c8e8');
    // roof
    tri(ctx, x + u, y + h * 0.42, x + w / 2, y + h * 0.14, x + w - u, y + h * 0.42, ui.roofColor);
    tri(ctx, x + u * 3, y + h * 0.42, x + w / 2, y + h * 0.18, x + w - u * 3, y + h * 0.42, lerpColor(ui.roofColor, '#ffffff', 0.18));
    // chimney
    px(ctx, x + w * 0.72, y + h * 0.12, w * 0.08, h * 0.22, '#6a4a3a');
    px(ctx, x + w * 0.72, y + h * 0.12, w * 0.08, u, '#8a6a5a');
  },

  well(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // cobblestone base
    circ(ctx, x + w / 2, y + h * 0.62, w * 0.38, '#808080');
    circ(ctx, x + w / 2, y + h * 0.58, w * 0.34, '#909498');
    // well ring
    circ(ctx, x + w / 2, y + h * 0.52, w * 0.28, '#7a7a7e');
    circ(ctx, x + w / 2, y + h * 0.50, w * 0.22, '#4080b0');
    // water inside
    circ(ctx, x + w / 2, y + h * 0.50, w * 0.18, '#3a7aa0', 0.8);
    // crossbeam
    px(ctx, x + w * 0.22, y + h * 0.18, u * 1.2, h * 0.36, '#6a4a2a');
    px(ctx, x + w - w * 0.22 - u, y + h * 0.18, u * 1.2, h * 0.36, '#6a4a2a');
    px(ctx, x + w * 0.18, y + h * 0.16, w * 0.64, u, '#7a5a3a');
    // bucket
    px(ctx, x + w / 2 - u, y + h * 0.28, u * 2, u * 2.5, '#8a6a40');
    // rope
    px(ctx, x + w / 2, y + h * 0.18, u * 0.5, h * 0.12, '#a09070');
  },

  fishing_hut(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // water base
    px(ctx, x, y + h * 0.70, w, h * 0.30, '#3090b0', 0.5);
    // stilts
    for (let i = 0; i < 3; i++) {
      px(ctx, x + w * (0.15 + i * 0.30), y + h * 0.40, u * 1.2, h * 0.52, '#5a4030');
    }
    // platform
    px(ctx, x + u * 2, y + h * 0.38, w - u * 4, u * 2, '#7a5a3a');
    // walls
    px(ctx, x + u * 3, y + h * 0.18, w * 0.55, h * 0.22, ui.wallColor);
    // roof
    px(ctx, x + u, y + h * 0.12, w * 0.62, u * 2, ui.roofColor);
    px(ctx, x + u * 2, y + h * 0.10, w * 0.58, u, lerpColor(ui.roofColor, '#ffffff', 0.2));
    // window
    px(ctx, x + w * 0.20, y + h * 0.24, w * 0.08, h * 0.08, '#88c8e8');
    // fishing rod
    px(ctx, x + w * 0.75, y + h * 0.06, u, h * 0.36, '#6a4a2a');
    px(ctx, x + w * 0.75, y + h * 0.06, w * 0.15, u * 0.5, '#6a4a2a');
    // fishing line
    ctx.strokeStyle = '#a0a0a0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.90, y + h * 0.06);
    ctx.lineTo(x + w * 0.88, y + h * 0.55);
    ctx.stroke();
    // bobber
    circ(ctx, x + w * 0.88, y + h * 0.55, u, '#e04040');
  },

  woodcutters_hut(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.30, w * 0.60, h * 0.55);
    // log cabin walls
    px(ctx, x + u, y + h * 0.35, w * 0.60, h * 0.52, '#8a6040');
    // log texture lines
    for (let i = 0; i < 4; i++) {
      px(ctx, x + u, y + h * 0.38 + i * h * 0.12, w * 0.60, u * 0.5, '#6a4a2a');
    }
    // roof
    px(ctx, x, y + h * 0.28, w * 0.66, u * 2, ui.roofColor);
    px(ctx, x + u, y + h * 0.26, w * 0.62, u, lerpColor(ui.roofColor, '#ffffff', 0.2));
    // door
    px(ctx, x + w * 0.22, y + h * 0.60, w * 0.12, h * 0.27, '#4a2a10');
    // stump
    px(ctx, x + w * 0.72, y + h * 0.65, w * 0.18, h * 0.20, '#7a5a30');
    px(ctx, x + w * 0.72, y + h * 0.63, w * 0.18, u, '#a08050');
    // axe in stump
    px(ctx, x + w * 0.78, y + h * 0.48, u, h * 0.18, '#5a5a60');
    px(ctx, x + w * 0.74, y + h * 0.46, u * 3, u * 1.5, '#8a8a90');
  },

  stone_pit(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // excavation pit
    px(ctx, x + u * 2, y + h * 0.30, w - u * 4, h * 0.55, '#5a5458');
    px(ctx, x + u * 3, y + h * 0.35, w - u * 6, h * 0.45, '#4a4448');
    // stone piles
    circ(ctx, x + w * 0.28, y + h * 0.55, s * 0.10, '#8a8a8e');
    circ(ctx, x + w * 0.42, y + h * 0.60, s * 0.08, '#9a9aa0');
    circ(ctx, x + w * 0.22, y + h * 0.65, s * 0.06, '#7a7a80');
    // pickaxe
    px(ctx, x + w * 0.65, y + h * 0.22, u, h * 0.40, '#6a4a2a');
    px(ctx, x + w * 0.58, y + h * 0.20, u * 3.5, u * 2, '#8a8a90');
    // highlight on stones
    px(ctx, x + w * 0.26, y + h * 0.50, u, u * 0.5, '#c0c0c4', 0.6);
  },

  path(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    const biome = ui._biome || 'grasslands';
    const pal = getBiomeUi(biome);
    const stone = pal.pathStone || '#8a8578';
    // cobblestone pattern - irregular rounded stones
    const stones = [
      [0.10, 0.10, 0.25, 0.22], [0.38, 0.08, 0.28, 0.20],
      [0.70, 0.12, 0.22, 0.18], [0.05, 0.36, 0.28, 0.24],
      [0.36, 0.32, 0.30, 0.26], [0.68, 0.34, 0.26, 0.22],
      [0.12, 0.64, 0.24, 0.22], [0.40, 0.62, 0.26, 0.24],
      [0.70, 0.60, 0.22, 0.26],
    ];
    stones.forEach(([sx, sy, sw, sh], i) => {
      const c = i % 2 === 0 ? stone : lerpColor(stone, '#ffffff', 0.12);
      ctx.beginPath();
      ctx.roundRect(x + w * sx, y + h * sy, w * sw, h * sh, [u * 2]);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });
  },

  lumberyard(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.25, w - u * 4, h * 0.65);
    // base platform
    px(ctx, x + u, y + h * 0.80, w - u * 2, h * 0.12, '#6a5030');
    // stacked logs
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const lx = x + u * 3 + col * (w - u * 6) / 4;
        const ly = y + h * 0.55 + row * h * 0.08;
        circ(ctx, lx + u * 2, ly + u, u * 1.5, '#8a6040');
        circ(ctx, lx + u * 2, ly + u, u * 0.8, '#a07850');
      }
    }
    // saw frame
    px(ctx, x + w * 0.60, y + h * 0.18, u * 1.5, h * 0.58, '#5a4030');
    px(ctx, x + w * 0.72, y + h * 0.18, u * 1.5, h * 0.58, '#5a4030');
    px(ctx, x + w * 0.58, y + h * 0.16, w * 0.20, u, '#7a5a3a');
    // saw blade
    px(ctx, x + w * 0.64, y + h * 0.28, w * 0.08, h * 0.30, '#b0b0b8', 0.7);
    // roof over logs
    px(ctx, x, y + h * 0.45, w * 0.55, u * 2, ui.roofColor);
  },

  quarry(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // deep cut into rock
    px(ctx, x + u * 2, y + h * 0.35, w - u * 4, h * 0.58, '#4a4448');
    px(ctx, x + u * 4, y + h * 0.40, w - u * 8, h * 0.48, '#3a3438');
    // step walls
    px(ctx, x + u, y + h * 0.30, w - u * 2, h * 0.08, '#6a6a70');
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.06, '#5a5a60');
    // stone blocks
    px(ctx, x + w * 0.10, y + h * 0.70, w * 0.18, h * 0.12, '#8a8a90');
    px(ctx, x + w * 0.30, y + h * 0.72, w * 0.15, h * 0.10, '#909498');
    // crane arm
    px(ctx, x + w * 0.70, y + h * 0.10, u * 1.5, h * 0.55, '#5a4a3a');
    px(ctx, x + w * 0.55, y + h * 0.08, w * 0.30, u, '#6a5a4a');
    // crane rope
    ctx.strokeStyle = '#a09070';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.58, y + h * 0.10);
    ctx.lineTo(x + w * 0.58, y + h * 0.45);
    ctx.stroke();
    // hanging block
    px(ctx, x + w * 0.54, y + h * 0.42, u * 3, u * 2.5, '#7a7a80');
  },

  weaving_hut(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.28, w - u * 4, h * 0.60);
    // cottage walls
    px(ctx, x + u * 3, y + h * 0.38, w * 0.55, h * 0.52, ui.wallColor);
    px(ctx, x + u * 3, y + h * 0.38, w * 0.55, h * 0.10, lerpColor(ui.wallColor, '#ffffff', 0.12));
    // roof
    tri(ctx, x + u, y + h * 0.40, x + w * 0.30, y + h * 0.16, x + w * 0.60, y + h * 0.40, ui.roofColor);
    // door
    px(ctx, x + w * 0.22, y + h * 0.62, w * 0.10, h * 0.28, '#5a3a1a');
    // window
    px(ctx, x + w * 0.40, y + h * 0.48, w * 0.10, h * 0.10, '#88c8e8');
    // fabric hanging outside (colorful strips)
    const fabrics = ['#e050a0', '#50a0e0', '#e0c040', '#40c070'];
    for (let i = 0; i < 4; i++) {
      px(ctx, x + w * 0.65 + i * u * 2.5, y + h * 0.25, u * 1.8, h * 0.40, fabrics[i], 0.85);
    }
    // loom frame
    px(ctx, x + w * 0.64, y + h * 0.22, w * 0.28, u, '#6a4a2a');
    px(ctx, x + w * 0.64, y + h * 0.65, w * 0.28, u, '#6a4a2a');
  },

  market(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // counter
    px(ctx, x + u * 2, y + h * 0.55, w - u * 4, h * 0.14, '#8a6840');
    px(ctx, x + u * 2, y + h * 0.55, w - u * 4, u, '#a08050');
    // counter legs
    px(ctx, x + u * 3, y + h * 0.68, u * 1.2, h * 0.22, '#6a4a2a');
    px(ctx, x + w - u * 4.2, y + h * 0.68, u * 1.2, h * 0.22, '#6a4a2a');
    // awning (colored stripes)
    const stripeW = (w - u * 4) / 4;
    const colors = [ui.roofColor, lerpColor(ui.roofColor, '#ffffff', 0.3), ui.roofColor, lerpColor(ui.roofColor, '#ffffff', 0.3)];
    for (let i = 0; i < 4; i++) {
      px(ctx, x + u * 2 + i * stripeW, y + h * 0.20, stripeW, h * 0.18, colors[i]);
    }
    // awning edge scallop
    px(ctx, x + u * 2, y + h * 0.36, w - u * 4, u, ui.roofColor);
    // support poles
    px(ctx, x + u * 2, y + h * 0.20, u, h * 0.70, '#6a4a2a');
    px(ctx, x + w - u * 3, y + h * 0.20, u, h * 0.70, '#6a4a2a');
    // goods on counter
    px(ctx, x + w * 0.25, y + h * 0.48, u * 2, u * 2, '#c0a040');
    px(ctx, x + w * 0.42, y + h * 0.47, u * 2.5, u * 2.5, '#e06040');
    px(ctx, x + w * 0.60, y + h * 0.48, u * 2, u * 2, '#40a060');
  },

  large_house(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 3, y + h * 0.18, w - u * 6, h * 0.72);
    // walls - two story
    px(ctx, x + u * 3, y + h * 0.28, w - u * 6, h * 0.64, ui.wallColor);
    px(ctx, x + u * 3, y + h * 0.28, w - u * 6, h * 0.10, lerpColor(ui.wallColor, '#ffffff', 0.12));
    // floor line
    px(ctx, x + u * 3, y + h * 0.55, w - u * 6, u * 0.5, 'rgba(0,0,0,0.15)');
    // ground floor windows
    px(ctx, x + w * 0.12, y + h * 0.62, w * 0.10, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.55, y + h * 0.62, w * 0.10, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.75, y + h * 0.62, w * 0.10, h * 0.10, '#88c8e8');
    // upper windows
    px(ctx, x + w * 0.12, y + h * 0.38, w * 0.10, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.55, y + h * 0.38, w * 0.10, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.75, y + h * 0.38, w * 0.10, h * 0.10, '#88c8e8');
    // door
    px(ctx, x + w * 0.33, y + h * 0.60, w * 0.10, h * 0.32, '#5a3a1a');
    // balcony
    px(ctx, x + w * 0.30, y + h * 0.52, w * 0.40, u, '#7a5a3a');
    px(ctx, x + w * 0.30, y + h * 0.52, u * 0.8, h * -0.06, '#7a5a3a');
    px(ctx, x + w * 0.70 - u, y + h * 0.52, u * 0.8, h * -0.06, '#7a5a3a');
    // railing
    for (let i = 0; i < 5; i++) {
      px(ctx, x + w * 0.32 + i * w * 0.07, y + h * 0.47, u * 0.5, h * 0.05, '#8a6a4a');
    }
    px(ctx, x + w * 0.30, y + h * 0.47, w * 0.40, u * 0.5, '#8a6a4a');
    // roof
    tri(ctx, x + u, y + h * 0.30, x + w / 2, y + h * 0.08, x + w - u, y + h * 0.30, ui.roofColor);
    tri(ctx, x + u * 4, y + h * 0.30, x + w / 2, y + h * 0.14, x + w - u * 4, y + h * 0.30, lerpColor(ui.roofColor, '#ffffff', 0.15));
  },

  garden(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // small fence
    px(ctx, x + u, y + h * 0.18, w - u * 2, u * 0.8, '#7a5a30');
    px(ctx, x + u, y + h * 0.82, w - u * 2, u * 0.8, '#7a5a30');
    px(ctx, x + u, y + h * 0.18, u * 0.8, h * 0.66, '#7a5a30');
    px(ctx, x + w - u * 1.8, y + h * 0.18, u * 0.8, h * 0.66, '#7a5a30');
    // soil rows
    px(ctx, x + u * 3, y + h * 0.28, w - u * 6, h * 0.50, '#5a4020');
    for (let row = 0; row < 3; row++) {
      px(ctx, x + u * 3, y + h * 0.30 + row * h * 0.16, w - u * 6, u * 0.5, '#4a3018');
    }
    // flowers
    const flowers = ['#e060a0', '#e0e040', '#e04040', '#a040e0', '#40a0e0'];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const fx = x + u * 4 + col * (w - u * 8) / 2;
        const fy = y + h * 0.32 + row * h * 0.16;
        const ci = (row * 3 + col) % flowers.length;
        px(ctx, fx, fy - u, u * 0.5, u * 2, '#3a8a2a'); // stem
        circ(ctx, fx, fy - u * 1.5, u * 1.2, flowers[ci]);
      }
    }
  },

  storehouse(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.20, w - u * 4, h * 0.70);
    // barn walls
    px(ctx, x + u * 2, y + h * 0.32, w - u * 4, h * 0.60, ui.wallColor);
    px(ctx, x + u * 2, y + h * 0.32, w - u * 4, h * 0.10, lerpColor(ui.wallColor, '#ffffff', 0.10));
    // wide doors
    px(ctx, x + w * 0.30, y + h * 0.55, w * 0.40, h * 0.37, '#5a3a1a');
    px(ctx, x + w * 0.49, y + h * 0.55, u * 0.8, h * 0.37, '#4a2a10');
    // door cross braces
    ctx.strokeStyle = '#4a2a10';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.30, y + h * 0.55);
    ctx.lineTo(x + w * 0.49, y + h * 0.92);
    ctx.moveTo(x + w * 0.51, y + h * 0.55);
    ctx.lineTo(x + w * 0.70, y + h * 0.92);
    ctx.stroke();
    // roof (barn-style)
    tri(ctx, x, y + h * 0.34, x + w / 2, y + h * 0.10, x + w, y + h * 0.34, ui.roofColor);
    // shelving visible in window
    px(ctx, x + w * 0.10, y + h * 0.42, w * 0.14, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.76, y + h * 0.42, w * 0.14, h * 0.10, '#88c8e8');
    // crates inside (through windows)
    px(ctx, x + w * 0.11, y + h * 0.45, w * 0.04, h * 0.05, '#c8a040', 0.6);
  },

  trading_post(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.25, w - u * 4, h * 0.65);
    // ornate walls
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54, ui.wallColor);
    // gold trim lines
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, u, '#d4a830');
    px(ctx, x + u * 3, y + h * 0.90, w - u * 6, u, '#d4a830');
    // side pilasters
    px(ctx, x + u * 3, y + h * 0.38, u * 1.5, h * 0.54, lerpColor(ui.wallColor, '#d4a830', 0.2));
    px(ctx, x + w - u * 4.5, y + h * 0.38, u * 1.5, h * 0.54, lerpColor(ui.wallColor, '#d4a830', 0.2));
    // door
    px(ctx, x + w * 0.40, y + h * 0.60, w * 0.18, h * 0.32, '#5a3a1a');
    // arch above door
    ctx.beginPath();
    ctx.arc(x + w * 0.49, y + h * 0.60, w * 0.09, Math.PI, 0, false);
    ctx.fillStyle = '#6a4a2a';
    ctx.fill();
    // windows
    px(ctx, x + w * 0.15, y + h * 0.48, w * 0.12, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.72, y + h * 0.48, w * 0.12, h * 0.10, '#88c8e8');
    // roof
    tri(ctx, x + u, y + h * 0.40, x + w / 2, y + h * 0.14, x + w - u, y + h * 0.40, ui.roofColor);
    // gold trim on roof peak
    px(ctx, x + w * 0.46, y + h * 0.14, w * 0.08, u * 1.5, '#e8c830');
    // scales/balance sign
    px(ctx, x + w * 0.48, y + h * 0.18, u, h * 0.08, '#d4a830');
    px(ctx, x + w * 0.42, y + h * 0.18, w * 0.16, u * 0.5, '#d4a830');
    // balance pans
    circ(ctx, x + w * 0.43, y + h * 0.22, u * 1.5, '#d4a830', 0.6);
    circ(ctx, x + w * 0.57, y + h * 0.22, u * 1.5, '#d4a830', 0.6);
  },

  town_hall(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 3, y + h * 0.15, w - u * 6, h * 0.78);
    // grand walls
    px(ctx, x + u * 3, y + h * 0.30, w - u * 6, h * 0.64, ui.wallColor);
    px(ctx, x + u * 3, y + h * 0.30, w - u * 6, h * 0.08, lerpColor(ui.wallColor, '#ffffff', 0.15));
    // pillared entrance
    for (let i = 0; i < 4; i++) {
      const pillarX = x + w * 0.22 + i * w * 0.18;
      px(ctx, pillarX, y + h * 0.50, u * 2, h * 0.44, '#d0c8c0');
      px(ctx, pillarX, y + h * 0.50, u * 2, u, '#e0d8d0');
      px(ctx, pillarX, y + h * 0.92, u * 2, u, '#e0d8d0');
    }
    // entrance lintel
    px(ctx, x + w * 0.20, y + h * 0.48, w * 0.60, u * 1.5, '#c0b8b0');
    // grand door
    px(ctx, x + w * 0.38, y + h * 0.56, w * 0.24, h * 0.38, '#4a3020');
    px(ctx, x + w * 0.49, y + h * 0.56, u, h * 0.38, '#3a2018');
    // windows on sides
    px(ctx, x + w * 0.08, y + h * 0.42, w * 0.08, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.84, y + h * 0.42, w * 0.08, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.08, y + h * 0.62, w * 0.08, h * 0.10, '#88c8e8');
    px(ctx, x + w * 0.84, y + h * 0.62, w * 0.08, h * 0.10, '#88c8e8');
    // main roof
    tri(ctx, x + u, y + h * 0.32, x + w / 2, y + h * 0.12, x + w - u, y + h * 0.32, ui.roofColor);
    // clock tower (center, rising above)
    px(ctx, x + w * 0.38, y + h * 0.02, w * 0.24, h * 0.20, ui.roofColor);
    px(ctx, x + w * 0.40, y + h * 0.05, w * 0.20, h * 0.14, lerpColor(ui.wallColor, '#ffffff', 0.1));
    // clock face
    circ(ctx, x + w * 0.50, y + h * 0.10, w * 0.05, '#e8e0d0');
    circ(ctx, x + w * 0.50, y + h * 0.10, w * 0.03, '#ffffff');
    // clock hands
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.50, y + h * 0.10);
    ctx.lineTo(x + w * 0.50, y + h * 0.07);
    ctx.moveTo(x + w * 0.50, y + h * 0.10);
    ctx.lineTo(x + w * 0.53, y + h * 0.10);
    ctx.stroke();
    // tower pinnacle
    tri(ctx, x + w * 0.40, y + h * 0.04, x + w * 0.50, y - h * 0.02, x + w * 0.60, y + h * 0.04, lerpColor(ui.roofColor, '#d4a830', 0.3));
  },

  bakery(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.28, w - u * 4, h * 0.62);
    // warm walls
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54, ui.wallColor);
    // warm glow on walls
    px(ctx, x + u * 3, y + h * 0.38, w - u * 6, h * 0.54, '#e8a040', 0.08);
    // door
    px(ctx, x + w * 0.40, y + h * 0.62, w * 0.14, h * 0.30, '#5a3a1a');
    // bread in window
    px(ctx, x + w * 0.15, y + h * 0.50, w * 0.16, h * 0.12, '#e8d080');
    px(ctx, x + w * 0.17, y + h * 0.52, w * 0.04, h * 0.06, '#c8a040'); // bread loaf 1
    px(ctx, x + w * 0.23, y + h * 0.53, w * 0.05, h * 0.05, '#d4a840'); // bread loaf 2
    // second window
    px(ctx, x + w * 0.68, y + h * 0.50, w * 0.16, h * 0.12, '#e8d080');
    // roof
    tri(ctx, x + u, y + h * 0.40, x + w / 2, y + h * 0.16, x + w - u, y + h * 0.40, ui.roofColor);
    // chimney
    px(ctx, x + w * 0.74, y + h * 0.08, w * 0.10, h * 0.24, '#6a4a3a');
    px(ctx, x + w * 0.74, y + h * 0.06, w * 0.12, u * 1.5, '#8a6a5a');
    // smoke wisps
    circ(ctx, x + w * 0.79, y + h * 0.02, u * 1.5, '#c0c0c0', 0.30);
    circ(ctx, x + w * 0.82, y - h * 0.02, u * 1.2, '#b0b0b0', 0.20);
    circ(ctx, x + w * 0.78, y - h * 0.06, u, '#a0a0a0', 0.12);
  },

  shrine(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.22, w - u * 4, h * 0.68);
    // mystical base
    px(ctx, x + u * 2, y + h * 0.60, w - u * 4, h * 0.32, ui.wallColor);
    px(ctx, x + u * 3, y + h * 0.60, w - u * 6, h * 0.08, lerpColor(ui.wallColor, '#ffffff', 0.12));
    // arched entrance
    px(ctx, x + w * 0.32, y + h * 0.55, w * 0.36, h * 0.37, '#3a2a4a');
    ctx.beginPath();
    ctx.arc(x + w * 0.50, y + h * 0.55, w * 0.18, Math.PI, 0, false);
    ctx.fillStyle = '#3a2a4a';
    ctx.fill();
    // glowing center
    circ(ctx, x + w * 0.50, y + h * 0.68, w * 0.08, '#e0c0ff', 0.6);
    circ(ctx, x + w * 0.50, y + h * 0.68, w * 0.12, '#c090e0', 0.25);
    circ(ctx, x + w * 0.50, y + h * 0.68, w * 0.18, '#a060c0', 0.10);
    // pillars
    px(ctx, x + w * 0.18, y + h * 0.30, u * 2, h * 0.50, '#a898c0');
    px(ctx, x + w - w * 0.18 - u * 2, y + h * 0.30, u * 2, h * 0.50, '#a898c0');
    // pointed roof
    tri(ctx, x + u, y + h * 0.32, x + w / 2, y + h * 0.08, x + w - u, y + h * 0.32, ui.roofColor);
    // ornament at peak
    circ(ctx, x + w * 0.50, y + h * 0.08, u * 2, '#c090e0', 0.7);
  },

  park(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // grass base
    px(ctx, x + u, y + u, w - u * 2, h - u * 2, '#3a7a3a');
    // stone path through center
    for (let i = 0; i < 6; i++) {
      const py = y + h * 0.20 + i * h * 0.12;
      ctx.beginPath();
      ctx.roundRect(x + w * 0.42, py, w * 0.16, h * 0.08, [u]);
      ctx.fillStyle = i % 2 === 0 ? '#8a8578' : '#9a9488';
      ctx.fill();
    }
    // trees
    const treePositions = [[0.15, 0.20], [0.80, 0.22], [0.18, 0.72], [0.82, 0.74]];
    treePositions.forEach(([tx, ty]) => {
      px(ctx, x + w * tx, y + h * ty + s * 0.08, u * 1.2, s * 0.12, '#5a3a20');
      circ(ctx, x + w * tx + u * 0.6, y + h * ty, s * 0.10, '#2a6a2a');
      circ(ctx, x + w * tx + u * 0.6, y + h * ty - s * 0.02, s * 0.07, '#3a8a3a', 0.7);
    });
    // bench
    px(ctx, x + w * 0.25, y + h * 0.48, w * 0.14, u * 1.2, '#7a5a3a');
    px(ctx, x + w * 0.26, y + h * 0.52, u * 0.8, u * 2, '#6a4a2a');
    px(ctx, x + w * 0.37, y + h * 0.52, u * 0.8, u * 2, '#6a4a2a');
    // fountain (center right)
    circ(ctx, x + w * 0.65, y + h * 0.50, s * 0.12, '#8a8a90');
    circ(ctx, x + w * 0.65, y + h * 0.50, s * 0.08, '#4090c0');
    circ(ctx, x + w * 0.65, y + h * 0.48, s * 0.03, '#80d0e8', 0.7);
    // flowers along edges
    const flowerColors = ['#e060a0', '#e0e040', '#e04040'];
    for (let i = 0; i < 5; i++) {
      circ(ctx, x + w * 0.10 + i * w * 0.20, y + h * 0.92, u, flowerColors[i % 3], 0.8);
    }
  },

  flower_bed(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    // soil bed
    px(ctx, x + u * 2, y + h * 0.30, w - u * 4, h * 0.55, '#5a3a18');
    px(ctx, x + u * 2.5, y + h * 0.32, w - u * 5, h * 0.50, '#6a4a28');
    // flowers in 3×2 grid (colors vary by variant/hash)
    const h2 = tileHash(Math.round(x), Math.round(y));
    const flowerSets = [
      ['#e060a0', '#f080c0', '#d040a0'],
      ['#e0e040', '#f0f060', '#c8c020'],
      ['#4080e0', '#60a0f0', '#3060c0'],
      ['#e04040', '#f06060', '#c02020'],
    ];
    const set = flowerSets[h2 % flowerSets.length];
    const positions = [[0.22, 0.38], [0.50, 0.35], [0.78, 0.38], [0.30, 0.58], [0.60, 0.56], [0.80, 0.60]];
    positions.forEach(([fx, fy], i) => {
      px(ctx, x + w * fx, y + h * fy + u, u * 0.5, u * 2, '#3a8a2a'); // stem
      circ(ctx, x + w * fx, y + h * fy, u * 1.4, set[i % set.length]);
      circ(ctx, x + w * fx, y + h * fy, u * 0.6, '#f0e080', 0.7); // center
    });
  },

  watchtower(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.10, w - u * 4, h * 0.82);
    // stone base
    px(ctx, x + w * 0.20, y + h * 0.70, w * 0.60, h * 0.22, '#7a7a80');
    px(ctx, x + w * 0.22, y + h * 0.72, w * 0.56, h * 0.04, '#9a9aa0');
    // tower shaft
    px(ctx, x + w * 0.28, y + h * 0.18, w * 0.44, h * 0.54, ui.wallColor);
    // stone texture lines
    for (let i = 0; i < 5; i++) {
      px(ctx, x + w * 0.28, y + h * 0.22 + i * h * 0.10, w * 0.44, u * 0.4, 'rgba(0,0,0,0.12)');
    }
    // window slits
    px(ctx, x + w * 0.42, y + h * 0.30, w * 0.06, h * 0.08, '#2a2a30');
    px(ctx, x + w * 0.42, y + h * 0.50, w * 0.06, h * 0.08, '#2a2a30');
    // observation platform
    px(ctx, x + w * 0.16, y + h * 0.14, w * 0.68, u * 1.5, '#6a5a4a');
    // crenellations
    for (let i = 0; i < 4; i++) {
      px(ctx, x + w * 0.18 + i * w * 0.18, y + h * 0.08, w * 0.10, u * 2, ui.wallColor);
    }
    // flag
    px(ctx, x + w * 0.72, y - h * 0.02, u, h * 0.14, '#5a4a3a');
    tri(ctx, x + w * 0.72 + u, y - h * 0.02, x + w * 0.72 + u, y + h * 0.04, x + w * 0.90, y + h * 0.01, '#e04040');
  },

  tavern(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 2, y + h * 0.25, w - u * 4, h * 0.65);
    // warm wooden walls
    px(ctx, x + u * 3, y + h * 0.36, w - u * 6, h * 0.56, ui.wallColor);
    px(ctx, x + u * 3, y + h * 0.36, w - u * 6, h * 0.56, '#e8a040', 0.06); // warm glow
    // log siding lines
    for (let i = 0; i < 5; i++) {
      px(ctx, x + u * 3, y + h * 0.38 + i * h * 0.10, w - u * 6, u * 0.4, '#6a4a2a');
    }
    // door (double wide)
    px(ctx, x + w * 0.36, y + h * 0.58, w * 0.28, h * 0.34, '#5a3a1a');
    px(ctx, x + w * 0.49, y + h * 0.58, u * 0.6, h * 0.34, '#4a2a10');
    // door handle
    circ(ctx, x + w * 0.44, y + h * 0.74, u * 0.8, '#c8a040');
    circ(ctx, x + w * 0.54, y + h * 0.74, u * 0.8, '#c8a040');
    // windows with warm glow
    px(ctx, x + w * 0.10, y + h * 0.48, w * 0.14, h * 0.12, '#e8c860');
    px(ctx, x + w * 0.10, y + h * 0.48, w * 0.14, h * 0.12, '#ffffff', 0.15);
    px(ctx, x + w * 0.76, y + h * 0.48, w * 0.14, h * 0.12, '#e8c860');
    px(ctx, x + w * 0.76, y + h * 0.48, w * 0.14, h * 0.12, '#ffffff', 0.15);
    // window cross-frames
    px(ctx, x + w * 0.10, y + h * 0.535, w * 0.14, u * 0.4, '#5a3a1a');
    px(ctx, x + w * 0.165, y + h * 0.48, u * 0.4, h * 0.12, '#5a3a1a');
    px(ctx, x + w * 0.76, y + h * 0.535, w * 0.14, u * 0.4, '#5a3a1a');
    px(ctx, x + w * 0.825, y + h * 0.48, u * 0.4, h * 0.12, '#5a3a1a');
    // roof
    tri(ctx, x + u, y + h * 0.38, x + w / 2, y + h * 0.14, x + w - u, y + h * 0.38, ui.roofColor);
    tri(ctx, x + u * 3, y + h * 0.38, x + w / 2, y + h * 0.18, x + w - u * 3, y + h * 0.38, lerpColor(ui.roofColor, '#ffffff', 0.12));
    // hanging sign
    px(ctx, x + w * 0.16, y + h * 0.24, u, h * 0.14, '#5a4a3a');
    px(ctx, x + w * 0.08, y + h * 0.26, w * 0.14, h * 0.10, '#d8b860');
    // mug icon on sign
    px(ctx, x + w * 0.12, y + h * 0.28, u * 1.5, u * 2, '#8a6030');
    // chimney with smoke
    px(ctx, x + w * 0.78, y + h * 0.08, w * 0.08, h * 0.22, '#6a4a3a');
    circ(ctx, x + w * 0.82, y + h * 0.04, u * 1.2, '#c0c0c0', 0.25);
    circ(ctx, x + w * 0.84, y + h * 0.01, u, '#b0b0b0', 0.15);
  },

  warehouse(ctx, x, y, w, h, ui, s) {
    const u = s * 0.06;
    shadow(ctx, x + u * 3, y + h * 0.18, w - u * 6, h * 0.74);
    // industrial walls
    px(ctx, x + u * 2, y + h * 0.28, w - u * 4, h * 0.66, ui.wallColor);
    // corrugated texture
    for (let i = 0; i < 8; i++) {
      const lx = x + u * 3 + i * (w - u * 6) / 8;
      px(ctx, lx, y + h * 0.30, u * 0.5, h * 0.60, 'rgba(0,0,0,0.06)');
    }
    // loading dock
    px(ctx, x + w * 0.05, y + h * 0.82, w * 0.90, h * 0.10, '#6a6a70');
    // large rolling doors
    px(ctx, x + w * 0.10, y + h * 0.45, w * 0.22, h * 0.38, '#5a5a60');
    px(ctx, x + w * 0.38, y + h * 0.45, w * 0.22, h * 0.38, '#5a5a60');
    px(ctx, x + w * 0.66, y + h * 0.45, w * 0.22, h * 0.38, '#5a5a60');
    // door handles
    px(ctx, x + w * 0.20, y + h * 0.62, u, u * 2, '#a0a0a4');
    px(ctx, x + w * 0.48, y + h * 0.62, u, u * 2, '#a0a0a4');
    px(ctx, x + w * 0.76, y + h * 0.62, u, u * 2, '#a0a0a4');
    // flat industrial roof
    px(ctx, x, y + h * 0.24, w, u * 2, ui.roofColor);
    px(ctx, x + u, y + h * 0.22, w - u * 2, u, lerpColor(ui.roofColor, '#ffffff', 0.15));
    // crate on dock
    px(ctx, x + w * 0.80, y + h * 0.74, u * 3, u * 3, '#c8a040');
    px(ctx, x + w * 0.80, y + h * 0.74, u * 3, u * 0.5, '#d8b050');
  },
};

export function drawBuildingSprite(ctx, biome, building, x, y, tileSize, isSelected = false) {
  const type = building.type || building.building_type;
  const ui = getBuildingUi(type);
  const biomeUi = getBiomeUi(biome);
  const width = tileSize * building.width;
  const height = tileSize * building.height;

  ctx.save();

  // attach biome for path drawing
  ui._biome = biome;

  const drawer = SPRITE_DRAWERS[type];
  if (drawer) {
    drawer(ctx, x, y, width, height, ui, tileSize);
    // dark outline on all buildings (except path)
    if (type !== 'path') {
      outline(ctx, x + 1, y + height * 0.12, width - 2, height * 0.82, 'rgba(0,0,0,0.40)');
    }
  } else {
    // fallback for unknown types
    px(ctx, x + 2, y + height * 0.15, width - 4, height * 0.70, ui.wallColor);
    outline(ctx, x + 2, y + height * 0.15, width - 4, height * 0.70, 'rgba(0,0,0,0.40)');
    tri(ctx, x, y + height * 0.18, x + width / 2, y + height * 0.02, x + width, y + height * 0.18, ui.roofColor);
  }

  // selection glow
  if (isSelected) {
    ctx.shadowColor = 'rgba(80,220,255,0.5)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(80,220,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

export function drawConstructionOverlay(ctx, building, x, y, tileSize, time = 0) {
  const width = tileSize * building.width;
  const height = tileSize * building.height;

  // semi-transparent dark overlay
  ctx.save();
  ctx.fillStyle = 'rgba(12,16,24,0.50)';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, width - 4, height - 4, 6);
  ctx.fill();

  // animated pulsing construction bars
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.004);
  const barH = Math.max(3, tileSize * 0.10);
  const barY = y + height * 0.78;
  const barW = width * 0.70;
  const barX = x + (width - barW) / 2;

  // background bar
  px(ctx, barX, barY, barW, barH, 'rgba(255,255,255,0.10)');
  // animated fill
  const fillAlpha = 0.5 + pulse * 0.4;
  const fillColor = `rgba(230,180,40,${fillAlpha})`;
  px(ctx, barX, barY, barW * (0.3 + pulse * 0.15), barH, fillColor);
  // stripes
  const stripeCount = Math.ceil(barW / (barH * 2));
  const offset = (time * 0.03) % (barH * 2);
  ctx.beginPath();
  ctx.rect(barX, barY, barW, barH);
  ctx.clip();
  for (let i = -1; i < stripeCount + 1; i++) {
    const sx = barX + i * barH * 2 + offset;
    ctx.fillStyle = `rgba(255,160,20,${0.15 + pulse * 0.10})`;
    ctx.beginPath();
    ctx.moveTo(sx, barY);
    ctx.lineTo(sx + barH, barY);
    ctx.lineTo(sx, barY + barH);
    ctx.lineTo(sx - barH, barY + barH);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export function drawSelectionOutline(ctx, x, y, width, height, color = 'rgba(80,220,255,0.95)') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(x) + 1, Math.round(y) + 1, Math.round(width) - 2, Math.round(height) - 2);
  ctx.restore();
}

export function drawGhostFootprint(ctx, x, y, tileSize, bw, bh, valid) {
  const width = tileSize * bw;
  const height = tileSize * bh;
  ctx.save();
  ctx.fillStyle = valid ? 'rgba(110,231,183,0.22)' : 'rgba(239,68,68,0.22)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = valid ? 'rgba(110,231,183,0.70)' : 'rgba(239,68,68,0.70)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.setLineDash([]);
  ctx.restore();
}

// Pet animation state: 0 = walking, 1 = idle/sitting, 2 = sleeping
function getPetAnimState(frameOffset) {
  if (frameOffset < 0.6) return 'walk';
  if (frameOffset < 0.85) return 'sit';
  return 'sleep';
}

const PET_PALETTES = {
  dojocat:  { body: '#4a4a52', head: '#5a5a64', eye: '#ffffff', pupil: '#222228', ear: '#4a4a52', belly: '#6a6a72', nose: '#3a3a40' },
  buu:      { body: '#e890b0', head: '#f0a0c0', eye: '#ffffff', pupil: '#3a1828', ear: '#e080a0', belly: '#f0b0d0', nose: '#c870a0' },
  devit:    { body: '#3a6aaa', head: '#4a7aba', eye: '#ffffff', pupil: '#1a2a44', ear: '#3060a0', belly: '#5a8aca', nose: '#2a4a8a' },
  pixiu:    { body: '#c8a040', head: '#d8b050', eye: '#ffffff', pupil: '#3a2a10', ear: '#b89030', belly: '#d8c060', nose: '#a88030' },
  tanuki:   { body: '#8a6a40', head: '#9a7a50', eye: '#ffffff', pupil: '#2a1a08', ear: '#6a4a28', belly: '#c0a878', nose: '#4a3018' },
  kitsune:  { body: '#d88040', head: '#e89050', eye: '#ffffff', pupil: '#2a1a10', ear: '#c06830', belly: '#e8b080', nose: '#a06028' },
  usagi:    { body: '#d0c8c0', head: '#e0d8d0', eye: '#ffffff', pupil: '#2a2028', ear: '#d8c8c0', belly: '#f0e8e0', nose: '#c0a0a0' },
  kappa:    { body: '#40a060', head: '#50b070', eye: '#ffffff', pupil: '#0a2a18', ear: '#308a48', belly: '#60c080', nose: '#2a8a48' },
};

export function drawPetWander(ctx, x, y, tileSize, character, frameOffset) {
  const s = tileSize;
  const animState = getPetAnimState(frameOffset);
  const frame = (frameOffset * 4) | 0; // 0-3 sub-frames
  const bobPhase = Math.sin(frameOffset * Math.PI * 2);
  const pal = PET_PALETTES[character] || PET_PALETTES.dojocat;

  ctx.save();

  const cx = x;

  if (animState === 'walk') {
    const bobY = bobPhase * s * 0.03;
    const cy = y + bobY;
    // shadow
    circ(ctx, cx, cy + s * 0.02, s * 0.16, 'rgba(0,0,0,0.18)');
    // body
    circ(ctx, cx, cy - s * 0.06, s * 0.14, pal.body);
    // belly highlight
    circ(ctx, cx, cy - s * 0.04, s * 0.08, pal.belly, 0.5);
    // limbs walk cycle
    const limbA = Math.sin(frameOffset * Math.PI * 4) * s * 0.03;
    px(ctx, cx - s * 0.08, cy + s * 0.04 + limbA, s * 0.05, s * 0.06, pal.body);
    px(ctx, cx + s * 0.03, cy + s * 0.04 - limbA, s * 0.05, s * 0.06, pal.body);
    // tail
    const tailWag = Math.sin(frameOffset * Math.PI * 6) * s * 0.02;
    px(ctx, cx - s * 0.02, cy - s * 0.14 + tailWag, s * 0.04, s * 0.03, pal.body);
    // head
    circ(ctx, cx, cy - s * 0.18, s * 0.12, pal.head);
    // ears
    px(ctx, cx - s * 0.10, cy - s * 0.28, s * 0.05, s * 0.06, pal.ear);
    px(ctx, cx + s * 0.05, cy - s * 0.28, s * 0.05, s * 0.06, pal.ear);
    // eyes
    const eyeY = cy - s * 0.18;
    circ(ctx, cx - s * 0.04, eyeY, s * 0.03, pal.eye);
    circ(ctx, cx + s * 0.04, eyeY, s * 0.03, pal.eye);
    circ(ctx, cx - s * 0.04, eyeY, s * 0.015, pal.pupil);
    circ(ctx, cx + s * 0.04, eyeY, s * 0.015, pal.pupil);
    // nose
    circ(ctx, cx, cy - s * 0.155, s * 0.012, pal.nose);
  } else if (animState === 'sit') {
    const cy = y;
    // shadow (wider when sitting)
    circ(ctx, cx, cy + s * 0.04, s * 0.18, 'rgba(0,0,0,0.15)');
    // body (rounder when sitting)
    circ(ctx, cx, cy - s * 0.02, s * 0.16, pal.body);
    circ(ctx, cx, cy + s * 0.01, s * 0.10, pal.belly, 0.5);
    // front paws
    px(ctx, cx - s * 0.06, cy + s * 0.08, s * 0.04, s * 0.03, pal.body);
    px(ctx, cx + s * 0.02, cy + s * 0.08, s * 0.04, s * 0.03, pal.body);
    // tail curled to side
    ctx.beginPath();
    ctx.arc(cx + s * 0.12, cy, s * 0.05, 0, Math.PI * 1.4);
    ctx.strokeStyle = pal.body;
    ctx.lineWidth = s * 0.03;
    ctx.stroke();
    // head (slight tilt)
    circ(ctx, cx, cy - s * 0.16, s * 0.12, pal.head);
    // ears (perked)
    tri(ctx, cx - s * 0.10, cy - s * 0.25, cx - s * 0.06, cy - s * 0.32, cx - s * 0.02, cy - s * 0.25, pal.ear);
    tri(ctx, cx + s * 0.02, cy - s * 0.25, cx + s * 0.06, cy - s * 0.32, cx + s * 0.10, cy - s * 0.25, pal.ear);
    // eyes (blink occasionally)
    const blink = frame === 3;
    const eyeY = cy - s * 0.16;
    if (blink) {
      px(ctx, cx - s * 0.05, eyeY, s * 0.04, s * 0.008, pal.pupil);
      px(ctx, cx + s * 0.01, eyeY, s * 0.04, s * 0.008, pal.pupil);
    } else {
      circ(ctx, cx - s * 0.04, eyeY, s * 0.03, pal.eye);
      circ(ctx, cx + s * 0.04, eyeY, s * 0.03, pal.eye);
      circ(ctx, cx - s * 0.04, eyeY, s * 0.015, pal.pupil);
      circ(ctx, cx + s * 0.04, eyeY, s * 0.015, pal.pupil);
    }
    circ(ctx, cx, cy - s * 0.135, s * 0.012, pal.nose);
  } else {
    // sleeping
    const breathe = Math.sin(frameOffset * Math.PI * 2) * s * 0.01;
    const cy = y + s * 0.02;
    // shadow
    circ(ctx, cx, cy + s * 0.04, s * 0.20, 'rgba(0,0,0,0.12)');
    // curled body (oval)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.16 + breathe, s * 0.10, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.body;
    ctx.fill();
    ctx.restore();
    // belly
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.02, cy + s * 0.02, s * 0.10, s * 0.06, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = pal.belly;
    ctx.globalAlpha = 0.4;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    // tail wrapping around
    ctx.beginPath();
    ctx.arc(cx - s * 0.10, cy - s * 0.02, s * 0.06, 0, Math.PI * 1.6);
    ctx.strokeStyle = pal.body;
    ctx.lineWidth = s * 0.025;
    ctx.stroke();
    // head tucked
    circ(ctx, cx + s * 0.10, cy - s * 0.06, s * 0.09, pal.head);
    // closed eyes (zzz)
    px(ctx, cx + s * 0.06, cy - s * 0.07, s * 0.03, s * 0.006, pal.pupil);
    px(ctx, cx + s * 0.12, cy - s * 0.07, s * 0.03, s * 0.006, pal.pupil);
    // ear
    px(ctx, cx + s * 0.08, cy - s * 0.14, s * 0.04, s * 0.04, pal.ear);
    // zzz bubbles
    const zPhase = (frameOffset * 2) % 1;
    ctx.globalAlpha = 0.4 - zPhase * 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(s * 0.08)}px sans-serif`;
    ctx.fillText('z', cx + s * 0.18, cy - s * 0.10 - zPhase * s * 0.06);
    ctx.font = `${Math.round(s * 0.06)}px sans-serif`;
    ctx.fillText('z', cx + s * 0.22, cy - s * 0.16 - zPhase * s * 0.04);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

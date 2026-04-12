/**
 * petWorldCuteFantasySprites.js
 *
 * Cute Fantasy sprite pack integration for Pet World.
 * Highest priority in the draw fallback chain:
 *   CuteFantasy → Kenney → Atlas → Procedural
 *
 * Uses the same lazy-loading IMAGE_CACHE pattern as petWorldKenneySprites.js.
 */

/* ═══ Image cache ═══ */

const IMAGE_CACHE = new Map();

function getImage(src) {
  if (typeof Image === 'undefined') return null;
  if (IMAGE_CACHE.has(src)) return IMAGE_CACHE.get(src);
  const img = new Image();
  const entry = { image: img, loaded: false };
  img.onload = () => { entry.loaded = true; };
  img.src = src;
  IMAGE_CACHE.set(src, entry);
  return entry;
}

/* ═══ Path helper ═══ */

const CF = '/pet-world/cute-fantasy';

function cfp(...parts) {
  return (CF + '/' + parts.join('/')).replace(/ /g, '%20');
}

/* ═══ Draw helpers ═══ */

/** Draw an entire image at (x, y, w, h). Returns false if not loaded. */
function drawImg(ctx, src, x, y, w, h, facing, alpha) {
  const entry = getImage(src);
  if (!entry?.loaded) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (alpha != null) ctx.globalAlpha = alpha;
  if (facing === -1) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(entry.image, 0, 0, w, h);
  } else {
    ctx.drawImage(entry.image, x, y, w, h);
  }
  ctx.restore();
  return true;
}

/** Draw sub-rectangle (sx,sy,sw,sh) from src into (dx,dy,dw,dh). */
function drawFrame(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh, facing, alpha) {
  const entry = getImage(src);
  if (!entry?.loaded) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (alpha != null) ctx.globalAlpha = alpha;
  if (facing === -1) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(entry.image, sx, sy, sw, sh, 0, 0, dw, dh);
  } else {
    ctx.drawImage(entry.image, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  ctx.restore();
  return true;
}

function pick(arr, seed) {
  if (!arr?.length) return null;
  return arr[Math.abs(seed) % arr.length];
}

function dropShadow(ctx, cx, cy, rx, ry, a) {
  ctx.save();
  ctx.globalAlpha = a ?? 0.22;
  ctx.fillStyle = '#1a1208';
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ═══ Building type resolver ═══ */

function bType(buildingOrType) {
  if (!buildingOrType) return '';
  if (typeof buildingOrType === 'string') return buildingOrType;
  return buildingOrType.type || buildingOrType.building_type || '';
}

/* ═══════════════════════════════════════════════════════
   SPRITE DATA
   ═══════════════════════════════════════════════════════ */

/* ── Building sprites ── */

const BB = 'Buildings/Buildings';
const UB = BB + '/Unique_Buildings';
const HW = BB + '/Houses/Wood';
const OD = 'Outdoor decoration';

// p = path, w/h = full image dims, f = [sx,sy,sw,sh] frame extraction, tile = fill-tile mode
const BUILDINGS = {
  // Houses
  house:           { p: HW + '/House_1_Wood_Base_Blue.png', w: 96, h: 128 },
  large_house:     { p: UB + '/Inn/Inn_Blue.png', w: 240, h: 192 },
  bakery:          { p: HW + '/House_3_Wood_Base_Blue.png', w: 144, h: 128 },
  weaving_hut:     { p: HW + '/House_2_Wood_Base_Blue.png', w: 144, h: 128 },
  tavern:          { p: HW + '/House_4_Wood_Base_Blue.png', w: 112, h: 96 },
  // Barns / storage
  farm:            { p: UB + '/Barn/Barn_Base_Blue.png', w: 128, h: 144 },
  storehouse:      { p: UB + '/Barn/Barn_Green_Blue.png', w: 128, h: 144 },
  warehouse:       { p: UB + '/Greenhouse/Greenhouse_Green.png', f: [0, 0, 128, 128] },
  // Industrial
  woodcutters_hut: { p: UB + '/Shed/Shed_Base_Blue.png', w: 96, h: 112 },
  lumberyard:      { p: UB + '/Shed/Shed_Green_Blue.png', w: 96, h: 112 },
  fishing_hut:     { p: UB + '/Fisherman_House/Fisherman_House_Base_Blue.png', w: 96, h: 112 },
  quarry:          { p: UB + '/Blacksmith_House/Blacksmith_House_Blue.png', w: 160, h: 128 },
  stone_pit:       { p: UB + '/Silo/Silo.png', w: 48, h: 80 },
  watchtower:      { p: UB + '/Silo/Silo.png', w: 48, h: 80 },
  // Commerce
  market:          { p: UB + '/Stalls/Market_Stalls.png', w: 192, h: 48 },
  trading_post:    { p: UB + '/Stalls/Market_Stalls.png', w: 192, h: 48 },
  // Civic / special
  shrine:          { p: UB + '/Windmill/Windmill.png', w: 128, h: 112 },
  town_hall:       { p: UB + '/Church/Church_Blue.png', f: [0, 0, 112, 144] },
  // Outdoor
  well:            { p: OD + '/Well.png', w: 32, h: 48 },
  park:            { p: OD + '/Fountain.png', w: 32, h: 80 },
  garden:          { p: OD + '/Flowers.png', f: [0, 0, 32, 32] },
  // Tile-fill
  path:            { p: 'Tiles/Grass/Path_Middle.png', w: 16, h: 16, tile: true },
};

/* ── Tree sprites (Medium trees: 96×48, 3 frames at 32×48 each) ── */

const TREES = {
  oak:    'Trees/Medium_Oak_Tree.png',
  birch:  'Trees/Medium_Birch_Tree.png',
  spruce: 'Trees/Medium_Spruce_Tree.png',
  fruit:  'Trees/Medium_Fruit_Tree.png',
};

const BIOME_TREES = {
  grasslands: ['oak', 'birch', 'fruit'],
  forest:     ['spruce', 'oak', 'birch'],
  coastal:    ['birch', 'fruit', 'oak'],
  mountain:   ['spruce', 'oak'],
  desert:     ['oak'],
  tropical:   ['fruit', 'oak', 'birch'],
  tundra:     ['spruce'],
  volcanic:   ['oak'],
};

/* ── Wang tile auto-tiling ── */

// Wang tile lookup: index (NW*8 + NE*4 + SW*2 + SE, 0=lower 1=upper) → [sx, sy] in 64×64 sheet
const WANG_LOOKUP = [
  [32, 16], [48, 16], [32, 32], [16, 32],  //  0-3
  [32, 0],  [48, 32], [0, 16],  [48, 48],  //  4-7
  [16, 16], [32, 48], [16, 0],  [0, 32],   //  8-11
  [48, 0],  [0, 0],   [16, 48], [0, 48],   // 12-15
];

const WANG_WATER_GRASS = 'Tiles/wang_water_grass.png';   // PixelLab water↔grass 4×4 Wang tileset

/* ── Grass variations (4 tiles to break checkerboard) ── */

const GRASS_VARS = [
  'Tiles/Grass/Grass_1_Middle.png',
  'Tiles/Grass/Grass_2_Middle.png',
  'Tiles/Grass/Grass_3_Middle.png',
  'Tiles/Grass/Grass_4_Middle.png',
];

// Each biome picks grass variants with weighted pools (index into GRASS_VARS)
const BIOME_GRASS_POOL = {
  grasslands: [0, 0, 1, 2],
  forest:     [1, 1, 2, 0],
  coastal:    [2, 2, 0, 3],
  mountain:   [3, 3, 2, 3],
  tropical:   [0, 0, 2, 0],
  tundra:     [3, 3, 3, 2],
};

const SAND_GROUND = 'Tiles/Grass/Path_Middle.png';

/* ── Rock / bush frame positions ── */

// Ores.png (128×128) — pick 16×16 rock regions
const ROCKS = [
  [0, 0], [0, 16], [16, 0], [16, 16],
  [32, 0], [32, 16], [48, 0], [48, 16],
];
// Flowers.png (160×160) — pick 16×16 flower/bush regions
const BUSHES = [
  [0, 0], [16, 0], [32, 0], [48, 0], [64, 0],
  [0, 16], [16, 16], [32, 16], [48, 16], [64, 16],
];

/* ── Animal sprites (all 32×32 frame grids) ── */

const ANIMALS = {
  chicken: { p: 'Animals/Chicken/Chicken_01.png', cols: 8 },
  pig:     { p: 'Animals/Pig/Pig_01.png',         cols: 9 },
  sheep:   { p: 'Animals/Sheep/Sheep_01.png',     cols: 8 },
  duck:    { p: 'Animals/Duck/Duck_01.png',        cols: 8 },
  cow:     { p: 'Animals/Cow/Cow_01.png',          cols: 8 },
  frog:    { p: 'Animals/Frog/Frog_01.png',        cols: 10 },
  mouse:   { p: 'Animals/Mouse/Mouse_01.png',      cols: 10 },
  goose:   { p: 'Animals/Goose/Goose_01.png',      cols: 12 },
  horse:   { p: 'Animals/Horse/Horse_01.png',       cols: 8 },
};

// Small creatures — different frame layouts
const SMALL = {
  butterfly: { p: 'Animals/Butterfly/Butterfly.png', fw: 16, fh: 16, vert: true, n: 4 },
  bee:       { p: 'Animals/Bee/Bee_Flying_Animation.png', fw: 32, fh: 32, vert: false, n: 2 },
};

/* ── Species / pet mapping ── */

const CRITTER_MAP = {
  butterfly: 'butterfly', bee: 'bee', frog: 'frog',
  bird: 'chicken', rabbit: 'mouse', squirrel: 'mouse',
  dragonfly: 'butterfly', ladybug: 'bee', firefly: 'bee',
  duck: 'duck', goose: 'goose',
};

const PET_MAP = {
  dojocat: 'mouse', buu: 'pig', devit: 'frog', pixiu: 'horse',
  tanuki: 'cow', kitsune: 'duck', usagi: 'sheep', kappa: 'frog',
};

/* ── NPC residents (48×64 frame size) ── */

const NPCS = {
  teal:  'NPCs (Premade)/Fisherman_Fin.png',
  berry: 'NPCs (Premade)/Chef_Chloe.png',
  ochre: 'NPCs (Premade)/Farmer_Bob.png',
  slate: 'NPCs (Premade)/Miner_Mike.png',
  moss:  'NPCs (Premade)/Lumberjack_Jack.png',
  plum:  'NPCs (Premade)/Bartender_Katy.png',
};

const NPC_FW = 48;
const NPC_FH = 64;

/* ═══════════════════════════════════════════════════════
   EXPORTED DRAW FUNCTIONS
   ═══════════════════════════════════════════════════════ */

/**
 * Overlay Cute Fantasy ground tile with auto-tiling.
 * Handles: water centre, water↔grass Wang transitions, grass variations.
 * @param {object} neighbors - { n, s, e, w, nw, ne, sw, se } tile-type strings
 * @param {number} seed      - position-based hash for deterministic variation
 */
export function drawCuteFantasyGround(ctx, biome, tile, x, y, size, neighbors, seed) {
  const h = seed || 0;

  /* ── Water tiles ── */
  if (tile.t === 'water') {
    return drawImg(ctx, cfp('Tiles/Water/Water_Middle.png'), x, y, size, size);
  }

  /* ── Non-water tiles: Wang water↔grass transition ── */
  if (neighbors) {
    const w = (t) => t === 'water';
    // Each corner = 0 if ANY adjacent tile in that direction is water
    const cNW = (w(neighbors.n) || w(neighbors.w) || w(neighbors.nw)) ? 0 : 1;
    const cNE = (w(neighbors.n) || w(neighbors.e) || w(neighbors.ne)) ? 0 : 1;
    const cSW = (w(neighbors.s) || w(neighbors.w) || w(neighbors.sw)) ? 0 : 1;
    const cSE = (w(neighbors.s) || w(neighbors.e) || w(neighbors.se)) ? 0 : 1;

    const idx = cNW * 8 + cNE * 4 + cSW * 2 + cSE;

    if (idx < 15) {
      // Has water influence at one or more corners → draw Wang transition tile
      const [sx, sy] = WANG_LOOKUP[idx];
      if (drawFrame(ctx, cfp(WANG_WATER_GRASS), sx, sy, 16, 16, x, y, size, size)) {
        return true;
      }
      // Fall through to grass variation while Wang image loads
    }
  }

  /* ── Desert / volcanic → sand ground ── */
  if (biome === 'desert' || biome === 'volcanic') {
    return drawImg(ctx, cfp(SAND_GROUND), x, y, size, size);
  }

  /* ── Grass variation based on position hash ── */
  const pool = BIOME_GRASS_POOL[biome] || [0, 1, 2, 3];
  const vi = pool[Math.abs(h) % pool.length];
  return drawImg(ctx, cfp(GRASS_VARS[vi]), x, y, size, size);
}

/**
 * Draw terrain feature (tree / rock / bush). Returns boolean.
 * Signature matches drawKenneyTerrain.
 */
export function drawCuteFantasyTerrain(ctx, biome, tile, x, y, size, seed, terrain) {
  if (tile.t === 'tree') {
    const treeType = pick(BIOME_TREES[biome] || BIOME_TREES.grasslands, seed);
    const file = TREES[treeType];
    if (!file) return false;
    // Medium trees: 96×48, 3 variant frames at 32×48
    const fi = Math.abs(seed >> 2) % 3;
    const treeW = size;
    const treeH = size * 1.5; // 48/32 aspect ratio
    dropShadow(ctx, x + size * 0.5, y + size * 0.9, size * 0.32, size * 0.1, 0.25);
    return drawFrame(
      ctx, cfp(file),
      fi * 32, 0, 32, 48,
      x, y - size * 0.5, treeW, treeH,
    );
  }

  if (tile.t === 'rock') {
    const [sx, sy] = pick(ROCKS, seed);
    const rockSize = size * 0.7;
    const off = size * 0.15;
    dropShadow(ctx, x + size * 0.5, y + size * 0.86, size * 0.24, size * 0.08, 0.2);
    return drawFrame(
      ctx, cfp(OD + '/Ores.png'),
      sx, sy, 16, 16,
      x + off, y + off, rockSize, rockSize,
    );
  }

  if (tile.t === 'bush') {
    const [sx, sy] = pick(BUSHES, seed);
    return drawFrame(
      ctx, cfp(OD + '/Flowers.png'),
      sx, sy, 16, 16,
      x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76,
    );
  }

  return false;
}

/**
 * Draw building sprite. Returns boolean.
 * Signature matches drawKenneyBuilding.
 */
export function drawCuteFantasyBuilding(ctx, buildingOrType, x, y, width, height) {
  const type = bType(buildingOrType);
  const b = BUILDINGS[type];
  if (!b) return false;

  const src = cfp(b.p);

  // Tile-fill mode: cover the entire footprint
  if (b.tile) {
    return drawImg(ctx, src, x, y, width, height);
  }

  // Frame extraction from spritesheet
  if (b.f) {
    const [sx, sy, sw, sh] = b.f;
    const sc = Math.min(width / sw, height / sh);
    const dw = sw * sc;
    const dh = sh * sc;
    const dx = x + (width - dw) / 2;
    const dy = y + height - dh;
    dropShadow(ctx, dx + dw * 0.5, dy + dh * 0.94, dw * 0.38, dh * 0.06, 0.22);
    return drawFrame(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // Full image, scaled to fit bottom-center
  const sc = Math.min(width / b.w, height / b.h);
  const dw = b.w * sc;
  const dh = b.h * sc;
  const dx = x + (width - dw) / 2;
  const dy = y + height - dh;
  dropShadow(ctx, dx + dw * 0.5, dy + dh * 0.94, dw * 0.38, dh * 0.06, 0.22);
  return drawImg(ctx, src, dx, dy, dw, dh);
}

/**
 * Draw NPC village resident. Returns boolean.
 * Signature matches drawKenneyResident.
 */
export function drawCuteFantasyResident(ctx, x, y, tileSize, paletteKey, activity, frameOffset, facing) {
  const file = NPCS[paletteKey];
  if (!file) return false;

  const src = cfp(file);
  const entry = getImage(src);
  if (!entry?.loaded) return false;

  // Walk cycle: first row, first 4 frames
  const cols = Math.floor(entry.image.width / NPC_FW);
  const n = Math.min(cols, 4);
  const fi = activity === 'stroll' ? Math.floor(frameOffset * 4) % n : 0;
  const sx = fi * NPC_FW;
  const sy = 0;

  const dw = tileSize * 0.72;
  const dh = dw * (NPC_FH / NPC_FW);
  const bob = activity === 'stroll'
    ? Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.02
    : 0;

  return drawFrame(
    ctx, src,
    sx, sy, NPC_FW, NPC_FH,
    x - dw / 2, y - dh * 0.82 + bob, dw, dh,
    facing === -1 ? -1 : 1,
  );
}

/**
 * Draw ambient critter. Returns boolean.
 * Signature matches drawKenneyCritter.
 */
export function drawCuteFantasyCritter(ctx, x, y, tileSize, species, frameOffset, options) {
  const mapped = CRITTER_MAP[species];
  if (!mapped) return false;

  const fac = options?.facing || 1;
  const scale = options?.scale || 0.6;

  // Small creatures (butterfly, bee) — different spritesheet layouts
  const sm = SMALL[mapped];
  if (sm) {
    const fi = Math.floor(frameOffset * 4) % sm.n;
    const sx = sm.vert ? 0 : fi * sm.fw;
    const sy = sm.vert ? fi * sm.fh : 0;
    const d = tileSize * scale;
    const hover = Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.04;
    return drawFrame(
      ctx, cfp(sm.p),
      sx, sy, sm.fw, sm.fh,
      x - d / 2, y - d * 0.7 + hover, d, d,
      fac,
    );
  }

  // Regular animals (32×32 frame grid)
  const an = ANIMALS[mapped];
  if (!an) return false;

  const fi = Math.floor(frameOffset * 4) % Math.min(an.cols, 4);
  const d = tileSize * scale;
  const bob = Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.015;
  return drawFrame(
    ctx, cfp(an.p),
    fi * 32, 0, 32, 32,
    x - d / 2, y - d * 0.6 + bob, d, d,
    fac,
  );
}

/**
 * Draw pet character. Returns boolean.
 * Called before drawPetAtlas in the fallback chain.
 */
export function drawCuteFantasyPet(ctx, x, y, tileSize, character, frameOffset) {
  const mapped = PET_MAP[character];
  if (!mapped) return false;

  const an = ANIMALS[mapped];
  if (!an) return false;

  const fi = Math.floor(frameOffset * 4) % Math.min(an.cols, 4);
  const d = tileSize * 0.9;
  const bob = Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.02;

  dropShadow(ctx, x, y + d * 0.08, d * 0.28, d * 0.09, 0.2);

  return drawFrame(
    ctx, cfp(an.p),
    fi * 32, 0, 32, 32,
    x - d / 2, y - d * 0.65 + bob, d, d,
  );
}

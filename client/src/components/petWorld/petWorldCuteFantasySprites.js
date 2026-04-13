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

// Subtle contact shadow — thin ground-line instead of floating blob disc
function dropShadow(ctx, cx, cy, rx, ry, a) {
  ctx.save();
  ctx.globalAlpha = (a ?? 0.22) * 0.35;  // much more subtle
  ctx.fillStyle = '#1a1208';
  // Flat thin ellipse (ry capped at ~30% of rx) for grounded contact feel
  const flatRy = Math.max(1, Math.min(ry, rx * 0.3));
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(1, rx * 0.7), flatRy, 0, 0, Math.PI * 2);
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

const BUILDINGS = {
  house:           { p: HW + '/House_1_Wood_Base_Blue.png', w: 96, h: 128 },
  large_house:     { p: UB + '/Inn/Inn_Blue.png', w: 240, h: 192 },
  bakery:          { p: HW + '/House_3_Wood_Base_Blue.png', w: 144, h: 128 },
  weaving_hut:     { p: HW + '/House_2_Wood_Base_Blue.png', w: 144, h: 128 },
  tavern:          { p: HW + '/House_4_Wood_Base_Blue.png', w: 112, h: 96 },
  farm:            { p: UB + '/Barn/Barn_Base_Blue.png', w: 128, h: 144 },
  storehouse:      { p: UB + '/Barn/Barn_Green_Blue.png', w: 128, h: 144 },
  warehouse:       { p: UB + '/Greenhouse/Greenhouse_Green.png', f: [0, 0, 128, 128] },
  woodcutters_hut: { p: UB + '/Shed/Shed_Base_Blue.png', w: 96, h: 112 },
  lumberyard:      { p: UB + '/Shed/Shed_Green_Blue.png', w: 96, h: 112 },
  fishing_hut:     { p: UB + '/Fisherman_House/Fisherman_House_Base_Blue.png', w: 96, h: 112 },
  quarry:          { p: UB + '/Blacksmith_House/Blacksmith_House_Blue.png', w: 160, h: 128 },
  stone_pit:       { p: UB + '/Silo/Silo.png', w: 48, h: 80 },
  watchtower:      { p: UB + '/Silo/Silo.png', w: 48, h: 80 },
  market:          { p: UB + '/Stalls/Market_Stalls.png', w: 192, h: 48 },
  trading_post:    { p: UB + '/Stalls/Market_Stalls.png', w: 192, h: 48 },
  shrine:          { p: UB + '/Windmill/Windmill.png', w: 128, h: 112 },
  town_hall:       { p: UB + '/Church/Church_Blue.png', f: [0, 0, 112, 144] },
  well:            { p: OD + '/Well.png', w: 32, h: 48 },
  park:            { p: OD + '/Fountain.png', w: 32, h: 80 },
  garden:          { p: OD + '/Flowers.png', f: [0, 0, 32, 32] },
  flower_bed:      { p: OD + '/Flowers.png', f: [0, 0, 32, 32] },
  path:            { p: 'Tiles/Grass/Path_Middle.png', w: 16, h: 16, tile: true },
};

/* ── Tree sprites ── */
// Big trees: 192x80 → 3 frames at 64x80 each (oak, spruce), 96x80 → birch (1 frame at 96x80)
// Medium trees: 96x48 → 3 frames at 32x48 each
// Small trees: 96x64 → 3 frames at 32x64 each (oak), 96x64 (birch/spruce/fruit)

const BIG_TREES = {
  oak:    { p: 'Trees/Big_Oak_Tree.png',     fw: 64, fh: 80, n: 3 },
  birch:  { p: 'Trees/Big_Birch_Tree.png',   fw: 32, fh: 80, n: 3 },
  spruce: { p: 'Trees/Big_Spruce_tree.png',  fw: 64, fh: 80, n: 3 },
  fruit:  { p: 'Trees/Big_Fruit_Tree.png',   fw: 32, fh: 64, n: 3 },
};

const MEDIUM_TREES = {
  oak:    { p: 'Trees/Medium_Oak_Tree.png',   fw: 32, fh: 48, n: 3 },
  birch:  { p: 'Trees/Medium_Birch_Tree.png', fw: 32, fh: 48, n: 3 },
  spruce: { p: 'Trees/Medium_Spruce_Tree.png', fw: 32, fh: 48, n: 3 },
  fruit:  { p: 'Trees/Medium_Fruit_Tree.png', fw: 32, fh: 48, n: 3 },
};

const SMALL_TREES = {
  oak:    { p: 'Trees/Small_Oak_Tree.png',    fw: 32, fh: 64, n: 3 },
  birch:  { p: 'Trees/Small_Birch_Tree.png',  fw: 32, fh: 64, n: 3 },
  spruce: { p: 'Trees/Small_Spruce_Tree.png', fw: 32, fh: 64, n: 3 },
  fruit:  { p: 'Trees/Small_Fruit_Tree.png',  fw: 32, fh: 64, n: 3 },
};

// Legacy alias kept for compatibility
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

/* ── Ground tiles ── */

// Single grass tile for consistent colour — NO multi-colour variation
const GRASS_TILE = 'Tiles/Grass/Grass_1_Middle.png';
const SAND_TILE  = 'Tiles/Grass/Path_Middle.png';

// Animated connected-water tileset (color-matched to Wang tileset)
// Water_Tile_1_Anim.png = 384x80 = 8 frames × 48x80 connected tileset (3×5 @ 16px)
// Centre tile of each frame = pure animated water matching shore transitions
const WATER_CONN_ANIM    = 'Tiles/Water/Water_Tile_1_Anim.png';
const WATER_CONN_FRAME_W = 48;  // width of one connected-tileset frame
const WATER_CONN_FRAMES  = 8;   // number of animation frames

/* ── Wang tile auto-tiling ── */

// Wang tile lookup: index (NW*8 + NE*4 + SW*2 + SE, 0=lower 1=upper) → [sx, sy]
const WANG_LOOKUP = [
  [32, 16], [48, 16], [32, 32], [16, 32],  //  0-3
  [32, 0],  [48, 32], [0, 16],  [48, 48],  //  4-7
  [16, 16], [32, 48], [16, 0],  [0, 32],   //  8-11
  [48, 0],  [0, 0],   [16, 48], [0, 48],   // 12-15
];
const WANG_WATER_GRASS = 'Tiles/wang_water_grass.png';
const WANG_GRASS_PATH  = 'Tiles/wang_grass_path.png';

/* ── Grass variation tiles (16x16 each) ── */
const GRASS_VARIANTS = [
  'Tiles/Grass/Grass_2_Middle.png',
  'Tiles/Grass/Grass_3_Middle.png',
  'Tiles/Grass/Grass_4_Middle.png',
];

/* ── Biome-specific grass tints ── */
const BIOME_TINTS = {
  forest:    { color: '#1a3a12', alpha: 0.06 },   // darker, deeper green
  coastal:   { color: '#c8d8a0', alpha: 0.04 },   // lighter, sun-bleached
  mountain:  { color: '#8a9a7a', alpha: 0.05 },   // cool grey-green
  desert:    { color: '#d4c088', alpha: 0.08 },   // warm sandy
  tropical:  { color: '#2a5a18', alpha: 0.05 },   // lush deep green
  tundra:    { color: '#a0b8a8', alpha: 0.06 },   // frosty blue-green
  volcanic:  { color: '#4a3a2a', alpha: 0.07 },   // ashy earth
};

/* ── Animated flower-grass overlays ── */
// Flower_Grass_1-15_Anim.png = 128x16, 8 frames at 16x16 each
const FLOWER_GRASS_DIR    = 'Outdoor decoration/Outdoor_Decor_Animations/Grass_Animations/';
const FLOWER_GRASS_COUNT  = 15;
const FLOWER_GRASS_FRAMES = 8;

/* ── Water decoration overlays ── */
// Lillypad animations: 128x16 = 8 frames at 16x16 each
const WATER_DECOR_DIR = 'Outdoor decoration/Outdoor_Decor_Animations/Water_Decor_Animations/Water_Plants/';
const WATER_LILLYPADS = [
  'Lillypad_Green_1_Anim.png',
  'Lillypad_Green_4_Anim.png',
  'Lillypad_Green_5_Anim.png',
];
const WATER_LILLYPAD_FRAMES = 8;
// Animated pure water overlay for richer shimmer
const WATER_MIDDLE_ANIM = 'Tiles/Water/Water_Middle_Anim_1.png';
const WATER_MIDDLE_FRAMES = 8;

/* ── Animated flower garden sprites ── */
// Flowers_1-5_Anim.png in Not_Potted = 96x160 = 6cols×10rows of 16x16 frames
const FLOWER_ANIM_DIR = 'Outdoor decoration/Outdoor_Decor_Animations/Flower_Animations/Not_Potted/';
const FLOWER_ANIM_FILES = [
  'Flowers_1_Anim.png', 'Flowers_2_Anim.png', 'Flowers_3_Anim.png',
  'Flowers_4_Anim.png', 'Flowers_5_Anim.png',
];
const FLOWER_ANIM_FW = 16;
const FLOWER_ANIM_FH = 16;
const FLOWER_ANIM_COLS = 6;
const FLOWER_ANIM_ROWS = 10;

/* ── Rock / bush frame positions ── */

// Ores.png (128x128) — 16x16 rock regions
const ROCKS = [
  [0, 0], [0, 16], [16, 0], [16, 16],
  [32, 0], [32, 16], [48, 0], [48, 16],
];
// Flowers.png (160x160) — 16x16 flower/bush regions
const BUSHES = [
  [0, 0], [16, 0], [32, 0], [48, 0], [64, 0],
  [0, 16], [16, 16], [32, 16], [48, 16], [64, 16],
];

/* ── Animal sprites (all 32x32 frame grids) ── */

// Per-animal idle/walk row definitions (row = spritesheet row, n = frame count)
const ANIMALS = {
  chicken: { p: 'Animals/Chicken/Chicken_01.png', idle: { row: 0, n: 2 }, walk: { row: 1, n: 6 } },
  pig:     { p: 'Animals/Pig/Pig_01.png',         idle: { row: 0, n: 3 }, walk: { row: 3, n: 8 } },
  sheep:   { p: 'Animals/Sheep/Sheep_01.png',     idle: { row: 0, n: 2 }, walk: { row: 3, n: 8 } },
  duck:    { p: 'Animals/Duck/Duck_01.png',        idle: { row: 0, n: 2 }, walk: { row: 1, n: 5 } },
  cow:     { p: 'Animals/Cow/Cow_01.png',          idle: { row: 1, n: 2 }, walk: { row: 3, n: 8 } },
  frog:    { p: 'Animals/Frog/Frog_01.png',        idle: { row: 0, n: 2 }, walk: { row: 1, n: 8 } },
  mouse:   { p: 'Animals/Mouse/Mouse_01.png',      idle: { row: 0, n: 2 }, walk: { row: 1, n: 6 } },
  goose:   { p: 'Animals/Goose/Goose_01.png',      idle: { row: 0, n: 2 }, walk: { row: 2, n: 6 } },
  horse:   { p: 'Animals/Horse/Horse_01.png',       idle: { row: 1, n: 3 }, walk: { row: 3, n: 8 } },
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
  // Map procedural species to CF animals
  fox: 'mouse', wolf: 'cow', bear: 'cow', deer: 'horse', boar: 'pig',
  songbird: 'chicken', rare_bird: 'goose',
  fish_koi: 'frog', fish_perch: 'frog',
};

const PET_MAP = {
  dojocat: 'mouse', buu: 'pig', devit: 'frog', pixiu: 'horse',
  tanuki: 'cow', kitsune: 'duck', usagi: 'sheep', kappa: 'frog',
};

/* ── NPC residents (48x64 frame size) ── */

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
 * Draw ground tile with auto-tiling transitions and animated decorations.
 * Single grass colour for consistency; flower-grass overlays for variety.
 *
 * @returns {false|true|2}
 *   false = nothing drawn (images loading)
 *   true  = basic ground drawn
 *   2     = Wang shore transition drawn (suppress procedural shore glow)
 */
export function drawCuteFantasyGround(ctx, biome, tile, x, y, size, neighbors, seed, time, terrain) {
  const h = seed || 0;
  const t = time || 0;

  /* ── Water tiles: Wang pure-water base + layered animation ── */
  if (tile.t === 'water') {
    // Use Wang tileset's pure-water tile (idx 0) so colour matches shore transitions
    const [wsx, wsy] = WANG_LOOKUP[0];
    if (!drawFrame(ctx, cfp(WANG_WATER_GRASS), wsx, wsy, 16, 16, x, y, size, size)) {
      ctx.fillStyle = '#3888b0'; // placeholder while loading
      ctx.fillRect(x, y, size, size);
    }
    // Primary animated shimmer from connected-water tileset (same palette as Wang)
    const fi = Math.floor((t * 0.003 + h * 0.1) % WATER_CONN_FRAMES);
    drawFrame(ctx, cfp(WATER_CONN_ANIM), fi * WATER_CONN_FRAME_W + 16, 16, 16, 16, x, y, size, size, undefined, 0.25);
    // Secondary shimmer layer (phase-offset) for richer water movement
    const fi2 = Math.floor((t * 0.0025 + h * 0.3 + 3) % WATER_MIDDLE_FRAMES);
    drawFrame(ctx, cfp(WATER_MIDDLE_ANIM), fi2 * 16, 0, 16, 16, x, y, size, size, undefined, 0.15);

    // Lillypad decorations on ~12% of shore-adjacent water tiles
    if (neighbors) {
      const isLand = (tt) => tt && tt !== 'water';
      const nearShore = isLand(neighbors.n) || isLand(neighbors.s) || isLand(neighbors.e) || isLand(neighbors.w);
      if (nearShore && h % 8 === 0) {
        const padIdx = (h >>> 5) % WATER_LILLYPADS.length;
        const padFi = Math.floor((t * 0.0015 + h * 0.2) % WATER_LILLYPAD_FRAMES);
        drawFrame(ctx, cfp(WATER_DECOR_DIR + WATER_LILLYPADS[padIdx]),
          padFi * 16, 0, 16, 16, x, y, size, size, undefined, 0.7);
      }
    }
    return true;
  }

  /* ── Non-water tiles: Wang auto-tiling for water↔grass ── */
  let wangDrawn = false;
  let wangIdx = 15; // default = pure grass
  if (neighbors) {
    const w = (tt) => tt === 'water';
    const cNW = (w(neighbors.n) || w(neighbors.w) || w(neighbors.nw)) ? 0 : 1;
    const cNE = (w(neighbors.n) || w(neighbors.e) || w(neighbors.ne)) ? 0 : 1;
    const cSW = (w(neighbors.s) || w(neighbors.w) || w(neighbors.sw)) ? 0 : 1;
    const cSE = (w(neighbors.s) || w(neighbors.e) || w(neighbors.se)) ? 0 : 1;
    wangIdx = cNW * 8 + cNE * 4 + cSW * 2 + cSE;
    // Draw Wang tile at full opacity — no grass underlay (that caused green bleed into water)
    const [sx, sy] = WANG_LOOKUP[wangIdx];
    wangDrawn = drawFrame(ctx, cfp(WANG_WATER_GRASS), sx, sy, 16, 16, x, y, size, size);
  }

  /* ── Fallback placeholder while Wang tileset loads ── */
  if (!wangDrawn) {
    if (biome === 'desert' || biome === 'volcanic') {
      ctx.fillStyle = '#c8b080';
    } else {
      ctx.fillStyle = '#5a8a38';
    }
    ctx.fillRect(x, y, size, size);
  }

  /* ── Path auto-tiling (grass↔path Wang transitions) ── */
  // Only render path tiles on actual path buildings or tiles adjacent to paths.
  // Previous laneStrength-based approach bled cobblestone onto grass near any building.
  const hasPathBuilding = tile.b != null && terrain?.isPathBuilding;
  if (neighbors) {
    const isPath = (dir) => neighbors[dir + '_path'] || false;
    const pNW = (isPath('n') || isPath('w') || isPath('nw')) ? 1 : 0;
    const pNE = (isPath('n') || isPath('e') || isPath('ne')) ? 1 : 0;
    const pSW = (isPath('s') || isPath('w') || isPath('sw')) ? 1 : 0;
    const pSE = (isPath('s') || isPath('e') || isPath('se')) ? 1 : 0;
    const pathIdx = pNW * 8 + pNE * 4 + pSW * 2 + pSE;
    if (hasPathBuilding) {
      // This tile IS a path — draw full path (use neighbor-aware index or pure center)
      const idx = pathIdx > 0 ? pathIdx : 15;
      const [psx, psy] = WANG_LOOKUP[idx];
      drawFrame(ctx, cfp(WANG_GRASS_PATH), psx, psy, 16, 16, x, y, size, size);
    } else if (pathIdx > 0) {
      // Adjacent to a path — draw grass↔path transition
      const [psx, psy] = WANG_LOOKUP[pathIdx];
      drawFrame(ctx, cfp(WANG_GRASS_PATH), psx, psy, 16, 16, x, y, size, size);
    }
    // Tiles with no path building AND no path neighbors: draw nothing (pure grass)
  }

  /* ── Shore transition flag ── */
  const isShoreTransition = wangIdx > 0 && wangIdx < 15;

  /* ── Grass variation — disabled: the overlay textures created visible square patches ── */

  /* ── Flower-grass overlays on ~16 % of open ground tiles (NOT on shore tiles) ── */
  if (tile.t !== 'tree' && tile.t !== 'rock' && tile.t !== 'bush' && !isShoreTransition) {
    if (h % 6 === 0) {
      const variant = (h >>> 3) % FLOWER_GRASS_COUNT + 1;
      const fi = Math.floor((t * 0.002 + h * 0.07) % FLOWER_GRASS_FRAMES);
      const file = FLOWER_GRASS_DIR + 'Flower_Grass_' + variant + '_Anim.png';
      drawFrame(ctx, cfp(file), fi * 16, 0, 16, 16, x, y, size, size);
    }
  }

  // Return 2 for shore transitions to suppress procedural shore glow in drawTile
  return (wangIdx > 0 && wangIdx < 15) ? 2 : true;
}

/**
 * Draw terrain feature (tree / rock / bush).
 * Returns true even while image is loading to SUPPRESS procedural fallback
 * (prevents flashing / visual artifacts when sprites pop in).
 */
export function drawCuteFantasyTerrain(ctx, biome, tile, x, y, size, seed, terrain, neighbors) {
  // Skip ALL obstacles adjacent to water — trees, rocks, bushes look unnatural on shorelines
  if ((tile.t === 'tree' || tile.t === 'bush' || tile.t === 'rock') && neighbors) {
    const nb = neighbors;
    if (nb.n === 'water' || nb.s === 'water' || nb.e === 'water' || nb.w === 'water'
      || nb.ne === 'water' || nb.nw === 'water' || nb.se === 'water' || nb.sw === 'water') {
      return true; // suppress — act as if drawn to prevent procedural fallback
    }
  }

  if (tile.t === 'tree') {
    const treeType = pick(BIOME_TREES[biome] || BIOME_TREES.grasslands, seed);
    if (!treeType) return false;

    // Mix tree sizes: ~25% big, ~50% medium, ~25% small for natural variety
    const sizeMix = Math.abs(seed >> 3) % 4;
    let treeData, sizeCategory;
    if (sizeMix === 0 && BIG_TREES[treeType]) {
      treeData = BIG_TREES[treeType];
      sizeCategory = 'big';
    } else if (sizeMix >= 3 && SMALL_TREES[treeType]) {
      treeData = SMALL_TREES[treeType];
      sizeCategory = 'small';
    } else {
      treeData = MEDIUM_TREES[treeType];
      sizeCategory = 'medium';
    }
    if (!treeData) return false;

    const src = cfp(treeData.p);
    const entry = getImage(src);
    if (!entry?.loaded) return true; // suppress fallback while loading

    // Pick frame variant — skip frame 0 on all multi-frame trees (frame 0 is often a stump/sapling)
    let fi = Math.abs(seed >> 2) % treeData.n;
    if (treeData.n >= 3) fi = 1 + (fi % 2); // use frames 1-2 (full tree variants only)

    const fw = treeData.fw;
    const fh = treeData.fh;
    // Scale tree to tile: big trees overhang ~1.8x, medium ~1.5x, small ~1.2x
    const scaleW = sizeCategory === 'big' ? 1.8 : sizeCategory === 'small' ? 1.0 : 1.2;
    const scaleH = scaleW * (fh / fw);
    const treeW = size * scaleW;
    const treeH = size * scaleH;
    const drawX = x + (size - treeW) / 2;
    const drawY = y + size - treeH;

    dropShadow(ctx, x + size * 0.5, y + size * 0.9, size * 0.32, size * 0.1, 0.25);
    return drawFrame(ctx, src, fi * fw, 0, fw, fh, drawX, drawY, treeW, treeH);
  }

  if (tile.t === 'rock') {
    const src = cfp(OD + '/Ores.png');
    const entry = getImage(src);
    if (!entry?.loaded) return true; // suppress fallback
    const [sx, sy] = pick(ROCKS, seed);
    const rockSize = size * 0.7;
    const off = size * 0.15;
    dropShadow(ctx, x + size * 0.5, y + size * 0.86, size * 0.24, size * 0.08, 0.2);
    return drawFrame(ctx, src, sx, sy, 16, 16, x + off, y + off, rockSize, rockSize);
  }

  if (tile.t === 'bush') {
    const src = cfp(OD + '/Flowers.png');
    const entry = getImage(src);
    if (!entry?.loaded) return true; // suppress fallback
    const [sx, sy] = pick(BUSHES, seed);
    return drawFrame(ctx, src, sx, sy, 16, 16,
      x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76);
  }

  return false;
}

/**
 * Draw building sprite. Returns boolean.
 */
export function drawCuteFantasyBuilding(ctx, buildingOrType, x, y, width, height) {
  const type = bType(buildingOrType);
  const b = BUILDINGS[type];
  if (!b) return false;

  // Special: flower garden (both 'garden' and 'flower_bed' building types)
  if (type === 'garden' || type === 'flower_bed') {
    return drawFlowerGarden(ctx, x, y, width, height);
  }

  // Path tiles: don't draw here — the ground layer handles path rendering
  // via Wang grass↔path auto-tiling. Drawing Path_Middle.png here just
  // creates a flat tan square that overwrites the proper transitions.
  if (type === 'path') {
    return true; // claim handled so procedural fallback doesn't kick in
  }

  const src = cfp(b.p);

  if (b.tile) {
    return drawImg(ctx, src, x, y, width, height);
  }

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

  const sc = Math.min(width / b.w, height / b.h);
  const dw = b.w * sc;
  const dh = b.h * sc;
  const dx = x + (width - dw) / 2;
  const dy = y + height - dh;
  dropShadow(ctx, dx + dw * 0.5, dy + dh * 0.94, dw * 0.38, dh * 0.06, 0.22);
  return drawImg(ctx, src, dx, dy, dw, dh);
}

/* ── PixelLab-generated garden bed sprites ── */
const GARDEN_BED_48 = OD + '/garden_bed_48.png'; // 48×48 rectangular plot
const GARDEN_BED_32 = OD + '/garden_bed_32.png'; // 32×32 round patch

/** Draw a flower garden using PixelLab-generated garden bed sprites. */
function drawFlowerGarden(ctx, x, y, width, height) {
  // Pick variant based on position hash — larger gardens get the 48px sprite
  const hash = (Math.floor(x) * 7 + Math.floor(y) * 13) & 0xFFFF;
  const useLarge = width >= 28 || height >= 28;
  const src = cfp(useLarge ? GARDEN_BED_48 : GARDEN_BED_32);
  const entry = getImage(src);
  if (!entry?.loaded) return true; // suppress fallback

  // Scale the garden sprite to fill the tile, preserving aspect ratio
  const imgW = useLarge ? 48 : 32;
  const imgH = useLarge ? 48 : 32;
  const sc = Math.min(width / imgW, height / imgH);
  const dw = imgW * sc;
  const dh = imgH * sc;
  const dx = x + (width - dw) / 2;
  const dy = y + (height - dh) / 2;

  return drawImg(ctx, src, dx, dy, dw, dh);
}

/**
 * Draw NPC village resident. Returns boolean.
 */
export function drawCuteFantasyResident(ctx, x, y, tileSize, paletteKey, activity, frameOffset, facing) {
  const file = NPCS[paletteKey];
  if (!file) return false;

  const src = cfp(file);
  const entry = getImage(src);
  if (!entry?.loaded) return true; // suppress procedural fallback while loading

  const cols = Math.floor(entry.image.width / NPC_FW);
  const rows = Math.floor(entry.image.height / NPC_FH);

  // NPC spritesheets: rows 0-3 = walk (down/up/left/right), rows 4-7 = idle (down/up/left/right)
  let row, numFrames;
  if (activity === 'stroll') {
    // Walk: pick direction-specific row (0=down, 1=up, 2=left, 3=right)
    if (facing === 2) row = 0;                              // walk down
    else if (facing === -2 && rows > 1) row = 1;            // walk up
    else if (facing === -1 && rows > 2) row = 2;            // walk left
    else if (facing === 1 && rows > 3) row = 3;             // walk right
    else row = 0;                                            // default down
    numFrames = Math.min(cols, 6);
  } else {
    // Idle: use direction-specific idle row (4=down, 5=up, 6=left, 7=right)
    if (rows > 7) {
      if (facing === -2) row = 5;         // idle up
      else if (facing === -1) row = 6;    // idle left
      else if (facing === 1) row = 7;     // idle right
      else row = 4;                        // idle down (default)
    } else {
      row = rows > 4 ? 4 : 0;
    }
    numFrames = Math.min(cols, 6);
  }

  const fi = Math.floor(frameOffset * numFrames) % numFrames;
  const sx = fi * NPC_FW;
  const sy = row * NPC_FH;

  const dw = tileSize * 1.4;
  const dh = dw * (NPC_FH / NPC_FW);
  const bob = activity === 'stroll'
    ? Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.015
    : 0;

  // Drop shadow under NPC
  dropShadow(ctx, x, y + tileSize * 0.08, dw * 0.22, dw * 0.07, 0.2);

  // Direction-specific rows → no horizontal flip needed
  return drawFrame(
    ctx, src,
    sx, sy, NPC_FW, NPC_FH,
    x - dw / 2, y - dh * 0.82 + bob, dw, dh,
  );
}

/**
 * Draw ambient critter using CF animal sprites.
 * Uses idle or walk animation based on options.moving.
 */
export function drawCuteFantasyCritter(ctx, x, y, tileSize, species, frameOffset, options) {
  const mapped = CRITTER_MAP[species];
  if (!mapped) return false;

  const fac = options?.facing || 1;
  const scale = options?.scale || 0.6;
  const moving = options?.moving || false;

  // Small creatures (butterfly, bee) — special layouts
  const sm = SMALL[mapped];
  if (sm) {
    const src = cfp(sm.p);
    const entry = getImage(src);
    if (!entry?.loaded) return true; // suppress fallback
    const fi = Math.floor(frameOffset * 4) % sm.n;
    const sx = sm.vert ? 0 : fi * sm.fw;
    const sy = sm.vert ? fi * sm.fh : 0;
    const d = tileSize * scale;
    const hover = Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.04;
    return drawFrame(
      ctx, src,
      sx, sy, sm.fw, sm.fh,
      x - d / 2, y - d * 0.7 + hover, d, d,
      fac,
    );
  }

  // Regular CF animals — 32x32 frame grid with idle/walk rows
  const an = ANIMALS[mapped];
  if (!an) return false;

  const src = cfp(an.p);
  const entry = getImage(src);
  if (!entry?.loaded) return true; // suppress fallback

  // Pick the correct animation row and frame count
  const anim = moving ? an.walk : an.idle;
  const fi = Math.floor(frameOffset * anim.n) % anim.n;
  const sx = fi * 32;
  const sy = anim.row * 32;

  const d = tileSize * scale;
  dropShadow(ctx, x, y + d * 0.06, d * 0.22, d * 0.07, 0.18);
  return drawFrame(
    ctx, src,
    sx, sy, 32, 32,
    x - d / 2, y - d * 0.6, d, d,
    fac,
  );
}

/**
 * Draw pet character using CF animal sprites.
 * Uses idle or walk animation based on moving flag.
 */
export function drawCuteFantasyPet(ctx, x, y, tileSize, character, frameOffset, moving) {
  const mapped = PET_MAP[character];
  if (!mapped) return false;

  const an = ANIMALS[mapped];
  if (!an) return false;

  const src = cfp(an.p);
  const entry = getImage(src);
  if (!entry?.loaded) return true; // suppress fallback

  // Pick the correct animation row and frame count
  const anim = moving ? an.walk : an.idle;
  const fi = Math.floor(frameOffset * anim.n) % anim.n;
  const sx = fi * 32;
  const sy = anim.row * 32;

  const d = tileSize * 0.9;

  dropShadow(ctx, x, y + d * 0.08, d * 0.28, d * 0.09, 0.2);

  return drawFrame(
    ctx, src,
    sx, sy, 32, 32,
    x - d / 2, y - d * 0.65, d, d,
  );
}

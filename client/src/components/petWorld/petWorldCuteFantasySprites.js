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
const HERO = '/pet-world/heroes';
const HERO_ASSET_VERSION = '20260413b';

function cfp(...parts) {
  return (CF + '/' + parts.join('/')).replace(/ /g, '%20');
}

function hfp(...parts) {
  return `${(HERO + '/' + parts.join('/')).replace(/ /g, '%20')}?v=${HERO_ASSET_VERSION}`;
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
  fruit:  { p: 'Trees/Medium_Fruit_Tree.png', fw: 32, fh: 64, n: 3 },
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

// Path wang lookup: pathIdx uses 1=path(dirt), 0=grass — inverted from PixelLab's
// 0=lower(dirt), 1=upper(grass) convention, so we map via 15-pathIdx.
const WANG_DIRT_GRASS  = 'Tiles/wang_dirt_grass.png';
const PATH_WANG_LOOKUP = [
  [0, 48],  [16, 48], [0, 0],   [48, 0],   //  0-3  (all grass → mostly grass)
  [0, 32],  [16, 0],  [32, 48], [16, 16],   //  4-7
  [48, 48], [0, 16],  [48, 32], [32, 0],    //  8-11
  [16, 32], [32, 32], [48, 16], [32, 16],   // 12-15 (mostly dirt → all dirt)
];

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
  pig:     {
    p: 'Animals/Pig/Pig_01.png',
    idle: { side: { row: 0, n: 1 }, south: { row: 1, n: 1 }, north: { row: 2, n: 1 } },
    walk: { side: { row: 3, n: 8 }, south: { row: 4, n: 8 }, north: { row: 4, n: 8 } },
  },
  sheep:   {
    p: 'Animals/Sheep/Sheep_01.png',
    idle: { side: { row: 0, n: 1 }, south: { row: 1, n: 1 }, north: { row: 2, n: 1 } },
    walk: { side: { row: 3, n: 8 }, south: { row: 4, n: 8 }, north: { row: 4, n: 8 } },
  },
  duck:    { p: 'Animals/Duck/Duck_01.png',        idle: { row: 0, n: 2 }, walk: { row: 1, n: 5 } },
  cow:     {
    p: 'Animals/Cow/Cow_01.png',
    idle: { side: { row: 0, n: 1 }, south: { row: 1, n: 1 }, north: { row: 2, n: 1 } },
    walk: { side: { row: 3, n: 8 }, south: { row: 4, n: 8 }, north: { row: 4, n: 8 } },
  },
  frog:    { p: 'Animals/Frog/Frog_01.png',        idle: { row: 0, n: 2 }, walk: { row: 1, n: 8 } },
  mouse:   { p: 'Animals/Mouse/Mouse_01.png',      idle: { row: 0, n: 2 }, walk: { row: 1, n: 6 } },
  goose:   { p: 'Animals/Goose/Goose_01.png',      idle: { row: 0, n: 2 }, walk: { row: 2, n: 6 } },
  horse:   {
    p: 'Animals/Horse/Horse_01.png',
    idle: { side: { row: 0, n: 1 }, south: { row: 1, n: 1 }, north: { row: 2, n: 1 } },
    walk: { side: { row: 3, n: 6 }, south: { row: 4, n: 6 }, north: { row: 4, n: 6 } },
  },
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

/* ── Custom pet sprites (PixelLab-generated, 48×48 directional) ── */
// Sprite sheet layout: 6 cols × 8 rows of 48×48 frames
//   Rows 0-3: idle (south/north/east/west), 4 frames padded to 6
//   Rows 4-7: walk (south/north/east/west), 6 frames
const CUSTOM_PET_FW = 48;
const CUSTOM_PET_FH = 48;
const CUSTOM_PET_WALK_FRAMES = 6;
const CUSTOM_PET_IDLE_FRAMES = 4; // actual frames (padded to 6 in sheet)
// Direction → row offset (same for idle block 0-3 and walk block 4-7)
const CUSTOM_PET_DIR = { south: 0, north: 1, east: 2, west: 3 };

const CUSTOM_PETS = {
  dojocat: { p: 'Pets/Dojocat.png' },
  buu:     { p: 'Pets/Buu.png' },
};

const HERO_ANIM_PETS = {
  dojocat: {
    base: hfp('dojocat', 'base.png'),
    baseScale: 1.55,
    fw: 128,
    fh: 128,
    idleFrames: 4,
    walkFrames: 4,
    idle: {
      south: hfp('dojocat', 'idle_south.png'),
      north: hfp('dojocat', 'idle_north.png'),
      east: hfp('dojocat', 'idle_east.png'),
      west: hfp('dojocat', 'idle_west.png'),
    },
    walk: {
      south: hfp('dojocat', 'walk_south.png'),
      north: hfp('dojocat', 'walk_north.png'),
      east: hfp('dojocat', 'walk_east.png'),
      west: hfp('dojocat', 'walk_west.png'),
    },
  },
  buu: {
    base: hfp('buu', 'base.png'),
    baseScale: 1.55,
    fw: 128,
    fh: 128,
    idleFrames: 4,
    walkFrames: 4,
    idle: {
      south: hfp('buu', 'idle_south.png'),
      north: hfp('buu', 'idle_north.png'),
      east: hfp('buu', 'idle_east.png'),
      west: hfp('buu', 'idle_west.png'),
    },
    walk: {
      south: hfp('buu', 'walk_south.png'),
      north: hfp('buu', 'walk_north.png'),
      east: hfp('buu', 'walk_east.png'),
      west: hfp('buu', 'walk_west.png'),
    },
  },
  devit: {
    base: hfp('devit', 'base.png'),
    baseScale: 1.52,
    fw: 128,
    fh: 128,
    idleFrames: 4,
    walkFrames: 4,
    idle: {
      south: hfp('devit', 'idle_south.png'),
      north: hfp('devit', 'idle_north.png'),
      east: hfp('devit', 'idle_east.png'),
      west: hfp('devit', 'idle_west.png'),
    },
    walk: {
      south: hfp('devit', 'walk_south.png'),
      north: hfp('devit', 'walk_north.png'),
      east: hfp('devit', 'walk_east.png'),
      west: hfp('devit', 'walk_west.png'),
    },
  },
  pixiu: {
    base: hfp('pixiu', 'base.png'),
    baseScale: 1.52,
    fw: 128,
    fh: 128,
    idleFrames: 4,
    walkFrames: 4,
    idle: {
      south: hfp('pixiu', 'idle_south.png'),
      north: hfp('pixiu', 'idle_north.png'),
      east: hfp('pixiu', 'idle_east.png'),
      west: hfp('pixiu', 'idle_west.png'),
    },
    walk: {
      south: hfp('pixiu', 'walk_south.png'),
      north: hfp('pixiu', 'walk_north.png'),
      east: hfp('pixiu', 'walk_east.png'),
      west: hfp('pixiu', 'walk_west.png'),
    },
  },
};

function petDirFromFacing(facing) {
  if (facing === -2) return 'north';
  if (facing === -1) return 'west';
  if (facing === 1) return 'east';
  return 'south';
}

/* ── NPC residents (64x64 frame size) ── */

function dirGroupFromFacing(facing) {
  if (facing === -2) return 'up';
  if (facing === -1 || facing === 1) return 'side';
  return 'down';
}

function npcRowSet(rows, frameCount = 6) {
  return {
    down: { row: rows[0], n: frameCount },
    side: { row: rows[1], n: frameCount },
    up: { row: rows[2], n: frameCount },
  };
}

const NPCS = {
  // Premade Cute Fantasy workers are grouped as:
  // 0-2 idle (down/side/up), 3-5 walk (down/side/up), 6 special downed row,
  // then profession-specific work rows.
  teal: {
    p: 'NPCs (Premade)/Fisherman_Fin.png',
    idle: npcRowSet([0, 1, 2]),
    walk: npcRowSet([3, 4, 5]),
    work: {
      // Use the calmer second fishing set for looped village work.
      fish: {
        down: { row: 10, n: 8 },
        side: { row: 11, n: 9 },
        up: { row: 12, n: 8 },
      },
    },
  },
  berry: {
    p: 'NPCs (Premade)/Chef_Chloe.png',
    idle: npcRowSet([0, 1, 2]),
    walk: npcRowSet([3, 4, 5]),
    work: {},
  },
  ochre: {
    p: 'NPCs (Premade)/Farmer_Bob.png',
    idle: npcRowSet([0, 1, 2]),
    walk: npcRowSet([3, 4, 5]),
    work: {
      farm_till: npcRowSet([7, 8, 9]),
      farm_water: npcRowSet([10, 11, 12]),
    },
  },
  slate: {
    p: 'NPCs (Premade)/Miner_Mike.png',
    idle: npcRowSet([0, 1, 2]),
    walk: npcRowSet([3, 4, 5]),
    work: {
      mine: npcRowSet([7, 8, 9]),
    },
  },
  moss: {
    p: 'NPCs (Premade)/Lumberjack_Jack.png',
    idle: npcRowSet([0, 1, 2]),
    walk: npcRowSet([3, 4, 5]),
    work: {
      chop: npcRowSet([7, 8, 9]),
    },
  },
  plum: {
    p: 'NPCs (Premade)/Bartender_Katy.png',
    idle: npcRowSet([0, 1, 2]),
    walk: npcRowSet([3, 4, 5]),
    work: {},
  },
};

const NPC_FW = 64;
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
      ctx.fillStyle = '#3e8948';
    }
    ctx.fillRect(x, y, size, size);
  }

  /* ── Non-water tile fully enclosed by water (wangIdx 0): animate like real water ── */
  if (wangIdx === 0) {
    const fi = Math.floor((t * 0.003 + h * 0.1) % WATER_CONN_FRAMES);
    drawFrame(ctx, cfp(WATER_CONN_ANIM), fi * WATER_CONN_FRAME_W + 16, 16, 16, 16,
      x, y, size, size, undefined, 0.25);
    const fi2 = Math.floor((t * 0.0025 + h * 0.3 + 3) % WATER_MIDDLE_FRAMES);
    drawFrame(ctx, cfp(WATER_MIDDLE_ANIM), fi2 * 16, 0, 16, 16, x, y, size, size, undefined, 0.15);
    return true;
  }

  /* ── Shore transition flag (computed early — used by path + water sections) ── */
  const isShoreTransition = wangIdx > 0 && wangIdx < 15;

  /* ── Path auto-tiling (dirt↔grass Wang transitions) ── */
  const hasPathBuilding = tile.b != null && terrain?.isPathBuilding;
  if (neighbors) {
    const isPath = (dir) => neighbors[dir + '_path'] || false;
    const pNW = (isPath('n') || isPath('w') || isPath('nw')) ? 1 : 0;
    const pNE = (isPath('n') || isPath('e') || isPath('ne')) ? 1 : 0;
    const pSW = (isPath('s') || isPath('w') || isPath('sw')) ? 1 : 0;
    const pSE = (isPath('s') || isPath('e') || isPath('se')) ? 1 : 0;
    const pathIdx = pNW * 8 + pNE * 4 + pSW * 2 + pSE;
    if (hasPathBuilding) {
      // Path building: always draw dirt (even on shore tiles)
      const idx = pathIdx > 0 ? pathIdx : 15;
      const [psx, psy] = PATH_WANG_LOOKUP[idx];
      drawFrame(ctx, cfp(WANG_DIRT_GRASS), psx, psy, 16, 16, x, y, size, size);
    } else if (pathIdx > 0) {
      if (!isShoreTransition) {
        // Inland tile: draw full dirt-grass transition
        const [psx, psy] = PATH_WANG_LOOKUP[pathIdx];
        drawFrame(ctx, cfp(WANG_DIRT_GRASS), psx, psy, 16, 16, x, y, size, size, undefined, 0.88);
      } else {
        // Shore tile: only draw path transition in grass quadrants.
        // maskedIdx strips dirt from corners that are water in the base tile.
        // Canvas clip restricts drawing to grass quadrants so opaque pixels
        // from the dirt-grass tile never cover the water in the wang base.
        const maskedIdx = pathIdx & wangIdx;
        if (maskedIdx > 0) {
          const halfW = size / 2;
          const halfH = size / 2;
          ctx.save();
          ctx.beginPath();
          if (wangIdx & 8) ctx.rect(x, y, halfW, halfH);
          if (wangIdx & 4) ctx.rect(x + halfW, y, halfW, halfH);
          if (wangIdx & 2) ctx.rect(x, y + halfH, halfW, halfH);
          if (wangIdx & 1) ctx.rect(x + halfW, y + halfH, halfW, halfH);
          ctx.clip();
          const [psx, psy] = PATH_WANG_LOOKUP[maskedIdx];
          drawFrame(ctx, cfp(WANG_DIRT_GRASS), psx, psy, 16, 16, x, y, size, size, undefined, 0.88);
          ctx.restore();
        }
      }
    }
  }

  // Shore shimmer removed — it overlaid blue animation on the ENTIRE tile including
  // grass portions, visibly tinting shore grass darker. The wang tiles already contain
  // correct water-coloured pixels that blend with adjacent animated water tiles.

  /* ── Flower-grass overlays on ~16 % of open ground tiles ── */
  // Suppressed on path tiles (would draw green grass blobs on dirt) and
  // allowed on shore tiles with enough visible grass (wangIdx >= 8 ≈ 50%+ grass corners)
  if (!hasPathBuilding && tile.t !== 'tree' && tile.t !== 'rock' && tile.t !== 'bush' && tile.t !== 'stump' && (!isShoreTransition || wangIdx >= 8)) {
    if (h % 6 === 0) {
      const variant = (h >>> 3) % FLOWER_GRASS_COUNT + 1;
      const fi = Math.floor((t * 0.002 + h * 0.07) % FLOWER_GRASS_FRAMES);
      const file = FLOWER_GRASS_DIR + 'Flower_Grass_' + variant + '_Anim.png';
      drawFrame(ctx, cfp(file), fi * 16, 0, 16, 16, x, y, size, size);
    }
  }

  // Return 2 for shore transitions to suppress procedural shore glow in drawTile
  return isShoreTransition ? 2 : true;
}

/**
 * Draw terrain feature (tree / rock / bush).
 * Returns true even while image is loading to SUPPRESS procedural fallback
 * (prevents flashing / visual artifacts when sprites pop in).
 */
export function drawCuteFantasyTerrain(ctx, biome, tile, x, y, size, seed, terrain, neighbors) {
  // Skip ALL obstacles adjacent to water — trees, rocks, bushes look unnatural on shorelines
  if ((tile.t === 'tree' || tile.t === 'bush' || tile.t === 'rock' || tile.t === 'stump') && neighbors) {
    const nb = neighbors;
    if (nb.n === 'water' || nb.s === 'water' || nb.e === 'water' || nb.w === 'water'
      || nb.ne === 'water' || nb.nw === 'water' || nb.se === 'water' || nb.sw === 'water') {
      return true; // suppress — act as if drawn to prevent procedural fallback
    }
  }

  if (tile.t === 'tree' || tile.t === 'stump') {
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

    // Cute Fantasy tree sheets commonly use frame 0 as a stump/sapling and frame 2 as a tiny shrub.
    // Use the stable full-tree middle frame so trees never render with a missing base/trunk.
    let fi = Math.abs(seed >> 2) % treeData.n;
    if (treeData.n >= 3) fi = 1;

    const fw = treeData.fw;
    const fh = treeData.fh;
    const isStump = tile.t === 'stump';
    const frameIndex = isStump ? 0 : fi;
    // Stumps use the cut trunk frame at a grounded size; trees keep their normal overhang.
    const scaleW = isStump ? 0.72 : (sizeCategory === 'big' ? 1.8 : sizeCategory === 'small' ? 1.0 : 1.2);
    const scaleH = scaleW * (fh / fw);
    const treeW = size * scaleW;
    const treeH = size * scaleH;
    const drawX = x + (size - treeW) / 2;
    const drawY = y + size - treeH - (isStump ? size * 0.04 : 0);

    dropShadow(ctx, x + size * 0.5, y + size * (isStump ? 0.88 : 0.9), size * (isStump ? 0.22 : 0.32), size * (isStump ? 0.07 : 0.1), isStump ? 0.18 : 0.25);
    return drawFrame(ctx, src, frameIndex * fw, 0, fw, fh, drawX, drawY, treeW, treeH);
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
    return drawFlowerGarden(ctx, x, y, width, height, buildingOrType);
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

/* ── Flower garden built from Cute Fantasy Flowers.png ── */
// Flowers.png = 160×160 = 10 cols × 10 rows of 16×16 sprites
// Colour-row mapping (approximate — rows 2-8 have distinct colours)
const FLOWER_COLOR_ROWS = { red: 2, pink: 3, yellow: 4, blue: 5 };
const FLOWER_ROW_MIN = 2;
const FLOWER_ROW_MAX = 5; // rows 2-5 inclusive (actual flowers, not cacti)

/** Draw a 2×2 flower bed using actual CF flower sprites (same colour per bed). */
function drawFlowerGarden(ctx, x, y, width, height, building) {
  const src = cfp(OD + '/Flowers.png');
  const entry = getImage(src);
  if (!entry?.loaded) return true; // suppress fallback

  // Deterministic hash from WORLD GRID coords — never screen coords (those shift with camera)
  const gx = typeof building === 'object' ? (building.grid_x ?? 0) : 0;
  const gy = typeof building === 'object' ? (building.grid_y ?? 0) : 0;
  const hash = ((gx * 2654435761 + gy * 2246822519) >>> 0) & 0xFFFF;

  // Flower colour: from building metadata or deterministic hash
  const flowerColor = typeof building === 'object'
    ? (building?.metadata?.flowerColor || building?.flowerColor)
    : null;
  const row = flowerColor && FLOWER_COLOR_ROWS[flowerColor] != null
    ? FLOWER_COLOR_ROWS[flowerColor]
    : FLOWER_ROW_MIN + (hash % (FLOWER_ROW_MAX - FLOWER_ROW_MIN + 1));
  const baseCol = 1 + ((hash >>> 4) % 7); // cols 1-7 (varied flower sprites)

  // 2×2 grid — same colour (row), slight column variation for natural look
  const halfW = width / 2;
  const halfH = height / 2;
  const inset = Math.max(1, width * 0.05);
  for (let fy = 0; fy < 2; fy++) {
    for (let fx = 0; fx < 2; fx++) {
      const col = (baseCol + fx + fy * 2) % 10;
      drawFrame(ctx, src, col * 16, row * 16, 16, 16,
        x + fx * halfW + inset, y + fy * halfH + inset,
        halfW - inset * 2, halfH - inset * 2);
    }
  }
  return true;
}

/**
 * Draw NPC village resident. Returns boolean.
 *
 * CF premade NPC spritesheets expose grouped animation families:
 *   Rows 0-2 = idle (down / side / up)
 *   Rows 3-5 = walk/run (down / side / up)
 *   Row  6   = special downed / hit row (unused here)
 *   Later rows = profession-specific work sets, varying by sheet.
 *
 * We only drive the states that Pet World actually needs:
 *   idle animations
 *   running / walking animations
 *   working animations relevant to the resident's real job
 *     - farm_till / farm_water
 *     - fish
 *     - chop
 *     - mine
 */
export function drawCuteFantasyResident(ctx, x, y, tileSize, paletteKey, activity, frameOffset, facing, moving) {
  const profile = NPCS[paletteKey];
  if (!profile) return false;

  const src = cfp(profile.p);
  const entry = getImage(src);
  if (!entry?.loaded) return true; // suppress procedural fallback while loading

  const isWalking = !!moving;
  const dir = dirGroupFromFacing(facing);
  const flipH = dir === 'side' && facing === 1;
  const workSet = !isWalking ? profile.work?.[activity] || null : null;
  const anim = isWalking ? profile.walk[dir] : (workSet?.[dir] || profile.idle[dir]);
  const row = anim.row;
  const numFrames = anim.n;

  const fi = Math.floor(frameOffset * numFrames) % numFrames;
  const sx = fi * NPC_FW;
  const sy = row * NPC_FH;

  const dw = tileSize * 1.4;
  const dh = dw * (NPC_FH / NPC_FW);
  // Gentle bob only while walking — idle/working NPCs stay perfectly still
  const bob = isWalking
    ? Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.012
    : 0;

  // Drop shadow under NPC
  dropShadow(ctx, x, y + tileSize * 0.08, dw * 0.22, dw * 0.07, 0.2);

  return drawFrame(
    ctx, src,
    sx, sy, NPC_FW, NPC_FH,
    x - dw / 2, y - dh * 0.82 + bob, dw, dh,
    flipH ? -1 : undefined,
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
  const dir = fac === -1 || fac === 1 ? 'side' : (fac === -2 ? 'north' : 'south');

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
  const animSet = moving ? an.walk : an.idle;
  const anim = animSet?.[dir] || animSet?.side || animSet;
  const fi = Math.floor(frameOffset * anim.n) % anim.n;
  const sx = fi * 32;
  const sy = anim.row * 32;

  const d = tileSize * scale;
  dropShadow(ctx, x, y + d * 0.06, d * 0.22, d * 0.07, 0.18);
  return drawFrame(
    ctx, src,
    sx, sy, 32, 32,
    x - d / 2, y - d * 0.6, d, d,
    dir === 'side' ? fac : undefined,
  );
}

/**
 * Draw pet character.
 * Custom pets (dojocat, buu) use PixelLab-generated 4-direction sprite sheets.
 * Other pets fall back to CF animal sprites.
 *
 * @param {number} facing - 2=south, -2=north, -1=west, 1=east (or undefined)
 */
export function drawCuteFantasyPet(ctx, x, y, tileSize, character, frameOffset, moving, facing = 2, scaleMultiplier = 1) {
  const heroPet = HERO_ANIM_PETS[character];
  if (heroPet) {
    const dir = petDirFromFacing(facing);
    const d = tileSize * heroPet.baseScale * scaleMultiplier;
    const bob = moving ? Math.sin(frameOffset * Math.PI * 2) * d * 0.025 : 0;
    dropShadow(ctx, x, y + d * 0.16, d * 0.22, d * 0.07, 0.18);

    const animSrc = moving ? heroPet.walk[dir] : heroPet.idle[dir];
    const animEntry = getImage(animSrc);
    if (animEntry?.loaded) {
      const frameCount = moving ? heroPet.walkFrames : heroPet.idleFrames;
      const fi = Math.floor(frameOffset * frameCount) % frameCount;
      return drawFrame(
        ctx, animSrc,
        fi * heroPet.fw, 0, heroPet.fw, heroPet.fh,
        x - d / 2, y - d * 0.76 + bob, d, d,
      );
    }

    const baseEntry = getImage(heroPet.base);
    if (!baseEntry?.loaded) return true;
    const drawFacing = dir === 'west' ? -1 : 1;
    return drawImg(ctx, heroPet.base, x - d / 2, y - d * 0.76 + bob, d, d, drawFacing);
  }

  // ── Custom pet sprites (directional 48×48) ──
  const custom = CUSTOM_PETS[character];
  if (custom) {
    const src = cfp(custom.p);
    const entry = getImage(src);
    if (!entry?.loaded) return true; // suppress fallback while loading

    const dir = petDirFromFacing(facing);
    const dirRow = CUSTOM_PET_DIR[dir];
    const row = moving ? 4 + dirRow : dirRow;
    const numFrames = moving ? CUSTOM_PET_WALK_FRAMES : CUSTOM_PET_IDLE_FRAMES;
    const fi = Math.floor(frameOffset * numFrames) % numFrames;
    const sx = fi * CUSTOM_PET_FW;
    const sy = row * CUSTOM_PET_FH;

    const d = tileSize * 1.3 * scaleMultiplier;
    dropShadow(ctx, x, y + d * 0.16, d * 0.22, d * 0.07, 0.18);
    return drawFrame(
      ctx, src,
      sx, sy, CUSTOM_PET_FW, CUSTOM_PET_FH,
      x - d / 2, y - d * 0.72, d, d,
    );
  }

  const mapped = PET_MAP[character];
  if (!mapped) return false;

  const an = ANIMALS[mapped];
  if (!an) return false;

  const src = cfp(an.p);
  const entry = getImage(src);
  if (!entry?.loaded) return true; // suppress fallback

  const anim = moving ? an.walk : an.idle;
  const fi = Math.floor(frameOffset * anim.n) % anim.n;
  const sx = fi * 32;
  const sy = anim.row * 32;

  const d = tileSize * 0.9 * scaleMultiplier;
  dropShadow(ctx, x, y + d * 0.08, d * 0.28, d * 0.09, 0.2);
  return drawFrame(
    ctx, src,
    sx, sy, 32, 32,
    x - d / 2, y - d * 0.65, d, d,
  );
}

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
const PXL = '/pet-world/pixellab';
const HERO_ASSET_VERSION = '20260413b';
const FISHING_BANK_ASSET_VERSION = '20260415a';

function cfp(...parts) {
  return (CF + '/' + parts.join('/')).replace(/ /g, '%20');
}

function hfp(...parts) {
  return `${(HERO + '/' + parts.join('/')).replace(/ /g, '%20')}?v=${HERO_ASSET_VERSION}`;
}

function pfp(...parts) {
  return `${(PXL + '/' + parts.join('/')).replace(/ /g, '%20')}?v=${FISHING_BANK_ASSET_VERSION}`;
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

/* ═══ Building type / level resolver ═══ */

function bType(buildingOrType) {
  if (!buildingOrType) return '';
  if (typeof buildingOrType === 'string') return buildingOrType;
  return buildingOrType.type || buildingOrType.building_type || '';
}

function bLevel(buildingOrType) {
  if (!buildingOrType || typeof buildingOrType === 'string') return 1;
  return Math.max(1, Number(buildingOrType.level) || 1);
}

/** Get the sprite definition for a building type at a given level. */
function getBuildingSprite(type, level) {
  const entry = BUILDINGS[type];
  if (!entry) return null;
  if (Array.isArray(entry)) {
    const idx = Math.min(Math.max(0, (level || 1) - 1), entry.length - 1);
    return entry[idx];
  }
  return entry;
}

/* ═══════════════════════════════════════════════════════
   SPRITE DATA
   ═══════════════════════════════════════════════════════ */

/* ── Building sprites (level-aware: arrays = [L1, L2, L3]) ── */
// Houses: Wood → Stone → Limestone (material progression)
// Unique buildings: Base → Green → Red (painted trim progression)
// Spritesheets: different frame for each level (e.g. Church lit windows)

const BB = 'Buildings/Buildings';
const UB = BB + '/Unique_Buildings';
const HW = BB + '/Houses/Wood';
const HS = BB + '/Houses/Stone';
const HL = BB + '/Houses/Limestone';
const OD = 'Outdoor decoration';

const BUILDINGS = {
  // ── Housing ──
  house: [
    { p: HW + '/House_1_Wood_Base_Blue.png', w: 96, h: 128 },
    { p: HS + '/House_1_Stone_Base_Blue.png', w: 96, h: 128 },
    { p: HL + '/House_1_Limestone_Base_Blue.png', w: 96, h: 128 },
  ],
  large_house: [
    { p: HW + '/House_5_Wood_Base_Blue.png', w: 192, h: 128 },
    { p: HS + '/House_5_Stone_Base_Blue.png', w: 192, h: 128 },
    { p: UB + '/Inn/Inn_Blue.png', w: 240, h: 192 },
  ],
  // ── Food ──
  farm: [
    { p: UB + '/Barn/Barn_Base_Blue.png', w: 128, h: 144 },
    { p: UB + '/Barn/Barn_Green_Blue.png', w: 128, h: 144 },
    { p: UB + '/Barn/Barn_Red_Blue.png', w: 128, h: 144 },
  ],
  fishing_hut: [
    { p: UB + '/Fisherman_House/Fisherman_House_Base_Blue.png', w: 96, h: 112 },
    { p: UB + '/Fisherman_House/Fisherman_House_Green_Blue.png', w: 96, h: 112 },
    { p: UB + '/Fisherman_House/Fisherman_House_Red_Blue.png', w: 96, h: 112 },
  ],
  bakery: [
    { p: HW + '/House_3_Wood_Base_Blue.png', w: 144, h: 128 },
    { p: HS + '/House_3_Stone_Base_Blue.png', w: 144, h: 128 },
    { p: HL + '/House_3_Limestone_Base_Blue.png', w: 144, h: 128 },
  ],
  // ── Wood ──
  woodcutters_hut: [
    { p: UB + '/Shed/Shed_Base_Blue.png', w: 96, h: 112 },
    { p: UB + '/Shed/Shed_Green_Blue.png', w: 96, h: 112 },
    { p: UB + '/Shed/Shed_Red_Blue.png', w: 96, h: 112 },
  ],
  lumberyard: [
    { p: UB + '/Shed/Shed_Green_Blue.png', w: 96, h: 112 },
    { p: UB + '/Shed/Shed_Green_Red.png', w: 96, h: 112 },
    { p: UB + '/Shed/Shed_Red_Red.png', w: 96, h: 112 },
  ],
  // ── Stone ──
  stone_pit: { p: UB + '/Silo/Silo.png', w: 48, h: 80 },
  quarry: [
    { p: UB + '/Blacksmith_House/Blacksmith_House_Blue.png', w: 160, h: 128 },
    { p: UB + '/Blacksmith_House/Blacksmith_House_Black.png', w: 160, h: 128 },
    { p: UB + '/Blacksmith_House/Blacksmith_House_Red.png', w: 160, h: 128 },
  ],
  // ── Cloth ──
  weaving_hut: [
    { p: HW + '/House_2_Wood_Base_Blue.png', w: 144, h: 128 },
    { p: HS + '/House_2_Stone_Base_Blue.png', w: 144, h: 128 },
    { p: HL + '/House_2_Limestone_Base_Blue.png', w: 144, h: 128 },
  ],
  // ── Commerce & Social ──
  market:       { p: UB + '/Stalls/Market_Stalls.png', f: [0, 0, 48, 48] },
  trading_post: { p: UB + '/Stalls/Market_Stalls.png', f: [96, 0, 48, 48] },
  tavern: [
    { p: HW + '/House_4_Wood_Base_Blue.png', w: 112, h: 96 },
    { p: HS + '/House_4_Stone_Base_Blue.png', w: 112, h: 96 },
    { p: HL + '/House_4_Limestone_Base_Blue.png', w: 112, h: 96 },
  ],
  // ── Storage ──
  storehouse: [
    { p: UB + '/Barn/Barn_Green_Blue.png', w: 128, h: 144 },
    { p: UB + '/Barn/Barn_Green_Red.png', w: 128, h: 144 },
    { p: UB + '/Barn/Barn_Red_Red.png', w: 128, h: 144 },
  ],
  warehouse: [
    { p: UB + '/Greenhouse/GreenHouse_Wood.png', f: [0, 0, 96, 128] },
    { p: UB + '/Greenhouse/GreenHouse_Green.png', f: [0, 0, 96, 128] },
    { p: UB + '/Greenhouse/GreenHouse_Metal.png', f: [0, 0, 96, 128] },
  ],
  // ── Special ──
  shrine: { p: UB + '/Windmill/Windmill.png', w: 128, h: 112 },
  town_hall: [
    { p: UB + '/Church/Church_Blue.png', f: [0, 0, 112, 144] },
    { p: UB + '/Church/Church_Blue.png', f: [112, 0, 112, 144] },
    { p: UB + '/Church/Church_Blue.png', f: [336, 0, 112, 144] },
  ],
  watchtower: { p: UB + '/Silo/Silo.png', w: 48, h: 80 },
  // ── Cosmetic / Support ──
  well:       { p: OD + '/Well.png', w: 32, h: 48 },
  park:       { p: OD + '/Fountain.png', w: 32, h: 80 },
  garden:     { p: OD + '/Flowers.png', f: [0, 0, 32, 32] },
  flower_bed: { p: OD + '/Flowers.png', f: [0, 0, 32, 32] },
  path:       { p: 'Tiles/Grass/Path_Middle.png', w: 16, h: 16, tile: true },
  fence:      { p: OD + '/Fences.png', w: 64, h: 64, fence: true },
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

// Path Wang tilesets. Both use the `path=1, grass=0` convention, so
// PATH_WANG_LOOKUP[i] / COBBLE_WANG_LOOKUP[i] points to the tile where `i`
// corners are path. The two atlases arrange their tiles differently so each
// needs its own lookup — but the logic that uses them is shared.
const WANG_DIRT_GRASS   = 'Tiles/wang_dirt_grass.png';
const WANG_COBBLE_GRASS = 'Tiles/wang_cobble_grass.png';

const PATH_WANG_LOOKUP = [
  [0, 48],  [16, 48], [0, 0],   [48, 0],   //  0-3  (all grass → mostly grass)
  [0, 32],  [16, 0],  [32, 48], [16, 16],   //  4-7
  [48, 48], [0, 16],  [48, 32], [32, 0],    //  8-11
  [16, 32], [32, 32], [48, 16], [32, 16],   // 12-15 (mostly path → all path)
];

// PixelLab-generated cobblestone tileset — warm tan flagstones with dark
// mortar grout lines between stones and soft organic edges bleeding into
// grass. Matches the "cute fantasy" reference far better than the old
// Pavement_Tiles.png (which was actually a brick-wall atlas misused as floor).
const COBBLE_WANG_LOOKUP = [
  [32, 16], [48, 16], [32, 32], [16, 32],  //  0-3
  [32,  0], [48, 32], [ 0, 16], [48, 48],  //  4-7
  [16, 16], [32, 48], [16,  0], [ 0, 32],  //  8-11
  [48,  0], [ 0,  0], [16, 48], [ 0, 48],  // 12-15 (all path at [0, 48])
];

const FISHING_BANK_MASK = {
  n: 12, // north half dirt
  s: 3,  // south half dirt
  e: 5,  // east half dirt
  w: 10, // west half dirt
};
const PIXELLAB_FISHING_BANK = {
  n: { src: pfp('fishing-bank', 'bank_s.png'), facing: 1 },
  s: { src: pfp('fishing-bank', 'bank_n.png'), facing: 1 },
  e: { src: pfp('fishing-bank', 'bank_e.png'), facing: 1 },
  w: { src: pfp('fishing-bank', 'bank_e.png'), facing: -1 },
};

/* ── Fence auto-tile lookup ── */
// 4-directional connectivity: mask = N*8 + E*4 + S*2 + W
// Fences.png = 64×64 = 4×4 grid of 16×16 tiles
// Layout verified via pixel-edge analysis:
//   Row 0: S(2)    E(4)     EW(5)    W(1)
//   Row 1: NS(10)  ES(6)    ESW(7)   SW(3)
//   Row 2: N(8)    NES(14)  NESW(15) NSW(11)
//   Row 3: ·(0)    NE(12)   NEW(13)  NW(9)
const FENCE_TILE_LOOKUP = [
  [ 0, 48], //  0: isolated (no connections)
  [48,  0], //  1: W
  [ 0,  0], //  2: S
  [48, 16], //  3: SW
  [16,  0], //  4: E
  [32,  0], //  5: EW (horizontal)
  [16, 16], //  6: ES
  [32, 16], //  7: ESW
  [ 0, 32], //  8: N
  [48, 48], //  9: NW
  [ 0, 16], // 10: NS (vertical)
  [48, 32], // 11: NSW
  [16, 48], // 12: NE
  [32, 48], // 13: NEW
  [16, 32], // 14: NES
  [32, 32], // 15: NESW (cross)
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
const WATER_LILYPAD_BLOOMS = [
  'Lillypad_Red_1_Anim.png',
  'Lillypad_Purple_1_Anim.png',
];
const WATER_CATTAILS = [
  'Cattail_1_Anim.png',
  'Cattail_3_Anim.png',
];
const WATER_GRASS_CLUMPS = [
  'Water_Grass_1_Anim.png',
  'Water_Grass_2_Anim.png',
];
const WATER_ROCKS_DIR = 'Outdoor decoration/Outdoor_Decor_Animations/Water_Decor_Animations/Water_Rocks/';
const WATER_ROCKS = [
  'Rock_3_Water_Anim.png',
  'Rock_5_Water_Anim.png',
  'Rock_8_Water_Anim.png',
];
// Animated pure water overlay for richer shimmer
const WATER_MIDDLE_ANIM = 'Tiles/Water/Water_Middle_Anim_1.png';
const WATER_MIDDLE_FRAMES = 8;
const WATER_FISH_ANIM = 'Tiles/Water/Fish_Animated_Tile.png';
const WATER_FISH_FRAMES = 16;
const BOAT_ANIM = 'Outdoor decoration/Outdoor_Decor_Animations/Other_Animations/Boat_Anim.png';
const BOAT_FRAMES = 4;
const CLOUDS_IMG = 'Weather effects/Clouds.png';
const CLOUD_VARIANTS = [
  [0, 0],
  [64, 0],
  [0, 64],
  [64, 64],
];
const CLOUD_SHADOW_MASK_CACHE = new Map();

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
  chicken: { p: 'Animals/Chicken/Chicken_01.png', idle: { row: 0, n: 2 }, walk: { row: 1, n: 6 }, preferSideFacing: true },
  pig:     {
    p: 'Animals/Pig/Pig_01.png',
    idle: { side: { row: 0, n: 2 }, south: { row: 1, n: 2 }, north: { row: 2, n: 2 } },
    walk: { side: { row: 3, n: 8 }, south: { row: 4, n: 8 }, north: { row: 5, n: 8 } },
  },
  sheep:   {
    p: 'Animals/Sheep/Sheep_01.png',
    idle: { side: { row: 0, n: 2 }, south: { row: 1, n: 2 }, north: { row: 2, n: 2 } },
    walk: { side: { row: 3, n: 8 }, south: { row: 4, n: 8 }, north: { row: 5, n: 8 } },
  },
  duck:    {
    p: 'Animals/Duck/Duck_01.png',
    idle: { row: 0, n: 2 },
    walk: { row: 1, n: 5 },
    waterIdle: { row: 7, n: 2 },
  },
  cow:     {
    p: 'Animals/Cow/Cow_01.png',
    idle: { side: { row: 0, n: 2 }, south: { row: 1, n: 2 }, north: { row: 2, n: 2 } },
    walk: { side: { row: 3, n: 8 }, south: { row: 4, n: 8 }, north: { row: 5, n: 8 } },
  },
  frog:    { p: 'Animals/Frog/Frog_01.png',        idle: { row: 0, n: 2 }, walk: { row: 1, n: 8 } },
  mouse:   {
    p: 'Animals/Mouse/Mouse_01.png',
    idle: { row: 0, n: 2 },
    walk: { row: 1, n: 6 },
    preferSideFacing: true,
  },
  goose:   {
    p: 'Animals/Goose/Goose_01.png',
    idle: { row: 0, n: 2 },
    walk: { row: 1, n: 6 },
    preferSideFacing: true,
  },
  horse:   {
    p: 'Animals/Horse/Horse_01.png',
    idle: { side: { row: 0, n: 2 }, south: { row: 1, n: 2 }, north: { row: 2, n: 2 } },
    walk: { side: { row: 3, n: 6 }, south: { row: 4, n: 6 }, north: { row: 5, n: 6 } },
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
  duck: 'duck', goose: 'goose', horse: 'horse', pig: 'pig', sheep: 'sheep', cow: 'cow', chicken: 'chicken',
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

function npcWorkRowSet(side, down, up) {
  return { side, down, up };
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
      // Premade worker sheets expose profession rows as side / down / up.
      fish: npcWorkRowSet(
        { row: 10, n: 9 },
        { row: 11, n: 9 },
        { row: 12, n: 8 },
      ),
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
      farm_till: npcWorkRowSet(
        { row: 7, n: 6 },
        { row: 8, n: 6 },
        { row: 9, n: 6 },
      ),
      farm_water: npcWorkRowSet(
        { row: 10, n: 6 },
        { row: 11, n: 6 },
        { row: 12, n: 6 },
      ),
    },
  },
  slate: {
    p: 'NPCs (Premade)/Miner_Mike.png',
    idle: npcRowSet([0, 1, 2]),
    walk: npcRowSet([3, 4, 5]),
    work: {
      mine: npcWorkRowSet(
        { row: 7, n: 6 },
        { row: 8, n: 6 },
        { row: 9, n: 6 },
      ),
    },
  },
  moss: {
    p: 'NPCs (Premade)/Lumberjack_Jack.png',
    idle: npcRowSet([0, 1, 2]),
    walk: npcRowSet([3, 4, 5]),
    work: {
      chop: npcWorkRowSet(
        { row: 7, n: 6 },
        { row: 8, n: 6 },
        { row: 9, n: 6 },
      ),
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

    // Shore-adjacent water scenes: lily pads, fish, rocks, reeds, cloud shadows, and the occasional boat
    if (neighbors) {
      const isLand = (tt) => tt && tt !== 'water';
      const cardinalLand = [
        neighbors.n,
        neighbors.s,
        neighbors.e,
        neighbors.w,
      ].filter(isLand).length;
      const cardinalWater = [
        neighbors.n,
        neighbors.s,
        neighbors.e,
        neighbors.w,
      ].filter((tt) => tt === 'water').length;
      const nearShore = cardinalLand > 0;
      if (nearShore) {
        const padFi = Math.floor((t * 0.0015 + h * 0.2) % WATER_LILLYPAD_FRAMES);
        const smallDecorSize = size * 0.68;
        const mediumDecorSize = size * 0.76;
        const smallInset = (size - smallDecorSize) / 2;
        const mediumInset = (size - mediumDecorSize) / 2;
        if (h % 6 === 0) {
          const padIdx = (h >>> 5) % WATER_LILLYPADS.length;
          drawFrame(ctx, cfp(WATER_DECOR_DIR + WATER_LILLYPADS[padIdx]),
            padFi * 16, 0, 16, 16, x + smallInset, y + smallInset, smallDecorSize, smallDecorSize, undefined, 0.76);
        }
        if (h % 13 === 0) {
          const bloomIdx = (h >>> 3) % WATER_LILYPAD_BLOOMS.length;
          drawFrame(ctx, cfp(WATER_DECOR_DIR + WATER_LILYPAD_BLOOMS[bloomIdx]),
            padFi * 16, 0, 16, 16, x + smallInset, y + smallInset, smallDecorSize, smallDecorSize, undefined, 0.82);
        }
        if (h % 17 === 0) {
          const reedIdx = (h >>> 4) % WATER_GRASS_CLUMPS.length;
          drawFrame(ctx, cfp(WATER_DECOR_DIR + WATER_GRASS_CLUMPS[reedIdx]),
            padFi * 16, 0, 16, 16, x + mediumInset, y + mediumInset, mediumDecorSize, mediumDecorSize, undefined, 0.9);
        }
        if (h % 19 === 0) {
          const cattailIdx = (h >>> 2) % WATER_CATTAILS.length;
          drawFrame(ctx, cfp(WATER_DECOR_DIR + WATER_CATTAILS[cattailIdx]),
            padFi * 16, 0, 16, 16, x + mediumInset, y + mediumInset, mediumDecorSize, mediumDecorSize, undefined, 0.92);
        }
        if (h % 23 === 0) {
          const rockIdx = (h >>> 6) % WATER_ROCKS.length;
          drawFrame(ctx, cfp(WATER_ROCKS_DIR + WATER_ROCKS[rockIdx]),
            padFi * 16, 0, 16, 16, x + smallInset, y + smallInset, smallDecorSize, smallDecorSize, undefined, 0.86);
        }
        if (h % 29 === 0) {
          const fishFi = Math.floor((t * 0.0022 + h * 0.41) % WATER_FISH_FRAMES);
          const fishSize = size * 0.94;
          const fishX = x + size * 0.04;
          const fishY = y + size * 0.08 + Math.sin(t * 0.0025 + h) * size * 0.02;
          drawFrame(ctx, cfp(WATER_FISH_ANIM), fishFi * 16, 0, 16, 16, fishX, fishY, fishSize, fishSize, h % 2 === 0 ? 1 : -1, 0.74);
        }
      }
    }
    return true;
  }

  /* ── Bridge tiles: render on top of water base ── */
  if (tile.t === 'bridge_wood' || tile.t === 'bridge_stone') {
    // Draw water underneath first
    const [wsx, wsy] = WANG_LOOKUP[0];
    drawFrame(ctx, cfp(WANG_WATER_GRASS), wsx, wsy, 16, 16, x, y, size, size);
    const fi = Math.floor((t * 0.003 + h * 0.1) % WATER_CONN_FRAMES);
    drawFrame(ctx, cfp(WATER_CONN_ANIM), fi * WATER_CONN_FRAME_W + 16, 16, 16, 16, x, y, size, size, undefined, 0.2);
    // Determine orientation: if neighbors N/S are bridge or land → vertical, else horizontal
    const isLandOrBridge = (tt) => tt && tt !== 'water';
    const hasNS = isLandOrBridge(neighbors?.n) || isLandOrBridge(neighbors?.s);
    const hasEW = isLandOrBridge(neighbors?.e) || isLandOrBridge(neighbors?.w);
    const vertical = hasNS && !hasEW;
    if (tile.t === 'bridge_wood') {
      // Bridge_Wood_1.png is 96×64 = 3 columns of 32×32 tiles (2 rows)
      // Col 0 = vertical rail, Col 1 = deck with rails, Col 2 = deck variant
      // Use col 1 (middle section) for the bridge surface
      const srcX = vertical ? 0 : 32;
      const srcY = 0;
      drawFrame(ctx, cfp('Tiles/Bridge/Bridge_Wood_1.png'), srcX, srcY, 32, 32, x, y, size, size);
    } else {
      // Bridge_Stone_Vertical.png 64×96 for vertical, Bridge_Stone_Horizontal.png for horizontal
      if (vertical) {
        // 64×96 = 2 cols × 3 rows of 32×32. Use col 0, row 1 (middle section)
        drawFrame(ctx, cfp('Tiles/Bridge/Bridge_Stone_Vertical.png'), 0, 32, 32, 32, x, y, size, size);
      } else {
        // 192×112 = 6 cols × 3.5 rows. Use col 1, row 0 (center section)
        drawFrame(ctx, cfp('Tiles/Bridge/Bridge_Stone_Horizontal.png'), 64, 0, 32, 32, x, y, size, size);
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

  /* ── Path auto-tiling (path↔grass Wang transitions) ── */
  // Each variant (dirt, stone) has its own wang texture and is computed separately,
  // so a stone path next to a dirt path gives a clean tile-edge seam between them.
  const hasPathBuilding = tile.b != null && terrain?.isPathBuilding;
  const ownVariant = terrain?.pathVariant || null;
  if (neighbors) {
    // Compute a wang index for one variant — counts only neighbors of that variant.
    const wangIdxForVariant = (variant) => {
      const matches = (dir) => neighbors[dir + '_pathVariant'] === variant;
      const nNW = (matches('n') || matches('w') || matches('nw')) ? 1 : 0;
      const nNE = (matches('n') || matches('e') || matches('ne')) ? 1 : 0;
      const nSW = (matches('s') || matches('w') || matches('sw')) ? 1 : 0;
      const nSE = (matches('s') || matches('e') || matches('se')) ? 1 : 0;
      return nNW * 8 + nNE * 4 + nSW * 2 + nSE;
    };

    // Both path variants use Wang auto-tiling for organic edges that bleed
    // softly onto grass — matches the cute fantasy reference. Each variant
    // has its own atlas + lookup table so stone/dirt keep their own textures.
    const PATH_ATLAS = {
      dirt:  { src: WANG_DIRT_GRASS,   lookup: PATH_WANG_LOOKUP },
      stone: { src: WANG_COBBLE_GRASS, lookup: COBBLE_WANG_LOOKUP },
    };

    const drawPathTile = (variant, idx, alpha = 1) => {
      const atlas = PATH_ATLAS[variant];
      if (!atlas) return;
      const [psx, psy] = atlas.lookup[idx];
      drawFrame(ctx, cfp(atlas.src), psx, psy, 16, 16, x, y, size, size, undefined, alpha);
    };

    const drawPathTileClipped = (variant, idx, alpha = 1) => {
      const halfW = size / 2;
      const halfH = size / 2;
      ctx.save();
      ctx.beginPath();
      if (wangIdx & 8) ctx.rect(x, y, halfW, halfH);
      if (wangIdx & 4) ctx.rect(x + halfW, y, halfW, halfH);
      if (wangIdx & 2) ctx.rect(x, y + halfH, halfW, halfH);
      if (wangIdx & 1) ctx.rect(x + halfW, y + halfH, halfW, halfH);
      ctx.clip();
      drawPathTile(variant, idx, alpha);
      ctx.restore();
    };

    if (hasPathBuilding) {
      // Path building: draw using own variant. Opposite-variant neighbours
      // render as grass from the perspective of this tile, so stone/dirt
      // meet with a clean seam at the tile boundary.
      const variant = ownVariant || 'dirt';
      const sameIdx = wangIdxForVariant(variant);
      // Fully-inside path cells still render as all-path (idx 15).
      const idx = sameIdx > 0 ? sameIdx : 15;
      drawPathTile(variant, idx);
    } else if (terrain?.enclosedByPath && terrain?.pathVariant) {
      // Grass cell that is geometrically enclosed by path (either by
      // strict flood-fill or by neighbourhood-majority heuristic). Render
      // as a solid path tile using the dominant surrounding variant so
      // decorative grass holes inside the paved area disappear.
      drawPathTile(terrain.pathVariant, 15, 1);
    } else {
      // Grass / shore tile: let each path variant bleed onto the grass with
      // its own organic wang transition. Stone and dirt are painted
      // independently so a grass tile bordering both gets both textures on
      // the appropriate corners.
      for (const variant of ['dirt', 'stone']) {
        const idx = wangIdxForVariant(variant);
        if (idx === 0) continue;
        if (!isShoreTransition) {
          drawPathTile(variant, idx, 0.9);
        } else {
          // Shore tile: clip transitions to grass quadrants only, so the
          // path texture never covers the water portion of the wang base.
          const maskedIdx = idx & wangIdx;
          if (maskedIdx > 0) drawPathTileClipped(variant, maskedIdx, 0.9);
        }
      }
    }
  }

  // Shore shimmer removed — it overlaid blue animation on the ENTIRE tile including
  // grass portions, visibly tinting shore grass darker. The wang tiles already contain
  // correct water-coloured pixels that blend with adjacent animated water tiles.

  /* ── Flower-grass overlays on ~16 % of open ground tiles ── */
  // Only on inland grass tiles — never on shore tiles (even mostly-grass ones)
  // or on cells we've painted as path-fill (they should look solid-paved).
  if (!hasPathBuilding && !isShoreTransition && !terrain?.enclosedByPath
      && tile.t !== 'tree' && tile.t !== 'rock' && tile.t !== 'bush' && tile.t !== 'stump') {
    if (h % 6 === 0) {
      const variant = (h >>> 3) % FLOWER_GRASS_COUNT + 1;
      const fi = Math.floor((t * 0.002 + h * 0.07) % FLOWER_GRASS_FRAMES);
      const file = FLOWER_GRASS_DIR + 'Flower_Grass_' + variant + '_Anim.png';
      // Draw smaller than tile for less pixelated look, with deterministic offset
      const drawSize = Math.round(size * 0.55);
      const offX = ((h * 7) % 5) * (size - drawSize) / 4;
      const offY = ((h * 13) % 5) * (size - drawSize) / 4;
      drawFrame(ctx, cfp(file), fi * 16, 0, 16, 16, x + offX, y + offY, drawSize, drawSize);
    }
  }

  // Return 2 for shore transitions to suppress procedural shore glow in drawTile
  return isShoreTransition ? 2 : true;
}

export function drawCuteFantasyFishingDecor(ctx, decor, tileSize, time = 0) {
  if (!decor?.type) return false;
  const x = decor.screenX ?? 0;
  const y = decor.screenY ?? 0;
  const seed = decor.seed ?? 0;

  if (decor.type === 'cloud_shadow') {
    const [sx, sy] = CLOUD_VARIANTS[Math.abs(decor.variant ?? seed) % CLOUD_VARIANTS.length];
    const entry = getImage(cfp(CLOUDS_IMG));
    if (!entry?.loaded) return true; // suppress fallback while image loads
    const drift = decor.externalDrift ? 0 : Math.sin(time * 0.00008 + seed * 1.17) * tileSize * 0.12;
    const width = decor.width ?? tileSize * 3.8;
    const height = decor.height ?? tileSize * 2.6;
    // Use the Clouds.png sprite masked into a dark silhouette for a crisp pixel-art ground shadow
    const maskKey = `cloud_shadow_${sx}_${sy}`;
    let maskEntry = CLOUD_SHADOW_MASK_CACHE.get(maskKey);
    if (!maskEntry && typeof document !== 'undefined') {
      const mask = document.createElement('canvas');
      mask.width = 64;
      mask.height = 64;
      const mctx = mask.getContext('2d');
      if (mctx) {
        mctx.imageSmoothingEnabled = false;
        mctx.drawImage(entry.image, sx, sy, 64, 64, 0, 0, 64, 64);
        mctx.globalCompositeOperation = 'source-in';
        mctx.fillStyle = '#0a1220';
        mctx.fillRect(0, 0, 64, 64);
        maskEntry = mask;
        CLOUD_SHADOW_MASK_CACHE.set(maskKey, maskEntry);
      }
    }
    if (!maskEntry) return true;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.min(0.55, decor.alpha ?? 0.4);
    ctx.drawImage(maskEntry, 0, 0, 64, 64, Math.round(x + drift), Math.round(y), Math.round(width), Math.round(height));
    ctx.restore();
    return true;
  }

  if (decor.type === 'boat') {
    const entry = getImage(cfp(BOAT_ANIM));
    if (!entry?.loaded) return false;
    const frame = Math.floor((time * 0.0011 + seed * 0.29) % BOAT_FRAMES);
    const width = decor.width ?? tileSize * 2.08;
    const height = decor.height ?? tileSize * 1.1;
    const shoreDir = decor.shoreDir || 'n';
    const vertical = !!decor.vertical || shoreDir === 'e' || shoreDir === 'w';
    const rope = decor.postScreenX != null && decor.postScreenY != null && decor.ropeScreenX != null && decor.ropeScreenY != null
      ? {
          ax: decor.postScreenX,
          ay: decor.postScreenY,
          bx: decor.ropeScreenX,
          by: decor.ropeScreenY,
        }
      : {
          n: { ax: x + width * 0.54, ay: y - tileSize * 0.06, bx: x + width * 0.54, by: y + height * 0.44 },
          s: { ax: x + width * 0.48, ay: y + height + tileSize * 0.04, bx: x + width * 0.48, by: y + height * 0.56 },
          e: { ax: x + width + tileSize * 0.06, ay: y + height * 0.44, bx: x + width * 0.76, by: y + height * 0.48 },
          w: { ax: x - tileSize * 0.06, ay: y + height * 0.44, bx: x + width * 0.24, by: y + height * 0.48 },
        }[shoreDir];
    ctx.save();
    ctx.strokeStyle = 'rgba(88,55,24,0.7)';
    ctx.lineWidth = Math.max(1, tileSize * 0.05);
    ctx.beginPath();
    ctx.moveTo(rope.ax, rope.ay);
    ctx.lineTo(rope.bx, rope.by);
    ctx.stroke();
    ctx.fillStyle = '#7a5526';
    ctx.fillRect(rope.ax - tileSize * 0.04, rope.ay - tileSize * 0.04, tileSize * 0.08, tileSize * 0.08);
    ctx.restore();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (decor.alpha != null) ctx.globalAlpha = decor.alpha;
    if (vertical) {
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate(shoreDir === 'e' ? Math.PI / 2 : -Math.PI / 2);
      ctx.drawImage(entry.image, frame * 48, 0, 48, 48, -height / 2, -width / 2, height, width);
    } else {
      ctx.drawImage(entry.image, frame * 48, 0, 48, 48, x, y, width, height);
    }
    ctx.restore();
    return true;
  }

  if (decor.type === 'fishing_bank') {
    const bank = PIXELLAB_FISHING_BANK[decor.shoreDir || 'n'] || PIXELLAB_FISHING_BANK.n;
    return drawImg(
      ctx,
      bank.src,
      x,
      y,
      decor.width ?? tileSize,
      decor.height ?? tileSize,
      bank.facing,
      decor.alpha ?? 0.9,
    );
  }

  if (decor.type === 'swim_fish') {
    const frame = Math.floor((time * 0.0022 + seed * 0.41) % WATER_FISH_FRAMES);
    const wobbleY = Math.sin(time * 0.0025 + seed) * tileSize * 0.02;
    return drawFrame(
      ctx,
      cfp(WATER_FISH_ANIM),
      frame * 16,
      0,
      16,
      16,
      x,
      y + wobbleY,
      decor.width ?? tileSize * 0.88,
      decor.height ?? tileSize * 0.88,
      decor.facing ?? 1,
      decor.alpha ?? 0.72,
    );
  }

  if (decor.type === 'water_rock') {
    const src = WATER_ROCKS_DIR + WATER_ROCKS[Math.abs(decor.variant ?? seed) % WATER_ROCKS.length];
    const frame = Math.floor((time * 0.0014 + seed * 0.17) % WATER_LILLYPAD_FRAMES);
    return drawFrame(
      ctx,
      cfp(src),
      frame * 16,
      0,
      16,
      16,
      x,
      y,
      decor.width ?? tileSize * 0.92,
      decor.height ?? tileSize * 0.92,
      undefined,
      decor.alpha ?? 0.88,
    );
  }

  if (decor.type === 'water_plant') {
    const variants = decor.variantGroup === 'bloom'
      ? WATER_LILYPAD_BLOOMS
      : decor.variantGroup === 'reed'
        ? WATER_GRASS_CLUMPS
        : WATER_LILLYPADS;
    const src = WATER_DECOR_DIR + variants[Math.abs(decor.variant ?? seed) % variants.length];
    const frame = Math.floor((time * 0.0015 + seed * 0.21) % WATER_LILLYPAD_FRAMES);
    return drawFrame(
      ctx,
      cfp(src),
      frame * 16,
      0,
      16,
      16,
      x,
      y,
      decor.width ?? tileSize,
      decor.height ?? tileSize,
      undefined,
      decor.alpha ?? 0.86,
    );
  }

  if (decor.type === 'cattail') {
    const src = WATER_DECOR_DIR + WATER_CATTAILS[Math.abs(decor.variant ?? seed) % WATER_CATTAILS.length];
    const frame = Math.floor((time * 0.0012 + seed * 0.11) % WATER_LILLYPAD_FRAMES);
    return drawFrame(
      ctx,
      cfp(src),
      frame * 16,
      0,
      16,
      16,
      x,
      y,
      decor.width ?? tileSize * 0.98,
      decor.height ?? tileSize * 0.98,
      undefined,
      decor.alpha ?? 0.92,
    );
  }

  return false;
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
  const level = bLevel(buildingOrType);
  const b = getBuildingSprite(type, level);
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

  // Fence tiles: auto-tile based on 4-directional neighbor connectivity
  if (type === 'fence') {
    let mask;
    if (typeof buildingOrType === 'object') {
      mask = buildingOrType._fenceNeighbors ?? 0;
    } else {
      mask = 5; // EW horizontal for thumbnail preview
    }
    const [sx, sy] = FENCE_TILE_LOOKUP[mask];
    return drawFrame(ctx, cfp(OD + '/Fences.png'), sx, sy, 16, 16, x, y, width, height);
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
  const flipH = dir === 'side' && facing === -1;
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
  const waterborne = !!options?.waterborne;
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
  const waterAnim = an.waterIdle || an.idle;
  const animSet = waterborne ? waterAnim : (moving ? an.walk : an.idle);
  const resolvedDir = (waterborne && mapped === 'duck')
    ? 'side'
    : (an.preferSideFacing ? 'side' : dir);
  const anim = animSet?.[resolvedDir] || animSet?.side || animSet;
  const fi = Math.floor(frameOffset * anim.n) % anim.n;
  const sx = fi * 32;
  const sy = anim.row * 32;

  const d = tileSize * scale;
  const idleState = options?.idleState;
  const isSleeping = idleState === 'sleeping';
  const isResting = idleState === 'resting';
  const verticalFloat = waterborne ? Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.012 : 0;
  const idleBreath = !moving && !waterborne && !isSleeping ? Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.01 : 0;
  const idleSway = !moving && !waterborne && !isSleeping ? Math.sin(frameOffset * Math.PI + mapped.length) * tileSize * 0.004 : 0;
  // Sleeping animals appear slightly flattened (lying down effect)
  const scaleY = isSleeping ? 0.72 : (isResting ? 0.88 : 1.0);
  const ySquish = isSleeping ? d * 0.17 : (isResting ? d * 0.07 : 0);
  const drawX = x - d / 2 + idleSway;
  const drawY = y - d * 0.6 + verticalFloat + idleBreath + ySquish;
  if (!waterborne) {
    const shadowW = isSleeping ? d * 0.26 : d * 0.22;
    const shadowH = isSleeping ? d * 0.1 : d * 0.07;
    dropShadow(ctx, x + idleSway * 0.15, y + d * 0.06 + ySquish * 0.4, shadowW, shadowH, isSleeping ? 0.14 : 0.18);
  }
  return drawFrame(
    ctx, src,
    sx, sy, 32, 32,
    drawX, drawY, d, d * scaleY,
    resolvedDir === 'side' ? (fac === 1 ? -1 : 1) : undefined,
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
    const idlePhase = frameOffset * Math.PI * 2;
    const bob = moving
      ? Math.sin(idlePhase) * d * 0.025
      : Math.sin(idlePhase) * d * 0.018;
    const swayX = !moving && dir === 'south'
      ? Math.sin(idlePhase * 0.5) * d * 0.012
      : 0;
    const breath = !moving
      ? Math.sin(idlePhase) * 0.018
      : 0;
    const drawW = d * (1 - breath * 0.35);
    const drawH = d * (1 + breath * 0.55);
    dropShadow(ctx, x, y + d * 0.16, drawW * 0.22, drawW * 0.07, 0.18);

    const animSrc = moving ? heroPet.walk[dir] : heroPet.idle[dir];
    const animEntry = getImage(animSrc);
    if (animEntry?.loaded) {
      const frameCount = moving ? heroPet.walkFrames : heroPet.idleFrames;
      const fi = Math.floor(frameOffset * frameCount) % frameCount;
      return drawFrame(
        ctx, animSrc,
        fi * heroPet.fw, 0, heroPet.fw, heroPet.fh,
        x - drawW / 2 + swayX, y - drawH * 0.76 + bob, drawW, drawH,
      );
    }

    const baseEntry = getImage(heroPet.base);
    if (!baseEntry?.loaded) return true;
    const drawFacing = dir === 'west' ? -1 : 1;
    return drawImg(ctx, heroPet.base, x - drawW / 2 + swayX, y - drawH * 0.76 + bob, drawW, drawH, drawFacing);
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

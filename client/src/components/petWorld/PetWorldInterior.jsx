import React, { useEffect, useRef, useState } from 'react';
import { getBuildingUi, getBuildingLabel } from './petWorldBuildings';
import './petWorldCfUi.css';

/* ═══ Image cache (same lazy-load pattern as CuteFantasy sprites) ═══ */

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

function draw(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
  const entry = getImage(src);
  if (!entry?.loaded) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(entry.image, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
  return true;
}

/* ═══ Constants ═══ */

const ST = 16; // source tile pixel size

const MAIN = '/pet-world/interior/Fantasy%20RPG%20Interior%20Pack%20(16x16%20grid).png';
const EXP_WORKSHOP = '/pet-world/interior/Expansion_Workshop.png';
const EXP_ALCHEMY  = '/pet-world/interior/Expansion_AlchemyLab.png';
const EXP_MUSIC    = '/pet-world/interior/Expansion_Music.png';
const EXP_BEDROOM  = '/pet-world/interior/Expansion_Bedroom.png';
const EXP_FACTORY  = '/pet-world/interior/Expansion_ClockworkFactory.png';
const EXP_SCHOOL   = '/pet-world/interior/Expansion_School.png';

/* Animated sprite strips (horizontal, equal-width frames) */
const AN_FIRE      = '/pet-world/interior/animated/Fireplace.png';
const AN_CANDLE    = '/pet-world/interior/animated/Candle.png';
const AN_FURNACE   = '/pet-world/interior/animated/Furnace.png';
const AN_CAULDRON  = '/pet-world/interior/animated/Cauldron%20(purple).png';
const AN_CANDSTAND = '/pet-world/interior/animated/CandelabrumStand.png';
const AN_TORCH     = '/pet-world/interior/animated/TorchFront.png';
const AN_LAMP      = '/pet-world/interior/animated/Lamp.png';

/* ═══ Drawing helpers ═══ */

/** Draw one 16×16 tile from the main spritesheet, scaled to ts×ts. */
function til(ctx, c, r, dx, dy, ts) {
  return draw(ctx, MAIN, c * ST, r * ST, ST, ST, dx, dy, ts, ts);
}

/** Draw a multi-tile sprite from any spritesheet. */
function spr(ctx, sheet, c, r, tw, th, dx, dy, ts) {
  return draw(ctx, sheet, c * ST, r * ST, tw * ST, th * ST, dx, dy, tw * ts, th * ts);
}

/* ═══ Wall color palettes ═══ */
/*
 * Each is [startCol, startRow] for a 3-wide × 2-high colored wall tile block
 * in the main spritesheet. The 3 columns are: left edge, center, right edge.
 * The 2 rows are face variant A / face variant B (for tiling variety).
 */
const WP = {
  red:    [15, 0], beige:  [15, 2],
  blue:   [18, 0], pink:   [18, 2],
  orange: [21, 0], bright: [21, 2],
  brown:  [24, 0], green:  [24, 2],
  brick:  [27, 0],
};

/* ═══ Item definition helpers ═══ */

const M = MAIN;

/** Static sprite: (sheet, spriteCol, spriteRow, tileW, tileH, roomX, roomY).
 *  roomX/roomY are positions on the floor grid; negative y places items in the wall area. */
function I(s, c, r, tw, th, x, y) {
  return { s, c, r, tw, th, x, y };
}

/** Animated horizontal-strip sprite: (sheet, tileW, tileH, frameCount, roomX, roomY). */
function A(s, tw, th, frames, x, y) {
  return { s, tw, th, anim: frames, x, y };
}

/* ═══ Room definitions ═══ */
/*
 * w/h     – floor area in tiles
 * wall    – [col, row] key into wall palettes
 * floor   – row offset for 3-row auto-tile at cols 6-8 (0 = warm peach, 3 = cool)
 * items[] – furniture placed on the floor grid (y<0 = wall area)
 */

const ROOMS = {
  /* ── Housing ── */
  house: {
    w: 8, h: 6, wall: WP.beige, floor: 0,
    items: [
      I(M, 9, 25, 3, 2, 0, 0),          // bed
      A(AN_FIRE, 2, 4, 4, 4, -2),       // fireplace (chimney in wall, fire on floor)
      I(M, 12, 15, 2, 4, 6, 0),         // gold cushion chair
      I(M, 16, 20, 1, 3, 3, 0),         // bookshelf
      I(M, 0, 29, 3, 3, 0, 3),          // red sofa
      I(M, 0, 12, 2, 3, 4, 3),          // table
    ],
  },
  large_house: {
    w: 10, h: 7, wall: WP.blue, floor: 0,
    items: [
      I(M, 9, 23, 3, 2, 0, 0),          // bed 1
      I(M, 9, 27, 3, 2, 0, 3),          // bed 2 (different style)
      A(AN_FIRE, 2, 4, 4, 5, -2),       // fireplace
      I(M, 3, 29, 3, 3, 7, 4),          // blue sofa
      I(M, 0, 15, 2, 4, 8, 0),          // cabinet
      I(M, 17, 20, 1, 3, 3, 0),         // blue bookshelf
      I(M, 17, 20, 1, 3, 7, 0),         // blue bookshelf
      A(AN_CANDLE, 1, 1, 4, 4, 0),      // candle
    ],
  },

  /* ── Food ── */
  farm: {
    w: 8, h: 6, wall: WP.brown, floor: 3,
    items: [
      I(EXP_WORKSHOP, 0, 8, 3, 3, 0, 0),  // workshop table
      I(M, 10, 12, 2, 3, 5, 0),            // wood table
      I(M, 8, 15, 2, 4, 6, 2),             // wood cabinet
      I(M, 4, 12, 2, 3, 3, 3),             // table
      A(AN_LAMP, 1, 1, 4, 7, 0),           // lamp
    ],
  },
  fishing_hut: {
    w: 7, h: 5, wall: WP.brown, floor: 3,
    items: [
      I(M, 6, 12, 2, 3, 0, 0),             // table
      I(M, 10, 12, 2, 3, 3, 0),            // wood table
      I(M, 4, 15, 2, 4, 5, 0),             // cabinet
      A(AN_LAMP, 1, 1, 4, 2, 0),           // lamp
    ],
  },
  bakery: {
    w: 8, h: 6, wall: WP.orange, floor: 0,
    items: [
      A(AN_FURNACE, 2, 3, 4, 0, -1),       // furnace (overlaps wall)
      I(M, 2, 12, 2, 3, 2, 0),             // table
      I(M, 12, 12, 2, 3, 4, 0),            // orange table
      I(M, 6, 15, 2, 4, 6, 0),             // cabinet
      I(M, 6, 12, 2, 3, 3, 3),             // small table
      A(AN_CANDLE, 1, 1, 4, 5, 3),         // candle
    ],
  },

  /* ── Resource ── */
  woodcutters_hut: {
    w: 6, h: 5, wall: WP.brown, floor: 3,
    items: [
      I(EXP_WORKSHOP, 0, 5, 3, 3, 0, 0),   // workbench
      I(M, 10, 12, 2, 3, 4, 0),             // wood table
      A(AN_LAMP, 1, 1, 4, 3, 0),            // lamp
    ],
  },
  stone_pit: {
    w: 6, h: 5, wall: WP.brick, floor: 3,
    items: [
      I(M, 6, 12, 2, 3, 0, 0),              // table
      I(M, 4, 15, 2, 4, 4, 0),              // cabinet
      I(EXP_WORKSHOP, 0, 5, 3, 3, 1, 2),    // workbench
    ],
  },
  lumberyard: {
    w: 8, h: 6, wall: WP.brown, floor: 3,
    items: [
      I(EXP_WORKSHOP, 0, 5, 3, 3, 0, 0),    // workbench
      I(EXP_WORKSHOP, 0, 8, 3, 3, 0, 3),    // workshop table
      I(M, 10, 12, 2, 3, 4, 0),              // wood table
      I(M, 8, 15, 2, 4, 6, 0),               // wood cabinet
      A(AN_LAMP, 1, 1, 4, 3, 0),             // lamp
    ],
  },
  quarry: {
    w: 8, h: 6, wall: WP.brick, floor: 3,
    items: [
      I(EXP_WORKSHOP, 0, 8, 3, 3, 0, 0),    // workshop table
      I(EXP_WORKSHOP, 0, 5, 3, 3, 5, 0),    // workbench
      I(M, 6, 12, 2, 3, 3, 3),               // table
      I(M, 2, 15, 2, 4, 6, 2),               // cabinet
    ],
  },

  /* ── Cloth ── */
  weaving_hut: {
    w: 8, h: 6, wall: WP.pink, floor: 0,
    items: [
      I(M, 16, 15, 2, 4, 0, 0),             // peach cushion
      I(M, 14, 15, 2, 4, 6, 0),             // blue cushion
      I(M, 0, 12, 2, 3, 3, 1),              // table
      I(M, 12, 29, 3, 3, 2, 3),             // purple sofa
      A(AN_CANDLE, 1, 1, 4, 5, 1),          // candle
    ],
  },

  /* ── Trade / Gold ── */
  market: {
    w: 8, h: 6, wall: WP.red, floor: 0,
    items: [
      I(M, 0, 12, 2, 3, 0, 0),              // table (counter)
      I(M, 2, 12, 2, 3, 2, 0),              // table
      I(M, 0, 15, 2, 4, 6, 0),              // red cabinet
      I(M, 4, 12, 2, 3, 1, 3),              // table
      I(M, 6, 12, 2, 3, 4, 3),              // table
      A(AN_LAMP, 1, 1, 4, 5, 0),            // lamp
    ],
  },
  trading_post: {
    w: 8, h: 6, wall: WP.beige, floor: 0,
    items: [
      I(M, 10, 12, 2, 3, 3, 0),             // wood table (desk)
      I(M, 16, 20, 1, 3, 0, 0),             // bookshelf
      I(M, 17, 20, 1, 3, 1, 0),             // bookshelf
      I(M, 12, 15, 2, 4, 6, 0),             // gold cushion
      I(M, 6, 29, 3, 3, 2, 3),              // orange sofa
      A(AN_CANDSTAND, 1, 2, 4, 5, 0),       // candelabrum
    ],
  },

  /* ── Storage ── */
  storehouse: {
    w: 8, h: 6, wall: WP.brown, floor: 3,
    items: [
      I(M, 0, 15, 2, 4, 0, 0),              // cabinet
      I(M, 2, 15, 2, 4, 2, 0),              // cabinet
      I(M, 4, 15, 2, 4, 6, 0),              // cabinet
      I(M, 10, 12, 2, 3, 4, 0),             // table
      I(M, 6, 12, 2, 3, 4, 3),              // table
      A(AN_TORCH, 1, 2, 4, 7, -1),          // torch on wall
    ],
  },
  warehouse: {
    w: 10, h: 7, wall: WP.brick, floor: 3,
    items: [
      I(M, 0, 15, 2, 4, 0, 0),              // cabinet
      I(M, 2, 15, 2, 4, 2, 0),              // cabinet
      I(M, 4, 15, 2, 4, 4, 0),              // cabinet
      I(M, 6, 15, 2, 4, 8, 0),              // cabinet
      I(M, 10, 12, 2, 3, 6, 0),             // table
      I(M, 8, 12, 2, 3, 4, 4),              // table
      I(M, 6, 12, 2, 3, 0, 4),              // table
      A(AN_LAMP, 1, 1, 4, 7, 4),            // lamp
    ],
  },

  /* ── Support ── */
  town_hall: {
    w: 10, h: 8, wall: WP.blue, floor: 0,
    items: [
      I(M, 0, 12, 2, 3, 3, 1),              // conference table
      I(M, 2, 12, 2, 3, 5, 1),              // conference table
      I(M, 16, 20, 1, 3, 0, 0),             // bookshelf
      I(M, 17, 20, 1, 3, 1, 0),             // bookshelf
      I(M, 16, 20, 1, 3, 8, 0),             // bookshelf
      I(M, 17, 20, 1, 3, 9, 0),             // bookshelf
      I(M, 3, 29, 3, 3, 0, 5),              // blue sofa
      I(M, 3, 29, 3, 3, 7, 5),              // blue sofa
      I(M, 14, 15, 2, 4, 4, 4),             // blue cushion
      A(AN_CANDSTAND, 1, 2, 4, 2, 0),       // candelabrum
      A(AN_CANDSTAND, 1, 2, 4, 7, 0),       // candelabrum
    ],
  },
  shrine: {
    w: 8, h: 6, wall: WP.green, floor: 3,
    items: [
      I(EXP_ALCHEMY, 11, 0, 3, 3, 0, 0),    // alchemy display shelf
      I(EXP_ALCHEMY, 11, 0, 3, 3, 5, 0),    // alchemy display shelf
      I(M, 12, 29, 3, 3, 1, 3),              // purple sofa (altar area)
      I(M, 19, 20, 1, 3, 4, 3),              // bookshelf
      A(AN_CAULDRON, 1, 1, 4, 3, 1),         // cauldron
      A(AN_CANDLE, 1, 1, 4, 7, 0),           // candle
    ],
  },
  watchtower: {
    w: 6, h: 5, wall: WP.brown, floor: 3,
    items: [
      I(M, 6, 12, 2, 3, 0, 0),               // table
      I(M, 2, 15, 2, 4, 4, 0),               // cabinet
      I(M, 8, 12, 2, 3, 2, 2),               // table
      A(AN_TORCH, 1, 2, 4, 3, -1),           // torch on wall
    ],
  },
  tavern: {
    w: 8, h: 6, wall: WP.brick, floor: 0,
    items: [
      I(M, 0, 12, 2, 3, 0, 0),               // bar counter
      I(M, 2, 12, 2, 3, 2, 0),               // bar counter
      A(AN_FIRE, 2, 4, 4, 4, -2),            // fireplace
      I(M, 6, 15, 2, 4, 6, 0),               // cabinet
      I(M, 4, 12, 2, 3, 0, 3),               // dining table
      I(M, 6, 12, 2, 3, 3, 3),               // dining table
      A(AN_CANDLE, 1, 1, 4, 6, 4),           // candle
    ],
  },
};

function getRoom(type) {
  return ROOMS[type] || ROOMS.house;
}

/* ═══ Room rendering ═══ */

function renderRoom(ctx, room, ts, canvasW, canvasH, time) {
  const fw = room.w;
  const fh = room.h;
  const totalW = fw + 2;   // floor + 1-tile side walls
  const totalH = fh + 3;   // floor + 3-tile wall (3 colored rows, top one gets darkened)

  // Center the room in the canvas
  const ox = Math.round((canvasW - totalW * ts) / 2);
  const oy = Math.round((canvasH - totalH * ts) / 2);
  const fx = ox + ts;              // floor left edge (after left side wall)
  const fy = oy + 3 * ts;         // floor top edge (after 3 wall rows)
  const wy = oy;                   // wall top edge

  /* ── 1. Background ── */
  ctx.fillStyle = '#080612';
  ctx.fillRect(0, 0, canvasW, canvasH);

  /* ── 2. Side walls (dark void tile, full height) ── */
  for (let r = 0; r < totalH; r++) {
    til(ctx, 1, 4, ox, oy + r * ts, ts);                    // left
    til(ctx, 1, 4, ox + (totalW - 1) * ts, oy + r * ts, ts); // right
  }

  /* ── 3. Back wall (3 rows of colored tiles) ── */
  const [wc, wr] = room.wall;
  for (let x = 0; x < fw; x++) {
    const c = x === 0 ? wc : x === fw - 1 ? wc + 2 : wc + 1;
    til(ctx, c, wr,     fx + x * ts, wy,              ts); // row 0 (darkened later)
    til(ctx, c, wr + 1, fx + x * ts, wy + ts,         ts); // row 1
    til(ctx, c, wr,     fx + x * ts, wy + 2 * ts,     ts); // row 2
  }

  /* ── 4. Top wall darkening gradient (ceiling shadow) ── */
  const capGrad = ctx.createLinearGradient(fx, wy, fx, wy + ts * 1.4);
  capGrad.addColorStop(0, 'rgba(8,6,18,0.72)');
  capGrad.addColorStop(1, 'rgba(8,6,18,0)');
  ctx.fillStyle = capGrad;
  ctx.fillRect(fx, wy, fw * ts, ts * 1.4);

  /* ── 5. Floor (auto-tiled with edges from cols 6-8) ── */
  const fr = room.floor; // row offset: 0 = warm peach, 3 = cool
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const tc = x === 0 ? 6 : x === fw - 1 ? 8 : 7;
      const tr = y === 0 ? fr : y === fh - 1 ? fr + 2 : fr + 1;
      til(ctx, tc, tr, fx + x * ts, fy + y * ts, ts);
    }
  }

  /* ── 6. Shadow under wall onto floor ── */
  const shadowGrad = ctx.createLinearGradient(fx, fy, fx, fy + ts * 1.5);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.16)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(fx, fy, fw * ts, ts * 1.5);

  /* ── 7. Furniture sprites (sorted by bottom edge for proper overlap) ── */
  const sorted = [...(room.items || [])].sort(
    (a, b) => (a.y + a.th) - (b.y + b.th),
  );
  for (const item of sorted) {
    const dx = fx + item.x * ts;
    const dy = fy + item.y * ts;

    if (item.anim) {
      // Animated horizontal strip — pick frame based on time
      const frameW = item.tw * ST;
      const fi = Math.floor(time / 200) % item.anim;
      draw(ctx, item.s, fi * frameW, 0, frameW, item.th * ST,
        dx, dy, item.tw * ts, item.th * ts);
    } else {
      spr(ctx, item.s, item.c, item.r, item.tw, item.th, dx, dy, ts);
    }
  }

  /* ── 8. Outer frame ── */
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, totalW * ts, totalH * ts);
}

/* ═══ Component ═══ */

export default function PetWorldInterior({ building, buildingDef, world, onExit }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animRef = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const buildingType = building?.type || building?.building_type || 'house';
  const ui = getBuildingUi(buildingType);
  const room = getRoom(buildingType);

  /* ── Responsive resize ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* ── Tile scale (integer multiplier so pixels stay crisp) ── */
  const tileScale = (() => {
    if (!size.width || !size.height) return 3;
    const totalW = room.w + 2;
    const totalH = room.h + 3;
    const sx = (size.width * 0.92) / (totalW * ST);
    const sy = (size.height * 0.88) / (totalH * ST);
    return Math.max(1, Math.floor(Math.min(sx, sy)));
  })();
  const ts = ST * tileScale;

  /* ── Render loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tick = () => {
      renderRoom(ctx, room, ts, size.width, size.height, performance.now());
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, room, ts]);

  /* ── Preload all sheets referenced by this room ── */
  useEffect(() => {
    getImage(MAIN);
    const sheets = new Set();
    for (const item of room.items || []) {
      if (item.s) sheets.add(item.s);
    }
    sheets.forEach((s) => getImage(s));
  }, [room]);

  const label = getBuildingLabel(building);
  const level = building?.level || 1;

  /* ── Stats ── */
  const stats = [];
  if (buildingDef?.production) {
    Object.entries(buildingDef.production).forEach(([key, val]) => {
      const mult = 1 + (level - 1) * 0.5;
      stats.push(`${key}: ${(val * mult).toFixed(1)}/cycle`);
    });
  }
  if (buildingDef?.housing) stats.push(`Housing: ${buildingDef.housing}`);
  if (buildingDef?.storageBonus) stats.push(`Storage: +${buildingDef.storageBonus}`);
  if (buildingDef?.happiness) stats.push(`Happiness: +${buildingDef.happiness}`);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#08060a]" style={{ overscrollBehavior: 'none' }}>
      {/* ── Header ── */}
      <div
        className="cf-panel-dark flex items-center gap-3 px-3"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingBottom: 6,
          borderRadius: 0,
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center text-lg">{ui.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="cf-text truncate text-[13px] font-black">{label}</div>
          <div className="flex items-center gap-2 cf-text-muted text-[9px]">
            <span>Level {level}</span>
            {building?.state !== 'built' && (
              <span className="cf-pill cf-pill-warn" style={{ fontSize: 8, padding: '0 5px' }}>Building</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="cf-btn cf-btn-brown shrink-0 px-3 py-1.5 text-[11px] font-semibold"
        >
          Leave
        </button>
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* ── Info bar ── */}
      <div
        className="cf-panel-dark px-3 py-2"
        style={{
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          borderRadius: 0,
          borderBottom: 'none',
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        <div className="flex items-center gap-3 text-[10px]">
          <div className="min-w-0 flex-1">
            {stats.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {stats.map((s) => (
                  <span key={s} className="cf-text-muted whitespace-nowrap">{s}</span>
                ))}
              </div>
            ) : (
              <span className="cf-text-muted">{buildingDef?.description || 'A building in your village.'}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onExit}
            className="cf-btn shrink-0 px-2.5 py-1 text-[9px]"
            style={{
              background: 'linear-gradient(180deg, rgba(139,94,43,0.15) 0%, rgba(139,94,43,0.08) 100%)',
              borderColor: 'rgba(139,94,43,0.35)',
              color: '#6a4a2a',
            }}
          >
            Back to village
          </button>
        </div>
      </div>
    </div>
  );
}

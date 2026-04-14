import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getBuildingUi, getBuildingLabel } from './petWorldBuildings';
import './petWorldCfUi.css';

/* ═══════════════════════════════════════════════════
   Cute Fantasy Interior Renderer – V4
   Seamless-pattern walls, flat wood floors,
   wall-mounted + floor items, horizontal-strip anims
   ═══════════════════════════════════════════════════ */

/* ─── image cache ─── */
const IC = new Map();
function ld(src) {
  if (typeof Image === 'undefined') return null;
  if (IC.has(src)) return IC.get(src);
  const img = new Image();
  const e = { img, ok: false };
  img.onload = () => { e.ok = true; };
  img.src = src;
  IC.set(src, e);
  return e;
}

/* ─── asset paths ─── */
const P = '/pet-world/cute-fantasy/Buildings';
const _W = `${P}/Houses_Interiors`;
const _D = `${P}/House_Decor`;

const S_BRICK = `${_W}/Brick_Wall_Fillers.png`;
const S_STONE = `${_W}/Stone_Wall_Fillers.png`;
const S_WOOD  = `${_W}/Wood_Wall_Fillers.png`;
const S_FLOOR = `${_W}/Wood_Floor_Tiles.png`;

const S_BED   = `${_D}/Beds.png`;
const S_TBL   = `${_D}/Tables.png`;
const S_CHR   = `${_D}/Chairs.png`;
const S_SHF   = `${_D}/BookShelves.png`;
const S_DOOR  = `${_D}/Doors.png`;
const S_WIN   = `${_D}/Windows_Single.png`;
const S_DECO  = `${_D}/Indoor_Decor.png`;
const S_ART   = `${_D}/Placeable_Decoration.png`;
const S_LAMP  = `${_D}/Standing_Lamps.png`;
const S_DRW   = `${_D}/Drawers.png`;
const S_PLT   = `${_D}/Planters.png`;
const S_FURN  = `${_D}/Furnace_Anim.png`;
const S_ANVL  = `${_D}/Anvil_Anim.png`;
const S_CHST  = `${_D}/Chest_Anim.png`;
const S_GCHST = `${_D}/Golden_Chest_Anim.png`;

const T = 16;

/* ─── pattern fill (tile a source rect across dest area) ─── */
function fillPat(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh, sc) {
  const e = ld(src);
  if (!e?.ok) return;
  ctx.imageSmoothingEnabled = false;
  const tw = Math.round(sw * sc);
  const th = Math.round(sh * sc);
  if (tw < 1 || th < 1) return;
  for (let py = 0; py < dh; py += th) {
    for (let px = 0; px < dw; px += tw) {
      const rw = Math.min(tw, dw - px);
      const rh = Math.min(th, dh - py);
      ctx.drawImage(e.img, sx, sy, sw * (rw / tw), sh * (rh / th), dx + px, dy + py, rw, rh);
    }
  }
}

/* ─── wall / floor pattern defs ─── */
const WP = {
  brick: { src: S_BRICK, x: 0, y: 0, w: 32, h: 32 },
  stone: { src: S_STONE, x: 0, y: 0, w: 32, h: 32 },
  wood:  { src: S_WOOD,  x: 0, y: 0, w: 32, h: 32 },
};
// Floor tiles from S_FLOOR (128×96, 4×3 grid of 32×32)
const FP = [
  [0,0],[32,0],[64,0],[96,0],
  [0,32],[32,32],[64,32],[96,32],
  [0,64],[32,64],[64,64],[96,64],
];

/* ─── sprite source rects [sx,sy,sw,sh] ─── */
const BED    = (c) => [0, c*32, 32, 32];
const TBL_L  = [0, 0, 48, 32];
const TBL_S  = [96, 0, 32, 32];
const CR     = 50;
const CHR_F  = (c) => [32, c*CR, 32, 32];   // south-facing (front view, seat visible)
const CHR_L  = (c) => [16, c*CR, 16, 32];   // left-facing
const CHR_R  = (c) => [64, c*CR, 16, 32];   // right-facing
const ARM_F  = (c) => [96, c*CR, 32, 32];
const SOFA_F = (c) => [160, c*CR, 48, 32];
const TPLNT  = [0, 0, 32, 16];              // flower planter from S_PLT for table-top
const SH_S   = [0, 0, 32, 32];
const SH_M   = [32, 0, 32, 48];
const SH_W   = [96, 0, 64, 48];
const WIN_A  = [0, 0, 32, 32];
const WIN_B  = [64, 0, 32, 32];
const WIN_C  = [0, 192, 32, 32];
const WIN_D  = [64, 192, 32, 32];
const DOOR_B = [0, 0, 16, 32];
const DOOR_G = [0, 128, 16, 32];
const ART_1  = [0, 0, 16, 16];
const ART_2  = [16, 0, 16, 16];
const ART_3  = [32, 0, 16, 16];
const LMP    = [0, 0, 16, 32];
const LMP2   = [16, 0, 16, 32];
const DRW_1  = [0, 0, 32, 32];
const DRW_2  = [32, 0, 32, 32];
const BAREL  = [0, 176, 16, 16];
const CRATE  = [16, 176, 16, 16];
const POT_1  = [0, 48, 16, 32];
const POT_2  = [32, 48, 16, 32];

/* ─── item constructors ─── */
function FI(n,s,sx,sy,sw,sh,x,y){return{n,s,sx,sy,sw,sh,x,y,z:'f'};}
function WI(n,s,sx,sy,sw,sh,x,y){return{n,s,sx,sy,sw,sh,x,y,z:'w'};}
function AN(n,s,fw,fh,fc,x,y,z='f'){return{n,s,fw,fh,fc,x,y,z,anim:true};}

/* ─── building configs ─── */
const CFG = {
  house:           {b:[8,5],  g:[1,1],wH:3,wp:['brick','brick','stone'], fp:[0,1,4]},
  large_house:     {b:[12,7], g:[1,1],wH:4,wp:['brick','stone','stone'], fp:[0,4,5]},
  farm:            {b:[8,5],  g:[1,1],wH:3,wp:['wood','wood','brick'],   fp:[4,4,0]},
  fishing_hut:     {b:[7,4],  g:[1,1],wH:3,wp:['wood','wood','wood'],    fp:[4,4,1]},
  bakery:          {b:[8,5],  g:[1,1],wH:3,wp:['brick','brick','stone'], fp:[0,7,7]},
  woodcutters_hut: {b:[6,4],  g:[1,1],wH:3,wp:['wood','wood','wood'],    fp:[4,5,5]},
  stone_pit:       {b:[6,4],  g:[1,1],wH:3,wp:['stone','stone','stone'], fp:[11,11,11]},
  lumberyard:      {b:[8,5],  g:[1,1],wH:3,wp:['wood','wood','brick'],   fp:[4,5,0]},
  quarry:          {b:[8,5],  g:[1,1],wH:3,wp:['stone','stone','stone'], fp:[11,11,11]},
  weaving_hut:     {b:[8,5],  g:[1,1],wH:3,wp:['brick','brick','stone'], fp:[7,0,4]},
  market:          {b:[8,5],  g:[1,1],wH:3,wp:['brick','brick','stone'], fp:[0,0,4]},
  trading_post:    {b:[8,5],  g:[1,1],wH:3,wp:['wood','brick','stone'],  fp:[0,1,4]},
  storehouse:      {b:[8,5],  g:[1,1],wH:3,wp:['wood','wood','brick'],   fp:[4,5,0]},
  warehouse:       {b:[10,6], g:[1,1],wH:3,wp:['brick','brick','stone'], fp:[4,5,0]},
  town_hall:       {b:[12,8], g:[1,1],wH:4,wp:['stone','stone','stone'], fp:[6,6,11]},
  shrine:          {b:[8,5],  g:[1,1],wH:3,wp:['stone','stone','stone'], fp:[6,11,11]},
  watchtower:      {b:[6,4],  g:[1,1],wH:3,wp:['stone','stone','stone'], fp:[11,11,11]},
  tavern:          {b:[8,5],  g:[1,1],wH:3,wp:['brick','brick','wood'],  fp:[0,1,5]},
};

/* ─── bed color per level: 0=blue 1=teal 2=brown 3=red 4=green 5=yellow ─── */
const BLC = [0, 2, 3];

/* ═══ ITEM GENERATORS ═══ */

function genHouse(c, f, wH, lv) {
  const it = [], m = c >> 1, bc = BLC[lv-1];
  // Wall
  it.push(WI('Window', S_WIN, ...WIN_A, m-1, 0.5));
  if (lv>=2) it.push(WI('Painting', S_ART, ...ART_1, 1, 1));
  if (lv>=3) it.push(WI('Painting', S_ART, ...ART_2, c-2, 1));
  // Beds against back wall
  it.push(FI('Bed', S_BED, ...BED(bc), 0, 0));
  it.push(FI('Bed', S_BED, ...BED(bc), c-2, 0));
  // Desk against wall (lv2+, replaces L-cabinet)
  if (lv>=2) it.push(FI('Desk', S_TBL, ...TBL_L, 2, -1));
  // Table in center + plant on top
  it.push(FI('Table', S_TBL, ...TBL_S, m-1, 1));
  it.push(FI('Plant', S_PLT, ...TPLNT, m-1, 2.5));
  // Chairs around table (no backs-to-south)
  it.push(FI('Chair', S_CHR, ...CHR_R(0), m-2, 1.5));   // right-facing, left of table
  it.push(FI('Chair', S_CHR, ...CHR_L(0), m+1, 1.5));   // left-facing, right of table
  it.push(FI('Chair', S_CHR, ...CHR_F(0), m-1, 3));      // south-facing, below table
  // Lamp
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=3) it.push(FI('Bookshelf', S_SHF, ...SH_M, c-2, f-3));
  return it;
}

function genLargeHouse(c, f, wH, lv) {
  const it = [], m = c >> 1, bc = BLC[lv-1];
  it.push(WI('Window', S_WIN, ...WIN_B, 2, 1));
  it.push(WI('Window', S_WIN, ...WIN_B, c-4, 1));
  it.push(WI('Door', S_DOOR, ...DOOR_B, m, 1));
  if (lv>=2) { it.push(WI('Window', S_WIN, ...WIN_A, 0, 1)); it.push(WI('Window', S_WIN, ...WIN_A, c-2, 1)); }
  if (lv>=3) it.push(WI('Painting', S_ART, ...ART_3, m-2, 1));
  it.push(FI('Bed', S_BED, ...BED(bc), 0, 0));
  it.push(FI('Bed', S_BED, ...BED(bc), c-2, 0));
  it.push(FI('Bed', S_BED, ...BED(bc), 0, 2));
  it.push(FI('Bed', S_BED, ...BED(bc), c-2, 2));
  it.push(FI('Bookshelf', S_SHF, ...SH_M, m-1, 0));
  it.push(FI('Table', S_TBL, ...TBL_L, m-1, 4));
  it.push(FI('Lamp', S_LAMP, ...LMP, 2, f-2));
  it.push(FI('Lamp', S_LAMP, ...LMP2, c-3, f-2));
  if (lv>=2) it.push(FI('Sofa', S_CHR, ...SOFA_F(0), 0, f-2));
  if (lv>=3) it.push(FI('Sofa', S_CHR, ...SOFA_F(0), c-3, f-2));
  return it;
}

function genFarm(c, f, wH, lv) {
  const it = [], m = c >> 1;
  // Wall
  it.push(WI('Window', S_WIN, ...WIN_C, m-1, 0.5));
  // Desk against back wall (straight edge flush with wall)
  it.push(FI('Desk', S_TBL, ...TBL_L, c-3, -1));
  // Barrels pressed against back wall
  it.push(FI('Barrel', S_DECO, ...BAREL, 0, -0.5));
  it.push(FI('Barrel', S_DECO, ...BAREL, 1, -0.5));
  if (lv>=3) it.push(FI('Barrel', S_DECO, ...BAREL, 2, -0.5));
  // Table in center + supplies on it
  it.push(FI('Table', S_TBL, ...TBL_S, m-1, 2));
  it.push(FI('Supplies', S_DECO, ...CRATE, m-0.5, 3.5));
  // Chairs around table
  it.push(FI('Chair', S_CHR, ...CHR_R(0), m-2, 2.5));   // right-facing, left of table
  it.push(FI('Chair', S_CHR, ...CHR_L(0), m+1, 2.5));   // left-facing, right of table
  if (lv>=2) it.push(FI('Chair', S_CHR, ...CHR_F(0), m-1, 4)); // south-facing, below table
  // Flower pots
  it.push(FI('Flower Pot', S_PLT, ...POT_1, 0, f-2));
  if (lv>=2) it.push(FI('Flower Pot', S_PLT, ...POT_2, c-1, f-2));
  // Lamp
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=3) it.push(AN('Chest', S_CHST, 16, 16, 6, m, f-1));
  return it;
}

function genFishingHut(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_C, m-1, 0.5));
  it.push(FI('Table', S_TBL, ...TBL_S, 0, 0));
  it.push(FI('Barrel', S_DECO, ...BAREL, c-1, 0));
  it.push(FI('Barrel', S_DECO, ...BAREL, c-2, 0));
  it.push(FI('Plant', S_PLT, ...POT_1, 0, f-2));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Drawer', S_DRW, ...DRW_2, m, 0));
  if (lv>=3) it.push(FI('Crate', S_DECO, ...CRATE, m+2, f-1));
  return it;
}

function genBakery(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_A, m-1, 0.5));
  if (lv>=3) it.push(WI('Painting', S_ART, ...ART_1, c-2, 1));
  it.push(AN('Furnace', S_FURN, 16, 32, 5, 0, 0));
  it.push(FI('Prep Table', S_TBL, ...TBL_L, 3, 0));
  it.push(FI('Counter', S_TBL, ...TBL_S, m, f-2));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, c-2, 0));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Barrel', S_DECO, ...BAREL, c-1, 1));
  if (lv>=3) it.push(FI('Shelf', S_SHF, ...SH_S, 0, f-2));
  return it;
}

function genWoodcuttersHut(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_C, m-1, 0.5));
  it.push(AN('Anvil', S_ANVL, 16, 16, 8, 0, 0));
  it.push(FI('Table', S_TBL, ...TBL_S, c-2, 0));
  it.push(FI('Barrel', S_DECO, ...BAREL, 0, 1));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Drawer', S_DRW, ...DRW_1, m-1, f-2));
  if (lv>=3) it.push(FI('Crate', S_DECO, ...CRATE, 0, f-1));
  return it;
}

function genStonePit(c, f, wH, lv) {
  const it = [], m = c >> 1;
  if (lv>=2) it.push(WI('Window', S_WIN, ...WIN_D, m-1, 0.5));
  it.push(FI('Table', S_TBL, ...TBL_S, 0, 0));
  it.push(FI('Barrel', S_DECO, ...BAREL, c-1, 0));
  it.push(FI('Crate', S_DECO, ...CRATE, c-2, 0));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Barrel', S_DECO, ...BAREL, 0, f-1));
  if (lv>=3) it.push(FI('Drawer', S_DRW, ...DRW_2, m-1, f-2));
  return it;
}

function genLumberyard(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_C, m-1, 0.5));
  if (lv>=3) it.push(WI('Window', S_WIN, ...WIN_C, 1, 0.5));
  it.push(AN('Anvil', S_ANVL, 16, 16, 8, 0, 0));
  it.push(FI('Work Table', S_TBL, ...TBL_L, 2, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, c-2, 0));
  it.push(FI('Barrel', S_DECO, ...BAREL, c-1, 2));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Crate', S_DECO, ...CRATE, 0, f-1));
  if (lv>=3) it.push(FI('Barrel', S_DECO, ...BAREL, 1, f-1));
  return it;
}

function genQuarry(c, f, wH, lv) {
  const it = [], m = c >> 1;
  if (lv>=2) it.push(WI('Window', S_WIN, ...WIN_D, m-1, 0.5));
  it.push(FI('Work Table', S_TBL, ...TBL_L, 0, 0));
  it.push(FI('Table', S_TBL, ...TBL_S, c-2, 0));
  it.push(FI('Barrel', S_DECO, ...BAREL, m, f-1));
  it.push(FI('Crate', S_DECO, ...CRATE, m+1, f-1));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Drawer', S_DRW, ...DRW_2, c-2, f-2));
  if (lv>=3) it.push(AN('Chest', S_CHST, 16, 16, 6, 0, f-1));
  return it;
}

function genWeavingHut(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_A, m-1, 0.5));
  if (lv>=2) it.push(WI('Painting', S_ART, ...ART_2, 1, 1));
  it.push(FI('Loom', S_TBL, ...TBL_L, 0, 0));
  it.push(FI('Loom', S_TBL, ...TBL_L, c-3, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, m-1, f-2));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Plant', S_PLT, ...POT_1, 0, f-2));
  if (lv>=3) it.push(FI('Sofa', S_CHR, ...SOFA_F(5), 0, f-2));
  return it;
}

function genMarket(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_A, m-1, 0.5));
  if (lv>=2) it.push(WI('Window', S_WIN, ...WIN_B, 1, 0.5));
  if (lv>=3) it.push(WI('Painting', S_ART, ...ART_3, c-2, 1));
  it.push(FI('Counter', S_TBL, ...TBL_L, 0, 0));
  it.push(FI('Display', S_SHF, ...SH_S, c-2, 0));
  it.push(FI('Display', S_SHF, ...SH_S, c-2, 2));
  it.push(FI('Counter', S_TBL, ...TBL_S, m-1, f-2));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Barrel', S_DECO, ...BAREL, 0, f-1));
  if (lv>=3) it.push(FI('Crate', S_DECO, ...CRATE, 1, f-1));
  return it;
}

function genTradingPost(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_B, m-1, 0.5));
  if (lv>=3) it.push(WI('Window', S_WIN, ...WIN_A, 1, 0.5));
  it.push(FI('Desk', S_TBL, ...TBL_L, m-1, 1));
  it.push(FI('Bookshelf', S_SHF, ...SH_M, 0, 0));
  it.push(FI('Bookshelf', S_SHF, ...SH_M, c-2, 0));
  it.push(FI('Lamp', S_LAMP, ...LMP, 2, f-2));
  if (lv>=2) it.push(AN('Chest', S_CHST, 16, 16, 6, m, f-1));
  if (lv>=3) it.push(FI('Chair', S_CHR, ...ARM_F(0), m+2, 2));
  return it;
}

function genStorehouse(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_C, m-1, 0.5));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, 0, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_2, 2, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, c-2, 0));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  it.push(AN('Chest', S_CHST, 16, 16, 6, m, f-1));
  if (lv>=2) it.push(FI('Cabinet', S_DRW, ...DRW_2, m, 0));
  if (lv>=3) { it.push(FI('Barrel', S_DECO, ...BAREL, 0, f-1)); it.push(FI('Barrel', S_DECO, ...BAREL, c-1, f-1)); }
  return it;
}

function genWarehouse(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_C, m-1, 0.5));
  if (lv>=3) it.push(WI('Window', S_WIN, ...WIN_D, 1, 0.5));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, 0, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_2, 2, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, 4, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_2, c-2, 0));
  it.push(FI('Barrel', S_DECO, ...BAREL, m, f-1));
  it.push(FI('Barrel', S_DECO, ...BAREL, m+1, f-1));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(AN('Chest', S_CHST, 16, 16, 6, m-1, f-1));
  if (lv>=3) it.push(AN('Chest', S_GCHST, 16, 16, 6, m+2, f-1));
  return it;
}

function genTownHall(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_B, 2, 1));
  it.push(WI('Window', S_WIN, ...WIN_B, c-4, 1));
  if (lv>=2) { it.push(WI('Window', S_WIN, ...WIN_A, 0, 1)); it.push(WI('Window', S_WIN, ...WIN_A, c-2, 1)); }
  if (lv>=3) it.push(WI('Painting', S_ART, ...ART_3, m-1, 1));
  it.push(FI('Bookshelf', S_SHF, ...SH_M, 0, 0));
  it.push(FI('Bookshelf', S_SHF, ...SH_M, c-2, 0));
  it.push(FI('Table', S_TBL, ...TBL_L, m-2, 2));
  it.push(FI('Table', S_TBL, ...TBL_L, m+1, 2));
  it.push(FI('Chair', S_CHR, ...ARM_F(2), m-1, 4));
  it.push(FI('Chair', S_CHR, ...ARM_F(2), m+1, 4));
  it.push(FI('Lamp', S_LAMP, ...LMP, 2, f-2));
  it.push(FI('Lamp', S_LAMP, ...LMP2, c-3, f-2));
  if (lv>=2) it.push(FI('Sofa', S_CHR, ...SOFA_F(2), 0, f-2));
  if (lv>=3) it.push(FI('Sofa', S_CHR, ...SOFA_F(2), c-3, f-2));
  return it;
}

function genShrine(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_B, m-1, 0.5));
  if (lv>=2) it.push(WI('Painting', S_ART, ...ART_1, 1, 1));
  if (lv>=3) it.push(WI('Painting', S_ART, ...ART_2, c-2, 1));
  it.push(FI('Bookshelf', S_SHF, ...SH_M, 0, 0));
  it.push(FI('Bookshelf', S_SHF, ...SH_M, c-2, 0));
  it.push(AN('Golden Chest', S_GCHST, 16, 16, 6, m, 2));
  it.push(FI('Plant', S_PLT, ...POT_1, 0, f-2));
  it.push(FI('Plant', S_PLT, ...POT_2, c-1, f-2));
  it.push(FI('Lamp', S_LAMP, ...LMP, 2, f-2));
  if (lv>=3) it.push(FI('Lamp', S_LAMP, ...LMP2, c-3, f-2));
  return it;
}

function genWatchtower(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_D, m-1, 0.5));
  it.push(FI('Table', S_TBL, ...TBL_S, 0, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, c-2, 0));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Barrel', S_DECO, ...BAREL, 0, f-1));
  if (lv>=3) it.push(FI('Crate', S_DECO, ...CRATE, 1, f-1));
  return it;
}

function genTavern(c, f, wH, lv) {
  const it = [], m = c >> 1;
  it.push(WI('Window', S_WIN, ...WIN_C, m-1, 0.5));
  if (lv>=2) it.push(WI('Window', S_WIN, ...WIN_D, 1, 0.5));
  it.push(FI('Bar Counter', S_TBL, ...TBL_L, 0, 0));
  it.push(FI('Cabinet', S_DRW, ...DRW_1, c-2, 0));
  it.push(FI('Dining Table', S_TBL, ...TBL_S, 0, f-2));
  it.push(FI('Dining Table', S_TBL, ...TBL_S, m, f-2));
  it.push(FI('Chair', S_CHR, ...CHR_F(0), 2, f-2));
  it.push(FI('Lamp', S_LAMP, ...LMP, c-1, f-2));
  if (lv>=2) it.push(FI('Barrel', S_DECO, ...BAREL, c-1, 1));
  if (lv>=3) it.push(FI('Dining Table', S_TBL, ...TBL_S, c-2, f-2));
  return it;
}

const GENS = {
  house: genHouse, large_house: genLargeHouse, farm: genFarm,
  fishing_hut: genFishingHut, bakery: genBakery, woodcutters_hut: genWoodcuttersHut,
  stone_pit: genStonePit, lumberyard: genLumberyard, quarry: genQuarry,
  weaving_hut: genWeavingHut, market: genMarket, trading_post: genTradingPost,
  storehouse: genStorehouse, warehouse: genWarehouse, town_hall: genTownHall,
  shrine: genShrine, watchtower: genWatchtower, tavern: genTavern,
};

/* ═══ build room ═══ */
function buildRoom(type, level) {
  const cfg = CFG[type] || CFG.house;
  const lv = Math.min(3, Math.max(1, level || 1));
  const li = lv - 1;
  const cols = cfg.b[0] + cfg.g[0] * li;
  const fRows = cfg.b[1] + cfg.g[1] * li;
  const wH = cfg.wH;
  const gen = GENS[type] || GENS.house;
  return { cols, wH, fRows, wallPat: cfg.wp[li], floorIdx: cfg.fp[li], items: gen(cols, fRows, wH, lv) };
}

/* ═══ render helpers ═══ */
function renderItem(ctx, it, ox, oy, sc, time) {
  const dx = ox + it.x * T * sc;
  const dy = oy + it.y * T * sc;
  if (it.anim) {
    const e = ld(it.s);
    if (!e?.ok) return;
    const fi = Math.floor(time / 220) % it.fc;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(e.img, fi * it.fw, 0, it.fw, it.fh, dx, dy, Math.round(it.fw * sc), Math.round(it.fh * sc));
  } else {
    const e = ld(it.s);
    if (!e?.ok) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(e.img, it.sx, it.sy, it.sw, it.sh, dx, dy, Math.round(it.sw * sc), Math.round(it.sh * sc));
  }
}

function renderRoom(ctx, room, sc, cw, ch, time) {
  const { cols, wH, fRows, wallPat, floorIdx, items } = room;
  const ts = T * sc;
  const roomW = cols * ts;
  const wallH = wH * ts;
  const floorH = fRows * ts;
  const roomH = wallH + floorH;
  const trimSz = Math.max(2, Math.round(ts * 0.25));

  const ox = Math.round((cw - roomW) / 2);
  const oy = Math.round((ch - roomH) / 2);
  const fOy = oy + wallH;

  /* 1. dark bg */
  ctx.fillStyle = '#080612';
  ctx.fillRect(0, 0, cw, ch);

  /* 2. back wall */
  const wp = WP[wallPat];
  if (wp) fillPat(ctx, wp.src, wp.x, wp.y, wp.w, wp.h, ox, oy, roomW, wallH, sc);

  /* 3. ceiling shadow */
  const cg = ctx.createLinearGradient(ox, oy, ox, oy + ts * 1.2);
  cg.addColorStop(0, 'rgba(8,6,18,0.55)');
  cg.addColorStop(1, 'rgba(8,6,18,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(ox, oy, roomW, ts * 1.2);

  /* 4. wall items */
  for (const it of items) if (it.z === 'w') renderItem(ctx, it, ox, oy, sc, time);

  /* 5. floor */
  const fp = FP[floorIdx] || FP[0];
  fillPat(ctx, S_FLOOR, fp[0], fp[1], 32, 32, ox, fOy, roomW, floorH, sc);

  /* 6. wall-floor shadow */
  const sg = ctx.createLinearGradient(ox, fOy, ox, fOy + ts * 1.2);
  sg.addColorStop(0, 'rgba(0,0,0,0.22)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(ox, fOy, roomW, ts * 1.2);

  /* 7. thin wood trim (left, right, bottom) */
  ctx.fillStyle = '#7a5a30';
  ctx.fillRect(ox - trimSz, oy, trimSz, roomH + trimSz);
  ctx.fillRect(ox + roomW, oy, trimSz, roomH + trimSz);
  ctx.fillRect(ox - trimSz, oy + roomH, roomW + 2 * trimSz, trimSz);
  ctx.fillStyle = '#a08060';
  ctx.fillRect(ox - 1, oy, 1, roomH);
  ctx.fillRect(ox + roomW, oy, 1, roomH);
  ctx.fillRect(ox, oy + roomH, roomW, 1);

  /* 8. floor items (depth sorted) */
  const fi = items.filter(i => i.z === 'f');
  fi.sort((a, b) => {
    const ah = a.y + (a.anim ? a.fh / T : a.sh / T);
    const bh = b.y + (b.anim ? b.fh / T : b.sh / T);
    return ah - bh;
  });
  for (const it of fi) renderItem(ctx, it, ox, fOy, sc, time);

  /* 9. frame */
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - trimSz - 1, oy - 1, roomW + trimSz * 2 + 2, roomH + trimSz + 2);
}

function computeHits(room, sc, cw, ch) {
  const ts = T * sc;
  const roomW = room.cols * ts;
  const wallH = room.wH * ts;
  const roomH = wallH + room.fRows * ts;
  const ox = Math.round((cw - roomW) / 2);
  const oy = Math.round((ch - roomH) / 2);
  const fOy = oy + wallH;
  return room.items.map(it => {
    const bx = ox, by = it.z === 'w' ? oy : fOy;
    const dx = bx + it.x * ts;
    const dy = by + it.y * ts;
    const w = it.anim ? Math.round(it.fw * sc) : Math.round(it.sw * sc);
    const h = it.anim ? Math.round(it.fh * sc) : Math.round(it.sh * sc);
    return { name: it.n, x: dx, y: dy, w, h };
  });
}

/* ═══ component ═══ */
export default function PetWorldInterior({ building, buildingDef, world, onExit }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animRef = useRef(0);
  const hitsRef = useRef([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState(null);

  const buildingType = building?.type || building?.building_type || 'house';
  const ui = getBuildingUi(buildingType);
  const level = building?.level || 1;
  const room = useMemo(() => buildRoom(buildingType, level), [buildingType, level]);

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

  const sc = useMemo(() => {
    if (!size.width || !size.height) return 3;
    const totalRows = room.wH + room.fRows;
    const sx = (size.width * 0.90) / (room.cols * T);
    const sy = (size.height * 0.85) / (totalRows * T);
    return Math.max(1, Math.floor(Math.min(sx, sy)));
  }, [size, room]);

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
    hitsRef.current = computeHits(room, sc, size.width, size.height);
    const tick = () => {
      renderRoom(ctx, room, sc, size.width, size.height, performance.now());
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, room, sc]);

  useEffect(() => {
    Object.values(WP).forEach(p => ld(p.src));
    ld(S_FLOOR); ld(S_WOOD);
    const sheets = new Set();
    for (const it of room.items) if (it.s) sheets.add(it.s);
    sheets.forEach(s => ld(s));
  }, [room]);

  const handleTap = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const cy = (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;
    const hits = hitsRef.current;
    for (let i = hits.length - 1; i >= 0; i--) {
      const b = hits[i];
      if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
        setTooltip({ name: b.name, x: cx, y: b.y });
        return;
      }
    }
    setTooltip(null);
  }, []);

  useEffect(() => {
    if (!tooltip) return;
    const t = setTimeout(() => setTooltip(null), 2500);
    return () => clearTimeout(t);
  }, [tooltip]);

  const label = getBuildingLabel(building);
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
      <div
        className="cf-panel-dark flex items-center gap-3 px-3"
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top))', paddingBottom: 6, borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
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
        <button type="button" onClick={onExit} className="cf-btn cf-btn-brown shrink-0 px-3 py-1.5 text-[11px] font-semibold">
          Leave
        </button>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ imageRendering: 'pixelated', touchAction: 'none' }}
          onClick={handleTap}
        />
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10"
            style={{ left: tooltip.x, top: Math.max(4, tooltip.y - 30), transform: 'translateX(-50%)' }}
          >
            <div
              className="px-2.5 py-1 text-[10px] font-bold whitespace-nowrap rounded-md shadow-lg"
              style={{ background: 'rgba(20,16,32,0.92)', color: '#e8dcc8', border: '1px solid rgba(200,168,98,0.5)' }}
            >
              {tooltip.name}
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] cf-text-muted opacity-50 pointer-events-none select-none">
          Tap objects to inspect
        </div>
      </div>

      <div
        className="cf-panel-dark px-3 py-2"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))', borderRadius: 0, borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }}
      >
        <div className="flex items-center gap-3 text-[10px]">
          <div className="min-w-0 flex-1">
            {stats.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {stats.map((s) => <span key={s} className="cf-text-muted whitespace-nowrap">{s}</span>)}
              </div>
            ) : (
              <span className="cf-text-muted">{buildingDef?.description || 'A building in your village.'}</span>
            )}
          </div>
          <button
            type="button" onClick={onExit}
            className="cf-btn shrink-0 px-2.5 py-1 text-[9px]"
            style={{ background: 'linear-gradient(180deg, rgba(139,94,43,0.15) 0%, rgba(139,94,43,0.08) 100%)', borderColor: 'rgba(139,94,43,0.35)', color: '#6a4a2a' }}
          >
            Back to village
          </button>
        </div>
      </div>
    </div>
  );
}

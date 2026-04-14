import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getBuildingUi, getBuildingLabel } from './petWorldBuildings';
import './petWorldCfUi.css';

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
function draw(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
  const entry = getImage(src);
  if (!entry?.loaded) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(entry.image, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
  return true;
}

/* ═══ Spritesheet paths ═══ */
const ST = 16;
const M  = '/pet-world/interior/Fantasy%20RPG%20Interior%20Pack%20(16x16%20grid).png';
const XW = '/pet-world/interior/Expansion_Workshop.png';
const XA = '/pet-world/interior/Expansion_AlchemyLab.png';
const XB = '/pet-world/interior/Expansion_Bedroom.png';
const XM = '/pet-world/interior/Expansion_Music.png';
const XF = '/pet-world/interior/Expansion_ClockworkFactory.png';
const XS = '/pet-world/interior/Expansion_School.png';

const AF = '/pet-world/interior/animated/Fireplace.png';
const AC = '/pet-world/interior/animated/Candle.png';
const AU = '/pet-world/interior/animated/Furnace.png';
const AQ = '/pet-world/interior/animated/Cauldron%20(purple).png';
const AK = '/pet-world/interior/animated/CandelabrumStand.png';
const AT = '/pet-world/interior/animated/TorchFront.png';
const AL = '/pet-world/interior/animated/Lamp.png';
const AG = '/pet-world/interior/animated/Gramophone.png';

/* ═══ Drawing helpers ═══ */
function til(ctx, c, r, dx, dy, ts) {
  return draw(ctx, M, c * ST, r * ST, ST, ST, dx, dy, ts, ts);
}
function spr(ctx, sheet, c, r, tw, th, dx, dy, ts) {
  return draw(ctx, sheet, c * ST, r * ST, tw * ST, th * ST, dx, dy, tw * ts, th * ts);
}

/* ═══ Wall palettes: [col, row] for 3×2 colored wall block ═══ */
const WP = {
  red: [15, 0], beige: [15, 2], blue: [18, 0], pink: [18, 2],
  orange: [21, 0], bright: [21, 2], brown: [24, 0], green: [24, 2],
  brick: [27, 0],
};

/* ═══ Named item constructors ═══ */
function I(name, s, c, r, tw, th, x, y) { return { name, s, c, r, tw, th, x, y }; }
function A(name, s, tw, th, frames, x, y) { return { name, s, tw, th, anim: frames, x, y }; }

/* ═══ Building room config ═══ */
const CFG = {
  house:           { base: [7, 5],  grow: [1, 1], walls: [WP.brown, WP.beige, WP.blue],   floors: [3, 0, 0] },
  large_house:     { base: [10, 7], grow: [1, 1], walls: [WP.beige, WP.blue, WP.green],    floors: [0, 0, 0] },
  farm:            { base: [7, 5],  grow: [1, 1], walls: [WP.brown, WP.brown, WP.orange],   floors: [3, 3, 0] },
  fishing_hut:     { base: [6, 4],  grow: [1, 1], walls: [WP.brown, WP.brown, WP.beige],    floors: [3, 3, 0] },
  bakery:          { base: [7, 5],  grow: [1, 1], walls: [WP.brick, WP.orange, WP.red],     floors: [0, 0, 0] },
  woodcutters_hut: { base: [5, 4],  grow: [1, 1], walls: [WP.brown, WP.brown, WP.beige],    floors: [3, 3, 0] },
  stone_pit:       { base: [5, 4],  grow: [1, 1], walls: [WP.brick, WP.brick, WP.brown],    floors: [3, 3, 3] },
  lumberyard:      { base: [7, 5],  grow: [1, 1], walls: [WP.brown, WP.brown, WP.orange],   floors: [3, 3, 0] },
  quarry:          { base: [7, 5],  grow: [1, 1], walls: [WP.brick, WP.brick, WP.brown],    floors: [3, 3, 3] },
  weaving_hut:     { base: [7, 5],  grow: [1, 1], walls: [WP.pink, WP.pink, WP.bright],     floors: [0, 0, 0] },
  market:          { base: [7, 5],  grow: [1, 1], walls: [WP.brick, WP.red, WP.orange],     floors: [0, 0, 0] },
  trading_post:    { base: [7, 5],  grow: [1, 1], walls: [WP.brown, WP.beige, WP.blue],     floors: [3, 0, 0] },
  storehouse:      { base: [7, 5],  grow: [1, 1], walls: [WP.brown, WP.brown, WP.beige],    floors: [3, 3, 0] },
  warehouse:       { base: [9, 6],  grow: [1, 1], walls: [WP.brick, WP.brick, WP.brown],    floors: [3, 3, 3] },
  town_hall:       { base: [10, 8], grow: [1, 1], walls: [WP.blue, WP.blue, WP.green],      floors: [0, 0, 0] },
  shrine:          { base: [7, 5],  grow: [1, 1], walls: [WP.green, WP.green, WP.blue],     floors: [3, 0, 0] },
  watchtower:      { base: [5, 4],  grow: [1, 1], walls: [WP.brown, WP.brown, WP.brick],    floors: [3, 3, 3] },
  tavern:          { base: [7, 5],  grow: [1, 1], walls: [WP.brick, WP.brick, WP.brown],    floors: [0, 0, 0] },
};

/* ═══ Item generators per building type ═══ */

function genHouse(w, h, lv) {
  const it = [];
  const br = [23, 25, 27][lv - 1];
  // 2 beds against back wall
  it.push(I('Bed', M, 0, br, 3, 2, 0, 0));
  it.push(I('Bed', M, 6, br, 3, 2, w - 3, 0));
  // Candle between beds (lv1) or fireplace (lv2+)
  if (lv === 1) {
    it.push(A('Candle', AC, 1, 1, 4, 3, 0));
  } else {
    it.push(A('Fireplace', AF, 2, 4, 4, Math.floor(w / 2) - 1, -2));
  }
  // Table center
  it.push(I('Table', M, [6, 10, 0][lv - 1], 12, 2, 3, Math.floor(w / 2) - 1, 2));
  // Cabinet right side (lv2+)
  if (lv >= 2) it.push(I('Cabinet', M, [0, 4, 0][lv - 1], 15, 2, 4, w - 2, 2));
  // Sofa front-left (lv2+)
  if (lv >= 2) it.push(I('Sofa', M, [0, 0, 3][lv - 1], 29, 3, 3, 0, h - 3));
  // Lighting
  if (lv === 1) it.push(A('Lamp', AL, 1, 1, 4, w - 1, 2));
  else if (lv === 2) it.push(A('Lamp', AL, 1, 1, 4, 3, 2));
  else { it.push(A('Candelabrum', AK, 1, 2, 4, 0, 2)); it.push(A('Lamp', AL, 1, 1, 4, 5, 2)); }
  return it;
}

function genLargeHouse(w, h, lv) {
  const it = [];
  const br = [23, 25, 27][lv - 1];
  // 4 beds: 2 back wall, 2 second row
  it.push(I('Bed', M, 0, br, 3, 2, 0, 0));
  it.push(I('Bed', M, 3, br, 3, 2, w - 3, 0));
  it.push(I('Bed', M, 6, br, 3, 2, 0, 2));
  it.push(I('Bed', M, 9, br, 3, 2, w - 3, 2));
  // Bookshelves between beds
  const sx = Math.floor(w / 2) - 1;
  it.push(I('Bookshelf', M, 16, 20, 1, 3, sx, 0));
  it.push(I('Bookshelf', M, 17, 20, 1, 3, sx + 1, 0));
  // Fireplace (lv2+)
  if (lv >= 2) it.push(A('Fireplace', AF, 2, 4, 4, sx, -2));
  // Table lower area
  it.push(I('Table', M, [8, 10, 0][lv - 1], 12, 2, 3, sx, 4));
  // Sofas front
  if (lv >= 2) it.push(I('Sofa', M, 3, 29, 3, 3, 0, h - 3));
  if (lv === 3) it.push(I('Sofa', M, 3, 29, 3, 3, w - 3, h - 3));
  // Cabinet (lv2+)
  if (lv >= 2) it.push(I('Cabinet', M, 6, 15, 2, 4, w - 2, 4));
  if (lv === 3) it.push(I('Cushioned Chair', M, 12, 15, 2, 4, 0, 4));
  // Lighting
  if (lv === 1) {
    it.push(A('Candle', AC, 1, 1, 4, 3, 2));
    it.push(A('Candle', AC, 1, 1, 4, w - 4, 2));
  } else {
    it.push(A('Candelabrum', AK, 1, 2, 4, 3, 2));
    it.push(A('Candelabrum', AK, 1, 2, 4, w - 4, 2));
  }
  return it;
}

function genFarm(w, h, lv) {
  const it = [];
  it.push(I('Workshop Table', XW, 0, 8, 3, 3, 0, 0));
  it.push(I('Table', M, [6, 10, 0][lv - 1], 12, 2, 3, w - 2, 0));
  it.push(I('Cabinet', M, [4, 6, 8][lv - 1], 15, 2, 4, Math.floor(w / 2), 0));
  if (lv >= 2) it.push(I('Work Table', M, 4, 12, 2, 3, 0, h - 3));
  if (lv === 3) it.push(I('Storage', M, 2, 15, 2, 4, w - 2, h - 4));
  it.push(A('Lamp', AL, 1, 1, 4, w - 1, Math.floor(h / 2)));
  if (lv >= 3) it.push(A('Candle', AC, 1, 1, 4, 0, h - 1));
  return it;
}

function genFishingHut(w, h, lv) {
  const it = [];
  it.push(I('Table', M, [6, 10, 0][lv - 1], 12, 2, 3, 0, 0));
  it.push(I('Cabinet', M, [4, 6, 0][lv - 1], 15, 2, 4, w - 2, 0));
  if (lv >= 2) it.push(I('Table', M, 8, 12, 2, 3, Math.floor(w / 2) - 1, h - 3));
  if (lv === 3) it.push(I('Storage', M, 2, 15, 2, 4, 2, 0));
  it.push(A('Lamp', AL, 1, 1, 4, Math.floor(w / 2), 0));
  if (lv >= 3) it.push(A('Candle', AC, 1, 1, 4, w - 1, h - 1));
  return it;
}

function genBakery(w, h, lv) {
  const it = [];
  it.push(A('Furnace', AU, 2, 3, 4, 0, -1));
  it.push(I('Prep Table', M, [6, 2, 12][lv - 1], 12, 2, 3, 3, 0));
  it.push(I('Counter', M, [4, 6, 0][lv - 1], 12, 2, 3, Math.floor(w / 2), h - 3));
  it.push(I('Cabinet', M, [4, 6, 0][lv - 1], 15, 2, 4, w - 2, 0));
  if (lv >= 2) it.push(I('Storage', M, 8, 15, 2, 4, w - 2, h - 4));
  if (lv === 3) it.push(I('Display', M, 2, 15, 2, 4, 0, h - 4));
  it.push(A('Candle', AC, 1, 1, 4, Math.floor(w / 2) + 1, 0));
  if (lv >= 3) it.push(A('Lamp', AL, 1, 1, 4, w - 1, h - 1));
  return it;
}

function genWoodcuttersHut(w, h, lv) {
  const it = [];
  it.push(I('Workbench', XW, 0, 5, 3, 3, 0, 0));
  it.push(I('Table', M, [6, 10, 0][lv - 1], 12, 2, 3, w - 2, 0));
  if (lv >= 2) it.push(I('Cabinet', M, 4, 15, 2, 4, Math.floor(w / 2) - 1, h - 4));
  if (lv === 3) it.push(I('Tool Rack', M, 8, 15, 2, 4, w - 2, h - 4));
  it.push(A('Lamp', AL, 1, 1, 4, w - 1, 0));
  return it;
}

function genStonePit(w, h, lv) {
  const it = [];
  it.push(I('Table', M, [6, 8, 0][lv - 1], 12, 2, 3, 0, 0));
  it.push(I('Cabinet', M, [4, 2, 0][lv - 1], 15, 2, 4, w - 2, 0));
  if (lv >= 2) it.push(I('Workbench', XW, 0, 5, 3, 3, 0, h - 3));
  if (lv === 3) it.push(I('Tool Rack', M, 6, 15, 2, 4, w - 2, h - 4));
  it.push(A('Torch', AT, 1, 2, 4, Math.floor(w / 2), -1));
  return it;
}

function genLumberyard(w, h, lv) {
  const it = [];
  it.push(I('Workbench', XW, 0, 5, 3, 3, 0, 0));
  it.push(I('Workshop Table', XW, 0, 8, 3, 3, 0, h - 3));
  it.push(I('Table', M, [6, 10, 0][lv - 1], 12, 2, 3, 3, 0));
  it.push(I('Cabinet', M, [4, 6, 8][lv - 1], 15, 2, 4, w - 2, 0));
  if (lv >= 2) it.push(I('Storage', M, 2, 15, 2, 4, w - 2, h - 4));
  if (lv === 3) it.push(I('Workbench', XW, 0, 5, 3, 3, 3, h - 3));
  it.push(A('Lamp', AL, 1, 1, 4, Math.floor(w / 2), 0));
  if (lv >= 3) it.push(A('Lamp', AL, 1, 1, 4, w - 1, h - 1));
  return it;
}

function genQuarry(w, h, lv) {
  const it = [];
  it.push(I('Workshop Table', XW, 0, 8, 3, 3, 0, 0));
  it.push(I('Workbench', XW, 0, 5, 3, 3, w - 3, 0));
  it.push(I('Table', M, [6, 8, 0][lv - 1], 12, 2, 3, Math.floor(w / 2) - 1, h - 3));
  if (lv >= 2) it.push(I('Cabinet', M, 2, 15, 2, 4, w - 2, h - 4));
  if (lv === 3) it.push(I('Tool Rack', M, 4, 15, 2, 4, 0, h - 4));
  it.push(A('Torch', AT, 1, 2, 4, Math.floor(w / 2), -1));
  if (lv >= 3) it.push(A('Lamp', AL, 1, 1, 4, w - 1, 0));
  return it;
}

function genWeavingHut(w, h, lv) {
  const it = [];
  it.push(I('Loom', M, 16, 15, 2, 4, 0, 0));
  it.push(I('Loom', M, 14, 15, 2, 4, w - 2, 0));
  it.push(I('Table', M, [6, 0, 2][lv - 1], 12, 2, 3, Math.floor(w / 2) - 1, 1));
  if (lv >= 2) it.push(I('Sofa', M, 12, 29, 3, 3, 0, h - 3));
  if (lv === 3) {
    it.push(I('Cabinet', M, 0, 15, 2, 4, w - 2, h - 4));
    it.push(I('Sofa', M, 9, 29, 3, 3, Math.floor(w / 2) - 1, h - 3));
  }
  it.push(A('Candle', AC, 1, 1, 4, Math.floor(w / 2), 0));
  if (lv >= 3) it.push(A('Lamp', AL, 1, 1, 4, Math.floor(w / 2), h - 1));
  return it;
}

function genMarket(w, h, lv) {
  const it = [];
  it.push(I('Counter', M, [0, 2, 12][lv - 1], 12, 2, 3, 0, 0));
  it.push(I('Counter', M, [4, 6, 0][lv - 1], 12, 2, 3, 2, 0));
  it.push(I('Cabinet', M, [4, 0, 0][lv - 1], 15, 2, 4, w - 2, 0));
  it.push(I('Display', M, [6, 4, 2][lv - 1], 12, 2, 3, 0, h - 3));
  if (lv >= 2) it.push(I('Display', M, 8, 12, 2, 3, Math.floor(w / 2), h - 3));
  if (lv === 3) it.push(I('Display', M, 10, 12, 2, 3, w - 2, h - 3));
  it.push(A('Lamp', AL, 1, 1, 4, Math.floor(w / 2), 0));
  if (lv >= 3) it.push(A('Candle', AC, 1, 1, 4, w - 1, h - 1));
  return it;
}

function genTradingPost(w, h, lv) {
  const it = [];
  it.push(I('Desk', M, [6, 10, 0][lv - 1], 12, 2, 3, Math.floor(w / 2) - 1, 1));
  it.push(I('Bookshelf', M, 16, 20, 1, 3, 0, 0));
  it.push(I('Bookshelf', M, 17, 20, 1, 3, 1, 0));
  it.push(I('Bookshelf', M, 16, 20, 1, 3, w - 2, 0));
  it.push(I('Bookshelf', M, 17, 20, 1, 3, w - 1, 0));
  it.push(I('Cushioned Chair', M, 12, 15, 2, 4, w - 2, Math.floor(h / 2)));
  if (lv >= 2) it.push(I('Sofa', M, 6, 29, 3, 3, 0, h - 3));
  if (lv === 3) it.push(I('Sofa', M, 6, 29, 3, 3, w - 3, h - 3));
  it.push(A('Candelabrum', AK, 1, 2, 4, Math.floor(w / 2) + 1, 0));
  if (lv >= 3) it.push(A('Candelabrum', AK, 1, 2, 4, 2, h - 2));
  return it;
}

function genStorehouse(w, h, lv) {
  const it = [];
  it.push(I('Cabinet', M, 0, 15, 2, 4, 0, 0));
  it.push(I('Cabinet', M, 2, 15, 2, 4, 2, 0));
  it.push(I('Cabinet', M, 4, 15, 2, 4, w - 2, 0));
  it.push(I('Table', M, [6, 10, 0][lv - 1], 12, 2, 3, Math.floor(w / 2), h - 3));
  if (lv >= 2) it.push(I('Cabinet', M, 6, 15, 2, 4, Math.floor(w / 2), 0));
  if (lv === 3) {
    it.push(I('Cabinet', M, 8, 15, 2, 4, 0, h - 4));
    it.push(I('Cabinet', M, 0, 15, 2, 4, w - 2, h - 4));
  }
  it.push(A('Torch', AT, 1, 2, 4, w - 1, -1));
  if (lv >= 3) it.push(A('Lamp', AL, 1, 1, 4, 0, h - 1));
  return it;
}

function genWarehouse(w, h, lv) {
  const it = [];
  it.push(I('Cabinet', M, 0, 15, 2, 4, 0, 0));
  it.push(I('Cabinet', M, 2, 15, 2, 4, 2, 0));
  it.push(I('Cabinet', M, 4, 15, 2, 4, 4, 0));
  it.push(I('Cabinet', M, 6, 15, 2, 4, w - 2, 0));
  it.push(I('Table', M, [6, 10, 0][lv - 1], 12, 2, 3, Math.floor(w / 2), h - 3));
  it.push(I('Table', M, [8, 6, 2][lv - 1], 12, 2, 3, 0, h - 3));
  if (lv >= 2) it.push(I('Cabinet', M, 8, 15, 2, 4, Math.floor(w / 2), 0));
  if (lv === 3) {
    it.push(I('Cabinet', M, 0, 15, 2, 4, 0, h - 4));
    it.push(I('Cabinet', M, 2, 15, 2, 4, w - 2, h - 4));
  }
  it.push(A('Lamp', AL, 1, 1, 4, w - 1, Math.floor(h / 2)));
  if (lv >= 3) it.push(A('Torch', AT, 1, 2, 4, 0, -1));
  return it;
}

function genTownHall(w, h, lv) {
  const it = [];
  const mid = Math.floor(w / 2);
  // Bookshelves along back wall
  it.push(I('Bookshelf', M, 16, 20, 1, 3, 0, 0));
  it.push(I('Bookshelf', M, 17, 20, 1, 3, 1, 0));
  it.push(I('Bookshelf', M, 16, 20, 1, 3, w - 2, 0));
  it.push(I('Bookshelf', M, 17, 20, 1, 3, w - 1, 0));
  if (lv >= 2) {
    it.push(I('Bookshelf', M, 18, 20, 1, 3, 2, 0));
    it.push(I('Bookshelf', M, 19, 20, 1, 3, w - 3, 0));
  }
  // Conference tables
  it.push(I('Table', M, [0, 2, 0][lv - 1], 12, 2, 3, mid - 2, 1));
  it.push(I('Table', M, [2, 0, 2][lv - 1], 12, 2, 3, mid, 1));
  // Cushioned chairs
  it.push(I('Cushioned Chair', M, [14, 12, 12][lv - 1], 15, 2, 4, mid - 1, 4));
  if (lv === 3) {
    it.push(I('Cushioned Chair', M, 14, 15, 2, 4, 0, 4));
    it.push(I('Cushioned Chair', M, 12, 15, 2, 4, w - 2, 4));
  }
  // Sofas at front
  it.push(I('Sofa', M, 3, 29, 3, 3, 0, h - 3));
  it.push(I('Sofa', M, 3, 29, 3, 3, w - 3, h - 3));
  if (lv === 3) it.push(I('Sofa', M, 6, 29, 3, 3, mid - 1, h - 3));
  // Grand lighting
  it.push(A('Candelabrum', AK, 1, 2, 4, 2, 1));
  it.push(A('Candelabrum', AK, 1, 2, 4, w - 3, 1));
  if (lv >= 2) it.push(A('Candelabrum', AK, 1, 2, 4, mid, h - 2));
  if (lv === 3) {
    it.push(A('Candelabrum', AK, 1, 2, 4, 0, h - 2));
    it.push(A('Candelabrum', AK, 1, 2, 4, w - 1, h - 2));
  }
  return it;
}

function genShrine(w, h, lv) {
  const it = [];
  it.push(I('Alchemy Shelf', XA, 11, 0, 3, 3, 0, -1));
  it.push(I('Alchemy Shelf', XA, 11, 0, 3, 3, w - 3, -1));
  it.push(I('Altar', M, 12, 29, 3, 3, Math.floor(w / 2) - 1, h - 3));
  it.push(A('Cauldron', AQ, 1, 1, 4, Math.floor(w / 2), 1));
  if (lv >= 2) it.push(I('Bookshelf', M, 19, 20, 1, 3, 3, 0));
  if (lv === 3) it.push(I('Bookshelf', M, 18, 20, 1, 3, w - 4, 0));
  it.push(A('Candle', AC, 1, 1, 4, Math.floor(w / 2) - 1, 0));
  it.push(A('Candle', AC, 1, 1, 4, w - 1, 0));
  if (lv >= 2) it.push(A('Candle', AC, 1, 1, 4, 0, h - 1));
  if (lv >= 3) it.push(A('Candle', AC, 1, 1, 4, w - 1, h - 1));
  return it;
}

function genWatchtower(w, h, lv) {
  const it = [];
  it.push(I('Table', M, [6, 8, 0][lv - 1], 12, 2, 3, 0, 0));
  it.push(I('Cabinet', M, [2, 4, 0][lv - 1], 15, 2, 4, w - 2, 0));
  if (lv >= 2) it.push(I('Table', M, 10, 12, 2, 3, Math.floor(w / 2) - 1, h - 3));
  if (lv === 3) it.push(I('Bookshelf', M, 16, 20, 1, 3, 2, 0));
  it.push(A('Torch', AT, 1, 2, 4, Math.floor(w / 2), -1));
  if (lv >= 3) it.push(A('Torch', AT, 1, 2, 4, w - 1, -1));
  return it;
}

function genTavern(w, h, lv) {
  const it = [];
  it.push(I('Bar Counter', M, [0, 2, 0][lv - 1], 12, 2, 3, 0, 0));
  it.push(I('Bar Counter', M, [2, 0, 2][lv - 1], 12, 2, 3, 2, 0));
  it.push(A('Fireplace', AF, 2, 4, 4, w - 3, -2));
  it.push(I('Cabinet', M, [4, 6, 0][lv - 1], 15, 2, 4, w - 2, 0));
  it.push(I('Dining Table', M, [4, 6, 0][lv - 1], 12, 2, 3, 0, h - 3));
  it.push(I('Dining Table', M, [6, 8, 2][lv - 1], 12, 2, 3, Math.floor(w / 2), h - 3));
  if (lv === 3) it.push(I('Dining Table', M, 10, 12, 2, 3, w - 2, h - 3));
  it.push(A('Candle', AC, 1, 1, 4, Math.floor(w / 2), 0));
  if (lv >= 2) it.push(A('Lamp', AL, 1, 1, 4, 0, h - 1));
  if (lv >= 3) it.push(A('Candle', AC, 1, 1, 4, w - 1, h - 1));
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

/* ═══ Room builder ═══ */
function buildRoom(type, level) {
  const cfg = CFG[type] || CFG.house;
  const lv = Math.min(3, Math.max(1, level || 1));
  const li = lv - 1;
  const w = cfg.base[0] + cfg.grow[0] * li;
  const h = cfg.base[1] + cfg.grow[1] * li;
  const gen = GENS[type] || GENS.house;
  return { w, h, wall: cfg.walls[li], floor: cfg.floors[li], items: gen(w, h, lv) };
}

/* ═══ Layout geometry ═══ */
function layout(room, ts, cw, ch) {
  const fw = room.w, fh = room.h;
  const tw = fw + 2, th = fh + 3;
  const ox = Math.round((cw - tw * ts) / 2);
  const oy = Math.round((ch - th * ts) / 2);
  return { fw, fh, tw, th, ox, oy, fx: ox + ts, fy: oy + 3 * ts };
}

function hitBoxes(room, ts, cw, ch) {
  const { fx, fy } = layout(room, ts, cw, ch);
  return (room.items || []).map((item) => ({
    name: item.name,
    x: fx + item.x * ts, y: fy + item.y * ts,
    w: item.tw * ts, h: item.th * ts,
  }));
}

/* ═══ Room rendering ═══ */
function renderRoom(ctx, room, ts, cw, ch, time) {
  const { fw, fh, tw, th, ox, oy, fx, fy } = layout(room, ts, cw, ch);

  // 1. Background
  ctx.fillStyle = '#080612';
  ctx.fillRect(0, 0, cw, ch);

  // 2. Side walls
  for (let r = 0; r < th; r++) {
    til(ctx, 1, 4, ox, oy + r * ts, ts);
    til(ctx, 1, 4, ox + (tw - 1) * ts, oy + r * ts, ts);
  }

  // 3. Back wall (3 colored rows)
  const [wc, wr] = room.wall;
  for (let x = 0; x < fw; x++) {
    const c = x === 0 ? wc : x === fw - 1 ? wc + 2 : wc + 1;
    til(ctx, c, wr,     fx + x * ts, oy,          ts);
    til(ctx, c, wr + 1, fx + x * ts, oy + ts,     ts);
    til(ctx, c, wr,     fx + x * ts, oy + 2 * ts, ts);
  }

  // 4. Ceiling shadow
  const cg = ctx.createLinearGradient(fx, oy, fx, oy + ts * 1.4);
  cg.addColorStop(0, 'rgba(8,6,18,0.72)');
  cg.addColorStop(1, 'rgba(8,6,18,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(fx, oy, fw * ts, ts * 1.4);

  // 5. Floor
  const fr = room.floor;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const tc = x === 0 ? 6 : x === fw - 1 ? 8 : 7;
      const tr = y === 0 ? fr : y === fh - 1 ? fr + 2 : fr + 1;
      til(ctx, tc, tr, fx + x * ts, fy + y * ts, ts);
    }
  }

  // 6. Wall-to-floor shadow
  const sg = ctx.createLinearGradient(fx, fy, fx, fy + ts * 1.5);
  sg.addColorStop(0, 'rgba(0,0,0,0.16)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(fx, fy, fw * ts, ts * 1.5);

  // 7. Furniture (sorted by bottom edge for depth)
  const sorted = [...(room.items || [])].sort((a, b) => (a.y + a.th) - (b.y + b.th));
  for (const item of sorted) {
    const dx = fx + item.x * ts;
    const dy = fy + item.y * ts;
    if (item.anim) {
      const frameW = item.tw * ST;
      const fi = Math.floor(time / 200) % item.anim;
      draw(ctx, item.s, fi * frameW, 0, frameW, item.th * ST, dx, dy, item.tw * ts, item.th * ts);
    } else {
      spr(ctx, item.s, item.c, item.r, item.tw, item.th, dx, dy, ts);
    }
  }

  // 8. Frame
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, tw * ts, th * ts);
}

/* ═══ Component ═══ */
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

  /* Responsive resize */
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

  /* Tile scale (integer for crisp pixels) */
  const ts = useMemo(() => {
    if (!size.width || !size.height) return ST * 3;
    const tw = room.w + 2;
    const th = room.h + 3;
    const sx = (size.width * 0.92) / (tw * ST);
    const sy = (size.height * 0.88) / (th * ST);
    return ST * Math.max(1, Math.floor(Math.min(sx, sy)));
  }, [size, room]);

  /* Render loop */
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
    hitsRef.current = hitBoxes(room, ts, size.width, size.height);
    const tick = () => {
      renderRoom(ctx, room, ts, size.width, size.height, performance.now());
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, room, ts]);

  /* Preload sheets */
  useEffect(() => {
    getImage(M);
    const sheets = new Set();
    for (const item of room.items || []) if (item.s) sheets.add(item.s);
    sheets.forEach((s) => getImage(s));
  }, [room]);

  /* Click/tap handler for item labels */
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

  /* Auto-dismiss tooltip */
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
      {/* Header */}
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

      {/* Canvas */}
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

      {/* Info bar */}
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

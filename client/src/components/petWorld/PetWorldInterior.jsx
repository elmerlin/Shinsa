import React, { useCallback, useEffect, useRef, useState } from 'react';
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

function drawSrc(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh, alpha) {
  const entry = getImage(src);
  if (!entry?.loaded) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.drawImage(entry.image, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
  return true;
}

/* ═══ Asset paths ═══ */

const SHEET = '/pet-world/interior/Fantasy%20RPG%20Interior%20Pack%20(16x16%20grid).png';

/* ═══ Source tile size ═══ */

const ST = 16;

/* ═══ Color helpers ═══ */

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function darken(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

function lighten(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))},${Math.min(255, Math.round(g + (255 - g) * amount))},${Math.min(255, Math.round(b + (255 - b) * amount))})`;
}

/* ═══ Floor tile source positions in main spritesheet [sx, sy] ═══ */

const FLOOR_TILES = {
  wood_dark:  [2 * ST, 0],
  wood_med:   [3 * ST, 0],
  wood_light: [4 * ST, 0],
  stone:      [5 * ST, 0],
  tile_light: [6 * ST, 0],
  tile_warm:  [7 * ST, 0],
};

/* ═══ Room templates per building type ═══ */

/*
  Each template defines:
  - w, h: room size in tiles
  - floor: key into FLOOR_TILES (or fallback color)
  - items: array of furniture { t: type, x, y, w?, h?, color }
*/

const ROOM_TEMPLATES = {
  house: {
    w: 8, h: 7, floor: 'wood_med',
    items: [
      { t: 'bed', x: 1, y: 1, w: 2, h: 2, color: '#c85050' },
      { t: 'table', x: 5, y: 3, w: 2, h: 1, color: '#9a6a3a' },
      { t: 'chair', x: 4, y: 3, color: '#8a5a30' },
      { t: 'shelf', x: 6, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'candle', x: 5, y: 1, color: '#e8c040' },
      { t: 'rug', x: 3, y: 4, w: 3, h: 2, color: '#8a3838' },
      { t: 'fireplace', x: 3, y: 1, w: 2, h: 1, color: '#5a3a2a' },
    ],
  },
  large_house: {
    w: 10, h: 7, floor: 'wood_light',
    items: [
      { t: 'bed', x: 1, y: 1, w: 2, h: 2, color: '#5080c8' },
      { t: 'bed', x: 1, y: 4, w: 2, h: 2, color: '#c85050' },
      { t: 'fireplace', x: 4, y: 1, w: 2, h: 1, color: '#5a3a2a' },
      { t: 'table', x: 5, y: 3, w: 2, h: 1, color: '#9a6a3a' },
      { t: 'chair', x: 4, y: 3, color: '#8a5a30' },
      { t: 'chair', x: 7, y: 3, color: '#8a5a30' },
      { t: 'shelf', x: 8, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'rug', x: 4, y: 4, w: 4, h: 2, color: '#305080' },
      { t: 'candle', x: 7, y: 1, color: '#e8c040' },
    ],
  },
  farm: {
    w: 8, h: 7, floor: 'wood_dark',
    items: [
      { t: 'crate', x: 1, y: 1, color: '#8a6a3a' },
      { t: 'crate', x: 2, y: 1, color: '#7a5a2a' },
      { t: 'barrel', x: 1, y: 2, color: '#6a4a2a' },
      { t: 'table', x: 4, y: 2, w: 2, h: 1, color: '#9a6a3a' },
      { t: 'sack', x: 6, y: 1, color: '#c8b080' },
      { t: 'sack', x: 6, y: 2, color: '#b8a070' },
      { t: 'tool_rack', x: 1, y: 4, w: 1, h: 2, color: '#5a4a3a' },
      { t: 'hay', x: 5, y: 4, w: 2, h: 2, color: '#d8c060' },
    ],
  },
  fishing_hut: {
    w: 8, h: 5, floor: 'wood_dark',
    items: [
      { t: 'barrel', x: 1, y: 1, color: '#5a7a8a' },
      { t: 'barrel', x: 2, y: 1, color: '#4a6a7a' },
      { t: 'table', x: 4, y: 1, w: 2, h: 1, color: '#7a6a4a' },
      { t: 'crate', x: 6, y: 1, color: '#6a8a6a' },
      { t: 'net', x: 1, y: 3, w: 2, h: 1, color: '#a0b8c0' },
      { t: 'fish_rack', x: 5, y: 3, w: 2, h: 1, color: '#8a6a4a' },
    ],
  },
  woodcutters_hut: {
    w: 6, h: 5, floor: 'wood_dark',
    items: [
      { t: 'log_pile', x: 1, y: 1, w: 2, h: 1, color: '#8a6030' },
      { t: 'tool_rack', x: 4, y: 1, w: 1, h: 2, color: '#5a4a3a' },
      { t: 'table', x: 2, y: 3, w: 2, h: 1, color: '#9a6a3a' },
    ],
  },
  stone_pit: {
    w: 6, h: 5, floor: 'stone',
    items: [
      { t: 'stone_pile', x: 1, y: 1, w: 2, h: 1, color: '#8a8a90' },
      { t: 'tool_rack', x: 4, y: 1, w: 1, h: 2, color: '#5a4a3a' },
      { t: 'crate', x: 1, y: 3, color: '#7a6a5a' },
      { t: 'barrel', x: 4, y: 3, color: '#6a5a4a' },
    ],
  },
  lumberyard: {
    w: 8, h: 7, floor: 'wood_dark',
    items: [
      { t: 'log_pile', x: 1, y: 1, w: 3, h: 1, color: '#8a6030' },
      { t: 'log_pile', x: 1, y: 2, w: 2, h: 1, color: '#7a5020' },
      { t: 'table', x: 5, y: 2, w: 2, h: 1, color: '#9a7a4a' },
      { t: 'tool_rack', x: 5, y: 1, w: 1, h: 1, color: '#5a4a3a' },
      { t: 'crate', x: 6, y: 1, color: '#8a6a3a' },
      { t: 'barrel', x: 1, y: 4, color: '#6a4a2a' },
      { t: 'sack', x: 2, y: 4, color: '#b8a060' },
      { t: 'hay', x: 5, y: 4, w: 2, h: 2, color: '#c8a848' },
    ],
  },
  quarry: {
    w: 8, h: 7, floor: 'stone',
    items: [
      { t: 'stone_pile', x: 1, y: 1, w: 2, h: 2, color: '#8a8a90' },
      { t: 'stone_pile', x: 1, y: 3, w: 1, h: 1, color: '#7a7a80' },
      { t: 'tool_rack', x: 4, y: 1, w: 1, h: 2, color: '#5a4a3a' },
      { t: 'crate', x: 6, y: 1, color: '#7a6a5a' },
      { t: 'barrel', x: 6, y: 2, color: '#6a5a4a' },
      { t: 'table', x: 5, y: 4, w: 2, h: 1, color: '#9a7a4a' },
      { t: 'anvil', x: 3, y: 4, color: '#6a6a70' },
    ],
  },
  weaving_hut: {
    w: 8, h: 7, floor: 'wood_med',
    items: [
      { t: 'loom', x: 1, y: 1, w: 2, h: 2, color: '#8a6a3a' },
      { t: 'shelf', x: 5, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'sack', x: 4, y: 1, color: '#c060a0' },
      { t: 'sack', x: 4, y: 2, color: '#60a0c0' },
      { t: 'table', x: 2, y: 4, w: 2, h: 1, color: '#9a6a3a' },
      { t: 'crate', x: 6, y: 4, color: '#a080b0' },
      { t: 'rug', x: 1, y: 4, w: 1, h: 2, color: '#c060a0' },
    ],
  },
  market: {
    w: 8, h: 7, floor: 'wood_light',
    items: [
      { t: 'counter', x: 1, y: 2, w: 3, h: 1, color: '#9a6a3a' },
      { t: 'shelf', x: 1, y: 1, w: 3, h: 1, color: '#7a5228' },
      { t: 'crate', x: 5, y: 1, color: '#8a6a3a' },
      { t: 'crate', x: 6, y: 1, color: '#7a5a2a' },
      { t: 'barrel', x: 5, y: 2, color: '#6a4a2a' },
      { t: 'sack', x: 6, y: 2, color: '#c8b080' },
      { t: 'table', x: 2, y: 4, w: 2, h: 1, color: '#9a7a4a' },
      { t: 'crate', x: 5, y: 4, color: '#6a8a6a' },
      { t: 'scales', x: 2, y: 1, color: '#c8a040' },
    ],
  },
  storehouse: {
    w: 8, h: 7, floor: 'wood_dark',
    items: [
      { t: 'shelf', x: 1, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'shelf', x: 5, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'crate', x: 3, y: 1, color: '#8a6a3a' },
      { t: 'crate', x: 4, y: 1, color: '#7a5a2a' },
      { t: 'barrel', x: 3, y: 2, color: '#6a4a2a' },
      { t: 'barrel', x: 4, y: 2, color: '#5a3a1a' },
      { t: 'crate', x: 1, y: 4, color: '#8a7a5a' },
      { t: 'crate', x: 2, y: 4, color: '#7a6a4a' },
      { t: 'sack', x: 5, y: 4, color: '#c8b080' },
      { t: 'sack', x: 6, y: 4, color: '#b8a070' },
      { t: 'barrel', x: 3, y: 5, color: '#6a4a2a' },
    ],
  },
  trading_post: {
    w: 8, h: 7, floor: 'wood_light',
    items: [
      { t: 'desk', x: 3, y: 2, w: 3, h: 1, color: '#5a3a1a' },
      { t: 'chair', x: 4, y: 3, color: '#8a5a30' },
      { t: 'shelf', x: 1, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'bookshelf', x: 6, y: 1, w: 1, h: 2, color: '#6a4228' },
      { t: 'crate', x: 1, y: 4, color: '#c8a040' },
      { t: 'scales', x: 4, y: 2, color: '#c8a040' },
      { t: 'rug', x: 3, y: 4, w: 3, h: 2, color: '#c89030' },
      { t: 'candle', x: 6, y: 2, color: '#e8c040' },
    ],
  },
  town_hall: {
    w: 10, h: 9, floor: 'tile_light',
    items: [
      { t: 'table', x: 3, y: 3, w: 4, h: 2, color: '#5a3a1a' },
      { t: 'chair', x: 2, y: 3, color: '#8a5a30' },
      { t: 'chair', x: 2, y: 4, color: '#8a5a30' },
      { t: 'chair', x: 7, y: 3, color: '#8a5a30' },
      { t: 'chair', x: 7, y: 4, color: '#8a5a30' },
      { t: 'bookshelf', x: 1, y: 1, w: 2, h: 2, color: '#6a4228' },
      { t: 'bookshelf', x: 7, y: 1, w: 2, h: 2, color: '#6a4228' },
      { t: 'banner', x: 4, y: 1, w: 2, h: 1, color: '#4080d0' },
      { t: 'candle', x: 3, y: 1, color: '#e8c040' },
      { t: 'candle', x: 6, y: 1, color: '#e8c040' },
      { t: 'rug', x: 3, y: 6, w: 4, h: 2, color: '#3050a0' },
    ],
  },
  bakery: {
    w: 8, h: 7, floor: 'tile_warm',
    items: [
      { t: 'oven', x: 1, y: 1, w: 2, h: 2, color: '#c86040' },
      { t: 'counter', x: 4, y: 1, w: 3, h: 1, color: '#9a6a3a' },
      { t: 'bread_rack', x: 4, y: 2, w: 2, h: 1, color: '#d4a050' },
      { t: 'table', x: 2, y: 4, w: 2, h: 1, color: '#9a7a4a' },
      { t: 'barrel', x: 6, y: 2, color: '#8a6a3a' },
      { t: 'sack', x: 1, y: 4, color: '#e8d8b0' },
      { t: 'sack', x: 6, y: 4, color: '#d8c8a0' },
    ],
  },
  shrine: {
    w: 8, h: 7, floor: 'stone',
    items: [
      { t: 'altar', x: 3, y: 1, w: 2, h: 1, color: '#6a4a8a' },
      { t: 'candle', x: 2, y: 1, color: '#c080e0' },
      { t: 'candle', x: 5, y: 1, color: '#c080e0' },
      { t: 'cauldron', x: 1, y: 3, color: '#4a6a4a' },
      { t: 'shelf', x: 6, y: 1, w: 1, h: 2, color: '#5a3a6a' },
      { t: 'rug', x: 3, y: 3, w: 2, h: 2, color: '#6a3a8a' },
      { t: 'bookshelf', x: 1, y: 1, w: 1, h: 2, color: '#4a2a5a' },
      { t: 'candle', x: 6, y: 4, color: '#c080e0' },
    ],
  },
  warehouse: {
    w: 10, h: 7, floor: 'stone',
    items: [
      { t: 'shelf', x: 1, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'shelf', x: 4, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'shelf', x: 7, y: 1, w: 2, h: 2, color: '#7a5228' },
      { t: 'crate', x: 1, y: 4, color: '#8a6a3a' },
      { t: 'crate', x: 2, y: 4, color: '#7a5a2a' },
      { t: 'crate', x: 3, y: 4, color: '#8a7a4a' },
      { t: 'barrel', x: 5, y: 4, color: '#6a4a2a' },
      { t: 'barrel', x: 6, y: 4, color: '#5a3a1a' },
      { t: 'crate', x: 7, y: 4, color: '#8a6a3a' },
      { t: 'crate', x: 8, y: 4, color: '#7a5a2a' },
      { t: 'sack', x: 1, y: 5, color: '#c8b080' },
      { t: 'sack', x: 8, y: 5, color: '#b8a070' },
    ],
  },
  watchtower: {
    w: 6, h: 5, floor: 'stone',
    items: [
      { t: 'weapon_rack', x: 1, y: 1, w: 2, h: 1, color: '#6a6a70' },
      { t: 'crate', x: 4, y: 1, color: '#7a6a5a' },
      { t: 'table', x: 2, y: 3, w: 2, h: 1, color: '#8a6a3a' },
      { t: 'candle', x: 3, y: 1, color: '#e8c040' },
    ],
  },
  tavern: {
    w: 8, h: 7, floor: 'wood_med',
    items: [
      { t: 'counter', x: 1, y: 1, w: 4, h: 1, color: '#6a3a1a' },
      { t: 'keg', x: 1, y: 2, color: '#5a3a1a' },
      { t: 'keg', x: 2, y: 2, color: '#4a2a0a' },
      { t: 'shelf', x: 3, y: 2, w: 2, h: 1, color: '#7a5228' },
      { t: 'table', x: 6, y: 2, w: 1, h: 1, color: '#9a6a3a' },
      { t: 'chair', x: 5, y: 2, color: '#8a5a30' },
      { t: 'table', x: 2, y: 4, w: 2, h: 1, color: '#9a6a3a' },
      { t: 'chair', x: 1, y: 4, color: '#8a5a30' },
      { t: 'chair', x: 4, y: 4, color: '#8a5a30' },
      { t: 'table', x: 6, y: 4, w: 1, h: 1, color: '#9a6a3a' },
      { t: 'chair', x: 5, y: 4, color: '#8a5a30' },
      { t: 'fireplace', x: 6, y: 1, w: 1, h: 1, color: '#5a3a2a' },
    ],
  },
};

function getRoomTemplate(buildingType) {
  return ROOM_TEMPLATES[buildingType] || ROOM_TEMPLATES.house;
}

/* ═══ Procedural furniture drawing ═══ */

function drawItem(ctx, item, ts) {
  const x = item.x * ts;
  const y = item.y * ts;
  const w = (item.w || 1) * ts;
  const h = (item.h || 1) * ts;
  const c = item.color || '#8a6a3a';
  const p = Math.max(1, Math.round(ts * 0.06)); // pixel padding

  switch (item.t) {
    case 'bed':        return drawBed(ctx, x, y, w, h, c, p, ts);
    case 'table':      return drawTable(ctx, x, y, w, h, c, p);
    case 'desk':       return drawDesk(ctx, x, y, w, h, c, p);
    case 'chair':      return drawChair(ctx, x, y, ts, c, p);
    case 'shelf':      return drawShelf(ctx, x, y, w, h, c, p);
    case 'bookshelf':  return drawBookshelf(ctx, x, y, w, h, c, p);
    case 'crate':      return drawCrate(ctx, x, y, ts, c, p);
    case 'barrel':     return drawBarrel(ctx, x, y, ts, c, p);
    case 'keg':        return drawBarrel(ctx, x, y, ts, c, p); // same as barrel
    case 'sack':       return drawSack(ctx, x, y, ts, c, p);
    case 'candle':     return drawCandle(ctx, x, y, ts, c);
    case 'rug':        return drawRug(ctx, x, y, w, h, c, p);
    case 'fireplace':  return drawFireplace(ctx, x, y, w, h, c, p, ts);
    case 'tool_rack':  return drawToolRack(ctx, x, y, w, h, c, p);
    case 'weapon_rack': return drawWeaponRack(ctx, x, y, w, h, c, p);
    case 'hay':        return drawHay(ctx, x, y, w, h, c, p);
    case 'log_pile':   return drawLogPile(ctx, x, y, w, h, c, p);
    case 'stone_pile': return drawStonePile(ctx, x, y, w, h, c, p);
    case 'counter':    return drawCounter(ctx, x, y, w, h, c, p);
    case 'oven':       return drawOven(ctx, x, y, w, h, c, p, ts);
    case 'anvil':      return drawAnvil(ctx, x, y, ts, c, p);
    case 'cauldron':   return drawCauldron(ctx, x, y, ts, c, p);
    case 'altar':      return drawAltar(ctx, x, y, w, h, c, p);
    case 'banner':     return drawBanner(ctx, x, y, w, h, c, p);
    case 'loom':       return drawLoom(ctx, x, y, w, h, c, p);
    case 'net':        return drawNet(ctx, x, y, w, h, c, p);
    case 'fish_rack':  return drawFishRack(ctx, x, y, w, h, c, p);
    case 'bread_rack': return drawBreadRack(ctx, x, y, w, h, c, p);
    case 'scales':     return drawScales(ctx, x, y, ts, c);
    default:
      ctx.fillStyle = c;
      ctx.fillRect(x + p * 2, y + p * 2, w - p * 4, h - p * 4);
  }
}

/* ── Individual furniture draw functions ── */

function drawBed(ctx, x, y, w, h, color, p, ts) {
  // Frame
  ctx.fillStyle = darken('#8a5e2b', 0.1);
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  // Mattress
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(x + p * 3, y + p * 3, w - p * 6, h - p * 6);
  // Pillow
  ctx.fillStyle = '#f0e8d8';
  const pw = Math.max(ts * 0.5, w * 0.3);
  const ph = Math.max(ts * 0.25, h * 0.15);
  ctx.fillRect(x + p * 4, y + p * 4, pw, ph);
  // Blanket
  ctx.fillStyle = color;
  ctx.fillRect(x + p * 3, y + h * 0.38, w - p * 6, h * 0.48);
  // Blanket highlight
  ctx.fillStyle = lighten(color, 0.2);
  ctx.fillRect(x + p * 3, y + h * 0.38, w - p * 6, p * 2);
}

function drawTable(ctx, x, y, w, h, color, p) {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x + p * 2, y + h - p * 3, w - p * 4, p * 3);
  // Table top
  ctx.fillStyle = color;
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 4);
  // Highlight
  ctx.fillStyle = lighten(color, 0.15);
  ctx.fillRect(x + p * 2, y + p * 2, w - p * 4, p * 2);
  // Edge
  ctx.fillStyle = darken(color, 0.2);
  ctx.fillRect(x + p, y + h - p * 5, w - p * 2, p * 2);
  // Legs
  ctx.fillStyle = darken(color, 0.3);
  const lw = Math.max(1, p * 2);
  ctx.fillRect(x + p * 2, y + h - p * 3, lw, p * 3);
  ctx.fillRect(x + w - p * 2 - lw, y + h - p * 3, lw, p * 3);
}

function drawDesk(ctx, x, y, w, h, color, p) {
  drawTable(ctx, x, y, w, h, color, p);
  // Paper on desk
  ctx.fillStyle = '#f0e8d0';
  ctx.fillRect(x + w * 0.3, y + p * 3, w * 0.25, h * 0.35);
  // Ink well
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x + w * 0.65, y + p * 3, p * 4, p * 4);
}

function drawChair(ctx, x, y, ts, color, p) {
  const s = ts;
  // Seat
  ctx.fillStyle = color;
  ctx.fillRect(x + p * 3, y + s * 0.35, s - p * 6, s * 0.35);
  // Back
  ctx.fillStyle = darken(color, 0.15);
  ctx.fillRect(x + p * 3, y + p * 2, s - p * 6, s * 0.25);
  // Legs
  ctx.fillStyle = darken(color, 0.3);
  const lw = Math.max(1, p * 2);
  ctx.fillRect(x + p * 3, y + s * 0.7, lw, s * 0.2);
  ctx.fillRect(x + s - p * 3 - lw, y + s * 0.7, lw, s * 0.2);
}

function drawShelf(ctx, x, y, w, h, color, p) {
  // Back board
  ctx.fillStyle = darken(color, 0.1);
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  // Shelves (horizontal lines)
  const shelves = Math.max(2, Math.floor(h / (p * 12)));
  ctx.fillStyle = lighten(color, 0.1);
  for (let i = 0; i <= shelves; i++) {
    const sy = y + p + (i * (h - p * 2)) / shelves;
    ctx.fillRect(x + p, sy, w - p * 2, p * 2);
  }
  // Items on shelves
  const itemColors = ['#c04040', '#4080c0', '#40a060', '#c0a040', '#a060c0'];
  for (let i = 0; i < shelves; i++) {
    const shelfY = y + p + (i * (h - p * 2)) / shelves + p * 3;
    const shelfH = ((h - p * 2) / shelves) - p * 5;
    if (shelfH < p * 2) continue;
    const itemW = Math.max(p * 3, (w - p * 4) / 4);
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = itemColors[(i * 3 + j) % itemColors.length];
      ctx.fillRect(x + p * 3 + j * (itemW + p), shelfY, itemW - p, Math.min(shelfH, p * 6));
    }
  }
}

function drawBookshelf(ctx, x, y, w, h, color, p) {
  // Back
  ctx.fillStyle = color;
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  // Shelves
  const shelves = Math.max(2, Math.floor(h / (p * 14)));
  for (let i = 0; i <= shelves; i++) {
    const sy = y + p + (i * (h - p * 2)) / shelves;
    ctx.fillStyle = lighten(color, 0.15);
    ctx.fillRect(x + p, sy, w - p * 2, p * 2);
  }
  // Books
  const bookColors = ['#c03030', '#3060b0', '#2a8a4a', '#b08020', '#8a40a0', '#c06020'];
  for (let i = 0; i < shelves; i++) {
    const shelfY = y + p * 2 + (i * (h - p * 2)) / shelves + p * 2;
    const shelfH = ((h - p * 2) / shelves) - p * 4;
    if (shelfH < p * 2) continue;
    const bookW = Math.max(1, p * 2);
    const booksPerShelf = Math.floor((w - p * 4) / (bookW + 1));
    for (let j = 0; j < booksPerShelf; j++) {
      ctx.fillStyle = bookColors[(i * 7 + j * 3) % bookColors.length];
      const bh = shelfH - (j % 3 === 0 ? p : 0);
      ctx.fillRect(x + p * 2 + j * (bookW + 1), shelfY + shelfH - bh, bookW, bh);
    }
  }
}

function drawCrate(ctx, x, y, ts, color, p) {
  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x + p * 2, y + p * 2, ts - p * 4, ts - p * 4);
  // Planks (vertical lines)
  ctx.fillStyle = darken(color, 0.15);
  const third = (ts - p * 4) / 3;
  ctx.fillRect(x + p * 2 + third, y + p * 2, p, ts - p * 4);
  ctx.fillRect(x + p * 2 + third * 2, y + p * 2, p, ts - p * 4);
  // Cross band
  ctx.fillStyle = darken(color, 0.25);
  ctx.fillRect(x + p * 2, y + ts * 0.4, ts - p * 4, p * 2);
}

function drawBarrel(ctx, x, y, ts, color, p) {
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  const rx = ts * 0.38;
  const ry = ts * 0.42;
  // Body (ellipse approximation with rect)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bands
  ctx.fillStyle = darken(color, 0.3);
  ctx.fillRect(x + ts * 0.15, y + ts * 0.25, ts * 0.7, p * 2);
  ctx.fillRect(x + ts * 0.15, y + ts * 0.65, ts * 0.7, p * 2);
  // Highlight
  ctx.fillStyle = lighten(color, 0.2);
  ctx.fillRect(cx - p, y + ts * 0.3, p * 2, ts * 0.35);
}

function drawSack(ctx, x, y, ts, color, p) {
  const cx = x + ts / 2;
  const cy = y + ts * 0.55;
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, ts * 0.35, ts * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Top tie
  ctx.fillStyle = darken(color, 0.2);
  ctx.fillRect(cx - p * 2, y + p * 3, p * 4, ts * 0.2);
  // Wrinkle
  ctx.fillStyle = darken(color, 0.1);
  ctx.fillRect(cx - ts * 0.15, cy, ts * 0.3, p);
}

function drawCandle(ctx, x, y, ts, color) {
  const cx = x + ts / 2;
  const p = Math.max(1, Math.round(ts * 0.06));
  // Base
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(cx - p * 3, y + ts * 0.6, p * 6, ts * 0.3);
  // Stick
  ctx.fillStyle = '#e8e0c8';
  ctx.fillRect(cx - p, y + ts * 0.25, p * 2, ts * 0.4);
  // Flame
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, y + ts * 0.2, p * 2, p * 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Flame core
  ctx.fillStyle = '#ffe880';
  ctx.beginPath();
  ctx.ellipse(cx, y + ts * 0.2, p, p * 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawRug(ctx, x, y, w, h, color, p) {
  // Outer
  ctx.fillStyle = color;
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  // Border
  ctx.fillStyle = darken(color, 0.2);
  ctx.fillRect(x + p, y + p, w - p * 2, p * 2);
  ctx.fillRect(x + p, y + h - p * 3, w - p * 2, p * 2);
  ctx.fillRect(x + p, y + p, p * 2, h - p * 2);
  ctx.fillRect(x + w - p * 3, y + p, p * 2, h - p * 2);
  // Inner pattern
  ctx.fillStyle = lighten(color, 0.15);
  ctx.fillRect(x + p * 5, y + p * 5, w - p * 10, h - p * 10);
  // Center diamond
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dw = Math.min(w, h) * 0.2;
  ctx.fillStyle = darken(color, 0.1);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-dw / 2, -dw / 2, dw, dw);
  ctx.restore();
}

function drawFireplace(ctx, x, y, w, h, color, p, ts) {
  // Stone frame
  ctx.fillStyle = '#6a6a6a';
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  // Inner dark
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + p * 4, y + p * 3, w - p * 8, h - p * 5);
  // Fire glow
  ctx.fillStyle = '#e85020';
  const fw = (w - p * 12) * 0.6;
  const fh = (h - p * 8) * 0.5;
  ctx.fillRect(x + w / 2 - fw / 2, y + h - p * 4 - fh, fw, fh);
  // Fire highlight
  ctx.fillStyle = '#f8c030';
  ctx.fillRect(x + w / 2 - fw / 4, y + h - p * 4 - fh * 0.8, fw / 2, fh * 0.6);
  // Mantle top
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(x, y + p, w, p * 3);
}

function drawToolRack(ctx, x, y, w, h, color, p) {
  // Board
  ctx.fillStyle = color;
  ctx.fillRect(x + p * 2, y + p, w - p * 4, h - p * 2);
  // Tools (simple shapes)
  const toolColors = ['#808088', '#606068', '#a0a0a8'];
  const toolCount = Math.max(2, Math.floor(w / (p * 8)));
  for (let i = 0; i < toolCount; i++) {
    ctx.fillStyle = toolColors[i % toolColors.length];
    const tx = x + p * 4 + i * (w - p * 8) / toolCount;
    // Handle
    ctx.fillRect(tx, y + h * 0.3, p * 2, h * 0.6);
    // Head
    ctx.fillRect(tx - p, y + h * 0.2, p * 4, p * 4);
  }
}

function drawWeaponRack(ctx, x, y, w, h, color, p) {
  // Frame
  ctx.fillStyle = color;
  ctx.fillRect(x + p * 2, y + p, w - p * 4, h - p * 2);
  // Horizontal bar
  ctx.fillStyle = darken(color, 0.2);
  ctx.fillRect(x + p * 3, y + h * 0.4, w - p * 6, p * 2);
  // Weapons
  ctx.fillStyle = '#909098';
  const wCount = Math.max(2, Math.floor(w / (p * 10)));
  for (let i = 0; i < wCount; i++) {
    const wx = x + p * 5 + i * (w - p * 10) / wCount;
    // Blade
    ctx.fillRect(wx, y + p * 3, p * 2, h * 0.5);
    // Guard
    ctx.fillStyle = '#c8a040';
    ctx.fillRect(wx - p, y + h * 0.4 - p, p * 4, p * 3);
    ctx.fillStyle = '#909098';
  }
}

function drawHay(ctx, x, y, w, h, color, p) {
  // Pile shape
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + p, y + h);
  ctx.lineTo(x + w / 2, y + p * 2);
  ctx.lineTo(x + w - p, y + h);
  ctx.closePath();
  ctx.fill();
  // Strands
  ctx.fillStyle = darken(color, 0.15);
  for (let i = 0; i < 5; i++) {
    const sx = x + p * 3 + (i * (w - p * 6)) / 5;
    ctx.fillRect(sx, y + h * 0.3 + i * p, p, h * 0.5);
  }
}

function drawLogPile(ctx, x, y, w, h, color, p) {
  const logH = Math.max(p * 4, h / 3);
  for (let i = 0; i < 3; i++) {
    const ly = y + p + i * (logH + p);
    if (ly + logH > y + h) break;
    ctx.fillStyle = i % 2 === 0 ? color : darken(color, 0.1);
    ctx.fillRect(x + p * 2, ly, w - p * 4, logH - p);
    // Ring
    ctx.fillStyle = lighten(color, 0.2);
    ctx.beginPath();
    ctx.arc(x + w - p * 4, ly + logH / 2, logH * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStonePile(ctx, x, y, w, h, color, p) {
  const stones = [
    { dx: 0.1, dy: 0.5, r: 0.25 },
    { dx: 0.4, dy: 0.3, r: 0.3 },
    { dx: 0.7, dy: 0.55, r: 0.22 },
    { dx: 0.3, dy: 0.7, r: 0.2 },
    { dx: 0.6, dy: 0.75, r: 0.18 },
  ];
  stones.forEach((s, i) => {
    ctx.fillStyle = i % 2 === 0 ? color : darken(color, 0.12);
    ctx.beginPath();
    ctx.ellipse(x + w * s.dx, y + h * s.dy, w * s.r, h * s.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawCounter(ctx, x, y, w, h, color, p) {
  // Top surface
  ctx.fillStyle = lighten(color, 0.1);
  ctx.fillRect(x + p, y + p, w - p * 2, p * 4);
  // Front face
  ctx.fillStyle = color;
  ctx.fillRect(x + p, y + p * 4, w - p * 2, h - p * 5);
  // Panels
  ctx.fillStyle = darken(color, 0.12);
  const panelW = (w - p * 6) / Math.max(1, Math.floor(w / (p * 16)));
  for (let i = 0; i < Math.floor(w / (p * 16)); i++) {
    ctx.fillRect(x + p * 3 + i * (panelW + p), y + p * 6, panelW - p, h - p * 10);
  }
}

function drawOven(ctx, x, y, w, h, color, p, ts) {
  // Body
  ctx.fillStyle = '#a06040';
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  // Front
  ctx.fillStyle = color;
  ctx.fillRect(x + p * 2, y + h * 0.3, w - p * 4, h * 0.6);
  // Opening
  ctx.fillStyle = '#1a0a0a';
  const ow = w * 0.4;
  const oh = h * 0.3;
  ctx.fillRect(x + w / 2 - ow / 2, y + h * 0.4, ow, oh);
  // Fire glow
  ctx.fillStyle = '#e86030';
  ctx.fillRect(x + w / 2 - ow / 3, y + h * 0.5, ow * 0.5, oh * 0.5);
  // Top
  ctx.fillStyle = darken('#a06040', 0.15);
  ctx.fillRect(x + p, y + p, w - p * 2, p * 4);
  // Chimney hint
  ctx.fillStyle = '#8a5030';
  ctx.fillRect(x + w * 0.4, y - p * 2, w * 0.2, p * 4);
}

function drawAnvil(ctx, x, y, ts, color, p) {
  // Base
  ctx.fillStyle = darken(color, 0.2);
  ctx.fillRect(x + ts * 0.2, y + ts * 0.6, ts * 0.6, ts * 0.3);
  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x + ts * 0.15, y + ts * 0.35, ts * 0.7, ts * 0.3);
  // Top surface
  ctx.fillStyle = lighten(color, 0.2);
  ctx.fillRect(x + ts * 0.1, y + ts * 0.3, ts * 0.8, p * 3);
  // Horn
  ctx.fillStyle = color;
  ctx.fillRect(x + ts * 0.05, y + ts * 0.35, ts * 0.15, ts * 0.15);
}

function drawCauldron(ctx, x, y, ts, color, p) {
  const cx = x + ts / 2;
  const cy = y + ts * 0.55;
  // Pot body
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.ellipse(cx, cy, ts * 0.38, ts * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  // Liquid
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy - ts * 0.05, ts * 0.3, ts * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bubble
  ctx.fillStyle = lighten(color, 0.3);
  ctx.beginPath();
  ctx.arc(cx - ts * 0.1, cy - ts * 0.1, p * 2, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(cx - ts * 0.3, y + ts * 0.8, p * 2, ts * 0.12);
  ctx.fillRect(cx + ts * 0.25, y + ts * 0.8, p * 2, ts * 0.12);
}

function drawAltar(ctx, x, y, w, h, color, p) {
  // Base
  ctx.fillStyle = '#8a8a90';
  ctx.fillRect(x + p, y + h * 0.5, w - p * 2, h * 0.45);
  // Top slab
  ctx.fillStyle = '#a0a0a8';
  ctx.fillRect(x, y + h * 0.4, w, p * 4);
  // Cloth
  ctx.fillStyle = color;
  ctx.fillRect(x + p * 2, y + h * 0.42, w - p * 4, p * 3);
  // Glow
  ctx.fillStyle = lighten(color, 0.4);
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.3, w * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBanner(ctx, x, y, w, h, color, p) {
  // Pole
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(x + w * 0.05, y + p, p * 2, h - p * 2);
  ctx.fillRect(x + w * 0.85, y + p, p * 2, h - p * 2);
  // Banner cloth
  ctx.fillStyle = color;
  ctx.fillRect(x + w * 0.1, y + p * 2, w * 0.8, h * 0.7);
  // Emblem center
  ctx.fillStyle = lighten(color, 0.3);
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.4, Math.min(w, h) * 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Fringe
  ctx.fillStyle = darken(color, 0.15);
  for (let i = 0; i < 5; i++) {
    const fx = x + w * 0.12 + i * w * 0.17;
    ctx.fillRect(fx, y + h * 0.72, p * 3, h * 0.15);
  }
}

function drawLoom(ctx, x, y, w, h, color, p) {
  // Frame
  ctx.fillStyle = color;
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  // Uprights
  ctx.fillStyle = darken(color, 0.2);
  ctx.fillRect(x + p * 2, y + p, p * 3, h - p * 2);
  ctx.fillRect(x + w - p * 5, y + p, p * 3, h - p * 2);
  // Warp threads
  const threads = Math.max(4, Math.floor(w / (p * 6)));
  for (let i = 0; i < threads; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#c060a0' : '#60a0c0';
    ctx.fillRect(x + p * 6 + i * ((w - p * 12) / threads), y + p * 3, p, h - p * 6);
  }
  // Cross beam
  ctx.fillStyle = darken(color, 0.15);
  ctx.fillRect(x + p * 2, y + h * 0.35, w - p * 4, p * 3);
}

function drawNet(ctx, x, y, w, h, color, p) {
  // Net background
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  // Net lines
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, p);
  const step = Math.max(p * 4, w / 6);
  for (let i = 0; i * step < w; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * step, y + p);
    ctx.lineTo(x + i * step, y + h - p);
    ctx.stroke();
  }
  for (let i = 0; i * step < h; i++) {
    ctx.beginPath();
    ctx.moveTo(x + p, y + i * step);
    ctx.lineTo(x + w - p, y + i * step);
    ctx.stroke();
  }
}

function drawFishRack(ctx, x, y, w, h, color, p) {
  // Rack frame
  ctx.fillStyle = color;
  ctx.fillRect(x + p * 2, y + p, p * 2, h - p * 2);
  ctx.fillRect(x + w - p * 4, y + p, p * 2, h - p * 2);
  ctx.fillRect(x + p * 2, y + h * 0.3, w - p * 4, p * 2);
  // Fish
  const fishColors = ['#a0b8c8', '#90a8b8', '#b0c0d0'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = fishColors[i];
    const fx = x + p * 5 + i * (w - p * 10) / 3;
    ctx.beginPath();
    ctx.ellipse(fx + p * 4, y + h * 0.55, p * 4, p * 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBreadRack(ctx, x, y, w, h, color, p) {
  // Shelf
  ctx.fillStyle = '#9a7a4a';
  ctx.fillRect(x + p, y + p, w - p * 2, h - p * 2);
  ctx.fillStyle = lighten('#9a7a4a', 0.1);
  ctx.fillRect(x + p, y + h * 0.45, w - p * 2, p * 2);
  // Bread loaves
  const loafColor = color;
  for (let i = 0; i < 3; i++) {
    const lx = x + p * 3 + i * (w - p * 6) / 3;
    ctx.fillStyle = loafColor;
    ctx.beginPath();
    ctx.ellipse(lx + p * 4, y + h * 0.25, p * 4, p * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Bottom row
    ctx.fillStyle = darken(loafColor, 0.1);
    ctx.beginPath();
    ctx.ellipse(lx + p * 3, y + h * 0.7, p * 3, p * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawScales(ctx, x, y, ts, color) {
  const cx = x + ts / 2;
  const p = Math.max(1, Math.round(ts * 0.06));
  // Post
  ctx.fillStyle = '#8a8a90';
  ctx.fillRect(cx - p, y + ts * 0.2, p * 2, ts * 0.7);
  // Beam
  ctx.fillStyle = color;
  ctx.fillRect(x + ts * 0.1, y + ts * 0.2, ts * 0.8, p * 2);
  // Pans
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + ts * 0.2, y + ts * 0.45, ts * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + ts * 0.8, y + ts * 0.45, ts * 0.12, 0, Math.PI * 2);
  ctx.fill();
  // Chains
  ctx.strokeStyle = '#8a8a90';
  ctx.lineWidth = Math.max(1, p);
  ctx.beginPath();
  ctx.moveTo(x + ts * 0.2, y + ts * 0.22);
  ctx.lineTo(x + ts * 0.2, y + ts * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + ts * 0.8, y + ts * 0.22);
  ctx.lineTo(x + ts * 0.8, y + ts * 0.35);
  ctx.stroke();
}

/* ═══ Room render function ═══ */

function renderRoom(ctx, template, ui, ts, canvasW, canvasH, time) {
  const roomW = template.w * ts;
  const roomH = template.h * ts;

  // Wall thickness (2 tile rows at top for back wall, 1 tile col on each side)
  const wallTop = 2 * ts;
  const wallSide = ts;
  const totalW = roomW + wallSide * 2;
  const totalH = roomH + wallTop;

  // Center the room
  const ox = Math.round((canvasW - totalW) / 2);
  const oy = Math.round((canvasH - totalH) / 2);

  // ── Dark background ──
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // ── Floor ──
  const floorSrc = FLOOR_TILES[template.floor];
  const floorDrawn = !!floorSrc;
  for (let fy = 0; fy < template.h; fy++) {
    for (let fx = 0; fx < template.w; fx++) {
      const dx = ox + wallSide + fx * ts;
      const dy = oy + wallTop + fy * ts;
      if (floorDrawn) {
        if (!drawSrc(ctx, SHEET, floorSrc[0], floorSrc[1], ST, ST, dx, dy, ts, ts)) {
          // Fallback while loading
          ctx.fillStyle = ui.wallColor || '#b89870';
          ctx.fillRect(dx, dy, ts, ts);
        }
      } else {
        ctx.fillStyle = ui.wallColor || '#b89870';
        ctx.fillRect(dx, dy, ts, ts);
      }
    }
  }

  // ── Floor grid lines (subtle) ──
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  for (let fy = 0; fy <= template.h; fy++) {
    const ly = oy + wallTop + fy * ts;
    ctx.beginPath();
    ctx.moveTo(ox + wallSide, ly);
    ctx.lineTo(ox + wallSide + roomW, ly);
    ctx.stroke();
  }
  for (let fx = 0; fx <= template.w; fx++) {
    const lx = ox + wallSide + fx * ts;
    ctx.beginPath();
    ctx.moveTo(lx, oy + wallTop);
    ctx.lineTo(lx, oy + wallTop + roomH);
    ctx.stroke();
  }

  // ── Back wall ──
  const wallColor = ui.roofColor || '#5a3a2a';
  // Wall face (dark)
  ctx.fillStyle = wallColor;
  ctx.fillRect(ox + wallSide, oy, roomW, wallTop);
  // Wall highlight (top edge)
  ctx.fillStyle = lighten(wallColor, 0.15);
  ctx.fillRect(ox + wallSide, oy, roomW, Math.max(2, ts * 0.15));
  // Wall shadow (bottom edge — baseboard)
  ctx.fillStyle = darken(wallColor, 0.25);
  ctx.fillRect(ox + wallSide, oy + wallTop - Math.max(2, ts * 0.2), roomW, Math.max(2, ts * 0.2));

  // ── Wall decoration: windows ──
  const windowCount = Math.max(1, Math.floor(template.w / 3));
  const windowSpacing = roomW / (windowCount + 1);
  for (let i = 0; i < windowCount; i++) {
    const wx = ox + wallSide + windowSpacing * (i + 1) - ts * 0.4;
    const wy = oy + ts * 0.3;
    const ww = ts * 0.8;
    const wh = ts * 1.0;
    // Window frame
    ctx.fillStyle = darken(wallColor, 0.3);
    ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
    // Glass
    ctx.fillStyle = '#4070a0';
    ctx.fillRect(wx, wy, ww, wh);
    // Panes (cross)
    ctx.fillStyle = darken(wallColor, 0.2);
    ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
    ctx.fillRect(wx, wy + wh / 2 - 1, ww, 2);
    // Light reflection
    ctx.fillStyle = 'rgba(180,210,240,0.3)';
    ctx.fillRect(wx + 2, wy + 2, ww * 0.35, wh * 0.35);
  }

  // ── Side walls ──
  // Left wall
  ctx.fillStyle = darken(wallColor, 0.08);
  ctx.fillRect(ox, oy, wallSide, wallTop + roomH);
  ctx.fillStyle = lighten(wallColor, 0.05);
  ctx.fillRect(ox + wallSide - Math.max(1, ts * 0.08), oy, Math.max(1, ts * 0.08), wallTop + roomH);

  // Right wall
  ctx.fillStyle = darken(wallColor, 0.08);
  ctx.fillRect(ox + wallSide + roomW, oy, wallSide, wallTop + roomH);
  ctx.fillStyle = lighten(wallColor, 0.05);
  ctx.fillRect(ox + wallSide + roomW, oy, Math.max(1, ts * 0.08), wallTop + roomH);

  // ── Floor border (where floor meets wall) ──
  ctx.fillStyle = darken(wallColor, 0.15);
  ctx.fillRect(ox + wallSide, oy + wallTop, roomW, Math.max(1, ts * 0.08));

  // ── Furniture items ──
  ctx.save();
  ctx.translate(ox + wallSide, oy + wallTop);
  // Sort items by y position for correct overlap
  const sortedItems = [...template.items].sort((a, b) => (a.y + (a.h || 1)) - (b.y + (b.h || 1)));
  sortedItems.forEach((item) => drawItem(ctx, item, ts));
  ctx.restore();

  // ── Room ambient shadow (vignette around edges) ──
  // Top shadow
  const grad = ctx.createLinearGradient(0, oy + wallTop, 0, oy + wallTop + ts * 1.5);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(ox + wallSide, oy + wallTop, roomW, ts * 1.5);

  // Side shadows
  const gradL = ctx.createLinearGradient(ox + wallSide, 0, ox + wallSide + ts, 0);
  gradL.addColorStop(0, 'rgba(0,0,0,0.12)');
  gradL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradL;
  ctx.fillRect(ox + wallSide, oy + wallTop, ts, roomH);

  const gradR = ctx.createLinearGradient(ox + wallSide + roomW, 0, ox + wallSide + roomW - ts, 0);
  gradR.addColorStop(0, 'rgba(0,0,0,0.12)');
  gradR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradR;
  ctx.fillRect(ox + wallSide + roomW - ts, oy + wallTop, ts, roomH);

  // ── Outer border (room edge) ──
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, totalW, totalH);
}

/* ═══ Component ═══ */

export default function PetWorldInterior({ building, buildingDef, world, onExit }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const buildingType = building?.type || building?.building_type || 'house';
  const ui = getBuildingUi(buildingType);
  const template = getRoomTemplate(buildingType);

  // Responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Compute tile scale to fit room in available space
  const tileScale = (() => {
    if (!size.width || !size.height) return 3;
    const wallExtra = 4; // 2 wall tiles added (1 left, 1 right, 2 top)
    const roomTilesW = template.w + 2;
    const roomTilesH = template.h + 2;
    const scaleX = (size.width * 0.92) / (roomTilesW * ST);
    const scaleY = (size.height * 0.88) / (roomTilesH * ST);
    return Math.max(1, Math.floor(Math.min(scaleX, scaleY)));
  })();

  const ts = ST * tileScale;

  // Render
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

    const render = () => {
      const time = performance.now();
      renderRoom(ctx, template, ui, ts, size.width, size.height, time);
      // Keep animating for sprite loading
      animFrameRef.current = requestAnimationFrame(render);
    };
    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [size, template, ui, ts]);

  // Preload images
  useEffect(() => {
    getImage(SHEET);
  }, []);

  const label = getBuildingLabel(building);
  const level = building?.level || 1;

  // Building stats
  const stats = [];
  if (buildingDef?.production) {
    const entries = Object.entries(buildingDef.production);
    entries.forEach(([key, val]) => {
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
            {building?.state !== 'built' && <span className="cf-pill cf-pill-warn" style={{ fontSize: 8, padding: '0 5px' }}>Building</span>}
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

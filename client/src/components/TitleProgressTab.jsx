import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const GROUP_ORDER = ['Master', 'Expert', 'Advanced', 'Intermediate', 'Beginner'];

const TIER_PALETTE = {
  beginner: { bg: 'from-emerald-500 to-emerald-800', ring: 'ring-emerald-200/80', glow: 'shadow-emerald-900/75' },
  bronze: { bg: 'from-amber-500 to-amber-800', ring: 'ring-amber-200/80', glow: 'shadow-amber-900/75' },
  silver: { bg: 'from-slate-300 to-slate-700', ring: 'ring-slate-100/90', glow: 'shadow-slate-900/75' },
  gold: { bg: 'from-amber-700 to-amber-950', ring: 'ring-amber-200/90', glow: 'shadow-amber-950/80' },
  blue: { bg: 'from-sky-500 to-indigo-900', ring: 'ring-sky-200/90', glow: 'shadow-indigo-950/80' },
  default: { bg: 'from-slate-400 to-slate-800', ring: 'ring-slate-200/70', glow: 'shadow-slate-900/70' },
};

const LEVEL_AA_CLEAR_POINTS = {
  10: 100, 11: 110, 12: 130, 13: 160, 14: 200,
  15: 250, 16: 310, 17: 380, 18: 460, 19: 550,
  20: 650, 21: 760, 22: 880, 23: 1010, 24: 1150,
  25: 1300, 26: 1460, 27: 1630, 28: 1810,
};

const FORWARD_START_LINES = [
  'The crystal road climbs. Forward.',
  'Another ridge awaits. Let us ascend.',
  'Our next title lies higher.',
  'Onward, warrior of rhythm.',
];

const INSPECT_START_LINES = [
  'Returning to this waypoint.',
  'Let us revisit this chapter.',
  'Backtracking for a closer look.',
  'We can rest here for a moment.',
];

const FORWARD_TRAVEL_LINES = [
  'Step by step, we rise.',
  'Keep your tempo. The summit listens.',
  'The trail bends, but we continue.',
  'Higher ground is within reach.',
];

const INSPECT_TRAVEL_LINES = [
  'Tracing old footsteps.',
  'Surveying the path behind us.',
  'These stones remember the grind.',
  'A quiet return to known ground.',
];

const LOCKED_TRAVEL_LINES = [
  'A sealed route. We scout ahead.',
  'This gate is closed, for now.',
  'The next ascent demands more power.',
  'Mark this node. We return stronger.',
];

const ACHIEVED_REMINISCE_LINES = [
  'This is {title}. You conquered this ascent.',
  '{title} was no mercy route, yet you cleared it.',
  '{title} still echoes with that hard-fought climb.',
  '{title} demanded resolve. You answered.',
];

const ACHIEVED_GRATITUDE_LINES = [
  'It took around {passes} passes at Level {level} to secure it.',
  'We earned this with roughly {passes} passes at Level {level}.',
  '{passes} passes at Level {level}. A worthy victory.',
];

const LOCKED_REFLECTION_LINES = [
  'This route still asks for roughly {passes} passes at Level {level}.',
  'Not yet cleared. Estimate: {passes} passes at Level {level}.',
  'Future target set: about {passes} passes at Level {level}.',
];

function pickRandomLine(lines, fallback = '') {
  if (!Array.isArray(lines) || lines.length === 0) return fallback;
  return lines[Math.floor(Math.random() * lines.length)] || fallback;
}

function compactTitleName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'checkpoint';
  return raw
    .replace(/\bLv\.\s*/gi, '')
    .replace(/\blvl\.\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function titleLevelLabel(title) {
  const level = parseInt(title?.level, 10) || 0;
  return level > 0 ? `Title Level ${level}` : 'Title Level ?';
}

function fillTemplate(line, values = {}) {
  let out = String(line || '');
  for (const [key, value] of Object.entries(values)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return out;
}

function familyName(title) {
  return String(title?.skill_family || '').trim() || 'Other';
}

function groupTitles(titles) {
  const ordered = [...titles].sort((a, b) => b.index - a.index);
  const map = new Map();
  for (const title of ordered) {
    const family = familyName(title);
    if (!map.has(family)) map.set(family, []);
    map.get(family).push(title);
  }
  const known = GROUP_ORDER.filter((f) => map.has(f)).map((f) => ({ family: f, titles: map.get(f) }));
  const extra = Array.from(map.keys())
    .filter((f) => !GROUP_ORDER.includes(f))
    .map((f) => ({ family: f, titles: map.get(f) }));
  return [...known, ...extra];
}

/* ── World Map Layout ─────────────────────────────────────────────── */
const MAP_W = 1000;
const LANE_MIN = 140;
const LANE_MAX = 860;
const STEP_Y = 130;
const TOP_PAD = 230;
const BOT_PAD = 210;

function buildWorldPoints(count) {
  const n = Math.max(1, count);
  const h = TOP_PAD + BOT_PAD + Math.max(0, n - 1) * STEP_Y;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i * 0.62) * 260 + Math.cos(i * 0.27) * 140 + Math.sin(i * 0.16) * 80;
    pts.push({
      x: clamp(500 + wave, LANE_MIN, LANE_MAX),
      y: h - BOT_PAD - i * STEP_Y,
    });
  }
  return { points: pts, width: MAP_W, height: h };
}

function interpolatePoint(points, floatIndex) {
  if (!points.length) return { x: 0, y: 0 };
  const maxI = points.length - 1;
  const idx = clamp(floatIndex, 0, maxI);
  const a = points[Math.floor(idx)];
  const b = points[Math.min(maxI, Math.floor(idx) + 1)];
  const t = idx - Math.floor(idx);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function getZone(points, titles, families, id) {
  const indices = titles.filter((t) => families.includes(familyName(t))).map((t) => t.index);
  if (!indices.length) return null;
  const ys = indices.map((i) => points[i].y);
  const top = Math.max(0, Math.min(...ys) - 80);
  const bottom = Math.max(...ys) + 80;
  return { id, top, height: Math.max(180, bottom - top) };
}

const TERRACE_THEMES = [
  {
    topA: '#A94133',
    topB: '#DB6C46',
    rim: '#FFE2C5',
    faceA: '#60261C',
    faceB: '#2F120D',
    texture: 'url(#terrain-speck-ember)',
    haze: 'rgba(255, 154, 88, 0.15)',
  },
  {
    topA: '#99613D',
    topB: '#D49760',
    rim: '#FFE6C7',
    faceA: '#5A361F',
    faceB: '#2E1B11',
    texture: 'url(#terrain-speck-rust)',
    haze: 'rgba(255, 205, 150, 0.14)',
  },
  {
    topA: '#627A4A',
    topB: '#99B56B',
    rim: '#F3F9E3',
    faceA: '#3B4B2D',
    faceB: '#1F281A',
    texture: 'url(#terrain-speck-moss)',
    haze: 'rgba(195, 226, 154, 0.14)',
  },
  {
    topA: '#566E84',
    topB: '#8EA3BB',
    rim: '#EFF5FF',
    faceA: '#2E3D50',
    faceB: '#172331',
    texture: 'url(#terrain-speck-rock)',
    haze: 'rgba(172, 203, 237, 0.16)',
  },
  {
    topA: '#696092',
    topB: '#A79FCE',
    rim: '#F8F3FF',
    faceA: '#3C315A',
    faceB: '#1E1A32',
    texture: 'url(#terrain-speck-crystal)',
    haze: 'rgba(210, 190, 255, 0.18)',
  },
];

function toSvgPoints(points) {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

function buildTerrainTerraces(points, width, height) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const terraceCount = Math.min(6, Math.max(4, Math.ceil(points.length / 6)));
  const terraces = [];

  for (let i = 0; i < terraceCount; i++) {
    const startIndex = Math.floor((i * points.length) / terraceCount);
    const rawEnd = Math.floor(((i + 1) * points.length) / terraceCount) - 1;
    const endIndex = clamp(Math.max(startIndex, rawEnd), startIndex, points.length - 1);
    const slice = points.slice(startIndex, endIndex + 1);
    if (!slice.length) continue;

    const ys = slice.map((p) => p.y);
    const xs = slice.map((p) => p.x);
    const centerX = xs.reduce((sum, x) => sum + x, 0) / xs.length;

    const topY = clamp(Math.min(...ys) - (126 + i * 12), 24, height - 260);
    const bottomY = clamp(Math.max(...ys) + (102 + i * 14), topY + 150, height - 26);
    const spread = clamp(240 + i * 30 + Math.abs(Math.sin(i * 1.17)) * 84, 210, 408);
    const taper = 72 + i * 14;
    const leftTop = clamp(centerX - spread, 14, width - 426);
    const rightTop = clamp(centerX + spread, 426, width - 14);
    const leftBottom = clamp(centerX - spread - taper, 6, width - 438);
    const rightBottom = clamp(centerX + spread + taper, 438, width - 6);
    const ridgeX = clamp(centerX + Math.sin(i * 0.82) * 92, leftTop + 110, rightTop - 110);

    const topSurface = [
      { x: leftTop + 82, y: topY + 8 },
      { x: ridgeX - 136, y: topY },
      { x: rightTop - 112, y: topY + 14 },
      { x: rightTop, y: topY + 92 },
      { x: rightBottom - 22, y: bottomY - 38 },
      { x: ridgeX + 152, y: bottomY + 6 },
      { x: leftBottom + 124, y: bottomY + 16 },
      { x: leftBottom, y: bottomY - 64 },
      { x: leftTop + 10, y: topY + 102 },
    ];

    const depth = 46 + i * 15;
    const depthX = depth * 0.26;
    const shifted = topSurface.map((pt) => ({ x: pt.x + depthX, y: pt.y + depth }));

    const rightFace = [topSurface[3], topSurface[4], topSurface[5], shifted[5], shifted[4], shifted[3]];
    const frontFace = [topSurface[5], topSurface[6], topSurface[7], shifted[7], shifted[6], shifted[5]];
    const leftFace = [topSurface[8], topSurface[0], topSurface[7], shifted[7], shifted[0], shifted[8]];

    const themeIndex = terraceCount === 1
      ? TERRACE_THEMES.length - 1
      : Math.round((i / (terraceCount - 1)) * (TERRACE_THEMES.length - 1));

    terraces.push({
      id: `terrace-${i}`,
      index: i,
      startIndex,
      endIndex,
      centerX,
      labelY: topY + 20,
      topSurface,
      shadowSurface: shifted,
      rightFace,
      frontFace,
      leftFace,
      theme: TERRACE_THEMES[themeIndex] || TERRACE_THEMES[TERRACE_THEMES.length - 1],
    });
  }

  return terraces;
}

function buildTerraceStairs(points, terraces) {
  if (!Array.isArray(points) || !Array.isArray(terraces)) return [];
  const stairs = [];
  for (let i = 0; i < terraces.length - 1; i++) {
    const anchor = terraces[i];
    const a = points[anchor.endIndex];
    const b = points[Math.min(points.length - 1, anchor.endIndex + 1)];
    if (!a || !b) continue;
    stairs.push({
      id: `stairs-${i}`,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2 - 10,
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      width: 56 + i * 5,
      drop: 24 + i * 5,
    });
  }
  return stairs;
}

const BIOME_META = {
  haunted: {
    title: 'Haunted Swamp',
    subtitle: 'Lower Realm',
    banner: '#5A9E8A',
    topA: '#6A8F7F',
    topB: '#314F44',
    sideA: '#1F322C',
    sideB: '#111C19',
    rim: '#D5F0E7',
    texture: 'swamp',
    parallax: 0.075,
    blur: 0,
    zLift: 24,
  },
  ruins: {
    title: 'Ancient Ruins',
    subtitle: 'Desert Mid-Realm',
    banner: '#D8A35A',
    topA: '#B88653',
    topB: '#7F5A36',
    sideA: '#563620',
    sideB: '#2F1F13',
    rim: '#FFE7C7',
    texture: 'ruins',
    parallax: 0.055,
    blur: 0.5,
    zLift: 98,
  },
  volcanic: {
    title: 'Volcanic Crown',
    subtitle: 'Upper Realm',
    banner: '#E66553',
    topA: '#C85A44',
    topB: '#902D27',
    sideA: '#55211C',
    sideB: '#2D1312',
    rim: '#FFD8C8',
    texture: 'volcanic',
    parallax: 0.03,
    blur: 1.2,
    zLift: 174,
  },
};

function buildBiomeZones(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const total = points.length;
  const cutOne = Math.max(1, Math.floor(total / 3));
  const cutTwo = Math.max(cutOne + 1, Math.floor((total * 2) / 3));
  const ranges = [
    { id: 'haunted', start: 0, end: Math.min(total - 1, cutOne - 1) },
    { id: 'ruins', start: cutOne, end: Math.min(total - 1, cutTwo - 1) },
    { id: 'volcanic', start: cutTwo, end: total - 1 },
  ];

  return ranges
    .filter((range) => range.start <= range.end)
    .map((range) => {
      const slice = points.slice(range.start, range.end + 1);
      const xs = slice.map((point) => point.x);
      const ys = slice.map((point) => point.y);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const inset = clamp(Math.round((maxY - minY) * 0.08), 28, 72);
      let top = minY + inset;
      let bottom = maxY - inset;
      if (bottom - top < 220) {
        top = minY + 16;
        bottom = maxY - 16;
      }
      const centerX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
      return {
        ...range,
        ...BIOME_META[range.id],
        centerX,
        top: Math.max(18, top),
        bottom,
        height: bottom - top,
      };
    });
}

function buildVolumetricIslands(zones, width) {
  if (!Array.isArray(zones) || zones.length === 0) return [];
  return zones.map((zone) => {
    const widthScale = zone.id === 'haunted' ? 1.18 : zone.id === 'ruins' ? 1.04 : 0.92;
    const islandWidth = clamp(370 * widthScale + zone.height * 0.18, 380, 720);
    const islandHeight = clamp(zone.height + 56, 280, 1520);
    const left = clamp(zone.centerX - islandWidth / 2, 16, width - islandWidth - 16);
    const top = clamp(zone.top - 28, 12, zone.bottom - 180);

    return {
      ...zone,
      left,
      top,
      widthPx: islandWidth,
      heightPx: islandHeight,
      thickness: zone.id === 'haunted' ? 98 : zone.id === 'ruins' ? 84 : 68,
      zLift: zone.zLift,
      labelY: top + 20,
      clipPath: zone.id === 'haunted'
        ? 'polygon(12% 10%, 55% 2%, 90% 14%, 96% 42%, 86% 88%, 44% 98%, 12% 86%, 4% 44%)'
        : zone.id === 'ruins'
          ? 'polygon(9% 12%, 56% 3%, 92% 16%, 96% 46%, 87% 91%, 46% 98%, 11% 86%, 4% 43%)'
          : 'polygon(13% 11%, 57% 4%, 90% 16%, 95% 46%, 84% 89%, 43% 98%, 12% 85%, 6% 43%)',
    };
  });
}

function buildBiomeStairs(points, zones) {
  if (!Array.isArray(points) || !Array.isArray(zones) || zones.length < 2) return [];
  const stairs = [];
  for (let i = 0; i < zones.length - 1; i++) {
    const low = points[zones[i].end];
    const high = points[zones[i + 1].start];
    if (!low || !high) continue;
    stairs.push({
      id: `biome-stair-${i}`,
      x: (low.x + high.x) / 2,
      y: (low.y + high.y) / 2 - 12,
      angle: (Math.atan2(high.y - low.y, high.x - low.x) * 180) / Math.PI,
      width: 92 - i * 8,
      drop: 58 - i * 6,
    });
  }
  return stairs;
}

function buildZoneRoadPaths(points, zones) {
  if (!Array.isArray(points) || !Array.isArray(zones)) return [];
  return zones
    .map((zone) => {
      const zonePoints = points.slice(zone.start, zone.end + 1);
      if (zonePoints.length < 2) return null;
      return { id: zone.id, d: buildRoadPath(zonePoints), parallax: zone.parallax || 0 };
    })
    .filter(Boolean);
}

function buildDropConnectors(points, zones) {
  if (!Array.isArray(points) || !Array.isArray(zones) || zones.length < 2) return [];
  const links = [];
  for (let i = 0; i < zones.length - 1; i++) {
    const from = points[zones[i].end];
    const to = points[zones[i + 1].start];
    if (!from || !to) continue;
    links.push({
      id: `drop-${i}`,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });
  }
  return links;
}

/* ── 3D SVG Landscape Elements ────────────────────────────────────── */

function Tree3D({ x, y, scale = 1, variant = 0 }) {
  const s = scale;
  const colors = [
    { trunk: '#5D4037', canopy: ['#2E7D32', '#388E3C', '#43A047'], shadow: '#1B5E20' },
    { trunk: '#6D4C41', canopy: ['#558B2F', '#689F38', '#7CB342'], shadow: '#33691E' },
    { trunk: '#4E342E', canopy: ['#1B5E20', '#2E7D32', '#388E3C'], shadow: '#0D3311' },
  ];
  const c = colors[variant % colors.length];
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="4" rx="8" ry="3" fill="rgba(0,0,0,0.2)" />
      <rect x="-2" y="-18" width="4" height="22" fill={c.trunk} rx="1" />
      <rect x="-1" y="-18" width="2" height="22" fill="#795548" rx="0.5" opacity="0.4" />
      <ellipse cx="0" cy="-22" rx="12" ry="14" fill={c.canopy[0]} />
      <ellipse cx="-4" cy="-26" rx="9" ry="10" fill={c.canopy[1]} />
      <ellipse cx="4" cy="-24" rx="8" ry="9" fill={c.canopy[2]} />
      <ellipse cx="-2" cy="-30" rx="6" ry="7" fill={c.canopy[2]} opacity="0.7" />
      <ellipse cx="0" cy="-32" rx="4" ry="4" fill="#81C784" opacity="0.5" />
    </g>
  );
}

function PineTree3D({ x, y, scale = 1 }) {
  const s = scale;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="4" rx="6" ry="2.5" fill="rgba(0,0,0,0.18)" />
      <rect x="-1.5" y="-14" width="3" height="18" fill="#5D4037" rx="1" />
      <polygon points="-10,0 0,-28 10,0" fill="#1B5E20" />
      <polygon points="-8,-6 0,-26 8,-6" fill="#2E7D32" />
      <polygon points="-6,-12 0,-24 6,-12" fill="#388E3C" />
      <polygon points="-1,-24 0,-28 1,-24" fill="#66BB6A" opacity="0.6" />
    </g>
  );
}

function Mountain3D({ x, y, scale = 1, variant = 0 }) {
  const s = scale;
  const colors = [
    { base: '#5D6D7E', mid: '#7F8C8D', snow: '#ECF0F1', shadow: '#34495E' },
    { base: '#6B4E3D', mid: '#8D6E63', snow: '#EFEBE9', shadow: '#4E342E' },
    { base: '#455A64', mid: '#607D8B', snow: '#ECEFF1', shadow: '#263238' },
  ];
  const c = colors[variant % colors.length];
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="8" rx="50" ry="10" fill="rgba(0,0,0,0.12)" />
      <polygon points="-45,8 0,-55 45,8" fill={c.base} />
      <polygon points="-20,8 0,-55 25,8" fill={c.mid} />
      <polygon points="-10,-30 0,-55 10,-30 5,-32 -5,-32" fill={c.snow} />
      <polygon points="-5,-38 0,-55 5,-38" fill="white" opacity="0.7" />
      <polygon points="-45,8 -20,-10 0,-55" fill={c.shadow} opacity="0.25" />
    </g>
  );
}

function Castle3D({ x, y, scale = 1 }) {
  const s = scale;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="8" rx="30" ry="8" fill="rgba(0,0,0,0.15)" />
      <rect x="-22" y="-40" width="44" height="48" fill="#78909C" rx="2" />
      <rect x="-18" y="-35" width="36" height="43" fill="#90A4AE" rx="1" />
      <rect x="-22" y="-48" width="10" height="12" fill="#607D8B" />
      <rect x="12" y="-48" width="10" height="12" fill="#607D8B" />
      <rect x="-22" y="-52" width="4" height="4" fill="#546E7A" />
      <rect x="-14" y="-52" width="4" height="4" fill="#546E7A" />
      <rect x="12" y="-52" width="4" height="4" fill="#546E7A" />
      <rect x="18" y="-52" width="4" height="4" fill="#546E7A" />
      <polygon points="-5,-55 0,-68 5,-55" fill="#B71C1C" />
      <rect x="-1" y="-68" width="2" height="4" fill="#FFD600" />
      <rect x="-6" y="-10" width="12" height="18" fill="#5D4037" rx="6 6 0 0" />
      <rect x="-4" y="-5" width="8" height="13" fill="#4E342E" rx="4 4 0 0" />
      <rect x="-12" y="-22" width="6" height="8" fill="#42A5F5" rx="1" opacity="0.6" />
      <rect x="6" y="-22" width="6" height="8" fill="#42A5F5" rx="1" opacity="0.6" />
      <rect x="-10" y="-20" width="2" height="6" fill="#78909C" />
      <rect x="8" y="-20" width="2" height="6" fill="#78909C" />
      <rect x="-18" y="-35" width="36" height="3" fill="white" opacity="0.15" />
    </g>
  );
}

function House3D({ x, y, scale = 1, variant = 0 }) {
  const s = scale;
  const roofColors = ['#C62828', '#F57F17', '#1565C0', '#2E7D32'];
  const wallColors = ['#FFECB3', '#FFF3E0', '#E8EAF6', '#E8F5E9'];
  const roof = roofColors[variant % roofColors.length];
  const wall = wallColors[variant % wallColors.length];
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="4" rx="14" ry="4" fill="rgba(0,0,0,0.12)" />
      <rect x="-10" y="-14" width="20" height="18" fill={wall} rx="1" />
      <polygon points="-14,-14 0,-26 14,-14" fill={roof} />
      <polygon points="-14,-14 0,-26 0,-14" fill="rgba(0,0,0,0.1)" />
      <rect x="-3" y="-6" width="6" height="10" fill="#5D4037" rx="1" />
      <circle cx="2" cy="-1" r="0.7" fill="#FFD600" />
      <rect x="-8" y="-10" width="3" height="3" fill="#81D4FA" rx="0.5" opacity="0.7" />
      <rect x="5" y="-10" width="3" height="3" fill="#81D4FA" rx="0.5" opacity="0.7" />
      <polygon points="0,-26 0,-14 14,-14" fill="rgba(255,255,255,0.1)" />
    </g>
  );
}

function Rock3D({ x, y, scale = 1, variant = 0 }) {
  const s = scale;
  const colors = ['#78909C', '#8D6E63', '#607D8B'];
  const c = colors[variant % colors.length];
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="3" rx="8" ry="3" fill="rgba(0,0,0,0.15)" />
      <ellipse cx="0" cy="0" rx="7" ry="5" fill={c} />
      <ellipse cx="-1" cy="-2" rx="4" ry="3" fill="rgba(255,255,255,0.12)" />
    </g>
  );
}

function Bush3D({ x, y, scale = 1 }) {
  const s = scale;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="3" rx="8" ry="3" fill="rgba(0,0,0,0.12)" />
      <ellipse cx="-4" cy="0" rx="6" ry="5" fill="#388E3C" />
      <ellipse cx="4" cy="-1" rx="5" ry="4.5" fill="#43A047" />
      <ellipse cx="0" cy="-3" rx="5" ry="4" fill="#4CAF50" />
      <ellipse cx="-2" cy="-4" rx="3" ry="2" fill="#66BB6A" opacity="0.5" />
    </g>
  );
}

function Crystal3D({ x, y, scale = 1 }) {
  const s = scale;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="4" rx="6" ry="2.5" fill="rgba(100,50,200,0.2)" />
      <polygon points="-4,4 -2,-14 2,-16 4,4" fill="#7C4DFF" opacity="0.85" />
      <polygon points="2,4 4,-10 6,-8 6,4" fill="#B388FF" opacity="0.75" />
      <polygon points="-6,4 -5,-8 -3,-12 -2,4" fill="#651FFF" opacity="0.8" />
      <polygon points="-2,-14 0,-16 2,-16 0,-14" fill="white" opacity="0.6" />
      <line x1="-1" y1="-12" x2="1" y2="-4" stroke="white" strokeWidth="0.5" opacity="0.4" />
    </g>
  );
}

function Volcano3D({ x, y, scale = 1 }) {
  const s = scale;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="8" rx="40" ry="10" fill="rgba(0,0,0,0.15)" />
      <polygon points="-38,8 -8,-40 8,-40 38,8" fill="#4E342E" />
      <polygon points="-30,8 -8,-40 8,-40 0,8" fill="#5D4037" />
      <polygon points="-8,-40 8,-40 5,-36 -5,-36" fill="#BF360C" />
      <ellipse cx="0" cy="-38" rx="6" ry="3" fill="#E65100" />
      <ellipse cx="0" cy="-39" rx="4" ry="2" fill="#FF6D00" opacity="0.8" />
      <circle cx="-2" cy="-42" r="2" fill="#FF9100" opacity="0.5" />
      <circle cx="1" cy="-44" r="1.5" fill="#FFAB40" opacity="0.4" />
    </g>
  );
}

function Bridge3D({ x, y, width: bw = 60 }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-bw / 2} y="-4" width={bw} height="8" fill="#8D6E63" rx="2" />
      <rect x={-bw / 2} y="-3" width={bw} height="2" fill="#A1887F" rx="1" opacity="0.5" />
      <rect x={-bw / 2 - 3} y="-12" width="4" height="16" fill="#6D4C41" rx="1" />
      <rect x={bw / 2 - 1} y="-12" width="4" height="16" fill="#6D4C41" rx="1" />
      <line x1={-bw / 2 - 1} y1="-12" x2={bw / 2 + 1} y2="-12" stroke="#795548" strokeWidth="2" />
    </g>
  );
}

function StairBridge3D({ x, y, angle = 0, width = 60, drop = 24 }) {
  const stepCount = 6;
  return (
    <g transform={`translate(${x},${y}) rotate(${angle})`}>
      <ellipse cx="0" cy={drop * 0.45 + 3} rx={width * 0.55} ry="8" fill="rgba(0,0,0,0.28)" />
      {Array.from({ length: stepCount }).map((_, idx) => {
        const t = idx / Math.max(1, stepCount - 1);
        const stepWidth = width * (1 - t * 0.34);
        const stepY = t * drop;
        return (
          <g key={`stair-step-${idx}`}>
            <rect x={-stepWidth / 2} y={stepY - 2} width={stepWidth} height="6" rx="1.5" fill={idx % 2 === 0 ? '#D8CBB2' : '#B7A488'} />
            <rect x={-stepWidth / 2} y={stepY + 3} width={stepWidth} height="4" rx="1.2" fill="#786650" opacity="0.88" />
          </g>
        );
      })}
      <path d={`M ${-width / 2 - 4} -2 Q ${-width / 2 - 8} ${drop * 0.5} ${-width * 0.35} ${drop + 6}`} stroke="#6B5B46" strokeWidth="2.5" fill="none" />
      <path d={`M ${width / 2 + 4} -2 Q ${width / 2 + 8} ${drop * 0.5} ${width * 0.35} ${drop + 6}`} stroke="#6B5B46" strokeWidth="2.5" fill="none" />
    </g>
  );
}

function Cloud3D({ x, y, scale = 1, opacity = 0.7 }) {
  const s = scale;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} opacity={opacity}>
      <ellipse cx="0" cy="0" rx="22" ry="8" fill="white" />
      <ellipse cx="-12" cy="-3" rx="14" ry="9" fill="white" />
      <ellipse cx="10" cy="-2" rx="16" ry="10" fill="white" />
      <ellipse cx="0" cy="-7" rx="12" ry="8" fill="white" />
      <ellipse cx="0" cy="3" rx="20" ry="5" fill="white" opacity="0.5" />
    </g>
  );
}

function WaterBody({ x, y, w, h }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} fill="url(#waterGradient)" opacity="0.7" />
      <ellipse cx={x} cy={y - 2} rx={w / 2 - 4} ry={h / 2 - 3} fill="white" opacity="0.1" />
      <line x1={x - w / 4} y1={y - 1} x2={x + w / 4} y2={y - 1} stroke="white" strokeWidth="0.8" opacity="0.25" />
      <line x1={x - w / 5} y1={y + 3} x2={x + w / 6} y2={y + 3} stroke="white" strokeWidth="0.6" opacity="0.2" />
    </g>
  );
}

function Flower3D({ x, y, color = '#E91E63' }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <line x1="0" y1="0" x2="0" y2="6" stroke="#388E3C" strokeWidth="1" />
      <circle cx="-2" cy="-1" r="1.5" fill={color} opacity="0.8" />
      <circle cx="2" cy="-1" r="1.5" fill={color} opacity="0.8" />
      <circle cx="0" cy="-2.5" r="1.5" fill={color} opacity="0.8" />
      <circle cx="0" cy="0" r="1" fill="#FFF176" />
    </g>
  );
}

function Torch3D({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="-1.5" y="-10" width="3" height="14" fill="#5D4037" rx="0.5" />
      <rect x="-3" y="-10" width="6" height="3" fill="#795548" rx="1" />
      <ellipse cx="0" cy="-14" rx="3.5" ry="5" fill="#FF6D00" opacity="0.7" />
      <ellipse cx="0" cy="-15" rx="2.5" ry="4" fill="#FFAB00" opacity="0.6" />
      <ellipse cx="0" cy="-16" rx="1.5" ry="2.5" fill="#FFD600" opacity="0.7" />
    </g>
  );
}

function GrassClump({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <line x1="-3" y1="0" x2="-4" y2="-6" stroke="#4CAF50" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="0" y1="0" x2="0" y2="-7" stroke="#66BB6A" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="3" y1="0" x2="4" y2="-5" stroke="#43A047" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  );
}

function DeadTree3D({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy="8" rx="18" ry="6" fill="rgba(0,0,0,0.2)" />
      <path d="M 0 6 L -2 -34 L 2 -34 L 4 6 Z" fill="#3B2B24" />
      <path d="M -1 -26 L -16 -42 L -12 -44 L 1 -31 Z" fill="#4A352D" />
      <path d="M 2 -20 L 18 -34 L 20 -30 L 4 -16 Z" fill="#4A352D" />
      <path d="M -2 -14 L -17 -18 L -16 -22 L -1 -18 Z" fill="#5D453A" />
      <circle cx="-14" cy="-43" r="1.7" fill="#6A4A3F" />
      <circle cx="19" cy="-33" r="1.6" fill="#6A4A3F" />
    </g>
  );
}

function BonePile3D({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy="5" rx="16" ry="5" fill="rgba(0,0,0,0.18)" />
      <rect x="-11" y="-3" width="22" height="5" rx="2.5" fill="#D3C3A9" />
      <rect x="-7" y="-8" width="14" height="4" rx="2" fill="#E4D6C2" />
      <circle cx="-9" cy="-1" r="2.8" fill="#CDBA9F" />
      <circle cx="9" cy="-1" r="2.8" fill="#CDBA9F" />
      <circle cx="-5" cy="-6.5" r="1.2" fill="#C2AE92" />
      <circle cx="5" cy="-6.5" r="1.2" fill="#C2AE92" />
    </g>
  );
}

function RuinArch3D({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy="7" rx="22" ry="7" fill="rgba(0,0,0,0.2)" />
      <rect x="-17" y="-22" width="8" height="30" fill="#C2A37C" rx="1.5" />
      <rect x="9" y="-22" width="8" height="30" fill="#AF8F68" rx="1.5" />
      <path d="M -17 -22 Q 0 -40 17 -22 L 11 -22 Q 0 -32 -11 -22 Z" fill="#D4B68D" />
      <rect x="-16" y="-20" width="6" height="2" fill="#9A7B56" opacity="0.5" />
      <rect x="10" y="-20" width="6" height="2" fill="#9A7B56" opacity="0.5" />
    </g>
  );
}

function Obelisk3D({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy="6" rx="12" ry="4.5" fill="rgba(0,0,0,0.18)" />
      <polygon points="-7,6 -3,-24 3,-24 7,6" fill="#B1916A" />
      <polygon points="-3,-24 0,-32 3,-24" fill="#DFC49A" />
      <polygon points="-2,6 1,-24 4,-24 2,6" fill="rgba(255,255,255,0.18)" />
    </g>
  );
}

function Portal3D({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy="8" rx="18" ry="6" fill="rgba(0,0,0,0.22)" />
      <ellipse cx="0" cy="-4" rx="12" ry="16" fill="#3B2D57" />
      <ellipse cx="0" cy="-4" rx="8" ry="12" fill="#6F5AC7" opacity="0.9" />
      <ellipse cx="0" cy="-4" rx="5.5" ry="8.2" fill="#A48BFF" opacity="0.8" />
      <ellipse cx="0" cy="-8" rx="2.2" ry="2.5" fill="#FFFFFF" opacity="0.55" />
    </g>
  );
}

function LavaVent3D({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy="8" rx="16" ry="6" fill="rgba(0,0,0,0.2)" />
      <path d="M -14 8 L -7 -16 L 7 -16 L 14 8 Z" fill="#5B2B21" />
      <ellipse cx="0" cy="-16" rx="7" ry="3.5" fill="#2E130D" />
      <ellipse cx="0" cy="-16" rx="4.8" ry="2.1" fill="#FF8A36" />
      <ellipse cx="-1" cy="-17" rx="2.2" ry="1.2" fill="#FFD18B" opacity="0.75" />
    </g>
  );
}

/* ── Biome scene generators ───────────────────────────────────────── */

function generateChildScenery(points) {
  const items = [];
  const seed = (i) => ((i * 7919 + 104729) % 100) / 100;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const s = seed(i);
    const side = p.x > 500 ? -1 : 1;
    const ox = side * (120 + s * 160);

    if (i % 2 === 0) {
      items.push(<DeadTree3D key={`ct-${i}`} x={p.x + ox} y={p.y + 16} scale={1 + s * 0.45} />);
    }
    if (i % 3 === 1) {
      items.push(<BonePile3D key={`cb-${i}`} x={p.x - ox * 0.55} y={p.y + 20} scale={0.95 + s * 0.35} />);
    }
    if (i % 4 === 0) {
      items.push(<Portal3D key={`ch-${i}`} x={p.x + ox * 1.1} y={p.y - 4} scale={0.85 + s * 0.3} />);
    }
    if (i % 5 === 2) {
      items.push(<Crystal3D key={`cf-${i}`} x={p.x + side * 62} y={p.y + 18} scale={0.92 + s * 0.45} />);
    }
    if (i % 6 === 0) {
      items.push(<Rock3D key={`cg-${i}`} x={p.x - ox * 0.32} y={p.y + 24} scale={0.85 + s * 0.4} variant={i % 3} />);
    }
  }
  return items;
}

function generateAdolescentScenery(points) {
  const items = [];
  const seed = (i) => ((i * 6271 + 81239) % 100) / 100;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const s = seed(i);
    const side = p.x > 500 ? -1 : 1;
    const ox = side * (130 + s * 140);

    if (i % 2 === 0) {
      items.push(<RuinArch3D key={`at-${i}`} x={p.x + ox} y={p.y + 10} scale={1.08 + s * 0.35} />);
    }
    if (i % 3 === 1) {
      items.push(<Obelisk3D key={`ar-${i}`} x={p.x - ox * 0.6} y={p.y + 16} scale={0.95 + s * 0.5} />);
    }
    if (i % 4 === 2) {
      items.push(<Bridge3D key={`abr-${i}`} x={p.x + ox * 0.35} y={p.y + 8} width={70 + s * 28} />);
    }
    if (i % 5 === 0) {
      items.push(<Rock3D key={`am-${i}`} x={p.x + ox * 1.05} y={p.y + 14} scale={1.18 + s * 0.55} variant={i % 3} />);
    }
  }
  return items;
}

function generateAdultScenery(points) {
  const items = [];
  const seed = (i) => ((i * 5381 + 52711) % 100) / 100;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const s = seed(i);
    const side = p.x > 500 ? -1 : 1;
    const ox = side * (120 + s * 170);

    if (i % 2 === 0) {
      items.push(<Volcano3D key={`ec-${i}`} x={p.x + ox} y={p.y + 6} scale={0.82 + s * 0.44} />);
    }
    if (i % 3 === 1) {
      items.push(<LavaVent3D key={`et-${i}`} x={p.x - ox * 0.55} y={p.y + 14} scale={0.9 + s * 0.38} />);
    }
    if (i % 4 === 2) {
      items.push(<Mountain3D key={`ev-${i}`} x={p.x + ox * 1.1} y={p.y - 12} scale={0.86 + s * 0.36} variant={i % 3} />);
    }
    if (i % 5 === 0 || i === points.length - 1) {
      items.push(<Torch3D key={`eca-${i}`} x={p.x - ox * 0.2} y={p.y + 10} />);
    }
  }
  return items;
}

/* ── Faux-3D island props (2.5D sprites) ─────────────────────────── */

function seededValue(i, salt = 1) {
  return ((i * 92821 + salt * 337 + 97) % 1000) / 1000;
}

function buildIslandProps(island, zonePoints) {
  if (!island || !Array.isArray(zonePoints) || zonePoints.length === 0) return [];
  const props = [];
  const maxProps = island.id === 'haunted' ? 24 : 20;

  for (let i = 0; i < zonePoints.length; i++) {
    const point = zonePoints[i];
    const seed = seededValue(i + island.start * 11, island.end + 9);
    const localX = clamp((point.x - island.left) / island.widthPx, 0.09, 0.91);
    const localY = clamp((point.y - island.top) / island.heightPx, 0.1, 0.9);
    const laneBias = (i % 2 === 0 ? -1 : 1) * (0.12 + seed * 0.1);
    const x = clamp(localX + laneBias, 0.06, 0.94);
    const y = clamp(localY + (seed - 0.5) * 0.06, 0.08, 0.94);

    if (island.id === 'volcanic') {
      props.push({
        id: `${island.id}-mountain-${i}`,
        type: 'mountain',
        x,
        y,
        scale: 1 + seed * 1.05,
        variant: i % 3,
      });
      if (i % 2 === 0) {
        props.push({
          id: `${island.id}-spire-${i}`,
          type: 'spire',
          x: clamp(localX - laneBias * 0.5, 0.08, 0.92),
          y: clamp(y + 0.06, 0.1, 0.95),
          scale: 0.84 + seed * 0.72,
          variant: (i + 1) % 3,
        });
      }
    } else if (island.id === 'ruins') {
      props.push({
        id: `${island.id}-mountain-${i}`,
        type: 'mountain',
        x,
        y,
        scale: 0.82 + seed * 0.88,
        variant: i % 3,
      });
      if (i % 3 === 1) {
        props.push({
          id: `${island.id}-arch-${i}`,
          type: 'arch',
          x: clamp(localX + laneBias * 0.35, 0.06, 0.94),
          y: clamp(localY + 0.04, 0.08, 0.95),
          scale: 0.8 + seed * 0.75,
          variant: (i + 2) % 3,
        });
      }
    } else {
      props.push({
        id: `${island.id}-mountain-${i}`,
        type: 'mountain',
        x,
        y,
        scale: 0.9 + seed * 0.95,
        variant: i % 3,
      });
      if (i % 3 === 0) {
        props.push({
          id: `${island.id}-tree-${i}`,
          type: 'tree',
          x: clamp(localX - laneBias * 0.45, 0.07, 0.93),
          y: clamp(localY + 0.03, 0.08, 0.94),
          scale: 0.78 + seed * 0.62,
          variant: (i + 1) % 3,
        });
      }
    }

    if (props.length >= maxProps) break;
  }

  return props.slice(0, maxProps);
}

function FauxPropSprite({ prop }) {
  const style = {
    left: `${(prop.x * 100).toFixed(2)}%`,
    top: `${(prop.y * 100).toFixed(2)}%`,
    width: `${Math.round(34 * prop.scale)}px`,
    height: `${Math.round(34 * prop.scale)}px`,
  };

  if (prop.type === 'tree') {
    return (
      <div className={`title-prop-sprite variant-${prop.variant || 0}`} style={style}>
        <svg viewBox="0 0 60 70" className="w-full h-full">
          <path d="M30 66 L24 30 L36 30 L30 66 Z" fill="#3f2d25" />
          <path d="M8 42 L30 6 L52 42 Z" fill="#406748" />
          <path d="M16 42 L30 15 L44 42 Z" fill="#6ea071" />
        </svg>
      </div>
    );
  }

  if (prop.type === 'arch') {
    return (
      <div className={`title-prop-sprite variant-${prop.variant || 0}`} style={style}>
        <svg viewBox="0 0 60 60" className="w-full h-full">
          <rect x="10" y="26" width="10" height="28" rx="2" fill="#9f7b55" />
          <rect x="40" y="26" width="10" height="28" rx="2" fill="#846445" />
          <path d="M10 26 Q30 6 50 26 L43 26 Q30 14 17 26 Z" fill="#c6a27b" />
        </svg>
      </div>
    );
  }

  if (prop.type === 'spire') {
    return (
      <div className={`title-prop-sprite variant-${prop.variant || 0}`} style={style}>
        <svg viewBox="0 0 60 60" className="w-full h-full">
          <polygon points="30,6 12,54 48,54" fill="#5a2a20" />
          <polygon points="30,6 30,54 48,54" fill="#3b1a15" />
          <ellipse cx="30" cy="8" rx="6" ry="4" fill="#ff8f3d" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`title-prop-sprite variant-${prop.variant || 0}`} style={style}>
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <polygon points="30,4 6,52 54,52" fill="#8f7457" />
        <polygon points="30,4 30,52 54,52" fill="#6e5740" />
        <line x1="30" y1="5" x2="30" y2="52" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/* ── Road path generation using smooth curves ─────────────────────── */

function buildRoadPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/* ── Journey Character (3D styled) ────────────────────────────────── */

function JourneyCharacter({ running, avatarUrl, username, gender }) {
  const isFemale = gender === 'female';
  return (
    <div className={`relative w-14 h-16 ${running ? 'title-run' : 'title-idle'}`}>
      <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-10 h-3 rounded-full bg-black/40 blur-[2px]" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-10 h-10 rounded-full border-[3px] border-white/90 overflow-hidden bg-gradient-to-br from-slate-200 to-slate-500"
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.3)' }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={username || 'avatar'} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-display font-bold text-sm text-black">
            {(username || '?')[0].toUpperCase()}
          </div>
        )}
      </div>
      <div className={`absolute left-1/2 -translate-x-1/2 top-[38px] w-8 h-7 rounded-md ${
        isFemale ? 'bg-gradient-to-b from-pink-400 to-fuchsia-700' : 'bg-gradient-to-b from-cyan-400 to-blue-700'
      }`} style={{ boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.3)' }} />
      <div className="absolute left-[30%] top-[72%] w-3 h-4 rounded-b bg-slate-700" style={{ boxShadow: '0 2px 3px rgba(0,0,0,0.3)' }} />
      <div className="absolute left-[55%] top-[72%] w-3 h-4 rounded-b bg-slate-700" style={{ boxShadow: '0 2px 3px rgba(0,0,0,0.3)' }} />
    </div>
  );
}

/* ── Waypoint Node (3D styled) ────────────────────────────────────── */

function WaypointNode({
  title,
  point,
  width,
  isCurrent,
  isProgressNode,
  isMilestone,
  isTarget,
  onClick,
}) {
  const unlocked = !!title.unlocked;
  const levelLabel = titleLevelLabel(title);
  const palette = TIER_PALETTE[title.tier] || TIER_PALETTE.default;
  const ratioX = point.x / width;
  const labelPositionClass = ratioX < 0.18
    ? 'left-[3px]'
    : ratioX > 0.82
      ? 'right-[3px]'
      : 'left-1/2 -translate-x-1/2';
  const sizeClass = isMilestone ? 'w-14 h-14 border-[4px]' : 'w-12 h-12 border-[3px]';
  const lockedStoneBackground = {
    backgroundImage: 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.28), rgba(255,255,255,0) 42%), repeating-radial-gradient(circle at 50% 48%, rgba(157,167,176,0.16) 0 2px, rgba(0,0,0,0) 2px 6px), linear-gradient(180deg, #515d69, #2a3340)',
  };
  const unlockedBackground = {
    backgroundImage: `radial-gradient(circle at 26% 24%, rgba(255,255,255,0.45), rgba(255,255,255,0) 46%), linear-gradient(180deg, var(--tw-gradient-stops))`,
  };

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(point.x / width) * 100}%`, top: `${point.y}px` }}
    >
      <button
        type="button"
        onClick={onClick}
        className={`title-node-3d relative ${sizeClass} rounded-full transition-all ${
          unlocked
            ? `bg-gradient-to-b ${palette.bg} border-white/90 text-white title-waypoint-glow-3d`
            : 'border-slate-500/80 text-slate-300'
        } ${isCurrent ? `ring-[3px] ring-cyan-200/90 scale-110` : ''} ${
          isTarget ? 'ring-[3px] ring-cyan-300/90' : ''
        } cursor-pointer hover:scale-115`}
        style={unlocked ? unlockedBackground : lockedStoneBackground}
        title={`${levelLabel} (${title.name}) — ${title.earned_points.toLocaleString()} / ${title.required_points.toLocaleString()}`}
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 to-transparent pointer-events-none" style={{ height: '50%' }} />
        <span className="absolute inset-0 rounded-full pointer-events-none bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,0.45),rgba(255,255,255,0)_58%)]" />
        <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border ${
          unlocked ? 'bg-white/20 border-white/70' : 'bg-slate-500/35 border-slate-300/60'
        }`} style={{ boxShadow: '0 0 8px rgba(255,255,255,0.35)' }} />
        <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${
          unlocked ? 'bg-amber-300' : 'bg-slate-200/60'
        }`} />
        {isMilestone && (
          <span className="absolute -inset-1 rounded-full border border-amber-200/65 pointer-events-none"
            style={{ boxShadow: '0 0 14px rgba(255, 186, 80, 0.45)' }} />
        )}
        {isProgressNode && (
          <span className="absolute -left-1 -top-1 w-4 h-4 rounded-full border border-white/70 bg-gradient-to-b from-amber-300 to-amber-600 flex items-center justify-center text-[8px] text-amber-950 font-bold">
            ★
          </span>
        )}
        <span className="sr-only">
          {`${levelLabel} ${title.name}`}
        </span>
        {!unlocked && (
          <span className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full border-2 border-slate-400 bg-slate-700 flex items-center justify-center z-20"
            style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            <span className="text-[8px]">🔒</span>
          </span>
        )}
      </button>
      <div className={`absolute ${labelPositionClass} top-[56px] px-2.5 py-1 rounded-md text-[9px] leading-tight font-display font-bold max-w-[148px] whitespace-normal ${
        unlocked ? 'bg-black/72 text-white border border-white/35' : 'bg-black/55 text-slate-300 border border-slate-500/45'
      }`} style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.35)' }}>
        {levelLabel}
      </div>
    </div>
  );
}

function createTextSprite(text, options = {}) {
  const {
    bg = 'rgba(10, 18, 44, 0.86)',
    fg = '#FFFFFF',
    stroke = 'rgba(255, 255, 255, 0.24)',
    fontSize = 24,
    paddingX = 18,
    paddingY = 12,
  } = options;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontFamily = '"Cinzel","Trebuchet MS",serif';
  const font = `700 ${fontSize}px ${fontFamily}`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textW = Math.ceil(metrics.width);
  const w = textW + paddingX * 2;
  const h = fontSize + paddingY * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  const radius = 14;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(w - radius, 0);
  ctx.quadraticCurveTo(w, 0, w, radius);
  ctx.lineTo(w, h - radius);
  ctx.quadraticCurveTo(w, h, w - radius, h);
  ctx.lineTo(radius, h);
  ctx.quadraticCurveTo(0, h, 0, h - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, paddingX, h / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(w / 20, h / 20, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function createProp(type, position, colorSet = {}) {
  const group = new THREE.Group();
  group.position.copy(position);
  let mesh = null;
  if (type === 'mountain') {
    const geo = new THREE.ConeGeometry(1.1, 2.8, 5);
    const mat = new THREE.MeshStandardMaterial({ color: colorSet.main || '#7A6554', roughness: 0.9, metalness: 0.08 });
    mesh = new THREE.Mesh(geo, mat);
    const splitGeo = new THREE.ConeGeometry(0.95, 2.6, 3, 1, true);
    const splitMat = new THREE.MeshStandardMaterial({ color: colorSet.shade || '#5A493B', roughness: 0.95 });
    const split = new THREE.Mesh(splitGeo, splitMat);
    split.rotation.y = Math.PI * 0.14;
    split.position.y = 0.05;
    group.add(split);
  } else if (type === 'ruin') {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.05, 0.75, 10),
      new THREE.MeshStandardMaterial({ color: colorSet.main || '#A98C69', roughness: 0.92 })
    );
    base.position.y = 0.37;
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.25, 8),
      new THREE.MeshStandardMaterial({ color: colorSet.shade || '#7E654A', roughness: 0.94 })
    );
    top.position.y = 1.2;
    group.add(base, top);
  } else {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 1.25, 8),
      new THREE.MeshStandardMaterial({ color: '#4B3628', roughness: 0.95 })
    );
    trunk.position.y = 0.6;
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.1, 7),
      new THREE.MeshStandardMaterial({ color: colorSet.main || '#3D6E4A', roughness: 0.9 })
    );
    canopy.position.y = 1.9;
    group.add(trunk, canopy);
  }
  if (mesh) group.add(mesh);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Placeholder architecture: this function can swap to GLTFLoader meshes later.
  return group;
}

function ThreeProgressMap({
  width,
  height,
  points,
  titles,
  biomeZones,
  cursor,
  mapScrollTop,
  mapViewportHeight,
  currentIndex,
  onNodeSelect,
}) {
  const hostRef = useRef(null);
  const onNodeSelectRef = useRef(onNodeSelect);
  const liveRef = useRef({
    cursor,
    mapScrollTop,
    mapViewportHeight,
  });

  useEffect(() => {
    onNodeSelectRef.current = onNodeSelect;
  }, [onNodeSelect]);

  useEffect(() => {
    liveRef.current = { cursor, mapScrollTop, mapViewportHeight };
  }, [cursor, mapScrollTop, mapViewportHeight]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !points.length) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0f1224, 70, 165);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-26, 26, 20, -20, 0.1, 420);
    camera.position.set(50, 50, 50);
    camera.lookAt(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0x9fb4ff, 0.7);
    scene.add(ambientLight);
    const sun = new THREE.DirectionalLight(0xfff1d4, 1.05);
    sun.position.set(36, 54, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 180;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    scene.add(sun);

    const zoneHeights = { haunted: 3.2, ruins: 16.4, volcanic: 29.6 };
    const worldPoints = points.map((point, index) => {
      const t = points.length <= 1 ? 0 : index / (points.length - 1);
      const zone = biomeZones.find((candidate) => index >= candidate.start && index <= candidate.end) || biomeZones[0];
      const x = ((point.x / width) - 0.5) * 34;
      const y = (zoneHeights[zone?.id] || 6) + Math.sin(index * 0.42) * 0.16;
      const z = THREE.MathUtils.lerp(16, -86, t);
      return new THREE.Vector3(x, y, z);
    });

    biomeZones.forEach((zone) => {
      const zoneSlice = worldPoints.slice(zone.start, zone.end + 1);
      const center = zoneSlice.reduce((acc, point) => acc.add(point), new THREE.Vector3()).multiplyScalar(1 / zoneSlice.length);
      const span = Math.max(6, zoneSlice.length * 2.9);
      const thickness = zone.id === 'haunted' ? 7.8 : zone.id === 'ruins' ? 7.2 : 6.8;
      const topColor = zone.id === 'haunted' ? '#527B67' : zone.id === 'ruins' ? '#B08354' : '#BC5541';
      const sideColor = zone.id === 'haunted' ? '#2B4339' : zone.id === 'ruins' ? '#5A3A24' : '#4E221F';

      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(span * 0.88, span * 1.04, thickness, 8),
        new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.9, metalness: 0.05 })
      );
      top.position.set(center.x + (zone.id === 'volcanic' ? 1.4 : zone.id === 'haunted' ? -1.1 : 0), center.y - thickness / 2, center.z);
      top.castShadow = true;
      top.receiveShadow = true;
      scene.add(top);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(span * 0.85, span * 0.9, 0.7, 8),
        new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.95, metalness: 0.02 })
      );
      rim.position.set(top.position.x, center.y + 0.01, top.position.z);
      rim.castShadow = true;
      rim.receiveShadow = true;
      scene.add(rim);

      const propColorSet = zone.id === 'volcanic'
        ? { main: '#7A3228', shade: '#4A1F19' }
        : zone.id === 'ruins'
          ? { main: '#B89A75', shade: '#7C6249' }
          : { main: '#466B53', shade: '#2E4738' };
      for (let i = 0; i < zoneSlice.length; i += 2) {
        const basePoint = zoneSlice[i];
        const offset = i % 4 === 0 ? 2.8 : -2.4;
        const propPos = new THREE.Vector3(basePoint.x + offset, basePoint.y + 0.2, basePoint.z + (i % 3 === 0 ? 2 : -2));
        const propType = zone.id === 'ruins' ? 'ruin' : zone.id === 'volcanic' ? 'mountain' : 'tree';
        const prop = createProp(propType, propPos, propColorSet);
        scene.add(prop);
      }
    });

    const pathCurve = new THREE.CatmullRomCurve3(worldPoints, false, 'catmullrom', 0.25);
    const pathMesh = new THREE.Mesh(
      new THREE.TubeGeometry(pathCurve, Math.max(100, points.length * 14), 0.6, 14, false),
      new THREE.MeshStandardMaterial({
        color: 0xffd57c,
        emissive: 0xffa84e,
        emissiveIntensity: 0.7,
        roughness: 0.28,
        metalness: 0.08,
      })
    );
    pathMesh.castShadow = true;
    pathMesh.receiveShadow = true;
    pathMesh.renderOrder = 1;
    scene.add(pathMesh);

    const nodeMeshes = [];
    titles.forEach((title) => {
      const point = worldPoints[title.index];
      if (!point) return;
      const unlocked = title.index <= currentIndex;
      const node = new THREE.Mesh(
        new THREE.CylinderGeometry(title.index % 8 === 0 ? 1.45 : 1.12, title.index % 8 === 0 ? 1.45 : 1.12, 0.42, 28),
        new THREE.MeshStandardMaterial({
          color: unlocked ? '#f2f5ff' : '#6b7382',
          emissive: unlocked ? '#f4be61' : '#1f2733',
          emissiveIntensity: unlocked ? 0.44 : 0.08,
          roughness: 0.4,
          metalness: 0.3,
        })
      );
      node.position.set(point.x, point.y + 0.7, point.z);
      node.castShadow = true;
      node.receiveShadow = true;
      node.renderOrder = 6;
      node.userData = { titleIndex: title.index };
      scene.add(node);
      nodeMeshes.push(node);

      const label = createTextSprite(`${title.name} • ${titleLevelLabel(title)}`, {
        bg: unlocked ? 'rgba(13, 20, 52, 0.84)' : 'rgba(26, 28, 36, 0.86)',
        fg: unlocked ? '#FFFFFF' : '#D2DAE6',
      });
      label.position.set(point.x, point.y + 2.5, point.z);
      scene.add(label);
    });

    const familyAnchors = ['Intermediate', 'Advanced', 'Expert', 'The Master', 'Master']
      .map((family) => {
        const anchor = titles
          .filter((title) => familyName(title) === family)
          .sort((a, b) => a.index - b.index)[0];
        if (!anchor) return null;
        const anchorPoint = worldPoints[anchor.index];
        if (!anchorPoint) return null;
        const sprite = createTextSprite(family === 'Master' ? 'The Master' : family, {
          bg: 'rgba(58, 26, 20, 0.82)',
          fg: '#FFE6BC',
          fontSize: 28,
          paddingX: 24,
          paddingY: 12,
        });
        sprite.position.set(anchorPoint.x + 3.2, anchorPoint.y + 4.4, anchorPoint.z - 0.8);
        scene.add(sprite);
        return sprite;
      })
      .filter(Boolean);

    const avatar = new THREE.Group();
    const avatarBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 1.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x3f7df0, roughness: 0.35, metalness: 0.2 })
    );
    avatarBody.position.y = 0.8;
    const avatarHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xf4d4c1, roughness: 0.5, metalness: 0.02 })
    );
    avatarHead.position.y = 1.75;
    avatar.add(avatarBody, avatarHead);
    avatar.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    scene.add(avatar);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(nodeMeshes, false)[0];
      if (!hit) return;
      const titleIndex = hit.object?.userData?.titleIndex;
      const target = titles.find((title) => title.index === titleIndex);
      if (target && onNodeSelectRef.current) onNodeSelectRef.current(target);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onResize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      const aspect = w / h;
      const frustumSize = 48;
      camera.left = (-frustumSize * aspect) / 2;
      camera.right = (frustumSize * aspect) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = -frustumSize / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    onResize();
    window.addEventListener('resize', onResize);

    const camStart = new THREE.Vector3(44, 28, 40);
    const camEnd = new THREE.Vector3(44, 60, -26);
    const lookStart = new THREE.Vector3(0, 5, 14);
    const lookEnd = new THREE.Vector3(0, 28, -66);
    const workLook = new THREE.Vector3();
    const workCam = new THREE.Vector3();

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const live = liveRef.current;
      const denom = Math.max(1, height - Math.max(1, live.mapViewportHeight || 1));
      const scrollT = clamp((live.mapScrollTop || 0) / denom, 0, 1);
      workCam.lerpVectors(camStart, camEnd, scrollT);
      workLook.lerpVectors(lookStart, lookEnd, scrollT);
      camera.position.copy(workCam);
      camera.lookAt(workLook);

      const pathT = points.length <= 1 ? 0 : clamp((live.cursor || 0) / (points.length - 1), 0, 1);
      const avatarPos = pathCurve.getPoint(pathT);
      avatar.position.set(avatarPos.x, avatarPos.y + 0.9, avatarPos.z);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      scene.traverse((obj) => {
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((material) => {
            if (material.map) material.map.dispose?.();
            material.dispose?.();
          });
        }
        if (obj.geometry) obj.geometry.dispose?.();
      });
      host.removeChild(renderer.domElement);
      renderer.dispose();
      familyAnchors.length = 0;
    };
  }, [points, titles, biomeZones, width, height, currentIndex]);

  return (
    <div className="sticky top-0 w-full h-[68vh] sm:h-[74vh] pointer-events-auto">
      <div ref={hostRef} className="w-full h-full" />
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */

export default function TitleProgressTab({
  data,
  avatarUrl,
  username,
  gender = '',
  isOwner = false,
}) {
  const imported = !!data?.imported;
  const titles = useMemo(() => (Array.isArray(data?.titles) ? data.titles : []), [data]);
  const groups = useMemo(() => groupTitles(titles), [titles]);
  const summary = data?.summary || null;
  const currentIndex = Math.max(0, parseInt(summary?.current_index, 10) || 0);
  const nextTitle = summary?.next_title || null;
  const segmentProgress = clamp((Number(summary?.segment_progress_percent) || 0) / 100, 0, 1);
  const currentFloat = currentIndex + (nextTitle ? segmentProgress : 0);
  const [cursor, setCursor] = useState(currentFloat);
  const [anchoredIndex, setAnchoredIndex] = useState(null);
  const [target, setTarget] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [speech, setSpeech] = useState(null);
  const [journeyMode, setJourneyMode] = useState('inspect');
  const [activeJourneyTitle, setActiveJourneyTitle] = useState(null);
  const mapScrollRef = useRef(null);
  const scrollRafRef = useRef(null);
  const speechTimeoutRef = useRef(null);
  const chatterIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [mapScrollTop, setMapScrollTop] = useState(0);
  const [mapViewportHeight, setMapViewportHeight] = useState(0);

  function clearSpeechTimer() {
    if (!speechTimeoutRef.current) return;
    clearTimeout(speechTimeoutRef.current);
    speechTimeoutRef.current = null;
  }

  function say(text, duration = 1700) {
    const line = String(text || '').trim();
    if (!line) return;
    setSpeech({ key: `${Date.now()}-${Math.random()}`, text: line });
    clearSpeechTimer();
    if (duration > 0) {
      speechTimeoutRef.current = setTimeout(() => setSpeech(null), duration);
    }
  }

  function playNodeTouchSound(unlocked) {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = unlocked ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(unlocked ? 620 : 390, now);
      osc.frequency.exponentialRampToValueAtTime(unlocked ? 920 : 520, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch {}
  }

  useEffect(() => {
    if (target !== null) return;
    if (anchoredIndex !== null) {
      setCursor(anchoredIndex);
      return;
    }
    setCursor(currentFloat);
  }, [anchoredIndex, currentFloat, target]);

  useEffect(() => {
    if (target === null) return undefined;
    let raf = null;
    let active = true;
    const animate = () => {
      setCursor((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.015) {
          if (active) setTarget(null);
          return target;
        }
        const step = Math.min(0.11, Math.max(0.03, Math.abs(diff) * 0.18));
        return prev + Math.sign(diff) * step;
      });
      if (active) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      active = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target]);

  useEffect(() => {
    if (target === null) {
      if (chatterIntervalRef.current) {
        clearInterval(chatterIntervalRef.current);
        chatterIntervalRef.current = null;
      }
      return undefined;
    }
    const lines = journeyMode === 'forward'
      ? FORWARD_TRAVEL_LINES
      : (journeyMode === 'scout' ? LOCKED_TRAVEL_LINES : INSPECT_TRAVEL_LINES);
    chatterIntervalRef.current = setInterval(() => {
      say(pickRandomLine(lines, 'On the move...'), 1200);
    }, 1400);
    return () => {
      if (chatterIntervalRef.current) {
        clearInterval(chatterIntervalRef.current);
        chatterIntervalRef.current = null;
      }
    };
  }, [target, journeyMode]);

  const levels = Array.isArray(data?.levels) ? data.levels : [];
  const levelMap = useMemo(() => {
    const map = {};
    for (const level of levels) map[level.level] = level;
    return map;
  }, [levels]);

  useEffect(() => {
    if (target !== null || !activeJourneyTitle) return;
    const title = activeJourneyTitle;
    const level = parseInt(title?.level, 10) || 0;
    const requiredPoints = parseInt(title?.required_points, 10) || 0;
    const aaPerClear = (parseInt(levelMap[level]?.aa_points_per_clear, 10) || LEVEL_AA_CLEAR_POINTS[level] || 0);
    const passes = level > 0 && requiredPoints > 0 && aaPerClear > 0 ? Math.ceil(requiredPoints / aaPerClear) : 0;
    const shortTitle = titleLevelLabel(title);

    if (level <= 0 || requiredPoints <= 0) {
      say(`I'm ${shortTitle}. Remember where the journey began?`, 2500);
      setActiveJourneyTitle(null);
      return;
    }

    if (title.unlocked) {
      const remind = fillTemplate(
        pickRandomLine(ACHIEVED_REMINISCE_LINES, "I'm {title}, remember me?"),
        { title: shortTitle }
      );
      const reflection = fillTemplate(
        pickRandomLine(ACHIEVED_GRATITUDE_LINES, 'Wow! I needed {passes} passes at Level {level} to get this.'),
        { passes: Math.max(1, passes).toLocaleString(), level }
      );
      say(`${remind} ${reflection}`, 3200);
      setActiveJourneyTitle(null);
      return;
    }

    const lockedLine = fillTemplate(
      pickRandomLine(LOCKED_REFLECTION_LINES, 'Future target: {passes} passes at Level {level}.'),
      { passes: Math.max(1, passes).toLocaleString(), level }
    );
    say(`${shortTitle} is still ahead. ${lockedLine}`, 3000);
    setActiveJourneyTitle(null);
  }, [target, activeJourneyTitle, levelMap]);

  useEffect(() => () => {
    clearSpeechTimer();
    if (chatterIntervalRef.current) clearInterval(chatterIntervalRef.current);
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    const el = mapScrollRef.current;
    if (!el) return undefined;
    const update = () => setMapViewportHeight(el.clientHeight || 0);
    update();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(el);
    }
    window.addEventListener('resize', update);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [titles.length]);

  useEffect(() => {
    if (!groups.length || Object.keys(collapsedGroups).length > 0) return;
    const currentFamily = summary?.current_title?.skill_family || '';
    const initial = {};
    for (const group of groups) initial[group.family] = group.family !== currentFamily;
    setCollapsedGroups(initial);
  }, [groups, collapsedGroups, summary]);

  useEffect(() => {
    if (titles.length === 0) return;
    setAnchoredIndex((prev) => {
      if (prev === null) return null;
      const bounded = clamp(prev, 0, titles.length - 1);
      return bounded === prev ? prev : bounded;
    });
  }, [titles.length]);

  const { points, width, height } = useMemo(() => buildWorldPoints(titles.length || 1), [titles.length]);
  const avatarPos = useMemo(() => interpolatePoint(points, cursor), [points, cursor]);

  const nextLevelPoints = nextTitle ? (levelMap[nextTitle.level]?.points || 0) : 0;
  const sameLevelSegment = nextTitle && summary?.current_title?.level === nextTitle.level;
  const segmentStart = sameLevelSegment ? (summary?.current_title?.required_points || 0) : 0;
  const segmentEarned = Math.max(0, nextLevelPoints - segmentStart);
  const segmentNeeded = nextTitle ? Math.max(1, nextTitle.required_points - segmentStart) : 0;
  const displayedProgress = nextTitle ? clamp(Number(summary?.segment_progress_percent) || 0, 0, 100) : 100;

  const biomeZones = useMemo(() => buildBiomeZones(points), [points]);
  const avatarNodeIndex = titles.length > 0 ? clamp(Math.round(cursor), 0, titles.length - 1) : 0;

  const activeNodeTitle = useMemo(() => {
    if (!titles.length) return null;
    if (anchoredIndex !== null) {
      return titles.find((title) => title.index === anchoredIndex) || null;
    }
    if (target !== null) {
      const index = clamp(Math.round(target), 0, titles.length - 1);
      return titles[index] || null;
    }
    return titles[avatarNodeIndex] || null;
  }, [titles, anchoredIndex, target, avatarNodeIndex]);

  const nodeBubbleText = useMemo(() => {
    if (!activeNodeTitle) return '';
    const progressPct = Number(activeNodeTitle?.progress_percent) || 0;
    const status = activeNodeTitle.unlocked ? 'cleared' : 'locked';
    return `${titleLevelLabel(activeNodeTitle)} ${status}. ${activeNodeTitle.earned_points.toLocaleString()} / ${activeNodeTitle.required_points.toLocaleString()} pts (${progressPct.toFixed(1)}%).`;
  }, [activeNodeTitle]);

  function handleTitleTap(title) {
    if (!title) return;
    if (title.index > currentIndex) {
      const safeCurrent = titles[clamp(currentIndex, 0, Math.max(0, titles.length - 1))] || summary?.current_title || null;
      playNodeTouchSound(false);
      setAnchoredIndex(currentIndex);
      setTarget(currentIndex);
      setJourneyMode('inspect');
      setActiveJourneyTitle(safeCurrent);
      say(
        `You can only travel up to ${titleLevelLabel(safeCurrent)}. Earn more points to unlock ${titleLevelLabel(title)}.`,
        2200
      );
      return;
    }
    const unlocked = !!title.unlocked;
    const movingForward = title.index > (cursor + 0.08);
    const mode = unlocked ? (movingForward ? 'forward' : 'inspect') : 'scout';
    setJourneyMode(mode);
    setActiveJourneyTitle({ ...title });
    setAnchoredIndex(title.index);
    setTarget(title.index);
    playNodeTouchSound(unlocked);
    say(
      mode === 'forward'
        ? pickRandomLine(FORWARD_START_LINES, 'Onwards!')
        : (mode === 'scout'
          ? pickRandomLine(LOCKED_TRAVEL_LINES, 'Scouting ahead.')
          : pickRandomLine(INSPECT_START_LINES, 'Let us inspect this one.')),
      1400
    );
  }

  function returnToLiveCheckpoint() {
    setAnchoredIndex(null);
    setJourneyMode('forward');
    setTarget(currentFloat);
    say('Returning to your live checkpoint.', 1500);
  }

  function handleMapScroll(event) {
    const nextTop = event.currentTarget.scrollTop;
    const nextViewHeight = event.currentTarget.clientHeight || 0;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      setMapScrollTop(nextTop);
      setMapViewportHeight(nextViewHeight);
      scrollRafRef.current = null;
    });
  }

  useEffect(() => {
    const el = mapScrollRef.current;
    if (!el || !height) return;
    const viewHeight = el.clientHeight;
    const contentHeight = el.scrollHeight;
    const wanted = clamp(avatarPos.y - viewHeight * 0.52, 0, Math.max(0, contentHeight - viewHeight));
    const behavior = target !== null ? 'smooth' : 'auto';
    if (Math.abs(el.scrollTop - wanted) > 8) {
      el.scrollTo({ top: wanted, behavior });
    }
  }, [avatarPos.y, target, height]);

  if (!data) {
    return (
      <div className="card">
        <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
        <p className="text-sm text-gray-500 mt-3">Loading title progression...</p>
      </div>
    );
  }

  if (!imported) {
    return (
      <div className="card">
        <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
        <p className="text-sm text-gray-400 mt-3">
          Import best scores to unlock and track title progression.
        </p>
      </div>
    );
  }

  if (!summary || titles.length === 0) {
    return (
      <div className="card">
        <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
        <p className="text-sm text-gray-500 mt-3">No title data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress Summary Card */}
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
            <p className="text-xs text-gray-500 mt-1">
              {summary.current_title ? titleLevelLabel(summary.current_title) : 'Title Level 1'}
              {nextTitle ? ` → ${titleLevelLabel(nextTitle)}` : ' → Completed'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-display font-bold text-piu-gold">{displayedProgress.toFixed(2)}%</p>
            <p className="text-[10px] text-gray-500">to next title</p>
          </div>
        </div>

        {nextTitle ? (
          <div className="mt-3 rounded-lg border border-piu-border/50 bg-piu-dark/60 px-3 py-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-display font-bold text-gray-200">{titleLevelLabel(nextTitle)}</p>
              <p className="text-[10px] text-gray-500">Level {nextTitle.level} title challenge</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-cyan-200">
                {segmentEarned.toLocaleString()} / {segmentNeeded.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-500">segment points</p>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2">
            <p className="text-sm font-display font-bold text-sky-200">All titles unlocked.</p>
          </div>
        )}

        <div className="mt-3 rounded-xl border border-white/25 bg-slate-950/55 px-3 py-2">
          <p className="text-[9px] uppercase tracking-[0.16em] text-sky-200/70 font-display">Journey Dialogue</p>
          <div className="relative mt-1">
            <div className="title-speech-3d rounded-xl px-3.5 py-3 text-[12px] leading-relaxed text-white">
              <p>{speech?.text || 'Select a title level node to hear your journey reflection.'}</p>
              {activeNodeTitle && (
                <p className="mt-2 text-[10px] leading-relaxed text-slate-200/90">{nodeBubbleText}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── 3D World Map ──────────────────────────────────────── */}
        <div className="mt-4 title-map-3d relative rounded-xl border-2 border-white/20 overflow-hidden"
          style={{ boxShadow: '0 10px 32px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
          <div
            ref={mapScrollRef}
            onScroll={handleMapScroll}
            className="max-h-[68vh] sm:max-h-[74vh] overflow-y-auto overflow-x-hidden title-map-scroll"
          >
            <div className="relative w-full title-map-world" style={{ height: `${height}px` }}>
              <ThreeProgressMap
                width={width}
                height={height}
                points={points}
                titles={titles}
                biomeZones={biomeZones}
                cursor={cursor}
                mapScrollTop={mapScrollTop}
                mapViewportHeight={mapViewportHeight}
                currentIndex={currentIndex}
                onNodeSelect={handleTitleTap}
              />
            </div>
          </div>

          {anchoredIndex !== null && (
            <div className="px-3 py-2 flex items-center justify-end border-t border-white/15 bg-black/25">
              <button
                type="button"
                onClick={returnToLiveCheckpoint}
                className="text-[10px] font-display font-bold px-2.5 py-1 rounded-md border border-white/40 text-white bg-slate-900/45 hover:bg-slate-800/70"
              >
                Return to Live Checkpoint
              </button>
            </div>
          )}
        </div>

        <div className="mt-3">
          <p className="text-[11px] text-gray-500">
            Tap any checkpoint to travel there, stay parked there, and read the reflection.
            {isOwner ? ' Title unlocks are computed from imported best scores.' : ''}
          </p>
        </div>
      </div>

      {/* Title Checkpoints List */}
      <div className="card">
        <h4 className="text-xs font-display font-bold text-piu-accent mb-2">TITLE CHECKPOINTS</h4>
        <div className="space-y-2">
          {groups.map((group) => {
            const lockedCount = group.titles.filter((t) => !t.unlocked).length;
            const collapsed = collapsedGroups[group.family] !== undefined
              ? collapsedGroups[group.family]
              : group.family !== (summary?.current_title?.skill_family || '');
            return (
              <div key={group.family} className="rounded-lg border border-piu-border/50 bg-piu-dark/40">
                <button
                  type="button"
                  onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group.family]: !collapsed }))}
                  className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left"
                >
                  <div>
                    <p className="text-sm font-display font-bold text-gray-100">{group.family}</p>
                    <p className="text-[10px] text-gray-500">
                      {group.titles.length - lockedCount}/{group.titles.length} unlocked
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{collapsed ? 'Show' : 'Hide'}</span>
                </button>
                {!collapsed && (
                  <div className="px-2 pb-2 space-y-1.5">
                    {group.titles.map((title) => {
                      const unlocked = !!title.unlocked;
                      const isCurrent = title.index === currentIndex;
                      const palette = TIER_PALETTE[title.tier] || TIER_PALETTE.default;
                      return (
                        <button
                          key={`checkpoint-${title.id}`}
                          type="button"
                          onClick={() => handleTitleTap(title)}
                          className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                            unlocked
                              ? `bg-gradient-to-r ${palette.bg} border-white/50 text-white`
                              : 'bg-slate-900/60 border-slate-600/50 text-slate-300'
                          } ${isCurrent ? `ring-1 ${palette.ring}` : ''} cursor-pointer hover:border-white/90`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-display font-bold">{titleLevelLabel(title)}</p>
                            <span className="text-[10px] font-mono">
                              {unlocked ? 'UNLOCKED' : `${title.progress_percent.toFixed(1)}%`}
                            </span>
                          </div>
                          {title.required_points > 0 && (
                            <p className="text-[10px] mt-1 opacity-90">
                              Lv.{title.level}: {title.earned_points.toLocaleString()} / {title.required_points.toLocaleString()}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

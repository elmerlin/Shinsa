import React, { useEffect, useMemo, useRef, useState } from 'react';

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

function getTitleTheme(title) {
  const id = String(title?.id || '');
  if (id === 'beginner') return { landmark: 'Starter Camp' };
  if (id === 'master') return { landmark: 'Aether Citadel' };
  const match = id.match(/^(intermediate|advanced|expert)-(\d+)$/);
  if (!match) return { landmark: 'Unknown Outpost' };
  const LANDMARKS = {
    intermediate: ['Dawn Meadow','Carousel Bend','Puzzle Crossing','Kite Ridge','Balloon Rise','Toy Bastion','Candy Causeway','Sprout Terrace','Clover Loop','Color Workshop'],
    advanced: ['Street Drift','Rhythm Alley','Voltage Pier','Compass Gate','Fusion Lab','Sprint District','Arcade Terrace','Orbit Deck','Stone Rampart','Champion Grounds'],
    expert: ['Bladewalk','Ember Span','Aegis Keep','Summit Spiral','Royal Vault','Citadel Rise','Ancient Pillar','Oracle Rift','Starlight Vault','Void Nexus'],
  };
  const index = clamp((parseInt(match[2], 10) || 1) - 1, 0, 9);
  return { landmark: (LANDMARKS[match[1]] || [])[index] || 'Outpost' };
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

/* ── Biome scene generators ───────────────────────────────────────── */

function generateChildScenery(points) {
  const items = [];
  const seed = (i) => ((i * 7919 + 104729) % 100) / 100;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const s = seed(i);
    const side = p.x > 500 ? -1 : 1;
    const ox = side * (80 + s * 120);

    if (i % 3 === 0) {
      items.push(<Tree3D key={`ct-${i}`} x={p.x + ox} y={p.y + 10} scale={0.7 + s * 0.4} variant={i % 3} />);
    }
    if (i % 4 === 1) {
      items.push(<Bush3D key={`cb-${i}`} x={p.x - ox * 0.6} y={p.y + 15} scale={0.6 + s * 0.3} />);
    }
    if (i % 5 === 0) {
      items.push(<House3D key={`ch-${i}`} x={p.x + ox * 1.2} y={p.y - 5} scale={0.55 + s * 0.2} variant={i} />);
    }
    if (i % 6 === 2) {
      items.push(<Flower3D key={`cf-${i}`} x={p.x + side * 45} y={p.y + 20} color={['#E91E63', '#FF9800', '#9C27B0', '#2196F3'][i % 4]} />);
      items.push(<Flower3D key={`cf2-${i}`} x={p.x + side * 55} y={p.y + 18} color={['#F44336', '#FFEB3B', '#4CAF50'][i % 3]} />);
    }
    if (i % 7 === 0) {
      items.push(<GrassClump key={`cg-${i}`} x={p.x - ox * 0.3} y={p.y + 22} scale={0.8} />);
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
    const ox = side * (90 + s * 100);

    if (i % 3 === 0) {
      items.push(<PineTree3D key={`at-${i}`} x={p.x + ox} y={p.y + 8} scale={0.65 + s * 0.35} />);
    }
    if (i % 4 === 1) {
      items.push(<Rock3D key={`ar-${i}`} x={p.x - ox * 0.5} y={p.y + 16} scale={0.7 + s * 0.5} variant={i % 3} />);
    }
    if (i % 5 === 2) {
      items.push(<Bridge3D key={`abr-${i}`} x={p.x + ox * 0.3} y={p.y + 6} width={40 + s * 20} />);
    }
    if (i % 6 === 0) {
      items.push(<Mountain3D key={`am-${i}`} x={p.x + ox * 1.5} y={p.y - 20} scale={0.4 + s * 0.2} variant={i % 3} />);
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
    const ox = side * (85 + s * 110);

    if (i % 3 === 0) {
      items.push(<Crystal3D key={`ec-${i}`} x={p.x + ox} y={p.y + 5} scale={0.7 + s * 0.4} />);
    }
    if (i % 4 === 1) {
      items.push(<Torch3D key={`et-${i}`} x={p.x - ox * 0.4} y={p.y + 10} />);
    }
    if (i % 5 === 2) {
      items.push(<Volcano3D key={`ev-${i}`} x={p.x + ox * 1.5} y={p.y - 10} scale={0.35 + s * 0.15} />);
    }
    if (i === 0 || i === points.length - 1) {
      items.push(<Castle3D key={`eca-${i}`} x={p.x + ox * 1.1} y={p.y - 15} scale={0.5 + s * 0.2} />);
    }
  }
  return items;
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

function WaypointNode({ title, point, width, isCurrent, isProgressNode, isTarget, onClick }) {
  const unlocked = !!title.unlocked;
  const palette = TIER_PALETTE[title.tier] || TIER_PALETTE.default;
  const theme = getTitleTheme(title);

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(point.x / width) * 100}%`, top: `${point.y}px` }}
    >
      <button
        type="button"
        onClick={onClick}
        className={`title-node-3d relative w-12 h-12 rounded-full border-[3px] transition-all ${
          unlocked
            ? `bg-gradient-to-b ${palette.bg} border-white/90 text-white title-waypoint-glow-3d`
            : 'bg-gradient-to-b from-slate-700 to-slate-900 border-slate-500/70 text-slate-400'
        } ${isCurrent ? `ring-[3px] ring-cyan-200/90 scale-110` : ''} ${
          isTarget ? 'ring-[3px] ring-cyan-300/90' : ''
        } cursor-pointer hover:scale-115`}
        title={`${title.name} (${title.earned_points.toLocaleString()} / ${title.required_points.toLocaleString()})`}
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 to-transparent pointer-events-none" style={{ height: '50%' }} />
        <span className="absolute inset-0 rounded-full pointer-events-none bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,0.45),rgba(255,255,255,0)_58%)]" />
        <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rotate-45 rounded-[3px] border ${
          unlocked ? 'bg-white/90 border-white/95' : 'bg-slate-400/60 border-slate-300/80'
        }`} style={{ boxShadow: '0 0 8px rgba(255,255,255,0.35)' }} />
        <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
          unlocked ? 'bg-amber-300' : 'bg-slate-200/60'
        }`} />
        {isProgressNode && (
          <span className="absolute -left-1 -top-1 w-4 h-4 rounded-full border border-white/70 bg-gradient-to-b from-amber-300 to-amber-600 flex items-center justify-center text-[8px] text-amber-950 font-bold">
            ★
          </span>
        )}
        <span className="sr-only">
          {title.name}
        </span>
        {!unlocked && (
          <span className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full border-2 border-slate-400 bg-slate-700 flex items-center justify-center z-20"
            style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            <span className="text-[8px]">🔒</span>
          </span>
        )}
      </button>
      <div className={`absolute left-1/2 -translate-x-1/2 top-[54px] px-2 py-0.5 rounded-md text-[9px] font-display font-bold whitespace-nowrap ${
        unlocked ? 'bg-black/70 text-white border border-white/30' : 'bg-black/50 text-slate-400 border border-slate-600/40'
      }`} style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
        {theme.landmark}
      </div>
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
  const speechTimeoutRef = useRef(null);
  const chatterIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);

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
    const shortTitle = compactTitleName(title?.name);

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
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

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
  const avatarLeftPercent = (avatarPos.x / width) * 100;

  const nextLevelPoints = nextTitle ? (levelMap[nextTitle.level]?.points || 0) : 0;
  const sameLevelSegment = nextTitle && summary?.current_title?.level === nextTitle.level;
  const segmentStart = sameLevelSegment ? (summary?.current_title?.required_points || 0) : 0;
  const segmentEarned = Math.max(0, nextLevelPoints - segmentStart);
  const segmentNeeded = nextTitle ? Math.max(1, nextTitle.required_points - segmentStart) : 0;
  const displayedProgress = nextTitle ? clamp(Number(summary?.segment_progress_percent) || 0, 0, 100) : 100;
  const isRunning = target !== null;

  const roadPath = useMemo(() => buildRoadPath(points), [points]);
  const terraces = useMemo(() => buildTerrainTerraces(points, width, height), [points, width, height]);
  const terraceStairs = useMemo(() => buildTerraceStairs(points, terraces), [points, terraces]);
  const avatarNodeIndex = titles.length > 0 ? clamp(Math.round(cursor), 0, titles.length - 1) : 0;

  const zones = useMemo(() => {
    const child = getZone(points, titles, ['Beginner', 'Intermediate'], 'child');
    const adolescent = getZone(points, titles, ['Advanced'], 'adolescent');
    const adult = getZone(points, titles, ['Expert', 'Master'], 'adult');
    return [adult, adolescent, child].filter(Boolean);
  }, [points, titles]);

  /* Split titles into zone groups for scenery generation */
  const zoneScenery = useMemo(() => {
    const childTitles = titles.filter((t) => ['Beginner', 'Intermediate'].includes(familyName(t)));
    const adolTitles = titles.filter((t) => familyName(t) === 'Advanced');
    const adultTitles = titles.filter((t) => ['Expert', 'Master'].includes(familyName(t)));

    const childPts = childTitles.map((t) => points[t.index]).filter(Boolean);
    const adolPts = adolTitles.map((t) => points[t.index]).filter(Boolean);
    const adultPts = adultTitles.map((t) => points[t.index]).filter(Boolean);

    return {
      child: generateChildScenery(childPts),
      adolescent: generateAdolescentScenery(adolPts),
      adult: generateAdultScenery(adultPts),
    };
  }, [titles, points, height]);

  /* Cloud positions */
  const clouds = useMemo(() => {
    const c = [];
    for (let i = 0; i < Math.ceil(height / 350); i++) {
      c.push({ x: 80 + (i * 317) % 840, y: 50 + i * 320, scale: 0.6 + (i % 3) * 0.25, opacity: 0.3 + (i % 2) * 0.15 });
    }
    return c;
  }, [height]);

  function handleTitleTap(title) {
    if (!title) return;
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
              {summary.current_title?.name || 'Beginner'}
              {nextTitle ? ` → ${nextTitle.name}` : ' → Completed'}
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
              <p className="text-xs font-display font-bold text-gray-200">{nextTitle.name}</p>
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

        {/* ── 3D World Map ──────────────────────────────────────── */}
        <div className="mt-4 title-map-3d rounded-xl border-2 border-white/20 overflow-hidden"
          style={{ boxShadow: '0 10px 32px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
          <div ref={mapScrollRef} className="max-h-[68vh] sm:max-h-[74vh] overflow-y-auto overflow-x-hidden title-map-scroll">
            <div className="relative w-full" style={{ height: `${height}px` }}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#120D24" />
                    <stop offset="18%" stopColor="#2D2454" />
                    <stop offset="44%" stopColor="#4C5F8D" />
                    <stop offset="68%" stopColor="#6F93B4" />
                    <stop offset="100%" stopColor="#B2D4E7" />
                  </linearGradient>
                  <linearGradient id="mistGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
                    <stop offset="60%" stopColor="rgba(255,255,255,0)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
                  </linearGradient>
                  <pattern id="terrain-speck-ember" width="22" height="22" patternUnits="userSpaceOnUse">
                    <circle cx="5" cy="6" r="1.3" fill="rgba(255,214,163,0.35)" />
                    <circle cx="14" cy="9" r="1.1" fill="rgba(106,36,26,0.33)" />
                    <circle cx="17" cy="17" r="1.4" fill="rgba(255,245,220,0.24)" />
                  </pattern>
                  <pattern id="terrain-speck-rust" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="6" cy="5" r="1.2" fill="rgba(255,226,190,0.32)" />
                    <circle cx="12" cy="14" r="1.4" fill="rgba(98,58,34,0.3)" />
                    <circle cx="20" cy="8" r="1.3" fill="rgba(255,244,220,0.24)" />
                  </pattern>
                  <pattern id="terrain-speck-moss" width="26" height="26" patternUnits="userSpaceOnUse">
                    <circle cx="5" cy="11" r="1.4" fill="rgba(228,248,198,0.3)" />
                    <circle cx="12" cy="6" r="1.5" fill="rgba(56,72,41,0.28)" />
                    <circle cx="20" cy="18" r="1.2" fill="rgba(243,255,233,0.28)" />
                  </pattern>
                  <pattern id="terrain-speck-rock" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="6" cy="7" r="1.3" fill="rgba(225,240,255,0.3)" />
                    <circle cx="14" cy="13" r="1.4" fill="rgba(43,59,77,0.32)" />
                    <circle cx="20" cy="5" r="1.1" fill="rgba(208,220,237,0.3)" />
                  </pattern>
                  <pattern id="terrain-speck-crystal" width="26" height="26" patternUnits="userSpaceOnUse">
                    <circle cx="6" cy="8" r="1.2" fill="rgba(250,243,255,0.34)" />
                    <circle cx="13" cy="15" r="1.5" fill="rgba(56,44,89,0.34)" />
                    <circle cx="20" cy="6" r="1.1" fill="rgba(232,219,255,0.3)" />
                  </pattern>
                  <linearGradient id="roadFill3d" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#F59F67" />
                    <stop offset="38%" stopColor="#F6C987" />
                    <stop offset="100%" stopColor="#FFF3CC" />
                  </linearGradient>
                  <linearGradient id="roadEdge3d" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9A6840" />
                    <stop offset="100%" stopColor="#5E3C24" />
                  </linearGradient>
                  <radialGradient id="waterGradient">
                    <stop offset="0%" stopColor="#4FC3F7" stopOpacity="0.62" />
                    <stop offset="100%" stopColor="#0288D1" stopOpacity="0.4" />
                  </radialGradient>
                  <filter id="terrainGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  {terraces.map((terrace) => (
                    <React.Fragment key={`terrain-grad-${terrace.id}`}>
                      <linearGradient id={`terrace-top-${terrace.id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={terrace.theme.topA} />
                        <stop offset="100%" stopColor={terrace.theme.topB} />
                      </linearGradient>
                      <linearGradient id={`terrace-front-${terrace.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={terrace.theme.faceA} />
                        <stop offset="100%" stopColor={terrace.theme.faceB} />
                      </linearGradient>
                      <linearGradient id={`terrace-right-${terrace.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={terrace.theme.faceA} />
                        <stop offset="100%" stopColor={terrace.theme.faceB} />
                      </linearGradient>
                      <linearGradient id={`terrace-left-${terrace.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={terrace.theme.faceA} />
                        <stop offset="100%" stopColor={terrace.theme.faceB} />
                      </linearGradient>
                    </React.Fragment>
                  ))}
                </defs>

                <rect x="0" y="0" width={width} height={height} fill="url(#skyGrad)" />
                <rect x="0" y="0" width={width} height={height} fill="url(#mistGrad)" />
                <path d={`M 0 0 L ${width * 0.38} 0 L ${width * 0.07} ${height} L 0 ${height} Z`} fill="rgba(255,255,255,0.045)" />
                <path d={`M ${width * 0.58} 0 L ${width} 0 L ${width} ${height} L ${width * 0.76} ${height} Z`} fill="rgba(255,255,255,0.028)" />

                {clouds.map((c, i) => (
                  <Cloud3D key={`cloud-${i}`} x={c.x} y={c.y} scale={c.scale} opacity={c.opacity} />
                ))}

                {[...terraces].reverse().map((terrace) => (
                  <g key={`terrain-${terrace.id}`}>
                    <polygon points={toSvgPoints(terrace.shadowSurface)} fill="rgba(0,0,0,0.24)" />
                    <polygon points={toSvgPoints(terrace.rightFace)} fill={`url(#terrace-right-${terrace.id})`} />
                    <polygon points={toSvgPoints(terrace.leftFace)} fill={`url(#terrace-left-${terrace.id})`} />
                    <polygon points={toSvgPoints(terrace.frontFace)} fill={`url(#terrace-front-${terrace.id})`} />
                    <polygon points={toSvgPoints(terrace.topSurface)} fill={`url(#terrace-top-${terrace.id})`} />
                    <polygon points={toSvgPoints(terrace.topSurface)} fill={terrace.theme.texture} opacity="0.28" />
                    <polyline
                      points={toSvgPoints([terrace.topSurface[0], terrace.topSurface[1], terrace.topSurface[2], terrace.topSurface[3]])}
                      fill="none"
                      stroke={terrace.theme.rim}
                      strokeWidth="2.2"
                      strokeOpacity="0.72"
                    />
                    <ellipse cx={terrace.centerX + 44} cy={terrace.labelY + 44} rx="210" ry="60" fill={terrace.theme.haze} />
                  </g>
                ))}

                {terraceStairs.map((stairs) => (
                  <StairBridge3D
                    key={stairs.id}
                    x={stairs.x}
                    y={stairs.y}
                    angle={stairs.angle}
                    width={stairs.width}
                    drop={stairs.drop}
                  />
                ))}

                {zones.filter((z) => z.id === 'child').map((z) => (
                  <WaterBody key="water-child" x={800} y={z.top + z.height * 0.6} w={100} h={40} />
                ))}
                {zones.filter((z) => z.id === 'adolescent').map((z) => (
                  <WaterBody key="water-adol" x={150} y={z.top + z.height * 0.5} w={80} h={30} />
                ))}

                {zoneScenery.child}
                {zoneScenery.adolescent}
                {zoneScenery.adult}

                <path
                  d={roadPath}
                  fill="none"
                  stroke="rgba(0,0,0,0.46)"
                  strokeWidth="34"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(4,7)"
                />
                <path
                  d={roadPath}
                  fill="none"
                  stroke="url(#roadEdge3d)"
                  strokeWidth="32"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={roadPath}
                  fill="none"
                  stroke="url(#roadFill3d)"
                  strokeWidth="24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#terrainGlow)"
                />
                <path
                  d={roadPath}
                  fill="none"
                  stroke="rgba(255,255,255,0.37)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="11 14"
                />
                <path
                  d={roadPath}
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(-2,-2)"
                />
              </svg>

              {zones.map((zone) => {
                const labels = {
                  child: { text: 'Foothill Basin', sub: 'Beginner · Intermediate', color: '#5DAF6A' },
                  adolescent: { text: 'Rifted Highlands', sub: 'Advanced', color: '#4F89D9' },
                  adult: { text: 'Aether Summit', sub: 'Expert · Master', color: '#8764D9' },
                };
                const label = labels[zone.id];
                return (
                  <div
                    key={`label-${zone.id}`}
                    className="absolute left-3 z-10"
                    style={{ top: `${zone.top + 8}px` }}
                  >
                    <div className="title-zone-banner px-3 py-1.5 rounded-lg"
                      style={{
                        background: `linear-gradient(140deg, ${label.color}de, ${label.color}8a)`,
                        boxShadow: `0 5px 16px ${label.color}44, inset 0 1px 0 rgba(255,255,255,0.3)`,
                        border: '1px solid rgba(255,255,255,0.36)',
                      }}>
                      <p className="text-[11px] font-display font-bold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.46)' }}>
                        {label.text}
                      </p>
                      <p className="text-[9px] text-white/84">{label.sub}</p>
                    </div>
                  </div>
                );
              })}

              {titles.map((title) => {
                const point = points[title.index];
                return (
                  <WaypointNode
                    key={title.id}
                    title={title}
                    point={point}
                    width={width}
                    isCurrent={title.index === avatarNodeIndex}
                    isProgressNode={title.index === currentIndex}
                    isTarget={target !== null && Math.abs(title.index - target) < 0.2}
                    onClick={() => handleTitleTap(title)}
                  />
                );
              })}

              <div
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-[88%] z-30"
                style={{ left: `${avatarLeftPercent}%`, top: `${avatarPos.y}px` }}
              >
                {speech && (
                  <div key={speech.key} className="absolute left-1/2 -translate-x-1/2 -top-24 min-w-[220px] max-w-[320px] sm:max-w-[420px] px-4 py-3 rounded-2xl text-[12px] leading-relaxed text-left text-white title-speech-3d">
                    {speech.text}
                    <span className="absolute left-1/2 -translate-x-1/2 -bottom-[8px] w-4 h-4 rotate-45 title-speech-3d-tail" />
                  </div>
                )}
                <JourneyCharacter
                  running={isRunning}
                  avatarUrl={avatarUrl}
                  username={username}
                  gender={gender}
                />
              </div>
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
                      const theme = getTitleTheme(title);
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
                            <p className="text-xs font-display font-bold">{title.name}</p>
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

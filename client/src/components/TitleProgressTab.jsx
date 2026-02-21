import React, { useEffect, useMemo, useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const GROUP_ORDER = ['Master', 'Expert', 'Advanced', 'Intermediate', 'Beginner'];

const TIER_PALETTE = {
  beginner: { bg: 'from-emerald-400 to-emerald-700', ring: 'ring-emerald-200/80', glow: 'shadow-emerald-300/70' },
  bronze: { bg: 'from-amber-300 to-amber-700', ring: 'ring-amber-200/80', glow: 'shadow-amber-300/70' },
  silver: { bg: 'from-slate-100 to-slate-500', ring: 'ring-slate-100/90', glow: 'shadow-slate-100/70' },
  gold: { bg: 'from-yellow-200 to-yellow-600', ring: 'ring-yellow-200/90', glow: 'shadow-yellow-200/70' },
  blue: { bg: 'from-cyan-200 to-blue-700', ring: 'ring-cyan-200/90', glow: 'shadow-cyan-200/70' },
  default: { bg: 'from-slate-200 to-slate-600', ring: 'ring-slate-200/70', glow: 'shadow-slate-300/60' },
};

const TIER_PIP_COLOR = {
  beginner: '#86efac',
  bronze: '#f59e0b',
  silver: '#cbd5e1',
  gold: '#facc15',
  blue: '#38bdf8',
  default: '#94a3b8',
};

const ZONE_PROPS = {
  child: [
    { token: 'toy-bear', x: 14, y: 18 },
    { token: 'puzzle-grid', x: 77, y: 31 },
    { token: 'balloon-node', x: 28, y: 64 },
    { token: 'tree-bloom', x: 83, y: 74 },
  ],
  adolescent: [
    { token: 'skate-deck', x: 20, y: 20 },
    { token: 'headset-core', x: 80, y: 34 },
    { token: 'voltage-z', x: 27, y: 70 },
    { token: 'stone-slab', x: 74, y: 78 },
  ],
  adult: [
    { token: 'citadel-spire', x: 18, y: 14 },
    { token: 'blade-cross', x: 75, y: 28 },
    { token: 'compass-glyph', x: 26, y: 72 },
    { token: 'aether-orb', x: 81, y: 77 },
  ],
};

const LEVEL_BAND_PROPS = {
  0: ['seed-sprout', 'leaf-clover', 'toy-bear', 'kite-flare'],
  1: ['puzzle-grid', 'carousel-pin', 'candy-drop', 'flower-crown'],
  2: ['skate-deck', 'headset-core', 'voltage-z', 'compass-glyph'],
  3: ['peak-climb', 'blade-cross', 'academy-arch', 'map-fold'],
  4: ['ember-core', 'shield-guard', 'crown-crest', 'citadel-spire'],
  5: ['crystal-prism', 'starlight-gate', 'mythic-blade', 'void-pillar'],
};

const INTERMEDIATE_TITLE_THEMES = [
  { sprite: 'seed-sprout', landmark: 'Dawn Meadow' },
  { sprite: 'carousel-pin', landmark: 'Carousel Bend' },
  { sprite: 'puzzle-grid', landmark: 'Puzzle Crossing' },
  { sprite: 'kite-flare', landmark: 'Kite Ridge' },
  { sprite: 'balloon-node', landmark: 'Balloon Rise' },
  { sprite: 'toy-bear', landmark: 'Toy Bastion' },
  { sprite: 'candy-drop', landmark: 'Candy Causeway' },
  { sprite: 'sprout-arch', landmark: 'Sprout Terrace' },
  { sprite: 'leaf-clover', landmark: 'Clover Loop' },
  { sprite: 'paint-spark', landmark: 'Color Workshop' },
];

const ADVANCED_TITLE_THEMES = [
  { sprite: 'skate-deck', landmark: 'Street Drift' },
  { sprite: 'headset-core', landmark: 'Rhythm Alley' },
  { sprite: 'voltage-z', landmark: 'Voltage Pier' },
  { sprite: 'compass-glyph', landmark: 'Compass Gate' },
  { sprite: 'fusion-vial', landmark: 'Fusion Lab' },
  { sprite: 'sprint-flag', landmark: 'Sprint District' },
  { sprite: 'arcade-grid', landmark: 'Arcade Terrace' },
  { sprite: 'orbit-signal', landmark: 'Orbit Deck' },
  { sprite: 'stone-slab', landmark: 'Stone Rampart' },
  { sprite: 'champion-ring', landmark: 'Champion Grounds' },
];

const EXPERT_TITLE_THEMES = [
  { sprite: 'blade-cross', landmark: 'Bladewalk' },
  { sprite: 'ember-core', landmark: 'Ember Span' },
  { sprite: 'shield-guard', landmark: 'Aegis Keep' },
  { sprite: 'summit-peak', landmark: 'Summit Spiral' },
  { sprite: 'crown-crest', landmark: 'Royal Vault' },
  { sprite: 'citadel-spire', landmark: 'Citadel Rise' },
  { sprite: 'ancient-idol', landmark: 'Ancient Pillar' },
  { sprite: 'oracle-eye', landmark: 'Oracle Rift' },
  { sprite: 'starlight-gate', landmark: 'Starlight Vault' },
  { sprite: 'void-nexus', landmark: 'Void Nexus' },
];

const FAMILY_SPRITE_TOKEN = {
  Beginner: 'seed-sprout',
  Intermediate: 'puzzle-grid',
  Advanced: 'arcade-grid',
  Expert: 'citadel-spire',
  Master: 'aether-core',
};

const SPRITE_LIBRARY = {
  default: { variant: 'star', bg: '#0f172a', edge: '#475569', main: '#cbd5e1', accent: '#94a3b8', light: '#e2e8f0' },

  'seed-sprout': { variant: 'sprout', bg: '#052e16', edge: '#166534', main: '#4ade80', accent: '#22c55e', light: '#bbf7d0' },
  'leaf-clover': { variant: 'clover', bg: '#052e16', edge: '#14532d', main: '#34d399', accent: '#10b981', light: '#a7f3d0' },
  'toy-bear': { variant: 'totem', bg: '#422006', edge: '#78350f', main: '#f59e0b', accent: '#fbbf24', light: '#fde68a' },
  'kite-flare': { variant: 'kite', bg: '#3f1d12', edge: '#7c2d12', main: '#fb923c', accent: '#f97316', light: '#fed7aa' },
  'carousel-pin': { variant: 'pinwheel', bg: '#4a044e', edge: '#86198f', main: '#e879f9', accent: '#d946ef', light: '#f5d0fe' },
  'puzzle-grid': { variant: 'grid', bg: '#312e81', edge: '#4338ca', main: '#818cf8', accent: '#6366f1', light: '#c7d2fe' },
  'candy-drop': { variant: 'drop', bg: '#831843', edge: '#be185d', main: '#fb7185', accent: '#f43f5e', light: '#fecdd3' },
  'balloon-node': { variant: 'orb', bg: '#0c4a6e', edge: '#0369a1', main: '#38bdf8', accent: '#0ea5e9', light: '#bae6fd' },
  'sprout-arch': { variant: 'arch', bg: '#14532d', edge: '#15803d', main: '#4ade80', accent: '#22c55e', light: '#dcfce7' },
  'paint-spark': { variant: 'spark', bg: '#4a044e', edge: '#7e22ce', main: '#c084fc', accent: '#a855f7', light: '#e9d5ff' },
  'flower-crown': { variant: 'flower', bg: '#713f12', edge: '#92400e', main: '#fbbf24', accent: '#f59e0b', light: '#fef3c7' },

  'skate-deck': { variant: 'deck', bg: '#1e293b', edge: '#334155', main: '#60a5fa', accent: '#3b82f6', light: '#bfdbfe' },
  'headset-core': { variant: 'headset', bg: '#312e81', edge: '#4338ca', main: '#a5b4fc', accent: '#818cf8', light: '#e0e7ff' },
  'voltage-z': { variant: 'bolt', bg: '#451a03', edge: '#92400e', main: '#fbbf24', accent: '#f59e0b', light: '#fde68a' },
  'compass-glyph': { variant: 'compass', bg: '#0f172a', edge: '#334155', main: '#67e8f9', accent: '#06b6d4', light: '#cffafe' },
  'fusion-vial': { variant: 'vial', bg: '#083344', edge: '#0e7490', main: '#22d3ee', accent: '#06b6d4', light: '#a5f3fc' },
  'sprint-flag': { variant: 'flag', bg: '#172554', edge: '#1d4ed8', main: '#93c5fd', accent: '#60a5fa', light: '#dbeafe' },
  'arcade-grid': { variant: 'console', bg: '#111827', edge: '#374151', main: '#a78bfa', accent: '#8b5cf6', light: '#ddd6fe' },
  'orbit-signal': { variant: 'orbit', bg: '#164e63', edge: '#0891b2', main: '#67e8f9', accent: '#22d3ee', light: '#cffafe' },
  'stone-slab': { variant: 'monolith', bg: '#111827', edge: '#4b5563', main: '#9ca3af', accent: '#6b7280', light: '#d1d5db' },
  'champion-ring': { variant: 'ring', bg: '#422006', edge: '#92400e', main: '#fbbf24', accent: '#f59e0b', light: '#fde68a' },

  'peak-climb': { variant: 'peak', bg: '#1e1b4b', edge: '#312e81', main: '#a5b4fc', accent: '#818cf8', light: '#e0e7ff' },
  'map-fold': { variant: 'map', bg: '#1f2937', edge: '#374151', main: '#93c5fd', accent: '#60a5fa', light: '#dbeafe' },
  'academy-arch': { variant: 'archway', bg: '#0f172a', edge: '#334155', main: '#cbd5e1', accent: '#94a3b8', light: '#e2e8f0' },

  'ember-core': { variant: 'core', bg: '#431407', edge: '#9a3412', main: '#fb923c', accent: '#f97316', light: '#fed7aa' },
  'shield-guard': { variant: 'shield', bg: '#172554', edge: '#1d4ed8', main: '#93c5fd', accent: '#60a5fa', light: '#dbeafe' },
  'crown-crest': { variant: 'crown', bg: '#422006', edge: '#92400e', main: '#fde047', accent: '#facc15', light: '#fef9c3' },
  'citadel-spire': { variant: 'spire', bg: '#312e81', edge: '#5b21b6', main: '#c4b5fd', accent: '#a78bfa', light: '#ede9fe' },
  'summit-peak': { variant: 'peak', bg: '#0f172a', edge: '#334155', main: '#94a3b8', accent: '#64748b', light: '#cbd5e1' },
  'ancient-idol': { variant: 'idol', bg: '#292524', edge: '#57534e', main: '#d6d3d1', accent: '#a8a29e', light: '#f5f5f4' },
  'oracle-eye': { variant: 'eye', bg: '#4c1d95', edge: '#7e22ce', main: '#c084fc', accent: '#a855f7', light: '#f3e8ff' },
  'starlight-gate': { variant: 'gate', bg: '#0c4a6e', edge: '#0369a1', main: '#67e8f9', accent: '#06b6d4', light: '#cffafe' },
  'void-nexus': { variant: 'nexus', bg: '#111827', edge: '#374151', main: '#c4b5fd', accent: '#8b5cf6', light: '#e9d5ff' },
  'mythic-blade': { variant: 'blade', bg: '#3f3f46', edge: '#52525b', main: '#e4e4e7', accent: '#a1a1aa', light: '#fafafa' },
  'void-pillar': { variant: 'pillar', bg: '#18181b', edge: '#3f3f46', main: '#a5f3fc', accent: '#22d3ee', light: '#ecfeff' },
  'crystal-prism': { variant: 'prism', bg: '#1e1b4b', edge: '#4338ca', main: '#93c5fd', accent: '#60a5fa', light: '#dbeafe' },
  'aether-orb': { variant: 'orb', bg: '#164e63', edge: '#0891b2', main: '#67e8f9', accent: '#22d3ee', light: '#cffafe' },
  'blade-cross': { variant: 'blade', bg: '#172554', edge: '#1d4ed8', main: '#bfdbfe', accent: '#93c5fd', light: '#eff6ff' },
  'aether-core': { variant: 'aether', bg: '#083344', edge: '#0e7490', main: '#67e8f9', accent: '#22d3ee', light: '#ecfeff' },
  'tree-bloom': { variant: 'tree', bg: '#14532d', edge: '#166534', main: '#86efac', accent: '#4ade80', light: '#dcfce7' },
};

function familyName(title) {
  return String(title?.skill_family || '').trim() || 'Other';
}

function getTitleTheme(title) {
  const id = String(title?.id || '');
  if (id === 'beginner') {
    return { sprite: 'seed-sprout', landmark: 'Starter Camp', chipClass: 'title-landmark-beginner' };
  }
  if (id === 'master') {
    return { sprite: 'aether-core', landmark: 'Aether Citadel', chipClass: 'title-landmark-master' };
  }

  const match = id.match(/^(intermediate|advanced|expert)-(\d+)$/);
  if (!match) {
    return { sprite: 'default', landmark: 'Unknown Outpost', chipClass: 'title-landmark-neutral' };
  }
  const family = match[1];
  const index = clamp((parseInt(match[2], 10) || 1) - 1, 0, 9);

  if (family === 'intermediate') {
    const row = INTERMEDIATE_TITLE_THEMES[index];
    return { ...row, chipClass: 'title-landmark-child' };
  }
  if (family === 'advanced') {
    const row = ADVANCED_TITLE_THEMES[index];
    return { ...row, chipClass: 'title-landmark-adolescent' };
  }
  const row = EXPERT_TITLE_THEMES[index];
  return { ...row, chipClass: 'title-landmark-adult' };
}

function getLevelBand(level) {
  const lv = parseInt(level, 10) || 0;
  if (lv <= 12) return 0;
  if (lv <= 16) return 1;
  if (lv <= 20) return 2;
  if (lv <= 24) return 3;
  if (lv <= 26) return 4;
  return 5;
}

function buildWorldPoints(count) {
  const safeCount = Math.max(1, count);
  const width = 1000;
  const laneMin = 130;
  const laneMax = 870;
  const stepY = 78;
  const topPad = 120;
  const bottomPad = 110;
  const height = topPad + bottomPad + Math.max(0, safeCount - 1) * stepY;
  const points = [];

  for (let i = 0; i < safeCount; i++) {
    const wave = Math.sin(i * 0.75) * 225 + Math.cos(i * 0.23) * 90;
    const x = clamp(500 + wave, laneMin, laneMax);
    const y = height - bottomPad - i * stepY;
    points.push({ x, y });
  }

  return { points, width, height };
}

function interpolatePoint(points, floatIndex) {
  if (!points.length) return { x: 0, y: 0 };
  const maxIndex = points.length - 1;
  const idx = clamp(floatIndex, 0, maxIndex);
  const fromIdx = Math.floor(idx);
  const toIdx = Math.min(maxIndex, fromIdx + 1);
  const from = points[fromIdx];
  const to = points[toIdx];
  const t = idx - fromIdx;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function getZone(points, titles, families, id, label, className) {
  const indices = titles
    .filter((title) => families.includes(familyName(title)))
    .map((title) => title.index);
  if (indices.length === 0) return null;
  const ys = indices.map((idx) => points[idx].y);
  const top = Math.max(0, Math.min(...ys) - 92);
  const bottom = Math.max(...ys) + 92;
  return {
    id,
    label,
    className,
    top,
    height: Math.max(150, bottom - top),
  };
}

function groupTitles(titles) {
  const ordered = [...titles].sort((a, b) => b.index - a.index);
  const map = new Map();
  for (const title of ordered) {
    const family = familyName(title);
    if (!map.has(family)) map.set(family, []);
    map.get(family).push(title);
  }

  const known = GROUP_ORDER.filter((family) => map.has(family)).map((family) => ({
    family,
    titles: map.get(family),
  }));
  const extra = Array.from(map.keys())
    .filter((family) => !GROUP_ORDER.includes(family))
    .map((family) => ({ family, titles: map.get(family) }));
  return [...known, ...extra];
}

function buildBandProps(points, titles, width) {
  const props = [];
  for (const title of titles) {
    const point = points[title.index];
    if (!point) continue;
    const band = getLevelBand(title.level);
    const tokenSet = LEVEL_BAND_PROPS[band] || LEVEL_BAND_PROPS[0];
    const token = tokenSet[title.index % tokenSet.length];
    const xOffset = title.index % 2 === 0 ? -36 : 36;
    const yOffset = title.index % 3 === 0 ? -18 : 18;
    const pxX = clamp(point.x + xOffset, 22, width - 22);
    const pxY = point.y + yOffset;
    props.push({
      id: `${title.id}-prop`,
      token,
      xPercent: (pxX / width) * 100,
      y: pxY,
      unlocked: !!title.unlocked,
    });
  }
  return props;
}

function lockedSpritePalette() {
  return {
    bg: '#1f2937',
    edge: '#475569',
    main: '#94a3b8',
    accent: '#64748b',
    light: '#cbd5e1',
  };
}

function spriteParts(variant, palette) {
  const p = palette;
  if (variant === 'sprout') {
    return (
      <>
        <rect x="7" y="6" width="2" height="6" fill={p.main} />
        <rect x="4" y="4" width="3" height="2" fill={p.accent} />
        <rect x="9" y="3" width="3" height="2" fill={p.light} />
      </>
    );
  }
  if (variant === 'clover') {
    return (
      <>
        <rect x="5" y="4" width="2" height="2" fill={p.main} />
        <rect x="8" y="4" width="2" height="2" fill={p.main} />
        <rect x="5" y="7" width="2" height="2" fill={p.accent} />
        <rect x="8" y="7" width="2" height="2" fill={p.accent} />
        <rect x="7" y="9" width="2" height="3" fill={p.light} />
      </>
    );
  }
  if (variant === 'kite') {
    return (
      <>
        <polygon points="8,3 12,8 8,13 4,8" fill={p.main} />
        <rect x="7" y="7" width="2" height="2" fill={p.light} />
        <rect x="8" y="13" width="1" height="2" fill={p.accent} />
      </>
    );
  }
  if (variant === 'pinwheel') {
    return (
      <>
        <polygon points="8,3 11,6 8,7" fill={p.main} />
        <polygon points="13,8 10,11 9,8" fill={p.accent} />
        <polygon points="8,13 5,10 8,9" fill={p.light} />
        <polygon points="3,8 6,5 7,8" fill={p.main} />
        <rect x="7" y="7" width="2" height="2" fill={p.edge} />
      </>
    );
  }
  if (variant === 'grid') {
    return (
      <>
        <rect x="4" y="4" width="3" height="3" fill={p.main} />
        <rect x="9" y="4" width="3" height="3" fill={p.accent} />
        <rect x="4" y="9" width="3" height="3" fill={p.light} />
        <rect x="9" y="9" width="3" height="3" fill={p.main} />
      </>
    );
  }
  if (variant === 'drop') {
    return (
      <>
        <polygon points="8,3 11,8 8,13 5,8" fill={p.main} />
        <rect x="7" y="8" width="2" height="3" fill={p.light} />
      </>
    );
  }
  if (variant === 'totem') {
    return (
      <>
        <rect x="5" y="4" width="6" height="8" fill={p.main} />
        <rect x="6" y="5" width="1" height="1" fill={p.light} />
        <rect x="9" y="5" width="1" height="1" fill={p.light} />
        <rect x="7" y="9" width="2" height="2" fill={p.accent} />
      </>
    );
  }
  if (variant === 'flower') {
    return (
      <>
        <rect x="7" y="3" width="2" height="2" fill={p.main} />
        <rect x="4" y="6" width="2" height="2" fill={p.main} />
        <rect x="10" y="6" width="2" height="2" fill={p.main} />
        <rect x="7" y="9" width="2" height="2" fill={p.main} />
        <rect x="7" y="6" width="2" height="2" fill={p.light} />
      </>
    );
  }
  if (variant === 'deck') {
    return (
      <>
        <rect x="4" y="7" width="8" height="2" rx="1" fill={p.main} />
        <circle cx="5.5" cy="10.5" r="1.2" fill={p.accent} />
        <circle cx="10.5" cy="10.5" r="1.2" fill={p.accent} />
      </>
    );
  }
  if (variant === 'headset') {
    return (
      <>
        <path d="M4 8a4 4 0 0 1 8 0" fill="none" stroke={p.main} strokeWidth="2" />
        <rect x="3.5" y="8" width="2" height="4" fill={p.accent} />
        <rect x="10.5" y="8" width="2" height="4" fill={p.accent} />
      </>
    );
  }
  if (variant === 'bolt') {
    return <polygon points="9,2 5,9 8,9 6,14 11,7 8,7" fill={p.main} />;
  }
  if (variant === 'compass') {
    return (
      <>
        <polygon points="8,3 11,8 8,13 5,8" fill={p.main} />
        <polygon points="8,5 10,8 8,11 6,8" fill={p.light} />
        <rect x="7.5" y="2" width="1" height="1" fill={p.accent} />
      </>
    );
  }
  if (variant === 'vial') {
    return (
      <>
        <rect x="6" y="3" width="4" height="2" fill={p.light} />
        <path d="M6 5h4v2l2 4H4l2-4z" fill={p.main} />
        <rect x="6" y="8" width="4" height="2" fill={p.accent} />
      </>
    );
  }
  if (variant === 'flag') {
    return (
      <>
        <rect x="5" y="3" width="1.5" height="10" fill={p.light} />
        <polygon points="7,3 12,5 7,7" fill={p.main} />
        <rect x="7" y="5" width="2" height="1" fill={p.accent} />
      </>
    );
  }
  if (variant === 'console') {
    return (
      <>
        <rect x="4" y="4" width="8" height="8" rx="2" fill={p.main} />
        <rect x="6" y="6" width="4" height="2" fill={p.light} />
        <rect x="6" y="9" width="1.5" height="1.5" fill={p.accent} />
        <rect x="8.5" y="9" width="1.5" height="1.5" fill={p.accent} />
      </>
    );
  }
  if (variant === 'orbit') {
    return (
      <>
        <circle cx="8" cy="8" r="2.4" fill={p.main} />
        <ellipse cx="8" cy="8" rx="5.2" ry="2.2" fill="none" stroke={p.accent} strokeWidth="1.4" />
        <circle cx="12.3" cy="8" r="1.1" fill={p.light} />
      </>
    );
  }
  if (variant === 'monolith') {
    return (
      <>
        <rect x="5" y="3" width="6" height="10" fill={p.main} />
        <rect x="6" y="4" width="1" height="8" fill={p.light} />
        <rect x="9" y="4" width="1" height="8" fill={p.accent} />
      </>
    );
  }
  if (variant === 'ring') {
    return (
      <>
        <circle cx="8" cy="8" r="4.6" fill={p.main} />
        <circle cx="8" cy="8" r="2.6" fill={p.bg} />
        <rect x="7.2" y="3" width="1.6" height="2" fill={p.light} />
      </>
    );
  }
  if (variant === 'map') {
    return (
      <>
        <polygon points="4,4 7,5 10,4 12,5 12,12 10,11 7,12 4,11" fill={p.main} />
        <rect x="6.8" y="5" width="0.9" height="6" fill={p.light} />
        <rect x="9.7" y="5" width="0.9" height="6" fill={p.accent} />
      </>
    );
  }
  if (variant === 'archway') {
    return (
      <>
        <rect x="4" y="4" width="8" height="8" fill={p.main} />
        <rect x="6.5" y="6" width="3" height="6" fill={p.bg} />
        <rect x="4" y="4" width="8" height="2" fill={p.light} />
      </>
    );
  }
  if (variant === 'peak') {
    return (
      <>
        <polygon points="3,12 8,4 13,12" fill={p.main} />
        <polygon points="8,4 10,7 6,7" fill={p.light} />
      </>
    );
  }
  if (variant === 'core') {
    return (
      <>
        <circle cx="8" cy="8" r="4.2" fill={p.main} />
        <circle cx="8" cy="8" r="2.2" fill={p.light} />
        <rect x="7.2" y="2.8" width="1.6" height="2.2" fill={p.accent} />
      </>
    );
  }
  if (variant === 'shield') {
    return <path d="M8 3l4 1.5v3.6c0 2.3-1.5 4.2-4 5.9-2.5-1.7-4-3.6-4-5.9V4.5L8 3z" fill={p.main} />;
  }
  if (variant === 'crown') {
    return (
      <>
        <polygon points="3,10 5,5 8,8 11,5 13,10" fill={p.main} />
        <rect x="3" y="10" width="10" height="2" fill={p.accent} />
        <rect x="5" y="7" width="1" height="1" fill={p.light} />
        <rect x="10" y="7" width="1" height="1" fill={p.light} />
      </>
    );
  }
  if (variant === 'spire') {
    return (
      <>
        <polygon points="8,2 12,7 11,13 5,13 4,7" fill={p.main} />
        <rect x="7" y="6" width="2" height="7" fill={p.light} />
      </>
    );
  }
  if (variant === 'idol') {
    return (
      <>
        <rect x="5" y="3" width="6" height="10" fill={p.main} />
        <rect x="6" y="5" width="1" height="1" fill={p.light} />
        <rect x="9" y="5" width="1" height="1" fill={p.light} />
        <rect x="7" y="9" width="2" height="2" fill={p.accent} />
      </>
    );
  }
  if (variant === 'eye') {
    return (
      <>
        <ellipse cx="8" cy="8" rx="5.3" ry="3.2" fill={p.main} />
        <circle cx="8" cy="8" r="2.1" fill={p.accent} />
        <circle cx="8.8" cy="7.4" r="0.8" fill={p.light} />
      </>
    );
  }
  if (variant === 'gate') {
    return (
      <>
        <rect x="4" y="3" width="8" height="10" fill={p.main} />
        <rect x="6.5" y="5.5" width="3" height="7.5" fill={p.bg} />
        <rect x="4" y="3" width="8" height="2" fill={p.light} />
      </>
    );
  }
  if (variant === 'nexus') {
    return (
      <>
        <polygon points="8,2.5 10.5,5.2 13.2,8 10.5,10.8 8,13.5 5.5,10.8 2.8,8 5.5,5.2" fill={p.main} />
        <polygon points="8,5 10,8 8,11 6,8" fill={p.light} />
      </>
    );
  }
  if (variant === 'blade') {
    return (
      <>
        <polygon points="8,2 10,6 8,12 6,6" fill={p.main} />
        <rect x="6" y="11.5" width="4" height="1.5" fill={p.accent} />
        <rect x="7.2" y="12.5" width="1.6" height="1.5" fill={p.light} />
      </>
    );
  }
  if (variant === 'pillar') {
    return (
      <>
        <rect x="6" y="2.5" width="4" height="11" fill={p.main} />
        <rect x="5" y="2" width="6" height="2" fill={p.light} />
        <rect x="5" y="12" width="6" height="2" fill={p.accent} />
      </>
    );
  }
  if (variant === 'prism') {
    return (
      <>
        <polygon points="8,2.5 12.5,8 8,13.5 3.5,8" fill={p.main} />
        <polygon points="8,4.7 10.4,8 8,11.3 5.6,8" fill={p.light} />
      </>
    );
  }
  if (variant === 'aether') {
    return (
      <>
        <circle cx="8" cy="8" r="4.2" fill={p.main} />
        <rect x="7.2" y="1.8" width="1.6" height="3" fill={p.light} />
        <rect x="11.2" y="7.2" width="3" height="1.6" fill={p.light} />
        <rect x="7.2" y="11.2" width="1.6" height="3" fill={p.light} />
        <rect x="1.8" y="7.2" width="3" height="1.6" fill={p.light} />
      </>
    );
  }
  if (variant === 'tree') {
    return (
      <>
        <rect x="7" y="9" width="2" height="4" fill={p.accent} />
        <polygon points="8,3 12,9 4,9" fill={p.main} />
        <polygon points="8,4.8 10.3,8 5.7,8" fill={p.light} />
      </>
    );
  }
  if (variant === 'orb') {
    return (
      <>
        <circle cx="8" cy="8" r="4" fill={p.main} />
        <circle cx="8" cy="8" r="2" fill={p.light} />
      </>
    );
  }
  if (variant === 'spark') {
    return (
      <>
        <polygon points="8,2.5 9.5,6.5 13.5,8 9.5,9.5 8,13.5 6.5,9.5 2.5,8 6.5,6.5" fill={p.main} />
        <circle cx="8" cy="8" r="1.3" fill={p.light} />
      </>
    );
  }
  return (
    <>
      <polygon points="8,3 10,7 14,8 10,9 8,13 6,9 2,8 6,7" fill={p.main} />
      <circle cx="8" cy="8" r="1.5" fill={p.light} />
    </>
  );
}

function SpriteIcon({ token = 'default', size = 16, locked = false }) {
  const cfg = SPRITE_LIBRARY[token] || SPRITE_LIBRARY.default;
  const palette = locked ? lockedSpritePalette() : cfg;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className="title-sprite"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="14" height="14" rx="2" fill={palette.bg} stroke={palette.edge} strokeWidth="1" />
      <rect x="2" y="2" width="12" height="1.2" fill={palette.light} opacity="0.35" />
      {spriteParts(cfg.variant, palette)}
    </svg>
  );
}

function JourneyCharacter({ running, avatarUrl, username, gender }) {
  const isFemale = gender === 'female';
  const bodyGradient = isFemale ? 'from-pink-300 to-fuchsia-700' : 'from-cyan-300 to-blue-700';
  const accentColor = isFemale ? 'bg-rose-300' : 'bg-sky-200';

  return (
    <div className={`relative w-14 h-16 title-pixel ${running ? 'title-run' : 'title-idle'}`}>
      <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-8 h-2 rounded-full bg-black/60 blur-[1px]" />
      <div className={`absolute left-1/2 top-7 -translate-x-1/2 w-9 h-7 rounded-md border-2 border-black/60 bg-gradient-to-b ${bodyGradient} shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]`} />
      <div className={`absolute left-1/2 top-4 -translate-x-1/2 w-4 h-3 rounded-sm border-2 border-black/60 ${accentColor}`} />
      <div className="absolute left-[34%] top-[76%] w-3 h-5 rounded-b border-2 border-black/60 bg-slate-700" />
      <div className="absolute left-[57%] top-[76%] w-3 h-5 rounded-b border-2 border-black/60 bg-slate-700" />
      <div className="absolute left-[22%] top-[42%] w-3 h-2 rounded-sm border border-black/60 bg-slate-700/80" />
      <div className="absolute left-[72%] top-[42%] w-3 h-2 rounded-sm border border-black/60 bg-slate-700/80" />

      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-8 h-8 rounded-full border-2 border-black/60 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-500">
        {avatarUrl ? (
          <img src={avatarUrl} alt={username || 'avatar'} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-display font-bold text-[10px] text-black">
            {(username || '?')[0].toUpperCase()}
          </div>
        )}
      </div>

      {isFemale ? (
        <div className="absolute left-1/2 top-[2px] -translate-x-1/2 w-10 h-2 rounded-full bg-fuchsia-800/80" />
      ) : (
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 w-4 h-2 rounded-sm bg-sky-900/80" />
      )}
    </div>
  );
}

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
  const [target, setTarget] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const mapScrollRef = useRef(null);

  useEffect(() => {
    if (target === null) setCursor(currentFloat);
  }, [currentFloat, target]);

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
    if (!groups.length || Object.keys(collapsedGroups).length > 0) return;
    const currentFamily = summary?.current_title?.skill_family || '';
    const initial = {};
    for (const group of groups) initial[group.family] = group.family !== currentFamily;
    setCollapsedGroups(initial);
  }, [groups, collapsedGroups, summary]);

  const { points, width, height } = useMemo(() => buildWorldPoints(titles.length || 1), [titles.length]);
  const avatarPos = useMemo(() => interpolatePoint(points, cursor), [points, cursor]);
  const avatarLeftPercent = (avatarPos.x / width) * 100;
  const bandProps = useMemo(() => buildBandProps(points, titles, width), [points, titles, width]);

  const levels = Array.isArray(data?.levels) ? data.levels : [];
  const levelMap = useMemo(() => {
    const map = {};
    for (const level of levels) map[level.level] = level;
    return map;
  }, [levels]);

  const nextLevelPoints = nextTitle ? (levelMap[nextTitle.level]?.points || 0) : 0;
  const sameLevelSegment = nextTitle && summary?.current_title?.level === nextTitle.level;
  const segmentStart = sameLevelSegment ? (summary?.current_title?.required_points || 0) : 0;
  const segmentEarned = Math.max(0, nextLevelPoints - segmentStart);
  const segmentNeeded = nextTitle ? Math.max(1, nextTitle.required_points - segmentStart) : 0;
  const displayedProgress = nextTitle ? clamp(Number(summary?.segment_progress_percent) || 0, 0, 100) : 100;
  const isRunning = target !== null;

  const zones = useMemo(() => {
    const child = getZone(points, titles, ['Beginner', 'Intermediate'], 'child', 'Child Realm (Intermediate)', 'title-zone-child');
    const adolescent = getZone(points, titles, ['Advanced'], 'adolescent', 'Adolescent Realm (Advanced)', 'title-zone-adolescent');
    const adult = getZone(points, titles, ['Expert', 'Master'], 'adult', 'Grown Realm (Expert)', 'title-zone-adult');
    return [adult, adolescent, child].filter(Boolean);
  }, [points, titles]);

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
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
            <p className="text-xs text-gray-500 mt-1">
              {summary.current_title?.name || 'Beginner'}
              {nextTitle ? ` -> ${nextTitle.name}` : ' -> Completed'}
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

        <div className="mt-4 title-map-frame rounded-xl border border-piu-border/50 overflow-hidden">
          <div ref={mapScrollRef} className="max-h-[68vh] sm:max-h-[72vh] overflow-y-auto overflow-x-hidden">
            <div className="relative w-full" style={{ height: `${height}px` }}>
              <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[80%] h-16 rounded-b-[999px] title-world-cap pointer-events-none" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[92%] h-24 rounded-t-[999px] title-world-floor pointer-events-none" />
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mapPathGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7dd3fc" />
                    <stop offset="50%" stopColor="#facc15" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                {points.slice(0, -1).map((point, idx) => {
                  const next = points[idx + 1];
                  return (
                    <line
                      key={`path-${idx}`}
                      x1={point.x}
                      y1={point.y}
                      x2={next.x}
                      y2={next.y}
                      stroke="url(#mapPathGlow)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      opacity="0.55"
                      strokeDasharray={idx % 2 === 0 ? '14 10' : '10 9'}
                    />
                  );
                })}
              </svg>

              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className={`absolute left-2 right-2 rounded-3xl border border-white/20 ${zone.className}`}
                  style={{ top: `${zone.top}px`, height: `${zone.height}px` }}
                >
                  <div className="absolute left-3 top-2 px-2 py-1 rounded-md bg-black/40 text-[10px] font-display font-bold tracking-wide text-white/90">
                    {zone.label}
                  </div>
                  {(ZONE_PROPS[zone.id] || []).map((prop, idx) => (
                    <span
                      key={`${zone.id}-prop-${idx}`}
                      className="absolute w-9 h-9 rounded-full bg-black/25 border border-white/40 flex items-center justify-center backdrop-blur-[1px]"
                      style={{
                        left: `${prop.x}%`,
                        top: `${prop.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <SpriteIcon token={prop.token} size={17} />
                    </span>
                  ))}
                </div>
              ))}

              {bandProps.map((prop) => (
                <span
                  key={prop.id}
                  className={`absolute w-8 h-8 rounded-full border flex items-center justify-center title-prop ${
                    prop.unlocked
                      ? 'bg-black/30 border-white/55 text-white'
                      : 'bg-black/20 border-slate-500/60 text-slate-300'
                  }`}
                  style={{
                    left: `${prop.xPercent}%`,
                    top: `${prop.y}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <SpriteIcon token={prop.token} size={15} locked={!prop.unlocked} />
                </span>
              ))}

              {titles.map((title) => {
                const point = points[title.index];
                const unlocked = !!title.unlocked;
                const isCurrent = title.index === currentIndex;
                const canTravel = unlocked && title.index <= currentIndex;
                const isTarget = target !== null && title.index === target;
                const isNext = !!nextTitle && nextTitle.id === title.id;
                const palette = TIER_PALETTE[title.tier] || TIER_PALETTE.default;
                const pipColor = TIER_PIP_COLOR[title.tier] || TIER_PIP_COLOR.default;
                const theme = getTitleTheme(title);
                const showPlaque = isCurrent || isTarget || isNext;
                return (
                  <div
                    key={title.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${(point.x / width) * 100}%`, top: `${point.y}px` }}
                  >
                    {showPlaque && (
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 whitespace-nowrap px-2 py-[2px] rounded-full border border-white/40 bg-black/55 text-[9px] font-display font-bold text-white pointer-events-none">
                        {theme.landmark}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!canTravel) return;
                        setTarget(title.index);
                      }}
                      className={`relative w-9 h-9 rounded-xl border-2 transition-all ${
                        unlocked
                          ? `bg-gradient-to-b ${palette.bg} border-white/85 text-white title-waypoint-unlocked title-waypoint-spark ${palette.glow}`
                          : 'bg-slate-800/80 border-slate-500/80 text-slate-300'
                      } ${
                        isCurrent ? `ring-2 ${palette.ring} scale-110` : ''
                      } ${
                        isTarget ? 'ring-2 ring-cyan-300/90' : ''
                      } ${
                        canTravel ? 'cursor-pointer hover:scale-110' : 'cursor-default'
                      }`}
                      title={`${title.name} • ${theme.landmark} (${title.earned_points.toLocaleString()} / ${title.required_points.toLocaleString()})`}
                    >
                      <span
                        className="absolute left-[3px] top-[3px] w-1.5 h-1.5 rounded-full border border-white/70"
                        style={{ backgroundColor: pipColor }}
                      />
                      <span className="inline-flex items-center justify-center">
                        <SpriteIcon token={theme.sprite} size={17} locked={!unlocked} />
                      </span>
                      {!unlocked && (
                        <span className="absolute right-[-4px] bottom-[-5px] text-[10px] leading-none">🔒</span>
                      )}
                    </button>
                  </div>
                );
              })}

              <div
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-[86%]"
                style={{ left: `${avatarLeftPercent}%`, top: `${avatarPos.y}px` }}
              >
                <JourneyCharacter
                  running={isRunning}
                  avatarUrl={avatarUrl}
                  username={username}
                  gender={gender}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-[11px] text-gray-500">
            Mobile-safe vertical map. Tap unlocked waypoints to run to that checkpoint.
            {isOwner ? ' Title unlocks are computed from imported best scores.' : ''}
          </p>
        </div>
      </div>

      <div className="card">
        <h4 className="text-xs font-display font-bold text-piu-accent mb-2">TITLE CHECKPOINTS</h4>
        <div className="space-y-2">
          {groups.map((group) => {
            const lockedCount = group.titles.filter((title) => !title.unlocked).length;
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
                    <p className="text-sm font-display font-bold text-gray-100">
                      {group.family}
                      <span className="ml-1.5 inline-flex align-middle">
                        <SpriteIcon token={FAMILY_SPRITE_TOKEN[group.family] || 'default'} size={14} />
                      </span>
                    </p>
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
                      const canTravel = unlocked && title.index <= currentIndex;
                      const palette = TIER_PALETTE[title.tier] || TIER_PALETTE.default;
                      const theme = getTitleTheme(title);
                      return (
                        <button
                          key={`checkpoint-${title.id}`}
                          type="button"
                          onClick={() => {
                            if (!canTravel) return;
                            setTarget(title.index);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                            unlocked
                              ? `bg-gradient-to-r ${palette.bg} border-white/50 text-white`
                              : 'bg-slate-900/60 border-slate-600/50 text-slate-300'
                          } ${isCurrent ? `ring-1 ${palette.ring}` : ''} ${canTravel ? 'cursor-pointer hover:border-white/90' : 'cursor-default'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-display font-bold inline-flex items-center gap-1.5">
                              <span className="inline-flex">
                                <SpriteIcon token={theme.sprite} size={14} locked={!unlocked} />
                              </span>
                              <span>{title.name}</span>
                            </p>
                            <span className="text-[10px] font-mono">
                              {unlocked ? 'UNLOCKED' : `${title.progress_percent.toFixed(1)}%`}
                            </span>
                          </div>
                          <p className={`inline-flex items-center rounded-full px-2 py-[2px] mt-1 text-[9px] font-display font-bold border ${theme.chipClass}`}>
                            {theme.landmark}
                          </p>
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

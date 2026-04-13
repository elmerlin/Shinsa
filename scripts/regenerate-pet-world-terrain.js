#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Database = require('better-sqlite3');
const {
  parseGridData,
  serializeGridData,
  sanitizeGrid,
} = require('../server/lib/petWorld/grid');

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hashSeed(input) {
  let h = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function rand01(seed) {
  let h = seed >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(seed, x, y, scale) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smoothstep(fx - x0);
  const ty = smoothstep(fy - y0);
  const n00 = rand01(seed ^ Math.imul(x0, 374761393) ^ Math.imul(y0, 668265263));
  const n10 = rand01(seed ^ Math.imul(x0 + 1, 374761393) ^ Math.imul(y0, 668265263));
  const n01 = rand01(seed ^ Math.imul(x0, 374761393) ^ Math.imul(y0 + 1, 668265263));
  const n11 = rand01(seed ^ Math.imul(x0 + 1, 374761393) ^ Math.imul(y0 + 1, 668265263));
  const nx0 = lerp(n00, n10, tx);
  const nx1 = lerp(n01, n11, tx);
  return lerp(nx0, nx1, ty);
}

function createGrid(w, h, fill) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function forEachCell(w, h, fn) {
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) fn(x, y);
  }
}

function ellipseInfluence(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return 1 - (dx * dx + dy * dy);
}

function distanceToRect(x, y, rect) {
  const dx = x < rect.minX ? rect.minX - x : x > rect.maxX ? x - rect.maxX : 0;
  const dy = y < rect.minY ? rect.minY - y : y > rect.maxY ? y - rect.maxY : 0;
  return Math.hypot(dx, dy);
}

function makeRectMask(w, h, rects, pad = 0) {
  const mask = createGrid(w, h, false);
  forEachCell(w, h, (x, y) => {
    mask[y][x] = rects.some((rect) => (
      x >= rect.minX - pad
      && x <= rect.maxX + pad
      && y >= rect.minY - pad
      && y <= rect.maxY + pad
    ));
  });
  return mask;
}

function neighbors4(x, y) {
  return [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];
}

function neighbors8(x, y) {
  return [
    [x - 1, y - 1], [x, y - 1], [x + 1, y - 1],
    [x - 1, y],                 [x + 1, y],
    [x - 1, y + 1], [x, y + 1], [x + 1, y + 1],
  ];
}

function floodFillMain(mask, startX, startY) {
  const h = mask.length;
  const w = mask[0].length;
  if (!mask[startY]?.[startX]) return createGrid(w, h, false);
  const keep = createGrid(w, h, false);
  const stack = [[startX, startY]];
  keep[startY][startX] = true;
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [nx, ny] of neighbors4(x, y)) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!mask[ny][nx] || keep[ny][nx]) continue;
      keep[ny][nx] = true;
      stack.push([nx, ny]);
    }
  }
  return keep;
}

function cardinalCount(mask, x, y, wanted = true) {
  let count = 0;
  for (const [nx, ny] of neighbors4(x, y)) {
    if (mask[ny]?.[nx] === wanted) count += 1;
  }
  return count;
}

function adjacentCount(mask, x, y, wanted = true) {
  let count = 0;
  for (const [nx, ny] of neighbors8(x, y)) {
    if (mask[ny]?.[nx] === wanted) count += 1;
  }
  return count;
}

function smoothLandMask(mask, keepMask, passes = 2) {
  let current = cloneGrid(mask);
  const h = current.length;
  const w = current[0].length;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = cloneGrid(current);
    forEachCell(w, h, (x, y) => {
      if (keepMask[y][x]) {
        next[y][x] = true;
        return;
      }
      const count = adjacentCount(current, x, y, true);
      if (current[y][x]) {
        next[y][x] = count >= 3;
      } else {
        next[y][x] = count >= 6;
      }
    });
    current = next;
  }
  return current;
}

function carveEllipse(mask, cx, cy, rx, ry, keepMask) {
  const h = mask.length;
  const w = mask[0].length;
  forEachCell(w, h, (x, y) => {
    if (keepMask?.[y]?.[x]) return;
    if (ellipseInfluence(x, y, cx, cy, rx, ry) >= 0) mask[y][x] = false;
  });
}

function carvePolyline(mask, points, widthFn, keepMask) {
  const h = mask.length;
  const w = mask[0].length;
  const segs = [];
  for (let i = 0; i < points.length - 1; i += 1) segs.push([points[i], points[i + 1]]);
  forEachCell(w, h, (x, y) => {
    if (keepMask?.[y]?.[x]) return;
    let best = Infinity;
    let tAtBest = 0;
    for (const [[ax, ay], [bx, by]] of segs) {
      const abx = bx - ax;
      const aby = by - ay;
      const lenSq = abx * abx + aby * aby || 1;
      const t = clamp((((x - ax) * abx) + ((y - ay) * aby)) / lenSq, 0, 1);
      const px = ax + abx * t;
      const py = ay + aby * t;
      const dist = Math.hypot(x - px, y - py);
      if (dist < best) {
        best = dist;
        tAtBest = t;
      }
    }
    if (best <= widthFn(tAtBest)) mask[y][x] = false;
  });
}

function computeVillageRect(buildings) {
  const xs = buildings.map((b) => [b.grid_x, b.grid_x + b.width - 1]).flat();
  const ys = buildings.map((b) => [b.grid_y, b.grid_y + b.height - 1]).flat();
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function chooseAnchors(mask, keepMask, villageRect, count, seed, used = []) {
  const h = mask.length;
  const w = mask[0].length;
  const cx = (villageRect.minX + villageRect.maxX) / 2;
  const cy = (villageRect.minY + villageRect.maxY) / 2;
  const candidates = [];
  forEachCell(w, h, (x, y) => {
    if (!mask[y][x] || keepMask[y][x]) return;
    const distVillage = distanceToRect(x, y, villageRect);
    if (distVillage < 6) return;
    const distWater = distanceToWater(mask, x, y);
    const edgeDistance = Math.min(x, y, w - 1 - x, h - 1 - y);
    const waterBias = -Math.abs(distWater - 2.5) * 0.9;
    const edgeBias = Math.max(0, 6 - edgeDistance) * 0.35;
    const noise = valueNoise(seed ^ 0x9e3779b9, x, y, 4.2) * 0.8;
    const score = distVillage * 0.8 + edgeBias + waterBias + noise;
    candidates.push({ x, y, score });
  });
  candidates.sort((a, b) => b.score - a.score);
  const anchors = [];
  for (const candidate of candidates) {
    if (anchors.length >= count) break;
    const tooClose = anchors.concat(used).some((a) => Math.hypot(candidate.x - a.x, candidate.y - a.y) < 7);
    if (tooClose) continue;
    anchors.push(candidate);
  }
  return anchors;
}

function distanceToWater(mask, x, y) {
  const h = mask.length;
  const w = mask[0].length;
  let best = Infinity;
  forEachCell(w, h, (cx, cy) => {
    if (!mask[cy][cx]) best = Math.min(best, Math.hypot(x - cx, y - cy));
  });
  return best;
}

function canDecorate(mask, keepMask, x, y) {
  if (!mask[y]?.[x] || keepMask[y]?.[x]) return false;
  return distanceToWater(mask, x, y) >= 1.6;
}

function findNearestLand(mask, keepMask, x, y, maxRadius = 6) {
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let ny = y - radius; ny <= y + radius; ny += 1) {
      for (let nx = x - radius; nx <= x + radius; nx += 1) {
        if (!mask[ny]?.[nx] || keepMask[ny]?.[nx]) continue;
        if (distanceToWater(mask, nx, ny) < 1.6) continue;
        return { x: nx, y: ny };
      }
    }
  }
  return null;
}

function layForest(mask, tiles, keepMask, villageRect, anchor, seed) {
  const h = mask.length;
  const w = mask[0].length;
  const radiusX = 4.8 + valueNoise(seed ^ 101, anchor.x, anchor.y, 6) * 2.6;
  const radiusY = 4.1 + valueNoise(seed ^ 202, anchor.x + 5, anchor.y + 5, 5) * 2.3;
  const treeCells = [];
  forEachCell(w, h, (x, y) => {
    if (!canDecorate(mask, keepMask, x, y)) return;
    const edgeFactor = ellipseInfluence(x, y, anchor.x, anchor.y, radiusX, radiusY);
    const wobble = (valueNoise(seed ^ 303, x, y, 3.2) - 0.5) * 0.45;
    if (edgeFactor + wobble < 0.08) return;
    tiles[y][x].t = 'tree';
    treeCells.push({ x, y });
  });
  const frontier = [];
  for (const cell of treeCells) {
    for (const [nx, ny] of neighbors8(cell.x, cell.y)) {
      if (!tiles[ny]?.[nx] || tiles[ny][nx].t !== 'ground') continue;
      if (!canDecorate(mask, keepMask, nx, ny)) continue;
      frontier.push({
        x: nx,
        y: ny,
        score: distanceToRect(nx, ny, villageRect),
      });
    }
  }
  frontier.sort((a, b) => a.score - b.score);
  const seen = new Set();
  let placedStumps = 0;
  for (const cell of frontier) {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (placedStumps >= 2) break;
    tiles[cell.y][cell.x].t = 'stump';
    placedStumps += 1;
  }
}

function layRockPatch(mask, tiles, keepMask, anchor, seed) {
  const h = mask.length;
  const w = mask[0].length;
  const radius = 2.8 + valueNoise(seed ^ 404, anchor.x, anchor.y, 4) * 1.8;
  forEachCell(w, h, (x, y) => {
    if (!canDecorate(mask, keepMask, x, y)) return;
    const edgeFactor = ellipseInfluence(x, y, anchor.x, anchor.y, radius, radius * 0.8);
    const wobble = (valueNoise(seed ^ 505, x + 9, y + 9, 2.5) - 0.5) * 0.4;
    if (edgeFactor + wobble < 0.04) return;
    tiles[y][x].t = 'rock';
  });
}

function layBushes(mask, tiles, keepMask, seed) {
  const h = mask.length;
  const w = mask[0].length;
  forEachCell(w, h, (x, y) => {
    if (!canDecorate(mask, keepMask, x, y)) return;
    if (tiles[y][x].t !== 'ground') return;
    const treeNeighbors = neighbors8(x, y).filter(([nx, ny]) => tiles[ny]?.[nx]?.t === 'tree').length;
    if (treeNeighbors === 0) return;
    const score = valueNoise(seed ^ 606, x, y, 2.8);
    if (score > 0.56) tiles[y][x].t = 'bush';
  });
}

function renderPreview(grid, buildings, previewPath) {
  const palette = {
    water: '#52a8f0',
    ground: '#7ed149',
    tree: '#2d7f3d',
    bush: '#5ca84b',
    rock: '#7e7a72',
    stump: '#8f6f46',
  };
  const cell = 18;
  const w = grid.w * cell;
  const h = grid.h * cell;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    '<rect width="100%" height="100%" fill="#1c1c1c"/>',
  ];
  forEachCell(grid.w, grid.h, (x, y) => {
    const tile = grid.tiles[y][x];
    const fill = palette[tile.t] || palette.ground;
    parts.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell - 1}" height="${cell - 1}" fill="${fill}"/>`);
  });
  for (const building of buildings) {
    parts.push(
      `<rect x="${building.grid_x * cell + 2}" y="${building.grid_y * cell + 2}" width="${building.width * cell - 4}" height="${building.height * cell - 4}" fill="none" stroke="#7a2e1c" stroke-width="2"/>`,
    );
  }
  parts.push('</svg>');
  const svg = parts.join('');
  const svgPath = previewPath.replace(/\.png$/i, '.svg');
  fs.writeFileSync(svgPath, svg);
  return sharp(Buffer.from(svg)).png().toFile(previewPath);
}

function regenerateGrid(originalGrid, buildings, seedInput) {
  const w = originalGrid.w;
  const h = originalGrid.h;
  const tiles = createGrid(w, h, null).map((row) => row.map(() => ({ t: 'ground', b: null })));
  const villageRect = computeVillageRect(buildings);
  const villageCx = (villageRect.minX + villageRect.maxX) / 2;
  const villageCy = (villageRect.minY + villageRect.maxY) / 2;
  const seed = hashSeed(seedInput);
  const keepRects = buildings.map((b) => ({
    minX: b.grid_x,
    minY: b.grid_y,
    maxX: b.grid_x + b.width - 1,
    maxY: b.grid_y + b.height - 1,
  }));
  const terrainKeepMask = makeRectMask(w, h, keepRects, 1);
  const decorKeepMask = makeRectMask(w, h, keepRects, 2);
  const land = createGrid(w, h, false);

  const positiveLobes = [
    [villageCx - 1.0, villageCy - 0.5, 10.5, 8.8],
    [villageCx - 8.2, villageCy + 1.8, 6.8, 5.8],
    [villageCx + 8.0, villageCy + 0.2, 6.8, 5.7],
    [villageCx + 1.8, villageCy + 7.8, 8.2, 6.0],
    [villageCx - 6.2, villageCy + 8.0, 5.6, 4.8],
    [villageCx - 8.2, villageCy - 6.6, 6.0, 5.0],
    [villageCx + 7.2, villageCy - 7.0, 6.2, 5.0],
    [villageCx + 5.2, villageCy + 7.5, 6.6, 4.8],
  ];

  const negativeLobes = [
    [villageCx - 12.5, villageCy - 0.2, 3.2, 5.5],
    [villageCx + 13.0, villageCy + 4.8, 3.4, 5.8],
    [villageCx - 0.4, villageCy + 12.8, 5.8, 3.0],
    [villageCx - 10.5, villageCy + 12.0, 3.0, 4.2],
    [villageCx + 11.2, villageCy - 11.0, 3.6, 2.8],
    [villageCx - 12.4, villageCy - 9.5, 2.8, 3.2],
  ];

  forEachCell(w, h, (x, y) => {
    let score = -0.55;
    for (const [cx, cy, rx, ry] of positiveLobes) {
      score = Math.max(score, ellipseInfluence(x, y, cx, cy, rx, ry));
    }
    for (const [cx, cy, rx, ry] of negativeLobes) {
      score -= Math.max(0, ellipseInfluence(x, y, cx, cy, rx, ry)) * 0.9;
    }
    score += (valueNoise(seed ^ 0x13579, x, y, 4.8) - 0.5) * 0.35;
    score += (valueNoise(seed ^ 0x24680, x + 10, y + 10, 2.6) - 0.5) * 0.18;
    land[y][x] = score > 0.06;
  });

  forEachCell(w, h, (x, y) => {
    if (terrainKeepMask[y][x]) land[y][x] = true;
  });
  let mainLand = floodFillMain(land, Math.round(villageCx), Math.round(villageCy));
  mainLand = smoothLandMask(mainLand, terrainKeepMask, 2);

  // Carve a large lake, a smaller pond, and a meandering stream.
  carveEllipse(mainLand, villageCx + 3.5, villageCy + 6.8, 4.2, 3.1, terrainKeepMask);
  carveEllipse(mainLand, villageCx + 5.8, villageCy - 0.2, 2.2, 1.5, terrainKeepMask);
  carvePolyline(
    mainLand,
    [
      [villageCx + 6.2, 0.5],
      [villageCx + 6.8, villageCy - 6.0],
      [villageCx + 6.2, villageCy - 2.4],
      [villageCx + 5.8, villageCy - 0.2],
    ],
    (t) => 0.9 + (t * 0.6),
    terrainKeepMask,
  );

  forEachCell(w, h, (x, y) => {
    if (terrainKeepMask[y][x]) mainLand[y][x] = true;
  });
  mainLand = floodFillMain(mainLand, Math.round(villageCx), Math.round(villageCy));

  forEachCell(w, h, (x, y) => {
    tiles[y][x].t = mainLand[y][x] ? 'ground' : 'water';
    tiles[y][x].b = null;
  });

  // Restore building occupancy from the table rather than trusting stale grid cells.
  for (const building of buildings) {
    for (let dy = 0; dy < building.height; dy += 1) {
      for (let dx = 0; dx < building.width; dx += 1) {
        if (!tiles[building.grid_y + dy]?.[building.grid_x + dx]) continue;
        tiles[building.grid_y + dy][building.grid_x + dx].b = building.id;
        tiles[building.grid_y + dy][building.grid_x + dx].t = 'ground';
      }
    }
  }

  const requestedForestAnchors = [
    { x: Math.round(villageCx - 9), y: Math.round(villageCy - 8) },
    { x: Math.round(villageCx + 8), y: Math.round(villageCy - 8) },
    { x: Math.round(villageCx - 8), y: Math.round(villageCy + 9) },
    { x: Math.round(villageCx + 8), y: Math.round(villageCy + 10) },
  ];
  const forestAnchors = requestedForestAnchors
    .map((anchor) => findNearestLand(mainLand, decorKeepMask, anchor.x, anchor.y))
    .filter(Boolean);
  while (forestAnchors.length < 4) {
    const extra = chooseAnchors(mainLand, decorKeepMask, villageRect, 1, seed ^ 0xabc123, forestAnchors);
    if (!extra.length) break;
    forestAnchors.push(extra[0]);
  }
  for (const anchor of forestAnchors) layForest(mainLand, tiles, decorKeepMask, villageRect, anchor, seed);

  const requestedRockAnchors = [
    { x: Math.round(villageCx - 12), y: Math.round(villageCy + 0) },
    { x: Math.round(villageCx + 11), y: Math.round(villageCy - 2) },
    { x: Math.round(villageCx + 2), y: Math.round(villageCy + 11) },
  ];
  const rockAnchors = requestedRockAnchors
    .map((anchor) => findNearestLand(mainLand, decorKeepMask, anchor.x, anchor.y))
    .filter(Boolean);
  while (rockAnchors.length < 3) {
    const extra = chooseAnchors(mainLand, decorKeepMask, villageRect, 1, seed ^ 0xdef456, forestAnchors.concat(rockAnchors));
    if (!extra.length) break;
    rockAnchors.push(extra[0]);
  }
  for (const anchor of rockAnchors) layRockPatch(mainLand, tiles, decorKeepMask, anchor, seed);

  layBushes(mainLand, tiles, decorKeepMask, seed);

  const features = [
    { type: 'lake', x: Math.round(villageCx + 3.5), y: Math.round(villageCy + 6.8), w: 8, h: 6 },
    { type: 'pond', x: Math.round(villageCx + 5.8), y: Math.round(villageCy - 0.2), w: 5, h: 4 },
    { type: 'stream', x: Math.round(villageCx + 6.2), y: 0, w: 3, h: Math.round(villageCy - 0.2) },
  ];

  const next = {
    v: originalGrid.v || 1,
    w,
    h,
    tiles,
    features,
  };
  return sanitizeGrid(next).grid;
}

async function main() {
  const dbPath = argValue('--db', path.join(process.cwd(), '.tmp/db/shinsa-production-2026-04-12.dev.db'));
  const username = argValue('--user', 'ELMER');
  const previewPath = argValue('--preview', `/tmp/${username.toLowerCase()}_pet_world_regen.png`);
  const apply = hasFlag('--apply');
  const targetW = clamp(toInt(argValue('--target-w', null), null) || 0, 0, 30) || null;
  const targetH = clamp(toInt(argValue('--target-h', null), null) || 0, 0, 30) || null;
  const targetExpansions = toInt(argValue('--target-expansions', null), null);

  const db = new Database(dbPath);
  const world = db.prepare(`
    SELECT pw.user_id, pw.grid_data, pw.biome, pw.grid_width, pw.grid_height
    FROM pet_worlds pw
    JOIN users u ON u.id = pw.user_id
    WHERE u.username = ?
  `).get(username);

  if (!world) throw new Error(`No Pet World found for ${username}`);

  const buildings = db.prepare(`
    SELECT id, building_type, grid_x, grid_y, width, height
    FROM pet_world_buildings
    WHERE user_id = ?
    ORDER BY grid_y, grid_x, id
  `).all(world.user_id);

  let originalGrid = parseGridData(world.grid_data);
  let workingBuildings = buildings.map((b) => ({ ...b }));
  let appliedShift = { x: 0, y: 0 };

  if (targetW && targetH && (targetW !== originalGrid.w || targetH !== originalGrid.h)) {
    const footprint = computeVillageRect(workingBuildings);
    const footprintW = footprint.maxX - footprint.minX + 1;
    const footprintH = footprint.maxY - footprint.minY + 1;
    const desiredMinX = Math.max(1, Math.floor((targetW - footprintW) / 2));
    const desiredMinY = Math.max(2, Math.floor((targetH - footprintH) / 2));
    appliedShift = {
      x: desiredMinX - footprint.minX,
      y: desiredMinY - footprint.minY,
    };
    workingBuildings = workingBuildings.map((b) => ({
      ...b,
      grid_x: b.grid_x + appliedShift.x,
      grid_y: b.grid_y + appliedShift.y,
    }));
    originalGrid = {
      v: originalGrid.v || 1,
      w: targetW,
      h: targetH,
      tiles: createGrid(targetW, targetH, null).map((row) => row.map(() => ({ t: 'ground', b: null }))),
      features: [],
    };
  }

  const regenerated = regenerateGrid(originalGrid, workingBuildings, `${world.user_id}:${world.biome}:regen-v1:${originalGrid.w}x${originalGrid.h}`);
  await renderPreview(regenerated, workingBuildings, previewPath);

  if (apply) {
    const tx = db.transaction(() => {
      if (appliedShift.x || appliedShift.y) {
        const updateBuilding = db.prepare('UPDATE pet_world_buildings SET grid_x = ?, grid_y = ? WHERE id = ? AND user_id = ?');
        for (const building of workingBuildings) {
          updateBuilding.run(building.grid_x, building.grid_y, building.id, world.user_id);
        }
      }
      db.prepare('UPDATE pet_worlds SET grid_width = ?, grid_height = ?, grid_data = ?, expansions = COALESCE(?, expansions) WHERE user_id = ?')
        .run(regenerated.w, regenerated.h, serializeGridData(regenerated), Number.isFinite(targetExpansions) ? targetExpansions : null, world.user_id);
    });
    tx();
  }

  const counts = regenerated.tiles.flat().reduce((acc, tile) => {
    acc[tile.t] = (acc[tile.t] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    username,
    dbPath,
    applied: apply,
    previewPath,
    shift: appliedShift,
    counts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

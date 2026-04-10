'use strict';

// ---------------------------------------------------------------------------
//  Pet Bomber -- Bot AI
//
//  Strategies:
//    1. FLEE danger zones immediately (highest priority)
//    2. COLLECT nearby power-ups
//    3. BOMB adjacent soft blocks (only if escape is verified safe)
//    4. WANDER toward soft blocks (prefer multi-exit positions)
//    5. COLLECT distant power-ups
//    6. HUNT enemies (approach + bomb when adjacent)
//    7. IDLE
//
//  Key improvements over naive AI:
//    - Respects passable bombs (bot can walk through its own just-placed bombs)
//    - Timing-aware escape validation (escape path must be reachable before fuse)
//    - Dead-end avoidance (prefer positions with 2+ walkable exits)
//    - Random hesitation makes bot beatable by humans
// ---------------------------------------------------------------------------

// Grid cell types (matching simulation.js)
const EMPTY = 0;
const HARD  = 1;
const SOFT  = 2;

// Overlay marker for composite grid
const BOMB_CELL = 3;

// Timing constants (must match simulation.js)
const BOMB_FUSE     = 2.5;   // seconds
const SAFETY_MARGIN = 0.5;   // seconds buffer for escape

// Bot imperfection tuning
const IDLE_CHANCE        = 0.08;  // 8% of ticks, bot does nothing
const BOMB_HESITATE      = 0.18;  // 18% chance to skip a bomb opportunity
const ITEM_NEARBY_RANGE  = 8;     // prefer items within this BFS distance

// Cardinal directions (shared across all functions)
const DIRS = [
  { dr: -1, dc: 0, name: 'up' },
  { dr:  1, dc: 0, name: 'down' },
  { dr:  0, dc: -1, name: 'left' },
  { dr:  0, dc:  1, name: 'right' },
];

// ─── BFS pathfinding ─────────────────────────────────────────────
/**
 * BFS from `start` to the first cell that satisfies `goalFn`.
 * @param {number[][]} grid   - composite grid (EMPTY/HARD/SOFT/BOMB_CELL)
 * @param {{r,c}}     start   - starting position
 * @param {Function}  goalFn  - (r,c) => boolean
 * @param {Function|null} avoidFn - (r,c) => boolean, cells to skip during expansion
 * @param {number}    [maxDepth] - optional depth limit (won't expand beyond this)
 * @returns {string[]|null} array of direction names, or null if unreachable
 */
function bfs(grid, start, goalFn, avoidFn, maxDepth) {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = Array.from({ length: rows }, () => new Uint8Array(cols));
  const queue = [{ r: start.r, c: start.c, path: [] }];
  visited[start.r][start.c] = 1;

  while (queue.length > 0) {
    const cur = queue.shift();
    if (goalFn(cur.r, cur.c)) return cur.path;

    // Don't expand beyond maxDepth
    if (maxDepth !== undefined && cur.path.length >= maxDepth) continue;

    for (const d of DIRS) {
      const nr = cur.r + d.dr;
      const nc = cur.c + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (visited[nr][nc]) continue;

      const cell = grid[nr][nc];
      if (cell === HARD || cell === SOFT || cell === BOMB_CELL) continue;
      if (avoidFn && avoidFn(nr, nc)) continue;

      visited[nr][nc] = 1;
      queue.push({ r: nr, c: nc, path: [...cur.path, d.name] });
    }
  }

  return null;
}

// ─── Build composite grid ────────────────────────────────────────
// Overlays bomb positions onto the raw grid so BFS treats them as walls.
// CRITICAL: skips bombs the bot can walk through (its own passable bombs)
// so BFS can correctly plan escape routes after placing a bomb.
function buildBotGrid(state, botPlayer) {
  const grid = state.grid;
  const rows = grid.length;
  const cols = grid[0].length;
  const botGrid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => grid[y][x])
  );

  for (const bomb of state.bombs.values()) {
    const bx = Math.round(bomb.x);
    const by = Math.round(bomb.y);
    if (by < 0 || by >= rows || bx < 0 || bx >= cols) continue;
    if (botGrid[by][bx] !== EMPTY) continue;

    // Bot can walk through its own passable bombs (just placed, still overlapping)
    if (botPlayer) {
      if (botPlayer.canPass) continue;
      if (botPlayer.passableBombs && botPlayer.passableBombs.has(bomb.id)) continue;
    }

    botGrid[by][bx] = BOMB_CELL;
  }

  return botGrid;
}

// ─── Danger detection ────────────────────────────────────────────
// Marks every cell that is in any bomb's blast zone or active explosion.
function buildDangerMap(botGrid, state, blastRanges) {
  const rows = botGrid.length;
  const cols = botGrid[0].length;
  const danger = Array.from({ length: rows }, () => new Uint8Array(cols));

  for (const bomb of state.bombs.values()) {
    const br = Math.round(bomb.y);
    const bc = Math.round(bomb.x);
    const range = blastRanges[bomb.owner] || bomb.blastRange || 2;

    if (br >= 0 && br < rows && bc >= 0 && bc < cols) {
      danger[br][bc] = 1;
    }

    for (const d of DIRS) {
      for (let i = 1; i <= range; i++) {
        const nr = br + d.dr * i;
        const nc = bc + d.dc * i;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
        const cell = botGrid[nr][nc];
        if (cell === HARD) break;
        danger[nr][nc] = 1;
        if (cell === SOFT) break;
      }
    }
  }

  // Mark cells with active explosions
  for (const exp of state.explosions.values()) {
    const cx = exp.cx;
    const cy = exp.cy;
    if (cy >= 0 && cy < rows && cx >= 0 && cx < cols) danger[cy][cx] = 1;
    const arms = [
      { dx: 0, dy: -1, len: exp.up },
      { dx: 0, dy:  1, len: exp.down },
      { dx: -1, dy: 0, len: exp.left },
      { dx:  1, dy: 0, len: exp.right },
    ];
    for (const arm of arms) {
      for (let i = 1; i <= arm.len; i++) {
        const ax = cx + arm.dx * i;
        const ay = cy + arm.dy * i;
        if (ay >= 0 && ay < rows && ax >= 0 && ax < cols) danger[ay][ax] = 1;
      }
    }
  }

  return danger;
}

// ─── Helpers ─────────────────────────────────────────────────────

function getAdjacentCells(r, c, grid) {
  const result = [];
  const rows = grid.length;
  const cols = grid[0].length;
  for (const d of DIRS) {
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      result.push({ r: nr, c: nc, dir: d.name, cell: grid[nr][nc] });
    }
  }
  return result;
}

function isAdjacentToSoftBlock(r, c, grid) {
  return getAdjacentCells(r, c, grid).some(a => a.cell === SOFT);
}

function hasBombAt(state, r, c) {
  for (const b of state.bombs.values()) {
    if (Math.round(b.y) === r && Math.round(b.x) === c) return true;
  }
  return false;
}

/** Count walkable (EMPTY) exits from position — used for dead-end avoidance */
function countExits(grid, r, c) {
  let count = 0;
  const rows = grid.length;
  const cols = grid[0].length;
  for (const d of DIRS) {
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      if (grid[nr][nc] === EMPTY) count++;
    }
  }
  return count;
}

// ─── Escape validation ──────────────────────────────────────────
// Simulates placing a bomb at (br, bc) and checks whether the bot
// can reach a safe cell before the fuse expires.
// Returns the escape path (array of direction names) or null.
function findEscapePath(botGrid, state, botPlayer, blastRanges, br, bc) {
  const rows = botGrid.length;
  const cols = botGrid[0].length;

  // Build danger map with a hypothetical bomb at the bot's position
  const fakeBombs = new Map(state.bombs);
  fakeBombs.set('__fake__', {
    x: bc, y: br,
    owner: botPlayer.id,
    blastRange: botPlayer.blastRange || 2,
  });

  const fakeDanger = buildDangerMap(
    botGrid,
    { bombs: fakeBombs, explosions: state.explosions },
    blastRanges
  );

  // Max cells the bot can traverse before the bomb detonates
  const speed = botPlayer.speed || 3;
  const maxSteps = Math.floor((BOMB_FUSE - SAFETY_MARGIN) * speed);

  // BFS to find a safe cell, allowing traversal THROUGH danger zones
  // (the bot must walk through the blast zone to escape it)
  const path = bfs(
    botGrid,
    { r: br, c: bc },
    (r, c) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
      const cell = botGrid[r][c];
      if (cell === HARD || cell === SOFT || cell === BOMB_CELL) return false;
      return fakeDanger[r][c] === 0;
    },
    null,      // allow traversing danger cells
    maxSteps   // don't search beyond reachable distance
  );

  return path;
}

// ─── Main bot AI ─────────────────────────────────────────────────
/**
 * @param {object} state     - Simulation round state
 * @param {object} botPlayer - The bot's player entry from state.players Map
 * @returns {{ dir: string|null, bomb: boolean }}
 */
function getInput(state, botPlayer) {
  if (!botPlayer || !botPlayer.alive) return { dir: null, bomb: false };

  const { grid } = state;
  if (!grid || grid.length === 0) return { dir: null, bomb: false };

  // Random hesitation — makes the bot beatable by giving the player
  // small windows of opportunity when the bot pauses.
  if (Math.random() < IDLE_CHANCE) return { dir: null, bomb: false };

  const botGrid = buildBotGrid(state, botPlayer);

  // Bot position in grid coords (row=y, col=x)
  const br = Math.round(botPlayer.y);
  const bc = Math.round(botPlayer.x);
  const rows = grid.length;
  const cols = grid[0].length;

  // Blast range lookup by player id
  const blastRanges = {};
  for (const p of state.players.values()) {
    blastRanges[p.id] = p.blastRange || 2;
  }

  const danger = buildDangerMap(botGrid, state, blastRanges);
  const inDanger = br >= 0 && br < rows && bc >= 0 && bc < cols && danger[br][bc] === 1;

  const isSafe = (r, c) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    const cell = botGrid[r][c];
    if (cell === HARD || cell === SOFT || cell === BOMB_CELL) return false;
    return danger[r][c] === 0;
  };

  // ── Priority 1: FLEE from danger ──────────────────────────────
  // When standing in a blast zone or active explosion, escape immediately.
  if (inDanger) {
    // BFS to nearest safe cell, traversing through danger zones
    const path = bfs(botGrid, { r: br, c: bc }, (r, c) => isSafe(r, c), null);
    if (path && path.length > 0) {
      return { dir: path[0], bomb: false };
    }
    // No safe path found — desperately move to any walkable cell
    const adj = getAdjacentCells(br, bc, botGrid);
    for (const a of adj) {
      if (a.cell !== HARD && a.cell !== SOFT && a.cell !== BOMB_CELL) {
        return { dir: a.dir, bomb: false };
      }
    }
    return { dir: null, bomb: false };
  }

  // ── Priority 2: COLLECT nearby items ──────────────────────────
  // Power-ups are valuable — grab them if they're close and safe to reach.
  if (state.items.size > 0) {
    const avoidDanger = (r, c) => danger[r][c] === 1;
    let bestPath = null;
    for (const item of state.items.values()) {
      const path = bfs(
        botGrid,
        { r: br, c: bc },
        (r, c) => r === item.y && c === item.x,
        avoidDanger
      );
      if (path && path.length <= ITEM_NEARBY_RANGE && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
    if (bestPath && bestPath.length > 0) {
      return { dir: bestPath[0], bomb: false };
    }
  }

  // ── Priority 3: BOMB near soft blocks ─────────────────────────
  // Only place a bomb if:
  //   a) Adjacent to at least one soft block
  //   b) No bomb already here
  //   c) Bot hasn't used all bomb slots
  //   d) A timed escape route exists (can reach safety before fuse)
  //   e) Random hesitation check passes (makes bot beatable)
  if (isAdjacentToSoftBlock(br, bc, botGrid)) {
    if (!hasBombAt(state, br, bc)
        && (botPlayer.bombsPlaced || 0) < (botPlayer.maxBombs || 1)
        && Math.random() > BOMB_HESITATE) {
      const escPath = findEscapePath(botGrid, state, botPlayer, blastRanges, br, bc);
      if (escPath && escPath.length > 0) {
        // Place bomb AND immediately start escaping
        return { dir: escPath[0], bomb: true };
      }
      // Can't safely bomb here — fall through to wander for a better spot
    }
  }

  // ── Priority 4: WANDER toward soft blocks ─────────────────────
  // Move toward a cell adjacent to soft blocks, preferring positions
  // with 2+ walkable exits (avoiding dead ends where escape is hard).
  {
    const avoidDanger = (r, c) => danger[r][c] === 1;

    // First: multi-exit positions (safer for bombing)
    const path = bfs(
      botGrid,
      { r: br, c: bc },
      (r, c) => isAdjacentToSoftBlock(r, c, botGrid) && countExits(botGrid, r, c) >= 2,
      avoidDanger
    );
    if (path && path.length > 0) {
      return { dir: path[0], bomb: false };
    }

    // Fallback: any position adjacent to soft blocks
    const path2 = bfs(
      botGrid,
      { r: br, c: bc },
      (r, c) => isAdjacentToSoftBlock(r, c, botGrid),
      avoidDanger
    );
    if (path2 && path2.length > 0) {
      return { dir: path2[0], bomb: false };
    }
  }

  // ── Priority 5: COLLECT distant items ─────────────────────────
  if (state.items.size > 0) {
    const avoidDanger = (r, c) => danger[r][c] === 1;
    let bestPath = null;
    for (const item of state.items.values()) {
      const path = bfs(
        botGrid,
        { r: br, c: bc },
        (r, c) => r === item.y && c === item.x,
        avoidDanger
      );
      if (path && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
    if (bestPath && bestPath.length > 0) {
      return { dir: bestPath[0], bomb: false };
    }
  }

  // ── Priority 6: HUNT other players ────────────────────────────
  // When no soft blocks or items remain, seek out enemies.
  {
    const avoidDanger = (r, c) => danger[r][c] === 1;

    // Check if already adjacent to an enemy — try to bomb them
    for (const enemy of state.players.values()) {
      if (enemy.id === botPlayer.id || !enemy.alive) continue;
      const er = Math.round(enemy.y);
      const ec = Math.round(enemy.x);
      if (Math.abs(br - er) + Math.abs(bc - ec) <= 1) {
        // Adjacent to enemy — try to bomb if safe
        if (!hasBombAt(state, br, bc)
            && (botPlayer.bombsPlaced || 0) < (botPlayer.maxBombs || 1)
            && Math.random() > BOMB_HESITATE) {
          const escPath = findEscapePath(botGrid, state, botPlayer, blastRanges, br, bc);
          if (escPath && escPath.length > 0) {
            return { dir: escPath[0], bomb: true };
          }
        }
        break; // don't check more enemies for bombing
      }
    }

    // Not adjacent — move toward nearest enemy
    let bestPath = null;
    for (const enemy of state.players.values()) {
      if (enemy.id === botPlayer.id || !enemy.alive) continue;
      const er = Math.round(enemy.y);
      const ec = Math.round(enemy.x);

      const path = bfs(
        botGrid,
        { r: br, c: bc },
        (r, c) => Math.abs(r - er) + Math.abs(c - ec) <= 1,
        avoidDanger
      );
      if (path && path.length > 0 && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }

    if (bestPath && bestPath.length > 0) {
      return { dir: bestPath[0], bomb: false };
    }
  }

  // ── Priority 7: IDLE ──────────────────────────────────────────
  return { dir: null, bomb: false };
}

module.exports = { getInput };

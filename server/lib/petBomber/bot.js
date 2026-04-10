'use strict';

// Grid cell types (matching simulation.js constants)
const EMPTY = 0;
const HARD  = 1;
const SOFT  = 2;

// Internal overlay markers for composite grid
const BOMB_CELL = 3;

// ─── BFS pathfinding ─────────────────────────────────────────────
function bfs(botGrid, start, goalFn, avoidDanger) {
  const rows = botGrid.length;
  const cols = botGrid[0].length;
  const visited = Array.from({ length: rows }, () => new Uint8Array(cols));
  const queue = [{ r: start.r, c: start.c, path: [] }];
  visited[start.r][start.c] = 1;

  const dirs = [
    { dr: -1, dc: 0, name: 'up' },
    { dr: 1, dc: 0, name: 'down' },
    { dr: 0, dc: -1, name: 'left' },
    { dr: 0, dc: 1, name: 'right' },
  ];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (goalFn(cur.r, cur.c)) return cur.path;

    for (const d of dirs) {
      const nr = cur.r + d.dr;
      const nc = cur.c + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (visited[nr][nc]) continue;

      const cell = botGrid[nr][nc];
      if (cell === HARD || cell === SOFT || cell === BOMB_CELL) continue;
      if (avoidDanger && avoidDanger(nr, nc)) continue;

      visited[nr][nc] = 1;
      queue.push({ r: nr, c: nc, path: [...cur.path, d.name] });
    }
  }

  return null;
}

// ─── Build composite grid ────────────────────────────────────────
// Overlays bomb and explosion positions onto the raw numeric grid
// so BFS can treat them as obstacles / danger.
function buildBotGrid(state) {
  const grid = state.grid;
  const rows = grid.length;
  const cols = grid[0].length;
  const botGrid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => grid[y][x])
  );

  for (const bomb of state.bombs.values()) {
    const bx = Math.round(bomb.x);
    const by = Math.round(bomb.y);
    if (by >= 0 && by < rows && bx >= 0 && bx < cols && botGrid[by][bx] === EMPTY) {
      botGrid[by][bx] = BOMB_CELL;
    }
  }

  return botGrid;
}

// ─── Danger detection ────────────────────────────────────────────
function buildDangerMap(botGrid, state, blastRanges) {
  const rows = botGrid.length;
  const cols = botGrid[0].length;
  const danger = Array.from({ length: rows }, () => new Uint8Array(cols));

  const cardinals = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const bomb of state.bombs.values()) {
    if (bomb.timer > 1.5) continue;

    const br = Math.round(bomb.y);
    const bc = Math.round(bomb.x);
    const range = blastRanges[bomb.owner] || bomb.blastRange || 2;

    if (br >= 0 && br < rows && bc >= 0 && bc < cols) {
      danger[br][bc] = 1;
    }

    for (const d of cardinals) {
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
      { dx: 0, dy: 1, len: exp.down },
      { dx: -1, dy: 0, len: exp.left },
      { dx: 1, dy: 0, len: exp.right },
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

// ─── Adjacent cell helpers ───────────────────────────────────────
function getAdjacentCells(r, c, botGrid) {
  const result = [];
  const dirs = [
    { dr: -1, dc: 0, name: 'up' },
    { dr: 1, dc: 0, name: 'down' },
    { dr: 0, dc: -1, name: 'left' },
    { dr: 0, dc: 1, name: 'right' },
  ];
  const rows = botGrid.length;
  const cols = botGrid[0].length;

  for (const d of dirs) {
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      result.push({ r: nr, c: nc, dir: d.name, cell: botGrid[nr][nc] });
    }
  }
  return result;
}

function isAdjacentToSoftBlock(r, c, botGrid) {
  return getAdjacentCells(r, c, botGrid).some(a => a.cell === SOFT);
}

// ─── Main bot AI ─────────────────────────────────────────────────
/**
 * @param {object} state - Simulation round state (state.grid is number[][],
 *   state.players/bombs/explosions/items are Maps)
 * @param {object} botPlayer - The bot's player entry from state.players Map
 * @returns {{ dir: string|null, bomb: boolean }}
 */
function getInput(state, botPlayer) {
  if (!botPlayer || !botPlayer.alive) return { dir: null, bomb: false };

  const { grid } = state;
  if (!grid || grid.length === 0) return { dir: null, bomb: false };

  const botGrid = buildBotGrid(state);

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

  // ── Priority 1: FLEE ──
  if (inDanger) {
    const path = bfs(botGrid, { r: br, c: bc }, (r, c) => isSafe(r, c), null);
    if (path && path.length > 0) {
      return { dir: path[0], bomb: false };
    }
    const adj = getAdjacentCells(br, bc, botGrid);
    for (const a of adj) {
      if (a.cell !== HARD && a.cell !== SOFT && a.cell !== BOMB_CELL) {
        return { dir: a.dir, bomb: false };
      }
    }
    return { dir: null, bomb: false };
  }

  // ── Priority 2: BOMB near soft blocks ──
  if (isAdjacentToSoftBlock(br, bc, botGrid)) {
    // Only if no bomb already here
    let bombHere = false;
    for (const b of state.bombs.values()) {
      if (Math.round(b.y) === br && Math.round(b.x) === bc) { bombHere = true; break; }
    }
    if (!bombHere) {
      // Check if we can escape after placing
      const fakeDanger = buildDangerMap(botGrid, {
        bombs: new Map([...state.bombs, ['fake', { x: bc, y: br, owner: botPlayer.id, timer: 0.5, blastRange: botPlayer.blastRange || 2 }]]),
        explosions: state.explosions,
      }, blastRanges);
      const escPath = bfs(
        botGrid,
        { r: br, c: bc },
        (r, c) => fakeDanger[r][c] === 0 && botGrid[r][c] !== HARD && botGrid[r][c] !== SOFT && botGrid[r][c] !== BOMB_CELL,
        () => false
      );
      if (escPath && escPath.length > 0) {
        return { dir: escPath[0], bomb: true };
      }
    }
  }

  // ── Priority 3: HUNT items ──
  if (state.items.size > 0) {
    const avoidDanger = (r, c) => danger[r][c] === 1;
    let bestPath = null;
    for (const item of state.items.values()) {
      const path = bfs(botGrid, { r: br, c: bc }, (r, c) => r === item.y && c === item.x, avoidDanger);
      if (path && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
    if (bestPath && bestPath.length > 0) {
      return { dir: bestPath[0], bomb: false };
    }
  }

  // ── Priority 4: WANDER toward soft blocks ──
  {
    const avoidDanger = (r, c) => danger[r][c] === 1;
    const path = bfs(
      botGrid,
      { r: br, c: bc },
      (r, c) => isAdjacentToSoftBlock(r, c, botGrid),
      avoidDanger
    );
    if (path && path.length > 0) {
      return { dir: path[0], bomb: false };
    }
  }

  // ── Priority 5: HUNT other players (when no soft blocks remain) ──
  {
    const avoidDanger = (r, c) => danger[r][c] === 1;
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
      if (path && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
    if (bestPath && bestPath.length > 0) {
      return { dir: bestPath[0], bomb: false };
    }
  }

  // ── Priority 6: IDLE ──
  return { dir: null, bomb: false };
}

module.exports = { getInput };

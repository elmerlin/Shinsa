'use strict';

// ─── BFS pathfinding ─────────────────────────────────────────────
function bfs(grid, start, goalFn, avoidDanger) {
  const rows = grid.length;
  const cols = grid[0].length;
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

      const cell = grid[nr][nc];
      // Can't walk through hard blocks, soft blocks, or bombs
      if (cell === 'H' || cell === 'S' || cell === 'B') continue;
      if (avoidDanger && avoidDanger(nr, nc)) continue;

      visited[nr][nc] = 1;
      queue.push({ r: nr, c: nc, path: [...cur.path, d.name] });
    }
  }

  return null; // no path found
}

// ─── Danger detection ────────────────────────────────────────────
function buildDangerMap(grid, bombs, blastRanges) {
  const rows = grid.length;
  const cols = grid[0].length;
  const danger = Array.from({ length: rows }, () => new Uint8Array(cols));

  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const bomb of bombs) {
    // Only consider bombs that will explode soon (< 1.5s remaining)
    if (bomb.timer > 1.5) continue;

    const range = blastRanges[bomb.owner] || bomb.blastRange || 2;
    // The bomb cell itself is dangerous
    danger[bomb.r][bomb.c] = 1;

    // Explosion cross in each direction
    for (const d of dirs) {
      for (let i = 1; i <= range; i++) {
        const nr = bomb.r + d.dr * i;
        const nc = bomb.c + d.dc * i;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
        const cell = grid[nr][nc];
        if (cell === 'H') break; // hard block stops explosion
        danger[nr][nc] = 1;
        if (cell === 'S') break; // soft block stops explosion but is hit
      }
    }
  }

  // Also mark cells with active explosions
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 'X') danger[r][c] = 1;
    }
  }

  return danger;
}

// ─── Adjacent cell helpers ───────────────────────────────────────
function getAdjacentCells(r, c, grid) {
  const result = [];
  const dirs = [
    { dr: -1, dc: 0, name: 'up' },
    { dr: 1, dc: 0, name: 'down' },
    { dr: 0, dc: -1, name: 'left' },
    { dr: 0, dc: 1, name: 'right' },
  ];
  const rows = grid.length;
  const cols = grid[0].length;

  for (const d of dirs) {
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      result.push({ r: nr, c: nc, dir: d.name, cell: grid[nr][nc] });
    }
  }
  return result;
}

function isAdjacentToSoftBlock(r, c, grid) {
  return getAdjacentCells(r, c, grid).some(a => a.cell === 'S');
}

// ─── Main bot AI ─────────────────────────────────────────────────
/**
 * @param {object} roundState - Current round state from the simulation
 *   { grid, bombs, explosions, players, powerUps, tickCount }
 *   grid[r][c] = 'E'(empty) | 'H'(hard) | 'S'(soft) | 'B'(bomb) | 'X'(explosion) | 'P'(powerUp)
 *   bombs = [{ r, c, owner, timer, blastRange }]
 *   players = [{ id, r, c, alive, blastRange, maxBombs, speed }]
 *   powerUps = [{ r, c, type }]
 * @param {object} botPlayer - The bot's player state { id, r, c, alive, blastRange, maxBombs }
 * @returns {{ dir: string|null, bomb: boolean }}
 */
function getInput(roundState, botPlayer) {
  if (!botPlayer || !botPlayer.alive) return { dir: null, bomb: false };

  const { grid, bombs = [], players = [], powerUps = [] } = roundState;
  if (!grid || grid.length === 0) return { dir: null, bomb: false };

  const br = botPlayer.r;
  const bc = botPlayer.c;
  const rows = grid.length;
  const cols = grid[0].length;

  // Build blast range lookup by owner
  const blastRanges = {};
  for (const p of players) {
    blastRanges[p.id] = p.blastRange || 2;
  }

  // Build danger map
  const danger = buildDangerMap(grid, bombs, blastRanges);
  const inDanger = danger[br][bc] === 1;

  // Helper: is cell safe to stand on
  const isSafe = (r, c) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    const cell = grid[r][c];
    if (cell === 'H' || cell === 'S' || cell === 'B') return false;
    return danger[r][c] === 0;
  };

  // ── Priority 1: FLEE ──
  if (inDanger) {
    const path = bfs(grid, { r: br, c: bc }, (r, c) => isSafe(r, c), null);
    if (path && path.length > 0) {
      return { dir: path[0], bomb: false };
    }
    // No safe path found; try moving to any walkable cell even if dangerous
    const adj = getAdjacentCells(br, bc, grid);
    for (const a of adj) {
      if (a.cell !== 'H' && a.cell !== 'S' && a.cell !== 'B') {
        return { dir: a.dir, bomb: false };
      }
    }
    return { dir: null, bomb: false };
  }

  // ── Priority 2: BOMB near soft blocks ──
  if (isAdjacentToSoftBlock(br, bc, grid)) {
    // Only bomb if we can escape afterward
    const bombsAtPos = bombs.filter(b => b.r === br && b.c === bc);
    if (bombsAtPos.length === 0) {
      // Simulate danger if we place a bomb here
      const fakeBomb = { r: br, c: bc, owner: botPlayer.id, timer: 0.5, blastRange: botPlayer.blastRange || 2 };
      const futureDanger = buildDangerMap(grid, [...bombs, fakeBomb], blastRanges);
      // Check if we have an escape route
      const escPath = bfs(
        grid,
        { r: br, c: bc },
        (r, c) => futureDanger[r][c] === 0 && grid[r][c] !== 'H' && grid[r][c] !== 'S' && grid[r][c] !== 'B',
        (r, c) => false // don't avoid danger for escape check since we're already committing
      );
      if (escPath && escPath.length > 0) {
        return { dir: escPath[0], bomb: true };
      }
    }
  }

  // ── Priority 3: HUNT power-ups ──
  if (powerUps.length > 0) {
    const avoidDanger = (r, c) => danger[r][c] === 1;
    let bestPath = null;
    for (const pu of powerUps) {
      const path = bfs(grid, { r: br, c: bc }, (r, c) => r === pu.r && c === pu.c, avoidDanger);
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
    // Find nearest soft block and path adjacent to it
    const path = bfs(
      grid,
      { r: br, c: bc },
      (r, c) => {
        // Goal: be adjacent to a soft block
        return isAdjacentToSoftBlock(r, c, grid);
      },
      avoidDanger
    );
    if (path && path.length > 0) {
      return { dir: path[0], bomb: false };
    }
  }

  // ── Priority 5: IDLE ──
  return { dir: null, bomb: false };
}

module.exports = { getInput };

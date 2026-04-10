'use strict';

// ---------------------------------------------------------------------------
//  Pet Bomber -- Bot AI
//
//  Goals:
//    - survive its own bombs reliably
//    - clear the board and pressure the player
//    - stay beatable through small hesitation and conservative bombing
//
//  The core fix here is time-aware safety planning:
//    - bombs create a threat-time map instead of a simple boolean danger map
//    - escape validation only approves bombs with a reachable safe endpoint
//    - hesitation never runs before danger handling
// ---------------------------------------------------------------------------

const EMPTY = 0;
const HARD = 1;
const SOFT = 2;
const BOMB_CELL = 3;

const BOMB_FUSE = 2.5;
const OPENING_BOMB_DELAY_TICKS = 16; // 0.8s at 20 tps
const STEP_BUFFER = 0.08;
const ESCAPE_MARGIN = 0.18;

const IDLE_CHANCE = 0.05;
const BOMB_HESITATE = 0.2;
const ITEM_NEARBY_RANGE = 8;

const DIRS = [
  { dr: -1, dc: 0, name: 'up' },
  { dr: 1, dc: 0, name: 'down' },
  { dr: 0, dc: -1, name: 'left' },
  { dr: 0, dc: 1, name: 'right' },
];

function bfs(grid, start, goalFn, avoidFn, maxDepth) {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = Array.from({ length: rows }, () => new Uint8Array(cols));
  const queue = [{ r: start.r, c: start.c, path: [] }];
  visited[start.r][start.c] = 1;

  while (queue.length > 0) {
    const cur = queue.shift();
    if (goalFn(cur.r, cur.c)) return cur.path;
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

function buildBotGrid(state, botPlayer) {
  const rows = state.grid.length;
  const cols = state.grid[0].length;
  const botGrid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => state.grid[r][c])
  );

  for (const bomb of state.bombs.values()) {
    const br = Math.round(bomb.y);
    const bc = Math.round(bomb.x);
    if (br < 0 || br >= rows || bc < 0 || bc >= cols) continue;
    if (botGrid[br][bc] !== EMPTY) continue;

    const isPassableOwnBomb =
      botPlayer &&
      (botPlayer.canPass ||
        (botPlayer.passableBombs && botPlayer.passableBombs.has(bomb.id)));

    if (!isPassableOwnBomb) {
      botGrid[br][bc] = BOMB_CELL;
    }
  }

  return botGrid;
}

function buildBlastRangeLookup(state) {
  const blastRanges = {};
  for (const player of state.players.values()) {
    blastRanges[player.id] = player.blastRange || 2;
  }
  return blastRanges;
}

function createThreatTimes(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Number.POSITIVE_INFINITY)
  );
}

function markThreatCross(threatTimes, rawGrid, bomb, timer, blastRange) {
  const rows = rawGrid.length;
  const cols = rawGrid[0].length;
  const br = Math.round(bomb.y);
  const bc = Math.round(bomb.x);
  if (br < 0 || br >= rows || bc < 0 || bc >= cols) return;

  threatTimes[br][bc] = Math.min(threatTimes[br][bc], timer);

  for (const d of DIRS) {
    for (let i = 1; i <= blastRange; i++) {
      const nr = br + d.dr * i;
      const nc = bc + d.dc * i;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;

      const cell = rawGrid[nr][nc];
      if (cell === HARD) break;

      threatTimes[nr][nc] = Math.min(threatTimes[nr][nc], timer);

      if (cell === SOFT) break;
    }
  }
}

function buildThreatTimeMap(state, blastRanges, extraBombs = []) {
  const rows = state.grid.length;
  const cols = state.grid[0].length;
  const threatTimes = createThreatTimes(rows, cols);

  for (const bomb of state.bombs.values()) {
    const blastRange = blastRanges[bomb.owner] || bomb.blastRange || 2;
    markThreatCross(threatTimes, state.grid, bomb, bomb.timer ?? BOMB_FUSE, blastRange);
  }

  for (const bomb of extraBombs) {
    const blastRange = blastRanges[bomb.owner] || bomb.blastRange || 2;
    markThreatCross(threatTimes, state.grid, bomb, bomb.timer ?? BOMB_FUSE, blastRange);
  }

  for (const exp of state.explosions.values()) {
    const cells = [[exp.cy, exp.cx]];
    for (let i = 1; i <= exp.up; i++) cells.push([exp.cy - i, exp.cx]);
    for (let i = 1; i <= exp.down; i++) cells.push([exp.cy + i, exp.cx]);
    for (let i = 1; i <= exp.left; i++) cells.push([exp.cy, exp.cx - i]);
    for (let i = 1; i <= exp.right; i++) cells.push([exp.cy, exp.cx + i]);
    for (const [r, c] of cells) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        threatTimes[r][c] = 0;
      }
    }
  }

  return threatTimes;
}

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
  return getAdjacentCells(r, c, grid).some((cell) => cell.cell === SOFT);
}

function hasBombAt(state, r, c) {
  for (const bomb of state.bombs.values()) {
    if (Math.round(bomb.y) === r && Math.round(bomb.x) === c) return true;
  }
  return false;
}

function countExits(grid, r, c) {
  let exits = 0;
  for (const d of DIRS) {
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) continue;
    if (grid[nr][nc] === EMPTY) exits++;
  }
  return exits;
}

function isWalkableCell(grid, r, c) {
  if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false;
  return grid[r][c] !== HARD && grid[r][c] !== SOFT && grid[r][c] !== BOMB_CELL;
}

function findTimedPath(grid, start, speed, threatTimes, goalFn, maxTime = Number.POSITIVE_INFINITY) {
  const rows = grid.length;
  const cols = grid[0].length;
  const stepTime = 1 / Math.max(0.1, speed || 3);
  const bestArrival = createThreatTimes(rows, cols);
  const queue = [{ r: start.r, c: start.c, time: 0, path: [] }];
  bestArrival[start.r][start.c] = 0;

  while (queue.length > 0) {
    const cur = queue.shift();
    if (goalFn(cur.r, cur.c, cur.time)) return cur.path;

    for (const d of DIRS) {
      const nr = cur.r + d.dr;
      const nc = cur.c + d.dc;
      if (!isWalkableCell(grid, nr, nc)) continue;

      const arrival = cur.time + stepTime;
      if (arrival > maxTime) continue;

      const threatTime = threatTimes[nr][nc];
      if (Number.isFinite(threatTime) && arrival >= threatTime - STEP_BUFFER) continue;
      if (arrival >= bestArrival[nr][nc] - 1e-9) continue;

      bestArrival[nr][nc] = arrival;
      queue.push({ r: nr, c: nc, time: arrival, path: [...cur.path, d.name] });
    }
  }

  return null;
}

function findEscapePath(botGrid, state, botPlayer, blastRanges, br, bc) {
  const speed = botPlayer.speed || 3;
  const fakeBomb = {
    x: bc,
    y: br,
    owner: botPlayer.id,
    blastRange: botPlayer.blastRange || 2,
    timer: BOMB_FUSE,
  };
  const threatTimes = buildThreatTimeMap(state, blastRanges, [fakeBomb]);
  const maxTime = Math.max(0.2, BOMB_FUSE - ESCAPE_MARGIN);

  return findTimedPath(
    botGrid,
    { r: br, c: bc },
    speed,
    threatTimes,
    (r, c, arrival) =>
      arrival <= maxTime &&
      !Number.isFinite(threatTimes[r][c]),
    maxTime
  );
}

function getNearestThreatTime(threatTimes, r, c) {
  if (r < 0 || r >= threatTimes.length || c < 0 || c >= threatTimes[0].length) {
    return Number.POSITIVE_INFINITY;
  }
  return threatTimes[r][c];
}

function getInput(state, botPlayer) {
  if (!botPlayer || !botPlayer.alive) return { dir: null, bomb: false };
  if (!state.grid || state.grid.length === 0) return { dir: null, bomb: false };

  const br = Math.round(botPlayer.y);
  const bc = Math.round(botPlayer.x);
  const botGrid = buildBotGrid(state, botPlayer);
  const blastRanges = buildBlastRangeLookup(state);
  const threatTimes = buildThreatTimeMap(state, blastRanges);
  const currentThreat = getNearestThreatTime(threatTimes, br, bc);

  // Always resolve danger first. Random hesitation must never interrupt escape.
  if (Number.isFinite(currentThreat)) {
    const fleePath = findTimedPath(
      botGrid,
      { r: br, c: bc },
      botPlayer.speed || 3,
      threatTimes,
      (r, c) => !Number.isFinite(threatTimes[r][c]),
      currentThreat + BOMB_FUSE
    );
    if (fleePath && fleePath.length > 0) {
      return { dir: fleePath[0], bomb: false };
    }

    const emergencyMove = getAdjacentCells(br, bc, botGrid)
      .filter((cell) => isWalkableCell(botGrid, cell.r, cell.c))
      .sort((a, b) => getNearestThreatTime(threatTimes, b.r, b.c) - getNearestThreatTime(threatTimes, a.r, a.c))[0];
    return { dir: emergencyMove?.dir || null, bomb: false };
  }

  const avoidThreat = (r, c) => Number.isFinite(threatTimes[r][c]);

  // Nearby items first.
  if (state.items.size > 0) {
    let bestPath = null;
    for (const item of state.items.values()) {
      const path = bfs(
        botGrid,
        { r: br, c: bc },
        (r, c) => r === item.y && c === item.x,
        avoidThreat
      );
      if (path && path.length <= ITEM_NEARBY_RANGE && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
    if (bestPath && bestPath.length > 0) {
      return { dir: bestPath[0], bomb: false };
    }
  }

  const canBomb = state.tick >= OPENING_BOMB_DELAY_TICKS &&
    !hasBombAt(state, br, bc) &&
    (botPlayer.bombsPlaced || 0) < (botPlayer.maxBombs || 1) &&
    Math.random() > BOMB_HESITATE;

  // Break blocks, but only from cells with a real post-bomb escape.
  // The server applies movement before bomb placement, so pairing a direction
  // with bomb=true can place the bomb in a different cell than the one we
  // validated. Plant in-place, then start escaping on the next tick.
  if (canBomb && isAdjacentToSoftBlock(br, bc, botGrid)) {
    const escapePath = findEscapePath(botGrid, state, botPlayer, blastRanges, br, bc);
    if (escapePath && escapePath.length > 0) {
      return { dir: null, bomb: true };
    }
  }

  // Move toward a useful bombing cell.
  {
    const multiExitPath = bfs(
      botGrid,
      { r: br, c: bc },
      (r, c) => isAdjacentToSoftBlock(r, c, botGrid) && countExits(botGrid, r, c) >= 2,
      avoidThreat
    );
    if (multiExitPath && multiExitPath.length > 0) {
      return { dir: multiExitPath[0], bomb: false };
    }

    const anySoftPath = bfs(
      botGrid,
      { r: br, c: bc },
      (r, c) => isAdjacentToSoftBlock(r, c, botGrid),
      avoidThreat
    );
    if (anySoftPath && anySoftPath.length > 0) {
      return { dir: anySoftPath[0], bomb: false };
    }
  }

  // Distant items next.
  if (state.items.size > 0) {
    let bestPath = null;
    for (const item of state.items.values()) {
      const path = bfs(
        botGrid,
        { r: br, c: bc },
        (r, c) => r === item.y && c === item.x,
        avoidThreat
      );
      if (path && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
    if (bestPath && bestPath.length > 0) {
      return { dir: bestPath[0], bomb: false };
    }
  }

  // Pressure enemies once the board opens up.
  {
    for (const enemy of state.players.values()) {
      if (enemy.id === botPlayer.id || !enemy.alive) continue;
      const er = Math.round(enemy.y);
      const ec = Math.round(enemy.x);
      if (Math.abs(br - er) + Math.abs(bc - ec) <= 1 && canBomb) {
        const escapePath = findEscapePath(botGrid, state, botPlayer, blastRanges, br, bc);
        if (escapePath && escapePath.length > 0) {
          return { dir: null, bomb: true };
        }
      }
    }

    let bestPath = null;
    for (const enemy of state.players.values()) {
      if (enemy.id === botPlayer.id || !enemy.alive) continue;
      const er = Math.round(enemy.y);
      const ec = Math.round(enemy.x);
      const path = bfs(
        botGrid,
        { r: br, c: bc },
        (r, c) => Math.abs(r - er) + Math.abs(c - ec) <= 1,
        avoidThreat
      );
      if (path && path.length > 0 && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
    if (bestPath && bestPath.length > 0) {
      return { dir: bestPath[0], bomb: false };
    }
  }

  // Small hesitation at the very end keeps the bot beatable.
  if (Math.random() < IDLE_CHANCE) {
    return { dir: null, bomb: false };
  }

  return { dir: null, bomb: false };
}

module.exports = { getInput };

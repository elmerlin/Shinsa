// ─── Pac It Up! maze data ────────────────────────────────────────
// Each maze is a 19×21 tile grid. Tile legend:
//   # wall   . normal stomp   o power stomp   (space) open lane
//   P player spawn   G ghost spawn   D ghost-house door
//   T tunnel exit   A assist candidate   M base mine tile

export const COLS = 19;
export const ROWS = 21;

export const PAC_IT_UP_MAZES = [
  // ─── Maze 0: Dojo Courtyard ────────────────────────
  {
    id: 'dojo-courtyard',
    name: 'Dojo Courtyard',
    theme: 'dojo',
    layout: [
      '###################', // 0
      '#o..#.........#..o#', // 1
      '#.#.#.###.###.#.#.#', // 2
      '#.#M...........M#.#', // 3
      '#.###.##.##.###...#', // 4
      '#.....#.....#.....#', // 5
      '#A###.#.....#.###A#', // 6
      '#.....###D###.....#', // 7
      '#.###.#GG GG#.###.#', // 8
      'T.#...#######...#.T', // 9
      '#M#.#.........#.#M#', // 10
      '#.#.###.#.###.#.#.#', // 11
      '#....M.......M....#', // 12
      '#.###.###.###.###.#', // 13
      'T.................T', // 14
      '#.###.###.###.###.#', // 15
      '#.....#..P..#.....#', // 16
      '#.###.#.....#.###.#', // 17
      '#.#.............#.#', // 18
      '#o..#.........#..o#', // 19
      '###################', // 20
    ],
    playerSpawn: { x: 9, y: 16 },
    ghostSpawns: [
      { x: 7, y: 8 },  // Tempo
      { x: 8, y: 8 },  // Glint
      { x: 10, y: 8 }, // Drift
      { x: 11, y: 8 }, // Ember
    ],
    ghostHouseDoor: { x: 9, y: 7 },
    scatterTargets: [
      { x: 1, y: 1 },
      { x: 17, y: 1 },
      { x: 1, y: 19 },
      { x: 17, y: 19 },
    ],
    assistCandidates: [
      { x: 1, y: 6 },
      { x: 17, y: 6 },
    ],
    baseMineTiles: [
      { x: 3, y: 3 }, { x: 15, y: 3 },
      { x: 1, y: 10 }, { x: 17, y: 10 },
      { x: 5, y: 12 }, { x: 13, y: 12 },
    ],
    extraMineTilesByTier: [
      { x: 7, y: 5 }, { x: 11, y: 5 },
      { x: 5, y: 15 }, { x: 13, y: 15 },
    ],
    decor: [
      { type: 'lantern', x: 4.5, y: 0.5 },
      { type: 'banner', x: 14.5, y: 0.5 },
      { type: 'pad-silhouette', x: 9, y: 20.3 },
    ],
  },

  // ─── Maze 1: Snack Alley ──────────────────────────
  {
    id: 'snack-alley',
    name: 'Snack Alley',
    theme: 'snack',
    layout: [
      '###################', // 0
      '#o.#...........#.o#', // 1
      '#..##.#.###.#.##..#', // 2
      '#M...............M#', // 3
      '##.##.##.M.##.##.##', // 4
      '#....M.#...#.M....#', // 5
      '#.##.###...###.##.#', // 6
      '#.....###D###.....#', // 7
      '#.###.#GG GG#.###.#', // 8
      'T.....#######.....T', // 9
      '#.###.........###.#', // 10
      '#A..#.##.#.##.#..A#', // 11
      '#.#...#.....#...#.#', // 12
      'T.#.#.........#.#.T', // 13
      '#.#.#.##.#.##.#.#.#', // 14
      '#...###.....###...#', // 15
      '#.#......P......#.#', // 16
      '#.#.#.##...##.#.#.#', // 17
      '#.....#.....#.....#', // 18
      '#o.#...........#.o#', // 19
      '###################', // 20
    ],
    playerSpawn: { x: 9, y: 16 },
    ghostSpawns: [
      { x: 7, y: 8 },
      { x: 8, y: 8 },
      { x: 10, y: 8 },
      { x: 11, y: 8 },
    ],
    ghostHouseDoor: { x: 9, y: 7 },
    scatterTargets: [
      { x: 1, y: 1 },
      { x: 17, y: 1 },
      { x: 1, y: 19 },
      { x: 17, y: 19 },
    ],
    assistCandidates: [
      { x: 1, y: 11 },
      { x: 17, y: 11 },
    ],
    baseMineTiles: [
      { x: 1, y: 3 }, { x: 17, y: 3 },
      { x: 9, y: 4 },
      { x: 5, y: 5 }, { x: 13, y: 5 },
      { x: 7, y: 5 }, { x: 11, y: 5 },
    ],
    extraMineTilesByTier: [
      { x: 5, y: 10 }, { x: 13, y: 10 },
      { x: 3, y: 15 }, { x: 15, y: 15 },
    ],
    decor: [
      { type: 'snack-stand', x: 3, y: 0.5 },
      { type: 'snack-stand', x: 15, y: 0.5 },
      { type: 'cabinet-trim', x: 9, y: 20.3 },
    ],
  },

  // ─── Maze 2: Shrine Circuit ────────────────────────
  {
    id: 'shrine-circuit',
    name: 'Shrine Circuit',
    theme: 'shrine',
    layout: [
      '###################', // 0
      '#o.#.#.......#.#.o#', // 1
      '#..#.#.#####.#.#..#', // 2
      '#.M..............M#', // 3
      '##.#.##.###.##.#.##', // 4
      '#..#..#.....#..#..#', // 5
      '#A.##.#.....#.##.A#', // 6
      '#.....###D###.....#', // 7
      '#.###.#GG GG#.###.#', // 8
      'T.#M..#######..M#.T', // 9
      '#.#.#.........#.#.#', // 10
      '#.#.###.#.###.#.#.#', // 11
      '#..M..#.....#..M..#', // 12
      'T.#.###.#.###.#...T', // 13
      '#.#...#.....#...#.#', // 14
      '#.###.##...##.###.#', // 15
      '#........P........#', // 16
      '#.###.##...##.###.#', // 17
      '#..M...........M..#', // 18
      '#o.#.#.......#.#.o#', // 19
      '###################', // 20
    ],
    playerSpawn: { x: 9, y: 16 },
    ghostSpawns: [
      { x: 7, y: 8 },
      { x: 8, y: 8 },
      { x: 10, y: 8 },
      { x: 11, y: 8 },
    ],
    ghostHouseDoor: { x: 9, y: 7 },
    scatterTargets: [
      { x: 1, y: 1 },
      { x: 17, y: 1 },
      { x: 1, y: 19 },
      { x: 17, y: 19 },
    ],
    assistCandidates: [
      { x: 1, y: 6 },
      { x: 17, y: 6 },
    ],
    baseMineTiles: [
      { x: 2, y: 3 }, { x: 17, y: 3 },
      { x: 3, y: 9 }, { x: 15, y: 9 },
      { x: 3, y: 12 }, { x: 15, y: 12 },
      { x: 3, y: 18 }, { x: 15, y: 18 },
    ],
    extraMineTilesByTier: [
      { x: 5, y: 5 }, { x: 13, y: 5 },
      { x: 1, y: 14 }, { x: 17, y: 14 },
    ],
    decor: [
      { type: 'torii', x: 9, y: 0.5 },
      { type: 'rank-flash', x: 4, y: 20.3 },
      { type: 'rank-flash', x: 14, y: 20.3 },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────

/** Get maze + tier for a given stage number (1-based). */
export function getMazeForStage(stage) {
  const idx = (stage - 1) % PAC_IT_UP_MAZES.length;
  const tier = Math.floor((stage - 1) / PAC_IT_UP_MAZES.length);
  return { maze: PAC_IT_UP_MAZES[idx], mazeIndex: idx, tier };
}

/** True if tile is walkable (not a wall). */
export function isWalkable(ch) {
  return ch !== '#';
}

/** Get tile character at (x, y) — returns '#' for out-of-bounds. */
export function tileAt(layout, x, y) {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return '#';
  return layout[y][x];
}

/** Parse layout into a mutable grid of tile types for the game state. */
export function buildTileGrid(maze, tier) {
  const grid = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const ch = maze.layout[y][x];
      switch (ch) {
        case '#': row.push('wall'); break;
        case '.': row.push('stomp'); break;
        case 'o': row.push('power'); break;
        case 'M': row.push('mine'); break;
        case 'P': row.push('empty'); break;
        case 'G': row.push('empty'); break;
        case 'D': row.push('door'); break;
        case 'T': row.push('tunnel'); break;
        case 'A': row.push('stomp'); break; // assist spots are dots by default
        case ' ': row.push('empty'); break;
        default:  row.push('empty'); break;
      }
    }
    grid.push(row);
  }
  // Activate extra mines by tier
  const extras = maze.extraMineTilesByTier || [];
  const extraCount = tier >= 3 ? 4 : tier >= 2 ? 3 : tier >= 1 ? 2 : 0;
  for (let i = 0; i < Math.min(extraCount, extras.length); i++) {
    const { x, y } = extras[i];
    if (grid[y] && grid[y][x] === 'stomp') {
      grid[y][x] = 'mine';
    }
  }
  return grid;
}

/** Count remaining collectibles (stomps + power stomps). */
export function countCollectibles(grid) {
  let n = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] === 'stomp' || grid[y][x] === 'power') n++;
    }
  }
  return n;
}

/** Find all tunnel exit positions. */
export function findTunnels(layout) {
  const tunnels = [];
  for (let y = 0; y < ROWS; y++) {
    if (layout[y][0] === 'T') tunnels.push({ y, left: { x: 0, y }, right: { x: COLS - 1, y } });
  }
  return tunnels;
}

/** Wrap x through tunnel if at edge. Returns new x or same. */
export function tunnelWrap(x, y, layout) {
  if (x < 0 && layout[y] && layout[y][COLS - 1] === 'T') return COLS - 1;
  if (x >= COLS && layout[y] && layout[y][0] === 'T') return 0;
  return x;
}

/** Manhattan distance between two points. */
export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Simple BFS to find direction to target tile from (sx,sy), avoiding walls. */
export function bfsDirection(grid, layout, sx, sy, tx, ty, currentDir) {
  // For ghosts: pick the direction that gets closest to target
  // Use the classic Pac-Man approach: at each intersection, choose the direction
  // whose next tile is closest to the target (by Euclidean distance), never reversing.
  const dirs = ['up', 'down', 'left', 'right'];
  const dx = { up: 0, down: 0, left: -1, right: 1 };
  const dy = { up: -1, down: 1, left: 0, right: 0 };
  const reverse = { up: 'down', down: 'up', left: 'right', right: 'left' };

  let bestDir = currentDir;
  let bestDist = Infinity;

  for (const d of dirs) {
    if (d === reverse[currentDir]) continue; // no reversal
    let nx = sx + dx[d];
    let ny = sy + dy[d];
    // Handle tunnel wrap
    nx = tunnelWrap(nx, ny, layout);
    if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS) continue;
    const tile = grid[ny]?.[nx];
    if (tile === 'wall') continue;
    if (tile === 'door' && d === 'down') continue; // can't enter house from above normally
    const dist = (nx - tx) ** 2 + (ny - ty) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestDir = d;
    }
  }
  return bestDir;
}

/** Pick a random valid direction (for frightened mode). */
export function randomDirection(grid, layout, sx, sy, currentDir) {
  const dirs = ['up', 'down', 'left', 'right'];
  const dx = { up: 0, down: 0, left: -1, right: 1 };
  const dy = { up: -1, down: 1, left: 0, right: 0 };
  const reverse = { up: 'down', down: 'up', left: 'right', right: 'left' };

  const valid = dirs.filter(d => {
    if (d === reverse[currentDir]) return false;
    let nx = sx + dx[d];
    let ny = sy + dy[d];
    nx = tunnelWrap(nx, ny, layout);
    if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS) return false;
    const tile = grid[ny]?.[nx];
    return tile && tile !== 'wall' && tile !== 'door';
  });
  if (valid.length === 0) return reverse[currentDir]; // dead end, must reverse
  return valid[Math.floor(Math.random() * valid.length)];
}

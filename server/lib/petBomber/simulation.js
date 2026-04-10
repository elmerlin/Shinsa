'use strict';

// ---------------------------------------------------------------------------
//  Pet Bomber -- authoritative server simulation
//  Runs at 20 ticks/second. Manages grid, players, bombs, explosions, items,
//  and sudden death.
//
//  Coordinate convention:
//    Player/bomb positions are continuous floats where integer values (e.g. 1,1)
//    represent the CENTER of a grid cell.  Cell (col, row) occupies the region
//    [col - 0.5, col + 0.5) x [row - 0.5, row + 0.5).
//    To get the grid cell from a position: Math.round(pos).
// ---------------------------------------------------------------------------

const COLS = 13;
const ROWS = 11;
const TICK_RATE = 20;
const DT = 1 / TICK_RATE;

// Grid cell types
const EMPTY = 0;
const HARD  = 1;
const SOFT  = 2;

// Round timing
const ROUND_DURATION    = 90;   // seconds
const BOMB_FUSE         = 2.5;  // seconds
const EXPLOSION_TTL     = 0.5;  // seconds
const SUDDEN_DEATH_RATE = 2;    // blocks placed per second

// Movement
const BASE_SPEED   = 3.0;  // cells / second
const SPEED_PER_UP = 0.5;
const PLAYER_RADIUS = 0.35;
const LANE_SNAP_MULTIPLIER = 4.0;
const LANE_SNAP_EPSILON = 0.02;

// Soft-block / item generation
const SOFT_BLOCK_CHANCE  = 0.65;
const HIDDEN_ITEM_CHANCE = 0.35;

const ITEM_TABLE = [
  { type: 'extra_bomb', weight: 30 },
  { type: 'blast_up',   weight: 25 },
  { type: 'speed_up',   weight: 20 },
  { type: 'kick',       weight: 15 },
  { type: 'pass',       weight: 10 },
];
const ITEM_TOTAL_WEIGHT = ITEM_TABLE.reduce((s, e) => s + e.weight, 0);

// Spawn positions (grid cell x, y) -- corners
const SPAWNS = [
  { x: 1,  y: 1 },   // seat 0 -- top-left
  { x: 11, y: 1 },   // seat 1 -- top-right
  { x: 1,  y: 9 },   // seat 2 -- bottom-left
  { x: 11, y: 9 },   // seat 3 -- bottom-right
];

// Direction vectors (up = -y in grid coords)
const DIR_VECS = {
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
};

// ---------------------------------------------------------------------------
//  Sudden-death spiral -- walks the border inward
// ---------------------------------------------------------------------------

function buildSpiralOrder() {
  const order = [];
  let top = 0, bottom = ROWS - 1, left = 0, right = COLS - 1;

  while (top <= bottom && left <= right) {
    for (let x = left;  x <= right;  x++) order.push({ x, y: top });
    top++;
    for (let y = top;   y <= bottom; y++) order.push({ x: right, y });
    right--;
    if (top <= bottom) {
      for (let x = right; x >= left; x--) order.push({ x, y: bottom });
      bottom--;
    }
    if (left <= right) {
      for (let y = bottom; y >= top; y--) order.push({ x: left, y });
      left++;
    }
  }
  return order;
}

const SPIRAL_ORDER = buildSpiralOrder();

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function nextId(state) {
  return state._nextId++;
}

function inBounds(col, row) {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

/** Returns true if grid position (col, row) is a permanent hard block. */
function isHardBlock(col, row) {
  if (col === 0 || col === COLS - 1 || row === 0 || row === ROWS - 1) return true;
  return col % 2 === 0 && row % 2 === 0;
}

function rollItem() {
  let r = Math.random() * ITEM_TOTAL_WEIGHT;
  for (const entry of ITEM_TABLE) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return ITEM_TABLE[0].type;
}

/** Returns the spawn cell plus its four cardinal neighbours. */
function clearZone(cx, cy) {
  const cells = [{ x: cx, y: cy }];
  for (const key of Object.keys(DIR_VECS)) {
    const v = DIR_VECS[key];
    cells.push({ x: cx + v.dx, y: cy + v.dy });
  }
  return cells;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

/** Convert continuous position to grid cell index. */
function toCell(v) {
  return Math.round(v);
}

/** Find bomb whose grid cell matches (gx, gy). */
function bombAtCell(state, gx, gy) {
  for (const b of state.bombs.values()) {
    if (toCell(b.x) === gx && toCell(b.y) === gy) return b;
  }
  return null;
}

/** Returns true if explosion covers grid cell (gx, gy). */
function explosionHitsCell(exp, gx, gy) {
  if (gx === exp.cx && gy === exp.cy) return true;
  if (gx === exp.cx) {
    if (gy < exp.cy && gy >= exp.cy - exp.up)   return true;
    if (gy > exp.cy && gy <= exp.cy + exp.down)  return true;
  }
  if (gy === exp.cy) {
    if (gx < exp.cx && gx >= exp.cx - exp.left)  return true;
    if (gx > exp.cx && gx <= exp.cx + exp.right) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
//  createRound
// ---------------------------------------------------------------------------

function createRound(playerSeats) {
  const state = {
    tick: 0,
    timer: ROUND_DURATION,
    suddenDeath: false,
    suddenDeathIdx: 0,
    suddenDeathAccum: 0,
    grid: [],
    players: new Map(),
    bombs: new Map(),
    explosions: new Map(),
    items: new Map(),
    hiddenItems: new Map(),
    _nextId: 1,
  };

  // --- Build grid ---
  for (let y = 0; y < ROWS; y++) {
    state.grid[y] = new Array(COLS);
    for (let x = 0; x < COLS; x++) {
      state.grid[y][x] = isHardBlock(x, y) ? HARD : EMPTY;
    }
  }

  // Gather spawn-safe cells
  const safeCells = new Set();
  for (const sp of SPAWNS) {
    for (const c of clearZone(sp.x, sp.y)) {
      safeCells.add(cellKey(c.x, c.y));
    }
  }

  // Place soft blocks
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (state.grid[y][x] !== EMPTY) continue;
      if (safeCells.has(cellKey(x, y))) continue;
      if (Math.random() < SOFT_BLOCK_CHANCE) {
        state.grid[y][x] = SOFT;
        if (Math.random() < HIDDEN_ITEM_CHANCE) {
          state.hiddenItems.set(cellKey(x, y), rollItem());
        }
      }
    }
  }

  // --- Create players ---
  for (const ps of playerSeats) {
    const spawn = SPAWNS[ps.seat] || SPAWNS[0];
    state.players.set(ps.id, {
      id:            ps.id,
      seat:          ps.seat,
      x:             spawn.x,
      y:             spawn.y,
      dir:           'down',
      alive:         true,
      bombsPlaced:   0,
      maxBombs:      1,
      blastRange:    2,
      speed:         BASE_SPEED,
      canKick:       false,
      canPass:       false,
      character:     ps.character || null,
      isBot:         !!ps.isBot,
      passableBombs: new Set(),
      moveCooldown:  0,
    });
  }

  return state;
}

// ---------------------------------------------------------------------------
//  Movement & collision
// ---------------------------------------------------------------------------

/**
 * Checks whether a solid obstacle exists at grid cell (gx, gy) for the given
 * player.  Solid = hard block, soft block, or a bomb the player cannot pass.
 */
function isSolid(state, player, gx, gy) {
  if (!inBounds(gx, gy)) return true;
  const cell = state.grid[gy][gx];
  if (cell === HARD || cell === SOFT) return true;

  const bomb = bombAtCell(state, gx, gy);
  if (bomb) {
    if (player.passableBombs.has(bomb.id)) return false;
    if (player.canPass) return false;
    return true;
  }
  return false;
}

/**
 * Can the player's bounding circle (approximated as AABB) sit at continuous
 * position (cx, cy) without overlapping any solid cell?
 *
 * Cell (col, row) occupies [col - 0.5, col + 0.5).  The player's AABB is
 * [cx - R, cx + R] x [cy - R, cy + R].  We check every grid cell that this
 * AABB overlaps.
 */
function canOccupy(state, player, cx, cy) {
  const R = PLAYER_RADIUS;

  // World bounds (cells go from 0..COLS-1, so world spans [-0.5 .. COLS-0.5))
  if (cx - R < -0.5 || cx + R > COLS - 0.5) return false;
  if (cy - R < -0.5 || cy + R > ROWS - 0.5) return false;

  // Convert AABB edges to the grid cells they overlap.
  // A position p is inside cell c when c - 0.5 <= p < c + 0.5,
  // i.e. c = Math.round(p).  For a range [lo, hi] we want all cells
  // from Math.round(lo) to Math.round(hi - epsilon).
  const EPS = 1e-9;
  const minGX = Math.round(cx - R);
  const maxGX = Math.round(cx + R - EPS);
  const minGY = Math.round(cy - R);
  const maxGY = Math.round(cy + R - EPS);

  for (let gy = minGY; gy <= maxGY; gy++) {
    for (let gx = minGX; gx <= maxGX; gx++) {
      if (isSolid(state, player, gx, gy)) return false;
    }
  }
  return true;
}

function movePlayer(state, player, dir) {
  if (!player.alive) return;
  const v = DIR_VECS[dir];
  if (!v) return;

  player.dir = dir;
  if (player.moveCooldown > 0) return;

  const gx = toCell(player.x);
  const gy = toCell(player.y);
  const nx = gx + v.dx;
  const ny = gy + v.dy;

  if (isSolid(state, player, nx, ny)) return;

  player.x = nx;
  player.y = ny;
  player.moveCooldown = 1 / Math.max(0.1, player.speed || BASE_SPEED);

  // Once the player leaves a bomb's cell, it becomes solid for them again.
  for (const bombId of player.passableBombs) {
    const bomb = state.bombs.get(bombId);
    if (!bomb) {
      player.passableBombs.delete(bombId);
      continue;
    }
    const bgx = toCell(bomb.x);
    const bgy = toCell(bomb.y);
    if (player.x !== bgx || player.y !== bgy) {
      player.passableBombs.delete(bombId);
    }
  }
}

// ---------------------------------------------------------------------------
//  Bomb placement
// ---------------------------------------------------------------------------

function placeBomb(state, player, changes) {
  if (!player.alive) return;
  if (player.bombsPlaced >= player.maxBombs) return;

  const gx = toCell(player.x);
  const gy = toCell(player.y);

  // Don't stack bombs
  if (bombAtCell(state, gx, gy)) return;

  const id = nextId(state);
  const bomb = {
    id,
    x:          gx,
    y:          gy,
    owner:      player.id,
    timer:      BOMB_FUSE,
    blastRange: player.blastRange,
  };

  state.bombs.set(id, bomb);
  player.bombsPlaced++;
  player.passableBombs.add(id);

  changes.push({ type: 'bomb', x: gx, y: gy, id });
}

// ---------------------------------------------------------------------------
//  Bomb kick
// ---------------------------------------------------------------------------

function tryKickBomb(state, player, dir) {
  if (!player.canKick) return;
  const v = DIR_VECS[dir];
  if (!v) return;

  const gx = toCell(player.x) + v.dx;
  const gy = toCell(player.y) + v.dy;
  const bomb = bombAtCell(state, gx, gy);
  if (!bomb) return;
  // Don't kick a bomb that's already moving
  if (bomb.vx || bomb.vy) return;

  bomb.vx = v.dx * 6; // 6 cells/sec
  bomb.vy = v.dy * 6;
}

// ---------------------------------------------------------------------------
//  Explosions
// ---------------------------------------------------------------------------

function detonateBomb(state, bomb, changes) {
  // Guard: bomb may already have been chain-detonated
  if (!state.bombs.has(bomb.id)) return;
  state.bombs.delete(bomb.id);

  // Return bomb slot to owner
  const owner = state.players.get(bomb.owner);
  if (owner) owner.bombsPlaced = Math.max(0, owner.bombsPlaced - 1);

  const cx = toCell(bomb.x);
  const cy = toCell(bomb.y);
  const range = bomb.blastRange;

  // Calculate reach in each cardinal direction
  const reach = { up: 0, down: 0, left: 0, right: 0 };
  const dirs = [
    { key: 'up',    dx:  0, dy: -1 },
    { key: 'right', dx:  1, dy:  0 },
    { key: 'down',  dx:  0, dy:  1 },
    { key: 'left',  dx: -1, dy:  0 },
  ];

  for (const d of dirs) {
    for (let i = 1; i <= range; i++) {
      const nx = cx + d.dx * i;
      const ny = cy + d.dy * i;
      if (!inBounds(nx, ny)) break;

      const cell = state.grid[ny][nx];
      if (cell === HARD) break;

      reach[d.key] = i;

      if (cell === SOFT) {
        // Destroy the soft block
        state.grid[ny][nx] = EMPTY;
        changes.push({ type: 'break', x: nx, y: ny });

        // Reveal hidden item
        const key = cellKey(nx, ny);
        const itemType = state.hiddenItems.get(key);
        if (itemType) {
          state.hiddenItems.delete(key);
          const itemId = nextId(state);
          state.items.set(itemId, { id: itemId, x: nx, y: ny, type: itemType });
          changes.push({ type: 'item', x: nx, y: ny, itemType, id: itemId });
        }
        break; // explosion stops at the soft block it destroys
      }

      // Chain reaction: trigger any bomb in this cell
      const hitBomb = bombAtCell(state, nx, ny);
      if (hitBomb) {
        detonateBomb(state, hitBomb, changes);
      }
    }
  }

  // Create explosion entity
  const expId = nextId(state);
  const explosion = {
    id:    expId,
    cx, cy,
    up:    reach.up,
    right: reach.right,
    down:  reach.down,
    left:  reach.left,
    timer: EXPLOSION_TTL,
  };
  state.explosions.set(expId, explosion);
  changes.push({ type: 'explosion', id: expId, cx, cy, ...reach });

  // Destroy items caught in the blast
  for (const [itemId, item] of state.items) {
    if (explosionHitsCell(explosion, item.x, item.y)) {
      state.items.delete(itemId);
      changes.push({ type: 'item_destroy', id: itemId });
    }
  }
}

// ---------------------------------------------------------------------------
//  Player damage
// ---------------------------------------------------------------------------

function checkPlayerDamage(state, changes) {
  for (const player of state.players.values()) {
    if (!player.alive) continue;

    const pgx = toCell(player.x);
    const pgy = toCell(player.y);

    // Crushed by sudden-death hard block
    if (inBounds(pgx, pgy) && state.grid[pgy][pgx] === HARD) {
      killPlayer(state, player, changes);
      continue;
    }

    // Hit by explosion
    for (const exp of state.explosions.values()) {
      if (explosionHitsCell(exp, pgx, pgy)) {
        killPlayer(state, player, changes);
        break;
      }
    }
  }
}

function killPlayer(state, player, changes) {
  if (!player.alive) return;
  player.alive = false;

  // Remove any bombs this player placed
  for (const [id, bomb] of state.bombs) {
    if (bomb.owner === player.id) {
      state.bombs.delete(id);
    }
  }
  player.bombsPlaced = 0;

  changes.push({ type: 'kill', playerId: player.id, seat: player.seat });
}

// ---------------------------------------------------------------------------
//  Item pickup
// ---------------------------------------------------------------------------

function checkItemPickup(state, changes) {
  for (const player of state.players.values()) {
    if (!player.alive) continue;

    const pgx = toCell(player.x);
    const pgy = toCell(player.y);

    for (const [itemId, item] of state.items) {
      if (item.x === pgx && item.y === pgy) {
        applyPowerUp(player, item.type);
        state.items.delete(itemId);
        changes.push({
          type: 'pickup', playerId: player.id, itemType: item.type, id: itemId,
        });
      }
    }
  }
}

function applyPowerUp(player, type) {
  switch (type) {
    case 'extra_bomb': player.maxBombs++;            break;
    case 'blast_up':   player.blastRange++;          break;
    case 'speed_up':   player.speed += SPEED_PER_UP; break;
    case 'kick':       player.canKick = true;        break;
    case 'pass':       player.canPass = true;        break;
  }
}

// ---------------------------------------------------------------------------
//  Sudden death
// ---------------------------------------------------------------------------

function tickSuddenDeath(state, changes) {
  if (!state.suddenDeath) return;

  state.suddenDeathAccum += DT;
  const interval = 1 / SUDDEN_DEATH_RATE; // 0.5s per block

  while (state.suddenDeathAccum >= interval) {
    state.suddenDeathAccum -= interval;

    // Walk the spiral, skipping cells that are already hard
    let placed = false;
    while (state.suddenDeathIdx < SPIRAL_ORDER.length && !placed) {
      const cell = SPIRAL_ORDER[state.suddenDeathIdx];
      state.suddenDeathIdx++;

      if (state.grid[cell.y][cell.x] === HARD) continue;

      state.grid[cell.y][cell.x] = HARD;

      // Remove bombs on this cell
      for (const [id, bomb] of state.bombs) {
        if (toCell(bomb.x) === cell.x && toCell(bomb.y) === cell.y) {
          const bOwner = state.players.get(bomb.owner);
          if (bOwner) bOwner.bombsPlaced = Math.max(0, bOwner.bombsPlaced - 1);
          state.bombs.delete(id);
        }
      }

      // Remove items on this cell
      for (const [id, item] of state.items) {
        if (item.x === cell.x && item.y === cell.y) {
          state.items.delete(id);
        }
      }

      state.hiddenItems.delete(cellKey(cell.x, cell.y));
      changes.push({ type: 'sudden_death', x: cell.x, y: cell.y });
      placed = true;
    }
  }
}

// ---------------------------------------------------------------------------
//  Tick bombs (fuse countdown + kicked-bomb movement)
// ---------------------------------------------------------------------------

function tickBombs(state, changes) {
  const toDetonate = [];

  for (const bomb of state.bombs.values()) {
    // Move kicked bombs
    if (bomb.vx || bomb.vy) {
      const nx = bomb.x + (bomb.vx || 0) * DT;
      const ny = bomb.y + (bomb.vy || 0) * DT;
      const ngx = toCell(nx);
      const ngy = toCell(ny);

      let blocked = false;
      if (!inBounds(ngx, ngy)) {
        blocked = true;
      } else if (state.grid[ngy][ngx] === HARD || state.grid[ngy][ngx] === SOFT) {
        blocked = true;
      } else {
        for (const other of state.bombs.values()) {
          if (other.id === bomb.id) continue;
          if (toCell(other.x) === ngx && toCell(other.y) === ngy) {
            blocked = true;
            break;
          }
        }
      }

      if (blocked) {
        bomb.x = Math.round(bomb.x);
        bomb.y = Math.round(bomb.y);
        bomb.vx = 0;
        bomb.vy = 0;
      } else {
        bomb.x = nx;
        bomb.y = ny;
      }
    }

    bomb.timer -= DT;
    if (bomb.timer <= 0) {
      toDetonate.push(bomb);
    }
  }

  for (const bomb of toDetonate) {
    detonateBomb(state, bomb, changes);
  }
}

// ---------------------------------------------------------------------------
//  Tick explosions (decay)
// ---------------------------------------------------------------------------

function tickExplosions(state) {
  for (const [id, exp] of state.explosions) {
    exp.timer -= DT;
    if (exp.timer <= 0) {
      state.explosions.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
//  tick(state, inputs)
// ---------------------------------------------------------------------------

function tick(state, inputs) {
  const changes = [];

  state.tick++;
  state.timer -= DT;

  // Trigger sudden death when timer runs out
  if (state.timer <= 0 && !state.suddenDeath) {
    state.suddenDeath = true;
    state.suddenDeathAccum = 0;
    changes.push({ type: 'sudden_death_start' });
  }

  // --- Process player inputs ---
  for (const player of state.players.values()) {
    if (!player.alive) continue;
    player.moveCooldown = Math.max(0, (player.moveCooldown || 0) - DT);
  }

  for (const [playerId, input] of inputs) {
    const player = state.players.get(playerId);
    if (!player || !player.alive) continue;

    if (input.bomb) {
      placeBomb(state, player, changes);
    }
    if (input.dir) {
      movePlayer(state, player, input.dir);
    }
  }

  // --- Bomb kick detection (after movement) ---
  for (const [playerId, input] of inputs) {
    const player = state.players.get(playerId);
    if (!player || !player.alive) continue;
    if (input.dir) {
      tryKickBomb(state, player, input.dir);
    }
  }

  // --- Update bombs (fuse + kicked movement) ---
  tickBombs(state, changes);

  // --- Decay explosions ---
  tickExplosions(state);

  // --- Item pickup ---
  checkItemPickup(state, changes);

  // --- Sudden death ---
  tickSuddenDeath(state, changes);

  // --- Damage check (last, so new explosions / blocks kill this frame) ---
  checkPlayerDamage(state, changes);

  return changes;
}

// ---------------------------------------------------------------------------
//  getSnapshot(state) -- compact format for network
// ---------------------------------------------------------------------------

function getSnapshot(state) {
  const players = [];
  for (const p of state.players.values()) {
    players.push([
      p.seat,
      Math.round(p.x * 100) / 100,
      Math.round(p.y * 100) / 100,
      p.dir,
      p.alive ? 1 : 0,
    ]);
  }

  const bombs = [];
  for (const b of state.bombs.values()) {
    bombs.push([
      b.id,
      Math.round(b.x * 100) / 100,
      Math.round(b.y * 100) / 100,
      Math.round(b.timer * 100) / 100,
    ]);
  }

  const explosions = [];
  for (const e of state.explosions.values()) {
    explosions.push([
      e.id, e.cx, e.cy,
      e.up, e.right, e.down, e.left,
      Math.round(e.timer * 100) / 100,
    ]);
  }

  const items = [];
  for (const i of state.items.values()) {
    items.push([i.id, i.x, i.y, i.type]);
  }

  return {
    t:  state.tick,
    tm: Math.round(state.timer * 100) / 100,
    sd: state.suddenDeath ? 1 : 0,
    p:  players,
    b:  bombs,
    e:  explosions,
    i:  items,
  };
}

// ---------------------------------------------------------------------------
//  Round end helpers
// ---------------------------------------------------------------------------

function alivePlayers(state) {
  const alive = [];
  for (const p of state.players.values()) {
    if (p.alive) alive.push(p);
  }
  return alive;
}

function isRoundOver(state) {
  return alivePlayers(state).length <= 1;
}

function getRoundWinner(state) {
  const alive = alivePlayers(state);
  if (alive.length === 1) return alive[0].seat;
  return -1; // draw
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------

module.exports = {
  COLS,
  ROWS,
  TICK_RATE,
  EMPTY,
  HARD,
  SOFT,
  createRound,
  tick,
  getSnapshot,
  isRoundOver,
  getRoundWinner,
};

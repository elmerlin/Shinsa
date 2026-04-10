/**
 * Pet Bomber — Canvas 2D pixel-art renderer (SNES Bomberman style)
 * Uses the same pet sprite system as Pet Battle / Pac It Up / Invaders.
 */
import { CHAR_COLORS, drawPet } from './miniPumpSprites';

// ─── Grid constants ──────────────────────────────────────────────
const COLS = 13;
const ROWS = 11;
const CELL_EMPTY = 0;
const CELL_HARD = 1;
const CELL_SOFT = 2;

// ─── SNES Bomberman palette ─────────────────────────────────────
const GRASS_A = '#5da64e';
const GRASS_B = '#529843';
const HARD_BASE = '#62687a';
const HARD_LIGHT = '#7a8298';
const HARD_DARK = '#484e5c';
const SOFT_BASE = '#c89464';
const SOFT_LIGHT = '#daa878';
const SOFT_DARK = '#a07444';
const BORDER_DARK = '#383848';
const BORDER_LIGHT = '#505068';
const SUDDEN_DEATH_COLOR = '#8b2020';

const SEAT_COLORS = ['#60a5fa', '#f87171', '#34d399', '#fbbf24'];
const SEAT_DARK   = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];

const ITEM_PALETTE = {
  extra_bomb: { bg: '#cc3333', fg: '#ff6666', label: '+B', shape: 'bomb' },
  blast_up:   { bg: '#cc6600', fg: '#ffaa33', label: '+R', shape: 'flame' },
  speed_up:   { bg: '#2288cc', fg: '#55ccff', label: 'SP', shape: 'bolt' },
  kick:       { bg: '#ccaa00', fg: '#ffdd44', label: 'KI', shape: 'boot' },
  pass:       { bg: '#7733bb', fg: '#bb77ff', label: 'PA', shape: 'ghost' },
};

const LERP_SPEED = 14;
const PREDICT_SPEED = 3.0;  // base cells/sec — overridden by measured velocity
const PLAYER_RADIUS = 0.35;
const CORRECTION_RATE = 6;  // how fast local player corrects toward server pos
const DIR_VECS = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

// ─── Helpers ─────────────────────────────────────────────────────
function px(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), s, s);
}

function lerp(a, b, t) { return a + (b - a) * Math.min(t, 1); }

// ─── Renderer ────────────────────────────────────────────────────
export default class PetBomberRenderer {
  constructor(containerEl) {
    this._container = containerEl;
    this._disposed = false;
    this._localSeat = -1;
    this._grid = null;
    this._seatCharacters = {};

    // Canvas
    this._canvas = document.createElement('canvas');
    this._canvas.style.display = 'block';
    this._canvas.style.imageRendering = 'pixelated';
    this._canvas.style.imageRendering = 'crisp-edges';
    this._canvas.style.width = '100%';
    this._canvas.style.height = '100%';
    containerEl.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    // Layout (set by resize)
    this._cs = 48; // cell size
    this._ox = 0;  // grid offset x
    this._oy = 0;  // grid offset y

    // Dynamic state
    this._players = Array.from({ length: 4 }, (_, i) => ({
      x: [1, 11, 1, 11][i], y: [1, 1, 9, 9][i],
      tx: [1, 11, 1, 11][i], ty: [1, 1, 9, 9][i],
      vx: 0, vy: 0,  // velocity (cells/sec) derived from snapshot deltas
      dir: 'down', alive: true, visible: false,
    }));
    this._bombs = new Map();
    this._explosions = new Map();
    this._items = new Map();
    this._breakFX = []; // { x, y, t, max }
    this._deathFX = []; // { x, y, t, seat }
    this._suddenDeath = false;
    this._timer = 90;
    this._tick = 0;

    this._localDir = null;   // current input direction for local player
    this._localSpeed = PREDICT_SPEED;

    this._animTime = 0;
    this._lastTime = performance.now();
    this._rafId = 0;

    this.resize();
    this._startLoop();
  }

  // ── Public API ──────────────────────────────────────────────────

  getCanvas() { return this._canvas; }

  setLocalSeat(seat) { this._localSeat = seat; }

  setLocalDir(dir) { this._localDir = dir || null; }

  setSeats(seats) {
    this._seatCharacters = {};
    if (!seats) return;
    seats.forEach((s, i) => {
      if (s && s.character) this._seatCharacters[i] = s.character;
    });
  }

  setGrid(grid) {
    this._grid = grid ? grid.map(row => [...row]) : null;
    // Reset dynamic state
    this._bombs.clear();
    this._explosions.clear();
    this._items.clear();
    this._breakFX = [];
    this._deathFX = [];
    // Reset players to spawn
    for (let i = 0; i < 4; i++) {
      const sx = [1, 11, 1, 11][i], sy = [1, 1, 9, 9][i];
      this._players[i].x = sx;
      this._players[i].y = sy;
      this._players[i].tx = sx;
      this._players[i].ty = sy;
      this._players[i].vx = 0;
      this._players[i].vy = 0;
      this._players[i].dir = 'down';
      this._players[i].alive = true;
      this._players[i].visible = false;
    }
  }

  resize() {
    if (this._disposed) return;
    const w = this._container.clientWidth || 400;
    const h = this._container.clientHeight || 300;
    this._canvas.width = w;
    this._canvas.height = h;
    // Fit grid in canvas with margins
    const marginTop = 4;
    const marginBot = 4;
    const cw = Math.floor(w / COLS);
    const ch = Math.floor((h - marginTop - marginBot) / ROWS);
    this._cs = Math.max(16, Math.min(cw, ch));
    const gridW = this._cs * COLS;
    const gridH = this._cs * ROWS;
    this._ox = Math.floor((w - gridW) / 2);
    this._oy = Math.floor((h - gridH) / 2);
  }

  applySnapshot(snap) {
    if (!snap) return;
    this._tick = snap.t || 0;
    this._timer = snap.tm != null ? snap.tm : 90;
    this._suddenDeath = !!snap.sd;

    // Players
    if (snap.p) {
      const TICK_DT = 1 / 20; // server tick rate
      for (const pd of snap.p) {
        const [seat, x, y, dir, alive] = pd;
        if (seat < 0 || seat >= 4) continue;
        const p = this._players[seat];
        // Derive velocity from position delta between snapshots
        const dx = x - p.tx;
        const dy = y - p.ty;
        p.vx = dx / TICK_DT;
        p.vy = dy / TICK_DT;
        // Track measured speed for local player prediction
        if (seat === this._localSeat) {
          const measuredSpeed = Math.max(Math.abs(p.vx), Math.abs(p.vy));
          if (measuredSpeed > 0.5) this._localSpeed = measuredSpeed;
        }
        p.tx = x;
        p.ty = y;
        p.dir = dir;
        p.visible = true;
        if (p.alive && !alive) {
          p.alive = false;
          this._deathFX.push({ x: p.x, y: p.y, t: 0, seat });
        }
        if (!p.alive && alive) p.alive = true;
      }
    }

    // Bombs — sync with server
    if (snap.b) {
      const ids = new Set();
      for (const bd of snap.b) {
        const [id, x, y, timer] = bd;
        ids.add(id);
        if (!this._bombs.has(id)) {
          this._bombs.set(id, { x, y, timer, t: 0 });
        } else {
          const b = this._bombs.get(id);
          b.x = x; b.y = y; b.timer = timer;
        }
      }
      for (const id of this._bombs.keys()) {
        if (!ids.has(id)) this._bombs.delete(id);
      }
    } else {
      this._bombs.clear();
    }

    // Explosions
    if (snap.e) {
      const ids = new Set();
      for (const ed of snap.e) {
        const [id, cx, cy, up, right, down, left, timer] = ed;
        ids.add(id);
        if (!this._explosions.has(id)) {
          this._explosions.set(id, { cx, cy, up, right, down, left, timer, t: 0 });
        } else {
          const e = this._explosions.get(id);
          e.timer = timer;
        }
      }
      for (const id of this._explosions.keys()) {
        if (!ids.has(id)) this._explosions.delete(id);
      }
    } else {
      this._explosions.clear();
    }

    // Items
    if (snap.i) {
      const ids = new Set();
      for (const id of snap.i) {
        const [itemId, x, y, type] = id;
        ids.add(itemId);
        if (!this._items.has(itemId)) {
          this._items.set(itemId, { x, y, type, t: 0 });
        }
      }
      for (const id of this._items.keys()) {
        if (!ids.has(id)) this._items.delete(id);
      }
    } else {
      this._items.clear();
    }
  }

  applyGridChanges(changes) {
    if (!changes || !Array.isArray(changes)) return;
    for (const ev of changes) {
      switch (ev.type) {
        case 'break':
          if (this._grid && this._grid[ev.y]) {
            this._grid[ev.y][ev.x] = CELL_EMPTY;
          }
          this._breakFX.push({ x: ev.x, y: ev.y, t: 0, max: 0.4 });
          break;
        case 'bomb':
          if (!this._bombs.has(ev.id)) {
            this._bombs.set(ev.id, { x: ev.x, y: ev.y, timer: 2.5, t: 0 });
          }
          break;
        case 'explosion':
          if (!this._explosions.has(ev.id)) {
            this._explosions.set(ev.id, {
              cx: ev.cx, cy: ev.cy,
              up: ev.up, right: ev.right, down: ev.down, left: ev.left,
              timer: 0.5, t: 0,
            });
          }
          break;
        case 'item':
          if (!this._items.has(ev.id)) {
            this._items.set(ev.id, { x: ev.x, y: ev.y, type: ev.itemType, t: 0 });
          }
          break;
        case 'item_destroy':
        case 'pickup':
          this._items.delete(ev.id);
          break;
        case 'kill':
          if (ev.seat >= 0 && ev.seat < 4) {
            const p = this._players[ev.seat];
            if (p.alive) {
              this._deathFX.push({ x: p.x, y: p.y, t: 0, seat: ev.seat });
            }
            p.alive = false;
          }
          break;
        case 'sudden_death':
          if (this._grid && this._grid[ev.y]) {
            this._grid[ev.y][ev.x] = CELL_HARD;
          }
          break;
        case 'sudden_death_start':
          this._suddenDeath = true;
          break;
      }
    }
  }

  dispose() {
    this._disposed = true;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    if (this._canvas.parentElement) {
      this._canvas.parentElement.removeChild(this._canvas);
    }
  }

  // ── Animation loop ──────────────────────────────────────────────

  _startLoop() {
    const frame = (now) => {
      if (this._disposed) return;
      this._rafId = requestAnimationFrame(frame);
      const dt = Math.min((now - this._lastTime) / 1000, 0.1);
      this._lastTime = now;
      this._animTime += dt;
      this._update(dt);
      this._render();
    };
    this._rafId = requestAnimationFrame(frame);
  }

  // Simple grid collision check for client-side prediction
  _canOccupy(cx, cy) {
    const grid = this._grid;
    if (!grid) return true;
    const R = PLAYER_RADIUS;
    if (cx - R < -0.5 || cx + R > COLS - 0.5) return false;
    if (cy - R < -0.5 || cy + R > ROWS - 0.5) return false;
    const EPS = 1e-9;
    const minGX = Math.round(cx - R);
    const maxGX = Math.round(cx + R - EPS);
    const minGY = Math.round(cy - R);
    const maxGY = Math.round(cy + R - EPS);
    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (gy < 0 || gy >= ROWS || gx < 0 || gx >= COLS) return false;
        const cell = grid[gy]?.[gx];
        if (cell === 1 || cell === 2) return false; // hard or soft block
        // Check bombs
        for (const b of this._bombs.values()) {
          if (Math.round(b.x) === gx && Math.round(b.y) === gy) return false;
        }
      }
    }
    return true;
  }

  _update(dt) {
    // Interpolate player positions
    const lf = LERP_SPEED * dt;
    for (let i = 0; i < this._players.length; i++) {
      const p = this._players[i];
      if (!p.visible) continue;

      if (i === this._localSeat && p.alive) {
        // ── Local player: client-side prediction ──
        // Move immediately based on held direction
        if (this._localDir) {
          const v = DIR_VECS[this._localDir];
          if (v) {
            const spd = this._localSpeed * dt;
            const nx = p.x + v.dx * spd;
            const ny = p.y + v.dy * spd;
            if (this._canOccupy(nx, ny)) {
              p.x = nx;
              p.y = ny;
            } else {
              // Wall-slide: nudge perpendicular axis toward lane
              if (v.dx !== 0) {
                const ry = Math.round(p.y);
                const diff = ry - p.y;
                if (Math.abs(diff) > 0.01) {
                  const sy = p.y + Math.sign(diff) * Math.min(spd, Math.abs(diff));
                  if (this._canOccupy(p.x, sy)) {
                    p.y = sy;
                    const nx2 = p.x + v.dx * spd;
                    if (this._canOccupy(nx2, p.y)) p.x = nx2;
                  }
                }
              } else {
                const rx = Math.round(p.x);
                const diff = rx - p.x;
                if (Math.abs(diff) > 0.01) {
                  const sx = p.x + Math.sign(diff) * Math.min(spd, Math.abs(diff));
                  if (this._canOccupy(sx, p.y)) {
                    p.x = sx;
                    const ny2 = p.y + v.dy * spd;
                    if (this._canOccupy(p.x, ny2)) p.y = ny2;
                  }
                }
              }
            }
          }
        }
        // Gentle correction toward server authoritative position
        const cf = CORRECTION_RATE * dt;
        p.x = lerp(p.x, p.tx, cf);
        p.y = lerp(p.y, p.ty, cf);
      } else {
        // ── Remote players: velocity-based interpolation ──
        const goalX = p.tx + p.vx * dt;
        const goalY = p.ty + p.vy * dt;
        p.x = lerp(p.x, goalX, lf);
        p.y = lerp(p.y, goalY, lf);
      }
    }
    // Advance effect timers
    for (const b of this._bombs.values()) b.t += dt;
    for (const e of this._explosions.values()) e.t += dt;
    for (const i of this._items.values()) i.t += dt;
    this._breakFX = this._breakFX.filter(f => { f.t += dt; return f.t < f.max; });
    this._deathFX = this._deathFX.filter(f => { f.t += dt; return f.t < 1.0; });
  }

  // ── Main render ─────────────────────────────────────────────────

  _render() {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;
    const cs = this._cs;
    const ox = this._ox;
    const oy = this._oy;

    // Clear
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, 0, w, h);

    if (!this._grid) return;

    // ── Ground layer ──
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const sx = ox + c * cs;
        const sy = oy + r * cs;
        const cell = this._grid[r][c];
        if (cell === CELL_EMPTY) {
          this._drawGrass(ctx, sx, sy, cs, c, r);
        } else if (cell === CELL_HARD) {
          this._drawHardBlock(ctx, sx, sy, cs);
        } else if (cell === CELL_SOFT) {
          this._drawGrass(ctx, sx, sy, cs, c, r);
          this._drawSoftBlock(ctx, sx, sy, cs);
        }
      }
    }

    // ── Break effects ──
    for (const fx of this._breakFX) {
      const sx = ox + fx.x * cs;
      const sy = oy + fx.y * cs;
      const progress = fx.t / fx.max;
      this._drawBreakEffect(ctx, sx, sy, cs, progress);
    }

    // ── Items (below players) ──
    for (const item of this._items.values()) {
      const sx = ox + item.x * cs;
      const sy = oy + item.y * cs;
      this._drawItem(ctx, sx, sy, cs, item.type, item.t);
    }

    // ── Bombs ──
    for (const bomb of this._bombs.values()) {
      const sx = ox + bomb.x * cs;
      const sy = oy + bomb.y * cs;
      this._drawBomb(ctx, sx, sy, cs, bomb.timer, bomb.t);
    }

    // ── Players (sorted by Y for overlap) ──
    const sorted = this._players
      .map((p, i) => ({ ...p, seat: i }))
      .filter(p => p.visible)
      .sort((a, b) => a.y - b.y);

    for (const p of sorted) {
      const sx = ox + p.x * cs;
      const sy = oy + p.y * cs;
      this._drawPlayer(ctx, sx, sy, cs, p.seat, p.dir, p.alive, p);
    }

    // ── Death effects ──
    for (const fx of this._deathFX) {
      const sx = ox + fx.x * cs;
      const sy = oy + fx.y * cs;
      this._drawDeathPoof(ctx, sx, sy, cs, fx.t);
    }

    // ── Explosions (on top) ──
    for (const exp of this._explosions.values()) {
      this._drawExplosion(ctx, ox, oy, cs, exp);
    }

    // ── Border ──
    this._drawBorder(ctx, ox, oy, cs);

    // ── HUD ──
    this._drawHUD(ctx, w, h, ox, oy, cs);
  }

  // ── Tile drawing ────────────────────────────────────────────────

  _drawGrass(ctx, x, y, cs, col, row) {
    ctx.fillStyle = (col + row) % 2 === 0 ? GRASS_A : GRASS_B;
    ctx.fillRect(x, y, cs, cs);
    // Subtle pixel detail
    const ps = Math.max(1, Math.floor(cs / 16));
    if (ps >= 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      for (let dy = 0; dy < cs; dy += ps * 4) {
        for (let dx = 0; dx < cs; dx += ps * 4) {
          if ((Math.floor(dx / ps) + Math.floor(dy / ps)) % 3 === 0) {
            ctx.fillRect(x + dx, y + dy, ps, ps);
          }
        }
      }
    }
  }

  _drawHardBlock(ctx, x, y, cs) {
    const ps = Math.max(1, Math.floor(cs / 12));
    // Base
    ctx.fillStyle = HARD_BASE;
    ctx.fillRect(x, y, cs, cs);
    // Top bevel
    ctx.fillStyle = HARD_LIGHT;
    ctx.fillRect(x, y, cs, ps * 2);
    ctx.fillRect(x, y, ps * 2, cs);
    // Bottom bevel
    ctx.fillStyle = HARD_DARK;
    ctx.fillRect(x, y + cs - ps * 2, cs, ps * 2);
    ctx.fillRect(x + cs - ps * 2, y, ps * 2, cs);
    // Brick lines
    ctx.fillStyle = HARD_DARK;
    const halfH = Math.floor(cs / 2);
    ctx.fillRect(x + ps * 2, y + halfH - 1, cs - ps * 4, Math.max(1, ps));
    ctx.fillRect(x + Math.floor(cs / 3), y + ps * 2, Math.max(1, ps), halfH - ps * 3);
    ctx.fillRect(x + Math.floor(cs * 2 / 3), y + halfH, Math.max(1, ps), halfH - ps * 3);
  }

  _drawSoftBlock(ctx, x, y, cs) {
    const ps = Math.max(1, Math.floor(cs / 12));
    const inset = ps;
    // Base
    ctx.fillStyle = SOFT_BASE;
    ctx.fillRect(x + inset, y + inset, cs - inset * 2, cs - inset * 2);
    // Top highlight
    ctx.fillStyle = SOFT_LIGHT;
    ctx.fillRect(x + inset, y + inset, cs - inset * 2, ps * 2);
    ctx.fillRect(x + inset, y + inset, ps * 2, cs - inset * 2);
    // Bottom shadow
    ctx.fillStyle = SOFT_DARK;
    ctx.fillRect(x + inset, y + cs - inset - ps * 2, cs - inset * 2, ps * 2);
    ctx.fillRect(x + cs - inset - ps * 2, y + inset, ps * 2, cs - inset * 2);
    // Cross-hatch
    ctx.fillStyle = SOFT_DARK;
    const mid = Math.floor(cs / 2);
    ctx.fillRect(x + mid - 1, y + inset + ps * 2, Math.max(1, ps), cs - inset * 2 - ps * 4);
    ctx.fillRect(x + inset + ps * 2, y + mid - 1, cs - inset * 2 - ps * 4, Math.max(1, ps));
  }

  _drawBreakEffect(ctx, x, y, cs, progress) {
    const alpha = 1 - progress;
    const scale = 1 - progress * 0.6;
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    // Shrinking soft block
    const half = cs / 2;
    ctx.fillStyle = SOFT_BASE;
    ctx.fillRect(-half, -half, cs, cs);
    ctx.restore();
    // Debris particles
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    const ps = Math.max(2, cs / 8);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + progress * 2;
      const dist = progress * cs * 0.8;
      const px2 = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      ctx.fillStyle = i % 2 === 0 ? SOFT_LIGHT : SOFT_DARK;
      ctx.fillRect(px2 - ps / 2, py - ps / 2, ps, ps);
    }
    ctx.restore();
  }

  // ── Bomb drawing ────────────────────────────────────────────────

  _drawBomb(ctx, x, y, cs, timer, elapsed) {
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    const r = cs * 0.32;
    const urgency = Math.max(0, 1 - timer / 2.5);
    const pulse = 1 + Math.sin(elapsed * (8 + urgency * 16)) * 0.06 * (1 + urgency);
    const pr = r * pulse;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.6, pr * 0.9, pr * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = '#3a3a5e';
    ctx.beginPath();
    ctx.arc(cx - pr * 0.25, cy - pr * 0.25, pr * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Fuse
    const fuseX = cx + pr * 0.3;
    const fuseY = cy - pr * 0.8;
    ctx.strokeStyle = '#886644';
    ctx.lineWidth = Math.max(1, cs / 16);
    ctx.beginPath();
    ctx.moveTo(cx + pr * 0.1, cy - pr * 0.6);
    ctx.quadraticCurveTo(fuseX + 2, fuseY + 4, fuseX, fuseY);
    ctx.stroke();

    // Spark
    const sparkFlicker = Math.sin(elapsed * 20) > 0;
    if (sparkFlicker) {
      const sparkR = Math.max(2, cs / 10);
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(fuseX, fuseY - 1, sparkR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(fuseX, fuseY - 1, sparkR * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Explosion drawing ───────────────────────────────────────────

  _drawExplosion(ctx, ox, oy, cs, exp) {
    const life = Math.min(exp.t / 0.5, 1);
    const alpha = life < 0.15 ? life / 0.15 : Math.max(0, 1 - (life - 0.15) / 0.85);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Draw each cell of the explosion cross
    const drawCell = (gx, gy, isEnd) => {
      const sx = ox + gx * cs;
      const sy = oy + gy * cs;
      const inset = cs * 0.08;
      const flicker = Math.sin(exp.t * 30 + gx * 3 + gy * 5) * 0.15;

      // Outer glow
      ctx.fillStyle = `rgba(255,100,0,${0.3 + flicker})`;
      ctx.fillRect(sx - 2, sy - 2, cs + 4, cs + 4);

      // Fire base
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(sx + inset, sy + inset, cs - inset * 2, cs - inset * 2);

      // Inner bright core
      const innerInset = inset + cs * 0.12;
      ctx.fillStyle = '#ffaa22';
      ctx.fillRect(sx + innerInset, sy + innerInset, cs - innerInset * 2, cs - innerInset * 2);

      // White-hot center
      const coreInset = inset + cs * 0.22;
      ctx.fillStyle = '#fff8dd';
      ctx.fillRect(sx + coreInset, sy + coreInset, cs - coreInset * 2, cs - coreInset * 2);

      // Pixel flame details at edges
      const ps = Math.max(1, Math.floor(cs / 10));
      ctx.fillStyle = '#ff3300';
      if (isEnd) {
        // Rounded end caps
        for (let i = 0; i < 3; i++) {
          const fx = sx + cs * 0.2 + Math.random() * cs * 0.6;
          const fy = sy + cs * 0.2 + Math.random() * cs * 0.6;
          ctx.fillRect(fx, fy, ps, ps);
        }
      }
    };

    // Center
    drawCell(exp.cx, exp.cy, false);

    // Arms
    const arms = [
      { dx: 0, dy: -1, len: exp.up },
      { dx: 0, dy: 1, len: exp.down },
      { dx: -1, dy: 0, len: exp.left },
      { dx: 1, dy: 0, len: exp.right },
    ];
    for (const arm of arms) {
      for (let i = 1; i <= arm.len; i++) {
        drawCell(exp.cx + arm.dx * i, exp.cy + arm.dy * i, i === arm.len);
      }
    }

    ctx.restore();
  }

  // ── Item drawing ────────────────────────────────────────────────

  _drawItem(ctx, x, y, cs, type, elapsed) {
    const style = ITEM_PALETTE[type];
    if (!style) return;

    const cx = x + cs / 2;
    const cy = y + cs / 2 + Math.sin(elapsed * 4) * cs * 0.06;
    const r = cs * 0.28;
    const ps = Math.max(1, Math.floor(cs / 16)); // pixel size for pixel art

    // Glow
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(elapsed * 3) * 0.1;
    ctx.fillStyle = style.fg;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw pixel art icon per type
    ctx.save();
    ctx.translate(cx, cy);
    const px = (gx, gy, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(gx * ps - ps * 3.5, gy * ps - ps * 3.5, ps, ps);
    };

    if (type === 'extra_bomb') {
      // Bomb: round black body with red fuse spark
      const body = '#222222';
      const hi = '#444444';
      const fuse = '#996633';
      const spark1 = '#ff4400';
      const spark2 = '#ffaa00';
      //         0  1  2  3  4  5  6
      // row 0:           fuse/spark
      // row 1:        fuse
      // row 2:     bomb body
      // row 3:     bomb body
      // row 4:     bomb body
      // row 5:     bomb body
      // row 6:
      px(4, 0, spark2); px(5, 0, spark1);
      px(3, 1, fuse); px(4, 1, spark1);
      px(2, 2, body); px(3, 2, body); px(4, 2, body); px(5, 2, body);
      px(1, 3, body); px(2, 3, body); px(3, 3, hi); px(4, 3, body); px(5, 3, body); px(6, 3, body);
      px(1, 4, body); px(2, 4, body); px(3, 4, body); px(4, 4, body); px(5, 4, body); px(6, 4, body);
      px(1, 5, body); px(2, 5, body); px(3, 5, body); px(4, 5, body); px(5, 5, body); px(6, 5, body);
      px(2, 6, body); px(3, 6, body); px(4, 6, body); px(5, 6, body);
    } else if (type === 'blast_up') {
      // Flame: orange/red fire
      const red = '#dd3300';
      const ora = '#ff7700';
      const yel = '#ffcc00';
      px(3, 0, yel);
      px(2, 1, ora); px(3, 1, yel); px(4, 1, ora);
      px(1, 2, red); px(2, 2, ora); px(3, 2, yel); px(4, 2, ora); px(5, 2, red);
      px(1, 3, red); px(2, 3, ora); px(3, 3, yel); px(4, 3, ora); px(5, 3, red);
      px(1, 4, red); px(2, 4, ora); px(3, 4, ora); px(4, 4, ora); px(5, 4, red);
      px(2, 5, red); px(3, 5, red); px(4, 5, red);
      px(2, 6, red); px(3, 6, red); px(4, 6, red);
    } else if (type === 'speed_up') {
      // Lightning bolt
      const brt = '#55ccff';
      const mid = '#2288cc';
      const drk = '#1166aa';
      px(3, 0, brt); px(4, 0, brt);
      px(2, 1, brt); px(3, 1, mid);
      px(1, 2, brt); px(2, 2, mid);
      px(1, 3, brt); px(2, 3, brt); px(3, 3, brt); px(4, 3, brt); px(5, 3, brt);
      px(4, 4, mid); px(5, 4, brt);
      px(3, 5, mid); px(4, 5, drk);
      px(2, 6, mid); px(3, 6, drk);
    } else if (type === 'kick') {
      // Boot / shoe
      const sole = '#553311';
      const boot = '#ccaa00';
      const hi = '#ffdd44';
      px(2, 0, boot); px(3, 0, boot);
      px(2, 1, boot); px(3, 1, hi);
      px(2, 2, boot); px(3, 2, hi);
      px(2, 3, boot); px(3, 3, boot);
      px(1, 4, boot); px(2, 4, boot); px(3, 4, boot); px(4, 4, boot); px(5, 4, boot);
      px(1, 5, sole); px(2, 5, sole); px(3, 5, sole); px(4, 5, sole); px(5, 5, sole); px(6, 5, sole);
      px(1, 6, sole); px(2, 6, sole); px(3, 6, sole); px(4, 6, sole); px(5, 6, sole); px(6, 6, sole);
    } else if (type === 'pass') {
      // Ghost (pass through bombs)
      const body = '#bb77ff';
      const hi = '#ddaaff';
      const eye = '#ffffff';
      const pupil = '#333333';
      px(2, 0, body); px(3, 0, body); px(4, 0, body);
      px(1, 1, body); px(2, 1, hi); px(3, 1, hi); px(4, 1, body); px(5, 1, body);
      px(1, 2, body); px(2, 2, eye); px(3, 2, body); px(4, 2, eye); px(5, 2, body);
      px(1, 3, body); px(2, 3, pupil); px(3, 3, body); px(4, 3, pupil); px(5, 3, body);
      px(1, 4, body); px(2, 4, body); px(3, 4, body); px(4, 4, body); px(5, 4, body);
      px(1, 5, body); px(2, 5, body); px(3, 5, body); px(4, 5, body); px(5, 5, body);
      px(1, 6, body); px(3, 6, body); px(5, 6, body);
    }

    ctx.restore();
  }

  // ── Player drawing ──────────────────────────────────────────────

  _drawPlayer(ctx, x, y, cs, seat, dir, alive, player) {
    const cx = x + cs / 2;
    const cy = y + cs * 0.35;
    const character = this._seatCharacters[seat] || 'dojocat';
    const ps = Math.max(1, Math.floor(cs / 22));

    if (!alive) {
      // Ghost / fallen
      ctx.save();
      ctx.globalAlpha = 0.35;
      drawPet(ctx, cx, cy, ps * 0.7, character, 'bonk', 'stunned');
      ctx.restore();
      return;
    }

    // Walk animation
    const dx = Math.abs(player.tx - player.x);
    const dy = Math.abs(player.ty - player.y);
    const isMoving = dx > 0.03 || dy > 0.03;
    let pose = null;
    if (isMoving) {
      const phase = Math.floor(this._animTime * 8) % 4;
      pose = [null, 'step_red', null, 'step_blue'][phase];
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, y + cs * 0.85, cs * 0.3, cs * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Seat color indicator ring on ground
    ctx.strokeStyle = SEAT_DARK[seat];
    ctx.lineWidth = Math.max(1, ps);
    ctx.beginPath();
    ctx.ellipse(cx, y + cs * 0.85, cs * 0.32, cs * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Draw the pet
    drawPet(ctx, cx, cy, ps, character, pose, null);

    // Local player indicator (small arrow above head)
    if (seat === this._localSeat) {
      const arrowY = cy - 22 * ps;
      const bob = Math.sin(this._animTime * 4) * ps * 2;
      ctx.fillStyle = SEAT_COLORS[seat];
      ctx.beginPath();
      ctx.moveTo(cx, arrowY + bob);
      ctx.lineTo(cx - ps * 3, arrowY - ps * 4 + bob);
      ctx.lineTo(cx + ps * 3, arrowY - ps * 4 + bob);
      ctx.closePath();
      ctx.fill();
    }

    // Direction indicator (small dot in front of pet)
    const dirOffsets = {
      up: { dx: 0, dy: -cs * 0.45 },
      down: { dx: 0, dy: cs * 0.45 },
      left: { dx: -cs * 0.4, dy: 0 },
      right: { dx: cs * 0.4, dy: 0 },
    };
    const doff = dirOffsets[dir];
    if (doff && isMoving) {
      ctx.fillStyle = SEAT_COLORS[seat];
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx + doff.dx, y + cs * 0.5 + doff.dy, ps * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ── Death poof effect ───────────────────────────────────────────

  _drawDeathPoof(ctx, x, y, cs, t) {
    const progress = Math.min(t / 0.8, 1);
    const alpha = 1 - progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    const ps = Math.max(2, cs / 8);

    // Expanding cloud puffs
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = progress * cs * 0.7;
      const puffR = ps * (1.5 - progress);
      const px2 = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#dddddd';
      ctx.beginPath();
      ctx.arc(px2, py, Math.max(1, puffR), 0, Math.PI * 2);
      ctx.fill();
    }

    // Central flash
    if (progress < 0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.3 * (1 - progress / 0.3), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Border ──────────────────────────────────────────────────────

  _drawBorder(ctx, ox, oy, cs) {
    const gw = cs * COLS;
    const gh = cs * ROWS;
    const bw = Math.max(2, Math.floor(cs / 8));

    ctx.fillStyle = BORDER_DARK;
    ctx.fillRect(ox - bw, oy - bw, gw + bw * 2, bw);       // top
    ctx.fillRect(ox - bw, oy + gh, gw + bw * 2, bw);        // bottom
    ctx.fillRect(ox - bw, oy, bw, gh);                       // left
    ctx.fillRect(ox + gw, oy, bw, gh);                       // right

    ctx.fillStyle = BORDER_LIGHT;
    ctx.fillRect(ox - bw, oy - bw, gw + bw * 2, 1);         // top edge highlight
    ctx.fillRect(ox - bw, oy - bw, 1, gh + bw * 2);         // left edge highlight

    // Sudden death border glow
    if (this._suddenDeath) {
      const pulse = 0.3 + Math.sin(this._animTime * 4) * 0.2;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ff3300';
      ctx.lineWidth = bw;
      ctx.strokeRect(ox - bw / 2, oy - bw / 2, gw + bw, gh + bw);
      ctx.restore();
    }
  }

  // ── HUD ─────────────────────────────────────────────────────────

  _drawHUD(ctx, w, h, ox, oy, cs) {
    const gw = cs * COLS;

    // Timer bar above grid
    const barY = oy - Math.max(16, Math.floor(cs / 3)) - 4;
    const barH = Math.max(8, Math.floor(cs / 6));
    const barW = gw;
    const timeRatio = Math.max(0, this._timer / 90);

    // Bar background
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(ox, barY, barW, barH);

    // Bar fill
    const barColor = this._suddenDeath ? '#ff3300' : timeRatio > 0.25 ? '#44cc44' : '#ffaa00';
    ctx.fillStyle = barColor;
    ctx.fillRect(ox, barY, barW * timeRatio, barH);

    // Timer text
    const secs = Math.max(0, Math.ceil(this._timer));
    const min = Math.floor(secs / 60);
    const sec = secs % 60;
    const timeStr = `${min}:${sec.toString().padStart(2, '0')}`;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(10, barH + 2)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(timeStr, ox + barW / 2, barY - 2);

    // "SUDDEN DEATH" flash
    if (this._suddenDeath) {
      const flash = Math.sin(this._animTime * 6) > 0;
      if (flash) {
        ctx.fillStyle = '#ff3300';
        ctx.font = `bold ${Math.max(10, Math.floor(cs * 0.4))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('SUDDEN DEATH', ox + gw / 2, barY - Math.floor(cs * 0.5) - 4);
      }
    }
  }
}

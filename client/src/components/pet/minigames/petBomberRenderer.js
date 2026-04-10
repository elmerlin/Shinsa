import * as THREE from 'three';

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const COLS = 13;
const ROWS = 11;
const CELL_EMPTY = 0;
const CELL_HARD = 1;
const CELL_SOFT = 2;

const SEAT_COLORS = [0x4fc3f7, 0xf06292, 0x81c784, 0xffb74d];
const DEAD_COLOR = 0x555555;

const ITEM_COLORS = {
  extra_bomb: 0xff4444,
  blast_up: 0xff8800,
  speed_up: 0x00ddff,
  kick: 0xffdd00,
  pass: 0xaa44ff,
};

const LERP_SPEED = 12; // units/sec for interpolation

// ━━━ PetBomberRenderer ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default class PetBomberRenderer {
  constructor(containerEl, options = {}) {
    this._container = containerEl;
    this._disposed = false;
    this._localSeat = -1;
    this._clock = new THREE.Clock();
    this._animFrame = 0;

    // Grid state
    this._grid = null;

    // Object pools
    this._hardBlocks = [];
    this._softBlocks = [];
    this._players = [];
    this._bombs = new Map();
    this._explosions = new Map();
    this._items = new Map();
    this._suddenDeathBlocks = [];

    // Snapshot state for interpolation
    this._playerTargets = [{}, {}, {}, {}];
    this._playerPositions = [{}, {}, {}, {}];

    this._initThree();
    this._buildSharedGeometry();
    this._buildScene();
    this._buildPlayers();
    this._startLoop();
  }

  // ── Three.js setup ──────────────────────────────────────────────
  _initThree() {
    const w = this._container.clientWidth || 400;
    const h = this._container.clientHeight || 300;

    this._renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(w, h);
    this._renderer.setClearColor(0x0a0c14, 1);
    this._renderer.shadowMap.enabled = false;
    this._container.appendChild(this._renderer.domElement);

    this._scene = new THREE.Scene();
    this._scene.fog = new THREE.FogExp2(0x0a0c14, 0.035);

    // Camera: perspective looking down at ~55 degrees
    const aspect = w / h;
    this._camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 100);
    this._positionCamera();

    // Lighting
    const ambient = new THREE.AmbientLight(0x8899bb, 0.6);
    this._scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(6, 12, -4);
    this._scene.add(dir);

    // Subtle cyan point light for sci-fi feel
    const point = new THREE.PointLight(0x22ccff, 0.3, 30);
    point.position.set(COLS / 2, 5, ROWS / 2);
    this._scene.add(point);
  }

  _positionCamera() {
    const cx = (COLS - 1) / 2;
    const cz = (ROWS - 1) / 2;
    this._camera.position.set(cx, 14, cz + 10);
    this._camera.lookAt(cx, 0, cz);
  }

  // ── Shared geometry & materials (pooled) ────────────────────────
  _buildSharedGeometry() {
    // Ground
    this._groundGeo = new THREE.PlaneGeometry(COLS + 0.4, ROWS + 0.4);
    this._groundMat = new THREE.MeshStandardMaterial({
      color: 0x12151f,
      roughness: 0.85,
      metalness: 0.4,
    });

    // Grid lines
    this._gridLinesMat = new THREE.LineBasicMaterial({ color: 0x1a3040, transparent: true, opacity: 0.6 });

    // Hard block
    this._hardGeo = new THREE.BoxGeometry(0.92, 1.1, 0.92);
    this._hardMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a35,
      roughness: 0.4,
      metalness: 0.7,
      emissive: 0xdd8800,
      emissiveIntensity: 0.08,
    });

    // Soft block
    this._softGeo = new THREE.BoxGeometry(0.88, 0.85, 0.88);
    this._softMat = new THREE.MeshStandardMaterial({
      color: 0x6633aa,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0x8844cc,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.75,
    });

    // Bomb
    this._bombGeo = new THREE.SphereGeometry(0.32, 12, 8);
    this._bombMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0xff3300,
      emissiveIntensity: 0.2,
    });
    this._bombFuseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 4);
    this._bombFuseMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });

    // Explosion segment
    this._expGeo = new THREE.BoxGeometry(0.85, 0.5, 0.85);
    this._expMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x44eeff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 1.0,
    });

    // Item
    this._itemGeo = new THREE.SphereGeometry(0.2, 8, 6);

    // Player body (capsule-like: cylinder + spheres)
    this._playerBodyGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.4, 8);
    this._playerHeadGeo = new THREE.SphereGeometry(0.22, 8, 6);
    this._playerDirGeo = new THREE.ConeGeometry(0.08, 0.15, 4);

    // Sudden death block (same shape as hard, different material)
    this._sdMat = new THREE.MeshStandardMaterial({
      color: 0x3a1010,
      roughness: 0.4,
      metalness: 0.6,
      emissive: 0xff2200,
      emissiveIntensity: 0.15,
    });
  }

  // ── Build static scene ──────────────────────────────────────────
  _buildScene() {
    // Ground plane
    const ground = new THREE.Mesh(this._groundGeo, this._groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((COLS - 1) / 2, -0.01, (ROWS - 1) / 2);
    this._scene.add(ground);

    // Neon grid lines
    this._buildGridLines();

    // Border glow strip
    this._buildBorder();
  }

  _buildGridLines() {
    const points = [];
    // Vertical lines
    for (let c = 0; c <= COLS; c++) {
      points.push(new THREE.Vector3(c - 0.5, 0.005, -0.5));
      points.push(new THREE.Vector3(c - 0.5, 0.005, ROWS - 0.5));
    }
    // Horizontal lines
    for (let r = 0; r <= ROWS; r++) {
      points.push(new THREE.Vector3(-0.5, 0.005, r - 0.5));
      points.push(new THREE.Vector3(COLS - 0.5, 0.005, r - 0.5));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const lines = new THREE.LineSegments(geo, this._gridLinesMat);
    this._scene.add(lines);
  }

  _buildBorder() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ccff,
      transparent: true,
      opacity: 0.12,
    });
    const geo = new THREE.BoxGeometry(COLS + 0.8, 0.05, 0.15);

    // Top and bottom
    const top = new THREE.Mesh(geo, mat);
    top.position.set((COLS - 1) / 2, 0.025, -0.7);
    this._scene.add(top);

    const bottom = new THREE.Mesh(geo, mat);
    bottom.position.set((COLS - 1) / 2, 0.025, ROWS - 0.3);
    this._scene.add(bottom);

    const geoSide = new THREE.BoxGeometry(0.15, 0.05, ROWS + 0.8);
    const left = new THREE.Mesh(geoSide, mat);
    left.position.set(-0.7, 0.025, (ROWS - 1) / 2);
    this._scene.add(left);

    const right = new THREE.Mesh(geoSide, mat);
    right.position.set(COLS - 0.3, 0.025, (ROWS - 1) / 2);
    this._scene.add(right);
  }

  // ── Players ─────────────────────────────────────────────────────
  _buildPlayers() {
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const color = SEAT_COLORS[i];
      const bodyMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.3,
        emissive: color,
        emissiveIntensity: 0.1,
      });

      // Body
      const body = new THREE.Mesh(this._playerBodyGeo, bodyMat);
      body.position.y = 0.3;
      group.add(body);

      // Head
      const head = new THREE.Mesh(this._playerHeadGeo, bodyMat);
      head.position.y = 0.6;
      group.add(head);

      // Direction indicator
      const dirMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const dir = new THREE.Mesh(this._playerDirGeo, dirMat);
      dir.position.y = 0.6;
      dir.position.z = -0.28;
      dir.rotation.x = -Math.PI / 2;
      group.add(dir);

      this._scene.add(group);
      this._players.push({
        group,
        bodyMat,
        dirMesh: dir,
        alive: true,
        seat: i,
      });

      // Init positions
      this._playerTargets[i] = { x: 0, z: 0, dir: 0 };
      this._playerPositions[i] = { x: 0, z: 0 };
    }
  }

  // ── Public API ──────────────────────────────────────────────────
  getCanvas() {
    return this._renderer?.domElement ?? null;
  }

  setLocalSeat(seat) {
    this._localSeat = seat;
  }

  resize() {
    if (this._disposed) return;
    const w = this._container.clientWidth || 400;
    const h = this._container.clientHeight || 300;
    this._renderer.setSize(w, h);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  setGrid(grid) {
    this._grid = grid;
    this._rebuildGrid();
  }

  applySnapshot(snapshot) {
    if (!snapshot) return;

    // Players
    if (snapshot.p) {
      for (const pd of snapshot.p) {
        const [seat, x, y, dir, alive] = pd;
        if (seat < 0 || seat >= 4) continue;
        const p = this._players[seat];
        if (!p) continue;

        p.group.visible = true;
        this._playerTargets[seat].x = x;
        this._playerTargets[seat].z = y;
        this._playerTargets[seat].dir = dir;

        if (!p.alive && alive) {
          // Revived (shouldn't normally happen, but defensive)
          p.alive = true;
          this._setPlayerAlive(seat, true);
        } else if (p.alive && !alive) {
          p.alive = false;
          this._setPlayerAlive(seat, false);
        }
      }
    }

    // Bombs
    if (snapshot.b) {
      const activeIds = new Set();
      for (const bd of snapshot.b) {
        const [id, x, y, timer] = bd;
        activeIds.add(id);
        if (!this._bombs.has(id)) {
          this._createBomb(id, x, y, timer);
        } else {
          const bomb = this._bombs.get(id);
          bomb.timer = timer;
        }
      }
      // Remove bombs no longer in snapshot
      for (const [id, bomb] of this._bombs) {
        if (!activeIds.has(id)) {
          this._removeBomb(id);
        }
      }
    } else {
      // No bombs in snapshot, clear all
      for (const [id] of this._bombs) {
        this._removeBomb(id);
      }
    }

    // Explosions
    if (snapshot.e) {
      const activeIds = new Set();
      for (const ed of snapshot.e) {
        const [id, cx, cy, up, right, down, left, timer] = ed;
        activeIds.add(id);
        if (!this._explosions.has(id)) {
          this._createExplosion(id, cx, cy, up, right, down, left, timer);
        } else {
          const exp = this._explosions.get(id);
          exp.timer = timer;
        }
      }
      for (const [id] of this._explosions) {
        if (!activeIds.has(id)) {
          this._removeExplosion(id);
        }
      }
    } else {
      for (const [id] of this._explosions) {
        this._removeExplosion(id);
      }
    }

    // Items
    if (snapshot.i) {
      const activeIds = new Set();
      for (const id of snapshot.i) {
        const [itemId, x, y, type] = id;
        activeIds.add(itemId);
        if (!this._items.has(itemId)) {
          this._createItem(itemId, x, y, type);
        }
      }
      for (const [id] of this._items) {
        if (!activeIds.has(id)) {
          this._removeItem(id);
        }
      }
    } else {
      for (const [id] of this._items) {
        this._removeItem(id);
      }
    }
  }

  applyGridChanges(changes) {
    if (!changes || !Array.isArray(changes)) return;
    for (const ev of changes) {
      switch (ev.type) {
        case 'break':
          this._breakSoftBlock(ev.x, ev.y);
          break;
        case 'bomb':
          if (!this._bombs.has(ev.id)) {
            this._createBomb(ev.id, ev.x, ev.y, 3);
          }
          break;
        case 'explosion':
          if (!this._explosions.has(ev.id)) {
            this._createExplosion(ev.id, ev.cx, ev.cy, ev.up, ev.right, ev.down, ev.left, 0.5);
          }
          break;
        case 'item':
          if (!this._items.has(ev.id)) {
            this._createItem(ev.id, ev.x, ev.y, ev.itemType);
          }
          break;
        case 'item_destroy':
        case 'pickup':
          this._removeItem(ev.id);
          break;
        case 'kill':
          if (ev.seat >= 0 && ev.seat < 4) {
            this._players[ev.seat].alive = false;
            this._setPlayerAlive(ev.seat, false);
          }
          break;
        case 'sudden_death':
          this._addSuddenDeathBlock(ev.x, ev.y);
          break;
        case 'sudden_death_start':
          // Visual cue: flash the border or pulse - keep it simple
          break;
      }
    }
  }

  dispose() {
    this._disposed = true;
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = 0;
    }
    // Clean up all meshes
    this._scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this._renderer.dispose();
    if (this._renderer.domElement?.parentElement) {
      this._renderer.domElement.parentElement.removeChild(this._renderer.domElement);
    }
    this._bombs.clear();
    this._explosions.clear();
    this._items.clear();
  }

  // ── Grid building ───────────────────────────────────────────────
  _rebuildGrid() {
    // Remove old blocks
    for (const b of this._hardBlocks) this._scene.remove(b);
    for (const b of this._softBlocks) this._scene.remove(b.mesh);
    for (const b of this._suddenDeathBlocks) this._scene.remove(b);
    this._hardBlocks = [];
    this._softBlocks = [];
    this._suddenDeathBlocks = [];

    if (!this._grid) return;

    for (let r = 0; r < this._grid.length; r++) {
      for (let c = 0; c < this._grid[r].length; c++) {
        const cell = this._grid[r][c];
        if (cell === CELL_HARD) {
          const mesh = new THREE.Mesh(this._hardGeo, this._hardMat);
          mesh.position.set(c, 0.55, r);
          this._scene.add(mesh);
          this._hardBlocks.push(mesh);
        } else if (cell === CELL_SOFT) {
          const mesh = new THREE.Mesh(this._softGeo, this._softMat.clone());
          mesh.position.set(c, 0.425, r);
          this._scene.add(mesh);
          this._softBlocks.push({ mesh, col: c, row: r, breaking: false, breakTimer: 0 });
        }
      }
    }

    // Initialize player positions to spawn corners
    const spawns = [
      { x: 1, z: 1 },
      { x: COLS - 2, z: 1 },
      { x: 1, z: ROWS - 2 },
      { x: COLS - 2, z: ROWS - 2 },
    ];
    for (let i = 0; i < 4; i++) {
      this._playerPositions[i] = { x: spawns[i].x, z: spawns[i].z };
      this._playerTargets[i] = { x: spawns[i].x, z: spawns[i].z, dir: 0 };
    }
  }

  _breakSoftBlock(col, row) {
    const idx = this._softBlocks.findIndex((b) => b.col === col && b.row === row);
    if (idx === -1) return;
    const block = this._softBlocks[idx];
    block.breaking = true;
    block.breakTimer = 0.4; // animate for 0.4s then remove
  }

  _addSuddenDeathBlock(x, y) {
    const mesh = new THREE.Mesh(this._hardGeo, this._sdMat);
    mesh.position.set(x, 2.5, y); // start above, will drop
    mesh.scale.set(1, 1, 1);
    this._scene.add(mesh);
    this._suddenDeathBlocks.push(mesh);
    // Update grid state
    if (this._grid && this._grid[y] !== undefined) {
      this._grid[y][x] = CELL_HARD;
    }
  }

  // ── Player helpers ──────────────────────────────────────────────
  _setPlayerAlive(seat, alive) {
    const p = this._players[seat];
    if (!p) return;
    if (alive) {
      p.bodyMat.color.setHex(SEAT_COLORS[seat]);
      p.bodyMat.emissive.setHex(SEAT_COLORS[seat]);
      p.bodyMat.emissiveIntensity = 0.1;
      p.group.scale.set(1, 1, 1);
    } else {
      p.bodyMat.color.setHex(DEAD_COLOR);
      p.bodyMat.emissive.setHex(0x000000);
      p.bodyMat.emissiveIntensity = 0;
      p.group.scale.set(1, 0.3, 1); // flatten
    }
  }

  _getDirectionRotation(dir) {
    // dir: 0=up, 1=right, 2=down, 3=left
    switch (dir) {
      case 0: return 0;            // facing -Z (up on grid)
      case 1: return -Math.PI / 2; // facing +X
      case 2: return Math.PI;      // facing +Z
      case 3: return Math.PI / 2;  // facing -X
      default: return 0;
    }
  }

  // ── Bomb management ─────────────────────────────────────────────
  _createBomb(id, x, y, timer) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this._bombGeo, this._bombMat.clone());
    body.position.y = 0.32;
    group.add(body);

    const fuse = new THREE.Mesh(this._bombFuseGeo, this._bombFuseMat);
    fuse.position.y = 0.55;
    group.add(fuse);

    group.position.set(x, 0, y);
    this._scene.add(group);
    this._bombs.set(id, { group, body, timer, elapsed: 0 });
  }

  _removeBomb(id) {
    const bomb = this._bombs.get(id);
    if (!bomb) return;
    this._scene.remove(bomb.group);
    // Dispose cloned material
    bomb.body.material.dispose();
    this._bombs.delete(id);
  }

  // ── Explosion management ────────────────────────────────────────
  _createExplosion(id, cx, cy, up, right, down, left, timer) {
    const group = new THREE.Group();
    const mat = this._expMat.clone();
    const segments = [];

    // Center
    const center = new THREE.Mesh(this._expGeo, mat);
    center.position.set(0, 0.25, 0);
    group.add(center);
    segments.push(center);

    // Arms
    const addArm = (dx, dz, len) => {
      for (let i = 1; i <= len; i++) {
        const seg = new THREE.Mesh(this._expGeo, mat);
        seg.position.set(dx * i, 0.25, dz * i);
        group.add(seg);
        segments.push(seg);
      }
    };
    addArm(0, -1, up);    // up = -Z
    addArm(1, 0, right);  // right = +X
    addArm(0, 1, down);   // down = +Z
    addArm(-1, 0, left);  // left = -X

    group.position.set(cx, 0, cy);
    this._scene.add(group);
    this._explosions.set(id, { group, mat, timer, maxTimer: timer, elapsed: 0, segments });
  }

  _removeExplosion(id) {
    const exp = this._explosions.get(id);
    if (!exp) return;
    this._scene.remove(exp.group);
    exp.mat.dispose();
    this._explosions.delete(id);
  }

  // ── Item management ─────────────────────────────────────────────
  _createItem(id, x, y, type) {
    const color = ITEM_COLORS[type] || 0xffffff;
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(this._itemGeo, mat);
    mesh.position.set(x, 0.5, y);
    this._scene.add(mesh);
    this._items.set(id, { mesh, mat, type, elapsed: 0 });
  }

  _removeItem(id) {
    const item = this._items.get(id);
    if (!item) return;
    this._scene.remove(item.mesh);
    item.mat.dispose();
    this._items.delete(id);
  }

  // ── Animation loop ──────────────────────────────────────────────
  _startLoop() {
    const tick = () => {
      if (this._disposed) return;
      this._animFrame = requestAnimationFrame(tick);
      const dt = this._clock.getDelta();
      const t = this._clock.elapsedTime;
      this._updatePlayers(dt);
      this._updateBombs(dt, t);
      this._updateExplosions(dt);
      this._updateItems(dt, t);
      this._updateSoftBlocks(dt);
      this._updateSuddenDeathBlocks(dt);
      this._renderer.render(this._scene, this._camera);
    };
    tick();
  }

  _updatePlayers(dt) {
    for (let i = 0; i < 4; i++) {
      const p = this._players[i];
      if (!p.group.visible) continue;

      const target = this._playerTargets[i];
      const pos = this._playerPositions[i];

      // Lerp position
      const lerpFactor = Math.min(1, LERP_SPEED * dt);
      pos.x += (target.x - pos.x) * lerpFactor;
      pos.z += (target.z - pos.z) * lerpFactor;

      p.group.position.set(pos.x, 0, pos.z);

      // Direction
      const targetRot = this._getDirectionRotation(target.dir);
      p.group.rotation.y = targetRot;

      // Small idle bob for alive players
      if (p.alive) {
        p.group.position.y = Math.sin(this._clock.elapsedTime * 3 + i) * 0.03;
      }
    }
  }

  _updateBombs(dt, t) {
    for (const [id, bomb] of this._bombs) {
      bomb.elapsed += dt;
      // Pulse scale based on timer urgency
      const urgency = Math.max(0, 1 - bomb.timer / 3);
      const pulse = 1 + Math.sin(t * (6 + urgency * 12)) * 0.08 * (1 + urgency);
      bomb.group.scale.set(pulse, pulse, pulse);

      // Emissive intensity increases as timer decreases
      const intensity = 0.2 + urgency * 0.8;
      bomb.body.material.emissiveIntensity = intensity;
    }
  }

  _updateExplosions(dt) {
    const toRemove = [];
    for (const [id, exp] of this._explosions) {
      exp.elapsed += dt;
      // Fade out over the timer duration (estimate ~0.5s if timer is ticking down)
      const life = Math.min(exp.elapsed / 0.5, 1);
      const opacity = Math.max(0, 1 - life * 0.7);
      exp.mat.opacity = opacity;
      exp.mat.emissiveIntensity = (1 - life) * 1.5;

      // Scale up slightly at start
      const scaleUp = life < 0.2 ? 0.8 + life * 5 * 0.2 : 1.0;
      for (const seg of exp.segments) {
        seg.scale.y = scaleUp * (1 - life * 0.3);
      }

      if (opacity <= 0.02) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this._removeExplosion(id);
    }
  }

  _updateItems(dt, t) {
    for (const [id, item] of this._items) {
      item.elapsed += dt;
      // Float and spin
      item.mesh.position.y = 0.5 + Math.sin(t * 2 + id * 0.7) * 0.1;
      item.mesh.rotation.y = t * 2;
    }
  }

  _updateSoftBlocks(dt) {
    const toRemove = [];
    for (let i = this._softBlocks.length - 1; i >= 0; i--) {
      const block = this._softBlocks[i];
      if (!block.breaking) continue;

      block.breakTimer -= dt;
      // Shrink and fade
      const progress = 1 - Math.max(0, block.breakTimer / 0.4);
      block.mesh.scale.set(1 - progress * 0.5, 1 - progress, 1 - progress * 0.5);
      block.mesh.material.opacity = 0.75 * (1 - progress);

      if (block.breakTimer <= 0) {
        this._scene.remove(block.mesh);
        block.mesh.material.dispose();
        this._softBlocks.splice(i, 1);
      }
    }
  }

  _updateSuddenDeathBlocks(dt) {
    for (const mesh of this._suddenDeathBlocks) {
      // Drop from above to y=0.55
      if (mesh.position.y > 0.56) {
        mesh.position.y = Math.max(0.55, mesh.position.y - dt * 8);
      }
    }
  }
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drawTile, drawBuildingSprite, drawConstructionOverlay, drawSelectionOutline, drawGhostFootprint, drawPetWander } from './petWorldSprites';
import { getBuildingSize } from './petWorldBuildings';

const BASE_TILE_SIZE = 32;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 300;

function getBuildingMap(buildings = []) {
  return new Map(buildings.map((building) => [building.id, building]));
}

function findClearTiles(grid) {
  const result = [];
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      const tile = grid.tiles[y]?.[x];
      if (!tile) continue;
      if (tile.b == null && !['water', 'rock', 'tree', 'bush'].includes(tile.t)) {
        result.push({ x, y });
      }
    }
  }
  return result;
}

function buildPetPlacements(world) {
  const grid = world?.grid;
  if (!grid) return [];
  const clearTiles = findClearTiles(grid);
  const count = Math.min(Math.max(2, Math.floor((world.population || 0) / 2)), 8, clearTiles.length);
  const placements = [];
  for (let i = 0; i < count; i += 1) {
    const tile = clearTiles[(i * 7) % clearTiles.length];
    placements.push({ ...tile, character: ['dojocat', 'buu', 'devit', 'pixiu'][i % 4], seed: i * 13 + 7 });
  }
  return placements;
}

/** Deterministic pet position: wanders 1 tile every ~2s based on seed. */
function getPetWanderPos(pet, time) {
  const period = 2000;
  const step = Math.floor(time / period);
  const hash = (pet.seed * 2654435761 + step * 2246822519) >>> 0;
  const dx = (hash % 3) - 1; // -1, 0, 1
  const dy = ((hash >> 4) % 3) - 1;
  const frac = (time % period) / period;
  return { x: pet.x + dx, y: pet.y + dy, frameOffset: frac };
}

/** Check if all tiles in a footprint are valid for building. */
function isPlacementValid(grid, gx, gy, bw, bh, buildingType) {
  if (!grid) return false;
  for (let dy = 0; dy < bh; dy++) {
    for (let dx = 0; dx < bw; dx++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return false;
      const tile = grid.tiles[ty]?.[tx];
      if (!tile) return false;
      if (tile.b != null) return false;
      if (['water', 'rock', 'tree', 'bush'].includes(tile.t)) return false;
    }
  }
  // fishing_hut requires adjacent water
  if (buildingType === 'fishing_hut') {
    let hasWater = false;
    for (let dy = -1; dy <= bh; dy++) {
      for (let dx = -1; dx <= bw; dx++) {
        if (dx >= 0 && dx < bw && dy >= 0 && dy < bh) continue;
        const tx = gx + dx;
        const ty = gy + dy;
        if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) continue;
        const tile = grid.tiles[ty]?.[tx];
        if (tile?.t === 'water') { hasWater = true; break; }
      }
      if (hasWater) break;
    }
    if (!hasWater) return false;
  }
  return true;
}

/** Clamp camera so viewport does not show space beyond the grid. */
function clampCamera(cx, cy, zoom, gridW, gridH, viewW, viewH) {
  const ts = BASE_TILE_SIZE * zoom;
  const worldW = gridW * ts;
  const worldH = gridH * ts;
  const maxX = Math.max(0, worldW - viewW);
  const maxY = Math.max(0, worldH - viewH);
  return {
    x: Math.max(0, Math.min(cx, maxX)),
    y: Math.max(0, Math.min(cy, maxY)),
  };
}

export default function PetWorldCanvas({
  world,
  buildings = [],
  selectedBuildingId,
  selectedTile,
  pendingBuildType,
  readonly = false,
  onSelectBuilding,
  onSelectTile,
  onPlaceBuilding,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const pinchRef = useRef(null);
  const animationFrameRef = useRef(0);
  const animatingRef = useRef(false);
  const idleTimerRef = useRef(null);
  const timeRef = useRef(0);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverTile, setHoverTile] = useState(null);
  const buildingMap = useMemo(() => getBuildingMap(buildings), [buildings]);
  const petPlacements = useMemo(() => buildPetPlacements(world), [world]);

  const tileSize = BASE_TILE_SIZE * camera.zoom;

  // --- resize observer ---
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // --- center camera on load ---
  useEffect(() => {
    if (!world?.grid) return;
    const ts = BASE_TILE_SIZE * camera.zoom;
    const cx = (world.grid.w * ts) / 2 - size.width / 2;
    const cy = (world.grid.h * ts) / 2 - size.height / 2;
    const clamped = clampCamera(cx, cy, camera.zoom, world.grid.w, world.grid.h, size.width, size.height);
    setCamera((prev) => ({ ...prev, x: clamped.x, y: clamped.y }));
  }, [world?.grid?.w, world?.grid?.h, size.width, size.height]);

  // --- main render ---
  const render = useCallback((timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas || !world?.grid || !size.width || !size.height) return;
    const time = timestamp || performance.now();
    timeRef.current = time;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.round(size.width * dpr);
    const ch = Math.round(size.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const startX = Math.max(0, Math.floor(camera.x / tileSize));
    const startY = Math.max(0, Math.floor(camera.y / tileSize));
    const endX = Math.min(world.grid.w, Math.ceil((camera.x + size.width) / tileSize) + 1);
    const endY = Math.min(world.grid.h, Math.ceil((camera.y + size.height) / tileSize) + 1);

    ctx.fillStyle = '#07121a';
    ctx.fillRect(0, 0, size.width, size.height);

    // tiles
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const tile = world.grid.tiles[y]?.[x];
        if (!tile) continue;
        const screenX = x * tileSize - camera.x;
        const screenY = y * tileSize - camera.y;
        drawTile(ctx, world.biome, tile, screenX, screenY, tileSize, time);
      }
    }

    // buildings
    buildings.forEach((building) => {
      const screenX = building.grid_x * tileSize - camera.x;
      const screenY = building.grid_y * tileSize - camera.y;
      const width = building.width * tileSize;
      const height = building.height * tileSize;
      if (screenX + width < 0 || screenY + height < 0 || screenX > size.width || screenY > size.height) return;
      drawBuildingSprite(ctx, world.biome, building, screenX, screenY, tileSize, selectedBuildingId === building.id);
      if (building.state !== 'built') drawConstructionOverlay(ctx, building, screenX, screenY, tileSize, time);
      if (selectedBuildingId === building.id) drawSelectionOutline(ctx, screenX, screenY, width, height);
    });

    // pet wandering
    petPlacements.forEach((pet) => {
      const wander = getPetWanderPos(pet, time);
      const screenX = wander.x * tileSize - camera.x + tileSize / 2;
      const screenY = wander.y * tileSize - camera.y + tileSize * 0.80;
      if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
      drawPetWander(ctx, screenX, screenY, tileSize, pet.character, wander.frameOffset);
    });

    // selection outline on selected tile
    if (selectedTile && selectedTile.x >= 0 && selectedTile.y >= 0) {
      const color = pendingBuildType ? 'rgba(110,231,183,0.9)' : 'rgba(80,220,255,0.95)';
      drawSelectionOutline(ctx, selectedTile.x * tileSize - camera.x, selectedTile.y * tileSize - camera.y, tileSize, tileSize, color);
    }

    // ghost footprint for pending build
    const ghostTile = hoverTile || selectedTile;
    if (pendingBuildType && ghostTile) {
      const bSize = getBuildingSize(pendingBuildType);
      const gx = ghostTile.x;
      const gy = ghostTile.y;
      const valid = isPlacementValid(world.grid, gx, gy, bSize.width, bSize.height, pendingBuildType);
      drawGhostFootprint(ctx, gx * tileSize - camera.x, gy * tileSize - camera.y, tileSize, bSize.width, bSize.height, valid);
    }

    const vignette = ctx.createRadialGradient(
      size.width * 0.5,
      size.height * 0.48,
      Math.min(size.width, size.height) * 0.14,
      size.width * 0.5,
      size.height * 0.5,
      Math.max(size.width, size.height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(3,7,12,0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size.width, size.height);

    // continue animation loop if animating
    if (animatingRef.current) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
  }, [world, buildings, size.width, size.height, camera.x, camera.y, camera.zoom, tileSize, selectedBuildingId, selectedTile, pendingBuildType, petPlacements, hoverTile]);

  // --- animation control ---
  const startAnimating = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    clearTimeout(idleTimerRef.current);
    animationFrameRef.current = requestAnimationFrame(render);
  }, [render]);

  const scheduleIdle = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      animatingRef.current = false;
    }, 3000); // stop loop 3s after last interaction
  }, []);

  // start animation on mount, schedule idle
  useEffect(() => {
    startAnimating();
    scheduleIdle();
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      clearTimeout(idleTimerRef.current);
      animatingRef.current = false;
    };
  }, [startAnimating, scheduleIdle]);

  // re-render when deps change (single frame if idle)
  useEffect(() => {
    if (!animatingRef.current) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
  }, [render]);

  // --- coordinate helpers ---
  const toTilePosition = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !world?.grid) return null;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const tileX = Math.floor((localX + camera.x) / tileSize);
    const tileY = Math.floor((localY + camera.y) / tileSize);
    if (tileX < 0 || tileY < 0 || tileX >= world.grid.w || tileY >= world.grid.h) return null;
    return { x: tileX, y: tileY, tile: world.grid.tiles[tileY]?.[tileX] || null };
  }, [world, camera.x, camera.y, tileSize]);

  // --- pointer handlers ---
  const handlePointerDown = (event) => {
    // ignore if pinch is active
    if (pinchRef.current) return;
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      startTime: performance.now(),
      dragging: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startAnimating();
  };

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      pointer.dragging = true;
      setCamera((prev) => {
        const grid = world?.grid;
        if (!grid) return { ...prev, x: Math.max(0, pointer.cameraX - dx), y: Math.max(0, pointer.cameraY - dy) };
        const clamped = clampCamera(pointer.cameraX - dx, pointer.cameraY - dy, prev.zoom, grid.w, grid.h, size.width, size.height);
        return { ...prev, ...clamped };
      });
    }
    // update hover tile for ghost preview
    if (pendingBuildType) {
      const hit = toTilePosition(event.clientX, event.clientY);
      setHoverTile(hit ? { x: hit.x, y: hit.y } : null);
    }
  };

  const handlePointerUp = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const elapsed = performance.now() - pointer.startTime;
    if (!pointer.dragging) {
      const hit = toTilePosition(event.clientX, event.clientY);
      if (hit) {
        if (elapsed >= LONG_PRESS_MS) {
          // long-press: show tile info
          onSelectTile?.({ x: hit.x, y: hit.y, tile: hit.tile });
        } else if (hit.tile?.b != null) {
          onSelectBuilding?.(buildingMap.get(hit.tile.b) || null);
        } else if (pendingBuildType && !readonly) {
          onPlaceBuilding?.(hit.x, hit.y);
        } else {
          onSelectTile?.({ x: hit.x, y: hit.y, tile: hit.tile });
        }
      }
    }
    pointerRef.current = null;
    scheduleIdle();
  };

  // --- touch pinch-zoom ---
  const handleTouchStart = (event) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const t0 = event.touches[0];
      const t1 = event.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      pinchRef.current = { startDist: dist, startZoom: camera.zoom, midX, midY };
      // cancel any single-pointer drag
      pointerRef.current = null;
      startAnimating();
    }
  };

  const handleTouchMove = (event) => {
    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault();
      const t0 = event.touches[0];
      const t1 = event.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const ratio = dist / pinchRef.current.startDist;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchRef.current.startZoom * ratio));
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect && world?.grid) {
        const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
        const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
        // keep world point under pinch midpoint stable
        const worldX = (camera.x + midX) / (BASE_TILE_SIZE * camera.zoom);
        const worldY = (camera.y + midY) / (BASE_TILE_SIZE * camera.zoom);
        const newCx = worldX * BASE_TILE_SIZE * newZoom - midX;
        const newCy = worldY * BASE_TILE_SIZE * newZoom - midY;
        const clamped = clampCamera(newCx, newCy, newZoom, world.grid.w, world.grid.h, size.width, size.height);
        setCamera({ x: clamped.x, y: clamped.y, zoom: newZoom });
      } else {
        setCamera((prev) => ({ ...prev, zoom: newZoom }));
      }
    }
  };

  const handleTouchEnd = (event) => {
    if (event.touches.length < 2) {
      pinchRef.current = null;
      scheduleIdle();
    }
  };

  // --- mouse move for ghost preview ---
  const handleMouseMove = (event) => {
    if (pendingBuildType && !pointerRef.current?.dragging) {
      const hit = toTilePosition(event.clientX, event.clientY);
      setHoverTile(hit ? { x: hit.x, y: hit.y } : null);
    }
  };

  // --- zoom buttons ---
  const adjustZoom = useCallback((delta) => {
    setCamera((prev) => {
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom + delta));
      const grid = world?.grid;
      if (!grid) return { ...prev, zoom: newZoom };
      // keep center stable
      const centerX = prev.x + size.width / 2;
      const centerY = prev.y + size.height / 2;
      const worldX = centerX / (BASE_TILE_SIZE * prev.zoom);
      const worldY = centerY / (BASE_TILE_SIZE * prev.zoom);
      const newCx = worldX * BASE_TILE_SIZE * newZoom - size.width / 2;
      const newCy = worldY * BASE_TILE_SIZE * newZoom - size.height / 2;
      const clamped = clampCamera(newCx, newCy, newZoom, grid.w, grid.h, size.width, size.height);
      return { x: clamped.x, y: clamped.y, zoom: newZoom };
    });
    startAnimating();
    scheduleIdle();
  }, [world?.grid, size.width, size.height, startAnimating, scheduleIdle]);

  if (!world?.grid) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#07121a]">
      <div
        ref={containerRef}
        className="relative h-full min-h-0 w-full select-none touch-none"
        style={{ WebkitTouchCallout: 'none', overscrollBehavior: 'none' }}
        onContextMenu={(event) => event.preventDefault()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseMove={handleMouseMove}
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55 backdrop-blur-sm">
          {readonly ? 'Visit snapshot' : pendingBuildType ? 'Tap a tile to place' : 'Drag to pan'}
        </div>
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button
            type="button"
            onClick={() => adjustZoom(-0.15)}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm font-bold text-white/75 backdrop-blur-sm hover:bg-black/55"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => adjustZoom(0.15)}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm font-bold text-white/75 backdrop-blur-sm hover:bg-black/55"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

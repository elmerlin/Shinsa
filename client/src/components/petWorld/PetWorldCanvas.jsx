import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drawTile, drawBuildingSprite, drawConstructionOverlay, drawSelectionOutline, drawGhostFootprint, drawPetWander } from './petWorldSprites';
import { getBuildingSize } from './petWorldBuildings';
import { getBiomeUi } from './petWorldTiles';

const BASE_TILE_SIZE = 32;
const FIXED_ZOOM = 1.4;
const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 300;
const MINIMAP_W = 120;
const MINIMAP_H = 80;
const MINIMAP_PADDING = 8;
const LERP_SPEED = 0.15;

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
  const animationFrameRef = useRef(0);
  const animatingRef = useRef(false);
  const timeRef = useRef(0);
  const cameraTargetRef = useRef(null); // for smooth camera easing
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverTile, setHoverTile] = useState(null);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const buildingMap = useMemo(() => getBuildingMap(buildings), [buildings]);
  const petPlacements = useMemo(() => buildPetPlacements(world), [world]);

  const tileSize = BASE_TILE_SIZE * FIXED_ZOOM;

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

  // --- center camera on load with smooth easing target ---
  useEffect(() => {
    if (!world?.grid) return;
    const ts = BASE_TILE_SIZE * FIXED_ZOOM;
    const cx = (world.grid.w * ts) / 2 - size.width / 2;
    const cy = (world.grid.h * ts) / 2 - size.height / 2;
    const clamped = clampCamera(cx, cy, FIXED_ZOOM, world.grid.w, world.grid.h, size.width, size.height);
    cameraTargetRef.current = { x: clamped.x, y: clamped.y };
    setCamera({ x: clamped.x, y: clamped.y });
  }, [world?.grid?.w, world?.grid?.h, size.width, size.height]);

  // --- minimap rendering helper ---
  const drawMinimap = useCallback((ctx, viewW, viewH) => {
    if (!minimapVisible || !world?.grid) return;
    const grid = world.grid;
    const biomeUi = getBiomeUi(world.biome);

    // minimap position: bottom-left
    const mx = MINIMAP_PADDING;
    const my = viewH - MINIMAP_H - MINIMAP_PADDING;

    // Premium minimap frame
    ctx.save();
    // Outer shadow
    ctx.beginPath();
    ctx.roundRect(mx - 3, my - 3, MINIMAP_W + 6, MINIMAP_H + 6, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    // Inner frame
    ctx.beginPath();
    ctx.roundRect(mx - 1.5, my - 1.5, MINIMAP_W + 3, MINIMAP_H + 3, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Subtle inner glow at top
    const glowGrad = ctx.createLinearGradient(mx, my, mx, my + MINIMAP_H * 0.3);
    glowGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.roundRect(mx, my, MINIMAP_W, MINIMAP_H * 0.3, [4, 4, 0, 0]);
    ctx.fillStyle = glowGrad;
    ctx.fill();
    ctx.restore();

    // clip to minimap area
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mx, my, MINIMAP_W, MINIMAP_H, 4);
    ctx.clip();

    // draw tile dots
    const dotW = MINIMAP_W / grid.w;
    const dotH = MINIMAP_H / grid.h;
    for (let ty = 0; ty < grid.h; ty++) {
      for (let tx = 0; tx < grid.w; tx++) {
        const tile = grid.tiles[ty]?.[tx];
        if (!tile) continue;
        const dx = mx + tx * dotW;
        const dy = my + ty * dotH;
        let color;
        if (tile.b != null) {
          // building: brighter dot with subtle glow
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(dx - 0.5, dy - 0.5, Math.max(2, dotW + 1), Math.max(2, dotH + 1));
          color = '#ffffff';
        } else if (tile.t === 'water') {
          color = biomeUi.water;
        } else if (tile.t === 'tree' || tile.t === 'bush') {
          color = biomeUi.tree;
        } else if (tile.t === 'rock') {
          color = biomeUi.rock;
        } else {
          color = biomeUi.ground[1] || biomeUi.ground[0];
        }
        ctx.fillStyle = color;
        ctx.fillRect(dx, dy, Math.max(1, dotW), Math.max(1, dotH));
      }
    }

    // viewport rectangle
    const ts = BASE_TILE_SIZE * FIXED_ZOOM;
    const vpX = mx + (camera.x / (grid.w * ts)) * MINIMAP_W;
    const vpY = my + (camera.y / (grid.h * ts)) * MINIMAP_H;
    const vpW = (viewW / (grid.w * ts)) * MINIMAP_W;
    const vpH = (viewH / (grid.h * ts)) * MINIMAP_H;
    // Viewport rectangle with glow
    ctx.save();
    ctx.strokeStyle = 'rgba(80,220,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(80,220,255,0.3)';
    ctx.shadowBlur = 4;
    const clampedVpW = Math.min(vpW, MINIMAP_W - (vpX - mx));
    const clampedVpH = Math.min(vpH, MINIMAP_H - (vpY - my));
    ctx.strokeRect(vpX, vpY, clampedVpW, clampedVpH);
    // Corner brackets for extra visibility
    const bracketLen = Math.min(4, clampedVpW * 0.2, clampedVpH * 0.2);
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(80,220,255,0.9)';
    // Top-left
    ctx.beginPath();
    ctx.moveTo(vpX, vpY + bracketLen); ctx.lineTo(vpX, vpY); ctx.lineTo(vpX + bracketLen, vpY);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(vpX + clampedVpW - bracketLen, vpY); ctx.lineTo(vpX + clampedVpW, vpY); ctx.lineTo(vpX + clampedVpW, vpY + bracketLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(vpX, vpY + clampedVpH - bracketLen); ctx.lineTo(vpX, vpY + clampedVpH); ctx.lineTo(vpX + bracketLen, vpY + clampedVpH);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(vpX + clampedVpW - bracketLen, vpY + clampedVpH); ctx.lineTo(vpX + clampedVpW, vpY + clampedVpH); ctx.lineTo(vpX + clampedVpW, vpY + clampedVpH - bracketLen);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }, [world, camera.x, camera.y, minimapVisible]);

  // --- main render ---
  const render = useCallback((timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas || !world?.grid || !size.width || !size.height) return;
    const time = timestamp || performance.now();
    timeRef.current = time;

    // Camera easing: lerp toward target
    const target = cameraTargetRef.current;
    if (target) {
      const dx = target.x - camera.x;
      const dy = target.y - camera.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        setCamera((prev) => ({
          x: prev.x + (target.x - prev.x) * LERP_SPEED,
          y: prev.y + (target.y - prev.y) * LERP_SPEED,
        }));
      } else {
        // close enough, snap
        cameraTargetRef.current = null;
        setCamera({ x: target.x, y: target.y });
      }
    }

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

    // atmospheric depth: distant tiles (top of grid) slightly hazier
    if (endY > startY) {
      const hazeH = Math.min(size.height * 0.3, (endY - startY) * tileSize * 0.2);
      const topScreenY = startY * tileSize - camera.y;
      if (topScreenY < size.height * 0.4) {
        ctx.save();
        const hazeGrad = ctx.createLinearGradient(0, Math.max(0, topScreenY), 0, Math.max(0, topScreenY) + hazeH);
        hazeGrad.addColorStop(0, 'rgba(7,18,26,0.15)');
        hazeGrad.addColorStop(1, 'rgba(7,18,26,0)');
        ctx.fillStyle = hazeGrad;
        ctx.fillRect(0, Math.max(0, topScreenY), size.width, hazeH);
        ctx.restore();
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
      if (selectedBuildingId === building.id) drawSelectionOutline(ctx, screenX, screenY, width, height, 'rgba(80,220,255,0.95)', time);
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
      drawSelectionOutline(ctx, selectedTile.x * tileSize - camera.x, selectedTile.y * tileSize - camera.y, tileSize, tileSize, color, time);
    }

    // ghost footprint for pending build
    const ghostTile = hoverTile || selectedTile;
    if (pendingBuildType && ghostTile) {
      const bSize = getBuildingSize(pendingBuildType);
      const gx = ghostTile.x;
      const gy = ghostTile.y;
      const valid = isPlacementValid(world.grid, gx, gy, bSize.width, bSize.height, pendingBuildType);
      drawGhostFootprint(ctx, gx * tileSize - camera.x, gy * tileSize - camera.y, tileSize, bSize.width, bSize.height, valid, time);
    }

    // subtle vignette
    const vignette = ctx.createRadialGradient(
      size.width * 0.5,
      size.height * 0.48,
      Math.min(size.width, size.height) * 0.25,
      size.width * 0.5,
      size.height * 0.5,
      Math.max(size.width, size.height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(3,7,12,0.25)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size.width, size.height);

    // minimap overlay
    drawMinimap(ctx, size.width, size.height);

    // continue animation loop (always running for water/trees/pets)
    if (animatingRef.current) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
  }, [world, buildings, size.width, size.height, camera.x, camera.y, tileSize, selectedBuildingId, selectedTile, pendingBuildType, petPlacements, hoverTile, drawMinimap]);

  // --- animation control: always running ---
  const startAnimating = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    animationFrameRef.current = requestAnimationFrame(render);
  }, [render]);

  // start animation on mount -- NO idle timeout, runs continuously
  useEffect(() => {
    startAnimating();
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      animatingRef.current = false;
    };
  }, [startAnimating]);

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

  // --- minimap tap handler ---
  const handleMinimapTap = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !world?.grid) return false;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const mx = MINIMAP_PADDING;
    const my = size.height - MINIMAP_H - MINIMAP_PADDING;
    // check if tap is inside minimap bounds
    if (localX >= mx && localX <= mx + MINIMAP_W && localY >= my && localY <= my + MINIMAP_H) {
      // convert minimap position to camera position
      const fracX = (localX - mx) / MINIMAP_W;
      const fracY = (localY - my) / MINIMAP_H;
      const ts = BASE_TILE_SIZE * FIXED_ZOOM;
      const targetX = fracX * world.grid.w * ts - size.width / 2;
      const targetY = fracY * world.grid.h * ts - size.height / 2;
      const clamped = clampCamera(targetX, targetY, FIXED_ZOOM, world.grid.w, world.grid.h, size.width, size.height);
      // set easing target instead of jumping
      cameraTargetRef.current = { x: clamped.x, y: clamped.y };
      return true;
    }
    return false;
  }, [world, size.width, size.height]);

  // --- pointer handlers ---
  const handlePointerDown = (event) => {
    // check minimap tap first
    if (minimapVisible && handleMinimapTap(event.clientX, event.clientY)) {
      return;
    }
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
  };

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      pointer.dragging = true;
      // direct touch-drag: no easing, moves immediately
      cameraTargetRef.current = null;
      setCamera(() => {
        const grid = world?.grid;
        if (!grid) return { x: Math.max(0, pointer.cameraX - dx), y: Math.max(0, pointer.cameraY - dy) };
        const clamped = clampCamera(pointer.cameraX - dx, pointer.cameraY - dy, FIXED_ZOOM, grid.w, grid.h, size.width, size.height);
        return clamped;
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
  };

  // --- mouse move for ghost preview ---
  const handleMouseMove = (event) => {
    if (pendingBuildType && !pointerRef.current?.dragging) {
      const hit = toTilePosition(event.clientX, event.clientY);
      setHoverTile(hit ? { x: hit.x, y: hit.y } : null);
    }
  };

  if (!world?.grid) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#07121a]">
      <div
        ref={containerRef}
        className="relative h-full min-h-0 w-full select-none touch-none"
        style={{ WebkitTouchCallout: 'none', overscrollBehavior: 'none' }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ willChange: 'transform' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseMove={handleMouseMove}
        />
        {readonly && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/6 bg-black/25 px-2 py-1 text-[8px] uppercase tracking-[0.2em] text-white/30 backdrop-blur-sm">
            Visiting
          </div>
        )}
        {/* Minimap toggle button */}
        <button
          type="button"
          onClick={() => setMinimapVisible((v) => !v)}
          className="absolute bottom-2 right-2 rounded-full border border-white/8 bg-black/30 p-1.5 text-[10px] text-white/50 backdrop-blur-sm hover:bg-black/45 hover:text-white/70 transition-colors"
          aria-label={minimapVisible ? 'Hide minimap' : 'Show minimap'}
        >
          {minimapVisible ? '\u25A3' : '\u25A2'}
        </button>
      </div>
    </div>
  );
}

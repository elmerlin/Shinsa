import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drawTile, drawBuildingSprite, drawConstructionOverlay, drawSelectionOutline, drawPetWorldPet } from './petWorldSprites';

const BASE_TILE_SIZE = 32;

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
    placements.push({ ...tile, character: ['dojocat', 'buu', 'devit', 'pixiu'][i % 4] });
  }
  return placements;
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
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const buildingMap = useMemo(() => getBuildingMap(buildings), [buildings]);
  const petPlacements = useMemo(() => buildPetPlacements(world), [world]);

  const tileSize = BASE_TILE_SIZE * camera.zoom;

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!world?.grid) return;
    const starterCenterX = (world.grid.w * BASE_TILE_SIZE) / 2 - (size.width / 2);
    const starterCenterY = (world.grid.h * BASE_TILE_SIZE) / 2 - (size.height / 2);
    setCamera((prev) => ({ ...prev, x: Math.max(0, starterCenterX), y: Math.max(0, starterCenterY), zoom: prev.zoom }));
  }, [world?.grid?.w, world?.grid?.h, size.width, size.height]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world?.grid || !size.width || !size.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(size.width * dpr) || canvas.height !== Math.round(size.height * dpr)) {
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
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

    ctx.fillStyle = '#081019';
    ctx.fillRect(0, 0, size.width, size.height);

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const tile = world.grid.tiles[y]?.[x];
        if (!tile) continue;
        const screenX = x * tileSize - camera.x;
        const screenY = y * tileSize - camera.y;
        drawTile(ctx, world.biome, tile, screenX, screenY, tileSize);
      }
    }

    buildings.forEach((building) => {
      const screenX = building.grid_x * tileSize - camera.x;
      const screenY = building.grid_y * tileSize - camera.y;
      const width = building.width * tileSize;
      const height = building.height * tileSize;
      if (screenX + width < 0 || screenY + height < 0 || screenX > size.width || screenY > size.height) return;
      drawBuildingSprite(ctx, world.biome, building, screenX, screenY, tileSize, selectedBuildingId === building.id);
      if (building.state !== 'built') drawConstructionOverlay(ctx, building, screenX, screenY, tileSize);
      if (selectedBuildingId === building.id) drawSelectionOutline(ctx, screenX, screenY, width, height);
    });

    petPlacements.forEach((pet) => {
      const screenX = pet.x * tileSize - camera.x + tileSize / 2;
      const screenY = pet.y * tileSize - camera.y + tileSize * 0.88;
      if (screenX < -tileSize || screenY < -tileSize || screenX > size.width + tileSize || screenY > size.height + tileSize) return;
      drawPetWorldPet(ctx, screenX, screenY, Math.max(1, Math.round(tileSize / 18)), pet.character);
    });

    if (selectedTile && selectedTile.x >= 0 && selectedTile.y >= 0) {
      drawSelectionOutline(ctx, selectedTile.x * tileSize - camera.x, selectedTile.y * tileSize - camera.y, tileSize, tileSize, pendingBuildType ? 'rgba(110,231,183,0.9)' : 'rgba(80,220,255,0.95)');
    }

    if (pendingBuildType && selectedTile) {
      const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId);
      void selectedBuilding;
      ctx.save();
      ctx.fillStyle = 'rgba(110,231,183,0.18)';
      ctx.fillRect(selectedTile.x * tileSize - camera.x, selectedTile.y * tileSize - camera.y, tileSize, tileSize);
      ctx.restore();
    }
  }, [world, buildings, size.width, size.height, camera.x, camera.y, camera.zoom, tileSize, selectedBuildingId, selectedTile, pendingBuildType, petPlacements]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [render]);

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

  const handlePointerDown = (event) => {
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      dragging: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      pointer.dragging = true;
      setCamera((prev) => ({
        ...prev,
        x: Math.max(0, pointer.cameraX - dx),
        y: Math.max(0, pointer.cameraY - dy),
      }));
    }
  };

  const handlePointerUp = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.dragging) {
      const hit = toTilePosition(event.clientX, event.clientY);
      if (hit) {
        if (hit.tile?.b != null) {
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

  if (!world?.grid) return null;

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/[0.07] bg-[#081019] shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
      <div
        ref={containerRef}
        className="relative h-[60vh] min-h-[420px] w-full select-none touch-none"
        style={{ WebkitTouchCallout: 'none', overscrollBehavior: 'none' }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/60">
          {readonly ? 'Visit Snapshot' : pendingBuildType ? 'Tap a tile to place' : 'Drag to pan'}
        </div>
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button
            type="button"
            onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.max(0.75, prev.zoom - 0.1) }))}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm font-bold text-white/75 hover:bg-black/55"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.min(1.6, prev.zoom + 0.1) }))}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm font-bold text-white/75 hover:bg-black/55"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

import { drawPet } from '../pet/minigames/miniPumpSprites';
import { getBuildingUi } from './petWorldBuildings';
import { getBiomeUi, getTilePalette } from './petWorldTiles';

function drawPixelRect(ctx, x, y, w, h, fill, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.restore();
}

function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function drawTile(ctx, biome, tile, x, y, tileSize) {
  const palette = getTilePalette(biome, tile.t);
  drawPixelRect(ctx, x, y, tileSize, tileSize, palette.fill);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.strokeRect(Math.round(x), Math.round(y), Math.round(tileSize), Math.round(tileSize));

  if (tile.t === 'water') {
    drawPixelRect(ctx, x + tileSize * 0.12, y + tileSize * 0.18, tileSize * 0.76, tileSize * 0.18, palette.detail, 0.55);
    drawPixelRect(ctx, x + tileSize * 0.2, y + tileSize * 0.52, tileSize * 0.48, tileSize * 0.1, palette.detail, 0.45);
    return;
  }
  if (tile.t === 'tree') {
    drawPixelRect(ctx, x + tileSize * 0.42, y + tileSize * 0.56, tileSize * 0.14, tileSize * 0.24, '#5e3a20');
    drawRoundedRect(ctx, x + tileSize * 0.18, y + tileSize * 0.12, tileSize * 0.64, tileSize * 0.52, 6, palette.fill, 'rgba(0,0,0,0.18)');
    drawPixelRect(ctx, x + tileSize * 0.3, y + tileSize * 0.26, tileSize * 0.16, tileSize * 0.08, 'rgba(255,255,255,0.12)');
    return;
  }
  if (tile.t === 'rock') {
    drawRoundedRect(ctx, x + tileSize * 0.18, y + tileSize * 0.24, tileSize * 0.6, tileSize * 0.44, 5, palette.fill, 'rgba(0,0,0,0.18)');
    drawPixelRect(ctx, x + tileSize * 0.26, y + tileSize * 0.34, tileSize * 0.14, tileSize * 0.08, palette.detail, 0.45);
    return;
  }
  if (tile.t === 'bush') {
    drawRoundedRect(ctx, x + tileSize * 0.18, y + tileSize * 0.28, tileSize * 0.62, tileSize * 0.36, 6, palette.fill, 'rgba(0,0,0,0.18)');
    drawPixelRect(ctx, x + tileSize * 0.3, y + tileSize * 0.38, tileSize * 0.18, tileSize * 0.08, 'rgba(255,255,255,0.1)');
    return;
  }
  drawPixelRect(ctx, x + tileSize * 0.14, y + tileSize * 0.14, tileSize * 0.18, tileSize * 0.08, palette.detail, 0.2);
}

export function drawBuildingSprite(ctx, biome, building, x, y, tileSize, isSelected = false) {
  const { icon } = getBuildingUi(building.type || building.building_type);
  const width = tileSize * building.width;
  const height = tileSize * building.height;
  const biomeUi = getBiomeUi(biome);
  const baseFill = isSelected ? 'rgba(255,255,255,0.16)' : 'rgba(10,15,22,0.64)';
  const accent = biomeUi.ground[2];

  drawRoundedRect(ctx, x + 2, y + height * 0.14, width - 4, height * 0.72, 8, baseFill, 'rgba(255,255,255,0.12)');
  drawPixelRect(ctx, x + width * 0.1, y + height * 0.18, width * 0.8, height * 0.12, accent, 0.9);
  drawPixelRect(ctx, x + width * 0.16, y + height * 0.4, width * 0.18, height * 0.26, 'rgba(255,255,255,0.08)');
  drawPixelRect(ctx, x + width * 0.6, y + height * 0.4, width * 0.18, height * 0.26, 'rgba(255,255,255,0.08)');
  ctx.font = `${Math.max(10, tileSize * 0.55)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, x + width / 2, y + height / 2);
}

export function drawConstructionOverlay(ctx, building, x, y, tileSize) {
  const width = tileSize * building.width;
  const height = tileSize * building.height;
  drawRoundedRect(ctx, x + 2, y + 2, width - 4, height - 4, 8, 'rgba(12,16,24,0.58)', 'rgba(255,255,255,0.16)');
  drawPixelRect(ctx, x + width * 0.1, y + height * 0.76, width * 0.8, tileSize * 0.12, 'rgba(255,255,255,0.08)');
}

export function drawSelectionOutline(ctx, x, y, width, height, color = 'rgba(80,220,255,0.95)') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(x) + 1, Math.round(y) + 1, Math.round(width) - 2, Math.round(height) - 2);
  ctx.restore();
}

export function drawPetWorldPet(ctx, x, y, scale, character = 'dojocat', expression = 'normal') {
  drawPet(ctx, x, y, scale, character, 'idle', expression);
}

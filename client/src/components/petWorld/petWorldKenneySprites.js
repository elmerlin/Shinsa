const IMAGE_CACHE = new Map();

const RESIDENT_FRAMES = {
  teal: ['tile_0023.png', 'tile_0050.png'],
  berry: ['tile_0024.png', 'tile_0051.png'],
  ochre: ['tile_0025.png', 'tile_0052.png'],
  slate: ['tile_0026.png', 'tile_0053.png'],
  moss: ['tile_0077.png', 'tile_0079.png'],
  plum: ['tile_0078.png', 'tile_0080.png'],
};

const TREE_VARIANTS = {
  grasslands: ['tile_0016.png', 'tile_0018.png', 'tile_0019.png'],
  forest: ['tile_0016.png', 'tile_0017.png', 'tile_0019.png'],
  coastal: ['tile_0015.png', 'tile_0016.png', 'tile_0019.png'],
  mountain: ['tile_0003.png', 'tile_0004.png', 'tile_0018.png'],
  desert: ['tile_0015.png', 'tile_0003.png', 'tile_0017.png'],
  tropical: ['tile_0016.png', 'tile_0017.png', 'tile_0019.png'],
  tundra: ['tile_0003.png', 'tile_0004.png', 'tile_0018.png'],
  volcanic: ['tile_0015.png', 'tile_0003.png', 'tile_0017.png'],
};

const BUSH_VARIANTS = {
  grasslands: ['tile_0017.png', 'tile_0019.png'],
  forest: ['tile_0017.png', 'tile_0019.png'],
  coastal: ['tile_0019.png', 'tile_0017.png'],
  mountain: ['tile_0018.png', 'tile_0019.png'],
  desert: ['tile_0017.png', 'tile_0015.png'],
  tropical: ['tile_0019.png', 'tile_0017.png'],
  tundra: ['tile_0018.png', 'tile_0019.png'],
  volcanic: ['tile_0017.png', 'tile_0015.png'],
};

const FISH_VARIANTS = {
  fish_koi: ['fish_orange.png', 'fish_red.png'],
  fish_perch: ['fish_blue.png', 'fish_green.png', 'fish_grey.png'],
};

const TINY_TOWN = 'tiny-town';

function getImage(src) {
  if (typeof Image === 'undefined') return null;
  if (IMAGE_CACHE.has(src)) return IMAGE_CACHE.get(src);
  const image = new Image();
  const entry = { image, loaded: false };
  image.onload = () => { entry.loaded = true; };
  image.src = src;
  IMAGE_CACHE.set(src, entry);
  return entry;
}

function drawLoadedSprite(ctx, src, x, y, width, height, facing = 1, alpha = 1) {
  const entry = getImage(src);
  if (!entry?.loaded) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  if (facing === -1) {
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(entry.image, 0, 0, width, height);
  } else {
    ctx.drawImage(entry.image, x, y, width, height);
  }
  ctx.restore();
  return true;
}

function pickVariant(list, seed) {
  if (!list?.length) return null;
  return list[Math.abs(seed) % list.length];
}

function kenneyPath(group, file) {
  return `/pet-world/kenney/${group}/${file}`;
}

function drawTinyTownTile(ctx, file, x, y, size, alpha = 1) {
  return drawLoadedSprite(ctx, kenneyPath(TINY_TOWN, file), x, y, size, size, 1, alpha);
}

function drawShadowEllipse(ctx, x, y, width, height, alpha = 0.22) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#241916';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlacedTile(ctx, file, x, y, cell, options = {}) {
  const scale = options.scale || 1;
  const width = cell * scale;
  const height = cell * scale;
  const dx = x + (options.dx || 0);
  const dy = y + (options.dy || 0);
  return drawTinyTownTile(ctx, file, dx, dy, width, options.alpha ?? 1);
}

function drawBuildingFooting(ctx, x, y, width, height, accent = '#f5d7a4') {
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.72;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  ctx.fillStyle = 'rgba(90,60,32,0.18)';
  ctx.fillRect(Math.round(x), Math.round(y + height * 0.55), Math.round(width), Math.round(height * 0.45));
  ctx.restore();
}

function drawGabledHouse(ctx, x, y, width, height, options = {}) {
  const cols = options.cols || 2;
  const cell = Math.min(width / (cols + 0.2), height / 2.2);
  const spriteWidth = cols * cell;
  const spriteHeight = cell * 2.05;
  const sx = x + (width - spriteWidth) / 2;
  const sy = y + height - spriteHeight - height * 0.03;
  const roof = options.roof || (cols === 3 ? ['tile_0052.png', 'tile_0053.png', 'tile_0054.png'] : ['tile_0052.png', 'tile_0054.png']);
  const walls = options.walls || (cols === 3 ? ['tile_0084.png', 'tile_0085.png', 'tile_0086.png'] : ['tile_0084.png', 'tile_0085.png']);
  const peak = options.peak || 'tile_0051.png';
  let ready = true;

  drawShadowEllipse(ctx, sx + cell * 0.1, sy + spriteHeight * 0.78, spriteWidth * 0.82, cell * 0.38, options.shadowAlpha || 0.24);
  if (options.footing) {
    drawBuildingFooting(ctx, sx + cell * 0.12, sy + cell * 1.48, spriteWidth * 0.76, cell * 0.42, options.footing);
  }

  roof.forEach((tile, index) => {
    ready = drawPlacedTile(ctx, tile, sx + index * cell, sy, cell, { alpha: options.alpha }) && ready;
  });

  const peakScale = cols === 3 ? 1.02 : 0.92;
  ready = drawPlacedTile(
    ctx,
    peak,
    sx + (spriteWidth - cell * peakScale) / 2,
    sy + cell * 0.32,
    cell,
    { scale: peakScale, alpha: options.alpha },
  ) && ready;

  walls.forEach((tile, index) => {
    ready = drawPlacedTile(ctx, tile, sx + index * cell, sy + cell * 0.9, cell, { alpha: options.alpha }) && ready;
  });

  if (options.sign) {
    ready = drawPlacedTile(ctx, options.sign, sx + spriteWidth - cell * 0.06, sy + cell * 1.18, cell, { scale: 0.7 }) && ready;
  }
  if (options.barrel) {
    ready = drawPlacedTile(ctx, 'tile_0107.png', sx + spriteWidth * 0.72, sy + cell * 1.42, cell, { scale: 0.52 }) && ready;
  }
  if (options.hay) {
    ready = drawPlacedTile(ctx, 'tile_0093.png', sx + spriteWidth * 0.06, sy + cell * 1.42, cell, { scale: 0.58 }) && ready;
  }
  if (options.crate) {
    ready = drawPlacedTile(ctx, 'tile_0057.png', sx + spriteWidth * 0.08, sy + cell * 1.36, cell, { scale: 0.66 }) && ready;
  }
  if (options.bucket) {
    ready = drawPlacedTile(ctx, 'tile_0130.png', sx + spriteWidth * 0.72, sy + cell * 1.4, cell, { scale: 0.52 }) && ready;
  }
  if (options.flowers) {
    ready = drawPlacedTile(ctx, 'tile_0001.png', sx + spriteWidth * 0.04, sy + cell * 1.46, cell, { scale: 0.56, alpha: 0.92 }) && ready;
    ready = drawPlacedTile(ctx, 'tile_0001.png', sx + spriteWidth * 0.62, sy + cell * 1.5, cell, { scale: 0.5, alpha: 0.85 }) && ready;
  }

  return ready;
}

function drawMarketStall(ctx, x, y, width, height) {
  const cell = Math.min(width / 3.1, height / 2.1);
  const spriteWidth = cell * 3;
  const spriteHeight = cell * 1.95;
  const sx = x + (width - spriteWidth) / 2;
  const sy = y + height - spriteHeight - height * 0.04;
  let ready = true;

  drawShadowEllipse(ctx, sx + cell * 0.1, sy + spriteHeight * 0.82, spriteWidth * 0.84, cell * 0.34, 0.22);
  drawBuildingFooting(ctx, sx + cell * 0.2, sy + cell * 1.2, spriteWidth * 0.72, cell * 0.28, '#f0c98b');

  ['tile_0052.png', 'tile_0053.png', 'tile_0054.png'].forEach((tile, index) => {
    ready = drawPlacedTile(ctx, tile, sx + index * cell, sy, cell) && ready;
  });
  ready = drawPlacedTile(ctx, 'tile_0056.png', sx + cell * 0.1, sy + cell * 0.92, cell) && ready;
  ready = drawPlacedTile(ctx, 'tile_0058.png', sx + cell * 1.95, sy + cell * 0.92, cell) && ready;
  ready = drawPlacedTile(ctx, 'tile_0057.png', sx + cell * 0.92, sy + cell * 1.08, cell, { scale: 0.72 }) && ready;
  ready = drawPlacedTile(ctx, 'tile_0107.png', sx + cell * 0.18, sy + cell * 1.28, cell, { scale: 0.48 }) && ready;
  ready = drawPlacedTile(ctx, 'tile_0093.png', sx + cell * 1.6, sy + cell * 1.3, cell, { scale: 0.54 }) && ready;
  ready = drawPlacedTile(ctx, 'tile_0083.png', sx + cell * 2.3, sy + cell * 0.98, cell, { scale: 0.64 }) && ready;

  return ready;
}

function drawWell(ctx, x, y, width, height) {
  const size = Math.min(width, height) * 0.96;
  const sx = x + (width - size) / 2;
  const sy = y + height - size - height * 0.03;
  drawShadowEllipse(ctx, sx + size * 0.14, sy + size * 0.76, size * 0.62, size * 0.28, 0.2);
  return drawPlacedTile(ctx, 'tile_0104.png', sx, sy, size);
}

function drawTownHall(ctx, x, y, width, height) {
  const cell = Math.min(width / 4.1, height / 3.1);
  const spriteWidth = cell * 4;
  const spriteHeight = cell * 3.1;
  const sx = x + (width - spriteWidth) / 2;
  const sy = y + height - spriteHeight - height * 0.02;
  let ready = true;

  drawShadowEllipse(ctx, sx + cell * 0.18, sy + spriteHeight * 0.85, spriteWidth * 0.78, cell * 0.38, 0.24);

  ['tile_0099.png', 'tile_0100.png', 'tile_0101.png', 'tile_0102.png'].forEach((tile, index) => {
    ready = drawPlacedTile(ctx, tile, sx + index * cell, sy, cell) && ready;
  });
  ready = drawPlacedTile(ctx, 'tile_0103.png', sx + cell * 1.56, sy + cell * 0.4, cell, { scale: 0.72 }) && ready;

  ready = drawPlacedTile(ctx, 'tile_0124.png', sx, sy + cell * 0.95, cell, { scale: 1.05 }) && ready;
  ready = drawPlacedTile(ctx, 'tile_0120.png', sx + cell * 1.02, sy + cell * 1.02, cell) && ready;
  ready = drawPlacedTile(ctx, 'tile_0121.png', sx + cell * 1.98, sy + cell * 1.02, cell) && ready;
  ready = drawPlacedTile(ctx, 'tile_0124.png', sx + cell * 3.02, sy + cell * 0.95, cell, { scale: 1.05 }) && ready;

  ready = drawPlacedTile(ctx, 'tile_0124.png', sx - cell * 0.02, sy + cell * 1.86, cell, { scale: 1.05 }) && ready;
  ready = drawPlacedTile(ctx, 'tile_0111.png', sx + cell * 1.02, sy + cell * 1.88, cell) && ready;
  ready = drawPlacedTile(ctx, 'tile_0114.png', sx + cell * 1.98, sy + cell * 1.88, cell) && ready;
  ready = drawPlacedTile(ctx, 'tile_0124.png', sx + cell * 3.02, sy + cell * 1.86, cell, { scale: 1.05 }) && ready;

  return ready;
}

function getNowSeconds() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}

function getBuildingActivity(buildingOrType) {
  if (!buildingOrType || typeof buildingOrType === 'string') {
    return {
      type: typeof buildingOrType === 'string' ? buildingOrType : '',
      energy: 0,
      built: true,
      level: 1,
    };
  }

  const type = buildingOrType.type || buildingOrType.building_type || '';
  const state = buildingOrType.state || 'built';
  const workers = Number(buildingOrType.workers || 0);
  const maxWorkers = Math.max(Number(buildingOrType.max_workers || 0), 0);
  const level = Math.max(Number(buildingOrType.level || 1), 1);
  const built = state === 'built';
  const workerEnergy = maxWorkers > 0 ? workers / maxWorkers : 0;
  const levelEnergy = Math.min(0.35, (level - 1) * 0.08);
  const energy = built ? Math.min(1.15, workerEnergy + levelEnergy) : 0;

  return { type, energy, built, level, workers, maxWorkers };
}

function drawSmokePuffs(ctx, x, y, width, height, intensity = 0.6, seed = 0) {
  if (intensity <= 0.05) return;
  const time = getNowSeconds() + seed * 0.37;
  const baseX = x + width * 0.68;
  const baseY = y + height * 0.24;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const drift = ((time * 0.28 + i * 0.26) % 1);
    const radius = width * (0.05 + drift * 0.035);
    ctx.globalAlpha = (0.22 + intensity * 0.22) * (1 - drift * 0.7);
    ctx.fillStyle = i === 2 ? '#f7f1ec' : '#e6ddd5';
    ctx.beginPath();
    ctx.arc(
      baseX + Math.sin(time * 1.2 + i) * width * 0.05,
      baseY - drift * height * 0.34 - i * height * 0.03,
      radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawPennant(ctx, x, y, width, height, color = '#d85050', intensity = 0.7) {
  const flap = Math.sin(getNowSeconds() * 3.1 + x * 0.04) * width * 0.03 * intensity;
  ctx.save();
  ctx.strokeStyle = 'rgba(58,34,22,0.7)';
  ctx.lineWidth = Math.max(1, width * 0.03);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + height);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + height * 0.14);
  ctx.lineTo(x + width + flap, y + height * 0.3);
  ctx.lineTo(x, y + height * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCompactHut(ctx, x, y, width, height, options = {}) {
  const cell = Math.min(width / 1.28, height / 1.82);
  const spriteWidth = cell * 1.08;
  const spriteHeight = cell * 1.7;
  const sx = x + (width - spriteWidth) / 2;
  const sy = y + height - spriteHeight - height * 0.04;
  let ready = true;

  drawShadowEllipse(ctx, sx + cell * 0.06, sy + spriteHeight * 0.8, spriteWidth * 0.84, cell * 0.26, 0.2);
  if (options.footing) {
    drawBuildingFooting(ctx, sx + cell * 0.1, sy + cell * 1.16, spriteWidth * 0.7, cell * 0.26, options.footing);
  }
  ready = drawPlacedTile(ctx, options.roof || 'tile_0054.png', sx, sy, cell, { scale: 1.04 }) && ready;
  ready = drawPlacedTile(ctx, options.wall || 'tile_0085.png', sx + cell * 0.03, sy + cell * 0.78, cell, { scale: 0.98 }) && ready;

  if (options.logPile) {
    ready = drawPlacedTile(ctx, 'tile_0106.png', sx - cell * 0.14, sy + cell * 1.2, cell, { scale: 0.6 }) && ready;
  }
  if (options.axe) {
    ready = drawPlacedTile(ctx, 'tile_0118.png', sx + cell * 0.72, sy + cell * 1.16, cell, { scale: 0.48 }) && ready;
  }
  if (options.bucket) {
    ready = drawPlacedTile(ctx, 'tile_0130.png', sx + cell * 0.72, sy + cell * 1.2, cell, { scale: 0.52 }) && ready;
  }
  if (options.hook) {
    ready = drawPlacedTile(ctx, 'tile_0105.png', sx + cell * 0.78, sy + cell * 0.96, cell, { scale: 0.5 }) && ready;
  }
  if (options.flower) {
    ready = drawPlacedTile(ctx, 'tile_0001.png', sx - cell * 0.08, sy + cell * 1.18, cell, { scale: 0.48, alpha: 0.9 }) && ready;
  }

  return ready;
}

function drawStoneWorkshop(ctx, x, y, width, height, options = {}) {
  const cell = Math.min(width / 2.35, height / 2.2);
  const spriteWidth = cell * 2.08;
  const spriteHeight = cell * 1.96;
  const sx = x + (width - spriteWidth) / 2;
  const sy = y + height - spriteHeight - height * 0.04;
  let ready = true;

  drawShadowEllipse(ctx, sx + cell * 0.1, sy + spriteHeight * 0.82, spriteWidth * 0.82, cell * 0.32, 0.22);
  drawBuildingFooting(ctx, sx + cell * 0.08, sy + cell * 1.12, spriteWidth * 0.72, cell * 0.28, options.footing || '#cfd2d8');

  ready = drawPlacedTile(ctx, options.roofLeft || 'tile_0048.png', sx, sy, cell) && ready;
  ready = drawPlacedTile(ctx, options.roofRight || 'tile_0050.png', sx + cell, sy, cell) && ready;
  ready = drawPlacedTile(ctx, options.wallLeft || 'tile_0076.png', sx, sy + cell * 0.88, cell) && ready;
  ready = drawPlacedTile(ctx, options.wallRight || 'tile_0079.png', sx + cell, sy + cell * 0.88, cell) && ready;

  if (options.rocks) {
    ready = drawPlacedTile(ctx, 'tile_0106.png', sx - cell * 0.1, sy + cell * 1.16, cell, { scale: 0.56 }) && ready;
    ready = drawPlacedTile(ctx, 'tile_0105.png', sx + cell * 1.24, sy + cell * 1.18, cell, { scale: 0.5 }) && ready;
  }
  if (options.pickaxe) {
    ready = drawPlacedTile(ctx, 'tile_0115.png', sx + cell * 1.18, sy + cell * 1.0, cell, { scale: 0.52 }) && ready;
  }
  if (options.bucket) {
    ready = drawPlacedTile(ctx, 'tile_0130.png', sx + cell * 0.14, sy + cell * 1.18, cell, { scale: 0.48 }) && ready;
  }

  return ready;
}

function drawWatchtower(ctx, x, y, width, height, activity = 0) {
  const cell = Math.min(width / 1.4, height / 2.6);
  const spriteWidth = cell * 1.1;
  const spriteHeight = cell * 2.52;
  const sx = x + (width - spriteWidth) / 2;
  const sy = y + height - spriteHeight - height * 0.02;
  let ready = true;

  drawShadowEllipse(ctx, sx + cell * 0.12, sy + spriteHeight * 0.86, spriteWidth * 0.74, cell * 0.28, 0.22);
  ready = drawPlacedTile(ctx, 'tile_0058.png', sx + cell * 0.08, sy + cell * 0.92, cell) && ready;
  ready = drawPlacedTile(ctx, 'tile_0059.png', sx + cell * 0.14, sy + cell * 1.7, cell) && ready;
  ready = drawPlacedTile(ctx, 'tile_0093.png', sx, sy + cell * 0.02, cell, { scale: 0.9 }) && ready;

  drawPennant(ctx, sx + cell * 0.78, sy + cell * 0.18, cell * 0.46, cell * 0.72, '#d84f54', 0.55 + activity * 0.45);
  return ready;
}

function drawTradingPost(ctx, x, y, width, height, activity = 0.7) {
  let ready = drawMarketStall(ctx, x, y, width, height);
  const cell = Math.min(width / 3.1, height / 2.1);
  const spriteWidth = cell * 3;
  const sx = x + (width - spriteWidth) / 2;
  const sy = y + height - cell * 1.95 - height * 0.04;

  ready = drawPlacedTile(ctx, 'tile_0082.png', sx + cell * 2.38, sy + cell * 1.2, cell, { scale: 0.68 }) && ready;
  drawPennant(ctx, sx + cell * 2.78, sy + cell * 0.44, cell * 0.34, cell * 0.84, '#3d77d4', 0.45 + activity * 0.4);
  return ready;
}

export function drawKenneyBuilding(ctx, buildingOrType, x, y, width, height) {
  const activity = getBuildingActivity(buildingOrType);
  const type = activity.type;
  let ready = false;

  switch (type) {
    case 'house':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 2,
        walls: ['tile_0084.png', 'tile_0085.png'],
        roof: ['tile_0052.png', 'tile_0054.png'],
        peak: 'tile_0051.png',
        footing: '#f4cf98',
        flowers: true,
      });
      break;
    case 'large_house':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 3,
        walls: ['tile_0084.png', 'tile_0085.png', 'tile_0086.png'],
        roof: ['tile_0052.png', 'tile_0053.png', 'tile_0054.png'],
        peak: 'tile_0051.png',
        footing: '#f4cf98',
        flowers: true,
      });
      break;
    case 'farm':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 2,
        walls: ['tile_0084.png', 'tile_0087.png'],
        roof: ['tile_0052.png', 'tile_0054.png'],
        peak: 'tile_0051.png',
        footing: '#eed09d',
        hay: true,
        crate: true,
      });
      break;
    case 'market':
      ready = drawMarketStall(ctx, x, y, width, height);
      break;
    case 'storehouse':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 3,
        walls: ['tile_0072.png', 'tile_0073.png', 'tile_0075.png'],
        roof: ['tile_0052.png', 'tile_0053.png', 'tile_0054.png'],
        peak: 'tile_0051.png',
        footing: '#ecc894',
        hay: true,
        crate: true,
      });
      break;
    case 'warehouse':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 3,
        walls: ['tile_0076.png', 'tile_0077.png', 'tile_0079.png'],
        roof: ['tile_0048.png', 'tile_0049.png', 'tile_0050.png'],
        peak: 'tile_0063.png',
        footing: '#d6d8dd',
        crate: true,
        barrel: true,
      });
      break;
    case 'bakery':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 2,
        walls: ['tile_0084.png', 'tile_0085.png'],
        roof: ['tile_0052.png', 'tile_0054.png'],
        peak: 'tile_0051.png',
        footing: '#f4cf98',
        sign: 'tile_0083.png',
        hay: true,
      });
      break;
    case 'tavern':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 2,
        walls: ['tile_0084.png', 'tile_0086.png'],
        roof: ['tile_0052.png', 'tile_0054.png'],
        peak: 'tile_0051.png',
        footing: '#f4cf98',
        sign: 'tile_0083.png',
        barrel: true,
      });
      break;
    case 'town_hall':
      ready = drawTownHall(ctx, x, y, width, height);
      break;
    case 'well':
      ready = drawWell(ctx, x, y, width, height);
      break;
    case 'shrine':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 2,
        walls: ['tile_0088.png', 'tile_0089.png'],
        roof: ['tile_0048.png', 'tile_0050.png'],
        peak: 'tile_0063.png',
        footing: '#dfe4ee',
        sign: 'tile_0103.png',
      });
      break;
    case 'fishing_hut':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 2,
        walls: ['tile_0084.png', 'tile_0087.png'],
        roof: ['tile_0048.png', 'tile_0050.png'],
        peak: 'tile_0063.png',
        footing: '#d8d5c4',
        bucket: true,
      });
      if (ready) {
        const cell = Math.min(width / 2.2, height / 2.2);
        ready = drawPlacedTile(ctx, 'tile_0105.png', x + width * 0.68, y + height * 0.6, cell, { scale: 0.42 }) && ready;
      }
      break;
    case 'woodcutters_hut':
      ready = drawCompactHut(ctx, x, y, width, height, {
        roof: 'tile_0054.png',
        wall: 'tile_0085.png',
        footing: '#f0cc95',
        logPile: true,
        axe: true,
      });
      break;
    case 'lumberyard':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 2,
        walls: ['tile_0084.png', 'tile_0087.png'],
        roof: ['tile_0052.png', 'tile_0054.png'],
        peak: 'tile_0051.png',
        footing: '#f0cc95',
        crate: true,
      });
      if (ready) {
        const cell = Math.min(width / 2.6, height / 2.3);
        ready = drawPlacedTile(ctx, 'tile_0106.png', x + width * 0.06, y + height * 0.7, cell, { scale: 0.62 }) && ready;
        ready = drawPlacedTile(ctx, 'tile_0118.png', x + width * 0.68, y + height * 0.66, cell, { scale: 0.5 }) && ready;
      }
      break;
    case 'quarry':
      ready = drawStoneWorkshop(ctx, x, y, width, height, {
        rocks: true,
        pickaxe: true,
        bucket: true,
      });
      break;
    case 'stone_pit':
      ready = drawStoneWorkshop(ctx, x, y, width, height, {
        rocks: true,
        pickaxe: true,
      });
      break;
    case 'trading_post':
      ready = drawTradingPost(ctx, x, y, width, height, activity.energy);
      break;
    case 'watchtower':
      ready = drawWatchtower(ctx, x, y, width, height, activity.energy);
      break;
    case 'weaving_hut':
      ready = drawGabledHouse(ctx, x, y, width, height, {
        cols: 2,
        walls: ['tile_0088.png', 'tile_0089.png'],
        roof: ['tile_0052.png', 'tile_0054.png'],
        peak: 'tile_0051.png',
        footing: '#efd3d9',
        sign: 'tile_0082.png',
        flowers: true,
      });
      break;
    default:
      return false;
  }

  if (!ready) return false;

  if (['house', 'large_house', 'bakery', 'tavern', 'town_hall', 'shrine', 'woodcutters_hut', 'lumberyard', 'weaving_hut'].includes(type)) {
    drawSmokePuffs(ctx, x, y, width, height, 0.28 + activity.energy * 0.55, width * 0.013 + height * 0.017);
  }

  if (type === 'market') {
    drawPennant(ctx, x + width * 0.76, y + height * 0.28, width * 0.16, height * 0.2, '#d84f54', 0.45 + activity.energy * 0.4);
  }

  if (type === 'town_hall') {
    drawPennant(ctx, x + width * 0.54, y + height * 0.16, width * 0.2, height * 0.24, '#cc444d', 0.55 + activity.energy * 0.35);
  }

  return true;
}

export function drawKenneyResident(ctx, x, y, tileSize, paletteKey, activity = 'stroll', frameOffset = 0, facing = 1) {
  const frames = RESIDENT_FRAMES[paletteKey] || RESIDENT_FRAMES.teal;
  const frameIndex = activity === 'stroll'
    ? Math.floor((frameOffset * 4) % frames.length)
    : 0;
  const src = kenneyPath('rpg-urban', frames[frameIndex]);
  const width = tileSize * 0.74;
  const height = tileSize * 0.74;
  const bob = activity === 'stroll' ? Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.02 : 0;
  return drawLoadedSprite(ctx, src, x - width / 2, y - height * 0.82 + bob, width, height, facing);
}

export function drawKenneyCritter(ctx, x, y, tileSize, species, frameOffset = 0, options = {}) {
  const frames = FISH_VARIANTS[species];
  if (!frames) return false;
  const frameIndex = Math.floor((frameOffset * 4) % frames.length);
  const src = kenneyPath('fish-pack', frames[frameIndex]);
  const width = tileSize * ((options.scale || 0.72) * 0.86);
  const height = tileSize * ((options.scale || 0.72) * 0.52);
  const drift = Math.sin(frameOffset * Math.PI * 2) * tileSize * 0.015;
  const ok = drawLoadedSprite(
    ctx,
    src,
    x - width / 2,
    y - height * 0.56 + drift,
    width,
    height,
    options.facing || 1,
  );
  if (!ok) return false;

  const bubble = Math.floor(frameOffset * 6) % 4 === 0 ? 'bubble_a.png' : null;
  if (bubble) {
    drawLoadedSprite(
      ctx,
      kenneyPath('fish-pack', bubble),
      x + width * 0.1,
      y - height * 0.92,
      tileSize * 0.12,
      tileSize * 0.12,
      1,
      0.7,
    );
  }
  return true;
}

export function drawKenneyTerrain(ctx, biome, tile, x, y, size, seed = 0, terrain = null) {
  if (tile.t === 'tree') {
    const src = pickVariant(TREE_VARIANTS[biome] || TREE_VARIANTS.grasslands, seed);
    if (!src) return false;
    return drawLoadedSprite(ctx, kenneyPath(TINY_TOWN, src), x - size * 0.04, y - size * 0.04, size * 1.08, size * 1.08);
  }

  if (tile.t === 'bush') {
    const src = pickVariant(BUSH_VARIANTS[biome] || BUSH_VARIANTS.grasslands, seed);
    if (!src) return false;
    return drawLoadedSprite(ctx, kenneyPath(TINY_TOWN, src), x + size * 0.01, y + size * 0.05, size * 0.92, size * 0.92);
  }

  if (tile.t === 'water') {
    if ((Math.abs(seed) % 7) === 0) {
      drawLoadedSprite(
        ctx,
        kenneyPath('fish-pack', pickVariant(['seaweed_green_a.png', 'seaweed_green_b.png'], seed)),
        x + size * 0.08,
        y + size * 0.3,
        size * 0.34,
        size * 0.34,
        1,
        0.8,
      );
    } else if ((Math.abs(seed) % 11) === 0) {
      drawLoadedSprite(
        ctx,
        kenneyPath('fish-pack', pickVariant(['rock_a.png', 'rock_b.png'], seed)),
        x + size * 0.52,
        y + size * 0.56,
        size * 0.22,
        size * 0.16,
        1,
        0.76,
      );
    }
    return false;
  }

  if (tile.t === 'ground' && (terrain?.meadowStrength || 0) > 0.18 && (Math.abs(seed) % 6) === 0) {
    drawLoadedSprite(
      ctx,
      kenneyPath(TINY_TOWN, 'tile_0001.png'),
      x + size * 0.1,
      y + size * 0.08,
      size * 0.26,
      size * 0.26,
      1,
      0.9,
    );
  }

  return false;
}

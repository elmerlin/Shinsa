import { getBiomeUi } from './petWorldTiles.js';

const FRAME_SIZE = 32;
const SHEET_CACHE = new Map();

const RESIDENT_PALETTES = {
  teal:   { hood: '#567f73', coat: '#365f55', trim: '#d8e9df', skin: '#f0d0bc', hair: '#5b3c2b' },
  berry:  { hood: '#975668', coat: '#713847', trim: '#f0dbe2', skin: '#f1cfbf', hair: '#512f22' },
  ochre:  { hood: '#af8549', coat: '#845f2d', trim: '#f4e1b9', skin: '#f0cdb7', hair: '#5a4129' },
  slate:  { hood: '#687385', coat: '#4b5566', trim: '#d7dfe9', skin: '#ebc8b5', hair: '#473123' },
  moss:   { hood: '#64854e', coat: '#456637', trim: '#dfebca', skin: '#eac4ad', hair: '#483222' },
  plum:   { hood: '#86679d', coat: '#65497b', trim: '#e8def2', skin: '#efc7b1', hair: '#462d22' },
};

const PET_PALETTES = {
  dojocat:  { body: '#585963', head: '#6a6b76', trim: '#d5d8df', eye: '#201c1d' },
  buu:      { body: '#d680a3', head: '#e797b4', trim: '#f7d9e5', eye: '#331825' },
  devit:    { body: '#4475b0', head: '#5a88c2', trim: '#d9e8ff', eye: '#1a2944' },
  pixiu:    { body: '#c69a41', head: '#d9af58', trim: '#f6e1a5', eye: '#3a2811' },
  tanuki:   { body: '#886744', head: '#9b7853', trim: '#e9d5b0', eye: '#2d2014' },
  kitsune:  { body: '#d47c3a', head: '#e5904f', trim: '#ffe0b8', eye: '#311d12' },
  usagi:    { body: '#d7d0cc', head: '#e9e1dd', trim: '#fff6f3', eye: '#2f2429' },
  kappa:    { body: '#4d9966', head: '#63ad79', trim: '#d9f3df', eye: '#10261a' },
};

function makeCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getSheet(key, frames, painter) {
  if (SHEET_CACHE.has(key)) return SHEET_CACHE.get(key);
  const canvas = makeCanvas(FRAME_SIZE * frames, FRAME_SIZE);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let frame = 0; frame < frames; frame += 1) {
    ctx.save();
    ctx.translate(frame * FRAME_SIZE, 0);
    painter(ctx, frame);
    ctx.restore();
  }
  SHEET_CACHE.set(key, canvas);
  return canvas;
}

function px(ctx, x, y, w, h, fill, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.restore();
}

function dot(ctx, x, y, fill, alpha = 1, size = 1) {
  px(ctx, x, y, size, size, fill, alpha);
}

function drawFrame(ctx, sheet, frame, x, y, width, height, facing = 1, alpha = 1) {
  if (!sheet) return false;
  const sx = (frame % (sheet.width / FRAME_SIZE)) * FRAME_SIZE;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  if (facing === -1) {
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, 0, 0, width, height);
  } else {
    ctx.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, x, y, width, height);
  }
  ctx.restore();
  return true;
}

function highlight(color, amount = 0.2) {
  const value = parseInt(color.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function shade(color, amount = 0.2) {
  const value = parseInt(color.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const mix = (c) => Math.round(c * (1 - amount));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function paintTreeSheet(biome) {
  const ui = getBiomeUi(biome);
  const trunk = ui.treeTrunk;
  return getSheet(`tree:${biome}`, 2, (ctx, frame) => {
    const sway = frame === 0 ? 0 : 1;
    px(ctx, 15, 17, 3, 8, shade(trunk, 0.08));
    px(ctx, 15, 17, 1, 8, highlight(trunk, 0.12), 0.6);
    px(ctx, 14 + sway, 10, 7, 6, shade(ui.tree, 0.1));
    px(ctx, 10 + sway, 11, 6, 5, ui.tree);
    px(ctx, 16 + sway, 11, 6, 5, ui.tree);
    px(ctx, 12 + sway, 7, 8, 6, highlight(ui.tree, 0.08));
    px(ctx, 13 + sway, 8, 4, 2, ui.treeHighlight, 0.65);
    dot(ctx, 13 + sway, 12, ui.treeHighlight, 0.55, 2);
    dot(ctx, 19 + sway, 13, shade(ui.tree, 0.24), 0.65, 2);
  });
}

function paintRockSheet(biome) {
  const ui = getBiomeUi(biome);
  return getSheet(`rock:${biome}`, 2, (ctx, frame) => {
    const shift = frame;
    px(ctx, 9, 15, 14, 8, ui.rock);
    px(ctx, 11, 12, 10, 6, ui.rock);
    px(ctx, 13, 10, 7, 4, highlight(ui.rock, 0.16));
    px(ctx, 17 + shift, 15, 5, 7, shade(ui.rock, 0.18), 0.9);
    px(ctx, 12, 13, 6, 2, ui.rockHighlight, 0.55);
    dot(ctx, 18, 13, ui.rockHighlight, 0.7, 2);
    dot(ctx, 21, 20, shade(ui.rock, 0.22), 0.75, 2);
  });
}

function paintBushSheet(biome) {
  const ui = getBiomeUi(biome);
  return getSheet(`bush:${biome}`, 2, (ctx, frame) => {
    const flicker = frame === 0 ? 0 : 1;
    px(ctx, 10, 15, 12, 6, ui.bush);
    px(ctx, 8, 13, 7, 5, ui.bush);
    px(ctx, 18, 13, 6, 5, ui.bush);
    px(ctx, 12, 11, 8, 5, highlight(ui.bush, 0.12));
    dot(ctx, 11, 16, ui.bushDetail, 0.65, 2);
    dot(ctx, 18, 15, ui.bushDetail, 0.55, 2);
    dot(ctx, 15 + flicker, 13, highlight(ui.bushDetail, 0.18), 0.8, 1);
    dot(ctx, 19 - flicker, 18, shade(ui.bush, 0.18), 0.55, 2);
  });
}

function paintWaterSheet(biome) {
  const ui = getBiomeUi(biome);
  return getSheet(`water:${biome}`, 4, (ctx, frame) => {
    for (let y = 6; y < 28; y += 6) {
      const shift = (frame + y / 6) % 4;
      px(ctx, 3 + shift, y, 7, 1, ui.waterHighlight, 0.38);
      px(ctx, 15 + shift, y + 2, 8, 1, highlight(ui.water, 0.18), 0.32);
      px(ctx, 23 - shift, y - 2, 4, 1, ui.waterShore, 0.26);
    }
    px(ctx, 6 + frame, 8, 2, 2, '#ffffff', 0.22);
    px(ctx, 20 - frame, 21, 2, 1, '#ffffff', 0.16);
  });
}

function paintGroundDecalSheet(biome, theme) {
  const ui = getBiomeUi(biome);
  const key = `ground:${biome}:${theme}`;
  return getSheet(key, 4, (ctx, frame) => {
    const accent = ui.groundDetail;
    const dark = shade(ui.ground[0], 0.2);
    const light = highlight(ui.ground[2] || ui.ground[1], 0.15);

    if (theme === 'meadow') {
      px(ctx, 8 + frame, 17, 2, 5, dark, 0.55);
      px(ctx, 10 + frame, 15, 1, 4, dark, 0.45);
      px(ctx, 19 - frame, 14, 2, 6, dark, 0.45);
      dot(ctx, 11 + frame, 13, accent, 0.65, 2);
      dot(ctx, 21 - frame, 18, light, 0.55, 2);
    } else if (theme === 'shore') {
      px(ctx, 5, 22, 8, 1, ui.waterShore, 0.24);
      px(ctx, 18, 23, 7, 1, '#ffffff', 0.14);
      px(ctx, 13 + frame, 17, 1, 6, dark, 0.45);
      px(ctx, 15 + frame, 18, 1, 5, dark, 0.38);
      dot(ctx, 7 + frame, 18, light, 0.45, 2);
    } else if (theme === 'rocky') {
      dot(ctx, 9 + frame, 17, ui.rock, 0.45, 2);
      dot(ctx, 18, 13 + frame, ui.rockHighlight, 0.4, 2);
      px(ctx, 20, 20, 4, 1, dark, 0.35);
      px(ctx, 11, 22, 3, 1, dark, 0.32);
    } else if (theme === 'lane') {
      px(ctx, 8, 19, 10, 3, shade(ui.pathStone || ui.ground[0], 0.12), 0.28);
      px(ctx, 18, 15 + frame, 5, 2, shade(ui.pathStone || ui.ground[0], 0.2), 0.22);
      dot(ctx, 11 + frame, 15, light, 0.35, 1);
    } else {
      px(ctx, 7 + frame, 18, 2, 4, dark, 0.4);
      px(ctx, 19 - frame, 16, 1, 4, dark, 0.33);
      dot(ctx, 13, 14 + frame, accent, 0.45, 1);
      dot(ctx, 21, 20 - frame, light, 0.35, 2);
    }
  });
}

function getGroundTheme(terrain, neighbors) {
  if ((terrain?.shoreStrength || 0) > 0.2 || ['water'].includes(neighbors?.n) || ['water'].includes(neighbors?.s) || ['water'].includes(neighbors?.e) || ['water'].includes(neighbors?.w)) {
    return 'shore';
  }
  if ((terrain?.laneStrength || 0) > 0.28) return 'lane';
  if ((terrain?.rockyStrength || 0) > 0.24) return 'rocky';
  if ((terrain?.meadowStrength || 0) > 0.25) return 'meadow';
  return 'plain';
}

export function drawTerrainAtlasSprite(ctx, biome, tile, x, y, size, time = 0, terrain = null, neighbors = null, seed = 0) {
  if (typeof document === 'undefined') return false;
  const frame = Math.floor((time / 240) % 4);
  if (tile.t === 'tree') {
    return drawFrame(ctx, paintTreeSheet(biome), frame % 2, x - size * 0.06, y - size * 0.04, size * 1.12, size * 1.08);
  }
  if (tile.t === 'rock') {
    return drawFrame(ctx, paintRockSheet(biome), frame % 2, x + size * 0.02, y + size * 0.02, size * 0.96, size * 0.96);
  }
  if (tile.t === 'bush') {
    return drawFrame(ctx, paintBushSheet(biome), frame % 2, x + size * 0.01, y + size * 0.04, size * 0.98, size * 0.94);
  }
  if (tile.t === 'water') {
    drawFrame(ctx, paintWaterSheet(biome), frame, x, y, size, size, 1, 0.82);
    return false;
  }
  const theme = getGroundTheme(terrain, neighbors);
  const variant = Math.abs(seed) % 4;
  drawFrame(ctx, paintGroundDecalSheet(biome, theme), variant, x, y, size, size, 1, theme === 'lane' ? 0.72 : 0.82);
  return false;
}

function paintResidentSheet(paletteKey, activity) {
  const pal = RESIDENT_PALETTES[paletteKey] || RESIDENT_PALETTES.teal;
  return getSheet(`resident:${paletteKey}:${activity}`, 4, (ctx, frame) => {
    const step = frame % 2 === 0 ? 0 : 1;
    px(ctx, 14, 8, 5, 4, pal.hair);
    px(ctx, 13, 10, 7, 5, pal.skin);
    px(ctx, 12, 6, 9, 5, pal.hood);
    px(ctx, 12, 15, 10, 8, pal.coat);
    px(ctx, 15, 15, 3, 6, pal.trim, 0.45);
    px(ctx, 11, 16, 2, 5, pal.hood);
    px(ctx, 21, 16, 2, 5, pal.hood);
    px(ctx, 13, 23 + step, 2, 5, '#3a281d');
    px(ctx, 18, 23 + (1 - step), 2, 5, '#3a281d');
    dot(ctx, 15, 12, '#261d19', 1, 1);
    dot(ctx, 18, 12, '#261d19', 1, 1);
    if (activity === 'carry') {
      px(ctx, 9, 17, 4, 4, '#9e825d');
      px(ctx, 10, 18, 2, 2, '#d8bf86');
    } else if (activity === 'build') {
      px(ctx, 21, 14, 1, 8, '#866145');
      px(ctx, 18, 13, 6, 2, '#c5cad4');
    } else if (activity === 'gather') {
      px(ctx, 21, 18, 3, 3, '#d6ba73');
      px(ctx, 22, 16, 1, 2, '#7a5e28');
    } else if (activity === 'play') {
      px(ctx, 20, 18, 3, 3, '#6fd0ff');
    }
  });
}

export function drawVillageResidentAtlas(ctx, x, y, tileSize, paletteKey, activity = 'stroll', frameOffset = 0, facing = 1) {
  const sheet = paintResidentSheet(paletteKey, activity);
  if (!sheet) return false;
  const frame = activity === 'stroll' ? Math.floor((frameOffset * 4) % 4) : (Math.floor((frameOffset * 4) % 2) + 2);
  const width = tileSize * 0.88;
  const height = tileSize * 0.94;
  return drawFrame(ctx, sheet, frame, x - width / 2, y - height * 0.86, width, height, facing);
}

function paintCritterSheet(species) {
  return getSheet(`critter:${species}`, 4, (ctx, frame) => {
    const bob = frame % 2;
    if (species === 'rabbit') {
      px(ctx, 10, 16, 10, 6, '#ded7cf');
      px(ctx, 18, 12, 6, 6, '#e8e1db');
      px(ctx, 19, 4 + bob, 2, 9, '#e8e1db');
      px(ctx, 22, 3 + bob, 2, 10, '#d8c3c8');
      dot(ctx, 21, 14, '#231d1a');
    } else if (species === 'deer') {
      px(ctx, 8, 16, 12, 5, '#9b7446');
      px(ctx, 19, 11, 4, 8, '#9b7446');
      px(ctx, 22, 9, 5, 4, '#ac8557');
      px(ctx, 24, 3 + bob, 1, 7, '#7f5f36');
      px(ctx, 22, 5 + bob, 1, 5, '#7f5f36');
      px(ctx, 26, 5 + bob, 1, 5, '#7f5f36');
      px(ctx, 10, 20 + bob, 2, 6, '#6b4d2b');
      px(ctx, 16, 20, 2, 6, '#6b4d2b');
    } else if (species === 'boar') {
      px(ctx, 8, 16, 13, 6, '#6b5040');
      px(ctx, 20, 14, 7, 5, '#7b5f4d');
      px(ctx, 25, 15, 2, 1, '#e8d8bd');
      px(ctx, 11, 21 + bob, 2, 5, '#442f22');
      px(ctx, 18, 21, 2, 5, '#442f22');
    } else if (species === 'fox') {
      px(ctx, 8, 16, 12, 5, '#d67838');
      px(ctx, 18, 13, 8, 5, '#df8644');
      px(ctx, 19, 9, 2, 4, '#d67838');
      px(ctx, 23, 9, 2, 4, '#d67838');
      px(ctx, 4, 13 + bob, 5, 3, '#f6e5cd');
      px(ctx, 11, 20, 2, 5, '#86451f');
      px(ctx, 17, 20 + bob, 2, 5, '#86451f');
    } else if (species === 'wolf') {
      px(ctx, 8, 16, 12, 5, '#7e828f');
      px(ctx, 19, 12, 8, 6, '#9196a4');
      px(ctx, 20, 8, 2, 4, '#7e828f');
      px(ctx, 24, 8, 2, 4, '#7e828f');
      dot(ctx, 23, 14, '#f1c55d');
      px(ctx, 10, 20, 2, 5, '#575b66');
      px(ctx, 17, 20 + bob, 2, 5, '#575b66');
    } else if (species === 'bear') {
      px(ctx, 7, 14, 15, 8, '#6c4527');
      px(ctx, 19, 11, 8, 7, '#7a5233');
      px(ctx, 20, 8, 2, 3, '#6c4527');
      px(ctx, 24, 8, 2, 3, '#6c4527');
      px(ctx, 10, 21, 3, 6, '#4c2f18');
      px(ctx, 17, 21 + bob, 3, 6, '#4c2f18');
    } else if (species === 'duck') {
      px(ctx, 10, 18, 10, 4, '#e8e1c2');
      px(ctx, 18, 14 + bob, 5, 5, '#f0e8cc');
      px(ctx, 22, 15 + bob, 3, 2, '#e49a31');
      dot(ctx, 20, 15, '#1e1a16');
      px(ctx, 12, 22, 1, 4, '#7f5c2d');
      px(ctx, 16, 22 + bob, 1, 4, '#7f5c2d');
    } else if (species === 'fish_koi') {
      px(ctx, 9, 15, 10, 4, '#f29f4b');
      px(ctx, 18, 14, 5, 3, '#fff4dd');
      px(ctx, 6 - bob, 14, 3, 6, '#f29f4b');
      px(ctx, 12, 13, 4, 1, '#fff4dd');
      dot(ctx, 20, 16, '#12273a');
    } else if (species === 'fish_perch') {
      px(ctx, 9, 15, 10, 4, '#79a9c8');
      px(ctx, 18, 14, 5, 3, '#dfeef8');
      px(ctx, 6 - bob, 14, 3, 6, '#79a9c8');
      px(ctx, 12, 13, 4, 1, '#dfeef8');
      dot(ctx, 20, 16, '#12273a');
    } else if (species === 'rare_bird') {
      px(ctx, 12, 15, 8, 5, '#4da6c5');
      px(ctx, 18, 13, 5, 4, '#68bad4');
      px(ctx, 10, 13 - bob, 4, 4, '#2c6f8e');
      px(ctx, 22, 14, 3, 2, '#e39a2f');
      px(ctx, 17, 9 + bob, 1, 4, '#f0cf8a');
    } else {
      // songbird
      px(ctx, 12, 15, 7, 5, '#d5be58');
      px(ctx, 18, 13, 4, 4, '#dec96b');
      px(ctx, 10, 13 - bob, 4, 4, '#7a5db4');
      px(ctx, 21, 14, 3, 2, '#e39a2f');
      px(ctx, 16, 10 + bob, 1, 4, '#f08c42');
    }
  });
}

export function drawAmbientCritterAtlas(ctx, x, y, tileSize, species, frameOffset = 0, options = {}) {
  const sheet = paintCritterSheet(species);
  if (!sheet) return false;
  const frame = Math.floor((frameOffset * 4) % 4);
  const width = tileSize * (options.scale || 0.7);
  const height = tileSize * (options.scale || 0.7);
  if (options.highlight) {
    const pulse = 0.4 + Math.sin(frameOffset * Math.PI * 2) * 0.18;
    ctx.save();
    ctx.strokeStyle = `rgba(251,191,36,${pulse.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, tileSize * 0.03);
    ctx.beginPath();
    ctx.arc(x, y - tileSize * 0.06, tileSize * 0.19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  return drawFrame(ctx, sheet, frame, x - width / 2, y - height * 0.7, width, height, options.facing || 1);
}

function paintPetSheet(character) {
  const pal = PET_PALETTES[character] || PET_PALETTES.dojocat;
  return getSheet(`pet:${character}`, 4, (ctx, frame) => {
    const hop = frame % 2;
    px(ctx, 10, 16, 10, 6, pal.body);
    px(ctx, 14, 10 - hop, 7, 6, pal.head);
    px(ctx, 13, 6 - hop, 2, 4, pal.head);
    px(ctx, 19, 6 - hop, 2, 4, pal.head);
    px(ctx, 12, 21 + hop, 2, 5, shade(pal.body, 0.28));
    px(ctx, 18, 21 + (1 - hop), 2, 5, shade(pal.body, 0.28));
    px(ctx, 8, 13 + hop, 3, 2, pal.trim);
    dot(ctx, 16, 13 - hop, pal.eye);
    dot(ctx, 19, 13 - hop, pal.eye);
    dot(ctx, 11, 15 + hop, pal.trim, 0.55, 2);
  });
}

export function drawPetAtlas(ctx, x, y, tileSize, character, frameOffset = 0) {
  const sheet = paintPetSheet(character);
  if (!sheet) return false;
  const frame = Math.floor((frameOffset * 4) % 4);
  const width = tileSize * 0.78;
  const height = tileSize * 0.78;
  return drawFrame(ctx, sheet, frame, x - width / 2, y - height * 0.74, width, height, 1);
}

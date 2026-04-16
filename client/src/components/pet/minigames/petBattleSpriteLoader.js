const BASE_PATH = '/pet-battle/characters';
const ENEMY_BASE_PATH = '/pet-battle/enemies';

const CHARACTERS = [
  'dojocat-meatshield', 'dojocat-brawler', 'dojocat-ranged', 'dojocat-tank',
  'buu-meatshield', 'buu-brawler', 'buu-ranged', 'buu-tank',
  'devit-meatshield', 'devit-brawler', 'devit-ranged', 'devit-tank',
  'pixiu-meatshield', 'pixiu-brawler', 'pixiu-ranged', 'pixiu-tank',
];

const WORLDS = ['fire', 'water', 'rock', 'ice', 'grassland'];
const ENEMY_ROLES = ['basic', 'bruiser', 'sniper', 'tank', 'boss'];

const sprites = {};
const enemySprites = {};
let loadPromise = null;
let enemyLoadPromise = null;

function classifyAnimation(name, frames) {
  const lower = name.toLowerCase();
  if (lower.includes('cross_punch')) return 'attack';
  if (lower.includes('fireball') || lower.includes('casting')) return 'fireball';
  if (lower.includes('falling') || lower.includes('death')) return 'death';
  if (frames === 4) return 'walk';
  if (frames === 8) return 'idle';
  return 'unknown';
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadCharacterFromDir(dir) {
  let meta;
  try {
    const resp = await fetch(`${dir}/metadata.json`);
    if (!resp.ok) return null;
    meta = await resp.json();
  } catch { return null; }

  const entry = { rotations: {}, animations: {} };

  const rotations = meta.frames?.rotations || {};
  const rotPromises = Object.entries(rotations).map(async ([direction, path]) => {
    const img = await loadImage(`${dir}/${path}`);
    if (img) entry.rotations[direction] = img;
  });

  const animations = meta.frames?.animations || {};
  const animPromises = Object.entries(animations).map(async ([animId, dirs]) => {
    const firstDir = Object.values(dirs)[0];
    const frameCount = Array.isArray(firstDir) ? firstDir.length : 0;
    const type = classifyAnimation(animId, frameCount);
    if (type === 'unknown') return;

    entry.animations[type] = entry.animations[type] || {};
    const dirPromises = Object.entries(dirs).map(async ([direction, framePaths]) => {
      const frames = await Promise.all(
        framePaths.map((p) => loadImage(`${dir}/${p}`))
      );
      entry.animations[type][direction] = frames.filter(Boolean);
    });
    await Promise.all(dirPromises);
  });

  await Promise.all([...rotPromises, ...animPromises]);
  return entry;
}

export function loadAllSprites() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const results = await Promise.all(
      CHARACTERS.map(async (key) => {
        const data = await loadCharacterFromDir(`${BASE_PATH}/${key}`);
        if (data) sprites[key] = data;
      })
    );
    return sprites;
  })();
  return loadPromise;
}

export function getSpriteKey(character, role) {
  return `${character}-${role}`;
}

export function isLoaded(character, role) {
  return !!sprites[getSpriteKey(character, role)];
}

export function getRotation(character, role, direction) {
  return sprites[getSpriteKey(character, role)]?.rotations?.[direction] || null;
}

export function getAnimationFrame(character, role, animType, direction, frameIndex) {
  const frames = sprites[getSpriteKey(character, role)]?.animations?.[animType]?.[direction];
  if (!frames || frames.length === 0) return null;
  return frames[frameIndex % frames.length];
}

export function getAnimationLength(character, role, animType) {
  const anim = sprites[getSpriteKey(character, role)]?.animations?.[animType];
  if (!anim) return 0;
  const firstDir = Object.values(anim)[0];
  return firstDir?.length || 0;
}

// ━━━ Enemy Sprites ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function loadAllEnemySprites() {
  if (enemyLoadPromise) return enemyLoadPromise;
  enemyLoadPromise = (async () => {
    const keys = [];
    for (const world of WORLDS) {
      for (const role of ENEMY_ROLES) {
        keys.push(`${world}-${role}`);
      }
    }
    await Promise.all(
      keys.map(async (key) => {
        const data = await loadCharacterFromDir(`${ENEMY_BASE_PATH}/${key}`);
        if (data) enemySprites[key] = data;
      })
    );
    return enemySprites;
  })();
  return enemyLoadPromise;
}

export function isEnemyLoaded(world, type) {
  return !!enemySprites[`${world}-${type}`];
}

export function getEnemyRotation(world, type, direction) {
  return enemySprites[`${world}-${type}`]?.rotations?.[direction] || null;
}

export function getEnemyAnimationFrame(world, type, animType, direction, frameIndex) {
  const frames = enemySprites[`${world}-${type}`]?.animations?.[animType]?.[direction];
  if (!frames || frames.length === 0) return null;
  return frames[frameIndex % frames.length];
}

export function getEnemyAnimationLength(world, type, animType) {
  const anim = enemySprites[`${world}-${type}`]?.animations?.[animType];
  if (!anim) return 0;
  const firstDir = Object.values(anim)[0];
  return firstDir?.length || 0;
}

// ━━━ Shared Drawing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function drawSprite(ctx, img, x, groundY, targetHeight, flipX) {
  if (!img) return false;
  const aspect = img.width / img.height;
  const h = targetHeight;
  const w = h * aspect;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flipX) {
    ctx.scale(-1, 1);
    ctx.drawImage(img, -x - w / 2, groundY - h, w, h);
  } else {
    ctx.drawImage(img, x - w / 2, groundY - h, w, h);
  }
  ctx.restore();
  return true;
}

/**
 * Pet Invaders Canvas Sprites v2 — Pixel Art Edition
 * All characters rendered via box-shadow-style pixel grids on canvas.
 * Player pet in spaceship, pixel-art fodder enemies, pixel-art bosses,
 * tiered projectiles, power-ups with heal, explosions, HUD.
 */

import { CHAR_COLORS } from './miniPumpSprites';

// ─── Color palettes ─────────────────────────────────
const ENEMY_COLORS = {
  jelly:  { body: '#66dd88', dark: '#338855', light: '#aaffbb', eye: '#ffffff', pupil: '#222222', outline: '#225533' },
  bat:    { body: '#9966cc', dark: '#664499', light: '#cc99ff', eye: '#ffcc00', pupil: '#222222', outline: '#442266', wing: '#bb88ee' },
  robot:  { body: '#99aacc', dark: '#667799', light: '#bbccee', eye: '#ff4444', pupil: '#880000', outline: '#445566', accent: '#4488ff' },
  cloud:  { body: '#ccddff', dark: '#99bbee', light: '#eef4ff', eye: '#5577aa', pupil: '#334455', outline: '#7799cc' },
  slime:  { body: '#ffaa44', dark: '#cc7711', light: '#ffcc88', eye: '#ffffff', pupil: '#222222', outline: '#995500' },
  star:   { body: '#ffee44', dark: '#ccaa11', light: '#ffffaa', eye: '#ff4422', pupil: '#881100', outline: '#998800' },
};

const BOSS_COLORS = {
  labubu:    { body: '#c9e8a0', dark: '#7aaa55', light: '#e0f5cc', eye: '#222222', outline: '#557733', accent: '#ff88aa', ear: '#a0cc70' },
  buu:       { body: '#f0b8c8', dark: '#cc7799', light: '#ffd8e8', eye: '#2d2d2d', outline: '#995577', accent: '#ff4488', tentacle: '#e090aa' },
  dojocat:   { body: '#dfae6f', dark: '#aa7733', light: '#f5d5a0', eye: '#2d2d2d', outline: '#774411', accent: '#ee3322', earInner: '#ffbbaa', belly: '#fff2df' },
  pixiu:     { body: '#fff2f7', dark: '#ddaacc', light: '#ffffff', eye: '#5a3a2a', outline: '#996677', accent: '#ee81b0', mane: '#ffcc88', whisker: '#cc8899' },
  vegetacat: { body: '#4466cc', dark: '#223399', light: '#6688ee', eye: '#ffcc00', outline: '#112266', accent: '#ffdd44', hair: '#ffee55', armor: '#334488' },
};

const SHIP_COLORS = {
  hull: '#3a4466', hullLight: '#5566aa', hullDark: '#222244', cockpit: '#88ccff',
  cockpitGlow: '#aaddff', wing: '#445577', wingTip: '#667799', engine: '#ff8844',
  engineGlow: '#ffaa66', trim: '#6688bb',
};

const POWER_UP_COLORS = {
  spread: { fill: '#ff6644', glow: 'rgba(255,102,68,0.4)', icon: 'S', label: 'SPREAD' },
  rate:   { fill: '#44ccff', glow: 'rgba(68,204,255,0.4)', icon: 'R', label: 'RATE' },
  damage: { fill: '#ff44cc', glow: 'rgba(255,68,204,0.4)', icon: 'D', label: 'DMG' },
  heal:   { fill: '#44ff88', glow: 'rgba(68,255,136,0.5)', icon: '+', label: 'HEAL' },
  hybrid: { fill: '#ffcc22', glow: 'rgba(255,204,34,0.5)', icon: '*', label: 'ALL' },
};

// ─── Pixel drawing core ─────────────────────────────
function px(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), s, s);
}

/** Draw a grid of pixels from a compact string map.
 *  map: array of strings, each char = one pixel.
 *  palette: { char: '#color', ... }. Space = transparent.
 */
function drawPixelMap(ctx, cx, cy, ps, map, palette) {
  const rows = map.length;
  const cols = map[0].length;
  const ox = cx - (cols * ps) / 2;
  const oy = cy - (rows * ps) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = map[r][c];
      if (ch === ' ' || ch === '.') continue;
      const color = palette[ch];
      if (color) px(ctx, ox + c * ps, oy + r * ps, ps, color);
    }
  }
}

// ─── Player Spaceship + Character Head ───────────────
// 16x20 pixel ship with character head visible in cockpit

const SHIP_MAP = [
  '       HH       ',
  '      HHHH      ',
  '      HHHH      ',
  '     HHHHHH     ',
  '     HHHHHH     ',
  '    ..CCCC..    ',
  '   .ssCCCCss.   ',
  '  .ssssssssss.  ',
  ' .ssSSSSSSSss.  ',
  ' wSSSSSSSSSSSSw ',
  'wwSSSSSSSSSSSSww',
  'wWSSSSSSSSSSSSWw',
  ' WSSSSSSSSSSSSW ',
  ' WWSSSSSSSSSWW  ',
  '  WWWWWWWWWWWW  ',
  '   WWeeeeeWW    ',
  '    WeeEeeW     ',
  '     eEEEe      ',
];

function getCharHeadPalette(character) {
  const cc = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  return {
    // Head pixels
    'H': cc.body, 'h': cc.dark, 'E': cc.eye,
    'N': cc.nose || cc.accent || cc.dark,
    'L': cc.light || cc.body, 'A': cc.accent || cc.dark,
    'B': cc.belly || cc.light || '#ffffff',
  };
}

// Character-specific head maps (8x6 pixel heads that sit on top of ship)
const CHAR_HEADS = {
  dojocat: [
    ' hhAAhh ',
    'hAWWWWAh',
    'BBBBBBBB',
    'BBEWWEBB',
    'BBBNNBBB',
    'BB_BB_BB',
    ' BBBBBB ',
  ],
  buu: [
    '  TTT   ',
    '  TTTA  ',
    'BBBBBBBB',
    'BBEWWEBB',
    'BBBBBBBB',
    'BBB__BBB',
    ' BBBBBB ',
  ],
  devit: [
    'AA    AA',
    ' ABBBBA ',
    'BBBBBBBB',
    'BBEhhEBB',
    'BBBNNBBB',
    'BB_BB_BB',
    ' BBBBBB ',
  ],
  pixiu: [
    ' AAAAAA ',
    'ABBBBBBA',
    'BBBBBBBB',
    'BBEWWEBB',
    'BBBNNBBB',
    'hB_BB_Bh',
    ' BBBBBB ',
  ],
};

function buildShipPalette(character) {
  const headP = getCharHeadPalette(character);
  return {
    ...headP,
    's': SHIP_COLORS.hull, 'S': SHIP_COLORS.hullLight, '.': SHIP_COLORS.hullDark,
    'C': SHIP_COLORS.cockpit, 'c': SHIP_COLORS.cockpitGlow,
    'w': SHIP_COLORS.wing, 'W': SHIP_COLORS.wingTip,
    'e': SHIP_COLORS.engine, 'G': SHIP_COLORS.engineGlow,
    't': SHIP_COLORS.trim, '_': '#444444',
  };
}

// Build the full ship map with character head inserted
function buildShipWithHead(character) {
  const headMap = CHAR_HEADS[character] || CHAR_HEADS.dojocat;
  // Replace generic 'H' rows in ship map with character head
  const fullMap = [...SHIP_MAP];
  // Head occupies rows 0-6 (top of ship)
  const headStart = 0;
  for (let r = 0; r < headMap.length && r + headStart < fullMap.length; r++) {
    const headRow = headMap[r];
    const shipRow = fullMap[r + headStart];
    // Center head in ship row
    const padL = Math.floor((shipRow.length - headRow.length) / 2);
    let merged = '';
    for (let c = 0; c < shipRow.length; c++) {
      const hc = c - padL;
      if (hc >= 0 && hc < headRow.length && headRow[hc] !== ' ') {
        merged += headRow[hc];
      } else {
        merged += shipRow[c];
      }
    }
    fullMap[r + headStart] = merged;
  }
  return fullMap;
}

export function drawPlayerPet(ctx, x, y, size, character, firing) {
  const ps = Math.max(1, Math.round(size / 16));
  const shipMap = buildShipWithHead(character);
  const palette = buildShipPalette(character);

  drawPixelMap(ctx, x, y, ps, shipMap, palette);

  // Engine flame animation
  if (firing) {
    const flameColors = ['#ff4400', '#ff8844', '#ffcc66', '#ffffff'];
    const fh = ps * 2;
    const fw = ps * 3;
    const fy = y + (shipMap.length * ps) / 2;
    for (let i = 0; i < 3; i++) {
      const fx = x - fw / 2 + i * ps;
      const color = flameColors[Math.floor(Math.random() * flameColors.length)];
      px(ctx, fx, fy, ps, color);
      px(ctx, fx, fy + ps, ps, flameColors[Math.floor(Math.random() * 2)]);
    }
  }

  // Muzzle flash when firing
  if (firing) {
    ctx.save();
    ctx.shadowColor = '#88eeff';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    const muzzleY = y - (shipMap.length * ps) / 2 - ps;
    px(ctx, x - ps / 2, muzzleY, ps, '#ffffff');
    px(ctx, x - ps / 2, muzzleY - ps, ps, '#88eeff');
    ctx.restore();
  }
}

// ─── Pixel-Art Fodder Enemies ────────────────────────

const JELLY_MAP = [
  '  .OOO.  ',
  ' .OOOOO. ',
  '.OOLLLOO.',
  'OOELOELO.',
  'OOOOOOOO ',
  '.OO__OO. ',
  ' .O..O.  ',
  '  .  .   ',
];

const BAT_MAP = [
  'W.    .W',
  'WW.  .WW',
  'WWWBBWWW',
  '.WBEEBW.',
  ' .BBBB. ',
  '  BPPB  ',
  '  .BB.  ',
  '   ..   ',
];

const ROBOT_MAP = [
  '   .A.   ',
  '  .DDD.  ',
  ' .DDDDD. ',
  ' DDEEDED ',
  ' DDDDDDD ',
  ' .DAAAD. ',
  '  .DDD.  ',
  '   .D.   ',
];

const CLOUD_MAP = [
  '  .CC.CC.  ',
  ' .CCCCCCC. ',
  '.CCCCCCCCC.',
  'CCCEPPECCC ',
  '.CCCCCCCCC.',
  ' .CCCCCCC. ',
  '  ..CCC..  ',
];

const SLIME_MAP = [
  '  .OOOO.  ',
  ' .OLLOOO. ',
  '.OOEPOEO. ',
  'OOOOOOOO  ',
  '.OO__OO.  ',
  ' .OOOO.   ',
  '  ....    ',
];

const STAR_MAP = [
  '   .O.   ',
  '  .OOO.  ',
  '..OOOOO..',
  'OOOEOEOOO',
  '.OOOOOOO.',
  ' .OOOOO. ',
  '.OO. .OO.',
  'O.     .O',
];

function getEnemyPalette(type) {
  const ec = ENEMY_COLORS[type];
  if (!ec) return {};
  return {
    'O': ec.body, 'D': ec.body, 'C': ec.body,
    '.': ec.dark, 'L': ec.light,
    'E': ec.eye, 'P': ec.pupil, '_': ec.outline,
    'A': ec.accent || ec.dark, 'W': ec.wing || ec.body,
    'B': ec.body,
  };
}

const ENEMY_MAPS = {
  jelly: JELLY_MAP, bat: BAT_MAP, robot: ROBOT_MAP,
  cloud: CLOUD_MAP, slime: SLIME_MAP, star: STAR_MAP,
};

export function drawEnemy(ctx, x, y, size, type, animFrame, hp, maxHp) {
  const map = ENEMY_MAPS[type];
  if (!map) return;
  const palette = getEnemyPalette(type);
  const ps = Math.max(1, Math.round(size / (map[0].length)));

  // Animate: bob/wobble
  const bobY = type === 'cloud' ? Math.sin(animFrame * 0.08) * 2 : 0;
  const wobbleX = type === 'bat' ? Math.sin(animFrame * 0.12) * 1.5 : 0;

  drawPixelMap(ctx, x + wobbleX, y + bobY, ps, map, palette);

  // HP bar for multi-hit enemies
  if (maxHp > 1 && hp > 0) {
    const barW = size * 0.9;
    const barH = 3;
    const barX = x - barW / 2;
    const barY = y - (map.length * ps) / 2 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = hp / maxHp > 0.5 ? '#44ff88' : '#ff6644';
    ctx.fillRect(barX, barY, barW * (hp / maxHp), barH);
  }
}

// ─── Pixel-Art Boss Sprites ─────────────────────────
// Bosses are 14x14+ pixel grids, much larger on screen

const BOSS_LABUBU_MAP = [
  '  ee      ee   ',
  ' eeAA    AAee  ',
  ' eAAAA  AAAAe  ',
  '  .BBBBBBBB.   ',
  ' .BBBBBBBBBB.  ',
  ' .BBBWEEPBBB.  ',
  ' .BBBBBBBBBB.  ',
  ' .BBB____BBB.  ',
  '  .BBAAAABB.   ',
  '   .BBBBBB.    ',
  '   .BB..BB.    ',
  '    B.  .B     ',
];

const BOSS_BUU_MAP = [
  '      TT        ',
  '     TTTT       ',
  '    TTAAAT      ',
  '   .TTAAAT.     ',
  '   .BBBBBB.     ',
  '  .BBBBBBBB.    ',
  ' .BBBWEEPBBB.   ',
  ' .BBBBBBBBBB.   ',
  ' .BBBBNNBBBB.   ',
  '  .BBB__BBB.    ',
  '   .BBBBBB.     ',
  '   .BB..BB.     ',
];

const BOSS_DOJOCAT_MAP = [
  '   eeAAee       ',
  '  eeAWWAee      ',
  '   eWWWWWe      ',
  '   .BBBBBB.     ',
  '  .BBBBBBBB.    ',
  ' .BBBWEEPBBB.   ',
  ' .BBBBBBBBBB.   ',
  ' .BBBBNNBBBB.   ',
  '  .BBB__BBB.    ',
  '   .BLLLLB.     ',
  '    .BBBB.      ',
  '   .BB..BB.     ',
];

const BOSS_PIXIU_MAP = [
  '    MMMMMM      ',
  '   MMBBBBMM     ',
  '  .BBBBBBBB.    ',
  ' .BBBWEEPBBB.   ',
  ' .BBBBBBBBBB.   ',
  ' .BBBBNNBBBB.   ',
  '  hBBLBBLBBh    ',
  '   .BBBBBB.     ',
  '  h.MBBBBM.h    ',
  '   .BB..BB.     ',
  '    B.  .B      ',
];

const BOSS_VEGETACAT_MAP = [
  '     HHHH       ',
  '   HHHHHHH      ',
  '  HHHHHHHHH     ',
  '   .BBBBBB.     ',
  '  .BBBBBBBB.    ',
  ' .BBBPEEWBBB.   ',
  ' .BBBBBBBBBB.   ',
  ' .RBBBNNBBBR.   ',
  '  .RBB__BBR.    ',
  '   .RBBBBR.     ',
  '    .BBBB.      ',
  '   .BB..BB.     ',
];

function getBossPalette(type) {
  const bc = BOSS_COLORS[type];
  if (!bc) return {};
  return {
    'B': bc.body, '.': bc.dark, 'L': bc.light,
    'E': bc.eye, 'P': bc.eye, 'W': '#ffffff',
    '_': '#555555', 'A': bc.accent, 'N': bc.accent || bc.dark,
    'e': bc.ear || bc.light || bc.body,
    'M': bc.mane || bc.accent,
    'H': bc.hair || bc.accent,
    'R': bc.armor || bc.dark,
    'h': bc.whisker || bc.dark,
    'T': bc.tentacle || bc.accent || bc.dark,
  };
}

const BOSS_MAPS = {
  labubu: BOSS_LABUBU_MAP, buu: BOSS_BUU_MAP, dojocat: BOSS_DOJOCAT_MAP,
  pixiu: BOSS_PIXIU_MAP, vegetacat: BOSS_VEGETACAT_MAP,
};

export function drawBoss(ctx, x, y, size, type, animFrame, hp, maxHp) {
  const map = BOSS_MAPS[type];
  if (!map) return;
  const palette = getBossPalette(type);
  const ps = Math.max(1, Math.round(size / map[0].length));
  const pulse = Math.sin(animFrame * 0.06) * 1.5;

  // Boss aura glow
  const bc = BOSS_COLORS[type];
  if (bc) {
    ctx.save();
    ctx.shadowColor = bc.accent;
    ctx.shadowBlur = 8 + pulse * 3;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.restore();
  }

  drawPixelMap(ctx, x, y + pulse, ps, map, palette);

  // HP bar
  if (maxHp > 0) {
    const barW = size * 1.3;
    const barH = 5;
    const barX = x - barW / 2;
    const barY = y - (map.length * ps) / 2 - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    const pct = hp / maxHp;
    ctx.fillStyle = pct > 0.5 ? '#44ff88' : pct > 0.25 ? '#ffcc22' : '#ff4455';
    ctx.fillRect(barX, barY, barW * pct, barH);
    // Boss name
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(type.toUpperCase(), x, barY - 3);
  }
}

// ─── Tiered Projectiles ─────────────────────────────
// power 0=basic, 1=enhanced, 2=strong, 3=mega, 4+=ultra

export function drawProjectile(ctx, x, y, type, powerLevel) {
  if (type === 'player') {
    ctx.save();
    if (powerLevel <= 0) {
      // Basic: thin green bolt
      ctx.shadowColor = '#44ff88';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#44ff88';
      ctx.fillRect(x - 1, y - 4, 2, 8);
      ctx.fillStyle = '#aaffcc';
      ctx.fillRect(x - 0.5, y - 3, 1, 6);
    } else if (powerLevel === 1) {
      // Enhanced: wider cyan bolt
      ctx.shadowColor = '#44ddff';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#44ddff';
      ctx.fillRect(x - 1.5, y - 5, 3, 10);
      ctx.fillStyle = '#aaeeff';
      ctx.fillRect(x - 0.5, y - 4, 1, 8);
    } else if (powerLevel === 2) {
      // Strong: fat pink-white bolt with trail
      ctx.shadowColor = '#ff88ff';
      ctx.shadowBlur = 7;
      ctx.fillStyle = '#ff66cc';
      ctx.fillRect(x - 2, y - 6, 4, 12);
      ctx.fillStyle = '#ffaaee';
      ctx.fillRect(x - 1, y - 5, 2, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 0.5, y - 4, 1, 8);
    } else if (powerLevel === 3) {
      // Mega: orange plasma orb
      ctx.shadowColor = '#ffaa22';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff8822';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffcc66';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    } else {
      // Ultra (4+): huge spinning star projectile
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      const angle = Date.now() * 0.01;
      ctx.fillStyle = '#ffdd44';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = angle + (i * Math.PI) / 2;
        ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
        ctx.lineTo(x + Math.cos(a + Math.PI / 4) * 2, y + Math.sin(a + Math.PI / 4) * 2);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  } else if (type === 'enemy') {
    ctx.save();
    ctx.shadowColor = '#ff4455';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ff4455';
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    ctx.fillStyle = '#ff8888';
    ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
    ctx.restore();
  } else if (type === 'boss') {
    ctx.save();
    ctx.shadowColor = '#ff22cc';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff44dd';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffaaee';
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ─── Power-ups (pixel-art crates) ───────────────────
const CRATE_MAP = [
  '...........',
  '.LLLLLLLLL.',
  '.LFFFFFFFL.',
  '.LFFIIIFFL.',
  '.LFFFFFFFL.',
  '.LLLLLLLLL.',
  '...........',
];

export function drawPowerUp(ctx, x, y, type, animFrame) {
  const pc = POWER_UP_COLORS[type];
  if (!pc) return;
  const ps = 2;
  const bob = Math.sin((animFrame || 0) * 0.1) * 2;

  ctx.save();
  ctx.shadowColor = pc.glow;
  ctx.shadowBlur = 8;

  const palette = {
    '.': '#333333', 'L': '#555555',
    'F': pc.fill, 'I': '#ffffff',
  };

  drawPixelMap(ctx, x, y + bob, ps, CRATE_MAP, palette);

  // Icon letter
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pc.icon, x, y + bob);

  ctx.restore();
}

// ─── Explosions ──────────────────────────────────────
export function drawExplosion(ctx, x, y, progress, size, color) {
  const r = size * (0.5 + progress * 1.5);
  const alpha = 1 - progress;
  ctx.save();

  // Pixel particle burst
  const particleCount = 8;
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + progress * 1.5;
    const dist = r * progress;
    const pxX = x + Math.cos(angle) * dist;
    const pxY = y + Math.sin(angle) * dist;
    const pSize = Math.max(1, 3 * (1 - progress));
    ctx.fillStyle = i % 2 === 0
      ? `rgba(255,255,255,${alpha})`
      : (color || `rgba(255,180,80,${alpha})`);
    ctx.fillRect(pxX - pSize / 2, pxY - pSize / 2, pSize, pSize);
  }

  // Center flash
  if (progress < 0.3) {
    const flashAlpha = (0.3 - progress) / 0.3;
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.8})`;
    const flashR = r * 0.4;
    ctx.fillRect(x - flashR, y - flashR, flashR * 2, flashR * 2);
  }

  ctx.restore();
}

// ─── Damage flash ────────────────────────────────────
export function drawDamageFlash(ctx, w, h, progress) {
  const alpha = (1 - progress) * 0.3;
  ctx.fillStyle = `rgba(255,50,50,${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

// ─── HUD ─────────────────────────────────────────────
export function drawHUD(ctx, w, score, lives, wave, activeBuffs) {
  ctx.save();
  // Score — top right
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(score), w - 12, 24);
  ctx.font = '600 9px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('SCORE', w - 12, 34);

  // Wave — top center
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px system-ui';
  ctx.fillStyle = '#66bbff';
  ctx.fillText(`WAVE ${wave}`, w / 2, 20);

  // Lives — top left, pixel hearts
  ctx.textAlign = 'left';
  for (let i = 0; i < lives; i++) {
    const hx = 10 + i * 18, hy = 12;
    ctx.fillStyle = '#ff4466';
    // Pixel heart: 5x4
    ctx.fillRect(hx + 1, hy, 2, 1); ctx.fillRect(hx + 4, hy, 2, 1);
    ctx.fillRect(hx, hy + 1, 7, 1);
    ctx.fillRect(hx + 1, hy + 2, 5, 1);
    ctx.fillRect(hx + 2, hy + 3, 3, 1);
    ctx.fillRect(hx + 3, hy + 4, 1, 1);
  }

  // Active power-up indicators
  if (activeBuffs && activeBuffs.length > 0) {
    const buffY = 42;
    activeBuffs.forEach((buff, i) => {
      const pc = POWER_UP_COLORS[buff.type];
      if (!pc) return;
      const bx = 10 + i * 32;
      ctx.fillStyle = pc.fill;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.roundRect(bx, buffY, 28, 16, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(pc.label, bx + 14, buffY + 10);
      // Timer bar
      const pct = buff.remaining / buff.duration;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(bx, buffY + 16, 28 * pct, 2);
    });
  }

  ctx.restore();
}

// ─── Wave banner ─────────────────────────────────────
export function drawWaveBanner(ctx, w, h, text, progress) {
  const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '900 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#4488ff';
  ctx.shadowBlur = 15;
  ctx.fillText(text, w / 2, h * 0.35);
  ctx.restore();
}

// ─── Boss warning banner ─────────────────────────────
export function drawBossWarningBanner(ctx, w, h, bossType, progress) {
  const alpha = Math.sin(progress * Math.PI * 3) * 0.5 + 0.5;
  ctx.save();
  ctx.globalAlpha = alpha * (progress < 0.8 ? 1 : (1 - progress) / 0.2);
  ctx.font = '900 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff4455';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 20;
  ctx.fillText('WARNING', w / 2, h * 0.30);
  ctx.font = '700 14px system-ui';
  ctx.fillStyle = '#ffcc22';
  ctx.fillText(`BOSS: ${(bossType || '').toUpperCase()}`, w / 2, h * 0.38);
  ctx.restore();
}

// ─── Star field background ──────────────────────────
let _stars = null;

export function drawStarfield(ctx, w, h, scrollOffset) {
  if (!_stars || _stars.w !== w || _stars.h !== h) {
    const stars = [];
    for (let i = 0; i < 100; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() < 0.7 ? 1 : 2,
        speed: Math.random() * 0.5 + 0.15,
        brightness: Math.random() * 0.6 + 0.2,
      });
    }
    _stars = { w, h, stars };
  }

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#020408');
  grad.addColorStop(0.5, '#060c14');
  grad.addColorStop(1, '#040810');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Stars as pixel dots
  _stars.stars.forEach(star => {
    const sy = (star.y + scrollOffset * star.speed * 30) % h;
    ctx.fillStyle = `rgba(200,220,255,${star.brightness})`;
    ctx.fillRect(Math.round(star.x), Math.round(sy), star.size, star.size);
  });
}

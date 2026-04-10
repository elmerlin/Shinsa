import { CHAR_COLORS, drawPet } from './miniPumpSprites';

const SMB_PALETTE = {
  sky: '#5C94FC',
  skyDeep: '#3B67C7',
  cloud: '#FCFCFC',
  cloudShadow: '#BCBCBC',
  grass: '#00A800',
  grassDark: '#005800',
  grassShadow: '#003d00',
  dirt: '#C84C0C',
  dirtDark: '#A02800',
  dirtLight: '#df6d2d',
  brick: '#C84C0C',
  brickDark: '#7C2000',
  gold: '#FCB838',
  red: '#E40058',
  black: '#151515',
  white: '#ffffff',
  purple: '#4A2268',
};

function px(ctx, x, y, size, color, alpha = 1) {
  if (!color) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
  ctx.restore();
}

function drawPixelMap(ctx, x, y, ps, rows, palette, alpha = 1) {
  rows.forEach((row, rowIndex) => {
    row.split('').forEach((cell, colIndex) => {
      if (cell === ' ') return;
      px(ctx, x + colIndex * ps, y + rowIndex * ps, ps, palette[cell], alpha);
    });
  });
}

function drawPixelEllipse(ctx, cx, cy, rx, ry, ps, color, alpha = 1) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx / Math.max(1, rx)) ** 2 + (dy / Math.max(1, ry)) ** 2 <= 1) {
        px(ctx, cx + dx * ps, cy + dy * ps, ps, color, alpha);
      }
    }
  }
}

const PLAYER_FRAMES = {
  meatshield: {
    walk1: ['  oooo  ', ' oyyyyo ', 'oyyyyyyo', 'oywyywyo', 'oyyyyyyo', ' oyyyyo ', '  yyy   ', '  y yy  '],
    walk2: ['  oooo  ', ' oyyyyo ', 'oyyyyyyo', 'oywyywyo', 'oyyyyyyo', ' oyyyyo ', '  yy y  ', ' yy  y  '],
    attack: ['  oooo  ', ' oyyyyo ', 'oyyyyyyo', 'oywyywyo', 'oyyyyyyo', ' oyyyyo ', '  yyyyss', '  y  s  '],
  },
  brawler: {
    walk1: ['  ooooo   ', ' oyyyyyo  ', 'oyyyyyyyyo', 'oywyywyyyo', 'oyyyyyyyyo', ' oyyyyyoo ', '  yyyyy   ', ' yy  yy   '],
    walk2: ['  ooooo   ', ' oyyyyyo  ', 'oyyyyyyyyo', 'oywyywyyyo', 'oyyyyyyyyo', ' oyyyyyoo ', '  yyyyy   ', '  yy  yy  '],
    attack: ['  ooooo ss', ' oyyyyyss ', 'oyyyyyyyy ', 'oywyywyyy ', 'oyyyyyyyy ', ' oyyyyyoo ', '  yyyyy   ', '  yy  yy  '],
  },
  ranged: {
    walk1: ['   oooo  ', '  oyyyyo ', ' oyyyyyyo', ' oywyywyo', ' oyyyyyyo', '  oyyyyo ', '   yyyss ', '  yy  s  '],
    walk2: ['   oooo  ', '  oyyyyo ', ' oyyyyyyo', ' oywyywyo', ' oyyyyyyo', '  oyyyyo ', '   yy ys ', '  y  y   '],
    attack: ['   oooo tt', '  oyyyytt ', ' oyyyyyyo ', ' oywyywyo ', ' oyyyyyyo ', '  oyyyyo ', '   yyyy  ', '   y  y  '],
  },
};

const ENEMY_FRAMES = {
  basic: {
    walk1: ['  dddd  ', ' ddppdd ', 'ddppppdd', 'ddwddwdd', ' ddppdd ', '  ddd   ', ' d d d  '],
    walk2: ['  dddd  ', ' ddppdd ', 'ddppppdd', 'ddwddwdd', ' ddppdd ', '  ddd   ', 'd d d   '],
    attack: ['  dddd  ', ' ddppdd ', 'ddppppdd', 'ddwddwdd', ' ddppddx', '  ddd x ', ' d d d  '],
  },
  bruiser: {
    walk1: ['  dddddd  ', ' dppppppd ', 'ddppppppdd', 'ddwwppwwdd', 'ddppppppdd', ' dppppppd ', '  dddd dd ', ' dd   dd  '],
    walk2: ['  dddddd  ', ' dppppppd ', 'ddppppppdd', 'ddwwppwwdd', 'ddppppppdd', ' dppppppd ', '  ddd ddd ', ' d d   dd '],
    attack: ['  ddddddxx', ' dppppppxx', 'ddppppppdd', 'ddwwppwwdd', 'ddppppppdd', ' dppppppd ', '  dddd dd ', ' dd   dd  '],
  },
  sniper: {
    walk1: ['  dddd  ', ' ddppdd ', 'ddppppdd', 'ddwddwdd', ' ddppddt', '  ddd tt', ' d d d  '],
    walk2: ['  dddd  ', ' ddppdd ', 'ddppppdd', 'ddwddwdd', ' ddppddt', '  dddt t', 'd d d   '],
    attack: ['  dddd tt', ' ddppddt ', 'ddppppdd ', 'ddwddwdd ', ' ddppdd  ', '  ddd    ', ' d d d   '],
  },
  tank: {
    walk1: ['  ppppppp  ', ' ppdddddpp ', 'ppdddddddpp', 'ppdwwdwwdpp', 'ppdddddddpp', ' ppdddddpp ', '  ppppppp  ', ' ddd   ddd '],
    walk2: ['  ppppppp  ', ' ppdddddpp ', 'ppdddddddpp', 'ppdwwdwwdpp', 'ppdddddddpp', ' ppdddddpp ', '  ppppppp  ', 'ddd   ddd  '],
    attack: ['  pppppppxx', ' ppdddddxx ', 'ppdddddddpp', 'ppdwwdwwdpp', 'ppdddddddpp', ' ppdddddpp ', '  ppppppp  ', ' ddd   ddd '],
  },
  boss: {
    walk1: ['   ppppppppp   ', '  ppdddddddpp  ', ' ppdddddddddpp ', 'ppddwwdddwwddpp', 'ppdddddddddddpp', 'ppdddpdddppddpp', ' ppdddddddddpp ', '  ppppddpppp   ', ' ddd ddd ddd   '],
    walk2: ['   ppppppppp   ', '  ppdddddddpp  ', ' ppdddddddddpp ', 'ppddwwdddwwddpp', 'ppdddddddddddpp', 'ppdddpdddppddpp', ' ppdddddddddpp ', '  ppppddpppp   ', 'ddd  ddd  ddd  '],
    attack: ['   pppppppppxx ', '  ppdddddddxx  ', ' ppdddddddddpp ', 'ppddwwdddwwddpp', 'ppdddddddddddpp', 'ppdddpdddppddpp', ' ppdddddddddpp ', '  ppppddpppp   ', ' ddd ddd ddd   '],
  },
};

function playerPalette(character) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  return {
    o: colors.outline,
    y: colors.body,
    w: colors.eye,
    s: colors.accent,
    t: colors.light,
  };
}

const ENEMY_PALETTE = {
  d: SMB_PALETTE.brickDark,
  p: SMB_PALETTE.purple,
  w: SMB_PALETTE.white,
  x: SMB_PALETTE.gold,
  t: '#7fb3ff',
};

const LANE_HEIGHT = 7;

export function getBattlefieldGroundY(h) {
  return Math.min(h * 0.685, h - 126);
}

function drawCloud(ctx, x, y, scale) {
  const ps = Math.max(2, Math.round(scale));
  drawPixelEllipse(ctx, x, y, 6, 3, ps, SMB_PALETTE.cloudShadow);
  drawPixelEllipse(ctx, x - ps * 2, y - ps, 5, 3, ps, SMB_PALETTE.cloud);
  drawPixelEllipse(ctx, x + ps * 3, y, 4, 3, ps, SMB_PALETTE.cloud);
  drawPixelEllipse(ctx, x, y + ps, 7, 3, ps, SMB_PALETTE.cloud);
  drawPixelEllipse(ctx, x - ps * 2, y - ps, 2, 1, ps, SMB_PALETTE.white);
  drawPixelEllipse(ctx, x + ps * 2, y, 2, 1, ps, 'rgba(255,255,255,0.7)');
  drawPixelEllipse(ctx, x + ps * 4, y + ps, 2, 1, ps, 'rgba(188,188,188,0.95)');
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x - 5 * ps, y + 3 * ps, 8 * ps, ps);
}

function drawHill(ctx, x, y, width, height) {
  ctx.fillStyle = SMB_PALETTE.grassDark;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + width * 0.3, y - height, x + width * 0.5, y - height * 0.85);
  ctx.quadraticCurveTo(x + width * 0.7, y - height * 0.55, x + width, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(6, 96, 16, 0.5)';
  ctx.beginPath();
  ctx.moveTo(x + width * 0.18, y);
  ctx.quadraticCurveTo(x + width * 0.34, y - height * 0.62, x + width * 0.54, y - height * 0.48);
  ctx.quadraticCurveTo(x + width * 0.7, y - height * 0.36, x + width * 0.84, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(x + width * 0.24, y - height * 0.18);
  ctx.quadraticCurveTo(x + width * 0.42, y - height * 0.62, x + width * 0.58, y - height * 0.26);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(x + width * 0.58, y - height * 0.2);
  ctx.quadraticCurveTo(x + width * 0.76, y - height * 0.54, x + width * 0.9, y - height * 0.06);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.stroke();
}

export function drawBattlefield(ctx, w, h, state, reducedMotion) {
  const groundY = getBattlefieldGroundY(h);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0, '#739dff');
  skyGrad.addColorStop(0.7, SMB_PALETTE.sky);
  skyGrad.addColorStop(1, '#4e84ea');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, groundY + 20);

  const drift = reducedMotion ? 0 : (state.cameraX || 0) * 0.25;
  for (let i = -1; i < 4; i++) {
    drawCloud(ctx, ((i * 190) - drift * 5) % (w + 260) - 80, 54 + (i % 2) * 24, 4);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 9; i++) {
    const sparkleX = ((i * 113) - drift * 3.2) % (w + 140);
    ctx.fillRect(sparkleX, 28 + (i % 3) * 18, 3, 3);
    ctx.fillRect(sparkleX + 5, 29 + (i % 2) * 16, 2, 2);
  }

  for (let i = -1; i < 4; i++) {
    drawHill(ctx, i * 176 - drift * 2, groundY, 228, 96 - (i % 2) * 16);
  }

  ctx.fillStyle = SMB_PALETTE.grassDark;
  ctx.fillRect(0, groundY - 4, w, 18);
  ctx.fillStyle = SMB_PALETTE.grass;
  ctx.fillRect(0, groundY, w, 10);
  ctx.fillStyle = '#29d129';
  ctx.fillRect(0, groundY + 2, w, 2);
  ctx.fillStyle = SMB_PALETTE.grassShadow;
  ctx.fillRect(0, groundY + 10, w, 4);
  ctx.fillStyle = SMB_PALETTE.dirtLight;
  ctx.fillRect(0, groundY + 14, w, h - groundY - 14);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, groundY + 14, w, 3);
  ctx.fillStyle = 'rgba(124,32,0,0.3)';
  ctx.fillRect(0, groundY + 17, w, 6);

  const brickW = 26;
  const brickH = 16;
  for (let y = groundY + 24; y < h; y += brickH) {
    for (let x = ((Math.floor(y / brickH) % 2) * (brickW / 2)) - brickW; x < w + brickW; x += brickW) {
      ctx.fillStyle = SMB_PALETTE.dirt;
      ctx.fillRect(x, y, brickW - 2, brickH - 2);
      ctx.fillStyle = SMB_PALETTE.dirtDark;
      ctx.fillRect(x + 2, y + brickH - 6, brickW - 8, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 2, y + 2, brickW - 9, 2);
    }
  }
}

function drawCastle(ctx, x, y, scale, mainColor, darkColor, flagColor, hpRatio, facingLeft = false) {
  const ps = Math.max(2, Math.round(scale));
  const baseW = 18 * ps;
  const baseH = 20 * ps;
  const left = x - baseW / 2;
  const top = y - baseH;

  ctx.fillStyle = darkColor;
  ctx.fillRect(left, top + 3 * ps, baseW, baseH - 3 * ps);
  ctx.fillStyle = mainColor;
  ctx.fillRect(left + ps, top + 4 * ps, baseW - 2 * ps, baseH - 4 * ps);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(left + 2 * ps, top + 5 * ps, baseW * 0.45, 2 * ps);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(left + baseW * 0.58, top + 4 * ps, baseW * 0.22, baseH - 6 * ps);
  ctx.fillStyle = darkColor;
  ctx.fillRect(left + 4 * ps, top + 11 * ps, 4 * ps, 8 * ps);
  ctx.fillRect(left + 10 * ps, top + 11 * ps, 4 * ps, 8 * ps);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = darkColor;
    ctx.fillRect(left + (i * 4 + 1) * ps, top, 3 * ps, 4 * ps);
  }
  for (let row = 0; row < 3; row++) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(left + 2 * ps, top + (row * 4 + 6) * ps, baseW * 0.28, ps);
  }

  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    ctx.beginPath();
    ctx.moveTo(left + ps, top + (row * 4 + 6) * ps);
    ctx.lineTo(left + baseW - ps, top + (row * 4 + 6) * ps);
    ctx.stroke();
  }

  const poleX = facingLeft ? left + baseW - 3 * ps : left + 3 * ps;
  ctx.fillStyle = SMB_PALETTE.black;
  ctx.fillRect(poleX, top - 8 * ps, ps, 12 * ps);
  ctx.fillStyle = flagColor;
  ctx.beginPath();
  ctx.moveTo(poleX + ps, top - 8 * ps);
  ctx.lineTo(poleX + (facingLeft ? -5 : 5) * ps, top - 5 * ps);
  ctx.lineTo(poleX + ps, top - 2 * ps);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(left + 6 * ps, top + 7 * ps, 2 * ps, 2 * ps);
  ctx.fillRect(left + 11 * ps, top + 7 * ps, 2 * ps, 2 * ps);

  const barW = baseW;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(left, top - 14 * ps, barW, 3 * ps);
  ctx.fillStyle = hpRatio > 0.45 ? '#44dd66' : hpRatio > 0.2 ? SMB_PALETTE.gold : '#ff6666';
  ctx.fillRect(left, top - 14 * ps, barW * Math.max(0, Math.min(1, hpRatio)), 3 * ps);
}

export function drawPlayerBase(ctx, x, y, scale, character, hp, maxHp) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  drawCastle(ctx, x, y, scale, SMB_PALETTE.brick, SMB_PALETTE.brickDark, colors.accent, hp / Math.max(1, maxHp), false);
}

export function drawEnemyBase(ctx, x, y, scale, hp, maxHp) {
  drawCastle(ctx, x, y, scale, '#684180', '#2e163b', SMB_PALETTE.red, hp / Math.max(1, maxHp), true);
}

function unitFrame(unit, animFrame) {
  if (unit.attackFlash > 0) return 'attack';
  return Math.floor(animFrame / 10) % 2 === 0 ? 'walk1' : 'walk2';
}

function drawPlayerGear(ctx, x, y, ps, unit, character) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const dark = colors.dark || colors.outline;
  const accent = colors.accent;
  const light = colors.light;

  if (unit.type === 'meatshield') {
    ctx.fillStyle = accent;
    ctx.fillRect(x - 6 * ps, y - 16 * ps, 12 * ps, 2 * ps);
    ctx.fillStyle = light;
    ctx.fillRect(x + 4 * ps, y - 16 * ps, 2 * ps, 4 * ps);
  } else if (unit.type === 'brawler') {
    ctx.fillStyle = accent;
    ctx.fillRect(x - 11 * ps, y - 2 * ps, 3 * ps, 4 * ps);
    ctx.fillRect(x + 8 * ps, y - 2 * ps, 3 * ps, 4 * ps);
    ctx.fillStyle = dark;
    ctx.fillRect(x - 10 * ps, y - 1 * ps, ps, 2 * ps);
    ctx.fillRect(x + 9 * ps, y - 1 * ps, ps, 2 * ps);
  } else if (unit.type === 'ranged') {
    ctx.fillStyle = dark;
    ctx.fillRect(x + 8 * ps, y - 15 * ps, ps, 13 * ps);
    ctx.fillStyle = accent;
    ctx.fillRect(x + 6 * ps, y - 14 * ps, 5 * ps, 2 * ps);
    ctx.fillStyle = light;
    ctx.fillRect(x + 5 * ps, y - 7 * ps, 7 * ps, 2 * ps);
  } else if (unit.type === 'tank') {
    ctx.fillStyle = dark;
    ctx.fillRect(x - 11 * ps, y - 6 * ps, 22 * ps, 5 * ps);
    ctx.fillRect(x - 12 * ps, y - 14 * ps, 5 * ps, 10 * ps);
    ctx.fillRect(x + 7 * ps, y - 14 * ps, 5 * ps, 10 * ps);
    ctx.fillStyle = accent;
    ctx.fillRect(x - 10 * ps, y - 5 * ps, 20 * ps, 3 * ps);
    ctx.fillRect(x - 9 * ps, y - 13 * ps, 3 * ps, 7 * ps);
    ctx.fillRect(x + 6 * ps, y - 13 * ps, 3 * ps, 7 * ps);
  }
}

export function drawPlayerUnit(ctx, unit, x, groundY, scale, character, animFrame) {
  const laneLift = (unit.renderLane || 0) * LANE_HEIGHT;
  const unitScaleMap = { meatshield: 0.48, brawler: 0.56, ranged: 0.53, tank: 0.72 };
  const unitPs = Math.max(2, scale * (unitScaleMap[unit.type] || 0.5));
  const baseY = groundY - laneLift - 15 * unitPs;

  drawPet(
    ctx,
    x,
    baseY,
    unitPs,
    character,
    unit.attackFlash > 0 ? 'laser_fire' : (Math.floor(animFrame / 8) % 2 === 0 ? 'step_red' : 'step_blue'),
    unit.attackFlash > 0 ? 'focused' : unit.type === 'tank' ? 'proud' : 'soft',
  );
  drawPlayerGear(ctx, x, groundY - laneLift - 1.5 * unitPs, unitPs, unit, character);

  const barW = Math.max(24, unitPs * 18);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - barW / 2, groundY - laneLift - 33 * unitPs / 3, barW, 3);
  ctx.fillStyle = '#58e17c';
  ctx.fillRect(x - barW / 2, groundY - laneLift - 33 * unitPs / 3, barW * (unit.hp / Math.max(1, unit.maxHp)), 3);
}

export function drawEnemyUnit(ctx, unit, x, groundY, scale, animFrame) {
  const laneLift = (unit.renderLane || 0) * LANE_HEIGHT;
  const ps = Math.max(2, Math.round(scale * 0.9));
  const frame = ENEMY_FRAMES[unit.type]?.[unitFrame(unit, animFrame)] || ENEMY_FRAMES.basic.walk1;
  drawPixelEllipse(ctx, x, groundY - laneLift - 1, Math.max(4, ps * 2.8), 1, 1, 'rgba(0,0,0,0.14)');
  drawPixelMap(ctx, x - (frame[0].length * ps) / 2, groundY - laneLift - frame.length * ps, ps, frame, ENEMY_PALETTE);
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.fillRect(x - frame[0].length * ps * 0.22, groundY - laneLift - frame.length * ps + ps * 1.4, frame[0].length * ps * 0.32, Math.max(2, ps));

  const barW = Math.max(18, ps * 9);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x - barW / 2, groundY - laneLift - 24 * ps, barW, 3);
  ctx.fillStyle = '#ff8c7a';
  ctx.fillRect(x - barW / 2, groundY - laneLift - 24 * ps, barW * (unit.hp / Math.max(1, unit.maxHp)), 3);
}

export function drawProjectile(ctx, projectile, x, y, scale, character) {
  const ps = Math.max(2, Math.round(scale));
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  const fill = projectile.team === 'player' ? colors.accent : SMB_PALETTE.purple;
  ctx.fillStyle = fill;
  if (projectile.team === 'player' && projectile.kind === 'ranged') {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((projectile.dir || 1) * Math.PI * 0.25);
    ctx.fillRect(-ps, -3 * ps, 2 * ps, 6 * ps);
    ctx.fillRect(-3 * ps, -ps, 6 * ps, 2 * ps);
    ctx.restore();
  } else {
    drawPixelEllipse(ctx, x, y, 2, 2, ps, fill);
  }
}

export function drawExplosion(ctx, x, y, size, progress) {
  const radius = Math.max(6, size * (0.3 + progress * 0.8));
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress);
  ctx.fillStyle = progress < 0.5 ? SMB_PALETTE.gold : '#ff8a60';
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6 + progress;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * radius * 0.35, y + Math.sin(angle) * radius * 0.35, radius * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawDeathPoof(ctx, x, y, size, progress) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress);
  drawPixelEllipse(ctx, x - size * 0.2, y, 2, 2, Math.max(2, Math.round(size / 8)), SMB_PALETTE.cloud);
  drawPixelEllipse(ctx, x + size * 0.1, y - size * 0.15, 2, 2, Math.max(2, Math.round(size / 8)), SMB_PALETTE.cloudShadow);
  drawPixelEllipse(ctx, x + size * 0.25, y + size * 0.1, 2, 2, Math.max(2, Math.round(size / 8)), SMB_PALETTE.cloud);
  ctx.restore();
}

export function drawHUD(ctx, w, h, state) {
  const panelH = 34;
  ctx.fillStyle = 'rgba(8, 14, 28, 0.48)';
  ctx.fillRect(0, 0, w, panelH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`SCORE ${state.score}`, 12, 14);
  ctx.fillText(`STAGE ${state.stage}`, 12, 28);
  ctx.fillText(`WAVE ${state.wave}/${state.waveCount}`, 112, 14);
  ctx.fillText(`AURA ${Math.floor(state.aura)}/${state.auraMax}`, 112, 28);

  ctx.textAlign = 'right';
  ctx.fillText(`BASE ${Math.max(0, Math.ceil(state.playerBaseHp))}`, w - 12, 14);
  ctx.fillText(`FOES ${state.enemiesDefeated}`, w - 12, 28);
  ctx.textAlign = 'left';
}

export function drawSpawnButtons(ctx, x, y, width, state, character) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, width, 26);
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`READY ${Object.values(state.cooldowns || {}).filter((value) => value <= 0).length}/4`, x + 10, y + 17);
}

export function drawAuraMeter(ctx, x, y, width, aura, auraMax, auraLevel) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, width, 10);
  ctx.fillStyle = '#f7d55b';
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, aura / Math.max(1, auraMax))), 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`LV ${auraLevel}`, x + width + 8, y + 8);
}

export function drawStartScreen(ctx, w, h, character) {
  const colors = CHAR_COLORS[character] || CHAR_COLORS.dojocat;
  ctx.fillStyle = 'rgba(10, 12, 24, 0.48)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('PET BATTLE', w / 2, h * 0.2);
  ctx.fillStyle = colors.accent;
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('Deploy your pet army and crush the enemy castle', w / 2, h * 0.27);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillText('1-4 or QWER to spawn units', w / 2, h * 0.42);
  ctx.fillText('5 or U to upgrade aura income', w / 2, h * 0.47);
  ctx.fillText('Touch controls live below the battlefield', w / 2, h * 0.52);
  ctx.textAlign = 'left';
}

export function drawCountdown(ctx, w, h, label) {
  ctx.save();
  ctx.font = `900 ${label === 'GO!' ? 58 : 72}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = label === 'GO!' ? '#44ff88' : '#ffffff';
  ctx.shadowColor = label === 'GO!' ? '#44ff88' : '#0a2458';
  ctx.shadowBlur = 16;
  ctx.fillText(label, w / 2, h * 0.4);
  ctx.restore();
}

export function drawStageClearBanner(ctx, w, h, stage) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(w * 0.15, h * 0.28, w * 0.7, 64);
  ctx.strokeStyle = '#f7d55b';
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.15, h * 0.28, w * 0.7, 64);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`STAGE ${stage} CLEAR!`, w / 2, h * 0.28 + 26);
  ctx.fillStyle = '#f7d55b';
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('Marching to the next castle...', w / 2, h * 0.28 + 48);
  ctx.textAlign = 'left';
}

export function drawResults(ctx, w, h, state) {
  ctx.fillStyle = 'rgba(7, 10, 18, 0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(state.outcome === 'win' ? 'KINGDOM SAVED!' : 'CASTLE FALLEN', w / 2, h * 0.16);
  ctx.fillStyle = state.outcome === 'win' ? '#58e17c' : '#ff8a60';
  ctx.font = '900 46px system-ui, -apple-system, sans-serif';
  ctx.fillText(String(state.score), w / 2, h * 0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillText('SCORE', w / 2, h * 0.34);

  const lines = [
    `Stage reached: ${state.stageReached || state.stage}`,
    `Units spawned: ${state.unitsSpawned}`,
    `Enemies defeated: ${state.enemiesDefeated}`,
    `Bosses defeated: ${state.bossesDefeated}`,
  ];
  lines.forEach((line, index) => {
    ctx.fillStyle = index === 0 ? '#f7d55b' : 'rgba(255,255,255,0.84)';
    ctx.fillText(line, w / 2, h * 0.46 + index * 22);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Use the button below to play again', w / 2, h * 0.72);
  ctx.textAlign = 'left';
}

export { SMB_PALETTE };

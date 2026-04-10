import { CHAR_COLORS, drawPet } from './miniPumpSprites';

const SMB_PALETTE = {
  sky: '#5C94FC',
  cloud: '#FCFCFC',
  cloudShadow: '#BCBCBC',
  grass: '#00A800',
  grassDark: '#005800',
  dirt: '#C84C0C',
  dirtDark: '#A02800',
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

function drawCloud(ctx, x, y, scale) {
  const ps = Math.max(2, Math.round(scale));
  drawPixelEllipse(ctx, x, y, 6, 3, ps, SMB_PALETTE.cloudShadow);
  drawPixelEllipse(ctx, x - ps * 2, y - ps, 5, 3, ps, SMB_PALETTE.cloud);
  drawPixelEllipse(ctx, x + ps * 3, y, 4, 3, ps, SMB_PALETTE.cloud);
  drawPixelEllipse(ctx, x, y + ps, 7, 3, ps, SMB_PALETTE.cloud);
}

function drawHill(ctx, x, y, width, height) {
  ctx.fillStyle = SMB_PALETTE.grassDark;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + width * 0.3, y - height, x + width * 0.5, y - height * 0.85);
  ctx.quadraticCurveTo(x + width * 0.7, y - height * 0.55, x + width, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.stroke();
}

export function drawBattlefield(ctx, w, h, state, reducedMotion) {
  const groundY = h * 0.82;
  ctx.fillStyle = SMB_PALETTE.sky;
  ctx.fillRect(0, 0, w, h);

  const drift = reducedMotion ? 0 : (state.cameraX || 0) * 0.25;
  for (let i = -1; i < 4; i++) {
    drawCloud(ctx, ((i * 190) - drift * 5) % (w + 260) - 80, 60 + (i % 2) * 26, 3);
  }

  for (let i = -1; i < 4; i++) {
    drawHill(ctx, i * 180 - drift * 2, groundY, 220, 90 - (i % 2) * 18);
  }

  ctx.fillStyle = SMB_PALETTE.grass;
  ctx.fillRect(0, groundY, w, 12);
  ctx.fillStyle = SMB_PALETTE.grassDark;
  ctx.fillRect(0, groundY + 10, w, 3);
  ctx.fillStyle = SMB_PALETTE.dirt;
  ctx.fillRect(0, groundY + 12, w, h - groundY - 12);

  const brickW = 24;
  const brickH = 14;
  for (let y = groundY + 14; y < h; y += brickH) {
    for (let x = ((Math.floor(y / brickH) % 2) * (brickW / 2)) - brickW; x < w + brickW; x += brickW) {
      ctx.fillStyle = SMB_PALETTE.dirtDark;
      ctx.fillRect(x, y, brickW - 2, brickH - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 2, y + 2, brickW - 8, 2);
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
  ctx.fillStyle = darkColor;
  ctx.fillRect(left + 4 * ps, top + 11 * ps, 4 * ps, 8 * ps);
  ctx.fillRect(left + 10 * ps, top + 11 * ps, 4 * ps, 8 * ps);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = darkColor;
    ctx.fillRect(left + (i * 4 + 1) * ps, top, 3 * ps, 4 * ps);
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

export function drawPlayerUnit(ctx, unit, x, groundY, scale, character, animFrame) {
  const ps = Math.max(2, Math.round(scale));
  if (unit.type === 'tank') {
    ctx.save();
    ctx.translate(x, groundY - 11 * ps);
    drawPixelEllipse(ctx, 0, 9 * ps, 8, 4, ps, 'rgba(0,0,0,0.18)');
    drawPet(ctx, 0, 0, Math.max(1, ps * 0.42), character, unit.attackFlash > 0 ? 'laser_fire' : 'ready', unit.attackFlash > 0 ? 'focused' : 'celebrate');
    ctx.restore();
  } else {
    const frame = PLAYER_FRAMES[unit.type]?.[unitFrame(unit, animFrame)] || PLAYER_FRAMES.meatshield.walk1;
    drawPixelMap(ctx, x - (frame[0].length * ps) / 2, groundY - frame.length * ps, ps, frame, playerPalette(character));
  }

  const barW = Math.max(20, ps * 10);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - barW / 2, groundY - 28 * ps, barW, 3);
  ctx.fillStyle = '#58e17c';
  ctx.fillRect(x - barW / 2, groundY - 28 * ps, barW * (unit.hp / Math.max(1, unit.maxHp)), 3);
}

export function drawEnemyUnit(ctx, unit, x, groundY, scale, animFrame) {
  const ps = Math.max(2, Math.round(scale));
  const frame = ENEMY_FRAMES[unit.type]?.[unitFrame(unit, animFrame)] || ENEMY_FRAMES.basic.walk1;
  drawPixelMap(ctx, x - (frame[0].length * ps) / 2, groundY - frame.length * ps, ps, frame, ENEMY_PALETTE);

  const barW = Math.max(18, ps * 9);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x - barW / 2, groundY - 24 * ps, barW, 3);
  ctx.fillStyle = '#ff8c7a';
  ctx.fillRect(x - barW / 2, groundY - 24 * ps, barW * (unit.hp / Math.max(1, unit.maxHp)), 3);
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

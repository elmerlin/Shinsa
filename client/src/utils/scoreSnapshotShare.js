import { BODY_FONT, CANVAS_HEIGHT, CANVAS_WIDTH, DISPLAY_FONT } from '../components/story-composer/StoryComposerConstants';
import { getScoreRankInfo, parseGrade } from './grades';
import { getPlateName } from './plates';

const JUDGMENT_META = [
  { key: 'PERFECT', field: 'perfect', color: '#7dd3fc' },
  { key: 'GREAT', field: 'great', color: '#86efac' },
  { key: 'GOOD', field: 'good', color: '#fde047' },
  { key: 'BAD', field: 'bad', color: '#f5a5ff' },
  { key: 'MISS', field: 'miss', color: '#fda4af' },
];

function compactText(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function formatChartLine(songTitle, mode, level) {
  const parts = [compactText(songTitle, 80)];
  const modeLabel = String(mode || '').trim();
  const levelValue = Number(level) || 0;
  if (modeLabel) {
    parts.push(levelValue > 0 ? `${modeLabel} ${levelValue}` : modeLabel);
  } else if (levelValue > 0) {
    parts.push(`Level ${levelValue}`);
  }
  return parts.filter(Boolean).join(' • ');
}

function getPlayedAtValue(score) {
  return String(
    score?.played_at_utc
    || score?.playedAtUtc
    || score?.date_played
    || score?.playedAt
    || ''
  ).trim();
}

function formatDateLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const candidate = hasExplicitTimezone || /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return raw;
  const hasTime = /(?:T|\s)\d{2}:\d{2}/.test(raw);
  return hasTime
    ? parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    : parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getModeColors(mode) {
  const normalized = String(mode || '').trim();
  if (normalized === 'Single') return { from: '#f97316', to: '#b91c1c' };
  if (normalized === 'Double') return { from: '#34d399', to: '#166534' };
  return { from: '#38bdf8', to: '#1d4ed8' };
}

function getGradeFill(grade, score = 0) {
  const normalized = parseGrade(grade, getScoreRankInfo(score).label).normalized;
  if (normalized.includes('SSS')) return '#7dd3fc';
  if (normalized.includes('SS')) return '#fde68a';
  if (normalized.includes('S')) return '#fbbf24';
  if (normalized.includes('AAA')) return '#e5e7eb';
  if (normalized.includes('AA')) return '#d6b386';
  if (normalized === 'A+' || normalized === 'A') return '#f59e0b';
  return '#d1d5db';
}

function drawRoundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawCoverImage(ctx, img, x, y, w, h, alpha = 1) {
  const imageAspect = img.width / img.height;
  const targetAspect = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (imageAspect > targetAspect) {
    sw = img.height * targetAspect;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetAspect;
    sy = (img.height - sh) / 2;
  }

  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.globalAlpha = previousAlpha;
}

function drawContainImage(ctx, img, x, y, w, h, alpha = 1) {
  const imageAspect = img.width / img.height;
  const targetAspect = w / h;
  let drawW = w;
  let drawH = h;
  let drawX = x;
  let drawY = y;

  if (imageAspect > targetAspect) {
    drawH = w / imageAspect;
    drawY = y + (h - drawH) / 2;
  } else {
    drawW = h * imageAspect;
    drawX = x + (w - drawW) / 2;
  }

  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.globalAlpha = previousAlpha;
}

function drawPill(ctx, text, x, y, options = {}) {
  if (!text) return 0;

  const fontSize = options.fontSize || 28;
  const padX = options.padX || 24;
  const padY = options.padY || 14;
  const radius = options.radius || 999;

  ctx.save();
  ctx.font = `${options.fontWeight || 700} ${fontSize}px ${DISPLAY_FONT}`;
  const width = ctx.measureText(text).width + padX * 2;
  const height = fontSize + padY * 2;

  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = options.fill || 'rgba(255,255,255,0.08)';
  ctx.fill();
  if (options.stroke) {
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth || 2;
    ctx.stroke();
  }

  ctx.fillStyle = options.color || '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + height / 2 + 1);
  ctx.restore();

  return width;
}

function drawLevelBadge(ctx, level, x, y, size, modeColors) {
  if (!(parseInt(level, 10) > 0)) return;

  const cx = x + size / 2;
  const cy = y + size / 2;
  const outerGradient = ctx.createLinearGradient(x, y, x + size, y + size);
  outerGradient.addColorStop(0, modeColors.from);
  outerGradient.addColorStop(1, modeColors.to);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = outerGradient;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 12, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(7,13,22,0.34)';
  ctx.fill();

  ctx.fillStyle = 'rgba(222,234,247,0.88)';
  ctx.font = `700 20px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LEVEL', cx, y + 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${size >= 120 ? 54 : 44}px ${DISPLAY_FONT}`;
  ctx.fillText(String(parseInt(level, 10)), cx, cy + 12);
  ctx.restore();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }

  lines.push(current);
  return lines;
}

export function buildScoreSnapshotShareData(score, jacketUrl = '', linkShare = null) {
  const displayScore = Number(score?.new_score ?? score?.score) || 0;
  const oldScore = Number(score?.old_score) || 0;

  return {
    song_title: String(score?.song_title || score?.songTitle || '').trim(),
    mode: String(score?.mode || '').trim(),
    level: Number(score?.level) || 0,
    score: displayScore,
    new_score: displayScore,
    old_score: oldScore,
    grade: String(score?.new_grade || score?.grade || '').trim(),
    new_grade: String(score?.new_grade || score?.grade || '').trim(),
    old_grade: String(score?.old_grade || '').trim(),
    scoreDelta: Number(score?.scoreDelta ?? (displayScore > 0 && oldScore > 0 ? displayScore - oldScore : 0)) || 0,
    over_top100_rank: Number(score?.over_top100_rank ?? score?.overTop100Rank) || 0,
    plate: String(score?.plate || '').trim(),
    perfect: Number(score?.perfect) || 0,
    great: Number(score?.great) || 0,
    good: Number(score?.good) || 0,
    bad: Number(score?.bad) || 0,
    miss: Number(score?.miss) || 0,
    is_stage_break: !!score?.is_stage_break || !!score?.isStageBreak,
    played_at_utc: getPlayedAtValue(score),
    date_played: getPlayedAtValue(score),
    machine_name: String(score?.machine_name || score?.machineName || '').trim(),
    playerName: String(linkShare?.playerName || score?.playerName || score?.username || '').trim(),
    playerAvatar: String(linkShare?.playerAvatar || score?.playerAvatar || score?.avatar || '').trim(),
    playerSkillTitle: String(linkShare?.playerSkillTitle || score?.playerSkillTitle || score?.skill_title || score?.skillTitle || '').trim(),
    playerRoleLabel: String(linkShare?.playerRoleLabel || score?.playerRoleLabel || score?.roleLabel || '').trim(),
    contextLabel: String(linkShare?.contextLabel || score?.contextLabel || score?.context_label || '').trim(),
    jacket_url: String(jacketUrl || linkShare?.jacketUrl || score?._jacketUrl || score?.jacket_url || score?.background_url || '').trim(),
  };
}

export function buildScoreSnapshotShareFileName(snapshot) {
  const song = slugify(snapshot?.song_title || 'score');
  const mode = slugify(snapshot?.mode || 'mode');
  const level = parseInt(snapshot?.level, 10) || 0;
  return `${song}-${mode || 'chart'}-${level || 'share'}.jpg`;
}

export async function renderScoreSnapshotShareBlob(snapshot) {
  if (typeof document === 'undefined') {
    throw new Error('Image rendering is only available in the browser.');
  }

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  const jacketUrl = String(snapshot?.jacket_url || '').trim();
  const avatarUrl = String(snapshot?.playerAvatar || '').trim();
  const backgroundImage = jacketUrl ? await loadImage(jacketUrl).catch(() => null) : null;
  const avatarImage = avatarUrl ? await loadImage(avatarUrl).catch(() => null) : null;
  const displayScore = parseInt(snapshot?.new_score ?? snapshot?.score, 10) || 0;
  const rank = getScoreRankInfo(displayScore);
  const grade = parseGrade(snapshot?.new_grade || snapshot?.grade, rank.label);
  const oldScore = parseInt(snapshot?.old_score, 10) || 0;
  const oldGrade = parseGrade(snapshot?.old_grade, getScoreRankInfo(oldScore).label);
  const deltaValue = Number.isFinite(Number(snapshot?.scoreDelta))
    ? Number(snapshot.scoreDelta)
    : (oldScore > 0 ? displayScore - oldScore : 0);
  const modeColors = getModeColors(snapshot?.mode);

  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (backgroundImage) {
    drawCoverImage(ctx, backgroundImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0.2);
  }

  const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  bgGradient.addColorStop(0, 'rgba(5,10,18,0.18)');
  bgGradient.addColorStop(0.45, 'rgba(5,10,18,0.56)');
  bgGradient.addColorStop(1, 'rgba(4,8,15,0.98)');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const glow = ctx.createRadialGradient(CANVAS_WIDTH * 0.18, CANVAS_HEIGHT * 0.16, 0, CANVAS_WIDTH * 0.18, CANVAS_HEIGHT * 0.16, CANVAS_WIDTH * 0.58);
  glow.addColorStop(0, 'rgba(56,189,248,0.24)');
  glow.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cardX = 62;
  const cardY = 72;
  const cardW = CANVAS_WIDTH - 124;
  const cardH = CANVAS_HEIGHT - 144;

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fillStyle = 'rgba(8,14,24,0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(162,197,255,0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.clip();
  if (backgroundImage) {
    drawCoverImage(ctx, backgroundImage, cardX, cardY, cardW, cardH, 0.18);
  }
  const cardOverlay = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
  cardOverlay.addColorStop(0, 'rgba(7,12,20,0.16)');
  cardOverlay.addColorStop(0.38, 'rgba(7,12,20,0.36)');
  cardOverlay.addColorStop(1, 'rgba(7,12,20,0.74)');
  ctx.fillStyle = cardOverlay;
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.restore();

  const heroX = cardX + 38;
  const heroY = cardY + 38;
  const heroW = cardW - 76;
  const topPad = 8;
  const badgeSize = 132;
  const badgeX = heroX + heroW - badgeSize;
  const leftColumnW = heroW - badgeSize - 34;

  let contentY = heroY + topPad;
  const titleLines = [];
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 66px ${DISPLAY_FONT}`;
  wrapText(ctx, snapshot?.song_title || 'Score details', leftColumnW).slice(0, 3).forEach((line) => {
    titleLines.push(line);
  });
  titleLines.forEach((line, index) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, heroX, contentY + 58 + index * 70);
  });
  contentY += 58 + Math.max(titleLines.length - 1, 0) * 70 + 26;

  ctx.fillStyle = 'rgba(213,226,245,0.88)';
  ctx.font = `600 28px ${BODY_FONT}`;
  ctx.fillText(formatChartLine(snapshot?.song_title, snapshot?.mode, snapshot?.level), heroX, contentY + 18);
  contentY += 44;

  const modeLabel = String(snapshot?.mode || 'Score').trim();
  drawPill(ctx, modeLabel, badgeX - 18, heroY, {
    fontSize: 24,
    fill: 'rgba(4,8,14,0.44)',
    stroke: 'rgba(255,255,255,0.16)',
    color: '#f8fbff',
    padX: 20,
    padY: 10,
  });
  drawLevelBadge(ctx, snapshot?.level, badgeX, heroY + 48, badgeSize, modeColors);

  if ((parseInt(snapshot?.over_top100_rank, 10) || 0) > 0) {
    drawPill(ctx, `TOP #${parseInt(snapshot.over_top100_rank, 10)}`, heroX, contentY + 12, {
      fontSize: 22,
      fill: 'rgba(255,215,90,0.15)',
      stroke: 'rgba(255,226,134,0.48)',
      color: '#fde68a',
      padX: 18,
      padY: 9,
    });
  }

  if (avatarImage || snapshot?.playerName || snapshot?.played_at_utc || snapshot?.machine_name) {
    const playerY = contentY + 70;
    if (avatarImage) {
      ctx.save();
      drawRoundedRect(ctx, heroX, playerY, 70, 70, 999);
      ctx.clip();
      drawCoverImage(ctx, avatarImage, heroX, playerY, 70, 70, 1);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, heroX, playerY, 70, 70, 999);
      ctx.stroke();
    }

    const playerTextX = heroX + (avatarImage ? 92 : 0);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 36px ${DISPLAY_FONT}`;
    ctx.fillText(snapshot?.playerName || 'Player', playerTextX, playerY + 30);

    const metaParts = [
      formatDateLabel(snapshot?.played_at_utc || snapshot?.date_played),
      String(snapshot?.machine_name || '').trim(),
    ].filter(Boolean);
    if (metaParts.length > 0) {
      ctx.fillStyle = 'rgba(204,214,229,0.82)';
      ctx.font = `500 24px ${BODY_FONT}`;
      ctx.fillText(metaParts.join(' • '), playerTextX, playerY + 62);
    }
    contentY = playerY + 94;
  }

  const badgeTexts = [
    snapshot?.playerRoleLabel ? { text: snapshot.playerRoleLabel, fill: 'rgba(251,191,36,0.14)', stroke: 'rgba(251,191,36,0.4)', color: '#fde68a' } : null,
    snapshot?.playerSkillTitle ? { text: snapshot.playerSkillTitle, fill: 'rgba(34,211,238,0.12)', stroke: 'rgba(103,232,249,0.34)', color: '#cffafe' } : null,
    snapshot?.contextLabel ? { text: snapshot.contextLabel, fill: 'rgba(16,185,129,0.12)', stroke: 'rgba(110,231,183,0.34)', color: '#d1fae5' } : null,
  ].filter(Boolean);
  if (badgeTexts.length > 0) {
    let badgeRowX = heroX;
    let badgeRowY = contentY + 8;
    badgeTexts.forEach((badge) => {
      ctx.font = `700 24px ${DISPLAY_FONT}`;
      const width = ctx.measureText(badge.text).width + 42;
      if (badgeRowX + width > heroX + heroW) {
        badgeRowX = heroX;
        badgeRowY += 60;
      }
      drawPill(ctx, badge.text, badgeRowX, badgeRowY, {
        fontSize: 24,
        fill: badge.fill,
        stroke: badge.stroke,
        color: badge.color,
        padX: 20,
        padY: 10,
      });
      badgeRowX += width + 12;
    });
    contentY = badgeRowY + 68;
  }

  const jacketY = contentY + 26;
  const jacketH = 572;

  drawRoundedRect(ctx, heroX, jacketY, heroW, jacketH, 40);
  ctx.save();
  ctx.clip();
  if (backgroundImage) {
    const jacketBackdrop = ctx.createLinearGradient(heroX, jacketY, heroX + heroW, jacketY + jacketH);
    jacketBackdrop.addColorStop(0, 'rgba(15,26,44,0.96)');
    jacketBackdrop.addColorStop(1, 'rgba(8,14,24,0.96)');
    ctx.fillStyle = jacketBackdrop;
    ctx.fillRect(heroX, jacketY, heroW, jacketH);
    drawContainImage(ctx, backgroundImage, heroX + 24, jacketY + 24, heroW - 48, jacketH - 48, 0.98);
  } else {
    const heroGradient = ctx.createLinearGradient(heroX, jacketY, heroX + heroW, jacketY + jacketH);
    heroGradient.addColorStop(0, '#13253f');
    heroGradient.addColorStop(1, '#0a1222');
    ctx.fillStyle = heroGradient;
    ctx.fillRect(heroX, jacketY, heroW, jacketH);
  }
  const heroOverlay = ctx.createLinearGradient(0, jacketY, 0, jacketY + jacketH);
  heroOverlay.addColorStop(0, 'rgba(6,10,18,0.02)');
  heroOverlay.addColorStop(0.7, 'rgba(7,12,22,0.14)');
  heroOverlay.addColorStop(1, 'rgba(5,9,16,0.28)');
  ctx.fillStyle = heroOverlay;
  ctx.fillRect(heroX, jacketY, heroW, jacketH);
  ctx.restore();

  const scoreBoxY = jacketY + jacketH + 34;
  const scoreBoxH = 248;
  drawRoundedRect(ctx, heroX, scoreBoxY, heroW, scoreBoxH, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(219,234,254,0.74)';
  ctx.font = `700 24px ${DISPLAY_FONT}`;
  ctx.fillText('Score', heroX + 30, scoreBoxY + 38);

  ctx.fillStyle = snapshot?.is_stage_break ? '#fda4af' : '#ffffff';
  ctx.font = `900 ${snapshot?.is_stage_break ? 72 : 94}px ${DISPLAY_FONT}`;
  ctx.fillText(snapshot?.is_stage_break ? 'STAGE BREAK' : formatNumber(displayScore), heroX + 30, scoreBoxY + 132);

  if (snapshot?.plate) {
    ctx.fillStyle = '#fde68a';
    ctx.font = `700 28px ${DISPLAY_FONT}`;
    ctx.fillText(getPlateName(snapshot.plate), heroX + 30, scoreBoxY + 182);
  }

  ctx.fillStyle = getGradeFill(grade.display || grade.normalized, displayScore);
  ctx.font = `900 92px ${DISPLAY_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(grade.display || rank.label, heroX + heroW - 28, scoreBoxY + 112);
  ctx.textAlign = 'left';

  if (oldScore > 0) {
    ctx.fillStyle = 'rgba(204,214,229,0.78)';
    ctx.font = `500 24px ${BODY_FONT}`;
    const prevLabel = `Prev ${formatNumber(oldScore)} ${oldGrade.display || ''}`.trim();
    ctx.fillText(prevLabel, heroX + heroW - 274, scoreBoxY + 160);
    if (deltaValue !== 0) {
      ctx.fillStyle = deltaValue > 0 ? '#86efac' : '#fca5a5';
      ctx.font = `800 42px ${DISPLAY_FONT}`;
      ctx.fillText(`${deltaValue > 0 ? '+' : ''}${formatNumber(deltaValue)}`, heroX + heroW - 274, scoreBoxY + 208);
    }
  }

  const judgments = JUDGMENT_META.map((item) => ({
    ...item,
    value: parseInt(snapshot?.[item.field], 10) || 0,
  }));
  const showJudgments = judgments.some((item) => item.value > 0);
  const judgmentY = scoreBoxY + scoreBoxH + 30;

  if (showJudgments) {
    drawRoundedRect(ctx, heroX, judgmentY, heroW, 214, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    const itemWidth = heroW / judgments.length;
    judgments.forEach((item, index) => {
      const itemX = heroX + index * itemWidth;
      ctx.fillStyle = item.color;
      ctx.font = `700 22px ${DISPLAY_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(item.key, itemX + itemWidth / 2, judgmentY + 58);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 42px ${DISPLAY_FONT}`;
      ctx.fillText(formatNumber(item.value), itemX + itemWidth / 2, judgmentY + 126);
    });
    ctx.textAlign = 'left';
  } else {
    drawRoundedRect(ctx, heroX, judgmentY, heroW, 120, 32);
    ctx.fillStyle = 'rgba(245,158,11,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,158,11,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fcd34d';
    ctx.font = `700 24px ${DISPLAY_FONT}`;
    ctx.fillText('Judgment breakdown unavailable for this score.', heroX + 28, judgmentY + 68);
  }

  ctx.fillStyle = 'rgba(186,206,230,0.78)';
  ctx.font = `600 26px ${BODY_FONT}`;
  ctx.fillText('Shared from Shinsa', heroX, cardY + cardH - 92);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to render score card image.'));
      }
    }, 'image/jpeg', 0.92);
  });
}

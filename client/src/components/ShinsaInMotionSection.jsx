import React, { useEffect, useRef, useState } from 'react';
import { getShinsaInMotionData } from '../utils/api';

const DEFAULT_DURATION_MS = 30000;
const numberFormatter = new Intl.NumberFormat('en-GB');
const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function easeInOutCubic(value) {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function hashString(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashToUnit(value, salt = '') {
  return (hashString(`${value}:${salt}`) % 1000) / 1000;
}

function parseDateValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\//g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const ms = Date.parse(`${normalized}T00:00:00Z`);
    return Number.isNaN(ms) ? 0 : ms;
  }
  const direct = Date.parse(normalized.includes('T') ? normalized : normalized.replace(' ', 'T'));
  if (!Number.isNaN(direct)) return direct;
  const fallback = Date.parse(`${normalized}Z`);
  return Number.isNaN(fallback) ? 0 : fallback;
}

function formatShortDate(value) {
  const ms = parseDateValue(value);
  return ms ? shortDateFormatter.format(ms) : 'Unknown';
}

function formatCompactRange(startValue, endValue) {
  const start = formatShortDate(startValue);
  const end = formatShortDate(endValue);
  if (start === 'Unknown' && end === 'Unknown') return 'Live sync window';
  if (start === end) return start;
  if (start === 'Unknown') return `Until ${end}`;
  if (end === 'Unknown') return `Since ${start}`;
  return `${start} to ${end}`;
}

function truncateLabel(value, max = 28) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function makeColor(hue, alpha = 1) {
  return `hsla(${Math.round(hue)}, 92%, 66%, ${alpha})`;
}

function getInitials(name) {
  return String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle = '', lineWidth = 1) {
  roundedRectPath(ctx, x, y, width, height, radius);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function cubicBezierPoint(path, t) {
  const tt = clamp(t, 0, 1);
  const mt = 1 - tt;
  const mt2 = mt * mt;
  const tt2 = tt * tt;
  return {
    x: mt2 * mt * path.start.x
      + 3 * mt2 * tt * path.control1.x
      + 3 * mt * tt2 * path.control2.x
      + tt2 * tt * path.end.x,
    y: mt2 * mt * path.start.y
      + 3 * mt2 * tt * path.control1.y
      + 3 * mt * tt2 * path.control2.y
      + tt2 * tt * path.end.y,
  };
}

function sampleCurve(path, steps = 160) {
  const count = Math.max(8, steps);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    points.push(cubicBezierPoint(path, t));
  }
  return points;
}

function drawPolyline(ctx, points, strokeStyle, lineWidth, shadowColor = '', shadowBlur = 0) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (shadowColor && shadowBlur > 0) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
  }
  ctx.stroke();
  ctx.restore();
}

function countEventsBefore(fractions, progress) {
  if (!Array.isArray(fractions) || fractions.length === 0) return 0;
  let low = 0;
  let high = fractions.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (progress >= fractions[mid]) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function buildMotionScene(data, width, height) {
  const users = Array.isArray(data?.users)
    ? data.users.filter((user) => (Number.parseInt(user?.play_count, 10) || 0) > 0)
    : [];

  const sidebarWidth = clamp(width * (width < 840 ? 0.29 : 0.24), 220, 360);
  const margin = clamp(width * 0.03, 22, 42);
  const sidebar = {
    x: width - sidebarWidth - margin,
    y: margin,
    width: sidebarWidth,
    height: height - margin * 2,
  };
  const timeline = {
    x: margin,
    y: margin + 22,
    width: Math.max(220, sidebar.x - margin - 30),
    height: height - margin * 2 - 44,
  };
  const rowHeight = users.length > 0 ? timeline.height / users.length : timeline.height;
  const maxSongs = users.reduce((highest, user) => Math.max(highest, Number.parseInt(user.play_count, 10) || 0), 1);
  const showLabels = rowHeight >= 24;
  const barStartX = sidebar.x + 22;
  const barEndX = sidebar.x + sidebar.width - 24;
  const barWidth = Math.max(80, barEndX - barStartX);
  const labelFontSize = clamp(rowHeight * 0.38, 10, 14);

  const twinkles = Array.from({ length: clamp(Math.round((width * height) / 10000), 80, 200) }, (_, index) => ({
    x: hashToUnit('twinkle-x', index) * width,
    y: hashToUnit('twinkle-y', index) * height,
    radius: lerp(0.6, 2.2, hashToUnit('twinkle-r', index)),
    alpha: lerp(0.16, 0.92, hashToUnit('twinkle-a', index)),
    speed: lerp(0.45, 1.4, hashToUnit('twinkle-s', index)),
    phase: hashToUnit('twinkle-p', index) * Math.PI * 2,
  }));

  const motes = Array.from({ length: clamp(Math.round((width * height) / 52000), 14, 40) }, (_, index) => ({
    x: hashToUnit('mote-x', index) * width,
    y: hashToUnit('mote-y', index) * height,
    radius: lerp(16, 48, hashToUnit('mote-r', index)),
    alpha: lerp(0.05, 0.14, hashToUnit('mote-a', index)),
    speed: lerp(0.8, 2.2, hashToUnit('mote-s', index)),
    phase: hashToUnit('mote-p', index) * Math.PI * 2,
  }));

  const nebulas = [
    { x: width * 0.16, y: height * 0.16, radius: Math.max(width, height) * 0.36, color: 'rgba(20, 158, 202, 0.18)' },
    { x: width * 0.52, y: height * 0.74, radius: Math.max(width, height) * 0.42, color: 'rgba(255, 136, 56, 0.16)' },
    { x: width * 0.72, y: height * 0.2, radius: Math.max(width, height) * 0.28, color: 'rgba(58, 226, 179, 0.11)' },
  ];

  const sceneUsers = users.map((user, index) => {
    const playCount = Math.max(0, Number.parseInt(user.play_count, 10) || 0);
    const seed = hashString(user.id || `${user.username}-${index}`);
    const hue = (seed * 17 + index * 43 + 170) % 360;
    const laneY = timeline.y + rowHeight * (index + 0.5);
    const startOffsetY = lerp(-rowHeight * 0.8, rowHeight * 0.8, hashToUnit(user.id, 'start-y'));
    const controlLift = lerp(rowHeight * 0.5, rowHeight * 1.4, hashToUnit(user.id, 'lift'));
    const controlDrop = lerp(-rowHeight * 0.7, rowHeight * 0.7, hashToUnit(user.id, 'drop'));
    const startX = timeline.x + lerp(12, timeline.width * 0.1, hashToUnit(user.id, 'start-x'));
    const endX = sidebar.x - 18;
    const path = {
      start: { x: startX, y: laneY + startOffsetY },
      control1: {
        x: timeline.x + timeline.width * lerp(0.16, 0.24, hashToUnit(user.id, 'c1x')),
        y: laneY - controlLift,
      },
      control2: {
        x: timeline.x + timeline.width * lerp(0.76, 0.88, hashToUnit(user.id, 'c2x')),
        y: laneY + controlDrop,
      },
      end: { x: endX, y: laneY },
    };
    const trailPoints = sampleCurve(path, 192);
    const rawPlays = Array.isArray(user.plays) ? user.plays : [];
    const joinedMs = parseDateValue(user.joined_at);
    const datedPlayMs = rawPlays
      .map((play) => parseDateValue(play?.date_played))
      .filter((value) => value > 0);
    const firstTimelineMs = joinedMs || datedPlayMs[0] || 0;
    const lastTimelineMs = datedPlayMs[datedPlayMs.length - 1] || firstTimelineMs;
    const spanMs = Math.max(1, lastTimelineMs - firstTimelineMs);
    const eventPoints = rawPlays.map((play, playIndex) => {
      const playMs = parseDateValue(play?.date_played);
      const relative = playMs > 0
        ? clamp((playMs - firstTimelineMs) / spanMs, 0, 1)
        : ((playIndex + 0.5) / Math.max(1, playCount));
      const fraction = clamp(0.06 + 0.9 * relative, 0.04, 0.96);
      return {
        ...play,
        fraction,
        point: cubicBezierPoint(path, fraction),
      };
    });

    return {
      ...user,
      play_count: playCount,
      hue,
      color: {
        solid: makeColor(hue, 0.98),
        soft: makeColor(hue, 0.2),
        dim: makeColor(hue, 0.12),
        glow: makeColor(hue, 0.38),
        bright: makeColor(hue, 0.88),
        beam: makeColor(hue, 0.96),
      },
      rowY: laneY,
      path,
      trailPoints,
      eventPoints,
      eventFractions: eventPoints.map((play) => play.fraction),
      avatarRadius: clamp(rowHeight * 0.34, 12, 20),
      lineWidth: clamp(rowHeight * 0.15, 1.5, 4),
    };
  });

  return {
    width,
    height,
    timeline,
    sidebar,
    rowHeight,
    maxSongs,
    showLabels,
    labelFontSize,
    barStartX,
    barEndX,
    barWidth,
    users: sceneUsers,
    twinkles,
    motes,
    nebulas,
  };
}

function renderStaticLayer(scene, dpr = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(scene.width * dpr));
  canvas.height = Math.max(1, Math.round(scene.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const background = ctx.createLinearGradient(0, 0, 0, scene.height);
  background.addColorStop(0, '#030612');
  background.addColorStop(0.45, '#051121');
  background.addColorStop(1, '#03070f');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, scene.width, scene.height);

  for (const nebula of scene.nebulas) {
    const gradient = ctx.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.radius);
    gradient.addColorStop(0, nebula.color);
    gradient.addColorStop(0.5, 'rgba(28, 64, 112, 0.06)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(nebula.x, nebula.y, nebula.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.16;
  for (const star of scene.twinkles) {
    ctx.fillStyle = '#dceaff';
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius * 0.78, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const panelGradient = ctx.createLinearGradient(scene.sidebar.x, scene.sidebar.y, scene.sidebar.x + scene.sidebar.width, scene.sidebar.y + scene.sidebar.height);
  panelGradient.addColorStop(0, 'rgba(6, 15, 30, 0.92)');
  panelGradient.addColorStop(1, 'rgba(10, 22, 39, 0.88)');
  drawRoundedRect(ctx, scene.sidebar.x, scene.sidebar.y, scene.sidebar.width, scene.sidebar.height, 26, panelGradient, 'rgba(115, 184, 255, 0.18)', 1.2);

  ctx.save();
  ctx.strokeStyle = 'rgba(119, 170, 236, 0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 10]);
  for (let index = 0; index <= 4; index += 1) {
    const x = lerp(scene.timeline.x + 10, scene.timeline.x + scene.timeline.width - 18, index / 4);
    ctx.beginPath();
    ctx.moveTo(x, scene.timeline.y - 16);
    ctx.lineTo(x, scene.timeline.y + scene.timeline.height + 16);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(222, 238, 255, 0.58)';
  ctx.font = '700 10px "Segoe UI", sans-serif';
  ctx.fillText('JOINED', scene.timeline.x, scene.timeline.y - 22);
  ctx.fillText('TOTAL SONGS', scene.sidebar.x + 20, scene.sidebar.y + 22);

  for (const user of scene.users) {
    drawPolyline(ctx, user.trailPoints, user.color.dim, user.lineWidth, user.color.soft, user.lineWidth * 3.8);

    ctx.save();
    ctx.fillStyle = user.color.soft;
    const dotRadius = clamp(scene.rowHeight * 0.11, 1.2, 2.4);
    for (const play of user.eventPoints) {
      ctx.beginPath();
      ctx.arc(play.point.x, play.point.y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = user.color.glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = makeColor(user.hue, 0.62);
    ctx.beginPath();
    ctx.arc(user.path.start.x, user.path.start.y, clamp(scene.rowHeight * 0.18, 2.5, 5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const trackY = user.rowY + scene.rowHeight * 0.14;
    const trackHeight = clamp(scene.rowHeight * 0.18, 6, 12);
    drawRoundedRect(ctx, scene.barStartX, trackY - trackHeight * 0.5, scene.barWidth, trackHeight, trackHeight * 0.5, 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)', 1);
    drawRoundedRect(ctx, scene.barStartX, trackY - trackHeight * 0.5, scene.barWidth * (user.play_count / scene.maxSongs), trackHeight, trackHeight * 0.5, user.color.soft);

    if (scene.showLabels) {
      ctx.fillStyle = 'rgba(229, 238, 251, 0.82)';
      ctx.font = `600 ${scene.labelFontSize}px "Segoe UI", sans-serif`;
      ctx.fillText(truncateLabel(user.username, 18), scene.barStartX, user.rowY - scene.rowHeight * 0.28);
    }
  }

  return canvas;
}

export default function ShinsaInMotionSection() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const staticLayerRef = useRef(null);
  const dataRef = useRef(null);
  const avatarCacheRef = useRef(new Map());
  const elapsedRef = useRef(0);
  const resizeTimerRef = useRef(0);
  const [playbackState, setPlaybackState] = useState('loading');
  const [reloadToken, setReloadToken] = useState(0);
  const [payloadState, setPayloadState] = useState({
    loading: true,
    error: '',
    payload: null,
  });

  function drawAvatar(ctx, user, x, y, radius) {
    const cacheKey = user.id || user.username;
    const cache = avatarCacheRef.current.get(cacheKey);
    const clampedRadius = clamp(radius, 10, 22);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, clampedRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (cache?.status === 'loaded' && cache.image) {
      ctx.drawImage(cache.image, x - clampedRadius, y - clampedRadius, clampedRadius * 2, clampedRadius * 2);
    } else {
      const fill = ctx.createLinearGradient(x - clampedRadius, y - clampedRadius, x + clampedRadius, y + clampedRadius);
      fill.addColorStop(0, makeColor(user.hue, 0.9));
      fill.addColorStop(1, 'rgba(255, 255, 255, 0.92)');
      ctx.fillStyle = fill;
      ctx.fillRect(x - clampedRadius, y - clampedRadius, clampedRadius * 2, clampedRadius * 2);
      ctx.fillStyle = '#08111e';
      ctx.font = `700 ${Math.max(10, clampedRadius)}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getInitials(user.username), x, y + 1);
    }
    ctx.restore();

    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowColor = user.color.glow;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(x, y, clampedRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawCueLabel(ctx, user, play, x, y, alignRight = false) {
    const text = truncateLabel(`${play.song_title}  ${play.mode[0] || ''}${play.level || ''}`.trim(), 30);
    ctx.save();
    ctx.font = '600 11px "Segoe UI", sans-serif';
    const metrics = ctx.measureText(text);
    const bubbleWidth = metrics.width + 20;
    const bubbleHeight = 28;
    const left = alignRight ? x - bubbleWidth - 14 : x + 14;
    const top = y - bubbleHeight * 0.5;
    drawRoundedRect(ctx, left, top, bubbleWidth, bubbleHeight, 14, 'rgba(5, 11, 20, 0.9)', makeColor(user.hue, 0.44), 1);
    ctx.fillStyle = 'rgba(241, 247, 255, 0.95)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + 10, top + bubbleHeight * 0.53);
    ctx.restore();
  }

  function drawFrame(rawProgress = 0) {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    const staticLayer = staticLayerRef.current;
    if (!canvas || !scene || !staticLayer) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, scene.width, scene.height);
    context.drawImage(staticLayer, 0, 0, scene.width, scene.height);

    const progress = easeInOutCubic(clamp(rawProgress, 0, 1));
    const timelinePulse = performance.now() * 0.001;

    for (const mote of scene.motes) {
      const driftX = Math.sin(timelinePulse * mote.speed + mote.phase) * 10;
      const driftY = Math.cos(timelinePulse * mote.speed * 0.8 + mote.phase) * 8;
      const gradient = context.createRadialGradient(mote.x + driftX, mote.y + driftY, 0, mote.x + driftX, mote.y + driftY, mote.radius);
      gradient.addColorStop(0, `rgba(194, 235, 255, ${mote.alpha})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(mote.x + driftX, mote.y + driftY, mote.radius, 0, Math.PI * 2);
      context.fill();
    }

    for (const star of scene.twinkles) {
      const intensity = 0.35 + 0.65 * ((Math.sin(timelinePulse * star.speed + star.phase) + 1) * 0.5);
      context.fillStyle = `rgba(227, 239, 255, ${star.alpha * intensity})`;
      context.beginPath();
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();
    }

    const cueEvents = [];

    for (const user of scene.users) {
      const trailIndex = Math.max(1, Math.round(progress * (user.trailPoints.length - 1)));
      const visibleTrail = user.trailPoints.slice(0, trailIndex + 1);
      drawPolyline(context, visibleTrail, user.color.glow, user.lineWidth * 2.7, user.color.glow, user.lineWidth * 8);
      drawPolyline(context, visibleTrail, user.color.solid, user.lineWidth, user.color.bright, user.lineWidth * 2.4);

      const head = user.trailPoints[trailIndex] || user.trailPoints[user.trailPoints.length - 1];
      context.save();
      context.shadowColor = user.color.beam;
      context.shadowBlur = 22;
      context.fillStyle = user.color.beam;
      context.beginPath();
      context.arc(head.x, head.y, clamp(scene.rowHeight * 0.22, 3, 6), 0, Math.PI * 2);
      context.fill();
      context.restore();

      const passedCount = countEventsBefore(user.eventFractions, progress);
      const recentStart = Math.max(0, passedCount - 3);
      const recentEnd = Math.min(user.eventPoints.length, passedCount + 2);

      for (let playIndex = recentStart; playIndex < recentEnd; playIndex += 1) {
        const play = user.eventPoints[playIndex];
        const delta = Math.abs(progress - play.fraction);
        const pulse = 1 - clamp(delta / 0.045, 0, 1);
        const radius = clamp(scene.rowHeight * 0.12 + pulse * 4.5, 2, 7);
        context.save();
        context.shadowColor = user.color.beam;
        context.shadowBlur = 18 + pulse * 14;
        context.fillStyle = pulse > 0.02 ? user.color.beam : user.color.soft;
        context.beginPath();
        context.arc(play.point.x, play.point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();

        if (delta < 0.02) cueEvents.push({ user, play, delta });
      }

      const currentTrackY = user.rowY + scene.rowHeight * 0.14;
      const trackHeight = clamp(scene.rowHeight * 0.18, 6, 12);
      const currentCount = countEventsBefore(user.eventFractions, progress);
      const nextPlay = user.eventFractions[currentCount] ?? 1;
      const previousPlay = currentCount > 0 ? user.eventFractions[currentCount - 1] : 0;
      const segmentProgress = nextPlay > previousPlay
        ? clamp((progress - previousPlay) / (nextPlay - previousPlay), 0, 1)
        : 1;
      const animatedValue = Math.min(user.play_count, currentCount + segmentProgress * 0.92);
      const fillWidth = scene.barWidth * (animatedValue / scene.maxSongs);

      const fillGradient = context.createLinearGradient(scene.barStartX, currentTrackY, scene.barStartX + fillWidth, currentTrackY);
      fillGradient.addColorStop(0, user.color.soft);
      fillGradient.addColorStop(1, user.color.solid);
      drawRoundedRect(context, scene.barStartX, currentTrackY - trackHeight * 0.5, fillWidth, trackHeight, trackHeight * 0.5, fillGradient);

      const avatarX = clamp(scene.barStartX + fillWidth, scene.barStartX + user.avatarRadius, scene.barEndX);
      drawAvatar(context, user, avatarX, currentTrackY, user.avatarRadius);

      context.save();
      context.fillStyle = 'rgba(247, 251, 255, 0.98)';
      context.font = `700 ${clamp(scene.labelFontSize, 10, 14)}px "Segoe UI", sans-serif`;
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillText(numberFormatter.format(Math.min(user.play_count, currentCount)), scene.barEndX, user.rowY - scene.rowHeight * 0.28);
      context.restore();
    }

    cueEvents.sort((a, b) => a.delta - b.delta).slice(0, 3).forEach((cue, index) => {
      drawCueLabel(
        context,
        cue.user,
        cue.play,
        cue.play.point.x,
        cue.play.point.y - index * 34,
        cue.play.point.x > scene.timeline.x + scene.timeline.width * 0.56
      );
    });
  }

  function ensureAvatar(user) {
    const cacheKey = user.id || user.username;
    if (!cacheKey || !user.avatar || avatarCacheRef.current.has(cacheKey)) return;

    const image = new Image();
    avatarCacheRef.current.set(cacheKey, { status: 'loading', image });
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      avatarCacheRef.current.set(cacheKey, { status: 'loaded', image });
      drawFrame(elapsedRef.current / Math.max(1, dataRef.current?.duration_ms || DEFAULT_DURATION_MS));
    };
    image.onerror = () => {
      avatarCacheRef.current.set(cacheKey, { status: 'error', image: null });
      drawFrame(elapsedRef.current / Math.max(1, dataRef.current?.duration_ms || DEFAULT_DURATION_MS));
    };
    image.src = user.avatar;
  }

  function rebuildScene() {
    const host = containerRef.current;
    const canvas = canvasRef.current;
    const payload = dataRef.current;
    if (!host || !canvas || !payload) return;

    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const scene = buildMotionScene(payload, rect.width, rect.height);
    sceneRef.current = scene;
    staticLayerRef.current = renderStaticLayer(scene, dpr);

    for (const user of scene.users) ensureAvatar(user);
    drawFrame(elapsedRef.current / Math.max(1, payload.duration_ms || DEFAULT_DURATION_MS));
  }

  useEffect(() => {
    let cancelled = false;

    setPayloadState({
      loading: true,
      error: '',
      payload: null,
    });
    setPlaybackState('loading');

    getShinsaInMotionData()
      .then((payload) => {
        if (cancelled) return;
        dataRef.current = payload;
        elapsedRef.current = 0;
        setPayloadState({
          loading: false,
          error: '',
          payload,
        });
        setPlaybackState('playing');
      })
      .catch((error) => {
        if (cancelled) return;
        dataRef.current = null;
        setPayloadState({
          loading: false,
          error: error?.message || 'Unable to load motion data.',
          payload: null,
        });
        setPlaybackState('paused');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!payloadState.payload || !containerRef.current) return undefined;

    rebuildScene();

    const handleResize = () => {
      window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        rebuildScene();
      }, 40);
    };

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(handleResize);
      observer.observe(containerRef.current);
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      window.clearTimeout(resizeTimerRef.current);
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', handleResize);
    };
  }, [payloadState.payload]);

  useEffect(() => {
    if (!payloadState.payload) return undefined;

    const durationMs = Math.max(1, Number(payloadState.payload.duration_ms) || DEFAULT_DURATION_MS);
    let frameId = 0;
    const startElapsed = elapsedRef.current;
    const startedAt = performance.now();

    const frame = (now) => {
      const elapsed = playbackState === 'playing'
        ? Math.min(durationMs, startElapsed + (now - startedAt))
        : elapsedRef.current;
      elapsedRef.current = elapsed;
      drawFrame(elapsed / durationMs);

      if (playbackState === 'playing' && elapsed < durationMs) {
        frameId = window.requestAnimationFrame(frame);
      } else if (playbackState === 'playing' && elapsed >= durationMs) {
        setPlaybackState('ended');
      }
    };

    if (playbackState === 'playing') {
      frameId = window.requestAnimationFrame(frame);
    } else {
      drawFrame(elapsedRef.current / durationMs);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [payloadState.payload, playbackState, reloadToken]);

  const payload = payloadState.payload;
  const activeUsers = payload?.totals?.active_users || 0;
  const totalPlays = payload?.totals?.total_plays || 0;
  const hasData = !!payload && activeUsers > 0;
  const spanText = payload
    ? formatCompactRange(payload.span?.earliest_joined_at, payload.span?.latest_played_at)
    : 'Live sync window';

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#030712] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.4)] sm:p-4">
      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,14,25,0.94),rgba(3,8,16,0.98))] p-2 sm:p-3">
        <div ref={containerRef} className="relative min-h-[520px] overflow-hidden rounded-[22px] border border-white/8 bg-[#030915] sm:min-h-[680px]">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(70,199,255,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,162,84,0.12),transparent_34%)]" />

          <div className="pointer-events-none absolute left-4 top-4 max-w-[540px] sm:left-6 sm:top-6">
            <p className="font-display text-[10px] uppercase tracking-[0.34em] text-cyan-200/65 sm:text-[11px]">Cinematic replay</p>
            <h2 className="mt-2 font-display text-3xl font-black tracking-[0.08em] text-white sm:text-5xl">SHINSA IN MOTION</h2>
            <p className="mt-3 max-w-[42rem] text-sm leading-6 text-slate-300 sm:text-[15px]">
              Every recorded song play on Shinsa compressed into one 30 second cosmic flight.
              Each glowing pulse is a song, each trail begins at join time, and every player converges on the live total bar at the right.
            </p>
          </div>

          <div className="absolute right-4 top-4 z-10 flex flex-wrap items-center justify-end gap-2 sm:right-6 sm:top-6">
            <button
              type="button"
              onClick={() => {
                if (!hasData) return;
                setPlaybackState((current) => {
                  if (current === 'playing') return 'paused';
                  if (current === 'ended') {
                    elapsedRef.current = 0;
                    setReloadToken((value) => value + 1);
                    return 'playing';
                  }
                  return 'playing';
                });
              }}
              className="rounded-full border border-cyan-300/20 bg-[#081323]/90 px-4 py-2 text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-100 shadow-[0_8px_24px_rgba(0,0,0,0.24)] transition-colors hover:border-cyan-200/40 hover:text-white"
            >
              {playbackState === 'playing' ? 'Pause' : playbackState === 'ended' ? 'Play Again' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!hasData) return;
                elapsedRef.current = 0;
                setReloadToken((value) => value + 1);
                setPlaybackState('playing');
              }}
              className="rounded-full border border-white/12 bg-black/45 px-4 py-2 text-[11px] font-display font-bold uppercase tracking-[0.22em] text-slate-100 transition-colors hover:border-white/28 hover:text-white"
            >
              Replay
            </button>
          </div>

          <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center gap-2 sm:bottom-6 sm:left-6 sm:right-auto">
            <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] font-display uppercase tracking-[0.18em] text-slate-200 backdrop-blur-sm">
              {numberFormatter.format(activeUsers)} players
            </div>
            <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] font-display uppercase tracking-[0.18em] text-slate-200 backdrop-blur-sm">
              {numberFormatter.format(totalPlays)} songs
            </div>
            <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] font-display uppercase tracking-[0.18em] text-slate-200 backdrop-blur-sm">
              {spanText}
            </div>
          </div>

          {payloadState.loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#040a14]/78 backdrop-blur-sm">
              <div className="rounded-[24px] border border-cyan-300/18 bg-[#091322]/92 px-6 py-5 text-center shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
                <p className="font-display text-xs uppercase tracking-[0.32em] text-cyan-200/72">Loading scene</p>
                <p className="mt-3 text-sm text-slate-200">Gathering every recorded play and plotting the flight path.</p>
              </div>
            </div>
          )}

          {!payloadState.loading && payloadState.error && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#040a14]/78 backdrop-blur-sm p-4">
              <div className="max-w-md rounded-[24px] border border-rose-300/18 bg-[#120b12]/92 px-6 py-5 text-center shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
                <p className="font-display text-xs uppercase tracking-[0.32em] text-rose-200/72">Scene unavailable</p>
                <p className="mt-3 text-sm text-slate-100">{payloadState.error}</p>
              </div>
            </div>
          )}

          {!payloadState.loading && !payloadState.error && !hasData && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#040a14]/72 backdrop-blur-sm p-4">
              <div className="max-w-md rounded-[24px] border border-white/12 bg-[#091322]/92 px-6 py-5 text-center shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
                <p className="font-display text-xs uppercase tracking-[0.32em] text-cyan-200/72">No timeline yet</p>
                <p className="mt-3 text-sm text-slate-100">
                  There is no synced play history to render yet. Once players import recent songs, this scene will light up automatically.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

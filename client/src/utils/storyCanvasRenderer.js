import { CANVAS_WIDTH, CANVAS_HEIGHT, DISPLAY_FONT } from '../components/story-composer/StoryComposerConstants';

// ── helpers ────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function parseGradientCSS(css) {
  const match = css.match(/linear-gradient\(\s*([\d.]+)deg\s*,\s*(.+)\)/);
  if (!match) return null;
  const angle = parseFloat(match[1]);
  const stopStrings = match[2].split(/,(?![^(]*\))/).map((s) => s.trim());
  const stops = stopStrings.map((s) => {
    const parts = s.split(/\s+/);
    const color = parts[0];
    const position = parts[1] ? parseFloat(parts[1]) / 100 : null;
    return { color, position };
  });
  // fill in missing positions
  if (stops[0].position === null) stops[0].position = 0;
  if (stops[stops.length - 1].position === null) stops[stops.length - 1].position = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].position === null) {
      const prev = stops[i - 1].position;
      let nextIdx = i + 1;
      while (nextIdx < stops.length && stops[nextIdx].position === null) nextIdx++;
      const next = stops[nextIdx].position;
      stops[i].position = prev + ((next - prev) * (i - (i - 1))) / (nextIdx - (i - 1));
    }
  }
  return { angle, stops };
}

function gradientCoordsFromAngle(angleDeg, w, h) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfDiag = (Math.abs(w * cos) + Math.abs(h * sin)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return {
    x0: cx - halfDiag * cos,
    y0: cy - halfDiag * sin,
    x1: cx + halfDiag * cos,
    y1: cy + halfDiag * sin,
  };
}

function drawGradient(ctx, css, w, h) {
  const parsed = parseGradientCSS(css);
  if (!parsed) {
    ctx.fillStyle = '#0a101b';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const coords = gradientCoordsFromAngle(parsed.angle, w, h);
  const grad = ctx.createLinearGradient(coords.x0, coords.y0, coords.x1, coords.y1);
  for (const stop of parsed.stops) {
    grad.addColorStop(stop.position, stop.color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawPositionedImage(ctx, img, w, h, fitMode = 'cover', positionX = 50, positionY = 50) {
  const imageScale = fitMode === 'contain'
    ? Math.min(w / img.width, h / img.height)
    : Math.max(w / img.width, h / img.height);

  const drawWidth = img.width * imageScale;
  const drawHeight = img.height * imageScale;
  const drawX = (w - drawWidth) * (positionX / 100);
  const drawY = (h - drawHeight) * (positionY / 100);

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
}

function measureWrappedText(ctx, text, maxWidth, lineHeight) {
  const paragraphs = String(text || '').split('\n');
  const lines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }

    let line = '';
    for (let i = 0; i < words.length; i++) {
      const testLine = line ? `${line} ${words[i]}` : words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
  }

  const width = lines.reduce((max, line) => Math.max(max, ctx.measureText(line || ' ').width), 0);

  return {
    lines,
    width,
    height: lines.length * lineHeight,
  };
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const measured = measureWrappedText(ctx, text, maxWidth, lineHeight);
  let currentY = y;

  for (const line of measured.lines) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }

  return measured;
}

// ── themed background ──────────────────────────────────────────────────

function drawThemedBackground(ctx, theme, w, h) {
  drawGradient(ctx, theme.background, w, h);

  // decorations overlay
  if (theme.decorations && theme.decorations !== 'none') {
    // For radial gradients we approximate with a simple elliptical highlight
    if (theme.decorations.includes('radial-gradient')) {
      const match = theme.decorations.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const color = `rgba(${match[1]})`;
        const grad = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.3, h * 0.3, w * 0.6);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    }
    // For grid-based decorations (retro-arcade)
    if (theme.decorations.includes('repeating-linear-gradient')) {
      ctx.strokeStyle = theme.accentColor || 'rgba(255,255,255,0.04)';
      ctx.globalAlpha = 0.06;
      ctx.lineWidth = 1;
      const spacing = 60 * (w / 1080);
      for (let y = 0; y < h; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // border
  if (theme.borderColor) {
    const inset = 40;
    const radius = 60;
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, radius);
    ctx.stroke();
  }
}

// ── public renderer ────────────────────────────────────────────────────

export async function renderStoryToBlob(scene) {
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  // 1. background
  if (scene.backgroundType === 'image' && scene.imageDataUrl) {
    const img = await loadImage(scene.imageDataUrl);
    const imageFitMode = scene.imageFitMode || 'cover';
    const positionX = scene.imagePositionX ?? 50;
    const positionY = scene.imagePositionY ?? 50;

    ctx.save();
    ctx.filter = 'blur(32px)';
    ctx.globalAlpha = 0.55;
    drawPositionedImage(ctx, img, CANVAS_WIDTH, CANVAS_HEIGHT, 'cover', positionX, positionY);
    ctx.restore();

    ctx.fillStyle = 'rgba(3,7,18,0.45)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawPositionedImage(ctx, img, CANVAS_WIDTH, CANVAS_HEIGHT, imageFitMode === 'fill' ? 'cover' : 'contain', positionX, positionY);
  } else if (scene.backgroundType === 'themed' && scene.theme) {
    drawThemedBackground(ctx, scene.theme, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else if (scene.backgroundCSS) {
    drawGradient(ctx, scene.backgroundCSS, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    ctx.fillStyle = '#0a101b';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // 2. centered text (text-only stories)
  if (scene.centerText) {
    const t = scene.centerText;
    const fontSize = t.fontSize || 72;
    const fontWeight = t.fontWeight || 800;
    const fontFamily = t.fontFamily || DISPLAY_FONT;
    const color = t.color || '#ffffff';
    const align = t.align || 'center';
    const maxWidth = CANVAS_WIDTH * 0.82;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    // measure to center vertically
    const lineHeight = fontSize * 1.3;
    const measured = measureWrappedText(ctx, t.text, maxWidth, lineHeight);
    const totalHeight = measured.height;
    const startY = (CANVAS_HEIGHT - totalHeight) / 2 + fontSize * 0.5;
    const textX = align === 'center' ? CANVAS_WIDTH / 2 : align === 'right' ? CANVAS_WIDTH * 0.9 : CANVAS_WIDTH * 0.1;

    // shadow for readability on gradients
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    drawWrappedText(ctx, t.text, textX, startY, maxWidth, lineHeight);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  // 3. overlay text layers (image editor)
  if (scene.textLayers) {
    for (const layer of scene.textLayers) {
      ctx.save();
      const px = (layer.x / 100) * CANVAS_WIDTH;
      const py = (layer.y / 100) * CANVAS_HEIGHT;
      ctx.translate(px, py);

      const fontSize = layer.fontSize || 64;
      const maxWidth = CANVAS_WIDTH * 0.8;
      const lineHeight = fontSize * 1.3;

      ctx.font = `800 ${fontSize}px ${DISPLAY_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const measured = measureWrappedText(ctx, layer.text, maxWidth, lineHeight);
      const textBlockWidth = Math.min(measured.width, maxWidth);
      const textBlockHeight = measured.height;

      // draw background behind text if bgOpacity > 0
      if (layer.bgOpacity > 0) {
        const padX = 24, padY = 16, radius = 20;
        const bgW = Math.min(textBlockWidth + padX * 2, CANVAS_WIDTH * 0.85);
        const bgH = textBlockHeight + padY * 2;
        ctx.fillStyle = `rgba(0,0,0,${layer.bgOpacity})`;
        ctx.beginPath();
        ctx.roundRect(-bgW / 2, -bgH / 2, bgW, bgH, radius);
        ctx.fill();
      }

      ctx.fillStyle = layer.color || '#ffffff';

      // shadow for readability on photos
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;

      const startY = -((measured.lines.length - 1) * lineHeight) / 2;
      drawWrappedText(ctx, layer.text, 0, startY, maxWidth, lineHeight);
      ctx.restore();
    }
  }

  // 4. sticker layers
  if (scene.stickerLayers) {
    for (const sticker of scene.stickerLayers) {
      try {
        const img = await loadImage(sticker.imageUrl);
        const px = (sticker.x / 100) * CANVAS_WIDTH;
        const py = (sticker.y / 100) * CANVAS_HEIGHT;
        const size = (sticker.size || 12) / 100 * CANVAS_WIDTH;
        ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
      } catch {
        // skip broken sticker
      }
    }
  }

  // 5. link badge
  if (scene.linkBadge && scene.linkBadge.url) {
    const badge = scene.linkBadge;
    const px = (badge.x / 100) * CANVAS_WIDTH;
    const py = (badge.y / 100) * CANVAS_HEIGHT;
    let domain = '';
    try { domain = new URL(badge.url).hostname.replace('www.', ''); } catch { domain = badge.url; }

    const fontSize = 32;
    ctx.font = `700 ${fontSize}px ${DISPLAY_FONT}`;
    const textWidth = ctx.measureText(domain).width;
    const padX = 32;
    const padY = 18;
    const pillW = textWidth + padX * 2;
    const pillH = fontSize + padY * 2;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(px - pillW / 2, py - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(domain, px, py);
  }

  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.88);
  });
}

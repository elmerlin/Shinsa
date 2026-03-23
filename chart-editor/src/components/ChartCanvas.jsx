import { useRef, useEffect, useCallback, useState } from 'react';
import {
  PANEL_COLORS, PANEL_ROTATIONS, BEAT_HEIGHT, COLUMN_WIDTH,
  RECEPTOR_Y, NOTE_SIZE, SNAP_COLORS, GAME_TYPES,
} from '../lib/constants.js';
import { snapBeat, beatToTime, timeToBeat } from '../lib/timing.js';
import {
  loadNoteskin, getNoteskinImages, getPanelInfo,
  TAP_FRAME_W, TAP_FRAME_H,
} from '../lib/noteskinLoader.js';

/**
 * Canvas-based note highway with falling arrows.
 * Uses sprite-based noteskin assets from hanubeki (Apache 2.0).
 */
export default function ChartCanvas({
  chart,
  metadata,
  scrollBeat,
  onScrollBeatChange,
  zoom,
  snapDivision,
  noteType,
  onPlaceNote,
  onDeleteNote,
  playing,
  currentBeat,
  currentTime,
  avSpeed,
  holdStartRef,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const lastMouseY = useRef(0);
  const [skinLoaded, setSkinLoaded] = useState(false);

  const numColumns = chart ? (GAME_TYPES[chart.type]?.columns || 5) : 5;
  const beatHeight = BEAT_HEIGHT * zoom;
  const canvasWidth = numColumns * COLUMN_WIDTH + 80;

  // Load noteskin on mount
  useEffect(() => {
    loadNoteskin().then(() => setSkinLoaded(true));
  }, []);

  // Draw the chart
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const effectiveBeat = playing ? currentBeat : scrollBeat;
    const useAV = avSpeed > 0;
    const imgs = getNoteskinImages();
    const bpms = metadata?.bpms || [{ beat: 0, bpm: 120 }];
    const stops = metadata?.stops || [];

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    const chartWidth = numColumns * COLUMN_WIDTH;
    const leftMargin = Math.max(60, Math.floor((width - chartWidth) / 2));
    const noteDrawSize = NOTE_SIZE;

    // AV/CMOD: reference time for positioning
    const refTime = useAV
      ? (playing ? (currentTime || 0) : beatToTime(effectiveBeat, bpms, stops))
      : 0;

    const beatToY = (beat) => {
      if (useAV) {
        const noteTime = beatToTime(beat, bpms, stops);
        return RECEPTOR_Y + (noteTime - refTime) * avSpeed;
      }
      return RECEPTOR_Y + (beat - effectiveBeat) * beatHeight;
    };

    // Visible beat range
    let minBeat, maxBeat;
    if (useAV) {
      const topTime = refTime - (RECEPTOR_Y / avSpeed);
      const bottomTime = refTime + ((height - RECEPTOR_Y) / avSpeed);
      minBeat = timeToBeat(Math.max(0, topTime), bpms, stops);
      maxBeat = timeToBeat(bottomTime, bpms, stops);
    } else {
      const topBeat = effectiveBeat - (RECEPTOR_Y / beatHeight);
      const bottomBeat = effectiveBeat + ((height - RECEPTOR_Y) / beatHeight);
      minBeat = Math.min(topBeat, bottomBeat);
      maxBeat = Math.max(topBeat, bottomBeat);
    }

    // Column backgrounds
    for (let col = 0; col < numColumns; col++) {
      const x = leftMargin + col * COLUMN_WIDTH;
      ctx.fillStyle = col % 2 === 0 ? '#0d0d22' : '#0f0f25';
      ctx.fillRect(x, 0, COLUMN_WIDTH, height);
    }

    // Beat grid lines
    const gridStart = Math.floor(minBeat * snapDivision / 4) * 4 / snapDivision;
    for (let beat = gridStart; beat <= maxBeat; beat += 4 / snapDivision) {
      if (beat < 0) continue;
      const y = beatToY(beat);
      if (y < -10 || y > height + 10) continue;

      const measureBeat = beat % 4;
      let lineAlpha = 0.15;
      let lineWidth = 1;
      let color = '#444466';

      if (Math.abs(measureBeat) < 0.001 || Math.abs(measureBeat - 4) < 0.001) {
        lineAlpha = 0.6; lineWidth = 2; color = '#ff3333';
      } else if (Math.abs(beat % 1) < 0.001) {
        lineAlpha = 0.35; color = '#ff3333';
      } else {
        color = SNAP_COLORS[snapDivision] || '#444466';
        lineAlpha = 0.25;
      }

      ctx.strokeStyle = color;
      ctx.globalAlpha = lineAlpha;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(leftMargin + numColumns * COLUMN_WIDTH, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Measure numbers
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#666688';
    const measureStart = Math.max(0, Math.floor(minBeat / 4));
    const measureEnd = Math.ceil(maxBeat / 4);
    for (let m = measureStart; m <= measureEnd; m++) {
      const y = beatToY(m * 4);
      if (y > -20 && y < height + 20) {
        ctx.fillText(`M${m}`, 4, y + 4);
      }
    }

    // Receptor line
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftMargin, RECEPTOR_Y);
    ctx.lineTo(leftMargin + numColumns * COLUMN_WIDTH, RECEPTOR_Y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw receptors using sprites
    for (let col = 0; col < numColumns; col++) {
      const x = leftMargin + col * COLUMN_WIDTH + COLUMN_WIDTH / 2;
      drawSprite(ctx, imgs, col, 'receptor', x, RECEPTOR_Y, noteDrawSize, 0.5);
    }

    // Build hold/roll pairs
    const holdPairs = [];
    if (chart.notes) {
      const headMap = new Map();
      const sorted = [...chart.notes].sort((a, b) => a.beat - b.beat);
      for (const note of sorted) {
        if (note.type === 'hold_head' || note.type === 'roll_head') {
          headMap.set(note.column, note);
        } else if (note.type === 'hold_tail') {
          const head = headMap.get(note.column);
          if (head) {
            holdPairs.push({ head, tail: note, isRoll: head.type === 'roll_head' });
            headMap.delete(note.column);
          }
        }
      }
    }

    // Draw holds/rolls with sprites
    for (const { head, tail, isRoll } of holdPairs) {
      const headY = beatToY(head.beat);
      const tailY = beatToY(tail.beat);
      const x = leftMargin + head.column * COLUMN_WIDTH + COLUMN_WIDTH / 2;

      if (Math.min(headY, tailY) > height + 50 || Math.max(headY, tailY) < -50) continue;

      drawHoldBody(ctx, imgs, head.column, x, headY, tailY, noteDrawSize, isRoll);
    }

    // Draw notes
    if (chart.notes) {
      for (const note of chart.notes) {
        const y = beatToY(note.beat);
        if (y < -50 || y > height + 50) continue;

        const x = leftMargin + note.column * COLUMN_WIDTH + COLUMN_WIDTH / 2;

        if (note.type === 'tap') {
          drawSprite(ctx, imgs, note.column, 'tap', x, y, noteDrawSize, 1.0);
        } else if (note.type === 'hold_head') {
          drawSprite(ctx, imgs, note.column, 'tap', x, y, noteDrawSize, 1.0);
          // Green tint overlay
          drawSprite(ctx, imgs, note.column, 'glow', x, y, noteDrawSize * 1.2, 0.4);
        } else if (note.type === 'roll_head') {
          drawSprite(ctx, imgs, note.column, 'tap', x, y, noteDrawSize, 1.0);
          // Orange tint overlay
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#ff8833';
          ctx.beginPath();
          ctx.arc(x, y, noteDrawSize / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (note.type === 'hold_tail') {
          drawSprite(ctx, imgs, note.column, 'hold-bottomcap', x, y, noteDrawSize, 0.8);
        } else if (note.type === 'mine') {
          drawMineSprite(ctx, imgs, x, y, noteDrawSize);
        } else if (note.type === 'fake') {
          drawSprite(ctx, imgs, note.column, 'tap', x, y, noteDrawSize, 0.3);
        } else if (note.type === 'lift') {
          drawSprite(ctx, imgs, note.column, 'tap', x, y, noteDrawSize, 0.6);
        }
      }
    }

    // Playback position line
    if (playing) {
      ctx.strokeStyle = '#33ff66';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(leftMargin, RECEPTOR_Y);
      ctx.lineTo(leftMargin + numColumns * COLUMN_WIDTH, RECEPTOR_Y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Beat info
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#888899';
    ctx.fillText(`Beat: ${effectiveBeat.toFixed(2)}`, 4, height - 8);
  }, [chart, scrollBeat, zoom, snapDivision, playing, currentBeat, currentTime, avSpeed, metadata, numColumns, beatHeight, skinLoaded]);

  // Animation loop
  useEffect(() => {
    let animId;
    const loop = () => {
      draw();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [draw]);

  // Resize canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(canvasWidth, rect.width);
      canvas.height = rect.height;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasWidth]);

  // Mouse wheel scroll
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const scrollAmount = 4 / snapDivision;
    onScrollBeatChange(prev => Math.max(0, prev + delta * scrollAmount));
  }, [snapDivision, onScrollBeatChange]);

  // Click to place/delete notes
  const handleClick = useCallback((e) => {
    if (!chart || playing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const chartWidth = numColumns * COLUMN_WIDTH;
    const leftMargin = Math.max(60, Math.floor((canvas.width - chartWidth) / 2));

    if (mx < leftMargin || mx > leftMargin + chartWidth) return;

    const col = Math.floor((mx - leftMargin) / COLUMN_WIDTH);
    if (col < 0 || col >= numColumns) return;

    let rawBeat;
    if (avSpeed > 0) {
      const bpms = metadata?.bpms || [{ beat: 0, bpm: 120 }];
      const stops = metadata?.stops || [];
      const clickRefTime = beatToTime(scrollBeat, bpms, stops);
      const timeOffset = (my - RECEPTOR_Y) / avSpeed;
      rawBeat = timeToBeat(Math.max(0, clickRefTime + timeOffset), bpms, stops);
    } else {
      const beatOffset = (my - RECEPTOR_Y) / beatHeight;
      rawBeat = scrollBeat + beatOffset;
    }
    const beat = snapBeat(rawBeat, snapDivision);

    if (beat < 0) return;

    if (e.button === 2 || e.ctrlKey || e.metaKey) {
      onDeleteNote(beat, col);
    } else {
      if (noteType === 'hold' || noteType === 'roll') {
        if (!holdStartRef.current) {
          holdStartRef.current = { beat, column: col };
          const headType = noteType === 'hold' ? 'hold_head' : 'roll_head';
          onPlaceNote(beat, col, headType);
        } else {
          if (holdStartRef.current.column === col && beat > holdStartRef.current.beat) {
            onPlaceNote(beat, col, 'hold_tail');
          }
          holdStartRef.current = null;
        }
      } else {
        onPlaceNote(beat, col, noteType === 'mine' ? 'mine' : 'tap');
      }
    }
  }, [chart, scrollBeat, beatHeight, snapDivision, noteType, onPlaceNote, onDeleteNote, numColumns, playing, holdStartRef]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    handleClick(e);
  }, [handleClick]);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1) {
      isDragging.current = true;
      lastMouseY.current = e.clientY;
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const dy = e.clientY - lastMouseY.current;
    lastMouseY.current = e.clientY;
    onScrollBeatChange(prev => Math.max(0, prev - dy / beatHeight));
  }, [beatHeight, onScrollBeatChange]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative cursor-crosshair"
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="block"
      />
    </div>
  );
}

/**
 * Draw a noteskin sprite at (x, y) with rotation based on column.
 * @param {string} type - 'tap', 'receptor', 'glow', 'hold-body', 'hold-topcap', 'hold-bottomcap'
 */
function drawSprite(ctx, imgs, column, type, x, y, size, alpha) {
  if (!imgs) return;

  const panel = getPanelInfo(column);
  const key = `${panel.base}-${type}`;
  const img = imgs[key];

  if (!img) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  // Rotate for direction (UL=0, UR=90, DR=180, DL=270)
  if (panel.rotation !== 0) {
    ctx.rotate(panel.rotation * Math.PI / 180);
  }

  // For tap notes (sprite sheets), draw first frame only
  if (type === 'tap') {
    // First frame is top-left of 2x16 sheet
    ctx.drawImage(
      img,
      0, 0, TAP_FRAME_W, TAP_FRAME_H,  // source rect
      -size / 2, -size / 2, size, size   // dest rect
    );
  } else {
    // Single frame images (receptor, glow) or first frame of 2x1 sheets
    const srcW = img.naturalWidth > 128 ? 128 : img.naturalWidth;
    const srcH = img.naturalHeight > 128 ? 128 : img.naturalHeight;
    ctx.drawImage(
      img,
      0, 0, srcW, srcH,
      -size / 2, -size / 2, size, size
    );
  }

  ctx.restore();
}

/**
 * Draw a hold/roll body between headY and tailY using sprite tiles.
 */
function drawHoldBody(ctx, imgs, column, x, headY, tailY, size, isRoll) {
  if (!imgs) return;

  const panel = getPanelInfo(column);
  const bodyKey = isRoll ? `${panel.base}-roll-body` : `${panel.base}-hold-body`;
  const bodyImg = imgs[bodyKey];

  const top = Math.min(headY, tailY);
  const bot = Math.max(headY, tailY);
  const bodyHeight = bot - top;

  if (bodyHeight <= 0) return;

  const bodyWidth = size * 0.75;

  if (bodyImg) {
    // Tile the body sprite vertically
    ctx.save();
    ctx.globalAlpha = 1.0;
    const tileH = bodyWidth; // square tiles
    for (let ty = top; ty < bot; ty += tileH) {
      const drawH = Math.min(tileH, bot - ty);
      const srcH = (drawH / tileH) * 128;
      ctx.drawImage(
        bodyImg,
        0, 0, 128, srcH,
        x - bodyWidth / 2, ty, bodyWidth, drawH
      );
    }
    ctx.restore();
  } else {
    // Fallback: colored rectangle
    ctx.fillStyle = PANEL_COLORS[column];
    ctx.globalAlpha = isRoll ? 0.25 : 0.35;
    ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, bodyHeight);
    ctx.globalAlpha = 1;
  }
}

/**
 * Draw a mine using sprite or fallback.
 */
function drawMineSprite(ctx, imgs, x, y, size) {
  const mineImg = imgs?.mine;
  if (mineImg) {
    ctx.save();
    ctx.translate(x, y);
    ctx.drawImage(
      mineImg,
      0, 0, 128, 128,
      -size / 2, -size / 2, size, size
    );
    ctx.restore();
  } else {
    // Fallback
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#331111';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const s = size * 0.3;
    ctx.beginPath();
    ctx.moveTo(-s, -s); ctx.lineTo(s, s);
    ctx.moveTo(s, -s); ctx.lineTo(-s, s);
    ctx.stroke();
    ctx.restore();
  }
}

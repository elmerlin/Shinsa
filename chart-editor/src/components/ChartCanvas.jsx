import { useRef, useEffect, useCallback, useState } from 'react';
import {
  PANEL_COLORS, PANEL_ROTATIONS, BEAT_HEIGHT, COLUMN_WIDTH,
  RECEPTOR_Y, NOTE_SIZE, SNAP_COLORS, GAME_TYPES,
} from '../lib/constants.js';
import { snapBeat, beatToTime } from '../lib/timing.js';

/**
 * Canvas-based note highway with falling arrows.
 * Notes scroll downward, receptors at top. Beat 0 starts at top.
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
  avMode,
  holdStartRef,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const lastMouseY = useRef(0);

  const numColumns = chart ? (GAME_TYPES[chart.type]?.columns || 5) : 5;
  const beatHeight = BEAT_HEIGHT * zoom;
  const canvasWidth = numColumns * COLUMN_WIDTH + 80; // 80px for measure labels

  // Draw the chart
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const effectiveBeat = playing ? currentBeat : scrollBeat;
    const useAV = avMode && playing;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    const leftMargin = 60;

    // AV/CMOD: pixels per second (constant visual speed)
    // Use a base rate that feels similar to normal scroll at 120 BPM
    const avPixelsPerSec = (120 / 60) * beatHeight; // 2 beats worth of pixels per second

    // Convert beat to Y position
    const beatToY = (beat) => {
      if (useAV) {
        // AV mode: position based on time difference (constant scroll speed)
        const bpms = metadata?.bpms || [{ beat: 0, bpm: 120 }];
        const stops = metadata?.stops || [];
        const noteTime = beatToTime(beat, bpms, stops);
        const refTime = currentTime || 0;
        return RECEPTOR_Y + (noteTime - refTime) * avPixelsPerSec;
      }
      return RECEPTOR_Y + (beat - effectiveBeat) * beatHeight;
    };

    // Visible beat range (approximate for AV mode)
    const topBeat = effectiveBeat - (RECEPTOR_Y / beatHeight);
    const bottomBeat = effectiveBeat + ((height - RECEPTOR_Y) / beatHeight);

    // Draw column backgrounds (subtle)
    for (let col = 0; col < numColumns; col++) {
      const x = leftMargin + col * COLUMN_WIDTH;
      ctx.fillStyle = col % 2 === 0 ? '#0d0d22' : '#0f0f25';
      ctx.fillRect(x, 0, COLUMN_WIDTH, height);
    }

    // Draw beat grid lines
    const minBeat = Math.min(topBeat, bottomBeat);
    const maxBeat = Math.max(topBeat, bottomBeat);
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
        // Measure line
        lineAlpha = 0.6;
        lineWidth = 2;
        color = '#ff3333';
      } else if (Math.abs(beat % 1) < 0.001) {
        // Beat line
        lineAlpha = 0.35;
        lineWidth = 1;
        color = '#ff3333';
      } else {
        // Subdivision line - pick color by type
        const snapStep = 4 / snapDivision;
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

    // Draw measure numbers
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

    // Draw receptor line
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftMargin, RECEPTOR_Y);
    ctx.lineTo(leftMargin + numColumns * COLUMN_WIDTH, RECEPTOR_Y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw receptor arrows (dimmed)
    for (let col = 0; col < numColumns; col++) {
      const x = leftMargin + col * COLUMN_WIDTH + COLUMN_WIDTH / 2;
      drawArrow(ctx, x, RECEPTOR_Y, col, PANEL_COLORS[col], 0.3, false);
    }

    // Build hold/roll pairs for rendering
    const holdPairs = [];
    if (chart.notes) {
      const headMap = new Map(); // col -> last head
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

    // Draw holds/rolls
    for (const { head, tail, isRoll } of holdPairs) {
      const headY = beatToY(head.beat);
      const tailY = beatToY(tail.beat);
      const x = leftMargin + head.column * COLUMN_WIDTH + COLUMN_WIDTH / 2;

      if (Math.min(headY, tailY) > height + 50 || Math.max(headY, tailY) < -50) continue;

      const color = PANEL_COLORS[head.column];

      // Draw hold body
      ctx.fillStyle = color;
      ctx.globalAlpha = isRoll ? 0.25 : 0.35;
      const bodyWidth = 20;
      const top = Math.min(headY, tailY);
      const bot = Math.max(headY, tailY);
      ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, bot - top);

      if (isRoll) {
        // Draw roll stripes
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        for (let sy = top; sy < bot; sy += 8) {
          ctx.beginPath();
          ctx.moveTo(x - bodyWidth / 2, sy);
          ctx.lineTo(x + bodyWidth / 2, sy);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
    }

    // Draw notes
    if (chart.notes) {
      for (const note of chart.notes) {
        const y = beatToY(note.beat);
        if (y < -50 || y > height + 50) continue;

        const x = leftMargin + note.column * COLUMN_WIDTH + COLUMN_WIDTH / 2;
        const color = PANEL_COLORS[note.column] || '#ffffff';

        if (note.type === 'tap') {
          drawArrow(ctx, x, y, note.column, color, 1.0, true);
        } else if (note.type === 'hold_head') {
          drawArrow(ctx, x, y, note.column, color, 1.0, true);
          // Green tint for hold heads
          ctx.globalAlpha = 0.3;
          drawArrow(ctx, x, y, note.column, '#33ff66', 1.0, true);
          ctx.globalAlpha = 1;
        } else if (note.type === 'roll_head') {
          drawArrow(ctx, x, y, note.column, color, 1.0, true);
          ctx.globalAlpha = 0.3;
          drawArrow(ctx, x, y, note.column, '#ff8833', 1.0, true);
          ctx.globalAlpha = 1;
        } else if (note.type === 'hold_tail') {
          // Tail cap
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.6;
          ctx.fillRect(x - 10, y - 3, 20, 6);
          ctx.globalAlpha = 1;
        } else if (note.type === 'mine') {
          drawMine(ctx, x, y, 16);
        } else if (note.type === 'fake') {
          drawArrow(ctx, x, y, note.column, '#555555', 0.4, false);
        } else if (note.type === 'lift') {
          drawArrow(ctx, x, y, note.column, '#aa66ff', 0.8, false);
        }
      }
    }

    // Draw playback position line during playback
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

    // Current beat/time info
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#888899';
    ctx.fillText(`Beat: ${effectiveBeat.toFixed(2)}`, 4, height - 8);
  }, [chart, scrollBeat, zoom, snapDivision, playing, currentBeat, currentTime, avMode, metadata, numColumns, beatHeight]);

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

  // Resize canvas to fit container
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
    const scrollAmount = 4 / snapDivision; // scroll by one snap step
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
    const leftMargin = 60;

    // Check if click is in the note area
    if (mx < leftMargin || mx > leftMargin + numColumns * COLUMN_WIDTH) return;

    const col = Math.floor((mx - leftMargin) / COLUMN_WIDTH);
    if (col < 0 || col >= numColumns) return;

    // Convert Y to beat (falling: receptor at top, beats increase downward)
    const beatOffset = (my - RECEPTOR_Y) / beatHeight;
    const rawBeat = scrollBeat + beatOffset;
    const beat = snapBeat(rawBeat, snapDivision);

    if (beat < 0) return;

    if (e.button === 2 || e.ctrlKey || e.metaKey) {
      // Right-click or ctrl-click: delete
      onDeleteNote(beat, col);
    } else {
      // Left-click: place note
      if (noteType === 'hold' || noteType === 'roll') {
        // Hold/roll: first click = head, second click = tail
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

  // Context menu (prevent default for right-click delete)
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    handleClick(e);
  }, [handleClick]);

  // Mouse drag to scroll
  const handleMouseDown = useCallback((e) => {
    if (e.button === 1) { // middle mouse button
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
 * Draw a PIU-style arrow at position (x, y).
 * Corner arrows: wide chevron/arrow shape, rotated per panel direction.
 * Center panel: regular pentagon (flat-top).
 */
function drawArrow(ctx, x, y, column, color, alpha, filled) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  const col5 = column % 5;
  const s = NOTE_SIZE / 2;

  if (col5 === 2) {
    // Center panel: regular pentagon (flat top)
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
      const px = Math.cos(angle) * s;
      const py = Math.sin(angle) * s;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    // Corner arrows: PIU-style wide chevron
    const rotation = PANEL_ROTATIONS[column] * Math.PI / 180;
    ctx.rotate(rotation);

    // Wide chevron arrow pointing up — distinctive PIU shape
    const w = s * 0.95;  // half-width at widest
    const h = s;          // half-height
    const t = s * 0.35;  // thickness of the chevron arms
    const notch = s * 0.35; // inner notch depth

    ctx.beginPath();
    // Outer shape: tip, then wide arms
    ctx.moveTo(0, -h);                      // tip
    ctx.lineTo(w, h * 0.45);               // right outer
    ctx.lineTo(w * 0.55, h);               // right base outer
    ctx.lineTo(0, h * 0.15);               // inner notch center
    ctx.lineTo(-w * 0.55, h);              // left base outer
    ctx.lineTo(-w, h * 0.45);              // left outer
    ctx.closePath();
  }

  if (filled) {
    // Gradient fill for depth
    const grad = ctx.createLinearGradient(0, -s, 0, s);
    grad.addColorStop(0, lightenColor(color, 40));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, darkenColor(color, 40));
    ctx.fillStyle = grad;
    ctx.fill();

    // White highlight border
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner bright edge
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Lighten a hex color by amount (0-255).
 */
function lightenColor(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

/**
 * Darken a hex color by amount (0-255).
 */
function darkenColor(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}

/**
 * Draw a mine (circle with X).
 */
function drawMine(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);

  // Filled dark circle
  ctx.fillStyle = '#331111';
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();

  // Red ring
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.stroke();

  // X
  ctx.lineWidth = 2.5;
  const s = size * 0.55;
  ctx.beginPath();
  ctx.moveTo(-s, -s);
  ctx.lineTo(s, s);
  ctx.moveTo(s, -s);
  ctx.lineTo(-s, s);
  ctx.stroke();

  ctx.restore();
}

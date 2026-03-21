import { useRef, useEffect, useCallback, useState } from 'react';
import {
  PANEL_COLORS, PANEL_ROTATIONS, BEAT_HEIGHT, COLUMN_WIDTH,
  RECEPTOR_Y, NOTE_SIZE, SNAP_COLORS, GAME_TYPES,
} from '../lib/constants.js';
import { snapBeat } from '../lib/timing.js';

/**
 * Canvas-based note highway with rising arrows.
 * Notes rise upward, receptors at top.
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

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    const leftMargin = 60;

    // Convert beat to Y position (rising: higher beats are lower on screen)
    // Receptor is at RECEPTOR_Y, current beat maps to receptor
    const beatToY = (beat) => {
      return RECEPTOR_Y - (beat - effectiveBeat) * beatHeight;
    };

    // Visible beat range
    const topBeat = effectiveBeat + (RECEPTOR_Y / beatHeight);
    const bottomBeat = effectiveBeat - ((height - RECEPTOR_Y) / beatHeight);

    // Draw column backgrounds (subtle)
    for (let col = 0; col < numColumns; col++) {
      const x = leftMargin + col * COLUMN_WIDTH;
      ctx.fillStyle = col % 2 === 0 ? '#0d0d22' : '#0f0f25';
      ctx.fillRect(x, 0, COLUMN_WIDTH, height);
    }

    // Draw beat grid lines
    const gridStart = Math.floor(bottomBeat * snapDivision / 4) * 4 / snapDivision;
    for (let beat = gridStart; beat <= topBeat; beat += 4 / snapDivision) {
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
    const measureStart = Math.max(0, Math.floor(bottomBeat / 4));
    const measureEnd = Math.ceil(topBeat / 4);
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
  }, [chart, scrollBeat, zoom, snapDivision, playing, currentBeat, numColumns, beatHeight]);

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
    const delta = e.deltaY > 0 ? -1 : 1;
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

    // Convert Y to beat (rising: receptor at top, beats increase downward visually)
    const beatOffset = (RECEPTOR_Y - my) / beatHeight;
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
    onScrollBeatChange(prev => Math.max(0, prev + dy / beatHeight));
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
 * Draw an arrow/note at position (x, y).
 * For center panel (col 2 or 7), draw a pentagon/star shape.
 * For corner panels, draw a rotated arrow.
 */
function drawArrow(ctx, x, y, column, color, alpha, filled) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  const col5 = column % 5;
  const size = NOTE_SIZE / 2;

  if (col5 === 2) {
    // Center panel: draw a diamond/pentagon shape
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(size * 0.6, size);
    ctx.lineTo(-size * 0.6, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();
  } else {
    // Corner arrows: rotated triangle/arrow
    const rotation = PANEL_ROTATIONS[column] * Math.PI / 180;
    ctx.rotate(rotation);

    ctx.beginPath();
    // Arrow pointing up
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.8, size * 0.4);
    ctx.lineTo(size * 0.3, size * 0.1);
    ctx.lineTo(size * 0.3, size);
    ctx.lineTo(-size * 0.3, size);
    ctx.lineTo(-size * 0.3, size * 0.1);
    ctx.lineTo(-size * 0.8, size * 0.4);
    ctx.closePath();
  }

  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw a mine (X shape).
 */
function drawMine(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.8;

  // Circle
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.stroke();

  // X
  const s = size * 0.6;
  ctx.beginPath();
  ctx.moveTo(-s, -s);
  ctx.lineTo(s, s);
  ctx.moveTo(s, -s);
  ctx.lineTo(-s, s);
  ctx.stroke();

  ctx.restore();
}

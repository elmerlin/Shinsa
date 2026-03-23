import { useRef, useEffect, useMemo, useCallback, useState } from 'react';

/**
 * Vertical minimap showing all measures with note density.
 * Click to jump to any measure.
 */
export default function MeasureGuide({
  chart,
  scrollBeat,
  onScrollBeatChange,
  zoom,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(0);

  // Compute total measures and note density per measure
  const { totalMeasures, densityMap, maxDensity } = useMemo(() => {
    if (!chart?.notes?.length) return { totalMeasures: 1, densityMap: {}, maxDensity: 0 };

    const lastBeat = Math.max(...chart.notes.map(n => n.beat));
    const total = Math.ceil(lastBeat / 4) + 1;
    const map = {};
    let maxD = 0;

    for (const note of chart.notes) {
      const m = Math.floor(note.beat / 4);
      map[m] = (map[m] || 0) + 1;
      if (map[m] > maxD) maxD = map[m];
    }

    return { totalMeasures: total, densityMap: map, maxDensity: maxD };
  }, [chart]);

  // Track container height via resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height || 0;
      if (h > 0) setContainerHeight(h);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw the minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerHeight <= 0) return;

    canvas.width = 50;
    canvas.height = containerHeight;

    const ctx = canvas.getContext('2d');
    const width = 50;
    const height = containerHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#08081a';
    ctx.fillRect(0, 0, width, height);

    if (totalMeasures <= 0) return;

    const measH = height / totalMeasures;
    const barMaxW = 30;

    // Draw measures
    for (let m = 0; m < totalMeasures; m++) {
      const y = m * measH;
      const density = densityMap[m] || 0;

      // Density bar
      if (density > 0 && maxDensity > 0) {
        const ratio = density / maxDensity;
        const barW = ratio * barMaxW;
        const r = Math.round(40 + ratio * 215);
        const g = Math.round(40 + (1 - ratio) * 60);
        const b = Math.round(100 + (1 - ratio) * 50);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.globalAlpha = 0.4 + ratio * 0.5;
        ctx.fillRect(width - barW - 2, y + 1, barW, Math.max(measH - 2, 1));
        ctx.globalAlpha = 1;
      }

      // Measure line
      ctx.strokeStyle = '#333355';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Measure number
      const labelEvery = totalMeasures > 100 ? 8 : totalMeasures > 40 ? 4 : 2;
      if (m % labelEvery === 0) {
        ctx.font = '9px Inter, sans-serif';
        ctx.fillStyle = '#889';
        ctx.fillText(`${m}`, 2, y + Math.min(measH / 2 + 3, 12));
      }
    }

    // Viewport indicator
    const BEAT_HEIGHT = 80;
    const bh = BEAT_HEIGHT * zoom;
    const visibleBeats = containerHeight / bh;
    const vpStartMeas = scrollBeat / 4;
    const vpEndMeas = (scrollBeat + visibleBeats) / 4;
    const vpY = vpStartMeas * measH;
    const vpH = Math.max((vpEndMeas - vpStartMeas) * measH, 4);

    ctx.fillStyle = 'rgba(255, 51, 102, 0.25)';
    ctx.fillRect(0, vpY, width, vpH);
    ctx.strokeStyle = '#ff3366';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, vpY, width, vpH);
  }, [scrollBeat, zoom, totalMeasures, densityMap, maxDensity, containerHeight]);

  // Click to jump
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const measure = Math.floor((y / rect.height) * totalMeasures);
    const beat = Math.max(0, measure * 4);
    onScrollBeatChange(beat);
  }, [totalMeasures, onScrollBeatChange]);

  return (
    <div
      ref={containerRef}
      className="w-[50px] shrink-0 border-r border-piu-border cursor-pointer"
      title="Click to jump to measure"
    >
      <canvas
        ref={canvasRef}
        width={50}
        onClick={handleClick}
        className="block w-full h-full"
      />
    </div>
  );
}

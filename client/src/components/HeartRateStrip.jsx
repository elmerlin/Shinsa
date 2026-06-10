import { useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_MAX_HR, hrZoneColor, hrZonesFor, parseHrSeries } from '../utils/heartRate';

function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const FALLBACK_DURATION_S = 115;

/**
 * Heart-rate readout for a play: ♥ avg/peak header + the HR curve as an SVG
 * line over horizontal stripes marking the player's personal zones (% of
 * their max HR), with a 0–25–50–75–100% time axis. Web port of the mobile
 * HeartRateStrip — same math, Tailwind skin.
 */
export default function HeartRateStrip({ avg, peak, series, source, durationS, songDurationS, maxHr, compact = false }) {
  const wrapRef = useRef(null);
  const [chartW, setChartW] = useState(0);
  const avgBpm = Math.round(Number(avg) || 0);
  const peakBpm = Math.round(Number(peak) || 0);
  const points = parseHrSeries(series);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setChartW(Math.round(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (avgBpm <= 0 && peakBpm <= 0) return null;

  const effectiveMax = Number(maxHr) >= 120 ? Number(maxHr) : DEFAULT_MAX_HR;
  const chartH = compact ? 44 : 84;
  const dur = Number(songDurationS) > 0
    ? Number(songDurationS)
    : Number(durationS) > 0
      ? Number(durationS)
      : (points.length > 1 ? FALLBACK_DURATION_S : 0);

  let lo = 90;
  let hi = 190;
  if (points.length > 0) {
    lo = Math.min(...points) - 8;
    hi = Math.max(...points) + 8;
    if (hi - lo < 30) { const mid = (hi + lo) / 2; lo = mid - 15; hi = mid + 15; }
  }
  const yFor = (bpm) => chartH - ((bpm - lo) / (hi - lo)) * chartH;

  const bands = hrZonesFor(effectiveMax)
    .map((z) => {
      const top = Math.min(z.max, hi);
      const bottom = Math.max(z.min, lo);
      if (top <= bottom) return null;
      return { key: z.key, color: z.color, y: yFor(top), h: yFor(bottom) - yFor(top) };
    })
    .filter(Boolean);

  const linePoints = points
    .map((bpm, i) => `${((i / Math.max(1, points.length - 1)) * chartW).toFixed(1)},${yFor(bpm).toFixed(1)}`)
    .join(' ');

  return (
    <div className={`rounded-2xl border border-red-400/30 bg-red-400/10 ${compact ? 'p-2' : 'p-3'} flex flex-col gap-2`}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-red-400">♥</span>
        <span className={`font-display font-bold text-white tabular-nums ${compact ? 'text-base' : 'text-2xl'}`}>
          {avgBpm > 0 ? avgBpm : '—'}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">BPM avg</span>
        <span className="flex-1" />
        {peakBpm > 0 ? (
          <>
            <span className="text-[9px] font-bold tracking-widest text-white/50">PEAK</span>
            <span className="font-display font-bold tabular-nums" style={{ color: hrZoneColor(peakBpm, effectiveMax) }}>
              {peakBpm}
            </span>
          </>
        ) : null}
      </div>

      {points.length > 1 ? (
        <div ref={wrapRef} style={{ height: chartH }}>
          {chartW > 0 ? (
            <svg width={chartW} height={chartH}>
              {bands.map((b) => (
                <rect key={b.key} x={0} y={b.y} width={chartW} height={b.h} fill={b.color} opacity={0.16} />
              ))}
              {[0.25, 0.5, 0.75].map((f) => (
                <rect key={f} x={chartW * f} y={0} width={1} height={chartH} fill="#ffffff" opacity={0.14} />
              ))}
              <polyline
                points={linePoints}
                fill="none"
                stroke="#ffffff"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          ) : null}
        </div>
      ) : null}

      {points.length > 1 && dur > 0 ? (
        <div className="flex justify-between -mt-1">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span key={f} className="text-[9px] font-semibold tabular-nums text-white/40">{fmtClock(dur * f)}</span>
          ))}
        </div>
      ) : null}

      {source === 'workout' && !compact ? (
        <span className="text-[9px] font-semibold text-white/45">Watch workout · zones from max {effectiveMax} BPM</span>
      ) : null}
    </div>
  );
}

/** Horizontal stacked time-in-zone bar + legend (session HR view). */
export function HrZoneBar({ zoneSeconds, maxHr }) {
  const zones = hrZonesFor(maxHr);
  const entries = zones
    .map((z) => ({ ...z, sec: Number(zoneSeconds?.[z.key]) || 0 }))
    .filter((z) => z.sec > 0);
  const total = entries.reduce((sum, z) => sum + z.sec, 0);
  if (total <= 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3.5 overflow-hidden rounded-full bg-white/5">
        {entries.map((z) => (
          <div key={z.key} style={{ flexGrow: z.sec, backgroundColor: z.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {entries.map((z) => (
          <span key={z.key} className="flex items-center gap-1 text-[10px] text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: z.color }} />
            {z.label}
            <span className="font-bold tabular-nums text-gray-200">{Math.round((z.sec / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tierClasses(tier, unlocked) {
  const base = unlocked ? '' : 'opacity-45';
  if (tier === 'bronze') return `${base} bg-amber-700/35 border-amber-400/60 text-amber-100`;
  if (tier === 'silver') return `${base} bg-slate-300/20 border-slate-200/70 text-slate-100`;
  if (tier === 'gold') return `${base} bg-yellow-500/30 border-yellow-300/70 text-yellow-100`;
  if (tier === 'blue') return `${base} bg-sky-500/30 border-sky-300/70 text-sky-100`;
  return `${base} bg-emerald-600/30 border-emerald-300/70 text-emerald-100`;
}

function buildWaypoints(count, columns = 6) {
  const safeCount = Math.max(1, count);
  const safeColumns = Math.max(2, columns);
  const stepX = 106;
  const stepY = 86;
  const points = [];

  for (let i = 0; i < safeCount; i++) {
    const row = Math.floor(i / safeColumns);
    const col = i % safeColumns;
    const snakeCol = row % 2 === 0 ? col : (safeColumns - 1 - col);
    const x = 52 + snakeCol * stepX;
    const y = 52 + row * stepY + (snakeCol % 2 === 0 ? -8 : 8);
    points.push({ x, y });
  }

  const rows = Math.ceil(safeCount / safeColumns);
  const width = 104 + (safeColumns - 1) * stepX;
  const height = 120 + Math.max(0, rows - 1) * stepY;

  return { points, width, height };
}

function interpolatePoint(points, floatIndex) {
  if (!points.length) return { x: 0, y: 0 };
  const maxIndex = points.length - 1;
  const idx = clamp(floatIndex, 0, maxIndex);
  const fromIndex = Math.floor(idx);
  const toIndex = Math.min(maxIndex, fromIndex + 1);
  const from = points[fromIndex];
  const to = points[toIndex];
  const t = idx - fromIndex;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

export default function TitleProgressTab({
  data,
  avatarUrl,
  username,
  isOwner = false,
}) {
  const imported = !!data?.imported;
  const titles = useMemo(() => (Array.isArray(data?.titles) ? data.titles : []), [data]);
  const summary = data?.summary || null;
  const currentIndex = Math.max(0, parseInt(summary?.current_index, 10) || 0);
  const nextTitle = summary?.next_title || null;
  const segmentProgress = clamp((Number(summary?.segment_progress_percent) || 0) / 100, 0, 1);
  const currentFloat = currentIndex + (nextTitle ? segmentProgress : 0);
  const [cursor, setCursor] = useState(currentFloat);
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (target === null) {
      setCursor(currentFloat);
    }
  }, [currentFloat, target]);

  useEffect(() => {
    if (target === null) return undefined;
    let raf = null;
    let active = true;
    const animate = () => {
      setCursor((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.015) {
          if (active) setTarget(null);
          return target;
        }
        const step = Math.min(0.11, Math.max(0.03, Math.abs(diff) * 0.18));
        return prev + Math.sign(diff) * step;
      });
      if (active) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      active = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target]);

  const { points, width, height } = useMemo(() => buildWaypoints(titles.length || 1), [titles.length]);
  const avatarPos = useMemo(() => interpolatePoint(points, cursor), [points, cursor]);

  const levels = Array.isArray(data?.levels) ? data.levels : [];
  const levelMap = useMemo(() => {
    const map = {};
    for (const level of levels) map[level.level] = level;
    return map;
  }, [levels]);

  const nextLevelPoints = nextTitle ? (levelMap[nextTitle.level]?.points || 0) : 0;
  const sameLevelSegment = nextTitle && summary?.current_title?.level === nextTitle.level;
  const segmentStart = sameLevelSegment ? (summary?.current_title?.required_points || 0) : 0;
  const segmentEarned = Math.max(0, nextLevelPoints - segmentStart);
  const segmentNeeded = nextTitle ? Math.max(1, nextTitle.required_points - segmentStart) : 0;
  const displayedProgress = nextTitle ? clamp(Number(summary?.segment_progress_percent) || 0, 0, 100) : 100;
  const isRunning = target !== null;

  if (!data) {
    return (
      <div className="card">
        <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
        <p className="text-sm text-gray-500 mt-3">Loading title progression...</p>
      </div>
    );
  }

  if (!imported) {
    return (
      <div className="card">
        <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
        <p className="text-sm text-gray-400 mt-3">
          Import best scores to unlock and track title progression.
        </p>
      </div>
    );
  }

  if (!summary || titles.length === 0) {
    return (
      <div className="card">
        <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
        <p className="text-sm text-gray-500 mt-3">No title data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-base text-piu-accent">TITLE PROGRESSION</h3>
            <p className="text-xs text-gray-500 mt-1">
              {summary.current_title?.name || 'Beginner'}
              {nextTitle ? ` -> ${nextTitle.name}` : ' -> Completed'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-display font-bold text-piu-gold">{displayedProgress.toFixed(2)}%</p>
            <p className="text-[10px] text-gray-500">to next title</p>
          </div>
        </div>

        {nextTitle ? (
          <div className="mt-3 rounded-lg border border-piu-border/50 bg-piu-dark/60 px-3 py-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-display font-bold text-gray-200">{nextTitle.name}</p>
              <p className="text-[10px] text-gray-500">Level {nextTitle.level} title challenge</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-cyan-200">
                {segmentEarned.toLocaleString()} / {segmentNeeded.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-500">segment points</p>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2">
            <p className="text-sm font-display font-bold text-sky-200">All titles unlocked.</p>
          </div>
        )}

        <div className="mt-4 overflow-x-auto pb-1">
          <div
            className="relative title-map-grid rounded-xl border border-piu-border/50 overflow-hidden"
            style={{ width: `${width}px`, minWidth: `${width}px`, height: `${height}px` }}
          >
            <svg
              className="absolute inset-0 pointer-events-none"
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
            >
              {points.slice(0, -1).map((point, idx) => {
                const nextPoint = points[idx + 1];
                return (
                  <line
                    key={`path-${idx}`}
                    x1={point.x}
                    y1={point.y}
                    x2={nextPoint.x}
                    y2={nextPoint.y}
                    stroke="rgba(148, 163, 184, 0.55)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={idx % 2 === 0 ? '10 8' : '8 7'}
                  />
                );
              })}
            </svg>

            {titles.map((title) => {
              const point = points[title.index];
              const unlocked = !!title.unlocked;
              const isCurrent = title.index === currentIndex;
              const canTravel = unlocked && title.index <= currentIndex;
              const isTarget = target !== null && title.index === target;
              return (
                <button
                  key={title.id}
                  type="button"
                  onClick={() => {
                    if (!canTravel) return;
                    setTarget(title.index);
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-md border transition-all ${tierClasses(title.tier, unlocked)} ${
                    isCurrent ? 'ring-2 ring-white/90 shadow-[0_0_0_2px_rgba(14,165,233,0.55)]' : ''
                  } ${isTarget ? 'ring-2 ring-cyan-300/90' : ''} ${canTravel ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
                  style={{ left: `${point.x}px`, top: `${point.y}px` }}
                  title={`${title.name} (${title.earned_points.toLocaleString()} / ${title.required_points.toLocaleString()})`}
                />
              );
            })}

            <div
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-[82%]"
              style={{ left: `${avatarPos.x}px`, top: `${avatarPos.y}px` }}
            >
              <div className={`relative w-12 h-12 ${isRunning ? 'title-run' : 'title-idle'}`}>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={username || 'avatar'}
                    className="w-full h-full object-cover rounded-sm border-2 border-black/60 title-pixel shadow-lg"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full rounded-sm bg-emerald-700 border-2 border-black/60 flex items-center justify-center font-display font-bold title-pixel">
                    {(username || '?')[0].toUpperCase()}
                  </div>
                )}
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-1.5 rounded-full bg-black/50 blur-[1px]" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-[11px] text-gray-500">
            Click unlocked waypoints to run back along the route.
            {isOwner ? ' Your title updates automatically when best scores change.' : ''}
          </p>
        </div>
      </div>

      <div className="card">
        <h4 className="text-xs font-display font-bold text-piu-accent mb-2">TITLE CHECKPOINTS</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {titles.map((title) => {
            const unlocked = !!title.unlocked;
            const isCurrent = title.index === currentIndex;
            const canTravel = unlocked && title.index <= currentIndex;
            return (
              <button
                key={`checkpoint-${title.id}`}
                type="button"
                onClick={() => {
                  if (!canTravel) return;
                  setTarget(title.index);
                }}
                className={`text-left px-3 py-2 rounded-lg border transition-colors ${tierClasses(title.tier, unlocked)} ${
                  isCurrent ? 'ring-1 ring-white/80' : ''
                } ${canTravel ? 'hover:border-white/90 cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-display font-bold">{title.name}</p>
                  <span className="text-[10px] font-mono">
                    {unlocked ? 'Unlocked' : `${title.progress_percent.toFixed(1)}%`}
                  </span>
                </div>
                {title.required_points > 0 && (
                  <p className="text-[10px] text-gray-200/80 mt-1">
                    Lv.{title.level}: {title.earned_points.toLocaleString()} / {title.required_points.toLocaleString()}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

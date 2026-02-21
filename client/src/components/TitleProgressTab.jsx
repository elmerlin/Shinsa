import React, { useEffect, useMemo, useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const GROUP_ORDER = ['Master', 'Expert', 'Advanced', 'Intermediate', 'Beginner'];

const TIER_PALETTE = {
  beginner: { bg: 'from-emerald-400 to-emerald-700', ring: 'ring-emerald-200/80', glow: 'shadow-emerald-300/70' },
  bronze: { bg: 'from-amber-300 to-amber-700', ring: 'ring-amber-200/80', glow: 'shadow-amber-300/70' },
  silver: { bg: 'from-slate-100 to-slate-500', ring: 'ring-slate-100/90', glow: 'shadow-slate-100/70' },
  gold: { bg: 'from-yellow-200 to-yellow-600', ring: 'ring-yellow-200/90', glow: 'shadow-yellow-200/70' },
  blue: { bg: 'from-cyan-200 to-blue-700', ring: 'ring-cyan-200/90', glow: 'shadow-cyan-200/70' },
  default: { bg: 'from-slate-200 to-slate-600', ring: 'ring-slate-200/70', glow: 'shadow-slate-300/60' },
};

const ZONE_PROPS = {
  child: [
    { icon: '🧸', x: 14, y: 18 },
    { icon: '🧩', x: 77, y: 31 },
    { icon: '🎈', x: 28, y: 64 },
    { icon: '🌳', x: 83, y: 74 },
  ],
  adolescent: [
    { icon: '🛹', x: 20, y: 20 },
    { icon: '🎧', x: 80, y: 34 },
    { icon: '⚡', x: 27, y: 70 },
    { icon: '🪨', x: 74, y: 78 },
  ],
  adult: [
    { icon: '🏰', x: 18, y: 14 },
    { icon: '⚔️', x: 75, y: 28 },
    { icon: '🧭', x: 26, y: 72 },
    { icon: '🔮', x: 81, y: 77 },
  ],
};

function familyName(title) {
  return String(title?.skill_family || '').trim() || 'Other';
}

function buildWorldPoints(count) {
  const safeCount = Math.max(1, count);
  const width = 1000;
  const laneMin = 130;
  const laneMax = 870;
  const stepY = 78;
  const topPad = 120;
  const bottomPad = 110;
  const height = topPad + bottomPad + Math.max(0, safeCount - 1) * stepY;
  const points = [];

  for (let i = 0; i < safeCount; i++) {
    const wave = Math.sin(i * 0.75) * 225 + Math.cos(i * 0.23) * 90;
    const x = clamp(500 + wave, laneMin, laneMax);
    const y = height - bottomPad - i * stepY;
    points.push({ x, y });
  }

  return { points, width, height };
}

function interpolatePoint(points, floatIndex) {
  if (!points.length) return { x: 0, y: 0 };
  const maxIndex = points.length - 1;
  const idx = clamp(floatIndex, 0, maxIndex);
  const fromIdx = Math.floor(idx);
  const toIdx = Math.min(maxIndex, fromIdx + 1);
  const from = points[fromIdx];
  const to = points[toIdx];
  const t = idx - fromIdx;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function getZone(points, titles, families, id, label, className) {
  const indices = titles
    .filter((title) => families.includes(familyName(title)))
    .map((title) => title.index);
  if (indices.length === 0) return null;
  const ys = indices.map((idx) => points[idx].y);
  const top = Math.max(0, Math.min(...ys) - 92);
  const bottom = Math.max(...ys) + 92;
  return {
    id,
    label,
    className,
    top,
    height: Math.max(150, bottom - top),
  };
}

function groupTitles(titles) {
  const ordered = [...titles].sort((a, b) => b.index - a.index);
  const map = new Map();
  for (const title of ordered) {
    const family = familyName(title);
    if (!map.has(family)) map.set(family, []);
    map.get(family).push(title);
  }

  const known = GROUP_ORDER.filter((family) => map.has(family)).map((family) => ({
    family,
    titles: map.get(family),
  }));
  const extra = Array.from(map.keys())
    .filter((family) => !GROUP_ORDER.includes(family))
    .map((family) => ({ family, titles: map.get(family) }));
  return [...known, ...extra];
}

function JourneyCharacter({ running, avatarUrl, username, gender }) {
  const isFemale = gender === 'female';
  const bodyGradient = isFemale ? 'from-pink-300 to-fuchsia-700' : 'from-cyan-300 to-blue-700';
  const accentColor = isFemale ? 'bg-rose-300' : 'bg-sky-200';

  return (
    <div className={`relative w-14 h-16 title-pixel ${running ? 'title-run' : 'title-idle'}`}>
      <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-8 h-2 rounded-full bg-black/60 blur-[1px]" />
      <div className={`absolute left-1/2 top-7 -translate-x-1/2 w-9 h-7 rounded-md border-2 border-black/60 bg-gradient-to-b ${bodyGradient} shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]`} />
      <div className={`absolute left-1/2 top-4 -translate-x-1/2 w-4 h-3 rounded-sm border-2 border-black/60 ${accentColor}`} />
      <div className="absolute left-[34%] top-[76%] w-3 h-5 rounded-b border-2 border-black/60 bg-slate-700" />
      <div className="absolute left-[57%] top-[76%] w-3 h-5 rounded-b border-2 border-black/60 bg-slate-700" />
      <div className="absolute left-[22%] top-[42%] w-3 h-2 rounded-sm border border-black/60 bg-slate-700/80" />
      <div className="absolute left-[72%] top-[42%] w-3 h-2 rounded-sm border border-black/60 bg-slate-700/80" />

      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-8 h-8 rounded-full border-2 border-black/60 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-500">
        {avatarUrl ? (
          <img src={avatarUrl} alt={username || 'avatar'} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-display font-bold text-[10px] text-black">
            {(username || '?')[0].toUpperCase()}
          </div>
        )}
      </div>

      {isFemale ? (
        <div className="absolute left-1/2 top-[2px] -translate-x-1/2 w-10 h-2 rounded-full bg-fuchsia-800/80" />
      ) : (
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 w-4 h-2 rounded-sm bg-sky-900/80" />
      )}
    </div>
  );
}

export default function TitleProgressTab({
  data,
  avatarUrl,
  username,
  gender = '',
  isOwner = false,
}) {
  const imported = !!data?.imported;
  const titles = useMemo(() => (Array.isArray(data?.titles) ? data.titles : []), [data]);
  const groups = useMemo(() => groupTitles(titles), [titles]);
  const summary = data?.summary || null;
  const currentIndex = Math.max(0, parseInt(summary?.current_index, 10) || 0);
  const nextTitle = summary?.next_title || null;
  const segmentProgress = clamp((Number(summary?.segment_progress_percent) || 0) / 100, 0, 1);
  const currentFloat = currentIndex + (nextTitle ? segmentProgress : 0);
  const [cursor, setCursor] = useState(currentFloat);
  const [target, setTarget] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const mapScrollRef = useRef(null);

  useEffect(() => {
    if (target === null) setCursor(currentFloat);
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

  useEffect(() => {
    if (!groups.length || Object.keys(collapsedGroups).length > 0) return;
    const currentFamily = summary?.current_title?.skill_family || '';
    const initial = {};
    for (const group of groups) initial[group.family] = group.family !== currentFamily;
    setCollapsedGroups(initial);
  }, [groups, collapsedGroups, summary]);

  const { points, width, height } = useMemo(() => buildWorldPoints(titles.length || 1), [titles.length]);
  const avatarPos = useMemo(() => interpolatePoint(points, cursor), [points, cursor]);
  const avatarLeftPercent = (avatarPos.x / width) * 100;

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

  const zones = useMemo(() => {
    const child = getZone(points, titles, ['Beginner', 'Intermediate'], 'child', 'Child Realm (Intermediate)', 'title-zone-child');
    const adolescent = getZone(points, titles, ['Advanced'], 'adolescent', 'Adolescent Realm (Advanced)', 'title-zone-adolescent');
    const adult = getZone(points, titles, ['Expert', 'Master'], 'adult', 'Grown Realm (Expert)', 'title-zone-adult');
    return [adult, adolescent, child].filter(Boolean);
  }, [points, titles]);

  useEffect(() => {
    const el = mapScrollRef.current;
    if (!el || !height) return;
    const viewHeight = el.clientHeight;
    const contentHeight = el.scrollHeight;
    const wanted = clamp(avatarPos.y - viewHeight * 0.52, 0, Math.max(0, contentHeight - viewHeight));
    const behavior = target !== null ? 'smooth' : 'auto';
    if (Math.abs(el.scrollTop - wanted) > 8) {
      el.scrollTo({ top: wanted, behavior });
    }
  }, [avatarPos.y, target, height]);

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

        <div className="mt-4 title-map-frame rounded-xl border border-piu-border/50 overflow-hidden">
          <div ref={mapScrollRef} className="max-h-[68vh] sm:max-h-[72vh] overflow-y-auto overflow-x-hidden">
            <div className="relative w-full" style={{ height: `${height}px` }}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mapPathGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7dd3fc" />
                    <stop offset="50%" stopColor="#facc15" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                {points.slice(0, -1).map((point, idx) => {
                  const next = points[idx + 1];
                  return (
                    <line
                      key={`path-${idx}`}
                      x1={point.x}
                      y1={point.y}
                      x2={next.x}
                      y2={next.y}
                      stroke="url(#mapPathGlow)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      opacity="0.55"
                      strokeDasharray={idx % 2 === 0 ? '14 10' : '10 9'}
                    />
                  );
                })}
              </svg>

              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className={`absolute left-2 right-2 rounded-3xl border border-white/20 ${zone.className}`}
                  style={{ top: `${zone.top}px`, height: `${zone.height}px` }}
                >
                  <div className="absolute left-3 top-2 px-2 py-1 rounded-md bg-black/40 text-[10px] font-display font-bold tracking-wide text-white/90">
                    {zone.label}
                  </div>
                  {(ZONE_PROPS[zone.id] || []).map((prop, idx) => (
                    <span
                      key={`${zone.id}-prop-${idx}`}
                      className="absolute w-9 h-9 rounded-full bg-black/25 border border-white/40 flex items-center justify-center text-base backdrop-blur-[1px]"
                      style={{
                        left: `${prop.x}%`,
                        top: `${prop.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      {prop.icon}
                    </span>
                  ))}
                </div>
              ))}

              {titles.map((title) => {
                const point = points[title.index];
                const unlocked = !!title.unlocked;
                const isCurrent = title.index === currentIndex;
                const canTravel = unlocked && title.index <= currentIndex;
                const isTarget = target !== null && title.index === target;
                const palette = TIER_PALETTE[title.tier] || TIER_PALETTE.default;
                return (
                  <button
                    key={title.id}
                    type="button"
                    onClick={() => {
                      if (!canTravel) return;
                      setTarget(title.index);
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-xl border-2 transition-all ${
                      unlocked
                        ? `bg-gradient-to-b ${palette.bg} border-white/85 text-white title-waypoint-unlocked ${palette.glow}`
                        : 'bg-slate-800/80 border-slate-500/80 text-slate-300'
                    } ${
                      isCurrent ? `ring-2 ${palette.ring} scale-110` : ''
                    } ${
                      isTarget ? 'ring-2 ring-cyan-300/90' : ''
                    } ${
                      canTravel ? 'cursor-pointer hover:scale-110' : 'cursor-default'
                    }`}
                    style={{ left: `${(point.x / width) * 100}%`, top: `${point.y}px` }}
                    title={`${title.name} (${title.earned_points.toLocaleString()} / ${title.required_points.toLocaleString()})`}
                  >
                    <span className="text-[13px] leading-none">{unlocked ? '✦' : '🔒'}</span>
                  </button>
                );
              })}

              <div
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-[86%]"
                style={{ left: `${avatarLeftPercent}%`, top: `${avatarPos.y}px` }}
              >
                <JourneyCharacter
                  running={isRunning}
                  avatarUrl={avatarUrl}
                  username={username}
                  gender={gender}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-[11px] text-gray-500">
            Mobile-safe vertical map. Tap unlocked waypoints to run to that checkpoint.
            {isOwner ? ' Title unlocks are computed from imported best scores.' : ''}
          </p>
        </div>
      </div>

      <div className="card">
        <h4 className="text-xs font-display font-bold text-piu-accent mb-2">TITLE CHECKPOINTS</h4>
        <div className="space-y-2">
          {groups.map((group) => {
            const lockedCount = group.titles.filter((title) => !title.unlocked).length;
            const collapsed = collapsedGroups[group.family] !== undefined
              ? collapsedGroups[group.family]
              : group.family !== (summary?.current_title?.skill_family || '');
            return (
              <div key={group.family} className="rounded-lg border border-piu-border/50 bg-piu-dark/40">
                <button
                  type="button"
                  onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group.family]: !collapsed }))}
                  className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left"
                >
                  <div>
                    <p className="text-sm font-display font-bold text-gray-100">{group.family}</p>
                    <p className="text-[10px] text-gray-500">
                      {group.titles.length - lockedCount}/{group.titles.length} unlocked
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{collapsed ? 'Show' : 'Hide'}</span>
                </button>
                {!collapsed && (
                  <div className="px-2 pb-2 space-y-1.5">
                    {group.titles.map((title) => {
                      const unlocked = !!title.unlocked;
                      const isCurrent = title.index === currentIndex;
                      const canTravel = unlocked && title.index <= currentIndex;
                      const palette = TIER_PALETTE[title.tier] || TIER_PALETTE.default;
                      return (
                        <button
                          key={`checkpoint-${title.id}`}
                          type="button"
                          onClick={() => {
                            if (!canTravel) return;
                            setTarget(title.index);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                            unlocked
                              ? `bg-gradient-to-r ${palette.bg} border-white/50 text-white`
                              : 'bg-slate-900/60 border-slate-600/50 text-slate-300'
                          } ${isCurrent ? `ring-1 ${palette.ring}` : ''} ${canTravel ? 'cursor-pointer hover:border-white/90' : 'cursor-default'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-display font-bold">{title.name}</p>
                            <span className="text-[10px] font-mono">
                              {unlocked ? 'UNLOCKED' : `${title.progress_percent.toFixed(1)}%`}
                            </span>
                          </div>
                          {title.required_points > 0 && (
                            <p className="text-[10px] mt-1 opacity-90">
                              Lv.{title.level}: {title.earned_points.toLocaleString()} / {title.required_points.toLocaleString()}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

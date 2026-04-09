import { useEffect, useMemo, useRef, useState } from 'react';
import { getTrainingGapAnalytics } from '../../utils/api';

/* ─── design tokens ─── */

const SLIDER_META = {
  difficulty: { label: 'Chart Difficulty', short: 'Difficulty', color: '#a78bfa', glow: 'rgba(167,139,250,0.3)' },
  pattern:    { label: 'Pattern Familiarity', short: 'Familiarity', color: '#7dd3fc', glow: 'rgba(125,211,252,0.3)' },
  movement:   { label: 'Movement Efficiency', short: 'Efficiency', color: '#f9a8d4', glow: 'rgba(249,168,212,0.3)' },
  speed:      { label: 'Speed Reserve', short: 'Speed', color: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
  stamina:    { label: 'Stamina Reserve', short: 'Stamina', color: '#34d399', glow: 'rgba(52,211,153,0.3)' },
};

const BLOCKER_META = {
  ready:    { label: 'Ready',        color: '#34d399', badge: 'border-emerald-400/30 bg-emerald-950/60 text-emerald-300' },
  mental:   { label: 'Economy Gap',  color: '#7dd3fc', badge: 'border-sky-400/30 bg-sky-950/60 text-sky-300' },
  physical: { label: 'Physical Gap', color: '#f59e0b', badge: 'border-amber-400/30 bg-amber-950/60 text-amber-300' },
  mixed:    { label: 'Mixed Gap',    color: '#f472b6', badge: 'border-pink-400/30 bg-pink-950/60 text-pink-300' },
};

const NARRATIVES = {
  ready: 'Your energy reserve comfortably exceeds this chart\u2019s total cost. At these skill levels, you have headroom to clear.',
  mental: 'Most of the gap is economy debt \u2014 extra energy wasted when pattern reads come late or movement is reactive. More exposure to similar patterns will close this gap without needing more fitness.',
  physical: 'Even with perfect economy, the base physical demand exceeds your current capacity. Building speed and stamina through consistent play at challenging levels is the path forward.',
  mixed: 'Both mental economy and physical capacity are limiting you. You\u2019d benefit from more pattern exposure to cut economy debt, and more intensive sessions to build your physical reserve.',
};

function familiarityHint(v) {
  if (v <= 8)  return '\u22481\u20132 plays \u2014 brand new';
  if (v <= 25) return '\u22485\u201310 plays \u2014 starting to recognise';
  if (v <= 50) return '\u224815\u201330 plays \u2014 somewhat familiar';
  if (v <= 75) return '\u224830\u201360 plays \u2014 well practiced';
  if (v <= 92) return '\u224860\u2013100 plays \u2014 deeply familiar';
  return '100+ plays \u2014 second nature';
}

/* ─── utilities ─── */

function clamp(v, min, max) { return Math.max(min, Math.min(max, Number(v || 0))); }
function round2(v) { return Math.round(Number(v || 0) * 100) / 100; }

function fmt(v, d = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtSigned(v, d = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '--';
  const r = Number(n.toFixed(d));
  const sign = r > 0 ? '+' : r < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(r).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

const enter = (i) => ({
  animation: 'coachEnter 0.55s cubic-bezier(0.16,1,0.3,1) both',
  animationDelay: `${i * 0.07}s`,
});

/* ─── principle simulation ─── */

const LEVEL_POINTS = {
  5:50,6:60,7:70,8:80,9:90,10:100,11:110,12:130,13:160,14:200,
  15:250,16:310,17:380,18:460,19:550,20:650,21:760,22:880,23:1010,
  24:1150,25:1300,
};

function simulatePrinciple({ difficulty, pattern, movement, speed, stamina }) {
  const level = Math.round(5 + (difficulty / 100) * 20);
  const passLoad = (LEVEL_POINTS[level] || 250) * 0.9;

  // physical base cost scales with level
  const physFactor = 1 + 0.18 * (level / 25);
  const baseCost = passLoad * physFactor;

  // mental economy reduces the tax
  const economy = (pattern * 0.55 + movement * 0.45) / 100;
  const economyTax = baseCost * (1 - economy) * 0.5;
  const totalCost = baseCost + economyTax;

  // physical capacity produces your reserve
  const physCapacity = (speed * 0.5 + stamina * 0.5) / 100;
  const reserve = passLoad * 1.85 * physCapacity;

  const passMargin = reserve - totalCost;
  const physGap = Math.max(0, baseCost - reserve);
  const mentalGap = Math.max(0, totalCost - reserve) - physGap;

  let blocker = 'mixed';
  if (totalCost <= reserve) blocker = 'ready';
  else if (mentalGap >= 1.25 * physGap) blocker = 'mental';
  else if (physGap >= 1.25 * mentalGap) blocker = 'physical';

  const effectiveTime = clamp(34 + ((pattern * 0.7 + movement * 0.3) * 0.66), 0, 100);

  return {
    level,
    baseCost: round2(baseCost),
    economyTax: round2(economyTax),
    totalCost: round2(totalCost),
    reserve: round2(reserve),
    passMargin: round2(passMargin),
    physicalGap: round2(physGap),
    mentalGap: round2(mentalGap),
    blockerState: blocker,
    economy: round2(economy * 100),
    effectiveTime: round2(effectiveTime),
  };
}

/* ═══════════════════════════════════════════════════════
   Theory Framework  (static, always visible)
   ═══════════════════════════════════════════════════════ */

function TheoryFramework() {
  return (
    <section className="space-y-3" style={enter(0)}>
      {/* hero */}
      <div className="relative overflow-hidden rounded-2xl border border-piu-border/60 bg-[radial-gradient(ellipse_at_20%_0%,rgba(125,211,252,0.09),transparent_50%),radial-gradient(ellipse_at_80%_100%,rgba(245,158,11,0.07),transparent_50%),rgba(10,14,24,0.96)] px-5 py-6 sm:px-7 sm:py-8">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.015)_50%,transparent_60%)]" />
        <div className="relative max-w-2xl">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-gray-500">Coach Lab</p>
          <h2 className="mt-2 font-display text-xl font-bold leading-tight text-white sm:text-2xl lg:text-3xl">
            Every chart has a mental cost and a physical cost
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-gray-400 sm:text-sm">
            Understanding which one is limiting you changes how you train.
            Use the sliders below to explore how familiarity, efficiency, and fitness interact.
          </p>
        </div>
      </div>

      {/* mental vs physical */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* mental */}
        <div className="group relative overflow-hidden rounded-2xl border border-sky-500/15 bg-gradient-to-b from-sky-950/30 to-piu-card/70 p-4 sm:p-5">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-sky-500/[0.04] blur-2xl transition-all duration-700 group-hover:bg-sky-500/[0.08]" />
          <div className="relative">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10">
              <svg className="h-[18px] w-[18px] text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.8-1.6 5-4 6.3V17a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1.7C6.6 14 5 11.8 5 9a7 7 0 0 1 7-7z" />
                <path d="M10 21h4M12 17v4" />
              </svg>
            </div>
            <p className="text-[10px] font-display uppercase tracking-[0.25em] text-sky-400/70">Mental</p>
            <h3 className="mt-0.5 font-display text-lg font-bold text-sky-100">Economy Gap</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
              When you read patterns late or move reactively, the same chart costs
              <span className="text-sky-300"> extra energy</span> &mdash; before fitness even matters.
            </p>
            <div className="mt-4 space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                <span className="text-gray-400"><span className="font-medium text-sky-200">Pattern Familiarity</span> &mdash; played 100 times vs 1 time</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-400" />
                <span className="text-gray-400"><span className="font-medium text-pink-200">Movement Efficiency</span> &mdash; clean travel vs reactive scrambling</span>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-sky-500/10 bg-sky-500/[0.04] px-3 py-2">
              <p className="text-[11px] leading-relaxed text-sky-300/70">
                Improving economy makes the chart cheaper <em>without</em> getting fitter.
              </p>
            </div>
          </div>
        </div>

        {/* physical */}
        <div className="group relative overflow-hidden rounded-2xl border border-amber-500/15 bg-gradient-to-b from-amber-950/30 to-piu-card/70 p-4 sm:p-5">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-500/[0.04] blur-2xl transition-all duration-700 group-hover:bg-amber-500/[0.08]" />
          <div className="relative">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
              <svg className="h-[18px] w-[18px] text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <p className="text-[10px] font-display uppercase tracking-[0.25em] text-amber-400/70">Physical</p>
            <h3 className="mt-0.5 font-display text-lg font-bold text-amber-100">Physical Gap</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
              Some cost is irreducible &mdash; more notes at higher speed genuinely demands
              <span className="text-amber-300"> more raw output</span> from your body.
            </p>
            <div className="mt-4 space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span className="text-gray-400"><span className="font-medium text-amber-200">Speed Reserve</span> &mdash; capacity to handle the chart&rsquo;s BPM</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span className="text-gray-400"><span className="font-medium text-emerald-200">Stamina Reserve</span> &mdash; sustaining effort from start to finish</span>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-amber-500/10 bg-amber-500/[0.04] px-3 py-2">
              <p className="text-[11px] leading-relaxed text-amber-300/70">
                Closing a physical gap requires consistent play at challenging levels.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* formula */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.05] bg-black/30 px-4 py-3">
        <span className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-2 py-0.5 text-xs font-display font-bold text-amber-200">Base Cost</span>
        <span className="text-sm font-bold text-gray-600">+</span>
        <span className="rounded-md border border-sky-500/20 bg-sky-500/[0.06] px-2 py-0.5 text-xs font-display font-bold text-sky-200">Economy Tax</span>
        <span className="text-sm font-bold text-gray-600">=</span>
        <span className="text-xs font-display font-bold text-white">Total Energy Cost</span>
        <span className="mx-1 hidden text-gray-700 sm:inline">|</span>
        <span className="text-[11px] text-gray-500">Your reserve must exceed this to clear</span>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   Concept Slider
   ═══════════════════════════════════════════════════════ */

function ConceptSlider({ id, value, onChange, hint }) {
  const meta = SLIDER_META[id];
  const trackRef = useRef(null);

  const resolve = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(id, resolve(e));
  };
  const onMove = (e) => {
    if (!trackRef.current?.hasPointerCapture?.(e.pointerId)) return;
    onChange(id, resolve(e));
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-display font-bold text-white">{meta.label}</p>
        <p className="text-lg font-display font-black tabular-nums text-white">{fmt(value, 0)}</p>
      </div>
      {hint && <p className="mb-2 text-[11px] text-gray-500">{hint}</p>}
      <div
        ref={trackRef}
        className="relative h-10 cursor-grab rounded-full border border-white/[0.06] bg-white/[0.02] active:cursor-grabbing sm:h-11"
        style={{ touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
      >
        <div
          className="absolute inset-y-1 left-1 rounded-full transition-[width] duration-75"
          style={{
            width: `calc(${value}% - 8px)`,
            background: `linear-gradient(90deg, ${meta.color}30, ${meta.color})`,
            boxShadow: `0 0 18px ${meta.glow}`,
          }}
        />
        <div
          className="absolute top-1/2 z-10 h-8 w-8 -translate-y-1/2 rounded-full border border-white/20 bg-[#0a0e1a] shadow-lg transition-transform duration-100 active:scale-110 sm:h-9 sm:w-9"
          style={{
            left: `calc(${value}% - 16px)`,
            boxShadow: `0 0 0 1px ${meta.color}44, 0 0 20px ${meta.glow}`,
          }}
        >
          <div className="absolute inset-[3px] rounded-full" style={{ background: `radial-gradient(circle at 35% 35%, #fff, ${meta.color})` }} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Energy Equation Graph  (SVG, animated)
   ═══════════════════════════════════════════════════════ */

function EnergyGraph({ sim }) {
  const maxVal = Math.max(sim.totalCost, sim.reserve, 1);
  const basePct = (sim.baseCost / maxVal) * 100;
  const taxPct = (sim.economyTax / maxVal) * 100;
  const reservePct = (sim.reserve / maxVal) * 100;
  const totalPct = basePct + taxPct;
  const bm = BLOCKER_META[sim.blockerState];

  const W = 380;
  const barH = 28;
  const gap = 24;
  const y1 = 22;
  const y2 = y1 + barH + gap;
  const baseW = (basePct / 100) * W;
  const taxW = (taxPct / 100) * W;
  const resW = (reservePct / 100) * W;
  const totalW = baseW + taxW;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Energy Equation</p>
          <p className="mt-0.5 text-sm font-display font-bold text-white">Lv.{sim.level} chart</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-display font-bold uppercase tracking-[0.12em] ${bm.badge}`}>
          {bm.label}
        </span>
      </div>

      <svg viewBox={`0 0 ${W + 20} ${y2 + barH + 16}`} className="w-full" role="img" aria-label="Energy equation visualization">
        <defs>
          <linearGradient id="eg-base" x1="0" x2="1"><stop offset="0%" stopColor="rgba(52,211,153,0.45)" /><stop offset="100%" stopColor="rgba(52,211,153,1)" /></linearGradient>
          <linearGradient id="eg-tax" x1="0" x2="1"><stop offset="0%" stopColor="rgba(125,211,252,0.5)" /><stop offset="100%" stopColor="rgba(244,114,182,0.85)" /></linearGradient>
          <linearGradient id="eg-reserve" x1="0" x2="1"><stop offset="0%" stopColor="rgba(245,158,11,0.45)" /><stop offset="100%" stopColor="rgba(245,158,11,1)" /></linearGradient>
        </defs>

        {/* labels */}
        <text x="0" y={y1 - 6} fill="#6b7280" fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="600" letterSpacing="0.08em">CHART COST</text>
        <text x={W + 20} y={y1 - 6} fill="#9ca3af" fontSize="10" fontFamily="Rajdhani, sans-serif" fontWeight="700" textAnchor="end">{fmt(sim.totalCost, 0)}</text>

        {/* cost bar: base */}
        <rect x="0" y={y1} width={Math.max(baseW, 0)} height={barH} rx="6" fill="url(#eg-base)" style={{ transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
        {baseW > 40 && <text x={baseW / 2} y={y1 + barH / 2 + 3.5} fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="600" textAnchor="middle">Base {fmt(sim.baseCost, 0)}</text>}

        {/* cost bar: tax */}
        <rect x={baseW} y={y1} width={Math.max(taxW, 0)} height={barH} rx="6" fill="url(#eg-tax)" style={{ transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
        {taxW > 40 && <text x={baseW + taxW / 2} y={y1 + barH / 2 + 3.5} fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="600" textAnchor="middle">Tax {fmt(sim.economyTax, 0)}</text>}

        {/* divider zone */}
        <line x1={totalW} y1={y1 + barH + 2} x2={totalW} y2={y2 - 2} stroke="white" strokeOpacity="0.1" strokeDasharray="3 2" style={{ transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)' }} />

        {/* reserve label */}
        <text x="0" y={y2 - 6} fill="#6b7280" fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="600" letterSpacing="0.08em">YOUR RESERVE</text>
        <text x={W + 20} y={y2 - 6} fill="#9ca3af" fontSize="10" fontFamily="Rajdhani, sans-serif" fontWeight="700" textAnchor="end">{fmt(sim.reserve, 0)}</text>

        {/* reserve bar */}
        <rect x="0" y={y2} width={Math.max(resW, 0)} height={barH} rx="6" fill="url(#eg-reserve)" style={{ transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
        {resW > 50 && <text x={resW / 2} y={y2 + barH / 2 + 3.5} fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="600" textAnchor="middle">Reserve {fmt(sim.reserve, 0)}</text>}

        {/* comparison line */}
        <line x1={totalW} y1={y1 - 2} x2={totalW} y2={y2 + barH + 2} stroke={bm.color} strokeOpacity="0.25" strokeDasharray="4 3" strokeWidth="1" style={{ transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>

      {/* legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Base cost (physical)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-gradient-to-r from-sky-400 to-pink-400" />Economy tax (mental)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Your reserve</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Blocker Narrative + Metrics
   ═══════════════════════════════════════════════════════ */

function BlockerNarrative({ sim }) {
  const bm = BLOCKER_META[sim.blockerState];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: bm.color, boxShadow: `0 0 10px ${bm.color}` }} />
        <div className="min-w-0">
          <p className="font-display text-sm font-bold" style={{ color: bm.color }}>{bm.label}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-400">{NARRATIVES[sim.blockerState]}</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Level Curve Graph  (energy cost across all levels)
   ═══════════════════════════════════════════════════════ */

function findCrossover(points, key, reserve) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i][key], b = points[i + 1][key];
    if (a <= reserve && b > reserve) {
      const t = (reserve - a) / (b - a);
      return round2(points[i].level + t);
    }
  }
  return null;
}

function LevelCurveGraph({ sim, sliders }) {
  const levels = [];
  for (let l = 5; l <= 25; l++) levels.push(l);

  const economy = (sliders.pattern * 0.55 + sliders.movement * 0.45) / 100;

  const points = levels.map((l) => {
    const passLoad = (LEVEL_POINTS[l] || 250) * 0.9;
    const physFactor = 1 + 0.18 * (l / 25);
    const baseCost = passLoad * physFactor;
    const economyTax = baseCost * (1 - economy) * 0.5;
    return { level: l, baseCost, totalCost: baseCost + economyTax };
  });

  const reserve = sim.reserve;
  const maxY = Math.max(...points.map((p) => p.totalCost), reserve) * 1.12;

  const W = 400, H = 220;
  const pL = 40, pR = 14, pT = 14, pB = 28;
  const plotW = W - pL - pR;
  const plotH = H - pT - pB;

  const xOf = (l) => pL + ((l - 5) / 20) * plotW;
  const yOf = (v) => pT + plotH - (v / maxY) * plotH;

  const mkLine = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.level).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(' ');
  const mkReverse = (key) => [...points].reverse().map((p) => `L${xOf(p.level).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(' ');

  const baseLine = mkLine('baseCost');
  const totalLine = mkLine('totalCost');
  const baseFillPath = `${baseLine} L${xOf(25).toFixed(1)},${yOf(0).toFixed(1)} L${xOf(5).toFixed(1)},${yOf(0).toFixed(1)} Z`;
  const debtFillPath = `${totalLine} ${mkReverse('baseCost')} Z`;

  const currentLimit = findCrossover(points, 'totalCost', reserve);
  const physCeiling = findCrossover(points, 'baseCost', reserve);

  const gridLevels = [5, 10, 15, 20, 25];
  const yTicks = [];
  const step = Math.pow(10, Math.floor(Math.log10(maxY))) / 2 || 100;
  for (let v = step; v < maxY; v += step) yTicks.push(v);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-4" style={enter(2)}>
      <div className="mb-1">
        <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Level Landscape</p>
        <h4 className="mt-0.5 font-display text-base font-bold text-white sm:text-lg">Energy cost across all levels at your current settings</h4>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-gray-500">
        The green area is the irreducible physical floor &mdash; even with perfect economy.
        The blue layer on top is the economy debt your current familiarity and efficiency add.
        The amber line is your energy reserve.
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Energy cost across levels">
        {/* grid */}
        {gridLevels.map((l) => (
          <g key={`gl-${l}`}>
            <line x1={xOf(l)} y1={pT} x2={xOf(l)} y2={H - pB} stroke="white" strokeOpacity="0.04" />
            <text x={xOf(l)} y={H - pB + 14} fill="#4b5563" fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="600" textAnchor="middle">Lv.{l}</text>
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={`yt-${v}`}>
            <line x1={pL} y1={yOf(v)} x2={W - pR} y2={yOf(v)} stroke="white" strokeOpacity="0.03" />
            <text x={pL - 5} y={yOf(v) + 3} fill="#4b5563" fontSize="8" fontFamily="Rajdhani, sans-serif" fontWeight="600" textAnchor="end">{fmt(v, 0)}</text>
          </g>
        ))}

        {/* base cost fill */}
        <path d={baseFillPath} fill="rgba(52,211,153,0.1)" style={{ transition: 'all 0.4s ease' }} />
        <path d={baseLine} fill="none" stroke="rgba(52,211,153,0.7)" strokeWidth="1.5" strokeLinejoin="round" style={{ transition: 'all 0.4s ease' }} />

        {/* economy debt fill */}
        <path d={debtFillPath} fill="rgba(125,211,252,0.08)" style={{ transition: 'all 0.4s ease' }} />
        <path d={totalLine} fill="none" stroke="rgba(125,211,252,0.7)" strokeWidth="1.5" strokeLinejoin="round" style={{ transition: 'all 0.4s ease' }} />

        {/* reserve line */}
        <line x1={pL} y1={yOf(reserve)} x2={W - pR} y2={yOf(reserve)} stroke="rgba(245,158,11,0.65)" strokeWidth="1.5" strokeDasharray="6 4" style={{ transition: 'all 0.4s ease' }} />
        <text x={W - pR} y={yOf(reserve) - 5} fill="rgba(245,158,11,0.8)" fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="700" textAnchor="end">Reserve</text>

        {/* current difficulty marker */}
        <line x1={xOf(sim.level)} y1={pT} x2={xOf(sim.level)} y2={H - pB} stroke="rgba(167,139,250,0.3)" strokeWidth="1" strokeDasharray="3 3" style={{ transition: 'all 0.4s ease' }} />
        <circle cx={xOf(sim.level)} cy={yOf(sim.totalCost)} r="4" fill="rgba(167,139,250,0.9)" stroke="white" strokeWidth="1" style={{ transition: 'all 0.4s ease' }} />

        {/* crossover markers */}
        {currentLimit && (
          <g style={{ transition: 'all 0.4s ease' }}>
            <line x1={xOf(currentLimit)} y1={yOf(reserve) - 8} x2={xOf(currentLimit)} y2={yOf(reserve) + 8} stroke="rgba(125,211,252,0.6)" strokeWidth="2" />
            <text x={xOf(currentLimit)} y={yOf(reserve) + 20} fill="rgba(125,211,252,0.7)" fontSize="8" fontFamily="Rajdhani, sans-serif" fontWeight="600" textAnchor="middle">Current limit</text>
            <text x={xOf(currentLimit)} y={yOf(reserve) + 29} fill="rgba(125,211,252,0.5)" fontSize="8" fontFamily="Rajdhani, sans-serif" textAnchor="middle">~Lv.{Math.round(currentLimit)}</text>
          </g>
        )}
        {physCeiling && (
          <g style={{ transition: 'all 0.4s ease' }}>
            <line x1={xOf(physCeiling)} y1={yOf(reserve) - 8} x2={xOf(physCeiling)} y2={yOf(reserve) + 8} stroke="rgba(52,211,153,0.6)" strokeWidth="2" />
            <text x={xOf(physCeiling)} y={yOf(reserve) - 14} fill="rgba(52,211,153,0.7)" fontSize="8" fontFamily="Rajdhani, sans-serif" fontWeight="600" textAnchor="middle">Physical ceiling</text>
            <text x={xOf(physCeiling)} y={yOf(reserve) - 5} fill="rgba(52,211,153,0.5)" fontSize="8" fontFamily="Rajdhani, sans-serif" textAnchor="middle">~Lv.{Math.round(physCeiling)}</text>
          </g>
        )}
        {currentLimit && physCeiling && physCeiling > currentLimit && (
          <g>
            <rect x={xOf(currentLimit)} y={yOf(reserve) - 3} width={xOf(physCeiling) - xOf(currentLimit)} height="6" rx="3" fill="rgba(125,211,252,0.12)" stroke="rgba(125,211,252,0.2)" strokeWidth="0.5" style={{ transition: 'all 0.4s ease' }} />
          </g>
        )}

        {/* axes */}
        <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} stroke="white" strokeOpacity="0.06" />
        <line x1={pL} y1={pT} x2={pL} y2={H - pB} stroke="white" strokeOpacity="0.06" />
      </svg>

      {/* legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400/70" />Physical floor (perfect economy)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-sky-400/60" />+ Economy debt (your settings)</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-amber-400/70" />Your reserve</span>
        {currentLimit && physCeiling && physCeiling > currentLimit && (
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-sky-400/15 border border-sky-400/20" />Unlockable through practice</span>
        )}
      </div>
    </div>
  );
}

function MetricStrip({ sim }) {
  const metrics = [
    { label: 'Pass Margin', value: fmtSigned(sim.passMargin, 0), positive: sim.passMargin >= 0 },
    { label: 'Economy', value: `${fmt(sim.economy, 0)}%` },
    { label: 'Eff. Time', value: `${fmt(sim.effectiveTime, 0)}%` },
    { label: 'Physical Gap', value: fmt(sim.physicalGap, 0) },
    { label: 'Mental Gap', value: fmt(sim.mentalGap, 0) },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-center">
          <p className="text-[9px] font-display uppercase tracking-[0.2em] text-gray-500">{m.label}</p>
          <p className={`mt-0.5 text-lg font-display font-black tabular-nums ${m.positive === true ? 'text-emerald-300' : m.positive === false ? 'text-red-300' : 'text-white'}`}>
            {m.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Export
   ═══════════════════════════════════════════════════════ */

export default function TrainingAnalyticsTab({ userId, mode, syncStale = false, lastSyncedAt = '' }) {
  const [sliders, setSliders] = useState({
    difficulty: 50,
    pattern: 40,
    movement: 40,
    speed: 50,
    stamina: 50,
  });
  const [initialized, setInitialized] = useState(false);

  /* optionally seed sliders from real player data */
  useEffect(() => {
    if (!userId || initialized || mode === 'overall') return;
    let cancelled = false;
    getTrainingGapAnalytics(userId, { mode })
      .then((data) => {
        if (cancelled) return;
        const s = data?.concepts?.supply;
        if (s) {
          setSliders((prev) => ({
            ...prev,
            pattern: clamp(Number(s.pattern_recognition || 40), 0, 100),
            movement: clamp(Number(s.movement_control || 40), 0, 100),
            speed: clamp(Number(s.speed_reserve || 50), 0, 100),
            stamina: clamp(Number(s.stamina_reserve || 50), 0, 100),
            difficulty: data.selection?.target_level
              ? clamp(((data.selection.target_level - 5) / 20) * 100, 0, 100)
              : 50,
          }));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setInitialized(true); });
    return () => { cancelled = true; };
  }, [userId, mode, initialized]);

  const sim = useMemo(() => simulatePrinciple(sliders), [sliders]);

  const update = (key, val) => {
    setSliders((prev) => ({ ...prev, [key]: round2(clamp(val, 0, 100)) }));
  };

  if (mode === 'overall') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-piu-border/50 bg-piu-card/90 px-6 py-12 text-center" style={enter(0)}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-piu-border/40 bg-white/[0.04]">
          <svg className="h-6 w-6 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 14h4v8H4zM10 10h4v12h-4zM16 6h4v16h-4z" /></svg>
        </div>
        <p className="text-[10px] font-display uppercase tracking-[0.3em] text-gray-500">Coach Lab</p>
        <h3 className="mt-2 font-display text-xl font-bold text-white sm:text-2xl">Mode-specific in v1</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-400">
          Switch to Singles or Doubles above and the lab will model the energy equation around your pass envelope.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {syncStale && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[13px] text-amber-200" style={enter(0)}>
          Training sync looks stale{lastSyncedAt ? ` since ${new Date(lastSyncedAt).toLocaleDateString()}` : ''}. Starting values may not reflect your latest sessions.
        </div>
      )}

      {/* 1. Theory */}
      <TheoryFramework />

      {/* 2. Interactive Lab */}
      <section
        className="relative overflow-hidden rounded-2xl border border-piu-border/50 bg-[radial-gradient(ellipse_at_top,rgba(167,139,250,0.06),transparent_40%),radial-gradient(ellipse_at_80%_80%,rgba(52,211,153,0.05),transparent_35%),rgba(10,14,24,0.97)] p-4 sm:p-5"
        style={enter(1)}
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.012),transparent)] opacity-50" />
        <div className="relative">
          <div className="mb-5">
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-gray-500">Principle Explorer</p>
            <h3 className="mt-1 font-display text-lg font-bold text-white sm:text-xl">Drag the sliders, watch the energy story change</h3>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
            {/* Left: sliders */}
            <div className="space-y-4">
              {/* chart difficulty */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                  <p className="text-[10px] font-display uppercase tracking-[0.22em] text-violet-400/70">Chart</p>
                </div>
                <ConceptSlider id="difficulty" value={sliders.difficulty} onChange={update} hint={`Lv.${sim.level} \u2014 ${sim.level <= 10 ? 'beginner' : sim.level <= 15 ? 'intermediate' : sim.level <= 20 ? 'advanced' : 'expert'} territory`} />
              </div>

              {/* mental */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  <p className="text-[10px] font-display uppercase tracking-[0.22em] text-sky-400/70">Mental Economy</p>
                </div>
                <div className="space-y-2">
                  <ConceptSlider id="pattern" value={sliders.pattern} onChange={update} hint={familiarityHint(sliders.pattern)} />
                  <ConceptSlider id="movement" value={sliders.movement} onChange={update} />
                </div>
                <div className="mt-2 flex gap-4 text-[11px] text-gray-500">
                  <span>Economy <span className="font-display font-bold text-sky-300">{fmt(sim.economy, 0)}%</span></span>
                  <span>Eff. Time <span className="font-display font-bold text-sky-300">{fmt(sim.effectiveTime, 0)}%</span></span>
                </div>
              </div>

              {/* physical */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <p className="text-[10px] font-display uppercase tracking-[0.22em] text-amber-400/70">Physical Capacity</p>
                </div>
                <div className="space-y-2">
                  <ConceptSlider id="speed" value={sliders.speed} onChange={update} />
                  <ConceptSlider id="stamina" value={sliders.stamina} onChange={update} />
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  Reserve <span className="font-display font-bold text-amber-300">{fmt(sim.reserve, 0)}</span>
                </div>
              </div>
            </div>

            {/* Right: graph + narrative */}
            <div className="space-y-3">
              <EnergyGraph sim={sim} />
              <BlockerNarrative sim={sim} />
              <MetricStrip sim={sim} />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Level landscape */}
      <LevelCurveGraph sim={sim} sliders={sliders} />
    </div>
  );
}

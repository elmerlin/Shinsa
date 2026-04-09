import { useEffect, useMemo, useRef, useState } from 'react';
import PiuChartJacket from '../PiuChartJacket';
import { getTrainingGapAnalytics } from '../../utils/api';

/* ─── design tokens ─── */

const CONCEPT_META = {
  pattern_recognition: { label: 'Pattern Recognition', short: 'Recognition', color: '#7dd3fc', glow: 'rgba(125,211,252,0.35)', group: 'mental' },
  movement_control: { label: 'Movement Control', short: 'Control', color: '#f9a8d4', glow: 'rgba(249,168,212,0.35)', group: 'mental' },
  speed_reserve: { label: 'Speed Reserve', short: 'Speed', color: '#f59e0b', glow: 'rgba(245,158,11,0.35)', group: 'physical' },
  stamina_reserve: { label: 'Stamina Reserve', short: 'Stamina', color: '#34d399', glow: 'rgba(52,211,153,0.35)', group: 'physical' },
};

const RAIL_ORDER = ['pattern_recognition', 'movement_control', 'speed_reserve', 'stamina_reserve'];

const BLOCKER_META = {
  ready:    { label: 'Ready',        color: '#34d399', badge: 'border-emerald-400/30 bg-emerald-950/60 text-emerald-300', icon: '✓' },
  mental:   { label: 'Economy Gap',  color: '#7dd3fc', badge: 'border-sky-400/30 bg-sky-950/60 text-sky-300', icon: '◇' },
  physical: { label: 'Physical Gap', color: '#f59e0b', badge: 'border-amber-400/30 bg-amber-950/60 text-amber-300', icon: '△' },
  mixed:    { label: 'Mixed',        color: '#f472b6', badge: 'border-pink-400/30 bg-pink-950/60 text-pink-300', icon: '◈' },
};

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
  const sign = r > 0 ? '+' : r < 0 ? '-' : '';
  return `${sign}${Math.abs(r).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

const enter = (i) => ({
  animation: 'coachEnter 0.55s cubic-bezier(0.16,1,0.3,1) both',
  animationDelay: `${i * 0.07}s`,
});

/* ─── simulation model (unchanged logic) ─── */

function simulateGapModel({ level, supply, demand, avgPlayLoad, trainingRatio }) {
  const BP = {
    1:10,2:20,3:30,4:40,5:50,6:60,7:70,8:80,9:90,10:100,
    11:110,12:130,13:160,14:200,15:250,16:310,17:380,18:460,
    19:550,20:650,21:760,22:880,23:1010,24:1150,25:1300,26:1460,27:1630,28:1810,
  };
  const passLoad = (BP[level] || BP[1]) * 0.9;
  const spdNorm = clamp((demand?.speed_reserve || 0) / 100, 0, 1);
  const staNorm = clamp((demand?.stamina_reserve || 0) / 100, 0, 1);
  const physFactor = 1 + 0.18 * spdNorm + 0.22 * staNorm;
  const baseDemand = passLoad * physFactor;
  const execEcon = Number(supply?.pattern_recognition || 0) * 0.55 + Number(supply?.movement_control || 0) * 0.45;
  const econNorm = clamp(execEcon / 100, 0, 1);
  const econTax = baseDemand * (1 - econNorm) * 0.5;
  const actualDemand = baseDemand + econTax;
  const reserve = Number(avgPlayLoad || 0) * clamp(Number(trainingRatio || 100) / 100, 0.75, 1.2);
  const passMargin = reserve - actualDemand;
  const physGap = Math.max(0, baseDemand - reserve);
  const mentalGap = Math.max(0, actualDemand - reserve) - physGap;

  let blocker = 'mixed';
  if (actualDemand <= reserve) blocker = 'ready';
  else if (mentalGap >= 1.25 * physGap) blocker = 'mental';
  else if (physGap >= 1.25 * mentalGap) blocker = 'physical';

  const effTime = clamp(34 + ((Number(supply?.pattern_recognition || 0) * 0.7 + Number(supply?.movement_control || 0) * 0.3) * 0.66), 0, 100);

  return {
    pass_load: round2(passLoad), chart_physical_factor: round2(physFactor),
    base_demand: round2(baseDemand), economy_tax: round2(econTax),
    actual_demand: round2(actualDemand), reserve: round2(reserve),
    pass_margin: round2(passMargin), physical_gap: round2(physGap),
    mental_gap_to_close: round2(mentalGap), blocker_state: blocker,
    execution_economy: round2(execEcon), effective_time: round2(effTime),
    irreducibly_physical: round2(baseDemand), economy_debt: round2(econTax),
  };
}

/* ═══════════════════════════════════════════════════════
   SECTION 1 — Theory Framework  (static, always visible)
   ═══════════════════════════════════════════════════════ */

function TheoryFramework() {
  return (
    <section className="space-y-3" style={enter(0)}>
      {/* ── hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-piu-border/60 bg-[radial-gradient(ellipse_at_20%_0%,rgba(125,211,252,0.09),transparent_50%),radial-gradient(ellipse_at_80%_100%,rgba(245,158,11,0.07),transparent_50%),rgba(10,14,24,0.96)] px-5 py-6 sm:px-7 sm:py-8">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.015)_50%,transparent_60%)]" />
        <div className="relative max-w-2xl">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-gray-500">Coach Lab</p>
          <h2 className="mt-2 font-display text-xl font-bold leading-tight text-white sm:text-2xl lg:text-3xl">
            Every chart has a mental cost and a physical cost
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-gray-400 sm:text-sm">
            Understanding which one is limiting you changes how you train.
            Explore the model below to see where your energy actually goes.
          </p>
        </div>
      </div>

      {/* ── mental vs physical cards ── */}
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
              <span className="text-sky-300"> extra energy</span> — before fitness even matters.
            </p>
            <div className="mt-4 space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CONCEPT_META.pattern_recognition.color }} />
                <span className="text-gray-400"><span className="font-medium text-sky-200">Pattern Recognition</span> — reading earlier gives you more time to react calmly</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CONCEPT_META.movement_control.color }} />
                <span className="text-gray-400"><span className="font-medium text-pink-200">Movement Control</span> — cleaner travel means less wasted output</span>
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
              Some cost is irreducible — more notes at higher speed genuinely demands
              <span className="text-amber-300"> more raw output</span> from your body.
            </p>
            <div className="mt-4 space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CONCEPT_META.speed_reserve.color }} />
                <span className="text-gray-400"><span className="font-medium text-amber-200">Speed Reserve</span> — capacity to handle the chart's BPM and density</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CONCEPT_META.stamina_reserve.color }} />
                <span className="text-gray-400"><span className="font-medium text-emerald-200">Stamina Reserve</span> — sustaining that effort from start to finish</span>
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

      {/* ── formula bar ── */}
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
   SECTION 2 — Chart Selection
   ═══════════════════════════════════════════════════════ */

function LevelSelector({ levels, currentLevel, onSelect, staggerIdx }) {
  return (
    <div className="rounded-2xl border border-piu-border/50 bg-piu-card/90 p-3 sm:p-4" style={enter(staggerIdx)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Target Level</p>
          <p className="mt-0.5 text-[13px] text-gray-400">Pick the lane you want the lab to diagnose.</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-display font-black text-white">
          Lv.{currentLevel}
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 snap-x">
        {(levels || []).map((lv) => (
          <button
            key={lv.level}
            type="button"
            onClick={() => onSelect(lv.level)}
            className={`min-w-[68px] snap-start rounded-xl border px-3 py-2 text-left transition-all duration-200 active:scale-95 ${
              lv.level === currentLevel
                ? 'border-white/30 bg-white/10 text-white shadow-[0_0_16px_rgba(255,255,255,0.06)]'
                : lv.is_nearby
                  ? 'border-piu-border/40 bg-black/20 text-gray-300 hover:border-white/15'
                  : 'border-transparent bg-black/10 text-gray-500'
            }`}
          >
            <p className="font-display text-sm font-black">Lv.{lv.level}</p>
            <p className="text-[11px] text-gray-500">{lv.chart_count} charts</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChartStrip({ charts, selectedChartId, onSelect, staggerIdx }) {
  return (
    <div className="rounded-2xl border border-piu-border/50 bg-piu-card/90 p-3 sm:p-4" style={enter(staggerIdx)}>
      <div className="mb-3">
        <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Chart Focus</p>
        <p className="mt-0.5 text-[13px] text-gray-400">Swap charts to compare how the blockers shift.</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x">
        {(charts || []).map((chart) => {
          const meta = BLOCKER_META[chart?.derived?.blocker_state] || BLOCKER_META.mixed;
          const sel = chart.chart_id === selectedChartId;
          return (
            <button
              key={chart.chart_id}
              type="button"
              onClick={() => onSelect(chart.chart_id)}
              className={`min-w-[220px] snap-start rounded-2xl border p-3 text-left transition-all duration-200 active:scale-[0.98] ${
                sel
                  ? 'border-white/25 bg-white/[0.06] shadow-[0_0_20px_rgba(255,255,255,0.04)]'
                  : 'border-piu-border/30 bg-black/20 hover:border-white/15'
              }`}
            >
              <div className="flex items-start gap-3">
                <PiuChartJacket title={chart.title} mode={chart.mode} level={chart.level} jacketUrl={chart.jacket_url} size="wide" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-white">{chart.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {chart.best_record ? `${chart.best_record.grade} \u2022 ${fmt(chart.best_record.score)}` : 'Unplayed'}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-gray-500">Cost {fmt(chart?.derived?.actual_demand, 0)}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-display font-bold uppercase tracking-wider ${meta.badge}`}>{meta.label}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION 3 — Coach Lab  (interactive sliders + output)
   ═══════════════════════════════════════════════════════ */

function DraggableRail({ conceptKey, value, onChange }) {
  const meta = CONCEPT_META[conceptKey];
  const trackRef = useRef(null);

  const resolve = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(conceptKey, resolve(e));
  };

  const onMove = (e) => {
    if (!trackRef.current?.hasPointerCapture?.(e.pointerId)) return;
    onChange(conceptKey, resolve(e));
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-gray-500">{meta.short}</p>
          <p className="truncate text-sm font-display font-bold text-white">{meta.label}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-display font-black tabular-nums text-white">{fmt(value, 0)}</p>
          <p className="text-[9px] uppercase tracking-[0.2em] text-gray-600">readiness</p>
        </div>
      </div>
      <div
        ref={trackRef}
        className="relative h-11 cursor-grab rounded-full border border-white/[0.06] bg-white/[0.02] active:cursor-grabbing sm:h-12"
        style={{ touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
      >
        <div
          className="absolute inset-y-1 left-1 rounded-full transition-[width] duration-75"
          style={{
            width: `calc(${value}% - 8px)`,
            background: `linear-gradient(90deg, ${meta.color}30, ${meta.color})`,
            boxShadow: `0 0 20px ${meta.glow}`,
          }}
        />
        <div
          className="absolute top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-white/20 bg-[#0a0e1a] shadow-lg transition-transform duration-100 active:scale-110 sm:h-10 sm:w-10"
          style={{
            left: `calc(${value}% - 18px)`,
            boxShadow: `0 0 0 1px ${meta.color}44, 0 0 24px ${meta.glow}`,
          }}
        >
          <div className="absolute inset-[3px] rounded-full" style={{ background: `radial-gradient(circle at 35% 35%, #fff, ${meta.color})` }} />
        </div>
      </div>
    </div>
  );
}

function CoachLab({ payload, labSupply, onSupplyChange, simulation, selectedChart, staggerIdx }) {
  const bm = BLOCKER_META[simulation.blocker_state] || BLOCKER_META.mixed;

  const metrics = [
    { label: 'Pass Margin', value: fmtSigned(simulation.pass_margin, 0), highlight: simulation.pass_margin >= 0 },
    { label: 'Economy', value: `${fmt(simulation.execution_economy, 0)}%` },
    { label: 'Eff. Time', value: `${fmt(simulation.effective_time, 0)}%` },
    { label: 'Energy Cost', value: fmt(simulation.actual_demand, 0) },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-piu-border/50 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.07),transparent_40%),radial-gradient(ellipse_at_80%_20%,rgba(244,114,182,0.05),transparent_30%),rgba(10,14,24,0.97)] p-4 sm:p-5" style={enter(staggerIdx)}>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.015),transparent)] opacity-50" />
      <div className="relative">
        {/* header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-gray-500">Interactive Lab</p>
            <h3 className="mt-1 font-display text-lg font-bold text-white sm:text-xl">Move the causes, watch the story change</h3>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-[0.15em] ${bm.badge}`}
            style={{ boxShadow: `0 0 16px ${bm.color}18` }}
          >
            <span className="animate-coach-pulse">{bm.icon}</span>
            {bm.label}
          </span>
        </div>

        {/* skill chips (from selected chart) */}
        {selectedChart?.skills?.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {selectedChart.skills.slice(0, 8).map((skill) => (
              <span key={skill.slug} className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] text-gray-400">{skill.name}</span>
            ))}
          </div>
        )}

        {/* sliders + metrics */}
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-2.5">
            {RAIL_ORDER.map((key) => (
              <DraggableRail key={key} conceptKey={key} value={labSupply[key]} onChange={onSupplyChange} />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 content-start lg:grid-cols-1">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors duration-300">
                <p className="text-[10px] font-display uppercase tracking-[0.2em] text-gray-500">{m.label}</p>
                <p className={`mt-1 text-xl font-display font-black tabular-nums sm:text-2xl ${m.highlight === false ? 'text-red-300' : m.highlight ? 'text-emerald-300' : 'text-white'}`}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION 4 — Analysis Dashboard
   ═══════════════════════════════════════════════════════ */

function EnergyStack({ simulation, staggerIdx }) {
  const total = Math.max(simulation.actual_demand, simulation.reserve, 1);
  const basePct = clamp((simulation.base_demand / total) * 100, 0, 100);
  const taxPct = clamp((simulation.economy_tax / total) * 100, 0, 100);
  const reservePct = clamp((simulation.reserve / total) * 100, 0, 100);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4" style={enter(staggerIdx)}>
      <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Energy Stack</p>
      <h4 className="mt-1 font-display text-base font-bold text-white sm:text-lg">Cost vs reserve</h4>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-gray-400">
            <span>Chart cost</span>
            <span className="tabular-nums">{fmt(simulation.actual_demand, 0)}</span>
          </div>
          <div className="flex h-5 overflow-hidden rounded-full bg-white/[0.03]">
            <div className="h-full rounded-l-full" style={{ width: `${basePct}%`, background: 'linear-gradient(90deg,rgba(52,211,153,0.5),rgba(52,211,153,1))', animation: 'coachBarFill 0.8s cubic-bezier(0.16,1,0.3,1) both' }} />
            <div className="h-full" style={{ width: `${taxPct}%`, background: 'linear-gradient(90deg,rgba(125,211,252,0.5),rgba(244,114,182,0.85))', animation: 'coachBarFill 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s both' }} />
          </div>
          <div className="mt-1.5 flex gap-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Base</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-pink-400" /> Economy tax</span>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-gray-400">
            <span>Your reserve</span>
            <span className="tabular-nums">{fmt(simulation.reserve, 0)}</span>
          </div>
          <div className="h-5 overflow-hidden rounded-full bg-white/[0.03]">
            <div className="h-full rounded-full" style={{ width: `${reservePct}%`, background: 'linear-gradient(90deg,rgba(245,158,11,0.5),rgba(245,158,11,1))', animation: 'coachBarFill 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s both' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function GapSummary({ simulation, staggerIdx }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4" style={enter(staggerIdx)}>
      <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Gap Breakdown</p>
      <h4 className="mt-1 font-display text-base font-bold text-white sm:text-lg">Where this chart is taxing you</h4>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-amber-400/60">Irreducibly physical</p>
          <p className="mt-1 text-xl font-display font-black tabular-nums text-white">{fmt(simulation.irreducibly_physical, 0)}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">Base cost even with perfect economy.</p>
        </div>
        <div className="rounded-xl border border-sky-500/10 bg-sky-500/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-sky-400/60">Economy debt</p>
          <p className="mt-1 text-xl font-display font-black tabular-nums text-white">{fmt(simulation.economy_debt, 0)}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">Extra cost from late reads and reactive travel.</p>
        </div>
      </div>
      <div className="mt-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
        <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-gray-500">Gap split</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Physical gap</span>
          <span className="font-display font-bold tabular-nums text-amber-200">{fmt(simulation.physical_gap, 0)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm">
          <span className="text-gray-400">Mental gap to close</span>
          <span className="font-display font-bold tabular-nums text-sky-200">{fmt(simulation.mental_gap_to_close, 0)}</span>
        </div>
      </div>
    </div>
  );
}

function ConceptMirrorBars({ supply, demand, staggerIdx }) {
  return (
    <div className="space-y-2.5" style={enter(staggerIdx)}>
      <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Supply vs Demand</p>
      {RAIL_ORDER.map((key) => {
        const meta = CONCEPT_META[key];
        const s = clamp(supply?.[key], 0, 100);
        const d = clamp(demand?.[key], 0, 100);
        return (
          <div key={key} className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-sm font-display font-bold text-white">{meta.label}</p>
              <p className="text-[11px] tabular-nums text-gray-500">{fmt(d, 0)} vs {fmt(s, 0)}</p>
            </div>
            <div className="relative h-8 overflow-hidden rounded-full bg-white/[0.03]">
              <div className="absolute inset-y-0 right-1/2 rounded-l-full bg-white/[0.07]" style={{ width: `${d / 2}%`, animation: 'coachBarFill 0.7s cubic-bezier(0.16,1,0.3,1) both' }} />
              <div className="absolute inset-y-0 left-1/2 rounded-r-full" style={{ width: `${s / 2}%`, background: `linear-gradient(90deg, ${meta.color}70, ${meta.color})`, animation: 'coachBarFill 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both' }} />
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-600">
              <span>demand</span>
              <span>readiness</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldMap({ charts, selectedChartId, onSelect, staggerIdx }) {
  const xMax = Math.max(...(charts || []).map((c) => c?.derived?.base_demand || 0), 1);
  const yMax = Math.max(...(charts || []).map((c) => c?.derived?.economy_tax || 0), 1);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4" style={enter(staggerIdx)}>
      <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Field Map</p>
      <h4 className="mt-1 font-display text-base font-bold text-white sm:text-lg">Base demand vs economy tax</h4>
      <div className="relative mt-4 h-[200px] overflow-hidden rounded-2xl border border-white/[0.05] bg-[radial-gradient(circle_at_50%_20%,rgba(125,211,252,0.05),transparent_40%),rgba(255,255,255,0.01)] sm:h-[280px]">
        <div className="absolute inset-5 sm:inset-6">
          <div className="absolute inset-0 border-l border-b border-white/[0.07]" />
          {(charts || []).map((chart, i) => {
            const x = clamp((chart?.derived?.base_demand / xMax) * 100, 0, 100);
            const y = 100 - clamp((chart?.derived?.economy_tax / yMax) * 100, 0, 100);
            const meta = BLOCKER_META[chart?.derived?.blocker_state] || BLOCKER_META.mixed;
            const sel = chart.chart_id === selectedChartId;
            return (
              <button
                key={chart.chart_id}
                type="button"
                onClick={() => onSelect(chart.chart_id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-200 hover:scale-125"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  animation: `coachDotPop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.04}s both`,
                }}
                title={`${chart.title} \u2022 ${meta.label}`}
              >
                <span
                  className="block rounded-full border border-white/30"
                  style={{
                    width: sel ? 16 : 10,
                    height: sel ? 16 : 10,
                    backgroundColor: meta.color,
                    boxShadow: sel ? `0 0 0 5px ${meta.color}20, 0 0 18px ${meta.color}` : `0 0 10px ${meta.color}`,
                    transition: 'width 0.2s, height 0.2s, box-shadow 0.2s',
                  }}
                />
              </button>
            );
          })}
          <span className="absolute -bottom-5 left-0 text-[9px] uppercase tracking-[0.18em] text-gray-600 sm:text-[10px]">Base demand</span>
          <span className="absolute -left-5 top-0 origin-top-left -rotate-90 text-[9px] uppercase tracking-[0.18em] text-gray-600 sm:-left-6 sm:text-[10px]">Economy tax</span>
        </div>
      </div>
    </div>
  );
}

function ScenarioChips({ scenarios, staggerIdx }) {
  if (!scenarios?.length) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4" style={enter(staggerIdx)}>
      <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">What-If Scenarios</p>
      <h4 className="mt-1 font-display text-base font-bold text-white">How targeted work could shift the outcome</h4>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {scenarios.map((s) => {
          const meta = BLOCKER_META[s?.derived?.blocker_state] || BLOCKER_META.mixed;
          return (
            <div key={s.key} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-sm font-bold text-white">{s.label}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-display font-bold uppercase ${meta.badge}`}>{meta.label}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{s.description}</p>
              <div className="mt-2.5 flex items-center justify-between text-xs">
                <span className="text-gray-500">Margin</span>
                <span className="font-display font-bold tabular-nums text-gray-300">{fmtSigned(s?.derived?.pass_margin, 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">Delta</span>
                <span className="font-display font-bold tabular-nums" style={{ color: s?.pass_margin_delta >= 0 ? '#34d399' : '#fca5a5' }}>
                  {fmtSigned(s?.pass_margin_delta, 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION 5 — Evidence
   ═══════════════════════════════════════════════════════ */

function EvidenceList({ evidence, staggerIdx }) {
  if (!evidence?.length) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4" style={enter(staggerIdx)}>
      <p className="text-[10px] font-display uppercase tracking-[0.25em] text-gray-500">Best-Score Evidence</p>
      <h4 className="mt-1 font-display text-base font-bold text-white">Nearby charts shaping this estimate</h4>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {evidence.slice(0, 6).map((entry) => (
          <div key={`${entry.chart_id}-${entry.best_record?.score || 0}`} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <div className="flex items-start gap-3">
              <PiuChartJacket title={entry.title} mode={entry.mode} level={entry.level} jacketUrl={entry.jacket_url} size="wide" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-white">{entry.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">{entry.best_record?.grade} \u2022 {fmt(entry.best_record?.score)}</p>
                <p className="mt-1.5 text-[10px] text-gray-600">
                  Overlap {fmt((entry.overlap_ratio || 0) * 100, 0)}% \u2022 weight {fmt(entry.total_weight, 2)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════ */

export default function TrainingAnalyticsTab({ userId, mode, syncStale = false, lastSyncedAt = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [levelOverride, setLevelOverride] = useState(null);
  const [chartOverride, setChartOverride] = useState(null);
  const [labSupply, setLabSupply] = useState({
    pattern_recognition: 0, movement_control: 0,
    speed_reserve: 0, stamina_reserve: 0,
  });

  useEffect(() => {
    if (!userId || mode === 'overall') return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getTrainingGapAnalytics(userId, { mode, level: levelOverride, chart_id: chartOverride })
      .then((r) => { if (!cancelled) setPayload(r); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load analytics lab'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, mode, levelOverride, chartOverride]);

  useEffect(() => {
    if (!payload?.concepts?.supply) return;
    setLabSupply({
      pattern_recognition: Number(payload.concepts.supply.pattern_recognition || 0),
      movement_control: Number(payload.concepts.supply.movement_control || 0),
      speed_reserve: Number(payload.concepts.supply.speed_reserve || 0),
      stamina_reserve: Number(payload.concepts.supply.stamina_reserve || 0),
    });
  }, [payload?.selection?.chart_id, payload?.selection?.target_level]);

  const simulation = useMemo(() => simulateGapModel({
    level: payload?.selection?.target_level || payload?.target_level || 1,
    supply: labSupply,
    demand: payload?.selection?.chart?.demand || payload?.concepts?.demand || {},
    avgPlayLoad: payload?.profile?.analytics_avg_play_load || 0,
    trainingRatio: payload?.profile?.analytics_training_ratio || 100,
  }), [payload, labSupply]);

  if (mode === 'overall') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-piu-border/50 bg-piu-card/90 px-6 py-12 text-center" style={enter(0)}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-piu-border/40 bg-white/[0.04]">
          <svg className="h-6 w-6 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 14h4v8H4zM10 10h4v12h-4zM16 6h4v16h-4z" /></svg>
        </div>
        <p className="text-[10px] font-display uppercase tracking-[0.3em] text-gray-500">Coach Lab</p>
        <h3 className="mt-2 font-display text-xl font-bold text-white sm:text-2xl">Mode-specific in v1</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-400">
          Switch to Singles or Doubles above and the lab will build a chart-level gap model around your current pass envelope.
        </p>
      </div>
    );
  }

  const handleSupplyChange = (key, val) => {
    setLabSupply((c) => ({ ...c, [key]: round2(clamp(val, 0, 100)) }));
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* alerts */}
      {syncStale && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[13px] text-amber-200" style={enter(0)}>
          Training sync looks stale{lastSyncedAt ? ` since ${new Date(lastSyncedAt).toLocaleDateString()}` : ''}. Estimates may be behind your latest sessions.
        </div>
      )}
      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-[13px] text-red-200">{error}</div>}

      {/* 1. Theory — always visible */}
      <TheoryFramework />

      {/* loading skeleton */}
      {loading && !payload && (
        <div className="space-y-4">
          <div className="h-20 animate-pulse rounded-2xl bg-piu-dark/60" />
          <div className="h-48 animate-pulse rounded-2xl bg-piu-dark/60" />
          <div className="h-80 animate-pulse rounded-2xl bg-piu-dark/60" />
        </div>
      )}

      {/* 2–5. Data-driven sections */}
      {payload && (
        <>
          <LevelSelector
            levels={payload.selection?.selectable_levels}
            currentLevel={payload.selection?.target_level}
            onSelect={(lv) => { setLevelOverride(lv); setChartOverride(null); }}
            staggerIdx={1}
          />

          <ChartStrip
            charts={payload.charts}
            selectedChartId={payload.selection?.chart_id}
            onSelect={(id) => setChartOverride(id)}
            staggerIdx={2}
          />

          <CoachLab
            payload={payload}
            labSupply={labSupply}
            onSupplyChange={handleSupplyChange}
            simulation={simulation}
            selectedChart={payload.selection?.chart}
            staggerIdx={3}
          />

          <div className="grid gap-4 lg:grid-cols-2" style={enter(4)}>
            <div className="space-y-4">
              <EnergyStack simulation={simulation} staggerIdx={4.5} />
              <GapSummary simulation={simulation} staggerIdx={5} />
            </div>
            <div className="space-y-4">
              <ConceptMirrorBars
                supply={labSupply}
                demand={payload.selection?.chart?.demand || payload.concepts?.demand}
                staggerIdx={5.5}
              />
            </div>
          </div>

          <FieldMap
            charts={payload.charts}
            selectedChartId={payload.selection?.chart_id}
            onSelect={(id) => setChartOverride(id)}
            staggerIdx={6}
          />

          <ScenarioChips scenarios={payload.scenarios} staggerIdx={7} />

          <EvidenceList evidence={payload.evidence?.best_scores} staggerIdx={8} />
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import PiuChartJacket from '../PiuChartJacket';
import { getTrainingGapAnalytics } from '../../utils/api';

const CONCEPT_META = {
  pattern_recognition: {
    label: 'Pattern Recognition',
    short: 'Recognition',
    color: '#7dd3fc',
    glow: 'rgba(125,211,252,0.35)',
  },
  movement_control: {
    label: 'Movement Control',
    short: 'Control',
    color: '#f9a8d4',
    glow: 'rgba(249,168,212,0.35)',
  },
  speed_reserve: {
    label: 'Speed Reserve',
    short: 'Speed',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.35)',
  },
  stamina_reserve: {
    label: 'Stamina Reserve',
    short: 'Stamina',
    color: '#34d399',
    glow: 'rgba(52,211,153,0.35)',
  },
};

const RAIL_ORDER = [
  'pattern_recognition',
  'movement_control',
  'speed_reserve',
  'stamina_reserve',
];

const BLOCKER_META = {
  ready: {
    label: 'Ready',
    color: '#34d399',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  },
  mental: {
    label: 'Economy Gap',
    color: '#7dd3fc',
    badge: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  },
  physical: {
    label: 'Physical Gap',
    color: '#f59e0b',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  },
  mixed: {
    label: 'Mixed',
    color: '#f472b6',
    badge: 'border-pink-400/30 bg-pink-400/10 text-pink-100',
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatNumber(value, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSigned(value, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  const rounded = Number(numeric.toFixed(digits));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function simulateGapModel({ level, supply, demand, avgPlayLoad, trainingRatio }) {
  const EXTENDED_BASE_POINTS = {
    1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80, 9: 90,
    10: 100, 11: 110, 12: 130, 13: 160, 14: 200, 15: 250, 16: 310, 17: 380,
    18: 460, 19: 550, 20: 650, 21: 760, 22: 880, 23: 1010, 24: 1150, 25: 1300,
    26: 1460, 27: 1630, 28: 1810,
  };

  const passLoad = (EXTENDED_BASE_POINTS[level] || EXTENDED_BASE_POINTS[1]) * 0.9;
  const speedDemandNorm = clamp((demand?.speed_reserve || 0) / 100, 0, 1);
  const staminaDemandNorm = clamp((demand?.stamina_reserve || 0) / 100, 0, 1);
  const chartPhysicalFactorRaw = 1 + (0.18 * speedDemandNorm) + (0.22 * staminaDemandNorm);
  const baseDemand = passLoad * chartPhysicalFactorRaw;
  const executionEconomy = (Number(supply?.pattern_recognition || 0) * 0.55) + (Number(supply?.movement_control || 0) * 0.45);
  const executionEconomyNorm = clamp(executionEconomy / 100, 0, 1);
  const economyTax = baseDemand * (1 - executionEconomyNorm) * 0.5;
  const actualDemand = baseDemand + economyTax;
  const reserve = Number(avgPlayLoad || 0) * clamp(Number(trainingRatio || 100) / 100, 0.75, 1.2);
  const passMargin = reserve - actualDemand;
  const physicalGap = Math.max(0, baseDemand - reserve);
  const mentalGapToClose = Math.max(0, actualDemand - reserve) - physicalGap;

  let blockerState = 'mixed';
  if (actualDemand <= reserve) blockerState = 'ready';
  else if (mentalGapToClose >= (1.25 * physicalGap)) blockerState = 'mental';
  else if (physicalGap >= (1.25 * mentalGapToClose)) blockerState = 'physical';

  const effectiveTime = clamp(34 + (((Number(supply?.pattern_recognition || 0) * 0.7) + (Number(supply?.movement_control || 0) * 0.3)) * 0.66), 0, 100);

  return {
    pass_load: round2(passLoad),
    chart_physical_factor: round2(chartPhysicalFactorRaw),
    base_demand: round2(baseDemand),
    economy_tax: round2(economyTax),
    actual_demand: round2(actualDemand),
    reserve: round2(reserve),
    pass_margin: round2(passMargin),
    physical_gap: round2(physicalGap),
    mental_gap_to_close: round2(mentalGapToClose),
    blocker_state: blockerState,
    execution_economy: round2(executionEconomy),
    effective_time: round2(effectiveTime),
    irreducibly_physical: round2(baseDemand),
    economy_debt: round2(economyTax),
  };
}

function TheoryStrip({ selectedChart, payload }) {
  const insightCards = [
    {
      title: 'Effective Time',
      body: 'Reading earlier gives you more usable time to cover the same travel distance, which reduces the need for reactive force.',
      value: `${formatNumber(payload?.concepts?.effective_time, 0)}%`,
    },
    {
      title: 'Economy Debt',
      body: 'When recognition or control lag, the same chart costs extra energy even before raw fitness becomes the limit.',
      value: formatNumber(payload?.derived?.economy_debt, 0),
    },
    {
      title: 'Irreducibly Physical',
      body: 'Some cost remains even with perfect economy because more notes, speed, and movement still demand real output.',
      value: formatNumber(payload?.derived?.irreducibly_physical, 0),
    },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
      <div className="card relative overflow-hidden border-piu-border/60 bg-[radial-gradient(circle_at_top_left,rgba(255,51,102,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.14),transparent_38%),rgba(8,12,22,0.94)] p-4">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.03),transparent)]" />
        <div className="relative">
          <p className="text-[10px] font-display uppercase tracking-[0.28em] text-gray-500">Theory</p>
          <h3 className="mt-1 font-display text-xl font-bold text-white">Why hard charts can feel more physical than they really are</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            The same pattern gets more expensive when it is recognized late or executed with extra movement. Higher levels are genuinely harder,
            but a surprising amount of the spike can be economy debt rather than pure fitness.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(selectedChart?.skills || []).slice(0, 6).map((skill) => (
              <span key={skill.slug} className="rounded-full border border-piu-border/40 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300">
                {skill.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {insightCards.map((card) => (
          <div key={card.title} className="card border-piu-border/50 bg-piu-card/95 p-3">
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">{card.title}</p>
            <p className="mt-2 text-lg font-display font-bold text-white">{card.value}</p>
            <p className="mt-2 text-xs leading-5 text-gray-400">{card.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DraggableRail({ conceptKey, value, onChange }) {
  const meta = CONCEPT_META[conceptKey];
  const trackRef = useRef(null);

  useEffect(() => {
    const handleMove = (event) => {
      if (!trackRef.current || !trackRef.current.dataset.dragging) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
      onChange(conceptKey, x);
    };
    const handleUp = () => {
      if (trackRef.current) delete trackRef.current.dataset.dragging;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [conceptKey, onChange]);

  return (
    <div className="rounded-2xl border border-piu-border/40 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.22em] text-gray-500">{meta.short}</p>
          <p className="text-sm font-display font-bold text-white">{meta.label}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-display font-black text-white">{formatNumber(value, 0)}</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">readiness</p>
        </div>
      </div>
      <div
        ref={trackRef}
        className="relative h-12 rounded-full border border-white/10 bg-white/[0.03]"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
          event.currentTarget.dataset.dragging = 'true';
          onChange(conceptKey, x);
        }}
      >
        <div
          className="absolute inset-y-1 left-1 rounded-full"
          style={{
            width: `calc(${value}% - 8px)`,
            background: `linear-gradient(90deg, ${meta.color}33, ${meta.color})`,
            boxShadow: `0 0 24px ${meta.glow}`,
          }}
        />
        <div
          className="absolute top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full border border-white/30 bg-[#07111f] shadow-[0_0_26px_rgba(0,0,0,0.45)]"
          style={{
            left: `calc(${value}% - 20px)`,
            boxShadow: `0 0 0 1px ${meta.color}55, 0 0 32px ${meta.glow}`,
          }}
        >
          <div className="absolute inset-1 rounded-full" style={{ background: `radial-gradient(circle at 30% 30%, #ffffff, ${meta.color})` }} />
        </div>
      </div>
    </div>
  );
}

function CoachLabCanvas({ payload, labSupply, onSupplyChange, simulation }) {
  const blockerMeta = BLOCKER_META[simulation.blocker_state] || BLOCKER_META.mixed;

  return (
    <div className="card relative overflow-hidden border-piu-border/60 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(244,114,182,0.1),transparent_26%),linear-gradient(180deg,rgba(9,13,25,0.96),rgba(4,8,18,0.98))] p-4 sm:p-5">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0,rgba(255,255,255,0.03)_50%,transparent_100%)] opacity-40" />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-gray-500">Coach Lab</p>
            <h3 className="mt-1 font-display text-xl font-bold text-white">Move the causes, watch the energy story change</h3>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-display font-bold uppercase tracking-[0.18em] ${blockerMeta.badge}`}>
            {blockerMeta.label}
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden rounded-[28px] border border-white/8 bg-black/25 p-4">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="coach-link" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(125,211,252,0.45)" />
                  <stop offset="100%" stopColor="rgba(244,114,182,0.16)" />
                </linearGradient>
              </defs>
              <path d="M15 22 C 36 20, 46 28, 54 38" stroke="url(#coach-link)" strokeWidth="1.4" fill="none" strokeDasharray="2 2" />
              <path d="M15 44 C 34 44, 44 44, 54 48" stroke="url(#coach-link)" strokeWidth="1.4" fill="none" strokeDasharray="2 2" />
              <path d="M15 66 C 38 65, 46 58, 54 58" stroke="url(#coach-link)" strokeWidth="1.4" fill="none" strokeDasharray="2 2" />
              <path d="M15 88 C 40 84, 48 72, 54 68" stroke="url(#coach-link)" strokeWidth="1.4" fill="none" strokeDasharray="2 2" />
            </svg>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-3">
                {RAIL_ORDER.map((key) => (
                  <DraggableRail
                    key={key}
                    conceptKey={key}
                    value={labSupply[key]}
                    onChange={onSupplyChange}
                  />
                ))}
              </div>

              <div className="grid content-start gap-3">
                {[
                  { label: 'Execution Economy', value: `${formatNumber(simulation.execution_economy, 0)}%`, desc: 'How cheaply the body can execute what the eyes already understand.' },
                  { label: 'Effective Time', value: `${formatNumber(simulation.effective_time, 0)}%`, desc: 'Usable reaction window created by earlier recognition and cleaner movement.' },
                  { label: 'Energy Cost', value: formatNumber(simulation.actual_demand, 0), desc: 'Estimated total cost to clear this chart at your current economy.' },
                  { label: 'Pass Margin', value: formatSigned(simulation.pass_margin, 0), desc: 'Reserve minus estimated cost. Positive means the clear should be inside your envelope.' },
                ].map((node, index) => (
                  <div
                    key={node.label}
                    className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)]"
                    style={{ transform: `translateY(${index % 2 === 0 ? 0 : 6}px)` }}
                  >
                    <p className="text-[10px] font-display uppercase tracking-[0.22em] text-gray-500">{node.label}</p>
                    <p className="mt-1 text-2xl font-display font-black text-white">{node.value}</p>
                    <p className="mt-2 text-xs leading-5 text-gray-400">{node.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/8 bg-black/25 p-4">
              <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Summary</p>
              <h4 className="mt-1 font-display text-lg font-bold text-white">Where this chart is taxing you</h4>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Irreducibly physical</p>
                  <p className="mt-1 text-xl font-display font-black text-white">{formatNumber(simulation.irreducibly_physical, 0)}</p>
                  <p className="mt-2 text-xs leading-5 text-gray-400">The base cost that remains even if recognition and control were perfect.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Economy debt</p>
                  <p className="mt-1 text-xl font-display font-black text-white">{formatNumber(simulation.economy_debt, 0)}</p>
                  <p className="mt-2 text-xs leading-5 text-gray-400">Extra cost created by late reads, reactive travel, and inefficient execution.</p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Gap split</p>
                <div className="mt-2 flex items-center justify-between text-sm text-gray-300">
                  <span>Physical gap</span>
                  <span>{formatNumber(simulation.physical_gap, 0)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-gray-300">
                  <span>Mental gap to close</span>
                  <span>{formatNumber(simulation.mental_gap_to_close, 0)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-black/25 p-4">
              <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Scenario chips</p>
              <div className="mt-3 grid gap-2">
                {(payload?.scenarios || []).map((scenario) => {
                  const meta = BLOCKER_META[scenario?.derived?.blocker_state] || BLOCKER_META.mixed;
                  return (
                    <div key={scenario.key} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display text-sm font-bold text-white">{scenario.label}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-display uppercase ${meta.badge}`}>{meta.label}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">{scenario.description}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-300">
                        <span>Pass margin</span>
                        <span>{formatSigned(scenario?.derived?.pass_margin, 0)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-gray-300">
                        <span>Delta</span>
                        <span style={{ color: scenario?.pass_margin_delta >= 0 ? '#34d399' : '#fca5a5' }}>
                          {formatSigned(scenario?.pass_margin_delta, 0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LevelSelector({ levels, currentLevel, onSelect }) {
  return (
    <div className="card border-piu-border/60 bg-piu-card/95 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Target level</p>
          <p className="mt-1 text-sm text-gray-300">Pick the lane you want the lab to diagnose.</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-display font-black text-white">
          Lv.{currentLevel}
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {(levels || []).map((level) => (
          <button
            key={level.level}
            type="button"
            onClick={() => onSelect(level.level)}
            className={`min-w-[72px] rounded-2xl border px-3 py-2 text-left transition-all duration-200 ${
              level.level === currentLevel
                ? 'border-white/40 bg-white/10 text-white'
                : level.is_nearby
                  ? 'border-piu-border/40 bg-black/20 text-gray-300'
                  : 'border-transparent bg-black/10 text-gray-500'
            }`}
          >
            <p className="font-display text-sm font-black">Lv.{level.level}</p>
            <p className="text-[11px]">{level.chart_count} charts</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChartStrip({ charts, selectedChartId, onSelect }) {
  return (
    <div className="card border-piu-border/60 bg-piu-card/95 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Chart focus</p>
          <p className="mt-1 text-sm text-gray-300">Swap charts to compare how the blockers change inside the same level.</p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {(charts || []).map((chart) => {
          const meta = BLOCKER_META[chart?.derived?.blocker_state] || BLOCKER_META.mixed;
          return (
            <button
              key={chart.chart_id}
              type="button"
              onClick={() => onSelect(chart.chart_id)}
              className={`min-w-[230px] rounded-[24px] border p-3 text-left transition-all duration-200 ${
                chart.chart_id === selectedChartId
                  ? 'border-white/35 bg-white/[0.07]'
                  : 'border-piu-border/40 bg-black/20 hover:border-white/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <PiuChartJacket title={chart.title} mode={chart.mode} level={chart.level} jacketUrl={chart.jacket_url} size="wide" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-white">{chart.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{chart.best_record ? `${chart.best_record.grade} • ${formatNumber(chart.best_record.score)}` : 'Unplayed at this level'}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>Cost {formatNumber(chart?.derived?.actual_demand, 0)}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-display uppercase ${meta.badge}`}>{meta.label}</span>
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

function ConceptMirrorBars({ supply, demand }) {
  return (
    <div className="grid gap-3">
      {RAIL_ORDER.map((key) => {
        const meta = CONCEPT_META[key];
        const supplyValue = clamp(supply?.[key], 0, 100);
        const demandValue = clamp(demand?.[key], 0, 100);
        return (
          <div key={key} className="rounded-2xl border border-white/8 bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-display font-bold text-white">{meta.label}</p>
              <p className="text-xs text-gray-400">Demand {formatNumber(demandValue, 0)} vs readiness {formatNumber(supplyValue, 0)}</p>
            </div>
            <div className="relative h-10 overflow-hidden rounded-full bg-white/[0.04]">
              <div className="absolute inset-y-0 right-1/2 bg-white/10" style={{ width: `${demandValue / 2}%` }} />
              <div className="absolute inset-y-0 left-1/2" style={{ width: `${supplyValue / 2}%`, background: `linear-gradient(90deg, ${meta.color}80, ${meta.color})` }} />
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EnergyStack({ simulation }) {
  const total = Math.max(simulation.actual_demand, simulation.reserve, 1);
  const basePct = clamp((simulation.base_demand / total) * 100, 0, 100);
  const taxPct = clamp((simulation.economy_tax / total) * 100, 0, 100);
  const reservePct = clamp((simulation.reserve / total) * 100, 0, 100);

  return (
    <div className="rounded-[28px] border border-white/8 bg-black/25 p-4">
      <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Energy stack</p>
      <h4 className="mt-1 font-display text-lg font-bold text-white">Base demand + economy tax vs reserve</h4>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
            <span>Chart cost</span>
            <span>{formatNumber(simulation.actual_demand, 0)}</span>
          </div>
          <div className="flex h-5 overflow-hidden rounded-full bg-white/[0.04]">
            <div style={{ width: `${basePct}%`, background: 'linear-gradient(90deg, rgba(52,211,153,0.6), rgba(52,211,153,1))' }} />
            <div style={{ width: `${taxPct}%`, background: 'linear-gradient(90deg, rgba(125,211,252,0.6), rgba(244,114,182,0.9))' }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
            <span>Your reserve</span>
            <span>{formatNumber(simulation.reserve, 0)}</span>
          </div>
          <div className="h-5 overflow-hidden rounded-full bg-white/[0.04]">
            <div style={{ width: `${reservePct}%`, background: 'linear-gradient(90deg, rgba(245,158,11,0.65), rgba(245,158,11,1))' }} className="h-full rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldMap({ charts, selectedChartId, onSelect }) {
  const xMax = Math.max(...(charts || []).map((chart) => chart?.derived?.base_demand || 0), 1);
  const yMax = Math.max(...(charts || []).map((chart) => chart?.derived?.economy_tax || 0), 1);

  return (
    <div className="rounded-[28px] border border-white/8 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Field map</p>
          <h4 className="mt-1 font-display text-lg font-bold text-white">Base demand vs economy tax</h4>
        </div>
      </div>
      <div className="mt-4 relative h-[300px] overflow-hidden rounded-[24px] border border-white/8 bg-[radial-gradient(circle_at_50%_20%,rgba(125,211,252,0.08),transparent_35%),rgba(255,255,255,0.02)]">
        <div className="absolute inset-6">
          <div className="absolute inset-0 border-l border-b border-white/10" />
          {(charts || []).map((chart) => {
            const x = clamp((chart?.derived?.base_demand / xMax) * 100, 0, 100);
            const y = 100 - clamp((chart?.derived?.economy_tax / yMax) * 100, 0, 100);
            const meta = BLOCKER_META[chart?.derived?.blocker_state] || BLOCKER_META.mixed;
            const selected = chart.chart_id === selectedChartId;
            return (
              <button
                key={chart.chart_id}
                type="button"
                onClick={() => onSelect(chart.chart_id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${x}%`, top: `${y}%` }}
                title={`${chart.title} • ${meta.label}`}
              >
                <span
                  className="block rounded-full border border-white/40"
                  style={{
                    width: selected ? 18 : 12,
                    height: selected ? 18 : 12,
                    backgroundColor: meta.color,
                    boxShadow: selected ? `0 0 0 6px ${meta.color}22, 0 0 22px ${meta.color}` : `0 0 14px ${meta.color}`,
                  }}
                />
              </button>
            );
          })}
          <span className="absolute -bottom-6 left-0 text-[10px] uppercase tracking-[0.18em] text-gray-600">Base demand</span>
          <span className="absolute left-[-28px] top-0 -rotate-90 text-[10px] uppercase tracking-[0.18em] text-gray-600">Economy tax</span>
        </div>
      </div>
    </div>
  );
}

function EvidenceList({ evidence }) {
  return (
    <div className="rounded-[28px] border border-white/8 bg-black/25 p-4">
      <p className="text-[10px] font-display uppercase tracking-[0.24em] text-gray-500">Best-score evidence</p>
      <h4 className="mt-1 font-display text-lg font-bold text-white">Nearby charts currently shaping this estimate</h4>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(evidence || []).slice(0, 6).map((entry) => (
          <div key={`${entry.chart_id}-${entry.best_record?.score || 0}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex items-start gap-3">
              <PiuChartJacket title={entry.title} mode={entry.mode} level={entry.level} jacketUrl={entry.jacket_url} size="wide" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-white">{entry.title}</p>
                <p className="mt-1 text-xs text-gray-400">{entry.best_record?.grade} • {formatNumber(entry.best_record?.score)}</p>
                <p className="mt-2 text-[11px] text-gray-500">Overlap {formatNumber((entry.overlap_ratio || 0) * 100, 0)}% • weight {formatNumber(entry.total_weight, 2)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrainingAnalyticsTab({ userId, mode, syncStale = false, lastSyncedAt = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [levelOverride, setLevelOverride] = useState(null);
  const [chartOverride, setChartOverride] = useState(null);
  const [labSupply, setLabSupply] = useState({
    pattern_recognition: 0,
    movement_control: 0,
    speed_reserve: 0,
    stamina_reserve: 0,
  });

  useEffect(() => {
    if (!userId || mode === 'overall') return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getTrainingGapAnalytics(userId, {
      mode,
      level: levelOverride,
      chart_id: chartOverride,
    })
      .then((result) => {
        if (cancelled) return;
        setPayload(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load analytics lab');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
      <div className="card border-piu-border/60 bg-piu-card/95 p-6 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.28em] text-gray-500">Analytics tab</p>
        <h3 className="mt-2 font-display text-2xl font-bold text-white">Coach Lab is mode-specific in v1</h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-gray-400">
          Switch to Singles or Doubles above and the lab will build a chart-level gap model around your current pass envelope.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {syncStale ? (
        <div className="card border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
          Training sync looks stale{lastSyncedAt ? ` since ${new Date(lastSyncedAt).toLocaleDateString()}` : ''}. Coach Lab estimates may be behind your latest sessions.
        </div>
      ) : null}

      {error ? <div className="card border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

      {loading && !payload ? (
        <div className="space-y-4">
          <div className="card h-28 animate-pulse bg-piu-dark/60" />
          <div className="card h-96 animate-pulse bg-piu-dark/60" />
          <div className="card h-64 animate-pulse bg-piu-dark/60" />
        </div>
      ) : null}

      {payload ? (
        <>
          <LevelSelector
            levels={payload.selection?.selectable_levels}
            currentLevel={payload.selection?.target_level}
            onSelect={(level) => {
              setLevelOverride(level);
              setChartOverride(null);
            }}
          />
          <ChartStrip
            charts={payload.charts}
            selectedChartId={payload.selection?.chart_id}
            onSelect={(chartId) => setChartOverride(chartId)}
          />
          <TheoryStrip selectedChart={payload.selection?.chart} payload={payload} />
          <CoachLabCanvas
            payload={payload}
            labSupply={labSupply}
            simulation={simulation}
            onSupplyChange={(conceptKey, nextValue) => {
              setLabSupply((current) => ({
                ...current,
                [conceptKey]: round2(clamp(nextValue, 0, 100)),
              }));
            }}
          />
          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <FieldMap charts={payload.charts} selectedChartId={payload.selection?.chart_id} onSelect={(chartId) => setChartOverride(chartId)} />
            <div className="space-y-4">
              <EnergyStack simulation={simulation} />
              <ConceptMirrorBars supply={labSupply} demand={payload.selection?.chart?.demand || payload.concepts?.demand} />
            </div>
          </div>
          <EvidenceList evidence={payload.evidence?.best_scores} />
        </>
      ) : null}
    </div>
  );
}

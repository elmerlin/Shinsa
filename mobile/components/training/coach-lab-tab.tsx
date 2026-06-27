import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';
import type { TrainingGapBlockerState, TrainingGapResponse } from '@shared/api';

/* ─── design tokens ─── */

type SliderId = 'difficulty' | 'pattern' | 'movement' | 'speed' | 'stamina';

interface SliderMeta {
  label: string;
  color: string;
}

const SLIDER_META: Record<SliderId, SliderMeta> = {
  difficulty: { label: 'Chart Difficulty', color: '#a78bfa' },
  pattern: { label: 'Pattern Familiarity', color: '#7dd3fc' },
  movement: { label: 'Movement Efficiency', color: '#f9a8d4' },
  speed: { label: 'Speed Reserve', color: '#f59e0b' },
  stamina: { label: 'Stamina Reserve', color: '#34d399' },
};

interface BlockerMeta {
  label: string;
  color: string;
}

const BLOCKER_META: Record<TrainingGapBlockerState, BlockerMeta> = {
  ready: { label: 'Ready', color: '#34d399' },
  mental: { label: 'Economy Gap', color: '#7dd3fc' },
  physical: { label: 'Physical Gap', color: '#f59e0b' },
  mixed: { label: 'Mixed Gap', color: '#f472b6' },
};

const NARRATIVES: Record<TrainingGapBlockerState, string> = {
  ready:
    "Your energy reserve comfortably exceeds this chart's total cost. At these skill levels, you have headroom to clear.",
  mental:
    'Most of the gap is economy debt — extra energy wasted when pattern reads come late or movement is reactive. More exposure to similar patterns will close this gap without needing more fitness.',
  physical:
    'Even with perfect economy, the base physical demand exceeds your current capacity. Building speed and stamina through consistent play at challenging levels is the path forward.',
  mixed:
    "Both mental economy and physical capacity are limiting you. You'd benefit from more pattern exposure to cut economy debt, and more intensive sessions to build your physical reserve.",
};

function familiarityHint(v: number): string {
  if (v <= 8) return '≈1–2 plays — brand new';
  if (v <= 25) return '≈5–10 plays — starting to recognise';
  if (v <= 50) return '≈15–30 plays — somewhat familiar';
  if (v <= 75) return '≈30–60 plays — well practiced';
  if (v <= 92) return '≈60–100 plays — deeply familiar';
  return '100+ plays — second nature';
}

/* ─── utilities ─── */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
}
function round2(v: number): number {
  return Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
}

function fmt(v: number, d = 0): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtSigned(v: number, d = 0): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '--';
  const r = Number(n.toFixed(d));
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

/* ─── principle simulation (ported verbatim from the web component) ─── */

const LEVEL_POINTS: Record<number, number> = {
  5: 50, 6: 60, 7: 70, 8: 80, 9: 90, 10: 100, 11: 110, 12: 130, 13: 160, 14: 200,
  15: 250, 16: 310, 17: 380, 18: 460, 19: 550, 20: 650, 21: 760, 22: 880, 23: 1010,
  24: 1150, 25: 1300,
};

interface Sliders {
  difficulty: number;
  pattern: number;
  movement: number;
  speed: number;
  stamina: number;
}

interface Sim {
  level: number;
  baseCost: number;
  economyTax: number;
  totalCost: number;
  reserve: number;
  passMargin: number;
  physicalGap: number;
  mentalGap: number;
  blockerState: TrainingGapBlockerState;
  economy: number;
  effectiveTime: number;
}

function simulatePrinciple({ difficulty, pattern, movement, speed, stamina }: Sliders): Sim {
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

  let blocker: TrainingGapBlockerState = 'mixed';
  if (totalCost <= reserve) blocker = 'ready';
  else if (mentalGap >= 1.25 * physGap) blocker = 'mental';
  else if (physGap >= 1.25 * mentalGap) blocker = 'physical';

  const effectiveTime = clamp(34 + (pattern * 0.7 + movement * 0.3) * 0.66, 0, 100);

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
   Concept Slider — PanResponder track (no native slider dep).
   ═══════════════════════════════════════════════════════ */

function ConceptSlider({
  id,
  value,
  onChange,
  hint,
  s,
}: {
  id: SliderId;
  value: number;
  onChange: (id: SliderId, value: number) => void;
  hint?: string;
  s: Styles;
}) {
  const meta = SLIDER_META[id];
  // Track geometry, measured on layout so the pan math maps touch-x → 0–100.
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const w = widthRef.current;
        if (w > 0) onChange(id, clamp((e.nativeEvent.locationX / w) * 100, 0, 100));
      },
      onPanResponderMove: (e) => {
        const w = widthRef.current;
        if (w > 0) onChange(id, clamp((e.nativeEvent.locationX / w) * 100, 0, 100));
      },
    }),
  ).current;

  const pct = clamp(value, 0, 100);

  return (
    <View style={s.sliderRow}>
      <View style={s.sliderHeader}>
        <Text style={s.sliderLabel}>{meta.label}</Text>
        <Text style={s.sliderValue}>{fmt(pct, 0)}</Text>
      </View>
      {hint ? <Text style={s.sliderHint}>{hint}</Text> : null}
      <View style={s.sliderTrack} onLayout={onLayout} {...pan.panHandlers}>
        <View
          style={[
            s.sliderFill,
            { width: `${pct}%` as const, backgroundColor: meta.color },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            s.sliderThumb,
            { left: `${pct}%` as const, borderColor: meta.color },
          ]}
        />
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   Energy Equation Graph (SVG bar pair: cost vs reserve).
   ═══════════════════════════════════════════════════════ */

function EnergyGraph({ sim, s }: { sim: Sim; s: Styles }) {
  const maxVal = Math.max(sim.totalCost, sim.reserve, 1);
  const bm = BLOCKER_META[sim.blockerState];

  const W = 320;
  const barH = 30;
  const gap = 26;
  const y1 = 22;
  const y2 = y1 + barH + gap;
  const baseW = (sim.baseCost / maxVal) * W;
  const taxW = (sim.economyTax / maxVal) * W;
  const resW = (sim.reserve / maxVal) * W;
  const totalW = baseW + taxW;
  const VBW = W + 20;
  const VBH = y2 + barH + 16;

  return (
    <View style={s.card}>
      <View style={s.cardHeaderRow}>
        <View style={s.cardHeaderText}>
          <Text style={s.eyebrow}>ENERGY EQUATION</Text>
          <Text style={s.cardTitle}>Lv.{sim.level} chart</Text>
        </View>
        <View style={[s.badge, { borderColor: bm.color, backgroundColor: `${bm.color}22` }]}>
          <Text style={[s.badgeText, { color: bm.color }]}>{bm.label.toUpperCase()}</Text>
        </View>
      </View>

      <Svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height={VBH} style={s.svg}>
        <Defs>
          <LinearGradient id="eg-base" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="rgba(52,211,153,0.45)" />
            <Stop offset="1" stopColor="rgba(52,211,153,1)" />
          </LinearGradient>
          <LinearGradient id="eg-tax" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="rgba(125,211,252,0.5)" />
            <Stop offset="1" stopColor="rgba(244,114,182,0.85)" />
          </LinearGradient>
          <LinearGradient id="eg-reserve" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="rgba(245,158,11,0.45)" />
            <Stop offset="1" stopColor="rgba(245,158,11,1)" />
          </LinearGradient>
        </Defs>

        {/* cost row */}
        <SvgText x="0" y={y1 - 6} fill="#6b7280" fontSize="9" fontWeight="600">CHART COST</SvgText>
        <SvgText x={W + 20} y={y1 - 6} fill="#9ca3af" fontSize="10" fontWeight="700" textAnchor="end">{fmt(sim.totalCost, 0)}</SvgText>
        <Rect x="0" y={y1} width={Math.max(baseW, 0)} height={barH} rx="6" fill="url(#eg-base)" />
        {baseW > 44 ? (
          <SvgText x={baseW / 2} y={y1 + barH / 2 + 3.5} fill="rgba(255,255,255,0.75)" fontSize="9" fontWeight="600" textAnchor="middle">Base {fmt(sim.baseCost, 0)}</SvgText>
        ) : null}
        <Rect x={baseW} y={y1} width={Math.max(taxW, 0)} height={barH} rx="6" fill="url(#eg-tax)" />
        {taxW > 44 ? (
          <SvgText x={baseW + taxW / 2} y={y1 + barH / 2 + 3.5} fill="rgba(255,255,255,0.75)" fontSize="9" fontWeight="600" textAnchor="middle">Tax {fmt(sim.economyTax, 0)}</SvgText>
        ) : null}

        {/* reserve row */}
        <SvgText x="0" y={y2 - 6} fill="#6b7280" fontSize="9" fontWeight="600">YOUR RESERVE</SvgText>
        <SvgText x={W + 20} y={y2 - 6} fill="#9ca3af" fontSize="10" fontWeight="700" textAnchor="end">{fmt(sim.reserve, 0)}</SvgText>
        <Rect x="0" y={y2} width={Math.max(resW, 0)} height={barH} rx="6" fill="url(#eg-reserve)" />
        {resW > 54 ? (
          <SvgText x={resW / 2} y={y2 + barH / 2 + 3.5} fill="rgba(255,255,255,0.75)" fontSize="9" fontWeight="600" textAnchor="middle">Reserve {fmt(sim.reserve, 0)}</SvgText>
        ) : null}

        {/* comparison line at total cost */}
        <Line x1={totalW} y1={y1 - 2} x2={totalW} y2={y2 + barH + 2} stroke={bm.color} strokeOpacity="0.4" strokeDasharray="4 3" strokeWidth="1" />
      </Svg>

      <View style={s.legendRow}>
        <Legend color="#34d399" label="Base cost (physical)" s={s} />
        <Legend color="#7dd3fc" label="Economy tax (mental)" s={s} />
        <Legend color="#f59e0b" label="Your reserve" s={s} />
      </View>
    </View>
  );
}

function Legend({ color, label, s }: { color: string; label: string; s: Styles }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   Blocker Narrative
   ═══════════════════════════════════════════════════════ */

function BlockerNarrative({ sim, s }: { sim: Sim; s: Styles }) {
  const bm = BLOCKER_META[sim.blockerState];
  return (
    <View style={s.card}>
      <View style={s.narrativeRow}>
        <View style={[s.narrativeDot, { backgroundColor: bm.color }]} />
        <View style={s.narrativeBody}>
          <Text style={[s.narrativeTitle, { color: bm.color }]}>{bm.label}</Text>
          <Text style={s.narrativeText}>{NARRATIVES[sim.blockerState]}</Text>
        </View>
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   Metric Strip
   ═══════════════════════════════════════════════════════ */

function MetricStrip({ sim, s }: { sim: Sim; s: Styles }) {
  const metrics: { label: string; value: string; positive?: boolean }[] = [
    { label: 'Pass Margin', value: fmtSigned(sim.passMargin, 0), positive: sim.passMargin >= 0 },
    { label: 'Economy', value: `${fmt(sim.economy, 0)}%` },
    { label: 'Eff. Time', value: `${fmt(sim.effectiveTime, 0)}%` },
    { label: 'Physical Gap', value: fmt(sim.physicalGap, 0) },
    { label: 'Mental Gap', value: fmt(sim.mentalGap, 0) },
  ];
  return (
    <View style={s.metricStrip}>
      {metrics.map((m) => (
        <View key={m.label} style={s.metricTile}>
          <Text style={s.metricLabel}>{m.label.toUpperCase()}</Text>
          <Text
            style={[
              s.metricValue,
              m.positive === true ? s.metricPos : m.positive === false ? s.metricNeg : null,
            ]}>
            {m.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   Level Curve Graph — energy cost across Lv.5–25 with the
   current-limit + physical-ceiling crossover markers.
   ═══════════════════════════════════════════════════════ */

interface LevelPoint {
  level: number;
  baseCost: number;
  totalCost: number;
}

function findCrossover(points: LevelPoint[], key: 'baseCost' | 'totalCost', reserve: number): number | null {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i][key];
    const b = points[i + 1][key];
    if (a <= reserve && b > reserve) {
      const t = (reserve - a) / (b - a);
      return round2(points[i].level + t);
    }
  }
  return null;
}

function LevelCurveGraph({ sim, sliders, s }: { sim: Sim; sliders: Sliders; s: Styles }) {
  const economy = (sliders.pattern * 0.55 + sliders.movement * 0.45) / 100;

  const points: LevelPoint[] = [];
  for (let l = 5; l <= 25; l++) {
    const passLoad = (LEVEL_POINTS[l] || 250) * 0.9;
    const physFactor = 1 + 0.18 * (l / 25);
    const baseCost = passLoad * physFactor;
    const economyTax = baseCost * (1 - economy) * 0.5;
    points.push({ level: l, baseCost, totalCost: baseCost + economyTax });
  }

  const reserve = sim.reserve;
  const maxY = Math.max(...points.map((p) => p.totalCost), reserve) * 1.12;

  const W = 360;
  const H = 220;
  const pL = 40;
  const pR = 14;
  const pT = 14;
  const pB = 28;
  const plotW = W - pL - pR;
  const plotH = H - pT - pB;

  const xOf = (l: number) => pL + ((l - 5) / 20) * plotW;
  const yOf = (v: number) => pT + plotH - (v / maxY) * plotH;

  const mkLine = (key: 'baseCost' | 'totalCost') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.level).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(' ');
  const mkReverse = (key: 'baseCost' | 'totalCost') =>
    [...points].reverse().map((p) => `L${xOf(p.level).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(' ');

  const baseLine = mkLine('baseCost');
  const totalLine = mkLine('totalCost');
  const baseFillPath = `${baseLine} L${xOf(25).toFixed(1)},${yOf(0).toFixed(1)} L${xOf(5).toFixed(1)},${yOf(0).toFixed(1)} Z`;
  const debtFillPath = `${totalLine} ${mkReverse('baseCost')} Z`;

  const currentLimit = findCrossover(points, 'totalCost', reserve);
  const physCeiling = findCrossover(points, 'baseCost', reserve);

  const gridLevels = [5, 10, 15, 20, 25];
  const yTicks: number[] = [];
  const step = Math.pow(10, Math.floor(Math.log10(maxY))) / 2 || 100;
  for (let v = step; v < maxY; v += step) yTicks.push(v);

  const showUnlockBand = currentLimit != null && physCeiling != null && physCeiling > currentLimit;

  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>LEVEL LANDSCAPE</Text>
      <Text style={s.cardTitleLg}>Energy cost across all levels at your current settings</Text>
      <Text style={s.bodyMuted}>
        The green area is the irreducible physical floor — even with perfect economy. The blue layer
        on top is the economy debt your current familiarity and efficiency add. The amber line is
        your energy reserve.
      </Text>

      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={s.svg}>
        {gridLevels.map((l) => (
          <G key={`gl-${l}`}>
            <Line x1={xOf(l)} y1={pT} x2={xOf(l)} y2={H - pB} stroke="white" strokeOpacity="0.05" />
            <SvgText x={xOf(l)} y={H - pB + 14} fill="#6b7280" fontSize="9" fontWeight="600" textAnchor="middle">Lv.{l}</SvgText>
          </G>
        ))}
        {yTicks.map((v) => (
          <G key={`yt-${Math.round(v)}`}>
            <Line x1={pL} y1={yOf(v)} x2={W - pR} y2={yOf(v)} stroke="white" strokeOpacity="0.04" />
            <SvgText x={pL - 5} y={yOf(v) + 3} fill="#6b7280" fontSize="8" fontWeight="600" textAnchor="end">{fmt(v, 0)}</SvgText>
          </G>
        ))}

        {/* base-cost physical floor */}
        <Path d={baseFillPath} fill="rgba(52,211,153,0.1)" />
        <Path d={baseLine} fill="none" stroke="rgba(52,211,153,0.7)" strokeWidth="1.5" strokeLinejoin="round" />

        {/* economy-debt layer */}
        <Path d={debtFillPath} fill="rgba(125,211,252,0.08)" />
        <Path d={totalLine} fill="none" stroke="rgba(125,211,252,0.7)" strokeWidth="1.5" strokeLinejoin="round" />

        {/* reserve line */}
        <Line x1={pL} y1={yOf(reserve)} x2={W - pR} y2={yOf(reserve)} stroke="rgba(245,158,11,0.65)" strokeWidth="1.5" strokeDasharray="6 4" />
        <SvgText x={W - pR} y={yOf(reserve) - 5} fill="rgba(245,158,11,0.85)" fontSize="9" fontWeight="700" textAnchor="end">Reserve</SvgText>

        {/* current difficulty marker */}
        <Line x1={xOf(sim.level)} y1={pT} x2={xOf(sim.level)} y2={H - pB} stroke="rgba(167,139,250,0.35)" strokeWidth="1" strokeDasharray="3 3" />
        <Circle cx={xOf(sim.level)} cy={yOf(sim.totalCost)} r="4" fill="rgba(167,139,250,0.95)" stroke="white" strokeWidth="1" />

        {/* current-limit crossover (total cost meets reserve) */}
        {currentLimit != null ? (
          <G>
            <Line x1={xOf(currentLimit)} y1={yOf(reserve) - 8} x2={xOf(currentLimit)} y2={yOf(reserve) + 8} stroke="rgba(125,211,252,0.7)" strokeWidth="2" />
            <SvgText x={xOf(currentLimit)} y={yOf(reserve) + 20} fill="rgba(125,211,252,0.8)" fontSize="8" fontWeight="600" textAnchor="middle">Current limit</SvgText>
            <SvgText x={xOf(currentLimit)} y={yOf(reserve) + 29} fill="rgba(125,211,252,0.55)" fontSize="8" textAnchor="middle">~Lv.{Math.round(currentLimit)}</SvgText>
          </G>
        ) : null}

        {/* physical-ceiling crossover (base cost meets reserve) */}
        {physCeiling != null ? (
          <G>
            <Line x1={xOf(physCeiling)} y1={yOf(reserve) - 8} x2={xOf(physCeiling)} y2={yOf(reserve) + 8} stroke="rgba(52,211,153,0.7)" strokeWidth="2" />
            <SvgText x={xOf(physCeiling)} y={yOf(reserve) - 14} fill="rgba(52,211,153,0.8)" fontSize="8" fontWeight="600" textAnchor="middle">Physical ceiling</SvgText>
            <SvgText x={xOf(physCeiling)} y={yOf(reserve) - 5} fill="rgba(52,211,153,0.55)" fontSize="8" textAnchor="middle">~Lv.{Math.round(physCeiling)}</SvgText>
          </G>
        ) : null}

        {/* unlockable band between current limit and physical ceiling */}
        {showUnlockBand && currentLimit != null && physCeiling != null ? (
          <Rect x={xOf(currentLimit)} y={yOf(reserve) - 3} width={xOf(physCeiling) - xOf(currentLimit)} height="6" rx="3" fill="rgba(125,211,252,0.12)" stroke="rgba(125,211,252,0.25)" strokeWidth="0.5" />
        ) : null}

        {/* axes */}
        <Line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} stroke="white" strokeOpacity="0.08" />
        <Line x1={pL} y1={pT} x2={pL} y2={H - pB} stroke="white" strokeOpacity="0.08" />
      </Svg>

      <View style={s.legendRow}>
        <Legend color="#34d399" label="Physical floor (perfect economy)" s={s} />
        <Legend color="#7dd3fc" label="+ Economy debt (your settings)" s={s} />
        <Legend color="#f59e0b" label="Your reserve" s={s} />
        {showUnlockBand ? <Legend color="#7dd3fc" label="Unlockable through practice" s={s} /> : null}
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   Theory Framework (static educational copy)
   ═══════════════════════════════════════════════════════ */

function TheoryFramework({ s }: { s: Styles }) {
  return (
    <View style={s.theoryWrap}>
      <View style={s.heroCard}>
        <Text style={s.eyebrow}>COACH LAB</Text>
        <Text style={s.heroTitle}>Every chart has a mental cost and a physical cost</Text>
        <Text style={s.heroBody}>
          Understanding which one is limiting you changes how you train. Use the sliders below to
          explore how familiarity, efficiency, and fitness interact.
        </Text>
      </View>

      <View style={s.theoryGrid}>
        {/* mental */}
        <View style={[s.theoryCard, { borderColor: 'rgba(125,211,252,0.25)' }]}>
          <Text style={[s.theoryKicker, { color: '#7dd3fc' }]}>MENTAL</Text>
          <Text style={[s.theoryHeading, { color: '#bae6fd' }]}>Economy Gap</Text>
          <Text style={s.theoryText}>
            When you read patterns late or move reactively, the same chart costs extra energy —
            before fitness even matters.
          </Text>
          <View style={s.theoryBulletRow}>
            <View style={[s.theoryBullet, { backgroundColor: '#7dd3fc' }]} />
            <Text style={s.theoryBulletText}>
              <Text style={s.theoryBulletStrong}>Pattern Familiarity</Text> — played 100 times vs 1 time
            </Text>
          </View>
          <View style={s.theoryBulletRow}>
            <View style={[s.theoryBullet, { backgroundColor: '#f9a8d4' }]} />
            <Text style={s.theoryBulletText}>
              <Text style={s.theoryBulletStrong}>Movement Efficiency</Text> — clean travel vs reactive scrambling
            </Text>
          </View>
          <Text style={[s.theoryNote, { color: 'rgba(125,211,252,0.75)' }]}>
            Improving economy makes the chart cheaper without getting fitter.
          </Text>
        </View>

        {/* physical */}
        <View style={[s.theoryCard, { borderColor: 'rgba(245,158,11,0.25)' }]}>
          <Text style={[s.theoryKicker, { color: '#f59e0b' }]}>PHYSICAL</Text>
          <Text style={[s.theoryHeading, { color: '#fcd34d' }]}>Physical Gap</Text>
          <Text style={s.theoryText}>
            Some cost is irreducible — more notes at higher speed genuinely demands more raw output
            from your body.
          </Text>
          <View style={s.theoryBulletRow}>
            <View style={[s.theoryBullet, { backgroundColor: '#f59e0b' }]} />
            <Text style={s.theoryBulletText}>
              <Text style={s.theoryBulletStrong}>Speed Reserve</Text> — capacity to handle the chart&apos;s BPM
            </Text>
          </View>
          <View style={s.theoryBulletRow}>
            <View style={[s.theoryBullet, { backgroundColor: '#34d399' }]} />
            <Text style={s.theoryBulletText}>
              <Text style={s.theoryBulletStrong}>Stamina Reserve</Text> — sustaining effort from start to finish
            </Text>
          </View>
          <Text style={[s.theoryNote, { color: 'rgba(245,158,11,0.75)' }]}>
            Closing a physical gap requires consistent play at challenging levels.
          </Text>
        </View>
      </View>

      {/* formula */}
      <View style={s.formulaRow}>
        <View style={[s.formulaChip, { borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.08)' }]}>
          <Text style={[s.formulaChipText, { color: '#fcd34d' }]}>Base Cost</Text>
        </View>
        <Text style={s.formulaOp}>+</Text>
        <View style={[s.formulaChip, { borderColor: 'rgba(125,211,252,0.3)', backgroundColor: 'rgba(125,211,252,0.08)' }]}>
          <Text style={[s.formulaChipText, { color: '#bae6fd' }]}>Economy Tax</Text>
        </View>
        <Text style={s.formulaOp}>=</Text>
        <Text style={s.formulaResult}>Total Energy Cost</Text>
      </View>
      <Text style={s.formulaCaption}>Your reserve must exceed this to clear.</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Export
   ═══════════════════════════════════════════════════════ */

export function CoachLabTab({ userId, mode }: { userId: string; mode: 'overall' | 'single' | 'double' }) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const [sliders, setSliders] = useState<Sliders>({
    difficulty: 50,
    pattern: 40,
    movement: 40,
    speed: 50,
    stamina: 50,
  });
  const [initialized, setInitialized] = useState(false);

  // Seed the sliders from the player's real gap analytics — only for the
  // mode-specific tabs. The server treats overall as a no-data case for this
  // chart-level model, so we keep the static lab there.
  const gapQuery = useQuery<TrainingGapResponse>({
    queryKey: ['training-gap', userId || 'anon', mode],
    queryFn: () => songsApi.trainingGapAnalytics(userId, { mode }),
    enabled: !!userId && mode !== 'overall',
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (initialized) return;
    const data = gapQuery.data;
    if (!data) return;
    const supply = data.concepts?.supply;
    setSliders((prev) => ({
      ...prev,
      pattern: clamp(Number(supply?.pattern_recognition ?? 40), 0, 100),
      movement: clamp(Number(supply?.movement_control ?? 40), 0, 100),
      speed: clamp(Number(supply?.speed_reserve ?? 50), 0, 100),
      stamina: clamp(Number(supply?.stamina_reserve ?? 50), 0, 100),
      difficulty: data.selection?.target_level
        ? clamp(((data.selection.target_level - 5) / 20) * 100, 0, 100)
        : 50,
    }));
    setInitialized(true);
  }, [gapQuery.data, initialized]);

  const sim = useMemo(() => simulatePrinciple(sliders), [sliders]);

  const update = (key: SliderId, val: number) => {
    setSliders((prev) => ({ ...prev, [key]: round2(clamp(val, 0, 100)) }));
  };

  if (mode === 'overall') {
    return (
      <View style={s.emptyCard}>
        <Text style={s.eyebrow}>COACH LAB</Text>
        <Text style={s.emptyTitle}>Mode-specific in v1</Text>
        <Text style={s.emptyText}>
          Switch to Singles or Doubles and the lab will model the energy equation around your pass
          envelope.
        </Text>
      </View>
    );
  }

  const difficultyHint = `Lv.${sim.level} — ${
    sim.level <= 10 ? 'beginner' : sim.level <= 15 ? 'intermediate' : sim.level <= 20 ? 'advanced' : 'expert'
  } territory`;

  return (
    <View style={s.container}>
      {gapQuery.isLoading ? (
        <View style={s.seedHint}>
          <ActivityIndicator color={theme.spinner} size="small" />
          <Text style={s.seedHintText}>Seeding the lab from your recent sessions…</Text>
        </View>
      ) : null}

      {/* 1. Theory */}
      <TheoryFramework s={s} />

      {/* 2. Interactive lab */}
      <View style={s.labSection}>
        <Text style={s.eyebrow}>PRINCIPLE EXPLORER</Text>
        <Text style={s.cardTitleLg}>Drag the sliders, watch the energy story change</Text>

        {/* sliders */}
        <View style={s.sliderGroup}>
          <Text style={[s.groupKicker, { color: '#a78bfa' }]}>CHART</Text>
          <ConceptSlider id="difficulty" value={sliders.difficulty} onChange={update} hint={difficultyHint} s={s} />
        </View>

        <View style={s.sliderGroup}>
          <Text style={[s.groupKicker, { color: '#7dd3fc' }]}>MENTAL ECONOMY</Text>
          <ConceptSlider id="pattern" value={sliders.pattern} onChange={update} hint={familiarityHint(sliders.pattern)} s={s} />
          <ConceptSlider id="movement" value={sliders.movement} onChange={update} s={s} />
          <View style={s.groupStatRow}>
            <Text style={s.groupStat}>Economy <Text style={[s.groupStatStrong, { color: '#7dd3fc' }]}>{fmt(sim.economy, 0)}%</Text></Text>
            <Text style={s.groupStat}>Eff. Time <Text style={[s.groupStatStrong, { color: '#7dd3fc' }]}>{fmt(sim.effectiveTime, 0)}%</Text></Text>
          </View>
        </View>

        <View style={s.sliderGroup}>
          <Text style={[s.groupKicker, { color: '#f59e0b' }]}>PHYSICAL CAPACITY</Text>
          <ConceptSlider id="speed" value={sliders.speed} onChange={update} s={s} />
          <ConceptSlider id="stamina" value={sliders.stamina} onChange={update} s={s} />
          <View style={s.groupStatRow}>
            <Text style={s.groupStat}>Reserve <Text style={[s.groupStatStrong, { color: '#f59e0b' }]}>{fmt(sim.reserve, 0)}</Text></Text>
          </View>
        </View>

        {/* graph + narrative + metrics */}
        <EnergyGraph sim={sim} s={s} />
        <BlockerNarrative sim={sim} s={s} />
        <MetricStrip sim={sim} s={s} />
      </View>

      {/* 3. Level landscape */}
      <LevelCurveGraph sim={sim} sliders={sliders} s={s} />
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const makeStyles = (t: ThemeColors) => ({
  container: { gap: 14 },

  // shared eyebrow / titles
  eyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 2, color: t.textDim },
  cardTitle: { fontSize: 14, fontWeight: '800' as const, color: t.text, marginTop: 2 },
  cardTitleLg: { fontSize: 16, fontWeight: '800' as const, color: t.text, marginTop: 2 },
  bodyMuted: { fontSize: 12, color: t.textMuted, lineHeight: 17, marginTop: 6 },

  // generic card
  card: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
  },
  cardHeaderText: { gap: 0 },
  svg: { marginTop: 4 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1 },

  // legend
  legendRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10, marginTop: 4 },
  legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 10, color: t.textMuted },

  // sliders
  sliderGroup: { gap: 8 },
  groupKicker: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.6 },
  groupStatRow: { flexDirection: 'row' as const, gap: 16, marginTop: 2 },
  groupStat: { fontSize: 11, color: t.textMuted },
  groupStatStrong: { fontWeight: '900' as const },

  sliderRow: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
    gap: 6,
  },
  sliderHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  sliderLabel: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  sliderValue: { fontSize: 18, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  sliderHint: { fontSize: 11, color: t.textDim },
  sliderTrack: {
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  sliderFill: {
    position: 'absolute' as const,
    left: 0,
    top: 4,
    bottom: 4,
    borderRadius: 999,
    opacity: 0.85,
  },
  sliderThumb: {
    position: 'absolute' as const,
    width: 26,
    height: 26,
    marginLeft: -13,
    borderRadius: 999,
    backgroundColor: t.bg,
    borderWidth: 2,
  },

  // narrative
  narrativeRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  narrativeDot: { width: 10, height: 10, borderRadius: 999, marginTop: 4 },
  narrativeBody: { flex: 1, gap: 4 },
  narrativeTitle: { fontSize: 13, fontWeight: '800' as const },
  narrativeText: { fontSize: 12.5, color: t.textMuted, lineHeight: 18 },

  // metric strip
  metricStrip: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  metricTile: {
    flexBasis: '31%' as const,
    flexGrow: 1,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center' as const,
    gap: 2,
  },
  metricLabel: { fontSize: 8, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  metricValue: { fontSize: 17, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  metricPos: { color: '#34d399' },
  metricNeg: { color: '#f87171' },

  // theory
  theoryWrap: { gap: 12 },
  heroCard: {
    backgroundColor: t.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
    padding: 18,
    gap: 8,
  },
  heroTitle: { fontSize: 20, fontWeight: '900' as const, color: t.text, lineHeight: 26 },
  heroBody: { fontSize: 13, color: t.textMuted, lineHeight: 19 },

  theoryGrid: { gap: 12 },
  theoryCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  theoryKicker: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 2 },
  theoryHeading: { fontSize: 17, fontWeight: '900' as const },
  theoryText: { fontSize: 12.5, color: t.textMuted, lineHeight: 18, marginBottom: 4 },
  theoryBulletRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8 },
  theoryBullet: { width: 6, height: 6, borderRadius: 999, marginTop: 6 },
  theoryBulletText: { flex: 1, fontSize: 12, color: t.textMuted, lineHeight: 17 },
  theoryBulletStrong: { fontWeight: '800' as const, color: t.text },
  theoryNote: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 8,
    borderRadius: 10,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  formulaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  formulaChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  formulaChipText: { fontSize: 12, fontWeight: '800' as const },
  formulaOp: { fontSize: 15, fontWeight: '900' as const, color: t.textDim },
  formulaResult: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  formulaCaption: { fontSize: 11, color: t.textDim, textAlign: 'center' as const },

  // lab section wrapper
  labSection: {
    backgroundColor: t.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
    padding: 14,
    gap: 12,
  },

  // seed hint
  seedHint: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 4 },
  seedHintText: { fontSize: 12, color: t.textMuted },

  // overall empty state
  emptyCard: {
    backgroundColor: t.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    gap: 8,
  },
  emptyTitle: { fontSize: 19, fontWeight: '900' as const, color: t.text, marginTop: 4 },
  emptyText: { fontSize: 13, color: t.textMuted, textAlign: 'center' as const, lineHeight: 19, maxWidth: 360 },
});

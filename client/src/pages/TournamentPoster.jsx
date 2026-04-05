import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTournament, getPlayers, getPhases } from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS, FORMAT_DESCRIPTIONS } from '../utils/tournamentConstants';
import { formatTournamentDate } from '../components/tournament/TournamentChrome';
import { getAvatarUrl } from '../components/AvatarPicker';

// ── Intersection Observer hook for scroll-triggered reveals ──
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// ── Stagger children entrance ──
function Stagger({ children, visible, base = 120, className = '' }) {
  return (
    <div className={className}>
      {React.Children.map(children, (child, i) => (
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(24px)',
            transition: `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${base + i * 80}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${base + i * 80}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

// ── Format color system ──
const FORMAT_COLORS = {
  round_robin: { accent: '#38bdf8', glow: 'rgba(56,189,248,0.15)', border: 'border-sky-400/30', bg: 'bg-sky-500/8', text: 'text-sky-300', dot: 'bg-sky-400' },
  pools: { accent: '#22d3ee', glow: 'rgba(34,211,238,0.15)', border: 'border-cyan-400/30', bg: 'bg-cyan-500/8', text: 'text-cyan-300', dot: 'bg-cyan-400' },
  single_elim: { accent: '#ffd700', glow: 'rgba(255,215,0,0.15)', border: 'border-piu-gold/30', bg: 'bg-piu-gold/8', text: 'text-piu-gold', dot: 'bg-piu-gold' },
  double_elim: { accent: '#fbbf24', glow: 'rgba(251,191,36,0.15)', border: 'border-amber-400/30', bg: 'bg-amber-500/8', text: 'text-amber-300', dot: 'bg-amber-400' },
  gauntlet: { accent: '#ff3366', glow: 'rgba(255,51,102,0.15)', border: 'border-piu-accent/30', bg: 'bg-piu-accent/8', text: 'text-piu-accent', dot: 'bg-piu-accent' },
  hour_of_power: { accent: '#34d399', glow: 'rgba(52,211,153,0.15)', border: 'border-emerald-400/30', bg: 'bg-emerald-500/8', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  b15: { accent: '#a78bfa', glow: 'rgba(167,139,250,0.15)', border: 'border-violet-400/30', bg: 'bg-violet-500/8', text: 'text-violet-300', dot: 'bg-violet-400' },
};

function getFormatColor(format) {
  return FORMAT_COLORS[format] || FORMAT_COLORS.round_robin;
}

// ── Phase rules extraction ──
function getPhaseRules(phase) {
  const f = phase.format;
  const c = phase.config || {};
  const rules = [];
  if (f !== 'gauntlet' && c.cards_per_draw) rules.push(`${c.cards_per_draw} cards drawn`);
  if (f !== 'gauntlet' && c.vetoes_per_player !== undefined) rules.push(`${c.vetoes_per_player} veto${c.vetoes_per_player !== 1 ? 'es' : ''}`);
  if (f !== 'gauntlet' && c.best_of) rules.push(`Best of ${c.best_of}`);
  if (c.rounds) rules.push(`${c.rounds} round${c.rounds > 1 ? 's' : ''}`);
  if (c.pool_count) rules.push(`${c.pool_count} pools`);
  if (c.duration_minutes) rules.push(`${c.duration_minutes} min session`);
  if (f === 'gauntlet') {
    const start = parseInt(c.start_level ?? c.start_single_level, 10) || 19;
    const final = parseInt(c.final_level ?? c.final_single_level, 10) || 24;
    rules.push(`Lv ${start} \u2192 Lv ${final}`);
    rules.push('Mixed singles/doubles');
    const bo = parseInt(c.best_of, 10) || 3;
    if (bo === 3) rules.push('5 cards, 1 veto each, Bo3');
    else rules.push(`Best of ${bo}`);
  }
  if (f === 'b15') rules.push('Best 15 rating-point scores');
  return rules;
}

function getAdvancementLabel(phase) {
  const adv = phase.advancement || {};
  if (!adv.type || adv.type === 'all') return null;
  if (adv.type === 'top_n') return `Top ${adv.count || '?'} advance`;
  if (adv.type === 'per_pool_top_n') return `Top ${adv.count || '?'} per pool advance`;
  if (adv.type === 'threshold') return `${adv.threshold || '?'}+ points advance`;
  return null;
}

// ══════════════════════════════════════════════════════════════
//  ANIMATED DIAGRAMS
// ══════════════════════════════════════════════════════════════

// ── Round Robin Diagram: animated circle of players with match lines ──
function RoundRobinDiagram({ playerCount, visible }) {
  const n = Math.min(playerCount || 6, 8);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 80;
  const players = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });

  // Generate all match pairs
  const lines = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      lines.push({ from: players[i], to: players[j], idx: lines.length });
    }
  }

  return (
    <div className="flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Match connection lines - animate in sequence */}
        {lines.map((line, i) => (
          <line
            key={`line-${i}`}
            x1={line.from.x} y1={line.from.y}
            x2={line.to.x} y2={line.to.y}
            stroke="rgba(56,189,248,0.2)"
            strokeWidth="1"
            style={{
              opacity: visible ? 1 : 0,
              transition: `opacity 0.3s ease ${300 + i * 60}ms`,
            }}
          />
        ))}

        {/* Player nodes */}
        {players.map((p, i) => (
          <g key={`player-${i}`}>
            <circle
              cx={p.x} cy={p.y} r="14"
              fill="rgba(56,189,248,0.12)"
              stroke="rgba(56,189,248,0.5)"
              strokeWidth="1.5"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'scale(1)' : 'scale(0)',
                transformOrigin: `${p.x}px ${p.y}px`,
                transition: `opacity 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms, transform 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms`,
              }}
            />
            <text
              x={p.x} y={p.y + 1}
              textAnchor="middle" dominantBaseline="middle"
              fill="rgba(56,189,248,0.9)"
              fontSize="10" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
              style={{
                opacity: visible ? 1 : 0,
                transition: `opacity 0.3s ease ${100 + i * 60}ms`,
              }}
            >
              P{i + 1}
            </text>
          </g>
        ))}

        {/* Center label */}
        <text
          x={cx} y={cy}
          textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.08)"
          fontSize="28" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease 800ms' }}
        >
          {'\u{1F504}'}
        </text>
      </svg>
    </div>
  );
}

// ── Gauntlet Ladder Diagram ──
function GauntletDiagram({ playerCount, visible }) {
  const n = Math.min(playerCount || 6, 7);
  const matchCount = n - 1;
  const stepH = 44;
  const totalH = matchCount * stepH + 40;
  const w = 240;

  return (
    <div className="flex items-center justify-center">
      <svg width={w} height={totalH} viewBox={`0 0 ${w} ${totalH}`} className="overflow-visible">
        {/* Vertical ladder spine */}
        <line
          x1={w / 2} y1={totalH - 10} x2={w / 2} y2={20}
          stroke="rgba(255,51,102,0.15)" strokeWidth="2" strokeDasharray="4 4"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease 200ms' }}
        />

        {/* Match rungs */}
        {Array.from({ length: matchCount }, (_, i) => {
          const y = totalH - 20 - i * stepH;
          const isFinal = i === matchCount - 1;
          const delay = 300 + i * 150;
          return (
            <g key={`rung-${i}`}>
              {/* Rung line */}
              <line
                x1={w / 2 - 50} y1={y} x2={w / 2 + 50} y2={y}
                stroke={isFinal ? 'rgba(255,215,0,0.4)' : 'rgba(255,51,102,0.25)'}
                strokeWidth={isFinal ? 2 : 1.5}
                style={{
                  opacity: visible ? 1 : 0,
                  transition: `opacity 0.4s ease ${delay}ms`,
                }}
              />

              {/* Left player (challenger) */}
              <circle
                cx={w / 2 - 50} cy={y} r="8"
                fill={isFinal ? 'rgba(255,215,0,0.15)' : 'rgba(255,51,102,0.12)'}
                stroke={isFinal ? 'rgba(255,215,0,0.5)' : 'rgba(255,51,102,0.4)'}
                strokeWidth="1.5"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'scale(1)' : 'scale(0)',
                  transformOrigin: `${w / 2 - 50}px ${y}px`,
                  transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${delay + 80}ms`,
                }}
              />

              {/* VS */}
              <text
                x={w / 2} y={y + 1}
                textAnchor="middle" dominantBaseline="middle"
                fill={isFinal ? 'rgba(255,215,0,0.6)' : 'rgba(255,51,102,0.4)'}
                fontSize="8" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
                style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 100}ms` }}
              >
                VS
              </text>

              {/* Right player (defender/winner from below) */}
              <circle
                cx={w / 2 + 50} cy={y} r="8"
                fill={isFinal ? 'rgba(255,215,0,0.15)' : 'rgba(255,51,102,0.12)'}
                stroke={isFinal ? 'rgba(255,215,0,0.5)' : 'rgba(255,51,102,0.4)'}
                strokeWidth="1.5"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'scale(1)' : 'scale(0)',
                  transformOrigin: `${w / 2 + 50}px ${y}px`,
                  transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${delay + 80}ms`,
                }}
              />

              {/* Match label */}
              <text
                x={w / 2 + 75} y={y + 1}
                dominantBaseline="middle"
                fill={isFinal ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.2)'}
                fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
                style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 150}ms` }}
              >
                {isFinal ? 'FINAL' : `#${i + 1}`}
              </text>

              {/* Winner arrow going up */}
              {i < matchCount - 1 && (
                <path
                  d={`M${w / 2},${y - 4} L${w / 2},${y - stepH + 12}`}
                  stroke="rgba(255,51,102,0.2)"
                  strokeWidth="1" fill="none"
                  markerEnd="none"
                  style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 200}ms` }}
                />
              )}
            </g>
          );
        })}

        {/* Crown at top */}
        <text
          x={w / 2} y={10}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="18"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease 1200ms' }}
        >
          {'\u{1F451}'}
        </text>
      </svg>
    </div>
  );
}

// ── Bracket Diagram ──
function BracketDiagram({ playerCount, visible }) {
  const n = Math.min(playerCount || 8, 8);
  const rounds = Math.ceil(Math.log2(n));
  const w = rounds * 100 + 40;
  const h = 200;

  return (
    <div className="flex items-center justify-center">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        {Array.from({ length: rounds }, (_, round) => {
          const matchesInRound = Math.pow(2, rounds - round - 1);
          const spacing = h / matchesInRound;
          const x = 20 + round * 100;
          const isFinal = round === rounds - 1;
          const delay = 200 + round * 250;

          return Array.from({ length: matchesInRound }, (_, mi) => {
            const y = spacing / 2 + mi * spacing;
            const slotH = Math.min(spacing * 0.6, 36);

            return (
              <g key={`r${round}-m${mi}`}>
                {/* Match bracket */}
                <rect
                  x={x} y={y - slotH / 2}
                  width="72" height={slotH}
                  rx="6" ry="6"
                  fill={isFinal ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)'}
                  stroke={isFinal ? 'rgba(255,215,0,0.35)' : 'rgba(255,255,255,0.1)'}
                  strokeWidth="1"
                  style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'scale(1)' : 'scale(0.8)',
                    transformOrigin: `${x + 36}px ${y}px`,
                    transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${delay + mi * 60}ms`,
                  }}
                />
                {/* Divider line */}
                <line
                  x1={x + 4} y1={y} x2={x + 68} y2={y}
                  stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                  style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 100 + mi * 60}ms` }}
                />
                {/* Round label on first match only */}
                {mi === 0 && (
                  <text
                    x={x + 36} y={-6}
                    textAnchor="middle"
                    fill={isFinal ? 'rgba(255,215,0,0.6)' : 'rgba(255,255,255,0.25)'}
                    fontSize="8" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
                    style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay}ms` }}
                  >
                    {isFinal ? 'FINAL' : round === rounds - 2 ? 'SEMIS' : `R${round + 1}`}
                  </text>
                )}
                {/* Connector to next round */}
                {round < rounds - 1 && (
                  <line
                    x1={x + 72} y1={y}
                    x2={x + 100} y2={y + (mi % 2 === 0 ? spacing / 4 : -spacing / 4)}
                    stroke="rgba(255,215,0,0.12)" strokeWidth="1"
                    style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 200}ms` }}
                  />
                )}
              </g>
            );
          });
        })}

        {/* Trophy */}
        <text
          x={w - 10} y={h / 2}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="18"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease 1000ms' }}
        >
          {'\u{1F3C6}'}
        </text>
      </svg>
    </div>
  );
}

// ── Pools Diagram ──
function PoolsDiagram({ poolCount, visible }) {
  const pools = Math.min(poolCount || 4, 6);
  const perPool = 4;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {Array.from({ length: pools }, (_, pi) => (
        <div
          key={pi}
          className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.04] p-2.5"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1)' : 'scale(0.85)',
            transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${200 + pi * 100}ms`,
          }}
        >
          <div className="mb-1.5 text-center font-display text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-400/60">
            Pool {String.fromCharCode(65 + pi)}
          </div>
          <div className="flex flex-col gap-1">
            {Array.from({ length: perPool }, (_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-cyan-400/20 border border-cyan-400/30" />
                <div className="h-1.5 rounded-full bg-white/6" style={{ width: `${28 + Math.random() * 20}px` }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Generic format diagram (Hour of Power, B15) ──
function TimedSessionDiagram({ format, visible }) {
  const isHop = format === 'hour_of_power';
  const color = isHop ? 'emerald' : 'violet';

  return (
    <div className="flex items-center justify-center">
      <div
        className={`relative flex h-28 w-56 items-center justify-center rounded-2xl border border-${color}-400/20 bg-${color}-500/[0.04]`}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.9)',
          transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1) 200ms',
        }}
      >
        <div className="text-center">
          <div className="text-3xl mb-1">{FORMAT_ICONS[format]}</div>
          <div className={`font-display text-xs font-bold text-${color}-300/60 uppercase tracking-[0.14em]`}>
            {isHop ? '60:00' : 'Best 15'}
          </div>
        </div>
        {/* Animated timer arc */}
        <svg className="absolute inset-0" width="100%" height="100%" viewBox="0 0 224 112">
          <circle
            cx="112" cy="56" r="48"
            fill="none"
            stroke={`rgba(${isHop ? '52,211,153' : '167,139,250'},0.1)`}
            strokeWidth="2"
          />
          <circle
            cx="112" cy="56" r="48"
            fill="none"
            stroke={`rgba(${isHop ? '52,211,153' : '167,139,250'},0.35)`}
            strokeWidth="2"
            strokeDasharray="301.6"
            strokeDashoffset={visible ? '75.4' : '301.6'}
            strokeLinecap="round"
            transform="rotate(-90 112 56)"
            style={{ transition: 'stroke-dashoffset 2s cubic-bezier(0.16,1,0.3,1) 500ms' }}
          />
        </svg>
      </div>
    </div>
  );
}

// ── Format diagram router ──
function FormatDiagram({ format, playerCount, config, visible }) {
  if (format === 'round_robin') return <RoundRobinDiagram playerCount={playerCount} visible={visible} />;
  if (format === 'gauntlet') return <GauntletDiagram playerCount={playerCount} visible={visible} />;
  if (format === 'single_elim') return <BracketDiagram playerCount={playerCount} visible={visible} />;
  if (format === 'double_elim') return <BracketDiagram playerCount={playerCount} visible={visible} />;
  if (format === 'pools') return <PoolsDiagram poolCount={config?.pool_count} visible={visible} />;
  if (format === 'hour_of_power' || format === 'b15') return <TimedSessionDiagram format={format} visible={visible} />;
  return null;
}

// ══════════════════════════════════════════════════════════════
//  PHASE SECTION
// ══════════════════════════════════════════════════════════════

function PhaseSection({ phase, index, total, playerCount }) {
  const [ref, visible] = useReveal(0.1);
  const color = getFormatColor(phase.format);
  const rules = getPhaseRules(phase);
  const advLabel = getAdvancementLabel(phase);
  const isLast = index === total - 1;

  return (
    <div ref={ref} className="relative">
      {/* Connecting line to next phase */}
      {!isLast && (
        <div
          className="absolute left-1/2 -translate-x-px bottom-0 translate-y-full h-16 w-0.5"
          style={{
            background: `linear-gradient(to bottom, ${color.accent}33, transparent)`,
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.6s ease 800ms',
          }}
        />
      )}

      <div
        className={`relative overflow-hidden rounded-2xl border ${color.border} p-6 sm:p-8`}
        style={{
          background: `radial-gradient(circle at 0% 50%, ${color.glow}, transparent 50%), rgba(9,12,22,0.92)`,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(32px)',
          transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute inset-x-8 top-0 h-px"
          style={{
            background: `linear-gradient(to right, transparent, ${color.accent}55, transparent)`,
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.5s ease 300ms',
          }}
        />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          {/* Left: Info */}
          <div className="flex-1 min-w-0">
            {/* Phase number + title */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${color.bg} border ${color.border}`}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'scale(1) rotate(0)' : 'scale(0) rotate(-90deg)',
                  transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1) 150ms',
                }}
              >
                <span className="text-lg">{FORMAT_ICONS[phase.format]}</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                    Phase {index + 1} of {total}
                  </span>
                </div>
                <h3 className={`font-display text-xl font-bold tracking-wide ${color.text}`}>
                  {phase.name || FORMAT_LABELS[phase.format]}
                </h3>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
              {FORMAT_DESCRIPTIONS[phase.format]}
            </p>

            {/* Rules pills */}
            <Stagger visible={visible} base={300} className="flex flex-wrap gap-1.5 mb-4">
              {rules.map((rule) => (
                <span
                  key={rule}
                  className="inline-flex items-center rounded-full border border-white/10 bg-black/18 px-2.5 py-1 text-[11px] text-zinc-300"
                >
                  {rule}
                </span>
              ))}
            </Stagger>

            {/* Advancement */}
            {advLabel && (
              <div
                className="inline-flex items-center gap-1.5 rounded-full border border-piu-green/20 bg-piu-green/8 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-piu-green"
                style={{
                  opacity: visible ? 1 : 0,
                  transition: 'opacity 0.4s ease 600ms',
                }}
              >
                <span>{'\u2192'}</span>
                <span>{advLabel}</span>
              </div>
            )}
          </div>

          {/* Right: Animated diagram */}
          <div className="flex shrink-0 items-center justify-center lg:w-64">
            <FormatDiagram
              format={phase.format}
              playerCount={playerCount}
              config={phase.config}
              visible={visible}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN POSTER PAGE
// ══════════════════════════════════════════════════════════════

export default function TournamentPoster() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, p] = await Promise.all([getTournament(id), getPlayers(id)]);
        setTournament(t);
        setPlayers(p);
        try {
          const ph = await getPhases(id);
          setPhases(Array.isArray(ph) ? ph : []);
        } catch { setPhases([]); }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const [heroRef, heroVisible] = useReveal(0.05);
  const [playersRef, playersVisible] = useReveal(0.1);
  const [footerRef, footerVisible] = useReveal(0.1);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-piu-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-piu-accent/30 border-t-piu-accent" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-piu-bg text-red-400">
        Tournament not found
      </div>
    );
  }

  const formattedDate = formatTournamentDate(tournament.date);
  const title = String(tournament.name || 'Tournament').trim();
  const config = tournament.config || {};
  const hasPhases = phases.length > 0;

  // For legacy tournaments without phases, construct a virtual phase list
  const displayPhases = hasPhases ? phases : (() => {
    const virtual = [];
    if (config.gauntlet_enabled) {
      virtual.push({
        format: 'round_robin', name: 'Round Robin',
        config: { rounds: tournament.total_rounds || 3, cards_per_draw: config.cards_per_draw, vetoes_per_player: config.vetoes_per_player, best_of: config.best_of, round_levels: config.round_levels },
        advancement: { type: 'all' },
      });
      virtual.push({
        format: 'gauntlet', name: 'Gauntlet',
        config: { start_level: config.start_single_level, final_level: config.final_single_level, best_of: config.gauntlet_best_of || 3 },
        advancement: null,
      });
    } else {
      virtual.push({
        format: 'round_robin', name: 'Round Robin',
        config: { rounds: tournament.total_rounds || 3, cards_per_draw: config.cards_per_draw, vetoes_per_player: config.vetoes_per_player, best_of: config.best_of, round_levels: config.round_levels },
        advancement: null,
      });
    }
    return virtual;
  })();

  return (
    <div className="min-h-screen bg-piu-bg">
      {/* ═══ HERO ═══ */}
      <div
        ref={heroRef}
        className="relative overflow-hidden border-b border-white/5"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(255,51,102,0.14), transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(255,199,92,0.08), transparent 40%), radial-gradient(ellipse at 50% 50%, rgba(68,136,255,0.06), transparent 60%), #0a0a1a',
        }}
      >
        {/* Grid overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          }}
        />

        {/* Top line accent */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-piu-accent/40 to-transparent" />

        <div className="relative mx-auto max-w-4xl px-4 py-16 sm:py-24 text-center">
          {/* Back link */}
          <div
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(-10px)',
              transition: 'all 0.4s ease',
            }}
          >
            <Link
              to={`/tournament/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-piu-accent/25 hover:text-zinc-200 mb-8"
            >
              <span>{'\u2190'}</span> Back to tournament
            </Link>
          </div>

          {/* Avatar */}
          {tournament.avatar && (
            <div
              className="mb-6 flex justify-center"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'scale(1)' : 'scale(0.8)',
                transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1) 100ms',
              }}
            >
              <img
                src={getAvatarUrl(tournament.avatar)}
                alt={title}
                className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
              />
            </div>
          )}

          {/* Metadata pills */}
          <div
            className="flex flex-wrap items-center justify-center gap-2 mb-5"
            style={{
              opacity: heroVisible ? 1 : 0,
              transition: 'opacity 0.4s ease 200ms',
            }}
          >
            {formattedDate && (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-black/18 px-2.5 py-1 text-[11px] text-zinc-300">
                {formattedDate}
              </span>
            )}
            {tournament.location && (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-black/18 px-2.5 py-1 text-[11px] text-zinc-300">
                {tournament.location}
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-piu-accent/20 bg-piu-accent/8 px-2.5 py-1 text-[11px] font-display font-bold text-rose-100">
              {players.length} players
            </span>
          </div>

          {/* Title */}
          <h1
            className="font-display text-4xl font-bold tracking-[0.02em] text-white sm:text-5xl lg:text-6xl"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1) 150ms',
            }}
          >
            {title}
          </h1>

          {/* Subtitle */}
          <p
            className="mx-auto mt-4 max-w-xl text-base text-zinc-400"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(14px)',
              transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1) 300ms',
            }}
          >
            {displayPhases.length} phase{displayPhases.length !== 1 ? 's' : ''} &middot; {players.length} players &middot;{' '}
            {displayPhases.map(p => FORMAT_LABELS[p.format] || p.format).join(' \u2192 ')}
          </p>

          {/* Phase quick-nav dots */}
          <div
            className="mt-8 flex items-center justify-center gap-3"
            style={{
              opacity: heroVisible ? 1 : 0,
              transition: 'opacity 0.4s ease 500ms',
            }}
          >
            {displayPhases.map((phase, i) => {
              const c = getFormatColor(phase.format);
              return (
                <div key={i} className="flex items-center gap-3">
                  {i > 0 && <div className="h-px w-6 bg-white/10" />}
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border ${c.border} ${c.bg}`}
                    title={phase.name || FORMAT_LABELS[phase.format]}
                  >
                    <span className="text-sm">{FORMAT_ICONS[phase.format]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ HOW IT WORKS LABEL ═══ */}
      <div className="mx-auto max-w-4xl px-4 pt-16 pb-8 text-center">
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600">How it works</p>
        <div className="mx-auto mt-3 h-px w-12 bg-gradient-to-r from-transparent via-piu-accent/40 to-transparent" />
      </div>

      {/* ═══ PHASE SECTIONS ═══ */}
      <div className="mx-auto max-w-4xl px-4 space-y-20 pb-16">
        {displayPhases.map((phase, i) => (
          <PhaseSection
            key={phase.id || `virtual-${i}`}
            phase={phase}
            index={i}
            total={displayPhases.length}
            playerCount={players.length}
          />
        ))}
      </div>

      {/* ═══ PLAYERS GRID ═══ */}
      {players.length > 0 && (
        <div ref={playersRef} className="border-t border-white/5 bg-zinc-950/40">
          <div className="mx-auto max-w-4xl px-4 py-16">
            <div
              className="text-center mb-8"
              style={{
                opacity: playersVisible ? 1 : 0,
                transform: playersVisible ? 'translateY(0)' : 'translateY(16px)',
                transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600 mb-3">Competing</p>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white">{players.length} Players</h2>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {players.map((player, i) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 transition-colors hover:border-piu-accent/20 hover:bg-white/[0.05]"
                  style={{
                    opacity: playersVisible ? 1 : 0,
                    transform: playersVisible ? 'scale(1)' : 'scale(0.85)',
                    transition: `all 0.35s cubic-bezier(0.16,1,0.3,1) ${Math.min(i * 30, 600)}ms`,
                  }}
                >
                  {player.avatar ? (
                    <img src={getAvatarUrl(player.avatar)} alt="" className="h-5 w-5 rounded-full ring-1 ring-white/10" />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-piu-accent to-purple-700 text-[8px] font-bold text-white ring-1 ring-white/10">
                      {String(player.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-display text-xs font-bold text-zinc-200">{player.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <div ref={footerRef} className="border-t border-white/5">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <div
            style={{
              opacity: footerVisible ? 1 : 0,
              transition: 'opacity 0.5s ease 100ms',
            }}
          >
            <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-zinc-600 mb-3">
              Powered by
            </p>
            <p className="font-display text-lg font-bold tracking-wider">
              <span className="text-piu-accent">PUMP</span>{' '}
              <span className="text-white">SHINSA</span>
            </p>
            <div className="mt-6">
              <Link
                to={`/tournament/${id}`}
                className="inline-flex items-center gap-2 rounded-full border border-piu-accent/20 bg-piu-accent/8 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-[0.14em] text-rose-100 transition-all hover:border-piu-accent/35 hover:bg-piu-accent/14 hover:shadow-[0_0_20px_rgba(255,51,102,0.15)]"
              >
                View Live Tournament
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

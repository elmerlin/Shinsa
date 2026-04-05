import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTournament, updateTournament, getPlayers, getPhases, getPlayerScoutingCard } from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS, FORMAT_DESCRIPTIONS } from '../utils/tournamentConstants';
import { formatTournamentDate } from '../components/tournament/TournamentChrome';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../utils/countryFlags';
import { useAuth } from '../contexts/AuthContext';

// ── Scroll-triggered reveal hook ──
function useReveal() {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const nodeRef = useRef(null);

  const reveal = useCallback(() => {
    if (visibleRef.current) return;
    visibleRef.current = true;
    setVisible(true);
  }, []);

  const check = useCallback(() => {
    const node = nodeRef.current;
    if (!node || visibleRef.current) return;
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 1.15 && rect.bottom > 0) reveal();
  }, [reveal]);

  const ref = useCallback((node) => {
    nodeRef.current = node;
    if (node && !visibleRef.current) {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) reveal();
    }
  }, [reveal]);

  useEffect(() => {
    if (visibleRef.current) return;
    window.addEventListener('scroll', check, { passive: true });
    let raf;
    const start = Date.now();
    const poll = () => {
      check();
      if (!visibleRef.current && Date.now() - start < 3000) raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => { window.removeEventListener('scroll', check); cancelAnimationFrame(raf); };
  }, [check]);

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

// ── Looping animation cycle hook ──
function useAnimationCycle(duration, pause, visible) {
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const total = duration + pause;
    const id = setInterval(() => setCycle(c => c + 1), total);
    return () => clearInterval(id);
  }, [visible, duration, pause]);
  return cycle;
}

// ── Format color system ──
const FORMAT_COLORS = {
  round_robin: { accent: '#38bdf8', glow: 'rgba(56,189,248,0.15)', border: 'border-sky-400/30', bg: 'bg-sky-500/8', text: 'text-sky-300', dot: 'bg-sky-400', rgb: '56,189,248' },
  pools: { accent: '#22d3ee', glow: 'rgba(34,211,238,0.15)', border: 'border-cyan-400/30', bg: 'bg-cyan-500/8', text: 'text-cyan-300', dot: 'bg-cyan-400', rgb: '34,211,238' },
  single_elim: { accent: '#ffd700', glow: 'rgba(255,215,0,0.15)', border: 'border-piu-gold/30', bg: 'bg-piu-gold/8', text: 'text-piu-gold', dot: 'bg-piu-gold', rgb: '255,215,0' },
  double_elim: { accent: '#fbbf24', glow: 'rgba(251,191,36,0.15)', border: 'border-amber-400/30', bg: 'bg-amber-500/8', text: 'text-amber-300', dot: 'bg-amber-400', rgb: '251,191,36' },
  gauntlet: { accent: '#ff3366', glow: 'rgba(255,51,102,0.15)', border: 'border-piu-accent/30', bg: 'bg-piu-accent/8', text: 'text-piu-accent', dot: 'bg-piu-accent', rgb: '255,51,102' },
  hour_of_power: { accent: '#34d399', glow: 'rgba(52,211,153,0.15)', border: 'border-emerald-400/30', bg: 'bg-emerald-500/8', text: 'text-emerald-300', dot: 'bg-emerald-400', rgb: '52,211,153' },
  b15: { accent: '#a78bfa', glow: 'rgba(167,139,250,0.15)', border: 'border-violet-400/30', bg: 'bg-violet-500/8', text: 'text-violet-300', dot: 'bg-violet-400', rgb: '167,139,250' },
};

function getFormatColor(format) {
  return FORMAT_COLORS[format] || FORMAT_COLORS.round_robin;
}

// ── Player avatar helper for SVG ──
function PlayerNode({ x, y, r, player, color, delay, visible, glow }) {
  const avatarUrl = player?.avatar ? getAvatarUrl(player.avatar) : null;
  const initial = String(player?.name || '?').charAt(0).toUpperCase();
  const clipId = `clip-${player?.id || Math.random()}-${x}-${y}`;
  return (
    <g
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0)',
        transformOrigin: `${x}px ${y}px`,
        transition: `opacity 0.4s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.4s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {glow && (
        <circle cx={x} cy={y} r={r + 4} fill="none" stroke={color} strokeWidth="1" opacity="0.3">
          <animate attributeName="r" values={`${r + 2};${r + 6};${r + 2}`} dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      <defs>
        <clipPath id={clipId}>
          <circle cx={x} cy={y} r={r} />
        </clipPath>
      </defs>
      <circle cx={x} cy={y} r={r} fill={`rgba(${color.replace(/[^0-9,]/g, '')},0.15)`} stroke={color} strokeWidth="1.5" opacity="0.6" />
      {avatarUrl ? (
        <image href={avatarUrl} x={x - r} y={y - r} width={r * 2} height={r * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={r * 0.9} fontFamily="Rajdhani, sans-serif" fontWeight="bold">
          {initial}
        </text>
      )}
    </g>
  );
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
//  ANIMATED DIAGRAMS (looping, with real player avatars)
// ══════════════════════════════════════════════════════════════

function RoundRobinDiagram({ players: allPlayers, visible }) {
  const cycle = useAnimationCycle(4000, 1500, visible);
  const players = allPlayers.slice(0, 8);
  const n = players.length || 6;
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = 100;
  const nodeR = 18;
  const positions = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });

  const lines = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      lines.push({ from: positions[i], to: positions[j], idx: lines.length });
    }
  }

  // Highlight one match at a time in a loop
  const activeLineIdx = visible ? (cycle % lines.length) : -1;
  const color = FORMAT_COLORS.round_robin;

  return (
    <div className="flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {lines.map((line, i) => (
          <line
            key={`line-${i}`}
            x1={line.from.x} y1={line.from.y}
            x2={line.to.x} y2={line.to.y}
            stroke={i === activeLineIdx ? color.accent : `rgba(${color.rgb},0.12)`}
            strokeWidth={i === activeLineIdx ? 2 : 1}
            style={{
              opacity: visible ? 1 : 0,
              transition: 'opacity 0.3s, stroke 0.4s, stroke-width 0.4s',
            }}
          />
        ))}
        {positions.map((p, i) => {
          const isInMatch = visible && lines[activeLineIdx] && (
            (positions.indexOf(lines[activeLineIdx]?.from) === i || positions.indexOf(lines[activeLineIdx]?.to) === i)
          );
          return (
            <PlayerNode
              key={players[i]?.id || i}
              x={p.x} y={p.y} r={nodeR}
              player={players[i] || { name: `P${i + 1}` }}
              color={color.accent}
              delay={i * 60}
              visible={visible}
              glow={isInMatch}
            />
          );
        })}
        {/* VS label on active match */}
        {visible && lines[activeLineIdx] && (
          <text
            x={(lines[activeLineIdx].from.x + lines[activeLineIdx].to.x) / 2}
            y={(lines[activeLineIdx].from.y + lines[activeLineIdx].to.y) / 2 - 8}
            textAnchor="middle" dominantBaseline="middle"
            fill={color.accent} fontSize="10" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
            style={{ transition: 'opacity 0.3s' }}
          >
            VS
          </text>
        )}
      </svg>
    </div>
  );
}

function GauntletDiagram({ players: allPlayers, visible }) {
  const cycle = useAnimationCycle(3000, 1200, visible);
  const players = allPlayers.slice(0, 7);
  const n = players.length || 6;
  const matchCount = n - 1;
  const stepH = 52;
  const totalH = matchCount * stepH + 50;
  const w = 300;
  const nodeR = 14;
  const color = FORMAT_COLORS.gauntlet;

  const activeRung = visible ? (cycle % matchCount) : -1;

  return (
    <div className="flex items-center justify-center">
      <svg width={w} height={totalH} viewBox={`0 0 ${w} ${totalH}`} className="overflow-visible">
        <line
          x1={w / 2} y1={totalH - 10} x2={w / 2} y2={20}
          stroke={`rgba(${color.rgb},0.12)`} strokeWidth="2" strokeDasharray="4 4"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease 200ms' }}
        />
        {Array.from({ length: matchCount }, (_, i) => {
          const y = totalH - 24 - i * stepH;
          const isFinal = i === matchCount - 1;
          const isActive = i === activeRung;
          const delay = 300 + i * 150;
          const matchColor = isFinal ? 'rgba(255,215,0,0.5)' : color.accent;
          return (
            <g key={`rung-${i}`}>
              <line
                x1={w / 2 - 60} y1={y} x2={w / 2 + 60} y2={y}
                stroke={isActive ? matchColor : (isFinal ? 'rgba(255,215,0,0.2)' : `rgba(${color.rgb},0.15)`)}
                strokeWidth={isActive ? 2.5 : 1.5}
                style={{ opacity: visible ? 1 : 0, transition: `all 0.4s ease ${delay}ms` }}
              />
              <PlayerNode
                x={w / 2 - 60} y={y} r={nodeR}
                player={players[i] || { name: `P${i + 1}` }}
                color={isFinal ? '#ffd700' : color.accent}
                delay={delay + 80}
                visible={visible}
                glow={isActive}
              />
              <text
                x={w / 2} y={y + 1}
                textAnchor="middle" dominantBaseline="middle"
                fill={isActive ? matchColor : `rgba(${color.rgb},0.3)`}
                fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
                style={{ opacity: visible ? 1 : 0, transition: `all 0.3s ease ${delay + 100}ms` }}
              >
                VS
              </text>
              <PlayerNode
                x={w / 2 + 60} y={y} r={nodeR}
                player={players[i + 1] || { name: `P${i + 2}` }}
                color={isFinal ? '#ffd700' : color.accent}
                delay={delay + 80}
                visible={visible}
                glow={isActive}
              />
              <text
                x={w / 2 + 95} y={y + 1}
                dominantBaseline="middle"
                fill={isFinal ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.2)'}
                fontSize="9" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
                style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 150}ms` }}
              >
                {isFinal ? 'FINAL' : `#${i + 1}`}
              </text>
              {i < matchCount - 1 && (
                <path
                  d={`M${w / 2},${y - 4} L${w / 2},${y - stepH + 16}`}
                  stroke={`rgba(${color.rgb},0.15)`}
                  strokeWidth="1" fill="none"
                  style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 200}ms` }}
                />
              )}
            </g>
          );
        })}
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

function BracketDiagram({ players: allPlayers, visible }) {
  const cycle = useAnimationCycle(3500, 1000, visible);
  const n = Math.min(allPlayers.length || 8, 8);
  const rounds = Math.ceil(Math.log2(n));
  const w = rounds * 110 + 40;
  const h = 220;
  const color = FORMAT_COLORS.single_elim;

  const activeRound = visible ? (cycle % rounds) : -1;

  return (
    <div className="flex items-center justify-center overflow-x-auto">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        {Array.from({ length: rounds }, (_, round) => {
          const matchesInRound = Math.pow(2, rounds - round - 1);
          const spacing = h / matchesInRound;
          const x = 20 + round * 110;
          const isFinal = round === rounds - 1;
          const delay = 200 + round * 250;
          const isActiveRound = round === activeRound;

          return Array.from({ length: matchesInRound }, (_, mi) => {
            const y = spacing / 2 + mi * spacing;
            const slotH = Math.min(spacing * 0.6, 40);
            const playerIdx = round === 0 ? mi * 2 : null;

            return (
              <g key={`r${round}-m${mi}`}>
                <rect
                  x={x} y={y - slotH / 2}
                  width="80" height={slotH}
                  rx="8" ry="8"
                  fill={isFinal ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.02)'}
                  stroke={isActiveRound ? color.accent : (isFinal ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.08)')}
                  strokeWidth={isActiveRound ? 1.5 : 1}
                  style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'scale(1)' : 'scale(0.8)',
                    transformOrigin: `${x + 40}px ${y}px`,
                    transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${delay + mi * 60}ms`,
                  }}
                />
                {/* Show player avatars in first round */}
                {round === 0 && playerIdx !== null && allPlayers[playerIdx] && (
                  <PlayerNode
                    x={x + 16} y={y - slotH / 4}
                    r={7} player={allPlayers[playerIdx]}
                    color={color.accent} delay={delay + mi * 60 + 100} visible={visible}
                  />
                )}
                {round === 0 && playerIdx !== null && allPlayers[playerIdx + 1] && (
                  <PlayerNode
                    x={x + 16} y={y + slotH / 4}
                    r={7} player={allPlayers[playerIdx + 1]}
                    color={color.accent} delay={delay + mi * 60 + 140} visible={visible}
                  />
                )}
                <line
                  x1={x + 4} y1={y} x2={x + 76} y2={y}
                  stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                  style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 100 + mi * 60}ms` }}
                />
                {mi === 0 && (
                  <text
                    x={x + 40} y={-6}
                    textAnchor="middle"
                    fill={isFinal ? 'rgba(255,215,0,0.6)' : 'rgba(255,255,255,0.25)'}
                    fontSize="8" fontFamily="Rajdhani, sans-serif" fontWeight="bold"
                    style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay}ms` }}
                  >
                    {isFinal ? 'FINAL' : round === rounds - 2 ? 'SEMIS' : `R${round + 1}`}
                  </text>
                )}
                {round < rounds - 1 && (
                  <line
                    x1={x + 80} y1={y}
                    x2={x + 110} y2={y + (mi % 2 === 0 ? spacing / 4 : -spacing / 4)}
                    stroke="rgba(255,215,0,0.1)" strokeWidth="1"
                    style={{ opacity: visible ? 1 : 0, transition: `opacity 0.3s ease ${delay + 200}ms` }}
                  />
                )}
              </g>
            );
          });
        })}
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

function PoolsDiagram({ players: allPlayers, poolCount, visible }) {
  const pools = Math.min(poolCount || 4, 6);
  const perPool = Math.min(Math.ceil(allPlayers.length / pools) || 4, 5);

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
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: perPool }, (_, i) => {
              const player = allPlayers[pi * perPool + i];
              return (
                <div key={i} className="flex items-center gap-1.5">
                  {player?.avatar ? (
                    <img src={getAvatarUrl(player.avatar)} alt="" className="h-4 w-4 rounded-full ring-1 ring-cyan-400/20" />
                  ) : (
                    <div className="h-4 w-4 rounded-full bg-cyan-400/15 border border-cyan-400/25 flex items-center justify-center">
                      <span className="text-[6px] font-bold text-cyan-400/70">{String(player?.name || '?').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <span className="text-[10px] text-zinc-400 font-display truncate max-w-[60px]">{player?.name || `P${pi * perPool + i + 1}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

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
        <svg className="absolute inset-0" width="100%" height="100%" viewBox="0 0 224 112">
          <circle cx="112" cy="56" r="48" fill="none" stroke={`rgba(${isHop ? '52,211,153' : '167,139,250'},0.1)`} strokeWidth="2" />
          <circle
            cx="112" cy="56" r="48" fill="none"
            stroke={`rgba(${isHop ? '52,211,153' : '167,139,250'},0.35)`}
            strokeWidth="2" strokeDasharray="301.6"
            strokeDashoffset={visible ? '75.4' : '301.6'}
            strokeLinecap="round" transform="rotate(-90 112 56)"
            style={{ transition: 'stroke-dashoffset 2s cubic-bezier(0.16,1,0.3,1) 500ms' }}
          />
        </svg>
      </div>
    </div>
  );
}

function FormatDiagram({ format, players, config, visible }) {
  if (format === 'round_robin') return <RoundRobinDiagram players={players} visible={visible} />;
  if (format === 'gauntlet') return <GauntletDiagram players={players} visible={visible} />;
  if (format === 'single_elim') return <BracketDiagram players={players} visible={visible} />;
  if (format === 'double_elim') return <BracketDiagram players={players} visible={visible} />;
  if (format === 'pools') return <PoolsDiagram players={players} poolCount={config?.pool_count} visible={visible} />;
  if (format === 'hour_of_power' || format === 'b15') return <TimedSessionDiagram format={format} visible={visible} />;
  return null;
}

// ══════════════════════════════════════════════════════════════
//  SCOUT CARD (mini version for poster)
// ══════════════════════════════════════════════════════════════

const BUCKET_META = {
  speed: { label: 'Speed', icon: '\u26A1' },
  stamina: { label: 'Stamina', icon: '\uD83D\uDD25' },
  mobility: { label: 'Mobility', icon: '\uD83C\uDF00' },
  tech: { label: 'Tech', icon: '\u2699\uFE0F' },
};

function MiniScoutCard({ player, scoutData, onClick }) {
  const flag = getCountryFlag(player.nationality);
  const attrs = scoutData?.attributes?.overall || {};
  const competitive = scoutData?.competitive || {};
  const specialties = scoutData?.specialties || [];
  const rating = scoutData?.ratings?.overall?.score100;
  const hasData = scoutData && scoutData.coverage?.hasPiuData;

  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] p-3 text-left transition-all hover:border-piu-accent/25 hover:bg-white/[0.04] hover:shadow-[0_0_24px_rgba(255,51,102,0.06)]"
    >
      {/* Foil shine on hover */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)' }}
      />

      <div className="flex items-center gap-2.5 mb-2.5">
        {player.avatar ? (
          <img src={getAvatarUrl(player.avatar)} alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-white/10 shrink-0" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-piu-accent to-purple-700 font-display text-sm font-bold text-white ring-1 ring-white/10 shrink-0">
            {String(player.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {flag && <span className="text-xs shrink-0">{flag}</span>}
            <span className="truncate font-display text-sm font-bold text-white">{player.name}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {competitive.singleLevel && (
              <span className="text-[9px] font-display font-bold text-rose-400/70">S{competitive.singleLevel}</span>
            )}
            {competitive.doubleLevel && (
              <span className="text-[9px] font-display font-bold text-emerald-400/70">D{competitive.doubleLevel}</span>
            )}
            {rating !== undefined && rating > 0 && (
              <span className="text-[9px] font-mono text-zinc-500">{Math.round(rating)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Attribute bars */}
      {hasData ? (
        <div className="space-y-1">
          {['speed', 'stamina', 'mobility', 'tech'].map(bucket => {
            const val = Math.max(0, Math.min(100, attrs[bucket] || 0));
            return (
              <div key={bucket} className="flex items-center gap-1.5">
                <span className="w-3 text-center text-[8px]">{BUCKET_META[bucket].icon}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400/60 to-blue-500/60"
                    style={{ width: `${val}%`, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }}
                  />
                </div>
                <span className="w-5 text-right font-mono text-[8px] text-zinc-500">{Math.round(val)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center justify-center py-2">
          <span className="text-[10px] text-zinc-600 italic">No scouting data</span>
        </div>
      )}

      {/* Specialties */}
      {specialties.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {specialties.slice(0, 3).map((s, i) => (
            <span key={i} className="rounded-full border border-white/6 bg-white/[0.03] px-1.5 py-0.5 text-[8px] font-display font-bold text-zinc-400">
              {s.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function ExpandedScoutCard({ player, scoutData, onClose }) {
  const flag = getCountryFlag(player.nationality);
  const competitive = scoutData?.competitive || {};
  const specialties = scoutData?.specialties || [];
  const cadence = scoutData?.cadence || {};
  const signature = scoutData?.signature || {};
  const hasData = scoutData?.coverage?.hasPiuData;

  const attrs = scoutData?.attributes?.overall || {};
  const ratings = scoutData?.ratings || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative max-w-sm w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'fadeIn 0.25s ease' }}
      >
        {/* Top accent */}
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-piu-accent/40 to-transparent" />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            {player.avatar ? (
              <img src={getAvatarUrl(player.avatar)} alt="" className="h-16 w-16 rounded-xl object-cover ring-2 ring-white/10 shrink-0" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-piu-accent to-purple-700 font-display text-2xl font-bold text-white ring-2 ring-white/10 shrink-0">
                {String(player.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {flag && <span className="text-base">{flag}</span>}
                <h3 className="font-display text-lg font-bold text-white truncate">{player.name}</h3>
              </div>
              {player.skill_title && (
                <span className="inline-flex mt-1 rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-display font-bold text-zinc-300">
                  {player.skill_title}
                </span>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                {competitive.singleLevel && (
                  <span className="text-[10px] font-display font-bold text-rose-400">S{competitive.singleLevel}</span>
                )}
                {competitive.doubleLevel && (
                  <span className="text-[10px] font-display font-bold text-emerald-400">D{competitive.doubleLevel}</span>
                )}
                {competitive.dominantLabel && (
                  <span className="text-[10px] text-zinc-500">{competitive.dominantLabel}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 rounded-lg border border-white/8 bg-white/4 p-1.5 text-zinc-400 hover:text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>

          {/* Signature */}
          {signature.summaryLabel && (
            <p className="text-xs text-zinc-400 italic mb-4 leading-relaxed">{signature.summaryLabel}</p>
          )}

          {/* Attribute bars - full size */}
          {hasData && (
            <div className="space-y-2 mb-4">
              {['speed', 'stamina', 'mobility', 'tech'].map(bucket => {
                const val = Math.max(0, Math.min(100, attrs[bucket] || 0));
                const isTop = val >= 70;
                return (
                  <div key={bucket} className="flex items-center gap-2">
                    <span className="w-4 text-center text-xs">{BUCKET_META[bucket].icon}</span>
                    <span className="w-14 text-[10px] font-display font-bold text-zinc-400">{BUCKET_META[bucket].label}</span>
                    <div className="flex-1 h-2 rounded-full bg-white/6 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isTop ? 'bg-gradient-to-r from-amber-400/70 to-amber-300/70' : 'bg-gradient-to-r from-cyan-400/50 to-blue-500/50'}`}
                        style={{ width: `${val}%`, transition: 'width 1s cubic-bezier(0.16,1,0.3,1)' }}
                      />
                    </div>
                    <span className={`w-6 text-right font-mono text-[10px] ${isTop ? 'text-amber-300' : 'text-zinc-400'}`}>{Math.round(val)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ratings row */}
          {hasData && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Overall', val: ratings.overall?.score100 },
                { label: 'Singles', val: ratings.singles?.score100 },
                { label: 'Doubles', val: ratings.doubles?.score100 },
              ].map(r => (
                <div key={r.label} className="rounded-lg border border-white/6 bg-white/[0.02] p-2 text-center">
                  <div className="text-[9px] font-display font-bold uppercase tracking-wider text-zinc-600">{r.label}</div>
                  <div className="font-mono text-sm font-bold text-white mt-0.5">{r.val > 0 ? Math.round(r.val) : '-'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Specialties */}
          {specialties.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {specialties.map((s, i) => (
                <span key={i} className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-display font-bold text-zinc-300">
                  {s.label}
                </span>
              ))}
            </div>
          )}

          {/* Cadence */}
          {cadence.label && (
            <div className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2">
              <span className="text-[10px] font-display font-bold uppercase tracking-wider text-zinc-600">Activity</span>
              <span className="text-[11px] font-display font-bold text-zinc-300">{cadence.label}</span>
              {cadence.activeDaysPerWeek > 0 && (
                <span className="text-[10px] text-zinc-500">{cadence.activeDaysPerWeek.toFixed(1)} days/wk</span>
              )}
            </div>
          )}

          {/* Pumbility */}
          {player.pumbility > 0 && (
            <div className="mt-3 text-center">
              <span className="text-[9px] font-display font-bold uppercase tracking-wider text-zinc-600">Pumbility</span>
              <div className="font-mono text-lg font-bold text-piu-gold">{Number(player.pumbility).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  PHASE SECTION
// ══════════════════════════════════════════════════════════════

function PhaseSection({ phase, index, total, players }) {
  const [ref, visible] = useReveal();
  const color = getFormatColor(phase.format);
  const rules = getPhaseRules(phase);
  const advLabel = getAdvancementLabel(phase);
  const isLast = index === total - 1;

  return (
    <div ref={ref} className="relative">
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
        <div
          className="absolute inset-x-8 top-0 h-px"
          style={{
            background: `linear-gradient(to right, transparent, ${color.accent}55, transparent)`,
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.5s ease 300ms',
          }}
        />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex-1 min-w-0">
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
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                  Phase {index + 1} of {total}
                </span>
                <h3 className={`font-display text-xl font-bold tracking-wide ${color.text}`}>
                  {phase.name || FORMAT_LABELS[phase.format]}
                </h3>
              </div>
            </div>

            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
              {FORMAT_DESCRIPTIONS[phase.format]}
            </p>

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

            {advLabel && (
              <div
                className="inline-flex items-center gap-1.5 rounded-full border border-piu-green/20 bg-piu-green/8 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-piu-green"
                style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease 600ms' }}
              >
                <span>{'\u2192'}</span>
                <span>{advLabel}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-center lg:w-72">
            <FormatDiagram
              format={phase.format}
              players={players}
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
//  HYPE BLURB GENERATOR
// ══════════════════════════════════════════════════════════════

function generateHypeBlurb(tournament, phases, playerCount) {
  const name = tournament.name || 'This tournament';
  const phaseNames = phases.map(p => FORMAT_LABELS[p.format] || p.format);

  if (phases.length === 1) {
    return `${name} brings ${playerCount} competitors together for a ${phaseNames[0].toLowerCase()} showdown. Every match matters. Every score counts. Who walks away on top?`;
  }

  const lastPhase = phaseNames[phaseNames.length - 1];
  const earlyPhases = phaseNames.slice(0, -1).map(n => n.toLowerCase()).join(', ');
  return `${name} puts ${playerCount} players through the crucible \u2014 ${earlyPhases} into ${lastPhase.toLowerCase()}. Only the strongest survive each phase. This is the proving ground.`;
}

// ── Canvas text wrapping ──
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ══════════════════════════════════════════════════════════════
//  MAIN POSTER PAGE
// ══════════════════════════════════════════════════════════════

// ── Share helpers ──
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export default function TournamentPoster() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scoutCards, setScoutCards] = useState({});
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const fileInputRef = useRef(null);

  const isAdmin = !!user?.is_admin;

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

        const withUserId = p.filter(pl => pl.user_id).slice(0, 20);
        const results = await Promise.allSettled(
          withUserId.map(pl => getPlayerScoutingCard(pl.user_id).then(data => ({ playerId: pl.id, data })))
        );
        const cards = {};
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value.data) {
            cards[r.value.playerId] = r.value.data;
          }
        });
        setScoutCards(cards);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Poster background upload ──
  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('Image must be under 8MB'); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUri = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const updated = await updateTournament(id, { poster_bg: dataUri });
      setTournament(prev => ({ ...prev, poster_bg: updated.poster_bg || dataUri }));
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveBg = async () => {
    setUploading(true);
    try {
      await updateTournament(id, { poster_bg: '' });
      setTournament(prev => ({ ...prev, poster_bg: '' }));
    } catch (err) { console.error(err); }
    finally { setUploading(false); }
  };

  // ── Share functions ──
  const permalink = typeof window !== 'undefined' ? `${window.location.origin}/tournament/${id}/poster` : '';

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(permalink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: tournament?.name || 'Tournament Poster', url: permalink }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const handleShareImage = async () => {
    if (!tournament) return;
    setSharingImage(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const W = 1080, H = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const PAD = 60;

      // ── Background ──
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, W, H);

      const bgImg = tournament.poster_bg ? await loadImage(tournament.poster_bg).catch(() => null) : null;
      if (bgImg) {
        ctx.globalAlpha = 0.35;
        drawCover(ctx, bgImg, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // Dark overlay
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(10,10,26,0.25)');
      grad.addColorStop(0.35, 'rgba(10,10,26,0.7)');
      grad.addColorStop(1, 'rgba(10,10,26,0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Accent glow
      const glow = ctx.createRadialGradient(W * 0.3, H * 0.08, 0, W * 0.3, H * 0.08, W * 0.7);
      glow.addColorStop(0, 'rgba(255,51,102,0.18)');
      glow.addColorStop(1, 'rgba(255,51,102,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      let y = 80;

      // ── Tournament avatar ──
      const avatarUrl = tournament.avatar ? getAvatarUrl(tournament.avatar) : null;
      const avatarImg = avatarUrl ? await loadImage(avatarUrl).catch(() => null) : null;
      if (avatarImg) {
        const aSize = 140, aX = (W - aSize) / 2;
        ctx.save();
        roundRect(ctx, aX, y, aSize, aSize, 32);
        ctx.clip();
        drawCover(ctx, avatarImg, aX, y, aSize, aSize);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        roundRect(ctx, aX, y, aSize, aSize, 32);
        ctx.stroke();
        y += aSize + 36;
      }

      // ── Date + location pills ──
      const dateLine = [formatTournamentDate(tournament.date), tournament.location].filter(Boolean).join('  \u00B7  ');
      if (dateLine) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '600 22px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(dateLine, W / 2, y + 18, W - PAD * 2);
        y += 44;
      }

      // ── Title ──
      const title = String(tournament.name || 'Tournament').trim();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, W / 2, y + 52, W - PAD * 2);
      y += 72;

      // ── Subtitle ──
      const imgPhases = phases.length > 0 ? phases : [{ format: 'round_robin' }];
      const subtitle = `${players.length} players  \u00B7  ${imgPhases.map(p => FORMAT_LABELS[p.format] || p.format).join(' \u2192 ')}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '600 24px Rajdhani, sans-serif';
      ctx.fillText(subtitle, W / 2, y + 20, W - PAD * 2);
      y += 52;

      // ── Hype blurb ──
      const hype = generateHypeBlurb(tournament, imgPhases, players.length);
      if (hype) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = 'italic 600 22px Rajdhani, sans-serif';
        const hypeLines = wrapText(ctx, `\u201C${hype}\u201D`, W - PAD * 2);
        for (const line of hypeLines) {
          ctx.fillText(line, W / 2, y + 24, W - PAD * 2);
          y += 28;
        }
        y += 20;
      }

      // ── Divider ──
      const divGrad = ctx.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
      divGrad.addColorStop(0, 'rgba(255,51,102,0)');
      divGrad.addColorStop(0.5, 'rgba(255,51,102,0.5)');
      divGrad.addColorStop(1, 'rgba(255,51,102,0)');
      ctx.fillStyle = divGrad;
      ctx.fillRect(PAD, y, W - PAD * 2, 1);
      y += 32;

      // ── Phase details ──
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = 'bold 14px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HOW IT WORKS', W / 2, y + 10);
      y += 30;

      for (let pi = 0; pi < imgPhases.length; pi++) {
        const phase = imgPhases[pi];
        const pCfg = phase.config || {};
        const icon = FORMAT_ICONS[phase.format] || '\uD83C\uDFC6';
        const label = phase.name || FORMAT_LABELS[phase.format] || phase.format;

        // Phase card background
        const cardH = 80;
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        roundRect(ctx, PAD, y, W - PAD * 2, cardH, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        roundRect(ctx, PAD, y, W - PAD * 2, cardH, 16);
        ctx.stroke();

        // Phase icon + name
        ctx.textAlign = 'left';
        ctx.font = '28px Rajdhani, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${icon}  ${label}`, PAD + 20, y + 34);

        // Phase number
        ctx.textAlign = 'right';
        ctx.font = 'bold 14px Rajdhani, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText(`PHASE ${pi + 1} OF ${imgPhases.length}`, W - PAD - 20, y + 30);

        // Rules summary
        const rules = [];
        if (phase.format === 'round_robin') {
          if (pCfg.cards_per_draw) rules.push(`${pCfg.cards_per_draw} cards drawn`);
          if (pCfg.vetoes_per_player) rules.push(`${pCfg.vetoes_per_player} veto`);
          if (pCfg.best_of) rules.push(`Best of ${pCfg.best_of}`);
          if (pCfg.rounds) rules.push(`${pCfg.rounds} rounds`);
        } else if (phase.format === 'gauntlet') {
          if (pCfg.start_level) rules.push(`S${pCfg.start_level}\u2013S${pCfg.final_level || '??'}`);
          if (pCfg.best_of) rules.push(`Best of ${pCfg.best_of}`);
        } else if (phase.format === 'double_elimination') {
          rules.push('Double Elimination Bracket');
        } else if (phase.format === 'pools') {
          if (pCfg.pool_count) rules.push(`${pCfg.pool_count} pools`);
        }
        if (rules.length) {
          ctx.textAlign = 'left';
          ctx.font = '600 18px Rajdhani, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fillText(rules.join('  \u00B7  '), PAD + 20, y + 62, W - PAD * 2 - 40);
        }

        y += cardH + 12;
      }
      y += 16;

      // ── Divider ──
      ctx.fillStyle = divGrad;
      ctx.fillRect(PAD, y, W - PAD * 2, 1);
      y += 32;

      // ── Player roster ──
      if (players.length > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = 'bold 14px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('COMPETITORS', W / 2, y + 10);
        y += 36;

        const avatarSize = 56;
        const gapX = 14;
        const gapY = 12;
        const nameH = 22;
        const cols = Math.min(players.length, 5);
        const cellW = avatarSize + gapX;
        const cellH = avatarSize + nameH + gapY;
        const gridW = cols * cellW - gapX;
        const startX = (W - gridW) / 2;
        const maxPlayers = Math.min(players.length, 20);

        for (let i = 0; i < maxPlayers; i++) {
          const col = i % cols, row = Math.floor(i / cols);
          const px = startX + col * cellW;
          const py = y + row * cellH;
          const player = players[i];
          const pAvatarUrl = player.avatar ? getAvatarUrl(player.avatar) : null;
          const pImg = pAvatarUrl ? await loadImage(pAvatarUrl).catch(() => null) : null;

          if (pImg) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(px + avatarSize / 2, py + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            drawCover(ctx, pImg, px, py, avatarSize, avatarSize);
            ctx.restore();
          } else {
            ctx.fillStyle = 'rgba(255,51,102,0.25)';
            ctx.beginPath();
            ctx.arc(px + avatarSize / 2, py + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px Rajdhani, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(player.name || '?').charAt(0).toUpperCase(), px + avatarSize / 2, py + avatarSize / 2 + 7);
          }

          // Player name
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = '600 14px Rajdhani, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(player.name || '').slice(0, 10), px + avatarSize / 2, py + avatarSize + 16, cellW);

          // Pumbility
          if (player.pumbility > 0) {
            ctx.fillStyle = 'rgba(255,199,92,0.6)';
            ctx.font = 'bold 12px Rajdhani, sans-serif';
            ctx.fillText(Number(player.pumbility).toLocaleString(), px + avatarSize / 2, py + avatarSize + 30, cellW);
          }
        }

        const totalRows = Math.ceil(maxPlayers / cols);
        y += totalRows * cellH + 10;

        if (players.length > maxPlayers) {
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '600 18px Rajdhani, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`+ ${players.length - maxPlayers} more players`, W / 2, y + 10);
          y += 36;
        }
      }

      // ── Footer ──
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = 'bold 16px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POWERED BY PUMP SHINSA', W / 2, H - 60);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = '600 14px Rajdhani, sans-serif';
      ctx.fillText(permalink, W / 2, H - 36, W - PAD * 2);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      const fileName = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-poster.jpg`;

      if (navigator.share && navigator.canShare?.({ files: [new File([blob], fileName, { type: 'image/jpeg' })] })) {
        await navigator.share({
          title: `${title} - Tournament Poster`,
          files: [new File([blob], fileName, { type: 'image/jpeg' })],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) {
      console.error('Share image error:', err);
    } finally {
      setSharingImage(false);
    }
  };

  const [heroRef, heroVisible] = useReveal();
  const [hypeRef, hypeVisible] = useReveal();
  const [rosterRef, rosterVisible] = useReveal();
  const [footerRef, footerVisible] = useReveal();

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

  const hypeBlurb = generateHypeBlurb(tournament, displayPhases, players.length);

  const posterBg = tournament.poster_bg ? tournament.poster_bg : '';

  return (
    <div className="min-h-screen bg-piu-bg">
      {/* ═══ HERO ═══ */}
      <div
        ref={heroRef}
        className="relative overflow-hidden border-b border-white/5"
      >
        {/* Background image layer */}
        {posterBg && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${posterBg})`, opacity: 0.22 }}
          />
        )}
        {/* Gradient overlay (always present) */}
        <div
          className="absolute inset-0"
          style={{
            background: posterBg
              ? 'linear-gradient(to bottom, rgba(10,10,26,0.4) 0%, rgba(10,10,26,0.75) 60%, rgba(10,10,26,0.98) 100%)'
              : 'radial-gradient(ellipse at 30% 20%, rgba(255,51,102,0.14), transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(255,199,92,0.08), transparent 40%), radial-gradient(ellipse at 50% 50%, rgba(68,136,255,0.06), transparent 60%)',
          }}
        />
        {!posterBg && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
              maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
            }}
          />
        )}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-piu-accent/40 to-transparent" />

        <div className="relative mx-auto max-w-4xl px-4 py-16 sm:py-24 text-center">
          {/* Top bar: back + share actions */}
          <div className="flex items-center justify-between mb-8" style={{ opacity: heroVisible ? 1 : 0, transition: 'opacity 0.4s ease' }}>
            <Link
              to={`/tournament/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/30 backdrop-blur-sm px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-piu-accent/25 hover:text-zinc-200"
            >
              <span>{'\u2190'}</span> Back
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/30 backdrop-blur-sm px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-white/15 hover:text-zinc-200"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                {copied ? 'Copied!' : 'Link'}
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/30 backdrop-blur-sm px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-white/15 hover:text-zinc-200"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                Share
              </button>
              <button
                onClick={handleShareImage}
                disabled={sharingImage}
                className="inline-flex items-center gap-1.5 rounded-full border border-piu-accent/20 bg-piu-accent/10 backdrop-blur-sm px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-rose-200 transition-colors hover:border-piu-accent/35 hover:bg-piu-accent/18 disabled:opacity-50"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {sharingImage ? 'Creating...' : 'Image'}
              </button>
            </div>
          </div>

          {tournament.avatar && (
            <div
              className="mb-6 flex justify-center"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'scale(1)' : 'scale(0.8)', transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1) 100ms' }}
            >
              <img
                src={getAvatarUrl(tournament.avatar)}
                alt={title}
                className="h-28 w-28 rounded-2xl object-cover ring-2 ring-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 mb-5" style={{ opacity: heroVisible ? 1 : 0, transition: 'opacity 0.4s ease 200ms' }}>
            {formattedDate && <span className="inline-flex items-center rounded-full border border-white/10 bg-black/30 backdrop-blur-sm px-2.5 py-1 text-[11px] text-zinc-300">{formattedDate}</span>}
            {tournament.location && <span className="inline-flex items-center rounded-full border border-white/10 bg-black/30 backdrop-blur-sm px-2.5 py-1 text-[11px] text-zinc-300">{tournament.location}</span>}
            <span className="inline-flex items-center rounded-full border border-piu-accent/20 bg-piu-accent/8 px-2.5 py-1 text-[11px] font-display font-bold text-rose-100">
              {players.length} players
            </span>
          </div>

          <h1
            className="font-display text-4xl font-bold tracking-[0.02em] text-white sm:text-5xl lg:text-6xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
            style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1) 150ms' }}
          >
            {title}
          </h1>

          <p
            className="mx-auto mt-4 max-w-xl text-base text-zinc-400"
            style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(14px)', transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1) 300ms' }}
          >
            {displayPhases.length} phase{displayPhases.length !== 1 ? 's' : ''} &middot; {players.length} players &middot;{' '}
            {displayPhases.map(p => FORMAT_LABELS[p.format] || p.format).join(' \u2192 ')}
          </p>

          {/* Phase quick-nav dots */}
          <div className="mt-8 flex items-center justify-center gap-3" style={{ opacity: heroVisible ? 1 : 0, transition: 'opacity 0.4s ease 500ms' }}>
            {displayPhases.map((phase, i) => {
              const c = getFormatColor(phase.format);
              return (
                <div key={i} className="flex items-center gap-3">
                  {i > 0 && <div className="h-px w-6 bg-white/10" />}
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${c.border} ${c.bg} backdrop-blur-sm`} title={phase.name || FORMAT_LABELS[phase.format]}>
                    <span className="text-sm">{FORMAT_ICONS[phase.format]}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating player avatars ring */}
          {players.length > 0 && (
            <div className="mt-10 flex items-center justify-center" style={{ opacity: heroVisible ? 1 : 0, transition: 'opacity 0.5s ease 600ms' }}>
              <div className="flex -space-x-2">
                {players.slice(0, 12).map((player, i) => (
                  <div key={player.id} style={{ animationDelay: `${i * 50}ms` }}>
                    {player.avatar ? (
                      <img src={getAvatarUrl(player.avatar)} alt="" className="h-8 w-8 rounded-full ring-2 ring-zinc-950 object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-piu-accent to-purple-700 ring-2 ring-zinc-950 text-[10px] font-bold text-white">
                        {String(player.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
                {players.length > 12 && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 ring-2 ring-zinc-950 text-[9px] font-display font-bold text-zinc-400">
                    +{players.length - 12}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin: upload poster background */}
          {isAdmin && (
            <div className="mt-8 flex items-center justify-center gap-2" style={{ opacity: heroVisible ? 1 : 0, transition: 'opacity 0.4s ease 700ms' }}>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleBgUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200 disabled:opacity-50"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                {uploading ? 'Uploading...' : (posterBg ? 'Change Background' : 'Upload Background')}
              </button>
              {posterBg && (
                <button
                  onClick={handleRemoveBg}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/8 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-red-300/70 transition-colors hover:border-red-500/30 hover:text-red-200 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ HYPE BLURB ═══ */}
      <div ref={hypeRef} className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p
          className="font-display text-xl sm:text-2xl font-bold leading-relaxed tracking-wide text-zinc-200"
          style={{
            opacity: hypeVisible ? 1 : 0,
            transform: hypeVisible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {hypeBlurb}
        </p>
        <div
          className="mx-auto mt-6 h-px w-16 bg-gradient-to-r from-transparent via-piu-accent/40 to-transparent"
          style={{ opacity: hypeVisible ? 1 : 0, transition: 'opacity 0.5s ease 400ms' }}
        />
      </div>

      {/* ═══ HOW IT WORKS ═══ */}
      <div className="mx-auto max-w-4xl px-4 pb-8 text-center">
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600 mb-1">{title}</p>
        <h2 className="font-display text-lg font-bold tracking-wide text-white">How It Works</h2>
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
            players={players}
          />
        ))}
      </div>

      {/* ═══ PLAYERS / SCOUT CARDS ═══ */}
      {players.length > 0 && (
        <div ref={rosterRef} className="border-t border-white/5 bg-zinc-950/40">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <div
              className="text-center mb-10"
              style={{
                opacity: rosterVisible ? 1 : 0,
                transform: rosterVisible ? 'translateY(0)' : 'translateY(16px)',
                transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              {/* Tournament branding */}
              {tournament.avatar && (
                <div className="mb-4 flex justify-center">
                  <img src={getAvatarUrl(tournament.avatar)} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10 opacity-60" />
                </div>
              )}
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600 mb-1">{title}</p>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white mb-2">Scouting Report</h2>
              <p className="text-xs text-zinc-500">{players.length} competitors &middot; Tap a player to view their full profile</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {players.map((player, i) => (
                <div
                  key={player.id}
                  style={{
                    opacity: rosterVisible ? 1 : 0,
                    transform: rosterVisible ? 'translateY(0)' : 'translateY(20px)',
                    transition: `all 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(i * 40, 800)}ms`,
                  }}
                >
                  <MiniScoutCard
                    player={player}
                    scoutData={scoutCards[player.id]}
                    onClick={() => setExpandedPlayer(player)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <div ref={footerRef} className="border-t border-white/5">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <div style={{ opacity: footerVisible ? 1 : 0, transition: 'opacity 0.5s ease 100ms' }}>
            {tournament.avatar && (
              <div className="mb-4 flex justify-center">
                <img src={getAvatarUrl(tournament.avatar)} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/10 opacity-50" />
              </div>
            )}
            <p className="font-display text-lg font-bold tracking-wider text-white mb-1">{title}</p>
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-4">
              Powered by <span className="text-piu-accent">Pump Shinsa</span>
            </p>
            <div className="mt-4">
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

      {/* ═══ EXPANDED SCOUT CARD MODAL ═══ */}
      {expandedPlayer && (
        <ExpandedScoutCard
          player={expandedPlayer}
          scoutData={scoutCards[expandedPlayer.id]}
          onClose={() => setExpandedPlayer(null)}
        />
      )}
    </div>
  );
}

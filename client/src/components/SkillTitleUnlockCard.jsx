import React, { useState } from 'react';
import {
  buildSkillTitleProgressTriplet,
  formatSkillTitleLabel,
  getSkillTitlePassMetrics,
} from '../utils/skillTitles';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

const TIER_STYLES = {
  bronze: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-amber-300/30 bg-amber-500/10 text-amber-200',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-amber-100',
    line: '#f59e0b',
    glow: 'rgba(251, 191, 36, 0.3)',
    current: 'border-amber-50 bg-amber-200 shadow-[0_0_26px_rgba(251,191,36,0.46)]',
    past: 'border-amber-200/70 bg-amber-400/75',
    future: 'border-amber-300/25 bg-[#12192c]',
    detail: 'border-piu-border/55 bg-piu-dark/20',
    detailActive: 'border-amber-200/45 bg-amber-500/[0.08] shadow-[0_14px_24px_rgba(12,15,28,0.28),0_0_0_1px_rgba(251,191,36,0.08)]',
  },
  silver: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-slate-200/30 bg-slate-200/10 text-slate-100',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-slate-100',
    line: '#d6dfec',
    glow: 'rgba(226, 232, 240, 0.28)',
    current: 'border-white bg-slate-100 shadow-[0_0_28px_rgba(226,232,240,0.44)]',
    past: 'border-slate-200/70 bg-slate-300/75',
    future: 'border-slate-300/25 bg-[#12192c]',
    detail: 'border-piu-border/55 bg-piu-dark/20',
    detailActive: 'border-slate-200/40 bg-white/[0.06] shadow-[0_14px_24px_rgba(12,15,28,0.28),0_0_0_1px_rgba(255,255,255,0.05)]',
  },
  gold: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-yellow-300/30 bg-yellow-500/10 text-yellow-200',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-yellow-100',
    line: '#facc15',
    glow: 'rgba(250, 204, 21, 0.28)',
    current: 'border-yellow-100 bg-yellow-300 shadow-[0_0_28px_rgba(250,204,21,0.42)]',
    past: 'border-yellow-200/70 bg-yellow-400/78',
    future: 'border-yellow-300/25 bg-[#12192c]',
    detail: 'border-piu-border/55 bg-piu-dark/20',
    detailActive: 'border-yellow-200/45 bg-yellow-500/[0.08] shadow-[0_14px_24px_rgba(12,15,28,0.28),0_0_0_1px_rgba(250,204,21,0.08)]',
  },
  blue: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-sky-300/30 bg-sky-500/10 text-sky-200',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-sky-100',
    line: '#60a5fa',
    glow: 'rgba(96, 165, 250, 0.28)',
    current: 'border-sky-100 bg-sky-300 shadow-[0_0_28px_rgba(96,165,250,0.42)]',
    past: 'border-sky-200/70 bg-sky-400/78',
    future: 'border-sky-300/25 bg-[#12192c]',
    detail: 'border-piu-border/55 bg-piu-dark/20',
    detailActive: 'border-sky-200/45 bg-sky-500/[0.08] shadow-[0_14px_24px_rgba(12,15,28,0.28),0_0_0_1px_rgba(96,165,250,0.08)]',
  },
  default: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-piu-border/60 bg-piu-dark/55 text-slate-100',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-slate-100',
    line: '#94a3b8',
    glow: 'rgba(148, 163, 184, 0.22)',
    current: 'border-white bg-slate-100 shadow-[0_0_24px_rgba(226,232,240,0.34)]',
    past: 'border-slate-200/70 bg-slate-300/70',
    future: 'border-slate-300/20 bg-[#12192c]',
    detail: 'border-piu-border/55 bg-piu-dark/20',
    detailActive: 'border-slate-200/35 bg-white/[0.05] shadow-[0_14px_24px_rgba(12,15,28,0.28),0_0_0_1px_rgba(255,255,255,0.04)]',
  },
};

function formatPoints(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getTrackCopy(node) {
  if (!node || !node.level) return 'Starting checkpoint';
  return `Lv.${node.level} track`;
}

function getPassCopy(metrics) {
  if (!metrics.passes_required) return 'No AA pass requirement';
  return `${metrics.passes_have} / ${metrics.passes_required} AA passes`;
}

function getCompactNodeLabel(node) {
  const label = formatSkillTitleLabel(node);
  return label
    .replace(/^Intermediate\b/i, 'Int.')
    .replace(/^Advanced\b/i, 'Adv.')
    .replace(/^Expert\b/i, 'Exp.')
    .replace(/^Beginner\b/i, 'Beg.');
}

function getNodeMeta(kind, node) {
  const label = kind === 'previous' ? 'Previous' : kind === 'current' ? 'Earned' : 'Next';
  if (!node) {
    return {
      label,
      title: kind === 'next' ? 'Final checkpoint' : 'Unknown',
      track: kind === 'next' ? 'No further title requirement' : 'No checkpoint data',
      pointsCopy: '',
      passCopy: 'No AA pass requirement',
      metrics: getSkillTitlePassMetrics(null),
    };
  }

  const title = formatSkillTitleLabel(node);
  const metrics = getSkillTitlePassMetrics(node);
  const earnedPoints = parseInt(node.earned_points, 10) || 0;
  const requiredPoints = parseInt(node.required_points, 10) || 0;

  let pointsCopy = '';
  if (kind === 'previous') {
    pointsCopy = requiredPoints > 0 ? `${formatPoints(requiredPoints)} pts requirement` : 'Starting checkpoint';
  } else if (requiredPoints > 0) {
    pointsCopy = `${formatPoints(earnedPoints)} / ${formatPoints(requiredPoints)} pts`;
  } else {
    pointsCopy = 'Final skill title reached';
  }

  return {
    label,
    title,
    track: getTrackCopy(node),
    pointsCopy,
    passCopy: getPassCopy(metrics),
    metrics,
  };
}

function getNodePosition(kind) {
  if (kind === 'previous') {
    return {
      left: '14%',
      top: '74%',
      transform: 'translate(-6%, -50%)',
      align: 'items-start text-left',
    };
  }
  if (kind === 'next') {
    return {
      left: '85%',
      top: '24%',
      transform: 'translate(-100%, -50%)',
      align: 'items-end text-right',
    };
  }
  return {
      left: '50%',
    top: '48%',
    transform: 'translate(-50%, -50%)',
    align: 'items-center text-center',
  };
}

export default function SkillTitleUnlockCard({ clear, className = '' }) {
  const { previous, current, next } = buildSkillTitleProgressTriplet(clear);
  const tierKey = String(clear?.title_tier || current?.tier || '').trim().toLowerCase();
  const theme = TIER_STYLES[tierKey] || TIER_STYLES.default;
  const currentLabel = formatSkillTitleLabel(current) || clear?.title_name || clear?.song_title || 'Skill Title';
  const familyLabel = current?.skill_family
    ? `${current.skill_family}${current?.skill_level ? ` Lv.${current.skill_level}` : ''}`
    : currentLabel;
  const earnedPoints = parseInt(clear?.title_earned_points, 10) || current?.earned_points || current?.required_points || 0;
  const requiredPoints = parseInt(clear?.title_required_points, 10) || current?.required_points || 0;
  const earnedCopy = requiredPoints > 0
    ? `${formatPoints(earnedPoints)} / ${formatPoints(requiredPoints)} pts banked on ${getTrackCopy(current)}.`
    : 'Starting checkpoint reached.';
  const nodes = [
    { kind: 'previous', node: previous, ...getNodePosition('previous') },
    { kind: 'current', node: current, ...getNodePosition('current') },
    { kind: 'next', node: next, ...getNodePosition('next') },
  ];
  const [activeKind, setActiveKind] = useState('current');
  const activeNode = nodes.find((entry) => entry.kind === activeKind) || nodes[1];
  const activeMeta = getNodeMeta(activeNode.kind, activeNode.node);

  return (
    <div
      className={cx(
        'rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_34px_rgba(0,0,0,0.24)]',
        theme.shell,
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <span className={cx('inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.16em]', theme.label)}>
            Skill Title
          </span>
          <p className="mt-2 text-[clamp(1.22rem,4.8vw,1.58rem)] font-display font-black leading-[1.05] text-white">
            {currentLabel}
          </p>
          <p className="mt-2 text-[11px] font-display font-bold uppercase tracking-[0.16em] text-gray-500">
            {getTrackCopy(current)}
          </p>
          <p className="mt-1 max-w-[34rem] text-[13px] leading-relaxed text-gray-300">
            {earnedCopy}
          </p>
        </div>
        <span className={cx('shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] max-[380px]:w-full max-[380px]:text-center', theme.chip)}>
          {familyLabel}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div
          className="skill-title-saga-stage relative min-h-[9.75rem] overflow-hidden rounded-[1.2rem] border border-piu-border/60 px-3 pb-5 pt-5 sm:min-h-[12.5rem] sm:px-6 sm:pb-6 sm:pt-7"
          style={{
            '--skill-route-color': theme.line,
            '--skill-route-glow': theme.glow,
          }}
        >
          <svg viewBox="0 0 100 44" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <path
              d="M 17 31 C 24 26, 30 24, 39 22"
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray="3.6 4.1"
            />
            <path
              d="M 61 22 C 68 20, 75 18, 81 14"
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray="3.6 4.1"
            />
            <path
              className="skill-title-saga__route"
              d="M 17 31 C 24 26, 30 24, 39 22"
              fill="none"
              stroke="var(--skill-route-color)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeDasharray="3.6 4.1"
            />
            <path
              className="skill-title-saga__route"
              d="M 61 22 C 68 20, 75 18, 81 14"
              fill="none"
              stroke="var(--skill-route-color)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeDasharray="3.6 4.1"
            />
          </svg>

          {nodes.map(({ kind, node, left, top, transform, align }) => {
            const isSelected = kind === activeKind;
            const dotClass = isSelected
              ? theme.current
              : (kind === 'next' ? theme.future : theme.past);
            const mapLabel = getCompactNodeLabel(node);

            return (
              <button
                key={`${kind}-${node?.id || node?.name || 'node'}`}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={cx(
                  'absolute flex min-w-[3.2rem] flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1020] sm:min-w-[4rem]',
                  align
                )}
                style={{ left, top, transform }}
                aria-pressed={isSelected}
                aria-label={`${mapLabel} node`}
              >
                <span
                  className={cx(
                    'skill-title-saga__orb block h-7 w-7 rounded-full border-[3px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-10 sm:w-10',
                    dotClass,
                    isSelected && 'is-active scale-[1.08]'
                  )}
                />
                <span className={cx('mt-1.5 block text-[8px] font-display font-bold uppercase tracking-[0.08em] transition-colors duration-300 sm:mt-2 sm:text-[10px] sm:tracking-[0.14em]', isSelected ? 'text-white' : 'text-white/72')}>
                  {mapLabel}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 md:hidden">
          {nodes.map(({ kind, node }) => {
            const meta = getNodeMeta(kind, node);
            const isActive = kind === activeKind;
            return (
              <button
                key={`${kind}-detail-${node?.id || node?.name || 'node'}`}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={cx(
                  'skill-title-checkpoint rounded-[0.95rem] border px-2.5 py-2.5 text-left',
                  theme.detail,
                  isActive ? theme.detailActive : 'hover:border-white/18 hover:bg-white/[0.03]'
                )}
                aria-pressed={isActive}
              >
                <p className="text-[8px] font-display font-bold uppercase tracking-[0.16em] text-gray-500">
                  {meta.label}
                </p>
                <p className="mt-1.5 text-[12px] font-display font-bold leading-tight text-white">
                  {meta.title}
                </p>
                <p className="mt-2 text-[9px] font-display font-bold uppercase tracking-[0.12em] text-white/88">
                  {meta.passCopy}
                </p>
              </button>
            );
          })}
        </div>

        <div className="border-t border-piu-border/45 pt-3 md:hidden">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">
                {activeMeta.label}
              </p>
              <p className="mt-1.5 text-[15px] font-display font-bold leading-tight text-white">
                {activeMeta.title}
              </p>
            </div>
            <p className="text-right text-[9px] font-display font-bold uppercase tracking-[0.14em] text-white/88">
              {activeMeta.passCopy}
            </p>
          </div>
          <p className="mt-2 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-gray-400">
            {activeMeta.track}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-gray-300">
            {activeMeta.pointsCopy}
          </p>
        </div>

        <div className="hidden gap-2.5 md:grid md:grid-cols-3">
          {nodes.map(({ kind, node }) => {
            const meta = getNodeMeta(kind, node);
            const isActive = kind === activeKind;
            return (
              <button
                key={`${kind}-desktop-detail-${node?.id || node?.name || 'node'}`}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={cx(
                  'skill-title-checkpoint rounded-[1.08rem] border px-3.5 py-3.5 text-left',
                  theme.detail,
                  isActive ? theme.detailActive : 'hover:border-white/18 hover:bg-white/[0.03]'
                )}
                aria-pressed={isActive}
              >
                <p className="text-[9px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">
                  {meta.label}
                </p>
                <p className="mt-2 text-[15px] font-display font-bold leading-tight text-white">
                  {meta.title}
                </p>
                <p className="mt-1 text-[11px] font-display font-bold uppercase tracking-[0.12em] text-gray-400">
                  {meta.track}
                </p>
                <p className="mt-2 text-[12px] leading-snug text-gray-300">
                  {meta.pointsCopy}
                </p>
                <p className="mt-3 text-[10px] font-display font-bold uppercase tracking-[0.16em] text-white/92">
                  {meta.passCopy}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

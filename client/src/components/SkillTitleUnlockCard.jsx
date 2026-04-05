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
    current: 'border-amber-100 bg-amber-300 shadow-[0_0_22px_rgba(251,191,36,0.48)]',
    past: 'border-amber-300/70 bg-amber-500/65',
    future: 'border-piu-border bg-[#0e1320]',
    detail: 'border-piu-border/50 bg-piu-dark/35',
    detailActive: 'border-amber-300/40 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]',
  },
  silver: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-slate-200/30 bg-slate-200/10 text-slate-100',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-slate-100',
    line: '#cbd5e1',
    current: 'border-white bg-slate-100 shadow-[0_0_22px_rgba(226,232,240,0.42)]',
    past: 'border-slate-300/75 bg-slate-300/65',
    future: 'border-piu-border bg-[#0e1320]',
    detail: 'border-piu-border/50 bg-piu-dark/35',
    detailActive: 'border-slate-200/40 bg-slate-200/10 shadow-[0_0_0_1px_rgba(226,232,240,0.08)]',
  },
  gold: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-yellow-300/30 bg-yellow-500/10 text-yellow-200',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-yellow-100',
    line: '#facc15',
    current: 'border-yellow-100 bg-yellow-300 shadow-[0_0_22px_rgba(250,204,21,0.45)]',
    past: 'border-yellow-300/70 bg-yellow-400/68',
    future: 'border-piu-border bg-[#0e1320]',
    detail: 'border-piu-border/50 bg-piu-dark/35',
    detailActive: 'border-yellow-300/40 bg-yellow-500/10 shadow-[0_0_0_1px_rgba(250,204,21,0.08)]',
  },
  blue: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-sky-300/30 bg-sky-500/10 text-sky-200',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-sky-100',
    line: '#60a5fa',
    current: 'border-sky-100 bg-sky-300 shadow-[0_0_22px_rgba(96,165,250,0.44)]',
    past: 'border-sky-300/70 bg-sky-400/65',
    future: 'border-piu-border bg-[#0e1320]',
    detail: 'border-piu-border/50 bg-piu-dark/35',
    detailActive: 'border-sky-300/40 bg-sky-500/10 shadow-[0_0_0_1px_rgba(96,165,250,0.08)]',
  },
  default: {
    shell: 'border-piu-border bg-piu-card',
    label: 'border-piu-border/60 bg-piu-dark/55 text-slate-100',
    chip: 'border-piu-border/60 bg-piu-dark/55 text-slate-100',
    line: '#94a3b8',
    current: 'border-white bg-slate-100 shadow-[0_0_18px_rgba(226,232,240,0.32)]',
    past: 'border-slate-300/70 bg-slate-400/60',
    future: 'border-piu-border bg-[#0e1320]',
    detail: 'border-piu-border/50 bg-piu-dark/35',
    detailActive: 'border-slate-200/30 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]',
  },
};

function formatPoints(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getTrackCopy(node) {
  if (!node || !node.level) return 'Starting point';
  return `Lv.${node.level} track`;
}

function getPassCopy(metrics) {
  if (!metrics.passes_required) return 'No AA pass requirement';
  return `${metrics.passes_have} / ${metrics.passes_required} AA passes`;
}

function getNodeMeta(kind, node) {
  const label = kind === 'previous' ? 'Previous' : kind === 'current' ? 'Earned' : 'Next';
  if (!node) {
    return {
      label,
      title: kind === 'next' ? 'Final checkpoint' : 'Unknown',
      body: kind === 'next' ? 'No further unlock requirement.' : 'No checkpoint data.',
      metrics: getSkillTitlePassMetrics(null),
    };
  }

  const title = formatSkillTitleLabel(node);
  const metrics = getSkillTitlePassMetrics(node);
  if (kind === 'previous') {
    return {
      label,
      title,
      body: node.required_points > 0
        ? `${getTrackCopy(node)} • ${formatPoints(node.required_points)} pts`
        : 'Starting checkpoint',
      metrics,
    };
  }
  if (kind === 'current') {
    return {
      label,
      title,
      body: node.required_points > 0
        ? `${getTrackCopy(node)} • ${formatPoints(node.earned_points || node.required_points)} / ${formatPoints(node.required_points)} pts`
        : 'Starting checkpoint',
      metrics,
    };
  }
  return {
    label,
    title,
    body: node.required_points > 0
      ? `${getTrackCopy(node)} • Needs ${formatPoints(node.required_points)} pts`
      : 'Final skill title reached',
    metrics,
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
    { kind: 'previous', node: previous, left: '14%', top: '72%' },
    { kind: 'current', node: current, left: '50%', top: '45%' },
    { kind: 'next', node: next, left: '84%', top: '18%' },
  ];
  const [activeKind, setActiveKind] = useState('current');

  return (
    <div className={cx('rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_34px_rgba(0,0,0,0.24)]', theme.shell, className)}>
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <span className={cx('inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.16em]', theme.label)}>
            Skill Title
          </span>
          <p className="mt-2 text-[clamp(1.22rem,4.8vw,1.58rem)] font-display font-black leading-[1.05] text-white">{currentLabel}</p>
          <p className="mt-2 text-[11px] font-display font-bold uppercase tracking-[0.16em] text-gray-500">
            {current?.level ? `Lv.${current.level} track` : 'Starting checkpoint'}
          </p>
          <p className="mt-1 max-w-[34rem] text-[13px] leading-relaxed text-gray-300">{earnedCopy}</p>
        </div>
        <span className={cx('shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', theme.chip)}>
          {familyLabel}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-piu-border/50 bg-piu-dark/30 p-3">
        <div className="relative min-h-[10.75rem] overflow-hidden rounded-xl border border-piu-border/40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_56%),linear-gradient(180deg,rgba(18,24,39,0.9),rgba(7,12,24,0.98))] px-5 pb-6 pt-7 sm:min-h-[11.5rem]">
          <svg viewBox="0 0 100 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <path
              d="M 10 29 C 24 22, 34 18, 50 18 S 72 14, 90 8"
              fill="none"
              stroke={theme.line}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray="3.25 3.25"
              opacity="0.92"
            />
          </svg>
          {nodes.map(({ kind, node, left, top }) => {
            const isSelected = kind === activeKind;
            const dotClass = isSelected
              ? theme.current
              : (kind === 'previous' ? theme.past : (kind === 'current' ? theme.past : theme.future));
            const transform = kind === 'previous'
              ? 'translate(-10%, -50%)'
              : kind === 'next'
                ? 'translate(-90%, -50%)'
                : 'translate(-50%, -50%)';
            return (
              <div
                key={`${kind}-${node?.id || node?.name || 'node'}`}
                className={cx(
                  'absolute flex flex-col',
                  kind === 'previous' ? 'items-start text-left' : kind === 'next' ? 'items-end text-right' : 'items-center text-center'
                )}
                style={{ left, top, transform }}
              >
                <span className={cx('block h-7 w-7 rounded-full border-[3px] transition-all', dotClass, isSelected && 'scale-[1.12]')} />
                <span className={cx('mt-2 block text-[10px] font-display font-bold uppercase tracking-[0.2em]', isSelected ? 'text-white' : 'text-white/72')}>
                  {kind === 'previous' ? 'Prev' : kind === 'current' ? 'Earned' : 'Next'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {nodes.map(({ kind, node }) => {
            const meta = getNodeMeta(kind, node);
            const isActive = kind === activeKind;
            return (
              <button
                key={`${kind}-detail-${node?.id || node?.name || 'node'}`}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={cx(
                  'rounded-lg border px-3 py-3 text-left transition-all',
                  theme.detail,
                  isActive ? theme.detailActive : 'hover:border-white/25 hover:bg-piu-dark/55'
                )}
                aria-pressed={isActive}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[9px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">{meta.label}</p>
                  <p className="text-[9px] font-display font-bold uppercase tracking-[0.14em] text-gray-300">
                    {getPassCopy(meta.metrics)}
                  </p>
                </div>
                <p className="mt-2 text-[13px] font-display font-bold leading-tight text-white">{meta.title}</p>
                <p className="mt-1 text-[11px] leading-snug text-gray-400">{meta.body}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

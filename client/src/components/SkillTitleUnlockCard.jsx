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
    shell: 'border-amber-400/35 bg-gradient-to-br from-[#1f1820] via-[#191726] to-[#0d1320]',
    label: 'border-amber-300/55 bg-amber-500/12 text-amber-200',
    chip: 'border-amber-300/45 bg-amber-500/12 text-amber-100',
    line: '#f59e0b',
    current: 'border-amber-200 bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.45)]',
    past: 'border-amber-300/70 bg-amber-500/60',
    future: 'border-amber-300/35 bg-slate-900/95',
    detail: 'border-amber-400/18 bg-amber-500/6',
  },
  silver: {
    shell: 'border-slate-300/30 bg-gradient-to-br from-[#1a1b28] via-[#171c2b] to-[#0d1320]',
    label: 'border-slate-200/55 bg-slate-200/10 text-slate-100',
    chip: 'border-slate-200/45 bg-slate-200/10 text-slate-100',
    line: '#cbd5e1',
    current: 'border-white bg-slate-100 shadow-[0_0_18px_rgba(226,232,240,0.4)]',
    past: 'border-slate-300/75 bg-slate-300/60',
    future: 'border-slate-400/30 bg-slate-900/95',
    detail: 'border-slate-300/18 bg-slate-200/6',
  },
  gold: {
    shell: 'border-yellow-300/35 bg-gradient-to-br from-[#201717] via-[#201a16] to-[#0d1320]',
    label: 'border-yellow-300/55 bg-yellow-500/12 text-yellow-200',
    chip: 'border-yellow-300/45 bg-yellow-500/12 text-yellow-100',
    line: '#facc15',
    current: 'border-yellow-100 bg-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.42)]',
    past: 'border-yellow-300/70 bg-yellow-400/65',
    future: 'border-yellow-300/30 bg-slate-900/95',
    detail: 'border-yellow-300/18 bg-yellow-500/6',
  },
  blue: {
    shell: 'border-sky-300/35 bg-gradient-to-br from-[#131a2b] via-[#14192d] to-[#09111f]',
    label: 'border-sky-300/55 bg-sky-500/12 text-sky-200',
    chip: 'border-sky-300/45 bg-sky-500/12 text-sky-100',
    line: '#60a5fa',
    current: 'border-sky-100 bg-sky-300 shadow-[0_0_18px_rgba(96,165,250,0.42)]',
    past: 'border-sky-300/70 bg-sky-400/60',
    future: 'border-sky-300/30 bg-slate-900/95',
    detail: 'border-sky-300/18 bg-sky-500/6',
  },
  default: {
    shell: 'border-piu-border/50 bg-gradient-to-br from-[#141a28] via-[#151826] to-[#0b1220]',
    label: 'border-slate-300/45 bg-slate-300/10 text-slate-100',
    chip: 'border-slate-300/40 bg-slate-300/10 text-slate-100',
    line: '#94a3b8',
    current: 'border-white bg-slate-100 shadow-[0_0_18px_rgba(226,232,240,0.32)]',
    past: 'border-slate-300/70 bg-slate-400/60',
    future: 'border-slate-300/30 bg-slate-900/95',
    detail: 'border-slate-300/16 bg-slate-200/6',
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

function getBankedCopy(metrics) {
  if (!metrics.passes_required) return '';
  return `Banked ${metrics.passes_have} of ${metrics.passes_required} min.`;
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
      ? `Needs ${formatPoints(node.required_points)} pts on ${getTrackCopy(node)}`
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
    ? `Earned on ${getTrackCopy(current)} with ${formatPoints(earnedPoints)} / ${formatPoints(requiredPoints)} pts.`
    : 'Starting checkpoint reached.';
  const nodes = [
    { kind: 'previous', node: previous, left: '14%', top: '70%' },
    { kind: 'current', node: current, left: '50%', top: '42%' },
    { kind: 'next', node: next, left: '84%', top: '20%' },
  ];
  const [activeKind, setActiveKind] = useState('current');

  return (
    <div className={cx('rounded-2xl border p-3 shadow-[0_14px_34px_rgba(0,0,0,0.28)]', theme.shell, className)}>
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <span className={cx('inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.16em]', theme.label)}>
            Skill Title
          </span>
          <p className="mt-2 text-[clamp(1.45rem,5vw,1.9rem)] font-display font-black leading-none text-white">{currentLabel}</p>
          <p className="mt-2 max-w-[28rem] text-[13px] leading-relaxed text-gray-300">{earnedCopy}</p>
        </div>
        <span className={cx('shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em]', theme.chip)}>
          {familyLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.95fr)] lg:items-start">
        <div className="relative min-h-[9rem] overflow-visible rounded-[1.4rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_56%),linear-gradient(180deg,rgba(15,23,42,0.78),rgba(3,7,20,0.95))] px-4 pb-5 pt-6">
          <svg viewBox="0 0 100 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <path
              d="M 10 29 C 24 22, 34 18, 50 18 S 72 14, 90 8"
              fill="none"
              stroke={theme.line}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeDasharray="2.5 2.5"
              opacity="0.92"
            />
          </svg>
          {nodes.map(({ kind, node, left, top }) => {
            const isSelected = kind === activeKind;
            const dotClass = isSelected
              ? theme.current
              : (kind === 'previous' ? theme.past : (kind === 'current' ? theme.past : theme.future));
            const transform = kind === 'previous'
              ? 'translate(-22%, -50%)'
              : kind === 'next'
                ? 'translate(-78%, -50%)'
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
                <span className={cx('block h-4.5 w-4.5 rounded-full border-2 transition-all', dotClass, isSelected && 'scale-125')} />
                <span className={cx('mt-1 block text-[10px] font-display font-bold uppercase tracking-[0.16em]', isSelected ? 'text-white' : 'text-white/72')}>
                  {kind === 'previous' ? 'Prev' : kind === 'current' ? 'Earned' : 'Next'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {nodes.map(({ kind, node }) => {
            const meta = getNodeMeta(kind, node);
            const isActive = kind === activeKind;
            return (
              <button
                key={`${kind}-detail-${node?.id || node?.name || 'node'}`}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={cx(
                  'rounded-[1.15rem] border px-3 py-3 text-left transition-all',
                  theme.detail,
                  kind === 'next' && 'col-span-2 sm:col-span-1',
                  isActive ? 'border-white/55 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]' : 'hover:border-white/30 hover:bg-white/[0.04]'
                )}
                aria-pressed={isActive}
              >
                <p className="text-[9px] font-display font-bold uppercase tracking-[0.16em] text-white/60">{meta.label}</p>
                <p className="mt-1 text-[13px] font-display font-bold leading-tight text-white">{meta.title}</p>
                <p className="mt-1 text-[11px] leading-snug text-gray-400">{meta.body}</p>
                <p className="mt-3 text-[10px] font-display font-bold uppercase tracking-[0.12em] text-white/80">
                  {getPassCopy(meta.metrics)}
                </p>
                {meta.metrics.passes_required > 0 ? (
                  <p className="mt-1 text-[10px] leading-snug text-gray-500">
                    {getBankedCopy(meta.metrics)}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import React from 'react';

export function hasWeeklyChallengePgBonus(entry) {
  if (!entry) return false;
  return Boolean(entry.has_pg_bonus || entry.hasPgBonus)
    || (parseInt(entry.pg_bonus_points ?? entry.pgBonusPoints, 10) || 0) > 0
    || (parseInt(entry.pg_bonus_count ?? entry.pgBonusCount, 10) || 0) > 0;
}

export default function WeeklyChallengeBonusChip({ entry, count, compact = false, className = '' }) {
  const bonusCount = parseInt(count ?? entry?.pg_bonus_count ?? entry?.pgBonusCount, 10) || 0;
  if (!hasWeeklyChallengePgBonus(entry) && bonusCount <= 0) return null;

  const title = bonusCount > 1
    ? `${bonusCount} PG SSS+ bonuses included`
    : 'PG SSS+ bonus included';

  const baseClass = compact
    ? 'gap-0.5 rounded border-sky-300/20 bg-sky-300/[0.07] px-1 py-[2px] text-[8px] tracking-[0.04em] text-sky-200/95'
    : 'gap-1 rounded-md border-sky-300/25 bg-sky-300/[0.08] px-1.5 py-0.5 text-[9px] tracking-[0.08em] text-sky-200';

  return (
    <span
      className={`inline-flex shrink-0 items-center border align-middle font-display font-black uppercase leading-none ${baseClass} ${className}`}
      title={title}
      aria-label={title}
    >
      {compact ? '+10%' : 'PG +10%'}
      {bonusCount > 1 && <span className="text-sky-100/55">x{bonusCount}</span>}
    </span>
  );
}

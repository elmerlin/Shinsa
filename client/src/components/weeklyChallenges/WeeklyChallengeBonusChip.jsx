import React from 'react';

export function hasWeeklyChallengePgBonus(entry) {
  if (!entry) return false;
  return Boolean(entry.has_pg_bonus || entry.hasPgBonus)
    || (parseInt(entry.pg_bonus_points ?? entry.pgBonusPoints, 10) || 0) > 0
    || (parseInt(entry.pg_bonus_count ?? entry.pgBonusCount, 10) || 0) > 0;
}

export default function WeeklyChallengeBonusChip({ entry, count, className = '' }) {
  const bonusCount = parseInt(count ?? entry?.pg_bonus_count ?? entry?.pgBonusCount, 10) || 0;
  if (!hasWeeklyChallengePgBonus(entry) && bonusCount <= 0) return null;

  const title = bonusCount > 1
    ? `${bonusCount} PG SSS+ bonuses included`
    : 'PG SSS+ bonus included';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-300/25 bg-sky-300/[0.08] px-1.5 py-0.5 align-middle text-[9px] font-display font-black uppercase leading-none tracking-[0.08em] text-sky-200 ${className}`}
      title={title}
      aria-label={title}
    >
      PG +10%
      {bonusCount > 1 && <span className="text-sky-100/55">x{bonusCount}</span>}
    </span>
  );
}

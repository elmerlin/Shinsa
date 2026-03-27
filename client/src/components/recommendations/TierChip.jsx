const TIER_COLORS = {
  VeryEasy: 'bg-green-500/20 text-green-300 border-green-500/40',
  Easy: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  Medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  Hard: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  VeryHard: 'bg-red-500/20 text-red-300 border-red-500/40',
  Overrated: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  Underrated: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Unrated: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
};

const TIER_LABELS = {
  VeryEasy: 'Very Easy',
  Easy: 'Easy',
  Medium: 'Medium',
  Hard: 'Hard',
  VeryHard: 'Very Hard',
  Overrated: 'Overrated',
  Underrated: 'Underrated',
  Unrated: 'Unrated',
};

export default function TierChip({ tierName }) {
  const colors = TIER_COLORS[tierName] || TIER_COLORS.Unrated;
  const label = TIER_LABELS[tierName] || tierName || 'Unrated';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-display font-bold border leading-none ${colors}`}>
      {label}
    </span>
  );
}

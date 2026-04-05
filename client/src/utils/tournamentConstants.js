// Skill colors used in MatchView.jsx, Standings.jsx, PlayerRegistration.jsx
export const SKILL_COLORS = {
  Beginner: 'text-green-400',
  Intermediate: 'text-piu-bronze',
  Advanced: 'text-piu-silver',
  Expert: 'text-piu-gold',
};

export const GENDER_SYMBOLS = { male: '\u2642', female: '\u2640' };

export function getSkillColor(title) {
  if (!title) return 'text-gray-500';
  for (const [key, val] of Object.entries(SKILL_COLORS)) {
    if (title.startsWith(key)) return val;
  }
  return 'text-gray-500';
}

export function formatScore(score) {
  if (!score && score !== 0) return '-';
  return Number(score).toLocaleString();
}

// Tournament format metadata
export const FORMAT_LABELS = {
  round_robin: 'Round Robin',
  pools: 'Pools',
  single_elim: 'Single Elimination',
  double_elim: 'Double Elimination',
  gauntlet: 'Gauntlet',
  hour_of_power: 'Hour of Power',
  b15: 'Best 15',
};

export const FORMAT_DESCRIPTIONS = {
  round_robin: 'Every player plays every other player',
  pools: 'Players divided into groups, round robin within each',
  single_elim: 'Single elimination bracket knockout',
  double_elim: 'Double elimination with losers bracket',
  gauntlet: 'King of the Hill \u2014 bottom ranks fight upward through mixed card draws',
  hour_of_power: '60 min timed session, cumulative rating points',
  b15: 'Best 15 scores in a time window, like Pumbility but compressed',
};

export const FORMAT_ICONS = {
  round_robin: '\u{1F504}',
  pools: '\u{1F3CA}',
  single_elim: '\u{1F3C6}',
  double_elim: '\u{1F94A}',
  gauntlet: '\u{2694}\uFE0F',
  hour_of_power: '\u23F1\uFE0F',
  b15: '\u{1F3AF}',
};

export const ADVANCEMENT_TYPES = {
  top_n: 'Top N advance',
  per_pool_top_n: 'Top N per pool',
  threshold: 'Points threshold',
  all: 'All players advance',
};

export const PHASE_STATUS_LABELS = {
  PENDING: 'Upcoming',
  ACTIVE: 'In Progress',
  COMPLETED: 'Complete',
};

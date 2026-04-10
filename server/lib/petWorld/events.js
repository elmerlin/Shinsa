// Seasonal event framework for Pet World
// Events are date-based recurring bonuses that add variety to gameplay.

const SEASONAL_EVENTS = [
  {
    id: 'spring_bloom',
    name: 'Spring Bloom',
    start: { month: 3, day: 20 },
    end: { month: 4, day: 20 },
    productionBonuses: { food: 0.2 },
    happinessBonus: 3,
    description: 'Spring flowers boost food production by 20%!',
  },
  {
    id: 'summer_festival',
    name: 'Summer Festival',
    start: { month: 6, day: 21 },
    end: { month: 7, day: 21 },
    productionBonuses: {},
    happinessBonus: 10,
    description: 'Village morale soars during the summer festival!',
  },
  {
    id: 'harvest_moon',
    name: 'Harvest Moon',
    start: { month: 9, day: 22 },
    end: { month: 10, day: 22 },
    productionBonuses: { food: 0.15, wood: 0.1 },
    happinessBonus: 0,
    description: 'A bountiful harvest season boosts food and wood!',
  },
  {
    id: 'winter_solstice',
    name: 'Winter Solstice',
    start: { month: 12, day: 20 },
    end: { month: 1, day: 20 },
    productionBonuses: { stone: 0.15, gold: 0.1 },
    happinessBonus: 5,
    description: 'Quiet winter industry boosts stone and gold!',
  },
];

const ENCOUNTER_TYPES = [
  { type: 'fox_raid', name: 'Fox Raid', description: 'A crafty fox has been spotted near your farms!', reward: { food: 5 }, rarity: 0.3 },
  { type: 'wolf_pack', name: 'Wolf Pack', description: 'A wolf pack is prowling near the village!', reward: { cloth: 3, food: 3 }, rarity: 0.25 },
  { type: 'bear_sighting', name: 'Bear Sighting', description: 'A bear has wandered into your territory!', reward: { food: 8, wood: 3 }, rarity: 0.2 },
  { type: 'deer_herd', name: 'Deer Herd', description: 'A herd of deer is grazing near your village!', reward: { food: 10 }, rarity: 0.15 },
  { type: 'rare_bird', name: 'Rare Bird', description: 'A rare bird with beautiful plumage has been spotted!', reward: { gold: 2, cloth: 2 }, rarity: 0.1 },
];

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / (1000 * 60 * 60 * 24));
}

function toDayOfYear(month, day) {
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let total = 0;
  for (let m = 1; m < month; m += 1) total += daysInMonth[m];
  return total + day;
}

function isEventActive(event, date) {
  const doy = dayOfYear(date);
  const startDoy = toDayOfYear(event.start.month, event.start.day);
  const endDoy = toDayOfYear(event.end.month, event.end.day);
  if (startDoy <= endDoy) {
    return doy >= startDoy && doy <= endDoy;
  }
  // wraps around year boundary (Dec 20 → Jan 20)
  return doy >= startDoy || doy <= endDoy;
}

function getActiveEvents(date = new Date()) {
  return SEASONAL_EVENTS.filter((event) => isEventActive(event, date));
}

function getSeasonalBonuses(date = new Date()) {
  const active = getActiveEvents(date);
  const bonuses = { productionBonuses: {}, happinessBonus: 0 };
  for (const event of active) {
    bonuses.happinessBonus += event.happinessBonus || 0;
    for (const [category, mult] of Object.entries(event.productionBonuses || {})) {
      bonuses.productionBonuses[category] = (bonuses.productionBonuses[category] || 0) + mult;
    }
  }
  return bonuses;
}

function pickEncounterType(seed = Math.random()) {
  let cumulative = 0;
  for (const encounter of ENCOUNTER_TYPES) {
    cumulative += encounter.rarity;
    if (seed < cumulative) return encounter;
  }
  return ENCOUNTER_TYPES[0];
}

module.exports = {
  SEASONAL_EVENTS,
  ENCOUNTER_TYPES,
  getActiveEvents,
  getSeasonalBonuses,
  isEventActive,
  pickEncounterType,
};

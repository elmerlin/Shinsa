// Seasonal event framework for Pet World
// Events are date-based recurring bonuses that add variety to gameplay.

const SEASONAL_EVENTS = [
  {
    id: 'spring_bloom',
    name: 'Spring Bloom',
    icon: '\uD83C\uDF38',
    start: { month: 3, day: 20 },
    end: { month: 4, day: 20 },
    productionBonuses: { food: 0.2 },
    happinessBonus: 3,
    description: 'Wildflowers carpet the meadows and blossoms sweeten the breeze \u2014 your farms overflow with new growth.',
    encounterBoost: ['rare_bird', 'deer_herd'],
    specialReward: { resource: 'food', multiplier: 1.25 },
  },
  {
    id: 'summer_festival',
    name: 'Summer Festival',
    icon: '\uD83C\uDF89',
    start: { month: 6, day: 21 },
    end: { month: 7, day: 21 },
    productionBonuses: {},
    happinessBonus: 10,
    description: 'Lanterns light the village square and music drifts through warm evenings \u2014 everyone is in high spirits.',
    encounterBoost: ['fox_raid', 'wolf_pack'],
    specialReward: { resource: 'cloth', multiplier: 1.5 },
  },
  {
    id: 'harvest_moon',
    name: 'Harvest Moon',
    icon: '\uD83C\uDF3E',
    start: { month: 9, day: 22 },
    end: { month: 10, day: 22 },
    productionBonuses: { food: 0.15, wood: 0.1 },
    happinessBonus: 0,
    description: 'A golden moon hangs low over brimming storehouses \u2014 the land rewards those who tended it well.',
    encounterBoost: ['deer_herd', 'bear_sighting'],
    specialReward: { resource: 'wood', multiplier: 1.3 },
  },
  {
    id: 'winter_solstice',
    name: 'Winter Solstice',
    icon: '\u2744\uFE0F',
    start: { month: 12, day: 20 },
    end: { month: 1, day: 20 },
    productionBonuses: { stone: 0.15, gold: 0.1 },
    happinessBonus: 5,
    description: 'Snow blankets the rooftops and hearths glow warm \u2014 miners uncover rare veins in the frozen earth.',
    encounterBoost: ['wolf_pack', 'bear_sighting'],
    specialReward: { resource: 'gold', multiplier: 1.4 },
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

function getEventCountdown(event, currentDate = new Date()) {
  const year = currentDate.getFullYear();
  // Build candidate end dates: this year and next year (handles year-wrap)
  const candidates = [year, year + 1].map(
    (y) => new Date(y, event.end.month - 1, event.end.day, 23, 59, 59, 999)
  );
  // Pick the nearest future-or-today end date
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const endDate = candidates.find((d) => d >= today) || candidates[candidates.length - 1];
  const diff = Math.floor((endDate - today) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function pickEncounterType(seed = Math.random()) {
  let cumulative = 0;
  for (const encounter of ENCOUNTER_TYPES) {
    cumulative += encounter.rarity;
    if (seed < cumulative) return encounter;
  }
  return ENCOUNTER_TYPES[0];
}

/**
 * Season-aware encounter picker.  Builds a weighted list where encounter types
 * listed in any active event's `encounterBoost` have their rarity multiplied
 * by `boostMultiplier` (default 1.5), then normalises and picks via `seed`.
 */
function pickSeasonalEncounterType(date = new Date(), seed = Math.random(), boostMultiplier = 1.5) {
  const active = getActiveEvents(date);
  const boosted = new Set();
  for (const evt of active) {
    for (const t of evt.encounterBoost || []) boosted.add(t);
  }
  // Build weighted list
  const weighted = ENCOUNTER_TYPES.map((e) => ({
    ...e,
    weight: boosted.has(e.type) ? e.rarity * boostMultiplier : e.rarity,
  }));
  const total = weighted.reduce((s, e) => s + e.weight, 0);
  let cumulative = 0;
  for (const entry of weighted) {
    cumulative += entry.weight / total;
    if (seed < cumulative) return entry;
  }
  return weighted[0];
}

module.exports = {
  SEASONAL_EVENTS,
  ENCOUNTER_TYPES,
  getActiveEvents,
  getSeasonalBonuses,
  getEventCountdown,
  isEventActive,
  pickEncounterType,
  pickSeasonalEncounterType,
};

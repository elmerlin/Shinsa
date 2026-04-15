/**
 * Pure utility functions for Pet World.
 *
 * Extracted so they can be imported by both UI components and unit tests.
 */

// --- Resource icons (shared by BuildMenu + BuildingInfo) ---

export const RESOURCE_ICONS = {
  food:  '\uD83C\uDF3E',
  wood:  '\uD83E\uDEB5',
  stone: '\uD83E\uDEA8',
  cloth: '\uD83E\uDDF5',
  gold:  '\uD83E\uDE99',
};

function roundRate(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// --- Timing ring helpers (hunt / encounter mini-game) ---

/**
 * Given a progress value 0..1 (position within a timing ring),
 * return a colour band name that indicates proximity to the "sweet spot".
 *
 * Layout on the 0..1 ring:
 *   0.00 - 0.40  → red   (too early / too late)
 *   0.40 - 0.65  → amber (approaching)
 *   0.65 - 0.85  → green (sweet spot)
 *   0.85 - 1.00  → amber (past the sweet spot)
 */
export function getRingColor(progress) {
  if (progress < 0.4)  return 'red';
  if (progress < 0.65) return 'amber';
  if (progress < 0.85) return 'green';
  return 'amber';
}

/**
 * Maps timing-ring progress to a bonus multiplier (0..1).
 *   0.75 - 0.85  → 1.0  (perfect centre)
 *   0.65 - 0.75  → 0.7  (nearby)
 *   0.50 - 0.65  → 0.4  (moderate)
 *   everything else → 0.1 (far miss)
 */
export function getTimingBonus(progress) {
  if (progress >= 0.75 && progress <= 0.85) return 1.0;
  if (progress >= 0.65 && progress <  0.75) return 0.7;
  if (progress >= 0.50 && progress <  0.65) return 0.4;
  return 0.1;
}

export function getLevelMultiplier(level = 1) {
  return 1 + (Math.max(1, Number(level) || 1) - 1) * 0.5;
}

export function getProductionMap(building) {
  const preview = building?.production;
  if (!preview || typeof preview !== 'object') return null;
  if (preview.production && typeof preview.production === 'object') return preview.production;
  return preview;
}

export function getScaledProductionBase(building) {
  const production = getProductionMap(building);
  if (!production) return null;
  const [resource, rawValue] = Object.entries(production)[0] || [];
  const numericValue = Number(rawValue);
  if (!resource || !Number.isFinite(numericValue)) return null;
  const nestedPreview = building?.production && typeof building.production === 'object' && building.production.production;
  const baseRate = nestedPreview
    ? numericValue
    : numericValue * getLevelMultiplier(building?.level || 1);
  return {
    resource,
    baseRate: roundRate(baseRate),
  };
}

export function normalizeUpgradeCost(rawCost) {
  if (!rawCost || typeof rawCost !== 'object') return null;
  const comboValue = Number(rawCost.comboCost ?? rawCost.combos ?? 0);
  const comboCost = Number.isFinite(comboValue) ? comboValue : 0;
  const materials = rawCost.materials && typeof rawCost.materials === 'object'
    ? Object.fromEntries(
        Object.entries(rawCost.materials)
          .map(([key, value]) => [key, Number(value) || 0])
          .filter(([, value]) => value > 0)
      )
    : {};
  return {
    comboCost,
    materials,
  };
}

// --- Building helpers (extracted from PetWorldBuildingInfo) ---

/**
 * Compute the effective production rate of a building.
 * Returns `{ resource, rate }` or `null`.
 */
export function productionRate(building) {
  const scaled = getScaledProductionBase(building);
  if (!scaled) return null;
  const workers = Math.max(0, Number(building?.workers) || 0);
  const rate = scaled.baseRate * (1 + workers * 0.5);
  return {
    resource: scaled.resource,
    rate: roundRate(rate),
  };
}

/**
 * Render a material map as a human-readable string, e.g. "10 🌾 + 5 🪨".
 */
export function formatMaterials(mats = {}) {
  return Object.entries(mats)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${RESOURCE_ICONS[k] || k}`)
    .join(' + ');
}

/**
 * Minutes remaining until a building finishes construction.
 * Returns a non-negative integer or `null`.
 */
export function buildTimeRemaining(building) {
  if (building.state !== 'building' || !building.build_finish_at) return null;
  const remaining = Math.max(0, new Date(building.build_finish_at).getTime() - Date.now());
  const mins = Math.ceil(remaining / 60000);
  return mins;
}

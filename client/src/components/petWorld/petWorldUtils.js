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

// --- Resource sprites from the Cute Fantasy icon atlases ---
// Each entry points at a 16×16 cell inside an outline sprite sheet so the
// HUD (and anywhere else that wants pixel-art resource icons) can render
// them with a single <span> + CSS background-image.
const FOOD_SHEET = '/pet-world/cute-fantasy/Icons/Outline/Food_Icons_Outline.png';
const RES_SHEET  = '/pet-world/cute-fantasy/Icons/Outline/Resources_Icons_Outline.png';

export const RESOURCE_SPRITES = {
  food:  { src: FOOD_SHEET, sheetW: 128, sheetH: 192, sx: 0,  sy: 0  }, // drumstick
  wood:  { src: RES_SHEET,  sheetW: 96,  sheetH: 96,  sx: 0,  sy: 64 }, // log (end-on)
  stone: { src: RES_SHEET,  sheetW: 96,  sheetH: 96,  sx: 0,  sy: 80 }, // gray stones
  cloth: { src: RES_SHEET,  sheetW: 96,  sheetH: 96,  sx: 32, sy: 16 }, // cream bar (bolt of fabric)
  gold:  { src: RES_SHEET,  sheetW: 96,  sheetH: 96,  sx: 80, sy: 16 }, // gold ingot
};

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

// --- Building helpers (extracted from PetWorldBuildingInfo) ---

/**
 * Compute the effective production rate of a building.
 * Returns `{ resource, rate }` or `null`.
 */
export function productionRate(building) {
  if (!building.production) return null;
  const [res, base] = Object.entries(building.production)[0] || [];
  if (!res) return null;
  const rate = base * (building.level || 1) * Math.max(building.workers || 0, 0.25);
  return { resource: res, rate: Math.round(rate * 100) / 100 };
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

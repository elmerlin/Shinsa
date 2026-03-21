/**
 * Loads pump noteskin sprite assets and provides draw helpers.
 * Assets are from hanubeki/noteskin-hanubeki (Apache 2.0).
 *
 * Sprite sheets:
 *  - Tap notes: 2x16 grid (128x128 per frame at doubleres)
 *  - Hold/roll bodies & caps: 2x1 grid (128x128 per frame)
 *  - Mine: 2x1 grid (128x128 per frame)
 *  - Receptors & glow: single 128x128 images
 *
 * Panel mapping: UpLeft base asset is rotated for DL(270°), UR(90°), DR(180°).
 */

const BASE = import.meta.env.BASE_URL + 'noteskin/';

const ASSETS = {
  'center-tap': BASE + 'center-tap.png',
  'upleft-tap': BASE + 'upleft-tap.png',
  'center-receptor': BASE + 'center-receptor.png',
  'upleft-receptor': BASE + 'upleft-receptor.png',
  'center-glow': BASE + 'center-glow.png',
  'upleft-glow': BASE + 'upleft-glow.png',
  'center-hold-body': BASE + 'center-hold-body.png',
  'upleft-hold-body': BASE + 'upleft-hold-body.png',
  'center-hold-topcap': BASE + 'center-hold-topcap.png',
  'upleft-hold-topcap': BASE + 'upleft-hold-topcap.png',
  'center-hold-bottomcap': BASE + 'center-hold-bottomcap.png',
  'upleft-hold-bottomcap': BASE + 'upleft-hold-bottomcap.png',
  'center-roll-body': BASE + 'center-roll-body.png',
  'upleft-roll-body': BASE + 'upleft-roll-body.png',
  'mine': BASE + 'mine.png',
};

// Column index (mod 5) → rotation in degrees and base asset key prefix
// DL=0, UL=1, Center=2, UR=3, DR=4
const PANEL_MAP = [
  { base: 'upleft', rotation: 270 },  // DL
  { base: 'upleft', rotation: 0 },    // UL
  { base: 'center', rotation: 0 },    // Center
  { base: 'upleft', rotation: 90 },   // UR
  { base: 'upleft', rotation: 180 },  // DR
];

let images = null;
let loadPromise = null;

/**
 * Load all noteskin images. Returns a promise that resolves when all loaded.
 * Caches results — safe to call multiple times.
 */
export function loadNoteskin() {
  if (images) return Promise.resolve(images);
  if (loadPromise) return loadPromise;

  loadPromise = Promise.all(
    Object.entries(ASSETS).map(([key, src]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve([key, img]);
        img.onerror = () => {
          console.warn(`Failed to load noteskin asset: ${src}`);
          resolve([key, null]);
        };
        img.src = src;
      })
    )
  ).then(entries => {
    images = Object.fromEntries(entries);
    return images;
  });

  return loadPromise;
}

/**
 * Get loaded images (null if not yet loaded).
 */
export function getNoteskinImages() {
  return images;
}

/**
 * Get panel info for a column index.
 */
export function getPanelInfo(column) {
  return PANEL_MAP[column % 5];
}

// Sprite sheet frame dimensions (doubleres)
export const TAP_FRAME_W = 128;
export const TAP_FRAME_H = 128;
export const TAP_COLS = 2;
export const TAP_ROWS = 16;

export const BODY_FRAME_W = 128;
export const BODY_FRAME_H = 128;

/**
 * Loads pump noteskin sprite assets and provides draw helpers.
 * Assets are from hanubeki/noteskin-hanubeki (Apache 2.0).
 *
 * PIU color convention:
 *   DL, DR = Blue
 *   UL, UR = Red (original upleft sprites)
 *   Center = Yellow (original center sprites)
 *
 * Blue variants are generated at load time by hue-shifting the red UL assets.
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

// Assets that need a blue variant for DL/DR
const BLUE_VARIANTS = [
  'tap', 'receptor', 'glow', 'hold-body', 'hold-topcap', 'hold-bottomcap', 'roll-body',
];

// Column index (mod 5) → rotation in degrees and base asset key prefix
// DL=0 (blue), UL=1 (red), Center=2 (yellow), UR=3 (red), DR=4 (blue)
const PANEL_MAP = [
  { base: 'downleft', rotation: 270 },   // DL - blue
  { base: 'upleft', rotation: 0 },       // UL - red (original)
  { base: 'center', rotation: 0 },       // Center - yellow (original)
  { base: 'upleft', rotation: 90 },      // UR - red (rotated)
  { base: 'downleft', rotation: 180 },   // DR - blue (rotated)
];

let images = null;
let loadPromise = null;

/**
 * Shift red pixels to blue by swapping R and B channels
 * and adjusting to get a nice PIU blue.
 */
function createBlueVariant(sourceImg) {
  const canvas = document.createElement('canvas');
  canvas.width = sourceImg.naturalWidth;
  canvas.height = sourceImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Shift hue: swap red channel to blue, reduce red
    // Red-dominant pixels become blue-dominant
    data[i] = Math.min(255, Math.floor(b * 0.4 + g * 0.2));       // R
    data[i + 1] = Math.min(255, Math.floor(g * 0.6 + b * 0.3));   // G
    data[i + 2] = Math.min(255, Math.floor(r * 0.9 + b * 0.3));   // B
    // Alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0);

  // Convert canvas to image
  const blueImg = new Image();
  blueImg.src = canvas.toDataURL();
  return blueImg;
}

/**
 * Load all noteskin images. Returns a promise that resolves when all loaded.
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
    const imgs = Object.fromEntries(entries);

    // Generate blue variants for DL/DR from the red UL assets
    for (const type of BLUE_VARIANTS) {
      const redKey = `upleft-${type}`;
      const blueKey = `downleft-${type}`;
      if (imgs[redKey]) {
        imgs[blueKey] = createBlueVariant(imgs[redKey]);
      }
    }

    images = imgs;
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

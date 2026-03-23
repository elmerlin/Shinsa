const paletteCache = new Map();

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function mixToward(value, target, amount) {
  return clamp(Math.round(value + (target - value) * amount));
}

function mixColors(a, b, amount = 0.5) {
  return {
    r: mixToward(a.r, b.r, amount),
    g: mixToward(a.g, b.g, amount),
    b: mixToward(a.b, b.b, amount),
  };
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function averageBucket(bucket) {
  return {
    r: clamp(Math.round(bucket.r / bucket.weight)),
    g: clamp(Math.round(bucket.g / bucket.weight)),
    b: clamp(Math.round(bucket.b / bucket.weight)),
  };
}

function buildPalette(primaryBase, secondaryBase) {
  const primary = {
    r: mixToward(primaryBase.r, 255, 0.08),
    g: mixToward(primaryBase.g, 255, 0.08),
    b: mixToward(primaryBase.b, 255, 0.08),
  };
  const secondary = {
    r: mixToward(secondaryBase.r, 255, 0.06),
    g: mixToward(secondaryBase.g, 255, 0.06),
    b: mixToward(secondaryBase.b, 255, 0.06),
  };
  const accentBase = mixColors(primaryBase, secondaryBase, 0.5);

  return {
    primary,
    secondary,
    accent: {
      r: mixToward(accentBase.r, 255, 0.16),
      g: mixToward(accentBase.g, 255, 0.16),
      b: mixToward(accentBase.b, 255, 0.16),
    },
  };
}

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function computeDominantColors(data) {
  const buckets = new Map();

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = data[i + 3] / 255;
    if (alpha < 0.15) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const luminance = (max + min) / 2;
    if (luminance < 18 || luminance > 244) continue;

    const saturationFactor = saturation / 255;
    const midToneFactor = 1 - Math.min(1, Math.abs((luminance / 255) - 0.5) * 1.6);
    const weight = alpha * (0.45 + saturationFactor * 0.85) * (0.35 + midToneFactor * 0.75);
    if (weight < 0.01) continue;

    const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
    const existing = buckets.get(key) || { r: 0, g: 0, b: 0, weight: 0 };
    existing.r += r * weight;
    existing.g += g * weight;
    existing.b += b * weight;
    existing.weight += weight;
    buckets.set(key, existing);
  }

  const ranked = [...buckets.values()].sort((a, b) => b.weight - a.weight);
  if (ranked.length === 0) return null;

  const primary = averageBucket(ranked[0]);
  let secondary = null;

  for (let i = 1; i < ranked.length; i += 1) {
    const candidate = averageBucket(ranked[i]);
    if (colorDistance(primary, candidate) >= 50) {
      secondary = candidate;
      break;
    }
  }

  if (!secondary) {
    secondary = {
      r: mixToward(primary.r, 18, 0.28),
      g: mixToward(primary.g, 18, 0.28),
      b: mixToward(primary.b, 18, 0.28),
    };
  }

  return { primary, secondary };
}

export async function extractCommunityPalette(src) {
  if (!src || typeof window === 'undefined') return null;
  if (paletteCache.has(src)) return paletteCache.get(src);

  const palettePromise = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const dominant = computeDominantColors(pixelData);
        resolve(dominant ? buildPalette(dominant.primary, dominant.secondary) : null);
      } catch {
        resolve(null);
      }
    };

    image.onerror = () => resolve(null);
    image.src = src;
  });

  paletteCache.set(src, palettePromise);
  return palettePromise;
}

export function getCommunityCardStyle(palette) {
  if (!palette) return null;
  return {
    backgroundColor: 'rgba(11, 16, 30, 0.92)',
    backgroundImage: `linear-gradient(140deg, ${rgba(palette.primary, 0.32)} 0%, ${rgba(palette.secondary, 0.26)} 46%, rgba(11, 16, 30, 0.92) 100%)`,
  };
}

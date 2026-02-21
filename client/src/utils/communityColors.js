const paletteCache = new Map();

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function mixToward(value, target, amount) {
  return clamp(Math.round(value + (target - value) * amount));
}

function buildPalette(base) {
  return {
    primary: {
      r: mixToward(base.r, 255, 0.04),
      g: mixToward(base.g, 255, 0.04),
      b: mixToward(base.b, 255, 0.04),
    },
    secondary: {
      r: mixToward(base.r, 20, 0.34),
      g: mixToward(base.g, 20, 0.34),
      b: mixToward(base.b, 20, 0.34),
    },
  };
}

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function computeDominantColor(data) {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalWeight = 0;

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

    const weight = alpha * (1 + saturation / 255);
    totalR += r * weight;
    totalG += g * weight;
    totalB += b * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return null;
  return {
    r: clamp(Math.round(totalR / totalWeight)),
    g: clamp(Math.round(totalG / totalWeight)),
    b: clamp(Math.round(totalB / totalWeight)),
  };
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
        const dominant = computeDominantColor(pixelData);
        resolve(dominant ? buildPalette(dominant) : null);
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
    backgroundImage: `linear-gradient(140deg, ${rgba(palette.primary, 0.24)} 0%, ${rgba(palette.secondary, 0.2)} 44%, rgba(11, 16, 30, 0.9) 100%)`,
    borderColor: rgba(palette.primary, 0.48),
    boxShadow: `0 10px 26px ${rgba(palette.primary, 0.16)}`,
  };
}

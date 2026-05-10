/**
 * Plate badge styling — mirrors `client/src/utils/plates.js` + the web's
 * PlateBadge component coloring.
 */

export type PlateCode = 'PG' | 'UG' | 'EG' | 'SG' | 'MG' | 'TG' | 'FG' | 'RG';

export const PLATE_NAMES: Record<PlateCode, string> = {
  PG: 'PERFECT GAME',
  UG: 'ULTIMATE GAME',
  EG: 'EXTREME GAME',
  SG: 'SUPERB GAME',
  MG: 'MARVELOUS GAME',
  TG: 'TALENTED GAME',
  FG: 'FAIR GAME',
  RG: 'ROUGH GAME',
};

export interface PlateStyle {
  bg: string;
  fg: string;
  border: string;
}

const PLATE_STYLES: Record<PlateCode, PlateStyle> = {
  PG: { bg: 'rgba(125,211,252,0.15)', fg: '#7dd3fc', border: 'rgba(125,211,252,0.4)' },
  UG: { bg: 'rgba(192,132,252,0.15)', fg: '#c084fc', border: 'rgba(192,132,252,0.4)' },
  EG: { bg: 'rgba(244,114,182,0.15)', fg: '#f472b6', border: 'rgba(244,114,182,0.4)' },
  SG: { bg: 'rgba(255,224,107,0.15)', fg: '#FFE06B', border: 'rgba(255,224,107,0.4)' },
  MG: { bg: 'rgba(255,196,0,0.15)', fg: '#FFC400', border: 'rgba(255,196,0,0.4)' },
  TG: { bg: 'rgba(205,127,50,0.15)', fg: '#cd7f32', border: 'rgba(205,127,50,0.4)' },
  FG: { bg: 'rgba(124,124,130,0.15)', fg: '#a8a8ae', border: 'rgba(124,124,130,0.4)' },
  RG: { bg: 'rgba(120,120,120,0.1)', fg: '#737373', border: 'rgba(120,120,120,0.3)' },
};

export function normalizePlate(value: unknown): PlateCode | null {
  const code = String(value ?? '').trim().toUpperCase();
  if (code in PLATE_STYLES) return code as PlateCode;
  return null;
}

export function getPlateStyle(code: PlateCode): PlateStyle {
  return PLATE_STYLES[code];
}

export function getPlateName(value: unknown): string {
  const code = normalizePlate(value);
  return code ? PLATE_NAMES[code] : '';
}

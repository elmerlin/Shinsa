export const PLATE_NAMES = {
  PG: 'PERFECT GAME',
  UG: 'ULTIMATE GAME',
  EG: 'EXTREME GAME',
  SG: 'SUPERB GAME',
  MG: 'MARVELOUS GAME',
  TG: 'TALENTED GAME',
  FG: 'FAIR GAME',
  RG: 'ROUGH GAME',
};

export function normalizePlateCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function getPlateName(value) {
  const code = normalizePlateCode(value);
  return PLATE_NAMES[code] || code;
}

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

const PLATE_TEXT_COLORS = {
  PG: 'text-piu-gold',
  UG: 'text-yellow-300',
  EG: 'text-emerald-300',
  SG: 'text-sky-300',
  MG: 'text-cyan-300',
  TG: 'text-violet-300',
  FG: 'text-slate-300',
  RG: 'text-rose-300',
};

const PLATE_CHIP_COLORS = {
  PG: 'border-piu-gold/40 bg-piu-gold/12 text-piu-gold',
  UG: 'border-yellow-300/30 bg-yellow-400/10 text-yellow-200',
  EG: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
  SG: 'border-sky-300/30 bg-sky-400/10 text-sky-200',
  MG: 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200',
  TG: 'border-violet-300/30 bg-violet-400/10 text-violet-200',
  FG: 'border-slate-300/25 bg-slate-400/10 text-slate-200',
  RG: 'border-rose-300/30 bg-rose-400/10 text-rose-200',
};

export function normalizePlateCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function getPlateName(value) {
  const code = normalizePlateCode(value);
  return PLATE_NAMES[code] || code;
}

export function getPlateTextColorClass(value) {
  const code = normalizePlateCode(value);
  return PLATE_TEXT_COLORS[code] || 'text-gray-300';
}

export function getPlateChipClass(value) {
  const code = normalizePlateCode(value);
  return PLATE_CHIP_COLORS[code] || 'border-white/12 bg-white/6 text-gray-200';
}

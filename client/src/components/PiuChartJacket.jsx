import React from 'react';

const SIZE_STYLES = {
  xs: {
    frame: 'w-9 h-9 rounded-lg',
    fallback: 'text-xs',
    badge: 'right-0.5 top-0.5 min-w-[20px] h-[15px] px-1 text-[8px] rounded-md',
  },
  sm: {
    frame: 'w-10 h-10 rounded-lg',
    fallback: 'text-xs',
    badge: 'right-0.5 top-0.5 min-w-[22px] h-4 px-1 text-[8px] rounded-md',
  },
  md: {
    frame: 'w-11 h-11 rounded-xl',
    fallback: 'text-sm',
    badge: 'right-0.5 top-0.5 min-w-[24px] h-[17px] px-1.5 text-[9px] rounded-md',
  },
  wide: {
    frame: 'w-16 h-10 rounded-xl',
    fallback: 'text-[10px]',
    badge: 'right-1 top-1 min-w-[26px] h-[17px] px-1.5 text-[9px] rounded-md',
  },
};

export function normalizeChartTitle(title) {
  return String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function getChartModeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  const normalized = String(mode || '').trim().toUpperCase();
  return normalized ? normalized[0] : 'X';
}

export function resolveChartJacketUrl({
  title = '',
  mode = '',
  level = '',
  jacketLookup = {},
  backgroundUrl = '',
  jacketUrl = '',
}) {
  const normalizedTitle = normalizeChartTitle(title);
  if (!normalizedTitle) {
    return String(jacketUrl || '').trim();
  }

  const exactKey = `${normalizedTitle}|${mode}|${level}`;
  const localJacket = jacketLookup?.[exactKey] || jacketLookup?.[normalizedTitle] || '';
  const safeBackgroundUrl = String(backgroundUrl || '').includes('piugame') ? '' : String(backgroundUrl || '').trim();
  return localJacket || safeBackgroundUrl || String(jacketUrl || '').trim();
}

function getBadgeTone(mode) {
  if (mode === 'Single') {
    return 'border-rose-200/45 bg-gradient-to-br from-[#ff7a7a] via-[#d93d62] to-[#7a1730] shadow-[0_4px_14px_rgba(217,61,98,0.38)]';
  }
  if (mode === 'Double') {
    return 'border-emerald-200/45 bg-gradient-to-br from-[#4cf4aa] via-[#16b77f] to-[#0b5d48] shadow-[0_4px_14px_rgba(22,183,127,0.34)]';
  }
  return 'border-sky-200/45 bg-gradient-to-br from-[#69c8ff] via-[#2b88de] to-[#12457c] shadow-[0_4px_14px_rgba(43,136,222,0.34)]';
}

export default function PiuChartJacket({
  title = '',
  mode = '',
  level = '',
  jacketUrl = '',
  size = 'md',
  className = '',
  imageClassName = '',
  withBadge = true,
}) {
  const styles = SIZE_STYLES[size] || SIZE_STYLES.md;
  const parsedLevel = parseInt(level, 10);
  const displayLevel = Number.isFinite(parsedLevel) && parsedLevel > 0
    ? String(parsedLevel)
    : (String(level || '').trim() || '?');
  const badgeLabel = `${getChartModeShort(mode)}${displayLevel}`;
  const fallbackChar = String(title || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={`relative shrink-0 ${className}`}>
      <div className={`${styles.frame} overflow-hidden border border-piu-border/60 bg-[#08101c] shadow-[0_10px_24px_rgba(0,0,0,0.28)]`}>
        {jacketUrl ? (
          <img
            src={jacketUrl}
            alt={title || 'Song jacket'}
            className={`h-full w-full object-cover transition-transform duration-200 ${imageClassName}`.trim()}
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[#101a2c] via-[#0c1424] to-[#050914] font-display font-black text-gray-500 ${styles.fallback}`}>
            {fallbackChar}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      </div>
      {withBadge ? (
        <span
          className={`absolute inline-flex items-center justify-center border font-display font-black leading-none tracking-wide text-white ${styles.badge} ${getBadgeTone(mode)}`}
        >
          {badgeLabel}
        </span>
      ) : null}
    </div>
  );
}

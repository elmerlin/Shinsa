import React from 'react';

function normalizeCountryCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : '';
}

function getCountryName(code) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return '';
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      return displayNames.of(normalized) || normalized;
    }
  } catch {
    // Ignore display name lookup failures and fall back to the ISO code.
  }
  return normalized;
}

function getFlagEmoji(code) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return '';
  return String.fromCodePoint(
    ...normalized.split('').map((char) => 127397 + char.charCodeAt(0))
  );
}

export function getCountryFlag(code, className) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;

  const sizeClass = className
    ? className.replace(/\binline-block\b\s*/g, '').trim()
    : 'h-[1.1em] align-middle';
  const countryName = getCountryName(normalized);
  const emojiFlag = getFlagEmoji(normalized);

  return (
    <>
      <span className="sm:hidden">{emojiFlag}</span>
      <img
        src={`https://flagcdn.com/w40/${normalized.toLowerCase()}.png`}
        alt={countryName}
        className={`hidden sm:inline-block ${sizeClass}`}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    </>
  );
}

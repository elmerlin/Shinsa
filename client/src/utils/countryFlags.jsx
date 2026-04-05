import React, { useState } from 'react';

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

function CountryFlag({ code, className }) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;

  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = className
    ? className.replace(/\binline-block\b\s*/g, '').trim()
    : 'h-[1.1em]';
  const countryName = getCountryName(normalized);
  const emojiFlag = getFlagEmoji(normalized);
  const imageClassName = [
    'inline-block w-auto max-w-none shrink-0 rounded-[0.18em] align-[-0.12em] object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.14)]',
    sizeClass,
  ].filter(Boolean).join(' ');

  if (imageFailed) {
    return (
      <span
        role="img"
        aria-label={countryName}
        title={countryName}
        className="inline-block align-[-0.12em]"
      >
        {emojiFlag}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/${normalized.toLowerCase()}.svg`}
      alt={countryName}
      title={countryName}
      className={imageClassName}
      draggable={false}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setImageFailed(true)}
    />
  );
}

export function getCountryFlag(code, className) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;
  return <CountryFlag code={normalized} className={className} />;
}

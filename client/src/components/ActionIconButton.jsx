import React from 'react';

function getToneClasses(tone, active) {
  if (tone === 'amber') {
    return active
      ? 'text-amber-100 bg-amber-500/12'
      : 'text-amber-200 hover:text-amber-100 hover:bg-amber-500/10';
  }
  if (tone === 'cyan') {
    return active
      ? 'text-cyan-100 bg-cyan-500/12'
      : 'text-gray-400 hover:text-cyan-100 hover:bg-cyan-500/10';
  }
  return active
    ? 'text-white bg-piu-dark/65'
    : 'text-gray-400 hover:text-white hover:bg-piu-dark/50';
}

export default function ActionIconButton({
  onClick,
  title = '',
  ariaLabel = '',
  tone = 'neutral',
  active = false,
  count = 0,
  disabled = false,
  className = '',
  children,
}) {
  const countValue = Number.isFinite(Number(count)) ? Number(count) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || ariaLabel}
      aria-label={ariaLabel || title}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-display font-bold outline-none ring-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${getToneClasses(tone, active)} ${className}`.trim()}
    >
      <span className="shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]">
        {children}
      </span>
      {countValue > 0 ? (
        <span className="min-w-[0.25rem] text-[13px] leading-none text-current">
          {countValue}
        </span>
      ) : null}
    </button>
  );
}

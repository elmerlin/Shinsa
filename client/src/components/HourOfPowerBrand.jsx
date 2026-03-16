import React from 'react';

export const HOP_LOGO_SRC = '/hour-of-power/hop_logo.png';

export function HourOfPowerLogo({
  className = '',
  imageClassName = '',
  alt = 'Hour of Power logo',
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-yellow-300/30 bg-[linear-gradient(180deg,rgba(255,224,125,0.12),rgba(16,22,47,0.94))] shadow-[0_8px_24px_rgba(0,0,0,0.24)] ${className}`.trim()}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,232,159,0.18),transparent_58%)]" />
      <img src={HOP_LOGO_SRC} alt={alt} className={`relative z-[1] h-full w-full object-contain ${imageClassName}`.trim()} />
    </div>
  );
}

export function HourOfPowerWordmark({
  className = '',
  compact = false,
  subtitle = '',
  align = 'left',
}) {
  const textAlignClass = align === 'center' ? 'items-center text-center' : 'items-start text-left';
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <HourOfPowerLogo className={`${compact ? 'h-12 w-10 rounded-xl' : 'h-16 w-14'} shrink-0`} imageClassName="p-1" />
      <div className={`flex min-w-0 flex-col ${textAlignClass}`}>
        <p className={`font-display font-black uppercase tracking-[0.24em] text-yellow-200 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>Hour of Power</p>
        {subtitle ? (
          <p className={`text-gray-300 ${compact ? 'text-[11px]' : 'text-xs'}`}>{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

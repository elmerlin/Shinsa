import React from 'react';

export default function CommunityBadge({ text, bgColor = '#ff3366', textColor = '#ffffff', size = 'sm' }) {
  if (!text) return null;

  const sizeClasses = size === 'xs'
    ? 'text-[8px] px-1 py-0'
    : 'text-[10px] px-1.5 py-0.5';

  return (
    <span
      className={`inline-flex items-center font-display font-bold rounded-full whitespace-nowrap leading-tight ${sizeClasses}`}
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {text}
    </span>
  );
}

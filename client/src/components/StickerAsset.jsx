import React from 'react';

function buildSpriteStyle(sticker) {
  const columns = Math.max(1, parseInt(sticker?.spriteColumns, 10) || 1);
  const rows = Math.max(1, parseInt(sticker?.spriteRows, 10) || 1);
  const frames = Math.max(1, parseInt(sticker?.spriteFrames, 10) || columns);
  const rowIndex = Math.max(0, Math.min(rows - 1, parseInt(sticker?.spriteRow, 10) || 0));
  const fps = Math.max(1, parseInt(sticker?.spriteFps, 10) || 8);
  const rowPosition = rows <= 1 ? '0%' : `${(rowIndex / (rows - 1)) * 100}%`;
  return {
    backgroundImage: `url(${sticker.spriteSheet})`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPositionY: rowPosition,
    animationDuration: `${frames / fps}s`,
    animationTimingFunction: `steps(${frames})`,
    '--sticker-sprite-frames': frames,
  };
}

export default function StickerAsset({
  sticker,
  className = '',
  title = '',
  alt = '',
}) {
  if (!sticker) return null;

  if (sticker.spriteSheet) {
    return (
      <span
        className={`sticker-sprite ${className}`.trim()}
        style={buildSpriteStyle(sticker)}
        role="img"
        aria-label={alt || sticker.label || ''}
        title={title || sticker.label || ''}
      />
    );
  }

  return (
    <img
      src={sticker.image}
      alt={alt || sticker.label || ''}
      title={title || sticker.label || ''}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}

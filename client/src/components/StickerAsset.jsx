import React, { useEffect, useState } from 'react';

export default function StickerAsset({
  sticker,
  className = '',
  title = '',
  alt = '',
}) {
  const isSpriteSticker = !!sticker?.spriteSheet;
  const columns = Math.max(1, parseInt(sticker?.spriteColumns, 10) || 1);
  const rows = Math.max(1, parseInt(sticker?.spriteRows, 10) || 1);
  const frames = Math.max(1, Math.min(columns, parseInt(sticker?.spriteFrames, 10) || columns));
  const fps = Math.max(1, parseInt(sticker?.spriteFps, 10) || 8);
  const rowIndex = Math.max(0, Math.min(rows - 1, parseInt(sticker?.spriteRow, 10) || 0));
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isSpriteSticker || frames <= 1) return undefined;
    const interval = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames);
    }, Math.round(1000 / fps));
    return () => window.clearInterval(interval);
  }, [fps, frames, isSpriteSticker]);

  if (!sticker) return null;

  if (isSpriteSticker) {
    return (
      <span
        className={`sticker-sprite ${className}`.trim()}
        role="img"
        aria-label={alt || sticker.label || ''}
        title={title || sticker.label || ''}
      >
        <img
          src={sticker.spriteSheet}
          alt=""
          aria-hidden="true"
          className="sticker-sprite__sheet"
          loading="lazy"
          decoding="async"
          style={{
            width: `${columns * 100}%`,
            height: `${rows * 100}%`,
            transform: `translate(${-100 * (frameIndex / columns)}%, ${-100 * (rowIndex / rows)}%)`,
          }}
        />
      </span>
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

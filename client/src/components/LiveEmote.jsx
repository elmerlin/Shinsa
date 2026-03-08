import React from 'react';
import { getLiveEmote } from '../utils/liveEmotes';

const CHIP_SIZE_CLASS = {
  inline: 'live-emote-chip--inline',
  tray: 'live-emote-chip--tray',
  reaction: 'live-emote-chip--reaction',
  compact: 'live-emote-chip--compact',
};

const STICKER_SIZE_CLASS = {
  inline: 'live-emote-sticker--inline',
  tray: 'live-emote-sticker--tray',
  reaction: 'live-emote-sticker--reaction',
  compact: 'live-emote-sticker--compact',
};

export default function LiveEmote({ token, emote, size = 'inline', showLabel = true, className = '' }) {
  const resolved = emote || getLiveEmote(token);
  if (!resolved) {
    return token ? <span className={className}>{token}</span> : null;
  }

  const motionClass = `live-emote-motion-${resolved.motion || 'pulse'}`;

  if (resolved.variant === 'sticker' && resolved.image) {
    const stickerShowLabel = showLabel && size === 'tray';
    return (
      <span
        className={`live-emote-sticker ${motionClass} ${STICKER_SIZE_CLASS[size] || STICKER_SIZE_CLASS.inline} ${stickerShowLabel ? '' : 'live-emote-sticker--no-label'} ${className}`.trim()}
        style={{
          '--live-emote-from': resolved.colors?.[0] || 'rgba(244, 63, 94, 0.92)',
          '--live-emote-to': resolved.colors?.[1] || 'rgba(236, 72, 153, 0.82)',
          '--live-emote-glow': resolved.colors?.[2] || 'rgba(251, 113, 133, 0.85)',
          '--live-emote-text': resolved.colors?.[3] || '#ffffff',
        }}
      >
        <span className="live-emote-sticker__halo" />
        <span className="live-emote-sticker__frame">
          <img
            src={resolved.image}
            alt={resolved.label}
            className="live-emote-sticker__image"
            loading="lazy"
            decoding="async"
          />
        </span>
        <span className="live-emote-sticker__label">{resolved.label}</span>
      </span>
    );
  }

  return (
    <span
      className={`live-emote-chip ${motionClass} ${CHIP_SIZE_CLASS[size] || CHIP_SIZE_CLASS.inline} ${showLabel ? '' : 'live-emote-chip--no-label'} ${className}`.trim()}
      style={{
        '--live-emote-from': resolved.colors?.[0] || 'rgba(244, 63, 94, 0.92)',
        '--live-emote-to': resolved.colors?.[1] || 'rgba(236, 72, 153, 0.82)',
        '--live-emote-glow': resolved.colors?.[2] || 'rgba(251, 113, 133, 0.85)',
        '--live-emote-text': resolved.colors?.[3] || '#ffffff',
      }}
    >
      <span className="live-emote-chip__shine" />
      <span className="live-emote-chip__icon" aria-hidden="true">{resolved.icon}</span>
      <span className="live-emote-chip__label">{resolved.label}</span>
    </span>
  );
}

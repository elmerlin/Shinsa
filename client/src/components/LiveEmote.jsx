import React from 'react';
import { getLiveEmote } from '../utils/liveEmotes';

const SIZE_CLASS = {
  inline: 'live-emote-chip--inline',
  tray: 'live-emote-chip--tray',
  reaction: 'live-emote-chip--reaction',
  compact: 'live-emote-chip--compact',
};

export default function LiveEmote({ token, emote, size = 'inline', showLabel = true, className = '' }) {
  const resolved = emote || getLiveEmote(token);
  if (!resolved) {
    return token ? <span className={className}>{token}</span> : null;
  }

  return (
    <span
      className={`live-emote-chip live-emote-motion-${resolved.motion || 'pulse'} ${SIZE_CLASS[size] || SIZE_CLASS.inline} ${showLabel ? '' : 'live-emote-chip--no-label'} ${className}`.trim()}
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

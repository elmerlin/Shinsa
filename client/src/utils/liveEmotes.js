export const LIVE_EMOTES = [
  {
    token: ':shinsa_hype:',
    icon: '⚡',
    label: 'Hype',
    colors: ['rgba(244, 63, 94, 0.92)', 'rgba(236, 72, 153, 0.82)', 'rgba(251, 113, 133, 0.85)', '#fff1f2'],
    motion: 'pulse',
  },
  {
    token: ':shinsa_lockin:',
    icon: '🎯',
    label: 'Lock In',
    colors: ['rgba(14, 165, 233, 0.9)', 'rgba(6, 182, 212, 0.82)', 'rgba(34, 211, 238, 0.85)', '#ecfeff'],
    motion: 'drift',
  },
  {
    token: ':shinsa_combo:',
    icon: '✨',
    label: 'Combo',
    colors: ['rgba(250, 204, 21, 0.92)', 'rgba(249, 115, 22, 0.82)', 'rgba(251, 191, 36, 0.85)', '#fff7ed'],
    motion: 'spark',
  },
  {
    token: ':shinsa_love:',
    icon: '💖',
    label: 'Love',
    colors: ['rgba(236, 72, 153, 0.9)', 'rgba(168, 85, 247, 0.82)', 'rgba(244, 114, 182, 0.85)', '#fdf2f8'],
    motion: 'pulse',
  },
  {
    token: ':shinsa_pump:',
    icon: '🕹️',
    label: 'Pump',
    colors: ['rgba(16, 185, 129, 0.9)', 'rgba(34, 197, 94, 0.82)', 'rgba(74, 222, 128, 0.85)', '#ecfdf5'],
    motion: 'drift',
  },
  {
    token: ':shinsa_gg:',
    icon: '🏆',
    label: 'GG',
    colors: ['rgba(245, 158, 11, 0.92)', 'rgba(249, 115, 22, 0.82)', 'rgba(251, 191, 36, 0.85)', '#fffbeb'],
    motion: 'spark',
  },
];

export const LIVE_EMOJI_GROUPS = [
  { label: 'Quick', emojis: ['🔥', '💪', '👏', '😂', '❤️', '⚡'] },
  { label: 'Crowd', emojis: ['🙌', '🫡', '👀', '💯', '🚀', '🎉'] },
];

const LIVE_EMOTE_MAP = LIVE_EMOTES.reduce((acc, emote) => {
  acc[emote.token] = emote;
  return acc;
}, {});

const LIVE_EMOTE_TOKEN_REGEX = /(:shinsa_[a-z0-9_]+:)/g;

export function getLiveEmote(token) {
  return LIVE_EMOTE_MAP[String(token || '').trim().toLowerCase()] || null;
}

export function tokenizeLiveMessage(message) {
  const raw = String(message || '');
  if (!raw) return [];

  return raw.split(LIVE_EMOTE_TOKEN_REGEX).filter(Boolean).map((segment) => {
    const emote = getLiveEmote(segment);
    if (emote) return { type: 'emote', emote };
    return { type: 'text', text: segment };
  });
}

export function getLiveReactionPayload(message) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return null;

  const emote = getLiveEmote(trimmed);
  if (emote) {
    return {
      kind: 'emote',
      emote,
    };
  }

  if (/^[\p{Emoji}\s]{1,5}$/u.test(trimmed)) {
    return {
      kind: 'emoji',
      emoji: trimmed,
    };
  }

  return null;
}

export function getReactionBurstColors(reaction) {
  if (reaction?.kind === 'emote' && Array.isArray(reaction?.emote?.colors)) {
    return reaction.emote.colors.slice(0, 3);
  }
  return ['rgba(34, 211, 238, 0.85)', 'rgba(244, 114, 182, 0.85)', 'rgba(250, 204, 21, 0.85)'];
}

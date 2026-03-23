import { DEVIT_EMOJIS, DOJO_CAT_EMOJIS, HEAVYBREATHING_CHICKEN_EMOJIS, HEAVYBREATHING_EMOJIS } from './stickers';

const FEATURED_DOJO_CAT_CONFIG = [
  {
    token: ':dojocat_1_0:',
    label: 'Dojo Wink',
    colors: ['rgba(251, 191, 36, 0.92)', 'rgba(249, 115, 22, 0.82)', 'rgba(253, 224, 71, 0.85)', '#fff7ed'],
    motion: 'pulse',
  },
  {
    token: ':dojocat_2_4:',
    label: 'Dojo Bite',
    colors: ['rgba(244, 63, 94, 0.92)', 'rgba(168, 85, 247, 0.82)', 'rgba(251, 113, 133, 0.85)', '#fff1f2'],
    motion: 'spark',
  },
  {
    token: ':dojocat_4_2:',
    label: 'Dojo Shock',
    colors: ['rgba(56, 189, 248, 0.92)', 'rgba(14, 165, 233, 0.82)', 'rgba(34, 211, 238, 0.85)', '#ecfeff'],
    motion: 'drift',
  },
  {
    token: ':dojocat_4_7:',
    label: 'Dojo Laugh',
    colors: ['rgba(34, 197, 94, 0.9)', 'rgba(16, 185, 129, 0.82)', 'rgba(74, 222, 128, 0.85)', '#ecfdf5'],
    motion: 'pulse',
  },
  {
    token: ':dojocat_5_6:',
    label: 'Dojo Hero',
    colors: ['rgba(96, 165, 250, 0.92)', 'rgba(59, 130, 246, 0.82)', 'rgba(147, 197, 253, 0.85)', '#eff6ff'],
    motion: 'drift',
  },
  {
    token: ':dojocat_6_1:',
    label: 'Dojo Sweet',
    colors: ['rgba(244, 114, 182, 0.92)', 'rgba(236, 72, 153, 0.82)', 'rgba(251, 182, 206, 0.85)', '#fdf2f8'],
    motion: 'pulse',
  },
  {
    token: ':dojocat_7_1:',
    label: 'Dojo Cackle',
    colors: ['rgba(250, 204, 21, 0.92)', 'rgba(245, 158, 11, 0.82)', 'rgba(253, 230, 138, 0.85)', '#fefce8'],
    motion: 'spark',
  },
  {
    token: ':dojocat_7_4:',
    label: 'Dojo Lock In',
    colors: ['rgba(148, 163, 184, 0.92)', 'rgba(100, 116, 139, 0.82)', 'rgba(203, 213, 225, 0.85)', '#f8fafc'],
    motion: 'drift',
  },
];

const FEATURED_DOJO_CAT_EMOTES = FEATURED_DOJO_CAT_CONFIG
  .map((entry) => {
    const match = DOJO_CAT_EMOJIS.find((emoji) => emoji.token === entry.token);
    if (!match) return null;
    return {
      ...entry,
      image: match.image,
      variant: 'sticker',
      trayGroup: 'Featured DojoCat',
    };
  })
  .filter(Boolean);

const FEATURED_DEVIT_CONFIG = [
  {
    token: ':devit_cheer:',
    label: 'Devit Cheer',
    colors: ['rgba(248, 113, 113, 0.92)', 'rgba(239, 68, 68, 0.82)', 'rgba(252, 165, 165, 0.85)', '#fff5f5'],
    motion: 'spark',
  },
  {
    token: ':devit_hop:',
    label: 'Devit Hop',
    colors: ['rgba(250, 204, 21, 0.92)', 'rgba(249, 115, 22, 0.82)', 'rgba(253, 224, 71, 0.85)', '#fffbeb'],
    motion: 'pulse',
  },
  {
    token: ':devit_scamper:',
    label: 'Devit Scamper',
    colors: ['rgba(59, 130, 246, 0.92)', 'rgba(14, 165, 233, 0.82)', 'rgba(125, 211, 252, 0.85)', '#eff6ff'],
    motion: 'drift',
  },
  {
    token: ':devit_grin:',
    label: 'Devit Grin',
    colors: ['rgba(236, 72, 153, 0.92)', 'rgba(244, 114, 182, 0.82)', 'rgba(251, 182, 206, 0.85)', '#fdf2f8'],
    motion: 'pulse',
  },
];

const FEATURED_DEVIT_EMOTES = FEATURED_DEVIT_CONFIG
  .map((entry) => {
    const match = DEVIT_EMOJIS.find((emoji) => emoji.token === entry.token);
    if (!match) return null;
    return {
      ...entry,
      image: match.image,
      variant: 'sticker',
      trayGroup: 'Featured Devit',
    };
  })
  .filter(Boolean);

const FEATURED_HEAVYBREATHING_CONFIG = [
  {
    token: ':heavybreathing:',
    label: 'Heavy Breathing',
    colors: ['rgba(249, 115, 22, 0.92)', 'rgba(185, 28, 28, 0.82)', 'rgba(253, 186, 116, 0.85)', '#fff7ed'],
    motion: 'pulse',
  },
];

const FEATURED_HEAVYBREATHING_EMOTES = FEATURED_HEAVYBREATHING_CONFIG
  .map((entry) => {
    const match = HEAVYBREATHING_EMOJIS.find((emoji) => emoji.token === entry.token);
    if (!match) return null;
    return {
      ...entry,
      image: match.image,
      variant: 'sticker',
      trayGroup: 'Featured Heavy Breathing',
    };
  })
  .filter(Boolean);

const FEATURED_HEAVYBREATHING_CHICKEN_CONFIG = [
  {
    token: ':heavybreathing_chicken_0:',
    label: 'HB Chicken Calm',
    colors: ['rgba(34, 197, 94, 0.9)', 'rgba(22, 163, 74, 0.82)', 'rgba(134, 239, 172, 0.85)', '#f0fdf4'],
    motion: 'drift',
  },
  {
    token: ':heavybreathing_chicken_3:',
    label: 'HB Chicken Grin',
    colors: ['rgba(250, 204, 21, 0.92)', 'rgba(249, 115, 22, 0.82)', 'rgba(253, 224, 71, 0.85)', '#fffbeb'],
    motion: 'pulse',
  },
  {
    token: ':heavybreathing_chicken_6:',
    label: 'HB Chicken Panic',
    colors: ['rgba(248, 113, 113, 0.92)', 'rgba(239, 68, 68, 0.82)', 'rgba(252, 165, 165, 0.85)', '#fff5f5'],
    motion: 'spark',
  },
];

const FEATURED_HEAVYBREATHING_CHICKEN_EMOTES = FEATURED_HEAVYBREATHING_CHICKEN_CONFIG
  .map((entry) => {
    const match = HEAVYBREATHING_CHICKEN_EMOJIS.find((emoji) => emoji.token === entry.token);
    if (!match) return null;
    return {
      ...entry,
      image: match.image,
      variant: 'sticker',
      trayGroup: 'Featured HB Chicken',
    };
  })
  .filter(Boolean);

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
  {
    token: ':shinsa_sss_ez:',
    icon: 'SSS',
    label: 'SSS EZ',
    colors: ['rgba(250, 204, 21, 0.92)', 'rgba(245, 158, 11, 0.82)', 'rgba(253, 224, 71, 0.85)', '#fffbeb'],
    motion: 'spark',
  },
  {
    token: ':shinsa_speed:',
    icon: '💨',
    label: 'Speed',
    colors: ['rgba(59, 130, 246, 0.92)', 'rgba(37, 99, 235, 0.82)', 'rgba(147, 197, 253, 0.85)', '#eff6ff'],
    motion: 'drift',
  },
  {
    token: ':shinsa_stamina:',
    icon: '🫀',
    label: 'Stamina',
    colors: ['rgba(239, 68, 68, 0.92)', 'rgba(220, 38, 38, 0.82)', 'rgba(252, 165, 165, 0.85)', '#fff1f2'],
    motion: 'pulse',
  },
  {
    token: ':shinsa_cheater:',
    icon: '👀',
    label: 'Cheater!',
    colors: ['rgba(168, 85, 247, 0.92)', 'rgba(236, 72, 153, 0.82)', 'rgba(216, 180, 254, 0.85)', '#faf5ff'],
    motion: 'spark',
  },
  ...FEATURED_DOJO_CAT_EMOTES,
  ...FEATURED_DEVIT_EMOTES,
  ...FEATURED_HEAVYBREATHING_CHICKEN_EMOTES,
  ...FEATURED_HEAVYBREATHING_EMOTES,
];

export const LIVE_EMOJI_GROUPS = [
  { label: 'Quick', emojis: ['🔥', '💪', '👏', '😂', '❤️', '⚡'] },
  { label: 'Crowd', emojis: ['🙌', '🫡', '👀', '💯', '🚀', '🎉'] },
];

export const LIVE_EMOTE_TRAY_GROUPS = [
  {
    label: 'Shinsa Emotes',
    description: '',
    emotes: LIVE_EMOTES.filter((emote) => emote.variant !== 'sticker'),
  },
  {
    label: 'Featured DojoCat',
    description: '',
    emotes: LIVE_EMOTES.filter((emote) => emote.trayGroup === 'Featured DojoCat'),
  },
  {
    label: 'Featured Devit',
    description: '',
    emotes: LIVE_EMOTES.filter((emote) => emote.trayGroup === 'Featured Devit'),
  },
  {
    label: 'Featured HB Chicken',
    description: '',
    emotes: LIVE_EMOTES.filter((emote) => emote.trayGroup === 'Featured HB Chicken'),
  },
  {
    label: 'Featured Heavy Breathing',
    description: '',
    emotes: LIVE_EMOTES.filter((emote) => emote.trayGroup === 'Featured Heavy Breathing'),
  },
];

const LIVE_EMOTE_MAP = LIVE_EMOTES.reduce((acc, emote) => {
  acc[emote.token] = emote;
  return acc;
}, {});

const LIVE_EMOTE_TOKEN_REGEX = /(:[a-z0-9_]+:)/gi;

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

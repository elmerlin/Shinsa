const DOJO_CAT_FILE_NAMES = [
  '1-0', '1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8',
  '2-0', '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8',
  '3-0', '3-1', '3-2', '3-4', '3-5', '3-6', '3-7', '3-8', '3-9',
  '4-0', '4-1', '4-2', '4-3', '4-4', '4-5', '4-6', '4-7', '4-8', '4-9',
  '5-0', '5-1', '5-2', '5-3', '5-4', '5-5', '5-6', '5-7', '5-8',
  '6-0', '6-1', '6-2', '6-3', '6-4', '6-5', '6-6', '6-7', '6-8',
  '7-0', '7-1', '7-2', '7-3', '7-4', '7-5', '7-6', '7-7', '7-8',
];

const DEVIT_STICKER_CONFIG = [
  { key: 'idle', label: 'Devit Idle', image: '/emojis/devit/idle.png', animated: true },
  { key: 'scamper', label: 'Devit Scamper', image: '/emojis/devit/scamper.png', animated: true },
  { key: 'cheer', label: 'Devit Cheer', image: '/emojis/devit/cheer.png', animated: true },
  { key: 'hop', label: 'Devit Hop', image: '/emojis/devit/hop.png', animated: true },
  { key: 'prance', label: 'Devit Prance', image: '/emojis/devit/prance.png', animated: true },
  { key: 'grin', label: 'Devit Grin', image: '/emojis/devit/grin.png', animated: true },
];

const HEAVYBREATHING_STICKER_CONFIG = [
  { key: 'heavybreathing', label: 'Heavy Breathing', image: '/emojis/heavybreathing/heavybreathing.png', animated: true },
];

export const DOJO_CAT_EMOJIS = DOJO_CAT_FILE_NAMES.map((fileName) => {
  const token = `:dojocat_${fileName.replace('-', '_')}:`;
  return {
    id: `dojocat-${fileName}`,
    pack: 'dojocat',
    token,
    fileName,
    label: `DojoCat ${fileName}`,
    image: `/emojis/dojocat/${fileName}.png`,
    animated: false,
  };
});

export const DEVIT_EMOJIS = DEVIT_STICKER_CONFIG.map((entry) => ({
  id: `devit-${entry.key}`,
  pack: 'devit',
  token: `:devit_${entry.key}:`,
  fileName: entry.key,
  label: entry.label,
  image: entry.image,
  animated: !!entry.animated,
}));

export const HEAVYBREATHING_EMOJIS = HEAVYBREATHING_STICKER_CONFIG.map((entry) => ({
  id: `heavybreathing-${entry.key}`,
  pack: 'heavybreathing',
  token: ':heavybreathing:',
  fileName: entry.key,
  label: entry.label,
  image: entry.image,
  animated: !!entry.animated,
}));

export const DOJO_CAT_EMOJI_GROUP = {
  label: 'DojoCat',
  emojis: DOJO_CAT_EMOJIS,
};

export const DEVIT_EMOJI_GROUP = {
  label: 'Devit',
  emojis: DEVIT_EMOJIS,
};

export const HEAVYBREATHING_EMOJI_GROUP = {
  label: 'Heavy Breathing',
  emojis: HEAVYBREATHING_EMOJIS,
};

export const STICKER_GROUPS = [
  DOJO_CAT_EMOJI_GROUP,
  DEVIT_EMOJI_GROUP,
  HEAVYBREATHING_EMOJI_GROUP,
];

export const STICKER_TOKEN_PATTERN = ':(?:dojocat_[0-9]+_[0-9]+|devit_[a-z0-9_]+|heavybreathing):';
export const STICKER_TOKEN_REGEX = /:(?:dojocat_[0-9]+_[0-9]+|devit_[a-z0-9_]+|heavybreathing):/gi;
export const DOJO_CAT_TOKEN_REGEX = /:dojocat_[0-9]+_[0-9]+:/gi;

const STICKER_MAP = [...DOJO_CAT_EMOJIS, ...DEVIT_EMOJIS, ...HEAVYBREATHING_EMOJIS].reduce((acc, emoji) => {
  acc[emoji.token] = emoji;
  return acc;
}, {});

export function getStickerEmoji(token) {
  return STICKER_MAP[String(token || '').trim().toLowerCase()] || null;
}

export function getDojoCatEmoji(token) {
  const sticker = getStickerEmoji(token);
  return sticker?.pack === 'dojocat' ? sticker : null;
}

export function isStickerOnlyMessage(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const stickers = raw.match(STICKER_TOKEN_REGEX) || [];
  if (stickers.length === 0) return false;
  return raw.replace(STICKER_TOKEN_REGEX, '').trim() === '';
}

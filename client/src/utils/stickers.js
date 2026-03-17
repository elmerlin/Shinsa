const DOJO_CAT_FILE_NAMES = [
  '1-0', '1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8',
  '2-0', '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8',
  '3-0', '3-1', '3-2', '3-4', '3-5', '3-6', '3-7', '3-8', '3-9',
  '4-0', '4-1', '4-2', '4-3', '4-4', '4-5', '4-6', '4-7', '4-8', '4-9',
  '5-0', '5-1', '5-2', '5-3', '5-4', '5-5', '5-6', '5-7', '5-8',
  '6-0', '6-1', '6-2', '6-3', '6-4', '6-5', '6-6', '6-7', '6-8',
  '7-0', '7-1', '7-2', '7-3', '7-4', '7-5', '7-6', '7-7', '7-8',
];

const HEAVYBREATHING_CHICKEN_FILE_NAMES = [
  '0', '1', '2', '3', '4', '5', '6',
];

const BUU_FILE_NAMES = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
];

const BUUU_FILE_NAMES = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11',
];

const BUU_HOP_DRESSUP_FILE_NAMES = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11',
];

const BUU_HOP_POWER_RANGERS_FILE_NAMES = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11',
];

const BUU_HOP_SANDBAGGING_FILE_NAMES = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11',
];

const MOPE_FLOWER_STICKER_CONFIG = [
  { key: '1', label: 'Mope Flower 1', spriteRow: 0 },
  { key: '2', label: 'Mope Flower 2', spriteRow: 1 },
  { key: '3', label: 'Mope Flower 3', spriteRow: 2 },
  { key: '4', label: 'Mope Flower 4', spriteRow: 3 },
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

const VEGETACAT_STICKER_CONFIG = [
  {
    key: 'scouter',
    label: 'What does the scouter say?',
    image: '/emojis/vegetacat/scouter.gif',
    animated: true,
  },
  {
    key: 'over_9000',
    label: "It's over 9000!",
    image: '/emojis/vegetacat/over_9000.gif',
    animated: true,
  },
  {
    key: 'hold_back',
    label: "Don't you dare hold back!",
    image: '/emojis/vegetacat/hold_back.gif',
    animated: true,
  },
  {
    key: 'prince',
    label: 'Bow before your Prince!',
    image: '/emojis/vegetacat/prince.gif',
    animated: true,
  },
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

export const HEAVYBREATHING_CHICKEN_EMOJIS = HEAVYBREATHING_CHICKEN_FILE_NAMES.map((fileName) => ({
  id: `heavybreathing-chicken-${fileName}`,
  pack: 'heavybreathing_chicken',
  token: `:heavybreathing_chicken_${fileName}:`,
  fileName,
  label: `Heavy Breathing Chicken ${fileName}`,
  image: `/emojis/heavybreathing_chicken/heavybreathing_chicken-${fileName}.png`,
  animated: false,
}));

export const BUU_EMOJIS = BUU_FILE_NAMES.map((fileName) => ({
  id: `buu-${fileName}`,
  pack: 'buu',
  token: `:buu_${fileName}:`,
  fileName,
  label: `Buu ${fileName}`,
  image: `/emojis/buu/buu-${fileName}.png`,
  animated: false,
}));

export const BUUU_EMOJIS = BUUU_FILE_NAMES.map((fileName) => ({
  id: `buuu-${fileName}`,
  pack: 'buuu',
  token: `:buuu_${fileName}:`,
  fileName,
  label: `Buuu ${fileName}`,
  image: `/emojis/buu/buuu-${fileName}.${Number.parseInt(fileName, 10) >= 10 ? 'PNG' : 'png'}`,
  animated: false,
}));

export const BUU_HOP_DRESSUP_EMOJIS = BUU_HOP_DRESSUP_FILE_NAMES.map((fileName) => ({
  id: `buu-hop-dressup-${fileName}`,
  pack: 'buu_hop_dressup',
  token: `:buu_hop_dressup_${fileName}:`,
  fileName,
  label: `Buu HoP Dress Up ${fileName}`,
  image: `/emojis/buu_hop_dressup/buu-hop-dressup-${fileName}.png`,
  animated: false,
}));

export const BUU_HOP_POWER_RANGERS_EMOJIS = BUU_HOP_POWER_RANGERS_FILE_NAMES.map((fileName) => ({
  id: `buu-hop-power-rangers-${fileName}`,
  pack: 'buu_hop_power_rangers',
  token: `:buu_hop_power_rangers_${fileName}:`,
  fileName,
  label: `Buu HoP Power Rangers ${fileName}`,
  image: `/emojis/buu_hop_power_rangers/buu-hop-power-rangers-${fileName}.png`,
  animated: false,
}));

export const BUU_HOP_SANDBAGGING_EMOJIS = BUU_HOP_SANDBAGGING_FILE_NAMES.map((fileName) => ({
  id: `buu-hop-sandbagging-${fileName}`,
  pack: 'buu_hop_sandbagging',
  token: `:buu_hop_sandbagging_${fileName}:`,
  fileName,
  label: `Buu HoP Sandbagging ${fileName}`,
  image: `/emojis/buu_hop_sandbagging/buu-hop-sandbagging-${fileName}.png`,
  animated: false,
}));

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

export const VEGETACAT_EMOJIS = VEGETACAT_STICKER_CONFIG.map((entry) => ({
  id: `vegetacat-${entry.key}`,
  pack: 'vegetacat',
  token: `:vegetacat_${entry.key}:`,
  fileName: entry.key,
  label: entry.label,
  image: entry.image,
  animated: !!entry.animated,
}));

export const MOPE_FLOWER_EMOJIS = MOPE_FLOWER_STICKER_CONFIG.map((entry) => ({
  id: `mope-flower-${entry.key}`,
  pack: 'mope_flower',
  token: `:mope_flower_${entry.key}:`,
  fileName: entry.key,
  label: entry.label,
  image: `/emojis/mope_flower/mope-flower-${entry.key}.gif`,
  animated: true,
}));

export const DOJO_CAT_EMOJI_GROUP = {
  label: 'DojoCat',
  emojis: DOJO_CAT_EMOJIS,
};

export const DEVIT_EMOJI_GROUP = {
  label: 'Devit',
  emojis: DEVIT_EMOJIS,
};

export const HEAVYBREATHING_CHICKEN_EMOJI_GROUP = {
  label: 'Heavy Breathing Chicken',
  emojis: HEAVYBREATHING_CHICKEN_EMOJIS,
};

export const BUU_EMOJI_GROUP = {
  label: 'Buu',
  emojis: BUU_EMOJIS,
};

export const BUUU_EMOJI_GROUP = {
  label: 'Buuu',
  emojis: BUUU_EMOJIS,
};

export const BUU_HOP_DRESSUP_EMOJI_GROUP = {
  label: 'Buu HoP Dress Up',
  emojis: BUU_HOP_DRESSUP_EMOJIS,
};

export const BUU_HOP_POWER_RANGERS_EMOJI_GROUP = {
  label: 'Buu HoP Power Rangers',
  emojis: BUU_HOP_POWER_RANGERS_EMOJIS,
};

export const BUU_HOP_SANDBAGGING_EMOJI_GROUP = {
  label: 'Buu HoP Sandbagging',
  emojis: BUU_HOP_SANDBAGGING_EMOJIS,
};

export const HEAVYBREATHING_EMOJI_GROUP = {
  label: 'Heavy Breathing',
  emojis: HEAVYBREATHING_EMOJIS,
};

export const VEGETACAT_EMOJI_GROUP = {
  label: 'VegetaCat',
  emojis: VEGETACAT_EMOJIS,
};

export const MOPE_FLOWER_EMOJI_GROUP = {
  label: 'Mope Flower',
  emojis: MOPE_FLOWER_EMOJIS,
};

export const STICKER_GROUPS = [
  DOJO_CAT_EMOJI_GROUP,
  DEVIT_EMOJI_GROUP,
  HEAVYBREATHING_CHICKEN_EMOJI_GROUP,
  BUU_EMOJI_GROUP,
  BUUU_EMOJI_GROUP,
  BUU_HOP_DRESSUP_EMOJI_GROUP,
  BUU_HOP_POWER_RANGERS_EMOJI_GROUP,
  BUU_HOP_SANDBAGGING_EMOJI_GROUP,
  HEAVYBREATHING_EMOJI_GROUP,
  VEGETACAT_EMOJI_GROUP,
  MOPE_FLOWER_EMOJI_GROUP,
];

export const STICKER_TOKEN_PATTERN = ':(?:dojocat_[0-9]+_[0-9]+|devit_[a-z0-9_]+|heavybreathing_chicken_[0-9]+|buu_[0-9]+|buuu_[0-9]+|buu_hop_dressup_[0-9]+|buu_hop_power_rangers_[0-9]+|buu_hop_sandbagging_[0-9]+|heavybreathing|vegetacat_[a-z0-9_]+|mope_flower_[0-9]+):';
export const STICKER_TOKEN_REGEX = /:(?:dojocat_[0-9]+_[0-9]+|devit_[a-z0-9_]+|heavybreathing_chicken_[0-9]+|buu_[0-9]+|buuu_[0-9]+|buu_hop_dressup_[0-9]+|buu_hop_power_rangers_[0-9]+|buu_hop_sandbagging_[0-9]+|heavybreathing|vegetacat_[a-z0-9_]+|mope_flower_[0-9]+):/gi;
export const DOJO_CAT_TOKEN_REGEX = /:dojocat_[0-9]+_[0-9]+:/gi;

const STICKER_MAP = [
  ...DOJO_CAT_EMOJIS,
  ...DEVIT_EMOJIS,
  ...HEAVYBREATHING_CHICKEN_EMOJIS,
  ...BUU_EMOJIS,
  ...BUUU_EMOJIS,
  ...BUU_HOP_DRESSUP_EMOJIS,
  ...BUU_HOP_POWER_RANGERS_EMOJIS,
  ...BUU_HOP_SANDBAGGING_EMOJIS,
  ...HEAVYBREATHING_EMOJIS,
  ...VEGETACAT_EMOJIS,
  ...MOPE_FLOWER_EMOJIS,
].reduce((acc, emoji) => {
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

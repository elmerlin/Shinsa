export const BIOME_UI = {
  grasslands: {
    label: 'Grasslands',
    badge: 'Food +25%',
    ground: ['#244d2e', '#2c5b34', '#386e40'],
    water: '#2b84a3',
    tree: '#2f6d39',
    rock: '#6a6e73',
    bush: '#587d34',
  },
  forest: {
    label: 'Forest',
    badge: 'Wood +25%',
    ground: ['#1d3f2b', '#244932', '#315842'],
    water: '#2a6d8a',
    tree: '#214f2a',
    rock: '#5e6a61',
    bush: '#467035',
  },
  coastal: {
    label: 'Coastal',
    badge: 'Food +25%',
    ground: ['#99784f', '#b28f63', '#7ea584'],
    water: '#3c95b2',
    tree: '#4e7a47',
    rock: '#8d8a86',
    bush: '#86a35e',
  },
  mountain: {
    label: 'Mountain',
    badge: 'Stone +25%',
    ground: ['#4b4a47', '#5b5954', '#6a675f'],
    water: '#416d8b',
    tree: '#4b6a45',
    rock: '#85817a',
    bush: '#6f7a57',
  },
  desert: {
    label: 'Desert',
    badge: 'Gold +25%',
    ground: ['#9a7a45', '#b88e53', '#c89f65'],
    water: '#4b9bb1',
    tree: '#7b8f47',
    rock: '#8e7b5c',
    bush: '#a0a458',
  },
  tropical: {
    label: 'Tropical',
    badge: 'Cloth +25%',
    ground: ['#2d6a47', '#2f8459', '#47a36b'],
    water: '#2b8fb8',
    tree: '#2d7d3d',
    rock: '#6f7b73',
    bush: '#7ac363',
  },
  tundra: {
    label: 'Tundra',
    badge: 'Stone +25%',
    ground: ['#d8e1ea', '#c3d0de', '#eef3f8'],
    water: '#7fb7d2',
    tree: '#50715e',
    rock: '#8a949f',
    bush: '#8ea27e',
  },
  volcanic: {
    label: 'Volcanic',
    badge: 'Gold +25%',
    ground: ['#3c3030', '#4a3a38', '#5a4640'],
    water: '#9f4d2d',
    tree: '#5f4a42',
    rock: '#80726a',
    bush: '#7b624a',
  },
};

export function getBiomeUi(biome) {
  return BIOME_UI[biome] || BIOME_UI.grasslands;
}

export function getTilePalette(biome, tileType) {
  const biomeUi = getBiomeUi(biome);
  if (tileType === 'water') return { fill: biomeUi.water, detail: 'rgba(255,255,255,0.18)' };
  if (tileType === 'tree') return { fill: biomeUi.tree, detail: 'rgba(12,24,12,0.26)' };
  if (tileType === 'rock') return { fill: biomeUi.rock, detail: 'rgba(255,255,255,0.12)' };
  if (tileType === 'bush') return { fill: biomeUi.bush, detail: 'rgba(255,255,255,0.1)' };
  const grounds = biomeUi.ground;
  const hash = String(tileType || '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return { fill: grounds[hash % grounds.length], detail: 'rgba(255,255,255,0.08)' };
}

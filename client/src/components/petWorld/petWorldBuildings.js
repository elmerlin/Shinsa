export const BUILDING_UI = {
  farm: { icon: '🌾', accent: 'emerald', category: 'Food' },
  house: { icon: '🏠', accent: 'amber', category: 'Housing' },
  well: { icon: '🪣', accent: 'sky', category: 'Support' },
  fishing_hut: { icon: '🎣', accent: 'cyan', category: 'Food' },
  woodcutters_hut: { icon: '🪵', accent: 'orange', category: 'Wood' },
  stone_pit: { icon: '🪨', accent: 'slate', category: 'Stone' },
  path: { icon: '🧱', accent: 'stone', category: 'Cosmetic' },
  lumberyard: { icon: '🪚', accent: 'orange', category: 'Wood' },
  quarry: { icon: '⛏️', accent: 'slate', category: 'Stone' },
  weaving_hut: { icon: '🧵', accent: 'fuchsia', category: 'Cloth' },
  market: { icon: '🛍️', accent: 'rose', category: 'Trade' },
  large_house: { icon: '🏘️', accent: 'amber', category: 'Housing' },
  garden: { icon: '🌷', accent: 'pink', category: 'Support' },
  storehouse: { icon: '📦', accent: 'yellow', category: 'Storage' },
  trading_post: { icon: '💰', accent: 'yellow', category: 'Gold' },
  town_hall: { icon: '🏛️', accent: 'blue', category: 'Support' },
  bakery: { icon: '🥖', accent: 'orange', category: 'Food' },
  shrine: { icon: '⛩️', accent: 'violet', category: 'Support' },
  park: { icon: '🌳', accent: 'green', category: 'Support' },
  warehouse: { icon: '🏭', accent: 'yellow', category: 'Storage' },
};

export function getBuildingUi(type) {
  return BUILDING_UI[type] || { icon: '🏗️', accent: 'slate', category: 'Village' };
}

export function getBuildingLabel(building) {
  return building?.name || typeToLabel(building?.type || building?.building_type || '');
}

function typeToLabel(type = '') {
  return String(type)
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

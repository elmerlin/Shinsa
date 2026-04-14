export const BUILDING_UI = {
  farm:            { icon: '\uD83C\uDF3E', accent: '#6abe45', category: 'Food',    roofColor: '#7a5a30', wallColor: '#c8a862' },
  house:           { icon: '\uD83C\uDFE0', accent: '#d4a050', category: 'Housing', roofColor: '#8b4a2a', wallColor: '#c8b896' },
  well:            { icon: '\uD83E\uDEA3', accent: '#5ab8d4', category: 'Support', roofColor: '#6a6a6a', wallColor: '#a0a0a0' },
  fishing_hut:     { icon: '\uD83C\uDFA3', accent: '#40b8c8', category: 'Food',    roofColor: '#5a4a3a', wallColor: '#8a7a6a' },
  woodcutters_hut: { icon: '\uD83E\uDEB5', accent: '#c87a3a', category: 'Wood',    roofColor: '#6a4a2a', wallColor: '#a08060' },
  stone_pit:       { icon: '\uD83E\uDEA8', accent: '#8a8a8e', category: 'Stone',   roofColor: '#5a5a5e', wallColor: '#909498' },
  path:            { icon: '\uD83E\uDDF1', accent: '#8a8578', category: 'Cosmetic',roofColor: '#7a7568', wallColor: '#a09888' },
  fence:           { icon: '\uD83E\uDE9C', accent: '#8a6a42', category: 'Cosmetic',roofColor: '#6a4a2a', wallColor: '#a08060' },
  lumberyard:      { icon: '\uD83E\uDE9A', accent: '#c87a3a', category: 'Wood',    roofColor: '#6a4a2a', wallColor: '#b89060' },
  quarry:          { icon: '\u26CF\uFE0F', accent: '#7a7a80', category: 'Stone',   roofColor: '#4a4a50', wallColor: '#8a8a90' },
  weaving_hut:     { icon: '\uD83E\uDDF5', accent: '#c050a0', category: 'Cloth',   roofColor: '#6a3a5a', wallColor: '#b08a98' },
  market:          { icon: '\uD83D\uDECD\uFE0F', accent: '#e05060', category: 'Trade',   roofColor: '#c83a3a', wallColor: '#d8b878' },
  large_house:     { icon: '\uD83C\uDFD8\uFE0F', accent: '#d4a050', category: 'Housing', roofColor: '#7a4228', wallColor: '#c0a880' },
  garden:          { icon: '\uD83C\uDF37', accent: '#e890b0', category: 'Support', roofColor: '#5a7a3a', wallColor: '#80a858' },
  storehouse:      { icon: '\uD83D\uDCE6', accent: '#d8c040', category: 'Storage', roofColor: '#8a4a2a', wallColor: '#b8986a' },
  trading_post:    { icon: '\uD83D\uDCB0', accent: '#e8c830', category: 'Gold',    roofColor: '#5a3a1a', wallColor: '#c8a868' },
  town_hall:       { icon: '\uD83C\uDFDB\uFE0F', accent: '#4080d0', category: 'Support', roofColor: '#3a4a6a', wallColor: '#b8c0d0' },
  bakery:          { icon: '\uD83E\uDD56', accent: '#e0883a', category: 'Food',    roofColor: '#8a4a2a', wallColor: '#d8b880' },
  shrine:          { icon: '\u26E9\uFE0F', accent: '#9060c8', category: 'Support', roofColor: '#4a3a6a', wallColor: '#a898c0' },
  park:            { icon: '\uD83C\uDF33', accent: '#4aaa5a', category: 'Support', roofColor: '#5a7a40', wallColor: '#7aaa58' },
  warehouse:       { icon: '\uD83C\uDFED', accent: '#d8c040', category: 'Storage', roofColor: '#5a5a5e', wallColor: '#909498' },
  flower_bed:      { icon: '\uD83C\uDF3B', accent: '#e890b0', category: 'Cosmetic', roofColor: '#5a7a3a', wallColor: '#80a858' },
  watchtower:      { icon: '\uD83D\uDDFC', accent: '#7a6a58', category: 'Support', roofColor: '#5a4a3a', wallColor: '#8a7a6a' },
  tavern:          { icon: '\uD83C\uDF7A', accent: '#d8a840', category: 'Support', roofColor: '#6a3a2a', wallColor: '#c8a870' },
};

/** Size lookup for ghost preview in canvas (mirrors server BUILDINGS). */
export const BUILDING_SIZES = {
  farm:            { width: 2, height: 2 },
  house:           { width: 2, height: 2 },
  well:            { width: 1, height: 1 },
  fishing_hut:     { width: 2, height: 1 },
  woodcutters_hut: { width: 1, height: 1 },
  stone_pit:       { width: 1, height: 1 },
  path:            { width: 1, height: 1 },
  fence:           { width: 1, height: 1 },
  lumberyard:      { width: 2, height: 2 },
  quarry:          { width: 2, height: 2 },
  weaving_hut:     { width: 2, height: 2 },
  market:          { width: 2, height: 2 },
  large_house:     { width: 3, height: 2 },
  garden:          { width: 1, height: 1 },
  storehouse:      { width: 2, height: 2 },
  trading_post:    { width: 2, height: 2 },
  town_hall:       { width: 3, height: 3 },
  bakery:          { width: 2, height: 2 },
  shrine:          { width: 2, height: 2 },
  park:            { width: 3, height: 3 },
  warehouse:       { width: 3, height: 2 },
  flower_bed:      { width: 1, height: 1 },
  watchtower:      { width: 1, height: 1 },
  tavern:          { width: 2, height: 2 },
};

export function getBuildingUi(type) {
  return BUILDING_UI[type] || { icon: '\uD83C\uDFD7\uFE0F', accent: '#8a8a8e', category: 'Village', roofColor: '#5a5a5e', wallColor: '#909498' };
}

export function getBuildingSize(type) {
  return BUILDING_SIZES[type] || { width: 1, height: 1 };
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

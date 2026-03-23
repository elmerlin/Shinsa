// World Map Data — 16-bit pixel art style (Super Mario World overworld aesthetic)
// Grid: 220 columns × 124 rows, equirectangular projection
// Each character = one 10×10 pixel tile
// Col 0 = -180° lng, Col 219 = +180° lng
// Row 0 = 90° lat (North Pole), Row 123 = -90° lat (South Pole)

export const PIXEL_TILE = 10;
export const MAP_WIDTH = 2200;
export const MAP_HEIGHT = 1240;

// Terrain palette — bright 16-bit SNES colors
export const TERRAIN_PALETTE = {
  G: '#5fce38', // Grassland
  g: '#8bdd58', // Light grass / coastal plains
  F: '#2d9c20', // Forest / dense vegetation
  D: '#e8c84a', // Desert
  d: '#f0d878', // Light desert / arid edge
  M: '#8c7860', // Mountain
  m: '#d8d0c8', // Mountain peak / snow cap
  S: '#e8eef0', // Snow / tundra
  s: '#c0d0d8', // Snow shadow
  J: '#38a830', // Jungle / tropical
  j: '#50b840', // Jungle light
  A: '#c8b050', // Savanna
  a: '#d8c868', // Savanna light
  B: '#f0e090', // Beach / sandy coast
  I: '#d0e8f0', // Ice
};

// Build the world grid programmatically for accuracy and maintainability.
// Each continent is defined via horizontal spans: [row, colStart, colEnd, terrainChar]
function buildWorldGrid() {
  const H = 124;
  const W = 220;
  const grid = [];
  for (let r = 0; r < H; r++) grid.push(new Array(W).fill('.'));

  function span(row, c1, c2, ch) {
    if (row < 0 || row >= H) return;
    const s = Math.max(0, c1);
    const e = Math.min(W - 1, c2);
    for (let c = s; c <= e; c++) grid[row][c] = ch;
  }

  // ===== GREENLAND =====
  // ~60-84°N, ~73-12°W → rows 4-21, cols 66-103
  span(4, 91, 94, 'I');
  span(5, 89, 96, 'I');
  span(6, 87, 98, 'I');
  span(7, 86, 99, 'I');
  span(8, 85, 100, 'I');
  span(9, 84, 101, 'I');
  span(10, 83, 101, 'I');
  span(11, 83, 100, 'I');
  span(12, 84, 100, 'I');
  span(13, 84, 99, 'I');
  span(14, 85, 98, 'I');
  span(15, 86, 97, 'I');
  span(16, 87, 96, 'I');
  span(17, 88, 95, 'I');
  span(18, 89, 93, 'S');
  span(19, 90, 92, 'S');

  // ===== ICELAND =====
  // ~63-66°N, ~24-13°W → rows 17-19, cols 96-102
  span(17, 97, 102, 'F');
  span(18, 97, 103, 'G');
  span(19, 98, 102, 'G');

  // ===== NORTH AMERICA =====
  // --- Alaska ---
  span(13, 8, 15, 'S');
  span(14, 7, 18, 'S');
  span(15, 6, 20, 'S');
  span(16, 6, 21, 'S');
  span(17, 6, 23, 'S');
  span(18, 7, 25, 'S'); span(18, 19, 25, 'F');
  span(19, 8, 26, 'F'); span(19, 8, 12, 'S');
  span(20, 9, 26, 'F'); span(20, 9, 11, 'S');
  span(21, 11, 25, 'F');

  // --- Canadian Arctic Archipelago (simplified) ---
  span(7, 50, 55, 'S');
  span(8, 48, 58, 'S'); span(8, 61, 65, 'S');
  span(9, 46, 60, 'S'); span(9, 63, 67, 'S');
  span(10, 44, 62, 'S'); span(10, 64, 68, 'S');
  span(11, 42, 66, 'S'); span(11, 68, 70, 'S');
  span(12, 40, 70, 'S');
  span(13, 38, 72, 'S');

  // --- Canada mainland ---
  span(14, 25, 74, 'S');
  span(15, 25, 75, 'S');
  span(16, 25, 75, 'S'); span(16, 35, 75, 'F');
  span(17, 25, 76, 'F'); span(17, 25, 30, 'S');
  span(18, 26, 76, 'F'); span(18, 26, 28, 'S');
  // Hudson Bay gap (~rows 19-25, cols 52-63)
  span(19, 27, 51, 'F'); span(19, 63, 76, 'F'); span(19, 27, 30, 'S');
  span(20, 28, 50, 'F'); span(20, 64, 75, 'F');
  span(21, 29, 49, 'F'); span(21, 64, 74, 'F');
  span(22, 30, 49, 'F'); span(22, 63, 73, 'F');
  span(23, 31, 49, 'F'); span(23, 62, 72, 'F');
  span(24, 32, 50, 'F'); span(24, 60, 71, 'F');
  span(25, 33, 70, 'F');
  span(26, 33, 70, 'F');

  // --- Rocky Mountains through Canada ---
  span(19, 31, 35, 'M'); span(20, 31, 35, 'M'); span(21, 32, 36, 'M');
  span(22, 33, 37, 'M'); span(23, 33, 37, 'M'); span(24, 34, 38, 'M');
  span(25, 34, 38, 'M'); span(26, 35, 39, 'M');

  // --- Continental US ---
  // Northern US (~rows 27-30)
  span(27, 34, 69, 'F'); span(27, 40, 55, 'G'); span(27, 34, 39, 'M');
  span(28, 34, 68, 'G'); span(28, 34, 39, 'M'); span(28, 58, 68, 'F');
  span(29, 34, 67, 'G'); span(29, 34, 38, 'M'); span(29, 60, 67, 'F');
  span(30, 35, 67, 'G'); span(30, 35, 38, 'M'); span(30, 61, 67, 'F');

  // Great Lakes hint (remove a pixel or two)
  grid[27][57] = '.'; grid[27][58] = '.';
  grid[28][56] = '.'; grid[28][57] = '.';
  grid[29][56] = '.';

  // Mid US (~rows 31-36)
  span(31, 35, 66, 'G'); span(31, 35, 38, 'M'); span(31, 62, 66, 'g');
  span(32, 36, 66, 'G'); span(32, 36, 38, 'M'); span(32, 63, 66, 'g');
  span(33, 36, 66, 'G'); span(33, 36, 38, 'M'); span(33, 63, 66, 'g');
  span(34, 37, 66, 'G'); span(34, 37, 39, 'M'); span(34, 64, 66, 'g');
  span(35, 37, 65, 'G'); span(35, 37, 39, 'M');
  span(36, 38, 65, 'G'); span(36, 38, 40, 'M');

  // Southwest desert
  span(33, 38, 43, 'D'); span(34, 38, 44, 'D'); span(35, 38, 44, 'D');
  span(36, 39, 45, 'D'); span(37, 39, 45, 'D');

  // Southern US / Florida
  span(37, 39, 64, 'G'); span(37, 39, 44, 'D');
  span(38, 40, 64, 'G'); span(38, 40, 44, 'D');
  span(39, 41, 63, 'g'); span(39, 41, 44, 'D');
  span(40, 42, 63, 'g'); span(40, 42, 45, 'D');
  span(41, 43, 62, 'g');
  // Florida peninsula
  span(39, 62, 64, 'g');
  span(40, 63, 65, 'g');
  span(41, 63, 65, 'g');
  span(42, 64, 65, 'g');

  // --- Mexico ---
  span(41, 43, 55, 'G'); span(41, 43, 46, 'D');
  span(42, 43, 54, 'G'); span(42, 43, 46, 'D');
  span(43, 43, 53, 'G'); span(43, 43, 45, 'D');
  span(44, 44, 53, 'G');
  span(45, 44, 52, 'G');
  span(46, 44, 52, 'j');
  span(47, 45, 51, 'j');
  span(48, 45, 51, 'J');

  // --- Central America ---
  span(49, 46, 50, 'J');
  span(50, 47, 50, 'J');
  span(51, 48, 50, 'J');
  span(52, 49, 51, 'J');
  span(53, 50, 52, 'J');
  span(54, 51, 53, 'J');

  // --- Caribbean islands ---
  span(42, 60, 62, 'g'); // Cuba
  span(43, 61, 63, 'g'); // Cuba
  span(43, 65, 66, 'g'); // Hispaniola
  span(44, 66, 67, 'g'); // Puerto Rico area

  // ===== SOUTH AMERICA =====
  // Northern SA - Colombia / Venezuela
  span(55, 52, 54, 'J'); // Panama/Colombia
  span(56, 52, 59, 'J');
  span(57, 53, 64, 'J'); span(57, 60, 64, 'j');
  span(58, 54, 68, 'J'); span(58, 62, 68, 'j');
  span(59, 54, 71, 'J'); span(59, 65, 71, 'j');

  // Guyana / Suriname
  span(57, 66, 70, 'J');
  span(58, 67, 72, 'J');
  span(59, 68, 73, 'J');

  // Amazon basin
  span(60, 55, 75, 'J');
  span(61, 55, 77, 'J');
  span(62, 55, 78, 'J');
  span(63, 55, 79, 'J');
  span(64, 56, 80, 'J');
  span(65, 57, 80, 'J');
  span(66, 57, 80, 'J'); span(66, 75, 80, 'j');
  span(67, 58, 79, 'J'); span(67, 74, 79, 'j');

  // Andes mountains (west coast)
  span(56, 52, 54, 'M'); span(57, 53, 55, 'M'); span(58, 54, 55, 'M');
  span(59, 54, 55, 'M'); span(60, 55, 56, 'M'); span(61, 55, 56, 'M');
  span(62, 55, 56, 'M'); span(63, 55, 56, 'M'); span(64, 56, 57, 'M');
  span(65, 57, 58, 'M'); span(66, 57, 58, 'M'); span(67, 58, 59, 'M');
  span(68, 58, 59, 'M'); span(69, 58, 59, 'M'); span(70, 58, 59, 'M');
  span(71, 59, 60, 'M'); span(72, 59, 60, 'M'); span(73, 59, 60, 'M');
  span(74, 60, 61, 'M'); span(75, 60, 61, 'M');

  // Brazil east coast / Atlantic forest
  span(60, 76, 80, 'j'); span(61, 77, 82, 'j');
  span(62, 78, 84, 'j'); span(63, 79, 85, 'j');
  span(64, 80, 85, 'j'); span(65, 80, 85, 'j');

  // SE Brazil / Paraguay / Uruguay
  span(66, 66, 80, 'j'); span(67, 66, 79, 'j');
  span(68, 59, 78, 'G'); span(68, 63, 78, 'j');
  span(69, 59, 77, 'G'); span(69, 65, 77, 'j');
  span(70, 59, 76, 'G'); span(70, 67, 76, 'j');
  span(71, 60, 75, 'G'); span(71, 68, 75, 'j');
  span(72, 60, 74, 'G'); span(72, 69, 74, 'j');
  span(73, 60, 73, 'G'); span(73, 68, 73, 'g');
  span(74, 61, 72, 'G'); span(74, 68, 72, 'g');

  // Argentina / Patagonia
  span(75, 61, 71, 'G'); span(75, 68, 71, 'g');
  span(76, 62, 70, 'G');
  span(77, 62, 69, 'G');
  span(78, 62, 69, 'g');
  span(79, 62, 68, 'g');
  span(80, 63, 67, 'g');
  span(81, 63, 67, 'g');
  span(82, 63, 66, 'g');
  span(83, 63, 66, 'g');
  span(84, 64, 66, 'G');
  span(85, 64, 66, 'G');
  span(86, 64, 65, 'G');
  span(87, 64, 65, 'G');
  span(88, 64, 65, 'S');
  span(89, 64, 65, 'S');
  span(90, 65, 65, 'S'); // Tierra del Fuego

  // ===== EUROPE =====
  // --- Scandinavia ---
  span(13, 114, 117, 'S'); // Northern Norway
  span(14, 113, 119, 'S');
  span(15, 112, 121, 'S');
  span(16, 112, 123, 'S'); span(16, 116, 123, 'F');
  span(17, 112, 125, 'F'); span(17, 112, 114, 'S');
  span(18, 112, 127, 'F');
  span(19, 112, 128, 'F');
  span(20, 112, 129, 'F');
  span(21, 113, 128, 'F');
  span(22, 113, 127, 'F');
  span(23, 114, 127, 'F');

  // --- UK & Ireland ---
  span(23, 106, 108, 'G'); // Ireland
  span(24, 106, 109, 'G'); // Ireland + UK
  span(25, 106, 110, 'G');
  span(26, 107, 110, 'G');
  span(27, 108, 110, 'G'); // Southern England

  // --- Continental Europe ---
  // France, Benelux, Germany
  span(24, 112, 122, 'F');
  span(25, 111, 124, 'G'); span(25, 115, 124, 'F');
  span(26, 111, 126, 'G'); span(26, 118, 126, 'F');
  span(27, 111, 128, 'G'); span(27, 120, 128, 'G');
  span(28, 111, 130, 'G'); span(28, 122, 130, 'G');
  span(29, 109, 131, 'G');
  span(30, 109, 132, 'G');
  span(31, 108, 132, 'G');

  // Iberian Peninsula
  span(32, 104, 110, 'G');
  span(33, 104, 111, 'G');
  span(34, 104, 110, 'G');
  span(35, 104, 110, 'g');
  span(36, 105, 109, 'g');

  // Italy boot
  span(30, 117, 120, 'G');
  span(31, 117, 121, 'G');
  span(32, 118, 121, 'g');
  span(33, 119, 121, 'g');
  span(34, 119, 120, 'g');
  span(35, 119, 120, 'g');
  span(36, 120, 121, 'g');
  span(37, 120, 121, 'g');

  // Alps
  span(29, 115, 119, 'M');
  span(30, 114, 118, 'M');

  // Balkans / Greece / Turkey
  span(31, 122, 130, 'G');
  span(32, 123, 131, 'G');
  span(33, 124, 132, 'G');
  span(34, 125, 133, 'G');
  span(35, 125, 134, 'G');
  span(36, 126, 135, 'G'); span(36, 131, 135, 'g');

  // Greece
  span(35, 126, 128, 'g');
  span(36, 126, 127, 'g');
  span(37, 126, 127, 'g');

  // --- Eastern Europe / western Russia ---
  span(18, 128, 135, 'F');
  span(19, 129, 137, 'F');
  span(20, 130, 139, 'F');
  span(21, 129, 140, 'F');
  span(22, 128, 141, 'F');
  span(23, 128, 142, 'G'); span(23, 133, 142, 'F');
  span(24, 125, 143, 'G'); span(24, 135, 143, 'F');
  span(25, 126, 144, 'G'); span(25, 136, 144, 'F');
  span(26, 128, 145, 'G');
  span(27, 130, 146, 'G');
  span(28, 132, 147, 'G');
  span(29, 133, 147, 'G');
  span(30, 134, 147, 'G');

  // ===== RUSSIA / SIBERIA =====
  span(10, 135, 145, 'S'); // Novaya Zemlya area
  span(11, 130, 150, 'S');
  span(12, 128, 160, 'S');
  span(13, 126, 175, 'S');
  span(14, 125, 185, 'S');
  span(15, 125, 195, 'S');
  span(16, 126, 200, 'S'); span(16, 140, 200, 'F');
  span(17, 128, 205, 'F'); span(17, 128, 135, 'S');
  span(18, 130, 210, 'F'); span(18, 185, 210, 'S');
  span(19, 132, 212, 'F'); span(19, 190, 212, 'S');
  span(20, 134, 214, 'F'); span(20, 195, 214, 'S');
  span(21, 135, 215, 'F'); span(21, 200, 215, 'S');
  span(22, 136, 215, 'F'); span(22, 200, 215, 'S');
  span(23, 138, 214, 'F'); span(23, 195, 214, 'S');
  span(24, 140, 212, 'F'); span(24, 190, 212, 'S');
  span(25, 142, 210, 'F'); span(25, 185, 210, 'S');
  span(26, 143, 208, 'F');
  span(27, 144, 205, 'F');
  span(28, 145, 200, 'G');

  // Kamchatka Peninsula
  span(15, 199, 202, 'S');
  span(16, 200, 204, 'S');
  span(17, 201, 206, 'S');
  span(18, 203, 208, 'S');
  span(19, 205, 209, 'S');
  span(20, 207, 210, 'S');

  // ===== MIDDLE EAST / TURKEY =====
  // Turkey
  span(33, 127, 137, 'G');
  span(34, 127, 138, 'G'); span(34, 134, 138, 'D');
  span(35, 127, 139, 'G'); span(35, 135, 139, 'D');

  // Middle East / Levant / Iraq / Iran
  span(36, 130, 145, 'D');
  span(37, 130, 147, 'D');
  span(38, 130, 149, 'D');
  span(39, 131, 150, 'D');
  span(40, 131, 150, 'D');
  span(41, 131, 150, 'D');

  // Arabian Peninsula
  span(42, 132, 148, 'D');
  span(43, 132, 147, 'D');
  span(44, 133, 146, 'D');
  span(45, 133, 145, 'D');
  span(46, 134, 144, 'D');
  span(47, 134, 143, 'D');
  span(48, 135, 142, 'D');
  span(49, 136, 141, 'D');
  span(50, 137, 140, 'D');
  span(51, 138, 139, 'd');

  // Iran / Afghanistan mountains
  span(37, 145, 151, 'M');
  span(38, 146, 152, 'M');
  span(39, 147, 153, 'M');
  span(40, 147, 153, 'M');
  span(41, 147, 153, 'D');

  // ===== CENTRAL ASIA =====
  span(29, 148, 165, 'G'); span(29, 155, 165, 'D');
  span(30, 148, 168, 'G'); span(30, 155, 168, 'D');
  span(31, 148, 170, 'G'); span(31, 156, 170, 'D');
  span(32, 148, 172, 'G'); span(32, 156, 172, 'D');
  span(33, 148, 174, 'G'); span(33, 158, 174, 'D');
  span(34, 148, 176, 'G'); span(34, 160, 176, 'G');
  span(35, 148, 178, 'G');

  // ===== CHINA / EAST ASIA =====
  span(28, 165, 190, 'G');
  span(29, 168, 192, 'G');
  span(30, 170, 193, 'G');
  span(31, 172, 194, 'G');
  span(32, 173, 194, 'G');
  span(33, 175, 195, 'G');
  span(34, 177, 195, 'G'); span(34, 177, 183, 'F');
  span(35, 178, 195, 'G'); span(35, 178, 183, 'F');
  span(36, 154, 195, 'G'); span(36, 170, 180, 'F');
  span(37, 154, 194, 'G'); span(37, 170, 180, 'F');
  span(38, 155, 193, 'G'); span(38, 165, 178, 'F');
  span(39, 156, 192, 'G');
  span(40, 157, 190, 'G');
  span(41, 158, 188, 'G');

  // Himalayas
  span(36, 155, 168, 'M');
  span(37, 156, 168, 'M');
  span(38, 157, 166, 'M');

  // Tibetan Plateau
  span(33, 158, 172, 'M'); span(33, 162, 172, 'm');
  span(34, 160, 174, 'M'); span(34, 164, 174, 'm');
  span(35, 162, 176, 'M'); span(35, 166, 176, 'm');

  // Mongolia steppe
  span(28, 170, 188, 'G'); span(28, 175, 185, 'A');
  span(29, 172, 190, 'A');
  span(30, 174, 190, 'A');

  // ===== INDIA =====
  span(39, 152, 158, 'A'); // NW India / Thar Desert
  span(40, 151, 160, 'A'); span(40, 151, 154, 'D');
  span(41, 151, 162, 'A');
  span(42, 152, 163, 'A'); span(42, 155, 163, 'G');
  span(43, 153, 164, 'G');
  span(44, 153, 164, 'G');
  span(45, 154, 164, 'G'); span(45, 158, 164, 'J');
  span(46, 155, 163, 'J');
  span(47, 156, 163, 'J');
  span(48, 157, 162, 'J');
  span(49, 158, 161, 'J');
  span(50, 159, 161, 'j');
  span(51, 160, 161, 'j');

  // Sri Lanka
  span(52, 161, 162, 'J');
  span(53, 161, 162, 'J');

  // ===== SOUTHEAST ASIA (mainland) =====
  span(42, 165, 178, 'J');
  span(43, 166, 179, 'J');
  span(44, 167, 180, 'J');
  span(45, 168, 180, 'J');
  span(46, 169, 180, 'J');
  span(47, 170, 179, 'J');
  span(48, 170, 178, 'J');
  span(49, 171, 177, 'J');
  span(50, 172, 176, 'J');
  span(51, 172, 175, 'j');
  span(52, 173, 175, 'j');
  span(53, 173, 175, 'j');
  span(54, 173, 174, 'j');

  // ===== KOREAN PENINSULA =====
  span(33, 187, 189, 'G');
  span(34, 187, 189, 'G');
  span(35, 187, 189, 'F');
  span(36, 188, 189, 'F');
  span(37, 188, 189, 'G');
  span(38, 188, 189, 'g');

  // ===== JAPAN =====
  span(31, 192, 193, 'F'); // Hokkaido
  span(32, 192, 194, 'F');
  span(33, 193, 195, 'F'); // Northern Honshu
  span(34, 193, 196, 'F');
  span(35, 194, 196, 'G');
  span(36, 194, 196, 'G');
  span(37, 195, 197, 'G'); // Southern Honshu
  span(38, 195, 197, 'g'); // Shikoku / Kyushu
  span(39, 196, 197, 'g');

  // ===== TAIWAN =====
  span(39, 190, 191, 'G');
  span(40, 190, 191, 'G');

  // ===== PHILIPPINES =====
  span(48, 183, 185, 'J');
  span(49, 183, 185, 'J');
  span(50, 183, 185, 'J');
  span(51, 184, 186, 'J');
  span(52, 184, 186, 'J');
  span(53, 184, 186, 'j');
  span(54, 185, 186, 'j');
  span(55, 185, 186, 'j');

  // ===== INDONESIA =====
  // Sumatra
  span(56, 176, 180, 'J');
  span(57, 176, 181, 'J');
  span(58, 177, 182, 'J');
  span(59, 178, 183, 'J');
  span(60, 179, 183, 'J');

  // Java
  span(62, 179, 186, 'J');
  span(63, 180, 187, 'J');

  // Borneo
  span(56, 182, 186, 'J');
  span(57, 182, 188, 'J');
  span(58, 182, 189, 'J');
  span(59, 183, 189, 'J');
  span(60, 183, 188, 'J');
  span(61, 184, 188, 'J');

  // Sulawesi
  span(58, 190, 192, 'J');
  span(59, 190, 193, 'J');
  span(60, 191, 193, 'J');
  span(61, 191, 192, 'J');

  // Smaller islands / Lesser Sunda
  span(63, 188, 195, 'j');
  span(64, 189, 196, 'j');

  // Papua / New Guinea
  span(61, 195, 200, 'J');
  span(62, 195, 203, 'J');
  span(63, 196, 205, 'J');
  span(64, 197, 206, 'J');
  span(65, 198, 205, 'J');
  span(66, 199, 204, 'j');

  // ===== AFRICA =====
  // --- North Africa / Sahara ---
  span(35, 110, 120, 'D'); // Morocco / Tunisia
  span(36, 108, 124, 'D');
  span(37, 107, 127, 'D');
  span(38, 106, 129, 'D');
  span(39, 105, 130, 'D');
  span(40, 105, 131, 'D');
  span(41, 105, 131, 'D');
  span(42, 105, 131, 'D');
  span(43, 106, 131, 'D');
  span(44, 106, 132, 'D');
  span(45, 107, 132, 'D');
  span(46, 107, 133, 'D');

  // Morocco west coast
  span(33, 104, 107, 'D');
  span(34, 104, 107, 'D');

  // Sahel transition (south of Sahara)
  span(47, 107, 134, 'A'); span(47, 107, 115, 'd');
  span(48, 108, 135, 'A'); span(48, 108, 114, 'd');
  span(49, 109, 136, 'A');
  span(50, 109, 136, 'A');

  // Horn of Africa (Somalia / Ethiopia / Eritrea)
  span(42, 132, 139, 'D');
  span(43, 132, 140, 'D');
  span(44, 133, 141, 'D');
  span(45, 133, 141, 'A');
  span(46, 133, 141, 'A');
  span(47, 134, 142, 'A');
  span(48, 135, 142, 'A');
  span(49, 136, 142, 'A');
  span(50, 136, 141, 'A');
  span(51, 137, 140, 'a');
  span(52, 137, 139, 'a');

  // West Africa bulge
  span(51, 109, 117, 'J');
  span(52, 108, 118, 'J');
  span(53, 108, 119, 'J');
  span(54, 109, 120, 'J');
  span(55, 110, 121, 'J');

  // Central / Congo basin
  span(56, 112, 130, 'J');
  span(57, 112, 132, 'J');
  span(58, 113, 133, 'J');
  span(59, 114, 134, 'J');
  span(60, 115, 134, 'J');
  span(61, 115, 134, 'J');
  span(62, 116, 134, 'J');
  span(63, 116, 134, 'J');
  span(64, 117, 134, 'J');

  // East Africa
  span(53, 130, 136, 'A');
  span(54, 131, 137, 'A');
  span(55, 131, 137, 'A');
  span(56, 130, 136, 'A');
  span(57, 132, 137, 'A');
  span(58, 133, 138, 'A');
  span(59, 134, 139, 'A');
  span(60, 134, 139, 'A');
  span(61, 134, 139, 'A');
  span(62, 134, 138, 'A');
  span(63, 134, 138, 'A');
  span(64, 134, 137, 'A');

  // Southern Africa
  span(65, 118, 136, 'A');
  span(66, 118, 136, 'A');
  span(67, 119, 135, 'A');
  span(68, 119, 135, 'G'); span(68, 119, 125, 'A');
  span(69, 119, 135, 'G'); span(69, 119, 125, 'A');
  span(70, 120, 134, 'G');
  span(71, 120, 134, 'G');
  span(72, 120, 133, 'G');
  span(73, 121, 133, 'G');
  span(74, 121, 132, 'G');
  span(75, 122, 132, 'G');
  span(76, 122, 131, 'G');
  span(77, 123, 131, 'G');
  span(78, 123, 130, 'G');
  span(79, 124, 130, 'g');
  span(80, 124, 129, 'g');
  span(81, 125, 129, 'g');
  span(82, 125, 128, 'g');
  span(83, 126, 128, 'g');
  span(84, 126, 128, 'g');

  // Kalahari/Namib desert
  span(73, 121, 126, 'D');
  span(74, 121, 126, 'D');
  span(75, 122, 126, 'D');
  span(76, 122, 125, 'D');
  span(77, 123, 125, 'D');

  // --- Madagascar ---
  span(71, 137, 139, 'J');
  span(72, 137, 139, 'J');
  span(73, 137, 139, 'J');
  span(74, 137, 139, 'J');
  span(75, 137, 139, 'j');
  span(76, 138, 139, 'j');
  span(77, 138, 139, 'j');

  // ===== AUSTRALIA =====
  span(71, 185, 194, 'A'); // N. coast / tropical
  span(72, 183, 196, 'A');
  span(73, 182, 198, 'A'); span(73, 185, 195, 'D');
  span(74, 181, 200, 'D'); span(74, 181, 183, 'A'); span(74, 198, 200, 'G');
  span(75, 181, 201, 'D'); span(75, 181, 183, 'A'); span(75, 199, 201, 'G');
  span(76, 181, 202, 'D'); span(76, 200, 202, 'G');
  span(77, 182, 203, 'D'); span(77, 200, 203, 'G');
  span(78, 182, 203, 'D'); span(78, 200, 203, 'G');
  span(79, 183, 203, 'D'); span(79, 200, 203, 'G');
  span(80, 183, 202, 'D'); span(80, 199, 202, 'G');
  span(81, 184, 202, 'G'); span(81, 186, 198, 'D');
  span(82, 184, 201, 'G'); span(82, 188, 197, 'D');
  span(83, 185, 200, 'G');
  span(84, 186, 200, 'G');
  span(85, 187, 199, 'G');
  span(86, 188, 198, 'g');
  span(87, 189, 197, 'g');
  span(88, 190, 196, 'g');

  // Tasmania
  span(89, 196, 198, 'F');
  span(90, 196, 198, 'F');

  // ===== NEW ZEALAND =====
  span(87, 213, 215, 'F'); // North Island
  span(88, 213, 215, 'G');
  span(89, 213, 215, 'G');
  span(90, 214, 215, 'G');
  span(91, 214, 216, 'G'); // South Island
  span(92, 214, 216, 'G');
  span(93, 214, 216, 'G');
  span(94, 214, 215, 'G');
  span(95, 214, 215, 'G');

  // ===== ANTARCTICA =====
  for (let r = 109; r < 124; r++) {
    const spread = Math.min(110, Math.floor((r - 109) * 8));
    span(r, 30 - spread / 3, 50 + spread / 3, 'S');
    span(r, 150 - spread / 2, 210 + spread / 4, 'S');
  }
  // Fill bottom rows solid
  for (let r = 118; r < 124; r++) {
    span(r, 0, 219, 'S');
  }

  return grid.map((row) => row.join(''));
}

// prettier-ignore
export const WORLD_GRID = buildWorldGrid();

// Clouds — positioned for 220x124 grid, pixel tile = 10
export const PIXEL_CLOUDS = [
  {
    id: 'c1',
    x: 18,
    y: 8,
    rows: [
      '...1111...',
      '..111111..',
      '.11111111.',
      '..111111..',
      '...1111...',
    ],
  },
  {
    id: 'c2',
    x: 92,
    y: 10,
    rows: [
      '..11111..',
      '.1111111.',
      '111111111',
      '.1111111.',
      '..11111..',
    ],
  },
  {
    id: 'c3',
    x: 155,
    y: 9,
    rows: [
      '...1111...',
      '..111111..',
      '.11111111.',
      '..111111..',
      '...1111...',
    ],
  },
  {
    id: 'c4',
    x: 50,
    y: 55,
    rows: [
      '..1111..',
      '.111111.',
      '11111111',
      '.111111.',
      '..1111..',
    ],
  },
  {
    id: 'c5',
    x: 180,
    y: 60,
    rows: [
      '..11111..',
      '.1111111.',
      '111111111',
      '.1111111.',
      '..11111..',
    ],
  },
  {
    id: 'c6',
    x: 130,
    y: 80,
    rows: [
      '..1111..',
      '.111111.',
      '11111111',
      '.111111.',
      '..1111..',
    ],
  },
];

// Water sparkles — spread across the 220x124 grid
export const PIXEL_WATER_SPARKLES = [
  [10, 20], [25, 8], [40, 50], [55, 15], [70, 55],
  [85, 10], [100, 45], [115, 25], [130, 55], [145, 8],
  [160, 50], [175, 20], [190, 55], [205, 30], [210, 70],
  [15, 40], [30, 65], [60, 35], [90, 70], [120, 15],
  [150, 65], [180, 40], [200, 85], [45, 90], [75, 85],
  [105, 95], [135, 90], [165, 75], [195, 95], [35, 100],
  [65, 100], [95, 100],
];

// Landmark labels overlaid on the map
export const LANDMARKS = [
  { id: 'nyc', name: 'New York', icon: '🗽', lat: 40.7128, lng: -74.006 },
  { id: 'toronto', name: 'Toronto', icon: '🏙️', lat: 43.6532, lng: -79.3832 },
  { id: 'mexico-city', name: 'Mexico City', icon: '🦅', lat: 19.4326, lng: -99.1332 },
  { id: 'rio', name: 'Rio', icon: '⛪', lat: -22.9068, lng: -43.1729 },
  { id: 'london', name: 'London', icon: '🕰️', lat: 51.5072, lng: -0.1276 },
  { id: 'paris', name: 'Paris', icon: '🗼', lat: 48.8566, lng: 2.3522 },
  { id: 'rome', name: 'Rome', icon: '🏛️', lat: 41.9028, lng: 12.4964 },
  { id: 'cairo', name: 'Cairo', icon: '🔺', lat: 30.0444, lng: 31.2357 },
  { id: 'seoul', name: 'Seoul', icon: '🎆', lat: 37.5665, lng: 126.978 },
  { id: 'tokyo', name: 'Tokyo', icon: '🗺️', lat: 35.6762, lng: 139.6503 },
  { id: 'beijing', name: 'Beijing', icon: '🏯', lat: 39.9042, lng: 116.4074 },
  { id: 'sydney', name: 'Sydney', icon: '🎭', lat: -33.8688, lng: 151.2093 },
];

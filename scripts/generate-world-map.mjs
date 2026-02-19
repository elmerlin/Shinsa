#!/usr/bin/env node
/**
 * Generate world map SVG path data from Natural Earth TopoJSON.
 * Uses 50m resolution for good geographic detail.
 * Output: client/src/utils/worldMapPaths.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath } from 'd3-geo';

// Use 50m for better detail (10m would be too large)
const topoPath = new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url).pathname;
const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
const countries = feature(topo, topo.objects.countries);

// Map dimensions (same coordinate space as before)
const MAP_W = 2200;
const MAP_H = 1240;

const projection = geoEquirectangular()
  .scale(MAP_W / (2 * Math.PI))
  .translate([MAP_W / 2, MAP_H / 2]);

const pathGenerator = geoPath(projection).digits(0);

// Reduce output size by dropping collinear/nearby points while preserving shape.
function simplifyPath(d, tolerance = 1.8) {
  const commands = d.match(/[MLZ][^MLZ]*/g);
  if (!commands) return d;
  const out = [];
  let lastX = null;
  let lastY = null;

  for (const cmd of commands) {
    if (cmd === 'Z') {
      out.push('Z');
      lastX = null;
      lastY = null;
      continue;
    }
    const type = cmd[0];
    const [xRaw, yRaw] = cmd.slice(1).split(',');
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (type === 'M') {
      out.push(`M${x},${y}`);
      lastX = x;
      lastY = y;
      continue;
    }
    if (lastX === null || Math.abs(x - lastX) > tolerance || Math.abs(y - lastY) > tolerance) {
      out.push(`L${x},${y}`);
      lastX = x;
      lastY = y;
    }
  }

  return out.join('');
}

// Biome classification for each country (ISO 3166-1 numeric codes)
// Categories: forest, grassland, desert, jungle, savanna, tundra, ice, mountain, mediterranean
const BIOME_MAP = {
  // North America
  '840': 'forest',      // United States
  '124': 'forest',      // Canada
  '484': 'desert',      // Mexico
  '192': 'jungle',      // Cuba
  '332': 'jungle',      // Haiti
  '214': 'jungle',      // Dominican Republic
  '630': 'jungle',      // Puerto Rico
  '388': 'jungle',      // Jamaica
  '044': 'jungle',      // Bahamas
  '780': 'jungle',      // Trinidad and Tobago
  // Central America
  '084': 'jungle',      // Belize
  '320': 'jungle',      // Guatemala
  '340': 'jungle',      // Honduras
  '222': 'jungle',      // El Salvador
  '558': 'jungle',      // Nicaragua
  '188': 'jungle',      // Costa Rica
  '591': 'jungle',      // Panama
  // South America
  '076': 'jungle',      // Brazil
  '032': 'grassland',   // Argentina
  '152': 'grassland',   // Chile
  '170': 'jungle',      // Colombia
  '604': 'jungle',      // Peru
  '862': 'jungle',      // Venezuela
  '218': 'jungle',      // Ecuador
  '068': 'jungle',      // Bolivia
  '600': 'grassland',   // Paraguay
  '858': 'grassland',   // Uruguay
  '328': 'jungle',      // Guyana
  '740': 'jungle',      // Suriname
  '254': 'jungle',      // French Guiana
  // Europe
  '826': 'grassland',   // United Kingdom
  '372': 'grassland',   // Ireland
  '250': 'grassland',   // France
  '276': 'forest',      // Germany
  '724': 'mediterranean', // Spain
  '620': 'mediterranean', // Portugal
  '380': 'mediterranean', // Italy
  '300': 'mediterranean', // Greece
  '792': 'mediterranean', // Turkey
  '756': 'mountain',    // Switzerland
  '040': 'mountain',    // Austria
  '056': 'grassland',   // Belgium
  '528': 'grassland',   // Netherlands
  '208': 'forest',      // Denmark
  '752': 'forest',      // Sweden
  '578': 'forest',      // Norway
  '246': 'forest',      // Finland
  '352': 'tundra',      // Iceland
  '616': 'forest',      // Poland
  '203': 'forest',      // Czech Republic
  '703': 'forest',      // Slovakia
  '348': 'grassland',   // Hungary
  '642': 'forest',      // Romania
  '100': 'forest',      // Bulgaria
  '688': 'forest',      // Serbia
  '191': 'forest',      // Croatia
  '070': 'forest',      // Bosnia and Herzegovina
  '008': 'mediterranean', // Albania
  '807': 'forest',      // North Macedonia
  '499': 'forest',      // Montenegro
  '705': 'forest',      // Slovenia
  '440': 'forest',      // Lithuania
  '428': 'forest',      // Latvia
  '233': 'forest',      // Estonia
  '804': 'grassland',   // Ukraine
  '112': 'forest',      // Belarus
  '498': 'grassland',   // Moldova
  '442': 'grassland',   // Luxembourg
  // Russia / Central Asia
  '643': 'tundra',      // Russia
  '398': 'desert',      // Kazakhstan
  '860': 'desert',      // Uzbekistan
  '795': 'desert',      // Turkmenistan
  '417': 'mountain',    // Kyrgyzstan
  '762': 'mountain',    // Tajikistan
  '496': 'grassland',   // Mongolia
  // East Asia
  '156': 'forest',      // China
  '392': 'forest',      // Japan
  '410': 'forest',      // South Korea
  '408': 'forest',      // North Korea
  '158': 'jungle',      // Taiwan
  // South/Southeast Asia
  '356': 'jungle',      // India
  '586': 'desert',      // Pakistan
  '004': 'mountain',    // Afghanistan
  '050': 'jungle',      // Bangladesh
  '144': 'jungle',      // Sri Lanka
  '524': 'mountain',    // Nepal
  '064': 'mountain',    // Bhutan
  '104': 'jungle',      // Myanmar
  '764': 'jungle',      // Thailand
  '704': 'jungle',      // Vietnam
  '418': 'jungle',      // Laos
  '116': 'jungle',      // Cambodia
  '458': 'jungle',      // Malaysia
  '360': 'jungle',      // Indonesia
  '608': 'jungle',      // Philippines
  '096': 'jungle',      // Brunei
  '626': 'jungle',      // East Timor
  '702': 'jungle',      // Singapore
  // Middle East
  '364': 'desert',      // Iran
  '368': 'desert',      // Iraq
  '760': 'desert',      // Syria
  '422': 'mediterranean', // Lebanon
  '376': 'desert',      // Israel
  '400': 'desert',      // Jordan
  '682': 'desert',      // Saudi Arabia
  '887': 'desert',      // Yemen
  '512': 'desert',      // Oman
  '784': 'desert',      // UAE
  '634': 'desert',      // Qatar
  '048': 'desert',      // Bahrain
  '414': 'desert',      // Kuwait
  '196': 'mediterranean', // Cyprus
  '268': 'forest',      // Georgia
  '051': 'grassland',   // Armenia
  '031': 'grassland',   // Azerbaijan
  // Africa
  '818': 'desert',      // Egypt
  '434': 'desert',      // Libya
  '788': 'desert',      // Tunisia
  '012': 'desert',      // Algeria
  '504': 'desert',      // Morocco
  '732': 'desert',      // Western Sahara
  '478': 'desert',      // Mauritania
  '466': 'desert',      // Mali
  '562': 'desert',      // Niger
  '148': 'desert',      // Chad
  '736': 'desert',      // Sudan
  '728': 'savanna',     // South Sudan
  '232': 'desert',      // Eritrea
  '262': 'desert',      // Djibouti
  '706': 'desert',      // Somalia
  '231': 'savanna',     // Ethiopia
  '404': 'savanna',     // Kenya
  '800': 'savanna',     // Uganda
  '834': 'savanna',     // Tanzania
  '646': 'savanna',     // Rwanda
  '108': 'savanna',     // Burundi
  '180': 'jungle',      // Democratic Republic of the Congo
  '178': 'jungle',      // Republic of the Congo
  '266': 'jungle',      // Gabon
  '226': 'jungle',      // Equatorial Guinea
  '120': 'jungle',      // Cameroon
  '566': 'jungle',      // Nigeria
  '854': 'savanna',     // Burkina Faso
  '288': 'jungle',      // Ghana
  '384': 'jungle',      // Ivory Coast
  '430': 'jungle',      // Liberia
  '694': 'jungle',      // Sierra Leone
  '624': 'jungle',      // Guinea-Bissau
  '324': 'jungle',      // Guinea
  '686': 'savanna',     // Senegal
  '270': 'savanna',     // Gambia
  '768': 'savanna',     // Togo
  '204': 'savanna',     // Benin
  '140': 'jungle',      // Central African Republic
  '024': 'savanna',     // Angola
  '894': 'savanna',     // Zambia
  '716': 'savanna',     // Zimbabwe
  '508': 'savanna',     // Mozambique
  '454': 'savanna',     // Malawi
  '710': 'grassland',   // South Africa
  '072': 'savanna',     // Botswana
  '516': 'desert',      // Namibia
  '748': 'grassland',   // Eswatini
  '426': 'grassland',   // Lesotho
  '450': 'jungle',      // Madagascar
  // Oceania
  '036': 'desert',      // Australia
  '554': 'forest',      // New Zealand
  '598': 'jungle',      // Papua New Guinea
  '090': 'jungle',      // Solomon Islands
  '242': 'jungle',      // Fiji
  '548': 'jungle',      // Vanuatu
  '540': 'jungle',      // New Caledonia
  // Arctic
  '304': 'ice',         // Greenland
  '010': 'ice',         // Antarctica
  // Svalbard, etc
  '744': 'ice',         // Svalbard
  '574': 'ice',         // Bouvet Island
};

// Color scheme for each biome
const BIOME_COLORS = {
  forest:        { fill: '#3da644', stroke: '#2d8835' },
  grassland:     { fill: '#7ec850', stroke: '#5fad38' },
  desert:        { fill: '#e8c84a', stroke: '#d4b038' },
  jungle:        { fill: '#28993a', stroke: '#1d7a2c' },
  savanna:       { fill: '#c8b050', stroke: '#b09838' },
  tundra:        { fill: '#b8c8cc', stroke: '#98aeb5' },
  ice:           { fill: '#dce8ec', stroke: '#bcd0d8' },
  mountain:      { fill: '#8c8070', stroke: '#706458' },
  mediterranean: { fill: '#92c848', stroke: '#78a838' },
};

const DEFAULT_BIOME = 'grassland';
const EXCLUDED_COUNTRY_IDS = new Set(['010', '260']);
const EXCLUDED_NAME_TOKENS = ['antarctica', 'antarctic'];

// Process each country
const countryPaths = [];
for (const feat of countries.features) {
  const rawId = String(feat.id ?? '');
  const idCode = rawId.padStart(3, '0');
  const name = String(feat.properties?.name || feat.id || '').trim();
  const normalizedName = name.toLowerCase();
  if (!name) continue;
  if (EXCLUDED_COUNTRY_IDS.has(idCode)) continue;
  if (EXCLUDED_NAME_TOKENS.some((token) => normalizedName.includes(token))) continue;

  const rawPath = pathGenerator(feat);
  if (!rawPath || rawPath.length < 10) continue;
  const d = simplifyPath(rawPath, 1.8);
  if (!d || d.length < 10) continue;

  const biome = BIOME_MAP[idCode] || DEFAULT_BIOME;

  countryPaths.push({
    id: feat.id,
    name,
    biome,
    d,
  });
}

// Sort by area (larger countries first, so smaller ones render on top)
countryPaths.sort((a, b) => b.d.length - a.d.length);

// Generate output
const totalChars = countryPaths.reduce((sum, c) => sum + c.d.length, 0);
console.log(`Processed ${countryPaths.length} countries, total path data: ${(totalChars / 1024).toFixed(1)}KB`);

const LANDMARKS = [
  ['vancouver', 'Vancouver', '📍', 49.2827, -123.1207, 'Canada'],
  ['toronto', 'Toronto', '📍', 43.6532, -79.3832, 'Canada'],
  ['montreal', 'Montreal', '📍', 45.5017, -73.5673, 'Canada'],
  ['nyc', 'New York', '📍', 40.7128, -74.006, 'United States'],
  ['mexico-city', 'Mexico City', '📍', 19.4326, -99.1332, 'Mexico'],
  ['bogota', 'Bogota', '📍', 4.711, -74.0721, 'Colombia'],
  ['lima', 'Lima', '📍', -12.0464, -77.0428, 'Peru'],
  ['santiago', 'Santiago', '📍', -33.4489, -70.6693, 'Chile'],
  ['buenos-aires', 'Buenos Aires', '📍', -34.6037, -58.3816, 'Argentina'],
  ['rio', 'Rio', '📍', -22.9068, -43.1729, 'Brazil'],
  ['london', 'London', '📍', 51.5072, -0.1276, 'United Kingdom'],
  ['dublin', 'Dublin', '📍', 53.3498, -6.2603, 'Ireland'],
  ['lisbon', 'Lisbon', '📍', 38.7223, -9.1393, 'Portugal'],
  ['madrid', 'Madrid', '📍', 40.4168, -3.7038, 'Spain'],
  ['paris', 'Paris', '📍', 48.8566, 2.3522, 'France'],
  ['amsterdam', 'Amsterdam', '📍', 52.3676, 4.9041, 'Netherlands'],
  ['brussels', 'Brussels', '📍', 50.8503, 4.3517, 'Belgium'],
  ['berlin', 'Berlin', '📍', 52.52, 13.405, 'Germany'],
  ['copenhagen', 'Copenhagen', '📍', 55.6761, 12.5683, 'Denmark'],
  ['oslo', 'Oslo', '📍', 59.9139, 10.7522, 'Norway'],
  ['stockholm', 'Stockholm', '📍', 59.3293, 18.0686, 'Sweden'],
  ['helsinki', 'Helsinki', '📍', 60.1699, 24.9384, 'Finland'],
  ['warsaw', 'Warsaw', '📍', 52.2297, 21.0122, 'Poland'],
  ['prague', 'Prague', '📍', 50.0755, 14.4378, 'Czechia'],
  ['vienna', 'Vienna', '📍', 48.2082, 16.3738, 'Austria'],
  ['budapest', 'Budapest', '📍', 47.4979, 19.0402, 'Hungary'],
  ['rome', 'Rome', '📍', 41.9028, 12.4964, 'Italy'],
  ['athens', 'Athens', '📍', 37.9838, 23.7275, 'Greece'],
  ['bucharest', 'Bucharest', '📍', 44.4268, 26.1025, 'Romania'],
  ['moscow', 'Moscow', '📍', 55.7558, 37.6173, 'Russia'],
  ['cairo', 'Cairo', '📍', 30.0444, 31.2357, 'Egypt'],
  ['new-delhi', 'New Delhi', '📍', 28.6139, 77.209, 'India'],
  ['mumbai', 'Mumbai', '📍', 19.076, 72.8777, 'India'],
  ['beijing', 'Beijing', '📍', 39.9042, 116.4074, 'China'],
  ['shanghai', 'Shanghai', '📍', 31.2304, 121.4737, 'China'],
  ['hong-kong', 'Hong Kong', '📍', 22.3193, 114.1694, 'Hong Kong'],
  ['taipei', 'Taipei', '📍', 25.033, 121.5654, 'Taiwan'],
  ['seoul', 'Seoul', '📍', 37.5665, 126.978, 'South Korea'],
  ['tokyo', 'Tokyo', '📍', 35.6762, 139.6503, 'Japan'],
  ['singapore', 'Singapore', '📍', 1.3521, 103.8198, 'Singapore'],
  ['kuala-lumpur', 'Kuala Lumpur', '📍', 3.139, 101.6869, 'Malaysia'],
  ['bangkok', 'Bangkok', '📍', 13.7563, 100.5018, 'Thailand'],
  ['manila', 'Manila', '📍', 14.5995, 120.9842, 'Philippines'],
  ['jakarta', 'Jakarta', '📍', -6.2088, 106.8456, 'Indonesia'],
  ['johannesburg', 'Johannesburg', '📍', -26.2041, 28.0473, 'South Africa'],
  ['cape-town', 'Cape Town', '📍', -33.9249, 18.4241, 'South Africa'],
  ['sydney', 'Sydney', '📍', -33.8688, 151.2093, 'Australia'],
  ['auckland', 'Auckland', '📍', -36.8485, 174.7633, 'New Zealand'],
  ['wellington', 'Wellington', '📍', -41.2866, 174.7756, 'New Zealand'],
].map(([id, name, icon, lat, lng, country]) => ({ id, name, icon, lat, lng, country }));

const output = `// Auto-generated world map vector data from Natural Earth 50m
// Generated by scripts/generate-world-map.mjs
// Do not edit manually.

export const MAP_WIDTH = ${MAP_W};
export const MAP_HEIGHT = ${MAP_H};

// Biome color scheme
export const BIOME_COLORS = ${JSON.stringify(BIOME_COLORS, null, 2)};

// Country paths: id, name, biome, SVG path d-string
export const COUNTRY_PATHS = [
${countryPaths.map(c => `  { id: ${JSON.stringify(c.id)}, name: ${JSON.stringify(c.name)}, biome: ${JSON.stringify(c.biome)}, d: ${JSON.stringify(c.d)} },`).join('\n')}
];

// Landmark labels overlaid on the map
export const LANDMARKS = ${JSON.stringify(LANDMARKS, null, 2)};
`;

const outPath = new URL('../client/src/utils/worldMapPaths.js', import.meta.url).pathname;
writeFileSync(outPath, output, 'utf8');
console.log(`Written to ${outPath}`);

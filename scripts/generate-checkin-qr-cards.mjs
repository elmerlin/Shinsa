import fs from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'generated', 'checkin-qrs');

const cards = [
  {
    key: 'machine-1',
    title: 'Machine 1',
    subtitle: 'London Pump Dojo',
    machineLabel: 'Machine 1',
    accent: '#2ad7ff',
    accentSoft: '#123d62',
    targetUrl: 'https://pumpshinsa.com/checkin?venue=london-pump-dojo&machine=1',
  },
  {
    key: 'machine-2',
    title: 'Machine 2',
    subtitle: 'London Pump Dojo',
    machineLabel: 'Machine 2',
    accent: '#ff4d7a',
    accentSoft: '#4c1730',
    targetUrl: 'https://pumpshinsa.com/checkin?venue=london-pump-dojo&machine=2',
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildCardSvg({ title, subtitle, machineLabel, targetUrl, accent, accentSoft, qrMarkup }) {
  const instructionLines = wrapText(
    'Open your camera, scan the code, and Shinsa will take you straight to the correct machine.',
    50
  );
  const instructionLineHeight = 34;
  const instructionStartY = 468;
  const safeQr = qrMarkup.replace(
    /<svg[^>]*viewBox="([^"]+)"[^>]*>/,
    '<svg x="33" y="33" width="312" height="312" viewBox="$1" shape-rendering="crispEdges">'
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(`${subtitle} ${machineLabel} QR`)}</title>
  <desc id="desc">${escapeXml(`Shinsa-styled QR code for checking in to ${machineLabel} at ${subtitle}.`)}</desc>
  <defs>
    <linearGradient id="pageBg" x1="0" y1="0" x2="1400" y2="900" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#080b19"/>
      <stop offset="0.55" stop-color="#07152a"/>
      <stop offset="1" stop-color="#05060f"/>
    </linearGradient>
    <linearGradient id="heroGlow" x1="80" y1="40" x2="620" y2="420" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="cardEdge" x1="120" y1="80" x2="1280" y2="820" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.65"/>
      <stop offset="0.45" stop-color="#273563" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#1a1f3d" stop-opacity="0.3"/>
    </linearGradient>
    <linearGradient id="chipFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${accentSoft}" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="wordGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe27a"/>
      <stop offset="1" stop-color="#ffbe2f"/>
    </linearGradient>
    <linearGradient id="wordIce" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6fbff"/>
      <stop offset="1" stop-color="#abd8ff"/>
    </linearGradient>
    <linearGradient id="slash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#29a5ff"/>
      <stop offset="1" stop-color="#ff2d5e"/>
    </linearGradient>
    <filter id="blurGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="36"/>
    </filter>
  </defs>

  <rect width="1400" height="900" fill="url(#pageBg)"/>
  <circle cx="210" cy="140" r="260" fill="url(#heroGlow)" filter="url(#blurGlow)"/>
  <circle cx="1260" cy="780" r="200" fill="${accent}" opacity="0.10" filter="url(#blurGlow)"/>

  <rect x="58" y="56" width="1284" height="788" rx="40" fill="#071124" fill-opacity="0.94" stroke="url(#cardEdge)" stroke-width="2"/>

  <path d="M110 128H660L626 154H144Z" fill="url(#slash)" opacity="0.38"/>
  <path d="M120 170H600L566 194H154Z" fill="url(#slash)" opacity="0.18"/>

  <g transform="translate(112,112)">
    <rect x="0" y="0" width="86" height="86" rx="16" fill="#0a0d17" stroke="#2b3153" stroke-width="2"/>
    <polygon points="43,7 63,7 79,23 79,63 63,79 23,79 7,63 7,23 23,7" fill="none" stroke="#f4f7ff" stroke-width="2.5"/>
    <polygon points="43,10 61,10 76,25 76,61 61,76 25,76 10,61 10,25 25,10" fill="none" stroke="#ffbf2f" stroke-width="4"/>
    <path d="M20 28H67L57 38H47L62 53V62H17L27 52H37L22 37V28Z" fill="#fbfdff" stroke="#06070d" stroke-width="3" stroke-linejoin="round"/>
  </g>

  <g transform="translate(220,108)">
    <text x="0" y="46" fill="url(#wordGold)" font-family="Rajdhani, Arial, sans-serif" font-size="48" font-weight="700" letter-spacing="2" paint-order="stroke" stroke="#090910" stroke-width="4">PUMP</text>
    <text x="146" y="86" fill="url(#wordIce)" font-family="Rajdhani, Arial, sans-serif" font-size="58" font-weight="700" letter-spacing="2" paint-order="stroke" stroke="#090910" stroke-width="4">SHINSA</text>
  </g>

  <g transform="translate(110,250)">
    <text x="0" y="0" fill="#a5b5e4" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="600">${escapeXml(subtitle)}</text>
    <rect x="0" y="34" width="224" height="50" rx="25" fill="url(#chipFill)" stroke="${accent}" stroke-opacity="0.55"/>
    <text x="26" y="67" fill="#edfbff" font-family="Rajdhani, Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="3">${escapeXml(machineLabel.toUpperCase())}</text>
    <text x="0" y="138" fill="#eef4ff" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">Scan to check in instantly</text>
    ${instructionLines.map((line, index) => `<text x="0" y="${instructionStartY - 250 + (index * instructionLineHeight)}" fill="#90a1cd" font-family="Inter, Arial, sans-serif" font-size="24">${escapeXml(line)}</text>`).join('\n    ')}
  </g>

  <g transform="translate(110,606)">
    <g transform="translate(0,0)">
      <rect x="0" y="0" width="326" height="118" rx="24" fill="#091529" stroke="#1f355f"/>
      <text x="30" y="42" fill="${accent}" font-family="Rajdhani, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="5">STEP 1</text>
      <text x="30" y="84" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700">Scan the QR</text>
    </g>

    <g transform="translate(356,0)">
      <rect x="0" y="0" width="326" height="118" rx="24" fill="#091529" stroke="#1f355f"/>
      <text x="30" y="42" fill="${accent}" font-family="Rajdhani, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="5">STEP 2</text>
      <text x="30" y="84" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700">Confirm on Shinsa</text>
    </g>
  </g>

  <g transform="translate(876,188)">
    <rect x="0" y="0" width="378" height="378" rx="34" fill="#ffffff"/>
    ${safeQr}
  </g>

  <g transform="translate(110,780)">
    <rect x="0" y="0" width="1184" height="34" rx="17" fill="#08111f" stroke="#1c2947"/>
    <circle cx="22" cy="17" r="6" fill="${accent}"/>
    <text x="40" y="23" fill="#8da0cf" font-family="Inter, Arial, sans-serif" font-size="18">Best results come from printing at full size or using the SVG version for crisp edges.</text>
  </g>
</svg>`;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const card of cards) {
    const qrMarkup = await QRCode.toString(card.targetUrl, {
      type: 'svg',
      margin: 0,
      width: 420,
      color: {
        dark: '#081122',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });

    const svg = buildCardSvg({ ...card, qrMarkup });
    const svgPath = path.join(OUTPUT_DIR, `${card.key}.svg`);
    const pngPath = path.join(OUTPUT_DIR, `${card.key}.png`);
    await fs.writeFile(svgPath, svg, 'utf8');
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  }

  const readme = [
    'Shinsa check-in QR cards',
    '',
    ...cards.flatMap((card) => [
      `${card.machineLabel}:`,
      `- URL: ${card.targetUrl}`,
      `- SVG: ${path.join(OUTPUT_DIR, `${card.key}.svg`)}`,
      `- PNG: ${path.join(OUTPUT_DIR, `${card.key}.png`)}`,
      '',
    ]),
  ].join('\n');

  await fs.writeFile(path.join(OUTPUT_DIR, 'README.txt'), readme, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

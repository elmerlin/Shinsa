import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import sharp from 'sharp';

const execFile = promisify(execFileCallback);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'client', 'public', 'hour-of-power', 'VegetaCat.png');
const outputDir = path.join(repoRoot, 'client', 'public', 'emojis', 'vegetacat');

const GRID_COLUMNS = 4;
const GRID_ROWS = 4;
const CANVAS_SIZE = 420;
const FRAME_RATE = 12;
const FRAME_PADDING_TOP = 92;
const FRAME_TARGET_HEIGHT = 300;

const VARIANTS = [
  {
    key: 'scouter',
    label: 'VegetaCat Scouter',
    lines: ['What does the', 'scouter say?'],
    accent: '#39c7ff',
  },
  {
    key: 'over_9000',
    label: 'VegetaCat Over 9000',
    lines: ["It's over", '9000!'],
    accent: '#ffd54a',
  },
  {
    key: 'hold_back',
    label: 'VegetaCat Hold Back',
    lines: ["Don't you dare", 'hold back!'],
    accent: '#ff7a7a',
  },
  {
    key: 'prince',
    label: 'VegetaCat Prince',
    lines: ['Bow before', 'your Prince!'],
    accent: '#b58cff',
  },
];

function buildSpeechBubbleSvg({ lines, accent }) {
  const baseY = lines.length > 2 ? 52 : 58;
  const lineHeight = lines.length > 2 ? 30 : 34;
  const fontSize = lines.some((line) => line.length > 14) ? 24 : 28;
  const textNodes = lines.map((line, index) => (
    `<text x="210" y="${baseY + (index * lineHeight)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#10111e">${line}</text>`
  )).join('');

  return `
    <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="rgba(9,11,28,0.5)"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <path d="M74 18 H346 C366 18 382 34 382 54 V92 C382 112 366 128 346 128 H238 L212 158 L218 128 H74 C54 128 38 112 38 92 V54 C38 34 54 18 74 18 Z" fill="rgba(255,255,255,0.97)" stroke="${accent}" stroke-width="6" />
        <rect x="60" y="34" width="300" height="12" rx="6" fill="${accent}" opacity="0.24" />
      </g>
      ${textNodes}
    </svg>
  `;
}

async function renderVariantFrames(sourceBuffer, frameWidth, frameHeight, variant, tempDir) {
  const bubbleSvg = Buffer.from(buildSpeechBubbleSvg(variant));

  for (let index = 0; index < GRID_COLUMNS * GRID_ROWS; index += 1) {
    const left = (index % GRID_COLUMNS) * frameWidth;
    const top = Math.floor(index / GRID_COLUMNS) * frameHeight;
    const frame = await sharp(sourceBuffer)
      .extract({ left, top, width: frameWidth, height: frameHeight })
      .resize({ height: FRAME_TARGET_HEIGHT, fit: 'contain' })
      .png()
      .toBuffer();

    const frameMeta = await sharp(frame).metadata();
    const frameLeft = Math.round((CANVAS_SIZE - frameMeta.width) / 2);

    const composed = await sharp({
      create: {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: bubbleSvg, top: 0, left: 0 },
        { input: frame, top: FRAME_PADDING_TOP, left: frameLeft },
      ])
      .png()
      .toBuffer();

    const frameName = `${String(index).padStart(2, '0')}.png`;
    await writeFile(path.join(tempDir, frameName), composed);
  }
}

async function encodeAnimatedGif(frameDir, outputPath) {
  await execFile('ffmpeg', [
    '-y',
    '-framerate', String(FRAME_RATE),
    '-i', path.join(frameDir, '%02d.png'),
    '-filter_complex', '[0:v]split[a][b];[a]palettegen=reserve_transparent=on[p];[b][p]paletteuse=alpha_threshold=128',
    '-loop', '0',
    outputPath,
  ]);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const sourceBuffer = await readFile(sourcePath);
  const meta = await sharp(sourceBuffer).metadata();
  const frameWidth = Math.floor((meta.width || 0) / GRID_COLUMNS);
  const frameHeight = Math.floor((meta.height || 0) / GRID_ROWS);

  if (!frameWidth || !frameHeight) {
    throw new Error('Unable to determine VegetaCat sprite frame size.');
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vegetacat-stickers-'));

  try {
    for (const variant of VARIANTS) {
      const variantDir = path.join(tempRoot, variant.key);
      await mkdir(variantDir, { recursive: true });
      await renderVariantFrames(sourceBuffer, frameWidth, frameHeight, variant, variantDir);
      await encodeAnimatedGif(variantDir, path.join(outputDir, `${variant.key}.gif`));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  const generated = await readdir(outputDir);
  console.log(`Generated ${generated.length} VegetaCat stickers in ${outputDir}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});

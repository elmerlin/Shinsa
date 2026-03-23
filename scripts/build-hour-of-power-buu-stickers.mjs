import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = 'C:/Users/elmer/Desktop/SHINSA';
const sourceDir = path.join(repoRoot, 'client', 'public', 'hour-of-power');
const outputRoot = path.join(repoRoot, 'client', 'public', 'emojis');
const columns = 4;
const rows = 3;

const stickerSheets = [
  {
    source: 'buu_dressup.png',
    outputDir: 'buu_hop_dressup',
    outputPrefix: 'buu-hop-dressup',
  },
  {
    source: 'buu_power_rangers.png',
    outputDir: 'buu_hop_power_rangers',
    outputPrefix: 'buu-hop-power-rangers',
  },
  {
    source: 'buu_sandbagging.png',
    outputDir: 'buu_hop_sandbagging',
    outputPrefix: 'buu-hop-sandbagging',
  },
];

async function buildStickerSet({ source, outputDir, outputPrefix }) {
  const sourcePath = path.join(sourceDir, source);
  const targetDir = path.join(outputRoot, outputDir);
  const metadata = await sharp(sourcePath).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width <= 0 || height <= 0) {
    throw new Error(`Unable to read dimensions for ${sourcePath}`);
  }

  if (width % columns !== 0 || height % rows !== 0) {
    throw new Error(`${source} does not divide evenly into a ${columns}x${rows} grid.`);
  }

  const tileWidth = Math.floor(width / columns);
  const tileHeight = Math.floor(height / rows);

  await fs.mkdir(targetDir, { recursive: true });

  const existingFiles = await fs.readdir(targetDir);
  await Promise.all(
    existingFiles
      .filter((fileName) => fileName.toLowerCase().endsWith('.png'))
      .map((fileName) => fs.unlink(path.join(targetDir, fileName))),
  );

  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const outputPath = path.join(targetDir, `${outputPrefix}-${index}.png`);
      await sharp(sourcePath)
        .extract({
          left: column * tileWidth,
          top: row * tileHeight,
          width: tileWidth,
          height: tileHeight,
        })
        .png()
        .toFile(outputPath);
      index += 1;
    }
  }

  return {
    outputDir,
    generated: index,
    tileWidth,
    tileHeight,
  };
}

const results = [];
for (const sheet of stickerSheets) {
  results.push(await buildStickerSet(sheet));
}

console.table(results);

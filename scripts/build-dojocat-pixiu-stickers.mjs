import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = 'C:/Users/elmer/Desktop/SHINSA';
const sourceDir = path.join(repoRoot, 'client', 'public', 'emojis', 'dojocat_pixiu');
const columns = 4;
const rows = 4;

const stickerSheets = [
  {
    source: 'dojocat_pixiu.png',
    outputPrefix: 'dojocat-pixiu',
  },
  {
    source: 'dojocat_pixiu_traditional.png',
    outputPrefix: 'dojocat-pixiu-traditional',
  },
];

async function buildStickerSet({ source, outputPrefix }) {
  const sourcePath = path.join(sourceDir, source);
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

  const existingFiles = await fs.readdir(sourceDir);
  await Promise.all(
    existingFiles
      .filter((fileName) => fileName.startsWith(`${outputPrefix}-`) && fileName.toLowerCase().endsWith('.png'))
      .map((fileName) => fs.unlink(path.join(sourceDir, fileName))),
  );

  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const outputPath = path.join(sourceDir, `${outputPrefix}-${index}.png`);
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
    source,
    generated: index,
    tileWidth,
    tileHeight,
    hasAlpha: !!metadata.hasAlpha,
  };
}

const results = [];
for (const sheet of stickerSheets) {
  results.push(await buildStickerSet(sheet));
}

console.table(results);

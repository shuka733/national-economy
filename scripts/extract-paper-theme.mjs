import path from 'node:path';
import process from 'node:process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PAPER_CROP_MANIFEST, PAPER_COUNTS, PAPER_GRID } from './paper-crop-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(repoRoot, 'public');
const classicCopyDir = path.join(publicRoot, 'classic_copy');

function getArgValue(name, fallback = '') {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function buildSheetMap() {
  const entries = await fs.readdir(classicCopyDir, { withFileTypes: true });
  const map = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(jpg|jpeg|png)$/i.test(entry.name)) continue;
    const match = entry.name.match(/^(\d{2})_/);
    if (!match) continue;
    map.set(match[1], path.join(classicCopyDir, entry.name));
  }
  return map;
}

function ensureManifestCounts() {
  const counts = { public: 0, progress: 0, glory: 0 };
  for (const entry of PAPER_CROP_MANIFEST) counts[entry.group] += 1;
  if (
    counts.public !== PAPER_COUNTS.public ||
    counts.progress !== PAPER_COUNTS.progress ||
    counts.glory !== PAPER_COUNTS.glory ||
    PAPER_CROP_MANIFEST.length !== PAPER_COUNTS.total
  ) {
    throw new Error(
      `Manifest count mismatch: actual=${JSON.stringify({ ...counts, total: PAPER_CROP_MANIFEST.length })} expected=${JSON.stringify(PAPER_COUNTS)}`,
    );
  }
}

function computeCrop(entry) {
  const artSize = entry.artSize ?? PAPER_GRID.artSize;
  const left =
    PAPER_GRID.cellLeft +
    entry.col * PAPER_GRID.stepX +
    (entry.artOffsetX ?? PAPER_GRID.artOffsetX);
  const top =
    PAPER_GRID.cellTop +
    entry.row * PAPER_GRID.stepY +
    (entry.artOffsetY ?? PAPER_GRID.artOffsetY);
  return { left, top, width: artSize, height: artSize };
}

async function main() {
  ensureManifestCounts();

  const dryRun = hasFlag('--dry-run');
  const pilotOnly = hasFlag('--pilot');
  const outputRootArg = getArgValue('--output-root');
  const outputRoot = outputRootArg
    ? path.resolve(repoRoot, outputRootArg)
    : publicRoot;
  const entries = pilotOnly
    ? PAPER_CROP_MANIFEST.filter((entry) => entry.pilot)
    : PAPER_CROP_MANIFEST;

  const sheetMap = await buildSheetMap();
  if (!sheetMap.size) {
    throw new Error(`No source sheets found in ${classicCopyDir}`);
  }

  let exactCount = 0;
  let proxyCount = 0;

  for (const entry of entries) {
    const sourceFile = sheetMap.get(entry.sheet);
    if (!sourceFile) {
      throw new Error(`Missing source sheet ${entry.sheet} for ${entry.output}`);
    }

    const targetFile = path.join(outputRoot, entry.output);
    const crop = computeCrop(entry);
    if (entry.sourceType === 'proxy') proxyCount += 1;
    else exactCount += 1;

    if (dryRun) {
      console.log(`[dry-run] ${entry.output} <= ${path.basename(sourceFile)} ${JSON.stringify(crop)}`);
      continue;
    }

    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await sharp(sourceFile)
      .extract(crop)
      .resize(PAPER_GRID.outputSize, PAPER_GRID.outputSize, {
        fit: 'cover',
        kernel: sharp.kernel.lanczos3,
      })
      .modulate({ brightness: 1.02, saturation: 0.96 })
      .png()
      .toFile(targetFile);

    console.log(`wrote ${path.relative(repoRoot, targetFile)}`);
  }

  console.log(
    JSON.stringify(
      {
        generated: entries.length,
        exact: exactCount,
        proxy: proxyCount,
        pilotOnly,
        dryRun,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});


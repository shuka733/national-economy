import path from 'node:path';
import process from 'node:process';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repoRoot, 'public', 'cards', 'paper');
const outputRoot = path.join(repoRoot, 'public', 'cards', 'paper_png');
const execFileAsync = promisify(execFile);
const INKSCAPE_CANDIDATES = [
  'C:\\Program Files\\Inkscape\\bin\\inkscape.exe',
  'C:\\Program Files\\Inkscape\\inkscape.exe',
  'C:\\Program Files (x86)\\Inkscape\\inkscape.exe',
];

function getArgValue(name, fallback = '') {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : fallback;
}

async function walkSvgFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkSvgFiles(resolved));
      continue;
    }
    if (entry.isFile() && /\.svg$/i.test(entry.name)) {
      files.push(resolved);
    }
  }
  return files;
}

async function resolveInkscapeBinary(cliOverride) {
  const candidates = [
    cliOverride,
    process.env.INKSCAPE_BIN,
    ...INKSCAPE_CANDIDATES,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(
    [
      'Could not find an Inkscape executable.',
      'Set INKSCAPE_BIN=/full/path/to/inkscape.exe or pass --inkscape=/full/path/to/inkscape.exe.',
    ].join(' '),
  );
}

async function rasterizeWithSharp(sourceFile, outputFile, width, height) {
  await sharp(sourceFile, { density: 288 })
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(outputFile);
}

async function rasterizeWithInkscape(inkscapeBin, sourceFile, outputFile, width, height) {
  const args = [
    sourceFile,
    '--export-type=png',
    `--export-filename=${outputFile}`,
    `--export-width=${width}`,
    `--export-height=${height}`,
    '--export-area-page',
  ];

  try {
    await execFileAsync(inkscapeBin, args, { windowsHide: true });
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr || '') : '';
    const detail = stderr.trim();
    throw new Error(
      [
        `Inkscape export failed for ${path.basename(sourceFile)}.`,
        detail,
      ].filter(Boolean).join(' '),
    );
  }
}

async function main() {
  const width = Number.parseInt(getArgValue('--width', '570'), 10);
  const renderer = getArgValue('--renderer', 'inkscape').toLowerCase();
  const inkscapeOverride = getArgValue('--inkscape', '');
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`Invalid --width value: ${width}`);
  }
  if (!['inkscape', 'sharp'].includes(renderer)) {
    throw new Error(`Invalid --renderer value: ${renderer}`);
  }
  const height = Math.round(width * 88 / 57);
  const svgFiles = await walkSvgFiles(sourceRoot);
  const inkscapeBin =
    renderer === 'inkscape' ? await resolveInkscapeBinary(inkscapeOverride) : null;

  if (!svgFiles.length) {
    throw new Error(`No SVG files found under ${sourceRoot}`);
  }

  let generated = 0;
  for (const sourceFile of svgFiles) {
    const relative = path.relative(sourceRoot, sourceFile);
    const outputFile = path.join(outputRoot, relative).replace(/\.svg$/i, '.png');
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    if (renderer === 'inkscape') {
      await rasterizeWithInkscape(inkscapeBin, sourceFile, outputFile, width, height);
    } else {
      await rasterizeWithSharp(sourceFile, outputFile, width, height);
    }
    generated += 1;
    console.log(`wrote ${path.relative(repoRoot, outputFile)}`);
  }

  console.log(
    JSON.stringify(
      {
        generated,
        width,
        height,
        renderer,
        inkscapeBin,
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

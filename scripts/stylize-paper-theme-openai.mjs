import path from 'node:path';
import process from 'node:process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAPER_CROP_MANIFEST } from './paper-crop-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(repoRoot, 'public');
const statusFile = path.join(__dirname, 'paper-openai-status.json');

function getArgValue(name, fallback = '') {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function getMode() {
  const mode = getArgValue('--mode', 'pilot');
  if (mode !== 'pilot' && mode !== 'all') {
    throw new Error(`Unsupported mode "${mode}". Use --mode=pilot or --mode=all.`);
  }
  return mode;
}

function buildPrompt(entry) {
  const groupHint =
    entry.group === 'public'
      ? 'shared workplace illustration for a board game'
      : entry.group === 'progress'
        ? 'progress-era building illustration for a board game'
        : 'glory expansion building illustration for a board game';

  const proxyHint =
    entry.sourceType === 'proxy'
      ? ' Preserve the proxy subject while keeping it usable as a thematic stand-in.'
      : '';

  return [
    `Lightly restylize this ${groupHint}.`,
    'Preserve the original composition, main subject, camera angle, and overall color mood.',
    'Soften the linework and paper texture slightly, like a gentle remaster of the original printed art.',
    'Do not add or invent text, numbers, badges, frames, logos, UI elements, or card borders.',
    'Do not replace the main subject with a different object or scene.',
    'Keep the output square and centered so it can be used as a background illustration.',
    proxyHint.trim(),
  ]
    .filter(Boolean)
    .join(' ');
}

async function readStatus() {
  try {
    return JSON.parse(await fs.readFile(statusFile, 'utf8'));
  } catch {
    return { updatedAt: null, items: {} };
  }
}

async function writeStatus(status) {
  await fs.writeFile(
    statusFile,
    `${JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

async function editImageWithOpenAI(apiKey, inputPath, prompt) {
  const imageBuffer = await fs.readFile(inputPath);
  const formData = new FormData();
  formData.append('model', 'gpt-image-1');
  formData.append('prompt', prompt);
  formData.append('quality', 'medium');
  formData.append('size', '1024x1024');
  formData.append('output_format', 'png');
  formData.append('input_fidelity', 'high');
  formData.append('image[]', new Blob([imageBuffer], { type: 'image/png' }), path.basename(inputPath));

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OpenAI image edit failed (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  const imageBase64 = payload?.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error('OpenAI image edit response did not include data[0].b64_json');
  }
  return Buffer.from(imageBase64, 'base64');
}

async function main() {
  const mode = getMode();
  const dryRun = hasFlag('--dry-run');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!dryRun && !apiKey) {
    throw new Error('OPENAI_API_KEY is required unless --dry-run is used.');
  }

  const inputRoot = path.resolve(repoRoot, getArgValue('--input-root', 'public'));
  const outputRoot = path.resolve(repoRoot, getArgValue('--output-root', 'public'));
  const entries = mode === 'pilot'
    ? PAPER_CROP_MANIFEST.filter((entry) => entry.pilot)
    : PAPER_CROP_MANIFEST;

  const status = await readStatus();

  for (const entry of entries) {
    const inputPath = path.join(inputRoot, entry.output);
    const outputPath = path.join(outputRoot, entry.output);
    const prompt = buildPrompt(entry);

    if (dryRun) {
      console.log(`[dry-run] ${entry.id} => ${path.relative(repoRoot, outputPath)}`);
      status.items[entry.id] = {
        mode,
        output: entry.output,
        dryRun: true,
        sourceType: entry.sourceType,
        prompt,
      };
      continue;
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const resultBuffer = await editImageWithOpenAI(apiKey, inputPath, prompt);
    await fs.writeFile(outputPath, resultBuffer);
    console.log(`stylized ${entry.id} -> ${path.relative(repoRoot, outputPath)}`);

    status.items[entry.id] = {
      mode,
      output: entry.output,
      dryRun: false,
      sourceType: entry.sourceType,
      prompt,
      completedAt: new Date().toISOString(),
    };
    await writeStatus(status);
  }

  if (dryRun) {
    await writeStatus(status);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

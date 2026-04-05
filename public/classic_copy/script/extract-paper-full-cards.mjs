import path from 'node:path';
import process from 'node:process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  PAPER_FULL_CARD_COUNTS,
  PAPER_FULL_CARD_GRID,
  PAPER_FULL_CARD_MANIFEST,
  PAPER_FULL_CARD_MISSING_IMPLEMENTED,
} from './paper-full-card-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const classicCopyDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(classicCopyDir, '..', '..');
const outputRoot = path.join(classicCopyDir, 'temp');

const EDGE_DETECTION = {
  topSearchAbove: 42,
  topSearchBelow: 18,
  bottomSearchAbove: 24,
  bottomSearchBelow: 48,
  generalInsetX: 10,
  costInsetX: 8,
  costWidth: 48,
  backgroundBandRows: 8,
  foregroundDistanceThreshold: 22,
  rowDiffThreshold: 9,
  foregroundRatioThreshold: 0.08,
  postBackgroundRatioThreshold: 0.035,
  costDarkThreshold: 96,
  costDarkRatioThreshold: 0.045,
  fallbackTopPadding: 18,
  fallbackBottomPadding: 26,
  topSafetyPadding: 10,
  bottomSafetyPadding: 16,
  topLeadFromCost: 10,
  maxTopExpand: 32,
  maxBottomExpand: 36,
};

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

async function loadSheetRaster(sourceFile) {
  const { data, info } = await sharp(sourceFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pixelIndex(sheet, x, y) {
  return (y * sheet.width + x) * sheet.channels;
}

function averageColorInRect(sheet, x0, x1, y0, y1) {
  const left = clamp(Math.floor(x0), 0, sheet.width);
  const right = clamp(Math.ceil(x1), 0, sheet.width);
  const top = clamp(Math.floor(y0), 0, sheet.height);
  const bottom = clamp(Math.ceil(y1), 0, sheet.height);
  if (right <= left || bottom <= top) {
    return { r: 255, g: 255, b: 255 };
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = pixelIndex(sheet, x, y);
      sumR += sheet.data[index];
      sumG += sheet.data[index + 1];
      sumB += sheet.data[index + 2];
      count += 1;
    }
  }

  if (count === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: sumR / count,
    g: sumG / count,
    b: sumB / count,
  };
}

function meanRowDiff(sheet, yA, yB, x0, x1) {
  const left = clamp(Math.floor(x0), 0, sheet.width);
  const right = clamp(Math.ceil(x1), 0, sheet.width);
  const rowA = clamp(yA, 0, sheet.height - 1);
  const rowB = clamp(yB, 0, sheet.height - 1);
  if (right <= left || rowA === rowB) return 0;

  let total = 0;
  let count = 0;
  for (let x = left; x < right; x += 1) {
    const indexA = pixelIndex(sheet, x, rowA);
    const indexB = pixelIndex(sheet, x, rowB);
    total +=
      Math.abs(sheet.data[indexA] - sheet.data[indexB]) +
      Math.abs(sheet.data[indexA + 1] - sheet.data[indexB + 1]) +
      Math.abs(sheet.data[indexA + 2] - sheet.data[indexB + 2]);
    count += 1;
  }

  return count === 0 ? 0 : total / (count * 3);
}

function foregroundRatioForRow(sheet, y, x0, x1, backgroundColor) {
  const left = clamp(Math.floor(x0), 0, sheet.width);
  const right = clamp(Math.ceil(x1), 0, sheet.width);
  const row = clamp(y, 0, sheet.height - 1);
  if (right <= left) return 0;

  let foreground = 0;
  let count = 0;
  for (let x = left; x < right; x += 1) {
    const index = pixelIndex(sheet, x, row);
    const diff =
      (Math.abs(sheet.data[index] - backgroundColor.r) +
        Math.abs(sheet.data[index + 1] - backgroundColor.g) +
        Math.abs(sheet.data[index + 2] - backgroundColor.b)) /
      3;
    if (diff >= EDGE_DETECTION.foregroundDistanceThreshold) {
      foreground += 1;
    }
    count += 1;
  }

  return count === 0 ? 0 : foreground / count;
}

function darkRatioForRow(sheet, y, x0, x1) {
  const left = clamp(Math.floor(x0), 0, sheet.width);
  const right = clamp(Math.ceil(x1), 0, sheet.width);
  const row = clamp(y, 0, sheet.height - 1);
  if (right <= left) return 0;

  let dark = 0;
  let count = 0;
  for (let x = left; x < right; x += 1) {
    const index = pixelIndex(sheet, x, row);
    const luminance = sheet.data[index] * 0.299 + sheet.data[index + 1] * 0.587 + sheet.data[index + 2] * 0.114;
    if (luminance <= EDGE_DETECTION.costDarkThreshold) {
      dark += 1;
    }
    count += 1;
  }

  return count === 0 ? 0 : dark / count;
}

function averageProfileRange(profile, start, end) {
  let total = 0;
  let count = 0;
  for (let i = start; i <= end; i += 1) {
    if (Number.isFinite(profile[i])) {
      total += profile[i];
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

function detectCropForEntry(entry, sheet) {
  const nominalLeft = PAPER_FULL_CARD_GRID.left + entry.cropRect.col * PAPER_FULL_CARD_GRID.stepX;
  const nominalTop = PAPER_FULL_CARD_GRID.top + entry.cropRect.row * PAPER_FULL_CARD_GRID.stepY;
  const nominalWidth = PAPER_FULL_CARD_GRID.width;
  const nominalHeight = PAPER_FULL_CARD_GRID.height;
  const nominalBottom = nominalTop + nominalHeight;

  const fallbackTop = clamp(nominalTop - EDGE_DETECTION.fallbackTopPadding, 0, sheet.height - 1);
  const fallbackBottom = clamp(nominalBottom + EDGE_DETECTION.fallbackBottomPadding, fallbackTop + 1, sheet.height);
  const minAllowedTop = clamp(nominalTop - EDGE_DETECTION.maxTopExpand, 0, sheet.height - 2);
  const maxAllowedBottom = clamp(nominalBottom + EDGE_DETECTION.maxBottomExpand, minAllowedTop + 2, sheet.height);

  const generalX0 = nominalLeft + EDGE_DETECTION.generalInsetX;
  const generalX1 = nominalLeft + nominalWidth - EDGE_DETECTION.generalInsetX;
  const costX0 = nominalLeft + EDGE_DETECTION.costInsetX;
  const costX1 = Math.min(nominalLeft + nominalWidth, costX0 + EDGE_DETECTION.costWidth);

  const topSearchStart = clamp(nominalTop - EDGE_DETECTION.topSearchAbove, 0, sheet.height - 1);
  const topSearchEnd = clamp(nominalTop + EDGE_DETECTION.topSearchBelow, 0, sheet.height - 1);
  const bottomSearchStart = clamp(nominalBottom - EDGE_DETECTION.bottomSearchAbove, 0, sheet.height - 1);
  const bottomSearchEnd = clamp(nominalBottom + EDGE_DETECTION.bottomSearchBelow, 0, sheet.height - 1);

  const topBackgroundStart = topSearchStart;
  const topBackgroundEnd = Math.min(topSearchEnd, Math.max(topSearchStart, nominalTop - 6));
  const bottomBackgroundStart = Math.max(bottomSearchStart, Math.min(sheet.height - 1, nominalBottom + 6));
  const bottomBackgroundEnd = Math.min(sheet.height, bottomBackgroundStart + EDGE_DETECTION.backgroundBandRows);

  const topBackground = averageColorInRect(sheet, generalX0, generalX1, topBackgroundStart, topBackgroundEnd);
  const bottomBackground = averageColorInRect(sheet, generalX0, generalX1, bottomBackgroundStart, bottomBackgroundEnd);

  const rowDiff = [];
  const topForeground = [];
  const bottomForeground = [];
  const costDark = [];

  for (let y = topSearchStart; y <= bottomSearchEnd; y += 1) {
    if (y > 0) {
      rowDiff[y] = meanRowDiff(sheet, y - 1, y, generalX0, generalX1);
    } else {
      rowDiff[y] = 0;
    }
    if (y <= topSearchEnd) {
      topForeground[y] = foregroundRatioForRow(sheet, y, generalX0, generalX1, topBackground);
      costDark[y] = darkRatioForRow(sheet, y, costX0, costX1);
    }
    if (y >= bottomSearchStart) {
      bottomForeground[y] = foregroundRatioForRow(sheet, y, generalX0, generalX1, bottomBackground);
    }
  }

  let topEdge = null;
  let topMode = 'fallback-manifest';
  for (let y = topSearchStart + 2; y <= topSearchEnd; y += 1) {
    const diffScore = averageProfileRange(rowDiff, y - 1, y + 1);
    const beforeForeground = averageProfileRange(topForeground, y - 2, y - 1);
    const afterForeground = averageProfileRange(topForeground, y, y + 2);
    if (
      diffScore >= EDGE_DETECTION.rowDiffThreshold &&
      afterForeground >= EDGE_DETECTION.foregroundRatioThreshold &&
      afterForeground > beforeForeground + 0.02
    ) {
      topEdge = y;
      topMode = 'row-diff';
      break;
    }
  }

  const costRow = [];
  for (let y = topSearchStart; y <= topSearchEnd; y += 1) {
    const darkAverage = averageProfileRange(costDark, y, y + 2);
    if (darkAverage >= EDGE_DETECTION.costDarkRatioThreshold) {
      costRow.push(y);
      break;
    }
  }

  if (costRow.length > 0) {
    const costEdge = costRow[0] - EDGE_DETECTION.topLeadFromCost;
    if (topEdge === null) {
      topEdge = costEdge;
      topMode = 'cost-fallback';
    } else if (costEdge < topEdge) {
      topEdge = costEdge;
      topMode = 'row-diff+cost-guard';
    }
  }

  const detectedTop = clamp(topEdge ?? nominalTop, 0, sheet.height - 1);
  const finalTop = clamp(
    Math.min(fallbackTop, detectedTop - EDGE_DETECTION.topSafetyPadding),
    minAllowedTop,
    sheet.height - 2,
  );

  let bottomEdge = null;
  let bottomMode = 'fallback-manifest';
  for (let y = bottomSearchEnd - 2; y >= bottomSearchStart; y -= 1) {
    const foregroundHere = averageProfileRange(bottomForeground, y - 2, y);
    const foregroundBelow = averageProfileRange(bottomForeground, y + 1, y + 3);
    if (
      foregroundHere >= EDGE_DETECTION.foregroundRatioThreshold &&
      foregroundBelow <= EDGE_DETECTION.postBackgroundRatioThreshold
    ) {
      bottomEdge = y;
      bottomMode = 'foreground-tail';
      break;
    }
  }

  if (bottomEdge !== null) {
    let bestDiffY = bottomEdge;
    let bestDiffScore = rowDiff[bottomEdge] ?? 0;
    for (let y = Math.max(bottomSearchStart + 1, bottomEdge - 4); y <= Math.min(bottomSearchEnd, bottomEdge + 4); y += 1) {
      if ((rowDiff[y] ?? 0) > bestDiffScore) {
        bestDiffScore = rowDiff[y];
        bestDiffY = y;
      }
    }
    if (bestDiffScore >= EDGE_DETECTION.rowDiffThreshold) {
      bottomEdge = Math.max(bottomEdge, bestDiffY);
      bottomMode = bottomMode === 'foreground-tail' ? 'foreground-tail+row-diff' : 'row-diff';
    }
  }

  const detectedBottom = clamp(bottomEdge ?? nominalBottom, finalTop + 1, sheet.height - 1);
  const finalBottom = clamp(
    Math.max(fallbackBottom, detectedBottom + EDGE_DETECTION.bottomSafetyPadding + 1),
    finalTop + 2,
    maxAllowedBottom,
  );

  return {
    cropRect: {
      left: clamp(nominalLeft, 0, Math.max(0, sheet.width - nominalWidth)),
      top: finalTop,
      width: Math.min(nominalWidth, sheet.width - clamp(nominalLeft, 0, Math.max(0, sheet.width - nominalWidth))),
      height: finalBottom - finalTop,
    },
    detection: {
      detectedTop,
      detectedBottom,
      safetyPaddingTop: EDGE_DETECTION.topSafetyPadding,
      safetyPaddingBottom: EDGE_DETECTION.bottomSafetyPadding,
      detectionMode: `${topMode}/${bottomMode}`,
    },
  };
}

function ensureCounts() {
  const actual = PAPER_FULL_CARD_MANIFEST.reduce(
    (acc, entry) => {
      acc[entry.group] = (acc[entry.group] ?? 0) + 1;
      acc.total += 1;
      return acc;
    },
    { public: 0, progress: 0, glory: 0, mecenat: 0, consumable: 0, total: 0 },
  );
  const expected = PAPER_FULL_CARD_COUNTS;
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Manifest count mismatch for ${key}: actual=${actual[key]} expected=${expected[key]}`);
    }
  }
}

async function main() {
  ensureCounts();
  const dryRun = hasFlag('--dry-run');
  const sheetMap = await buildSheetMap();
  const sheetMetaCache = new Map();
  const sheetRasterCache = new Map();

  for (const entry of PAPER_FULL_CARD_MANIFEST) {
    const sourceFile = sheetMap.get(entry.sheet);
    if (!sourceFile) {
      throw new Error(`Missing source sheet ${entry.sheet} for ${entry.output}`);
    }
    if (!sheetMetaCache.has(entry.sheet)) {
      sheetMetaCache.set(entry.sheet, await sharp(sourceFile).metadata());
    }
    if (!sheetRasterCache.has(entry.sheet)) {
      sheetRasterCache.set(entry.sheet, await loadSheetRaster(sourceFile));
    }
  }

  const generatedEntries = [];

  for (const entry of PAPER_FULL_CARD_MANIFEST) {
    const sourceFile = sheetMap.get(entry.sheet);
    const sheetMeta = sheetMetaCache.get(entry.sheet);
    const sheetRaster = sheetRasterCache.get(entry.sheet);
    const { cropRect, detection } = detectCropForEntry(entry, sheetRaster);
    const { left, top, width, height } = cropRect;
    const clampedLeft = Math.min(Math.max(0, left), Math.max(0, sheetMeta.width - width));
    const clampedTop = Math.min(Math.max(0, top), Math.max(0, sheetMeta.height - height));
    const clampedWidth = Math.min(width, sheetMeta.width - clampedLeft);
    const clampedHeight = Math.min(height, sheetMeta.height - clampedTop);
    const targetFile = path.join(outputRoot, entry.output);

    if (!dryRun) {
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await sharp(sourceFile)
        .extract({
          left: clampedLeft,
          top: clampedTop,
          width: clampedWidth,
          height: clampedHeight,
        })
        .resize(PAPER_FULL_CARD_GRID.outputWidth, PAPER_FULL_CARD_GRID.outputHeight, {
          fit: 'contain',
          kernel: sharp.kernel.lanczos3,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(targetFile);
    }

    generatedEntries.push({
      sheet: entry.sheet,
      row: entry.cropRect.row,
      col: entry.cropRect.col,
      titleJa: entry.titleJa,
      group: entry.group,
      output: entry.output.replace(/\\/g, '/'),
      isImplemented: entry.isImplemented,
      cropRect: {
        left: clampedLeft,
        top: clampedTop,
        width: clampedWidth,
        height: clampedHeight,
      },
      expandTop: Math.max(0, entry.cropRect.top - clampedTop + (entry.cropRect.expandTop ?? 0)),
      expandBottom: Math.max(
        0,
        clampedTop + clampedHeight - (PAPER_FULL_CARD_GRID.top + entry.cropRect.row * PAPER_FULL_CARD_GRID.stepY + PAPER_FULL_CARD_GRID.height),
      ),
      detectedTop: detection.detectedTop,
      detectedBottom: detection.detectedBottom,
      safetyPaddingTop: detection.safetyPaddingTop,
      safetyPaddingBottom: detection.safetyPaddingBottom,
      detectionMode: detection.detectionMode,
    });

    console.log(`${dryRun ? '[dry-run] ' : ''}${entry.output}`);
  }

  const indexPath = path.join(outputRoot, 'index.json');
  const indexPayload = {
    generatedAt: new Date().toISOString(),
    outputRoot: 'public/classic_copy/temp',
    grid: PAPER_FULL_CARD_GRID,
    counts: PAPER_FULL_CARD_COUNTS,
    missingImplemented: PAPER_FULL_CARD_MISSING_IMPLEMENTED,
    entries: generatedEntries,
  };

  if (!dryRun) {
    await fs.mkdir(outputRoot, { recursive: true });
    await fs.writeFile(indexPath, `${JSON.stringify(indexPayload, null, 2)}\n`, 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        generated: generatedEntries.length,
        counts: PAPER_FULL_CARD_COUNTS,
        missingImplemented: PAPER_FULL_CARD_MISSING_IMPLEMENTED.length,
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

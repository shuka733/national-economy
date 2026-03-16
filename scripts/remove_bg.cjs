// ロゴ画像の暗い背景を透明にするスクリプト
const fs = require('fs');
const { PNG } = require('pngjs');

const inputPath = process.argv[2] || './public/logo.png';
const outputPath = process.argv[3] || inputPath;
const THRESHOLD = 55;
const FADE = 25;

const data = fs.readFileSync(inputPath);
const png = PNG.sync.read(data);

let cleared = 0;
for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    // 輝度計算
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    if (brightness < THRESHOLD) {
        png.data[i + 3] = 0;
        cleared++;
    } else if (brightness < THRESHOLD + FADE) {
        // 境界部分はグラデーションで透過
        const alpha = Math.round(((brightness - THRESHOLD) / FADE) * 255);
        png.data[i + 3] = Math.min(png.data[i + 3], alpha);
    }
}

const out = PNG.sync.write(png);
fs.writeFileSync(outputPath, out);
console.log('Done: ' + cleared + ' pixels cleared, saved to ' + outputPath);

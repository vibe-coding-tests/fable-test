import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'public/assets/vfx/vfx_atlas.webp');
const WIDTH = 1024;
const HEIGHT = 512;
const CELL = 256;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function setPx(data, x, y, rgba) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4;
  data[i] = rgba[0];
  data[i + 1] = rgba[1];
  data[i + 2] = rgba[2];
  data[i + 3] = rgba[3];
}

function blendPx(data, x, y, rgba) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4;
  const a = rgba[3] / 255;
  const ia = 1 - a;
  data[i] = Math.round(rgba[0] * a + data[i] * ia);
  data[i + 1] = Math.round(rgba[1] * a + data[i + 1] * ia);
  data[i + 2] = Math.round(rgba[2] * a + data[i + 2] * ia);
  data[i + 3] = Math.max(data[i + 3], rgba[3]);
}

function drawCell(data, cellX, cellY, alphaFn, tint = [255, 255, 255]) {
  const ox = cellX * CELL;
  const oy = cellY * CELL;
  const c = (CELL - 1) / 2;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const nx = (x - c) / c;
      const ny = (y - c) / c;
      const d = Math.hypot(nx, ny);
      const ang = Math.atan2(ny, nx);
      const a = clamp01(alphaFn(nx, ny, d, ang));
      const glow = Math.sqrt(a);
      setPx(data, ox + x, oy + y, [
        Math.round(tint[0] * (0.7 + glow * 0.3)),
        Math.round(tint[1] * (0.7 + glow * 0.3)),
        Math.round(tint[2] * (0.7 + glow * 0.3)),
        Math.round(255 * a)
      ]);
    }
  }
}

function drawScratch(data, cellX, cellY, color, count) {
  const ox = cellX * CELL;
  const oy = cellY * CELL;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r0 = 22 + (i % 5) * 12;
    const r1 = 82 + (i % 7) * 10;
    const x0 = Math.round(ox + CELL / 2 + Math.cos(a) * r0);
    const y0 = Math.round(oy + CELL / 2 + Math.sin(a) * r0);
    const x1 = Math.round(ox + CELL / 2 + Math.cos(a + 0.22) * r1);
    const y1 = Math.round(oy + CELL / 2 + Math.sin(a + 0.22) * r1);
    const steps = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      blendPx(data, x, y, [...color, Math.round(70 * (1 - t))]);
    }
  }
}

const data = new Uint8Array(WIDTH * HEIGHT * 4);

// Top row: telegraphs ring, spiked, hatched, dotted.
drawCell(data, 0, 0, (_nx, _ny, d, ang) => {
  if (d >= 1) return 0;
  const fill = 0.12 * (1 - d);
  const rim = Math.max(0, 1 - Math.abs(d - 0.82) / 0.07);
  const spoke = Math.abs((ang * 3) % 1) < 0.045 && d > 0.42 ? 0.22 : 0;
  return fill + rim * 0.88 + spoke;
}, [220, 245, 255]);

drawCell(data, 1, 0, (_nx, _ny, d, ang) => {
  if (d >= 1) return 0;
  const rim = Math.max(0, 1 - Math.abs(d - 0.82) / 0.08);
  const tooth = Math.abs((ang * 8 / Math.PI) % 1) < 0.16 && d > 0.48 ? (1 - d) * 0.9 : 0;
  return rim * 0.85 + tooth;
}, [255, 232, 180]);

drawCell(data, 2, 0, (nx, ny, d) => {
  if (d >= 1) return 0;
  const rim = Math.max(0, 1 - Math.abs(d - 0.85) / 0.09) * 0.62;
  const hatch = Math.abs(((nx + ny) * 6) % 1) < 0.18 && d < 0.86 ? 0.3 : 0;
  return rim + hatch + 0.05 * (1 - d);
}, [220, 210, 255]);

drawCell(data, 3, 0, (_nx, _ny, d, ang) => {
  if (d >= 1) return 0;
  const dash = Math.abs((ang * 9 / Math.PI) % 1) < 0.42 ? 1 : 0;
  const rim = Math.max(0, 1 - Math.abs(d - 0.82) / 0.07) * dash;
  const center = d < 0.12 ? 0.6 * (1 - d / 0.12) : 0;
  return rim * 0.9 + center;
}, [190, 235, 255]);

// Bottom row: soft, ember, snow, shard particles.
drawCell(data, 0, 1, (_nx, _ny, d) => {
  const a = Math.max(0, 1 - d);
  return a * a;
}, [245, 250, 255]);
drawScratch(data, 0, 1, [180, 220, 255], 14);

drawCell(data, 1, 1, (_nx, _ny, d, ang) => {
  const core = Math.max(0, 1 - d * 1.55);
  const lick = Math.max(0, Math.cos(ang * 3 - d * 5)) * Math.max(0, 1 - d);
  return core * core + lick * 0.24;
}, [255, 182, 92]);
drawScratch(data, 1, 1, [255, 220, 140], 18);

drawCell(data, 2, 1, (_nx, _ny, d, ang) => {
  const star = 0.5 + 0.5 * Math.cos(ang * 6);
  const arm = Math.max(0, 1 - d) * star;
  const core = d < 0.18 ? 1 - d / 0.18 : 0;
  return arm * 0.75 + core * 0.55;
}, [210, 245, 255]);

drawCell(data, 3, 1, (nx, ny) => {
  const m = Math.abs(nx) + Math.abs(ny);
  const facet = Math.abs(nx - ny) < 0.22 ? 0.18 : 0;
  return Math.max(0, 1 - m) + facet * Math.max(0, 1 - m * 0.8);
}, [220, 210, 255]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .webp({ quality: 92, effort: 6 })
  .toFile(OUT);

console.log(`wrote ${path.relative(ROOT, OUT)}`);

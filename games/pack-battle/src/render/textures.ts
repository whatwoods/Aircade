// 程序化纹理：木桌、皮革、羊皮纸、麻布/柳条/铁皮（启动时生成，运行时只 drawImage / pattern）
import { fbm, hashf, vnoise, worley } from './noise.ts';
import { makeCanvas } from './text.ts';

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const A = hex(a);
  const B = hex(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bb = Math.round(A[2] + (B[2] - A[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bb).toString(16).slice(1);
}

export function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------- 皮革 ----------

export function leatherTile(base: string, seed = 1, size = 256): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const [br, bg, bb] = hex(base);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = fbm(x / 4, y / 4, seed, 3, size / 4);
      const big = fbm(x / 64, y / 64, seed + 7, 3, size / 64);
      const peb = worley(x / 16, y / 16, seed + 3, size / 16);
      let k = 1 - 0.16 * g - 0.12 * (big - 0.5);
      if (peb < 0.12) k -= 0.1 * (1 - peb / 0.12);
      const i = (y * size + x) * 4;
      d[i] = Math.max(0, Math.min(255, br * k));
      d[i + 1] = Math.max(0, Math.min(255, bg * k));
      d[i + 2] = Math.max(0, Math.min(255, bb * k));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 浅色细划痕
  ctx.strokeStyle = 'rgba(255,230,190,0.07)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 26; i++) {
    const x = hashf(i, seed + 21) * size;
    const y = hashf(i, seed + 22) * size;
    const a = hashf(i, seed + 23) * Math.PI;
    const l = 6 + hashf(i, seed + 24) * 16;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + 2, y + oy + Math.sin(a) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        ctx.stroke();
      }
    }
  }
  return c;
}

// ---------- 羊皮纸 ----------

export function parchmentTile(seed = 3, size = 256): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const A = hex('#f0e3c2');
  const B = hex('#dcc699');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const st = fbm(x / 64, y / 64, seed, 4, 4);
      const fine = vnoise(x / 2, y / 2, seed + 9, size / 2);
      let t = Math.max(0, (st - 0.45) * 1.6);
      t = Math.min(1, t) * 0.75 + fine * 0.08;
      const i = (y * size + x) * 4;
      d[i] = A[0] + (B[0] - A[0]) * t;
      d[i + 1] = A[1] + (B[1] - A[1]) * t;
      d[i + 2] = A[2] + (B[2] - A[2]) * t;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(120,90,50,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 140; i++) {
    const x = hashf(i, seed + 31) * size;
    const y = hashf(i, seed + 32) * size;
    const a = hashf(i, seed + 33) * Math.PI * 2;
    const l = 3 + hashf(i, seed + 34) * 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return c;
}

// ---------- 编织（麻布 / 柳条）与金属 ----------

export function weaveTile(base: string, kind: 'linen' | 'wicker', seed = 5, size = 128): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const [br, bg, bb] = hex(base);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let k: number;
      if (kind === 'linen') {
        const a = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2 * 32);
        const b = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * 32);
        k = 0.82 + 0.1 * a * b + 0.08 * vnoise(x / 2, y / 2, seed, size / 2);
      } else {
        const cell = 16;
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        const fx = (x % cell) / cell;
        const fy = (y % cell) / cell;
        const horiz = (cx + cy) % 2 === 0;
        const t = horiz ? fy : fx;
        const along = horiz ? fx : fy;
        k = 0.72 + 0.3 * Math.sin(t * Math.PI) - 0.12 * Math.abs(along - 0.5) * 0.6 + 0.06 * vnoise(x / 4, y / 4, seed, size / 4);
      }
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, br * k);
      d[i + 1] = Math.min(255, bg * k);
      d[i + 2] = Math.min(255, bb * k);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function metalTile(base: string, seed = 7, size = 128): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const [br, bg, bb] = hex(base);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const brush = vnoise(x / 40, y * 1.3, seed, 0) * 0.5 + vnoise(x / 12, y * 0.7, seed + 1, 0) * 0.5;
      const k = 0.86 + 0.18 * brush + 0.06 * fbm(x / 32, y / 32, seed + 4, 2, 4);
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, br * k);
      d[i + 1] = Math.min(255, bg * k);
      d[i + 2] = Math.min(255, bb * k);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- 木桌背景（整个视口） ----------

export function woodField(w: number, h: number, seed = 11, ox = 0, unit = 1): HTMLCanvasElement {
  // 半分辨率生成木纹底，再由调用方放大
  const sw = Math.max(1, Math.ceil(w / 2));
  const sh = Math.max(1, Math.ceil(h / 2));
  const [c, ctx] = makeCanvas(sw, sh);
  const img = ctx.createImageData(sw, sh);
  const d = img.data;
  const A = hex('#5a3720');
  const B = hex('#7d5232');
  const D = hex('#3a2213');
  const plank = 110 * unit;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const X = (x * 2 - ox) / unit;
      const Y = (y * 2) / unit;
      const pi = Math.floor((x * 2 - ox) / plank);
      const v = Math.sin((X * 0.045 + fbm(X * 0.01 + pi * 3.1, Y * 0.0025, seed, 4) * 5) * Math.PI * 2);
      let t = 0.5 + 0.5 * v;
      t = t * 0.8 + fbm(X * 0.05, Y * 0.004, seed + 2, 2) * 0.25;
      let r = A[0] + (B[0] - A[0]) * t;
      let g = A[1] + (B[1] - A[1]) * t;
      let b = A[2] + (B[2] - A[2]) * t;
      // 年轮暗线
      const ring = Math.abs(v);
      if (ring > 0.94) {
        const k = (ring - 0.94) / 0.06;
        r += (D[0] - r) * k * 0.55;
        g += (D[1] - g) * k * 0.55;
        b += (D[2] - b) * k * 0.55;
      }
      // 每块木板色调 ±4%
      const tone = 1 + (hashf(pi, seed + 5) - 0.5) * 0.08;
      const i = (y * sw + x) * 4;
      d[i] = Math.min(255, r * tone);
      d[i + 1] = Math.min(255, g * tone);
      d[i + 2] = Math.min(255, b * tone);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 离屏画布与绘图小工具 */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface Sprite {
  c: HTMLCanvasElement;
  /** 设备像素尺寸 */
  w: number;
  h: number;
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export function sprite(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Sprite {
  const [c, ctx] = makeCanvas(w, h);
  draw(ctx, c.width, c.height);
  return { c, w: c.width, h: c.height };
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mixHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = Math.round(((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t);
  const g = Math.round(((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t);
  const bl = Math.round((na & 255) * (1 - t) + (nb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

/** 径向光斑：中心不透明，smoothstep 衰减到 0 */
export function radialBlob(size: number, color: string, inner = 0, falloffPow = 1.6): Sprite {
  return sprite(size, size, (ctx, w) => {
    const r = w / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let a = t <= inner ? 1 : 1 - (t - inner) / (1 - inner);
      a = Math.max(0, a);
      a = Math.pow(a * a * (3 - 2 * a), falloffPow);
      g.addColorStop(t, rgba(color, a));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

/** 生成颗粒噪点贴片（黑白半透明斑点；只写不读，避免 readback） */
export function noiseTile(size: number, seed: number, strength = 1): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  let s = seed >>> 0 || 1;
  for (let i = 0; i < d.length; i += 4) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const r = (s >>> 0) / 4294967296;
    const light = r > 0.5;
    const v = light ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = light ? 240 : 10;
    d[i + 3] = Math.floor(Math.abs(r - 0.5) * 2 * 60 * strength);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 用噪点贴片覆盖一块区域 */
export function applyGrain(
  ctx: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
): void {
  const pat = ctx.createPattern(tile, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

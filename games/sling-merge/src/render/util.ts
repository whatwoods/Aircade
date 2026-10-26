/** 画布工具：离屏画布、圆角矩形、确定性小随机 */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d')!;
}

export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** mulberry32：美术用确定性随机（与玩法/特效 RNG 无关，保证每次花纹一致） */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 五角星路径 */
export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, ro: number, ri: number, n = 5, rot = -Math.PI / 2): void {
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = rot + (i * Math.PI) / n;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** 四角闪光星 */
export function sparklePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const k = r * 0.28;
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.closePath();
}

/** 爱心路径（中心 x,y，宽约 2s） */
export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.25, y + s * 0.1, x - s * 0.95, y - s * 0.95, x, y - s * 0.38);
  ctx.bezierCurveTo(x + s * 0.95, y - s * 0.95, x + s * 1.25, y + s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

/** 水滴路径（尖朝上） */
export function dropPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.moveTo(x, y - s * 1.3);
  ctx.bezierCurveTo(x + s * 0.35, y - s * 0.7, x + s, y - s * 0.1, x + s, y + s * 0.3);
  ctx.arc(x, y + s * 0.3, s, 0, Math.PI, false);
  ctx.bezierCurveTo(x - s, y - s * 0.1, x - s * 0.35, y - s * 0.7, x, y - s * 1.3);
  ctx.closePath();
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

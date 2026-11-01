// 装备图标共享图元：刃、柄、护手、宝石、瓶、木、金属、叶。坐标系：1 格 = 54 单位
import { ellipsePts, fillPts, hatch, inkStroke, INK, pathPts, rectPts, wash, xform, type Pts, bez, quad } from '../ink.ts';
import { mixHex } from '../textures.ts';

export const S = 54;

export interface Pen {
  ctx: CanvasRenderingContext2D;
  /** 线宽倍率（小尺寸精灵加粗） */
  k: number;
  seed: number;
}

export function outline(pen: Pen, p: Pts, w = 2.2, closed = true, color = INK): void {
  inkStroke(pen.ctx, p, closed, w * pen.k, color, pen.seed++, { unit: 1, jitter: 0.7, dry: pen.k < 1.3 });
}

export function line(pen: Pen, p: Pts, w = 1.6, color = INK, alpha = 1): void {
  const ctx = pen.ctx;
  ctx.save();
  ctx.globalAlpha *= alpha;
  inkStroke(ctx, p, false, w * pen.k, color, pen.seed++, { unit: 1, jitter: 0.5, dry: false });
  ctx.restore();
}

/** 水彩填色 → 排线阴影 → 描边 */
export function paint(pen: Pen, p: Pts, color: string | CanvasGradient, edge: string, opts: { hatch?: number; outline?: number; edgeW?: number } = {}): void {
  wash(pen.ctx, p, color, edge, opts.edgeW ?? 3);
  if (opts.hatch !== 0) hatch(pen.ctx, p, opts.hatch ?? 4.5, 0.22, '#3b2a1e', 'br', -Math.PI / 4, 0.9 * Math.max(1, pen.k * 0.8), pen.seed++);
  if (opts.outline !== 0) outline(pen, p, opts.outline ?? 2.2);
}

export function shine(pen: Pen, p: Pts, w = 2.4, alpha = 0.7): void {
  const ctx = pen.ctx;
  ctx.save();
  ctx.globalAlpha *= alpha;
  pathPts(ctx, p, false);
  ctx.strokeStyle = '#fffbea';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export function steel(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f4f6f4');
  g.addColorStop(0.45, '#c3c9cc');
  g.addColorStop(0.55, '#9aa3a8');
  g.addColorStop(1, '#6f7a80');
  return g;
}

export function lin(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, ...stops: string[]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
  return g;
}

export function rad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ...stops: string[]): CanvasGradient {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
  stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
  return g;
}

/** 沿方向的局部坐标系：在 (x0,y0)→(x1,y1) 线上，u∈[0,1] 沿线，v 为法向偏移 */
export function along(x0: number, y0: number, x1: number, y1: number): (u: number, v: number) => [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return (u, v) => [x0 + dx * u + nx * v, y0 + dy * u + ny * v];
}

function ptsFrom(list: [number, number][]): Pts {
  const out: Pts = [];
  for (const [x, y] of list) out.push(x, y);
  return out;
}

/** 刀刃：base → tip，宽 w；curve 为弯度（法向偏移比例） */
export function blade(pen: Pen, x0: number, y0: number, x1: number, y1: number, w: number, o: { fuller?: boolean; curve?: number; color?: string; wavy?: number } = {}): void {
  const ctx = pen.ctx;
  const f = along(x0, y0, x1, y1);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const curve = o.curve ?? 0;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const taper = u < 0.78 ? 1 : Math.max(0, 1 - (u - 0.78) / 0.22) ** 0.8;
    const bend = curve * len * Math.sin(u * Math.PI) * 0.5;
    const wave = o.wavy ? Math.sin(u * Math.PI * o.wavy) * w * 0.28 * (1 - u * 0.6) : 0;
    L.push(f(u, w / 2 * taper + bend + wave));
    R.push(f(u, -w / 2 * taper + bend + wave));
  }
  const p = ptsFrom([...L, ...R.reverse()]);
  const g = o.color ? lin(ctx, ...f(0, w / 2), ...f(0, -w / 2), mixHex(o.color, '#ffffff', 0.5), o.color, mixHex(o.color, '#000000', 0.3)) : steel(ctx, ...f(0, w / 2), ...f(0, -w / 2));
  paint(pen, p, g, '#4f5a60', { hatch: 0, edgeW: 1.6 });
  if (o.fuller) {
    const q: Pts = [];
    for (let i = 1; i <= 9; i++) {
      const u = i / 14;
      const bend = curve * len * Math.sin(u * Math.PI) * 0.5;
      q.push(...f(u, bend));
    }
    line(pen, q, 1.4, '#59646a', 0.8);
  }
  // 刃口高光
  const hl: Pts = [];
  for (let i = 1; i <= 10; i++) {
    const u = i / 14;
    const bend = curve * len * Math.sin(u * Math.PI) * 0.5;
    const wave = o.wavy ? Math.sin(u * Math.PI * o.wavy) * w * 0.28 * (1 - u * 0.6) : 0;
    hl.push(...f(u, w * 0.3 + bend + wave));
  }
  shine(pen, hl, 1.6, 0.75);
  outline(pen, p, 2.1);
}

/** 缠绕握柄 */
export function grip(pen: Pen, x0: number, y0: number, x1: number, y1: number, w: number, color = '#6b3f22', band = '#c9a46a'): void {
  const ctx = pen.ctx;
  const f = along(x0, y0, x1, y1);
  const p = ptsFrom([f(0, w / 2), f(1, w / 2), f(1, -w / 2), f(0, -w / 2)]);
  fillPts(ctx, p, lin(ctx, ...f(0, w / 2), ...f(0, -w / 2), mixHex(color, '#ffffff', 0.25), color, mixHex(color, '#000000', 0.35)));
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  const len = Math.hypot(x1 - x0, y1 - y0);
  const cnt = Math.max(2, Math.round(len / 6));
  ctx.strokeStyle = band;
  ctx.lineWidth = 1.6 * pen.k;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let i = 0; i <= cnt; i++) {
    const u = i / cnt;
    const a = f(u - 0.06, w / 2 + 1);
    const b = f(u + 0.06, -w / 2 - 1);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.restore();
  outline(pen, p, 1.8);
}

/** 横向护手（以中心和朝向绘制） */
export function guard(pen: Pen, cx: number, cy: number, w: number, h: number, angle: number, color = 'brass'): void {
  const p = xform(rectPts(-w / 2, -h / 2, w, h, h * 0.45), cx, cy, 1, 1, angle);
  const ctx = pen.ctx;
  const g = color === 'brass' ? lin(ctx, cx - w / 2, cy - h, cx + w / 4, cy + h, '#f6dc8e', '#c8963e', '#7d5620') : lin(ctx, cx - w / 2, cy - h, cx + w / 4, cy + h, '#e2e6e8', '#9aa3a8', '#5d666b');
  fillPts(ctx, p, g);
  outline(pen, p, 1.8);
}

export function ball(pen: Pen, cx: number, cy: number, r: number, color = 'brass'): void {
  const p = ellipsePts(cx, cy, r, r, 16);
  const ctx = pen.ctx;
  fillPts(ctx, p, color === 'brass' ? rad(ctx, cx, cy, r, '#fff1b8', '#c8963e', '#7d5620') : rad(ctx, cx, cy, r, '#f4f6f4', '#9aa3a8', '#5d666b'));
  outline(pen, p, 1.7);
}

/** 多面切割宝石 */
export function gem(pen: Pen, cx: number, cy: number, r: number, color: string, sides = 6): void {
  const ctx = pen.ctx;
  const p: Pts = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
    p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  fillPts(ctx, p, rad(ctx, cx, cy, r * 1.1, mixHex(color, '#ffffff', 0.7), color, mixHex(color, '#000000', 0.45)));
  // 切面
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 0.9 * pen.k;
  ctx.beginPath();
  const ir = r * 0.48;
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * ir, cy + Math.sin(a) * ir);
  }
  ctx.stroke();
  ctx.restore();
  shine(pen, [cx - r * 0.45, cy - r * 0.1, cx - r * 0.2, cy - r * 0.5], 1.6, 0.9);
  outline(pen, p, 1.6);
}

/** 叶子：基部 (x,y)，朝 angle 方向长 len */
export function leaf(pen: Pen, x: number, y: number, len: number, w: number, angle: number, color = '#6f9d3c'): void {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 0, 0, len * 0.3, -w, len * 0.75, -w * 0.8, len, 0, 10);
  bez(p, len, 0, len * 0.75, w * 0.8, len * 0.3, w, 0, 0, 10, true);
  const q = xform(p, x, y, 1, 1, angle);
  paint(pen, q, lin(ctx, x, y - w, x + Math.cos(angle) * len, y + Math.sin(angle) * len + w, mixHex(color, '#ffffff', 0.3), color, mixHex(color, '#000000', 0.25)), mixHex(color, '#000000', 0.4), { hatch: 0, edgeW: 1.4, outline: 1.8 });
  const vein = xform([len * 0.08, 0, len * 0.85, 0], x, y, 1, 1, angle);
  line(pen, vein, 1.1, mixHex(color, '#000000', 0.45), 0.8);
}

/** 木头填充 */
export function woodGrad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, base = '#9a6a3c'): CanvasGradient {
  return lin(ctx, x0, y0, x1, y1, mixHex(base, '#ffffff', 0.25), base, mixHex(base, '#000000', 0.3));
}

export function woodLines(pen: Pen, p: Pts, x0: number, y0: number, x1: number, y1: number, count: number): void {
  const ctx = pen.ctx;
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  const f = along(x0, y0, x1, y1);
  ctx.strokeStyle = 'rgba(60,32,14,0.45)';
  ctx.lineWidth = 0.9 * pen.k;
  for (let i = 0; i < count; i++) {
    const v = -10 + (20 * (i + 0.5)) / count;
    const q: Pts = [];
    quad(q, ...f(0, v), ...f(0.5, v + (i % 2 ? 2 : -2)), ...f(1, v), 8);
    pathPts(ctx, q, false);
    ctx.stroke();
  }
  ctx.restore();
}

export { ptsFrom, rectPts, ellipsePts, bez, quad, xform, fillPts, pathPts };

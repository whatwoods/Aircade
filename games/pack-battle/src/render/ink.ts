// 手绘工具：抖动墨线（变宽带状多边形）、排线阴影、水彩填色、形状点集
import { hashf, noise1 } from './noise.ts';

export type Pts = number[]; // 扁平 [x0,y0,x1,y1,...]

export const INK = '#2b1d14';
export const INK_SOFT = '#5d4837';

// ---------- 点集构造 ----------

export function rectPts(x: number, y: number, w: number, h: number, r = 0): Pts {
  if (r <= 0) return [x, y, x + w, y, x + w, y + h, x, y + h];
  const out: Pts = [];
  const seg = 5;
  const corner = (cx: number, cy: number, a0: number): void => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return out;
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 0, rot = 0, a0 = 0, a1 = Math.PI * 2): Pts {
  const steps = n || Math.max(12, Math.ceil(Math.max(rx, ry) * 1.2));
  const out: Pts = [];
  const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6;
  const cnt = full ? steps : steps + 1;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < cnt; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    out.push(cx + ex * c - ey * s, cy + ex * s + ey * c);
  }
  return out;
}

export function circlePts(cx: number, cy: number, r: number, n = 0): Pts {
  return ellipsePts(cx, cy, r, r, n);
}

/** 三次贝塞尔采样（不含起点时 skipFirst=true，便于拼接） */
export function bez(out: Pts, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, n = 12, skipFirst = false): Pts {
  for (let i = skipFirst ? 1 : 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
  }
  return out;
}

export function quad(out: Pts, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, n = 10, skipFirst = false): Pts {
  for (let i = skipFirst ? 1 : 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
  }
  return out;
}

/** 点集变换 */
export function xform(p: Pts, dx: number, dy: number, sx = 1, sy = sx, rot = 0): Pts {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const out: Pts = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i] * sx;
    const y = p[i + 1] * sy;
    out[i] = dx + x * c - y * s;
    out[i + 1] = dy + x * s + y * c;
  }
  return out;
}

export function pathPts(ctx: CanvasRenderingContext2D, p: Pts, closed = true): void {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  if (closed) ctx.closePath();
}

export function fillPts(ctx: CanvasRenderingContext2D, p: Pts, color: string | CanvasGradient | CanvasPattern): void {
  pathPts(ctx, p, true);
  ctx.fillStyle = color;
  ctx.fill();
}

// ---------- 抖动墨线 ----------

function resample(p: Pts, closed: boolean, step: number): Pts {
  const out: Pts = [];
  const n = p.length / 2;
  const segs = closed ? n : n - 1;
  let carry = 0;
  out.push(p[0], p[1]);
  for (let i = 0; i < segs; i++) {
    const ax = p[i * 2];
    const ay = p[i * 2 + 1];
    const j = ((i + 1) % n) * 2;
    const bx = p[j];
    const by = p[j + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
      d += step;
    }
    carry = len - (d - step);
  }
  if (!closed) {
    const lx = p[p.length - 2];
    const ly = p[p.length - 1];
    const ox = out[out.length - 2];
    const oy = out[out.length - 1];
    if (Math.hypot(lx - ox, ly - oy) > step * 0.3) out.push(lx, ly);
    else {
      out[out.length - 2] = lx;
      out[out.length - 1] = ly;
    }
  } else if (out.length >= 4) {
    // 去掉与起点重合的末点
    const lx = out[out.length - 2];
    const ly = out[out.length - 1];
    if (Math.hypot(lx - out[0], ly - out[1]) < step * 0.3) out.length -= 2;
  }
  return out;
}

export interface InkOpts {
  /** 每单位多少像素（在缩放坐标系里画时传入，保证抖动和采样以像素计） */
  unit?: number;
  jitter?: number;
  taper?: boolean;
  dry?: boolean;
  alpha?: number;
}

/**
 * 抖动变宽墨线：按 6px 重采样、法向噪声偏移 ±1px、宽度 w·(0.65+0.35·sin πt)·(1+0.12·noise)，两头收尖；
 * 再叠一遍偏移 0.6px、透明度 0.5 的细线模拟干笔。
 */
export function inkStroke(ctx: CanvasRenderingContext2D, p: Pts, closed: boolean, w: number, color = INK, seed = 1, o: InkOpts = {}): void {
  if (p.length < 4) return;
  const unit = o.unit ?? 1;
  const step = 6 / unit;
  const jit = (o.jitter ?? 1) / unit;
  const taper = o.taper ?? !closed;
  const q = resample(p, closed, step);
  const n = q.length / 2;
  if (n < 2) return;
  const L: Pts = new Array(q.length);
  const R: Pts = new Array(q.length);
  for (let i = 0; i < n; i++) {
    const ip = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const inx = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    let tx = q[inx * 2] - q[ip * 2];
    let ty = q[inx * 2 + 1] - q[ip * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = -ty;
    const ny = tx;
    const off = noise1(i * 0.7, seed) * jit;
    const cx = q[i * 2] + nx * off;
    const cy = q[i * 2 + 1] + ny * off;
    const t = n > 1 ? i / (n - 1) : 0.5;
    const shape = taper ? 0.65 + 0.35 * Math.sin(Math.PI * t) : 0.85 + 0.15 * Math.sin(t * Math.PI * 6 + seed);
    let ww = w * shape * (1 + 0.12 * noise1(i * 0.37 + 11, seed + 3));
    if (taper && (i === 0 || i === n - 1)) ww *= 0.45;
    const hw = ww / 2;
    L[i * 2] = cx + nx * hw;
    L[i * 2 + 1] = cy + ny * hw;
    R[i * 2] = cx - nx * hw;
    R[i * 2 + 1] = cy - ny * hw;
  }
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * (o.alpha ?? 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (closed) {
    ctx.moveTo(L[0], L[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i * 2], L[i * 2 + 1]);
    ctx.closePath();
    ctx.moveTo(R[(n - 1) * 2], R[(n - 1) * 2 + 1]);
    for (let i = n - 2; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
    ctx.closePath();
  } else {
    ctx.moveTo(L[0], L[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i * 2], L[i * 2 + 1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
    ctx.closePath();
  }
  ctx.fill('nonzero');
  if (o.dry ?? true) {
    ctx.globalAlpha = a0 * (o.alpha ?? 1) * 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5 / unit, w * 0.3);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const d = 0.6 / unit;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = q[i * 2] + d + noise1(i * 0.9 + 40, seed) * jit * 0.8;
      const y = q[i * 2 + 1] - d * 0.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = a0;
}

/** 简洁墨线（不变宽，用于小尺寸细节） */
export function inkThin(ctx: CanvasRenderingContext2D, p: Pts, closed: boolean, w: number, color = INK, alpha = 1): void {
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  pathPts(ctx, p, closed);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = a0;
}

// ---------- 排线阴影 ----------

/**
 * 在形状内画平行抖动细线。region = 'br' 时只画右下暗部（沿 (1,1) 方向超过质心的一半）。
 */
export function hatch(ctx: CanvasRenderingContext2D, p: Pts, gap: number, alpha = 0.25, color = INK_SOFT, region: 'all' | 'br' = 'br', angle = -Math.PI / 4, lw = 0, seed = 5): void {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i += 2) {
    minx = Math.min(minx, p[i]);
    maxx = Math.max(maxx, p[i]);
    miny = Math.min(miny, p[i + 1]);
    maxy = Math.max(maxy, p[i + 1]);
    cx += p[i];
    cy += p[i + 1];
  }
  cx /= p.length / 2;
  cy /= p.length / 2;
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || gap * 0.28;
  ctx.lineCap = 'round';
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // 垂直方向
  const px = -dy;
  const py = dx;
  const diag = Math.hypot(maxx - minx, maxy - miny);
  const k0 = region === 'br' ? -gap * 0.3 : -diag;
  ctx.beginPath();
  let idx = 0;
  for (let k = k0; k <= diag; k += gap) {
    const ox = cx + px * k;
    const oy = cy + py * k;
    const j = hashf(idx++, seed) * gap * 0.25;
    ctx.moveTo(ox - dx * diag + px * j, oy - dy * diag + py * j);
    ctx.lineTo(ox + dx * diag + px * j * 0.5, oy + dy * diag + py * j * 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/** 水彩填色：平涂 + 内缘积色两圈 */
export function wash(ctx: CanvasRenderingContext2D, p: Pts, color: string | CanvasGradient, edge: string, edgeW: number): void {
  fillPts(ctx, p, color);
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.strokeStyle = edge;
  ctx.globalAlpha *= 0.28;
  ctx.lineWidth = edgeW * 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = edgeW * 4;
  ctx.stroke();
  ctx.restore();
}

/** 高光笔触（左上一道亮短弧） */
export function highlight(ctx: CanvasRenderingContext2D, p: Pts, w: number, alpha = 0.55, color = '#fffaf0'): void {
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  pathPts(ctx, p, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = a0;
}

/** 毛边多边形（纸面板边缘）：每 step 一个点，向内随机缩进 0–depth */
export function deckledRect(x: number, y: number, w: number, h: number, seed: number, step = 6, depth = 2.5, r = 3): Pts {
  const out: Pts = [];
  let idx = 0;
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const cnt = Math.max(1, Math.round(len / step));
    for (let i = 0; i < cnt; i++) {
      const t = i / cnt;
      const d = hashf(idx++, seed) * depth;
      out.push(x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d);
    }
  };
  edge(x + r, y, x + w - r, y, 0, 1);
  edge(x + w, y + r, x + w, y + h - r, -1, 0);
  edge(x + w - r, y + h, x + r, y + h, 0, -1);
  edge(x, y + h - r, x, y + r, 1, 0);
  return out;
}

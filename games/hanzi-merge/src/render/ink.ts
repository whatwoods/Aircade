/**
 * 墨与纸（§2.4 / §6.5）：宣纸纹理、晕染精灵、「墨显」遮罩、「笔扫」遮罩。
 * 全部在启动时预生成，运行时只做 drawImage 与合成模式切换（无每帧分配）。
 */
import { Rng } from '../core/rng.ts';

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 1D 周期值噪声（用于边缘起伏） */
function periodicNoise(rng: Rng, n: number, octaves: number[]): Float32Array {
  const out = new Float32Array(n);
  for (const oct of octaves) {
    const pts = new Float32Array(oct);
    for (let i = 0; i < oct; i++) pts[i] = rng.next() * 2 - 1;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * oct;
      const i0 = Math.floor(t) % oct;
      const i1 = (i0 + 1) % oct;
      const f = t - Math.floor(t);
      const s = f * f * (3 - 2 * f);
      out[i] += (pts[i0] * (1 - s) + pts[i1] * s) / (oct / octaves[0]);
    }
  }
  return out;
}

/** 宣纸：512² 可平铺纹理（值噪声 + 400 根短纤维 + 稀疏草屑） */
export function makePaper(seed = 7): HTMLCanvasElement {
  const N = 512;
  const c = canvas(N, N);
  const g = c.getContext('2d')!;
  g.fillStyle = '#F2EBDD';
  g.fillRect(0, 0, N, N);
  const rng = new Rng(seed);
  // 值噪声云纹
  const img = g.getImageData(0, 0, N, N);
  const G = 32;
  const grid = new Float32Array((G + 1) * (G + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  for (let y = 0; y <= G; y++) grid[y * (G + 1) + G] = grid[y * (G + 1)];
  for (let x = 0; x <= G; x++) grid[G * (G + 1) + x] = grid[x];
  const d = img.data;
  for (let y = 0; y < N; y++) {
    const gy = (y / N) * G;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < N; x++) {
      const gx = (x / N) * G;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const sx = fx * fx * (3 - 2 * fx);
      const a = grid[y0 * (G + 1) + x0];
      const b = grid[y0 * (G + 1) + x0 + 1];
      const cc = grid[(y0 + 1) * (G + 1) + x0];
      const dd = grid[(y0 + 1) * (G + 1) + x0 + 1];
      const v = (a * (1 - sx) + b * sx) * (1 - sy) + (cc * (1 - sx) + dd * sx) * sy;
      const k = (v - 0.5) * 10 + (rng.next() - 0.5) * 4;
      const i = (y * N + x) * 4;
      d[i] += k;
      d[i + 1] += k;
      d[i + 2] += k * 0.8;
    }
  }
  g.putImageData(img, 0, 0);
  // 纤维
  g.lineCap = 'round';
  for (let i = 0; i < 400; i++) {
    const x = rng.next() * N;
    const y = rng.next() * N;
    const len = 6 + rng.next() * 22;
    const a = rng.next() * Math.PI;
    g.strokeStyle = `rgba(214,199,170,${0.18 + rng.next() * 0.25})`;
    g.lineWidth = 0.6 + rng.next() * 0.8;
    for (const ox of [0, -N, N]) {
      for (const oy of [0, -N, N]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(
          x + ox + Math.cos(a) * len * 0.5 + (rng.next() - 0.5) * 4, y + oy + Math.sin(a) * len * 0.5 + (rng.next() - 0.5) * 4,
          x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len,
        );
        g.stroke();
      }
    }
  }
  // 草屑斑点
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(150,120,80,${0.1 + rng.next() * 0.15})`;
    g.beginPath();
    g.ellipse(rng.next() * N, rng.next() * N, 0.6 + rng.next() * 1.4, 0.4 + rng.next(), rng.next() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** 6 张 256² 晕染精灵：噪声边缘的墨团（白底透明，颜色 = 墨色） */
export function makeBlooms(color = '22,19,15', seed = 11): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  const rng = new Rng(seed);
  const S = 256;
  const STEPS = 96;
  for (let k = 0; k < 6; k++) {
    const c = canvas(S, S);
    const g = c.getContext('2d')!;
    const noise = periodicNoise(rng, STEPS, [5, 11, 23]);
    // 由外向内叠多层，模拟软边与洇痕
    const layers = 9;
    for (let L = 0; L < layers; L++) {
      const t = L / (layers - 1);
      const R = S * 0.5 * (0.98 - t * 0.55);
      g.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        const r = R * (0.84 + 0.16 * noise[i % STEPS] * (1 - t * 0.5));
        const x = S / 2 + Math.cos(a) * r;
        const y = S / 2 + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = `rgba(${color},${L === 0 ? 0.1 : 0.13})`;
      g.fill();
    }
    // 外圈水痕（略深的边）
    g.strokeStyle = `rgba(${color},0.1)`;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      const r = S * 0.49 * (0.84 + 0.16 * noise[i % STEPS]);
      const x = S / 2 + Math.cos(a) * r;
      const y = S / 2 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // 飞白缺口
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) {
      const a = rng.next() * Math.PI * 2;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 1 + rng.next() * 2;
      g.beginPath();
      g.arc(S / 2, S / 2, S * (0.3 + rng.next() * 0.15), a, a + 0.4 + rng.next() * 0.5);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    out.push(c);
  }
  return out;
}

/** 遮罩用的实心晕染（中心不透明、边缘噪声），尺寸 256 */
export function makeMaskBlooms(seed = 23): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  const rng = new Rng(seed);
  const S = 256;
  const STEPS = 120;
  for (let k = 0; k < 3; k++) {
    const c = canvas(S, S);
    const g = c.getContext('2d')!;
    const noise = periodicNoise(rng, STEPS, [6, 13, 29]);
    for (let L = 0; L < 6; L++) {
      const R = S * 0.5 * (1 - L * 0.06);
      g.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        const r = R * (0.8 + 0.2 * noise[i % STEPS]);
        const x = S / 2 + Math.cos(a) * r;
        const y = S / 2 + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = `rgba(0,0,0,${L === 5 ? 1 : 0.22})`;
      g.fill();
    }
    out.push(c);
  }
  return out;
}

/**
 * 遮罩显字器：复用一块离屏画布。
 *  - bloomReveal：字形以噪声边晕染从中心洇开（墨显）
 *  - sweepReveal：一笔带毛边的宽笔触从左上扫到右下（笔扫，带飞白）
 */
export class Revealer {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private edge: Float32Array;
  private gaps: Float32Array;
  dpr = 2;
  private masks: HTMLCanvasElement[];
  constructor(masks: HTMLCanvasElement[], size = 200) {
    this.masks = masks;
    this.c = canvas(size * 2, size * 2);
    this.g = this.c.getContext('2d')!;
    const rng = new Rng(97);
    this.edge = periodicNoise(rng, 64, [4, 9, 17]);
    this.gaps = new Float32Array(6);
    for (let i = 0; i < 6; i++) this.gaps[i] = rng.next();
  }

  setDpr(dpr: number): void {
    this.dpr = dpr;
    const need = Math.ceil(200 * dpr);
    if (this.c.width !== need) {
      this.c.width = need;
      this.c.height = need;
    }
  }

  private begin(src: HTMLCanvasElement, w: number, h: number): number {
    const g = this.g;
    const S = this.c.width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, S, S);
    // 源字形缓存画到中心（logical → 离屏像素）
    const k = this.dpr;
    g.drawImage(src, S / 2 - (w * k) / 2, S / 2 - (h * k) / 2, w * k, h * k);
    return S;
  }

  /** 把 src 字形（已缓存，box 尺寸 w×h 逻辑像素）以晕染遮罩显示，p ∈ [0,1] */
  bloomReveal(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, p: number, mask = 0, alpha = 1): void {
    if (p <= 0) return;
    if (p >= 1) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(src, cx - w / 2, cy - h / 2, w, h);
      ctx.globalAlpha = 1;
      return;
    }
    const S = this.begin(src, w, h);
    const g = this.g;
    g.globalCompositeOperation = 'destination-in';
    const r = Math.max(w, h) * 1.25 * p * this.dpr;
    const m = this.masks[mask % this.masks.length];
    g.drawImage(m, S / 2 - r / 2, S / 2 - r / 2, r, r);
    const k = this.dpr;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.c, cx - S / k / 2, cy - S / k / 2, S / k, S / k);
    ctx.globalAlpha = 1;
  }

  /** 笔扫：从左上到右下，p ∈ [0,1] */
  sweepReveal(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, p: number, alpha = 1): void {
    if (p <= 0) return;
    if (p >= 1) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(src, cx - w / 2, cy - h / 2, w, h);
      ctx.globalAlpha = 1;
      return;
    }
    const S = this.begin(src, w, h);
    const g = this.g;
    g.globalCompositeOperation = 'destination-in';
    // 遮罩：对角线 u = x + y < front，边缘带噪声起伏，前沿处几道飞白缺口
    const k = this.dpr;
    const x0 = S / 2 - (w * k) / 2;
    const y0 = S / 2 - (h * k) / 2;
    const W = w * k;
    const H = h * k;
    const front = (W + H) * (p * 1.15);
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(x0 - 4, y0 - 4);
    const N = this.edge.length;
    for (let i = 0; i <= N; i++) {
      const t = i / N; // 沿前沿从右上到左下
      const u = front + this.edge[i % N] * 10 * k;
      // 前沿线：x + y = u；参数化 x 从 u 到 0
      const x = x0 + u * (1 - t) - 4;
      const y = y0 + u * t - 4;
      g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    // 飞白：前沿附近擦掉几条细缝（仍保留下层主体）
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < this.gaps.length; i++) {
      const off = (this.gaps[i] - 0.5) * 0.8;
      const u = front - (8 + this.gaps[i] * 18) * k;
      g.lineWidth = (0.8 + this.gaps[(i + 1) % 6] * 1.6) * k;
      g.beginPath();
      g.moveTo(x0 + u * (0.5 + off) - 6 * k, y0 + u * (0.5 - off) + 6 * k);
      g.lineTo(x0 + u * (0.5 + off) + 6 * k, y0 + u * (0.5 - off) - 6 * k);
      g.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.c, cx - S / k / 2, cy - S / k / 2, S / k, S / k);
    ctx.globalAlpha = 1;
  }
}

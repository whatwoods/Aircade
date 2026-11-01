// 背景雾、漂浮失焦棋子、桌面两侧装饰、棋盘石板（第 4.4、6.9 节）
import { C, fNum } from './theme.ts';
import { Rng } from '../core/rng.ts';

function noiseTile(size: number, alpha: number, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  const r = new Rng(seed, 'noise');
  // 低频云 + 高频颗粒
  const low = new Float32Array(17 * 17);
  for (let i = 0; i < low.length; i++) low[i] = r.next();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * 16, fy = (y / size) * 16;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = low[iy * 17 + ix], b = low[iy * 17 + ((ix + 1) % 16)];
      const c = low[((iy + 1) % 16) * 17 + ix], d = low[((iy + 1) % 16) * 17 + ((ix + 1) % 16)];
      const v = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
      const grain = r.next();
      const val = Math.floor(255 * (v * 0.55 + grain * 0.45));
      const k = (y * size + x) * 4;
      img.data[k] = val; img.data[k + 1] = val; img.data[k + 2] = val;
      img.data[k + 3] = Math.floor(255 * alpha);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

let noiseCache: HTMLCanvasElement | null = null;
export function getNoise(): HTMLCanvasElement {
  if (!noiseCache) noiseCache = noiseTile(256, 0.06, 7);
  return noiseCache;
}

interface Bokeh { x: number; y: number; r: number; vx: number; vy: number; white: boolean; a: number; phase: number }

export class Backdrop {
  private cache: HTMLCanvasElement | null = null;
  private w = 0; private h = 0; private dpr = 1;
  private bokeh: Bokeh[] = [];
  private bokehSpr: { b: HTMLCanvasElement; w: HTMLCanvasElement } | null = null;
  private t = 0;

  constructor() {
    const r = new Rng(11, 'bokeh');
    for (let i = 0; i < 14; i++) {
      this.bokeh.push({
        x: r.next(), y: r.next(), r: 20 + r.next() * 70,
        vx: (r.next() - 0.5) * 12, vy: -6 - r.next() * 8, white: i % 2 === 0, a: 0.06 + r.next() * 0.07, phase: r.next() * 6,
      });
    }
  }

  private makeBokeh(white: boolean): HTMLCanvasElement {
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d')!;
    const gr = g.createRadialGradient(S * 0.42, S * 0.4, 2, S / 2, S / 2, S / 2);
    if (white) {
      gr.addColorStop(0, 'rgba(250,252,255,1)');
      gr.addColorStop(0.55, 'rgba(220,228,236,0.85)');
      gr.addColorStop(0.8, 'rgba(200,212,224,0.35)');
      gr.addColorStop(1, 'rgba(200,212,224,0)');
    } else {
      gr.addColorStop(0, 'rgba(40,46,54,1)');
      gr.addColorStop(0.55, 'rgba(10,12,15,0.9)');
      gr.addColorStop(0.8, 'rgba(10,12,15,0.4)');
      gr.addColorStop(1, 'rgba(10,12,15,0)');
    }
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    return cv;
  }

  /** 生成静态层（屏幕像素） */
  build(w: number, h: number, dpr: number, frame: { x: number; y: number; w: number; h: number }): void {
    this.w = w; this.h = h; this.dpr = dpr;
    if (!this.bokehSpr) this.bokehSpr = { b: this.makeBokeh(false), w: this.makeBokeh(true) };
    const cv = this.cache ?? document.createElement('canvas');
    cv.width = Math.max(1, Math.floor(w * dpr)); cv.height = Math.max(1, Math.floor(h * dpr));
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 底色 + 雾
    g.fillStyle = C.bgDeep;
    g.fillRect(0, 0, w, h);
    const fog = g.createLinearGradient(0, 0, 0, h);
    fog.addColorStop(0, '#2B3540');
    fog.addColorStop(0.45, C.bgBase);
    fog.addColorStop(1, '#181E25');
    g.fillStyle = fog;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.3, h * 0.12, 0, w * 0.3, h * 0.12, Math.max(w, h) * 0.7);
    glow.addColorStop(0, 'rgba(160,200,230,0.10)');
    glow.addColorStop(1, 'rgba(160,200,230,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    // 瑞士网格
    g.strokeStyle = 'rgba(255,255,255,0.025)';
    g.lineWidth = 1;
    const step = 64;
    const gx0 = (frame.x + frame.w / 2) % step;
    g.beginPath();
    for (let x = gx0; x < w; x += step) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, h); }
    for (let y = 0; y < h; y += step) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); }
    g.stroke();
    // 噪点
    const pat = g.createPattern(getNoise(), 'repeat');
    if (pat) { g.globalAlpha = 0.5; g.fillStyle = pat; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
    // 桌面两侧装饰
    const side = (w - frame.w) / 2;
    if (side > 120) {
      g.save();
      g.fillStyle = 'rgba(236,241,245,0.04)';
      const big = Math.min(240, side * 0.9);
      g.font = fNum(300, big);
      g.textBaseline = 'alphabetic';
      g.translate(frame.x - side * 0.5 + big * 0.36, h * 0.5);
      g.rotate(-Math.PI / 2);
      g.textAlign = 'center';
      g.fillText('FIVE', 0, 0);
      g.restore();
      g.save();
      g.fillStyle = 'rgba(236,241,245,0.04)';
      g.font = fNum(300, big);
      g.translate(frame.x + frame.w + side * 0.5 - big * 0.36, h * 0.5);
      g.rotate(Math.PI / 2);
      g.textAlign = 'center';
      g.fillText('DROP', 0, 0);
      g.restore();
      // 细线与编号
      g.fillStyle = 'rgba(162,176,189,0.5)';
      g.font = fNum(600, 11);
      g.textAlign = 'left';
      g.fillText('05 — FIVE DROP', 32, 40);
      g.fillStyle = C.divider;
      g.fillRect(32, 50, Math.min(side - 64, 220), 1);
    }
    // 帧外阴影与描边
    if (side > 4) {
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.45)';
      g.shadowBlur = 40;
      g.fillStyle = C.bgBase;
      g.fillRect(frame.x, frame.y, frame.w, frame.h);
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.strokeRect(frame.x - 0.5, frame.y - 0.5, frame.w + 1, frame.h + 1);
    }
    // 暗角
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    this.cache = cv;
  }


  update(dt: number): void {
    this.t += dt;
    for (const b of this.bokeh) {
      b.x += (b.vx * dt) / Math.max(1, this.w);
      b.y += (b.vy * dt) / Math.max(1, this.h);
      if (b.y < -0.15) { b.y = 1.15; }
      if (b.x < -0.15) b.x = 1.15; else if (b.x > 1.15) b.x = -0.15;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.cache) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.cache, 0, 0);
    if (!this.bokehSpr) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const b of this.bokeh) {
      const a = b.a * (0.8 + 0.2 * Math.sin(this.t * 0.6 + b.phase));
      ctx.globalAlpha = a;
      const s = b.r * 2;
      ctx.drawImage(b.white ? this.bokehSpr.w : this.bokehSpr.b, b.x * this.w - b.r, b.y * this.h - b.r, s, s);
    }
    ctx.globalAlpha = 1;
  }
}

/** 棋盘石板（逻辑尺寸 w×h，按 k 缩放渲染） */
export function buildSlab(cols: number, rows: number, cell: number, k: number): HTMLCanvasElement {
  const pad = 14;
  const w = cols * cell, h = rows * cell;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((w + pad * 2) * k); cv.height = Math.ceil((h + pad * 2) * k);
  const g = cv.getContext('2d')!;
  g.scale(k, k);
  g.translate(pad, pad);
  // 外投影
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.4)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 6;
  g.fillStyle = C.slabBottom;
  roundRect(g, 0, 0, w, h, 6);
  g.fill();
  g.restore();
  // 渐变
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, C.slabTop);
  gr.addColorStop(1, C.slabBottom);
  g.fillStyle = gr;
  roundRect(g, 0, 0, w, h, 6);
  g.fill();
  g.save();
  roundRect(g, 0, 0, w, h, 6);
  g.clip();
  // 左上柔光
  const lg = g.createRadialGradient(w * 0.15, h * 0.05, 0, w * 0.15, h * 0.05, h * 0.8);
  lg.addColorStop(0, 'rgba(220,235,250,0.16)');
  lg.addColorStop(1, 'rgba(220,235,250,0)');
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  // 噪点
  const pat = g.createPattern(getNoise(), 'repeat');
  if (pat) { g.save(); g.scale(1 / k, 1 / k); g.globalAlpha = 0.9; g.fillStyle = pat; g.fillRect(0, 0, w * k, h * k); g.restore(); }
  // 刻线（画在格子中心 = 交叉点）
  const lw = 1 / k;
  for (let c = 0; c < cols; c++) {
    const x = c * cell + cell / 2;
    g.fillStyle = C.slabLineDark;
    g.fillRect(x + lw, cell / 2, Math.max(lw, 1), h - cell);
    g.fillStyle = C.slabLine;
    g.fillRect(x, cell / 2, Math.max(lw, 1), h - cell);
  }
  for (let r = 0; r < rows; r++) {
    const y = r * cell + cell / 2;
    g.fillStyle = C.slabLineDark;
    g.fillRect(cell / 2, y + lw, w - cell, Math.max(lw, 1));
    g.fillStyle = C.slabLine;
    g.fillRect(cell / 2, y, w - cell, Math.max(lw, 1));
  }
  // 星位
  g.fillStyle = C.hoshi;
  for (const [c, r] of [[2, 3], [6, 3], [4, 7], [2, 11], [6, 11]]) {
    g.beginPath(); g.arc(c * cell + cell / 2 + 0.5, r * cell + cell / 2 + 0.5, 3, 0, Math.PI * 2); g.fill();
  }
  // 内阴影
  g.strokeStyle = 'rgba(20,28,36,0.35)';
  g.lineWidth = 10;
  g.filter = 'none';
  const ig = g.createLinearGradient(0, 0, 0, 14);
  ig.addColorStop(0, 'rgba(20,28,36,0.28)');
  ig.addColorStop(1, 'rgba(20,28,36,0)');
  g.fillStyle = ig;
  g.fillRect(0, 0, w, 14);
  g.restore();
  // 倒角高光
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  roundRect(g, 0.5, 0.5, w - 1, h - 1, 6);
  g.stroke();
  return cv;
}

export const SLAB_PAD = 14;

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

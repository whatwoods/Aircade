import { flicker } from '../core/noise';
import { COLS, ROWS, N, cx, cy } from '../game/board';
import { type Sprite, makeCanvas, radialBlob } from './gfx';
import type { Layout } from './layout';

/** 每格 texel 数（文档 §4.4） */
export const TEX = 8;
const MARGIN = 1;
export const LW = (COLS + MARGIN * 2) * TEX; // 88
export const LH = (ROWS + MARGIN * 2) * TEX; // 112

export interface LightInput {
  /** 每格光照（0..1，boardView 驱动，含波纹缓动） */
  cell: Float32Array;
  /** 每格烛台点亮度（0..1） */
  candle: Float32Array;
  /** 每格粉色血瓶光（0..1） */
  potion: Float32Array;
  /** 熄灭系数（死亡波纹，1 = 正常，0 = 熄灭） */
  ext: Float32Array;
  candleCell: Uint8Array;
  /** 入口火把点燃度 */
  brazier: number;
  /** 指针火把（格坐标，-1 = 无） */
  ptrX: number;
  ptrY: number;
  ptrStrength: number;
  ptrRadius: number;
  /** 龙巢呼吸光强度 */
  lair: number;
  /** 龙巢金红光圈（巨龙苏醒） */
  lairRing: number;
  /** 全局倍率（升级 ×1.6） */
  boost: number;
  /** 胜利：0..1 → 黑暗消散 */
  dawn: number;
  /** 低血：烛光 −10% */
  dim: number;
  /** 关闭雾（自适应质量） */
  fog: boolean;
}

interface Fog {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  ph: number;
  a: number;
}

/**
 * 低分辨率光照图：darkCanvas（destination-out 挖光）+ glowCanvas（lighter 暖辉光）+ 雾。
 * 每帧只有 3 次大面积 drawImage。
 */
export class Lighting {
  readonly dark: HTMLCanvasElement;
  readonly glow: HTMLCanvasElement;
  readonly fog: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private gctx: CanvasRenderingContext2D;
  private fctx: CanvasRenderingContext2D;
  private white: Sprite;
  private soft: Sprite;
  private amber: Sprite;
  private red: Sprite;
  private pink: Sprite;
  private gold: Sprite;
  private ringSpr: Sprite;
  private edge: HTMLCanvasElement;
  private fogSpr: Sprite;
  private fogs: Fog[] = [];
  darkAlpha = 0.85;
  glowAlpha = 0.26;
  /** 用于其他模块查询：每格最终亮度估计（0..1） */
  readonly bright = new Float32Array(N);

  constructor() {
    [this.dark, this.dctx] = makeCanvas(LW, LH);
    [this.glow, this.gctx] = makeCanvas(LW, LH);
    [this.fog, this.fctx] = makeCanvas(LW, LH);
    this.white = radialBlob(64, '#FFFFFF', 0, 1.5);
    this.soft = radialBlob(64, '#FFFFFF', 0.22, 1.0);
    this.amber = radialBlob(64, '#FFB54A', 0, 1.3);
    this.red = radialBlob(64, '#FF3B1F', 0, 1.2);
    this.pink = radialBlob(64, '#FF7FA0', 0, 1.3);
    this.gold = radialBlob(64, '#FFD27A', 0, 1.2);
    this.fogSpr = radialBlob(64, '#2B3550', 0, 1.1);
    this.ringSpr = (() => {
      const [c, x] = makeCanvas(64, 64);
      const g = x.createRadialGradient(32, 32, 18, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,90,40,0)');
      g.addColorStop(0.6, 'rgba(255,120,50,1)');
      g.addColorStop(1, 'rgba(255,90,40,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      return { c, w: 64, h: 64 };
    })();
    // 边缘渐隐遮罩：棋盘内 0，向外 1 格内升到 1
    const [e, ex] = makeCanvas(LW, LH);
    const img = ex.createImageData(LW, LH);
    const x0 = MARGIN * TEX;
    const y0 = MARGIN * TEX;
    const x1 = LW - MARGIN * TEX;
    const y1 = LH - MARGIN * TEX;
    for (let y = 0; y < LH; y++)
      for (let x = 0; x < LW; x++) {
        const dx = Math.max(x0 - (x + 0.5), 0, x + 0.5 - x1);
        const dy = Math.max(y0 - (y + 0.5), 0, y + 0.5 - y1);
        const dd = Math.max(dx, dy);
        const t = Math.min(1, dd / (TEX * 0.85));
        const a = t * t * (3 - 2 * t);
        const k = (y * LW + x) * 4;
        img.data[k] = 255;
        img.data[k + 1] = 255;
        img.data[k + 2] = 255;
        img.data[k + 3] = Math.round(a * 255);
      }
    ex.putImageData(img, 0, 0);
    this.edge = e;
    for (let k = 0; k < 6; k++) {
      this.fogs.push({
        x: Math.random() * LW,
        y: Math.random() * LH * 0.8,
        r: 34 + Math.random() * 26,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8),
        vy: (Math.random() - 0.5) * 0.4,
        ph: Math.random() * 10,
        a: 0.6 + Math.random() * 0.35,
      });
    }
  }

  render(inp: LightInput, tSec: number, dtSec: number): void {
    const d = this.dctx;
    const g = this.gctx;
    const boost = inp.boost;
    const dawn = inp.dawn;
    d.globalCompositeOperation = 'source-over';
    d.globalAlpha = 1;
    d.clearRect(0, 0, LW, LH);
    d.fillStyle = `rgba(7,9,18,1)`;
    d.globalAlpha = this.darkAlpha * (1 - dawn);
    d.fillRect(0, 0, LW, LH);
    d.globalCompositeOperation = 'destination-out';
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, LW, LH);
    g.globalCompositeOperation = 'lighter';
    const T = TEX;
    const dim = 1 - inp.dim * 0.1;
    // 已翻开格
    const rC = 1.5 * T;
    for (let i = 0; i < N; i++) {
      const l = inp.cell[i] * inp.ext[i];
      this.bright[i] = 0;
      if (l <= 0.01) continue;
      const x = (cx(i) + MARGIN) * T + T / 2;
      const y = (cy(i) + MARGIN) * T + T / 2;
      const f = 1 + 0.05 * flicker(tSec, i * 0.37);
      const s = Math.min(1, l * f * boost * dim);
      d.globalAlpha = s;
      d.drawImage(this.soft.c, x - rC, y - rC, rC * 2, rC * 2);
      g.globalAlpha = Math.min(1, 0.32 * l * boost * dim);
      g.drawImage(this.amber.c, x - rC, y - rC, rC * 2, rC * 2);
    }
    // 烛台
    const rK = 2.4 * T;
    for (let i = 0; i < N; i++) {
      const k = inp.candle[i] * inp.ext[i];
      if (k <= 0.01) continue;
      const fl = flicker(tSec, i * 1.13 + 3);
      const x = (cx(i) + MARGIN) * T + T * 0.28 + 0.6 * flicker(tSec * 1.3, i + 9);
      const y = (cy(i) + MARGIN) * T + T * 0.62 + 0.6 * flicker(tSec * 1.1, i + 21);
      const s = Math.min(1, k * (1 + 0.14 * fl) * boost * dim);
      d.globalAlpha = s;
      d.drawImage(this.white.c, x - rK, y - rK, rK * 2, rK * 2);
      g.globalAlpha = Math.min(1, 0.95 * s);
      g.drawImage(this.amber.c, x - rK, y - rK, rK * 2, rK * 2);
    }
    // 入口火把
    if (inp.brazier > 0.01) {
      const rB = 3 * T;
      for (let side = 0; side < 2; side++) {
        const fl = flicker(tSec, 50 + side * 7);
        const x = (side === 0 ? 3.12 : 5.88) * T + MARGIN * T + 0.6 * flicker(tSec * 1.4, 60 + side);
        const y = (11.25 + MARGIN) * T;
        const s = Math.min(1, inp.brazier * (1 + 0.14 * fl) * boost * dim * inp.ext[COLS * 11 + 3 + side * 2]);
        d.globalAlpha = s;
        d.drawImage(this.white.c, x - rB, y - rB, rB * 2, rB * 2);
        g.globalAlpha = Math.min(1, s);
        g.drawImage(this.amber.c, x - rB, y - rB, rB * 2, rB * 2);
      }
    }
    // 血瓶粉光
    const rP = 0.9 * T * 1.6;
    for (let i = 0; i < N; i++) {
      const p = inp.potion[i];
      if (p <= 0.01) continue;
      const x = (cx(i) + MARGIN) * T + T / 2;
      const y = (cy(i) + MARGIN) * T + T / 2;
      const s = p * (0.9 + 0.1 * Math.sin(tSec * 2.4 + i));
      d.globalAlpha = 0.4 * s;
      d.drawImage(this.white.c, x - rP, y - rP, rP * 2, rP * 2);
      g.globalAlpha = 0.75 * s;
      g.drawImage(this.pink.c, x - rP, y - rP, rP * 2, rP * 2);
    }
    // 龙巢呼吸光
    const lx = (4 + MARGIN) * T + T / 2;
    const ly = (5 + MARGIN) * T + T / 2;
    if (inp.lair > 0.01) {
      const rL = 2.2 * T;
      d.globalAlpha = inp.lair * 0.35;
      d.drawImage(this.white.c, lx - rL, ly - rL, rL * 2, rL * 2);
      g.globalAlpha = Math.min(1, inp.lair);
      g.drawImage(this.red.c, lx - rL, ly - rL, rL * 2, rL * 2);
    }
    if (inp.lairRing > 0.01) {
      const rR = 2.3 * T;
      g.globalAlpha = Math.min(1, inp.lairRing);
      g.drawImage(this.ringSpr.c, lx - rR, ly - rR, rR * 2, rR * 2);
    }
    // 指针火把
    if (inp.ptrX >= 0 && inp.ptrStrength > 0.01) {
      const r = inp.ptrRadius * T;
      const x = (inp.ptrX + MARGIN) * T;
      const y = (inp.ptrY + MARGIN) * T;
      d.globalAlpha = inp.ptrStrength;
      d.drawImage(this.white.c, x - r, y - r, r * 2, r * 2);
      g.globalAlpha = inp.ptrStrength * 0.5;
      g.drawImage(this.amber.c, x - r, y - r, r * 2, r * 2);
    }
    // 升级：全图镀金
    if (boost > 1.01) {
      g.globalAlpha = Math.min(1, (boost - 1) * 0.5);
      g.drawImage(this.gold.c, -LW * 0.2, -LH * 0.2, LW * 1.4, LH * 1.4);
    }
    // 边缘渐隐
    d.globalAlpha = 1;
    d.drawImage(this.edge, 0, 0);
    d.globalCompositeOperation = 'source-over';
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // 雾：仅在黑暗处
    if (inp.fog) {
      const f = this.fctx;
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, LW, LH);
      for (const fg of this.fogs) {
        fg.x += fg.vx * dtSec;
        fg.y += fg.vy * dtSec;
        if (fg.x < -fg.r) fg.x = LW + fg.r;
        if (fg.x > LW + fg.r) fg.x = -fg.r;
        if (fg.y < -fg.r * 0.5) fg.y = LH;
        if (fg.y > LH + fg.r * 0.5) fg.y = 0;
        const r = fg.r * (1 + 0.12 * Math.sin(tSec * 0.21 + fg.ph));
        f.globalAlpha = fg.a;
        f.drawImage(this.fogSpr.c, fg.x - r, fg.y - r * 0.7, r * 2, r * 1.4);
      }
      f.globalCompositeOperation = 'destination-in';
      f.globalAlpha = 1;
      f.drawImage(this.dark, 0, 0);
      f.globalCompositeOperation = 'source-over';
    }
  }

  composite(ctx: CanvasRenderingContext2D, L: Layout, fogOn: boolean, glowMul = 1): void {
    const c = L.cell;
    const x = L.board.x - c * MARGIN;
    const y = L.board.y - c * MARGIN;
    const w = LW * (c / TEX);
    const h = LH * (c / TEX);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.dark, x, y, w, h);
    if (fogOn) {
      ctx.globalAlpha = 0.16;
      ctx.drawImage(this.fog, x, y, w, h);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, this.glowAlpha * glowMul);
    ctx.drawImage(this.glow, x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

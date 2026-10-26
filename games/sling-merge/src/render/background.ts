/**
 * 背景（docs §4.7 背景 / §6.9）：
 * - 舞台背景：奶油 → 草莓牛奶竖向渐变、30° 白斜纹、糖粒、梅子暗角、噪点（预渲染一张）。
 * - 桌面背景 #bg：径向渐变、3 团漂移柔光、10 颗漂浮水果（视差）、糖粒与噪点；最多 30fps，失焦停。
 */
import { CONFIG } from '../config';
import type { StageMetrics } from '../core/stage';
import { prng, ctx2d, makeCanvas, rrect } from './util';
import { drawSprite, type Sprites } from './sprites';

const PERIODS = [26, 34, 21];
const RADII = [300, 240, 320];
const ANCHORS = [0.18, 0.25, 0.82, 0.3, 0.7, 0.85];
const SUGAR = ['#FF6F91', '#5FD3B3', '#FFE15A', '#7C86FF', '#FFB13D', '#B07CFF'];

function noiseCanvas(size: number, alpha: number, seed: number): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(size, size);
  const rnd = prng(seed);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = rnd() < 0.5 ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = Math.round(rnd() * 255 * alpha);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function sprinkles(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, seed: number, alpha: number): void {
  const rnd = prng(seed);
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.translate(rnd() * w, rnd() * h);
    ctx.rotate(rnd() * Math.PI);
    ctx.fillStyle = SUGAR[i % SUGAR.length]!;
    ctx.beginPath();
    rrect(ctx, -3, -1, 6, 2, 1);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

interface Floater {
  level: number;
  x: number;
  y: number;
  s: number;
  rot: number;
  vr: number;
  ph: number;
  depth: number;
}

export class Background {
  private stageC: HTMLCanvasElement | null = null;
  private ratio = 0;
  private blob: HTMLCanvasElement[] = [];
  private noise: HTMLCanvasElement | null = null;
  private sugar: HTMLCanvasElement | null = null;
  private floaters: Floater[] = [];
  private acc = 1;
  private t = 0;
  private mx = 0;
  private my = 0;
  private pmx = 0;
  private pmy = 0;
  private dirty = true;
  animate = true;
  private sprites: Sprites;

  constructor(sprites: Sprites) {
    this.sprites = sprites;
    const rnd = prng(2024);
    const levels = [3, 4, 5, 6, 7, 8, 9, 5, 6, 3];
    for (let i = 0; i < 10; i++) {
      this.floaters.push({
        level: levels[i]!,
        x: rnd(),
        y: rnd(),
        s: 0.8 + rnd() * 0.8,
        rot: rnd() * Math.PI * 2,
        vr: (rnd() - 0.5) * 0.25,
        ph: rnd() * Math.PI * 2,
        depth: 0.4 + rnd() * 0.6,
      });
    }
    window.addEventListener('pointermove', (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
    }, { passive: true });
  }

  /** 舞台背景（逻辑 390×844） */
  build(ratio: number): void {
    if (this.stageC && Math.abs(ratio - this.ratio) / ratio < 0.1) return;
    this.ratio = ratio;
    const W = CONFIG.layout.stageW;
    const Hh = CONFIG.layout.stageH;
    const r = Math.min(ratio, 2);
    const c = makeCanvas(W * r, Hh * r);
    const ctx = ctx2d(c);
    ctx.scale(c.width / W, c.height / Hh);
    const g = ctx.createLinearGradient(0, 0, 0, Hh);
    g.addColorStop(0, '#FFF5E9');
    g.addColorStop(1, '#FFE4EE');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Hh);
    // 30° 白斜纹：每 36 px 一条，宽 18
    ctx.save();
    ctx.globalAlpha = 0.06 * 3.5;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.translate(W / 2, Hh / 2);
    ctx.rotate(-Math.PI / 6);
    for (let x = -700; x < 700; x += 36) ctx.fillRect(x, -700, 18, 1400);
    ctx.restore();
    sprinkles(ctx, W, Hh, 70, 7, 0.25);
    // 暗角
    const v = ctx.createRadialGradient(W / 2, Hh * 0.45, Hh * 0.35, W / 2, Hh * 0.5, Hh * 0.75);
    v.addColorStop(0, 'rgba(91,58,94,0)');
    v.addColorStop(1, 'rgba(91,58,94,0.08)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, Hh);
    // 噪点
    const nz = noiseCanvas(128, 0.06, 99);
    const pat = ctx.createPattern(nz, 'repeat');
    if (pat) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, Hh);
      ctx.globalAlpha = 1;
    }
    this.stageC = c;
    this.dirty = true;
  }

  drawStage(ctx: CanvasRenderingContext2D): void {
    const c = this.stageC!;
    ctx.drawImage(c, 0, 0, CONFIG.layout.stageW, CONFIG.layout.stageH);
  }

  private ensureDesk(): void {
    if (this.blob.length) return;
    const cols = ['rgba(201,244,230,', 'rgba(255,241,184,', 'rgba(255,214,201,'];
    for (const col of cols) {
      const c = makeCanvas(64, 64);
      const ctx = ctx2d(c);
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, col + '0.6)');
      g.addColorStop(0.6, col + '0.3)');
      g.addColorStop(1, col + '0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      this.blob.push(c);
    }
    this.noise = noiseCanvas(128, 0.05, 5);
    const s = makeCanvas(160, 160);
    sprinkles(ctx2d(s), 160, 160, 8, 11, 0.3);
    this.sugar = s;
  }

  private grad: CanvasGradient | null = null;
  private gradKey = 0;
  private sugarPat: CanvasPattern | null = null;
  private noisePat: CanvasPattern | null = null;

  markDirty(): void {
    this.dirty = true;
    this.gradKey = 0;
  }

  /** 桌面背景（有留白时才画；动画最多 30fps） */
  drawDesk(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, m: StageMetrics, realDt: number, active: boolean): void {
    const W = CONFIG.layout.stageW * m.scale;
    const Hh = CONFIG.layout.stageH * m.scale;
    const margins = m.vw - W > 1 || m.vh - Hh > 1;
    if (!margins) return;
    this.t += realDt;
    this.acc += realDt;
    const anim = this.animate && m.card && active;
    if (!this.dirty && (!anim || this.acc < 1 / 30)) return;
    this.acc = 0;
    this.dirty = false;
    this.ensureDesk();
    const k = canvas.width / m.vw;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const vw = m.vw;
    const vh = m.vh;
    if (this.gradKey !== vw * 10000 + vh || !this.grad) {
      this.gradKey = vw * 10000 + vh;
      this.grad = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      this.grad.addColorStop(0, '#FFF1F6');
      this.grad.addColorStop(1, '#F3DDF5');
      this.sugarPat = ctx.createPattern(this.sugar!, 'repeat');
      this.noisePat = ctx.createPattern(this.noise!, 'repeat');
    }
    ctx.fillStyle = this.grad;
    ctx.fillRect(0, 0, vw, vh);
    const t = this.t;
    // 柔光色块
    for (let i = 0; i < 3; i++) {
      const p = (t / PERIODS[i]!) * Math.PI * 2;
      const x = ANCHORS[i * 2]! * vw + Math.sin(p) * 80;
      const y = ANCHORS[i * 2 + 1]! * vh + Math.cos(p * 0.8) * 60;
      const R = RADII[i]!;
      ctx.drawImage(this.blob[i]!, x - R, y - R, R * 2, R * 2);
    }
    // 糖粒平铺
    if (this.sugarPat) {
      ctx.fillStyle = this.sugarPat;
      ctx.fillRect(0, 0, vw, vh);
    }
    // 漂浮水果（只在两侧留白）
    this.pmx += (this.mx - this.pmx) * 0.08;
    this.pmy += (this.my - this.pmy) * 0.08;
    const px = (this.pmx / vw - 0.5) * 24;
    const py = (this.pmy / vh - 0.5) * 24;
    const sideW = m.left;
    if (sideW > 40) {
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < this.floaters.length; i++) {
        const f = this.floaters[i]!;
        const left = i % 2 === 0;
        const x = left ? f.x * sideW * 0.9 + 20 : m.left + W + f.x * (vw - m.left - W) * 0.9;
        const y = f.y * vh + Math.sin(t * 0.5 + f.ph) * 14;
        const sprite = this.sprites.fruit(f.level).body;
        const rot = f.rot + t * f.vr;
        const cx = x + px * f.depth;
        const cy = y + py * f.depth;
        const c = Math.cos(rot) * k;
        const sn = Math.sin(rot) * k;
        ctx.setTransform(c, sn, -sn, c, cx * k, cy * k);
        drawSprite(ctx, sprite, 0, 0, f.s);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(k, 0, 0, k, 0, 0);
    }
    if (this.noisePat) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = this.noisePat;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }
}

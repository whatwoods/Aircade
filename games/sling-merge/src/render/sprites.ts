/**
 * 离屏精灵缓存（docs §2.5）：每级水果本体/高光/阴影/配件、粒子形状、溅痕、光晕。
 * 分辨率 = 逻辑尺寸 × pxRatio；pxRatio 变化超过 10% 时重建。
 */
import { CONFIG, fruitDef } from '../config';
import { drawFruitBody, drawGloss, kingCrown, pineappleCrown, SPRITE_EXTENT } from './fruitArt';
import { ctx2d, dropPath, heartPath, hexA, makeCanvas, prng, sparklePath, starPath } from './util';

export interface Sprite {
  c: HTMLCanvasElement;
  /** 逻辑尺寸（绘制时用） */
  w: number;
  h: number;
  /** 锚点（逻辑 px，相对左上） */
  ax: number;
  ay: number;
}

export interface FruitSprites {
  body: Sprite;
  gloss: Sprite;
  shadow: Sprite;
  extra: Sprite | null; // L9 叶冠 / L11 王冠
}

const TAU = Math.PI * 2;

function sprite(w: number, h: number, ax: number, ay: number, ratio: number, draw: (ctx: CanvasRenderingContext2D) => void): Sprite {
  const c = makeCanvas(w * ratio, h * ratio);
  const ctx = ctx2d(c);
  ctx.scale(c.width / w, c.height / h);
  ctx.translate(ax, ay);
  draw(ctx);
  return { c, w, h, ax, ay };
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1): void {
  ctx.drawImage(s.c, x - s.ax * scale, y - s.ay * scale, s.w * scale, s.h * scale);
}

export type ParticleShape = 'star' | 'heart' | 'sweat' | 'bubble' | 'seed' | 'sparkle' | 'dot' | 'tear';

export class Sprites {
  ratio = 1;
  private fruits: (FruitSprites | null)[] = [];
  private icons = new Map<number, HTMLCanvasElement>();
  private shapes = new Map<string, Sprite>();
  private splats: (Sprite[] | null)[] = [];
  glow: Sprite | null = null;
  rainbowRing: Sprite | null = null;
  raysSprite: Sprite | null = null;
  private queue: number[] = [];

  /** 每次重建 +1，供外部缓存失效 */
  version = 0;

  setRatio(r: number): boolean {
    if (Math.abs(r - this.ratio) / this.ratio < 0.1 && this.fruits.length) return false;
    this.ratio = r;
    this.version++;
    this.icons.clear();
    this.fruits = [];
    this.shapes.clear();
    this.splats = [];
    this.glow = null;
    this.rainbowRing = null;
    this.raysSprite = null;
    return true;
  }

  /** 预热：先生成标题页要用的，其余排队到空闲回调 */
  warm(first: number[]): void {
    for (const l of first) this.fruit(l);
    this.queue = [];
    for (let l = 1; l <= CONFIG.maxLevel; l++) if (!first.includes(l)) this.queue.push(l);
    const idle = (): void => {
      const l = this.queue.shift();
      if (l === undefined) return;
      this.fruit(l);
      schedule(idle);
    };
    schedule(idle);
  }

  fruit(level: number): FruitSprites {
    let s = this.fruits[level];
    if (s) return s;
    const def = fruitDef(level);
    const r = def.radius;
    const ext = SPRITE_EXTENT[level - 1]! * r + 4;
    const ratio = this.ratio;
    const body = sprite(ext * 2, ext * 2, ext, ext, ratio, (ctx) => drawFruitBody(ctx, level, r));
    const gloss = sprite(r * 2, r * 2, r, r, ratio, (ctx) => drawGloss(ctx, level, r));
    const sr = r * 1.32;
    const shadow = sprite(sr * 2, sr * 2, sr, sr, Math.min(ratio, 1), (ctx) => {
      const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, sr);
      g.addColorStop(0, 'rgba(91,58,94,0.15)');
      g.addColorStop(0.55, 'rgba(91,58,94,0.11)');
      g.addColorStop(1, 'rgba(91,58,94,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, sr, 0, TAU);
      ctx.fill();
    });
    let extra: Sprite | null = null;
    if (level === 9) {
      const w = r * 1.0;
      const h = r * 0.95;
      extra = sprite(w * 2, h, w, h * 0.86, ratio, (ctx) => pineappleCrown(ctx, r));
    } else if (level === 11) {
      const w = r * 0.62;
      const h = r * 0.62;
      extra = sprite(w * 2, h, w, h * 0.86, ratio, (ctx) => kingCrown(ctx, r));
    }
    s = { body, gloss, shadow, extra };
    this.fruits[level] = s;
    return s;
  }

  /** 彩虹西瓜身后的脉动光晕 */
  rainbowGlow(): Sprite {
    if (this.glow) return this.glow;
    const R = 140;
    this.glow = sprite(R * 2, R * 2, R, R, Math.min(this.ratio, 1), (ctx) => {
      const g = ctx.createRadialGradient(0, 0, 40, 0, 0, R);
      g.addColorStop(0, 'rgba(255,240,168,0.85)');
      g.addColorStop(0.35, 'rgba(255,201,60,0.35)');
      g.addColorStop(0.7, 'rgba(255,111,145,0.12)');
      g.addColorStop(1, 'rgba(255,111,145,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R, -R, R * 2, R * 2);
    });
    return this.glow;
  }

  /** 彩虹边光环（锥形渐变），绘制时旋转 */
  rainbow(): Sprite {
    if (this.rainbowRing) return this.rainbowRing;
    const r = fruitDef(11).radius;
    const R = r + 8;
    this.rainbowRing = sprite(R * 2, R * 2, R, R, this.ratio, (ctx) => {
      const cols = ['#FF6F91', '#FFB13D', '#FFE15A', '#5FD3B3', '#7C86FF', '#B07CFF', '#FF6F91'];
      const anyCtx = ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
      let g: CanvasGradient | string;
      if (anyCtx.createConicGradient) {
        const cg = anyCtx.createConicGradient(0, 0, 0);
        cols.forEach((c, i) => cg.addColorStop(i / (cols.length - 1), c));
        g = cg;
      } else {
        g = '#FFC93C';
      }
      ctx.strokeStyle = g;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, r + 1.5, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out';
      const fade = ctx.createRadialGradient(0, 0, r - 3, 0, 0, r + 6);
      fade.addColorStop(0, 'rgba(0,0,0,0.6)');
      fade.addColorStop(0.5, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = fade;
      ctx.fillRect(-R, -R, R * 2, R * 2);
    });
    return this.rainbowRing;
  }

  /** 光芒（单条，绘制时旋转复用） */
  ray(): Sprite {
    if (this.raysSprite) return this.raysSprite;
    const L = 280;
    this.raysSprite = sprite(L, 40, 0, 20, Math.min(this.ratio, 1), (ctx) => {
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(L, -20);
      ctx.lineTo(L, 20);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fill();
    });
    return this.raysSprite;
  }

  /** 粒子形状（白色或固定配色，染色靠 globalAlpha + 预设色） */
  shape(kind: ParticleShape, color = '#FFFFFF'): Sprite {
    const key = kind + color;
    let s = this.shapes.get(key);
    if (s) return s;
    const R = 16;
    s = sprite(R * 2, R * 2, R, R, Math.min(this.ratio, 2), (ctx) => {
      ctx.lineJoin = 'round';
      switch (kind) {
        case 'star':
          ctx.beginPath();
          starPath(ctx, 0, 0, 13, 6, 5);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case 'sparkle':
          ctx.beginPath();
          sparklePath(ctx, 0, 0, 14);
          ctx.fillStyle = color;
          ctx.fill();
          break;
        case 'heart':
          ctx.beginPath();
          heartPath(ctx, 0, 1, 11);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.ellipse(-4.5, -3, 2.4, 1.6, -0.6, 0, TAU);
          ctx.fill();
          break;
        case 'sweat':
        case 'tear':
          ctx.beginPath();
          dropPath(ctx, 0, 2, 7);
          ctx.fillStyle = kind === 'sweat' ? '#9BE3F5' : '#8FD3FF';
          ctx.fill();
          ctx.strokeStyle = '#4FB3D9';
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.ellipse(-2.4, 2, 1.6, 2.6, 0, 0, TAU);
          ctx.fill();
          break;
        case 'bubble': {
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, TAU);
          const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 13);
          g.addColorStop(0, 'rgba(255,255,255,0.5)');
          g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
          g.addColorStop(1, 'rgba(255,255,255,0.35)');
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.beginPath();
          ctx.ellipse(-5, -5.5, 3.2, 2, -0.7, 0, TAU);
          ctx.fill();
          break;
        }
        case 'seed':
          ctx.beginPath();
          ctx.ellipse(0, 0, 5, 8, 0, 0, TAU);
          ctx.fillStyle = '#3B2340';
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.ellipse(-1.5, -3, 1.4, 2.4, 0, 0, TAU);
          ctx.fill();
          break;
        case 'dot':
        default: {
          // 果汁滴：主色 + 高光点
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, TAU);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.arc(-4, -4.5, 3.4, 0, TAU);
          ctx.fill();
        }
      }
    });
    this.shapes.set(key, s);
    return s;
  }

  /** 果汁溅痕贴花（每级 2 种形状） */
  splat(level: number, variant: number): Sprite {
    let arr = this.splats[level];
    if (!arr) {
      arr = [];
      const def = fruitDef(level);
      for (let v = 0; v < 2; v++) {
        const rnd = prng(level * 31 + v * 7);
        const R = 44;
        arr.push(
          sprite(R * 2, R * 2, R, R, Math.min(this.ratio, 1.5), (ctx) => {
            ctx.fillStyle = hexA(def.colors.juice, 0.55);
            ctx.beginPath();
            const n = 11;
            for (let i = 0; i <= n; i++) {
              const a = (i / n) * TAU;
              const rr = 18 + rnd() * 10;
              const x = Math.cos(a) * rr;
              const y = Math.sin(a) * rr;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.quadraticCurveTo(Math.cos(a - 0.3) * (rr + 8), Math.sin(a - 0.3) * (rr + 8), x, y);
            }
            ctx.closePath();
            ctx.fill();
            for (let i = 0; i < 7; i++) {
              const a = rnd() * TAU;
              const d = 26 + rnd() * 14;
              ctx.beginPath();
              ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2 + rnd() * 4, 0, TAU);
              ctx.fill();
            }
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath();
            ctx.ellipse(-6, -7, 7, 4, -0.6, 0, TAU);
            ctx.fill();
          }),
        );
      }
      this.splats[level] = arr;
    }
    return arr[variant % 2]!;
  }

  /** HUD/面板用的小图标（含待机表情）；size = 直径（逻辑 px） */
  icon(level: number, size: number, drawFace?: (ctx: CanvasRenderingContext2D, level: number, r: number) => void): HTMLCanvasElement {
    const key = level * 1000 + Math.round(size * 10);
    let c = this.icons.get(key);
    if (c) return c;
    const def = fruitDef(level);
    const r = def.radius;
    const ext = SPRITE_EXTENT[level - 1]! * r + 4;
    const k = size / (2 * r);
    const px = Math.max(1, this.ratio);
    c = makeCanvas(ext * 2 * k * px, ext * 2 * k * px);
    const ctx = ctx2d(c);
    ctx.scale(c.width / (ext * 2), c.height / (ext * 2));
    ctx.translate(ext, ext);
    if (level === 9) {
      ctx.save();
      ctx.translate(0, -0.82 * r);
      pineappleCrown(ctx, r);
      ctx.restore();
    }
    drawFruitBody(ctx, level, r);
    drawGloss(ctx, level, r);
    if (drawFace) drawFace(ctx, level, r);
    if (level === 11) {
      ctx.save();
      ctx.translate(0, -0.84 * r);
      kingCrown(ctx, r);
      ctx.restore();
    }
    this.icons.set(key, c);
    return c;
  }

  /** 剪影图标（未发现） */
  silhouette(level: number, size: number): HTMLCanvasElement {
    const key = -(level * 1000 + Math.round(size * 10));
    let c = this.icons.get(key);
    if (c) return c;
    const base = this.icon(level, size);
    c = makeCanvas(base.width, base.height);
    const ctx = ctx2d(c);
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = 'rgba(91,58,94,0.18)';
    ctx.fillRect(0, 0, c.width, c.height);
    this.icons.set(key, c);
    return c;
  }

  /** 图标画布的逻辑尺寸（与 icon() 对应） */
  iconExtent(level: number, size: number): number {
    const r = fruitDef(level).radius;
    return (SPRITE_EXTENT[level - 1]! * r + 4) * 2 * (size / (2 * r));
  }
}

function schedule(fn: () => void): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 200 });
  else setTimeout(fn, 16);
}
